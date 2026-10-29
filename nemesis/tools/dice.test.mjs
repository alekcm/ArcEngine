// dice.test.mjs — the labels on the big die in the middle of the table.
//   node --test nemesis/tools/dice.test.mjs
// The numbers on the combat die came out upside down and tilted: "right" was taken from an arbitrary
// vertex of the face, and the basis was crossed in the wrong order. On screen the D10 lay on its side
// with the underlined 6/9 reading as an upside-down 9. These tests build the real die geometry with
// the Babylon that the repo ships and check the axes of every label plane:
//   * the triple (right, up, -normal) is a rotation, not a mirror — a mirrored basis flips glyphs;
//   * "up" of the text points up in the world on every face that is not the top/bottom one.
// A later regression culled the front of the D10 and rendered the far-side label instead: a roll
// of 4 visibly showed a 6. The landing tests below also trace through the real meshes and culling.
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
const { NOISE_DIE, COMBAT_DIE, BLUE_DIE } = await import('../shared/engine/core.mjs');

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

function rotateVector(v, q) {
    const u = new B.Vector3(q.x, q.y, q.z);
    const uv = B.Vector3.Cross(u, v), uuv = B.Vector3.Cross(u, uv);
    return v.add(uv.scale(2 * q.w)).add(uuv.scale(2));
}

