// fire.test.mjs — the room fire, built headlessly against a stub BABYLON.
//
// The fire used to add a PointLight per burning room on every state update. Every material in the
// scene is shared and frozen, so a changing light count invalidated them all at once and the board
// washed out white the moment a fire appeared or the fire post put one out. These checks keep the
// light count constant and the flames inside the room.
import test from 'node:test';
import assert from 'node:assert/strict';

const WALL_R = 6.3;
const ZONE_R = 2.5, ZONE_C = { x: 2.1, z: -2.1 };   // figures stand here: the fire must not cover them
let meshes = [], lights = 0, uid = 0;

class V3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    setAll(v) { this.x = this.y = this.z = v; return this; }
}
const node = (kind) => ({
    kind, name: kind, position: new V3(), rotation: new V3(), scaling: new V3(1, 1, 1), children: [],
    parent: null, metadata: null, visibility: 1, disposed: false, material: null,
    convertToFlatShadedMesh() { return this; }, setEnabled() {}, isEnabled() { return true; },
    getChildMeshes(out = []) { for (const c of this.children) { if (c.kind !== 'transform') out.push(c); if (c.getChildMeshes) c.getChildMeshes(out); } return out; },
    dispose() { this.disposed = true; if (this.parent) { const i = this.parent.children.indexOf(this); if (i >= 0) this.parent.children.splice(i, 1); } for (const c of this.children.slice()) c.dispose(); },
});
const mesh = (kind, opts) => { const m = node(kind); m.opts = opts || {}; meshes.push(m); return m; };
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
globalThis.document = { createElement: () => ({ getContext: () => null }) };
try { Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'node' }, configurable: true }); } catch { /* already defined */ }
globalThis.window = {
    BABYLON: {
        MeshBuilder: {
            CreateBox: (n, o) => mesh('box', o), CreateSphere: (n, o) => mesh('sphere', o),
            CreateCylinder: (n, o) => mesh('cyl', o), CreateTorus: (n, o) => mesh('torus', o),
            CreatePolyhedron: (n, o) => mesh('poly', o), CreateDisc: (n, o) => mesh('disc', o),
        },
        TransformNode: class { constructor() { const n = node('transform'); this.children = n.children; Object.assign(this, n); this.dispose = n.dispose.bind(this); } },
        Vector3: V3,
        // A light in the scene is exactly what must never happen while the game is running.
        PointLight: class { constructor() { lights++; } },
        StandardMaterial: class { constructor() { this.uniqueId = ++uid; } dispose() {} freeze() {} },
        Color3: { FromHexString: () => ({ scale: () => ({}) }) }, Color4: class {},
    },
};

const { Scene3D } = await import('../client/scene3d.js');

const host = {
    scene: {}, shadows: { addShadowCaster() {} },
    M: (hex, e, extra) => ({ hex, emissive: e, alpha: extra && extra.alpha, uniqueId: ++uid }),
};
/** A room node as buildRoomBase leaves it: a bare root waiting for its fire. */
function roomNode(id) {
    const root = node('transform');
    return { root, data: { id }, sel: { setEnabled() {} } };
}
const fire = (n) => { meshes = []; lights = 0; Scene3D.prototype.syncFire.call(host, n, true); return n.fireParts || []; };
const out = (n) => { Scene3D.prototype.syncFire.call(host, n, false); };

test('FR-01 the fire is meshes only: no lights are ever created', () => {
    const n = roomNode('007');
    const parts = fire(n);
    assert.ok(parts.length >= 20, 'a full fire: flames, embers and smoke (' + parts.length + ' parts)');
    assert.equal(lights, 0, 'no PointLight — a changing light count washes the frozen materials out');
    assert.equal(meshes.length, parts.length, 'every fire mesh is tracked for the animation');
    out(n);
});

test('FR-02 fire is rebuilt only when it starts or stops', () => {
    const n = roomNode('008');
    Scene3D.prototype.syncFire.call(host, n, false);
    assert.equal(n.fireOn, false);
    assert.equal(n.fireParts.length, 0, 'a room that is not on fire has no fire meshes');

    fire(n);
    const first = n.fireParts.slice();
    Scene3D.prototype.syncFire.call(host, n, true);           // every state update calls this
    assert.deepEqual(n.fireParts, first, 'a second update does not rebuild the fire');
    assert.ok(n.fireRoot && !n.fireRoot.disposed, 'the fire root stays alive');

    out(n);
    assert.ok(!n.fireRoot, 'putting the fire out disposes the fire root');
    assert.equal(n.fireParts.length, 0, 'and forgets its meshes');
    assert.equal(lights, 0);
});

test('FR-03 nothing burns outside the room and none of it covers the figures', () => {
    const n = roomNode('009');
    fire(n);
    assert.ok(n.fireRoot, 'the fire is parented to the room root');
    for (const m of n.fireParts) {
        const r = Math.hypot(m.position.x, m.position.z);
        const half = (m.opts.diameterBottom || m.opts.diameter || m.opts.width || 0) / 2;
        assert.ok(r + half <= WALL_R - 0.5, 'inside the walls: ' + m.kind + ' at r=' + r.toFixed(2));
        assert.ok(m.position.y >= 0.15, 'never under the deck: y=' + m.position.y.toFixed(2));
        assert.ok(m.position.y <= 5.4, 'and below the ceiling: y=' + m.position.y.toFixed(2));
        if (m.opts.diameterBottom && m.opts.diameterTop === 0) {
            const d = Math.hypot(m.position.x - ZONE_C.x, m.position.z - ZONE_C.z);
            assert.ok(d > ZONE_R - 1.0, 'a flame may lean over the standing zone but not sit in it: d=' + d.toFixed(2));
        }
    }
    out(n);
});

test('FR-04 the flames carry their own animation data', () => {
    const n = roomNode('010');
    fire(n);
    const flames = n.fireParts.filter(p => p.metadata && p.metadata.fire === 'flame');
    const embers = n.fireParts.filter(p => p.metadata && p.metadata.fire === 'ember');
    const smoke = n.fireParts.filter(p => p.metadata && p.metadata.fire === 'smoke');
    assert.ok(flames.length >= 15, 'a good number of flames: ' + flames.length);
    assert.ok(embers.length >= 4, 'embers rising: ' + embers.length);
    assert.ok(smoke.length >= 3, 'smoke above: ' + smoke.length);
    for (const f of flames) assert.equal(typeof f.metadata.phase, 'number', 'every flame flickers on its own phase');
    for (const e of embers) assert.equal(typeof e.metadata.y0, 'number', 'embers know where they start');
    assert.ok(n.fireParts.every(p => p.material && p.material.uniqueId), 'every part has a material');
    out(n);
});
