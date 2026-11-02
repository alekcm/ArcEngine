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
    const layer = () => ({ position: { set(x,y,z) { Object.assign(this,{x,y,z}); } }, rotation: { x: 0, y: 0, z: 0 }, scaling: { set() {}, setAll() {} }, setEnabled() {}, metadata: {} });
    // A world is a flat, round piece: its body, its face, its weather and its halo.
    const planet = { mesh: layer(), clouds: layer(), atmosphere: layer(), rim: layer() };
    const sys = { id: 's', row: 0, col: 0, areas: [{ pos: 'TL', world: { name: 'Test', assets: [], capacity: 3 } }], tokens: [] };
    const state = { phase:'planning', systems:[sys], units:[{id:'u',system:'s',area:'TL',seat:0}], players:[{seat:0,color:'#fff'}], structures:[], objectives:[], storms:[] };
    const app = { location: { width: 2048, height:2048, terrain:t } };
    const view = { planets:new Map([['s:TL',planet]]), metrics:null };
    Object.assign(v, { ensureTile: () => ({ drawn:'' }), drawTile() {}, updateSetupSlots() {}, clearMarkers() {}, addFactionUnit(_view,_unit,base) { this.unitBase = base; return true; } });
    v.update(app,view,state);
    const surface = 17 + 6.5 + v.PLANET_H + .12;
    assert.equal(planet.mesh.position.y, surface, 'the face of the world lies on the tile');
    assert.equal(planet.rim.position.y, 17 + 6.5 + v.PLANET_H / 2, 'the body of the world sits under the face');
    // The unit stands on the round face itself, inside the circle — not beside it.
    assert.equal(v.unitBase.y, surface);
    const dx = v.unitBase.x - planet.mesh.position.x;
    const dz = v.unitBase.z - planet.mesh.position.z;
    assert.ok(Math.hypot(dx, dz) < v.PLANET_D / 2, 'the miniature is on the world');
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

test('the arrow of the march lands on the board when the target has no height', () => {
    const page = loadScripts(['js/fs/FSView.js'], { BABYLON: B });
    const v = Object.create(page.get('FSView'));
    const node = () => ({
        position: { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } },
        rotation: { y: 0 },
        scaling: { x: 1, y: 1, z: 1, set(s) { this.x = s; this.y = s; this.z = s; } },
        setEnabled() {},
    });
    const arrow = { root: node(), beam: node(), head: node(), beamMat: {}, headMat: {}, tex: {} };
    v.ensureArrow = () => arrow;
    const view = { arrow };
    // The pointer passes {x, z} of the sector: no height at all.
    v.showArrow({}, view, { x: 0, y: 24, z: 0 }, { x: 120, z: 40 }, true);
    assert.equal(arrow.root.position.y, 24 + v.SELECT_Y * .6, 'the arrow hangs over the board, not at NaN');
    assert.equal(arrow.root.position.x, 0);
    assert.ok(arrow.beam.scaling.x > 0, 'the beam runs from the group to the sector');
    assert.equal(arrow.head.position.x, Math.hypot(120, 40) - 7);
});

