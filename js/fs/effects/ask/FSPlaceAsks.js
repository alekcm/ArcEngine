// FSPlaceAsks.js — вопросы шага: постановка и движение.
//
// Одна группа веток бывшего switch в FS_EFFECTS.step(), который решает,
// ЧТО шаг спросит у игрока. Тело каждого шага перенесено дословно;
// окружение — параметр effects и рамка шага f (FSStepContext).

class PlaceAsks {
    static ops = ['warpGateMove', 'placeUnit', 'placeStructure', 'placeFree', 'placeReinforcement', 'placeOrderAny', 'teleport', 'retreat', 'retreatInstead', 'evacuate', 'moveUnits', 'moveUnit', 'moveStructure', 'route', 'replaceUnit', 'replaceStructure', 'replaceStructureType', 'destroyUnit', 'destroy', 'sabotage', 'destroyForMateriel', 'destroyStructureForMateriel', 'destroyStructureHere', 'avoidDestroy', 'restore', 'restoreOneSystem', 'resurrectOffer', 'restoreFallenOffer', 'swapCombatCards', 'swapCombatPair', 'destroyDamagedFoe'];

    static placeUnit(effects, f) {
        const { R, state, seat, step, ctx, p } = f;
        // «приобрести до 2 отрядов за каждый недеморализованный Корабль
        // Улей» («Камери размножения»): the number the card gives is
        // the number per unit it counts, and no unit means no purchase.
        if (step.per && step.left === undefined) {
            // `count` already multiplies by the number the card prints.
            const total = effects.count(R, state, seat, step, ctx);
            if (total <= 0) return null;
            step.left = total;
        }
        const faction = R.faction(state, seat);
        const names = effects.unitNames(step.what, faction);
        let types = (faction ? faction.units : []).filter(u => !names.length || names.some(n => effects.sameName(u.name, n)));
        // «разместить его в дружественном мире» — a ship has nowhere to
        // stand there, so the ability covers ground units («1 отряд»).
        if (step.unitType) types = types.filter(u => u.type === step.unitType);
        // In combat only models of the appropriate domain can be placed in
        // the contested area. Do not offer a ship on a world (or vice versa)
        // and silently skip the agreed placement on the next question.
        if (step.dest === 'combatArea' && state.combat) {
            const area = BattleField.of(state.combat).area;
            const world = effects.areaWorld(state, area.system, area.pos);
            types = types.filter(u => (u.type !== 'ship') === world);
        }
        // A free unit also comes from the supply: without a model there is
        // nothing to place (the rules, "Free Units").
        let free = types.filter(u => (p.supply.units[u.id] || 0) > 0);
        if (step.payMateriel) {
            // A fixed payment is offered only if it and a destination exist.
            // The explicitly all-or-nothing branch needs every named model.
            if ((p.materiel || 0) < step.payMateriel
                || !effects.areasForAbility(R, state, seat, step.dest).length) return null;
            if (effects.fullSupplyPlacement(step)) {
                const need = Math.max(1, step.left !== undefined ? step.left : (step.n || 1));
                free = free.filter(u => (p.supply.units[u.id] || 0) >= need);
            }
        }
        if (step.buy) {
            // «купить 1 отряд» — the price and the command level are paid.
            // «Ужасный ритуал» pays the price reduced by its cultists and
            // caps the KL by the card, not by the player's cities.
            const deal0 = OrderDeal.of(state.order);
            const off = step.discount && deal0 ? deal0.placementDiscount : 0;
            const price = u => Math.max(0, (u.cost || 0) - off);
            free = free.filter(u => price(u) <= (p.materiel || 0)
                && R.effectUnitForgeCost(state, seat, u, !!step.bypassCommandLevel) !== null);
        }
        // This upgrade has exactly one destination; don't offer a purchase if
        // the moved factory's world is no longer a legal destination.
        if (step.dest === 'movedFactoryWorld') {
            const worlds = effects.areasForAbility(R, state, seat, step.dest);
            free = free.filter(u => worlds.some(a => R.canPlaceUnit(state, seat, a.system, a.pos, u).ok));
        }
        // «… один отряд с командным уровнем 2 или меньше» («Мицетические
        // споры»): the card caps the command level below the player's own.
        if (step.maxKl !== undefined && step.maxKl !== null) {
            free = free.filter(u => (u.kl || 0) <= step.maxKl);
        }
        if (!free.length) return null;
        const want = step.left !== undefined ? step.left : (step.n || 1);
        return { question: { kind: 'types', who: seat, op: 'placeUnit', n: want, options: free.map(u => u.id), text: 'Какой отряд разместить?' } };
    }

