// board-edits.test.mjs — the designer's saved board edits (nemesis/client/board-edits.json).
//   node --test nemesis/tools/board-edits.test.mjs
//
// That file is written by the Nemesis tab of editor.bat: the parts a designer moved, turned,
// recoloured, hid or deleted. It is local (it sits in .gitignore) and optional — the tests skip when
// it is not there. What they pin down:
//   * a key is "<owner>#<build index>" and every owner is a room of the gallery board;
//   * every key still finds its part, except a short list of ids that no longer exist anywhere;
//   * the game board ignores these edits: its room numbers hold other tiles, so an edit would move
//     or delete an unrelated part (see editsAllowed() in scene3d.js);
//   * the evacA/evacB edits no longer reach the maintenance carts, which round 41 moved onto the
//     ids these two saved "delete" keys used to point at.
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
const { galleryShip, ROOM_TILES } = await import('../shared/ship.mjs');
const { INTRUDER_NAMES } = await import('../shared/data/cards.mjs');

const FILE = new URL('../client/board-edits.json', import.meta.url);
const saved = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')).edits || {} : {};
const skip = fs.existsSync(FILE) ? false : 'no nemesis/client/board-edits.json in this checkout';

// Ids that name a part no longer built by any version we have: the designer's file was saved before
// these props were rebuilt, and the numbers landed past the end of their room. They cost nothing —
// an edit with no part is skipped — but they are listed here so a new orphan fails the suite.
const STALE = new Set([
    'room:005:shell#626',   // comms: a prop deleted by hand from an older build
    'room:010:shell#543',   // generator: three ids from before the core was rebuilt
    'room:010:shell#544',
    'room:010:shell#545',
]);

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

test('BE-01 every key is "<owner>#<n>" and its owner is a gallery room', { skip }, () => {
    assert.ok(keys.length > 0, 'the saved file has edits');
    const rooms = new Set(Object.keys(ship.rooms));
    for (const k of keys) {
        const m = /^room:(\d+):shell#(\d+)$/.exec(k);
        assert.ok(m, k + ': the key names a room shell and a build index');
        assert.ok(rooms.has(m[1]), k + ': room ' + m[1] + ' is not a room of the gallery board');
    }
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

test('BE-04 a game board ignores the gallery edits', { skip }, () => {
    const proto = Scene3D.prototype;
    assert.equal(proto.editsAllowed.call({ ship: { mode: 'gallery' } }), true, 'the gallery gets the edits');
    assert.equal(proto.editsAllowed.call({ ship: { mode: 'original' } }), false, 'a game board does not');
    assert.equal(proto.editsAllowed.call({}), true, 'no ship yet: the editor builds before it knows');
    // and a mesh on a non-gallery board is handed back untouched
    const mesh = { position: { set() { throw new Error('moved'); } }, metadata: { editId: 'room:001#0' }, setEnabled() { throw new Error('hidden'); } };
    const host = { ship: { mode: 'original' }, edits: { 'room:001#0': { pos: [1, 1, 1], hidden: true } }, editsAllowed: proto.editsAllowed };
    assert.equal(proto.applyEdit.call(host, mesh), mesh, 'the part comes back as built');
});

test('BE-05 the evac edits leave the maintenance carts alone', { skip }, () => {
    // Round 41 rebuilt evacA/evacB: the ids two saved "delete" keys used to name now belong to the
    // carts at x = -3.5. Those four keys are gone from the file; this keeps them out.
    const carts = [[-3.5, -1.4], [-3.5, 0.4]];
    for (const k of keys) {
        if (!/^room:00[78]:shell#/.test(k)) continue;
        const m = parts[k];
        if (!m) continue;
        for (const [x, z] of carts) {
            const d = Math.hypot(m.position.x - x, m.position.z - z);
            assert.ok(d > 0.6, k + ': this edit reaches a cart of a launch bay (' + d.toFixed(2) + ' m away)');
        }
    }
});
