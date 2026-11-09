// FSRulesRefresh.js — the refresh phase: the objectives, the materiel, the
// rally of the routed units, the event cards and the end of the round.

class RefreshRules {
    /** @param {any} engine the rules facade (FSRules.js) */
    constructor(engine) {
        this.engine = engine;
    }

    objectiveWinners(state) {
        const needed = state.players.length;
        const alive = state.players.filter(p => !p.eliminated && p.objectives >= needed);
        if (!alive.length) return null;
        alive.sort((a, b) => (b.objectives - a.objectives)
            || (this.engine.friendlyWorlds(state, b.seat) - this.engine.friendlyWorlds(state, a.seat))
            || (this.engine.unitsOf(state, b.seat) - this.engine.unitsOf(state, a.seat)));
        const same = (a, b) => a.objectives === b.objectives
            && this.engine.friendlyWorlds(state, a.seat) === this.engine.friendlyWorlds(state, b.seat)
            && this.engine.unitsOf(state, a.seat) === this.engine.unitsOf(state, b.seat);
        const shared = alive.filter(p => same(p, alive[0]));
        return {
            winner: alive[0].seat,
            shared: shared.length > 1 ? shared.map(p => p.seat) : null,
        };
    }

    startRefresh(state) {
        state.phase = 'refresh';
        state.order = null;
        // A new round wipes the marks of the storms: every strip is bright again.
        for (const st of state.storms) st.moved = false;
        // 1. the objective tokens on friendly worlds
        // A collected token leaves the board: it lies on the faction sheet of its
        // owner and is never counted again (the rules, "Objective Tokens" —
        // "During step 1 of each Refresh Phase, each player collects each of his
        // faction's objective tokens that are on worlds he controls").
        const left = [];
        for (const obj of state.objectives) {
            const p = state.players.find(x => x.faction === obj.faction);
            const mine = p && this.engine.control(state, p.seat, obj.system, obj.area) === 'friendly';
            if (!mine) { left.push(obj); continue; }
            p.objectives += 1;
            this.engine.log(state, p.seat, p.name + ' забрал цель с мира ' + (this.engine.area(this.engine.system(state, obj.system), obj.area).world || {}).name + '.');
        }
        state.objectives = left;
        // «When a player has collected a number of his objective tokens equal to
        // or exceeding the number of players, the game ends and he wins the
        // game» — immediately at step 1; the materiel, the rally, the storms and
        // the event cards of this refresh never happen.
        const won = this.objectiveWinners(state);
        if (won) {
            state.over = true;
            state.winner = won.winner;
            if (won.shared) state.shared = won.shared;
            this.engine.log(state, -1, won.shared
                ? 'Игра закончена вничью: цели собраны.'
                : 'Игра закончена. Побеждает ' + state.players[won.winner].name + ': цели собраны.');
            return;
        }
        // 2. the materiel
        for (const p of state.players) {
            const income = this.engine.materielIncome(state, p.seat);
            if (income > 0) {
                p.materiel = Math.min(this.engine.MATERIEL_MAX, p.materiel + income);
                this.engine.log(state, p.seat, p.name + ' получил материи: ' + income + '.');
            }
        }
        // 3. rally the routed units
        for (const u of state.units) u.routed = false;
        // 4. the event cards and the warp storms
        state.turn = state.firstPlayer;
        state.eventsLeft = state.players.length;
        delete state.stormReaction;
        delete state.operationSchemeOffered;
        delete state.operationSchemeAccepted;
        delete state.chaosNoStormMove;
        this.engine.log(state, -1, 'Фаза обновления: события и варп-штормы.');
        this.nextEventPlayer(state);
    }

    nextEventPlayer(state) {
        // The suppression belongs to the one event whose three cards were
        // revealed, not to the next player's event.
        delete state.chaosNoStormMove;
        if (state.eventsLeft <= 0) {
            // The end of the event phase: the capacity of every area is checked
            // again, and every player chooses his own excess troops.
            for (const p of state.players) this.engine.trimPlayer(state, p.seat);
            this.endRound(state);
            return;
        }
        const seat = state.turn;
        const p = state.players[seat];
        const drawn = [];
        for (let i = 0; i < p.eventTokens; i++) drawn.push(this.drawEventCard(state, seat));
        state.event = { seat, drawn, chosen: null };
        p.eventTokens = 0;
        if (!drawn.length) {
            // No token on the deck: the top card is revealed for the storm only.
            const top = this.drawEventCard(state, seat);
            state.event.top = top;
        }
        // The next player plays the next event.
        state.turn = (state.turn + 1) % state.players.length;
    }

