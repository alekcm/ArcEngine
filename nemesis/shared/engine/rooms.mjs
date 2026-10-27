// rooms.mjs — Room Actions (Redux room sheet) and Computer Actions.

import { OPS, ask, next, log, player, pname, intrudersIn, playersInRoom, room, roomName, tileOf, secretTile, inCombat,
    gainKnowledge, restoreHealth, removeWound, removeFire, removeMalfunction, placeMalfunction, loseHealth, discardCard,
    removeCardFromGame, isContam, drawCards, spawnIntruder, HIBERNATION_TIME, handLimit, heavyCount, findRoomsByTile,
    clearNoiseAround, removeIntruder, corridorsOf, gainContamination, fx } from './core.mjs';
import { ROOM_TILES, engineRooms } from '../ship.mjs';
import { ITEMS, WOUNDS, COMPUTER_CARDS, COORDINATE_CARDS, DESTINATION_NAMES, INTRUDER_NAMES } from '../data/cards.mjs';
import { shuffle } from '../rng.mjs';
import { startSelfDestruct, stopSelfDestruct } from './events.mjs';
import { repelIntruder, checkNest } from './intruders.mjs';
import { revealComputerCard } from './setup.mjs';
import { drawSupport, keepOneOf } from './items.mjs';

export function roomActionCost() { return 1; }

export function roomActionAvailable(state, p, opts = {}) {
    const roomId = opts.room || p.room;
    const tile = tileOf(state, roomId), rs = room(state, roomId);
    if (!tile) return { ok: false, reason: 'Комната не разведана' };
    if (inCombat(state, p)) return { ok: false, reason: 'Нельзя в бою' };
    if (rs.malfunction && tile !== 'engine') return { ok: false, reason: 'Поломка в комнате' };
    switch (tile) {
        case 'archives': return p.knowledgeActive ? { ok: false, reason: 'Жетон знаний уже активирован' } : { ok: true };
        case 'comms': return p.signal ? { ok: false, reason: 'Сигнал уже отправлен' } : { ok: true };
        case 'emergency': return { ok: true };
        case 'evacA': case 'evacB': {
            const sec = tile === 'evacA' ? 'A' : 'B';
            const pods = state.pods.filter(x => x.section === sec && !x.locked && !x.launched && !x.removed && x.occupants.length < 2);
            return pods.length ? { ok: true } : { ok: false, reason: 'Нет разблокированной капсулы со свободным местом' };
        }
        case 'fireControl': return { ok: true };
        case 'generator': return state.selfDestruct > 0 && state.selfDestruct >= 4 ? { ok: false, reason: 'Отсчёт уже не остановить' } : { ok: true };
        case 'laboratory': {
            const objs = [...p.heavy, ...rs.objects].filter(o => o.type !== 'charCorpse');
            return objs.length ? { ok: true } : { ok: false, reason: 'Нет объекта для анализа' };
        }
        case 'nest': return state.nestEggs > 0 ? { ok: true } : { ok: false, reason: 'Яиц не осталось' };
        case 'surgery': return { ok: true };
        case 'repository': return p.supportUsed ? { ok: false, reason: 'Уже использовано' } : { ok: true };
        case 'airlock': {
            const ok = Object.keys(state.ship.rooms).some(r => state.ship.rooms[r].tech && intrudersIn(state, r).length && r !== p.room);
            return ok ? { ok: true } : { ok: false, reason: 'Нет комнаты с тех. входом и чужим' };
        }
        case 'armory': return p.items.some(i => ITEMS[i.item].weapon && i.ammo < ITEMS[i.item].weapon.max) ? { ok: true } : { ok: false, reason: 'Нечего заряжать' };
        case 'cafeteria': return { ok: true };
        case 'commandCenter': return { ok: true };
        case 'containment': return Object.keys(state.ship.rooms).some(r => state.ship.rooms[r].tech && !intrudersIn(state, r).length) ? { ok: true } : { ok: false, reason: 'Нет подходящей комнаты' };
        case 'contaminated': return { ok: false, reason: 'У комнаты нет действия' };
        case 'decon': return { ok: true };
        case 'engineRoom': return { ok: true };
        case 'hatchControl': return { ok: true };
        case 'server': return { ok: true };
        case 'storage': return { ok: true };
        case 'cockpit': return { ok: true };
        case 'hibernatorium': return state.time <= HIBERNATION_TIME ? { ok: true } : { ok: false, reason: 'Гибернация недоступна (время > ' + HIBERNATION_TIME + ')' };
        case 'engine': return { ok: true };
    }
    return { ok: false, reason: '' };
}

