// «Легендарная охота» on the board (Книги правил/Легендарная охота.md pp. 3–7): setup, the
// legendary monster's movement after each round, «Прогнать», ruin tokens and their bonuses,
// the end of the game. The fight itself reuses engine/fight.mjs (f.legend, see legendFightStart).
import { STEPS, push, ask } from './flow.mjs';
import { LOC, ADJ, log, fx, shuffle, randInt, CARDS, removeFrom } from './util.mjs';
import { SKILL_NAME, skillName } from '../data/rules-data.mjs';
import { LEGENDS, LEGMOVES, RUINS } from '../data/gen-data.mjs';
import { LEGEND, LEGEND_BY_KEY, LEG_MOVE, RUIN, SOLO_MOVES, SOLO_NAME, legendOpts } from '../data/legend-data.mjs';

export const legendOn = (state) => !!state.legend;
const BOARD_LOCS = (n) => n >= 0 && n <= 18;

// ---------------------------------------------------------------------------------------------
// Setup (p. 3; solo p. 7)
// ---------------------------------------------------------------------------------------------
export function setupLegend(state) {
    const o = legendOpts(state.exp);
    if (!o) return;
    const L = o.mon ? LEGEND_BY_KEY[o.mon] : LEGENDS[randInt(state, LEGENDS.length)];
    let moves = shuffle(state, LEGMOVES.map(m => m.id));
    if (state.solo) moves = moves.slice(0, SOLO_MOVES[o.solo]);
    state.legend = {
        mon: L.id, loc: L.start, side: o.side, solo: state.solo ? o.solo : null,
        moveDeck: moves, moveDiscard: [], lastMove: null,
        ruinPool: shuffle(state, RUINS.map(r => r.id)), ruins: {},
    };
    log(state, `Легендарная охота: ${L.name} появляется в локации ${LOC[L.start].name} (памятка, сторона ${o.side}${state.solo ? `; одиночная игра — ${moves.length} карт перемещения, ${SOLO_NAME[o.solo]}` : ''})`);
}

// ---------------------------------------------------------------------------------------------
// Movement (pp. 4–5)
// ---------------------------------------------------------------------------------------------
/** Shortest path lengths to `to` over the Continent (ruins do not change the distance). */
export function distTo(to) {
    const d = { [to]: 0 };
    const q = [to];
    while (q.length) {
        const a = q.shift();
        for (const b of ADJ[a] || []) if (BOARD_LOCS(b) && d[b] == null) { d[b] = d[a] + 1; q.push(b); }
    }
    return d;
}
/** Neighbours the monster may enter now (no ruin token). Works on the state and on a player's view
 *  (where `ruins` is the list of locations). */
export const freeNeighbours = (state, loc) => {
    const r = state.legend.ruins;
    return (ADJ[loc] || []).filter(n => BOARD_LOCS(n) && (Array.isArray(r) ? !r.includes(n) : r[n] == null));
};
/** Where one movement point may take the monster toward `dest`: the nearest neighbours without
 *  ruins; if all nearest ones hold ruins — any neighbour without ruins; none — []. */
export function stepOptions(state, dest) {
    const L = state.legend;
    const all = (ADJ[L.loc] || []).filter(BOARD_LOCS);
    const free = freeNeighbours(state, L.loc);
    if (!free.length) return [];
    const d = distTo(dest);
    const best = Math.min(...all.map(n => d[n] ?? 99));
    const near = free.filter(n => (d[n] ?? 99) === best);
    return near.length ? near : free;
}
/** The last player (to the right of the first one) reveals movement cards and breaks ties. */
const lastSeat = (state) => state.players.length - 1;

