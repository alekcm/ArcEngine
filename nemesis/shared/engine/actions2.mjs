// actions2.mjs — action-card effects of the expansion characters (Pilot, Hacker, Scientist, Medic,
// Janitor, CEO, Lab Rat, Sentry, Android, Convict, Psychologist, Bounty Hunter, Captain) and the
// uses of their starting items. Shares helpers with actions.mjs.

import { OPS, ask, next, log, player, pname, intrudersIn, playersInRoom, room, roomName, tileOf, restoreHealth, removeFire, needDice,
    removeMalfunction, placeMalfunction, drawCards, discardCard, isContam, payCost, placeNoise, corridorsOf, secretTile,
    payableCards, gainContamination, gainWound, removeWound, loseHealth, intruderLabel, HEAVY_NAMES } from './core.mjs';
import { ITEMS, COMPUTER_CARDS, COORDINATE_CARDS, DESTINATION_NAMES, WOUNDS, EVENT_CARDS } from '../data/cards.mjs';
import { ROOM_TILES } from '../ship.mjs';
import { repelIntruder } from './intruders.mjs';
import { dealHits } from './combat.mjs';
import { drawItem, giveItem, roomActionAvailable } from './rooms.mjs';
import { choice, doorOptions, repairOptions } from './actions.mjs';
import { shuffle } from '../rng.mjs';

const BACK = { op: 'turn.choose' };
const compHere = (state, p) => { const t = tileOf(state, p.room); return !!(t && ROOM_TILES[t].computer); };
const noMalf = (state, p) => !room(state, p.room).malfunction;
const others = (state, p, roomId) => state.players.filter(o => o.id !== p.id && o.status === 'active' && o.room === roomId && !o.pod);
const neighbours = (state, roomId) => state.ship.rooms[roomId].exits.map(e => e.to);
const unexploredOpts = state => Object.keys(state.ship.rooms).filter(r => !room(state, r).explored).map(r => ({ id: 'peek:' + r, label: 'Посмотреть тайл комнаты ' + r }));
const markers = (p, key) => p.items.find(i => i.item === key);

/** Shared "peek:xxx" resolver — reveals the tile to the player only. */
function peek(state, p, roomId, then) {
    p.knownTiles = p.knownTiles || {}; p.knownTiles[roomId] = secretTile(state, roomId);
    ask(state, { kind: 'info', player: p.id, title: 'Только вы это видите', text: 'Комната ' + roomId + ': ' + ROOM_TILES[secretTile(state, roomId)].name }, { op: 'noop', then: then || BACK });
}
function useRoomOpt(state, p, opts, label = 'Использовать комнату', extra = {}) {
    const ra = roomActionAvailable(state, p, extra);
    if (ra.ok) opts.push({ id: 'room', label: label + ': ' + ROOM_TILES[tileOf(state, extra.room || p.room)].name });
    return ra.ok;
}
/** Room action that ignores the malfunction rule (Connection, Short temper, It should work). */
function useRoomIgnoringMalf(state, p, then) {
    const tile = tileOf(state, p.room); if (!tile) { next(state, then); return; }
    const rs = room(state, p.room); const had = rs.malfunction; rs.malfunction = false;
    const ra = roomActionAvailable(state, p); rs.malfunction = had;
    if (!ra.ok) { log(state, 'Комнату использовать нельзя: ' + ra.reason, 'minor'); next(state, then); return; }
    next(state, { op: 'room.action', player: p.id, then });
}

// ---------------------------------------------------------------------------------------------
// Pilot
// ---------------------------------------------------------------------------------------------
OPS['card.determination'] = (state, step) => {
    const p = player(state, step.player);
    const rs = room(state, p.room);
    if (rs.malfunction || rs.fire) { log(state, 'В комнате поломка или огонь — карта потрачена впустую.', 'minor'); next(state, BACK); return; }
    drawCards(state, p, 2);
    ask(state, { kind: 'cards', player: p.id, title: 'Сбросьте 1 карту', cards: [...p.hand], min: 1, max: 1 }, { op: 'card.discardPicked', player: p.id, then: BACK });
};
OPS['card.knowledgeOfShip'] = (state, step) => {
    const p = player(state, step.player);
    const opts = [];
    if (!compHere(state, p)) useRoomOpt(state, p, opts);
    opts.push(...doorOptions(state, null), ...unexploredOpts(state));
    choice(state, p, 'Знание корабля', opts, 'card.generic.pick');
};
OPS['card.generic.pick'] = (state, step) => {
    const p = player(state, step.player); const a = step.answer;
    if (a === 'room') { next(state, { op: 'room.action', player: p.id, then: BACK }); return; }
    if (a.startsWith('peek:')) { peek(state, p, a.slice(5)); return; }
    if (a === 'comp') { next(state, { op: 'computer.start', player: p.id, then: BACK }); return; }
    OPS['card.repairPick'](state, step);
};
OPS['card.piloting'] = (state, step) => {
    const p = player(state, step.player);
    const opts = [];
    const tile = tileOf(state, p.room);
    if ((tile === 'cockpit' || compHere(state, p)) && noMalf(state, p)) useRoomOpt(state, p, opts);
    if (compHere(state, p) && noMalf(state, p)) opts.push({ id: 'coords', label: 'Тайно посмотреть координаты' });
    choice(state, p, 'Пилотирование', opts, 'card.piloting.pick');
};
OPS['card.piloting.pick'] = (state, step) => {
    const p = player(state, step.player);
    if (step.answer === 'room') { next(state, { op: 'room.action', player: p.id, then: BACK }); return; }
    p.knownCoords = state.secret.coordinates;
    const c = COORDINATE_CARDS.find(x => x.id === state.secret.coordinates);
    ask(state, { kind: 'info', player: p.id, title: 'Координаты (только вы это видите)', text: ['A', 'B', 'C', 'D'].map(k => k + ': ' + DESTINATION_NAMES[c[k]]).join('\n') + '\nПункт назначения: ' + state.destination }, { op: 'noop', then: BACK });
};

