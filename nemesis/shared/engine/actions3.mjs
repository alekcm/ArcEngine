// actions3.mjs — action-card effects of the Survivor and the Xenobiologist. Shares helpers with
// actions.mjs / actions2.mjs. The Xenobiologist keeps Tissue samples as `player.tissue`.

import { OPS, ask, next, log, player, pname, intrudersIn, room, roomName, tileOf, drawCards, payCost, removeWound,
    gainKnowledge, intruderLabel, secretTile } from './core.mjs';
import { ITEMS, WOUNDS } from '../data/cards.mjs';
import { ROOM_TILES } from '../ship.mjs';
import { applyHitsNoRoll, phantomAttack } from './combat.mjs';
import { choice } from './actions.mjs';

const BACK = { op: 'turn.choose' };
const HAND_CAP = 7;
const droppable = p => p.items.filter(i => !ITEMS[i.item].quest);
const neighbours = (state, roomId) => state.ship.rooms[roomId].exits.map(e => e.to);
const dropItem = (state, p, uid) => {
    const inst = p.items.find(i => i.uid === uid); if (!inst) return false;
    p.items = p.items.filter(i => i !== inst);
    (state.itemDiscard[ITEMS[inst.item].deck] = state.itemDiscard[ITEMS[inst.item].deck] || []).push(inst.item);
    log(state, pname(p) + ' выбрасывает «' + ITEMS[inst.item].name + '».', 'action');
    return true;
};
const spendTissue = (state, p) => { p.tissue = Math.max(0, (p.tissue || 0) - 1); log(state, pname(p) + ' тратит образец ткани (осталось ' + p.tissue + ').', 'action'); };
const spendKnowledge = (state, p) => { p.knowledge = Math.max(0, p.knowledge - 1); log(state, pname(p) + ' тратит 1 знание из манипулятора (осталось ' + p.knowledge + ').', 'action'); };

// ---------------------------------------------------------------------------------------------
// Survivor
// ---------------------------------------------------------------------------------------------
OPS['card.desperateAttack'] = (state, step) => {
    const p = player(state, step.player);
    const targets = intrudersIn(state, p.room);
    choice(state, p, 'Отчаянная атака: цель', targets.map(t => ({ id: t.uid, label: intruderLabel(state, t) })), 'card.desperateAttack.target');
};
OPS['card.desperateAttack.target'] = (state, step) => {
    const p = player(state, step.player);
    next(state, { op: 'melee.hit', player: p.id, target: step.answer, bonusHits: 2, noRetaliation: true, then: { op: 'card.desperateAttack.after', player: p.id, target: step.answer } });
};
OPS['card.desperateAttack.after'] = (state, step) => {
    const p = player(state, step.player); const it = state.intruders[step.target];
    if (!it || p.status !== 'active') { next(state, BACK); return; }
    const items = droppable(p);
    if (!items.length) { next(state, { op: 'attack', intruder: it.uid, player: p.id, context: 'retaliation' }, BACK); return; }
    ask(state, { kind: 'choice', player: p.id, title: 'Чужой выжил и отвечает атакой. Сбросить предмет, чтобы предотвратить её?',
        options: [{ id: 'none', label: 'Принять атаку' }, ...items.map(i => ({ id: i.uid, label: 'Сбросить «' + ITEMS[i.item].name + '»' }))] },
        { op: 'card.desperateAttack.block', player: p.id, target: it.uid });
};
OPS['card.desperateAttack.block'] = (state, step) => {
    const p = player(state, step.player);
    if (step.answer !== 'none' && dropItem(state, p, step.answer)) { log(state, 'Атака предотвращена.', 'good'); next(state, BACK); return; }
    next(state, { op: 'attack', intruder: step.target, player: p.id, context: 'retaliation' }, BACK);
};

