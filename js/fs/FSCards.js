// FSCards.js — the objects behind the cards and the combat deck.
//
// The UI must never make the player remember a card by its name. This module
// keeps one catalogue of every printed event, combat and order card and turns
// a bare name from a question into the whole card: type, level, cost, storm
// arrows, cubes and both text zones. A combat deck is an object too: buying an
// upgrade replaces a chosen pair and moves the physical cards between the deck
// and the upgrade pile, instead of appending cards to the deck.

/** One printed card of one faction. */
class FSCard {
    /** @param {any} data @param {string} kind @param {string} faction */
    constructor(data, kind, faction) {
        this.data = data || {};
        this.kind = kind;
        this.faction = faction;
    }

    get name() { return String(this.data.name || ''); }

    /** The label of the card's family, as the player sees it on the card. */
    typeLabel() {
        if (this.kind === 'event') {
            return this.data.type === 'scheme' ? 'СОБЫТИЕ · ПЛАН' : 'СОБЫТИЕ · ТАКТИКА';
        }
        if (this.kind === 'order') return 'УЛУЧШЕНИЕ ПРИКАЗА';
        return this.data.upgrade ? 'БОЕВОЕ УЛУЧШЕНИЕ' : 'БОЕВАЯ КАРТА';
    }

    /** One plain record: the UI renderer prints every field of it. */
    detail() {
        const c = this.data;
        const combat = this.kind === 'combat';
        return {
            kind: this.typeLabel(),
            name: this.name,
            faction: this.faction,
            deck: this.kind,
            type: c.type || '',
            order: c.order || '',
            kl: c.kl == null ? null : Number(c.kl),
            cost: c.cost == null ? null : Number(c.cost),
            upgrade: !!c.upgrade,
            storm: Array.isArray(c.storm) ? c.storm.slice() : [],
            icons: combat && c.icons ? Object.assign({}, c.icons) : null,
            general: combat ? String(c.general || '') : '',
            unit: combat ? String(c.unit || '') : '',
            text: combat ? String(c.text || '') : String(c.text || ''),
        };
    }

    /** The whole printable text, used for tooltips and accessible labels. */
    summary() {
        const d = this.detail();
        return [d.general, d.unit, d.text].filter(Boolean).join(' ').trim();
    }
}

/** The live combat deck and the face-up pile of combat upgrades. */
class FSCombatDeck {
    /** @param {any} rules @param {any} state @param {any} player */
    constructor(rules, state, player) {
        this.rules = rules;
        this.state = state;
        this.player = player;
    }

    cards() {
        return Array.isArray(this.player.decks && this.player.decks.combat)
            ? this.player.decks.combat : [];
    }

    upgradePile() {
        return Array.isArray(this.player.decks && this.player.decks.upgradeCombat)
            ? this.player.decks.upgradeCombat : [];
    }

    size() { return this.cards().length; }

    /** Put a card (or a pair) back: every path into the deck comes through here. */
    add(name, n = 1) {
        if (!name) return 0;
        const deck = this.cards();
        for (let i = 0; i < n; i++) deck.push(name);
        return n;
    }

    /** Replace the pile of upgrades with exactly these cards (the setup). */
    resetPile(names) {
        const pile = this.upgradePile();
        pile.splice(0, pile.length);
        for (const name of names || []) pile.push(name);
        return pile.length;
    }

    /** Make the deck exactly these cards (the deal of a test battle). */
    reset(names) {
        const deck = this.cards();
        deck.splice(0, deck.length);
        for (const name of names || []) deck.push(name);
        return deck.length;
    }

    /** Take one card out of the deck and hand it over; null when it is empty. */
    draw() {
        const deck = this.cards();
        return deck.length ? deck.shift() : null;
    }

    /** Shuffle the deck as the state's own random makes it. */
    shuffle() {
        this.player.decks.combat = this.rules.shuffle(this.state, this.cards());
        return this.player.decks.combat;
    }

    /** Sort the pile of upgrades of this deck (the physical face-up cards). */
    pile() {
        return this.upgradePile();
    }

    count(name) { return this.cards().filter(n => n === name).length; }

