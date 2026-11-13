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
        // Recheck at both stages: a loaded or stale question must not charge
        // for a pair when only part of it remains in the supply.
        if (effects.fullSupplyPlacement(step)) {
            const need = Math.max(1, step.left !== undefined ? step.left : (step.n || 1));
            if ((p.supply.units[def.id] || 0) < need || !effects.canOfferPlacement(R, state, seat, step)) {
                return { ok: false, error: 'Для платного размещения нужны все отряды, материалы и подходящий мир.' };
            }
        }
        const deal = OrderDeal.of(state.order);
        const off = step.discount && deal ? deal.placementDiscount : 0;
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
            if (step.dest === 'movedFactoryWorld') {
                areas = areas.filter(a => R.canPlaceUnit(state, seat, a.system, a.pos, def).ok);
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
        if (step.dest === 'movedFactoryWorld'
            && (!effects.areasForAbility(R, state, seat, step.dest).some(x => x.system === area.system && x.pos === area.pos)
                || !R.canPlaceUnit(state, seat, area.system, area.pos, def).ok)) return null;
        // A card can name multiple free models. The printed area capacity is
        // checked after the order or event phase, not during placement.
        const want = Math.max(1, step.left !== undefined ? step.left : (step.n || 1));
        if (step.payMateriel) {
            // Pay the fixed price only after the destination and the required
            // supply have been checked. Other placements may still be partial.
            const legal = effects.areasForAbility(R, state, seat, step.dest)
                .some(x => x.system === area.system && x.pos === area.pos);
            if (!legal || (p.materiel || 0) < step.payMateriel
                || (p.supply.units[def.id] || 0) <= 0) return null;
            R.player(state, seat).payMateriel(step.payMateriel);
            R.log(state, seat, p.name + ' тратит ' + step.payMateriel + ' материи.');
        }
        let placed = 0;
        for (let i = 0; i < want; i++) {
            if ((p.supply.units[def.id] || 0) <= 0) break;
            // «купить 1 отряд» — the ability buys at the printed price.
            if (step.buy) {
                const forge = R.effectUnitForgeCost(state, seat, def, !!step.bypassCommandLevel);
                if ((p.materiel || 0) < price || forge === null) {
                    R.log(state, seat, state.players[seat].name + ' не может оплатить «' + def.name + '».');
                    break;
                }
                R.player(state, seat).payMateriel(price);
                if (forge) R.player(state, seat).payAsset('forge', forge);
                R.log(state, seat, state.players[seat].name + ' тратит ' + price + ' материи'
                    + (forge ? ' и жетонов кузни: ' + forge : '') + '.');
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
            const price = effects.structureCost(R, step, t);
            if (!step.free && p.materiel < price) return { ok: false, error: 'Не хватает материи.' };
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
        if (!effects.structureAreas(R, state, seat, step)
            .some(a => a.system === area.system && a.pos === area.pos)) return null;
        const price = effects.structureCost(R, step, step.kind);
        // The plastic of the structures is shared and counted on the board.
        const can = R.canTakeStructure(state, seat, step.kind);
        if (!can.ok) return { ok: false, error: can.error };
        const payment = (step.free ? 0 : price) + (step.materielPayment || 0);
        if (p.materiel < payment) return { ok: false, error: 'Не хватает материи.' };
        // A free structure can still have a separate printed activation price.
        if (payment) R.player(state, seat).payMateriel(payment);
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
        let placed = 0;
        while (n > 0) {
            p.supply.units[def.id]--;
            R.addUnit(state, seat, def.id, area.system, area.pos);
            placed++;
            n--;
        }
        R.log(state, seat, state.players[seat].name + ' размещает «' + def.name + '» бесплатно: ' + placed + '.');
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
        const { R, state, seat, step, answer } = f;
        if (!step.source) {
            const sources = R.orderMoveSources(state, seat);
            if (!sources.includes(answer.system)) return null;
            step.source = answer.system;
            return { question: {
                kind: 'systems', who: seat, op: 'placeOrderAny', stage: 'destination',
                options: R.orderMoveTargets(state, seat, step.source),
                text: 'В какую смежную систему переложить приказ?',
            } };
        }
        // Recheck the top and destination when the second answer arrives.
        if (!R.orderMoveTargets(state, seat, step.source).includes(answer.system)) return null;
        const from = R.system(state, step.source);
        const target = R.system(state, answer.system);
        const token = from.tokens.pop();
        token.faceUp = false;
        target.tokens.push(token);
        // The moved token stays facedown, so the public log must not reveal it.
        R.log(state, seat, state.players[seat].name + ' перекладывает закрытый приказ из системы '
            + from.tile + ' в систему ' + target.tile + '.');
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
        R.board(state).moveUnit(u, answer.area, { seat });
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
            if (rec.tokenSide) {
                if (!CombatTokens.of(combat).restoreFallen(rec.tokenSide, rec.tokenIndex)) continue;
            } else if (alive) {
                R.restoreUnit(state, alive);
            } else if (rec.destroyed) {
                const field = BattleField.of(combat);
                // The model returned to supply when destroyed. Putting it back
                // on the board must take that same model out of the supply.
                if ((p.supply.units[rec.def] || 0) <= 0) continue;
                p.supply.units[rec.def]--;
                R.addUnit(state, seat, rec.def, field.system, field.pos);
            } else continue;
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
            R.restoreUnit(state, u);
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
        // Never spend a token for a replacement that cannot be made.
        if ((p.supply.units[def.id] || 0) <= 0) return null;
        // «…либо заплатить 1 жетон кузни и заменить 1 Онагр на 1 Титана»
        // («Мехаморфоз»): the alternative that names a price pays it
        // before the model is exchanged.
        if (step.pay && step.pay.kind) {
            if (!R.player(state, seat).payAsset(step.pay.kind, step.pay.n || 1)) {
                R.log(state, seat, 'Не хватает жетона: ' + step.pay.kind + '.');
                return null;
            }
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
            R.restoreUnit(state, u);
            R.log(state, seat, state.players[seat].name + ' заменяет отряд на «' + def.name + '».');
        }
        return null;
    }
}
