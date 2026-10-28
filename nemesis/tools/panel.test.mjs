// panel.test.mjs — the Nemesis tab's gizmo, checked against the shape of the Babylon API that the
// repo actually ships (libs/babylon.js, v9.26): GizmoManager has NO `positionGizmo` of its own, the
// gizmos live in `gm.gizmos.*`. A single wrong property there used to throw before the board was
// shown, so the tab reported "Cannot set properties of undefined (setting 'planarGizmoEnabled')"
// and the user got no board at all.   node --test nemesis/tools/panel.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// scene3d.js (imported by the panel) wants the browser globals at load time
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
/** A DOM node as far as the pane builders use one: children, class, text, handlers. */
const node = (tag = 'div') => ({
    tag, className: '', textContent: '', title: '', value: '', selected: false, disabled: false,
    hidden: false, innerHTML: '', style: {}, children: [], handlers: {},
    appendChild(c) { this.children.push(c); return c; },
    addEventListener(name, fn) { (this.handlers[name] = this.handlers[name] || []).push(fn); },
    fire(name) { for (const fn of this.handlers[name] || []) fn(); },
    set innerHTMLValue(v) { this.innerHTMLValue = v; },
});
globalThis.document = {
    getElementById: () => null, createElement: (tag) => node(tag),
    querySelectorAll: () => [], body: { classList: { toggle() {} } },
};
try { Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'node' }, configurable: true }); } catch { /* defined */ }
globalThis.addEventListener = () => {};
globalThis.window = globalThis;
globalThis.I18N = { t: (k) => k };
window.BABYLON = {};                   // the panel reads it lazily; no engine is built in these tests

const { default: _ignored } = { default: null };
const panelMod = await import('../client/editor-panel.js');
const NemesisPanel = globalThis.window.NemesisPanel || (await import('../client/editor-panel.js')).default;
const panel = globalThis.NemesisPanel;
assert.ok(panel, 'the panel registers itself on window');
void panelMod; void NemesisPanel;

const SRC = fs.readFileSync(new URL('../client/editor-panel.js', import.meta.url), 'utf8');

/** Babylon's own Observable, as far as the panel uses it. */
const observable = () => ({
    handlers: [],
    add(fn) { this.handlers.push(fn); return this; },
    notify(v) { for (const fn of this.handlers) fn(v); },
});
const axisGizmo = () => ({ isHovered: false, dragBehavior: { onDragEndObservable: observable() } });
const dragGizmo = (extra) => {
    const g = Object.assign({
        planarGizmoEnabled: true, updateGizmoRotationToMatchAttachedMesh: true, attachedMesh: null,
        xGizmo: axisGizmo(), yGizmo: axisGizmo(), zGizmo: axisGizmo(),
    }, extra || {});
    // Babylon's drag gizmos report the hover of their axes (get isHovered)
    Object.defineProperty(g, 'isHovered', { get() { return [g.xGizmo, g.yGizmo, g.zGizmo].some(a => a.isHovered); } });
    return g;
};

/** A GizmoManager shaped like libs/babylon.js 9.26: gizmos under `.gizmos`, nothing on the manager. */
class GizmoManager {
    constructor(scene, thickness) {
        this.scene = scene; this.thickness = thickness;
        this.gizmos = { positionGizmo: null, rotationGizmo: null, scaleGizmo: null, boundingBoxGizmo: null };
        this.onAttachedToMeshObservable = observable();
        this.usePointerToAttachGizmos = true;
        this.attached = null;
        GizmoManager.last = this;
    }
    set positionGizmoEnabled(v) { if (v && !this.gizmos.positionGizmo) this.gizmos.positionGizmo = dragGizmo(); }
    set rotationGizmoEnabled(v) { if (v && !this.gizmos.rotationGizmo) this.gizmos.rotationGizmo = dragGizmo(); }
    set scaleGizmoEnabled(v) { if (v && !this.gizmos.scaleGizmo) this.gizmos.scaleGizmo = dragGizmo({ uniformScaleGizmo: axisGizmo() }); }
    attachToMesh(m) { this.attached = m; for (const g of Object.values(this.gizmos)) if (g) g.attachedMesh = m; }
}

function withGizmo(fn) {
    const backup = window.BABYLON;
    window.BABYLON = { GizmoManager, Color3: class { constructor(r, g, b) { this.r = r; this.g = g; this.b = b; } } };
    try { return fn(); } finally { window.BABYLON = backup; }
}

test('PA-01: свет гизмо поднимается на менеджере без positionGizmo (как в Babylon 9)', () => {
    assert.equal(/gm\.positionGizmo\b/.test(SRC), false, 'менеджер не отдаёт positionGizmo — только gm.gizmos.positionGizmo');
    assert.equal(/\.\s*positionGizmo\.planarGizmoEnabled/.test(SRC), false, 'плоскости выключаются у gizmos.positionGizmo');
    const panel = globalThis.NemesisPanel;
    panel.scene = { scene: { name: 'board' } };
    panel.mode = 'move';
    withGizmo(() => panel.setupGizmo());
    const gm = GizmoManager.last;
    assert.ok(panel.gizmo === gm, 'гизмо принято панелью');
    assert.equal(gm.thickness, 1.6, 'толщина передана: корабль большой, тонкое гизмо не ухватить');
    assert.equal(gm.usePointerToAttachGizmos, false, 'выбор — по клику панели, а не гизмо');
    const pg = gm.gizmos.positionGizmo, rg = gm.gizmos.rotationGizmo, sg = gm.gizmos.scaleGizmo;
    for (const g of [pg, rg, sg]) {
        assert.ok(g, 'все три гизмо созданы');
        assert.equal(g.planarGizmoEnabled, false, 'плоскости выключены: доска плоская');
    }
    for (const g of [pg, rg]) {
        assert.equal(g.updateGizmoRotationToMatchAttachedMesh, false, 'оси — мировые, а не по детали');
    }
    // Babylon 9 сам пишет в лог, что масштабному гизмо этот флаг не поддерживается
    assert.equal(sg.updateGizmoRotationToMatchAttachedMesh, true, 'масштабный гизмо не трогаем');
    const handlers = [pg.xGizmo, pg.yGizmo, pg.zGizmo, rg.xGizmo, rg.yGizmo, rg.zGizmo,
        sg.xGizmo, sg.yGizmo, sg.zGizmo, sg.uniformScaleGizmo]
        .reduce((n, a) => n + a.dragBehavior.onDragEndObservable.handlers.length, 0);
    assert.equal(handlers, 10, 'у каждой оси (и у равномерного масштаба) записан конец перетаскивания');
});