    /** One button per pair: the printed rule replaces two copies of one card. */
    pairOptions() {
        const counts = new Map();
        for (const name of this.cards()) counts.set(name, (counts.get(name) || 0) + 1);
        return [...counts.entries()].filter(([, n]) => n >= 2).map(([name]) => name);
    }

    /** The physical cards that can still be bought, including returned basics. */
    upgradeOptions() {
        const pile = this.upgradePile();
        if (pile.length) return pile.slice();
        return FS_CATALOG.upgradeCombatCards(this.player.faction)
            .filter(c => !this.cards().includes(c.name))
            .map(c => c.name);
    }

    /**
     * Move two copies of `remove` out of the deck, put two copies of `add` in,
     * and exchange the single physical cards between the deck and the pile.
     * The deck keeps exactly ten cards. Returns false when the move is illegal.
     * @param {string} remove @param {string} add
     */
    replacePair(remove, add) {
        if (!remove || !add || remove === add) return false;
        const deck = this.cards(), pile = this.upgradePile();
        if (!deck.length || !pile.includes(add)) return false;
        if (this.count(remove) < 2 || this.count(add) >= 2) return false;
        let taken = 0;
        const kept = deck.filter(name => {
            if (name === remove && taken < 2) { taken++; return false; }
            return true;
        });
        if (taken < 2) return false;
        pile.splice(pile.indexOf(add), 1);
        if (!pile.includes(remove)) pile.push(remove);
        this.player.decks.combat = this.rules.shuffle(this.state, kept.concat([add, add]));
        return true;
    }
}

/**
 * The hand of one side of a battle: the five cards that were dealt and the
 * cards an ability added to them. Every path that takes a card out of the hand
 * or puts one in goes through this object, so the hand of a battle is written
 * in one place — the deal, a card played, a card discarded, a card peeked at.
 */
class FSCombatHand {
    /** @param {any} rules @param {any} state @param {number} seat */
    constructor(rules, state, seat) {
        this.rules = rules;
        this.state = state;
        this.seat = seat;
        const combat = state.combat;
        this.side = combat ? CombatSides.sideOf(combat, seat) : null;
    }

    /** The whole hand of this seat; an empty list outside a battle. */
    cards() {
        if (!this.side) return [];
        return CombatCards.of(this.state.combat).hand(this.side);
    }

    /** The deck of the player this hand belongs to: a discarded card goes there. */
    get deck() {
        return FS_CARDS.combatDeck(this.rules, this.state, this.seat);
    }

    size() { return this.cards().length; }

    has(name) { return this.cards().includes(name); }

    /** The card of this hand that lies face down on the table, if any. */
    chosen() {
        if (!this.side) return null;
        return CombatCards.of(this.state.combat).chosen(this.side);
    }

    /** Lay the card chosen by the player face down: the panel shows it closed. */
    setChosen(name) {
        if (!this.side) return null;
        return CombatCards.of(this.state.combat).setChosen(this.side, name);
    }

    /** The record of the battle that holds this hand (the server keeps it). */
    slot() {
        if (!this.side) return null;
        return CombatCards.of(this.state.combat).pile(this.side);
    }

    /** Take the named card out of the hand and hand it over; null when absent. */
    take(name) {
        const hand = this.cards();
        const at = hand.indexOf(name);
        if (at < 0) return null;
        hand.splice(at, 1);
        return name;
    }

    /** Take the card at the index of the hand — the click of the panel. */
    takeAt(index) {
        const hand = this.cards();
        if (!Number.isInteger(index) || index < 0 || index >= hand.length) return null;
        return hand.splice(index, 1)[0];
    }

    /**
     * The hand the panel of another player gets: no cards, and no card lying
     * face down. A hand is known to its owner only.
     */
    hide() {
        if (!this.side) return false;
        CombatCards.of(this.state.combat).pile(this.side).hand = [];
        CombatCards.of(this.state.combat).setChosen(this.side, null);
        return true;
    }

    /** Put a card into the hand (a drawn card, a card an ability took). */
    put(name) {
        if (!name) return false;
        this.cards().push(name);
        return true;
    }

