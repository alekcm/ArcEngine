// Queue adapters for the Voidseeder round. The public createGame guard remains closed.
import { OPS, ask, next, log, player, pname, playersInRoom, intrudersIn, room, roomName, corridorsOf,
    placeNoise, cardDef, gainContamination, turnOrder, HIBERNATION_TIME, SELF_DESTRUCT_LENGTH, destroyShip, tileOf } from './core.mjs';
import { VOID_TYPES } from '../data/voidseeders.mjs';
import { INTRUDER_NAMES } from '../data/cards.mjs';
import { spawnVoid, encounterVoidType, returnVoidTokenToSupply, hasVoidWeakness, voidPowerCheck, dissipateVoid } from './voidseeders.mjs';
import { addVoidToken } from './void-bag.mjs';
import './void-panic.mjs';

function noiseAround(state, roomId) { for (const c of corridorsOf(state, roomId)) placeNoise(state, c.id); }
OPS['void.encounter'] = (state, step) => {
    const p = player(state, step.player), token = step.token;
    if (!token) { log(state, 'Мешок кошмаров пуст.', 'minor'); return; }
    if (token === 'blank' || token.madness !== undefined) {
        state.bag.push(token); noiseAround(state, step.room);
        if (state.bagLast) state.bagLast.effect = token === 'blank' ? 'Пустой жетон: шум во всех коридорах.' : 'Жетон безумия: шум во всех коридорах и паника вызвавшего встречу.';
        if (token !== 'blank' && p && p.status === 'active' && p.room === step.room) next(state, { op: 'void.panic', player: p.id });
        return;
    }
    if (token.value === undefined || !token.id) throw new Error('Invalid Nightmare token');
    returnVoidTokenToSupply(state, token);
    if (!p || p.status !== 'active' || p.room !== step.room) return;
    const requested = encounterVoidType(state, p), it = spawnVoid(state, requested, step.room, true);
    if (!it) { log(state, 'Нет доступных фигурок кошмаров для столкновения.', 'minor'); return; }
    if (state.bagLast) state.bagLast.effect = 'Появляется ' + INTRUDER_NAMES[it.type] + ', значение жетона ' + token.value + '.';
    const then = { ...step, op: 'void.encounterSurprise', intruder: it.uid };
    const holder = playersInRoom(state, step.room).find(o => o.hand.some(c => (cardDef(state, c) || {}).effect === 'fdPredictable'));
    if (holder && !step.noPredict) {
        const card = holder.hand.find(c => (cardDef(state, c) || {}).effect === 'fdPredictable');
        ask(state, { kind: 'choice', player: holder.id, title: 'Сыграть «Предсказуемые движения»: ' + INTRUDER_NAMES[it.type] + ' получает 1 ранение?',
            options: [{ id: 'yes', label: 'Да' }, { id: 'no', label: 'Нет' }] },
            { op: 'predict.spawn', player: holder.id, card, intruder: it.uid, then });
        return;
    }
    next(state, then);
};
OPS['void.encounterSurprise'] = (state, step) => {
    const p = player(state, step.player), it = state.intruders[step.intruder];
    if (!p || p.status !== 'active' || p.room !== step.room || !it || it.room !== step.room || step.noSurprise) return;
    const value = Math.max(1, step.token.value - (hasVoidWeakness(state, 'dangerReaction') ? 1 : 0));
    if (p.hand.length < value) {
        log(state, 'Внезапная атака кошмара: карт ' + p.hand.length + ' < ' + value + '.', 'combat');
        next(state, { op: 'attack', intruder: it.uid, player: p.id, context: 'surprise' });
    }
};
OPS['void.surprise'] = (state, step) => {
    const p = player(state, step.player);
    if (!p || p.status !== 'active') return;
    if (!hasVoidWeakness(state, 'rationalThinking')) gainContamination(state, p, 1);
    if (p.status === 'active') next(state, { op: 'void.panic', player: p.id });
};
OPS['void.bagDevelop'] = (state, step) => {
    const t = step.token;
    if (!t) { log(state, 'Мешок кошмаров пуст.', 'minor'); return; }
    if (t === 'blank') {
        addVoidToken(state); state.bag.push(t);
        if (state.bagLast) state.bagLast.effect = 'Пустой жетон возвращён; случайный жетон кошмара добавлен из запаса, если доступен.';
        return;
    }
    if (t.madness !== undefined) {
        const p = player(state, t.madness);
        if (!p || p.status !== 'active' || p.pod) {
            if (state.bagLast) state.bagLast.effect = 'Жетон выбывшего персонажа удалён; вытяните другой.';
            if (state.bag.length) next(state, { op: 'bag.develop' });
            return;
        }
        state.bag.push(t);
        if (state.bagLast) state.bagLast.effect = 'Паника персонажа ' + p.name + '; жетон возвращён.';
        next(state, { op: 'void.panic', player: p.id });
        return;
    }
    if (!t.id || t.value === undefined) throw new Error('Invalid Nightmare token');
    state.bag.push(t);
    if (state.bagLast) state.bagLast.effect = 'Жетон возвращён; персонажи вне боя бросают шум.';
    const steps = turnOrder(state).filter(p => p.status === 'active' && !p.pod && !intrudersIn(state, p.room).length)
        .map(p => ({ op: 'noise.roll', player: p.id, room: p.room }));
    next(state, ...steps);
};