test('the lobby offers the three ways into the game and the battlefield', () => {
    const node = tag => {
        const n = {
            tagName: tag, className: '', children: [], listeners: {}, style: { setProperty() {} },
            classList: { toggle() {}, add() {}, remove() {} },
            addEventListener(type, fn) { (n.listeners[type] = n.listeners[type] || []).push(fn); },
            append(...kids) { n.children.push(...kids); },
            replaceChildren() { n.children = []; },
            remove() {}, querySelector() { return null; }, setAttribute() {}, blur() {}, focus() {},
            click() { for (const fn of n.listeners.click || []) fn({}); },
        };
        return n;
    };
    const events = {};
    const page = loadScripts(['js/fs/FSData.js', 'js/fs/FSUI.js'], {
        document: { createElement: node, body: { appendChild() {} } },
        window: { innerWidth: 1400, addEventListener(type, fn) { events[type] = fn; } },
        UI: { root: null, get: () => null, show() {}, set() {}, def: () => null, add() { return null; }, remove() {} },
        IS_MOBILE: false,
    });
    const ui = page.get('FSUI');
    ui.mount();
    const walk = (n, out = []) => { out.push(n); for (const c of n.children) if (c && c.children) walk(c, out); return out; };
    const lobby = (mode, battle, picked) => {
        const calls = { mode: [], battle: [], start: 0 };
        ui.lobby({
            code: 'ABCD', name: 'Аня', faction: 'орки',
            players: [{ id: 'p1', name: 'Аня', faction: 'орки' }],
            factions: page.get('FS_DATA').factions.map(f => ({ id: f.id, name: f.name, color: f.color })),
            modes: [
                { id: 'game', icon: '⌘', title: 'Обычная игра', text: 'сборка карты' },
                { id: 'map', icon: '▦', title: 'Готовая карта', text: 'сразу планирование' },
                { id: 'battle', icon: '⚔', title: 'Тест боя', text: 'отряды и карты' },
            ],
            mode, battle,
            onMode: id => { calls.mode.push(id); picked.mode = id; },
            onBattle: patch => calls.battle.push(patch),
            onStart: () => { calls.start += 1; },
        }, () => {}, () => {});
        return { calls, nodes: walk(ui.modernRoot) };
    };

    // The three modes are cards of the lobby.
    const first = lobby('game', null, {});
    const modes = first.nodes.filter(n => /(^|\s)fs-mode(\s|$)/.test(n.className));
    assert.equal(modes.length, 3, 'the party, the ready map and the battlefield');
    assert.ok(modes[0].className.includes('is-selected'), 'the ordinary party is chosen by default');
    assert.equal(first.nodes.filter(n => /fs-start-test/.test(n.className)).length, 0, 'the party starts by itself');

    // A click on the third card chooses the battlefield.
    const picked = {};
    const second = lobby('game', null, picked);
    second.nodes.filter(n => /(^|\s)fs-mode(\s|$)/.test(n.className))[2].click();
    assert.deepEqual(second.calls.mode, ['battle']);

    // The battlefield: the kind of the fight, the troops, the cards and the start.
    const battle = {
        kind: 'ground', total: 3, deck: 10,
        units: [{ id: 'бойзы', name: 'Бойзы', combat: 2, count: 3 }, { id: 'нобзы', name: 'Нобзы', combat: 2, count: 0 }],
        cards: [{ name: 'Шута бойз', icons: { att: 1, def: 0, morale: 0 }, kl: 0, selected: true }],
        foe: { id: 'некроны', name: 'Некроны' },
    };
    const third = lobby('battle', battle, {});
    const kinds = third.nodes.filter(n => /(^|\s)fs-kind(\s|$)/.test(n.className));
    assert.equal(kinds.length, 2, 'the ground battle and the space battle');
    kinds[1].click();
    // The patch is made in the sandboxed script: compare its shape, not its prototype.
    assert.equal(JSON.stringify(third.calls.battle), JSON.stringify([{ kind: 'space' }]));
    const units = third.nodes.filter(n => /(^|\s)fs-unit(\s|$)/.test(n.className));
    assert.equal(units.length, 2);
    assert.ok(units[0].className.includes('is-selected'), 'the chosen troops are marked');
    units[1].click();
    assert.equal(JSON.stringify(third.calls.battle[1]), JSON.stringify({ toggleUnit: 'нобзы' }));
    const cards = third.nodes.filter(n => /fs-card-toggle/.test(n.className));
    assert.equal(cards.length, 1);
    cards[0].click();
    assert.equal(JSON.stringify(third.calls.battle[2]), JSON.stringify({ toggleCard: 'Шута бойз' }));
    const start = third.nodes.filter(n => /fs-start-test/.test(n.className));
    assert.equal(start.length, 1);
    start[0].click();
    assert.equal(third.calls.start, 1, 'the start of the test party');

    // The ready map is opened by the same button.
    const map = lobby('map', { total: 0, deck: 0 }, {});
    assert.equal(map.nodes.filter(n => /fs-start-test/.test(n.className)).length, 1);
    assert.equal(map.nodes.filter(n => /fs-battle/.test(n.className)).length, 0, 'the map has no battlefield');
});

