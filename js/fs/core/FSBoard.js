// FSBoard.js — the board as an object: systems, areas, pieces and the geometry.
//
// The rules engine used to answer "who controls this world", "how many units
// fit here" and "is there a path" in several places (the advance order, the
// effects of the cards, the deploy, the retreat, the view, the server). Each
// copy could drift, and then one map behaved differently from another.
//
// Now there is one Board per state. It owns:
//   * the systems and their areas (the grid from TileGeometry);
//   * the pieces that stand in an area and the control it gives;
//   * the capacity of an area (the world banner plus the modifiers of the
//     order that is being resolved);
//   * the neighbours, the sides, the areas that touch and a path through the
//     friendly areas (warp storms included).
//
// The board never changes the state: it is a read-only view of it. A command
// changes `state`, and the same Board then reads the new picture (the state
// object stays the same); a cloned state gets its own Board.

class Board {
    /** @param {any} state the game state (plain JSON) */
    constructor(state) {
        this.state = state;
    }

    /**
     * The board of a state. WeakMap: a state that is thrown away takes its
     * board with it, a temporary cloned state gets its own board.
     * @param {any} state
     */
    static of(state) {
        let board = Board.cache.get(state);
        if (!board) {
            board = new Board(state);
            Board.cache.set(state, board);
        }
        return board;
    }

    // --- systems and areas ----------------------------------------------------

    get systems() {
        return (this.state && this.state.systems) || [];
    }

    /** @param {string} id */
    system(id) {
        return this.systems.find(s => s.id === id) || null;
    }

    /** @param {any} systemOrId @param {string} pos */
    area(systemOrId, pos) {
        const sys = typeof systemOrId === 'string' ? this.system(systemOrId) : systemOrId;
        return sys ? sys.areas.find(a => a.pos === pos) || null : null;
    }

    /** @param {string} pos */
    areaIndex(pos) {
        return TileGeometry.index(pos);
    }

    /** The order tokens of one system, bottom to top. */
    ordersIn(systemId) {
        const sys = this.system(systemId);
        return sys && sys.tokens ? sys.tokens : [];
    }

    /**
     * The token on top of the pile of a system: only this one may resolve, and
     * only its owner has the system for the turn. Null for an empty pile.
     */
    topOrder(systemId) {
        const tokens = this.ordersIn(systemId);
        return tokens.length ? tokens[tokens.length - 1] : null;
    }

    /** @param {string} systemId @param {string} pos */
    unitsAt(systemId, pos) {
        return (this.state.units || []).filter(u => u.system === systemId && u.area === pos);
    }

    /** All units of one system (both players), in any area. */
    unitsIn(systemId) {
        return (this.state.units || []).filter(u => u.system === systemId);
    }

    /** @param {string} systemId @param {string} pos */
    structuresAt(systemId, pos) {
        return (this.state.structures || []).filter(s => s.system === systemId && s.area === pos);
    }

    /** Is there a structure of anybody on this world? */
    hasStructure(systemId, pos) {
        return (this.state.structures || []).some(s => s.system === systemId && s.area === pos);
    }

    /** @param {string} systemId */
    structuresIn(systemId) {
        return (this.state.structures || []).filter(s => s.system === systemId);
    }

    /**
     * The seats that can fight for an area: units and bastions. A factory or a
     * city never holds the field on its own — it cannot open a battle.
     */
    warSeatsAt(systemId, pos) {
        const seats = new Set();
        for (const u of this.unitsAt(systemId, pos)) seats.add(u.seat);
        for (const s of this.structuresAt(systemId, pos)) if (s.type === 'bastion') seats.add(s.seat);
        return seats;
    }

    // --- control --------------------------------------------------------------

    /**
     * Friendly / contested / none, from the point of view of one seat.
     * «none» also covers an area held only by somebody else — callers that need
     * to tell an enemy area from an empty one ask `areaState`.
     */
    control(seat, systemId, pos) {
        const mine = this.unitsAt(systemId, pos).some(u => u.seat === seat)
            || this.structuresAt(systemId, pos).some(s => s.seat === seat);
        if (!mine) return 'none';
        const theirs = this.unitsAt(systemId, pos).some(u => u.seat !== seat)
            || this.structuresAt(systemId, pos).some(s => s.seat !== seat);
        return theirs ? 'contested' : 'friendly';
    }

    /**
     * The state of an area as the rules name it: friendly, enemy, uncontrolled
     * or contested. Contested is decided by the pieces that can fight, so a
     * lone enemy factory does not make a battle.
     */
    areaState(seat, systemId, pos) {
        if (this.warSeatsAt(systemId, pos).size > 1) return 'contested';
        const mine = this.unitsAt(systemId, pos).some(u => u.seat === seat)
            || this.structuresAt(systemId, pos).some(x => x.seat === seat);
        if (mine) return 'friendly';
        const theirs = this.unitsAt(systemId, pos).some(u => u.seat !== seat)
            || this.structuresAt(systemId, pos).some(x => x.seat !== seat);
        return theirs ? 'enemy' : 'uncontrolled';
    }

