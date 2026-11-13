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
        if (GameOutcome.of(state).over) return { ok: false, error: 'Игра закончена.' };
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
        if (type !== 'trimUnit' && (this.trimBlocked(state, seat)
            || state.orderTrimPending || state.eventTrimPending || state.quickResponseTrimPending
            || state.effectCombatTrimOwner !== undefined)) return trimRefusal();
        // A pending card or plan is part of the current turn. Neither player may
        // place an order or advance a phase while its owner is making a choice.
        const pending = Question.of(state).record;
        // A combat-upgrade purchase has not happened until its replacement is
        // chosen; ending Strategize is also a legitimate way to cancel it.
        const cancelPurchase = type === 'finishStrategize' && pending && pending.seat === seat
            && pending.ctx && pending.ctx.buyUpgrade;
        if (type !== 'effect' && type !== 'trimUnit' && pending && !cancelPurchase) {
            return { ok: false, error: 'Сначала ответьте на вопрос способности.' };
        }
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
        if (!GamePhase.of(state).is(GamePhase.OPERATIONS)) return { ok: false, error: 'Сейчас не фаза операций.' };
        if (this.trimBlocked(state, seat)) return trimRefusal();
        if (!GamePhase.of(state).isTurn(seat)) return { ok: false, error: 'Сейчас ход другого игрока.' };
        // One order at a time: the previous one must be finished.
        if (state.order) return { ok: false, error: 'Сначала закончите текущий приказ.' };
        // «вместо раскрытия приказа во время фазы действий» (01-rules-
        // reference.md): the offer is made BEFORE a token is chosen; a refusal
        // leaves this player's normal reveal intact, and is not offered twice.
        const sys = this.engine.system(state, cmd.system);
        if (!sys) return { ok: false, error: 'Нет такой системы.' };
        if (!sys.tokens.length) return { ok: false, error: 'В этой системе нет приказов.' };
        const top = this.engine.board(state).topOrder(sys.id);
        if (!top) return { ok: false, error: 'В этой системе нет приказов.' };
        if (top.seat !== seat) return { ok: false, error: 'Это не ваш приказ.' };
        // A refusal belongs to THIS attempted reveal: the same player may use
        // the still-in-play plan instead of his next order later in the round.
        const offerKey = OrderScheme.key(state, seat, sys.id, sys.tokens.length);
        const scheme = OrderScheme.of(state);
        if (!scheme.asked(offerKey)) {
            scheme.offer(offerKey);
            if (this.maybeScheme(state, seat, 'operations',
                { kind: 'event', ctx: { operationScheme: true } }, { instead: true })) {
                return { ok: true, pending: true };
            }
        }
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
        MarchTrail.of(state).reset();
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
            // The same text the dominate rule prints: one place names it.
            OrderTally.of(state.order).setAbility(this.engine.factionAbilityText(state, seat));
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
        const half = Question.of(state).ctx;
        if (half && half.buyUpgrade) Question.of(state).close();
        return true;
    }

    /** The order tokens the seat has spent (placed, less the board and the event deck). */
    usedOrderTokens(state, seat) {
        if (!state.players[seat]) return 0;
        return this.engine.player(state, seat).usedOrderTokens();
    }

    finishOrder(state, seat) {
        // A card may have made a different area contested during the battle.
        // Its battle comes before the original order (or extra advance) ends.
        if (!state.combat && (state.effectCombatQueue || []).length) {
            if (this.engine.trimQueue(state).any()) {
                state.effectCombatTrimOwner = seat;
                return;
            }
            if (this.engine.beginEffectCombat(state)) return;
        }
        // «Мобилизированные охотники»: the extra advance (and a combat it may
        // start) ends here, but the MAIN advance of the same order goes on.
        if (PreAdvance.of(state).suspended) {
            this.engine.finishPreAdvance(state, seat);
            return;
        }
        // «Быстрый ответ»: finish its limited order, including the capacity
        // check, before resuming the event or the interrupted faction ability.
        if (state.order && OrderMove.of(state.order).fromEvent) {
            const waiting = QuickResponse.of(state).snapshot;
            for (const p of state.players) this.engine.trimPlayer(state, p.seat);
            this.closeOrder(state);
            if (waiting && this.engine.trimQueue(state).any()) {
                state.quickResponseTrimPending = true;
            } else if (waiting) {
                this.resumeQuickResponse(state, seat);
            }
            return;
        }
        // A completed battle normally ends an Advance. The Eldar upgrade is
        // offered only here, before that order closes, and only if an orbital
        // strike can actually be made in its active system.
        const order = state.order;
        const player = state.players[seat];
        if (order && !state.combat && OrderContext.of(order).isKind('advance')
            && OrderContext.of(order).isSeat(seat) && PhasePlan.of(order).is('combat')
            && player && player.faction === 'эльдары'
            && (player.upgrades || []).some(u => u.name === 'Рейд корсаров' && !u.used)) {
            const ignoresBastion = (player.upgrades || []).some(up => {
                if (up.used) return false;
                const card = FS_CATALOG.card('orders', player.faction, up.name);
                return card && card.order === 'orbital'
                    && FS_EFFECTS.parse(card.text || '', { kind: 'order', faction: player.faction })
                        .some(step => step.op === 'ignoreBastion');
            });
            if (this.engine.orbitalStrikeTargets(state, seat).length
                || (ignoresBastion && this.engine.orbitalStrikeTargets(state, seat, { ignoreBastion: true }).length)) {
                PhasePlan.of(order).set('corsair');
                return;
            }
        }
        // «После выполнения Приказа Продвижения вы можете сбросить эту карту»
        // («Триумфальный отход»): the window of the end of the order, offered
        // once; the answer brings the end of the order back here.
        if (order && !state.combat && OrderContext.of(order).isSeat(seat) && !order.endSchemeAsked) {
            order.endSchemeAsked = true;
            if (this.maybeScheme(state, seat, 'order-end', { kind: 'order', ctx: { resumeFinishOrder: seat } })) return;
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
        if (this.engine.trimQueue(state).any()) state.orderTrimPending = true;
        else this.nextTurn(state);
    }

    /** Resume the event or faction ability interrupted by a limited advance. */
    resumeQuickResponse(state, seat) {
        const snap = QuickResponse.of(state).resume();
        if (!snap) return;
        if (snap.continuation) {
            const c = snap.continuation;
            this.runEffects(state, c.seat, c.steps, c.ctx, c.index);
        } else {
            // Compatibility with old refresh-only snapshots.
            this.engine.shuffleEventCards(state, seat);
            this.engine.nextEventPlayer(state);
        }
    }

    nextTurn(state, continuation = null) {
        const game = GamePhase.of(state);
        const count = state.players.length;
        let turn = continuation ? continuation.from : game.turn;
        let remaining = continuation ? continuation.remaining : count;
        const opening = !!(continuation && continuation.opening);
        // There is no further skipped turn once all stacks are empty.
        if (!state.systems.some(s => (s.tokens || []).length)) {
            this.engine.startRefresh(state);
            return;
        }
        while (remaining-- > 0) {
            turn = GamePhase.next(turn === null ? 0 : turn, count);
            const player = state.players[turn];
            if (!player || player.eliminated) continue;
            game.turn = turn;
            if (this.hasOrderToResolve(state, turn)) {
                if (opening) this.maybeScheme(state, turn, 'operations', { kind: 'order', ctx: null });
                return;
            }
            // The skipped player's plan is resolved before another player acts.
            // Store a plain continuation in the question, not a callback, so it
            // survives saving or reconnecting between the questions of the plan.
            const resumeOperations = { from: turn, remaining, opening };
            if (this.maybeScheme(state, turn, 'skip', { kind: 'event', ctx: { resumeOperations } })) return;
        }
        this.engine.startRefresh(state);
    }

    firstWithOrder(state) {
        const game = GamePhase.of(state);
        for (const seat of game.circle()) {
            if (this.hasOrderToResolve(state, seat)) return seat;
        }
        return game.firstPlayer;
    }

    hasOrderToResolve(state, seat) {
        return this.engine.availableOrders(state, seat).length > 0;
    }

    /** The pipeline is a follow-up to this order's factory move, not a deploy. */
    pipelineReady(state, seat) {
        const p = state.players[seat];
        const order = state.order;
        const tally = OrderTally.of(order);
        const moved = tally && tally.movedFactory;
        return !!(p && order && OrderContext.of(order).isSeat(seat)
            && OrderContext.of(order).isKind('dominate') && tally.abilityResolved && moved
            && p.upgrades.some(u => u.name === 'Главный по машинам')
            && state.structures.some(s => s.id === moved.id && s.seat === seat && s.type === 'factory'
                && s.system === moved.system && s.area === moved.pos));
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
            if (!state.order || !OrderContext.of(state.order).isSeat(seat)) {
                return { ok: false, error: 'Это улучшение применяется во время приказа.' };
            }
            // An orbital upgrade belongs to the orbital strike of an advance,
            // every other one to the order printed on it (the rules, «Order
            // Upgrade Cards»: the icon of the order is on the card).
            if (kind === 'orbital') {
                if (!PhasePlan.of(state.order).is('strike')) {
                    return { ok: false, error: 'Это улучшение применяется во время орбитального удара.' };
                }
            } else if (!OrderContext.of(state.order).isKind(kind)) {
                return { ok: false, error: 'Это улучшение применяется во время приказа «' + this.engine.orderName(kind) + '».' };
            }
        }
        // «Когда вы покупаете что-либо этим приказом, можете вдобавок купить 1
        // бастион» («Миры-гробницы»): the card comes after a purchase, and a
        // refusal here must not spend it.
        if (/миры-гробницы/i.test(up.name) && state.order && Purchases.of(state.order).empty) {
            return { ok: false, error: 'Сначала купите отряд или постройку этим приказом.' };
        }
        if (up.name === 'Святой трубопровод' && !this.pipelineReady(state, seat)) {
            return { ok: false, error: 'Нужны «Главный по машинам» и перемещённая этим приказом фабрика.' };
        }
        if (p.faction === 'эльдары' && up.name === 'Рейд корсаров'
            && (!state.order || !PhasePlan.of(state.order).is('corsair') || state.combat)) {
            return { ok: false, error: 'Рейд корсаров применяется после завершения битвы этого приказа.' };
        }
        if (Question.of(state).waiting) return { ok: false, error: 'Сначала ответьте на вопрос способности.' };
        // The text of the card is the rule: the engine performs it.
        const card = card0;
        const steps = FS_EFFECTS.parse((card && card.text) || '',
            { kind: 'order', faction: p.faction });
        if (up.name === 'Святой трубопровод') {
            const purchase = steps.find(s => s.op === 'placeUnit');
            const offer = purchase && FS_EFFECTS.step(this.engine, state, seat, purchase, { kind: 'order', ctx: null });
            if (!offer || !offer.question || !offer.question.options.length) {
                return { ok: false, error: 'Нельзя купить и разместить отряд в мире этой фабрики.' };
            }
        }
        up.used = true;
        this.engine.log(state, seat, p.name + ' применяет улучшение «' + up.name + '».');
        if (steps.length) this.runEffects(state, seat, steps, { kind: 'order', ctx: null });
        return { ok: true, text: up.text || '' };
    }

    cmdNextPhase(state, seat) {
        if (!GamePhase.of(state).is(GamePhase.REFRESH)) return { ok: false, error: 'Сейчас не фаза обновления.' };
        if (EventRound.of(state).pending) return { ok: false, error: 'Сначала разыграйте события.' };
        this.engine.endRound(state);
        return { ok: true };
    }

    /**
     * The names that meet the requisites of a combat card for this seat: the
     * unrouted units of the contested area, a standing reinforcement token (the
     * printed KL0 unit) and — for the Sisters' «Бастион» line — the player's own
     * bastion in the area («Светоч веры», «Святая троица», «Лицеприятная кара»).
     */
    presentNames(state, seat) {
        const combat = state.combat;
        if (!combat) return [];
        // «A unit used to meet this requisite must be unrouted.»
        const field = BattleField.of(combat);
        const present = state.units.filter(u => u.seat === seat && !u.routed && field.holds(u))
            .map(u => (this.engine.unitOf(state, u) || {}).name).filter(Boolean);
        // A standing reinforcement is the matching KL0 unit for card
        // requisites too; routed, destroyed or moved tokens cannot fulfil it.
        const side = CombatSides.sideOf(combat, seat);
        const tokenDef = side && this.engine.reinforceTokenDef(state, side);
        if (tokenDef && this.engine.tokenUnits(state, side).alive > 0) present.push(tokenDef.name);
        // A bastion takes part in the battle like a unit (it rolls no dice,
        // but it is hit and it counts for morale): it meets a «Бастион» line.
        if (field.bastions(state, seat).length) present.push('Бастион');
        return present;
    }

    cardSteps(state, seat, card, opts) {
        if (!card) return [];
        // The faction is needed by the text: a card may name a unit of the deck.
        const faction = (state.players[seat] || {}).faction;
        // «ваш противник не может разыграть общие способности на следующей
        // открытой боевой карте» («Ослепляющий залп»): the general half is
        // left out, the unit half is read as usual.
        const steps = opts && opts.noGeneral ? []
            : FS_EFFECTS.parse(card.general || '', { kind: 'combat', faction });
        if (card.unit) {
            const reqs = card.reqs || [];
            const present = this.presentNames(state, seat);
            // The paragraphs of the text may name their own requisites
            // («*Титан «Гончая»:* … *Линкор:* …»): a unit of such a paragraph
            // meets the requisite just as the one of the card's own line does,
            // and only the paragraphs whose unit stands in the battle are read.
            const there = FS_EFFECTS.meetsRequisite(card, present, { kind: 'combat', faction });
            if (there) {
                steps.push(...FS_EFFECTS.parse(card.unit, { kind: 'combat', faction, reqs, present }));
            }
        }
        return steps;
    }

    runEffects(state, seat, steps, ctx, startIndex) {
        if (!steps.length && startIndex === undefined) return { ok: true, done: true };
        return FS_EFFECTS.run(this.engine, state, seat, steps, ctx || {}, startIndex);
    }

    cmdEffect(state, seat, cmd) {
        // An order that stopped to ask (the pair of the combat deck a purchase
        // replaces) remembers the half-done command; the answer finishes it.
        // The question of an effect is the same shape, so the panel and the
        // tests read both the same way — the question of `Question`.
        const pending = Question.of(state).record;
        // «Доминирование (сбор активов из 1 мира)» («Департаменто муниторум»):
        // the nested order stopped to ask which world pays. The answer names it
        // and the question belongs to that order alone.
        if (pending && pending.ctx && pending.ctx.dominateWorld) {
            if (!Question.of(state).answers(seat)) return { ok: false, error: 'Сейчас не ваш ход.' };
            const area = (cmd.answer || {}).area || (cmd.answer || {}).world || null;
            if (!area || !area.pos) return { ok: false, error: 'Укажите мир.' };
            const gained = this.engine.gatherWorld(state, seat, area);
            if (!gained) return { ok: false, error: 'Это не мир активной системы.' };
            Question.of(state).close();
            return { ok: true };
        }
        if (pending && pending.ctx && pending.ctx.buyUpgrade) {
            if (!Question.of(state).answers(seat)) return { ok: false, error: 'Сейчас не ваш ход.' };
            const half = pending.ctx.buyUpgrade;
            const answer = cmd.answer || {};
            const name = answer.remove || answer.card || answer.choice || answer.value;
            // The question is closed only by a purchase that went through: a
            // bad answer keeps it open instead of swallowing the command.
            const res = this.engine.cmdBuyUpgrade(state, seat,
                Object.assign({}, half, { remove: name }));
            if (res && res.ok) Question.of(state).close();
            return res;
        }
        return FS_EFFECTS.answer(this.engine, state, seat, cmd);
    }

    schemesOf(state, seat) {
        const p = state.players[seat];
        return (p.schemes || []).filter(s => s && s.trigger && s.steps && s.steps.length);
    }

    maybeScheme(state, seat, trigger, ctx, opts) {
        // Older saves recorded both start-of-damage plans and some round-start
        // plans as `damage`. The printed timing, not a later effect that mentions
        // damage, decides which window offers those stored plans.
        const startDamage = s => s.trigger === 'damage'
            && /в начал[а-яёa-z]*\s+шага\s+нанесения (?:урон|поврежд)/i.test(s.text || '');
        const startRound = s => s.trigger === 'damage'
            && /начал[а-яёa-z]*\s+раунда (?:боя|битвы)/i.test(s.text || '');
        let schemes = this.schemesOf(state, seat).filter(s => !s.defer
            && (trigger === 'damage-start' ? s.trigger === trigger || startDamage(s)
                : trigger === 'round' ? s.trigger === trigger || startRound(s)
                    : s.trigger === trigger && (trigger !== 'damage' || (!startDamage(s) && !startRound(s)))));
        // «Отрава Нургла» says «instead of revealing an order»: it is not one
        // of the schemes of the START of the operations phase, and lasts only
        // for the turn on which it was offered.
        if (trigger === 'operations') {
            schemes = opts && opts.instead
                ? schemes.filter(s => s.insteadOfOrder)
                : schemes.filter(s => !s.insteadOfOrder);
        }
        // «В начале последнего раунда битвы вы можете сбросить эту карту»
        // («Несокрушимая вера»): only the last round opens that window.
        if (trigger === 'round') {
            const last = !!(state.combat && CombatTurn.of(state.combat).lastRound);
            schemes = schemes.filter(s => last || !(s.lastRound || /начал[а-яёa-z]*\s+последнего\s+раунда/i.test(s.text || '')));
        }
        // «Прикосновение варпа» names the advance order in its trigger.
        if ((trigger === 'order' || trigger === 'order-end') && state.order) {
            schemes = schemes.filter(s => !s.orderType || s.orderType === OrderContext.of(state.order).kind);
        }
        // «Ракета Death Strike» can be discarded at the start of a combat in
        // any WORLD, not in a void. Keep this check on the trigger so neither
        // attacker nor defender is offered a plan they cannot actually use.
        if (trigger === 'combat-start') {
            const field = BattleField.of(state.combat);
            const sys = field && this.engine.system(state, field.system);
            const area = sys && this.engine.area(sys, field.pos);
            schemes = schemes.filter(s => !/в начале боя в любом мире/i.test(s.text || '') || !!(area && area.world));
        }
        if (!schemes.length) return false;
        const c = ctx || {};
        // The card whose text the engine did not read: the player sees the text.
        const manual = schemes.find(s => s.note);
        Question.of(state).ask({
            seat, kind: 'scheme',
            question: {
                kind: 'scheme', who: seat, options: schemes.map(s => s.name),
                text: manual
                    ? manual.text + '\n(Эффект выполняется вручную: сбросьте карту, когда выполните его.)'
                    : 'Сбросить карту: ' + schemes.map(s => '«' + s.name + '»').join(', ') + '?',
            },
            ctx: { kind: c.kind || 'event', ctx: c.ctx || null, schemes },
        });
        return true;
    }

}
