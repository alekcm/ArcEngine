// FSCombatDamage.js — the damage of a battle, as the cards shape it.
//
// The damage step is written by the cards: one card raises the health of the
// units of a side or cuts the health of the enemy, another adds damage to one
// side or to both, a third makes the damage go one point at a time or makes the
// step repeat, a fourth forbids a unit to be routed or allows the routed units
// of a side to be hit, a fifth names the piece that takes the damage first and
// discards what is left over, a sixth lets a unit retreat instead of dying.
//
// All of that lived in eighteen fields of `state.combat`, read by the rules, the
// panel and the view, and cleared by the end of the round in a list of
// assignments that had to be kept in step with the readers. One question now:
// `CombatDamage.of(combat)`.
//
// The object is a read/write VIEW of the fields of the battle: the state stays
// serialisable, and an entry a card puts on the table keeps its round.

class CombatDamage {
    /** @param {any} combat the battle (the fields live on it) */
    constructor(combat) {
        this.combat = combat || {};
    }

    /** The damage of a battle; null when there is no battle at all. */
    static of(combat) {
        if (!combat) return null;
        let damage = CombatDamage.cache.get(combat);
        if (!damage) {
            damage = new CombatDamage(combat);
            CombatDamage.cache.set(combat, damage);
        }
        return damage;
    }

    // --- the health of the pieces --------------------------------------------

    /**
     * «значение здоровья всех ВАШИХ отрядов повышается на 1»: the bonus belongs
     * to the seat whose card printed it, not to whoever deals the damage. The
     * old shape («raised when the owner of the piece is the one who deals the
     * damage») gave the bonus to the OPPONENT's units whenever the player who
     * played the card was not the one assigning the damage.
     */
    healthBonusFor(seat) {
        // The bonus of the round and the bonus of the whole battle are both
        // the health of the seat's units.
        const lists = [this.combat.healthBonus, this.combat.healthBonusCombat];
        let sum = 0;
        for (const entries of lists) {
            if (!Array.isArray(entries)) continue;
            sum += entries.reduce((acc, x) => acc + (x.seat === seat ? (x.n || 0) : 0), 0);
        }
        return sum;
    }

    /** The printed bonus of any seat — for the panels that show the battle. */
    get healthBonus() {
        const lists = [this.combat.healthBonus, this.combat.healthBonusCombat];
        let sum = 0;
        for (const entries of lists) {
            if (!Array.isArray(entries)) continue;
            sum += entries.reduce((acc, x) => acc + (x.n || 0), 0);
        }
        return sum;
    }

    // `wholeCombat` marks the bonus of «во время этой битвы» («Серебряная
    // броня») instead of «в этом раунде»: it goes into another list that the
    // end of the round does not clear — only the end of the battle does.
    /** @param {number} seat the seat whose card raises the health of its units
     *  @param {number} n the bonus
     *  @param {boolean} [wholeCombat] bonus for the whole battle */

    addHealthBonus(seat, n, wholeCombat) {
        const key = wholeCombat ? 'healthBonusCombat' : 'healthBonus';
        const entries = Array.isArray(this.combat[key]) ? this.combat[key] : [];
        entries.push({ seat, n: Number(n) || 0 });
        this.combat[key] = entries;
        return this.healthBonusFor(seat);
    }

    /**
     * «здоровье отрядов противника уменьшается до 3»: the ceiling of the enemy of
     * the seat whose card printed it — again, not of whoever deals the damage.
     */
    enemyCeilingFor(seat) {
        const entries = this.combat.enemyHealth;
        if (!Array.isArray(entries)) return 0;
        return entries.reduce((low, x) => (x.seat === seat ? Math.min(low || x.n, x.n) : low), 0);
    }

    /** The printed ceiling of any seat — for the panels that show the battle. */
    get enemyHealth() {
        const entries = this.combat.enemyHealth;
        if (!Array.isArray(entries)) return 0;
        return entries.reduce((low, x) => Math.min(low || x.n, x.n), 0);
    }

    /** @param {number} seat the seat whose card lowers the health of the enemy */
    setEnemyHealth(seat, n) {
        const entries = Array.isArray(this.combat.enemyHealth) ? this.combat.enemyHealth : [];
        entries.push({ seat, n: n || 3 });
        this.combat.enemyHealth = entries;
        return this.enemyCeilingFor(seat);
    }

