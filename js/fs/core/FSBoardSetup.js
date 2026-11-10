// FSBoardSetup.js — the building of the galaxy map, as one object.
//
// The interactive setup of the board walks three stages — тайлы, начальные силы,
// цели, варп-штормы — and each player acts in his own order, not in the order of
// the round. The rules kept that in a dozen fields of one record
// (`state.setup.hands`, `stage`, `turnOrder`, `turnIndex`, `turn`,
// `currentSystem`, `placedBySeat`, `placedTotal`, `totalTiles`, `stormsPlaced`,
// `center`) and every reader picked what it needed: the rules compared
// `setup.stage` with three literals, the panel asked `setup.myTurn` (a field the
// view of a seat adds) and the board decided whether it may place a tile by
// looking at `setup.stage !== 'tile'`.
//
// One question now: `BoardSetup.of(state)` — `stage`, `turn` (the seat whose
// hand is played, whoever holds the turn of the phase), `currentSystem`, and the
// machine of the hand: `placeTile`, `takeForce`, `nextPlayer`, `nextStorm`.
// The record stays in `state.setup` with its fields, so the view of a seat, the
// panel and the tests read it as they did.

class BoardSetup {
    /** @param {any} state the game state (the record lives on it) */
    constructor(state) {
        this.state = state || {};
    }

    /** The setup of a game; null when there is no state at all. */
    static of(state) {
        if (!state) return null;
        let setup = BoardSetup.cache.get(state);
        if (!setup) {
            setup = new BoardSetup(state);
            BoardSetup.cache.set(state, setup);
        }
        return setup;
    }

    /** The stages of the board, in the order they are played. */
    static TILES = 'tile';
    static FORCES = 'forces';
    static OBJECTIVES = 'objectives';
    static STORMS = 'storms';

    /** The record itself, or null when the board is already built. */
    get record() {
        return this.state.setup || null;
    }

    /** Is the board being built at all? */
    get active() {
        return !!this.state.setup;
    }

    /** The stage of the build: `tile`, `forces`, `objectives` or `storms`. */
    get stage() {
        const setup = this.record;
        return setup ? setup.stage : null;
    }

    /** Is the build at one of these stages? */
    is(...stages) {
        const here = this.stage;
        for (const s of stages) if (s === here) return true;
        return false;
    }

    setStage(stage) {
        if (this.record) this.record.stage = stage;
        return this;
    }

    /** The seat whose hand is played now: the build has its own order. */
    get turn() {
        const setup = this.record;
        return setup ? setup.turn : null;
    }

    /** Does this seat build now? */
    isTurn(seat) {
        return this.active && this.turn === seat;
    }

    /** The system the forces are placed in (or the one just placed). */
    get currentSystem() {
        const setup = this.record;
        return setup ? setup.currentSystem : null;
    }

    setCurrentSystem(systemId) {
        if (this.record) this.record.currentSystem = systemId === undefined ? null : systemId;
        return this;
    }

    /** The tiles in the hand of a seat. */
    hand(seat) {
        const setup = this.record;
        if (!setup || !setup.hands) return [];
        return setup.hands[seat] || (setup.hands[seat] = []);
    }

    /** How many tiles are still to be laid, both hands together. */
    get totalTiles() {
        const setup = this.record;
        return setup ? setup.totalTiles : 0;
    }

    get placedTotal() {
        const setup = this.record;
        return setup ? setup.placedTotal : 0;
    }

    /** A tile of a seat is on the board: the hand gives it away. */
    placeTile(seat, systemId, index) {
        const setup = this.record;
        if (!setup) return null;
        const hand = this.hand(seat);
        const [tile] = hand.splice(index, 1);
        if (setup.placedBySeat) setup.placedBySeat[seat] = (setup.placedBySeat[seat] || 0) + 1;
        setup.placedTotal = (setup.placedTotal || 0) + 1;
        setup.currentSystem = systemId === undefined ? null : systemId;
        setup.stage = BoardSetup.FORCES;
        return tile;
    }

    // --- the order of the players --------------------------------------------

    /** The order the board is built in. */
    get turnOrder() {
        const setup = this.record;
        return (setup && setup.turnOrder) || [];
    }

    /** Every tile of every hand is laid: the storms come next. */
    get tilesDone() {
        return this.placedTotal >= this.totalTiles;
    }

    /** The next player whose hand still has a tile. */
    nextPlayer() {
        const setup = this.record;
        if (!setup) return null;
        const order = this.turnOrder;
        if (!order.length) return null;
        let index = setup.turnIndex || 0;
        for (let step = 1; step <= order.length; step++) {
            const at = (index + step) % order.length;
            const next = order[at];
            if (!this.hand(next).length) continue;
            setup.turnIndex = at;
            setup.turn = next;
            setup.stage = BoardSetup.TILES;
            setup.currentSystem = null;
            return next;
        }
        setup.stage = BoardSetup.STORMS;
        setup.currentSystem = null;
        setup.stormsPlaced = 0;
        return null;
    }

    /**
     * «в обратном порядке хода»: one storm is on the table, and the next one is
     * placed by the previous player of the build order. Returns that seat, or
     * null when every player has placed his storm.
     */
    nextStorm() {
        const setup = this.record;
        if (!setup) return null;
        setup.stormsPlaced = (setup.stormsPlaced || 0) + 1;
        if (setup.stormsPlaced >= (this.state.players || []).length) return null;
        const order = this.turnOrder;
        if (!order.length) return null;
        const index = ((setup.turnIndex || 0) - 1 + order.length) % order.length;
        setup.turnIndex = index;
        setup.turn = order[index];
        return setup.turn;
    }

    /** How many storms are already on the edges. */
    get stormsPlaced() {
        const setup = this.record;
        return (setup && setup.stormsPlaced) || 0;
    }

    /** The board is built: the record goes away and the game begins. */
    finish() {
        this.state.setup = null;
        return this;
    }
}

/** One board setup per state, like one board per state. */
BoardSetup.cache = new WeakMap();
