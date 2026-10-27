// intruders.mjs — Intruder Phase (burning, attacks), intruder movement rules, bag development.

import { OPS, next, log, player, pname, intrudersIn, playersInRoom, room, roomName, tileOf, removeIntruder, spawnIntruder,
    INTRUDER_RANK, intruderLabel, orderIndex, drawBagToken } from './core.mjs';
import { distances, roomOfKind } from '../ship.mjs';
import { INTRUDER_NAMES } from '../data/cards.mjs';
import { countAvailable } from './movement.mjs';

OPS['phase.intruder'] = (state) => {
    state.phase = 'intruder';
    log(state, '— Фаза чужих —', 'phase');
    // 1. Burning
    for (const [id, rs] of Object.entries(state.roomState)) {
        if (!rs.fire) continue;
        for (const it of intrudersIn(state, id)) {
            if (it.type === 'larva') { log(state, 'Личинка сгорает в ' + roomName(state, id) + '.', 'good'); removeIntruder(state, it.uid, false); continue; }
            if (it.type === 'queen') { state.queenHits++; log(state, 'Королева получает ранение от огня (' + state.queenHits + ').', 'combat'); if (state.queenHits >= 6) next(state, { op: 'queen.card' }); continue; }
            it.hits++;
            log(state, INTRUDER_NAMES[it.type] + ' в ' + roomName(state, id) + ' получает ранение от огня (' + it.hits + ').', 'combat');
        }
        if (tileOf(state, id) === 'nest' && state.nestEggs > 0) { state.nestEggs--; log(state, 'Огонь в Гнезде уничтожает яйцо (осталось ' + state.nestEggs + ').', 'event'); checkNest(state); }
    }
    // 1b. Laika: an adult in the dog's room takes 1 hit and the dog returns to the hunter
    for (const p of state.players) {
        if (!p.laika || p.laika === 'board' || p.status !== 'active') continue;
        const a = intrudersIn(state, p.laika).find(i => i.type === 'adult');
        if (a) { a.hits++; log(state, '🐕 Лайка кусает взрослого в ' + roomName(state, p.laika) + ' (' + a.hits + ').', 'combat'); p.laika = 'board'; }
    }
    // 2. Attacks, rooms in id order, bigger intruders first
    const steps = [];
    for (const id of Object.keys(state.ship.rooms).sort()) {
        if (!playersInRoom(state, id).length) continue;
        const list = intrudersIn(state, id).sort((a, b) => INTRUDER_RANK[a.type] - INTRUDER_RANK[b.type]);
        for (const it of list) steps.push({ op: 'attack', intruder: it.uid, context: 'phase' });
    }
    if (steps.length) log(state, 'Чужие атакуют персонажей в своих комнатах.', 'combat');
    next(state, ...steps, { op: 'phase.event' });
};

export function checkNest(state) {
    if (state.nestEggs <= 0 && !state.nestDestroyed) { state.nestDestroyed = true; log(state, '🥚 Гнездо уничтожено!', 'event'); }
}

// ---------------------------------------------------------------------------------------------
// Movement helpers
// ---------------------------------------------------------------------------------------------
/** Move every intruder not in combat through the corridor with the given number. */
export function moveIntrudersByCorridor(state, num) {
    for (const it of Object.values(state.intruders)) {
        if (playersInRoom(state, it.room).length) continue;
        const r = state.ship.rooms[it.room];
        const exit = r.exits.find(e => (e.nums || [e.num]).includes(num));
        if (!exit) {
            if (r.tech && (r.techNums || []).includes(num)) {   // route into technical corridors: leaves the board
                log(state, INTRUDER_NAMES[it.type] + ' уходит в тех. коридоры из ' + roomName(state, it.room) + '.', 'event');
                removeIntruder(state, it.uid, false);
                state.bag.push(it.type);
            }
            continue;
        }
        const c = state.ship.corridors[exit.corridor];
        if (c.door === 'closed') { c.door = 'destroyed'; log(state, INTRUDER_NAMES[it.type] + ' ломает дверь ' + c.id + '.', 'event'); continue; }
        it.room = exit.to;
        log(state, INTRUDER_NAMES[it.type] + ' переходит по коридору ' + num + ' в ' + roomName(state, exit.to) + '.', 'event');
    }
}

