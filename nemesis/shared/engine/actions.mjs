// actions.mjs — effects of action cards (character decks + field data), the infection procedure.

import { OPS, ask, next, log, player, pname, intrudersIn, playersInRoom, room, roomName, tileOf, restoreHealth, removeFire, placeFire,
    removeMalfunction, placeMalfunction, drawCards, discardCard, removeCardFromGame, isContam, isInfected, payCost,
    clearNoiseAround, killPlayer, spawnIntruder, intruderLabel, corridorsOf, secretTile, payableCards } from './core.mjs';
import { ITEMS } from '../data/cards.mjs';
import { ROOM_TILES } from '../ship.mjs';
import { repelIntruder } from './intruders.mjs';
import { dealHits } from './combat.mjs';
import { search, drawSupport, keepOneOf } from './items.mjs';
import { countAvailable } from './movement.mjs';
import { roomActionAvailable } from './rooms.mjs';

const BACK = { op: 'turn.choose' };

// ---------------------------------------------------------------------------------------------
// Infection / eclosion
// ---------------------------------------------------------------------------------------------
/** Scan every contamination card in hand: clean ones leave the game, infected ones hatch a larva. */
export function infectionProcedure(state, p, removeClean) {
    const cards = p.hand.filter(isContam);
    if (!cards.length) { log(state, pname(p) + ': заражений в руке нет.', 'minor'); return; }
    let bad = 0;
    for (const c of cards) {
        const inf = isInfected(state, c);
        if (inf) bad++;
        // 20.2: contamination cards from the hand go on top of the discard pile
        // (the Rest card additionally removes the non-infected ones from the game).
        if (!inf && removeClean) removeCardFromGame(state, p, c); else discardCard(state, p, c);
    }
    log(state, pname(p) + ' проверяет заражения: ' + cards.length + ' карт, заражено — ' + bad + '.', bad ? 'bad' : 'good');
    if (bad && !p.larva) { p.larva = true; log(state, pname(p) + ' заражён личинкой!', 'bad'); }
    else if (bad) log(state, pname(p) + ' уже носит личинку — вторая не добавляется.', 'minor');
}
/** 20.3 Eclosion Procedure: draw 4 cards; any Contamination card in hand kills the character, otherwise discard the hand. */
export function eclosionProcedure(state, p) {
    drawCards(state, p, 4, true);
    const bad = p.hand.filter(isContam).length;
    if (!bad) {
        log(state, pname(p) + ': процедура вылупления — заражений в руке нет, персонаж выживает; рука сбрасывается.', 'good');
        for (const c of [...p.hand]) discardCard(state, p, c);
        return;
    }
    const r = p.room;
    log(state, '🐛 Процедура вылупления: в руке ' + pname(p) + ' ' + bad + ' заражений — из тела вырывается чужой!', 'death');
    p.larva = false;
    killPlayer(state, p, 'вылупление личинки');
    const it = spawnIntruder(state, 'adult', r);
    if (it && playersInRoom(state, r).length) next(state, { op: 'attack', intruder: it.uid, context: 'eclosion' });
}

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------
export function choice(state, p, title, options, op, extra) {
    if (!options.length) { log(state, 'Нет подходящей цели — карта потрачена впустую.', 'minor'); next(state, (extra && extra.then) || BACK); return; }
    ask(state, { kind: 'choice', player: p.id, title, options }, { op, player: p.id, then: BACK, ...extra });
}
export function doorOptions(state, onlyAround) {
    const cors = onlyAround ? corridorsOf(state, onlyAround).filter(c => c.id !== 'tech').map(c => state.ship.corridors[c.id]) : Object.values(state.ship.corridors);
    return cors.filter(c => c.door !== 'destroyed').map(c => ({ id: 'door:' + c.id, label: 'Дверь ' + c.id + ' (' + (c.door === 'closed' ? 'закрыта → открыть' : 'открыта → закрыть') + ')' }));
}
export function repairOptions(state, p, withEngine) {
    const opts = [];
    if (room(state, p.room).malfunction) opts.push({ id: 'malf', label: 'Убрать поломку в комнате' });
    opts.push(...doorOptions(state, p.room));
    if (withEngine && state.ship.rooms[p.room].kind === 'engine') opts.push({ id: 'engine', label: 'Починить/сломать двигатель' });
    return opts;
}
/** Shared resolver for 'malf' / 'door:x' / 'engine' answers. */
OPS['card.repairPick'] = (state, step) => {
    const p = player(state, step.player);
    const a = step.answer;
    if (a === 'malf' && step.malfPay && !step.malfPaid) {
        payCost(state, p, step.malfPay, { ...step, op: 'card.repairPick', malfPaid: true, answer: a }, 'Ремонт поломки: доплата');
        return;
    }
    if (a === 'malf') removeMalfunction(state, p.room);
    else if (a.startsWith('door:')) { const c = state.ship.corridors[a.slice(5)]; c.door = c.door === 'closed' ? 'open' : 'closed'; log(state, 'Дверь ' + c.id + ' теперь ' + (c.door === 'closed' ? 'закрыта' : 'открыта') + '.', 'event'); }
    else if (a === 'engine') {
        if (step.enginePay) { payCost(state, p, step.enginePay, { op: 'engine.toggle', player: p.id, then: step.then }, 'Ремонт двигателя: доплата'); return; }
        next(state, { op: 'engine.toggle', player: p.id, then: step.then }); return;
    }
    next(state, step.then);
};

