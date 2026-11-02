// FSGame.js — the client of Forbidden Stars on ArcEngine.
//
// The server owns the game: the client sends the commands of the rules engine
// (FS_RULES.apply) and draws the state it gets back. The client decides
// nothing — it only shows the board, collects the clicks and turns them into
// commands.
//
// The interaction is a small state machine: `mode` says what the next click
// on the board means ('placeOrder', 'move', 'placeUnit', 'strike', 'retreat'),
// `pending` holds the data of the current action.

// The glyphs of the four order tokens: one look at the panel or at the board.
const FS_ORDER_ICONS = { advance: '⚔', deploy: '✚', strategize: '✧', dominate: '⌂' };

// The three ways into the game on the lobby screen. The first one is the party
// itself; the other two are tests of a single person who plays both seats.
const FS_TEST_MODES = [
    { id: 'game', icon: '⌘', title: 'Обычная игра', text: 'Сборка галактики с нуля и партия по сети: 2–4 игрока.' },
    { id: 'map', icon: '▦', title: 'Готовая карта', text: 'Галактика уже собрана, 1 на 1: игра начинается с планирования. Вы играете за обоих.' },
    { id: 'battle', icon: '⚔', title: 'Тест боя', text: 'Наземный или космический бой: выберите свои отряды и карты в колоде.' },
];

class FSGame {
    /** @param {{ location: Location3D, camera: CameraController }} app */
    constructor(app) {
        this.app = app;
        this.view = FSView.create(app);
        // Location3D may finish loading its sample terrain texture after this client starts.
        // Re-assert the game's space material once the base scene is ready.
        if (app.location.ready && typeof app.location.ready.then === 'function') app.location.ready.then(() => FSView.spaceGround(app));
        else FSView.spaceGround(app);
        this.state = null;
        this.view.onModelReady = () => {
            if (!this.state || this.view.modelRefreshQueued) return;
            this.view.modelRefreshQueued = true;
            const redraw = () => {
                this.view.modelRefreshQueued = false;
                if (this.state) FSView.update(this.app, this.view, this.state);
            };
            if (typeof requestAnimationFrame === 'function') requestAnimationFrame(redraw);
            else setTimeout(redraw, 0);
        };
        this.net = null;
        this.mode = 'idle';
        /** @type {any} */
        this.pending = null;
        /** @type {any} */
        this.lastCard = null;
        this.damageTargets = [];
        this.inspection = null;
        this.status = '';
        // The mouse-first play: the pieces picked on the board, the sector under
        // the pointer and the plaque that floats over the place of an action.
        /** @type {string[]} */
        this.selected = [];
        // Ships and ground troops march apart: the flow is chosen before the picking.
        /** @type {'ship' | 'ground' | null} */
        this.moveKind = null;
        /** @type {{system: string, pos: string | null} | null} */
        this.hover = null;
        this.hoverAt = 0;
        /** @type {any} */
        this.plaque = null;
        this.name = '';
        this.faction = '';
        this.lobby = { code: '', players: [], factions: [] };
        // The three ways into the game: the ordinary party (the galaxy is built
        // together) and the two test modes — a ready map and a battlefield.
        this.testMode = 'game';
        this.battle = { kind: 'ground', units: {}, cards: [] };
        FSUI.mount();

        const params = new URLSearchParams(location.search);
        this.room = (params.get('room') || '').toUpperCase();
        this.name = params.get('name') || Store.get('fs.name') || '';
        this.id = Store.get('fs.id') || '';

        this.setupCamera();
        this.bindPointer();
        this.bindSetupKeys();
        this.connect();
    }

    // Is this the game of the page? The sample game of the kit — with ?demo=1.
    static enabled() {
        try {
            return new URLSearchParams(location.search).get('demo') !== '1';
        } catch (e) {
            return true;
        }
    }

    // --- the camera: the board from above -------------------------------------
    setupCamera() {
        const cam = this.app.camera;
        cam.azimuth = -Math.PI / 2;                       // north up
        cam.leftDragPan = true;                           // board drag is intuitive; a click still selects/acts
        cam.pitch = FS_CAMERA_PITCH_DEG * Math.PI / 180;
        cam.zoom = FS_CAMERA_ZOOM;
        cam.zoomTarget = FS_CAMERA_ZOOM;
        cam.lookAt(this.app.location.width / 2, this.app.location.height / 2);
    }

    // The camera looks at the middle of the board.
    aimCamera() {
        const s = this.state;
        if (!s || !s.systems.length) return;
        const m = this.view.metrics;
        if (!m) return;
        // On desktop the glass HUD occupies unequal side rails (250 px left, 356 px right).
        // Bias the board toward the free viewport so interactive systems are not hidden underneath it.
        const hudBias = typeof window !== 'undefined' && window.innerWidth > 980 ? 84 : 0;
        this.app.camera.lookAt(m.cx + hudBias, m.cy);
    }

    // --- the connection --------------------------------------------------------
    connect() {
        this.net = FSNet.connect({ room: this.room, name: this.name, id: this.id });
        this.net.on('joined', msg => {
            this.id = msg.id;
            this.room = msg.room;
            Store.set('fs.id', msg.id);
            if (!this.name) {
                this.name = 'Игрок ' + (msg.seat + 1);
                Store.set('fs.name', this.name);
            }
            this.lobby.factions = msg.factions || [];
            this.lobby.code = msg.room;
            this.lobby.players = this.lobby.players || [];
            // The room code in the link — the host sends this link to the friends.
            try {
                const url = new URL(location.href);
                url.searchParams.set('room', msg.room);
                history.replaceState(null, '', url.toString());
            } catch (e) { /* the link stays as it is */ }
            // The lobby is only shown while the game has not started.
            if (!this.state) this.showLobby();
        });
        this.net.on('room', msg => {
            this.lobby.code = msg.code;
            this.lobby.players = msg.players || [];
            if (!this.state) this.showLobby();
        });
        this.net.on('state', msg => this.onState(msg.view));
        this.net.on('err', msg => {
            this.setupSubmitting = false;
            this.status = msg.msg || 'Ошибка.';
            this.refresh();
        });
        this.net.on('close', () => {
            this.setupSubmitting = false;
            this.status = 'Связи с сервером нет. Запустите сервер игры: node tools/fs-server.mjs (или fs.bat)';
            this.refresh();
        });
    }

    showLobby() {
        if (!this.battle.cards.length) this.resetBattle(this.battle.kind);
        const info = {
            code: this.lobby.code,
            name: this.name,
            faction: this.faction,
            players: this.lobby.players,
            factions: this.lobby.factions,
            link: location.origin + '/?room=' + this.lobby.code,
            modes: FS_TEST_MODES,
            mode: this.testMode,
            status: this.status,
            battle: this.battleInfo(),
            onMode: id => { this.testMode = id; this.showLobby(); },
            onBattle: patch => { this.onBattle(patch); },
            onStart: () => this.startTest(),
        };
        FSUI.lobby(info, id => {
            this.faction = id;
            this.resetBattle(this.battle.kind);
            this.net.faction(id);
            this.showLobby();
        }, name => {
            if (!name || name === this.name) return;
            this.name = name;
            Store.set('fs.name', name);
            if (this.net) this.net.rename(name);
        });
    }

    // --- the test modes -------------------------------------------------------
    // The ordinary party starts by itself when every player has a faction. The
    // two test modes are opened by one person who plays both seats: the ready
    // map (the game after the construction) and the battlefield.

    battleFaction() {
        return FS_DATA.factions.find(f => f.id === this.faction) || FS_DATA.factions[0];
    }

    // The troops that may enter this kind of battle: the ground ones stand on a
    // world, the ships fight over the system.
    battleUnits(kind) {
        return this.battleFaction().units.filter(u => (u.type === 'ship') === (kind === 'space'));
    }

    battleCards() {
        return FS_DATA.combat.filter(c => c.faction === this.battleFaction().id && !c.upgrade);
    }

    // A fresh choice: the first troops of the kind and the whole base deck.
    resetBattle(kind) {
        if (kind) this.battle.kind = kind === 'space' ? 'space' : 'ground';
        const units = this.battleUnits(this.battle.kind);
        this.battle.units = {};
        if (units[0]) this.battle.units[units[0].id] = 2;
        this.battle.cards = this.battleCards().map(c => c.name);
    }

    // What the lobby shows: the troops with their counts and the cards with
    // their icons, so the deck is chosen by reading, not by guessing.
    battleInfo() {
        const units = this.battleUnits(this.battle.kind).map(u => ({
            id: u.id, name: u.name, combat: u.combat,
            count: this.battle.units[u.id] || 0,
        }));
        const cards = this.battleCards().map(c => ({
            name: c.name, icons: c.icons, kl: c.kl,
            selected: this.battle.cards.includes(c.name),
        }));
        return {
            kind: this.battle.kind,
            units,
            total: units.reduce((n, u) => n + u.count, 0),
            cards,
            deck: cards.filter(c => c.selected).length * 2,
            foe: FS_DATA.factions.find(f => f.id !== this.battleFaction().id),
        };
    }

    onBattle(patch) {
        if (patch && patch.kind) this.resetBattle(patch.kind);
        if (patch && patch.toggleUnit) {
            const id = patch.toggleUnit;
            const total = Object.values(this.battle.units).reduce((n, v) => n + v, 0);
            const next = ((this.battle.units[id] || 0) + 1) % 4;
            if (this.battle.units[id]) delete this.battle.units[id];
            if (next && total + next <= 5) this.battle.units[id] = next;
        }
        if (patch && patch.toggleCard) {
            const name = patch.toggleCard;
            const i = this.battle.cards.indexOf(name);
            if (i >= 0) this.battle.cards.splice(i, 1);
            else this.battle.cards.push(name);
        }
        this.showLobby();
    }

    // The test party of the chosen mode: the server builds the board.
    startTest() {
        if (!this.net || !this.net.connected) { this.status = 'Нет связи с сервером.'; this.showLobby(); return; }
        if (this.testMode === 'map') {
            this.net.test({ mode: 'map' });
            return;
        }
        if (this.testMode === 'battle') {
            if (!this.battleInfo().total) { this.status = 'Выберите хотя бы один отряд.'; this.showLobby(); return; }
            this.net.test({
                mode: 'battle',
                battle: { kind: this.battle.kind, units: this.battle.units, cards: this.battle.cards },
            });
        }
    }