    /**
     * The health of a piece as the cards of the round shape it. `owner` is the
     * seat of the piece; the bonus of that seat's card raises it, the ceiling of
     * the OTHER seat's card lowers it. No `actor`: whose hand deals the damage
     * has nothing to do with whose card raised the health.
     */
    health(owner, base) {
        let health = Number(base) || 0;
        health += this.healthBonusFor(owner);
        const ceiling = this.enemyCeilingFor(1 - owner);
        if (ceiling) health = Math.min(health, ceiling);
        return Math.max(1, health);
    }

    // --- the extra damage of a side -------------------------------------------

    /**
     * «если противник получил урон, он получает ещё 3 урона»: `who` is `both`,
     * `foe` (the other side of the card's owner) or `me`. The role of the foe is
     * fixed by the seat of the owner, not by the step.
     */
    addExtra(who, n, seat) {
        const amount = Number(n) || 0;
        if (!amount) return this;
        if (who === 'both') this.combat.extraDamageBoth = (this.combat.extraDamageBoth || 0) + amount;
        else if (who === 'foe') {
            this.combat.extraDamageFoe = (this.combat.extraDamageFoe || 0) + amount;
            // The side of the foe is the mirror of the side of the owner.
            this.combat.extraDamageFoeSide = CombatSides.foe(CombatSides.sideOf(this.combat, seat));
        } else this.combat.extraDamage = (this.combat.extraDamage || 0) + amount;
        return this;
    }

    /**
     * The extra damage a side deals on top of the difference of its values. A
     * blow the shields stopped stays stopped: the damage the card adds to the
     * opponent is paid only when he really is hurt.
     */
    extra(side, base) {
        const c = this.combat;
        const damage = Math.max(0, Number(base) || 0);
        const extraFoe = damage > 0 ? (c.extraDamageFoe || 0) : 0;
        if (c.extraDamageFoeSide) {
            // The extra damage belongs to the side other than the owner's.
            return damage + (c.extraDamageFoeSide === side ? extraFoe : 0) + (c.extraDamageBoth || 0);
        }
        if (side === 'attacker') return damage + extraFoe + (c.extraDamageBoth || 0);
        return damage + (c.extraDamage || 0) + (c.extraDamageBoth || 0);
    }

    // --- how the damage goes -------------------------------------------------

    /** «распределять урон по 1 единице за раз»: the card turns the mode on. */
    setOneByOne() {
        this.combat.damageOneByOne = true;
        return this;
    }

    /** «шаг нанесения повреждений повторяется»: the card turns the repeat on. */
    setRepeat() {
        this.combat.repeatDamage = true;
        this.combat.damageRepeated = false;
        return this;
    }

    /** «распределять урон по 1 единице за раз» — the defender's damage only. */
    oneByOne(side) {
        return !!(this.combat.damageOneByOne && side === 'defender');
    }

    /** «шаг нанесения повреждений повторяется»: asked once, then twice never. */
    get repeats() {
        return !!this.combat.repeatDamage;
    }

    get repeated() {
        return !!this.combat.damageRepeated;
    }

    repeatOnce() {
        this.combat.damageRepeated = true;
        return this;
    }

    // --- the routing of a unit ----------------------------------------------

    /** «этот отряд не может быть деморализован» — for the round it was played in. */
    setNoRoute(seat, kl, round) {
        if (!this.combat.noRoute) this.combat.noRoute = [];
        this.combat.noRoute.push({ seat, round, kl });
        return this;
    }

    /**
     * Is the routing of this seat's piece forbidden? A piece of the printed
     * command level `kl` is covered by an entry of that level or higher; no entry
     * at all means every piece of the seat. `kl` of the piece is 0 for a token.
     */
    forbidsRoute(seat, kl, round) {
        return (this.combat.noRoute || []).some(x => {
            const one = typeof x === 'number' ? { seat: x } : x;
            if (one.seat !== seat) return false;
            if (round !== undefined && one.round !== undefined && one.round !== round) return false;
            return !one.kl || (kl || 0) <= one.kl;
        });
    }

