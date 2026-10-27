// turn.mjs — Player Phase: turns, the main action prompt and dispatch to the action procedures.

import { OPS, ask, next, log, player, pname, removeCardFromGame, intrudersIn, inCombat, turnOrder, cardDef, isContam, payableCards,
    discardCard, payCost, tileOf, room, roomName, handLimit, heavyCount, loseHealth, gainContamination, drawCards,
    HEAVY_NAMES, itemDef, healthState, activePlayers, fx } from './core.mjs';
import { ITEMS, CHARACTERS, OBJECTIVES, WOUNDS } from '../data/cards.mjs';
import { ROOM_TILES } from '../ship.mjs';
import { survivorUpgrade } from './actions3.mjs';
import { roomActionAvailable, roomActionCost } from './rooms.mjs';

OPS['phase.player'] = (state) => {
    state.phase = 'player';
    for (const p of state.players) { p.passed = p.status !== 'active'; p.movedThisRound = false; p.firstShotUsed = false; p.rifleDrawUsed = false; p.adrenalineTurn = false; }
    state.turnCursor = -1;
    log(state, '— Раунд ' + state.round + ': фаза игроков —', 'phase');
    survivorUpgrade(state);
    next(state, { op: 'turn.start' });
};

OPS['turn.start'] = (state) => {
    if (state.selfDestruct > 0) fx(state, { type: 'sdBeep', count: state.selfDestruct });
    const order = turnOrder(state);
    let found = null;
    for (let k = 1; k <= order.length; k++) {
        const idx = (state.turnCursor + k) % order.length;
        const p = order[idx];
        if (p.status === 'active' && !p.passed) { found = idx; break; }
    }
    if (found === null) { next(state, { op: 'phase.intruder' }); return; }
    state.turnCursor = found;
    const p = order[found];
    state.current = p.id;
    state.actionsLeft = 2;
    p.adrenalineTurn = false;
    log(state, 'Ход: ' + pname(p) + '.', 'turn');
    if (p.pod) { next(state, { op: 'pod.turn', player: p.id }); return; }
    next(state, { op: 'turn.choose' });
};

OPS['turn.choose'] = (state) => {
    const p = player(state, state.current);
    if (p.status !== 'active' || p.passed) { next(state, { op: 'turn.end' }); return; }
    if (state.actionsLeft <= 0 && !p.adrenalineTurn) { next(state, { op: 'turn.end' }); return; }
    const menu = buildMenu(state, p);
    ask(state, { kind: 'turn', player: p.id, title: 'Ваш ход — действий осталось: ' + (p.adrenalineTurn ? '∞' : state.actionsLeft), ...menu },
        { op: 'turn.do', player: p.id });
};

