import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createGame } from '../shared/engine/setup.mjs';
import { inCombat, spawnIntruder } from '../shared/engine/core.mjs';
import { CHYTRID_ATTACK_CARDS, CHYTRID_EVENT_CARDS, CHYTRID_GERMINATOR_ORDER, CHYTRID_TOKEN_VALUES, CHYTRID_WEAKNESSES } from '../shared/data/chytrids.mjs';
import { initChytrids, placeChySpore, clearChySpore, placeGerminator, placeMycelium, growGerminator, growSupplyGerminator,
    damageGerminator, giveChySpore, removeChySpore, spawnChytrid, returnStinkhornToQueen, killChytrid, revealChyWeakness } from '../shared/engine/chytrids.mjs';
import { viewFor } from '../shared/view.mjs';

function fresh(seed = 'chytrid') {
    const s = createGame({ seed, draft: false, players: [{ name: 'A', charId: 'soldier' }, { name: 'B', charId: 'scout' }] });
    s.enemySet = 'chytrids'; s.phase = 'setup'; s.queue = []; s.prompt = null; s.resume = null; s.intruders = {};
    for (const rs of Object.values(s.roomState)) rs.objects = [];
    initChytrids(s); return s;
}

test('Chytrids have 20 physical attacks, 6 weaknesses, 15 numbered tokens plus blank', () => {
    assert.equal(CHYTRID_ATTACK_CARDS.length, 20); assert.equal(Object.keys(CHYTRID_WEAKNESSES).length, 6);
    assert.deepEqual(CHYTRID_GERMINATOR_ORDER, ['green','purple','green','purple','green','purple','green','purple','green','purple']);
    const s = fresh(); assert.equal(s.bag.length, 15);
    for (const [type, values] of Object.entries(CHYTRID_TOKEN_VALUES)) assert.deepEqual(s.bag.filter(t => t.type === type).map(t => t.value).sort(), [...values].sort());
    assert.equal(new Set(s.bag.filter(t => t.id).map(t => t.id)).size, 14);
});

test('Chytrid cards with the same name share art, and different names do not', async () => {
    const src = fs.readFileSync(new URL('../client/cards.js', import.meta.url), 'utf8')
        .replace("'/shared/data/cards.mjs'", JSON.stringify(new URL('../shared/data/cards.mjs', import.meta.url).href))
        .replace("'/shared/ship.mjs'", JSON.stringify(new URL('../shared/ship.mjs', import.meta.url).href));
    const { attackArt, eventArt } = await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));
    for (const [cards, lookup] of [[CHYTRID_ATTACK_CARDS, attackArt], [CHYTRID_EVENT_CARDS, eventArt]]) {
        const byName = new Map();
        for (const card of cards) {
            const art = lookup(card.id);
            assert.ok(fs.existsSync(new URL('../client/' + art, import.meta.url)), art);
            if (byName.has(card.name)) assert.equal(art, byName.get(card.name));
            else byName.set(card.name, art);
        }
        assert.equal(new Set(byName.values()).size, byName.size);
    }
});

test('two spores become the leftmost physical growth without creating combat', () => {
    const s = fresh(), p = s.players[0], id = p.room;
    assert.equal(placeChySpore(s, id), true); assert.equal(s.chySporesLeft, 14);
    assert.equal(placeChySpore(s, id), true); assert.equal(s.chySporesLeft, 15);
    assert.deepEqual(s.roomState[id].chyGerm, { id: 0, color: 'green', level: 1 });
    assert.equal(s.chyGermSlots[0].cube, null); assert.equal(inCombat(s, p), false);
    assert.equal(placeChySpore(s, id), false);
});

test('growing the third level creates mycelium and returns the cube to its rightmost color slot', () => {
    const s = fresh(), id = '002'; placeGerminator(s, id); growGerminator(s, id, 2);
    assert.equal(s.roomState[id].chyGerm.level, 3); growGerminator(s, id);
    assert.equal(s.roomState[id].chyMycelium, true); assert.equal(s.chyMyceliumLeft, 7);
    assert.equal(s.chyGermSlots[0].cube.id, 0); assert.equal(s.chyGermSlots[0].cube.level, 1);
    assert.equal(placeGerminator(s, id), false); assert.equal(placeMycelium(s, id), false);
});

test('physical cube order and pre-grown reserve survive serialization and injuries', () => {
    let s = fresh(); growSupplyGerminator(s); growSupplyGerminator(s);
    s = JSON.parse(JSON.stringify(s)); placeGerminator(s, '002'); placeGerminator(s, '003');
    assert.equal(s.roomState['002'].chyGerm.level, 3); assert.equal(s.roomState['003'].chyGerm.color, 'purple');
    damageGerminator(s, '002', 3); assert.equal(s.roomState['002'].chyGerm, null);
    assert.equal(s.chyGermSlots[0].cube.level, 1);
});

test('spore supply exhaustion makes a growth, then cube exhaustion makes mycelium', () => {
    const s = fresh(); s.chySporesLeft = 0; placeChySpore(s, '002');
    assert.ok(s.roomState['002'].chyGerm); assert.equal(s.chySporesLeft, 0);
    for (let i = 0; i < s.chyGermSlots.length; i++) s.chyGermSlots[i].cube = null;
    assert.equal(placeGerminator(s, '003'), true); assert.equal(s.roomState['003'].chyMycelium, true);
});