// ---------------------------------------------------------------------------------------------
// Common cards
// ---------------------------------------------------------------------------------------------
OPS['card.demolition'] = (state, step) => {
    const p = player(state, step.player);
    const opts = [];
    if (!room(state, p.room).malfunction) opts.push({ id: 'malf', label: 'Поставить поломку в комнате' });
    for (const c of Object.values(state.ship.corridors)) if (c.door === 'closed') opts.push({ id: 'door:' + c.id, label: 'Уничтожить закрытую дверь ' + c.id });
    choice(state, p, 'Подрыв', opts, 'card.demolition.pick');
};
OPS['card.demolition.pick'] = (state, step) => {
    const p = player(state, step.player);
    if (step.answer === 'malf') placeMalfunction(state, p.room, 'подрыв');
    else { const c = state.ship.corridors[step.answer.slice(5)]; c.door = 'destroyed'; log(state, '💥 Дверь ' + c.id + ' уничтожена.', 'event'); }
    next(state, BACK);
};
OPS['card.interruption'] = (state, step) => { log(state, 'Реакция сыграна как обычная карта — эффекта нет.', 'minor'); next(state, BACK); };
OPS['card.preventAttack'] = OPS['card.interruption'];
OPS['card.repairs'] = (state, step) => {
    const p = player(state, step.player);
    // Printed: discard 1 card to remove a Malfunction; Doors do not carry that extra cost.
    choice(state, p, 'Ремонт', repairOptions(state, p, true), 'card.repairPick', { enginePay: 1, malfPay: 1 });
};
OPS['card.rest'] = (state, step) => { infectionProcedure(state, player(state, step.player), true); next(state, BACK); };
OPS['card.search'] = (state, step) => { search(state, player(state, step.player), BACK); };
OPS['card.weakSpot'] = (state, step) => {
    const p = player(state, step.player);
    const opts = [];
    if (p.items.some(i => ITEMS[i.item].weapon && i.ammo > 0) && intrudersIn(state, p.room).length) opts.push({ id: 'shoot', label: 'Выстрелить (+1 ранение)' });
    if (intrudersIn(state, p.room).length) opts.push({ id: 'melee', label: 'Ближний бой (+1 ранение)' });
    choice(state, p, 'Уязвимое место', opts, 'card.weakSpot.pick');
};
OPS['card.weakSpot.pick'] = (state, step) => {
    if (step.answer === 'shoot') next(state, { op: 'shoot.start', player: step.player, bonusHits: 1, then: BACK });
    else next(state, { op: 'melee.start', player: step.player, bonusHits: 1, then: BACK });
};