// ---------------------------------------------------------------------------------------------
// Hacker
// ---------------------------------------------------------------------------------------------
OPS['card.masterPlan'] = (state, step) => {
    const p = player(state, step.player);
    const opts = [];
    if (compHere(state, p) && noMalf(state, p) && state.computerCard) opts.push({ id: 'two', label: 'Два действия компьютера' });
    opts.push(...unexploredOpts(state));
    choice(state, p, 'Генеральный план', opts, 'card.masterPlan.pick');
};
OPS['card.masterPlan.pick'] = (state, step) => {
    const p = player(state, step.player);
    if (step.answer === 'two') { state.noLockdownMalf = 2; next(state, { op: 'computer.start', player: p.id, then: { op: 'computer.start', player: p.id, then: { op: 'card.masterPlan.end' } } }); return; }
    peek(state, p, step.answer.slice(5));
};
OPS['card.masterPlan.end'] = (state) => { state.noLockdownMalf = 0; next(state, BACK); };
OPS['card.neuralink'] = (state, step) => {
    const p = player(state, step.player);
    if (!state.computerCard) { log(state, 'Нет карты компьютера.', 'minor'); next(state, BACK); return; }
    next(state, { op: 'computer.start', player: p.id, then: BACK });
};
OPS['card.override'] = (state, step) => {
    const p = player(state, step.player);
    const opts = [];
    if (compHere(state, p) && noMalf(state, p)) for (const id of Object.keys(COMPUTER_CARDS)) opts.push({ id: 'set:' + id, label: 'Сделать текущей: «' + COMPUTER_CARDS[id].name + '»', desc: COMPUTER_CARDS[id].text });
    if (compHere(state, p) && !noMalf(state, p)) opts.push({ id: 'malf', label: 'Убрать поломку в комнате' });
    choice(state, p, 'Переопределение', opts, 'card.override.pick');
};
OPS['card.override.pick'] = (state, step) => {
    const p = player(state, step.player);
    if (step.answer === 'malf') { removeMalfunction(state, p.room); next(state, BACK); return; }
    const id = step.answer.slice(4);
    const all = [...state.computerDeck, ...state.computerDiscard, state.computerCard].filter(Boolean);
    const idx = all.indexOf(id); if (idx >= 0) all.splice(idx, 1);
    state.computerDeck = shuffle(state, all); state.computerDiscard = []; state.computerCard = id;
    log(state, pname(p) + ' переопределяет компьютер: «' + COMPUTER_CARDS[id].name + '».', 'action');
    next(state, BACK);
};
OPS['card.recharge'] = (state, step) => {
    const p = player(state, step.player);
    const g = p.items.find(i => i.item === 'smartGun');
    if (!g) { log(state, 'Умного пистолета нет.', 'minor'); next(state, BACK); return; }
    g.ammo = Math.min(ITEMS.smartGun.weapon.max, g.ammo + 2);
    log(state, 'Умный пистолет заряжен: ' + g.ammo + '/' + ITEMS.smartGun.weapon.max + '.', 'good');
    next(state, BACK);
};

// ---------------------------------------------------------------------------------------------
// Scientist
// ---------------------------------------------------------------------------------------------
const otherCompRooms = (state, p, onlyExplored) => Object.keys(state.ship.rooms).filter(r => r !== p.room && (!onlyExplored || room(state, r).explored) && tileOf(state, r) && ROOM_TILES[tileOf(state, r)].computer);
OPS['card.connection'] = (state, step) => {
    const p = player(state, step.player);
    const opts = [];
    if (compHere(state, p)) opts.push({ id: 'room', label: 'Использовать комнату (даже с поломкой)' });
    if (compHere(state, p) && noMalf(state, p)) for (const r of otherCompRooms(state, p, true)) opts.push({ id: 'malf:' + r, label: (room(state, r).malfunction ? 'Убрать' : 'Поставить') + ' поломку: ' + roomName(state, r) });
    choice(state, p, 'Соединение', opts, 'card.connection.pick');
};
OPS['card.connection.pick'] = (state, step) => {
    const p = player(state, step.player);
    if (step.answer === 'room') { useRoomIgnoringMalf(state, p, BACK); return; }
    const r = step.answer.slice(5);
    if (room(state, r).malfunction) removeMalfunction(state, r); else placeMalfunction(state, r, 'учёный');
    next(state, BACK);
};
OPS['card.intranet'] = (state, step) => {
    const p = player(state, step.player);
    if (!compHere(state, p) || !noMalf(state, p)) { log(state, 'Нужна комната с компьютером без поломки.', 'minor'); next(state, BACK); return; }
    const opts = [];
    for (const r of otherCompRooms(state, p, true)) { const ra = roomActionAvailable(state, p, { room: r }); if (ra.ok) opts.push({ id: r, label: roomName(state, r) }); }
    choice(state, p, 'Интранет: какую комнату использовать?', opts, 'card.intranet.pick');
};
OPS['card.intranet.pick'] = (state, step) => { next(state, { op: 'room.action', player: step.player, room: step.answer, tile: tileOf(state, step.answer), then: BACK }); };
OPS['card.riskAssessment'] = (state, step) => {
    const p = player(state, step.player);
    if (!compHere(state, p) || !noMalf(state, p)) { log(state, 'Нужна комната с компьютером без поломки.', 'minor'); next(state, BACK); return; }
    if (!state.eventDeck.length) state.eventDeck = shuffle(state, state.eventDiscard.splice(0));
    const id = state.eventDeck[0]; const ev = EVENT_CARDS.find(e => e.id === id);
    ask(state, { kind: 'choice', player: p.id, title: 'Верхняя карта событий (только вы это видите)', text: ev ? ev.name + '\n' + ev.text : id,
        options: [{ id: 'top', label: 'Оставить сверху' }, { id: 'bottom', label: 'Положить вниз' }] }, { op: 'card.riskAssessment.pick', player: p.id });
};
OPS['card.riskAssessment.pick'] = (state, step) => {
    if (step.answer === 'bottom') state.eventDeck.push(state.eventDeck.shift());
    log(state, pname(player(state, step.player)) + ' оценивает риски.', 'minor');
    next(state, BACK);
};