test('placing a second personal spore kills and leaves a character corpse and growth', () => {
    const s = fresh(), p = s.players[0]; assert.equal(giveChySpore(s, p), true); assert.equal(p.chySpore, true);
    assert.equal(giveChySpore(s, p), true); assert.equal(p.status, 'dead');
    assert.ok(s.roomState[p.room].chyGerm); assert.ok(s.roomState[p.room].objects.some(o => o.type === 'charCorpse'));
    const q = s.players[1]; giveChySpore(s, q); assert.equal(removeChySpore(s, q), true); assert.equal(q.chySpore, false);
});

test('personal spore uses a spore marker from lowest numbered room if reserve is empty', () => {
    const s = fresh(); placeChySpore(s, '002'); placeChySpore(s, '003'); s.chySporesLeft = 0;
    assert.equal(giveChySpore(s, s.players[0]), true); assert.ok(s.roomState['002'].chyGerm);
    assert.equal(s.roomState['003'].chySpore, true); assert.equal(s.chySporesLeft, 0);
});

test('queen board slots govern spawn, return, and finite slain miniatures', () => {
    let s = fresh(); const it = spawnChytrid(s, 'stinkhorn', '002'); assert.equal(s.chyQueenSlots[7], false);
    s = JSON.parse(JSON.stringify(s)); const restored = s.intruders[it.uid];
    s.chytridAside.push(s.bag.splice(s.bag.findIndex(t => t.type === 'stinkhorn'), 1)[0]);
    assert.equal(returnStinkhornToQueen(s, restored), true); assert.equal(s.chyQueenSlots[7], true);
    assert.equal(s.chytridAside.length, 0);
    const dead = spawnChytrid(s, 'stinkhorn', '002'); killChytrid(s, dead);
    assert.equal(s.chyDeadStinkhorns, 1); assert.equal(s.chyQueenSlots[7], false);
    assert.equal(s.roomState['002'].objects[0].type, 'carcass');
});

test('larger Chytrids require a growth; queen cannot relocate from combat or respawn after death', () => {
    const s = fresh(), p = s.players[0], id = p.room; assert.equal(spawnChytrid(s, 'deathcap', id), null);
    placeGerminator(s, id); const queen = spawnChytrid(s, 'chyQueen', id); assert.ok(queen);
    placeGerminator(s, '002'); assert.equal(spawnChytrid(s, 'chyQueen', '002'), null);
    p.room = '003'; s.players[1].room = '003'; assert.equal(spawnChytrid(s, 'chyQueen', '002').uid, queen.uid);
    assert.equal(queen.room, '002'); killChytrid(s, queen); assert.equal(s.chyQueenDead, true);
    assert.equal(spawnChytrid(s, 'chyQueen', '002'), null);
});

import { transmitChySpore, spreadChySpores, growChyColor, moveLargeChytrid, burnChytrids, developChyBag } from '../shared/engine/chytrids.mjs';
test('exploration and spread destroy closed doors instead of transmitting spores', () => {
    const s = fresh(), id = '002', exit = s.ship.rooms[id].exits[0], c = s.ship.corridors[exit.corridor];
    c.door = 'closed'; assert.equal(transmitChySpore(s, id, exit.num), false); assert.equal(c.door, 'destroyed');
    assert.equal(s.roomState[exit.to].chySpore, false); placeGerminator(s, id);
    spreadChySpores(s, exit.num); assert.equal(s.roomState[exit.to].chySpore, true);
});
test('growth symbols resolve twice in room-number order', () => {
    const s = fresh(); placeGerminator(s, '002'); placeGerminator(s, '003');
    growChyColor(s, 'green', 2); assert.equal(s.roomState['002'].chyGerm.level, 3);
    assert.equal(s.roomState['003'].chyGerm.level, 1);
    growChyColor(s, 'green'); assert.equal(s.roomState['002'].chyMycelium, true);
});
test('large creatures break closed doors and otherwise leave spores rather than move to a bare room', () => {
    const s = fresh(), id = '002', e = s.ship.rooms[id].exits[0]; placeGerminator(s, id);
    const it = spawnChytrid(s, 'deathcap', id), c = s.ship.corridors[e.corridor]; c.door = 'closed';
    assert.equal(moveLargeChytrid(s, it, e.to), false); assert.equal(c.door, 'destroyed');
    assert.equal(moveLargeChytrid(s, it, e.to), false); assert.equal(s.roomState[e.to].chySpore, true);
    placeGerminator(s, e.to); assert.equal(moveLargeChytrid(s, it, e.to), true); assert.equal(it.room, e.to);
});
test('event fire damages physical growths and intruders, and clears room spores', () => {
    const s = fresh(); placeGerminator(s, '002'); const it = spawnChytrid(s, 'stinkhorn', '002');
    placeChySpore(s, '003'); s.roomState['002'].fire = true; s.roomState['003'].fire = true;
    burnChytrids(s); assert.equal(s.roomState['002'].chyGerm, null); assert.equal(it.hits, 1);
    assert.equal(s.roomState['003'].chySpore, false); assert.equal(s.chySporesLeft, 15);
});
test('event bag restores aside tokens, revives dead stinkhorns, and queen grows the supply', () => {
    const s = fresh(); const it = spawnChytrid(s, 'stinkhorn', '002'); killChytrid(s, it);
    s.chytridAside.push(s.bag.splice(s.bag.findIndex(t => t.type === 'stinkhorn'), 1)[0]);
    const blank = s.bag.splice(s.bag.findIndex(t => t === 'blank'), 1)[0]; developChyBag(s, blank);
    assert.equal(s.chytridAside.length, 0); assert.equal(s.chyDeadStinkhorns, 0); assert.equal(s.chyQueenSlots[7], true);
    const queen = s.bag.splice(s.bag.findIndex(t => t.type === 'chyQueen'), 1)[0]; developChyBag(s, queen);
    assert.equal(s.chyGermSlots[0].cube.level, 2);
});
test('trying to place ninth mycelium destroys ship, clears queue and preserves escaped players', () => {
    const s = fresh(); s.chyMyceliumLeft = 0; s.queue = [{ op: 'dummy' }]; s.players[1].status = 'escaped';
    placeMycelium(s, '002'); assert.equal(s.chyOverrun, true); assert.equal(s.shipDestroyed, true);
    assert.equal(s.players[0].status, 'dead'); assert.equal(s.players[1].status, 'escaped');
    assert.deepEqual(s.queue, [{ op: 'game.end' }]);
});
test('if all eight stinkhorns are on board, those not in combat retreat before another appears', () => {
    const s = fresh(); s.players[0].room = '003'; s.players[1].room = '003';
    for (let i = 0; i < 8; i++) assert.ok(spawnChytrid(s, 'stinkhorn', i === 0 ? '003' : '002'));
    const result = spawnChytrid(s, 'stinkhorn', '002'); assert.ok(result);
    assert.equal(Object.values(s.intruders).length, 2); assert.equal(s.chyQueenSlots.filter(Boolean).length, 6);
});

