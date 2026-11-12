// endgame.mjs — final checks: engines, destination, infection, objectives.

import { OPS, ask, next, log, pname, isContam, isInfected, gainContamination } from './core.mjs';
import { eclosionProcedure } from './actions.mjs';
import { shuffle } from '../rng.mjs';
import { OBJECTIVES, COORDINATE_CARDS, DESTINATION_NAMES, ITEMS, FEATS, objectiveTextOf } from '../data/cards.mjs';
import { CARNOMORPH_MUTATIONS } from '../data/carnomorphs.mjs';

function objectiveOf(p) { return p.objective || p.objectives[0]; }
function defOf(p) { const ob = objectiveOf(p); return OBJECTIVES[ob.kind][ob.id]; }

OPS['game.end'] = (state) => {
    if (state.result) return;
    // 23.4: a surviving player who still holds 2 Objectives must choose 1 first.
    const undecided = state.players.find(p => p.status !== 'dead' && p.objectives.length === 2);
    if (undecided) {
        ask(state, { kind: 'choice', player: undecided.id, title: 'Конец игры: выберите цель, которую оставите', options: undecided.objectives.map(o => ({ id: o.id, label: OBJECTIVES[o.kind][o.id].name, desc: objectiveTextOf(OBJECTIVES[o.kind][o.id], state.players, state.enemySet) })) },
            { op: 'game.endPick', player: undecided.id });
        return;
    }
    const prepared = state.enemySet === 'carnomorphs' ? state.carnomorphEnd : state.enemySet === 'voidseeders' ? state.voidEnd : null;
    if (!prepared) log(state, '═══ КОНЕЦ ИГРЫ ═══', 'event');
    const onBoard = p => p.status === 'active' || p.status === 'hibernating';
    const reasons = prepared ? prepared.reasons : {};
    const fail = (p, why) => { if (p.status !== 'dead') { p.status = 'dead'; reasons[p.id] = why; log(state, '☠ ' + pname(p) + ': ' + why + '.', 'death'); } };

    let destination = prepared ? prepared.destination : null;
    if (!prepared && !state.shipDestroyed) {
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
                const d = defOf(p);
                // "Best Friends Forever" also inherits the printed hibernation exception of the
                // hibernating friend it coexists with.
                const friendSafe = d.check === 'bff' && state.players.some(o => o.id !== p.id && o.status === 'hibernating'
                    && (o.objective || o.objectives[0]) && (OBJECTIVES[(o.objective || o.objectives[0]).kind][(o.objective || o.objectives[0]).id].hiberSafe === destination));
                const safe = d.hiberSafe === destination || friendSafe;
                if (destination !== 'earth' && !safe) fail(p, 'гибернация: корабль прибыл не на Землю (' + DESTINATION_NAMES[destination] + ')');
            }
        }
    }
    if (state.enemySet === 'carnomorphs' && !prepared) {
        state.carnomorphEnd = { reasons, destination };
        next(state, { op: 'game.carnomorphFinal', index: 0 });
        return;
    }
    if (state.enemySet === 'voidseeders' && !prepared) {
        state.voidEnd = { reasons, destination };
        next(state, { op: 'game.voidFinal', index: 0 });
        return;
    }
    // 3. Infection → Contamination → shuffle → Eclosion (23.3). A Larva is NOT an automatic death:
    // the character adds one Contamination, merges and shuffles the deck, then resolves Eclosion
    // (draw 4); only a Contamination among those four cards kills.
    for (const p of (state.enemySet === 'carnomorphs' || state.enemySet === 'voidseeders' ? [] : state.players.filter(p => p.status !== 'dead'))) {
        const all = [...p.hand, ...p.deck, ...p.discard].filter(isContam);
        const infected = p.larva || (state.enemySet === 'chytrids' && p.chySpore) || all.some(c => isInfected(state, c));
        log(state, pname(p) + ': проверка заражения — карт ' + all.length + (p.larva ? ', личинка' : '') + ' → ' + (infected ? 'ЗАРАЖЁН' : 'чист') + '.', infected ? 'bad' : 'good');
        if (!infected) continue;
        gainContamination(state, p, 1);
        p.deck = shuffle(state, [...p.deck, ...p.discard.splice(0)]);
        const before = p.status;
        eclosionProcedure(state, p, { final: true });
        if (p.status === 'dead') {
            if (reasons[p.id] === undefined) reasons[p.id] = 'вылупление личинки при финальной проверке';
            log(state, '☠ ' + pname(p) + ': финальная процедура вылупления — заражение в четырёх картах.', 'death');
        } else if (before !== 'dead') {
            log(state, pname(p) + ': финальная процедура вылупления пройдена — заражения среди четырёх карт нет.', 'good');
        }
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
        return { player: p.id, win, alive, objective: def.name, objectiveText: objectiveTextOf(def, state.players, state.enemySet), why };
    });
    state.result = { destination, shipDestroyed: state.shipDestroyed, results };
    delete state.carnomorphEnd; delete state.voidEnd;
    state.queue = []; state.prompt = null; state.resume = null;
};

