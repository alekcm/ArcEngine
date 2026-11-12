// Carnomorph mechanics. The pack remains unavailable until decks and the rest of its rules
// are integrated; these functions operate on the normal, JSON-serializable game state.
import { randInt, shuffle } from '../rng.mjs';
import { CARNOMORPH_ATTACK_CARDS, CARNOMORPH_ATTACK_BY_ID, CARNOMORPH_ADAPTATIONS, CARNOMORPH_MUTATIONS } from '../data/carnomorphs.mjs';
import { repelIntruder } from './intruders.mjs';
import { initialExpansionBag } from '../dlc.mjs';
import { INTRUDER_NAMES } from '../data/cards.mjs';
import { OPS, ask, log, next, intrudersIn, playersInRoom, room, roomName, tileOf, spawnIntruder, removeIntruder, loseHealth, gainContamination, killPlayer, turnOrder, corridorsOf, placeNoise, cardDef, HIBERNATION_TIME, SELF_DESTRUCT_LENGTH, destroyShip, fx } from './core.mjs';

const RANK = { butcher: 0, breeder: 1, shambler: 2, metagorger: 3 };
const NEXT = { metagorger: 'shambler', shambler: 'breeder', breeder: 'butcher' };
const LIMIT = { metagorger: 8, shambler: 8, breeder: 3, butcher: 1 };

/** Initialize pack-specific counters and physical token supply; does not install the decks. */
export function initCarnomorphs(state) {
    const { bag, supply } = initialExpansionBag('carnomorphs', state.players.map(p => p.id), state);
    state.bag = bag;
    state.carnomorphSupply = supply;
    state.carnomorphButcherDead = false;
    state.carnomorphRevealed = [];
    const cards = shuffle(state, Object.keys(CARNOMORPH_ADAPTATIONS)).slice(0, 3);
    state.secret.carnomorphAdaptations = { shambler: cards[0], breeder: cards[1], butcher: cards[2] };
    state.carnomorphAdaptations = { shambler: null, breeder: null, butcher: null };
    state.carnomorphRemoved = [];
    state.adaptations = []; state.weaknessMode = false; state.weaknesses = [];
    state.mutationDeck = shuffle(state, Object.keys(CARNOMORPH_MUTATIONS));
    state.mutationDiscard = [];
    for (const p of state.players) { p.mutationCard = null; p.mutationRevealed = false; p.mutationMarkers = 0; }
    state.nestEggs = 8;
}

/** Add one token from the supply; Metagorgers must use red tokens before blue ones. */
export function addCarnomorphToken(state, type) {
    const supply = state.carnomorphSupply;
    const types = type === 'metagorger' ? ['redMetagorger', 'blueMetagorger'] : [type];
    for (const t of types) {
        const indices = supply.map((x, i) => x.type === t ? i : -1).filter(i => i >= 0);
        if (!indices.length) continue;
        const token = supply.splice(indices[randInt(state, indices.length)], 1)[0];
        state.bag.push(token);
        return token;
    }
    return null;
}

/** The card for a type is revealed the first time a miniature of that type enters play. */
function revealType(state, type) {
    if (type === 'metagorger') return;
    const revealed = state.carnomorphRevealed || (state.carnomorphRevealed = []);
    if (!revealed.includes(type)) {
        revealed.push(type);
        const card = state.secret.carnomorphAdaptations && state.secret.carnomorphAdaptations[type];
        if (card && !(state.carnomorphRemoved || []).includes(type)) {
            state.carnomorphAdaptations[type] = card;
            log(state, '🧬 ' + INTRUDER_NAMES[type] + ': раскрыта адаптация «' + CARNOMORPH_ADAPTATIONS[card].name + '».', 'event');
        }
    }
}
export function spawnCarnomorph(state, type, roomId) {
    if (!Object.hasOwn(LIMIT, type)) throw new RangeError('Unknown Carnomorph: ' + type);
    const it = spawnIntruder(state, type, roomId);
    if (it) revealType(state, type);
    return it;
}

