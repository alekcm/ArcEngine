// Битва ведьмаков (База.md pp. 20–22, 27–28): the active player attacks another witcher in the
// same location. Both form their life pools, the attacker moves first, then the witchers take turns.
// Damage goes to the shield, then the top of the deck, then the hand (the defender chooses).
//
// The witcher fight turn of fight.mjs is reused: `f.seat` is the witcher whose turn it is, the
// per-witcher fight bookkeeping (once-per-fight flags, elixirs used, turn counter …) of the other
// one waits in `f.sides[seat]` and is swapped in at the change of turn (`sideSwap`).
import { STEPS, push, ask } from './flow.mjs';
import { CARDS, LOC, log, fx, shuffle, maxShield, drawCards, removeFrom, randInt } from './util.mjs';
import { SCHOOLS, TRACK_GOLD, wtrophyCards } from '../data/rules-data.mjs';
import { hasWitcherTrophy, hasTrophy, hasGear } from './effects.mjs';
import { skAfterBattle } from './skellige.mjs';

const F = (op, args) => ({ op, fight: 1, ...(args || {}) });
export const SIDE_KEYS = ['once', 'elixirsUsed', 'usedElixirs', 'usedBombs', 'wTurns', 'lastCombo', 'cur', 'nextW', 'pendingHarpy', 'noAbility'];
const freshSide = () => ({ once: {}, elixirsUsed: 0, usedElixirs: [], usedBombs: [], wTurns: 0, lastCombo: null, cur: null, nextW: null, pendingHarpy: false, noAbility: false });

export const isDuel = (state) => !!(state.fight && state.fight.kind === 'duel');
/** The other participant of a witcher fight. */
export const otherSeat = (f, seat = f.seat) => (seat === f.att ? f.def : f.att);
/** Once-per-fight flags of a participant (the one not on turn keeps them in `f.sides`). */
export function onceOf(f, seat) {
    if (!f) return {};
    if (f.kind !== 'duel' || seat === f.seat) return f.once;
    return f.sides[seat] ? f.sides[seat].once : f.once;
}
/** Make `to` the witcher on turn. */
export function sideSwap(state, to) {
    const f = state.fight;
    if (f.seat === to) return;
    const mine = {};
    for (const k of SIDE_KEYS) mine[k] = f[k];
    f.sides[f.seat] = mine;
    Object.assign(f, f.sides[to]);
    delete f.sides[to];
    f.seat = to;
}
/** Locations of every school on the board («нельзя сражаться в локации любой школы»). */
const SCHOOL_LOCS = new Set(Object.values(SCHOOLS).map(s => s.home));

/** Why `p` can't attack the witcher at `target` (null if it can). */
export function duelError(state, p, target) {
    const q = state.players[target];
    if (!q || q === p) return 'Нет такого ведьмака';
    if (state.solo) return 'В одиночной игре нет других ведьмаков';
    if (q.loc !== p.loc) return `${q.name} не в вашей локации`;
    if (SCHOOL_LOCS.has(p.loc)) return 'В локации школы сражаться нельзя';
    if (state.closedTavern === p.loc) return 'Здесь закрытая корчма: ведьмаки не дерутся';
    const t = state.turn;
    if (t && (t.pokered || []).includes(target)) return `Вы играли с ${q.name} в покер в этом ходу`;
    return null;
}

