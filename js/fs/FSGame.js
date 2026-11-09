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
        /** @type {any} */ this.deployOverflow = null;
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
        this.lobby = { code: '', players: [], factions: [], started: false };
        // The invite links reported by the server (one per LAN address); used
        // for the "for friends" link when this page was opened through localhost.
        this.invites = [];
        this.palette = null;
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
        // Стороны света (штормы) привязаны к миру: азимут не крутим —
        // «север» на экране всегда вверху, стрелки на картах совпадают с полем.
        if (cam.lockAzimuth) cam.lockAzimuth(true);
    }

    // --- the connection --------------------------------------------------------
    connect() {
        this.net = FSNet.connect({ room: this.room, name: this.name, id: this.id });
        this.net.on('joined', msg => {
            // The id is empty when the server turned this guest away (the party has
            // started) — keep the stored identity in that case.
            if (msg.id) {
                this.id = msg.id;
                Store.set('fs.id', msg.id);
            }
            this.room = msg.room;
            this.lobby.started = !!msg.started;
            if (Array.isArray(msg.invites)) this.invites = msg.invites;
            if (!this.name) {
                this.name = 'Игрок ' + (msg.seat + 1);
                Store.set('fs.name', this.name);
            }
            this.lobby.factions = msg.factions || [];
            this.lobby.code = msg.room;
            this.lobby.players = this.lobby.players || [];
            if (msg.palette) this.palette = msg.palette;
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
            // The lobby shows the status line; re-render it so the message is visible.
            if (!this.state) this.showLobby();
            this.refresh();
        });
        this.net.on('close', () => {
            this.setupSubmitting = false;
            this.status = 'Связи с сервером нет. Запустите сервер игры: node tools/fs-server.mjs (или fs.bat)';
            this.refresh();
        });
        // The corner «Отменить ход»: one step back on the server, whoever moved last.
        FSUI.onUndo = () => {
            this.status = 'Последний ход отменён.';
            if (this.net) this.net.undo();
            this.refresh();
        };
    }

    // The link a friend can open in this LAN. Opened through localhost (fs.bat
    // opens it that way) localhost is useless for the friends, so the invite
    // link the server reported in 'joined' is used instead.
    shareLink() {
        const host = location.hostname;
        const local = host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
        if (local && this.invites.length) return this.invites[0];
        return location.origin + '/?room=' + this.lobby.code;
    }

    showLobby() {
        if (!this.battle.cards.length) this.resetBattle(this.battle.kind);
        const info = {
            code: this.lobby.code,
            name: this.name,
            faction: this.faction,
            palette: this.palette,
            players: this.lobby.players,
            factions: this.lobby.factions,
            link: this.shareLink(),
            modes: FS_TEST_MODES,
            mode: this.testMode,
            status: this.status,
            battle: this.battleInfo(),
            onMode: id => { this.testMode = id; this.showLobby(); },
            onBattle: patch => { this.onBattle(patch); },
            onStart: () => this.startTest(),
            onPalette: pal => {
                this.palette = pal;
                if (this.net) this.net.palette(pal);
            },
        };
        FSUI.lobby(info, id => {
            this.faction = id;
            // A new faction resets the paint to that faction's default shades.
            this.palette = null;
            if (this.net) this.net.palette(null);
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
        // The ghost storms of the pending move: where the storm may go now.
        this.updateStormGhosts();
        FSView.update(this.app, this.view, view);
        // The camera never moves on its own between state refreshes — not on an
        // order, not on a purchase, not on a refund. It stays where the player left it.
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
        // The camera belongs to the player — it never moves, not even for the battle.
        this.hand = [];
        // The question of the last effect is closed: the rings it lit go out.
        if (!s.pending && this.questionMarkersActive) {
            this.questionMarkersActive = false;
            FSView.showSelection(this.app, this.view, []);
            FSView.clearHighlights(this.view);
        }
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
            this.deployOverflow = null;
            this.strikeTargets = null;
            this.reinforcePick = 0;
            this.reinforceStep = null;
            this.autoReinforced = null;
            FSView.clearHighlights(this.view);
        }
        // A NEW question from the server is a new choice: the picks of the old
        // one do not carry over. A local refresh triggered by our own clicks
        // keeps the same question object, so the accumulated picks survive.
        if (s.pending && this.pendingQuestionRef !== s.pending.question) {
            this.pendingQuestionRef = s.pending.question;
            this.effectPick = [];
            this.effectDie = null;
        }
        if (s.pending) this.questionMarkersActive = true;
        // A new reinforcement step is a fresh count: the counter starts at 0.
        const reinforceKey = s.combat ? s.combat.system + ':' + (s.combat.round || 1) + ':' + s.combat.step : null;
        if (this.reinforceStep !== reinforceKey) {
            this.reinforceStep = reinforceKey;
            this.reinforcePick = 0;
        }
        // The question of the effect of a card: the player chooses.
        if (s.pending) {
            // The combat HUD never goes away during the fight — not while a
            // card effect is waiting for an answer either: the battle panel,
            // the hand at the bottom and the battle statistics stay on
            // screen, exactly as they are outside the question.
            if (s.combat) this.panelCombat(s, ctx);
            this.panelQuestion(s, ctx);
            if (s.combat) { ctx.battleHand = this.hand || []; if (!ctx.battle) ctx.battle = null; }
            this.updateQuestionMarkers();
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
            if (s.order.phase === 'guardDeploy') this.panelGuardDeploy(s, ctx);
            else if (s.order.order === 'deploy') this.panelDeploy(s, ctx);
            else if (s.order.order === 'strategize') this.panelStrategize(s, ctx);
            else if (s.order.order === 'dominate') this.panelDominate(s, ctx);
        }
        // The upgrades of the player: once per round.
        if (s.phase === 'operations' && s.players[me]) {
            for (const u of (s.players[me].upgrades || []).filter(x => !x.used)) {
                // An order upgrade belongs to one order: it is offered only
                // while that order is being resolved.
                const c = FS_DATA.orders.find(x => x.faction === s.players[me].faction && x.name === u.name);
                const kind = u.order || (c && c.order);
                // An orbital upgrade is played during the strike of an advance,
                // any other one during the order printed on the card.
                const right = !kind || (s.order && s.order.seat === me
                    && (kind === 'orbital' ? s.order.phase === 'strike' : s.order.order === kind));
                if (!right) continue;
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
        // The starting assets of the player's own choice (the Inquisition
        // begins with two tokens of any kind).
        const left = s.players[s.seat].startChoice || 0;
        if (left) {
            ctx.status = 'Выберите стартовые ресурсы: осталось ' + left + '.';
            for (const asset of ['forge', 'cache', 'reinforcement']) {
                ctx.actions.push({
                    kind: 'chip', label: 'Старт: ' + FS_RULES.assetName(asset),
                    onClick: () => this.net.cmd({ type: 'startAsset', asset }),
                });
            }
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
            ctx.actions.push({ kind: 'secondary', label: 'Снять выбор тайла', onClick: () => this.cancelSetupTile() });
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
            { icon: 'order.event', label: 'Подкрепление', count: a.reinforcement || 0 },
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
                { icon: 'asset.materiel', label: 'Материя', count: p.materiel },
            ].concat(this.assetTokens(s, me));
            return;
        }
        ctx.text = this.mode === 'placeOrder'
            ? 'Щёлкните по системе с кольцом: приказ кладётся в свою систему или рядом со своей.'
            : 'Выберите приказ и щёлкните по системе.';
        ctx.status = this.status || (left ? 'Осталось приказов: ' + left : 'Все приказы выложены.');
        ctx.tokens = [
            { icon: 'asset.materiel', label: 'Материя', count: p.materiel },
        ].concat(this.assetTokens(s, me));
        const kinds = [
            ['advance', 'Наступление', 'order.advance', 'Движение и бой'],
            ['deploy', 'Развёртывание', 'order.deploy', 'Покупка отрядов и построек'],
            ['strategize', 'Стратегия', 'order.strategize', 'Улучшения'],
            ['dominate', 'Доминирование', 'order.dominate', 'Ресурсы и способность'],
        ];
        const supply = typeof FS_RULES.ORDER_SUPPLY === 'number' ? FS_RULES.ORDER_SUPPLY : 2;
        const laid = p.placedOf || {};
        for (const [order, name, icon, hint] of kinds) {
            const left = Math.max(0, supply - (laid[order] || 0));
            // Two tokens of every order: a spent kind stays in the list, only dimmed.
            ctx.actions.push({
                kind: 'pick', icon, label: name, count: left + '×',
                hint: hint + ' · осталось ' + left + ' из ' + supply,
                enabled: left > 0,
                grid2: true,
                selected: this.mode === 'placeOrder' && this.pending && this.pending.order === order,
                onClick: () => {
                    if (left <= 0) return;
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
                // Отмена возвращает и шаг приказа: марш кораблей — снова шаг 1.
                const steps = order.steps || [];
                const last = steps[steps.length - 1] || [];
                const lastKind = last[0] && last[0].kind === 'ship' ? 'ship' : 'ground';
                ctx.actions.push({
                    kind: 'chip', icon: 'ui.close', label: 'Вернуть последний ход',
                    hint: lastKind === 'ship'
                        ? 'вернёт на шаг 1 · корабли'
                        : (step === 'ground' ? 'вернёт на шаг 2 · войска' : 'вернёт ход кораблей'),
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
            this.strikeTargets = targets;
            if (targets.length) this.ringAreas(targets); else FSView.clearHighlights(this.view);
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
                onClick: () => { this.strikeTargets = null; this.net.cmd({ type: 'finishAdvance' }); },
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
        // Первый клик в переполненный сектор только предупредил: здесь игрок
        // решается — поставить отряд с переполнением или передумать.
        if (this.deployOverflow) {
            const ov = this.deployOverflow;
            ctx.warn = this.warn || 'Сектор будет переполнен';
            ctx.title = 'Развёртывание';
            ctx.text = 'Сектор будет переполнен. Отряд всё равно будет поставлен — '
                + 'лишние ваши отряды погибнут после окончания приказа, и вы сами выберете, какие.';
            ctx.actions.push({
                kind: 'primary', icon: 'ui.next', label: 'Поставить всё равно',
                hint: 'лишние погибнут после приказа',
                onClick: () => {
                    this.deployOverflow = null;
                    this.warn = '';
                    this.net.cmd({ type: 'buyUnit', unit: ov.unit, system: ov.system, pos: ov.pos,
                        cache: ov.cache, forgeKl: ov.forgeKl });
                    if (ov.cache || ov.forgeKl) this.deployOpts = { cache: false, forgeKl: false };
                    this.refresh();
                },
            });
            ctx.actions.push({
                kind: 'chip', icon: 'ui.close', label: 'Отмена',
                onClick: () => { this.deployOverflow = null; this.warn = ''; this.refresh(); },
            });
            return;
        }
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

    // --- the nested production of the Imperial Guard's «Массовое Производство»
    // The dominate ability is a deploy order produced by ONE chosen factory:
    // a minimum of two units of the same type, price minus one, into the
    // factory's own world. Two Guardsmen go for one supply token.
    panelGuardDeploy(s, ctx) {
        const me = s.seat;
        const p = s.players[me];
        const order = s.order;
        const factory = order.guardFactory;
        const sys = factory ? s.systems.find(x => x.id === factory.system) : null;
        const area = sys && factory ? sys.areas.find(a => a.pos === factory.pos) : null;
        const worldName = area && area.world ? area.world.name : 'мир-производитель';
        const limit = FS_RULES.deployLimit(s, me, order.system);
        const spent = FS_RULES.spentOf(order);
        const purchases = order.purchases || [];
        const faction = FS_DATA.factions.find(f => f.id === p.faction);
        const supply = (p.supply && p.supply.units) || {};
        const locked = order.unitsLocked;
        const lockedDef = locked && faction ? faction.units.find(u => u.id === locked) : null;
        const lockedName = lockedDef ? lockedDef.name : locked;
        ctx.title = 'Массовое Производство';
        ctx.text = 'Фабрика выпускает отряды в свой мир. Минимум 2 отряда одного типа, каждый на 1 материи дешевле. 2 Гвардейца за 1 жетон запасов.';
        ctx.status = this.status || ('Фабрика: ' + worldName
            + ' · материя: ' + p.materiel
            + (spent ? ' · в приказе: ' + spent : '')
            + ' · куплено: ' + purchases.length + ' из ' + limit
            + (lockedName ? ' · тип: ' + lockedName : ''));
        ctx.tokens = [];
        // «Массовое Производство» даёт только наземные отряды — в полосе запасов корабли не показываем.
        for (const def of (faction ? faction.units : [])) {
            if (def.type === 'ship') continue;
            ctx.tokens.push({
                icon: def.type === 'ship' ? 'mark.ship' : 'mark.ground',
                label: def.name, count: supply[def.id] || 0, hint: 'В запасе · цена ' + def.cost,
            });
        }
        // The two ways of paying less — the same as in the deploy order.
        const opts = this.deployOpts = this.deployOpts || { cache: false, forgeKl: false };
        const canCache = (p.assets.cache || 0) > 0;
        const canForge = (p.assets.forge || 0) > 0;
        if (!canCache) opts.cache = false;
        if (!canForge) opts.forgeKl = false;
        const cl = FS_RULES.commandLevel(s, me);
        // The pair deal: after the first Guardsman, every second one costs one
        // supply token instead of materiel — the price below already shows 0.
        const dealUnit = (order.supplyDeal && order.supplyDeal.unit) || 'Гвардейца';
        const dealName = dealUnit.toLowerCase().replace(/а/g, '');
        const isDealUnit = def => order.supplyDeal && String(def.name).toLowerCase().indexOf(dealName) >= 0;
        const dealNextFree = def => isDealUnit(def) && (order.dealBought || 0) % 2 === 1;
        if ((order.bought || 0) < limit) {
            // «Массовое Производство» производит только наземные отряды и только
            // в мир, который их произвёл — космос это другой мир.
            for (const def of faction.units) {
                if (def.type === 'ship') continue;
                const n = supply[def.id] || 0;
                const pairSecond = dealNextFree(def);
                const cost = pairSecond ? 0 : Math.max(0, def.cost - 1 - (opts.cache ? 2 : 0));
                const kl = def.kl - (opts.forgeKl ? 1 : 0);
                const blockedByLock = !!locked && def.id !== locked;
                const blocked = blockedByLock || !n || p.materiel - spent < cost || kl > cl || (def.forge && !(p.assets.forge || 0));
                const dealHint = isDealUnit(def) ? ' · каждая вторая пара: 1 жетон запасов' : '';
                ctx.actions.push({
                    kind: 'pick', icon: def.type === 'ship' ? 'mark.ship' : 'mark.ground', label: def.name, count: n,
                    hint: cost + ' материи · КЛ ' + Math.max(0, kl) + ' · бой ' + def.combat
                        + (def.forge ? ' · нужна кузница' : '') + dealHint
                        + (blockedByLock ? ' · другой тип' : ''),
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
        if (purchases.length) {
            ctx.actions.push({
                kind: 'chip', icon: 'ui.close', label: 'Снять последнюю покупку',
                hint: 'правый клик по фигуре — снять любую',
                onClick: () => this.net.cmd({ type: 'undoPurchase' }),
            });
        }
        const minOk = purchases.length === 0 || purchases.length >= 2;
        ctx.actions.push({
            kind: 'primary', icon: 'ui.check',
            label: purchases.length
                ? 'Закончить производство — спишется ' + spent + ' материи'
                : 'Закончить производство (без покупки)',
            enabled: minOk,
            hint: minOk ? '' : 'нужно минимум 2 отряда одного типа (сейчас ' + purchases.length + ')',
            onClick: () => this.net.cmd({ type: 'finishGuardDeploy' }),
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
        // «Массовое Производство»: the ring is over the factory world; a ship
        // goes out into the void of the same system instead.
        if (order.phase === 'guardDeploy' && order.guardFactory) {
            const gsys = s.systems.find(x => x.id === order.guardFactory.system);
            if (!gsys) { FSView.highlight(this.view, []); return; }
            const rings = [];
            if (def && def.type === 'ship') {
                FSView.highlight(this.view, []);
                return;
            }
            const garea = gsys.areas.find(a => a.pos === order.guardFactory.pos);
            if (garea) {
                const p = FSView.areaPos(this.app, gsys, garea.pos, this.view.metrics);
                const h = this.app.location.terrain.heightAt(p.x, p.y);
                rings.push({ x: p.x, y: h + 14, z: p.y });
            }
            FSView.highlight(this.view, rings);
            return;
        }
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
        const order = s.order;
        ctx.title = 'Стратегия · улучшения';
        ctx.text = 'Купите одно боевое улучшение и одно улучшение приказа.';
        const level = FS_RULES.commandLevel(s, me);
        const costOf = c => Math.max(0, c.cost - (p.cardDiscount || 0));
        const noUnits = !order || !FS_RULES.hasUnitsOrStructures(s, me, order.system);
        // The combat deck, card for card, in the same component as the hand of the
        // battle; the discard for a combat upgrade is two cards of the same name.
        const deckNames = FSUI.combatDeckKnown(p, true);
        const deckCounts = {};
        for (const n of deckNames) deckCounts[n] = (deckCounts[n] || 0) + 1;
        // The hand of the discard: one card per unique name — the pair of the
        // combat deck leaves as one piece (the upgrade replaces a pair).
        this.hand = [];
        const deckSeen = new Set();
        for (const n of deckNames) {
            if (deckSeen.has(n)) continue;
            deckSeen.add(n);
            const def = FS_DATA.combat.find(c => c.faction === p.faction && c.name === n);
            const text = def ? [def.general, def.unit].filter(Boolean).join('\n') : '';
            this.hand.push({
                name: n,
                playable: true,
                count: deckCounts[n] || 1,
                icons: def && def.icons ? def.icons : {},
                text,
                general: def && def.general,
                unit: def && def.unit,
                onClick: (name => () => this.pickDeckPair(name))(n),
                pairPicked: this.pairPick === n,
            });
        }
        const pairValid = !!this.pairPick && (deckCounts[this.pairPick] || 0) >= 2;
        // Every upgrade card of the faction — buyable and locked, none hidden.
        // Command level from top to bottom, then the price, then the name.
        const byKl = (a, b) => (a.kl || 0) - (b.kl || 0) || (a.cost || 0) - (b.cost || 0) || String(a.name).localeCompare(String(b.name), 'ru');
        const combatUp = FS_DATA.combat.filter(c => c.faction === p.faction && c.upgrade).sort(byKl);
        const orderUp = FS_DATA.orders.filter(c => c.faction === p.faction).sort(byKl);
        const ownedOrder = new Set((p.upgrades || []).map(u => u.name));
        const mkRow = (c, kind) => {
            const cost = costOf(c);
            const owned = kind === 'order' ? ownedOrder.has(c.name) : (deckCounts[c.name] || 0) >= 2;
            const bought = kind === 'order' ? !!(order && order.orderUpgrade) : !!(order && order.combatUpgrade);
            let locked = null;
            let reason = '';
            if (owned) { locked = true; reason = 'Уже у вас'; }
            else if (bought) { locked = true; reason = kind === 'order' ? 'Принято в этом приказе' : 'Пара уже куплена'; }
            else if (c.kl > level) { locked = true; reason = 'Нужен КЛ ' + c.kl + ' (у вас ' + level + ')'; }
            else if (p.materiel < cost) { locked = true; reason = 'Не хватает материи (нужно ' + cost + ')'; }
            else if (noUnits) { locked = true; reason = 'Нет отрядов или построек в системе'; }
            const selected = !!(this.upgradeSel && this.upgradeSel.kind === kind && this.upgradeSel.name === c.name);
            return {
                kind, name: c.name, cost, kl: c.kl,
                text: kind === 'order' ? (c.text || '') : ((c.general && c.general !== '—' ? c.general + ' ' : '') + (c.unit || '')),
                general: kind === 'combat' ? (c.general || '') : undefined,
                unit: kind === 'combat' ? (c.unit || '') : undefined,
                icons: kind === 'combat' && c.icons ? c.icons : null,
                order: kind === 'order' ? c.order : null,
                locked: !!locked, reason, owned, selected,
                onClick: (name => () => this.pickUpgrade(kind, name))(c.name),
            };
        };
        ctx.upgrades = {
            combat: combatUp.map(c => mkRow(c, 'combat')),
            order: orderUp.map(c => mkRow(c, 'order')),
        };
        const sel = this.upgradeSel;
        const selRow = sel ? ctx.upgrades[sel.kind].find(r => r.name === sel.name) : null;
        if (this.upgradeSel && !selRow) this.upgradeSel = null;
        // «…» — всегда на экране, что делать на каждом шаге покупки.
        if (!selRow) {
            ctx.status = noUnits
                ? 'В активной системе нет ваших отрядов и построек — по правилам в этот ход улучшения не купить.'
                : 'Выберите карту улучшения выше (боевое и/или приказа — по одной каждой), затем подтвердите слева внизу.';
        } else if (selRow.locked) {
            ctx.status = selRow.reason ? selRow.reason + ' — эта карта сейчас недоступна.' : 'Эта карта сейчас недоступна.';
        } else if (selRow.kind === 'combat') {
            ctx.status = pairValid
                ? 'Карта выбрана, пара выбрана — жмите «Подтвердить выбор боевой карты» слева внизу.'
                : 'Боевое улучшение выбрано. Теперь выберите одну пару одинаковых карт вашей боевой колоды в нижней полосе.';
        } else {
            ctx.status = 'Улучшение приказа выбрано — жмите «Подтвердить выбор карты улучшения» слева внизу.';
        }
        // The big card slightly to the left of the panel.
        ctx.previewCard = selRow ? {
            kind: selRow.kind === 'order' ? 'Улучшение приказа' : 'Боевое улучшение',
            name: selRow.name, cost: selRow.cost, kl: selRow.kl, text: selRow.text,
            general: selRow.general, unit: selRow.unit,
            icons: selRow.icons, order: selRow.order, locked: selRow.locked, reason: selRow.reason,
        } : null;
        // The status line above says exactly what to do next — buy order.
        // The buttons of the bottom-left corner — always finishable.
        const combatBought = !!(order && order.combatUpgrade);
        const orderBought = !!(order && order.orderUpgrade);
        const combatName = combatBought && order.combatBuy ? order.combatBuy.card : null;
        const orderName = orderBought ? (order.orderUpgradeName || null) : null;
        const selUsable = !!selRow && !selRow.locked && !noUnits;
        ctx.leftActions = [
            {
                icon: 'cube.att',
                kind: combatBought ? 'refund' : 'confirm',
                label: combatBought ? 'Отменить выбор боевой карты ' + combatName : 'Подтвердить выбор боевой карты',
                enabled: combatBought ? true : selUsable && !!selRow && selRow.kind === 'combat' && pairValid,
                onClick: () => this.confirmUpgrade('combat'),
            },
            {
                icon: 'order.strategize',
                kind: orderBought ? 'refund' : 'confirm',
                label: orderBought ? 'Отменить выбор карты ' + orderName : 'Подтвердить выбор карты улучшения',
                enabled: orderBought ? true : selUsable && !!selRow && selRow.kind === 'order',
                onClick: () => this.confirmUpgrade('order'),
            },
            {
                icon: 'ui.next',
                kind: 'primary',
                label: 'Закончить приказ Улучшение',
                enabled: true,
                onClick: () => this.net.cmd({ type: 'finishStrategize' }),
            },
        ];
    }

    // The purchase of the strategize order — the cards are never bought by a
    // bare click: the click only selects the card (item C), the button buys.
    pickUpgrade(kind, name) {
        const cur = this.upgradeSel;
        this.upgradeSel = (cur && cur.kind === kind && cur.name === name) ? null : { kind, name };
        this.refresh();
    }

    // The pair of the combat deck chosen for the discard — the player chooses.
    pickDeckPair(name) {
        this.pairPick = (this.pairPick === name ? null : name);
        this.refresh();
    }

    // Confirm or refund the purchase the player chose.
    confirmUpgrade(kind) {
        const s = this.state;
        if (!s || !s.order || s.order.order !== 'strategize' || s.order.seat !== s.seat) return;
        const p = s.players[s.seat];
        if (kind === 'combat') {
            if (s.order.combatUpgrade) {
                const card = s.order.combatBuy ? s.order.combatBuy.card : null;
                if (card) this.net.cmd({ type: 'refundUpgrade', kind: 'combat', card });
                this.upgradeSel = null;
                this.pairPick = null;
                this.refresh();
                return;
            }
            const sel = this.upgradeSel;
            if (!sel || sel.kind !== 'combat') return;
            const counts = {};
            for (const n of FSUI.combatDeckKnown(p, true)) counts[n] = (counts[n] || 0) + 1;
            if (!this.pairPick || (counts[this.pairPick] || 0) < 2) return;
            this.net.cmd({ type: 'buyUpgrade', kind: 'combat', card: sel.name, remove: this.pairPick });
            this.upgradeSel = null;
            this.pairPick = null;
            this.refresh();
            return;
        }
        if (kind === 'order') {
            if (s.order.orderUpgrade) {
                const card = s.order.orderUpgradeName || null;
                if (card) this.net.cmd({ type: 'refundUpgrade', kind: 'order', card });
                this.upgradeSel = null;
                this.refresh();
                return;
            }
            const sel = this.upgradeSel;
            if (!sel || sel.kind !== 'order') return;
            this.net.cmd({ type: 'buyUpgrade', kind: 'order', card: sel.name });
            this.upgradeSel = null;
            this.refresh();
        }
    }

    panelDominate(s, ctx) {
        ctx.title = 'Доминирование';
        ctx.text = 'Ресурсы получены. Способность фракции применять не обязательно.';
        // The faction ability is the point of the Dominate order — print it in the panel.
        ctx.status = s.order.ability ? 'Способность фракции: ' + s.order.ability : 'Способность фракции: —';
        // What the order just gave — the same list the engine granted; printed as icons.
        const counts = {};
        for (const a of (s.order.gained || [])) counts[a] = (counts[a] || 0) + 1;
        const assetIcons = { forge: 'asset.forge', cache: 'asset.cache', reinforcement: 'order.event', prosperity: 'asset.prosperity' };
        const noteIcons = [];
        for (const key of ['forge', 'cache', 'reinforcement', 'prosperity']) {
            if (counts[key]) noteIcons.push({ icon: assetIcons[key], count: counts[key] });
        }
        ctx.note = 'После этого вы получите следующие жетоны:';
        ctx.noteIcons = noteIcons;
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
            label: 'Применить способность фракции',
            onClick: () => this.net.cmd({ type: 'finishDominate' }),
        });
        ctx.actions.push({
            label: 'Пропустить способность',
            onClick: () => this.net.cmd({ type: 'finishDominate', skip: true }),
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
            ctx.status = 'Выберите карту, чей эффект вы разыграете:' + (this.status ? ' ' + this.status : '');
            ctx.tokens = [
                { icon: 'order.strategize', label: 'Жетоны событий', count: (ev.drawn || []).length },
                { icon: 'asset.materiel', label: 'Материя', count: p.materiel },
            ];
            if (!(ev.drawn || []).length) {
                // Жетона развития на колоде нет: верхняя карта открывается ТОЛЬКО
                // для движения шторма — она не разыгрывается и возвращается в колоду.
                const topName = ev.top;
                const topData = FS_DATA.events.find(e => e.faction === p.faction && e.name === topName);
                ctx.text = 'Жетона развития на колоде событий нет. Верхняя карта колоды вскрывается для движения шторма: её эффект не разыгрывается, шторм обязан сдвинуться по её стрелкам.';
                ctx.status = 'Вскрыта карта: «' + (topName || '—') + '» — передвиньте шторм по её стрелкам.';
                const full = topName ? FS_CARDS.detail(topName, p.faction, 'event') : {};
                const wide = ok => Object.assign({}, full, {
                    kind: 'СОБЫТИЕ · ВСКРЫТА ДЛЯ ШТОРМА — НЕ РАЗЫГРЫВАЕТСЯ',
                    okLabel: ok,
                });
                const modalItem = wide('Вернуть карту в колоду — дальше');
                // Саму карту видно СРАЗУ — до того, как сдвинут шторм, как любую карту.
                ctx.previewCard = Object.assign({}, full, {
                    kind: 'СОБЫТИЕ · ВСКРЫТА ДЛЯ ШТОРМА — НЕ РАЗЫГРЫВАЕТСЯ',
                    okLabel: 'Вскрыта для шторма',
                });
                ctx.handTitle = 'Карта вскрыта для шторма';
                ctx.hand = topName ? [{
                    icon: 'cube.morale', count: 1, label: topName,
                    kind: 'ВСКРЫТА ДЛЯ ШТОРМА',
                    hint: (topData && topData.text) || '',
                    onClick: () => FSUI.showEventConfirm(wide('Понятно'), () => this.refresh()),
                }] : [];
                const stormStepDone = !!ev.stormMoved;
                const canMove = FS_RULES.stormOptions(s, me).length > 0;
                if (stormStepDone || !canMove) {
                    ctx.actions.push({
                        kind: 'primary', icon: 'ui.next', label: 'Вернуть карту в колоду — дальше',
                        enabled: true,
                        onClick: () => FSUI.showEventConfirm(modalItem, () => this.net.cmd({ type: 'resolveEvent' })),
                    });
                } else {
                    ctx.actions.push({
                        kind: 'primary', icon: 'ui.storm', label: 'Сначала сдвиньте шторм',
                        enabled: false,
                        onClick: () => this.refresh(),
                    });
                }
                return;
            }
            const counts = new Map();
            for (const name of ev.drawn || []) counts.set(name, (counts.get(name) || 0) + 1);
            ctx.handTitle = 'Карты в руке';
            // Choosing an event card is choosing its whole ability. The same
            // catalogue prints every candidate, not just its name, and the
            // click sends the plain card name the rules engine expects.
            /** @type {any} */
            const choices = [...counts.entries()].map(([name, count]) => {
                const opt = FS_CARDS.option(name, p.faction, 'event');
                return Object.assign({}, opt, { count, onClick: () =>
                    FSUI.showEventConfirm(Object.assign({}, opt.detail, {
                        okLabel: 'Выбрать это событие',
                    }), () => this.net.cmd({ type: 'drawEvent', card: name })) });
            });
            choices.title = 'Выберите карту события — полная информация';
            ctx.cardChoices = choices;
            ctx.hand = choices.map(c => ({
                icon: c.detail.type === 'scheme' ? 'asset.materiel' : 'cube.morale',
                count: c.count, label: c.name, kind: c.detail.type === 'scheme' ? 'ПЛАН' : 'ТАКТИКА',
                hint: c.hint,
                onClick: () => this.net.cmd({ type: 'drawEvent', card: c.name }),
            }));
            return;
        }
        const data = FS_DATA.events.find(e => e.faction === p.faction && e.name === ev.chosen);
        const full = FS_CARDS.detail(ev.chosen, p.faction, 'event');
        const eventModalItem = () => Object.assign({}, full, {
            kind: data && data.type === 'scheme' ? 'СОБЫТИЕ · ПЛАН' : 'СОБЫТИЕ · ТАКТИКА',
            okLabel: 'Карта события',
        });
        const confirmResolve = () => FSUI.showEventConfirm(eventModalItem(), () => this.net.cmd({ type: 'resolveEvent' }));
        ctx.text = full.text || '';
        ctx.previewCard = Object.assign({}, full, {
            kind: data && data.type === 'scheme' ? 'СОБЫТИЕ · ПЛАН' : 'СОБЫТИЕ · ТАКТИКА',
            okLabel: 'На руке',
        });
        // The storms move with the mouse on the board itself: no buttons here.
        const options = FS_RULES.stormOptions(s, me);
        const stormStepDone = !!ev.stormMoved;
        const sel = (this.mode === 'storm' && this.pending && this.pending.storm) ? this.pending.storm : null;
        if (sel && !options.some(o => o.storm === sel)) { this.pending = null; this.mode = 'idle'; }
        if (stormStepDone) {
            this.mode = 'idle';
            this.pending = null;
            ctx.status = this.status || 'Шторм сдвинут — событие можно разыгрывать.';
            ctx.actions.push({
                kind: 'primary', icon: 'ui.next',
                label: 'Разыграть событие',
                enabled: true,
                onClick: confirmResolve,
            });
            return;
        }
        if (options.length) {
            if (this.pending && this.pending.storm) this.mode = 'storm';
            else this.mode = 'idle';
            ctx.status = this.pending && this.pending.storm
                ? 'Шторм выбран: щёлкните по зелёному призраку, куда его сдвинуть.'
                : 'Щёлкните по варп-шторму на поле, который вы хотите сдвинуть.';
            ctx.actions.push({
                kind: 'primary', icon: 'ui.next',
                label: 'Сначала сдвиньте шторм',
                enabled: false,
                onClick: () => this.refresh(),
            });
        } else {
            this.mode = 'idle';
            this.pending = null;
            ctx.status = this.status || 'Шторм не может сдвинуться ни в одну сторону — разыграйте событие.';
            ctx.actions.push({
                kind: 'primary', icon: 'ui.next',
                label: 'Разыграть событие',
                enabled: true,
                onClick: confirmResolve,
            });
        }
    }

    // --- the combat -----------------------------------------------------------
    //
    // A fight is played on the board itself, in the contested sector: the
    // miniatures stand where they are, the dice lie on the ground next to
    // them. This panel says only whose step it is and what can be pressed
    // now; the cards of the hand are the bar at the bottom of the screen.
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
            const played = (c.cards[id].played || []).map(x => ({ name: x.name, icons: (x.card && x.card.icons) || none }));
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
                parts: FS_RULES.combatValuesParts(s, id),
                takes: FS_RULES.combatDamageFor(s, id),
                // combatDamageFor(side) is the damage the side SUFFERS; the
                // damage it deals to the opponent is the opponent's value.
                deals: FS_RULES.combatDamageFor(s, id === 'attacker' ? 'defender' : 'attacker'),
                hand: (c.cards[id].hand || []).length,
                closed: !!(c.chosen && c.chosen[id]),
                // «Если вы — атакующий, подсмотрите карту оппонента»
                // («Скитарии-инфильтраторы»): the card of the other side this
                // player has seen this round. The state of the player carries it,
                // the panel of the opponent shows it — to him only.
                peeked: (id !== side && c.peek && c.peek[me]) ? { name: c.peek[me] } : null,
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
        // The hand is always at the bottom of the screen during the fight; a
        // card is playable only in the step of its side.
        this.fillHand(s, side, this.canPlayCard(s));
        switch (c.step) {
            case 'reinforce-attacker':
            case 'reinforce-defender': {
                const whose = c.step === 'reinforce-attacker' ? 'attacker' : 'defender';
                if (whose !== side) { ctx.text = 'Подкрепления ставит ' + nameOf(whose) + '.'; return; }
                const have = s.players[me] && s.players[me].assets ? (s.players[me].assets.reinforcement || 0) : 0;
                const max = Math.min(have, FS_RULES.maxReinforce(s, me, side));
                if (max <= 0) {
                    // The step needs no decision: no tokens are ever offered
                    // and the fight simply goes on. It is not even shown.
                    const key = c.system + ':' + (c.round || 1) + ':' + c.step;
                    ctx.text = have > 0 ? 'Подкреплению не за что устоять: в бою нет ваших отрядов.' : 'У вас нет жетонов подкрепления.';
                    if (this.autoReinforced !== key) {
                        this.autoReinforced = key;
                        const net = this.net;
                        setTimeout(() => net.cmd({ type: 'combat', action: 'reinforce', count: 0 }), 0);
                    }
                    return;
                }
                // The rule, as it is printed — attacker first, then defender,
                // a token is a command level zero unit standing with the
                // miniatures, at most as many as the units in the fight.
                ctx.text = 'Подкрепление. Атакующий размещает жетоны первым, затем защищающийся.';
                this.reinforcePick = Math.min(Math.max(0, this.reinforcePick || 0), max);
                ctx.counter = {
                    label: 'Отправлено подкрепления',
                    value: this.reinforcePick,
                    max,
                    have,
                    rule: 'Жетон подкрепления — это отряд командного уровня 0 вашей фракции: на мир ставится как наземный отряд, в пустоту — как корабль. Жетонов не может быть больше, чем ваших пластиковых отрядов в этом бою — бастион отрядом не считается. Жетон считается отрядом для всех целей, включая требования боевых карт; мораль он несёт по юниту КЛ 0; деморализованный жетон переворачивается; после боя все жетоны возвращаются в запас.',
                    onMinus: () => { this.reinforcePick = Math.max(0, (this.reinforcePick || 0) - 1); this.refresh(); },
                    onPlus: () => { this.reinforcePick = Math.min(max, (this.reinforcePick || 0) + 1); this.refresh(); },
                };
                ctx.actions.push({
                    kind: 'primary', icon: 'ui.next',
                    label: 'Начать бой',
                    enabled: true,
                    onClick: () => {
                        const n = this.reinforcePick || 0;
                        this.reinforcePick = 0;
                        this.net.cmd({ type: 'combat', action: 'reinforce', count: n });
                    },
                });
                return;
            }
            case 'choose-attacker':
            case 'choose-defender': {
                const whose = c.step === 'choose-attacker' ? 'attacker' : 'defender';
                if (whose !== side) {
                    ctx.text = 'Карту выбирает ' + nameOf(whose) + '.';
                    return;
                }
                ctx.text = 'Ваш ход: выберите карту.';
                ctx.status = '';
                return;
            }
            case 'damage-attacker':
            case 'damage-defender': {
                const whose = c.step === 'damage-attacker' ? 'attacker' : 'defender';
                // «Во время шага нанесения повреждений Вы назначаете урон
                // отрядам и бастионам противника» («Величие роя»): the step is
                // played by the owner of the card, not by the one who suffers.
                const assignSeat = c.assignDamage ? c.assignDamage.seat
                    : (whose === 'attacker' ? c.attacker : c.defender);
                if (assignSeat !== me) {
                    const who2 = assignSeat === c.attacker ? 'attacker' : 'defender';
                    ctx.text = 'Урон распределяет ' + nameOf(who2) + '.';
                    return;
                }
                void side;
                // The damage belongs to the side of this step, even when the
                // opponent's card makes somebody else distribute it.
                const damage = FS_RULES.combatDamageFor(s, whose);
                // The fighters on the board take the damage; the mouse picks them.
                this.mode = 'damage';
                const preview = FS_RULES.damagePreview(s, whose, this.damageTargets, me);
                const rows = FS_RULES.damageCandidates(s, whose, me).map(x => {
                    const row = preview.rows.find(r => r.id === x.id);
                    return {
                        id: x.id, name: x.name, health: x.health, morale: x.morale,
                        routed: x.routed, kind: x.kind, type: x.type,
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
                    ? 'Урон ' + damage + ': щёлкните по отрядам в области боя.'
                    : 'Щиты выдержали удар.';
                ctx.status = damage ? 'Осталось распределить: ' + preview.left : '';
                for (const row of rows) {
                    ctx.actions.push({
                        kind: 'pick', icon: row.kind === 'structure' ? 'mark.bastion'
                            : row.type === 'ship' ? 'mark.ship' : 'mark.ground',
                        label: row.name, count: String(row.health),
                        hint: row.destroyed ? 'Будет уничтожен'
                            : row.routed ? 'Деморализован'
                            : (row.demoralised ? 'Будет деморализован' : 'В строю'),
                        selected: row.selected,
                        onClick: () => this.toggleDamage(row.id),
                    });
                }
                {
                    const allPicked = rows.length > 0 && rows.every(r => r.selected);
                    const ready = preview.left === 0 || allPicked;
                    ctx.actions.push({
                        kind: 'primary', icon: 'mark.damage',
                        label: damage ? (ready ? 'Принять урон' : 'Разложите урон (осталось ' + preview.left + ')')
                            : 'Щиты выдержали — дальше',
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
                // The card is drawn from the two panels of the real thing — the
                // markup of the data never reaches the screen.
                general: data && data.general,
                unit: data && data.unit,
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

    // The units / structures / sectors a pending effect can touch are lit on
    // the board: the player clicks the models themselves, not a list in the panel.
    updateQuestionMarkers() {
        const s = this.state;
        if (!s || !s.pending) {
            FSView.showSelection(this.app, this.view, []);
            FSView.clearHighlights(this.view);
            return;
        }
        const q = s.pending.question || {};
        // Units: a ring under every one the effect may take.
        const rings = [];
        if (q.kind === 'units') {
            for (const id of q.options || []) {
                const pos = this.view.unitPositions && this.view.unitPositions.get(id);
                if (pos) rings.push({ x: pos.x, y: pos.y, z: pos.z, color: '#7df0a1' });
            }
            FSView.showSelection(this.app, this.view, rings);
            FSView.clearHighlights(this.view);
            return;
        }
        FSView.showSelection(this.app, this.view, []);
        const hl = [];
        // Structures and sectors: a ring on the spot they stand on / lie in.
        if (q.kind === 'structures') {
            for (const id of q.options || []) {
                const st = (s.structures || []).find(x => x.id === id);
                if (!st) continue;
                const sys = s.systems.find(x => x.id === st.system);
                if (!sys) continue;
                const disc = FSView.discAt(this.app, sys, st.area, this.view.metrics);
                hl.push({ x: disc.x, y: disc.y + 2, z: disc.z });
            }
        } else if (q.kind === 'areas') {
            for (const area of q.options || []) {
                const sys = s.systems.find(x => x.id === area.system);
                if (!sys) continue;
                const disc = FSView.discAt(this.app, sys, area.pos, this.view.metrics);
                hl.push({ x: disc.x, y: disc.y + 2, z: disc.z });
            }
        } else if (q.kind === 'systems') {
            for (const id of q.options || []) {
                const sys = s.systems.find(x => x.id === id);
                if (!sys) continue;
                const p = FSView.tilePos(this.app, sys, this.view.metrics);
                hl.push({ x: p.x, y: this.app.location.terrain.heightAt(p.x, p.y) + 8, z: p.y });
            }
        }
        FSView.highlight(this.view, hl);
    }

    // A click on the board answers the pending effect: units, structures,
    // areas and systems are all picked with the mouse; the panel list is a fallback.
    questionClick(meta) {
        const s = this.state;
        const pending = s.pending;
        const q = pending && pending.question;
        if (!q) return false;
        const seat = pending.answerSeat === undefined ? pending.seat : pending.answerSeat;
        if (seat !== s.seat) return false;      // ждём не нас
        const send = answer => {
            this.net.cmd({ type: 'effect', answer });
            this.effectPick = [];
            this.effectDie = null;
        };
        if (q.kind === 'units' && meta.fs === 'unit') {
            const id = meta.unit;
            if (!(q.options || []).includes(id)) { this.status = 'Этот отряд не подходит.'; this.refresh(); return true; }
            const n = q.n || 1;
            if (n <= 1) { send({ units: [id] }); return true; }
            const list = (this.effectPick = this.effectPick || []);
            const i = list.indexOf(id);
            if (i >= 0) list.splice(i, 1);
            else if (list.length < n) list.push(id);
            else this.status = 'Можно выбрать не больше ' + n + '.';
            this.refresh();
            return true;
        }
        if (q.kind === 'structures' && meta.fs === 'structure') {
            const id = meta.structure;
            if (!(q.options || []).includes(id)) { this.status = 'Эту постройку выбрать нельзя.'; this.refresh(); return true; }
            send({ structure: id });
            return true;
        }
        if (q.kind === 'areas' && meta.fs === 'area') {
            const area = (q.options || []).find(a => a.system === meta.system && a.pos === meta.pos);
            if (!area) { this.status = 'Этот сектор не подходит.'; this.refresh(); return true; }
            send({ [q.answerKey || 'area']: area });
            return true;
        }
        if (q.kind === 'systems' && meta.fs === 'system') {
            const id = meta.system;
            if (!(q.options || []).includes(id)) { this.status = 'Эту систему выбрать нельзя.'; this.refresh(); return true; }
            send({ system: id });
            return true;
        }
        return false;
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
            ctx.richText = q.text || 'Карта требует решения.';
            ctx.status = 'Решает ' + who + '. Ждём.';
            return;
        }
        ctx.richText = q.text || 'Выберите.';
        const send = answer => {
            this.net.cmd({ type: 'effect', answer });
            this.effectPick = [];
            this.effectDie = null;
        };
        switch (q.kind) {
            case 'units': {
                ctx.status = 'Щёлкните по отряду на доске — или по строке слева.';
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
                const dSide = q.diceSide || (combat && must === combat.attacker ? 'attacker' : 'defender');
                const dice = combat ? (combat.dice[dSide] || []) : [];
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
                const dSide = q.diceSide || (combat && must === combat.attacker ? 'attacker' : 'defender');
                const dice = combat ? (combat.dice[dSide] || []).filter(Boolean) : [];
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
                ctx.status = 'Щёлкните по постройке на доске — или по строке слева.';
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
                // Every card-interacting event prints every candidate in full.
                // The catalogue knows the faction and the kind of the question;
                // `card` in the answer remains the plain name the rules expect.
                const faction = (s.players[must] || s.players[0] || {}).faction || '';
                const hint = (q.op === 'buyAnyUpgrade' || q.op === 'buyAnyUpgradeReplace')
                    ? '' : (q.op === 'playEvent' || q.op === 'chooseEventAbility'
                        || q.op === 'lookEvents' ? 'event' : (q.kind2 === 'order' ? 'order' : 'combat'));
                const unique = [...new Set(q.options || [])];
                /** @type {any} */
                const choices = unique.map(name => {
                    const opt = FS_CARDS.option(name, faction,
                        q.kind2 || (hint === 'event' ? 'event' : hint));
                    return {
                        name: opt.name,
                        detail: opt.detail,
                        hint: opt.hint,
                        onClick: () => send(q.op === 'buyUpgradeReplace' || q.op === 'buyAnyUpgradeReplace'
                            ? { card: q.card, remove: name }
                            : { card: name }),
                    };
                });
                choices.title = q.text || 'Выберите карту';
                ctx.cardChoices = choices;
                // A compact fallback keeps tiny/headless DOM shells functional.
                for (const c of choices) ctx.actions.push({
                    kind: 'pick', label: c.name, hint: c.hint, onClick: c.onClick,
                });
                return;
            }
            case 'areas': {
                ctx.status = 'Щёлкните по сектору на доске — или по строке слева.';
                for (const area of q.options) {
                    const sys = s.systems.find(x => x.id === area.system);
                    const world = sys && sys.areas.find(a => a.pos === area.pos);
                    ctx.actions.push({
                        kind: 'pick',
                        label: (sys ? sys.tile : area.system) + ' — ' + (world && world.world ? world.world.name : 'пустота'),
                        onClick: () => send({ [q.answerKey || 'area']: area }),
                    });
                }
                return;
            }
            case 'systems': {
                ctx.status = 'Щёлкните по системе на доске — или по строке слева.';
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
            // The abilities of a combat card are optional: the owner of the card
            // decides about each of them («A player can choose not to resolve
            // one of his abilities»).
            case 'ability': {
                ctx.text = 'Способность карты: «' + (q.text || '') + '»';
                ctx.status = 'Применять её не обязательно.';
                ctx.actions.push({
                    kind: 'primary', icon: 'ui.check',
                    label: q.yes || 'Применить',
                    onClick: () => send({ yes: true }),
                });
                ctx.actions.push({
                    kind: 'secondary',
                    label: q.no || 'Пропустить',
                    onClick: () => send({ no: true }),
                });
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
                    // The option is a step of the card; its own sentence is the label.
                    const label = (opt && (opt.ability || opt.text))
                        ? String(opt.ability || opt.text).replace(/[,;:\s]+$/, '').slice(0, 90)
                        : ('Вариант ' + (i + 1));
                    ctx.actions.push({
                        kind: 'pick',
                        label,
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

    // Where may the pending storm go — the green ghosts of the move.
    // Recomputed on every click that may change the selection: the server only
    // speaks when a command is sent, and picking a storm is not a command.
    updateStormGhosts() {
        this.view.stormPending = null;
        this.view.stormGhosts = [];
        const view = this.state;
        if (view && view.phase === 'refresh' && view.event && view.event.seat === view.seat && !view.event.stormMoved) {
            const pid = this.mode === 'storm' && this.pending ? this.pending.storm : null;
            if (pid) {
                const storm = (view.storms || []).find(x => x.id === pid);
                this.view.stormPending = pid;
                this.view.stormGhosts = FS_RULES.stormOptions(view, view.seat)
                    .filter(o => o.storm === pid)
                    .map(o => {
                        const t = storm ? FS_RULES.stormTarget(view, storm, o.dir) : null;
                        // The ghost is the destination BORDER, not a tile side:
                        // keep the canonical edge and both neighbouring tiles.
                        return t ? Object.assign({}, t, { dir: o.dir, storm: pid }) : null;
                    })
                    .filter(Boolean);
            }
        }
    }

    // The click on a warp storm — or on its green ghost — during the storm step
    // of the refresh: the panel does not move storms any more.
    stormClick(meta) {
        const s = this.state;
        if (!s) return;
        const seat = s.seat;
        const stage = s.phase === 'refresh' && s.event && s.event.seat === seat && !s.event.stormMoved;
        if (!stage) return;                       // outside the storm step the marker is inert
        if (meta.fs === 'storm-ghost') {
            // The ghost is the destination: the storm stands there at once.
            if (!(this.mode === 'storm' && this.pending && this.pending.storm)) return;
            if (meta.storm !== this.pending.storm) return;
            const dir = meta.dir;
            this.net.cmd({ type: 'moveStorm', storm: this.pending.storm, dir });
            this.mode = 'idle';
            this.pending = null;
            this.status = '';
            this.updateStormGhosts();
            if (typeof FSView !== 'undefined' && this.app && this.view) FSView.update(this.app, this.view, this.state);
            this.refresh();
            return;
        }
        // Clicking the storm itself selects (or re-selects) it.
        const movable = FS_RULES.stormOptions(s, seat).filter(o => o.storm === meta.storm);
        if (!movable.length) {
            this.status = 'Этот шторм в эту фазу не двигается: он уже сдвигался либо карта не даёт такой ход.';
            this.refresh();
            return;
        }
        // Clicking another storm while one is chosen: switch the selection —
        // its ghosts take over the board, the previous ones disappear.
        this.mode = 'storm';
        this.pending = { storm: meta.storm };
        this.status = '';
        this.updateStormGhosts();
        if (typeof FSView !== 'undefined' && this.app && this.view) FSView.update(this.app, this.view, this.state);
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
        // The warp storms move with the mouse, on the board itself.
        if (meta && (meta.fs === 'storm' || meta.fs === 'storm-ghost')) {
            this.stormClick(meta);
            return;
        }
        // The orbital strike: the target is picked on the board itself.
        if (this.mode === 'strike' && s.order && s.order.phase === 'strike' && meta.fs === 'area' && target) {
            const t = (this.strikeTargets || []).find(x => x.system === target.system && x.pos === target.pos);
            if (!t) { this.status = 'Удар идёт по вражескому миру в радиусе пустоты.'; this.refresh(); return; }
            this.mode = 'idle';
            this.strikeTargets = null;
            this.net.cmd({ type: 'orbitalStrike', system: t.system, pos: t.pos, from: t.from });
            return;
        }
        // The pending question of a card is answered by clicking the models on
        // the board — a list in the panel stays as a fallback only.
        if (s.pending && s.pending.question && this.questionClick(meta)) return;
        // The dice of the battle lie on the ground of the contested sector: a
        // click on one of them answers the question about a reroll — no list
        // in the panel is needed. Only a die of the side the question is
        // about, and only when it is this seat's answer, counts.
        if (s.pending && s.pending.question && meta.fs === 'die'
            && /^dice/.test(String(s.pending.question.kind || ''))) {
            const q = s.pending.question;
            const cbt = s.combat;
            const mustSeat = s.pending.answerSeat === undefined ? s.pending.seat : s.pending.answerSeat;
            const qSide = q.diceSide || (cbt ? (mustSeat === cbt.attacker ? 'attacker' : 'defender') : null);
            const index = typeof meta.index === 'number' ? meta.index : -1;
            if (mustSeat === s.seat && index >= 0
                && (!cbt || !meta.side || meta.side === qSide)
                && (q.options || []).indexOf(index) >= 0) {
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
        // The damage of the battle: a click on a piece picks who takes it. The
        // pieces belong to the side whose damage step it is, which is not
        // always the side of the player who distributes the damage.
        if (this.mode === 'damage' && s.combat && meta
            && (meta.fs === 'unit' || meta.fs === 'structure'
                || (meta.fs === 'token' && meta.reinforce))) {
            const c = s.combat;
            const suffer = c.step === 'damage-attacker' ? 'attacker' : 'defender';
            const ownerSeat = suffer === 'attacker' ? c.attacker : c.defender;
            const here = x => x && x.system === c.system && x.area === c.pos && x.seat === ownerSeat;
            let id = null;
            if (meta.fs === 'unit') {
                const u = s.units.find(x => x.id === meta.unit);
                if (here(u)) id = meta.unit;
            } else if (meta.fs === 'structure') {
                const st = s.structures.find(x => x.id === meta.structure);
                if (here(st) && st.type === 'bastion') id = meta.structure;
            } else if (meta.side === suffer && meta.system === c.system && meta.pos === c.pos
                && typeof meta.reinforceId === 'string'
                && FS_RULES.reinforceTokenIndex(s, suffer, meta.reinforceId) >= 0) {
                id = meta.reinforceId;
            }
            if (!id) { this.status = 'Урон получают только отряды в этой области боя.'; this.refresh(); return; }
            this.toggleDamage(id);
            return;
        }
        // The cards of the battle are played from the hand at the bottom of the
        // screen — there are no cards in the world any more.
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
            const ord = s.order;
            if (ord && ord.phase === 'guardDeploy' && ord.guardFactory) {
                const isShip = this.pending && this.pending.def && this.pending.def.type === 'ship';
                const inFactoryWorld = target.system === ord.guardFactory.system && target.pos === ord.guardFactory.pos;
                if (isShip) {
                    this.status = '«Массовое Производство» производит только наземные отряды в мир фабрики.';
                    this.refresh();
                    return;
                } else if (!inFactoryWorld) {
                    this.status = 'В этой способности отряды выходят только из мира-производителя.';
                    this.refresh();
                    return;
                }
            }
            // Покупка сверх вместимости сектора не запрещена — по правилам лишние
            // отряды погибают после приказа; но об этом надо предупредить до покупки:
            // первый клик только предупреждает, второй — ставит отряд.
            const cap = FS_RULES.capacity(s, target.system, target.pos);
            const there = FS_RULES.unitsAt(s, target.system, target.pos).length;
            if (there + 1 > cap) {
                const key = 'deploy:' + this.pending.unit + ':' + target.system + ':' + target.pos;
                if (!this.deployOverflow || this.deployOverflow.key !== key) {
                    this.deployOverflow = { key, unit: this.pending.unit, system: target.system, pos: target.pos,
                        cache: !!this.pending.cache, forgeKl: !!this.pending.forgeKl };
                    this.warn = 'Сектор будет переполнен (' + (there + 1) + ' из ' + cap + '): '
                        + 'после окончания приказа лишние ваши отряды погибнут. '
                        + 'Нажмите ещё раз, чтобы поставить отряд.';
                    this.status = '';
                    this.refresh();
                    return;
                }
            }
            this.deployOverflow = null;
            this.warn = '';
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