export function buildMenu(state, p) {
    const combat = inCombat(state, p);
    const rs = room(state, p.room);
    const tile = tileOf(state, p.room);
    const payable = payableCards(p).length;
    const moveCost = 1 + (p.wounds.includes('knee') && !p.movedThisRound ? 1 : 0) + (p.wounds.includes('leg') && combat ? 1 : 0);
    const actions = [];
    const add = (id, label, cost, ok, reason) => actions.push({ id, label, cost, enabled: ok && payable >= cost, reason: !ok ? reason : payable < cost ? 'Не хватает карт' : '' });

    add('move', 'Перемещение', moveCost, true);
    add('careful', 'Осторожное перемещение', moveCost + 1, !combat, 'Нельзя в бою');
    const weapons = p.items.filter(i => ITEMS[i.item].weapon && i.ammo > 0 && !i.broken);
    add('shoot', 'Стрелять', 1, combat && weapons.length > 0, combat ? 'Нет заряженного оружия' : 'Нет чужих в комнате');
    add('melee', 'Ближний бой', 1, combat, 'Нет чужих в комнате');
    const objs = rs.objects.length > 0;
    add('pickup', 'Поднять тяжёлый объект', 1, objs && heavyCount(p) < handLimit(p), !objs ? 'В комнате нет объектов' : 'Руки заняты');
    const others = state.players.filter(o => o.id !== p.id && o.status === 'active' && o.room === p.room && !o.pod);
    add('trade', 'Передать предмет', 1, others.length > 0 && !combat && (p.items.length + p.heavy.length) > 0, combat ? 'Нельзя в бою' : others.length ? 'Нечего передать' : 'Нет других персонажей');
    const comp = tile && ROOM_TILES[tile].computer;
    add('computer', 'Компьютер' + (state.computerCard ? '' : ''), 1, !!comp && !rs.malfunction && !!state.computerCard, !comp ? 'Нет компьютера' : rs.malfunction ? 'Поломка' : 'Нет карты');
    const ra = roomActionAvailable(state, p);
    add('room', 'Действие комнаты' + (tile ? ': ' + ROOM_TILES[tile].name : ''), roomActionCost(state, p), ra.ok, ra.reason);
    add('pass', 'Спасовать', 0, true);
    if (p.objectives.length === 2) actions.push({ id: 'objective', label: 'Выбрать цель (бесплатно)', cost: 0, enabled: true, reason: '' });
    if (p.items.length + p.heavy.length) actions.push({ id: 'drop', label: 'Выбросить предмет (бесплатно)', cost: 0, enabled: true, reason: '' });

    const cards = p.hand.map(c => {
        const d = cardDef(state, c);
        if (!d || d.contamination) return { id: c, enabled: false, reason: 'Заражение' };
        if (d.reaction) return { id: c, enabled: false, reason: 'Реакция — играется автоматически' };
        if (d.noCombat && combat) return { id: c, enabled: false, reason: 'Нельзя в бою' };
        const req = cardRequirement(state, p, d);
        if (req) return { id: c, enabled: false, reason: req };
        return { id: c, enabled: payable >= (d.cost || 1) + extraCost(d), reason: '' };
    });
    const items = p.items.filter(i => ITEMS[i.item].use).map(i => {
        const d = ITEMS[i.item];
        const cost = (d.free ? 0 : 1) + (p.wounds.includes('hand') && !d.free ? 1 : 0);
        if (i.broken) return { uid: i.uid, enabled: false, reason: 'Поломка', cost };
        const req = itemRequirement(state, p, i);
        return { uid: i.uid, enabled: !req && payable >= cost, reason: req || (payable < cost ? 'Не хватает карт' : ''), cost };
    });
    return { actions, cards, items };
}

function extraCost(d) {
    return ({ coveringFire: 1, forcingFire: 1, scavenging: 1, techCorridors: 1, duckAndCover: 1, neurotoxicGas: 1, feelOfDark: 1, facilityTour: 1 })[d.effect] || 0;
}