    // --- the state -------------------------------------------------------------
    onState(view) {
        const setupKey = view.setup ? [view.setup.stage, view.setup.turn, view.setup.currentSystem].join(':') : '';
        this.setupSubmitting = false;
        if (this.setupKey !== setupKey) {
            FSView.clearSetupPreview(this.view);
            this.mode = 'idle'; this.pending = null;
            FSView.clearHighlights(this.view);
            this.setupKey = setupKey;
        }
        this.state = view;
        // In a solo test the chair changes with every step of the combat or with
        // every order token: the action of the previous seat must not leak into
        // the next one.
        if (this.lastSeat !== view.seat) {
            if (this.lastSeat !== undefined) {
                this.mode = 'idle';
                this.pending = null;
                this.damageTargets = [];
                FSView.clearHighlights(this.view);
            }
            this.lastSeat = view.seat;
        }
        // A test party is played by one person: the server sends the view of the
        // seat whose turn it is, and the interface says so.
        this.solo = !!view.solo;
        this.testMode = view.mode || this.testMode;
        FSUI.show('fsLobby', false);
        FSView.update(this.app, this.view, view);
        FSView.showInspection(this.app, this.view, view, this.inspection);
        this.aimCamera();
        // A new round or a new phase — the pending action is dropped.
        if (this.lastPhase !== view.phase || this.lastRound !== view.round) {
            this.mode = 'idle';
            this.pending = null;
            this.damageTargets = [];
            this.lastPhase = view.phase;
            this.lastRound = view.round;
        }
        this.status = '';
        if (view.phase === 'setup' && view.setup && this.pending && view.setup.myTurn) {
            const initial = view.players[view.seat].initialForces;
            const exhausted = (this.mode === 'setupUnit' && !(initial.units[this.pending.unit] > 0))
                || (this.mode === 'setupStructure' && !(initial.structures[this.pending.structure] > 0));
            if (exhausted) { this.mode = 'idle'; this.pending = null; FSView.clearHighlights(this.view); }
        }
        if (view.phase === 'setup' && this.mode.startsWith('setup')) this.highlightSetupTargets();
        // The picked pieces may have moved or died — the rings follow the survivors.
        this.selected = this.selected.filter(id => view.units.some(u => u.id === id));
        if (this.mode !== 'move') this.clearSelection();
        else this.updateSelection();
        this.refresh();
    }

    // The side panel of the current situation.
    refresh() {
        const s = this.state;
        if (!s) {
            FSUI.set('fsStatus', this.status || 'Соединение с сервером…');
            return;
        }
        const me = s.seat;
        const ctx = { title: '', text: '', status: this.status || '', actions: [], inspection: this.inspection, mode: this.mode, setupCellSelected: false };
        // A new order (or a new step of it) — the pending action is dropped.
        const orderKey = s.order ? s.order.order + ':' + s.order.phase : '';
        if (this.orderKey !== orderKey) {
            this.orderKey = orderKey;
            this.mode = 'idle';
            this.pending = null;
            this.damageTargets = [];
            FSView.clearHighlights(this.view);
        }
        // The question of the effect of a card: the player chooses.
        if (s.pending) {
            this.panelQuestion(s, ctx);
            ctx.mode = this.mode;
            this.refreshPlaque();
            FSUI.update(s, ctx);
            return;
        }
        if (s.over) {
            ctx.title = 'Игра окончена';
            ctx.text = 'Побеждает: ' + (s.winner != null ? s.players[s.winner].name : '—');
            ctx.status = '';
        } else if (s.testMode === 'battle' && !s.combat) {
            this.panelTestBattle(s, ctx);
        } else if (s.testMode === 'battle') {
            // The fight is on: the combat panel below is the whole interface.
        } else if (s.phase === 'setup') {
            this.panelSetup(s, ctx);
        } else if (s.phase === 'planning') {
            this.panelPlanning(s, ctx);
        } else if (s.phase === 'operations') {
            this.panelOperations(s, ctx);
        } else if (s.phase === 'refresh') {
            this.panelRefresh(s, ctx);
        }
        // The order that is being resolved. A test battle has no order of its own:
        // its whole interface is the combat below.
        if (s.order && s.order.seat === me && s.testMode !== 'battle') {
            if (s.order.order === 'advance') this.panelAdvance(s, ctx);
            else if (s.order.order === 'deploy') this.panelDeploy(s, ctx);
            else if (s.order.order === 'strategize') this.panelStrategize(s, ctx);
            else if (s.order.order === 'dominate') this.panelDominate(s, ctx);
        }
        // The upgrades of the player: once per round.
        if (s.phase === 'operations' && s.players[me]) {
            for (const u of (s.players[me].upgrades || []).filter(x => !x.used)) {
                ctx.actions.push({
                    label: 'Применить улучшение: ' + u.name,
                    onClick: () => this.net.cmd({ type: 'useUpgrade', card: u.name }),
                });
            }
        }
        // The combat.
        if (s.combat) this.panelCombat(s, ctx);
        ctx.mode = this.mode;
        this.refreshPlaque();
        FSUI.update(s, ctx);
    }

    // --- compose the galaxy ---------------------------------------------------
    //
    // The panel only offers the systems of the hand: the place is chosen on the
    // board, Q/E/F turn the preview, and the confirmation is the plaque that
    // floats above the chosen cell.

    panelSetup(s, ctx) {
        const setup = s.setup || {};
        const turnPlayer = s.players[setup.turn];
        ctx.title = setup.stage === 'storms' ? 'Варп-штормы' : 'Сборка карты';
        if (!setup.myTurn) {
            ctx.text = 'Ход игрока ' + (turnPlayer ? turnPlayer.name : '—') + '.';
            ctx.status = this.status || 'Ждём.';
            return;
        }
        if (setup.stage === 'forces') {
            const sys = s.systems.find(x => x.id === setup.currentSystem);
            const initial = s.players[s.seat].initialForces;
            const faction = FS_DATA.factions.find(f => f.id === s.players[s.seat].faction);
            ctx.text = 'Система ' + (sys ? sys.tile : '') + ': выберите фигуру и щёлкните по сектору.';
            ctx.status = this.status || (this.mode === 'setupUnit' || this.mode === 'setupStructure'
                ? 'Щёлкните по подсвеченному сектору.' : 'Фигуры можно ставить подряд.');
            // The inventory of the initial forces: every piece, zeros included.
            ctx.tokens = [];
            for (const unit of (faction ? faction.units : [])) {
                ctx.tokens.push({
                    icon: unit.type === 'ship' ? '🛦' : '♟',
                    label: unit.name,
                    count: initial.units[unit.id] || 0,
                    hint: unit.type === 'ship' ? 'Встаёт в пустоту' : 'Встаёт на мир',
                });
            }
            const structureNames = { factory: 'Фабрика', bastion: 'Бастион', city: 'Город' };
            for (const type of ['factory', 'bastion', 'city']) {
                ctx.tokens.push({ icon: '⌂', label: structureNames[type], count: initial.structures[type] || 0, hint: 'Встаёт на мир' });
            }
            for (const [id, count] of Object.entries(initial.units)) {
                if (!count) continue;
                const def = faction && faction.units.find(u => u.id === id);
                ctx.actions.push({
                    kind: 'pick', icon: def && def.type === 'ship' ? '🛦' : '♟', count,
                    label: def ? def.name : id,
                    selected: this.mode === 'setupUnit' && this.pending && this.pending.unit === id,
                    hint: def && def.type === 'ship' ? 'Встаёт в пустоту' : 'Встаёт на мир',
                    onClick: () => {
                        this.status = ''; this.mode = 'setupUnit'; this.pending = { unit: id };
                        this.highlightSetupTargets(); this.refresh();
                    },
                });
            }
            for (const [type, count] of Object.entries(initial.structures)) {
                if (!count) continue;
                ctx.actions.push({
                    kind: 'pick', icon: '⌂', count, label: structureNames[type],
                    selected: this.mode === 'setupStructure' && this.pending && this.pending.structure === type,
                    hint: 'Встаёт на мир',
                    onClick: () => {
                        this.status = ''; this.mode = 'setupStructure'; this.pending = { structure: type };
                        this.highlightSetupTargets(); this.refresh();
                    },
                });
            }
            // What already stands on this tile can be taken back with one click.
            for (const unit of s.units.filter(u => u.system === (sys && sys.id) && u.seat === s.seat)) {
                const def = faction && faction.units.find(u => u.id === unit.unit);
                ctx.actions.push({
                    kind: 'chip', icon: '↺', label: 'Убрать ' + (def ? def.name : unit.unit),
                    onClick: () => this.net.cmd({ type: 'removeSetupForce', kind: 'unit', id: unit.id }),
                });
            }
            for (const st of s.structures.filter(x => x.system === (sys && sys.id) && x.seat === s.seat)) {
                ctx.actions.push({
                    kind: 'chip', icon: '↺', label: 'Убрать ' + structureNames[st.type],
                    onClick: () => this.net.cmd({ type: 'removeSetupForce', kind: 'structure', id: st.id }),
                });
            }
            ctx.actions.push({ kind: 'primary', label: 'Завершить размещение сил', icon: '✓', onClick: () => this.net.cmd({ type: 'finishSetupForces' }) });
            return;
        }
        if (setup.stage === 'objectives') {
            const sys = s.systems.find(x => x.id === setup.currentSystem);
            ctx.text = this.pending && this.pending.pos
                ? 'Место выбрано: подтвердите постановку табличкой на доске.'
                : 'Выберите жетон соперника, затем мир с меткой цели.';
            ctx.status = this.status || '';
            ctx.handTitle = 'Жетоны целей соперников';
            ctx.hand = (setup.objectiveOptions || []).map(option => {
                const faction = FS_DATA.factions.find(f => f.id === option.faction);
                return {
                    icon: '◎',
                    count: 1,
                    label: faction ? faction.name : option.faction,
                    kind: 'жетон цели',
                    selected: this.mode === 'setupObjective' && this.pending && this.pending.faction === option.faction,
                    onClick: () => {
                        this.status = ''; this.mode = 'setupObjective';
                        this.pending = { faction: option.faction, pos: null };
                        this.highlightSetupTargets(); this.refresh();
                    },
                };
            });
            void sys;
            return;
        }
        if (setup.stage === 'storms') {
            const sys = this.pending && this.mode === 'setupStorm' && s.systems.find(x => x.id === this.pending.system);
            ctx.text = 'Щёлкните по системе на карте, затем по стороне.';
            ctx.status = this.status || (sys ? 'Система ' + sys.tile + ': выберите сторону.' : 'Щёлкните по системе.');
            if (sys) {
                for (const [side, name] of [['N', 'сверху'], ['E', 'справа'], ['S', 'снизу'], ['W', 'слева']]) {
                    const other = FS_RULES.across(s, sys.id, side);
                    const legal = (setup.stormEdges || []).some(e => (e.system === sys.id && e.side === side) || (other && e.system === other && FS_RULES.across(s, other, e.side) === sys.id));
                    if (legal) ctx.actions.push({ kind: 'pick', icon: '≋', label: name, onClick: () => this.net.cmd({ type: 'setupStorm', system: sys.id, side }) });
                }
            }
            return;
        }
        // The systems of the hand: their tiles only — no buttons for turning.
        const hand = setup.hand || [];
        const selected = this.mode === 'placeTile' && this.pending;
        ctx.text = selected
            ? (selected.cell ? 'Подтвердите постановку кнопкой над системой.' : 'Щёлкните по подсвеченному месту.')
            : 'Выберите систему, затем место на карте.';
        ctx.status = this.status || (selected ? 'Q/E — поворот · F — другая сторона' : 'Ваш ход.');
        hand.forEach(id => {
            const active = selected && selected.handTile === id;
            const face = active ? selected.tile : id;
            const raw = FS_DATA.tiles.find(t => t.id === face);
            const tile = raw && active ? Object.assign({}, raw, {
                areas: FS_RULES.createSystemFromTile({ systems: [] }, raw, s.seat, 0, 0, selected.rotation).areas,
            }) : raw;
            ctx.actions.push({
                tile, selected: !!active,
                label: 'Система ' + face,
                onClick: () => {
                    if (this.setupSubmitting) return;
                    const cell = selected ? selected.cell : null;
                    this.mode = 'placeTile';
                    this.pending = { handTile: id, tile: id, rotation: 0, cell };
                    this.status = '';
                    this.highlightSetupCells();
                    this.updateSetupPreview();
                    this.refresh();
                },
            });
        });
        if (selected && (selected.cell || selected.tile)) {
            ctx.actions.push({ kind: 'secondary', label: '↺ Снять выбор тайла', onClick: () => this.cancelSetupTile() });
        }
    }

