import { OPS, next, log, room, tileOf, playersInRoom, intrudersIn, placeMalfunction, placeFire, gainContamination,
    killPlayer, drawCards, discardCard, isContam, isInfected, gainWound, findRoomsByTile } from './core.mjs';
import { moveIntrudersByCorridor, checkNest } from './intruders.mjs';
import { startSelfDestruct } from './events.mjs';
import { CHYTRID_EVENT_BY_ID } from '../data/chytrids.mjs';
import { spreadChySpores, growChyColor, moveLargeChytrid, placeChySpore, placeGerminator, placeMycelium, giveChySpore, spawnChytrid } from './chytrids.mjs';

const actionCards = p => p.hand.filter(c => !isContam(c)).length;
function ordered(state) { return Object.keys(state.ship.rooms).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})); }
function adjacentSpore(state, sources) {
    // The card targets each adjacent compartment, not once per source touching it.
    const targets = new Set();
    for (const id of sources) for (const e of state.ship.rooms[id].exits) targets.add(e.to);
    for (const id of targets) { if (state.shipDestroyed) return; placeChySpore(state,id); }
}
function moveLarge(state, type, num) {
    for (const it of Object.values(state.intruders)) {
        if (it.type !== type || playersInRoom(state,it.room).length) continue;
        const e = state.ship.rooms[it.room].exits.find(x => (x.nums || [x.num]).includes(num));
        if (e) moveLargeChytrid(state,it,e.to);
    }
}
OPS['chy.eventMovement'] = (state, step) => {
    const ev = CHYTRID_EVENT_BY_ID[step.id]; if (!ev) throw new Error('Invalid Chytrid event');
    for (const n of ev.numbers) {
        if (state.chyOverrun) return;
        if (ev.mover === 'growth') spreadChySpores(state,n);
        else if (ev.mover === 'stinkhorn') moveIntrudersByCorridor(state,n,['stinkhorn']);
        else moveLarge(state,ev.mover,n);
    }
    for (const color of ev.growth) { if (state.chyOverrun) return; growChyColor(state,color); }
};
OPS['chy.eventEffect'] = (state, step) => {
    const ev = CHYTRID_EVENT_BY_ID[step.id], ids = ordered(state);
    if (!ev) throw new Error('Invalid Chytrid event');
    switch(ev.effect) {
        case 'coolant': {
            const id = findRoomsByTile(state,'generator')[0];
            if (id) { if (room(state,id).malfunction) startSelfDestruct(state); else placeMalfunction(state,id,'событие'); }
            break;
        }
        case 'cargoSystem':
            for (const id of ids.filter(id=>['evacA','evacB'].includes(tileOf(state,id)))) {
                if (state.shipDestroyed) return;
                placeFire(state,id,'событие');
                if (state.shipDestroyed) return;
                for (const p of playersInRoom(state,id)) if (!actionCards(p)) gainWound(state,p);
            }
            break;
        case 'lifeSupport': case 'shortCircuit': case 'server': case 'powerSurge': case 'airborne':
            log(state, ev.text, 'minor'); break;
        case 'inside':
            for (const p of state.players.filter(p=>p.status==='active' && !p.pod)) {
                if (state.shipDestroyed) return;
                if (p.chySpore) { const id=p.room; killPlayer(state,p,'споры внутри'); placeGerminator(state,id); continue; }
                const old = p.hand.length; drawCards(state,p,4,true); const drawn = p.hand.slice(old);
                const infected = drawn.some(c=>isContam(c) && isInfected(state,c));
                for(const c of drawn) discardCard(state,p,c);
                if(infected && p.status==='active') giveChySpore(state,p);
            }
            break;
        case 'ventilation':
            for (const p of state.players.filter(p=>p.status==='active' && !p.pod && state.ship.rooms[p.room].tech)) gainContamination(state,p,1);
            for (const id of ids) {
                if (state.shipDestroyed) return;
                if(state.ship.rooms[id].tech && room(state,id).chySpore) placeGerminator(state,id);
            }
            break;
        case 'fire': {
            const burning = ids.filter(id=>room(state,id).fire), dest = new Set();
            for (const id of burning) for(const e of state.ship.rooms[id].exits) if(state.ship.corridors[e.corridor].door!=='closed') dest.add(e.to);
            for (const id of dest) { if (state.shipDestroyed) return; placeFire(state,id,'событие'); }
            break;
        }
        case 'through': {
            const queen=Object.values(state.intruders).find(it=>it.type==='chyQueen');
            if (state.chyQueenDead || (queen && playersInRoom(state,queen.room).length)) break;
            const eligible=state.players.filter(p=>p.status==='active' && !p.pod && intrudersIn(state,p.room).some(it=>it.type==='stinkhorn'))
                .sort((a,b)=>actionCards(a)-actionCards(b) || a.room.localeCompare(b.room, undefined, { numeric: true }));
            if (eligible.length) {
                const id=eligible[0].room; placeMalfunction(state,id,'событие');
                if (state.shipDestroyed) return;
                placeGerminator(state,id); if (state.shipDestroyed) return;
                spawnChytrid(state,'chyQueen',id);
            }
            break;
        }
        case 'eruption':
            if(state.nestEggs<=0) { state.nestEggs=1; state.nestDestroyed=false; }
            else { state.nestEggs--; checkNest(state); for(const id of ids) { if(state.shipDestroyed) return; if(state.ship.rooms[id].tech) placeChySpore(state,id); } }
            break;
        case 'darkGrowth':
            for(const p of state.players.filter(p=>p.status==='active' && !p.pod && room(state,p.room).chyGerm)) gainContamination(state,p,1);
            for(const id of ids) { if(state.shipDestroyed) return; if(room(state,id).chyGerm) { if(playersInRoom(state,id).length) placeMycelium(state,id); else growChyColorSingle(state,id); } }
            break;
        case 'creepingDeath':
            for(const id of ids) { if(state.shipDestroyed) return; if(state.ship.rooms[id].tech && playersInRoom(state,id).length) { spawnChytrid(state,'stinkhorn',id); placeChySpore(state,id); } }
            break;
        case 'infectedAir':
            for(const p of state.players.filter(p=>p.status==='active' && !p.pod)) {
                if(room(state,p.room).chyGerm || room(state,p.room).chyMycelium) gainContamination(state,p,1);
            }
            for(const id of ids) { if(state.shipDestroyed) return; if(playersInRoom(state,id).length) placeChySpore(state,id); }
            break;
        case 'bloom': {
            const nest=ids.find(id=>tileOf(state,id)==='nest'), queen=Object.values(state.intruders).find(it=>it.type==='chyQueen');
            if(nest) {
                if(queen && !playersInRoom(state,queen.room).length && (room(state,nest).chyGerm || room(state,nest).chyMycelium)) queen.room=nest;
                for(const e of state.ship.rooms[nest].exits) if(playersInRoom(state,e.to).length) spawnChytrid(state,'stinkhorn',e.to);
            } else {
                const targets=new Set();
                for(const p of state.players.filter(p=>p.status==='active'&&!p.pod)) for(const e of state.ship.rooms[p.room].exits) if(!room(state,e.to).explored) targets.add(e.to);
                for(const id of targets) { if(state.shipDestroyed) return; placeChySpore(state,id); }
            }
            break;
        }
        case 'mycelium': {
            const src=ids.filter(id=>room(state,id).chyMycelium);
            for(const id of src) { if(state.shipDestroyed) return; placeMalfunction(state,id,'мицелий'); }
            if(!state.shipDestroyed) adjacentSpore(state,src); break;
        }
        case 'regrowth': {
            if(state.chyDeadStinkhorns>0) { const i=state.chyQueenSlots.indexOf(false); if(i>=0) {state.chyQueenSlots[i]=true; state.chyDeadStinkhorns--; } }
            const i=state.chytridAside.findIndex(t=>t.type==='stinkhorn'); if(i>=0) state.bag.push(state.chytridAside.splice(i,1)[0]);
            adjacentSpore(state,ids.filter(id=>intrudersIn(state,id).some(it=>it.type==='stinkhorn'))); break;
        }
        default: throw new Error('Unhandled Chytrid event '+ev.effect);
    }
};
// Grow one specific cube, rather than every cube of the same color.
import { growGerminator } from './chytrids.mjs';
function growChyColorSingle(state,id) { growGerminator(state,id); }
