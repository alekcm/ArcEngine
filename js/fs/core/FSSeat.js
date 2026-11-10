// FSSeat.js — whose eyes the state is seen through, as one object.
//
// The state a player gets is not the whole game: it is the game cut for one
// chair. `CoreRules.view(state, seat)` copies the state and writes the seat into
// it (`copy.seat = seat`), and from that moment every reader — the board, the
// panel, the status line — asks that field «кто я» by hand: the panel greys the
// other chairs, the board rings only my troops, the status line names me. The
// field was written in one place and read in thirty.
//
// One question now: `Seat.of(state)` — `me`, `mine(seat)`, `isMe(seat)`,
// `player`, `stateOf(seat)`. The field stays in `state.seat`, so the network,
// the panel and the tests read the plain view as they did.

class Seat {
    /** @param {any} state the view of a seat (the field lives on it) */
    constructor(state) {
        this.state = state || {};
    }

    /** The seat of a view; null when there is no state at all. */
    static of(state) {
        if (!state) return null;
        let seat = Seat.cache.get(state);
        if (!seat) {
            seat = new Seat(state);
            Seat.cache.set(state, seat);
        }
        return seat;
    }

    /** The seat whose view this is, or null for the whole state. */
    get me() {
        return this.state.seat === undefined ? null : this.state.seat;
    }

    /** Is there a seat at all? (the state of the server is seen by nobody) */
    get any() {
        return this.me !== null;
    }

    /** Is this seat the one that looks? */
    isMe(seat) {
        return this.me !== null && this.me === seat;
    }

    /** The same question from the other side: «это чужое место?» */
    isOther(seat) {
        return this.me !== null && this.me !== seat;
    }

    /** The record of the player who looks, or null. */
    get player() {
        const players = this.state.players || [];
        const me = this.me;
        return me === null ? null : players[me] || null;
    }

    /** The whole state a seat would see: the same game, one field more. */
    stateOf(seat) {
        const copy = this.state;
        copy.seat = seat === undefined ? null : seat;
        return copy;
    }
}

/** One seat per view, like one chair per player. */
Seat.cache = new WeakMap();