    /** @param {number} seat @param {string} systemId */
    hasUnitsOrStructures(seat, systemId) {
        return this.unitsIn(systemId).some(u => u.seat === seat)
            || this.structuresIn(systemId).some(s => s.seat === seat);
    }

    /** Every area the seat holds alone. */
    friendlyAreas(seat) {
        const out = [];
        for (const sys of this.systems) {
            for (const area of sys.areas) {
                if (this.control(seat, sys.id, area.pos) === 'friendly') out.push({ system: sys.id, pos: area.pos });
            }
        }
        return out;
    }

    /** Every area where at least two seats can fight. */
    contestedAreas() {
        const out = [];
        for (const sys of this.systems) {
            for (const area of sys.areas) {
                if (this.warSeatsAt(sys.id, area.pos).size > 1) out.push({ system: sys.id, pos: area.pos });
            }
        }
        return out;
    }

    // --- movement -------------------------------------------------------------

    /**
     * Put a piece into an area. Every way a unit changes its area goes through
     * here — a march, a retreat, a teleport, a unit a card brings into the
     * battle — so a list of moves (`state.moves`) and the troops over the
     * capacity of the new area are never forgotten on one path and remembered
     * on another.
     * @param {any} piece a unit (or a structure) of the state
     * @param {any} dest { system, pos }
     * @param {any} [opts] { seat, note: false }
     * @returns {{ from: any, to: any }} where it stood and where it stands
     */
    moveUnit(piece, dest, opts) {
        if (!piece || !dest) return null;
        const o = opts || {};
        const from = { system: piece.system, pos: piece.area !== undefined ? piece.area : piece.pos };
        const to = {
            system: dest.system !== undefined ? dest.system : from.system,
            pos: dest.pos !== undefined ? dest.pos : (dest.area !== undefined ? dest.area : from.pos),
        };
        if (o.note !== false) {
            if (!this.state.moves) this.state.moves = [];
            this.state.moves.push({ seat: o.seat !== undefined ? o.seat : piece.seat, from, to });
        }
        piece.system = to.system;
        piece.area = to.pos;
        return { from, to };
    }

    /** Put a piece into an area without remembering the move (setup, undo). */
    placeUnit(piece, dest) {
        return this.moveUnit(piece, dest, { note: false });
    }

    // --- capacity -------------------------------------------------------------

    /**
     * The plastic of an area: how many units of ONE player may stand there.
     * «… can never end the movement with more than five units in a single
     * area» — the same five for every way a unit arrives (a march, a retreat,
     * a free placement of a card, a reinforcement). The printed skulls of a
     * world are its capacity (see `capacity`), which a player may exceed — this
     * is the hard limit he may not.
     * @param {string} systemId @param {string} pos @param {number} [seat] whose units
     */
    unitLimit(systemId, pos, seat) {
        const area = this.area(systemId, pos);
        if (!area) return 0;
        if (seat === undefined || seat === null) return FS_RULES_CONFIG.AREA_MAX_UNITS;
        const mine = this.unitsAt(systemId, pos).filter(u => u.seat === seat).length;
        return Math.max(0, FS_RULES_CONFIG.AREA_MAX_UNITS - mine);
    }

    /** Is there room for `n` more units of `seat` in the area? */
    hasRoom(systemId, pos, seat, n) {
        return this.unitLimit(systemId, pos, seat) >= (n || 1);
    }

    /**
     * The capacity of an area: the skulls of the world banner, three for a
     * void, never more than five units. The order in play may raise it for the
     * cities (and only for the units it names).
     * @param {string} systemId @param {string} pos @param {any} [def] the unit being placed
     */
    capacity(systemId, pos, def) {
        const area = this.area(systemId, pos);
        if (!area) return 0;
        let cap = area.world ? (area.world.capacity || FS_RULES_CONFIG.AREA_CAP) : FS_RULES_CONFIG.AREA_CAP;
        const order = this.state.order;
        const limits = DeployLimits.of(order);
        if (limits && limits.capacityBonus) {
            const city = this.structuresAt(systemId, pos).some(s => s.type === 'city' && s.seat === order.seat);
            if (city && limits.capacityFits(def)) {
                cap += limits.capacityBonus;
                if (limits.capacityMax) cap = Math.min(cap, limits.capacityMax);
            }
        }
        return Math.min(cap, FS_RULES_CONFIG.AREA_MAX_UNITS);
    }

    // --- geometry: the one implementation -------------------------------------

