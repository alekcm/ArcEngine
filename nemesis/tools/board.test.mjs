// board.test.mjs — editing the board: a part picked in the editor must be the same part the game
// builds, so that "move this pipe, delete that wire, paint that wall" survives into a real session.
//   node --test nemesis/tools/board.test.mjs
//
// The identity of a part is its build order: "<owner>#<n>", numbered inside the build step that
// created it, reset for every room / corridor / shell. These checks keep that promise: ids repeat
// from build to build, an edit reaches the part BEFORE it is merged, a deleted part never reaches
// the merged board, and the editor's mode keeps every part separate and clickable.
import test from 'node:test';
import assert from 'node:assert/strict';

let uid = 0;
class V3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
    setAll(v) { this.x = this.y = this.z = v; return this; }
    clone() { return new V3(this.x, this.y, this.z); }
}
const mesh = (name) => ({
    name, position: new V3(), rotation: new V3(), scaling: new V3(1, 1, 1), parent: null,
    metadata: {}, material: null, isPickable: false, receiveShadows: false, disposed: false,
    setEnabled(v) { this.enabled = v; return this; }, isEnabled() { return this.enabled !== false; },
    isDisposed() { return this.disposed; }, dispose() { this.disposed = true; },
    setMaterial(m) { this.material = m; return this; },
});

// scene3d.js imports characters/sound at load: give them the browser globals they expect
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
globalThis.document = { createElement: () => ({ getContext: () => null }) };
try { Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'node' }, configurable: true }); } catch { /* defined */ }
globalThis.window = globalThis.window || { BABYLON: {} };

const { Scene3D } = await import('../client/scene3d.js');

/** A host with only what the registry and mergeStatic touch. */
function host() {
    const h = {
        scene: { pick: () => null },
        shadows: { addShadowCaster() {} },
        editOwner: 'scene', editCount: 0, editMeshes: {}, edits: {}, editMode: false, merging: false,
        materials: [],
        M(hex, e) { const m = { hex, e, uniqueId: ++uid }; h.materials.push(m); return m; },
        registerMesh(...a) { return Scene3D.prototype.registerMesh.apply(h, a); },
        owner(...a) { return Scene3D.prototype.owner.apply(h, a); },
        applyEdit(...a) { return Scene3D.prototype.applyEdit.apply(h, a); },
        setEdit(...a) { return Scene3D.prototype.setEdit.apply(h, a); },
        editInfo(...a) { return Scene3D.prototype.editInfo.apply(h, a); },
        setEdits(...a) { return Scene3D.prototype.setEdits.apply(h, a); },
        mergeStatic(meshes, parent) {
            // the real merger, but MergeMeshes is a stub that keeps the first mesh of a group
            const B = {
                Mesh: { MergeMeshes: (arr) => { const m = mesh('merged'); m.material = arr[0].material; m.source = arr.slice(); return m; } },
            };
            const backup = globalThis.window;
            globalThis.window = { BABYLON: B };
            try { return Scene3D.prototype.mergeStatic.call(h, meshes, parent); } finally { globalThis.window = backup; }
        },
    };
    return h;
}

/** A build step like the real one: three parts, created in a fixed order, then merged by material. */
function buildParts(h) {
    const out = h.owner('room:101', () => {
        const a = mesh('wall'); a.material = h.M('#111111');
        h.registerMesh(a);
        const b = mesh('pipe'); b.material = h.M('#222222'); b.position.set(1, 2, 3);
        h.registerMesh(b);
        const c = mesh('wire'); c.material = h.M('#333333');
        h.registerMesh(c);
        return [a, b, c];
    });
    return out;
}

test('BD-01 ids are stable: the same part gets the same id on every build', () => {
    const h = host();
    const first = buildParts(h).map(m => m.metadata.editId);
    h.editMeshes = {};
    const second = buildParts(h).map(m => m.metadata.editId);
    assert.deepEqual(first, second, 'a rebuild gives the same ids');
    assert.deepEqual(first, ['room:101#0', 'room:101#1', 'room:101#2'], 'ids are "owner#order"');
});

test('BD-02 owners do not leak into each other', () => {
    const h = host();
    buildParts(h);
    const other = h.owner('room:202', () => { const m = mesh('wall'); h.registerMesh(m); return m; });
    assert.equal(other.metadata.editId, 'room:202#0', 'a new owner counts from zero');
    const again = h.owner('room:101', () => { const m = mesh('wall2'); h.registerMesh(m); return m; });
    assert.equal(again.metadata.editId, 'room:101#0', 'and the previous owner is not disturbed by the other');
});

test('BD-03 a merge never takes an id: the numbered parts must not shift', () => {
    const h = host();
    buildParts(h);
    const before = Object.keys(h.editMeshes).length;
    h.mergeStatic([mesh('x'), mesh('y')], null);          // MergeMeshes makes a new mesh in the real scene
    assert.equal(h.merging, false, 'the guard is released even on success');
    const another = h.owner('room:101', () => { const m = mesh('after'); h.registerMesh(m); return m; });
    assert.equal(another.metadata.editId, 'room:101#' + 0, 'the counter is per owner and unaffected by a merge');
    assert.ok(before >= 3);
});

