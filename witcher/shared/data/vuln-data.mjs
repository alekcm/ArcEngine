// «По следу монстра» — mini-expansion «Уязвимости и особые атаки» (Книги правил/По следу монстра.md
// pp. 6–7; Монстры/Большие карты монстров.md, Монстры/Уязвимости.md, Монстры/Доп боевая колода.md).
// The printed texts come from gen-data.mjs (BIGCARDS, imported from the Markdown); this file only
// encodes them as structured operations the engine executes (engine/vuln.mjs).
import { BIGCARDS } from './gen-data.mjs';

/** The 4 special combat cards: the number is the special attack I–IV of the fought monster. */
export const SPECIALS = [1, 2, 3, 4].map(n => ({ id: 'MON-SPECIAL-0' + n, n, cell: ['r1c1', 'r1c2', 'r2c1', 'r2c2'][n - 1] }));
export const SPECIAL = Object.fromEntries(SPECIALS.map(s => [s.id, s]));
export const isSpecial = (id) => !!SPECIAL[id];
/** Large monster cards by the small card id (Сирена and Кащей have none in this game). */
export const BIG = Object.fromEntries(BIGCARDS.map(b => [b.id, b]));
export const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];

// ---------------------------------------------------------------------------------------------
// Special attacks I–IV. Each attack is a list of operations applied in order:
//   dmg n [ifDice +n]           the witcher takes n damage (shield → deck → hand, as any attack)
//   dmgHand / dmgElixirs plus   damage = cards in hand / unused elixirs (+plus)
//   dmgShield0 [a, b]           a damage at shield 0, otherwise b
//   dmgDie [6 values]           roll a die: damage by the face
//   dmgDice min                 damage = dice on the monster card (at least min)
//   dmgTrack                    Леший IV: 1 with this monster's track token and another one, else 4
//   dmgVuln plus / dmgVulnLess base   by the player's vulnerability tokens of this monster
//   randCorner                  1 random hand card discarded (none: deck top); damage = its corner damage
//   shield0 / shieldDown n
//   color [colours] else [ops]  discard 1 card of the colour(s) from the hand (player's choice);
//                               if impossible — the `else` operations
//   allColors [colours] elseDmg discard every card of the colours; none — elseDmg damage
//   randHand n [orDeck] [byElixirs]   n random hand cards (missing ones from the deck top if orDeck)
//   handDisc n [orDeck] [ifDice +n]   n hand cards of the player's choice (missing ones: deck top)
//   deckTop n orHand any|random  n deck-top cards (missing ones from the hand)
//   deckBottom n                 n cards from the bottom of the deck
//   elixir n [elseDmg] / gold n  discard unused elixirs (choice) / gold
//   removeTop                    remove the deck-top card from the game (no deck: a random hand card)
//   removeHand                   remove 1 hand card of the player's choice from the game
//   handToTop n|'all'            n random hand cards on top of the deck, random order
//   handToTopPick n              n hand cards of the player's choice on top of the deck, any order
//   halfHand down|up             discard half of the hand (player's choice)
//   highCost                     discard the hand card with the highest cost
//   lookRemove                   look at the top 3: remove 1 from the game, the rest back shuffled
//   combo3 elseDmg               play a combo of exactly 3 cards at once, damage symbols ignored
//   monDmg n                     the monster takes n damage (cards from the top of its life pool)
//   dice n / diceIfNone          dice on the monster card
//   poolDiscard n|'shield'       random cards of the monster discard to the top of its life pool
//   poolDeck n                   random cards of the monster attack deck to the top of its life pool
//   elixirCut                    Сколопендроморф I: 7 damage, −1 for 1 elixir or −3 for 2
//   skip                         the witcher skips the next fight turn
//   next {…}                     restrictions of the witcher's next fight turn (see NEXT_TEXT)
//   nextM {…}                    the monster's next turn: chooseType / plus n
//   whole {…}                    for the rest of the fight: shieldCap n / defLess n
// ---------------------------------------------------------------------------------------------
const G = ['green'], B = ['blue'], Y = ['yellow'], P = ['purple'], R = ['red'];
export const ATTACKS = {
    'MON-01': [[{ k: 'randHand', n: 2, orDeck: true }], [{ k: 'dmg', n: 4 }, { k: 'whole', shieldCap: 1 }],
        [{ k: 'color', colors: G, else: [{ k: 'dmg', n: 2 }, { k: 'skip' }] }], [{ k: 'dmg', n: 3 }, { k: 'next', maxCombo: 2 }]],
    'MON-02': [[{ k: 'dmg', n: 2 }, { k: 'next', drawLess: 2 }], [{ k: 'color', colors: G, else: [{ k: 'shield0' }, { k: 'skip' }] }],
        [{ k: 'color', colors: G, else: [{ k: 'shield0' }, { k: 'dmg', n: 3 }] }], [{ k: 'removeTop' }]],
    'MON-03': [[{ k: 'dmg', n: 2 }, { k: 'next', maxCombo: 1 }], [{ k: 'color', colors: Y, else: [{ k: 'dmg', n: 4 }] }],
        [{ k: 'dmg', n: 3 }, { k: 'next', ignoreDmg: 2 }], [{ k: 'dmgShield0', v: [4, 2] }]],
    'MON-04': [[{ k: 'deckTop', n: 3, orHand: 'any' }], [{ k: 'dmg', n: 2 }, { k: 'next', noShield: true }],
        [{ k: 'dmg', n: 3 }, { k: 'next', noShield: true }], [{ k: 'dmg', n: 2 }, { k: 'skip' }]],
    'MON-05': [[{ k: 'dmg', n: 2 }, { k: 'next', drawLess: 1 }], [{ k: 'color', colors: G, else: [{ k: 'dmg', n: 2 }, { k: 'skip' }] }],
        [{ k: 'deckTop', n: 3, orHand: 'random' }], [{ k: 'dmg', n: 2 }, { k: 'next', ignoreDmg: 2 }]],
    'MON-06': [[{ k: 'dmg', n: 1 }, { k: 'next', shieldPerCard: true }], [{ k: 'dmg', n: 2 }, { k: 'randHand', n: 1, orDeck: true }],
        [{ k: 'deckTop', n: 3, orHand: 'random' }], [{ k: 'dmg', n: 3 }, { k: 'next', drawCap: 1 }]],
    'MON-07': [[{ k: 'dmg', n: 2 }, { k: 'elixir', n: 1 }], [{ k: 'allColors', colors: ['yellow', 'purple'], elseDmg: 2 }],
        [{ k: 'dmg', n: 4 }, { k: 'elixir', n: 1 }], [{ k: 'dmg', n: 1 }, { k: 'next', drawFixed: 0 }]],
    'MON-08': [[{ k: 'dmg', n: 2 }, { k: 'handToTop', n: 3 }], [{ k: 'dmg', n: 3 }, { k: 'handToTop', n: 'all' }],
        [{ k: 'color', colors: G, else: [{ k: 'dmg', n: 4 }] }], [{ k: 'color', colors: B, else: [{ k: 'shield0' }, { k: 'skip' }] }]],
    'MON-09': [[{ k: 'dmg', n: 2 }, { k: 'elixir', n: 1 }], [{ k: 'dmg', n: 3 }, { k: 'elixir', n: 2 }],
        [{ k: 'color', colors: P, else: [{ k: 'shield0' }, { k: 'skip' }] }], [{ k: 'dmg', n: 3 }, { k: 'next', maxCombo: 2 }]],
    'MON-10': [[{ k: 'color', colors: B, else: [{ k: 'dmg', n: 4 }] }], [{ k: 'dmg', n: 2 }, { k: 'removeHand' }],
        [{ k: 'dmg', n: 2 }, { k: 'next', noDrawFx: true }], [{ k: 'dmg', n: 3 }, { k: 'next', noLinks: true }]],
    'MON-11': [[{ k: 'dmg', n: 3 }, { k: 'nextM', chooseType: true }], [{ k: 'dmg', n: 3 }, { k: 'next', drawCap: 1 }],
        [{ k: 'dmgElixirs', plus: 2 }], [{ k: 'dmg', n: 2 }, { k: 'next', colorLess: ['red', 'blue'] }]],
    'MON-12': [[{ k: 'elixir', n: 1 }, { k: 'gold', n: 1 }, { k: 'dmg', n: 2 }], [{ k: 'dmg', n: 3 }, { k: 'next', ignoreDmg: 2 }],
        [{ k: 'dmg', n: 4 }, { k: 'next', ban: B }], [{ k: 'dmgHand' }]],
    'MON-15': [[{ k: 'dmg', n: 3 }, { k: 'dice', n: 2 }], [{ k: 'next', noDmg: true }, { k: 'dice', n: 1 }],
        [{ k: 'dmgDice', min: 0 }, { k: 'next', firstMin2: true }], [{ k: 'dmgTrack' }, { k: 'next', drawLess: 1 }]],
    'MON-14': [[{ k: 'dmgShield0', v: [3, 5] }], [{ k: 'dmg', n: 4 }, { k: 'next', ban: R }],
        [{ k: 'deckTop', n: 3, orHand: 'any' }], [{ k: 'handDisc', n: 3, orDeck: true }, { k: 'next', ban: G }]],
    'MON-13': [[{ k: 'dmg', n: 4 }, { k: 'next', onlyLinks: true }], [{ k: 'shield0' }, { k: 'randHand', n: 2 }],
        [{ k: 'dmgHand' }], [{ k: 'dmg', n: 3 }, { k: 'elixir', n: 3 }]],
    'MON-16': [[{ k: 'randHand', n: 1, orDeck: true }, { k: 'handToTopPick', n: 2 }], [{ k: 'dmg', n: 2 }, { k: 'skip' }],
        [{ k: 'deckTop', n: 3, orHand: 'any' }], [{ k: 'dmg', n: 4 }, { k: 'next', firstColor: ['blue', 'purple'], orOne: true }]],
    'MON-17': [[{ k: 'color', colors: B, else: [{ k: 'dmg', n: 3 }] }], [{ k: 'deckTop', n: 3, orHand: 'any' }],
        [{ k: 'randHand', n: 2, orDeck: true }], [{ k: 'dmgDie', v: [2, 2, 3, 3, 4, 4] }]],
    'MON-18': [[{ k: 'monDmg', n: 1 }, { k: 'dmg', n: 5, ifDice: 2 }], [{ k: 'monDmg', n: 2 }, { k: 'handDisc', n: 5, orDeck: true, ifDice: 1 }],
        [{ k: 'color', colors: Y, else: [{ k: 'handDisc', n: 3, orDeck: true }] }], [{ k: 'next', maxCombo: 1 }, { k: 'diceIfNone' }]],
    'MON-19': [[{ k: 'dmgVuln', plus: 1 }], [{ k: 'randCorner' }],
        [{ k: 'dmg', n: 3 }, { k: 'randHand', n: 1 }], [{ k: 'dmg', n: 3 }, { k: 'next', only: ['blue', 'yellow'] }]],
    'MON-20': [[{ k: 'dmg', n: 2 }, { k: 'next', randomFirst: true }], [{ k: 'dmg', n: 3 }, { k: 'next', noShield: true }],
        [{ k: 'dmg', n: 3 }, { k: 'next', needYellow: 3 }], [{ k: 'dmg', n: 3 }, { k: 'next', drawFixed: 0 }]],
    'MON-21': [[{ k: 'dmg', n: 3 }, { k: 'gold', n: 2 }], [{ k: 'dmg', n: 2 }, { k: 'elixir', n: 1, elseDmg: 4 }],
        [{ k: 'dmg', n: 3 }, { k: 'next', maxCombo: 2 }], [{ k: 'dmg', n: 2 }, { k: 'whole', defLess: 2 }]],
    'MON-22': [[{ k: 'dmg', n: 2 }, { k: 'next', dmgCap: 1 }], [{ k: 'shieldDown', n: 2 }, { k: 'poolDiscard', n: 2 }],
        [{ k: 'poolDiscard', n: 'shield' }, { k: 'shield0' }], [{ k: 'dmg', n: 3 }, { k: 'poolDeck', n: 2 }]],
    'MON-24': [[{ k: 'dmg', n: 1 }, { k: 'gold', n: 4 }], [{ k: 'combo3', elseDmg: 4 }],
        [{ k: 'dmg', n: 3 }, { k: 'handToTop', n: 2 }], [{ k: 'dmg', n: 3 }, { k: 'handToTop', n: 4 }]],
    'MON-23': [[{ k: 'randCorner' }], [{ k: 'dmgVulnLess', base: 5 }],
        [{ k: 'dmg', n: 1 }, { k: 'highCost' }], [{ k: 'dmg', n: 1 }, { k: 'lookRemove' }]],
    'MON-26': [[{ k: 'dmg', n: 2 }, { k: 'allColors', colors: ['green', 'yellow'] }], [{ k: 'deckBottom', n: 3 }],
        [{ k: 'dmg', n: 4 }, { k: 'next', noLinks: true }], [{ k: 'dmg', n: 5 }, { k: 'next', noLinks: true }]],
    'MON-25': [[{ k: 'dmg', n: 3 }, { k: 'next', combatLess: 1 }], [{ k: 'dmgHand' }, { k: 'halfHand', round: 'down' }],
        [{ k: 'dmgHand' }, { k: 'halfHand', round: 'up' }], [{ k: 'randHand', byElixirs: true }]],
    'MON-27': [[{ k: 'color', colors: Y, else: [{ k: 'dmg', n: 5 }, { k: 'skip' }] }], [{ k: 'dmg', n: 4 }, { k: 'next', noShield: true }],
        [{ k: 'shield0' }, { k: 'handDisc', n: 2, orDeck: true }], [{ k: 'dmg', n: 5 }, { k: 'next', drawLess: 2 }]],
    'MON-28': [[{ k: 'elixirCut' }], [{ k: 'deckTop', n: 4, orHand: 'any' }],
        [{ k: 'dmg', n: 3 }, { k: 'next', maxCombo: 1 }], [{ k: 'skip' }, { k: 'color', colors: G, else: [{ k: 'dmg', n: 4 }] }]],
    'MON-30': [[{ k: 'dmg', n: 2 }, { k: 'next', noShield: true }], [{ k: 'dmg', n: 2 }, { k: 'next', deckFirst: true }],
        [{ k: 'dmg', n: 4 }, { k: 'next', drawCap: 1 }], [{ k: 'shield0' }, { k: 'randHand', n: 2, orDeck: true }]],
};

