// FSRulesOperations.js — the operations phase: revealing the tokens, the turn
// order, the end of an order and the bridge to the effect interpreter.

// One wording for one refusal: the panel shows the text the rules return.
const TRIM_FIRST = 'Сначала уберите отряды сверх вместимости области.';
const trimRefusal = () => ({ ok: false, error: TRIM_FIRST });

class OperationsRules {
    /** @param {any} engine the rules facade (FSRules.js) */
    constructor(engine) {
        this.engine = engine;
    }

    apply(state, seat, cmd) {
        if (state.over) return { ok: false, error: 'Игра закончена.' };
        const p = state.players[seat];
        if (!p) return { ok: false, error: 'Нет такого игрока.' };
        // Older saves named a storm by one tile and a side. Bring them to the
        // canonical border between two tiles before any command reads them.
        FS_WARP_STORMS.normalize(state);
        try {
            const res = this.dispatch(state, seat, cmd);
            return res || { ok: true };
        } catch (e) {
            return { ok: false, error: String(e && e.message ? e.message : e) };
        }
    }

    /** A player whose area is over capacity may do nothing but trim it. */
    trimBlocked(state, seat) {
        return this.engine.trimQueue(state).blocked(seat);
    }

    dispatch(state, seat, cmd) {
        const type = cmd && cmd.type;
        // A player who has troops above the capacity of an area chooses which of
        // them go back to the supply before he does anything else.
        if (type !== 'trimUnit' && this.trimBlocked(state, seat)) return trimRefusal();
        switch (type) {
            case 'placeSystemTile': return this.engine.cmdPlaceSystemTile(state, seat, cmd);
            case 'setupUnit': return this.engine.cmdSetupForce(state, seat, cmd, 'unit');
            case 'setupStructure': return this.engine.cmdSetupForce(state, seat, cmd, 'structure');
            case 'removeSetupForce': return this.engine.cmdRemoveSetupForce(state, seat, cmd);
            case 'finishSetupForces': return this.engine.cmdFinishSetupForces(state, seat);
            case 'setupObjective': return this.engine.cmdSetupObjective(state, seat, cmd);
            case 'setupStorm': return this.engine.cmdSetupStorm(state, seat, cmd);
            case 'placeOrder': return this.engine.cmdPlaceOrder(state, seat, cmd);
            case 'resolveOrder': return this.cmdResolveOrder(state, seat, cmd);
            case 'moveUnits': return this.engine.cmdMoveUnits(state, seat, cmd);
            case 'undoMove': return this.engine.cmdUndoMove(state, seat, cmd);
            case 'endAdvance': return this.engine.cmdEndAdvance(state, seat, cmd);
            case 'buyUnit': return this.engine.cmdBuyUnit(state, seat, cmd);
            case 'buyStructure': return this.engine.cmdBuyStructure(state, seat, cmd);
            case 'buyUpgrade': return this.engine.cmdBuyUpgrade(state, seat, cmd);
            case 'refundUpgrade': return this.engine.cmdRefundUpgrade(state, seat, cmd);
            case 'useUpgrade': return this.cmdUseUpgrade(state, seat, cmd);
            case 'finishDeploy': return this.engine.cmdFinishDeploy(state, seat);
            case 'finishGuardDeploy': return this.engine.cmdFinishGuardDeploy(state, seat);
            case 'deployStructures': return this.engine.cmdDeployStructures(state, seat);
            case 'undoPurchase': return this.engine.cmdUndoPurchase(state, seat, cmd);
            case 'finishStrategize': return this.engine.cmdFinishStrategize(state, seat);
            case 'finishDominate': return this.engine.cmdFinishDominate(state, seat, cmd);
            case 'finishAdvance': return this.engine.cmdFinishAdvance(state, seat);
            case 'orbitalStrike': return this.engine.cmdOrbitalStrike(state, seat, cmd);
            case 'combat': return this.engine.cmdCombat(state, seat, cmd);
            case 'drawEvent': return this.engine.cmdDrawEvent(state, seat, cmd);
            case 'resolveEvent': return this.engine.cmdResolveEvent(state, seat, cmd);
            case 'moveStorm': return this.engine.cmdMoveStorm(state, seat, cmd);
            case 'nextPhase': return this.cmdNextPhase(state, seat);
            case 'takeProsperity': return this.engine.cmdTakeProsperity(state, seat, cmd);
            case 'startAsset': return this.engine.cmdStartAsset(state, seat, cmd);
            case 'effect': return this.cmdEffect(state, seat, cmd);
            case 'trimUnit': return this.engine.cmdTrimUnit(state, seat, cmd);
            case 'strikeDamage': return this.engine.cmdStrikeDamage(state, seat, cmd);
            case 'rematchBattle': return this.engine.cmdRematchBattle(state, seat);
            default: return { ok: false, error: 'Неизвестная команда: ' + type };
        }
    }

