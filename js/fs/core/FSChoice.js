// FSChoice.js — the system the player has just chosen, as one object.
//
// Some cards say «Выберите систему» and the sentences after that one read the
// choice: «Получите материалы со всех дружественных миров ЭТОЙ системы»
// («Пожиратель миров»). The choice was written into a field of the state
// (`state.chosenSystem`) by the step of the choice — and no step ever read it:
// the count of the effect fell back to one token, so the very card that named
// the system paid a single materiel instead of the sum of its worlds.
//
// One question now: `Choice.of(state)` — `choose(id)`, `system`, `has`. The
// field stays in `state.chosenSystem`, so a save mid-effect reads it as before.

class Choice {
    /** @param {any} state the game state (the field lives on it) */
    constructor(state) {
        this.state = state || {};
    }

    /** The choice of a game; null when there is no state at all. */
    static of(state) {
        if (!state) return null;
        let choice = Choice.cache.get(state);
        if (!choice) {
            choice = new Choice(state);
            Choice.cache.set(state, choice);
        }
        return choice;
    }

    /** The system the player chose, or null. */
    get system() {
        return this.state.chosenSystem || null;
    }

    /** Is a system chosen? */
    get has() {
        return !!this.state.chosenSystem;
    }

    /** The player is asked «Выберите систему» — and answers. */
    choose(systemId) {
        if (systemId) this.state.chosenSystem = systemId;
        return this;
    }

    /** The effect that asked is over: the choice is spent. */
    clear() {
        delete this.state.chosenSystem;
        return this;
    }
}

/** One choice per state, like one effect at a time. */
Choice.cache = new WeakMap();
