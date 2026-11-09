// FSPlaceSteps.js — шаги эффектов: постановка.
//
// Одна группа веток бывшего switch в FS_EFFECTS.apply(). Тело каждого шага
// перенесено дословно; изменилось только окружение: «движок эффектов» теперь
// приходит параметром effects, а общая рамка шага — объектом f (FSStepContext).

class PlaceSteps {
    static ops = ['placeUnit', 'placeStructure', 'placeFree', 'placeReinforcement', 'placeOrderAny', 'teleport', 'resurrectOffer', 'restoreFallenOffer', 'restoreOneSystem', 'replaceUnit'];

    static placeUnit(effects, f) {
        const { R, state, seat, step, answer, p, units } = f;
        const def = R.unitDef(state, seat, answer.type);
        if (!def) return null;
        const area = answer.area;
        const off = step.discount && state.order
            ? (state.order.discount || 0) + (state.order.purchaseDiscount || 0) : 0;
        const price = Math.max(0, (def.cost || 0) - off);
        if (!area) {
            // The place of the unit is the next question.
            let areas = step.dest
                ? effects.areasForAbility(R, state, seat, step.dest)
                : effects.areasFor(R, state, seat, def.type === 'ship' ? 'void' : 'world');
            // «в дружественную область активной системы»: a ship still
            // needs a void, a ground unit still needs a world.
            if (step.dest === 'friendlyAreaActive' || step.dest === 'combatArea') {
                const wantWorld = def.type !== 'ship';
                areas = areas.filter(a => effects.areaWorld(state, a.system, a.pos) === wantWorld);
            }
            // «в двух разных дружественных мирах» («Гнездо выводка»): the
            // worlds the card has already used are not offered again —
            // the steps of the card share one list.
            if (step.used && step.used.length) {
                areas = areas.filter(a => !step.used.includes(a.system + '|' + a.pos));
            }
            if (!areas.length) return null;
            return { question: { kind: 'areas', who: seat, op: 'placeUnit', kind2: def.id, options: areas, text: 'Где разместить отряд?' } };
        }
        if (step.used) step.used.push(area.system + '|' + area.pos);
        const sys = R.system(state, area.system);
        const a = R.area(sys, area.pos);
        if (!a) return null;
        if ((p.supply.units[def.id] || 0) <= 0) return null;
        // «разместить 2 бесплатных Скитария в мире с вашей фабрикой»
        // («Багровая стража»): the card may name more than one model. The
        // models stand in the chosen world while the supply and the
        // capacity of the world last.
        const want = Math.max(1, step.left !== undefined ? step.left : (step.n || 1));
        let placed = 0;
        for (let i = 0; i < want; i++) {
            if ((p.supply.units[def.id] || 0) <= 0) break;
            // «Players can voluntarily exceed the unit capacity of an
            // area when moving units, retreating, placing units, or
            // deploying units» — and the capacity counts the units of
            // one player, not of both. The printed skulls are therefore
            // no wall here: only the plastic of the area (five units)
            // stops the placement, and the trim follows in finishOrder.
            const mine = state.units.filter(u => u.seat === seat
                && u.system === area.system && u.area === area.pos).length;
            if (mine >= R.AREA_MAX_UNITS) break;
            // «купить 1 отряд» — the ability buys at the printed price.
            if (step.buy) {
                if ((p.materiel || 0) < price) {
                    R.log(state, seat, state.players[seat].name + ' не хватает материи, чтобы купить «' + def.name + '».');
                    break;
                }
                p.materiel -= price;
                R.log(state, seat, state.players[seat].name + ' тратит ' + price + ' материи.');
            }
            p.supply.units[def.id]--;
            R.addUnit(state, seat, def.id, area.system, area.pos);
            placed++;
        }
        if (!placed) return null;
        R.log(state, seat, state.players[seat].name + ' размещает «' + def.name + '»: ' + placed + '.');
        return null;
    }

