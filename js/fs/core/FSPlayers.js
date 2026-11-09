// FSPlayers.js — one player of the state as an object.
//
// The rules used to carry the accounting of a player around as bare fields:
// `p.assets[asset] < (p.faction === 'тираниды' ? 4 : 3)` was written five
// times in FSRules and once more in FSEffects, and a card that raised the
// asset limit was seen by only some of those copies. Now the limit, the
// income, the command level and the supply of models have single methods.
//
// The object is a read/write VIEW of the plain player record: the state is
// still serialisable, the server still sends it as JSON, and a command that
// writes `p.assets.forge++` through this object is a command that writes the
// state.

/** The three kinds of asset tokens (prosperity is a choice, not a token). */
const FS_ASSET_KINDS = ['forge', 'cache', 'reinforcement'];

const FS_ASSET_NAMES = {
    forge: 'кузница',
    cache: 'тайник',
    reinforcement: 'подкрепление',
    prosperity: 'процветание',
};

class PlayerEntity {
    /** @param {any} state @param {number} seat */
    constructor(state, seat) {
        this.state = state;
        this.seat = seat;
    }

    /** The entity of one seat; null for a seat that does not exist. */
    static of(state, seat) {
        const data = state && state.players ? state.players[seat] : null;
        if (!data) return null;
        /** @type {WeakMap<any, Map<number, PlayerEntity>>} */
        const cache = PlayerEntity.cache;
        let bySeat = cache.get(state);
        if (!bySeat) {
            bySeat = new Map();
            cache.set(state, bySeat);
        }
        let entity = bySeat.get(seat);
        if (!entity) {
            entity = new PlayerEntity(state, seat);
            bySeat.set(seat, entity);
        }
        return entity;
    }

    /** Every seat of the state, from the first player around. */
    static all(state) {
        return (state.players || []).map((/** @type {any} */ _p, seat) => PlayerEntity.of(state, seat)).filter(Boolean);
    }

    // --- the printed side -----------------------------------------------------

    get data() {
        return this.state.players[this.seat];
    }

    get factionId() {
        return this.data ? this.data.faction : '';
    }

    get faction() {
        return FS_CATALOG.faction(this.factionId);
    }

    get name() {
        return this.data ? this.data.name : '';
    }

    get board() {
        return Board.of(this.state);
    }

    // --- assets ---------------------------------------------------------------

    get assets() {
        return this.data.assets || (this.data.assets = {});
    }

    /**
     * How many tokens of a kind the player may hold: three, four for the
     * reinforcement tokens of the Tyranids (07-tokens.md), and more when a card
     * raises the limit for the whole game (`assetLimit` of the player record).
     */
    assetLimit(kind) {
        return FS_CATALOG.assetLimitFor(this.data, kind);
    }

    hasRoomFor(kind) {
        return (this.assets[kind] || 0) < this.assetLimit(kind);
    }

    /** The asset kinds with free room, cheapest first as the engine hands them out. */
    freeAssetKinds(kinds) {
        return (kinds || FS_ASSET_KINDS)
            .filter(k => this.hasRoomFor(k))
            .sort((a, b) => (this.assets[a] || 0) - (this.assets[b] || 0));
    }

    /**
     * Add tokens of one kind up to the limit; returns how many were added.
     * Matters for the cards: a token over the limit is lost, not banked.
     */
    addAsset(kind, n = 1) {
        if (!kind) return 0;
        const limit = this.assetLimit(kind);
        const have = this.assets[kind] || 0;
        const add = Math.max(0, Math.min(n, limit - have));
        if (add) this.assets[kind] = have + add;
        return add;
    }

    /** Spend tokens; returns false (and changes nothing) when there are not enough. */
    payAsset(kind, n = 1) {
        if ((this.assets[kind] || 0) < n) return false;
        this.assets[kind] -= n;
        return true;
    }

    /**
     * Put exactly this many tokens in place — for the setup and the tests, where
     * the board is built rather than earned. The limit is NOT applied: a test
     * may hand out five tokens to see what the rules do with them.
     */
    setAsset(kind, n) {
        if (!kind) return 0;
        this.assets[kind] = Math.max(0, Number(n) || 0);
        return this.assets[kind];
    }

    /** How many tokens of a kind the player holds. The only reader of the record. */
    assetCount(kind) {
        return this.assets[kind] || 0;
    }

    /** Take tokens away down to zero; returns how many were taken. */
    takeAsset(kind, n = 1) {
        if (!kind) return 0;
        const have = this.assets[kind] || 0;
        const take = Math.max(0, Math.min(n, have));
        if (take) this.assets[kind] = have - take;
        return take;
    }

