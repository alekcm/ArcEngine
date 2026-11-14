// FSRulesCore.js — the shared ground of every rule: ids, the log, the data,
// the board, a player, the economy and the state a seat sees.
//
// The methods here are state-first, like every rule service: a function of the
// state, never a hidden field. The engine (FSRules.js) delegates to this class;
// a command calls this.engine.log(state, seat, text) and lands here.

class CoreRules {
    /** @param {any} engine the rules facade (FSRules.js) */
    constructor(engine) {
        this.engine = engine;
    }

    // The dice and the ids are one object (Chance): the rules only ask it.
    rng(state) {
        return Chance.of(state).float();
    }

    rand(state, n) {
        return Chance.of(state).below(n);
    }

    shuffle(state, arr) {
        return Chance.of(state).shuffle(arr);
    }

    uid(state, prefix) {
        return Chance.of(state).id(prefix);
    }

    log(state, seat, text) {
        GameLog.of(state).add(seat, text);
    }

    board(state) {
        return Board.of(state);
    }

    /**
     * The queue of the areas that wait for their owner's choice: the places that
     * are over capacity after an order. It owns the field of the queue.
     */
    trimQueue(state) {
        return TrimQueue.of(state);
    }

    player(state, seat) {
        return PlayerEntity.of(state, seat);
    }

    /**
     * The order that is being resolved, if it is the order of `seat` and of the
     * named kind. Null otherwise. Every command of an order starts with the same
     * three questions («есть ли приказ, того ли он вида, вашего ли он игрока»);
     * they are asked here, once.
     */
    orderOf(state, seat, kind) {
        const context = OrderContext.of(state.order);
        if (!context || !context.mine(seat, kind)) return null;
        return context.order;
    }

    faction(state, seat) {
        const p = state.players[seat];
        return FS_CATALOG.factionOfPlayer(p);
    }

    factionById(id) {
        return FS_CATALOG.faction(id);
    }

    normalizePalette(pal, fallback) {
        return FS_CATALOG.palette(pal, fallback);
    }

    /**
     * The seat that owns an objective token. Tokens are keyed by the owner's
     * seat, not by his faction: two players may well play the same faction,
     * and each of them needs his own tokens. A token recorded with the
     * faction only (older fixtures) belongs to the first player of that faction.
     */
    objectiveOwnerSeat(state, objective) {
        if (!objective) return -1;
        if (Number.isInteger(objective.seat) && state.players[objective.seat]) return objective.seat;
        const p = state.players.find(x => x.faction === objective.faction);
        return p ? p.seat : -1;
    }

    objectiveOwner(state, objective) {
        const seat = this.objectiveOwnerSeat(state, objective);
        return seat >= 0 ? state.players[seat] : null;
    }

    unitDef(state, seat, unitId) {
        const p = state.players[seat];
        return p ? FS_CATALOG.unit(p.faction, unitId) : null;
    }

    unitOf(state, unit) {
        return FS_CATALOG.unitOfUnit(unit);
    }

    system(state, id) {
        return this.board(state).system(id);
    }

    area(system, pos) {
        return system ? system.areas.find(a => a.pos === pos) : null;
    }

    areaIndex(pos) {
        return TileGeometry.index(pos);
    }

    /** Is there a structure of anybody on this world? */
    hasStructure(state, systemId, pos) {
        return this.board(state).hasStructure(systemId, pos);
    }

    unitsAt(state, systemId, pos) {
        return this.board(state).unitsAt(systemId, pos);
    }

    structuresAt(state, systemId, pos) {
        return this.board(state).structuresAt(systemId, pos);
    }

    capacity(state, systemId, pos, def) {
        return this.board(state).capacity(systemId, pos, def);
    }

    /** Remaining room under the five-unit Advance movement limit. */
    unitLimit(state, systemId, pos, seat) {
        return this.board(state).unitLimit(systemId, pos, seat);
    }

    hasRoom(state, systemId, pos, seat, n) {
        return this.board(state).hasRoom(systemId, pos, seat, n);
    }

