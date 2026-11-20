// «Легендарная охота» (Книги правил/Легендарная охота.md; Легендарные монстры/*.md). The printed
// texts come from gen-data.mjs (imported from the Markdown); this file encodes the rules data:
// armor by the trophy track, the solo movement deck, the special attacks I–IV as the operations
// of engine/vuln.mjs (vocabulary in vuln-data.mjs) plus a few legendary-only ones:
//   dmgTrophies mult min         damage = trophies × mult (at least min) — Циклоп III
//   dmgKit mult min              damage = (unused elixirs + bombs) × mult (at least min) — Пугач I
//   dmgRuinsBoard                damage = ruin tokens on the board — Ледяной великан I
//   dmgTable by:'loc'|'terrain'  damage by the legendary monster's location — Гюнтер III, Кейран III
//   reshuffleTop                 the combat card just revealed back into the life pool, shuffled — Скрытый III
//   next { dmgLess n }           the next combo deals n less damage
//   next { needBlue n }          the next combo deals n less damage unless it has a blue card
//   next { armorPlus n }         the legendary monster's armor +n in the next witcher turn
import { LEGENDS, LEGATTACKS, LEGMOVES, RUINS } from './gen-data.mjs';

export const LEGEND = Object.fromEntries(LEGENDS.map(l => [l.id, l]));
export const LEGEND_BY_KEY = Object.fromEntries(LEGENDS.map(l => [l.key, l]));
export const LEG_ATTACK = Object.fromEntries(LEGATTACKS.map(a => [a.id, a]));
export const LEG_MOVE = Object.fromEntries(LEGMOVES.map(m => [m.id, m]));
export const RUIN = Object.fromEntries(RUINS.map(r => [r.id, r]));
export const isLegend = (id) => !!LEGEND[id];

/** Armor of the legendary monster by the attacker's trophy track division (0–4), memo sides A/B. */
export const ARMOR = { A: [3, 2, 1, 0, 0], B: [4, 3, 2, 1, 0] };
/** Solo: number of movement cards by difficulty (no reshuffle; empty deck = defeat). */
export const SOLO_MOVES = { easy: 9, normal: 8, hard: 7 };
export const SOLO_NAME = { easy: 'легко', normal: 'средне', hard: 'сложно' };

/** Lobby settings live in the expansion list: 'legendary', 'legendary:B' (memo side B),
 *  'legendary:mon:<key>' (a chosen monster; none — random), 'legendary:solo:<easy|normal|hard>'. */
export function legendOpts(exp) {
    const e = Array.isArray(exp) ? exp : [];
    if (!e.includes('legendary')) return null;
    const mon = e.map(x => /^legendary:mon:([a-z]+)$/.exec(x)).find(Boolean);
    const solo = e.map(x => /^legendary:solo:(easy|normal|hard)$/.exec(x)).find(Boolean);
    return { side: e.includes('legendary:B') ? 'B' : 'A', mon: mon && LEGEND_BY_KEY[mon[1]] ? mon[1] : null, solo: solo ? solo[1] : 'normal' };
}
export const isLegendExp = (x) => x === 'legendary' || x === 'legendary:B' || /^legendary:solo:(easy|normal|hard)$/.test(x) || (/^legendary:mon:([a-z]+)$/.test(x) && !!LEGEND_BY_KEY[x.slice(14)]);

const G = ['green'], B = ['blue'], Y = ['yellow'], P = ['purple'], R = ['red'];
/** Special attacks I–IV of each legendary monster (texts: LEGEND[id].attacks). */
export const LEG_SPECIAL = {
    'LEG-GOLEM': [
        [{ k: 'color', colors: P, else: [{ k: 'dmg', n: 4 }] }],
        [{ k: 'dmg', n: 3 }, { k: 'next', ban: Y }],
        [{ k: 'dmg', n: 3 }, { k: 'next', ban: P }],
        [{ k: 'dmg', n: 2 }, { k: 'color', colors: Y, else: [{ k: 'dmg', n: 4 }] }]],
    'LEG-CYCLOPS': [
        [{ k: 'color', colors: R, else: [{ k: 'dmg', n: 4 }] }],
        [{ k: 'dmg', n: 2 }, { k: 'handToTop', n: 2 }],
        [{ k: 'dmgTrophies', mult: 2, min: 1 }],
        [{ k: 'dmg', n: 2 }, { k: 'color', colors: R, else: [{ k: 'dmg', n: 4 }] }]],
    'LEG-TOAD': [
        [{ k: 'randHand', n: 1, orDeck: true }, { k: 'elixir', n: 2 }],
        [{ k: 'dmgHand' }],
        [{ k: 'dmg', n: 3 }, { k: 'color', colors: B, else: [{ k: 'dmg', n: 3 }] }],
        [{ k: 'dmg', n: 4 }, { k: 'next', ban: B }]],
    'LEG-FIEND': [
        [{ k: 'dmgKit', mult: 2, min: 1 }],
        [{ k: 'dmg', n: 3 }, { k: 'next', dmgLess: 2 }],
        [{ k: 'allColors', colors: G, elseDmg: 2 }],
        [{ k: 'dmg', n: 3 }, { k: 'color', colors: G, else: [{ k: 'dmg', n: 4 }] }]],
    'LEG-UNSEEN': [
        [{ k: 'color', colors: P, else: [{ k: 'dmg', n: 5 }] }],
        [{ k: 'next', ban: [...Y, ...P] }],
        [{ k: 'dmg', n: 4 }, { k: 'reshuffleTop' }],
        [{ k: 'dmg', n: 3 }, { k: 'next', armorPlus: 2 }]],
    'LEG-ICEGIANT': [
        [{ k: 'dmgRuinsBoard' }],
        [{ k: 'dmg', n: 3 }, { k: 'next', dmgCap: 2 }],
        [{ k: 'dmg', n: 4 }, { k: 'next', ban: B }],
        [{ k: 'dmg', n: 5 }, { k: 'next', needBlue: 2 }]],
    'LEG-GAUNTER': [
        [{ k: 'shield0' }, { k: 'dmg', n: 2 }],
        [{ k: 'dmg', n: 4 }, { k: 'next', ban: Y }],
        [{ k: 'dmgTable', by: 'loc' }],
        [{ k: 'dmg', n: 7 }]],
    'LEG-KAYRAN': [
        [{ k: 'randHand', n: 1, orDeck: true }, { k: 'dmg', n: 2 }],
        [{ k: 'dmg', n: 4 }, { k: 'next', ban: R }],
        [{ k: 'dmgTable', by: 'terrain' }],
        [{ k: 'handToTop', n: 3 }]],
};

/** Гюнтер III: damage by the location number; Кейран III: by the terrain (printed tables). */
export function legTableDamage(monId, loc, terrain) {
    const t = (LEGEND[monId] && LEGEND[monId].table) || [];
    for (const [k, v] of t) {
        const m = /^(\d+)[–-](\d+)$/.exec(k);
        if (m && loc >= Number(m[1]) && loc <= Number(m[2])) return v;
        if (!m && { 'Горная': 'mountain', 'Лесная': 'forest', 'Водная': 'water' }[k] === terrain) return v;
    }
    return 0;
}

/** Ruin bonus as a short text (HUD / log). */
export function ruinText(id) { return RUIN[id] ? RUIN[id].text : ''; }
