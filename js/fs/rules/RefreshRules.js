// FSRulesRefresh.js — the refresh phase: the objectives, the materiel, the
// rally of the routed units, the event cards and the end of the round.

class RefreshRules {
    /** @param {any} engine the rules facade (FSRules.js) */
    constructor(engine) {
        this.engine = engine;
    }

    /** The tie-breaks of the rules: objectives, then friendly worlds, then units. */
    rank(state, p) {
        return {
            objectives: p.objectives || 0,
            worlds: this.engine.friendlyWorlds(state, p.seat),
            units: this.engine.unitsOf(state, p.seat),
        };
    }

    /** The better of two ranks: negative when `b` wins, positive when `a` does. */
    byRank(a, b) {
        return (b.objectives - a.objectives) || (b.worlds - a.worlds) || (b.units - a.units);
    }

    /** Is `b` exactly as good as `a` on every tie-break? (a shared victory) */
    sameRank(a, b) {
        return a.objectives === b.objectives && a.worlds === b.worlds && a.units === b.units;
    }

    /** The best players of a list, sorted — with every player who ties with the first. */
    standings(state, players) {
        const ranked = players
            .map(p => ({ p, rank: this.rank(state, p) }))
            .sort((a, b) => this.byRank(a.rank, b.rank));
        if (!ranked.length) return { best: null, shared: [] };
        const top = ranked[0];
        const shared = ranked.filter(x => this.sameRank(x.rank, top.rank)).map(x => x.p);
        return { best: top.p, shared };
    }

    objectiveWinners(state) {
        const needed = state.players.length;
        const alive = state.players.filter(p => !p.eliminated && p.objectives >= needed);
        if (!alive.length) return null;
        const { best, shared } = this.standings(state, alive);
        return { winner: best.seat, shared: shared.length > 1 ? shared.map(p => p.seat) : null };
    }

    /**
     * The game is won: the objectives are collected. Both moments of the
     * refresh phase (the first step and the end of the round) end the same way —
     * only at the first step the log says why the tokens were collected.
     */
    declareWin(state, won, byObjectives) {
        // The outcome of the game is one object: it writes the three fields and
        // says the same sentence the rules say.
        const outcome = GameOutcome.of(state).declare(won);
        const why = byObjectives ? 'цели собраны' : '';
        const nameOf = seat => (state.players[seat] ? state.players[seat].name : '—');
        this.engine.log(state, -1, outcome.tied
            ? 'Игра закончена вничью' + (why ? ': ' + why : '') + '.'
            : 'Игра закончена. Побеждает ' + nameOf(outcome.winner) + (why ? ': ' + why : '') + '.');
    }

    // «…чтобы собрать маркер цели … в дружественном мире» («Триумфальный
    // отход»): the token leaves the board and lies on the sheet of its owner.
    // The refresh phase collects the tokens of the worlds a player controls —
    // a card that collects them earlier does the very same thing, so the rule
    // lives here, once, and the card only names the token.
    collectObjective(state, objectiveId, seat) {
        const at = (state.objectives || []).findIndex(o => o.id === objectiveId);
        if (at < 0) return false;
        const obj = state.objectives[at];
        const p = state.players[seat];
        if (!p) return false;
        state.objectives.splice(at, 1);
        p.objectives = (p.objectives || 0) + 1;
        const sys = this.engine.system(state, obj.system);
        const area = sys ? this.engine.area(sys, obj.area) : null;
        this.engine.log(state, seat, p.name + ' собирает маркер цели'
            + (area && area.world ? ' с мира ' + area.world.name : '') + '.');
        return true;
    }

