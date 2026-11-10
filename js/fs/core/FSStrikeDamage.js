// FSStrikeDamage.js — the damage of an orbital strike, as one object.
//
// «The defender chooses which of his units take the hits.» A strike does not
// end with the order that fired it: the hits stay in the state (`state.strike`)
// until the defender has picked his models, and the game waits for him. The
// record had six fields (`seat`, `system`, `pos`, `left`, `hits`, `attacker`,
// plus the first victim and the damaged ones) and three layers read them by
// hand: the rules counted the hits down, the panel drew the struck area, the
// board picked a unit from it.
//
// One question now: `StrikeDamage.of(state)` — `pending`, `waiting(seat)`,
// `aimedAt(system, pos)`, `take(unitId)` and `spent()`. The record stays in
// `state.strike` with the same fields, so a save and the network read it as
// they did.

class StrikeDamage {
    /** @param {any} state the game state (the record lives on it) */
    constructor(state) {
        this.state = state || {};
    }

    /** The damage of a strike; null when there is no state at all. */
    static of(state) {
        if (!state) return null;
        let damage = StrikeDamage.cache.get(state);
        if (!damage) {
            damage = new StrikeDamage(state);
            StrikeDamage.cache.set(state, damage);
        }
        return damage;
    }

    /** The record itself, or null when no strike waits for its damage. */
    get record() {
        return this.state.strike || null;
    }

    /** Is a strike waiting for the defender to take the hits? */
    get pending() {
        return !!this.state.strike;
    }

    /** Does this seat take the damage now? */
    waiting(seat) {
        const strike = this.record;
        return !!strike && strike.seat === seat;
    }

    /** The seat that fired the strike. */
    get attacker() {
        const strike = this.record;
        return strike ? strike.attacker : null;
    }

    /** The system and the area the hits fall on. */
    get system() {
        const strike = this.record;
        return strike ? strike.system : null;
    }

    get pos() {
        const strike = this.record;
        return strike ? strike.pos : null;
    }

    /** Is this the area the hits fall on? */
    aimedAt(systemId, pos) {
        const strike = this.record;
        return !!strike && strike.system === systemId && strike.pos === pos;
    }

    /** How many hits are not taken yet, out of how many were dealt. */
    get left() {
        const strike = this.record;
        return strike ? strike.left : 0;
    }

    get hits() {
        const strike = this.record;
        return strike ? strike.hits : 0;
    }

    /** The unit that «Набег жнецов» says has to take the damage first. */
    get first() {
        const strike = this.record;
        return strike ? strike.first || null : null;
    }

    /** Is the damage still at its first hit? (the first victim rule) */
    get untouched() {
        return this.left === this.hits;
    }

    /** The units that already took damage. */
    get damaged() {
        const strike = this.record;
        return strike && Array.isArray(strike.damaged) ? strike.damaged : [];
    }

    /** A strike begins: the hits wait for the defender. */
    begin({ seat, system, pos, hits, attacker, first }) {
        this.state.strike = {
            seat, system, pos,
            left: hits, hits, attacker,
            first: first === undefined ? null : first,
        };
        return this;
    }

    /** A unit of the defender takes a hit (or several, if it dies). */
    take(unitId, amount) {
        const strike = this.record;
        if (!strike) return this;
        if (!strike.damaged) strike.damaged = [];
        strike.damaged.push(unitId);
        strike.left = Math.max(0, strike.left - (amount === undefined ? 1 : amount));
        return this;
    }

    /** The damage is spent: nothing waits on the state any more. */
    get spent() {
        return !this.pending || this.left <= 0;
    }

    /** The strike is over — the record leaves the state. */
    end() {
        const strike = this.record;
        this.state.strike = null;
        return strike;
    }
}

/** One strike per state, like one order at a time. */
StrikeDamage.cache = new WeakMap();
