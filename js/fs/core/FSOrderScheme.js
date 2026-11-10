// FSOrderScheme.js — «вместо раскрытия приказа»: the plan that takes a turn.
//
// A scheme played «instead of revealing an order» asks the player before his
// token is revealed, and the answer outlives the question: the reveal waits for
// the scheme, the scheme's own steps run, and only then the turn passes. The
// rules kept that in two fields of the state —
//   `state.operationSchemeOffered` (the offer key `round:turn:seat:system:count`,
//   so that a refusal is not offered twice for the same attempted reveal) and
//   `state.operationSchemeAccepted` (the scheme took the place of the reveal) —
//   and four places wrote them by hand, each with its own `delete`.
//
// One question now: `OrderScheme.of(state)`. The fields stay on the state, so a
// saved game keeps the offer; the questions «предлагали ли уже» and «занял ли
// план ход» are asked once.

class OrderScheme {
    /** @param {any} state the game state (the fields live on it) */
    constructor(state) {
        this.state = state || {};
    }

    /** The plan of an order; null when there is no state at all. */
    static of(state) {
        if (!state) return null;
        let scheme = OrderScheme.cache.get(state);
        if (!scheme) {
            scheme = new OrderScheme(state);
            OrderScheme.cache.set(state, scheme);
        }
        return scheme;
    }

    /** The key of an attempted reveal: a refusal belongs to this attempt. */
    static key(state, seat, systemId, count) {
        if (!state) return null;
        const game = GamePhase.of(state);
        return game.round + ':' + game.turn + ':' + seat + ':' + systemId + ':' + count;
    }

    /** Was the «instead of an order» plan already offered for this attempt? */
    asked(key) {
        return key !== null && this.state.operationSchemeOffered === key;
    }

    /** The plan is offered once for this attempt of this reveal. */
    offer(key) {
        this.state.operationSchemeOffered = key === undefined ? null : key;
        return this;
    }

    /** The plan takes the place of the reveal: the turn is his, not the order's. */
    accept() {
        this.state.operationSchemeAccepted = true;
        return this;
    }

    /** Did the plan take the place of revealing the order? */
    get accepted() {
        return !!this.state.operationSchemeAccepted;
    }

    /** The turn of the scheme is taken (or given back): nobody waits for it. */
    clearAccepted() {
        delete this.state.operationSchemeAccepted;
        return this;
    }

    /** A new round offers every plan anew. */
    reset() {
        delete this.state.operationSchemeOffered;
        delete this.state.operationSchemeAccepted;
        return this;
    }
}

/** One order scheme per state, like one event phase per state. */
OrderScheme.cache = new WeakMap();