import { OPS, infectLarva } from '../shared/engine/core.mjs';
import { dealHits } from '../shared/engine/combat.mjs';
import { infectionProcedure, eclosionProcedure } from '../shared/engine/actions.mjs';
import { analyzeAdaptation, resolveAirlocks } from '../shared/engine/rooms.mjs';
import { CHYTRID_ATTACK_BY_ID } from '../shared/data/chytrids.mjs';

test('exploration numbers are seeded, secret, fixed, and spore transmission respects doors', () => {
    const s = fresh('exploration'), same = fresh('exploration');
    assert.deepEqual(s.secret.chyExploreNumbers, same.secret.chyExploreNumbers);
    const view = viewFor(s, null); assert.equal(view.secret, undefined); assert.equal(view.chyExploreNumbers, undefined);
    const id = Object.keys(s.secret.tokens).find(r => s.ship.rooms[r].exits.length); const e = s.ship.rooms[id].exits[0];
    s.secret.chyExploreNumbers[id] = e.num; const c = s.ship.corridors[e.corridor]; c.door = 'closed';
    OPS.explore(s, { room: id, player: 0 }); assert.equal(c.door, 'destroyed'); assert.equal(s.roomState[e.to].chySpore, false);
});

test('encounters conserve drawn physical tokens and resolve the surprise threshold', () => {
    for (const type of ['stinkhorn','deathcap','chyQueen']) {
        const s = fresh(), p=s.players[0], id=p.room, token=s.bag.splice(s.bag.findIndex(t=>t.type===type),1)[0];
        token.value=3; p.hand=[];
        if(type!=='stinkhorn') placeGerminator(s,id);
        OPS['chy.encounter'](s,{player:p.id,room:id,token});
        assert.equal(s.chytridAside.includes(token),true); const it=Object.values(s.intruders)[0]; assert.equal(it.type,type);
        OPS['chy.encounterSurprise'](s,s.queue.shift()); assert.equal(s.queue[0].op,'attack');
    }
});

test('large creature encounter without growth puts growth and noise, not an attack', () => {
    const s=fresh(),p=s.players[0],token=s.bag.splice(s.bag.findIndex(t=>t.type==='deathcap'),1)[0];
    OPS['chy.encounter'](s,{player:p.id,room:p.room,token});
    assert.ok(s.roomState[p.room].chyGerm); assert.equal(Object.keys(s.intruders).length,0);
    assert.equal(s.chytridAside.length,1); assert.ok(s.ship.rooms[p.room].exits.every(e=>s.ship.corridors[e.corridor].noise));
});

test('Chytrid attack cards hit only their printed types, and execute all effects', () => {
    for(const [id,type,effect] of [['chyAttack1','deathcap','spore'],['chyAttack3','stinkhorn','wound'],['chyAttack4','stinkhorn','cut'],['chyAttack10','stinkhorn','charge'],['chyAttack12','stinkhorn','growth'],['chyAttack14','chyQueen','entangle'],['chyAttack17','stinkhorn','queen'],['chyAttack19','deathcap','spikes']]) {
        const s=fresh(),p=s.players[0],q=s.players[1]; q.room=p.room; p.hand=[]; q.hand=[];
        if(type!=='stinkhorn') placeGerminator(s,p.room);
        const it=spawnChytrid(s,type,p.room); assert.ok(it);
        OPS.attack(s,{player:p.id,intruder:it.uid,cardId:id,noReaction:true,context:'phase'});
        if(effect==='spore') {assert.equal(p.chySpore,true); assert.equal(p.discard.filter(c=>c.startsWith('contam#')).length,1); assert.equal(q.discard.filter(c=>c.startsWith('contam#')).length,1);}
        if(effect==='wound') assert.equal(p.wounds.length,1);
        if(effect==='cut') {assert.equal(p.health,9); assert.equal(p.discard.filter(c=>c.startsWith('contam#')).length,1);}
        if(effect==='charge') assert.equal(p.health,8);
        if(effect==='growth') assert.ok(roomOf(s,p).chyGerm);
        if(effect==='entangle') assert.equal(roomOf(s,p).chyMycelium,true);
        if(effect==='queen') assert.ok(Object.values(s.intruders).some(x=>x.type==='chyQueen'));
        if(effect==='spikes') {assert.equal(p.wounds.length,1);assert.equal(q.wounds.length,1);}
    }
});
function roomOf(s,p){return s.roomState[p.room];}

