// editor-panel.js — the editor's Nemesis tab: WORKING on the board, not just looking at it.
//
// Loaded by _utils/editor/index.html as an ES module (the Nemesis renderer is a module, the editor
// itself is classic scripts) and booted on DOMContentLoaded. The tab owns:
//   #nemesis-canvas  — a Scene3D of the whole test ship, shown instead of the location view;
//   #nemesis-part    — the selected part: position / rotation / scale, colour, hide, delete;
//   #nemesis-edits   — every edited part, one row each, with a revert;
//   #nemesis-groups  — the door sliders from the schema in client/tuning.js;
//   #nemesis-status  — what just happened.
//
// Editing: click a part in the 3D view to select it, drag the gizmo (1 — move, 2 — rotate, 3 —
// scale), Del — delete, colour picker — repaint, "Hide" — hide. Every change goes into
// scene.edits keyed by the part's stable id, "Save" writes nemesis/client/board-edits.json through
// the editor's own server, and the game applies the same file when it builds the board.
import { Scene3D } from './scene3d.js';
import { TUNE, SCHEMA } from './tuning.js';
import { ROOM_TILES, galleryShip } from '../shared/ship.mjs';
import { INTRUDER_NAMES } from '../shared/data/cards.mjs';

/** The gallery view: every room known and explored, no players, no intruders. */
function galleryView(ship) {
    const roomState = {};
    for (const r of Object.values(ship.rooms)) {
        roomState[r.id] = { tile: ship.galleryTiles[r.id], explored: true, fire: false, malfunction: false, objects: [], token: null };
    }
    return {
        ship, roomState, players: [], intruders: {}, fx: [], pods: [], podsUnlocked: true,
        nestEggs: 5, time: 15, selfDestruct: 0, destination: 'B', current: null, phase: 'gallery', lastShot: null,
    };
}

/** A stable string for a {key: value} map — the order of keys is not a change. */
function keyed(obj) {
    return JSON.stringify(Object.keys(obj || {}).sort().map(k => [k, obj[k]]));
}

const fmt = (v) => (typeof v === 'number' ? (Math.abs(v) >= 10 ? String(Math.round(v)) : v.toFixed(2)) : String(v));
const round = (v) => Math.round(v * 1000) / 1000;

