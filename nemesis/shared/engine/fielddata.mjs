// fielddata.mjs — the 18 Field Data cards (Nemesis Redux FieldDataDeck).
import { OPS, ask, next, log, player, pname, intrudersIn, playersInRoom, room, roomName, tileOf, restoreHealth, removeWound,
    removeMalfunction, drawCards, discardCard, isContam, payCost, clearNoiseAround, intruderLabel, turnOrder, drawLimit,
    COMBAT_DIE, roll, fmtRoll, needDice, corridorsOf , computerHere } from './core.mjs';
import { ITEMS, WOUNDS, EVENT_CARDS, ATTACK_CARDS } from '../data/cards.mjs';
import { ROOM_TILES } from '../ship.mjs';
import { repelIntruder } from './intruders.mjs';
import { dealHits, applyHitsNoRoll, canFire } from './combat.mjs';
import { drawItem, giveItem } from './rooms.mjs';
import { repairOptions, doorOptions } from './actions.mjs';
import { itemRequirement } from './turn.mjs';

const BACK = { op: 'turn.choose' };
const SAFETY_HAND_CAP = 7;
const ANALYSIS_EVENTS = 2;
const ANALYSIS_ATTACKS = 3;
const EVENT_BY_ID = Object.fromEntries(EVENT_CARDS.map(e => [e.id, e]));
const ATTACK_BY_ID = Object.fromEntries(ATTACK_CARDS.map(c => [c.id, c]));

function choose(state, p, title, options, op, extra = {}) {
    ask(state, { kind: 'choice', player: p.id, title, options }, { op, player: p.id, ...extra });
}

// --- Advance Tactics: shoot/melee/move, then optionally a second one ---------------------------
OPS['card.fdAdvance'] = (state, step) => {
    const p = player(state, step.player);
    const second = !!step.second;
    const opts = [];
    if (intrudersIn(state, p.room).length && p.items.some(i => canFire(p, i))) opts.push({ id: 'shoot', label: 'Стрелять' });
    if (intrudersIn(state, p.room).length) opts.push({ id: 'melee', label: 'Ближний бой' });
    opts.push({ id: 'move', label: 'Перемещение' });
    if (second) opts.push({ id: 'stop', label: 'Хватит' });
    choose(state, p, 'Передовая тактика: ' + (second ? 'второе действие?' : 'какое действие?'), opts, 'card.fdAdvance.pick', { second });
};
OPS['card.fdAdvance.pick'] = (state, step) => {
    const p = player(state, step.player);
    if (step.answer === 'stop' || p.status !== 'active') { next(state, BACK); return; }
    const then = step.second ? BACK : { op: 'card.fdAdvance', player: p.id, second: true };
    const op = { shoot: 'shoot.start', melee: 'melee.start', move: 'move.start' }[step.answer];
    next(state, { op, player: p.id, then });
};

// --- Asymptomatic -------------------------------------------------------------------------------
OPS['card.fdAsymptomatic'] = (state, step) => {
    const p = player(state, step.player);
    const c = p.hand.find(isContam);
    if (c) { p.hand.splice(p.hand.indexOf(c), 1); log(state, pname(p) + ' убирает карту заражения без проверки.', 'good'); }
    next(state, BACK);
};

// --- Behavioral Insight ---------------------------------------------------------------------------
OPS['card.fdInsight'] = (state, step) => {
    const p = player(state, step.player);
    const opts = [];
    if (intrudersIn(state, p.room).some(i => i.type === 'adult')) opts.push({ id: 'repel', label: 'Сбросить 1 карту: отогнать взрослого' });
    if (tileOf(state, p.room) === 'nest') opts.push({ id: 'nest', label: 'Использовать Гнездо (без броска шума)' });
    if (!opts.length) { next(state, BACK); return; }
    choose(state, p, 'Понимание поведения', opts, 'card.fdInsight.pick');
};
OPS['card.fdInsight.pick'] = (state, step) => {
    const p = player(state, step.player);
    if (step.answer === 'nest') { next(state, { op: 'room.action', player: p.id, noNoise: true, then: BACK }); return; }
    if (step.answer === 'repel' && !step.paid) { payCost(state, p, 1, { ...step, paid: true }, 'Понимание поведения: сброс карты'); return; }
    const it = intrudersIn(state, p.room).find(i => i.type === 'adult');
    if (it) {
        const rooms = state.ship.rooms[p.room].exits.filter(e => state.ship.corridors[e.corridor].door !== 'closed').map(e => e.to);
        if (rooms.length > 1) { ask(state, { kind: 'room', player: p.id, title: 'Куда отогнать взрослого?', rooms }, { op: 'card.fdInsight.to', player: p.id, uid: it.uid }); return; }
        if (repelIntruder(state, it, rooms[0])) { next(state, { op: 'noise.roll', player: p.id, room: it.room }, BACK); return; }
    }
    next(state, BACK);
};
OPS['card.fdInsight.to'] = (state, step) => {
    const p = player(state, step.player);
    const it = state.intruders[step.uid];
    if (it && repelIntruder(state, it, step.answer)) { next(state, { op: 'noise.roll', player: p.id, room: it.room }, BACK); return; }
    next(state, BACK);
};

