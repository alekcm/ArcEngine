// Bots see exactly the per-seat view a human gets and act through the same apply().
// botCommand(view, opts) returns one command or null: route planning to the best goal on the map,
// fight readiness by «hand + deck», phase III buying by deck fit (see docs/witcher/02-decisions.md).
import { CARDS, LOC, ADJ, MONSTER, homeOf } from './engine/util.mjs';
import { LOC_ACTIONS, SCHOOLS, ELIXIR_LIMIT, SPEC_TABLE, isMage } from './data/rules-data.mjs';
import { autoReroll } from './engine/turn.mjs';
import { linkIndex, comboTotals, comboError, elixirError } from './engine/fight.mjs';
import { movePaymentError } from './engine/turn.mjs';
import { findChain } from './engine/vuln.mjs';
import { trainCost, hasWitcherTrophy } from './engine/effects.mjs';
import { ARMOR } from './data/legend-data.mjs';
import { freeNeighbours } from './engine/legend.mjs';
import { seaEdges, dagonUp, dagonLocOpen } from './engine/skellige.mjs';

export const cardValue = (id) => {
    const c = CARDS[id];
    if (!c) return 0;
    const f = c.fx;
    // «По следу монстра»: dice, Река гнева, any colour; «убрать карту» cost counts as 3.
    return (f.dmg || 0) * 3 + (f.shield || 0) * 2 + (f.draw || 0) + (f.top ? 2 : 0) + c.links.length * 1.5 + (c.burn ? 3 : c.cost)
        + (f.dice ? 6 : 0) + (f.river ? 5 : 0) + (c.any ? 2 : 0) + (f.fixedDraw != null ? -2 : 0) + (c.onDiscard ? 1 : 0)
        // «Чародеи»: barrier, energy, energy-scaled symbols, the paid extra effect.
        + (f.barrier || 0) * 1.5 + (f.energy || 0) * 1.5 + (f.dmgE ? 5 : 0) + (f.barrierE ? 3 : 0) + (f.drawE ? 2 : 0) + (f.anyDiscard ? 3 : 0)
        + (c.extra ? 1.5 : 0);
};

/** «Чародеи»: the best mage combo — chains through printed links or a paid any-colour link, and
 *  the best set of energy payments for the extras (all subsets of up to 4 such cards, else greedy).
 *  Returns the ids array with `.pay` (indices). */
function bestMageCombo(view, p) {
    const f = view.fight;
    const hand = p.hand;
    const forced = f.cur && f.cur.forcedFirst && hand.includes(f.cur.forcedFirst) ? f.cur.forcedFirst : null;
    const onlyOne = !!(f.cur && f.cur.onlyOne);
    const maxLen = f.cur && f.cur.r && f.cur.r.maxCombo != null ? f.cur.r.maxCombo : 7;
    let best = { ids: [], pay: [], score: -Infinity };
    const score = (t) => (t.dmg * 3 + Math.min(t.barrier || 0, 4) * 1.4 + (t.energyEnd || 0) * 0.8
        + (t.fixedDraw != null ? -4 : (t.draw + (t.drawE || 0) * (t.energyEnd || 0)) * 1.2) + t.top + (t.anyDiscard || 0) * 1.5 + t.ret.length * 2 + Math.min(t.shield, 4) * 0.5);
    const tryChain = (chain) => {
        const extras = chain.map((id, i) => (CARDS[id].extra ? i : -1)).filter(i => i >= 0);
        const sets = [];
        if (extras.length <= 4) for (let m = 0; m < (1 << extras.length); m++) sets.push(extras.filter((_, k) => m & (1 << k)));
        else { sets.push([]); sets.push(extras); }
        for (const pay of sets) {
            if (comboError(view, p, chain, { pay })) continue;
            const s = score(comboTotals(view, p, chain, { pay }));
            if (s > best.score) best = { ids: chain.slice(), pay, score: s };
        }
    };
    let budget = 600;
    const dfs = (chain, rest) => {
        if (budget-- <= 0) return;
        if (chain.length) {
            if (forced && chain[0] !== forced) return;
            tryChain(chain);
            if (onlyOne || chain.length >= maxLen) return;
        }
        for (const id of rest) {
            const prev = chain.length ? CARDS[chain[chain.length - 1]] : null;
            const linked = !prev || linkIndex(prev, CARDS[id]) >= 0 || !!(prev.extra && prev.extra.fx.anyLink) || !!prev.fx.anyLink;
            if (linked) dfs([...chain, id], rest.filter(x => x !== id));
        }
    };
    dfs([], hand);
    const out = best.ids.slice();
    out.pay = best.pay;
    out.score = best.score;
    return out;
}
/** «Чародеи»: what the best combo of this turn loses when `n` energy is spent outside it first
 *  («Молнии», Кащей's «энергия −1 → урон»): the paid extras it can no longer afford and the
 *  energy left at the end (in the combo score's units: 1 damage = 3). */
