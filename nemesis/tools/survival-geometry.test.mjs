// Geometry and colour regressions for the Survivor and Xenobiologist in an isolated Babylon process.
// NullEngine retains large internal caches even after disposal; isolating these many combinations
// keeps the complete test suite within Node's normal heap limit.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const noop = () => {};
const el = () => ({
    style: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    appendChild: noop, removeChild: noop, getContext: () => null, addEventListener: noop, removeEventListener: noop,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    setAttribute: noop, getAttribute: () => null, focus: noop, blur: noop, width: 800, height: 600,
    clientWidth: 800, clientHeight: 600, nodeName: 'CANVAS',
});
const doc = {
    createElement: el, createElementNS: el, documentElement: el(), body: el(), addEventListener: noop, removeEventListener: noop,
    getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], head: el(),
    fonts: { add: noop, ready: Promise.resolve() }, pointerLockElement: null,
};
const sandbox = {
    document: doc, navigator: { userAgent: 'node', platform: 'node', maxTouchPoints: 0, language: 'ru' },
    location: { href: 'http://localhost/', protocol: 'http:' }, performance: { now: () => Date.now() },
    requestAnimationFrame: cb => setTimeout(cb, 16), cancelAnimationFrame: noop,
    addEventListener: noop, removeEventListener: noop, innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1,
    localStorage: { getItem: () => null, setItem: noop }, setTimeout, clearTimeout, setInterval, clearInterval,
    URL, URLSearchParams, ArrayBuffer, Uint8Array, Blob: class {}, HTMLElement: class {}, Image: class {}, WebGLRenderingContext: class {},
};
sandbox.window = sandbox; sandbox.self = sandbox; sandbox.globalThis = sandbox;
vm.runInContext(fs.readFileSync(new URL('../../libs/babylon.js', import.meta.url), 'utf8'), vm.createContext(sandbox), { filename: 'babylon.js' });
globalThis.window = sandbox;
globalThis.localStorage = sandbox.localStorage;
try { Object.defineProperty(globalThis, 'document', { value: doc, configurable: true, writable: true }); } catch { globalThis.document = doc; }
const B = sandbox.BABYLON;

const engine = new B.NullEngine(), scene = { scene: new B.Scene(engine) };

const { buildCharacter, characterColors, DEFAULTS } = await import('../client/characters.js');
const S = scene.scene;
const ancestor = (m, name) => { for (let n = m?.parent; n; n = n.parent) if (n.name === name) return true; return false; };
const meshesOf = ch => ch.root.getChildMeshes();
const refresh = ch => { for (const m of meshesOf(ch)) m.computeWorldMatrix(true); };
const named = (meshes, n) => meshes.find(m => m.name === n);
const slotOf = (meshes, slot) => meshes.filter(m => m.metadata?.appearancePart?.slot === slot);

test('ROLE-25: Survivor’s sling, arm and pistol remain joined while walking and firing', () => {
    for (const outfit of ['classic', 'field', 'salvage']) for (const sidearm of ['classic', 'compact', 'burst']) {
        const ch = buildCharacter(S, 'survivor', {}, { outfit, sidearm }); ch.root.scaling.setAll(1);
        const meshes = meshesOf(ch), component = n => meshes.find(m => m.metadata?.survivorBandage === n);
        const upper = side => meshes.find(m => m.metadata?.survivorUpper === side);
        const torso = meshes.find(m => m.metadata?.survivorTorso), hand = named(meshes, 'survivor_hand_R');
        const forearm = named(meshes, 'survivor_forearm_R'), grip = meshes.find(m => m.metadata?.survivorGunGrip);
        const gun = ch.root.getDescendants().find(n => n.name === 'gun');
        assert.ok([torso, hand, forearm, grip, gun, upper('L'), upper('R')].every(Boolean), `${outfit}/${sidearm}: complete figure`);
        assert.ok(slotOf(meshes, 'sidearm').every(m => ancestor(m, 'gun') && ancestor(m, 'armR')), `${sidearm}: entire pistol follows the hand`);
        for (const t of [0, 0.1, 0.2, 0.3, 0.4]) {
            ch.animate(t, t > 0); refresh(ch);
            assert.ok(named(meshes, 'survivor_neck_joint').intersectsMesh(named(meshes, 'survivor_head'), true), 'head meets neck');
            assert.ok(named(meshes, 'survivor_neck_joint').intersectsMesh(torso, true), `${outfit}: neck meets torso`);
            assert.ok(upper('L').intersectsMesh(torso, true) && upper('R').intersectsMesh(torso, true), `${outfit}: shoulders meet torso`);
            assert.ok(upper('R').intersectsMesh(forearm, true) && forearm.intersectsMesh(hand, true), `${outfit}: right arm is continuous`);
            assert.ok(grip.intersectsMesh(hand, true), `${sidearm}: grip remains in the hand at ${t}`);
            assert.equal(ch.root.getChildren().find(n => n.name === 'armL').rotation.x, 0, 'injured arm does not swing out of the sling');
            assert.ok(upper('L').intersectsMesh(component('elbow'), true), 'sleeve joins the bandaged elbow');
            assert.ok(component('elbow').intersectsMesh(component('join'), true) && component('join').intersectsMesh(component('forearm'), true), 'elbow joins forearm');
            assert.ok(component('forearm').intersectsMesh(component('hand'), true), 'sling forearm joins hand');
            const straps = meshes.filter(m => m.metadata?.survivorBandage === 'strap');
            assert.equal(straps.length, 2);
            assert.ok(straps.every(m => m.intersectsMesh(component('forearm'), true) || m.intersectsMesh(component('hand'), true)), 'both straps support the arm');
        }
        const before = gun.position.z; ch.shoot(); ch.animate(0.45, true); refresh(ch);
        assert.ok(gun.position.z < before && grip.intersectsMesh(hand, true), `${sidearm}: pistol stays held through recoil`);
        ch.root.dispose();
    }
});

