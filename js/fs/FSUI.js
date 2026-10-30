// FSUI.js — the interface of Forbidden Stars.
//
// Every element of the interface is a record in UILayout.js (the editor's UI
// tab); the code here only fills them with data and reacts to the clicks.
// The dynamic lists (the buttons of the current action, the rows of the lobby)
// are copies of the template records 'fsBtn' and 'fsRow'.

/** @satisfies {Record<string, any>} */
const FSUI = {
    added: [],          // the ids of the runtime copies

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
    lobby(info, onFaction) {
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