    /**
     * The refusal of the hard limit, worded once. «Five» is the number of the
     * printed rules and the tests quote them; the count itself stays in the
     * config.
     */
    unitLimitText() {
        return 'В области не может стоять больше пяти отрядов.';
    }

    countFor(state, seat, kind) {
        const p = state.players[seat];
        if (!kind) return 0;
        if (kind === 'friendlyBastion') {
            return state.systems.reduce((sum, sys) => sum + sys.areas.filter(a => {
                if (this.control(state, seat, sys.id, a.pos) !== 'friendly') return false;
                return this.structuresAt(state, sys.id, a.pos).some(s => s.seat === seat && s.type === 'bastion');
            }).length, 0);
        }
        if (kind === 'yourCity') {
            return state.systems.reduce((sum, sys) => sum + sys.areas.filter(a =>
                this.structuresAt(state, sys.id, a.pos).some(s => s.seat === seat && s.type === 'city')).length, 0);
        }
        if (kind === 'cultist') {
            const sys = OrderContext.of(state.order) ? OrderContext.of(state.order).system : null;
            return state.units.filter(u => u.seat === seat && (!sys || u.system === sys)
                && /культист/i.test((this.unitOf(state, u) || {}).name || '')).length;
        }
        if (kind === 'reinforcement') return this.engine.player(state, seat).assetCount('reinforcement');
        if (kind === 'mixedSystem') {
            return state.systems.filter(sys => {
                const mine = state.units.some(u => u.system === sys.id && u.seat === seat);
                const theirs = state.units.some(u => u.system === sys.id && u.seat !== seat);
                return mine && theirs;
            }).length;
        }
        if (kind === 'noFoeSystem') {
            return state.systems.filter(sys => !state.units.some(u => u.system === sys.id && u.seat !== seat)).length;
        }
        return 0;
    }

    control(state, seat, systemId, pos) {
        return this.board(state).control(seat, systemId, pos);
    }

    areaState(state, seat, systemId, pos) {
        return this.board(state).areaState(seat, systemId, pos);
    }

    warSeatsAt(state, systemId, pos) {
        return this.board(state).warSeatsAt(systemId, pos);
    }

    commandLevel(state, seat) {
        const p = this.player(state, seat);
        return p ? p.commandLevel() : 0;
    }

    materielIncome(state, seat) {
        return this.board(state).materielIncome(seat);
    }

    neighbors(state, systemId) {
        return this.board(state).neighbors(systemId);
    }

    sideBetween(state, aId, bId) {
        return this.board(state).sideBetween(aId, bId);
    }

    across(state, systemId, side) {
        return this.board(state).across(systemId, side);
    }

    stormOn(state, aId, bId) {
        return this.board(state).stormOn(aId, bId);
    }

    pathExists(state, seat, fromSystem, fromPos, toSystem, toPos, opts) {
        return this.board(state).pathExists(seat, fromSystem, fromPos, toSystem, toPos, opts);
    }

    areasAround(state, systemId, pos) {
        return this.board(state).areasAround(systemId, pos);
    }

    rotateArea(pos, turns) {
        return TileGeometry.rotate(pos, turns);
    }

    tileFaces(id) {
        return FS_CATALOG.tileFaces(id);
    }

    setupAdjacent(a, b) {
        return TileGeometry.cellsTouch(a, b);
    }

    structureStats(type) {
        return FS_CATALOG.structure(type);
    }

    assetName(asset) {
        return FS_ASSET_NAMES[asset] || asset;
    }

    /**
     * The ability of a faction as it is printed in the panel of the Dominate
     * order: «Название: текст». One place names it — the rule of the order and
     * the beginning of the phase both ask here.
     */
    factionAbilityText(state, seat) {
        const f = this.faction(state, seat);
        return f && f.ability ? f.ability.name + ': ' + f.ability.text : '';
    }

    friendlyWorlds(state, seat) {
        let n = 0;
        for (const sys of state.systems) {
            for (const area of sys.areas) {
                if (area.world && this.control(state, seat, sys.id, area.pos) === 'friendly') n++;
            }
        }
        return n;
    }