    static placeStructure(effects, f) {
        const { R, state, seat, step, p } = f;
        if (step.materielPayment && (p.materiel || 0) < step.materielPayment) return null;
        // «Купите 1 постройку» — the player chooses which one: only the
        // structures he can afford and actually take from the box are
        // offered; an empty offer ends the ability honestly in the log.
        const offer = ['factory', 'city', 'bastion'].filter(t => {
            if (!step.free && p.materiel < effects.structureCost(R, step, t)) return false;
            const can = R.canTakeStructure(state, seat, t);
            return can && can.ok;
        });
        if (step.kind === 'any') {
            if (!offer.length) {
                R.log(state, seat, p.name + ' не может купить постройку: нет денег или жетонов контроля.');
                return null;
            }
            return { question: { kind: 'structureTypes', who: seat, op: 'placeStructure', options: offer, text: 'Какую постройку построить?' } };
        }
        if (offer.indexOf(step.kind) < 0) {
            R.log(state, seat, p.name + ' не может построить постройку.');
            return null;
        }
        const areas = effects.structureAreas(R, state, seat, step);
        if (!areas.length) {
            R.log(state, seat, p.name + ' некуда ставить постройку: нет мира, где её можно поставить.');
            return null;
        }
        return { question: { kind: 'areas', who: seat, op: 'placeStructure', kind2: step.kind, options: areas, text: 'Где построить?' } };
    }

    static placeFree(effects, f) {
        const { R, state, seat, step, p } = f;
        const faction = R.faction(state, seat);
        const names = effects.unitNames(step.what, faction);
        const types = (faction ? faction.units : []).filter(u =>
            (names.length ? names.some(n => effects.sameName(u.name, n)) : true)
            && (p.supply.units[u.id] || 0) > 0);
        if (!types.length) return null;
        const count = Math.min(step.n || 1, p.supply.units[types[0].id] || 0);
        const areas = effects.areasForAbility(R, state, seat, step.dest);
        if (!areas.length) {
            R.log(state, seat, p.name + ' не может разместить отряды: нет подходящего мира.');
            return null;
        }
        return { question: { kind: 'areas', who: seat, op: 'placeFree', n: count, kind2: types[0].id, options: areas, text: 'Где разместить отряды?' } };
    }

    static placeReinforcement(effects, f) {
        const { R, state, seat, step, ctx, combat, side } = f;
        // «… вы можете разместить 1 бесплатный жетон подкрепления в
        // спорной области в начале шага призыва подкреплений»
        // («Бесчисленные»): the order is resolved before its combat
        // exists, so the token of the card waits for the combat.
        if (step.here && !combat && state.order && OrderContext.of(state.order).isSeat(seat)) {
            OrderTally.of(state.order).setPromisedReinforce(step.n || 1, step.free);
            return null;
        }
        // «… в спорной области» — the area of the battle is the only one.
        if (step.here && combat) {
            effects.placeReinforcementAt(R, state, seat, step, BattleField.of(combat).area, side, ctx);
            return null;
        }
        const areas = effects.areasFor(R, state, seat, 'reinforcement');
        if (!areas.length) return null;
        return { question: { kind: 'areas', who: seat, op: 'placeReinforcement', n: step.n || 1, options: areas, text: 'Где разместить жетон подкрепления?' } };
    }

    static placeOrderAny(effects, f) {
        const { R, state, seat } = f;
        // «Научная экспедиция» moves the top token of an existing stack;
        // it does not take an extra order from the player's hand.
        const sources = R.orderMoveSources(state, seat);
        if (!sources.length) return null;
        return { question: {
            kind: 'systems', who: seat, op: 'placeOrderAny', stage: 'source',
            options: sources, text: 'С вершины какой стопки взять ваш приказ?',
        } };
    }

    static teleport(effects, f) {
        const { R, state, seat, step } = f;
        const list = effects.teleportSources(R, state, seat, step);
        if (!list.length) return null;
        return { question: { kind: 'units', who: seat, op: 'teleport', n: 1, options: list.map(u => u.id), text: 'Какой отряд перенести?' } };
    }

