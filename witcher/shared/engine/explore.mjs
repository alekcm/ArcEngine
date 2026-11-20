// Exploration, quests and event cards (База.md pp. 16–17) — SLICE: the decks hold the cards
// listed in shared/data/events-data.mjs (EXPLORE_DECKS). Rules implemented in full:
//   * the top card of the chosen deck shows its intro and options А/Б; an option whose printed
//     cost cannot be paid in full is disabled;
//   * the consequences are shown, then applied «as far as possible»;
//   * «Задание»: the card stays with the player, a random location token of the terrain is put on
//     it (another terrain if that pile is empty; none left — the card is discarded); in phase I,
//     at that location, the player may complete it and takes the numbered event card;
//   * equipment / companions are kept for the rest of the game (Кастет is a fight action).
// Slice deviation: a resolved card goes to the bottom of its deck instead of the box, so a deck
// of two cards never runs out while the loop is being tested.
import { STEPS, push, ask } from './flow.mjs';
import { LOC, ADJ, log, fx, d6, shuffle, clampShield } from './util.mjs';
import { TERRAIN_NAME } from '../data/rules-data.mjs';
import { EXPLORE_DECKS, EVENTS, questLabel } from '../data/events-data.mjs';
import { canEnter } from './turn.mjs';

export const EXPLORE_READY = true;
const DECK_NAME = { city: 'город', wild: 'окрестности' };

/** Decks live in the state (hidden: the view shows only counts). Old saves get them lazily. */
export function ensureExplore(state) {
    if (!state.explore) {
        state.explore = {};
        for (const d of Object.keys(EXPLORE_DECKS)) state.explore[d] = shuffle(state, EXPLORE_DECKS[d].slice());
    }
    return state.explore;
}

export function exploreError(state, p, deck) {
    if (deck !== 'city' && deck !== 'wild') return 'Выберите город или окрестности';
    const t = state.turn;
    if (!t || t.seat !== p.seat || t.phase !== 1) return 'Только в свой ход вместо битвы/медитации';
    if (t.afterExplore) return 'Исследование уже было в этот ход';
    const decks = state.explore || EXPLORE_DECKS;
    if (!decks[deck].length) return `Колода исследования (${DECK_NAME[deck]}) пуста`;
    return null;
}

/** Why an option cannot be picked (its printed cost), or null. */
export function optionCostError(p, opt) {
    if (opt.cost && opt.cost.gold && p.gold < opt.cost.gold) return `Нужно ${opt.cost.gold} золота`;
    return null;
}

STEPS.exploreStart = (state, step) => {
    const p = state.players[step.seat];
    const decks = ensureExplore(state);
    const id = decks[step.deck].shift();
    const ev = EVENTS[id];
    log(state, `${p.name} исследует ${DECK_NAME[step.deck]} (${LOC[p.loc].name})`, { kind: 'explore' });
    fx(state, { k: 'explore', seat: p.seat, deck: step.deck, id });
    ask(state, {
        seat: p.seat, kind: 'choice', ui: 'event', stage: 'choose', card: id, title: `Исследование: ${DECK_NAME[step.deck]}`,
        options: ['a', 'b'].map(k => {
            const e = optionCostError(p, ev[k]);
            return { id: k, label: `${k === 'a' ? 'А' : 'Б'}. ${ev[k].label}`, disabled: !!e, hint: e || undefined };
        }),
        op: 'exploreChoice', args: { seat: p.seat, id, deck: step.deck },
    });
};

STEPS.exploreChoice = (state, step) => {
    const p = state.players[step.seat];
    const ev = EVENTS[step.id];
    const opt = ev[step.choice];
    if (opt.cost && opt.cost.gold) p.gold -= opt.cost.gold;
    log(state, `${p.name} выбирает ${step.choice === 'a' ? 'А' : 'Б'}: «${opt.label}»`, { kind: 'explore' });
    ask(state, {
        seat: p.seat, kind: 'choice', ui: 'event', stage: 'outcome', pick: step.choice, card: step.id, title: 'Последствия', effect: opt.effect,
        options: [{ id: 'ok', label: 'Продолжить' }], op: 'exploreApply', args: { seat: p.seat, id: step.id, deck: step.deck, pick: step.choice },
    });
};

