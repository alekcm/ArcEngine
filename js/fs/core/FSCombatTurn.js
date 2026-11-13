// FSCombatTurn.js — the turn of a battle: the round, the step and the dice.
//
// A battle is played in rounds of steps («reinforce-attacker», «choose-defender»,
// «reveal», «damage-attacker», «effect», «round-end»). The step is a string of
// `state.combat`, and every layer compares it with its own literals: the rules
// advance it, the effect interpreter holds it, the panel switches on it, the view
// names the side by it. The round is a number compared with the round of every
// entry a card puts on the table, and the dice of a side are an array that each
// reader filters, counts and pads to the limit of eight in its own way.
//
// Three questions, one object: `CombatTurn.of(combat)`.
//
// The object is a read/write VIEW of the fields of the battle: `round`, `step`,
// `nextStep` and `dice` stay where they are, so the state is still serialisable.

class CombatTurn {
    /** @param {any} combat the battle (the fields live on it) */
    constructor(combat) {
        this.combat = combat || {};
    }

    /** The turn of a battle; null when there is no battle at all. */
    static of(combat) {
        if (!combat) return null;
        let turn = CombatTurn.cache.get(combat);
        if (!turn) {
            turn = new CombatTurn(combat);
            CombatTurn.cache.set(combat, turn);
        }
        return turn;
    }

    /** The side a step belongs to: «damage-attacker» is the attacker's. */
    static sideOfStep(step) {
        return /-attacker$/.test(String(step || '')) ? 'attacker' : 'defender';
    }

    // --- the round -----------------------------------------------------------

    /** The round of the battle, from one. */
    get round() {
        const n = Number(this.combat.round);
        return Number.isFinite(n) && n > 0 ? n : 1;
    }

    set round(n) {
        this.combat.round = Math.max(1, Math.floor(Number(n) || 1));
    }

    /** The round is over: the next one is set, and the caller sees whether it fits. */
    nextRound() {
        this.round = this.round + 1;
        return this.round;
    }

    /** The limit of the rounds: three unless an order or a card said otherwise. */
    get maxRounds() {
        return this.combat.maxRounds || 3;
    }

    set maxRounds(n) {
        this.combat.maxRounds = Math.max(1, Math.floor(Number(n) || 3));
    }

    /** The battle has no rounds left after this one. */
    get lastRound() {
        return this.round >= this.maxRounds;
    }

    /**
     * Does an entry of the table (a card, a scheme, a named unit) belong to this
     * round? An entry without a round belongs to any.
     */
    inRound(entry) {
        if (!entry || entry.round === undefined || entry.round === null) return true;
        return entry.round === this.round;
    }

    /** The entries of the table that belong to this round. */
    ofRound(list) {
        return (list || []).filter(x => x && this.inRound(x));
    }

    /**
     * An entry is put on the table of the round: the list of the battle (a plan
     * of a card, a promise to the next round) gets it with the round it was
     * made in.
     */
    putEntry(field, entry) {
        if (!this.combat[field]) this.combat[field] = [];
        const one = Object.assign({}, entry);
        if (one.round === undefined) one.round = this.round;
        this.combat[field].push(one);
        return one;
    }

    /** The list of the battle a card fills, without a round of its own. */
    list(field) {
        if (!this.combat[field]) this.combat[field] = [];
        return this.combat[field];
    }

    // --- the step ------------------------------------------------------------

    /** The step of the battle. */
    get step() {
        return this.combat.step || null;
    }

    set step(value) {
        this.combat.step = value || null;
    }

    setStep(value) {
        this.step = value;
        return this.step;
    }

    /** Is the battle at one of these steps? */
    is(...steps) {
        return steps.indexOf(this.step) >= 0;
    }

    /** The side the current step belongs to (a step without a side is the defender's). */
    get side() {
        return CombatTurn.sideOfStep(this.step);
    }

    /** The step the battle waits to take after the current one. */
    get nextStep() {
        return this.combat.nextStep || null;
    }

