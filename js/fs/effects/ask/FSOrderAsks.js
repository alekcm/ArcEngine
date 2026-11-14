// FSOrderAsks.js — вопросы шага: свойства приказа и карты.
//
// Одна группа веток бывшего switch в FS_EFFECTS.step(), который решает,
// ЧТО шаг спросит у игрока. Тело каждого шага перенесено дословно;
// окружение — параметр effects и рамка шага f (FSStepContext).

class OrderAsks {
    static ops = ['reorderOwnOrder', 'corsairStrike', 'emptyStrategize', 'occupiedStructure', 'advanceFromPlan', 'klBonus', 'extraFactory', 'orderDiscount', 'purchaseDiscount', 'prepReroll', 'assetLimit', 'healthBonus', 'enemyHealth', 'citiesAsFactories', 'bastionsAsFactories', 'extraOrderTokens', 'extraCombatCards', 'moveLimit', 'mustInclude', 'retreatExcess', 'uncontrolledMarch', 'passVoid', 'freeStructure', 'structureFirst', 'capacityBonus', 'cheapUnit', 'upgradeLimit', 'costDiscount', 'supplyDeal', 'deployInFactoryWorld', 'shipsThroughStorms', 'deployLimit', 'orderKl', 'putOrderTokensOnDeck', 'strategizeDeckBonus', 'unitsThroughStorms', 'restoreRetreated', 'restoreFallen', 'resurrect', 'stormReaction', 'noRoute', 'extraMoveWays', 'passPlanningTurn', 'battleAsset', 'resolveAsOrder', 'unitDiscount'];

    // «Вместо размещения жетона приказа во время Фазы Планирования вы можете
    // сбросить эту карту» («Видения Комморры»): one placement of the player is
    // let go — now, when the turn is his, or when the circle reaches him.
    static passPlanningTurn(effects, f) {
        const { R, state, seat, p } = f;
        const game = GamePhase.of(state);
        if (!game.is(GamePhase.PLANNING)) return null;
        if (game.isTurn(seat) && typeof R.nextPlanner === 'function') {
            R.log(state, seat, p.name + ' пропускает размещение жетона приказа.');
            game.turn = R.nextPlanner(state, seat);
            return null;
        }
        p.planningPass = true;
        R.log(state, seat, p.name + ' пропустит размещение жетона приказа, когда дойдёт его очередь.');
        return null;
    }

    // «… вы можете переместить отряды в активную систему из одной
    // дополнительной соседней с ней системы» («Генератор теневого поля»).
    static extraMoveWays(effects, f) {
        const { R, state, seat, step, p } = f;
        if (!state.order || !OrderContext.of(state.order).isSeat(seat)) return null;
        OrderMove.of(state.order).addExtraWays(step.n || 1);
        R.log(state, seat, p.name + ': отряды могут прийти ещё из ' + (step.n || 1) + ' соседней системы.');
        return null;
    }

    static reorderOwnOrder(effects, f) {
        const { state, seat } = f;
        const options = [];
        for (const sys of state.systems) {
            (sys.tokens || []).forEach((token, index) => {
                if (token.seat === seat) options.push({ system: sys.id, index,
                    text: 'Система ' + sys.tile + ' · позиция ' + (index + 1) + ' снизу' });
            });
        }
        if (!options.length) return null;
        return { question: { kind: 'choice', who: seat, op: 'reorderOwnOrder', options,
            text: 'Какой ваш жетон в стеке посмотреть?' } };
    }

    static corsairStrike(effects, f) {
        if (f.state.order && PhasePlan.of(f.state.order).is('corsair'))
            PhasePlan.of(f.state.order).set('strike');
        return null;
    }

    static emptyStrategize(effects, f) {
        const deal = OrderDeal.of(f.state.order);
        if (deal) deal.allowEmptyStrategize();
        return null;
    }

    static occupiedStructure(effects, f) {
        const deal = OrderDeal.of(f.state.order);
        if (deal) deal.allowOccupiedStructure();
        return null;
    }