function energyLoss(view, p, n) {
    if (p.shield < n) return Infinity;
    return bestMageCombo(view, p).score - bestMageCombo(view, { ...p, shield: p.shield - n }).score;
}
/** «Молнии» (Альзур): the expected damage of the die + the level modifier, in combo-score units. */
function lightningValue(p) {
    const [mod] = SPEC_TABLE.alzur[Math.max(0, p.skills.spec - 1)];
    let ev = 0;
    for (let r = 1; r <= 6; r++) { const v = r + mod; ev += (v >= 6 ? 3 : v >= 4 ? 2 : v >= 2 ? 1 : 0) / 6; }
    return ev * 3;
}

/** Best combo by DFS over the hand (at most ~7 cards, cheap). With Цири's «Старшая Кровь»
 *  available, one link of the chain may be the any-colour blood link: returns { ids, blood }. */
export function bestCombo(view, p, useBlood = false) {
    if (isMage(p)) { const ids = bestMageCombo(view, p); return useBlood ? { ids, blood: null } : ids; }
    const hand = p.hand;
    const f = view.fight;
    const forced = f.cur && f.cur.forcedFirst && hand.includes(f.cur.forcedFirst) ? f.cur.forcedFirst : null;
    // Special attacks («Уязвимости и особые атаки») may forbid cards: only legal chains count,
    // and with no legal card at all the combo is empty.
    let best = { ids: [], blood: null, score: -Infinity };
    // Whole-fight limits (Пугач: at most 3 colours, legendary abilities) are checked the same way.
    const restricted = !!(f.cur && f.cur.r && Object.keys(f.cur.r).length) || !!(MONSTER[f.mon] && MONSTER[f.mon].legend) || !!(f.whole && Object.keys(f.whole).length);
    const score = (ids, blood) => {
        const t = comboTotals(view, p, ids, { blood });
        // Blood is once per fight: only spend it for a real gain.
        const diceEv = t.dice.reduce((a, d) => a + (d.kind === 'aard' ? 1 : 2.67), 0);
        return (t.dmg + diceEv) * 3 + Math.min(t.shield, 4 - p.shield) * 2 + (t.fixedDraw != null ? -4 : t.draw * 1.2) + t.top + t.ret.length * 2 - (blood != null ? 2.5 : 0);
    };
    const dfs = (chain, rest, blood) => {
        if (chain.length) {
            if (forced && chain[0] !== forced) return;
            if (restricted && comboError(view, p, chain, { blood })) return;
            const s = score(chain, blood);
            if (s > best.score) best = { ids: chain.slice(), blood, score: s };
            if (f.cur && f.cur.onlyOne) return;
        }
        for (const id of rest) {
            const linked = !chain.length || linkIndex(CARDS[chain[chain.length - 1]], CARDS[id]) >= 0;
            if (linked) dfs([...chain, id], rest.filter(x => x !== id), blood);
            if (chain.length && useBlood && blood == null) dfs([...chain, id], rest.filter(x => x !== id), chain.length);
        }
    };
    dfs([], hand, null);
    return useBlood ? { ids: best.ids, blood: best.blood } : best.ids;
}