// Voidseeder final check: count all infections without exceeding 5; at level 5 shuffle the
// complete hand/deck/discard once and check the top four (or three with the revealed weakness).
OPS['game.voidFinal'] = (state, step) => {
    const p = state.players[step.index];
    if (!p) { next(state, { op: 'game.end' }); return; }
    const after = { op: 'game.voidFinal', index: step.index + 1 };
    if (p.status === 'dead') { next(state, after); return; }
    const infections = [...p.hand, ...p.deck, ...p.discard].filter(isContam).length;
    p.madness = Math.min(5, p.madness + infections);
    log(state, pname(p) + ': финальная проверка — инфекций ' + infections + ', безумие ' + p.madness + '.', 'event');
    if (p.madness === 5) {
        const count = (state.voidWeaknesses || []).includes('mentalResilience') ? 3 : 4;
        p.deck = shuffle(state, [...p.hand.splice(0), ...p.deck.splice(0), ...p.discard.splice(0)]);
        p.hand = p.deck.splice(0, count);
        if (p.hand.some(isContam)) {
            p.status = 'dead'; p.health = 0;
            state.voidEnd.reasons[p.id] = 'инфекция среди карт финальной проверки безумия';
            log(state, '☠ ' + pname(p) + ': инфекция среди карт финальной проверки безумия.', 'death');
        } else log(state, pname(p) + ': финальная проверка безумия пройдена.', 'good');
    }
    next(state, after);
};

