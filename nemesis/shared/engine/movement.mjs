// movement.mjs — Move / Careful Move, exploration, noise rolls and encounters.

import { OPS, ask, next, log, player, pname, intrudersIn, playersInRoom, room, roomName, tileOf, placeNoise, corridorsOf,
    NOISE_DIE, roll, fmtRoll, needDice, fx, drawBagToken, spawnIntruder, returnToken, placeFire, placeMalfunction, gainKnowledge,
    clearNoiseAround, HEAVY_NAMES } from './core.mjs';
import { ROOM_TILES } from '../ship.mjs';
import { INTRUDER_NAMES } from '../data/cards.mjs';

/**
 * move.start — options: careful, noAttacks (prevent all escape attacks), preventOne, noNoise,
 * filter: 'explored' | 'unexplored' | undefined, then: step to run after the move (default turn.choose),
 * companion: player id moved along.
 */
OPS['move.start'] = (state, step) => {
    const p = player(state, step.player);
    const dests = [];
    for (const e of state.ship.rooms[p.room].exits) {
        const c = state.ship.corridors[e.corridor];
        if (c.door === 'closed') continue;
        const explored = room(state, e.to).explored;
        if (step.filter === 'explored' && !explored) continue;
        if (step.filter === 'unexplored' && explored) continue;
        dests.push(e.to);
    }
    if (!dests.length) { log(state, pname(p) + ': некуда идти.', 'bad'); next(state, step.then || { op: 'turn.choose' }); return; }
    ask(state, { kind: 'room', player: p.id, title: step.careful ? 'Осторожное перемещение: куда?' : 'Перемещение: куда?', rooms: dests },
        { ...step, op: 'move.chosen' });
};

OPS['move.chosen'] = (state, step) => {
    const p = player(state, step.player);
    const dest = step.answer;
    const attackers = step.noAttacks ? [] : intrudersIn(state, p.room).map(i => i.uid);
    if (step.preventOne && attackers.length) attackers.shift();
    const go = { ...step, op: 'move.go', dest, answer: undefined };
    if (attackers.length) {
        log(state, pname(p) + ' пытается уйти из комнаты с чужими — атаки при бегстве.', 'combat');
        const steps = attackers.map(uid => ({ op: 'attack', intruder: uid, player: p.id, context: 'escape', moving: true, dest }));
        next(state, ...steps, { op: 'move.ifAlive', player: p.id, then: go });
    } else next(state, go);
};
OPS['move.ifAlive'] = (state, step) => {
    const p = player(state, step.player);
    if (p.status === 'active') next(state, step.then);
};

OPS['move.go'] = (state, step) => {
    const p = player(state, step.player);
    const from = p.room;
    p.room = step.dest;
    p.movedThisRound = true;
    log(state, pname(p) + ' переходит: ' + roomName(state, from) + ' → ' + roomName(state, step.dest) + '.', 'action');
    if (step.companion !== undefined) {
        const c = player(state, step.companion);
        if (c && c.status === 'active' && c.room === from) { c.room = step.dest; log(state, pname(c) + ' идёт вместе.', 'action'); }
    }
    const after = { op: 'move.afterExplore', player: p.id, from, careful: step.careful, noNoise: step.noNoise, then: step.then, enteredVia: from };
    if (!room(state, step.dest).explored) next(state, { op: 'explore', player: p.id, room: step.dest, from, ignoreToken: step.ignoreToken }, after);
    else next(state, after);
};