// Discard abilities (the card with the crumbling monster head): what happens when a special card
// leaves the life pool because of the witcher's damage. The engine switches on the monster id
// (engine/vuln.mjs, discardAbility); `ignore` = the monster ignores the subsequent damage this turn.
export const DISCARD = {
    'MON-01': { next: { firstMin2: true } },
    'MON-02': { harpy: true },
    'MON-03': { ignore: 1 },
    'MON-04': { noPurpleTop: true },
    'MON-05': { nextM: { chooseType: true } },
    'MON-06': { ignore: 2, unless: ['purple'] },
    'MON-07': { drawLess: 2 },
    'MON-08': { poolBottom: 1 },
    'MON-09': { ignore: 2, unless: ['purple', 'red'] },
    'MON-10': { mostLinks: true },
    'MON-11': { color: ['purple', 'yellow'] },
    'MON-12': { ignore: 'half' },
    'MON-15': { dmgDice: 1 },
    'MON-14': { bruxa: true },
    'MON-13': { ignore: 'all', takeBack: true },
    'MON-16': { elixir: 1 },
    'MON-17': { ignore: 2 },
    'MON-18': { lowerSkill: true },
    'MON-19': { noDrawFx: true },
    'MON-20': { red: true },
    'MON-21': { ignore: 1, next: { firstColor: ['blue'], orOne: true } },
    'MON-22': { ignore: 'all', unless: ['purple'], takeBack: true },
    'MON-24': { nextM: { chooseType: true } },
    'MON-23': { cheapest: true },
    'MON-26': { nextM: { plus: 2 } },
    'MON-25': { afterCombo: true },
    'MON-27': { ignore: 'all', elixirs: 2, resetAlchemy: true },
    'MON-28': { ignore: 2, unless: ['red'] },
    'MON-30': { poolPick: true },
};

