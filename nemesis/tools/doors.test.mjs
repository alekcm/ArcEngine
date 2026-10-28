// doors.test.mjs — the corridor doors, built headlessly against a stub BABYLON.
//   node --test nemesis/tools/doors.test.mjs
// The corridor number used to live on a billboard floating 2.2 units off to the side, 2.75 units up,
// in a small font — in play nobody could read it without zooming onto the door. The door is now a
// wide bulkhead portal standing on its own slab, with a number board on the beam: the numbers are
// printed on it all the time and holding Alt turns it into neon signage. These checks keep the
// numbers on the frame, keep the board out of the walkway and keep the panel clear of the posts.
import test from 'node:test';
import assert from 'node:assert/strict';

const meshes = [];
let uid = 0;
class V3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    setAll(v) { this.x = this.y = this.z = v; return this; }
    clone() { return new V3(this.x, this.y, this.z); }
    addInPlace(o) { this.x += o.x; this.y += o.y; this.z += o.z; return this; }
    add(o) { return new V3(this.x + o.x, this.y + o.y, this.z + o.z); }
    subtract(o) { return new V3(this.x - o.x, this.y - o.y, this.z - o.z); }
    scale(k) { return new V3(this.x * k, this.y * k, this.z * k); }
    length() { return Math.hypot(this.x, this.y, this.z); }
    normalize() { const l = this.length() || 1; return new V3(this.x / l, this.y / l, this.z / l); }
}
const mat = (hex, emissive) => ({ hex, emissive, uniqueId: ++uid, alpha: 1, scale: null, dispose() {}, freeze() {}, unfreeze() {} });
const allNodes = [];
const node = (name) => ({ name, position: new V3(), rotation: new V3(), scaling: new V3(1, 1, 1), parent: null,
    dispose() {}, setEnabled() {}, isEnabled() { return true; }, computeWorldMatrix() {}, bakeCurrentTransformIntoVertices() {} });
const mesh = (name, opts) => {
    const m = Object.assign(node(name), { opts: opts || {}, material: null, isPickable: true,
        convertToFlatShadedMesh() { return this; } });
    meshes.push(m); return m;
};
/** A 2D context stub that records what the number board actually paints. */
function makeCtx(rec) {
    const state = { fillStyle: '#000', strokeStyle: '#000', shadowBlur: 0, font: '', textAlign: '', textBaseline: '', lineWidth: 1 };
    const ctx = {
        clearRect() { rec.length = 0; },
        beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, quadraticCurveTo() {},
        fill() {}, stroke() {},
        measureText(t) { return { width: String(t).length * 34 }; },
        fillText(t, x, y) {
            const px = /(\d+)px/.exec(state.font);
            rec.push({ text: String(t), fill: state.fillStyle, blur: state.shadowBlur, size: px ? Number(px[1]) : 0, x, y });
        },
    };
    for (const k of Object.keys(state)) {
        Object.defineProperty(ctx, k, { get: () => state[k], set: v => { state[k] = v; } });
    }
    return ctx;
}
class DynamicTexture {
    constructor(name, opts) {
        this.name = name; this.width = opts.width; this.height = opts.height; this.rec = [];
        this.ctx = makeCtx(this.rec); this.updates = 0;
    }
    getContext() { return this.ctx; }
    update() { this.updates++; }
    dispose() {}
}
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
globalThis.document = { createElement: () => ({ getContext: () => null }) };
try { Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'node' }, configurable: true }); } catch { /* already defined */ }
globalThis.window = {
    BABYLON: {
        MeshBuilder: {
            CreateBox: (n, o) => mesh(n, o), CreateSphere: (n, o) => mesh(n, o), CreateCylinder: (n, o) => mesh(n, o),
            CreateTorus: (n, o) => mesh(n, o), CreatePolyhedron: (n, o) => mesh(n, o), CreateDisc: (n, o) => mesh(n, o),
            CreatePlane: (n, o) => mesh(n, o), CreateGround: (n, o) => mesh(n, o),
        },
        TransformNode: class { constructor(name) { Object.assign(this, node(name)); allNodes.push(this); } },
        Vector3: V3,
        Mesh: { MergeMeshes: (arr) => arr[0], BILLBOARDMODE_ALL: 7 },
        DynamicTexture,
        StandardMaterial: class { constructor(name) { this.name = name; this.uniqueId = ++uid; this.emissiveColor = { scale: () => ({}) }; this.diffuseColor = null; this.specularColor = { scale: () => ({}) }; } dispose() {} freeze() {} },
        Color3: Object.assign(class { constructor(r, g, b) { this.r = r; this.g = g; this.b = b; } }, {
            FromHexString: () => ({ scale: () => ({}) }), Black: () => ({ scale: () => ({}) }),
        }),
        Color4: class {},
    },
};