    static klBonus(effects, f) {
        const { R, state, seat, step, ctx, p } = f;
        if (!state.order) return null;
        const n = step.per ? effects.count(R, state, seat, step, ctx) : (step.n || 1);
        if (n <= 0) return null;
        OrderFight.of(state.order).addKlBonus(n);
        R.log(state, seat, p.name + ' повышает командный уровень на ' + n + '.');
        return null;
    }

    static extraFactory(effects, f) {
        const { state, step } = f;
        const limits = DeployLimits.of(state.order);
        if (limits) limits.addExtraFactories(step.n || 0);
        return null;
    }

    static orderDiscount(effects, f) {
        const { R, state, seat, step } = f;
        if (state.order) {
            // The discount may be counted: "1 for every cultist".
            const count = step.per && R.countFor ? R.countFor(state, seat, step.per) : 1;
            OrderDeal.of(state.order).addUnitDiscount((step.n || 0) * count);
        }
        return null;
    }

    static purchaseDiscount(effects, f) {
        const { R, state, seat, step } = f;
        // «уменьшить общую цену всех покупок (включая здания) на 1»
        // («Главный по машинам»): the discount of the order covers the
        // units and the structures, not the units alone.
        const deal = OrderDeal.of(state.order);
        if (deal) {
            const now = deal.discountAfter(step.n || 0);
            deal.addPurchaseDiscount(step.n || 0);
            R.log(state, seat, state.players[seat].name + ': покупки приказа дешевле на '
                + now + '.');
        }
        return null;
    }

    static prepReroll(effects, f) {
        const { state, seat, step, combat } = f;
        // «После вытягивания карт на этапе подготовки в битве, которую вы
        // инициировали этим приказом, перебросьте 1 кубик за каждого
        // юнита в оспариваемой области» («Сервочерепа-стражи»): the
        // combat asks for the reroll once the hands are dealt.
        const fight = OrderFight.of(state.order);
        if (fight && OrderContext.of(state.order).isSeat(seat)) fight.setPrepReroll(step);
        return null;
    }

    static assetLimit(effects, f) {
        const { step, p } = f;
        p.assetLimit = Math.max(p.assetLimit || 3, step.n || 3);
        return null;
    }

    static healthBonus(effects, f) {
        const { seat, step, combat } = f;
        // «во время этой битвы» — the bonus lives to the end of the combat, not
        // to the end of the round the card was played in («Серебряная броня»).
        if (combat) CombatDamage.of(combat).addHealthBonus(seat, step.n || 0, !!step.combat);
        return null;
    }

    static enemyHealth(effects, f) {
        const { state, seat, step, combat } = f;
        if (combat) CombatDamage.of(combat).setEnemyHealth(seat, step.n || 3);
        // «Во время этого орбитального удара здоровье отрядов вашего
        // противника уменьшается до 3» («Вирусные бомбы»).
        else if (state.order && OrderContext.of(state.order).isSeat(seat)) StrikePlan.of(state.order).setEnemyHealth(step.n || 3);
        return null;
    }

    static citiesAsFactories(effects, f) {
        const { state, step } = f;
        const limits = DeployLimits.of(state.order);
        if (limits) limits.setCitiesAsFactories(step.only);
        return null;
    }

    static bastionsAsFactories(effects, f) {
        const { state } = f;
        const limits = DeployLimits.of(state.order);
        if (limits) limits.setBastionsAsFactories();
        return null;
    }

    // «… в любой системе, содержащей не менее 2-х ваших отрядов» («Вперёд!»).
    static advanceFromPlan(effects, f) {
        const { R, state, seat, step } = f;
        const need = step.minUnits === undefined ? 2 : step.minUnits;
        const seen = new Map();
        for (const u of state.units) {
            if (u.seat !== seat) continue;
            seen.set(u.system, (seen.get(u.system) || 0) + 1);
        }
        const options = [...seen.entries()].filter(([, n]) => n >= need).map(([id]) => id);
        if (!options.length) {
            R.log(state, seat, state.players[seat].name + ': нет системы с ' + need + ' отрядами для «Вперёд!».');
            return null;
        }
        return { question: { kind: 'systems', who: seat, op: 'advanceFromPlan', options,
            text: 'В какой системе выполнить продвижение?' } };
    }

