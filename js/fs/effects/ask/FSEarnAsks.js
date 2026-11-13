// FSEarnAsks.js — вопросы шага: доход и траты.
//
// Одна группа веток бывшего switch в FS_EFFECTS.step(), который решает,
// ЧТО шаг спросит у игрока. Тело каждого шага перенесено дословно;
// окружение — параметр effects и рамка шага f (FSStepContext).

class EarnAsks {
    static ops = ['nothing', 'gainMateriel', 'gainAsset', 'takeFoeAsset', 'payMateriel', 'loseAsset', 'gainWorldAssets', 'gainSystemMateriel', 'exchangeMateriel', 'exchangeAsset', 'gainByUnit', 'spendTempMateriel', 'dropTempMateriel', 'collectObjective', 'strikeAllAtt'];

    static nothing() {
        return null;
    }

    // «…перевернуть все ваши кубики, которые вы бросали, на `att. cube`»
    // («Экстерминатус»): nothing to choose, so the work is done here — a step
    // whose branch asks no question is never handed to its executor.
    static strikeAllAtt(effects, f) {
        const { R, state, seat, step } = f;
        if (!state.order || !OrderContext.of(state.order).isSeat(seat)) return null;
        if (!StrikePlan.of(state.order).allAtt) {
            StrikePlan.of(state.order).setAllAtt(true);
            R.log(state, seat, state.players[seat].name + ': все кубики удара будут атакой.');
        }
        step.done = true;
        return null;
    }

    // «собрать маркер цели Инквизиции в дружественном мире в активной системе»:
    // the tokens of that faction that stand in the friendly worlds of the
    // active system; without one there is nothing to collect.
    static collectObjective(effects, f) {
        const { R, state, seat, step } = f;
        const active = state.order ? OrderContext.of(state.order).system : null;
        const list = (state.objectives || []).filter(o => {
            if (step.faction && o.faction !== step.faction) return false;
            if (active && o.system !== active) return false;
            return R.control(state, seat, o.system, o.area) === 'friendly';
        });
        if (!list.length) return null;
        if (list.length === 1) {
            // A step without a question is performed HERE: `run` moves on to the
            // next step without calling the executor of a step that asks nothing.
            step.objective = list[0].id;
            step.done = true;
            R.collectObjective(state, step.objective, seat);
            return null;
        }
        return { question: { kind: 'structures', who: seat, op: 'collectObjective',
            options: list.map(o => o.id), text: 'Какой маркер цели собрать?' } };
    }

    static gainMateriel(effects, f) {
        const { R, state, seat, step, ctx, p } = f;
        const n = effects.count(R, state, seat, step, ctx);
        if (n <= 0) {
            R.log(state, seat, p.name + ' не получает материи: уничтоженных отрядов нет.');
            return null;
        }
        R.player(state, seat).gainMateriel(n);
        R.log(state, seat, p.name + ' получает ' + n + ' материи.');
        return null;
    }

    // «Какой жетон противника забрать?» («Воруй!»): the question offers only
    // the kinds the opponent really has.
    static takeFoeAsset(effects, f) {
        const { R, state, seat } = f;
        const foe = state.players[1 - seat] ? 1 - seat : null;
        if (foe === null) return null;
        const foePlayer = R.player(state, foe);
        const have = ['forge', 'cache', 'reinforcement'].filter(k => foePlayer.assetCount(k) > 0);
        if (!have.length) {
            R.log(state, seat, state.players[seat].name + ': у противника нет жетонов ресурсов.');
            return null;
        }
        return { question: { kind: 'assetType', who: seat, op: 'takeFoeAsset', n: 1,
            options: have, text: 'Какой жетон противника забрать?' } };
    }

