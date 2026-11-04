// DLC definitions and rule primitives. The expansion packs are available for playtesting;
// see docs/NEMESIS_DLC_STATUS.md for agreed adaptations and remaining validation.
import { shuffle } from './rng.mjs';
import { CHYTRID_TOKEN_VALUES } from './data/chytrids.mjs';

export const ENEMY_SETS = Object.freeze({
    redux: Object.freeze({ name: 'Чужие Redux', playable: true }),
    carnomorphs: Object.freeze({ name: 'Карноморфы', playable: true }),
    voidseeders: Object.freeze({ name: 'Кошмары', playable: true }),
    chytrids: Object.freeze({ name: 'Хитриды', playable: true }),
});

export function playableEnemySet(id) {
    return Object.hasOwn(ENEMY_SETS, id) && ENEMY_SETS[id].playable;
}

// The supplied token inventory supersedes the Voidseeders PDF's total of sixteen.
export const VOIDSEEDER_TOKENS = Object.freeze([1, 1, 1, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4]);

/** Set up the two expansion bags. The shuffled remainder is kept as a separate supply. */
export function initialExpansionBag(id, playerIds, rng) {
    if (!Array.isArray(playerIds) || playerIds.length < 1 || playerIds.length > 5 || new Set(playerIds).size !== playerIds.length) {
        throw new RangeError('Expected one to five distinct players');
    }
    if (id === 'carnomorphs') {
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
