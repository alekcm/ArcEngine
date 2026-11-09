// FSCombatApproach.js — where the attacker came from, and how.
//
// The retreat of an attacker is judged by the areas its units came from and by
// the order it used to arrive: «If the units did not move into the contested
// area via an Advance Order, they must move to an area that at least one unit
// moved from to start the combat.» Two fields of `state.combat` keep that —
// `attackerFrom` (the list of areas) and `viaAdvance` (the flag) — and the
// retreat rules asked both of them by hand, with their own `|| []`.
//
// One question now: `CombatApproach.of(combat).cameFrom(systemId, pos)` and
// `.freeToReturn()`. The fields stay on the battle, so a saved game keeps them.

class CombatApproach {
    /** @param {any} combat the battle (the fields live on it) */
    constructor(combat) {
        this.combat = combat || {};
    }

    /** How the attacker arrived; null when there is no battle at all. */
    static of(combat) {
        if (!combat) return null;
        let approach = CombatApproach.cache.get(combat);
        if (!approach) {
            approach = new CombatApproach(combat);
            CombatApproach.cache.set(combat, approach);
        }
        return approach;
    }

    /** The areas the attacking units moved from when the battle began. */
    get from() {
        return this.combat.attackerFrom || (this.combat.attackerFrom = []);
    }

    /** Did the units arrive with an Advance Order? Then they may go anywhere. */
    get viaAdvance() {
        return !!this.combat.viaAdvance;
    }

    /** The battle remembers how the attacker came. */
    set(origins, viaAdvance) {
        this.combat.attackerFrom = (origins || []).map(x => ({ system: x.system, pos: x.pos }));
        this.combat.viaAdvance = !!viaAdvance;
        return this;
    }

    /** Did any attacking unit come from this system? */
    fromSystem(systemId) {
        return this.from.some(x => x.system === systemId);
    }

    /** Did an attacking unit come from this very area? */
    fromArea(systemId, pos) {
        return this.from.some(x => x.system === systemId && x.pos === pos);
    }

    /** The attacker may retreat anywhere: it came with an Advance Order. */
    freeToReturn() {
        return this.viaAdvance;
    }
}

/** One arrival per battle, like one turn per battle. */
CombatApproach.cache = new WeakMap();