/** Removal after a lethal attack: do not take tokens from the bag for the spawned Shamblers. */
export function killCarnomorph(state, it) {
    if (!it || !state.intruders[it.uid] || !Object.hasOwn(LIMIT, it.type)) return;
    const { type, room: roomId, uid } = it;
    removeIntruder(state, uid, false);
    if (type === 'butcher') state.carnomorphButcherDead = true;
    else {
        room(state, roomId).objects.push({ type: 'carcass' });
        state.carcassCount = (state.carcassCount || 0) + 1;
    }
    const count = type === 'butcher' ? 2 : type === 'breeder' ? 1 : 0;
    for (let i = 0; i < count; i++) spawnCarnomorph(state, 'shambler', roomId);
}

/** Find the highest-priority edible object. Eggs on the Nest board count as eggs in that room. */
function foodInRoom(state, roomId, feeder, onlyHeavy = false) {
    const objects = room(state, roomId).objects;
    for (const type of ['charCorpse', 'egg', 'carcass', 'metagorger', 'corpse']) {
        const i = objects.findIndex(o => o.type === type);
        if (i >= 0) return { kind: 'object', index: i, type };
        if (type === 'egg' && tileOf(state, roomId) === 'nest' && state.nestEggs > 0)
            return { kind: 'nestEgg', type };
        if (type === 'metagorger' && !onlyHeavy) {
            const prey = intrudersIn(state, roomId).find(it => it.uid !== feeder.uid && it.type === type);
            if (prey) return { kind: 'intruder', uid: prey.uid, type };
        }
    }
    return null;
}
function eat(state, roomId, food) {
    if (food.kind === 'object') room(state, roomId).objects.splice(food.index, 1);
    else if (food.kind === 'intruder') removeIntruder(state, food.uid, false);
    else if (food.kind === 'nestEgg') {
        state.nestEggs--;
        if (state.nestEggs === 0 && !state.nestDestroyed) {
            state.nestDestroyed = true;
            log(state, '🥚 Гнездо уничтожено!', 'event');
        }
    }
}

function feedOne(state, it, onlyHeavy = false) {
    const roomId = it.room, food = foodInRoom(state, roomId, it, onlyHeavy);
    if (!food) return false;
    it.hits = 0;
    const evolved = NEXT[it.type];
    const available = evolved && !(evolved === 'butcher' && state.carnomorphButcherDead) &&
        Object.values(state.intruders).filter(other => other.type === evolved).length < LIMIT[evolved];
    if (available) { it.type = evolved; revealType(state, evolved); }
    eat(state, roomId, food);
    log(state, '🍖 Карноморф кормится в ' + roomName(state, roomId) + ': ' + INTRUDER_NAMES[it.type] + '.', 'event');
    return true;
}
function orderedCarnomorphs(state) {
    const rooms = Object.keys(state.ship.rooms).sort((a, b) =>
        state.ship.rooms[a].y - state.ship.rooms[b].y || state.ship.rooms[a].x - state.ship.rooms[b].x || a.localeCompare(b));
    return rooms.flatMap(roomId => intrudersIn(state, roomId).filter(it => Object.hasOwn(RANK, it.type))
        .sort((a, b) => RANK[a.type] - RANK[b.type]).map(it => it.uid));
}
/** Feed each original miniature at most once, in printed priority order, outside combat. */
export function feedCarnomorphs(state) {
    for (const uid of orderedCarnomorphs(state)) {
        const it = state.intruders[uid];
        if (it && !playersInRoom(state, it.room).length) feedOne(state, it);
    }
}
OPS['carnomorph.feed'] = (state, step) => { feedCarnomorphs(state); next(state, step.then); };

/** Only face-up, not removed cards have an effect. */
export function hasCarnomorphAdaptation(state, id) {
    return Object.values(state.carnomorphAdaptations || {}).includes(id);
}

