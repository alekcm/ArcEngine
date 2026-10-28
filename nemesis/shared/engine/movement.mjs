// movement.mjs — Move / Careful Move, exploration, noise rolls and encounters.

import { payCost, OPS, ask, next, log, player, pname, intrudersIn, playersInRoom, room, roomName, tileOf, placeNoise, corridorsOf,
    NOISE_DIE, roll, fmtRoll, needDice, fx, drawBagToken, spawnIntruder, returnToken, placeFire, placeMalfunction, gainKnowledge,
    clearNoiseAround, HEAVY_NAMES, cardDef, discardCard, hasAdapt } from './core.mjs';
import { hyperAttackStep } from './intruders.mjs';
import { applyHitsNoRoll, resolveFollows } from './combat.mjs';
import { ROOM_TILES } from '../ship.mjs';
import { INTRUDER_NAMES, INTRUDER_TOKENS } from '../data/cards.mjs';

/**
 * move.start — options: careful, noAttacks (prevent all escape attacks), preventOne, noNoise,
 * filter: 'explored' | 'unexplored' | undefined, then: step to run after the move (default turn.choose),
 * companion: player id moved along.
 */
OPS['move.start'] = (state, step) => {
    const p = player(state, step.player);
    const dests = [];
    for (const e of state.ship.rooms[p.room].exits) {
        // A closed door does not lock a character in: they open it on the way through (move.go).
        // Doors exist to stop intruders — a crew member walking back into the room they just left
        // must not be told there is nowhere to go.
        const explored = room(state, e.to).explored;
        if (step.filter === 'explored' && !explored) continue;
        if (step.filter === 'unexplored' && explored) continue;
        // Careful Movement is impossible if every corridor of the destination already has Noise
        if (step.careful && !corridorsOf(state, e.to).some(c => !(c.id === 'tech' ? state.ship.techNoise : state.ship.corridors[c.id].noise))) continue;
        dests.push(e.to);
    }
    if (!dests.length) { log(state, pname(p) + ': некуда идти.', 'bad'); next(state, step.then || { op: 'turn.choose' }); return; }
    // A click on the board already names the destination: skip the question and pay.
    if (step.dest && dests.includes(step.dest)) { next(state, { ...step, op: 'move.chosen', answer: step.dest }); return; }
    ask(state, { kind: 'room', player: p.id, title: step.careful ? 'Осторожное перемещение: куда?' : 'Перемещение: куда?', rooms: dests },
        { ...step, op: 'move.chosen' });
};

