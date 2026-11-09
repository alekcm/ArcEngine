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
        if (state.phase !== 'planning') return false;
        const p = state.players[seat];
        if (!p) return false;
        if ((p.placedTokens || 0) >= this.engine.ORDER_TOKENS + (p.extraOrderTokens || 0)) return false;
        // The rule of the planning: the token goes into a system with the troops of
        // the player or into a system next to one of his systems.
        if (this.hasUnitsOrStructures(state, seat, sys.id)) return true;
        return this.engine.neighbors(state, sys.id).some(id => this.hasUnitsOrStructures(state, seat, id));
    }

    hasUnitsOrStructures(state, seat, systemId) {
        return this.engine.board(state).hasUnitsOrStructures(seat, systemId);
    }

    orderLeft(state, seat, kind) {
        const p = state.players[seat];
        if (!p) return 0;
        const used = p.placedOf ? (p.placedOf[kind] || 0) : 0;
        return Math.max(0, this.engine.ORDER_SUPPLY - used);
    }

    cmdPlaceOrder(state, seat, cmd) {
        if (state.phase !== 'planning') return { ok: false, error: 'Сейчас не фаза планирования.' };
        if (seat !== state.turn) return { ok: false, error: 'Сейчас очередь другого игрока.' };
        const p = state.players[seat];
        const limit = this.engine.ORDER_TOKENS + (p.extraOrderTokens || 0);
        if ((p.placedTokens || 0) >= limit) return { ok: false, error: 'Все приказы уже выложены.' };
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
        this.engine.log(state, seat, p.name + ' выложил приказ «' + this.orderName(cmd.order) + '» в систему ' + sys.tile + '.');
        // The players lay their tokens one at a time, in a circle.
        this.checkPlanningDone(state);
        if (state.phase === 'planning') state.turn = this.nextPlanner(state, seat);
        return { ok: true };
    }

    nextPlanner(state, from) {
        const n = state.players.length;
        for (let i = 1; i <= n; i++) {
            const seat = (from + i) % n;
            const p = state.players[seat];
            if (!p || p.eliminated) continue;
            const limit = this.engine.ORDER_TOKENS + (p.extraOrderTokens || 0);
            if ((p.placedTokens || 0) < limit) return seat;
        }
        return from;
    }

    orderName(order) {
        return { advance: 'наступление', deploy: 'развёртывание', strategize: 'стратегия', dominate: 'доминирование' }[order] || order;
    }

    checkPlanningDone(state) {
        // A player who has lost every unit and structure no longer resolves any
        // phase of the game (the rules, "Eliminating a Player"): his shed tokens
        // do not hold the planning back.
        const done = state.players.every(p => p.eliminated
            || (p.placedTokens || 0) >= this.engine.ORDER_TOKENS + (p.extraOrderTokens || 0));
        if (!done) return;
        state.phase = 'operations';
        // The operations start with the first player who really has an order on
        // top of a stack — the tokens of the players lie in one stack.
        state.turn = this.engine.firstWithOrder(state);
        // The schemes of the start of the operations phase.
        this.engine.maybeScheme(state, state.turn, 'operations', { kind: 'order', ctx: null });
        this.engine.log(state, -1, 'Фаза операций: приказы вскрываются по очереди.');
    }

    availableOrders(state, seat) {
        const out = [];
        for (const sys of state.systems) {
            for (let i = 0; i < sys.tokens.length; i++) {
                const tok = sys.tokens[i];
                if (tok.seat !== seat) continue;
                const top = sys.tokens[sys.tokens.length - 1];
                if (top !== tok) continue;      // only the top of a stack
                out.push({ system: sys.id, index: i });
            }
        }
        return out;
    }

}
