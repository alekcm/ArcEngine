// FSDeployLimits.js — what an order does to the deploy limit, as one object.
//
// The cards of the turn bend the deployment: a city counts as a factory, a
// bastion too, the limit grows by a number, one more factory is allowed, the
// produced units must stand in the factory world, the capacity of a city world
// grows. The rules kept that in plain fields of the order
// (`order.deployLimitBonus`, `order.extraFactories`, `order.citiesAsFactories`,
// `order.bastionsAsFactories`, `order.factoryOnly`,
// `order.deployInFactoryWorld`, `order.capacityBonus`, `order.capacityMax`,
// `order.capacityBonusOnly`) and every reader picked what it needed.
//
// The object is a read/write VIEW of those fields: the state stays serialisable.

class DeployLimits {
    /** @param {any} order the order being resolved (the fields live on it) */
    constructor(order) {
        this.order = order || {};
    }

    /** The limits of an order; null when there is no order at all. */
    static of(order) {
        if (!order) return null;
        let limits = DeployLimits.cache.get(order);
        if (!limits) {
            limits = new DeployLimits(order);
            DeployLimits.cache.set(order, limits);
        }
        return limits;
    }

    // --- the number of the limit ----------------------------------------------

    /** «предел развёртывания больше на N». */
    get limitBonus() {
        return this.order.deployLimitBonus || 0;
    }

    addLimitBonus(n) {
        this.order.deployLimitBonus = this.limitBonus + (n || 0);
        return this;
    }

    /** «ещё одна фабрика»: a whole extra factory's worth of units. */
    get extraFactories() {
        return this.order.extraFactories || 0;
    }

    addExtraFactories(n) {
        this.order.extraFactories = this.extraFactories + (n || 0);
        return this;
    }

    // --- what counts as a factory ---------------------------------------------

    /** «все свои города в активной системе считаются фабриками». */
    get cities() {
        return !!this.order.citiesAsFactories;
    }

    /** The card may name the only unit the cities may produce. */
    get factoryOnly() {
        return this.order.factoryOnly || null;
    }

    setCitiesAsFactories(only) {
        this.order.citiesAsFactories = true;
        if (only) this.order.factoryOnly = only;
        return this;
    }

    get bastions() {
        return !!this.order.bastionsAsFactories;
    }

    setBastionsAsFactories() {
        this.order.bastionsAsFactories = true;
        return this;
    }

    /** Does the order let a city or a bastion stand in for a factory at all? */
    get treatsAsFactories() {
        return this.cities || this.bastions;
    }

    /**
     * «They must be deployed in the world that produced them»: the units go into
     * the factory world, not anywhere in the system.
     */
    get inFactoryWorld() {
        return !!this.order.deployInFactoryWorld;
    }

    setInFactoryWorld() {
        this.order.deployInFactoryWorld = true;
        return this;
    }

    // --- the capacity of a world ----------------------------------------------

    /** «вместимость мира с городом больше на N». */
    get capacityBonus() {
        return this.order.capacityBonus || 0;
    }

    get capacityMax() {
        return this.order.capacityMax || 0;
    }

    /** «дополнительная вместимость — только для Гвардейцев». */
    get capacityOnly() {
        return this.order.capacityBonusOnly || null;
    }

    addCapacityBonus(n, max, only) {
        this.order.capacityBonus = this.capacityBonus + (n || 0);
        if (max) this.order.capacityMax = max;
        if (only) this.order.capacityBonusOnly = only;
        return this;
    }

    /** Does this unit get the extra capacity of a city world? */
    capacityFits(def) {
        const only = this.capacityOnly;
        if (!only) return true;
        if (!def) return true;
        return FS_CATALOG.sameName(def.name, only);
    }
}

/** One set of limits per order, like one board per state. */
DeployLimits.cache = new WeakMap();
