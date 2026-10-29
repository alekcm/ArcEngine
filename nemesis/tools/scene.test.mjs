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
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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

const { Scene3D, FLOOR_Y } = await import('../client/scene3d.js');
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

test('SCN-10: a corridor never doubles back — no fold, no elbow, no torn tube', () => {
    // 013-014 used to be a 10-unit zigzag between two 6.3-unit wall rings: the hand-placed bend
    // point sat far off the axis of a very short passage and the tube folded back on itself, so the
    // corridor read as three loose pieces and the door frame straddled a kink. Every step of a
    // corridor must move towards the room at its far end, and no turn may be sharper than 35
    // degrees, or the box sections leave a wedge in the deck.
    for (const c of Object.values(ship.corridors)) {
        const pts = scene.corridorPoints(ship, c);
        assert.ok(pts.length >= 2, c.id + ': two ends');
        const A = scene.pos(ship.rooms[c.a]), Bp = scene.pos(ship.rooms[c.b]);
        const dir = Bp.subtract(A).normalize();
        let len = 0;
        for (let i = 0; i < pts.length - 1; i++) {
            const step = pts[i + 1].subtract(pts[i]);
            len += step.length();
            assert.ok(step.dot(dir) > -1e-6, c.id + ': step ' + i + ' runs back towards ' + c.a);
        }
        for (let i = 1; i < pts.length - 1; i++) {
            const u = pts[i].subtract(pts[i - 1]).normalize(), v = pts[i + 1].subtract(pts[i]).normalize();
            const turn = Math.acos(Math.min(1, Math.max(-1, u.dot(v)))) * 180 / Math.PI;
            assert.ok(turn <= 35, c.id + ': a ' + turn.toFixed(0) + '-degree elbow at point ' + i);
        }
        assert.ok(len <= A.subtract(Bp).length() + 6, c.id + ': the tube takes a detour of ' + (len - A.subtract(Bp).length()).toFixed(1));
    }
});

test('SCN-11: the tech entrance carries its noise numbers on the roof, face up and clear of the pipes', () => {
    // ru: цифры тех. коридора — на крыше люка, а не только на самой балке коридора. Плоскость
    // односторонняя: её надо положить лицом вверх (rotation.x = -pi/2), иначе с высоты читается
    // зеркальный/перевёрнутый глиф. Трубы и перекладины сдвинуты к краям, чтобы центр был свободен.
    let checked = 0;
    for (const r of Object.values(ship.rooms)) {
        if (!r.tech) continue;
        const node = scene.roomNodes[r.id];
        assert.ok(node && node.techDecal, r.id + ': на крыше техкоридора есть трафарет');
        const plane = node.techDecal;
        // A Babylon plane is painted on its -Z face; +pi/2 turns that face up (the pose the corridor
        // numbers use). The old flat pose used -pi/2 and showed the digits through the back, mirrored.
        assert.ok(Math.abs(plane.rotation.x - Math.PI / 2) < 1e-6, r.id + ': трафарет лежит лицом вверх');
        const face = { x: 0, y: 0, z: -1 };
        const cx = Math.cos(plane.rotation.x), sx = Math.sin(plane.rotation.x);
        const cz = Math.cos(plane.rotation.z), sz = Math.sin(plane.rotation.z);
        const rz = { x: face.x * cz - face.y * sz, y: face.x * sz + face.y * cz, z: face.z };
        const n = { x: rz.x, y: rz.y * cx - rz.z * sx, z: rz.y * sx + rz.z * cx };
        assert.ok(n.y > 0.999, r.id + ': лицевая сторона смотрит вверх (n.y = ' + n.y.toFixed(2) + ')');
        assert.ok(plane.position.y > 1.875, r.id + ': трафарет выше крыши (y = ' + plane.position.y + ')');
        // The number belongs to the hatch, not to the room floor: it sits on the stub's own roof.
        // The hatch straddles the wall ring, so its roof (a 2.4 x 2.4 plate) is centred on WALL_R.
        const out = Math.hypot(plane.position.x, plane.position.z);
        assert.ok(Math.abs(out - WALL_R) < 0.05, r.id + ': трафарет на крыше техкоридора (r = ' + out.toFixed(2) + ')');
        assert.ok(Math.abs(plane.rotation.y - node.techAngle) < 1e-6, r.id + ': трафарет повёрнут вместе с коридором');
        assert.ok(Math.abs(plane.rotation.z) < 1e-6, r.id + ': цифры стоят верхом наружу — читаются из комнаты');
        const nums = (r.techNums && r.techNums.length) ? r.techNums : [4];
        assert.equal(String(plane.metadata.decal).split('|')[0], nums.join(' / '), r.id + ': на крыше напечатаны номера этого входа');
        checked++;
    }
    assert.ok(checked >= 5, 'у техкоридоров есть входы (' + checked + ')');
    // Alt repaints the very same stencil neon, exactly like the numbers on the corridor beams.
    const first = Object.values(ship.rooms).find(r => r.tech);
    scene.setAlt(true);
    assert.match(String(scene.roomNodes[first.id].techDecal.metadata.decal), /\|n$/, 'Alt: неон');
    scene.setAlt(false);
    assert.match(String(scene.roomNodes[first.id].techDecal.metadata.decal), /\|p$/, 'обычная краска');
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
    assert.ok(Math.abs(egg.position.y - FLOOR_Y) < 1e-6, 'the object stands on the floor finish (y = ' + egg.position.y + ')');
    // the egg itself sits on top of its own node
    const sphere = egg.getChildMeshes()[0];
    assert.ok(sphere.position.y > 0.3, 'the egg is above the deck inside the node');
});

test('SCN-12: the floor finish is what everything stands on — the shell, the furniture and the hatch', () => {
    const node = scene.roomNodes['011'];
    assert.ok(node.shell && node.shell.root, 'the room is explored and has a shell');
    const shellY = node.shell.root.position.y;
    assert.ok(Math.abs(shellY - FLOOR_Y) < 1e-6, 'the walls and furniture stand on the finish (y = ' + shellY + ')');
    // the finish itself belongs to the room base and tops out at the walking surface; only the paint
    // (the red cross, the hazard outlines) lies on top of it
    const finish = node.root.getChildMeshes().filter(m => !m.parent || m.parent === node.root);
    const tops = finish.map(m => m.getBoundingInfo().boundingBox.maximumWorld.y).filter(y => y > 0.05 && y < 0.35);
    assert.ok(tops.length > 0, 'the finish is built into the room base');
    assert.ok(Math.max(...tops) <= FLOOR_Y + 0.03, 'the finish tops out on the walking surface (' + Math.max(...tops).toFixed(3) + ')');
    assert.ok(Math.max(...tops) >= FLOOR_Y - 0.01, 'and really reaches it (' + Math.max(...tops).toFixed(3) + ')');
    // the tech hatch is lifted so its runner is level with the room floor
    const techNode = Object.values(scene.roomNodes).find(n => n.techLeds.length);
    assert.ok(techNode, 'the ship has a technical corridor entrance');
    assert.ok(techNode.techLeds.length >= 10, 'hatch: light rails, floor runner and the LED ring (' + techNode.techLeds.length + ')');
    const ys = techNode.techLeds.map(l => l.getAbsolutePosition().y).sort((a, b) => a - b);
    assert.ok(ys[0] > FLOOR_Y - 0.06, 'no part of the hatch stays under the floor (lowest y = ' + ys[0].toFixed(3) + ')');
    // The runner is a 6 cm strip, so it is the strip's TOP face that has to be the walking surface:
    // its centre sits half a strip below the floor, and a figure steps onto the hatch with no step.
    const runner = techNode.techLeds.reduce((a, b) => (a.getAbsolutePosition().y <= b.getAbsolutePosition().y ? a : b));
    const runnerTop = runner.getBoundingInfo().boundingBox.maximumWorld.y;
    assert.ok(Math.abs(runnerTop - FLOOR_Y) < 0.02, 'the floor runner is flush with the floor (top y = ' + runnerTop.toFixed(3) + ')');
});