// ---------------------------------------------------------------------------------------------
// Medic
// ---------------------------------------------------------------------------------------------
const greenHere = (state, p) => { const t = tileOf(state, p.room); return !!(t && ROOM_TILES[t].items.includes('green')); };
OPS['card.fieldSurgery'] = (state, step) => {
    const p = player(state, step.player);
    const opts = [];
    for (const o of [p, ...others(state, p, p.room)]) for (const w of o.wounds) opts.push({ id: o.id + ':' + w, label: pname(o) + ' — ' + WOUNDS[w].name });
    choice(state, p, 'Полевая хирургия: какую травму убрать?', opts, 'card.fieldSurgery.pick');
};
OPS['card.fieldSurgery.pick'] = (state, step) => {
    const [pid, w] = step.answer.split(':'); const t = player(state, Number(pid));
    removeWound(state, t, w);
    const opts = [{ id: 'contam', label: 'Получить заражение' }];
    if (t.hand.length) opts.push({ id: 'discard', label: 'Сбросить 1 карту' });
    ask(state, { kind: 'choice', player: t.id, title: 'Полевая хирургия: плата', options: opts }, { op: 'card.fieldSurgery.pay', player: t.id });
};
OPS['card.fieldSurgery.pay'] = (state, step) => {
    const t = player(state, step.player);
    if (step.answer === 'contam') { gainContamination(state, t, 1); next(state, BACK); return; }
    ask(state, { kind: 'cards', player: t.id, title: 'Сбросьте 1 карту', cards: [...t.hand], min: 1, max: 1 }, { op: 'card.discardPicked', player: t.id, then: BACK });
};
OPS['card.firstAid'] = (state, step) => {
    const p = player(state, step.player);
    const opts = [{ id: 'heal', label: 'Восстановить 2 здоровья' }];
    if (greenHere(state, p) && noMalf(state, p)) opts.push({ id: 'item', label: 'Взять 1 зелёный предмет' });
    choice(state, p, 'Первая помощь', opts, 'card.firstAid.pick');
};
OPS['card.firstAid.pick'] = (state, step) => {
    const p = player(state, step.player);
    if (step.answer === 'heal') { restoreHealth(state, p, 2); next(state, BACK); return; }
    const key = drawItem(state, 'green');
    if (!key) { next(state, BACK); return; }
    ask(state, { kind: 'choice', player: p.id, title: 'Найдено: «' + ITEMS[key].name + '»', text: ITEMS[key].text, options: [{ id: 'keep', label: 'Оставить' }, { id: 'drop', label: 'Сбросить' }] }, { op: 'card.keepOrDrop', player: p.id, key });
};
OPS['card.keepOrDrop'] = (state, step) => {
    const p = player(state, step.player);
    if (step.answer === 'keep') giveItem(state, p, step.key); else (state.itemDiscard[ITEMS[step.key].deck] = state.itemDiscard[ITEMS[step.key].deck] || []).push(step.key);
    next(state, BACK);
};
OPS['card.neurotoxicGas'] = (state, step) => {
    const p = player(state, step.player);
    choice(state, p, 'Нейротоксин: какой зелёный предмет сбросить?', p.items.filter(i => ITEMS[i.item].deck === 'green').map(i => ({ id: i.uid, label: ITEMS[i.item].name })), 'card.neurotoxicGas.pick');
};
OPS['card.neurotoxicGas.pick'] = (state, step) => {
    const p = player(state, step.player);
    const inst = p.items.find(i => i.uid === step.answer);
    if (inst) { p.items = p.items.filter(i => i !== inst); (state.itemDiscard.green = state.itemDiscard.green || []).push(inst.item); }
    const comp = others(state, p, p.room).map(o => ({ id: String(o.id), label: 'Взять с собой: ' + pname(o) }));
    const go = { op: 'move.start', player: p.id, noAttacks: true, then: { op: 'card.neurotoxicGas.after', player: p.id, from: p.room } };
    if (comp.length) { ask(state, { kind: 'choice', player: p.id, title: 'Кого взять с собой?', options: [{ id: 'none', label: 'Никого' }, ...comp] }, { op: 'card.neurotoxicGas.go', player: p.id, go }); return; }
    next(state, go);
};
OPS['card.neurotoxicGas.go'] = (state, step) => { next(state, { ...step.go, companion: step.answer === 'none' ? undefined : Number(step.answer) }); };
OPS['card.neurotoxicGas.after'] = (state, step) => {
    const p = player(state, step.player);
    for (const o of others(state, p, step.from)) if (o.hand.length) { discardCard(state, o, o.hand[0]); log(state, pname(o) + ' сбрасывает карту от газа.', 'minor'); }
    next(state, BACK);
};
OPS['card.synthesizedDrugs'] = (state, step) => {
    const p = player(state, step.player);
    const rs = room(state, p.room);
    if (!greenHere(state, p) || rs.malfunction || rs.fire) { log(state, 'Нужна комната с зелёным значком без поломки и огня.', 'minor'); next(state, BACK); return; }
    choice(state, p, 'Стимуляторы: кому?', [p, ...others(state, p, p.room)].map(o => ({ id: String(o.id), label: pname(o) + ' (карт: ' + o.hand.length + (o.passed ? ', спасовал' : '') + ')' })), 'card.synthesizedDrugs.pick');
};
OPS['card.synthesizedDrugs.pick'] = (state, step) => {
    const t = player(state, Number(step.answer));
    const n = Math.max(0, Math.min(2, 3 - t.hand.length));
    if (n) drawCards(state, t, n);
    if (t.passed) { t.passed = false; log(state, pname(t) + ' снова в игре!', 'good'); }
    next(state, BACK);
};

// ---------------------------------------------------------------------------------------------
// Janitor
// ---------------------------------------------------------------------------------------------
OPS['card.cleanUp'] = (state, step) => {
    const p = player(state, step.player); const rs = room(state, p.room);
    const opts = [];
    if (rs.malfunction) opts.push({ id: 'malf', label: 'Убрать поломку' });
    if (rs.fire) opts.push({ id: 'fire', label: 'Убрать огонь' });
    choice(state, p, 'Уборка', opts, 'card.cleanUp.pick');
};
OPS['card.cleanUp.pick'] = (state, step) => {
    const p = player(state, step.player);
    if (step.answer === 'malf') removeMalfunction(state, p.room); else removeFire(state, p.room);
    next(state, BACK);
};
OPS['card.emergencyKey'] = (state, step) => {
    const p = player(state, step.player);
    const opts = [];
    if (state.ship.rooms[p.room].tech) opts.push({ id: 'tech', label: 'Перейти по тех. коридорам' });
    opts.push(...doorOptions(state, null).slice(0, 40));
    choice(state, p, 'Аварийный ключ', opts, 'card.emergencyKey.pick');
};
OPS['card.emergencyKey.pick'] = (state, step) => {
    const p = player(state, step.player);
    if (step.answer === 'tech') { const rooms = Object.keys(state.ship.rooms).filter(r => state.ship.rooms[r].tech && r !== p.room); ask(state, { kind: 'room', player: p.id, title: 'Куда?', rooms }, { op: 'card.techDest', player: p.id }); return; }
    OPS['card.repairPick'](state, step);
};
OPS['card.techDest'] = (state, step) => { next(state, { op: 'move.direct', player: step.player, dest: step.answer, then: BACK }); };
OPS['card.itShouldWork'] = (state, step) => {
    const p = player(state, step.player);
    const opts = [];
    for (const w of p.items.filter(i => ITEMS[i.item].weapon && i.ammo < ITEMS[i.item].weapon.max)) opts.push({ id: 'load:' + w.uid, label: 'Зарядить: ' + ITEMS[w.item].name + ' (' + w.ammo + '/' + ITEMS[w.item].weapon.max + ')' });
    for (const w of p.items.filter(i => i.broken)) opts.push({ id: 'fix:' + w.uid, label: 'Починить: ' + ITEMS[w.item].name });
    if (tileOf(state, p.room) && payableCards(p).length) opts.push({ id: 'room', label: 'Сбросить 1 карту: использовать комнату (даже с поломкой)' });
    choice(state, p, 'Должно работать', opts, 'card.itShouldWork.pick');
};
OPS['card.itShouldWork.pick'] = (state, step) => {
    const p = player(state, step.player); const a = step.answer;
    if (a === 'room') { payCost(state, p, 1, { op: 'card.roomIgnoringMalf', player: p.id }, 'Должно работать: оплата'); return; }
    const w = p.items.find(i => i.uid === a.slice(a.indexOf(':') + 1));
    if (w && a.startsWith('load:')) { w.ammo++; log(state, '«' + ITEMS[w.item].name + '» заряжено: ' + w.ammo + '.', 'good'); }
    if (w && a.startsWith('fix:')) { w.broken = false; log(state, '«' + ITEMS[w.item].name + '» починено.', 'good'); }
    next(state, BACK);
};
OPS['card.roomIgnoringMalf'] = (state, step) => useRoomIgnoringMalf(state, player(state, step.player), BACK);
OPS['card.maintenancePlan'] = (state, step) => {
    const p = player(state, step.player);
    const opts = [];
    if (compHere(state, p) && noMalf(state, p) && payableCards(p).length) for (const r of Object.keys(state.ship.rooms)) { const t = tileOf(state, r); if (t && ROOM_TILES[t].items.includes('yellow') && room(state, r).malfunction) opts.push({ id: 'malf:' + r, label: 'Сбросить 1 карту: убрать поломку в ' + roomName(state, r) }); }
    opts.push(...unexploredOpts(state));
    choice(state, p, 'План обслуживания', opts, 'card.maintenancePlan.pick');
};
OPS['card.maintenancePlan.pick'] = (state, step) => {
    const p = player(state, step.player);
    if (step.answer.startsWith('peek:')) { peek(state, p, step.answer.slice(5)); return; }
    payCost(state, p, 1, { op: 'card.removeMalfAt', player: p.id, room: step.answer.slice(5) }, 'План обслуживания: оплата');
};
OPS['card.removeMalfAt'] = (state, step) => { removeMalfunction(state, step.room); next(state, BACK); };