test('Chytrid misses do not apply an incompatible card effect', () => {
    const s=fresh(),p=s.players[0];p.hand=[]; const it=spawnChytrid(s,'stinkhorn',p.room);
    OPS.attack(s,{player:p.id,intruder:it.uid,cardId:'chyAttack1',noReaction:true});
    assert.equal(p.chySpore,false);assert.equal(p.health,10);
});

test('Redux kill roll is retained: normal, critical, and weak-spot 6 kill correctly', () => {
    for(const [value,weak,killed] of [[6,false,false],[2,false,true],['crit',false,true],[6,true,true]]) {
        const s=fresh(),p=s.players[0],it=spawnChytrid(s,'stinkhorn',p.room);it.hits=1;
        if(weak)s.chyWeaknesses.push('predictableMovements');
        assert.equal(dealHits(s,p,it,1,0,{forcedRoll:value}),killed);
        assert.equal(!!s.intruders[it.uid],!killed); if(killed) assert.equal(s.chyDeadStinkhorns,1);
    }
});

test('spores replace larvae in infection scans and can be removed with decontamination', () => {
    const s=fresh(),p=s.players[0];p.hand=['contam#test'];s.secret.contamInfected['contam#test']=true;
    infectionProcedure(s,p,true,'rest');assert.equal(p.chySpore,true);assert.equal(p.larva,false);assert.equal(s.chySporesLeft,14);
    OPS['room.action'](s,{player:p.id,tile:'decon',then:{op:'noop'}});assert.equal(p.chySpore,false);assert.equal(s.chySporesLeft,15);
    assert.equal(infectLarva(s,p),true);assert.equal(p.chySpore,true);
});

test('analysis reveals the associated secret weakness exactly once', () => {
    const s=fresh(),p=s.players[0];s.secret.chyWeaknesses.corpse='slowReaction';
    assert.ok(!JSON.stringify(viewFor(s,null)).includes('slowReaction'));
    analyzeAdaptation(s,p,'charCorpse',{op:'noop'}); assert.deepEqual(s.chyWeaknesses,['slowReaction']);
    analyzeAdaptation(s,p,'corpse',{op:'noop'}); assert.deepEqual(s.chyWeaknesses,['slowReaction']);
});

test('Chytrid event deck excludes Power Surge and all other card effects are executable', () => {
    const s=fresh(); assert.equal(CHYTRID_EVENT_CARDS.length,20); assert.equal(s.eventDeck.length,19); assert.ok(!s.eventDeck.includes('chyEvent13'));
    for(const ev of CHYTRID_EVENT_CARDS.filter(c=>c.effect!=='powerSurge')) {
        const x=fresh(ev.id); assert.doesNotThrow(()=>OPS['chy.eventMovement'](x,{id:ev.id}),ev.id);
        assert.doesNotThrow(()=>OPS['chy.eventEffect'](x,{id:ev.id}),ev.id);
        assert.doesNotThrow(()=>OPS['event.finish'](x,{id:ev.id}),ev.id);
    }
});

test('event movement grows physical cubes before card effect and event is queued ahead of bag', () => {
    const s=fresh();placeGerminator(s,'002');const ev=CHYTRID_EVENT_CARDS[0];
    OPS['event.movement'](s,{id:ev.id});assert.deepEqual(s.queue.map(q=>q.op),['chy.eventMovement','chy.eventEffect','event.finish','phase.cleanup']);
    OPS['chy.eventMovement'](s,s.queue.shift());assert.equal(s.roomState['002'].chyGerm.level,2);
    OPS['chy.eventEffect'](s,s.queue.shift());OPS['event.finish'](s,s.queue.shift());
    assert.equal(s.queue[0].op,'bag.develop'); assert.ok(s.chyEventRemoved.includes(ev.id));
});

test('airlock uses physical Chytrid death consequences without leaving carcasses', () => {
    const s=fresh(),id='002';for(const e of s.ship.rooms[id].exits)s.ship.corridors[e.corridor].door='closed';
    s.roomState[id].airlock=true;placeGerminator(s,id);const a=spawnChytrid(s,'stinkhorn',id),q=spawnChytrid(s,'chyQueen',id);
    resolveAirlocks(s);assert.equal(s.intruders[a.uid],undefined);assert.equal(s.intruders[q.uid],undefined);
    assert.equal(s.chyDeadStinkhorns,1);assert.equal(s.chyQueenDead,true);assert.ok(!s.roomState[id].objects.some(o=>o.type==='carcass'));
});

