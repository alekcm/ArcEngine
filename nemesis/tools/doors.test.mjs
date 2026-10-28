// doors.test.mjs — the corridor doors, built headlessly against a stub BABYLON.
//   node --test nemesis/tools/doors.test.mjs
// The corridor number went through two bad versions: first a small label floating 2.2 units off to
// the side of the door, then a steel board above the beam whose number was a billboard — it always
// turned to face the camera and it glowed even without Alt. What it has to be is what the players
// actually read on the physical board: a flat stencil painted on the door frame itself, the same
// pale slate paint as the "?" printed on an unexplored room's floor, dead flat until Alt is held.
// The frame is wide and deep enough to carry that number, and the doorway has dark emergency lamps
// that only light up once the bulkhead seals.
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
    enabled: true, dispose() {}, setEnabled(v) { this.enabled = v !== false; }, isEnabled() { return this.enabled; },
    computeWorldMatrix() {}, bakeCurrentTransformIntoVertices() {} });
const mesh = (name, opts) => {
    const m = Object.assign(node(name), { opts: opts || {}, material: null, isPickable: true,
        convertToFlatShadedMesh() { return this; } });
    meshes.push(m); return m;
};
/** A 2D context stub that records what the stencil actually paints. */
function makeCtx(rec) {
    const state = { fillStyle: '#000', strokeStyle: '#000', shadowBlur: 0, font: '', textAlign: '', textBaseline: '', lineWidth: 1, lineJoin: 'miter' };
    const ctx = {
        clearRect() { rec.length = 0; },
        beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, quadraticCurveTo() {},
        fill() {}, stroke() {},
        measureText(t) { return { width: String(t).length * 34 }; },
        fillText(t, x, y) {
            const px = /(\d+)px/.exec(state.font);
            rec.push({ kind: 'fill', text: String(t), fill: state.fillStyle, stroke: null, blur: state.shadowBlur, size: px ? Number(px[1]) : 0, x, y });
        },
        strokeText(t, x, y) {
            const px = /(\d+)px/.exec(state.font);
            rec.push({ kind: 'stroke', text: String(t), fill: null, stroke: state.strokeStyle, width: state.lineWidth, blur: state.shadowBlur, size: px ? Number(px[1]) : 0, x, y });
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
        StandardMaterial: class {
            constructor(name) {
                this.name = name; this.uniqueId = ++uid; this.diffuseTexture = null; this.disableLighting = false;
                this.emissiveColor = { r: 0, g: 0, b: 0, scale: () => ({}) };
                this.diffuseColor = null; this.specularColor = { scale: () => ({}) };
            }
            dispose() {} freeze() {}
        },
        Color3: Object.assign(class {
            constructor(r, g, b) { this.r = r; this.g = g; this.b = b; }
            scale(k) { return { r: this.r * k, g: this.g * k, b: this.b * k }; }
        }, {
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
    makeDecal(...args) { return Scene3D.prototype.makeDecal.apply(host, args); },
    setDecal(...args) { return Scene3D.prototype.setDecal.apply(host, args); },
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
host.shipRooms = ship.rooms;
const view = { roomState: {} };
for (const r of Object.values(ship.rooms)) view.roomState[r.id] = { explored: true, objects: [], tile: null };
const build = (c) => {
    meshes.length = 0; allNodes.length = 0;
    Scene3D.prototype.buildCorridor.call(host, ship, c);
    return host.corridorNodes[c.id];
};
const corridors = Object.values(ship.corridors);
const nodes = {};
for (const c of corridors) nodes[c.id] = build(c);

test('DR-01 the frame is wider than the corridor and stands on its own slab', () => {
    for (const c of corridors) {
        build(c);
        const posts = meshes.filter(m => m.name === 'post');
        assert.equal(posts.length, 2, c.id + ': two posts');
        for (const post of posts) assert.equal(Math.abs(post.position.x), 1.7, c.id + ': posts stand at ±1.7');
        assert.equal(posts[0].opts.width, 1.2, c.id + ': a chunky post');
        assert.equal(posts[0].opts.height, 2.35, c.id + ': a taller portal');
        const lintel = meshes.find(m => m.name === 'lintel');
        assert.equal(lintel.opts.width, 5.2, c.id + ': the beam spans the whole frame');
        assert.ok(lintel.opts.depth >= 2.0, c.id + ': the beam is deep enough to carry the number');
        assert.ok(lintel.position.x === 0 && lintel.position.z === 0, c.id + ': the beam is centred on the door');
        const slab = meshes.find(m => m.name === 'dslab');
        assert.ok(slab, c.id + ': the frame stands on a bulkhead slab');
        assert.ok(slab.opts.width > lintel.opts.width, c.id + ': the slab is wider than the frame');
        // the posts must actually stand on the slab, not float above it or sink into it
        const slabTop = slab.position.y + slab.opts.height / 2;
        for (const post of posts) {
            const foot = post.position.y - post.opts.height / 2;
            assert.ok(foot <= slabTop + 0.005 && foot >= slabTop - 0.08,
                c.id + ': post feet rest on the slab (foot ' + foot.toFixed(3) + ', slab top ' + slabTop.toFixed(3) + ')');
        }
    }
});

test('DR-02 the number is a flat stencil on the beam, not a board hanging in the air', () => {
    for (const c of corridors) {
        build(c);
        const n = host.corridorNodes[c.id];
        assert.ok(n.decal, c.id + ': the corridor has a number stencil');
        const decal = n.decal;
        // flat on the beam, facing up — the very same orientation as the "?" on a room's floor
        assert.equal(decal.billboardMode, 0, c.id + ': the stencil never turns to the camera');
        assert.equal(decal.rotation.x, Math.PI / 2, c.id + ': the stencil lies flat');
        assert.ok(decal.rotation.z === 0 || Math.abs(decal.rotation.z) === Math.PI, c.id + ': it only spins in its own plane');
        assert.equal(decal.position.x, 0, c.id + ': centred across the beam');
        // The stencil is fixed, but which way round it is painted is picked once: the top of the
        // numbers has to point away from the table's default camera, or every other door would read
        // upside down (the "?" on a room floor is printed the same way round).
        const up = { x: -Math.SQRT1_2, z: Math.SQRT1_2 };
        const flip = Math.abs(decal.rotation.z) === Math.PI ? -1 : 1;
        const facing = (Math.sin(n.ry) * up.x + Math.cos(n.ry) * up.z) * flip;
        assert.ok(facing > -1e-9, c.id + ': the number is painted the right way up (' + facing.toFixed(2) + ')');
        assert.equal(decal.position.z, 0, c.id + ': centred along the beam');
        // it lies on the beam's own top face: no dark plate, no screen on the roof, the beam keeps
        // the frame's steel colour and only gets wider
        assert.equal(meshes.filter(m => m.name === 'dplate').length, 0, c.id + ': no plate/screen on the beam');
        const lintel = meshes.find(m => m.name === 'lintel');
        const beamTop = lintel.position.y + lintel.opts.height / 2;
        assert.ok(decal.position.y >= beamTop && decal.position.y <= beamTop + 0.03,
            c.id + ': the stencil lies on the beam (' + decal.position.y.toFixed(3) + ' vs ' + beamTop.toFixed(3) + ')');
        assert.equal(lintel.material.hex, meshes.find(m => m.name === 'post').material.hex,
            c.id + ': the beam is the same steel as the frame');
        // and it fits: the number cannot overhang the beam it is painted on
        const w = decal.opts.width, h = decal.opts.height;
        assert.ok(w <= lintel.opts.width - 0.39 && h <= lintel.opts.depth - 0.2,
            c.id + ': the stencil fits on the beam (' + w + '×' + h + ' on ' + lintel.opts.width + '×' + lintel.opts.depth + ')');
        // nothing hangs in the air above the doorway any more: no old board and its four bars
        assert.equal(allNodes.filter(a => /^sign_/.test(a.name)).length, 0, c.id + ': no separate board node');
        assert.equal(meshes.filter(m => m.name === 'se').length, 0, c.id + ': no floating frame around it');
        // and the beam is well above the opening, so the number never blocks the walkway
        assert.ok(lintel.position.y - lintel.opts.height / 2 >= 2.3, c.id + ': the beam stays above the doorway');
    }
});

test('DR-03 the number is printed in the same paint as the "?", and Alt turns it neon', () => {
    const c = corridors[0];
    const n = build(c);
    const exitA = ship.rooms[c.a].exits.find(e => e.corridor === c.id);
    const nums = (exitA.nums && exitA.nums.length ? exitA.nums : [exitA.num]).filter(x => x);
    const want = nums.join(' / ');
    const painted = n.decal.metadata.dt.rec.filter(r => r.text === want);
    const printed = painted.filter(r => r.kind === 'fill');
    assert.equal(printed.length, 1, 'the number is painted on the beam: "' + want + '"');
    assert.ok(printed[0].size >= 150, 'the digits fill the beam (' + printed[0].size + 'px)');
    assert.equal(printed[0].blur, 0, 'the printed number does not glow');
    assert.equal(printed[0].fill, '#56687c', 'it is the same slate paint as the "?" on a room floor');
    assert.equal(n.decal.isEnabled(), true, 'the number is on the door without Alt');
    // on the beam's own light steel the paint needs an edge, or it disappears in the lighting
    const edge = painted.filter(r => r.kind === 'stroke');
    assert.equal(edge.length, 1, 'the paint is outlined');
    assert.equal(edge[0].stroke, '#1b2632', 'a dark edge under the paint');
    assert.ok(edge[0].width >= 3, 'the edge is thick enough to read (' + edge[0].width.toFixed(1) + ')');

    Scene3D.prototype.setAlt.call(host, true);
    const neon = n.decal.metadata.dt.rec.filter(r => r.text === want && r.kind === 'fill');
    assert.ok(neon.length >= 1, 'the number is repainted for Alt');
    assert.ok(neon.some(r => r.blur >= 20), 'the Alt number glows');
    assert.ok(neon.some(r => /^#/.test(r.fill) && r.fill !== printed[0].fill), 'the Alt number changes colour');

    Scene3D.prototype.setAlt.call(host, false);
    const back = n.decal.metadata.dt.rec.filter(r => r.text === want && r.kind === 'fill');
    assert.ok(back.length >= 1 && back.every(r => r.blur < 20), 'releasing Alt returns the printed look');
    assert.equal(back[0].fill, '#56687c', 'and the same paint');
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
        const post = meshes.find(m => m.name === 'post');
        const inner = Math.abs(post.position.x) - post.opts.width / 2;
        assert.ok(n.panelOpen - half >= inner - 0.06, c.id + ': the open panel is inside the post');
        assert.ok(n.panelOpen + half <= Math.abs(post.position.x) + post.opts.width / 2, c.id + ': and does not stick out of it');
    }
});

test('DR-05 the doorway emergency lamps are dead until the door closes', () => {
    for (const c of corridors) {
        const n = build(c);
        const lenses = n.lamps;
        assert.equal(lenses.length, 2, c.id + ': a lamp on each side of the doorway');
        for (const l of lenses) assert.ok(!l.isEnabled(), c.id + ': the emergency light is off while the door stands open');
        for (const l of lenses) assert.equal(l.material.emissive, 1.6, c.id + ': a lit lens would be a bright red');
        // the fixture itself is always there: a dark housing, not a glowing lamp
        const bodies = meshes.filter(m => m.name === 'lem');
        assert.equal(bodies.length, 2, c.id + ': two lamp housings');
        for (const b of bodies) assert.equal(b.material.hex, '#2a3038', c.id + ': dark steel housing');
        // the lamps hang in the top corners of the opening, above the sliding panels and the trim
        for (const l of lenses) {
            assert.ok(Math.abs(l.position.x) > 0.9 && Math.abs(l.position.x) < 1.1, c.id + ': the lens looks into the doorway');
            assert.ok(l.position.y > 1.9 && l.position.y < 2.35, c.id + ': it hangs under the beam');
        }

        // sealed: the emergency light comes on, like a room on malfunction
        n.state = null;
        Scene3D.prototype.updateCorridor.call(host, view, Object.assign({}, c, { door: 'closed' }));
        assert.ok(lenses.every(l => l.isEnabled()), c.id + ': closing the door lights the doorway');
        // and it goes dark again as soon as the bulkhead opens
        n.state = null;
        Scene3D.prototype.updateCorridor.call(host, view, Object.assign({}, c, { door: 'open' }));
        assert.ok(lenses.every(l => !l.isEnabled()), c.id + ': an open door shows no red at all');
    }
});

test('DR-06 no new pickable meshes: the stencil, the beam and the lamps are decoration', () => {
    for (const c of corridors) {
        build(c);
        for (const m of meshes) {
            if (m.name === 'c' || m.name === 'pad' || m.name === 'jp' || m.name === 'pp') continue;   // corridor body
            assert.equal(m.isPickable, false, c.id + ': ' + m.name + ' must not steal a click from the board');
        }
    }
});
