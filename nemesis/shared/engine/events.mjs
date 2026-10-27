// events.mjs — Event Phase (event card, intruder movement, effects, noise rolls, bag development)
// and Cleanup Phase (first player, draw up, time, self-destruct, end checks).

import { OPS, ask, next, log, player, pname, intrudersIn, playersInRoom, room, roomName, tileOf, placeFire, placeMalfunction,
    placeNoise, corridorsOf, spawnIntruder, removeIntruder, turnOrder, drawCards, drawLimit, gainContamination, inCombat,
    findRoomsByTile, HIBERNATION_TIME, SELF_DESTRUCT_LENGTH, destroyShip, discardCard, fx, cardDef } from './core.mjs';
import { shuffle } from '../rng.mjs';
import { EVENT_CARDS, INTRUDER_NAMES, ITEMS } from '../data/cards.mjs';
import { ROOM_TILES, roomOfKind } from '../ship.mjs';
import { moveIntrudersByCorridor, moveIntrudersToClosest, bagDevelopment, checkNest } from './intruders.mjs';
import { countAvailable } from './movement.mjs';
import { infectionProcedure, eclosionProcedure } from './actions.mjs';

const EVENT_BY_ID = Object.fromEntries(EVENT_CARDS.map(e => [e.id, e]));

OPS['phase.event'] = (state) => {
    state.phase = 'event';
    log(state, '— Фаза событий —', 'phase');
    if (!state.eventDeck.length) { state.eventDeck = shuffle(state, state.eventDiscard.splice(0)); }
    const id = state.eventDeck.shift();
    const ev = EVENT_BY_ID[id];
    state.lastEvent = id;
    fx(state, { type: 'event', card: id, name: ev.name, text: ev.text });
    log(state, '📜 Событие: «' + ev.name + '». ' + ev.text, 'event');
    // 1. movement
    let attacks = [];
    if (ev.move.type === 'corridor') attacks = moveIntrudersByCorridor(state, ev.move.num);
    else if (ev.move.type === 'closest') { attacks = moveIntrudersToClosest(state); if (id === 'onTheHunt') attacks = attacks.concat(moveIntrudersToClosest(state)); }
    // 2. effects
    next(state, ...attacks, { op: 'event.effect', id }, { op: 'event.noise', id }, { op: 'event.finish', id }, { op: 'phase.cleanup' });
};

