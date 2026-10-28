// dice.test.mjs — the labels on the big die in the middle of the table.
//   node --test nemesis/tools/dice.test.mjs
// The numbers on the combat die came out upside down and tilted: "right" was taken from an arbitrary
// vertex of the face, and the basis was crossed in the wrong order. On screen the D10 lay on its side
// with the underlined 6/9 reading as an upside-down 9. These tests build the real die geometry with
// the Babylon that the repo ships and check the axes of every label plane:
//   * the triple (right, up, -normal) is a rotation, not a mirror — a mirrored basis flips glyphs;
//   * "up" of the text points up in the world on every face that is not the top/bottom one.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// The client loads Babylon as a global; these tests give it the same global in a sandbox.
const noop = () => {};
const el = () => ({
    style: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    appendChild: noop, removeChild: noop, getContext: () => null, addEventListener: noop, removeEventListener: noop,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    setAttribute: noop, getAttribute: () => null, focus: noop, width: 800, height: 600, clientWidth: 800, clientHeight: 600,
});
const doc = {
    createElement: el, createElementNS: el, documentElement: el(), body: el(), addEventListener: noop, removeEventListener: noop,
    getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], head: el(),
    fonts: { add: noop, ready: Promise.resolve() },
};
const sandbox = {
    document: doc,
    navigator: { userAgent: 'node', platform: 'node', maxTouchPoints: 0, language: 'ru' },
    location: { href: 'http://localhost/', protocol: 'http:' },
    performance: { now: () => Date.now() },
    requestAnimationFrame: cb => setTimeout(cb, 16), cancelAnimationFrame: noop,
    addEventListener: noop, removeEventListener: noop,
    innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1,
    localStorage: { getItem: () => null, setItem: noop },
    setTimeout, clearTimeout, setInterval, clearInterval, URL, URLSearchParams, ArrayBuffer, Uint8Array,
    Blob: class { }, HTMLElement: class { }, Image: class { }, WebGLRenderingContext: class { },
    AudioContext: class {
        constructor() { this.destination = {}; this.state = 'running'; this.currentTime = 0; this.sampleRate = 44100; }
    },
};
sandbox.window = sandbox; sandbox.self = sandbox; sandbox.globalThis = sandbox;
const babylonSource = fs.readFileSync(new URL('../../libs/babylon.js', import.meta.url), 'utf8');
vm.runInContext(babylonSource, vm.createContext(sandbox), { filename: 'babylon.js' });
const B = sandbox.BABYLON;
assert.ok(B && B.MeshBuilder, 'Babylon loaded');

// dice.js imports sound.js, which touches localStorage when it loads
globalThis.window = sandbox;
globalThis.localStorage = sandbox.localStorage;
const { d10VertexData, extractFaces } = await import('../client/dice.js');

const engine = new B.NullEngine();
const scene = new B.Scene(engine);

/** The same body makeDie() builds, without the label planes. */
function faces(kind) {
    let body;
    if (kind === 'noise') body = B.MeshBuilder.CreatePolyhedron('d12', { type: 2, size: 0.62 }, scene);
    else { body = new B.Mesh('d10', scene); d10VertexData().applyToMesh(body); body.scaling.setAll(0.95); }
    body.convertToFlatShadedMesh();
    return extractFaces(body);
}

const near = (a, b, eps = 1e-4) => Math.abs(a - b) <= eps;

test('DICE-01: the D12 has twelve faces and the D10 ten', () => {
    assert.equal(faces('noise').length, 12);
    assert.equal(faces('combat').length, 10);
});

test('DICE-02: every label basis is a rotation, not a mirror', () => {
    for (const kind of ['noise', 'combat']) {
        for (const [i, f] of faces(kind).entries()) {
            // unit, orthogonal
            assert.ok(near(f.right.length(), 1), kind + ' face ' + i + ': right is not unit');
            assert.ok(near(f.up.length(), 1), kind + ' face ' + i + ': up is not unit');
            assert.ok(Math.abs(f.right.dot(f.normal)) < 1e-3, kind + ' face ' + i + ': right is not in the face');
            assert.ok(Math.abs(f.up.dot(f.normal)) < 1e-3, kind + ' face ' + i + ': up is not in the face');
            assert.ok(Math.abs(f.right.dot(f.up)) < 1e-3, kind + ' face ' + i + ': right and up are not perpendicular');
            // the same basis makeDie() hands to Matrix.FromXYZAxesToRef
            const det = B.Vector3.Dot(f.right, B.Vector3.Cross(f.up, f.normal.scale(-1)));
            assert.ok(det > 0.9, kind + ' face ' + i + ': the label basis is mirrored (det ' + det.toFixed(3) + ')');
        }
    }
});

test('DICE-03: the numbers stand upright on every side face', () => {
    for (const kind of ['noise', 'combat']) {
        for (const [i, f] of faces(kind).entries()) {
            if (Math.abs(f.normal.y) > 0.92) continue;      // top / bottom face: "up" is not the world up
            assert.ok(f.up.y > 0.15, kind + ' face ' + i + ': the label is printed upside down (up.y ' + f.up.y.toFixed(3) + ')');
        }
        const top = faces(kind).filter(f => Math.abs(f.normal.y) > 0.92);
        for (const f of top) assert.ok(Math.abs(f.up.y) < 0.5, kind + ': the top/bottom label should lie flat in the face');
    }
});
