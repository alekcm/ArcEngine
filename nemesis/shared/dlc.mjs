// DLC definitions and rule primitives. See docs/NEMESIS_DLC_STATUS.md for agreed adaptations.
import { shuffle } from './rng.mjs';
import { CHYTRID_TOKEN_VALUES } from './data/chytrids.mjs';
import { RX_CARNOMORPH_TOKENS } from './data/carnomorphs-redux.mjs';

// Two rulesets share this table. «Redux» is the revised game: its own intruders and none of the
// expansions. «Original» is the 2018 game: its own five intruders plus every expansion, each played
// exactly as its own rulebook prints it (those books were written against the original rules).
export const RULES_MODES = Object.freeze({
    original: Object.freeze({ id: 'original', name: 'Оригинальные правила', expansions: true }),
    redux: Object.freeze({ id: 'redux', name: 'Правила Redux', expansions: false }),
});

export const ENEMY_SETS = Object.freeze({
    // The base intruder set is one id with two rulebooks: the Redux intruders under the Redux rules,
    // and the original five under the original rules.
    redux: Object.freeze({ name: 'Чужие Redux', nameOriginal: 'Чужие (оригинальные)', playable: true, rules: ['redux', 'original'] }),
    carnomorphs: Object.freeze({ name: 'Карноморфы', nameRedux: 'Карноморфы Redux', playable: true, rules: ['original'] }),
    // The Redux variant is a separate lobby choice but uses the Carnomorph engine under the hood;
    // createGame() stores it as `carnomorphs` with `rules: 'redux'`.
    carnomorphsRedux: Object.freeze({ name: 'Карноморфы Redux', playable: true, rules: ['redux'] }),
    voidseeders: Object.freeze({ name: 'Кошмары', playable: true, rules: ['original'] }),
    chytrids: Object.freeze({ name: 'Хитриды', playable: true, rules: ['original'] }),
});

export function playableEnemySet(id) {
    return Object.hasOwn(ENEMY_SETS, id) && ENEMY_SETS[id].playable;
}

/** Lobby id -> id stored in the game. Both Carnomorph variants share the same engine state. */
export function normalizeEnemySet(id) { return id === 'carnomorphsRedux' ? 'carnomorphs' : id; }
export function isReduxCarnomorphs(state) {
    // `createGame` sets this marker; server save loading restores it for older Redux Carnomorph
    // games. A plain Redux game whose enemySet was changed by an engine fixture must not silently
    // become a Redux Carnomorph game.
    return !!state && state.carnomorphRedux === true;
}

export function validRulesMode(id) { return Object.hasOwn(RULES_MODES, id); }

/** Normalise whatever the lobby sent; anything unknown falls back to the Redux rules. */
export function rulesModeOf(id) { return validRulesMode(id) ? id : 'redux'; }

/** True when this enemy set may be played under these rules. */
export function enemySetAllowed(enemySet, rules) {
    const set = ENEMY_SETS[enemySet];
    if (!set || !set.playable) return false;
    // Saved Redux Carnomorph games store the internal `carnomorphs` id; the lobby offers the
    // separate `carnomorphsRedux` id, which createGame() normalises to the same state.
    if (enemySet === 'carnomorphs' && rulesModeOf(rules) === 'redux') return true;
    return set.rules.includes(rulesModeOf(rules));
}

/** Enemy sets offered in the lobby for a ruleset, in display order. */
export function enemySetsFor(rules) {
    const mode = rulesModeOf(rules);
    return Object.keys(ENEMY_SETS).filter(id => ENEMY_SETS[id].rules.includes(mode));
}

/** Lobby id for a stored game; Redux Carnomorphs are stored under the classic engine id. */
export function lobbyEnemySetId(enemySet, rules) {
    return enemySet === 'carnomorphs' && rulesModeOf(rules) === 'redux' ? 'carnomorphsRedux' : enemySet;
}