STEPS.duelStart = (state, step) => {
    const a = state.players[step.seat], d = state.players[step.target];
    state.turn.phase = 2;
    state.fight = {
        kind: 'duel', seat: a.seat, att: a.seat, def: d.seat, loc: a.loc, sides: { [d.seat]: freshSide() },
        mon: null, slot: null, level: 0, terrain: null, controller: null, chooser: null, life: [], monDiscard: [], turn: null,
        mTurns: 0, lastAttack: null, stage: 'busy', over: null, track: false, pendingHarpy: false,
        vuln: false, dice: 0, nextM: null, mCur: null, whole: {}, bets: [], oppDeckLoss: 0,
        ...freshSide(),
    };
    log(state, `${a.name} нападает на ведьмака: ${d.name} (${LOC[a.loc].name})`, { kind: 'fight' });
    fx(state, { k: 'fightStart', seat: a.seat, vs: d.seat });
    // Bets (p. 21): every player not in the fight may put 1 gold on one of the two; not with 2 players.
    const bettors = state.players.length > 2 ? state.players.filter(p => p.seat !== a.seat && p.seat !== d.seat && p.gold >= 1).map(p => F('duelBetAsk', { seat: p.seat })) : [];
    // «Перед тем как будут сформированы запасы жизней» / «после того как…» (bombs, trophies, companions)
    // work for each of the two: first for the attacker, then for the defender.
    const S = (to) => F('duelSide', { to });
    push(state, ...bettors,
        S(a.seat), F('mushroomAsk'), F('preLife'), S(d.seat), F('mushroomAsk'), F('preLife'),
        S(a.seat), F('duelLife'), F('postLife'), S(d.seat), F('postLife'),
        S(a.seat), F('duelOscar'), F('witcherTurn'));
};
STEPS.duelSide = (state, step) => { if (state.fight && !state.fight.over) sideSwap(state, step.to); };

STEPS.duelBetAsk = (state, step) => {
    const f = state.fight, p = state.players[step.seat];
    if (p.gold < 1) return;
    const a = state.players[f.att], d = state.players[f.def];
    if (p.bot || p.away) {
        // Bots: a bet on the one with more cards and shield, now and then.
        if (randInt(state, 3) === 0) return;
        const power = (q) => q.hand.length + q.deck.length + q.discard.length + q.shield * 2;
        push(state, F('duelBetDo', { seat: p.seat, choice: power(a) >= power(d) ? 'att' : 'def' }));
        return;
    }
    ask(state, {
        seat: p.seat, kind: 'choice', title: 'Ставка на битву ведьмаков',
        text: `${a.name} нападает на ${d.name}. Можно поставить 1 золото на исход: при победе вашего ведьмака золото вернётся, и вы получите столько же, сколько победитель (по репутации побеждённого).`,
        options: [{ id: 'att', label: `На нападающего: ${a.name}` }, { id: 'def', label: `На защищающегося: ${d.name}` }, { id: 'skip', label: 'Не ставить' }],
        op: 'duelBetDo', args: { fight: 1, seat: p.seat },
    });
};
STEPS.duelBetDo = (state, step) => {
    if (step.choice !== 'att' && step.choice !== 'def') return;
    const f = state.fight, p = state.players[step.seat];
    if (p.gold < 1) return;
    p.gold -= 1;
    f.bets.push({ seat: p.seat, on: step.choice });
    log(state, `${p.name} ставит 1 золото на ${state.players[step.choice === 'att' ? f.att : f.def].name}`);
};

STEPS.duelLife = (state) => {
    const f = state.fight;
    const a = state.players[f.att], d = state.players[f.def];
    for (const p of [a, d]) { p.deck.push(...p.discard.splice(0)); shuffle(state, p.deck); }
    log(state, `Запасы жизней: ${a.name} — ${a.deck.length + a.hand.length} карт, ${d.name} — ${d.deck.length + d.hand.length}`);
    log(state, `${a.name} нападает и ходит первым`);
    fx(state, { k: 'lifeFormed', seat: a.seat });
    fx(state, { k: 'lifeFormed', seat: d.seat });
};

