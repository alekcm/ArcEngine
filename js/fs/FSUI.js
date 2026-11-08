// FSUI.js — the interface of Forbidden Stars.
//
// Every element of the interface is a record in UILayout.js (the editor's UI
// tab); the code here only fills them with data and reacts to the clicks.
// The dynamic lists (the buttons of the current action, the rows of the lobby)
// are copies of the template records 'fsBtn' and 'fsRow'.

// Copy text to the clipboard. navigator.clipboard only exists in a secure
// context (HTTPS / localhost); a game on a LAN is plain HTTP, so a hidden
// textarea and execCommand are used there. Resolves to whether the copy worked.
function fsCopyText(text) {
    if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text).then(() => true, () => fsCopyTextFallback(text));
    }
    return Promise.resolve(fsCopyTextFallback(text));
}

function fsCopyTextFallback(text) {
    try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.top = '0';
        ta.style.left = '0';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        let ok = false;
        try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
        ta.remove();
        return ok;
    } catch (e) { return false; }
}

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
        // Tiny DOM stubs used by the headless runs skip the visual shell.
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
        // Alt held: the battle hand zooms in even more (the hovered card most of all).
        window.addEventListener('keydown', e => {
            if (e.key === 'Alt') { e.preventDefault(); this.setAltZoom(true); }
        });
        window.addEventListener('keyup', e => {
            if (e.key === 'Alt') this.setAltZoom(false);
        });
        window.addEventListener('blur', () => {
            this.setAltZoom(false);
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

    // Alt is held or not: the class is toggled on the hand that is already on
    // the screen, and remembered for the next render.
    altZoom: false,
    setAltZoom(on) {
        if (this.altZoom === !!on) return;
        this.altZoom = !!on;
        const bar = this.modernRoot && this.modernRoot.querySelector
            ? this.modernRoot.querySelector('.fs-battle-hand') : null;
        if (bar && bar.classList) bar.classList.toggle('is-alt', this.altZoom);
    },

    // An icon of the game: a shape drawn by FSIcons, never a character of a font.
    // A name that is not a shape stays a letter of the interface ('?' or a digit).
    iconEl(name, cls) {
        const node = this.el('span', 'fs-ico' + (cls ? ' ' + cls : ''));
        if (!name) return node;
        const known = typeof FSIcons !== 'undefined' && FSIcons.shape(name);
        if (known) {
            node.className = 'fs-ico fs-ico-svg' + (cls ? ' ' + cls : '');
            node.style.backgroundImage = FSIcons.url(name);
            node.setAttribute('data-icon', name);
            return node;
        }
        node.textContent = String(name);
        return node;
    },

    // The text of a card, with its real italics, its real bold and its cubes drawn as
    // cubes: no asterisks, no underscores and no words for a symbol.
    richText(text, cls) {
        const box = this.el('div', 'fs-rich' + (cls ? ' ' + cls : ''));
        if (typeof FSIcons === 'undefined') { box.textContent = String(text || ''); return box; }
        const blocks = FSIcons.runs(text || '');
        blocks.forEach((block, i) => {
            if (i) box.append(this.el('br'));
            for (const run of block) {
                if (run.t === 'icon') { box.append(this.iconEl(FSIcons.fromCardWord(run.name) || 'cube.any', 'fs-rich-ico')); continue; }
                const span = this.el('span', run.bold ? 'fs-rich-bold' : run.italic ? 'fs-rich-italic' : '');
                span.textContent = run.v;
                box.append(span);
            }
        });
        return box;
    },

    // The board furniture the player may put away: the participants
    // and the window with the order tokens of the hand.
    panelState() {
        if (!this.panels) this.panels = { players: true, orders: false, topbar: true, battlePanel: 'third' };
        return this.panels;
    },

    // The window of the order tokens: what is still in the hand, what lies on the
    // board and where. A list, not a corner of the right column.
    renderOrdersPop(state) {
        const pop = this.el('section', 'fs-orders-pop');
        const head = this.el('div', 'fs-orders-head');
        head.append(this.el('span', 'fs-eyebrow', 'Жетоны приказов · ' + (state.players[state.seat] ? state.players[state.seat].name : '')));
        const close = this.el('button', 'fs-pop-close');
        close.type = 'button';
        close.title = 'Закрыть';
        close.append(this.iconEl('ui.close'));
        close.addEventListener('click', () => { this.panelState().orders = false; this.update(state, this.lastCtx); });
        head.append(close);
        pop.append(head);
        const me = state.seat;
        const p = state.players[me] || {};
        const kinds = [
            ['advance', 'Наступление'], ['deploy', 'Развёртывание'],
            ['strategize', 'Стратегия'], ['dominate', 'Доминирование'],
        ];
        const laid = { advance: 0, deploy: 0, strategize: 0, dominate: 0 };
        const rows = [];
        for (const sys of state.systems) {
            for (const tok of sys.tokens) {
                if (tok.seat !== me) continue;
                laid[tok.order] = (laid[tok.order] || 0) + 1;
                rows.push({ tile: sys.tile, order: tok.order, faceUp: !!tok.faceUp });
            }
        }
        // The hand of the player: one icon per order kind and the number of the
        // tokens that are still there. Two of every kind, never four of one.
        const per = typeof FS_RULES === 'undefined' ? 2 : FS_RULES.ORDER_SUPPLY;
        const hand = this.el('div', 'fs-orders-hand');
        for (const [id, label] of kinds) {
            const left = Math.max(0, per - (laid[id] || 0));
            const chip = this.el('span', 'fs-orders-chip' + (left ? '' : ' is-empty'));
            chip.append(this.iconEl('order.' + id, 'fs-orders-icon'));
            chip.append(this.el('b', 'fs-orders-count', String(left)));
            chip.title = label + ' · осталось ' + left + ' из ' + per;
            hand.append(chip);
        }
        pop.append(hand);
        // What already lies on the board: the same icons, small, one per token.
        const list = this.el('div', 'fs-orders-list');
        if (!rows.length) list.append(this.el('div', 'fs-empty', 'На доске пока ничего.'));
        for (const row of rows) {
            const line = this.el('span', 'fs-orders-placed' + (row.faceUp ? ' is-open' : ''));
            line.append(this.iconEl('order.' + row.order, 'fs-orders-placed-icon'));
            line.title = row.tile + ' · ' + this.orderLabel(row.order) + (row.faceUp ? ' · открыт' : ' · закрыт');
            list.append(line);
        }
        pop.append(list);
        return pop;
    },

    orderLabel(order) {
        return ({ advance: 'Наступление', deploy: 'Развёртывание', strategize: 'Стратегия', dominate: 'Доминирование' })[order] || order;
    },

    /** @type {((item: any) => void) | null} */
    onHandPlay: null,

    // The undo of the last command, wired by FSGame — it is the server
    // that owns the history; the button just asks it to take one step back.
    /** @type {(() => void) | null} */
    onUndo: null,

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
        // A fight is its own screen: the rails of the board stand aside while the
        // battle in the contested sector is played.
        root.classList.toggle('is-battle', !!(state && state.combat));
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
        // The plaque with the round counter folds away: only the toggle stays.
        const topbarBtn = this.el('button', 'fs-topbar-toggle' + (this.panelState().topbar ? '' : ' is-off'));
        topbarBtn.type = 'button';
        topbarBtn.title = this.panelState().topbar ? 'Скрыть плашку' : 'Показать плашку';
        topbarBtn.append(this.iconEl('ui.up'));
        topbarBtn.addEventListener('click', () => {
            const ps = this.panelState();
            ps.topbar = !ps.topbar;
            this.update(state, ctx);
        });
        header.append(topbarBtn);
        root.classList.toggle('is-topbar-off', !this.panelState().topbar);
        root.append(header);

        // The top-right toolbar is gone. Only the fullscreen button survives,
        // moved to the very top-left corner together with the rail switches.
        const corner = this.el('div', 'fs-corner-left');
        const full = this.el('button', 'fs-icon-btn'); full.title = 'Во весь экран';
        full.append(this.iconEl('ui.full'));
        full.addEventListener('click', () => { if (!document.fullscreenElement) document.documentElement.requestFullscreen?.(); else document.exitFullscreen?.(); });
        corner.append(full);

        // «Отменить ход»: every player can take back the last command, whoever
        // made it — the server keeps the history and decides what a step is.
        if (state) {
            const undo = this.el('button', 'fs-undo-btn'); undo.type = 'button';
            undo.title = 'Отменить последний ход — любого игрока';
            undo.append(this.iconEl('ui.undo', 'fs-undo-ico'), this.el('span', '', 'Отменить ход'));
            const canUndo = Number(state.undo) > 0;
            if (!canUndo) { undo.disabled = true; undo.classList.add('is-disabled'); }
            undo.addEventListener('click', () => {
                undo.disabled = true; undo.classList.add('is-disabled');
                if (this.onUndo) this.onUndo();
            });
            corner.append(undo);
        }

        // The card of the left rail hides and comes back by this button.
        const switches = this.el('div', 'fs-panel-switches');
        for (const [key, icon, title] of [['players', 'mark.ground', 'Участники']]) {
            const on = this.panelState()[key];
            const button = this.el('button', 'fs-panel-switch' + (on ? ' is-on' : ''));
            button.append(this.iconEl(icon));
            button.type = 'button';
            button.title = (on ? 'Скрыть: ' : 'Показать: ') + title;
            button.addEventListener('click', () => {
                const ps = this.panelState();
                ps[key] = !ps[key];
                this.update(state, ctx);
            });
            switches.append(button);
        }
        corner.append(switches);
        root.append(corner);
        if (state && this.panelState().orders) root.append(this.renderOrdersPop(state));
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
        let playersCard = this.el('section', 'fs-card');
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
            const stats = this.el('div', 'fs-player-stats');
            for (const [icon, count] of [['mark.objective', p.objectives || 0], ['asset.materiel', p.materiel || 0]]) {
                const stat = this.el('span');
                stat.append(this.iconEl(icon), this.el('b', '', String(count)));
                stats.append(stat);
            }
            row.append(stats);
            const assets = p.assets || {};
            const reserves = Object.values((p.supply && p.supply.units) || {}).reduce((sum, count) => sum + (Number(count) || 0), 0);
            const resourceLine = this.el('div', 'fs-player-assets');
            [['asset.forge', assets.forge, 'Кузницы'], ['asset.cache', assets.cache, 'Запасы'], ['order.event', assets.reinforcement, 'Подкрепления'], ['asset.prosperity', assets.prosperity, 'Процветание'], ['mark.ground', reserves, 'Отряды в запасе']].forEach(([icon, count, title]) => {
                const chip = this.el('span', 'fs-asset-chip');
                chip.append(this.iconEl(icon), this.el('b', '', String(count || 0)));
                chip.title = title;
                resourceLine.append(chip);
            });
            row.append(resourceLine);
            list.append(row);
        });
        playersCard.append(list);
        if (this.panelState().players) rail.append(playersCard); else playersCard = null;
        root.append(rail);

        // The right panel does one thing at a time: what is going on, the tokens the
        // player owns (counted, zeros included), the choice of the moment and a
        // single button to go on. Everything else happens on the board itself.
        const panel = this.el('section', 'fs-main-panel');
        const head = this.el('div', 'fs-panel-heading'); head.append(this.el('div', 'fs-eyebrow', state.over ? 'Итоги сражения' : 'Текущий этап'));
        head.append(this.el('h2', '', ctx.title || 'Галактическая кампания'));
        panel.append(head);
        if (ctx.status) panel.append(this.el('div', 'fs-status', ctx.status));
        // No system is written in this panel: what a sector is made of is shown by
        // the plaque over the board itself. The panel belongs to the action.
        // The score of the battle is NOT here: it is its own panel at the top
        // left of the screen, so the damage choice always fits.
        this.renderState = state; this.renderCtx = ctx;
        const battle = this.renderBattle(ctx.battle);
        if (battle) root.append(battle);
        // When the battle panel is hidden, a small tab at the bottom-left brings it back.
        if (ctx.battle && this.panelState().battlePanel === 'hidden') {
            const rb = this.el('button', 'fs-battle-restore'); rb.type = 'button';
            rb.title = 'Показать панель боя';
            rb.append(this.iconEl('cube.att'));
            rb.addEventListener('click', () => {
                this.panelState().battlePanel = 'third';
                this.update(this.renderState, this.renderCtx);
            });
            root.append(rb);
        }
        const tokens = this.renderTokens(ctx.tokens);
        if (tokens) panel.append(tokens);
        const hand = this.renderHand(ctx.hand, ctx.handTitle);
        if (hand) panel.append(hand);
        const selection = this.renderSelection(ctx.selection);
        if (selection) panel.append(selection);
        const actions = this.el('div', 'fs-actions');
        const items = (ctx.actions || []).filter(a => a.enabled !== false || a.kind === 'primary' || a.kind === 'secondary');
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
                if (a.icon) button.append(this.iconEl(a.icon, 'fs-pick-icon'));
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
            if (a.icon) button.append(this.iconEl(a.icon, 'fs-chip-icon'));
            button.append(this.el('span', 'fs-chip-label', a.label));
            if (a.count != null) button.append(this.el('span', 'fs-chip-count', typeof a.count === 'number' ? a.count + '×' : a.count));
            button.addEventListener('click', () => a.onClick && a.onClick());
            actions.append(button);
        }
        if (!items.length && state.over) actions.append(this.el('div', 'fs-empty', 'Партия завершена.'));
        panel.append(actions);
        for (const a of primaries) {
            const button = this.el('button', 'fs-primary'); button.type = 'button';
            button.append(this.iconEl(a.icon || 'ui.next', 'fs-primary-icon'), this.el('span', '', a.label));
            if (a.enabled === false) { button.disabled = true; button.classList.add('is-disabled'); }
            button.addEventListener('click', () => { if (a.enabled !== false && a.onClick) a.onClick(); });
            panel.append(button);
        }
        for (const a of secondaries) {
            const button = this.el('button', 'fs-secondary'); button.type = 'button';
            button.textContent = a.label;
            button.addEventListener('click', () => a.onClick && a.onClick());
            panel.append(button);
        }
        root.append(panel);
        // The combat hand lies at the bottom of the screen, as a hand of cards.
        const battleHand = this.renderBattleHand(ctx.battleHand);
        if (battleHand) root.append(battleHand);
        actions.scrollTop = scrollTop;
        if (ctx.warn) root.append(this.el('div', 'fs-toast', ctx.warn));
        else if (ctx.status && this.statusError(ctx.status)) root.append(this.el('div', 'fs-toast', ctx.status));
        this.renderPlaque();
    },

    // The score of the battle: the two sides, their dice, their cubes and the
    // cards they have played. There is no word about the place of the fight —
    // the fight is on the board, and the panel has nothing to say about it.
    renderBattle(battle) {
        if (!battle) return null;
        const ps = this.panelState();
        const mode = ps.battlePanel || 'third';
        const card = this.el('section', 'fs-battle fs-battle-panel'
            + (mode === 'full' ? ' is-full' : '') + (mode === 'hidden' ? ' is-hidden' : ''));
        const head = this.el('div', 'fs-battle-head');
        head.append(this.el('span', 'fs-eyebrow', 'Бой'));
        head.append(this.el('span', 'fs-battle-round', 'раунд ' + battle.round + '/' + battle.maxRounds));
        // Expand the panel bigger / hide it back.
        const ctls = this.el('span', 'fs-battle-ctls');
        const expand = this.el('button', 'fs-battle-ctl'); expand.type = 'button';
        expand.title = mode === 'full' ? 'Свернуть панель боя' : 'Развернуть панель боя';
        expand.append(this.iconEl('ui.full'));
        expand.addEventListener('click', () => {
            this.panelState().battlePanel = mode === 'full' ? 'third' : 'full';
            this.update(this.renderState, this.renderCtx);
        });
        const hide = this.el('button', 'fs-battle-ctl'); hide.type = 'button';
        hide.title = 'Скрыть панель боя';
        hide.append(this.iconEl('ui.close'));
        hide.addEventListener('click', () => {
            this.panelState().battlePanel = 'hidden';
            this.update(this.renderState, this.renderCtx);
        });
        ctls.append(expand, hide);
        head.append(ctls);
        card.append(head);
        // Left is me, right is the enemy — not top and bottom.
        const sides = this.el('div', 'fs-battle-sides');
        const ordered = [...(battle.sides || [])].sort((a, b) => (b.mine ? 1 : 0) - (a.mine ? 1 : 0));
        for (const side of ordered) {
            const row = this.el('div', 'fs-battle-side' + (side.mine ? ' is-mine' : ''));
            if (row.style) row.style.setProperty('--battle-color', side.color || '#8899aa');
            const who = this.el('div', 'fs-battle-who');
            who.append(this.el('i', 'fs-battle-dot'));
            who.append(this.el('span', 'fs-battle-name', side.name));
            who.append(this.el('span', 'fs-battle-role', side.side === 'attacker' ? 'атакует' : 'держит'));
            row.append(who);
            // Three lines of the score, as in the rules: attack, defence,
            // morale — every line is a sum of the dice, the tokens and the
            // faceup cards: ⚔ 2 + ▣ 3 + □ 0.
            const lines = this.el('div', 'fs-battle-lines');
            const parts = side.parts || {};
            for (const kind of ['att', 'def', 'morale']) {
                const p = parts[kind] || { dice: 0, tokens: 0, cards: 0, total: 0 };
                const line = this.el('div', 'fs-battle-line is-' + kind);
                const sum = this.el('span', 'fs-battle-line-sum');
                const part = (icon, n, title) => {
                    const s = this.el('span', 'fs-battle-part');
                    s.append(this.iconEl(icon), this.el('b', '', String(n)));
                    s.title = title;
                    return s;
                };
                sum.append(
                    part('die.' + kind, p.dice, 'С кубиков'),
                    this.el('span', 'fs-battle-plus', '+'),
                    part('token.' + kind, p.tokens, 'С жетонов'),
                    this.el('span', 'fs-battle-plus', '+'),
                    part('ui.card', p.cards, 'С карт'),
                );
                line.append(this.iconEl('cube.' + kind, 'fs-battle-line-icon'), sum,
                    this.el('b', 'fs-battle-line-total', String(p.total)));
                lines.append(line);
            }
            row.append(lines);
            // The totals of the side.
            const totals = this.el('div', 'fs-battle-totals');
            const values = side.values || { att: 0, def: 0, morale: 0 };
            for (const [kind, value] of [['att', values.att], ['def', values.def], ['morale', values.morale]]) {
                const total = this.el('span', 'fs-battle-total is-' + kind);
                total.append(this.iconEl('cube.' + kind), this.el('b', '', String(value)));
                totals.append(total);
            }
            row.append(totals);
            // Who hurts whom at the current values: the damage this side
            // deals to its opponent, and the damage it suffers itself.
            const deal = this.el('div', 'fs-battle-deal');
            deal.append(this.iconEl('mark.damage', 'fs-battle-deal-icon'));
            deal.append(this.el('span', '', 'сопернику '));
            deal.append(this.el('b', '', String(side.deals || 0)));
            deal.append(this.el('span', 'fs-battle-deal-take', 'получит ' + String(side.takes || 0)));
            row.append(deal);
            sides.append(row);
        }
        card.append(sides);
        // The damage of the moment: the pieces that take it are picked on the board.
        if (battle.damage) {
            const dmg = this.el('div', 'fs-battle-damage');
            const line = this.el('div', 'fs-battle-damage-line');
            line.append(this.iconEl('mark.damage', 'fs-battle-damage-icon'));
            line.append(this.el('b', '', String(battle.damage.total)));
            if (battle.damage.total) {
                line.append(this.el('span', 'fs-battle-left' + (battle.damage.left ? ' is-open' : ''), 'осталось ' + battle.damage.left));
            }
            dmg.append(line);
            for (const row of battle.damage.rows || []) {
                const item = this.el('div', 'fs-battle-target'
                    + (row.destroyed ? ' is-dead' : row.demoralised ? ' is-routed' : row.selected ? ' is-picked' : ''));
                item.append(this.iconEl(row.kind === 'structure' ? 'mark.bastion' : 'mark.ground', 'fs-battle-target-icon'));
                item.append(this.el('span', 'fs-battle-target-name', row.name));
                item.append(this.el('span', 'fs-battle-target-health', String(row.health)));
                if (row.take) item.append(this.el('span', 'fs-battle-target-take', '−' + row.take));
                if (row.destroyed) item.append(this.el('span', 'fs-battle-target-state', 'уничтожен'));
                else if (row.demoralised) item.append(this.el('span', 'fs-battle-target-state', 'деморализован'));
                dmg.append(item);
            }
            card.append(dmg);
        }
        return card;
    },

    // The hand of the battle at the bottom of the screen: the cards themselves —
    // the name, the cubes and the rules, in real type, with no markup and no words
    // for the cubes. A click plays the card; a card is never skipped.
    renderBattleHand(hand) {
        if (!hand || !hand.length) return null;
        const bar = this.el('section', 'fs-battle-hand' + (this.altZoom ? ' is-alt' : ''));
        const cards = this.el('div', 'fs-battle-cards');
        for (const item of hand) {
            const card = this.el('button', 'fs-battle-card' + (item.playable ? ' is-playable' : ' is-closed'));
            card.type = 'button';
            const top = this.el('div', 'fs-battle-card-top');
            top.append(this.el('span', 'fs-battle-card-name', item.name));
            card.append(top);
            const icons = this.el('div', 'fs-card-icons');
            const faces = { att: 'cube.att', def: 'cube.def', morale: 'cube.morale' };
            let any = false;
            for (const kind of ['att', 'def', 'morale']) {
                const n = (item.icons && item.icons[kind]) || 0;
                if (!n) continue;
                any = true;
                const chip = this.el('span', 'fs-card-cube is-' + kind);
                chip.append(this.iconEl(faces[kind]));
                if (n > 1) chip.append(this.el('b', '', String(n)));
                icons.append(chip);
            }
            if (any) card.append(icons);
            if (item.runs && item.runs.length) {
                const body = this.el('div', 'fs-rich fs-battle-card-text');
                item.runs.forEach((block, i) => {
                    if (i) body.append(this.el('br'));
                    for (const run of block) {
                        if (run.t === 'icon') { body.append(this.iconEl(FSIcons.fromCardWord(run.name) || 'cube.any', 'fs-rich-ico')); continue; }
                        const span = this.el('span', run.bold ? 'fs-rich-bold' : run.italic ? 'fs-rich-italic' : '');
                        span.textContent = run.v;
                        body.append(span);
                    }
                });
                card.append(body);
            } else if (item.text) {
                card.append(this.richText(item.text, 'fs-battle-card-text'));
            }
            // no «Разыграть» label — the card itself is the button.
            else card.disabled = true;
            card.addEventListener('click', () => {
                if (!item.playable) return;
                if (this.onHandPlay) this.onHandPlay(item);
            });
            cards.append(card);
        }
        bar.append(cards);
        return bar;
    },

    // The owned tokens at a glance:     // The owned tokens at a glance: "2× Кузница", "0× Подкрепление" — the zeros
    // stay in the list so one look says what is missing.
    renderTokens(tokens) {
        if (!tokens || !tokens.length) return null;
        const card = this.el('section', 'fs-tokens');
        card.append(this.el('div', 'fs-eyebrow', 'Ваши жетоны'));
        const strip = this.el('div', 'fs-tokens-strip');
        for (const token of tokens) {
            const count = Number(token.count) || 0;
            const item = this.el('span', 'fs-token' + (count ? '' : ' is-zero'));
            item.title = token.label || '';
            item.append(this.iconEl(token.icon || 'cube.any', 'fs-token-ico'));
            item.append(this.el('b', 'fs-token-num', String(count)));
            strip.append(item);
        }
        card.append(strip);
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
            button.append(this.iconEl(item.icon || 'ui.card', 'fs-hand-icon'));
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
            button.append(this.iconEl(action.icon || 'ui.check', 'fs-plaque-btn-icon'), this.el('span', '', action.label));
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
                sector.append(this.iconEl('mark.world', 'fs-tile-planet'));
                const info = this.el('div', 'fs-tile-world-info');
                info.append(this.el('strong', '', world.name));
                info.append(this.el('span', 'fs-tile-stats', 'Материя ' + (world.materiel || 0) + ' · Вместимость ' + world.capacity));
                const assets = (world.assets || []).map(a => names[a] || a);
                if (world.objective) assets.push('Цель');
                info.append(this.el('span', 'fs-tile-assets', assets.length ? assets.join(' · ') : 'Без ресурса'));
                sector.append(info);
            } else {
                sector.append(this.iconEl('ui.storm', 'fs-tile-void-icon'), this.el('span', 'fs-tile-void', 'Пустота'), this.el('span', 'fs-tile-stats', 'Вместимость 3'));
            }
            grid.append(sector);
        }
        wrap.append(grid);
        return wrap;
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
        const copy = this.el('button', 'fs-copy-link');
        copy.append(this.iconEl('ui.card'), this.el('span', '', ' Скопировать ссылку для друзей'));
        copy.addEventListener('click', async () => {
            const link = info.link || location.href;
            if (await fsCopyText(link)) {
                const mark = this.el('span', '', ' Ссылка скопирована');
                copy.textContent = '';
                copy.append(this.iconEl('ui.check'), mark);
            } else {
                // The clipboard did not work (a plain-HTTP LAN page): show the link
                // right on the button so it can be copied by hand.
                copy.textContent = link;
            }
        });
        meta.append(copy); hero.append(meta); card.append(hero);
        const body = this.el('div', 'fs-lobby-body'); const top = this.el('div', 'fs-lobby-topline');
        top.append(this.el('h3', '', info.faction ? 'Ваша фракция выбрана' : 'Выберите фракцию'));
        const nameField = this.el('label', 'fs-name-field', 'Имя игрока'); const input = this.el('input'); input.maxLength = 24; input.value = info.name || ''; input.placeholder = 'Например, Командор';
        input.addEventListener('change', () => info.onName && info.onName(input.value.trim()));
        input.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur(); });
        nameField.append(input); top.append(nameField); body.append(top);
        const players = this.el('div', 'fs-lobby-players');
        (info.players || []).forEach(p => { const chip = this.el('div', 'fs-lobby-player'); chip.style.setProperty('--player-color', this.factionColor(p.faction)); chip.append(this.el('i', 'fs-player-dot'), this.el('span', '', p.name + (p.faction ? ' · ' + this.factionName(p.faction) : ' · выбирает фракцию'))); if (p.palette && p.palette.primary) { const sw = this.el('span', 'fs-pal-swatches'); for (const c of [p.palette.primary, p.palette.secondary1, p.palette.secondary2]) { const s = this.el('i'); s.style.background = c || '#888'; sw.append(s); } chip.append(sw); } players.append(chip); });
        body.append(players);
        const grid = this.el('div', 'fs-faction-grid');
        (info.factions || []).forEach((f, i) => {
            const taken = (info.players || []).some(p => p.faction === f.id && p.name !== info.name);
            const button = this.el('button', 'fs-faction' + (info.faction === f.id ? ' is-selected' : ''));
            button.type = 'button'; button.style.setProperty('--faction-color', f.color || this.factionColor(f.id));
            const crest = this.el('span', 'fs-faction-crest', (f.name || '·').slice(0, 1));
            const copyName = this.el('span', 'fs-faction-name', f.name || f.id); copyName.append(this.el('span', 'fs-faction-state', info.faction === f.id ? 'Выбрана вами' : (taken ? 'Уже занята' : 'Нажмите, чтобы выбрать')));
            button.append(crest, copyName); button.disabled = taken && info.faction !== f.id;
            if (button.disabled) button.style.opacity = '.4';
            button.addEventListener('click', () => info.onFaction && info.onFaction(f.id)); grid.append(button);
        });
        body.append(grid);
        // The army paint: the player picks one primary and two secondary colors;
        // they are spread over different parts of every model of his army.
        if (info.faction) {
            const cur = Object.assign(this.defaultPalette(info.faction), info.palette || {});
            const row = this.el('div', 'fs-palette-row');
            row.append(this.el('span', 'fs-palette-title', 'Раскраска армии'));
            const fields = [
                ['primary', 'Основной'],
                ['secondary1', 'Доп. 1'],
                ['secondary2', 'Доп. 2'],
            ];
            for (const [key, label] of fields) {
                const cell = this.el('label', 'fs-palette-field');
                const input = this.el('input');
                input.type = 'color';
                input.value = cur[key] || '#888888';
                input.title = label;
                input.addEventListener('change', () => {
                    if (!info.onPalette) return;
                    cur[key] = input.value;
                    info.onPalette({ primary: cur.primary, secondary1: cur.secondary1, secondary2: cur.secondary2 });
                });
                cell.append(input, this.el('span', '', label));
                row.append(cell);
            }
            body.append(row);
        }
        // How to enter the game: the ordinary party or one of the two test modes.
        const modes = this.el('div', 'fs-mode-grid');
        (info.modes || []).forEach(m => {
            const button = this.el('button', 'fs-mode' + (info.mode === m.id ? ' is-selected' : ''));
            button.type = 'button';
            const text = this.el('div', 'fs-mode-text');
            text.append(this.el('strong', 'fs-mode-title', m.title));
            text.append(this.el('span', 'fs-mode-note', m.text));
            button.append(this.iconEl(m.icon || 'ui.card', 'fs-mode-icon'), text);
            button.addEventListener('click', () => info.onMode && info.onMode(m.id));
            modes.append(button);
        });
        body.append(modes);
        if (info.mode === 'battle' && info.battle) body.append(this.renderBattleSetup(info.battle, info));
        if (info.mode !== 'game') {
            const start = this.el('button', 'fs-start-test');
            start.type = 'button';
            start.append(this.iconEl(info.mode === 'battle' ? 'mark.damage' : 'ui.card', 'fs-start-icon'));
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
        [['ground', 'mark.ground', 'Наземный'], ['space', 'mark.ship', 'Космический']].forEach(([id, icon, label]) => {
            const button = this.el('button', 'fs-kind' + (battle.kind === id ? ' is-selected' : ''));
            button.append(this.iconEl(icon), this.el('span', '', label));
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
            for (const [kind, icon] of [['att', 'cube.att'], ['def', 'cube.def'], ['morale', 'cube.morale']]) {
                const chip = this.el('span', 'fs-card-cube is-' + kind);
                chip.append(this.iconEl(icon), this.el('b', '', String(icons[kind] || 0)));
                line.append(chip);
            }
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

    shade(hex, amt) {
        const n = parseInt(String(hex || '').replace('#', ''), 16);
        if (!Number.isFinite(n)) return '#888888';
        const f = v => Math.max(0, Math.min(255, Math.round(v + amt * 2.55)));
        return '#' + (((f((n >> 16) & 255)) << 16) | ((f((n >> 8) & 255)) << 8) | f(n & 255)).toString(16).padStart(6, '0');
    },

    // The default army paint of a faction: the faction color plus two shades.
    defaultPalette(factionId) {
        const base = this.factionColor(factionId);
        return { primary: base, secondary1: this.shade(base, 48), secondary2: this.shade(base, -38) };
    },

    // -----------------------------------------------------------------------
    //  The state of the game
    // -----------------------------------------------------------------------
    update(state, ctx) {
        this.lastCtx = ctx;
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
        // The cards of the battle lie on the table and in the hand at the bottom —
        // the simple HUD offers them as the same list of choices.
        for (const item of ctx.battleHand || []) {
            if (!item.playable) continue;
            this.add('fsBtn', 'fsA' + y, 8, y, 'Карта: ' + item.name, () => {
                if (this.onHandPlay) this.onHandPlay(item);
            }, 234);
            y += 30;
        }
    },
};