    // «Вы можете выполнить этот приказ, как если бы он был любым другим
    // (развертывание, доминирование, продвижение) после того, как вы его
    // раскрыли» («Зеленая волна»): the revealed strategize order turns into the
    // order the player names — before anything was bought with it.
    static resolveAsOrder(effects, f) {
        const { R, state, seat, step, p } = f;
        const order = state.order;
        const context = OrderContext.of(order);
        if (!context || !context.isSeat(seat) || !context.isKind('strategize')) return null;
        const upgrades = UpgradeOrder.of(order);
        if (upgrades && (upgrades.combat || upgrades.orderCard)) {
            R.log(state, seat, p.name + ': улучшение уже куплено этим приказом — приказ остаётся планированием.');
            return null;
        }
        const kinds = (step.kinds || ['deploy', 'dominate', 'advance']).slice();
        if (!kinds.length) return null;
        const options = kinds.map(k => (R.orderName ? R.orderName(k) : k) + ' (как этот приказ)');
        return { question: { kind: 'choice', who: seat, op: 'resolveAsOrder', options, kinds,
            text: 'Каким приказом выполнить этот приказ планирования?' } };
    }

    // «уменьшить его стоимость в материалах на 1 за каждый ваш жетон
    // подкреплений» («Варбосс»): the discount of ONE purchase — the unit the
    // player is buying when he discards the card (DeployRules.cmdBuyUnit offers
    // the plan and goes on with the purchase after it).
    static unitDiscount(effects, f) {
        const { R, state, seat, step, p } = f;
        if (!state.order) return null;
        const count = step.per && R.countFor ? R.countFor(state, seat, step.per) : 1;
        const n = (step.n || 0) * count;
        OrderDeal.of(state.order).setNextUnitDiscount(n);
        R.log(state, seat, p.name + ': следующий купленный отряд дешевле на ' + n + '.');
        return null;
    }

    static extraOrderTokens(effects, f) {
        const { R, state, seat, step, p } = f;
        p.extraOrderTokens = (p.extraOrderTokens || 0) + (step.n || 0);
        R.log(state, seat, state.players[seat].name + ' получает дополнительные жетоны приказов.');
        return null;
    }

    static extraCombatCards(effects, f) {
        const { state, step } = f;
        if (!state.order) return null;
        if (step.discard) {
            // «На этапе подготовки битвы, инициированной этим приказом,
            // вытяните 2 дополнительных карты и сбросьте затем 2 любых
            // своих карты» («Священные масла»): the cards are drawn and
            // dropped at the preparation step of that battle, not when
            // the hand is dealt.
            OrderFight.of(state.order).addPrepDraw(step.n || 0, step.discard || 0);
            return null;
        }
        OrderFight.of(state.order).addExtraCombatCards(step.n || 0);
        return null;
    }

    static moveLimit(effects, f) {
        const { state, step } = f;
        const march = MarchPlan.of(state.order);
        if (march) march.setMoveLimit(step.n || 0);
        return null;
    }

    static mustInclude(effects, f) {
        const { state, step } = f;
        const march = MarchPlan.of(state.order);
        if (march) march.setMustInclude(step.what);
        return null;
    }

    static retreatExcess(effects, f) {
        const { R, state, seat, step } = f;
        const faction = R.faction(state, seat);
        const names = effects.unitNames(step.what, faction);
        if (state.order && names.length) {
            OrderFight.of(state.order).setRetreatExcess(names[0]);
            R.log(state, seat, 'После приказа отряды «' + names[0] + '» сверх вместимости могут отступить.');
        }
        return null;
    }

    static uncontrolledMarch(effects, f) {
        const { R, state, seat, step } = f;
        // "treat the uncontrolled worlds as friendly for moving up to 2
        // of your units": the budget is spent per unit, not per area.
        const march = MarchPlan.of(state.order);
        if (march) {
            march.setUncontrolled(step.n || 0);
            // The card may be played after the roads of the step were frozen:
            // the legal paths of a simultaneous movement are drawn anew.
            R.refreshAdvanceRoutes(state, seat);
        }
        return null;
    }

