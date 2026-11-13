// FSRulesDeploy.js — the deploy order: the units, the one structure, the
// deferred payments and the capacity trim after the order.

class DeployRules {
    /** @param {any} engine the rules facade (FSRules.js) */
    constructor(engine) {
        this.engine = engine;
    }

    /**
     * «A player's deploy limit is equal to the combined unit capacity from all
     * friendly worlds in the active system that contain a factory.» The one
     * number the rule, the purchase, the panel and the card all read.
     *
     * The order being resolved may change what counts as a factory (cities,
     * bastions, the one factory of «Массовое Производство») and may add to the
     * limit (the orders «Главный по машинам», «Миры призыва»).
     * @param {any} state @param {number} seat @param {string} systemId
     */
    deployLimit(state, seat, systemId) {
        const sys = this.engine.system(state, systemId);
        if (!sys) return 0;
        // The cards of an order change the limit only while that order runs.
        const order = this.engine.orderOf(state, seat);
        // «Массовое Производство»: the ability is ONE factory working — the
        // capacity of its own world, doubled factories do not count.
        const scope = DeployScope.of(order);
        if (order && PhasePlan.of(order).is('guardDeploy') && scope.factory) {
            return Math.max(0, this.engine.capacity(state, scope.factory.system, scope.factory.pos));
        }
        let limit = 0;
        for (const area of sys.areas) {
            if (this.engine.control(state, seat, systemId, area.pos) !== 'friendly') continue;
            if (!this.deployWorlds(state, seat, systemId, area.pos).length) continue;
            // Two factories on one world double the capacity of that world for the
            // deploy limit (the rules, "Factories").
            const factories = this.deployWorlds(state, seat, systemId, area.pos).filter(s => s.type === 'factory').length;
            limit += this.engine.capacity(state, systemId, area.pos) * Math.max(1, factories);
        }
        // The order may lower the limit or add to it.
        const limits = DeployLimits.of(order);
        if (limits) limit += limits.limitBonus + limits.extraFactories;
        return Math.max(0, limit);
    }

    /**
     * The structures of the player in one area that a Deploy Order may count as
     * a factory: the real factories, and the cities and bastions while the card
     * of the order says so. One place names them — the limit and the panel ask.
     * @param {any} state @param {number} seat @param {string} systemId @param {string} pos
     */
    deployWorlds(state, seat, systemId, pos) {
        const limits = DeployLimits.of(this.engine.orderOf(state, seat));
        const asFactories = !!limits && limits.cities;
        const bastions = !!limits && limits.bastions;
        return this.engine.structuresAt(state, systemId, pos).filter(s => s.seat === seat
            && (s.type === 'factory' || (asFactories && s.type === 'city') || (bastions && s.type === 'bastion')));
    }

    /**
     * «… may treat all of his cities in the active system as factories»: the
     * order says so to every reader of the deploy rule. A card that only lets
     * the cities be BUILT on is not this permission.
     * @param {any} state @param {number} seat
     */
    deployTreatsAsFactories(state, seat) {
        const limits = DeployLimits.of(this.engine.orderOf(state, seat));
        return !!limits && limits.treatsAsFactories;
    }

    /**
     * May this player buy units at all this order? The same worlds the limit is
     * counted from: a factory — or what the card of the order lets stand in for
     * one. The purchase asks this, the panel asks this, the limit counts them.
     */
    hasFactory(state, seat, systemId) {
        const sys = this.engine.system(state, systemId);
        if (!sys) return false;
        return sys.areas.some(a => this.deployWorlds(state, seat, systemId, a.pos).length > 0);
    }

    /** The printed forge cost and the optional token that lowers command level. */
    effectUnitForgeCost(state, seat, def, bypassCommandLevel) {
        const level = this.engine.commandLevel(state, seat);
        const above = bypassCommandLevel ? 0 : Math.max(0, (def.kl || 0) - level);
        if (above > 1) return null;
        const cost = (def.forge ? 1 : 0) + above;
        return this.engine.player(state, seat).assetCount('forge') >= cost ? cost : null;
    }

