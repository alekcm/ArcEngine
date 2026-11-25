// surprise.mjs — one place for «did the drawn token attack us?».
//
// Every pack resolves the surprise attack the same way (base Redux, Carnomorphs, Voidseeders,
// Chytrids): the intruder attacks right away when the Character holds fewer cards than the number
// on the token. The expansions only tune that number (Swift Strikes +1, Danger Sense −1,
// Acceleration +1, Reaction to Danger −1, Heightened Readiness −1). Keeping the wording in one
// helper makes the journal read the same for all four packs instead of four dialects.
import { log, next, pname } from './core.mjs';
import { INTRUDER_NAMES } from '../data/cards.mjs';

/** One wording for every surprise attack in the game (base pack and all three DLC).
 *
 *  The printed rule is a single comparison: the intruder attacks right away when the Character
 *  holds fewer cards than the number on the drawn token.  Every expansion only tunes that number
 *  (Swift Strikes +1, Danger Sense −1, Acceleration +1, Reaction to Danger −1, Heightened
 *  Readiness −1), so the table should read the same compact sentence everywhere:
 *    «Внезапная атака: Мясник нападает на Анну — карт в руке 0 < 4.»
 *  The old per-pack phrasing («Внезапная атака кошмара: карт 0 < 1.») said which pack rolled it,
 *  which the table already knew from the token, and never named the attacker.
 */
export function surpriseAttack(state, it, p, threshold, opts = {}) {
    if (!it || !p || p.status !== 'active' || p.pod) return false;
    const value = Math.max(1, threshold);
    const shapeshift = state.carnomorphRedux && p.mutationCard === 'shapeshift';
    const cards = p.hand.length + (shapeshift ? 2 : 0);
    const name = INTRUDER_NAMES[it.type] || it.type;
    const shown = shapeshift ? p.hand.length + '+2' : String(cards);
    if (cards < value) {
        log(state, 'Внезапная атака: ' + name + ' нападает на ' + pname(p) + ' — карт в руке ' + shown + ' < ' + value + '.', 'combat');
        next(state, { op: 'attack', intruder: it.uid, player: p.id, context: 'surprise' });
        return true;
    }
    log(state, 'Внезапной атаки нет: ' + name + ' не нападает на ' + pname(p) + ' — карт в руке ' + shown + ' ≥ ' + value + '.', 'minor');
    return false;
}

/** The compact line under the bag: who came out and when it strikes first. */
export function encounterLine(name, value, note) {
    return 'Появляется ' + name + (value === undefined ? '' : ' · жетон ' + value) +
        (value === undefined ? '.' : ': внезапная атака, если карт в руке меньше ' + value + '.') +
        (note ? ' ' + note : '');
}
