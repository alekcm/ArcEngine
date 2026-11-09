// FSPhase.js — the step an order stands at, as one object.
//
// Every order is a small machine: units → structures → done for a deployment,
// move → combat → strike → strike-first → strike-damage → done for an advance.
// The step lived in one string field (`order.phase`), compared with literals in
// the rules, the panel and the cards — a typo in one place made a silent `false`.
//
// The object is a read/write VIEW of that field: the state stays serialisable.

class PhasePlan {
    /** @param {any} order the order being resolved (the field lives on it) */
    constructor(order) {
        this.order = order || {};
    }

    /** The step of an order; null when there is no order at all. */
    static of(order) {
        if (!order) return null;
        let plan = PhasePlan.cache.get(order);
        if (!plan) {
            plan = new PhasePlan(order);
            PhasePlan.cache.set(order, plan);
        }
        return plan;
    }

    /** The step, by name. */
    get name() {
        return this.order.phase || null;
    }

    /** Is the order at one of these steps? */
    is(...names) {
        const here = this.name;
        for (const n of names) if (n === here) return true;
        return false;
    }

    set(name) {
        this.order.phase = name === undefined ? null : name;
        return this;
    }

    /** The order of «Департаменто муниторум» starts without a step of its own. */
    clear() {
        this.order.phase = null;
        return this;
    }
}

// The steps, named once.
PhasePlan.UNITS = 'units';
PhasePlan.STRUCTURES = 'structures';
PhasePlan.MOVE = 'move';
PhasePlan.COMBAT = 'combat';
PhasePlan.STRIKE = 'strike';
PhasePlan.STRIKE_FIRST = 'strike-first';
PhasePlan.STRIKE_DAMAGE = 'strike-damage';
PhasePlan.GUARD_DEPLOY = 'guardDeploy';
PhasePlan.STRATEGIZE = 'strategize';
PhasePlan.DOMINATE = 'dominate';
PhasePlan.DONE = 'done';

/** One step per order, like one board per state. */
PhasePlan.cache = new WeakMap();