STEPS.exploreApply = (state, step) => {
    const p = state.players[step.seat];
    const opt = EVENTS[step.id][step.pick];
    const keep = opt.fx.some(e => e.quest);
    push(state, ...effectSteps(p.seat, opt.fx, { card: step.id }), { op: 'exploreDone', seat: p.seat, id: step.id, deck: step.deck, keep });
};

STEPS.exploreDone = (state, step) => {
    const p = state.players[step.seat];
    const decks = ensureExplore(state);
    // Quest cards stay with the player (or were discarded by questStart when no token was left).
    if (!step.keep || !p.quests.some(q => q.id === step.id)) decks[step.deck].push(step.id);
    if (!state.turn.afterExplore) push(state, { op: 'phase3' });
};

/** Effect list → steps (applied in order, each «as far as possible»). */
export function effectSteps(seat, list, ctx = {}) {
    return list.map(e => ({ op: 'eventFx', seat, e, card: ctx.card, deck: ctx.deck }));
}

STEPS.eventFx = (state, step) => {
    const p = state.players[step.seat];
    const e = step.e;
    if (e.gold) {
        const before = p.gold;
        p.gold = Math.max(0, p.gold + e.gold);
        const d = p.gold - before;
        if (d) { log(state, `${p.name}: ${d > 0 ? '+' : '−'}${Math.abs(d)} золота`); fx(state, { k: 'gold', seat: p.seat, n: d }); }
        else if (e.gold < 0) log(state, `${p.name}: золота нет — сбрасывать нечего`);
    }
    if (e.skill) push(state, { op: 'raiseSkill', seat: p.seat, skill: e.skill, why: 'событие' });
    if (e.draw) {
        state.turn.drawDelta += e.draw;
        log(state, `${p.name}: в фазе III ${e.draw > 0 ? 'на ' + e.draw + ' карту больше' : 'на ' + -e.draw + ' карту меньше'}`);
    }
    if (e.shield) {
        const before = p.shield;
        p.shield = Math.max(0, p.shield + e.shield);
        clampShield(state, p);
        log(state, `${p.name}: щит ${before} → ${p.shield}`);
    }
    if (e.elixir) push(state, { op: 'gainElixir', seat: p.seat, n: e.elixir, why: 'событие' });
    const holder = e.gear && state.players.find(x => x.gear.includes(e.gear));
    if (holder) log(state, `Карта «${EVENTS[e.gear].name}» уже у игрока ${holder.name} — взять её нельзя`);
    else if (e.gear) {
        p.gear.push(e.gear);
        log(state, `${p.name} получает снаряжение «${EVENTS[e.gear].name}»`, { kind: 'explore' });
        fx(state, { k: 'gear', seat: p.seat, id: e.gear });
    }
    if (e.quest) push(state, { op: 'questStart', seat: p.seat, id: step.card, terrain: e.quest.terrain, event: e.quest.event });
    if (e.freeMove) {
        const opts = (ADJ[p.loc] || []).filter(n => canEnter(state, n)).map(n => ({ id: String(n), label: LOC[n].name, hint: TERRAIN_NAME[LOC[n].terrain] }));
        if (opts.length) ask(state, { seat: p.seat, kind: 'choice', ui: 'move', title: 'Перемещение', text: 'Переместитесь в соседнюю локацию, не сбрасывая карты. Затем можете выполнить её действие.', options: opts, op: 'exploreMove', args: { seat: p.seat } });
    }
    if (e.roll) {
        const r = d6(state);
        fx(state, { k: 'd6', v: r, seat: p.seat });
        const br = e.roll.find(b => r >= b.from && r <= b.to);
        log(state, `${p.name} бросает кубик: ${r}`, { kind: 'explore' });
        push(state, { op: 'eventRollShow', seat: p.seat, r, card: step.card }, ...effectSteps(p.seat, br.fx, { card: step.card }));
    }
};
STEPS.eventRollShow = (state, step) => {
    ask(state, { seat: step.seat, kind: 'choice', ui: 'event', stage: 'roll', card: step.card, title: `Бросок кубика: ${step.r}`, dice: step.r, options: [{ id: 'ok', label: 'Продолжить' }], op: 'noop', args: {} });
};
STEPS.noop = () => {};