    static retreat(effects, f) {
        const { R, state, seat, step, combat, target } = f;
        const units = effects.unitsOf(R, state, target, combat, {});
        if (!units.length) return null;
        return { question: { kind: 'units', who: effects.askerOf(step, target, seat), op: 'retreat', n: 1, options: units.map(u => u.id), text: 'Какой отряд отступает?' } };
    }

    static retreatInstead(effects, f) {
        const { seat, inCombat } = f;
        if (!inCombat) return null;
        return { question: {
            kind: 'yesno', who: seat, op: 'retreatInstead',
            text: 'Отступить отрядом вместо уничтожения в этом раунде?',
        } };
    }

    static evacuate(effects, f) {
        const { R, state, seat, step, combat } = f;
        // The card moves the whole eligible force, not a player-selected subset.
        // There is just one decision: which friendly area receives the force.
        if (step.unitsFromCombat) {
            const force = effects.combatEvacuees(R, state, seat, combat);
            const areas = effects.combatEvacuationAreas(R, state, seat, combat);
            if ((!force.units.length && !force.tokens.length) || !areas.length) return null;
            return { question: { kind: 'areas', who: seat, op: 'evacuate', n: 1,
                options: areas, text: 'В какую дружественную область вывести все отряды из боя?' } };
        }
        /** @type {any[]} */
        const list = state.structures.filter(x => x.seat === seat).map(x => x.id);
        if (!list.length) return null;
        return { question: {
            kind: 'structures', who: seat, op: 'evacuate', n: 1,
            options: list, text: 'Какую свою постройку уничтожить?',
        } };
    }

    static warpGateMove(effects, f) {
        const { state, seat } = f;
        const seen = new Map();
        for (const u of state.units) {
            if (u.seat === seat && !u.routed) {
                const area = { system: u.system, pos: u.area };
                seen.set(u.system + '|' + u.area, area);
            }
        }
        const options = [...seen.values()];
        if (!options.length) return null;
        return { question: { kind: 'areas', who: seat, op: 'warpGateMove',
            stage: 'source', answerKey: 'source', options,
            text: 'Из какой области переместить ваши отряды?' } };
    }

    static moveUnits(effects, f) {
        const { R, state, seat, step, combat } = f;
        if (step.sourceWorld) {
            const worlds = effects.sourceWorlds(R, state, seat);
            if (!worlds.length) return null;
            return { question: { kind: 'areas', answerKey: 'source', stage: 'source', who: seat, op: 'moveUnits', options: worlds, text: 'С какого мира забрать отряды?' } };
        }
        const units = effects.unitsOf(R, state, seat, combat, step);
        if (!units.length) return null;
        // «переместить любое количество отрядов в соседнюю область»: the
        // player chooses them all himself.
        const all = step.n === 0 || step.all;
        return { question: { kind: 'units', who: seat, op: 'moveUnits', n: all ? units.length : Math.min(step.n || 1, units.length), options: units.map(u => u.id), text: step.questionText || (all ? 'Какие отряды переместить? (любое количество)' : 'Какие отряды переместить?') } };
    }

    static moveUnit(effects, f) {
        const { R, state, seat, step, combat } = f;
        let units = effects.unitsOf(R, state, seat, combat, step);
        // «Командный уровень этого отряда не может превышать числа
        // отрядов культистов в этой системе» («Объединённый Хаос»).
        if (step.maxKlFromCultists) {
            const sysId = combat ? BattleField.of(combat).system : (state.order ? OrderContext.of(state.order).system : null);
            const cap = state.units.filter(u => u.seat === seat && u.system === sysId
                && /культист/i.test((R.unitOf(state, u) || {}).name || '')).length;
            units = units.filter(u => {
                const def = R.unitOf(state, u);
                return def && (def.kl || 0) <= cap;
            });
        }
        // «из дружественного мира, в котором есть постройка» («Врата
        // вечности»): the source world of the card.
        if (step.fromStructureWorld) {
            units = units.filter(u => {
                const sys = R.system(state, u.system);
                const area = R.area(sys, u.area);
                if (!area || !area.world) return false;
                return R.hasStructure(state, u.system, u.area);
            });
        }
        if (!units.length) return null;
        return { question: { kind: 'units', who: seat, op: 'moveUnit', n: 1, options: units.map(u => u.id), text: step.questionText || 'Какой отряд переместить?' } };
    }