    drawEventCard(state, seat) {
        const p = state.players[seat];
        if (!p.decks.event.length) {
            // A new deck of the faction (the game does not run out of cards).
            p.decks.event = this.engine.shuffle(state, FS_CATALOG.eventCards(p.faction).map(e => e.name));
        }
        const name = p.decks.event.shift();
        return name;
    }

    cmdDrawEvent(state, seat, cmd) {
        if (state.phase !== 'refresh') return { ok: false, error: 'Сейчас не фаза обновления.' };
        if (!state.event || state.event.seat !== seat) return { ok: false, error: 'Сейчас ход другого игрока.' };
        if (state.event.chosen) return { ok: false, error: 'Карта уже выбрана.' };
        const name = cmd.card;
        if (!state.event.drawn.includes(name)) return { ok: false, error: 'Такой карты нет на руке.' };
        state.event.chosen = name;
        const card = FS_CATALOG.card('events', state.players[seat].faction, name);
        state.event.card = card;
        this.engine.log(state, seat, state.players[seat].name + ' выбрал карту события «' + name + '».');
        return { ok: true };
    }

    cmdResolveEvent(state, seat, cmd) {
        if (state.phase !== 'refresh') return { ok: false, error: 'Сейчас не фаза обновления.' };
        if (!state.event || state.event.seat !== seat) return { ok: false, error: 'Сейчас ход другого игрока.' };
        // The storm movement of the card is not a choice — only its ability is.
        // «A player can choose not to resolve the ability on his chosen event
        // card, but must resolve the card's Warp Storm movement icon.»
        const canMove = !state.chaosNoStormMove && this.engine.stormOptions(state, seat).length;
        if (canMove && !state.event.stormMoved) {
            return { ok: false, error: 'Сначала сдвиньте варп-шторм по иконке карты.' };
        }
        const card = state.event.card;
        // Without a card in the hand there is nothing to play: the player only
        // moves the storm and the refresh goes on.
        if (card && card.type === 'scheme') {
            // «… чтобы осталось не больше 2» (Tau plans): one old plan may
            // stay; the other factions discard every other plan.
            const p0 = state.players[seat];
            p0.schemes = /не больше 2/i.test(card.text || '')
                ? (p0.schemes || []).slice(0, 1) : [];
            const steps = FS_EFFECTS.parse(card.text || '', { kind: 'event', faction: p0.faction });
            const trig = steps.find(s => s.op === 'trigger');
            p0.schemes.push({
                name: card.name,
                text: card.text || '',
                trigger: trig ? trig.trigger : null,
                steps: trig ? trig.steps : [],
                note: trig ? !!trig.note : true,
                // A reaction card («когда … деморализован») is not offered at the
                // start of the step: it waits for the moment it reacts to.
                defer: trig ? !!trig.defer : false,
                orderType: trig ? trig.orderType || null : null,
                insteadOfOrder: trig ? !!trig.insteadOfOrder : false,
            });
            this.engine.log(state, seat, p0.name + ' держит план «' + card.name + '».');
        }
        // Every drawn card goes back into the deck — the ones that were not
        // played at least: a scheme that stays in play is excluded (the rules:
        // "he shuffles all event cards back into his event deck, excluding the
        // 'Scheme' event card if it is in play").
        const p = state.players[seat];
        const inPlay = card && card.type === 'scheme' ? card.name : null;
        for (const name of (state.event.drawn || [])) if (name !== inPlay) p.decks.event.push(name);
        if (!(state.event.drawn || []).length && state.event.top) {
            // The card that was opened for the storm only goes back to the deck.
            p.decks.event.push(state.event.top);
        }
        if (card) this.engine.log(state, seat, p.name + ' разыграл(а) карту «' + card.name + '».');
        state.event = null;
        state.eventsLeft--;
        // The text of the card is the rule: the engine performs it.
        if (card && card.type !== 'scheme') {
            const steps = FS_EFFECTS.parse(card.text || '', { kind: 'event', faction: state.players[seat].faction });
            // «Быстрый ответ» asks for a system first: the limited advance is
            // born only when that question is answered. The event phase must
            // wait until THEN — a premature nextEventPlayer() would already
            // draw the next player's card and corrupt the snapshot.
            if (steps.some(step => step && step.op === 'chooseSystem' && step.quickResponse)) {
                state.quickResponsePending = true;
                state.quickResponseSnapshot = {
                    phase: state.phase, turn: state.turn,
                    event: state.event, eventsLeft: state.eventsLeft,
                };
            }
            if (steps.length) {
                this.engine.runEffects(state, seat, steps, { kind: 'event', ctx: null });
            }
        }
        // «Быстрый ответ» starts a limited advance from this event: the event
        // phase waits until that order is finished. finishOrder() will call
        // nextEventPlayer() with the restored event-phase snapshot.
        if (!(state.order && state.order.fromEvent) && !state.quickResponsePending) {
            this.nextEventPlayer(state);
        }
        return { ok: true };
    }

