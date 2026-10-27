// items.mjs — item actions, searching, the support deck.

import { OPS, ask, next, log, player, pname, intrudersIn, playersInRoom, room, roomName, tileOf, restoreHealth, removeWound,
    removeFire, removeMalfunction, placeFire, placeMalfunction, drawCards, discardCard, isContam, gainContamination,
    loseHealth, handLimit, heavyCount, findRoomsByTile, intruderLabel, dropHeavy, corridorsOf, needDice } from './core.mjs';
import { ITEMS, WOUNDS, DECK_NAMES } from '../data/cards.mjs';
import { ROOM_TILES } from '../ship.mjs';
import { shuffle } from '../rng.mjs';
import { repelIntruder, checkNest } from './intruders.mjs';
import { startSelfDestruct, stopSelfDestruct } from './events.mjs';
import { drawItem, giveItem, healChoice, removeOneContam } from './rooms.mjs';
import { dealHits } from './combat.mjs';

export function drawSupport(state, n) {
    const out = [];
    for (let i = 0; i < n; i++) { const c = drawItem(state, 'support'); if (c) out.push(c); }
    return out;
}

/** Offer `cards` (item keys); the chosen one is gained, the rest go to the bottom of their decks. */
export function keepOneOf(state, p, cards, label, then, keep = 1) {
    if (!cards.length) { log(state, 'Колода пуста — ничего не найдено.', 'minor'); next(state, then); return; }
    ask(state, { kind: 'choice', player: p.id, title: keep > 1 ? 'Выберите предмет (можно оставить ещё ' + keep + ')' : 'Выберите 1 предмет (остальные — под низ колод)', secret: true,
        options: cards.map((c, i) => ({ id: String(i), label: ITEMS[c].name, desc: ITEMS[c].text, tag: DECK_NAMES[ITEMS[c].deck] })) },
        { op: 'item.keepOne', player: p.id, cards, then, keep });
}
OPS['item.keepOne'] = (state, step) => {
    const p = player(state, step.player);
    const idx = Number(step.answer);
    const key = step.cards[idx];
    const rest = step.cards.filter((c, i) => i !== idx);
    const keep = (step.keep || 1) - 1;
    if (keep > 0 && rest.length) {
        giveItem(state, p, key);
        ask(state, { kind: 'choice', player: p.id, title: 'Разгрузочный жилет: оставить ещё один предмет?', secret: true,
            options: [{ id: 'none', label: 'Нет — остальные под низ колод' }, ...rest.map((c, i) => ({ id: String(i), label: ITEMS[c].name, desc: ITEMS[c].text, tag: DECK_NAMES[ITEMS[c].deck] }))] },
            { op: 'item.keepMore', player: p.id, cards: rest, then: step.then });
        return;
    }
    rest.forEach(c => state.itemDecks[ITEMS[c].deck].push(c));
    giveItem(state, p, key);
    const then = step.then;
    if (ITEMS[key].free) {
        ask(state, { kind: 'choice', player: p.id, title: '«' + ITEMS[key].name + '» можно использовать бесплатно сейчас. Использовать?', options: [{ id: 'yes', label: 'Да' }, { id: 'no', label: 'Нет' }] },
            { op: 'item.freeUse', player: p.id, key, then });
        return;
    }
    if (then && then.thenAfter) next(state, { ...then, thenAfter: undefined }, then.thenAfter); else next(state, then);
};
OPS['item.keepMore'] = (state, step) => {
    const p = player(state, step.player);
    if (step.answer !== 'none') { const key = step.cards.splice(Number(step.answer), 1)[0]; giveItem(state, p, key); }
    step.cards.forEach(c => state.itemDecks[ITEMS[c].deck].push(c));
    next(state, step.then);
};
/** Utility Vest: the 'item' action may use a second item for free. */
OPS['vest.second'] = (state, step) => {
    const p = player(state, step.player);
    const back = { op: 'turn.choose' };
    if (step.answer === 'none') { next(state, back); return; }
    if (step.answer) { next(state, { op: 'item.use', player: p.id, uid: step.answer, then: back }); return; }
    if (p.status !== 'active') { next(state, back); return; }
    const opts = p.items.filter(i => ITEMS[i.item].use && !i.broken && i.uid !== step.used).map(i => ({ id: i.uid, label: ITEMS[i.item].name, desc: ITEMS[i.item].text }));
    if (!opts.length) { next(state, back); return; }
    ask(state, { kind: 'choice', player: p.id, title: 'Разгрузочный жилет: использовать второй предмет бесплатно?', options: [{ id: 'none', label: 'Нет' }, ...opts] }, step);
};
OPS['item.freeUse'] = (state, step) => {
    const p = player(state, step.player);
    if (step.answer === 'yes') {
        const inst = p.items.find(i => i.item === step.key);
        if (inst) { next(state, { op: 'item.use', player: p.id, uid: inst.uid, then: step.then }); return; }
    }
    next(state, step.then);
};

