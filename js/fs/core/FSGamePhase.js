// FSGamePhase.js — the phase of a round and whose turn it is, as one object.
//
// A round of the game walks through four phases — сборка карты, планирование,
// операции, обновление — and inside a phase one player at a time acts. The rules
// kept that in two fields of the state (`state.phase` and `state.turn`) and every
// layer compared them with literals: the rules guarded a command with
// `if (state.phase !== 'operations')`, the panel painted the header with its own
// map of names, and the board decided whether it is the setup by looking at
// `state.phase === 'setup'`. The names of the phases were spelled out in two
// dozen places.
//
// One question now: `GamePhase.of(state).is('operations')`, `.start('refresh')`,
// `.active` — who acts now, the setup's own player or the turn of the phase.
// The two fields stay on the state; the vocabulary and the reader are here.

class GamePhase {
    /** @param {any} state the game state (the fields live on it) */
    constructor(state) {
        this.state = state || {};
    }

    /** The phase of a game; null when there is no state at all. */
    static of(state) {
        if (!state) return null;
        let phase = GamePhase.cache.get(state);
        if (!phase) {
            phase = new GamePhase(state);
            GamePhase.cache.set(state, phase);
        }
        return phase;
    }

    /** The four phases of a round, in the order they are played. */
    static SETUP = 'setup';
    static PLANNING = 'planning';
    static OPERATIONS = 'operations';
    static REFRESH = 'refresh';

    /** The names the panel prints for the phases. */
    static LABELS = {
        setup: 'Сборка карты',
        planning: 'Планирование',
        operations: 'Операции',
        refresh: 'Обновление',
    };

    /** The phase, by name. */
    get name() {
        return this.state.phase || null;
    }

    /** Is the game at one of these phases? */
    is(...names) {
        const here = this.name;
        for (const n of names) if (n === here) return true;
        return false;
    }

    /** The phase begins. */
    start(name) {
        this.state.phase = name === undefined ? null : name;
        return this;
    }

    /** The name of the phase for the panel («Сборка карты», «Операции», …). */
    get label() {
        return GamePhase.LABELS[this.name] || this.name || 'Галактическая война';
    }

    /** The round the game is in, or null before the board is built. */
    get round() {
        return this.state.round;
    }

    // --- whose turn it is -----------------------------------------------------

    /** The seat that acts now: the setup builds the board in its own order. */
    get active() {
        if (this.is(GamePhase.SETUP)) {
            const setup = this.state.setup;
            return setup ? setup.turn : null;
        }
        return this.state.turn === undefined ? null : this.state.turn;
    }

    /** Does this seat act now? */
    isActive(seat) {
        return this.active !== null && this.active === seat;
    }

    /** The turn passes to a seat; the setup keeps its own order. */
    set turn(seat) {
        this.state.turn = seat === undefined ? null : seat;
    }

    get turn() {
        return this.state.turn === undefined ? null : this.state.turn;
    }

    /** The next seat in the circle of the given number of players. */
    static next(seat, count) {
        if (!count) return seat;
        return (seat + 1) % count;
    }
}

/** One phase per state, like one board per state. */
GamePhase.cache = new WeakMap();
