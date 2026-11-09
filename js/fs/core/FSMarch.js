// FSMarch.js — the movement of an Advance Order as one object.
//
// An advance is two steps of movement (the ships, then the ground units) and a
// short memory of what already happened: which units have marched, where they
// went (the undo stack), which single area became contested, how many units an
// uncontrolled world let through. The rules kept all that in plain fields of
// the order (`order.moved`, `order.route`, `order.moveStep`, `order.steps`,
// `order.contested`, …) and the rule of the march, the combat and the panel each
// read and wrote them by hand.
//
// The object is a read/write VIEW of those fields, like the board is a view of
// the systems: the state stays serialisable and the server sends it as JSON.

class MarchPlan {
    /** @param {any} order the order being resolved (the fields live on it) */
    constructor(order) {
        this.order = order || {};
    }

    /** The march of an order; null when there is no order at all. */
    static of(order) {
        if (!order) return null;
        let plan = MarchPlan.cache.get(order);
        if (!plan) {
            plan = new MarchPlan(order);
            MarchPlan.cache.set(order, plan);
        }
        return plan;
    }

    // --- the two steps of the movement ---------------------------------------

    /** The step of the movement: the ships first, then the ground units. */
    get step() {
        return this.order.moveStep === 'ground' ? 'ground' : 'ships';
    }

    setStep(step) {
        this.order.moveStep = step === 'ground' ? 'ground' : 'ships';
        return this;
    }

    /** The kind of the unit that moves in the current step. */
    get kind() {
        return this.step === 'ground' ? 'ground' : 'ship';
    }

    /**
     * The roads of the step are frozen when the step begins: a march never
     * opens a longer road for the unit that follows.
     */
    setRoute(route) {
        this.order.route = route || null;
        return this;
    }

    get route() {
        return this.order.route || null;
    }

    /** Can this unit march at all in this step? The frozen roads answer. */
    hasRoad(unitId) {
        const route = this.route;
        if (!route) return true;
        return !!route[unitId];
    }

    roadsOf(unitId) {
        const route = this.route;
        return (route && route[unitId]) || null;
    }

    // --- the units that already marched --------------------------------------

    /** «Этот отряд уже сдвинулся в этом приказе.» */
    hasMoved(unitId) {
        return this.moved.includes(unitId);
    }

    get moved() {
        return this.order.moved || [];
    }

    setMoved(ids) {
        this.order.moved = ids ? ids.slice() : [];
        return this.moved;
    }

    /** The units of one march join the list of the marched. */
    addMoved(ids) {
        this.order.moved = this.moved.concat(ids || []);
        return this.moved;
    }

    /** A returned march takes its units out of the list. */
    removeMoved(ids) {
        const drop = new Set(ids || []);
        this.order.moved = this.moved.filter(id => !drop.has(id));
        return this.moved;
    }

    /** «Мобилизированные охотники»: the unit of the extra advance sits out the main one. */
    get excludedUnit() {
        return this.order.excludedUnit || null;
    }

    exclude(unitId) {
        this.order.excludedUnit = unitId || null;
        return this;
    }

    get preAdvanceUnit() {
        return this.order.preAdvanceUnit || null;
    }

    setPreAdvanceUnit(unitId) {
        this.order.preAdvanceUnit = unitId || null;
        return this;
    }

    // --- the step of the order that may be taken back -------------------------

    /** Every march of this order, in the order they happened (the undo stack). */
    get steps() {
        return this.order.steps || [];
    }

    /** The last march: what Esc and «Вернуть последний ход» take back. */
    get lastStep() {
        const list = this.steps;
        return list.length ? list[list.length - 1] : null;
    }

    addStep(records) {
        if (!this.order.steps) this.order.steps = [];
        this.order.steps.push(records);
        return records;
    }

    popStep() {
        const list = this.steps;
        return list.length ? list.pop() : null;
    }

    // --- the one contested area ----------------------------------------------

    /** «Only one area can become contested during a single Advance Order.» */
    get contested() {
        return this.order.contested || null;
    }

    /**
     * The area that became contested. A second, different area is not allowed:
     * the caller asks `mayContest` first and the answer is the same here.
     */
    contest(key) {
        if (this.contested && this.contested !== key) return false;
        this.order.contested = key || null;
        return true;
    }

    clearContested(key) {
        if (!key || this.order.contested === key) this.order.contested = null;
        return this.contested;
    }

    // --- the limits a card puts on the march ---------------------------------

    /** «… переместить не больше N отрядов». */
    get moveLimit() {
        return this.order.moveLimit || 0;
    }

    setMoveLimit(n) {
        this.order.moveLimit = n || 0;
        return this;
    }

    /** «… среди перемещаемых отрядов должен быть …». */
    get mustInclude() {
        return this.order.mustInclude || null;
    }

    setMustInclude(name) {
        this.order.mustInclude = name || null;
        return this;
    }

    // --- «Крестный ход»: the passage through an uncontrolled world -----------

    get uncontrolledLimit() {
        return this.order.uncontrolled || 0;
    }

    get uncontrolledUsed() {
        return this.order.uncontrolledUsed || 0;
    }

    /** The passages left this order. */
    get uncontrolledLeft() {
        return Math.max(0, this.uncontrolledLimit - this.uncontrolledUsed);
    }

    /** The card gives its budget: the passages are counted from zero again. */
    setUncontrolled(left) {
        this.order.uncontrolled = left || 0;
        this.order.uncontrolledUsed = 0;
        return this;
    }

    useUncontrolled() {
        this.order.uncontrolledUsed = this.uncontrolledUsed + 1;
        return this.uncontrolledUsed;
    }

    returnUncontrolled() {
        this.order.uncontrolledUsed = Math.max(0, this.uncontrolledUsed - 1);
        return this.uncontrolledUsed;
    }

    /** A new order starts a clean march. */
    reset() {
        this.setStep('ships').setRoute(null).setMoved([]);
        this.order.steps = [];
        this.order.contested = null;
        return this;
    }
}

/** One march per order, like one board per state. */
MarchPlan.cache = new WeakMap();