/** Lab spaces are bound to monster types: corpse/Shambler, carcass/Breeder, egg/Butcher. */
export function analyzeCarnomorphAdaptation(state, type) {
    const normalized = type === 'charCorpse' ? 'corpse' : type;
    const rank = { corpse: 'shambler', carcass: 'breeder', egg: 'butcher' }[normalized];
    if (!rank) return false;
    state.analyzed[normalized] = true;
    const id = state.carnomorphAdaptations && state.carnomorphAdaptations[rank];
    if ((state.carnomorphRemoved || []).includes(rank)) {
        log(state, '🧬 Адаптация этого объекта уже удалена.', 'minor');
        return false;
    }
    // The agreed Redux adaptation allows analysis to remove a face-down card as well.
    // Its identity remains secret if it was not already revealed.
    const hidden = state.secret.carnomorphAdaptations && state.secret.carnomorphAdaptations[rank];
    if (!id && !hidden) return false;
    state.carnomorphAdaptations[rank] = null;
    (state.carnomorphRemoved || (state.carnomorphRemoved = [])).push(rank);
    state.adaptationsRemoved = (state.adaptationsRemoved || 0) + 1;
    log(state, id ? '🧬 Анализ: адаптация «' + CARNOMORPH_ADAPTATIONS[id].name + '» удалена.' : '🧬 Анализ: закрытая адаптация удалена.', 'good');
    return true;
}

/** Install the twenty printed physical attack cards. This is deliberately separate from init,
 *  so a partially wired pack can never silently replace a live Redux deck. */
export function initCarnomorphAttackDeck(state) {
    state.attackDeck = shuffle(state, CARNOMORPH_ATTACK_CARDS.map(c => c.id));
    state.attackDiscard = [];
}

/** A damage check consumes an attack card. An arrow retreats instead of killing. */
export function carnPowerCheck(state, it, hits) {
    if (!it || !state.intruders[it.uid] || !Object.hasOwn(LIMIT, it.type)) return null;
    if (!Number.isInteger(hits) || hits < 1) throw new RangeError('Damage must be a positive integer');
    if (!state.attackDeck.length) state.attackDeck = shuffle(state, state.attackDiscard.splice(0));
    const id = state.attackDeck.shift();
    const card = CARNOMORPH_ATTACK_BY_ID[id];
    if (!card) throw new Error('Missing Carnomorph attack card: ' + id);
    state.attackDiscard.push(id);
    it.hits += hits;
    const toughness = it.type === 'metagorger' ? card.metagorger : card.other;
    const required = toughness === 'retreat' ? null : toughness + (hasCarnomorphAdaptation(state, 'regeneration') ? 1 : 0);
    const verdict = required === null ? 'отступление' : it.hits >= required ? 'убит' : 'выжил';
    const description = 'Проверка стойкости: ' + INTRUDER_NAMES[it.type] + ' · урон ' + it.hits +
        (required === null ? ' · стрелка' : ' · стойкость ' + required) + ' → ' + verdict + '.';
    fx(state, { type: 'attack', check: true, card: id, name: card.name, intruder: it.type, effect: description });
    log(state, description, 'combat');
    if (required === null) {
        repelIntruder(state, it);
        return { card: id, result: 'retreat' };
    }
    if (it.hits >= required) {
        log(state, INTRUDER_NAMES[it.type] + ' убит проверкой выносливости.', 'good');
        killCarnomorph(state, it);
        return { card: id, result: 'killed' };
    }
    return { card: id, result: 'survived' };
}

/** Translate an attack card to the shared combat interpreter, including its reaction window. */
export function carnomorphAttackEffects(card, it, p) {
    if (!card.targets.includes(it.type)) return [{ op: 'carnoMiss' }];
    switch (card.effect) {
        case 'vomit': return [{ op: 'contam' }, { op: 'carnoCarcass' }];
        case 'powerful': return [{ op: 'wound', n: 1 }, { op: 'contam' }];
        case 'devour': return [{ op: 'carnoHeal' }, p.wounds.length >= 1 ? { op: 'carnoKill' } : { op: 'wound', n: 1 }];
        case 'multiply': return [{ op: 'carnoSpawn' }];
        case 'bite': return [p.wounds.length >= 2 ? { op: 'carnoKill' } : { op: 'wound', n: 1 }];
        case 'lash': return [{ op: 'dmg', n: 2 }, { op: 'contam' }];
        case 'scratch': return [{ op: 'dmg', n: 1 }, { op: 'contam' }];
        default: throw new Error('Invalid Carnomorph attack effect');
    }
}

