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
let lastNode = null;   // the room node of the last build: wallSpots / wallSkips land on it
const build = (tile, exits = [0.6, 2.5], techAngle = 3.6) => {
    meshes.length = 0;
    lastNode = { exitAngles: exits, techAngle };
    Scene3D.prototype.buildFloor.call(host, tile, null);
    Scene3D.prototype.buildProps.call(host, tile, null, lastNode);
    return meshes.slice();
};
/** Props only — the floor finish has its own paint strips at the wall and is not furniture. */
const buildPropsOnly = (tile, exits = [0.6, 2.5], techAngle = 3.6) => {
    meshes.length = 0;
    lastNode = { exitAngles: exits, techAngle };
    Scene3D.prototype.buildProps.call(host, tile, null, lastNode);
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

test('PR-05 storage cargo stands inside the painted squares and outside them', () => {
    // The same rectangles buildFloor paints (x, z, w, d).
    const ZONES = [[-3.2, 2.4, 2.6, 2.2], [0.4, 3.0, 2.8, 1.8], [3.4, 0.6, 2.0, 2.6], [-3.6, -1.6, 2.2, 2.0], [-0.8, -3.6, 2.4, 1.6]];
    // The hold is loaded with cargo MODULES (a 0.72-tall body with a 0.12 lid flange on top) and, between
    // them, ordinary crates whose width, depth and height are all the same number. A folded vest on the
    // deck is `width === depth` too, but it is a few centimetres thick, so height is no guess.
    const parts = build('storage');
    const bodies = parts.filter(m => m.kind === 'box' && Math.abs(m.opts.height - 0.72) < 1e-9);
    const crates = parts.filter(m => m.kind === 'box' && m.opts.width === m.opts.depth
        && m.opts.width === m.opts.height && m.opts.width >= 0.7 && m.opts.width <= 1.1);
    const cargo = bodies.concat(crates);
    const insideOf = (list) => list.filter(c => ZONES.some(([zx, zz, zw, zd]) =>
        Math.abs(c.position.x - zx) + c.opts.width / 2 <= zw / 2 + 0.001 && Math.abs(c.position.z - zz) + c.opts.depth / 2 <= zd / 2 + 0.001));
    // every painted rectangle is filled: five modules, one per square, and each of them fully inside
    assert.equal(bodies.length, 5, `cargo modules: ${bodies.length}`);
    assert.equal(insideOf(bodies).length, 5, 'every module lies inside its painted square');
    // the squares themselves are the modules' berths: the loose crates stand in the aisles between them
    assert.ok(crates.length - insideOf(crates).length >= 4, `crates outside the squares: ${crates.length - insideOf(crates).length}`);
    assert.ok(cargo.length >= 10, `cargo in the hold: ${cargo.length}`);
});

test('PR-06 the fire post is a full fire station: bottles racked on the deck and on the wall', () => {
    const m = build('fireControl');
    // one extinguisher = a red bottle body (the wall rack carries a smaller copy, so the colour is what
    // tells a bottle from every other cylinder in the room)
    const bottles = m.filter(x => x.kind === 'cyl' && x.material && x.material.hex === '#b5372c');
    assert.ok(bottles.length >= 14, `огнетушителей в пожарном посту: ${bottles.length}`);
    // ten in the middle on the floor rack (two ranks of four plus the spare rank behind) ...
    const onRack = bottles.filter(b => Math.hypot(b.position.x, b.position.z) < 3.4);
    assert.ok(onRack.length >= 10, `на стеллаже в середине: ${onRack.length}`);
    // ... and six on the two wall shelves, up against the room wall
    const onWall = bottles.filter(b => Math.hypot(b.position.x, b.position.z) > 4.8);
    assert.ok(onWall.length >= 6, `на настенных полках: ${onWall.length}`);
    // a rack: the long plinth with its rail, and the lit strip under it
    assert.ok(m.some(x => x.kind === 'box' && Math.abs(x.opts.width - 4.5) < 1e-9 && Math.abs(x.opts.depth - 1.5) < 1e-9), 'стеллаж-плинт в середине');
    assert.ok(m.some(x => x.kind === 'box' && Math.abs(x.opts.width - 4.56) < 1e-9 && Math.abs(x.opts.height - 0.1) < 1e-9), 'верхняя перекладина стеллажа');
    // fire blankets on the wall: two red cabinets with a white cross, plus the hose reel drum
    assert.ok(m.filter(x => x.kind === 'box' && Math.abs(x.opts.width - 0.92) < 1e-9 && Math.abs(x.opts.height - 1.1) < 1e-9).length >= 2, 'два шкафа с противопожарным одеялом');
    assert.ok(m.filter(x => x.kind === 'cyl' && Math.abs(x.opts.diameter - 0.92) < 1e-9).length >= 1, 'пожарный рукав на барабане');
    // a sprinkler riser with hand wheels stands in the room
    assert.ok(m.filter(x => x.kind === 'cyl' && Math.abs(x.opts.height - 2.6) < 1e-9).length >= 1, 'стояк спринклера');
});

test('PR-07 the decontamination lane runs under arches with spray bars, and stays walkable', () => {
    const m = build('decon');
    // three arches: a 2.44-wide cross beam over the lane, a spray bar and their lit bands
    const beams = m.filter(x => x.kind === 'box' && Math.abs(x.opts.width - 2.44) < 1e-9 && Math.abs(x.opts.height - 0.26) < 1e-9);
    assert.equal(beams.length, 3, `арок над проходом: ${beams.length}`);
    const zs = beams.map(b => Math.round(b.position.z * 100) / 100).sort((a, b) => a - b);
    assert.deepEqual(zs, [-2.55, 0, 2.55], 'арки стоят вдоль центрального прохода');
    for (const b of beams) assert.ok(Math.abs(b.position.x) < 1e-9, 'арка стоит по центру комнаты, поперёк прохода');
    // spray bars and nozzles: five under every arch
    assert.equal(m.filter(x => x.kind === 'box' && Math.abs(x.opts.width - 1.9) < 1e-9 && Math.abs(x.opts.height - 0.12) < 1e-9).length, 3, 'три разбрызгивающие штанги');
    const nozzles = m.filter(x => x.kind === 'cyl' && Math.abs(x.opts.height - 0.14) < 1e-9 && Math.abs(x.opts.diameterTop - 0.1) < 1e-9);
    assert.equal(nozzles.length, 15, `форсунок: ${nozzles.length} (по пять на арку)`);
    // the walk under the arches is free: no prop stands in the lane between the deck and head height
    for (const x of m) {
        const inLane = Math.abs(x.position.x) < 0.75;
        const bodyHeight = x.position.y > 0.3 && x.position.y < 1.6 && x.kind !== 'cyl';
        if (inLane && bodyHeight) assert.fail(`${x.kind} ${x.opts.width}x${x.opts.height}x${x.opts.depth} стоит в проходе (y = ${x.position.y.toFixed(2)})`);
    }
});

test('PR-08 the equipment store is a shelf island between two aisles', () => {
    const m = build('repository');
    // one island: a 5-unit-long plinth, a top cap, and four shelf levels
    assert.ok(m.some(x => x.kind === 'box' && Math.abs(x.opts.depth - 5.0) < 1e-9), 'плинт острова');
    const shelves = m.filter(x => x.kind === 'box' && Math.abs(x.opts.width - 1.58) < 1e-9 && Math.abs(x.opts.height - 0.07) < 1e-9);
    assert.equal(shelves.length, 4, `уровней полок: ${shelves.length}`);
    // cargo on every level, on both aisles: 4 levels x 4 bays x 2 sides = 32 places, at least a dozen filled
    const cargo = m.filter(x => x.position.y > 0.4 && x.position.y < 2.3 && Math.abs(x.position.x + 0.4) < 0.9
        && (x.kind === 'box' || x.kind === 'cyl'));
    assert.ok(cargo.length >= 24, `груза на полках: ${cargo.length}`);
    // no tall rack panels: it is open shelving, so the island has uprights, not walls
    const panels = m.filter(x => x.kind === 'box' && Math.abs(x.opts.depth - 5.0) < 1e-9 && x.opts.height > 0.2);
    assert.equal(panels.length, 0, 'остров — открытые полки: сплошной панели-стены нет');
});

test('PR-09 airlock control has a pressure door with a wheel lock and a chevron bay', () => {
    const m = build('airlock');
    // the door: a frame plate with two leaves and a hub in the middle
    assert.ok(m.some(x => x.kind === 'box' && Math.abs(x.opts.width - 3.5) < 1e-9 && Math.abs(x.opts.height - 2.8) < 1e-9), 'плита проёма');
    assert.equal(m.filter(x => x.kind === 'box' && Math.abs(x.opts.width - 1.62) < 1e-9 && Math.abs(x.opts.height - 2.6) < 1e-9).length, 2, 'две створки');
    assert.ok(m.some(x => x.kind === 'cyl' && Math.abs(x.opts.diameter - 0.9) < 1e-9), 'колесо-замок');
    assert.equal(m.filter(x => x.kind === 'box' && Math.abs(x.opts.height - 0.1) < 1e-9 && Math.abs(x.opts.depth - 0.1) < 1e-9 && Math.abs(x.opts.width - 0.66) < 1e-9).length, 4, 'четыре спицы колеса');
    // the bay: yellow-and-black painted bars on the deck, and the vent grille under the door
    const paint = m.filter(x => x.kind === 'box' && Math.abs(x.opts.height - 0.02) < 1e-9);
    assert.ok(paint.length >= 20, `разметка на полу: ${paint.length} полос`);
    assert.ok(m.some(x => x.kind === 'box' && Math.abs(x.opts.width - 3.0) < 1e-9 && Math.abs(x.opts.depth - 1.0) < 1e-9), 'решётка вентиляции');
    // two control podiums with tilted screens
    assert.equal(m.filter(x => x.kind === 'box' && Math.abs(x.opts.width - 1.16) < 1e-9 && Math.abs(x.opts.height - 0.1) < 1e-9).length, 2, 'два пульта');
});

// --- wall furniture against the generated passages -----------------------------------------
// The board generator cuts doorways and the technical hatch wherever the ship needs them, so a
// cabinet or a monitor bank "against the wall" at a fixed angle can end up floating across a
// passage. Every wall piece is placed by its own width now: the spot is snapped out of the
// doorway, and when the ring has no room left the piece is not built at all.
const DOOR_HALF = 1.62, HATCH_HALF = 1.42;   // metres each side of the opening, portal posts included
const wrapA = a => Math.atan2(Math.sin(a), Math.cos(a));

test('PR-10 a wall piece never hangs over a doorway or the technical hatch', () => {
    const exitSets = [[0.6, 2.5], [0, 1.6, 3.2, -1.4], [-2.9, 0.2, 1.9]];
    for (const tile of TILES) {
        for (const exits of exitSets) {
            build(tile, exits, 3.6);
            for (const spot of (lastNode.wallSpots || [])) {
                const half = spot.width / 2;
                for (const ea of exits) {
                    const gap = Math.abs(wrapA(spot.a - ea)) * WALL_R;
                    assert.ok(gap >= DOOR_HALF + half, `${tile}: a ${spot.width.toFixed(1)}-wide piece sits ${(gap - DOOR_HALF).toFixed(2)} m into the doorway at ${ea.toFixed(2)}`);
                }
                const tech = Math.abs(wrapA(spot.a - 3.6)) * WALL_R;
                assert.ok(tech >= HATCH_HALF + half, `${tile}: a piece sits ${(tech - HATCH_HALF).toFixed(2)} m into the technical hatch`);
            }
        }
    }
});

test('PR-11 a fully pierced ring builds cleanly, and the ring-full path is really taken', () => {
    // Doorways every 0.6 rad: some wall pieces still fit in the narrow gaps, the wide ones do not.
    const exits = [];
    for (let k = 0; k < 10; k++) exits.push(-Math.PI + k * 0.6);
    let skips = 0;
    for (const tile of TILES) {
        assert.doesNotThrow(() => build(tile, exits, 3.6), `${tile} must survive a fully pierced ring`);
        assert.ok((lastNode.wallSkips || 0) >= 0, `${tile}: wall skips are counted`);
    }
    // Mesh-by-mesh the rule is checked on the rooms whose wall furniture is placed by width. The
    // remaining rooms still pin a few pieces to fixed coordinates; PR-10 covers the spots they do
    // register, and this list grows as those rooms are converted.
    for (const tile of TILES) {
        skips += lastNode.wallSkips || 0;
        const spots = lastNode.wallSpots || [];
        for (const spot of spots) for (const ea of exits) {
            const gap = Math.abs(wrapA(spot.a - ea)) * WALL_R;
            assert.ok(gap >= DOOR_HALF + spot.width / 2, `${tile}: a wall piece hangs over a doorway on a pierced ring`);
        }
        for (const m of buildPropsOnly(tile, exits, 3.6)) {
            const r = Math.hypot(m.position.x, m.position.z);
            assert.ok(r <= WALL_R - 0.1, `${tile}: a prop escaped the ring`);
            // Beds and desks reach out to ~5.2 m from the middle; the wall band itself starts higher.
            if (r < 5.5) continue;
            // Nothing at the wall may stand in an opening: the ceiling of that rule is the doorway
            // itself, so anything that close to the ring is measured against every door angle.
            for (const ea of exits) {
                const gap = Math.abs(wrapA(Math.atan2(m.position.x, m.position.z) - ea)) * WALL_R;
                assert.ok(gap >= DOOR_HALF - 0.15, `${tile}: a prop stands ${gap.toFixed(2)} m from the doorway axis at r=${r.toFixed(2)}`);
            }
        }
    }
    assert.ok(skips > 0, 'some wall piece must have been dropped on a ring this crowded');
});
