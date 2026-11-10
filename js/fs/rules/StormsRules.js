// FSRulesStorms.js — warp storms as borders of the grid: the legal moves of
// the refresh, the direction of the card and the state of the edge.

class StormsRules {
    /** @param {any} engine the rules facade (FSRules.js) */
    constructor(engine) {
        this.engine = engine;
    }

    allEdges(state) {
        return FS_WARP_STORMS.allEdges(state).map(edge => edge.toRef(state));
    }

    cmdMoveStorm(state, seat, cmd) {
        if (!GamePhase.of(state).is(GamePhase.REFRESH)) return { ok: false, error: 'Сейчас не фаза обновления.' };
        const phase = EventPhase.of(state);
        if (!phase.isSeat(seat)) return { ok: false, error: 'Сейчас ход другого игрока.' };
        // The event moves exactly one Warp Storm ("The active player chooses one
        // Warp Storm on the game board and moves it").
        if (phase.stormMoved) return { ok: false, error: 'Шторм в эту фазу уже сдвигался.' };
        // «движение варп-шторма по вновь раскрытой карте не производится»
        // («Инкарнация Тзинча»): the three cards are looked at, but their storm
        // icons are not a second movement of this event.
        if (!StormPhase.of(state).iconsMove) {
            return { ok: false, error: 'Движение варп-шторма по новой карте не производится.' };
        }
        const storm = state.storms.find(s => s.id === cmd.storm);
        if (!storm) return { ok: false, error: 'Нет такого шторма.' };
        // Each storm moves only once during a refresh phase, whoever moves it.
        if (storm.moved === true) return { ok: false, error: 'Этот шторм уже двигался в этой фазе.' };
        const dir = cmd.dir;
        // Only the moves the card really allows are offered: the direction, the
        // free edge and the limit of one move per storm are all checked here.
        const options = this.stormOptions(state, seat);
        if (!options.some(o => o.storm === storm.id && o.dir === dir)) {
            const card = phase.card || this.eventCard(state, phase);
            const allowed = card && card.storm && card.storm[0] !== 'any' ? card.storm : ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
            if (!allowed.includes(dir)) return { ok: false, error: 'Карта не разрешает такое направление.' };
            if (storm.moved === true) return { ok: false, error: 'Этот шторм уже двигался в этой фазе.' };
            return { ok: false, error: 'Шторм не может туда пойти.' };
        }
        const target = this.stormTarget(state, storm, dir);
        // «Молящийся тёмным богам»: another player may cancel THIS movement
        // and send the same storm in any of the eight legal directions instead.
        const storms = StormPhase.of(state);
        if (!storms.reacting) {
            const info = { storm: storm.id, dir, mover: seat, target };
            for (const other of state.players) {
                if (other.seat === seat) continue;
                if (!this.engine.schemesOf(state, other.seat).some(s => s.trigger === 'storm' && !s.defer)) continue;
                storms.offer(info);
                if (this.engine.maybeScheme(state, other.seat, 'storm',
                    { kind: 'event', ctx: { stormReaction: info } })) {
                    return { ok: true, pending: true };
                }
                storms.clearReaction();
            }
        }
        FS_WARP_STORMS.write(state, storm, target);
        storm.moved = true;
        // The card is not resolved before its storm has moved (the rules).
        EventPhase.of(state).markStormMoved();
        this.engine.log(state, seat, state.players[seat].name + ' сдвинул варп-шторм.');
        return { ok: true };
    }

    finishStormReaction(state, info, dir) {
        StormPhase.of(state).clearReaction();
        if (!info) return { ok: false };
        const storm = state.storms.find(s => s.id === info.storm);
        if (!storm || storm.moved === true) return { ok: false };
        const chosen = dir || info.dir;
        const target = this.stormTarget(state, storm, chosen);
        if (!target) return { ok: false };
        FS_WARP_STORMS.write(state, storm, target);
        storm.moved = true;
        EventPhase.of(state).markStormMoved();
        if (dir) {
            this.engine.log(state, info.mover, 'Перемещение варп-шторма отменено; он уходит в направлении ' + dir + '.');
        }
        return { ok: true, canceled: !!dir };
    }

    stormEdge(state, ref) {
        const edge = FS_WARP_STORMS.edgeOf(state, ref);
        return edge ? edge.toJSON() : null;
    }

    edgeRef(state, edge) {
        const found = FS_WARP_STORMS.edgeOf(state, edge);
        return found ? found.toRef(state) : null;
    }

    gridKey(edge) {
        return FS_WARP_STORMS.keyOf(edge);
    }

    edgeKey(state, ref) {
        return FS_WARP_STORMS.keyOfRef(state, ref);
    }

    /** The card of the event as the catalogue knows it: chosen, or opened by name. */
    eventCard(state, phase) {
        const event = phase || EventPhase.of(state);
        if (event.card) return event.card;
        const name = event.top;
        if (!name) return null;
        const seat = event.seat;
        const p = seat === null ? null : state.players[seat];
        return FS_CATALOG.cards('events')
            .find(e => e.name === name && (!p || e.faction === p.faction)) || null;
    }

    stormOptions(state, seat) {
        // The revealed top card (the no-tokens path) restricts the storm the same
        // way a chosen card does — both are known by the same question.
        const card = this.eventCard(state);
        // "Any" is any of the eight directions of the compass; a card that
        // prints an arrow allows only the directions it shows.
        const all = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
        const dirs = card && card.storm && card.storm[0] !== 'any' ? card.storm : all;
        return FS_WARP_STORMS.options(state, dirs);
    }

    stormTarget(state, storm, dir) {
        return FS_WARP_STORMS.target(state, storm, dir);
    }

}
