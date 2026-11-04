import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { parseObj, MODEL_SOURCES } from '../client/intruder-models.js';

test('provided Carnomorph and Voidseeder OBJ miniatures and textures parse and fit table scale', () => {
    assert.equal(Object.keys(MODEL_SOURCES).length,12);
    for(const [type, source] of Object.entries(MODEL_SOURCES)) {
        assert.ok(existsSync((source.texture || source.bump).startsWith('/client/') ? 'nemesis'+(source.texture || source.bump) : '.'+(source.texture || source.bump)),type); const obj=readFileSync(source.obj.startsWith('/client/') ? 'nemesis'+source.obj : '.'+source.obj,'utf8'); const mesh=parseObj(obj,source.height);
        assert.ok(mesh.positions.length>1000,type);assert.ok(mesh.indices.length>1000,type);
        assert.equal(mesh.positions.length % 3,0);assert.equal(mesh.uvs.length,mesh.positions.length/3*2);
        assert.ok(mesh.indices.every(i=>i>=0 && i<mesh.positions.length/3),type);
        const ys=mesh.positions.filter((_,i)=>i%3===1); assert.ok(Math.abs(Math.min(...ys))<1e-8,type); assert.ok(Math.abs(Math.max(...ys)-source.height)<1e-6,type);
    }
});
test('OBJ parser triangulates faces, preserves UV seams and rejects broken input',()=>{
    const m=parseObj('v 0 0 0\nv 1 1 0\nv 0 1 1\nv 1 0 1\nvt 0 0\nvt 1 1\nf 1/1 2/2 3/1 4/2',2);
    assert.equal(m.indices.length,6);assert.deepEqual(m.uvs.slice(0,4),[0,0,1,1]);assert.equal(m.normals,null);assert.throws(()=>parseObj('v 0 0 0',2),/Empty/);
});
