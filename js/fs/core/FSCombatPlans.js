// FSCombatPlans.js — what the cards promised to a battle and to its next round.
//
// A combat card often does nothing at the moment it is played: it waits for the
// end of the damage step, for the end of the round or for the fall of a unit.
// The rules kept those promises in fourteen fields of `state.combat` — the plans
// of resurrection and of the fallen, «в конце этого раунда», «если ваши отряды не
// получат урона», the tokens promised to the next round, the effect deferred to
// the end of the damage step, the trick «деморализованные уничтожаются», the
// tokens a card keeps for its round — and every one of them was filtered by the
// round with its own copy of the same three lines.
//
// One question now: `CombatPlans.of(combat)`. It also remembers the facts of the
// round the promises are judged by: who stood at its start (`roster`), who
// retreated (`retreats`) and how many units were destroyed (`destroyedNow`).
//
// The object is a read/write VIEW of the fields of the battle: the state stays
// serialisable and an entry keeps the round it was made in.

class CombatPlans {
    /** @param {any} combat the battle (the fields live on it) */
    constructor(combat) {
        this.combat = combat || {};
    }

    /** The promises of a battle; null when there is no battle at all. */
    static of(combat) {
        if (!combat) return null;
        let plans = CombatPlans.cache.get(combat);
        if (!plans) {
            plans = new CombatPlans(combat);
            CombatPlans.cache.set(combat, plans);
        }
        return plans;
    }

    /** The turn of the battle: a promise belongs to a round. */
    get turn() {
        return CombatTurn.of(this.combat);
    }

    /** Does the entry belong to this round? An entry without a round belongs to any. */
    inRound(entry, round) {
        if (!entry) return false;
        const at = round === undefined ? this.turn.round : round;
        return entry.round === undefined || entry.round === null || entry.round === at;
    }

    /** The entries of a list that belong to this round. */
    ofRound(list, round) {
        return (list || []).filter(x => x && this.inRound(x, round));
    }

    // --- «Сфера воскрешения»: the plan and the fallen it waits for ------------

    /** The plans of resurrection of the cards: `{ seat, maxKl, round }`. */
    get resurrectPlans() {
        return this.combat.resurrectPlan || (this.combat.resurrectPlan = []);
    }

    addResurrectPlan(seat, maxKl) {
        this.turn.putEntry('resurrectPlan', { seat, maxKl: maxKl === undefined ? 1 : maxKl });
        return this;
    }

    /** The units that fell and may come back: `{ id, seat, destroyed, … }`. */
    get candidates() {
        return this.combat.resurrectCandidates || (this.combat.resurrectCandidates = []);
    }

    /** A fallen unit is noted once: the first candidate is asked about. */
    noteCandidate(entry) {
        if (!entry || !entry.id) return false;
        if (this.candidates.some(x => x.id === entry.id)) return false;
        this.candidates.push(entry);
        return true;
    }

    /** The candidate the battle asks about: the first one. */
    get candidate() {
        return this.candidates.length ? this.candidates[0] : null;
    }

    /** The seat that was asked about its scheme already — asked once. */
    get askedSeat() {
        return this.combat.resurrectAsked === undefined ? null : this.combat.resurrectAsked;
    }

    askSeat(seat) {
        this.combat.resurrectAsked = seat;
        return this;
    }

    /** The question is over: the candidates and the plans of the round are spent. */
    clearResurrect() {
        this.combat.resurrectCandidates = [];
        this.combat.resurrectPlan = [];
        return this;
    }

    /** A refused sphere may be offered for a new loss in a later damage step. */
    resetResurrectStep() {
        this.combat.resurrectCandidates = [];
        this.combat.resurrectAsked = null;
        return this;
    }

    // --- «Уклонение»: the fallen of the step come back at its end -------------

    addRestoreFallen(seat, maxKl) {
        this.turn.putEntry('restoreFallen', {
            seat,
            maxKl: maxKl === undefined ? 0 : maxKl,
            asked: false, done: false,
        });
        return this;
    }