// ---------------------------------------------------------------------------------------------
// Soldier
// ---------------------------------------------------------------------------------------------
function rangedWithAmmo(p, n) { return p.items.filter(i => ITEMS[i.item].weapon && i.ammo >= n); }
OPS['card.coveringFire'] = (state, step) => {
    const p = player(state, step.player);
    choice(state, p, 'Прикрывающий огонь: из какого оружия потратить 2 патрона?', rangedWithAmmo(p, 2).map(w => ({ id: w.uid, label: ITEMS[w.item].name + ' (' + w.ammo + ')' })), 'card.coveringFire.pick');
};
OPS['card.coveringFire.pick'] = (state, step) => {
    const p = player(state, step.player);
    const w = p.items.find(i => i.uid === step.answer);
    if (w) w.ammo -= 2;
    const companions = state.players.filter(o => o.id !== p.id && o.status === 'active' && o.room === p.room && !o.pod).map(o => ({ id: String(o.id), label: 'Взять с собой: ' + pname(o) }));
    if (companions.length) { ask(state, { kind: 'choice', player: p.id, title: 'Кого взять с собой?', options: [{ id: 'none', label: 'Никого' }, ...companions] }, { op: 'card.coveringFire.go', player: p.id }); return; }
    next(state, { op: 'move.start', player: p.id, noAttacks: true, then: BACK });
};
OPS['card.coveringFire.go'] = (state, step) => {
    const companion = step.answer === 'none' ? undefined : Number(step.answer);
    next(state, { op: 'move.start', player: step.player, noAttacks: true, companion, then: BACK });
};
OPS['card.forcingFire'] = (state, step) => {
    const p = player(state, step.player);
    const adults = intrudersIn(state, p.room).filter(i => i.type === 'adult');
    if (!adults.length) { log(state, 'Взрослых чужих нет.', 'minor'); next(state, BACK); return; }
    choice(state, p, 'Подавляющий огонь: из какого оружия потратить 1 патрон?', rangedWithAmmo(p, 1).map(w => ({ id: w.uid, label: ITEMS[w.item].name + ' (' + w.ammo + ')' })), 'card.forcingFire.pick');
};
OPS['card.forcingFire.pick'] = (state, step) => {
    const p = player(state, step.player);
    const w = p.items.find(i => i.uid === step.answer);
    if (w) w.ammo -= 1;
    const a = intrudersIn(state, p.room).find(i => i.type === 'adult');
    if (a && repelIntruder(state, a)) { next(state, { op: 'noise.roll', player: p.id, room: a.room }, BACK); return; }
    next(state, BACK);
};
OPS['card.myLittleFriend'] = (state, step) => {
    const p = player(state, step.player);
    const gun = p.items.find(i => i.item === 'soldierGun');
    if (!gun) { log(state, 'Винтовки солдата нет.', 'minor'); next(state, BACK); return; }
    const opts = [];
    if (gun.ammo < ITEMS.soldierGun.weapon.max) opts.push({ id: 'load', label: 'Зарядить 1 патрон (' + gun.ammo + '/' + ITEMS.soldierGun.weapon.max + ')' });
    if (gun.ammo > 0 && intrudersIn(state, p.room).length) opts.push({ id: 'burst', label: 'Стрелять очередью до конца патронов/чужих' });
    choice(state, p, 'Моя крошка', opts, 'card.myLittleFriend.pick', { uid: gun.uid });
};
OPS['card.myLittleFriend.pick'] = (state, step) => {
    const p = player(state, step.player);
    const gun = p.items.find(i => i.uid === step.uid);
    if (step.answer === 'load') { gun.ammo++; log(state, 'Винтовка заряжена: ' + gun.ammo + '.', 'good'); next(state, BACK); return; }
    next(state, { op: 'shoot.start', player: p.id, onlyItem: 'soldierGun', repeat: true, then: BACK });
};