let R = Math.random;
export function botCommand(view, opts = {}) {
    R = opts.rand || Math.random;
    const me = view.you;
    const p = view.players[me];
    const pr = view.prompt;
    if (pr && pr.seat === me && !pr.foreign) return answerPrompt(view, p, pr);
    if (pr) return null;
    const f = view.fight;
    if (f && f.seat === me && f.stage === 'witcher') {
        // Elixirs first when clearly useful.
        for (const e of p.elixirs) {
            if (elixirError(view, p, e)) continue;
            const id = e.split('#')[0];
            if (id === 'POTION-01' && p.shield < 2) return { t: 'elixir', id: e };
            if (id === 'POTION-02' && p.hand.length >= 3) return { t: 'elixir', id: e };
            if (id === 'POTION-06' || id === 'POTION-07') return { t: 'elixir', id: e };
            if (id === 'POTION-04' && p.shield >= 1 && p.deckCount >= 4) return { t: 'elixir', id: e };
        }
        // «Молнии» costs 1 energy: only when the die is worth more than what the combo loses.
        if (opts.options && opts.options.fight && !opts.options.fight.spec
            && (p.school !== 'alzur' || lightningValue(p) >= energyLoss(view, p, 1))) return { t: 'spec' };
        // Bombs: damage ones at once, «Самум» with a short hand, «Лунная пыль» when the shield is low.
        for (const b of (opts.options && opts.options.fight && opts.options.fight.bombs) || []) {
            if (b.err) continue;
            const id = b.id.split('#')[0];
            if (id === 'BOMB-02' || id === 'BOMB-03' || id === 'BOMB-04') return { t: 'bomb', id: b.id };
            if (id === 'BOMB-01' && p.hand.length <= 3) return { t: 'bomb', id: b.id };
            if (id === 'BOMB-05' && p.shield <= 1) return { t: 'bomb', id: b.id };
        }
        // Equipment / companions: free damage at once, «discard 1 → 2 damage» with a full hand.
        const act = (opts.options && opts.options.fight && opts.options.fight.active || []).filter(a => !a.err);
        const gear = act.find(a => a.key === 'CONT79-14' || a.key === 'CONT79-20' || a.key === 'CONT79-56'
            || ((a.key === 'CONT79-15' || a.key === 'CONT79-01') && p.hand.length >= 3));
        if (gear) return { t: 'active', key: gear.key };
        // Кащей's vulnerabilities: the die at once; «shield −1 → damage» with shield to spare; a mage
        // pays energy when the damage is worth more than what the combo loses without it.
        const va = ((opts.options && opts.options.fight && opts.options.fight.vulnActs) || []).find(a => !a.err
            && (a.k === 'kDie' || (isMage(p) ? a.dmg * 3 >= energyLoss(view, p, a.cost) : p.shield >= 2)));
        if (va) return { t: 'vulnAct', i: va.i };
        const canBlood = !!(opts.options && opts.options.fight && opts.options.fight.blood === null);
        const best = bestCombo(view, p, canBlood);
        const ids = canBlood ? best.ids : best, blood = canBlood ? best.blood : null;
        if (ids.pay && ids.pay.length) return { t: 'combo', ids: ids.slice(), pay: ids.pay };
        return blood != null ? { t: 'combo', ids, blood } : { t: 'combo', ids };
    }
    const t = view.turn;
    if (!t || t.seat !== me || t.phase !== 1 || f) return null;
    const o = opts.options;
    if (!o) return null;
    // Quests: complete whenever standing on the location.
    const qd = (o.quests || []).find(q => !q.err);
    if (qd) return { t: 'quest', i: qd.i };
    if (t.afterExplore) {
        if (o.loc && !o.loc.err) { const a = locActionCommand(view, p, o.loc); if (a) return a; }
        return { t: 'endExplore' };
    }
    // Location action of the place we stand on (after moving): take it when it is useful.
    if (t.moved && o.loc && !o.loc.err) {
        const a = locActionCommand(view, p, o.loc);
        if (a) return a;
    }
    // Poker with a witcher met here: with spare gold, now and then (pp. 13–14).
    const wp = (o.pokers || []).find(x => !x.err);
    if (wp && p.gold >= 2 && R() < 0.5) return { t: 'wpoker', seat: wp.seat };
    // Phase II right here when it is the best thing to do: a fight costs no more cards this way.
    const fightOpt = o.phase2.find(x => x.id === 'fight');
    const here = view.slots.find(s => s.mon && s.token === p.loc);
    if (fightOpt && !fightOpt.err && here && winChance(view, p, here) >= (soloLegendRush(view, p) > 1 ? 0.45 : FIGHT_NOW)) return { t: 'fight' };
    // «Легендарная охота»: the legendary monster here and the odds are good — that wins the game.
    const legOpt = o.phase2.find(x => x.id === 'legend' && !x.err);
    if (legOpt && legendChance(view, p) >= legendNeed(view)) return { t: 'legend' };
    // «Прогнать» (p. 5): 1 card — the monster leaves a ruin token right here, and ending phase I on
    // it gives its bonus (and −1 life of the monster in the fight; solo: −1 per 2 tokens).
    if (chaseWorth(view, p, p.loc) && o.chase && !o.chase.err) return { t: 'chase' };
    const duel = duelTarget(view, p, o);
    if (duel != null && (t.moved || !o.moves.length)) return { t: 'duel', seat: duel };
    // Route: the best goal on the map (monsters, quests, hunting tokens, useful actions), one
    // step along the shortest path; the turn loop calls us again after every step.
    const step = o.moves.length ? planStep(view, p, o) : null;
    if (step) return step;
    return phase2(view, p, o, fightOpt, here);
}