    /** The first plan of this round that was not asked about yet. */
    restorePlan(round) {
        return this.ofRound(this.combat.restoreFallen, round).find(x => !x.asked && !x.done) || null;
    }

    /** A repeated damage step can have its own fallen and its own offer. */
    resetFallenStep() {
        this.clearFallen();
        for (const plan of this.ofRound(this.combat.restoreFallen)) {
            plan.asked = false;
            plan.done = false;
            delete plan.candidates;
        }
        return this;
    }

    // --- «в конце этого раунда …» ---------------------------------------------

    addEndPlan(entry) {
        this.turn.putEntry('endRoundPlans', Object.assign({ fired: false }, entry));
        return this;
    }

    /** The first plan of the end of this round that has not fired. */
    endPlan(round) {
        return this.ofRound(this.combat.endRoundPlans, round).find(x => !x.fired) || null;
    }

    /** «если ни один из ваших отрядов не отступил во время этого раунда». */
    addNoRetreatPlan(entry) {
        this.turn.putEntry('endRoundNoRetreat', Object.assign({ fired: false }, entry));
        return this;
    }

    noRetreatPlan(round) {
        return this.ofRound(this.combat.endRoundNoRetreat, round).find(x => !x.fired) || null;
    }

    /** «если ваши отряды или бастионы не получат урона в конце этого раунда». */
    addNoDamagePlan(entry) {
        this.turn.putEntry('noDamageRetreat', Object.assign({ fired: false }, entry));
        return this;
    }

    noDamagePlan(round) {
        return this.ofRound(this.combat.noDamageRetreat, round).find(x => !x.fired) || null;
    }

    // --- «получите жетоны в следующем раунде» ---------------------------------

    /** A card promises tokens to the round after this one. */
    addLaterToken(entry) {
        const one = Object.assign({}, entry);
        if (one.round === undefined) one.round = this.turn.round + 1;
        if (!this.combat.laterTokens) this.combat.laterTokens = [];
        this.combat.laterTokens.push(one);
        return one;
    }

    /** The tokens promised to this round; the promise is taken, not repeated. */
    takeLaterTokens(round) {
        const later = this.ofRound(this.combat.laterTokens, round);
        this.combat.laterTokens = (this.combat.laterTokens || []).filter(x => !this.inRound(x, round));
        return later;
    }

    // --- the effect that waits for the end of the damage step -----------------

    /** Effects waiting for the end of damage; old saves stored one object. */
    deferredEntries() {
        const saved = this.combat.deferDamage;
        return Array.isArray(saved) ? saved : (saved ? [saved] : []);
    }

    get deferred() {
        return this.deferredEntries()[0] || null;
    }

    setDeferred(entry) {
        const list = this.deferredEntries();
        const one = Object.assign({ round: this.turn.round }, entry);
        list.push(one);
        this.combat.deferDamage = list;
        return one;
    }

    /** Take each effect once per step, in the order in which it was created. */
    takeDeferred() {
        const one = this.deferredEntries().find(x => !x.done && this.inRound(x));
        if (!one) return null;
        one.done = true;
        return one;
    }

    /** Only an effect printed for every damage step is armed for a repeat. */
    resetDeferredStep() {
        for (const one of this.deferredEntries()) {
            // Older saved «Рой потрошителей» steps did not have the flag.
            const eachStep = one.eachStep === true || (one.eachStep === undefined
                && (one.steps || []).some(x => x.op === 'gainMateriel' && x.per === 'destroyedStep'));
            if (eachStep && this.inRound(one)) one.done = false;
        }
        return this;
    }

    // --- «деморализованные отряды противника уничтожаются» --------------------

    get routedFoe() {
        return this.combat.destroyRoutedFoe || null;
    }

