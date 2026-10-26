// actions.mjs — effects of action cards (character decks + field data), the infection procedure.

import { OPS, ask, next, log, player, pname, intrudersIn, room, roomName, tileOf, restoreHealth, removeFire, placeFire,
    removeMalfunction, placeMalfunction, drawCards, discardCard, removeCardFromGame, isContam, isInfected, payCost,
    clearNoiseAround, killPlayer, spawnIntruder, intruderLabel, corridorsOf, secretTile, payableCards } from './core.mjs';
import { ITEMS } from '../data/cards.mjs';
import { ROOM_TILES } from '../ship.mjs';
import { repelIntruder } from './intruders.mjs';
import { dealHits } from './combat.mjs';
import { search, drawSupport, keepOneOf } from './items.mjs';
import { countAvailable } from './movement.mjs';

const BACK = { op: 'turn.choose' };

// ---------------------------------------------------------------------------------------------
// Infection / eclosion
// ---------------------------------------------------------------------------------------------
/** Scan every contamination card in hand: clean ones leave the game, infected ones hatch a larva. */
export function infectionProcedure(state, p) {
    const cards = p.hand.filter(isContam);
    if (!cards.length) { log(state, pname(p) + ': заражений в руке нет.', 'minor'); return; }
    let bad = 0;
    for (const c of cards) {
        removeCardFromGame(state, p, c);
        if (isInfected(state, c)) { bad++; if (p.larva) { eclosionProcedure(state, p); return; } p.larva = true; }
    }
    log(state, pname(p) + ' проверяет заражения: ' + cards.length + ' карт, заражено — ' + bad + '.', bad ? 'bad' : 'good');
    if (bad) log(state, pname(p) + ' заражён личинкой!', 'bad');
}
/** A larva inside a character hatches: the character dies and an adult appears. */
export function eclosionProcedure(state, p) {
    if (!p.larva) return;
    p.larva = false;
    const r = p.room;
    log(state, '🐛 Из тела ' + pname(p) + ' вырывается чужой!', 'death');
    killPlayer(state, p, 'выход личинки');
    if (countAvailable(state, 'adult') > 0) spawnIntruder(state, 'adult', r);
}

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------
function choice(state, p, title, options, op, extra) {
    if (!options.length) { log(state, 'Нет подходящей цели — карта потрачена впустую.', 'minor'); next(state, (extra && extra.then) || BACK); return; }
    ask(state, { kind: 'choice', player: p.id, title, options }, { op, player: p.id, then: BACK, ...extra });
}
function doorOptions(state, onlyAround) {
    const cors = onlyAround ? corridorsOf(state, onlyAround).filter(c => c.id !== 'tech').map(c => state.ship.corridors[c.id]) : Object.values(state.ship.corridors);
    return cors.filter(c => c.door !== 'destroyed').map(c => ({ id: 'door:' + c.id, label: 'Дверь ' + c.id + ' (' + (c.door === 'closed' ? 'закрыта → открыть' : 'открыта → закрыть') + ')' }));
}
function repairOptions(state, p, withEngine) {
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
    choice(state, p, 'Ремонт', repairOptions(state, p, true), 'card.repairPick', { enginePay: 1 });
};
OPS['card.rest'] = (state, step) => { infectionProcedure(state, player(state, step.player)); next(state, BACK); };
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
    next(state, { op: 'shoot.weaponChosen', player: p.id, uid: gun.uid, repeat: true, then: BACK });
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
    if (tile && ROOM_TILES[tile].computer && !room(state, p.room).malfunction) opts.push({ id: 'comp', label: 'Использовать компьютер' });
    opts.push(...doorOptions(state, null));
    choice(state, p, 'Компьютерные навыки', opts, 'card.computerSkills.pick');
};
OPS['card.computerSkills.pick'] = (state, step) => {
    if (step.answer === 'comp') { next(state, { op: 'computer.start', player: step.player, then: BACK }); return; }
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

// ---------------------------------------------------------------------------------------------
// Field data
// ---------------------------------------------------------------------------------------------
OPS['card.fdAim'] = (state, step) => { next(state, { op: 'shoot.start', player: step.player, rollBonus: 2, then: BACK }); };
OPS['card.fdSprint'] = (state, step) => { next(state, { op: 'move.start', player: step.player, noNoise: true, then: BACK }); };
OPS['card.fdPatch'] = (state, step) => { restoreHealth(state, player(state, step.player), 2); next(state, BACK); };
OPS['card.fdScan'] = (state, step) => {
    const p = player(state, step.player);
    const cards = p.hand.filter(isContam);
    let bad = 0;
    for (const c of cards) { if (isInfected(state, c)) { bad++; discardCard(state, p, c); } else removeCardFromGame(state, p, c); }
    log(state, pname(p) + ' сканирует: заражённых карт — ' + bad + ' (сброшены), чистых — ' + (cards.length - bad) + ' (убраны из игры).', 'good');
    next(state, BACK);
};
OPS['card.fdHush'] = (state, step) => { clearNoiseAround(state, player(state, step.player).room); next(state, BACK); };
OPS['card.fdTrap'] = (state, step) => {
    const p = player(state, step.player);
    choice(state, p, 'Слабые места: цель', intrudersIn(state, p.room).map(i => ({ id: i.uid, label: intruderLabel(state, i) })), 'card.fdTrap.pick');
};
OPS['card.fdTrap.pick'] = (state, step) => {
    const p = player(state, step.player);
    const it = state.intruders[step.answer];
    if (it) dealHits(state, p, it, 1, 0, { noRetaliation: true });
    next(state, BACK);
};
