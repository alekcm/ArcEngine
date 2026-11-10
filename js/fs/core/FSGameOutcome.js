// FSGameOutcome.js — the end of a game, as one object.
//
// «The game ends when a player collects enough objectives, when only one player
// is left, or when the last round is over.» The rules wrote that end in three
// places of the refresh phase, each with its own three fields (`state.over`,
// `state.winner`, `state.shared`) and each with its own sentence for the log;
// the panel and the board then asked the same three fields to know whether the
// game goes on and who won.
//
// One question now: `GameOutcome.of(state).over`, `.winner`, `.winnerSeat`,
// `.tied`, and the two ways a game ends — `declare({ winner, shared })` and
// `byElimination(seat)`. The lines the log and the panel print come from here
// too: a name is the only thing the caller has to bring.

class GameOutcome {
    /** @param {any} state the game state (the fields live on it) */
    constructor(state) {
        this.state = state || {};
    }

    /** The end of a game; null when there is no state at all. */
    static of(state) {
        if (!state) return null;
        let outcome = GameOutcome.cache.get(state);
        if (!outcome) {
            outcome = new GameOutcome(state);
            GameOutcome.cache.set(state, outcome);
        }
        return outcome;
    }

    /** Is the game over? */
    get over() {
        return !!this.state.over;
    }

    /** The game is over. */
    end() {
        this.state.over = true;
        return this;
    }

    /** The seat that won, or null when nobody did (all players are out). */
    get winner() {
        return this.state.winner === undefined ? null : this.state.winner;
    }

    /** Is this seat the winner? */
    isWinner(seat) {
        return this.winner !== null && this.winner === seat;
    }

    /** The seats that share the victory; empty when the victory is not shared. */
    get shared() {
        return Array.isArray(this.state.shared) ? this.state.shared : [];
    }

    /** Is the victory shared by more than one player? */
    get tied() {
        return this.shared.length > 1;
    }

    /** Does this seat take part in the victory? */
    shares(seat) {
        return this.tied ? this.shared.includes(seat) : this.isWinner(seat);
    }

    /** The game is won: the objectives are collected or the round ran out. */
    declare(won) {
        this.state.over = true;
        this.state.winner = won && won.winner !== undefined ? won.winner : null;
        this.state.shared = won && won.shared && won.shared.length > 1 ? won.shared.slice() : undefined;
        if (!this.state.shared) delete this.state.shared;
        return this;
    }

    /** Only one player is left on the map: he wins, or nobody does. */
    byElimination(seat) {
        return this.declare({ winner: seat === undefined ? null : seat });
    }

    /** The last round is over: the leader wins, or the victory is shared. */
    byRound(seat, shared) {
        return this.declare({ winner: seat, shared });
    }

    /** The seats of the victory, winner first. */
    victors() {
        if (this.tied) return this.shared.slice();
        return this.winner === null ? [] : [this.winner];
    }

    /** «Побеждает: X» or «Победа делится: X и Y»; empty while the game is on. */
    headline(nameOf) {
        if (!this.over) return '';
        const name = seat => (nameOf ? nameOf(seat) : String(seat));
        if (this.tied) return 'Победа делится: ' + this.shared.map(name).join(' и ');
        return 'Побеждает: ' + (this.winner === null ? '—' : name(this.winner));
    }

    /** The chronicle of the end of the game. */
    note(why) {
        const tail = why ? ': ' + why : '';
        if (this.tied) return 'Игра закончена вничью' + tail + '.';
        return 'Игра закончена. ' + this.headline() + tail + '.';
    }
}

/** One outcome per state, like one result per game. */
GameOutcome.cache = new WeakMap();