OPS['room.action'] = (state, step) => {
    const p = player(state, step.player);
    const tile = step.tile || tileOf(state, p.room);
    const roomId = step.room || p.room;
    const back = step.then || { op: 'turn.choose' };
    const rs = room(state, roomId);
    log(state, pname(p) + ' использует комнату «' + ROOM_TILES[tile].name + '».', 'action');
    switch (tile) {
        case 'archives':
            p.knowledgeActive = true; gainKnowledge(state, p, 2); log(state, 'Жетон знаний активирован.', 'good'); next(state, back); return;
        case 'comms':
            p.signal = true; log(state, '📡 ' + pname(p) + ' отправляет сигнал!', 'good'); next(state, back); return;
        case 'emergency':
            healChoice(state, p, 3, back); return;
        case 'evacA': case 'evacB': {
            next(state, { op: 'noise.roll', player: p.id, room: p.room }, { op: 'pod.enter', player: p.id, section: tile === 'evacA' ? 'A' : 'B', then: back });
            return;
        }
        case 'fireControl': {
            const rooms = Object.keys(state.ship.rooms).filter(r => room(state, r).fire || intrudersIn(state, r).length);
            if (!rooms.length) { log(state, 'Нет комнат с огнём или чужими.', 'minor'); next(state, back); return; }
            ask(state, { kind: 'room', player: p.id, title: 'Пожарный пост: какую комнату обработать?', rooms }, { op: 'room.fireControl', player: p.id, then: back });
            return;
        }
        case 'generator':
            if (state.selfDestruct > 0) { stopSelfDestruct(state); next(state, back); return; }
            ask(state, { kind: 'choice', player: p.id, title: 'Генератор', options: [{ id: 'start', label: 'Запустить самоуничтожение' }, { id: 'no', label: 'Ничего не делать' }] },
                { op: 'room.generator', player: p.id, then: back });
            return;
        case 'laboratory': {
            const opts = [];
            p.heavy.forEach((h, i) => { if (h.type !== 'charCorpse') opts.push({ id: 'mine:' + i, label: 'В руках: ' + objName(h) }); });
            rs.objects.forEach((h, i) => { if (h.type !== 'charCorpse') opts.push({ id: 'room:' + i, label: 'В комнате: ' + objName(h) }); });
            if (!opts.length) { log(state, 'Нечего анализировать.', 'minor'); next(state, back); return; }
            ask(state, { kind: 'choice', player: p.id, title: 'Лаборатория: что анализировать?', options: opts }, { op: 'room.lab', player: p.id, room: roomId, then: back });
            return;
        }
        case 'nest':
            ask(state, { kind: 'choice', player: p.id, title: 'Гнездо (яиц: ' + state.nestEggs + ')', options: [
                { id: 'take', label: 'Взять яйцо', disabled: heavyCount(p) >= handLimit(p) }, { id: 'destroy', label: 'Уничтожить яйцо' }] },
                { op: 'room.nest', player: p.id, then: back });
            return;
        case 'surgery':
            for (const c of [...p.hand]) discardCard(state, p, c);
            p.discard = p.discard.filter(c => !isContam(c));
            p.deck = p.deck.filter(c => !isContam(c));
            if (p.larva) { p.larva = false; log(state, 'Личинка удалена.', 'good'); }
            log(state, pname(p) + ': все заражения удалены из колоды.', 'good');
            loseHealth(state, p, 1, 'операция');
            if (p.status === 'active') { p.passed = true; log(state, pname(p) + ' пасует после операции.', 'action'); next(state, { op: 'turn.end' }); }
            return;
        case 'repository':
            p.supportUsed = true;
            keepOneOf(state, p, drawSupport(state, 3), 'support', back);
            return;
        case 'airlock': {
            const rooms = Object.keys(state.ship.rooms).filter(r => state.ship.rooms[r].tech && intrudersIn(state, r).length && r !== p.room);
            ask(state, { kind: 'room', player: p.id, title: 'Шлюзование: какую комнату продуть? (всё в ней погибнет)', rooms }, { op: 'room.airlock', player: p.id, then: back });
            return;
        }
        case 'armory': {
            const w = p.items.filter(i => ITEMS[i.item].weapon && i.ammo < ITEMS[i.item].weapon.max);
            ask(state, { kind: 'choice', player: p.id, title: 'Оружейная: что зарядить (+2)?', options: w.map(i => ({ id: i.uid, label: ITEMS[i.item].name + ' (' + i.ammo + '/' + ITEMS[i.item].weapon.max + ')' })) },
                { op: 'room.reload', player: p.id, n: 2, then: back });
            return;
        }
        case 'cafeteria':
            restoreHealth(state, p, 2);
            removeOneContam(state, p);
            next(state, back); return;
        case 'commandCenter': {
            ask(state, { kind: 'room', player: p.id, title: 'Командный центр: двери какой комнаты переключить?', rooms: Object.keys(state.ship.rooms) }, { op: 'room.doors', player: p.id, then: back });
            return;
        }
        case 'containment': {
            const rooms = Object.keys(state.ship.rooms).filter(r => state.ship.rooms[r].tech && !intrudersIn(state, r).length);
            ask(state, { kind: 'room', player: p.id, title: 'Изолятор: куда выпустить взрослого чужого?', rooms }, { op: 'room.containment', player: p.id, then: back });
            return;
        }
        case 'decon': {
            const n = p.hand.filter(isContam).length;
            p.hand = p.hand.filter(c => !isContam(c));
            if (p.larva) { p.larva = false; log(state, 'Личинка удалена.', 'good'); }
            log(state, pname(p) + ': удалено заражений из руки — ' + n + '.', 'good');
            next(state, back); return;
        }
        case 'engineRoom': {
            for (const e of state.secret.engines) p.knownEngines[e.no] = e.working;
            ask(state, { kind: 'info', player: p.id, title: 'Состояние двигателей (только вы это видите)', text: state.secret.engines.map(e => 'Двигатель №' + e.no + ': ' + (e.working ? 'ИСПРАВЕН' : 'ПОВРЕЖДЁН')).join('\n') }, { op: 'noop', then: back });
            return;
        }
        case 'hatchControl': {
            const pods = state.pods.filter(x => !x.launched && !x.removed);
            ask(state, { kind: 'choice', player: p.id, title: 'Контроль шлюзов: какую капсулу переключить?', options: pods.map(x => ({ id: String(x.num), label: 'Капсула №' + x.num + ' (' + x.section + ') — ' + (x.locked ? 'заблокирована' : 'открыта') })) },
                { op: 'room.hatch', player: p.id, then: back });
            return;
        }
        case 'server': {
            const rooms = Object.keys(state.ship.rooms).filter(r => r !== roomId && room(state, r).explored && tileOf(state, r) && ROOM_TILES[tileOf(state, r)].computer && tileOf(state, r) !== 'server');
            if (!rooms.length) { log(state, 'Нет других разведанных комнат с компьютером.', 'minor'); next(state, back); return; }
            ask(state, { kind: 'room', player: p.id, title: 'Серверная: действие какой комнаты использовать?', rooms }, { op: 'room.server', player: p.id, then: back });
            return;
        }
        case 'storage': {
            const drawn = [];
            for (const d of ['green', 'red', 'yellow']) { const c = drawItem(state, d); if (c) drawn.push(c); }
            keepOneOf(state, p, drawn, 'items', { op: 'noise.roll', player: p.id, room: p.room, thenAfter: back });
            return;
        }
        case 'cockpit':
            ask(state, { kind: 'choice', player: p.id, title: 'Рубка', options: [
                { id: 'check', label: 'Проверить координаты (тайно)' },
                { id: 'dest', label: 'Изменить пункт назначения (сейчас: ' + state.destination + ')', disabled: state.players.some(x => x.status === 'hibernating') }] },
                { op: 'room.cockpit', player: p.id, then: back });
            return;
        case 'hibernatorium':
            next(state, { op: 'noise.roll', player: p.id, room: p.room }, { op: 'room.hibernate', player: p.id, then: back });
            return;
        case 'engine': {
            const no = state.ship.rooms[roomId].engineNo;
            const e = state.secret.engines.find(x => x.no === no);
            p.knownEngines[no] = e.working;
            ask(state, { kind: 'info', player: p.id, title: 'Двигатель №' + no + ' (только вы это видите)', text: 'Состояние: ' + (e.working ? 'ИСПРАВЕН' : 'ПОВРЕЖДЁН') }, { op: 'noop', then: back });
            return;
        }
    }
    next(state, back);
};
OPS['noop'] = (state, step) => { if (step.then) next(state, step.then); };

