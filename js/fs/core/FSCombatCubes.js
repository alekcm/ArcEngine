// FSCombatCubes.js — the battle cubes the cards give: `att.` and `def.` per side.
//
// Beside the dice on the table and the reinforcement tokens, a battle counts the
// cubes a card gives: «получите 2 `att. token`», «потеряйте 1 `def. token`». They
// are two numbers per side, and every layer wrote them by hand — `+=` in a card,
// `Math.max(0, … - n)` when they were taken away, a fresh `{att, def}` when the
// round ended, and `|| 0` everywhere for the side that had none. The defence
// cube asked a field that could be missing, and the panel and the board kept
// their own copies of the same lookup.
//
// One question now: `CombatCubes.of(combat).add(side, 'att', 2)`. The counts
// still live in `combat.tokens` — the state stays serialisable — but the two
// sides and the two kinds exist from the first question on, so nobody guesses
// whether the field is there.

class CombatCubes {
    /** @param {any} combat the battle (the counts live on it) */
    constructor(combat) {
        this.combat = combat || {};
    }

    /** The cubes of a battle; null when there is no battle at all. */
    static of(combat) {
        if (!combat) return null;
        let cubes = CombatCubes.cache.get(combat);
        if (!cubes) {
            cubes = new CombatCubes(combat);
            CombatCubes.cache.set(combat, cubes);
        }
        return cubes;
    }

    /** The cubes of one side: `{ att, def }`, always both kinds. */
    cubes(side) {
        if (!this.combat.tokens) this.combat.tokens = {};
        const one = this.combat.tokens[side];
        if (!one) return (this.combat.tokens[side] = { att: 0, def: 0 });
        if (one.att === undefined) one.att = 0;
        if (one.def === undefined) one.def = 0;
        return one;
    }

    /** How many cubes of a kind the side has: 0 for a side that is not in the battle. */
    get(side, kind) {
        if (!side) return 0;
        const one = (this.combat.tokens || {})[side];
        return (one && one[kind === 'def' ? 'def' : 'att']) || 0;
    }

    /** The cubes of a side as the panel and the board ask for them. */
    values(side) {
        return this.cubes(side);
    }

    /** The cubes of both sides, as a fresh record. */
    both() {
        return { attacker: this.values('attacker'), defender: this.values('defender') };
    }

    /** A card gives cubes: the count never goes below zero. */
    add(side, kind, n) {
        const one = this.cubes(side);
        const key = kind === 'def' ? 'def' : 'att';
        if (Number(n) > 0 && CombatBans.of(this.combat).forbidsTokenGain(side, key)) return one[key];
        one[key] = Math.max(0, (one[key] || 0) + (Number(n) || 0));
        // «каждый раз во время всего этого боя, когда противник получает `att.
        // token` или `def. token`, вы также получаете столько же» («Рокобойз»):
        // the gain of one side is the gain of the other, for the whole battle.
        const other = side === 'attacker' ? 'defender' : 'attacker';
        if (Number(n) > 0 && this.mirrors(other) && !this.mirroring) {
            this.mirroring = true;
            try { this.add(other, key, Number(n)); } finally { this.mirroring = false; }
        }
        return one[key];
    }

    /** Does this side take a copy of every cube the other side gains? */
    mirrors(side) {
        return !!(this.combat.mirrorTokens && this.combat.mirrorTokens[side]);
    }

    /** From now on the side gains what the other side gains (the whole battle). */
    setMirror(side) {
        if (!this.combat.mirrorTokens) this.combat.mirrorTokens = {};
        this.combat.mirrorTokens[side] = true;
        return this;
    }

    /** Cubes are spent or taken by the foe: the count never goes below zero. */
    take(side, kind, n) {
        return this.add(side, kind, -(Number(n) || 0));
    }

    /**
     * The round is over and the cubes go back to the supply — a card may keep the
     * kinds it names for the round it was played in.
     */
    reset(keep) {
        const kept = keep || {};
        const of = side => ({
            att: (kept[side] && kept[side].att) || 0,
            def: (kept[side] && kept[side].def) || 0,
        });
        this.combat.tokens = { attacker: of('attacker'), defender: of('defender') };
        return this;
    }
}

/** One set of cubes per battle, like one set of tokens. */
CombatCubes.cache = new WeakMap();
