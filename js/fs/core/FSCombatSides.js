// FSCombatSides.js — who is who in a battle.
//
// A battle always has two sides, and the whole game speaks of them by name:
// «attacker» and «defender». The seat numbers behind those names live in
// `state.combat`, and every layer — the rules, the effect interpreter, the
// board view and the panel — has to translate one into the other. The same
// two lines (`seat === c.attacker ? 'attacker' : 'defender'` and its mirror)
// were written in more than fifty places; a battle that named its sides
// differently would have needed fifty fixes. They live here now.

const CombatSides = {
    ATTACKER: 'attacker',
    DEFENDER: 'defender',

    /** Is this string one of the two sides? */
    isSide(value) {
        return value === CombatSides.ATTACKER || value === CombatSides.DEFENDER;
    },

    /** The side of a seat in the battle: attacker, defender, or null for a bystander. */
    sideOf(combat, seat) {
        if (!combat || seat === null || seat === undefined) return null;
        if (seat === combat.attacker) return CombatSides.ATTACKER;
        if (seat === combat.defender) return CombatSides.DEFENDER;
        return null;
    },

    /** The other side. Anything that is not the attacker is treated as the defender. */
    foe(side) {
        return side === CombatSides.ATTACKER ? CombatSides.DEFENDER : CombatSides.ATTACKER;
    },

    /** The seat that plays a side. */
    seatOf(combat, side) {
        if (!combat) return null;
        return side === CombatSides.ATTACKER ? combat.attacker : combat.defender;
    },

    /** The seat that plays the other side of `seat`. */
    foeSeat(combat, seat) {
        if (!combat) return null;
        return seat === combat.attacker ? combat.defender : combat.attacker;
    },

    /**
     * The side a step belongs to: the steps are named after it
     * (reinforce-attacker, choose-defender, damage-attacker). A step without
     * a side in its name belongs to the defender.
     */
    sideFromStep(step) {
        return /-attacker$/.test(String(step || '')) ? CombatSides.ATTACKER : CombatSides.DEFENDER;
    },

    /** The step of the damage of a side: the panel and the rules name them alike. */
    damageStep(side) {
        return 'damage-' + (side === CombatSides.ATTACKER ? CombatSides.ATTACKER : CombatSides.DEFENDER);
    },
};