const tokenRank = { redMetagorger: 'metagorger', blueMetagorger: 'metagorger', shambler: 'shambler', breeder: 'breeder', butcher: 'butcher' };
function allNoiseSteps(state) {
    return turnOrder(state).filter(p => p.status === 'active' && !p.pod && !intrudersIn(state, p.room).length)
        .map(p => ({ op: 'noise.roll', player: p.id, room: p.room }));
}
function noiseAround(state, roomId) {
    for (const corridor of corridorsOf(state, roomId)) placeNoise(state, corridor.id);
}

/** Resolve a drawn Encounter token. The common handler has already cleared nearby noise. */
export function resolveCarnomorphEncounter(state, step) {
    const token = step.token;
    if (!token) return;
    if (token === 'blank') {
        if (!state.bag.length) addCarnomorphToken(state, 'metagorger');
        state.bag.push('blank');
        noiseAround(state, step.room);
        if (state.bagLast) state.bagLast.effect = 'Пустой жетон: шум во всех коридорах.';
        return;
    }
    const type = tokenRank[token.type];
    if (!type) throw new Error('Invalid Carnomorph token');
    state.carnomorphSupply.push(token);
    const it = spawnCarnomorph(state, type, step.room);
    if (!it) { noiseAround(state, step.room); return; }
    if (state.bagLast) state.bagLast.effect = 'Появляется ' + INTRUDER_NAMES[type] + ' (значение жетона ' + token.value + '); жетон уходит в запас. Если в руке меньше ' + token.value + ' карт (с учётом адаптации Ускорение), чужой сразу атакует.';
    const continuation = { ...step, op: 'carnomorph.encounterSurprise', intruder: it.uid };
    const holder = playersInRoom(state, step.room).find(o => o.hand.some(c => (cardDef(state, c) || {}).effect === 'fdPredictable'));
    if (holder && !step.noPredict) {
        const card = holder.hand.find(c => (cardDef(state, c) || {}).effect === 'fdPredictable');
        ask(state, { kind: 'choice', player: holder.id, title: 'Сыграть «Предсказуемые движения»: ' + INTRUDER_NAMES[type] + ' получает 1 ранение?',
            options: [{ id: 'yes', label: 'Да' }, { id: 'no', label: 'Нет' }] },
            { op: 'predict.spawn', player: holder.id, card, intruder: it.uid, then: continuation });
        return;
    }
    next(state, continuation);
}
OPS['carnomorph.encounterSurprise'] = (state, step) => {
    const it = state.intruders[step.intruder];
    const p = step.player == null ? null : state.players[step.player];
    if (!it || it.room !== step.room || !p || p.status !== 'active' || p.room !== step.room || step.noSurprise) return;
    const bonus = hasCarnomorphAdaptation(state, 'acceleration') ? 1 : 0;
    if (p.hand.length < step.token.value + bonus)
        next(state, { op: 'attack', intruder: it.uid, player: p.id, context: 'surprise' });
};