function cardRequirement(state, p, d) {
    const rs = room(state, p.room), tile = tileOf(state, p.room);
    switch (d.effect) {
        case 'search': case 'scavenging':
            if (!tile || !ROOM_TILES[tile].items.length) return 'В комнате нет предметов';
            if (d.effect === 'scavenging' && rs.malfunction) return 'Поломка в комнате';
            return '';
        case 'weakSpot': return inCombat(state, p) ? '' : 'Нет чужих';
        case 'scoutAdrenaline': return inCombat(state, p) ? '' : 'Только в комнате с чужим';
        case 'coveringFire': return p.items.some(i => ITEMS[i.item].weapon && i.ammo >= 2 && !i.broken) ? '' : 'Нужно 2 патрона';
        case 'forcingFire': return p.items.some(i => ITEMS[i.item].weapon && i.ammo >= 1 && !i.broken) ? (intrudersIn(state, p.room).some(i => i.type === 'adult') ? '' : 'Нет взрослого чужого') : 'Нужен патрон';
        case 'myLittleFriend': return p.items.some(i => i.item === 'soldierGun' && !i.broken) ? '' : 'Нет винтовки солдата';
        case 'distraction': return p.items.length ? '' : 'Нет предмета для сброса';
        case 'techCorridors': return state.ship.rooms[p.room].tech ? '' : 'Нет входа в тех. коридоры';
        case 'fdTrap': return inCombat(state, p) ? '' : 'Нет чужих';
        case 'fdAim': return inCombat(state, p) && p.items.some(i => ITEMS[i.item].weapon && i.ammo > 0 && !i.broken) ? '' : 'Нужно оружие и чужой';
        case 'ingenuity': return '';
        case 'recharge': return p.items.some(i => i.item === 'smartGun') ? '' : 'Нет умного пистолета';
        case 'reload': return p.items.some(i => i.item === 'sixShooter') ? '' : 'Нет шестизарядника';
        case 'fanning': return p.items.some(i => i.item === 'sixShooter' && i.ammo > 0 && !i.broken) ? (inCombat(state, p) ? '' : 'Нет чужих') : 'Шестизарядник пуст';
        case 'bash': case 'roboticPunch': return inCombat(state, p) ? '' : 'Нет чужих';
        case 'shriek': return intrudersIn(state, p.room).some(i => i.type === 'adult') ? '' : 'Нет взрослого чужого';
        case 'neurotoxicGas': return p.items.some(i => ITEMS[i.item].deck === 'green') ? '' : 'Нужен зелёный предмет';
        case 'catchThis': return p.items.some(i => ITEMS[i.item].kind === 'heavy' && !ITEMS[i.item].quest) ? '' : 'Нет тяжёлого предмета';
        case 'tacticalMove': return p.items.some(i => ITEMS[i.item].weapon && i.ammo > 0 && !i.broken) ? '' : 'Нужен патрон';
        case 'intimidate': return state.players.some(o => o.id !== p.id && o.status === 'active' && o.room === p.room && !o.pod) ? '' : 'Нет других персонажей';
        case 'determination': return rs.malfunction || rs.fire ? 'Поломка или огонь в комнате' : '';
        case 'intranet': case 'riskAssessment': return tile && ROOM_TILES[tile].computer && !rs.malfunction ? '' : 'Нужен компьютер без поломки';
        case 'neuralink': return state.computerCard ? '' : 'Нет карты компьютера';
        case 'cleanUp': return rs.malfunction || rs.fire ? '' : 'Нет поломки или огня';
        case 'synthesizedDrugs': return tile && ROOM_TILES[tile].items.includes('green') && !rs.malfunction && !rs.fire ? '' : 'Нужна зелёная комната без поломки и огня';
        case 'fieldSurgery': return state.players.some(o => o.status === 'active' && o.room === p.room && o.wounds.length) ? '' : 'Нет тяжёлых травм';
        case 'weirdMetabolism': return p.hand.some(isContam) || rs.objects.length ? '' : 'Нет заражения и объектов';
        case 'protocolOverride': { const u = p.items.find(i => i.item === 'ups'); return u && (u.charge ?? 0) > 0 ? '' : 'Нет жетонов ИБП'; }
        case 'emotionScanner': case 'lendAHand': case 'command': case 'wouldYouKindly': return '';
        default: return '';
    }
}

function itemRequirement(state, p, it) {
    const d = ITEMS[it.item], rs = room(state, p.room), tile = tileOf(state, p.room);
    const comp = tile && ROOM_TILES[tile].computer;
    switch (d.use) {
        case 'selfDestructKey': case 'logCodes': case 'engineKey':
            if (d.use === 'engineKey') return '';
            return comp && !rs.malfunction ? '' : 'Только у компьютера без поломки';
        case 'evacKey': return tile === 'evacA' || tile === 'evacB' ? '' : 'Только в эвакуационном отсеке';
        case 'techPlan': return state.ship.rooms[p.room].tech ? '' : 'Нужен вход в тех. коридоры';
        case 'probeArm': return !intrudersIn(state, p.room).length ? 'В комнате нет чужих' : (it.charge ?? ITEMS.probeArm.markers) <= 0 ? 'Все жетоны на предмете' : '';
        case 'grenade': {
            const ok = [p.room, ...state.ship.rooms[p.room].exits.map(e => e.to)].some(r => intrudersIn(state, r).length || room(state, r).objects.some(o => o.type === 'egg') || (tileOf(state, r) === 'nest' && state.nestEggs > 0));
            return ok ? '' : 'Нет цели рядом';
        }
        case 'repelAdult': case 'reagent': return '';
        case 'taser': return '';
        case 'medkit': case 'woundOrHeal2': return '';
        case 'removeContam1': case 'sampleJar': return p.hand.some(isContam) ? '' : 'Нет заражений в руке';
        case 'wrench': return rs.malfunction || rs.fire ? '' : 'Нет поломки или огня';
        case 'pipeMelee': return inCombat(state, p) ? '' : 'Нет чужих';
        default: return '';
    }
}

