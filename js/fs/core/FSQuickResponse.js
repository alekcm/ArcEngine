// FSQuickResponse.js — «Быстрый ответ», the event that suspends the refresh.
//
// The tactic event «Быстрый ответ» makes a limited advance of one ship in a
// chosen system, and the event phase must wait for it: the game keeps a snapshot
// of the phase (`phase`, `turn`, `event`, `eventsLeft`) in
// `state.quickResponseSnapshot` and a flag `state.quickResponsePending` for the
// event whose system was never chosen. That is four places writing two fields —
// the event rules, the advance, the end of an order and the tail of the effect
// interpreter — each with its own `delete` and its own three lines of «а есть ли
// снимок?».
//
// One question now: `QuickResponse.of(state)`. The fields stay on the state, so
// a saved game and a snapshot keep working as they did; the questions «ждёт ли
// событие» and «что вернуть» are asked once.

class QuickResponse {
    /** @param {any} state the game state (the fields live on it) */
    constructor(state) {
        this.state = state || {};
    }

    /** The quick response of a game; null when there is no state at all. */
    static of(state) {
        if (!state) return null;
        let response = QuickResponse.cache.get(state);
        if (!response) {
            response = new QuickResponse(state);
            QuickResponse.cache.set(state, response);
        }
        return response;
    }

    /** Is the event phase waiting for the limited advance of an event? */
    get pending() {
        return !!this.state.quickResponsePending;
    }

    /** The snapshot of the event phase the advance returns to, or null. */
    get snapshot() {
        return this.state.quickResponseSnapshot || null;
    }

    /**
     * The event phase is suspended: remember where it stands. The snapshot taken
     * by the resolution of the event itself is kept — a second one would make the
     * event phase draw and discard an extra card.
     */
    suspend() {
        if (!this.state.quickResponseSnapshot) {
            this.state.quickResponseSnapshot = {
                phase: this.state.phase,
                turn: this.state.turn,
                event: this.state.event,
                eventsLeft: this.state.eventsLeft,
            };
        }
        return this;
    }

    /** The event waits for the system of its limited advance. */
    wait() {
        this.state.quickResponsePending = true;
        return this;
    }

    /** The system of the event is chosen: the limited advance is born. */
    start() {
        this.state.quickResponsePending = false;
        return this;
    }

    /** The advance is over: the event phase comes back exactly where it was. */
    resume() {
        const snap = this.snapshot;
        if (!snap) return null;
        this.state.phase = snap.phase;
        this.state.turn = snap.turn;
        this.state.event = snap.event;
        this.state.eventsLeft = snap.eventsLeft;
        this.forget();
        return snap;
    }

    /** The snapshot is spent (or was never taken): nothing waits. */
    forget() {
        delete this.state.quickResponseSnapshot;
        delete this.state.quickResponsePending;
        return this;
    }
}

/** One quick response per state, like one event phase per state. */
QuickResponse.cache = new WeakMap();