/** Search: one item per icon in the room, keep one. */
export function searchRoom(state, p, then) {
    const tile = tileOf(state, p.room);
    const icons = tile ? ROOM_TILES[tile].items : [];
    const drawn = [];
    for (const color of icons) { const c = drawItem(state, color); if (c) drawn.push(c); }
    log(state, pname(p) + ' обыскивает комнату (' + icons.length + ' предм.).', 'action');
    keepOneOf(state, p, drawn, 'items', then, p.armor && ITEMS[p.armor.item].vest ? 2 : 1);
}

// ---------------------------------------------------------------------------------------------
// Using items
// ---------------------------------------------------------------------------------------------
OPS['item.use'] = (state, step) => {
    const p = player(state, step.player);
    const inst = p.items.find(i => i.uid === step.uid) || (p.armor && p.armor.uid === step.uid ? p.armor : null);
    const back = step.then || { op: 'turn.choose' };
    if (!inst) { next(state, back); return; }
    const def = ITEMS[inst.item];
    const consume = () => { if (def.oneUse) { p.items = p.items.filter(i => i !== inst); (state.itemDiscard[def.deck] = state.itemDiscard[def.deck] || []).push(inst.item); } };
    const choose = (title, options, op, extra) => ask(state, { kind: 'choice', player: p.id, title, options, cancel: false }, { op, player: p.id, uid: inst.uid, then: back, ...extra });
    switch (def.use) {
        case 'repelAdult': {
            const adults = intrudersIn(state, p.room).filter(i => i.type === 'adult');
            consume();
            if (!adults.length) { log(state, 'Взрослых чужих нет.', 'minor'); next(state, back); return; }
            const it = adults[0];
            if (repelIntruder(state, it)) next(state, { op: 'noise.roll', player: p.id, room: it.room }, back); else next(state, back);
            return;
        }
        case 'draw2orHeal2':
            consume();
            choose('Стимуляторы', [{ id: 'draw', label: 'Взять 2 карты' }, { id: 'heal', label: 'Восстановить 2 здоровья' }], 'item.simpleChoice');
            return;
        case 'draw3': consume(); drawCards(state, p, 3); next(state, back); return;
        case 'autodoc':
            consume();
            for (const c of [...p.hand]) discardCard(state, p, c);
            for (const c of [...p.deck]) { p.deck.splice(p.deck.indexOf(c), 1); p.discard.push(c); }
            p.discard = p.discard.filter(c => !isContam(c));
            if (p.larva) { p.larva = false; log(state, 'Личинка удалена.', 'good'); }
            log(state, pname(p) + ': автодок удалил все заражения.', 'good');
            p.passed = true; next(state, { op: 'turn.end' }); return;
        case 'medkit': consume(); healChoice(state, p, 3, back); return;
        case 'woundOrHeal2': consume(); healChoice(state, p, 2, back); return;
        case 'removeContam1': consume(); removeOneContam(state, p); next(state, back); return;
        case 'adrenaline': consume(); drawCards(state, p, 2); p.adrenalineTurn = true; log(state, pname(p) + ': любое число действий в этом ходу!', 'good'); next(state, back); return;
        case 'supportCrate': consume(); keepOneOf(state, p, drawSupport(state, 3), 'support', back); return;
        case 'toggleSelfDestruct': consume(); if (state.selfDestruct > 0) stopSelfDestruct(state); else startSelfDestruct(state); next(state, back); return;
        case 'grenade': {
            const launcher = p.items.find(i => ITEMS[i.item].weapon && ITEMS[i.item].weapon.grenadeOnly && i.ammo < ITEMS[i.item].weapon.max);
            if (launcher && !step.thrown) {
                choose('Граната', [{ id: 'throw', label: 'Бросить' }, { id: 'load', label: 'Зарядить гранатомёт' }], 'item.grenadeLoad', { launcher: launcher.uid });
                return;
            }
            const rooms = [p.room, ...state.ship.rooms[p.room].exits.map(e => e.to)].filter(r => intrudersIn(state, r).length || room(state, r).objects.some(o => o.type === 'egg') || (tileOf(state, r) === 'nest' && state.nestEggs > 0));
            consume();
            ask(state, { kind: 'room', player: p.id, title: 'Граната: куда бросить?', rooms }, { op: 'item.grenade', player: p.id, then: back });
            return;
        }
        case 'flashbangMove': consume(); next(state, { op: 'move.start', player: p.id, noAttacks: true, then: back }); return;
        case 'energyCharge': {
            consume();
            const opts = [{ id: 'door', label: 'Открыть/закрыть дверь' }];
            for (const w of p.items.filter(i => ITEMS[i.item].weapon && i.ammo < ITEMS[i.item].weapon.max && !ITEMS[i.item].weapon.grenadeOnly)) opts.push({ id: 'w:' + w.uid, label: 'Зарядить (+3): ' + ITEMS[w.item].name });
            for (const w of [...p.items, p.armor].filter(i => i && ITEMS[i.item].ammoMax && i.ammo < ITEMS[i.item].ammoMax)) opts.push({ id: 'w:' + w.uid, label: 'Зарядить (+3): ' + ITEMS[w.item].name });
            choose('Энергозаряд', opts, 'item.energy');
            return;
        }
        case 'evacKey': {
            consume();
            const sec = tileOf(state, p.room) === 'evacA' ? 'A' : 'B';
            const pods = state.pods.filter(x => x.section === sec && !x.launched && !x.removed);
            choose('Ключ эвакуации: какую капсулу переключить?', pods.map(x => ({ id: String(x.num), label: 'Капсула №' + x.num + ' — ' + (x.locked ? 'заблокирована' : 'открыта') })), 'item.hatch');
            return;
        }
        case 'taser': {
            consume();
            const opts = intrudersIn(state, p.room).map(i => ({ id: 'i:' + i.uid, label: 'Отогнать: ' + intruderLabel(state, i) }));
            for (const o of state.players) if (o.status === 'active' && o.hand.length) opts.push({ id: 'p:' + o.id, label: pname(o) + ' сбрасывает все карты' });
            if (!opts.length) { next(state, back); return; }
            choose('Шокер', opts, 'item.taser');
            return;
        }
        case 'logCodes': {
            consume();
            const others = state.players.filter(o => o.id !== p.id);
            choose('Чьи цели посмотреть?', others.map(o => ({ id: String(o.id), label: pname(o) })), 'item.logCodes');
            return;
        }
        case 'detonator': {
            consume();
            const rooms = Object.keys(state.ship.rooms).filter(r => { const t = tileOf(state, r); return t && ROOM_TILES[t].items.filter(x => x === 'red').length >= 2; });
            if (!rooms.length) { log(state, 'Нет комнаты с достаточным числом красных значков.', 'minor'); next(state, back); return; }
            ask(state, { kind: 'room', player: p.id, title: 'Детонатор: какую комнату взорвать?', rooms }, { op: 'item.detonate', player: p.id, then: back });
            return;
        }
        case 'cables': {
            consume();
            const opts = p.items.filter(i => ITEMS[i.item].weapon && i.ammo < ITEMS[i.item].weapon.max).map(w => ({ id: 'w:' + w.uid, label: 'Полностью зарядить: ' + ITEMS[w.item].name }));
            const tile = tileOf(state, p.room);
            if (tile && ROOM_TILES[tile].computer && room(state, p.room).malfunction) opts.push({ id: 'fix', label: 'Устранить поломку и использовать компьютер' });
            if (!opts.length) { next(state, back); return; }
            choose('Кабели', opts, 'item.cables');
            return;
        }
        case 'ductTape': case 'tools': case 'mechTools': {
            if (def.oneUse) consume();
            const opts = [];
            if (room(state, p.room).malfunction) opts.push({ id: 'malf', label: 'Устранить поломку в комнате' });
            if (state.ship.rooms[p.room].kind === 'engine') opts.push({ id: 'engine', label: 'Починить/сломать двигатель' });
            if (!opts.length) { log(state, 'Нечего чинить здесь.', 'minor'); next(state, back); return; }
            choose(def.name, opts, 'item.repair');
            return;
        }
        case 'engineKey': {
            consume();
            const tile = tileOf(state, p.room);
            const opts = [];
            if (tile && ROOM_TILES[tile].computer && !room(state, p.room).malfunction) [1, 2, 3].forEach(n => opts.push({ id: 'chk:' + n, label: 'Проверить двигатель №' + n }));
            for (const r of Object.values(state.ship.rooms).filter(r => r.kind === 'engine')) opts.push({ id: 'go:' + r.id, label: 'Переместиться к двигателю №' + r.engineNo + ' и спасовать' });
            choose('Ключ двигателя', opts, 'item.engineKey');
            return;
        }
        case 'extinguisher': {
            consume();
            const opts = [];
            if (room(state, p.room).fire) opts.push({ id: 'fire', label: 'Потушить огонь' });
            for (const i of intrudersIn(state, p.room)) opts.push({ id: 'i:' + i.uid, label: 'Отогнать: ' + intruderLabel(state, i) });
            if (!opts.length) { next(state, back); return; }
            choose('Огнетушитель', opts, 'item.extinguisher');
            return;
        }
        case 'glowstick': {
            consume();
            const opts = [{ id: 'move', label: 'Перейти в неразведанную комнату без шума' }];
            if (intrudersIn(state, p.room).length) opts.push({ id: 'melee', label: 'Ближний бой без заражения и ответа' });
            choose('Химический фонарь', opts, 'item.glowstick');
            return;
        }
        case 'nemesisPlans': {
            consume();
            const un = Object.keys(state.ship.rooms).filter(r => !room(state, r).explored);
            const two = shuffle(state, [...un]).slice(0, 2);
            p.knownTiles = p.knownTiles || {};
            for (const r of two) p.knownTiles[r] = state.secret.tiles[r];
            ask(state, { kind: 'info', player: p.id, title: 'Чертежи (только вы это видите)', text: two.map(r => 'Комната ' + r + ': ' + ROOM_TILES[state.secret.tiles[r]].name).join('\n') || 'Неразведанных комнат нет' }, { op: 'noop', then: back });
            return;
        }
        case 'reagent': {
            consume();
            placeFire(state, p.room, 'реагент');
            const a = intrudersIn(state, p.room).find(i => i.type === 'adult');
            if (a) repelIntruder(state, a);
            next(state, back); return;
        }
        case 'techPlan': {
            consume();
            const rooms = Object.keys(state.ship.rooms).filter(r => state.ship.rooms[r].tech && r !== p.room);
            ask(state, { kind: 'room', player: p.id, title: 'План тех. коридоров: куда?', rooms }, { op: 'item.techMove', player: p.id, then: back });
            return;
        }
        case 'engEquip': {
            const rs = room(state, p.room);
            const opts = [];
            if (rs.malfunction) opts.push({ id: 'malf', label: 'Убрать поломку в комнате' });
            if (rs.fire) opts.push({ id: 'fire', label: 'Потушить пожар в комнате' });
            opts.push({ id: 'door', label: 'Открыть/закрыть дверь' });
            choose('Инженерный набор', opts, 'item.engEquip');
            return;
        }
        case 'secControl': {
            const rooms = Object.keys(state.ship.rooms).filter(r => intrudersIn(state, r).length);
            if (!rooms.length) { log(state, 'Чужих на корабле нет.', 'minor'); next(state, back); return; }
            ask(state, { kind: 'room', player: p.id, title: 'Пульт охраны: в какой комнате стрелять?', rooms }, { op: 'item.secRoom', player: p.id, uid: inst.uid, then: back });
            return;
        }
    }
    if (OPS['item2.use']) { OPS['item2.use'](state, { ...step, then: back }); return; }
    log(state, 'Эффект предмета не реализован.', 'bad');
    next(state, back);
};