/** Resolve the expansion's bag-development token, returning queued actions in execution order. */
export function developCarnomorphBag(state, token) {
    if (!token) return [];
    const label = token === 'blank' ? 'Пустой жетон развития' : (token.type === 'redMetagorger' ? 'Красный жетон глодателя' : token.type === 'blueMetagorger' ? 'Синий жетон глодателя' : token.type === 'shambler' ? 'Жетон падальщика' : token.type === 'breeder' ? 'Жетон свежевателя' : 'Жетон мясника') + ' ' + token.value;
    if (state.bagLast) state.bagLast.effect = label + ': ' + ({ blank: 'убрать падальщиков из пустых комнат, добавить глодателя в мешок и бросить кубик шума за каждого персонажа без чужих в комнате.', redMetagorger: 'положить жетон обратно в мешок и выставить глодателей во всех подходящих комнатах (с глодателем, объектом, тяжёлым предметом или гнездом).', blueMetagorger: 'вернуть жетон в запас, добавить глодателя в мешок и бросить кубик шума за каждого персонажа без чужих в комнате.', butcher: 'вернуть жетон в запас; мясник появляется у первого игрока и начинается встреча.', shambler: 'вернуть жетон в мешок и бросить кубик шума за каждого персонажа без чужих в комнате.', breeder: 'вернуть жетон в мешок и бросить кубик шума за каждого персонажа без чужих в комнате.' })[token === 'blank' ? 'blank' : token.type];
    if (token === 'blank') {
        for (const it of Object.values(state.intruders)) {
            if (it.type !== 'shambler' || playersInRoom(state, it.room).length) continue;
            removeIntruder(state, it.uid, false);
            addCarnomorphToken(state, 'shambler');
        }
        addCarnomorphToken(state, 'metagorger');
        state.bag.push('blank');
        return allNoiseSteps(state);
    }
    if (!tokenRank[token.type]) throw new Error('Invalid Carnomorph token');
    if (token.type === 'blueMetagorger') {
        state.carnomorphSupply.push(token);
        addCarnomorphToken(state, 'metagorger');
        return allNoiseSteps(state);
    }
    if (token.type === 'redMetagorger') {
        state.bag.push(token);
        const targetRooms = new Set();
        for (const it of Object.values(state.intruders)) if (it.type === 'metagorger') targetRooms.add(it.room);
        for (const [id, rs] of Object.entries(state.roomState)) if (rs.objects.length) targetRooms.add(id);
        for (const p of state.players) if (p.status === 'active' && !p.pod && p.heavy.length) targetRooms.add(p.room);
        if (state.nestDiscovered && !state.nestDestroyed) {
            const nest = Object.keys(state.ship.rooms).find(id => tileOf(state, id) === 'nest');
            if (nest) targetRooms.add(nest);
        }
        for (const id of [...targetRooms].sort()) spawnCarnomorph(state, 'metagorger', id);
        return [];
    }
    if (token.type === 'butcher') {
        state.carnomorphSupply.push(token);
        const p = state.players[state.firstPlayer];
        if (!p || p.status !== 'active' || p.pod) return [];
        const it = spawnCarnomorph(state, 'butcher', p.room);
        return it ? [{ op: 'encounter', player: p.id, room: p.room, reason: 'Мясник: столкновение при развитии мешка' }] : [];
    }
    state.bag.push(token);
    return allNoiseSteps(state);
}
OPS['carnomorph.encounter'] = (state, step) => resolveCarnomorphEncounter(state, step);
OPS['carnomorph.bagDevelop'] = (state, step) => { next(state, ...developCarnomorphBag(state, step.token)); };

/** The surgery removes the card, not the irreversible mutation markers. */
export function removeCarnomorphMutation(state, p) {
    if (state.enemySet !== 'carnomorphs' || !p.mutationCard) return false;
    (state.mutationDiscard || (state.mutationDiscard = [])).push(p.mutationCard);
    p.mutationCard = null;
    p.mutationRevealed = false;
    log(state, p.name + ': карта мутации удалена; фишки мутации остаются.', 'good');
    return true;
}

