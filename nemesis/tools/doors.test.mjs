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
    dot(o) { return this.x * o.x + this.y * o.y + this.z * o.z; }
    static Dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
    static Lerp(a, b, t) { return new V3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t); }
    static Cross(a, b) { return new V3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x); }
    static Zero() { return new V3(); }
    static Up() { return new V3(0, 1, 0); }
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
    roundPath(...args) { return Scene3D.prototype.roundPath.apply(host, args); },
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

test('DR-01 the doorway is two ordinary corridor arches, not a bulkhead frame', () => {
    for (const c of corridors) {
        build(c);
        const posts = meshes.filter(m => m.name === 'apost');
        assert.equal(posts.length, 4, c.id + ': two arches, two posts each');
        for (const post of posts) assert.equal(Math.abs(post.position.x), 1.2, c.id + ': posts at ±1.2, like the ribs of the tube');
        assert.equal(posts[0].opts.width, 0.24, c.id + ': the same slim post as a rib');
        assert.equal(posts[0].opts.height, 1.6, c.id + ': the same height as a rib');
        assert.equal(posts[0].opts.depth, 0.32, c.id + ': the same depth as a rib');
        const lintels = meshes.filter(m => m.name === 'alintel');
        assert.equal(lintels.length, 2, c.id + ': one lintel per arch');
        assert.ok(Math.abs(lintels[0].opts.width - 2.64) < 1e-9, c.id + ': as wide as the rib arches (' + lintels[0].opts.width + ')');
        assert.equal(lintels[0].opts.height, 0.24, c.id + ': as thick as theirs');
        // the old bulkhead frame is gone: no chunky posts, no wide beam, no slab or step in the passage
        for (const gone of ['post', 'lintel', 'dslab', 'dstep', 'sill', 'dt']) {
            assert.equal(meshes.filter(m => m.name === gone).length, 0, c.id + ': no «' + gone + '» any more');
        }
        // the arches stand symmetric about the middle of the door, far enough apart for the plate
        const zs = lintels.map(m => m.position.z).sort((a, b) => a - b);
        assert.ok(Math.abs(zs[0] + zs[1]) < 1e-9, c.id + ': the two arches are symmetric about the door');
        assert.ok(zs[1] - zs[0] >= 1.8, c.id + ': there is room between them for the plate');
        // the plate: exactly the lintels' width, height and level — one frame, not a roof on legs
        const plate = meshes.find(m => m.name === 'aplate');
        assert.ok(plate, c.id + ': a plate bridges the arches');
        assert.equal(plate.opts.width, lintels[0].opts.width, c.id + ": the plate is the arches' width");
        assert.equal(plate.opts.height, lintels[0].opts.height, c.id + ': and their height');
        assert.equal(plate.position.y, lintels[0].position.y, c.id + ': flush with them');
        assert.equal(plate.position.x, 0, c.id + ': centred');
        assert.ok(plate.opts.depth > 0.4 && plate.opts.depth <= zs[1] - zs[0] - 0.3, c.id + ': it spans the gap and no more');
        // nothing sticks out over the sides: every part of the frame stays within the arch span
        const span = lintels[0].opts.width / 2;
        for (const m of meshes) {
            if (!/^(apost|alintel|aplate|aband|alamp)/.test(m.name)) continue;
            assert.ok(Math.abs(m.position.x) + m.opts.width / 2 <= span + 1e-9, c.id + ': ' + m.name + ' never grows past the arch');
        }
        // a head clears the lintel: the arches are not squat
        assert.ok(lintels[0].position.y - lintels[0].opts.height / 2 >= 1.5, c.id + ': the doorway is walkable');
    }
});