OPS['item.engEquip'] = (state, step) => {
    const p = player(state, step.player);
    if (step.answer === 'malf') { removeMalfunction(state, p.room); next(state, step.then); return; }
    if (step.answer === 'fire') { removeFire(state, p.room); next(state, step.then); return; }
    const cors = Object.values(state.ship.corridors).filter(c => c.door !== 'destroyed');
    ask(state, { kind: 'choice', player: p.id, title: 'Какую дверь переключить?', options: cors.map(c => ({ id: c.id, label: c.id + ' (' + (c.door === 'closed' ? 'закрыта' : 'открыта') + ')' })) }, { op: 'item.toggleDoor', player: p.id, then: step.then });
};
OPS['item.secRoom'] = (state, step) => {
    const p = player(state, step.player);
    const its = intrudersIn(state, step.answer);
    if (!its.length) { next(state, step.then); return; }
    if (its.length === 1) { next(state, { op: 'item.secFire', player: p.id, uid: step.uid, target: its[0].uid, then: step.then }); return; }
    ask(state, { kind: 'choice', player: p.id, title: 'Пульт охраны: в кого стрелять?', options: its.map(t => ({ id: t.uid, label: intruderLabel(state, t) })) }, { op: 'item.secTarget', player: p.id, uid: step.uid, then: step.then });
};
OPS['item.secTarget'] = (state, step) => next(state, { op: 'item.secFire', player: step.player, uid: step.uid, target: step.answer, then: step.then });
OPS['item.secFire'] = (state, step) => {
    const p = player(state, step.player);
    const it = state.intruders[step.target];
    const inst = p.items.find(i => i.uid === step.uid);
    if (!it || !inst) { next(state, step.then); return; }
    if (it.type !== 'larva' && needDice(state, step, 'combat', p.id, 'Бросок боя — пульт охраны')) return;
    log(state, '🔫 Пульт охраны: турель стреляет в ' + intruderLabel(state, it) + ' (' + roomName(state, it.room) + ').', 'combat');
    dealHits(state, p, it, 1, 0, {});
    if (state.lastRoll && state.lastRoll.die === 'combat' && state.lastRoll.value === 6) { inst.broken = true; log(state, 'На пульт охраны положен жетон — он выходит из строя.', 'bad'); }
    next(state, step.then);
};
OPS['item.simpleChoice'] = (state, step) => {
    const p = player(state, step.player);
    if (step.answer === 'draw') drawCards(state, p, 2); else restoreHealth(state, p, 2);
    next(state, step.then);
};
OPS['item.grenadeLoad'] = (state, step) => {
    const p = player(state, step.player);
    if (step.answer === 'load') {
        const l = p.items.find(i => i.uid === step.launcher), g = p.items.find(i => i.uid === step.uid);
        if (l && g) { l.ammo = ITEMS[l.item].weapon.max; p.items = p.items.filter(i => i !== g); (state.itemDiscard.red = state.itemDiscard.red || []).push(g.item); log(state, 'Гранатомёт заряжен.', 'good'); }
        next(state, step.then); return;
    }
    next(state, { op: 'item.use', player: p.id, uid: step.uid, thrown: true, then: step.then });
};
OPS['item.grenade'] = (state, step) => {
    const p = player(state, step.player);
    const r = step.answer;
    log(state, '💣 ' + pname(p) + ' бросает гранату в ' + roomName(state, r) + '!', 'combat');
    for (const it of intrudersIn(state, r)) { if (!state.intruders[it.uid]) continue; dealHits(state, p, it, 2, 0, {}); }
    const rs = room(state, r);
    let eggs = 0;
    for (let i = rs.objects.length - 1; i >= 0 && eggs < 2; i--) if (rs.objects[i].type === 'egg') { rs.objects.splice(i, 1); eggs++; }
    if (tileOf(state, r) === 'nest') { while (eggs < 2 && state.nestEggs > 0) { state.nestEggs--; eggs++; } checkNest(state); next(state, { op: 'noise.roll', player: p.id, room: p.room }); }
    if (eggs) log(state, 'Уничтожено яиц: ' + eggs + '.', 'event');
    for (const o of playersInRoom(state, r)) loseHealth(state, o, 3, 'взрыв гранаты');
    next(state, step.then);
};
OPS['item.energy'] = (state, step) => {
    const p = player(state, step.player);
    if (step.answer === 'door') {
        const cors = Object.values(state.ship.corridors).filter(c => c.door !== 'destroyed');
        ask(state, { kind: 'choice', player: p.id, title: 'Какую дверь переключить?', options: cors.map(c => ({ id: c.id, label: c.id + ' (' + (c.door === 'closed' ? 'закрыта' : 'открыта') + ')' })) }, { op: 'item.toggleDoor', player: p.id, then: step.then });
        return;
    }
    const w = [...p.items, p.armor].find(i => i && i.uid === step.answer.slice(2));
    if (w) { const before = w.ammo; w.ammo = Math.min(ITEMS[w.item].weapon ? ITEMS[w.item].weapon.max : ITEMS[w.item].ammoMax, w.ammo + 3); log(state, '«' + ITEMS[w.item].name + '»: патроны ' + before + ' → ' + w.ammo + '.', 'good'); }
    next(state, step.then);
};
OPS['item.toggleDoor'] = (state, step) => { const c = state.ship.corridors[step.answer]; c.door = c.door === 'closed' ? 'open' : 'closed'; log(state, 'Дверь ' + c.id + ': ' + (c.door === 'closed' ? 'закрыта' : 'открыта') + '.', 'event'); next(state, step.then); };
OPS['item.hatch'] = (state, step) => { const pod = state.pods.find(x => x.num === Number(step.answer)); pod.locked = !pod.locked; log(state, 'Капсула №' + pod.num + ' ' + (pod.locked ? 'заблокирована' : 'разблокирована') + '.', 'event'); next(state, step.then); };
OPS['item.taser'] = (state, step) => {
    const [kind, id] = step.answer.split(':');
    if (kind === 'i') { const it = state.intruders[id]; if (it) repelIntruder(state, it); }
    else { const o = player(state, Number(id)); for (const c of [...o.hand]) discardCard(state, o, c); log(state, pname(o) + ' сбрасывает все карты (шокер).', 'bad'); }
    next(state, step.then);
};
OPS['item.logCodes'] = (state, step) => {
    const p = player(state, step.player);
    const o = player(state, Number(step.answer));
    next(state, { op: 'item.logCodes.show', player: p.id, target: o.id, then: step.then });
};
OPS['item.logCodes.show'] = (state, step) => {
    const p = player(state, step.player);
    const o = player(state, step.target);
    const txt = o.objectives.map(ob => OBJ(ob.kind, ob.id).name + ': ' + OBJ(ob.kind, ob.id).text.replace('{target}', ob.target !== undefined ? pname(state.players[ob.target]) : '')).join('\n');
    ask(state, { kind: 'info', player: p.id, title: 'Цели ' + pname(o) + ' (только вы это видите)', text: txt }, { op: 'noop', then: step.then });
};
import { OBJECTIVES } from '../data/cards.mjs';
function OBJ(kind, id) { return OBJECTIVES[kind][id]; }
OPS['item.detonate'] = (state, step) => {
    const p = player(state, step.player);
    const r = step.answer;
    log(state, '💥 Детонация в ' + roomName(state, r) + '!', 'combat');
    for (const it of intrudersIn(state, r)) if (state.intruders[it.uid]) dealHits(state, p, it, 3, 0, {});
    for (const o of playersInRoom(state, r)) loseHealth(state, o, 3, 'взрыв');
    next(state, step.then);
};
OPS['item.cables'] = (state, step) => {
    const p = player(state, step.player);
    if (step.answer === 'fix') { removeMalfunction(state, p.room); next(state, { op: 'computer.start', player: p.id, then: step.then }); return; }
    const w = p.items.find(i => i.uid === step.answer.slice(2));
    if (w) { w.ammo = ITEMS[w.item].weapon.max; log(state, '«' + ITEMS[w.item].name + '» полностью заряжено.', 'good'); }
    next(state, step.then);
};
OPS['item.repair'] = (state, step) => {
    const p = player(state, step.player);
    if (step.answer === 'malf') { removeMalfunction(state, p.room); next(state, step.then); return; }
    next(state, { op: 'engine.toggle', player: p.id, then: step.then });
};
/** engine.toggle — the player secretly sets the engine in their room to working or damaged. */
OPS['engine.toggle'] = (state, step) => {
    const p = player(state, step.player);
    const no = state.ship.rooms[p.room].engineNo;
    const e = state.secret.engines.find(x => x.no === no);
    ask(state, { kind: 'choice', player: p.id, title: 'Двигатель №' + no + ' сейчас ' + (e.working ? 'ИСПРАВЕН' : 'ПОВРЕЖДЁН') + '. Что сделать? (остальные игроки не видят)', secret: true,
        options: [{ id: 'work', label: 'Оставить/сделать исправным' }, { id: 'break', label: 'Оставить/сделать повреждённым' }] },
        { op: 'engine.set', player: p.id, no, then: step.then });
};
OPS['engine.set'] = (state, step) => {
    const p = player(state, step.player);
    const e = state.secret.engines.find(x => x.no === step.no);
    e.working = step.answer === 'work';
    p.knownEngines[e.no] = e.working;
    log(state, pname(p) + ' что-то делает с двигателем №' + e.no + '.', 'info');
    next(state, step.then);
};
OPS['item.engineKey'] = (state, step) => {
    const p = player(state, step.player);
    const [kind, v] = step.answer.split(':');
    if (kind === 'chk') { const e = state.secret.engines.find(x => x.no === Number(v)); p.knownEngines[e.no] = e.working; ask(state, { kind: 'info', player: p.id, title: 'Двигатель №' + e.no, text: e.working ? 'ИСПРАВЕН' : 'ПОВРЕЖДЁН' }, { op: 'noop', then: step.then }); return; }
    p.passed = true;
    next(state, { op: 'move.direct', player: p.id, dest: v, then: { op: 'turn.end' } });
};
OPS['item.extinguisher'] = (state, step) => {
    const p = player(state, step.player);
    if (step.answer === 'fire') removeFire(state, p.room); else { const it = state.intruders[step.answer.slice(2)]; if (it) repelIntruder(state, it); }
    next(state, step.then);
};
OPS['item.glowstick'] = (state, step) => {
    const p = player(state, step.player);
    if (step.answer === 'move') next(state, { op: 'move.start', player: p.id, filter: 'unexplored', noNoise: true, then: step.then });
    else next(state, { op: 'melee.start', player: p.id, noContam: true, noRetaliation: true, then: step.then });
};
OPS['item.techMove'] = (state, step) => { next(state, { op: 'move.direct', player: step.player, dest: step.answer, then: step.then }); };

export { searchRoom as search };