const NemesisPanel = {
    scene: null,
    ship: null,
    view: null,
    active: false,
    gizmo: null,
    sel: null,              // the selected mesh
    selId: null,
    mode: 'move',
    saved: {},              // edits on disk — the baseline for the dirty mark
    edits: {},              // edits of the session
    rebuildTimer: 0,

    init() {
        this.note = document.getElementById('nemesis-note');
        this.groups = document.getElementById('nemesis-groups');
        this.part = document.getElementById('nemesis-part');
        this.editsHost = document.getElementById('nemesis-edits');
        this.findHost = document.getElementById('nemesis-find');
        this.status = document.getElementById('nemesis-status');
        this.canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('nemesis-canvas'));
        this.saveBtn = /** @type {HTMLButtonElement} */ (document.getElementById('btn-nemesis-save'));
        this.revertBtn = /** @type {HTMLButtonElement} */ (document.getElementById('btn-nemesis-revert'));
        if (!this.canvas || !this.groups) return;      // an older index.html: nothing to mount

        this.saveBtn.addEventListener('click', () => this.save());
        this.revertBtn.addEventListener('click', () => this.revertAll());
        document.getElementById('btn-nemesis-fit').addEventListener('click', () => this.fitAll());
        document.getElementById('btn-nemesis-door').addEventListener('click', () => this.focusDoor());
        for (const btn of document.querySelectorAll('#nemesis-modes [data-nes-mode]')) {
            btn.addEventListener('click', () => this.setMode(/** @type {HTMLElement} */ (btn).dataset.nesMode));
        }
        this.canvas.addEventListener('pointerdown', (e) => this.onPointerDown(e));
        window.addEventListener('pane-tab', (e) => this.onTab(/** @type {CustomEvent} */ (e).detail));
        window.addEventListener('lang-changed', () => { this.renderNote(); this.buildControls(); this.renderPart(); this.renderFind(); this.renderEdits(); this.renderDirty(); });
        window.addEventListener('resize', () => this.resize());
        addEventListener('keydown', (e) => this.onKey(e, true));
        addEventListener('keyup', (e) => this.onKey(e, false));
        window.addEventListener('blur', () => { if (this.scene) this.scene.setAlt(false); });

        this.load();                                    // the saved edits + the door sliders
        if (typeof PaneTabs !== 'undefined' && PaneTabs.current === 'nemesis') this.onTab('nemesis');
    },

    // --- data ---------------------------------------------------------------------------------

    async load() {
        try {
            const j = await (await fetch('/api/board', { cache: 'no-store' })).json();
            this.saved = (j && j.edits) || {};
        } catch { this.saved = {}; }
        this.edits = JSON.parse(JSON.stringify(this.saved));
        try {
            const t = await (await fetch('/api/tuning', { cache: 'no-store' })).json();
            TUNE.load((t && t.values) || {});
        } catch { /* defaults */ }
        this.buildControls();
        this.renderDirty();
    },

    // --- the scene ----------------------------------------------------------------------------

    ensureScene() {
        if (this.scene) return true;
        if (!window.BABYLON) { this.say(I18N.t('nem.nogl'), true); return false; }
        try {
            this.ship = galleryShip();
            this.view = galleryView(this.ship);
            this.scene = new Scene3D(this.canvas, {});
            this.scene.gallery = true;                  // room names instead of ids
            this.scene.setEdits(this.edits);
            this.scene.setEditMode(true);
            this.scene.update(this.view, ROOM_TILES, INTRUDER_NAMES, []);
            this.scene.camera.alpha = -Math.PI / 2;
            this.scene.camera.beta = 0.85;
            this.scene.setActive(true);
            // The board is the point; the gizmo is a convenience. If Babylon's gizmo API differs,
            // the parts are still selected, painted, hidden and deleted from the pane, and the
            // numbers move them — so a failure here must not dispose the scene.
            try {
                this.setupGizmo();
            } catch (e) {
                this.gizmo = null;
                console.warn('Nemesis: the gizmo is not available, the pane still edits parts', e);
                this.say(I18N.t('nem.noGizmo'), true);
            }
            this.resize();
            this.fitAll();
            return true;
        } catch (e) {
            console.error(e);
            this.say(I18N.t('nem.failed', { msg: (e && e.message) || e }), true);
            this.scene = null;
            return false;
        }
    },

    /** The gizmo of the Objects tab, on the board's scene: drag to move / rotate / scale a part.
     *  Everything here is looked up through `gm.gizmos`: Babylon 9's GizmoManager has no
     *  `positionGizmo` of its own, and one wrong property used to take the whole board down with it
     *  (the caller keeps the scene alive now, but the guards are still worth having). */
    setupGizmo() {
        const B = window.BABYLON;
        if (!B || !B.GizmoManager) { this.gizmo = null; return; }
        // the second argument is the thickness: the ship is ~100 units across, a default gizmo is
        // a hair at that distance (the gizmo keeps its own screen size, thickness is what helps)
        const gm = new B.GizmoManager(this.scene.scene, 1.6);
        gm.usePointerToAttachGizmos = false;
        gm.positionGizmoEnabled = true; gm.rotationGizmoEnabled = true; gm.scaleGizmoEnabled = true;
        const gz = gm.gizmos || {};
        for (const [name, g] of [['position', gz.positionGizmo], ['rotation', gz.rotationGizmo], ['scale', gz.scaleGizmo]]) {
            if (!g) continue;
            // Babylon logs a warning of its own for the scaling gizmo: it does not support this flag
            if (name !== 'scale') g.updateGizmoRotationToMatchAttachedMesh = false;
            // the board is flat: no plane handles, they only steal clicks from the part itself
            if (typeof g.planarGizmoEnabled === 'boolean') g.planarGizmoEnabled = false;
            // After a drag the part's own numbers are the truth: write them into the edit right away.
            for (const axis of [g.xGizmo, g.yGizmo, g.zGizmo, g.uniformScaleGizmo]) {
                const ob = axis && axis.dragBehavior && axis.dragBehavior.onDragEndObservable;
                if (ob && ob.add) ob.add(() => this.writeFromMesh());
            }
        }
        if (gm.onAttachedToMeshObservable && gm.onAttachedToMeshObservable.add) gm.onAttachedToMeshObservable.add(() => { });
        this.gizmo = gm;
        this.setMode(this.mode, true);
    },

    onTab(tab) {
        const on = tab === 'nemesis';
        this.active = on;
        document.body.classList.toggle('nemesis-tab', on);
        this.canvas.hidden = !on;
        if (on) {
            if (!this.ensureScene()) return;
            this.scene.setActive(true);
            this.resize();
            this.renderNote();
            this.buildControls();
            this.renderPart();
            this.renderFind();
            this.renderEdits();
            this.renderDirty();
        } else if (this.scene) {
            this.scene.setActive(false);
            if (this.gizmo) this.gizmo.attachToMesh(null);
        }
    },

    resize() {
        if (!this.active || !this.scene) return;
        this.scene.engine.resize();
    },

    rebuild() {
        if (!this.scene) return;
        this.scene.setEdits(this.edits);
        this.scene.rebuild(this.view, ROOM_TILES, INTRUDER_NAMES, []);
        const keep = this.selId;
        this.sel = null; this.selId = null;
        if (this.gizmo) this.gizmo.attachToMesh(null);
        if (keep) this.select(this.scene.editMeshes[keep] || null);
        this.renderFind();
        this.renderEdits();
        this.renderDirty();
    },

    rebuildSoon() {
        clearTimeout(this.rebuildTimer);
        this.rebuildTimer = setTimeout(() => this.rebuild(), 120);
    },

    // --- selection ----------------------------------------------------------------------------

    onPointerDown(e) {
        if (!this.scene || e.button !== 0) return;
        // a press on a gizmo handle is a drag, not a selection
        if (this.hoveringGizmo()) return;
        const r = this.canvas.getBoundingClientRect();
        const mesh = this.scene.pickMesh(e.clientX - r.left, e.clientY - r.top);
        // nothing under the cursor: say so, otherwise the tab looks broken
        if (!mesh) { this.say(I18N.t('nem.nothingThere')); return; }
        this.select(mesh);
    },

    select(mesh) {
        const B = window.BABYLON;
        // The outline answers "did the click do anything?": the part lights up in the view at once,
        // and the pane says what it is. At the board's scale a cable is thinner than a pixel, and
        // silence after a click reads as a dead editor.
        if (this.outline && this.outline !== mesh) { try { this.outline.renderOutline = false; } catch { /* disposed */ } }
        this.outline = null;
        this.sel = mesh || null;
        this.selId = mesh && mesh.metadata ? mesh.metadata.editId : null;
        if (mesh && B) {
            try {
                mesh.renderOutline = true;
                mesh.outlineColor = new B.Color3(0.25, 0.85, 1);
                mesh.outlineWidth = 0.08;
                this.outline = mesh;
            } catch { /* an odd mesh: the pane still shows it */ }
        }
        if (this.gizmo) this.gizmo.attachToMesh(this.sel);
        if (mesh) this.say(I18N.t('nem.picked', { name: mesh.name || '—', id: this.selId || '' }));
        this.renderPart();
    },

    /** The pointer is over a gizmo handle: that press is a drag, not a selection. */
    hoveringGizmo() {
        const g = this.gizmo && this.gizmo.gizmos;
        return !!(g && [g.positionGizmo, g.rotationGizmo, g.scaleGizmo].some(x => x && x.isHovered));
    },

    setMode(mode, quiet) {
        this.mode = ['move', 'rotate', 'scale'].includes(mode) ? mode : 'move';
        if (this.gizmo) {
            this.gizmo.positionGizmoEnabled = this.mode === 'move';
            this.gizmo.rotationGizmoEnabled = this.mode === 'rotate';
            this.gizmo.scaleGizmoEnabled = this.mode === 'scale';
        }
        for (const btn of document.querySelectorAll('#nemesis-modes [data-nes-mode]')) {
            btn.classList.toggle('active', /** @type {HTMLElement} */ (btn).dataset.nesMode === this.mode);
        }
        if (!quiet) this.say('');
    },

    // --- the selected part --------------------------------------------------------------------

    renderPart() {
        const host = this.part;
        if (!host) return;
        host.innerHTML = '';
        const m = this.sel;
        if (!m) {
            host.appendChild(el('div', 'nem-empty', I18N.t('nem.noSelection')));
            return;
        }
        const id = m.metadata.editId;
        const head = el('div', 'props-section', I18N.t('nem.part'));
        host.appendChild(head);
        const info = el('div', 'nem-partinfo');
        info.appendChild(el('code', '', id));
        info.appendChild(el('span', 'nem-partname', m.name || '—'));
        host.appendChild(info);

        const edit = this.edits[id] || {};
        const row = (label, values, step, onSet) => {
            const wrap = el('div', 'nem-vec');
            wrap.appendChild(el('span', 'nem-name', label));
            for (let i = 0; i < 3; i++) {
                const input = /** @type {HTMLInputElement} */ (document.createElement('input'));
                input.type = 'number'; input.step = String(step);
                input.value = String(round(values[i]));
                input.addEventListener('change', () => {
                    const v = [0, 0, 0];
                    for (let k = 0; k < 3; k++) v[k] = Number(/** @type {HTMLInputElement} */ (wrap.children[k + 1]).value) || 0;
                    onSet(v);
                });
                wrap.appendChild(input);
            }
            return wrap;
        };
        host.appendChild(row('XYZ', [m.position.x, m.position.y, m.position.z], 0.05, (v) => this.patch(id, { pos: v })));
        host.appendChild(row('↻', [m.rotation.x, m.rotation.y, m.rotation.z], 0.1, (v) => this.patch(id, { rot: v })));
        host.appendChild(row('⤢', [m.scaling.x, m.scaling.y, m.scaling.z], 0.05, (v) => this.patch(id, { scale: v })));

        // colour: the part repaints with the kit's flat material of that colour
        const colorRow = el('label', 'nem-color');
        colorRow.appendChild(el('span', 'nem-name', I18N.t('nem.color')));
        const color = /** @type {HTMLInputElement} */ (document.createElement('input'));
        color.type = 'color';
        color.value = /^#[0-9a-f]{6}$/i.test(edit.color || '') ? edit.color : hexOf(m);
        color.addEventListener('input', () => this.patch(id, { color: color.value }));
        colorRow.appendChild(color);
        host.appendChild(colorRow);

        const tools = el('div', 'nem-tools');
        tools.appendChild(button(I18N.t(edit.hidden ? 'nem.unhide' : 'nem.hide'), () => {
            this.patch(id, edit.hidden ? { hidden: null } : { hidden: true });
        }));
        tools.appendChild(button(I18N.t(edit.deleted ? 'nem.undelete' : 'nem.delete'), () => {
            this.patch(id, edit.deleted ? { deleted: null } : { deleted: true });
        }));
        tools.appendChild(button(I18N.t('nem.resetPart'), () => {
            delete this.edits[id];
            m.metadata.deleted = false;
            this.scene.rebuild(this.view, ROOM_TILES, INTRUDER_NAMES, []);
            this.select(this.scene.editMeshes[id] || null);
            this.renderEdits(); this.renderDirty();
        }));
        host.appendChild(tools);
    },

    /** One change on the selected part: remember it, apply it, redraw. */
    patch(id, patch) {
        this.scene.setEdit(id, patch);
        this.edits = this.scene.edits;             // one map for the scene and the panel
        if (patch.deleted || patch.hidden) { /* the mesh is gone from the view: drop the gizmo */ this.gizmo && this.gizmo.attachToMesh(null); }
        this.sel = this.scene.editMeshes[id] || this.sel;
        this.renderPart();
        this.renderEdits();
        this.renderDirty();
    },

    /** After a gizmo drag the mesh itself is the truth — copy its transform into the edit. */
    writeFromMesh() {
        const m = this.sel;
        if (!m || !m.metadata) return;
        this.patch(m.metadata.editId, {
            pos: [m.position.x, m.position.y, m.position.z],
            rot: [m.rotation.x, m.rotation.y, m.rotation.z],
            scale: [m.scaling.x, m.scaling.y, m.scaling.z],
        });
    },

    // --- the list of edits --------------------------------------------------------------------

    renderEdits() {
        const host = this.editsHost;
        if (!host) return;
        host.innerHTML = '';
        const ids = Object.keys(this.edits).sort();
        host.appendChild(el('div', 'props-section', I18N.t('nem.edits') + ' · ' + ids.length));
        if (!ids.length) { host.appendChild(el('div', 'nem-empty', I18N.t('nem.noEdits'))); return; }
        for (const id of ids) {
            const e = this.edits[id];
            const rowEl = el('div', 'nem-editrow');
            const name = /** @type {HTMLElement} */ (document.createElement('button'));
            name.className = 'nem-editname';
            name.textContent = id;
            name.title = e.deleted ? 'deleted' : e.hidden ? 'hidden' : e.color || 'moved';
            name.addEventListener('click', () => {
                const mesh = this.scene && this.scene.editMeshes[id];
                if (mesh) this.select(mesh);
            });
            rowEl.appendChild(name);
            const undo = /** @type {HTMLElement} */ (document.createElement('button'));
            undo.className = 'nem-editrevert';
            undo.textContent = '↺';
            undo.title = I18N.t('nem.resetPart');
            undo.addEventListener('click', () => {
                delete this.edits[id];
                this.scene.setEdit(id, null);
                this.rebuild();
            });
            rowEl.appendChild(undo);
            host.appendChild(rowEl);
        }
    },

    // --- find a part without pixel-hunting -----------------------------------------------------
    // Clicking a cable that is thinner than a pixel is a lottery, so the same parts are reachable
    // from a list: pick a room (or a corridor, or the hull), then the name of the part; the same
    // row again takes the next part of that name.
    renderFind() {
        const host = this.findHost;
        if (!host) return;
        host.innerHTML = '';
        if (!this.scene) return;
        const ids = Object.keys(this.scene.editMeshes);
        if (!ids.length) return;
        host.appendChild(el('div', 'props-section', I18N.t('nem.find')));
        host.appendChild(el('div', 'nem-hint', I18N.t('nem.findHint')));
        const owners = [...new Set(ids.map(id => id.split('#')[0]))].sort();
        const owner = owners.includes(this.findOwner) ? this.findOwner : owners[0];
        this.findOwner = owner;
        const sel = document.createElement('select');
        sel.className = 'nem-select';
        for (const o of owners) {
            const opt = document.createElement('option');
            opt.value = o;
            opt.textContent = o + ' · ' + ids.filter(id => id.startsWith(o + '#')).length;
            if (o === owner) opt.selected = true;
            sel.appendChild(opt);
        }
        sel.addEventListener('change', () => { this.findOwner = sel.value; this.findName = null; this.findAt = 0; this.renderFind(); });
        host.appendChild(sel);
        const mine = ids.filter(id => id.startsWith(owner + '#'));
        const byName = new Map();
        for (const id of mine) {
            const nm = this.scene.editMeshes[id].name || '—';
            if (!byName.has(nm)) byName.set(nm, []);
            byName.get(nm).push(id);
        }
        const list = el('div', 'nem-findlist');
        for (const [nm, group] of [...byName.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))) {
            const b = /** @type {HTMLElement} */ (document.createElement('button'));
            b.className = 'nem-findrow';
            b.textContent = nm + ' ×' + group.length;
            b.title = group[0];
            b.addEventListener('click', () => {
                this.findAt = nm === this.findName ? (this.findAt + 1) % group.length : 0;
                this.findName = nm;
                this.select(this.scene.editMeshes[group[this.findAt]] || null);
            });
            list.appendChild(b);
        }
        host.appendChild(list);
    },

    // --- saving -------------------------------------------------------------------------------

    renderDirty() {
        const dirty = keyed(this.edits) !== keyed(this.saved);
        if (this.saveBtn) {
            this.saveBtn.disabled = !dirty;
            this.saveBtn.textContent = dirty ? I18N.t('nem.saveDirty') : I18N.t('nem.save');
        }
        if (this.revertBtn) this.revertBtn.disabled = !Object.keys(this.saved).length;
    },

    async save() {
        if (this.saveBtn) this.saveBtn.disabled = true;
        try {
            const r = await fetch('/api/save-board', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ edits: this.edits }),
            });
            const j = await r.json().catch(() => ({}));
            if (!r.ok || j.ok === false) { this.say(I18N.t('nem.saveError', { msg: j.error || ('HTTP ' + r.status) }), true); return; }
            this.saved = JSON.parse(JSON.stringify(this.edits));
            this.renderDirty();
            this.say(I18N.t('nem.savedEdits', { n: j.saved || 0 }));
        } catch (e) {
            this.say(I18N.t('nem.saveError', { msg: (e && e.message) || e }), true);
        } finally {
            this.renderDirty();
        }
    },

    async revertAll() {
        this.edits = {};
        this.saved = {};
        this.rebuild();
        await this.save();
        this.say(I18N.t('nem.revertedAll'));
    },

    // --- the door sliders ---------------------------------------------------------------------

    renderNote() {
        if (this.note) this.note.textContent = I18N.t('nem.note');
    },

    buildControls() {
        if (!this.groups) return;
        this.groups.innerHTML = '';
        for (const g of SCHEMA) {
            const box = document.createElement('div');
            box.className = 'props-section';
            box.textContent = I18N.pick(g.title);
            this.groups.appendChild(box);
            for (const it of g.items) this.groups.appendChild(this.field(g.id + '.' + it.key, it));
        }
    },

    field(key, it) {
        const row = document.createElement('label');
        row.className = 'nem-field';
        row.appendChild(el('span', 'nem-name', I18N.pick(it.label)));
        if (typeof it.v === 'string') {
            const input = document.createElement('input');
            input.type = 'color'; input.value = TUNE.color(key);
            input.addEventListener('input', () => { TUNE.set(key, input.value); this.rebuildSoon(); });
            row.appendChild(input);
        } else {
            const out = el('output', '', fmt(TUNE.get(key)));
            const range = document.createElement('input');
            range.type = 'range';
            range.min = String(it.min); range.max = String(it.max); range.step = String(it.step);
            range.value = String(TUNE.get(key));
            range.addEventListener('input', () => { TUNE.set(key, Number(range.value)); out.textContent = fmt(TUNE.get(key)); this.rebuildSoon(); });
            row.appendChild(out);
            row.appendChild(range);
        }
        return row;
    },

    // --- camera and keys ----------------------------------------------------------------------

    fitAll() {
        if (!this.scene) return;
        const b = this.ship.bounds;
        const w = (b.maxX - b.minX) * 0.1, h = (b.maxY - b.minY) * 0.1;
        this.scene.flyTo(new (window.BABYLON.Vector3)(0, 0, 0), Math.max(110, Math.max(w, h) * 1.3));
    },

    focusDoor() {
        if (!this.scene) return;
        const n = Object.values(this.scene.corridorNodes).find(c => c.door);
        if (!n) return;
        const p = n.door.getAbsolutePosition();
        this.scene.flyTo(new (window.BABYLON.Vector3)(p.x, 1.4, p.z), 26);
    },

    onKey(e, down) {
        if (!this.active) return;
        const t = /** @type {HTMLElement} */ (e.target);
        const typing = t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable);
        if (e.key === 'Alt') { e.preventDefault(); if (this.scene) this.scene.setAlt(down); return; }
        if (!down || e.ctrlKey || e.metaKey || typing) return;
        if (e.code === 'Digit1') this.setMode('move');
        else if (e.code === 'Digit2') this.setMode('rotate');
        else if (e.code === 'Digit3') this.setMode('scale');
        else if (e.code === 'KeyF') this.fitAll();
        else if (e.code === 'KeyD') this.focusDoor();
        else if (e.code === 'Escape') this.select(null);
        else if ((e.code === 'Delete' || e.code === 'Backspace') && this.selId) {
            e.preventDefault();
            const e0 = this.edits[this.selId] || {};
            this.patch(this.selId, e0.deleted ? { deleted: null } : { deleted: true });
        }
    },

    say(text, bad) {
        if (!this.status) return;
        this.status.textContent = text || '';
        this.status.classList.toggle('bad', !!bad);
    },
};

// --- tiny DOM helpers -------------------------------------------------------------------------

function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
}
function button(text, onClick) {
    const b = document.createElement('button');
    b.textContent = text;
    b.addEventListener('click', onClick);
    return b;
}
/** The colour a part currently has, for the picker's first value. */
function hexOf(mesh) {
    const c = mesh && mesh.material && mesh.material.diffuseColor;
    if (!c) return '#8c96a0';
    const h = (v) => Math.max(0, Math.min(255, Math.round(v * 255))).toString(16).padStart(2, '0');
    return '#' + h(c.r) + h(c.g) + h(c.b);
}

window.NemesisPanel = NemesisPanel;
NemesisPanel.init();