import { buildMenu } from '../shared/engine/turn.mjs';
import { checkObjective } from '../shared/engine/endgame.mjs';
test('players can shoot or melee a growth without entering combat, and growth cannot counterattack', () => {
    for (const mode of ['shoot','melee']) {
        const s=fresh(),p=s.players[0];p.hand=['soldier.move#0','soldier.move#1'];p.items=[{uid:'gun',item:'handgun',ammo:2}];
        placeGerminator(s,p.room);growGerminator(s,p.room);assert.equal(inCombat(s,p),false);
        assert.equal(buildMenu(s,p).actions.find(a=>a.id===mode).enabled,true);
        OPS[mode==='shoot'?'shoot.target':'melee.start'](s,{player:p.id,weapon:'gun',then:{op:'noop'}});
        const hit=s.queue.shift();assert.match(hit.target,/^germ:/);s.pendingRoll={die:'combat',value:4};s.pendingRollPlayer=p.id;
        OPS[hit.op](s,hit);assert.equal(roomOf(s,p).chyGerm.level,1);assert.equal(s.prompt,null);assert.equal(s.queue[0].op,'noop');
        assert.equal(p.items[0].ammo,mode==='shoot'?1:2);
        if(mode==='melee')assert.ok(p.discard.some(c=>c.startsWith('contam#')));
    }
});
test('both Chytrid die weaknesses jointly select natural 6 as a critical',()=>{
    const s=fresh(),p=s.players[0],it=spawnChytrid(s,'stinkhorn',p.room);
    s.chyWeaknesses.push('chitinDepletion','predictableMovements');s.pendingRoll={die:'combat',value:6};
    assert.equal(dealHits(s,p,it,1,0,{forcedRoll:5}),true);assert.equal(s.intruders[it.uid],undefined);
});
test('mycelium noise reroll and motion scanner choices do not create a repeated prompt',()=>{
    const s=fresh(),p=s.players[0];placeMycelium(s,p.room);s.chyWeaknesses.push('slowReaction');
    p.items.push({uid:'scan',item:'motionScanner'});p.hand=['soldier.move#0'];
    OPS['noise.roll'](s,{player:p.id,room:p.room,forced:1});assert.match(s.prompt.title,/Медленная реакция/);
    let resume={...s.resume,answer:'no'};s.prompt=null;s.resume=null;OPS[resume.op](s,resume);
    OPS['noise.roll'](s,s.queue.shift());assert.match(s.prompt.title,/Сканер движения/);
    resume={...s.resume,answer:'no'};s.prompt=null;s.resume=null;OPS[resume.op](s,resume);
    OPS['noise.roll'](s,s.queue.shift());assert.equal(s.prompt,null);
});
test('Isolator, explosion and objective checks use Chytrid physical types and death state',()=>{
    const s=fresh(),p=s.players[0];OPS['room.containment'](s,{player:p.id,answer:'002',then:{op:'noop'}});
    const it=Object.values(s.intruders)[0];assert.equal(it.type,'stinkhorn');
    OPS['item.detonate'](s,{player:p.id,answer:'002',then:{op:'noop'}});assert.equal(s.chyDeadStinkhorns,1);
    const def={check:'extremeBiology'};s.chyWeaknesses=['slowReaction','parasitism'];assert.equal(checkObjective(s,p,def,'earth'),true);
    assert.equal(checkObjective(s,p,{check:'trophyHunter'},'earth'),false);s.chyQueenDead=true;assert.equal(checkObjective(s,p,{check:'trophyHunter'},'earth'),true);
});

test('Parasitism reduces only the final infection draw, not in-game eclosion',()=>{
    for(const final of [false,true]){
        const s=fresh(),p=s.players[0];s.chyWeaknesses.push('parasitism');p.hand=[];p.discard=[];p.deck=['soldier.move#0','soldier.move#1','soldier.move#2','contam#fourth'];
        s.secret.contamInfected['contam#fourth']=true;eclosionProcedure(s,p,{final});
        assert.equal(p.status,final?'active':'dead');
    }
});

import { run, answer, next } from '../shared/engine/core.mjs';
test('Chytrid full phase survives JSON save through event acknowledgement, bag draw and next turn',()=>{
    let s=fresh('full-phase');s.phase='player';s.ui.eventAck=true;s.ui.bagClick=true;s.eventDeck=['chyEvent1'];s.eventDiscard=[];s.bag=['blank'];s.time=10;s.round=1;
    placeGerminator(s,'002');next(s,{op:'phase.intruder'});run(s);
    assert.equal(s.prompt.kind,'ack');assert.equal(s.prompt.event,'chyEvent1');s=JSON.parse(JSON.stringify(s));s.prompt.flipped=true;
    for(const id of s.prompt.players.slice())assert.equal(answer(s,id,s.prompt.id,'ok'),true);
    assert.equal(s.prompt.kind,'bag');s=JSON.parse(JSON.stringify(s));assert.equal(answer(s,s.firstPlayer,s.prompt.id,'draw'),true);
    assert.equal(s.prompt.kind,'turn');assert.equal(s.time,9);assert.equal(s.round,2);assert.ok(s.chyEventRemoved.includes('chyEvent1'));
    assert.equal(s.bag.includes('blank'),true);assert.ok(s.roomState['002'].chyGerm.level>=2);
});

