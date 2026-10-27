// endgame.mjs — final checks: engines, destination, infection, objectives.

import { OPS, ask, next, log, pname, isContam, isInfected } from './core.mjs';
import { OBJECTIVES, COORDINATE_CARDS, DESTINATION_NAMES, ITEMS, FEATS, objectiveTextOf } from '../data/cards.mjs';

function objectiveOf(p) { return p.objective || p.objectives[0]; }
function defOf(p) { const ob = objectiveOf(p); return OBJECTIVES[ob.kind][ob.id]; }

OPS['game.end'] = (state) => {
    if (state.result) return;
    // 23.4: a surviving player who still holds 2 Objectives must choose 1 first.
    const undecided = state.players.find(p => p.status !== 'dead' && p.objectives.length === 2);
    if (undecided) {
        ask(state, { kind: 'choice', player: undecided.id, title: 'Конец игры: выберите цель, которую оставите', options: undecided.objectives.map(o => ({ id: o.id, label: OBJECTIVES[o.kind][o.id].name, desc: objectiveTextOf(OBJECTIVES[o.kind][o.id], state.players) })) },
            { op: 'game.endPick', player: undecided.id });
        return;
    }
    log(state, '═══ КОНЕЦ ИГРЫ ═══', 'event');
    const onBoard = p => p.status === 'active' || p.status === 'hibernating';
    const reasons = {};
    const fail = (p, why) => { if (p.status !== 'dead') { p.status = 'dead'; reasons[p.id] = why; log(state, '☠ ' + pname(p) + ': ' + why + '.', 'death'); } };

    let destination = null;
    if (!state.shipDestroyed) {
        // 22.2: the ship jumps — awake characters aboard die
        for (const p of state.players.filter(p => p.status === 'active')) fail(p, 'прыжок в гиперпространство без гибернации');
        // 1. Engines
        const working = state.secret.engines.filter(e => e.working).length;
        log(state, 'Двигатели: исправно ' + working + ' из 3.', 'event');
        if (working < 2) { for (const p of state.players.filter(onBoard)) fail(p, 'корабль не смог уйти в гиперпространство'); state.shipDestroyed = true; }
        else {
            // 2. Destination
            const card = COORDINATE_CARDS.find(c => c.id === state.secret.coordinates);
            destination = card[state.destination];
            log(state, 'Пункт назначения ' + state.destination + ' — ' + DESTINATION_NAMES[destination] + '.', 'event');
            // 23.2: hibernating characters die unless the ship reaches Earth (or their Objective makes an exception)
            for (const p of state.players.filter(onBoard)) {
                const safe = defOf(p).hiberSafe === destination;
                if (destination !== 'earth' && !safe) fail(p, 'гибернация: корабль прибыл не на Землю (' + DESTINATION_NAMES[destination] + ')');
            }
        }
    }
    // 3. Infection — everyone who is still alive (on board or in a pod)
    for (const p of state.players.filter(p => p.status !== 'dead')) {
        const all = [...p.hand, ...p.deck, ...p.discard].filter(isContam);
        const infected = p.larva || all.some(c => isInfected(state, c));
        log(state, pname(p) + ': проверка заражения — карт ' + all.length + (p.larva ? ', личинка' : '') + ' → ' + (infected ? 'ЗАРАЖЁН' : 'чист') + '.', infected ? 'bad' : 'good');
        if (infected) fail(p, 'заражение обнаружено при карантине');
    }
    // 4. Objectives
    const results = state.players.map(p => {
        const alive = p.status !== 'dead';
        const ob = objectiveOf(p);
        const def = OBJECTIVES[ob.kind][ob.id];
        const done = checkObjective(state, p, def, destination);
        const win = alive && done;
        const why = !alive ? (reasons[p.id] || 'погиб') : done ? 'цель выполнена' : 'цель не выполнена';
        log(state, (win ? '🏆 ' : '✖ ') + pname(p) + ' — ' + (win ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ') + ' (' + why + ').', win ? 'good' : 'bad');
        return { player: p.id, win, alive, objective: def.name, objectiveText: objectiveTextOf(def, state.players), why };
    });
    state.result = { destination, shipDestroyed: state.shipDestroyed, results };
    state.queue = []; state.prompt = null; state.resume = null;
};

OPS['game.endPick'] = (state, step) => {
    const p = state.players[step.player];
    const keep = p.objectives.find(o => o.id === step.answer);
    p.objective = keep; p.objectives = [keep];
    log(state, pname(p) + ' выбирает цель перед финальной проверкой.', 'action');
    // 5.3: ...and removes 1 available Feat without resolving it
    if (state.feats && state.feats.length) {
        ask(state, { kind: 'choice', player: p.id, title: 'Уберите 1 доступный подвиг из игры (без розыгрыша)', options: state.feats.map(k => ({ id: k, label: FEATS[k].name, desc: FEATS[k].text })) }, { op: 'game.endFeat', player: p.id });
        return;
    }
    next(state, { op: 'game.end' });
};
OPS['game.endFeat'] = (state, step) => {
    state.feats = state.feats.filter(k => k !== step.answer);
    log(state, 'Подвиг «' + FEATS[step.answer].name + '» убран из игры.', 'minor');
    next(state, { op: 'game.end' });
};

/** Evaluate an objective definition for player `p`. `arrived` is the destination the ship reached (null if destroyed). */
export function checkObjective(state, p, def, destination) {
    const arrived = !state.shipDestroyed && destination;
    const alive = o => o.status !== 'dead';
    const others = state.players.filter(o => o.id !== p.id);
    const onlySurvivor = alive(p) && others.every(o => !alive(o));
    const escaped = p.status === 'escaped';
    const hibernating = p.status === 'hibernating';
    const othersAlive = others.filter(alive);
    const othersOnBoardAlive = othersAlive.filter(o => o.status === 'active' || o.status === 'hibernating');
    const hasHeavy = t => p.heavy.some(h => h.type === t);
    const signal = !!p.signal;
    const nestDestroyed = !!state.nestDestroyed || (state.nestDiscovered && state.nestEggs <= 0);
    const fires = Object.values(state.roomState).filter(r => r.fire).length;
    const engines = state.secret.engines.filter(e => e.working).length;
    const last = state.finishOrder.length ? state.finishOrder[state.finishOrder.length - 1] : null;
    const finishedLast = last === p.id;
    switch (def.check) {
        case 'bff': return (escaped && othersOnBoardAlive.length >= 1) || (hibernating && othersAlive.some(o => o.status === 'hibernating'));
        case 'disclosure': return p.knowledgeActive && hasHeavy('carcass');
        case 'disposing': return signal && state.shipDestroyed;
        case 'postMortem': return p.knowledgeActive && p.analyzed.corpse;
        case 'heroicEscape': return (finishedLast && othersAlive.length >= 1) || (escaped && othersOnBoardAlive.length >= 1);
        case 'highestBidder': return arrived === 'venus' || (escaped && p.items.some(i => ITEMS[i.item].deck === 'support'));
        case 'hoarder': {
            const its = [...p.items, ...(p.armor ? [p.armor] : [])].filter(i => !i.start);
            const col = c => its.some(i => ITEMS[i.item].deck === c);
            return escaped && its.length >= 5 && col('green') && col('red') && col('yellow');
        }
        case 'insuranceFraud': return (escaped && arrived === 'space') || (signal && state.shipDestroyed);
        case 'oldestFriend': return (signal && arrived === 'earth') || onlySurvivor;
        case 'pristine': return arrived === 'earth' && (fires <= 1 || engines === 3);
        case 'pursuit': return p.knowledgeActive && others.every(o => o.knowledge <= p.knowledge);
        case 'quarantine': return arrived === 'mars' || (arrived === 'earth' && nestDestroyed);
        case 'trophyHunter': return !!state.queenDead || hasHeavy('charCorpse');
        case 'veniVidiVici': return signal && nestDestroyed;
        case 'abOvo': return !!p.analyzed.egg;
        case 'alienCoverUp': return signal && !othersAlive.some(o => o.knowledge >= 7);
        case 'bugHunt': return (state.carcassCount || 0) >= 4;
        case 'seat': {
            const t = state.players.find(o => o.number === def.seat) || state.players[def.seat - 1];
            if (!t || t.id === p.id) return onlySurvivor;
            return !alive(t) || onlySurvivor;
        }
        case 'extremeBiology': return (state.adaptationsRemoved || 0) >= 2;
        case 'fortune': return arrived === 'venus' || (signal && state.shipDestroyed);
        case 'necroscopy': return signal && p.analyzed.carcass;
        case 'priceless': return p.knowledgeActive && !state.shipDestroyed;
        case 'priorityOne': return (arrived === 'earth' && !state.queenDead && !nestDestroyed) || onlySurvivor;
        case 'perfectSpecimen': return hasHeavy('egg') && (escaped || p.knowledgeActive);
    }
    return false;
}
