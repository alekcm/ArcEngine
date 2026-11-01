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
        // A test party: one person plays both seats, the interface says which one is his now.
        if (state && state.solo) header.append(this.el('span', 'fs-room-pill is-solo', 'ТЕСТ · вы за обоих'));
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
            const pop = this.el('div', 'fs-help-pop'); pop.append(this.el('h3', '', 'Как играть мышью'));
            pop.append(this.el('p', '', 'Перетаскивание — камера, колесо — масштаб, клик — выбор.'));
            pop.append(this.el('p', '', 'Наступление: клик по своим отрядам на доске берёт их в группу, кольца показывают, куда можно идти, стрелка показывает маршрут. Клик по сектору отправляет группу, клик по отряду убирает его из группы.'));
            pop.append(this.el('p', '', 'Операции: клик по своему жетону приказа вскрывает его прямо на доске.'));
            pop.append(this.el('p', '', 'Сборка карты: выберите систему справа, клик по месту — предпросмотр, Q/E — поворот, F — другая сторона. Подтверждение — на табличке над системой.'));
            pop.append(this.el('p', '', 'В панели справа — только то, что нужно сейчас: сколько у вас жетонов каждого вида (включая нули) и одна кнопка «дальше».'));
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

        // The right panel does one thing at a time: what is going on, the tokens the
        // player owns (counted, zeros included), the choice of the moment and a
        // single button to go on. Everything else happens on the board itself.
        const panel = this.el('section', 'fs-main-panel');
        const head = this.el('div', 'fs-panel-heading'); head.append(this.el('div', 'fs-eyebrow', state.over ? 'Итоги сражения' : 'Текущий этап'));
        head.append(this.el('h2', '', ctx.title || 'Галактическая кампания'));
        head.append(this.el('p', '', ctx.text || 'Выберите действие, чтобы продолжить партию.')); panel.append(head);
        if (ctx.status) panel.append(this.el('div', 'fs-status', ctx.status));
        const inspection = this.renderInspector(state, ctx.inspection);
        if (inspection) panel.append(inspection);
        const tokens = this.renderTokens(ctx.tokens);
        if (tokens) panel.append(tokens);
        const hand = this.renderHand(ctx.hand, ctx.handTitle);
        if (hand) panel.append(hand);
        const selection = this.renderSelection(ctx.selection);
        if (selection) panel.append(selection);
        const actions = this.el('div', 'fs-actions');
        const items = (ctx.actions || []).filter(a => a.enabled !== false);
        const tiles = items.filter(a => a.tile);
        const picks = items.filter(a => !a.tile && a.kind === 'pick');
        const chips = items.filter(a => !a.tile && (!a.kind || a.kind === 'chip'));
        const primaries = items.filter(a => a.kind === 'primary');
        const secondaries = items.filter(a => a.kind === 'secondary');
        if (tiles.length) {
            const grid = this.el('div', 'fs-tile-list');
            for (const a of tiles) {
                const button = this.el('button', 'fs-tile-choice' + (a.selected ? ' is-selected' : '')); button.type = 'button';
                button.setAttribute('aria-pressed', a.selected ? 'true' : 'false');
                button.append(this.tilePreview(a.tile));
                button.addEventListener('click', () => a.onClick && a.onClick());
                grid.append(button);
            }
            actions.append(grid);
        }
        if (picks.length) {
            const grid = this.el('div', 'fs-pick-grid');
            for (const a of picks) {
                const button = this.el('button', 'fs-pick' + (a.selected ? ' is-selected' : '')); button.type = 'button';
                if (a.hint) button.title = a.hint;
                if (a.icon) button.append(this.el('span', 'fs-pick-icon', a.icon));
                button.append(this.el('span', 'fs-pick-label', a.label));
                if (a.count != null) button.append(this.el('span', 'fs-pick-count', typeof a.count === 'number' ? a.count + '×' : a.count));
                button.addEventListener('click', () => a.onClick && a.onClick());
                grid.append(button);
            }
            actions.append(grid);
        }
        for (const a of chips) {
            const button = this.el('button', 'fs-chip' + (a.selected ? ' is-selected' : '')); button.type = 'button';
            if (a.hint) button.title = a.hint;
            if (a.icon) button.append(this.el('span', 'fs-chip-icon', a.icon));
            button.append(this.el('span', 'fs-chip-label', a.label));
            if (a.count != null) button.append(this.el('span', 'fs-chip-count', typeof a.count === 'number' ? a.count + '×' : a.count));
            button.addEventListener('click', () => a.onClick && a.onClick());
            actions.append(button);
        }
        if (!items.length) actions.append(this.el('div', 'fs-empty', state.over ? 'Партия завершена.' : 'Следите за ходом соперников.'));
        panel.append(actions);
        for (const a of primaries) {
            const button = this.el('button', 'fs-primary'); button.type = 'button';
            button.append(this.el('span', 'fs-primary-icon', a.icon || '➤'), this.el('span', '', a.label));
            button.addEventListener('click', () => a.onClick && a.onClick());
            panel.append(button);
        }
        for (const a of secondaries) {
            const button = this.el('button', 'fs-secondary'); button.type = 'button';
            button.textContent = a.label;
            button.addEventListener('click', () => a.onClick && a.onClick());
            panel.append(button);
        }
        root.append(panel);
        actions.scrollTop = scrollTop;
        const hint = this.el('div', 'fs-map-hint');
        hint.innerHTML = state.phase === 'setup'
            ? '<b>СБОРКА КАРТЫ</b>　•　Клик по месту — предпросмотр　•　<b>Q</b>/<b>E</b> поворот　•　<b>F</b> другая сторона'
            : ctx.mode === 'idle'
                ? '<b>ДОСКА</b>　•　Клик — сведения　•　Перетаскивание — камера　•　Колесо — масштаб'
                : '<b>ДОСКА</b>　•　Клик по отряду — выделить　•　Клик по сектору — идти　•　Перетаскивание — камера';
        root.append(hint);
        if (ctx.status && this.statusError(ctx.status)) root.append(this.el('div', 'fs-toast', ctx.status));
        this.renderPlaque();
    },

    // The owned tokens at a glance: "2× Кузница", "0× Подкрепление" — the zeros
    // stay in the list so one look says what is missing.
    renderTokens(tokens) {
        if (!tokens || !tokens.length) return null;
        const card = this.el('section', 'fs-tokens');
        card.append(this.el('div', 'fs-eyebrow', 'Ваши жетоны'));
        for (const token of tokens) {
            const count = Number(token.count) || 0;
            const row = this.el('div', 'fs-token-row' + (count ? '' : ' is-zero'));
            if (token.hint) row.title = token.hint;
            row.append(this.el('span', 'fs-token-icon', token.icon || '◆'));
            row.append(this.el('b', 'fs-token-count', count + '×'));
            row.append(this.el('span', 'fs-token-label', token.label));
            card.append(row);
        }
        return card;
    },

    // The choice of the moment: the token or the card that is played now.
    renderHand(hand, title) {
        if (!hand || !hand.length) return null;
        const card = this.el('section', 'fs-hand');
        card.append(this.el('div', 'fs-eyebrow', title || 'Выберите жетон'));
        for (const item of hand) {
            const button = this.el('button', 'fs-hand-card' + (item.selected ? ' is-selected' : '')); button.type = 'button';
            if (item.hint) button.title = item.hint;
            button.append(this.el('span', 'fs-hand-icon', item.icon || '◆'));
            button.append(this.el('span', 'fs-hand-count', (Number(item.count) || 1) + '×'));
            const text = this.el('span', 'fs-hand-text');
            text.append(this.el('span', 'fs-hand-name', item.label));
            if (item.kind) text.append(this.el('span', 'fs-hand-kind', item.kind));
            button.append(text);
            button.addEventListener('click', () => item.onClick && item.onClick());
            card.append(button);
        }
        return card;
    },

    // What the mouse has picked on the board.
    renderSelection(selection) {
        if (!selection) return null;
        const card = this.el('section', 'fs-selection');
        card.append(this.el('span', 'fs-selection-count', (selection.count || 0) + '×'));
        const text = this.el('span', 'fs-selection-text');
        text.append(this.el('strong', '', selection.title || 'Отряды выбраны'));
        if (selection.hint) text.append(this.el('span', 'fs-selection-hint', selection.hint));
        card.append(text);
        return card;
    },

    // --- the plaques that float over the board ------------------------------
    // The confirmation never hides in the panel: it appears above the system the
    // player is looking at, where the finger or the pointer already is.

    setPlaque(info) {
        this.plaqueInfo = info;
        this.renderPlaque();
    },

    movePlaque(x, y) {
        const el = this.plaqueEl;
        if (!el || !el.style) return;
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        el.style.left = Math.round(x) + 'px';
        el.style.top = Math.round(y) + 'px';
    },

    renderPlaque() {
        if (!this.modernRoot) return;
        if (this.plaqueEl) {
            if (typeof this.plaqueEl.remove === 'function') this.plaqueEl.remove();
            this.plaqueEl = null;
        }
        const info = this.plaqueInfo;
        if (!info || !this.modernRoot.append) return;
        const el = this.el('div', 'fs-plaque' + (info.ok === false ? ' is-blocked' : '') + (info.top ? ' is-top' : ''));
        const text = this.el('div', 'fs-plaque-text');
        if (info.kicker) text.append(this.el('span', 'fs-plaque-kicker', info.kicker));
        text.append(this.el('strong', 'fs-plaque-title', info.title || ''));
        if (info.hint) text.append(this.el('span', 'fs-plaque-hint', info.hint));
        el.append(text);
        for (const action of info.actions || []) {
            const button = this.el('button', 'fs-plaque-btn' + (action.primary ? ' is-primary' : '')); button.type = 'button';
            button.append(this.el('span', 'fs-plaque-btn-icon', action.icon || '✓'), this.el('span', '', action.label));
            button.addEventListener('click', () => action.onClick && action.onClick());
            el.append(button);
        }
        this.modernRoot.append(el);
        this.plaqueEl = el;
        this.movePlaque(info.x || 0, info.y || 0);
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
        // How to enter the game: the ordinary party or one of the two test modes.
        const modes = this.el('div', 'fs-mode-grid');
        (info.modes || []).forEach(m => {
            const button = this.el('button', 'fs-mode' + (info.mode === m.id ? ' is-selected' : ''));
            button.type = 'button';
            const text = this.el('div', 'fs-mode-text');
            text.append(this.el('strong', 'fs-mode-title', m.title));
            text.append(this.el('span', 'fs-mode-note', m.text));
            button.append(this.el('span', 'fs-mode-icon', m.icon || '◆'), text);
            button.addEventListener('click', () => info.onMode && info.onMode(m.id));
            modes.append(button);
        });
        body.append(modes);
        if (info.mode === 'battle' && info.battle) body.append(this.renderBattleSetup(info.battle, info));
        if (info.mode !== 'game') {
            const start = this.el('button', 'fs-start-test');
            start.type = 'button';
            start.append(this.el('span', 'fs-start-icon', info.mode === 'battle' ? '⚔' : '▦'));
            start.append(this.el('span', '', info.mode === 'battle'
                ? 'Начать бой (' + info.battle.total + ' отр. · ' + info.battle.deck + ' карт)'
                : 'Открыть готовую карту'));
            start.addEventListener('click', () => info.onStart && info.onStart());
            body.append(start);
        }
        if (info.status) body.append(this.el('div', 'fs-lobby-error', info.status));
        const foot = this.el('div', 'fs-lobby-foot', info.mode === 'game'
            ? 'Игра начнётся автоматически, когда все участники выберут разные фракции. Отправьте код комнаты друзьям.'
            : 'Тест играется одним человеком: оба места за вами, интерфейс показывает, чей сейчас ход. Обновите страницу, чтобы вернуться к выбору режима.');
        body.append(foot);
        card.append(body); overlay.append(card); root.append(overlay);
    },

    // The battlefield of the test mode: the kind of the fight, the troops and
    // the cards of the deck. Everything is chosen here, before the fight.
    renderBattleSetup(battle, info) {
        const wrap = this.el('div', 'fs-battle');
        const head = this.el('div', 'fs-battle-head');
        head.append(this.el('span', 'fs-eyebrow', 'Поле боя'));
        const kinds = this.el('div', 'fs-battle-kinds');
        [['ground', '⌂ Наземный'], ['space', '✦ Космический']].forEach(([id, label]) => {
            const button = this.el('button', 'fs-kind' + (battle.kind === id ? ' is-selected' : ''), label);
            button.type = 'button';
            button.addEventListener('click', () => info.onBattle && info.onBattle({ kind: id }));
            kinds.append(button);
        });
        head.append(kinds);
        wrap.append(head);

        const unitRow = this.el('div', 'fs-battle-row');
        unitRow.append(this.el('span', 'fs-eyebrow', 'Ваши отряды'));
        unitRow.append(this.el('span', 'fs-battle-sum', battle.total + ' / 5 · нажмите, чтобы добавить'));
        wrap.append(unitRow);
        const units = this.el('div', 'fs-battle-units');
        (battle.units || []).forEach(u => {
            const button = this.el('button', 'fs-unit' + (u.count ? ' is-selected' : ''));
            button.type = 'button';
            button.title = u.name + ' · сила ' + u.combat;
            button.append(this.el('span', 'fs-unit-count', u.count ? u.count + '×' : '+'));
            const text = this.el('span', 'fs-unit-text');
            text.append(this.el('span', 'fs-unit-name', u.name));
            text.append(this.el('span', 'fs-unit-force', 'сила ' + u.combat));
            button.append(text);
            button.addEventListener('click', () => info.onBattle && info.onBattle({ toggleUnit: u.id }));
            units.append(button);
        });
        if (!(battle.units || []).length) units.append(this.el('div', 'fs-empty', 'У этой фракции нет подходящих отрядов.'));
        wrap.append(units);

        const cardsRow = this.el('div', 'fs-battle-row');
        cardsRow.append(this.el('span', 'fs-eyebrow', 'Карты в колоде'));
        cardsRow.append(this.el('span', 'fs-battle-sum', battle.deck + ' карт · по две копии'));
        wrap.append(cardsRow);
        const cards = this.el('div', 'fs-battle-cards');
        (battle.cards || []).forEach(c => {
            const button = this.el('button', 'fs-card-toggle' + (c.selected ? ' is-selected' : ''));
            button.type = 'button';
            const icons = c.icons || {};
            const line = this.el('span', 'fs-card-icons');
            line.append(this.el('span', 'is-att', '⚔ ' + (icons.att || 0)));
            line.append(this.el('span', 'is-def', '🛡 ' + (icons.def || 0)));
            line.append(this.el('span', 'is-morale', '✦ ' + (icons.morale || 0)));
            button.append(this.el('span', 'fs-card-name', c.name), line);
            button.addEventListener('click', () => info.onBattle && info.onBattle({ toggleCard: c.name }));
            cards.append(button);
        });
        wrap.append(cards);
        if (battle.foe) {
            wrap.append(this.el('div', 'fs-battle-note', 'Противник — ' + battle.foe.name
                + ': его отряды и колоду выбирает игра. Вы играете и за него тоже.'));
        }
        return wrap;
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
            if (a.enabled === false) continue;
            this.add('fsBtn', 'fsA' + y, 8, y, a.label, a.onClick, a.w || 234);
            y += 30;
        }
        // The hand of the moment (event cards, objective tokens) is part of the
        // same list for the simple HUD: the player sees one column of choices.
        for (const item of ctx.hand || []) {
            this.add('fsBtn', 'fsA' + y, 8, y, (item.count || 1) + '× ' + item.label, item.onClick, 234);
            y += 30;
        }
    },
};
