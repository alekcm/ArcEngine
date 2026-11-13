// FSCombatBans.js — what a battle forbids: the reinforce, the attack dice and
// the routed units of the round.
//
// Three cards say «нет» rather than «да»: «Ваш противник не сможет разыгрывать
// жетоны подкрепления» (the ban follows the owner of the card), «кубики атаки
// противника не считаются», «деморализованные отряды уничтожаются в конце
// раунда». Each kept its own flag on `state.combat`, and the rules asked the
// flags apart: the reinforcement ban was a boolean plus a seat, the attack dice
// were filtered in two copies of the same line, and the destruction of the
// routed units was a lone flag read once at the end of the round.
//
// One question now: `CombatBans.of(combat).forbidsReinforce(seat, side)`.
// Tyranids ban reinforcement for the whole battle; Tau ban it only during
// preparation. Multiple bans can coexist. The ban of the attack dice is scoped
// to the current round and names the OTHER side of whoever played the card.

class CombatBans {
    /** @param {any} combat the battle (the flags live on it) */
    constructor(combat) {
        this.combat = combat || {};
    }

    /** The bans of a battle; null when there is no battle at all. */
    static of(combat) {
        if (!combat) return null;
        let bans = CombatBans.cache.get(combat);
        if (!bans) {
            bans = new CombatBans(combat);
            CombatBans.cache.set(combat, bans);
        }
        return bans;
    }

    // --- «ваш противник не сможет разыгрывать жетоны подкрепления» ------------

    /** A plan forbids one seat, either during preparation or the whole battle. */
    forbidReinforce(seat, scope) {
        // Import the single-ban representation of older saves before adding a
        // second ban. Both combatants can play plans at the same start window.
        if (!Array.isArray(this.combat.reinforceBans)) {
            this.combat.reinforceBans = this.combat.noReinforce
                ? [{ seat: this.combat.noReinforceSeat == null ? null : this.combat.noReinforceSeat, scope: 'battle' }]
                : [];
        }
        const named = seat === undefined ? null : seat;
        const duration = scope === 'preparation' || scope === 'round' ? scope : 'battle';
        // «не может размещать жетоны подкрепления в эту область … в текущем
        // раунде битвы» («Фанатичное рвение»): the ban of one execution round.
        const round = duration === 'round' ? this.roundOfBattle : undefined;
        if (!this.combat.reinforceBans.some(b => b.seat === named && b.scope === duration && b.round === round)) {
            this.combat.reinforceBans.push(round === undefined ? { seat: named, scope: duration }
                : { seat: named, scope: duration, round });
        }
        // Keep the old fields for save compatibility and readers of old states.
        this.combat.noReinforce = true;
        this.combat.noReinforceSeat = named;
        return this;
    }

    /** Is this seat forbidden to reinforce? Without a named seat — the defender. */
    forbidsReinforce(seat, side) {
        if (!this.combat.noReinforce) return false;
        const bans = Array.isArray(this.combat.reinforceBans) ? this.combat.reinforceBans
            : [{ seat: this.combat.noReinforceSeat, scope: 'battle' }];
        const turn = CombatTurn.of(this.combat);
        const prepSteps = ['combat-start', 'reinforce-attacker', 'reinforce-defender'];
        // A question can replace the visible step with `effect`; its held step
        // (or the reinforcement-end continuation) still belongs to preparation.
        const preparing = !!(turn && (prepSteps.includes(turn.step)
            || (turn.is('effect') && (prepSteps.includes(turn.nextStep)
                || !!CombatTokens.of(this.combat).pending))));
        return bans.some(b => {
            const applies = b.seat == null ? side === 'defender' : b.seat === seat;
            if (!applies) return false;
            if (b.scope === 'round') return b.round === this.roundOfBattle;
            return b.scope !== 'preparation' || preparing;
        });
    }

    // --- «не может … восстанавливать свои отряды в текущем раунде битвы» ------

    /** The named side may not restore its routed units in this round. */
    forbidRestore(side) {
        if (!Array.isArray(this.combat.restoreBans)) this.combat.restoreBans = [];
        const round = this.roundOfBattle;
        if (!this.combat.restoreBans.some(b => b.side === side && b.round === round)) {
            this.combat.restoreBans.push({ side, round });
        }
        return this;
    }

