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

    rng(state) {
        state.rng = (state.rng + 0x6D2B79F5) | 0;
        let t = state.rng;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    rand(state, n) {
        return Math.floor(this.rng(state) * n);
    }

    shuffle(state, arr) {
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i--) {
            const j = this.rand(state, i + 1);
            const t = a[i]; a[i] = a[j]; a[j] = t;
        }
        return a;
    }

    uid(state, prefix) {
        state.uid = (state.uid || 0) + 1;
        return prefix + state.uid;
    }

    log(state, seat, text) {
        state.log.push({ seat, text });
        if (state.log.length > 200) state.log.shift();
    }

    board(state) {
        return Board.of(state);
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
        const order = state.order;
        if (!order || order.seat !== seat) return null;
        if (kind && order.order !== kind) return null;
        return order;
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

    unitsAt(state, systemId, pos) {
        return this.board(state).unitsAt(systemId, pos);
    }

    structuresAt(state, systemId, pos) {
        return this.board(state).structuresAt(systemId, pos);
    }

    capacity(state, systemId, pos, def) {
        return this.board(state).capacity(systemId, pos, def);
    }

    /** The plastic of an area: «no more than five units of one player». */
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
            const sys = state.order ? state.order.system : null;
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

    friendlyAreas(state, seat) {
        return this.board(state).friendlyAreas(seat);
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

    areasTouch(state, sysA, posA, sysB, posB) {
        return this.board(state).areasTouch(sysA, posA, sysB, posB);
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
        const out = [];
        for (let i = 0; i < n; i++) {
            out.push(['att', 'def', 'morale'][this.rand(state, 3)]);
        }
        return out;
    }

    view(state, seat) {
        const copy = JSON.parse(JSON.stringify(state));
        FS_WARP_STORMS.normalize(copy);
        for (const p of copy.players) {
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
            for (const side of ['attacker', 'defender']) {
                const combatSeat = copy.combat[side];
                // The hand of the copy: hidden from the other players, and the
                // card that lies face down is closed for everybody.
                const hand = FS_CARDS.combatHand(this.engine, copy, combatSeat);
                if (combatSeat !== seat) hand.hide();
                hand.setChosen(null);
            }
            const staged = copy.combat.staged || {};
            copy.combat.chosen = {
                attacker: !!(staged.attacker),
                defender: !!(staged.defender),
            };
            delete copy.combat.staged;
            // The card the opponent laid is secret — unless a card let the
            // player peek at it («Скитарии-инфильтраторы»): only he sees it.
            const peeked = (copy.combat.peek || {})[seat] || null;
            copy.combat.peek = peeked ? { name: peeked } : null;
        }
        // The question of the effect: the cards of the hand of the opponent
        // are not shown.
        if (copy.pending && copy.pending.question && copy.pending.question.kind === 'cards') {
            const owner = copy.pending.seat;
            if (owner !== seat) copy.pending.question.options = [];
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
        copy.seat = seat;
        return copy;
    }


    structureName(type) {
        return { city: 'город', factory: 'фабрика', bastion: 'бастион' }[type] || type;
    }
}
