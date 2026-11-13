// FSOrderTally.js — what an order of domination and of the faction produced, as
// one object.
//
// The dominate order hands the player the assets of his friendly worlds and the
// tokens of prosperity, and it ends when the ability of the faction is resolved
// (or when it turns out to be impossible). The rules kept that in plain fields of
// the order (`order.gained`, `order.prosperity`, `order.ability`,
// `order.finishAfterEffect`, `order.chaosDeckBonus`, `order.chaosCombatMorale`,
// `order.combatReinforce`) and every reader picked what it needed.
//
// The object is a read/write VIEW of those fields: the state stays serialisable.

class OrderTally {
    /** @param {any} order the order being resolved (the fields live on it) */
    constructor(order) {
        this.order = order || {};
    }

    /** The tally of an order; null when there is no order at all. */
    static of(order) {
        if (!order) return null;
        let tally = OrderTally.cache.get(order);
        if (!tally) {
            tally = new OrderTally(order);
            OrderTally.cache.set(order, tally);
        }
        return tally;
    }

    // --- what the dominate order gave ----------------------------------------

    /** The assets the order has just granted, as they are printed in the panel. */
    get gained() {
        return this.order.gained || [];
    }

    setGained(list) {
        this.order.gained = list || [];
        return this.order.gained;
    }

    /** The tokens of prosperity the player has still to choose for. */
    get prosperity() {
        return this.order.prosperity || 0;
    }

    addProsperity(n) {
        this.order.prosperity = this.prosperity + (n || 0);
        return this.prosperity;
    }

    /** One token was taken for an asset chosen by the player. */
    spendProsperity() {
        this.order.prosperity = Math.max(0, this.prosperity - 1);
        return this.prosperity;
    }

    clearProsperity() {
        this.order.prosperity = 0;
        return this;
    }

    /** The ability of the faction, printed in the panel of the order. */
    get ability() {
        return this.order.ability || null;
    }

    setAbility(text) {
        this.order.ability = text || null;
        return this;
    }

    /** The Mechanicus factory moved by this order, for its follow-up upgrade. */
    get movedFactory() {
        return this.order.movedFactory || null;
    }

    setMovedFactory(structure) {
        this.order.movedFactory = { id: structure.id, system: structure.system, pos: structure.area };
        return this;
    }

    /** The optional faction ability cannot be repeated in the same order. */
    get abilityResolved() {
        return !!this.order.abilityResolved;
    }

    resolveAbility() {
        this.order.abilityResolved = true;
        return this;
    }

    /** «The order is over when the effect of the ability is done». */
    get finishesAfterEffect() {
        return !!this.order.finishAfterEffect;
    }

    setFinishesAfterEffect(on) {
        this.order.finishAfterEffect = on !== false;
        return this;
    }

    /** The effect of the ability is done (or was refused): the flag is spent. */
    finishAfterEffect() {
        this.order.finishAfterEffect = false;
        return this;
    }

    // --- what a chaos card lends to the order --------------------------------

    /** «ещё N карт из колоды стратегии» («Хаос»). */
    get chaosDeckBonus() {
        return this.order.chaosDeckBonus || 0;
    }

    addChaosDeckBonus(n) {
        this.order.chaosDeckBonus = this.chaosDeckBonus + (n || 1);
        return this;
    }

    /** «N кубиков морали в начале боя» от карты хаоса. */
    get chaosCombatMorale() {
        return this.order.chaosCombatMorale || 0;
    }

    addChaosCombatMorale(n) {
        this.order.chaosCombatMorale = this.chaosCombatMorale + (n || 1);
        return this;
    }

    /** The dice of the card are given to the battle once: they are spent. */
    takeChaosCombatMorale() {
        const n = this.chaosCombatMorale;
        this.order.chaosCombatMorale = 0;
        return n;
    }

    // --- the reinforcement the order promised to its battle -------------------

    /** «… вы можете разместить 1 бесплатный жетон подкрепления»: it waits for the battle. */
    get promisedReinforce() {
        return this.order.combatReinforce || null;
    }

    setPromisedReinforce(n, free) {
        this.order.combatReinforce = { n: n || 1, free: !!free };
        return this.order.combatReinforce;
    }

    /** The battle takes the promise once. */
    takePromisedReinforce() {
        const promised = this.promisedReinforce;
        this.order.combatReinforce = null;
        return promised;
    }
}

/** One tally per order, like one board per state. */
OrderTally.cache = new WeakMap();
