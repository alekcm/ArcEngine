// rooms.mjs — Room Actions (Redux room sheet) and Computer Actions.

import { OPS, ask, next, log, player, pname, intrudersIn, playersInRoom, room, roomName, tileOf, secretTile, inCombat,
    gainKnowledge, restoreHealth, removeWound, removeFire, removeMalfunction, placeMalfunction, loseHealth, discardCard,
    removeCardFromGame, isContam, drawCards, spawnIntruder, HIBERNATION_TIME, handLimit, heavyCount, findRoomsByTile,
    clearNoiseAround, removeIntruder, corridorsOf, gainContamination, fx, intruderLabel } from './core.mjs';
import { dealHits } from './combat.mjs';
import { ROOM_TILES, engineRooms } from '../ship.mjs';
import { ITEMS, WOUNDS, COMPUTER_CARDS, COORDINATE_CARDS, DESTINATION_NAMES, INTRUDER_NAMES, ADAPTATIONS, EVENT_CARDS } from '../data/cards.mjs';
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
                { op: 'room.nest', player: p.id, then: back, noNoise: step.noNoise });
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
    p.analyzed = p.analyzed || {}; p.analyzed[h.type] = true;
    log(state, pname(p) + ' анализирует объект «' + objName(h) + '».', 'good');
    analyzeAdaptation(state, p, h.type, step.then);
};
/** Lab rule: the first analyzed object of each type removes one active intruder Adaptation. */
export function analyzeAdaptation(state, p, type, then) {
    if (state.analyzed[type] || !state.adaptations.length) { if (state.analyzed[type]) log(state, 'Объект этого типа уже использовался против адаптаций.', 'minor'); next(state, then); return; }
    state.analyzed[type] = true;
    ask(state, { kind: 'choice', player: p.id, title: 'Анализ «' + objName({ type }) + '»: какую адаптацию чужих удалить?',
        options: state.adaptations.map(k => ({ id: k, label: ADAPTATIONS[k].name, desc: ADAPTATIONS[k].text })) }, { op: 'adaptation.remove', player: p.id, then });
}
OPS['adaptation.remove'] = (state, step) => {
    const k = step.answer;
    state.adaptations = state.adaptations.filter(x => x !== k);
    state.adaptationsRemoved = (state.adaptationsRemoved || 0) + 1;
    log(state, '🧬 Адаптация чужих «' + ADAPTATIONS[k].name + '» удалена! Осталось: ' + (state.adaptations.length ? state.adaptations.map(x => ADAPTATIONS[x].name).join(', ') : 'нет') + '.', 'good');
    next(state, step.then);
};
OPS['room.nest'] = (state, step) => {
    const p = player(state, step.player);
    if (step.answer === 'take') { state.nestEggs--; p.heavy.push({ type: 'egg' }); log(state, pname(p) + ' берёт яйцо из Гнезда (осталось ' + state.nestEggs + ').', 'action'); }
    else { state.nestEggs--; log(state, pname(p) + ' уничтожает яйцо (осталось ' + state.nestEggs + ').', 'action'); }
    checkNest(state);
    if (step.noNoise) next(state, step.then); else next(state, { op: 'noise.roll', player: p.id, room: p.room }, step.then);
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
    p.status = 'hibernating'; state.finishOrder.push(p.id);
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
        for (const pid of pod.occupants) { const o = state.players[pid]; o.status = 'escaped'; o.pod = null; state.finishOrder.push(o.id); log(state, '🚀 ' + pname(o) + ' покидает корабль в капсуле №' + pod.num + '.', 'event'); }
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
    if (card === 'lockdown') {
        if (state.noLockdownMalf) state.noLockdownMalf--; else placeMalfunction(state, p.room, 'блокировка');
        state.computerDeck.push(...state.computerDiscard.splice(0), card); shuffle(state, state.computerDeck); state.computerCard = null;
        revealComputerCard(state);
        log(state, 'Колода компьютера перемешана. Новая карта: «' + COMPUTER_CARDS[state.computerCard].name + '».', 'info');
        next(state, back); return;
    }
    const done = { op: 'computer.done', player: p.id, card, then: back };
    const opts = Object.entries(COMPUTER_CARDS[card].options).map(([id, text]) => {
        const why = computerOptionBlocked(state, p, id);
        return { id, label: text, disabled: !!why, desc: why || '' };
    });
    if (opts.every(o => o.disabled)) { log(state, 'Ни один вариант карты компьютера сейчас невозможен.', 'minor'); next(state, done); return; }
    ask(state, { kind: 'choice', player: p.id, title: 'Компьютер — «' + COMPUTER_CARDS[card].name + '»: выберите вариант', options: opts }, { op: 'computer.option', player: p.id, card, then: done });
};
const computerRooms = (state) => Object.keys(state.ship.rooms).filter(r => { const t = tileOf(state, r); return t && ROOM_TILES[t].computer && room(state, r).explored; });
const noisyFarCorridors = (state, p) => {
    const near = new Set(corridorsOf(state, p.room).map(c => c.id));
    const list = Object.values(state.ship.corridors).filter(c => c.noise && !near.has(c.id)).map(c => c.id);
    if (state.ship.techNoise && !near.has('tech')) list.push('tech');
    return list;
};
/** Returns a reason string if the option cannot be used right now, else ''. */
function computerOptionBlocked(state, p, id) {
    switch (id) {
        case 'draw': return state.players.some(o => o.status === 'active' && o.deck.length + o.discard.length > 0) ? '' : 'Некому брать карты';
        case 'scan': return Object.keys(state.ship.rooms).some(r => !room(state, r).explored) ? '' : 'Все комнаты разведаны';
        case 'noise': return Object.keys(state.ship.rooms).some(r => !playersInRoom(state, r).length) ? '' : 'Нет комнаты без персонажей';
        case 'know': return p.hand.length ? '' : 'Нет карт в руке';
        case 'heal': return '';
        case 'fixComp': return computerRooms(state).some(r => room(state, r).malfunction) ? '' : 'Нет поломки в комнате с компьютером';
        case 'purge': return '';
        case 'ammo': return p.items.some(i => ITEMS[i.item].weapon && !ITEMS[i.item].weapon.noAmmo && !i.broken && i.ammo < ITEMS[i.item].weapon.max) ? '' : 'Нет оружия, которое можно зарядить';
        case 'door': return Object.values(state.ship.corridors).some(c => c.door !== 'destroyed') ? '' : 'Нет дверей';
        case 'hit2': return Object.keys(state.intruders).length ? '' : 'На корабле нет чужих';
        case 'item': return p.hand.length ? '' : 'Нет карт в руке';
        case 'quiet': return noisyFarCorridors(state, p).length ? '' : 'Нет шума в дальних коридорах';
        case 'malf': return computerRooms(state).some(r => !room(state, r).malfunction) ? '' : 'Во всех комнатах с компьютером уже поломка';
        case 'event': return state.eventDeck.length ? '' : 'Колода событий пуста';
    }
    return '';
}
OPS['computer.option'] = (state, step) => {
    const p = player(state, step.player);
    const id = step.answer, done = step.then;
    const sel = (title, options, op, extra) => ask(state, { kind: 'choice', player: p.id, title, options }, { op, player: p.id, then: done, ...extra });
    log(state, 'Вариант: ' + COMPUTER_CARDS[step.card].options[id], 'minor');
    switch (id) {
        case 'draw':
            sel('Кто берёт 1 карту?', state.players.filter(o => o.status === 'active').map(o => ({ id: String(o.id), label: pname(o) })), 'computer.draw');
            return;
        case 'scan': {
            const rooms = Object.keys(state.ship.rooms).filter(r => !room(state, r).explored);
            ask(state, { kind: 'room', player: p.id, title: 'Какую неразведанную комнату посмотреть?', rooms }, { op: 'computer.scan', player: p.id, then: done });
            return;
        }
        case 'noise': {
            const rooms = Object.keys(state.ship.rooms).filter(r => !playersInRoom(state, r).length);
            ask(state, { kind: 'room', player: p.id, title: 'В какой комнате сделать бросок шума?', rooms }, { op: 'computer.noise', player: p.id, then: done });
            return;
        }
        case 'know':
            ask(state, { kind: 'cards', player: p.id, title: 'Сбросьте 1 карту — получите 1 знание', cards: [...p.hand], min: 1, max: 1 }, { op: 'computer.know', player: p.id, then: done });
            return;
        case 'heal': restoreHealth(state, p, 1); next(state, done); return;
        case 'fixComp': {
            const rooms = computerRooms(state).filter(r => room(state, r).malfunction);
            if (rooms.length === 1) { removeMalfunction(state, rooms[0]); next(state, done); return; }
            ask(state, { kind: 'room', player: p.id, title: 'В какой комнате с компьютером убрать поломку?', rooms }, { op: 'computer.fixComp', player: p.id, then: done });
            return;
        }
        case 'purge':
            ask(state, { kind: 'room', player: p.id, title: 'Какую комнату очистить (огонь + отогнать чужих)?', rooms: Object.keys(state.ship.rooms) }, { op: 'computer.purge', player: p.id, then: done });
            return;
        case 'ammo': {
            const ws = p.items.filter(i => ITEMS[i.item].weapon && !ITEMS[i.item].weapon.noAmmo && !i.broken && i.ammo < ITEMS[i.item].weapon.max);
            if (ws.length === 1) { ws[0].ammo++; log(state, '«' + ITEMS[ws[0].item].name + '»: +1 патрон (' + ws[0].ammo + ').', 'good'); next(state, done); return; }
            sel('Какое оружие зарядить?', ws.map(w => ({ id: w.uid, label: ITEMS[w.item].name + ' (' + w.ammo + '/' + ITEMS[w.item].weapon.max + ')' })), 'computer.ammo');
            return;
        }
        case 'door':
            sel('Какую дверь переключить?', Object.values(state.ship.corridors).filter(c => c.door !== 'destroyed').map(c => ({ id: c.id, label: 'Коридор ' + c.id + ' — ' + (c.door === 'closed' ? 'открыть' : 'закрыть') })), 'computer.door');
            return;
        case 'hit2':
            sel('Какому чужому нанести 2 ранения?', Object.values(state.intruders).map(it => ({ id: it.uid, label: intruderLabel(state, it) + ' — ' + roomName(state, it.room) })), 'computer.hit2');
            return;
        case 'item':
            ask(state, { kind: 'cards', player: p.id, title: 'Сбросьте 1 карту — возьмите предмет', cards: [...p.hand], min: 1, max: 1 }, { op: 'computer.itemPay', player: p.id, then: done });
            return;
        case 'quiet':
            sel('Из какого коридора убрать шум?', noisyFarCorridors(state, p).map(c => ({ id: c, label: c === 'tech' ? 'Тех. коридоры' : 'Коридор ' + c })), 'computer.quiet');
            return;
        case 'malf': {
            const rooms = computerRooms(state).filter(r => !room(state, r).malfunction);
            ask(state, { kind: 'room', player: p.id, title: 'В какую комнату с компьютером положить поломку?', rooms }, { op: 'computer.malf', player: p.id, then: done });
            return;
        }
        case 'event': {
            const ev = EVENT_CARDS.find(e => e.id === state.eventDeck[0]);
            ask(state, { kind: 'choice', player: p.id, title: 'Верхняя карта событий (только вы это видите): «' + ev.name + '» — ' + ev.text,
                options: [{ id: 'top', label: 'Оставить сверху' }, { id: 'bottom', label: 'Положить под низ' }] }, { op: 'computer.event', player: p.id, then: done });
            return;
        }
    }
    next(state, done);
};
OPS['computer.draw'] = (state, step) => { const o = player(state, Number(step.answer)); drawCards(state, o, 1); next(state, step.then); };
OPS['computer.noise'] = (state, step) => { next(state, { op: 'noise.roll', player: step.player, room: step.answer }, step.then); };
OPS['computer.know'] = (state, step) => { const p = player(state, step.player); for (const c of step.answer) discardCard(state, p, c); gainKnowledge(state, p, 1); next(state, step.then); };
OPS['computer.fixComp'] = (state, step) => { removeMalfunction(state, step.answer); next(state, step.then); };
OPS['computer.purge'] = (state, step) => {
    const r = step.answer;
    if (room(state, r).fire) removeFire(state, r);
    for (const it of intrudersIn(state, r)) repelIntruder(state, it);
    next(state, step.then);
};
OPS['computer.ammo'] = (state, step) => { const p = player(state, step.player); const w = p.items.find(i => i.uid === step.answer); if (w) { w.ammo++; log(state, '«' + ITEMS[w.item].name + '»: +1 патрон (' + w.ammo + ').', 'good'); } next(state, step.then); };
OPS['computer.door'] = (state, step) => { const c = state.ship.corridors[step.answer]; c.door = c.door === 'closed' ? 'open' : 'closed'; log(state, 'Дверь ' + c.id + ' теперь ' + (c.door === 'closed' ? 'закрыта' : 'открыта') + '.', 'event'); next(state, step.then); };
OPS['computer.hit2'] = (state, step) => { const p = player(state, step.player); const it = state.intruders[step.answer]; if (it) { log(state, 'Компьютер: 2 ранения ' + intruderLabel(state, it) + '.', 'combat'); dealHits(state, p, it, 2, 0, {}); } next(state, step.then); };
OPS['computer.itemPay'] = (state, step) => {
    const p = player(state, step.player);
    for (const c of step.answer) discardCard(state, p, c);
    ask(state, { kind: 'choice', player: p.id, title: 'Из какой колоды взять предмет?', options: ['green', 'red', 'yellow'].map(d => ({ id: d, label: ({ green: 'Зелёная', red: 'Красная', yellow: 'Жёлтая' })[d] + ' (' + state.itemDecks[d].length + ')', disabled: !state.itemDecks[d].length && !(state.itemDiscard[d] || []).length })) },
        { op: 'computer.itemDeck', player: p.id, then: step.then });
};
OPS['computer.itemDeck'] = (state, step) => {
    const p = player(state, step.player);
    const it = drawItem(state, step.answer);
    if (!it) { next(state, step.then); return; }
    ask(state, { kind: 'choice', player: p.id, title: 'Предмет: «' + ITEMS[it].name + '» — ' + ITEMS[it].text, options: [{ id: 'keep', label: 'Оставить' }, { id: 'discard', label: 'Сбросить' }] }, { op: 'computer.itemKeep', player: p.id, item: it, deck: step.answer, then: step.then });
};
OPS['computer.itemKeep'] = (state, step) => {
    const p = player(state, step.player);
    if (step.answer === 'keep') giveItem(state, p, step.item); else { (state.itemDiscard[step.deck] = state.itemDiscard[step.deck] || []).push(step.item); log(state, '«' + ITEMS[step.item].name + '» сброшен.', 'minor'); }
    next(state, step.then);
};
OPS['computer.quiet'] = (state, step) => { if (step.answer === 'tech') state.ship.techNoise = false; else state.ship.corridors[step.answer].noise = false; log(state, 'Шум убран: ' + (step.answer === 'tech' ? 'тех. коридоры' : 'коридор ' + step.answer) + '.', 'good'); next(state, step.then); };
OPS['computer.malf'] = (state, step) => { placeMalfunction(state, step.answer, 'компьютер'); next(state, step.then); };
OPS['computer.event'] = (state, step) => { if (step.answer === 'bottom') { state.eventDeck.push(state.eventDeck.shift()); log(state, 'Карта событий положена под низ колоды.', 'minor'); } else log(state, 'Карта событий оставлена сверху.', 'minor'); next(state, step.then); };
OPS['computer.done'] = (state, step) => {
    const p = player(state, step.player);
    gainKnowledge(state, p, 1);
    revealComputerCard(state);
    log(state, 'Новая карта компьютера: «' + COMPUTER_CARDS[state.computerCard].name + '».', 'info');
    next(state, step.then);
};
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
    const tok = state.secret.tokens[step.answer];
    const TOK = { malfunction: 'поломка', fire: 'огонь', corpse: 'труп', door: 'закрытая дверь' };
    ask(state, { kind: 'info', player: p.id, title: 'Сканер (только вы это видите)', text: 'Комната ' + step.answer + ': ' + ROOM_TILES[secretTile(state, step.answer)].name + '\nЖетон исследования: ' + (TOK[tok] || 'нет') }, { op: 'noop', then: step.then });
};

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