    unitsOf(state, seat) {
        return state.units.filter(u => u.seat === seat).length;
    }

    rollDice(state, n) {
        return Chance.of(state).roll(n);
    }

    view(state, seat) {
        const copy = JSON.parse(JSON.stringify(state));
        FS_WARP_STORMS.normalize(copy);
        // Only a player's own top order may be inspected. Other facedown
        // orders, even his own below the top, have no face in the LAN view.
        for (const sys of copy.systems || []) {
            const tokens = sys.tokens || [];
            tokens.forEach((token, index) => {
                if (!token.faceUp && !(token.seat === seat && index === tokens.length - 1)) delete token.order;
            });
        }
        // Older saved logs included the hidden type when placing an order.
        for (const entry of copy.log || []) {
            if (typeof entry.text === 'string') entry.text = entry.text
                .replace(/выложил приказ «[^»]+» в систему /, 'выложил закрытый приказ в систему ')
                .replace(/перекладывает приказ «[^»]+» из системы /, 'перекладывает закрытый приказ из системы ');
        }
        for (const p of copy.players) {
            // Totals by kind are useful for one's own hand, but would disclose
            // the other player's facedown orders.
            if (p.seat !== seat) delete p.placedOf;
            // Only the count leaves the server: the deck itself is known to all
            // players through decksCombatKnown below, and the rest is the pile
            // of a player. One loop, one shape.
            p.decks = {
                combat: (p.decks.combat || []).length,
                event: (p.decks.event || []).length,
                upgradeCombat: (p.decks.upgradeCombat || []).length,
                upgradeOrder: (p.decks.upgradeOrder || []).length,
            };
            p.objectivePool = p.objectivePool.length;
            p.supply = {
                units: p.supply.units,
                structures: p.supply.structures,
            };
        }
        // The cards of the combat: only the player sees his own hand. The card that
        // was chosen stays closed — the other side only knows that it is there.
        if (copy.combat) {
            // The hand of the copy is hidden from the other players, and the card
            // that lies face down is closed for everybody: one object knows what a
            // seat may see.
            CombatCards.of(copy.combat).hideFrom(seat);
        }
        // A private explanation (for example the face seen by «Обход») only
        // goes to the seat answering the question, not merely to the UI hidden
        // by CSS. The authoritative pending question remains untouched.
        if (copy.pending && copy.pending.question) {
            const answerSeat = copy.pending.answerSeat === undefined ? copy.pending.seat : copy.pending.answerSeat;
            if (answerSeat !== seat) delete copy.pending.question.privateText;
            // Cards from another player's hand are likewise not sent as options.
            if (copy.pending.question.kind === 'cards' && copy.pending.seat !== seat)
                copy.pending.question.options = [];
        }
        if (copy.setup) {
            copy.setup.hand = (copy.setup.hands[seat] || []).slice();
            delete copy.setup.hands;
            copy.setup.legalCells = copy.setup.stage === 'tile' ? this.engine.setupLegalCells(copy) : [];
            copy.setup.objectiveOptions = [];
            if (copy.setup.stage === 'objectives' && copy.setup.turn === seat) copy.setup.objectiveOptions = this.engine.setupObjectiveOptions(state);
            copy.setup.stormEdges = copy.setup.stage === 'storms' ? this.engine.setupStormEdges(state) : [];
            copy.setup.myTurn = copy.setup.turn === seat;
        }
        // The combat deck is not hidden information: every player sees every
        // deck's contents (sorted names only — the draw order stays on the server).
        for (let i = 0; i < copy.players.length; i++) {
            const src = state.players[i];
            if (src && src.decks) copy.players[i].decksCombatKnown = (src.decks.combat || []).slice().sort();
        }
        Seat.of(copy).stateOf(seat);
        return copy;
    }


    structureName(type) {
        return { city: 'город', factory: 'фабрика', bastion: 'бастион' }[type] || type;
    }
}