/** Оскар (CONT79-18): before the opponent's first fight turn — 2 top cards of its deck, 1 to its discard. */
STEPS.duelOscar = (state) => {
    const f = state.fight;
    if (!f || f.over || f.wTurns !== 0) return;
    const owner = state.players[otherSeat(f)], vs = state.players[f.seat];
    const once = onceOf(f, owner.seat);
    if (!hasGear(owner, 'CONT79-18') || once.g18 || !vs.deck.length) return;
    once.g18 = true;
    const top = vs.deck.slice(0, 2);
    log(state, `${owner.name}: Оскар смотрит ${top.length} верхние карты колоды ${vs.name}`);
    if (top.length === 1 || owner.bot || owner.away) { push(state, F('duelOscarDo', { vs: vs.seat, ids: [top.length === 1 ? top[0] : bestOf(top)] })); return; }
    ask(state, { seat: owner.seat, kind: 'cards', from: 'oppDeck', ids: top, min: 1, max: 1, title: 'Оскар', text: `Положите одну из карт в сброс ${vs.name} — другая останется на верху его колоды.`, op: 'duelOscarDo', args: { fight: 1, vs: vs.seat } });
};
STEPS.duelOscarDo = (state, step) => {
    const vs = state.players[step.vs];
    if (!removeFrom(vs.deck, step.ids[0])) return;
    vs.discard.push(step.ids[0]);
    log(state, `Оскар: «${CARDS[step.ids[0]].name}» — в сброс ${vs.name}`);
    if (!vs.deck.length && !vs.hand.length) duelKo(state, vs.seat);
};
const bestOf = (ids) => ids.slice().sort((x, y) => worth(y) - worth(x))[0];
const worth = (id) => { const c = CARDS[id]; return (c.fx.dmg || 0) * 3 + (c.fx.shield || 0) * 2 + (c.fx.draw || 0) + c.links.length; };

/** End of a witcher's fight turn in a witcher fight: the other one moves next. */
STEPS.duelNext = (state) => {
    const f = state.fight;
    if (!f || f.over) return;
    const q = state.players[otherSeat(f)];
    // Трофей «Туманник»: lost deck cards in the opponent's turn because of its attack → +1 card.
    if (f.oppDeckLoss && hasTrophy(q, 'MON-04') && q.deck.length) { drawCards(state, q, 1); log(state, `${q.name}: трофей «Туманник» — +1 карта`); }
    f.oppDeckLoss = 0;
    sideSwap(state, q.seat);
    push(state, F('duelOscar'), F('witcherTurn'));
};

/** `loser` has no cards in the deck and the hand: the fight is over. */
export function duelKo(state, loser) {
    const f = state.fight;
    if (!f || f.over) return;
    f.loser = loser;
    f.over = 'ko';
    f.stage = 'busy';
    state.queue = state.queue.filter(s => !s.fight);
    if (state.prompt && state.prompt.args && state.prompt.args.fight) state.prompt = null;
    log(state, `${state.players[loser].name} теряет сознание`, { kind: 'fight' });
    push(state, { op: 'duelConsequences' });
}

