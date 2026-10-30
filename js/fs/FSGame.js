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
        this.state = null;
        this.net = null;
        this.mode = 'idle';
        /** @type {any} */
        this.pending = null;
        /** @type {any} */
        this.lastCard = null;
        this.damageTargets = [];
        this.status = '';
        this.name = '';
        this.faction = '';
        this.lobby = { code: '', players: [], factions: [] };

        const params = new URLSearchParams(location.search);
        this.room = (params.get('room') || '').toUpperCase();
        this.name = params.get('name') || Store.get('fs.name') || '';
        this.id = Store.get('fs.id') || '';

        this.setupCamera();
        this.bindPointer();
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
        this.app.camera.lookAt(m.cx, m.cy);
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
            this.status = msg.msg || 'Ошибка.';
            this.refresh();
        });
        this.net.on('close', () => {
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
        });
    }

    // --- the state -------------------------------------------------------------
    onState(view) {
        this.state = view;
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
        const ctx = { title: '', text: '', status: this.status || '', actions: [] };
        // A new order (or a new step of it) — the pending action is dropped.
        const orderKey = s.order ? s.order.order + ':' + s.order.phase : '';
        if (this.orderKey !== orderKey) {
            this.orderKey = orderKey;
            this.mode = 'idle';
            this.pending = null;
            this.damageTargets = [];
            FSView.clearHighlights(this.view);
        }
        if (s.over) {
            ctx.title = 'Игра окончена';
            ctx.text = 'Побеждает: ' + (s.winner != null ? s.players[s.winner].name : '—');
            ctx.status = '';
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
        // The combat.
        if (s.combat) this.panelCombat(s, ctx);
        FSUI.update(s, ctx);
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
            const p = FSView.areaPos(this.app, sys, area.pos);
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
        if (faction) {
            for (const def of faction.units) {
                const n = p.supply.units[def.id] || 0;
                if (n <= 0) continue;
                ctx.actions.push({
                    label: def.name + ' ×' + n + ' (' + def.cost + ' материи, КЛ ' + def.kl + (def.forge ? ', кузница' : '') + ')',
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
            if (n <= 0) continue;
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
            if (def) {
                // The ships stand in the voids, the ground units on the worlds.
                if (def.type === 'ship' && area.world) continue;
                if (def.type === 'ground' && !area.world) continue;
            } else if (!area.world) {
                continue;                       // a structure stands on a world
            }
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
        const ccards = FS_DATA.combat.filter(c => c.faction === p.faction && c.upgrade);
        for (const c of ccards) {
            ctx.actions.push({
                label: 'Боевое: ' + c.name + ' (' + c.cost + ' материи)',
                onClick: () => this.net.cmd({ type: 'buyUpgrade', kind: 'combat', card: c.name }),
            });
        }
        const ocards = FS_DATA.orders.filter(c => c.faction === p.faction);
        for (const c of ocards) {
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
                    ctx.text += '\n\n«' + this.lastCard.name + '»: ' + (this.lastCard.general || '')
                        + (this.lastCard.unit ? ' ' + this.lastCard.unit : '');
                    ctx.actions.push({ label: 'Жетон атаки +1', onClick: () => this.net.cmd({ type: 'combat', action: 'token', tokenType: 'att', count: 1 }) });
                    ctx.actions.push({ label: 'Жетон обороны +1', onClick: () => this.net.cmd({ type: 'combat', action: 'token', tokenType: 'def', count: 1 }) });
                    ctx.actions.push({ label: 'Кубик +1', onClick: () => this.net.cmd({ type: 'combat', action: 'die', count: 1 }) });
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

    // --- the pointer ----------------------------------------------------------
    bindPointer() {
        const canvas = this.app.location.view.world.canvas;
        if (!canvas) return;
        let down = null;
        canvas.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY }; });
        canvas.addEventListener('pointerup', e => {
            if (!down) return;
            const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
            down = null;
            if (moved > 6) return;             // a drag — the camera
            this.onClick();
        });
    }

    onClick() {
        const s = this.state;
        if (!s || this.mode === 'idle') return;
        const scene = this.view.scene;
        const pick = scene.pick(scene.pointerX, scene.pointerY, m => !!m.metadata && !!m.metadata.fs);
        if (!pick || !pick.hit || !pick.pickedMesh) return;
        const meta = pick.pickedMesh.metadata;
        const point = pick.pickedPoint;
        const me = s.seat;
        if (this.mode === 'placeOrder') {
            // A unit or a structure also means its system.
            if (meta.fs !== 'system' && meta.fs !== 'unit' && meta.fs !== 'structure') return;
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
