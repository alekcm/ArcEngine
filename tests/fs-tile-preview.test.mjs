import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScripts } from './browser-scripts.mjs';
import { setupCommand } from './fs-setup-helper.mjs';

const page = loadScripts(['js/fs/FSData.js','js/fs/FSEffects.js','js/fs/FSRules.js','js/fs/FSView.js','js/fs/FSGame.js']);
const data=page.get('FS_DATA'), rules=page.get('FS_RULES'), View=page.get('FSView'), Game=page.get('FSGame');
const game=()=>rules.newGame({seed:17,interactiveSetup:true,players:data.factions.slice(0,2).map((f,i)=>({name:'P'+i,faction:f.id}))});

test('each physical system tile is dealt once, with both faces available', () => {
    for(let count=2;count<=4;count++) for(let seed=1;seed<=20;seed++) {
        const s=rules.newGame({seed,interactiveSetup:true,players:data.factions.slice(0,count).map(f=>({name:f.id,faction:f.id}))});
        const hand=s.setup.hands.flat(), numbers=hand.map(id=>id.slice(0,-1));
        assert.equal(new Set(numbers).size,hand.length);
        for(const id of hand) assert.deepEqual(Array.from(rules.tileFaces(id),x=>x.id).sort(),[id.slice(0,-1)+'A',id.slice(0,-1)+'B']);
    }
});

test('all four rotations remap worlds, voids, assets and objectives into board coordinates', () => {
    const clockwise={TL:'TR',TR:'BR',BR:'BL',BL:'TL'}, tile=data.tiles.find(t=>t.id==='13B');
    for(let turn=0;turn<4;turn++) {
        const state=game(),seat=state.setup.turn;
        state.setup.hands[seat][0]='13A';
        const result=rules.apply(state,seat,{type:'placeSystemTile',tile:'13B',row:0,col:0,rotation:turn});
        assert.equal(result.ok,true,result.error); const sys=state.systems[0];
        assert.equal(sys.tile,'13B'); assert.equal(sys.rotation,turn);
        for(const a of tile.areas) {
            let expected=a.pos;for(let i=0;i<turn;i++)expected=clockwise[expected];
            const actual=sys.areas.find(x=>x.pos===expected);
            assert.equal(actual.sourcePos,a.pos);
            assert.equal(actual.world?.name,a.world?.name);
            assert.equal(!!actual.world?.objective,!!a.world?.objective);
            assert.deepEqual(Array.from(actual.world?.assets||[]),Array.from(a.world?.assets||[]));
        }
        assert.ok(!state.setup.hands[seat].includes('13A'));
        const v0=rules.view(state,0),v1=rules.view(state,1);
        assert.equal(JSON.stringify(v0.systems),JSON.stringify(v1.systems));
    }
});

test('server rejects other physical tiles and invalid rotations without changing state', () => {
    for(const rotation of [-1,4,1.5,'1',Infinity]) {
        const s=game(),seat=s.setup.turn, before=JSON.stringify(s);
        assert.equal(rules.apply(s,seat,{type:'placeSystemTile',tile:s.setup.hands[seat][0],row:0,col:0,rotation}).ok,false);
        assert.equal(JSON.stringify(s),before);
    }
    const s=game(),seat=s.setup.turn, other=s.setup.hands[1-seat][0];
    assert.equal(rules.apply(s,seat,{type:'placeSystemTile',tile:other,row:0,col:0,rotation:0}).ok,false);
    assert.equal(s.systems.length,0);
});

test('future capacity considers the chosen face and does not combine incompatible faces', () => {
    const s=game(),seat=s.setup.turn,p=s.players[seat],f=data.factions.find(f=>f.id===p.faction);
    const ground=f.units.find(u=>u.type==='ground').id,ship=f.units.find(u=>u.type==='ship').id;
    s.setup.hands[seat]=['4A']; p.initialForces={units:{[ground]:5},structures:{}};
    assert.equal(rules.setupForcesFit(s,seat),true, '4B accommodates five, though 4A does not');
    assert.equal(rules.apply(s,seat,{type:'placeSystemTile',tile:'4A',row:0,col:0}).ok,false);
    assert.equal(rules.apply(s,seat,{type:'placeSystemTile',tile:'4B',row:0,col:0}).ok,true);
    const synthetic=(id,worlds)=>({id,home:null,areas:Array.from({length:4},(_,i)=>({pos:['TL','TR','BL','BR'][i],world:i<worlds?{capacity:3}:null}))});
    data.tiles.push(synthetic('99A',3),synthetic('99B',2));
    try {
        s.setup.hands[seat]=['99A'];p.initialForces={units:{[ground]:8,[ship]:4},structures:{}};
        assert.equal(rules.setupForcesFit(s,seat),false,'ground capacity of A and ship capacity of B cannot be combined');
    } finally { data.tiles.splice(data.tiles.length-2,2); }
});