    cmdResolveOrder(state, seat, cmd) {
        if (state.phase !== 'operations') return { ok: false, error: 'Сейчас не фаза операций.' };
        if (this.trimBlocked(state, seat)) return trimRefusal();
        if (state.turn !== seat) return { ok: false, error: 'Сейчас ход другого игрока.' };
        // One order at a time: the previous one must be finished.
        if (state.order) return { ok: false, error: 'Сначала закончите текущий приказ.' };
        // «вместо раскрытия приказа во время фазы действий» (01-rules-
        // reference.md): the offer is made BEFORE a token is chosen; a refusal
        // leaves this player's normal reveal intact, and is not offered twice.
        const sys = this.engine.system(state, cmd.system);
        if (!sys) return { ok: false, error: 'Нет такой системы.' };
        if (!sys.tokens.length) return { ok: false, error: 'В этой системе нет приказов.' };
        // A refusal belongs to THIS attempted reveal: the same player may use
        // the still-in-play plan instead of his next order later in the round.
        const offerKey = state.round + ':' + state.turn + ':' + seat + ':'
            + sys.id + ':' + sys.tokens.length;
        if (state.operationSchemeOffered !== offerKey) {
            state.operationSchemeOffered = offerKey;
            if (this.maybeScheme(state, seat, 'operations',
                { kind: 'event', ctx: { operationScheme: true } }, { instead: true })) {
                return { ok: true, pending: true };
            }
        }
        const top = this.engine.board(state).topOrder(sys.id);
        if (!top) return { ok: false, error: 'В этой системе нет приказов.' };
        if (top.seat !== seat) return { ok: false, error: 'Это не ваш приказ.' };
        // The player may put the token on his event deck instead of resolving it.
        if (cmd.toEventDeck) {
            sys.tokens.pop();
            const p = state.players[seat];
            p.eventTokens++;
            this.engine.log(state, seat, p.name + ' отложил приказ на колоду событий.');
            this.nextTurn(state);
            return { ok: true };
        }
        sys.tokens.pop();
        top.faceUp = true;
        const p = state.players[seat];
        // Every order starts with a clean sheet: the retreats of a combat look
        // for the areas the attacking units came from, and those are recorded
        // only while this order is being resolved.
        state.moves = [];
        state.order = { seat, order: top.order, system: sys.id, phase: 'resolve' };
        this.engine.log(state, seat, p.name + ' раскрыл приказ «' + this.engine.orderName(top.order) + '» в системе ' + sys.tile + '.');
        const res = this.resolveOrder(state, seat, top.order, sys.id);
        if (res && res.ok === false) return res;
        // The schemes of the activation of the order.
        if (this.maybeScheme(state, seat, 'order', { kind: 'order', ctx: null })) return { ok: true, pending: true };
        return { ok: true };
    }