function objName(h) { return ({ corpse: 'человеческий труп', charCorpse: 'труп персонажа', carcass: 'туша чужого', egg: 'яйцо' })[h.type]; }

export function healChoice(state, p, hp, back) {
    const opts = [{ id: 'heal', label: 'Восстановить ' + hp + ' здоровья' }];
    for (const w of p.wounds) opts.push({ id: 'w:' + w, label: 'Вылечить травму: ' + WOUNDS[w].name });
    ask(state, { kind: 'choice', player: p.id, title: 'Лечение', options: opts }, { op: 'heal.choice', player: p.id, hp, then: back });
}
OPS['heal.choice'] = (state, step) => {
    const p = player(state, step.player);
    if (step.answer === 'heal') restoreHealth(state, p, step.hp);
    else removeWound(state, p, step.answer.slice(2));
    next(state, step.then);
};
export function removeOneContam(state, p) {
    const i = p.hand.findIndex(isContam);
    if (i >= 0) { p.hand.splice(i, 1); log(state, pname(p) + ': 1 заражение удалено из руки.', 'good'); return true; }
    return false;
}

OPS['room.fireControl'] = (state, step) => {
    const r = step.answer;
    removeFire(state, r);
    for (const it of intrudersIn(state, r)) repelIntruder(state, it);
    next(state, step.then);
};
OPS['room.generator'] = (state, step) => { if (step.answer === 'start') startSelfDestruct(state); next(state, step.then); };
OPS['room.lab'] = (state, step) => {
    const p = player(state, step.player);
    const [where, idx] = step.answer.split(':');
    const list = where === 'mine' ? p.heavy : room(state, step.room || p.room).objects;
    const h = list.splice(Number(idx), 1)[0];
    gainKnowledge(state, p, 2);
    if (h.type === 'egg') p.analyzedEgg = true;
    log(state, pname(p) + ' анализирует объект «' + objName(h) + '».', 'good');
    if (!state.analyzed[h.type]) {
        state.analyzed[h.type] = true;
        log(state, 'Тип объекта использован впервые: адаптация чужих ослаблена (адаптации в этой версии не моделируются).', 'minor');
    }
    next(state, step.then);
};
OPS['room.nest'] = (state, step) => {
    const p = player(state, step.player);
    if (step.answer === 'take') { state.nestEggs--; p.heavy.push({ type: 'egg' }); log(state, pname(p) + ' берёт яйцо из Гнезда (осталось ' + state.nestEggs + ').', 'action'); }
    else { state.nestEggs--; log(state, pname(p) + ' уничтожает яйцо (осталось ' + state.nestEggs + ').', 'action'); }
    checkNest(state);
    next(state, { op: 'noise.roll', player: p.id, room: p.room }, step.then);
};
OPS['room.airlock'] = (state, step) => {
    const r = step.answer;
    for (const c of corridorsOf(state, r)) if (c.id !== 'tech' && state.ship.corridors[c.id].door === 'open') state.ship.corridors[c.id].door = 'closed';
    for (const it of intrudersIn(state, r)) { if (it.type === 'queen') { state.queenDead = true; log(state, 'Королева выброшена в космос!', 'good'); } removeIntruder(state, it.uid, false); }
    for (const o of playersInRoom(state, r)) loseHealth(state, o, 99, 'разгерметизация');
    removeFire(state, r);
    log(state, '🌀 Комната ' + roomName(state, r) + ' продута в космос.', 'event');
    next(state, step.then);
};
OPS['room.reload'] = (state, step) => {
    const p = player(state, step.player);
    const w = p.items.find(i => i.uid === step.answer);
    if (w) { const max = ITEMS[w.item].weapon.max; const before = w.ammo; w.ammo = Math.min(max, w.ammo + step.n); log(state, '«' + ITEMS[w.item].name + '» заряжено: ' + before + ' → ' + w.ammo + '.', 'good'); }
    next(state, step.then);
};
OPS['room.doors'] = (state, step) => {
    const p = player(state, step.player);
    const r = step.answer;
    const cors = state.ship.rooms[r].exits.map(e => state.ship.corridors[e.corridor]).filter(c => c.door !== 'destroyed');
    if (!cors.length) { next(state, step.then); return; }
    ask(state, { kind: 'cards', player: p.id, title: 'Выберите коридоры, двери в которых переключить', cards: cors.map(c => c.id), labels: Object.fromEntries(cors.map(c => [c.id, c.id + ' (' + (c.door === 'closed' ? 'закрыта → открыть' : 'открыта → закрыть') + ')'])), min: 0, max: cors.length },
        { op: 'room.doors.done', player: p.id, then: step.then });
};
OPS['room.doors.done'] = (state, step) => {
    for (const id of step.answer) { const c = state.ship.corridors[id]; c.door = c.door === 'closed' ? 'open' : 'closed'; log(state, 'Дверь ' + id + ': ' + (c.door === 'closed' ? 'закрыта' : 'открыта') + '.', 'event'); }
    next(state, step.then);
};
OPS['room.containment'] = (state, step) => {
    const p = player(state, step.player);
    spawnIntruder(state, 'adult', step.answer);
    placeMalfunction(state, p.room, 'изолятор');
    next(state, step.then);
};
OPS['room.hatch'] = (state, step) => {
    const pod = state.pods.find(x => x.num === Number(step.answer));
    pod.locked = !pod.locked;
    log(state, 'Капсула №' + pod.num + ' теперь ' + (pod.locked ? 'заблокирована' : 'разблокирована') + '.', 'event');
    next(state, step.then);
};
OPS['room.server'] = (state, step) => {
    const p = player(state, step.player);
    const av = roomActionAvailable(state, p, { room: step.answer });
    if (!av.ok) { log(state, 'Действие комнаты недоступно: ' + av.reason + '.', 'minor'); next(state, { op: 'computer.afterServer', then: step.then }); return; }
    next(state, { op: 'room.action', player: p.id, tile: tileOf(state, step.answer), room: step.answer, then: { op: 'computer.afterServer', then: step.then } });
};
OPS['computer.afterServer'] = (state, step) => {
    revealComputerCard(state);
    log(state, 'Новая карта компьютера: «' + COMPUTER_CARDS[state.computerCard].name + '».', 'info');
    next(state, step.then);
};
OPS['room.cockpit'] = (state, step) => {
    const p = player(state, step.player);
    if (step.answer === 'check') {
        p.knownCoords = state.secret.coordinates;
        const card = COORDINATE_CARDS.find(c => c.id === state.secret.coordinates);
        ask(state, { kind: 'info', player: p.id, title: 'Карта координат (только вы это видите)', text: ['A', 'B', 'C', 'D'].map(k => k + ': ' + DESTINATION_NAMES[card[k]]).join('\n') + '\nТекущий пункт назначения: ' + state.destination }, { op: 'noop', then: step.then });
        return;
    }
    ask(state, { kind: 'choice', player: p.id, title: 'Новый пункт назначения', options: ['A', 'B', 'C', 'D'].map(k => ({ id: k, label: k, disabled: k === state.destination })) }, { op: 'room.destination', player: p.id, then: step.then });
};
OPS['room.destination'] = (state, step) => { state.destination = step.answer; log(state, 'Пункт назначения изменён: ' + step.answer + '.', 'event'); next(state, step.then); };
OPS['room.hibernate'] = (state, step) => {
    const p = player(state, step.player);
    if (p.status !== 'active') return;
    if (intrudersIn(state, p.room).length) { log(state, pname(p) + ': гибернация не удалась — в комнате чужой.', 'bad'); next(state, step.then); return; }
    p.status = 'hibernating';
    log(state, '❄ ' + pname(p) + ' уходит в гибернацию.', 'event');
    next(state, { op: 'turn.end' });
};
OPS['pod.enter'] = (state, step) => {
    const p = player(state, step.player);
    if (p.status !== 'active') return;
    if (intrudersIn(state, p.room).length) { log(state, 'Чужой в отсеке — попытка войти в капсулу провалилась.', 'bad'); next(state, step.then); return; }
    const pods = state.pods.filter(x => x.section === step.section && !x.locked && !x.launched && !x.removed && x.occupants.length < 2);
    if (!pods.length) { next(state, step.then); return; }
    ask(state, { kind: 'choice', player: p.id, title: 'В какую капсулу сесть?', options: pods.map(x => ({ id: String(x.num), label: 'Капсула №' + x.num + ' (занято ' + x.occupants.length + '/2)' })) },
        { op: 'pod.sit', player: p.id, then: step.then });
};
OPS['pod.sit'] = (state, step) => {
    const p = player(state, step.player);
    const pod = state.pods.find(x => x.num === Number(step.answer));
    pod.occupants.push(p.id); p.pod = pod.num;
    log(state, pname(p) + ' садится в капсулу №' + pod.num + '.', 'event');
    ask(state, { kind: 'choice', player: p.id, title: 'Отстрелить капсулу сейчас?', options: [{ id: 'launch', label: 'Да, стартовать' }, { id: 'wait', label: 'Ждать' }] }, { op: 'pod.sitDecide', player: p.id, then: step.then });
};
OPS['pod.sitDecide'] = (state, step) => {
    const p = player(state, step.player);
    const pod = state.pods.find(x => x.num === p.pod);
    if (step.answer === 'launch') {
        for (const pid of pod.occupants) { const o = state.players[pid]; o.status = 'escaped'; o.pod = null; log(state, '🚀 ' + pname(o) + ' покидает корабль в капсуле №' + pod.num + '.', 'event'); }
        pod.launched = true; pod.occupants = [];
        next(state, { op: 'turn.end' });
    } else { p.passed = true; next(state, { op: 'turn.end' }); }
};