    static gainAsset(effects, f) {
        const { R, state, seat, step, ctx, p } = f;
        // «за каждый неконтролируемый или вражеский мир в активной системе» —
        // counted before any question is asked.
        if (step.nFromWorlds === 'enemyOrUncontrolled') {
            const active = state.order ? OrderContext.of(state.order).system : null;
            let count = 0;
            if (active) {
                const sys = Board.of(state).system(active);
                for (const area of (sys ? sys.areas : [])) {
                    if (!area.world) continue;
                    if (effects.areaStanding(state, seat, active, area.pos) !== 'friendly') count++;
                }
            }
            if (count > 0) {
                R.player(state, seat).addAsset(step.kind, count);
                R.log(state, seat, p.name + ' получает жетоны подкрепления: ' + count + ' (за неконтролируемые или вражеские миры).');
            } else {
                R.log(state, seat, 'В активной системе нет неконтролируемых или вражеских миров — жетон подкрепления не получен.');
            }
            return null;
        }
        if (step.kind === 'any') {
            return { question: { kind: 'assetType', who: seat, op: 'gainAsset', n: step.n || 1, options: ['forge', 'cache', 'reinforcement'], text: 'Какой жетон ресурса получить?' } };
        }
        // «… за каждый потраченный `att. cube`» — the payment sets the
        // count, and a payment of nothing buys nothing. The limit of the
        // faction is applied by the one counter, PlayerEntity.addAsset.
        const got = (step.per || step.fromDestroyed)
            ? effects.count(R, state, seat, step, ctx)
            : (step.n || 1);
        if (got <= 0) {
            R.log(state, seat, p.name + ' ничего не заплатил — жетон не получен.');
            return null;
        }
        R.player(state, seat).addAsset(step.kind, got);
        R.log(state, seat, state.players[seat].name + ' получает жетон(ы): ' + step.kind + ' × ' + got + '.');
        return null;
    }

    static payMateriel(effects, f) {
        const { R, state, seat, step, p } = f;
        const n = step.n || 1;
        if ((p.materiel || 0) < n) {
            R.log(state, seat, 'Способность не может быть применена: не хватает материи.');
            const tally = OrderTally.of(state.order);
            if (tally && tally.finishesAfterEffect) tally.finishAfterEffect();
            if (state.order && OrderContext.of(state.order).isSeat(seat)) R.finishOrder(state, seat);
            return { stop: true };
        }
        R.player(state, seat).payMateriel(n);
        R.log(state, seat, p.name + ' тратит ' + n + ' материи.');
        return null;
    }

    static loseAsset(effects, f) {
        const { R, state, step, target } = f;
        const face = R.player(state, target);
        // «вынудите вашего противника сбросить 1 свой жетон подкрепления»
        // («Посланники Векта»): the kind is named, nothing is asked.
        if (step.kind && step.kind !== 'any') {
            if (face.assetCount(step.kind) <= 0) return null;
            face.takeAsset(step.kind, step.n || 1);
            R.log(state, target, state.players[target].name + ' теряет жетон: ' + step.kind + '.');
            step.done = true;
            return null;
        }
        const kinds = ['forge', 'cache', 'reinforcement'].filter(k => face.assetCount(k) > 0);
        if (!kinds.length) return null;
        return { question: { kind: 'assets', who: target, op: 'loseAsset', n: Math.min(step.n || 1, kinds.length), options: kinds, text: 'Какой жетон ресурса теряется?' } };
    }

    static gainWorldAssets(effects, f) {
        const { R, state, seat, step, ctx } = f;
        // «этого мира» — the world chosen by the previous step is the world.
        if (ctx && ctx.world) return effects.gainWorldAssetsBody(R, state, seat, step, ctx.world);
        // The world the step itself names: the world of an orbital strike.
        if (step.world) return effects.gainWorldAssetsBody(R, state, seat, step, step.world);
        // «выбрать неконтролируемый мир. Получите ценные ресурсы этого мира и
        // материалы, равные производственному значению этого мира» («Рейд из
        // Паутины»): the worlds nobody holds, instead of the player's own.
        const worlds = step.uncontrolled
            ? state.systems.flatMap(sys => sys.areas
                .filter(a => a.world && effects.areaStanding(state, seat, sys.id, a.pos) === 'uncontrolled')
                .map(a => ({ system: sys.id, pos: a.pos })))
            : effects.friendlyWorlds(R, state, seat);
        if (!worlds.length) return null;
        return { question: { kind: 'areas', who: seat, op: 'gainWorldAssets', options: worlds, text: 'С какого мира взять ресурсы?' } };
    }