OPS['explore'] = (state, step) => {
    const rs = room(state, step.room);
    if (rs.explored) return;
    rs.explored = true;
    rs.tile = state.secret.tiles[step.room];
    fx(state, { type: 'explore', room: step.room, tile: rs.tile });
    const token = state.secret.tokens[step.room];
    rs.token = token;
    const p = step.player !== undefined ? player(state, step.player) : null;
    log(state, '🔎 Разведана комната ' + step.room + ': ' + ROOM_TILES[rs.tile].name + '.', 'event');
    if (rs.tile === 'nest' && !state.nestDiscovered) {
        state.nestDiscovered = true;
        if (p) { log(state, pname(p) + ' первым находит Гнездо: +1 знание.', 'good'); gainKnowledge(state, p, 1); }
    }
    if (step.ignoreToken && token) log(state, 'Жетон исследования проигнорирован (обход объекта).', 'minor');
    switch (step.ignoreToken ? null : token) {
        case 'malfunction': placeMalfunction(state, step.room, 'жетон разведки'); break;
        case 'fire': placeFire(state, step.room, 'жетон разведки'); break;
        case 'corpse': rs.objects.push({ type: 'corpse' }); log(state, 'В комнате найден человеческий труп.', 'event'); break;
        case 'door': {
            const c = step.from ? state.ship.corridors[[step.from, step.room].sort().join('-')] : null;
            if (c && c.door !== 'destroyed') { c.door = 'closed'; log(state, 'Дверь закрывается за спиной: коридор ' + c.id + '.', 'event'); }
            break;
        }
    }
    rs.token = null;
};

OPS['move.afterExplore'] = (state, step) => {
    const p = player(state, step.player);
    if (p.status !== 'active') return;
    const others = playersInRoom(state, p.room).filter(o => o.id !== p.id);
    const intr = intrudersIn(state, p.room);
    const then = step.then || { op: 'turn.choose' };
    if (step.noNoise || others.length || intr.length) {
        if (!step.noNoise) log(state, 'Комната занята — бросок шума не делается.', 'minor');
        next(state, then);
        return;
    }
    if (step.careful) {
        const cors = corridorsOf(state, p.room).filter(c => !(c.id === 'tech' ? state.ship.techNoise : state.ship.corridors[c.id].noise));
        if (!cors.length) { log(state, 'Все коридоры уже с шумом — обычный бросок шума.', 'minor'); next(state, { op: 'noise.roll', player: p.id, room: p.room }, then); return; }
        ask(state, { kind: 'choice', player: p.id, title: 'Осторожное перемещение: куда положить жетон шума?',
            options: cors.map(c => ({ id: c.id, label: c.id === 'tech' ? 'Тех. коридоры' : 'Коридор ' + c.num + ' → ' + roomName(state, c.to) })) },
            { op: 'noise.place', player: p.id, then });
        return;
    }
    next(state, { op: 'noise.roll', player: p.id, room: p.room }, then);
};
OPS['noise.place'] = (state, step) => {
    placeNoise(state, step.answer);
    log(state, 'Жетон шума положен: ' + (step.answer === 'tech' ? 'тех. коридоры' : step.answer) + '.', 'noise');
    next(state, step.then);
};

/** noise.roll { player, room } — the standard Noise roll in `room` for `player`. */
OPS['noise.roll'] = (state, step) => {
    const p = player(state, step.player);
    const roomId = step.room || p.room;
    if (needDice(state, step, 'noise', p.id, 'Бросок шума — ' + roomName(state, roomId))) return;
    const r = roll(state, NOISE_DIE);
    log(state, '🎲 Шум (' + pname(p) + ', ' + roomName(state, roomId) + '): ' + fmtRoll(r) + '.', 'noise');
    if (r === 'silence') return;
    if (r === 'encounter') { next(state, { op: 'encounter', room: roomId, player: p.id }); return; }
    if (r === 'danger') {
        let moved = 0;
        for (const e of state.ship.rooms[roomId].exits) {
            for (const it of intrudersIn(state, e.to)) {
                if (playersInRoom(state, e.to).length) continue;
                const c = state.ship.corridors[e.corridor];
                if (c.door === 'closed') { c.door = 'destroyed'; log(state, 'Чужой выламывает дверь ' + c.id + '.', 'event'); continue; }
                it.room = roomId; moved++;
                log(state, INTRUDER_NAMES[it.type] + ' врывается из ' + roomName(state, e.to) + '!', 'combat');
            }
        }
        if (!moved) {
            for (const c of corridorsOf(state, roomId)) placeNoise(state, c.id);
            log(state, 'Опасность: шум во всех коридорах вокруг.', 'noise');
        }
        return;
    }
    const exits = corridorsOf(state, roomId);
    const target = exits.find(c => c.num === r);
    if (!target) { log(state, 'Коридора ' + r + ' нет — тишина.', 'minor'); return; }
    if (!placeNoise(state, target.id)) {
        log(state, 'В коридоре ' + target.num + ' уже был шум — ВСТРЕЧА!', 'combat');
        next(state, { op: 'encounter', room: roomId, player: p.id });
    } else log(state, 'Шум в коридоре ' + target.num + ' (→ ' + roomName(state, target.to) + ').', 'noise');
};