    static moveStructure(effects, f) {
        const { R, state, seat, step } = f;
        const active = state.order ? OrderContext.of(state.order).system : null;
        const structures = state.structures.filter(s =>
            s.seat === seat && (!step.kind || s.type === step.kind)
            && (!step.ofSystem || (active && s.system === active))
            && (!step.groundPath || effects.factoryDestinations(R, state, seat, s, step).length));
        if (!structures.length) return null;
        return { question: { kind: 'structures', who: seat, op: 'moveStructure', options: structures.map(s => s.id), text: 'Что переместить?' } };
    }

    static route(effects, f) {
        const { R, state, seat, step, combat, inCombat, side, target } = f;
        let units = effects.unitsOf(R, state, target, combat,
            Object.assign({}, step, { includeReinforcements: inCombat }));
        // «… командный уровень которого не превышает командный уровень
        // вашего сильнейшего недеморализованного юнита» («Жёсткий залп»):
        // the cap is the highest command level among the player's own
        // unrouted units of the contested area.
        if (step.maxKlFromMine) {
            const mine = state.units.filter(u => u.seat === seat && !u.routed
                && (!combat || BattleField.of(combat).holds(u)));
            let best = -1;
            for (const u of mine) {
                const d = R.unitOf(state, u);
                if (d && (d.kl || 0) > best) best = d.kl || 0;
            }
            if (inCombat && R.tokenUnits(state, CombatSides.sideOf(combat, seat)).alive) best = Math.max(best, 0);
            units = units.filter(u => {
                const d = R.unitOf(state, u);
                return !!d && (d.kl || 0) <= best;
            });
        }
        // «… который находится в системе, содержащей хотя бы 1 из ваших
        // отрядов, либо находящийся в соседней с ней системе»
        // («Отбрыски Темпестус»).
        if (step.sameSystemMine) {
            const mine = new Set(state.units.filter(u => u.seat === seat && !u.routed).map(u => u.system));
            units = units.filter(u => mine.has(u.system));
        }
        if (step.nearMine) {
            const mine = new Set(state.units.filter(u => u.seat === seat && !u.routed).map(u => u.system));
            const near = new Set(mine);
            for (const sysId of mine) {
                for (const nb of (R.neighbors ? R.neighbors(state, sysId) : [])) near.add(nb);
            }
            units = units.filter(u => near.has(u.system));
        }
        if (!units.length) return null;
        const asker0 = effects.askerOf(step, target, seat);
        // The opponent may avoid the effect by spending a die.
        const avoid = step.avoidAsked ? null : effects.avoidQuestion(R, state, target, step, combat, side);
        if (avoid) {
            step.avoidAsked = true;
            return avoid;
        }
        const want = step.all ? units.length : Math.min(step.n || 1, units.length);
        return { question: { kind: 'units', who: asker0, op: 'route', n: want, options: units.map(u => u.id),
            strictUnits: inCombat ? effects.unitStepSelectionMode(step) : undefined,
            text: 'Какие отряды деморализовать?' } };
    }

    static replaceUnit(effects, f) {
        const { R, state, seat, step, combat, p } = f;
        const faction = R.faction(state, seat);
        const names = effects.unitNames(step.to, faction);
        const def = names.length && faction.units.find(u => effects.sameName(u.name, names[0]));
        if (!def || (p.supply.units[def.id] || 0) <= 0) return null;
        if (step.pay && R.player(state, seat).assetCount(step.pay.kind) < (step.pay.n || 1)) return null;
        const units = effects.unitsOf(R, state, seat, combat, step);
        if (!units.length) return null;
        return { question: { kind: 'units', who: seat, op: 'replaceUnit', n: Math.min(step.n || 1, units.length), options: units.map(u => u.id), text: 'Какой отряд заменить?' } };
    }

    static replaceStructure(effects, f) {
        const { state, seat } = f;
        const list = state.structures.filter(s => s.seat === seat && (!state.order || s.system === OrderContext.of(state.order).system));
        if (!list.length) return null;
        return { question: { kind: 'structures', who: seat, op: 'replaceStructure', options: list.map(s => s.id), text: 'Какую постройку заменить?' } };
    }