OPS['card.obstinate'] = (state, step) => {
    const p = player(state, step.player);
    const n = Math.max(0, Math.min(1 + p.wounds.length, HAND_CAP - p.hand.length));
    if (n) drawCards(state, p, n); else log(state, 'В руке уже 7 карт — карты не берутся.', 'minor');
    const items = droppable(p);
    if (!p.wounds.length || !items.length) { next(state, BACK); return; }
    ask(state, { kind: 'choice', player: p.id, title: 'Сбросить предмет, чтобы снять серьёзное ранение?',
        options: [{ id: 'none', label: 'Нет' }, ...items.map(i => ({ id: i.uid, label: 'Сбросить «' + ITEMS[i.item].name + '»' }))] },
        { op: 'card.obstinate.item', player: p.id });
};
OPS['card.obstinate.item'] = (state, step) => {
    const p = player(state, step.player);
    if (step.answer === 'none' || !dropItem(state, p, step.answer)) { next(state, BACK); return; }
    if (p.wounds.length === 1) { removeWound(state, p, p.wounds[0]); next(state, BACK); return; }
    ask(state, { kind: 'choice', player: p.id, title: 'Какое ранение снять?', options: p.wounds.map((w, i) => ({ id: String(i), label: WOUNDS[w].name })) }, { op: 'card.obstinate.wound', player: p.id });
};
OPS['card.obstinate.wound'] = (state, step) => { const p = player(state, step.player); const w = p.wounds[Number(step.answer)]; if (w) removeWound(state, p, w); next(state, BACK); };

OPS['card.vents'] = (state, step) => {
    const p = player(state, step.player);
    if (!state.ship.rooms[p.room].tech) { log(state, 'Здесь нет входа в технические коридоры — карта потрачена впустую.', 'minor'); next(state, BACK); return; }
    const dests = Object.keys(state.ship.rooms).filter(r => r !== p.room && state.ship.rooms[r].tech && room(state, r).explored);
    if (!dests.length) { log(state, 'Нет другой разведанной комнаты с входом в тех. коридоры.', 'minor'); next(state, BACK); return; }
    payCost(state, p, 1, { op: 'card.vents.pick', player: p.id, dests }, 'Вентиляция: оплата');
};
OPS['card.vents.pick'] = (state, step) => {
    const p = player(state, step.player);
    ask(state, { kind: 'room', player: p.id, title: 'Вентиляция: куда?', rooms: step.dests }, { op: 'card.vents.go', player: p.id });
};
OPS['card.vents.go'] = (state, step) => {
    const p = player(state, step.player);
    log(state, pname(p) + ' лезет в вентиляцию: атака чужого (как взрослого).', 'combat');
    phantomAttack(state, p, 'adult');
    next(state, { op: 'move.ifAlive', player: p.id, then: { op: 'move.direct', player: p.id, dest: step.answer, then: BACK } });
};

// ---------------------------------------------------------------------------------------------
// Xenobiologist
// ---------------------------------------------------------------------------------------------
OPS['card.fieldExperience'] = (state, step) => {
    const p = player(state, step.player);
    p.tissue = (p.tissue || 0) + 1; log(state, pname(p) + ' берёт образец ткани (всего ' + p.tissue + ').', 'good');
    const targets = intrudersIn(state, p.room);
    if (!targets.length) { next(state, BACK); return; }
    if (targets.length === 1) { applyHitsNoRoll(state, targets[0], 1); next(state, BACK); return; }
    choice(state, p, 'Полевой опыт: кто получает ранение?', targets.map(t => ({ id: t.uid, label: intruderLabel(state, t) })), 'card.hitOne');
};
OPS['card.hitOne'] = (state, step) => { const it = state.intruders[step.answer]; if (it) applyHitsNoRoll(state, it, step.n || 1); next(state, BACK); };