// ---------------------------------------------------------------------------------------------
// CEO (robot markers) / Captain / Psychologist "command" family
// ---------------------------------------------------------------------------------------------
OPS['card.backupBattery'] = (state, step) => {
    const p = player(state, step.player); const r = markers(p, 'robot');
    if (r) { r.charge = ITEMS.robot.markers; log(state, 'Робот полностью заряжен (' + r.charge + ').', 'good'); }
    next(state, BACK);
};
OPS['card.protect'] = (state, step) => { next(state, { op: 'move.start', player: step.player, noAttacks: true, then: BACK }); };
OPS['card.roboticPunch'] = (state, step) => {
    const p = player(state, step.player);
    choice(state, p, 'Удар робота: цель', intrudersIn(state, p.room).map(i => ({ id: i.uid, label: intruderLabel(state, i) })), 'card.roboticPunch.target');
};
OPS['card.roboticPunch.target'] = (state, step) => {
    const p = player(state, step.player); const r = markers(p, 'robot'); const charge = r ? (r.charge ?? ITEMS.robot.markers) : 0;
    const opts = []; for (let k = 0; k <= charge; k++) opts.push({ id: String(k), label: 'Потратить ' + k + ' жетонов (' + (1 + k) + ' ранений)' });
    ask(state, { kind: 'choice', player: p.id, title: 'Сколько жетонов энергии потратить?', options: opts }, { op: 'card.roboticPunch.hit', player: p.id, target: step.answer });
};
OPS['card.roboticPunch.hit'] = (state, step) => {
    const p = player(state, step.player); const r = markers(p, 'robot'); const k = Number(step.answer);
    if (r) r.charge = (r.charge ?? ITEMS.robot.markers) - k;
    const it = state.intruders[step.target];
    if (it) { log(state, '🤖 Робот бьёт ' + intruderLabel(state, it) + ' (' + (1 + k) + ' ран.).', 'combat'); dealHits(state, p, it, 1 + k, 0, { noRetaliation: true }); }
    next(state, BACK);
};
OPS['card.command'] = (state, step) => {
    const p = player(state, step.player);
    const near = step.effectOnlyRoom ? [p.room] : [p.room, ...neighbours(state, p.room)];
    const opts = [];
    for (const r of near) for (const o of others(state, p, r)) opts.push({ id: String(o.id), label: pname(o) + ' — ' + roomName(state, r) });
    choice(state, p, 'Приказ: кому?', opts, 'card.command.who', { draw: step.effect !== 'wouldYouKindly' });
};
OPS['card.command.who'] = (state, step) => {
    const p = player(state, step.player); const t = player(state, Number(step.answer));
    if (step.draw !== false) drawCards(state, t, 1);
    const opts = [];
    if (!intrudersIn(state, t.room).length) opts.push({ id: 'move', label: 'Переместиться' });
    if (intrudersIn(state, t.room).length && t.items.some(i => ITEMS[i.item].weapon && i.ammo > 0 && !i.broken)) opts.push({ id: 'shoot', label: 'Стрелять' });
    if (!opts.length) { log(state, pname(t) + ' не может выполнить приказ.', 'minor'); next(state, BACK); return; }
    ask(state, { kind: 'choice', player: p.id, title: 'Что делает ' + pname(t) + '?', options: opts }, { op: 'card.command.do', player: p.id, target: t.id });
};
OPS['card.command.do'] = (state, step) => {
    const t = player(state, step.target);
    if (step.answer === 'move') next(state, { op: 'move.start', player: t.id, then: BACK });
    else next(state, { op: 'shoot.start', player: t.id, then: BACK });
};
OPS['card.wouldYouKindly'] = (state, step) => OPS['card.command'](state, { ...step, effectOnlyRoom: true, effect: 'wouldYouKindly' });
OPS['card.fanning'] = (state, step) => {
    const p = player(state, step.player); const g = p.items.find(i => i.item === 'sixShooter' && !i.broken);
    if (!g || !g.ammo) { log(state, 'Шестизарядник пуст.', 'minor'); next(state, BACK); return; }
    const targets = intrudersIn(state, p.room);
    if (!targets.length) { next(state, BACK); return; }
    const opts = []; for (let k = 1; k <= g.ammo; k++) opts.push({ id: String(k), label: k + ' патрон(ов) — ' + k + ' ранений' });
    ask(state, { kind: 'choice', player: p.id, title: 'Веер: сколько патронов потратить?', options: opts }, { op: 'card.fanning.n', player: p.id, uid: g.uid });
};
OPS['card.fanning.n'] = (state, step) => {
    const p = player(state, step.player);
    choice(state, p, 'Веер: цель', intrudersIn(state, p.room).map(i => ({ id: i.uid, label: intruderLabel(state, i) })), 'card.fanning.hit', { n: Number(step.answer), uid: step.uid });
};
OPS['card.fanning.hit'] = (state, step) => {
    const p = player(state, step.player); const g = p.items.find(i => i.uid === step.uid); const it = state.intruders[step.answer];
    if (g) g.ammo -= step.n;
    if (it) { log(state, '🔫 Веер: ' + step.n + ' выстрелов в ' + intruderLabel(state, it) + '.', 'combat'); dealHits(state, p, it, step.n, 0, { noRetaliation: true }); }
    next(state, BACK);
};
OPS['card.motivation'] = (state, step) => {
    const p = player(state, step.player);
    const rooms = new Set([p.room, ...neighbours(state, p.room)]);
    for (const o of state.players) if (o.status === 'active' && rooms.has(o.room) && o.hand.length < 7) drawCards(state, o, 1);
    next(state, BACK);
};
OPS['card.reload'] = (state, step) => {
    const p = player(state, step.player); const g = p.items.find(i => i.item === 'sixShooter');
    if (!g) { log(state, 'Шестизарядника нет.', 'minor'); next(state, BACK); return; }
    const max = ITEMS.sixShooter.weapon.max;
    g.ammo = Math.min(max, g.ammo + 1); log(state, 'Шестизарядник: ' + g.ammo + '/' + max + '.', 'good');
    if (g.ammo < max && payableCards(p).length) { ask(state, { kind: 'choice', player: p.id, title: 'Сбросить ещё 1 карту, чтобы зарядить ещё 1 патрон?', options: [{ id: 'yes', label: 'Да' }, { id: 'no', label: 'Нет' }] }, { op: 'card.reload.more', player: p.id, uid: g.uid }); return; }
    next(state, BACK);
};
OPS['card.reload.more'] = (state, step) => {
    const p = player(state, step.player);
    if (step.answer === 'yes') { payCost(state, p, 1, { op: 'card.reload.add', player: p.id, uid: step.uid }, 'Перезарядка: оплата'); return; }
    next(state, BACK);
};
OPS['card.reload.add'] = (state, step) => { const p = player(state, step.player); const g = p.items.find(i => i.uid === step.uid); if (g) g.ammo++; next(state, BACK); };

