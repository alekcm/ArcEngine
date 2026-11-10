// FSRulesSetup.js — the setup phase: a new party, the galaxy of tiles, the
// initial forces, the objective tokens and the warp storms.
//
// The test modes of the lobby ('map' and 'battle') build their state with the
// same code as the ordinary party: a test mode is a state, not a second game.

class SetupRules {
    /** @param {any} engine the rules facade (FSRules.js) */
    constructor(engine) {
        this.engine = engine;
    }

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
            const faction = this.engine.factionById(p.faction) || FS_CATALOG.factions[seat];
            state.players.push({
                seat,
                id: p.id || ('p' + seat),
                name: p.name || faction.name,
                faction: faction.id,
                color: faction.color,
                palette: this.engine.normalizePalette(p.palette, faction.color),
                materiel: 6,
                assets: { forge: 0, cache: 0, reinforcement: 0, prosperity: 0 },
                objectives: 0,
                supply: { units: {}, structures: { city: 0, factory: 0, bastion: 0 } },
                initialForces: { units: {}, structures: {} },
                orderTokens: this.engine.ORDER_TOKENS,
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
                state.players[seat].supply.structures[type] = this.engine.STRUCTURE_POOL[type] || 0;
                state.players[seat].initialForces.structures[type] = st[type] || 0;
            }
            /** @type {any} */
            const player0 = this.engine.player(state, seat);
            player0.setAsset('forge', st.forge || 0);
            player0.setAsset('cache', st.cache || 0);
            player0.setAsset('reinforcement', st.reinforcement || 0);
            player0.setAsset('prosperity', st.prosperity || 0);
            // "2 жетона материалов (ассетов)": the sheet of the Inquisition
            // does not name them, the player takes any assets he likes
            // (07-tokens.md: prosperity = one asset of the player's choice).
            state.players[seat].startChoice = st.choice || 0;
            // The combat deck: five cards, two copies of every card.
            const base = FS_CATALOG.baseCombatCards(faction.id).map(c => c.name);
            const deck = this.engine.player(state, seat).combatDeck;
            for (const name of base) deck.add(name, 2);
            deck.shuffle();
            // The cards the player may buy: the upgrade cards of his faction
            // lie in their own piles next to the board («Combat Cards And
            // Combat Upgrade Cards», «Order Upgrade Cards»).
            this.engine.player(state, seat).combatDeck.resetPile(
                FS_CATALOG.upgradeCombatCards(faction.id).map(c => c.name));
            state.players[seat].decks.upgradeOrder = FS_CATALOG.orderCards(faction.id).map(c => c.name);
        });

        // --- the tiles: every player gets their home tile and two base tiles
        // A and B are the two faces of one physical tile, not separate tiles.
        const base = this.engine.shuffle(state, FS_CATALOG.tiles.filter(t => !t.home && /A$/.test(t.id)));
        const tiles = [];
        for (let seat = 0; seat < count; seat++) {
            const home = FS_CATALOG.tiles.find(t => t.home === state.players[seat].faction);
            const mine = [];
            if (home) mine.push(home);
            mine.push(base[seat * 2], base[seat * 2 + 1]);
            for (const t of mine) if (t) tiles.push({ tile: t, seat });
        }

        // --- the board. Online games use the actual placement phase: players take turns,
        // choosing one of their three tiles and an adjacent empty cell. The old automatic
        // composition remains available to deterministic simulations and the rules audit.
        const rows = this.engine.LAYOUTS[count] || this.engine.LAYOUTS[2];
        const cells = [];
        rows.forEach((n, r) => { for (let c = 0; c < n; c++) cells.push({ row: r, col: c }); });
        const seatOrder = [];
        for (const seat of GamePhase.of(state).circle()) seatOrder.push(seat);
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
                stage: BoardSetup.TILES,
                currentSystem: null,
                placedBySeat: Array(count).fill(0),
                placedTotal: 0,
                totalTiles: tiles.length,
                turnOrder: seatOrder,
                turnIndex: 0,
                turn: seatOrder[0],
                center,
            };
            this.engine.log(state, -1, 'Сборка галактической карты: игроки по очереди выкладывают системные тайлы.');
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
    }

    newReadyGame(opts) {
        const state = this.newGame(Object.assign({}, opts, { interactiveSetup: false }));
        BattleTest.of(state).setMode(BattleTest.MAP);
        this.engine.log(state, -1, 'Тестовая партия: карта собрана автоматически, ход сразу за планированием.');
        return state;
    }

    buildTestDeck(state, seat, names) {
        const p = state.players[seat];
        if (!p) return [];
        const base = FS_CATALOG.baseCombatCards(p.faction).map(c => c.name);
        const chosen = (names || []).filter(n => base.includes(n));
        const cards = chosen.length ? chosen : base;
        // Two copies of every card — and enough cards to deal the hand of a combat.
        let deck = cards.concat(cards);
        while (deck.length < 10) deck = deck.concat(cards);
        const combatDeck = this.engine.player(state, seat).combatDeck;
        combatDeck.reset(deck);
        combatDeck.shuffle();
        return cards;
    }

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
        GamePhase.of(state).start(GamePhase.OPERATIONS);
        GamePhase.of(state).turn = attacker;
        // The troops of the two sides, the host first.
        const roster = [];
        const place = (seat, units) => {
            const faction = state.players[seat].faction;
            const defs = ((FS_CATALOG.faction(faction) || {}).units || []);
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
        for (const seat of [attacker, defender]) this.engine.player(state, seat).setAsset('reinforcement', 2);
        BattleTest.of(state).begin({
            kind, attacker, defender, system: sys.id, pos: area.pos,
            roster,
            decks: { attacker: attCards, defender: defCards },
            reinforcement: 2,
        });
        GamePhase.of(state).start(GamePhase.OPERATIONS);
        GamePhase.of(state).turn = attacker;
        state.order = { seat: attacker, order: 'advance', system: sys.id, pos: area.pos, phase: 'combat' };
        this.engine.log(state, -1, (kind === 'space' ? 'Космический' : 'Наземный')
            + ' бой: ' + state.players[attacker].name + ' против ' + state.players[defender].name + '.');
        this.engine.startCombat(state, attacker, defender, sys.id, area.pos);
        return state;
    }

    defaultFoeUnits(state, seat, kind) {
        const faction = FS_CATALOG.faction(state.players[seat].faction);
        const units = ((faction && faction.units) || []).filter(u => (u.type === 'ship') === (kind === 'space'));
        const out = {};
        for (const u of units.slice(0, 2)) out[u.id] = 2;
        return out;
    }

    cmdRematchBattle(state, seat) {
        const test = BattleTest.of(state);
        if (!test.replayable) return { ok: false, error: 'Сейчас не тестовый бой.' };
        if (state.combat) return { ok: false, error: 'Бой ещё идёт.' };
        const p = state.players[seat];
        if (!p || !test.participant(seat)) return { ok: false, error: 'Вы не участник боя.' };
        const battle = test.battle;
        state.units = state.units.filter(u => !(u.system === test.system && u.area === test.pos
            && test.participant(u.seat)));
        for (const entry of test.roster) this.addUnit(state, entry.seat, entry.unit, test.system, test.pos);
        for (const side of ['attacker', 'defender']) {
            this.buildTestDeck(state, battle[side], test.decks(side));
            this.engine.player(state, battle[side]).setAsset('reinforcement', test.reinforcement);
        }
        state.combat = null;
        GamePhase.of(state).start(GamePhase.OPERATIONS);
        GamePhase.of(state).turn = battle.attacker;
        state.order = { seat: battle.attacker, order: 'advance', system: test.system, pos: test.pos, phase: 'combat' };
        this.engine.log(state, -1, 'Тот же бой начинается снова.');
        this.engine.startCombat(state, battle.attacker, battle.defender, test.system, test.pos);
        return { ok: true };
    }

    createSystemFromTile(state, tile, seat, row, col, rotation = 0) {
        return {
            id: 'sys' + (state.systems.length + 1),
            tile: tile.id,
            owner: seat,
            row,
            col,
            rotation,
            areas: tile.areas.map(a => ({
                pos: this.engine.rotateArea(a.pos, rotation),
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
    }

    placeSetupObjectives(state, sys) {
        const owner = sys.owner, used = new Set();
        for (const area of sys.areas) {
            if (!area.world || !area.world.objective) continue;
            const faction = this.pickObjectiveToken(state, owner, used);
            if (!faction) continue;
            used.add(faction);
            state.objectives.push({ id: this.engine.uid(state, 'obj'), faction, system: sys.id, area: area.pos });
        }
    }

    setupLegalCells(state) {
        if (!BoardSetup.of(state).active) return [];
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
    }

    cmdPlaceSystemTile(state, seat, cmd) {
        const board = BoardSetup.of(state);
        if (!GamePhase.of(state).is(GamePhase.SETUP) || !board.active) return { ok: false, error: 'Сейчас не этап сборки карты.' };
        if (board.turn !== seat) return { ok: false, error: 'Сейчас очередь другого игрока выкладывать тайл.' };
        if (!board.is(BoardSetup.TILES)) return { ok: false, error: 'Сначала завершите текущий этап размещения.' };
        const hand = board.hand(seat);
        const tileIndex = hand.findIndex(id => this.engine.tileFaces(id).some(t => t.id === cmd.tile));
        if (tileIndex < 0) return { ok: false, error: 'Этого системного тайла нет у вас в руке.' };
        const cell = { row: Number(cmd.row), col: Number(cmd.col) };
        if (!this.setupLegalCells(state).some(c => c.row === cell.row && c.col === cell.col)) {
            return { ok: false, error: 'Выберите пустое место рядом с уже выложенной системой.' };
        }
        const tile = FS_CATALOG.tile(cmd.tile);
        if (!tile) return { ok: false, error: 'Неизвестный системный тайл.' };
        const rotation = cmd.rotation == null ? 0 : cmd.rotation;
        if (!Number.isInteger(rotation) || rotation < 0 || rotation > 3) return { ok: false, error: 'Недопустимый поворот тайла.' };
        if (!this.setupForcesFit(state, seat, tile, tileIndex)) return { ok: false, error: 'На этой стороне и оставшихся тайлах не поместятся начальные силы. Выберите другую сторону или тайл.' };
        const sys = this.createSystemFromTile(state, tile, seat, cell.row, cell.col, rotation);
        state.systems.push(sys);
        board.placeTile(seat, sys.id, tileIndex);
        this.engine.log(state, seat, state.players[seat].name + ' разместил систему ' + tile.id + '.');
        return { ok: true };
    }

    setupGuard(state, seat, stage) {
        const board = BoardSetup.of(state);
        if (!GamePhase.of(state).is(GamePhase.SETUP) || !board.is(stage)) return { ok: false, error: 'Сейчас это действие недоступно.' };
        if (board.turn !== seat) return { ok: false, error: 'Сейчас ход другого игрока.' };
        return null;
    }

    cmdSetupForce(state, seat, cmd, kind) {
        const error = this.setupGuard(state, seat, 'forces');
        if (error) return error;
        const sys = this.engine.system(state, BoardSetup.of(state).currentSystem);
        const area = this.engine.area(sys, cmd.pos);
        if (!area) return { ok: false, error: 'Выберите область только что размещённой системы.' };
        const initial = state.players[seat].initialForces;
        if (kind === 'unit') {
            const def = this.engine.unitDef(state, seat, cmd.unit);
            if (!def || !(initial.units[cmd.unit] > 0)) return { ok: false, error: 'Такого начального отряда больше нет.' };
            if ((def.type === 'ground') !== !!area.world) return { ok: false, error: 'Наземные отряды размещаются на мирах, корабли — в пустоте.' };
            if (this.engine.unitsAt(state, sys.id, area.pos).length >= this.engine.capacity(state, sys.id, area.pos)) return { ok: false, error: 'Вместимость области исчерпана.' };
            initial.units[cmd.unit]--;
            this.addUnit(state, seat, cmd.unit, sys.id, area.pos);
        } else {
            if (!['city', 'factory', 'bastion'].includes(cmd.structure) || !(initial.structures[cmd.structure] > 0)) return { ok: false, error: 'Такой начальной постройки больше нет.' };
            if (!area.world) return { ok: false, error: 'Постройка размещается на мире без постройки.' };
            if (!this.engine.canPlaceStructure(state, seat, sys.id, area.pos, { ignoreControl: true }).ok) {
                return { ok: false, error: 'Постройка размещается на мире без постройки.' };
            }
            initial.structures[cmd.structure]--;
            this.addStructure(state, seat, cmd.structure, sys.id, area.pos);
        }
        return { ok: true };
    }

    cmdRemoveSetupForce(state, seat, cmd) {
        const error = this.setupGuard(state, seat, 'forces');
        if (error) return error;
        const items = cmd.kind === 'unit' ? state.units : cmd.kind === 'structure' ? state.structures : null;
        const item = items && items.find(x => x.id === cmd.id && x.seat === seat && x.system === BoardSetup.of(state).currentSystem);
        if (!item) return { ok: false, error: 'Можно убрать только свою начальную фигуру с текущего тайла.' };
        items.splice(items.indexOf(item), 1);
        const pool = state.players[seat].initialForces[cmd.kind === 'unit' ? 'units' : 'structures'];
        const id = cmd.kind === 'unit' ? item.unit : item.type;
        pool[id] = (pool[id] || 0) + 1;
        return { ok: true };
    }

    setupForcesFit(state, seat, chosenTile = null, chosenIndex = -1) {
        const initial = state.players[seat].initialForces;
        const future = BoardSetup.of(state).hand(seat).filter((_, i) => i !== chosenIndex).map(id => this.engine.tileFaces(id));
        if (chosenTile) future.push([chosenTile]);
        let needGround = 0, needShips = 0;
        for (const [id, n] of Object.entries(initial.units)) {
            const def = this.engine.unitDef(state, seat, id);
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
                    if (area.world) { g += Math.min(area.world.capacity || this.engine.AREA_CAP, this.engine.AREA_MAX_UNITS); w++; }
                    else s += this.engine.AREA_CAP;
                }
                return fits(index + 1, ground + g, ships + s, worlds + w);
            });
        };
        return fits(0, 0, 0, 0);
    }

    cmdFinishSetupForces(state, seat) {
        const error = this.setupGuard(state, seat, 'forces');
        if (error) return error;
        if (!this.setupForcesFit(state, seat)) return { ok: false, error: 'Оставшиеся начальные силы не поместятся на следующих тайлах. Разместите больше фигур здесь или уберите и переставьте их.' };
        BoardSetup.of(state).setStage(BoardSetup.OBJECTIVES);
        if (!this.setupObjectiveOptions(state).length) this.advanceSetupTurn(state);
        return { ok: true };
    }

    setupObjectiveOptions(state) {
        const board = BoardSetup.of(state);
        if (!board.is(BoardSetup.OBJECTIVES)) return [];
        const sys = this.engine.system(state, board.currentSystem);
        const pool = state.players[board.turn].objectivePool;
        const used = new Set(state.objectives.filter(o => o.system === sys.id).map(o => o.faction));
        const occupied = new Set(state.objectives.filter(o => o.system === sys.id).map(o => o.area));
        const areas = sys.areas.filter(a => a.world && a.world.objective && !occupied.has(a.pos)).map(a => a.pos);
        if (!areas.length || !pool.length) return [];
        const counts = {};
        for (const f of pool) counts[f] = (counts[f] || 0) + 1;
        const max = Math.max(...Object.values(counts));
        return Object.keys(counts).filter(f => counts[f] === max && !used.has(f)).map(faction => ({ faction, areas }));
    }

    cmdSetupObjective(state, seat, cmd) {
        const error = this.setupGuard(state, seat, 'objectives');
        if (error) return error;
        const option = this.setupObjectiveOptions(state).find(x => x.faction === cmd.faction && x.areas.includes(cmd.pos));
        if (!option) return { ok: false, error: 'Выберите допустимый жетон и свободное место цели на текущем тайле.' };
        const pool = state.players[seat].objectivePool;
        pool.splice(pool.indexOf(cmd.faction), 1);
        state.objectives.push({ id: this.engine.uid(state, 'obj'), faction: cmd.faction, system: BoardSetup.of(state).currentSystem, area: cmd.pos });
        if (!this.setupObjectiveOptions(state).length) this.advanceSetupTurn(state);
        return { ok: true };
    }

    advanceSetupTurn(state) {
        const board = BoardSetup.of(state);
        if (board.tilesDone) {
            board.setStage(BoardSetup.STORMS).setCurrentSystem(null);
            if (board.record) board.record.stormsPlaced = 0;
            this.engine.log(state, -1, 'Расстановка варп-штормов: начиная с последнего игрока против часовой стрелки.');
            return;
        }
        board.nextPlayer();
    }

    setupStormEdges(state) {
        return FS_WARP_STORMS.freeEdges(state);
    }

    /** The sides of a system where a storm may still be placed (the panel asks this). */
    setupStormSides(state, systemId) {
        const sys = this.engine.system(state, systemId);
        if (!sys) return [];
        const free = new Set(this.setupStormEdges(state).map(e => e.key));
        const out = [];
        for (const side of ['N', 'E', 'S', 'W']) {
            const edge = FS_WARP_STORMS.edgeOf(state, { system: sys.id, side });
            if (edge && edge.exists(state) && free.has(edge.key())) out.push(side);
        }
        return out;
    }

    cmdSetupStorm(state, seat, cmd) {
        const error = this.setupGuard(state, seat, 'storms');
        if (error) return error;
        const sys = this.engine.system(state, cmd.system);
        if (!sys || !['N', 'E', 'S', 'W'].includes(cmd.side)) return { ok: false, error: 'Выберите сторону системы.' };
        // The click names a side of a tile; the state stores the BORDER, with
        // the two system ids it separates (one may be null on an outer edge).
        const edge = FS_WARP_STORMS.edgeOf(state, cmd);
        if (!edge || !edge.exists(state)) return { ok: false, error: 'Выберите сторону системы.' };
        if (!this.setupStormEdges(state).some(e => e.key === edge.key())) {
            return { ok: false, error: 'На этой границе уже есть варп-шторм.' };
        }
        const storm = FS_WARP_STORMS.create(state, this.engine.uid(state, 'storm'), edge);
        if (!storm) return { ok: false, error: 'Эту границу нельзя занять.' };
        state.storms.push(storm);
        const board = BoardSetup.of(state);
        this.engine.log(state, seat, state.players[seat].name + ' разместил варп-шторм в системе ' + sys.tile + '.');
        if (board.nextStorm() === null) this.finishBoardSetup(state, false);
        return { ok: true };
    }

    takeStartChoiceLeft(state) {
        for (const p of state.players) {
            while ((p.startChoice || 0) > 0) {
                const player = this.engine.player(state, p.seat);
                const free = player.freeAssetKinds();
                if (!free.length) break;
                player.addAsset(free[0], 1);
                p.startChoice--;
                this.engine.log(state, p.seat, p.name + ' берёт стартовый ресурс: ' + this.engine.assetName(free[0]) + '.');
            }
            p.startChoice = 0;
        }
    }

    cmdStartAsset(state, seat, cmd) {
        const p = state.players[seat];
        if (!p.startChoice) return { ok: false, error: 'Нет стартовых ресурсов на выбор.' };
        const asset = cmd.asset;
        if (!['forge', 'cache', 'reinforcement'].includes(asset)) return { ok: false, error: 'Неизвестный ресурс.' };
        const player = this.engine.player(state, seat);
        if (!player.hasRoomFor(asset)) return { ok: false, error: 'У вас уже максимум таких жетонов.' };
        player.addAsset(asset, 1);
        p.startChoice--;
        this.engine.log(state, seat, p.name + ' берёт стартовый ресурс: ' + this.engine.assetName(asset) + '.');
        return { ok: true };
    }

    finishBoardSetup(state, automatic = true) {
        const count = state.players.length;
        const shuffled = automatic ? this.engine.shuffle(state, this.engine.allEdges(state)) : [];
        for (let i = 0; automatic && i < count && i < shuffled.length; i++) {
            const storm = FS_WARP_STORMS.create(state, this.engine.uid(state, 'storm'), shuffled[i]);
            if (storm) state.storms.push(storm);
        }
        this.takeStartChoiceLeft(state);
        BoardSetup.of(state).finish();
        GamePhase.of(state).start(GamePhase.PLANNING);
        GamePhase.of(state).turn = GamePhase.of(state).firstPlayer;
        this.engine.log(state, -1, 'Игра началась: раунд 1, фаза планирования.');
    }

    placeInitialForces(state, seat, sys) {
        const initial = state.players[seat].initialForces;
        for (const [unitId, amount] of Object.entries(initial.units)) {
            const def = this.engine.unitDef(state, seat, unitId);
            let left = amount;
            for (const area of sys.areas) {
                if ((def.type === 'ground') !== !!area.world) continue;
                while (left > 0 && this.engine.unitsAt(state, sys.id, area.pos).length < this.engine.capacity(state, sys.id, area.pos)) {
                    this.addUnit(state, seat, unitId, sys.id, area.pos); left--;
                }
            }
            initial.units[unitId] = left;
        }
        for (const type of ['factory', 'bastion', 'city']) {
            let left = initial.structures[type] || 0;
            for (const area of sys.areas) {
                if (!left) break;
                if (!area.world) continue;
                if (!this.engine.canPlaceStructure(state, seat, sys.id, area.pos, { ignoreControl: true }).ok) continue;
                this.addStructure(state, seat, type, sys.id, area.pos); left--;
            }
            initial.structures[type] = left;
        }
    }

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
    }

    addUnit(state, seat, unitId, systemId, pos) {
        const unit = {
            id: this.engine.uid(state, 'u'),
            seat,
            faction: state.players[seat].faction,
            unit: unitId,
            system: systemId,
            area: pos,
            routed: false,
        };
        state.units.push(unit);
        return unit;
    }

    addStructure(state, seat, type, systemId, pos) {
        const s = { id: this.engine.uid(state, 's'), seat, type, system: systemId, area: pos };
        state.structures.push(s);
        return s;
    }

    destroyUnit(state, unit) {
        const i = state.units.indexOf(unit);
        if (i >= 0) state.units.splice(i, 1);
        const p = state.players[unit.seat];
        p.supply.units[unit.unit] = (p.supply.units[unit.unit] || 0) + 1;
        // «получите по 1 материалу за каждый уничтоженный отряд» («Рой
        // потрошителей»): the step of the damage counts its own losses.
        if (state.combat) CombatPlans.of(state.combat).addDestroyed(1);
    }

    destroyStructure(state, s) {
        const i = state.structures.indexOf(s);
        if (i >= 0) state.structures.splice(i, 1);
        // The plastic and the control token are free again: the counters are
        // computed from the board (structurePoolLeft, structureTokensLeft).
    }

    structurePoolLeft(state, type) {
        const used = state.structures.filter(st => st.type === type).length;
        return Math.max(0, (this.engine.STRUCTURE_POOL[type] || 0) - used);
    }

    structureTokensLeft(state, seat) {
        // One place counts them: the player object (a card may raise the number).
        return this.engine.player(state, seat).structureTokensLeft();
    }

    canTakeStructure(state, seat, type) {
        if (!this.engine.STRUCTURE_POOL[type]) return { ok: false, error: 'Неизвестная постройка.' };
        if (this.structureTokensLeft(state, seat) <= 0) return { ok: false, error: 'Не осталось жетонов контроля построек.' };
        if (this.structurePoolLeft(state, type) <= 0) return { ok: false, error: 'Такие постройки закончились в коробке.' };
        return { ok: true };
    }

}