    static placeStructure(effects, f) {
        const { R, state, seat, step, answer, p } = f;
        // The first answer of a «buy a structure» step: which kind was
        // bought. The choice stays on the step; the question about the
        // world follows.
        if (answer.type !== undefined && !answer.area) {
            const t = answer.type;
            if (['factory', 'city', 'bastion'].indexOf(t) < 0) return { ok: false, error: 'Такой постройки нет.' };
            const stats = R.structureStats(t);
            if (!step.free && p.materiel < stats.cost) return { ok: false, error: 'Не хватает материи.' };
            const can = R.canTakeStructure(state, seat, t);
            if (!can.ok) return { ok: false, error: can.error };
            step.kind = t;
            // «…разместить её на дружественном мире в активной системе»
            // («Боевая кузня»): the card may name the worlds itself.
            const areas = effects.structureAreas(R, state, seat, step);
            if (!areas.length) {
                R.log(state, seat, p.name + ' некуда ставить постройку: нет мира, где её можно поставить.');
                return null;
            }
            return { question: { kind: 'areas', who: seat, op: 'placeStructure', kind2: t, options: areas, text: 'Где построить?' } };
        }
        const area = answer.area;
        if (!area) return null;
        const stats = R.structureStats(step.kind);
        // The plastic of the structures is shared and counted on the board.
        const can = R.canTakeStructure(state, seat, step.kind);
        if (!can.ok) return { ok: false, error: can.error };
        if (!step.free && p.materiel < stats.cost) return { ok: false, error: 'Не хватает материи.' };
        // The structure may be free, but it always comes from the reserve.
        if (!step.free) p.materiel -= stats.cost;
        R.addStructure(state, seat, step.kind, area.system, area.pos);
        R.log(state, seat, state.players[seat].name + ' строит: ' + R.structureName(step.kind) + '.');
        return null;
    }

    static placeFree(effects, f) {
        const { R, state, seat, step, answer, p } = f;
        const area = answer.area;
        const def = R.unitDef(state, seat, answer.type || step.kind2 || step.what);
        if (!area || !def) return null;
        let n = Math.min(step.n || 1, p.supply.units[def.id] || 0);
        if (!n) return null;
        while (n > 0) {
            p.supply.units[def.id]--;
            R.addUnit(state, seat, def.id, area.system, area.pos);
            n--;
        }
        R.log(state, seat, state.players[seat].name + ' размещает «' + def.name + '» бесплатно.');
        return null;
    }

    static placeReinforcement(effects, f) {
        const { R, state, seat, step, answer, ctx, combat, side } = f;
        const area = answer.area;
        if (!area) return null;
        if (!combat) return null;
        effects.placeReinforcementAt(R, state, seat, step, area, side, ctx);
        return null;
    }

    static placeOrderAny(effects, f) {
        const { R, state, seat, step, answer, p, units } = f;
        // «взять 1 ваш приказ с вершины любой стопки и разместить его в
        // смежной системе» («Научная экспедиция»).
        const types = step.types || ['advance', 'deploy', 'strategize', 'dominate'];
        const kind = answer.order || types[Number(answer.choice)];
        if (!kind || R.orderLeft(state, seat, kind) <= 0) return null;
        if (!answer.area) {
            // «Не нарушая базовых правил размещения»: a system with the
            // units or the structures of the player, or one next to it.
            const list = state.systems.filter(sys => R.canPlaceOrder(state, seat, sys.id));
            if (!list.length) {
                R.log(state, seat, 'Приказ некуда положить: нет системы по правилам размещения.');
                return null;
            }
            return {
                question: {
                    kind: 'areas', who: seat, op: 'placeOrderAny', kind2: kind,
                    options: list.map(sys => ({ system: sys.id, pos: 0 })),
                    text: 'В какую систему положить приказ?',
                },
            };
        }
        const sys = R.system(state, answer.area.system);
        if (!sys) return null;
        sys.tokens.push({ seat, order: kind, faceUp: false });
        p.placedOf = p.placedOf || {};
        p.placedOf[kind] = (p.placedOf[kind] || 0) + 1;
        R.log(state, seat, state.players[seat].name + ' размещает приказ «'
            + R.orderName(kind) + '» в системе ' + sys.tile + '.');
        return null;
    }