// ---------------------------------------------------------------------------------------------
// Computer action
// ---------------------------------------------------------------------------------------------
OPS['computer.start'] = (state, step) => {
    const p = player(state, step.player);
    const card = state.computerCard;
    const back = step.then || { op: 'turn.choose' };
    if (!card) { next(state, back); return; }
    log(state, pname(p) + ' использует компьютер: «' + COMPUTER_CARDS[card].name + '».', 'action');
    const done = { op: 'computer.done', player: p.id, card, then: back };
    switch (card) {
        case 'lockdown':
            if (state.noLockdownMalf) state.noLockdownMalf--; else placeMalfunction(state, p.room, 'блокировка');
            state.computerDeck.push(...state.computerDiscard.splice(0), card); shuffle(state, state.computerDeck); state.computerCard = null;
            revealComputerCard(state);
            log(state, 'Колода компьютера перемешана. Новая карта: «' + COMPUTER_CARDS[state.computerCard].name + '».', 'info');
            next(state, back); return;
        case 'openDoors':
            for (const c of Object.values(state.ship.corridors)) if (c.door === 'closed') c.door = 'open';
            log(state, 'Все двери открыты.', 'event'); next(state, done); return;
        case 'closeDoor': {
            const cors = Object.values(state.ship.corridors).filter(c => c.door === 'open');
            ask(state, { kind: 'choice', player: p.id, title: 'Какую дверь закрыть?', options: cors.map(c => ({ id: c.id, label: 'Коридор ' + c.id })) }, { op: 'computer.closeDoor', player: p.id, then: done });
            return;
        }
        case 'engineDiag':
            ask(state, { kind: 'choice', player: p.id, title: 'Какой двигатель проверить?', options: [1, 2, 3].map(n => ({ id: String(n), label: 'Двигатель №' + n })) }, { op: 'computer.engine', player: p.id, then: done });
            return;
        case 'coordinates': {
            p.knownCoords = state.secret.coordinates;
            const c = COORDINATE_CARDS.find(x => x.id === state.secret.coordinates);
            ask(state, { kind: 'info', player: p.id, title: 'Координаты (только вы это видите)', text: ['A', 'B', 'C', 'D'].map(k => k + ': ' + DESTINATION_NAMES[c[k]]).join('\n') + '\nПункт назначения: ' + state.destination }, { op: 'noop', then: done });
            return;
        }
        case 'scanner': {
            const rooms = Object.keys(state.ship.rooms).filter(r => !room(state, r).explored);
            if (!rooms.length) { next(state, done); return; }
            ask(state, { kind: 'room', player: p.id, title: 'Сканер: какую комнату посмотреть?', rooms }, { op: 'computer.scan', player: p.id, then: done });
            return;
        }
        case 'cargo': {
            const it = drawItem(state, 'yellow');
            if (it) giveItem(state, p, it);
            next(state, done); return;
        }
        case 'motionTracker':
            ask(state, { kind: 'room', player: p.id, title: 'Датчик движения: вокруг какой комнаты убрать шум?', rooms: Object.keys(state.ship.rooms) }, { op: 'computer.tracker', player: p.id, then: done });
            return;
    }
    next(state, done);
};
OPS['computer.done'] = (state, step) => {
    const p = player(state, step.player);
    gainKnowledge(state, p, 1);
    revealComputerCard(state);
    log(state, 'Новая карта компьютера: «' + COMPUTER_CARDS[state.computerCard].name + '».', 'info');
    next(state, step.then);
};
OPS['computer.closeDoor'] = (state, step) => { state.ship.corridors[step.answer].door = 'closed'; log(state, 'Дверь ' + step.answer + ' закрыта.', 'event'); next(state, step.then); };
OPS['computer.engine'] = (state, step) => {
    const p = player(state, step.player);
    const e = state.secret.engines.find(x => x.no === Number(step.answer));
    p.knownEngines[e.no] = e.working;
    ask(state, { kind: 'info', player: p.id, title: 'Двигатель №' + e.no + ' (только вы это видите)', text: 'Состояние: ' + (e.working ? 'ИСПРАВЕН' : 'ПОВРЕЖДЁН') }, { op: 'noop', then: step.then });
};
OPS['computer.scan'] = (state, step) => {
    const p = player(state, step.player);
    p.knownTiles = p.knownTiles || {};
    p.knownTiles[step.answer] = secretTile(state, step.answer);
    ask(state, { kind: 'info', player: p.id, title: 'Сканер (только вы это видите)', text: 'Комната ' + step.answer + ': ' + ROOM_TILES[secretTile(state, step.answer)].name }, { op: 'noop', then: step.then });
};
OPS['computer.tracker'] = (state, step) => { clearNoiseAround(state, step.answer); log(state, 'Шум вокруг ' + roomName(state, step.answer) + ' убран.', 'good'); next(state, step.then); };