    static replaceStructureType(effects, f) {
        const { R, state, seat, step, p } = f;
        const s = state.structures.find(x => x.id === step.structure);
        if (!s) return null;
        // «заменить 1 постройку … на любую другую» («Направлять верующих»):
        // another kind, and only one the box still holds. The control token
        // of the replaced structure stays: no new token is needed.
        const options = ['city', 'factory', 'bastion'].filter(t => t !== s.type
            && (typeof R.structurePoolLeft !== 'function' || R.structurePoolLeft(state, t) > 0));
        if (!options.length) {
            R.log(state, seat, p.name + ' не может заменить постройку: других построек в запасе нет.');
            return null;
        }
        return { question: { kind: 'structureTypes', who: seat, op: 'replaceStructureType', options, text: 'На что заменить постройку?' } };
    }

    static destroyUnit(effects, f) {
        const { R, state, seat, combat } = f;
        const list = effects.unitsOf(R, state, seat, combat, {});
        if (!list.length) return null;
        return { question: { kind: 'units', who: seat, op: 'destroyUnit', options: list.map(u => u.id), text: 'Какой отряд уничтожить?' } };
    }

    static destroy(effects, f) {
        const { R, state, seat, step, ctx, combat, inCombat, side, target } = f;
        if (combat && effects.combatWorldLowDestroy(step)) {
            const options = effects.combatWorldLowTargets(R, state, combat, target);
            if (!options.length) return null;
            return { question: { kind: 'units', who: seat, op: 'destroy', n: 1,
                options, strictUnits: true, text: 'Какой отряд противника уничтожить?' } };
        }
        // Direct destruction is not damage assignment: unless the card says
        // «недеморализованный», a routed model or token is also a legal target.
        const candidates = Object.assign({}, step, {
            includeReinforcements: inCombat,
            includeRouted: !step.routed && !/недеморализованн/i.test(String(step.ability || step.text || '')),
        });
        // «Уничтожьте 1 юнита 0-го командного уровня» names no owner.
        if (step.who === 'any' && combat) {
            const any = [CombatSides.seatOf(combat, 'attacker'), CombatSides.seatOf(combat, 'defender')]
                .flatMap(s => effects.unitsOf(R, state, s, combat, candidates));
            if (!any.length) { step.destroyedCount = 0; return null; }
            // «…за каждый потраченный кубик»: zero spent means no question.
            const want = step.per ? effects.count(R, state, seat, step, ctx) : (step.n || 1);
            if (want <= 0) { step.destroyedCount = 0; return null; }
            return { question: { kind: 'units', who: seat, op: 'destroy', n: Math.min(want, any.length),
                options: any.map(u => u.id), strictUnits: inCombat ? effects.unitStepSelectionMode(step) : undefined,
                text: 'Какие отряды уничтожить?' } };
        }
        const units = effects.unitsOf(R, state, target, combat, candidates);
        // The same for a destroy that the card makes optional («уничтожьте до
        // 2 Гвардейцев, чтобы …»): no such unit — nothing is destroyed, and
        // the reward that follows counts zero.
        if (!units.length) { step.destroyedCount = 0; return null; }
        const avoid = step.avoidAsked ? null : effects.avoidQuestion(R, state, target, step, combat, side);
        if (avoid) {
            step.avoidAsked = true;
            return avoid;
        }
        const asker = effects.askerOf(step, target, seat);
        return { question: { kind: 'units', who: asker, op: 'destroy',
            n: Math.min(step.n || 1, units.length), options: units.map(u => u.id),
            strictUnits: inCombat ? effects.unitStepSelectionMode(step) : undefined,
            text: 'Какие отряды уничтожить?' } };
    }

    static sabotage(effects, f) {
        const { state, seat } = f;
        // A sacrifice can only buy the effect in a system with a target.
        const targets = new Set(state.structures.filter(s => s.seat !== seat).map(s => s.system));
        /** @type {any[]} */
        const list = state.units.filter(u => u.seat === seat && !u.routed && targets.has(u.system)).map(u => u.id);
        if (!list.length) return null;
        return { question: {
            kind: 'units', who: seat, op: 'sabotage', n: 1,
            options: list, text: 'Какой свой отряд уничтожить?',
        } };
    }

    static destroyForMateriel(effects, f) {
        const { R, state, seat, p } = f;
        const active = state.order ? OrderContext.of(state.order).system : null;
        if (!active) return null;
        const seen = new Map();
        for (const u of state.units) {
            if (u.seat !== seat || u.system !== active) continue;
            seen.set(u.system + '|' + u.area, { system: u.system, pos: u.area });
        }
        for (const s2 of state.structures) {
            if (s2.seat !== seat || s2.system !== active) continue;
            seen.set(s2.system + '|' + s2.area, { system: s2.system, pos: s2.area });
        }
        const areas = [...seen.values()];
        if (!areas.length) {
            R.log(state, seat, p.name + ': в активной системе нечего уничтожать.');
            return null;
        }
        return { question: { kind: 'areas', who: seat, op: 'destroyForMateriel', options: areas, text: 'В каком мире уничтожить отряды и постройки?' } };
    }