/** Reveal the top movement card; `pts` = the player-count column, or `one` (Прогнать). */
STEPS.legendMove = (state, step) => {
    const L = state.legend;
    if (!L) return;
    if (!L.moveDeck.length) {
        if (state.solo) { push(state, { op: 'legendLost' }); return; }
        L.moveDeck = shuffle(state, L.moveDiscard.splice(0));
        log(state, 'Колода перемещения легендарного монстра закончилась: сброс перемешан в новую колоду');
    }
    const id = L.moveDeck.shift();
    L.moveDiscard.push(id);
    const c = LEG_MOVE[id];
    const pts = step.one ? 1 : c.pts[Math.min(5, state.players.length) - 1];
    L.lastMove = id;
    log(state, `${LEGEND[L.mon].name}: карта перемещения — к локации ${c.main} (${LOC[c.main].name}), затем ${c.second} (${LOC[c.second].name}); очков перемещения: ${pts}${step.one ? ' (прогнан)' : ''}`, { kind: 'move' });
    fx(state, { k: 'legendCard', id, pts });
    push(state, { op: 'legendStep', main: c.main, second: c.second, left: pts, toSecond: false });
};
STEPS.legendStep = (state, step) => {
    const L = state.legend;
    if (step.left <= 0) return;
    let toSecond = step.toSecond;
    if (!toSecond && L.loc === step.main) toSecond = true;
    const dest = toSecond ? step.second : step.main;
    if (toSecond && L.loc === dest) { log(state, `${LEGEND[L.mon].name} уже во второстепенной локации — оставшиеся очки перемещения не используются`); return; }
    const opts = stepOptions(state, dest);
    if (!opts.length) { log(state, `${LEGEND[L.mon].name}: во всех соседних локациях руины — перемещение закончено`); return; }
    const next = { ...step, toSecond };
    if (opts.length === 1) { push(state, { op: 'legendGo', to: opts[0], next }); return; }
    const cp = state.players[lastSeat(state)];
    if (cp.bot || cp.away) { push(state, { op: 'legendGo', to: botStepPick(state, opts), next }); return; }
    ask(state, {
        seat: cp.seat, kind: 'choice', ui: 'map', title: 'Перемещение легендарного монстра',
        text: `${LEGEND[L.mon].name} может пойти в несколько одинаково подходящих локаций (к локации ${dest}). Последний игрок выбирает, куда.`,
        options: opts.map(n => ({ id: String(n), label: `${n}. ${LOC[n].name}`, loc: n })), op: 'legendGoChosen', args: { next },
    });
};
STEPS.legendGoChosen = (state, step) => { push(state, { op: 'legendGo', to: Number(step.choice), next: step.next }); };
STEPS.legendGo = (state, step) => {
    moveLegend(state, step.to);
    if (step.next && step.next.left > 1) push(state, { op: 'legendStep', ...step.next, left: step.next.left - 1 });
};
/** One step: a random face-down ruin token stays in the location the monster leaves. */
function moveLegend(state, to) {
    const L = state.legend;
    const from = L.loc;
    if (L.ruinPool.length && L.ruins[from] == null) L.ruins[from] = L.ruinPool.pop();
    L.loc = to;
    log(state, `${LEGEND[L.mon].name}: ${LOC[from].name} → ${LOC[to].name}; в покинутой локации — жетон руин`, { kind: 'move' });
    fx(state, { k: 'legendMove', from, to });
}
/** Bots breaking a tie: keep the monster away from the other players, near themselves. */
function botStepPick(state, opts) {
    const me = state.players[lastSeat(state)];
    const d = distTo(me.loc);
    return opts.slice().sort((a, b) => (d[a] ?? 99) - (d[b] ?? 99) || a - b)[0];
}
STEPS.legendLost = (state) => {
    state.winner = null;
    state.lost = true;
    state.stage = 'over';
    state.prompt = null;
    log(state, `Поражение: карты перемещения закончились — ${LEGEND[state.legend.mon].name} ввергает Континент в хаос`, { kind: 'win' });
    fx(state, { k: 'lost' });
};

// ---------------------------------------------------------------------------------------------
// «Прогнать» (p. 5)
// ---------------------------------------------------------------------------------------------
export function chaseError(state, p) {
    const L = state.legend;
    if (!L) return 'Нет легендарного монстра';
    const t = state.turn;
    if (!t || t.seat !== p.seat || t.phase !== 1 || t.afterExplore) return 'Только в фазе I своего хода';
    if (!t.moved) return 'Сначала нужно переместиться хотя бы раз';
    if (p.loc !== L.loc) return 'Легендарный монстр в другой локации';
    if (!freeNeighbours(state, L.loc).length) return 'Во всех соседних локациях руины';
    if (!p.hand.length) return 'Нужна карта в руке';
    return null;
}
STEPS.chaseAsk = (state, step) => {
    const p = state.players[step.seat];
    if (p.hand.length === 1 || p.bot) { push(state, { op: 'chaseDo', seat: p.seat, ids: [p.bot ? cheapest(p) : p.hand[0]] }); return; }
    ask(state, { seat: p.seat, kind: 'cards', from: 'hand', ui: 'hand', ids: p.hand.slice(), min: 1, max: 1, title: 'Прогнать легендарного монстра', text: 'Сбросьте 1 любую карту из руки.', op: 'chaseDo', args: { seat: p.seat } });
};
const cheapest = (p) => p.hand.slice().sort((a, b) => (CARDS[a].cost || 0) - (CARDS[b].cost || 0))[0];
STEPS.chaseDo = (state, step) => {
    const p = state.players[step.seat];
    const id = step.ids[0];
    if (!removeFrom(p.hand, id)) return;
    p.discard.push(id);
    fx(state, { k: 'discard', seat: p.seat, ids: [id] });
    log(state, `${p.name} прогоняет легендарного монстра, сбросив «${CARDS[id].name}»`);
    if (!state.solo) { push(state, { op: 'legendMove', one: true }); return; }
    // Solo: no movement card — the player picks a neighbour without ruins.
    const opts = freeNeighbours(state, state.legend.loc);
    if (opts.length === 1 || p.bot) { push(state, { op: 'legendGo', to: p.bot ? botChaseSolo(state, p, opts) : opts[0] }); return; }
    ask(state, { seat: p.seat, kind: 'choice', ui: 'map', title: 'Прогнать легендарного монстра', text: 'Выберите соседнюю локацию без руин, куда уйдёт монстр.', options: opts.map(n => ({ id: String(n), label: `${n}. ${LOC[n].name}`, loc: n })), op: 'legendGoChosen', args: { next: null } });
};
/** Solo bot: the ruin stays where the bot stands; send the monster where it can be chased again
 *  (most free neighbours besides the bot's location), ties — the lowest number. */
