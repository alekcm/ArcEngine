// board-edits.test.mjs — the designer's saved board edits (nemesis/client/board-edits.json).
//   node --test nemesis/tools/board-edits.test.mjs
//
// That file is written by the Nemesis tab of editor.bat: the parts a designer moved, turned,
// recoloured, hid or deleted. It is local (it sits in .gitignore) and optional — the tests skip when
// it is not there. What they pin down:
//   * a key is "<owner>#<mesh name>~<ordinal of that name>", and a room shell is owned by its *tile*
//     ("tile:evacA:shell#cradle~1") so the same edit finds its part in a session, where those tiles
//     lie in other rooms; build order alone was not stable, because the number of wall segments,
//     door frames and wall props depends on which doors the room has;
//   * a file written before that change ("room:013:shell#7") is converted on load — the loader and
//     this test share tileKeyedEdits(), so a conversion regression fails here;
//   * every key still finds its part, except a short list of ids that no longer exist anywhere;
//   * on a real game board the edits apply to the rooms that hold their tile, and nowhere else.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const noop = () => {};
const el = () => ({
    style: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    appendChild: noop, removeChild: noop, getContext: () => null, addEventListener: noop, removeEventListener: noop,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    setAttribute: noop, getAttribute: () => null, focus: noop, blur: noop, setPointerCapture: noop,
    releasePointerCapture: noop, hasPointerCapture: () => false, requestPointerLock: noop, tabIndex: 0,
    nodeName: 'CANVAS', width: 800, height: 600, clientWidth: 800, clientHeight: 600,
});
const doc = {
    createElement: el, createElementNS: el, documentElement: el(), body: el(), addEventListener: noop, removeEventListener: noop,
    getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], head: el(),
    fonts: { add: noop, ready: Promise.resolve() }, pointerLockElement: null,
};
const sandbox = {
    document: doc,
    navigator: { userAgent: 'node', platform: 'node', maxTouchPoints: 0, language: 'ru' },
    location: { href: 'http://localhost/', protocol: 'http:' },
    performance: { now: () => Date.now() },
    requestAnimationFrame: cb => setTimeout(cb, 16), cancelAnimationFrame: noop,
    addEventListener: noop, removeEventListener: noop, innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1,
    localStorage: { getItem: () => null, setItem: noop },
    setTimeout, clearTimeout, setInterval, clearInterval, URL, URLSearchParams, ArrayBuffer, Uint8Array,
    Blob: class { }, HTMLElement: class { }, Image: class { }, WebGLRenderingContext: class { },
    AudioContext: class {
        constructor() { this.destination = {}; this.state = 'running'; this.currentTime = 0; this.sampleRate = 44100; }
        createGain() { return { gain: { value: 0, setValueAtTime() { }, exponentialRampToValueAtTime() { }, linearRampToValueAtTime() { }, cancelScheduledValues() { }, setTargetAtTime() { } }, connect() { }, disconnect() { } }; }
        createOscillator() { return { type: '', frequency: { value: 0, setValueAtTime() { }, exponentialRampToValueAtTime() { }, linearRampToValueAtTime() { } }, detune: { value: 0 }, connect() { }, start() { }, stop() { } }; }
        createBiquadFilter() { return { type: '', frequency: { value: 0, setValueAtTime() { }, exponentialRampToValueAtTime() { }, linearRampToValueAtTime() { } }, Q: { value: 0 }, connect() { }, start() { }, stop() { } }; }
        createBufferSource() { return { buffer: null, loop: false, playbackRate: { value: 1 }, connect() { }, start() { }, stop() { } }; }
        createBuffer(ch, len, rate) { return { getChannelData: () => new Float32Array(len) }; }
    },
};
sandbox.window = sandbox; sandbox.self = sandbox; sandbox.globalThis = sandbox;
vm.runInContext(fs.readFileSync(new URL('../../libs/babylon.js', import.meta.url), 'utf8'), vm.createContext(sandbox), { filename: 'babylon.js' });
const B = sandbox.BABYLON;

globalThis.window = sandbox;
globalThis.localStorage = sandbox.localStorage;
try { Object.defineProperty(globalThis, 'document', { value: doc, configurable: true, writable: true }); } catch { globalThis.document = doc; }
try { Object.defineProperty(globalThis, 'navigator', { value: sandbox.navigator, configurable: true }); } catch { /* already defined */ }
globalThis.performance = globalThis.performance || sandbox.performance;
globalThis.addEventListener = noop;