OPS['event.effect'] = (state, step) => {
    const id = step.id;
    const allRooms = Object.keys(state.ship.rooms).sort();
    const roomsWithIcons = (color, n) => allRooms.filter(r => { const t = tileOf(state, r); return t && ROOM_TILES[t].items.filter(x => x === color).length >= n; });
    const neighborsNoDoor = (r) => state.ship.rooms[r].exits.filter(e => state.ship.corridors[e.corridor].door !== 'closed').map(e => e.to);
    switch (id) {
        case 'breakingIn':
            placeNoise(state, 'tech');
            for (const p of state.players) if (p.status === 'active' && !p.pod && state.ship.rooms[p.room].tech) for (const c of corridorsOf(state, p.room)) if (c.id !== 'tech') placeNoise(state, c.id);
            break;
        case 'bulkheadsOpen':
            for (const c of Object.values(state.ship.corridors)) if (c.door === 'closed') c.door = 'open';
            log(state, 'Все двери открыты.', 'event');
            break;
        case 'damage':
            for (const r of allRooms) if (intrudersIn(state, r).length) placeMalfunction(state, r, 'событие');
            break;
        case 'damagingFire': {
            const burning = allRooms.filter(r => room(state, r).fire);
            for (const r of burning) placeMalfunction(state, r, 'событие');
            for (const r of burning) for (const n of neighborsNoDoor(r)) placeFire(state, n, 'распространение');
            break;
        }
        case 'eggProtection': {
            const nest = findRoomsByTile(state, 'nest')[0];
            const steps = [];
            if (nest) { const d = spawnIntruder(state, 'drone', nest); if (d && playersInRoom(state, nest).length) steps.push({ op: 'attack', intruder: d.uid }); }
            for (const p of state.players) if (p.status === 'active' && p.heavy.some(h => h.type === 'egg') && p.room !== nest) { const d = spawnIntruder(state, 'drone', p.room); if (d) steps.push({ op: 'attack', intruder: d.uid, player: p.id }); }
            next(state, ...steps);
            break;
        }
        case 'podEjection': {
            const pod = state.pods.find(x => x.num === 1 && !x.removed && !x.launched);
            if (pod) { pod.removed = true; for (const pid of pod.occupants) { const o = state.players[pid]; o.pod = null; } pod.occupants = []; log(state, 'Капсула №1 отстрелена пустой.', 'event'); }
            else for (const t of ['evacA', 'evacB']) for (const r of findRoomsByTile(state, t)) placeMalfunction(state, r, 'событие');
            break;
        }
        case 'fireWave': {
            const burning = allRooms.filter(r => room(state, r).fire);
            if (burning.length) for (const n of neighborsNoDoor(burning[0])) placeFire(state, n, 'волна огня');
            break;
        }
        case 'flammable': {
            const h = roomOfKind(state.ship, 'hibernatorium').id;
            if (!room(state, h).fire) placeFire(state, h, 'событие');
            else for (const n of neighborsNoDoor(h)) placeFire(state, n, 'событие');
            break;
        }
        case 'generatorOverheats': {
            const gens = findRoomsByTile(state, 'generator');
            if (gens.length && room(state, gens[0]).malfunction) { startSelfDestruct(state); }
            else if (gens.length) placeMalfunction(state, gens[0], 'событие');
            break;
        }
        case 'hatching': {
            const nest = findRoomsByTile(state, 'nest')[0];
            if (state.nestEggs > 0) { state.nestEggs--; log(state, 'Яйцо в Гнезде вылупилось (осталось ' + state.nestEggs + ').', 'event'); checkNest(state); }
            let infected = false;
            if (nest) {
                const near = [nest, ...state.ship.rooms[nest].exits.map(e => e.to)];
                for (const p of state.players) if (p.status === 'active' && near.includes(p.room) && !p.hand.length && !p.larva) { p.larva = true; infected = true; log(state, pname(p) + ' заражён личинкой!', 'bad'); }
            }
            if (!infected && countAvailable(state, 'larva') > 0) { state.bag.push('larva'); log(state, 'Жетон личинки добавлен в мешок.', 'event'); }
            break;
        }
        case 'leavingShell': {
            const steps = [];
            for (const p of state.players) {
                if (p.status !== 'active') continue;
                if (p.larva) steps.push({ op: 'event.shell', player: p.id });
                else steps.push({ op: 'event.infect4', player: p.id });
            }
            next(state, ...steps);
            break;
        }
        case 'lifeSupport': for (const r of roomsWithIcons('green', 2)) placeMalfunction(state, r, 'событие'); break;
        case 'lurking':
            for (const it of Object.values(state.intruders)) if (!playersInRoom(state, it.room).length) { log(state, INTRUDER_NAMES[it.type] + ' прячется (в мешок).', 'event'); removeIntruder(state, it.uid, false); state.bag.push(it.type); }
            break;
        case 'malfunction': { const r = allRooms.find(r => !room(state, r).malfunction && tileOf(state, r) !== 'nest' && tileOf(state, r) !== 'contaminated'); if (r) placeMalfunction(state, r, 'событие'); break; }
        case 'onTheHunt': break;
        case 'protectAndServe': {
            const q = Object.values(state.intruders).find(i => i.type === 'queen');
            if (q) spawnIntruder(state, 'drone', q.room);
            else { let k = 0; for (let i = 0; i < 2; i++) if (countAvailable(state, 'drone') > 0) { state.bag.push('drone'); k++; } log(state, 'В мешок добавлено дронов: ' + k + '.', 'event'); }
            break;
        }
        case 'scentOfPrey':
            for (const p of state.players) if (p.status === 'active' && !p.pod && p.wounds.length) for (const c of corridorsOf(state, p.room)) placeNoise(state, c.id);
            break;
        case 'shortCircuit': for (const r of roomsWithIcons('yellow', 2)) placeMalfunction(state, r, 'событие'); break;
        case 'systemFailure': for (const r of roomsWithIcons('red', 2)) placeMalfunction(state, r, 'событие'); break;
        case 'queenAwakens': {
            let k = 0;
            if (!state.queenDead) { for (let i = 0; i < 3; i++) { state.bag.push('queen'); k++; } log(state, 'В мешок добавлено жетонов Королевы: ' + k + '.', 'event'); }
            else { for (let i = 0; i < 2; i++) if (countAvailable(state, 'drone') > 0) { state.bag.push('drone'); k++; } log(state, 'В мешок добавлено дронов: ' + k + '.', 'event'); }
            break;
        }
    }
};
OPS['event.shell'] = (state, step) => {
    const p = player(state, step.player);
    if (p.status !== 'active') return;
    gainContamination(state, p, 1);
    for (const c of [...p.hand]) discardCard(state, p, c);
    p.deck = shuffle(state, [...p.deck, ...p.discard.splice(0)]);
    eclosionProcedure(state, p);
};
OPS['event.infect4'] = (state, step) => {
    const p = player(state, step.player);
    if (p.status !== 'active') return;
    drawCards(state, p, 4, true);
    infectionProcedure(state, p);
    for (const c of [...p.hand]) discardCard(state, p, c);
    log(state, pname(p) + ' сбрасывает руку.', 'minor');
};

