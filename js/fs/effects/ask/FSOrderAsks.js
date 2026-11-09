// FSOrderAsks.js — вопросы шага: свойства приказа и карты.
//
// Одна группа веток бывшего switch в FS_EFFECTS.step(), который решает,
// ЧТО шаг спросит у игрока. Тело каждого шага перенесено дословно;
// окружение — параметр effects и рамка шага f (FSStepContext).

class OrderAsks {
    static ops = ['klBonus', 'extraFactory', 'orderDiscount', 'purchaseDiscount', 'prepReroll', 'assetLimit', 'healthBonus', 'enemyHealth', 'citiesAsFactories', 'bastionsAsFactories', 'extraOrderTokens', 'extraCombatCards', 'moveLimit', 'mustInclude', 'retreatExcess', 'uncontrolledMarch', 'passVoid', 'freeStructure', 'structureFirst', 'capacityBonus', 'cheapUnit', 'upgradeLimit', 'costDiscount', 'supplyDeal', 'deployInFactoryWorld', 'shipsThroughStorms', 'deployLimit', 'orderKl', 'putOrderTokensOnDeck', 'strategizeDeckBonus', 'unitsThroughStorms', 'restoreRetreated', 'restoreFallen', 'resurrect', 'stormReaction', 'noRoute'];

    static klBonus(effects, f) {
        const { R, state, seat, step, ctx, p } = f;
        if (!state.order) return null;
        const n = step.per ? effects.count(R, state, seat, step, ctx) : (step.n || 1);
        if (n <= 0) return null;
        state.order.klBonus = (state.order.klBonus || 0) + n;
        R.log(state, seat, p.name + ' повышает командный уровень на ' + n + '.');
        return null;
    }

    static extraFactory(effects, f) {
        const { state, step } = f;
        if (state.order) state.order.extraFactories = (state.order.extraFactories || 0) + (step.n || 0);
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
        if (state.order && state.order.seat === seat) {
            state.order.prepReroll = {
                n: step.n || 1, per: step.per || null, kind: step.kind || 'any',
                inBattle: !!step.inBattle, ability: step.ability,
            };
        }
        return null;
    }

    static assetLimit(effects, f) {
        const { step, p } = f;
        p.assetLimit = Math.max(p.assetLimit || 3, step.n || 3);
        return null;
    }

    static healthBonus(effects, f) {
        const { step, combat } = f;
        if (combat) combat.healthBonus = (combat.healthBonus || 0) + (step.n || 0);
        return null;
    }

    static enemyHealth(effects, f) {
        const { state, seat, step, combat } = f;
        if (combat) combat.enemyHealth = step.n || 3;
        // «Во время этого орбитального удара здоровье отрядов вашего
        // противника уменьшается до 3» («Вирусные бомбы»).
        else if (state.order && state.order.seat === seat) StrikePlan.of(state.order).setEnemyHealth(step.n || 3);
        return null;
    }

    static citiesAsFactories(effects, f) {
        const { state, step } = f;
        if (state.order) {
            state.order.citiesAsFactories = true;
            if (step.only) state.order.factoryOnly = step.only;
        }
        return null;
    }

    static bastionsAsFactories(effects, f) {
        const { state } = f;
        if (state.order) state.order.bastionsAsFactories = true;
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
            const prep = state.order.prepDrawCards
                || (state.order.prepDrawCards = { n: 0, discard: 0 });
            prep.n += step.n || 0;
            prep.discard += step.discard || 0;
            return null;
        }
        state.order.extraCombatCards = (state.order.extraCombatCards || 0) + (step.n || 0);
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
            state.order.retreatExcessUnits = names[0];
            R.log(state, seat, 'После приказа отряды «' + names[0] + '» сверх вместимости могут отступить.');
        }
        return null;
    }

    static uncontrolledMarch(effects, f) {
        const { state, step } = f;
        // "treat the uncontrolled worlds as friendly for moving up to 2
        // of your units": the budget is spent per unit, not per area.
        const march = MarchPlan.of(state.order);
        if (march) march.setUncontrolled(step.n || 0);
        return null;
    }

    static passVoid(effects, f) {
        const { state, step } = f;
        if (state.order) state.order.passVoid = step.n || 0;
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
        if (state.order) {
            state.order.capacityBonus = (state.order.capacityBonus || 0) + (step.n || 0);
            if (step.max) state.order.capacityMax = step.max;
            // «Дополнительная вместимость распространяется только на
            // Гвардейцев» — the bonus counts for them alone.
            if (step.only) state.order.capacityBonusOnly = step.only;
        }
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
        if (state.order) state.order.supplyDeal = { n: step.n || 2, unit: step.unit || '' };
        return null;
    }

    static deployInFactoryWorld(effects, f) {
        const { state } = f;
        if (state.order) state.order.deployInFactoryWorld = true;
        return null;
    }

    static shipsThroughStorms(effects, f) {
        const { state } = f;
        if (state.order) state.order.shipsThroughStorms = true;
        return null;
    }

    static deployLimit(effects, f) {
        const { state, step } = f;
        if (state.order) state.order.deployLimitBonus = (state.order.deployLimitBonus || 0) + (step.n || 0);
        return null;
    }

    static orderKl(effects, f) {
        const { state, step } = f;
        // The command level of the player is higher while the order runs.
        if (state.order) state.order.klBonus = (state.order.klBonus || 0) + (step.n || 0);
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
        if (state.order && state.order.seat === seat) {
            state.order.chaosDeckBonus = (state.order.chaosDeckBonus || 0) + (step.n || 1);
        }
        return null;
    }

    static unitsThroughStorms(effects, f) {
        const { state, seat } = f;
        if (state.order && state.order.seat === seat) state.order.unitsThroughStorms = true;
        return null;
    }

    static restoreRetreated(effects, f) {
        const { R, state, seat, step, combat, inCombat, p } = f;
        if (!inCombat) return null;
        const id = combat.lastRetreat;
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
        combat.restoreFallen = combat.restoreFallen || [];
        combat.restoreFallen.push({
            seat, round: combat.round,
            maxKl: step.maxKl === undefined ? 0 : step.maxKl,
            asked: false, done: false,
        });
        R.log(state, seat, p.name + ': «Уклонение» ждёт конца шага урона.');
        return null;
    }

    static resurrect(effects, f) {
        const { seat, step, combat, inCombat } = f;
        if (!inCombat) return null;
        // The card stays in play until a unit of the command level falls:
        // the combat asks about it after the damage step.
        combat.resurrectPlan = combat.resurrectPlan || [];
        combat.resurrectPlan.push({ seat, round: combat.round, maxKl: step.maxKl === undefined ? 1 : step.maxKl });
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
        combat.noRoute = combat.noRoute || [];
        // «в этом раунде боя» — the immunity of the card lives while the
        // round does.
        combat.noRoute.push({
            seat: step.who === 'foe' ? foe : seat,
            round: combat.round,
            kl: step.kl,
        });
        return null;
    }
}
