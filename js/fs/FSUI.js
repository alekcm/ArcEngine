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
        root.replaceChildren();
        root.classList.toggle('is-no-state', !state);
        if (this.currentLobby) { this.renderModernLobby(); return; }
        const header = this.el('div', 'fs-topbar');
        header.append(this.el('span', 'fs-brand', 'FORBIDDEN STARS'), this.el('i', 'fs-divider'));
        header.append(this.el('span', 'fs-phase', state ? ('Раунд ' + state.round + ' · ' + ({planning:'Планирование',operations:'Операции',refresh:'Обновление'}[state.phase] || state.phase)) : 'Галактическая война'));
        if (state && state.players[state.turn]) header.append(this.el('span', 'fs-room-pill', 'ХОД · ' + state.players[state.turn].name));
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
        const ph = this.el('div', 'fs-card-head'); ph.append(this.el('span', 'fs-eyebrow', 'Участники'), this.el('span', 'fs-round-chip', 'ЦЕЛЬ · ' + state.players.length)); playersCard.append(ph);
        const list = this.el('div', 'fs-player-list');
        state.players.forEach(p => {
            const row = this.el('div', 'fs-player' + (p.seat === state.seat ? ' is-me' : ''));
            row.style.setProperty('--player-color', p.color || this.factionColor(p.faction));
            row.append(this.el('i', 'fs-player-dot'));
            const name = this.el('div', 'fs-player-name', p.name); name.append(this.el('span', 'fs-player-faction', this.factionName(p.faction) + (p.seat === state.seat ? ' · вы' : '')));
            row.append(name);
            const stats = this.el('div', 'fs-player-stats'); stats.append(this.el('span', '', '✦ ' + (p.objectives || 0)), this.el('span', '', '◈ ' + (p.materiel || 0))); row.append(stats);
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
        const actions = this.el('div', 'fs-actions');
        const icons = ['✦','⬡','◈','⚔','⌖','⛨','✧','➤'];
        (ctx.actions || []).forEach((a, i) => {
            if (a.enabled === false) return;
            const button = this.el('button', 'fs-action'); button.type = 'button';
            const icon = this.el('span', 'fs-action-icon', icons[i % icons.length]);
            button.append(icon, this.el('span', 'fs-action-label', a.label), this.el('span', 'fs-action-arrow', '›'));
            button.addEventListener('click', () => a.onClick && a.onClick()); actions.append(button);
        });
        if (!(ctx.actions || []).length) actions.append(this.el('div', 'fs-empty', state.over ? 'Партия завершена.' : 'Сейчас нет доступных действий. Следите за ходом соперников.'));
        panel.append(actions); root.append(panel);
        const hint = this.el('div', 'fs-map-hint');
        hint.innerHTML = '<b>ДОСКА</b>　•　Перетаскивание — камера　•　Колесо — масштаб　•　Кольца — доступные действия'; root.append(hint);
        if (ctx.status && this.statusError(ctx.status)) root.append(this.el('div', 'fs-toast', ctx.status));
    },

    statusError(text) { return /ошиб|связи|нет связи|нельзя|не удалось/i.test(text || ''); },

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
            planning: 'планирование', operations: 'операции', refresh: 'обновление',
        }[state.phase] || state.phase;
        const who = state.players[state.turn] ? state.players[state.turn].name : '';
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
