// Regression coverage for real terrain methods and Babylon mesh/UV semantics.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { loadScripts } from './browser-scripts.mjs';

const require = createRequire(import.meta.url);
const B = require('../libs/babylon.js');

function terrain(Terrain3D) {
    const t = Object.create(Terrain3D.prototype);
    Object.assign(t, { cell: 2048, nx: 2, ny: 2, hgrid: [17, 17, 17, 17] });
    return t;
}

test('planet and unit placement invoke the actual Terrain3D.heightAt with its receiver', () => {
    const page = loadScripts(['js/Terrain3D.js', 'js/fs/FSView.js'], { FS_RULES: { unitOf: () => ({ type: 'ground' }) } });
    const v = Object.create(page.get('FSView'));
    const t = terrain(page.get('Terrain3D'));
    const layer = () => ({ position: { set(x,y,z) { Object.assign(this,{x,y,z}); } }, setEnabled() {}, metadata: {} });
    const planet = { mesh: layer(), clouds: layer(), atmosphere: layer(), orbit: layer() };
    const sys = { id: 's', row: 0, col: 0, areas: [{ pos: 'TL', world: { name: 'Test', assets: [], capacity: 3 } }], tokens: [] };
    const state = { phase:'planning', systems:[sys], units:[{id:'u',system:'s',area:'TL',seat:0}], players:[{seat:0,color:'#fff'}], structures:[], objectives:[], storms:[] };
    const app = { location: { width: 2048, height:2048, terrain:t } };
    const view = { planets:new Map([['s:TL',planet]]), metrics:null };
    Object.assign(v, { ensureTile: () => ({ drawn:'' }), drawTile() {}, updateSetupSlots() {}, clearMarkers() {}, addFactionUnit(_view,_unit,base) { this.unitBase = base; return true; } });
    v.update(app,view,state);
    assert.equal(planet.mesh.position.y, 17 + 6.5 + 18);
    assert.equal(v.unitBase.y, 17 + 4 + v.MARKER_Y);
});

test('TransformNode roots register only real mesh descendants in Babylon shadow lists', () => {
    const page = loadScripts(['js/Constants.js','js/World3D.js'], { BABYLON:B });
    const world = page.get('World3D');
    const engine = new B.NullEngine(); const scene = new B.Scene(engine);
    const camera = new B.FreeCamera('camera', new B.Vector3(0, 5, -10), scene); camera.setTarget(B.Vector3.Zero());
    const light = new B.DirectionalLight('sun', new B.Vector3(0,-1,0),scene);
    const shadow = new B.ShadowGenerator(128,light);
    const view = { addShadowCaster: (m,desc) => shadow.addShadowCaster(m,desc), removeShadowCaster: m => shadow.removeShadowCaster(m,true) };
    const root = new B.TransformNode('root',scene);
    const a = B.MeshBuilder.CreateBox('a',{},scene), b = B.MeshBuilder.CreateSphere('b',{},scene);
    a.parent=root; b.parent=root;
    world.addObject(view,root,'actor',{ink:false,outline:false});
    assert.deepEqual(shadow.getShadowMap().renderList.map(x=>x.name).sort(), ['a','b']);
    assert.doesNotThrow(()=>scene.render());
    world.removeObject(view,root);
    assert.equal(shadow.getShadowMap().renderList.length,0);
    engine.dispose();
});

test('real ground UVs put each printed quadrant under its logical area', () => {
    class Texture { constructor() { this.uScale=1; this.vScale=1; this.uOffset=0; this.vOffset=0; } }
    const Babylon = { ...B, DynamicTexture: Texture };
    const page = loadScripts(['js/fs/FSView.js'], { BABYLON:Babylon, World3D:{addObject(){}} });
    const fs = page.get('FSView'), engine = new B.NullEngine(), scene = new B.Scene(engine);
    const app = {location:{width:2048,height:2048,terrain:{heightAt:()=>0},view:{}}};
    const view = {tiles:new Map(),scene,metrics:null,material:(n)=>new B.StandardMaterial(n,scene)};
    const sys = {id:'s',row:0,col:0}; const tile = fs.ensureTile(app,view,sys);
    tile.top.computeWorldMatrix(true);
    for (const pos of ['TL','TR','BL','BR']) {
        const p=fs.areaPos(app,sys,pos,view.metrics);
        const ray=new B.Ray(new B.Vector3(p.x,50,p.y),new B.Vector3(0,-1,0));
        const hit=ray.intersectsMesh(tile.top); assert.ok(hit.hit);
        const uv=hit.getTextureCoordinates();
        const u=uv.x*tile.tex.uScale+tile.tex.uOffset, v=uv.y*tile.tex.vScale+tile.tex.vOffset;
        // DynamicTexture uploads canvas data inverted on Y: canvas y = 1 - v.
        const printed=(1-v < .5 ? 'T':'B')+(u < .5 ? 'L':'R');
        assert.equal(printed,pos);
    }
    engine.dispose();
});

test('incoming panel refresh waits for a pressed button and cannot overwrite a later refresh', () => {
    const events = {}, queued = [];
    function element(tag) {
        return { tagName:tag, children:[], classList:{toggle(){}}, style:{},
            addEventListener(type,fn){ events['root:'+type]=fn; },
            replaceChildren(){ this.children=[]; this.replacements=(this.replacements||0)+1; },
            append(...nodes){ this.children.push(...nodes); }, querySelector(){return null;} };
    }
    const body = {appendChild(){}};
    const page = loadScripts(['js/fs/FSUI.js'], {document:{createElement:element,body}, UI:{root:null}, IS_MOBILE:false,
        addEventListener:(type,fn)=>{events[type]=fn;}, setTimeout:fn=>queued.push(fn)});
    const ui=page.get('FSUI'), root=ui.mount();
    ui.renderModern(null,{}); assert.equal(root.replacements,1);
    events['root:pointerdown']({pointerId:2,target:{closest:()=>true}});
    ui.renderModern(null,{status:'incoming'}); assert.equal(root.replacements,1);
    events.pointerup({pointerId:2});
    // The click handler can render newer data before the deferred task runs.
    ui.renderModern(null,{status:'after click'}); assert.equal(root.replacements,2);
    queued.shift()(); assert.equal(root.replacements,2);
    events['root:pointerdown']({pointerId:3,target:{closest:()=>true}});
    ui.renderModern(null,{}); events.blur(); queued.shift()();
    assert.equal(root.replacements,3);
});