    resolveOrder(state, seat, order, systemId) {
        const p = state.players[seat];
        if (order === 'advance') {
            PhasePlan.of(state.order).set('move');
            // The movement has two steps: the ships first, then the ground units
            // (the rules, "Advance Order"). The roads of each step are frozen when
            // the step begins: a march never opens a longer road for the next unit.
            const march = MarchPlan.of(state.order);
            march.reset().setStep('ships');
            march.setRoute(this.engine.advanceRoutes(state, seat, 'ship'));
            return { ok: true };
        }
        if (order === 'deploy') {
            // Two steps: the units first, then the one structure. The materiel is
            // paid at the end of the order (cmdFinishDeploy).
            PhasePlan.of(state.order).set('units');
            Purchases.of(state.order).clear();
            // The card of the Orks lets the structure come before the units.
            if ((p.upgrades || []).some(u => /Строй быстрее/i.test(u.name || ''))) {
                OrderDeal.of(state.order).setStructureFirst();
            }
            this.engine.log(state, seat, p.name + ' может покупать отряды, а затем постройку.');
            return { ok: true };
        }
        if (order === 'strategize') {
            PhasePlan.of(state.order).set('strategize');
            return { ok: true };
        }
        if (order === 'dominate') {
            // The order stays open: the player takes the prosperity tokens and
            // applies the ability of the faction.
            this.engine.dominate(state, seat, systemId);
            PhasePlan.of(state.order).set('dominate');
            const faction = this.engine.faction(state, seat);
            state.order.ability = faction && faction.ability
                ? faction.ability.name + ': ' + faction.ability.text : '';
            return { ok: true };
        }
        return { ok: false, error: 'Неизвестный приказ.' };
    }

    /**
     * Close the order that is running. One end for every way an order ends: a
     * question that belonged to it goes with it — a purchase that was still
     * waiting for its pair must not outlive the order it was made in.
     */
    closeOrder(state) {
        state.order = null;
        // The question of an order (the pair a purchase replaces) holds the
        // half-done command; the question of an effect belongs to a card, not
        // to the order, and stays.
        if (state.pending && state.pending.ctx && state.pending.ctx.buyUpgrade) state.pending = null;
        return true;
    }

    /** The order tokens the seat has spent (placed, less the board and the event deck). */
    usedOrderTokens(state, seat) {
        if (!state.players[seat]) return 0;
        return this.engine.player(state, seat).usedOrderTokens();
    }

    finishOrder(state, seat) {
        // «Мобилизированные охотники»: the extra advance (and a combat it may
        // start) ends here, but the MAIN advance of the same order goes on.
        if (state.preAdvanceMain) {
            this.engine.finishPreAdvance(state, seat);
            return;
        }
        // «Быстрый ответ»: the limited advance was born from a tactic event of
        // the refresh phase. Its end returns the game to that event phase.
        if (state.order && state.order.fromEvent) {
            const snap = state.quickResponseSnapshot;
            for (const p of state.players) this.engine.trimPlayer(state, p.seat);
            this.closeOrder(state);
            if (snap) {
                state.phase = snap.phase;
                state.turn = snap.turn;
                state.event = snap.event;
                state.eventsLeft = snap.eventsLeft;
                delete state.quickResponseSnapshot;
                delete state.quickResponsePending;
                // The next player's event card is drawn only now: the limited
                // advance itself is not part of the refresh phase.
                this.engine.nextEventPlayer(state);
            }
            return;
        }
        // A prosperity token that was never exchanged still gives one asset of
        // the player's choice: the engine picks one for him instead of losing
        // it («if he gains a prosperity asset, he gains one asset token of his
        // choice»).
        this.engine.takeProsperityLeft(state, seat);
        // The capacity is checked for every player: a card may have put troops of
        // another player into an area as well.
        for (const p of state.players) this.engine.trimPlayer(state, p.seat);
        this.closeOrder(state);
        this.nextTurn(state);
    }

