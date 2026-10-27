// Feats (Nemesis Redux): after keeping one Objective the player picks a Feat from the shared pool,
// resolves it immediately and removes it from the game.
import { OPS, ask, next, log, player, pname, intrudersIn, room, roomName, drawCards, discardCard, isContam,
    restoreHealth, removeWound, gainKnowledge, removeFire, removeMalfunction, removeIntruder, intruderLabel, playersInRoom } from './core.mjs';
import { repelIntruder } from './intruders.mjs';
import { drawItem, giveItem } from './rooms.mjs';
import { drawSupport, keepOneOf } from './items.mjs';
import { dealHits } from './combat.mjs';
import { FEATS, ITEMS, WOUNDS, DECK_NAMES } from '../data/cards.mjs';
import { shuffle } from '../rng.mjs';

const BREACH_ACTIONS = 3;
const DAMAGE_CONTROL_TOKENS = 4;
const PERSEVERANCE_DRAW = 3;
const PERSEVERANCE_CAP = 10;
const REQUISITION_DRAW = 3;
const RESPITE_HEAL = 3;
const REVELATION_KNOWLEDGE = 2;
const RUSH_MOVES = 2;

OPS['feat.offer'] = (state, step) => {
    const p = player(state, step.player);
    const pool = state.feats || [];
    if (!pool.length) { next(state, step.then); return; }
    const opts = pool.map(k => ({ id: k, label: FEATS[k].name, desc: FEATS[k].text, art: 'feat/' + k }));
    ask(state, { kind: 'choice', player: p.id, title: 'Выберите подвиг (он уходит из игры; разыграть его можно сразу или убрать без розыгрыша)', options: opts, wide: true },
        { op: 'feat.pick', player: p.id, then: step.then });
};

OPS['feat.pick'] = (state, step) => {
    const p = player(state, step.player);
    const k = step.answer;
    if (!state.feats.includes(k)) { next(state, step.then); return; }
    state.feats.splice(state.feats.indexOf(k), 1);
    (state.featsUsed || (state.featsUsed = [])).push(k);
    ask(state, { kind: 'choice', player: p.id, title: 'Подвиг «' + FEATS[k].name + '»: разыграть эффект?', options: [{ id: 'yes', label: 'Разыграть' }, { id: 'no', label: 'Убрать без розыгрыша' }] },
        { op: 'feat.resolve', player: p.id, feat: k, then: step.then });
};
OPS['feat.resolve'] = (state, step) => {
    const p = player(state, step.player), k = step.feat;
    if (step.answer !== 'yes') { log(state, pname(p) + ' убирает подвиг «' + FEATS[k].name + '» без розыгрыша.', 'minor'); next(state, step.then); return; }
    log(state, pname(p) + ' совершает подвиг: «' + FEATS[k].name + '».', 'action');
    next(state, { op: 'feat.' + k, player: p.id, then: step.then });
};

// --- Appropriation: 1 item of each colour, keep 2, discard the rest -------------------------
OPS['feat.appropriation'] = (state, step) => {
    const p = player(state, step.player);
    const cards = ['green', 'red', 'yellow'].map(d => drawItem(state, d)).filter(Boolean);
    next(state, { op: 'feat.appropriation.keep', player: p.id, cards, left: 2, then: step.then });
};
OPS['feat.appropriation.keep'] = (state, step) => {
    const p = player(state, step.player);
    if (step.answer !== undefined) {
        const idx = Number(step.answer);
        giveItem(state, p, step.cards[idx]);
        step.cards.splice(idx, 1); step.left--;
    }
    if (!step.cards.length || step.left <= 0) {
        for (const c of step.cards) (state.itemDiscard[ITEMS[c].deck] = state.itemDiscard[ITEMS[c].deck] || []).push(c);
        next(state, step.then); return;
    }
    ask(state, { kind: 'choice', player: p.id, title: 'Реквизиция: оставить предмет (' + step.left + ')', secret: true,
        options: step.cards.map((c, i) => ({ id: String(i), item: c, label: ITEMS[c].name, desc: ITEMS[c].text, tag: DECK_NAMES[ITEMS[c].deck] })) },
        { ...step, answer: undefined });
};

// --- Breach: up to 3 computer actions anywhere, lockdown places no malfunction --------------
OPS['feat.breach'] = (state, step) => {
    const p = player(state, step.player);
    // "Ignore additional Action card costs" while resolving these Computer Actions.
    state.noComputerCost = (state.noComputerCost || 0) + BREACH_ACTIONS;
    state.noLockdownMalf = (state.noLockdownMalf || 0) + BREACH_ACTIONS;
    next(state, { op: 'feat.breach.next', player: p.id, left: BREACH_ACTIONS, then: step.then });
};
OPS['feat.breach.next'] = (state, step) => {
    const p = player(state, step.player);
    if (step.answer === 'stop' || step.left <= 0 || p.status !== 'active') {
        state.noLockdownMalf = Math.max(0, (state.noLockdownMalf || 0) - step.left);
        next(state, step.then); return;
    }
    if (step.answer === 'go') {
        next(state, { op: 'computer.start', player: p.id, then: { ...step, left: step.left - 1, answer: undefined } });
        return;
    }
    ask(state, { kind: 'choice', player: p.id, title: 'Взлом: выполнить компьютерное действие? (осталось ' + step.left + ')',
        options: [{ id: 'go', label: 'Да' }, { id: 'stop', label: 'Хватит' }] }, step);
};

