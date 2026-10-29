// Isolated exhaustive geometry check, launched once per role by scene.test.mjs. Babylon's
// NullEngine keeps substantial internal caches even after individual meshes are disposed; a fresh
// process per role keeps all 3^5 combinations testable under Node's normal heap limit.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { CREW_PARTS } from '../shared/appearance.mjs';

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
const B = sandbox.BABYLON;
const { buildCharacter } = await import('../client/characters.js');
const id = process.argv[2], slots = CREW_PARTS[id];
assert.ok(slots, 'known crew role required');
const requiredNodes = { soldier: ['gun'], scout: ['gun'], mechanic: [], pilot: ['gun'], hacker: ['gun'],
    scientist: ['wheel'], medic: ['gun'], janitor: ['janitor_wand'], ceo: ['robot', 'gun'], android: ['gun'], convict: [],
    psych: ['drone'], bounty: ['dog', 'gun'], captain: ['gun'], survivor: ['gun'], xeno: ['scanHead'] };
const belongs = (node, root) => { for (let n = node; n; n = n.parent) if (n === root) return true; return false; };
const engine = new B.NullEngine(), scene = new B.Scene(engine);
const combos = slots.reduce((acc, slot) => acc.flatMap(old => slot.options.map(o => ({ ...old, [slot.id]: o.id }))), [{}]);
for (const parts of combos) {
    const before = new Set(scene.meshes);
    const ch = buildCharacter(scene, id, {}, parts), label = id + ' ' + JSON.stringify(parts);
    const meshes = scene.meshes.filter(m => !before.has(m));
    assert.ok(meshes.length > 20, label + ': full miniature');
    assert.ok(meshes.every(m => belongs(m, ch.root)), label + ': no detached accessories');
    for (const name of requiredNodes[id]) assert.ok(ch.root.getDescendants().some(n => n.name === name), label + ': retains ' + name);
    if (id === 'psych') assert.equal(ch.root.getChildren().filter(n => n.name === 'drone').length, 2, label + ': two drones');
    if (id === 'scientist') assert.equal(ch.root.getChildMeshes().filter(m => m.name === 'wheel').length, 4, label + ': powered wheelchair');
    if (id === 'convict') assert.ok(ch.zones.skin?.length && ch.zones.mask?.length && ch.zones.chains?.length, label + ': skin, muzzle and chains');
    if (id === 'survivor') assert.ok(ch.root.getChildMeshes().some(m => m.material.diffuseColor?.toHexString().toLowerCase() === '#2b2a28'), label + ': face remains covered');
    const colors = Object.fromEntries(Object.keys(ch.zones).map((z, i) => [z, '#' + (0x123456 + i * 0x010101).toString(16).padStart(6, '0')]));
    ch.setColors(colors);
    for (const [zone, hex] of Object.entries(colors))
        assert.ok(ch.zones[zone].every(m => m.material.diffuseColor.toHexString().toLowerCase() === hex), label + ': paint ' + zone);
    ch.animate(0.1, true); ch.animate(0.2, true);
    assert.ok(meshes.every(m => belongs(m, ch.root)), label + ': attachments remain after movement');
    ch.root.dispose();
}
scene.dispose(); engine.dispose();
console.log('RESULT ' + combos.length);