    updateSetupPreview() {
        if (this.mode !== 'placeTile' || !this.pending || !this.pending.cell) {
            FSView.clearSetupPreview(this.view);
            return;
        }
        const tile = FS_DATA.tiles.find(t => t.id === this.pending.tile);
        FSView.showSetupPreview(this.app, this.view, this.state, tile, this.pending.cell, this.pending.rotation);
    }

    transformSetupTile(action) {
        if (this.mode !== 'placeTile' || !this.pending || this.setupSubmitting) return;
        if (action === 'left') this.pending.rotation = (this.pending.rotation + 3) % 4;
        else if (action === 'right') this.pending.rotation = (this.pending.rotation + 1) % 4;
        else if (action === 'flip') {
            const faces = FS_RULES.tileFaces(this.pending.handTile);
            const other = faces.find(t => t.id !== this.pending.tile);
            if (other) this.pending.tile = other.id;
        }
        this.status = '';
        this.updateSetupPreview();
        this.refresh();
    }

    confirmSetupTile() {
        const s = this.state, p = this.pending;
        if (this.setupSubmitting || this.mode !== 'placeTile' || !p || !p.cell || !s || !s.setup || !s.setup.myTurn || s.setup.stage !== 'tile') return;
        this.setupSubmitting = true;
        const sent = this.net.cmd({ type: 'placeSystemTile', tile: p.tile, rotation: p.rotation, row: p.cell.row, col: p.cell.col });
        if (sent === false) { this.setupSubmitting = false; this.status = 'Нет связи с сервером.'; }
        else this.status = 'Подтверждаем размещение…';
        this.refresh();
    }

    cancelSetupTile() {
        if (this.setupSubmitting) return;
        this.mode = 'idle'; this.pending = null; this.status = '';
        FSView.clearSetupPreview(this.view);
        FSView.clearHighlights(this.view);
        this.refresh();
    }