/** Phase II once the moving is over. */
function phase2(view, p, o, fightOpt, here) {
    const canFight = fightOpt && !fightOpt.err;
    const wc = canFight && here ? winChance(view, p, here) : 0;
    const med = o.phase2.find(x => x.id === 'meditate');
    const leg = o.phase2.find(x => x.id === 'legend' && !x.err);
    if (leg && legendChance(view, p) >= legendNeed(view)) return { t: 'legend' };
    if (canFight && wc >= (soloLegendRush(view, p) > 1 ? 0.45 : 0.7)) return { t: 'fight' };
    const sea = o.phase2.find(x => x.id === 'skFight' && !x.err);
    if (sea && seaFoe(view) && winChance(view, p, { mon: seaFoe(view), terrain: 'joker' }) >= 0.5) return { t: 'skFight' };
    if (med && !med.err) return { t: 'meditate', trophy: med.trophies[0] };
    if (canFight && wc >= 0.3) return { t: 'fight' };
    const ex = o.phase2.filter(x => x.id.startsWith('explore-') && !x.err);
    if (ex.length) return { t: 'explore', deck: ex[Math.floor(R() * ex.length)].id === 'explore-city' ? 'city' : 'wild' };
    if (canFight) return { t: 'fight' };
    // Phase II is obligatory: when a witcher fight is the only action left, it is fought.
    const anyDuel = o.phase2.find(x => x.id.startsWith('duel-') && !x.err);
    if (anyDuel) return { t: 'duel', seat: anyDuel.seat };
    // A lost legendary fight still gives a ruin token (and the deck is reshuffled anyway).
    if (o.phase2.some(x => x.id === 'legend' && !x.err)) return { t: 'legend' };
    const skip = o.phase2.find(x => x.id === 'skipPhase2' && !x.err);
    if (skip) return { t: 'skipPhase2' };
    return null;
}
/** «Легендарная охота»: chance against the legendary monster — like winChance, with 20 life
 *  cards minus ruins, the first turn for any ruin, and the armor absorbing damage every turn. */
export function legendChance(view, p, handLoss = 0) {
    const L = view.legend;
    if (!L) return 0;
    const ruins = p.ruins ? p.ruins.length : (p.ruinCount || 0);
    const armor = ARMOR[L.side][Math.max(0, Math.min(4, p.track))];
    let hp = Math.max(0, p.hand.length - handLoss) + (p.deckCount || 0) + p.shield + (p.skills.combat - 1) * 0.5 + (p.level - 3) * 0.75;
    hp += (view.solo ? Math.floor(ruins / 2) : ruins) * 1.2 + (ruins ? 3 : 0) - armor * 3 - 4;
    return 1 / (1 + Math.exp(-(hp - 15) / 2));
}
/** Solo «Легендарная охота»: the movement deck is the clock and the armor falls with every trophy —
 *  normal monsters first (×1.6 while the armor is up), with the last cards — only the legend. */
function soloLegendRush(view, p) {
    if (!view.solo || !view.legend) return 1;
    if (view.legend.moveDeck <= 2) return 0.3;
    return ARMOR[view.legend.side][Math.max(0, Math.min(4, p.track))] > 0 ? 1.6 : 1;
}
/** «Прогнать» is worth a card when the fight is not on yet and a new ruin token stays at `loc`. */
function chaseWorth(view, p, loc, handLoss = 0) {
    const L = view.legend;
    if (!L || L.loc !== loc || !L.ruinPool || L.ruins.includes(loc)) return false;
    if (!freeNeighbours(view, loc).length || p.hand.length - handLoss < 2) return false;
    return legendChance(view, p, handLoss + 1) < legendNeed(view);
}
/** The odds a bot wants: lower when the solo movement deck runs out. */
function legendNeed(view) {
    const L = view.legend;
    if (view.solo && L) return L.moveDeck <= 1 ? 0 : L.moveDeck <= 3 ? 0.3 : 0.55;
    return 0.55;
}

