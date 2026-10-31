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
        this.name = '';
        this.faction = '';
        this.lobby = { code: '', players: [], factions: [] };
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
        const info = {
            code: this.lobby.code,
            name: this.name,
            faction: this.faction,
            players: this.lobby.players,
            factions: this.lobby.factions,
            link: location.origin + '/?room=' + this.lobby.code,
        };
        FSUI.lobby(info, id => {
            this.faction = id;
            this.net.faction(id);
            this.showLobby();
        }, name => {
            if (!name || name === this.name) return;
            this.name = name;
            Store.set('fs.name', name);
            if (this.net) this.net.rename(name);
        });
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
        // The selected unit may have moved — the rings follow it.
        if (this.mode === 'move' && this.pending && this.pending.unit) {
            const unit = view.units.find(u => u.id === this.pending.unit);
            if (unit) this.highlightMove(unit);
        }
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
            FSUI.update(s, ctx);
            return;
        }
        if (s.over) {
            ctx.title = 'Игра окончена';
            ctx.text = 'Побеждает: ' + (s.winner != null ? s.players[s.winner].name : '—');
            ctx.status = '';
        } else if (s.phase === 'setup') {
            this.panelSetup(s, ctx);
        } else if (s.phase === 'planning') {
            this.panelPlanning(s, ctx);
        } else if (s.phase === 'operations') {
            this.panelOperations(s, ctx);
        } else if (s.phase === 'refresh') {
            this.panelRefresh(s, ctx);
        }
        // The order that is being resolved.
        if (s.order && s.order.seat === me) {
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
        FSUI.update(s, ctx);
    }

    // --- compose the galaxy ---------------------------------------------------
    panelSetup(s, ctx) {
        const setup = s.setup || {};
        const turnPlayer = s.players[setup.turn];
        ctx.title = setup.stage === 'storms' ? 'Расстановка варп-штормов' : 'Сборка галактической карты';
        if (!setup.myTurn) {
            ctx.text = 'Сейчас ход игрока ' + (turnPlayer ? turnPlayer.name : '—') + '. Ожидайте завершения его действий.';
            ctx.status = this.status || 'Когда очередь дойдёт до вас, справа появятся доступные действия.';
            return;
        }
        if (setup.stage === 'forces') {
            const sys = s.systems.find(x => x.id === setup.currentSystem);
            const initial = s.players[s.seat].initialForces;
            ctx.text = 'Система ' + sys.tile + '. Выберите начальные силы и нажмите на подходящий сектор этого тайла. На третьем тайле нужно разместить всё оставшееся.';
            ctx.status = this.status || (this.mode === 'setupUnit' || this.mode === 'setupStructure' ? 'Нажмите на подсвеченную область. Выбранную фигуру можно размещать несколько раз.' : 'Выберите отряд или постройку; размещение можно отменить кнопками ниже.');
            const faction = FS_DATA.factions.find(f => f.id === s.players[s.seat].faction);
            for (const [id, count] of Object.entries(initial.units)) {
                if (!count) continue;
                const def = faction.units.find(u => u.id === id);
                ctx.actions.push({ label: (def ? def.name : id) + ' · осталось ' + count + (def && def.type === 'ship' ? ' · пустота' : ' · мир'), onClick: () => {
                    this.status = ''; this.mode = 'setupUnit'; this.pending = { unit: id }; this.highlightSetupTargets(); this.refresh();
                } });
            }
            const names = { factory: 'Фабрика', bastion: 'Бастион', city: 'Город' };
            for (const [type, count] of Object.entries(initial.structures)) {
                if (!count) continue;
                ctx.actions.push({ label: names[type] + ' · осталось ' + count + ' · мир', onClick: () => {
                    this.status = ''; this.mode = 'setupStructure'; this.pending = { structure: type }; this.highlightSetupTargets(); this.refresh();
                } });
            }
            ctx.actions.push({ label: 'Завершить размещение сил', onClick: () => this.net.cmd({ type: 'finishSetupForces' }) });
            for (const unit of s.units.filter(u => u.system === sys.id && u.seat === s.seat)) {
                const def = faction.units.find(u => u.id === unit.unit);
                const area = sys.areas.find(a => a.pos === unit.area);
                ctx.actions.push({ label: 'Убрать: ' + (def ? def.name : unit.unit) + ' · ' + (area.world ? area.world.name : 'пустота ' + area.pos), onClick: () => this.net.cmd({ type: 'removeSetupForce', kind: 'unit', id: unit.id }) });
            }
            for (const st of s.structures.filter(x => x.system === sys.id && x.seat === s.seat)) {
                const area = sys.areas.find(a => a.pos === st.area);
                ctx.actions.push({ label: 'Убрать: ' + names[st.type] + ' · ' + (area.world ? area.world.name : area.pos), onClick: () => this.net.cmd({ type: 'removeSetupForce', kind: 'structure', id: st.id }) });
            }
            return;
        }
        if (setup.stage === 'objectives') {
            const sys = s.systems.find(x => x.id === setup.currentSystem);
            ctx.text = 'Система ' + sys.tile + '. Выберите жетон соперника, затем место цели на подсвеченном мире. Одинаковые жетоны на одном тайле запрещены.';
            ctx.status = this.status || (this.mode === 'setupObjective' ? 'Нажмите на подсвеченный мир с местом цели.' : 'Выберите жетон цели.');
            for (const option of setup.objectiveOptions || []) {
                const faction = FS_DATA.factions.find(f => f.id === option.faction);
                ctx.actions.push({ label: 'Жетон цели: ' + (faction ? faction.name : option.faction), onClick: () => {
                    this.status = ''; this.mode = 'setupObjective'; this.pending = { faction: option.faction }; this.highlightSetupTargets(); this.refresh();
                } });
            }
            return;
        }
        if (setup.stage === 'storms') {
            const sys = this.pending && this.mode === 'setupStorm' && s.systems.find(x => x.id === this.pending.system);
            ctx.text = 'Выберите систему на карте, затем её сторону. Шторм можно разместить и на внешнем краю карты. Ход идёт от последнего игрока против часовой стрелки.';
            ctx.status = this.status || (sys ? 'Выбрана система ' + sys.tile + '. Выберите сторону справа.' : 'Нажмите на любую систему карты.');
            if (sys) {
                for (const [side, name] of [['N', 'сверху'], ['E', 'справа'], ['S', 'снизу'], ['W', 'слева']]) {
                    const other = FS_RULES.across(s, sys.id, side);
                    const legal = (setup.stormEdges || []).some(e => (e.system === sys.id && e.side === side) || (other && e.system === other && FS_RULES.across(s, other, e.side) === sys.id));
                    if (legal) ctx.actions.push({ label: 'Шторм: ' + sys.tile + ' · ' + name, onClick: () => this.net.cmd({ type: 'setupStorm', system: sys.id, side }) });
                }
            }
            return;
        }
        const hand = setup.hand || [];
        const selected = this.mode === 'placeTile' && this.pending;
        ctx.setupCellSelected = !!(selected && selected.cell);
        ctx.text = 'Выберите тайл и свободное место: сначала появится предпросмотр. Поверните или переверните тайл и подтвердите размещение.';
        ctx.status = this.status || (selected
            ? (selected.cell ? 'Предпросмотр системы ' + selected.tile + ' · поворот ' + (selected.rotation * 90) + '°. Q/E — поворот, F — другая сторона.' : 'Нажмите на подсвеченное место. Q/E — поворот, F — другая сторона.')
            : 'Ваш ход — выберите системный тайл.');
        if (selected) {
            if (selected.cell && !this.setupSubmitting) ctx.actions.push({ label: 'Подтвердить размещение системы', onClick: () => this.confirmSetupTile() });
            ctx.actions.push({ label: '↶ Повернуть влево · Q', onClick: () => this.transformSetupTile('left') });
            ctx.actions.push({ label: '↷ Повернуть вправо · E', onClick: () => this.transformSetupTile('right') });
            ctx.actions.push({ label: '⇄ Перевернуть · F', onClick: () => this.transformSetupTile('flip') });
            ctx.actions.push({ label: 'Отменить выбор тайла', onClick: () => this.cancelSetupTile() });
        }
        hand.forEach(id => {
            const active = selected && selected.handTile === id;
            const face = active ? selected.tile : id;
            const raw = FS_DATA.tiles.find(t => t.id === face);
            // The small hand card follows the selected face and its orientation too.
            const tile = raw && active ? Object.assign({}, raw, {
                areas: FS_RULES.createSystemFromTile({ systems: [] }, raw, s.seat, 0, 0, selected.rotation).areas,
            }) : raw;
            const worlds = tile ? tile.areas.filter(a => a.world).map(a => a.world.name).join(' · ') : '';
            ctx.actions.push({
                label: 'Система ' + face + (worlds ? ' — ' + worlds : ''),
                tile, selected: !!active,
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
        ctx.title = 'Планирование — раунд ' + s.round;
        ctx.text = 'Приказов выложено: ' + (p.placedTokens || 0) + ' из ' + FS_RULES.ORDER_TOKENS
            + '. Выберите приказ и щёлкните по системе, где он допустим.';
        ctx.status = this.mode === 'placeOrder' ? 'Щёлкните по системе для приказа «'
            + FS_RULES.orderName(this.pending.order) + '».' : 'Ваш ход: выложите приказы.';
        const kinds = [['advance', 'Наступление'], ['deploy', 'Развёртывание'],
            ['strategize', 'Стратегия'], ['dominate', 'Доминирование']];
        for (const k of kinds) {
            ctx.actions.push({
                label: k[1],
                onClick: () => {
                    this.mode = 'placeOrder';
                    this.pending = { order: k[0] };
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
        ctx.title = 'Операции — раунд ' + s.round;
        if (s.turn !== me) {
            const who = s.players[s.turn] ? s.players[s.turn].name : '—';
            ctx.text = 'Ход игрока ' + who + '. Ждём.';
            ctx.status = '';
            return;
        }
        // The order that is being resolved is already open.
        if (s.order) {
            ctx.text = 'Приказ уже в игре — закончите его.';
            ctx.status = '';
            return;
        }
        ctx.text = 'Ваш ход: вскройте верхний приказ в системе.';
        ctx.status = '';
        const orders = FS_RULES.availableOrders(s, me);
        for (const o of orders) {
            const sys = s.systems.find(x => x.id === o.system);
            if (!sys) continue;
            const tok = sys.tokens[sys.tokens.length - 1];
            ctx.actions.push({
                label: 'Приказ в ' + sys.tile + ' — ' + FS_RULES.orderName(tok.order),
                onClick: () => this.net.cmd({ type: 'resolveOrder', system: o.system }),
            });
            // The token of the advance, deploy and dominate orders may go to the event deck.
            if (tok.order !== 'strategize') {
                ctx.actions.push({
                    label: 'Отложить приказ из ' + sys.tile + ' в колоду событий',
                    onClick: () => this.net.cmd({ type: 'resolveOrder', system: o.system, toEventDeck: true }),
                });
            }
        }
    }

    // --- the advance order: the movement --------------------------------------
    panelAdvance(s, ctx) {
        const me = s.seat;
        const order = s.order;
        const sys = s.systems.find(x => x.id === order.system);
        ctx.title = 'Наступление — система ' + (sys ? sys.tile : '');
        if (order.phase === 'move') {
            const units = FS_RULES.movableUnits(s, me);
            ctx.text = 'Отряды, которые могут двигаться: ' + units.length
                + '. Выберите отряд, потом щёлкните по цели.';
            ctx.status = this.mode === 'move' ? 'Щёлкните по цели для отряда.' : 'Выберите отряд.';
            for (const u of units) {
                const def = FS_RULES.unitOf(s, u);
                ctx.actions.push({
                    label: (def ? def.name : u.id) + ' (' + u.system + ')',
                    onClick: () => {
                        this.mode = 'move';
                        this.pending = { unit: u.id };
                        this.highlightMove(u);
                        this.refresh();
                    },
                });
            }
            ctx.actions.push({
                label: 'Закончить движение',
                onClick: () => this.net.cmd({ type: 'endAdvance' }),
            });
        } else if (order.phase === 'strike') {
            this.mode = 'strike';
            this.pending = this.pending || { ships: [], target: null };
            this.pending.ships = this.pending.ships || [];
            const ships = s.units.filter(u => u.seat === me && u.system === order.system
                && FS_RULES.unitOf(s, u) && FS_RULES.unitOf(s, u).type === 'ship');
            const sel = (this.pending && this.pending.ships) || [];
            ctx.text = 'Орбитальный удар: выберите корабли ('
                + sel.length + '/' + ships.length + ') и щёлкните по миру.';
            ctx.status = this.pending && this.pending.target
                ? 'Цель: ' + this.pending.target.pos : 'Сначала выберите корабли.';
            for (const sh of ships) {
                const def = FS_RULES.unitOf(s, sh);
                ctx.actions.push({
                    label: (def ? def.name : sh.id) + (sel.indexOf(sh.id) >= 0 ? ' ✓' : ''),
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
                label: 'Нанести удар',
                onClick: () => {
                    const t = this.pending && this.pending.target;
                    const ships2 = (this.pending && this.pending.ships) || [];
                    if (!t || !ships2.length) { this.status = 'Нужны корабли и цель.'; this.refresh(); return; }
                    this.net.cmd({ type: 'orbitalStrike', system: t.system, pos: t.pos, ships: ships2 });
                },
            });
            ctx.actions.push({
                label: 'Без удара — закончить приказ',
                onClick: () => this.net.cmd({ type: 'finishAdvance' }),
            });
        }
    }

    // The legal destinations of a unit are shown as rings.
    highlightMove(unit) {
        const s = this.state;
        const me = s.seat;
        const list = [];
        const order = s.order;
        const sys = s.systems.find(x => x.id === order.system);
        if (!sys) return;
        for (const area of sys.areas) {
            const check = FS_RULES.canMove(s, me, unit, { system: sys.id, pos: area.pos });
            if (!check.ok) continue;
            const p = FSView.areaPos(this.app, sys, area.pos, this.view.metrics);
            const h = this.app.location.terrain.heightAt(p.x, p.y);
            list.push({ x: p.x, y: h + 14, z: p.y });
        }
        FSView.highlight(this.view, list);
    }

    // --- the deploy order -----------------------------------------------------
    panelDeploy(s, ctx) {
        const me = s.seat;
        const p = s.players[me];
        const order = s.order;
        const sys = s.systems.find(x => x.id === order.system);
        const limit = FS_RULES.deployLimit(s, me, order.system);
        ctx.title = 'Развёртывание — система ' + (sys ? sys.tile : '');
        ctx.text = 'Материя: ' + p.materiel + '. Лимит развёртывания (миры с фабриками): ' + limit
            + '. Кузница: ' + (p.assets.forge || 0) + ', тайник: ' + (p.assets.cache || 0) + '.';
        ctx.status = this.mode === 'placeUnit' ? 'Щёлкните по месту для отряда.'
            : this.mode === 'placeStructure' ? 'Щёлкните по миру для постройки.' : '';
        const faction = FS_DATA.factions.find(f => f.id === p.faction);
        if (faction && FS_RULES.hasFactory(s, me, order.system) && (order.bought || 0) < limit) {
            for (const def of faction.units) {
                const n = p.supply.units[def.id] || 0;
                if (n <= 0) continue;
                if (p.materiel < def.cost) continue;
                if (def.kl > FS_RULES.commandLevel(s, me)) continue;
                if (def.forge && !(p.assets.forge || 0)) continue;
                ctx.actions.push({
                    label: def.name + ' ×' + n + ' (' + def.cost + ' материи, КЛ ' + def.kl
                        + ', бой ' + def.combat + ', ' + (def.type === 'ship' ? 'корабль' : 'наземный')
                        + (def.forge ? ', кузница' : '') + ')',
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
            const n = p.supply.structures[type] || 0;
            if (n <= 0 || order.structureBought || (p.materiel < FS_RULES.structureStats(type).cost && !(order.freeStructure && order.freeStructureKind === type))) continue;
            ctx.actions.push({
                label: 'Построить: ' + FS_RULES.structureName(type) + ' ×' + n,
                onClick: () => {
                    this.mode = 'placeStructure';
                    this.pending = { structure: type };
                    this.highlightPlace(null);
                    this.refresh();
                },
            });
        }
        ctx.actions.push({
            label: 'Закончить развёртывание',
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
        ctx.title = 'Стратегия — улучшения';
        ctx.text = 'Материя: ' + p.materiel + '. Можно купить одно боевое улучшение и одно улучшение приказа.';
        ctx.status = '';
        // The upgrades are bought only with his units or structures in the system.
        if (!s.order || !FS_RULES.hasUnitsOrStructures(s, me, s.order.system)) {
            ctx.text = 'В активной системе нет ваших отрядов и построек — улучшения купить нельзя.';
            ctx.actions.push({
                label: 'Закончить стратегию',
                onClick: () => this.net.cmd({ type: 'finishStrategize' }),
            });
            return;
        }
        // Only the cards the player may buy: the level of command and the materiel.
        const level = FS_RULES.commandLevel(s, me);
        const ccards = FS_DATA.combat.filter(c => c.faction === p.faction && c.upgrade);
        const mayBuy = c => c.kl <= level && c.cost <= p.materiel;
        ctx.text += '\n' + ccards.filter(mayBuy).map(c => c.name + ' (КЛ ' + c.kl + '): ' + (c.general || '') + ' ' + (c.unit || '')).join('\n');
        // One combat upgrade and one order upgrade per order.
        for (const c of ccards.filter(mayBuy).filter(() => !s.order.combatUpgrade)) {
            ctx.actions.push({
                label: 'Боевое: ' + c.name + ' (' + c.cost + ' материи)',
                onClick: () => this.net.cmd({ type: 'buyUpgrade', kind: 'combat', card: c.name }),
            });
        }
        const ocards = FS_DATA.orders.filter(c => c.faction === p.faction);
        ctx.text += '\n' + ocards.filter(mayBuy).map(c => c.name + ' (КЛ ' + c.kl + '): ' + (c.text || '')).join('\n');
        for (const c of ocards.filter(mayBuy).filter(() => !s.order.orderUpgrade)) {
            ctx.actions.push({
                label: 'Приказ: ' + c.name + ' (' + c.cost + ' материи)',
                onClick: () => this.net.cmd({ type: 'buyUpgrade', kind: 'order', card: c.name }),
            });
        }
        ctx.actions.push({
            label: 'Закончить стратегию',
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
        ctx.title = 'Обновление — раунд ' + s.round;
        if (!ev) { ctx.text = 'События сыграны.'; return; }
        if (ev.seat !== me) {
            const who = s.players[ev.seat] ? s.players[ev.seat].name : '—';
            ctx.text = 'Событие играет ' + who + '. Ждём.';
            return;
        }
        const card = ev.card || ev.top;
        if (!ev.chosen) {
            ctx.text = 'Выберите карту события из руки.';
            ctx.status = '';
            for (let i = 0; i < ev.drawn.length; i++) {
                const name = ev.drawn[i];
                const data = FS_DATA.events.find(e => e.faction === s.players[me].faction && e.name === name);
                ctx.actions.push({
                    label: name + (data ? ' (' + data.type + ')' : ''),
                    onClick: () => this.net.cmd({ type: 'drawEvent', card: name }),
                });
            }
            if (!ev.drawn.length) {
                ctx.text = 'Нет жетонов приказов: вскрывается верхняя карта колоды (событие не разыгрывается).';
            }
            return;
        }
        const data = FS_DATA.events.find(e => e.faction === s.players[me].faction && e.name === ev.chosen);
        ctx.text = (data ? data.text : '') + (card && card.storm ? '\nВарп-шторм: ' + card.storm.join(', ') : '');
        ctx.status = 'Шторм может сдвинуться на одно деление по стрелке карты.';
        const dirs = (card && card.storm && card.storm[0] !== 'any') ? card.storm : ['N', 'E', 'S', 'W'];
        for (const storm of s.storms) {
            // Every player moves every storm once per round.
            if (storm.moved && storm.moved[me]) continue;
            ctx.actions.push({
                label: 'Сдвинуть шторм (' + storm.system + ' ' + storm.side + ')',
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
                    label: 'Шторм: ' + dir,
                    onClick: () => {
                        this.net.cmd({ type: 'moveStorm', storm: this.pending.storm, dir });
                        this.mode = 'idle';
                        this.pending = null;
                    },
                });
            }
        }
        ctx.actions.push({
            label: 'Разыграть событие',
            onClick: () => {
                if (!ev.card) {
                    // There was no card in the hand — the storm still moves, the event does not.
                    this.net.cmd({ type: 'resolveEvent' });
                    return;
                }
                this.net.cmd({ type: 'resolveEvent' });
            },
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
                        label: 'Подкреплений: ' + i,
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
                        label: name + (data ? ' [' + (data.icons.att || 0) + '/' + (data.icons.def || 0) + '/' + (data.icons.morale || 0) + ']' : ''),
                        onClick: () => {
                            this.net.cmd({ type: 'combat', action: 'playCard', index: i });
                            this.lastCard = data || null;
                        },
                    });
                });
                ctx.actions.push({
                    label: 'Пропустить карту',
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
                        label: (def ? def.name : u.id) + (this.damageTargets.indexOf(u.id) >= 0 ? ' ✓' : ''),
                        onClick: () => {
                            const i = this.damageTargets.indexOf(u.id);
                            if (i >= 0) this.damageTargets.splice(i, 1); else this.damageTargets.push(u.id);
                            this.refresh();
                        },
                    });
                }
                ctx.actions.push({
                    label: 'Принять урон (' + this.damageTargets.length + ')',
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
                        label: 'Отступить: ' + (sys2 ? sys2.tile : a.system) + ' ' + a.pos,
                        onClick: () => this.net.cmd({ type: 'combat', action: 'retreat', target: a }),
                    });
                }
                ctx.actions.push({
                    label: 'Отступить на месте (деморализованы)',
                    onClick: () => this.net.cmd({ type: 'combat', action: 'retreat' }),
                });
                return;
            }
            default:
                return;
        }
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
                        label: (def ? def.name : u.id) + (this.effectPick.indexOf(u.id) >= 0 ? ' ✓' : ''),
                        onClick: () => {
                            const i = this.effectPick.indexOf(u.id);
                            if (i >= 0) this.effectPick.splice(i, 1); else this.effectPick.push(u.id);
                            this.refresh();
                        },
                    });
                }
                ctx.actions.push({
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
                        label: st ? FS_RULES.structureName(st.type) : id,
                        onClick: () => send({ structure: id }),
                    });
                }
                return;
            }
            case 'structureTypes': {
                for (const t of q.options) {
                    ctx.actions.push({
                        label: FS_RULES.structureName(t),
                        onClick: () => send({ type: t }),
                    });
                }
                return;
            }
            case 'cards': {
                for (const name of q.options) {
                    ctx.actions.push({
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
                        label: def ? def.name : id,
                        onClick: () => send({ type: id }),
                    });
                }
                return;
            }
            case 'yesno': {
                ctx.actions.push({
                    label: 'Да — потратить кубик',
                    onClick: () => send({ dice: (q.options || []).slice(0, q.n || 1) }),
                });
                ctx.actions.push({
                    label: 'Нет — принять эффект',
                    onClick: () => send({ dice: [] }),
                });
                return;
            }
            case 'choice': {
                for (let i = 0; i < q.options.length; i++) {
                    const opt = q.options[i];
                    ctx.actions.push({
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
    bindPointer() {
        const canvas = this.app.location.view.world.canvas;
        if (!canvas) return;
        let down = null;
        canvas.addEventListener('pointerdown', e => { if (e.button === 0) down = { x: e.clientX, y: e.clientY, id: e.pointerId }; });
        canvas.addEventListener('pointerup', e => {
            if (!down || down.id !== e.pointerId) return;
            const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
            down = null;
            if (moved > 6) return;             // a drag — the camera
            const rect = canvas.getBoundingClientRect();
            this.onClick(e.clientX - rect.left, e.clientY - rect.top);
        });
        canvas.addEventListener('pointercancel', () => { down = null; });
    }

    inspectAt(meta, point) {
        const state = this.state;
        if (!state || !meta || !meta.system) return;
        let pos = meta.pos || null;
        if (meta.fs === 'system' && point) {
            const system = state.systems.find(x => x.id === meta.system);
            if (system) {
                const center = FSView.tilePos(this.app, system, this.view.metrics);
                pos = (point.z < center.y ? 'T' : 'B') + (point.x < center.x ? 'L' : 'R');
            }
        }
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

    onClick(px, py) {
        const s = this.state;
        if (!s) return;
        const scene = this.view.scene;
        const pick = scene.pick(px == null ? scene.pointerX : px, py == null ? scene.pointerY : py, m => m.isPickable !== false && m.isVisible !== false && (!m.isEnabled || m.isEnabled()) && !!m.metadata && !!m.metadata.fs);
        if (!pick || !pick.hit || !pick.pickedMesh) return;
        const meta = pick.pickedMesh.metadata;
        const point = pick.pickedPoint;
        if (s.phase === 'setup' && s.setup && s.setup.myTurn && s.setup.stage === 'storms' && meta.system) {
            this.status = ''; this.mode = 'setupStorm'; this.pending = { system: meta.system };
            this.highlightSetupTargets(); this.refresh(); return;
        }
        if (this.mode === 'idle') {
            this.inspectAt(meta, point);
            return;
        }
        const me = s.seat;
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
            if (meta.fs !== 'system' && meta.fs !== 'area' && meta.fs !== 'unit' && meta.fs !== 'structure') return;
            this.net.cmd({ type: 'placeOrder', system: meta.system, order: this.pending.order });
            this.mode = 'idle';
            this.pending = null;
            this.refresh();
            return;
        }
        if (this.mode === 'storm') {
            return;                            // the storm moves by the buttons
        }
        // The area under the pointer.
        let systemId = meta.system, pos = meta.pos;
        if (meta.fs === 'system') {
            const sys = s.systems.find(x => x.id === meta.system);
            if (!sys || !point) return;
            const p = FSView.tilePos(this.app, sys, this.view.metrics);
            const dx = point.x - p.x, dy = point.z - p.y;
            pos = (dy < 0 ? 'T' : 'B') + (dx < 0 ? 'L' : 'R');
        }
        if (s.phase === 'setup' && s.setup && s.setup.myTurn && systemId === s.setup.currentSystem && pos) {
            if (this.mode === 'setupUnit') this.net.cmd({ type: 'setupUnit', unit: this.pending.unit, pos });
            else if (this.mode === 'setupStructure') this.net.cmd({ type: 'setupStructure', structure: this.pending.structure, pos });
            else if (this.mode === 'setupObjective') this.net.cmd({ type: 'setupObjective', faction: this.pending.faction, pos });
            return;
        }
        if (this.mode === 'move') {
            const unit = s.units.find(u => u.id === this.pending.unit);
            if (!unit) return;
            this.net.cmd({ type: 'moveUnits', moves: [{ unit: unit.id, system: systemId, pos }] });
            return;
        }
        if (this.mode === 'placeUnit') {
            this.net.cmd({ type: 'buyUnit', unit: this.pending.unit, system: systemId, pos });
            this.mode = 'idle';
            this.pending = null;
            this.refresh();
            return;
        }
        if (this.mode === 'placeStructure') {
            this.net.cmd({ type: 'buyStructure', structure: this.pending.structure, system: systemId, pos });
            this.mode = 'idle';
            this.pending = null;
            this.refresh();
            return;
        }
        if (this.mode === 'strike') {
            this.pending = this.pending || { ships: [], target: null };
            this.pending.target = { system: systemId, pos };
            this.refresh();
            return;
        }
        void me;
    }

    update(dt) {
        // The camera slowly turns to the board when the game starts.
        void dt;
    }
}
