// FSMarchTrail.js — where the troops of an order came from, as one object.
//
// «Retreat: each unit goes back to the area it came from.» The rules answered
// that with one list of every movement (`state.moves`): the board pushed an
// entry into it on each `moveUnit`, the operations reset it when a new order
// was revealed, the advance reset it again for its extra order, and the combat
// read it to know the areas the attackers walked in from. The list lived in
// three rules and the board, and «the trail of this order» was a sentence in a
// comment.
//
// One question now: `MarchTrail.of(state)` — `record(seat, from, to, piece)`,
// `reset()`, and the readings the rules need. New records identify the piece so
// a combat can ignore moves by units that left before it began. Older saved
// records `{ seat, from, to }` are still accepted.

class MarchTrail {
    /** @param {any} state the game state (the list lives on it) */
    constructor(state) {
        this.state = state || {};
    }

    /** The trail of a game; null when there is no state at all. */
    static of(state) {
        if (!state) return null;
        let trail = MarchTrail.cache.get(state);
        if (!trail) {
            trail = new MarchTrail(state);
            MarchTrail.cache.set(state, trail);
        }
        return trail;
    }

    /** The recorded movements, oldest first. */
    get entries() {
        if (!this.state.moves) this.state.moves = [];
        return this.state.moves;
    }

    /** How many movements the order has made. */
    get length() {
        return this.entries.length;
    }

    /** A piece left one area for another. `piece` is optional for old callers. */
    record(seat, from, to, piece = undefined) {
        if (!from || !to) return this;
        this.entries.push(Object.assign({
            seat,
            from: { system: from.system, pos: from.pos },
            to: { system: to.system, pos: to.pos },
        }, piece === undefined ? {} : { piece }));
        return this;
    }

    /** Remove one matching movement when its march is undone. */
    unrecord(seat, from, to, piece = undefined) {
        const entries = this.entries;
        for (let i = entries.length - 1; i >= 0; i--) {
            const m = entries[i];
            if (piece !== undefined && m.piece !== undefined && m.piece !== piece) continue;
            if (m.seat === seat && m.from.system === from.system && m.from.pos === from.pos
                && m.to.system === to.system && m.to.pos === to.pos) {
                entries.splice(i, 1);
                return true;
            }
        }
        return false;
    }

    /** The latest recorded move of a specific piece, if its identity was saved. */
    lastOf(seat, piece) {
        const entries = this.entries;
        for (let i = entries.length - 1; i >= 0; i--) {
            const m = entries[i];
            if (m.seat === seat && m.piece !== undefined && m.piece === piece) return m;
        }
        return null;
    }

    /** A new order begins: every retreat looks at its own movements only. */
    reset() {
        this.state.moves = [];
        return this;
    }

    /** Did this seat walk into the area? */
    walkedInto(seat, systemId, pos) {
        return this.entries.some(m => m.seat === seat
            && m.to.system === systemId && m.to.pos === pos);
    }

    /** The areas this seat left to stand where it stands now. */
    cameFrom(seat, systemId, pos, participants = null) {
        const out = [];
        for (const m of this.entries) {
            if (m.seat !== seat) continue;
            if (m.to.system !== systemId || m.to.pos !== pos) continue;
            if (participants && m.piece !== undefined) {
                // Only the last move of a unit currently participating in the
                // combat counts. A factory or a unit that has since left does
                // not supply an origin for an unrelated attacker.
                if (!participants.includes(m.piece) || this.lastOf(seat, m.piece) !== m) continue;
            }
            // An old anonymous trail cannot identify the piece. Preserve its
            // former fallback instead of discarding its only origin.
            const from = m.from;
            if (!out.some(x => x.system === from.system && x.pos === from.pos)) {
                out.push({ system: from.system, pos: from.pos });
            }
        }
        return out;
    }

    /** The troops of this seat that left the area: where they went. */
    leftTo(seat, systemId, pos) {
        return this.entries.filter(m => m.seat === seat
            && m.from.system === systemId && m.from.pos === pos)
            .map(m => ({ system: m.to.system, pos: m.to.pos }));
    }
}

/** One trail per state, like one order at a time. */
MarchTrail.cache = new WeakMap();