// ---------------------------------------------------------------------------------------------
// Lab Rat
// ---------------------------------------------------------------------------------------------
OPS['card.feelOfDark'] = (state, step) => { payCost(state, player(state, step.player), 1, { op: 'move.start', player: step.player, preventOne: true, noNoise: true, then: BACK }, 'Чувство темноты: оплата'); };
OPS['card.sensitiveHearing'] = (state, step) => {
    const p = player(state, step.player);
    const opts = [];
    if (state.ship.techNoise) opts.push({ id: 'rm:tech', label: 'Убрать шум: тех. коридоры' });
    for (const c of Object.values(state.ship.corridors)) opts.push(c.noise ? { id: 'rm:' + c.id, label: 'Убрать шум: коридор ' + c.id } : { id: 'add:' + c.id, label: 'Положить шум: коридор ' + c.id });
    choice(state, p, 'Острый слух', opts, 'card.sensitiveHearing.pick');
};
OPS['card.sensitiveHearing.pick'] = (state, step) => {
    const a = step.answer;
    if (a === 'rm:tech') state.ship.techNoise = false;
    else if (a.startsWith('rm:')) { state.ship.corridors[a.slice(3)].noise = false; log(state, 'Шум убран из коридора ' + a.slice(3) + '.', 'good'); }
    else placeNoise(state, a.slice(4));
    next(state, BACK);
};
OPS['card.shriek'] = (state, step) => {
    const p = player(state, step.player);
    const a = intrudersIn(state, p.room).find(i => i.type === 'adult');
    if (!a) { log(state, 'Взрослых чужих нет.', 'minor'); next(state, BACK); return; }
    gainContamination(state, p, 1);
    if (repelIntruder(state, a)) { next(state, { op: 'noise.roll', player: p.id, room: a.room }, BACK); return; }
    next(state, BACK);
};
OPS['card.weirdMetabolism'] = (state, step) => {
    const p = player(state, step.player);
    const opts = [];
    if (p.hand.some(isContam)) opts.push({ id: 'contam', label: 'Сбросить 1 заражение: взять 2 карты' });
    room(state, p.room).objects.forEach((o, i) => opts.push({ id: 'eat:' + i, label: 'Уничтожить объект «' + HEAVY_NAMES[o.type] + '»: лечение' }));
    choice(state, p, 'Странный метаболизм', opts, 'card.weirdMetabolism.pick');
};
OPS['card.weirdMetabolism.pick'] = (state, step) => {
    const p = player(state, step.player);
    if (step.answer === 'contam') { const c = p.hand.find(isContam); discardCard(state, p, c); drawCards(state, p, 2); next(state, BACK); return; }
    const rs = room(state, p.room); const idx = Number(step.answer.slice(4)); const o = rs.objects[idx];
    if (o) { rs.objects.splice(idx, 1); log(state, pname(p) + ' поглощает объект «' + HEAVY_NAMES[o.type] + '».', 'action'); }
    restoreHealth(state, p, 2);
    if (p.wounds.length) { ask(state, { kind: 'choice', player: p.id, title: 'Убрать тяжёлую травму?', options: [{ id: 'none', label: 'Нет' }, ...p.wounds.map(w => ({ id: w, label: WOUNDS[w].name }))] }, { op: 'card.removeWoundPick', player: p.id }); return; }
    next(state, BACK);
};
OPS['card.removeWoundPick'] = (state, step) => { if (step.answer !== 'none') removeWound(state, player(state, step.player), step.answer); next(state, BACK); };

// ---------------------------------------------------------------------------------------------
// Sentry
// ---------------------------------------------------------------------------------------------
OPS['card.defensePlan'] = (state, step) => {
    const p = player(state, step.player);
    const opts = [];
    for (const c of corridorsOf(state, p.room)) if (c.id !== 'tech' && state.ship.corridors[c.id].noise) opts.push({ id: 'rm:' + c.id, label: 'Убрать шум из коридора ' + c.id });
    opts.push(...unexploredOpts(state));
    choice(state, p, 'План обороны', opts, 'card.defensePlan.pick');
};
OPS['card.defensePlan.pick'] = (state, step) => {
    const p = player(state, step.player);
    if (step.answer.startsWith('peek:')) { peek(state, p, step.answer.slice(5)); return; }
    state.ship.corridors[step.answer.slice(3)].noise = false; log(state, 'Шум убран из коридора ' + step.answer.slice(3) + '.', 'good');
    const doors = corridorsOf(state, p.room).filter(c => c.id !== 'tech' && state.ship.corridors[c.id].door === 'open').map(c => ({ id: c.id, label: 'Закрыть дверь ' + c.id }));
    if (!doors.length) { next(state, BACK); return; }
    ask(state, { kind: 'choice', player: p.id, title: 'Закрыть дверь?', options: [{ id: 'none', label: 'Нет' }, ...doors] }, { op: 'card.defensePlan.door', player: p.id });
};
OPS['card.defensePlan.door'] = (state, step) => { if (step.answer !== 'none') { state.ship.corridors[step.answer].door = 'closed'; log(state, 'Дверь ' + step.answer + ' закрыта.', 'event'); } next(state, BACK); };
OPS['card.facilityTour'] = (state, step) => {
    const p = player(state, step.player);
    // Printed additional discard is paid once, before the destination is chosen.
    payCost(state, p, 1, { op: 'card.facilityTour.choose', player: p.id, then: BACK }, 'Обход объекта: доплата');
};
OPS['card.facilityTour.choose'] = (state, step) => {
    const p = player(state, step.player);
    const opts = [{ id: String(p.id), label: 'Вы сами' }, ...others(state, p, p.room).map(o => ({ id: String(o.id), label: pname(o) }))];
    choice(state, p, 'Обход объекта: кто перемещается?', opts, 'card.facilityTour.pick', { then: step.then });
};
OPS['card.facilityTour.pick'] = (state, step) => {
    next(state, { op: 'move.start', player: Number(step.answer), noAttacks: true, ignoreToken: true, then: BACK });
};
OPS['card.securityControl'] = (state, step) => {
    const p = player(state, step.player);
    const opts = [];
    // Printed: any room with a red Item icon holding an Intruder — then a normal shooting roll.
    for (const i of Object.values(state.intruders)) {
        const t = tileOf(state, i.room);
        if (t && ROOM_TILES[t].items.includes('red')) opts.push({ id: 'hit:' + i.uid, label: 'Выстрел по ' + intruderLabel(state, i) + ' в ' + roomName(state, i.room) });
    }
    opts.push(...doorOptions(state, null));
    choice(state, p, 'Пульт охраны', opts, 'card.securityControl.pick');
};
OPS['card.securityControl.pick'] = (state, step) => {
    const p = player(state, step.player);
    if (String(step.answer).startsWith('hit:')) {
        const dev = p.items.find(i => i.item === 'securityControl');
        const it = state.intruders[step.answer.slice(4)];
        if (!it) { next(state, BACK); return; }
        if (needDice(state, step, 'combat', p.id, 'Пульт охраны: бросок боя')) return;
        const natural = state.lastRoll ? state.lastRoll.value : null;
        dealHits(state, p, it, 1, 0, { weapon: null });
        if (natural === 2 || natural === 3) { if (dev) dev.broken = true; log(state, 'Символ поломки: пульт охраны ломается.', 'bad'); }
        next(state, BACK);
        return;
    }
    if (step.answer.startsWith('hit:')) { const it = state.intruders[step.answer.slice(4)]; if (it) dealHits(state, p, it, 2, 0, { noRetaliation: true }); next(state, BACK); return; }
    OPS['card.repairPick'](state, step);
};
OPS['card.stun'] = (state, step) => {
    const p = player(state, step.player);
    const opts = [];
    for (const o of state.players) if (o.status === 'active' && o.hand.length <= 3 && !o.passed) opts.push({ id: 'stun:' + o.id, label: 'Оглушить: ' + pname(o) + ' (карт: ' + o.hand.length + ')' });
    if (intrudersIn(state, p.room).some(i => i.type === 'adult')) for (const w of p.items.filter(i => ITEMS[i.item].weapon && !i.broken)) opts.push({ id: 'break:' + w.uid, label: 'Сломать «' + ITEMS[w.item].name + '»: отогнать взрослого' });
    choice(state, p, 'Оглушение', opts, 'card.stun.pick');
};
OPS['card.stun.pick'] = (state, step) => {
    const p = player(state, step.player);
    if (step.answer.startsWith('stun:')) {
        const t = player(state, Number(step.answer.slice(5)));
        for (const c of [...t.hand]) discardCard(state, t, c);
        t.passed = true; log(state, pname(t) + ' оглушён: сбрасывает карты и пасует.', 'event');
        if (t.id === p.id) { next(state, { op: 'turn.end' }); return; }
        next(state, BACK); return;
    }
    const w = p.items.find(i => i.uid === step.answer.slice(6)); if (w) w.broken = true;
    const a = intrudersIn(state, p.room).find(i => i.type === 'adult');
    if (a && repelIntruder(state, a)) { next(state, { op: 'noise.roll', player: p.id, room: a.room }, BACK); return; }
    next(state, BACK);
};