    canPlaceUnit(state, seat, systemId, pos, def) {
        const sys = this.engine.system(state, systemId);
        const area = this.engine.area(sys, pos);
        if (!area) return { ok: false, error: 'Нет такой области.' };
        // The ships stand in the voids, the ground units on the worlds.
        if (def.type === 'ship' && area.world) return { ok: false, error: 'Корабль может стоять только в пустоте.' };
        if (def.type === 'ground' && !area.world) return { ok: false, error: 'Наземный отряд не может стоять в пустоте.' };
        // The capacity of an area is checked after the order, not at placement:
        // the deploy may exceed capacity (01-rules-reference.md), the destroy
        // happens in the trim window once the order resolves.
        // Only the friendly and the uncontrolled areas.
        const theirs = state.units.some(u => u.system === systemId && u.area === pos && u.seat !== seat)
            || state.structures.some(st => st.seat !== seat && st.system === systemId && st.area === pos);
        if (theirs) return { ok: false, error: 'Нельзя развёртывать в чужую область.' };
        // The five-unit restriction applies to Advance movement, not Deploy
        // or placement. Excess over the printed capacity is resolved afterwards.
        return { ok: true };
    }

    /**
     * The one question about a structure on a world: «A world cannot contain
     * more than one structure unless a card or faction ability specifically
     * states otherwise.» Every path that puts a structure on the table asks it —
     * the Deploy Order, a card of an event, «Эвакуация», the setup of the
     * initial forces — and the permission of the card is the argument, not a
     * second copy of the rule.
     * @param {any} state @param {number} seat @param {string} systemId @param {string} pos
     * @param {any} [opts] { allowOccupied: 'otherType', kind, ignoreControl }
     */
    canPlaceStructure(state, seat, systemId, pos, opts) {
        const o = opts || {};
        const sys = this.engine.system(state, systemId);
        const area = this.engine.area(sys, pos);
        if (!area || !area.world) return { ok: false, error: 'Постройка ставится только на мир.' };
        if (!o.ignoreControl && this.engine.control(state, seat, systemId, pos) !== 'friendly') {
            return { ok: false, error: 'Мир должен быть вашим.' };
        }
        const there = this.engine.structuresAt(state, systemId, pos) || [];
        if (!there.length) return { ok: true };
        // The card that says otherwise: «…в дружественном мире, где уже есть 1
        // ваша постройка другого типа» — exactly one of his, of another kind.
        if (o.allowOccupied === 'otherType') {
            const mine = there.filter(x => x.seat === seat);
            const other = there.length === 1 && mine.length === 1 && mine[0].type !== o.kind;
            if (other) return { ok: true };
            return { ok: false, error: 'Там нужна одна ваша постройка другого типа.' };
        }
        if (o.allowOccupied) return { ok: true };
        return { ok: false, error: 'На мире уже есть постройка.' };
    }

    deployStep(order) {
        return order && PhasePlan.of(order).is('structures') ? 'structures' : 'units';
    }

    spentOf(order) {
        const purchases = Purchases.of(order);
        return purchases ? OrderDeal.of(order).totalAfterDiscount(purchases.spent) : 0;
    }

    /**
     * The purchases of the order are ONE list: what the order has already
     * bought is read from it, never counted in a second place. The deploy limit
     * counts the units of the list, the double structure is a unit of the same
     * list, and the faction deal counts its pairs there too — an undo takes a
     * record away and the count follows.
     * @param {any} order @param {string} [kind] 'unit' | 'structure'
     */
    purchasesOf(order, kind) {
        const purchases = Purchases.of(order);
        return purchases ? purchases.of(kind) : [];
    }

    /** «The deploy limit» counts the units bought by this order. */
    unitsBought(order) {
        return this.purchasesOf(order, 'unit').length;
    }