    static passVoid(effects, f) {
        const { R, state, seat, step } = f;
        const move = OrderMove.of(state.order);
        if (move) {
            move.setPassVoid(step.n || 0);
            R.refreshAdvanceRoutes(state, seat);
        }
        return null;
    }

    static freeStructure(effects, f) {
        const { state, step } = f;
        const deal = OrderDeal.of(state.order);
        if (deal) deal.addFreeStructure(step.kind || 'bastion', step.n || 0);
        return null;
    }

    static structureFirst(effects, f) {
        const { state } = f;
        const deal = OrderDeal.of(state.order);
        if (deal) deal.setStructureFirst();
        return null;
    }

    static capacityBonus(effects, f) {
        const { state, step } = f;
        // «Дополнительная вместимость распространяется только на Гвардейцев» —
        // the bonus counts for them alone.
        const limits = DeployLimits.of(state.order);
        if (limits) limits.addCapacityBonus(step.n || 0, step.max, step.only);
        return null;
    }

    static cheapUnit(effects, f) {
        const { state, step } = f;
        const deal = OrderDeal.of(state.order);
        if (deal) deal.setCheapUnit(step.n || 1, step.onlyActive);
        return null;
    }

    static upgradeLimit(effects, f) {
        const { state, step } = f;
        const upgrades = UpgradeOrder.of(state.order);
        if (upgrades) upgrades.setLimit(step.n || 1);
        return null;
    }

    static costDiscount(effects, f) {
        const { R, state, seat, step, p } = f;
        const kind = step.per;
        const count = kind && R.countFor ? R.countFor(state, seat, kind) : 0;
        p.cardDiscount = (p.cardDiscount || 0) + (step.n || 0) * count;
        if (count) R.log(state, seat, state.players[seat].name + ': скидка ' + (step.n * count) + ' за счёт карты.');
        return null;
    }

    static supplyDeal(effects, f) {
        const { state, step } = f;
        const deal = OrderDeal.of(state.order);
        if (deal) deal.setSupplyDeal(step.n || 2, step.unit || '');
        return null;
    }

    static deployInFactoryWorld(effects, f) {
        const { state } = f;
        const limits = DeployLimits.of(state.order);
        if (limits) limits.setInFactoryWorld();
        return null;
    }

    static shipsThroughStorms(effects, f) {
        const { R, state, seat } = f;
        const move = OrderMove.of(state.order);
        if (move) {
            move.setShipsThroughStorms();
            R.refreshAdvanceRoutes(state, seat);
        }
        return null;
    }

    // «Получите 1 жетон подкреплений, если используете этот приказ для
    // совершения битвы в системе, где у вас нет дружественных миров»
    // («Крестовый поход»): the token belongs to the battle of the order. A
    // battle already under way takes it now; otherwise the order remembers it
    // for the battle it starts.
    static battleAsset(effects, f) {
        const { R, state, seat, step, p } = f;
        if (!state.order || !OrderContext.of(state.order).isSeat(seat)) return null;
        const reward = { kind: step.kind || 'reinforcement', n: step.n || 1, noFriendlyWorlds: !!step.noFriendlyWorlds };
        const combat = state.combat;
        const active = OrderContext.of(state.order).system;
        if (combat && !combat.effectInitiated && CombatSides.seatOf(combat, 'attacker') === seat
            && BattleField.of(combat).system === active && typeof R.grantBattleAsset === 'function') {
            R.grantBattleAsset(state, seat, reward);
            return null;
        }
        OrderTally.of(state.order).setBattleAsset(reward);
        R.log(state, seat, p.name + ': жетон ждёт битвы этого приказа.');
        return null;
    }

    static deployLimit(effects, f) {
        const { R, state, seat, step, p } = f;
        const limits = DeployLimits.of(state.order);
        if (!limits) return null;
        let n = step.n || 0;
        // «Ваш лимит развертывания при этом уменьшается на 1 за каждый ваш
        // бастион в активной системе» («Миры призыва»).
        if (step.per === 'bastionActive') {
            const active = OrderContext.of(state.order).system;
            const bastions = (state.structures || []).filter(s => s.seat === seat
                && s.type === 'bastion' && s.system === active).length;
            n *= bastions;
            if (bastions) R.log(state, seat, p.name + ': лимит развертывания ' + (n < 0 ? '' : '+') + n
                + ' (бастионов в активной системе: ' + bastions + ').');
        }
        limits.addLimitBonus(n);
        return null;
    }