test('inside event kills the spore carrier, infects only from drawn infected cards and preserves earlier hand',()=>{
    const s=fresh(),[a,b]=s.players;giveChySpore(s,a);b.hand=['scout.move#0'];b.deck=['contam#event','scout.move#1','scout.move#2','scout.move#3'];b.discard=[];
    s.secret.contamInfected['contam#event']=true;OPS['chy.eventEffect'](s,{id:'chyEvent4'});
    assert.equal(a.status,'dead');assert.ok(roomOf(s,a).chyGerm);assert.equal(b.chySpore,true);assert.deepEqual(b.hand,['scout.move#0']);
    assert.equal(b.discard.length,4);
});
test('ventilation contaminates people near technical entrances and replaces spores there',()=>{
    const s=fresh(),p=s.players[0],id=Object.keys(s.ship.rooms).find(id=>s.ship.rooms[id].tech);
    p.room=id;placeChySpore(s,id);const old=p.discard.length;OPS['chy.eventEffect'](s,{id:'chyEvent6'});
    assert.ok(roomOf(s,p).chyGerm);assert.equal(roomOf(s,p).chySpore,false);assert.equal(p.discard.length,old+1);
});
test('dark growth preserves both infection and no-power transformations',()=>{
    const s=fresh(),[a,b]=s.players;a.room='002';b.room='003';placeGerminator(s,'002');placeGerminator(s,'004');
    const before=a.discard.length;OPS['chy.eventEffect'](s,{id:'chyEvent12'});
    assert.equal(a.discard.length,before+1);assert.equal(roomOf(s,a).chyMycelium,true);assert.equal(s.roomState['004'].chyGerm.level,2);
});
test('spore eruption consumes an egg and reaches every technical entrance on the original ship',()=>{
    const s=fresh();const before=s.nestEggs;OPS['chy.eventEffect'](s,{id:'chyEvent11'});assert.equal(s.nestEggs,before-1);
    for(const id of Object.keys(s.ship.rooms).filter(id=>s.ship.rooms[id].tech))assert.ok(s.roomState[id].chySpore || s.roomState[id].chyGerm || s.roomState[id].chyMycelium);
    s.nestEggs=0;s.nestDestroyed=true;OPS['chy.eventEffect'](s,{id:'chyEvent11'});assert.equal(s.nestEggs,1);assert.equal(s.nestDestroyed,false);
});
test('through event chooses fewest cards, makes growth and queen; engaged queen does not move',()=>{
    const s=fresh(),[a,b]=s.players;a.room='002';b.room='003';a.hand=['soldier.move#0'];b.hand=[];
    spawnChytrid(s,'stinkhorn',a.room);spawnChytrid(s,'stinkhorn',b.room);OPS['chy.eventEffect'](s,{id:'chyEvent10'});
    const q=Object.values(s.intruders).find(it=>it.type==='chyQueen');assert.equal(q.room,b.room);assert.ok(roomOf(s,b).chyGerm);assert.ok(roomOf(s,b).malfunction);
    b.room='004';a.room='003';OPS['chy.eventEffect'](s,{id:'chyEvent10'});assert.equal(q.room,'003');
});
test('event grow symbols apply in order twice; on-board queen token places neighboring cubes',()=>{
    const s=fresh();placeGerminator(s,'002');growGerminator(s,'002');
    OPS['chy.eventMovement'](s,{id:'chyEvent19'});assert.equal(s.roomState['002'].chyMycelium,true);
    const id='003';placeGerminator(s,id);const q=spawnChytrid(s,'chyQueen',id);assert.ok(q);
    const token=s.bag.splice(s.bag.findIndex(t=>t.type==='chyQueen'),1)[0];developChyBag(s,token);
    for(const e of s.ship.rooms[id].exits)assert.ok(s.roomState[e.to].chyGerm || s.roomState[e.to].chyMycelium);
});
test('failed placement during spore exhaustion cannot revive a player after mycelium overrun',()=>{
    const s=fresh(),p=s.players[0];placeChySpore(s,'002');s.chySporesLeft=0;s.chyMyceliumLeft=0;
    for(const slot of s.chyGermSlots)slot.cube=null;
    assert.equal(giveChySpore(s,p),false);assert.equal(s.shipDestroyed,true);assert.equal(p.status,'dead');assert.equal(p.chySpore,false);
});

test('coolant leak targets explored Generator, starts self-destruct only when malfunctioning',()=>{
    const s=fresh();s.roomState['002'].tile='generator';s.roomState['002'].explored=true;
    OPS['chy.eventEffect'](s,{id:'chyEvent1'});assert.equal(s.roomState['002'].malfunction,true);assert.equal(s.selfDestruct,0);
    OPS['chy.eventEffect'](s,{id:'chyEvent1'});assert.equal(s.selfDestruct,1);
});
test('COG malfunction affects evacuation rooms A and B, and wounds those without action cards',()=>{
    const s=fresh(),[a,b]=s.players;a.room='002';b.room='003';s.roomState['002'].tile='evacA';s.roomState['003'].tile='evacB';a.hand=[];b.hand=['scout.move#1'];
    OPS['chy.eventEffect'](s,{id:'chyEvent8'});assert.ok(s.roomState['002'].fire);assert.ok(s.roomState['003'].fire);assert.equal(a.wounds.length,1);assert.equal(b.wounds.length,0);
});