test('DR-02 the number is a flat stencil on the plate between the arches', () => {
    for (const c of corridors) {
        build(c);
        const n = host.corridorNodes[c.id];
        assert.ok(n.decal, c.id + ': the corridor has a number stencil');
        assert.equal(n.decals, undefined, c.id + ': one number, one stencil — not a copy on each half of the plate');
        const decal = n.decal;
        // flat on the plate, facing up — the very same orientation as the "?" on a room's floor
        assert.equal(decal.billboardMode, 0, c.id + ': the stencil never turns to the camera');
        assert.equal(decal.rotation.x, Math.PI / 2, c.id + ': the stencil lies flat');
        assert.ok(decal.rotation.y === 0, c.id + ': it only spins in its own plane');
        assert.ok(decal.rotation.z === 0 || Math.abs(decal.rotation.z) === Math.PI, c.id + ': it only spins in its own plane');
        assert.equal(decal.position.x, 0, c.id + ': centred across the plate');
        assert.equal(decal.position.z, 0, c.id + ': centred along the plate');
        // The face of a Babylon plane points along its local -Z. A rotation.x of +PI/2 turns that
        // normal straight up, so the paint is read from above and never through the back of the
        // plane (a back face is drawn mirrored; that is what made the digits unreadable).
        const spin = (rx, rz, v) => {
            const cz = Math.cos(rz), sz = Math.sin(rz);
            const x = v.x * cz - v.y * sz, y = v.x * sz + v.y * cz;
            const cx = Math.cos(rx), sx = Math.sin(rx);
            return { x, y: y * cx - v.z * sx, z: y * sx + v.z * cx };
        };
        const normal = spin(decal.rotation.x, decal.rotation.z, { x: 0, y: 0, z: -1 });
        assert.ok(normal.y > 0.999, c.id + ': the painted face looks up, so it is never seen mirrored (n.y=' + normal.y.toFixed(2) + ')');
        // it lies on the plate's own top face, and the plate is the arches' steel
        const plate = meshes.find(m => m.name === 'aplate');
        const plateTop = plate.position.y + plate.opts.height / 2;
        assert.ok(decal.position.y >= plateTop && decal.position.y <= plateTop + 0.03,
            c.id + ': the stencil lies on the plate (' + decal.position.y.toFixed(3) + ' vs ' + plateTop.toFixed(3) + ')');
        assert.equal(plate.material.hex, meshes.find(m => m.name === 'apost').material.hex,
            c.id + ': the plate is the same steel as the arches');
        // and it fits: the number cannot overhang the plate it is painted on
        assert.ok(decal.opts.width <= plate.opts.width - 0.4 && decal.opts.height <= plate.opts.depth - 0.2,
            c.id + ': the stencil fits on the plate (' + decal.opts.width + '×' + decal.opts.height + ' on ' + plate.opts.width + '×' + plate.opts.depth + ')');
        // nothing is bolted on top of the frame: no old board, no sign, no floating screen
        assert.equal(meshes.filter(m => m.name === 'dplate').length, 0, c.id + ': no plate/screen on the frame');
        assert.equal(allNodes.filter(a => /^sign_/.test(a.name)).length, 0, c.id + ': no separate board node');
        assert.equal(meshes.filter(m => m.name === 'se').length, 0, c.id + ': no floating frame around it');
    }
});