    /** «A player cannot purchase more than one structure while resolving a single Deploy Order.» */
    structureBought(order) {
        return this.purchasesOf(order, 'structure').length > 0;
    }

    /** The units of «2 Гвардейца за 1 жетон запасов»: the price of the pair. */
    dealBought(order) {
        return this.purchasesOf(order, 'unit').filter(x => x.deal).length;
    }

    /**
     * What one unit costs this order: the printed price less the discounts of the
     * order and of the player's cards, or one materiel when a card sells the unit
     * for that («потратить 1 материал, чтобы разместить 1 отряд»). The panel shows
     * the same number the purchase will charge — the reasons of a discount live
     * here, not in the panel.
     * opts: { cache } — a cache token pays two less; { pairMate } — the pair of
     * the faction deal is paid by a cache token in full; { cheap } — the card.
     */
    unitPrice(state, seat, def, opts) {
        const order = state.order || {};
        const p = state.players[seat] || {};
        const o = opts || {};
        const deal = OrderDeal.of(order);
        let cost = o.cheap ? 1 : (def.cost || 0);
        if (!o.cheap && deal.unitDiscount) cost = Math.max(0, cost - deal.unitDiscount);
        if (o.pairMate) cost = 0;
        if (o.cache) cost = Math.max(0, cost - FS_RULES_CONFIG.CACHE_VALUE);
        // The order may sell a unit of command level 0 for 1 materiel.
        if (deal.cheapPrice && def.kl === 0) cost = Math.min(cost, deal.cheapPrice);
        if (p.cardDiscount) cost = Math.max(0, cost - p.cardDiscount);
        return o.raw ? cost : deal.marginalPrice(cost);
    }

    /** What one structure costs this order: the printed price less a cache token and the discounts. */
    structurePrice(state, seat, type, opts) {
        const order = state.order || {};
        const o = opts || {};
        const deal = OrderDeal.of(order);
        const stats = this.engine.structureStats(type);
        const cost = Math.max(0, (stats.cost || 0) - (o.cache ? FS_RULES_CONFIG.CACHE_VALUE : 0));
        return o.raw ? cost : deal.marginalPrice(cost);
    }

