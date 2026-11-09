// FSOrderContext.js — what an order is, as one object.
//
// Every reader of an order starts with the same three questions: is there an
// order at all, whose is it, and of what kind? And an order is also a place: the
// active system everything happens in. The rules kept that in plain fields
// (`order.seat`, `order.order`, `order.system`, `order.nested`,
// `order.nestedKind`) and every rule, panel and card step picked what it needed —
// `state.order.order === 'deploy'` in eight places, `order.system` in twelve.
//
// The object is a read/write VIEW of those fields: the state stays serialisable.

class OrderContext {
    /** @param {any} order the order being resolved (the fields live on it) */
    constructor(order) {
        this.order = order || {};
    }

    /** The context of an order; null when there is no order at all. */
    static of(order) {
        if (!order) return null;
        let context = OrderContext.cache.get(order);
        if (!context) {
            context = new OrderContext(order);
            OrderContext.cache.set(order, context);
        }
        return context;
    }

    /** The player who is resolving the order. */
    get seat() {
        return this.order.seat;
    }

    /** The kind of the order: 'advance' | 'deploy' | 'strategize' | 'dominate'. */
    get kind() {
        return this.order.order || null;
    }

    /** The active system: where the order happens. */
    get system() {
        return this.order.system || null;
    }

    /** Is this the order of this player? */
    isSeat(seat) {
        return this.order.seat === seat;
    }

    /** Is this an order of this kind? */
    isKind(kind) {
        return this.order.order === kind;
    }

    /** The question every command of an order starts with, in one line. */
    mine(seat, kind) {
        if (!this.isSeat(seat)) return false;
        return !kind || this.isKind(kind);
    }

    setKind(kind) {
        this.order.order = kind;
        return this;
    }

    // --- the order inside the order («Департаменто муниторум») ----------------

    /** The kind of the limited order the strategize order will turn into. */
    get nestedKind() {
        return this.order.nestedKind || null;
    }

    setNestedKind(kind) {
        this.order.nestedKind = kind || null;
        return this;
    }

    /** This order is the second, limited one. */
    get nested() {
        return !!this.order.nested;
    }

    /** The order becomes the nested one: its kind, its own list, its own limits. */
    turnInto() {
        const kind = this.nestedKind;
        this.order.nestedKind = null;
        this.order.nested = true;
        if (kind) this.order.order = kind;
        return kind;
    }
}

/** One context per order, like one board per state. */
OrderContext.cache = new WeakMap();
