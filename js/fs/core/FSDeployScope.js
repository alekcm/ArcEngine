// FSDeployScope.js — where an order may place its units, as one object.
//
// A limited deployment and the nested production of «Массового Производства»
// both narrow the order: one area only, one factory world only, one type of unit
// only. The rules kept that in plain fields of the order (`order.deployAreaLimit`,
// `order.deployAreas`, `order.guardFactory`, `order.unitsLocked`) and the rule,
// the panel and the highlight each read them by hand.
//
// The object is a read/write VIEW of those fields: the state stays serialisable.

class DeployScope {
    /** @param {any} order the order being resolved (the fields live on it) */
    constructor(order) {
        this.order = order || {};
    }

    /** The scope of an order; null when there is no order at all. */
    static of(order) {
        if (!order) return null;
        let scope = DeployScope.cache.get(order);
        if (!scope) {
            scope = new DeployScope(order);
            DeployScope.cache.set(order, scope);
        }
        return scope;
    }

    // --- the purchase that waits for a plan («Варбосс») -----------------------

    /** The command of the purchase the plan interrupted, if any. */
    get pendingBuy() {
        return this.order.pendingBuy || null;
    }

    setPendingBuy(cmd) {
        this.order.pendingBuy = cmd ? Object.assign({}, cmd) : null;
        return this;
    }

    /** The purchase goes on: the command is read once. */
    takePendingBuy() {
        const cmd = this.pendingBuy;
        delete this.order.pendingBuy;
        return cmd;
    }

    // --- the producing factory of «Массового Производства» --------------------

    /** The factory that produces: `{system, pos}`. */
    get factory() {
        return this.order.guardFactory || null;
    }

    setFactory(system, pos) {
        this.order.guardFactory = { system, pos };
        return this;
    }

    /** Is this very area the producing world? */
    inFactory(system, pos) {
        const f = this.factory;
        return !!f && f.system === system && f.pos === pos;
    }

    // --- «минимум 2 отряда одного типа» --------------------------------------

    /** The type the first purchase locked; null until then. */
    get lockedType() {
        return this.order.unitsLocked || null;
    }

    lockType(defId) {
        if (!this.lockedType) this.order.unitsLocked = defId || null;
        return this.lockedType;
    }

    unlock() {
        this.order.unitsLocked = null;
        return this;
    }

    // --- «развертывание в 1 области» -----------------------------------------

    /** How many areas the order may use; 0 means no limit of its own. */
    get areaLimit() {
        return this.order.deployAreaLimit || 0;
    }

    setAreaLimit(n) {
        this.order.deployAreaLimit = n || 0;
        this.order.deployAreas = [];
        return this;
    }

    /** The areas already used by this order. */
    get areas() {
        return this.order.deployAreas || [];
    }

    /** May the order place anything in this area? The answer counts, it does not record. */
    allows(pos) {
        if (!this.areaLimit) return true;
        return this.areas.length < this.areaLimit || this.areas.includes(pos);
    }

    /** The placement makes the area one of the order's own. */
    use(pos) {
        if (!this.areaLimit) return this;
        if (!this.order.deployAreas) this.order.deployAreas = [];
        if (!this.order.deployAreas.includes(pos)) this.order.deployAreas.push(pos);
        return this;
    }
}

/** One scope per order, like one board per state. */
DeployScope.cache = new WeakMap();