// Consequences (pp. 27–28) and the end of the fight.
STEPS.duelConsequences = (state) => {
    const f = state.fight;
    const a = state.players[f.att], d = state.players[f.def];
    const attWon = f.loser === d.seat;
    const winner = attWon ? a : d, loser = attWon ? d : a;
    const gold = TRACK_GOLD[Math.min(loser.track, TRACK_GOLD.length - 1)];
    winner.gold += gold;
    f.result = attWon ? 'win' : 'lose';
    f.winner = winner.seat;
    const steps = [];
    if (attWon) {
        log(state, `${a.name} побеждает ${d.name}: +${gold} золото`, { kind: 'victory' });
        if (!hasWitcherTrophy(a, d.school)) {
            // The card comes from under the defender's board (one per opponent at setup).
            d.witcherTrophies = Math.max(0, (d.witcherTrophies || 0) - 1);
            steps.push({ op: 'gainTrophy', seat: a.seat, kind: 'witcher', id: d.school, card: freeTrophyCard(state, d.school) });
        }
        else log(state, `${a.name}: трофей ${SCHOOLS[d.school].name === 'Цири' ? 'Цири' : 'школы ' + SCHOOLS[d.school].name} уже есть — второй не берётся`);
        steps.push({ op: 'takeZeroCard', seat: d.seat });
    } else {
        log(state, `${d.name} отбивается от ${a.name}: +${gold} золото, 4 карты; у ${a.name} в фазу III −1 карта`, { kind: 'defeat' });
        state.turn.drawDelta -= 1;
        steps.push({ op: 'takeZeroCard', seat: a.seat });
    }
    // Тайные события «…закончит битву, в которой он использовал хотя бы 1 эликсир».
    for (const p of [a, d]) if ((p.seat === f.seat ? f.usedElixirs : (f.sides[p.seat] || {}).usedElixirs || []).length) steps.push({ op: 'trapCheck', seat: p.seat, on: 'fightEnd' });
    for (const b of f.bets) {
        const p = state.players[b.seat];
        const right = (b.on === 'att') === attWon;
        if (right) { p.gold += 1 + gold; log(state, `${p.name}: ставка сыграла — +${gold} золото (и 1 назад)`); }
        else log(state, `${p.name}: ставка проиграна`);
    }
    // Закрытая корчма: no witcher fights here until the next one elsewhere.
    state.closedTavern = f.loc;
    log(state, `Корчма в локации ${LOC[f.loc].name} закрыта для битв ведьмаков`);
    fx(state, { k: 'fightEnd', seat: a.seat, vs: d.seat, result: f.result, winner: winner.seat });
    steps.push({ op: 'duelCleanup' }, { op: 'phase3' });
    push(state, ...steps);
};
/** One of the 4 trophy cards of the school that nobody holds yet. */
function freeTrophyCard(state, school) {
    const taken = new Set(state.players.flatMap(p => p.trophies.filter(t => t.kind === 'witcher').map(t => t.card)));
    return wtrophyCards(school).find(c => !taken.has(c)) || wtrophyCards(school)[0];
}
STEPS.duelCleanup = (state) => {
    const f = state.fight;
    if (!f) return;
    sideSwap(state, f.att);
    const sides = { [f.att]: { usedElixirs: f.usedElixirs, usedBombs: f.usedBombs }, [f.def]: f.sides[f.def] };
    const a = state.players[f.att], d = state.players[f.def];
    state.lastFight = { kind: 'duel', vs: d.seat, seat: a.seat, result: f.result, winner: f.winner };
    state.fight = null;
    // «Скеллиге»: Dagon's gifts of both witchers.
    skAfterBattle(state, [a.seat, d.seat]);
    const back = [];
    for (const p of [a, d]) {
        const s = sides[p.seat];
        p.shield = maxShield(state, p);
        state.elixirDiscard.push(...s.usedElixirs);
        if (s.usedBombs.length) { if (!state.bombDiscard) state.bombDiscard = []; state.bombDiscard.push(...s.usedBombs); }
        p.deck = shuffle(state, [...p.deck, ...p.discard.splice(0), ...p.hand.splice(0)]);
        if (state.rules && state.rules.elixirReturn && s.usedElixirs.length && p.gold > 0) back.push({ op: 'elixirReturnAsk', seat: p.seat, ids: s.usedElixirs.slice() });
        if (state.rules && state.rules.bombs && s.usedBombs.length && p.gold >= 2) back.push({ op: 'bombReturnAsk', seat: p.seat, ids: s.usedBombs.slice() });
    }
    log(state, `${a.name} и ${d.name}: щит восстановлен, все карты перемешаны в колоду`);
    // The defender draws at once: 4 after a win, 3 after a defeat; the attacker draws in phase III.
    const n = f.winner === d.seat ? 4 : 3;
    const g = drawCards(state, d, n);
    log(state, `${d.name} берёт ${g} карт(ы)`);
    if (back.length) push(state, ...back);
};
