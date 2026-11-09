// FSOrderMove.js — where an order lets its units march, as one object.
//
// An advance order does not only narrow the units (they are in MarchPlan): the
// CARD narrows the ground they may cross — one area of origin only, a warp storm
// the ships pass, a storm the ground units pass, empty voids they may walk
// through, the route of the extra advance and of «Быстрого ответа». The rules
// kept that in plain fields of the order (`order.moveAreaLimit`,
// `order.passVoid`, `order.unitsThroughStorms`, `order.shipsThroughStorms`,
// `order.ways`, `order.preAdvance`, `order.quickResponse`, `order.fromEvent`)
// and every reader picked what it needed.
//
// The object is a read/write VIEW of those fields: the state stays serialisable.

class OrderMove {
    /** @param {any} order the order being resolved (the fields live on it) */
    constructor(order) {
        this.order = order || {};
    }

    /** The ways of an order; null when there is no order at all. */
    static of(order) {
        if (!order) return null;
        let move = OrderMove.cache.get(order);
        if (!move) {
            move = new OrderMove(order);
            OrderMove.cache.set(order, move);
        }
        return move;
    }

    // --- «перемещение из 1 области» ------------------------------------------

    /** How many areas of origin the order may use; 0 means no limit of its own. */
    get areaLimit() {
        return this.order.moveAreaLimit || 0;
    }

    setAreaLimit(n) {
        this.order.moveAreaLimit = n || 0;
        return this;
    }

    /** Does the plan start from too many areas? */
    withinAreas(sources) {
        if (!this.areaLimit) return true;
        return sources <= this.areaLimit;
    }

    // --- the storms and the empty voids --------------------------------------

    /** «провести до N отрядов через одну никем не контролируемую пустую область». */
    get passVoid() {
        return this.order.passVoid || 0;
    }

    setPassVoid(n) {
        this.order.passVoid = n || 0;
        return this;
    }

    /** «корабли проходят сквозь варп-штормы». */
    get shipsThroughStorms() {
        return !!this.order.shipsThroughStorms;
    }

    setShipsThroughStorms() {
        this.order.shipsThroughStorms = true;
        return this;
    }

    /** «наземные отряды идут сквозь варп-штормы» — and the ships with them. */
    get unitsThroughStorms() {
        return !!this.order.unitsThroughStorms;
    }

    setUnitsThroughStorms() {
        this.order.unitsThroughStorms = true;
        return this;
    }

    /** May this unit cross a storm on the edge? */
    crossesStorm(def) {
        if (this.unitsThroughStorms) return true;
        return !!def && def.type === 'ship' && this.shipsThroughStorms;
    }

    // --- the ways of the ground units ----------------------------------------

    /** The neighbouring system the ground units came from, and the ships'. */
    get ways() {
        return this.order.ways || { ground: null, ship: null };
    }

    way(kind) {
        return this.ways[kind === 'ship' ? 'ship' : 'ground'];
    }

    setWay(kind, systemId) {
        if (!this.order.ways) this.order.ways = { ground: null, ship: null };
        if (kind === 'ground') this.order.ways.ground = systemId;
        else if (kind === 'ship') this.order.ways.ship = systemId;
        return this.ways;
    }

    /**
     * «… from one adjacent system only»: a ground unit may come only from the
     * system the first ground unit came from, and one ship from a neighbour
     * closes that way for the ground units of another system.
     */
    wayAllows(kind, from) {
        const was = this.way(kind);
        if (!was) return true;
        return was === from;
    }

    // --- the extra advance and «Быстрый ответ» --------------------------------

    /** «Мобилизированные охотники»: the extra advance of one unit. */
    get preAdvance() {
        return !!this.order.preAdvance;
    }

    setPreAdvance() {
        this.order.preAdvance = true;
        return this;
    }

    /** «Быстрый ответ»: the limited advance in the chosen system, from an event. */
    get quickResponse() {
        return !!this.order.quickResponse;
    }

    setQuickResponse() {
        this.order.quickResponse = true;
        return this;
    }

    /** The order was started by an event and gives the turn back when it ends. */
    get fromEvent() {
        return !!this.order.fromEvent;
    }

    setFromEvent() {
        this.order.fromEvent = true;
        return this;
    }
}

/** One set of ways per order, like one board per state. */
OrderMove.cache = new WeakMap();
