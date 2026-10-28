// scene.test.mjs — the 3D board itself, built headlessly with the Babylon that the repo ships.
//   node --test nemesis/tools/scene.test.mjs
// The complaints this pins down, all about geometry rather than rules:
//   * a corridor ended at the wall ring at whatever angle its first bend gave, so the doorway of the
//     room showed a black gap with the tube arriving beside it;
//   * figures walked from room centre to room centre in a straight line, through the hull;
//   * figures and room objects stood at y = 0 while the floor plates are 0.10 thick — sunk in;
//   * the fire stood on a flat glowing orange disc;
//   * a dead adult was a dark box, a human corpse a blue one.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const noop = () => {};
const el = () => ({
    style: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    appendChild: noop, removeChild: noop, getContext: () => null, addEventListener: noop, removeEventListener: noop,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    setAttribute: noop, getAttribute: () => null, focus: noop, blurable: true, width: 800, height: 600,
    clientWidth: 800, clientHeight: 600, focus: noop, blur: noop, setPointerCapture: noop, releasePointerCapture: noop,
    hasPointerCapture: () => false, requestPointerLock: noop, tabIndex: 0, nodeName: 'CANVAS',
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

// A real Babylon engine needs WebGL; NullEngine renders nothing but runs every builder.
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

// Labels are drawn on DynamicTextures; there is no 2D canvas under NullEngine, so the context is a
// recorder that accepts every drawing call the scene makes.
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
    constructor(name, opts, scene, gen) {
        this.name = name; this.opts = opts || {}; this.hasAlpha = false; this.wrapU = 0; this.wrapV = 0;
        this.uScale = 1; this.vScale = 1; this._ctx = makeCtx();
    }
    getContext() { return this._ctx; }
    getSize() { return { width: this.opts.width || 512, height: this.opts.height || 512 }; }
    update() { } dispose() { } getInternalTexture() { return null; }
}
Object.defineProperty(B, 'DynamicTexture', { value: HeadlessTexture, configurable: true, writable: true });

const { Scene3D } = await import('../client/scene3d.js');
const { createGame } = await import('../shared/engine/setup.mjs');
const { viewFor } = await import('../shared/view.mjs');
const { ROOM_TILES } = await import('../shared/ship.mjs');
const { INTRUDER_NAMES } = await import('../shared/data/cards.mjs');
const WALL_R = 6.3;   // the wall ring radius scene3d.js builds the rooms with

const state = createGame({ seed: 'scene', mode: 'original', draft: false, players: [{ name: 'Alpha', charId: 'soldier' }, { name: 'Beta', charId: 'scout' }] });
const view = viewFor(state, state.players[0].id);
const canvas = el();
const scene = new Scene3D(canvas, {});
scene.paused = true;
scene.update(view, ROOM_TILES, INTRUDER_NAMES, []);
const ship = view.ship;

test('SCN-01: a corridor ends on the doorway axis of both rooms', () => {
    for (const c of Object.values(ship.corridors)) {
        const pts = scene.corridorPoints(ship, c);
        assert.ok(pts.length >= 2, c.id + ': a corridor needs two ends');
        const A = scene.pos(ship.rooms[c.a]), Bp = scene.pos(ship.rooms[c.b]);
        const dirA = Bp.subtract(A).normalize(), dirB = A.subtract(Bp).normalize();
        const endA = pts[0], endB = pts[pts.length - 1];
        // the end must sit on the line centre -> neighbour (that is where the doorway is)
        const offA = endA.subtract(A).subtract(dirA.scale(endA.subtract(A).dot(dirA))).length();
        const offB = endB.subtract(Bp).subtract(dirB.scale(endB.subtract(Bp).dot(dirB))).length();
        assert.ok(offA < 0.01, c.id + ': the end at ' + c.a + ' is ' + offA.toFixed(2) + ' off the doorway axis');
        assert.ok(offB < 0.01, c.id + ': the end at ' + c.b + ' is ' + offB.toFixed(2) + ' off the doorway axis');
        // and it reaches into the wall ring instead of stopping short of it
        assert.ok(endA.subtract(A).length() <= WALL_R + 0.01, c.id + ': the tube stops short of the wall at ' + c.a);
        assert.ok(endB.subtract(Bp).length() <= WALL_R + 0.01, c.id + ': the tube stops short of the wall at ' + c.b);
        assert.ok(endA.subtract(A).length() > WALL_R - 0.5, c.id + ': the tube runs into the room at ' + c.a);
    }
});

test('SCN-02: a figure moves along the corridor, not through the hull', () => {
    const route = scene.routeTo('011', '014');
    assert.ok(route && route.length >= 2, '011 -> 014 is a corridor move');
    const pts = scene.corridorPoints(ship, ship.corridors[ship.rooms['011'].exits.find(e => e.to === '014').corridor]);
    assert.equal(route.length, pts.length, 'the whole corridor is walked');
    const start = scene.pos(ship.rooms['011']);
    assert.ok(route[0].subtract(start).length() < WALL_R, 'the route starts at the doorway of 011');
    // no route where there is no corridor: a pod launch is not a walk
    assert.equal(scene.routeTo('001', '016'), null);
    assert.equal(scene.routeTo('011', '011'), null);
});

test('SCN-03: every corridor in a game ship is reachable from both of its rooms', () => {
    let checked = 0;
    for (const c of Object.values(ship.corridors)) {
        assert.ok(scene.routeTo(c.a, c.b), 'route ' + c.a + ' -> ' + c.b);
        assert.ok(scene.routeTo(c.b, c.a), 'route ' + c.b + ' -> ' + c.a);
        checked++;
    }
    assert.ok(checked >= 20, 'a whole ship of corridors (' + checked + ')');
});

test('SCN-04: figures and objects stand on the floor plates, not inside them', () => {
    const node = scene.roomNodes['011'];
    scene.addObject('egg', node.root, 0, '011', 0);
    const egg = scene.dynamic.find(m => m.name === 'obj_egg');
    assert.ok(egg, 'the object node is there');
    assert.equal(egg.parent, node.root, 'the object belongs to the room');
    assert.ok(Math.abs(egg.position.y - 0.10) < 1e-6, 'the object stands on the plates (y = ' + egg.position.y + ')');
    // the egg itself sits on top of its own node
    const sphere = egg.getChildMeshes()[0];
    assert.ok(sphere.position.y > 0.3, 'the egg is above the deck inside the node');
});

test('SCN-05: a human corpse and an intruder carcass are bodies, not slabs', () => {
    const node = scene.roomNodes['011'];
    scene.addObject('corpse', node.root, 1, '011', 1);
    scene.addObject('carcass', node.root, 2, '011', 2);
    const objNodes = scene.dynamic.filter(m => /^obj_/.test(m.name));
    const bodies = objNodes.flatMap(n => (n.getDescendants ? n.getDescendants() : [])).filter(m => /^body_/.test(m.name));
    const human = bodies.find(b => b.name === 'body_corpse');
    const xeno = bodies.find(b => b.name === 'body_carcass');
    assert.ok(human && xeno, 'both bodies are built');
    assert.ok(human.getChildMeshes().length >= 8, 'the human corpse has a body, limbs and a head (' + human.getChildMeshes().length + ' parts)');
    assert.ok(xeno.getChildMeshes().length >= 8, 'the carcass has a torso, ribs, head and tail (' + xeno.getChildMeshes().length + ' parts)');
    // every part must answer the click that picks the object up
    for (const m of human.getChildMeshes()) assert.equal(m.metadata && m.metadata.objectIndex, 1);
});

test('SCN-06: the figures themselves stand on the plates', () => {
    const me = view.players.find(p => p.charId);
    assert.ok(me, 'a character is on the board');
    const n = scene.chars[me.id];
    assert.ok(n, 'the figure is built');
    assert.ok(Math.abs(n.target.y - 0.10) < 1e-6, 'the walk target is on the floor (y = ' + n.target.y + ')');
    scene.animate();
    assert.ok(Math.abs(n.ch.root.position.y - 0.10) < 0.02, 'the figure stands on the floor (y = ' + n.ch.root.position.y.toFixed(3) + ')');
});

test('SCN-07: the fire has no flat glowing disc under it', () => {
    const node = scene.roomNodes['011'];
    scene.syncFire(node, true);
    assert.ok(node.fireParts.length > 10, 'the fire is built');
    for (const p of node.fireParts) {
        const m = p.material;
        if (!m) continue;
        const alpha = m.alpha === undefined ? 1 : m.alpha;
        const em = m.emissiveColor ? Math.max(m.emissiveColor.r, m.emissiveColor.g, m.emissiveColor.b) : 0;
        assert.ok(!(alpha < 0.5 && em > 0.4), 'a translucent glowing disc: alpha ' + alpha + ', emissive ' + em.toFixed(2));
    }
});

test('SCN-08: a figure that changes rooms gets a corridor route', () => {
    const me = view.players.find(p => p.charId);
    const n = scene.chars[me.id];
    assert.equal(me.room, '011', 'the figure starts in 011');
    me.room = '014';                                  // a neighbour, one corridor away
    scene.update(view, ROOM_TILES, INTRUDER_NAMES, []);
    assert.ok(Array.isArray(n.route) && n.route.length >= 2, 'the figure walks the corridor, not the hull');
    const end = scene.routeTo('011', '014');
    assert.equal(n.route.length, end.length, 'the whole corridor is used');
    assert.ok(n.route[0].subtract(end[0]).length() < 1e-6, 'starting at the same doorway');
    // one step of animation moves it toward the first waypoint
    const before = n.ch.root.position.clone();
    scene.animate();
    const moved = n.ch.root.position.subtract(before).length();
    assert.ok(moved > 0, 'the figure moved');
});

test('SCN-09: no green tongue hangs out of an intruder mouth', async () => {
    const { buildIntruder } = await import('../client/characters.js');
    for (const type of ['adult', 'drone', 'queen']) {
        const root = buildIntruder(scene.scene, type);
        const tongue = root.getChildMeshes().find(m => m.material && m.material.diffuseColor && m.material.diffuseColor.toHexString().toLowerCase() === '#5a7a2a');
        assert.ok(!tongue, type + ': the pale-green inner jaw is gone');
        assert.ok(root.getChildMeshes().length > 10, type + ': the intruder is still built');
    }
});
