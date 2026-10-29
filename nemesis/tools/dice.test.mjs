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
const canvasContext = { clearRect: noop, fillRect: noop, fillText: noop };
const el = () => ({
    style: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    appendChild: noop, removeChild: noop, getContext: () => canvasContext, addEventListener: noop, removeEventListener: noop,
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
const { d10Faces, d10FaceVertexData, extractFaces, DiceUI } = await import('../client/dice.js');

const engine = new B.NullEngine();
const scene = new B.Scene(engine);

/** The D12 uses extracted facets; each D10 facet is authored explicitly and textured in-place. */
function faces(kind) {
    if (kind !== 'noise') return d10Faces(kind);
    const body = B.MeshBuilder.CreatePolyhedron('d12', { type: 2, size: 0.62 }, scene);
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

function targetForFace(f) {
    // Match DiceUI.targetFor(): point the whole textured face straight at the camera and keep its
    // glyph up axis vertical; the D10 pole axis is no longer constrained to stay world-vertical.
    const m = B.Matrix.Identity();
    B.Matrix.FromXYZAxesToRef(f.right, f.up, f.normal.scale(-1), m);
    return B.Quaternion.FromRotationMatrix(m.transpose());
}
function rotateVector(v, q) {
    const u = new B.Vector3(q.x, q.y, q.z);
    const uv = B.Vector3.Cross(u, v), uuv = B.Vector3.Cross(u, uv);
    return v.add(uv.scale(2 * q.w)).add(uuv.scale(2));
}

test('DICE-04: the new D10 pose faces the result toward the camera with its glyph upright', () => {
    const up = new B.Vector3(0, 1, 0);
    for (const kind of ['combat', 'blue']) {
        for (const [i, f] of faces(kind).entries()) {
            const pose = targetForFace(f);
            const normal = rotateVector(f.normal, pose);
            assert.ok(Math.abs(normal.x) < 1e-4 && Math.abs(normal.y) < 1e-4 && normal.z < -0.999,
                kind + ' face ' + i + ': the complete printed face points toward the camera');
            assert.ok(B.Vector3.Dot(rotateVector(f.up, pose), up) > 0.999,
                kind + ' face ' + i + ': the glyph remains upright');
            const bodyUp = rotateVector(new B.Vector3(0, 1, 0), pose);
            assert.ok(bodyUp.y > 0.7 && Math.abs(bodyUp.z) > 0.6,
                kind + ' face ' + i + ': the body visibly leans instead of staying in the old vertical pose');
        }
    }
});

function idlePose(die, time) {
    const root = { position: { y: 0 }, scaling: { setAll() {} }, rotationQuaternion: null };
    DiceUI.prototype.tick.call({ cur: () => ({ root }), die, t: time, idle: true, anim: null });
    return root.rotationQuaternion;
}

test('DICE-05: an idle combat D10 yaws without tipping its body axis', () => {
    for (const die of ['combat', 'blue']) {
        const q = idlePose(die, 1.3);
        const bodyUp = rotateVector(new B.Vector3(0, 1, 0), q);
        assert.ok(Math.abs(bodyUp.x) < 1e-4 && Math.abs(bodyUp.y - 1) < 1e-4 && Math.abs(bodyUp.z) < 1e-4,
            die + ': the D10 remains upright while turning');
    }
});

test('DICE-06: polar D12 faces still get a finite camera-facing landing pose', () => {
    const forward = new B.Vector3(0, 0, -1);
    for (const [i, f] of faces('noise').entries()) {
        const pose = targetForFace(f);
        const normal = rotateVector(f.normal, pose);
        assert.ok([pose.x, pose.y, pose.z, pose.w].every(Number.isFinite), 'D12 face ' + i + ': finite pose');
        assert.ok(B.Vector3.Dot(normal, forward) > 0.999, 'D12 face ' + i + ': result still points at the camera');
    }
});

test('DICE-07: each new attack face is an outward kite with centered UVs and the full die distribution', () => {
    const expected = {
        combat: ['crit', '2', '3', '3', '4', '4', '5', '5', '5', '6'],
        blue: ['crit', '2', '2', '3', '3', '3', '4', '4', '5', '6'],
    };
    const turn = Math.PI * 2;
    const yaw = f => ((Math.PI - Math.atan2(f.normal.x, f.normal.z)) % turn + turn) % turn;
    for (const kind of ['combat', 'blue']) {
        const fs = faces(kind);
        assert.deepEqual(fs.map(f => f.value), expected[kind], kind + ': preserve every die face and probability');
        for (const [i, face] of fs.entries()) {
            const data = d10FaceVertexData(face);
            assert.equal(data.positions.length, 12, kind + ' face ' + i + ': four explicit vertices');
            assert.equal(data.indices.length, 6, kind + ' face ' + i + ': two kite triangles');
            assert.equal(data.uvs.length, 8, kind + ' face ' + i + ': one in-face texture coordinate per vertex');
            const avgU = data.uvs.filter((_, j) => j % 2 === 0).reduce((a, b) => a + b, 0) / 4;
            const avgV = data.uvs.filter((_, j) => j % 2 === 1).reduce((a, b) => a + b, 0) / 4;
            assert.ok(Math.abs(avgU - 0.5) < 1e-5 && Math.abs(avgV - 0.5) < 1e-5,
                kind + ' face ' + i + ': glyph UV origin is the face center');
            const horizontalUvCorrelation = face.vertices.reduce((sum, vertex, j) => {
                const right = B.Vector3.Dot(vertex.subtract(face.center), face.right);
                return sum + right * (data.uvs[j * 2] - 0.5);
            }, 0);
            const verticalUvCorrelation = face.vertices.reduce((sum, vertex, j) => {
                const up = B.Vector3.Dot(vertex.subtract(face.center), face.up);
                return sum + up * (data.uvs[j * 2 + 1] - 0.5);
            }, 0);
            assert.ok(horizontalUvCorrelation < 0 && verticalUvCorrelation > 0,
                kind + ' face ' + i + ': mirror horizontally while retaining the original vertical UV direction');
            for (let t = 0; t < data.indices.length; t += 3) {
                const at = index => new B.Vector3(data.positions[index * 3], data.positions[index * 3 + 1], data.positions[index * 3 + 2]);
                const a = at(data.indices[t]), b = at(data.indices[t + 1]), c = at(data.indices[t + 2]);
                const normal = B.Vector3.Cross(b.subtract(a), c.subtract(a)).normalize();
                assert.ok(B.Vector3.Dot(normal, face.normal) > 0.999,
                    kind + ' face ' + i + ': triangle winding faces outward');
            }
            const gap = (yaw(fs[(i + 1) % fs.length]) - yaw(face) + turn) % turn;
            assert.ok(gap > 0.1 && gap < 1.5, kind + ': faces are ordered around the spin axis');
        }
    }
});

test('DICE-08: each attack label is baked into its own rigid face mesh', () => {
    const root = new B.TransformNode('test_d10_root', scene);
    const die = DiceUI.prototype.makeAttackDie.call({}, scene, 'combat', root);
    const meshes = die.body.getChildMeshes();
    assert.equal(meshes.length, 10, 'the attack die is exactly ten kite faces');
    assert.equal(die.faces.length, 10);
    for (const [i, face] of die.faces.entries()) {
        assert.equal(face.mesh.parent, die.body, 'face ' + i + ' is part of the same rigid die body');
        assert.ok(face.mesh.material.diffuseTexture, 'face ' + i + ' carries its printed material');
        assert.equal(face.mesh.getTotalVertices(), 4, 'face ' + i + ' has no separate floating label plane');
        assert.equal(face.mesh.getIndices().length, 6, 'face ' + i + ' is one quad');
    }
});
