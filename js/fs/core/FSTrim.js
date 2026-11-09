// FSTrim.js — the queue of areas that wait for their owner's choice.
//
// The rules let a player exceed the capacity of an area — while moving,
// retreating, placing or deploying — but the order is not over until his
// excess troops are back in the supply: «After resolving an order … players
// must destroy any of their units that are in excess of an area's unit
// capacity.»
//
// The engine therefore keeps a queue: one record per over-full area,
// `{ seat, system, pos, cap, count }`. It is a plain JSON field of the state
// (`state.trim`) because the server sends it to the client, but the queue
// itself was written and read by hand in the rules, the panel and the server —
// each reader guarding against a missing list with `state.trim || []`, and the
// writers clearing the field by hand.
//
// The queue is an object now: it owns the field. A rule asks it whether a player
// owes a choice, adds an area, settles it when the area fits again. Nothing else
// writes `state.trim`.

class TrimQueue {
    /** @param {any} state the game state (plain JSON) */
    constructor(state) {
        this.state = state;
    }

    /**
     * The queue of a state. WeakMap, like the board: a state that is thrown away
     * takes its queue with it, a cloned state gets its own.
     * @param {any} state
     */
    static of(state) {
        let queue = TrimQueue.cache.get(state);
        if (!queue) {
            queue = new TrimQueue(state);
            TrimQueue.cache.set(state, queue);
        }
        return queue;
    }

    /** Every area that waits for a choice, in the order they were added. */
    entries() {
        return (this.state && this.state.trim) || [];
    }

    /** The areas of one player. */
    forSeat(seat) {
        return this.entries().filter(t => t.seat === seat);
    }

    /** The area of one player that waits for the choice, or null. */
    entryOf(seat) {
        return this.entries().find(t => t.seat === seat) || null;
    }

    /** «A player whose area is over capacity may do nothing but trim it.» */
    blocked(seat) {
        return !!this.entryOf(seat);
    }

    /** Is anybody owed a choice? The server uses it to pick the active seat. */
    any() {
        return this.entries().length > 0;
    }

    /**
     * One area of one player is over its capacity: it joins the queue. The area
     * is named once — a later order that overfills the same area again updates
     * its record instead of adding a second one.
     * @param {number} seat @param {string} systemId @param {string} pos
     * @param {number} cap the capacity of the area @param {number} count the units there
     */
    ask(seat, systemId, pos, cap, count) {
        const list = this.entries().filter(t => !(t.seat === seat && t.system === systemId && t.pos === pos));
        list.push({ seat, system: systemId, pos, cap, count });
        this.write(list);
        return list[list.length - 1];
    }

    /**
     * The choice was made: the area fits again and leaves the queue. Returns
     * true when the record was taken away.
     * @param {number} seat @param {string} systemId @param {string} pos
     * @param {number} left the units that remain @param {number} cap the capacity
     */
    settle(seat, systemId, pos, left, cap) {
        const list = this.entries();
        const entry = list.find(t => t.seat === seat && t.system === systemId && t.pos === pos);
        if (!entry || left > cap) return false;
        this.write(list.filter(t => t !== entry));
        return true;
    }

    /** Forget every record: the excess was settled or the order that caused it ended. */
    clear() {
        this.write([]);
    }

    /** The field is a list of records or null — nothing in between. */
    write(list) {
        this.state.trim = list && list.length ? list : null;
    }
}

/** One queue per state, like the board: a thrown-away state takes its queue with it. */
TrimQueue.cache = new WeakMap();