// ---------------------------------------------------------------------------------------------
// Fight readiness. In a monster fight the witcher is knocked out when hand and deck are empty,
// so «hand + deck» is the life of the witcher: bot games show ~10–25% wins at 8–12 cards, ~50%
// at 15–16 and 85%+ from 20. A track token (first turn) is worth about 3 cards.
// ---------------------------------------------------------------------------------------------
const FIGHT_NOW = 0.6;
export function winChance(view, p, slot, handLoss = 0) {
    const mon = MONSTER[slot.mon];
    let hp = Math.max(0, p.hand.length - handLoss) + (p.deckCount || 0);
    if (p.trackTokens[slot.terrain] || (slot.mon === 'DAGON' && p.skToken)) hp += 3;
    // «Чародеи»: the mage's «щит» is energy — it pays for damage and extras, it does not absorb
    // hits. Fitted on ~1100 bot fights of mages (it13) to the scale of the witchers' estimate: the
    // level gap decides (a mage's level grows with its four skills, its deck — with the level),
    // the energy at the start barely matters, and the same cards are worth less than a witcher's.
    if (isMage(p)) hp += p.shield * 0.25 + (p.level - mon.level) * 6 - 3;
    else hp += p.shield + (p.skills.combat - 1) * 0.5 + (p.level - mon.level) * 0.75;
    return 1 / (1 + Math.exp(-(hp - 15) / 2));
}
/** Can this monster be attacked at all (solo lock on the last monster, Архиспора)? */
function fightable(view, p, slot) {
    if (slot.mon === 'MON-06' && !p.elixirs.length) return false;
    if (view.solo && view.slots.filter(s => s.mon).length === 1 && p.monstersDefeated === 2 && !p.trophies.some(x => x.kind === 'skill')) return false;
    return true;
}

// ---------------------------------------------------------------------------------------------
// Witcher fight (pp. 20–23): only clearly stronger than the opponent in cards and shield.
// ---------------------------------------------------------------------------------------------
const power = (q, handLoss = 0) => Math.max(0, (q.hand ? q.hand.length : q.handCount) - handLoss) + q.deckCount + q.shield * 2;
/** A witcher worth attacking: clearly weaker, and beating them still gives a trophy. */
const duelWorth = (view, p, q, handLoss = 0) => !view.solo && q.seat !== p.seat && !hasWitcherTrophy(p, q.school)
    && p.hand.length - handLoss >= 3 && power(p, handLoss) >= 12 && power(p, handLoss) >= power(q) + 2;
const SCHOOL_HOMES = new Set(Object.values(SCHOOLS).map(s => s.home));
function duelTarget(view, p, o) {
    const c = o.phase2.filter(x => x.id.startsWith('duel-') && !x.err).map(x => view.players[x.seat])
        .filter(q => duelWorth(view, p, q)).sort((a, b) => power(a) - power(b))[0];
    return c ? c.seat : null;
}

// ---------------------------------------------------------------------------------------------
// Location actions
// ---------------------------------------------------------------------------------------------
/** The skill the bot trains: the solo skill trophy first, then the one that raises the level. */
function trainOrder(view, p) {
    const soloSkill = view.solo && view.skillTrophies.length ? SKILL_OF[view.skillTrophies[0].split('#')[0]] : null;
    return ['combat', 'defense', 'alchemy', 'spec'].slice().sort((a, b) =>
        (b === soloSkill) - (a === soloSkill) || p.skills[a] - p.skills[b] || (b === 'combat') - (a === 'combat'));
}
const SKILL_OF = { 'SKILL-COMBAT': 'combat', 'SKILL-DEFENSE': 'defense', 'SKILL-ALCHEMY': 'alchemy', 'SKILL-SPEC': 'spec' };
function locActionCommand(view, p, info) {
    switch (info.kind) {
        case 'school': {
            const ok = info.choices.filter(x => !x.err);
            for (const s of trainOrder(view, p)) {
                const c = ok.find(x => x.id === s);
                if (c && p.gold - c.cost >= 0) return { t: 'loc', skill: c.id };
            }
            return null;
        }
        case 'hunt': {
            const c = info.choices.find(x => !x.err);
            return { t: 'loc', slot: c ? c.id : undefined };
        }
        case 'swap': case 'poor': return null;
        default: return { t: 'loc' };
    }
}
/** What doing the action of location `n` is worth to the bot now (0 = useless). */
function actionValue(view, p, n) {
    const a = LOC_ACTIONS[n];
    if (!a) return 0;
    const t = view.turn;
    if (t.usedLoc.includes(n)) return 0;
    if (view.legend && view.legend.loc === n) return 0;   // the legendary monster blocks the action
    switch (a.kind) {
        case 'raise': return p.skills[a.skill] < 5 && p.skills[a.skill] <= p.level ? 6 + (p.skills[a.skill] === p.level ? 2 : 0) : 0;
        case 'school': {
            const home = homeOf(p) === n;
            let best = 0;
            for (const s of trainOrder(view, p)) {
                if (p.skills[s] >= 5 || (s === 'spec' && !home)) continue;
                if (trainCost(p, s) <= p.gold) best = Math.max(best, 5 + (p.skills[s] === p.level ? 2 : 0));
            }
            return best;
        }
        case 'elixir': return p.elixirs.length < ELIXIR_LIMIT ? 2.5 : 0;
        case 'poker': return p.gold >= 1 ? (view.solo ? 1.5 : 2) : 0;
        // «Скеллиге» islands.
        case 'skAnySkill': return ['combat', 'defense', 'alchemy', 'spec'].some(s => p.skills[s] < 5) ? 6 : 0;
        case 'skMist': return 2;
        case 'skEyna': return 4;
        case 'skHenInis': return 4;
        case 'skGold3': return 3;
        case 'skElixir4': return p.elixirs.length < 3 ? 3 : 0;
        case 'skTracks': return 2;
        case 'hunt': return view.slots.some(s => s.mon && !p.trackTokens[s.terrain] && !p.hunts.some(h => h.terrain === s.terrain)) ? 3 : 0;
        default: return 0;
    }
}