    /** Spend one asset of any kind the player chooses (an "asset of your choice"). */
    payAnyAsset(kinds) {
        for (const kind of (kinds || FS_ASSET_KINDS)) {
            if ((this.assets[kind] || 0) > 0) {
                this.assets[kind]--;
                return kind;
            }
        }
        return null;
    }

    assetName(kind) {
        return FS_ASSET_NAMES[kind] || kind;
    }

    // --- the combat deck -------------------------------------------------------

    /**
     * The combat deck of the player as one object: the cards, the pair that a
     * purchase replaces, the draw. Every writer of the deck (a purchase, a
     * card that returns a card, the clean-up of a combat) goes through this
     * account, so the rules about the deck are written once.
     */
    get combatDeck() {
        return FS_CARDS.combatDeck(FS_RULES, this.state, this.seat);
    }

    /** The hand of this player in the battle that is running, as one object. */
    get combatHand() {
        return FS_CARDS.combatHand(FS_RULES, this.state, this.seat);
    }

    // --- materiel and command -------------------------------------------------

    get materiel() {
        return this.data.materiel || 0;
    }

    /** Pay materiel; never below zero. Returns false when there is not enough. */
    payMateriel(n) {
        const cost = Math.max(0, Number(n) || 0);
        if (this.materiel < cost) return false;
        this.data.materiel = this.materiel - cost;
        return true;
    }

    gainMateriel(n) {
        this.data.materiel = Math.min(FS_RULES_CONFIG.MATERIEL_MAX, this.materiel + Math.max(0, Number(n) || 0));
    }

    /** The cities the player controls: one command level each. */
    cities() {
        return (this.state.structures || []).filter(s => s.seat === this.seat && s.type === 'city').length;
    }

    /** Command level: the cities, plus whatever the active order adds («Сила воли»). */
    commandLevel() {
        const order = this.state.order;
        const fight = OrderFight.of(order);
        const bonus = order && order.seat === this.seat && fight ? fight.klBonus : 0;
        return this.cities() + bonus;
    }

    /** The number of materiel gained in the refresh phase. */
    materielIncome() {
        return this.board.materielIncome(this.seat);
    }

    // --- order tokens ---------------------------------------------------------

    /** The orders the player may still place this round. */
    orderLimit() {
        return FS_RULES_CONFIG.ORDER_TOKENS + (this.data.extraOrderTokens || 0);
    }

    /** Are there orders to place this round? (the planning panel asks this) */
    ordersLeft() {
        return Math.max(0, this.orderLimit() - (this.data.placedTokens || 0));
    }

    /** How many tokens of one kind are still in hand (two of every kind, less the laid ones). */
    orderKindLeft(kind) {
        const used = this.data.placedOf ? (this.data.placedOf[kind] || 0) : 0;
        return Math.max(0, FS_RULES_CONFIG.ORDER_SUPPLY - used);
    }

    /** The order tokens lying in the play area (placed, minus the board and the event deck). */
    usedOrderTokens() {
        const onBoard = (this.state.systems || []).reduce((n, sys) =>
            n + (sys.tokens || []).filter((/** @type {any} */ t) => t.seat === this.seat).length, 0);
        return Math.max(0, (this.data.placedTokens || 0) - onBoard - (this.data.eventTokens || 0));
    }

    // --- supply of the models -------------------------------------------------

    /** How many models of a unit are left in the supply. */
    supplyLeft(unitId) {
        const supply = this.data.supply && this.data.supply.units;
        return supply ? (supply[unitId] || 0) : 0;
    }

    /** Take models out of the supply; false when the supply is short. */
    takeSupply(unitId, n = 1) {
        if (this.supplyLeft(unitId) < n) return false;
        this.data.supply.units[unitId] -= n;
        return true;
    }

    returnSupply(unitId, n = 1) {
        if (!this.data.supply) this.data.supply = { units: {}, structures: {} };
        if (!this.data.supply.units) this.data.supply.units = {};
        this.data.supply.units[unitId] = (this.data.supply.units[unitId] || 0) + n;
    }

    // --- structures -----------------------------------------------------------

    /** The structure control tokens the player has left. */
    structureTokensLeft() {
        const used = (this.state.structures || []).filter(s => s.seat === this.seat).length;
        return Math.max(0, FS_RULES_CONFIG.STRUCTURE_TOKENS - used);
    }
}

/** @type {WeakMap<any, Map<number, PlayerEntity>>} */
PlayerEntity.cache = new WeakMap();
