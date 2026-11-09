// FSPurchases.js — what an order has already bought, as one object.
//
// A deploy order pays at its end: the list of its purchases is the receipt of
// every unit and structure it put on the table, and the count of the units is
// what the deploy limit and «одна постройка за приказ» are measured by. The list
// lived in `order.purchases` and the rules, the panel and the cards read and
// pushed into it by hand.
//
// The object is a read/write VIEW of that field: the state stays serialisable.

class Purchases {
    /** @param {any} order the order being resolved (the list lives on it) */
    constructor(order) {
        this.order = order || {};
    }

    /** The purchases of an order; null when there is no order at all. */
    static of(order) {
        if (!order) return null;
        let list = Purchases.cache.get(order);
        if (!list) {
            list = new Purchases(order);
            Purchases.cache.set(order, list);
        }
        return list;
    }

    /** The whole list, oldest first. */
    get list() {
        return this.order.purchases || [];
    }

    get empty() {
        return this.list.length === 0;
    }

    get count() {
        return this.list.length;
    }

    /** One kind of purchase: 'unit' | 'structure'. */
    of(kind) {
        return kind ? this.list.filter(x => x.kind === kind) : this.list.slice();
    }

    /** The units bought: «предел развёртывания», «минимум 2 одного типа». */
    get units() {
        return this.of('unit');
    }

    /** «A player cannot purchase more than one structure while resolving a single Deploy Order.» */
    get hasStructure() {
        return this.list.some(x => x.kind === 'structure');
    }

    /** The units of «2 Гвардейца за 1 жетон запасов»: the price of the pair. */
    get deals() {
        return this.units.filter(x => x.deal).length;
    }

    /** The materiel the order owes for everything it bought. */
    get spent() {
        return this.list.reduce((sum, x) => sum + (x.cost || 0), 0);
    }

    /** A purchase joins the list. */
    add(entry) {
        if (!this.order.purchases) this.order.purchases = [];
        this.order.purchases.push(entry);
        return entry;
    }

    /** The purchase of a named unit or structure; the last one by default. */
    find(cmd) {
        const list = this.list;
        const c = cmd || {};
        if (c.unit) return list.find(x => x.kind === 'unit' && x.id === c.unit) || null;
        if (c.structure) return list.find(x => x.kind === 'structure' && x.id === c.structure) || null;
        return list.length ? list[list.length - 1] : null;
    }

    /** The undo takes the record away; the count follows the list. */
    remove(entry) {
        this.order.purchases = this.list.filter(x => x !== entry);
        return this.order.purchases;
    }

    /** A new order buys nothing. */
    clear() {
        this.order.purchases = [];
        return this;
    }
}

/** One list per order, like one board per state. */
Purchases.cache = new WeakMap();