    cmdBuyUnit(state, seat, cmd) {
        const order = state.order;
        const scope = DeployScope.of(order);
        const isGuard = !!order && PhasePlan.of(order).is('guardDeploy') && !!scope.factory;
        if (!order || (!OrderContext.of(order).isKind('deploy') && !isGuard) || !OrderContext.of(order).isSeat(seat)) {
            return { ok: false, error: 'Сейчас нельзя покупать отряды.' };
        }
        // The units are bought only in the first step of the order.
        if (!isGuard && this.deployStep(order) !== 'units') return { ok: false, error: 'Отряды покупаются до постройки.' };
        // The units are bought only in the active system and only with a factory in it —
        // the ability produces only into the chosen factory's world.
        if (cmd.system !== OrderContext.of(order).system) return { ok: false, error: 'Отряды покупаются в активной системе.' };
        const def = this.engine.unitDef(state, seat, cmd.unit);
        if (!def) return { ok: false, error: 'Нет такого отряда.' };
        // «Союзники Гуэ'веса»: ONE KL0 unit for 1 materiel, in a friendly or
        // uncontrolled area of the active system. The card is its own
        // permission: no factory and no deploy limit are needed for it.
        const ctrl0 = this.engine.control(state, seat, cmd.system, cmd.pos);
        const deal = OrderDeal.of(order);
        const cheap = deal.cheapOnlyActive && deal.cheapLeft
            && (def.kl || 0) === 0
            && (ctrl0 === 'friendly' || ctrl0 === 'none');
        if (!cheap) {
            if (!isGuard && !this.hasFactory(state, seat, OrderContext.of(order).system)) return { ok: false, error: 'В активной системе нет фабрики.' };
            const limit = this.deployLimit(state, seat, OrderContext.of(order).system);
            if (this.unitsBought(order) >= limit) return { ok: false, error: 'Предел развёртывания исчерпан.' };
        }
        // «Массовое Производство» производит только наземные отряды в мир фабрики — космос это другой мир.
        if (isGuard && def.type === 'ship') {
            return { ok: false, error: '«Массовое Производство» производит только наземные отряды в мир фабрики.' };
        }
        // «Купите минимум 2 отряда одного типа» — the type is locked by the first
        // purchase; the wrong kind is refused before anything else is checked.
        if (isGuard && scope.lockedType && def.id !== scope.lockedType) {
            const locked = this.engine.unitDef(state, seat, scope.lockedType);
            return { ok: false, error: 'Способность производит только один тип отрядов: «' + (locked ? locked.name : scope.lockedType) + '».' };
        }
        const p = state.players[seat];
        // The ability: the produced units stand in the producing world.
        if (isGuard) {
            if (!scope.inFactory(cmd.system, cmd.pos)) {
                return { ok: false, error: 'Отряд ставится в мир, который его производит.' };
            }
        }
        // The order may sell two Guardsmen for one supply token: the second one
        // of the pair costs one cache token instead of materiel.
        const supplyDeal = OrderDeal.of(order).isSupplyPair(def);
        // «2 Гвардейца МОГУТ быть куплены за 1 жетон запасов» (способность
        // Имперской гвардии): the pair is a permission — without a cache token
        // the second Guardsman is paid for as usual.
        /** @type {any} */
        const buyer = this.engine.player(state, seat);
        const pairMate = supplyDeal && this.dealBought(order) % 2 === 1 && buyer.assetCount('cache') > 0;
        if ((p.supply.units[def.id] || 0) <= 0) return { ok: false, error: 'Такого отряда больше нет в запасе.' };
        // A forge token lowers the command level restriction of one unit by one.
        const forgeKl = !!cmd.forgeKl;
        if (forgeKl && buyer.assetCount('forge') < 1) return { ok: false, error: 'Нужен жетон кузницы, чтобы снизить уровень командования.' };
        if (def.kl - (forgeKl ? 1 : 0) > this.engine.commandLevel(state, seat)) {
            return { ok: false, error: 'Не хватает уровня командования.' };
        }
        // The order may allow only one kind of unit — but only in the worlds
        // that are factories by the word of the card («все свои города … как
        // фабрики, на которых могут производиться только Гвардейцы»): a real
        // factory of the system keeps its whole list.
        const realFactory = this.engine.structuresAt(state, cmd.system, cmd.pos)
            .some(st => st.seat === seat && st.type === 'factory');
        const limits = DeployLimits.of(order);
        if (limits.factoryOnly && !realFactory && !FS_EFFECTS.sameName(def.name, limits.factoryOnly)) {
            return { ok: false, error: 'Этим приказом можно производить только ' + limits.factoryOnly + '.' };
        }
        // «развертывание в 1 области» («Департаменто муниторум»).
        if (!scope.allows(cmd.pos)) {
            return { ok: false, error: 'Развертывание ограничено ' + scope.areaLimit + ' областью.' };
        }
        const place = this.canPlaceUnit(state, seat, cmd.system, cmd.pos, def);
        if (!place.ok) return place;
        // «Они должны быть развернуты в мире, который их произвёл»
        // (the guard ability checks the placement right after the unit is chosen — above)
        if (limits.inFactoryWorld) {
            if (scope.factory) {
                // ground handled above; ships may stand in the void
            } else {
                const factory = this.engine.structuresAt(state, cmd.system, cmd.pos).some(st => st.seat === seat && st.type === 'factory');
                if (!factory) return { ok: false, error: 'Отряд ставится в мир с вашей фабрикой.' };
            }
        }
        let cache = cheap ? false : (!!cmd.cache && !pairMate);
        if (cheap) {
            // «потратить 1 материал, чтобы разместить 1 отряд»: the price is
            // exactly one materiel, and the permission is spent by this buy.
            deal.spendCheap();
        } else {
            // The pair of the faction deal is paid by a cache token in full.
            if (pairMate) {
                if (buyer.assetCount('cache') < 1) return { ok: false, error: 'Для «2 Гвардейца за 1 жетон запасов» нужен жетон тайника.' };
                cache = true;
            }
            if (cache && !pairMate && buyer.assetCount('cache') < 1) return { ok: false, error: 'Нет жетона тайника.' };
        }
        const cost = this.unitPrice(state, seat, def, { cache, pairMate, cheap });
        const rawCost = this.unitPrice(state, seat, def, { cache, pairMate, cheap, raw: true });
        if (def.forge && buyer.assetCount('forge') < (forgeKl ? 1 : 0) + 1) return { ok: false, error: 'Нужен жетон кузницы.' };
        if (this.spentOf(order) + cost > p.materiel) return { ok: false, error: 'Не хватает материи.' };
        // The tokens are paid at once, the materiel — at the end of the order.
        if (def.forge) buyer.payAsset('forge', 1);
        if (forgeKl) buyer.payAsset('forge', 1);
        if (cache) buyer.payAsset('cache', 1);
        p.supply.units[def.id]--;
        const unit = this.engine.addUnit(state, seat, def.id, cmd.system, cmd.pos);
        scope.use(cmd.pos);
        if (isGuard) scope.lockType(def.id);
        this.engine.log(state, seat, p.name + ' купил отряд «' + def.name + '».');
        // `deal` here is the FLAG of the faction pair — not the OrderDeal
        // object: в объект вложен сам приказ, и запись покупки попадала в него
        // же. Состояние перестаёт быть сериализуемым, и сервер падал на
        // JSON.stringify («Converting circular structure to JSON») при первой
        // же покупке пары, а с ней — на любой команде, включая «закончить».
        Purchases.of(order).add({
            kind: 'unit', id: unit.id, def: def.id, name: def.name, cost: rawCost,
            forge: !!def.forge, forgeKl, cache, deal: !!supplyDeal,
        });
        return { ok: true };
    }