    endRound(state) {
        // The end of the round: the first player token passes, the marker moves.
        state.firstPlayer = (state.firstPlayer + 1) % state.players.length;
        state.round++;
        for (const p of state.players) {
            p.placedTokens = 0;
            p.placedOf = {};
            for (const u of p.upgrades) u.used = false;
        }
        for (const s of state.storms) s.moved = false;
        // The players without a friendly world are out of the game.
        for (const p of state.players) {
            const has = state.systems.some(sys => sys.areas.some(a => this.engine.control(state, p.seat, sys.id, a.pos) === 'friendly'));
            if (!has && !p.eliminated) {
                p.eliminated = true;
                this.engine.log(state, p.seat, p.name + ' выбывает: у него не осталось миров.');
                for (const u of state.units.filter(u => u.seat === p.seat)) this.engine.destroyUnit(state, u);
                for (const s of state.structures.filter(s => s.seat === p.seat)) this.engine.destroyStructure(state, s);
            }
        }
        const alive = state.players.filter(p => !p.eliminated);
        if (alive.length <= 1) {
            state.over = true;
            state.winner = alive.length ? alive[0].seat : null;
            this.engine.log(state, -1, 'Игра закончена. Побеждает ' + (state.winner != null ? state.players[state.winner].name : '—') + '.');
            return;
        }
        // The victory conditions: the objectives needed do not shrink when a
        // player is eliminated (the rules). The tie-breaks are the same as at
        // the first step of the refresh phase.
        const won = this.objectiveWinners(state);
        if (won) {
            state.over = true;
            state.winner = won.winner;
            if (won.shared) state.shared = won.shared;
            this.engine.log(state, -1, won.shared
                ? 'Игра закончена вничью.'
                : 'Игра закончена. Побеждает ' + state.players[won.winner].name + '.');
            return;
        }
        if (state.round > this.engine.ROUNDS) {
            state.over = true;
            const best = alive.slice().sort((a, b) => (b.objectives - a.objectives)
                || (this.engine.friendlyWorlds(state, b.seat) - this.engine.friendlyWorlds(state, a.seat))
                || (this.engine.unitsOf(state, b.seat) - this.engine.unitsOf(state, a.seat)));
            state.winner = best[0].seat;
            // The tie-breaks of the rules: objectives, friendly worlds, units, and
            // only then a shared victory.
            const same = (a, b) => a.objectives === b.objectives
                && this.engine.friendlyWorlds(state, a.seat) === this.engine.friendlyWorlds(state, b.seat)
                && this.engine.unitsOf(state, a.seat) === this.engine.unitsOf(state, b.seat);
            const shared = best.filter(p => same(p, best[0]));
            if (shared.length > 1) {
                state.shared = shared.map(p => p.seat);
                this.engine.log(state, -1, 'Восьмой раунд закончен. Победа делится между ' + shared.map(p => p.name).join(' и ') + '.');
                return;
            }
            this.engine.log(state, -1, 'Восьмой раунд закончен. Побеждает ' + best[0].name + '.');
            return;
        }
        state.phase = 'planning';
        // The first player may be out of the game: the planning starts with the
        // first player who still has tokens in hand.
        state.turn = state.players[state.firstPlayer] && state.players[state.firstPlayer].eliminated
            ? this.engine.nextPlanner(state, state.firstPlayer - 1 < 0 ? state.players.length - 1 : state.firstPlayer - 1)
            : state.firstPlayer;
        // The schemes of the start of the planning phase.
        this.engine.maybeScheme(state, state.turn, 'planning', { kind: 'event', ctx: null });
        this.engine.log(state, -1, 'Раунд ' + state.round + ': фаза планирования.');
    }

}
