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
    // 3 x players tiles, on an aligned square grid.
    LAYOUTS: { 2: [2, 2, 2], 3: [3, 3, 3], 4: [4, 4, 4] },
    TILE: 100,             // px of one system tile
    MATERIEL_MAX: 14,      // the materiel dial stops at 14
    DICE_MAX: 8,           // no more than eight dice in a combat
    ORDER_TOKENS: 4,       // four order tokens per round
    ROUNDS: 8,             // the game ends after the eighth round
    ORDER_SUPPLY: 2,       // two tokens of every kind in the hand of a player
    AREA_CAP: 3,           // the unit capacity of a void
    AREA_MAX_UNITS: 5,     // no more than five units in one area
    // The structures are shared plastic: 35 in the box (15 cities, 10 factories,
    // 10 bastions), and every player has 9 structure control tokens. There is no
    // "three of each" rule — that number was invented by the engine.
    STRUCTURE_POOL: { city: 15, factory: 10, bastion: 10 },
    STRUCTURE_TOKENS: 9,

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

    // The army paint: one primary and two secondary colors, chosen in the lobby.
    // Anything missing falls back to shades of the faction color.
    normalizePalette(pal, fallback) {
        const hex = c => /^#[0-9a-fA-F]{6}$/.test(String(c || '')) ? String(c).toLowerCase() : null;
        const base = hex(fallback) || '#888888';
        const shade = amt => {
            const n = parseInt(base.slice(1), 16);
            const f = v => Math.max(0, Math.min(255, Math.round(v + amt * 2.55)));
            return '#' + (((f((n >> 16) & 255)) << 16) | ((f((n >> 8) & 255)) << 8) | f(n & 255)).toString(16).padStart(6, '0');
        };
        pal = pal || {};
        return {
            primary: hex(pal.primary) || base,
            secondary1: hex(pal.secondary1) || shade(48),
            secondary2: hex(pal.secondary2) || shade(-38),
        };
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

    // The command level of a player: one per city he controls, plus whatever
    // the order in play adds («Сила воли»: «ваш командный уровень
    // увеличивается на 1 во время выполнения этого приказа»).
    commandLevel(state, seat) {
        const cities = state.structures.filter(s => s.seat === seat && s.type === 'city').length;
        const bonus = state.order && state.order.seat === seat ? (state.order.klBonus || 0) : 0;
        return cities + bonus;
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
        return state.systems.filter(other => other.id !== sys.id
            && Math.abs(other.row - sys.row) + Math.abs(other.col - sys.col) === 1).map(other => other.id);
    },

    // Only full shared edges count as adjacency.
    sideBetween(state, aId, bId) {
        const a = this.system(state, aId), b = this.system(state, bId);
        if (!a || !b || Math.abs(a.row - b.row) + Math.abs(a.col - b.col) !== 1) return null;
        if (a.row === b.row) return b.col > a.col ? 'E' : 'W';
        return b.row > a.row ? 'S' : 'N';
    },

    across(state, systemId, side) {
        const sys = this.system(state, systemId);
        if (!sys) return null;
        const offset = { N: [-1, 0], S: [1, 0], E: [0, 1], W: [0, -1] }[side];
        if (!offset) return null;
        const other = state.systems.find(s => s.row === sys.row + offset[0] && s.col === sys.col + offset[1]);
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
    pathExists(state, seat, fromSystem, fromPos, toSystem, toPos, opts) {
        if (fromSystem === toSystem && fromPos === toPos) return true;
        // The order upgrade "Крестный ход": uncontrolled worlds are friendly for
        // the march, but only for the number of units the card allows.
        const march = opts && opts.uncontrolled === false ? 0
            : (state.order && state.order.uncontrolled
                ? Math.max(0, state.order.uncontrolled - (state.order.uncontrolledUsed || 0)) : 0);
        const start = { system: fromSystem, pos: fromPos, voids: 0 };
        const seen = new Map([[fromSystem + ':' + fromPos, 0]]);
        const queue = [start];
        while (queue.length) {
            const cur = queue.shift();
            for (const next of this.areasAround(state, cur.system, cur.pos)) {
                const key = next.system + ':' + next.pos;
                if (this.stormOn(state, cur.system, next.system)) continue;
                // The destination may be an empty world — the way must be friendly.
                if (next.system === toSystem && next.pos === toPos) return true;
                let voids = cur.voids;
                const area = this.area(this.system(state, next.system), next.pos);
                const control = this.control(state, seat, next.system, next.pos);
                // The order upgrade "Крестный ход": an uncontrolled world is a
                // friendly stepping stone for the units the card allows.
                // "Uncontrolled" is control() === 'none': no piece of either side.
                const byMarch = control !== 'friendly' && march > 0 && area && area.world
                    && !this.unitsAt(state, next.system, next.pos).length
                    && !this.structuresAt(state, next.system, next.pos).length;
                if (control !== 'friendly' && !byMarch) {
                    const order = state.order;
                    if (!order || !order.passVoid || !area || area.world || voids >= order.passVoid
                        || this.unitsAt(state, next.system, next.pos).length
                        || this.structuresAt(state, next.system, next.pos).length) continue;
                    voids++;
                }
                if (seen.has(key) && seen.get(key) <= voids) continue;
                seen.set(key, voids);
                queue.push({ system: next.system, pos: next.pos, voids });
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
        // Opposing half-edges must line up; diagonal quarters do not touch.
        const pairs = {
            N: { TL: 'BL', TR: 'BR' }, S: { BL: 'TL', BR: 'TR' },
            E: { TR: 'TL', BR: 'BL' }, W: { TL: 'TR', BL: 'BR' },
        };
        return !!pairs[side] && pairs[side][posA] === posB;
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
                palette: this.normalizePalette(p.palette, faction.color),
                materiel: 6,
                assets: { forge: 0, cache: 0, reinforcement: 0, prosperity: 0 },
                objectives: 0,
                supply: { units: {}, structures: { city: 0, factory: 0, bastion: 0 } },
                initialForces: { units: {}, structures: {} },
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
                state.players[seat].supply.units[u.id] = Math.max(0, (u.max || 0) - (u.start || 0));
                if (u.start > 0) state.players[seat].initialForces.units[u.id] = u.start;
            }
            const st = faction.start;
            // The structures are not counted per player: the plastic is shared and
            // the player is limited by his control tokens (see canTakeStructure).
            for (const type of ['city', 'factory', 'bastion']) {
                state.players[seat].supply.structures[type] = this.STRUCTURE_POOL[type] || 0;
                state.players[seat].initialForces.structures[type] = st[type] || 0;
            }
            state.players[seat].assets.forge = st.forge || 0;
            state.players[seat].assets.cache = st.cache || 0;
            state.players[seat].assets.reinforcement = st.reinforcement || 0;
            state.players[seat].assets.prosperity = st.prosperity || 0;
            // "2 жетона материалов (ассетов)": the sheet of the Inquisition
            // does not name them, the player takes any assets he likes
            // (07-tokens.md: prosperity = one asset of the player's choice).
            state.players[seat].startChoice = st.choice || 0;
            // The combat deck: five cards, two copies of every card.
            const base = FS_DATA.combat.filter(c => c.faction === faction.id && !c.upgrade).map(c => c.name);
            state.players[seat].decks.combat = this.shuffle(state, base.concat(base));
            // The cards the player may buy: the upgrade cards of his faction
            // lie in their own piles next to the board («Combat Cards And
            // Combat Upgrade Cards», «Order Upgrade Cards»).
            state.players[seat].decks.upgradeCombat = FS_DATA.combat
                .filter(c => c.faction === faction.id && c.upgrade).map(c => c.name);
            state.players[seat].decks.upgradeOrder = FS_DATA.orders
                .filter(c => c.faction === faction.id).map(c => c.name);
        });

        // --- the tiles: every player gets their home tile and two base tiles
        // A and B are the two faces of one physical tile, not separate tiles.
        const base = this.shuffle(state, FS_DATA.tiles.filter(t => !t.home && /A$/.test(t.id)));
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
        // composition remains available to deterministic simulations and the rules audit.
        const rows = this.LAYOUTS[count] || this.LAYOUTS[2];
        const cells = [];
        rows.forEach((n, r) => { for (let c = 0; c < n; c++) cells.push({ row: r, col: c }); });
        const seatOrder = [];
        for (let i = 0; i < count; i++) seatOrder.push((state.firstPlayer + i) % count);
        for (const p of state.players) {
            p.objectivePool = [];
            for (const opponent of state.players) {
                if (opponent.seat !== p.seat) p.objectivePool.push(opponent.faction, opponent.faction);
            }
        }

        if (opts.interactiveSetup) {
            const hands = Array.from({ length: count }, () => []);
            for (const entry of tiles) hands[entry.seat].push(entry.tile.id);
            const center = { row: 0, col: 0 };
            state.setup = {
                hands,
                stage: 'tile',
                currentSystem: null,
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
                this.placeInitialForces(state, entry.seat, sys);
                state.players[entry.seat].placed++;
                this.placeSetupObjectives(state, sys);
            }
            this.finishBoardSetup(state);
        }

        return state;
    },

    // -----------------------------------------------------------------------
    //  The test modes of the lobby
    //
    //  'game'   — the ordinary game: the galaxy is assembled tile by tile.
    //  'map'    — the same game with the board already assembled: the planning
    //             starts at once, so the play after the construction is testable.
    //  'battle' — a battlefield: the chosen troops fight with the chosen deck.
    // -----------------------------------------------------------------------

    // The map is built by the engine itself (the same code the audit uses):
    // tiles, initial forces, the objective tokens and the storms.
    newReadyGame(opts) {
        const state = this.newGame(Object.assign({}, opts, { interactiveSetup: false }));
        state.testMode = 'map';
        this.log(state, -1, 'Тестовая партия: карта собрана автоматически, ход сразу за планированием.');
        return state;
    },

    // The deck of a test battle: the chosen cards, two copies of each, as in the
    // real deck. An empty or foreign choice falls back to the whole base deck.
    buildTestDeck(state, seat, names) {
        const p = state.players[seat];
        if (!p) return [];
        const base = FS_DATA.combat.filter(c => c.faction === p.faction && !c.upgrade).map(c => c.name);
        const chosen = (names || []).filter(n => base.includes(n));
        const cards = chosen.length ? chosen : base;
        // Two copies of every card — and enough cards to deal the hand of a combat.
        let deck = cards.concat(cards);
        while (deck.length < 10) deck = deck.concat(cards);
        p.decks.combat = this.shuffle(state, deck);
        return cards;
    },

    // The battlefield: a ready map without any troops but the chosen ones. The
    // host attacks, the opponent defends; the ground battle happens on a world,
    // the space battle over the system.
    newBattleTest(opts) {
        const o = opts || {};
        const kind = o.kind === 'space' ? 'space' : 'ground';
        const state = this.newGame({ seed: o.seed, players: o.players || [], interactiveSetup: false });
        // An empty board: only the battlefield matters here.
        state.units = [];
        state.structures = [];
        state.objectives = [];
        state.storms = [];
        for (const sys of state.systems) sys.tokens = [];
        const attacker = 0, defender = 1;
        const sys = state.systems[Math.floor(state.systems.length / 2)] || state.systems[0];
        const wanted = a => (kind === 'space' ? !a.world : !!a.world);
        const area = sys.areas.find(wanted) || sys.areas[0];
        state.phase = 'operations';
        state.turn = attacker;
        // The troops of the two sides, the host first.
        const roster = [];
        const place = (seat, units) => {
            const faction = state.players[seat].faction;
            const defs = (FS_DATA.factions.find(f => f.id === faction) || { units: [] }).units;
            for (const [unitId, count] of Object.entries(units || {})) {
                const def = defs.find(u => u.id === unitId);
                if (!def) continue;
                if ((def.type === 'ship') !== (kind === 'space')) continue;
                const n = Math.max(0, Math.min(5, Number(count) || 0));
                for (let i = 0; i < n; i++) {
                    this.addUnit(state, seat, unitId, sys.id, area.pos);
                    roster.push({ seat, unit: unitId });
                }
            }
        };
        place(attacker, o.units);
        place(defender, o.foeUnits && Object.keys(o.foeUnits).length ? o.foeUnits : this.defaultFoeUnits(state, defender, kind));
        // The decks of the battle: the chosen cards only.
        const attCards = this.buildTestDeck(state, attacker, o.cards);
        const defCards = this.buildTestDeck(state, defender, o.foeCards);
        for (const seat of [attacker, defender]) state.players[seat].assets.reinforcement = 2;
        state.testBattle = {
            kind, attacker, defender, system: sys.id, pos: area.pos,
            roster,
            decks: { attacker: attCards, defender: defCards },
            reinforcement: 2,
        };
        state.phase = 'operations';
        state.turn = attacker;
        state.order = { seat: attacker, order: 'advance', system: sys.id, pos: area.pos, phase: 'combat' };
        state.testMode = 'battle';
        this.log(state, -1, (kind === 'space' ? 'Космический' : 'Наземный')
            + ' бой: ' + state.players[attacker].name + ' против ' + state.players[defender].name + '.');
        this.startCombat(state, attacker, defender, sys.id, area.pos);
        return state;
    },

    // The opponent of a battle test: two of his troops of the right kind.
    defaultFoeUnits(state, seat, kind) {
        const faction = FS_DATA.factions.find(f => f.id === state.players[seat].faction);
        const units = ((faction && faction.units) || []).filter(u => (u.type === 'ship') === (kind === 'space'));
        const out = {};
        for (const u of units.slice(0, 2)) out[u.id] = 2;
        return out;
    },

    // The same battle again: the fallen return, the decks are dealt anew.
    cmdRematchBattle(state, seat) {
        const test = state.testBattle;
        if (!test) return { ok: false, error: 'Сейчас не тестовый бой.' };
        if (state.combat) return { ok: false, error: 'Бой ещё идёт.' };
        const p = state.players[seat];
        if (!p || (seat !== test.attacker && seat !== test.defender)) return { ok: false, error: 'Вы не участник боя.' };
        state.units = state.units.filter(u => !(u.system === test.system && u.area === test.pos && (u.seat === test.attacker || u.seat === test.defender)));
        for (const entry of test.roster) this.addUnit(state, entry.seat, entry.unit, test.system, test.pos);
        for (const side of ['attacker', 'defender']) {
            const s = test[side];
            this.buildTestDeck(state, s, test.decks[side]);
            state.players[s].assets.reinforcement = test.reinforcement;
        }
        state.combat = null;
        state.phase = 'operations';
        state.turn = test.attacker;
        state.order = { seat: test.attacker, order: 'advance', system: test.system, pos: test.pos, phase: 'combat' };
        this.log(state, -1, 'Тот же бой начинается снова.');
        this.startCombat(state, test.attacker, test.defender, test.system, test.pos);
        return { ok: true };
    },

    // Quarter-turns are clockwise in board coordinates (x right, row down).
    rotateArea(pos, turns) {
        const clockwise = { TL: 'TR', TR: 'BR', BR: 'BL', BL: 'TL' };
        let result = pos;
        for (let i = 0; i < turns; i++) result = clockwise[result];
        return result;
    },

    tileFaces(id) {
        const physical = String(id).replace(/[AB]$/, '');
        return FS_DATA.tiles.filter(t => t.id.replace(/[AB]$/, '') === physical);
    },

    createSystemFromTile(state, tile, seat, row, col, rotation = 0) {
        return {
            id: 'sys' + (state.systems.length + 1),
            tile: tile.id,
            owner: seat,
            row,
            col,
            rotation,
            areas: tile.areas.map(a => ({
                pos: this.rotateArea(a.pos, rotation),
                sourcePos: a.pos,
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
        return Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1;
    },

    setupLegalCells(state) {
        if (!state.setup) return [];
        if (!state.systems.length) return [{ row: 0, col: 0 }];
        const occupied = new Set(state.systems.map(s => s.row + ':' + s.col));
        const candidates = new Map();
        for (const sys of state.systems) {
            for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
                const cell = { row: sys.row + dr, col: sys.col + dc };
                const key = cell.row + ':' + cell.col;
                if (occupied.has(key)) continue;
                const all = state.systems.concat([cell]);
                const height = Math.max(...all.map(s => s.row)) - Math.min(...all.map(s => s.row)) + 1;
                const width = Math.max(...all.map(s => s.col)) - Math.min(...all.map(s => s.col)) + 1;
                const short = state.players.length, long = 3;
                if ((height <= short && width <= long) || (height <= long && width <= short)) candidates.set(key, cell);
            }
        }
        return [...candidates.values()];
    },

    cmdPlaceSystemTile(state, seat, cmd) {
        const setup = state.setup;
        if (state.phase !== 'setup' || !setup) return { ok: false, error: 'Сейчас не этап сборки карты.' };
        if (setup.turn !== seat) return { ok: false, error: 'Сейчас очередь другого игрока выкладывать тайл.' };
        if (setup.stage !== 'tile') return { ok: false, error: 'Сначала завершите текущий этап размещения.' };
        const hand = setup.hands[seat] || [];
        const tileIndex = hand.findIndex(id => this.tileFaces(id).some(t => t.id === cmd.tile));
        if (tileIndex < 0) return { ok: false, error: 'Этого системного тайла нет у вас в руке.' };
        const cell = { row: Number(cmd.row), col: Number(cmd.col) };
        if (!this.setupLegalCells(state).some(c => c.row === cell.row && c.col === cell.col)) {
            return { ok: false, error: 'Выберите пустое место рядом с уже выложенной системой.' };
        }
        const tile = FS_DATA.tiles.find(t => t.id === cmd.tile);
        if (!tile) return { ok: false, error: 'Неизвестный системный тайл.' };
        const rotation = cmd.rotation == null ? 0 : cmd.rotation;
        if (!Number.isInteger(rotation) || rotation < 0 || rotation > 3) return { ok: false, error: 'Недопустимый поворот тайла.' };
        if (!this.setupForcesFit(state, seat, tile, tileIndex)) return { ok: false, error: 'На этой стороне и оставшихся тайлах не поместятся начальные силы. Выберите другую сторону или тайл.' };
        const sys = this.createSystemFromTile(state, tile, seat, cell.row, cell.col, rotation);
        state.systems.push(sys);
        hand.splice(tileIndex, 1);
        setup.placedBySeat[seat]++;
        setup.placedTotal++;
        setup.currentSystem = sys.id;
        setup.stage = 'forces';
        this.log(state, seat, state.players[seat].name + ' разместил систему ' + tile.id + '.');
        return { ok: true };
    },

    setupGuard(state, seat, stage) {
        const setup = state.setup;
        if (state.phase !== 'setup' || !setup || setup.stage !== stage) return { ok: false, error: 'Сейчас это действие недоступно.' };
        if (setup.turn !== seat) return { ok: false, error: 'Сейчас ход другого игрока.' };
        return null;
    },

    cmdSetupForce(state, seat, cmd, kind) {
        const error = this.setupGuard(state, seat, 'forces');
        if (error) return error;
        const sys = this.system(state, state.setup.currentSystem);
        const area = this.area(sys, cmd.pos);
        if (!area) return { ok: false, error: 'Выберите область только что размещённой системы.' };
        const initial = state.players[seat].initialForces;
        if (kind === 'unit') {
            const def = this.unitDef(state, seat, cmd.unit);
            if (!def || !(initial.units[cmd.unit] > 0)) return { ok: false, error: 'Такого начального отряда больше нет.' };
            if ((def.type === 'ground') !== !!area.world) return { ok: false, error: 'Наземные отряды размещаются на мирах, корабли — в пустоте.' };
            if (this.unitsAt(state, sys.id, area.pos).length >= this.capacity(state, sys.id, area.pos)) return { ok: false, error: 'Вместимость области исчерпана.' };
            initial.units[cmd.unit]--;
            this.addUnit(state, seat, cmd.unit, sys.id, area.pos);
        } else {
            if (!['city', 'factory', 'bastion'].includes(cmd.structure) || !(initial.structures[cmd.structure] > 0)) return { ok: false, error: 'Такой начальной постройки больше нет.' };
            if (!area.world || this.structuresAt(state, sys.id, area.pos).length) return { ok: false, error: 'Постройка размещается на мире без постройки.' };
            initial.structures[cmd.structure]--;
            this.addStructure(state, seat, cmd.structure, sys.id, area.pos);
        }
        return { ok: true };
    },

    cmdRemoveSetupForce(state, seat, cmd) {
        const error = this.setupGuard(state, seat, 'forces');
        if (error) return error;
        const items = cmd.kind === 'unit' ? state.units : cmd.kind === 'structure' ? state.structures : null;
        const item = items && items.find(x => x.id === cmd.id && x.seat === seat && x.system === state.setup.currentSystem);
        if (!item) return { ok: false, error: 'Можно убрать только свою начальную фигуру с текущего тайла.' };
        items.splice(items.indexOf(item), 1);
        const pool = state.players[seat].initialForces[cmd.kind === 'unit' ? 'units' : 'structures'];
        const id = cmd.kind === 'unit' ? item.unit : item.type;
        pool[id] = (pool[id] || 0) + 1;
        return { ok: true };
    },

    // Future tiles must have enough room for everything left; this prevents an
    // irreversible setup dead end after the player confirms a tile.
    setupForcesFit(state, seat, chosenTile = null, chosenIndex = -1) {
        const initial = state.players[seat].initialForces;
        const future = state.setup.hands[seat].filter((_, i) => i !== chosenIndex).map(id => this.tileFaces(id));
        if (chosenTile) future.push([chosenTile]);
        let needGround = 0, needShips = 0;
        for (const [id, n] of Object.entries(initial.units)) {
            const def = this.unitDef(state, seat, id);
            if (def && def.type === 'ship') needShips += n;
            else needGround += n;
        }
        const structures = Object.values(initial.structures).reduce((sum, n) => sum + n, 0);
        // A face is one indivisible choice: do not combine the best capacity of
        // one side with the best ship/structure capacity of the other side.
        const fits = (index, ground, ships, worlds) => {
            if (index === future.length) return needGround <= ground && needShips <= ships && structures <= worlds;
            return future[index].some(tile => {
                let g = 0, s = 0, w = 0;
                for (const area of tile.areas) {
                    if (area.world) { g += Math.min(area.world.capacity || this.AREA_CAP, this.AREA_MAX_UNITS); w++; }
                    else s += this.AREA_CAP;
                }
                return fits(index + 1, ground + g, ships + s, worlds + w);
            });
        };
        return fits(0, 0, 0, 0);
    },

    cmdFinishSetupForces(state, seat) {
        const error = this.setupGuard(state, seat, 'forces');
        if (error) return error;
        if (!this.setupForcesFit(state, seat)) return { ok: false, error: 'Оставшиеся начальные силы не поместятся на следующих тайлах. Разместите больше фигур здесь или уберите и переставьте их.' };
        state.setup.stage = 'objectives';
        if (!this.setupObjectiveOptions(state).length) this.advanceSetupTurn(state);
        return { ok: true };
    },

    setupObjectiveOptions(state) {
        const setup = state.setup;
        if (!setup || setup.stage !== 'objectives') return [];
        const sys = this.system(state, setup.currentSystem);
        const pool = state.players[setup.turn].objectivePool;
        const used = new Set(state.objectives.filter(o => o.system === sys.id).map(o => o.faction));
        const occupied = new Set(state.objectives.filter(o => o.system === sys.id).map(o => o.area));
        const areas = sys.areas.filter(a => a.world && a.world.objective && !occupied.has(a.pos)).map(a => a.pos);
        if (!areas.length || !pool.length) return [];
        const counts = {};
        for (const f of pool) counts[f] = (counts[f] || 0) + 1;
        const max = Math.max(...Object.values(counts));
        return Object.keys(counts).filter(f => counts[f] === max && !used.has(f)).map(faction => ({ faction, areas }));
    },

    cmdSetupObjective(state, seat, cmd) {
        const error = this.setupGuard(state, seat, 'objectives');
        if (error) return error;
        const option = this.setupObjectiveOptions(state).find(x => x.faction === cmd.faction && x.areas.includes(cmd.pos));
        if (!option) return { ok: false, error: 'Выберите допустимый жетон и свободное место цели на текущем тайле.' };
        const pool = state.players[seat].objectivePool;
        pool.splice(pool.indexOf(cmd.faction), 1);
        state.objectives.push({ id: this.uid(state, 'obj'), faction: cmd.faction, system: state.setup.currentSystem, area: cmd.pos });
        if (!this.setupObjectiveOptions(state).length) this.advanceSetupTurn(state);
        return { ok: true };
    },

    advanceSetupTurn(state) {
        const setup = state.setup;
        if (setup.placedTotal >= setup.totalTiles) {
            setup.stage = 'storms';
            setup.currentSystem = null;
            setup.stormsPlaced = 0;
            this.log(state, -1, 'Расстановка варп-штормов: начиная с последнего игрока против часовой стрелки.');
            return;
        }
        for (let step = 1; step <= setup.turnOrder.length; step++) {
            const index = (setup.turnIndex + step) % setup.turnOrder.length;
            const next = setup.turnOrder[index];
            if (setup.hands[next].length) {
                setup.turnIndex = index;
                setup.turn = next;
                setup.stage = 'tile';
                setup.currentSystem = null;
                return;
            }
        }
    },

    setupStormEdges(state) {
        return this.allEdges(state).filter(e => !state.storms.some(storm =>
            (storm.system === e.system && storm.side === e.side)
            || (this.across(state, e.system, e.side) === storm.system && this.across(state, storm.system, storm.side) === e.system)));
    },

    cmdSetupStorm(state, seat, cmd) {
        const error = this.setupGuard(state, seat, 'storms');
        if (error) return error;
        const sys = this.system(state, cmd.system);
        if (!sys || !['N', 'E', 'S', 'W'].includes(cmd.side)) return { ok: false, error: 'Выберите сторону системы.' };
        const other = this.across(state, sys.id, cmd.side);
        const edge = this.setupStormEdges(state).find(e => (e.system === sys.id && e.side === cmd.side)
            || (other && e.system === other && this.across(state, other, e.side) === sys.id));
        if (!edge) return { ok: false, error: 'На этой границе уже есть варп-шторм.' };
        state.storms.push({ id: this.uid(state, 'storm'), system: sys.id, side: cmd.side, moved: {} });
        const setup = state.setup;
        setup.stormsPlaced++;
        this.log(state, seat, state.players[seat].name + ' разместил варп-шторм в системе ' + sys.tile + '.');
        if (setup.stormsPlaced === state.players.length) this.finishBoardSetup(state, false);
        else {
            setup.turnIndex = (setup.turnIndex - 1 + setup.turnOrder.length) % setup.turnOrder.length;
            setup.turn = setup.turnOrder[setup.turnIndex];
        }
        return { ok: true };
    },

    // The starting assets nobody chose: the engine takes the ones the player
    // holds least of, so nothing of the sheet is lost.
    takeStartChoiceLeft(state) {
        for (const p of state.players) {
            while ((p.startChoice || 0) > 0) {
                const kinds = ['forge', 'cache', 'reinforcement'];
                const limit = k => (p.faction === 'тираниды' && k === 'reinforcement' ? 4 : 3);
                const free = kinds.filter(k => (p.assets[k] || 0) < limit(k));
                if (!free.length) break;
                free.sort((a, b) => (p.assets[a] || 0) - (p.assets[b] || 0));
                p.assets[free[0]] = (p.assets[free[0]] || 0) + 1;
                p.startChoice--;
                this.log(state, p.seat, p.name + ' берёт стартовый ресурс: ' + this.assetName(free[0]) + '.');
            }
            p.startChoice = 0;
        }
    },

    // The starting assets of the player's own choice (Инквизиция).
    cmdStartAsset(state, seat, cmd) {
        const p = state.players[seat];
        if (!p.startChoice) return { ok: false, error: 'Нет стартовых ресурсов на выбор.' };
        const asset = cmd.asset;
        if (!['forge', 'cache', 'reinforcement'].includes(asset)) return { ok: false, error: 'Неизвестный ресурс.' };
        const limit = p.faction === 'тираниды' && asset === 'reinforcement' ? 4 : 3;
        if ((p.assets[asset] || 0) >= limit) return { ok: false, error: 'У вас уже максимум таких жетонов.' };
        p.assets[asset] = (p.assets[asset] || 0) + 1;
        p.startChoice--;
        this.log(state, seat, p.name + ' берёт стартовый ресурс: ' + this.assetName(asset) + '.');
        return { ok: true };
    },

    finishBoardSetup(state, automatic = true) {
        const count = state.players.length;
        const shuffled = automatic ? this.shuffle(state, this.allEdges(state)) : [];
        for (let i = 0; automatic && i < count && i < shuffled.length; i++) {
            const e = shuffled[i];
            state.storms.push({ id: this.uid(state, 'storm'), system: e.system, side: e.side, moved: {} });
        }
        this.takeStartChoiceLeft(state);
        state.setup = null;
        state.phase = 'planning';
        state.turn = state.firstPlayer;
        this.log(state, -1, 'Игра началась: раунд 1, фаза планирования.');
    },

    // The initial forces of a player on his first tile.
    placeInitialForces(state, seat, sys) {
        const initial = state.players[seat].initialForces;
        for (const [unitId, amount] of Object.entries(initial.units)) {
            const def = this.unitDef(state, seat, unitId);
            let left = amount;
            for (const area of sys.areas) {
                if ((def.type === 'ground') !== !!area.world) continue;
                while (left > 0 && this.unitsAt(state, sys.id, area.pos).length < this.capacity(state, sys.id, area.pos)) {
                    this.addUnit(state, seat, unitId, sys.id, area.pos); left--;
                }
            }
            initial.units[unitId] = left;
        }
        for (const type of ['factory', 'bastion', 'city']) {
            let left = initial.structures[type] || 0;
            for (const area of sys.areas) {
                if (!left) break;
                if (!area.world || this.structuresAt(state, sys.id, area.pos).length) continue;
                this.addStructure(state, seat, type, sys.id, area.pos); left--;
            }
            initial.structures[type] = left;
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
                // Two records may name one edge: the S side of a tile is the N
                // side of the tile below it. The key is what tells them apart.
                const key = this.edgeKey(state, { system: sys.id, side });
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
        // The plastic and the control token are free again: the counters are
        // computed from the board (structurePoolLeft, structureTokensLeft).
    },

    // How many structures of this kind are still in the box: the plastic is common
    // to all players (15 cities, 10 factories, 10 bastions in the game).
    structurePoolLeft(state, type) {
        const used = state.structures.filter(st => st.type === type).length;
        return Math.max(0, (this.STRUCTURE_POOL[type] || 0) - used);
    },

    // The free structure control tokens of a player: nine per faction, and one of
    // them lies under every structure he already owns.
    structureTokensLeft(state, seat) {
        const used = state.structures.filter(st => st.seat === seat).length;
        return Math.max(0, this.STRUCTURE_TOKENS - used);
    },

    // May this player take a structure of this kind at all? The rules limit the
    // structures by the components only ("Component Limitations"), never by a
    // number of buildings per player.
    canTakeStructure(state, seat, type) {
        if (!this.STRUCTURE_POOL[type]) return { ok: false, error: 'Неизвестная постройка.' };
        if (this.structureTokensLeft(state, seat) <= 0) return { ok: false, error: 'Не осталось жетонов контроля построек.' };
        if (this.structurePoolLeft(state, type) <= 0) return { ok: false, error: 'Такие постройки закончились в коробке.' };
        return { ok: true };
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
        // A player who has troops above the capacity of an area chooses which of
        // them go back to the supply before he does anything else.
        if (type !== 'trimUnit' && (state.trim || []).some(t => t.seat === seat)) {
            return { ok: false, error: 'Сначала уберите отряды сверх вместимости области.' };
        }
        switch (type) {
            case 'placeSystemTile': return this.cmdPlaceSystemTile(state, seat, cmd);
            case 'setupUnit': return this.cmdSetupForce(state, seat, cmd, 'unit');
            case 'setupStructure': return this.cmdSetupForce(state, seat, cmd, 'structure');
            case 'removeSetupForce': return this.cmdRemoveSetupForce(state, seat, cmd);
            case 'finishSetupForces': return this.cmdFinishSetupForces(state, seat);
            case 'setupObjective': return this.cmdSetupObjective(state, seat, cmd);
            case 'setupStorm': return this.cmdSetupStorm(state, seat, cmd);
            case 'placeOrder': return this.cmdPlaceOrder(state, seat, cmd);
            case 'resolveOrder': return this.cmdResolveOrder(state, seat, cmd);
            case 'moveUnits': return this.cmdMoveUnits(state, seat, cmd);
            case 'undoMove': return this.cmdUndoMove(state, seat, cmd);
            case 'endAdvance': return this.cmdEndAdvance(state, seat, cmd);
            case 'buyUnit': return this.cmdBuyUnit(state, seat, cmd);
            case 'buyStructure': return this.cmdBuyStructure(state, seat, cmd);
            case 'buyUpgrade': return this.cmdBuyUpgrade(state, seat, cmd);
            case 'refundUpgrade': return this.cmdRefundUpgrade(state, seat, cmd);
            case 'useUpgrade': return this.cmdUseUpgrade(state, seat, cmd);
            case 'finishDeploy': return this.cmdFinishDeploy(state, seat);
            case 'finishGuardDeploy': return this.cmdFinishGuardDeploy(state, seat);
            case 'deployStructures': return this.cmdDeployStructures(state, seat);
            case 'undoPurchase': return this.cmdUndoPurchase(state, seat, cmd);
            case 'finishStrategize': return this.cmdFinishStrategize(state, seat);
            case 'finishDominate': return this.cmdFinishDominate(state, seat, cmd);
            case 'finishAdvance': return this.cmdFinishAdvance(state, seat);
            case 'orbitalStrike': return this.cmdOrbitalStrike(state, seat, cmd);
            case 'combat': return this.cmdCombat(state, seat, cmd);
            case 'drawEvent': return this.cmdDrawEvent(state, seat, cmd);
            case 'resolveEvent': return this.cmdResolveEvent(state, seat, cmd);
            case 'moveStorm': return this.cmdMoveStorm(state, seat, cmd);
            case 'nextPhase': return this.cmdNextPhase(state, seat, cmd);
            case 'takeProsperity': return this.cmdTakeProsperity(state, seat, cmd);
            case 'startAsset': return this.cmdStartAsset(state, seat, cmd);
            case 'effect': return this.cmdEffect(state, seat, cmd);
            case 'trimUnit': return this.cmdTrimUnit(state, seat, cmd);
            case 'strikeDamage': return this.cmdStrikeDamage(state, seat, cmd);
            case 'rematchBattle': return this.cmdRematchBattle(state, seat);
            default: return { ok: false, error: 'Неизвестная команда: ' + type };
        }
    },

    // --- planning phase ----------------------------------------------------

    // May a player put an order token on this system?
    // The order token may be placed in any system of the board: the player plans
    // the marches of the whole round, so a system he only reaches with the first
    // march still has to take an order.
    canPlaceOrder(state, seat, systemId) {
        const sys = this.system(state, systemId);
        if (!sys) return false;
        if (state.phase !== 'planning') return false;
        const p = state.players[seat];
        if (!p) return false;
        if ((p.placedTokens || 0) >= this.ORDER_TOKENS + (p.extraOrderTokens || 0)) return false;
        // The rule of the planning: the token goes into a system with the troops of
        // the player or into a system next to one of his systems.
        if (this.hasUnitsOrStructures(state, seat, sys.id)) return true;
        return this.neighbors(state, sys.id).some(id => this.hasUnitsOrStructures(state, seat, id));
    },

    // The state of an area for a player, exactly as the rules name it.
    areaState(state, seat, systemId, pos) {
        const mine = this.unitsAt(state, systemId, pos).some(u => u.seat === seat)
            || this.structuresAt(state, systemId, pos).some(x => x.seat === seat);
        const theirs = state.units.some(u => u.system === systemId && u.area === pos && u.seat !== seat)
            || state.structures.some(x => x.system === systemId && x.area === pos && x.seat !== seat);
        if (mine && theirs) return 'contested';
        if (mine) return 'friendly';
        if (theirs) return 'enemy';
        return 'uncontrolled';
    },

    hasUnitsOrStructures(state, seat, systemId) {
        return state.units.some(u => u.seat === seat && u.system === systemId)
            || state.structures.some(s => s.seat === seat && s.system === systemId);
    },

    // How many tokens of this kind the player may still lay: two of every kind.
    orderLeft(state, seat, kind) {
        const p = state.players[seat];
        if (!p) return 0;
        const used = p.placedOf ? (p.placedOf[kind] || 0) : 0;
        return Math.max(0, this.ORDER_SUPPLY - used);
    },

    cmdPlaceOrder(state, seat, cmd) {
        if (state.phase !== 'planning') return { ok: false, error: 'Сейчас не фаза планирования.' };
        if (seat !== state.turn) return { ok: false, error: 'Сейчас очередь другого игрока.' };
        const p = state.players[seat];
        const limit = this.ORDER_TOKENS + (p.extraOrderTokens || 0);
        if ((p.placedTokens || 0) >= limit) return { ok: false, error: 'Все приказы уже выложены.' };
        const sys = this.system(state, cmd.system);
        if (!sys) return { ok: false, error: 'Нет такой системы.' };
        if (!this.canPlaceOrder(state, seat, sys.id)) {
            // Rules Reference, Planning Phase: «A player must place his order token
            // in either a system containing one of his units or structures, or a
            // system adjacent to a system containing one of his units or
            // structures.» — отказ объясняет это же.
            return {
                ok: false,
                error: 'Приказ кладётся только в систему со своими отрядами или постройками '
                    + 'либо в соседнюю с такой системой.',
            };
        }
        const types = ['advance', 'deploy', 'strategize', 'dominate'];
        if (!types.includes(cmd.order)) return { ok: false, error: 'Неизвестный приказ.' };
        if (this.orderLeft(state, seat, cmd.order) <= 0) {
            return { ok: false, error: 'Жетоны этого приказа кончились: их по два.' };
        }
        // The face of the token stays hidden: only the faction is seen until the
        // token is turned over.
        sys.tokens.push({ seat, order: cmd.order, faceUp: false });
        p.placedTokens = (p.placedTokens || 0) + 1;
        p.placedOf = p.placedOf || {};
        p.placedOf[cmd.order] = (p.placedOf[cmd.order] || 0) + 1;
        this.log(state, seat, p.name + ' выложил приказ «' + this.orderName(cmd.order) + '» в систему ' + sys.tile + '.');
        // The players lay their tokens one at a time, in a circle.
        this.checkPlanningDone(state);
        if (state.phase === 'planning') state.turn = this.nextPlanner(state, seat);
        return { ok: true };
    },

    // The next player in the circle who still has tokens in hand.
    nextPlanner(state, from) {
        const n = state.players.length;
        for (let i = 1; i <= n; i++) {
            const seat = (from + i) % n;
            const p = state.players[seat];
            if (!p || p.eliminated) continue;
            const limit = this.ORDER_TOKENS + (p.extraOrderTokens || 0);
            if ((p.placedTokens || 0) < limit) return seat;
        }
        return from;
    },

    orderName(order) {
        return { advance: 'наступление', deploy: 'развёртывание', strategize: 'стратегия', dominate: 'доминирование' }[order] || order;
    },

    checkPlanningDone(state) {
        // A player who has lost every unit and structure no longer resolves any
        // phase of the game (the rules, "Eliminating a Player"): his shed tokens
        // do not hold the planning back.
        const done = state.players.every(p => p.eliminated
            || (p.placedTokens || 0) >= this.ORDER_TOKENS + (p.extraOrderTokens || 0));
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
        if ((state.trim || []).some(t => t.seat === seat)) {
            return { ok: false, error: 'Сначала уберите отряды сверх вместимости области.' };
        }
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
        // Every order starts with a clean sheet: the retreats of a combat look
        // for the areas the attacking units came from, and those are recorded
        // only while this order is being resolved.
        state.moves = [];
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
            // The movement has two steps: the ships first, then the ground units
            // (the rules, "Advance Order"). The roads of each step are frozen when
            // the step begins: a march never opens a longer road for the next unit.
            state.order.moveStep = 'ships';
            state.order.moved = [];
            state.order.route = this.advanceRoutes(state, seat, 'ship');
            return { ok: true };
        }
        if (order === 'deploy') {
            // Two steps: the units first, then the one structure. The materiel is
            // paid at the end of the order (cmdFinishDeploy).
            state.order.phase = 'units';
            state.order.purchases = [];
            state.order.structureBought = false;
            // The card of the Orks lets the structure come before the units.
            if ((p.upgrades || []).some(u => /Строй быстрее/i.test(u.name || ''))) state.order.structureFirst = true;
            this.log(state, seat, p.name + ' может покупать отряды, а затем постройку.');
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
        state.order.gained = gained;
        if (gained.length) {
            this.log(state, seat, p.name + ' получил ресурсы: ' + gained.join(', ') + '.');
        }
        // The faction ability is resolved by the player (it is a card-like text).
        state.order.phase = 'dominate';
        state.order.ability = this.faction(state, seat).ability;
    },

    // The end of an order: the token goes to the play area, the turn passes. The
    // troops over the capacity of their areas are chosen by the player before the
    // next order: the engine only asks.
    finishOrder(state, seat) {
        // A prosperity token that was never exchanged still gives one asset of
        // the player's choice: the engine picks one for him instead of losing
        // it («if he gains a prosperity asset, he gains one asset token of his
        // choice»).
        this.takeProsperityLeft(state, seat);
        // The capacity is checked for every player: a card may have put troops of
        // another player into an area as well.
        for (const p of state.players) this.trimPlayer(state, p.seat);
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
        const moved = order.moved || [];
        const step = order.moveStep === 'ground' ? 'ground' : 'ships';
        const units = state.units.filter(u => {
            if (u.seat !== seat || !from.has(u.system) || u.routed || moved.includes(u.id)) return false;
            const def = this.unitOf(state, u);
            if (!def) return false;
            // The ships move in the first step, the ground units in the second one.
            return step === 'ships' ? def.type === 'ship' : def.type === 'ground';
        });
        // The frozen routes decide: a unit without a road does not count.
        if (order.route) return units.filter(u => order.route[u.id]);
        return units;
    },

    // May this unit move to that area?
    // The geometry of one march: whether this unit may end up in this area of the
    // active system at all. The turn of the movement is checked in canMove.
    moveAllowed(state, seat, unit, target) {
        const order = state.order;
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
            && !(def.type === 'ship' && state.order.shipsThroughStorms)) {
            return { ok: false, error: 'Варп-шторм преграждает путь.' };
        }
        // The movement may go over the capacity of an area, but never above five
        // units: the rules cap the end of the movement at five models.
        const same = this.unitsAt(state, target.system, target.pos).filter(u => u.seat === seat);
        if (same.length + 1 > this.AREA_MAX_UNITS) {
            return { ok: false, error: 'В области не может стоять больше пяти отрядов.' };
        }
        // Ground units need a legal path through the worlds they already hold:
        // a neutral world stops the march. The path is measured from where the
        // unit stood when the movement began — inside the active system too,
        // where the march is not limited to the neighbouring worlds
        // («Ground units on a world adjacent to the destination world always
        // have a legal movement path»).
        if (def.type === 'ground') {
            if (!this.pathExists(state, seat, unit.system, unit.area, target.system, target.pos)) {
                return { ok: false, error: 'Нет законного пути через свои миры до этого мира.' };
            }
        }
        return { ok: true };
    },

    // May the unit march into this area right now? The legal destinations are
    // frozen when the movement starts: a unit that already marched does not get
    // a new, longer reach, and no unit marches twice in one order.
    canMove(state, seat, unit, target) {
        const order = state.order;
        if (!order || order.order !== 'advance') return { ok: false, error: 'Это не приказ наступления.' };
        if (unit.seat !== seat) return { ok: false, error: 'Это не ваш отряд.' };
        if (unit.routed) return { ok: false, error: 'Деморализованный отряд не двигается.' };
        // The step of the movement: the ships first, then the ground units.
        const def0 = this.unitOf(state, unit);
        const step = order.moveStep === 'ground' ? 'ground' : 'ships';
        if (def0 && step === 'ships' && def0.type !== 'ship') {
            return { ok: false, error: 'Сначала двигаются корабли, затем наземные войска.' };
        }
        if (def0 && step === 'ground' && def0.type !== 'ground') {
            return { ok: false, error: 'Корабли уже отлетали: теперь двигаются только наземные войска.' };
        }
        if ((order.moved || []).includes(unit.id)) return { ok: false, error: 'Этот отряд уже сдвинулся в этом приказе.' };
        const route = order.route && order.route[unit.id];
        if (route) {
            const found = route.some(t => t.system === target.system && t.pos === target.pos);
            if (!found) {
                const same = route.length;
                return { ok: false, error: same ? 'Этот мир не был доступен в начале движения.' : 'Этому отряду некуда идти.' };
            }
            return { ok: true };
        }
        return this.moveAllowed(state, seat, unit, target);
    },

    // The worlds every unit of the player may reach — taken once, when the
    // movement of the order begins. Ships and ground troops are counted apart:
    // they march by different rules and stand in different places.
    advanceRoutes(state, seat, kind) {
        const order = state.order;
        const out = {};
        for (const unit of state.units) {
            if (unit.seat !== seat || unit.routed) continue;
            const def = this.unitOf(state, unit);
            if (!def) continue;
            if (kind && def.type !== kind) continue;
            const from = unit.system;
            if (!(from === order.system || this.neighbors(state, order.system).includes(from))) continue;
            const list = [];
            for (const area of this.system(state, order.system).areas) {
                if (this.moveAllowed(state, seat, unit, { system: order.system, pos: area.pos }).ok) {
                    list.push({ system: order.system, pos: area.pos });
                }
            }
            if (list.length) out[unit.id] = list;
        }
        return out;
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
            const fromArea = unit.area;
            const def = this.unitOf(state, unit);
            unit.system = m.system;
            unit.area = m.pos;
            plan.push({ id: unit.id, from, fromArea, type: def ? def.type : 'ground', system: m.system, pos: m.pos });
        }
        // No area may end the movement with more than five of the player's units.
        // A plan entry names its target; a unit that stays put names its own
        // system and area (the board's field is «area», not «pos»).
        const totals = new Map();
        for (const u of state.units) {
            if (u.seat !== seat) continue;
            const p2 = plan.find(m => m.id === u.id);
            const key = p2 ? p2.system + ':' + p2.pos : u.system + ':' + u.area;
            totals.set(key, (totals.get(key) || 0) + 1);
        }
        for (const [, n] of totals) {
            if (n > this.AREA_MAX_UNITS) return { ok: false, error: 'В области не может стоять больше пяти отрядов.' };
        }
        // The ground units may come into the active system from one neighbour only,
        // and a ship that came from a neighbour closes the way for the others. The
        // rule holds for the whole order, not only for one command.
        const ground = plan.filter(m => m.type === 'ground' && m.from !== order.system);
        const ships = plan.filter(m => m.type === 'ship' && m.from !== order.system);
        const ways = order.ways = order.ways || { ground: null, ship: null };
        const froms = new Set();
        for (const m of ground) froms.add(m.from);
        for (const m of ships) froms.add(m.from);
        if (froms.size > 1) {
            return { ok: false, error: 'Наземные отряды могут прийти в активную систему только из одной соседней системы.' };
        }
        if (froms.size === 1) {
            const way = [...froms][0];
            if (ground.length && ways.ground && ways.ground !== way) {
                return { ok: false, error: 'Наземные отряды уже пришли из другой системы.' };
            }
            if (ships.length && ways.ship && ways.ship !== way) {
                return { ok: false, error: 'Корабли уже пришли из другой системы.' };
            }
            if (ground.length && ways.ship && ways.ship !== way) {
                return { ok: false, error: 'Корабли пришли из другой системы: наземные отряды не могут прийти из этой.' };
            }
            if (ships.length && ways.ground && ways.ground !== way) {
                return { ok: false, error: 'Наземные отряды пришли из другой системы: корабли не могут прийти из этой.' };
            }
        }
        // Only one area may become contested during the whole order: the check is
        // done on a copy, before anything is changed in the game.
        const before = new Set(this.contestedAreas(state).map(a => a.system + ':' + a.pos));
        const tempUnits = state.units.map(u => ({ ...u }));
        for (const m of plan) {
            const unit = tempUnits.find(u => u.id === m.id);
            unit.system = m.system;
            unit.area = m.pos;
        }
        const tempState = { ...state, units: tempUnits };
        const fresh = this.contestedAreas(tempState).filter(a => !before.has(a.system + ':' + a.pos));
        if (fresh.length > 1) return { ok: false, error: 'Спорной может стать только одна область.' };
        if (fresh.length === 1) {
            const key = fresh[0].system + ':' + fresh[0].pos;
            if (order.contested && order.contested !== key) {
                return { ok: false, error: 'Спорной может стать только одна область.' };
            }
            order.contested = key;
        }
        // The ways of this command are remembered for the rest of the order.
        if (froms.size === 1) {
            const way = [...froms][0];
            if (ground.length) ways.ground = way;
            if (ships.length) ways.ship = way;
        }
        for (const m of plan) {
            const unit = state.units.find(u => u.id === m.id);
            // The trace of the march: a combat judges the retreats by it.
            this.noteMove(state, seat, unit, m);
            unit.system = m.system;
            unit.area = m.pos;
        }
        // "Крестный ход": the passage through an uncontrolled world is paid for by
        // the unit, not by the area; the ordinary path is tried first.
        if (order.uncontrolled) {
            for (const m of plan) {
                if (!this.pathExists(state, seat, m.from, m.fromArea, m.system, m.pos, { uncontrolled: false })) {
                    order.uncontrolledUsed = (order.uncontrolledUsed || 0) + 1;
                    m.usedUncontrolled = true;
                }
            }
        }
        // The units that marched this time do not march again in the same order.
        order.moved = (order.moved || []).concat(plan.map(m => m.id));
        // The step is remembered: the player may take it back with Esc. Each step
        // knows whose march it was, so the roll-back can return to the step of the
        // order it belongs to (ships or ground units).
        order.steps = order.steps || [];
        const kinds = new Map();
        for (const m of plan) {
            const u = state.units.find(x => x.id === m.id);
            const def = u ? this.unitOf(state, u) : null;
            kinds.set(m.id, def && def.type === 'ship' ? 'ship' : 'ground');
        }
        const stepContested = order.contested || null;
        order.steps.push(plan.map(m => ({
            id: m.id, fromSystem: m.from, fromArea: m.fromArea, usedUncontrolled: !!m.usedUncontrolled,
            kind: kinds.get(m.id) || 'ground', contested: stepContested,
        })));
        return { ok: true };
    },

    // The march of the last step is taken back: the Esc of the player, while the
    // movement of the order is not finished yet.
    cmdUndoMove(state, seat) {
        const order = state.order;
        if (!order || order.order !== 'advance' || order.seat !== seat) return { ok: false, error: 'Нечего отменять.' };
        // The last march may be taken back while the movement runs — and also
        // right after the combat has started: nothing has happened in the battle
        // yet (no reinforcements, no cards, no dice).
        if (order.phase === 'combat') {
            const c = state.combat;
            const fresh = c && c.round === 1 && c.step === 'reinforce-attacker'
                && !c.reinforce.attacker && !c.reinforce.defender
                && !c.cards.attacker.played.length && !c.cards.defender.played.length
                && c.damage.attacker === 0 && c.damage.defender === 0;
            if (!fresh) return { ok: false, error: 'Бой уже начался: отменить движение нельзя.' };
            // The hands go back to the decks and the battle is cancelled.
            for (const side of ['attacker', 'defender']) {
                const combatSeat = c[side];
                const p = state.players[combatSeat];
                p.decks.combat = c.cards[side].hand.concat(p.decks.combat);
            }
            state.combat = null;
            order.phase = 'move';
            order.moveStep = 'ground';
        }
        if (order.phase !== 'move') return { ok: false, error: 'Движение уже закончено.' };
        const steps = order.steps || [];
        const last = steps.pop();
        if (!last) return { ok: false, error: 'Отменять нечего.' };
        for (const m of last.slice().reverse()) {
            const unit = state.units.find(u => u.id === m.id);
            if (!unit) continue;
            unit.system = m.fromSystem;
            unit.area = m.fromArea;
            if (m.usedUncontrolled) order.uncontrolledUsed = Math.max(0, (order.uncontrolledUsed || 0) - 1);
            order.moved = (order.moved || []).filter(id => id !== m.id);
        }
        // The roll-back goes back a step of the order as well: a returned march of
        // the ships puts the player into the first step again, and the roads are
        // measured anew with the ships where they now stand. Without this the
        // player stayed in the second step with a ship that had been put back.
        const kind = last[0] && last[0].kind === 'ship' ? 'ship' : 'ground';
        const area = last.map(m => m.contested).find(Boolean);
        if (area && order.contested === area) order.contested = null;
        if (kind === 'ship') {
            order.moveStep = 'ships';
            order.route = this.advanceRoutes(state, seat, 'ship');
        } else if (order.phase === 'move') {
            order.moveStep = 'ground';
        }
        return { ok: true, undone: last.length, step: kind === 'ship' ? 'ships' : 'ground' };
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
    // The first call closes the march of the ships and opens the march of the
    // ground units; the second one goes on to the combat (the rules say the
    // movement has three steps: ships, ground units, combat).
    cmdEndAdvance(state, seat, cmd) {
        if (state.strike) return { ok: false, error: 'Сначала распределите урон орбитального удара.' };
        const order = state.order;
        if (!order || order.order !== 'advance') return { ok: false, error: 'Это не приказ наступления.' };
        if (order.seat !== seat) return { ok: false, error: 'Сейчас ход другого игрока.' };
        if (order.phase === 'move' && order.moveStep !== 'ground') {
            order.moveStep = 'ground';
            // The roads of the ground units are measured now — after the ships
            // have taken their places, as the rules require.
            order.route = this.advanceRoutes(state, seat, 'ground');
            this.log(state, seat, state.players[seat].name + ': корабли встали, идут наземные войска.');
            return { ok: true, step: 'ground' };
        }
        // The troops stay as they are: a world of one place may hold a whole army,
        // and a battle is fought by every unit that stands there.
        let contested = this.contestedAreas(state);
        // The area that became contested during this order is the one to fight for.
        if (order.contested) {
            const [system, pos] = order.contested.split(':');
            const found = contested.find(a => a.system === system && a.pos === pos);
            if (found) contested = [found];
        }
        if (contested.length === 1) {
            const area = contested[0];
            const mine = state.units.some(u => u.seat === seat && u.system === area.system && u.area === area.pos);
            const their = state.units.find(u => u.seat !== seat && u.system === area.system && u.area === area.pos);
            const defender = their ? their.seat : state.structures.find(s => s.seat !== seat && s.system === area.system && s.area === area.pos).seat;
            order.phase = 'combat';
            this.startCombat(state, seat, defender, area.system, area.pos);
            return { ok: true };
        }
        // No combat. An orbital strike is offered only when it has a target: an
        // enemy world under the friendly ships of the system.
        if (!this.orbitalStrikeTargets(state, seat).length) {
            order.phase = 'done';
            this.finishOrder(state, seat);
            return { ok: true };
        }
        order.phase = 'strike';
        return { ok: true };
    },

    // An orbital strike: the ships of ONE void hit an enemy world of the same
    // system, adjacent to that void. A world with a bastion cannot be hit.
    orbitalStrikeTargets(state, seat) {
        const order = state.order;
        if (!order) return [];
        const sys = this.system(state, order.system);
        if (!sys) return [];
        const out = [];
        for (const from of sys.areas) {
            if (from.world) continue;
            const ships = state.units.filter(u => {
                if (u.seat !== seat || u.system !== order.system || u.area !== from.pos || u.routed) return false;
                const def = this.unitOf(state, u);
                return !!def && def.type === 'ship';
            });
            if (!ships.length) continue;
            // The world must stand next to the void the ships shoot from.
            const near = this.areasAround(state, order.system, from.pos)
                .filter(a => a.system === order.system);
            for (const area of sys.areas) {
                if (!area.world) continue;
                if (!near.some(a => a.pos === area.pos)) continue;
                // Only an enemy world is a target: it holds the troops or the
                // buildings of another player, and none of ours.
                if (this.areaState(state, seat, order.system, area.pos) !== 'enemy') continue;
                // A bastion shields the world — unless the card that grants the
                // strike ignores it («Ужасный удар», «Полное разрушение», ...).
                if (!order.ignoreBastion && this.structuresAt(state, order.system, area.pos).some(st => st.type === 'bastion')) continue;
                out.push({ system: order.system, pos: area.pos, from: from.pos, ships: ships.map(u => u.id) });
            }
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
        const targets = this.orbitalStrikeTargets(state, seat);
        const target = targets.find(t => t.system === cmd.system && t.pos === cmd.pos
            && (cmd.from === undefined || t.from === cmd.from));
        if (!target) return { ok: false, error: 'По этому миру нельзя нанести удар.' };
        // Only the ships of the chosen void take part: the others stay out.
        const ids = (cmd.ships && cmd.ships.length ? cmd.ships : target.ships);
        const ships = ids.map(id => state.units.find(u => u.id === id && target.ships.includes(id))).filter(Boolean);
        if (!ships.length) return { ok: false, error: 'Нужен хотя бы один корабль.' };
        const offence = ships.reduce((n, u) => {
            const def = this.unitOf(state, u);
            return n + (def ? def.combat : 0);
        }, 0);
        const dice = this.rollDice(state, Math.min(offence, this.DICE_MAX));
        const hits = dice.filter(d => d === 'att').length;
        this.log(state, seat, state.players[seat].name + ' наносит орбитальный удар: ' + hits + ' урона.');
        // The damage is assigned by the player who suffers it — his units are the
        // ones that go back to the supply, and the damage that does not destroy a
        // unit is ignored (no routing during a strike).
        const defender = state.players.findIndex(p => p.seat !== seat
            && (state.units.some(u => u.seat === p.seat && u.system === target.system && u.area === target.pos)
                || state.structures.some(s => s.seat === p.seat && s.system === target.system && s.area === target.pos)));
        const victims = state.units.filter(u => u.system === target.system && u.area === target.pos && u.seat !== seat);
        if (hits > 0 && victims.length && defender >= 0) {
            state.strike = { seat: defender, system: target.system, pos: target.pos, left: hits, attacker: seat };
            order.phase = 'strike-damage';
            return { ok: true, pending: true, hits };
        }
        order.phase = 'done';
        this.finishOrder(state, seat);
        return { ok: true, hits };
    },

    // The defender of the strike picks the unit that takes the damage.
    cmdStrikeDamage(state, seat, cmd) {
        const st = state.strike;
        if (!st) return { ok: false, error: 'Сейчас нет орбитального удара.' };
        if (st.seat !== seat) return { ok: false, error: 'Урон распределяет защитник.' };
        const unit = state.units.find(u => u.id === cmd.unit && u.seat === seat && u.system === st.system && u.area === st.pos);
        if (!unit) return { ok: false, error: 'Нет такого отряда.' };
        const def = this.unitOf(state, unit);
        const health = def ? def.health : 1;
        if (st.left >= health) {
            st.left -= health;
            this.destroyUnit(state, unit);
            this.log(state, seat, state.players[seat].name + ' теряет отряд под ударом с орбиты.');
        } else {
            // Not enough damage: it is ignored, the unit is not routed.
            st.left = 0;
        }
        const left = state.units.filter(u => u.seat === seat && u.system === st.system && u.area === st.pos).length;
        if (st.left <= 0 || !left) this.endStrike(state);
        return { ok: true };
    },

    endStrike(state) {
        const st = state.strike;
        state.strike = null;
        const order = state.order;
        if (order) {
            order.phase = 'done';
            this.finishOrder(state, st ? st.attacker : (order.seat));
        }
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
        // «Массовое Производство»: the ability is ONE factory working — the
        // capacity of its own world, doubled factories do not count.
        if (order && order.seat === seat && order.phase === 'guardDeploy' && order.guardFactory) {
            return Math.max(0, this.capacity(state, order.guardFactory.system, order.guardFactory.pos));
        }
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
            // Two factories on one world double the capacity of that world for the
            // deploy limit (the rules, "Factories").
            const factories = structures.filter(s => s.type === 'factory').length;
            limit += this.capacity(state, systemId, area.pos) * Math.max(1, factories);
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
        // The capacity of an area is checked after the order, not at placement:
        // the deploy may exceed capacity (01-rules-reference.md), the destroy
        // happens in the trim window once the order resolves.
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

    // The two steps of the Deploy Order: the units, then the one structure. The
    // old records (phase: 'deploy') mean the first step.
    deployStep(order) {
        return order && order.phase === 'structures' ? 'structures' : 'units';
    },

    // The money of the order is not spent at once: every purchase is a record of
    // the order, and the materiel leaves the dial when the order is finished.
    // order.spent is the sum of the records.
    spentOf(order) {
        return (order.purchases || []).reduce((sum, x) => sum + (x.cost || 0), 0);
    },

    cmdBuyUnit(state, seat, cmd) {
        const order = state.order;
        const isGuard = !!order && order.phase === 'guardDeploy' && order.guardFactory;
        if (!order || (order.order !== 'deploy' && !isGuard) || order.seat !== seat) {
            return { ok: false, error: 'Сейчас нельзя покупать отряды.' };
        }
        // The units are bought only in the first step of the order.
        if (!isGuard && this.deployStep(order) !== 'units') return { ok: false, error: 'Отряды покупаются до постройки.' };
        // The units are bought only in the active system and only with a factory in it —
        // the ability produces only into the chosen factory's world.
        if (cmd.system !== order.system) return { ok: false, error: 'Отряды покупаются в активной системе.' };
        if (!isGuard && !this.hasFactory(state, seat, order.system)) return { ok: false, error: 'В активной системе нет фабрики.' };
        const limit = this.deployLimit(state, seat, order.system);
        if ((order.bought || 0) >= limit) return { ok: false, error: 'Предел развёртывания исчерпан.' };
        const def = this.unitDef(state, seat, cmd.unit);
        if (!def) return { ok: false, error: 'Нет такого отряда.' };
        // «Купите минимум 2 отряда одного типа» — the type is locked by the first
        // purchase; the wrong kind is refused before anything else is checked.
        if (isGuard && order.unitsLocked && def.id !== order.unitsLocked) {
            const locked = this.unitDef(state, seat, order.unitsLocked);
            return { ok: false, error: 'Способность производит только один тип отрядов: «' + (locked ? locked.name : order.unitsLocked) + '».' };
        }
        const p = state.players[seat];
        // The ability: ground units stand in the producing world, ships in the void.
        if (isGuard) {
            if (def.type !== 'ship') {
                if (cmd.system !== order.guardFactory.system || cmd.pos !== order.guardFactory.pos) {
                    return { ok: false, error: 'Отряд ставится в мир, который его производит.' };
                }
            } else {
                const sysObj = this.system(state, cmd.system);
                const pos = sysObj && sysObj.areas.find(a => a.pos === cmd.pos);
                if (!pos || pos.world) return { ok: false, error: 'Корабль выходит в пустоту системы фабрики.' };
            }
        }
        // The order may sell two Guardsmen for one supply token: the second one
        // of the pair costs one cache token instead of materiel.
        const deal = !!(order.supplyDeal
            && FS_EFFECTS.sameName(def.name, order.supplyDeal.unit || 'Гвардец'));
        const pairMate = deal && ((order.dealBought || 0) % 2 === 1);
        if ((p.supply.units[def.id] || 0) <= 0) return { ok: false, error: 'Такого отряда больше нет в запасе.' };
        // A forge token lowers the command level restriction of one unit by one.
        const forgeKl = !!cmd.forgeKl;
        if (forgeKl && (p.assets.forge || 0) < 1) return { ok: false, error: 'Нужен жетон кузницы, чтобы снизить уровень командования.' };
        if (def.kl - (forgeKl ? 1 : 0) > this.commandLevel(state, seat)) {
            return { ok: false, error: 'Не хватает уровня командования.' };
        }
        // The order may allow only one kind of unit.
        if (order.factoryOnly && !FS_EFFECTS.sameName(def.name, order.factoryOnly)) {
            return { ok: false, error: 'Этим приказом можно производить только ' + order.factoryOnly + '.' };
        }
        const place = this.canPlaceUnit(state, seat, cmd.system, cmd.pos, def);
        if (!place.ok) return place;
        // «Они должны быть развернуты в мире, который их произвёл»
        // (the guard ability checks the placement right after the unit is chosen — above)
        if (order.deployInFactoryWorld) {
            if (order.guardFactory) {
                // ground handled above; ships may stand in the void
            } else {
                const factory = this.structuresAt(state, cmd.system, cmd.pos).some(st => st.seat === seat && st.type === 'factory');
                if (!factory) return { ok: false, error: 'Отряд ставится в мир с вашей фабрикой.' };
            }
        }
        let cost = def.cost;
        // The order may make the units cheaper.
        if (order.discount) cost = Math.max(0, cost - order.discount);
        // One cache token lowers the cost of one unit by two materiel. The
        // pair of the faction deal is paid by a cache token in full.
        let cache = !!cmd.cache && !pairMate;
        if (pairMate) {
            if ((p.assets.cache || 0) < 1) return { ok: false, error: 'Для «2 Гвардейца за 1 жетон запасов» нужен жетон тайника.' };
            cost = 0;
            cache = true;
        }
        if (cache && !pairMate && (p.assets.cache || 0) < 1) return { ok: false, error: 'Нет жетона тайника.' };
        if (cache && !pairMate) cost = Math.max(0, cost - 2);
        // The order may sell a unit of command level 0 for 1 materiel.
        if (order.cheapUnit && def.kl === 0) cost = Math.min(cost, order.cheapUnit);
        // The card of the player may make the purchase cheaper.
        if (p.cardDiscount) cost = Math.max(0, cost - p.cardDiscount);
        if (def.forge && (p.assets.forge || 0) < (forgeKl ? 1 : 0) + 1) return { ok: false, error: 'Нужен жетон кузницы.' };
        if (this.spentOf(order) + cost > p.materiel) return { ok: false, error: 'Не хватает материи.' };
        // The tokens are paid at once, the materiel — at the end of the order.
        if (def.forge) p.assets.forge--;
        if (forgeKl) p.assets.forge--;
        if (cache) p.assets.cache--;
        p.supply.units[def.id]--;
        if (deal) order.dealBought = (order.dealBought || 0) + 1;
        const unit = this.addUnit(state, seat, def.id, cmd.system, cmd.pos);
        if (isGuard && !order.unitsLocked) order.unitsLocked = def.id;
        this.log(state, seat, p.name + ' купил отряд «' + def.name + '».');
        order.bought = (order.bought || 0) + 1;
        order.purchases = order.purchases || [];
        order.purchases.push({
            kind: 'unit', id: unit.id, def: def.id, name: def.name, cost,
            forge: !!def.forge, forgeKl, cache,
        });
        return { ok: true };
    },

    cmdBuyStructure(state, seat, cmd) {
        const order = state.order;
        if (!order || order.order !== 'deploy' || order.seat !== seat) {
            return { ok: false, error: 'Сейчас нельзя покупать постройки.' };
        }
        // The structure is bought after the units — the card of the Orks
        // ("Строй быстрее!") allows the other way round.
        if (this.deployStep(order) !== 'structures' && !order.structureFirst) {
            return { ok: false, error: 'Сначала отряды: постройка покупается в конце приказа.' };
        }
        if (order.structureBought) return { ok: false, error: 'За один приказ можно построить только одну постройку.' };
        // cmd.type is the command itself — the kind of the structure is cmd.structure.
        const type = cmd.structure || (cmd.kind && cmd.kind !== 'buyStructure' ? cmd.kind : '');
        if (!['city', 'factory', 'bastion'].includes(type)) return { ok: false, error: 'Неизвестная постройка.' };
        // The structure stands in the active system.
        if (cmd.system !== order.system) return { ok: false, error: 'Постройка ставится в активной системе.' };
        const p = state.players[seat];
        const can = this.canTakeStructure(state, seat, type);
        if (!can.ok) return can;
        const stats = this.structureStats(type);
        // The order may give a structure for free.
        const free = !!(order.freeStructure && order.freeStructureKind === type);
        // One cache token lowers the cost of one structure by two materiel.
        const cache = !!cmd.cache;
        if (cache && (p.assets.cache || 0) < 1) return { ok: false, error: 'Нет жетона тайника.' };
        const cost = free ? 0 : Math.max(0, stats.cost - (cache ? 2 : 0));
        if (this.spentOf(order) + cost > p.materiel) return { ok: false, error: 'Не хватает материи.' };
        const place = this.canPlaceStructure(state, seat, cmd.system, cmd.pos);
        if (!place.ok) return place;
        if (cache) p.assets.cache--;
        const structure = this.addStructure(state, seat, type, cmd.system, cmd.pos);
        this.log(state, seat, p.name + ' построил: ' + this.structureName(type) + '.');
        order.structureBought = true;
        order.purchases = order.purchases || [];
        order.purchases.push({ kind: 'structure', id: structure.id, type, name: this.structureName(type), cost, cache });
        return { ok: true };
    },

    // The right button of the mouse: a purchase of this order is taken back while
    // the order is not finished. Nothing has been paid yet, so nothing is lost.
    cmdUndoPurchase(state, seat, cmd) {
        const order = state.order;
        const isGuard = !!order && order.phase === 'guardDeploy';
        if (!order || (order.order !== 'deploy' && !isGuard) || order.seat !== seat) return { ok: false, error: 'Нечего отменять.' };
        const list = order.purchases || [];
        const p = state.players[seat];
        let entry = null;
        if (cmd && cmd.unit) entry = list.find(x => x.kind === 'unit' && x.id === cmd.unit);
        else if (cmd && cmd.structure) entry = list.find(x => x.kind === 'structure' && x.id === cmd.structure);
        else entry = list[list.length - 1] || null;
        if (!entry) return { ok: false, error: 'В этом приказе ещё ничего не куплено.' };
        if (entry.kind === 'unit') {
            const unit = state.units.find(u => u.id === entry.id);
            if (!unit) return { ok: false, error: 'Этого отряда уже нет на доске.' };
            this.destroyUnit(state, unit);
            if (entry.forge) p.assets.forge++;
            if (entry.forgeKl) p.assets.forge++;
            order.bought = Math.max(0, (order.bought || 0) - 1);
            if (order.supplyDeal && FS_EFFECTS.sameName(entry.name, order.supplyDeal.unit || 'Гвардец')) {
                order.dealBought = Math.max(0, (order.dealBought || 0) - 1);
            }
        } else {
            const structure = state.structures.find(x => x.id === entry.id);
            if (!structure) return { ok: false, error: 'Этой постройки уже нет на доске.' };
            this.destroyStructure(state, structure);
            order.structureBought = false;
        }
        if (entry.cache) p.assets.cache++;
        order.purchases = list.filter(x => x !== entry);
        // «одного типа» — the lock follows what is on the board.
        if (isGuard && !(order.purchases || []).length) order.unitsLocked = null;
        this.log(state, seat, p.name + ' отменил покупку: ' + entry.name + '.');
        return { ok: true, refunded: entry.cost };
    },

    // The end of the first step of the Deploy Order: the structure comes next.
    cmdDeployStructures(state, seat) {
        const order = state.order;
        if (!order || order.order !== 'deploy' || order.seat !== seat) return { ok: false, error: 'Нечего заканчивать.' };
        if (this.deployStep(order) === 'structures') return { ok: true };
        order.phase = 'structures';
        return { ok: true };
    },

    structureName(type) {
        return { city: 'город', factory: 'фабрика', bastion: 'бастион' }[type] || type;
    },

    // End the deploy order: now the materiel of every purchase leaves the dial.
    cmdFinishDeploy(state, seat) {
        const order = state.order;
        if (!order || order.order !== 'deploy' || order.seat !== seat) return { ok: false, error: 'Нечего заканчивать.' };
        const p = state.players[seat];
        const total = this.spentOf(order);
        if (total > p.materiel) return { ok: false, error: 'Не хватает материи.' };
        p.materiel -= total;
        for (const entry of order.purchases || []) {
            if (!entry.cost) continue;
            this.log(state, seat, p.name + ' платит ' + entry.cost + ' материи за «' + entry.name + '».');
        }
        order.phase = 'done';
        this.finishOrder(state, seat);
        return { ok: true, paid: total };
    },

    // The nested production of «Массовое Производство» (the dominate ability of
    // the Imperial Guard): one factory, one type of unit, at least two.
    cmdFinishGuardDeploy(state, seat) {
        const order = state.order;
        if (!order || order.phase !== 'guardDeploy' || order.seat !== seat) {
            return { ok: false, error: 'Сейчас нельзя закончить производство.' };
        }
        const p = state.players[seat];
        const bought = (order.purchases || []).filter(x => x.kind === 'unit');
        // «Купите минимум 2 отряда одного типа» — the type is locked already;
        // the count is checked here, on the way out.
        if (bought.length && bought.length < 2) {
            return { ok: false, error: 'Минимум 2 отряда одного типа (сейчас ' + bought.length + ').' };
        }
        if (new Set(bought.map(x => x.def)).size > 1) {
            return { ok: false, error: 'Отряды одного типа.' };
        }
        const total = this.spentOf(order);
        if (total > p.materiel) return { ok: false, error: 'Не хватает материи.' };
        p.materiel -= total;
        for (const entry of order.purchases || []) {
            if (!entry.cost) continue;
            this.log(state, seat, p.name + ' платит ' + entry.cost + ' материи за «' + entry.name + '».');
        }
        order.phase = 'done';
        this.finishOrder(state, seat);
        return { ok: true, paid: total };
    },

    // The troops over the capacity of an area are never taken away behind the
    // back of the player: the areas are put into state.trim and he chooses which
    // of his units go back to the supply.
    trimArea(state, seat, systemId, pos) {
        const cap = this.capacity(state, systemId, pos);
        const mine = this.unitsAt(state, systemId, pos).filter(u => u.seat === seat);
        if (mine.length <= cap) return;
        state.trim = (state.trim || []).filter(t => !(t.seat === seat && t.system === systemId && t.pos === pos));
        state.trim.push({ seat, system: systemId, pos, cap, count: mine.length });
    },

    // Every area of the player that is over its capacity.
    trimPlayer(state, seat) {
        for (const sys of state.systems) {
            for (const area of sys.areas) this.trimArea(state, seat, sys.id, area.pos);
        }
    },

    // The player returns one unit of his choice to the supply.
    cmdTrimUnit(state, seat, cmd) {
        const list = state.trim || [];
        const entry = list.find(t => t.seat === seat && (cmd.system === undefined || (t.system === cmd.system && t.pos === cmd.pos)));
        if (!entry) return { ok: false, error: 'Сейчас ничего не надо убирать.' };
        const unit = state.units.find(u => u.id === cmd.unit && u.seat === seat && u.system === entry.system && u.area === entry.pos);
        if (!unit) return { ok: false, error: 'Этот отряд стоит не в переполненной области.' };
        this.destroyUnit(state, unit);
        this.log(state, seat, state.players[seat].name + ' отводит отряд сверх вместимости области.');
        const left = this.unitsAt(state, entry.system, entry.pos).filter(u => u.seat === seat).length;
        if (left <= this.capacity(state, entry.system, entry.pos)) state.trim = list.filter(t => t !== entry);
        if (!state.trim || !state.trim.length) state.trim = null;
        return { ok: true, left: Math.max(0, left - this.capacity(state, entry.system, entry.pos)) };
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
            // An upgrade card is unique: the deck cannot hold a second pair of it.
            const ownedCount = p.decks.combat.filter(n => n === card.name).length;
            if (ownedCount >= 2) return { ok: false, error: 'Эта карта улучшения уже есть у вас в колоде.' };
            // Two copies of ONE card of the deck leave it and two copies of the
            // upgrade card come in. The UI always names the pair; the first pair
            // it finds is taken only as a fallback.
            const deck = p.decks.combat;
            const counts = {};
            for (const n of deck) counts[n] = (counts[n] || 0) + 1;
            const wanted = cmd.remove && counts[cmd.remove] >= 2 ? cmd.remove : Object.keys(counts).find(n => counts[n] >= 2);
            if (!wanted) return { ok: false, error: 'В колоде нет двух копий одной карты.' };
            p.materiel -= cost;
            order.upgradesBought = (order.upgradesBought || 0) + 1;
            let taken = 0;
            const kept = [];
            for (const n of deck) {
                if (n === wanted && taken < 2) { taken++; continue; }
                kept.push(n);
            }
            p.decks.combat = this.shuffle(state, kept.concat([card.name, card.name]));
            order.combatUpgrade = true;
            // Kept for the refund: the pair that left the deck, the card that came in.
            order.combatBuy = { card: card.name, removed: [wanted, wanted] };
            this.log(state, seat, p.name + ' купил боевое улучшение «' + card.name + '».');
            return { ok: true };
        }
        if (kind === 'order') {
            if (order.orderUpgrade) return { ok: false, error: 'Улучшение приказа уже куплено.' };
            const card = FS_DATA.orders.find(c => c.faction === p.faction && c.name === cmd.card);
            if (!card) return { ok: false, error: 'Нет такой карты.' };
            if (card.kl > this.commandLevel(state, seat)) return { ok: false, error: 'Не хватает уровня командования.' };
            const cost = Math.max(0, card.cost - (p.cardDiscount || 0));
            if (p.materiel < cost) return { ok: false, error: 'Не хватает материи.' };
            // One copy of each order upgrade per player: already-owned cards are not offered twice.
            if ((p.upgrades || []).some(u => u.name === card.name)) {
                return { ok: false, error: 'Такое улучшение приказа у вас уже есть.' };
            }
            p.materiel -= cost;
            order.upgradesBought = (order.upgradesBought || 0) + 1;
            p.upgrades.push({ name: card.name, used: false, order: card.order });
            order.orderUpgrade = true;
            // Kept for the refund.
            order.orderUpgradeName = card.name;
            this.log(state, seat, p.name + ' купил улучшение приказа «' + card.name + '».');
            return { ok: true };
        }
        return { ok: false, error: 'Неизвестный тип улучшения.' };
    },

    // The player may change his mind about the upgrade of this order: whatever
    // was bought this order comes back exactly as it was — the materiel, the
    // pair of the combat deck, the flags of the order.
    cmdRefundUpgrade(state, seat, cmd) {
        const order = state.order;
        if (!order || order.order !== 'strategize' || order.seat !== seat) {
            return { ok: false, error: 'Отменить можно только улучшения приказа стратегии.' };
        }
        const p = state.players[seat];
        if (cmd.kind === 'combat') {
            const buy = order.combatBuy;
            if (!buy || buy.card !== cmd.card) return { ok: false, error: 'Это улучшение сейчас не куплено.' };
            const card = FS_DATA.combat.find(c => c.faction === p.faction && c.upgrade && c.name === buy.card);
            let taken = 0;
            const kept = [];
            for (const n of p.decks.combat) {
                if (n === buy.card && taken < 2) { taken++; continue; }
                kept.push(n);
            }
            if (taken < 2) return { ok: false, error: 'В колоде нет купленных копий — отмена невозможна.' };
            p.decks.combat = this.shuffle(state, kept.concat(buy.removed));
            p.materiel = (p.materiel || 0) + (card ? Math.max(0, card.cost - (p.cardDiscount || 0)) : 0);
            order.combatUpgrade = false;
            order.combatBuy = null;
            order.upgradesBought = Math.max(0, (order.upgradesBought || 0) - 1);
            this.log(state, seat, p.name + ' отменил покупку боевого улучшения «' + buy.card + '».');
            return { ok: true };
        }
        if (cmd.kind === 'order') {
            const name = order.orderUpgradeName;
            if (!name || name !== cmd.card) return { ok: false, error: 'Это улучшение сейчас не куплено.' };
            const idx = (p.upgrades || []).findIndex(u => u.name === name);
            if (idx < 0) return { ok: false, error: 'Улучшение уже куда-то пропало — отмена невозможна.' };
            const card = FS_DATA.orders.find(c => c.faction === p.faction && c.name === name);
            p.upgrades.splice(idx, 1);
            p.materiel = (p.materiel || 0) + (card ? Math.max(0, card.cost - (p.cardDiscount || 0)) : 0);
            order.orderUpgrade = false;
            order.orderUpgradeName = null;
            order.upgradesBought = Math.max(0, (order.upgradesBought || 0) - 1);
            this.log(state, seat, p.name + ' отменил покупку улучшения приказа «' + name + '».');
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

    // The prosperity tokens nobody exchanged: the player keeps one asset of his
    // choice for each of them. The engine takes the one he holds least of.
    takeProsperityLeft(state, seat) {
        const order = state.order;
        if (!order || !order.prosperity) return;
        const p = state.players[seat];
        while (order.prosperity > 0) {
            const kinds = ['forge', 'cache', 'reinforcement'];
            const limit = k => (p.faction === 'тираниды' && k === 'reinforcement' ? 4 : 3);
            const free = kinds.filter(k => (p.assets[k] || 0) < limit(k));
            if (!free.length) break;    // every asset is at its limit
            free.sort((a, b) => (p.assets[a] || 0) - (p.assets[b] || 0));
            p.assets[free[0]] = (p.assets[free[0]] || 0) + 1;
            order.prosperity--;
            this.log(state, seat, p.name + ' берёт за жетон процветания: ' + this.assetName(free[0]) + '.');
        }
        order.prosperity = 0;
    },

    // The end of the dominate order (after the faction ability).
    cmdFinishDominate(state, seat, cmd = {}) {
        const order = state.order;
        if (!order || order.order !== 'dominate' || order.seat !== seat) return { ok: false, error: 'Нечего заканчивать.' };
        // The ability of the faction: the text is the rule.
        const faction = this.faction(state, seat);
        const text = faction && faction.ability ? faction.ability.text : '';
        const steps = typeof FS_EFFECTS.abilityFor === 'function'
            ? FS_EFFECTS.abilityFor(faction)
            : FS_EFFECTS.parse(text || '', { kind: 'ability', faction: state.players[seat].faction });
        // A faction ability is a permission, not a duty: the player may leave
        // it alone («you may ...»).
        if (steps.length && !cmd.skip) {
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
        // An order upgrade belongs to one order: it is played while that order
        // is being resolved, and by the player who resolved it (the rules,
        // «Order Upgrade Cards»).
        const card0 = FS_DATA.orders.find(c => c.faction === p.faction && c.name === up.name);
        const kind = up.order || (card0 && card0.order) || null;
        if (kind) {
            if (!state.order || state.order.seat !== seat) {
                return { ok: false, error: 'Это улучшение применяется во время приказа.' };
            }
            // An orbital upgrade belongs to the orbital strike of an advance,
            // every other one to the order printed on it (the rules, «Order
            // Upgrade Cards»: the icon of the order is on the card).
            if (kind === 'orbital') {
                if (state.order.phase !== 'strike') {
                    return { ok: false, error: 'Это улучшение применяется во время орбитального удара.' };
                }
            } else if (state.order.order !== kind) {
                return { ok: false, error: 'Это улучшение применяется во время приказа «' + this.orderName(kind) + '».' };
            }
        }
        up.used = true;
        this.log(state, seat, p.name + ' применяет улучшение «' + up.name + '».');
        // The text of the card is the rule: the engine performs it.
        const card = card0;
        const steps = FS_EFFECTS.parse((card && card.text) || '', { kind: 'order' });
        if (steps.length) this.runEffects(state, seat, steps, { kind: 'order', ctx: null });
        return { ok: true, text: up.text || '' };
    },

    // --- the refresh phase --------------------------------------------------

    startRefresh(state) {
        state.phase = 'refresh';
        state.order = null;
        // A new round wipes the marks of the storms: every strip is bright again.
        for (const st of state.storms) st.moved = {};
        // 1. the objective tokens on friendly worlds
        // A collected token leaves the board: it lies on the faction sheet of its
        // owner and is never counted again (the rules, "Objective Tokens" —
        // "During step 1 of each Refresh Phase, each player collects each of his
        // faction's objective tokens that are on worlds he controls").
        const left = [];
        for (const obj of state.objectives) {
            const p = state.players.find(x => x.faction === obj.faction);
            const mine = p && this.control(state, p.seat, obj.system, obj.area) === 'friendly';
            if (!mine) { left.push(obj); continue; }
            p.objectives += 1;
            this.log(state, p.seat, p.name + ' забрал цель с мира ' + (this.area(this.system(state, obj.system), obj.area).world || {}).name + '.');
        }
        state.objectives = left;
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
        if (state.eventsLeft <= 0) {
            // The end of the event phase: the capacity of every area is checked
            // again, and every player chooses his own excess troops.
            for (const p of state.players) this.trimPlayer(state, p.seat);
            this.endRound(state);
            return;
        }
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
        // The storm movement of the card is not a choice — only its ability is.
        // «A player can choose not to resolve the ability on his chosen event
        // card, but must resolve the card's Warp Storm movement icon.»
        const canMove = this.stormOptions(state, seat).length;
        if (canMove && !state.event.stormMoved) {
            return { ok: false, error: 'Сначала сдвиньте варп-шторм по иконке карты.' };
        }
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
        // Every drawn card goes back into the deck — the ones that were not
        // played at least: a scheme that stays in play is excluded (the rules:
        // "he shuffles all event cards back into his event deck, excluding the
        // 'Scheme' event card if it is in play").
        const p = state.players[seat];
        const inPlay = card && card.type === 'scheme' ? card.name : null;
        for (const name of (state.event.drawn || [])) if (name !== inPlay) p.decks.event.push(name);
        if (!(state.event.drawn || []).length && state.event.top) {
            // The card that was opened for the storm only goes back to the deck.
            p.decks.event.push(state.event.top);
        }
        if (card) this.log(state, seat, p.name + ' разыграл(а) карту «' + card.name + '».');
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
        // The event moves exactly one Warp Storm ("The active player chooses one
        // Warp Storm on the game board and moves it").
        if (state.event.stormMoved === true) return { ok: false, error: 'Шторм в эту фазу уже сдвигался.' };
        const storm = state.storms.find(s => s.id === cmd.storm);
        if (!storm) return { ok: false, error: 'Нет такого шторма.' };
        // Each storm moves only once during a refresh phase, whoever moves it.
        if (storm.moved === true) return { ok: false, error: 'Этот шторм уже двигался в этой фазе.' };
        const dir = cmd.dir;
        // Only the moves the card really allows are offered: the direction, the
        // free edge and the limit of one move per storm are all checked here.
        const options = this.stormOptions(state, seat);
        if (!options.some(o => o.storm === storm.id && o.dir === dir)) {
            const card = state.event.card || state.event.top;
            const allowed = card && card.storm && card.storm[0] !== 'any' ? card.storm : ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
            if (!allowed.includes(dir)) return { ok: false, error: 'Карта не разрешает такое направление.' };
            if (storm.moved === true) return { ok: false, error: 'Этот шторм уже двигался в этой фазе.' };
            return { ok: false, error: 'Шторм не может туда пойти.' };
        }
        const target = this.stormTarget(state, storm, dir);
        storm.system = target.system;
        storm.side = target.side;
        storm.moved = true;
        // The card is not resolved before its storm has moved (the rules).
        state.event.stormMoved = true;
        this.log(state, seat, state.players[seat].name + ' сдвинул варп-шторм.');
        return { ok: true };
    },

    // --- the edges of the board -------------------------------------------
    //
    // A storm stands on an edge of the grid, and two records may name the very
    // same edge: the S side of a tile is the N side of the tile below it, and
    // the E side of a tile is the W side of the tile to its right. So the
    // engine keeps every edge in one canonical form and compares those:
    //   H(row, col) — the horizontal edge above the tile (row, col)
    //   V(row, col) — the vertical edge left of the tile (row, col)

    stormEdge(state, ref) {
        const sys = this.system(state, ref.system);
        if (!sys) return null;
        if (ref.side === 'N') return { kind: 'H', row: sys.row, col: sys.col };
        if (ref.side === 'S') return { kind: 'H', row: sys.row + 1, col: sys.col };
        if (ref.side === 'W') return { kind: 'V', row: sys.row, col: sys.col };
        return { kind: 'V', row: sys.row, col: sys.col + 1 };       // E
    },

    // The canonical edge back into a record of the board. An outer edge of the
    // board still belongs to the one tile that touches it.
    edgeRef(state, edge) {
        const here = state.systems.find(s => s.row === edge.row && s.col === edge.col);
        if (edge.kind === 'H') {
            if (here) return { system: here.id, side: 'N' };
            const below = state.systems.find(s => s.row === edge.row - 1 && s.col === edge.col);
            return below ? { system: below.id, side: 'S' } : null;
        }
        if (here) return { system: here.id, side: 'W' };
        const left = state.systems.find(s => s.row === edge.row && s.col === edge.col - 1);
        return left ? { system: left.id, side: 'E' } : null;
    },

    // One name for one edge: two records may name the same edge, and this is
    // what tells them apart.
    gridKey(edge) {
        return edge ? edge.kind + ':' + edge.row + ':' + edge.col : '?';
    },

    edgeKey(state, ref) {
        return this.gridKey(this.stormEdge(state, ref));
    },

    // The storms that may still be moved, with the directions the card allows.
    // The rules: "A player must choose a Warp Storm that he can legally move",
    // "A Warp Storm cannot move onto a border occupied by another Warp Storm"
    // and "A Warp Storm can move to the edge of the game board, but cannot move
    // off the edge of the game board."
    stormOptions(state, seat) {
        const event = state.event || {};
        // The revealed top card (the no-tokens path) must restrict the storm the
        // same way a chosen card does — its directions are looked up by name.
        let card = event.card || null;
        if (!card && event.top) {
            const p = state.players[seat];
            card = FS_DATA.events.find(e => e.name === event.top && (!p || e.faction === p.faction)) || null;
        }
        // "Any" is any of the eight directions of the compass; a card that
        // prints an arrow allows only the directions it shows.
        const all = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
        const dirs = card && card.storm && card.storm[0] !== 'any' ? card.storm : all;
        const out = [];
        for (const storm of state.storms) {
            if (storm.moved === true) continue;
            const taken = this.gridKey(this.stormEdge(state, storm));
            for (const dir of dirs) {
                const target = this.stormTarget(state, storm, dir);
                if (!target) continue;
                const key = this.gridKey(this.stormEdge(state, target));
                if (key === taken) continue;
                if (state.storms.some(o => o !== storm && this.gridKey(this.stormEdge(state, o)) === key)) continue;
                out.push({ storm: storm.id, dir });
            }
        }
        return out;
    },

    // Where does a storm go when it moves in a direction? The eight directions
    // of the compass: the four straight ones slide the storm along the grid or
    // turn it around a corner of its own tile, the four diagonal ones do the
    // slide and the turn together.
    stormTarget(state, storm, dir) {
        const edge = this.stormEdge(state, storm);
        if (!edge) return null;
        let next = null;
        if (edge.kind === 'H') {
            if (dir === 'N') next = { kind: 'H', row: edge.row - 1, col: edge.col };
            else if (dir === 'S') next = { kind: 'H', row: edge.row + 1, col: edge.col };
            else if (dir === 'E') next = { kind: 'V', row: edge.row, col: edge.col + 1 };
            else if (dir === 'W') next = { kind: 'V', row: edge.row, col: edge.col };
            else {
                const dr = dir[0] === 'N' ? -1 : 1;
                next = { kind: 'V', row: edge.row + dr, col: edge.col + (dir[1] === 'E' ? 1 : 0) };
            }
        } else {
            if (dir === 'E') next = { kind: 'V', row: edge.row, col: edge.col + 1 };
            else if (dir === 'W') next = { kind: 'V', row: edge.row, col: edge.col - 1 };
            else if (dir === 'N') next = { kind: 'H', row: edge.row, col: edge.col };
            else if (dir === 'S') next = { kind: 'H', row: edge.row + 1, col: edge.col };
            else {
                const dc = dir[1] === 'E' ? 1 : -1;
                next = { kind: 'H', row: edge.row + (dir[0] === 'S' ? 1 : 0), col: edge.col + dc };
            }
        }
        // Off the board there is no edge to stand on.
        if (!this.edgeRef(state, next)) return null;
        return this.edgeRef(state, next);
    },

    endRound(state) {
        // The end of the round: the first player token passes, the marker moves.
        state.firstPlayer = (state.firstPlayer + 1) % state.players.length;
        state.round++;
        for (const p of state.players) {
            p.placedTokens = 0;
            p.placedOf = {};
            for (const u of p.upgrades) u.used = false;
        }
        for (const s of state.storms) s.moved = false;
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
        // The victory conditions: the objectives needed do not shrink when a
        // player is eliminated (the rules).
        const needed = state.players.length;
        const winners = alive.filter(p => p.objectives >= needed);
        if (winners.length) {
            state.over = true;
            winners.sort((a, b) => b.objectives - a.objectives);
            state.winner = winners[0].seat;
            if (winners.length > 1 && winners[0].objectives === winners[1].objectives) {
                state.shared = winners.filter(p => p.objectives === winners[0].objectives).map(p => p.seat);
            }
            this.log(state, -1, 'Игра закончена. Побеждает ' + winners[0].name + '.');
            return;
        }
        if (state.round > this.ROUNDS) {
            state.over = true;
            const best = alive.slice().sort((a, b) => (b.objectives - a.objectives)
                || (this.friendlyWorlds(state, b.seat) - this.friendlyWorlds(state, a.seat))
                || (this.unitsOf(state, b.seat) - this.unitsOf(state, a.seat)));
            state.winner = best[0].seat;
            // The tie-breaks of the rules: objectives, friendly worlds, units, and
            // only then a shared victory.
            const same = (a, b) => a.objectives === b.objectives
                && this.friendlyWorlds(state, a.seat) === this.friendlyWorlds(state, b.seat)
                && this.unitsOf(state, a.seat) === this.unitsOf(state, b.seat);
            const shared = best.filter(p => same(p, best[0]));
            if (shared.length > 1) {
                state.shared = shared.map(p => p.seat);
                this.log(state, -1, 'Восьмой раунд закончен. Победа делится между ' + shared.map(p => p.name).join(' и ') + '.');
                return;
            }
            this.log(state, -1, 'Восьмой раунд закончен. Побеждает ' + best[0].name + '.');
            return;
        }
        state.phase = 'planning';
        // The first player may be out of the game: the planning starts with the
        // first player who still has tokens in hand.
        state.turn = state.players[state.firstPlayer] && state.players[state.firstPlayer].eliminated
            ? this.nextPlanner(state, state.firstPlayer - 1 < 0 ? state.players.length - 1 : state.firstPlayer - 1)
            : state.firstPlayer;
        this.log(state, -1, 'Раунд ' + state.round + ': фаза планирования.');
    },

    // The friendly worlds and the units of a player: the tie-breaks of the rules.
    friendlyWorlds(state, seat) {
        let n = 0;
        for (const sys of state.systems) {
            for (const area of sys.areas) {
                if (area.world && this.control(state, seat, sys.id, area.pos) === 'friendly') n++;
            }
        }
        return n;
    },

    unitsOf(state, seat) {
        return state.units.filter(u => u.seat === seat).length;
    },

    cmdNextPhase(state, seat) {
        if (state.phase !== 'refresh') return { ok: false, error: 'Сейчас не фаза обновления.' };
        if (state.eventsLeft > 0) return { ok: false, error: 'Сначала разыграйте события.' };
        this.endRound(state);
        return { ok: true };
    },

    // -----------------------------------------------------------------------
    //  The effects of the cards
    // -----------------------------------------------------------------------

    // The steps of a card: the text of the card is the rule. The ability of
    // the unit works only if the unit is in the combat.
    cardSteps(state, seat, card) {
        if (!card) return [];
        // The faction is needed by the text: a card may name a unit of the deck.
        const faction = (state.players[seat] || {}).faction;
        const steps = FS_EFFECTS.parse(card.general || '', { kind: 'combat', faction });
        if (card.unit) {
            const combat = state.combat;
            const reqs = card.reqs || [];
            // «A unit used to meet this requisite must be unrouted.»
            const there = combat && state.units.some(u => {
                if (u.seat !== seat || u.routed || u.system !== combat.system || u.area !== combat.pos) return false;
                const def = this.unitOf(state, u);
                return def && reqs.some(r => FS_EFFECTS.sameName(def.name, r));
            });
            if (there) steps.push(...FS_EFFECTS.parse(card.unit, { kind: 'combat', faction, reqs }));
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

    // The die of the game has six faces: two of attack, two of defence and two
    // of morale — a blank face never comes up.
    rollDice(state, n) {
        const out = [];
        for (let i = 0; i < n; i++) {
            out.push(['att', 'def', 'morale'][this.rand(state, 3)]);
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
        // A bastion fights with its printed values, as if it were a unit.
        for (const st of this.structuresAt(state, systemId, pos)) {
            if (st.seat === seat && st.type === 'bastion') sum += this.structureStats('bastion').combat;
        }
        return sum;
    },

    // The winner of a combat takes the structures of the loser: the rules give
    // them to the attacker only, and only the bastions and buildings of the
    // defender that still stand in the area.
    captureStructures(state, systemId, pos, winner, loser) {
        const taken = [];
        const p = state.players[winner];
        for (const st of this.structuresAt(state, systemId, pos)) {
            if (st.seat !== loser) continue;
            // A structure without a free control token of the winner is destroyed
            // at once: the components are limited (the rules, "Component Limitations").
            if (this.structureTokensLeft(state, winner) <= 0) {
                state.structures = state.structures.filter(x => x !== st);
                this.log(state, winner, state.players[winner].name + ': жетона контроля нет, постройка уничтожена.');
                continue;
            }
            st.seat = winner;
            taken.push(st);
        }
        return taken;
    },

    startCombat(state, attacker, defender, systemId, pos) {
        // The defender without a single unrouted unit or bastion loses at once:
        // the preparation and the execution are skipped (the rules, "Combat").
        const ready = state.units.some(u => u.seat === defender && u.system === systemId && u.area === pos && !u.routed)
            || state.structures.some(x => x.seat === defender && x.system === systemId && x.area === pos && x.type === 'bastion');
        if (!ready) {
            this.log(state, attacker, 'Защищать область некому: ' + state.players[attacker].name + ' побеждает сразу.');
            this.captureStructures(state, systemId, pos, attacker, defender);
            state.combat = null;
            if (state.testBattle) { state.order = null; return null; }
            const order = state.order;
            if (order) order.phase = 'done';
            this.finishOrder(state, attacker);
            return null;
        }
        const roll = seat => {
            const n = Math.min(this.combatValue(state, seat, systemId, pos), this.DICE_MAX);
            return this.rollDice(state, n);
        };
        // Where the attacking units came from: the retreats are judged by it,
        // and only the movement of this order counts.
        const origins = this.attackerOrigins(state, systemId, pos, attacker);
        const viaAdvance = !!(state.order && state.order.order === 'advance' && origins.length);
        const combat = {
            system: systemId,
            pos,
            attacker,
            defender,
            attackerFrom: origins,
            viaAdvance,
            round: 1,
            step: 'reinforce-attacker',
            dice: { attacker: roll(attacker), defender: roll(defender) },
            tokens: { attacker: { att: 0, def: 0 }, defender: { att: 0, def: 0 } },
            cards: { attacker: { hand: [], played: [] }, defender: { hand: [], played: [] } },
            reinforce: { attacker: 0, defender: 0 },
            reinforceRouted: { attacker: 0, defender: 0 },
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
            // A short deck (a battle test with a few chosen cards) deals what it has.
            for (let i = 0; i < 5 + extra; i++) {
                const card = p.decks.combat.shift();
                if (card) hand.push(card);
            }
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

    // The troops and bastions of a side that still stand in the contested area.
    // The reinforcement tokens stand there too: each is a command level zero
    // unit for every rule — a routed one is flipped to its routed side.
    pieces(state, c, side) {
        const seat = side === 'attacker' ? c.attacker : c.defender;
        const units = state.units.filter(u => u.seat === seat && u.system === c.system && u.area === c.pos);
        const bastions = state.structures.filter(s => s.seat === seat && s.system === c.system && s.area === c.pos && s.type === 'bastion');
        const t = this.tokenUnits(state, side);
        const tokens = [];
        for (let i = 0; i < t.used; i++) {
            tokens.push({ id: 'reinforce-' + side + '-' + i, kind: 'token', routed: i < t.routed });
        }
        return units.concat(bastions, tokens);
    },

    // The CL0 unit of a faction — the miniature a reinforcement token is
    // treated as (the rules, "Reinforcement Tokens"): ground on a world,
    // ship in the void.
    reinforceUnitDef(factionId, type) {
        const f = this.factionById(factionId);
        if (!f) return null;
        return f.units.find(u => u.kl === 0 && u.type === (type || 'ground'))
            || f.units.find(u => u.kl === 0)
            || null;
    },

    // The reinforcement tokens of a side in the combat as the rules see them:
    // used in total, routed (flipped) ones, and the ones still counting as
    // units. The only thing a token does not do is contribute dice.
    tokenUnits(state, side) {
        const c = state.combat;
        const used = (c && c.reinforce && c.reinforce[side]) || 0;
        const routed = (c && c.reinforceRouted && c.reinforceRouted[side]) || 0;
        return { used, routed, alive: Math.max(0, used - routed) };
    },

    // The units and bastions that may still be assigned damage: the unrouted
    // troops and the bastions; the routed ones only when nothing else is left.
    canTakeDamage(state, c, side) {
        const items = this.pieces(state, c, side);
        const ready = items.filter(x => x.type ? x.type === 'bastion' : !x.routed);
        return ready.length ? ready : items;
    },

    // A unit that changes area leaves a trace: a combat needs to know where the
    // attacking units came from, and the rules judge the retreats by it.
    noteMove(state, seat, unit, dest) {
        if (!unit) return;
        if (!state.moves) state.moves = [];
        state.moves.push({
            seat,
            from: { system: unit.system, pos: unit.area },
            to: { system: dest.system !== undefined ? dest.system : unit.system, pos: dest.pos !== undefined ? dest.pos : unit.area },
        });
    },

    // The areas the attacking units of this combat came from.
    attackerOrigins(state, systemId, pos, seat) {
        const out = [];
        const push = ref => {
            if (!ref) return;
            if (!out.some(x => x.system === ref.system && x.pos === ref.pos)) out.push({ system: ref.system, pos: ref.pos });
        };
        for (const step of ((state.order && state.order.steps) || [])) {
            for (const m of step) {
                // A step of the march knows the area it contested: only the
                // troops that walked into this very area count here.
                const dest = m.contested || (state.order && state.order.contested) || '';
                const [sid, areaPos] = dest.split(':');
                if (sid !== systemId || areaPos !== pos) continue;
                push({ system: m.fromSystem, pos: m.fromArea });
            }
        }
        for (const m of (state.moves || [])) {
            if (m.seat !== seat) continue;
            if (m.to.system !== systemId || m.to.pos !== pos) continue;
            push(m.from);
        }
        return out;
    },

    // The morale the reinforcement tokens of a side bring into the combat.
    // Each unrouted token stands for the CL0 miniature of its owner: a land
    // unit on a world, a ship in the void. That miniature has a morale of its
    // own — the Necrons' is 0, the Sisters' is 3.
    tokenMorale(state, side) {
        const c = state.combat;
        if (!c) return 0;
        const seat = side === 'attacker' ? c.attacker : c.defender;
        const area = this.area(this.system(state, c.system), c.pos);
        const type = area && area.world ? 'ground' : 'ship';
        const def = this.reinforceUnitDef(state.players[seat].faction, type);
        return this.tokenUnits(state, side).alive * (def ? def.morale : 0);
    },

    // The number of reinforcement tokens a player may use in the combat: no more
    // than the plastic units he has there (the bastion is not a unit).
    maxReinforce(state, seat, side) {
        const c = state.combat;
        const units = state.units.filter(u => u.seat === seat && u.system === c.system && u.area === c.pos);
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
        else { c.step = 'choose-attacker'; this.advanceCombatSteps(state); }
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

    // A card is chosen, not played: both players choose first, then the cards are
    // turned over — the attacker's card, then the defender's.
    combatPlayCard(state, seat, side, cmd) {
        const c = state.combat;
        const hand = c.cards[side];
        const index = Number(cmd.index);
        if (!(index >= 0 && index < hand.hand.length)) return { ok: false, error: 'Нет такой карты.' };
        // The card is taken out of the hand and laid face down on the table.
        const name = hand.hand.splice(index, 1)[0];
        const card = FS_DATA.combat.find(x => x.faction === state.players[seat].faction && x.name === name);
        c.staged = c.staged || { attacker: null, defender: null };
        c.staged[side] = { name, card, seat };
        hand.chosen = { name, card };
        this.log(state, seat, state.players[seat].name + ' выбирает боевую карту и кладёт её закрытой.');
        if (side === 'attacker') c.step = 'choose-defender';
        else c.step = 'reveal';
        this.advanceCombatSteps(state);
        return { ok: true, card: card || null, staged: true };
    },

    // The turn-over of the chosen cards: the attacker's card first, then the
    // defender's. The steps of a card are performed where it is turned over.
    combatReveal(state) {
        const c = state.combat;
        if (!c || c.step !== 'reveal') return null;
        c.staged = c.staged || { attacker: null, defender: null };
        // The first card that was chosen and is not yet in play.
        const order = ['attacker', 'defender'];
        for (const side of order) {
            const staged = c.staged[side];
            if (staged) {
                c.staged[side] = null;
                const hand = c.cards[side];
                hand.chosen = null;
                hand.played.push({ name: staged.name, card: staged.card, side, round: c.round });
                this.log(state, staged.seat, state.players[staged.seat].name
                    + ' вскрывает боевую карту «' + staged.name + '».');
                const steps = this.cardSteps(state, staged.seat, staged.card);
                if (steps.length) {
                    c.nextStep = 'reveal';
                    c.step = 'effect';
                    // «A player can choose not to resolve one of his abilities»:
                    // the owner of the card decides about each of them.
                    this.runEffects(state, staged.seat, steps, { kind: 'combat', ctx: { side }, optional: true });
                    return c.step;
                }
                return c.step;
            }
        }
        // Both cards are open: the damage of the round comes next.
        c.step = 'damage-attacker';
        this.advanceCombatSteps(state);
        return c.step;
    },

    // A card is never skipped: the hand of the combat is played. The step passes
    // only when the hand is empty — and the engine does that by itself.
    combatSkipCard(state, seat, side) {
        void state; void seat; void side;
        return { ok: false, error: 'Боевую карту нельзя пропустить.' };
    },

    // The steps with nothing to do pass by themselves: an empty hand is not played
    // and a damage of zero is not assigned — the player is never asked about either.
    advanceCombatSteps(state) {
        const c = state.combat;
        if (!c) return null;
        for (let i = 0; i < 12; i++) {
            const before = c.step;
            // The reinforcement is asked only from the player who has the tokens.
            if (c.step === 'reinforce-attacker' && this.maxReinforce(state, c.attacker, 'attacker') <= 0) {
                c.step = 'reinforce-defender';
            }
            if (c.step === 'reinforce-defender' && this.maxReinforce(state, c.defender, 'defender') <= 0) {
                c.step = 'choose-attacker';
            }
            if (c.step === 'choose-attacker' && !(c.cards.attacker.hand || []).length) c.step = 'choose-defender';
            if (c.step === 'choose-defender' && !(c.cards.defender.hand || []).length) {
                c.step = c.staged && c.staged.attacker ? 'reveal' : 'damage-attacker';
            }
            if (c.step === 'reveal') { this.combatReveal(state); if (!state.combat) return null; }
            if (c.step === 'damage-attacker' && this.combatDamageFor(state, 'attacker') <= 0) {
                c.damage.attacker = 0;
                c.applied = c.applied || {};
                c.applied.attacker = [];
                c.step = 'damage-defender';
            }
            if (c.step === 'damage-defender' && this.combatDamageFor(state, 'defender') <= 0) {
                c.damage.defender = 0;
                c.applied = c.applied || {};
                c.applied.defender = [];
                this.endDamageStep(state);
                if (!state.combat) return null;
            }
            if (c.step === before) break;
        }
        return c.step;
    },

    // The old name of the same step machine.
    skipEmptyChoose(state) {
        return this.advanceCombatSteps(state);
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

    // The same values, split by where they come from: dice, combat tokens and
    // the faceup combat cards — the panel shows every line as a sum.
    combatValuesParts(state, side) {
        const c = state.combat;
        let dice = c.dice[side] || [];
        if (c.ignoreFoeAtt && side === 'defender') dice = dice.filter(d => d !== 'att');
        const tokens = c.tokens[side];
        const played = c.cards[side].played;
        const parts = {
            att: { dice: 0, tokens: tokens.att || 0, cards: 0, total: 0 },
            def: { dice: 0, tokens: tokens.def || 0, cards: 0, total: 0 },
            morale: { dice: 0, tokens: 0, cards: 0, total: 0 },
        };
        for (const d of dice) if (parts[d]) parts[d].dice++;
        for (const card of played) {
            if (!card.card || !card.card.icons) continue;
            for (const kind of ['att', 'def', 'morale']) parts[kind].cards += card.card.icons[kind] || 0;
        }
        for (const kind of ['att', 'def', 'morale']) {
            parts[kind].total = parts[kind].dice + parts[kind].tokens + parts[kind].cards;
        }
        return parts;
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

    // The damage a player has to place on his own pieces, as a plan: the same
    // arithmetic the rules use, without touching the game. The panel shows it
    // while the player picks the pieces with the mouse.
    damagePreview(state, side, targets) {
        const c = state.combat;
        const seat = side === 'attacker' ? c.attacker : c.defender;
        const damage = this.combatDamageFor(state, side);
        const oneByOne = !!(c.damageOneByOne && side === 'defender');
        const rows = [];
        let left = damage;
        for (const id of targets || []) {
            if (left <= 0) break;
            if (typeof id === 'string' && id.startsWith('reinforce-')) {
                // One point of damage flips the reinforcement token to its
                // routed side: it is routed, not destroyed.
                left -= 1;
                const sideTok = id.split('-')[1];
                c.reinforceRouted = c.reinforceRouted || { attacker: 0, defender: 0 };
                c.reinforceRouted[sideTok] = (c.reinforceRouted[sideTok] || 0) + 1;
                rows.push({ id, name: 'Подкрепление', health: 1, take: 1, destroyed: false, routed: true, token: true });
                continue;
            }
            const unit = state.units.find(u => u.id === id);
            if (unit) {
                const def = this.unitOf(state, unit);
                let health = def ? def.health : 1;
                if (c.healthBonus && unit.seat === seat) health += c.healthBonus;
                if (c.enemyHealth && unit.seat !== seat) health = Math.min(health, c.enemyHealth);
                const take = oneByOne ? 1 : Math.min(left, health);
                const destroyed = oneByOne ? health <= 1 : left >= health;
                left -= take;
                rows.push({ id: unit.id, name: def ? def.name : unit.id, health, take, destroyed, routed: destroyed ? !!unit.routed : !destroyed });
                continue;
            }
            const bastion = state.structures.find(st => st.id === id);
            if (bastion) {
                const health = this.structureStats(bastion.type).health;
                const take = Math.min(left, health);
                const destroyed = left >= health;
                left -= take;
                rows.push({ id: bastion.id, name: this.structureStats(bastion.type).name || bastion.type, health, take, destroyed, bastion: true });
            }
        }
        return { damage, placed: damage - left, left: Math.max(0, left), rows, oneByOne };
    },

    // The pieces that may take the damage of this side: the troops and the
    // bastions of the contested area that are still standing.
    damageCandidates(state, side) {
        const c = state.combat;
        const seat = side === 'attacker' ? c.attacker : c.defender;
        const out = [];
        for (const u of state.units) {
            if (u.seat !== seat || u.system !== c.system || u.area !== c.pos) continue;
            const def = this.unitOf(state, u);
            if (!def) continue;
            out.push({ id: u.id, name: def.name, health: def.health, morale: def.morale, routed: !!u.routed, kind: 'unit' });
        }
        // Only a bastion has a health value: a city or a factory takes no damage.
        for (const s of state.structures) {
            if (s.seat !== seat || s.system !== c.system || s.area !== c.pos || s.type !== 'bastion') continue;
            const st = this.structureStats('bastion');
            out.push({ id: s.id, name: st.name || 'bastion', health: st.health, morale: st.morale || 0, routed: false, kind: 'structure' });
        }
        // A reinforcement token is treated like a plastic unit for all rules and
        // game effects: it has the health and the morale of the command level
        // zero miniature it stands for. A routed token is flipped to its routed
        // side, not destroyed.
        const t = this.tokenUnits(state, side);
        const area0 = this.area(this.system(state, c.system), c.pos);
        const type0 = area0 && area0.world ? 'ground' : 'ship';
        const def0 = this.reinforceUnitDef(state.players[seat].faction, type0);
        for (let i = 0; i < t.used; i++) {
            out.push({
                id: 'reinforce-' + side + '-' + i, name: def0 ? def0.name : 'Подкрепление',
                health: def0 ? def0.health : 1, morale: def0 ? def0.morale : 0,
                routed: i < t.routed, kind: 'token',
            });
        }
        // A routed unit can take damage only when the side has nothing else.
        const allowed = new Set(this.canTakeDamage(state, c, side).map(x => x.id));
        return out.filter(x => allowed.has(x.id));
    },

    // The player assigns the damage to his own units and bastions.
    combatDamage(state, seat, side, cmd) {
        const c = state.combat;
        const damage = this.combatDamageFor(state, side);
        // No real damage — no question and no assignment: the shields did the work.
        if (damage <= 0) {
            c.damage[side] = 0;
            c.applied = c.applied || {};
            c.applied[side] = [];
            if (side === 'attacker') { c.step = 'damage-defender'; this.advanceCombatSteps(state); }
            else { this.endDamageStep(state); this.advanceCombatSteps(state); }
            return { ok: true, damage: 0, applied: [] };
        }
        // The schemes of the damage step are used before the damage.
        c.damageHook = c.damageHook || {};
        if (!c.damageHook[side]) {
            c.damageHook[side] = true;
            if (this.maybeScheme(state, seat, 'damage', { kind: 'combat', ctx: { side } })) return { ok: true, pending: true };
        }
        // Only the pieces the rules allow may be chosen: an unrouted unit, a
        // bastion — or a routed unit when the side has nothing else left.
        const able = new Set(this.canTakeDamage(state, c, side).map(x => x.id));
        for (const id of (cmd.targets || [])) {
            if (!able.has(id)) return { ok: false, error: 'Этот отряд не может получить урон.' };
        }
        c.damage[side] = damage;
        // The card may make the damage go one point at a time.
        const oneByOne = !!(c.damageOneByOne && side === 'defender');
        const targets = cmd.targets || [];
        // The damage is applied to the chosen units in order.
        let left = damage;
        const applied = [];
        for (const id of targets) {
            if (left <= 0) break;
            if (typeof id === 'string' && id.startsWith('reinforce-')) {
                // The token is a unit: the damage routes it (flips it to its
                // routed side) instead of destroying it.
                left -= 1;
                const sideTok = id.split('-')[1];
                c.reinforceRouted = c.reinforceRouted || { attacker: 0, defender: 0 };
                c.reinforceRouted[sideTok] = (c.reinforceRouted[sideTok] || 0) + 1;
                applied.push({ token: id, routed: true });
                continue;
            }
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
            const bastion = state.structures.find(s => s.id === id && s.type === 'bastion');
            if (bastion) {
                const health = this.structureStats('bastion').health;
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
        if (side === 'attacker') { c.step = 'damage-defender'; this.advanceCombatSteps(state); }
        else { this.endDamageStep(state); this.advanceCombatSteps(state); }
        return { ok: true, damage, applied };
    },

    // The end of the damage step of the defender. Usually it ends the
    // execution round, but a card may repeat the damage step:
    // «repeat the damage step during this round of combat (the opponent also
    // deals damage)» (Бронекулак).
    endDamageStep(state) {
        const c = state.combat;
        if (!c) return;
        if (c.repeatDamage && !c.damageRepeated) {
            c.damageRepeated = true;
            c.damageHook = {};
            c.damage = { attacker: 0, defender: 0 };
            c.applied = {};
            c.step = 'damage-attacker';
            this.log(state, -1, 'Шаг нанесения повреждений повторяется.');
            return;
        }
        this.endCombatRound(state);
    },

    // The end of an execution round: the third one ends the combat.
    endCombatRound(state) {
        const c = state.combat;
        // The combat tokens go back to the supply at the end of every execution
        // round: only the dice and the cards are counted again. A card may keep
        // the defence tokens of its player («Шустрое судно»).
        const keep = c.keepTokens || {};
        c.tokens = {
            attacker: { att: 0, def: keep.attacker ? (c.tokens.attacker.def || 0) : 0 },
            defender: { att: 0, def: keep.defender ? (c.tokens.defender.def || 0) : 0 },
        };
        // The card may destroy the units that became routed.
        if (c.destroyRouted) {
            for (const u of state.units.slice()) {
                if (u.routed && u.system === c.system && u.area === c.pos) {
                    this.log(state, c.attacker, 'Деморализованный отряд уничтожен.');
                    this.destroyUnit(state, u);
                }
            }
        }
        // The side without a single unit or bastion left loses the combat: the
        // rest of the execution round is over and the resolution begins.
        if (!this.pieces(state, c, 'attacker').length || !this.pieces(state, c, 'defender').length) {
            this.finishCombat(state, true);
            return;
        }
        c.round++;
        if (c.round > (c.maxRounds || 3)) { this.finishCombat(state); return; }
        c.staged = { attacker: null, defender: null };
        for (const side of ['attacker', 'defender']) c.cards[side].chosen = null;
        c.step = 'choose-attacker';
        this.advanceCombatSteps(state);
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
        // A reinforcement token used in the combat is a command level zero
        // unit: it gives no dice, but while it is not routed it counts as a
        // unit — so it brings the morale of that miniature, not a flat 1.
        morale += this.tokenMorale(state, side);
        for (const s of this.structuresAt(state, c.system, c.pos)) {
            if (s.seat !== seat) continue;
            morale += this.structureStats(s.type).morale;
        }
        return morale;
    },

    // The end of the combat: the winner by morale, the retreat, the cleanup.
    finishCombat(state, wiped = false) {
        const c = state.combat;
        const attMorale = this.combatMorale(state, 'attacker');
        const defMorale = this.combatMorale(state, 'defender');
        // A tie goes to the defender; a side whose troops are all gone loses
        // without any morale count.
        let attackerWins;
        if (wiped) {
            const attLeft = this.pieces(state, c, 'attacker').length;
            const defLeft = this.pieces(state, c, 'defender').length;
            attackerWins = attLeft > 0 && defLeft === 0;
        } else {
            attackerWins = attMorale > defMorale;
        }
        c.winner = attackerWins ? 'attacker' : 'defender';
        c.morale = { attacker: attMorale, defender: defMorale };
        const loser = attackerWins ? c.defender : c.attacker;
        const winner = attackerWins ? c.attacker : c.defender;
        this.log(state, winner, 'Бой ' + (wiped ? 'закончен' : 'выигран') + ': мораль '
            + (attackerWins ? attMorale : defMorale) + ' против ' + (attackerWins ? defMorale : attMorale) + '.');
        // Only the attacker takes the structures of the world (the rules).
        if (attackerWins) this.captureStructures(state, c.system, c.pos, c.attacker, c.defender);
        c.loser = loser;
        c.step = 'retreat';
        // A player whose troops all died has nothing to retreat: the combat ends
        // without asking where the dead should go.
        const noTroops = !state.units.some(u => u.seat === loser && u.system === c.system && u.area === c.pos);
        // The schemes of the end of the combat.
        this.maybeScheme(state, winner, 'combat-end', { kind: 'combat', ctx: { side: winner === c.attacker ? 'attacker' : 'defender' } });
        // The combat cards go back into the deck, the reinforcement tokens too.
        for (const side of ['attacker', 'defender']) {
            const seat = side === 'attacker' ? c.attacker : c.defender;
            const p = state.players[seat];
            // Both the cards that were played and the cards that stayed in the hand
            // go back into the deck: a combat deals five cards and returns five.
            // «discards the combat cards he used during the combat by shuffling
            // them back into his combat deck». A card that was only chosen and
            // never turned over (the combat ended in between) is returned too.
            for (const card of c.cards[side].played) p.decks.combat.push(card.name);
            for (const name of (c.cards[side].hand || [])) p.decks.combat.push(name);
            const staged = c.staged && c.staged[side];
            if (staged && !c.cards[side].played.some(x => x.name === staged.name)) {
                p.decks.combat.push(staged.name);
            }
            c.cards[side].played = [];
            c.cards[side].hand = [];
            p.decks.combat = this.shuffle(state, p.decks.combat);
            // The reinforcement tokens of the combat go back to the supply here, at
            // the clean-up of the combat.
            p.assets.reinforcement += c.reinforceUsed && c.reinforceUsed[side] ? c.reinforceUsed[side] : 0;
            if (c.reinforceUsed) c.reinforceUsed[side] = 0;
        }
        if (noTroops) this.combatRetreat(state, loser, attackerWins ? 'defender' : 'attacker', {});
    },

    // Where the loser may retreat: the rules differ for the attacker and the
    // defender, and all the retreating units go to one area.
    retreatTargets(state, seat) {
        const c = state.combat;
        if (!c) return [];
        const side = seat === c.attacker ? 'attacker' : 'defender';
        const units = state.units.filter(u => u.seat === seat && u.system === c.system && u.area === c.pos);
        if (!units.length) return [];
        const defs = units.map(u => this.unitOf(state, u)).filter(Boolean);
        const ground = defs.length ? defs[0].type === 'ground' : true;
        // The areas the attacking units moved from to start the combat.
        const came = c.attackerFrom || [];
        // «If the units did not move into the contested area via an Advance
        // Order, they must move to an area that at least one unit moved from to
        // start the combat.» Otherwise the general retreat rules apply.
        const free = side === 'attacker' && c.viaAdvance;
        const systems = [c.system].concat(this.neighbors(state, c.system));
        const out = [];
        for (const sid of systems) {
            const sys = this.system(state, sid);
            if (!sys) continue;
            for (const area of sys.areas) {
                if (!!area.world !== ground) continue;
                if (sid === c.system && area.pos === c.pos) continue;
                const where = this.areaState(state, seat, sid, area.pos);
                if (where === 'contested' || where === 'enemy') continue;
                if (side === 'defender') {
                    // «The area the retreating units move to must either be in
                    // the active system or in a system adjacent to the active
                    // system. If attacking units moved from an adjacent system,
                    // the defender's units cannot retreat to that system.
                    // Defending units cannot retreat to an area from which
                    // attacking units moved from.»
                    if (came.some(x => x.system === sid)) continue;
                    if (came.some(x => x.system === sid && x.pos === area.pos)) continue;
                } else if (!free) {
                    // Not an Advance: back to an area a unit moved from. Without
                    // such an area the units cannot retreat and are destroyed.
                    if (!came.some(x => x.system === sid && x.pos === area.pos)) continue;
                }
                // A ground unit walks a legal path to the area it retreats to.
                if (ground && !this.pathExists(state, seat, c.system, c.pos, sid, area.pos)) continue;
                out.push({ system: sid, pos: area.pos, state: where });
            }
        }
        // The defender prefers a friendly area; uncontrolled is the last resort.
        if (side === 'defender') {
            const friendly = out.filter(t => t.state === 'friendly');
            if (friendly.length) return friendly.map(({ system, pos }) => ({ system, pos }));
        }
        return out.map(({ system, pos }) => ({ system, pos }));
    },

    // The loser retreats: all his units leave the area (they are routed).
    combatRetreat(state, seat, side, cmd) {
        const c = state.combat;
        if (c.loser !== seat) return { ok: false, error: 'Отступает проигравший.' };
        const units = state.units.filter(u => u.seat === seat && u.system === c.system && u.area === c.pos);
        const targets = this.retreatTargets(state, seat);
        let target = null;
        if (cmd && cmd.target) {
            target = targets.find(t => t.system === cmd.target.system && t.pos === cmd.target.pos) || null;
            if (!target) return { ok: false, error: 'Отступать в эту область нельзя.' };
        } else if (targets.length) {
            return { ok: false, error: 'Выберите, куда отступить.' };
        }
        for (const u of units) {
            if (target) { u.system = target.system; u.area = target.pos; }
            u.routed = true;
        }
        // No area to retreat to: the unit is destroyed (the rules, "Retreats").
        if (!target) {
            for (const u of units) this.destroyUnit(state, u);
            if (units.length) this.log(state, seat, state.players[seat].name + ': отступать некуда, отряды гибнут.');
        }
        // The troops over the capacity of the new area are chosen by the player.
        if (target) this.trimArea(state, seat, target.system, target.pos);
        this.log(state, seat, state.players[seat].name + ' отступает.');
        state.combat = null;
        // A test battle stays on the field: the player may start it again.
        if (state.testBattle) {
            state.order = null;
            return { ok: true };
        }
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
        // The cards of the combat: only the player sees his own hand. The card that
        // was chosen stays closed — the other side only knows that it is there.
        if (copy.combat) {
            for (const side of ['attacker', 'defender']) {
                const combatSeat = copy.combat[side];
                if (combatSeat !== seat) copy.combat.cards[side].hand = [];
                copy.combat.cards[side].chosen = null;
            }
            const staged = copy.combat.staged || {};
            copy.combat.chosen = {
                attacker: !!(staged.attacker),
                defender: !!(staged.defender),
            };
            delete copy.combat.staged;
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
            copy.setup.legalCells = copy.setup.stage === 'tile' ? this.setupLegalCells(copy) : [];
            copy.setup.objectiveOptions = [];
            if (copy.setup.stage === 'objectives' && copy.setup.turn === seat) copy.setup.objectiveOptions = this.setupObjectiveOptions(state);
            copy.setup.stormEdges = copy.setup.stage === 'storms' ? this.setupStormEdges(state) : [];
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
    },
};
