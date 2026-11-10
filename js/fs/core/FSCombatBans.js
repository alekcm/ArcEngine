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
// One question now: `CombatBans.of(combat).forbidsReinforce(seat, side)`. The
// bans of the reinforcement live until the battle ends — that one is cleaned by
// nothing. The ban of the attack dice is different: its card says «в этом
// раунде игнорируйте все вражеские `att. cube`» — it names the OTHER side of
// whoever played it, and it dies with the round it was played in.

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

    /** The card forbids the reinforcement of one seat for the whole battle. */
    forbidReinforce(seat) {
        this.combat.noReinforce = true;
        this.combat.noReinforceSeat = seat === undefined ? null : seat;
        return this;
    }

    /** Is this seat forbidden to reinforce? Without a named seat — the defender. */
    forbidsReinforce(seat, side) {
        if (!this.combat.noReinforce) return false;
        const named = this.combat.noReinforceSeat;
        if (named === undefined || named === null) return side === 'defender';
        return named === seat;
    }

    /** «во время всего боя»: the ban is known while the battle lasts. */
    get reinforceBanned() {
        return !!this.combat.noReinforce;
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
