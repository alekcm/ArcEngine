// Geometry tests for the Captain, Bounty Hunter and Laika in an isolated Babylon process.
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

test('ROLE-21: Hunter holds every rifle and Laika stays a complete animated companion', async () => {
    const { buildCharacter } = await import('../client/characters.js');
    const ancestor = (m, name) => { for (let n = m.parent; n; n = n.parent) if (n.name === name) return true; return false; };
    for (const armor of ['classic', 'layered', 'heavy']) for (const outfit of ['classic', 'scout', 'armored'])
        for (const rifle of ['classic', 'marksman', 'compact']) for (const dog of ['classic', 'packs', 'guard']) {
            const ch = buildCharacter(scene.scene, 'bounty', {}, { armor, outfit, rifle, dog }); ch.root.scaling.setAll(1);
            const meshes = ch.root.getChildMeshes(), by = key => meshes.find(m => m.metadata?.[key]), name = n => meshes.find(m => m.name === n);
            const component = n => meshes.find(m => m.metadata?.commandArm === n);
            const gun = ch.root.getDescendants().find(n => n.name === 'gun'), rifleParts = meshes.filter(m => m.metadata?.appearancePart?.slot === 'rifle');
            const canine = ch.root.getDescendants().find(n => n.name === 'dog'), dogParts = meshes.filter(m => m.metadata?.appearancePart?.slot === 'dog');
            const body = by('dogBody'), neck = by('dogNeck'), head = by('dogHead');
            assert.ok(canine && gun && dogParts.length > 15 && dogParts.every(m => ancestor(m, 'dog')), `${dog}: complete companion`);
            assert.ok(rifleParts.length >= 5 && rifleParts.every(m => ancestor(m, 'gun')), `${rifle}: complete weapon`);
            let walked = false;
            for (const t of [0, 0.1, 0.2, 0.3, 0.4]) {
                ch.animate(t, t > 0); for (const m of meshes) m.computeWorldMatrix(true);
                assert.ok(name('bounty_neck_joint').intersectsMesh(name('bounty_head'), true) && name('bounty_neck_joint').intersectsMesh(by('commandTorso'), true), 'Hunter head is joined');
                assert.ok(by('commandWaist').intersectsMesh(by('commandTorso'), true), 'Hunter waist is joined');
                for (const side of ['L', 'R']) {
                    const upper = component('upper' + side), forearm = component('forearm' + side), hand = component('hand' + side);
                    assert.ok([upper, forearm, hand].every(m => m && ancestor(m, 'arm' + side)), `${outfit}: attached ${side} arm`);
                    assert.ok(upper.intersectsMesh(by('commandTorso'), true) && upper.intersectsMesh(forearm, true) && forearm.intersectsMesh(hand, true), `${outfit}: connected ${side} arm`);
                    assert.ok(rifleParts.some(m => m.intersectsMesh(hand, true)), `${rifle}/${outfit}: ${side} hand holds rifle at ${t}`);
                }
                assert.ok(head.intersectsMesh(neck, true) && neck.intersectsMesh(body, true), `${dog}: head and body connected`);
                for (let i = 0; i < 4; i++) {
                    const leg = meshes.find(m => m.metadata?.dogLeg === i), foot = meshes.find(m => m.metadata?.dogFoot === i);
                    assert.ok(ancestor(leg, 'dog_leg' + i) && ancestor(foot, 'dog_leg' + i), `${dog}: leg ${i} rigged`);
                    assert.ok(leg.intersectsMesh(body, true) && leg.intersectsMesh(foot, true), `${dog}: leg ${i} connected`);
                }
                walked ||= Math.abs(canine.getDescendants().find(n => n.name === 'dog_leg0').rotation.x) > 0.1;
            }
            assert.ok(walked, `${dog}: Laika walks`);
            const before = gun.position.z; ch.shoot(); ch.animate(0.45, true); assert.ok(gun.position.z < before, `${rifle}: recoil`);
            for (const m of meshes) m.computeWorldMatrix(true);
            for (const side of ['L', 'R']) assert.ok(rifleParts.some(m => m.intersectsMesh(component('hand' + side), true)), `${rifle}: grip remains connected through recoil`);
            ch.setColors({ dog: '#ad8554', armor: '#8090a0', lights: '#39ffae' });
            assert.ok(ch.zones.dog.every(m => m.material.diffuseColor.toHexString().toLowerCase() === '#ad8554'));
            ch.root.dispose();
        }
});

