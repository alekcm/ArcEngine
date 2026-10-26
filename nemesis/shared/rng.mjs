// rng.mjs — deterministic PRNG kept INSIDE the game state (state.rng), so that a snapshot
// restore (undo) also restores the dice: re-rolling after an undo gives the same result.
// mulberry32: tiny, fast, good enough for a board game.

export function seedFromString(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
        h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
        h = (h << 13) | (h >>> 19);
    }
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
}

/** Advance the generator stored in `holder.rng` and return a float in [0, 1). */
export function rand(holder) {
    let t = (holder.rng = (holder.rng + 0x6D2B79F5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Integer in [0, n). */
export function randInt(holder, n) {
    return Math.floor(rand(holder) * n);
}

/** In-place Fisher–Yates shuffle. */
export function shuffle(holder, arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = randInt(holder, i + 1);
        const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
}

export function pick(holder, arr) {
    return arr[randInt(holder, arr.length)];
}
