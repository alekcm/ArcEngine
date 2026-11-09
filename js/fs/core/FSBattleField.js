// FSBattleField.js — where a battle stands: one system and one area.
//
// A battle happens in a single area, and half of the rules ask «кто здесь?»:
// `u.system === c.system && u.area === c.pos` is written in more than twenty
// places — the pieces, the damage, the cards, the deployment, the board and the
// panel — with the field names spelled differently every time. A structure is
// asked the same question with `s.area` instead of `u.area`, and the two halves
// of the address travel together everywhere: they are one place, not two.
//
// One question now: `BattleField.of(combat).holds(unit)`. The address still
// lives in `combat.system`/`combat.pos` — the state stays serialisable — but the
// comparison of a piece with the place of the battle is written once.

class BattleField {
    /** @param {any} combat the battle (the address lives on it) */
    constructor(combat) {
        this.combat = combat || {};
    }

    /** The place of a battle; null when there is no battle at all. */
    static of(combat) {
        if (!combat) return null;
        let field = BattleField.cache.get(combat);
        if (!field) {
            field = new BattleField(combat);
            BattleField.cache.set(combat, field);
        }
        return field;
    }

    /** The system of the battle. */
    get system() {
        return this.combat.system;
    }

    /** The area of the battle inside its system. */
    get pos() {
        return this.combat.pos;
    }

    /** The address of the battle as the board and the orders spell it. */
    get area() {
        return { system: this.combat.system, pos: this.combat.pos };
    }

    /** The battle begins somewhere: the address is written once, by the attacker. */
    set(systemId, pos) {
        this.combat.system = systemId;
        this.combat.pos = pos;
        return this;
    }

    /** Is this system and this area the place of the battle? */
    is(systemId, pos) {
        return this.combat.system === systemId && this.combat.pos === pos;
    }

    /** Is this piece — a unit, a structure, a bastion — in the place of the battle? */
    holds(piece) {
        if (!piece) return false;
        return this.is(piece.system, piece.area !== undefined ? piece.area : piece.pos);
    }

    /** The units of a seat that stand here. */
    units(state, seat) {
        return (state.units || []).filter(u => u.seat === seat && this.holds(u));
    }

    /** The bastions of a seat that stand here. */
    bastions(state, seat) {
        return (state.structures || [])
            .filter(s => s.seat === seat && s.type === 'bastion' && this.holds(s));
    }

    /** Every unit that stands here, both seats. */
    unitsHere(state) {
        return (state.units || []).filter(u => this.holds(u));
    }

    /** The routed units of a seat that stand here. */
    routed(state, seat) {
        return this.units(state, seat).filter(u => u.routed);
    }
}

/** One field per battle, like one turn per battle. */
BattleField.cache = new WeakMap();
