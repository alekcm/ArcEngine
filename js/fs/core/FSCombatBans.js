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
// bans live until the battle ends — none of them is cleaned at the end of a
// round — so the object has no `clear`: it dies with the battle.

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

    /** The attack dice of the defender stay on the table but count for nothing. */
    ignoreFoeAttack() {
        this.combat.ignoreFoeAtt = true;
        return this;
    }

    /** Are the attack dice of this side useless? Only the defender suffers. */
    ignoresFoeAttack(side) {
        return !!this.combat.ignoreFoeAtt && side === 'defender';
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