test('ROLE-26: every Survivor bandana covers the mouth with all hairstyles and radios', () => {
    for (const hair of ['classic', 'wavy', 'long']) for (const bandana of ['classic', 'folded', 'tails'])
        for (const radio of ['classic', 'dual', 'caged']) {
            const ch = buildCharacter(S, 'survivor', {}, { hair, bandana, radio }); ch.root.scaling.setAll(1);
            const masks = slotOf(meshesOf(ch), 'bandana').filter(m => (ch.zones.mask || []).includes(m));
            for (const m of masks) m.isPickable = true;
            refresh(ch);
            const pack = slotOf(meshesOf(ch), 'radio');
            for (const p of pack) for (const h of ch.zones.hair || [])
                assert.ok(!p.intersectsMesh(h, true), `${hair}/${bandana}/${radio}: radio ${p.getAbsolutePosition()} clears hair ${h.getAbsolutePosition()}`);
            for (const x of [-0.08, 0, 0.08]) for (const y of [2.29, 2.36, 2.43]) {
                const hit = S.pickWithRay(new B.Ray(new B.Vector3(x, y, 1), new B.Vector3(0, 0, -1), 2), m => masks.includes(m));
                assert.ok(hit.hit, `${hair}/${bandana}/${radio}: cloth covers the face at ${x}, ${y}`);
            }
            ch.root.dispose();
        }
});

test('ROLE-27: Xenobiologist keeps connected arms, an attached sample and a joined neck', () => {
    for (const jacket of ['classic', 'collar', 'pockets']) for (const tool of ['classic', 'sampler', 'analyzer']) {
        const ch = buildCharacter(S, 'xeno', {}, { jacket, tool }); ch.root.scaling.setAll(1);
        const meshes = meshesOf(ch), shirt = meshes.find(m => m.metadata?.xenoShirt),
            hand = named(meshes, 'xeno_hand_R'), forearm = named(meshes, 'xeno_forearm_R'),
            upper = side => meshes.find(m => m.metadata?.xenoUpper === side),
            grip = meshes.find(m => m.metadata?.xenoToolGrip), sample = meshes.find(m => m.metadata?.xenoSample);
        const prop = ch.root.getDescendants().find(n => n.name === 'xeno_tool');
        assert.ok([shirt, hand, forearm, grip, sample, prop, upper('L'), upper('R')].every(Boolean), `${jacket}/${tool}: complete figure`);
        assert.ok(slotOf(meshes, 'tool').every(m => ancestor(m, 'xeno_tool') && ancestor(m, 'armR')), `${tool}: the complete instrument follows the hand`);
        for (const t of [0, 0.1, 0.2, 0.3, 0.4]) {
            ch.animate(t, t > 0); refresh(ch);
            assert.ok(named(meshes, 'xeno_neck_joint').intersectsMesh(named(meshes, 'xeno_head'), true), 'head meets neck');
            assert.ok(named(meshes, 'xeno_neck_joint').intersectsMesh(shirt, true), `${jacket}: neck meets shirt`);
            for (const side of ['L', 'R']) {
                const torsoParts = slotOf(meshes, 'jacket').filter(m => m.parent === ch.root && m !== upper(side));
                assert.ok(torsoParts.some(m => m.intersectsMesh(upper(side), true)), `${jacket}: ${side} sleeve meets jacket`);
            }
            assert.ok(upper('R').intersectsMesh(forearm, true) && forearm.intersectsMesh(hand, true), `${jacket}: right arm is continuous`);
            assert.ok(grip.intersectsMesh(hand, true), `${tool}: instrument is held at ${t}`);
            assert.ok(slotOf(meshes, 'tool').some(m => m !== sample && sample.intersectsMesh(m, true)), `${tool}: sample is attached to instrument`);
            if (jacket === 'pockets') {
                const tails = meshes.filter(m => m.metadata?.xenoCoatTail), body = slotOf(meshes, 'jacket').filter(m => m.parent === ch.root);
                assert.equal(tails.length, 4, 'split jacket has front and back on both sides');
                for (const tail of tails) {
                    assert.ok(ancestor(tail, tail.position.x < 0 ? 'legL' : 'legR'), 'tail moves with its leg');
                    assert.ok(body.some(m => m.intersectsMesh(tail, true)), `field jacket remains joined to tail at ${t}`);
                }
            }
        }
        ch.root.dispose();
    }
});