    cmdBuyStructure(state, seat, cmd) {
        const order = this.engine.orderOf(state, seat, 'deploy');
        if (!order) return { ok: false, error: 'Сейчас нельзя покупать постройки.' };
        // The structure is bought after the units — the card of the Orks
        // ("Строй быстрее!") allows the other way round.
        if (this.deployStep(order) !== 'structures' && !OrderDeal.of(order).structureFirst) {
            return { ok: false, error: 'Сначала отряды: постройка покупается в конце приказа.' };
        }
        if (this.structureBought(order)) return { ok: false, error: 'За один приказ можно построить только одну постройку.' };
        // cmd.type is the command itself — the kind of the structure is cmd.structure.
        const type = cmd.structure || (cmd.kind && cmd.kind !== 'buyStructure' ? cmd.kind : '');
        if (!['city', 'factory', 'bastion'].includes(type)) return { ok: false, error: 'Неизвестная постройка.' };
        // The structure stands in the active system.
        if (cmd.system !== OrderContext.of(order).system) return { ok: false, error: 'Постройка ставится в активной системе.' };
        const p = state.players[seat];
        const can = this.engine.canTakeStructure(state, seat, type);
        if (!can.ok) return can;
        // The order may give a structure for free.
        const free = OrderDeal.of(order).isFree(type);
        // One cache token lowers the cost of one structure by two materiel.
        const cache = !!cmd.cache;
        /** @type {any} */
        const builder = this.engine.player(state, seat);
        if (cache && builder.assetCount('cache') < 1) return { ok: false, error: 'Нет жетона тайника.' };
        const cost = free ? 0 : this.structurePrice(state, seat, type, { cache });
        const rawCost = free ? 0 : this.structurePrice(state, seat, type, { cache, raw: true });
        if (this.spentOf(order) + cost > p.materiel) return { ok: false, error: 'Не хватает материи.' };
        const place = this.canPlaceStructure(state, seat, cmd.system, cmd.pos, {
            allowOccupied: OrderDeal.of(order).occupiedStructure ? 'otherType' : false,
            kind: type,
        });
        if (!place.ok) return place;
        if (cache) builder.payAsset('cache', 1);
        const structure = this.engine.addStructure(state, seat, type, cmd.system, cmd.pos);
        this.engine.log(state, seat, p.name + ' построил: ' + this.engine.structureName(type) + '.');
        Purchases.of(order).add({ kind: 'structure', id: structure.id, type, name: this.engine.structureName(type), cost: rawCost, cache });
        return { ok: true };
    }

