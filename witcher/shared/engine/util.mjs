// Shared helpers of the rules engine: seeded RNG kept inside the state, card lookup, logging.
import { STARTER, COMMON, MONSTERS, ATTACKS, POTIONS, BOARD, LEGENDS, LEGATTACKS } from '../data/gen-data.mjs';
import { SKILL_VALUE, HAND_LIMIT } from '../data/rules-data.mjs';
import { MASTERS, UNIQUES } from '../data/trail-data.mjs';
import { DAGON, SK_LOCS } from '../data/skellige-data.mjs';
import { MAGE_START, MAGE_COMMON, MAGE_UNIQUES } from '../data/mages-data.mjs';
import { SCHOOLS, isMage } from '../data/rules-data.mjs';

// «Чародеи»: the mage action cards (printed scans, `mageCard`) share the lookup.
export const CARDS = Object.fromEntries([...STARTER, ...COMMON, ...MASTERS, ...UNIQUES, ...MAGE_START, ...MAGE_COMMON, ...MAGE_UNIQUES].map(c => [c.id, c]));
// «Легендарная охота»: the legendary monsters share the lookup (level III for the level-indexed
// texts, life = the 20 legendary combat cards) and their combat cards share ATTACK.
// «Скеллиге»: Dagon (a level II monster card that never lies in a monster stack).
export const MONSTER = Object.fromEntries([...MONSTERS, ...LEGENDS.map(l => ({ ...l, level: 3, life: LEGATTACKS.length, legend: true })), DAGON].map(m => [m.id, m]));
export const ATTACK = Object.fromEntries([...ATTACKS, ...LEGATTACKS].map(a => [a.id, a]));
export const POTION = Object.fromEntries(POTIONS.map(p => [p.id, p]));
// «Скеллиге»: the Dagon location (30) and the islands of the event cards (31–35) — see canEnter.
export const LOC = Object.fromEntries([...BOARD.locs, ...SK_LOCS].map(l => [l.n, l]));
export const ADJ = BOARD.adj;

/** Elixir instances are "POTION-03#2"; this returns the printed card. */
export const potionOf = (inst) => POTION[inst.split('#')[0]];
export const card = (id) => CARDS[id];

// ---------------------------------------------------------------------------------------------
// RNG (mulberry32); the state carries the seed so saves and undo replay identically.
// ---------------------------------------------------------------------------------------------
export function rand(state) {
    let t = (state.rng = (state.rng + 0x6D2B79F5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const randInt = (state, n) => Math.floor(rand(state) * n);
export const d6 = (state) => 1 + randInt(state, 6);
export function shuffle(state, arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = randInt(state, i + 1);
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// ---------------------------------------------------------------------------------------------
export const player = (state, seat) => state.players[seat];
export const skillVal = (p, s) => SKILL_VALUE[Math.max(0, Math.min(5, p.skills[s]))];
export const maxShield = (state, p) => {
    // «Чародеи» (p. 6): the energy of a mage is capped by Мудрость outside a battle, by 4 in it.
    if (isMage(p) && inFight(state, p)) return 4;
    let d = p.skills.defense;
    if (state.fight && state.fight.seat === p.seat && state.fight.mon === 'MON-15' && !state.fight.noAbility && d < 5) d = Math.max(1, d - 1);
    return SKILL_VALUE[d];
};

/** Is `p` a participant of the current fight (monster fight or either side of a witcher fight)? */
export const inFight = (state, p) => !!(state.fight && (state.fight.seat === p.seat || state.fight.att === p.seat || state.fight.def === p.seat));
/** The «локация своей школы»: a mage's start location (Чародеи p. 5), else the school's home. */
export const homeOf = (p) => (p.home != null ? p.home : SCHOOLS[p.school] ? SCHOOLS[p.school].home : null);
/** «Чародеи» (p. 5): a mage takes action cards only from the mage row (`state.mrow`), a witcher
 *  only from the normal one. When every player is a mage the mage cards lie in `state.row`. */
export const rowKey = (state, p) => (state.mrow && isMage(p) ? 'mrow' : 'row');
export const rowOf = (state, p) => state[rowKey(state, p)];
export const rowDeckOf = (state, p) => state[rowKey(state, p) === 'mrow' ? 'mactionDeck' : 'actionDeck'];
/** Every card of both rows (anyone may REMOVE cards from either row). */
export const allRowCards = (state) => [...state.row, ...(state.mrow || [])].filter(Boolean);
/** Take card `id` out of whichever row holds it: returns { key, slot } or null. */
export function clearRowCard(state, id) {
    for (const key of ['row', 'mrow']) {
        const r = state[key];
        const i = r ? r.indexOf(id) : -1;
        if (i >= 0) { r[i] = null; return { key, slot: i }; }
    }
    return null;
}
/** «щит» / «энергия» in texts about `p`. */
export const shieldWord = (p) => (isMage(p) ? 'энергия' : 'щит');

export function log(state, text, extra) {
    state.log.push({ i: state.log.length, t: text, turn: state.round, ...(extra || {}) });
    if (state.log.length > 600) state.log.splice(0, state.log.length - 600);
}
/** Visual events for the client (card flights, dice, banners). Cleared before each command. */
export function fx(state, ev) { state.events.push(ev); }

export const pname = (state, seat) => state.players[seat].name;

/** Draw n cards into hand (reshuffling the discard if the deck runs out, unless in a fight). */
export function drawCards(state, p, n, opts = {}) {
    let drawn = 0;
    const inFight = state.fight && (state.fight.seat === p.seat || state.fight.defender === p.seat);
    for (let i = 0; i < n; i++) {
        if (p.hand.length >= HAND_LIMIT) break;
        if (!p.deck.length) {
            if (inFight || opts.noReshuffle || !p.discard.length) break;
            p.deck = shuffle(state, p.discard.splice(0));
            log(state, `${p.name} перемешивает сброс в колоду`);
        }
        p.hand.push(p.deck.shift());
        drawn++;
    }
    if (drawn) fx(state, { k: 'draw', seat: p.seat, n: drawn });
    return drawn;
}

export function removeFrom(arr, id) {
    const i = arr.indexOf(id);
    if (i < 0) return false;
    arr.splice(i, 1);
    return true;
}

export const allOwnCards = (p) => [...p.hand, ...p.deck, ...p.discard];

export function clampShield(state, p) {
    const m = maxShield(state, p);
    if (p.shield > m) p.shield = m;
    if (p.shield < 0) p.shield = 0;
}
