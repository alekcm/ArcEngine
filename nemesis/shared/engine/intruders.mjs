// intruders.mjs — Intruder Phase (burning, attacks), intruder movement rules, bag development.

import { OPS, next, log, player, pname, intrudersIn, playersInRoom, room, roomName, tileOf, removeIntruder, spawnIntruder,
    INTRUDER_RANK, intruderLabel, orderIndex, drawBagToken, hasAdapt } from './core.mjs';
import { distances, roomOfKind } from '../ship.mjs';
import { INTRUDER_NAMES } from '../data/cards.mjs';
import { countAvailable, fieldExpAsk } from './movement.mjs';

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
    // 2. Attacks: rooms top-to-bottom as printed on the board; bigger intruders first.
    const steps = [];
    const byPosition = (a, b) => (state.ship.rooms[a].y - state.ship.rooms[b].y) || (state.ship.rooms[a].x - state.ship.rooms[b].x) || a.localeCompare(b);
    for (const id of Object.keys(state.ship.rooms).sort(byPosition)) {
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
    const attacks = [];
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
        const h = hyperAttackStep(state, it); if (h) attacks.push(h);
    }
    return attacks;
}

/** Move every intruder not in combat one room toward the closest character. */
export function moveIntrudersToClosest(state) {
    const targets = state.players.filter(p => p.status === 'active' && !p.pod);
    const attacks = [];
    if (!targets.length) return attacks;
    for (const it of Object.values(state.intruders)) {
        if (playersInRoom(state, it.room).length) continue;
        if (moveOneToward(state, it, targets)) { const h = hyperAttackStep(state, it); if (h) attacks.push(h); }
    }
    return attacks;
}
export function moveOneToward(state, it, targets) {
    const dist = distances(state.ship, it.room);
    let best = null;
    for (const p of targets) {
        const d = dist[p.room];
        if (d === undefined) continue;
        // Printed tie-break: lowest number of ACTION cards in hand, then turn order.
        // Contamination is a card in hand, but it is not an Action card.
        const act = q => q.hand.filter(c => !String(c).startsWith('contam#')).length;
        if (!best || d < best.d || (d === best.d && (act(p) < act(best.p) || (act(p) === act(best.p) && orderIndex(state, p) < orderIndex(state, best.p))))) best = { p, d };
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
    return true;
}

/** Repel: move an intruder to a neighbouring room (chooser picks if several). */
export function repelIntruder(state, it, toRoom, force) {
    if (hasAdapt(state, 'fearless') && !force) { log(state, '🧬 Бесстрашие: ' + INTRUDER_NAMES[it.type] + ' нельзя отогнать.', 'bad'); return false; }
    const exits = state.ship.rooms[it.room].exits;
    const e = toRoom ? exits.find(x => x.to === toRoom) : exits[0];
    if (!e) return false;
    const c = state.ship.corridors[e.corridor];
    if (c.door === 'closed') { c.door = 'destroyed'; log(state, 'Дверь ' + c.id + ' уничтожена при отступлении чужого.', 'event'); return false; }
    it.room = e.to;
    log(state, INTRUDER_NAMES[it.type] + ' отогнан в ' + roomName(state, e.to) + '.', 'good');
    const h = hyperAttackStep(state, it); if (h) next(state, h);
    return true;
}
/** Hyper Aggression adaptation: an intruder entering a room with characters attacks at once. Returns the attack step or null. */
export function hyperAttackStep(state, it) {
    if (!hasAdapt(state, 'hyperAggression') || !state.intruders[it.uid] || it.type === 'larva') return null;
    if (!playersInRoom(state, it.room).length) return null;
    log(state, '🧬 Гиперагрессия: ' + INTRUDER_NAMES[it.type] + ' немедленно атакует в ' + roomName(state, it.room) + '!', 'combat');
    return { op: 'attack', intruder: it.uid, context: 'hyper' };
}

// ---------------------------------------------------------------------------------------------
// Bag development
// ---------------------------------------------------------------------------------------------
OPS['bag.develop'] = (state, step) => {
    // The first player pulls the token out of the bag themselves (table flow, state.ui.bagClick).
    if (step.token === undefined) {
        const reason = step.reason || 'Развитие мешка — конец фазы событий';
        next(state, { op: 'bag.ask', player: state.firstPlayer, reason, then: { op: 'bag.develop', reason } });
        return;
    }
    const token = step.token;
    if (!token) { log(state, 'Развитие мешка: мешок пуст.', 'minor'); return; }
    log(state, '🎒 Развитие мешка: ' + INTRUDER_NAMES[token] + '.', 'event');
    if (!step.noFE && fieldExpAsk(state, token, { op: 'bag.develop' })) return;
    bagDevelopment(state, token);
};
export function bagDevelopment(state, token) {
    const added = [], notes = [];
    const add = (type, n = 1) => { let k = 0; for (let i = 0; i < n; i++) if (countAvailable(state, type) > 0) { state.bag.push(type); k++; } if (k) { added.push(INTRUDER_NAMES[type] + ' ×' + k); log(state, 'В мешок добавлено: ' + INTRUDER_NAMES[type] + ' ×' + k + '.', 'event'); } };
    if (!state.queenDead) {
        switch (token) {
            case 'queen': {
                const q = Object.values(state.intruders).find(i => i.type === 'queen');
                if (q) {
                    const ps = playersInRoom(state, q.room);
                    if (ps.length) { next(state, { op: 'attack', intruder: q.uid, context: 'queen' }); notes.push('Королева атакует в ' + roomName(state, q.room) + '.'); }
                    else if (moveOneToward(state, q, state.players.filter(p => p.status === 'active' && !p.pod))) { notes.push('Королева идёт к ближайшему персонажу.'); const h = hyperAttackStep(state, q); if (h) next(state, h); }
                } else {
                    add('larva');
                    const hiber = roomOfKind(state.ship, 'hibernatorium').id;
                    spawnIntruder(state, 'queen', hiber);
                    notes.push('Королева выставлена в Гибернатории.');
                }
                break;
            }
            case 'adult': case 'drone': add('queen'); break;
            case 'larva': add('drone'); break;
            case 'blank': add('adult', 2); state.bag.push('blank'); break;
        }
    } else {
        switch (token) {
            case 'queen': add('drone'); notes.push('Королева мертва — жетон уходит из игры.'); break;
            case 'adult': case 'drone': add('larva'); break;
            case 'larva': add('drone'); break;
            case 'blank': add('adult', 2); state.bag.push('blank'); break;
        }
        if (token === 'queen') { /* nothing else */ }
    }
    // Drawn tokens (other than the Blank) go back to their pools, not into the bag.
    if (state.bagLast) {
        const parts = [];
        if (added.length) parts.push('в мешок: ' + added.join(', '));
        if (notes.length) parts.push(notes.join(' '));
        state.bagLast.effect = parts.length ? parts.join('; ') + '.' : 'Эффекта нет.';
    }
}
