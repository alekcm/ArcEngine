// endgame.mjs — final checks: engines, destination, infection, objectives.

import { OPS, log, pname, isContam, isInfected } from './core.mjs';
import { OBJECTIVES, COORDINATE_CARDS, DESTINATION_NAMES } from '../data/cards.mjs';

OPS['game.end'] = (state) => {
    if (state.result) return;
    log(state, '═══ КОНЕЦ ИГРЫ ═══', 'event');
    const onBoard = p => p.status === 'active' || p.status === 'hibernating';
    const reasons = {};
    const fail = (p, why) => { if (p.status !== 'dead') { p.status = 'dead'; reasons[p.id] = why; log(state, '☠ ' + pname(p) + ': ' + why + '.', 'death'); } };

    let destination = null;
    if (!state.shipDestroyed) {
        // 1. Engines
        const working = state.secret.engines.filter(e => e.working).length;
        log(state, 'Двигатели: исправно ' + working + ' из 3.', 'event');
        if (working < 2) { for (const p of state.players.filter(onBoard)) fail(p, 'корабль не смог уйти в гиперпространство'); state.shipDestroyed = true; }
        else {
            // 2. Destination
            const card = COORDINATE_CARDS.find(c => c.id === state.secret.coordinates);
            destination = card[state.destination];
            log(state, 'Пункт назначения ' + state.destination + ' — ' + DESTINATION_NAMES[destination] + '.', 'event');
            if (destination === 'venus' || destination === 'space') for (const p of state.players.filter(onBoard)) fail(p, 'корабль потерян (' + DESTINATION_NAMES[destination] + ')');
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
        const ob = p.objective || p.objectives[0];
        const def = OBJECTIVES[ob.kind][ob.id];
        const done = checkObjective(state, p, ob, def, destination);
        const win = alive && done;
        const why = !alive ? (reasons[p.id] || 'погиб') : done ? 'цель выполнена' : 'цель не выполнена';
        log(state, (win ? '🏆 ' : '✖ ') + pname(p) + ' — ' + (win ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ') + ' (' + why + ').', win ? 'good' : 'bad');
        return { player: p.id, win, alive, objective: def.name, objectiveText: def.text.replace('{target}', ob.target !== undefined ? pname(state.players[ob.target]) : ''), why };
    });
    state.result = { destination, shipDestroyed: state.shipDestroyed, results };
    state.queue = []; state.prompt = null; state.resume = null;
};

function checkObjective(state, p, ob, def, destination) {
    const arrived = !state.shipDestroyed && destination;
    switch (def.check) {
        case 'signal': return p.signal;
        case 'nestDestroyed': return state.nestDestroyed || (state.nestDiscovered && state.nestEggs <= 0);
        case 'earth': return arrived === 'earth';
        case 'queenDead': return !!state.queenDead;
        case 'knowledge5': return p.knowledge >= 5;
        case 'escaped': return p.status === 'escaped';
        case 'mars': return arrived === 'mars';
        case 'eggAnalyzed': return !!p.analyzedEgg;
        case 'carcassCarried': return p.heavy.some(h => h.type === 'carcass');
        case 'signalKnowledge4': return p.signal && p.knowledge >= 4;
        case 'notEarth': return arrived !== 'earth';
        case 'rivalDead': return state.players[ob.target].status === 'dead';
    }
    return false;
}