    static teleport(effects, f) {
        const { R, state, seat, step, answer, units } = f;
        const u = units(answer.units)[0];
        if (!u) return null;
        if (!answer.area) {
            const areas = effects.teleportTargets(R, state, seat, step);
            if (!areas.length) {
                R.log(state, seat, state.players[seat].name + ': нет мира, куда перенести отряд.');
                return null;
            }
            return { question: { kind: 'areas', who: seat, op: 'teleport', options: areas, text: 'Куда перенести отряд?' } };
        }
        R.noteMove(state, seat, u, answer.area);
        u.system = answer.area.system;
        u.area = answer.area.pos;
        R.log(state, seat, state.players[seat].name + ' переносит отряд: «' + (R.unitOf(state, u) || {}).name + '».');
        step.done = true;
        return null;
    }

    static resurrectOffer(effects, f) {
        const { R, state, seat, step, answer, ctx } = f;
        const asked = answer.yes !== undefined ? !!answer.yes : !(answer.no);
        if (!asked) return null;
        const seat0 = ctx && ctx.owner !== undefined ? ctx.owner : seat;
        const player = state.players[seat0];
        const at = (player.schemes || []).findIndex(x => (x.steps || []).some(y => y && y.op === 'resurrect'));
        if (at < 0) return null;
        const scheme = player.schemes[at];
        player.schemes.splice(at, 1);
        R.log(state, seat0, player.name + ' сбрасывает план «' + scheme.name + '».');
        R.applyResurrect(state);
        step.done = true;
        return null;
    }

    static restoreFallenOffer(effects, f) {
        const { R, state, seat, step, answer, p, combat, inCombat } = f;
        if (!inCombat) return null;
        const chosen = answer.units || [];
        const records = (step.plan && step.plan.candidates) || [];
        for (const id of chosen) {
            const rec = records.find(x => x.id === id);
            if (!rec) continue;
            const alive = state.units.find(u => u.id === id);
            if (alive) {
                alive.routed = false;
                alive.routedRound = 0;
            } else if (rec.destroyed) {
                R.addUnit(state, seat, rec.def, combat.system, combat.pos);
            }
            R.log(state, seat, p.name + ': отряд возвращён в спорную область.');
        }
        if (step.plan) step.plan.done = true;
        step.done = true;
        return null;
    }

    static restoreOneSystem(effects, f) {
        const { R, state, seat, step, answer, p } = f;
        const sysId = answer.system;
        if (!sysId) return null;
        for (const u of state.units.filter(x => x.seat === seat && x.routed && x.system === sysId)) {
            u.routed = false;
            u.routedRound = 0;
        }
        R.log(state, seat, p.name + ': все деморализованные отряды системы восстановлены.');
        step.done = true;
        return null;
    }

    static replaceUnit(effects, f) {
        const { R, state, seat, step, answer, units } = f;
        const list = units(answer.units);
        if (!list.length) return null;
        const faction = FS_EFFECTS.factionOf({ faction: state.players[seat].faction });
        const names = FS_EFFECTS.unitNames(step.to, faction);
        const def = names.length ? faction.units.find(u => effects.sameName(u.name, names[0])) : null;
        if (!def) return null;
        const p = state.players[seat];
        // «…либо заплатить 1 жетон кузни и заменить 1 Онагр на 1 Титана»
        // («Мехаморфоз»): the alternative that names a price pays it
        // before the model is exchanged.
        if (step.pay && step.pay.kind) {
            if ((p.assets[step.pay.kind] || 0) < (step.pay.n || 1)) {
                R.log(state, seat, 'Не хватает жетона: ' + step.pay.kind + '.');
                return null;
            }
            p.assets[step.pay.kind] -= (step.pay.n || 1);
            R.log(state, seat, state.players[seat].name + ' платит жетон: '
                + (R.assetName ? R.assetName(step.pay.kind) : step.pay.kind) + '.');
        }
        for (const u of list) {
            // Both models come from the supply: the new one stands up
            // unrouted, the old one goes back to the reserve.
            if ((p.supply.units[def.id] || 0) <= 0) break;
            p.supply.units[def.id]--;
            if (u.unit) p.supply.units[u.unit] = (p.supply.units[u.unit] || 0) + 1;
            u.unit = def.id;
            u.routed = false;
            R.log(state, seat, state.players[seat].name + ' заменяет отряд на «' + def.name + '».');
        }
        return null;
    }
}
