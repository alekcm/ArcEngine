// Automated legal-action journeys through the expansion packs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../shared/engine/setup.mjs';
import { initCarnomorphPack } from '../shared/engine/carnomorph-setup.mjs';
import { initVoidseeders } from '../shared/engine/voidseeders.mjs';
import { initChytrids } from '../shared/engine/chytrids.mjs';
import { answer } from '../shared/engine/core.mjs';
import { viewFor } from '../shared/view.mjs';

const initializers={carnomorphs:initCarnomorphPack,voidseeders:initVoidseeders,chytrids:initChytrids};
function assertChyPieces(s) {
    if(s.enemySet!=='chytrids' || s.shipDestroyed)return;
    const rooms=Object.values(s.roomState),board=Object.values(s.intruders);
    assert.equal(s.chyGermSlots.filter(slot=>slot.cube).length+rooms.filter(r=>r.chyGerm).length,10,'growth cubes conserved');
    assert.equal(s.chyQueenSlots.filter(Boolean).length+s.chyDeadStinkhorns+board.filter(i=>i.type==='stinkhorn').length,8,'Stinkhorn miniatures conserved');
    assert.equal(s.chyMyceliumLeft+rooms.filter(r=>r.chyMycelium).length,8,'Mycelium conserved');
    assert.equal(s.chySporesLeft+rooms.filter(r=>r.chySpore).length+s.players.filter(p=>p.chySpore).length,15,'spores conserved');
}
function choose(state, pr, n) {
    if(pr.kind==='turn') {
        const available=id=>pr.actions.some(a=>a.id===id && a.enabled);
        const cards=pr.cards.filter(c=>c.enabled), items=pr.items.filter(i=>i.enabled);
        if(n%9===1 && cards.length)return {action:'card',cardId:cards[n%cards.length].id};
        if(n%11===2 && items.length)return {action:'item',itemId:items[n%items.length].uid};
        if(n%13===3 && available('room'))return {action:'room'};
        if(available('shoot'))return {action:'shoot'};
        if(available('melee'))return {action:'melee'};
        if(n%7!==0 && available('move'))return {action:'move'};
        return {action:'pass'};
    }
    if(pr.kind==='room') {
        const unexplored=pr.rooms.filter(r=>!state.roomState[r]?.explored);
        const list=unexplored.length?unexplored:pr.rooms;
        assert.ok(list.length,`empty room prompt: ${pr.title}`);
        return list[n%list.length];
    }
    if(pr.kind==='choice') {
        const options=pr.options.filter(o=>!o.disabled);
        assert.ok(options.length,`empty choice prompt: ${pr.title}`);
        return (options.find(o=>o.id==='no') || options[n%options.length]).id;
    }
    if(pr.kind==='cards') { assert.ok(pr.cards.length>=pr.min,`not enough cards: ${pr.title}`);return pr.cards.slice(0,pr.min); }
    if(pr.kind==='bag')return 'draw';
    if(pr.kind==='ack')return 'ok';
    return 'ok';
}
for(const [pack,init] of Object.entries(initializers)) test(`${pack}: several serialized legal-action games reach an ending`,()=>{
    for(let seed=0;seed<80;seed++){
        let s=createGame({seed:`simulation-${pack}-${seed}`,draft:false,ui:{bagClick:true,eventAck:true},players:[{name:'A',charId:'soldier'},{name:'B',charId:'scout'}]});
        s.enemySet=pack;init(s);let n=0;
        while(!s.result && n++<1800){
            const pr=s.prompt;assert.ok(pr,`${pack} seed ${seed}: no prompt or result, phase=${s.phase} queue=${JSON.stringify(s.queue)}`);
            if(pr.kind==='ack') pr.flipped=true; // server permits Ready after the card is turned face-up
            const who=pr.kind==='ack'?pr.players.find(id=>!pr.acked.includes(id)):pr.player==='host'?0:pr.player;
            const value=choose(s,pr,n);
            try { assert.equal(answer(s,who,pr.id,value),true,`rejected ${JSON.stringify(value)}: ${pr.title}`); }
            catch(e){e.message+=` [${pack}, seed=${seed}, step=${n}, round=${s.round}, prompt=${JSON.stringify(pr)}, answer=${JSON.stringify(value)}]`;throw e;}
            if(n%11===0){s=JSON.parse(JSON.stringify(s)); for(const viewer of [0,1,null]) assert.doesNotThrow(()=>viewFor(s,viewer));}
        }
        assert.ok(s.result,`${pack} seed ${seed}: did not finish after ${n} answers (round ${s.round})`);
    }
});

test('all DLC start through createGame and reach an end, including draft',async()=>{
        const make=createGame, respond=answer;
        const chars=['soldier','scout','mechanic','pilot','scientist'];
        for(const pack of Object.keys(initializers)) for(let seed=0;seed<16;seed++){
            const players=chars.slice(0,1+seed%5).map((charId,i)=>({name:'P'+i,charId}));
            let s=make({enemySet:pack,seed:`actual-start-${pack}-${seed}`,draft:seed%2===0,ui:{bagClick:true,eventAck:true},players});
            assert.equal(s.enemySet,pack);let n=0;
            while(!s.result && n++<3500){
                const pr=s.prompt;assert.ok(pr,`${pack} seed ${seed}: no prompt or result`);
                if(pr.kind==='ack')pr.flipped=true;
                const who=pr.kind==='ack'?pr.players.find(id=>!pr.acked.includes(id)):pr.player==='host'?0:pr.player;
                const value=choose(s,pr,n);
                try{assert.equal(respond(s,who,pr.id,value),true,`rejected ${JSON.stringify(value)}: ${pr.title}`);}
                catch(e){e.message+=` [${pack} setup seed=${seed}, step=${n}, prompt=${JSON.stringify(pr)}]`;throw e;}
                assertChyPieces(s);
                if(n%17===0)s=JSON.parse(JSON.stringify(s));
            }
            assert.ok(s.result,`${pack} setup seed ${seed}: no end after ${n} choices`);
        }
});