/** Time first, then each nightmare attacks, then fire, then event. Lairs do not attack. */
OPS['void.phaseStart'] = (state) => {
    state.time--;
    log(state, '⏱ Время: ' + state.time + (state.time <= HIBERNATION_TIME ? ' (гибернация доступна)' : '') + '.', 'info');
    if (state.selfDestruct > 0) {
        state.selfDestruct++;
        log(state, '☢ Самоуничтожение: ' + state.selfDestruct + '/' + SELF_DESTRUCT_LENGTH + '.', 'death');
        if (state.selfDestruct === 4 && !state.podsUnlocked) {
            state.podsUnlocked = true; for (const pod of state.pods) pod.locked = false;
            log(state, 'Жёлтая зона: капсулы разблокированы.', 'event');
        }
        if (state.selfDestruct >= SELF_DESTRUCT_LENGTH) { destroyShip(state, 'самоуничтожение'); return; }
    }
    if (state.time <= 0) { log(state, 'Время вышло — корабль уходит в гиперпространство.', 'event'); next(state, { op: 'game.end' }); return; }
    const rank = { despoiler: 0, creeper: 1, whisperer: 2, lurker: 3 };
    const ids = Object.keys(state.ship.rooms).sort((a, b) => state.ship.rooms[a].y - state.ship.rooms[b].y || state.ship.rooms[a].x - state.ship.rooms[b].x || a.localeCompare(b));
    const attacks = ids.flatMap(id => playersInRoom(state, id).length ? intrudersIn(state, id).filter(it => VOID_TYPES.includes(it.type))
        .sort((a, b) => rank[a.type] - rank[b.type]).map(it => ({ op: 'attack', intruder: it.uid, context: 'phase' })) : []);
    next(state, ...attacks, { op: 'void.phaseFire' }, { op: 'phase.event' });
};
OPS['void.phaseFire'] = (state) => {
    for (const [id, rs] of Object.entries(state.roomState)) {
        if (!rs.fire) continue;
        for (const it of [...intrudersIn(state, id)]) if (state.intruders[it.uid] && (VOID_TYPES.includes(it.type) || it.type === 'lair')) voidPowerCheck(state, it, 1);
        if (tileOf(state, id) === 'nest' && state.nestEggs > 0) {
            state.nestEggs--;
            if (!state.nestEggs && !state.nestDestroyed) { state.nestDestroyed = true; log(state, '🥚 Гнездо уничтожено!', 'event'); }
        }
    }
};
OPS['void.dissipate'] = (state) => { dissipateVoid(state); next(state, { op: 'bag.develop' }); };