// ---------------------------------------------------------------------------------------------
// Android (UPS markers)
// ---------------------------------------------------------------------------------------------
const upsOf = p => markers(p, 'ups');
OPS['card.alwaysPrepared'] = (state, step) => {
    const p = player(state, step.player);
    const opts = [];
    const intr = intrudersIn(state, p.room);
    { const rs = room(state, p.room); const t = tileOf(state, p.room); if (t) { const saved = intr.map(i => i.uid); const ra = (() => { const tmp = Object.entries(state.intruders).filter(([, i]) => i.room === p.room); for (const [k] of tmp) delete state.intruders[k]; const r = roomActionAvailable(state, p); for (const [k, v] of tmp) state.intruders[k] = v; return r; })(); void saved; void rs; if (ra.ok) opts.push({ id: 'room', label: 'Использовать комнату (затем атаки чужих)' }); } }
    if (!intr.length && payableCards(p).length) for (const d of ['green', 'red', 'yellow']) opts.push({ id: 'item:' + d, label: 'Сбросить 1 карту: взять ' + ({ green: 'зелёный', red: 'красный', yellow: 'жёлтый' })[d] + ' предмет' });
    choice(state, p, 'Всегда готов', opts, 'card.alwaysPrepared.pick');
};
OPS['card.alwaysPrepared.pick'] = (state, step) => {
    const p = player(state, step.player);
    if (step.answer === 'room') {
        const attacks = intrudersIn(state, p.room).map(i => ({ op: 'attack', intruder: i.uid, player: p.id, context: 'retaliation' }));
        const tmp = Object.entries(state.intruders).filter(([, i]) => i.room === p.room); for (const [k] of tmp) delete state.intruders[k];
        next(state, { op: 'room.action', player: p.id, then: { op: 'card.alwaysPrepared.restore', saved: tmp, attacks } });
        return;
    }
    payCost(state, p, 1, { op: 'card.alwaysPrepared.item', player: p.id, deck: step.answer.slice(5) }, 'Всегда готов: оплата');
};
OPS['card.alwaysPrepared.restore'] = (state, step) => { for (const [k, v] of step.saved) state.intruders[k] = v; next(state, ...step.attacks, BACK); };
OPS['card.alwaysPrepared.item'] = (state, step) => {
    const p = player(state, step.player); const key = drawItem(state, step.deck);
    if (!key) { next(state, BACK); return; }
    ask(state, { kind: 'choice', player: p.id, title: 'Найдено: «' + ITEMS[key].name + '»', text: ITEMS[key].text, options: [{ id: 'keep', label: 'Оставить' }, { id: 'drop', label: 'Сбросить' }] }, { op: 'card.keepOrDrop', player: p.id, key });
};
OPS['card.powerUp'] = (state, step) => {
    const p = player(state, step.player);
    const opts = [];
    if (noMalf(state, p)) opts.push({ id: 'malf', label: 'Поставить поломку: +1 жетон ИБП' });
    for (const i of p.items.filter(i => i.item === 'energyCharge')) opts.push({ id: 'en:' + i.uid, label: 'Сбросить «Энергозаряд»: +2 жетона ИБП' });
    choice(state, p, 'Подзарядка', opts, 'card.powerUp.pick');
};
OPS['card.powerUp.pick'] = (state, step) => {
    const p = player(state, step.player); const u = upsOf(p);
    if (step.answer === 'malf') { placeMalfunction(state, p.room, 'андроид'); if (u) u.charge = (u.charge ?? ITEMS.ups.markers) + 1; }
    else { const inst = p.items.find(i => i.uid === step.answer.slice(3)); if (inst) { p.items = p.items.filter(i => i !== inst); (state.itemDiscard[ITEMS[inst.item].deck] = state.itemDiscard[ITEMS[inst.item].deck] || []).push(inst.item); } if (u) u.charge = (u.charge ?? ITEMS.ups.markers) + 2; }
    if (u) log(state, 'ИБП: ' + u.charge + ' жетонов.', 'good');
    next(state, BACK);
};
OPS['card.protocolOverride'] = (state, step) => {
    const p = player(state, step.player); const u = upsOf(p);
    if (!u || (u.charge ?? ITEMS.ups.markers) <= 0) { log(state, 'Нет жетонов ИБП.', 'minor'); next(state, BACK); return; }
    const opts = state.players.filter(o => o.status === 'active').map(o => ({ id: 'wound:' + o.id, label: 'Тяжёлая травма: ' + pname(o) }));
    if (compHere(state, p) && noMalf(state, p) && state.time > 8) opts.push({ id: 'coords', label: 'Сменить карту координат' });
    choice(state, p, 'Обход протокола', opts, 'card.protocolOverride.pick');
};
OPS['card.protocolOverride.pick'] = (state, step) => {
    const p = player(state, step.player); const u = upsOf(p);
    if (u) u.charge = (u.charge ?? ITEMS.ups.markers) - 1;
    if (step.answer === 'coords') {
        const other = COORDINATE_CARDS.filter(c => c.id !== state.secret.coordinates);
        state.secret.coordinates = other[Math.floor(state.time) % other.length].id;
        for (const o of state.players) o.knownCoords = null;
        log(state, 'Карта координат заменена.', 'event');
    } else gainWound(state, player(state, Number(step.answer.slice(6))), 1);
    next(state, BACK);
};
OPS['card.selfRepair'] = (state, step) => {
    const p = player(state, step.player);
    const opts = [];
    for (const i of p.items.filter(i => ['ductTape', 'tools', 'cables'].includes(i.item))) opts.push({ id: 'use:' + i.uid, label: 'Сбросить «' + ITEMS[i.item].name + '»: лечение' });
    if (!noMalf(state, p)) opts.push({ id: 'malf', label: 'Убрать поломку в комнате' });
    choice(state, p, 'Самопочинка', opts, 'card.selfRepair.pick');
};
OPS['card.selfRepair.pick'] = (state, step) => {
    const p = player(state, step.player);
    if (step.answer === 'malf') { removeMalfunction(state, p.room); next(state, BACK); return; }
    const inst = p.items.find(i => i.uid === step.answer.slice(4));
    if (inst) { p.items = p.items.filter(i => i !== inst); (state.itemDiscard[ITEMS[inst.item].deck] = state.itemDiscard[ITEMS[inst.item].deck] || []).push(inst.item); }
    restoreHealth(state, p, 2);
    if (p.wounds.length) { ask(state, { kind: 'choice', player: p.id, title: 'Убрать тяжёлую травму?', options: [{ id: 'none', label: 'Нет' }, ...p.wounds.map(w => ({ id: w, label: WOUNDS[w].name }))] }, { op: 'card.removeWoundPick', player: p.id }); return; }
    next(state, BACK);
};