/** encounter { room, player, noSurprise } */
OPS['encounter'] = (state, step) => {
    const roomId = step.room;
    clearNoiseAround(state, roomId);
    const token = drawBagToken(state);
    if (!token) { log(state, 'Мешок пуст — встречи нет.', 'minor'); return; }
    log(state, '👁 Встреча: из мешка — ' + INTRUDER_NAMES[token] + '.', 'combat');
    if (token === 'blank') {
        state.bag.push('blank');
        let added = 0;
        for (let i = 0; i < 2; i++) if (countAvailable(state, 'adult') > 0) { state.bag.push('adult'); added++; }
        log(state, 'Пустой жетон: в мешок добавлено ' + added + ' взрослых.', 'event');
        afterNoIntruder(state, roomId);
        return;
    }
    const it = spawnIntruder(state, token, roomId);
    if (!it) { afterNoIntruder(state, roomId); return; }
    if (token === 'queen' && !state.queenOnBoardOnce) state.queenOnBoardOnce = true;
    const p = step.player !== undefined ? player(state, step.player) : null;
    if (p && p.status === 'active' && p.room === roomId && !step.noSurprise) {
        const threshold = { larva: 1, adult: 3, drone: 4, queen: 5 }[token];
        const cards = p.hand.length;
        if (cards < threshold) {
            log(state, 'Внезапная атака! (карт в руке ' + cards + ' < ' + threshold + ')', 'combat');
            next(state, { op: 'attack', intruder: it.uid, player: p.id, context: 'surprise' });
        } else log(state, 'Внезапной атаки нет (карт в руке ' + cards + ' ≥ ' + threshold + ').', 'minor');
    }
};
function afterNoIntruder(state, roomId) {
    for (const c of corridorsOf(state, roomId)) placeNoise(state, c.id);
    log(state, 'Чужой не появился — шум во всех коридорах вокруг.', 'noise');
}
export function countAvailable(state, type) {
    const supply = { larva: 8, adult: 12, drone: 12, queen: 1 }[type];
    const inBag = state.bag.filter(t => t === type).length;
    const onBoard = Object.values(state.intruders).filter(i => i.type === type).length;
    return Math.max(0, supply - inBag - onBoard);
}

/** move.direct { player, dest, noNoise, then } — teleport-like moves (tech corridors, items). */
OPS['move.direct'] = (state, step) => {
    const p = player(state, step.player);
    const from = p.room;
    p.room = step.dest; p.movedThisRound = true;
    log(state, pname(p) + ' перемещается: ' + roomName(state, from) + ' → ' + roomName(state, step.dest) + '.', 'action');
    const after = { op: 'move.afterExplore', player: p.id, from, noNoise: step.noNoise, then: step.then };
    if (!room(state, step.dest).explored) next(state, { op: 'explore', player: p.id, room: step.dest, from: null }, after);
    else next(state, after);
};

export { HEAVY_NAMES, tileOf };