/** Short texts of the active next-turn restrictions (fight HUD). */
export const NEXT_TEXT = {
    skip: () => 'пропуск хода',
    maxCombo: (n) => n === 1 ? 'комбинация только из 1 карты' : `комбинация не больше чем из ${n} карт`,
    drawLess: (n) => `в конце хода −${n} карт(ы)`,
    drawCap: (n) => `в конце хода не больше ${n} карты`,
    drawFixed: (n) => `в конце хода ${n} карт`,
    ignoreDmg: (n) => `первые ${n} урона игнорируются`,
    noShield: () => 'символы щита игнорируются',
    noLinks: () => 'эффекты связей игнорируются',
    onlyLinks: () => 'работают только эффекты связей',
    noDmg: () => 'символы урона игнорируются',
    noDrawFx: () => 'эффекты добора карт игнорируются',
    ban: (c) => `нельзя: ${c.map(x => COLOR_WORD[x]).join(', ')}`,
    only: (c) => `только: ${c.map(x => COLOR_WORD[x]).join(' и ')}`,
    firstMin2: () => 'первая карта — с уроном 2+ (без связей)',
    firstColor: (c, o) => `первая карта: ${c.map(x => COLOR_WORD[x]).join(' или ')}${o.orOne ? ' — либо комбинация из 1 карты' : ''}`,
    colorLess: (c) => `${c.map(x => COLOR_WORD[x]).join(' и ')}: −1 урон за карту`,
    needYellow: (n) => `без жёлтой карты урон −${n}`,
    dmgCap: (n) => `комбинация наносит не больше ${n} урона`,
    shieldPerCard: () => 'после комбинации щит −1 за карту',
    combatLess: (n) => `навык сражения −${n}`,
    randomFirst: () => 'первая карта — случайная из руки',
    deckFirst: () => 'первая карта — верхняя из колоды',
};
export const COLOR_WORD = { blue: 'синие', red: 'красные', green: 'зелёные', purple: 'фиолетовые', yellow: 'жёлтые' };
export function nextText(r) {
    if (!r) return [];
    return Object.entries(r).filter(([k, v]) => NEXT_TEXT[k] && v !== false && v != null).map(([k, v]) => NEXT_TEXT[k](v, r));
}
