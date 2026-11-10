// FSPreAdvance.js — the extra order in the middle of an advance, as one object.
//
// «Мобилизированные охотники»: «выполните приказ продвижения одним отрядом,
// затем вернитесь к основному приказу». The rules did that by putting the main
// order away in a field of the state (`state.preAdvanceMain`) and running a
// second, smaller order in `state.order`; the end of the extra order went back
// to the main one — and nothing else knew that an order was waiting. Three
// readers asked the field by hand (the end of an order, the operations, the
// advance itself).
//
// One question now: `PreAdvance.of(state)` — `suspended` (is a main order
// waiting?), `suspend(main)`, `held` and `resume()` (give the main order back),
// plus the mark `done(order)` that says the main order had its extra advance.

class PreAdvance {
    /** @param {any} state the game state (the field lives on it) */
    constructor(state) {
        this.state = state || {};
    }

    /** The extra advance of a game; null when there is no state at all. */
    static of(state) {
        if (!state) return null;
        let pre = PreAdvance.cache.get(state);
        if (!pre) {
            pre = new PreAdvance(state);
            PreAdvance.cache.set(state, pre);
        }
        return pre;
    }

    /** Is a main order put away while the extra one is played? */
    get suspended() {
        return !!this.state.preAdvanceMain;
    }

    /** The main order that waits, or null. */
    get held() {
        return this.state.preAdvanceMain || null;
    }

    /** The main order is put away: the extra advance takes its place. */
    suspend(main) {
        this.state.preAdvanceMain = main || null;
        return this;
    }

    /** The extra advance is over: the main order comes back (once). */
    resume() {
        const main = this.held;
        delete this.state.preAdvanceMain;
        return main || null;
    }

    /** The main order had its extra advance: it is not offered again. */
    done(order) {
        if (order) order.preAdvanceDone = true;
        return this;
    }

    /** Did this order already play its extra advance? */
    wasDone(order) {
        return !!(order && order.preAdvanceDone);
    }
}

/** One extra advance per state, like one order at a time. */
PreAdvance.cache = new WeakMap();