test('DR-03 the number is printed in the same paint as the "?", and Alt turns it neon', () => {
    const c = corridors[0];
    const n = build(c);
    const numsOf = (roomId) => { const e = ship.rooms[roomId].exits.find(x => x.corridor === c.id); return (e.nums && e.nums.length ? e.nums : [e.num]).filter(x => x); };
    const want = numsOf(c.a).join(' / ');
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

test('DR-04 the two leaves meet in the middle and swing flat out of the walkway', () => {
    for (const c of corridors) {
        const n = build(c);
        const panels = meshes.filter(m => m.name === 'panel');
        assert.equal(panels.length, 2, c.id + ': two leaves');
        for (const p of panels) {
            assert.ok(p.parent && p.parent.name === 'pivot', c.id + ': each leaf hangs on a pivot at its post');
            assert.ok(Math.abs(p.parent.position.x) >= 1.2 + 0.24 / 2, c.id + ': the pivot stands just outside the post');
            assert.ok(Math.abs(p.opts.width - Math.abs(p.parent.position.x)) < 1e-9, c.id + ': a leaf reaches from its pivot to the middle');
            assert.ok(p.position.x * p.parent.position.x < 0, c.id + ': the leaf hangs inwards, into the doorway');
            assert.ok(p.opts.height <= 1.75, c.id + ': the leaf stays under the lintel');
        }
        // sealed: both pivots at rest, so the two leaves meet in the centre of the doorway
        n.state = null;
        Scene3D.prototype.updateCorridor.call(host, view, Object.assign({}, c, { door: 'closed' }));
        assert.deepEqual(n.pivots.map(p => p.rotation.y), [0, 0], c.id + ': the closed leaves meet in the middle');
        // open: a quarter turn puts each leaf flat along the passage, clear of the opening
        assert.ok(n.panelSwing > 1.2 && n.panelSwing <= Math.PI / 2, c.id + ': one quarter turn opens the bulkhead');
        n.state = null;
        Scene3D.prototype.updateCorridor.call(host, view, Object.assign({}, c, { door: 'open' }));
        for (const p of n.pivots) {
            assert.ok(Math.abs(p.rotation.y - n.panelSwing) < 1e-9, c.id + ': an open leaf swings out of the walkway');
        }
        assert.ok(Math.sin(n.panelSwing) > 0.99, c.id + ': and ends up almost flat against the passage side');
    }
});

test('DR-05 the doorway emergency lamps are dead until the door closes', () => {
    for (const c of corridors) {
        const n = build(c);
        const lenses = n.lamps;
        assert.equal(lenses.length, 4, c.id + ': a lamp on each post, on both faces of the doorway');
        for (const l of lenses) assert.ok(!l.isEnabled(), c.id + ': the emergency light is off while the door stands open');
        for (const l of lenses) assert.equal(l.material.emissive, 1.6, c.id + ': a lit lens would be a bright red');
        // the fixture itself is always there: a dark housing on the post, not a glowing lamp
        const bodies = meshes.filter(m => m.name === 'lem');
        assert.equal(bodies.length, 4, c.id + ': four lamp housings');
        for (const b of bodies) assert.equal(b.material.hex, '#2a3038', c.id + ': dark steel housing');
        // the lamps hang in the top corners of the opening, above the leaves
        for (const l of lenses) {
            assert.ok(Math.abs(l.position.x) > 0.8 && Math.abs(l.position.x) < 1.05, c.id + ': the lens sits on the post');
            assert.ok(l.position.y > 1.2 && l.position.y < 1.6, c.id + ': it hangs under the lintel, over the leaves');
            assert.ok(Math.abs(l.position.z) > 1.2, c.id + ': on the outer face of an arch, never inside a closed leaf');
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

test('DR-07 each room reads its OWN numbers on the doors: no foreign digits, no repeats', () => {
    // The complaint that started this: standing in one room, several corridors were marked "2" and
    // several "3". One stencil carried room `a`'s numbers to both ends, so room `b` read digits that
    // belong to somebody else. A printed room numbers its own exits 1..4 — with a repeat only where
    // the board itself prints two digits on one doorway ("3 4").
    for (const c of corridors) build(c);
    for (const room of Object.values(ship.rooms)) {
        const read = [];          // what a player in this room sees over their doorways
        for (const e of room.exits) {
            const n = host.corridorNodes[e.corridor];
            assert.ok(n, room.id + ': corridor ' + e.corridor + ' is built');
            const exit = room.exits.find(x => x.corridor === e.corridor);
            const want = (exit.nums && exit.nums.length ? exit.nums : [exit.num]).filter(x => x);
            // one stencil, so both ends of a passage must agree: a room reads its own digits and
            // the room across the door reads the very same ones (agreeNumbers guarantees it).
            assert.deepEqual(n.nums, want, room.id + ': the stencil by ' + e.corridor + ' shows this room\'s numbers');
            read.push(want.join('+'));
        }
        // Every number 1..4 appears exactly once for this room, like on the board: across the
        // doorways, plus the hatch when the room has a technical corridor.
        const all = [...read.join('+').split('+'), ...(room.techNums || [])].filter(Boolean).map(Number).sort();
        assert.deepEqual(all, [1, 2, 3, 4], room.id + ': the four noise numbers are dealt out once (' + all.join(',') + ')');
    }
});

test('DR-08 on the printed board every room deals its four noise numbers out once', async () => {
    // A room numbers its own exits 1..4 clockwise; a room with fewer corridors gives one doorway two
    // digits ("3 4") and a room with a technical hatch puts the missing number on the hatch. So the
    // four numbers add up exactly once per room — the invariant that kills "several 2s and several
    // 3s" at the source. The cockpit used to read "2 3 3 4": the hand-written "002 is 3" left the
    // auto-numbered 3 on the doorway to 004 as well.
    const { originalShip } = await import('../shared/ship.mjs');
    const ship = originalShip();
    assert.equal(Object.keys(ship.rooms).length, 21, 'the printed board has 21 rooms');
    for (const r of Object.values(ship.rooms)) {
        const nums = [...r.exits.flatMap(e => (e.nums && e.nums.length ? e.nums : [e.num])), ...(r.techNums || [])]
            .filter(Boolean).sort();
        assert.deepEqual(nums, [1, 2, 3, 4],
            'комната ' + r.id + ' должна раздавать номера 1..4 ровно по разу, а раздаёт ' + nums.join(','));
        for (const e of r.exits) {
            const list = e.nums && e.nums.length ? e.nums : [e.num];
            assert.ok(list.every(n => n >= 1 && n <= 4), 'комната ' + r.id + ': номер в диапазоне 1..4');
            assert.equal(e.num, list[0], 'комната ' + r.id + ': основной номер — первый из пары');
        }
    }
    // the cockpit, checked against the printed board: 002 is 3, 003 is the pair "1 2", 004 is 4
    const cockpit = Object.fromEntries(ship.rooms['001'].exits.map(e => [e.to, e.nums]));
    assert.deepEqual(cockpit, { '002': [3], '003': [1, 2], '004': [4] });
});