function botChaseSolo(state, p, opts) {
    const free = (n) => freeNeighbours(state, n).filter(x => x !== p.loc).length;
    return opts.slice().sort((a, b) => free(b) - free(a) || a - b)[0];
}

// ---------------------------------------------------------------------------------------------
// Ruin tokens (pp. 5–6)
// ---------------------------------------------------------------------------------------------
/** End of phase I in a location with a ruin token: take it and get its bonus. */
STEPS.ruinPickup = (state, step) => {
    const L = state.legend;
    if (!L) return;
    const p = state.players[step.seat];
    const id = L.ruins[p.loc];
    if (id == null) return;
    delete L.ruins[p.loc];
    log(state, `${p.name} забирает жетон руин в локации ${LOC[p.loc].name}`);
    push(state, { op: 'ruinGain', seat: p.seat, id });
};
/** A ruin token from the supply (a lost legendary fight). */
STEPS.ruinFromPool = (state, step) => {
    const L = state.legend;
    const p = state.players[step.seat];
    if (!L.ruinPool.length) { log(state, 'Запас жетонов руин пуст'); return; }
    const id = L.ruinPool.splice(randInt(state, L.ruinPool.length), 1)[0];
    log(state, `${p.name} берёт жетон руин из запаса`);
    push(state, { op: 'ruinGain', seat: p.seat, id });
};
STEPS.ruinGain = (state, step) => {
    const p = state.players[step.seat];
    const r = RUIN[step.id];
    (p.ruins = p.ruins || []).push(step.id);
    log(state, `${p.name}: руины — ${r.text}`, { kind: 'gain' });
    fx(state, { k: 'ruin', seat: p.seat, id: step.id });
    const fx_ = r.fx, seq = [];
    if (fx_.gold) { p.gold += fx_.gold; fx(state, { k: 'gold', seat: p.seat, n: fx_.gold }); }
    if (fx_.shieldDown) p.shield = Math.max(0, p.shield - fx_.shieldDown);
    if (fx_.shield0) p.shield = 0;
    if (fx_.draw3 && state.turn) state.turn.drawDelta += fx_.draw3;
    if (fx_.elixir) seq.push({ op: 'gainElixir', seat: p.seat, n: fx_.elixir, why: 'руины' });
    if (fx_.zeroCard) seq.push({ op: 'takeZeroCard', seat: p.seat });
    if (fx_.skill === 'any') seq.push({ op: 'ruinSkillAsk', seat: p.seat });
    else if (fx_.skill) seq.push({ op: 'raiseSkill', seat: p.seat, skill: fx_.skill, why: 'руины', noLevelCards: true });
    push(state, ...seq);
};
STEPS.ruinSkillAsk = (state, step) => {
    const p = state.players[step.seat];
    const opts = ['combat', 'defense', 'alchemy', 'spec'].filter(s => p.skills[s] < 5);
    if (!opts.length) return;
    if (p.bot || opts.length === 1) { push(state, { op: 'raiseSkill', seat: p.seat, skill: opts.sort((a, b) => p.skills[a] - p.skills[b])[0], why: 'руины', noLevelCards: true }); return; }
    ask(state, { seat: p.seat, kind: 'choice', title: 'Руины', text: 'Увеличьте любой свой навык на 1 (без карт за повышение уровня ведьмака).', options: opts.map(s => ({ id: s, label: `${skillName(p, s)} ${p.skills[s]} → ${p.skills[s] + 1}` })), op: 'ruinSkillDo', args: { seat: p.seat } });
};
STEPS.ruinSkillDo = (state, step) => { push(state, { op: 'raiseSkill', seat: step.seat, skill: step.choice, why: 'руины', noLevelCards: true }); };

// ---------------------------------------------------------------------------------------------
// Fight helpers
// ---------------------------------------------------------------------------------------------
/** Can `p` start the legendary fight here? */
export function legendFightError(state, p) {
    const L = state.legend;
    if (!L) return 'Нет легендарного монстра';
    if (p.loc !== L.loc) return 'Легендарный монстр в другой локации';
    return null;
}
/** Ruin tokens on the board (Ледяной великан I). */
export const ruinsOnBoard = (state) => state.legend ? Object.keys(state.legend.ruins).length : 0;