OPS['turn.do'] = (state, step) => {
    const p = player(state, step.player);
    const a = step.answer;
    const menu = buildMenu(state, p);
    const back = { op: 'turn.choose' };
    const spend = () => { if (!p.adrenalineTurn) state.actionsLeft--; };

    if (a.action === 'card') {
        const c = menu.cards.find(x => x.id === a.cardId);
        if (!c || !c.enabled) { next(state, back); return; }
        const d = cardDef(state, a.cardId);
        if (d.removeAfter) removeCardFromGame(state, p, a.cardId); else discardCard(state, p, a.cardId);
        log(state, pname(p) + ' играет карту «' + d.name + '».', 'action');
        spend();
        payCost(state, p, (d.cost || 1) - 1 + extraCost(d), { op: 'card.effect', player: p.id, effect: d.effect, cardId: a.cardId }, 'Доплата за карту «' + d.name + '»');
        return;
    }
    if (a.action === 'item') {
        const it = menu.items.find(x => x.uid === a.itemId);
        if (!it || !it.enabled) { next(state, back); return; }
        const inst = p.items.find(x => x.uid === a.itemId);
        const d = ITEMS[inst.item];
        log(state, pname(p) + ' использует предмет «' + d.name + '».', 'action');
        if (!d.free) spend();
        payCost(state, p, it.cost, { op: 'item.use', player: p.id, uid: a.itemId }, 'Оплата использования «' + d.name + '»');
        return;
    }
    const act = menu.actions.find(x => x.id === a.action);
    if (!act || !act.enabled) { next(state, back); return; }
    switch (a.action) {
        case 'pass':
            p.passed = true;
            log(state, pname(p) + ' пасует.', 'action');
            next(state, { op: 'pass.discard', player: p.id });
            return;
        case 'objective':
            ask(state, { kind: 'choice', player: p.id, title: 'Выберите цель, которую оставите (вторая уходит из игры)',
                options: p.objectives.map(o => ({ id: o.id, label: OBJECTIVES[o.kind][o.id].name, desc: objectiveText(state, o) })) },
                { op: 'objective.pick', player: p.id });
            return;
        case 'drop': {
            const opts = p.items.map(i => ({ id: 'item:' + i.uid, label: ITEMS[i.item].name }));
            p.heavy.forEach((h, idx) => opts.push({ id: 'heavy:' + idx, label: HEAVY_NAMES[h.type] }));
            ask(state, { kind: 'choice', player: p.id, title: 'Что выбросить?', options: opts, cancel: true }, { op: 'drop.choice', player: p.id });
            return;
        }
        case 'move': case 'careful':
            spend();
            // destination first, payment second (the noise roll comes after both)
            next(state, { op: 'move.start', player: p.id, careful: a.action === 'careful', pay: act.cost });
            return;
        case 'shoot':
            spend();
            payCost(state, p, 1, { op: 'shoot.start', player: p.id }, 'Стрельба: оплата');
            return;
        case 'melee':
            spend();
            payCost(state, p, 1, { op: 'melee.start', player: p.id }, 'Ближний бой: оплата');
            return;
        case 'pickup':
            spend();
            payCost(state, p, 1, { op: 'pickup.start', player: p.id }, 'Поднять объект: оплата');
            return;
        case 'trade':
            spend();
            payCost(state, p, 1, { op: 'trade.start', player: p.id }, 'Передача: оплата');
            return;
        case 'computer':
            spend();
            payCost(state, p, 1, { op: 'computer.start', player: p.id }, 'Компьютер: оплата');
            return;
        case 'room':
            spend();
            payCost(state, p, act.cost, { op: 'room.action', player: p.id }, 'Действие комнаты: оплата');
            return;
    }
    next(state, back);
};

export function objectiveText(state, o) {
    let t = OBJECTIVES[o.kind][o.id].text;
    if (o.target !== undefined) t = t.replace('{target}', pname(state.players[o.target]));
    return t;
}

