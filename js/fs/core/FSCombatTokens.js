// FSCombatTokens.js — the reinforcement tokens of a battle, as one object.
//
// A token is placed in the reinforce step and then lives on the table: it may be
// flipped (routed) by damage, destroyed, and counted by the cards. The rules kept
// that in eight parallel fields of the combat (`reinforce`, `reinforceFree`,
// `reinforceFlipped`, `reinforceDestroyed`, `reinforceRouted`, `reinforceUsed`,
// `reinforceHook`, `reinforcePending`) and every reader — the pieces of the
// battle, the damage, the cards, the panel and the view — picked what it needed.
// The counts drifted from the lists, exactly as the purchases of an order did.
//
// The object is a read/write VIEW of those fields: the state stays serialisable.

class CombatTokens {
    /** @param {any} combat the battle (the fields live on it) */
    constructor(combat) {
        this.combat = combat || {};
    }

    /** The tokens of a battle; null when there is no battle at all. */
    static of(combat) {
        if (!combat) return null;
        let tokens = CombatTokens.cache.get(combat);
        if (!tokens) {
            tokens = new CombatTokens(combat);
            CombatTokens.cache.set(combat, tokens);
        }
        return tokens;
    }

    // --- how many stand on the table -----------------------------------------

    /** The tokens of one side: `{ used, routed, destroyed, alive }`. */
    units(side) {
        const used = this.used(side);
        const flipped = this.flipped(side);
        const dead = this.destroyed(side);
        const moved = this.moved(side);
        const routed = flipped.filter(i => i < used && dead.indexOf(i) < 0 && moved.indexOf(i) < 0).length;
        const destroyed = dead.filter(i => i < used).length;
        const elsewhere = moved.filter(i => i < used && dead.indexOf(i) < 0).length;
        return { used, routed, destroyed, alive: Math.max(0, used - routed - destroyed - elsewhere) };
    }

    /** The number of tokens placed by this side. */
    used(side) {
        const all = this.combat.reinforce;
        return (all && all[side]) || 0;
    }

    /** A token arrives — free or paid, both are counted. */
    add(side, n, free) {
        if (!n) return this.used(side);
        if (!this.combat.reinforce) this.combat.reinforce = { attacker: 0, defender: 0 };
        this.combat.reinforce[side] = this.used(side) + n;
        if (free) {
            if (!this.combat.reinforceFree) this.combat.reinforceFree = { attacker: 0, defender: 0 };
            this.combat.reinforceFree[side] = (this.combat.reinforceFree[side] || 0) + n;
        }
        return this.used(side);
    }

    /** Free tokens placed from the common supply (not from the player's assets). */
    get free() {
        return this.combat.reinforceFree || { attacker: 0, defender: 0 };
    }

    // --- the two lists of the tokens -----------------------------------------

    /** The flipped (routed) tokens, by their slot. */
    flipped(side) {
        if (!this.combat.reinforceFlipped) this.combat.reinforceFlipped = {};
        const list = this.combat.reinforceFlipped[side];
        if (list != null) return list;
        // An older state carries only the count: its first N tokens were the
        // flipped ones.
        const routed = this.routed(side);
        const made = [];
        for (let i = 0; i < routed; i++) made.push(i);
        this.combat.reinforceFlipped[side] = made;
        return made;
    }

    /** The tokens that have left the table, by their slot. */
    destroyed(side) {
        if (!this.combat.reinforceDestroyed) this.combat.reinforceDestroyed = { attacker: [], defender: [] };
        return this.combat.reinforceDestroyed[side]
            || (this.combat.reinforceDestroyed[side] = []);
    }

    /** Slots moved out of the battle by an effect, not destroyed or refunded. */
    moved(side) {
        if (!this.combat.reinforceMoved) this.combat.reinforceMoved = { attacker: [], defender: [] };
        return this.combat.reinforceMoved[side] || (this.combat.reinforceMoved[side] = []);
    }

    moveAway(side, index) {
        if (!this.alive(side, index) || this.flipped(side).includes(index)) return false;
        this.moved(side).push(index);
        return true;
    }

    returnToBattle(side, index) {
        const moved = this.moved(side);
        const at = moved.indexOf(index);
        if (at < 0) return false;
        moved.splice(at, 1);
        return true;
    }

    /** The count of the flipped tokens, kept for the states that read it. */
    routed(side) {
        const all = this.combat.reinforceRouted;
        return (all && all[side]) || 0;
    }

