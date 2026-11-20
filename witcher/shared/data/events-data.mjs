// Exploration and event cards. Texts and effects are GENERATED from Witcher/События/*.md by
// witcher/tools/events-gen.mjs into events-gen.mjs; this file only merges hand overrides.
//
// Effect language (each applied in order, «as far as possible»):
//   { gold: n }                 take (+) / discard (−) gold
//   { skill: 'combat'|'defense'|'alchemy'|'spec'|'lowest'|'lowest2'|'any' }   raise skill(s) by 1
//   { skillDown: skill }        lower a skill by 1
//   { draw: n }                 draw n more (+) / fewer (−) cards in phase III of this turn
//   { drawNow: n }              draw n cards from your deck now
//   { discardHand: n }          discard n cards from hand (your choice)
//   { shield: n }               change the shield level (−99 = down to 0)
//   { elixir: n, noLimit? }     take n elixirs;  { elixirLoss: n } discard n (99 = all)
//   { track: 'any'|'all' }      take a track token (chosen monster) / one of every missing type
//   { removeCard: 1 }           remove 1 of your cards from the game (hand, deck or discard)
//   { rowCard: { cost?, leftmost? } }  take a row card (printed cost) into your discard, free
//   { freeMove: true }          move to an adjacent location without discarding, then its action
//   { toPhase3: true }          go to phase III at once;  { noExplore: true } no exploring this turn
//   { event: id }               take numbered event card `id` at once (story or equipment)
//   { quest: { terrain|loc|school, event, gold? } }  the card becomes a quest
//   { roll: [{ from, to, text, effect, fx }], by? }  die roll (or `by` a skill / 'level')
//   { if: { goldMax|elixirMax|shieldMax|trophiesMax }, fx, else? }  conditional
//   { freeMove: n }             … up to n locations away (not stopping on the way)
//   { freeBuy: true } / { buyDiscount: n }  phase III row card of this turn free / n cheaper
//   { elixirTo: n, noLimit }    draw elixirs up to n
//   { keep: { kind, … } }       «положите эту карту перед собой» (effects.mjs keepOf)
//   { trap: { where, on, event } }  a quest token that springs on OTHER players: where =
//                               here|adj|school|any|random|<terrain>, on = move (arrives) | end
//                               (ends the turn there); the owner reads them event `event`
//   { trapDrop: true }          the sprung token is discarded (default anyway);
//   { trapStay: true }          … stays, but not for this player again this turn
//   { secret: id }              take event `id` face down; its `trigger` (move/endPhase1/
//                               skillUp/defeat) reads it to another player
//   { roll, by: 'combo'|'elixirs', comboDraw? }  table by combo damage / discarded elixirs
// An option's `cost` (printed in the option line itself) must be payable to pick it:
//   { gold: n } | { elixir: n } | { color: 'yellow'… } (a card of that colour) | { card: 1 } (any, if any).

import { GEN_DECKS, GEN_EXP_DECKS, GEN_EVENTS, UNSUPPORTED } from './events-gen.mjs';

/**
 * Exploration decks: every card of «Городские события 1» (city) and «События мира 1» (outskirts)
 * whose printed effects are fully supported (see tools/events-gen.mjs and UNSUPPORTED).
 * Every card exists in ONE copy: once resolved it leaves the game (База.md p. 16).
 */
export const EXPLORE_DECKS = GEN_DECKS;
/** Exploration cards an expansion shuffles into the decks: { ciri: { city, wild } }. */
export const EXP_DECKS = GEN_EXP_DECKS;
export { UNSUPPORTED };

/** Hand-tuned overrides on top of the generated texts (merged field by field). */
const OVERRIDES = {
    'CONT81-15': { questName: 'Брат конюха — солтыс' },
};

export const EVENTS = {};
for (const [id, c] of Object.entries(GEN_EVENTS)) EVENTS[id] = { ...c, ...(OVERRIDES[id] || {}) };
// Quest titles for the HUD: the printed option line that gave the quest, shortened.
const short = (s) => { s = s.replace(/[«»]/g, '').replace(/\.$/, ''); return s.length > 44 ? s.slice(0, 42).replace(/\s+\S*$/, '') + '…' : s; };
for (const c of Object.values(EVENTS)) {
    if (c.questName) continue;
    const o = ['a', 'b'].map(k => c[k]).find(o => o && /"(quest|trap)"/.test(JSON.stringify(o.fx)));
    if (o) c.questName = short(o.label);
}

/** Short label of a quest for the HUD. */
export const questLabel = (q) => {
    const ev = EVENTS[q.id];
    if (ev?.questName) return ev.questName;
    // Cards without a quest name («Скеллиге»): the number of the event the quest leads to.
    const fx = [...(ev?.fx || []), ...(ev?.a?.fx || []), ...(ev?.b?.fx || [])].find(f => f.quest);
    return fx && EVENTS[fx.quest.event] ? `событие ${EVENTS[fx.quest.event].num}` : 'Задание';
};