    /** Discard the named card: out of the hand and back into the deck. */
    discard(name) {
        if (this.take(name) === null) return false;
        this.deck.add(name);
        return true;
    }

    /**
     * Give the whole hand back to the deck. `onTop` puts the cards back in
     * front of it (the battle was cancelled before anything was played); by
     * default they go to the end and the caller shuffles.
     */
    returnAll(onTop) {
        const deck = this.deck;
        const cards = this.cards().slice();
        const slot = this.slot();
        if (slot) slot.hand = [];
        if (onTop) deck.cards().unshift(...cards);
        else for (const name of cards) deck.add(name);
        return true;
    }
}

/** One catalogue for the whole game: a name in, the whole card out. */
class FSCardCatalog {
    /** @param {any} data */
    constructor(data) {
        this.data = data || { events: [], combat: [], orders: [] };
        /** @type {Map<string, FSCard>} */
        this.exact = new Map();
        /** @type {Map<string, FSCard[]>} */
        this.byName = new Map();
        for (const [kind, list] of [['event', this.data.events || []],
            ['combat', this.data.combat || []], ['order', this.data.orders || []]]) {
            for (const raw of list) {
                const card = new FSCard(raw, kind, raw.faction || '');
                this.exact.set([raw.faction, kind, raw.name].join(' '), card);
                if (!this.byName.has(raw.name)) this.byName.set(raw.name, []);
                this.byName.get(raw.name).push(card);
            }
        }
    }

    /** `combat:Name` and `order:Name` are the two prefixes of a mixed choice. */
    parseOption(value) {
        const raw = String(value == null ? '' : value);
        const m = /^(combat|order|event):(.*)$/.exec(raw);
        return m ? { value: raw, name: m[2], kindHint: m[1] } : { value: raw, name: raw, kindHint: '' };
    }

    /** @param {string} faction @param {string} name @param {string} hint */
    find(faction, name, hint) {
        const order = hint ? [hint, 'event', 'combat', 'order'] : ['event', 'combat', 'order'];
        for (const kind of order) {
            const hit = this.exact.get([faction, kind, name].join(' '));
            if (hit) return hit;
        }
        const sameName = this.byName.get(name) || [];
        return sameName.find(c => !hint || c.kind === hint)
            || sameName.find(c => c.faction === faction)
            || sameName[0] || null;
    }

    /** The plain-record description of a choice, even for an unknown card. */
    detail(value, faction, hint) {
        const opt = this.parseOption(value);
        const card = this.find(faction, opt.name, hint || opt.kindHint);
        return card ? card.detail() : {
            kind: 'КАРТА', name: opt.name, deck: hint || opt.kindHint || '',
            text: 'Описание карты недоступно.', storm: [], icons: null,
        };
    }

    /** Everything the panel needs for one choice: a label, a hint and a card. */
    option(value, faction, hint) {
        const opt = this.parseOption(value);
        const card = this.find(faction, opt.name, hint || opt.kindHint);
        return {
            value: opt.value,
            name: opt.name,
            hint: card ? card.summary() : '',
            detail: this.detail(value, faction, hint),
        };
    }

    /** @param {any} rules @param {any} state @param {number} seat */
    combatDeck(rules, state, seat) {
        return new FSCombatDeck(rules, state, state.players[seat]);
    }

    /** The hand of one seat in the battle that is running. */
    combatHand(rules, state, seat) {
        return new FSCombatHand(rules, state, seat);
    }

    /** The order upgrades that are still in the face-up pile. */
    orderUpgradeOptions(state, seat) {
        const p = state.players[seat];
        const pile = p.decks && Array.isArray(p.decks.upgradeOrder) ? p.decks.upgradeOrder : null;
        if (pile) return pile.filter(name => !(p.upgrades || []).some(u => u.name === name));
        return FS_CATALOG.orderCards(p.faction)
            .filter(c => !(p.upgrades || []).some(u => u.name === c.name))
            .map(c => c.name);
    }
}

const FS_CARDS = new FSCardCatalog(typeof FS_DATA !== 'undefined' ? FS_DATA : null);