class HeadlessEngine extends B.NullEngine {
    constructor(canvas, ...rest) { super(); this._canvas = canvas || el(); }
    getRenderingCanvas() { return this._canvas; }
    getInputElement() { return this._canvas; }
    getDeltaTime() { return 16; }
    runRenderLoop(fn) { this._loop = fn; }
    stopRenderLoop() { }
    resize() { }
    getFps() { return 60; }
}
Object.defineProperty(B, 'Engine', { value: HeadlessEngine, configurable: true, writable: true });
function makeCtx() {
    const state = {};
    return new Proxy({}, {
        get(_, k) {
            if (k in state) return state[k];
            if (k === 'measureText') return () => ({ width: 24 });
            if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() { } });
            if (k === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
            if (k === 'canvas') return { width: 512, height: 512 };
            return () => { };
        },
        set(_, k, v) { state[k] = v; return true; },
    });
}
class HeadlessTexture {
    constructor(name, opts) { this.name = name; this.opts = opts || {}; this.hasAlpha = false; this.wrapU = 0; this.wrapV = 0; this.uScale = 1; this.vScale = 1; this._ctx = makeCtx(); }
    getContext() { return this._ctx; }
    getSize() { return { width: this.opts.width || 512, height: this.opts.height || 512 }; }
    update() { } dispose() { } getInternalTexture() { return null; }
}
Object.defineProperty(B, 'DynamicTexture', { value: HeadlessTexture, configurable: true, writable: true });

const { Scene3D } = await import('../client/scene3d.js');
const { galleryShip, ROOM_TILES, tileKeyedEdits } = await import('../shared/ship.mjs');
const { createGame } = await import('../shared/engine/setup.mjs');
const { viewFor } = await import('../shared/view.mjs');
const { INTRUDER_NAMES } = await import('../shared/data/cards.mjs');

// A Windows checkout keeps the client in "Nemesis/", a Linux one in "nemesis/": the same folder on
// the machine that made the edits, two paths in git. app.js tries both, and so does this test.
const FILES = ['../client/board-edits.json', '../../Nemesis/client/board-edits.json']
    .map(p => new URL(p, import.meta.url)).filter(f => fs.existsSync(f));
const FILE = FILES[0];
const raw = FILE ? JSON.parse(fs.readFileSync(FILE, 'utf8')).edits || {} : {};
const saved = tileKeyedEdits(raw);
const skip = FILE ? false : 'no board-edits.json in this checkout';

// Ids that name a part no longer built by any version we have: the designer's file was saved before
// these props were rebuilt, and the numbers landed past the end of their room. They cost nothing —
// an edit with no part is skipped — but they are listed here so a new orphan fails the suite.
// Nothing is stale in the file today: the four ids that named no part were dropped when the file was
// converted to the new keys. A new orphan still fails BE-02, so this set is expected to stay empty.
const STALE = new Set();

const ship = galleryShip();
const roomState = {};
for (const r of Object.values(ship.rooms)) {
    roomState[r.id] = { tile: ship.galleryTiles[r.id], explored: true, fire: false, malfunction: false, objects: [], token: null };
}
const view = {
    ship, roomState, players: [], intruders: {}, fx: [], pods: [], podsUnlocked: true,
    nestEggs: 5, time: 15, selfDestruct: 0, destination: 'B', current: null, phase: 'gallery', lastShot: null,
};
const scene = new Scene3D(el(), {});
scene.paused = true;
scene.gallery = true;
scene.setEditMode(true);          // no merging: every part keeps its id and its place in the registry
scene.setEdits(saved);
scene.update(view, ROOM_TILES, INTRUDER_NAMES, []);
const parts = scene.editMeshes;
const keys = Object.keys(saved);

test('BE-01 every key names a part the build makes, and its owner is a tile of the board', { skip }, () => {
    assert.ok(keys.length > 0, 'the saved file has edits');
    const tiles = new Set(Object.values(ship.galleryTiles));
    for (const k of keys) {
        const m = /^tile:([a-zA-Z0-9_]+):shell#[A-Za-z0-9_]+~\d+$/.exec(k);
        assert.ok(m, k + ': the key names a tile shell, a part name and its ordinal');
        assert.ok(tiles.has(m[1]), k + ': ' + m[1] + ' is not a tile of the board');
    }
});

test('BE-01b an older file, keyed by gallery room number, is converted to the tile it holds', () => {
    const converted = tileKeyedEdits({ 'room:002:shell#7': { hidden: true }, 'room:013:shell#9': { deleted: true } });
    assert.deepEqual(converted, {
        ['tile:' + ship.galleryTiles['002'] + ':shell#7']: { hidden: true },
        ['tile:' + ship.galleryTiles['013'] + ':shell#9']: { deleted: true },
    });
    // Anything that is not a room shell is left exactly as it is (doors, lights, corridors, hull).
    const other = { 'cor:003-004#5': { pos: [1, 0, 0] }, 'room:005:obj#2': { hidden: true }, 'hull#1': { hidden: true } };
    assert.deepEqual(tileKeyedEdits(other), other);
    // A room number the gallery does not have must not invent a tile.
    assert.deepEqual(tileKeyedEdits({ 'room:999:shell#1': { hidden: true } }), { 'room:999:shell#1': { hidden: true } });
});

test('BE-02 every key still finds its part (bar the documented stale ids)', { skip }, () => {
    const orphans = keys.filter(k => !parts[k]).sort();
    const unexpected = orphans.filter(k => !STALE.has(k));
    assert.deepEqual(unexpected, [], 'these edits name a part that no build makes any more: ' + unexpected.join(', '));
    const back = [...STALE].filter(k => parts[k]);
    assert.deepEqual(back, [], 'these ids are back, so drop them from STALE: ' + back.join(', '));
});