// ---------------------------------------------------------------------------------------------
// Route planning
// ---------------------------------------------------------------------------------------------
const enterable = (view, n) => !!LOC[n] && (!LOC[n].island || !!view.skellige) && (!LOC[n].dagon || dagonLocOpen(view));
/** «Скеллиге»: who waits in the Dagon location — Dagon himself or the siren (Набор монстров). */
const seaFoe = (view) => (dagonUp(view) ? 'DAGON' : view.sk && view.sk.siren ? 'MON-31' : null);
/** Shortest path lengths from `from` over the land and sea routes (BFS); `rev` — towards `from`
 *  («Скеллиге»: the ship routes are one-way at a given moment). */
export function distances(view, from, rev = false) {
    const d = { [from]: 0 }, q = [from];
    while (q.length) {
        const x = q.shift();
        for (const y of [...(ADJ[x] || []), ...seaEdges(view, x, rev)]) if (d[y] == null && enterable(view, y)) { d[y] = d[x] + 1; q.push(y); }
    }
    return d;
}
/** How many moves the hand can still pay for — one card per move, roughly. */
const movesLeft = (p) => p.hand.length;

/** Goal value of every location for this turn, given the distance to it. */
function goalValue(view, p, n, d, reach) {
    let v = 0;
    const slot = view.slots.find(s => s.mon && s.token === n);
    if (slot && fightable(view, p, slot)) {
        // Cards spent on the way are cards missing in the fight; a far monster is a plan for later turns.
        const wc = reach ? winChance(view, p, slot, d) : winChance(view, p, slot, 0) * 0.7;
        v += 16 * wc * (wc >= 0.45 ? 1 : 0.5) * soloLegendRush(view, p);
    }
    // «Скеллиге»: the siren (trophy and 2 gold, no exhaustion) or Dagon (gold, a card and a gift).
    // Sailing there starts the fight at once, so only a good chance makes it a goal.
    if (LOC[n] && LOC[n].dagon && seaFoe(view)) {
        const foe = seaFoe(view);
        const wc = winChance(view, p, { mon: foe, terrain: 'joker' }, reach ? d : 0) * (reach ? 1 : 0.7);
        v += (foe === 'DAGON' ? 12 : 13) * wc * (wc >= 0.55 ? 1 : 0.2);
    }
    if (p.hunts.some(h => h.loc === n)) v += 6;
    // A weaker witcher there: a witcher trophy within reach (no fights in school locations, p. 20).
    if (reach && !SCHOOL_HOMES.has(n) && view.closedTavern !== n && view.players.some(q => q.loc === n && duelWorth(view, p, q, d))) v += 9;
    if ((p.quests || []).some(q => q.loc === n)) v += 5;
    v += actionValue(view, p, n);
    // «Легендарная охота»: the legendary monster (the game's goal) and ruin tokens (bonus + easier fight).
    if (view.legend) {
        if (view.legend.loc === n) {
            const wc = legendChance(view, p, reach ? d : 0);
            v += 24 * wc * (wc >= legendNeed(view) ? 1 : 0.3);
            // Solo: the movement deck is the clock — the last turns go to the monster whatever the odds.
            if (view.solo && view.legend.moveDeck <= 2) v += 30;
            // Not ready yet: chasing it from there is a ruin token for one card.
            else if (reach && chaseWorth(view, p, n, d)) v += view.solo ? 9 : 5;
        }
        if (reach && view.legend.ruins.includes(n)) v += view.solo ? 6 : 3.5;
    }
    return v;
}
function planStep(view, p, o) {
    const t = view.turn;
    const dist = distances(view, p.loc);
    const budget = movesLeft(p);
    let best = null;
    for (const key of Object.keys(dist)) {
        const n = Number(key);
        let d = dist[n];
        // The starting location's action needs leaving and coming back.
        if (n === p.loc) { if (t.moved) continue; d = 2; }
        const reach = d <= budget;
        const v = goalValue(view, p, n, d, reach);
        if (v <= 0) continue;
        const score = reach ? v - 1.2 * d : v * 0.6 - 1.2 * d;
        if (!best || score > best.score) best = { n, d, score, reach };
    }
    // Staying is worth something too: the value of the current place for phase II.
    const stay = (() => {
        const slot = view.slots.find(s => s.mon && s.token === p.loc);
        const leg = view.legend && view.legend.loc === p.loc ? 24 * legendChance(view, p) * (legendChance(view, p) >= legendNeed(view) ? 1 : 0.3) : 0;
        // A ruin token here is taken at the end of phase I (e.g. just left by «Прогнать»).
        const ruin = view.legend && view.legend.ruins.includes(p.loc) ? 3.5 : 0;
        return Math.max(leg, slot && fightable(view, p, slot) ? 16 * winChance(view, p, slot) : 0) + ruin;
    })();
    if (!best || best.score <= Math.max(1, stay)) return null;
    // A far goal: spend only the cards above 3 (phase III draws back up to 3 anyway).
    if (!best.reach && p.hand.length <= 1) return null;
    const goalDist = best.n === p.loc ? null : distances(view, best.n, true);
    const steps = o.moves.filter(m => m.via == null).map(m => {
        const pay = cheapestPayment(view, p, m.to);
        if (!pay) return null;
        const left = goalDist ? goalDist[m.to] : 1;
        if (left == null || left !== best.d - 1 && !(best.n === p.loc)) return null;
        const terrainPay = pay.cards.length === 1 && !pay.gold ? 0 : 1;
        return { m, pay, s: terrainPay + R() * 0.1 };
    }).filter(Boolean).sort((a, b) => a.s - b.s);
    const st = steps[0];
    if (!st) return null;
    return { t: 'move', to: st.m.to, cards: st.pay.cards, gold: st.pay.gold };
}

