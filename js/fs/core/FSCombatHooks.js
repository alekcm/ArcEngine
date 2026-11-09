// FSCombatHooks.js — the moments a battle waits for, as one object.
//
// A battle stops at the schemes of its players: «в начале шага нанесения
// повреждений», «Критический удар», «вместо того, чтобы играть боевую карту»,
// «в конце шага нанесения повреждений». Each of those moments is asked once per
// side and per step, and then the battle has to know WHERE to go on: the step
// that waited (`nextStep` is the turn's) and what the interrupted action was
// (`damageResume`, `damageEndResume`). Two more moments are queued from the
// start of the combat and asked later, when the question of the start is over
// (`prepQueued`, `roundSchemeQueued`), and one card makes the OPPONENT place the
// damage of a step (`assignDamage`).
//
// That is ten fields of `state.combat`, each with its own three lines of «has it
// been asked yet» in the rules and its own continuation in the effect
// interpreter. One question now: `CombatHooks.of(combat)`.

class CombatHooks {
    /** @param {any} combat the battle (the fields live on it) */
    constructor(combat) {
        this.combat = combat || {};
    }

    /** The hooks of a battle; null when there is no battle at all. */
    static of(combat) {
        if (!combat) return null;
        let hooks = CombatHooks.cache.get(combat);
        if (!hooks) {
            hooks = new CombatHooks(combat);
            CombatHooks.cache.set(combat, hooks);
        }
        return hooks;
    }

    // --- the moment is asked once --------------------------------------------

    /** Has the moment of this side been asked already? */
    asked(moment, side) {
        const all = this.combat[moment];
        return !!(all && (side === undefined ? all : all[side]));
    }

    /**
     * Take the moment: true the first time it is asked for this side, false
     * afterwards. One call is one question — the caller shows the scheme and
     * resumes the battle itself.
     */
    ask(moment, side) {
        if (!this.combat[moment]) this.combat[moment] = {};
        const all = this.combat[moment];
        if (side === undefined) {
            if (all.done) return false;
            all.done = true;
            return true;
        }
        if (all[side]) return false;
        all[side] = true;
        return true;
    }

    /** The moments of a step are asked again in the next step of the battle. */
    forget(...moments) {
        for (const moment of moments) this.combat[moment] = {};
        return this;
    }

    // --- the battle goes on with what it interrupted -------------------------

    /** The damage step that waited for a scheme («Критический удар»). */
    get damageResume() {
        return this.combat.damageResume || null;
    }

    set damageResume(resume) {
        this.combat.damageResume = resume || null;
    }

    /** The damage step takes its continuation and forgets it. */
    takeDamageResume() {
        const resume = this.damageResume;
        this.combat.damageResume = null;
        return resume;
    }

    /** The end of the damage step that waited for a scheme of its end. */
    get endResume() {
        return !!this.combat.damageEndResume;
    }

    set endResume(flag) {
        this.combat.damageEndResume = !!flag;
    }

    takeEndResume() {
        const flag = this.endResume;
        this.combat.damageEndResume = false;
        return flag;
    }

    /** The seat the end of the damage step goes on with, one by one. */
    endNext() {
        if (!this.combat.damageEndHook) this.combat.damageEndHook = { next: 0 };
        return this.combat.damageEndHook.next;
    }

    /** The next seat of the end of the damage step; the caller asks its scheme. */
    endStep() {
        const hook = this.combat.damageEndHook || (this.combat.damageEndHook = { next: 0 });
        return hook.next++;
    }

    forgetEnd() {
        this.combat.damageEndHook = null;
        return this;
    }

    // --- the moments queued from the start of the combat ---------------------

    /** The upgrade of the preparation step waits for the question of the start. */
    get prepQueued() {
        return !!this.combat.prepQueued;
    }

    set prepQueued(flag) {
        this.combat.prepQueued = !!flag;
    }

    takePrepQueued() {
        const flag = this.prepQueued;
        this.combat.prepQueued = false;
        return flag;
    }

    /** The scheme of the start of the round waits for the question of the start. */
    get roundQueued() {
        return !!this.combat.roundSchemeQueued;
    }

    set roundQueued(flag) {
        this.combat.roundSchemeQueued = !!flag;
    }

    takeRoundQueued() {
        const flag = this.roundQueued;
        this.combat.roundSchemeQueued = false;
        return flag;
    }

    // --- who places the damage of a step -------------------------------------

    /** «Во время шага нанесения повреждений Вы назначаете урон»: the owner of the card. */
    get assigner() {
        return this.combat.assignDamage || null;
    }

    assignTo(seat, side) {
        this.combat.assignDamage = { seat, side };
        return this.combat.assignDamage;
    }

    /** The seat that places the damage of a step: the named one, or the side's own. */
    assignSeat(seatOfSide) {
        const one = this.assigner;
        return one ? one.seat : seatOfSide;
    }

    // --- the start of the battle ---------------------------------------------

    /** Nothing has been asked yet: the moments of a fresh battle. */
    reset() {
        this.combat.playHook = {};
        this.combat.damageHook = {};
        this.combat.criticalHook = {};
        this.combat.damageEndHook = null;
        this.combat.damageEndResume = false;
        this.combat.damageResume = null;
        return this;
    }
}

/** One set of hooks per battle, like one turn per battle. */
CombatHooks.cache = new WeakMap();