const { Scene3D } = await import('../client/scene3d.js');
const { createGame } = await import('../shared/engine/setup.mjs');

// Only what buildCorridor touches: the material cache, the label factory, the merger and the map.
const host = {
    scene: {}, shadows: { addShadowCaster() {} }, corridorNodes: {}, roomNodes: {},
    M: (hex, e, extra) => mat(hex, e),
    mergeStatic: (list) => list,
    makeLabel(...args) { return Scene3D.prototype.makeLabel.apply(host, args); },
    setPlate(...args) { return Scene3D.prototype.setPlate.apply(host, args); },
    corridorPoints(...args) { return Scene3D.prototype.corridorPoints.apply(host, args); },
    pos(...args) { return Scene3D.prototype.pos.apply(host, args); },
    posXY(...args) { return Scene3D.prototype.posXY.apply(host, args); },
    setLabel(...args) { return Scene3D.prototype.setLabel.apply(host, args); },
};
const state = createGame({
    seed: 'doors', mode: 'original', draft: false,
    players: [{ name: 'A', charId: 'soldier' }, { name: 'B', charId: 'scout' }],
});
const ship = state.ship;
host.cx = (ship.bounds.minX + ship.bounds.maxX) / 2;
host.cy = (ship.bounds.minY + ship.bounds.maxY) / 2;
const build = (c) => {
    meshes.length = 0; allNodes.length = 0;
    Scene3D.prototype.buildCorridor.call(host, ship, c);
    return host.corridorNodes[c.id];
};
const corridors = Object.values(ship.corridors);
const nodes = {};
for (const c of corridors) nodes[c.id] = build(c);

test('DR-01 the frame is wider than the corridor and stands on its own slab', () => {
    const posts = meshes.filter(m => m.name === 'post' && m.parent && m.parent.name === 'door');
    const slabs = meshes.filter(m => m.name === 'dslab');
    for (const c of corridors) {
        build(c);
        const p = meshes.filter(m => m.name === 'post');
        assert.equal(p.length, 2, c.id + ': two posts');
        for (const post of p) assert.ok(Math.abs(post.position.x) === 1.55, c.id + ': posts stand at ±1.55');
        assert.equal(p[0].opts.width, 0.9, c.id + ': a chunky post');
        assert.equal(p[0].opts.height, 2.2, c.id + ': a taller portal');
        const lintel = meshes.find(m => m.name === 'lintel');
        assert.equal(lintel.opts.width, 4.1, c.id + ': the beam spans the whole frame');
        const slab = meshes.find(m => m.name === 'dslab');
        assert.ok(slab, c.id + ': the frame stands on a bulkhead slab');
        assert.equal(slab.opts.width, 4.3, c.id + ': the slab is wider than the frame');
        // the posts must actually stand on the slab, not float above it or sink into it
        const slabTop = slab.position.y + slab.opts.height / 2;
        // feet may sink a couple of centimetres into the slab; what must never happen is a gap
        for (const post of p) {
            const foot = post.position.y - post.opts.height / 2;
            assert.ok(foot <= slabTop + 0.005 && foot >= slabTop - 0.08,
                c.id + ': post feet rest on the slab (foot ' + foot.toFixed(3) + ', slab top ' + slabTop.toFixed(3) + ')');
        }
    }
    assert.ok(posts.length > 0, 'posts exist');
    assert.ok(slabs.length > 0, 'slabs exist');
});