// ---------------------------------------------------------------------------------------------
// Scout
// ---------------------------------------------------------------------------------------------
OPS['card.scoutAdrenaline'] = (state, step) => {
    const p = player(state, step.player);
    drawCards(state, p, 2);
    ask(state, { kind: 'cards', player: p.id, title: 'Сбросьте 1 карту', cards: [...p.hand], min: 1, max: 1 }, { op: 'card.discardPicked', player: p.id, then: BACK });
};
OPS['card.discardPicked'] = (state, step) => {
    const p = player(state, step.player);
    for (const c of step.answer) discardCard(state, p, c);
    next(state, step.then);
};
OPS['card.distraction'] = (state, step) => {
    const p = player(state, step.player);
    choice(state, p, 'Отвлечение: какой предмет сбросить?', p.items.filter(i => !ITEMS[i.item].quest).map(i => ({ id: i.uid, label: ITEMS[i.item].name })), 'card.distraction.pick');
};
OPS['card.distraction.pick'] = (state, step) => {
    const p = player(state, step.player);
    const inst = p.items.find(i => i.uid === step.answer);
    if (inst) { p.items = p.items.filter(i => i !== inst); (state.itemDiscard[ITEMS[inst.item].deck] = state.itemDiscard[ITEMS[inst.item].deck] || []).push(inst.item); log(state, pname(p) + ' выбрасывает «' + ITEMS[inst.item].name + '».', 'action'); }
    next(state, { op: 'move.start', player: p.id, noAttacks: true, then: BACK });
};
OPS['card.reconnaissance'] = (state, step) => {
    const p = player(state, step.player);
    const exits = state.ship.rooms[p.room].exits.filter(e => state.ship.corridors[e.corridor].door !== 'closed');
    const opts = [];
    for (const e of exits) if (!room(state, e.to).explored) opts.push({ id: 'peek:' + e.to, label: 'Посмотреть комнату ' + e.to });
    if (exits.some(e => room(state, e.to).explored) && payableCards(p).length) opts.push({ id: 'moveExplored', label: 'Сбросить 1 карту и перейти в разведанную комнату без шума' });
    choice(state, p, 'Разведка', opts, 'card.reconnaissance.pick');
};
OPS['card.reconnaissance.pick'] = (state, step) => {
    const p = player(state, step.player);
    if (step.answer === 'moveExplored') { payCost(state, p, 1, { op: 'move.start', player: p.id, filter: 'explored', noNoise: true, then: BACK }, 'Разведка: оплата'); return; }
    const r = step.answer.slice(5);
    p.knownTiles = p.knownTiles || {}; p.knownTiles[r] = state.secret.tiles[r];
    const tok = state.secret.tokens[r];
    const text = 'Комната ' + r + ': ' + ROOM_TILES[state.secret.tiles[r]].name + '\nЖетон: ' + (tok ? tok.label : '—');
    const opts = [{ id: 'stay', label: 'Остаться' }];
    if (payableCards(p).length) opts.push({ id: 'go', label: 'Сбросить 1 карту и перейти туда без шума' });
    ask(state, { kind: 'choice', player: p.id, title: 'Разведка (только вы это видите)', text, options: opts }, { op: 'card.reconnaissance.go', player: p.id, dest: r });
};
OPS['card.reconnaissance.go'] = (state, step) => {
    const p = player(state, step.player);
    if (step.answer === 'go') { payCost(state, p, 1, { op: 'move.direct', player: p.id, dest: step.dest, noNoise: true, then: BACK }, 'Разведка: оплата'); return; }
    next(state, BACK);
};
OPS['card.scavenging'] = (state, step) => {
    const p = player(state, step.player);
    if (room(state, p.room).malfunction) { log(state, 'В комнате поломка — мародёрство невозможно.', 'minor'); next(state, BACK); return; }
    payCost(state, p, 1, { op: 'card.search', player: p.id }, 'Мародёрство: оплата');
};