/** Display name of an enemy set under the given ruleset. */
export function enemySetName(id, rules) {
    const set = ENEMY_SETS[id];
    if (!set) return id;
    const mode = rulesModeOf(rules);
    if (mode === 'original') return set.nameOriginal || set.name;
    return set.nameRedux || set.name;
}

// The supplied token inventory supersedes the Voidseeders PDF's total of sixteen.
export const VOIDSEEDER_TOKENS = Object.freeze([1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4]);

/** Set up an expansion bag. The shuffled remainder is kept as a separate physical supply. */
export function initialExpansionBag(id, playerIds, rng, rules = 'original') {
    if (!Array.isArray(playerIds) || playerIds.length < 1 || playerIds.length > 5 || new Set(playerIds).size !== playerIds.length) {
        throw new RangeError('Expected one to five distinct players');
    }
    if (id === 'carnomorphs') {
        if (rulesModeOf(rules) === 'redux') {
            // Redux bag: 1 Blank, 5 Metagorgers and 5 + one per player adult Carnomorphs, all drawn
            // at random from the physical supply listed in «Количество карт в колоде.txt».
            const supply = shuffle(rng, Object.entries(RX_CARNOMORPH_TOKENS).flatMap(([type, values]) =>
                values.map((value, index) => ({ id: 'rx-' + type + '-' + value + '-' + index, type, value }))));
            const metagorgers = supply.filter(t => t.type === 'metagorger');
            const adults = supply.filter(t => t.type !== 'metagorger');
            const take = (pool, n) => pool.splice(0, n);
            const bag = shuffle(rng, ['blank', ...take(metagorgers, 5), ...take(adults, 5 + playerIds.length)]);
            return { bag, supply: [...metagorgers, ...adults] };
        }
        const make = (type, values) => values.map((value, index) => ({ id: type + '-' + index, type, value }));
        const red = shuffle(rng, make('redMetagorger', [2, 2, 2, 2, 3, 3, 3, 3]));
        const bag = ['blank', ...make('blueMetagorger', [1, 1]), ...red.splice(0, 2 + playerIds.length)];
        const supply = [...red, ...make('shambler', [2, 2, 2, 2, 3, 3, 3, 3, 3, 4, 4, 4]),
            ...make('breeder', [3, 4, 4]), ...make('butcher', [4])];
        return { bag, supply };
    }
    if (id === 'voidseeders') {
        const supply = shuffle(rng, VOIDSEEDER_TOKENS.map((value, index) => ({ id: 'nightmare-' + index, value })));
        const bag = ['blank', ...supply.splice(0, 2 + playerIds.length), ...playerIds.map(player => ({ madness: player }))];
        return { bag, supply };
    }
    if (id === 'chytrids') {
        const bag = ['blank'];
        for (const [type, values] of Object.entries(CHYTRID_TOKEN_VALUES)) values.forEach((value, index) => bag.push({ id: type + '-' + index, type, value }));
        return { bag: shuffle(rng, bag), supply: [] };
    }
    throw new RangeError('No expansion bag definition for ' + id);
}

/** Apply a change on the Voidseeders madness track; death only occurs above level 5. */
export function changeMadness(level, delta) {
    if (!Number.isInteger(level) || level < 1 || level > 5 || !Number.isInteger(delta)) throw new RangeError('Invalid madness change');
    if (delta > 0) return { level: Math.min(5, level + delta), dead: level + delta > 5 };
    const floor = level >= 3 ? 3 : 1;
    return { level: Math.max(floor, level + delta), dead: false };
}

/** One mutation marker: the first award grants a card instead; the fourth marker kills. */
export function gainMutation(hasCard, markers) {
    if (typeof hasCard !== 'boolean' || !Number.isInteger(markers) || markers < 0 || markers > 3) throw new RangeError('Invalid mutation state');
    if (!hasCard) return { hasCard: true, markers, gainedCard: true, dead: false };
    const count = markers + 1;
    return { hasCard: true, markers: count, gainedCard: false, dead: count >= 4 };
}