test('two-die weakness chooses after weapon face changes and applies the selected face effects',()=>{
    // Scientist's pistol turns a natural critical into 6: 3 is actually the killing result.
    {
        const s=fresh(),p=s.players[0],it=spawnChytrid(s,'stinkhorn',p.room);it.hits=2;
        s.chyWeaknesses=['chitinDepletion'];s.pendingRoll={die:'combat',value:3};
        assert.equal(dealHits(s,p,it,1,0,{weapon:{item:'scientistPistol'},forcedRoll:'crit'}),true);
        assert.equal(s.lastCombatNatural,3);assert.equal(s.intruders[it.uid],undefined);
    }
    // BF gun's 5 deals another wound, unlike a lower nonlethal result.
    {
        const s=fresh(),p=s.players[0],it=spawnChytrid(s,'stinkhorn',p.room);
        s.chyWeaknesses=['chitinDepletion'];s.pendingRoll={die:'combat',value:5};
        assert.equal(dealHits(s,p,it,1,0,{weapon:{item:'bfGun'},forcedRoll:2}),false);
        assert.equal(s.lastCombatNatural,5);assert.equal(it.hits,2);
    }
    // If the first roll wins, weapon effects must not use the second die's face.
    {
        const s=fresh(),p=s.players[0],it=spawnChytrid(s,'stinkhorn',p.room);
        p.items=[{uid:'arm',item:'armGun',ammo:0},{uid:'ups',item:'ups',charge:3}];
        s.chyWeaknesses=['chitinDepletion'];s.pendingRoll={die:'combat',value:6};
        OPS['shoot.fire'](s,{player:p.id,weapon:'arm',target:it.uid,rerollResolved:true,forcedRoll:'crit',then:{op:'noop'}});
        assert.equal(s.lastCombatNatural,'crit');assert.equal(p.items.find(i=>i.item==='ups').charge,2);
    }
});

test('selected-face bookkeeping preserves ordinary Redux Queen weapon effects',()=>{
    const s=fresh(),p=s.players[0];s.enemySet='redux';s.intruders={};
    const q=spawnIntruder(s,'queen',p.room);p.items=[{uid:'arm',item:'armGun',ammo:0},{uid:'ups',item:'ups',charge:3}];
    OPS['shoot.fire'](s,{player:p.id,weapon:'arm',target:q.uid,rerollResolved:true,forcedRoll:'crit',then:{op:'noop'}});
    assert.equal(s.lastCombatNatural,'crit');assert.equal(p.items.find(i=>i.item==='ups').charge,2);
    assert.ok(s.queue.some(x=>x.op==='queen.card'));
});

test('actual attack actions can target a growth while effects naming Intruders cannot',()=>{
    const s=fresh(),p=s.players[0],r=p.room;
    placeGerminator(s,r);growGerminator(s,r,2);
    p.hand=['soldier.weakSpot#0','field.precisionShot#1','soldier.move#0','soldier.move#1'];
    p.items=[{uid:'gun',item:'handgun',ammo:2},{uid:'glow',item:'glowstick'},{uid:'gren',item:'grenade'}];
    const menu=buildMenu(s,p);
    assert.equal(menu.cards.find(c=>c.id==='soldier.weakSpot#0').enabled,true);
    assert.equal(menu.cards.find(c=>c.id==='field.precisionShot#1').enabled,true);
    assert.equal(menu.items.find(i=>i.uid==='gren').enabled,false); // growth alone is not an Intruder
    OPS['card.weakSpot'](s,{player:p.id});assert.deepEqual(s.prompt.options.map(o=>o.id),['shoot','melee']);s.prompt=null;s.resume=null;
    OPS['card.fdAdvance'](s,{player:p.id});assert.deepEqual(s.prompt.options.map(o=>o.id),['shoot','melee','move']);s.prompt=null;s.resume=null;
    OPS['item.use'](s,{player:p.id,uid:'glow',then:{op:'noop'}});assert.ok(s.prompt.options.some(o=>o.id==='melee'));s.prompt=null;s.resume=null;
    OPS['card.desperateAttack'](s,{player:p.id});assert.equal(s.prompt.options[0].id,'germ:'+r);s.prompt=null;s.resume=null;
    // A grenade targets the intruder but not the growth occupying the same room.
    spawnChytrid(s,'stinkhorn',r);s.chyWeaknesses.push('fireVulnerability');
    OPS['item.grenade'](s,{player:p.id,answer:r,then:{op:'noop'}});assert.equal(s.roomState[r].chyGerm.level,3);
    p.items.push({uid:'launcher',item:'grenadeLauncher',ammo:1});
    OPS['shoot.grenade'](s,{player:p.id,weapon:'launcher',answer:r,then:{op:'noop'}});assert.equal(s.roomState[r].chyGerm.level,3);
});

test('precision shot rolls twice at growth and selects the face with extra damage',()=>{
    const s=fresh(),p=s.players[0];placeGerminator(s,p.room);growGerminator(s,p.room,2);
    p.items=[{uid:'bf',item:'bfGun',ammo:5}];s.pendingRoll={die:'combat',value:5};
    OPS['chy.germShoot'](s,{player:p.id,target:'germ:'+p.room,weapon:'bf',forcedRoll:4,bestOfTwo:true,then:{op:'noop'}});
    assert.equal(s.roomState[p.room].chyGerm.level,1);assert.equal(p.items[0].ammo,4);
    assert.ok(s.log.some(l=>l.text?.includes('Два броска')));
});

test('fire vulnerability applies to flamethrower and Redux grenade, but not ordinary gunfire',()=>{
    for(const source of ['gun','flamethrower','grenade']){
        const s=fresh(),p=s.players[0],it=spawnChytrid(s,'deathcap',p.room); // place on growth first
        // Place the required growth before spawning a larger Chytrid.
        assert.equal(it,null);placeGerminator(s,p.room);const target=spawnChytrid(s,'deathcap',p.room);
        s.chyWeaknesses=['fireVulnerability'];
        const opts=source==='grenade'?{explosive:true,forcedRoll:6}:{weapon:{item:source==='gun'?'handgun':'flamethrower'},forcedRoll:6};
        dealHits(s,p,target,1,0,opts);assert.equal(target.hits,source==='gun'?1:2);
    }
});