OPS['objective.pick'] = (state, step) => {
    const p = player(state, step.player);
    const keep = p.objectives.find(o => o.id === step.answer);
    p.objective = keep; p.objectives = [keep];
    log(state, pname(p) + ' выбирает цель.', 'action');
    next(state, { op: 'turn.choose' });
};
OPS['drop.choice'] = (state, step) => {
    const p = player(state, step.player);
    if (step.answer !== 'cancel') dropAnything(state, p, step.answer);
    next(state, { op: 'turn.choose' });
};
export function dropAnything(state, p, id) {
    const rs = room(state, p.room);
    if (id.startsWith('item:')) {
        const uid = id.slice(5);
        const i = p.items.findIndex(x => x.uid === uid);
        if (i >= 0) {
            const it = p.items.splice(i, 1)[0];
            const d = ITEMS[it.item];
            (state.itemDiscard[d.deck] = state.itemDiscard[d.deck] || []).push(it.item);
            log(state, pname(p) + ' выбрасывает «' + d.name + '».', 'minor');
        }
    } else {
        const idx = Number(id.slice(6));
        const h = p.heavy.splice(idx, 1)[0];
        if (h) { rs.objects.push(h); log(state, pname(p) + ' оставляет «' + HEAVY_NAMES[h.type] + '» в комнате.', 'minor'); }
    }
}

OPS['pass.discard'] = (state, step) => {
    const p = player(state, step.player);
    if (p.wounds.includes('bleeding')) loseHealth(state, p, 1, 'кровотечение');
    if (p.status === 'active' && p.wounds.includes('guts')) gainContamination(state, p, 1);
    if (p.status !== 'active' || !p.hand.length) { next(state, { op: 'turn.end' }); return; }
    ask(state, { kind: 'cards', player: p.id, title: 'Пас: можете сбросить любые карты (включая заражения)', cards: [...p.hand], min: 0, max: p.hand.length },
        { op: 'pass.discard.done', player: p.id });
};
OPS['pass.discard.done'] = (state, step) => {
    const p = player(state, step.player);
    for (const c of step.answer) discardCard(state, p, c);
    if (step.answer.length) log(state, pname(p) + ' сбрасывает ' + step.answer.length + ' карт при пасе.', 'minor');
    next(state, { op: 'turn.end' });
};

OPS['turn.end'] = (state) => {
    const p = player(state, state.current);
    if (p.status === 'active' && !p.pod && room(state, p.room).fire && !p.firePaidThisTurn) {
        loseHealth(state, p, 1, 'пожар в комнате');
    }
    p.firePaidThisTurn = false;
    next(state, { op: 'turn.start' });
};

// Card effects dispatch — implemented in actions.mjs; the op is registered here so the order of
// module loading does not matter.
OPS['card.effect'] = (state, step) => {
    const h = OPS['card.' + step.effect];
    if (!h) { log(state, 'Эффект карты «' + step.effect + '» ещё не реализован: карта сброшена.', 'bad'); next(state, { op: 'turn.choose' }); return; }
    h(state, step);
};

// Escape pod: a character sitting in a pod decides at the start of their turn.
OPS['pod.turn'] = (state, step) => {
    const p = player(state, step.player);
    const pod = state.pods.find(x => x.num === p.pod);
    ask(state, { kind: 'choice', player: p.id, title: 'Вы в спасательной капсуле №' + pod.num + '. Что делаете?', options: [
        { id: 'launch', label: 'Отстрелить капсулу', desc: 'Покинуть корабль: вы больше не участвуете, результат — при подсчёте.' },
        { id: 'wait', label: 'Ждать', desc: 'Остаться в капсуле и спасовать в этом раунде.' },
        { id: 'exit', label: 'Выйти', desc: 'Вернуться в эвакуационный отсек и ходить как обычно.' },
    ] }, { op: 'pod.decide', player: p.id });
};
OPS['pod.decide'] = (state, step) => {
    const p = player(state, step.player);
    const pod = state.pods.find(x => x.num === p.pod);
    if (step.answer === 'launch') {
        for (const pid of pod.occupants) { const o = state.players[pid]; o.status = 'escaped'; o.pod = null; log(state, '🚀 ' + pname(o) + ' покидает корабль в капсуле №' + pod.num + '.', 'event'); }
        pod.launched = true; pod.occupants = [];
        next(state, { op: 'turn.end' });
    } else if (step.answer === 'wait') {
        p.passed = true; next(state, { op: 'turn.end' });
    } else {
        pod.occupants = pod.occupants.filter(x => x !== p.id); p.pod = null;
        log(state, pname(p) + ' выходит из капсулы.', 'action');
        next(state, { op: 'turn.choose' });
    }
};

export { CHARACTERS, WOUNDS, healthState, activePlayers, drawCards, itemDef, roomName };
