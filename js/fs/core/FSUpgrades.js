// FSUpgrades.js — the purchases of a Strategize Order as one object.
//
// A strategize order buys cards and keeps a receipt for each: which combat pair
// left the deck and which card came in, the name and price of the order card, how
// many upgrades the card of the turn allows. The rules kept that in plain fields
// of the order (`order.upgradesBought`, `order.combatUpgrade`, `order.combatBuy`,
// `order.orderUpgrade`, `order.orderUpgradeName`, `order.orderBuy`,
// `order.upgradeLimit`) and the panel read them one by one.
//
// The object is a read/write VIEW of those fields: the state stays serialisable.

class UpgradeOrder {
    /** @param {any} order the strategize order (the fields live on it) */
    constructor(order) {
        this.order = order || {};
    }

    /** The purchases of an order; null when there is no order at all. */
    static of(order) {
        if (!order) return null;
        let plan = UpgradeOrder.cache.get(order);
        if (!plan) {
            plan = new UpgradeOrder(order);
            UpgradeOrder.cache.set(order, plan);
        }
        return plan;
    }

    // --- how many upgrades the order allows ----------------------------------

    /** «… можно купить только одно улучшение» — 0 means no limit of its own. */
    get limit() {
        return this.order.upgradeLimit || 0;
    }

    setLimit(n) {
        this.order.upgradeLimit = n || 0;
        return this;
    }

    get bought() {
        return this.order.upgradesBought || 0;
    }

    setBought(n) {
        this.order.upgradesBought = Math.max(0, n || 0);
        return this;
    }

    /** The purchase joins the count; the refund takes it back. */
    sold() {
        return this.setBought(this.bought + 1);
    }

    refunded() {
        return this.setBought(this.bought - 1);
    }

    /** «Можно купить только N улучшение(я).» — the answer of the limit. */
    get full() {
        return !!this.limit && this.bought >= this.limit;
    }

    // --- the combat upgrade --------------------------------------------------

    get combat() {
        return !!this.order.combatUpgrade;
    }

    /** The receipt of the combat purchase: card, the pair that left, price. */
    get combatBuy() {
        return this.order.combatBuy || null;
    }

    buyCombat(cardName, removed, price) {
        this.order.combatUpgrade = true;
        this.order.combatBuy = { card: cardName, removed: [removed, removed], price: price || 0 };
        this.sold();
        return this.combatBuy;
    }

    refundCombat() {
        const buy = this.combatBuy;
        this.order.combatUpgrade = false;
        this.order.combatBuy = null;
        this.refunded();
        return buy;
    }

    // --- the order upgrade ---------------------------------------------------

    get orderCard() {
        return !!this.order.orderUpgrade;
    }

    get orderName() {
        return this.order.orderUpgradeName || null;
    }

    get orderBuy() {
        return this.order.orderBuy || null;
    }

    buyOrder(cardName, price) {
        this.order.orderUpgrade = true;
        this.order.orderUpgradeName = cardName;
        this.order.orderBuy = { name: cardName, price: price || 0 };
        this.sold();
        return this.orderBuy;
    }

    refundOrder() {
        const name = this.orderName;
        const buy = this.orderBuy;
        this.order.orderUpgrade = false;
        this.order.orderUpgradeName = null;
        this.order.orderBuy = null;
        this.refunded();
        return { name, price: buy && buy.price };
    }

    /** A new order starts with no purchases. */
    reset() {
        this.order.upgradesBought = 0;
        this.order.combatUpgrade = false;
        this.order.combatBuy = null;
        this.order.orderUpgrade = false;
        this.order.orderUpgradeName = null;
        this.order.orderBuy = null;
        return this;
    }
}

/** One set of purchases per order, like one board per state. */
UpgradeOrder.cache = new WeakMap();