// ---------------------------------------------------------------------------------------------
// Mechanic
// ---------------------------------------------------------------------------------------------
OPS['card.computerSkills'] = (state, step) => {
    const p = player(state, step.player);
    const tile = tileOf(state, p.room);
    const opts = [];
    // Printed: use the Computer ROOM, not the face-up Computer Action card.
    if (tile && ROOM_TILES[tile].computer && !room(state, p.room).malfunction && roomActionAvailable(state, p).ok) opts.push({ id: 'comp', label: 'Использовать комнату' });
    opts.push(...doorOptions(state, null));
    choice(state, p, 'Компьютерные навыки', opts, 'card.computerSkills.pick');
};
OPS['card.computerSkills.pick'] = (state, step) => {
    if (step.answer === 'comp') { next(state, { op: 'room.action', player: step.player, then: BACK }); return; }
    OPS['card.repairPick'](state, step);
};
OPS['card.duckAndCover'] = (state, step) => {
    payCost(state, player(state, step.player), 1, { op: 'move.start', player: step.player, preventOne: true, then: BACK }, 'Пригнуться: оплата');
};
OPS['card.fastRepairs'] = (state, step) => { const p = player(state, step.player); choice(state, p, 'Быстрый ремонт', repairOptions(state, p, true), 'card.repairPick'); };
OPS['card.fightFire'] = (state, step) => {
    const p = player(state, step.player);
    const opts = [];
    if (room(state, p.room).fire) opts.push({ id: 'out', label: 'Потушить огонь в комнате' });
    for (const i of p.items.filter(i => !ITEMS[i.item].quest)) opts.push({ id: 'burn:' + i.uid, label: 'Сбросить «' + ITEMS[i.item].name + '» и поставить огонь' });
    choice(state, p, 'Клин клином', opts, 'card.fightFire.pick');
};
OPS['card.fightFire.pick'] = (state, step) => {
    const p = player(state, step.player);
    if (step.answer === 'out') { removeFire(state, p.room); next(state, BACK); return; }
    const inst = p.items.find(i => i.uid === step.answer.slice(5));
    if (inst) { p.items = p.items.filter(i => i !== inst); (state.itemDiscard[ITEMS[inst.item].deck] = state.itemDiscard[ITEMS[inst.item].deck] || []).push(inst.item); }
    const rooms = [p.room, ...state.ship.rooms[p.room].exits.map(e => e.to)].filter(r => !room(state, r).fire && room(state, r).explored);
    ask(state, { kind: 'room', player: p.id, title: 'Куда поставить огонь?', rooms }, { op: 'card.fightFire.place', player: p.id });
};
OPS['card.fightFire.place'] = (state, step) => { placeFire(state, step.answer, 'механик'); next(state, BACK); };
OPS['card.ingenuity'] = (state, step) => {
    const p = player(state, step.player);
    const opts = repairOptions(state, p, true).filter(o => !o.id.startsWith('door:'));
    if (p.items.some(i => i.item === 'mechTools') && payableCards(p).length >= 2) opts.push({ id: 'support', label: 'Сбросить 2 карты: взять 3 карты поддержки, оставить 1' });
    choice(state, p, 'Смекалка', opts, 'card.ingenuity.pick');
};
OPS['card.ingenuity.pick'] = (state, step) => {
    const p = player(state, step.player);
    if (step.answer === 'support') { payCost(state, p, 2, { op: 'card.ingenuity.support', player: p.id }, 'Смекалка: оплата'); return; }
    OPS['card.repairPick'](state, step);
};
OPS['card.ingenuity.support'] = (state, step) => { const p = player(state, step.player); keepOneOf(state, p, drawSupport(state, 3), 'support', BACK); };
OPS['card.techCorridors'] = (state, step) => {
    const p = player(state, step.player);
    if (!state.ship.rooms[p.room].tech) { log(state, 'Здесь нет входа в технические коридоры.', 'minor'); next(state, BACK); return; }
    payCost(state, p, 1, { op: 'card.techCorridors.go', player: p.id }, 'Технические коридоры: оплата');
};
OPS['card.techCorridors.go'] = (state, step) => {
    const p = player(state, step.player);
    const rooms = Object.keys(state.ship.rooms).filter(r => state.ship.rooms[r].tech && r !== p.room);
    ask(state, { kind: 'room', player: p.id, title: 'Технические коридоры: куда?', rooms }, { op: 'card.techCorridors.dest', player: p.id });
};
OPS['card.techCorridors.dest'] = (state, step) => {
    const p = player(state, step.player);
    p.passed = true;
    next(state, { op: 'move.direct', player: p.id, dest: step.answer, then: { op: 'turn.end' } });
};

