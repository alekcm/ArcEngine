import { transmitChySpore, placeMycelium, hasChyWeakness, moveLargeChytrid } from './chytrids.mjs';
import { bagTokenLabel } from '../bag-tokens.mjs';
import { hasCarnomorphAdaptation } from './carnomorphs.mjs';
// movement.mjs — Move / Careful Move, exploration, noise rolls and encounters.

import { payCost, OPS, ask, next, log, player, pname, intrudersIn, playersInRoom, room, roomName, tileOf, placeNoise, corridorsOf,
    NOISE_DIE, NOISE_DIE_SAFE, noiseDieFor, isOriginal, roll, fmtRoll, needDice, fx, drawBagToken, spawnIntruder, returnToken, placeFire, placeMalfunction, gainKnowledge,
    clearNoiseAround, HEAVY_NAMES, cardDef, discardCard, hasAdapt, hasWeak, canDestroyDoor, inCombat, isContam, giveSlime, recordTurretEntry } from './core.mjs';
import { hyperAttackStep, ignoresIntruderDoor } from './intruders.mjs';
import { applyHitsNoRoll, resolveFollows } from './combat.mjs';
import { surpriseAttack, encounterLine } from './surprise.mjs';
import { spawnVoid } from './voidseeders.mjs';
import { ROOM_TILES } from '../ship.mjs';
import { INTRUDER_NAMES, INTRUDER_TOKENS, ORIGINAL_INTRUDER_TOKENS } from '../data/cards.mjs';
import { placeTurret, turretOnCharacterEntry, turretOnIntruderEntry } from './turrets.mjs';

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
        // Careful Movement is impossible if every corridor of the destination already has Noise:
        // there would be nowhere to put the token (rulebook p. 5). A single free corridor is enough —
        // and the crew may still pick a corridor that already carries a token (see noise.place).
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
    // checkLaika recalls her after the Hunter arrives, before the noise decision.
    const laikaOnArrival = state.players.some(o => o.status === 'active' && !o.pod && o.laika === step.dest);
    const exit = state.ship.rooms[from].exits.find(e => e.to === step.dest);
    const door = exit ? state.ship.corridors[exit.corridor] : null;
    p.room = step.dest;
    p.movedThisRound = true;
    log(state, pname(p) + ' переходит: ' + roomName(state, from) + ' → ' + roomName(state, step.dest) + '.', 'action');
    if (door && door.door === 'closed' && !step.preserveDoor) { door.door = 'open'; log(state, pname(p) + ' открывает дверь ' + door.id + '.', 'action'); }
    resolveFollows(state);   // "Blood Sense": the intruder follows the character to the destination
    if (step.companion !== undefined) {
        const c = player(state, step.companion);
        if (c && c.status === 'active' && c.room === from) { c.room = step.dest; recordTurretEntry(state, 'character', c.id, step.dest); log(state, pname(c) + ' идёт вместе.', 'action'); }
    }
    const after = { op: 'move.afterExplore', player: p.id, from, careful: step.careful, noNoise: step.noNoise, laikaOnArrival, then: step.then, enteredVia: from };
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
    if (token && typeof token === 'object' && rs.tile !== 'nest' && rs.tile !== 'contaminated') {
        rs.itemsLeft = token.items;
    }
    log(state, '🔎 Разведана комната ' + step.room + ': ' + ROOM_TILES[rs.tile].name + (typeof rs.itemsLeft === 'number' ? ' (предметов: ' + rs.itemsLeft + ')' : '') + '.', 'event');
    if (state.enemySet === 'chytrids' && token) {
        const n = state.secret.chyExploreNumbers[step.room];
        if (n != null) { log(state, 'Жетон исследования хитридов: коридор ' + n + '.', 'event'); transmitChySpore(state, step.room, n); }
    }
    if (rs.tile === 'nest' && state.enemySet === 'chytrids') placeMycelium(state, step.room);
    if (rs.tile === 'nest' && !state.nestDiscovered) {
        state.nestDiscovered = true;
        if (p && !isOriginal(state)) { log(state, pname(p) + ' первым находит Гнездо: +1 знание.', 'good'); gainKnowledge(state, p, 1); }
    }
    const tokEffect = token && typeof token === 'object' ? token.effect : token;
    if (step.ignoreToken && tokEffect) log(state, 'Жетон исследования проигнорирован (обход объекта).', 'minor');
    switch (step.ignoreToken ? null : tokEffect) {
        case 'lair': if (state.enemySet === 'voidseeders') spawnVoid(state, 'lair', step.room); break;
        case 'malfunction': placeMalfunction(state, step.room, 'жетон разведки'); break;
        case 'fire': placeFire(state, step.room, 'жетон разведки'); break;
        case 'corpse': rs.objects.push({ type: 'corpse' }); log(state, 'В комнате найден человеческий труп.', 'event'); break;
        case 'turret': placeTurret(state, step.room); break;
        case 'slime': if (p) giveSlime(state, p); break;
        case 'silence':
            rs.skipMoveNoise = true;
            if (p && p.slime && isOriginal(state) && state.enemySet === 'redux') {
                log(state, '🟢 Слизь: жетон «Тишина» разыгрывается как «Опасность»!', 'bad');
                next(state, { op: 'original.exploreDanger', player: p.id, room: step.room });
            } else if (p && p.slime) {
                log(state, '🟢 Слизь: «Тишина» превращается в «Опасность»!', 'bad');
                next(state, { op: 'noise.roll', player: p.id, room: step.room, forced: 'danger', rerolled: true });
            } else {
                log(state, 'Жетон разведки «Тишина» — бросок шума при этом входе не делается.', 'minor');
            }
            break;
        case 'danger':
            rs.skipMoveNoise = true;
            if (p) {
                log(state, 'Жетон разведки «Опасность»!', 'event');
                if (isOriginal(state) && state.enemySet === 'redux') next(state, { op: 'original.exploreDanger', player: p.id, room: step.room });
                else next(state, { op: 'noise.roll', player: p.id, room: step.room, forced: 'danger', rerolled: true });
            }
            break;
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
    turretOnCharacterEntry(state, p, p.room);
    if (p.status !== 'active') return;
    const rs = room(state, p.room);
    if (isOriginal(state) && state.enemySet === 'redux' && rs.tile === 'contaminated') giveSlime(state, p);
    const others = playersInRoom(state, p.room).filter(o => o.id !== p.id);
    const intr = intrudersIn(state, p.room);
    const then = step.then || { op: 'turn.choose' };
    if (rs.skipMoveNoise) {
        rs.skipMoveNoise = false;
        next(state, then);
        return;
    }
    if (step.noNoise || others.length || intr.length) {
        if (!step.noNoise) log(state, 'Комната занята — бросок шума не делается.', 'minor');
        next(state, then);
        return;
    }
    if (step.laikaOnArrival || state.players.some(o => o.status === 'active' && !o.pod && o.laika === p.room)) { log(state, '🐕 В комнате Лайка — бросок шума не делается.', 'minor'); next(state, then); return; }
    if (step.careful) {
        // Every corridor of this room is a legal choice — including the ones that already carry a
        // noise token. Walking into a token is exactly how a careful move into a noisy part of the
        // ship finds its encounter, so it must not be hidden from the list.
        const cors = corridorsOf(state, p.room);
        const noisy = c => !!(c.id === 'tech' ? state.ship.techNoise : state.ship.corridors[c.id].noise);
        if (!cors.length) { log(state, 'Из комнаты нет коридоров — шум класть некуда.', 'minor'); next(state, then); return; }
        ask(state, { kind: 'choice', player: p.id, title: 'Осторожное перемещение: куда положить жетон шума?',
            options: cors.map(c => ({ id: c.id, label: (c.id === 'tech' ? 'Тех. коридоры' : 'Коридор ' + c.nums.join('/') + ' → ' + roomName(state, c.to)) + (noisy(c) ? ' · уже с шумом — встреча' : '') })) },
            { op: 'noise.place', player: p.id, room: p.room, then });
        return;
    }
    next(state, { op: 'noise.roll', player: p.id, room: p.room }, then);
};
OPS['noise.reroll'] = (state, step) => {
    const p = player(state, step.player);
    if (step.answer !== 'yes') { next(state, { op: 'noise.roll', player: p.id, room: step.room, rerolled: true, forced: step.first, mutationOffered: step.mutationOffered, chyOffered: step.chyOffered, allowCombat: step.allowCombat, then: step.then }); return; }
    payCost(state, p, 1, { op: 'noise.roll', player: p.id, room: step.room, rerolled: true, mutationOffered: step.mutationOffered, chyOffered: step.chyOffered, allowCombat: step.allowCombat, then: step.then }, 'Сканер движения: сброс карты');
};
OPS['noise.chyReroll'] = (state, step) => {
    const chosen = { ...step.noise, op: 'noise.roll', answer: undefined };
    if (step.answer === 'yes') { delete chosen.forced; delete chosen.mutationForced; chosen.rerolled = true; }
    else chosen.forced = step.first;
    next(state, chosen);
};
OPS['noise.place'] = (state, step) => {
    const p = player(state, step.player);
    const roomId = step.room || p.room;
    const card = corridorsOf(state, roomId).find(c => c.id === step.answer);
    const label = step.answer === 'tech' ? 'тех. коридоры'
        : card ? 'коридор ' + card.nums.join('/') + ' (→ ' + roomName(state, card.to) + ')'
            : step.answer;
    // A corridor holds one token. Choosing the one that already has a token is not an error: the
    // crew walks into the encounter that token promised, exactly as a die roll on it would.
    if (!placeNoise(state, step.answer)) {
        log(state, 'В ' + label + ' уже был шум — ВСТРЕЧА!', 'combat');
        next(state, { op: 'encounter', room: roomId, player: p.id, reason: 'Встреча: шум в коридоре, где уже был жетон шума' }, step.then);
        return;
    }
    log(state, 'Жетон шума положен: ' + label + '.', 'noise');
    next(state, step.then);
};