test('SCN-13: every blue part of the tech hatch turns yellow with a noise token', () => {
    const tech = Object.keys(scene.roomNodes).find(id => scene.roomNodes[id].techLeds.length);
    assert.ok(tech, 'a room with a technical corridor');
    scene.update(view, ROOM_TILES, INTRUDER_NAMES, []);
    const leds = scene.roomNodes[tech].techLeds;
    assert.ok(leds.length >= 10, 'rails, runner and ring are all LEDs (' + leds.length + ')');
    const blue = leds[0].material;
    for (const l of leds) assert.equal(l.material, blue, 'every blue part shares one material');
    assert.ok(/3fa9ff/i.test(blue.emissiveColor.toHexString()), 'blue without noise (' + blue.emissiveColor.toHexString() + ')');
    // a noise token in the tech corridor: the same material turns every part yellow at once
    state.ship.techNoise = true;
    const v2 = viewFor(state, state.players[0].id);
    scene.update(v2, ROOM_TILES, INTRUDER_NAMES, []);
    const yellow = scene.roomNodes[tech].techLeds[0].material;
    for (const l of scene.roomNodes[tech].techLeds) assert.equal(l.material, yellow, 'and they all turn together');
    assert.ok(/f1c40f/i.test(yellow.emissiveColor.toHexString()), 'yellow with a noise token (' + yellow.emissiveColor.toHexString() + ')');
    state.ship.techNoise = false;
    scene.update(view, ROOM_TILES, INTRUDER_NAMES, []);
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
    assert.ok(Math.abs(n.target.y - FLOOR_Y) < 1e-6, 'the walk target is on the floor (y = ' + n.target.y + ')');
    scene.animate();
    assert.ok(Math.abs(n.ch.root.position.y - FLOOR_Y) < 0.02, 'the figure stands on the floor (y = ' + n.ch.root.position.y.toFixed(3) + ')');
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

test('SCN-13: the number stencils are kept out of the bloom pass', () => {
    // ru: при зажатом Alt цифры на проходах смазывались блумом. GlowLayer размывает в экранных
    // координатах, поэтому на дальнем плане мелкий трафарет расплывался в пятно. Трафарет — краска,
    // а не лампа: он рисует свой неон сам (setDecal) и в пост-процесс не попадает.
    let decals = 0, tech = 0;
    for (const n of Object.values(scene.corridorNodes)) {
        if (!n.decal) continue;
        assert.equal(scene.glow.hasMesh(n.decal), false, 'коридор ' + n.decal.name + ': номер не должен блумить');
        decals++;
    }
    for (const n of Object.values(scene.roomNodes)) {
        if (!n.techDecal) continue;
        assert.equal(scene.glow.hasMesh(n.techDecal), false, n.data.id + ': номер на крыше техкоридора не блумит');
        tech++;
    }
    assert.ok(decals >= 5, 'номера коридоров существуют (' + decals + ')');
    assert.ok(tech >= 5, 'номера техкоридоров существуют (' + tech + ')');
    // control: an ordinary part of the board is still rendered through the glow layer
    assert.equal(scene.glow.hasMesh(scene.roomNodes['011'].sel), true, 'остальное свечение Alt осталось');
});

test('SCN-14: the Alt name of a room is half again as big as before', () => {
    const node = scene.roomNodes['011'];
    const width = m => m.getBoundingInfo().boundingBox.extendSize.x * 2;
    const alt = width(node.altLabel), id = width(node.label);
    assert.ok(Math.abs(alt - 6.0) < 0.01, 'имя комнаты в Alt: ' + alt.toFixed(2) + ' (было 4.0)');
    assert.ok(Math.abs(alt - id * 2) < 0.01, 'имя вдвое шире таблички с номером (' + id.toFixed(2) + ')');
    // the live distance scaling multiplies both, so the name keeps its size relative to the board
    scene.animate();
    assert.equal(node.altLabel.scaling.x, node.label.scaling.x, 'обе подписи масштабируются одинаково');
});

test('SCN-15: the Search colours of a room are drawn over everything', () => {
    // ru: цвета, присутствующие в комнате, рисовать поверх всех объектов. Своя группа рендера с
    // очищенным буфером глубины: ни стена, ни мебель, ни фигура не могут закрыть цвет комнаты.
    const setup = scene.scene.getAutoClearDepthStencilSetup(1);
    assert.equal(setup.autoClear, true, 'глубина группы 1 очищается перед отрисовкой');
    assert.equal(setup.depth, true, 'именно глубина');
    const node = scene.roomNodes['011'];
    node.dotKey = null;
    scene.syncItemDots(node, 'laboratory');           // three green icons
    const dots = node.itemDots.root.getChildMeshes();
    assert.ok(dots.length >= 6, 'три диска и три кольца (' + dots.length + ')');
    for (const m of dots) assert.equal(m.renderingGroupId, 1, m.name + ' рисуется поверх мира');
    // the world itself stays in group 0, so the overlay really is on top of it
    assert.equal(node.sel.renderingGroupId, 0, 'мир остаётся в нулевой группе');
    scene.syncItemDots(node, null);
});

test('SCN-16: a room with a Computer has a clickable console', () => {
    const v = JSON.parse(JSON.stringify(view));
    const roomId = Object.keys(v.ship.rooms).find(id => id !== '011');
    assert.ok(roomId, 'на корабле есть вторая комната');
    v.roomState[roomId].explored = true;
    v.roomState[roomId].tile = 'comms';              // a room with a Computer
    v.roomState[roomId].objects = [];
    v.roomState[roomId].fire = false; v.roomState[roomId].malfunction = false;
    scene.updateRoom(v, v.ship.rooms[roomId]);
    const node = scene.roomNodes[roomId];
    assert.ok(node.cpu, roomId + ': у компьютера есть зона клика');
    assert.equal(node.cpu.isPickable, true, 'зона клика ловит мышь');
    assert.equal(node.cpu.isVisible, false, 'зона клика не рисуется');
    assert.equal(node.cpu.metadata.computer, true, 'метка компьютерного действия');
    assert.equal(node.cpu.metadata.roomId, roomId, 'метка комнаты');
    const p = node.cpu.position;
    assert.ok(Math.hypot(p.x, p.z) < WALL_R, 'зона клика внутри комнаты (r = ' + Math.hypot(p.x, p.z).toFixed(2) + ')');
    assert.ok(p.y > 0.3 && p.y < 2.0, 'зона клика на высоте консоли (y = ' + p.y.toFixed(2) + ')');
    // a room without a Computer gets no such box
    const plain = Object.keys(v.ship.rooms).find(id => id !== '011' && id !== roomId);
    v.roomState[plain].explored = true; v.roomState[plain].tile = 'cafeteria';
    v.roomState[plain].objects = []; v.roomState[plain].fire = false; v.roomState[plain].malfunction = false;
    scene.updateRoom(v, v.ship.rooms[plain]);
    assert.ok(!scene.roomNodes[plain].cpu, plain + ': без компьютера зоны клика нет');
});

test('SCN-17: a corridor shows only the half next to an explored room', () => {
    // ru: пока комната не разведана, её половина коридора (арки, стойка поворота, лоток) скрыта; с
    // разведанной — показана. Сама «одиночная балка» без арки — предмет теста DR-07 в doors.test.mjs:
    // стойка поворота лежит в списке своей половины, а не в общей статике коридора.
    const on = (m) => { let c = m; while (c) { if (c.isEnabled && !c.isEnabled()) return false; c = c.parent; } return true; };
    const v = JSON.parse(JSON.stringify(view));
    for (const id of Object.keys(v.roomState)) v.roomState[id].explored = false;
    const isSlot = (id) => ['slot1', 'slot2'].includes(v.ship.rooms[id].kind);
    const c = Object.values(v.ship.corridors).find(c2 => isSlot(c2.a) && isSlot(c2.b));
    assert.ok(c, 'на доске есть коридор между двумя слотами');
    const node = scene.corridorNodes[c.id];
    scene.updateCorridor(v, c);
    assert.ok(node.ribsA.length > 0 && node.ribsB.length > 0, c.id + ': у коридора две половины арок');
    assert.equal(node.ribsA.filter(on).length, 0, c.id + ': половина неразведанной комнаты скрыта');
    assert.equal(node.ribsB.filter(on).length, 0, c.id + ': вторая половина тоже');
    v.roomState[c.a].explored = true;
    scene.updateCorridor(v, c);
    assert.equal(node.ribsA.filter(on).length, node.ribsA.length, c.id + ': половина разведанной комнаты видна вся');
    assert.equal(node.ribsB.filter(on).length, 0, c.id + ': вторая половина остаётся скрытой');
    scene.update(view, ROOM_TILES, INTRUDER_NAMES, []);   // leave the shared scene as the other tests expect it
});

// Geometry signatures use the actual vertices and world transforms, not names or mesh counts.
const geometrySignature = ch => ch.root.getChildMeshes().filter(m => m.name !== 'flash').map(m => {
    const round = n => Math.abs(n) < 0.000005 ? 0 : Number(n.toFixed(5));
    m.computeWorldMatrix(true);
    return JSON.stringify([(m.getVerticesData(B.VertexBuffer.PositionKind) || []).map(round), Array.from(m.getWorldMatrix().m, round)]);
}).sort();

test('LAB-04: every preset has distinct geometry, the original and other characters stay unchanged', async () => {
    const { buildCharacter, DEFAULTS } = await import('../client/characters.js');
    const { LABRAT_PARTS, characterParts } = await import('../shared/appearance.mjs');
    const signature = (charId, parts) => {
        const ch = buildCharacter(scene.scene, charId, {}, parts), result = geometrySignature(ch);
        ch.root.dispose();
        return result;
    };
    const defaults = characterParts('labrat');
    const original = signature('labrat');
    // Golden signature captured from the pre-redesign model, with mesh names deliberately excluded.
    assert.equal(createHash('sha256').update(JSON.stringify(original)).digest('hex'),
        'e395aff43224917bcaa7955ea9ea363a0b135ccb3bad8d91b3a531158efa18d0');
    assert.deepEqual(signature('labrat', defaults), original, 'omitting parts preserves the original model');
    for (const slot of LABRAT_PARTS) {
        const variants = slot.options.map(option => JSON.stringify(signature('labrat', { ...defaults, [slot.id]: option.id })));
        assert.equal(new Set(variants).size, variants.length, `every ${slot.id} choice needs distinct geometry`);
    }
    assert.deepEqual(signature('labrat'), original, 'building presets did not mutate the shared spec');
    for (const charId of Object.keys(DEFAULTS).filter(id => id !== 'labrat')) {
        assert.deepEqual(signature(charId, { hair: 'messy', outfit: 'torn', eyes: 'tails', implants: 'wrapped' }), signature(charId),
            `${charId} ignores Lab Rat presets`);
    }
});

test('LAB-06: all 144 combinations keep the patient features, paint zones and a stable torn hem', async () => {
    const { buildCharacter } = await import('../client/characters.js');
    const { LABRAT_PARTS } = await import('../shared/appearance.mjs');
    const options = id => LABRAT_PARTS.find(slot => slot.id === id).options.map(option => option.id);
    const colors = { skin: '#123456', hair: '#234567', gown: '#345678', pants: '#456789', bandage: '#56789a', lights: '#6789ab' };
    let checked = 0;
    for (const hair of options('hair')) for (const eyes of options('eyes'))
        for (const outfit of options('outfit')) for (const implants of options('implants')) {
            const parts = { hair, eyes, outfit, implants }, label = JSON.stringify(parts);
            const ch = buildCharacter(scene.scene, 'labrat', {}, parts), meshes = ch.root.getChildMeshes();
            const band = meshes.find(m => m.name === 'lab_blindfold');
            assert.ok(band && ch.zones.bandage.includes(band), label + ': cloth over eyes');
            const bbox = band.getBoundingInfo().boundingBox;
            assert.ok(bbox.maximum.y - bbox.minimum.y >= 0.099, label + ': full-height blindfold');
            assert.ok(ch.zones.gown.some(m => m.name === 'lab_gown'), label + ': patient gown');
            assert.ok(ch.zones.lights?.length >= 2, label + ': implant connections');
            if (eyes === 'tails') {
                const tails = ch.zones.bandage.filter(m => m.name === 'lab_blindfold_tail');
                assert.equal(tails.length, 2, label + ': two hanging ties');
                if (hair === 'ponytail') {
                    const hairBack = Math.min(...ch.zones.hair.map(m => m.position.z + m.getBoundingInfo().boundingBox.minimum.z));
                    assert.ok(tails.every(m => m.position.z + m.getBoundingInfo().boundingBox.maximum.z < hairBack), label + ': ties remain visible over the ponytail');
                }
            }
            for (const side of ['legL', 'legR']) {
                assert.ok(ch.zones.skin.some(m => m.parent.name === side && m.position.y < -1.2), label + ': bare ' + side);
            }
            assert.ok(meshes.some(m => m.material?.diffuseColor.toHexString() === '#F4F6F8'
                && Math.abs(m.position.x - 0.1) < 0.001 && Math.abs(m.position.y - 1.9) < 0.001), label + ': ID tag');
            if (outfit === 'torn') {
                const hem = meshes.filter(m => m.parent.name === 'lab_gown_hem');
                assert.equal(hem.length, 4, label + ': separate irregular flaps');
                ch.animate(0.1, true); ch.animate(0.2, true);
                assert.ok(hem.every(m => m.parent.name === 'lab_gown_hem'), label + ': hem is not pulled onto a leg');
            }
            ch.setColors(colors);
            for (const [zone, hex] of Object.entries(colors)) {
                assert.ok(ch.zones[zone]?.length, label + ': ' + zone + ' is paintable');
                assert.ok(ch.zones[zone].every(m => m.material.diffuseColor.toHexString().toLowerCase() === hex), label + ': ' + zone + ' color');
            }
            ch.root.dispose(); checked++;
        }
    assert.equal(checked, 144);
});

test('LAB-05: the table rebuilds a changed appearance and removes the old shadow casters', () => {
    const v = JSON.parse(JSON.stringify(view));
    const p = v.players[0]; p.charId = 'labrat'; p.parts = { hair: 'loose', eyes: 'bandage', outfit: 'gown', implants: 'classic' };
    scene.updateCharacters(v);
    const first = scene.chars[p.id];
    const oldRoot = first.ch.root, oldMeshes = oldRoot.getChildMeshes();
    assert.ok(first.grab && first.label, 'the table figure has its hitbox and label');
    scene.updateCharacters(v);
    assert.equal(scene.chars[p.id].ch.root, oldRoot, 'unchanged parts do not rebuild the figure');
    p.parts = { ...p.parts, hair: 'messy', eyes: 'layered' };
    scene.updateCharacters(v);
    const rebuilt = scene.chars[p.id];
    assert.notEqual(rebuilt.ch.root, oldRoot, 'new preset builds a new figure');
    assert.equal(oldRoot.isDisposed(), true, 'the old figure was disposed');
    assert.ok(rebuilt.grab && rebuilt.label, 'hitbox and label were recreated');
    assert.equal(rebuilt.grab.metadata.player, p.id, 'the hitbox still selects the right player');
    const shadowList = scene.shadows.getShadowMap().renderList || [];
    assert.ok(oldMeshes.every(m => !shadowList.includes(m)), 'old meshes no longer cast shadows');
    assert.ok(rebuilt.ch.root.getChildMeshes().some(m => shadowList.includes(m)), 'the new figure casts shadows');
    scene.updateCharacters(view);
});

test('SENTRY-03: original geometry is preserved and each option changes real geometry', async () => {
    const { buildCharacter } = await import('../client/characters.js');
    const { SENTRY_PARTS, characterParts } = await import('../shared/appearance.mjs');
    const signature = parts => {
        const ch = buildCharacter(scene.scene, 'sentry', {}, parts), result = geometrySignature(ch);
        ch.root.dispose();
        return result;
    };
    const original = signature();
    // Captured from the original Sentry before the workshop, excluding names and materials.
    assert.equal(createHash('sha256').update(JSON.stringify(original)).digest('hex'),
        'd18d5faf56cc3579416322e33583262a02b80bd4cfc4555bc69dccbb86baceab');
    const defaults = characterParts('sentry');
    assert.deepEqual(signature(defaults), original);
    for (const slot of SENTRY_PARTS) {
        const variants = slot.options.map(option => JSON.stringify(signature({ ...defaults, [slot.id]: option.id })));
        assert.equal(new Set(variants).size, variants.length, `${slot.id}: each option changes geometry`);
    }
    assert.deepEqual(signature(), original, 'presets do not mutate the original spec');
});

test('SENTRY-04: every combination retains the recognisable gear, colors and animated attachments', async () => {
    const { buildCharacter } = await import('../client/characters.js');
    const { SENTRY_PARTS } = await import('../shared/appearance.mjs');
    const options = id => SENTRY_PARTS.find(slot => slot.id === id).options.map(option => option.id);
    const colors = { armor: '#123456', accent: '#234567', pants: '#345678', helmet: '#456789', visor: '#56789a' };
    let checked = 0;
    for (const optics of options('optics')) for (const respirator of options('respirator'))
        for (const shoulders of options('shoulders')) for (const cloak of options('cloak')) {
            const parts = { optics, respirator, shoulders, cloak }, label = JSON.stringify(parts);
            const ch = buildCharacter(scene.scene, 'sentry', {}, parts), meshes = ch.root.getChildMeshes();
            assert.ok(ch.zones.helmet.some(m => m.name === 'sentry_helmet'), label + ': sealed helmet');
            assert.ok(ch.zones.visor.some(m => m.name === 'sentry_visor'), label + ': visor');
            assert.ok(ch.zones.accent.some(m => m.name === 'sentry_mask'), label + ': respirator');
            assert.equal(meshes.filter(m => m.name === 'sentry_filter').length, 2, label + ': filters');
            assert.equal(ch.zones.visor.filter(m => m.name === 'sentry_lens').length, optics === 'cluster' ? 4 : 3, label + ': night optics');
            assert.ok(meshes.some(m => m.name === 'sentry_cloak_back'), label + ': cape');
            const gun = ch.root.getDescendants().find(n => n.name === 'gun');
            assert.ok(gun && gun.getChildMeshes().length >= 6, label + ': weapon remains attached');
            if (cloak !== 'classic') {
                const drape = ch.root.getDescendants().find(n => n.name === 'sentry_cloak_drape');
                assert.ok(drape && drape.parent === ch.root, label + ': cape stays on the torso');
            }
            if (shoulders !== 'classic') {
                const extra = meshes.filter(m => m.name === 'sentry_shoulder_detail');
                assert.equal(extra.length, 4, label + ': shoulder details');
                assert.ok(extra.every(m => ['armL', 'armR'].includes(m.parent.parent?.name)), label + ': extra plates follow the arms');
                ch.animate(0.1, true); ch.animate(0.2, true);
                assert.ok(extra.every(m => ['armL', 'armR'].includes(m.parent.parent?.name)), label + ': plates remain attached in motion');
            }
            ch.setColors(colors);
            for (const [zone, hex] of Object.entries(colors)) {
                assert.ok(ch.zones[zone]?.length, label + ': ' + zone + ' is paintable');
                assert.ok(ch.zones[zone].every(m => m.material.diffuseColor.toHexString().toLowerCase() === hex), label + ': ' + zone + ' color');
            }
            ch.root.dispose(); checked++;
        }
    assert.equal(checked, 81);
});

test('SENTRY-05: changing the Sentry appearance rebuilds the table figure without stale shadows', () => {
    const v = JSON.parse(JSON.stringify(view));
    const p = v.players[0]; p.charId = 'sentry';
    p.parts = { optics: 'classic', respirator: 'classic', shoulders: 'classic', cloak: 'classic' };
    scene.updateCharacters(v);
    const first = scene.chars[p.id], oldRoot = first.ch.root, oldMeshes = oldRoot.getChildMeshes();
    scene.updateCharacters(v);
    assert.equal(scene.chars[p.id].ch.root, oldRoot, 'unchanged figure is reused');
    p.parts = { optics: 'binocular', respirator: 'ribbed', shoulders: 'heavy', cloak: 'split' };
    scene.updateCharacters(v);
    const rebuilt = scene.chars[p.id];
    assert.notEqual(rebuilt.ch.root, oldRoot);
    assert.equal(oldRoot.isDisposed(), true);
    assert.equal(rebuilt.grab.metadata.player, p.id);
    const shadowList = scene.shadows.getShadowMap().renderList || [];
    assert.ok(oldMeshes.every(m => !shadowList.includes(m)));
    assert.ok(rebuilt.ch.root.getChildMeshes().some(m => shadowList.includes(m)));
    scene.updateCharacters(view);
});

const CREW_ORIGINAL_HASHES = {
    soldier: '6624ae8a142e282335ebfb4942f1fc3d99f197713baf48e0227c2597f425dec3',
    // The original Scout keeps its geometry apart from the repaired neck joint.
    scout: 'df384fe680d4ebeba9fd313f63d01f52025246a31f100b52db4a029b55caa20e',
    // The original Mechanic is unchanged except for the repaired neck and waist joints.
    mechanic: 'a97e7e4e829cb149f9626da7623e6381934dd52237c297196f8a9809df2cb401',
    // The original Pilot keeps its shape except for the repaired closed coat and joined hem.
    pilot: '0b317008a6d597f46cda0d8b6ce08fc48489a939abc0f7ed5ef1ae8e44ac9650',
    hacker: 'bf0e8e492b9a175443b8894ec6f506b9cb7980a78c5c9a0263cff99459578e27',
    // The original Scientist keeps its pose and equipment; only the neck joint was lengthened.
    scientist: '776876a693bef7e043c3420d3c0b949ee4eb6f9a2157bb1e14be538df7d63682',
    // Medic: joined neck, concealed nose, and a cap enlarged to cover all hairstyles.
    medic: '88a921309c55ee344371f5c2b6a86d9d1df4f2f690e7de53b3bdf05f7dd4ba41',
    // Janitor: joined neck and repaired original wand/nozzle attached to the moving hand.
    janitor: '9bd8d5deb1421f0ac686b8838f26812104059fef63b818c1b24555deeaa3082c',
    // Director: repaired neck; the original guard has joined joints, moving limbs and clears the sleeve.
    ceo: '2b2c18cf4d057f2eaf93bc20f9a7eabeb3a62e3762773b3d26768bd3301b5def',
    // The original Android only gains a connected neck.
    android: 'a877b7b9066f502aacb19e91aebe3978d773cb5acef01a1f9aae92bab7bc2f78',
    // Convict: connected neck and shoulders; the original cuffs now have a moving chain.
    convict: 'ba82cd12d70ada6a9f586ee884a220cfab97d128884d3967fcd58f4210bd01a6',
    // Psychologist: connected neck and shoulders, drones moved clear of the headsets.
    psych: '25d68589b6316181fd362110094614b1d5d14b408e943924f4ba455ad490f167',
    bounty: '04a7f6a04fcb012a6a98d701d37fb9916edc0943ad2905f66087acfcaffa1a79',
    captain: '3d707abf4830a827ba018ea77444d5922e11ffbc740baeb4e7f6b2c043231c80',
    survivor: '5ff5ab81068aed27b51da8ef22abca159ba0531292a14efc23f204667ea9ef0d',
    xeno: '85d76328df00a5820a85f907986fa50e87e65499e9f922c4f87443cf95c84374',
};

test('CREW-03: original miniatures stay stable after joint repairs and every option changes real geometry', async () => {
    const { buildCharacter } = await import('../client/characters.js');
    const { CREW_PARTS, characterParts } = await import('../shared/appearance.mjs');
    const signature = (id, parts) => {
        const ch = buildCharacter(scene.scene, id, {}, parts), result = geometrySignature(ch);
        ch.root.dispose(); return result;
    };
    for (const [id, slots] of Object.entries(CREW_PARTS)) {
        const original = signature(id), defaults = characterParts(id);
        assert.equal(createHash('sha256').update(JSON.stringify(original)).digest('hex'), CREW_ORIGINAL_HASHES[id], id + ': original geometry');
        assert.deepEqual(signature(id, defaults), original, id + ': explicit defaults');
        for (const slot of slots) {
            const variants = slot.options.map(option => JSON.stringify(signature(id, { ...defaults, [slot.id]: option.id })));
            assert.equal(new Set(variants).size, slot.options.length, `${id}/${slot.id}: each option has distinct vertices/transforms`);
        }
        assert.deepEqual(signature(id), original, id + ': no mutation of shared spec');
    }
});

test('CREW-04: all combinations retain their equipment, paintability and attached geometry', async () => {
    const { CREW_PARTS } = await import('../shared/appearance.mjs');
    // Babylon retains sizeable internal caches after disposing meshes. Run each role in an
    // isolated process so exhaustive 3^5 checks also fit Node's normal heap limit.
    const worker = fileURLToPath(new URL('./crew-combinations.worker.mjs', import.meta.url));
    let checked = 0;
    for (const [id, slots] of Object.entries(CREW_PARTS)) {
        const result = spawnSync(process.execPath, [worker, id], { encoding: 'utf8', timeout: 60000, maxBuffer: 4 * 1024 * 1024 });
        assert.equal(result.status, 0, `${id}: worker failed: ${result.stderr || result.error || result.stdout}`);
        const match = result.stdout.match(/RESULT (\d+)/);
        assert.ok(match, id + ': worker reported its combination count');
        const count = Number(match[1]);
        assert.equal(count, slots.reduce((n, s) => n * s.options.length, 1), id + ': every combination checked');
        checked += count;
    }
    assert.equal(checked, 12 * 243 + 4 * 27);
});

test('CREW-05: extra shoulders, bracers, wheels and companions move with their originals', async () => {
    const { buildCharacter } = await import('../client/characters.js');
    for (const [id, parts, slot, ancestor] of [
        ['soldier', { shoulders: 'extended' }, 'shoulders', 'armL'],
        ['scout', { bracer: 'display' }, 'bracer', 'armL'],
        ['hacker', { arms: 'terminal' }, 'arms', 'armL'],
        ['bounty', { armor: 'heavy' }, 'armor', 'armL'],
        ['captain', { shoulders: 'layered' }, 'shoulders', 'armL'],
        ['scientist', { chair: 'spoked' }, 'chair', 'wheel'],
        ['ceo', { robot: 'sensor' }, 'robot', 'robot'],
        ['psych', { drones: 'rotors' }, 'drones', 'drone'],
        ['bounty', { dog: 'packs' }, 'dog', 'dog'],
        ['xeno', { probe: 'twin' }, 'probe', 'scanHead'],
    ]) {
        const ch = buildCharacter(scene.scene, id, {}, parts);
        const extra = ch.root.getChildMeshes().filter(m => m.name === `crew_${id}_${slot}`);
        const hasAncestor = m => { for (let p = m.parent; p; p = p.parent) if (p.name === ancestor) return true; return false; };
        assert.ok(extra.some(hasAncestor), `${id}/${slot} follows ${ancestor}`);
        ch.animate(0.1, true); ch.animate(0.2, true);
        assert.ok(extra.some(hasAncestor), `${id}/${slot} stays attached while running`);
        ch.root.dispose();
    }
});

test('CREW-06: every customized crew figure is rebuilt on the table without stale shadows', async () => {
    const { CREW_PARTS, characterParts } = await import('../shared/appearance.mjs');
    const v = JSON.parse(JSON.stringify(view)), p = v.players[0];
    for (const [id, slots] of Object.entries(CREW_PARTS)) {
        p.charId = id; p.parts = characterParts(id);
        scene.updateCharacters(v);
        const first = scene.chars[p.id], old = first.ch.root, oldMeshes = old.getChildMeshes();
        scene.updateCharacters(v);
        assert.equal(scene.chars[p.id].ch.root, old, id + ': unchanged figure is reused');
        p.parts = Object.fromEntries(slots.map(s => [s.id, s.options[2].id]));
        scene.updateCharacters(v);
        const changed = scene.chars[p.id];
        assert.notEqual(changed.ch.root, old, id + ': new choices rebuild');
        assert.equal(old.isDisposed(), true, id + ': old figure disposed');
        assert.equal(changed.grab.metadata.player, p.id, id + ': hitbox still works');
        const shadowList = scene.shadows.getShadowMap().renderList || [];
        assert.ok(oldMeshes.every(m => !shadowList.includes(m)), id + ': old shadow casters removed');
        assert.ok(changed.ch.root.getChildMeshes().some(m => shadowList.includes(m)), id + ': new shadow casters added');
    }
    scene.updateCharacters(view);
});

test('CREW-07: workshop framing sets its target before the orbit and restores the lobby camera', async () => {
    const { setPreviewCameraPose } = await import('../client/scene3d.js');
    const cam = new B.ArcRotateCamera('workshop-test', -1.17, 1.25, 4.4, new B.Vector3(0, 0.95, 0), scene.scene);
    const original = { alpha: cam.alpha, beta: cam.beta, radius: cam.radius, target: cam.target.clone() };
    cam.inertialAlphaOffset = 0.2; cam.inertialRadiusOffset = 0.3;
    const workshop = { alpha: Math.PI / 2 - 0.28, beta: 1.3, radius: 3.7, target: new B.Vector3(-0.2, 0.95, 0) };
    setPreviewCameraPose(cam, workshop);
    assert.equal(cam.alpha, workshop.alpha); assert.equal(cam.beta, workshop.beta); assert.equal(cam.radius, workshop.radius);
    assert.deepEqual(cam.target.asArray(), workshop.target.asArray());
    assert.equal(cam.inertialAlphaOffset, 0); assert.equal(cam.inertialRadiusOffset, 0);
    // Render once so the camera position catches up, then restore a different target and orbit.
    cam.getViewMatrix(true);
    setPreviewCameraPose(cam, original);
    assert.equal(cam.alpha, original.alpha); assert.equal(cam.beta, original.beta); assert.equal(cam.radius, original.radius);
    assert.deepEqual(cam.target.asArray(), original.target.asArray());
    cam.dispose();
});

test('CREW-08: the Survivor’s bandana ties remain outside every radio pack and hair combination', async () => {
    const { buildCharacter } = await import('../client/characters.js');
    for (const hair of ['classic', 'wavy', 'long']) for (const radio of ['classic', 'dual', 'caged']) {
        const ch = buildCharacter(scene.scene, 'survivor', {}, { hair, radio, bandana: 'tails' });
        const ties = ch.root.getChildMeshes().filter(m => m.name === 'crew_survivor_bandana' && m.position.z <= -0.49);
        assert.equal(ties.length, 2, `${hair}/${radio}: both ties lie behind the backpack cage`);
        assert.ok(ties.every(m => m.parent === ch.root), 'the ties remain attached to the head/body');
        ch.animate(0.1, true); ch.animate(0.2, true);
        assert.ok(ties.every(m => m.parent === ch.root), 'the ties do not attach to the running limbs');
        ch.root.dispose();
    }
});

test('ROLE-01: reworked crew options replace the original meshes, rather than overlaying them', async () => {
    const { buildCharacter } = await import('../client/characters.js');
    const { CREW_PARTS, characterParts } = await import('../shared/appearance.mjs');
    const partMeshes = (ch, slot) => ch.root.getChildMeshes().filter(m => m.metadata?.appearancePart?.slot === slot);
    const signature = meshes => geometrySignature({ root: { getChildMeshes: () => meshes } });
    for (const id of ['soldier', 'scout', 'mechanic', 'pilot', 'hacker', 'scientist', 'medic', 'janitor', 'ceo', 'android', 'convict', 'psych']) for (const slot of CREW_PARTS[id]) {
        const original = buildCharacter(scene.scene, id, {}, characterParts(id));
        const base = partMeshes(original, slot.id);
        assert.ok(base.length >= 2, `${id}/${slot.id}: the original part is marked`);
        assert.ok(base.every(m => m.metadata.appearancePart.variant === 'classic'));
        const old = signature(base);
        for (const option of slot.options.slice(1)) {
            const ch = buildCharacter(scene.scene, id, {}, { [slot.id]: option.id });
            const selected = partMeshes(ch, slot.id);
            assert.ok(selected.length >= 2, `${id}/${slot.id}/${option.id}: complete replacement`);
            assert.ok(selected.every(m => m.metadata.appearancePart.variant === option.id), `${id}/${slot.id}: no original parts remain`);
            const now = new Set(signature(selected));
            assert.ok(old.filter(s => !now.has(s)).length >= 2, `${id}/${slot.id}/${option.id}: original geometry actually removed`);
            ch.root.dispose();
        }
        original.root.dispose();
    }
});

test('ROLE-02: sealed helmets cover the head, while panoramic glass and welding goggles expose a face', async () => {
    const { buildCharacter } = await import('../client/characters.js');
    for (const [id, slot, choice, visibleFace] of [
        ['soldier', 'helmet', 'braced', false], ['soldier', 'helmet', 'caged', true],
        ['mechanic', 'shield', 'framed', false], ['mechanic', 'shield', 'twinlamp', true],
    ]) {
        const ch = buildCharacter(scene.scene, id, {}, { [slot]: choice });
        const head = ch.root.getChildMeshes().filter(m => m.metadata?.appearancePart?.slot === slot);
        assert.equal(head.some(m => (ch.zones.skin || []).includes(m)), visibleFace, `${id}/${choice}: face visibility`);
        ch.root.dispose();
    }
});

test('ROLE-03: replacement shoulder armour, rifles and welders stay on their animated supports', async () => {
    const { buildCharacter } = await import('../client/characters.js');
    const hasAncestor = (m, name) => { for (let n = m.parent; n; n = n.parent) if (n.name === name) return true; return false; };
    for (const shoulders of ['layered', 'extended']) for (const rifle of ['classic', 'compact', 'modular']) {
        const ch = buildCharacter(scene.scene, 'soldier', {}, { shoulders, rifle, suit: 'heavy' });
        const plates = ch.root.getChildMeshes().filter(m => m.metadata?.appearancePart?.slot === 'shoulders');
        assert.ok(plates.some(m => hasAncestor(m, 'armL')) && plates.some(m => hasAncestor(m, 'armR')));
        assert.ok(plates.every(m => hasAncestor(m, 'armL') || hasAncestor(m, 'armR')));
        const gun = ch.root.getDescendants().find(n => n.name === 'gun');
        const initial = gun.position.z; ch.animate(0, true); ch.shoot(); ch.animate(0.05, true);
        assert.ok(gun.position.z < initial, `${rifle}: recoil moves the replacement rifle`);
        ch.root.dispose();
    }
    for (const welder of ['classic', 'torch', 'cutter']) {
        const ch = buildCharacter(scene.scene, 'mechanic', {}, { welder });
        const meshes = ch.root.getChildMeshes().filter(m => m.metadata?.appearancePart?.slot === 'welder');
        assert.ok(meshes.length && meshes.every(m => hasAncestor(m, 'armR')), `${welder}: follows the right hand`);
        ch.animate(0.1, true); ch.animate(0.2, true);
        assert.ok(meshes.every(m => hasAncestor(m, 'armR')));
        ch.root.dispose();
    }
});

test('ROLE-05: Mechanic neck, waist and hips stay connected for every choice while walking', async () => {
    const { buildCharacter } = await import('../client/characters.js');
    const { CREW_PARTS } = await import('../shared/appearance.mjs');
    const combos = CREW_PARTS.mechanic.reduce((acc, slot) => acc.flatMap(old => slot.options.map(o => ({ ...old, [slot.id]: o.id }))), [{}]);
    const hasAncestor = (m, name) => { for (let n = m.parent; n; n = n.parent) if (n.name === name) return true; return false; };
    const engine = new B.NullEngine(), testScene = new B.Scene(engine);
    for (const parts of combos) {
        const ch = buildCharacter(testScene, 'mechanic', {}, parts);
        const meshes = ch.root.getChildMeshes(), byName = name => meshes.find(m => m.name === name);
        const neck = byName('mechanic_neck_joint'), torso = byName('mechanic_torso');
        const waist = byName('mechanic_waist_joint'), pelvis = byName('mechanic_pelvis');
        const heads = meshes.filter(m => m.metadata?.appearancePart?.slot === 'shield');
        const legs = side => meshes.filter(m => m.metadata?.appearancePart?.slot === 'outfit' && (ch.zones.overall || []).includes(m) && hasAncestor(m, side));
        const label = JSON.stringify(parts);
        assert.ok(neck && torso && waist && pelvis, label + ': named structural joints');
        for (const [t, moving] of [[0, false], [0.1, true], [0.2, true], [0.3, true], [0.4, true], [0.5, true], [0.6, true], [0.7, true]]) {
            ch.animate(t, moving);
            for (const m of meshes) m.computeWorldMatrix(true);
            assert.ok(neck.intersectsMesh(torso, false), label + ': neck touches the torso at ' + t);
            assert.ok(heads.some(m => neck.intersectsMesh(m, false)), label + ': neck touches the chosen head at ' + t);
            assert.ok(waist.intersectsMesh(torso, false) && waist.intersectsMesh(pelvis, false), label + ': waist bridges torso and pelvis at ' + t);
            for (const side of ['legL', 'legR']) assert.ok(legs(side).some(m => pelvis.intersectsMesh(m, false)), label + ': pelvis touches ' + side + ' at ' + t);
        }
        ch.root.dispose();
    }
    testScene.dispose(); engine.dispose();
    assert.equal(combos.length, 243);
});

test('ROLE-06: Scout and Pilot replacement equipment follows the correct animated supports', async () => {
    const { buildCharacter } = await import('../client/characters.js');
    const hasAncestor = (m, name) => { for (let n = m.parent; n; n = n.parent) if (n.name === name) return true; return false; };
    for (const hair of ['classic', 'braid', 'tied']) for (const vest of ['classic', 'plated', 'pouches']) {
        const ch = buildCharacter(scene.scene, 'scout', {}, { hair, vest });
        const meshes = ch.root.getChildMeshes(), find = name => meshes.find(m => m.name === name);
        for (const t of [0, 0.1, 0.2, 0.3, 0.4]) {
            ch.animate(t, true); for (const m of meshes) m.computeWorldMatrix(true);
            const neck = find('scout_neck_joint');
            assert.ok(neck.intersectsMesh(find('scout_head'), false) && neck.intersectsMesh(find('scout_torso'), false), `${hair}/${vest}: head and torso remain joined`);
        }
        ch.root.dispose();
    }
    for (const shoulders of ['classic', 'compact', 'segmented']) for (const bracer of ['classic', 'display', 'cells']) for (const rifle of ['classic', 'carbine', 'long']) {
        const ch = buildCharacter(scene.scene, 'scout', {}, { shoulders, bracer, rifle });
        const part = slot => ch.root.getChildMeshes().filter(m => m.metadata?.appearancePart?.slot === slot);
        assert.ok(part('shoulders').some(m => hasAncestor(m, 'armL')) && part('shoulders').some(m => hasAncestor(m, 'armR')));
        assert.ok(part('bracer').every(m => hasAncestor(m, 'armL')));
        const gun = ch.root.getDescendants().find(n => n.name === 'gun');
        assert.ok(part('rifle').every(m => hasAncestor(m, 'gun')), rifle + ': rifle stays slung');
        const z = gun.position.z; ch.animate(0, true); ch.shoot(); ch.animate(0.05, true);
        assert.ok(gun.position.z < z, rifle + ': rifle still has recoil');
        ch.animate(0.2, true); assert.ok(part('bracer').every(m => hasAncestor(m, 'armL')));
        ch.root.dispose();
    }
    for (const sidearm of ['classic', 'compact', 'long']) for (const coat of ['classic', 'lapels', 'long']) {
        const ch = buildCharacter(scene.scene, 'pilot', {}, { sidearm, coat });
        const weapons = ch.root.getChildMeshes().filter(m => m.metadata?.appearancePart?.slot === 'sidearm');
        const gun = ch.root.getDescendants().find(n => n.name === 'gun');
        assert.ok(weapons.length && weapons.every(m => hasAncestor(m, 'gun') && hasAncestor(m, 'armR')), sidearm + ': sidearm in the moving hand');
        if (coat === 'long') {
            const tails = ch.root.getDescendants().find(n => n.name === 'pilot_coat_tails');
            assert.ok(tails && tails.parent === ch.root, 'the long coat remains attached to the torso, not the legs');
        }
        if (coat !== 'classic') {
            const fur = ch.root.getChildMeshes().filter(m => m.metadata?.appearancePart?.slot === 'coat' && m.material.diffuseColor?.toHexString().toLowerCase() === '#d9cdb0');
            const collar = fur.find(m => m.parent === ch.root && m.position.x === 0 && Math.abs(m.position.y - (coat === 'long' ? 2.19 : 2.17)) < 0.001);
            const bridges = fur.filter(m => m.parent === ch.root && Math.abs(m.position.y - 2.13) < 0.001 && Math.abs(m.position.z - 0.26) < 0.001);
            const lapels = fur.filter(m => m.parent === ch.root && Math.abs(m.position.z - 0.345) < 0.001);
            for (const m of fur) m.computeWorldMatrix(true);
            assert.ok(collar && bridges.length === 2 && lapels.length === 2, coat + ': fur collar and lapels exist');
            for (const bridge of bridges) assert.ok(bridge.intersectsMesh(collar, false) && lapels.some(m => Math.sign(m.position.x) === Math.sign(bridge.position.x) && bridge.intersectsMesh(m, false)), coat + ': lapels join the collar');
        }
        const z = gun.position.z; ch.animate(0, true); ch.shoot(); ch.animate(0.05, true);
        assert.ok(gun.position.z < z, sidearm + ': recoil');
        ch.root.dispose();
    }
});

test('ROLE-07: Hacker masks seal the face and neck; cyber-arms and smartguns follow the rig', async () => {
    const { buildCharacter } = await import('../client/characters.js');
    const hasAncestor = (m, name) => { for (let n = m.parent; n; n = n.parent) if (n.name === name) return true; return false; };
    for (const hood of ['classic', 'rimmed', 'long']) for (const mask of ['classic', 'seams', 'vented']) {
        const ch = buildCharacter(scene.scene, 'hacker', {}, { hood, mask });
        const meshes = ch.root.getChildMeshes(), skin = ch.zones.skin;
        ch.setColors({ skin: '#ffbbaa', hood: '#637a51', lights: '#32ffee' });
        assert.equal(meshes.find(m => m.name === 'hacker_face_underlay').material.diffuseColor.toHexString().toLowerCase(), '#1a1d21', 'the balaclava stays opaque when skin is repainted');
        // Test in builder coordinates and temporarily enable picking for the miniature meshes.
        ch.root.scaling.setAll(1); for (const m of meshes) m.isPickable = true;
        const relevant = m => skin.includes(m) || m.name === 'hacker_face_underlay' || ['hood', 'mask'].includes(m.metadata?.appearancePart?.slot);
        for (const t of [0, 0.1, 0.2, 0.3]) {
            ch.animate(t, t > 0);
            for (const m of meshes) m.computeWorldMatrix(true);
            const y = ch.root.position.y;
            // Cast through the entire face and neck, rather than checking only the lighted visor.
            for (const [x, yy] of [-0.13, 0, 0.13].flatMap(x => [2.3, 2.4, 2.5, 2.58].map(yy => [x, yy])).concat([[-0.05, 2.18], [0, 2.22], [0.05, 2.18]])) {
                const ray = new B.Ray(new B.Vector3(x, yy + y, 1), new B.Vector3(0, 0, -1), 2);
                const hit = scene.scene.pickWithRay(ray, relevant);
                assert.ok(hit?.hit && !skin.includes(hit.pickedMesh), `${hood}/${mask}: covered at ${x},${yy} while moving; hit=${hit?.hit} mesh=${hit?.pickedMesh?.name} part=${hit?.pickedMesh?.metadata?.appearancePart?.slot}`);
            }
            // The hood and gasket must also close the sides of the head and neck.
            for (const sign of [-1, 1]) for (const [yy, z] of [[2.34, -0.08], [2.5, 0.05], [2.4, 0.15], [2.2, 0]]) {
                const ray = new B.Ray(new B.Vector3(sign, yy + y, z), new B.Vector3(-sign, 0, 0), 2);
                const hit = scene.scene.pickWithRay(ray, relevant);
                assert.ok(hit?.hit && !skin.includes(hit.pickedMesh), `${hood}/${mask}: covered side ${sign},${yy},${z}`);
            }
        }
        ch.root.dispose();
    }
    for (const arms of ['classic', 'ribbed', 'terminal']) for (const smartgun of ['compact', 'rail']) {
        const ch = buildCharacter(scene.scene, 'hacker', {}, { arms, smartgun });
        const part = slot => ch.root.getChildMeshes().filter(m => m.metadata?.appearancePart?.slot === slot);
        const limbs = part('arms'), weapon = part('smartgun');
        assert.ok(limbs.some(m => hasAncestor(m, 'armL')) && limbs.some(m => hasAncestor(m, 'armR')));
        assert.ok(limbs.every(m => hasAncestor(m, 'armL') || hasAncestor(m, 'armR')), `${arms}: both arms follow their shoulders`);
        assert.ok(weapon.every(m => hasAncestor(m, 'gun') && hasAncestor(m, 'armR')), `${smartgun}: complete weapon follows the hand`);
        const gun = ch.root.getDescendants().find(n => n.name === 'gun'), z = gun.position.z;
        ch.animate(0, true); ch.shoot(); ch.animate(0.05, true);
        assert.ok(gun.position.z < z, `${smartgun}: recoil still works`);
        ch.animate(0.2, true);
        assert.ok(weapon.every(m => hasAncestor(m, 'gun') && hasAncestor(m, 'armR')));
        ch.root.dispose();
    }
});

test('ROLE-08: replacement wheelchairs support the seated Scientist and animate all four grounded wheels', async () => {
    const { buildCharacter } = await import('../client/characters.js');
    const original = buildCharacter(scene.scene, 'scientist');
    const base = original.root.getChildMeshes(), named = n => base.find(m => m.name === n);
    for (const m of base) m.computeWorldMatrix(true);
    assert.ok(named('scientist_neck_joint').intersectsMesh(named('scientist_head'), false) && named('scientist_neck_joint').intersectsMesh(named('scientist_torso'), false), 'original Scientist has a connected neck');
    original.root.dispose();
    for (const chair of ['spoked', 'guards']) for (const tablet of ['classic', 'panel', 'scanner'])
        for (const scanner of ['classic', 'probe', 'spectrometer']) for (const coat of ['classic', 'field', 'lab']) {
            const ch = buildCharacter(scene.scene, 'scientist', {}, { chair, tablet, scanner, coat });
            const meshes = ch.root.getChildMeshes(), byName = n => meshes.find(m => m.name === n);
            ch.root.scaling.setAll(1); // distances and ground clearance use the builder's units
            const component = n => meshes.find(m => m.metadata?.chairComponent === n);
            const part = slot => meshes.filter(m => m.metadata?.appearancePart?.slot === slot);
            const label = `${chair}/${tablet}/${scanner}/${coat}`;
            for (const m of meshes) m.computeWorldMatrix(true);
            const neck = byName('scientist_neck_joint'), head = byName('scientist_head'), torso = byName('scientist_torso');
            assert.ok(neck.intersectsMesh(head, false) && neck.intersectsMesh(torso, false), label + ': neck joins head and torso');
            assert.ok(component('seat') && component('backrest') && component('footrest') && component('joystick') && component('display'));
            assert.ok(component('backrest').intersectsMesh(torso, false), label + ': torso is supported');
            const thighs = ch.zones.pants.filter(m => Math.abs(m.position.y - 0.8) < 0.001 && Math.abs(m.position.z - 0.26) < 0.001);
            const feet = ch.zones.pants.filter(m => Math.abs(m.position.y - 0.22) < 0.001 && Math.abs(m.position.z - 0.58) < 0.001);
            assert.equal(thighs.length, 2); assert.equal(feet.length, 2);
            assert.ok(thighs.every(m => component('seat').intersectsMesh(m, false)), label + ': seated on the cushion');
            assert.ok(feet.every(m => component('footrest').intersectsMesh(m, false)), label + ': feet on the footrest');
            for (const side of ['L', 'R']) {
                const upper = byName('scientist_upper_' + side), forearm = byName('scientist_forearm_' + side), hand = byName('scientist_hand_' + side);
                assert.ok(upper.intersectsMesh(forearm, false) && forearm.intersectsMesh(hand, false), label + ': connected ' + side + ' arm');
                assert.ok(component('armrest' + side).intersectsMesh(forearm, false), label + ': supported ' + side + ' forearm');
                const instrument = part(side === 'L' ? 'tablet' : 'scanner');
                assert.ok(instrument.some(m => m.intersectsMesh(hand, false)), label + ': instrument meets ' + side + ' hand');
                const control = component(side === 'L' ? 'joystick' : 'display');
                assert.ok(B.Vector3.Distance(hand.getAbsolutePosition(), control.getAbsolutePosition()) < 0.26, label + ': control within reach of ' + side + ' hand');
            }
            const wheels = meshes.filter(m => m.name === 'wheel');
            assert.equal(wheels.length, 4);
            const initial = wheels.map(w => {
                assert.ok(w.getChildMeshes().length >= 2, label + ': visible rim moves with wheel');
                assert.ok(Math.abs(w.getBoundingInfo().boundingBox.minimumWorld.y) < 0.03, label + ': wheel touches the floor');
                return B.Vector3.TransformNormal(new B.Vector3(0, 1, 0), w.getWorldMatrix()).normalize();
            });
            ch.animate(0, true); ch.animate(0.1, true); ch.animate(0.2, true);
            for (const [i, w] of wheels.entries()) {
                w.computeWorldMatrix(true);
                assert.ok(Math.abs(w.rotation.x) > 0.1, label + ': all four wheels roll');
                const axis = B.Vector3.TransformNormal(new B.Vector3(0, 1, 0), w.getWorldMatrix()).normalize();
                assert.ok(B.Vector3.Dot(axis, initial[i]) > 0.999, label + ': wheel rolls around its axle, not sideways');
                assert.ok(w.getChildMeshes().every(m => m.parent === w), label + ': rims stay on their wheel');
            }
            ch.root.dispose();
        }
});

test('ROLE-09: the Pilot’s fur-trimmed coats stay closed and joined throughout a stride', async () => {
    const { buildCharacter } = await import('../client/characters.js');
    for (const coat of ['classic', 'long']) for (const sidearm of ['classic', 'compact', 'long']) {
        const ch = buildCharacter(scene.scene, 'pilot', {}, { coat, sidearm });
        ch.root.scaling.setAll(1);
        const meshes = ch.root.getChildMeshes();
        const panel = meshes.find(m => m.metadata?.pilotCoatComponent === 'skirt');
        const hem = meshes.find(m => m.metadata?.pilotCoatComponent === 'hem');
        const body = meshes.find(m => m.metadata?.appearancePart?.slot === 'coat' && m.parent === ch.root && Math.abs(m.position.y - (coat === 'long' ? 1.83 : 1.82)) < 0.001);
        assert.ok(panel && hem && body && panel.parent === hem.parent && panel.parent.parent === ch.root, `${coat}: skirt and hem follow the torso`);
        assert.ok(ch.zones.suit.includes(panel), `${coat}: the entire lower coat accepts suit paint`);
        ch.setColors({ suit: '#3a5635' });
        assert.equal(panel.material.diffuseColor.toHexString().toLowerCase(), '#3a5635');
        const legMeshes = ch.zones.suit.filter(m => { for (let n = m.parent; n; n = n.parent) if (n.name === 'legL' || n.name === 'legR') return true; return false; });
        for (const m of [panel, ...legMeshes]) m.isPickable = true;
        for (const t of [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6]) {
            ch.animate(t, t > 0); for (const m of [panel, hem, body]) m.computeWorldMatrix(true);
            assert.ok(panel.intersectsMesh(body, false), `${coat}: skirt meets jacket at ${t}`);
            assert.ok(panel.intersectsMesh(hem, false), `${coat}: fur hem remains attached at ${t}`);
            const skirtBox = panel.getBoundingInfo().boundingBox, hemBox = hem.getBoundingInfo().boundingBox;
            assert.ok(hemBox.minimumWorld.x <= skirtBox.minimumWorld.x && hemBox.maximumWorld.x >= skirtBox.maximumWorld.x && hemBox.maximumWorld.z > skirtBox.maximumWorld.z, `${coat}: visible fur wraps the closed coat`);
            for (const x of [-0.1, 0, 0.1]) for (const y of coat === 'long' ? [0.93, 1.1, 1.25, 1.4] : [1.1, 1.25, 1.4]) {
                for (const side of [-1, 1]) {
                    const ray = new B.Ray(new B.Vector3(x, y + ch.root.position.y, side), new B.Vector3(0, 0, -side), 2);
                    const hit = scene.scene.pickWithRay(ray, m => m === panel || legMeshes.includes(m));
                    assert.ok(hit?.hit && hit.pickedMesh === panel, `${coat}: continuous ${side > 0 ? 'front' : 'back'} at ${x},${y} while moving`);
                }
            }
        }
        ch.root.dispose();
    }
});

test('ROLE-10: the Medic keeps her respirator, connected coat and injector in every combination', async () => {
    const { buildCharacter } = await import('../client/characters.js');
    const ancestor = (m, name) => { for (let n = m.parent; n; n = n.parent) if (n.name === name) return true; return false; };
    for (const hair of ['classic', 'tied', 'wavy']) for (const mask of ['classic', 'filters', 'valve']) for (const coat of ['classic', 'field', 'surgical']) {
        const ch = buildCharacter(scene.scene, 'medic', {}, { hair, mask, coat });
        ch.root.scaling.setAll(1);
        const meshes = ch.root.getChildMeshes(), name = n => meshes.find(m => m.name === n);
        const maskMeshes = meshes.filter(m => m.metadata?.appearancePart?.slot === 'mask');
        const insignia = meshes.filter(m => m.metadata?.medicCapInsignia);
        assert.equal(insignia.length, 2, 'the medical cross remains on the cap');
        assert.ok(insignia.every(m => ch.zones.lights.includes(m)), 'the insignia remains paintable');
        for (const m of [name('medic_head'), ...maskMeshes]) m.isPickable = true;
        for (const t of [0, 0.1, 0.2, 0.3]) {
            ch.animate(t, t > 0); for (const m of meshes) m.computeWorldMatrix(true);
            const neck = name('medic_neck_joint');
            assert.ok(neck.intersectsMesh(name('medic_head'), false) && neck.intersectsMesh(name('medic_torso'), false), `${hair}/${mask}/${coat}: joined neck`);
            for (const x of [-0.07, 0, 0.07]) for (const y of [2.29, 2.35, 2.39]) {
                const ray = new B.Ray(new B.Vector3(x, y + ch.root.position.y, 1), new B.Vector3(0, 0, -1), 2);
                const hit = scene.scene.pickWithRay(ray, m => m === name('medic_head') || maskMeshes.includes(m));
                assert.ok(hit?.hit && maskMeshes.includes(hit.pickedMesh), `${hair}/${mask}: nose and mouth covered at ${x},${y}`);
            }
            for (const side of ['L', 'R']) {
                const hand = name('medic_hand_' + side), sleeve = meshes.filter(m => m.metadata?.appearancePart?.slot === 'coat' && ancestor(m, 'arm' + side));
                assert.ok(sleeve.some(m => m.intersectsMesh(hand, false)), `${coat}: ${side} sleeve meets the hand`);
            }
        }
        if (coat === 'surgical') {
            const tails = meshes.filter(m => m.parent?.name === 'medic_coat_tails');
            const back = tails.find(m => m.position.x === 0);
            const upperBack = meshes.find(m => m.metadata?.appearancePart?.slot === 'coat' && m.parent === ch.root && m.position.z === -0.18 && m.position.y > 1.8);
            assert.ok(back && upperBack && back.intersectsMesh(upperBack, false), 'long coat tails join the back');
            assert.ok(tails.filter(m => m !== back).every(m => m.intersectsMesh(back, false)), 'side tails join the continuous back');
        }
        ch.root.dispose();
    }
    for (const injector of ['classic', 'compact', 'infuser']) {
        const ch = buildCharacter(scene.scene, 'medic', {}, { injector });
        const meshes = ch.root.getChildMeshes(), hand = meshes.find(m => m.name === 'medic_hand_L');
        const tool = meshes.filter(m => m.metadata?.appearancePart?.slot === 'injector');
        assert.ok(tool.every(m => ancestor(m, 'gun') && ancestor(m, 'armL')), `${injector}: tool follows the left hand`);
        for (const t of [0, 0.1, 0.2, 0.3]) {
            ch.animate(t, t > 0); for (const m of [hand, ...tool]) m.computeWorldMatrix(true);
            assert.ok(tool.some(m => m.intersectsMesh(hand, false)), `${injector}: tool is held in the hand`);
        }
        ch.root.dispose();
    }
});

test('ROLE-11: every Janitor vacuum and wand stays connected to the moving hand', async () => {
    const { buildCharacter } = await import('../client/characters.js');
    const ancestor = (m, name) => { for (let n = m.parent; n; n = n.parent) if (n.name === name) return true; return false; };
    for (const vacuum of ['classic', 'ribbed', 'twin']) for (const wand of ['classic', 'brush', 'nozzle']) for (const outfit of ['classic', 'utility', 'protective']) {
        const ch = buildCharacter(scene.scene, 'janitor', {}, { vacuum, wand, outfit });
        // Exercise transforms used by figures on the board, not just the origin in the workshop.
        ch.root.position.x = 1.3; ch.root.position.z = -0.8; ch.root.rotation.y = 0.7;
        const meshes = ch.root.getChildMeshes(), name = n => meshes.find(m => m.name === n);
        const component = n => meshes.find(m => m.metadata?.janitorWandComponent === n);
        const hose = meshes.filter(m => Number.isInteger(m.metadata?.janitorHoseSegment)).sort((a, b) => a.metadata.janitorHoseSegment - b.metadata.janitorHoseSegment);
        const hand = name('janitor_hand_L'), grip = component('grip'), shaft = component('shaft'), head = component('head');
        const wandNode = ch.root.getDescendants().find(n => n.name === 'janitor_wand');
        assert.equal(hose.length, vacuum === 'classic' ? 3 : 8, `${vacuum}: full hose`);
        assert.ok(grip && shaft && head && wandNode && [grip, shaft, head].every(m => ancestor(m, 'armL')), `${wand}: one hand-held assembly`);
        const endpoint = (m, positive) => {
            m.computeWorldMatrix(true);
            const box = m.getBoundingInfo().boundingBox;
            return B.Vector3.TransformCoordinates(new B.Vector3(0, positive ? box.maximum.y : box.minimum.y, 0), m.getWorldMatrix());
        };
        for (const t of [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6]) {
            ch.animate(t, t > 0); for (const m of meshes) m.computeWorldMatrix(true);
            const neck = name('janitor_neck_joint'), janitorHead = name('janitor_head'), janitorTorso = name('janitor_torso') || meshes.find(m => m.metadata?.janitorTorso);
            assert.ok(neck && janitorHead && janitorTorso, `${outfit}: named head, neck and torso`);
            assert.ok(neck.intersectsMesh(janitorHead, false) && neck.intersectsMesh(janitorTorso, false), `${outfit}: joined neck`);
            const sleeves = meshes.filter(m => m.metadata?.appearancePart?.slot === 'outfit' && ancestor(m, 'armL'));
            assert.ok(sleeves.some(m => m.intersectsMesh(hand, false)), `${outfit}: sleeve meets glove`);
            assert.ok(grip.intersectsMesh(hand, true) && grip.intersectsMesh(shaft, true) && shaft.intersectsMesh(head, true), `${wand}: glove, grip, shaft and nozzle meet while moving`);
            const rootMatrix = ch.root.computeWorldMatrix(true), wandMatrix = wandNode.computeWorldMatrix(true);
            const start = B.Vector3.TransformCoordinates(new B.Vector3(...(vacuum === 'classic' ? [-0.12, 2.1, -0.42] : [-0.18, 2.08, -0.42])), rootMatrix);
            const end = B.Vector3.TransformCoordinates(new B.Vector3(0, vacuum === 'classic' ? -0.04 : -0.02, 0.06), wandMatrix);
            assert.ok(B.Vector3.Distance(endpoint(hose[0], false), start) < 0.015, `${vacuum}: hose meets the tank`);
            for (let i = 0; i < hose.length - 1; i++) assert.ok(B.Vector3.Distance(endpoint(hose[i], true), endpoint(hose[i + 1], false)) < 0.015, `${vacuum}: hose joint ${i}`);
            assert.ok(B.Vector3.Distance(endpoint(hose.at(-1), true), end) < 0.015, `${vacuum}/${wand}: hose meets the wand`);
        }
        ch.root.dispose();
    }
});

test('ROLE-12: the Director’s bodyguard is a complete supported robot with animated limbs', async () => {
    const { buildCharacter } = await import('../client/characters.js');
    const ancestor = (m, name) => { for (let n = m.parent; n; n = n.parent) if (n.name === name) return true; return false; };
    for (const robot of ['classic', 'sensor', 'armored']) for (const collar of ['classic', 'trim', 'high']) for (const coat of ['classic', 'tailcoat', 'double']) {
        const ch = buildCharacter(scene.scene, 'ceo', {}, { robot, collar, coat });
        ch.root.scaling.setAll(1);
        const meshes = ch.root.getChildMeshes(), name = n => meshes.find(m => m.name === n);
        const part = n => meshes.find(m => m.metadata?.bodyguardComponent === n);
        const guard = ch.root.getDescendants().find(n => n.name === 'robot');
        const legs = ['L', 'R'].map(side => guard.getDescendants().find(n => n.name === 'bodyguard_leg' + side));
        const arms = ['L', 'R'].map(side => guard.getDescendants().find(n => n.name === 'bodyguard_arm' + side));
        const required = ['head', 'neck', 'torso', 'spine', 'pelvis', ...['L', 'R'].flatMap(s => ['shoulder', 'upper', 'elbow', 'forearm', 'hand', 'hip', 'thigh', 'knee', 'shin', 'foot'].map(p => p + s))];
        assert.ok(guard && legs.every(Boolean) && arms.every(Boolean) && required.every(n => part(n)), `${robot}: complete bodyguard`);
        assert.ok(meshes.filter(m => m.metadata?.appearancePart?.slot === 'robot').every(m => ancestor(m, 'robot')));
        ch.setColors({ robot: '#578ab2', lights: '#42ff93', coat: '#263b4a' });
        assert.ok(ch.zones.robot.every(m => m.material.diffuseColor.toHexString().toLowerCase() === '#578ab2'));
        let moved = false;
        for (const t of [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6]) {
            ch.animate(t, t > 0); for (const m of meshes) m.computeWorldMatrix(true);
            assert.ok(name('ceo_neck_joint').intersectsMesh(name('ceo_head'), false) && name('ceo_neck_joint').intersectsMesh(name('ceo_torso'), false), `${coat}/${collar}: Director's head is joined`);
            const collars = meshes.filter(m => m.metadata?.appearancePart?.slot === 'collar');
            const body = meshes.filter(m => m.metadata?.appearancePart?.slot === 'coat' && m.parent === ch.root);
            assert.ok(collars.some(c => body.some(b => c.intersectsMesh(b, true))), `${coat}/${collar}: collar meets coat`);
            if (coat !== 'classic') {
                const tails = meshes.filter(m => m.parent?.name === 'ceo_coat_tails'), back = tails.find(m => m.position.x === 0);
                assert.ok(back && body.some(m => m.position.z < -0.1 && back.intersectsMesh(m, true)), `${coat}: tails meet the back`);
                assert.ok(tails.filter(m => m !== back).every(m => m.intersectsMesh(back, true)), `${coat}: side tails meet the back`);
            }
            const leftSleeve = meshes.filter(m => m.metadata?.appearancePart?.slot === 'coat' && ancestor(m, 'armL'));
            const guardMeshes = meshes.filter(m => m.metadata?.appearancePart?.slot === 'robot');
            assert.ok(leftSleeve.every(a => guardMeshes.every(b => !a.intersectsMesh(b, true))), `${robot}/${coat}: bodyguard does not intersect the Director's arm`);
            const joined = (a, b) => assert.ok(part(a).intersectsMesh(part(b), true), `${robot}: ${a} joins ${b} at ${t}`);
            joined('head', 'neck'); joined('neck', 'torso'); joined('torso', 'spine'); joined('spine', 'pelvis');
            for (const side of ['L', 'R']) {
                for (const [a, b] of [['pelvis', 'hip'], ['hip', 'thigh'], ['thigh', 'knee'], ['knee', 'shin'], ['shin', 'foot'], ['torso', 'shoulder'], ['shoulder', 'upper'], ['upper', 'elbow'], ['elbow', 'forearm'], ['forearm', 'hand']])
                    joined(a === 'pelvis' || a === 'torso' ? a : a + side, b + side);
                for (const p of ['hip', 'thigh', 'knee', 'shin', 'foot']) assert.ok(ancestor(part(p + side), 'bodyguard_leg' + side));
                for (const p of ['shoulder', 'upper', 'elbow', 'forearm', 'hand']) assert.ok(ancestor(part(p + side), 'bodyguard_arm' + side));
            }
            moved ||= Math.abs(legs[0].rotation.x) > 0.1 && Math.abs(arms[0].rotation.x) > 0.05;
        }
        assert.ok(moved, `${robot}: its own arms and legs walk with the Director`);
        assert.ok(legs[0].rotation.x * legs[1].rotation.x < 0 && arms[0].rotation.x * arms[1].rotation.x < 0, `${robot}: opposite limbs stride`);
        ch.root.dispose();
    }
});

test('ROLE-13: Android clothing, synthetic arms and both characters’ sidearms remain connected', async () => {
    const { buildCharacter } = await import('../client/characters.js');
    const ancestor = (m, name) => { for (let n = m.parent; n; n = n.parent) if (n.name === name) return true; return false; };
    for (const hair of ['classic', 'tied', 'bob']) for (const implants of ['classic', 'temples', 'jaw'])
        for (const vest of ['classic', 'lapels', 'pockets']) for (const arms of ['classic', 'rolled', 'synthetic']) {
            const ch = buildCharacter(scene.scene, 'android', {}, { hair, implants, vest, arms });
            const meshes = ch.root.getChildMeshes(), byName = n => meshes.find(m => m.name === n);
            const component = n => meshes.find(m => m.metadata?.androidArmComponent === n);
            assert.ok(ch.zones.lights.some(m => m.metadata?.appearancePart?.slot === 'implants'), 'a visible implant is paintable');
            for (const t of [0, 0.1, 0.2, 0.3]) {
                ch.animate(t, t > 0); for (const m of meshes) m.computeWorldMatrix(true);
                assert.ok(byName('android_neck_joint').intersectsMesh(byName('android_head'), false) && byName('android_neck_joint').intersectsMesh(byName('android_torso'), false), `${hair}/${implants}/${vest}: joined neck`);
                for (const side of ['L', 'R']) {
                    const upper = component('upper' + side), elbow = component('elbow' + side), forearm = component('forearm' + side), hand = component('hand' + side);
                    assert.ok(upper && forearm && hand && [upper, forearm, hand].every(m => ancestor(m, 'arm' + side)), `${arms}: supported ${side} arm`);
                    assert.ok(forearm.intersectsMesh(hand, false), `${arms}: ${side} hand attached`);
                    if (elbow) assert.ok(upper.intersectsMesh(elbow, false) && elbow.intersectsMesh(forearm, false), `${arms}: ${side} elbow attached`);
                    else assert.ok(upper.intersectsMesh(forearm, false), `${arms}: ${side} forearm attached`);
                }
            }
            ch.root.dispose();
        }
    for (const [id, choices] of [['ceo', ['classic', 'compact', 'ceremonial']], ['android', ['classic', 'compact', 'pulse']]])
        for (const sidearm of choices) for (const arms of id === 'android' ? ['classic', 'rolled', 'synthetic'] : ['classic']) {
            const ch = buildCharacter(scene.scene, id, {}, { sidearm, arms });
            const meshes = ch.root.getChildMeshes(), tool = meshes.filter(m => m.metadata?.appearancePart?.slot === 'sidearm');
            const hand = id === 'ceo' ? meshes.find(m => m.name === 'ceo_hand_R') : meshes.find(m => m.metadata?.androidArmComponent === 'handR');
            const gun = ch.root.getDescendants().find(n => n.name === 'gun');
            assert.ok(tool.length >= 2 && tool.every(m => ancestor(m, 'gun') && ancestor(m, 'armR')), `${id}/${sidearm}: weapon follows the hand`);
            for (const t of [0, 0.1, 0.2, 0.3]) {
                ch.animate(t, t > 0); for (const m of [hand, ...tool]) m.computeWorldMatrix(true);
                assert.ok(tool.some(m => m.intersectsMesh(hand, false)), `${id}/${sidearm}/${arms}: weapon is held`);
            }
            const before = gun.position.z; ch.shoot(); ch.animate(0.35, true);
            assert.ok(gun.position.z < before, `${id}/${sidearm}: recoil`);
            ch.root.dispose();
        }
});

test('ROLE-14: both Director and bodyguard stand fully on their preview plinth', async () => {
    const { Preview3D } = await import('../client/scene3d.js');
    const engine = new B.NullEngine(), s = new B.Scene(engine);
    const disc = B.MeshBuilder.CreateCylinder('disc', { diameter: 1.6, height: 0.1, tessellation: 8 }, s);
    disc.position.y = -0.05;
    // Exercise the actual preview's update without requiring a WebGL canvas.
    const preview = { scene: s, disc, char: null, charId: null, partsKey: null };
    try {
        for (const robot of ['classic', 'sensor', 'armored']) {
            Preview3D.prototype.show.call(preview, 'ceo', {}, { robot });
            disc.computeWorldMatrix(true);
            const meshes = preview.char.root.getChildMeshes();
            for (const mesh of meshes) mesh.computeWorldMatrix(true);
            const feet = meshes.filter(m => ['footL', 'footR'].includes(m.metadata?.bodyguardComponent)
                || (['legL', 'legR'].includes(m.parent?.name) && Math.abs(m.getBoundingInfo().boundingBox.minimumWorld.y) < 1e-6));
            assert.equal(feet.length, 4, `${robot}: Director's and guard's feet found`);
            for (const foot of feet) {
                const { minimumWorld: lo, maximumWorld: hi } = foot.getBoundingInfo().boundingBox;
                for (const x of [lo.x + 0.002, hi.x - 0.002]) for (const z of [lo.z + 0.002, hi.z - 0.002]) {
                    const ray = new B.Ray(new B.Vector3(x, 0.2, z), new B.Vector3(0, -1, 0), 0.5);
                    assert.ok(s.pickWithRay(ray, m => m === disc).hit, `${robot}: ${foot.name} overhangs preview plinth`);
                }
            }
        }
        Preview3D.prototype.show.call(preview, 'android');
        assert.equal(disc.position.x, 0); assert.equal(disc.scaling.x, 1); assert.equal(disc.scaling.z, 1);
    } finally { s.dispose(); engine.dispose(); }
});

test('ROLE-15: the Medic’s cap encloses the crown of every hairstyle', async () => {
    const { buildCharacter } = await import('../client/characters.js');
    for (const hair of ['classic', 'tied', 'wavy']) {
        const ch = buildCharacter(scene.scene, 'medic', {}, { hair });
        ch.root.scaling.setAll(1);
        const meshes = ch.root.getChildMeshes(), cap = meshes.find(m => m.metadata?.medicCapCrown);
        const locks = meshes.filter(m => m.metadata?.appearancePart?.slot === 'hair');
        assert.ok(cap && locks.length, `${hair}: cap and hairstyle exist`);
        cap.isPickable = true; for (const m of locks) m.isPickable = true;
        for (const t of [0, 0.1, 0.2, 0.3]) {
            ch.animate(t, t > 0); for (const m of [cap, ...locks]) m.computeWorldMatrix(true);
            const crown = cap.getBoundingInfo().boundingBox;
            for (const lock of locks) {
                const b = lock.getBoundingInfo().boundingBox;
                if (b.maximumWorld.y > crown.minimumWorld.y + 0.002) {
                    assert.ok(b.maximumWorld.y < crown.maximumWorld.y - 0.002 && b.minimumWorld.x >= crown.minimumWorld.x - 0.002 && b.maximumWorld.x <= crown.maximumWorld.x + 0.002 && b.minimumWorld.z >= crown.minimumWorld.z - 0.002 && b.maximumWorld.z <= crown.maximumWorld.z + 0.002, `${hair}: no upper hair protrudes through the cap`);
                }
            }
            for (const x of [-0.15, 0, 0.15]) for (const z of [-0.14, 0, 0.14]) {
                const hit = scene.scene.pickWithRay(new B.Ray(new B.Vector3(x, 3.2 + ch.root.position.y, z), new B.Vector3(0, -1, 0), 1), m => m === cap || locks.includes(m));
                assert.equal(hit?.pickedMesh, cap, `${hair}: the cap, not hair, is visible from above`);
            }
        }
        ch.root.dispose();
    }
});

test('ROLE-16: the Janitor has distinct, connected workwear and independently paintable equipment', async () => {
    const { buildCharacter } = await import('../client/characters.js');
    for (const outfit of ['utility', 'protective']) for (const vacuum of ['classic', 'ribbed', 'twin']) {
        const ch = buildCharacter(scene.scene, 'janitor', {}, { outfit, vacuum });
        ch.root.scaling.setAll(1);
        const meshes = ch.root.getChildMeshes(), torso = meshes.find(m => m.metadata?.janitorTorso);
        const gear = ch.zones.gear.filter(m => m.metadata?.appearancePart?.slot === 'vacuum');
        assert.ok(torso && gear.length, `${outfit}/${vacuum}: replacement body and paintable vacuum`);
        ch.setColors({ gear: '#1579a1', overall: '#b95a2b' });
        assert.ok(gear.every(m => m.material.diffuseColor.toHexString().toLowerCase() === '#1579a1'));
        assert.equal(torso.material.diffuseColor.toHexString().toLowerCase(), '#b95a2b');
        for (const t of [0, 0.1, 0.2, 0.3, 0.4]) {
            ch.animate(t, t > 0); for (const m of meshes) m.computeWorldMatrix(true);
            if (outfit === 'utility') {
                const bib = meshes.find(m => m.metadata?.janitorApron === 'bib'), skirt = meshes.find(m => m.metadata?.janitorApron === 'skirt');
                assert.ok(bib && skirt && bib.parent === skirt.parent && bib.parent.parent === ch.root, 'the apron moves as a complete garment');
                assert.ok(bib.intersectsMesh(torso, true) && bib.intersectsMesh(skirt, true), 'the apron is attached continuously to the body');
            }
            // A complete trouser and boot on each leg, joined even while walking.
            const feet = [];
            for (const side of ['L', 'R']) {
                const leg = ch.root.getDescendants().find(n => n.name === 'leg' + side);
                const pieces = leg.getChildMeshes().filter(m => m.metadata?.appearancePart?.slot === 'outfit');
                const sole = pieces.find(m => m.metadata?.janitorBoot === 'sole'), shaft = pieces.find(m => m.metadata?.janitorBoot === 'shaft'), shin = pieces.find(m => m.metadata?.janitorShin);
                assert.ok(sole && shaft && shin && sole.intersectsMesh(shaft, true) && shaft.intersectsMesh(shin, true), `${outfit}: ${side} boot joins the trouser`);
                feet.push(sole);
            }
            if (t === 0) assert.ok(!feet[0].intersectsMesh(feet[1], true), `${outfit}: separate left and right feet`);
        }
        ch.root.dispose();
    }
});

test('ROLE-17: the Convict retains connected implants, arms and a chain between moving cuffs', async () => {
    const { buildCharacter } = await import('../client/characters.js');
    const ancestor = (m, name) => { for (let n = m.parent; n; n = n.parent) if (n.name === name) return true; return false; };
    for (const muzzle of ['classic', 'vents', 'guard']) for (const plates of ['classic', 'shoulder', 'asymmetric'])
        for (const chains of ['classic', 'heavy', 'links']) for (const arms of ['classic', 'prosthetic', 'cybernetic']) {
            const ch = buildCharacter(scene.scene, 'convict', {}, { muzzle, plates, chains, arms });
            ch.root.position.x = 1.3; ch.root.position.z = -0.8; ch.root.rotation.y = 0.7;
            const meshes = ch.root.getChildMeshes(), name = n => meshes.find(m => m.name === n), component = n => meshes.find(m => m.metadata?.convictArm === n);
            const cuffs = ['L', 'R'].map(side => meshes.find(m => m.metadata?.convictCuff === side));
            const links = meshes.filter(m => Number.isInteger(m.metadata?.convictChainSegment)).sort((a, b) => a.metadata.convictChainSegment - b.metadata.convictChainSegment);
            const width = chains === 'classic' ? 0.18 : chains === 'heavy' ? 0.25 : 0.22;
            assert.ok(cuffs.every(Boolean) && links.length >= 7 && links.every(m => ancestor(m, 'convict_chain')), `${chains}: full chain`);
            const endpoint = (m, positive) => B.Vector3.TransformCoordinates(new B.Vector3(0, positive ? 0.5 : -0.5, 0), m.getWorldMatrix());
            for (const t of [0, 0.1, 0.2, 0.3, 0.4, 0.5]) {
                ch.animate(t, t > 0); for (const m of meshes) m.computeWorldMatrix(true);
                assert.ok(name('convict_neck_joint').intersectsMesh(name('convict_head'), true) && name('convict_neck_joint').intersectsMesh(name('convict_torso'), true), 'head and torso joined');
                for (const [i, side] of ['L', 'R'].entries()) {
                    const upper = component('upper' + side), forearm = component('forearm' + side), hand = component('hand' + side);
                    assert.ok([upper, forearm, hand, cuffs[i]].every(m => m && ancestor(m, 'arm' + side)), `${arms}/${chains}: ${side} assembly follows arm`);
                    assert.ok(upper.intersectsMesh(name('convict_torso'), true) && upper.intersectsMesh(forearm, true) && forearm.intersectsMesh(hand, true), `${arms}: joined ${side} arm`);
                    assert.ok(cuffs[i].intersectsMesh(hand, true), `${chains}: ${side} cuff surrounds hand`);
                }
                const a = B.Vector3.TransformCoordinates(new B.Vector3(width * 0.45, 0, 0.1), cuffs[0].getWorldMatrix());
                const b = B.Vector3.TransformCoordinates(new B.Vector3(-width * 0.45, 0, 0.1), cuffs[1].getWorldMatrix());
                assert.ok(B.Vector3.Distance(endpoint(links[0], false), a) < 0.015 && B.Vector3.Distance(endpoint(links.at(-1), true), b) < 0.015, `${chains}: chain meets both cuffs`);
                for (let i = 0; i < links.length - 1; i++) assert.ok(B.Vector3.Distance(endpoint(links[i], true), endpoint(links[i + 1], false)) < 0.015, `${chains}: chain stays linked`);
            }
            ch.setColors({ mask: '#624b70', chains: '#80a5ae', lights: '#38e9b1' });
            assert.ok(ch.zones.chains.every(m => m.material.diffuseColor.toHexString().toLowerCase() === '#80a5ae'));
            ch.root.dispose();
        }
});

test('ROLE-18: the Psychologist’s clothing, arms and two complete drones stay independent', async () => {
    const { buildCharacter } = await import('../client/characters.js');
    const ancestor = (m, name) => { for (let n = m.parent; n; n = n.parent) if (n.name === name) return true; return false; };
    for (const vest of ['classic', 'clinical', 'harness']) for (const sleeves of ['classic', 'rolled', 'tech'])
        for (const drones of ['classic', 'rotors', 'array']) for (const hair of ['classic', 'layered', 'long']) {
            const ch = buildCharacter(scene.scene, 'psych', {}, { vest, sleeves, drones, hair });
            ch.root.scaling.setAll(1);
            const meshes = ch.root.getChildMeshes(), name = n => meshes.find(m => m.name === n), component = n => meshes.find(m => m.metadata?.psychArm === n);
            const bots = ch.root.getChildren().filter(n => n.name === 'drone');
            assert.equal(bots.length, 2, 'two drones remain distinct');
            assert.ok(bots.every(n => n.getChildMeshes().filter(m => m.metadata?.appearancePart?.slot === 'drones').length >= 3));
            const originalHeights = bots.map(n => n.position.y);
            for (const t of [0, 0.1, 0.2, 0.3]) {
                ch.animate(t, t > 0); for (const m of meshes) m.computeWorldMatrix(true);
                assert.ok(name('psych_neck_joint').intersectsMesh(name('psych_head'), true) && name('psych_neck_joint').intersectsMesh(name('psych_torso'), true), 'joined neck');
                for (const side of ['L', 'R']) {
                    const upper = component('upper' + side), forearm = component('forearm' + side), hand = component('hand' + side);
                    assert.ok([upper, forearm, hand].every(m => m && ancestor(m, 'arm' + side)), `${sleeves}: ${side} sleeve follows arm`);
                    assert.ok(upper.intersectsMesh(name('psych_torso'), true) && upper.intersectsMesh(forearm, true) && forearm.intersectsMesh(hand, true), `${sleeves}: ${side} arm is connected`);
                }
                if (vest === 'clinical') {
                    const tails = meshes.filter(m => m.parent?.name === 'psych_tunic_tails'), back = tails.find(m => m.position.x === 0);
                    const upperBack = meshes.find(m => m.metadata?.appearancePart?.slot === 'vest' && m.parent === ch.root && m.position.z === -0.18 && m.position.y > 1.8);
                    assert.ok(back && upperBack && back.intersectsMesh(upperBack, true) && tails.filter(m => m !== back).every(m => m.intersectsMesh(back, true)), 'tunic tails meet the back');
                }
            }
            assert.ok(bots.every((d, i) => Math.abs(d.position.y - originalHeights[i]) > 0.01), `${drones}: both drones hover`);
            ch.setColors({ coat: '#ecb6a0', drone: '#486070', lights: '#81fddb' });
            assert.ok(ch.zones.drone.every(m => m.material.diffuseColor.toHexString().toLowerCase() === '#486070'));
            ch.root.dispose();
        }
});

test('ROLE-19: the Psychologist’s hovering drones do not intersect her head or headset', async () => {
    const { buildCharacter } = await import('../client/characters.js');
    for (const hair of ['classic', 'layered', 'long']) for (const headset of ['classic', 'dual', 'sensor']) for (const drones of ['classic', 'rotors', 'array']) {
        const ch = buildCharacter(scene.scene, 'psych', {}, { hair, headset, drones });
        ch.root.scaling.setAll(1);
        const meshes = ch.root.getChildMeshes(), heads = meshes.filter(m => m.name === 'psych_head' || ['hair', 'headset'].includes(m.metadata?.appearancePart?.slot));
        const bots = ch.root.getChildren().filter(n => n.name === 'drone');
        for (const t of [0, 0.2, 0.5, 0.8]) {
            ch.animate(t, t > 0); for (const m of meshes) m.computeWorldMatrix(true);
            for (const bot of bots) for (const part of bot.getChildMeshes()) for (const head of heads)
                assert.ok(!part.intersectsMesh(head, true), `${hair}/${headset}/${drones}: drone intersects head at ${t}`);
        }
        ch.root.dispose();
    }
});

test('ROLE-20: Convict masks cover the mouth and Psychologist glasses remain visible', async () => {
    const { buildCharacter } = await import('../client/characters.js');
    for (const muzzle of ['classic', 'vents', 'guard']) {
        const ch = buildCharacter(scene.scene, 'convict', {}, { muzzle }); ch.root.scaling.setAll(1);
        const meshes = ch.root.getChildMeshes(), mask = meshes.filter(m => m.metadata?.appearancePart?.slot === 'muzzle'), head = meshes.find(m => m.name === 'convict_head');
        for (const m of [head, ...mask]) { m.isPickable = true; m.computeWorldMatrix(true); }
        for (const x of [-0.07, 0, 0.07]) for (const y of [2.3, 2.36]) {
            const hit = scene.scene.pickWithRay(new B.Ray(new B.Vector3(x, y, 1), new B.Vector3(0, 0, -1), 2), m => m === head || mask.includes(m));
            assert.ok(hit?.hit && mask.includes(hit.pickedMesh), `${muzzle}: mouth covered`);
        }
        ch.root.dispose();
    }
    for (const hair of ['classic', 'layered', 'long']) for (const headset of ['classic', 'dual', 'sensor']) {
        const ch = buildCharacter(scene.scene, 'psych', {}, { hair, headset }); ch.root.scaling.setAll(1);
        const meshes = ch.root.getChildMeshes(), glasses = meshes.filter(m => m.metadata?.psychGlasses), candidates = meshes.filter(m => m.name === 'psych_head' || m.metadata?.psychGlasses || ['hair', 'headset'].includes(m.metadata?.appearancePart?.slot));
        assert.equal(glasses.length, 2);
        for (const m of candidates) { m.isPickable = true; m.computeWorldMatrix(true); }
        for (const x of [-0.08, 0.08]) {
            const hit = scene.scene.pickWithRay(new B.Ray(new B.Vector3(x, 2.46, 1), new B.Vector3(0, 0, -1), 2), m => candidates.includes(m));
            assert.ok(glasses.includes(hit?.pickedMesh), `${hair}/${headset}: glasses unobstructed`);
        }
        ch.root.dispose();
    }
});