    bindSetupKeys() {
        if (typeof window === 'undefined' || !window.addEventListener) return;
        // Capture first: Q/E also control the free camera outside tile placement.
        window.addEventListener('keydown', e => {
            const target = /** @type {HTMLElement | null} */ (e.target);
            if (target && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable)) return;
            if (e.ctrlKey || e.metaKey || e.altKey || this.mode !== 'placeTile' || !this.pending || !this.state || !this.state.setup || !this.state.setup.myTurn) return;
            const action = { KeyQ: 'left', KeyE: 'right', KeyF: 'flip' }[e.code];
            if (!action) return;
            e.preventDefault(); e.stopImmediatePropagation();
            if (this.app.camera && this.app.camera._keys) this.app.camera._keys.delete(e.code);
            if (!e.repeat) this.transformSetupTile(action);
        }, true);
    }

    highlightSetupTargets() {
        const s = this.state, setup = s && s.setup;
        if (!setup || !setup.myTurn) return;
        const sys = s.systems.find(x => x.id === (this.mode === 'setupStorm' ? this.pending.system : setup.currentSystem));
        if (!sys) return;
        let areas = [];
        if (this.mode === 'setupUnit') {
            const faction = FS_DATA.factions.find(f => f.id === s.players[s.seat].faction);
            const def = faction && faction.units.find(u => u.id === this.pending.unit);
            if (def) areas = sys.areas.filter(a => (def.type === 'ground') === !!a.world && FS_RULES.unitsAt(s, sys.id, a.pos).length < FS_RULES.capacity(s, sys.id, a.pos));
        } else if (this.mode === 'setupStructure') {
            areas = sys.areas.filter(a => a.world && !FS_RULES.structuresAt(s, sys.id, a.pos).length);
        } else if (this.mode === 'setupObjective') {
            const option = (setup.objectiveOptions || []).find(x => x.faction === this.pending.faction);
            areas = sys.areas.filter(a => option && option.areas.includes(a.pos));
        }
        const list = this.mode === 'setupStorm' ? [FSView.tilePos(this.app, sys, this.view.metrics)] : areas.map(a => FSView.areaPos(this.app, sys, a.pos, this.view.metrics));
        FSView.highlight(this.view, list.map(p => ({ x: p.x, y: this.app.location.terrain.heightAt(p.x, p.y) + 14, z: p.y })));
    }

    highlightSetupCells() {
        const setup = this.state && this.state.setup;
        if (!setup || !this.view.metrics) return;
        const cells = setup.legalCells || [];
        const list = cells.map(cell => {
            const p = FSView.tilePos(this.app, cell, this.view.metrics);
            return { x: p.x, y: this.app.location.terrain.heightAt(p.x, p.y) + 14, z: p.y };
        });
        FSView.highlight(this.view, list);
    }

    // --- the planning phase ---------------------------------------------------
    panelPlanning(s, ctx) {
        const me = s.seat;
        const p = s.players[me];
        const left = Math.max(0, FS_RULES.ORDER_TOKENS + (p.extraOrderTokens || 0) - (p.placedTokens || 0));
        ctx.title = 'Планирование';
        ctx.text = this.mode === 'placeOrder'
            ? 'Щёлкните по системе с кольцом.'
            : 'Выберите приказ и щёлкните по системе.';
        ctx.status = this.status || (left ? 'Осталось приказов: ' + left : 'Все приказы выложены.');
        ctx.tokens = [
            { icon: '⚑', label: 'Приказы в руке', count: left },
            { icon: '◈', label: 'Материя', count: p.materiel },
            { icon: '◎', label: 'Цели', count: p.objectives || 0 },
        ];
        const kinds = [
            ['advance', 'Наступление', '⚔', 'Движение и бой'],
            ['deploy', 'Развёртывание', '✚', 'Покупка отрядов и построек'],
            ['strategize', 'Стратегия', '✧', 'Улучшения'],
            ['dominate', 'Доминирование', '⌂', 'Ресурсы и способность'],
        ];
        for (const [order, name, icon, hint] of kinds) {
            ctx.actions.push({
                kind: 'pick', icon, label: name, hint,
                selected: this.mode === 'placeOrder' && this.pending && this.pending.order === order,
                onClick: () => {
                    this.mode = 'placeOrder';
                    this.pending = { order };
                    this.highlightOrders();
                    this.refresh();
                },
            });
        }
        if (this.mode === 'placeOrder') this.highlightOrders();
    }

    // The systems where the order token may be placed.
    highlightOrders() {
        const s = this.state;
        if (!s) return;
        const list = [];
        for (const sys of s.systems) {
            if (!FS_RULES.canPlaceOrder(s, s.seat, sys.id)) continue;
            const p = FSView.tilePos(this.app, sys, this.view.metrics);
            const h = this.app.location.terrain.heightAt(p.x, p.y);
            list.push({ x: p.x, y: h + 16, z: p.y });
        }
        FSView.highlight(this.view, list);
    }

    // --- the operations phase -------------------------------------------------
    panelOperations(s, ctx) {
        const me = s.seat;
        ctx.title = 'Операции';
        if (s.turn !== me) {
            const who = s.players[s.turn] ? s.players[s.turn].name : '—';
            ctx.text = 'Ход игрока ' + who + '.';
            ctx.status = '';
            return;
        }
        if (s.order) {
            ctx.text = 'Приказ уже в игре — закончите его.';
            ctx.status = '';
            return;
        }
        ctx.text = 'Щёлкните по своему жетону на доске — или выберите его здесь.';
        ctx.status = '';
        // The tally of the corner is short: the tokens of every kind live in their
        // own window (the button at the top right), not in this column.
        ctx.tokens = [
            { icon: '◈', label: 'Материя', count: s.players[me].materiel },
            { icon: '✧', label: 'Жетоны событий', count: s.players[me].eventTokens || 0 },
            { icon: '◎', label: 'Цели', count: s.players[me].objectives || 0 },
        ];
        for (const o of FS_RULES.availableOrders(s, me)) {
            const sys = s.systems.find(x => x.id === o.system);
            if (!sys) continue;
            const tok = sys.tokens[sys.tokens.length - 1];
            ctx.actions.push({
                kind: 'pick', icon: FS_ORDER_ICONS[tok.order] || '⚑', label: sys.tile,
                hint: FS_RULES.orderName(tok.order),
                selected: this.mode === 'order' && this.pending && this.pending.system === o.system,
                onClick: () => {
                    this.mode = 'order';
                    this.pending = { system: o.system };
                    this.refresh();
                },
            });
        }
    }

    // --- the advance order: the movement --------------------------------------
    //
    // No list of units: the player clicks the miniatures on the board. The rings
    // mark the picked pieces, the arrow shows the march, the click on a sector
    // sends the group there.
    panelAdvance(s, ctx) {
        const me = s.seat;
        const order = s.order;
        const sys = s.systems.find(x => x.id === order.system);
        if (order.phase === 'move') {
            // The board itself is the tool of the movement: every click picks or marches.
            // A new order starts a new march: the flow and the group are empty again.
            const mark = order.seat + ':' + order.system + ':' + (order.moved || []).length;
            if (this.moveFor !== mark && !(order.moved || []).length) {
                this.moveFor = mark;
                this.moveKind = null;
                this.selected = [];
            }
            if (this.mode !== 'move') { this.mode = 'move'; this.pending = null; }
            ctx.title = 'Наступление · движение';
            const kind = this.moveKind;
            const all = FS_RULES.movableUnits(s, me);
            const units = kind ? all.filter(u => { const d = FS_RULES.unitOf(s, u); return d && d.type === kind; }) : all;
            const picked = this.selectedUnits();
            ctx.text = picked.length
                ? 'Клик по сектору — отряды идут туда.'
                : kind === 'ship' ? 'Клик по кораблю на доске — взять его.'
                    : kind === 'ground' ? 'Клик по войску на доске — взять его.'
                        : 'Выберите, что двигать: корабли или наземные войска.';
            ctx.status = this.status || (kind
                ? (kind === 'ship' ? 'Корабли' : 'Наземные войска') + ' · могут двигаться: ' + units.length + ' · выбрано: ' + picked.length
                : 'Могут двигаться: ' + all.length + ' отрядов');
            const names = new Map();
            for (const u of picked) {
                const def = FS_RULES.unitOf(s, u);
                const name = def ? def.name : u.id;
                names.set(name, (names.get(name) || 0) + 1);
            }
            if (picked.length) {
                ctx.selection = {
                    count: picked.length,
                    title: names.size === 1 ? [...names.keys()][0] : 'Отряды группы',
                    hint: 'Клик по сектору — идти · клик по отряду — убрать из группы',
                };
            }
            // Two separate flows — a ship does not march with the army and vice versa.
            for (const [id, icon, label, hint] of [
                ['ship', '🛦', 'Корабли', 'Двигать корабли: только пустота, штормы и переходы'],
                ['ground', '⛨', 'Наземные войска', 'Двигать войска: только миры, путь через свои области'],
            ]) {
                const count = all.filter(u => { const d = FS_RULES.unitOf(s, u); return d && d.type === id; }).length;
                ctx.actions.push({
                    kind: 'pick', icon, label, hint: hint + ' · ' + count,
                    selected: kind === id,
                    onClick: () => {
                        this.moveKind = this.moveKind === id ? null : id;
                        // The pieces of the other kind leave the group.
                        this.selected = this.selected.filter(uid => {
                            const u = s.units.find(x => x.id === uid);
                            const d = u && FS_RULES.unitOf(s, u);
                            return !this.moveKind || (d && d.type === this.moveKind);
                        });
                        this.updateSelection();
                        this.refresh();
                    },
                });
            }
            ctx.actions.push({
                kind: 'chip', icon: '✓', label: kind === 'ground' ? 'Выбрать все войска' : kind === 'ship' ? 'Выбрать все корабли' : 'Выбрать все отряды',
                onClick: () => {
                    this.selected = units.map(u => u.id);
                    this.updateSelection();
                    this.refresh();
                },
            });
            if (picked.length) {
                ctx.actions.push({
                    kind: 'chip', icon: '✕', label: 'Снять выделение',
                    onClick: () => { this.clearSelection(); this.refresh(); },
                });
            }
            ctx.actions.push({
                kind: 'primary', icon: '➤', label: 'Закончить движение',
                onClick: () => this.net.cmd({ type: 'endAdvance' }),
            });
        } else if (order.phase === 'strike') {
            ctx.title = 'Орбитальный удар';
            this.mode = 'strike';
            this.pending = this.pending || { ships: [], target: null };
            this.pending.ships = this.pending.ships || [];
            const ships = s.units.filter(u => u.seat === me && u.system === order.system
                && FS_RULES.unitOf(s, u) && FS_RULES.unitOf(s, u).type === 'ship');
            const sel = (this.pending && this.pending.ships) || [];
            ctx.text = 'Выберите корабли и щёлкните по миру.';
            ctx.status = this.pending && this.pending.target
                ? 'Цель: ' + this.pending.target.pos : 'Корабли: ' + sel.length + ' из ' + ships.length;
            for (const sh of ships) {
                const def = FS_RULES.unitOf(s, sh);
                ctx.actions.push({
                    kind: 'pick', icon: '🛦', label: def ? def.name : sh.id,
                    selected: sel.indexOf(sh.id) >= 0,
                    onClick: () => {
                        this.pending = this.pending || { ships: [], target: null };
                        this.pending.ships = this.pending.ships || [];
                        const i = this.pending.ships.indexOf(sh.id);
                        if (i >= 0) this.pending.ships.splice(i, 1); else this.pending.ships.push(sh.id);
                        this.refresh();
                    },
                });
            }
            ctx.actions.push({
                kind: 'primary', icon: '⌖', label: 'Нанести удар',
                onClick: () => {
                    const t = this.pending && this.pending.target;
                    const ships2 = (this.pending && this.pending.ships) || [];
                    if (!t || !ships2.length) { this.status = 'Нужны корабли и цель.'; this.refresh(); return; }
                    this.net.cmd({ type: 'orbitalStrike', system: t.system, pos: t.pos, ships: ships2 });
                },
            });
            ctx.actions.push({
                kind: 'secondary', label: 'Без удара — закончить приказ',
                onClick: () => this.net.cmd({ type: 'finishAdvance' }),
            });
        }
    }
    // --- the deploy order -----------------------------------------------------
    panelDeploy(s, ctx) {
        const me = s.seat;
        const p = s.players[me];
        const order = s.order;
        const sys = s.systems.find(x => x.id === order.system);
        const limit = FS_RULES.deployLimit(s, me, order.system);
        ctx.title = 'Развёртывание · ' + (sys ? sys.tile : '');
        ctx.text = this.mode === 'placeUnit' ? 'Щёлкните по месту для отряда.'
            : this.mode === 'placeStructure' ? 'Щёлкните по миру для постройки.'
                : 'Выберите покупку, затем место.';
        ctx.status = this.status || ('Материя: ' + p.materiel + ' · лимит развёртывания: ' + limit);
        const faction = FS_DATA.factions.find(f => f.id === p.faction);
        const supply = (p.supply && p.supply.units) || {};
        const structures = (p.supply && p.supply.structures) || { city: 0, factory: 0, bastion: 0 };
        ctx.tokens = [];
        for (const def of (faction ? faction.units : [])) {
            ctx.tokens.push({ icon: def.type === 'ship' ? '🛦' : '♟', label: def.name, count: supply[def.id] || 0, hint: 'В запасе · цена ' + def.cost });
        }
        for (const type of ['city', 'factory', 'bastion']) {
            ctx.tokens.push({ icon: '⌂', label: FS_RULES.structureName(type), count: structures[type] || 0, hint: 'В запасе' });
        }
        const mayBuild = faction && FS_RULES.hasFactory(s, me, order.system);
        if (mayBuild && (order.bought || 0) < limit) {
            for (const def of faction.units) {
                const n = supply[def.id] || 0;
                const blocked = !n || p.materiel < def.cost || def.kl > FS_RULES.commandLevel(s, me) || (def.forge && !(p.assets.forge || 0));
                ctx.actions.push({
                    kind: 'pick', icon: def.type === 'ship' ? '🛦' : '♟', label: def.name, count: n,
                    hint: def.cost + ' материи · КЛ ' + def.kl + ' · бой ' + def.combat + (def.forge ? ' · нужна кузница' : ''),
                    enabled: !blocked,
                    selected: this.mode === 'placeUnit' && this.pending && this.pending.unit === def.id,
                    onClick: () => {
                        this.mode = 'placeUnit';
                        this.pending = { unit: def.id, def };
                        this.highlightPlace(def);
                        this.refresh();
                    },
                });
            }
        }
        for (const type of ['city', 'factory', 'bastion']) {
            const n = structures[type] || 0;
            const free = order.freeStructure && order.freeStructureKind === type;
            const blocked = !n || order.structureBought || (p.materiel < FS_RULES.structureStats(type).cost && !free);
            ctx.actions.push({
                kind: 'pick', icon: '⌂', label: FS_RULES.structureName(type), count: n,
                hint: free ? 'бесплатно' : FS_RULES.structureStats(type).cost + ' материи',
                enabled: !blocked,
                selected: this.mode === 'placeStructure' && this.pending && this.pending.structure === type,
                onClick: () => {
                    this.mode = 'placeStructure';
                    this.pending = { structure: type };
                    this.highlightPlace(null);
                    this.refresh();
                },
            });
        }
        ctx.actions.push({
            kind: 'primary', icon: '➤', label: 'Закончить развёртывание',
            onClick: () => this.net.cmd({ type: 'finishDeploy' }),
        });
    }

    // --- the strategize order -------------------------------------------------
    // The areas of the active system where the piece may be placed.
    highlightPlace(def) {
        const s = this.state;
        const order = s.order;
        if (!order) return;
        const sys = s.systems.find(x => x.id === order.system);
        if (!sys) return;
        const list = [];
        for (const area of sys.areas) {
            // Only the places where the piece may stand.
            const ok = def
                ? FS_RULES.canPlaceUnit(s, s.seat, sys.id, area.pos, def).ok
                : FS_RULES.canPlaceStructure(s, s.seat, sys.id, area.pos).ok;
            if (!ok) continue;
            const p = FSView.areaPos(this.app, sys, area.pos, this.view.metrics);
            const h = this.app.location.terrain.heightAt(p.x, p.y);
            list.push({ x: p.x, y: h + 14, z: p.y });
        }
        FSView.highlight(this.view, list);
    }

    panelStrategize(s, ctx) {
        const me = s.seat;
        const p = s.players[me];
        ctx.title = 'Стратегия · улучшения';
        ctx.text = 'Купите одно боевое улучшение и одно улучшение приказа.';
        ctx.status = 'Материя: ' + p.materiel;
        // The upgrades are bought only with his units or structures in the system.
        if (!s.order || !FS_RULES.hasUnitsOrStructures(s, me, s.order.system)) {
            ctx.text = 'В активной системе нет ваших отрядов и построек — улучшения купить нельзя.';
            ctx.actions.push({
                kind: 'primary', icon: '➤', label: 'Закончить стратегию',
                onClick: () => this.net.cmd({ type: 'finishStrategize' }),
            });
            return;
        }
        // Only the cards the player may buy: the level of command and the materiel.
        const level = FS_RULES.commandLevel(s, me);
        const ccards = FS_DATA.combat.filter(c => c.faction === p.faction && c.upgrade);
        const mayBuy = c => c.kl <= level && c.cost <= p.materiel;
        // One combat upgrade and one order upgrade per order.
        if (!s.order.combatUpgrade) {
            for (const c of ccards.filter(mayBuy)) {
                ctx.actions.push({
                    kind: 'pick', icon: '⚔', label: c.name, count: c.cost,
                    hint: 'Боевое улучшение · КЛ ' + c.kl + ' · ' + (c.general || '') + ' ' + (c.unit || ''),
                    onClick: () => this.net.cmd({ type: 'buyUpgrade', kind: 'combat', card: c.name }),
                });
            }
        }
        const ocards = FS_DATA.orders.filter(c => c.faction === p.faction);
        if (!s.order.orderUpgrade) {
            for (const c of ocards.filter(mayBuy)) {
                ctx.actions.push({
                    kind: 'pick', icon: '⚑', label: c.name, count: c.cost,
                    hint: 'Улучшение приказа · ' + (c.text || ''),
                    onClick: () => this.net.cmd({ type: 'buyUpgrade', kind: 'order', card: c.name }),
                });
            }
        }
        ctx.actions.push({
            kind: 'primary', icon: '➤', label: 'Закончить стратегию',
            onClick: () => this.net.cmd({ type: 'finishStrategize' }),
        });
    }

    // --- the dominate order ---------------------------------------------------
    panelDominate(s, ctx) {
        ctx.title = 'Доминирование';
        ctx.text = (s.order.ability || '') + '\nРесурсы получены. Можете применить способность фракции.';
        ctx.status = '';
        // The prosperity: the player chooses the asset of his choice.
        for (let i = 0; i < (s.order.prosperity || 0); i++) {
            for (const asset of ['forge', 'cache', 'reinforcement']) {
                ctx.actions.push({
                    label: 'Процветание: ' + FS_RULES.assetName(asset),
                    onClick: () => this.net.cmd({ type: 'takeProsperity', asset }),
                });
            }
        }
        ctx.actions.push({
            label: 'Закончить приказ',
            onClick: () => this.net.cmd({ type: 'finishDominate' }),
        });
    }

    // --- the refresh phase ----------------------------------------------------
    panelRefresh(s, ctx) {
        const me = s.seat;
        const ev = s.event;
        const p = s.players[me];
        ctx.title = 'Обновление';
        if (!ev) { ctx.text = 'События сыграны.'; return; }
        if (ev.seat !== me) {
            const who = s.players[ev.seat] ? s.players[ev.seat].name : '—';
            ctx.text = 'Событие играет ' + who + '.';
            return;
        }
        const card = ev.card || ev.top;
        // The hand of the moment: every drawn card with how many copies of it the
        // player holds — "2× Такая-то", the same shape as the token list.
        if (!ev.chosen) {
            ctx.text = 'Выберите карту события из руки.';
            ctx.status = this.status || '';
            ctx.tokens = [
                { icon: '✧', label: 'Жетоны событий', count: (ev.drawn || []).length },
                { icon: '◈', label: 'Материя', count: p.materiel },
                { icon: '◎', label: 'Цели', count: p.objectives || 0 },
            ];
            if (!(ev.drawn || []).length) {
                ctx.text = 'Нет жетонов событий: вскрывается верхняя карта колоды (событие не разыгрывается, шторм всё равно ходит).';
                // Nothing to choose — the only way on is to resolve the opened card.
                ctx.actions.push({
                    kind: 'primary', icon: '➤', label: 'Разыграть событие',
                    onClick: () => this.net.cmd({ type: 'resolveEvent' }),
                });
            }
            const counts = new Map();
            for (const name of ev.drawn || []) counts.set(name, (counts.get(name) || 0) + 1);
            const faction = FS_DATA.factions.find(f => f.id === p.faction);
            void faction;
            ctx.handTitle = 'Карты в руке';
            ctx.hand = [...counts.entries()].map(([name, count]) => {
                const data = FS_DATA.events.find(e => e.faction === p.faction && e.name === name);
                return {
                    icon: data && data.type === 'scheme' ? '◈' : '✦',
                    count,
                    label: name,
                    kind: data ? (data.type === 'scheme' ? 'ПЛАН' : 'ТАКТИКА') : '',
                    hint: data ? (data.text || '') : '',
                    onClick: () => this.net.cmd({ type: 'drawEvent', card: name }),
                };
            });
            return;
        }
        const data = FS_DATA.events.find(e => e.faction === p.faction && e.name === ev.chosen);
        ctx.text = ((data && data.text) || '') + (card && card.storm ? ' · шторм: ' + card.storm.join(', ') : '');
        ctx.status = 'Шторм может сдвинуться на одно деление по стрелке карты.';
        const dirs = (card && card.storm && card.storm[0] !== 'any') ? card.storm : ['N', 'E', 'S', 'W'];
        const stormNames = { N: '⬆ сверху', E: '➡ справа', S: '⬇ снизу', W: '⬅ слева' };
        for (const storm of s.storms) {
            // Every player moves every storm once per round.
            if (storm.moved && storm.moved[me]) continue;
            ctx.actions.push({
                kind: 'pick', icon: '≋', label: 'Шторм',
                hint: 'Сдвинуть шторм (' + storm.system + ' ' + storm.side + ')',
                selected: this.mode === 'storm' && this.pending && this.pending.storm === storm.id,
                onClick: () => {
                    this.mode = 'storm';
                    this.pending = { storm: storm.id };
                    this.refresh();
                },
            });
        }
        if (this.mode === 'storm' && this.pending && this.pending.storm) {
            for (const dir of dirs) {
                ctx.actions.push({
                    kind: 'chip', icon: '≋', label: stormNames[dir] || dir,
                    onClick: () => {
                        this.net.cmd({ type: 'moveStorm', storm: this.pending.storm, dir });
                        this.mode = 'idle';
                        this.pending = null;
                    },
                });
            }
        }
        ctx.actions.push({
            kind: 'primary', icon: '➤', label: 'Разыграть событие',
            onClick: () => this.net.cmd({ type: 'resolveEvent' }),
        });
    }

    // --- the combat -----------------------------------------------------------
    panelCombat(s, ctx) {
        const c = s.combat;
        const me = s.seat;
        const side = me === c.attacker ? 'attacker' : me === c.defender ? 'defender' : null;
        const sys = s.systems.find(x => x.id === c.system);
        const foe = side === 'attacker' ? c.defender : c.attacker;
        const names = [s.players[c.attacker] ? s.players[c.attacker].name : '?',
            s.players[c.defender] ? s.players[c.defender].name : '?'];
        ctx.title = 'Бой — ' + (sys ? sys.tile : '') + ' — раунд ' + c.round + ' из 3';
        const diceText = (arr) => (arr || []).map(d => d === 'att' ? '⚔' : d === 'def' ? '🛡' : d === 'morale' ? '✦' : '·').join(' ');
        ctx.text = 'Атакующий: ' + names[0] + ' — ' + diceText(c.dice.attacker)
            + '\nЗащитник: ' + names[1] + ' — ' + diceText(c.dice.defender);
        if (!side) {
            ctx.text += '\nВы не участвуете в этом бою.';
            return;
        }
        const my = FS_RULES.combatValues(s, side);
        const their = FS_RULES.combatValues(s, side === 'attacker' ? 'defender' : 'attacker');
        ctx.text += '\nВаши значения: атака ' + my.att + ', оборона ' + my.def + ', мораль ' + my.morale
            + '. Противник: атака ' + their.att + ', оборона ' + their.def + ', мораль ' + their.morale
            + '. Ваши жетоны: атака ' + c.tokens[side].att + ', оборона ' + c.tokens[side].def + '.';
        ctx.status = '';
        switch (c.step) {
            case 'reinforce-attacker':
            case 'reinforce-defender': {
                if (c.step === 'reinforce-attacker' && side !== 'attacker') { ctx.text += '\nАтакующий выбирает подкрепления.'; return; }
                if (c.step === 'reinforce-defender' && side !== 'defender') { ctx.text += '\nЗащитник выбирает подкрепления.'; return; }
                const max = FS_RULES.maxReinforce(s, me, side);
                ctx.text += '\nПодкрепления (жетонов: ' + (s.players[me].assets.reinforcement || 0) + '):';
                for (let i = 0; i <= max; i++) {
                    ctx.actions.push({
                        kind: 'pick', label: String(i),
                        hint: i === 0 ? 'Без подкреплений' : 'Поставить жетонов: ' + i,
                        onClick: () => this.net.cmd({ type: 'combat', action: 'reinforce', count: i }),
                    });
                }
                return;
            }
            case 'choose-attacker':
            case 'choose-defender': {
                const whose = c.step === 'choose-attacker' ? 'attacker' : 'defender';
                if (whose !== side) { ctx.text += '\n' + (whose === 'attacker' ? 'Атакующий' : 'Защитник') + ' выбирает карту.'; return; }
                const hand = c.cards[side].hand;
                ctx.text += '\nВаша рука (' + hand.length + ' карт):';
                hand.forEach((name, i) => {
                    const data = FS_DATA.combat.find(x => x.faction === s.players[me].faction && x.name === name);
                    ctx.actions.push({
                        kind: 'pick',
                        label: name,
                        hint: data ? '⚔ ' + (data.icons.att || 0) + ' · 🛡 ' + (data.icons.def || 0) + ' · ✦ ' + (data.icons.morale || 0) : '',
                        onClick: () => {
                            this.net.cmd({ type: 'combat', action: 'playCard', index: i });
                            this.lastCard = data || null;
                        },
                    });
                });
                ctx.actions.push({
                    kind: 'chip', icon: '⤼', label: 'Пропустить карту',
                    onClick: () => this.net.cmd({ type: 'combat', action: 'skipCard' }),
                });
                if (this.lastCard) {
                    // The text of the card: the engine has already applied it.
                    ctx.text += '\n\n«' + this.lastCard.name + '»: ' + (this.lastCard.general || '')
                        + (this.lastCard.unit ? ' ' + this.lastCard.unit : '');
                }
                return;
            }
            case 'damage-attacker':
            case 'damage-defender': {
                const whose = c.step === 'damage-attacker' ? 'attacker' : 'defender';
                if (whose !== side) { ctx.text += '\nПротивник распределяет урон.'; return; }
                const damage = FS_RULES.combatDamageFor(s, side);
                ctx.text += '\nУрон: ' + damage + '. Выберите отряды, которые его получают.';
                const units = s.units.filter(u => u.seat === me && u.system === c.system && u.area === c.pos && !u.routed);
                for (const u of units) {
                    const def = FS_RULES.unitOf(s, u);
                    ctx.actions.push({
                        kind: 'pick',
                        icon: '☠',
                        label: def ? def.name : u.id,
                        selected: this.damageTargets.indexOf(u.id) >= 0,
                        onClick: () => {
                            const i = this.damageTargets.indexOf(u.id);
                            if (i >= 0) this.damageTargets.splice(i, 1); else this.damageTargets.push(u.id);
                            this.refresh();
                        },
                    });
                }
                ctx.actions.push({
                    kind: 'primary', icon: '☠', label: 'Принять урон (' + this.damageTargets.length + ')',
                    onClick: () => {
                        this.net.cmd({ type: 'combat', action: 'damage', targets: this.damageTargets.slice() });
                        this.damageTargets = [];
                    },
                });
                return;
            }
            case 'retreat': {
                if (c.loser !== me) { ctx.text += '\nПроигравший отступает.'; return; }
                ctx.text += '\nОтступление: выберите, куда отойти.';
                const areas = this.retreatAreas(s, c);
                for (const a of areas) {
                    const sys2 = s.systems.find(x => x.id === a.system);
                    ctx.actions.push({
                        kind: 'pick', icon: '⇱', label: (sys2 ? sys2.tile : a.system) + ' ' + a.pos,
                        hint: 'Отступить сюда',
                        onClick: () => this.net.cmd({ type: 'combat', action: 'retreat', target: a }),
                    });
                }
                ctx.actions.push({
                    kind: 'secondary', icon: '⌂', label: 'Остаться (деморализованы)',
                    onClick: () => this.net.cmd({ type: 'combat', action: 'retreat' }),
                });
                return;
            }
            default:
                return;
        }
    }

    // The end of a test battle: the field is free for the next one.
    panelTestBattle(s, ctx) {
        const t = s.testBattle || {};
        const foe = s.players[t.defender != null ? t.defender : 1];
        const attacker = s.players[t.attacker != null ? t.attacker : 0];
        ctx.title = 'Тестовый бой окончен';
        ctx.text = (t.kind === 'space' ? 'Космический' : 'Наземный') + ' бой в системе '
            + ((s.systems.find(x => x.id === t.system) || {}).tile || '?')
            + ': ' + (attacker ? attacker.name : '—') + ' против ' + (foe ? foe.name : '—') + '.';
        ctx.status = s.log.length ? s.log[s.log.length - 1].text : '';
        ctx.actions.push({
            kind: 'primary', icon: '↻', label: 'Ещё бой',
            onClick: () => this.net.cmd({ type: 'rematchBattle' }),
        });
        ctx.actions.push({
            kind: 'secondary', label: 'Другой тест (обновить страницу)',
            onClick: () => { if (typeof location !== 'undefined') location.reload(); },
        });
    }

    // The areas a defeated player may retreat to: the areas around the place
    // of the combat — the same system and the neighbouring ones.
    retreatAreas(s, c) {
        const out = FS_RULES.areasAround(s, c.system, c.pos);
        return out.slice(0, 8);
    }

    // The question of the effect: the player chooses the units, the dice, the
    // card or the place. Everything else the engine did itself.
    panelQuestion(s, ctx) {
        const pending = s.pending;
        const q = pending.question || {};
        const me = s.seat;
        ctx.title = 'Эффект карты';
        ctx.status = '';
        const must = pending.answerSeat === undefined ? pending.seat : pending.answerSeat;
        if (must !== me) {
            const who = s.players[must] ? s.players[must].name : '—';
            ctx.text = (q.text || 'Карта требует решения.') + '\nРешает: ' + who + '. Ждём.';
            return;
        }
        ctx.text = (q.text || 'Выберите.');
        const send = answer => {
            this.net.cmd({ type: 'effect', answer });
            this.effectPick = [];
            this.effectDie = null;
        };
        switch (q.kind) {
            case 'units': {
                const units = q.options.map(id => s.units.find(u => u.id === id)).filter(Boolean);
                this.effectPick = this.effectPick || [];
                for (const u of units) {
                    const def = FS_RULES.unitOf(s, u);
                    ctx.actions.push({
                        kind: 'pick',
                        label: (def ? def.name : u.id) + (this.effectPick.indexOf(u.id) >= 0 ? ' ✓' : ''),
                        onClick: () => {
                            const i = this.effectPick.indexOf(u.id);
                            if (i >= 0) this.effectPick.splice(i, 1); else this.effectPick.push(u.id);
                            this.refresh();
                        },
                    });
                }
                ctx.actions.push({
                    kind: 'primary',
                    label: 'Применить (' + this.effectPick.length + '/' + q.n + ')',
                    onClick: () => send({ units: this.effectPick.slice(0, q.n) }),
                });
                return;
            }
            case 'dice':
            case 'diceFace': {
                const combat = s.combat;
                const side = pending.seat === (combat ? combat.attacker : -1) ? 'attacker' : 'defender';
                const dice = combat ? (combat.dice[side] || []) : [];
                // The die of a dieFace question: the face is the second choice.
                const picked = q.kind === 'diceFace' ? this.effectDie : null;
                if (picked !== null && picked !== undefined) {
                    for (const face of ['att', 'def', 'morale']) {
                        ctx.actions.push({
                            label: 'Грань: ' + (face === 'att' ? 'атака' : face === 'def' ? 'оборона' : 'мораль'),
                            onClick: () => send({ dice: [picked], face }),
                        });
                    }
                    return;
                }
                for (const i of q.options) {
                    const d = dice[i];
                    ctx.actions.push({
                        kind: 'pick',
                        label: 'Кубик ' + (i + 1) + ': ' + (d === 'att' ? '⚔' : d === 'def' ? '🛡' : d === 'morale' ? '✦' : '·'),
                        onClick: () => {
                            if (q.kind === 'diceFace') {
                                this.effectDie = i;
                                this.refresh();
                                return;
                            }
                            send({ dice: [i] });
                        },
                    });
                }
                return;
            }
            case 'scheme': {
                for (const name of q.options) {
                    ctx.actions.push({
                        kind: 'pick',
                        label: 'Сбросить: ' + name,
                        onClick: () => send({ choice: q.options.indexOf(name) }),
                    });
                }
                return;
            }
            case 'face': {
                const combat = s.combat;
                const side = pending.seat === (combat ? combat.attacker : -1) ? 'attacker' : 'defender';
                const dice = combat ? (combat.dice[side] || []) : [];
                const faces = ['att', 'def', 'morale', 'blank'];
                for (const face of faces) {
                    const count = dice.filter(d => d === face).length;
                    if (!count) continue;
                    ctx.actions.push({
                        kind: 'pick',
                        label: (face === 'att' ? 'атака' : face === 'def' ? 'оборона' : face === 'morale' ? 'мораль' : 'пусто') + ' (' + count + ')',
                        onClick: () => send({ face }),
                    });
                }
                return;
            }
            case 'foes': {
                for (const seat of q.options) {
                    const p = s.players.find(x => x.seat === seat);
                    ctx.actions.push({
                        kind: 'pick',
                        label: p ? p.name : ('Игрок ' + (seat + 1)),
                        onClick: () => send({ foe: seat }),
                    });
                }
                return;
            }
            case 'assets':
            case 'assetType': {
                const names = { forge: 'кузница', cache: 'тайник', reinforcement: 'подкрепление' };
                for (const kind of q.options) {
                    ctx.actions.push({
                        kind: 'pick',
                        label: 'Жетон: ' + (names[kind] || kind),
                        onClick: () => send({ asset: kind }),
                    });
                }
                return;
            }
            case 'structures': {
                for (const id of q.options) {
                    const st = s.structures.find(x => x.id === id);
                    ctx.actions.push({
                        kind: 'pick',
                        label: st ? FS_RULES.structureName(st.type) : id,
                        onClick: () => send({ structure: id }),
                    });
                }
                return;
            }
            case 'structureTypes': {
                for (const t of q.options) {
                    ctx.actions.push({
                        kind: 'pick',
                        label: FS_RULES.structureName(t),
                        onClick: () => send({ type: t }),
                    });
                }
                return;
            }
            case 'cards': {
                for (const name of q.options) {
                    ctx.actions.push({
                        kind: 'pick',
                        label: name,
                        onClick: () => send({ card: name }),
                    });
                }
                return;
            }
            case 'areas': {
                for (const area of q.options) {
                    const sys = s.systems.find(x => x.id === area.system);
                    const world = sys && sys.areas.find(a => a.pos === area.pos);
                    ctx.actions.push({
                        kind: 'pick',
                        label: (sys ? sys.tile : area.system) + ' — ' + (world && world.world ? world.world.name : 'пустота'),
                        onClick: () => send({ area }),
                    });
                }
                return;
            }
            case 'systems': {
                for (const id of q.options) {
                    const sys = s.systems.find(x => x.id === id);
                    ctx.actions.push({
                        kind: 'pick',
                        label: sys ? sys.tile : id,
                        onClick: () => send({ system: id }),
                    });
                }
                return;
            }
            case 'types': {
                const faction = FS_DATA.factions.find(f => f.id === (s.players[me] ? s.players[me].faction : ''));
                for (const id of q.options) {
                    const def = faction ? faction.units.find(u => u.id === id) : null;
                    ctx.actions.push({
                        kind: 'pick',
                        label: def ? def.name : id,
                        onClick: () => send({ type: id }),
                    });
                }
                return;
            }
            case 'yesno': {
                ctx.actions.push({
                    kind: 'primary', icon: '✦',
                    label: 'Да — потратить кубик',
                    onClick: () => send({ dice: (q.options || []).slice(0, q.n || 1) }),
                });
                ctx.actions.push({
                    kind: 'secondary',
                    label: 'Нет — принять эффект',
                    onClick: () => send({ dice: [] }),
                });
                return;
            }
            case 'choice': {
                for (let i = 0; i < q.options.length; i++) {
                    const opt = q.options[i];
                    ctx.actions.push({
                        kind: 'pick',
                        label: (opt && opt.text) ? opt.text.slice(0, 60) : ('Вариант ' + (i + 1)),
                        onClick: () => send({ choice: i }),
                    });
                }
                return;
            }
            default:
                ctx.text = 'Эффект применён.';
        }
    }

    // --- the pointer ----------------------------------------------------------
    //
    // The board answers the mouse: a click picks a piece or a sector, the rings
    // mark the picked pieces, the arrow shows the march and the plaques confirm
    // the placements right above the place itself.

    // Which mesh of the board may be clicked at all.
    pickable(mesh) {
        if (!mesh || mesh.isPickable === false || mesh.isVisible === false) return false;
        if (typeof mesh.isEnabled === 'function' && !mesh.isEnabled()) return false;
        return !!(mesh.metadata && mesh.metadata.fs);
    }

    // The sector a picked mesh belongs to.
    areaTarget(meta, point) {
        const s = this.state;
        if (!s || !meta || !meta.system) return null;
        if (meta.pos) return { system: meta.system, pos: meta.pos };
        const sys = s.systems.find(x => x.id === meta.system);
        if (!sys) return null;
        if (!point || !sys.areas.length) return { system: sys.id, pos: null };
        // The sector whose centre is the nearest to the point under the pointer.
        let best = null;
        for (const area of sys.areas) {
            const p = FSView.areaPos(this.app, sys, area.pos, this.view.metrics);
            const d = Math.hypot(point.x - p.x, point.z - p.y);
            if (!best || d < best.d) best = { pos: area.pos, d };
        }
        return { system: sys.id, pos: best ? best.pos : null };
    }

    onHover(px, py) {
        const s = this.state;
        if (!s) return;
        const scene = this.view.scene;
        if (!scene || typeof scene.pick !== 'function') return;
        const pick = scene.pick(px, py, m => this.pickable(m));
        const target = pick && pick.hit && pick.pickedMesh ? this.areaTarget(pick.pickedMesh.metadata, pick.pickedPoint) : null;
        const same = (target && this.hover && target.system === this.hover.system && target.pos === this.hover.pos)
            || (!target && !this.hover);
        if (same) return;
        this.hover = target;
        this.updateArrow();
    }

    // --- what is picked on the board ------------------------------------------

    me() {
        const s = this.state;
        return s ? s.players[s.seat] : null;
    }

    myColor() {
        const p = this.me();
        return (p && p.color) || '#d8b873';
    }

    selectedUnits() {
        const s = this.state;
        if (!s || !this.selected) return [];
        return this.selected.map(id => s.units.find(u => u.id === id)).filter(Boolean);
    }

    toggleUnit(unit) {
        const i = this.selected.indexOf(unit.id);
        if (i >= 0) this.selected.splice(i, 1);
        else this.selected.push(unit.id);
        this.updateSelection();
    }

    clearSelection() {
        if (!this.selected.length) return;
        this.selected = [];
        this.updateSelection();
    }

    // The rings under the picked pieces and around the sectors they may reach.
    updateSelection() {
        const list = [];
        if (!this.selected) this.selected = [];
        for (const unit of this.selectedUnits()) {
            const pos = this.view.unitPositions && this.view.unitPositions.get(unit.id);
            if (!pos) continue;
            list.push({ x: pos.x, y: pos.y, z: pos.z, color: this.myColor() });
        }
        FSView.showSelection(this.app, this.view, list);
        this.highlightMoves();
        this.updateArrow();
    }

    // Every sector the picked group could march into gets a ring.
    highlightMoves() {
        const s = this.state;
        if (!s || this.mode !== 'move' || !s.order || !this.selected) { return; }
        const sys = s.systems.find(x => x.id === s.order.system);
        const units = this.selectedUnits();
        if (!sys || !units.length) { FSView.clearHighlights(this.view); return; }
        const list = [];
        for (const area of sys.areas) {
            const ok = units.some(u => FS_RULES.canMove(s, s.seat, u, { system: sys.id, pos: area.pos }).ok);
            if (!ok) continue;
            const disc = FSView.discAt(this.app, sys, area.pos, this.view.metrics);
            list.push({ x: disc.x, y: disc.y + 2, z: disc.z });
        }
        FSView.highlight(this.view, list);
    }

    selectionCentre() {
        let x = 0, y = 0, z = 0, n = 0;
        for (const unit of this.selectedUnits()) {
            const pos = this.view.unitPositions && this.view.unitPositions.get(unit.id);
            if (!pos) continue;
            x += pos.x; y += pos.y; z += pos.z; n++;
        }
        return n ? { x: x / n, y: y / n + 2, z: z / n } : null;
    }

    // The animated arrow from the group to the sector under the pointer.
    updateArrow() {
        const s = this.state, view = this.view;
        if (!s || this.mode !== 'move' || !this.selected || !this.selected.length || !this.hover) { FSView.hideArrow(view); return; }
        const sys = s.systems.find(x => x.id === this.hover.system);
        const from = this.selectionCentre();
        if (!sys || !from) { FSView.hideArrow(view); return; }
        let to;
        if (this.hover.pos) {
            const disc = FSView.discAt(this.app, sys, this.hover.pos, this.view.metrics);
            to = { x: disc.x, z: disc.z };
        } else {
            const p = FSView.tilePos(this.app, sys, this.view.metrics);
            to = { x: p.x, z: p.y };
        }
        const ok = this.selectedUnits().some(unit => FS_RULES.canMove(s, s.seat, unit, { system: sys.id, pos: this.hover.pos }).ok);
        FSView.showArrow(this.app, view, from, to, ok);
    }

    // --- the plaques over the board -------------------------------------------

    // What has to be confirmed right now, and where on the board it stands.
    plaqueInfo(s) {
        const metrics = this.view.metrics;
        if (this.mode === 'placeTile' && this.pending && this.pending.cell) {
            const cell = this.pending.cell;
            const p = FSView.tilePos(this.app, cell, metrics);
            const y = this.app.location.terrain.heightAt(p.x, p.y);
            return {
                world: { x: p.x, y: y + 30, z: p.y },
                view: {
                    kicker: 'Система ' + this.pending.tile + ' · ' + (this.pending.rotation * 90) + '°',
                    title: 'Подтвердить постановку системы',
                    hint: 'Q/E — поворот · F — другая сторона',
                    actions: [
                        { label: 'Поставить', icon: '✓', primary: true, onClick: () => this.confirmSetupTile() },
                        { label: 'Отмена', icon: '✕', onClick: () => this.cancelSetupTile() },
                    ],
                },
            };
        }
        if (this.mode === 'setupObjective' && this.pending && this.pending.pos) {
            const sys = s.systems.find(x => x.id === (s.setup && s.setup.currentSystem));
            if (!sys) return null;
            const area = sys.areas.find(a => a.pos === this.pending.pos);
            const disc = FSView.discAt(this.app, sys, this.pending.pos, metrics);
            const faction = FS_DATA.factions.find(f => f.id === this.pending.faction);
            return {
                world: { x: disc.x, y: disc.y + 26, z: disc.z },
                view: {
                    kicker: 'Жетон цели' + (faction ? ' · ' + faction.name : ''),
                    title: 'Поставить жетон цели',
                    hint: area && area.world ? area.world.name : '',
                    actions: [
                        { label: 'Поставить', icon: '✓', primary: true, onClick: () => this.confirmSetupObjective() },
                        { label: 'Отмена', icon: '✕', onClick: () => { this.pending.pos = null; FSView.clearGhost(this.view); this.refresh(); } },
                    ],
                },
            };
        }
        if (this.mode === 'order' && this.pending && this.pending.system) {
            const sys = s.systems.find(x => x.id === this.pending.system);
            const tok = sys && sys.tokens[sys.tokens.length - 1];
            if (!sys || !tok) return null;
            const p = FSView.tilePos(this.app, sys, metrics);
            const y = this.app.location.terrain.heightAt(p.x, p.y);
            /** @type {{label: string, icon: string, primary?: boolean, onClick: () => void}[]} */
            const actions = [{ label: 'Вскрыть', icon: '⚑', primary: true, onClick: () => this.resolveOrder(sys.id) }];
            if (tok.order !== 'strategize') {
                actions.push({ label: 'В колоду событий', icon: '⇢', onClick: () => this.resolveOrder(sys.id, true) });
            }
            actions.push({ label: 'Отмена', icon: '✕', onClick: () => { this.mode = 'idle'; this.pending = null; this.refresh(); } });
            return {
                world: { x: p.x, y: y + 34, z: p.y },
                view: {
                    kicker: 'Система ' + sys.tile,
                    title: 'Вскрыть приказ «' + FS_RULES.orderName(tok.order) + '»',
                    actions,
                },
            };
        }
        return null;
    }

    refreshPlaque() {
        const s = this.state;
        if (!s) { this.plaque = null; FSUI.setPlaque(null); return; }
        const info = this.plaqueInfo(s);
        this.plaque = info;
        if (!info) { FSUI.setPlaque(null); return; }
        FSUI.setPlaque(Object.assign({ x: 0, y: 0 }, info.view));
        this.movePlaque();
    }

    // The plaque follows the board while the camera moves.
    movePlaque() {
        const info = this.plaque;
        if (!info || !info.world) return;
        const p = FSView.project(this.app, info.world.x, info.world.y, info.world.z);
        if (p) FSUI.movePlaque(p.x, p.y - 14);
    }

    // --- the orders -----------------------------------------------------------

    resolveOrder(system, toEventDeck) {
        this.mode = 'idle';
        this.pending = null;
        const cmd = { type: 'resolveOrder', system };
        if (toEventDeck) cmd.toEventDeck = true;
        this.net.cmd(cmd);
        this.refresh();
    }

    confirmSetupObjective() {
        const s = this.state, p = this.pending;
        if (!s || !s.setup || !s.setup.myTurn || this.mode !== 'setupObjective' || !p || !p.pos) return;
        const sent = this.net.cmd({ type: 'setupObjective', faction: p.faction, pos: p.pos });
        this.pending = { faction: p.faction, pos: null };
        FSView.clearGhost(this.view);
        if (sent === false) this.status = 'Нет связи с сервером.';
        this.refresh();
    }

    // --- the clicks -----------------------------------------------------------

    bindPointer() {
        const canvas = this.app.location.view.world.canvas;
        if (!canvas) return;
        const rectOf = () => (canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : { left: 0, top: 0 });
        let down = null;
        canvas.addEventListener('pointerdown', e => { if (e.button === 0) down = { x: e.clientX, y: e.clientY, id: e.pointerId }; });
        canvas.addEventListener('pointerup', e => {
            if (!down || down.id !== e.pointerId) return;
            const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
            down = null;
            if (moved > 6) return;             // a drag — the camera
            const rect = rectOf();
            this.onClick(e.clientX - rect.left, e.clientY - rect.top);
        });
        // The arrow needs to know the sector under the pointer — but a drag is the camera.
        canvas.addEventListener('pointermove', e => {
            if (down) return;
            const now = Date.now();
            if (now - (this.hoverAt || 0) < 40) return;
            this.hoverAt = now;
            const rect = rectOf();
            this.onHover(e.clientX - rect.left, e.clientY - rect.top);
        });
        canvas.addEventListener('pointerleave', () => {
            this.hover = null;
            FSView.hideArrow(this.view);
        });
        canvas.addEventListener('pointercancel', () => { down = null; });
    }

    inspectAt(meta, point) {
        const state = this.state;
        if (!state || !meta || !meta.system) return;
        const target = this.areaTarget(meta, point);
        const pos = target ? target.pos : null;
        this.inspection = {
            system: meta.system,
            pos,
            unit: meta.fs === 'unit' ? meta.unit : null,
            structure: meta.fs === 'structure' ? meta.structure : null,
            storm: meta.fs === 'storm' ? meta.side : null,
        };
        FSView.showInspection(this.app, this.view, state, this.inspection);
        this.refresh();
    }

    // The click on a piece of the movement: pick the unit or march the group.
    clickMove(meta, target) {
        const s = this.state;
        if (!s || !target) return;
        if (meta.fs === 'unit') {
            const unit = s.units.find(u => u.id === meta.unit);
            if (unit && unit.seat === s.seat) {
                const movable = FS_RULES.movableUnits(s, s.seat).some(u => u.id === unit.id);
                if (!movable) {
                    this.status = 'Этот отряд уже не может двигаться.';
                    this.refresh();
                    return;
                }
                const def = FS_RULES.unitOf(s, unit);
                const type = def ? def.type : 'ground';
                // Ships and ground troops go in separate marches: a group already
                // picked is not mixed with the other kind.
                if (this.moveKind && this.moveKind !== type && this.selected.length) {
                    this.status = this.moveKind === 'ship'
                        ? 'В группе корабли. Снимите выделение, чтобы двинуть войска.'
                        : 'В группе войска. Снимите выделение, чтобы двинуть корабли.';
                    this.refresh();
                    return;
                }
                // The first click of the march also tells what is being moved.
                this.moveKind = type;
                this.status = '';
                this.toggleUnit(unit);
                this.refresh();
                return;
            }
        }
        if (!this.selected.length) {
            if (meta.fs === 'area' || meta.fs === 'system') this.inspectAt(meta, null);
            return;
        }
        if (!target.pos) { this.status = 'Выберите сектор, а не систему целиком.'; this.refresh(); return; }
        const units = this.selectedUnits().filter(u => FS_RULES.canMove(s, s.seat, u, { system: target.system, pos: target.pos }).ok);
        if (!units.length) { this.status = 'Эти отряды туда не пройдут.'; this.refresh(); return; }
        const left = this.selected.length - units.length;
        this.status = left > 0 ? 'Идут ' + units.length + ' из ' + this.selected.length + ' отрядов.' : '';
        this.net.cmd({ type: 'moveUnits', moves: units.map(u => ({ unit: u.id, system: target.system, pos: target.pos })) });
        // The troops that marched are no longer picked: the next click is a new march.
        this.selected = [];
        this.updateSelection();
        this.refresh();
    }

    onClick(px, py) {
        const s = this.state;
        if (!s) return;
        const scene = this.view.scene;
        const pick = scene.pick(px == null ? scene.pointerX : px, py == null ? scene.pointerY : py, m => this.pickable(m));
        if (!pick || !pick.hit || !pick.pickedMesh) {
            if (this.mode === 'move') this.clearSelection();
            return;
        }
        const meta = pick.pickedMesh.metadata;
        const point = pick.pickedPoint;
        const target = this.areaTarget(meta, point);
        // The board assembly: the storm is placed on a system.
        if (s.phase === 'setup' && s.setup && s.setup.myTurn && s.setup.stage === 'storms' && meta.system) {
            this.status = ''; this.mode = 'setupStorm'; this.pending = { system: meta.system };
            this.highlightSetupTargets(); this.refresh(); return;
        }
        // The movement lives on the board itself.
        if (this.mode === 'move') { this.clickMove(meta, target); return; }
        if (this.mode === 'idle') {
            // A click on an own order token opens it right there.
            if (meta.fs === 'order' && meta.seat === s.seat && s.phase === 'operations' && s.turn === s.seat && !s.order) {
                this.mode = 'order';
                this.pending = { system: meta.system };
                this.refresh();
                return;
            }
            this.inspectAt(meta, point);
            return;
        }
        if (this.mode === 'placeTile') {
            if (s.phase !== 'setup' || !s.setup || !s.setup.myTurn || meta.fs !== 'setupCell') return;
            if (this.setupSubmitting || !(s.setup.legalCells || []).some(c => c.row === meta.row && c.col === meta.col)) return;
            this.pending.cell = { row: meta.row, col: meta.col };
            this.status = '';
            this.updateSetupPreview();
            this.refresh();
            return;
        }
        if (this.mode === 'placeOrder') {
            // A unit or a structure also means its system.
            if (!target) return;
            this.net.cmd({ type: 'placeOrder', system: target.system, order: this.pending.order });
            this.mode = 'idle';
            this.pending = null;
            this.refresh();
            return;
        }
        if (this.mode === 'storm' || this.mode === 'order') {
            return;                            // the plaque and the buttons decide
        }
        // The island of the board assembly: the forces and the objectives.
        if (s.phase === 'setup' && s.setup && s.setup.myTurn && target && target.pos) {
            if (this.mode === 'setupUnit') this.net.cmd({ type: 'setupUnit', unit: this.pending.unit, pos: target.pos });
            else if (this.mode === 'setupStructure') this.net.cmd({ type: 'setupStructure', structure: this.pending.structure, pos: target.pos });
            else if (this.mode === 'setupObjective') {
                const system = s.systems.find(x => x.id === s.setup.currentSystem);
                if (!system || system.id !== target.system) return;
                const option = (s.setup.objectiveOptions || []).find(x => x.faction === this.pending.faction);
                if (!option || !option.areas.includes(target.pos)) { this.status = 'Здесь места цели нет.'; this.refresh(); return; }
                this.pending.pos = target.pos;
                // The token that is about to be placed glows on the world until the plaque confirms it.
                if (this.app && this.view && this.view.scene) {
                    const disc = FSView.discAt(this.app, system, target.pos, this.view.metrics);
                    const faction = FS_DATA.factions.find(f => f.id === this.pending.faction);
                    FSView.showGhost(this.app, this.view, disc, faction ? faction.color : '#d8b873');
                }
            }
            this.refresh();
            return;
        }
        if (this.mode === 'placeUnit') {
            if (!target) return;
            this.net.cmd({ type: 'buyUnit', unit: this.pending.unit, system: target.system, pos: target.pos });
            this.mode = 'idle';
            this.pending = null;
            this.refresh();
            return;
        }
        if (this.mode === 'placeStructure') {
            if (!target) return;
            this.net.cmd({ type: 'buyStructure', structure: this.pending.structure, system: target.system, pos: target.pos });
            this.mode = 'idle';
            this.pending = null;
            this.refresh();
            return;
        }
        if (this.mode === 'strike') {
            this.pending = this.pending || { ships: [], target: null };
            if (!target) return;
            this.pending.target = { system: target.system, pos: target.pos };
            this.refresh();
            return;
        }
    }

    update(dt) {
        // The plaque of the placement hangs over the system: it follows the board
        // while the camera pans, and is never hidden under the panel.
        void dt;
        if (this.plaque) this.movePlaque();
    }
}