    nextTurn(state) {
        const count = state.players.length;
        let turn = state.turn;
        for (let i = 0; i < count; i++) {
            turn = (turn + 1) % count;
            if (this.hasOrderToResolve(state, turn)) { state.turn = turn; return; }
            // «Если вы вынуждены пропустить ход во время фазы операций, можете
            // сбросить эту карту…» («Некромеханика»): the player whose tokens
            // lie under the tokens of the others plays the card of the turn he
            // has to skip.
            if (!state.pending) this.maybeScheme(state, turn, 'skip', { kind: 'event', ctx: null });
        }
        // Nobody has an order left — the refresh phase begins.
        this.engine.startRefresh(state);
    }

    firstWithOrder(state) {
        const n = state.players.length;
        for (let i = 0; i < n; i++) {
            const seat = (state.firstPlayer + i) % n;
            if (this.hasOrderToResolve(state, seat)) return seat;
        }
        return state.firstPlayer;
    }

    hasOrderToResolve(state, seat) {
        return this.engine.availableOrders(state, seat).length > 0;
    }

    cmdUseUpgrade(state, seat, cmd) {
        const p = state.players[seat];
        const up = p.upgrades.find(u => u.name === cmd.card && !u.used);
        if (!up) {
            const known = p.upgrades.some(u => u.name === cmd.card);
            return { ok: false, error: known ? 'Это улучшение уже использовано в этом раунде.' : 'Нет такого улучшения.' };
        }
        // An order upgrade belongs to one order: it is played while that order
        // is being resolved, and by the player who resolved it (the rules,
        // «Order Upgrade Cards»).
        const card0 = FS_CATALOG.card('orders', p.faction, up.name);
        const kind = up.order || (card0 && card0.order) || null;
        if (kind) {
            if (!state.order || state.order.seat !== seat) {
                return { ok: false, error: 'Это улучшение применяется во время приказа.' };
            }
            // An orbital upgrade belongs to the orbital strike of an advance,
            // every other one to the order printed on it (the rules, «Order
            // Upgrade Cards»: the icon of the order is on the card).
            if (kind === 'orbital') {
                if (!PhasePlan.of(state.order).is('strike')) {
                    return { ok: false, error: 'Это улучшение применяется во время орбитального удара.' };
                }
            } else if (state.order.order !== kind) {
                return { ok: false, error: 'Это улучшение применяется во время приказа «' + this.engine.orderName(kind) + '».' };
            }
        }
        // «Когда вы покупаете что-либо этим приказом, можете вдобавок купить 1
        // бастион» («Миры-гробницы»): the card comes after a purchase, and a
        // refusal here must not spend it.
        if (/миры-гробницы/i.test(up.name) && state.order && Purchases.of(state.order).empty) {
            return { ok: false, error: 'Сначала купите отряд или постройку этим приказом.' };
        }
        up.used = true;
        this.engine.log(state, seat, p.name + ' применяет улучшение «' + up.name + '».');
        // The text of the card is the rule: the engine performs it.
        const card = card0;
        const steps = FS_EFFECTS.parse((card && card.text) || '',
            { kind: 'order', faction: p.faction });
        if (steps.length) this.runEffects(state, seat, steps, { kind: 'order', ctx: null });
        return { ok: true, text: up.text || '' };
    }

    cmdNextPhase(state, seat) {
        if (state.phase !== 'refresh') return { ok: false, error: 'Сейчас не фаза обновления.' };
        if (state.eventsLeft > 0) return { ok: false, error: 'Сначала разыграйте события.' };
        this.engine.endRound(state);
        return { ok: true };
    }

