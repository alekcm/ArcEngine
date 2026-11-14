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

    /**
     * How long the party is: the number of rounds chosen in the lobby (eight in
     * the printed game, five in a «блиц»). Everything that depends on the stage
     * of the party — the end of the game, the panels, the bots — reads this
     * number and never a literal round.
     */
    get rounds() {
        return GamePhase.length(this.state.rounds);
    }

    /** A valid length of a party: an integer of ROUNDS_RANGE, else the default. */
    static length(value) {
        const [min, max] = FS_RULES_CONFIG.ROUNDS_RANGE;
        const n = Number(value);
        return Number.isInteger(n) && n >= min && n <= max ? n : FS_RULES_CONFIG.ROUNDS;
    }

    /** The rounds still to be played, the current one included (0 after the last). */
    get roundsLeft() {
        return Math.max(0, this.rounds - (this.round || 1) + 1);
    }

    /** How far the party has gone: 0 at the first round, close to 1 at the last. */
    get progress() {
        return Math.max(0, Math.min(1, ((this.round || 1) - 1) / this.rounds));
    }

    /** Is this the last round of the party? */
    get isLastRound() {
        return (this.round || 1) >= this.rounds;
    }

    /** How many players sit at the table. */
    get count() {
        return (this.state.players || []).length;
    }

    /** The round the game is in. */
    startRound(round) {
        this.state.round = round;
        return this;
    }

    // --- the circle of the players --------------------------------------------

    /**
     * «The first player token passes to the next player»: the seat that opens
     * the round. It is not the turn of the phase — an eliminated first player
     * still holds the token — but it is where every circle starts.
     */
    get firstPlayer() {
        return this.state.firstPlayer === undefined ? null : this.state.firstPlayer;
    }

    /** Is this seat the first player of the round? */
    isFirst(seat) {
        return this.firstPlayer !== null && this.firstPlayer === seat;
    }

    /** The token passes: the round is opened by the next seat. */
    passFirst() {
        if (this.firstPlayer === null) return null;
        this.state.firstPlayer = GamePhase.next(this.firstPlayer, this.count);
        return this.state.firstPlayer;
    }

    /** The seats from the first player round the table («в порядке хода»). */
    circle() {
        const count = this.count;
        if (this.firstPlayer === null || !count) return [];
        return Array.from({ length: count }, (_, i) => (this.firstPlayer + i) % count);
    }

    /**
     * The seat that opens the round: the first player — or, if he is out of the
     * game, the player before him in the circle who still plans.
     */
    opener(nextPlanner) {
        const first = this.firstPlayer;
        if (first === null) return null;
        const player = (this.state.players || [])[first];
        if (!player || !player.eliminated) return first;
        if (!nextPlanner) return first;
        const count = this.count;
        const before = (first - 1 + count) % count;
        return nextPlanner(this.state, before);
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

    /**
     * The turn passes to a seat; the setup keeps its own order. This is the
     * field of the phase, not the acting seat — in the setup they differ.
     */
    set turn(seat) {
        this.state.turn = seat === undefined ? null : seat;
    }

    get turn() {
        return this.state.turn === undefined ? null : this.state.turn;
    }

    /** Does this seat hold the turn of the phase? */
    isTurn(seat) {
        return this.turn !== null && this.turn === seat;
    }

    /** The turn goes to the next seat round the table (from the first one if none). */
    nextTurn() {
        const count = this.count;
        if (!count) return this.turn;
        this.state.turn = this.turn === null ? 0 : GamePhase.next(this.turn, count);
        return this.state.turn;
    }

    /** The next seat in the circle of the given number of players. */
    static next(seat, count) {
        if (!count) return seat;
        return (seat + 1) % count;
    }
}

/** One phase per state, like one board per state. */
GamePhase.cache = new WeakMap();
