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
    scout: '25b50cb28ab4dc46e4c8251b462bf7db4e0eb2abc9eb28fc082bbfef724245eb',
    mechanic: '1ba784e3e2504366a9777568e3b70b8feedab1def79c00847ec061a7f2c8fdb5',
    pilot: 'e418f84fb3a63b8771474b98744d464fb8f0d2b2aae392a310861787eb46b989',
    hacker: 'bf0e8e492b9a175443b8894ec6f506b9cb7980a78c5c9a0263cff99459578e27',
    scientist: '023c0fca22b1209ebcb0fa5540f9fa33a4b39a67c181964315161b6eaa6d799b',
    medic: 'fbd83941fbd5ff5283425ae1dc5bac635a8216861fa9e7af6b55515de7084fcb',
    janitor: 'b540b75ee294fdab33f5533a4324176abf0684d9bc573e39fd5cbad7279080b8',
    ceo: '5bd3411416453ae47d2da6754a3e49a67de2c984203f04e76cf3aafb5556266b',
    android: '858591af7f58d0af20581cd1217b0bf77fbd9e85e24f6c48ab586397e6f8bc0f',
    convict: '2d5477ab4e352d6bff66b48feb0491488d78d10754f181beca1fa6dac37d81b1',
    psych: '58da8e33c1e390d69a8b4f2985f15dfa92a57924d5b0815e1f738657393cf5e1',
    bounty: '04a7f6a04fcb012a6a98d701d37fb9916edc0943ad2905f66087acfcaffa1a79',
    captain: '3d707abf4830a827ba018ea77444d5922e11ffbc740baeb4e7f6b2c043231c80',
    survivor: '5ff5ab81068aed27b51da8ef22abca159ba0531292a14efc23f204667ea9ef0d',
    xeno: '85d76328df00a5820a85f907986fa50e87e65499e9f922c4f87443cf95c84374',
};

test('CREW-03: all original miniatures are unchanged and every option changes real geometry', async () => {
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
    const { buildCharacter } = await import('../client/characters.js');
    const { CREW_PARTS } = await import('../shared/appearance.mjs');
    const requiredNodes = { soldier: ['gun'], scout: ['gun'], mechanic: [], pilot: ['gun'], hacker: ['gun'],
        scientist: ['wheel'], medic: ['gun'], janitor: [], ceo: ['robot', 'gun'], android: ['gun'], convict: [],
        psych: ['drone'], bounty: ['dog', 'gun'], captain: ['gun'], survivor: ['gun'], xeno: ['scanHead'] };
    const belongs = (node, root) => { for (let n = node; n; n = n.parent) if (n === root) return true; return false; };
    let checked = 0;
    for (const [id, slots] of Object.entries(CREW_PARTS)) {
        const combos = slots.reduce((acc, slot) => acc.flatMap(old => slot.options.map(o => ({ ...old, [slot.id]: o.id }))), [{}]);
        for (const parts of combos) {
            const before = new Set(scene.scene.meshes);
            const ch = buildCharacter(scene.scene, id, {}, parts), label = id + ' ' + JSON.stringify(parts);
            const meshes = scene.scene.meshes.filter(m => !before.has(m));
            assert.ok(meshes.length > 20, label + ': full miniature');
            assert.ok(meshes.every(m => belongs(m, ch.root)), label + ': no detached accessories');
            for (const nodeName of requiredNodes[id]) assert.ok(ch.root.getDescendants().some(n => n.name === nodeName), label + ': retains ' + nodeName);
            if (id === 'psych') assert.equal(ch.root.getChildren().filter(n => n.name === 'drone').length, 2, label + ': two drones');
            if (id === 'scientist') assert.equal(ch.root.getChildMeshes().filter(m => m.name === 'wheel').length, 4, label + ': powered wheelchair');
            if (id === 'convict') assert.ok(ch.zones.skin?.length && ch.zones.mask?.length && ch.zones.chains?.length, label + ': skin, muzzle and chains');
            if (id === 'survivor') assert.ok(ch.root.getChildMeshes().some(m => m.material.diffuseColor?.toHexString().toLowerCase() === '#2b2a28'), label + ': face remains covered');
            const colors = Object.fromEntries(Object.keys(ch.zones).map((z, i) => [z, '#' + (0x123456 + i * 0x010101).toString(16).padStart(6, '0')]));
            ch.setColors(colors);
            for (const [zone, hex] of Object.entries(colors)) {
                assert.ok(ch.zones[zone].every(m => m.material.diffuseColor.toHexString().toLowerCase() === hex), label + ': paint ' + zone);
            }
            ch.animate(0.1, true); ch.animate(0.2, true);
            assert.ok(meshes.every(m => belongs(m, ch.root)), label + ': attachments remain after movement');
            ch.root.dispose(); checked++;
        }
    }
    const expected = Object.values(CREW_PARTS).reduce((sum, slots) => sum + slots.reduce((n, s) => n * s.options.length, 1), 0);
    assert.equal(checked, expected);
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

test('ROLE-01: Soldier and Mechanic options replace the original meshes, rather than overlaying them', async () => {
    const { buildCharacter } = await import('../client/characters.js');
    const { CREW_PARTS, characterParts } = await import('../shared/appearance.mjs');
    const partMeshes = (ch, slot) => ch.root.getChildMeshes().filter(m => m.metadata?.appearancePart?.slot === slot);
    const signature = meshes => geometrySignature({ root: { getChildMeshes: () => meshes } });
    for (const id of ['soldier', 'mechanic']) for (const slot of CREW_PARTS[id]) {
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
