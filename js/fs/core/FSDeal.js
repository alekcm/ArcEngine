// FSDeal.js — the discounts and the deals of one order, as one object.
//
// A card of the turn lowers the price of the purchases of an order, gives one
// structure for free, moves the structure step first, or names a single cheap
// unit. The rules kept that in plain fields of the order (`order.discount`,
// `order.purchaseDiscount`, `order.cheapUnit`, `order.cheapUnitOnly`,
// `order.cheapUnitUsed`, `order.freeStructure`, `order.freeStructureKind`,
// `order.structureFirst`) and the price of a unit and of a structure read them
// on their own.
//
// The object is a read/write VIEW of those fields: the state stays serialisable.

class OrderDeal {
    /** @param {any} order the order being resolved (the fields live on it) */
    constructor(order) {
        this.order = order || {};
    }

    /** The deal of an order; null when there is no order at all. */
    static of(order) {
        if (!order) return null;
        let deal = OrderDeal.cache.get(order);
        if (!deal) {
            deal = new OrderDeal(order);
            OrderDeal.cache.set(order, deal);
        }
        return deal;
    }

    // Permissions last only for this order and are serialised with it.
    get emptyStrategize() { return !!this.order.emptyStrategize; }
    allowEmptyStrategize() { this.order.emptyStrategize = true; return this; }
    get occupiedStructure() { return !!this.order.occupiedStructure; }
    allowOccupiedStructure() { this.order.occupiedStructure = true; return this; }

    // --- the discounts of a purchase -----------------------------------------

    /** «цена отряда дешевле на N» — the card of the order, per unit. */
    get unitDiscount() {
        return this.order.discount || 0;
    }

    addUnitDiscount(n) {
        this.order.discount = this.unitDiscount + (n || 0);
        return this;
    }

    /** «общая цена покупок (включая здания) дешевле на N». */
    get purchaseDiscount() {
        return this.order.purchaseDiscount || 0;
    }

    addPurchaseDiscount(n) {
        this.order.purchaseDiscount = this.purchaseDiscount + (n || 0);
        return this.purchaseDiscount;
    }

    /** The same, for the log of the card: the discount after the step. */
    discountAfter(n) {
        return this.purchaseDiscount + (n || 0);
    }

    /** The order discount applies once to the entire receipt, not to each item. */
    totalAfterDiscount(subtotal) {
        return Math.max(0, (subtotal || 0) - this.purchaseDiscount);
    }

    /** The amount the next item adds to that receipt, for the panel and budget. */
    marginalPrice(price) {
        const purchases = Purchases.of(this.order);
        const subtotal = purchases ? purchases.spent : 0;
        return this.totalAfterDiscount(subtotal + price) - this.totalAfterDiscount(subtotal);
    }

    /** The per-unit discount used by an effect which buys its own unit. */
    get placementDiscount() {
        return this.unitDiscount;
    }

    /** «1 КЛ0 за 1 материю» — the card names the price of one cheap unit. */
    get cheapPrice() {
        return this.order.cheapUnit || 0;
    }

    setCheapUnit(price, onlyActive) {
        this.order.cheapUnit = price || 1;
        if (onlyActive) this.order.cheapUnitOnly = true;
        return this.cheapPrice;
    }

    /** A KL0 unit is bought for the named price — until the permission is spent. */
    get cheapLeft() {
        return !!this.cheapPrice && !this.order.cheapUnitUsed;
    }

    get cheapOnlyActive() {
        return !!this.order.cheapUnitOnly;
    }

    /** The purchase spends the permission: the next unit pays the full price. */
    spendCheap() {
        this.order.cheapUnitUsed = true;
        this.order.cheapUnit = 0;
        return this;
    }

    // --- «2 Гвардейца за 1 жетон запасов» ------------------------------------

    /** The pair the ability sells: `{ n, unit }` — the unit names the pair. */
    get supplyDeal() {
        return this.order.supplyDeal || null;
    }

    setSupplyDeal(n, unit) {
        this.order.supplyDeal = { n: n || 2, unit: unit || '' };
        return this.order.supplyDeal;
    }

    /** Does this unit take part in the pair? */
    isSupplyPair(def) {
        const deal = this.supplyDeal;
        if (!deal || !def) return false;
        return FS_EFFECTS.sameName(def.name, deal.unit || 'Гвардец');
    }

    // --- the structure of the order -------------------------------------------

    /** «постройка первой» — the card lets the structure come before the units. */
    get structureFirst() {
        return !!this.order.structureFirst;
    }

    setStructureFirst() {
        this.order.structureFirst = true;
        return this;
    }

    /** «постройка бесплатно»: how many, and of what type. */
    get freeStructures() {
        return this.order.freeStructure || 0;
    }

    get freeStructureKind() {
        return this.order.freeStructureKind || null;
    }

    addFreeStructure(kind, n) {
        this.order.freeStructure = this.freeStructures + (n || 0);
        this.order.freeStructureKind = kind || 'bastion';
        return this;
    }

    /** This very structure of this very type is the free one. */
    isFree(type) {
        return !!this.freeStructures && this.freeStructureKind === type;
    }

    /** The purchase of the free structure spends the card. */
    spendFree() {
        this.order.freeStructure = Math.max(0, this.freeStructures - 1);
        if (!this.order.freeStructure) this.order.freeStructureKind = null;
        return this;
    }
}

/** One deal per order, like one board per state. */
OrderDeal.cache = new WeakMap();
