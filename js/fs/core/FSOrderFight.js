// FSOrderFight.js — what an order lends to the battle it starts, as one object.
//
// The cards of an order reach into the combat: a bonus of the command level, a
// reroll of the preparation, extra combat cards, one round only, a named unit
// that may retreat beyond the capacity, the materiel of a destroyed world that
// lasts until the end of the order. The rules kept that in plain fields of the
// order (`order.klBonus`, `order.prepReroll`, `order.prepDrawCards`,
// `order.extraCombatCards`, `order.combatRounds`, `order.retreatExcessUnits`,
// `order.tempMateriel`, `order.tempBefore`, `order.tempAdded`) and every reader
// picked what it needed.
//
// The object is a read/write VIEW of those fields: the state stays serialisable.

class OrderFight {
    /** @param {any} order the order being resolved (the fields live on it) */
    constructor(order) {
        this.order = order || {};
    }

    /** The battle help of an order; null when there is no order at all. */
    static of(order) {
        if (!order) return null;
        let fight = OrderFight.cache.get(order);
        if (!fight) {
            fight = new OrderFight(order);
            OrderFight.cache.set(order, fight);
        }
        return fight;
    }

    // --- the command level ----------------------------------------------------

    /** «командный уровень выше на N, пока идёт приказ». */
    get klBonus() {
        return this.order.klBonus || 0;
    }

    addKlBonus(n) {
        this.order.klBonus = this.klBonus + (n || 0);
        return this;
    }

    // --- the preparation of the battle ---------------------------------------

    /** «перебросьте 1 кубик за каждого юнита» — asked once the hands are dealt. */
    get prepReroll() {
        return this.order.prepReroll || null;
    }

    setPrepReroll(step) {
        this.order.prepReroll = {
            n: step.n || 1, per: step.per || null, kind: step.kind || 'any',
            inBattle: !!step.inBattle, ability: step.ability,
        };
        return this;
    }

    /** «вытяните 2 дополнительных карты и сбросьте 2» на этапе подготовки. */
    get prepDrawCards() {
        return this.order.prepDrawCards || null;
    }

    addPrepDraw(n, discard) {
        const prep = this.order.prepDrawCards || (this.order.prepDrawCards = { n: 0, discard: 0 });
        prep.n += n || 0;
        prep.discard += discard || 0;
        return prep;
    }

    /** «ещё N боевых карт» — the hand is dealt wider. */
    get extraCombatCards() {
        return this.order.extraCombatCards || 0;
    }

    addExtraCombatCards(n) {
        this.order.extraCombatCards = this.extraCombatCards + (n || 0);
        return this;
    }

    /** «разыграйте только один раунд» — the limit of the battle this order starts. */
    get combatRounds() {
        return this.order.combatRounds || 0;
    }

    /**
     * «Во время шага разрешения боя, начатого этим приказом, если вы
     * победитель — противник выбирает и уничтожает 1 деморализованный отряд
     * до отступления» («Страшный приговор»): a promise to the battle of the order.
     */
    get winnerDestroysRouted() {
        return !!this.order.winnerDestroysRouted;
    }

    setWinnerDestroysRouted(on) {
        this.order.winnerDestroysRouted = on !== false;
        return this;
    }

    /** The promise is kept by one battle: the first the order resolves. */
    takeWinnerDestroysRouted() {
        const on = this.winnerDestroysRouted;
        this.order.winnerDestroysRouted = false;
        return on;
    }

    // --- the battles already asked for ---------------------------------------

    /** The preparation is taken by the battle: it never repeats. */
    takePrep() {
        const prep = this.prepReroll;
        const draw = this.prepDrawCards;
        this.order.prepReroll = null;
        this.order.prepDrawCards = null;
        return { prep, draw };
    }

    // --- the excess after the order ------------------------------------------

    /** «отступить любым числом Гвардейцев, превышающим вместимость». */
    get retreatExcess() {
        return this.order.retreatExcessUnits || null;
    }

    setRetreatExcess(name) {
        this.order.retreatExcessUnits = name || null;
        return this;
    }

    // --- the temporary materiel of a destroyed world -------------------------

    /** The materiel a destroyed world is worth, for this order alone. */
    get tempMateriel() {
        return this.order.tempMateriel || 0;
    }

    setTempMateriel(sum) {
        this.order.tempMateriel = sum || 0;
        return this;
    }

    /**
     * The temporary materiel is granted and remembered as a debt: what the order
     * does not spend comes back off the player at its end.
     */
    grantTemp(materiel) {
        const temp = this.tempMateriel;
        this.order.tempAdded = temp;
        this.order.tempBefore = materiel || 0;
        return temp;
    }

    /** Is any temporary materiel of this order still on the table? */
    get hasTemp() {
        return !!this.order.tempAdded;
    }

    /** How much of the temporary materiel is still unspent (0 when none). */
    unspentTemp(materiel) {
        if (!this.order.tempAdded) return 0;
        const spent = Math.max(0, (this.order.tempBefore || 0) + this.order.tempAdded - (materiel || 0));
        return Math.max(0, this.order.tempAdded - spent);
    }

    clearTemp() {
        this.order.tempMateriel = 0;
        this.order.tempAdded = 0;
        this.order.tempBefore = 0;
        return this;
    }
}

/** One battle help per order, like one board per state. */
OrderFight.cache = new WeakMap();
