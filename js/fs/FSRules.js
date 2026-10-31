// FSRules.js — the rules engine of Forbidden Stars.
//
// One state object, one command function: the LAN server owns the state and
// applies commands (FSRules.apply), the clients only draw it. All randomness
// lives in the state (a seeded generator), so a game can be replayed.
//
// The rules follow docs/forbidden-stars/01-rules-reference.md (the full text of
// the FFG rulebook) and the data comes from FSData.js (parsed from the same
// folder by tools/fs-import.mjs).
//
// Phases of a round (Rules Reference, "Refresh Phase"):
//   planning   — every player puts four order tokens on the board
//   operations — the tokens are revealed and resolved one by one
//   refresh    — objectives, materiel, rally, event cards and warp storms
//
// Order tokens (the same file, "Planning Phase"/"Operations Phase"):
//   advance    — move ships and ground units, then fight or strike
//   deploy     — buy units (a factory in the system) and one structure
//   strategize — buy upgrade cards, the token goes to the event deck
//   dominate   — collect the assets of the friendly worlds

/** @satisfies {Record<string, any>} */
const FS_RULES = {
    // The board: the rows of the system tiles, top to bottom. Every player has
    // three tiles (their home tile and two base ones), so the board is
    // 3 x players tiles. The rows are staggered like the real board.
    LAYOUTS: { 2: [2, 2, 2], 3: [3, 3, 3], 4: [2, 3, 4, 3] },
    TILE: 100,             // px of one system tile
    MATERIEL_MAX: 14,      // the materiel dial stops at 14
    DICE_MAX: 8,           // no more than eight dice in a combat
    ORDER_TOKENS: 4,       // four order tokens per round
    ROUNDS: 8,             // the game ends after the eighth round
    AREA_CAP: 3,           // the unit capacity of a void
    AREA_MAX_UNITS: 5,     // no more than five units in one area
    STRUCTURE_LIMIT: 3,    // three cities, three factories and three bastions

    // -----------------------------------------------------------------------
    //  Small helpers
    // -----------------------------------------------------------------------

    // A seeded generator (mulberry32). The state keeps the seed, so a game can
    // be replayed from the start.
    rng(state) {
        state.rng = (state.rng + 0x6D2B79F5) | 0;
        let t = state.rng;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },

    rand(state, n) {
        return Math.floor(this.rng(state) * n);
    },

    shuffle(state, arr) {
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i--) {
            const j = this.rand(state, i + 1);
            const t = a[i]; a[i] = a[j]; a[j] = t;
        }
        return a;
    },

    // A short unique id.
    uid(state, prefix) {
        state.uid = (state.uid || 0) + 1;
        return prefix + state.uid;
    },

    log(state, seat, text) {
        state.log.push({ seat, text });
        if (state.log.length > 200) state.log.shift();
    },

    // -----------------------------------------------------------------------
    //  Data access
    // -----------------------------------------------------------------------

    faction(state, seat) {
        return FS_DATA.factions.find(f => f.id === state.players[seat].faction);
    },

    factionById(id) {
        return FS_DATA.factions.find(f => f.id === id);
    },

    unitDef(state, seat, unitId) {
        const f = this.faction(state, seat);
        return f ? f.units.find(u => u.id === unitId) : null;
    },

    // The unit type of a unit on the board.
    unitOf(state, unit) {
        const f = this.factionById(unit.faction);
        if (!f) return null;
        return f.units.find(u => u.id === unit.unit) || null;
    },

    system(state, id) {
        return state.systems.find(s => s.id === id);
    },

    area(system, pos) {
        return system ? system.areas.find(a => a.pos === pos) : null;
    },

    // The areas of a system, in the order TL, TR, BL, BR.
    areaIndex(pos) {
        return ['TL', 'TR', 'BL', 'BR'].indexOf(pos);
    },

    // Units of a player in an area.
    unitsAt(state, systemId, pos) {
        return state.units.filter(u => u.system === systemId && u.area === pos);
    },

    structuresAt(state, systemId, pos) {
        return state.structures.filter(s => s.system === systemId && s.area === pos);
    },

    // The capacity of an area: the skulls of the world banner, three for a void.
    // No more than five units may stand in one area, whatever the banner says.
    capacity(state, systemId, pos) {
        const sys = this.system(state, systemId);
        const area = this.area(sys, pos);
        if (!area) return 0;
        let cap = area.world ? (area.world.capacity || this.AREA_CAP) : this.AREA_CAP;
        // The order may make the worlds with a city hold more units.
        const order = state.order;
        if (order && order.capacityBonus) {
            const city = this.structuresAt(state, systemId, pos).some(s => s.type === 'city' && s.seat === order.seat);
            if (city) {
                cap += order.capacityBonus;
                if (order.capacityMax) cap = Math.min(cap, order.capacityMax);
            }
        }
        return Math.min(cap, this.AREA_MAX_UNITS);
    },

    // How many things are counted for the discount of the card.
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
        if (kind === 'reinforcement') return p.assets.reinforcement || 0;
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
    },

    // Friendly / enemy / uncontrolled / contested.
    control(state, seat, systemId, pos) {
        const mine = this.unitsAt(state, systemId, pos).some(u => u.seat === seat)
            || this.structuresAt(state, systemId, pos).some(s => s.seat === seat);
        if (!mine) return 'none';
        const theirs = state.units.some(u => u.system === systemId && u.area === pos && u.seat !== seat)
            || state.structures.some(s => s.system === systemId && s.area === pos && s.seat !== seat);
        return theirs ? 'contested' : 'friendly';
    },

    friendlyAreas(state, seat) {
        const out = [];
        for (const sys of state.systems) {
            for (const area of sys.areas) {
                if (this.control(state, seat, sys.id, area.pos) === 'friendly') out.push({ system: sys.id, pos: area.pos });
            }
        }
        return out;
    },

    // The command level of a player: one per city he controls.
    commandLevel(state, seat) {
        return state.structures.filter(s => s.seat === seat && s.type === 'city').length;
    },

    // The number of materiel a player gains in the refresh phase.
    materielIncome(state, seat) {
        let sum = 0;
        for (const sys of state.systems) {
            for (const area of sys.areas) {
                if (!area.world) continue;
                if (this.control(state, seat, sys.id, area.pos) !== 'friendly') continue;
                sum += area.world.materiel || 0;
            }
        }
        return sum;
    },

    // -----------------------------------------------------------------------
    //  Board geometry
    // -----------------------------------------------------------------------

    // The systems next to a system (they share a gold border).
    neighbors(state, systemId) {
        const sys = this.system(state, systemId);
        if (!sys) return [];
        const out = [];
        for (const other of state.systems) {
            if (other.id === sys.id) continue;
            if (other.row === sys.row && Math.abs(other.col - sys.col) === 1) { out.push(other.id); continue; }
            if (Math.abs(other.row - sys.row) !== 1) continue;
            // The rows are staggered: the tiles of the next row overlap by half.
            const shift = (other.row % 2 === 1 ? 1 : 0) - (sys.row % 2 === 1 ? 1 : 0);
            const diff = other.col - sys.col;
            if (diff === 0 || diff === -shift) out.push(other.id);
        }
        return out;
    },

    // The side of a system that faces another system ('N', 'E', 'S', 'W').
    sideBetween(state, aId, bId) {
        const a = this.system(state, aId), b = this.system(state, bId);
        if (!a || !b) return null;
        if (a.row === b.row) return b.col > a.col ? 'E' : 'W';
        const shift = (b.row % 2 === 1 ? 1 : 0) - (a.row % 2 === 1 ? 1 : 0);
        if (b.col === a.col) return b.row > a.row ? 'S' : 'N';
        if (b.col === a.col - 1) return b.row > a.row ? 'SW' : 'NW';
        return b.row > a.row ? 'SE' : 'NE';
    },

    // The system across a side of a system (null — the edge of the board).
    across(state, systemId, side) {
        const sys = this.system(state, systemId);
        if (!sys) return null;
        const shift = sys.row % 2 === 1 ? 1 : 0;
        let row = sys.row, col = sys.col;
        if (side === 'N') row -= 1;
        else if (side === 'S') row += 1;
        else if (side === 'E') col += 1;
        else if (side === 'W') col -= 1;
        else if (side === 'NE') { row -= 1; col += shift; }
        else if (side === 'NW') { row -= 1; col -= 1 + shift; }
        else if (side === 'SE') { row += 1; col += shift; }
        else if (side === 'SW') { row += 1; col -= 1 + shift; }
        const other = state.systems.find(s => s.row === row && s.col === col);
        return other ? other.id : null;
    },

    // Is a warp storm on the edge between two systems?
    stormOn(state, aId, bId) {
        return state.storms.find(s => (s.system === aId && this.across(state, aId, s.side) === bId)
            || (s.system === bId && this.across(state, bId, s.side) === aId)) || null;
    },

    // The systems a ground unit may walk through: a chain of friendly areas.
    // A path may not pass through an enemy, uncontrolled or contested area,
    // and not through a warp storm.
    pathExists(state, seat, fromSystem, fromPos, toSystem, toPos) {
        if (fromSystem === toSystem) return true;
        const start = { system: fromSystem, pos: fromPos };
        const seen = new Set([fromSystem + ':' + fromPos]);
        const queue = [start];
        let voids = 0;
        while (queue.length) {
            const cur = queue.shift();
            for (const next of this.areasAround(state, cur.system, cur.pos)) {
                const key = next.system + ':' + next.pos;
                if (seen.has(key)) continue;
                seen.add(key);
                if (this.stormOn(state, cur.system, next.system)) continue;   // a storm blocks the way
                // The destination may be an empty world — the way must be friendly.
                if (next.system === toSystem && next.pos === toPos) return true;
                if (this.control(state, seat, next.system, next.pos) !== 'friendly') {
                    // The order may let the units pass through the empty voids.
                    const order = state.order;
                    const area = this.area(this.system(state, next.system), next.pos);
                    if (order && order.passVoid && area && !area.world && voids < order.passVoid) {
                        voids++;
                        queue.push(next);
                    }
                    continue;
                }
                queue.push(next);
            }
        }
        return false;
    },

    // The areas that share a border with an area (not through the order box).
    areasAround(state, systemId, pos) {
        const out = [];
        const idx = this.areaIndex(pos);
        // The gold lines run "snake-like" from corner to corner through the
        // centre: the areas of a tile are adjacent as on the printed tile.
        const same = [['TL', 'TR'], ['BL', 'BR'], ['TL', 'BL'], ['TR', 'BR']];
        for (const [a, b] of same) {
            if (a === pos) { const o = this.area(this.system(state, systemId), b); if (o) out.push({ system: systemId, pos: b }); }
            if (b === pos) { const o = this.area(this.system(state, systemId), a); if (o) out.push({ system: systemId, pos: a }); }
        }
        void idx;
        // The areas of the neighbouring systems that touch this one.
        for (const nb of this.neighbors(state, systemId)) {
            for (const area of this.system(state, nb).areas) {
                if (this.areasTouch(state, systemId, pos, nb, area.pos)) out.push({ system: nb, pos: area.pos });
            }
        }
        return out;
    },

    // Do two areas of two neighbouring systems share a gold border?
    areasTouch(state, sysA, posA, sysB, posB) {
        const a = this.system(state, sysA), b = this.system(state, sysB);
        if (!a || !b) return false;
        const side = this.sideBetween(state, sysA, sysB);
        if (!side) return false;
        // The side of the tile touches the areas of that side of the neighbour.
        const near = {
            N: ['TL', 'TR'], S: ['BL', 'BR'], E: ['TR', 'BR'], W: ['TL', 'BL'],
            NE: ['TR'], NW: ['TL'], SE: ['BR'], SW: ['BL'],
        }[side] || [];
        const far = {
            N: ['TL', 'TR'], S: ['BL', 'BR'], E: ['TR', 'BR'], W: ['TL', 'BL'],
            NE: ['TR'], NW: ['TL'], SE: ['BR'], SW: ['BL'],
        }[this.sideBetween(state, sysB, sysA)] || [];
        return near.includes(posA) && far.includes(posB);
    },

    // -----------------------------------------------------------------------
    //  Setup
    // -----------------------------------------------------------------------

    // A new game: the players, the board, the initial forces.
    newGame(opts) {
        const players = opts.players || [];
        const count = players.length;
        const state = {
            rng: (opts.seed || 1) | 0,
            uid: 0,
            round: 1,
            phase: opts.interactiveSetup ? 'setup' : 'planning',
            firstPlayer: 0,
            turn: 0,
            players: [],
            systems: [],
            units: [],
            structures: [],
            objectives: [],
            storms: [],
            combat: null,
            order: null,          // the order being resolved
            log: [],
            winner: null,
            over: false,
            eventsLeft: 0,
            setup: null,
        };

        // --- the players
        players.forEach((p, seat) => {
            const faction = this.factionById(p.faction) || FS_DATA.factions[seat];
            state.players.push({
                seat,
                id: p.id || ('p' + seat),
                name: p.name || faction.name,
                faction: faction.id,
                color: faction.color,
                materiel: 6,
                assets: { forge: 0, cache: 0, reinforcement: 0, prosperity: 0 },
                objectives: 0,
                supply: { units: {}, structures: { city: 0, factory: 0, bastion: 0 } },
                orderTokens: this.ORDER_TOKENS,
                eventTokens: 0,
                decks: { combat: [], upgradeCombat: [], event: [], upgradeOrder: [] },
                hand: [],
                schemes: [],
                upgrades: [],
                upgradeCards: [],
                placed: 0,
            });
            // The initial forces: the units of the sheet and the structures and
            // tokens of the "Initial Forces" box.
            for (const u of faction.units) {
                if (u.start > 0) state.players[seat].supply.units[u.id] = u.start;
            }
            const st = faction.start;
            // A player has three cities, three factories and three bastions.
            // The initial forces lie on the board, the rest waits in the supply.
            for (const type of ['city', 'factory', 'bastion']) {
                state.players[seat].supply.structures[type] = Math.max(0, this.STRUCTURE_LIMIT - (st[type] || 0));
            }
            state.players[seat].assets.forge = st.forge || 0;
            state.players[seat].assets.cache = st.cache || 0;
            state.players[seat].assets.reinforcement = st.reinforcement || 0;
            state.players[seat].assets.prosperity = st.prosperity || 0;
            // The combat deck: five cards, two copies of every card.
            const base = FS_DATA.combat.filter(c => c.faction === faction.id && !c.upgrade).map(c => c.name);
            state.players[seat].decks.combat = this.shuffle(state, base.concat(base));
        });

        // --- the tiles: every player gets their home tile and two base tiles
        const base = this.shuffle(state, FS_DATA.tiles.filter(t => !t.home));
        const tiles = [];
        for (let seat = 0; seat < count; seat++) {
            const home = FS_DATA.tiles.find(t => t.home === state.players[seat].faction);
            const mine = [];
            if (home) mine.push(home);
            mine.push(base[seat * 2], base[seat * 2 + 1]);
            for (const t of mine) if (t) tiles.push({ tile: t, seat });
        }

        // --- the board. Online games use the actual placement phase: players take turns,
        // choosing one of their three tiles and an adjacent empty cell. The old automatic
        // composition remains available to rule tests and deterministic simulations.
        const rows = this.LAYOUTS[count] || this.LAYOUTS[2];
        const cells = [];
        rows.forEach((n, r) => { for (let c = 0; c < n; c++) cells.push({ row: r, col: c }); });
        const seatOrder = [];
        for (let i = 0; i < count; i++) seatOrder.push((state.firstPlayer + i) % count);
        for (const p of state.players) {
            p.objectivePool = [];
            for (let i = 0; i < 2 * (count - 1); i++) p.objectivePool.push(p.faction);
        }

        if (opts.interactiveSetup) {
            const hands = Array.from({ length: count }, () => []);
            for (const entry of tiles) hands[entry.seat].push(entry.tile.id);
            const midRow = Math.floor(rows.length / 2);
            const center = { row: midRow, col: Math.floor(rows[midRow] / 2) };
            state.setup = {
                slots: cells,
                hands,
                placedBySeat: Array(count).fill(0),
                placedTotal: 0,
                totalTiles: tiles.length,
                turnOrder: seatOrder,
                turnIndex: 0,
                turn: seatOrder[0],
                center,
            };
            this.log(state, -1, 'Сборка галактической карты: игроки по очереди выкладывают системные тайлы.');
        } else {
            let ti = 0;
            for (const cell of cells) {
                const entry = tiles[ti++];
                if (!entry) continue;
                const sys = this.createSystemFromTile(state, entry.tile, entry.seat, cell.row, cell.col);
                state.systems.push(sys);
                if (state.players[entry.seat].placed === 0) {
                    this.placeInitialForces(state, entry.seat, sys);
                    state.players[entry.seat].placed++;
                }
                this.placeSetupObjectives(state, sys);
            }
            this.finishBoardSetup(state);
        }

        return state;
    },

    createSystemFromTile(state, tile, seat, row, col) {
        return {
            id: 'sys' + (state.systems.length + 1),
            tile: tile.id,
            owner: seat,
            row,
            col,
            areas: tile.areas.map(a => ({
                pos: a.pos,
                world: a.world ? {
                    name: a.world.name,
                    materiel: a.world.materiel,
                    capacity: a.world.capacity,
                    assets: a.world.assets.slice(),
                    objective: !!a.world.objective,
                } : null,
            })),
            tokens: [],
        };
    },

    placeSetupObjectives(state, sys) {
        const owner = sys.owner, used = new Set();
        for (const area of sys.areas) {
            if (!area.world || !area.world.objective) continue;
            const faction = this.pickObjectiveToken(state, owner, used);
            if (!faction) continue;
            used.add(faction);
            state.objectives.push({ id: this.uid(state, 'obj'), faction, system: sys.id, area: area.pos });
        }
    },

    setupAdjacent(a, b) {
        if (a.row === b.row) return Math.abs(a.col - b.col) === 1;
        if (Math.abs(a.row - b.row) !== 1) return false;
        const shift = (b.row % 2 === 1 ? 1 : 0) - (a.row % 2 === 1 ? 1 : 0);
        const diff = b.col - a.col;
        return diff === 0 || diff === -shift;
    },

    setupLegalCells(state) {
        const setup = state.setup;
        if (!setup) return [];
        const occupied = new Set(state.systems.map(s => s.row + ':' + s.col));
        if (!state.systems.length) return [{ row: setup.center.row, col: setup.center.col }];
        return setup.slots.filter(cell => !occupied.has(cell.row + ':' + cell.col)
            && state.systems.some(sys => this.setupAdjacent(sys, cell)));
    },

    cmdPlaceSystemTile(state, seat, cmd) {
        const setup = state.setup;
        if (state.phase !== 'setup' || !setup) return { ok: false, error: 'Сейчас не этап сборки карты.' };
        if (setup.turn !== seat) return { ok: false, error: 'Сейчас очередь другого игрока выкладывать тайл.' };
        const hand = setup.hands[seat] || [];
        const tileIndex = hand.indexOf(cmd.tile);
        if (tileIndex < 0) return { ok: false, error: 'Этого системного тайла нет у вас в руке.' };
        const cell = { row: Number(cmd.row), col: Number(cmd.col) };
        if (!this.setupLegalCells(state).some(c => c.row === cell.row && c.col === cell.col)) {
            return { ok: false, error: 'Выберите пустое место рядом с уже выложенной системой.' };
        }
        const tile = FS_DATA.tiles.find(t => t.id === cmd.tile);
        if (!tile) return { ok: false, error: 'Неизвестный системный тайл.' };
        const sys = this.createSystemFromTile(state, tile, seat, cell.row, cell.col);
        state.systems.push(sys);
        hand.splice(tileIndex, 1);
        if (state.players[seat].placed === 0) {
            this.placeInitialForces(state, seat, sys);
            state.players[seat].placed++;
        }
        this.placeSetupObjectives(state, sys);
        setup.placedBySeat[seat]++;
        setup.placedTotal++;
        this.log(state, seat, state.players[seat].name + ' разместил систему ' + tile.id + '.');

        if (setup.placedTotal >= setup.totalTiles) {
            this.finishBoardSetup(state);
            return { ok: true };
        }
        for (let step = 1; step <= setup.turnOrder.length; step++) {
            const index = (setup.turnIndex + step) % setup.turnOrder.length;
            const nextSeat = setup.turnOrder[index];
            if ((setup.hands[nextSeat] || []).length) {
                setup.turnIndex = index;
                setup.turn = nextSeat;
                break;
            }
        }
        return { ok: true };
    },

    finishBoardSetup(state) {
        const count = state.players.length;
        const shuffled = this.shuffle(state, this.allEdges(state));
        for (let i = 0; i < count && i < shuffled.length; i++) {
            const e = shuffled[i];
            state.storms.push({ id: this.uid(state, 'storm'), system: e.system, side: e.side, moved: {} });
        }
        state.setup = null;
        state.phase = 'planning';
        state.turn = state.firstPlayer;
        this.log(state, -1, 'Игра началась: раунд 1, фаза планирования.');
    },

    // The initial forces of a player on his first tile.
    placeInitialForces(state, seat, sys) {
        const p = state.players[seat];
        const areas = sys.areas.filter(a => a.world);
        for (const unitId of Object.keys(p.supply.units)) {
            const def = this.unitDef(state, seat, unitId);
            if (!def) continue;
            let left = p.supply.units[unitId];
            for (const area of areas) {
                while (left > 0 && this.unitsAt(state, sys.id, area.pos).length < this.capacity(state, sys.id, area.pos)) {
                    this.addUnit(state, seat, unitId, sys.id, area.pos);
                    left--;
                }
                if (left <= 0) break;
            }
            p.supply.units[unitId] = left;
        }
        // The structures: a city and a factory on friendly worlds.
        for (const type of ['factory', 'bastion', 'city']) {
            let left = p.supply.structures[type] || 0;
            for (const area of areas) {
                if (left <= 0) break;
                if (this.structuresAt(state, sys.id, area.pos).length > 0) continue;
                this.addStructure(state, seat, type, sys.id, area.pos);
                left--;
            }
            p.supply.structures[type] = left;
        }
    },

    // An objective token of another faction for a tile: no two tokens of the
    // same faction on one tile, and a player may not give a token of a faction
    // he has fewer tokens of.
    pickObjectiveToken(state, seat, used) {
        const p = state.players[seat];
        const counts = {};
        for (const f of p.objectivePool) counts[f] = (counts[f] || 0) + 1;
        const candidates = Object.keys(counts).filter(f => !used.has(f) && counts[f] > 0);
        if (!candidates.length) return null;
        // The faction with the most tokens first.
        candidates.sort((a, b) => counts[b] - counts[a]);
        const pick = candidates[0];
        p.objectivePool.splice(p.objectivePool.indexOf(pick), 1);
        return pick;
    },

    // Every edge of the board (a storm may stand on any of them).
    allEdges(state) {
        const out = [];
        const seen = new Set();
        for (const sys of state.systems) {
            for (const side of ['N', 'E', 'S', 'W']) {
                const other = this.across(state, sys.id, side);
                const key = other
                    ? [sys.id, other].sort().join('|') + ':' + (other ? this.sideBetween(state, sys.id, other) : '')
                    : sys.id + ':' + side;
                if (seen.has(key)) continue;
                seen.add(key);
                out.push({ system: sys.id, side });
            }
        }
        return out;
    },

    // -----------------------------------------------------------------------
    //  Units and structures
    // -----------------------------------------------------------------------

    addUnit(state, seat, unitId, systemId, pos) {
        const unit = {
            id: this.uid(state, 'u'),
            seat,
            faction: state.players[seat].faction,
            unit: unitId,
            system: systemId,
            area: pos,
            routed: false,
        };
        state.units.push(unit);
        return unit;
    },

    addStructure(state, seat, type, systemId, pos) {
        const s = { id: this.uid(state, 's'), seat, type, system: systemId, area: pos };
        state.structures.push(s);
        return s;
    },

    destroyUnit(state, unit) {
        const i = state.units.indexOf(unit);
        if (i >= 0) state.units.splice(i, 1);
        const p = state.players[unit.seat];
        p.supply.units[unit.unit] = (p.supply.units[unit.unit] || 0) + 1;
    },

    destroyStructure(state, s) {
        const i = state.structures.indexOf(s);
        if (i >= 0) state.structures.splice(i, 1);
        const p = state.players[s.seat];
        p.supply.structures[s.type] = (p.supply.structures[s.type] || 0) + 1;
    },

    // The structure values (07-tokens.md).
    structureStats(type) {
        if (type === 'bastion') return { cost: 2, combat: 2, health: 3, morale: 2, kl: 0 };
        if (type === 'city') return { cost: 3, combat: 0, health: 0, morale: 0, kl: 0 };
        return { cost: 2, combat: 0, health: 0, morale: 0, kl: 0 };   // factory
    },

    // -----------------------------------------------------------------------
    //  Commands
    // -----------------------------------------------------------------------

    // Apply a command of a player. Returns { ok, error }.
    apply(state, seat, cmd) {
        if (state.over) return { ok: false, error: 'Игра закончена.' };
        const p = state.players[seat];
        if (!p) return { ok: false, error: 'Нет такого игрока.' };
        try {
            const res = this.dispatch(state, seat, cmd);
            return res || { ok: true };
        } catch (e) {
            return { ok: false, error: String(e && e.message ? e.message : e) };
        }
    },

    dispatch(state, seat, cmd) {
        const type = cmd && cmd.type;
        switch (type) {
            case 'placeSystemTile': return this.cmdPlaceSystemTile(state, seat, cmd);
            case 'placeOrder': return this.cmdPlaceOrder(state, seat, cmd);
            case 'resolveOrder': return this.cmdResolveOrder(state, seat, cmd);
            case 'moveUnits': return this.cmdMoveUnits(state, seat, cmd);
            case 'endAdvance': return this.cmdEndAdvance(state, seat, cmd);
            case 'buyUnit': return this.cmdBuyUnit(state, seat, cmd);
            case 'buyStructure': return this.cmdBuyStructure(state, seat, cmd);
            case 'buyUpgrade': return this.cmdBuyUpgrade(state, seat, cmd);
            case 'useUpgrade': return this.cmdUseUpgrade(state, seat, cmd);
            case 'finishDeploy': return this.cmdFinishDeploy(state, seat);
            case 'finishStrategize': return this.cmdFinishStrategize(state, seat);
            case 'finishDominate': return this.cmdFinishDominate(state, seat);
            case 'finishAdvance': return this.cmdFinishAdvance(state, seat);
            case 'orbitalStrike': return this.cmdOrbitalStrike(state, seat, cmd);
            case 'combat': return this.cmdCombat(state, seat, cmd);
            case 'drawEvent': return this.cmdDrawEvent(state, seat, cmd);
            case 'resolveEvent': return this.cmdResolveEvent(state, seat, cmd);
            case 'moveStorm': return this.cmdMoveStorm(state, seat, cmd);
            case 'nextPhase': return this.cmdNextPhase(state, seat, cmd);
            case 'rally': return this.cmdRally(state, seat, cmd);
            case 'takeProsperity': return this.cmdTakeProsperity(state, seat, cmd);
            case 'effect': return this.cmdEffect(state, seat, cmd);
            default: return { ok: false, error: 'Неизвестная команда: ' + type };
        }
    },

    // --- planning phase ----------------------------------------------------

    // May a player put an order token on this system?
    canPlaceOrder(state, seat, systemId) {
        const sys = this.system(state, systemId);
        if (!sys) return false;
        if (this.hasUnitsOrStructures(state, seat, systemId)) return true;
        return this.neighbors(state, systemId).some(n => this.hasUnitsOrStructures(state, seat, n));
    },

    hasUnitsOrStructures(state, seat, systemId) {
        return state.units.some(u => u.seat === seat && u.system === systemId)
            || state.structures.some(s => s.seat === seat && s.system === systemId);
    },

    cmdPlaceOrder(state, seat, cmd) {
        if (state.phase !== 'planning') return { ok: false, error: 'Сейчас не фаза планирования.' };
        const p = state.players[seat];
        const limit = this.ORDER_TOKENS + (p.extraOrderTokens || 0);
        if ((p.placedTokens || 0) >= limit) return { ok: false, error: 'Все приказы уже выложены.' };
        const sys = this.system(state, cmd.system);
        if (!sys) return { ok: false, error: 'Нет такой системы.' };
        if (!this.canPlaceOrder(state, seat, sys.id)) return { ok: false, error: 'Нельзя выложить приказ в эту систему.' };
        const types = ['advance', 'deploy', 'strategize', 'dominate'];
        if (!types.includes(cmd.order)) return { ok: false, error: 'Неизвестный приказ.' };
        sys.tokens.push({ seat, order: cmd.order, faceUp: false });
        p.placedTokens = (p.placedTokens || 0) + 1;
        this.log(state, seat, p.name + ' выложил приказ «' + this.orderName(cmd.order) + '».');
        this.checkPlanningDone(state);
        return { ok: true };
    },

    orderName(order) {
        return { advance: 'наступление', deploy: 'развёртывание', strategize: 'стратегия', dominate: 'доминирование' }[order] || order;
    },

    checkPlanningDone(state) {
        const done = state.players.every(p => (p.placedTokens || 0) >= this.ORDER_TOKENS + (p.extraOrderTokens || 0));
        if (!done) return;
        state.phase = 'operations';
        // The operations start with the first player who really has an order on
        // top of a stack — the tokens of the players lie in one stack.
        state.turn = this.firstWithOrder(state);
        // The schemes of the start of the operations phase.
        this.maybeScheme(state, state.turn, 'operations', { kind: 'order', ctx: null });
        this.log(state, -1, 'Фаза операций: приказы вскрываются по очереди.');
    },

    // --- operations phase ---------------------------------------------------

    // The stacks a player may take a token from.
    availableOrders(state, seat) {
        const out = [];
        for (const sys of state.systems) {
            for (let i = 0; i < sys.tokens.length; i++) {
                const tok = sys.tokens[i];
                if (tok.seat !== seat) continue;
                const top = sys.tokens[sys.tokens.length - 1];
                if (top !== tok) continue;      // only the top of a stack
                out.push({ system: sys.id, index: i });
            }
        }
        return out;
    },

    cmdResolveOrder(state, seat, cmd) {
        if (state.phase !== 'operations') return { ok: false, error: 'Сейчас не фаза операций.' };
        if (state.turn !== seat) return { ok: false, error: 'Сейчас ход другого игрока.' };
        // One order at a time: the previous one must be finished.
        if (state.order) return { ok: false, error: 'Сначала закончите текущий приказ.' };
        const sys = this.system(state, cmd.system);
        if (!sys) return { ok: false, error: 'Нет такой системы.' };
        if (!sys.tokens.length) return { ok: false, error: 'В этой системе нет приказов.' };
        const top = sys.tokens[sys.tokens.length - 1];
        if (top.seat !== seat) return { ok: false, error: 'Это не ваш приказ.' };
        // The player may put the token on his event deck instead of resolving it.
        if (cmd.toEventDeck) {
            sys.tokens.pop();
            const p = state.players[seat];
            p.eventTokens++;
            this.log(state, seat, p.name + ' отложил приказ на колоду событий.');
            this.nextTurn(state);
            return { ok: true };
        }
        sys.tokens.pop();
        top.faceUp = true;
        const p = state.players[seat];
        state.order = { seat, order: top.order, system: sys.id, phase: 'resolve' };
        this.log(state, seat, p.name + ' раскрыл приказ «' + this.orderName(top.order) + '» в системе ' + sys.tile + '.');
        const res = this.resolveOrder(state, seat, top.order, sys.id);
        if (res && res.ok === false) return res;
        // The schemes of the activation of the order.
        if (this.maybeScheme(state, seat, 'order', { kind: 'order', ctx: null })) return { ok: true, pending: true };
        return { ok: true };
    },

    // The effect of a revealed order.
    resolveOrder(state, seat, order, systemId) {
        const p = state.players[seat];
        if (order === 'advance') {
            state.order.phase = 'move';
            return { ok: true };
        }
        if (order === 'deploy') {
            state.order.phase = 'deploy';
            this.log(state, seat, p.name + ' может покупать отряды и постройку.');
            return { ok: true };
        }
        if (order === 'strategize') {
            state.order.phase = 'strategize';
            return { ok: true };
        }
        if (order === 'dominate') {
            // The order stays open: the player takes the prosperity tokens and
            // applies the ability of the faction.
            this.dominate(state, seat, systemId);
            state.order.phase = 'dominate';
            const faction = this.faction(state, seat);
            state.order.ability = faction && faction.ability
                ? faction.ability.name + ': ' + faction.ability.text : '';
            return { ok: true };
        }
        return { ok: false, error: 'Неизвестный приказ.' };
    },

    // The dominate order: the assets of the friendly worlds and the ability.
    dominate(state, seat, systemId) {
        const p = state.players[seat];
        const sys = this.system(state, systemId);
        const gained = [];
        for (const area of sys.areas) {
            if (!area.world) continue;
            if (this.control(state, seat, systemId, area.pos) !== 'friendly') continue;
            for (const asset of area.world.assets) {
                if (asset === 'prosperity') {
                    // The player chooses the token.
                    gained.push('prosperity');
                    state.order.prosperity = (state.order.prosperity || 0) + 1;
                } else {
                    const limit = p.faction === 'тираниды' && asset === 'reinforcement' ? 4 : 3;
                    if ((p.assets[asset] || 0) < limit) {
                        p.assets[asset] = (p.assets[asset] || 0) + 1;
                        gained.push(asset);
                    }
                }
            }
        }
        if (gained.length) {
            this.log(state, seat, p.name + ' получил ресурсы: ' + gained.join(', ') + '.');
        }
        // The faction ability is resolved by the player (it is a card-like text).
        state.order.phase = 'dominate';
        state.order.ability = this.faction(state, seat).ability;
    },

    // The end of an order: the token goes to the play area, the turn passes.
    finishOrder(state, seat) {
        state.order = null;
        this.nextTurn(state);
    },

    nextTurn(state) {
        const count = state.players.length;
        let turn = state.turn;
        for (let i = 0; i < count; i++) {
            turn = (turn + 1) % count;
            if (this.hasOrderToResolve(state, turn)) { state.turn = turn; return; }
        }
        // Nobody has an order left — the refresh phase begins.
        this.startRefresh(state);
    },

    // The first player (from the first player of the round) who has an order.
    firstWithOrder(state) {
        const n = state.players.length;
        for (let i = 0; i < n; i++) {
            const seat = (state.firstPlayer + i) % n;
            if (this.hasOrderToResolve(state, seat)) return seat;
        }
        return state.firstPlayer;
    },

    hasOrderToResolve(state, seat) {
        for (const sys of state.systems) {
            if (!sys.tokens.length) continue;
            const top = sys.tokens[sys.tokens.length - 1];
            if (top.seat === seat) return true;
        }
        return false;
    },

    // --- advance order: the movement ---------------------------------------

    // The units of a player that may move in the active system.
    movableUnits(state, seat) {
        const order = state.order;
        if (!order || order.order !== 'advance') return [];
        const sys = order.system;
        const from = new Set([sys].concat(this.neighbors(state, sys)));
        return state.units.filter(u => u.seat === seat && from.has(u.system) && !u.routed);
    },

    // May this unit move to that area?
    canMove(state, seat, unit, target) {
        const order = state.order;
        if (!order || order.order !== 'advance') return { ok: false, error: 'Это не приказ наступления.' };
        if (unit.seat !== seat) return { ok: false, error: 'Это не ваш отряд.' };
        if (unit.routed) return { ok: false, error: 'Деморализованный отряд не двигается.' };
        const def = this.unitOf(state, unit);
        if (!def) return { ok: false, error: 'Неизвестный отряд.' };
        const sys = this.system(state, target.system);
        const area = this.area(sys, target.pos);
        if (!area) return { ok: false, error: 'Нет такой области.' };
        // The destination must be in the active system.
        if (target.system !== order.system) return { ok: false, error: 'Отряд может двигаться только в активную систему.' };
        // Ships stay in the voids, ground units stand on the worlds.
        if (def.type === 'ship' && area.world) return { ok: false, error: 'Корабль может стоять только в пустоте.' };
        if (def.type === 'ground' && !area.world) return { ok: false, error: 'Наземный отряд не может стоять в пустоте.' };
        // The unit may come from the active system or from one adjacent system.
        const from = unit.system;
        const adjacent = from === order.system || this.neighbors(state, order.system).includes(from);
        if (!adjacent) return { ok: false, error: 'Отряд слишком далеко.' };
        // A warp storm on the edge blocks the way — unless the order says that
        // the ships may pass through the storms.
        if (from !== target.system && this.stormOn(state, from, target.system)
            && !(def.type === 'ship' && order.shipsThroughStorms)) {
            return { ok: false, error: 'Варп-шторм преграждает путь.' };
        }
        // Ground units need a legal path, ships do not.
        if (def.type === 'ground' && unit.system !== target.system) {
            if (!this.pathExists(state, seat, unit.system, unit.area, target.system, target.pos)) {
                return { ok: false, error: 'Нет законного пути до этого мира.' };
            }
        }
        return { ok: true };
    },

    cmdMoveUnits(state, seat, cmd) {
        const order = state.order;
        if (!order || order.order !== 'advance') return { ok: false, error: 'Это не приказ наступления.' };
        if (order.seat !== seat) return { ok: false, error: 'Сейчас ход другого игрока.' };
        const moves = cmd.moves || [];
        // The order may limit the number of the units that move.
        if (order.moveLimit && moves.length > order.moveLimit) {
            return { ok: false, error: 'Можно переместить не больше ' + order.moveLimit + ' отрядов.' };
        }
        // Every move is checked before any of them is done: the movement of the
        // ground units is simultaneous.
        const plan = [];
        const temp = state.units.map(u => ({ ...u }));
        for (const m of moves) {
            const unit = temp.find(u => u.id === m.unit);
            if (!unit) return { ok: false, error: 'Нет такого отряда.' };
            const check = this.canMove(state, seat, unit, { system: m.system, pos: m.pos });
            if (!check.ok) return check;
            const from = unit.system;
            const def = this.unitOf(state, unit);
            unit.system = m.system;
            unit.area = m.pos;
            plan.push({ id: unit.id, from, type: def ? def.type : 'ground', system: m.system, pos: m.pos });
        }
        // The ground units may come into the active system from one neighbour only.
        // A ship that came from a neighbour closes the way for the others.
        const ground = plan.filter(m => m.type === 'ground' && m.from !== order.system);
        const ships = plan.filter(m => m.type === 'ship' && m.from !== order.system);
        if (ground.length) {
            const ways = new Set(ground.map(m => m.from));
            if (ships.length) ways.add(ships[0].from);
            if (ways.size > 1) {
                return { ok: false, error: 'Наземные отряды могут прийти в активную систему только из одной соседней системы.' };
            }
        }
        // Only one area may become contested: the check is done on the copy,
        // before anything is changed in the game.
        const tempUnits = state.units.map(u => ({ ...u }));
        for (const m of plan) {
            const unit = tempUnits.find(u => u.id === m.id);
            unit.system = m.system;
            unit.area = m.pos;
        }
        const tempState = { ...state, units: tempUnits };
        const contested = this.contestedAreas(tempState);
        if (contested.length > 1) return { ok: false, error: 'Спорной может стать только одна область.' };
        for (const m of plan) {
            const unit = state.units.find(u => u.id === m.id);
            unit.system = m.system;
            unit.area = m.pos;
        }
        return { ok: true };
    },

    contestedAreas(state) {
        const out = [];
        for (const sys of state.systems) {
            for (const area of sys.areas) {
                const seats = new Set();
                for (const u of state.units) if (u.system === sys.id && u.area === area.pos) seats.add(u.seat);
                for (const s of state.structures) if (s.system === sys.id && s.area === area.pos) seats.add(s.seat);
                if (seats.size > 1) out.push({ system: sys.id, pos: area.pos });
            }
        }
        return out;
    },

    // The end of the movement: a combat or an orbital strike.
    cmdEndAdvance(state, seat, cmd) {
        const order = state.order;
        if (!order || order.order !== 'advance') return { ok: false, error: 'Это не приказ наступления.' };
        if (order.seat !== seat) return { ok: false, error: 'Сейчас ход другого игрока.' };
        // The units over the capacity of an area are destroyed.
        for (const sys of state.systems) {
            for (const area of sys.areas) {
                this.checkCapacity(state, seat, sys.id, area.pos);
            }
        }
        const contested = this.contestedAreas(state);
        if (contested.length === 1) {
            const area = contested[0];
            const mine = state.units.some(u => u.seat === seat && u.system === area.system && u.area === area.pos);
            const their = state.units.find(u => u.seat !== seat && u.system === area.system && u.area === area.pos);
            const defender = their ? their.seat : state.structures.find(s => s.seat !== seat && s.system === area.system && s.area === area.pos).seat;
            order.phase = 'combat';
            this.startCombat(state, seat, defender, area.system, area.pos);
            return { ok: true };
        }
        // No combat — the player may make an orbital strike.
        order.phase = 'strike';
        return { ok: true };
    },

    // An orbital strike: the ships of a void hit a world of the same system.
    orbitalStrikeTargets(state, seat) {
        const order = state.order;
        if (!order || order.system !== order.system) return [];
        const sys = this.system(state, order.system);
        const out = [];
        for (const area of sys.areas) {
            if (!area.world) continue;
            const control = this.control(state, seat, order.system, area.pos);
            if (control === 'friendly') continue;
            if (this.structuresAt(state, order.system, area.pos).some(s => s.type === 'bastion')) continue;
            out.push({ system: order.system, pos: area.pos });
        }
        return out;
    },

    cmdOrbitalStrike(state, seat, cmd) {
        const order = state.order;
        if (!order || order.phase !== 'strike') return { ok: false, error: 'Сейчас нельзя наносить орбитальный удар.' };
        // The schemes of the strike are used before the strike.
        if (!order.strikeHook) {
            order.strikeHook = true;
            if (this.maybeScheme(state, seat, 'strike', { kind: 'order', ctx: null })) return { ok: true, pending: true };
        }
        const target = { system: cmd.system, pos: cmd.pos };
        if (!this.orbitalStrikeTargets(state, seat).some(t => t.system === target.system && t.pos === target.pos)) {
            return { ok: false, error: 'По этому миру нельзя нанести удар.' };
        }
        const ships = (cmd.ships || []).map(id => state.units.find(u => u.id === id)).filter(Boolean);
        if (!ships.length) return { ok: false, error: 'Нужен хотя бы один корабль.' };
        const offence = ships.reduce((n, u) => {
            const def = this.unitOf(state, u);
            return n + (def ? def.combat : 0);
        }, 0);
        const dice = this.rollDice(state, Math.min(offence, this.DICE_MAX));
        const hits = dice.filter(d => d === 'att').length;
        this.log(state, seat, state.players[seat].name + ' наносит орбитальный удар: ' + hits + ' урона.');
        // The damage hits the enemy units of the world (they are not routed).
        let left = hits;
        const targets = state.units.filter(u => u.system === target.system && u.area === target.pos && u.seat !== seat);
        while (left > 0 && targets.length) {
            const unit = targets[0];
            const def = this.unitOf(state, unit);
            const health = def ? def.health : 1;
            if (left >= health) {
                left -= health;
                this.destroyUnit(state, unit);
                targets.shift();
            } else {
                left = 0;   // the damage is ignored
            }
        }
        order.phase = 'done';
        this.finishOrder(state, seat);
        return { ok: true };
    },

    // The advance order is over (no orbital strike).
    cmdFinishAdvance(state, seat) {
        const order = state.order;
        if (!order || order.order !== 'advance' || order.seat !== seat) return { ok: false, error: 'Нечего заканчивать.' };
        this.finishOrder(state, seat);
        return { ok: true };
    },

    // --- deploy order: buying units and a structure ------------------------

    // The deploy limit: the capacity of the friendly worlds with a factory.
    deployLimit(state, seat, systemId) {
        const sys = this.system(state, systemId);
        const order = state.order;
        // While the order runs, the cities may be treated as factories.
        const asFactories = !!(order && order.seat === seat && order.citiesAsFactories);
        const bastions = !!(order && order.seat === seat && order.bastionsAsFactories);
        let limit = 0;
        for (const area of sys.areas) {
            if (this.control(state, seat, systemId, area.pos) !== 'friendly') continue;
            const structures = this.structuresAt(state, systemId, area.pos).filter(s => s.seat === seat);
            const factory = structures.some(s => s.type === 'factory');
            const city = structures.some(s => s.type === 'city');
            const bastion = structures.some(s => s.type === 'bastion');
            if (!factory && !(asFactories && city) && !(bastions && bastion)) continue;
            limit += this.capacity(state, systemId, area.pos);
        }
        // The order may lower the limit or give an extra factory.
        if (order && order.seat === seat && order.deployLimitBonus) limit += order.deployLimitBonus;
        if (order && order.seat === seat && order.extraFactories) limit += order.extraFactories;
        return Math.max(0, limit);
    },

    hasFactory(state, seat, systemId) {
        const sys = this.system(state, systemId);
        return sys.areas.some(a => this.structuresAt(state, systemId, a.pos).some(s => s.seat === seat && s.type === 'factory'));
    },

    // May a unit stand here after the purchase?
    canPlaceUnit(state, seat, systemId, pos, def) {
        const sys = this.system(state, systemId);
        const area = this.area(sys, pos);
        if (!area) return { ok: false, error: 'Нет такой области.' };
        // The ships stand in the voids, the ground units on the worlds.
        if (def.type === 'ship' && area.world) return { ok: false, error: 'Корабль может стоять только в пустоте.' };
        if (def.type === 'ground' && !area.world) return { ok: false, error: 'Наземный отряд не может стоять в пустоте.' };
        // Only the friendly and the uncontrolled areas.
        const theirs = state.units.some(u => u.system === systemId && u.area === pos && u.seat !== seat)
            || state.structures.some(st => st.seat !== seat && st.system === systemId && st.area === pos);
        if (theirs) return { ok: false, error: 'Нельзя развёртывать в чужую область.' };
        return { ok: true };
    },

    // May a structure stand here?
    canPlaceStructure(state, seat, systemId, pos) {
        const sys = this.system(state, systemId);
        const area = this.area(sys, pos);
        if (!area || !area.world) return { ok: false, error: 'Постройка ставится только на мир.' };
        if (this.control(state, seat, systemId, pos) !== 'friendly') return { ok: false, error: 'Мир должен быть вашим.' };
        if (this.structuresAt(state, systemId, pos).length) return { ok: false, error: 'На мире уже есть постройка.' };
        return { ok: true };
    },

    cmdBuyUnit(state, seat, cmd) {
        const order = state.order;
        if (!order || order.order !== 'deploy' || order.seat !== seat) {
            return { ok: false, error: 'Сейчас нельзя покупать отряды.' };
        }
        // The units are bought only in the active system and only with a factory in it.
        if (cmd.system !== order.system) return { ok: false, error: 'Отряды покупаются в активной системе.' };
        if (!this.hasFactory(state, seat, order.system)) return { ok: false, error: 'В активной системе нет фабрики.' };
        const limit = this.deployLimit(state, seat, order.system);
        if ((order.bought || 0) >= limit) return { ok: false, error: 'Предел развёртывания исчерпан.' };
        const def = this.unitDef(state, seat, cmd.unit);
        if (!def) return { ok: false, error: 'Нет такого отряда.' };
        const p = state.players[seat];
        // The ability of the faction: "2 Guardsmen may be bought for 1 supply token."
        const deal = !!(order.supplyDeal
            && FS_EFFECTS.sameName(def.name, order.supplyDeal.unit || 'Гвардец'));
        const dealFree = deal && ((order.dealBought || 0) % 2 === 1);
        void dealFree;
        if (!dealFree && (p.supply.units[def.id] || 0) <= 0) return { ok: false, error: 'Такого отряда больше нет в запасе.' };
        if (def.kl > this.commandLevel(state, seat)) return { ok: false, error: 'Не хватает уровня командования.' };
        // The order may allow only one kind of unit.
        if (order.factoryOnly && !FS_EFFECTS.sameName(def.name, order.factoryOnly)) {
            return { ok: false, error: 'Этим приказом можно производить только ' + order.factoryOnly + '.' };
        }
        const place = this.canPlaceUnit(state, seat, cmd.system, cmd.pos, def);
        if (!place.ok) return place;
        // The units may have to stand in the world that produced them.
        if (order.deployInFactoryWorld) {
            const factory = this.structuresAt(state, cmd.system, cmd.pos).some(st => st.seat === seat && st.type === 'factory');
            if (!factory) return { ok: false, error: 'Отряд ставится в мир с вашей фабрикой.' };
        }
        let cost = def.cost;
        // The order may make the units cheaper.
        if (order.discount) cost = Math.max(0, cost - order.discount);
        // The order may sell a unit of command level 0 for 1 materiel.
        if (order.cheapUnit && def.kl === 0) cost = Math.min(cost, order.cheapUnit);
        // The card of the player may make the purchase cheaper.
        if (p.cardDiscount) cost = Math.max(0, cost - p.cardDiscount);
        if (def.forge) {
            if ((p.assets.forge || 0) < 1) return { ok: false, error: 'Нужен жетон кузницы.' };
            p.assets.forge--;
        }
        if (p.materiel < cost) return { ok: false, error: 'Не хватает материи.' };
        p.materiel -= cost;
        if (!dealFree) p.supply.units[def.id]--;
        if (deal) order.dealBought = (order.dealBought || 0) + 1;
        const unit = this.addUnit(state, seat, def.id, cmd.system, cmd.pos);
        this.log(state, seat, p.name + ' купил отряд «' + def.name + '».');
        order.bought = (order.bought || 0) + 1;
        void unit;
        this.checkCapacity(state, seat, cmd.system, cmd.pos);
        return { ok: true };
    },

    cmdBuyStructure(state, seat, cmd) {
        const order = state.order;
        if (!order || order.order !== 'deploy' || order.seat !== seat) {
            return { ok: false, error: 'Сейчас нельзя покупать постройки.' };
        }
        if (order.structureBought) return { ok: false, error: 'За один приказ можно построить только одну постройку.' };
        // cmd.type is the command itself — the kind of the structure is cmd.structure.
        const type = cmd.structure || (cmd.kind && cmd.kind !== 'buyStructure' ? cmd.kind : '');
        if (!['city', 'factory', 'bastion'].includes(type)) return { ok: false, error: 'Неизвестная постройка.' };
        // The structure stands in the active system.
        if (cmd.system !== order.system) return { ok: false, error: 'Постройка ставится в активной системе.' };
        const p = state.players[seat];
        if ((p.supply.structures[type] || 0) <= 0) return { ok: false, error: 'Такой постройки больше нет в запасе.' };
        const stats = this.structureStats(type);
        // The order may give a structure for free.
        const free = !!(order.freeStructure && order.freeStructureKind === type);
        if (!free && p.materiel < stats.cost) return { ok: false, error: 'Не хватает материи.' };
        const place = this.canPlaceStructure(state, seat, cmd.system, cmd.pos);
        if (!place.ok) return place;
        if (!free) p.materiel -= stats.cost;
        p.supply.structures[type]--;
        this.addStructure(state, seat, type, cmd.system, cmd.pos);
        this.log(state, seat, p.name + ' построил: ' + this.structureName(type) + '.');
        order.structureBought = true;
        return { ok: true };
    },

    structureName(type) {
        return { city: 'город', factory: 'фабрика', bastion: 'бастион' }[type] || type;
    },

    // End the deploy order.
    cmdFinishDeploy(state, seat) {
        const order = state.order;
        if (!order || order.order !== 'deploy' || order.seat !== seat) return { ok: false, error: 'Нечего заканчивать.' };
        // The units over the capacity are destroyed.
        for (const sys of state.systems) {
            for (const area of sys.areas) {
                this.checkCapacity(state, seat, sys.id, area.pos);
            }
        }
        this.finishOrder(state, seat);
        return { ok: true };
    },

    // Destroy the units of a player over the capacity of an area.
    checkCapacity(state, seat, systemId, pos) {
        const cap = this.capacity(state, systemId, pos);
        const mine = this.unitsAt(state, systemId, pos).filter(u => u.seat === seat);
        let over = mine.length - cap;
        if (over <= 0) return;
        for (const unit of mine) {
            if (over <= 0) break;
            this.destroyUnit(state, unit);
            over--;
        }
    },

    // --- strategize order: the upgrade cards --------------------------------

    cmdBuyUpgrade(state, seat, cmd) {
        const order = state.order;
        if (!order || order.order !== 'strategize' || order.seat !== seat) {
            return { ok: false, error: 'Сейчас нельзя покупать улучшения.' };
        }
        const p = state.players[seat];
        if (!this.hasUnitsOrStructures(state, seat, order.system)) {
            return { ok: false, error: 'В активной системе нет ваших отрядов и построек.' };
        }
        // The order may allow only one upgrade.
        if (order.upgradeLimit && (order.upgradesBought || 0) >= order.upgradeLimit) {
            return { ok: false, error: 'Можно купить только ' + order.upgradeLimit + ' улучшение(я).' };
        }
        const kind = cmd.kind;       // 'combat' | 'order'
        if (kind === 'combat') {
            if (order.combatUpgrade) return { ok: false, error: 'Боевое улучшение уже куплено.' };
            const card = FS_DATA.combat.find(c => c.faction === p.faction && c.upgrade && c.name === cmd.card);
            if (!card) return { ok: false, error: 'Нет такой карты.' };
            if (card.kl > this.commandLevel(state, seat)) return { ok: false, error: 'Не хватает уровня командования.' };
            const cost = Math.max(0, card.cost - (p.cardDiscount || 0));
            if (p.materiel < cost) return { ok: false, error: 'Не хватает материи.' };
            p.materiel -= cost;
            order.upgradesBought = (order.upgradesBought || 0) + 1;
            // The card replaces two copies of a card of the deck.
            const deck = p.decks.combat;
            const removed = deck.splice(0, 2);
            p.decks.combat.push(card.name, card.name);
            order.combatUpgrade = true;
            this.log(state, seat, p.name + ' купил боевое улучшение «' + card.name + '».');
            void removed;
            return { ok: true };
        }
        if (kind === 'order') {
            if (order.orderUpgrade) return { ok: false, error: 'Улучшение приказа уже куплено.' };
            const card = FS_DATA.orders.find(c => c.faction === p.faction && c.name === cmd.card);
            if (!card) return { ok: false, error: 'Нет такой карты.' };
            if (card.kl > this.commandLevel(state, seat)) return { ok: false, error: 'Не хватает уровня командования.' };
            const cost = Math.max(0, card.cost - (p.cardDiscount || 0));
            if (p.materiel < cost) return { ok: false, error: 'Не хватает материи.' };
            p.materiel -= cost;
            order.upgradesBought = (order.upgradesBought || 0) + 1;
            p.upgrades.push({ name: card.name, used: false, order: card.order });
            order.orderUpgrade = true;
            this.log(state, seat, p.name + ' купил улучшение приказа «' + card.name + '».');
            return { ok: true };
        }
        return { ok: false, error: 'Неизвестный тип улучшения.' };
    },

    // The end of the strategize order: the token goes to the event deck.
    cmdFinishStrategize(state, seat) {
        const order = state.order;
        if (!order || order.order !== 'strategize' || order.seat !== seat) return { ok: false, error: 'Нечего заканчивать.' };
        state.players[seat].eventTokens++;
        this.log(state, seat, state.players[seat].name + ' кладёт приказ на колоду событий.');
        this.finishOrder(state, seat);
        return { ok: true };
    },

    // The prosperity token: the player chooses the asset of his choice.
    cmdTakeProsperity(state, seat, cmd) {
        const order = state.order;
        if (!order || order.order !== 'dominate' || order.seat !== seat) {
            return { ok: false, error: 'Сейчас не приказ доминирования.' };
        }
        if (!order.prosperity) return { ok: false, error: 'Нет жетонов процветания.' };
        const asset = cmd.asset;
        if (!['forge', 'cache', 'reinforcement'].includes(asset)) return { ok: false, error: 'Неизвестный ресурс.' };
        const p = state.players[seat];
        const limit = p.faction === 'тираниды' && asset === 'reinforcement' ? 4 : 3;
        if ((p.assets[asset] || 0) >= limit) return { ok: false, error: 'У вас уже три таких жетона.' };
        p.assets[asset] = (p.assets[asset] || 0) + 1;
        order.prosperity--;
        this.log(state, seat, p.name + ' взял жетон процветания: ' + this.assetName(asset) + '.');
        return { ok: true };
    },

    assetName(asset) {
        return { forge: 'кузница', cache: 'тайник', reinforcement: 'подкрепление', prosperity: 'процветание' }[asset] || asset;
    },

    // The end of the dominate order (after the faction ability).
    cmdFinishDominate(state, seat) {
        const order = state.order;
        if (!order || order.order !== 'dominate' || order.seat !== seat) return { ok: false, error: 'Нечего заканчивать.' };
        // The ability of the faction: the text is the rule.
        const faction = this.faction(state, seat);
        const text = faction && faction.ability ? faction.ability.text : '';
        const steps = FS_EFFECTS.parse(text || '', { kind: 'ability', faction: state.players[seat].faction });
        if (steps.length) {
            // The order is over when the effect of the ability is done.
            order.finishAfterEffect = true;
            this.runEffects(state, seat, steps, { kind: 'ability', ctx: null });
            return { ok: true, pending: true };
        }
        this.finishOrder(state, seat);
        return { ok: true };
    },

    // An order upgrade card is used once per round.
    cmdUseUpgrade(state, seat, cmd) {
        const p = state.players[seat];
        const up = p.upgrades.find(u => u.name === cmd.card && !u.used);
        if (!up) {
            const known = p.upgrades.some(u => u.name === cmd.card);
            return { ok: false, error: known ? 'Это улучшение уже использовано в этом раунде.' : 'Нет такого улучшения.' };
        }
        up.used = true;
        this.log(state, seat, p.name + ' применяет улучшение «' + up.name + '».');
        // The text of the card is the rule: the engine performs it.
        const card = FS_DATA.orders.find(c => c.faction === p.faction && c.name === up.name);
        const steps = FS_EFFECTS.parse((card && card.text) || '', { kind: 'order' });
        if (steps.length) this.runEffects(state, seat, steps, { kind: 'order', ctx: null });
        return { ok: true, text: up.text || '' };
    },

    // --- the refresh phase --------------------------------------------------

    startRefresh(state) {
        state.phase = 'refresh';
        state.order = null;
        // 1. the objective tokens on friendly worlds
        for (const p of state.players) {
            let taken = 0;
            for (const obj of state.objectives) {
                if (obj.faction !== p.faction) continue;
                if (this.control(state, p.seat, obj.system, obj.area) !== 'friendly') continue;
                obj.taken = true;
                taken++;
            }
            if (taken) this.log(state, p.seat, p.name + ' забрал целей: ' + taken + '.');
            p.objectives += taken;
        }
        // 2. the materiel
        for (const p of state.players) {
            const income = this.materielIncome(state, p.seat);
            if (income > 0) {
                p.materiel = Math.min(this.MATERIEL_MAX, p.materiel + income);
                this.log(state, p.seat, p.name + ' получил материи: ' + income + '.');
            }
        }
        // 3. rally the routed units
        for (const u of state.units) u.routed = false;
        // 4. the event cards and the warp storms
        state.turn = state.firstPlayer;
        state.eventsLeft = state.players.length;
        this.log(state, -1, 'Фаза обновления: события и варп-штормы.');
        this.nextEventPlayer(state);
    },

    // The player whose event card is resolved now.
    nextEventPlayer(state) {
        if (state.eventsLeft <= 0) { this.endRound(state); return; }
        const seat = state.turn;
        const p = state.players[seat];
        const drawn = [];
        for (let i = 0; i < p.eventTokens; i++) drawn.push(this.drawEventCard(state, seat));
        state.event = { seat, drawn, chosen: null };
        p.eventTokens = 0;
        if (!drawn.length) {
            // No token on the deck: the top card is revealed for the storm only.
            const top = this.drawEventCard(state, seat);
            state.event.top = top;
        }
        // The next player plays the next event.
        state.turn = (state.turn + 1) % state.players.length;
    },

    drawEventCard(state, seat) {
        const p = state.players[seat];
        if (!p.decks.event.length) {
            // A new deck of the faction (the game does not run out of cards).
            p.decks.event = this.shuffle(state, FS_DATA.events.filter(e => e.faction === p.faction).map(e => e.name));
        }
        const name = p.decks.event.shift();
        return name;
    },

    cmdDrawEvent(state, seat, cmd) {
        if (state.phase !== 'refresh') return { ok: false, error: 'Сейчас не фаза обновления.' };
        if (!state.event || state.event.seat !== seat) return { ok: false, error: 'Сейчас ход другого игрока.' };
        if (state.event.chosen) return { ok: false, error: 'Карта уже выбрана.' };
        const name = cmd.card;
        if (!state.event.drawn.includes(name)) return { ok: false, error: 'Такой карты нет на руке.' };
        state.event.chosen = name;
        const card = FS_DATA.events.find(e => e.faction === state.players[seat].faction && e.name === name);
        state.event.card = card;
        this.log(state, seat, state.players[seat].name + ' выбрал карту события «' + name + '».');
        return { ok: true };
    },

    cmdResolveEvent(state, seat, cmd) {
        if (state.phase !== 'refresh') return { ok: false, error: 'Сейчас не фаза обновления.' };
        if (!state.event || state.event.seat !== seat) return { ok: false, error: 'Сейчас ход другого игрока.' };
        const card = state.event.card;
        // Without a card in the hand there is nothing to play: the player only
        // moves the storm and the refresh goes on.
        if (card && card.type === 'scheme') {
            // A scheme card stays in play: the other schemes are discarded.
            const p0 = state.players[seat];
            p0.schemes = [];
            const steps = FS_EFFECTS.parse(card.text || '', { kind: 'event', faction: p0.faction });
            const trig = steps.find(s => s.op === 'trigger');
            p0.schemes.push({
                name: card.name,
                text: card.text || '',
                trigger: trig ? trig.trigger : null,
                steps: trig ? trig.steps : [],
                note: trig ? !!trig.note : true,
            });
            this.log(state, seat, p0.name + ' держит план «' + card.name + '».');
        }
        // The chosen card goes back into the deck.
        const p = state.players[seat];
        if (card) {
            p.decks.event.push(card.name);
            this.log(state, seat, p.name + ' разыграл(а) карту «' + card.name + '».');
        } else if (state.event.top) {
            // The card that was opened for the storm only goes back to the deck.
            p.decks.event.push(state.event.top);
        }
        state.event = null;
        state.eventsLeft--;
        // The text of the card is the rule: the engine performs it.
        if (card && card.type !== 'scheme') {
            const steps = FS_EFFECTS.parse(card.text || '', { kind: 'event', faction: state.players[seat].faction });
            if (steps.length) {
                this.runEffects(state, seat, steps, { kind: 'event', ctx: null });
            }
        }
        this.nextEventPlayer(state);
        return { ok: true };
    },

    // The warp storm moves along the edges of the board.
    cmdMoveStorm(state, seat, cmd) {
        if (state.phase !== 'refresh') return { ok: false, error: 'Сейчас не фаза обновления.' };
        if (!state.event || state.event.seat !== seat) return { ok: false, error: 'Сейчас ход другого игрока.' };
        const storm = state.storms.find(s => s.id === cmd.storm);
        if (!storm) return { ok: false, error: 'Нет такого шторма.' };
        // Every player moves every storm once per round.
        if (!storm.moved) storm.moved = {};
        if (storm.moved[seat]) return { ok: false, error: 'Вы уже двигали этот шторм в этом раунде.' };
        const dir = cmd.dir;
        // The card that is in play: the chosen one, or the top card of the deck
        // when the player had no order token.
        const card = state.event.card || state.event.top;
        const allowed = card && card.storm && card.storm[0] !== 'any' ? card.storm : ['N', 'E', 'S', 'W'];
        if (!allowed.includes(dir)) return { ok: false, error: 'Карта не разрешает такое направление.' };
        const target = this.stormTarget(state, storm, dir);
        if (!target) return { ok: false, error: 'Шторм не может туда пойти.' };
        // The storm may not stand on a busy edge.
        for (const other of state.storms) {
            if (other === storm) continue;
            if (other.system === target.system && other.side === target.side) {
                return { ok: false, error: 'На этой границе уже стоит шторм.' };
            }
        }
        storm.system = target.system;
        storm.side = target.side;
        storm.moved[seat] = true;
        this.log(state, seat, state.players[seat].name + ' сдвинул варп-шторм.');
        return { ok: true };
    },

    // Where does a storm go when it moves in a direction?
    stormTarget(state, storm, dir) {
        const side = storm.side;
        const vertical = side === 'N' || side === 'S';
        if (vertical) {
            if (dir === 'N' || dir === 'S') {
                const step = dir === 'N' ? -1 : 1;
                const row = this.system(state, storm.system).row + step;
                const other = state.systems.find(s => s.row === row && this.inRow(state, s, storm.system));
                if (!other) return null;
                return { system: other.id, side: dir === 'N' ? 'N' : 'S' };
            }
            // Along the edge: the storm turns around the tile.
            return { system: storm.system, side: dir === 'E' ? 'E' : 'W' };
        }
        if (dir === 'E' || dir === 'W') {
            const step = dir === 'E' ? 1 : -1;
            const col = this.system(state, storm.system).col + step;
            const other = state.systems.find(s => s.col === col && this.inRow(state, s, storm.system));
            if (!other) return null;
            return { system: other.id, side: dir === 'E' ? 'E' : 'W' };
        }
        return { system: storm.system, side: dir === 'N' ? 'N' : 'S' };
    },

    // Is the system in the same row (or the row of a neighbour) of another?
    inRow(state, a, bId) {
        const b = this.system(state, bId);
        if (!b) return false;
        return Math.abs(a.row - b.row) <= 1;
    },

    endRound(state) {
        // The end of the round: the first player token passes, the marker moves.
        state.firstPlayer = (state.firstPlayer + 1) % state.players.length;
        state.round++;
        for (const p of state.players) {
            p.placedTokens = 0;
            for (const u of p.upgrades) u.used = false;
        }
        for (const s of state.storms) s.moved = {};
        // The players without a friendly world are out of the game.
        for (const p of state.players) {
            const has = state.systems.some(sys => sys.areas.some(a => this.control(state, p.seat, sys.id, a.pos) === 'friendly'));
            if (!has && !p.eliminated) {
                p.eliminated = true;
                this.log(state, p.seat, p.name + ' выбывает: у него не осталось миров.');
                for (const u of state.units.filter(u => u.seat === p.seat)) this.destroyUnit(state, u);
                for (const s of state.structures.filter(s => s.seat === p.seat)) this.destroyStructure(state, s);
            }
        }
        const alive = state.players.filter(p => !p.eliminated);
        if (alive.length <= 1) {
            state.over = true;
            state.winner = alive.length ? alive[0].seat : null;
            this.log(state, -1, 'Игра закончена. Побеждает ' + (state.winner != null ? state.players[state.winner].name : '—') + '.');
            return;
        }
        // The victory conditions.
        const needed = alive.length;
        const winners = alive.filter(p => p.objectives >= needed);
        if (winners.length) {
            state.over = true;
            winners.sort((a, b) => b.objectives - a.objectives);
            state.winner = winners[0].seat;
            this.log(state, -1, 'Игра закончена. Побеждает ' + winners[0].name + '.');
            return;
        }
        if (state.round > this.ROUNDS) {
            state.over = true;
            const best = alive.slice().sort((a, b) => b.objectives - a.objectives);
            state.winner = best[0].seat;
            this.log(state, -1, 'Восьмой раунд закончен. Побеждает ' + best[0].name + '.');
            return;
        }
        state.phase = 'planning';
        state.turn = state.firstPlayer;
        this.log(state, -1, 'Раунд ' + state.round + ': фаза планирования.');
    },

    cmdNextPhase(state, seat) {
        if (state.phase !== 'refresh') return { ok: false, error: 'Сейчас не фаза обновления.' };
        if (state.eventsLeft > 0) return { ok: false, error: 'Сначала разыграйте события.' };
        this.endRound(state);
        return { ok: true };
    },

    // Rally a routed unit (a card effect).
    cmdRally(state, seat, cmd) {
        const unit = state.units.find(u => u.id === cmd.unit && u.seat === seat);
        if (!unit) return { ok: false, error: 'Нет такого отряда.' };
        unit.routed = false;
        return { ok: true };
    },

    // -----------------------------------------------------------------------
    //  The effects of the cards
    // -----------------------------------------------------------------------

    // The steps of a card: the text of the card is the rule. The ability of
    // the unit works only if the unit is in the combat.
    cardSteps(state, seat, card) {
        if (!card) return [];
        const steps = FS_EFFECTS.parse(card.general || '', { kind: 'combat' });
        if (card.unit) {
            const combat = state.combat;
            const reqs = card.reqs || [];
            const there = combat && state.units.some(u => {
                if (u.seat !== seat || u.system !== combat.system || u.area !== combat.pos) return false;
                const def = this.unitOf(state, u);
                return def && reqs.some(r => FS_EFFECTS.sameName(def.name, r));
            });
            if (there) steps.push(...FS_EFFECTS.parse(card.unit, { kind: 'combat' }));
        }
        return steps;
    },

    // The steps are performed by the effects engine. The player answers the
    // questions of the text: the question waits in state.pending.
    runEffects(state, seat, steps, ctx) {
        if (!steps.length) return { ok: true, done: true };
        return FS_EFFECTS.run(this, state, seat, steps, ctx || {});
    },

    // The answer of the player to the question of the effect.
    cmdEffect(state, seat, cmd) {
        return FS_EFFECTS.answer(this, state, seat, cmd);
    },

    // The schemes of the player: the cards that wait for their moment.
    schemesOf(state, seat) {
        const p = state.players[seat];
        return (p.schemes || []).filter(s => s && s.trigger && s.steps && s.steps.length);
    },

    // The moment of a scheme has come: the player may discard the card.
    maybeScheme(state, seat, trigger, ctx) {
        const schemes = this.schemesOf(state, seat).filter(s => s.trigger === trigger);
        if (!schemes.length) return false;
        const c = ctx || {};
        // The card whose text the engine did not read: the player sees the text.
        const manual = schemes.find(s => s.note);
        state.pending = {
            seat, answerSeat: seat, kind: 'scheme', steps: [], index: 0,
            question: {
                kind: 'scheme', who: seat, options: schemes.map(s => s.name),
                text: manual
                    ? manual.text + '\n(Эффект выполняется вручную: сбросьте карту, когда выполните его.)'
                    : 'Сбросить карту: ' + schemes.map(s => '«' + s.name + '»').join(', ') + '?',
            },
            ctx: { kind: c.kind || 'event', ctx: c.ctx || null, schemes },
        };
        return true;
    },

    // -----------------------------------------------------------------------
    //  Combat
    // -----------------------------------------------------------------------

    rollDice(state, n) {
        const out = [];
        for (let i = 0; i < n; i++) {
            const r = this.rand(state, 4);
            out.push(['att', 'def', 'morale', 'blank'][r]);
        }
        return out;
    },

    // The combat dice of a player: the combat value of his unrouted units.
    combatValue(state, seat, systemId, pos) {
        let sum = 0;
        for (const u of this.unitsAt(state, systemId, pos)) {
            if (u.seat !== seat || u.routed) continue;
            const def = this.unitOf(state, u);
            if (def) sum += def.combat;
        }
        return sum;
    },

    startCombat(state, attacker, defender, systemId, pos) {
        const roll = seat => {
            const n = Math.min(this.combatValue(state, seat, systemId, pos), this.DICE_MAX);
            return this.rollDice(state, n);
        };
        const combat = {
            system: systemId,
            pos,
            attacker,
            defender,
            round: 1,
            step: 'reinforce-attacker',
            dice: { attacker: roll(attacker), defender: roll(defender) },
            tokens: { attacker: { att: 0, def: 0 }, defender: { att: 0, def: 0 } },
            cards: { attacker: { hand: [], played: [] }, defender: { hand: [], played: [] } },
            reinforce: { attacker: 0, defender: 0 },
            damage: { attacker: 0, defender: 0 },
            winner: null,
        };
        // Five combat cards for both players.
        for (const seat of [attacker, defender]) {
            const p = state.players[seat];
            if (!p.decks.combat.length) {
                // The basic deck: five cards, two copies of every card.
                const cards = FS_DATA.combat.filter(c => c.faction === p.faction && !c.upgrade).map(c => c.name);
                p.decks.combat = this.shuffle(state, cards.concat(cards));
            }
            const hand = [];
            // The order may give more cards for the combat.
            const extra = (state.order && state.order.seat === seat && state.order.extraCombatCards) || 0;
            for (let i = 0; i < 5 + extra; i++) hand.push(p.decks.combat.shift());
            combat.cards[seat === attacker ? 'attacker' : 'defender'].hand = hand;
        }
        state.combat = combat;
        this.log(state, attacker, 'Бой в системе ' + this.system(state, systemId).tile + ': '
            + state.players[attacker].name + ' против ' + state.players[defender].name + '.');
        // The schemes of the start of the combat.
        this.maybeScheme(state, attacker, 'combat-start', { kind: 'combat', ctx: { side: 'attacker' } });
    },

    // The commands of the combat.
    cmdCombat(state, seat, cmd) {
        const c = state.combat;
        if (!c) return { ok: false, error: 'Боя нет.' };
        const side = seat === c.attacker ? 'attacker' : seat === c.defender ? 'defender' : null;
        if (!side) return { ok: false, error: 'Вы не участвуете в бою.' };
        switch (cmd.action) {
            case 'reinforce': return this.combatReinforce(state, seat, side, cmd);
            case 'playCard': return this.combatPlayCard(state, seat, side, cmd);
            case 'damage': return this.combatDamage(state, seat, side, cmd);
            case 'token': return this.combatToken(state, seat, side, cmd);
            case 'die': return this.combatDie(state, seat, side, cmd);
            case 'reroll': return this.combatReroll(state, seat, side, cmd);
            case 'skipCard': return this.combatSkipCard(state, seat, side, cmd);
            case 'retreat': return this.combatRetreat(state, seat, side, cmd);
            default: return { ok: false, error: 'Неизвестное действие боя.' };
        }
    },

    // The number of reinforcement tokens a player may use in the combat.
    maxReinforce(state, seat, side) {
        const c = state.combat;
        const units = state.units.filter(u => u.seat === seat && u.system === c.system && u.area === c.pos && !u.routed);
        return Math.min(units.length, state.players[seat].assets.reinforcement || 0);
    },

    combatReinforce(state, seat, side, cmd) {
        const c = state.combat;
        const count = Math.max(0, Number(cmd.count) || 0);
        // The card of the opponent may forbid the reinforcement.
        const foe = side === 'attacker' ? 'defender' : 'attacker';
        const other = this.combatValues(state, foe);
        void other;
        if (c.noReinforce && side === 'defender') {
            return { ok: false, error: 'Противник не может размещать жетоны подкрепления.' };
        }
        const max = this.maxReinforce(state, seat, side);
        if (count > max) return { ok: false, error: 'Не больше ' + max + ' жетонов подкрепления.' };
        c.reinforce[side] = count;
        state.players[seat].assets.reinforcement -= count;
        c.reinforceUsed = c.reinforceUsed || {};
        c.reinforceUsed[side] = count;
        if (side === 'attacker') c.step = 'reinforce-defender';
        else c.step = 'choose-attacker';
        return { ok: true };
    },

    // A combat token (att or def) is gained or lost.
    combatToken(state, seat, side, cmd) {
        const c = state.combat;
        const foe = side === 'attacker' ? 'defender' : 'attacker';
        const target = cmd.target === 'foe' ? foe : side;
        const count = Math.max(0, Number(cmd.count) || 0);
        const kind = cmd.tokenType === 'def' ? 'def' : 'att';
        if (target === foe && count > 0) {
            const t = c.tokens[foe];
            const take = Math.min(count, kind === 'att' ? t.att : t.def);
            if (kind === 'att') t.att -= take; else t.def -= take;
            return { ok: true, count: take };
        }
        const t = c.tokens[target];
        if (kind === 'att') t.att += count; else t.def += count;
        return { ok: true, count };
    },

    // A die with a given face (att, def, morale or any).
    combatDie(state, seat, side, cmd) {
        const c = state.combat;
        const foe = side === 'attacker' ? 'defender' : 'attacker';
        const target = cmd.target === 'foe' ? foe : side;
        const count = Math.max(0, Number(cmd.count) || 0);
        const dice = c.dice[target];
        if (target === foe) {
            const take = Math.min(count, dice.length);
            for (let i = 0; i < take; i++) {
                const idx = dice.findIndex(d => d !== 'blank');
                dice.splice(idx >= 0 ? idx : 0, 1);
            }
            return { ok: true, count: take };
        }
        if (dice.length + count > this.DICE_MAX) return { ok: false, error: 'Больше восьми кубиков быть не может.' };
        const faces = ['att', 'def', 'morale', 'blank'];
        for (let i = 0; i < count; i++) {
            const face = faces.includes(cmd.face) ? cmd.face : 'any';
            dice.push(face === 'any' ? this.rollDice(state, 1)[0] : face);
        }
        return { ok: true, count };
    },

    // A die is rolled again.
    combatReroll(state, seat, side, cmd) {
        const c = state.combat;
        const dice = c.dice[side];
        const index = Number(cmd.index);
        if (!(index >= 0 && index < dice.length)) return { ok: false, error: 'Нет такого кубика.' };
        dice[index] = this.rollDice(state, 1)[0];
        return { ok: true };
    },

    // The card a player plays in this execution round.
    combatPlayCard(state, seat, side, cmd) {
        const c = state.combat;
        const hand = c.cards[side];
        const index = Number(cmd.index);
        if (!(index >= 0 && index < hand.hand.length)) return { ok: false, error: 'Нет такой карты.' };
        const name = hand.hand.splice(index, 1)[0];
        const card = FS_DATA.combat.find(x => x.faction === state.players[seat].faction && x.name === name);
        hand.played.push({ name, card });
        this.log(state, seat, state.players[seat].name + ' играет боевую карту «' + name + '».');
        // The icons of the card count from now on.
        if (side === 'attacker') c.step = 'choose-defender';
        else c.step = 'damage-attacker';
        // The text of the card is the rule: the engine performs it.
        const steps = this.cardSteps(state, seat, card);
        if (steps.length) {
            c.nextStep = c.step;
            c.step = 'effect';
            this.runEffects(state, seat, steps, { kind: 'combat', ctx: { side } });
        }
        return { ok: true, card: card || null };
    },

    combatSkipCard(state, seat, side) {
        const c = state.combat;
        if (side === 'attacker') c.step = 'choose-defender';
        else c.step = 'damage-attacker';
        return { ok: true };
    },

    // The offence and the defence of a player.
    combatValues(state, side) {
        const c = state.combat;
        let dice = c.dice[side] || [];
        // The card may make the attack dice of the enemy useless.
        if (c.ignoreFoeAtt && side === 'defender') dice = dice.filter(d => d !== 'att');
        const tokens = c.tokens[side];
        const played = c.cards[side].played;
        let att = 0, def = 0, morale = 0;
        for (const d of dice) {
            if (d === 'att') att++;
            else if (d === 'def') def++;
            else if (d === 'morale') morale++;
        }
        att += tokens.att;
        def += tokens.def;
        for (const card of played) {
            if (!card.card) continue;
            att += card.card.icons.att;
            def += card.card.icons.def;
            morale += card.card.icons.morale;
        }
        return { att, def, morale };
    },

    // The damage of a player: the difference between the offence of the
    // opponent and his own defence.
    combatDamageFor(state, side) {
        const c = state.combat;
        const other = side === 'attacker' ? 'defender' : 'attacker';
        const me = this.combatValues(state, side);
        const them = this.combatValues(state, other);
        let damage = Math.max(0, them.att - me.def);
        // The card may add the damage to one side or to both.
        if (side === 'attacker') {
            damage += (c.extraDamageFoe || 0) + (c.extraDamageBoth || 0);
        } else {
            damage += (c.extraDamage || 0) + (c.extraDamageBoth || 0);
        }
        return damage;
    },

    // The player assigns the damage to his own units and bastions.
    combatDamage(state, seat, side, cmd) {
        const c = state.combat;
        // The schemes of the damage step are used before the damage.
        c.damageHook = c.damageHook || {};
        if (!c.damageHook[side]) {
            c.damageHook[side] = true;
            if (this.maybeScheme(state, seat, 'damage', { kind: 'combat', ctx: { side } })) return { ok: true, pending: true };
        }
        const damage = this.combatDamageFor(state, side);
        c.damage[side] = damage;
        // The card may make the damage go one point at a time.
        const oneByOne = !!(c.damageOneByOne && side === 'defender');
        const targets = cmd.targets || [];
        // The damage is applied to the chosen units in order.
        let left = damage;
        const applied = [];
        for (const id of targets) {
            if (left <= 0) break;
            const unit = state.units.find(u => u.id === id);
            if (unit) {
                const def = this.unitOf(state, unit);
                let health = def ? def.health : 1;
                // The card may raise the health of the units or lower it.
                if (c.healthBonus && unit.seat === seat) health += c.healthBonus;
                if (c.enemyHealth && unit.seat !== seat) health = Math.min(health, c.enemyHealth);
                if (left >= health && !oneByOne) {
                    left -= health;
                    applied.push({ unit: unit.id, destroyed: true });
                    this.destroyUnit(state, unit);
                } else if (oneByOne) {
                    // The damage goes one point at a time.
                    left -= 1;
                    if (health <= 1) {
                        applied.push({ unit: unit.id, destroyed: true });
                        this.destroyUnit(state, unit);
                    } else {
                        applied.push({ unit: unit.id, destroyed: false });
                    }
                } else {
                    // The card may keep the unit from being routed.
                    const keep = (c.noRoute || []).some(x => x.seat === unit.seat && (!x.kl || (def && def.kl <= x.kl)));
                    if (!keep) unit.routed = true;
                    left = 0;
                    applied.push({ unit: unit.id, destroyed: false });
                }
                continue;
            }
            const bastion = state.structures.find(s => s.id === id);
            if (bastion) {
                const health = this.structureStats(bastion.type).health;
                if (left >= health) {
                    left -= health;
                    applied.push({ bastion: bastion.id, destroyed: true });
                    this.destroyStructure(state, bastion);
                } else {
                    left = 0;    // the damage to a bastion is ignored
                    applied.push({ bastion: bastion.id, destroyed: false });
                }
            }
        }
        c.applied = c.applied || {};
        c.applied[side] = applied;
        // The combat tokens are returned to the supply at the end of the round.
        if (side === 'attacker') c.step = 'damage-defender';
        else this.endCombatRound(state);
        return { ok: true, damage, applied };
    },

    // The end of an execution round: the third one ends the combat.
    endCombatRound(state) {
        const c = state.combat;
        c.round++;
        // The combat tokens return to the supply at the end of the execution round.
        for (const side of ['attacker', 'defender']) {
            const seat = side === 'attacker' ? c.attacker : c.defender;
            const tokens = c.tokens[side];
            const p = state.players[seat];
            p.assets.reinforcement += c.reinforceUsed && c.reinforceUsed[side] ? c.reinforceUsed[side] : 0;
            c.reinforceUsed[side] = 0;
            void tokens;
        }
        // The card may destroy the units that became routed.
        if (c.destroyRouted) {
            for (const u of state.units.slice()) {
                if (u.routed && u.system === c.system && u.area === c.pos) {
                    this.log(state, c.attacker, 'Деморализованный отряд уничтожен.');
                    this.destroyUnit(state, u);
                }
            }
        }
        if (c.round > (c.maxRounds || 3)) { this.finishCombat(state); return; }
        c.step = 'choose-attacker';
        // The schemes of the start of the round.
        this.maybeScheme(state, c.attacker, 'round', { kind: 'combat', ctx: { side: 'attacker' } });
        c.damage = { attacker: 0, defender: 0 };
    },

    // The morale of a player at the end of the combat.
    combatMorale(state, side) {
        const c = state.combat;
        const seat = side === 'attacker' ? c.attacker : c.defender;
        const values = this.combatValues(state, side);
        let morale = values.morale;
        for (const u of this.unitsAt(state, c.system, c.pos)) {
            if (u.seat !== seat || u.routed) continue;
            const def = this.unitOf(state, u);
            if (def) morale += def.morale;
        }
        for (const s of this.structuresAt(state, c.system, c.pos)) {
            if (s.seat !== seat) continue;
            morale += this.structureStats(s.type).morale;
        }
        return morale;
    },

    // The end of the combat: the winner by morale, the retreat, the cleanup.
    finishCombat(state) {
        const c = state.combat;
        const attMorale = this.combatMorale(state, 'attacker');
        const defMorale = this.combatMorale(state, 'defender');
        // A tie goes to the defender.
        const attackerWins = attMorale > defMorale;
        c.winner = attackerWins ? 'attacker' : 'defender';
        c.morale = { attacker: attMorale, defender: defMorale };
        const loser = attackerWins ? c.defender : c.attacker;
        const winner = attackerWins ? c.attacker : c.defender;
        this.log(state, winner, 'Бой выигран: мораль ' + (attackerWins ? attMorale : defMorale) + ' против ' + (attackerWins ? defMorale : attMorale) + '.');
        // The winner takes the structures.
        for (const s of this.structuresAt(state, c.system, c.pos)) {
            if (s.seat === loser) s.seat = winner;
        }
        c.loser = loser;
        c.step = 'retreat';
        // The schemes of the end of the combat.
        this.maybeScheme(state, winner, 'combat-end', { kind: 'combat', ctx: { side: winner === c.attacker ? 'attacker' : 'defender' } });
        // The combat cards go back into the deck, the reinforcement tokens too.
        for (const side of ['attacker', 'defender']) {
            const seat = side === 'attacker' ? c.attacker : c.defender;
            const p = state.players[seat];
            for (const card of c.cards[side].played) p.decks.combat.push(card.name);
            c.cards[side].played = [];
            p.assets.reinforcement += c.reinforceUsed && c.reinforceUsed[side] ? c.reinforceUsed[side] : 0;
            c.reinforceUsed[side] = 0;
        }
    },

    // The loser retreats: all his units leave the area (they are routed).
    combatRetreat(state, seat, side, cmd) {
        const c = state.combat;
        if (c.loser !== seat) return { ok: false, error: 'Отступает проигравший.' };
        const target = cmd && cmd.target ? { system: cmd.target.system, pos: cmd.target.pos } : null;
        const units = state.units.filter(u => u.seat === seat && u.system === c.system && u.area === c.pos);
        for (const u of units) {
            if (target) { u.system = target.system; u.area = target.pos; }
            u.routed = true;
        }
        // The units over the capacity of the area are destroyed.
        if (target) this.checkCapacity(state, seat, target.system, target.pos);
        this.log(state, seat, state.players[seat].name + ' отступает.');
        state.combat = null;
        // The order that started the combat is over.
        this.finishOrder(state, seat);
        return { ok: true };
    },

    // -----------------------------------------------------------------------
    //  The view for a client
    // -----------------------------------------------------------------------

    // The state a client may see: the hands and the decks of the other
    // players are hidden.
    view(state, seat) {
        const copy = JSON.parse(JSON.stringify(state));
        for (const p of copy.players) {
            p.decks.combat = p.decks.combat.length;
            p.decks.event = p.decks.event.length;
            p.decks.upgradeCombat = p.decks.upgradeCombat.length;
            p.decks.upgradeOrder = p.decks.upgradeOrder.length;
            p.decks = { combat: p.decks.combat, event: p.decks.event, upgradeCombat: p.decks.upgradeCombat, upgradeOrder: p.decks.upgradeOrder };
            p.objectivePool = p.objectivePool.length;
            p.supply = {
                units: p.supply.units,
                structures: p.supply.structures,
            };
        }
        // The cards of the combat: only the player sees his own hand.
        if (copy.combat) {
            for (const side of ['attacker', 'defender']) {
                const combatSeat = copy.combat[side];
                if (combatSeat !== seat) copy.combat.cards[side].hand = [];
            }
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
            copy.setup.legalCells = this.setupLegalCells(copy);
            copy.setup.myTurn = copy.setup.turn === seat;
        }
        copy.seat = seat;
        return copy;
    },
};
