// FSStrike.js — the orbital strike of an Advance Order as one object.
//
// An orbital strike is a short life inside the order: the cubes it rolls, the
// payments the cards make out of them, the unit that takes the damage first,
// the strike that is planned but not yet finished. The rules kept it in sixteen
// fields of the plain order (`order.strikeBonus`, `order.strikePlanned`,
// `order.strikePays`, …), and every layer — the rules of the advance, the card
// steps of the payments, the panel — read and wrote them by hand.
//
// The object is a read/write VIEW of those fields, like PlayerEntity is a view
// of the player: the state stays serialisable and the server still sends it as
// JSON, but the meaning of the fields lives here. A rule asks the strike for
// its bonus, a card adds a payment, the strike phase starts with a reset.

class StrikePlan {
    /** @param {any} order the order being resolved (the fields live on it) */
    constructor(order) {
        this.order = order || {};
    }

    /**
     * The strike of an order. Null when there is no order — a card outside an
     * order can neither add to a strike nor read one.
     * @param {any} order
     */
    static of(order) {
        if (!order) return null;
        let plan = StrikePlan.cache.get(order);
        if (!plan) {
            plan = new StrikePlan(order);
            StrikePlan.cache.set(order, plan);
        }
        return plan;
    }

    // --- the strikes that are on the way -------------------------------------

    /** A card of the order changes the strike before it is rolled. */
    addBonus(n) {
        this.order.strikeBonus = (this.order.strikeBonus || 0) + (n || 0);
        return this;
    }

    /** The bonus belongs to ONE strike: the roll takes it. */
    spendBonus() {
        const n = this.order.strikeBonus || 0;
        this.order.strikeBonus = 0;
        return n;
    }

    /** «… взять под контроль постройки этого мира за 2 куб. обороны» */
    setTake(take) {
        this.order.strikeTake = take;
        return this;
    }

    /** The price is paid out of the rolled cubes, or it is gone. */
    takeTake() {
        const take = this.order.strikeTake || null;
        if (take) this.order.strikeTake = null;
        return take;
    }

    /** The health of the units of the struck world is lower while the strike lasts. */
    addHealthDown(n) {
        this.order.strikeHealthDown = (this.order.strikeHealthDown || 0) + (n || 1);
        return this;
    }

    get healthDown() {
        return this.order.strikeHealthDown || 0;
    }

    /** «Здоровье отрядов противника уменьшается до 3» — a ceiling, not a bonus. */
    setEnemyHealth(n) {
        this.order.enemyHealth = n;
        return this;
    }

    get enemyHealth() {
        return this.order.enemyHealth === undefined ? null : this.order.enemyHealth;
    }

    /** A card of the strike says the bastions of the world do not shield it. */
    ignoreBastion() {
        this.order.ignoreBastion = true;
        return this;
    }

    get ignoresBastion() {
        return !!this.order.ignoreBastion;
    }

    // --- the payments of the cards -------------------------------------------

    /**
     * One card keeps its own payment and its own reward: «Мицетические споры»
     * and «Разведка генокрадов» may be used on the same strike.
     */
    addPay(pay) {
        const list = this.order.strikePays || (this.order.strikePays = []);
        list.push(pay);
        this.order.strikePay = pay;
        return pay;
    }

    get pays() {
        return this.order.strikePays || (this.order.strikePay ? [this.order.strikePay] : []);
    }

    /** The reward of a card is attached to the payment it was written for. */
    setReward(reward) {
        const list = this.order.strikePays || (this.order.strikePays = []);
        if (list.length) list[list.length - 1].reward = reward;
        this.order.strikeReward = reward;
        return reward;
    }

    get reward() {
        return this.order.strikeReward || null;
    }

    /** «…перевернуть все ваши кубики, которые вы бросали, на `att. cube`» («Экстерминатус»). */
    setAllAtt(on) {
        this.order.strikeAllAtt = on !== false;
        return this;
    }

    get allAtt() {
        return !!this.order.strikeAllAtt;
    }

    /** The cubes a card has added to the pool of this strike. */
    addDice(faces) {
        this.order.strikeDice = (this.order.strikeDice || []).concat(faces || []);
        return this;
    }

    get dice() {
        return this.order.strikeDice || [];
    }

    /** How many cubes of the pool this payment took. */
    setPaid(n) {
        this.order.strikePaid = n;
        return this;
    }

    get paid() {
        return this.order.strikePaid;
    }

    // --- the plan of the strike that waits for the answers -------------------

    /** The strike is calculated and waits for the cards: the world, the hits, the victims. */
    setPlanned(plan) {
        this.order.strikePlanned = plan;
        return plan;
    }

    get planned() {
        return this.order.strikePlanned || null;
    }

    /** The plan is done: the damage is assigned by the finished strike. */
    clearPlanned() {
        this.order.strikePlanned = null;
        return this;
    }

    /** «Этот отряд получит урон первым» — the unit the strike hits first. */
    setFirst(id) {
        this.order.strikeFirst = id;
        return this;
    }

    get first() {
        return this.order.strikeFirst || null;
    }

    /** The card gives the choice of the first unit: the question waits for it. */
    wantFirst(maxKl) {
        this.order.strikeFirstWanted = true;
        this.order.strikeFirstKl = maxKl === undefined ? null : maxKl;
        return this;
    }

    get firstWanted() {
        return !!this.order.strikeFirstWanted;
    }

    get firstKl() {
        return this.order.strikeFirstKl === undefined ? 0 : this.order.strikeFirstKl;
    }

    /** The question «какой отряд получит урон первым» was asked already. */
    get firstAsked() {
        return !!this.order.strikeFirstAsked;
    }

    askFirst(asked) {
        this.order.strikeFirstAsked = asked !== false;
        return this;
    }

    /** The schemes of the strike are used before the strike — once. */
    hookUsed() {
        if (this.order.strikeHook) return true;
        this.order.strikeHook = true;
        return false;
    }

    /** The payments of the cards are asked once per strike. */
    get paysAsked() {
        return !!this.order.strikePayAsked;
    }

    askPays(asked) {
        this.order.strikePayAsked = asked !== false;
        return this;
    }

    // --- the world the strike acts on ---------------------------------------

    /** «… и разместите его в этом мире»: the effects of the strike read the world it hit. */
    setWorld(ref) {
        this.order.strikeWorld = ref;
        return ref;
    }

    get world() {
        return this.order.strikeWorld || null;
    }

    // --- «Страх с небес»: the strike is not over with the damage ------------

    /** After the damage one of the hit units is routed; the order ends with that answer. */
    routeDamagedAfter() {
        this.order.chaosRouteDamaged = true;
        return this;
    }

    get routesAfterDamage() {
        return !!this.order.chaosRouteDamaged;
    }

    /** The tail of the card is being resolved: the flag is spent. */
    clearRoutes() {
        this.order.chaosRouteDamaged = false;
        return this;
    }

    /** The last question of the strike was asked: the order may end. */
    finishAfterQuestion(on) {
        this.order.chaosStrikeFinish = !!on;
        return this;
    }

    get finishesAfterQuestion() {
        return !!this.order.chaosStrikeFinish;
    }

    /** A new strike of the same order starts from a clean plan. */
    reset() {
        this.order.strikeFirstAsked = false;
        return this;
    }

    /** «Экстерминатус» is used by ONE strike: the roll takes the word. */
    spendAllAtt() {
        const on = this.allAtt;
        this.order.strikeAllAtt = false;
        return on;
    }
}

/** One plan per order, like one board per state. */
StrikePlan.cache = new WeakMap();