    static gainSystemMateriel(effects, f) {
        const { R, state, seat } = f;
        const systems = R.state ? [] : [];
        const list = state.systems.filter(sys => sys.areas.some(a => R.control(state, seat, sys.id, a.pos) === 'friendly'));
        if (!list.length) return null;
        return { question: { kind: 'systems', who: seat, op: 'gainSystemMateriel', options: list.map(x => x.id), text: 'Из какой системы взять материю?' } };
    }

    static exchangeMateriel(effects, f) {
        const { seat, step } = f;
        const kinds = ['forge', 'cache', 'reinforcement', 'prosperity'];
        return { question: { kind: 'assetType', who: seat, op: 'exchangeMateriel', options: kinds, n: step.n || 1, gain: step.gain || 1, text: 'Какой жетон ресурса получить?' } };
    }

    static exchangeAsset(effects, f) {
        const { R, state, seat, step } = f;
        const kinds = ['forge', 'cache', 'reinforcement', 'prosperity'].filter(k => R.player(state, seat).assetCount(k) > 0);
        if (!kinds.length) return null;
        return { question: { kind: 'assetType', who: seat, op: 'exchangeAsset', options: kinds, n: step.n || 1, gain: step.gain || 1, text: 'Какой жетон ресурса потратить?' } };
    }

    static gainByUnit(effects, f) {
        const { R, state, seat, step, combat, inCombat, side } = f;
        // «выберите 1 ваш недеморализованный отряд и получите количество
        // `att. token`, равное его боевому уровню» («Ржавые сталкеры»):
        // the unit is chosen, the tokens are its printed combat value.
        if (!inCombat) return null;
        const units = effects.unitsOf(R, state, seat, combat, { routed: false });
        if (!units.length) return null;
        if (!step.picked) {
            return { question: { kind: 'units', who: seat, op: 'gainByUnit', n: 1, options: units.map(u => u.id), text: 'Какой отряд выбрать?' } };
        }
        const n = step.pickedValue || 0;
        if (n > 0) {
            CombatCubes.of(combat).add(side, step.kind, n);
            R.log(state, seat, state.players[seat].name + ' получает ' + n + ' '
                + (step.kind === 'att' ? 'жетонов атаки' : 'жетонов обороны')
                + ' по боевому значению выбранного отряда.');
        }
        return null;
    }

    static spendTempMateriel(effects, f) {
        const { R, state, seat, step, p } = f;
        const fight = OrderFight.of(state.order);
        const temp = fight ? fight.tempMateriel : 0;
        if (temp <= 0) return null;
        fight.grantTemp(p.materiel || 0);
        R.player(state, seat).gainMateriel(temp);
        R.log(state, seat, p.name + ' временно получает материю: ' + temp + '.');
        return {
            replace: [
                {
                    op: 'placeUnit', n: 99, buy: true, pick: true, who: 'me',
                    unitType: step.unitType || 'ship',
                    dest: step.dest || 'friendlyOrUncontrolledVoidActive',
                },
                { op: 'dropTempMateriel', who: 'me' },
            ],
        };
    }

    static dropTempMateriel(effects, f) {
        const { R, state, seat, p } = f;
        const fight = OrderFight.of(state.order);
        if (!fight || !fight.hasTemp) return null;
        // What was not spent on the ships disappears.
        const left = fight.unspentTemp(p.materiel || 0);
        R.player(state, seat).payMateriel(left);
        R.log(state, seat, p.name + ': неиспользованный остаток материалов пропадает (' + left + ').');
        fight.clearTemp();
        return null;
    }
}