    // «уничтожить 1 постройку в этом мире» («Сокруши это!»): every building of
    // the contested world — the card names no owner.
    static destroyStructureHere(effects, f) {
        const { R, state, seat, step, combat } = f;
        const field = combat ? BattleField.of(combat) : null;
        const sys = field ? field.system : (state.order ? OrderContext.of(state.order).system : null);
        const pos = field ? field.pos : null;
        if (!sys) return null;
        step.system = sys;
        step.pos = pos;
        const list = state.structures
            .filter(s2 => s2.system === sys && (!pos || s2.area === pos))
            .map(s2 => s2.id);
        if (!list.length) {
            R.log(state, seat, state.players[seat].name + ': в этом мире нет построек.');
            return null;
        }
        return { question: { kind: 'structures', who: seat, op: 'destroyStructureHere', n: 1,
            options: list, text: 'Какую постройку уничтожить?' } };
    }

    // «… постройку в дружественном мире»: the buildings to choose from are the
    // owner's own, and the world must be theirs — the question shows no
    // building the card does not allow.
    static destroyStructureForMateriel(effects, f) {
        const { R, state, seat, p } = f;
        const friendly = new Set(Board.of(state).friendlyWorlds(seat)
            .map(w => w.system + '|' + w.pos));
        const list = state.structures
            .filter(s2 => s2.seat === seat && friendly.has(s2.system + '|' + s2.area))
            .map(s2 => s2.id);
        if (!list.length) {
            if (p) R.log(state, seat, p.name + ': в дружественных мирах нет построек.');
            return null;
        }
        return { question: {
            kind: 'structures', who: seat, op: 'destroyStructureForMateriel', n: 1,
            options: list, text: 'Какую постройку уничтожить за материалы?',
        } };
    }

    static avoidDestroy(effects, f) {
        const { R, state, step, combat, side } = f;
        const victim = state.units.find(u => u.id === step.unit);
        const tokens = combat && step.tokenSide ? CombatTokens.of(combat) : null;
        const token = tokens && tokens.alive(step.tokenSide, step.tokenIndex)
            && tokens.flipped(step.tokenSide).includes(step.tokenIndex);
        if (!victim && !token) return null;
        const owner = victim ? victim.seat : CombatSides.seatOf(combat, step.tokenSide);
        if (!step.avoidAsked) {
            const avoid = effects.avoidQuestion(R, state, owner, step, combat, side);
            if (avoid) {
                step.avoidAsked = true;
                return avoid;
            }
        }
        // Nothing to pay with: destroy the same model or reinforcement token.
        return DestroySteps.avoidDestroy(effects, f);
    }

    static restore(effects, f) {
        const { R, state, seat, step, ctx, combat, inCombat, side, p } = f;
        // «ваш противник не может … восстанавливать свои отряды в текущем
        // раунде битвы» («Фанатичное рвение»): the ban of the round holds the
        // card's own restore too.
        if (inCombat && side && CombatBans.of(combat).forbidsRestore(side)) {
            R.log(state, seat, p.name + ' не может восстанавливать отряды в этом раунде.');
            return null;
        }
        let units = effects.unitsOf(R, state, seat, combat, { routed: true, includeReinforcements: inCombat });
        if (step.scope === 'activeAllOthersGround') {
            const active = state.order ? OrderContext.of(state.order).system : null;
            units = state.units.filter(u => {
                if (u.seat !== seat || !u.routed) return false;
                if (active && u.system === active) return true;
                // «всю пехоту во всех других системах»: the engine knows two
                // kinds of units, ground and ships — «пехота» is the ground
                // ones (10-necron-audit.md: a ship of another system stays
                // routed).
                const def = R.unitOf(state, u);
                return !!def && def.type === 'ground';
            });
        }
        if (!units.length) return null;
        const n = step.per ? Math.min(units.length, effects.count(R, state, seat, step, ctx))
            : (step.all ? units.length : Math.min(step.n || 1, units.length));
        if (!n) return null;
        return { question: { kind: 'units', who: seat, op: 'restore', n, options: units.map(u => u.id),
            strictUnits: inCombat ? effects.unitStepSelectionMode(step) : undefined,
            text: 'Какие отряды восстановить?' } };
    }