// ---------------------------------------------------------------------------------------------
// Convict (cuffs)
// ---------------------------------------------------------------------------------------------
const cuffsOn = p => { const c = markers(p, 'cuffs'); return c && (c.charge ?? ITEMS.cuffs.markers) > 0; };
function dropCuffMarker(state, p) {
    const c = markers(p, 'cuffs'); if (!c) return;
    c.charge = (c.charge ?? ITEMS.cuffs.markers) - 1;
    log(state, 'Наручники: осталось жетонов ' + c.charge + (c.charge <= 0 ? ' — наручники сняты!' : '.'), c.charge <= 0 ? 'good' : 'minor');
}
OPS['card.bash'] = (state, step) => {
    const p = player(state, step.player);
    let bonus = 1;
    if (cuffsOn(p)) dropCuffMarker(state, p); else bonus = 2;
    next(state, { op: 'melee.start', player: p.id, bonusHits: bonus, then: BACK });
};
OPS['card.catchThis'] = (state, step) => {
    const p = player(state, step.player);
    choice(state, p, 'Лови! Какой тяжёлый предмет бросить?', p.items.filter(i => ITEMS[i.item].kind === 'heavy' && !ITEMS[i.item].quest).map(i => ({ id: i.uid, label: ITEMS[i.item].name })), 'card.catchThis.pick');
};
OPS['card.catchThis.pick'] = (state, step) => {
    const p = player(state, step.player);
    const inst = p.items.find(i => i.uid === step.answer);
    if (inst) { p.items = p.items.filter(i => i !== inst); (state.itemDiscard[ITEMS[inst.item].deck] = state.itemDiscard[ITEMS[inst.item].deck] || []).push(inst.item); log(state, pname(p) + ' швыряет «' + ITEMS[inst.item].name + '».', 'action'); }
    next(state, { op: 'move.start', player: p.id, noAttacks: true, noNoise: !cuffsOn(p), then: BACK });
};
OPS['card.intimidate'] = (state, step) => {
    const p = player(state, step.player);
    choice(state, p, 'Запугивание: кого?', others(state, p, p.room).map(o => ({ id: String(o.id), label: pname(o) })), 'card.intimidate.pick');
};
OPS['card.intimidate.pick'] = (state, step) => {
    const p = player(state, step.player); const t = player(state, Number(step.answer));
    const opts = [{ id: 'hp', label: 'Потерять 2 здоровья' }];
    if (cuffsOn(p)) opts.push({ id: 'cuff', label: 'Снять 1 жетон с наручников заключённого' });
    if (t.hand.length >= 2) opts.push({ id: 'cards', label: 'Сбросить 2 карты' });
    ask(state, { kind: 'choice', player: t.id, title: pname(p) + ' запугивает вас. Что выбираете?', options: opts }, { op: 'card.intimidate.resolve', player: t.id, convict: p.id });
};
OPS['card.intimidate.resolve'] = (state, step) => {
    const t = player(state, step.player); const p = player(state, step.convict);
    if (step.answer === 'hp') { loseHealth(state, t, 2, 'запугивание'); next(state, BACK); return; }
    if (step.answer === 'cuff') { dropCuffMarker(state, p); next(state, BACK); return; }
    ask(state, { kind: 'cards', player: t.id, title: 'Сбросьте 2 карты', cards: [...t.hand], min: 2, max: 2 }, { op: 'card.discardPicked', player: t.id, then: BACK });
};
OPS['card.shortTemper'] = (state, step) => {
    const p = player(state, step.player);
    const opts = [];
    if (tileOf(state, p.room)) opts.push({ id: 'room', label: 'Использовать комнату (даже с поломкой)' });
    if (cuffsOn(p)) opts.push({ id: 'cuff', label: 'Снять 1 жетон с наручников' });
    choice(state, p, 'Вспыльчивость', opts, 'card.shortTemper.pick');
};
OPS['card.shortTemper.pick'] = (state, step) => {
    const p = player(state, step.player);
    const noise = { op: 'noise.roll', player: p.id, room: p.room };
    if (step.answer === 'cuff') { dropCuffMarker(state, p); next(state, noise, BACK); return; }
    useRoomIgnoringMalf(state, p, { op: 'card.shortTemper.noise', player: p.id });
};
OPS['card.shortTemper.noise'] = (state, step) => { const p = player(state, step.player); next(state, { op: 'noise.roll', player: p.id, room: p.room }, BACK); };

// ---------------------------------------------------------------------------------------------
// Psychologist
// ---------------------------------------------------------------------------------------------
OPS['card.emotionScanner'] = (state, step) => {
    const p = player(state, step.player);
    const rooms = p.items.some(i => i.item === 'oculobe') ? [p.room, ...neighbours(state, p.room)] : [p.room];
    const opts = []; for (const r of rooms) for (const o of others(state, p, r)) if (o.deck.length) opts.push({ id: String(o.id), label: pname(o) });
    choice(state, p, 'Сканер эмоций: чью колоду посмотреть?', opts, 'card.emotionScanner.pick');
};
OPS['card.emotionScanner.pick'] = (state, step) => {
    const p = player(state, step.player); const t = player(state, Number(step.answer));
    const c = t.deck[0]; const d = c.startsWith('contam#') ? { name: 'Заражение' } : (() => { const [ch, key] = c.split('#')[0].split('.'); return (state.fieldData && state.fieldData[key]) || { name: key }; })();
    const name = c.startsWith('contam#') ? 'Заражение' : (d.name || c);
    ask(state, { kind: 'choice', player: p.id, title: 'Верхняя карта ' + pname(t) + ': ' + name, options: [{ id: 'discard', label: 'Сбросить её' }, { id: 'hand', label: 'Отдать в руку' }] }, { op: 'card.emotionScanner.do', player: p.id, target: t.id });
};
OPS['card.emotionScanner.do'] = (state, step) => {
    const t = player(state, step.target); const c = t.deck.shift();
    if (c) { if (step.answer === 'discard') t.discard.push(c); else t.hand.push(c); }
    next(state, BACK);
};
OPS['card.lendAHand'] = (state, step) => {
    const p = player(state, step.player);
    choice(state, p, 'Помощь: кто берёт 2 карты?', [p, ...others(state, p, p.room)].map(o => ({ id: String(o.id), label: pname(o) })), 'card.lendAHand.pick');
};
OPS['card.lendAHand.pick'] = (state, step) => {
    const p = player(state, step.player); const chosen = Number(step.answer);
    const all = [p, ...others(state, p, p.room)];
    for (const o of all) drawCards(state, o, o.id === chosen ? 2 : 1);
    const steps = all.filter(o => o.hand.length).map(o => ({ op: 'card.lendAHand.discard', player: o.id }));
    next(state, ...steps, BACK);
};
OPS['card.lendAHand.discard'] = (state, step) => {
    const o = player(state, step.player);
    if (!o.hand.length) { return; }
    ask(state, { kind: 'cards', player: o.id, title: 'Помощь: сбросьте 1 карту', cards: [...o.hand], min: 1, max: 1 }, { op: 'card.discardPicked', player: o.id, then: null });
};