    /** «нанесите урон вашим деморализованным отрядам в этом раунде» — by the turn. */
    allowOwnRouted(side, round) {
        if (!this.combat.ownRoutedDamage) this.combat.ownRoutedDamage = {};
        this.combat.ownRoutedDamage[side] = round;
        return this;
    }

    ownRoutedAllowed(side, round) {
        return !!this.combat.ownRoutedDamage && this.combat.ownRoutedDamage[side] === round;
    }

    // --- the piece that is hit first -----------------------------------------

    /** «этот отряд получает урон первым»: the entry of the round, in order. */
    addFirst(side, id, round) {
        if (!this.combat.damageFirst) this.combat.damageFirst = [];
        this.combat.damageFirst.push({ side, id, round });
        return this;
    }

    firstOf(side, round) {
        const list = (this.combat.damageFirst || []).filter(x => x && x.side === side
            && (round === undefined || x.round === undefined || x.round === round));
        return list.length ? list[0] : null;
    }

    lastFirst(round) {
        const list = (this.combat.damageFirst || []).filter(x => x && x.round === round);
        return list.length ? list[list.length - 1] : null;
    }

    /** «урон сверх здоровья выбранной цели теряется» — the piece that keeps it. */
    setExcess(side, id, round) {
        this.combat.ignoreExcess = { side, id, round };
        return this;
    }

    excessOf(round) {
        const one = this.combat.ignoreExcess;
        if (!one) return null;
        if (round !== undefined && one.round !== undefined && one.round !== round) return null;
        return one;
    }

    // --- the retreat instead of destruction ----------------------------------

    setRetreatPlan(seat, round) {
        this.combat.retreatInstead = { seat, round, used: false };
        return this.combat.retreatInstead;
    }

    /** The plan of this seat for this round, if it is not spent yet. */
    retreatPlan(seat, round) {
        const plan = this.combat.retreatInstead;
        if (!plan || plan.seat !== seat || plan.used) return null;
        if (round !== undefined && plan.round !== undefined && plan.round !== round) return null;
        return plan;
    }

    // --- the tokens taken at the start of the damage step --------------------

    /** «в начале шага повреждений противник теряет жетон» — kept until the step. */
    addStartTokens(entry) {
        if (!this.combat.damageStartTokens) this.combat.damageStartTokens = [];
        this.combat.damageStartTokens.push(entry);
        return this;
    }

    /** The entries the damage step has not taken yet; the step takes them once. */
    takeStartTokens(round) {
        const all = this.combat.damageStartTokens || [];
        if (!all.length) return [];
        if (this.combat.damageStartRound === round) return [];
        this.combat.damageStartRound = round;
        this.combat.damageStartTokens = [];
        return all.filter(x => !x || x.round === undefined || x.round === round);
    }

    // --- the damage of the round ---------------------------------------------

    /** The damage a side was dealt in this round (`combat.damage`). */
    dealt(side) {
        return (this.combat.damage && this.combat.damage[side]) || 0;
    }

    setDealt(side, n) {
        if (!this.combat.damage) this.combat.damage = { attacker: 0, defender: 0 };
        this.combat.damage[side] = n || 0;
        return this.combat.damage[side];
    }

    /** No side was dealt damage in this round: the battle has not begun to hurt. */
    get clean() {
        return this.dealt('attacker') === 0 && this.dealt('defender') === 0;
    }

    /** The damage of the round starts over: the next round hurts anew. */
    resetDamage() {
        this.combat.damage = { attacker: 0, defender: 0 };
        return this;
    }

    // --- the end of the round ------------------------------------------------

    /**
     * The effects printed «during this round of combat» end here: the health
     * bonus, the ceiling of the enemy, the routing ban, the chosen first target,
     * the retreat instead of destruction and the damage that keeps its excess.
     */
    clear() {
        const c = this.combat;
        c.healthBonus = null;
        c.enemyHealth = null;
        c.noRoute = null;
        c.damageFirst = null;
        c.retreatInstead = null;
        c.ignoreExcess = null;
        c.extraDamage = null;
        c.extraDamageFoe = null;
        c.extraDamageFoeSide = null;
        c.extraDamageBoth = null;
        c.damageOneByOne = null;
        c.repeatDamage = false;
        c.damageRepeated = false;
        return this;
    }
}

/** One set of damage rules per battle, like one turn per battle. */
CombatDamage.cache = new WeakMap();