    cmdUndoPurchase(state, seat, cmd) {
        const order = state.order;
        const isGuard = !!order && PhasePlan.of(order).is('guardDeploy');
        if (!order || (!OrderContext.of(order).isKind('deploy') && !isGuard) || !OrderContext.of(order).isSeat(seat)) return { ok: false, error: 'Нечего отменять.' };
        const purchases = Purchases.of(order);
        const p = state.players[seat];
        const before = this.spentOf(order);
        const entry = purchases.find(cmd);
        if (!entry) return { ok: false, error: 'В этом приказе ещё ничего не куплено.' };
        if (entry.kind === 'unit') {
            const unit = state.units.find(u => u.id === entry.id);
            if (!unit) return { ok: false, error: 'Этого отряда уже нет на доске.' };
            this.engine.destroyUnit(state, unit);
            if (entry.forge) this.engine.player(state, seat).addAsset('forge', 1);
            if (entry.forgeKl) this.engine.player(state, seat).addAsset('forge', 1);
        } else {
            const structure = state.structures.find(x => x.id === entry.id);
            if (!structure) return { ok: false, error: 'Этой постройки уже нет на доске.' };
            this.engine.destroyStructure(state, structure);
        }
        if (entry.cache) this.engine.player(state, seat).addAsset('cache', 1);
        purchases.remove(entry);
        const scope = DeployScope.of(order);
        // «одного типа» — the lock follows what is on the board.
        if (isGuard && purchases.empty) scope.unlock();
        this.engine.log(state, seat, p.name + ' отменил покупку: ' + entry.name + '.');
        return { ok: true, refunded: before - this.spentOf(order) };
    }

    cmdDeployStructures(state, seat) {
        const order = this.engine.orderOf(state, seat, 'deploy');
        if (!order) return { ok: false, error: 'Нечего заканчивать.' };
        if (this.deployStep(order) === 'structures') return { ok: true };
        PhasePlan.of(order).set('structures');
        return { ok: true };
    }

    /**
     * The end of a deploy order: the materiel of everything bought is paid in
     * one go, the log names every purchase, and the order closes. Shared by the
     * normal deploy and by the factory production of the guard order, which
     * differ only in what they allow to be bought.
     */
    payAndFinish(state, seat, order) {
        const p = state.players[seat];
        const total = this.spentOf(order);
        if (total > p.materiel) return { ok: false, error: 'Не хватает материи.' };
        this.engine.player(state, seat).payMateriel(total);
        const purchases = Purchases.of(order);
        for (const entry of purchases.list) {
            if (!entry.cost) continue;
            this.engine.log(state, seat, 'Стоимость «' + entry.name + '»: ' + entry.cost + ' материи.');
        }
        if (purchases.spent !== total) {
            this.engine.log(state, seat, p.name + ' платит ' + total + ' материи за покупки с общей скидкой.');
        }
        PhasePlan.of(order).set('done');
        this.engine.finishOrder(state, seat);
        return { ok: true, paid: total };
    }

    cmdFinishDeploy(state, seat) {
        const order = this.engine.orderOf(state, seat, 'deploy');
        if (!order) return { ok: false, error: 'Нечего заканчивать.' };
        return this.payAndFinish(state, seat, order);
    }