export function cheapestPayment(view, p, to) {
    const byVal = p.hand.slice().sort((a, b) => cardValue(a) - cardValue(b));
    for (const id of byVal) if (!movePaymentError(view, p, to, [id], 0)) {
        if (p.hand.length > 2 || cardValue(id) < 6) return { cards: [id], gold: 0 };
    }
    if (p.gold >= 2 && byVal.length >= 1) return { cards: [byVal[0]], gold: 1 };
    if (byVal.length >= 4) return { cards: [byVal[0], byVal[1]], gold: 0 };
    for (const id of byVal) if (!movePaymentError(view, p, to, [id], 0)) return { cards: [id], gold: 0 };
    return null;
}

function answerPrompt(view, p, pr) {
    if (pr.kind === 'dice') {
        const dice = view.poker ? (pr.side === 'b' ? view.poker.b : view.poker.a) : [1, 2, 3, 4, 5];
        return { t: 'answer', ids: autoReroll(dice) };
    }
    if (pr.kind === 'choice') {
        const okOpts = pr.options.filter(o => !o.disabled);
        if (pr.ui === 'row') {
            const best = okOpts.map(o => ({ o, v: buyValue(view, p, (view.mrow && isMage(p) ? view.mrow : view.row)[Number(o.id)], o) })).sort((a, b) => b.v - a.v)[0];
            return { t: 'answer', choice: best.o.id };
        }
        return { t: 'answer', choice: okOpts[Math.floor(R() * okOpts.length)].id };
    }
    // Шептуха's special attack: exactly 3 linked cards.
    if (pr.ui === 'combo' && pr.min > 1) { const ch = findChain(pr.ids, pr.min); if (ch) return { t: 'answer', ids: ch }; }
    // Event combo outside a fight: the hardest-hitting single card is always a legal chain.
    if (pr.ui === 'combo') return { t: 'answer', ids: pr.ids.slice().sort((a, b) => (CARDS[b].fx.dmg || 0) - (CARDS[a].fx.dmg || 0)).slice(0, 1) };
    // House rule: buy back drunk elixirs while keeping 2 gold for training/movement.
    if (pr.ui === 'elixirReturn') return { t: 'answer', ids: pr.ids.slice(0, Math.max(0, Math.min(pr.max, p.gold - 2))) };
    if (pr.ui === 'bombReturn') return { t: 'answer', ids: pr.ids.slice(0, Math.max(0, Math.min(pr.max, Math.floor((p.gold - 2) / 2)))) };
    // Vulnerability tokens: take the best card offered; pay with the weakest card while the hand is
    // big enough (4+); elixirs and the rest only when the prompt requires them.
    if (pr.vt) {
        const best = pr.ids.slice().sort((a, b) => value(b) - value(a)), worst = best.slice().reverse();
        if (['fetch', 'take', 'tutor2', 'row2', 'elixirPick'].includes(pr.vt)) return { t: 'answer', ids: best.slice(0, Math.max(pr.min, 1)).slice(0, pr.max) };
        if (pr.vt === 'pay' && pr.from !== 'elixirs' && p.hand.length >= 4 && CARDS[pr.ids[0]]) return { t: 'answer', ids: worst.slice(0, Math.max(pr.min, 1)) };
        if (pr.ordered) return { t: 'answer', ids: pr.ids.slice() };
    }
    // Трофей «Сирена»: the cost in cards — or 1 water card.
    if (pr.waterAlt) {
        const w = pr.ids.filter(id => CARDS[id].terrain === 'water').sort((a, b) => value(a) - value(b))[0];
        return { t: 'answer', ids: w ? [w] : pr.ids.slice().sort((a, b) => value(a) - value(b)).slice(0, pr.max) };
    }
    // cards: discard/remove -> weakest; take -> strongest
    const takeLike = ['deckTop', 'discard', 'row', 'elixirs'].includes(pr.from) && !/Сброс|сбрось|убер/i.test(pr.text || '');
    const sorted = pr.ids.slice().sort((a, b) => takeLike ? value(b) - value(a) : value(a) - value(b));
    const n = pr.min;
    return { t: 'answer', ids: sorted.slice(0, n) };
}
const value = (id) => CARDS[id] ? cardValue(id) : 0;