test('ROLE-28: Xenobiologist’s probe stays whole and clear of each hairstyle, and glasses remain visible', () => {
    for (const hair of ['classic', 'loosecurl', 'longtail']) for (const probe of ['classic', 'twin', 'shield']) {
        const ch = buildCharacter(S, 'xeno', {}, { hair, probe }); ch.root.scaling.setAll(1);
        const meshes = meshesOf(ch), parts = slotOf(meshes, 'probe'), hairMeshes = ch.zones.hair || [];
        const lenses = meshes.filter(m => m.metadata?.xenoGlasses);
        assert.equal(lenses.length, 2, `${hair}/${probe}: glasses retained`);
        assert.ok(parts.length >= 6 && parts.every(m => ancestor(m, 'xeno_probe')), `${probe}: whole probe uses one mount`);
        assert.ok(ancestor(ch.root.getDescendants().find(n => n.name === 'scanHead'), 'xeno_probe'), `${probe}: scanner head attached`);
        for (const m of [...hairMeshes, ...lenses]) m.isPickable = true;
        for (const t of [0, 0.1, 0.2, 0.3]) {
            ch.animate(t, t > 0); refresh(ch);
            for (const p of parts) for (const h of hairMeshes)
                assert.ok(!p.intersectsMesh(h, true), `${hair}/${probe}: manipulator ${p.name} at ${p.getAbsolutePosition()} does not pierce hair at ${h.getAbsolutePosition()} at ${t}`);
            assert.ok(parts.every(m => ancestor(m, 'xeno_probe')), `${probe}: no probe parts detach during movement`);
        }
        ch.animate(0.4, false); ch.root.position.y = 0; refresh(ch);
        for (const x of [-0.08, 0.08]) {
            const hit = S.pickWithRay(new B.Ray(new B.Vector3(x, 2.46, 1), new B.Vector3(0, 0, -1), 2), m => hairMeshes.includes(m) || lenses.includes(m));
            assert.ok(lenses.includes(hit.pickedMesh), `${hair}/${probe}: hair does not cover the glasses`);
        }
        ch.root.dispose();
    }
});

test('ROLE-29: independent paint zones preserve saved Xenobiologist coat colours', () => {
    assert.equal(characterColors('xeno', { coat: '#123456' }).pants, '#123456', 'old coat paint also colours trousers');
    assert.equal(characterColors('xeno', { coat: '#123456', pants: '#abcdef' }).pants, '#abcdef', 'new trousers override the old fallback');
    for (const trousers of ['classic', 'utility', 'field']) {
        const ch = buildCharacter(S, 'xeno', { coat: '#123456' }, { trousers });
        assert.ok(ch.zones.pants.every(m => m.material.diffuseColor.toHexString().toLowerCase() === '#123456'));
        ch.setColors({ coat: '#123456', pants: '#abcdef' });
        assert.ok(ch.zones.pants.every(m => m.material.diffuseColor.toHexString().toLowerCase() === '#abcdef'));
        assert.ok(ch.zones.coat.every(m => m.material.diffuseColor.toHexString().toLowerCase() === '#123456'));
        ch.setColors({}); assert.ok(ch.zones.pants.every(m => m.material.diffuseColor.toHexString().toLowerCase() === DEFAULTS.xeno.coat));
        ch.root.dispose();
    }
    for (const bandana of ['classic', 'folded', 'tails']) {
        const ch = buildCharacter(S, 'survivor', { mask: '#aa1122', bandage: '#33bb44', armor: '#123456' }, { bandana });
        for (const [zone, hex] of [['mask', '#aa1122'], ['bandage', '#33bb44'], ['armor', '#123456']])
            assert.ok(ch.zones[zone].length && ch.zones[zone].every(m => m.material.diffuseColor.toHexString().toLowerCase() === hex), `${bandana}: independent ${zone}`);
        ch.root.dispose();
    }
});