/** Move every intruder not in combat one room toward the closest character. */
export function moveIntrudersToClosest(state) {
    const targets = state.players.filter(p => p.status === 'active' && !p.pod);
    if (!targets.length) return;
    for (const it of Object.values(state.intruders)) {
        if (playersInRoom(state, it.room).length) continue;
        moveOneToward(state, it, targets);
    }
}
export function moveOneToward(state, it, targets) {
    const dist = distances(state.ship, it.room);
    let best = null;
    for (const p of targets) {
        const d = dist[p.room];
        if (d === undefined) continue;
        if (!best || d < best.d || (d === best.d && (p.hand.length < best.p.hand.length || (p.hand.length === best.p.hand.length && orderIndex(state, p) < orderIndex(state, best.p))))) best = { p, d };
    }
    if (!best || best.d === 0) return;
    const fromTarget = distances(state.ship, best.p.room);
    const options = state.ship.rooms[it.room].exits.filter(e => fromTarget[e.to] === best.d - 1).sort((a, b) => a.to.localeCompare(b.to));
    if (!options.length) return;
    const e = options[0];
    const c = state.ship.corridors[e.corridor];
    if (c.door === 'closed') { c.door = 'destroyed'; log(state, INTRUDER_NAMES[it.type] + ' ломает дверь ' + c.id + '.', 'event'); return; }
    it.room = e.to;
    log(state, INTRUDER_NAMES[it.type] + ' движется к ' + pname(best.p) + ': ' + roomName(state, e.to) + '.', 'event');
}

/** Repel: move an intruder to a neighbouring room (chooser picks if several). */
export function repelIntruder(state, it, toRoom) {
    const exits = state.ship.rooms[it.room].exits;
    const e = toRoom ? exits.find(x => x.to === toRoom) : exits[0];
    if (!e) return false;
    const c = state.ship.corridors[e.corridor];
    if (c.door === 'closed') { c.door = 'destroyed'; log(state, 'Дверь ' + c.id + ' уничтожена при отступлении чужого.', 'event'); return false; }
    it.room = e.to;
    log(state, INTRUDER_NAMES[it.type] + ' отогнан в ' + roomName(state, e.to) + '.', 'good');
    return true;
}

// ---------------------------------------------------------------------------------------------
// Bag development
// ---------------------------------------------------------------------------------------------
export function bagDevelopment(state) {
    const token = drawBagToken(state);
    if (!token) { log(state, 'Развитие мешка: мешок пуст.', 'minor'); return; }
    log(state, '🎒 Развитие мешка: ' + INTRUDER_NAMES[token] + '.', 'event');
    const add = (type, n = 1) => { let k = 0; for (let i = 0; i < n; i++) if (countAvailable(state, type) > 0) { state.bag.push(type); k++; } if (k) log(state, 'В мешок добавлено: ' + INTRUDER_NAMES[type] + ' ×' + k + '.', 'event'); };
    if (!state.queenDead) {
        switch (token) {
            case 'queen': {
                const q = Object.values(state.intruders).find(i => i.type === 'queen');
                if (q) {
                    const ps = playersInRoom(state, q.room);
                    if (ps.length) next(state, { op: 'attack', intruder: q.uid, context: 'queen' });
                    else moveOneToward(state, q, state.players.filter(p => p.status === 'active' && !p.pod));
                } else {
                    add('larva');
                    const hiber = roomOfKind(state.ship, 'hibernatorium').id;
                    spawnIntruder(state, 'queen', hiber);
                }
                break;
            }
            case 'adult': case 'drone': add('queen'); break;
            case 'larva': add('drone'); break;
            case 'blank': add('adult', 2); state.bag.push('blank'); break;
        }
    } else {
        switch (token) {
            case 'queen': add('drone'); break;   // queen token leaves the game
            case 'adult': case 'drone': add('larva'); break;
            case 'larva': add('drone'); break;
            case 'blank': add('adult', 2); state.bag.push('blank'); break;
        }
    }
    // Drawn tokens (other than the Blank) go back to their pools, not into the bag.
}