test('cell clicks preview locally, transformations preserve cell, confirmation sends once, cancel clears', () => {
    const s=game(),visible=rules.view(s,0),sent=[],calls=[];
    const g=Object.create(Game.prototype);g.state=visible;g.app={};g.mode='placeTile';g.pending={handTile:visible.setup.hand[0],tile:visible.setup.hand[0],rotation:0,cell:null};
    g.view={scene:{pick:()=>({hit:true,pickedMesh:{metadata:{fs:'setupCell',row:0,col:0}}})}};
    g.net={cmd: c=>{sent.push(c);return true;}};g.refresh=()=>{};
    const show=View.showSetupPreview,clear=View.clearSetupPreview,clearHL=View.clearHighlights;
    View.showSetupPreview=(_a,_v,_s,tile,cell,r)=>calls.push([tile.id,cell.row,cell.col,r]);
    View.clearSetupPreview=()=>calls.push('clear');View.clearHighlights=()=>{};
    try {
        g.onClick(5,5);assert.equal(sent.length,0);assert.equal(g.pending.cell.row,0);
        g.transformSetupTile('right');g.transformSetupTile('flip');
        assert.equal(g.pending.rotation,1);assert.notEqual(g.pending.tile,g.pending.handTile);
        assert.deepEqual(calls.at(-1),[g.pending.tile,0,0,1]);
        g.confirmSetupTile();g.confirmSetupTile();assert.equal(sent.length,1);
        assert.equal(sent[0].tile,g.pending.tile);assert.equal(sent[0].rotation,1);
        g.setupSubmitting=false;g.cancelSetupTile();assert.equal(g.mode,'idle');assert.equal(g.pending,null);assert.equal(calls.at(-1),'clear');
    } finally { View.showSetupPreview=show;View.clearSetupPreview=clear;View.clearHighlights=clearHL; }
});

test('Q/E/F are captured only during tile placement, not in text inputs or with modifiers', () => {
    const handlers={};
    const p=loadScripts(['js/fs/FSGame.js'],{ addEventListener:(name,fn,capture)=>{handlers[name]={fn,capture};} });
    const C=p.get('FSGame'), client=Object.create(C.prototype), calls=[];
    client.state={setup:{myTurn:true}};client.mode='placeTile';client.pending={};client.app={camera:{_keys:new Set(['KeyQ'])}};
    client.transformSetupTile=action=>calls.push(action);client.bindSetupKeys();
    assert.equal(handlers.keydown.capture,true);
    const event=(code,extra={})=>Object.assign({code,target:{tagName:'BUTTON'},preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;}},extra);
    let e=event('KeyQ');handlers.keydown.fn(e);assert.deepEqual(calls,['left']);assert.ok(e.prevented&&e.stopped);assert.equal(client.app.camera._keys.size,0);
    handlers.keydown.fn(event('KeyE'));handlers.keydown.fn(event('KeyF'));assert.deepEqual(calls,['left','right','flip']);
    handlers.keydown.fn(event('KeyQ',{target:{tagName:'INPUT'}}));handlers.keydown.fn(event('KeyF',{ctrlKey:true}));handlers.keydown.fn(event('KeyE',{repeat:true}));
    client.mode='idle';handlers.keydown.fn(event('KeyQ'));
    assert.deepEqual(calls,['left','right','flip']);
});


test('complete 2–4 player setup works with mixed faces and rotations', () => {
    for (const count of [2,3,4]) for (let seed=1;seed<=5;seed++) {
        const s=rules.newGame({seed,interactiveSetup:true,players:data.factions.slice(0,count).map((f,i)=>({name:'P'+i,faction:f.id}))});
        let steps=0,flipped=0;
        while(s.phase==='setup') {
            const seat=s.setup.turn,cmd=setupCommand(rules,data,s);
            if(cmd.type==='placeSystemTile') {
                const hand=s.setup.hands[seat], index=hand.indexOf(cmd.tile), faces=rules.tileFaces(cmd.tile);
                const preferred=faces.find(f=>f.id.endsWith('B'));
                if(preferred && rules.setupForcesFit(s,seat,preferred,index)) {cmd.tile=preferred.id;flipped++;}
                cmd.rotation=steps%4;
            }
            const result=rules.apply(s,seat,cmd);
            assert.ok(result.ok,JSON.stringify({count,seed,cmd,error:result.error}));
            assert.ok(++steps<250);
        }
        assert.equal(s.systems.length,count*3);assert.ok(flipped>=count);
        assert.equal(s.storms.length,count);
    }
});
