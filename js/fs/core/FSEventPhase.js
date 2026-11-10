// FSEventPhase.js — the event of the refresh phase, as one object.
//
// Every player of the refresh phase draws his event cards, chooses one, moves a
// warp storm by its icon and resolves its ability. That little machine lived in
// one plain field of the state (`state.event`), whose shape was written five
// times: `{ seat, drawn, chosen }`, then `top`, then `stormMoved`, then `card` —
// and every reader picked from it with its own `|| []` and its own
// `if (!state.event)` guard. The storm rules even rebuilt the object as `{}` to
// ask «какие направления разрешает карта?».
//
// One question now: `EventPhase.of(state)`. The field stays on the state — the
// state stays serialisable and a snapshot of the event phase (`phase`, `turn`,
// `event`, `eventsLeft` for «Быстрый ответ») keeps holding it — but the shape
// of the event and the questions a card asks of it are written once.

class EventPhase {
    /** @param {any} state the game state (the event lives on it) */
    constructor(state) {
        this.state = state || {};
    }

    /** The event of the phase; never null — an empty phase answers like an idle one. */
    static of(state) {
        if (!state) return null;
        let phase = EventPhase.cache.get(state);
        if (!phase) {
            phase = new EventPhase(state);
            EventPhase.cache.set(state, phase);
        }
        return phase;
    }

    /** The event record itself, or null when no event is being played. */
    get record() {
        return this.state.event || null;
    }

    /** Is an event being played at all? */
    get current() {
        return !!this.state.event;
    }

    /** The player whose event it is, or null. */
    get seat() {
        const event = this.record;
        return event && event.seat !== undefined ? event.seat : null;
    }

    /** Does this player play the event of the phase? */
    isSeat(seat) {
        return this.current && this.seat === seat;
    }

    // --- the cards on the table ----------------------------------------------

    /** The cards drawn for the event: the hand it chooses from. */
    get drawn() {
        const event = this.record;
        return (event && event.drawn) || [];
    }

    /** The card chosen from the hand, or null. */
    get chosen() {
        const event = this.record;
        return (event && event.chosen) || null;
    }

    /** The open card of the event — chosen or revealed for the storm alone. */
    get top() {
        const event = this.record;
        return (event && event.top) || null;
    }

    /** The card the event plays: the chosen one, else the one opened for the storm. */
    get card() {
        const event = this.record;
        return (event && event.card) || null;
    }

    /** The name of the card on the table, whichever way it got there. */
    get cardName() {
        const card = this.card;
        return card ? card.name : this.top;
    }

    /** The event begins: this player drew these cards. */
    begin(seat, drawn) {
        this.state.event = { seat, drawn: (drawn || []).slice(), chosen: null };
        return this.state.event;
    }

    /** No token on the deck: the top card is revealed for the storm only. */
    revealTop(name) {
        if (!this.state.event) return null;
        this.state.event.top = name;
        return this.state.event;
    }

    /** The player chooses a card of his hand. */
    choose(name) {
        if (!this.state.event) return null;
        this.state.event.chosen = name;
        return this.state.event;
    }

    /** The card of the event is known: the chosen one or one drawn by a scheme. */
    setCard(card) {
        if (!this.state.event) return this;
        this.state.event.card = card;
        return this;
    }

    /** The event is over; the cards went back to the deck. */
    end() {
        this.state.event = null;
        return this;
    }

    // --- the warp storm the card moves ---------------------------------------

    /** «сдвиньте варп-шторм по иконке карты»: the storm of this event moved. */
    get stormMoved() {
        const event = this.record;
        return !!(event && event.stormMoved === true);
    }

    markStormMoved() {
        if (this.state.event) this.state.event.stormMoved = true;
        return this;
    }
}

/** One event phase per state, like one board per state. */
EventPhase.cache = new WeakMap();