test('events count action cards, not infection cards, for wounds and target priority',()=>{
    const s=fresh(),[a,b]=s.players;a.room='002';b.room='003';
    s.roomState['002'].tile='evacA';s.roomState['003'].tile='evacB';
    a.hand=['contam#1'];b.hand=['scout.move#0'];OPS['chy.eventEffect'](s,{id:'chyEvent8'});
    assert.equal(a.wounds.length,1);assert.equal(b.wounds.length,0);
    a.room='004';b.room='005';a.hand=['contam#1','contam#2'];b.hand=['scout.move#0'];
    spawnChytrid(s,'stinkhorn',a.room);spawnChytrid(s,'stinkhorn',b.room);OPS['chy.eventEffect'](s,{id:'chyEvent10'});
    assert.equal(Object.values(s.intruders).find(i=>i.type==='chyQueen').room,a.room);
});

test('lethal event stops before placing more colony components after ship destruction',()=>{
    const s=fresh(),p=s.players[0],id='002';p.room=id;spawnChytrid(s,'stinkhorn',id);s.malfLeft=0;
    OPS['chy.eventEffect'](s,{id:'chyEvent10'});
    assert.equal(s.shipDestroyed,true);assert.equal(s.roomState[id].chyGerm,null);assert.equal(Object.keys(s.intruders).length,0);
    assert.deepEqual(s.queue.map(x=>x.op),['game.end']);
    const s2=fresh();placeMycelium(s2,'002');s2.malfLeft=0;
    OPS['chy.eventEffect'](s2,{id:'chyEvent19'});
    assert.equal(s2.shipDestroyed,true);assert.equal(Object.values(s2.roomState).filter(r=>r.chySpore).length,0);
});

test('a thrown grenade deals the extra explosive injury to each Chytrid, not to growths',()=>{
    const s=fresh(),p=s.players[0];placeGerminator(s,p.room);growGerminator(s,p.room,2);
    const target=spawnChytrid(s,'deathcap',p.room);s.chyWeaknesses=['fireVulnerability'];
    s.pendingRoll={die:'combat',value:6};
    OPS['item.grenade'](s,{player:p.id,answer:p.room,then:{op:'noop'}});
    assert.equal(target.hits,3);assert.equal(s.roomState[p.room].chyGerm.level,3);
});

test('inside-us event stops immediately if placing a growth overruns the ship',()=>{
    const s=fresh(),[a,b]=s.players;a.room='002';b.room='003';a.chySpore=true;b.chySpore=true;
    for(const slot of s.chyGermSlots)slot.cube=null;s.chyMyceliumLeft=0;
    OPS['chy.eventEffect'](s,{id:'chyEvent4'});
    assert.equal(s.shipDestroyed,true);assert.equal(s.roomState['002'].objects.filter(o=>o.type==='charCorpse').length,1);
    assert.equal(s.roomState['003'].objects.filter(o=>o.type==='charCorpse').length,0);
    assert.deepEqual(s.queue.map(x=>x.op),['game.end']);
});

test('attack images match the effect and toughness of each physical Chytrid card',()=>{
    const sheet=[['infection',3],['infection',5],['blow',2],['cut',2],['cut',3],['blow',3],['cut',3],['blow',6],['smallGrowth',4],['charge',4],['charge',5],['smallGrowth',2],['blow',5],['entangle',3],['spikes',6],['pseudopod',5],['pseudopod',4],['entangle',5],['spikes',5],['blow',4]];
    assert.equal(new Set(CHYTRID_ATTACK_CARDS.map(c=>c.sheetIndex)).size,20);
    for(const card of CHYTRID_ATTACK_CARDS)assert.deepEqual(sheet[card.sheetIndex],[card.effect,card.toughness],card.id);
});

test('event images match the physical Chytrid card effect and corridor numbers',()=>{
    const sheet=[['coolant',[4]],['eruption',[2]],['ventilation',[1]],['shortCircuit',[2]],['airborne',[1]],['cargoSystem',[4]],['through',[1]],['bloom',[1,2]],['mycelium',[3,4]],['inside',[3]],['infectedAir',[1,2]],['darkGrowth',[3]],['server',[1]],['regrowth',[3,4]],['fire',[3]],['airborne',[4]],['inside',[2]],['powerSurge',[2]],['creepingDeath',[4]],['lifeSupport',[3]]];
    assert.equal(new Set(CHYTRID_EVENT_CARDS.map(c=>c.sheetIndex)).size,20);
    for(const card of CHYTRID_EVENT_CARDS)assert.deepEqual(sheet[card.sheetIndex],[card.effect,card.numbers],card.id);
});

test('mycelium and regrowth events place only one spore per shared adjacent compartment',()=>{
    for(const effect of ['mycelium','regrowth']) {
        const s=fresh();
        const dest=Object.keys(s.ship.rooms).find(id=>new Set(s.ship.rooms[id].exits.map(e=>e.to)).size>=2);
        const [a,b]=[...new Set(s.ship.rooms[dest].exits.map(e=>e.to))];
        if(effect==='mycelium') {placeMycelium(s,a);placeMycelium(s,b);}
        else {spawnChytrid(s,'stinkhorn',a);spawnChytrid(s,'stinkhorn',b);}
        const ev=CHYTRID_EVENT_CARDS.find(c=>c.effect===effect);
        OPS['chy.eventEffect'](s,{id:ev.id});
        assert.equal(s.roomState[dest].chySpore,true,effect);
        assert.equal(s.roomState[dest].chyGerm,null,effect);
    }
});