// --- Conviction: kill one intruder in the room ---------------------------------------------
OPS['feat.conviction'] = (state, step) => {
    const p = player(state, step.player);
    const its = intrudersIn(state, p.room);
    if (!its.length) { log(state, 'В комнате нет чужих.', 'minor'); next(state, step.then); return; }
    ask(state, { kind: 'choice', player: p.id, title: 'Решимость: кого убить?', options: its.map(it => ({ id: it.uid, label: intruderLabel(state, it) })) },
        { op: 'feat.conviction.kill', player: p.id, then: step.then });
};
OPS['feat.conviction.kill'] = (state, step) => {
    const it = state.intruders[step.answer];
    const p = player(state, step.player);
    if (it) {
        if (it.type === 'queen') {
            log(state, 'Решимость: критический результат по Королеве — карта здоровья.', 'combat');
            next(state, { op: 'queen.card', player: p.id }, step.then);
            return;
        }
        log(state, 'Решимость: ' + intruderLabel(state, it) + ' получает 3 ранения.', 'combat');
        dealHits(state, p, it, 3, 0, {});
    }
    next(state, step.then);
};

// --- Damage Control: remove up to 4 fire/malfunction tokens, then optional engine check ------
OPS['feat.damageControl'] = (state, step) => {
    const p = player(state, step.player);
    const left = step.left ?? DAMAGE_CONTROL_TOKENS;
    if (step.answer && step.answer !== 'done') {
        const [kind, r] = step.answer.split(':');
        if (kind === 'fire') removeFire(state, r); else removeMalfunction(state, r);
        next(state, { ...step, left: left - 1, answer: undefined }); return;
    }
    const opts = [];
    if (step.answer !== 'done' && left > 0) {
        for (const r of Object.keys(state.ship.rooms)) {
            const rs = room(state, r);
            if (rs.fire) opts.push({ id: 'fire:' + r, label: 'Пожар: ' + roomName(state, r) });
            if (rs.malfunction) opts.push({ id: 'malf:' + r, label: 'Поломка: ' + roomName(state, r) });
        }
    }
    if (opts.length) {
        opts.push({ id: 'done', label: 'Хватит' });
        ask(state, { kind: 'choice', player: p.id, title: 'Устранение неполадок: убрать жетон (осталось ' + left + ')', options: opts }, { ...step, left, answer: undefined });
        return;
    }
    ask(state, { kind: 'choice', player: p.id, title: 'Проверить состояние двигателя?',
        options: [{ id: 'no', label: 'Нет' }, ...[1, 2, 3].map(n => ({ id: String(n), label: 'Двигатель №' + n }))] },
        { op: 'feat.damageControl.engine', player: p.id, then: step.then });
};
OPS['feat.damageControl.engine'] = (state, step) => {
    const p = player(state, step.player);
    if (step.answer === 'no') { next(state, step.then); return; }
    const no = Number(step.answer);
    const e = state.secret.engines.find(x => x.no === no);
    p.knownEngines[no] = e.working;
    const engineRoom = Object.keys(state.ship.rooms).find(r => state.ship.rooms[r].engineNo === no);
    const crewThere = engineRoom && playersInRoom(state, engineRoom).length > 0;
    const text = 'Состояние: ' + (e.working ? 'ИСПРАВЕН' : 'ПОВРЕЖДЁН');
    if (crewThere) {
        ask(state, { kind: 'choice', player: p.id, title: 'Двигатель №' + no + ' (только вы это видите). ' + text + '. Изменить?', secret: true,
            options: [{ id: 'keep', label: 'Оставить' }, { id: 'flip', label: e.working ? 'Повредить' : 'Починить' }] },
            { op: 'feat.damageControl.flip', player: p.id, no, then: step.then });
        return;
    }
    ask(state, { kind: 'info', player: p.id, title: 'Двигатель №' + no + ' (только вы это видите)', text }, { op: 'noop', then: step.then });
};
OPS['feat.damageControl.flip'] = (state, step) => {
    const p = player(state, step.player);
    const e = state.secret.engines.find(x => x.no === step.no);
    if (step.answer === 'flip') { e.working = !e.working; p.knownEngines[e.no] = e.working; log(state, pname(p) + ' что-то делает с двигателем №' + e.no + '.', 'info'); }
    next(state, step.then);
};

// --- Immunization: purge all contamination cards -------------------------------------------
OPS['feat.immunization'] = (state, step) => {
    const p = player(state, step.player);
    let n = 0;
    for (const pile of ['deck', 'discard', 'hand']) {
        const keep = p[pile].filter(c => !isContam(c));
        n += p[pile].length - keep.length;
        p[pile] = keep;
    }
    p.deck = shuffle(state, p.deck.concat(p.discard.splice(0)));
    log(state, pname(p) + ': убрано карт заражения — ' + n + '. Колода перемешана.', 'good');
    next(state, step.then);
};