STEPS.exploreMove = (state, step) => {
    const p = state.players[step.seat];
    const to = Number(step.choice);
    const from = p.loc;
    p.loc = to;
    const t = state.turn;
    // Back to a phase-I-like window: only the new location's action, then phase III.
    t.phase = 1; t.moved = true; t.afterExplore = true;
    log(state, `${p.name}: ${LOC[from].name} → ${LOC[to].name} (событие, без сброса карт)`, { kind: 'move' });
    fx(state, { k: 'move', seat: p.seat, from, to, cards: [] });
    push(state, { op: 'arrive', seat: p.seat });
};

// ---- quests ------------------------------------------------------------------------------------
STEPS.questStart = (state, step) => {
    const p = state.players[step.seat];
    let terrain = step.terrain;
    if (!state.locPiles[terrain].length) terrain = Object.keys(state.locPiles).find(k => state.locPiles[k].length);
    if (!terrain) { log(state, `${p.name}: жетоны локаций закончились — задание не может быть начато`); return; }
    const loc = state.locPiles[terrain].pop();
    p.quests.push({ id: step.id, terrain, loc, event: step.event });
    log(state, `${p.name} получает задание «${questLabel({ id: step.id })}»: ${LOC[loc].name} (${TERRAIN_NAME[terrain].toLowerCase()})`, { kind: 'explore' });
    fx(state, { k: 'quest', seat: p.seat, loc });
};

/** Why quest #i cannot be completed now, or null. */
export function questError(state, p, i) {
    const q = p.quests[i];
    const t = state.turn;
    if (!q) return 'Нет такого задания';
    if (!t || t.seat !== p.seat || t.phase !== 1 || t.afterExplore) return 'Только в фазе I своего хода';
    if (p.loc !== q.loc) return `Нужно быть в локации ${LOC[q.loc].name}`;
    return null;
}

STEPS.questDone = (state, step) => {
    const p = state.players[step.seat];
    const q = p.quests.splice(step.i, 1)[0];
    state.locPiles[q.terrain].push(q.loc);
    shuffle(state, state.locPiles[q.terrain]);
    // The quest card itself leaves play; in the slice it returns under its deck.
    const deck = Object.keys(EXPLORE_DECKS).find(d => EXPLORE_DECKS[d].includes(q.id));
    if (deck) ensureExplore(state)[deck].push(q.id);
    const ev = EVENTS[q.event];
    log(state, `${p.name} выполняет задание «${questLabel(q)}» и берёт событие ${ev.num}`, { kind: 'explore' });
    fx(state, { k: 'questDone', seat: p.seat, id: q.event });
    if (ev.gear) { push(state, { op: 'eventFx', seat: p.seat, e: { gear: q.event } }); return; }
    ask(state, { seat: p.seat, kind: 'choice', ui: 'event', stage: 'event', card: q.event, title: `Событие ${ev.num}`, options: [{ id: 'ok', label: 'Продолжить' }], op: 'eventApply', args: { seat: p.seat, id: q.event } });
};
STEPS.eventApply = (state, step) => {
    push(state, ...effectSteps(step.seat, EVENTS[step.id].fx, { card: step.id }));
};