    cmdFinishGuardDeploy(state, seat) {
        const order = state.order;
        if (!order || !PhasePlan.of(order).is('guardDeploy') || !OrderContext.of(order).isSeat(seat)) {
            return { ok: false, error: 'Сейчас нельзя закончить производство.' };
        }
        const bought = Purchases.of(order).units;
        // «Купите минимум 2 отряда одного типа» — the type is locked already;
        // the count is checked here, on the way out.
        if (bought.length && bought.length < 2) {
            return { ok: false, error: 'Минимум 2 отряда одного типа (сейчас ' + bought.length + ').' };
        }
        if (new Set(bought.map(x => x.def)).size > 1) {
            return { ok: false, error: 'Отряды одного типа.' };
        }
        return this.payAndFinish(state, seat, order);
    }

    trimArea(state, seat, systemId, pos) {
        // The capacity of the world for the units that stand in it: the bonus of
        // an order may belong to one kind of unit only.
        let cap = this.engine.capacity(state, systemId, pos);
        for (const u of this.engine.unitsAt(state, systemId, pos)) {
            if (u.seat !== seat) continue;
            cap = Math.max(cap, this.engine.capacity(state, systemId, pos, this.engine.unitOf(state, u)));
        }
        const mine = this.engine.unitsAt(state, systemId, pos).filter(u => u.seat === seat);
        if (mine.length <= cap) return;
        // «После выполнения этого приказа можете отступить любым числом
        // Гвардейцев, превышающим вместимость этого мира» («Адептус Астрономика»):
        // those units leave by a retreat, not by the supply: the engine does not
        // take them away, it names them in the log.
        const fight = OrderFight.of(state.order);
        const named = fight ? fight.retreatExcess : null;
        if (named) {
            const over = mine.filter(u => {
                const def = this.engine.unitOf(state, u);
                return def && FS_EFFECTS.sameName(def.name, named);
            });
            if (over.length) {
                this.engine.log(state, seat, state.players[seat].name + ': ' + over.length
                    + ' отряд(ов) «' + named + '» сверх вместимости могут отступить.');
                return;
            }
        }
        this.engine.trimQueue(state).ask(seat, systemId, pos, cap, mine.length);
    }

    trimPlayer(state, seat) {
        for (const sys of state.systems) {
            for (const area of sys.areas) this.trimArea(state, seat, sys.id, area.pos);
        }
    }

    cmdTrimUnit(state, seat, cmd) {
        const queue = this.engine.trimQueue(state);
        const entry = queue.forSeat(seat)
            .find(t => cmd.system === undefined || (t.system === cmd.system && t.pos === cmd.pos));
        if (!entry) return { ok: false, error: 'Сейчас ничего не надо убирать.' };
        const unit = state.units.find(u => u.id === cmd.unit && u.seat === seat && u.system === entry.system && u.area === entry.pos);
        if (!unit) return { ok: false, error: 'Этот отряд стоит не в переполненной области.' };
        this.engine.destroyUnit(state, unit);
        this.engine.log(state, seat, state.players[seat].name + ' отводит отряд сверх вместимости области.');
        const left = this.engine.unitsAt(state, entry.system, entry.pos).filter(u => u.seat === seat).length;
        const cap = this.engine.capacity(state, entry.system, entry.pos);
        queue.settle(seat, entry.system, entry.pos, left, cap);
        if (state.effectCombatTrimOwner !== undefined && !queue.any()) {
            const owner = state.effectCombatTrimOwner;
            delete state.effectCombatTrimOwner;
            this.engine.finishOrder(state, owner);
        } else if (state.quickResponseTrimPending && !queue.any()) {
            delete state.quickResponseTrimPending;
            this.engine.resumeQuickResponse(state, seat);
        } else if (state.orderTrimPending && !queue.any()) {
            delete state.orderTrimPending;
            this.engine.nextTurn(state);
        } else if (state.eventTrimPending && !queue.any()) {
            delete state.eventTrimPending;
            this.engine.endRound(state);
        }
        return { ok: true, left: Math.max(0, left - cap) };
    }

}