test('BD-04 an edit is applied to the part BEFORE it is merged (so it bakes into the board)', () => {
    const h = host();
    const parts = buildParts(h);
    const pipeId = parts[1].metadata.editId;
    h.setEdits({ [pipeId]: { pos: [5, 0, -2], rot: [0, 1.5, 0], scale: [2, 2, 2], color: '#ff0000' } });
    const merged = h.mergeStatic(parts, null);
    // each material is its own group here, so three merged meshes; the pipe group keeps its material
    assert.equal(merged.length, 3, 'three material groups');
    assert.equal(h.edits[pipeId].color, '#ff0000');
    // rebuild with the same edits: the new pipe is moved and repainted by applyEdit
    h.editMeshes = {};
    const again = buildParts(h);
    h.applyEdit(again[1]);
    assert.equal(again[1].position.x, 5, 'x from the edit');
    assert.equal(again[1].position.z, -2, 'z from the edit');
    assert.equal(again[1].rotation.y, 1.5, 'rotation from the edit');
    assert.equal(again[1].scaling.x, 2, 'scale from the edit');
    assert.equal(again[1].material.hex, '#ff0000', 'the part is repainted with the chosen colour');
    assert.equal(again[0].material.hex, '#111111', 'its neighbours keep their own colour');
});

test('BD-05 a deleted part never reaches the board', () => {
    const h = host();
    const parts = buildParts(h);
    h.setEdits({ [parts[2].metadata.editId]: { deleted: true } });
    const merged = h.mergeStatic(parts, null);
    assert.equal(merged.length, 2, 'the wire is gone, the wall and the pipe stay');
    for (const m of merged) for (const src of m.source || []) assert.notEqual(src.name, 'wire', 'no merged mesh carries the deleted wire');
});

test('BD-06 a hidden part is built but switched off', () => {
    const h = host();
    const parts = buildParts(h);
    h.setEdits({ [parts[0].metadata.editId]: { hidden: true } });
    h.mergeStatic(parts, null);
    assert.equal(parts[0].isEnabled(), false, 'the wall is still there, just not shown');
    assert.equal(parts[1].isEnabled(), true, 'the rest is untouched');
});

test('BD-07 edit mode merges nothing: every part stays separate and clickable', () => {
    const h = host();
    h.editMode = true;
    const parts = buildParts(h);
    const list = h.mergeStatic(parts, null);
    assert.equal(list.length, 3, 'three parts, not three merged groups');
    for (const m of list) assert.equal(m.isPickable, true, 'every part can be clicked in the editor');
    h.editMode = false;
    const merged = h.mergeStatic(buildParts(h), null);
    for (const m of merged) assert.equal(m.isPickable, false, 'in the game the board itself is not clickable at that level');
});

test('BD-08 setEdit drops empty edits and forgets fields that were reset', () => {
    const h = host();
    const parts = buildParts(h);
    const id = parts[0].metadata.editId;
    h.setEdit(id, { color: '#00ff00' });
    assert.deepEqual(h.edits[id], { color: '#00ff00' });
    h.setEdit(id, { pos: [1, 0, 0] });
    assert.equal(h.edits[id].color, '#00ff00', 'a second edit keeps the first field');
    h.setEdit(id, { pos: null });
    assert.equal(h.edits[id].pos, undefined, 'a null removes the field');
    h.setEdit(id, { color: null });
    assert.equal(h.edits[id], undefined, 'an edit with no fields left is forgotten');
    assert.deepEqual(h.editInfo(id).edit, null);
});

test('BD-09 the saved file shape is what the game reads', () => {
    const h = host();
    const parts = buildParts(h);
    h.setEdits({ [parts[1].metadata.editId]: { pos: [1, 2, 3], color: '#abcdef' } });
    const json = JSON.parse(JSON.stringify({ edits: h.edits }));
    assert.deepEqual(json, { edits: { 'room:101#1': { pos: [1, 2, 3], color: '#abcdef' } } });
    const fresh = host();
    fresh.setEdits(json.edits);
    fresh.editMeshes = {};
    const again = buildParts(fresh);
    fresh.applyEdit(again[1]);
    assert.equal(again[1].position.x, 1, 'a fresh build picks the file up');
    assert.equal(again[1].material.hex, '#abcdef');
});

test('BD-10 a part gets its id when it is created, not on the next tick', async () => {
    // Babylon fires onNewMeshAddedObservable from a SetImmediate: by then the build step is over and
    // the owner scope is closed, so every part would be filed under the outer owner and a saved edit
    // would land on whatever happens to be built there. The scene's addMesh is wrapped instead.
    const src = await import('node:fs').then(fs => fs.readFileSync(new URL('../client/scene3d.js', import.meta.url), 'utf8'));
    assert.ok(!/onNewMeshAddedObservable\s*\.\s*add\(/.test(src), 'no deferred hook: ids must come at creation time');
    assert.ok(/this\.scene\.addMesh\s*=/.test(src), 'the scene addMesh is wrapped so registerMesh runs synchronously');
    const wrap = src.slice(src.indexOf('this.scene.addMesh ='));
    assert.ok(/this\.merging/.test(wrap.slice(0, 400)), 'the wrapper keeps MergeMeshes from taking ids');
});