    setRoutedFoe(entry) {
        this.combat.destroyRoutedFoe = Object.assign({ round: this.turn.round }, entry);
        return this.combat.destroyRoutedFoe;
    }

    /** A unit of the opponent was routed: the promise of the card is armed. */
    touchRoutedFoe() {
        if (this.combat.destroyRoutedFoe) this.combat.destroyRoutedFoe.touched = true;
        return this;
    }

    /** A new routing, including one in a repeated damage step, needs a decision. */
    noteRoutedFoe(seat, id) {
        const plan = this.routedFoe;
        if (!plan || plan.seat === seat || !this.inRound(plan)) return this;
        plan.done = false;
        plan.handled = (plan.handled || []).filter(x => x !== id);
        return this;
    }

    clearRoutedFoe() {
        this.combat.destroyRoutedFoe = null;
        return this;
    }

    // --- «не сбрасывать жетоны в конце этого раунда» --------------------------

    /** The side keeps the tokens of a kind for the round of the card. */
    keepTokens(side, kind, round, extra) {
        if (!this.combat.keepTokens) this.combat.keepTokens = {};
        const keep = this.combat.keepTokens[side] || {};
        keep[kind === 'att' ? 'att' : 'def'] = true;
        keep.round = round === undefined ? this.turn.round : round;
        // «Если в этом раунде будет уничтожен ваш юнит с командным уровнем 2,
        // сохраните все ваши `att. token`» («Геройское самосожжение»): the
        // promise is judged by the fallen of the round when the round ends.
        if (extra && extra.ifFallenKl !== undefined && extra.ifFallenKl !== null) {
            keep.ifFallenKl = extra.ifFallenKl;
        } else {
            delete keep.ifFallenKl;
        }
        this.combat.keepTokens[side] = keep;
        return keep;
    }

    /** Does the side keep the tokens of this kind in this round? */
    keeps(side, kind, round) {
        const k = (this.combat.keepTokens || {})[side];
        if (!k) return false;
        if (!this.inRound(k, round)) return false;
        if (k.ifFallenKl !== undefined && k.ifFallenKl !== null) {
            const seat = CombatSides.seatOf(this.combat, side);
            if (!this.fallenInRound(seat).some(x => (x.kl || 0) === k.ifFallenKl)) return false;
        }
        return !!k[kind === 'att' ? 'att' : 'def'];
    }

    clearKeeps() {
        this.combat.keepTokens = null;
        return this;
    }

    // --- who fell in this step, who stood at the start of the round -----------

    /** A unit that fell in the damage step is noted once. */
    noteFallen(entry) {
        if (!entry || !entry.id) return false;
        if (!this.combat.fallenThisStep) this.combat.fallenThisStep = [];
        if (this.combat.fallenThisStep.some(x => x.id === entry.id)) return false;
        this.combat.fallenThisStep.push(entry);
        // The destroyed of the whole round outlive a repeated damage step:
        // «Если в этом раунде будет уничтожен ваш юнит с командным уровнем 2»
        // («Геройское самосожжение») is judged when the round ends.
        if (entry.destroyed) {
            if (!this.combat.fallenThisRound) this.combat.fallenThisRound = [];
            if (!this.combat.fallenThisRound.some(x => x.id === entry.id)) {
                this.combat.fallenThisRound.push({ id: entry.id, seat: entry.seat, kl: entry.kl || 0 });
            }
        }
        return true;
    }

    /** The units destroyed in this round of the battle; `seat` picks one player's. */
    fallenInRound(seat) {
        const all = this.combat.fallenThisRound || [];
        return seat === undefined ? all : all.filter(x => x.seat === seat);
    }

    /** The units that fell in this step; `seat` picks those of one player. */
    fallen(seat) {
        const all = this.combat.fallenThisStep || [];
        return seat === undefined ? all : all.filter(x => x.seat === seat);
    }

    clearFallen() {
        this.combat.fallenThisStep = [];
        return this;
    }