/** noise.roll { player, room } — the standard Noise roll in `room` for `player`. */
function originalDangerTargets(state, roomId) {
    const targets = [];
    for (const e of state.ship.rooms[roomId].exits) {
        if (e.corridor === 'tech') continue;
        const corridor = state.ship.corridors[e.corridor];
        for (const it of intrudersIn(state, e.to)) {
            if (playersInRoom(state, e.to).length) continue; // an Intruder in combat cannot be moved
            if (corridor.door === 'closed' && !ignoresIntruderDoor(state, it) && !canDestroyDoor(state, it)) continue;
            targets.push({ id: it.uid, from: e.to, corridor: e.corridor, it });
        }
    }
    return targets;
}

function resolveOriginalDanger(state, step, fallback) {
    const targets = originalDangerTargets(state, step.room);
    if (!targets.length) {
        if (fallback === 'noise') {
            next(state, { op: 'noise.roll', player: step.player, room: step.room });
        } else {
            for (const c of corridorsOf(state, step.room)) placeNoise(state, c.id);
            log(state, 'Опасность: рядом нет чужих — шум во всех коридорах вокруг.', 'noise');
        }
        return;
    }
    const choose = target => next(state, { op: 'original.dangerMove', room: step.room, target });
    if (step.target && targets.some(t => t.id === step.target)) { choose(step.target); return; }
    if (targets.length === 1) { choose(targets[0].id); return; }
    ask(state, { kind: 'choice', player: step.player, title: 'Опасность: какого чужого переместить в эту комнату?',
        options: targets.map(t => ({ id: t.id, label: INTRUDER_NAMES[t.it.type] + ' из ' + roomName(state, t.from) })) },
        { op: 'original.dangerChosen', room: step.room, fallback });
}

