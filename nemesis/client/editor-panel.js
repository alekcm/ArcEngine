// editor-panel.js — the editor's Nemesis tab: the board in 3D plus the numbers that used to need a
// code change (the corridor door: frame, beam, the stencil on it, colours, the doorway lamps).
//
// Loaded by _utils/editor/index.html as a module (the Nemesis renderer is an ES module, the editor
// itself is classic scripts) and booted on DOMContentLoaded. The tab owns:
//   #nemesis-canvas  — a Scene3D over the full test ship, shown instead of the location view;
//   #nemesis-groups  — sliders built from the schema in client/tuning.js (labels EN/RU);
//   #nemesis-note    — what the sliders do, in the interface language.
// Every change rebuilds the ship in place; "Save" writes nemesis/client/tuning.json through the
// editor's own server (POST /api/save-tuning), and the game reads that file at boot.
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

const fmt = (v) => (typeof v === 'number' ? (Math.abs(v) >= 10 ? String(Math.round(v)) : v.toFixed(2)) : String(v));

const NemesisPanel = {
    scene: null,
    ship: null,
    view: null,
    active: false,
    saved: {},          // what is on disk — the baseline for the dirty mark
    rebuildTimer: 0,

    init() {
        this.note = document.getElementById('nemesis-note');
        this.groups = document.getElementById('nemesis-groups');
        this.status = document.getElementById('nemesis-status');
        this.canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('nemesis-canvas'));
        this.saveBtn = /** @type {HTMLButtonElement} */ (document.getElementById('btn-nemesis-save'));
        this.resetBtn = /** @type {HTMLButtonElement} */ (document.getElementById('btn-nemesis-reset'));
        if (!this.canvas || !this.groups) return;      // an older index.html: nothing to mount

        this.saveBtn.addEventListener('click', () => this.save());
        this.resetBtn.addEventListener('click', () => this.reset());
        document.getElementById('btn-nemesis-fit').addEventListener('click', () => this.fitAll());
        document.getElementById('btn-nemesis-door').addEventListener('click', () => this.focusDoor());
        window.addEventListener('pane-tab', (e) => this.onTab(/** @type {CustomEvent} */ (e).detail));
        window.addEventListener('lang-changed', () => { this.renderNote(); this.buildControls(); });
        window.addEventListener('resize', () => this.resize());
        addEventListener('keydown', (e) => this.onKey(e, true));
        addEventListener('keyup', (e) => this.onKey(e, false));
        window.addEventListener('blur', () => { if (this.scene) this.scene.setAlt(false); });

        this.load();                                    // what is saved on disk
        if (window.PaneTabs && PaneTabs.current === 'nemesis') this.onTab('nemesis');
    },

    // --- data ---------------------------------------------------------------------------------

    /** Read the saved values (the file the game takes at boot). */
    async load() {
        try {
            const j = await (await fetch('/api/tuning', { cache: 'no-store' })).json();
            this.saved = (j && j.values) || {};
        } catch { this.saved = {}; }
        TUNE.load(this.saved);
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
            this.scene = new Scene3D(this.canvas, { onHover: (id) => { this.canvas.style.cursor = id ? 'pointer' : ''; } });
            this.scene.gallery = true;                  // room names instead of ids
            this.scene.update(this.view, ROOM_TILES, INTRUDER_NAMES, []);
            this.scene.camera.alpha = -Math.PI / 2;
            this.scene.camera.beta = 0.85;
            this.scene.setActive(true);
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
            this.renderDirty();
        } else if (this.scene) {
            this.scene.setActive(false);                // the location view keeps the frame budget
        }
    },

    resize() {
        if (!this.active || !this.scene) return;
        this.scene.engine.resize();
    },

    rebuild() {
        if (!this.scene) return;
        this.scene.rebuild(this.view, ROOM_TILES, INTRUDER_NAMES, []);
        this.renderDirty();
    },

    rebuildSoon() {
        clearTimeout(this.rebuildTimer);
        this.rebuildTimer = setTimeout(() => this.rebuild(), 120);
    },

    // --- camera -------------------------------------------------------------------------------

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

    // --- controls -----------------------------------------------------------------------------

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
            const list = document.createElement('div');
            list.className = 'nem-fields';
            for (const it of g.items) list.appendChild(this.field(g.id + '.' + it.key, it));
            this.groups.appendChild(list);
        }
    },

    field(key, it) {
        const row = document.createElement('label');
        row.className = 'nem-field';
        const name = document.createElement('span');
        name.className = 'nem-name';
        name.textContent = I18N.pick(it.label);
        row.appendChild(name);

        if (typeof it.v === 'string') {
            const input = document.createElement('input');
            input.type = 'color';
            input.value = TUNE.color(key);
            input.addEventListener('input', () => { TUNE.set(key, input.value); this.rebuildSoon(); });
            row.appendChild(input);
        } else {
            const out = document.createElement('output');
            out.textContent = fmt(TUNE.get(key));
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

    renderDirty() {
        const dirty = JSON.stringify(TUNE.diff()) !== JSON.stringify(this.saved);
        this.saveBtn.disabled = !dirty;
        this.saveBtn.textContent = dirty ? I18N.t('nem.saveDirty') : I18N.t('nem.save');
        this.resetBtn.disabled = !dirty && Object.keys(this.saved).length === 0;
    },

    async save() {
        this.saveBtn.disabled = true;
        try {
            const r = await fetch('/api/save-tuning', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ values: TUNE.diff() }),
            });
            const j = await r.json().catch(() => ({}));
            if (!r.ok || j.ok === false) { this.say(I18N.t('nem.saveError', { msg: j.error || ('HTTP ' + r.status) }), true); return; }
            this.saved = TUNE.diff();
            this.renderDirty();
            this.say(I18N.t('nem.saved', { n: j.saved || 0 }));
        } catch (e) {
            this.say(I18N.t('nem.saveError', { msg: (e && e.message) || e }), true);
        } finally {
            this.renderDirty();
        }
    },

    async reset() {
        TUNE.reset();
        this.buildControls();
        this.rebuild();
        await this.save();                              // write the empty diff: the file is cleared
        this.say(I18N.t('nem.reverted'));
    },

    say(text, bad) {
        if (!this.status) return;
        this.status.textContent = text || '';
        this.status.classList.toggle('bad', !!bad);
    },

    // --- keys: Alt is the neon overlay, F fits the board, D flies to a door --------------------

    onKey(e, down) {
        if (!this.active) return;
        const t = /** @type {HTMLElement} */ (e.target);
        if (down && t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) {
            if (e.key !== 'Alt') return;                // typing in a slider: leave the keys alone
        }
        if (e.key === 'Alt') {
            e.preventDefault();
            if (this.scene) this.scene.setAlt(down);
            return;
        }
        if (!down || e.ctrlKey || e.metaKey) return;
        if (e.code === 'KeyF') this.fitAll();
        else if (e.code === 'KeyD') this.focusDoor();
    },
};

window.NemesisPanel = NemesisPanel;
NemesisPanel.init();