    cardSteps(state, seat, card) {
        if (!card) return [];
        // The faction is needed by the text: a card may name a unit of the deck.
        const faction = (state.players[seat] || {}).faction;
        const steps = FS_EFFECTS.parse(card.general || '', { kind: 'combat', faction });
        if (card.unit) {
            const combat = state.combat;
            const reqs = card.reqs || [];
            // «A unit used to meet this requisite must be unrouted.»
            const there = combat && state.units.some(u => {
                if (u.seat !== seat || u.routed || u.system !== combat.system || u.area !== combat.pos) return false;
                const def = this.engine.unitOf(state, u);
                return def && reqs.some(r => FS_EFFECTS.sameName(def.name, r));
            });
            if (there) {
                // The paragraphs of the text may name their own requisites
                // («*Титан «Гончая»:* … *Линкор:* …»): only the paragraphs whose
                // unit stands in the battle are read.
                const present = state.units.filter(u => u.seat === seat && !u.routed
                    && u.system === combat.system && u.area === combat.pos)
                    .map(u => (this.engine.unitOf(state, u) || {}).name).filter(Boolean);
                steps.push(...FS_EFFECTS.parse(card.unit, { kind: 'combat', faction, reqs, present }));
            }
        }
        return steps;
    }

    runEffects(state, seat, steps, ctx) {
        if (!steps.length) return { ok: true, done: true };
        return FS_EFFECTS.run(this.engine, state, seat, steps, ctx || {});
    }

    cmdEffect(state, seat, cmd) {
        // An order that stopped to ask (the pair of the combat deck a purchase
        // replaces) remembers the half-done command; the answer finishes it.
        // The question of an effect is the same shape, so the panel and the
        // tests read both the same way — state.pending.question.
        const pending = state.pending;
        if (pending && pending.ctx && pending.ctx.buyUpgrade) {
            const must = pending.answerSeat === undefined ? pending.seat : pending.answerSeat;
            if (must !== seat) return { ok: false, error: 'Сейчас не ваш ход.' };
            const half = pending.ctx.buyUpgrade;
            const answer = cmd.answer || {};
            const name = answer.remove || answer.card || answer.choice || answer.value;
            // The question is closed only by a purchase that went through: a
            // bad answer keeps it open instead of swallowing the command.
            const res = this.engine.cmdBuyUpgrade(state, seat,
                Object.assign({}, half, { remove: name }));
            if (res && res.ok) state.pending = null;
            return res;
        }
        return FS_EFFECTS.answer(this.engine, state, seat, cmd);
    }

    schemesOf(state, seat) {
        const p = state.players[seat];
        return (p.schemes || []).filter(s => s && s.trigger && s.steps && s.steps.length);
    }

    maybeScheme(state, seat, trigger, ctx, opts) {
        let schemes = this.schemesOf(state, seat).filter(s => s.trigger === trigger && !s.defer);
        // «Отрава Нургла» says «instead of revealing an order»: it is not one
        // of the schemes of the START of the operations phase, and lasts only
        // for the turn on which it was offered.
        if (trigger === 'operations') {
            schemes = opts && opts.instead
                ? schemes.filter(s => s.insteadOfOrder)
                : schemes.filter(s => !s.insteadOfOrder);
        }
        // «Прикосновение варпа» names the advance order in its trigger.
        if (trigger === 'order' && state.order) {
            schemes = schemes.filter(s => !s.orderType || s.orderType === state.order.order);
        }
        if (!schemes.length) return false;
        const c = ctx || {};
        // The card whose text the engine did not read: the player sees the text.
        const manual = schemes.find(s => s.note);
        state.pending = {
            seat, answerSeat: seat, kind: 'scheme', steps: [], index: 0,
            question: {
                kind: 'scheme', who: seat, options: schemes.map(s => s.name),
                text: manual
                    ? manual.text + '\n(Эффект выполняется вручную: сбросьте карту, когда выполните его.)'
                    : 'Сбросить карту: ' + schemes.map(s => '«' + s.name + '»').join(', ') + '?',
            },
            ctx: { kind: c.kind || 'event', ctx: c.ctx || null, schemes },
        };
        return true;
    }

}