    static restoreOneSystem(effects, f) {
        const { R, state, seat, step } = f;
        /** @type {any[]} */
        let ids = [...new Set(state.units.filter(u => u.seat === seat && u.routed).map(u => u.system))];
        // «в активной или одной соседней с ней системе» («Направить
        // праведников»): the system of the order or one touching it.
        if (step && step.scope === 'activeOrAdjacent') {
            const active = state.order ? OrderContext.of(state.order).system : null;
            if (active === null || active === undefined) return null;
            const near = R.neighbors(state, active);
            ids = ids.filter(id => id === active || near.includes(id));
        }
        if (!ids.length) return null;
        return { question: {
            kind: 'systems', who: seat, op: 'restoreOneSystem', n: 1,
            options: ids, text: 'В какой системе восстановить отряды?',
        } };
    }

    static resurrectOffer(effects, f) {
        const { seat, inCombat } = f;
        if (!inCombat) return null;
        return { question: { kind: 'yesno', who: seat, op: 'resurrectOffer', options: [], text: 'Сбросить план «Сфера воскрешения» и вернуть отряд?' } };
    }

    static restoreFallenOffer(effects, f) {
        const { seat, step } = f;
        const ids = step.candidates || [];
        if (!ids.length) return null;
        // Destroyed pieces no longer exist on the board. Include their public
        // descriptions so the player can still select them in the client list.
        const fallen = ((step.plan && step.plan.candidates) || []).filter(x => ids.includes(x.id));
        return { question: {
            kind: 'units', who: seat, op: 'restoreFallenOffer', n: ids.length,
            any: true, options: ids, fallen, text: 'Какие отряды вернуть в эту область?',
        } };
    }

    static swapCombatCards(effects, f) {
        const { R, state, seat } = f;
        const deck = R.player(state, seat).combatDeck.cards();
        /** @type {any} */
        const counts = {};
        for (const n of deck) counts[n] = (counts[n] || 0) + 1;
        const options = Object.keys(counts).filter(n => (counts[n] || 0) >= 2);
        if (!options.length) return null;
        return { question: {
            kind: 'cards', who: seat, op: 'swapCombatCards', n: options.length,
            any: true, options, text: 'Какие пары боевых карт заменить?',
        } };
    }

    static swapCombatPair(effects, f) {
        const { R, state, seat, step, p } = f;
        const card = FS_CATALOG.card('combat', p.faction, step.name);
        const kl = card ? (card.kl || 0) : 0;
        const inDeck = n => R.player(state, seat).combatDeck.count(n);
        const options = R.player(state, seat).combatDeck.upgradePile().filter(n => {
            // Previously removed basic pairs also sit in the upgrade deck.
            const up = FS_CATALOG.card('combat', p.faction, n);
            return up && (up.kl || 0) <= kl && inDeck(n) < 2;
        });
        if (!options.length) return null;
        return { question: {
            kind: 'cards', who: seat, op: 'swapCombatPair', n: 1,
            options, text: 'Какой парой улучшений заменить «' + step.name + '»?',
        } };
    }

    static destroyDamagedFoe(effects, f) {
        const { state, seat, step, ctx, combat } = f;
        const ids = (ctx && ctx.ctx && ctx.ctx.damageTargets) || [];
        /** @type {any[]} */
        let list = ids.filter(id => {
            const u = state.units.find(x => x.id === id);
            if (u) return u.seat !== seat;
            const foe = combat && CombatSides.foe(CombatSides.sideOf(combat, seat));
            return !!foe && CombatTokens.of(combat).indexOf(foe, id) >= 0;
        });
        // «Когда отряд противника становится деморализованным … уничтожить этот
        // отряд» («Добить их!»): the card reacts to the unit that was just
        // routed, not to the ones that took damage.
        if (!list.length && step.routed) {
            const field = combat ? BattleField.of(combat) : null;
            list = state.units
                .filter(u => u.seat !== seat && u.routed && (!field || field.holds(u)))
                .map(u => u.id);
        }
        if (!list.length) return null;
        return { question: {
            kind: 'units', who: seat, op: 'destroyDamagedFoe', n: 1,
            options: list, text: 'Какой отряд, получивший урон, уничтожить?',
        } };
    }
}
