// FSEventRound.js — the event cards of a round, as one object.
//
// «In the refresh phase every player draws and resolves one event card.» The
// rules counted that as one number in the state (`state.eventsLeft`): it was set
// to the number of players when the event step began, tested before the next
// player was drawn, decreased when a card was played, and copied into the
// snapshot of «Быстрого ответа» so a suspended event phase came back with the
// same count. The number meant «who still has to draw» and nobody could say so
// without reading three rules.
//
// One question now: `EventRound.of(state)` — `begin(count)`, `left`,
// `pending`, `played()` and `restore(n)`. The number stays in
// `state.eventsLeft`, so a save and the snapshot of the suspended phase read it
// as they did.

class EventRound {
    /** @param {any} state the game state (the number lives on it) */
    constructor(state) {
        this.state = state || {};
    }

    /** The event step of a game; null when there is no state at all. */
    static of(state) {
        if (!state) return null;
        let round = EventRound.cache.get(state);
        if (!round) {
            round = new EventRound(state);
            EventRound.cache.set(state, round);
        }
        return round;
    }

    /** How many event cards of this round are not played yet. */
    get left() {
        return this.state.eventsLeft || 0;
    }

    /** Does anybody still have to draw an event card? */
    get pending() {
        return this.left > 0;
    }

    /** The event step of the round begins: one card for every player. */
    begin(count) {
        this.state.eventsLeft = count === undefined ? this.count : count;
        return this;
    }

    /** How many players sit at the table. */
    get count() {
        return (this.state.players || []).length;
    }

    /** A card was played: one event fewer. */
    played() {
        this.state.eventsLeft = Math.max(0, this.left - 1);
        return this;
    }

    /** The count of a suspended event step comes back as it was. */
    restore(left) {
        this.state.eventsLeft = left || 0;
        return this;
    }

    /** The number a snapshot has to remember. */
    get snapshot() {
        return this.left;
    }
}

/** One event step per state, like one refresh phase per round. */
EventRound.cache = new WeakMap();