test('ROLE-22: Captain armour, uniform and revolver stay connected and independent', async () => {
    const { buildCharacter } = await import('../client/characters.js');
    const ancestor = (m, name) => { for (let n = m.parent; n; n = n.parent) if (n.name === name) return true; return false; };
    for (const shoulders of ['classic', 'layered', 'heavy']) for (const vest of ['classic', 'ribbed', 'radio'])
        for (const uniform of ['classic', 'field', 'long']) for (const sidearm of ['classic', 'heavy', 'compact']) {
            const ch = buildCharacter(scene.scene, 'captain', {}, { shoulders, vest, uniform, sidearm }); ch.root.scaling.setAll(1);
            const meshes = ch.root.getChildMeshes(), by = key => meshes.find(m => m.metadata?.[key]), name = n => meshes.find(m => m.name === n);
            const component = n => meshes.find(m => m.metadata?.commandArm === n);
            const gun = ch.root.getDescendants().find(n => n.name === 'gun'), weapon = meshes.filter(m => m.metadata?.appearancePart?.slot === 'sidearm');
            assert.ok(weapon.length >= 4 && weapon.every(m => ancestor(m, 'armR')), `${sidearm}: held weapon follows hand`);
            for (const t of [0, 0.1, 0.2, 0.3]) {
                ch.animate(t, t > 0); for (const m of meshes) m.computeWorldMatrix(true);
                assert.ok(name('captain_neck_joint').intersectsMesh(name('captain_head'), true) && name('captain_neck_joint').intersectsMesh(by('commandTorso'), true), 'Captain head is joined');
                assert.ok(by('commandWaist').intersectsMesh(by('commandTorso'), true), 'Captain waist is joined');
                for (const side of ['L', 'R']) {
                    const upper = component('upper' + side), forearm = component('forearm' + side), hand = component('hand' + side);
                    assert.ok([upper, forearm, hand].every(m => m && ancestor(m, 'arm' + side)), `${uniform}: attached ${side} arm`);
                    assert.ok(upper.intersectsMesh(by('commandTorso'), true) && upper.intersectsMesh(forearm, true) && forearm.intersectsMesh(hand, true), `${uniform}: joined ${side} arm`);
                }
                assert.ok(weapon.some(m => m.intersectsMesh(component('handR'), true)), `${sidearm}: revolver is in hand`);
                if (uniform === 'long') {
                    const hem = meshes.filter(m => m.parent?.name === 'captain_jacket_hem');
                    const panels = hem.filter(m => (ch.zones.shirt || []).includes(m));
                    assert.equal(panels.length, 4, 'closed jacket has front, back and both sides');
                    const front = panels.find(m => m.position.z > 0.1), back = panels.find(m => m.position.z < -0.1);
                    const sides = panels.filter(m => Math.abs(m.position.x) > 0.1);
                    assert.ok(front && back && sides.length === 2 && sides.every(m => m.intersectsMesh(front, true) && m.intersectsMesh(back, true)), 'both sides connect front and back');
                    assert.ok(panels.some(m => m.intersectsMesh(by('commandTorso'), true)), 'hem meets upper jacket');
                    if (t === 0) {
                        for (const m of panels) m.isPickable = true;
                        for (const x of [-0.12, 0.12]) {
                            const hit = scene.scene.pickWithRay(new B.Ray(new B.Vector3(x, 1.18, 1), new B.Vector3(0, 0, -1), 2), m => panels.includes(m));
                            assert.equal(hit?.pickedMesh, front, 'jacket is closed on both sides of the front');
                        }
                    }
                }
            }
            const before = gun.position.z; ch.shoot(); ch.animate(0.35, true); assert.ok(gun.position.z < before, `${sidearm}: recoil`);
            for (const m of meshes) m.computeWorldMatrix(true);
            assert.ok(weapon.some(m => m.intersectsMesh(component('handR'), true)), `${sidearm}: grip remains connected through recoil`);
            ch.root.dispose();
        }
});

test('ROLE-23: Hunter and Laika are both supported by the workshop stand', async () => {
    const { Preview3D } = await import('../client/scene3d.js');
    const engine = new B.NullEngine(), s = new B.Scene(engine);
    const disc = B.MeshBuilder.CreateCylinder('disc', { diameter: 1.6, height: 0.1, tessellation: 8 }, s); disc.position.y = -0.05;
    const preview = { scene: s, disc, char: null, charId: null, partsKey: null };
    try {
        for (const dog of ['classic', 'packs', 'guard']) {
            Preview3D.prototype.show.call(preview, 'bounty', {}, { dog }); disc.computeWorldMatrix(true);
            const meshes = preview.char.root.getChildMeshes(); for (const m of meshes) m.computeWorldMatrix(true);
            const feet = meshes.filter(m => Number.isInteger(m.metadata?.dogFoot) || (['legL', 'legR'].includes(m.parent?.name) && Math.abs(m.getBoundingInfo().boundingBox.minimumWorld.y) < 1e-6));
            assert.equal(feet.length, 6, `${dog}: two Hunter and four Laika feet`);
            for (const foot of feet) {
                const { minimumWorld: lo, maximumWorld: hi } = foot.getBoundingInfo().boundingBox;
                for (const x of [lo.x + 0.002, hi.x - 0.002]) for (const z of [lo.z + 0.002, hi.z - 0.002])
                    assert.ok(s.pickWithRay(new B.Ray(new B.Vector3(x, 0.2, z), new B.Vector3(0, -1, 0), 0.5), m => m === disc).hit, `${dog}: ${foot.name} supported`);
            }
        }
        Preview3D.prototype.show.call(preview, 'captain'); assert.equal(disc.position.x, 0); assert.equal(disc.scaling.x, 1);
    } finally { s.dispose(); engine.dispose(); }
});

test('ROLE-24: Laika options replace body proportions as well as field equipment', async () => {
    const { buildCharacter } = await import('../client/characters.js');
    const shapes = [];
    for (const dog of ['classic', 'packs', 'guard']) {
        const ch = buildCharacter(scene.scene, 'bounty', {}, { dog });
        const body = ch.root.getChildMeshes().find(m => m.metadata?.dogBody);
        const box = body.getBoundingInfo().boundingBox;
        shapes.push([box.maximum.x - box.minimum.x, box.maximum.z - box.minimum.z]);
        ch.root.dispose();
    }
    assert.equal(new Set(shapes.map(shape => JSON.stringify(shape))).size, 3, 'three distinct full-body shapes');
});