// --- Containment: toggle any number of doors around the room ------------------------------------
OPS['card.fdContainment'] = (state, step) => {
    const p = player(state, step.player);
    if (step.answer && step.answer !== 'done') {
        const c = state.ship.corridors[step.answer.slice(5)];
        c.door = c.door === 'closed' ? 'open' : 'closed';
        log(state, 'Дверь ' + c.id + ' теперь ' + (c.door === 'closed' ? 'закрыта' : 'открыта') + '.', 'event');
    }
    if (step.answer === 'done') { next(state, BACK); return; }
    const opts = doorOptions(state, p.room);
    if (!opts.length) { next(state, BACK); return; }
    choose(state, p, 'Изоляция: переключить дверь', [...opts, { id: 'done', label: 'Готово' }], 'card.fdContainment');
};

// --- Critical Analysis: peek at event (2) or attack (3) deck, place each top/bottom --------------
OPS['card.fdAnalysis'] = (state, step) => {
    const p = player(state, step.player);
    choose(state, p, 'Критический анализ: какую колоду изучить?', [{ id: 'event', label: 'Колода событий (2 карты)' }, { id: 'attack', label: 'Колода атак (3 карты)' }], 'card.fdAnalysis.deck');
};
OPS['card.fdAnalysis.deck'] = (state, step) => {
    const p = player(state, step.player);
    const deck = step.answer === 'event' ? state.eventDeck : state.attackDeck;
    const n = step.answer === 'event' ? ANALYSIS_EVENTS : ANALYSIS_ATTACKS;
    const cards = deck.splice(0, n);
    next(state, { op: 'card.fdAnalysis.place', player: p.id, deck: step.answer, cards, top: [] });
};
OPS['card.fdAnalysis.place'] = (state, step) => {
    const p = player(state, step.player);
    const deck = step.deck === 'event' ? state.eventDeck : state.attackDeck;
    const name = id => step.deck === 'event' ? EVENT_BY_ID[id].name : ATTACK_BY_ID[id].name;
    if (step.answer !== undefined) {
        const [where, idx] = step.answer.split(':');
        const c = step.cards.splice(Number(idx), 1)[0];
        if (where === 'bottom') deck.push(c); else step.top.push(c);
    }
    if (!step.cards.length) {
        // Cards sent "to the top" go back in the order chosen (first chosen = top of deck).
        deck.unshift(...step.top);
        log(state, pname(p) + ' изучает колоду ' + (step.deck === 'event' ? 'событий' : 'атак') + '.', 'action');
        next(state, BACK); return;
    }
    const opts = [];
    step.cards.forEach((c, i) => { opts.push({ id: 'top:' + i, label: 'Наверх: ' + name(c) }); opts.push({ id: 'bottom:' + i, label: 'Вниз: ' + name(c) }); });
    ask(state, { kind: 'choice', player: p.id, title: 'Критический анализ (только вы видите): куда положить карту?', secret: true, options: opts }, { ...step, answer: undefined });
};

// --- Damage Expertise ----------------------------------------------------------------------------
OPS['card.fdDamage'] = (state, step) => {
    const p = player(state, step.player);
    const opts = repairOptions(state, p, true);
    for (const c of Object.values(state.ship.corridors)) if (c.door === 'destroyed') opts.push({ id: 'fix:' + c.id, label: 'Закрыть уничтоженную дверь ' + c.id });
    choose(state, p, 'Опыт ремонта', opts, 'card.fdDamage.pick');
};
OPS['card.fdDamage.pick'] = (state, step) => {
    if (String(step.answer).startsWith('fix:')) { const c = state.ship.corridors[step.answer.slice(4)]; c.door = 'closed'; log(state, 'Дверь ' + c.id + ' восстановлена и закрыта.', 'event'); next(state, BACK); return; }
    OPS['card.repairPick'](state, { ...step, then: BACK });
};

// --- Evasive Maneuvering --------------------------------------------------------------------------
OPS['card.fdEvasive'] = (state, step) => next(state, { op: 'move.start', player: step.player, noNoise: true, preventOne: true, then: BACK });

