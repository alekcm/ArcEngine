// FSRulesPlanning.js — the planning phase: four order tokens per player, one
// at a time, anywhere on the board a player may reach.

class PlanningRules {
    /** @param {any} engine the rules facade (FSRules.js) */
    constructor(engine) {
        this.engine = engine;
    }

    canPlaceOrder(state, seat, systemId) {
        const sys = this.engine.system(state, systemId);
        if (!sys) return false;
        if (!GamePhase.of(state).is(GamePhase.PLANNING)) return false;
        const p = state.players[seat];
        if (!p) return false;
        if (this.engine.player(state, seat).ordersLeft() <= 0) return false;
        return this.orderPlacementSystem(state, seat, sys.id);
    }

    /** The geographic rule also applies when an already-placed token is moved. */
    orderPlacementSystem(state, seat, systemId) {
        if (!state.players[seat] || !this.engine.system(state, systemId)) return false;
        if (this.hasUnitsOrStructures(state, seat, systemId)) return true;
        return this.engine.neighbors(state, systemId).some(id => this.hasUnitsOrStructures(state, seat, id));
    }

    /** Destinations for the top token of a stack, not a new token from the hand. */
    orderMoveTargets(state, seat, sourceId) {
        if (!GamePhase.of(state).is(GamePhase.PLANNING)) return [];
        const source = this.engine.system(state, sourceId);
        const top = source && this.engine.board(state).topOrder(sourceId);
        if (!top || top.seat !== seat) return [];
        return this.engine.neighbors(state, sourceId)
            .filter(id => this.orderPlacementSystem(state, seat, id));
    }

    orderMoveSources(state, seat) {
        return state.systems.filter(sys => this.orderMoveTargets(state, seat, sys.id).length)
            .map(sys => sys.id);
    }

    hasUnitsOrStructures(state, seat, systemId) {
        return this.engine.board(state).hasUnitsOrStructures(seat, systemId);
    }

    /** Orders the player may still lay this round. */
    ordersLeft(state, seat) {
        if (!state.players[seat]) return 0;
        return this.engine.player(state, seat).ordersLeft();
    }

    /** How many tokens of one order kind are still in the player's hand. */
    orderLeft(state, seat, kind) {
        if (!state.players[seat]) return 0;
        return this.engine.player(state, seat).orderKindLeft(kind);
    }

    cmdPlaceOrder(state, seat, cmd) {
        if (!GamePhase.of(state).is(GamePhase.PLANNING)) return { ok: false, error: 'Сейчас не фаза планирования.' };
        if (!GamePhase.of(state).isTurn(seat)) return { ok: false, error: 'Сейчас очередь другого игрока.' };
        const p = state.players[seat];
        if (this.engine.player(state, seat).ordersLeft() <= 0) return { ok: false, error: 'Все приказы уже выложены.' };
        const sys = this.engine.system(state, cmd.system);
        if (!sys) return { ok: false, error: 'Нет такой системы.' };
        if (!this.canPlaceOrder(state, seat, sys.id)) {
            // Rules Reference, Planning Phase: «A player must place his order token
            // in either a system containing one of his units or structures, or a
            // system adjacent to a system containing one of his units or
            // structures.» — отказ объясняет это же.
            return {
                ok: false,
                error: 'Приказ кладётся только в систему со своими отрядами или постройками '
                    + 'либо в соседнюю с такой системой.',
            };
        }
        const types = ['advance', 'deploy', 'strategize', 'dominate'];
        if (!types.includes(cmd.order)) return { ok: false, error: 'Неизвестный приказ.' };
        if (this.orderLeft(state, seat, cmd.order) <= 0) {
            return { ok: false, error: 'Жетоны этого приказа кончились: их по два.' };
        }
        // The face of the token stays hidden: only the faction is seen until the
        // token is turned over.
        sys.tokens.push({ seat, order: cmd.order, faceUp: false });
        p.placedTokens = (p.placedTokens || 0) + 1;
        p.placedOf = p.placedOf || {};
        p.placedOf[cmd.order] = (p.placedOf[cmd.order] || 0) + 1;
        // A facedown order's type is not public, including in the game log.
        this.engine.log(state, seat, p.name + ' выложил закрытый приказ в систему ' + sys.tile + '.');
        // The players lay their tokens one at a time, in a circle.
        this.checkPlanningDone(state);
        if (GamePhase.of(state).is(GamePhase.PLANNING)) GamePhase.of(state).turn = this.nextPlanner(state, seat);
        return { ok: true };
    }

    nextPlanner(state, from) {
        const n = state.players.length;
        for (let i = 1; i <= n; i++) {
            const seat = (from + i) % n;
            const p = state.players[seat];
            if (!p || p.eliminated) continue;
            if (this.engine.player(state, seat).ordersLeft() <= 0) continue;
            // «Вместо размещения жетона приказа … вы можете сбросить эту
            // карту» («Видения Комморры»): the player lets his turn go by
            // once; his tokens wait for the next time the circle reaches him.
            if (p.planningPass) {
                p.planningPass = false;
                this.engine.log(state, seat, p.name + ' пропускает размещение жетона приказа.');
                continue;
            }
            return seat;
        }
        return from;
    }

    orderName(order) {
        return fsOrderName(order, false);
    }

    checkPlanningDone(state) {
        // A player who has lost every unit and structure no longer resolves any
        // phase of the game (the rules, "Eliminating a Player"): his shed tokens
        // do not hold the planning back.
        const done = state.players.every(p => p.eliminated
            || this.engine.player(state, p.seat).ordersLeft() <= 0);
        if (!done) return;
        this.offerEndPlanningSchemes(state, 0);
    }

    /** End-of-planning plans resolve in turn order before the first order opens. */
    offerEndPlanningSchemes(state, index) {
        const game = GamePhase.of(state);
        const circle = game.circle();
        for (let i = index || 0; i < circle.length; i++) {
            const seat = circle[i];
            if (state.players[seat].eliminated) continue;
            if (this.engine.maybeScheme(state, seat, 'planning-end', {
                kind: 'event', ctx: { resumeEndPlanningSchemes: i + 1 },
            })) return;
        }
        game.start(GamePhase.OPERATIONS);
        // Walk from the first player, including a forced skip before the first
        // available order. A skipped player's scheme must resolve first.
        const before = (game.firstPlayer - 1 + state.players.length) % state.players.length;
        this.engine.nextTurn(state, { from: before, remaining: state.players.length, opening: true });
        this.engine.log(state, -1, 'Фаза операций: приказы вскрываются по очереди.');
    }

    /** The tokens of the seat that lie on top of their piles: only those resolve. */
    availableOrders(state, seat) {
        const out = [];
        const board = this.engine.board(state);
        for (const sys of state.systems) {
            const top = board.topOrder(sys.id);
            if (!top || top.seat !== seat) continue;
            out.push({ system: sys.id, index: sys.tokens.length - 1 });
        }
        return out;
    }
}