OPS['move.chosen'] = (state, step) => {
    const p = player(state, step.player);
    const dest = step.answer;
    if (step.pay) { payCost(state, p, step.pay, { op: 'react.interrupt', player: p.id, label: step.careful ? 'осторожно перемещается' : 'перемещается', then: { ...step, pay: 0, answer: dest } }, step.careful ? 'Осторожное перемещение: оплата' : 'Перемещение: оплата'); return; }
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
    const exit = state.ship.rooms[from].exits.find(e => e.to === step.dest);
    const door = exit ? state.ship.corridors[exit.corridor] : null;
    p.room = step.dest;
    p.movedThisRound = true;
    log(state, pname(p) + ' переходит: ' + roomName(state, from) + ' → ' + roomName(state, step.dest) + '.', 'action');
    if (door && door.door === 'closed') { door.door = 'open'; log(state, pname(p) + ' открывает дверь ' + door.id + '.', 'action'); }
    resolveFollows(state);   // "Blood Sense": the intruder follows the character to the destination
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
    if (state.players.some(o => o.laika === p.room)) { log(state, '🐕 В комнате Лайка — бросок шума не делается.', 'minor'); next(state, then); return; }
    if (step.careful) {
        const cors = corridorsOf(state, p.room).filter(c => !(c.id === 'tech' ? state.ship.techNoise : state.ship.corridors[c.id].noise));
        if (!cors.length) { log(state, 'Все коридоры уже с шумом — обычный бросок шума.', 'minor'); next(state, { op: 'noise.roll', player: p.id, room: p.room }, then); return; }
        ask(state, { kind: 'choice', player: p.id, title: 'Осторожное перемещение: куда положить жетон шума?',
            options: cors.map(c => ({ id: c.id, label: c.id === 'tech' ? 'Тех. коридоры' : 'Коридор ' + c.nums.join('/') + ' → ' + roomName(state, c.to) })) },
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
    if (needDice(state, step, 'noise', p.id, 'Бросок шума — ' + (step.laika ? 'Лайка, ' : '') + roomName(state, roomId), { room: roomId })) return;
    const r = roll(state, NOISE_DIE);
    log(state, '🎲 Шум (' + (step.laika ? '🐕 Лайка' : pname(p)) + ', ' + roomName(state, roomId) + '): ' + fmtRoll(r) + '.', 'noise');
    if (r === 'silence') return;
    // «Встреча» here is the face of the noise die, not a noise token that landed on an occupied
    // corridor. Saying otherwise sent the table looking for a corridor with a token that never
    // existed — the reason printed under the bag must name the real cause.
    if (r === 'encounter') {
        next(state, { op: 'encounter', room: roomId, player: p.id, source: 'die',
            reason: 'Встреча: на кубе шума выпала грань «Встреча» — тянем жетон из мешка' });
        return;
    }
    if (r === 'danger') {
        const holder = playersInRoom(state, roomId).find(o => o.hand.some(c => (cardDef(state, c) || {}).effect === 'fdPredictable'));
        const incoming = [];
        for (const e of state.ship.rooms[roomId].exits) if (!playersInRoom(state, e.to).length && state.ship.corridors[e.corridor].door !== 'closed') incoming.push(...intrudersIn(state, e.to).map(i => i.uid));
        if (holder && incoming.length && !step.noPredict) {
            const card = holder.hand.find(c => (cardDef(state, c) || {}).effect === 'fdPredictable');
            ask(state, { kind: 'choice', player: holder.id, title: 'Опасность: чужие врываются. Сыграть «Предсказуемые движения» (не входят, каждый получает 1 ранение)?', options: [{ id: 'yes', label: 'Да' }, { id: 'no', label: 'Нет' }] },
                { op: 'predict.danger', player: holder.id, card, incoming, then: { ...step, noPredict: true, answer: undefined } });
            return;
        }
        let moved = 0;
        for (const e of state.ship.rooms[roomId].exits) {
            for (const it of intrudersIn(state, e.to)) {
                if (playersInRoom(state, e.to).length) continue;
                const c = state.ship.corridors[e.corridor];
                if (c.door === 'closed') { c.door = 'destroyed'; moved++; log(state, 'Чужой выламывает дверь ' + c.id + '.', 'event'); continue; }
                it.room = roomId; moved++;
                log(state, INTRUDER_NAMES[it.type] + ' врывается из ' + roomName(state, e.to) + '!', 'combat');
                const h = hyperAttackStep(state, it); if (h) next(state, h);
            }
        }
        if (!moved) {
            for (const c of corridorsOf(state, roomId)) placeNoise(state, c.id);
            log(state, 'Опасность: шум во всех коридорах вокруг.', 'noise');
        }
        return;
    }
    const exits = corridorsOf(state, roomId);
    const target = exits.find(c => c.nums.includes(r));
    if (!target) { log(state, 'Коридора ' + r + ' нет — тишина.', 'minor'); return; }
    const label = target.id === 'tech' ? 'технических коридорах' : 'коридоре ' + target.nums.join('/') + ' (→ ' + roomName(state, target.to) + ')';
    if (!placeNoise(state, target.id)) {
        log(state, 'В ' + label + ' уже был шум — ВСТРЕЧА!', 'combat');
        next(state, { op: 'encounter', room: roomId, player: p.id, reason: 'Встреча: шум в коридоре, где уже был жетон шума' });
    } else log(state, 'Шум в ' + label + '.', 'noise');
};

/** encounter { room, player, noSurprise } */
OPS['predict.danger'] = (state, step) => {
    const p = player(state, step.player);
    if (step.answer === 'yes' && p.hand.includes(step.card)) {
        discardCard(state, p, step.card);
        for (const uid of step.incoming) { const it = state.intruders[uid]; if (it) applyHitsNoRoll(state, it, 1); }
        log(state, pname(p) + ' играет «Предсказуемые движения»: чужие не входят.', 'good');
        return;
    }
    state.pendingRoll = { die: 'noise', value: 'danger' };
    next(state, step.then);
};
OPS['encounter'] = (state, step) => {
    const roomId = step.room;
    clearNoiseAround(state, roomId);
    // The token is pulled out of the bag by the player themselves (table flow, state.ui.bagClick).
    if (step.token === undefined) {
        // The reason is printed under the bag: it tells the player why the token is being drawn.
        const reason = step.reason || ('Встреча в комнате ' + roomName(state, roomId) + ': проверяем, кто пришёл');
        next(state, { op: 'bag.ask', player: step.player, reason,
            then: { op: 'encounter', room: roomId, player: step.player, reason, noSurprise: step.noSurprise } });
        return;
    }
    const token = step.token;
    if (!token) { log(state, 'Мешок пуст — встречи нет.', 'minor'); return; }
    if (state.bagLast) state.bagLast.effect = token === 'blank' ? 'Пустой жетон — чужой не появляется.' : 'Появляется «' + INTRUDER_NAMES[token] + '».';
    log(state, '👁 Встреча: из мешка — ' + INTRUDER_NAMES[token] + '.', 'combat');
    // Reaction: Field Experience (Xenobiologist) — return the token to the bag and draw another
    if (!step.noFE && fieldExpAsk(state, token, { ...step, op: 'encounter' })) return;
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
    // Reaction: Predictable Movements — the placed intruder takes 1 hit
    const holder = playersInRoom(state, roomId).find(o => o.hand.some(c => (cardDef(state, c) || {}).effect === 'fdPredictable'));
    if (holder && !step.noPredict) {
        const card = holder.hand.find(c => (cardDef(state, c) || {}).effect === 'fdPredictable');
        ask(state, { kind: 'choice', player: holder.id, title: 'Сыграть «Предсказуемые движения»: ' + INTRUDER_NAMES[token] + ' получает 1 ранение?', options: [{ id: 'yes', label: 'Да' }, { id: 'no', label: 'Нет' }] },
            { op: 'predict.spawn', player: holder.id, card, intruder: it.uid, then: { ...step, op: 'encounter.surprise', intruder: it.uid, token } });
        return;
    }
    next(state, { ...step, op: 'encounter.surprise', intruder: it.uid, token });
};
OPS['predict.spawn'] = (state, step) => {
    const p = player(state, step.player);
    if (step.answer === 'yes' && p.hand.includes(step.card)) { discardCard(state, p, step.card); const it = state.intruders[step.intruder]; if (it) applyHitsNoRoll(state, it, 1); }
    next(state, step.then);
};
OPS['encounter.surprise'] = (state, step) => {
    const roomId = step.room, token = step.token, it = state.intruders[step.intruder];
    if (!it) return;
    const p = step.player !== undefined ? player(state, step.player) : null;
    if (p && p.status === 'active' && p.room === roomId && !step.noSurprise) {
        const threshold = { larva: 1, adult: 3, drone: 4, queen: 5 }[token] + (hasAdapt(state, 'swiftStrikes') && token !== 'larva' ? 1 : 0);
        const cards = p.hand.length;
        if (cards < threshold) {
            log(state, 'Внезапная атака! (карт в руке ' + cards + ' < ' + threshold + ')', 'combat');
            next(state, { op: 'attack', intruder: it.uid, player: p.id, context: 'surprise' });
        } else log(state, 'Внезапной атаки нет (карт в руке ' + cards + ' ≥ ' + threshold + ').', 'minor');
    }
};
/** If the Xenobiologist holds "Field Experience" and has a Tissue sample, offer to redraw the token. `resume` is re-run with token/noFE. */
export function fieldExpAsk(state, token, resume) {
    const x = state.players.find(o => o.status === 'active' && o.tissue > 0 && o.hand.some(c => (cardDef(state, c) || {}).reactionToo === 'fieldExpReaction'));
    if (!x) return false;
    const card = x.hand.find(c => (cardDef(state, c) || {}).reactionToo === 'fieldExpReaction');
    ask(state, { kind: 'choice', player: x.id, title: 'Из мешка вытянут жетон «' + INTRUDER_NAMES[token] + '». Сыграть «Полевой опыт» (−1 образец ткани): вернуть жетон и вытянуть другой?', options: [{ id: 'yes', label: 'Да' }, { id: 'no', label: 'Нет' }] },
        { op: 'fieldExp.answer', player: x.id, card, token, resume });
    return true;
}
OPS['fieldExp.answer'] = (state, step) => {
    const x = player(state, step.player);
    if (step.answer === 'yes' && x.hand.includes(step.card) && x.tissue > 0) {
        discardCard(state, x, step.card); x.tissue--;
        state.bag.push(step.token);
        const t = drawBagToken(state);
        log(state, '🧪 ' + pname(x) + ' играет «Полевой опыт»: жетон «' + INTRUDER_NAMES[step.token] + '» возвращён в мешок, новый жетон — ' + (t ? INTRUDER_NAMES[t] : 'нет') + '.', 'good');
        next(state, { ...step.resume, token: t, noFE: false, answer: undefined });
        return;
    }
    next(state, { ...step.resume, token: step.token, noFE: true, answer: undefined });
};
function afterNoIntruder(state, roomId) {
    for (const c of corridorsOf(state, roomId)) placeNoise(state, c.id);
    log(state, 'Чужой не появился — шум во всех коридорах вокруг.', 'noise');
}
export function countAvailable(state, type) {
    // Token pools (8.2) are separate from the miniature limits (8.3): a drawn token returns to its
    // pool even while its miniature stays on the board, so only tokens in the bag count here.
    const supply = INTRUDER_TOKENS[type];
    const inBag = state.bag.filter(t => t === type).length;
    return Math.max(0, supply - inBag);
}

/** move.direct { player, dest, noNoise, then } — teleport-like moves (tech corridors, items). */
OPS['move.direct'] = (state, step) => {
    const p = player(state, step.player);
    const from = p.room;
    p.room = step.dest; p.movedThisRound = true;
    log(state, pname(p) + ' перемещается: ' + roomName(state, from) + ' → ' + roomName(state, step.dest) + '.', 'action');
    resolveFollows(state);
    const after = { op: 'move.afterExplore', player: p.id, from, noNoise: step.noNoise, then: step.then };
    if (!room(state, step.dest).explored) next(state, { op: 'explore', player: p.id, room: step.dest, from: null }, after);
    else next(state, after);
};

export { HEAVY_NAMES, tileOf };