// ---------------------------------------------------------------------------------------------
// Item deck helpers
// ---------------------------------------------------------------------------------------------
export function drawItem(state, deck) {
    const d = state.itemDecks[deck];
    if (!d.length) { const disc = state.itemDiscard[deck]; if (disc && disc.length) { d.push(...shuffle(state, disc.splice(0))); } }
    const c = d.shift() || null;
    if (c) fx(state, { type: 'item', deck });
    return c;
}
export function giveItem(state, p, itemKey, ammo) {
    const def = ITEMS[itemKey];
    const inst = { uid: 'it' + (++state.itemSeq), item: itemKey, ammo: def.weapon ? (ammo ?? (def.deck === 'support' ? def.weapon.max : 1)) : def.ammoMax !== undefined ? (ammo ?? def.ammoMax) : undefined, broken: false };
    if (def.kind === 'armor') {
        if (p.armor) { (state.itemDiscard[ITEMS[p.armor.item].deck] = state.itemDiscard[ITEMS[p.armor.item].deck] || []).push(p.armor.item); }
        p.armor = inst;
        log(state, pname(p) + ' надевает броню «' + def.name + '».', 'good');
    } else {
        p.items.push(inst);
        log(state, pname(p) + ' получает предмет «' + def.name + '».', 'good');
    }
    if (tileOf(state, p.room) === 'contaminated') gainContamination(state, p, 1);
    if (def.kind === 'heavy' && heavyCount(p) > handLimit(p)) next(state, { op: 'wound.armCheck', player: p.id });
    return inst;
}
