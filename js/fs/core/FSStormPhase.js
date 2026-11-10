// FSStormPhase.js — the warp storm of an event: its movement, its reaction and
// the icons a revealed card may not move.
//
// The event card of the refresh phase moves exactly one storm, and three more
// things hang off that one movement:
//   * «Молящийся тёмным богам» lets ANOTHER player cancel the movement and send
//     the same storm elsewhere — the rules parked the pending move in
//     `state.stormReaction` and read it back in three places;
//   * «Инкарнация Тзинча» reveals three cards and forbids their storm icons to
//     move a second storm — `state.chaosNoStormMove`, set and deleted in four
//     places around the event phase;
//   * «Storm the palace of the governor» counts the capacity of the system the
//     LAST destroyed unit stood in — `state.chaosLastSystem`.
//
// One question now: `StormPhase.of(state)`. The fields stay on the state — a
// saved game keeps them — but the phase's questions («какой шторм ждёт ответа»,
// «можно ли двигать по иконке») live in one place.

class StormPhase {
    /** @param {any} state the game state (the fields live on it) */
    constructor(state) {
        this.state = state || {};
    }

    /** The storms of a state; null when there is no state at all. */
    static of(state) {
        if (!state) return null;
        let phase = StormPhase.cache.get(state);
        if (!phase) {
            phase = new StormPhase(state);
            StormPhase.cache.set(state, phase);
        }
        return phase;
    }

    // --- «Молящийся тёмным богам»: the reaction to a movement ----------------

    /** The movement another player may cancel, or null. */
    get reaction() {
        return this.state.stormReaction || null;
    }

    /** Is the movement of a storm waiting for the reaction of another player? */
    get reacting() {
        return !!this.state.stormReaction;
    }

    /** The movement is offered to the other players: it waits for their answer. */
    offer(info) {
        this.state.stormReaction = info || null;
        return this.state.stormReaction;
    }

    /** Nobody reacts (or the reaction is over): the movement goes on. */
    clearReaction() {
        delete this.state.stormReaction;
        return this;
    }

    // --- «Инкарнация Тзинча»: the icons of a revealed card do not move --------

    /** May the storm icons of the revealed cards move a storm? */
    get iconsMove() {
        return !this.state.chaosNoStormMove;
    }

    /** Three cards are open: their storm icons are not a second movement. */
    suppressIcons() {
        this.state.chaosNoStormMove = true;
        return this;
    }

    /** A new event begins: its own card may move the storm again. */
    allowIcons() {
        delete this.state.chaosNoStormMove;
        return this;
    }

    // --- the system of the last destroyed unit -------------------------------

    /** The system the last destroyed unit stood in, or null. */
    get lastSystem() {
        return this.state.chaosLastSystem === undefined ? null : this.state.chaosLastSystem;
    }

    /** A unit was destroyed: its system is the one the card counts the capacity of. */
    markLastSystem(systemId) {
        this.state.chaosLastSystem = systemId === undefined ? null : systemId;
        return this;
    }
}

/** One storm phase per state, like one event phase per state. */
StormPhase.cache = new WeakMap();
