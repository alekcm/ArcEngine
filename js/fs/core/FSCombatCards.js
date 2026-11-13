// FSCombatCards.js — the combat cards of a battle, as one object.
//
// A battle deals five cards to each side, the players lay one card face down
// («staged»), turn it over («played») and the cards give icons to the values of
// the side. The rules kept the three stages in four parallel fields — `cards`
// (the hand and the played list of a side), `staged`, `chosen` (the card the
// panel highlights in the hand) and `peek` (the card of the opponent one has
// seen) — and every layer reached into them by hand: the deal of the combat, the
// reveal, the values, the damage, the clean-up, the panel and the cards that add
// a card «as if played».
//
// One question now: `CombatCards.of(combat)`.
//
// The object is a read/write VIEW of the fields of the battle: `cards`, `staged`,
// `chosen` and `peek` stay where they are, so the state is still serialisable.

class CombatCards {
    /** @param {any} combat the battle (the fields live on it) */
    constructor(combat) {
        this.combat = combat || {};
    }

    /** The cards of a battle; null when there is no battle at all. */
    static of(combat) {
        if (!combat) return null;
        let cards = CombatCards.cache.get(combat);
        if (!cards) {
            cards = new CombatCards(combat);
            CombatCards.cache.set(combat, cards);
        }
        return cards;
    }

    // --- the two piles of a side ---------------------------------------------

    /** The record of a side: the cards in its hand and the cards in play. */
    pile(side) {
        if (!this.combat.cards) this.combat.cards = {};
        const all = this.combat.cards;
        if (!all[side]) all[side] = { hand: [], played: [] };
        if (!all[side].played) all[side].played = [];
        if (!all[side].hand) all[side].hand = [];
        return all[side];
    }

    /** The cards of a side that are open on the table. */
    played(side) {
        return this.pile(side).played;
    }

    /** The cards that stayed in the hand (the panel draws them). */
    hand(side) {
        return this.pile(side).hand;
    }

    /**
     * A card goes to the table. `entry` names it; the round is the turn's unless
     * the caller passes one (a card played «as if» belongs to the round it was
     * added in).
     */
    put(side, entry, round) {
        const one = Object.assign({}, entry);
        if (one.round === undefined) one.round = round;
        this.played(side).push(one);
        return one;
    }

    /** The card is taken back from the table (it goes to the deck at clean-up). */
    take(side, name) {
        const list = this.played(side);
        const at = list.findIndex(x => x && x.name === name);
        if (at < 0) return null;
        return list.splice(at, 1)[0];
    }

    /** The names of the cards in play. */
    names(side) {
        return this.played(side).map(x => x && x.name).filter(Boolean);
    }

    /** Is this card open on the table? */
    has(side, name) {
        return this.played(side).some(x => x && x.name === name);
    }

    /** The icons a side holds on its open cards: «att», «def», «morale». */
    icons(side) {
        const out = { att: 0, def: 0, morale: 0 };
        for (const one of this.played(side)) {
            if (!one || !one.card || !one.card.icons) continue;
            for (const kind of FACE_KINDS) {
                if (kind === 'blank') continue;
                out[kind] += one.card.icons[kind] || 0;
            }
        }
        return out;
    }

    /** The table is cleared for the next round. */
    clear(side) {
        this.pile(side).played = [];
        this.stage(side, null);
        this.setChosen(side, null);
        return this;
    }

    // --- what the damage of a step did ---------------------------------------

    /** The pieces a side's damage was applied to in this step. */
    applied(side) {
        return (this.combat.applied && this.combat.applied[side]) || [];
    }

    setApplied(side, list) {
        if (!this.combat.applied) this.combat.applied = {};
        this.combat.applied[side] = list || [];
        return this.combat.applied[side];
    }

    clearApplied() {
        this.combat.applied = {};
        return this;
    }

    // --- the card that lies face down -----------------------------------------

    /** The card a side has laid face down, or null. */
    staged(side) {
        return (this.combat.staged && this.combat.staged[side]) || null;
    }

    /** A side lays a card face down (null lifts it). */
    stage(side, card) {
        if (!this.combat.staged) this.combat.staged = { attacker: null, defender: null };
        this.combat.staged[side] = card || null;
        return this.combat.staged[side];
    }

    /** Both cards leave the table. */
    clearStaged() {
        this.combat.staged = { attacker: null, defender: null };
        return this;
    }

    /** Takes the card of a side off the table: the caller turns it over. */
    unstage(side) {
        const card = this.staged(side);
        this.stage(side, null);
        return card;
    }

    /** Whose card waits to be turned over: the attacker's first, then the defender's. */
    nextStaged() {
        for (const side of ['attacker', 'defender']) {
            if (this.staged(side)) return side;
        }
        return null;
    }

    /** Does the side have a card on the table? */
    get anyStaged() {
        return !!(this.staged('attacker') || this.staged('defender'));
    }

    // --- the card the panel names and the card that was seen ------------------

    /** The card of the hand the panel highlights for a side. */
    chosen(side) {
        return (this.combat.chosen && this.combat.chosen[side]) || null;
    }

    setChosen(side, name) {
        if (!this.combat.chosen) this.combat.chosen = {};
        this.combat.chosen[side] = name || null;
        return this.combat.chosen[side];
    }

    /**
     * «Подсмотрите карту оппонента»: the card a seat has seen. It is always a card
     * of the other side, so the side is not kept with it.
     */
    peeked(seat) {
        const peek = this.combat.peek;
        // The authoritative state is indexed by seat; a network view contains
        // only that viewer's peek, redacted to { name } by hideFrom().
        const name = peek && (peek[seat] || peek.name);
        return name ? { name } : null;
    }

    /** A seat saw the card of a side. */
    peek(side, seat, name) {
        void side;
        if (!this.combat.peek) this.combat.peek = {};
        this.combat.peek[seat] = name || null;
        return this.combat.peek[seat];
    }

    /** A peek belongs to one round, not the next face-down card. */
    clearPeek() {
        this.combat.peek = {};
        return this;
    }

    /**
     * The cards of the battle as ONE seat sees them: the hand of the opponent is
     * empty, and the card that lies face down is closed for everybody. The copy
     * keeps a flag where the card was, so the panel knows that a card is waiting.
     */
    hideFrom(seat) {
        for (const side of ['attacker', 'defender']) {
            const sameSeat = this.combat[side] === seat;
            if (!sameSeat) this.pile(side).hand = [];
            this.setChosen(side, null);
        }
        const waiting = { attacker: !!this.staged('attacker'), defender: !!this.staged('defender') };
        this.combat.staged = undefined;
        this.combat.chosen = waiting;
        // The card the opponent laid is secret — unless a card let the player peek
        // at it («Скитарии-инфильтраторы»): only he sees it.
        const peeked = (this.combat.peek || {})[seat] || null;
        this.combat.peek = peeked ? { name: peeked } : null;
        return this;
    }

}

/** One set of cards per battle, like one turn per battle. */
CombatCards.cache = new WeakMap();