// --- Hunker Down -----------------------------------------------------------------------------------
OPS['card.fdHunker'] = (state, step) => {
    const p = player(state, step.player);
    if (!step.started) { clearNoiseAround(state, p.room); log(state, pname(p) + ' затаивается: шум вокруг убран.', 'good'); }
    if (step.answer && step.answer !== 'done') { const c = state.ship.corridors[step.answer.slice(5)]; c.door = 'closed'; log(state, 'Дверь ' + c.id + ' закрыта.', 'event'); }
    const opts = step.answer === 'done' ? [] : doorOptions(state, p.room).filter(o => state.ship.corridors[o.id.slice(5)].door === 'open');
    if (!opts.length) { p.passed = true; log(state, pname(p) + ' пасует.', 'action'); next(state, { op: 'pass.discard', player: p.id }); return; }
    choose(state, p, 'Затаиться: закрыть дверь?', [...opts, { id: 'done', label: 'Готово — спасовать' }], 'card.fdHunker', { started: true });
};

// --- Precision Shot: +1 hit, roll twice choose one (best is kept automatically) ---------------------
OPS['card.fdPrecision'] = (state, step) => next(state, { op: 'shoot.start', player: step.player, bonusHits: 1, bestOfTwo: true, then: BACK });

// --- Quick Hands -----------------------------------------------------------------------------------
OPS['card.fdQuickHands'] = (state, step) => {
    const p = player(state, step.player);
    const tile = tileOf(state, p.room);
    const icons = tile ? [...new Set(ROOM_TILES[tile].items)] : [];
    if (!icons.length) { next(state, BACK); return; }
    if (icons.length === 1) { next(state, { op: 'card.fdQuickHands.draw', player: p.id, answer: icons[0] }); return; }
    const names = { green: 'Зелёный', red: 'Красный', yellow: 'Жёлтый' };
    choose(state, p, 'Ловкие руки: из какой колоды?', icons.map(c => ({ id: c, label: names[c] || c })), 'card.fdQuickHands.draw');
};
OPS['card.fdQuickHands.draw'] = (state, step) => {
    const p = player(state, step.player);
    const key = drawItem(state, step.answer);
    if (!key) { next(state, BACK); return; }
    const d = ITEMS[key];
    const opts = [{ id: 'keep', label: 'Оставить' }, { id: 'discard', label: 'Сбросить' }];
    if (d.use && !itemRequirement(state, p, { item: key })) opts.push({ id: 'use', label: 'Сразу использовать' });
    ask(state, { kind: 'choice', player: p.id, title: 'Ловкие руки: «' + d.name + '» — ' + d.text, secret: true, options: opts }, { op: 'card.fdQuickHands.pick', player: p.id, key });
};
OPS['card.fdQuickHands.pick'] = (state, step) => {
    const p = player(state, step.player);
    const d = ITEMS[step.key];
    if (step.answer === 'discard') { (state.itemDiscard[d.deck] = state.itemDiscard[d.deck] || []).push(step.key); next(state, BACK); return; }
    giveItem(state, p, step.key);
    if (step.answer === 'use') {
        const inst = (d.kind === 'armor' ? p.armor : p.items[p.items.length - 1]);
        if (inst) { next(state, { op: 'item.use', player: p.id, uid: inst.uid, then: BACK }); return; }
    }
    next(state, BACK);
};

// --- Rapid Response: one basic 1-card action, then draw 1 -------------------------------------------
OPS['card.fdRapid'] = (state, step) => {
    const p = player(state, step.player);
    const opts = [{ id: 'move', label: 'Перемещение' }];
    if (intrudersIn(state, p.room).length) { if (p.items.some(i => canFire(p, i))) opts.push({ id: 'shoot', label: 'Стрелять' }); opts.push({ id: 'melee', label: 'Ближний бой' }); }
    if (room(state, p.room).objects.length) opts.push({ id: 'pickup', label: 'Поднять тяжёлый объект' });
    if (playersInRoom(state, p.room).length > 1 && (p.items.length || p.heavy.length)) opts.push({ id: 'trade', label: 'Передать предмет' });
    // "Computer" is a basic Action costing one card as well (Dashboard).
    const tile = tileOf(state, p.room);
    if (computerHere(state, p) && !room(state, p.room).malfunction && state.computerCard) opts.push({ id: 'computer', label: 'Компьютер' });
    choose(state, p, 'Быстрый ответ: базовое действие', opts, 'card.fdRapid.pick');
};
OPS['card.fdRapid.pick'] = (state, step) => {
    const p = player(state, step.player);
    const op = { move: 'move.start', shoot: 'shoot.start', melee: 'melee.start', pickup: 'pickup.start', trade: 'trade.start', computer: 'computer.start' }[step.answer];
    next(state, { op, player: p.id, then: { op: 'card.fdRapid.draw', player: p.id } });
};
OPS['card.fdRapid.draw'] = (state, step) => { const p = player(state, step.player); if (p.status === 'active') drawCards(state, p, 1); next(state, BACK); };