    forbidsRestore(side) {
        return (this.combat.restoreBans || []).some(b => b.side === side && b.round === this.roundOfBattle);
    }

    // --- «не может разыграть общие способности на следующей открытой карте» ---

    /**
     * «Ослепляющий залп», «Руководство по вере»: the next combat card the
     * named side turns over is read without its general abilities. The ban
     * waits for that card and is spent by it.
     */
    banGeneral(side) {
        if (!Array.isArray(this.combat.generalBans)) this.combat.generalBans = [];
        if (!this.combat.generalBans.includes(side)) this.combat.generalBans.push(side);
        return this;
    }

    /** Does this reveal lose its general abilities? The ban is used up by it. */
    takeGeneralBan(side) {
        const list = Array.isArray(this.combat.generalBans) ? this.combat.generalBans : [];
        const at = list.indexOf(side);
        if (at < 0) return false;
        list.splice(at, 1);
        return true;
    }

    // --- «боевая карта выбирается случайным образом» --------------------------

    /**
     * «В следующем раунде битвы каждый раз, когда ваш противник должен выбрать
     * боевую карту, она выбирается случайным образом» («Познание агонии»):
     * the choice of the named side in the named round is made by the dice.
     */
    randomCards(side, round) {
        if (!Array.isArray(this.combat.randomCardRounds)) this.combat.randomCardRounds = [];
        if (!this.combat.randomCardRounds.some(x => x.side === side && x.round === round)) {
            this.combat.randomCardRounds.push({ side, round });
        }
        return this;
    }

    randomCardFor(side) {
        return (this.combat.randomCardRounds || []).some(x => x.side === side && x.round === this.roundOfBattle);
    }

    /** «во время всего боя»: the ban is known while the battle lasts. */
    get reinforceBanned() {
        return !!this.combat.noReinforce;
    }

    /** Combat tokens the named side cannot gain during this execution round. */
    forbidTokenGain(side, kind, source) {
        if (!this.combat.tokenGainBans) this.combat.tokenGainBans = [];
        this.combat.tokenGainBans.push({ side, kind, round: this.roundOfBattle, source: source || null });
        return this;
    }

    forbidsTokenGain(side, kind) {
        return (this.combat.tokenGainBans || []).some(b => b.side === side
            && b.kind === kind && b.round === this.roundOfBattle
            && (!b.source || CombatCards.of(this.combat).played(b.source.side)
                .some(card => card.effectSourceId === b.source.id)));
    }

    // --- «кубики атаки противника не считаются» -------------------------------

    /**
     * The attack dice of `side` stay on the table but count for nothing until the
     * end of the current round of this battle.
     *
     * «В этом раунде игнорируйте все вражеские `att. cube`» names the foe of the
     * player who played the card, not «the defender»: the same card played by an
     * attacker silences the defence of its owner. The round it was played in is
     * remembered, so the ban is over before the next one.
     */
    ignoreFoeAttack(side) {
        this.combat.ignoreFoeAtt = !side || side === 'defender' ? 'defender' : 'attacker';
        this.combat.ignoreFoeAttRound = this.roundOfBattle;
        return this;
    }

    /** Are the attack dice of this side useless? Only in the round of the card. */
    ignoresFoeAttack(side) {
        if (!this.combat.ignoreFoeAtt) return false;
        if (this.combat.ignoreFoeAtt !== side) return false;
        const round = this.combat.ignoreFoeAttRound;
        // A ban without a round is the ban of the battle itself.
        if (round === undefined || round === null) return true;
        return round === this.roundOfBattle;
    }

    /** The round of the battle — «ход боя: один объект», so it is asked here. */
    get roundOfBattle() {
        return CombatTurn.of(this.combat).round;
    }

    /** The dice of a side as the battle counts them. */
    dice(side, dice) {
        const all = dice || [];
        return this.ignoresFoeAttack(side) ? all.filter(d => d !== 'att') : all;
    }

    // --- «деморализованные отряды уничтожаются в конце раунда» ----------------

    /** The card promises the destruction of the routed units at the round end. */
    markDestroyRouted() {
        this.combat.destroyRouted = true;
        return this;
    }

    /** Does the end of the round destroy the routed units? */
    get destroysRouted() {
        return !!this.combat.destroyRouted;
    }
}

/** One set of bans per battle, like one turn per battle. */
CombatBans.cache = new WeakMap();
