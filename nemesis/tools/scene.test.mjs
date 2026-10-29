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

test('LAB-04: every preset changes real geometry, while the original and other characters stay unchanged', async () => {
    const { buildCharacter } = await import('../client/characters.js');
    const { LABRAT_PARTS, characterParts } = await import('../shared/appearance.mjs');
    const signature = (charId, parts) => {
        const ch = buildCharacter(scene.scene, charId, {}, parts);
        const result = ch.root.getChildMeshes().filter(m => m.name !== 'flash').map(m => {
            const box = m.getBoundingInfo().boundingBox;
            const v = x => [x.x, x.y, x.z].map(n => Number(n.toFixed(4)));
            return JSON.stringify([m.name, m.parent?.name, v(m.position), v(m.rotation), v(box.minimum), v(box.maximum)]);
        }).sort();
        ch.root.dispose();
        return result;
    };
    const defaults = characterParts('labrat');
    const original = signature('labrat');
    assert.deepEqual(signature('labrat', defaults), original, 'omitting parts preserves the original model');
    for (const slot of LABRAT_PARTS) for (const option of slot.options.slice(1)) {
        assert.notDeepEqual(signature('labrat', { ...defaults, [slot.id]: option.id }), original,
            `${slot.id}/${option.id} must change mesh geometry`);
    }
    assert.deepEqual(signature('labrat'), original, 'building presets did not mutate the shared spec');
    assert.deepEqual(signature('pilot', { hair: 'shaved', outfit: 'suit', eyes: 'visor', implants: 'crown' }), signature('pilot'),
        'other characters ignore Lab Rat presets');
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
    p.parts = { ...p.parts, hair: 'bob', eyes: 'visor' };
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