// --- Reposition: swap rooms with an intruder next door ------------------------------------------------
OPS['card.fdReposition'] = (state, step) => {
    const p = player(state, step.player);
    const opts = [];
    for (const e of state.ship.rooms[p.room].exits) {
        if (state.ship.corridors[e.corridor].door === 'closed') continue;
        for (const it of intrudersIn(state, e.to)) opts.push({ id: it.uid, label: intruderLabel(state, it) + ' — ' + roomName(state, e.to) });
    }
    if (!opts.length) { next(state, BACK); return; }
    choose(state, p, 'Перестроение: с кем поменяться комнатами?', opts, 'card.fdReposition.pick');
};
OPS['card.fdReposition.pick'] = (state, step) => {
    const p = player(state, step.player);
    const it = state.intruders[step.answer];
    if (!it) { next(state, BACK); return; }
    const dest = it.room;
    it.room = p.room;
    log(state, pname(p) + ' меняется местами с ' + intruderLabel(state, it) + '.', 'action');
    next(state, { op: 'move.go', player: p.id, dest, noNoise: true, then: BACK });
};

// --- Resourceful ----------------------------------------------------------------------------------------
OPS['card.fdResourceful'] = (state, step) => {
    const p = player(state, step.player);
    drawCards(state, p, 2);
    if (!p.hand.length) { next(state, BACK); return; }
    ask(state, { kind: 'cards', player: p.id, title: 'Находчивость: сбросьте 1 карту (можно заражение)', cards: [...p.hand], min: 1, max: 1 }, { op: 'card.discardPicked', player: p.id, then: BACK });
};

// --- Restoration ---------------------------------------------------------------------------------------
OPS['card.fdRestoration'] = (state, step) => {
    const p = player(state, step.player);
    const mates = playersInRoom(state, p.room);
    const opts = mates.map(o => ({ id: 'heal:' + o.id, label: 'Восстановить 2 здоровья: ' + (o.id === p.id ? 'себе' : pname(o)) }));
    for (const o of mates) for (const w of o.wounds) opts.push({ id: 'wound:' + o.id + ':' + w, label: 'Сбросить 1 карту — вылечить травму «' + WOUNDS[w].name + '» (' + (o.id === p.id ? 'себе' : pname(o)) + ')' });
    choose(state, p, 'Восстановление', opts, 'card.fdRestoration.pick');
};
OPS['card.fdRestoration.pick'] = (state, step) => {
    const p = player(state, step.player);
    const [kind, id, w] = String(step.answer).split(':');
    const o = player(state, Number(id));
    if (kind === 'heal') { restoreHealth(state, o, 2); next(state, BACK); return; }
    if (!step.paid) { payCost(state, p, 1, { ...step, paid: true }, 'Восстановление: сброс карты'); return; }
    removeWound(state, o, w);
    next(state, BACK);
};

// --- Safety in Numbers ----------------------------------------------------------------------------------
OPS['card.fdSafety'] = (state, step) => {
    const p = player(state, step.player);
    const mates = turnOrder(state).filter(o => o.status === 'active' && o.room === p.room && !o.pod);
    for (const o of mates) if (o.hand.length < SAFETY_HAND_CAP) drawCards(state, o, 1);
    const shooters = intrudersIn(state, p.room).length ? mates.filter(o => o.items.some(i => canFire(o, i))).map(o => o.id) : [];
    next(state, { op: 'card.fdSafety.shoot', player: p.id, shooters });
};
OPS['card.fdSafety.shoot'] = (state, step) => {
    const ids = step.shooters.filter(id => { const o = player(state, id); return o && o.status === 'active' && intrudersIn(state, o.room).length && o.items.some(i => canFire(o, i)); });
    if (!ids.length) { next(state, BACK); return; }
    const [first, ...rest] = ids;
    next(state, { op: 'shoot.start', player: first, then: { op: 'card.fdSafety.shoot', player: step.player, shooters: rest } });
};

// --- Reactions (played automatically when offered) ------------------------------------------------------
OPS['card.fdCircleStrafe'] = OPS['card.interruption'];
OPS['card.fdPredictable'] = OPS['card.interruption'];
OPS['card.fdRisk'] = OPS['card.interruption'];