    /** The roster of the round: who stood where when it began. */
    get roster() {
        return this.combat.roundUnits || null;
    }

    set roster(roster) {
        this.combat.roundUnits = roster;
    }

    /**
     * The units of a seat as the start of the round recorded them. The roster is
     * kept by side, the cards ask by seat: the side of the seat is the
     * translation, and a seat that was recorded itself is honoured.
     */
    rosterOf(seat) {
        const roster = this.combat.roundUnits || {};
        if (roster[seat]) return roster[seat];
        const side = CombatSides.sideOf(this.combat, seat);
        return (side && roster[side]) || [];
    }

    // --- the facts of the round the promises are judged by --------------------

    /** The seat retreated in this round: its promises of the round are void. */
    markRetreat(seat, round) {
        if (!this.combat.retreated) this.combat.retreated = {};
        this.combat.retreated[seat] = round === undefined ? this.turn.round : round;
        return this;
    }

    /** «если ни один из ваших отрядов не отступил во время этого раунда». */
    retreatedThisRound(seat, round) {
        const at = round === undefined ? this.turn.round : round;
        return !!(this.combat.retreated && this.combat.retreated[seat] === at);
    }

    /** «за каждый уничтоженный отряд»: the count of the step. */
    get destroyedNow() {
        return this.combat.destroyedNow || 0;
    }

    addDestroyed(n) {
        this.combat.destroyedNow = this.destroyedNow + (Number(n) || 0);
        return this.combat.destroyedNow;
    }

    resetDestroyed() {
        this.combat.destroyedNow = 0;
        return this;
    }

    // --- the end of the round -------------------------------------------------

    // --- «Божественное избавление»: the dice an order promised to its battle --

    /** The dice a card of the order gives «в шаге вызова подкреплений»: `{ seat, list }`. */
    get startDice() {
        return this.combat.startDice || null;
    }

    setStartDice(entry) {
        this.combat.startDice = entry || null;
        return this;
    }

    /** The promise is kept once: it is taken when the reinforcement step ends. */
    takeStartDice() {
        const entry = this.startDice;
        this.combat.startDice = null;
        return entry;
    }

    // --- «Несокрушимая вера»: the morale of the routed units counts in part --

    /** The seats whose routed units add half their morale to the resolution. */
    get routedMoraleHalf() {
        return this.combat.routedMoraleHalf || (this.combat.routedMoraleHalf = []);
    }

    setRoutedMoraleHalf(seat) {
        if (!this.routedMoraleHalf.includes(seat)) this.routedMoraleHalf.push(seat);
        return this;
    }

    countsRoutedMoraleHalf(seat) {
        return this.routedMoraleHalf.includes(seat);
    }

    /**
     * The promises of the round that is over go away, and the facts of the round
     * that begins are empty. `round` is the round the battle is in now.
     */
    expire(round) {
        const at = round === undefined ? this.turn.round : round;
        if (this.combat.destroyRoutedFoe && !this.inRound(this.combat.destroyRoutedFoe, at)) this.clearRoutedFoe();
        this.combat.resurrectPlan = this.ofRound(this.combat.resurrectPlan, at);
        this.combat.restoreFallen = this.ofRound(this.combat.restoreFallen, at).filter(x => !x.done);
        this.combat.endRoundPlans = this.ofRound(this.combat.endRoundPlans, at);
        this.combat.endRoundNoRetreat = this.ofRound(this.combat.endRoundNoRetreat, at);
        this.combat.noDamageRetreat = this.ofRound(this.combat.noDamageRetreat, at);
        this.combat.deferDamage = this.ofRound(this.deferredEntries(), at);
        this.clearFallen();
        this.combat.fallenThisRound = [];
        this.combat.resurrectCandidates = [];
        this.combat.resurrectAsked = null;
        return this;
    }
}

/** One set of promises per battle, like one turn per battle. */
CombatPlans.cache = new WeakMap();