    set nextStep(value) {
        this.combat.nextStep = value || null;
    }

    /** The battle takes the held step now; true when there was one. */
    release() {
        const next = this.nextStep;
        if (!next) return false;
        this.step = next;
        this.nextStep = null;
        return true;
    }

    /** The battle waits: the step is held until the effect is over. */
    hold(step) {
        this.nextStep = step || this.step;
        return this;
    }

    /**
     * The effect of a card takes the place of the step it interrupts: «effect» is
     * played now, `after` waits for its end.
     */
    holdEffect(after) {
        this.step = 'effect';
        this.nextStep = after || 'round-end';
        return this;
    }

    get choosing() {
        return this.is('choose-attacker', 'choose-defender');
    }

    get damaging() {
        return this.is('damage-attacker', 'damage-defender');
    }

    get reinforcing() {
        return this.is('reinforce-attacker', 'reinforce-defender');
    }

    // --- the dice ------------------------------------------------------------

    /** The dice of a side, as they lie on the table (a blank slot is null). */
    dice(side) {
        if (!this.combat.dice) this.combat.dice = { attacker: [], defender: [] };
        if (!this.combat.dice[side]) this.combat.dice[side] = [];
        return this.combat.dice[side];
    }

    /** Replace a side's initial roll while retaining the existing table array. */
    setDice(side, faces) {
        const dice = this.dice(side);
        dice.splice(0, dice.length, ...(faces || []));
        return this;
    }

    /** The dice that are still rolled: the blank slots are not dice. */
    live(side) {
        return this.dice(side).filter(Boolean);
    }

    /** How many dice of a face a side has. */
    count(side, face) {
        return this.dice(side).filter(d => d === face).length;
    }

    /** Is there a rolled die in this slot? */
    has(side, index) {
        const dice = this.dice(side);
        return Number.isInteger(index) && index >= 0 && index < dice.length
            && dice[index] !== null && dice[index] !== undefined;
    }

    /** How many dice the side may still take: «no more than eight in a combat». */
    room(side) {
        return Math.max(0, FS_RULES_CONFIG.DICE_MAX - this.live(side).length);
    }

    /** A die is added (a morale cube of a card, a stolen die): false when the table is full. */
    add(side, face) {
        if (this.room(side) <= 0) return false;
        this.dice(side).push(face);
        return true;
    }

    /** As many of these faces as fit; returns how many were added. */
    addMany(side, faces) {
        let added = 0;
        for (const face of faces || []) {
            if (!this.add(side, face)) break;
            added++;
        }
        return added;
    }

    /** The die is spent (made blank): the slot stays, the die does not. */
    take(side, index, only) {
        if (only !== undefined && this.dice(side)[index] !== only) return null;
        if (!this.has(side, index)) return null;
        const face = this.dice(side)[index];
        this.dice(side)[index] = null;
        return face;
    }

    /** The die is turned to a face. */
    put(side, index, face) {
        if (!this.has(side, index)) return false;
        this.dice(side)[index] = face;
        return true;
    }

    /** The index of the first die of a face, or -1. */
    indexOf(side, face) {
        return this.dice(side).indexOf(face);
    }

    /**
     * The slots a question may offer: every die that is still rolled and fits
     * the filter (a kind of cube, a union of kinds, none at all).
     */
    slots(side, fit) {
        const dice = this.dice(side);
        return dice.map((d, i) => i).filter(i => this.has(side, i) && (!fit || fit(dice[i])));
    }

    /** The faces on the table, each named once. */
    faces(side) {
        return [...new Set(this.live(side))];
    }

    /** The last die of a face, or -1 — «теряется последний выпавший». */
    lastOf(side, fit) {
        const dice = this.dice(side);
        for (let i = dice.length - 1; i >= 0; i--) {
            if (this.has(side, i) && (!fit || fit(dice[i]))) return i;
        }
        return -1;
    }
}

/** One turn per battle, like one set of tokens per battle. */
CombatTurn.cache = new WeakMap();