// ---------------------------------------------------------------------------------------------
// Phase III: a card is worth its own effect plus how well it chains with the deck — links from
// the deck's colours into it and from it into the deck's colours — minus the cards paid for it
// (each paid card is one card less in the next turn).
// ---------------------------------------------------------------------------------------------
const linkFx = (fx) => (fx.dmg || 0) * 3 + (fx.shield || 0) * 2 + (fx.draw || 0) + (fx.top ? 2 : 0) + (fx.ret ? 2 : 0) + (fx.dice ? 4 : 0) + 1;
/** Cards the bot knows it owns: hand, discard and the starting deck of its school. */
function knownDeck(view, p) {
    const own = [...p.hand, ...p.discard];
    if (own.length < 8) for (const c of Object.values(CARDS)) if (c.starter && c.school === p.school) own.push(c.id);
    return own.filter(id => CARDS[id]);
}
export function deckFit(view, p, id) {
    const c = CARDS[id];
    if (!c || c.burn) return 0;
    const own = knownDeck(view, p);
    if (!own.length) return 0;
    const share = (col) => own.filter(x => CARDS[x].color === col || CARDS[x].any).length / own.length;
    let fit = 0;
    for (const l of c.links) fit += linkFx(l.fx) * (c.any ? 1 : share(l.color));
    for (const x of own) for (const l of CARDS[x].links) if (c.any || l.color === c.color) fit += linkFx(l.fx) / own.length;
    return fit;
}
export function buyValue(view, p, id, opt) {
    const c = CARDS[id];
    if (!c) return -Infinity;
    // «Убрать карту из игры»: thinning the deck of a weak starter is worth a little.
    const pay = opt.burn ? 1.5 : Math.max(0, opt.cost || 0) * 2.5;
    return cardValue(id) + deckFit(view, p, id) * 1.5 - pay;
}