test('PA-02: перетаскивание пишет координаты детали в правку', () => {
    const panel = globalThis.NemesisPanel;
    panel.scene = { scene: {} };
    withGizmo(() => panel.setupGizmo());
    const written = [];
    const backupPatch = panel.patch;
    panel.patch = (id, p) => written.push([id, p]);
    try {
        panel.sel = { metadata: { editId: 'room:101#4' }, position: { x: 1, y: 2, z: 3 }, rotation: { x: 0, y: 0, z: 0 }, scaling: { x: 1, y: 1, z: 1 } };
        GizmoManager.last.gizmos.positionGizmo.xGizmo.dragBehavior.onDragEndObservable.notify();
    } finally { panel.patch = backupPatch; }
    assert.deepEqual(written, [['room:101#4', { pos: [1, 2, 3], rot: [0, 0, 0], scale: [1, 1, 1] }]]);
});

test('PA-03: выбранная деталь обводится и прикрепляется к гизмо', () => {
    const panel = globalThis.NemesisPanel;
    panel.scene = { scene: {} };
    withGizmo(() => panel.setupGizmo());
    const gm = GizmoManager.last;
    const a = { name: 'post', metadata: { editId: 'cor:001-002#43' } };
    const b = { name: 'ft', metadata: { editId: 'room:101#1' } };
    withGizmo(() => panel.select(a));           // the outline uses BABYLON.Color3, like the browser
    assert.equal(a.renderOutline, true, 'деталь подсвечена — видно, что клик сработал');
    assert.equal(gm.attached, a);
    withGizmo(() => panel.select(b));
    assert.equal(a.renderOutline, false, 'прошлая подсветка снята');
    assert.equal(b.renderOutline, true);
    assert.equal(panel.selId, 'room:101#1');
});

test('PA-04: гизмо под курсором — это перетаскивание, а не новый выбор', () => {
    const panel = globalThis.NemesisPanel;
    panel.scene = { scene: {} };
    panel.gizmo = null;
    assert.equal(panel.hoveringGizmo(), false, 'без гизмо ничего не наведено');
    withGizmo(() => panel.setupGizmo());
    const pg = GizmoManager.last.gizmos.positionGizmo;
    assert.equal(panel.hoveringGizmo(), false);
    pg.yGizmo.isHovered = true;
    assert.equal(panel.hoveringGizmo(), true);
    pg.yGizmo.isHovered = false;
});

test('PA-06: список «Найти деталь» даёт любую деталь без прицеливания', () => {
    const panel = globalThis.NemesisPanel;
    const ids = { 'room:101#0': { name: 'ft' }, 'room:101#1': { name: 'ft' }, 'room:101#2': { name: 'w' }, 'hull#0': { name: 'hp' } };
    panel.scene = { editMeshes: ids, setEdit() {}, rebuild() {} };
    panel.findHost = node('div');
    panel.findOwner = 'room:101';
    panel.edits = {}; panel.saved = {};
    panel.renderFind();
    const [title, hint, select, list] = panel.findHost.children;
    assert.equal(title.textContent, 'nem.find');
    assert.equal(hint.classList || hint.className, 'nem-hint');
    assert.equal(select.children.length, 2, 'владельцы: room:101 и hull');
    assert.deepEqual(select.children.map(o => o.value), ['hull', 'room:101']);
    assert.equal(select.children[1].selected, true, 'текущий владелец выбран');
    const rows = list.children;
    assert.deepEqual(rows.map(r => r.textContent), ['ft ×2', 'w ×1'], 'детали по именам с количеством');
    // одно нажатие — первая ft, второе нажатие по тому же имени — следующая
    const picked = [];
    const backupSelect = panel.select;
    panel.select = (m) => picked.push(m && m.metadata ? m.metadata.editId : null);
    try {
        for (const m of Object.entries(ids)) m[1].metadata = { editId: m[0] };
        rows[0].fire('click');
        rows[0].fire('click');
        rows[0].fire('click');
    } finally { panel.select = backupSelect; }
    assert.deepEqual(picked, ['room:101#0', 'room:101#1', 'room:101#0'], 'перебор по кругу');
});

test('PA-05: сломанное гизмо не уносит с собой доску', () => {
    // ensureScene() строит доску, и только потом поднимает гизмо — в собственном try/catch
    const at = SRC.indexOf('this.setupGizmo();');
    assert.ok(at > 0, 'гизмо поднимается в ensureScene');
    const around = SRC.slice(Math.max(0, at - 700), at + 500);
    assert.match(around, /try\s*\{\s*this\.setupGizmo\(\)/, 'вызов обёрнут в try');
    assert.match(around, /catch\s*\(e\)/, 'и с catch');
    assert.match(around, /nem\.noGizmo/, 'пользователю сказано, что гизмо нет');
    assert.match(around, /return true;/, 'доска всё равно возвращается как построенная');
});