    setRouted(side, n) {
        if (!this.combat.reinforceRouted) this.combat.reinforceRouted = { attacker: 0, defender: 0 };
        this.combat.reinforceRouted[side] = n || 0;
        return this.combat.reinforceRouted[side];
    }

    /** Is this slot a token still in the contested area? */
    alive(side, index) {
        if (!Number.isInteger(index) || index < 0 || index >= this.used(side)) return false;
        return this.destroyed(side).indexOf(index) < 0 && this.moved(side).indexOf(index) < 0;
    }

    /** «If a unit suffers damage and is not destroyed, that unit is routed.» */
    route(side, index) {
        if (!this.alive(side, index)) return false;
        const flipped = this.flipped(side);
        if (flipped.indexOf(index) >= 0) return false;
        flipped.push(index);
        this.setRouted(side, flipped.length);
        if (!this.combat.reinforceRoutedRounds) this.combat.reinforceRoutedRounds = {};
        const rounds = this.combat.reinforceRoutedRounds[side] || (this.combat.reinforceRoutedRounds[side] = {});
        rounds[index] = CombatTurn.of(this.combat).round;
        return true;
    }

    /** Older saves have no round record; retain their routed-token behaviour. */
    routedInRound(side, index, round) {
        const rounds = (this.combat.reinforceRoutedRounds || {})[side] || {};
        return rounds[index] === undefined || rounds[index] === round;
    }

    /** The token leaves the table: a destroyed token is not routed any more. */
    destroy(side, index) {
        if (!this.alive(side, index)) return false;
        const dead = this.destroyed(side);
        if (dead.indexOf(index) >= 0) return false;
        dead.push(index);
        const flipped = this.flipped(side);
        const at = flipped.indexOf(index);
        if (at >= 0) flipped.splice(at, 1);
        this.setRouted(side, flipped.length);
        return true;
    }

    /** Return a fallen token to this battle, unrouted, without granting an asset. */
    restoreFallen(side, index) {
        if (!Number.isInteger(index) || index < 0 || index >= this.used(side) || this.moved(side).includes(index)) return false;
        const dead = this.destroyed(side), flipped = this.flipped(side);
        const deadAt = dead.indexOf(index), flippedAt = flipped.indexOf(index);
        if (deadAt < 0 && flippedAt < 0) return false;
        if (deadAt >= 0) dead.splice(deadAt, 1);
        if (flippedAt >= 0) flipped.splice(flippedAt, 1);
        this.setRouted(side, flipped.length);
        return true;
    }

    /** The slot of a token by its id (`reinforce-attacker-2`), or -1. */
    indexOf(side, id) {
        if (typeof id !== 'string' || id.indexOf('reinforce-') !== 0) return -1;
        const parts = id.split('-');
        if (parts.length !== 3 || parts[1] !== side) return -1;
        const i = Number(parts[2]);
        return this.alive(side, i) ? i : -1;
    }

    // --- the counter of the step ---------------------------------------------

    /** How many tokens this side has already paid for in the step. */
    spent(side) {
        const all = this.combat.reinforceUsed;
        return (all && all[side]) || 0;
    }

    setSpent(side, n) {
        if (!this.combat.reinforceUsed) this.combat.reinforceUsed = {};
        this.combat.reinforceUsed[side] = Math.max(0, n || 0);
        return this.combat.reinforceUsed[side];
    }

    /** A returned token gives its place in the step back. */
    returnSpent(side) {
        return this.setSpent(side, this.spent(side) - 1);
    }

    /** «В конце шага призыва подкреплений …» — asked once per side. */
    hookAsked(side) {
        return !!(this.combat.reinforceHook && this.combat.reinforceHook[side]);
    }

    askHook(side) {
        if (!this.combat.reinforceHook) this.combat.reinforceHook = {};
        this.combat.reinforceHook[side] = true;
        return this;
    }

    /** The step waits for the scheme of its end: which side is waiting. */
    get pending() {
        return this.combat.reinforcePending || null;
    }

    setPending(side) {
        this.combat.reinforcePending = side || null;
        return this;
    }

    takePending() {
        const side = this.pending;
        this.combat.reinforcePending = null;
        return side;
    }

    /** Is the reinforce step of this side still empty? (the undo of a march asks) */
    get any() {
        return this.used('attacker') > 0 || this.used('defender') > 0;
    }
}

/** One set of tokens per battle, like one board per state. */
CombatTokens.cache = new WeakMap();