OPS['card.overmind'] = (state, step) => {
    const p = player(state, step.player);
    const all = Object.values(state.intruders);
    if (!all.length) { log(state, 'На корабле нет чужих — карта потрачена впустую.', 'minor'); next(state, BACK); return; }
    const opts = [];
    if (p.tissue > 0 && p.hand.length) opts.push({ id: 'tissue', label: 'Сбросить 1 карту и 1 образец ткани' });
    if (p.knowledge > 0) opts.push({ id: 'knowledge', label: 'Потратить 1 знание из манипулятора' });
    choice(state, p, 'Сверхразум: чем платить?', opts, 'card.overmind.pay');
};
OPS['card.overmind.pay'] = (state, step) => {
    const p = player(state, step.player);
    if (step.answer === 'knowledge') { spendKnowledge(state, p); next(state, { op: 'card.overmind.who', player: p.id }); return; }
    spendTissue(state, p);
    payCost(state, p, 1, { op: 'card.overmind.who', player: p.id }, 'Сверхразум: оплата');
};
OPS['card.overmind.who'] = (state, step) => {
    const p = player(state, step.player);
    const opts = Object.values(state.intruders).map(i => ({ id: i.uid, label: intruderLabel(state, i) + ' — ' + roomName(state, i.room) }));
    choice(state, p, 'Сверхразум: какого чужого переместить?', opts, 'card.overmind.where');
};
OPS['card.overmind.where'] = (state, step) => {
    const p = player(state, step.player); const it = state.intruders[step.answer];
    if (!it) { next(state, BACK); return; }
    ask(state, { kind: 'room', player: p.id, title: 'Сверхразум: куда переместить ' + intruderLabel(state, it) + '?', rooms: neighbours(state, it.room) }, { op: 'card.overmind.go', player: p.id, uid: it.uid });
};
OPS['card.overmind.go'] = (state, step) => {
    const it = state.intruders[step.uid];
    if (it) { it.room = step.answer; log(state, intruderLabel(state, it) + ' уходит в ' + roomName(state, step.answer) + '.', 'combat'); }
    next(state, BACK);
};

OPS['card.pheromones'] = (state, step) => {
    const p = player(state, step.player);
    if (!(p.tissue > 0)) { log(state, 'Нет образцов ткани — карта потрачена впустую.', 'minor'); next(state, BACK); return; }
    spendTissue(state, p);
    next(state, { op: 'move.start', player: p.id, noAttacks: true, then: BACK });
};

OPS['card.vivisection'] = (state, step) => {
    const p = player(state, step.player);
    const targets = intrudersIn(state, p.room);
    if (!targets.length) { log(state, 'В комнате нет чужих — карта потрачена впустую.', 'minor'); next(state, BACK); return; }
    const opts = [];
    if (p.tissue > 0) opts.push({ id: 'tissue', label: 'Нанести ' + p.tissue + ' ран., сбросить 1 образец ткани' });
    if (p.knowledge > 0) opts.push({ id: 'knowledge', label: 'Потратить 1 знание: нанести ' + Math.max(1, p.tissue || 0) + ' ран.' });
    choice(state, p, 'Вивисекция: чем платить?', opts, 'card.vivisection.pay');
};
OPS['card.vivisection.pay'] = (state, step) => {
    const p = player(state, step.player);
    const n = Math.max(1, p.tissue || 0);
    if (step.answer === 'knowledge') spendKnowledge(state, p); else spendTissue(state, p);
    const targets = intrudersIn(state, p.room);
    if (targets.length === 1) { applyHitsNoRoll(state, targets[0], n); next(state, BACK); return; }
    choice(state, p, 'Вивисекция: цель', targets.map(t => ({ id: t.uid, label: intruderLabel(state, t) })), 'card.hitOne', { n });
};

OPS['card.workspacePlan'] = (state, step) => {
    const p = player(state, step.player);
    const t = tileOf(state, p.room); const opts = [];
    if (t && ROOM_TILES[t].items.includes('green') && !room(state, p.room).malfunction) opts.push({ id: 'know', label: 'Получить 1 знание' });
    for (const r of Object.keys(state.ship.rooms)) if (!room(state, r).explored) opts.push({ id: 'peek:' + r, label: 'Посмотреть тайл комнаты ' + r });
    choice(state, p, 'План работ', opts, 'card.workspacePlan.pick');
};
OPS['card.workspacePlan.pick'] = (state, step) => {
    const p = player(state, step.player);
    if (step.answer === 'know') { gainKnowledge(state, p, 1); next(state, BACK); return; }
    const r = step.answer.slice(5);
    p.knownTiles = p.knownTiles || {}; p.knownTiles[r] = secretTile(state, r);
    ask(state, { kind: 'info', player: p.id, title: 'Только вы это видите', text: 'Комната ' + r + ': ' + ROOM_TILES[secretTile(state, r)].name }, { op: 'noop', then: BACK });
};