    startRefresh(state) {
        GamePhase.of(state).start(GamePhase.REFRESH);
        this.engine.closeOrder(state);
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
            this.declareWin(state, won, true);
            return;
        }
        // 2. the materiel
        for (const p of state.players) {
            const income = this.engine.materielIncome(state, p.seat);
            if (income > 0) {
                this.engine.player(state, p.seat).gainMateriel(income);
                this.engine.log(state, p.seat, p.name + ' получил материи: ' + income + '.');
            }
        }
        // 3. rally the routed units
        // The rally of the round: every unit stands up again — through the
        // same restore the cards use, so the round it fell in is cleared too.
        for (const u of state.units) this.engine.restoreUnit(state, u);
        // 4. the event cards and the warp storms
        GamePhase.of(state).turn = GamePhase.of(state).firstPlayer;
        EventRound.of(state).begin();
        StormPhase.of(state).clearReaction();
        OrderScheme.of(state).reset();
        StormPhase.of(state).allowIcons();
        this.engine.log(state, -1, 'Фаза обновления: события и варп-штормы.');
        this.nextEventPlayer(state);
    }

    nextEventPlayer(state) {
        // The suppression belongs to the one event whose three cards were
        // revealed, not to the next player's event.
        StormPhase.of(state).allowIcons();
        if (!EventRound.of(state).pending) {
            // The end of the event phase: the capacity of every area is checked
            // again, and every player chooses his own excess troops.
            for (const p of state.players) this.engine.trimPlayer(state, p.seat);
            this.endRound(state);
            return;
        }
        const seat = GamePhase.of(state).turn;
        const p = state.players[seat];
        const drawn = [];
        for (let i = 0; i < p.eventTokens; i++) drawn.push(this.drawEventCard(state, seat));
        const phase = EventPhase.of(state);
        phase.begin(seat, drawn);
        p.eventTokens = 0;
        if (!drawn.length) {
            // No token on the deck: the top card is revealed for the storm only.
            phase.revealTop(this.drawEventCard(state, seat));
        }
        // The next player plays the next event.
        GamePhase.of(state).nextTurn();
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
        if (!GamePhase.of(state).is(GamePhase.REFRESH)) return { ok: false, error: 'Сейчас не фаза обновления.' };
        const phase = EventPhase.of(state);
        if (!phase.isSeat(seat)) return { ok: false, error: 'Сейчас ход другого игрока.' };
        if (phase.chosen) return { ok: false, error: 'Карта уже выбрана.' };
        const name = cmd.card;
        if (!phase.drawn.includes(name)) return { ok: false, error: 'Такой карты нет на руке.' };
        phase.choose(name);
        const card = FS_CATALOG.card('events', state.players[seat].faction, name);
        phase.setCard(card);
        this.engine.log(state, seat, state.players[seat].name + ' выбрал карту события «' + name + '».');
        return { ok: true };
    }

    cmdResolveEvent(state, seat, cmd) {
        if (!GamePhase.of(state).is(GamePhase.REFRESH)) return { ok: false, error: 'Сейчас не фаза обновления.' };
        const phase = EventPhase.of(state);
        if (!phase.isSeat(seat)) return { ok: false, error: 'Сейчас ход другого игрока.' };
        // The storm movement of the card is not a choice — only its ability is.
        // «A player can choose not to resolve the ability on his chosen event
        // card, but must resolve the card's Warp Storm movement icon.»
        const canMove = StormPhase.of(state).iconsMove && this.engine.stormOptions(state, seat).length;
        if (canMove && !phase.stormMoved) {
            return { ok: false, error: 'Сначала сдвиньте варп-шторм по иконке карты.' };
        }
        const card = phase.card;
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
        for (const name of phase.drawn) if (name !== inPlay) p.decks.event.push(name);
        if (!phase.drawn.length && phase.top) {
            // The card that was opened for the storm only goes back to the deck.
            p.decks.event.push(phase.top);
        }
        if (card) this.engine.log(state, seat, p.name + ' разыграл(а) карту «' + card.name + '».');
        phase.end();
        EventRound.of(state).played();
        // The text of the card is the rule: the engine performs it.
        if (card && card.type !== 'scheme') {
            const steps = FS_EFFECTS.parse(card.text || '', { kind: 'event', faction: state.players[seat].faction });
            // «Быстрый ответ» asks for a system first: the limited advance is
            // born only when that question is answered. The event phase must
            // wait until THEN — a premature nextEventPlayer() would already
            // draw the next player's card and corrupt the snapshot.
            if (steps.some(step => step && step.op === 'chooseSystem' && step.quickResponse)) {
                const quick = QuickResponse.of(state);
                quick.suspend().wait();
            }
            if (steps.length) {
                this.engine.runEffects(state, seat, steps, { kind: 'event', ctx: null });
            }
        }
        // «Быстрый ответ» starts a limited advance from this event: the event
        // phase waits until that order is finished. finishOrder() will call
        // nextEventPlayer() with the restored event-phase snapshot.
        if (!(state.order && OrderMove.of(state.order).fromEvent) && !QuickResponse.of(state).pending) {
            this.nextEventPlayer(state);
        }
        return { ok: true };
    }

    endRound(state) {
        // The end of the round: the first player token passes, the marker moves.
        GamePhase.of(state).passFirst();
        GamePhase.of(state).startRound(GamePhase.of(state).round + 1);
        for (const p of state.players) {
            p.placedTokens = 0;
            p.placedOf = {};
            for (const u of p.upgrades) u.used = false;
        }
        for (const s of state.storms) s.moved = false;
        // The players without a friendly world are out of the game. A world,
        // not just an area: «a player is eliminated if he does not have any
        // friendly worlds» — a lone ship in a void holds no world, and the
        // player who holds only voids is still out.
        for (const p of state.players) {
            const has = this.engine.friendlyWorlds(state, p.seat) > 0;
            if (!has && !p.eliminated) {
                p.eliminated = true;
                this.engine.log(state, p.seat, p.name + ' выбывает: у него не осталось миров.');
                for (const u of state.units.filter(u => u.seat === p.seat)) this.engine.destroyUnit(state, u);
                for (const s of state.structures.filter(s => s.seat === p.seat)) this.engine.destroyStructure(state, s);
            }
        }
        const alive = state.players.filter(p => !p.eliminated);
        if (alive.length <= 1) {
            const outcome = GameOutcome.of(state).byElimination(alive.length ? alive[0].seat : null);
            const name = outcome.winner === null ? '—' : state.players[outcome.winner].name;
            this.engine.log(state, -1, 'Игра закончена. Побеждает ' + name + '.');
            return;
        }
        // The victory conditions: the objectives needed do not shrink when a
        // player is eliminated (the rules). The tie-breaks are the same as at
        // the first step of the refresh phase.
        const won = this.objectiveWinners(state);
        if (won) {
            this.declareWin(state, won, false);
            return;
        }
        if (GamePhase.of(state).round > this.engine.ROUNDS) {
            // The tie-breaks of the rules: objectives, friendly worlds, units, and
            // only then a shared victory.
            const { best, shared } = this.standings(state, alive);
            GameOutcome.of(state).byRound(best.seat, shared.map(p => p.seat));
            if (shared.length > 1) {
                this.engine.log(state, -1, 'Раунд ' + this.engine.ROUNDS + ' закончен. Победа делится между '
                    + shared.map(p => p.name).join(' и ') + '.');
                return;
            }
            this.engine.log(state, -1, 'Раунд ' + this.engine.ROUNDS + ' закончен. Побеждает ' + best.name + '.');
            return;
        }
        GamePhase.of(state).start(GamePhase.PLANNING);
        // The first player may be out of the game: the planning starts with the
        // first player who still has tokens in hand.
        GamePhase.of(state).turn = GamePhase.of(state).opener(this.engine.nextPlanner);
        // The schemes of the start of the planning phase.
        this.engine.maybeScheme(state, GamePhase.of(state).turn, 'planning', { kind: 'event', ctx: null });
        this.engine.log(state, -1, 'Раунд ' + GamePhase.of(state).round + ': фаза планирования.');
    }

}
