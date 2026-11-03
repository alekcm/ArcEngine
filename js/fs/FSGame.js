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
const FS_ORDER_ICONS = { advance: 'order.advance', deploy: 'order.deploy', strategize: 'order.strategize', dominate: 'order.dominate' };

// The three ways into the game on the lobby screen. The first one is the party
// itself; the other two are test modes for a single person who plays both seats.
const FS_TEST_MODES = [
    { id: 'game', icon: 'ui.menu', title: 'Обычная игра', text: 'Сборка галактики с нуля и партия по сети: 2–4 игрока.' },
    { id: 'map', icon: 'ui.card', title: 'Готовая карта', text: 'Галактика уже собрана, 1 на 1: игра начинается с планирования. Вы играете за обоих.' },
    { id: 'battle', icon: 'cube.att', title: 'Тест боя', text: 'Наземный или космический бой: выберите свои отряды и карты в колоде.' },
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
        // The hand of the battle at the bottom of the screen.
        /** @type {any[]} */
        this.hand = [];
        this.status = '';
        // The warning of the interface (a full area, for example) and the units
        // picked for the way back to the supply.
        /** @type {any} */ this.warn = '';
        // Марш в переполненную область ждёт подтверждения.
        /** @type {any} */ this.overflow = null;
        /** @type {string[]} */ this.trimPick = [];
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
        // The hand of the battle: a click on a card plays it.
        FSUI.onHandPlay = item => {
            if (!item || item.playable === false) return;
            const s = this.state;
            if (!s || !s.combat) return;
            this.net.cmd({ type: 'combat', action: 'playCard', index: item.index });
        };

        const params = new URLSearchParams(location.search);
        this.room = (params.get('room') || '').toUpperCase();
        this.name = params.get('name') || Store.get('fs.name') || '';
        this.id = Store.get('fs.id') || '';

        this.setupCamera();
        this.bindPointer();
        this.bindSetupKeys();
        this.bindUndoKey();
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
        this.focusArena(s);
        const ctx = { title: '', text: '', status: this.status || '', warn: this.warn || '', actions: [], mode: this.mode, setupCellSelected: false };
        // A new order (or a new step of it) — the pending action is dropped.
        const orderKey = s.order ? s.order.order + ':' + s.order.phase : '';
        if (this.orderKey !== orderKey) {
            this.orderKey = orderKey;
            this.mode = 'idle';
            this.pending = null;
            this.damageTargets = [];
            this.warn = '';
            this.overflow = null;
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
        // The troops over the capacity of an area: the player chooses which of them
        // go back to the supply before anything else happens.
        if ((s.trim || []).some(t => t.seat === me)) {
            this.panelTrim(s, ctx);
            ctx.mode = this.mode;
            this.refreshPlaque();
            FSUI.update(s, ctx);
            return;
        }
        // The damage of an orbital strike: the defender picks the units.
        if (s.strike) {
            if (s.strike.seat === me) this.panelStrikeDamage(s, ctx);
            else { ctx.title = 'Орбитальный удар'; ctx.text = 'Защитник распределяет урон.'; }
            ctx.mode = this.mode;
            this.refreshPlaque();
            FSUI.update(s, ctx);
            return;
        }
        if (s.over) {
            ctx.title = 'Игра окончена';
            ctx.text = s.shared && s.shared.length > 1
                ? 'Победа делится: ' + s.shared.map(seat => s.players[seat].name).join(' и ')
                : 'Побеждает: ' + (s.winner != null ? s.players[s.winner].name : '—');
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
        // The picking of the damage is a mode of its own: it is set again by the panel
        // of the battle below and it never outlives the step that asked for it.
        if (this.mode === 'damage') this.mode = 'idle';
        if (this.mode === 'retreat' && !(s.combat && s.combat.step === 'retreat')) this.mode = 'idle';
        if (this.mode === 'trim' && !(s.trim || []).some(t => t.seat === me)) this.mode = 'idle';
        if (!(s.trim || []).some(t => t.seat === me)) this.trimPick = [];
        if (this.mode === 'strike-damage' && !s.strike) this.mode = 'idle';
        this.hand = [];
        if (s.combat) this.panelCombat(s, ctx);
        ctx.battleHand = this.hand || [];
        if (!s.combat) ctx.battle = null;
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
                    icon: unit.type === 'ship' ? 'mark.ship' : 'mark.ground',
                    label: unit.name,
                    count: initial.units[unit.id] || 0,
                    hint: unit.type === 'ship' ? 'Встаёт в пустоту' : 'Встаёт на мир',
                });
            }
            const structureNames = { factory: 'Фабрика', bastion: 'Бастион', city: 'Город' };
            for (const type of ['factory', 'bastion', 'city']) {
                ctx.tokens.push({ icon: 'mark.city', label: structureNames[type], count: initial.structures[type] || 0, hint: 'Встаёт на мир' });
            }
            for (const [id, count] of Object.entries(initial.units)) {
                if (!count) continue;
                const def = faction && faction.units.find(u => u.id === id);
                ctx.actions.push({
                    kind: 'pick', icon: def && def.type === 'ship' ? 'mark.ship' : 'mark.ground', count,
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
                    kind: 'pick', icon: 'mark.city', count, label: structureNames[type],
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
                    kind: 'chip', icon: 'ui.undo', label: 'Убрать ' + (def ? def.name : unit.unit),
                    onClick: () => this.net.cmd({ type: 'removeSetupForce', kind: 'unit', id: unit.id }),
                });
            }
            for (const st of s.structures.filter(x => x.system === (sys && sys.id) && x.seat === s.seat)) {
                ctx.actions.push({
                    kind: 'chip', icon: 'ui.undo', label: 'Убрать ' + structureNames[st.type],
                    onClick: () => this.net.cmd({ type: 'removeSetupForce', kind: 'structure', id: st.id }),
                });
            }
            ctx.actions.push({ kind: 'primary', label: 'Завершить размещение сил', icon: 'ui.check', onClick: () => this.net.cmd({ type: 'finishSetupForces' }) });
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
                    icon: 'mark.objective',
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
                    if (legal) ctx.actions.push({ kind: 'pick', icon: 'ui.storm', label: name, onClick: () => this.net.cmd({ type: 'setupStorm', system: sys.id, side }) });
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
            ctx.actions.push({ kind: 'secondary', label: 'ui.undo Снять выбор тайла', onClick: () => this.cancelSetupTile() });
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

    // Escape during the movement: the last march of the advance order is rolled
    // back, one march a click. Escape also closes a pending choice.
    bindUndoKey() {
        if (typeof window === 'undefined' || !window.addEventListener) return;
        window.addEventListener('keydown', e => {
            const target = /** @type {HTMLElement | null} */ (e.target);
            if (target && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable)) return;
            if (e.key !== 'Escape' && e.code !== 'Escape') return;
            const s = this.state;
            if (!s) return;
            // Отмена работает и в начале боя: пока в нём ничего не сделано.
            const mine = s.order && s.order.seat === s.seat && s.order.order === 'advance'
                && (s.order.phase === 'move' || s.order.phase === 'combat');
            if (mine && (s.order.steps || []).length) {
                e.preventDefault();
                e.stopPropagation();
                this.net.cmd({ type: 'undoMove' });
                this.selected = [];
                this.moveKind = null;
                this.clearSelection();
                this.status = 'Марш отменён.';
                this.refresh();
                return;
            }
            if (this.mode !== 'idle') {
                this.mode = 'idle';
                this.pending = null;
                this.status = '';
                this.refresh();
            }
        }, true);
    }

    // The fight is a place of its own: while it lasts the camera stands over the
    // battle table, and afterwards it goes back to the zoom of the board.
    focusArena(s) {
        const c = s && s.combat;
        const key = c ? c.system + ':' + c.pos : null;
        if (this.arenaKey === key) return;
        const was = this.arenaKey;
        this.arenaKey = key;
        const camera = this.app && this.app.camera;
        if (!camera) return;
        if (c) {
            if (!this.boardZoom && camera.zoomTarget != null) this.boardZoom = camera.zoomTarget;
            const point = FSView.arenaFocus(this.app, s);
            if (!point) return;
            if (camera.lookAt) camera.lookAt(point.x, point.z);
            if (camera.zoomTarget != null) camera.zoomTarget = Math.max(1.35, camera.zoomTarget || 1);
        } else if (was && this.boardZoom && camera.zoomTarget != null) {
            camera.zoomTarget = this.boardZoom;
        }
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

    // The assets of the player as the rows of the panel: every kind is listed, and
    // a zero is a token as well.
    assetTokens(s, me) {
        const p = (s.players && s.players[me]) || {};
        const a = p.assets || {};
        return [
            { icon: 'asset.forge', label: 'Кузница', count: a.forge || 0 },
            { icon: 'asset.cache', label: 'Тайник', count: a.cache || 0 },
            { icon: 'ui.reinforce', label: 'Подкрепление', count: a.reinforcement || 0 },
        ];
    }

    // --- the planning phase ---------------------------------------------------
    panelPlanning(s, ctx) {
        const me = s.seat;
        const p = s.players[me];
        const left = Math.max(0, FS_RULES.ORDER_TOKENS + (p.extraOrderTokens || 0) - (p.placedTokens || 0));
        ctx.title = 'Планирование';
        // The tokens go one at a time, in a circle: while it is not your turn the
        // panel only says whose turn it is.
        if (s.turn !== me) {
            const who = s.players[s.turn] ? s.players[s.turn].name : '—';
            ctx.text = 'Жетон приказа выкладывает ' + who + '.';
            ctx.status = 'Осталось приказов у вас: ' + left + '.';
            ctx.tokens = [
                { icon: 'order.event', label: 'Приказы в руке', count: left },
                { icon: 'asset.materiel', label: 'Материя', count: p.materiel },
                { icon: 'mark.objective', label: 'Цели', count: p.objectives || 0 },
            ].concat(this.assetTokens(s, me));
            return;
        }
        ctx.text = this.mode === 'placeOrder'
            ? 'Щёлкните по системе с кольцом: приказ кладётся в свою систему или рядом со своей.'
            : 'Выберите приказ и щёлкните по системе. Приказ кладётся только в систему со своими '
                + 'отрядами или постройками либо в соседнюю с такой системой.';
        ctx.status = this.status || (left ? 'Осталось приказов: ' + left : 'Все приказы выложены.');
        ctx.tokens = [
            { icon: 'order.event', label: 'Приказы в руке', count: left },
            { icon: 'asset.materiel', label: 'Материя', count: p.materiel },
            { icon: 'mark.objective', label: 'Цели', count: p.objectives || 0 },
        ].concat(this.assetTokens(s, me));
        const kinds = [
            ['advance', 'Наступление', 'cube.att', 'Движение и бой'],
            ['deploy', 'Развёртывание', 'ui.reinforce', 'Покупка отрядов и построек'],
            ['strategize', 'Стратегия', 'order.strategize', 'Улучшения'],
            ['dominate', 'Доминирование', 'mark.city', 'Ресурсы и способность'],
        ];
        const supply = typeof FS_RULES.ORDER_SUPPLY === 'number' ? FS_RULES.ORDER_SUPPLY : 2;
        const laid = p.placedOf || {};
        for (const [order, name, icon, hint] of kinds) {
            const left = Math.max(0, supply - (laid[order] || 0));
            // Two tokens of every order: a kind that is spent is not offered again.
            if (!left) continue;
            ctx.actions.push({
                kind: 'pick', icon, label: name, count: left + '×',
                hint: hint + ' · осталось ' + left + ' из ' + supply,
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
            { icon: 'asset.materiel', label: 'Материя', count: s.players[me].materiel },
            { icon: 'order.strategize', label: 'Жетоны событий', count: s.players[me].eventTokens || 0 },
            { icon: 'mark.objective', label: 'Цели', count: s.players[me].objectives || 0 },
        ].concat(this.assetTokens(s, me));
        for (const o of FS_RULES.availableOrders(s, me)) {
            const sys = s.systems.find(x => x.id === o.system);
            if (!sys) continue;
            const tok = sys.tokens[sys.tokens.length - 1];
            ctx.actions.push({
                kind: 'pick', icon: FS_ORDER_ICONS[tok.order] || 'order.event', label: sys.tile,
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
        // Марш в переполненную область: игрок подтверждает его сам.
        if (this.overflow) {
            const picked = (this.overflow.units || [])
                .map(id => s.units.find(u => u.id === id))
                .filter(Boolean);
            const goal = { system: this.overflow.system, pos: this.overflow.pos };
            ctx.actions.push({
                kind: 'primary', icon: 'ui.next', label: 'Двинуть всё равно',
                hint: 'часть отрядов погибнет после приказа',
                onClick: () => {
                    this.overflow = null;
                    this.warn = '';
                    if (!picked.length) { this.status = 'Эти отряды уже не могут идти.'; this.refresh(); return; }
                    this.sendAdvance(picked, goal);
                },
            });
        }
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
            // Движение идёт двумя шагами: сначала корабли, затем наземные войска.
            const step = order.moveStep === 'ground' ? 'ground' : 'ships';
            /** @type {'ship' | 'ground'} */
            const kindOfStep = step === 'ground' ? 'ground' : 'ship';
            this.moveKind = kindOfStep;
            ctx.title = step === 'ships' ? 'Наступление · корабли' : 'Наступление · наземные войска';
            const kind = this.moveKind;
            const all = FS_RULES.movableUnits(s, me);
            const units = kind ? all.filter(u => { const d = FS_RULES.unitOf(s, u); return d && d.type === kind; }) : all;
            const picked = this.selectedUnits();
            ctx.text = picked.length
                ? 'Клик по сектору — отряды идут туда.'
                : step === 'ships' ? 'Клик по кораблю на доске — взять его.'
                    : 'Клик по войску на доске — взять его.';
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
                    hint: 'Клик по сектору — идти · правый клик по отряду — убрать',
                };
            }
            // The step is not a choice any more: the rules move the ships first.
            ctx.actions.push({
                kind: 'chip', icon: step === 'ships' ? 'mark.ship' : 'mark.bastion',
                label: step === 'ships' ? 'Шаг 1 из 2 · корабли' : 'Шаг 2 из 2 · наземные войска',
                hint: step === 'ships'
                    ? 'Только пустота активной системы; путь не нужен'
                    : 'Только миры; путь через свои области',
                selected: true,
                onClick: () => this.refresh(),
            });
            if (picked.length) {
                ctx.actions.push({
                    kind: 'chip', icon: 'ui.close', label: 'Снять выделение',
                    onClick: () => { this.clearSelection(); this.refresh(); },
                });
            }
            ctx.actions.push({
                kind: 'primary', icon: 'ui.next',
                label: step === 'ships' ? 'Закончить движение кораблей' : 'Закончить движение',
                onClick: () => this.net.cmd({ type: 'endAdvance' }),
            });
            if ((order.steps || []).length) {
                ctx.actions.push({
                    kind: 'chip', icon: 'ui.close', label: 'Вернуть последний ход',
                    onClick: () => this.net.cmd({ type: 'undoMove' }),
                });
            }
        } else if (order.phase === 'combat') {
            // Бой начался, но ничего в нём ещё не сделано: ход можно вернуть.
            ctx.actions.push({
                kind: 'chip', icon: 'ui.close', label: 'Вернуть последний ход',
                hint: 'пока в бою не потрачено ни одного кубика',
                onClick: () => this.net.cmd({ type: 'undoMove' }),
            });
        } else if (order.phase === 'strike') {
            ctx.title = 'Орбитальный удар';
            this.mode = 'strike';
            // The engine names the pairs of a void and a world: the ships shoot from one
            // void into the world next to it, and only at an enemy world.
            const targets = FS_RULES.orbitalStrikeTargets(s, me);
            ctx.text = targets.length ? 'Щёлкните по миру, чтобы ударить с орбиты.' : 'Цели нет.';
            ctx.status = 'Корабли в пустоте бьют по соседнему миру.';
            for (const t of targets) {
                const sys2 = s.systems.find(x => x.id === t.system);
                const area = sys2 ? sys2.areas.find(a => a.pos === t.pos) : null;
                ctx.actions.push({
                    kind: 'pick', icon: 'mark.damage',
                    label: area && area.world ? area.world.name : t.pos,
                    hint: 'Удар из пустоты ' + t.from + ' · кораблей ' + t.ships.length,
                    onClick: () => this.net.cmd({ type: 'orbitalStrike', system: t.system, pos: t.pos, from: t.from }),
                });
            }
            ctx.actions.push({
                kind: 'secondary', label: 'Без удара — закончить приказ',
                onClick: () => this.net.cmd({ type: 'finishAdvance' }),
            });
        }
    }
    // A ring around each of the given areas: the board itself says where the
    // choice has to be made.
    ringAreas(list) {
        const s = this.state;
        if (!s || !this.view.metrics) return;
        const out = [];
        for (const it of list) {
            const sys = s.systems.find(x => x.id === it.system);
            if (!sys) continue;
            const p = FSView.areaPos(this.app, sys, it.pos, this.view.metrics);
            out.push({ x: p.x, y: this.app.location.terrain.heightAt(p.x, p.y) + 14, z: p.y });
        }
        FSView.highlight(this.view, out);
    }

    // --- the troops over the capacity of an area -------------------------------
    //
    // The rule never takes the troops of a player away behind his back: he chooses
    // which models go back to the supply. The choice is made on the board — the
    // over-full area is ringed and a click on a model sends it away.
    panelTrim(s, ctx) {
        const me = s.seat;
        const entry = (s.trim || []).find(t => t.seat === me);
        this.mode = 'trim';
        ctx.title = 'Сверх вместимости';
        ctx.text = 'Щёлкните по своему отряду на доске — он вернётся в запас.';
        const sys = entry ? s.systems.find(x => x.id === entry.system) : null;
        const area = sys && entry ? sys.areas.find(a => a.pos === entry.pos) : null;
        const mine = entry ? s.units.filter(u => u.seat === me && u.system === entry.system && u.area === entry.pos) : [];
        ctx.status = entry
            ? (area && area.world ? area.world.name : (sys ? sys.tile : 'область'))
                + ' · отрядов ' + mine.length + ' · вместимость ' + entry.cap
            : '';
        this.ringAreas((s.trim || []).filter(t => t.seat === me));
        // The units that go back are picked first and confirmed after: the click
        // only marks them, nothing leaves the board until the player agrees.
        const excess = entry ? Math.max(0, mine.length - entry.cap) : 0;
        this.trimPick = (this.trimPick || []).filter(id => mine.some(u => u.id === id));
        ctx.text = this.trimPick.length
            ? 'Отмечено ' + this.trimPick.length + ' из ' + excess + '. Подтвердите — и они вернутся в запас.'
            : (excess > 0
                ? 'В области больше отрядов, чем она вмещает: лишние ' + excess
                    + ' погибнут. Отметьте мышью, кого отправить в запас, и подтвердите.'
                : 'Отметьте мышью своих отрядов, кого отправить в запас, и подтвердите.');
        // One chip per kind of model: a click marks one model of that kind.
        const kinds = new Map();
        for (const u of mine) {
            const def = FS_RULES.unitOf(s, u);
            const name = def ? def.name : u.id;
            if (!kinds.has(name)) kinds.set(name, []);
            kinds.get(name).push(u);
        }
        for (const [name, list] of kinds) {
            const picked = list.filter(u => this.trimPick.includes(u.id)).length;
            ctx.actions.push({
                kind: 'chip', icon: 'ui.down', label: name,
                hint: 'в запас · ' + list.length + (picked ? ' · отмечено ' + picked : ''),
                selected: picked > 0,
                onClick: () => {
                    const free = list.find(u => !this.trimPick.includes(u.id));
                    if (free) this.trimPick.push(free.id);
                    else this.trimPick = this.trimPick.filter(id => !list.some(u => u.id === id));
                    this.refresh();
                },
            });
        }
        if (this.trimPick.length) {
            ctx.actions.push({
                kind: 'primary', icon: 'ui.check', label: 'Подтвердить',
                hint: this.trimPick.length + ' в запас',
                onClick: () => {
                    const picks = this.trimPick.slice();
                    this.trimPick = [];
                    for (const id of picks) {
                        this.net.cmd({ type: 'trimUnit', system: entry.system, pos: entry.pos, unit: id });
                    }
                },
            });
            ctx.actions.push({
                kind: 'chip', icon: 'ui.close', label: 'Сбросить отметки',
                onClick: () => { this.trimPick = []; this.refresh(); },
            });
        }
    }

    // --- the damage of an orbital strike --------------------------------------
    //
    // The hits of the strike are counted by the engine but the defender chooses his
    // own models that take them: the choice is made on the board, in the struck area.
    panelStrikeDamage(s, ctx) {
        const me = s.seat;
        const st = s.strike;
        this.mode = 'strike-damage';
        ctx.title = 'Урон с орбиты';
        ctx.text = 'Щёлкните по своему отряду — он принимает удар.';
        const sys = s.systems.find(x => x.id === st.system);
        const area = sys ? sys.areas.find(a => a.pos === st.pos) : null;
        const mine = s.units.filter(u => u.seat === me && u.system === st.system && u.area === st.pos);
        ctx.status = 'Ударов осталось: ' + st.left
            + (area && area.world ? ' · ' + area.world.name : '');
        this.ringAreas([{ system: st.system, pos: st.pos }]);
        const kinds = new Map();
        for (const u of mine) {
            const def = FS_RULES.unitOf(s, u);
            const name = def ? def.name : u.id;
            if (!kinds.has(name)) kinds.set(name, []);
            kinds.get(name).push(u);
        }
        for (const [name, list] of kinds) {
            ctx.actions.push({
                kind: 'chip', icon: 'mark.damage', label: name, hint: 'принять удар · ' + list.length,
                onClick: () => this.net.cmd({ type: 'strikeDamage', unit: list[list.length - 1].id }),
            });
        }
    }

    // --- the deploy order -----------------------------------------------------
    // Two steps, as the rules say: the units first, then one structure. Nothing
    // is paid until the player presses "finish": the purchases of the order are
    // a list, and a right click takes any of them back.
    panelDeploy(s, ctx) {
        const me = s.seat;
        const p = s.players[me];
        const order = s.order;
        const step = FS_RULES.deployStep(order);
        const limit = FS_RULES.deployLimit(s, me, order.system);
        const spent = FS_RULES.spentOf(order);
        const canStructureFirst = !!order.structureFirst && step === 'units';
        ctx.title = 'Развёртывание';
        ctx.text = step === 'units'
            ? 'Сначала отряды: ставьте сколько нужно, материя спишется в конце приказа.'
            : 'Теперь постройка — одна на приказ.';
        ctx.status = this.status || ('Материя: ' + p.materiel
            + (spent ? ' · в приказе: ' + spent : '')
            + (step === 'units' ? ' · лимит развёртывания: ' + limit : ''));
        const faction = FS_DATA.factions.find(f => f.id === p.faction);
        const supply = (p.supply && p.supply.units) || {};
        ctx.tokens = [];
        for (const def of (faction ? faction.units : [])) {
            ctx.tokens.push({ icon: def.type === 'ship' ? 'mark.ship' : 'mark.ground', label: def.name, count: supply[def.id] || 0, hint: 'В запасе · цена ' + def.cost });
        }
        // The two ways of paying less: a cache token for two materiel, a forge token
        // for one command level. Both are chosen before the purchase.
        const opts = this.deployOpts = this.deployOpts || { cache: false, forgeKl: false };
        const canCache = (p.assets.cache || 0) > 0;
        const canForge = (p.assets.forge || 0) > 0;
        if (!canCache) opts.cache = false;
        if (!canForge) opts.forgeKl = false;
        const cl = FS_RULES.commandLevel(s, me);
        const mayBuild = faction && FS_RULES.hasFactory(s, me, order.system);
        if (step === 'units' && mayBuild && (order.bought || 0) < limit) {
            for (const def of faction.units) {
                const n = supply[def.id] || 0;
                const cost = Math.max(0, def.cost - (opts.cache ? 2 : 0));
                const kl = def.kl - (opts.forgeKl ? 1 : 0);
                const blocked = !n || p.materiel - spent < cost || kl > cl || (def.forge && !(p.assets.forge || 0));
                ctx.actions.push({
                    kind: 'pick', icon: def.type === 'ship' ? 'mark.ship' : 'mark.ground', label: def.name, count: n,
                    hint: cost + ' материи · КЛ ' + Math.max(0, kl) + ' · бой ' + def.combat + (def.forge ? ' · нужна кузница' : ''),
                    enabled: !blocked,
                    selected: this.mode === 'placeUnit' && this.pending && this.pending.unit === def.id,
                    onClick: () => {
                        this.mode = 'placeUnit';
                        this.pending = { unit: def.id, def, cache: opts.cache, forgeKl: opts.forgeKl };
                        this.highlightPlace(def);
                        this.refresh();
                    },
                });
            }
            if (canCache) {
                ctx.actions.push({
                    kind: 'chip', icon: 'asset.materiel', label: 'Тайник: −2 материи',
                    hint: 'Тайников: ' + (p.assets.cache || 0),
                    selected: opts.cache,
                    onClick: () => { opts.cache = !opts.cache; this.refresh(); },
                });
            }
            if (canForge) {
                ctx.actions.push({
                    kind: 'chip', icon: 'asset.materiel', label: 'Кузница: КЛ −1',
                    hint: 'Кузниц: ' + (p.assets.forge || 0),
                    selected: opts.forgeKl,
                    onClick: () => { opts.forgeKl = !opts.forgeKl; this.refresh(); },
                });
            }
        }
        // The structure: the second step of the order (or the first one with the
        // card of the Orks "Строй быстрее!").
        if (step === 'structures' || canStructureFirst) {
            for (const type of ['city', 'factory', 'bastion']) {
                const can = FS_RULES.canTakeStructure(s, me, type);
                const free = order.freeStructure && order.freeStructureKind === type;
                const price = free ? 0 : Math.max(0, FS_RULES.structureStats(type).cost - (opts.cache ? 2 : 0));
                const blocked = !can.ok || order.structureBought || (p.materiel - spent < price && !free);
                ctx.actions.push({
                    kind: 'pick', icon: 'mark.city', label: FS_RULES.structureName(type),
                    hint: free ? 'бесплатно' : price + ' материи' + (can.ok ? '' : ' · ' + can.error),
                    enabled: !blocked,
                    selected: this.mode === 'placeStructure' && this.pending && this.pending.structure === type,
                    onClick: () => {
                        this.mode = 'placeStructure';
                        this.pending = { structure: type, cache: opts.cache };
                        this.highlightPlace(null);
                        this.refresh();
                    },
                });
            }
        }
        if ((order.purchases || []).length) {
            ctx.actions.push({
                kind: 'chip', icon: 'ui.close', label: 'Снять последнюю покупку',
                hint: 'правый клик по фигуре — снять любую',
                onClick: () => this.net.cmd({ type: 'undoPurchase' }),
            });
        }
        if (step === 'units') {
            ctx.actions.push({
                kind: 'primary', icon: 'ui.next', label: 'Закончить размещение отрядов',
                onClick: () => this.net.cmd({ type: 'deployStructures' }),
            });
        } else {
            ctx.actions.push({
                kind: 'primary', icon: 'ui.check', label: 'Закончить развёртывание',
                hint: spent ? 'спишется ' + spent + ' материи' : '',
                onClick: () => this.net.cmd({ type: 'finishDeploy' }),
            });
        }
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
                kind: 'primary', icon: 'ui.next', label: 'Закончить стратегию',
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
                    kind: 'pick', icon: 'cube.att', label: c.name, count: c.cost,
                    hint: 'Боевое улучшение · КЛ ' + c.kl + ' · ' + (c.general || '') + ' ' + (c.unit || ''),
                    onClick: () => this.net.cmd({ type: 'buyUpgrade', kind: 'combat', card: c.name }),
                });
            }
        }
        const ocards = FS_DATA.orders.filter(c => c.faction === p.faction);
        if (!s.order.orderUpgrade) {
            for (const c of ocards.filter(mayBuy)) {
                ctx.actions.push({
                    kind: 'pick', icon: 'order.event', label: c.name, count: c.cost,
                    hint: 'Улучшение приказа · ' + (c.text || ''),
                    onClick: () => this.net.cmd({ type: 'buyUpgrade', kind: 'order', card: c.name }),
                });
            }
        }
        ctx.actions.push({
            kind: 'primary', icon: 'ui.next', label: 'Закончить стратегию',
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
                { icon: 'order.strategize', label: 'Жетоны событий', count: (ev.drawn || []).length },
                { icon: 'asset.materiel', label: 'Материя', count: p.materiel },
                { icon: 'mark.objective', label: 'Цели', count: p.objectives || 0 },
            ];
            if (!(ev.drawn || []).length) {
                ctx.text = 'Нет жетонов событий: вскрывается верхняя карта колоды (событие не разыгрывается, шторм всё равно ходит).';
                // Nothing to choose — the only way on is to resolve the opened card.
                ctx.actions.push({
                    kind: 'primary', icon: 'ui.next', label: 'Разыграть событие',
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
                    icon: data && data.type === 'scheme' ? 'asset.materiel' : 'cube.morale',
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
        const stormNames = { N: 'ui.up сверху', E: 'ui.right справа', S: 'ui.down снизу', W: 'ui.left слева' };
        for (const storm of s.storms) {
            // Every player moves every storm once per round.
            if (storm.moved && storm.moved[me]) continue;
            ctx.actions.push({
                kind: 'pick', icon: 'ui.storm', label: 'Шторм',
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
                    kind: 'chip', icon: 'ui.storm', label: stormNames[dir] || dir,
                    onClick: () => {
                        this.net.cmd({ type: 'moveStorm', storm: this.pending.storm, dir });
                        this.mode = 'idle';
                        this.pending = null;
                    },
                });
            }
        }
        ctx.actions.push({
            kind: 'primary', icon: 'ui.next', label: 'Разыграть событие',
            onClick: () => this.net.cmd({ type: 'resolveEvent' }),
        });
    }

    // --- the combat -----------------------------------------------------------
    //
    // A fight is played on its own table: the miniatures, the dice and the cards
    // lie on it, in the world. This panel says only whose step it is and what can
    // be pressed now — and never a word about the place of the battle.
    panelCombat(s, ctx) {
        const c = s.combat;
        const me = s.seat;
        const side = me === c.attacker ? 'attacker' : me === c.defender ? 'defender' : null;
        const other = side === 'attacker' ? 'defender' : 'attacker';
        const nameOf = which => (s.players[which === 'attacker' ? c.attacker : c.defender] || {}).name || '?';
        const names = [nameOf('attacker'), nameOf('defender')];
        ctx.title = 'Бой · раунд ' + c.round + ' из ' + (c.maxRounds || 3);
        const sideOf = (id) => {
            const seat = id === 'attacker' ? c.attacker : c.defender;
            const p = s.players[seat] || {};
            const values = FS_RULES.combatValues(s, id);
            /** @type {{att: number, def: number, morale: number}} */
            const none = { att: 0, def: 0, morale: 0 };
            const played = (c.cards[id].played || []).map(x => (x.card && x.card.icons) || none);
            return {
                side: id, seat,
                name: p.name || '?',
                color: p.color || FSView.factionColor(p.faction),
                faction: p.faction,
                dice: (c.dice[id] || []).slice(),
                tokens: { att: c.tokens[id].att || 0, def: c.tokens[id].def || 0 },
                reinforce: (c.reinforce && c.reinforce[id]) || 0,
                cards: played,
                values,
                takes: FS_RULES.combatDamageFor(s, id),
                hand: (c.cards[id].hand || []).length,
                closed: !!(c.chosen && c.chosen[id]),
                mine: id === side,
            };
        };
        // The score of the fight only: the place is on the board, not in the panel.
        ctx.battle = {
            round: c.round,
            maxRounds: c.maxRounds || 3,
            step: c.step,
            mine: side,
            sides: [sideOf('attacker'), sideOf('defender')],
            names,
        };
        if (!side) {
            ctx.text = 'Вы смотрите этот бой.';
            return;
        }
        ctx.status = '';
        switch (c.step) {
            case 'reinforce-attacker':
            case 'reinforce-defender': {
                const whose = c.step === 'reinforce-attacker' ? 'attacker' : 'defender';
                if (whose !== side) { ctx.text = 'Подкрепления ставит ' + nameOf(whose) + '.'; return; }
                const max = FS_RULES.maxReinforce(s, me, side);
                // The question exists only when the player really has the tokens.
                if (max <= 0) { ctx.text = 'Подкреплений нет.'; return; }
                ctx.text = 'Подкрепление: ' + (s.players[me].assets.reinforcement || 0) + ' жетон(ов) в руке.';
                for (let i = 0; i <= max; i++) {
                    ctx.actions.push({
                        kind: 'pick', icon: i ? 'ui.reinforce' : 'ui.next',
                        label: i === 0 ? 'Без подкреплений' : String(i),
                        count: i ? '1×' : null,
                        hint: 'Подкрепление даёт жетоны атаки и обороны',
                        onClick: () => this.net.cmd({ type: 'combat', action: 'reinforce', count: i }),
                    });
                }
                return;
            }
            case 'choose-attacker':
            case 'choose-defender': {
                const whose = c.step === 'choose-attacker' ? 'attacker' : 'defender';
                // The cards of the table are the hand of the player: the bottom bar
                // draws them as cards, the table itself shows them lying down.
                this.fillHand(s, side, whose === side);
                if (whose !== side) {
                    ctx.text = 'Карту выбирает ' + nameOf(whose) + '.';
                    return;
                }
                ctx.text = 'Возьмите карту со стола — карту нельзя пропустить.';
                ctx.status = 'В руке ' + (c.cards[side].hand || []).length + ' карт.';
                return;
            }
            case 'damage-attacker':
            case 'damage-defender': {
                const whose = c.step === 'damage-attacker' ? 'attacker' : 'defender';
                if (whose !== side) { ctx.text = 'Урон распределяет ' + nameOf(whose) + '.'; return; }
                const damage = FS_RULES.combatDamageFor(s, side);
                // The pieces of the table take the damage; the mouse picks them.
                this.mode = 'damage';
                const preview = FS_RULES.damagePreview(s, side, this.damageTargets);
                const rows = FS_RULES.damageCandidates(s, side).map(x => {
                    const row = preview.rows.find(r => r.id === x.id);
                    return {
                        id: x.id, name: x.name, health: x.health, morale: x.morale,
                        routed: x.routed, kind: x.kind,
                        take: row ? row.take : 0,
                        destroyed: row ? row.destroyed : false,
                        demoralised: row ? !!row.routed && !row.destroyed : false,
                        selected: this.damageTargets.indexOf(x.id) >= 0,
                    };
                });
                ctx.battle.damage = {
                    total: damage,
                    left: preview.left,
                    placed: preview.placed,
                    rows,
                };
                ctx.text = damage
                    ? 'Урон ' + damage + ': щёлкните по отрядам на столе.'
                    : 'Щиты выдержали удар.';
                ctx.status = damage ? 'Осталось распределить: ' + preview.left : '';
                for (const row of rows) {
                    ctx.actions.push({
                        kind: 'pick', icon: row.kind === 'structure' ? 'mark.bastion' : 'mark.ground',
                        label: row.name, count: String(row.health),
                        hint: row.routed ? 'Деморализован' : (row.demoralised ? 'Будет деморализован' : 'В строю'),
                        selected: row.selected,
                        onClick: () => this.toggleDamage(row.id),
                    });
                }
                if (damage) {
                    const allPicked = rows.length > 0 && rows.every(r => r.selected);
                    const ready = preview.left === 0 || allPicked;
                    ctx.actions.push({
                        kind: 'primary', icon: 'mark.damage',
                        label: ready ? 'Принять урон' : 'Разложите урон (осталось ' + preview.left + ')',
                        enabled: ready,
                        onClick: () => {
                            if (preview.left > 0 && !allPicked) {
                                this.status = 'Осталось распределить ' + preview.left + ' урона.';
                                this.refresh();
                                return;
                            }
                            this.net.cmd({ type: 'combat', action: 'damage', targets: this.damageTargets.slice() });
                            this.damageTargets = [];
                            this.mode = 'idle';
                        },
                    });
                }
                return;
            }
            case 'retreat': {
                if (c.loser !== me) { ctx.text = 'Проигравший отступает.'; return; }
                // The areas the rules allow are named by the engine; the player picks
                // one on the board or in the list.
                this.mode = 'retreat';
                const areas = FS_RULES.retreatTargets(s, me);
                ctx.status = areas.length ? 'Куда отойти — на карте.' : 'Отходить некуда: отряды гибнут.';
                ctx.text = areas.length ? 'Отступление: щёлкните по области на доске.' : 'Области для отступления нет.';
                for (const a of areas) {
                    const sys2 = s.systems.find(x => x.id === a.system);
                    ctx.actions.push({
                        kind: 'pick', icon: 'ui.retreat', label: (sys2 ? sys2.tile : a.system) + ' · ' + a.pos,
                        hint: 'Отступить сюда',
                        onClick: () => this.net.cmd({ type: 'combat', action: 'retreat', target: a }),
                    });
                }
                if (!areas.length) {
                    ctx.actions.push({
                        kind: 'primary', icon: 'ui.retreat', label: 'Отступать некуда',
                        onClick: () => this.net.cmd({ type: 'combat', action: 'retreat' }),
                    });
                }
                return;
            }
            default:
                return;
        }
    }

    // The token that is on top of the pile of a system: only this one resolves.
    topOrderOf(s, systemId) {
        const sys = s && s.systems ? s.systems.find(x => x.id === systemId) : null;
        if (!sys || !sys.tokens || !sys.tokens.length) return null;
        return sys.tokens[sys.tokens.length - 1];
    }

    // The card of the table may be played only in the step of the player.
    canPlayCard(s) {
        const c = s && s.combat;
        if (!c) return false;
        const mine = s.seat === c.attacker ? 'attacker' : s.seat === c.defender ? 'defender' : null;
        if (!mine) return false;
        return c.step === (mine === 'attacker' ? 'choose-attacker' : 'choose-defender');
    }

    // The clicked piece of the damage: it joins or leaves the group that takes it.
    toggleDamage(id) {
        const i = this.damageTargets.indexOf(id);
        if (i >= 0) this.damageTargets.splice(i, 1);
        else this.damageTargets.push(id);
        this.refresh();
    }

    // The hand at the bottom of the screen: the combat cards, each with its icons.
    fillHand(s, side, mine) {
        const c = s.combat;
        if (!c) { this.hand = []; return; }
        const hand = (c.cards[side].hand || []);
        const faction = s.players[s.seat] ? s.players[s.seat].faction : '';
        this.hand = hand.map((name, index) => {
            const data = FS_DATA.combat.find(x => x.faction === faction && x.name === name);
            const text = data ? [data.general, data.unit].filter(Boolean).join('\n') : '';
            return {
                index, name,
                icons: (data && data.icons) || {},
                // The card is drawn from these runs: real italics, real bold and the
                // cubes as shapes — the markup of the data never reaches the screen.
                runs: typeof FSIcons !== 'undefined' ? FSIcons.runs(text) : [],
                text,
                playable: !!mine,
            };
        });
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
            kind: 'primary', icon: 'ui.redo', label: 'Ещё бой',
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
        void c;
        return FS_RULES.retreatTargets(s, s.seat);
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
                        kind: 'pick', icon: 'mark.ground',
                        label: def ? def.name : u.id,
                        selected: this.effectPick.indexOf(u.id) >= 0,
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
                    // The face of the die is its icon, drawn as the game draws it.
                    ctx.actions.push({
                        kind: 'pick',
                        icon: { att: 'die.att', def: 'die.def', morale: 'die.morale' }[d] || 'die.blank',
                        label: 'Кубик ' + (i + 1),
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
                    kind: 'primary', icon: 'cube.morale',
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
                        { label: 'Поставить', icon: 'ui.check', primary: true, onClick: () => this.confirmSetupTile() },
                        { label: 'Отмена', icon: 'ui.close', onClick: () => this.cancelSetupTile() },
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
                        { label: 'Поставить', icon: 'ui.check', primary: true, onClick: () => this.confirmSetupObjective() },
                        { label: 'Отмена', icon: 'ui.close', onClick: () => { this.pending.pos = null; FSView.clearGhost(this.view); this.refresh(); } },
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
            const actions = [{ label: 'Вскрыть', icon: 'order.event', primary: true, onClick: () => this.resolveOrder(sys.id) }];
            if (tok.order !== 'strategize') {
                actions.push({ label: 'В колоду событий', icon: 'ui.next', onClick: () => this.resolveOrder(sys.id, true) });
            }
            actions.push({ label: 'Отмена', icon: 'ui.close', onClick: () => { this.mode = 'idle'; this.pending = null; this.refresh(); } });
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
        canvas.addEventListener('pointerdown', e => {
            if (e.button === 2) {
                // The right button takes a piece out of the group (and closes a
                // pending choice).
                const rect = rectOf();
                this.onRightClick(e.clientX - rect.left, e.clientY - rect.top);
                return;
            }
            if (e.button === 0) down = { x: e.clientX, y: e.clientY, id: e.pointerId };
        });
        if (canvas.addEventListener) canvas.addEventListener('contextmenu', e => { if (e.preventDefault) e.preventDefault(); });
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

    // The right button: a piece leaves the group of the march, everything else
    // closes what was picked.
    onRightClick(px, py) {
        const s = this.state;
        if (!s) return;
        const scene = this.view.scene;
        const pick = scene.pick(px == null ? scene.pointerX : px, py == null ? scene.pointerY : py, m => this.pickable(m));
        const meta = pick && pick.hit && pick.pickedMesh ? pick.pickedMesh.metadata : null;
        // Развёртывание: правый клик по купленной фигуре возвращает её, пока
        // приказ не закончен (материя ещё не списана).
        const o = s.order;
        if (o && o.order === 'deploy' && o.seat === s.seat
            && (this.mode === 'placeUnit' || this.mode === 'placeStructure' || this.mode === 'idle')) {
            if (meta && meta.fs === 'unit') { this.net.cmd({ type: 'undoPurchase', unit: meta.unit }); return; }
            if (meta && meta.fs === 'structure') { this.net.cmd({ type: 'undoPurchase', structure: meta.structure }); return; }
        }
        if (this.mode === 'move' && this.selected && this.selected.length) {
            const unit = meta && meta.fs === 'unit' ? s.units.find(u => u.id === meta.unit) : null;
            let victim = unit && this.selected.indexOf(unit.id) >= 0 ? unit.id : null;
            if (!victim && unit) {
                // Any model of the same kind in the same sector is the same group.
                const def = FS_RULES.unitOf(s, unit);
                const same = this.selectedUnits().filter(u => {
                    const d = FS_RULES.unitOf(s, u);
                    return d && def && d.type === def.type && u.system === unit.system && u.area === unit.area;
                });
                if (same.length) victim = same[same.length - 1].id;
            }
            if (!victim && this.selected.length) victim = this.selected[this.selected.length - 1];
            const i = this.selected.indexOf(victim);
            if (i >= 0) this.selected.splice(i, 1);
            if (!this.selected.length) { this.moveKind = null; this.clearSelection(); }
            this.status = '';
            this.updateSelection();
            this.refresh();
            return;
        }
        if (this.mode !== 'idle') {
            this.mode = 'idle';
            this.pending = null;
            this.status = '';
            this.refresh();
        }
    }

    // The click on a model that is over the capacity of its area: it goes back to
    // the supply, and the ring of the area follows what is left.
    clickTrim(meta) {
        const s = this.state;
        const entry = ((s && s.trim) || []).find(t => t.seat === s.seat);
        if (!entry) return;
        if (!meta || meta.fs !== 'unit') {
            this.status = 'Щёлкните по отряду в переполненной области.';
            this.refresh();
            return;
        }
        const unit = s.units.find(u => u.id === meta.unit);
        if (!unit || unit.seat !== s.seat) {
            this.status = 'Свои отряды уходят в запас: чужой отряд не выбрать.';
            this.refresh();
            return;
        }
        if (unit.system !== entry.system || unit.area !== entry.pos) {
            this.status = 'Этот отряд стоит не в переполненной области.';
            this.refresh();
            return;
        }
        this.status = '';
        // The click marks the model: the removal itself waits for the confirmation.
        const picked = this.trimPick || (this.trimPick = []);
        const at = picked.indexOf(unit.id);
        if (at >= 0) picked.splice(at, 1);
        else picked.push(unit.id);
        this.refresh();
    }

    // The click on a model that takes the damage of the orbital strike.
    clickStrikeDamage(meta) {
        const s = this.state;
        const st = s && s.strike;
        if (!st) return;
        if (!meta || meta.fs !== 'unit') {
            this.status = 'Щёлкните по отряду, который принимает удар.';
            this.refresh();
            return;
        }
        const unit = s.units.find(u => u.id === meta.unit);
        if (!unit || unit.seat !== s.seat || unit.system !== st.system || unit.area !== st.pos) {
            this.status = 'Удар принимают только свои отряды в этом мире.';
            this.refresh();
            return;
        }
        this.status = '';
        this.net.cmd({ type: 'strikeDamage', unit: unit.id });
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
                /** @type {'ship' | 'ground'} */
                const type = def && def.type === 'ship' ? 'ship' : 'ground';
                // Ships and ground troops go in separate marches: a group already
                // picked is not mixed with the other kind.
                if (this.moveKind && this.moveKind !== type && this.selected.length) {
                    this.status = this.moveKind === 'ship'
                        ? 'В группе корабли. Снимите выделение, чтобы двинуть войска.'
                        : 'В группе войска. Снимите выделение, чтобы двинуть корабли.';
                    this.refresh();
                    return;
                }
                // A model on the board stands for the models of its kind in that
                // sector: every further click on it takes one more of them, and a
                // kind that is not in the group never joins it.
                const place = u => u.system + ':' + u.area;
                const group = this.selectedUnits();
                const groupKind = group.length ? (FS_RULES.unitOf(s, group[0]) || {}).type : null;
                if (groupKind && def && def.type !== groupKind) {
                    this.status = 'В группе уже другие отряды: ' + (groupKind === 'ship' ? 'корабли' : 'войска') + '.';
                    this.refresh();
                    return;
                }
                if (group.length && place(group[0]) !== place(unit)) {
                    this.status = 'Отряды из другой области в эту группу не идут.';
                    this.refresh();
                    return;
                }
                const free = FS_RULES.movableUnits(s, s.seat).filter(u =>
                    u.id !== unit.id && place(u) === place(unit)
                    && (FS_RULES.unitOf(s, u) || {}).type === (def ? def.type : null)
                    && this.selected.indexOf(u.id) < 0);
                if (this.selected.indexOf(unit.id) < 0 && !free.length && group.length) {
                    this.status = 'Больше таких отрядов здесь нет.';
                    this.refresh();
                    return;
                }
                this.moveKind = type;
                this.status = '';
                if (this.selected.indexOf(unit.id) < 0) this.selected.push(unit.id);
                else if (free.length) this.selected.push(free[0].id);
                this.updateSelection();
                this.refresh();
                return;
            }
        }
        if (!this.selected.length) {
            return;
        }
        if (!target.pos) { this.status = 'Выберите сектор, а не систему целиком.'; this.refresh(); return; }
        const units = this.selectedUnits().filter(u => FS_RULES.canMove(s, s.seat, u, { system: target.system, pos: target.pos }).ok);
        if (!units.length) { this.status = 'Эти отряды туда не пройдут.'; this.refresh(); return; }
        const left = this.selected.length - units.length;
        this.status = left > 0 ? 'Идут ' + units.length + ' из ' + this.selected.length + ' отрядов.' : '';
        // Вместимость области: по правилам её можно превысить при движении, но
        // после приказа лишние отряды погибают — и выбирает их игрок. Об этом
        // надо предупредить до того, как он закончит движение.
        const cap = FS_RULES.capacity(s, target.system, target.pos);
        const already = FS_RULES.unitsAt(s, target.system, target.pos).filter(u => u.seat === s.seat).length;
        const over = already + units.length > cap;
        if (over) {
            // Первый клик в переполненную область только предупреждает: марш
            // уходит со второго клика или с кнопки в панели. Так игрок видит
            // цену хода до того, как он случится.
            const key = target.system + ':' + target.pos + ':' + units.map(u => u.id).join(',');
            if (!this.overflow || this.overflow.key !== key) {
                this.overflow = { key, units: units.map(u => u.id), system: target.system, pos: target.pos };
                this.warn = 'Область будет перенаселена (' + (already + units.length) + ' из ' + cap
                    + '): после окончания движения лишние ваши отряды погибнут. '
                    + 'Нажмите ещё раз, чтобы двинуть, или отмечайте мышью, кого оставить.';
                this.refresh();
                return;
            }
        }
        this.overflow = null;
        this.warn = '';
        this.sendAdvance(units, target);
    }

    // The march itself: the group of the picking goes into one area.
    sendAdvance(units, target) {
        this.overflow = null;
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
        // The dice of the battle are on the table: a click on one of them answers the
        // question about a reroll — no list in the panel is needed.
        if (s.pending && s.pending.question && meta.fs === 'die'
            && /^dice/.test(String(s.pending.question.kind || ''))) {
            const q = s.pending.question;
            const index = typeof meta.index === 'number' ? meta.index : -1;
            if (index >= 0 && (q.options || []).indexOf(index) >= 0) {
                if (q.kind === 'diceFace') { this.effectDie = index; this.refresh(); return; }
                this.net.cmd({ type: 'effect', answer: { dice: [index] } });
                return;
            }
        }
        // The board assembly: the storm is placed on a system.
        if (s.phase === 'setup' && s.setup && s.setup.myTurn && s.setup.stage === 'storms' && meta.system) {
            this.status = ''; this.mode = 'setupStorm'; this.pending = { system: meta.system };
            this.highlightSetupTargets(); this.refresh(); return;
        }
        // The movement lives on the board itself.
        if (this.mode === 'move') { this.clickMove(meta, target); return; }
        if (this.mode === 'trim') { this.clickTrim(meta); return; }
        if (this.mode === 'strike-damage') { this.clickStrikeDamage(meta); return; }
        // The damage of the battle: a click on a piece picks who takes it.
        if (this.mode === 'damage' && s.combat && (meta.fs === 'unit' || meta.fs === 'structure')) {
            const id = meta.fs === 'unit' ? meta.unit : meta.structure;
            const c = s.combat;
            const seat = s.seat;
            const own = meta.fs === 'unit'
                ? (s.units.find(u => u.id === id) || {}).seat === seat
                : (s.structures.find(x => x.id === id) || {}).seat === seat;
            const here = meta.fs === 'unit'
                ? (() => { const u = s.units.find(x => x.id === id); return u && u.system === c.system && u.area === c.pos; })()
                : (() => { const x = s.structures.find(v => v.id === id); return x && x.system === c.system && x.area === c.pos; })();
            if (!own || !here) { this.status = 'Урон получают только ваши отряды в этой области.'; this.refresh(); return; }
            this.toggleDamage(id);
            return;
        }
        // The cards of the battle lie on the table: a click on a card of the hand
        // plays it, and nothing else in the interface can.
        if (meta.fs === 'card' && meta.index >= 0 && s.combat && this.canPlayCard(s)) {
            this.net.cmd({ type: 'combat', action: 'playCard', index: meta.index });
            return;
        }
        // The retreat is chosen on the map.
        if (this.mode === 'retreat' && s.combat && target && target.pos) {
            const ok = this.retreatAreas(s, s.combat).some(a => a.system === target.system && a.pos === target.pos);
            if (!ok) { this.status = 'Туда отступить нельзя.'; this.refresh(); return; }
            this.net.cmd({ type: 'combat', action: 'retreat', target: { system: target.system, pos: target.pos } });
            return;
        }
        if (this.mode === 'idle') {
            // A click on an own order token opens it right there. The pile of tokens
            // and the hex under it are the same thing: the top token is the one that
            // resolves, so the click always takes the top one.
            const top = meta.system ? this.topOrderOf(s, meta.system) : null;
            if (top && top.seat === s.seat && s.phase === 'operations' && s.turn === s.seat && !s.order) {
                this.mode = 'order';
                this.pending = { system: meta.system };
                this.refresh();
                return;
            }
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
            if (!FS_RULES.canPlaceOrder(s, s.seat, target.system)) {
                this.status = 'Приказ кладётся только в систему со своими отрядами или постройками '
                    + 'либо в соседнюю с такой системой. Кольца показывают, куда можно.';
                this.refresh();
                return;
            }
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
            this.net.cmd({
                type: 'buyUnit', unit: this.pending.unit, system: target.system, pos: target.pos,
                cache: !!this.pending.cache, forgeKl: !!this.pending.forgeKl,
            });
            if (this.pending.cache || this.pending.forgeKl) this.deployOpts = { cache: false, forgeKl: false };
            // Отрядов за приказ можно поставить сколько угодно: выбор остаётся
            // в руке, пока игрок не нажмёт «Закончить размещение отрядов».
            this.refresh();
            return;
        }
        if (this.mode === 'placeStructure') {
            if (!target) return;
            this.net.cmd({ type: 'buyStructure', structure: this.pending.structure, system: target.system, pos: target.pos, cache: !!this.pending.cache });
            if (this.pending.cache) this.deployOpts = { cache: false, forgeKl: false };
            this.mode = 'idle';
            this.pending = null;
            this.refresh();
            return;
        }
        if (this.mode === 'strike') {
            if (!target) return;
            const t = FS_RULES.orbitalStrikeTargets(s, s.seat)
                .find(x => x.system === target.system && x.pos === target.pos);
            if (!t) { this.status = 'По этому миру бить нельзя.'; this.refresh(); return; }
            this.net.cmd({ type: 'orbitalStrike', system: t.system, pos: t.pos, from: t.from });
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
