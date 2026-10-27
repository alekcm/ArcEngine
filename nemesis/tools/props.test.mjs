// props.test.mjs — the 3D room furniture, built headlessly against a stub BABYLON.
// Guards the invariants the player actually sees: every tile builds, nothing stands outside the wall
// ring or sinks under the deck, and composed pieces (pod cradles, the containment rig, the crates on
// the painted storage squares) stay exactly where the rest of the client draws their neighbours.
import test from 'node:test';
import assert from 'node:assert/strict';

const WALL_R = 6.3;
const meshes = [];
let uid = 0;
class V3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    setAll(v) { this.x = this.y = this.z = v; return this; }
}
const material = (hex, emissive) => ({ hex, emissive, uniqueId: ++uid, dispose() {}, freeze() {} });
const mesh = (kind, opts) => {
    const m = {
        kind, opts, position: new V3(), rotation: new V3(), scaling: new V3(1, 1, 1), material: null,
        convertToFlatShadedMesh() { return this; }, dispose() {}, setEnabled() {}, isEnabled() { return true; },
    };
    meshes.push(m); return m;
};
const MeshBuilder = {
    CreateBox: (n, o) => mesh('box', o), CreateSphere: (n, o) => mesh('sphere', o),
    CreateCylinder: (n, o) => mesh('cyl', o), CreateTorus: (n, o) => mesh('torus', o),
    CreatePolyhedron: (n, o) => mesh('poly', o),
};
class TransformNode {
    constructor() { this.position = new V3(); this.rotation = new V3(); this.scaling = new V3(1, 1, 1); }
    dispose() {}
}
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
globalThis.document = { createElement: () => ({ getContext: () => null }) };
try { Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'node' }, configurable: true }); } catch { /* node already defines it */ }
globalThis.window = {
    BABYLON: {
        MeshBuilder, TransformNode, Vector3: V3, Mesh: { MergeMeshes: () => null },
        StandardMaterial: class { constructor() { this.uniqueId = ++uid; } dispose() {} freeze() {} },
        Color3: { FromHexString: () => ({ scale: () => ({}) }) }, Color4: class {},
    },
};

const { Scene3D } = await import('../client/scene3d.js');

// The method only needs the material cache, the shadow list and a merger; everything else is geometry.
const host = { scene: {}, shadows: { addShadowCaster() {} }, M: (hex, e) => material(hex, e), mergeStatic: (list) => list };
const TILES = ['archives', 'comms', 'emergency', 'evacA', 'evacB', 'fireControl', 'generator', 'laboratory', 'nest',
    'surgery', 'repository', 'airlock', 'armory', 'cafeteria', 'commandCenter', 'containment', 'contaminated', 'decon',
    'engineRoom', 'hatchControl', 'server', 'storage', 'cockpit', 'hibernatorium', 'engine'];
const build = (tile, exits = [0.6, 2.5], techAngle = 3.6) => {
    meshes.length = 0;
    Scene3D.prototype.buildFloor.call(host, tile, null);
    Scene3D.prototype.buildProps.call(host, tile, null, { exitAngles: exits, techAngle });
    return meshes.slice();
};

test('PR-01 every room tile builds its floor and props', () => {
    for (const tile of TILES) {
        for (const exits of [[0.6, 2.5], []]) {
            assert.doesNotThrow(() => build(tile, exits), `${tile} / exits ${exits.length}`);
        }
    }
});

test('PR-02 no prop stands outside the wall ring or under the deck', () => {
    for (const tile of TILES) {
        for (const m of build(tile)) {
            const { x, y, z } = m.position;
            assert.ok([x, y, z].every(Number.isFinite), `${tile}: non-finite position`);
            assert.ok(y > -0.01, `${tile}: ${m.kind} at y=${y.toFixed(2)} sinks under the deck`);
            assert.ok(Math.hypot(x, z) <= WALL_R - 0.1, `${tile}: ${m.kind} at r=${Math.hypot(x, z).toFixed(2)} is outside the room`);
        }
    }
});

test('PR-03 escape-pod cradles stand where syncPods draws the pods', () => {
    for (const tile of ['evacA', 'evacB']) {
        const plates = build(tile).filter(m => m.kind === 'box' && Math.abs(m.opts.width - 2.6) < 0.001 && Math.abs(m.opts.depth - 3.0) < 0.001);
        assert.equal(plates.length, 2, `${tile}: two cradles expected`);
        const spots = plates.map(p => [Math.round(p.position.x * 100) / 100, Math.round(p.position.z * 100) / 100]).sort((a, b) => a[0] - b[0]);
        assert.deepEqual(spots, [[-2.5, 1.05], [2.5, 1.05]], `${tile}: cradles must match the pod spots`);
    }
});

test('PR-04 containment rig is centred on the floor ring with mirrored posts', () => {
    const m = build('containment');
    const plates = m.filter(x => x.kind === 'box' && Math.abs(x.opts.width - 2.5) < 0.001 && Math.abs(x.opts.depth - 2.5) < 0.001);
    assert.ok(plates.length >= 2, 'base plate and lid frame');
    for (const p of plates) assert.ok(Math.abs(p.position.x) < 0.01 && Math.abs(p.position.z) < 0.01, 'plate must sit on the centre');
    const posts = m.filter(x => x.kind === 'box' && Math.abs(x.opts.height - 2.5) < 0.001 && Math.abs(x.opts.width - 0.18) < 0.001);
    assert.equal(posts.length, 4, 'four corner posts');
    const xs = posts.map(p => Math.round(p.position.x * 100) / 100).sort();
    assert.deepEqual(xs, [-1.15, -1.15, 1.15, 1.15], 'posts must be mirrored about the centre');
});

test('PR-05 storage crates stand inside the painted squares and outside them', () => {
    // the same rectangles buildFloor paints (x, z, w, d)
    const ZONES = [[-3.2, 2.4, 2.6, 2.2], [0.4, 3.0, 2.8, 1.8], [3.4, 0.6, 2.0, 2.6], [-3.6, -1.6, 2.2, 2.0], [-0.8, -3.6, 2.4, 1.6]];
    const crates = build('storage').filter(m => m.kind === 'box' && m.opts.width === m.opts.depth && m.opts.width >= 0.7 && m.opts.width <= 1.1);
    const inside = crates.filter(c => ZONES.some(([zx, zz, zw, zd]) =>
        Math.abs(c.position.x - zx) + c.opts.width / 2 <= zw / 2 + 0.001 && Math.abs(c.position.z - zz) + c.opts.width / 2 <= zd / 2 + 0.001));
    assert.ok(inside.length >= 6, `crates in the marked squares: ${inside.length}`);
    assert.ok(crates.length - inside.length >= 2, `crates outside the squares: ${crates.length - inside.length}`);
});