// Expansion final check: when a survivor lacks a mutation card, scan all their infection
// cards first. The ordinary two-card selection is secret even in a saved end-game prompt.
OPS['game.carnomorphFinal'] = (state, step) => {
    const p = state.players[step.index];
    if (!p) { next(state, { op: 'game.end' }); return; }
    const after = { op: 'game.carnomorphFinal', index: step.index + 1 };
    if (p.status === 'dead') { next(state, after); return; }
    if (!p.mutationCard) {
        const cards = [...p.hand, ...p.deck, ...p.discard].filter(isContam);
        if (!cards.some(c => isInfected(state, c))) {
            log(state, pname(p) + ': финальная проверка мутации — заражённых карт нет.', 'good');
            next(state, after); return;
        }
        const offered = state.mutationDeck.splice(0, 2);
        if (!offered.length) { log(state, 'Финальная проверка: колода мутаций пуста.', 'minor'); next(state, after); return; }
        if (offered.length === 1) {
            p.mutationCard = offered[0]; p.mutationRevealed = false;
            next(state, { op: 'game.carnomorphDraw', player: p.id, then: after }); return;
        }
        ask(state, { kind: 'choice', secret: true, player: p.id, title: 'Финальная проверка: выберите карту мутации',
            options: offered.map(id => ({ id, label: CARNOMORPH_MUTATIONS[id].name, art: 'carnomorph/mutation/' + id, desc: 'Заражён: ' + CARNOMORPH_MUTATIONS[id].infected + ' Не заражён: ' + CARNOMORPH_MUTATIONS[id].clean })) },
            { op: 'game.carnomorphPick', player: p.id, offered, then: after });
        return;
    }
    next(state, { op: 'game.carnomorphDraw', player: p.id, then: after });
};
OPS['game.carnomorphPick'] = (state, step) => {
    const p = state.players[step.player];
    p.mutationCard = step.answer; p.mutationRevealed = false;
    state.mutationDeck.push(...step.offered.filter(id => id !== step.answer));
    shuffle(state, state.mutationDeck);
    next(state, { op: 'game.carnomorphDraw', player: p.id, then: step.then });
};
OPS['game.carnomorphDraw'] = (state, step) => {
    const p = state.players[step.player];
    if (p.status === 'dead') { next(state, step.then); return; }
    // Final check is a single shuffle of all cards, not the regular draw routine (which can
    // reshuffle mid-draw or invoke an Android's in-game drawing abilities).
    p.deck = shuffle(state, [...p.hand.splice(0), ...p.deck.splice(0), ...p.discard.splice(0)]);
    p.hand = p.deck.splice(0, 4);
    const count = p.hand.filter(isContam).length;
    p.mutationMarkers = (p.mutationMarkers || 0) + count;
    log(state, pname(p) + ': финальная проверка мутации — заражений среди четырёх карт: ' + count + ', фишек: ' + p.mutationMarkers + '.', count ? 'bad' : 'good');
    if (p.mutationMarkers >= 4) {
        p.status = 'dead'; p.health = 0;
        state.carnomorphEnd.reasons[p.id] = 'четвёртая фишка мутации при финальной проверке';
        log(state, '☠ ' + pname(p) + ': погибает от мутации при финальной проверке.', 'death');
    }
    next(state, step.then);
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
    const wasInPool = state.feats.includes(step.answer);
    state.feats = state.feats.filter(k => k !== step.answer);
    if (wasInPool) (state.featsUsed || (state.featsUsed = [])).push(step.answer);
    log(state, 'Подвиг «' + FEATS[step.answer].name + '» убран из игры.', 'minor');
    next(state, { op: 'game.end' });
};

/** Evaluate an objective definition for player `p`. `arrived` is the destination the ship reached (null if destroyed). */
export function checkObjective(state, p, def, destination) {
    const arrived = !state.shipDestroyed && destination;
    const bossDead = state.enemySet === 'carnomorphs' ? !!state.carnomorphButcherDead : state.enemySet === 'chytrids' ? !!state.chyQueenDead : state.enemySet === 'voidseeders' ? !!state.voidDespoilerDead : !!state.queenDead;
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
        case 'pursuit': return p.knowledgeActive && p.knowledge >= 8;   // "have the maximum Knowledge" = 8
        case 'quarantine': return arrived === 'mars' || (arrived === 'earth' && nestDestroyed);
        case 'trophyHunter': return bossDead || hasHeavy('charCorpse');
        case 'veniVidiVici': return signal && nestDestroyed;
        case 'abOvo': return !!(state.analyzed && state.analyzed.egg) || !!p.analyzed.egg;
        case 'alienCoverUp': return signal && !othersAlive.some(o => o.knowledge >= 7);
        case 'bugHunt': return (state.carcassCount || 0) >= 4;
        case 'seat': {
            const t = state.players.find(o => o.number === def.seat) || state.players[def.seat - 1];
            if (!t || t.id === p.id) return onlySurvivor;
            return !alive(t) || onlySurvivor;
        }
        case 'extremeBiology': return state.enemySet === 'chytrids' ? (state.chyWeaknesses || []).length >= 2 : state.enemySet === 'voidseeders' ? (state.voidWeaknesses || []).length >= 2 : state.weaknessMode ? (state.weaknesses || []).length >= 2 : (state.adaptationsRemoved || 0) >= 2;
        case 'fortune': return arrived === 'venus' || (signal && state.shipDestroyed);
        case 'necroscopy': return signal && p.analyzed.carcass;
        case 'priceless': return p.knowledgeActive && !state.shipDestroyed;
        case 'priorityOne': return (arrived === 'earth' && !bossDead && !nestDestroyed) || onlySurvivor;
        case 'perfectSpecimen': return hasHeavy('egg') && (escaped || p.knowledgeActive);
    }
    return false;
}
