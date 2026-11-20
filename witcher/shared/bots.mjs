// Bots see exactly the per-seat view a human gets and act through the same apply().
// botCommand(view, opts) returns one command or null. Kept deliberately simple and legal;
// difficulty levels and personalities come with the bots milestone.
import { CARDS, LOC, ADJ, MONSTER } from './engine/util.mjs';
import { autoReroll } from './engine/turn.mjs';
import { linkIndex, comboTotals, comboError, elixirError } from './engine/fight.mjs';
import { movePaymentError } from './engine/turn.mjs';

export const cardValue = (id) => {
    const c = CARDS[id];
    if (!c) return 0;
    const f = c.fx;
    return (f.dmg || 0) * 3 + (f.shield || 0) * 2 + (f.draw || 0) + (f.top ? 2 : 0) + c.links.length * 1.5 + c.cost;
};

/** Best combo by DFS over the hand (at most ~7 cards, cheap). With Цири's «Старшая Кровь»
 *  available, one link of the chain may be the any-colour blood link: returns { ids, blood }. */
export function bestCombo(view, p, useBlood = false) {
    const hand = p.hand;
    const f = view.fight;
    const forced = f.cur && f.cur.forcedFirst && hand.includes(f.cur.forcedFirst) ? f.cur.forcedFirst : null;
    let best = { ids: hand.length ? [forced || hand[0]] : [], blood: null, score: -1 };
    const score = (ids, blood) => {
        const t = comboTotals(view, p, ids, { blood });
        // Blood is once per fight: only spend it for a real gain.
        return t.dmg * 3 + Math.min(t.shield, 4 - p.shield) * 2 + t.draw * 1.2 + t.top + t.ret.length * 2 - (blood != null ? 2.5 : 0);
    };
    const dfs = (chain, rest, blood) => {
        if (chain.length) {
            if (forced && chain[0] !== forced) return;
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
        if (opts.options && opts.options.fight && !opts.options.fight.spec) return { t: 'spec' };
        // Equipment / companions: free damage at once, «discard 1 → 2 damage» with a full hand.
        const act = (opts.options && opts.options.fight && opts.options.fight.active || []).filter(a => !a.err);
        const gear = act.find(a => a.key === 'CONT79-14' || a.key === 'CONT79-20' || a.key === 'CONT79-56'
            || ((a.key === 'CONT79-15' || a.key === 'CONT79-01') && p.hand.length >= 3));
        if (gear) return { t: 'active', key: gear.key };
        const canBlood = !!(opts.options && opts.options.fight && opts.options.fight.blood === null);
        const best = bestCombo(view, p, canBlood);
        const ids = canBlood ? best.ids : best, blood = canBlood ? best.blood : null;
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
        if (o.loc && !o.loc.err && o.loc.kind !== 'swap' && o.loc.kind !== 'poor') {
            if (o.loc.kind === 'school') { const c = o.loc.choices.find(x => !x.err); if (c) return { t: 'loc', skill: c.id }; }
            else if (o.loc.kind === 'hunt') { const c = o.loc.choices.find(x => !x.err); return { t: 'loc', slot: c ? c.id : undefined }; }
            else return { t: 'loc' };
        }
        return { t: 'endExplore' };
    }
    const here = view.slots.find(s => s.mon && s.token === p.loc);
    const fightOpt = o.phase2.find(x => x.id === 'fight');
    const strong = p.hand.length >= 3 || (here && p.trackTokens[here.terrain]);
    if (t.moved && o.loc && !o.loc.err) {
        if (o.loc.kind === 'school') {
            const c = o.loc.choices.filter(x => !x.err).sort((a, b) => a.cost - b.cost)[0];
            if (c && p.gold - c.cost >= 1) return { t: 'loc', skill: c.id };
        } else if (o.loc.kind === 'hunt') {
            const c = o.loc.choices.find(x => !x.err);
            return { t: 'loc', slot: c ? c.id : undefined };
        } else if (o.loc.kind !== 'swap' && o.loc.kind !== 'poor') return { t: 'loc' };
    }
    if (fightOpt && !fightOpt.err && strong && (t.moved || !o.moves.length)) return { t: 'fight' };
    if (!t.moved && o.moves.length) {
        // Move: prefer a monster we can fight, then an action we can use; pay as cheaply as possible.
        const targets = o.moves.map(m => {
            let s = R();
            if (view.slots.some(sl => sl.mon && sl.token === m.to)) s += p.hand.length >= 4 ? 5 : 1;
            if (p.hunts.some(h => h.loc === m.to)) s += 4;
            if ((p.quests || []).some(q => q.loc === m.to)) s += 3;
            return { ...m, s };
        }).sort((a, b) => b.s - a.s);
        for (const m of targets) {
            const pay = cheapestPayment(view, p, m.to);
            if (pay) return { t: 'move', to: m.to, cards: pay.cards, gold: pay.gold };
        }
    }
    if (fightOpt && !fightOpt.err && p.hand.length >= 2) return { t: 'fight' };
    const med = o.phase2.find(x => x.id === 'meditate');
    if (med && !med.err) return { t: 'meditate', trophy: med.trophies[0] };
    const ex = o.phase2.filter(x => x.id.startsWith('explore-') && !x.err);
    if (ex.length) return { t: 'explore', deck: ex[Math.floor(R() * ex.length)].id === 'explore-city' ? 'city' : 'wild' };
    if (fightOpt && !fightOpt.err) return { t: 'fight' };
    const skip = o.phase2.find(x => x.id === 'skipPhase2' && !x.err);
    if (skip) return { t: 'skipPhase2' };
    return null;
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
        const dice = view.poker ? view.poker.a : [1, 2, 3, 4, 5];
        return { t: 'answer', ids: autoReroll(dice) };
    }
    if (pr.kind === 'choice') {
        const okOpts = pr.options.filter(o => !o.disabled);
        if (pr.ui === 'row') {
            const best = okOpts.map(o => ({ o, v: cardValue(view.row[Number(o.id)]) })).sort((a, b) => b.v - a.v)[0];
            return { t: 'answer', choice: best.o.id };
        }
        return { t: 'answer', choice: okOpts[Math.floor(R() * okOpts.length)].id };
    }
    // Event combo outside a fight: the hardest-hitting single card is always a legal chain.
    if (pr.ui === 'combo') return { t: 'answer', ids: pr.ids.slice().sort((a, b) => (CARDS[b].fx.dmg || 0) - (CARDS[a].fx.dmg || 0)).slice(0, 1) };
    // House rule: buy back drunk elixirs while keeping 2 gold for training/movement.
    if (pr.ui === 'elixirReturn') return { t: 'answer', ids: pr.ids.slice(0, Math.max(0, Math.min(pr.max, p.gold - 2))) };
    // cards: discard/remove -> weakest; take -> strongest
    const takeLike = ['deckTop', 'discard', 'row', 'elixirs'].includes(pr.from) && !/Сброс|сбрось|убер/i.test(pr.text || '');
    const sorted = pr.ids.slice().sort((a, b) => takeLike ? value(b) - value(a) : value(a) - value(b));
    const n = pr.min;
    return { t: 'answer', ids: sorted.slice(0, n) };
}
const value = (id) => CARDS[id] ? cardValue(id) : 0;