// ---------------------------------------------------------------------------------------------
// Bounty Hunter (Laika)
// ---------------------------------------------------------------------------------------------
/** Laika's movement options: to a nearby explored room (from her current position) or back to the hunter. */
export function laikaOptions(state, p) {
    const opts = [];
    if (p.laika && p.laika !== 'board') opts.push({ id: 'back', label: 'Отозвать Лайку (на свой планшет)' });
    const from = p.laika && p.laika !== 'board' ? p.laika : p.room;
    for (const e of state.ship.rooms[from].exits) {
        const c = state.ship.corridors[e.corridor];
        if (c.door === 'closed') continue;
        opts.push({ id: 'go:' + e.to, label: 'Отправить в ' + roomName(state, e.to) + (!room(state, e.to).explored ? ' (неразведана)' : intrudersIn(state, e.to).length ? ' (там чужой — сразу вернётся)' : '') });
    }
    return opts;
}
/** laika.pick { player, then, answer } — apply a Laika move; she noise-rolls like a character when entering an empty room. */
OPS['laika.pick'] = (state, step) => {
    const p = player(state, step.player);
    const then = step.then || BACK;
    if (step.answer === 'stay') { next(state, then); return; }
    if (step.answer === 'back') { p.laika = 'board'; log(state, '🐕 Лайка возвращается к охотнику.', 'good'); next(state, then); return; }
    const r = step.answer.slice(3);
    const from = p.laika && p.laika !== 'board' ? p.laika : p.room;
    p.laika = r; log(state, '🐕 Лайка бежит в ' + roomName(state, r) + '.', 'action');
    // Like a character, Laika explores an unexplored room (tile + exploration token), then resolves noise.
    if (!room(state, r).explored) { next(state, { op: 'explore', player: p.id, room: r, from }, { op: 'laika.arrived', player: p.id, room: r, then }); return; }
    next(state, { op: 'laika.arrived', player: p.id, room: r, then });
};
OPS['laika.arrived'] = (state, step) => {
    const p = player(state, step.player);
    const r = step.room, then = step.then;
    if (p.laika !== r) { next(state, then); return; }
    if (p.room === r || intrudersIn(state, r).length) { p.laika = 'board'; log(state, '🐕 Лайка тут же возвращается к охотнику.', 'minor'); next(state, then); return; }
    if (playersInRoom(state, r).length) { log(state, 'В комнате есть персонаж — Лайка не бросает шум.', 'minor'); next(state, then); return; }
    next(state, { op: 'noise.roll', player: p.id, room: r, laika: true }, then);
};
OPS['card.goGirl'] = (state, step) => {
    const p = player(state, step.player);
    const opts = laikaOptions(state, p);
    if (!opts.length) { log(state, 'Лайке некуда идти.', 'minor'); next(state, BACK); return; }
    ask(state, { kind: 'choice', player: p.id, title: 'Вперёд, девочка!', options: opts }, { op: 'laika.pick', player: p.id, then: BACK });
};
/** Passive: before the first action of each Player Phase the hunter may move Laika or call her back. */
OPS['laika.offer'] = (state, step) => {
    const p = player(state, step.player);
    if (!p.laika || p.status !== 'active' || p.laikaRound === state.round) { next(state, step.then); return; }
    p.laikaRound = state.round;
    const opts = laikaOptions(state, p);
    if (!opts.length) { next(state, step.then); return; }
    ask(state, { kind: 'choice', player: p.id, title: 'Лайка (' + (p.laika === 'board' ? 'рядом с вами' : 'в ' + roomName(state, p.laika)) + '): переместить её перед первым действием?',
        options: [{ id: 'stay', label: 'Оставить как есть' }, ...opts] }, { op: 'laika.pick', player: p.id, then: step.then });
};
OPS['card.tacticalMove'] = (state, step) => {
    const p = player(state, step.player);
    const w = p.items.find(i => ITEMS[i.item].weapon && i.ammo > 0 && !i.broken);
    if (!w) { log(state, 'Нет патронов.', 'minor'); next(state, BACK); return; }
    w.ammo--;
    const intr = intrudersIn(state, p.room);
    const dests = neighbours(state, p.room).filter(r => state.ship.corridors[state.ship.rooms[p.room].exits.find(e => e.to === r).corridor].door !== 'closed');
    if (!dests.length) { next(state, BACK); return; }
    ask(state, { kind: 'room', player: p.id, title: 'Тактический манёвр: куда?', rooms: dests }, { op: 'card.tacticalMove.go', player: p.id, intr: intr.length ? intr[0].uid : null });
};
OPS['card.tacticalMove.go'] = (state, step) => {
    const p = player(state, step.player);
    const it = step.intr && state.intruders[step.intr];
    if (it) { it.room = step.answer; log(state, intruderLabel(state, it) + ' следует за охотником.', 'combat'); }
    next(state, { op: 'move.direct', player: p.id, dest: step.answer, noNoise: true, then: BACK });
};

// ---------------------------------------------------------------------------------------------
// Starting item uses
// ---------------------------------------------------------------------------------------------
OPS['item2.use'] = (state, step) => {
    const p = player(state, step.player); const inst = p.items.find(i => i.uid === step.uid) || (p.armor && p.armor.uid === step.uid ? p.armor : null); const back = step.then || BACK;
    if (!inst) { next(state, back); return; }
    switch (ITEMS[inst.item].use) {
        case 'pipeMelee': next(state, { op: 'melee.start', player: p.id, noContam: true, then: back }); return;
        case 'probeArm': OPS['item3.probeArm'](state, { ...step, then: back }); return;
        case 'wrench': {
            const rs = room(state, p.room); const opts = [];
            if (rs.malfunction) opts.push({ id: 'malf', label: 'Убрать поломку' });
            if (rs.fire) opts.push({ id: 'fire', label: 'Убрать огонь' });
            choice(state, p, 'Разводной ключ', opts, 'card.cleanUp.pick'); return;
        }
        case 'fieldKit': {
            const opts = [p, ...others(state, p, p.room)].map(o => ({ id: String(o.id), label: pname(o) + ' (' + o.health + ')' }));
            ask(state, { kind: 'choice', player: p.id, title: 'Аптечка: кого лечить (+1)?', options: opts }, { op: 'item2.heal1', player: p.id, then: back }); return;
        }
        case 'sampleJar': { const c = p.hand.find(isContam); if (c) { p.hand = p.hand.filter(x => x !== c); log(state, pname(p) + ' убирает заражение в контейнер.', 'good'); } next(state, back); return; }
        case 'navTablet': {
            p.items = p.items.filter(i => i !== inst);
            ask(state, { kind: 'choice', player: p.id, title: 'Какой двигатель проверить?', options: [1, 2, 3].map(n => ({ id: String(n), label: 'Двигатель №' + n })) }, { op: 'computer.engine', player: p.id, then: back }); return;
        }
    }
    next(state, back);
};
OPS['item2.heal1'] = (state, step) => { restoreHealth(state, player(state, Number(step.answer)), 1); next(state, step.then); };
