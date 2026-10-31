// FSUI.js — the interface of Forbidden Stars.
//
// Every element of the interface is a record in UILayout.js (the editor's UI
// tab); the code here only fills them with data and reacts to the clicks.
// The dynamic lists (the buttons of the current action, the rows of the lobby)
// are copies of the template records 'fsBtn' and 'fsRow'.

/** @satisfies {Record<string, any>} */
const FSUI = {
    added: [],          // the ids of the runtime copies
    modernRoot: null,
    modernActions: [],
    currentLobby: null,
    helpOpen: false,

    // The full-screen game shell is deliberately separate from ArcEngine's sample HUD.
    mount() {
        if (this.modernRoot) return this.modernRoot;
        const root = document.createElement('div');
        // Tiny DOM stubs used by logic tests intentionally skip the visual shell.
        if (!root.classList || typeof root.replaceChildren !== 'function') return null;
        if (UI.root) UI.root.style.visibility = 'hidden';
        this.modernRoot = root;
        root.className = 'fs-shell' + (window.innerWidth < 850 || IS_MOBILE ? ' is-mobile' : '');
        document.body.appendChild(root);
        // Keep the pressed button alive until the browser dispatches its click.
        // A remote state can arrive between pointerdown and pointerup.
        root.addEventListener('pointerdown', e => {
            const target = /** @type {Element | null} */ (e.target);
            if (target && target.closest && target.closest('button')) this.pressedPointer = e.pointerId;
        });
        const release = e => {
            if (this.pressedPointer !== e.pointerId) return;
            this.pressedPointer = null;
            setTimeout(() => {
                const pending = this.deferredRender;
                this.deferredRender = null;
                if (pending) this.renderModern(pending.state, pending.ctx);
            }, 0);
        };
        window.addEventListener('pointerup', release);
        window.addEventListener('pointercancel', release);
        window.addEventListener('blur', () => {
            if (this.pressedPointer != null) release({ pointerId: this.pressedPointer });
        });
        window.addEventListener('resize', () => {
            if (this.modernRoot) this.modernRoot.classList.toggle('is-mobile', window.innerWidth < 850 || IS_MOBILE);
        });
        return root;
    },

    el(tag, cls, text) {
        const node = document.createElement(tag);
        if (cls) node.className = cls;
        if (text != null) node.textContent = String(text);
        return node;
    },

    renderModern(state, ctx) {
        const root = this.modernRoot;
        if (!root) return;
        if (this.pressedPointer != null) {
            this.deferredRender = { state, ctx };
            return;
        }
        this.deferredRender = null;
        const stageKey = state && state.setup ? [state.setup.stage, state.setup.turn, state.setup.currentSystem, ctx.mode, ctx.setupCellSelected].join(':') : '';
        const previousActions = root.querySelector ? root.querySelector('.fs-actions') : null;
        const scrollTop = this.actionStage === stageKey && previousActions ? previousActions.scrollTop : 0;
        this.actionStage = stageKey;
        root.replaceChildren();
        root.classList.toggle('is-no-state', !state);
        root.classList.toggle('is-placing-tile', !!(state && state.phase === 'setup' && ctx.mode === 'placeTile'));
        if (this.currentLobby) { this.renderModernLobby(); return; }
        const header = this.el('div', 'fs-topbar');
        header.append(this.el('span', 'fs-brand', 'FORBIDDEN STARS'), this.el('i', 'fs-divider'));
        const phaseLabel = state && state.phase === 'setup' ? 'Сборка карты' : ({planning:'Планирование',operations:'Операции',refresh:'Обновление'}[(state || {}).phase] || (state && state.phase) || 'Галактическая война');
        header.append(this.el('span', 'fs-phase', state ? (state.phase === 'setup' ? phaseLabel : 'Раунд ' + state.round + ' · ' + phaseLabel) : phaseLabel));
        const activeSeat = state && state.phase === 'setup' && state.setup ? state.setup.turn : state && state.turn;
        if (state && state.players[activeSeat]) header.append(this.el('span', 'fs-room-pill', 'ХОД · ' + state.players[activeSeat].name));
        root.append(header);

        const tools = this.el('div', 'fs-toolbar');
        const help = this.el('button', 'fs-icon-btn', '?'); help.title = 'Как управлять';
        help.addEventListener('click', () => { this.helpOpen = !this.helpOpen; this.renderModern(state, ctx); });
        const center = this.el('button', 'fs-icon-btn', '⌖'); center.title = 'Вернуть камеру к доске';
        center.addEventListener('click', () => {
            const game = window.app ? /** @type {any} */ (window.app.game) : null;
            if (game && game.aimCamera) game.aimCamera();
            if (window.app && window.app.camera) { window.app.camera.zoomTarget = FS_CAMERA_ZOOM; }
        });
        const full = this.el('button', 'fs-icon-btn', '⛶'); full.title = 'Во весь экран';
        full.addEventListener('click', () => { if (!document.fullscreenElement) document.documentElement.requestFullscreen?.(); else document.exitFullscreen?.(); });
        tools.append(help, center, full); root.append(tools);
        if (this.helpOpen) {
            const pop = this.el('div', 'fs-help-pop'); pop.append(this.el('h3', '', 'Управление доской'));
            pop.append(this.el('p', '', 'Перетаскивайте поле мышью, чтобы перемещать камеру. Колесо мыши — приближение и отдаление.'));
            pop.append(this.el('p', '', 'Выберите действие справа, затем укажите нужную систему или область на доске. Подсвеченные кольца показывают допустимые места.'));
            pop.append(this.el('p', '', 'При сборке выберите тайл и место для предпросмотра. Q/E поворачивают его, F переключает сторону; подтвердите размещение справа.'));
            pop.append(this.el('p', '', 'На телефоне используйте жесты двумя пальцами для масштаба и перетаскивайте доску одним пальцем.'));
            root.append(pop);
        }
        if (!state) {
            const hint = this.el('div', 'fs-map-hint'); hint.textContent = 'ПОДКЛЮЧЕНИЕ К ИГРОВОЙ КОМНАТЕ'; root.append(hint);
            if (ctx && ctx.status) root.append(this.el('div', 'fs-toast', ctx.status));
            return;
        }
        const rail = this.el('div', 'fs-left-rail');
        const playersCard = this.el('section', 'fs-card');
        const ph = this.el('div', 'fs-card-head');
        const boardProgress = state.phase === 'setup' && state.setup ? 'КАРТА · ' + state.setup.placedTotal + '/' + state.setup.totalTiles : 'ИГРОКИ · ' + state.players.length;
        ph.append(this.el('span', 'fs-eyebrow', 'Участники'), this.el('span', 'fs-round-chip', boardProgress)); playersCard.append(ph);
        const list = this.el('div', 'fs-player-list');
        state.players.forEach(p => {
            const row = this.el('div', 'fs-player' + (p.seat === state.seat ? ' is-me' : ''));
            row.style.setProperty('--player-color', p.color || this.factionColor(p.faction));
            row.append(this.el('i', 'fs-player-dot'));
            const name = this.el('div', 'fs-player-name', p.name); name.append(this.el('span', 'fs-player-faction', this.factionName(p.faction) + (p.seat === state.seat ? ' · вы' : '')));
            row.append(name);
            const stats = this.el('div', 'fs-player-stats'); stats.append(this.el('span', '', '✦ ' + (p.objectives || 0)), this.el('span', '', '◈ ' + (p.materiel || 0))); row.append(stats);
            const assets = p.assets || {};
            const reserves = Object.values((p.supply && p.supply.units) || {}).reduce((sum, count) => sum + (Number(count) || 0), 0);
            const resourceLine = this.el('div', 'fs-player-assets');
            [['⚒', assets.forge, 'Кузницы'], ['⬡', assets.cache, 'Запасы'], ['✚', assets.reinforcement, 'Подкрепления'], ['✧', assets.prosperity, 'Процветание'], ['♟', reserves, 'Отряды в запасе']].forEach(([icon, count, title]) => {
                const chip = this.el('span', 'fs-asset-chip', icon + ' ' + (count || 0)); chip.title = title; resourceLine.append(chip);
            });
            row.append(resourceLine);
            list.append(row);
        });
        playersCard.append(list); rail.append(playersCard);
        const logCard = this.el('section', 'fs-card fs-log-card'); const lh = this.el('div', 'fs-card-head'); lh.append(this.el('span', 'fs-eyebrow', 'Хроника')); logCard.append(lh);
        const lines = this.el('div', 'fs-log-lines');
        (state.log || []).slice(-6).reverse().forEach(l => {
            const who = l.seat >= 0 && state.players[l.seat] ? state.players[l.seat].name + ': ' : '';
            lines.append(this.el('div', 'fs-log-line', who + l.text));
        }); logCard.append(lines); rail.append(logCard); root.append(rail);

        const panel = this.el('section', 'fs-main-panel');
        const head = this.el('div', 'fs-panel-heading'); head.append(this.el('div', 'fs-eyebrow', state.over ? 'Итоги сражения' : 'Текущий этап'));
        head.append(this.el('h2', '', ctx.title || 'Галактическая кампания'));
        head.append(this.el('p', '', ctx.text || 'Выберите действие, чтобы продолжить партию.')); panel.append(head);
        if (ctx.status) panel.append(this.el('div', 'fs-status', ctx.status));
        const inspection = this.renderInspector(state, ctx.inspection);
        if (inspection) panel.append(inspection);
        const actions = this.el('div', 'fs-actions');
        const icons = ['✦','⬡','◈','⚔','⌖','⛨','✧','➤'];
        (ctx.actions || []).forEach((a, i) => {
            if (a.enabled === false) return;
            const button = this.el('button', a.tile ? 'fs-tile-choice' + (a.selected ? ' is-selected' : '') : 'fs-action'); button.type = 'button';
            if (a.tile) {
                button.setAttribute('aria-pressed', a.selected ? 'true' : 'false');
                button.append(this.tilePreview(a.tile));
            } else {
                const icon = this.el('span', 'fs-action-icon', icons[i % icons.length]);
                button.append(icon, this.el('span', 'fs-action-label', a.label), this.el('span', 'fs-action-arrow', '›'));
            }
            button.addEventListener('click', () => a.onClick && a.onClick()); actions.append(button);
        });
        if (!(ctx.actions || []).length) actions.append(this.el('div', 'fs-empty', state.over ? 'Партия завершена.' : 'Сейчас нет доступных действий. Следите за ходом соперников.'));
        panel.append(actions); root.append(panel);
        actions.scrollTop = scrollTop;
        const hint = this.el('div', 'fs-map-hint');
        hint.innerHTML = state.phase === 'setup'
            ? '<b>СБОРКА КАРТЫ</b>　•　Следуйте подсказкам справа　•　Выбирайте подсвеченные места на карте'
            : ctx.mode === 'idle'
                ? '<b>ДОСКА</b>　•　Клик по сектору — сведения　•　Перетаскивание — камера　•　Колесо — масштаб'
                : '<b>ДОСКА</b>　•　Выберите подсвеченную область для действия　•　Перетаскивание — камера';
        root.append(hint);
        if (ctx.status && this.statusError(ctx.status)) root.append(this.el('div', 'fs-toast', ctx.status));
    },

    // A readable miniature of the four sectors, in the same orientation as the board.
    tilePreview(tile) {
        const wrap = this.el('div', 'fs-tile-preview');
        const title = this.el('div', 'fs-tile-preview-title', 'Система ' + tile.id + (tile.home ? ' · родная система' : ''));
        wrap.append(title);
        const grid = this.el('div', 'fs-tile-grid');
        const names = { forge: 'Кузница', cache: 'Запасы', reinforcement: 'Подкрепление', prosperity: 'Процветание' };
        for (const pos of ['TL', 'TR', 'BL', 'BR']) {
            const area = tile.areas.find(a => a.pos === pos);
            const world = area && area.world;
            const sector = this.el('div', 'fs-tile-sector' + (world ? ' is-world' : ' is-void'));
            if (world) {
                sector.append(this.el('span', 'fs-tile-planet', '●'));
                const info = this.el('div', 'fs-tile-world-info');
                info.append(this.el('strong', '', world.name));
                info.append(this.el('span', 'fs-tile-stats', 'Материя ' + (world.materiel || 0) + ' · Вместимость ' + world.capacity));
                const assets = (world.assets || []).map(a => names[a] || a);
                if (world.objective) assets.push('Цель');
                info.append(this.el('span', 'fs-tile-assets', assets.length ? assets.join(' · ') : 'Без ресурса'));
                sector.append(info);
            } else {
                sector.append(this.el('span', 'fs-tile-void', '✧ Пустота'), this.el('span', 'fs-tile-stats', 'Вместимость 3'));
            }
            grid.append(sector);
        }
        wrap.append(grid);
        return wrap;
    },

    statusError(text) { return /ошиб|связи|нет связи|нельзя|не удалось/i.test(text || ''); },

    renderInspector(state, selected) {
        if (!selected || !selected.system) return null;
        const system = state.systems.find(s => s.id === selected.system);
        if (!system) return null;
        const area = system.areas.find(a => a.pos === selected.pos);
        const world = area && area.world;
        const panel = this.el('section', 'fs-inspector');
        const head = this.el('div', 'fs-inspector-head');
        const title = this.el('div', 'fs-inspector-title');
        title.append(this.el('span', 'fs-inspector-kicker', 'СИСТЕМА ' + system.tile + ' · ' + system.id.toUpperCase()));
        title.append(this.el('strong', '', world ? world.name : area ? 'Пустотный сектор' : 'Орбитальная система'));
        const close = this.el('button', 'fs-inspector-close', '×'); close.type = 'button'; close.title = 'Закрыть сведения';
        close.addEventListener('click', () => {
            const game = window.app ? /** @type {any} */ (window.app.game) : null;
            if (game) {
                game.inspection = null;
                FSView.clearInspection(game.view);
                game.refresh();
            }
        });
        head.append(title, close); panel.append(head);
        const ownerLine = this.el('div', 'fs-inspector-owner');
        if (area) {
            const seats = [...new Set([
                ...state.units.filter(u => u.system === system.id && u.area === area.pos).map(u => u.seat),
                ...state.structures.filter(s => s.system === system.id && s.area === area.pos).map(s => s.seat),
            ])].sort((a, b) => a - b);
            ownerLine.textContent = seats.length === 1
                ? 'Контроль: ' + state.players[seats[0]].name
                : seats.length > 1
                    ? 'Спорная зона: ' + seats.map(seat => state.players[seat].name).join(' / ')
                    : 'Никем не контролируется';
        } else ownerLine.textContent = 'Выберите сектор для просмотра контроля';
        if (selected.storm) ownerLine.textContent += ' · Варп-шторм ' + selected.storm;
        panel.append(ownerLine);
        if (world) {
            const stats = this.el('div', 'fs-inspector-stats');
            [['◈', world.materiel, 'Материалы'], ['⌂', world.capacity, 'Вместимость'], ['◎', world.objective ? 'Да' : '—', 'Цель']].forEach(([icon, value, label]) => {
                const chip = this.el('span', 'fs-inspector-chip', icon + ' ' + value); chip.title = label; stats.append(chip);
            });
            const glyph = { forge: '⚒', cache: '▦', reinforcement: '✚', prosperity: '✧' };
            for (const asset of world.assets || []) {
                const chip = this.el('span', 'fs-inspector-chip is-asset', glyph[asset] || asset);
                chip.title = ({ forge: 'Кузница', cache: 'Запасы', reinforcement: 'Подкрепление', prosperity: 'Процветание' })[asset] || asset;
                stats.append(chip);
            }
            panel.append(stats);
        }
        if (area) {
            const units = state.units.filter(u => u.system === system.id && u.area === area.pos);
            const structures = state.structures.filter(s => s.system === system.id && s.area === area.pos);
            const summaries = [];
            const bySeat = new Map();
            for (const unit of units) {
                const def = FS_RULES.unitOf(state, unit);
                if (!def) continue;
                const key = unit.seat + ':' + def.name;
                const item = bySeat.get(key) || { seat: unit.seat, name: def.name, type: def.type, count: 0 };
                item.count++; bySeat.set(key, item);
            }
            for (const item of bySeat.values()) {
                const player = state.players[item.seat];
                summaries.push((player ? player.name : 'Игрок') + ': ' + item.name + ' ×' + item.count);
            }
            if (structures.length) {
                const labels = { city: 'города', factory: 'фабрики', bastion: 'бастиона' };
                const counts = {};
                structures.forEach(x => { counts[x.type] = (counts[x.type] || 0) + 1; });
                for (const [type, count] of Object.entries(counts)) summaries.push((labels[type] || type) + ' ×' + count);
            }
            if (!summaries.length) summaries.push('Отрядов и построек нет');
            if (selected.unit) {
                const unit = state.units.find(u => u.id === selected.unit);
                const def = unit && FS_RULES.unitOf(state, unit);
                if (def) summaries.unshift('Выбрано: ' + def.name + (unit.routed ? ' · отступает' : ''));
            }
            if (selected.structure) summaries.unshift('Выбрано строение');
            const list = this.el('div', 'fs-inspector-roster');
            summaries.slice(0, 4).forEach(text => list.append(this.el('span', '', text)));
            panel.append(list);
        }
        return panel;
    },

    renderModernLobby() {
        const root = this.modernRoot, info = this.currentLobby;
        if (!root || !info) return;
        const overlay = this.el('div', 'fs-overlay'); const card = this.el('section', 'fs-lobby');
        const hero = this.el('div', 'fs-lobby-hero');
        hero.append(this.el('div', 'fs-lobby-kicker', 'Стратегическая игра · 2–4 игрока'));
        hero.append(this.el('h1', 'fs-lobby-title', 'Forbidden Stars'));
        hero.append(this.el('div', 'fs-lobby-subtitle', 'Выберите фракцию и вступите в борьбу за сектора галактики.'));
        const meta = this.el('div', 'fs-lobby-meta'); meta.append(this.el('span', 'fs-room-code', info.code || '…'));
        const copy = this.el('button', 'fs-copy-link', '⧉ Скопировать ссылку для друзей');
        copy.addEventListener('click', async () => { try { await navigator.clipboard.writeText(info.link || location.href); copy.textContent = '✓ Ссылка скопирована'; } catch { copy.textContent = info.link || location.href; } });
        meta.append(copy); hero.append(meta); card.append(hero);
        const body = this.el('div', 'fs-lobby-body'); const top = this.el('div', 'fs-lobby-topline');
        top.append(this.el('h3', '', info.faction ? 'Ваша фракция выбрана' : 'Выберите фракцию'));
        const nameField = this.el('label', 'fs-name-field', 'Имя игрока'); const input = this.el('input'); input.maxLength = 24; input.value = info.name || ''; input.placeholder = 'Например, Командор';
        input.addEventListener('change', () => info.onName && info.onName(input.value.trim()));
        input.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur(); });
        nameField.append(input); top.append(nameField); body.append(top);
        const players = this.el('div', 'fs-lobby-players');
        (info.players || []).forEach(p => { const chip = this.el('div', 'fs-lobby-player'); chip.style.setProperty('--player-color', this.factionColor(p.faction)); chip.append(this.el('i', 'fs-player-dot'), this.el('span', '', p.name + (p.faction ? ' · ' + this.factionName(p.faction) : ' · выбирает фракцию'))); players.append(chip); });
        body.append(players);
        const grid = this.el('div', 'fs-faction-grid');
        (info.factions || []).forEach((f, i) => {
            const taken = (info.players || []).some(p => p.faction === f.id && p.name !== info.name);
            const button = this.el('button', 'fs-faction' + (info.faction === f.id ? ' is-selected' : ''));
            button.type = 'button'; button.style.setProperty('--faction-color', f.color || this.factionColor(f.id));
            const crest = this.el('span', 'fs-faction-crest', (f.name || '★').slice(0,1));
            const copyName = this.el('span', 'fs-faction-name', f.name || f.id); copyName.append(this.el('span', 'fs-faction-state', info.faction === f.id ? 'Выбрана вами' : (taken ? 'Уже занята' : 'Нажмите, чтобы выбрать')));
            button.append(crest, copyName); button.disabled = taken && info.faction !== f.id;
            if (button.disabled) button.style.opacity = '.4';
            button.addEventListener('click', () => info.onFaction && info.onFaction(f.id)); grid.append(button);
        });
        body.append(grid);
        const foot = this.el('div', 'fs-lobby-foot', 'Игра начнётся автоматически, когда все участники выберут разные фракции. Отправьте код комнаты друзьям.'); body.append(foot);
        card.append(body); overlay.append(card); root.append(overlay);
    },

    // A runtime copy of the template record.
    add(templateId, id, x, y, text, onClick, w) {
        const t = UI.def(templateId);
        if (!t) return null;
        const def = Object.assign({}, t, { id, x, y, text, visible: 1 });
        if (w) def.w = w;
        const el = UI.add(def);
        if (!el) return null;
        if (onClick) el.onClick(onClick);
        this.added.push(id);
        return el;
    },

    // Remove the runtime copies of the previous update.
    clearAdded() {
        for (const id of this.added) UI.remove(id);
        this.added = [];
    },

    set(id, text) {
        const el = UI.get(id);
        if (el) el.setText(text);
    },

    show(id, on) {
        const el = UI.get(id);
        if (el) el.show(on);
    },

    // -----------------------------------------------------------------------
    //  The lobby: the room, the players and the choice of the faction
    // -----------------------------------------------------------------------
    lobby(info, onFaction, onName) {
        this.mount();
        this.currentLobby = Object.assign({}, info, { onFaction, onName });
        this.renderModern(null, {});
        this.clearAdded();
        this.show('fsLobby', true);
        this.set('fsLobbyTitle', 'Forbidden Stars');
        this.set('fsLobbyInfo', 'Комната: ' + info.code + '   ·   вы: ' + info.name
            + (info.faction ? ' (' + this.factionName(info.faction) + ')' : ' — выберите фракцию')
            + (info.link ? '\nСсылка для друзей: ' + info.link : ''));
        const lines = info.players.map((p, i) => (i + 1) + '. ' + p.name
            + (p.faction ? ' — ' + this.factionName(p.faction) : ' — ждёт фракцию'));
        this.set('fsLobbyPlayers', lines.join('\n'));
        // The faction buttons.
        const list = info.factions || [];
        const col = 2;
        const w = 200;
        list.forEach((f, i) => {
            const x = 18 + (i % col) * (w + 8);
            const yy = 120 + Math.floor(i / col) * 32;
            this.add('fsLobbyBtn', 'fsF' + i, x, yy, f.name, () => onFaction(f.id), w);
        });
    },

    factionName(id) {
        const f = FS_DATA.factions.find(x => x.id === id);
        return f ? f.name : id;
    },

    factionColor(id) {
        const f = FS_DATA.factions.find(x => x.id === id);
        return f ? f.color : '#8899aa';
    },

    // -----------------------------------------------------------------------
    //  The state of the game
    // -----------------------------------------------------------------------
    update(state, ctx) {
        this.currentLobby = null;
        this.renderModern(state, ctx);
        this.clearAdded();
        const me = state.players[state.seat];
        // The top panel: the phase, the round and the players.
        const phaseName = {
            setup: 'сборка карты', planning: 'планирование', operations: 'операции', refresh: 'обновление',
        }[state.phase] || state.phase;
        const activeSeat = state.phase === 'setup' && state.setup ? state.setup.turn : state.turn;
        const who = state.players[activeSeat] ? state.players[activeSeat].name : '';
        this.set('fsPhase', 'Раунд ' + state.round + ' · ' + phaseName + (state.phase === 'refresh' ? '' : ' · ход: ' + who));
        const lines = state.players.map(p => {
            const marks = [];
            if (p.eliminated) marks.push('выбыл');
            if (p.seat === state.seat) marks.push('вы');
            if (state.firstPlayer === p.seat) marks.push('первый');
            return p.name + ' [' + this.factionName(p.faction) + '] — материя ' + p.materiel
                + ', целей ' + p.objectives + (marks.length ? ' (' + marks.join(', ') + ')' : '');
        });
        this.set('fsPlayers', lines.join('\n'));
        // The log.
        const log = state.log.slice(-8).map(l => (l.seat >= 0 ? state.players[l.seat] ? state.players[l.seat].name + ': ' : '' : '') + l.text);
        this.set('fsLog', log.join('\n'));
        // The side panel.
        this.set('fsSideTitle', ctx.title || '');
        this.set('fsSideText', ctx.text || '');
        this.set('fsStatus', ctx.status || '');
        // The buttons of the current action.
        let y = 8;
        for (const a of ctx.actions || []) {
            const el = this.add('fsBtn', 'fsA' + y, 8, y, a.label, a.onClick, a.w || 234);
            if (el && a.enabled === false) el.show(false);
            y += 30;
        }
    },
};
