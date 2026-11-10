// FSChance.js — the dice and the ids of a game, as one object.
//
// The engine never throws a dice: it walks a seeded generator, so the same seed
// gives the same campaign, and the audit and the smoke test can replay a whole
// round. That walk lived in two numbers of the state (`state.rng` for the
// generator and `state.uid` for the counter of ids) and in four methods of the
// rules — `rng`, `rand`, `shuffle`, `uid` — that every other rule called through
// the facade. Nobody could tell which of them changed the state.
//
// One question now: `Chance.of(state)` — `float()`, `below(n)`, `shuffle(a)`,
// `pick(a)`, `roll(n)` (the facing dice) and `id(prefix)`. The two numbers stay
// in the state, so a save with a seed replays as it did.

class Chance {
    /** @param {any} state the game state (the two numbers live on it) */
    constructor(state) {
        this.state = state || {};
    }

    /** The dice of a game; null when there is no state at all. */
    static of(state) {
        if (!state) return null;
        let chance = Chance.cache.get(state);
        if (!chance) {
            chance = new Chance(state);
            Chance.cache.set(state, chance);
        }
        return chance;
    }

    /** The facings of a combat dice: attack, defence, morale. */
    static FACES = ['att', 'def', 'morale'];

    /** The next number of the generator, in [0, 1). */
    float() {
        this.state.rng = (this.state.rng + 0x6D2B79F5) | 0;
        let t = this.state.rng;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    /** A whole number below `n`. */
    below(n) {
        return Math.floor(this.float() * n);
    }

    /** A copy of the list in a new order (the deck is not touched). */
    shuffle(arr) {
        const a = (arr || []).slice();
        for (let i = a.length - 1; i > 0; i--) {
            const j = this.below(i + 1);
            const t = a[i]; a[i] = a[j]; a[j] = t;
        }
        return a;
    }

    /** One element of the list, or null on an empty list. */
    pick(arr) {
        if (!arr || !arr.length) return null;
        return arr[this.below(arr.length)];
    }

    /** The dice of a combat: `n` facings. */
    roll(n) {
        const out = [];
        for (let i = 0; i < n; i++) out.push(Chance.FACES[this.below(Chance.FACES.length)]);
        return out;
    }

    /** The next id of the game: `obj12`, `unit7`. */
    id(prefix) {
        this.state.uid = (this.state.uid || 0) + 1;
        return prefix + this.state.uid;
    }

    /** The seed as it stands: a save that keeps it replays the same game. */
    get seed() {
        return this.state.rng;
    }

    /** The last id given out. */
    get lastId() {
        return this.state.uid || 0;
    }
}

/** One generator per state, like one dice per table. */
Chance.cache = new WeakMap();