test('BE-03 an edit is applied to the part it names', { skip }, () => {
    for (const k of keys) {
        const m = parts[k];
        if (!m) continue;
        const e = saved[k];
        if (e.deleted) { assert.equal(m.isEnabled(), false, k + ': a deleted part is switched off'); continue; }
        if (e.hidden) { assert.equal(m.isEnabled(), false, k + ': a hidden part is switched off'); continue; }
        if (e.pos) for (const [i, axis] of ['x', 'y', 'z'].entries()) {
            assert.ok(Math.abs(m.position[axis] - e.pos[i]) < 0.002, k + ': ' + axis + ' is where the designer put it');
        }
        if (e.rot) for (const [i, axis] of ['x', 'y', 'z'].entries()) {
            assert.ok(Math.abs(m.rotation[axis] - e.rot[i]) < 0.002, k + ': ' + axis + ' rotation is kept');
        }
    }
});

test('BE-04 the file is what the game reads: known fields, finite numbers, hex colours', { skip }, () => {
    const raw = fs.readFileSync(FILE, 'utf8');
    const obj = JSON.parse(raw);                       // a merge that left conflict markers fails here
    assert.deepEqual(Object.keys(obj), ['edits'], 'the file is one "edits" map');
    assert.ok(raw.endsWith('\n'), 'the editor writes a trailing newline');
    for (const [k, e] of Object.entries(obj.edits)) {
        for (const f of Object.keys(e)) assert.ok(['pos', 'rot', 'scale', 'color', 'glow', 'hidden', 'deleted'].includes(f), k + ': unknown field ' + f);
        for (const f of ['pos', 'rot', 'scale']) {
            if (!e[f]) continue;
            assert.equal(e[f].length, 3, k + ': ' + f + ' is a vector');
            for (const n of e[f]) assert.ok(Number.isFinite(n) && Math.abs(n) <= 1000, k + ': ' + f + ' holds a sane number');
        }
        if (e.color) assert.match(e.color, /^#[0-9a-f]{6}$/i, k + ': colour is a hex');
    }
});

test('BE-05 the evac edits leave the maintenance carts alone', { skip }, () => {
    // Round 41 rebuilt evacA/evacB: the ids two saved "delete" keys used to name now belong to the
    // carts at x = -3.5. Those four keys are gone from the file; this keeps them out.
    const carts = [[-3.5, -1.4], [-3.5, 0.4]];
    for (const k of keys) {
        if (!/^tile:evac[AB]:shell#/.test(k)) continue;
        const m = parts[k];
        if (!m) continue;
        for (const [x, z] of carts) {
            const d = Math.hypot(m.position.x - x, m.position.z - z);
            assert.ok(d > 0.6, k + ': this edit reaches a cart of a launch bay (' + d.toFixed(2) + ' m away)');
        }
    }
});

test('BE-06 a saved edit reaches the room in a real session, whatever its number', { skip }, () => {
    // The bug this pins: a key was exact only on the gallery, because a session deals the tiles into
    // other room numbers. Build a game board with every room explored and count what lands.
    const state = createGame({
        seed: 'board-edits-audit', mode: 'original', draft: false,
        players: [{ name: 'A', charId: 'soldier' }, { name: 'B', charId: 'scout' }],
    });
    const gview = viewFor(state, state.players[0].id);
    // A played-out board: every room explored, carrying the tile the deal gave it (the special rooms
    // are their own tile). This is what the scene builds in a session.
    for (const id of Object.keys(gview.roomState)) {
        const kind = state.ship.rooms[id].kind;
        const special = ['cockpit', 'hibernatorium', 'engine'].includes(kind);
        gview.roomState[id].explored = true;
        gview.roomState[id].tile = special ? kind : (state.secret.tiles[id] || null);
    }
    const inPlay = new Set(Object.values(gview.roomState).map(r => r.tile).filter(Boolean));
    const game = new Scene3D(el(), {});
    game.paused = true;
    game.setEdits(saved);
    const applied = new Set();
    const apply = game.applyEdit.bind(game);
    game.applyEdit = m => {
        const id = m && m.metadata && m.metadata.editId;
        if (id && saved[id]) applied.add(id);
        return apply(m);
    };
    game.update(gview, ROOM_TILES, INTRUDER_NAMES, []);
    // Three of these parts exist only in some sessions: their id carries the ordinal of a name that
    // repeats once per door (a threshold) or once per wall prop, and a room with another set of doors
    // builds a different number of them. In the gallery they are there (BE-02); here they may not be.
    const SESSION_DEPENDENT = new Set([
        'tile:decon:shell#p~204', 'tile:decon:shell#p~205',   // two props removed in decon
        'tile:repository:shell#th~3',                          // a threshold dragged in the repository
    ]);
    const expected = keys.filter(k => inPlay.has(/^tile:([a-zA-Z0-9_]+):shell#/.exec(k)[1])
        && !STALE.has(k) && !SESSION_DEPENDENT.has(k));
    assert.ok(expected.length > 0, 'this board holds at least one tile the designer edited');
    assert.deepEqual([...applied].sort(), expected.sort(),
        'every edit whose tile is in play applies, and no edit of an absent tile does');
});