export function startSelfDestruct(state) {
    if (state.selfDestruct > 0) return;
    if (state.players.some(p => p.status === 'hibernating')) { log(state, 'Самоуничтожение невозможно: есть персонажи в гибернации.', 'minor'); return; }
    state.selfDestruct = 1;
    fx(state, { type: 'siren' });
    log(state, '☢ ЗАПУЩЕНО САМОУНИЧТОЖЕНИЕ! Отсчёт: ' + state.selfDestruct + '/' + SELF_DESTRUCT_LENGTH + '.', 'death');
}
export function stopSelfDestruct(state) {
    if (state.selfDestruct <= 0) return false;
    if (state.selfDestruct >= 4) { log(state, 'Самоуничтожение в жёлтой зоне — остановить нельзя.', 'bad'); return false; }
    state.selfDestruct = 0;
    log(state, 'Самоуничтожение остановлено.', 'good');
    return true;
}

OPS['event.noise'] = (state, step) => {
    const ev = EVENT_BY_ID[step.id];
    const steps = [];
    for (const p of turnOrder(state)) {
        if (p.status !== 'active' || p.pod) continue;
        const crowded = playersInRoom(state, p.room).length >= 3;
        if (inCombat(state, p) && !crowded) continue;
        let yes = false;
        if (ev.noise === 'all') yes = true;
        else if (ev.noise === 'noCards') yes = p.hand.length === 0;
        else if (ev.noise === 'fireMalf') { const rs = room(state, p.room); yes = rs.fire || rs.malfunction; }
        if (!yes) continue;
        const dev = p.items.find(i => ITEMS[i.item].perimeter && i.ammo > 0 && !i.broken);
        // Reactions that skip the roll: Risk Prevention (Field Data), Inconspicuous (Lab Rat), Perimeter device
        let chain = { op: 'noise.roll', player: p.id, room: p.room };
        if (dev) chain = { op: 'perimeter.ask', player: p.id, uid: dev.uid, then: chain };
        for (const c of p.hand.filter(c => ['fdRisk', 'inconspicuous'].includes((cardDef(state, c) || {}).effect))) chain = { op: 'risk.ask', player: p.id, card: c, then: chain };
        steps.push(chain);
    }
    // Laika on the main board rolls like a character; she counts as the player to the left of the Bounty Hunter
    for (const h of state.players) {
        if (!h.laika || h.laika === 'board' || h.status !== 'active') continue;
        const order = turnOrder(state);
        const left = order[(order.indexOf(h) + 1) % order.length] || h;
        if (intrudersIn(state, h.laika).length || playersInRoom(state, h.laika).length) continue;
        let yes = false;
        if (ev.noise === 'all') yes = true;
        else if (ev.noise === 'noCards') yes = left.hand.length === 0;
        else if (ev.noise === 'fireMalf') { const rs = room(state, h.laika); yes = rs.fire || rs.malfunction; }
        if (yes) steps.push({ op: 'noise.roll', player: left.status === 'active' ? left.id : h.id, room: h.laika, laika: true });
    }
    if (steps.length) { log(state, 'Броски шума по событию.', 'noise'); next(state, ...steps); }
};
OPS['risk.ask'] = (state, step) => {
    const p = player(state, step.player);
    const name = (cardDef(state, step.card) || {}).name || 'реакцию';
    if (step.answer === 'yes' && p.hand.includes(step.card)) { discardCard(state, p, step.card); log(state, pname(p) + ' играет «' + name + '»: броска шума нет.', 'good'); return; }
    if (step.answer) { next(state, step.then); return; }
    if (!p.hand.includes(step.card)) { next(state, step.then); return; }
    ask(state, { kind: 'choice', player: p.id, title: 'Сыграть «' + name + '», чтобы не бросать шум?', options: [{ id: 'yes', label: 'Да' }, { id: 'no', label: 'Нет' }] }, step);
};
OPS['perimeter.ask'] = (state, step) => {
    const p = player(state, step.player);
    const dev = p.items.find(i => i.uid === step.uid);
    if (step.answer === 'yes' && dev && dev.ammo > 0) { dev.ammo--; log(state, pname(p) + ': охранный периметр — броска шума нет (зарядов ' + dev.ammo + ').', 'good'); return; }
    if (step.answer) { next(state, step.then); return; }
    if (!dev || dev.ammo <= 0) { next(state, step.then); return; }
    ask(state, { kind: 'choice', player: p.id, title: 'Охранный периметр: потратить заряд, чтобы не бросать шум?', options: [{ id: 'yes', label: 'Да' }, { id: 'no', label: 'Нет' }] }, step);
};
OPS['event.finish'] = (state, step) => {
    const ev = EVENT_BY_ID[step.id];
    if (ev.reshuffle) { state.eventDeck.push(...state.eventDiscard.splice(0), step.id); shuffle(state, state.eventDeck); log(state, 'Колода событий перемешана.', 'minor'); }
    else state.eventDiscard.push(step.id);
    next(state, { op: 'bag.develop' });
};