test('DR-02 the number board hangs on the beam, above the walkway', () => {
    for (const c of corridors) {
        build(c);
        const sign = allNodes.find(m => m.name === 'sign_' + c.id);
        assert.ok(sign, c.id + ': the sign node exists');
        const n = host.corridorNodes[c.id];
        assert.ok(n.numLabel, c.id + ': the corridor has a number label');
        // the frame is a physical border, so the label is the only thing in the middle of the board
        const bars = meshes.filter(m => m.name === 'se');
        assert.equal(bars.length, 4, c.id + ': a four-sided frame around the panel');
        // the board sits on the beam: its frame bottom meets the lintel top (2.32)
        const bottom = sign.position.y - 0.53 - 0.03;
        assert.ok(bottom <= 2.34 && bottom >= 2.26, c.id + ': the board rests on the beam (bottom ' + bottom.toFixed(2) + ')');
        // nothing hangs into the doorway: the opening is 2.2 tall
        for (const b of bars) assert.ok(sign.position.y + b.position.y - b.opts.height / 2 > 2.25, c.id + ': the board stays above the doorway');
    }
});

test('DR-03 the number is printed on the board, and Alt turns it into neon', () => {
    const c = corridors[0];
    const n = build(c);
    const exitA = ship.rooms[c.a].exits.find(e => e.corridor === c.id);
    const nums = (exitA.nums && exitA.nums.length ? exitA.nums : [exitA.num]).filter(x => x);
    const want = nums.join(' / ');
    const printed = n.numLabel.metadata.dt.rec.filter(r => r.text === want);
    assert.equal(printed.length, 1, 'the number is painted on the board: "' + want + '"');
    assert.ok(printed[0].size >= 100, 'the digits fill the board (' + printed[0].size + 'px)');
    assert.ok(printed[0].blur < 12, 'the printed number is not glowing yet');

    // The board is a printed sign from the start, not an Alt-only overlay: the number was painted
    // during build, and Alt only repaints it brighter.
    assert.ok(n.numLabel.isEnabled(), 'the board is visible without Alt');
    Scene3D.prototype.setAlt.call(host, true);
    const neon = n.numLabel.metadata.dt.rec.filter(r => r.text === want);
    assert.ok(neon.length >= 1, 'the number is repainted for Alt');
    assert.ok(neon.some(r => r.blur >= 20), 'the Alt number glows');
    assert.ok(neon.some(r => /^#/.test(r.fill) && r.fill !== printed[0].fill), 'the Alt number changes colour');
    assert.ok(n.signMat, 'the board has its own material so the frame can light up');

    Scene3D.prototype.setAlt.call(host, false);
    const back = n.numLabel.metadata.dt.rec.filter(r => r.text === want);
    assert.ok(back.every(r => r.blur < 20), 'releasing Alt returns the printed look');
});

test('DR-04 the sliding panels close the opening and hide inside the posts', () => {
    for (const c of corridors) {
        build(c);
        const n = host.corridorNodes[c.id];
        const panels = meshes.filter(m => m.name === 'panel');
        assert.equal(panels.length, 2, c.id + ': two sliding panels');
        const half = panels[0].opts.width / 2;
        // closed: the two panels meet in the middle and reach the posts
        assert.ok(Math.abs(n.panelClosed - half) < 0.01, c.id + ': the closed panels meet at the centre');
        assert.ok(n.panelClosed + half >= 1.1 - 0.01, c.id + ': the closed panels reach the posts');
        // open: the panel slides behind the post instead of sticking out into the corridor
        assert.ok(n.panelOpen - half >= 0.9 && n.panelOpen + half <= 2.1, c.id + ': the open panel fits inside the post');
    }
});

test('DR-05 no new pickable meshes: the board and its numbers are decoration', () => {
    for (const c of corridors) {
        build(c);
        for (const m of meshes) {
            if (m.name === 'c' || m.name === 'pad' || m.name === 'jp' || m.name === 'pp') continue;   // corridor body
            assert.equal(m.isPickable, false, c.id + ': ' + m.name + ' must not steal a click from the board');
        }
    }
});
