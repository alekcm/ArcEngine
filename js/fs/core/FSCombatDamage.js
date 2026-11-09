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

    /** «+1 к здоровью ваших отрядов»: the bonus the side of the owner gets. */
    get healthBonus() {
        return this.combat.healthBonus || 0;
    }

    addHealthBonus(n) {
        this.combat.healthBonus = this.healthBonus + (Number(n) || 0);
        return this.combat.healthBonus;
    }

    /** «здоровье отрядов противника уменьшается до 3»: the ceiling of the enemy. */
    get enemyHealth() {
        return this.combat.enemyHealth || 0;
    }

    set enemyHealth(n) {
        this.combat.enemyHealth = n || null;
    }

    /**
     * The health of a piece as this round of cards shapes it: the bonus of its
     * own side raised, the ceiling of the enemy lowered. `actor` is the seat that
     * deals the damage, `owner` the seat of the piece.
     */
    health(owner, actor, base) {
        let health = Number(base) || 0;
        if (this.healthBonus && owner === actor) health += this.healthBonus;
        if (this.enemyHealth && owner !== actor) health = Math.min(health, this.enemyHealth);
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
            this.combat.extraDamageFoeSide = seat === this.combat.attacker ? 'defender' : 'attacker';
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
