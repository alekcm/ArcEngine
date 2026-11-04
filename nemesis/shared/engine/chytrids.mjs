// Physical Chytrid colony primitives, kept behind the DLC guard until full integration.
import { initialExpansionBag } from '../dlc.mjs';
import { shuffle, randInt } from '../rng.mjs';
import { CHYTRID_ATTACK_CARDS, CHYTRID_EVENT_CARDS, CHYTRID_GERMINATOR_ORDER, CHYTRID_LIMITS, CHYTRID_WEAKNESSES } from '../data/chytrids.mjs';
import { log, pname, room, roomName, playersInRoom, spawnIntruder, removeIntruder, killPlayer, destroyShip, next, fx } from './core.mjs';

export function initChytrids(state) {
    if (state.enemySet !== 'chytrids') throw new RangeError('Chytrid setup requires Chytrids');
    state.bag = initialExpansionBag('chytrids', state.players.map(p => p.id), state).bag;
    state.chytridAside = [];
    state.secret.chyExploreNumbers = Object.fromEntries(Object.keys(state.secret.tokens).sort().map(id => [id, 1 + randInt(state, 4)]));
    state.attackDeck = shuffle(state, CHYTRID_ATTACK_CARDS.map(c => c.id)); state.attackDiscard = [];
    state.eventDeck = shuffle(state, CHYTRID_EVENT_CARDS.filter(c => c.effect !== 'powerSurge').map(c => c.id)); state.eventDiscard = [];
    state.chyGermSlots = CHYTRID_GERMINATOR_ORDER.map((color, id) => ({ color, cube: { id, color, level: 1 } }));
    state.chyQueenSlots = Array(8).fill(true); state.chyDeadStinkhorns = 0;
    state.chySporesLeft = CHYTRID_LIMITS.spore; state.chyMyceliumLeft = CHYTRID_LIMITS.mycelium;
    state.chyQueenDead = false; state.chyWeaknesses = [];
    const keys = shuffle(state, Object.keys(CHYTRID_WEAKNESSES)).slice(0, 3);
    state.secret.chyWeaknesses = { corpse: keys[0], carcass: keys[1], egg: keys[2] };
    state.chyAnalyzed = { corpse: false, carcass: false, egg: false };
    state.adaptations = []; state.weaknessMode = false; state.weaknesses = []; state.nestEggs = 5;
    delete state.secret.weaknesses;
    for (const rs of Object.values(state.roomState)) { rs.chySpore = false; rs.chyGerm = null; rs.chyMycelium = false; }
    for (const p of state.players) p.chySpore = false;
}
export function hasChyWeakness(state, id) { return (state.chyWeaknesses || []).includes(id); }
export function revealChyWeakness(state, type) {
    if (type === 'charCorpse') type = 'corpse';
    if (!Object.hasOwn(state.chyAnalyzed, type) || state.chyAnalyzed[type]) return false;
    const key = state.secret.chyWeaknesses[type]; if (!CHYTRID_WEAKNESSES[key]) return false;
    state.chyAnalyzed[type] = true; state.chyWeaknesses.push(key);
    log(state, '🔬 Раскрыта уязвимость хитридов «' + CHYTRID_WEAKNESSES[key].name + '».', 'good'); return true;
}
/** Return the physical cube to the rightmost empty slot of its color at level 1. */
export function returnGerminator(state, cube) {
    if (!cube) return false;
    const slot = state.chyGermSlots.findLast(s => s.color === cube.color && !s.cube);
    if (!slot) throw new Error('No free slot for a returned germinator');
    slot.cube = { id: cube.id, color: cube.color, level: 1 }; return true;
}
export function clearChySpore(state, id) {
    const rs = room(state, id); if (!rs.chySpore) return false;
    rs.chySpore = false; state.chySporesLeft++; return true;
}
/** Exhausting the finite Mycelium reserve ends the game for characters still on the ship. */
export function placeMycelium(state, id) {
    const rs = room(state, id); if (rs.chyMycelium) return false;
    if (state.chyMyceliumLeft <= 0) {
        state.chyOverrun = true;
        destroyShip(state, 'корабль захвачен мицелием'); return false;
    }
    clearChySpore(state, id);
    if (rs.chyGerm) { returnGerminator(state, rs.chyGerm); rs.chyGerm = null; }
    rs.chyMycelium = true; state.chyMyceliumLeft--;
    log(state, '🟢 Мицелий: ' + roomName(state, id) + '.', 'event'); return true;
}
/** Put the leftmost cube onto the ship, or a Mycelium marker when no cubes remain. */
export function placeGerminator(state, id) {
    const rs = room(state, id); if (rs.chyMycelium || rs.chyGerm) return false;
    const slot = state.chyGermSlots.find(s => s.cube);
    if (!slot) return placeMycelium(state, id);
    clearChySpore(state, id);
    rs.chyGerm = slot.cube; slot.cube = null;
    log(state, '🟩 Нарост (' + rs.chyGerm.color + ', ' + rs.chyGerm.level + '): ' + roomName(state, id) + '.', 'event');
    return true;
}
export function placeChySpore(state, id) {
    const rs = room(state, id); if (rs.chyGerm || rs.chyMycelium) return false;
    if (rs.chySpore) { clearChySpore(state, id); return placeGerminator(state, id); }
    if (state.chySporesLeft <= 0) return placeGerminator(state, id);
    rs.chySpore = true; state.chySporesLeft--;
    log(state, '🟢 Споры: ' + roomName(state, id) + '.', 'event'); return true;
}
export function growGerminator(state, id, amount = 1) {
    const rs = room(state, id); if (!rs.chyGerm) return false;
    if (rs.chyGerm.level + amount > 3) return placeMycelium(state, id);
    rs.chyGerm.level += amount; return true;
}
/** The Queen token grows the leftmost available cube; at level 3 use the next one. */
export function growSupplyGerminator(state) {
    const slot = state.chyGermSlots.find(s => s.cube && s.cube.level < 3);
    if (!slot) return false;
    slot.cube.level++; return true;
}
export function damageGerminator(state, id, hits = 1) {
    const rs = room(state, id); if (!rs.chyGerm) return false;
    rs.chyGerm.level -= hits;
    if (rs.chyGerm.level <= 0) { returnGerminator(state, rs.chyGerm); rs.chyGerm = null; }
    return true;
}
/** Character spores replace larvae. A second spore kills and creates a growth at the corpse. */
export function giveChySpore(state, p) {
    if (!p || p.status !== 'active' || p.pod) return false;
    if (p.chySpore) { killPlayer(state, p, 'повторное заражение спорами'); placeGerminator(state, p.room); return true; }
    if (state.chySporesLeft <= 0) {
        const id = Object.keys(state.roomState).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).find(r => room(state, r).chySpore);
        if (!id) return false;
        clearChySpore(state, id); placeGerminator(state, id);
        if (state.chyOverrun || p.status !== 'active') return false;
    }
    p.chySpore = true; state.chySporesLeft--;
    log(state, pname(p) + ' получает фишку спор.', 'bad'); return true;
}
export function removeChySpore(state, p) {
    if (!p.chySpore) return false; p.chySpore = false; state.chySporesLeft++; return true;
}
/** Take Stinkhorns clockwise from the highest-numbered occupied Queen-board slot. */
export function spawnChytrid(state, type, id) {
    const rs = room(state, id);
    if (type === 'deathcap' || type === 'chyQueen') {
        if (!rs.chyGerm && !rs.chyMycelium) return null;
        if (type === 'chyQueen') {
            if (state.chyQueenDead) return null;
            const existing = Object.values(state.intruders).find(it => it.type === 'chyQueen');
            if (existing) { if (playersInRoom(state, existing.room).length) return null; existing.room = id; return existing; }
        }
        return spawnIntruder(state, type, id);
    }
    if (type !== 'stinkhorn') throw new RangeError('Unknown Chytrid type');
    let slot = state.chyQueenSlots.lastIndexOf(true);
    if (slot < 0) {
        for (const other of Object.values(state.intruders))
            if (other.type === 'stinkhorn' && !playersInRoom(state, other.room).length) returnStinkhornToQueen(state, other);
        slot = state.chyQueenSlots.lastIndexOf(true);
    }
    if (slot < 0) return null;
    const it = spawnIntruder(state, type, id);
    if (it) state.chyQueenSlots[slot] = false;
    return it;
}
export function returnStinkhornToQueen(state, it) {
    if (!it || it.type !== 'stinkhorn' || !state.intruders[it.uid]) return false;
    removeIntruder(state, it.uid, false);
    const slot = state.chyQueenSlots.indexOf(false); if (slot < 0) throw new Error('Queen board is full');
    state.chyQueenSlots[slot] = true;
    const idx = state.chytridAside.findIndex(t => t.type === 'stinkhorn');
    if (idx >= 0) state.bag.push(state.chytridAside.splice(idx, 1)[0]);
    return true;
}
export function killChytrid(state, it, { space = false } = {}) {
    if (!it || !state.intruders[it.uid]) return false;
    if (!['stinkhorn', 'deathcap', 'chyQueen'].includes(it.type)) return false;
    removeIntruder(state, it.uid, false);
    if (!space) { room(state, it.room).objects.push({ type: 'carcass' }); state.carcassCount = (state.carcassCount || 0) + 1; }
    if (it.type === 'stinkhorn') state.chyDeadStinkhorns++;
    if (it.type === 'chyQueen') state.chyQueenDead = true;
    return true;
}
/** Exploration and spread stop at closed doors, which break instead of transmitting a spore. */
export function transmitChySpore(state, from, number) {
    const exit = state.ship.rooms[from].exits.find(e => (e.nums || [e.num]).includes(number));
    if (!exit) return false; // Technical corridors do not receive spores.
    const corridor = state.ship.corridors[exit.corridor];
    if (corridor.door === 'closed') { corridor.door = 'destroyed'; return false; }
    return placeChySpore(state, exit.to);
}
/** Each symbol is resolved left-to-right. The current sources are snapshotted for that symbol. */
export function spreadChySpores(state, number) {
    const sources = Object.keys(state.roomState).filter(id => room(state, id).chyGerm || room(state, id).chyMycelium)
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    for (const id of sources) { if (state.chyOverrun) break; transmitChySpore(state, id, number); }
}
export function growChyColor(state, color, count = 1) {
    if (!['green', 'purple'].includes(color)) throw new RangeError('Unknown growth color');
    for (let i = 0; i < count; i++) {
        const ids = Object.keys(state.roomState).filter(id => room(state, id).chyGerm?.color === color)
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
        for (const id of ids) { if (state.chyOverrun) return; growGerminator(state, id); }
    }
}
/** Rules for movement of larger creatures apply both to events and retreats. */
export function moveLargeChytrid(state, it, to) {
    if (!it || !['deathcap', 'chyQueen'].includes(it.type) || !state.intruders[it.uid]) return false;
    const exit = state.ship.rooms[it.room].exits.find(e => e.to === to);
    if (!exit) return false;
    const corridor = state.ship.corridors[exit.corridor];
    if (corridor.door === 'closed') { corridor.door = 'destroyed'; return false; }
    const rs = room(state, to);
    if (!rs.chyGerm && !rs.chyMycelium) { placeChySpore(state, to); return false; }
    it.room = to; return true;
}
/** Fire in the event phase wounds figures and growths, and discards spores. */
export function burnChytrids(state) {
    for (const [id, rs] of Object.entries(state.roomState)) if (rs.fire) {
        clearChySpore(state, id); damageGerminator(state, id);
        for (const it of Object.values(state.intruders)) if (it.room === id && ['stinkhorn','deathcap','chyQueen'].includes(it.type)) it.hits++;
    }
}
/** One already-drawn token in the event phase; caller queues noise rolls for returned types. */
export function developChyBag(state, token) {
    const type = typeof token === 'string' ? token : token?.type;
    if (!['blank', 'stinkhorn', 'deathcap', 'chyQueen'].includes(type)) throw new RangeError('Unknown Chytrid bag token');
    state.bag.push(token);
    if (type === 'blank') {
        state.bag.push(...state.chytridAside.splice(0));
        if (state.chyDeadStinkhorns > 0) {
            const slot = state.chyQueenSlots.indexOf(false);
            if (slot < 0) throw new Error('Missing Queen board slot for revived Stinkhorn');
            state.chyQueenSlots[slot] = true; state.chyDeadStinkhorns--;
        }
        return { noise: false };
    }
    if (type === 'chyQueen') {
        const queen = Object.values(state.intruders).find(it => it.type === 'chyQueen');
        if (queen) {
            for (const exit of state.ship.rooms[queen.room].exits) { if (state.chyOverrun) break; placeGerminator(state, exit.to); }
        } else growSupplyGerminator(state);
        return { noise: false };
    }
    return { noise: true };
}