/** Gaining a mutation card is a secret 2-to-1 choice; unused cards return to the deck. */
OPS['carnomorph.gainCard'] = (state, step) => {
    const p = state.players[step.player];
    if (!p || p.status !== 'active' || p.mutationCard) return;
    const cards = state.mutationDeck.splice(0, 2);
    if (!cards.length) { log(state, 'Колода мутаций пуста.', 'minor'); return; }
    if (cards.length === 1) { p.mutationCard = cards[0]; p.mutationRevealed = false; return; }
    ask(state, { kind: 'choice', secret: true, player: p.id, title: 'Выберите карту мутации',
        options: cards.map(id => ({ id, label: CARNOMORPH_MUTATIONS[id].name,
            desc: 'Заражён: ' + CARNOMORPH_MUTATIONS[id].infected + ' Не заражён: ' + CARNOMORPH_MUTATIONS[id].clean })) },
        { op: 'carnomorph.pickMutation', player: p.id, cards });
};
OPS['carnomorph.pickMutation'] = (state, step) => {
    const p = state.players[step.player];
    p.mutationCard = step.answer; p.mutationRevealed = false;
    state.mutationDeck.push(...step.cards.filter(id => id !== step.answer));
    shuffle(state, state.mutationDeck);
    log(state, p.name + ' получает карту мутации лицом вниз.', 'event');
};
OPS['carnomorph.gainMarker'] = (state, step) => {
    const p = state.players[step.player];
    if (!p || p.status !== 'active') return;
    if (!p.mutationCard) { next(state, { op: 'carnomorph.gainCard', player: p.id }); return; }
    p.mutationMarkers = (p.mutationMarkers || 0) + 1;
    log(state, p.name + ': фишек мутации ' + p.mutationMarkers + '.', 'bad');
    if (p.mutationMarkers >= 4) {
        const roomId = p.room;
        killPlayer(state, p, 'четвёртая фишка мутации');
        spawnCarnomorph(state, 'shambler', roomId);
    }
};
OPS['carnomorph.metagorgerAttack'] = (state, step) => {
    const p = state.players[step.player], it = state.intruders[step.intruder];
    if (!p || p.status !== 'active' || !it) return;
    if (!p.mutationCard && !step.cardOffered) {
        next(state, { op: 'carnomorph.gainCard', player: p.id }, { ...step, cardOffered: true });
        return;
    }
    gainContamination(state, p, 1);
    if (p.status === 'active') loseHealth(state, p, 1, 'атака');
    removeIntruder(state, it.uid, false);
    addCarnomorphToken(state, 'shambler');
};

/** The expansion advances the tracks before its attack/feed step, not during Redux cleanup. */
OPS['carnomorph.phaseStart'] = (state) => {
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
    next(state, ...orderedCarnomorphs(state).map(uid => ({ op: 'carnomorph.phaseAct', intruder: uid })),
        { op: 'carnomorph.phaseFire' }, { op: 'phase.event' });
};
OPS['carnomorph.phaseAct'] = (state, step) => {
    const it = state.intruders[step.intruder];
    if (!it) return;
    const combat = playersInRoom(state, it.room).length > 0;
    if (!combat) { feedOne(state, it); return; }
    if (hasCarnomorphAdaptation(state, 'ravenous')) feedOne(state, it, true);
    if (state.intruders[it.uid] && playersInRoom(state, it.room).length)
        next(state, { op: 'attack', intruder: it.uid, context: 'phase' });
};
OPS['carnomorph.phaseFire'] = (state) => {
    for (const [id, rs] of Object.entries(state.roomState)) {
        if (!rs.fire) continue;
        if (!hasCarnomorphAdaptation(state, 'fireResistance')) {
            for (const it of intrudersIn(state, id)) if (state.intruders[it.uid]) carnPowerCheck(state, it, 1);
        }
        if (tileOf(state, id) === 'nest' && state.nestEggs > 0) {
            state.nestEggs--;
            if (!state.nestEggs && !state.nestDestroyed) { state.nestDestroyed = true; log(state, '🥚 Гнездо уничтожено!', 'event'); }
        }
    }
};

/** Carnomorph damage check using two combat-die results instead of revealing an attack card. */
export function carnDiceCheck(state, it, hits, rolls) {
    if (!it || !state.intruders[it.uid]) return null;
    const crits = rolls.filter(x => x === 'crit').length;
    const score = crits === 2 ? Infinity : rolls.reduce((n, x) => n + (x === 'crit' ? 1 : x), 0);
    it.hits += hits;
    const required = LIMIT[it.type] + (hasCarnomorphAdaptation(state, 'regeneration') ? 1 : 0);
    const verdict = crits === 2 || it.hits + score >= required ? 'убит' : 'выжил';
    const description = 'Проверка карноморфа: два кубика ' + rolls.map(x => x === 'crit' ? 'КРИТ' : x).join(' + ') + ' = ' + (crits === 2 ? 'двойной КРИТ' : score) + '; ранений ' + it.hits + ', стойкость ' + required + ' → ' + verdict + '.';
    log(state, description, 'combat');
    if (verdict === 'убит') { killCarnomorph(state, it); return { result: 'killed' }; }
    return { result: 'survived' };
}