test('DICE-04: the new D10 pose faces the result toward the camera with its glyph upright', () => {
    const up = new B.Vector3(0, 1, 0);
    for (const kind of ['combat', 'blue']) {
        for (const [i, f] of faces(kind).entries()) {
            const pose = DiceUI.prototype.targetFor(f);
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
        const pose = DiceUI.prototype.targetFor(f);
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
            assert.ok(horizontalUvCorrelation > 0 && verticalUvCorrelation > 0,
                kind + ' face ' + i + ': the front-facing glyph must not be mirrored');
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

/** A known front-facing Babylon primitive defines the renderer's winding convention in this scene.
 *  A triangle with the opposite sideOrientation must have the opposite winding to be visible. */
function cameraCullReference(scene, camera) {
    const plane = B.MeshBuilder.CreatePlane('cull_reference', { size: 1 }, scene);
    const p = plane.getVerticesData(B.VertexBuffer.PositionKind), indices = plane.getIndices();
    const vertex = i => new B.Vector3(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
    const a = vertex(indices[0]), b = vertex(indices[1]), c = vertex(indices[2]);
    const sign = Math.sign(B.Vector3.Dot(B.Vector3.Cross(b.subtract(a), c.subtract(a)), camera.subtract(a)));
    const orientation = plane.sideOrientation;
    plane.dispose();
    assert.notEqual(sign, 0, 'the reference plane is facing the camera');
    return { sign, orientation };
}

/** Trace the camera ray through the printed face, honoring each actual mesh's culling setting.
 *  This catches the inside-out hull: without culling the front face the ray would always hit it,
 *  even though WebGL instead displays an unrelated face from the far side of the die. */
function visibleAttackFace(die, target, camera, reference) {
    const targetMatrix = target.mesh.computeWorldMatrix(true);
    // Stay just off the diagonal between the two triangles, but inside the printed glyph area.
    const point = target.center.add(target.right.scale(target.inradius * 0.05));
    const aimedAt = B.Vector3.TransformCoordinates(point, targetMatrix);
    const ray = new B.Ray(camera, aimedAt.subtract(camera).normalize());
    const hits = [];
    for (const face of die.faces) {
        const mesh = face.mesh, matrix = mesh.computeWorldMatrix(true);
        const p = mesh.getVerticesData(B.VertexBuffer.PositionKind), indices = mesh.getIndices();
        const vertex = i => B.Vector3.TransformCoordinates(new B.Vector3(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]), matrix);
        const orientation = mesh.material.sideOrientation ?? mesh.sideOrientation;
        const frontSign = orientation === reference.orientation ? reference.sign : -reference.sign;
        for (let t = 0; t < indices.length; t += 3) {
            const a = vertex(indices[t]), b = vertex(indices[t + 1]), c = vertex(indices[t + 2]);
            const hit = ray.intersectsTriangle(a, b, c);
            if (!hit || hit.distance < 0) continue;
            const sign = Math.sign(B.Vector3.Dot(B.Vector3.Cross(b.subtract(a), c.subtract(a)), camera.subtract(a)));
            if (!mesh.material.backFaceCulling || sign === frontSign) hits.push({ face, distance: hit.distance });
        }
    }
    hits.sort((a, b) => a.distance - b.distance);
    return hits[0] && hits[0].face;
}

function makeTestUI(scene) {
    const ui = Object.assign(Object.create(DiceUI.prototype), {
        el: el(), title: {}, hint: {}, hideTimer: null, anim: null, idle: false, t: 0, die: 'noise',
    });
    ui.dice = Object.fromEntries(['noise', 'combat', 'blue'].map(kind => [kind, ui.makeDie(scene, kind)]));
    return ui;
}

test('DICE-09: every attack result shows the rolled face instead of a culled front and the far side', () => {
    const audio = sandbox.AudioContext;
    sandbox.AudioContext = undefined; // land() plays a sound; these tests only exercise the display.
    try {
        const ui = makeTestUI(scene);
        const camera = new B.Vector3(0, 0, -4.6); // DiceUI.init3d() camera position
        const reference = cameraCullReference(scene, camera);
        for (const [kind, values] of Object.entries({ combat: COMBAT_DIE, blue: BLUE_DIE })) {
            const die = ui.dice[kind];
            assert.deepEqual(die.faces.map(f => f.value), values.map(String), kind + ': matches server faces');
            // Begin with the screenshot's 4: the old mesh rendered its far-side 6 instead.
            for (const value of [4, ...new Set(values.filter(v => v !== 4))]) {
                ui.land({ die: kind, value }, 'Алекс');
                ui.clearHide();
                ui.tick();
                const target = die.faces.find(f => f.value === String(value));
                assert.ok(target, kind + ': server value has a printed face: ' + value);
                const visible = visibleAttackFace(die, target, camera, reference);
                assert.equal(visible && visible.value, String(value), kind + ': visible face for result ' + value);
                assert.equal(ui.hint.textContent, 'Результат: ' + (value === 'crit' ? 'КРИТ' : value));
            }
            // Also cover duplicate faces, which land() does not currently select but are seen in a spin.
            for (const face of die.faces) {
                die.root.rotationQuaternion = ui.targetFor(face);
                const visible = visibleAttackFace(die, face, camera, reference);
                assert.equal(die.faces.indexOf(visible), die.faces.indexOf(face), kind + ': each printed face is visible from outside');
            }
        }
    } finally {
        sandbox.AudioContext = audio;
    }
});

test('DICE-10: the noise die still lands on every server value and shows the matching result text', () => {
    const audio = sandbox.AudioContext;
    sandbox.AudioContext = undefined;
    try {
        const ui = makeTestUI(scene);
        const die = ui.dice.noise;
        assert.deepEqual(die.faces.map(f => f.value), NOISE_DIE.map(String), 'matches server faces');
        const text = { silence: 'Тишина', danger: 'Опасность', encounter: 'Встреча' };
        for (const value of new Set(NOISE_DIE)) {
            ui.land({ die: 'noise', value }, 'Алекс');
            ui.clearHide();
            const face = die.faces.find(f => f.value === String(value));
            assert.ok(face, 'server value has a printed face: ' + value);
            const normal = rotateVector(face.normal, die.root.rotationQuaternion);
            const up = rotateVector(face.up, die.root.rotationQuaternion);
            assert.ok(B.Vector3.Dot(normal, new B.Vector3(0, 0, -1)) > 0.999, 'noise result faces the camera');
            assert.ok(B.Vector3.Dot(up, new B.Vector3(0, 1, 0)) > 0.999, 'noise glyph is upright');
            assert.equal(ui.hint.textContent, 'Результат: ' + (text[value] || value));
        }
    } finally {
        sandbox.AudioContext = audio;
    }
});

test('DICE-11: the textures print the glyph for each server die value', () => {
    const drawText = canvasContext.fillText, drawRect = canvasContext.fillRect;
    const drawn = []; let underlines = 0;
    canvasContext.fillText = glyph => drawn.push(glyph);
    canvasContext.fillRect = (x, y, w, h) => { if (x === 44 && y === 112 && w === 40 && h === 6) underlines++; };
    try {
        makeTestUI(scene);
        const glyph = value => value === 'silence' ? '' : value === 'danger' ? '!' :
            value === 'crit' || value === 'encounter' ? '☠' : String(value);
        const expected = [NOISE_DIE, COMBAT_DIE, BLUE_DIE].flatMap(values => values.map(glyph).filter(Boolean));
        assert.deepEqual(drawn, expected, 'every face prints its own value; silence is blank');
        assert.equal(underlines, 2, 'the 6 is underlined on both combat dice');
    } finally {
        canvasContext.fillText = drawText;
        canvasContext.fillRect = drawRect;
    }
});

test('DICE-12: attack face culling follows Babylon when the scene uses right-handed coordinates', () => {
    const rightScene = new B.Scene(engine);
    rightScene.useRightHandedSystem = true;
    try {
        const ui = Object.create(DiceUI.prototype);
        const camera = new B.Vector3(0, 0, -4.6);
        const reference = cameraCullReference(rightScene, camera);
        for (const kind of ['combat', 'blue']) {
            const die = ui.makeDie(rightScene, kind);
            for (const face of die.faces) {
                die.root.rotationQuaternion = ui.targetFor(face);
                const visible = visibleAttackFace(die, face, camera, reference);
                assert.equal(die.faces.indexOf(visible), die.faces.indexOf(face), kind + ': the outside face is rendered');
            }
        }
    } finally {
        rightScene.dispose();
    }
});