// The battle on the table: the dice and the tokens are real meshes of the board,
// and the dice are thrown with an animation, not dropped into place.
test('the dice and the tokens of a combat are meshes of the board', () => {
    // The faces of the dice are drawn on a canvas: a flat 2D context is enough.
    class Texture {
        constructor() { this.hasAlpha = false; }
        getContext() {
            const noop = () => { };
            return {
                clearRect: noop, fillRect: noop, strokeRect: noop, beginPath: noop, closePath: noop,
                moveTo: noop, lineTo: noop, arc: noop, quadraticCurveTo: noop, fill: noop, stroke: noop,
                save: noop, restore: noop, translate: noop, rotate: noop, setLineDash: noop,
                fillText: noop, measureText: () => ({ width: 10 }),
                createLinearGradient: () => ({ addColorStop: noop }),
            };
        }
        update() { }
    }
    const Babylon = { ...B, DynamicTexture: Texture };
    const page = loadScripts(['js/Constants.js', 'js/fs/FSData.js', 'js/fs/FSView.js'], { BABYLON: Babylon, FS_RULES: { unitOf: () => ({ type: 'ground' }) } });
    const FSView = page.get('FSView');
    const engine = new B.NullEngine();
    const scene = new B.Scene(engine);
    scene.render = () => { };
    const v = Object.create(FSView);
    const app = { location: { terrain: { heightAt: () => 0 } } };
    const made = [];
    const view = {
        scene,
        metrics: { tile: 60 },
        markers: [],
        animated: [],
        materials: new Map(),
        material(key, color) {
            if (!this.materials.has(key)) {
                const m = new B.StandardMaterial(key, scene);
                m.diffuseColor = B.Color3.FromHexString(/^#/.test(color) ? color : '#8899aa');
                this.materials.set(key, m);
            }
            return this.materials.get(key);
        },
        addMarker(_v, mesh) { this.markers.push({ mesh }); made.push(mesh.name || (mesh.metadata && 'root')); return mesh; },
        addAnimated() { },
        tilePos() { return { x: 0, y: 0 }; },
        discAt() { return { x: 0, z: 0, y: 10, r: 20 }; },
        throwIn() { },  // the throwing of the pieces is checked below
    };
    const thrown = [];
    Object.assign(v, {
        addMarker: view.addMarker.bind(view),
        addAnimated: view.addAnimated.bind(view),
        throwIn(_v, root) { thrown.push(root.name); },
    });
    const state = {
        systems: [{ id: 's', tile: 'A1', row: 0, col: 0, areas: [{ pos: 'TL', world: { name: 'Test', assets: [] } }], tokens: [] }],
        players: [{ seat: 0, color: '#fff', faction: 'имперская-гвардия' }],
        combat: {
            system: 's', pos: 'TL', attacker: 0, defender: 1, round: 1, step: 'choose-attacker',
            dice: { attacker: ['att', 'def', 'morale'], defender: ['def'] },
            tokens: { attacker: { att: 1, def: 0 }, defender: { att: 0, def: 2 } },
            reinforcе: {},
        },
    };
    v.drawCombat(app, view, state);
    const names = view.markers.map(x => x.mesh.name);
    assert.ok(names.some(n => /fs-die-attacker-0/.test(n)), 'the dice of the attacker are on the table');
    assert.ok(names.some(n => /fs-die-defender-0/.test(n)), 'the dice of the defender are on the table');
    assert.ok(names.some(n => /fs-ctok-attacker-0/.test(n)), 'the combat tokens lie next to them');
    assert.ok(names.some(n => /fs-combat-ring-s/.test(n)), 'the battlefield is marked');
    assert.equal(thrown.length, 3 + 1 + 1 + 2, 'every new die and token is thrown in');
    engine.dispose();
});