// ---------------------------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------------------------
OPS['phase.cleanup'] = (state) => {
    state.phase = 'cleanup';
    log(state, '— Фаза уборки —', 'phase');
    const n = state.players.length;
    for (let k = 1; k <= n; k++) { const i = (state.firstPlayer + k) % n; if (state.players[i].status === 'active') { state.firstPlayer = i; break; } }
    log(state, 'Жетон первого игрока → ' + pname(state.players[state.firstPlayer]) + '.', 'info');
    for (const p of state.players) {
        if (p.status !== 'active') continue;
        let limit = drawLimit(p);
        if (tileOf(state, p.room) === 'cafeteria' && !room(state, p.room).malfunction && !inCombat(state, p)) limit++;
        const need = Math.max(0, limit - p.hand.length);
        if (need) drawCards(state, p, need);
    }
    state.time--;
    log(state, '⏱ Время: ' + state.time + (state.time <= HIBERNATION_TIME ? ' (гибернация доступна)' : '') + '.', 'info');
    if (state.selfDestruct > 0) {
        state.selfDestruct++;
        log(state, '☢ Самоуничтожение: ' + state.selfDestruct + '/' + SELF_DESTRUCT_LENGTH + '.', 'death');
        if (state.selfDestruct === 4 && !state.podsUnlocked) { state.podsUnlocked = true; for (const pod of state.pods) pod.locked = false; log(state, 'Жёлтая зона: капсулы разблокированы, отсчёт не остановить.', 'event'); }
        if (state.selfDestruct >= SELF_DESTRUCT_LENGTH) { destroyShip(state, 'самоуничтожение'); return; }
    }
    if (state.time <= 0) { log(state, 'Время вышло — корабль уходит в гиперпространство.', 'event'); next(state, { op: 'game.end' }); return; }
    if (!state.players.some(p => p.status === 'active')) {
        log(state, 'На борту не осталось активных персонажей.', 'event');
        if (state.selfDestruct > 0) { destroyShip(state, 'самоуничтожение без экипажа'); return; }
        state.time = 0;
        next(state, { op: 'game.end' }); return;
    }
    state.round++;
    next(state, { op: 'phase.player' });
};