    static orderKl(effects, f) {
        const { state, step } = f;
        // The command level of the player is higher while the order runs.
        const fight = OrderFight.of(state.order);
        if (fight) fight.addKlBonus(step.n || 0);
        return null;
    }

    static putOrderTokensOnDeck(effects, f) {
        const { R, state, seat, step, p } = f;
        const free = typeof R.usedOrderTokens === 'function'
            ? R.usedOrderTokens(state, seat) : 0;
        const got = Math.min(step.n || 1, Math.max(0, free));
        p.eventTokens = (p.eventTokens || 0) + got;
        R.log(state, seat, p.name + ' кладёт ' + got
            + ' жетон(ов) приказа на колоду событий.');
        step.done = !!got;
        return null;
    }

    static strategizeDeckBonus(effects, f) {
        const { state, seat, step } = f;
        if (state.order && OrderContext.of(state.order).isSeat(seat)) {
            OrderTally.of(state.order).addChaosDeckBonus(step.n || 1);
        }
        return null;
    }

    static unitsThroughStorms(effects, f) {
        const { R, state, seat } = f;
        const move = OrderMove.of(state.order);
        if (move && OrderContext.of(state.order).isSeat(seat)) {
            move.setUnitsThroughStorms();
            R.refreshAdvanceRoutes(state, seat);
        }
        return null;
    }

    static restoreRetreated(effects, f) {
        const { R, state, seat, step, combat, inCombat, p } = f;
        if (!inCombat) return null;
        const id = CombatHooks.of(combat).lastRetreat;
        const u = state.units.find(x => x.id === id && x.seat === seat);
        if (u) {
            R.restoreUnit(state, u);
            R.log(state, seat, p.name + ': отступивший отряд восстановлен.');
            step.done = true;
        }
        return null;
    }

    static restoreFallen(effects, f) {
        const { R, state, seat, step, combat, inCombat, p } = f;
        if (!inCombat) return null;
        CombatPlans.of(combat).addRestoreFallen(seat, step.maxKl === undefined ? 0 : step.maxKl);
        R.log(state, seat, p.name + ': «Уклонение» ждёт конца шага урона.');
        return null;
    }

    static resurrect(effects, f) {
        const { seat, step, combat, inCombat } = f;
        if (!inCombat) return null;
        // The card stays in play until a unit of the command level falls:
        // the combat asks about it after the damage step.
        CombatPlans.of(combat).addResurrectPlan(seat, step.maxKl === undefined ? 1 : step.maxKl);
        step.done = true;
        return null;
    }

    static stormReaction(effects, f) {
        const { R, state, seat, step, ctx, target } = f;
        const info = ctx && ctx.ctx && ctx.ctx.stormReaction;
        if (!info) return null;
        const storm = state.storms.find(x => x.id === info.storm);
        if (!storm) return null;
        const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'].filter(dir => {
            const target = R.stormTarget(state, storm, dir);
            if (!target) return false;
            const key = R.gridKey(R.stormEdge(state, target));
            return !state.storms.some(x => x !== storm
                && R.gridKey(R.stormEdge(state, x)) === key);
        });
        if (!dirs.length) {
            if (typeof R.finishStormReaction === 'function') {
                R.finishStormReaction(state, info, null);
            }
            return null;
        }
        step.dirs = dirs;
        return { question: { kind: 'choice', who: seat, op: 'stormReaction',
            options: dirs, text: 'В каком из 8 направлений переместить варп-шторм?' } };
    }

    static noRoute(effects, f) {
        const { seat, step, combat, inCombat, foe } = f;
        if (!inCombat) return null;
        // «в этом раунде боя» — the immunity of the card lives while the
        // round does.
        CombatDamage.of(combat).setNoRoute(step.who === 'foe' ? foe : seat, step.kl, CombatTurn.of(combat).round);
        return null;
    }
}