OPS['original.exploreDanger'] = (state, step) => resolveOriginalDanger(state, step, 'noise');
OPS['original.noiseDanger'] = (state, step) => resolveOriginalDanger(state, step, 'noiseTokens');
OPS['original.dangerChosen'] = (state, step) => resolveOriginalDanger(state, { ...step, target: step.answer }, step.fallback);
OPS['original.dangerMove'] = (state, step) => {
    const target = originalDangerTargets(state, step.room).find(t => t.id === step.target);
    if (!target) return;
    const c = state.ship.corridors[target.corridor];
    if (c.door === 'closed' && !ignoresIntruderDoor(state, target.it)) {
        if (canDestroyDoor(state, target.it)) {
            c.door = 'destroyed';
            log(state, INTRUDER_NAMES[target.it.type] + ' выламывает дверь ' + c.id, 'event');
        }
        return;
    }
    target.it.room = step.room;
    log(state, 'Опасность: ' + INTRUDER_NAMES[target.it.type] + ' перемещается в ' + roomName(state, step.room) + '.', 'combat');
    turretOnIntruderEntry(state, target.it);
};

OPS['noise.roll'] = (state, step) => {
    const p = player(state, step.player);
    if (!p || p.status !== 'active' || p.pod) return;
    const roomId = step.room || p.room;
    if (inCombat(state, p) && !step.allowCombat) {
        log(state, pname(p) + ' в бою — бросок шума не делается.', 'minor');
        return;
    }
    if (step.mutationForced === undefined && step.forced === undefined && needDice(state, step, 'noise', p.id, 'Бросок шума — ' + (step.laika ? 'Лайка, ' : '') + roomName(state, roomId), { room: roomId })) return;
    const noiseDie = noiseDieFor(state);
    let r = step.mutationForced !== undefined ? step.mutationForced : step.forced !== undefined ? step.forced : roll(state, noiseDie);
    log(state, '🎲 Шум (' + (step.laika ? '🐕 Лайка' : pname(p)) + ', ' + roomName(state, roomId) + '): ' + fmtRoll(r) + '.', 'noise');
    if (r === 'silence' && !step.laika && p.slime) {
        r = 'danger';
        log(state, '🟢 Слизь: «Тишина» превращается в «Опасность»!', 'bad');
    }
    if (state.enemySet === 'carnomorphs' && !step.laika && !step.mutationOffered && p.mutationCard === 'senses' && p.hand.some(isContam)) {
        ask(state, { kind: 'choice', secret: !p.mutationRevealed, reaction: true, player: p.id,
            title: 'Использовать мутацию после броска шума?', options: [{ id: 'yes', label: 'Да' }, { id: 'no', label: 'Нет' }] },
            { op: 'mutation.offerSenses', player: p.id, first: r, noise: { ...step, room: roomId, mutationOffered: true } });
        return;
    }
    if (!step.laika && state.enemySet === 'chytrids' && room(state, roomId).chyMycelium && hasChyWeakness(state, 'slowReaction') && !step.chyOffered) {
        ask(state, { kind: 'choice', player: p.id, title: 'Медленная реакция: перебросить кубик шума? Второй результат окончателен.',
            options: [{ id: 'yes', label: 'Перебросить' }, { id: 'no', label: 'Оставить' }] },
            { op: 'noise.chyReroll', first: r, noise: { ...step, room: roomId, chyOffered: true } });
        return;
    }
    // Motion Scanner (printed): "Whenever you make a Noise roll you may discard 1 card to reroll that
    // roll. You must accept the second result."
    const scanner = !step.laika && p.items.find(i => i.item === 'motionScanner');
    if (scanner && !step.rerolled && p.hand.length && r !== 'silence') {
        ask(state, { kind: 'choice', player: p.id, title: 'Сканер движения: сбросить 1 карту и перебросить бросок шума? (второй результат обязателен)',
            options: [{ id: 'yes', label: 'Перебросить' }, { id: 'no', label: 'Оставить' }] },
            { op: 'noise.reroll', player: p.id, room: roomId, first: r, mutationOffered: step.mutationOffered, chyOffered: step.chyOffered, allowCombat: step.allowCombat, then: step.then });
        return;
    }
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
        if (isOriginal(state) && state.enemySet === 'redux') {
            next(state, { op: 'original.noiseDanger', player: p.id, room: roomId });
            return;
        }
        const holder = playersInRoom(state, roomId).find(o => o.hand.some(c => (cardDef(state, c) || {}).effect === 'fdPredictable'));
        const incoming = [];
        for (const e of state.ship.rooms[roomId].exits) if (!playersInRoom(state, e.to).length) incoming.push(...intrudersIn(state, e.to).filter(it => !(state.enemySet === 'voidseeders' && it.type === 'lair') && (state.ship.corridors[e.corridor].door !== 'closed' || ignoresIntruderDoor(state, it))).map(i => i.uid));
        if (holder && incoming.length && !step.noPredict) {
            const card = holder.hand.find(c => (cardDef(state, c) || {}).effect === 'fdPredictable');
            ask(state, { kind: 'choice', player: holder.id, title: 'Опасность: чужие врываются. Сыграть «Предсказуемые движения» (не входят, каждый получает 1 ранение)?', options: [{ id: 'yes', label: 'Да' }, { id: 'no', label: 'Нет' }] },
                { op: 'predict.danger', player: holder.id, card, incoming, then: { ...step, noPredict: true, answer: undefined } });
            return;
        }
        let moved = 0;
        for (const e of state.ship.rooms[roomId].exits) {
            for (const it of intrudersIn(state, e.to)) {
                if (state.enemySet === 'voidseeders' && it.type === 'lair') continue;
                if (playersInRoom(state, e.to).length) continue;
                const c = state.ship.corridors[e.corridor];
                if (c.door === 'closed' && !ignoresIntruderDoor(state, it)) {
                    if (canDestroyDoor(state, it)) { c.door = 'destroyed'; moved++; log(state, 'Чужой выламывает дверь ' + c.id + '.', 'event'); }
                    else log(state, INTRUDER_NAMES[it.type] + ' не может выломать закрытую дверь ' + c.id + ' (повадки движения).', 'event');
                    continue;
                }
                if (state.enemySet === 'chytrids' && ['deathcap','chyQueen'].includes(it.type)) { if (moveLargeChytrid(state, it, roomId)) moved++; continue; }
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
    // The result has already been rolled; re-queue it explicitly because pending rolls are
    // cleared by the interpreter between operations. Do not ask for or roll another die.
    next(state, { ...step.then, forced: 'danger', mutationForced: undefined, mutationOffered: true });
};
OPS['encounter'] = (state, step) => {
    const roomId = step.room;
    const p = step.player !== undefined ? player(state, step.player) : null;
    if (p && step.reason && step.reason.startsWith('Событие') && inCombat(state, p)) {
        log(state, pname(p) + ' в бою — встреча по событию не происходит.', 'minor');
        return;
    }
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
    if (state.enemySet === 'carnomorphs') {
        if (token && !step.noFE && fieldExpAsk(state, token, { ...step, op: 'encounter' })) return;
        next(state, { ...step, op: 'carnomorph.encounter' }); return;
    }
    if (state.enemySet === 'voidseeders') {
        if (token && !step.noFE && fieldExpAsk(state, token, { ...step, op: 'encounter' })) return;
        next(state, { ...step, op: 'void.encounter' }); return;
    }
    if (state.enemySet === 'chytrids') {
        if (token && !step.noFE && fieldExpAsk(state, token, { ...step, op: 'encounter' })) return;
        next(state, { ...step, op: 'chy.encounter' }); return;
    }
    if (!token) { log(state, 'Мешок пуст — встречи нет.', 'minor'); return; }
    const tokThreshold = { larva: 1, crawler: 1, adult: 3, drone: 4, queen: isOriginal(state) ? 4 : 5 }[token];
    if (state.bagLast) state.bagLast.effect = token === 'blank' ? 'Пустой жетон — чужой не появляется.'
        : encounterLine('«' + INTRUDER_NAMES[token] + '»', tokThreshold,
            hasAdapt(state, 'swiftStrikes') && token !== 'larva' ? '«Молниеносные удары»: порог +1.' : '');
    log(state, '👁 Встреча: из мешка — ' + INTRUDER_NAMES[token] + '.', 'combat');
    // Reaction: Field Experience (Xenobiologist) — return the token to the bag and draw another
    if (!step.noFE && fieldExpAsk(state, token, { ...step, op: 'encounter' })) return;
    if (token === 'blank') {
        if (isOriginal(state)) {
            const wasEmpty = state.bag.length === 0;
            state.bag.push('blank');
            let added = 0;
            if (wasEmpty && countAvailable(state, 'adult') > 0) { state.bag.push('adult'); added = 1; }
            log(state, wasEmpty ? 'Пустой жетон был последним в мешке: добавлен ' + added + ' взрослый.' : 'Пустой жетон возвращён в мешок.', 'event');
            afterNoIntruder(state, roomId);
            return;
        }
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
        let threshold = { larva: 1, crawler: 1, adult: 3, drone: 4, queen: isOriginal(state) ? 4 : 5 }[token] + (hasAdapt(state, 'swiftStrikes') && token !== 'larva' ? 1 : 0);
        if (hasWeak(state, 'dangerSense')) threshold = Math.max(1, threshold - 1);   // Reaction to Danger weakness
        surpriseAttack(state, it, p, threshold);
    }
};
/** If the Xenobiologist holds "Field Experience" and has a Tissue sample, offer to redraw the token. `resume` is re-run with token/noFE. */
export function fieldExpAsk(state, token, resume) {
    const x = state.players.find(o => o.status === 'active' && o.tissue > 0 && o.hand.some(c => (cardDef(state, c) || {}).reactionToo === 'fieldExpReaction'));
    if (!x) return false;
    const card = x.hand.find(c => (cardDef(state, c) || {}).reactionToo === 'fieldExpReaction');
    ask(state, { kind: 'choice', reaction: true, player: x.id, title: 'Из мешка вытянут жетон «' + bagTokenLabel(token) + '». Сыграть «Полевой опыт» (−1 образец ткани): вернуть жетон и вытянуть другой?', options: [{ id: 'yes', label: 'Да' }, { id: 'no', label: 'Нет' }] },
        { op: 'fieldExp.answer', player: x.id, card, token, resume });
    return true;
}
OPS['fieldExp.answer'] = (state, step) => {
    const x = player(state, step.player);
    if (step.answer === 'yes' && x.hand.includes(step.card) && x.tissue > 0) {
        discardCard(state, x, step.card); x.tissue--;
        state.bag.push(step.token);
        const t = drawBagToken(state);
        log(state, '🧪 ' + pname(x) + ' играет «Полевой опыт»: жетон «' + bagTokenLabel(step.token) + '» возвращён в мешок, новый жетон — ' + (t ? bagTokenLabel(t) : 'нет') + '.', 'good');
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
    const supply = (isOriginal(state) && state.enemySet === 'redux' ? ORIGINAL_INTRUDER_TOKENS : INTRUDER_TOKENS)[type];
    const inBag = state.bag.filter(t => t === type).length;
    return Math.max(0, supply - inBag);
}

/** move.direct { player, dest, noNoise, then } — teleport-like moves (tech corridors, items). */
OPS['move.direct'] = (state, step) => {
    const p = player(state, step.player);
    const from = p.room;
    const laikaOnArrival = state.players.some(o => o.status === 'active' && !o.pod && o.laika === step.dest);
    p.room = step.dest; p.movedThisRound = true;
    log(state, pname(p) + ' перемещается: ' + roomName(state, from) + ' → ' + roomName(state, step.dest) + '.', 'action');
    resolveFollows(state);
    const after = { op: 'move.afterExplore', player: p.id, from, noNoise: step.noNoise, laikaOnArrival, then: step.then };
    if (!room(state, step.dest).explored) next(state, { op: 'explore', player: p.id, room: step.dest, from: null }, after);
    else next(state, after);
};

export { HEAVY_NAMES, tileOf };