// --- Overpower: repel every intruder in the room, destinations chosen per intruder ----------
OPS['feat.overpower'] = (state, step) => {
    const p = player(state, step.player);
    if (step.answer !== undefined && step.uid) {
        const it = state.intruders[step.uid];
        if (it) repelIntruder(state, it, step.answer, true);   // "Ignores any Repel prevention effect"
    }
    const it = intrudersIn(state, p.room).find(i => !(step.done || []).includes(i.uid));
    if (!it) { next(state, step.then); return; }
    const done = [...(step.done || []), it.uid];
    const rooms = state.ship.rooms[p.room].exits.filter(e => state.ship.corridors[e.corridor].door !== 'closed').map(e => e.to);
    if (!rooms.length) { log(state, 'Отогнать некуда — все двери закрыты.', 'minor'); next(state, step.then); return; }
    ask(state, { kind: 'room', player: p.id, title: 'Превосходство: куда отогнать ' + intruderLabel(state, it) + '?', rooms },
        { ...step, uid: it.uid, done, answer: undefined });
};

// --- Perseverance: draw 3; each contamination drawn is discarded and replaced ---------------
OPS['feat.perseverance'] = (state, step) => {
    const p = player(state, step.player);
    let toDraw = PERSEVERANCE_DRAW, guard = 0;
    while (toDraw > 0 && guard++ < PERSEVERANCE_CAP) {
        if (!drawCards(state, p, 1, true)) break;
        const c = p.hand[p.hand.length - 1];
        toDraw--;
        if (isContam(c)) { discardCard(state, p, c); log(state, pname(p) + ' сбрасывает взятое заражение и берёт ещё карту.', 'minor'); toDraw++; }
    }
    next(state, step.then);
};

// --- Requisition: 3 support items, keep 1 ---------------------------------------------------
OPS['feat.requisition'] = (state, step) => {
    const p = player(state, step.player);
    keepOneOf(state, p, drawSupport(state, REQUISITION_DRAW), 'Снабжение', step.then);
};

// --- Respite: discard a serious wound and/or restore 3 health --------------------------------
OPS['feat.respite'] = (state, step) => {
    const p = player(state, step.player);
    if (!p.wounds.length) { next(state, { op: 'feat.respite.heal', player: p.id, then: step.then }); return; }
    ask(state, { kind: 'choice', player: p.id, title: 'Передышка: вылечить травму?',
        options: [{ id: 'none', label: 'Не лечить травму' }, ...p.wounds.map(w => ({ id: w, label: WOUNDS[w].name }))] },
        { op: 'feat.respite.wound', player: p.id, then: step.then });
};
OPS['feat.respite.wound'] = (state, step) => {
    const p = player(state, step.player);
    if (step.answer !== 'none') removeWound(state, p, step.answer);
    next(state, { op: 'feat.respite.heal', player: p.id, then: step.then });
};
OPS['feat.respite.heal'] = (state, step) => {
    const p = player(state, step.player);
    restoreHealth(state, p, RESPITE_HEAL);
    next(state, step.then);
};

// --- Revelation --------------------------------------------------------------------------------
OPS['feat.revelation'] = (state, step) => {
    gainKnowledge(state, player(state, step.player), REVELATION_KNOWLEDGE);
    next(state, step.then);
};

// --- Rush: 1 or 2 moves into explored rooms, no noise, no attacks -------------------------
OPS['feat.rush'] = (state, step) => {
    const p = player(state, step.player);
    const left = step.left ?? RUSH_MOVES;
    if (step.answer === 'stop' || left <= 0 || p.status !== 'active') { next(state, step.then); return; }
    if (step.answer === 'go' || left === RUSH_MOVES) {
        next(state, { op: 'move.start', player: p.id, filter: 'explored', noAttacks: true, noNoise: true, pay: 0,
            then: { ...step, left: left - 1, answer: undefined } });
        return;
    }
    ask(state, { kind: 'choice', player: p.id, title: 'Рывок: переместиться ещё раз?', options: [{ id: 'go', label: 'Да' }, { id: 'stop', label: 'Нет' }] }, { ...step, left });
};

// --- Traverse: jump between tech-corridor rooms without attacks or noise --------------------
OPS['feat.traverse'] = (state, step) => {
    const p = player(state, step.player);
    if (!state.ship.rooms[p.room].tech) { log(state, 'Здесь нет тех. коридора — подвиг без эффекта.', 'bad'); next(state, step.then); return; }
    const rooms = Object.keys(state.ship.rooms).filter(r => state.ship.rooms[r].tech && r !== p.room);
    if (!rooms.length) { next(state, step.then); return; }
    ask(state, { kind: 'room', player: p.id, title: 'Переход: куда?', rooms }, { op: 'feat.traverse.go', player: p.id, then: step.then });
};
OPS['feat.traverse.go'] = (state, step) => {
    const p = player(state, step.player);
    next(state, { op: 'move.go', player: p.id, dest: step.answer, noNoise: true, then: step.then });
};