    /** The systems next to a system (they share a gold border). */
    neighbors(systemId) {
        const sys = this.system(systemId);
        if (!sys) return [];
        return this.systems
            .filter(other => other.id !== sys.id && TileGeometry.cellsTouch(other, sys))
            .map(other => other.id);
    }

    /** The side of system A that faces system B; null if they do not touch. */
    sideBetween(aId, bId) {
        const a = this.system(aId), b = this.system(bId);
        return a && b ? TileGeometry.sideBetween(a, b) : null;
    }

    /** The system across one side of a system; null at the edge of the board. */
    across(systemId, side) {
        const sys = this.system(systemId);
        const cell = sys ? TileGeometry.cellAcross(sys, side) : null;
        if (!cell) return null;
        const other = this.systems.find(s => Number(s.row) === cell.row && Number(s.col) === cell.col);
        return other ? other.id : null;
    }

    /** Is there a warp storm on the border between two systems? */
    stormOn(aId, bId) {
        return typeof FS_WARP_STORMS !== 'undefined' ? FS_WARP_STORMS.stormOn(this.state, aId, bId) : null;
    }

    /**
     * The areas that share a border with an area: the three of its own tile
     * (the printed snake) and the ones across a gold border.
     */
    areasAround(systemId, pos) {
        const out = [];
        for (const next of TileGeometry.adjacentPositions(pos)) {
            if (this.area(systemId, next)) out.push({ system: systemId, pos: next });
        }
        for (const nb of this.neighbors(systemId)) {
            for (const area of this.system(nb).areas) {
                if (this.areasTouch(systemId, pos, nb, area.pos)) out.push({ system: nb, pos: area.pos });
            }
        }
        return out;
    }

    /** Do two areas of two neighbouring systems share a gold border? */
    areasTouch(sysA, posA, sysB, posB) {
        const side = this.sideBetween(sysA, sysB);
        if (!side) return false;
        return TileGeometry.areasTouch(side, posA, posB);
    }

    /** The systems a ground unit may walk through: a chain of friendly areas. */
    pathExists(seat, fromSystem, fromPos, toSystem, toPos, opts) {
        if (fromSystem === toSystem && fromPos === toPos) return true;
        const order = this.state.order;
        // «Крестный ход»: uncontrolled worlds are friendly for the march, but
        // only for the number of units the card allows.
        const plan = order ? MarchPlan.of(order) : null;
        const march = opts && opts.uncontrolled === false ? 0
            : (plan ? plan.uncontrolledLeft : 0);
        /** @type {Map<string, number>} */
        const seen = new Map([[fromSystem + ':' + fromPos, 0]]);
        const queue = [{ system: fromSystem, pos: fromPos, voids: 0 }];
        while (queue.length) {
            const cur = queue.shift();
            for (const next of this.areasAround(cur.system, cur.pos)) {
                const key = next.system + ':' + next.pos;
                if (this.stormOn(cur.system, next.system) && !(opts && opts.storms)) continue;
                // The destination may be an empty world — the way to it must be friendly.
                if (next.system === toSystem && next.pos === toPos) return true;
                let voids = cur.voids;
                const area = this.area(next.system, next.pos);
                const control = this.control(seat, next.system, next.pos);
                const byMarch = control !== 'friendly' && march > 0 && area && area.world
                    && !this.unitsAt(next.system, next.pos).length
                    && !this.structuresAt(next.system, next.pos).length;
                if (control !== 'friendly' && !byMarch) {
                    // Some orders let the units pass through empty voids.
                    const pass = order ? OrderMove.of(order).passVoid : 0;
                    if (!pass || !area || area.world || voids >= pass
                        || this.unitsAt(next.system, next.pos).length
                        || this.structuresAt(next.system, next.pos).length) continue;
                    voids++;
                }
                if (seen.has(key) && seen.get(key) <= voids) continue;
                seen.set(key, voids);
                queue.push({ system: next.system, pos: next.pos, voids });
            }
        }
        return false;
    }

    // --- economy helpers ------------------------------------------------------

    /** The materiel a player gains in the refresh phase from his friendly worlds. */
    materielIncome(seat) {
        let sum = 0;
        for (const sys of this.systems) {
            for (const area of sys.areas) {
                if (!area.world) continue;
                if (this.control(seat, sys.id, area.pos) !== 'friendly') continue;
                sum += area.world.materiel || 0;
            }
        }
        return sum;
    }

    /** The worlds a player holds alone, with their printed values. */
    friendlyWorlds(seat) {
        const out = [];
        for (const sys of this.systems) {
            for (const area of sys.areas) {
                if (!area.world) continue;
                if (this.control(seat, sys.id, area.pos) !== 'friendly') continue;
                out.push({ system: sys.id, pos: area.pos, world: area.world });
            }
        }
        return out;
    }
}

/** @type {WeakMap<any, Board>} */
Board.cache = new WeakMap();
