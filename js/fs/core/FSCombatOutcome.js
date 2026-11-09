// FSCombatOutcome.js — how a battle ended: who won, with what morale, and who
// leaves.
//
// The resolution of a battle writes three fields of `state.combat` — `winner`
// (the side), `loser` (the seat that retreats) and `morale` (both values that
// decided it) — and the rest of the game asks them one by one: the panel checks
// `c.loser !== me` before it offers a retreat, the rules check the same seat
// again in `combatRetreat`, and the player of the winner is found through a
// ternary on the side name. The name of the side and the seat behind it were
// translated in each place.
//
// One question now: `CombatOutcome.of(combat).loserSeat` and `.wonBy(seat)`.
// The fields stay on the battle — the state remains serialisable — but «этот
// игрок проиграл?» is asked once.

class CombatOutcome {
    /** @param {any} combat the battle (the outcome lives on it) */
    constructor(combat) {
        this.combat = combat || {};
    }

    /** The outcome of a battle; null when there is no battle at all. */
    static of(combat) {
        if (!combat) return null;
        let outcome = CombatOutcome.cache.get(combat);
        if (!outcome) {
            outcome = new CombatOutcome(combat);
            CombatOutcome.cache.set(combat, outcome);
        }
        return outcome;
    }

    /** Has the battle been decided? */
    get decided() {
        return !!this.combat.winner;
    }

    /** The side that won: «attacker», «defender» or null while the battle goes on. */
    get winner() {
        return this.combat.winner || null;
    }

    /** The morale both sides had when the battle was decided. */
    get morale() {
        return this.combat.morale || null;
    }

    /** The seat that won, or null. */
    get winnerSeat() {
        return this.winner ? CombatSides.seatOf(this.combat, this.winner) : null;
    }

    /** The seat that lost and has to retreat, or null. */
    get loserSeat() {
        const seat = this.combat.loser;
        return seat === undefined ? null : seat;
    }

    /** Did this seat lose the battle? */
    lostBy(seat) {
        return this.loserSeat !== null && this.loserSeat === seat;
    }

    /** The battle is decided: who won, who leaves and with what morale. */
    decide(winner, morale) {
        const side = winner === 'defender' ? 'defender' : 'attacker';
        this.combat.winner = side;
        if (morale) this.combat.morale = { attacker: morale.attacker || 0, defender: morale.defender || 0 };
        this.combat.loser = CombatSides.seatOf(this.combat, CombatSides.foe(side));
        return this;
    }

    /** The battle was cancelled before it was decided: nobody won. */
    clear() {
        this.combat.winner = null;
        this.combat.loser = null;
        this.combat.morale = null;
        return this;
    }
}

/** One outcome per battle, like one turn per battle. */
CombatOutcome.cache = new WeakMap();
