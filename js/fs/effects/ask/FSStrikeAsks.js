// FSStrikeAsks.js — вопросы шага: орбитальный удар.
//
// Одна группа веток бывшего switch в FS_EFFECTS.step(), который решает,
// ЧТО шаг спросит у игрока. Тело каждого шага перенесено дословно;
// окружение — параметр effects и рамка шага f (FSStepContext).

class StrikeAsks {
    static ops = ['strikeBonus', 'strikeReward', 'strikeTakeStructures', 'strikeHealthDown', 'strikeFirst', 'strikeFirstPick', 'strikeDestroyOne', 'strikeRouteDamaged', 'assignDamage', 'extraDamage', 'damageFirst', 'damageOwnRouted', 'damageOneByOne', 'repeatDamage', 'damageStartTokens', 'combatStartMorale', 'combatLength', 'deferDamage', 'noDamageRetreat', 'noReinforce', 'ignoreFoeAtt', 'ignoreBastion', 'ignoreExcess', 'destroyRouted', 'destroyRoutedFoe', 'endRoundReinforce'];

    static strikeBonus(effects, f) {
        const { R, state, seat, step } = f;
        if (state.order && state.order.phase === 'strike' && state.order.seat === seat) {
            state.order.strikeBonus = (state.order.strikeBonus || 0) + (step.n || 0);
            R.log(state, seat, state.players[seat].name + ' добавляет ' + (step.n || 0) + ' к урону удара.');
            return null;
        }
        return null;
    }

    static strikeReward(effects, f) {
        const { state, step } = f;
        if (state.order) {
            const reward = step.first
                ? { first: true, maxKl: step.maxKl === undefined ? null : step.maxKl }
                : (step.destroyOne ? { destroyOne: true }
                    : (step.routeDamaged ? { routeDamaged: true }
                        : (step.units
                            ? { units: step.units }
                            : { asset: step.asset, n: step.n || 1 })));
            const list = state.order.strikePays || (state.order.strikePays = []);
            if (list.length) list[list.length - 1].reward = reward;
            state.order.strikeReward = reward;
        }
        return null;
    }

    static strikeTakeStructures(effects, f) {
        const { R, state, seat, step } = f;
        // «Изъяны плоти»: the upgrade is burned before the strike, the
        // cubes it pays with are the ones the strike rolls — the order
        // remembers the price and the world answers for it later.
        if (state.order && state.order.seat === seat) {
            state.order.strikeTake = { n: step.n || 1, kind: step.kind || 'def' };
            R.log(state, seat, state.players[seat].name
                + ': постройки мира удара будут взяты под контроль за '
                + (step.n || 1) + ' куб. обороны.');
        }
        return null;
    }

    static strikeHealthDown(effects, f) {
        const { R, state, seat, step } = f;
        // «временно убавить здоровье всех юнитов в атакуемом мире на 1»
        // («Заряд радиации»): the strike that follows is deadlier — the
        // health of the units of the world is lower while it lasts.
        if (state.order && state.order.seat === seat) {
            state.order.strikeHealthDown = (state.order.strikeHealthDown || 0) + (step.n || 1);
            R.log(state, seat, state.players[seat].name
                + ': здоровье отрядов в мире удара ниже на ' + state.order.strikeHealthDown + '.');
        }
        return null;
    }

    static strikeFirst(effects, f) {
        const { state, step } = f;
        if (state.order) {
            state.order.strikeFirstWanted = true;
            state.order.strikeFirstKl = step.maxKl === undefined ? 0 : step.maxKl;
        }
        step.done = true;
        return null;
    }

    static strikeFirstPick(effects, f) {
        const { R, state, seat, step } = f;
        const order = state.order;
        const planned = order && order.strikePlanned;
        if (!planned) return null;
        const list = (planned.victims || [])
            .map(id => state.units.find(u => u.id === id))
            .filter(Boolean)
            .filter(u => {
                const def = R.unitOf(state, u);
                if (step.anyKl || step.maxKl === null) return !!def;
                return def && (def.kl || 0) <= (step.maxKl === undefined ? 0 : step.maxKl);
            });
        if (!list.length) return null;
        return { question: { kind: 'units', who: seat, op: 'strikeFirstPick', n: 1, options: list.map(u => u.id), text: 'Какой отряд получит урон первым?' } };
    }

    static strikeDestroyOne(effects, f) {
        const { state, seat, step } = f;
        const list = state.units.filter(u => u.seat !== seat
            && u.system === step.system && u.area === step.pos).map(u => u.id)
            .concat(state.structures.filter(st => st.seat !== seat
                && st.system === step.system && st.area === step.pos).map(st => st.id));
        if (!list.length) return null;
        return { question: { kind: 'units', who: step.defender >= 0 ? step.defender : seat,
            op: 'strikeDestroyOne', n: 1, options: list,
            text: 'Какой отряд или постройку уничтожить?' } };
    }

    static strikeRouteDamaged(effects, f) {
        const { step } = f;
        if (!(step.options || []).length) return null;
        return { question: { kind: 'units', who: step.attacker,
            op: 'strikeRouteDamaged', n: 1, options: step.options.slice(),
            text: 'Какой получивший повреждения отряд деморализовать?' } };
    }

    static assignDamage(effects, f) {
        const { R, state, seat, combat, inCombat, side, p } = f;
        if (!inCombat) return null;
        combat.assignDamage = { seat: seat, side: side };
        R.log(state, seat, p.name + ' сам назначает урон отрядам и бастионам противника.');
        return null;
    }

    static extraDamage(effects, f) {
        const { seat, step, combat, inCombat, side, foe } = f;
        if (!inCombat) return null;
        // The extra damage goes to one side or to both. The «foe» of a
        // card that offers «the opponent takes 3 more damage» is the side
        // other than the card's player: the role is fixed for this combat.
        if (step.who === 'both') combat.extraDamageBoth = (combat.extraDamageBoth || 0) + (step.n || 0);
        else if (step.who === 'foe') {
            combat.extraDamageFoe = (combat.extraDamageFoe || 0) + (step.n || 0);
            combat.extraDamageFoeSide = (seat === combat.attacker) ? 'defender' : 'attacker';
        }
        else combat.extraDamage = (combat.extraDamage || 0) + (step.n || 0);
        return null;
    }

    static damageFirst(effects, f) {
        const { R, state, seat, step, combat, inCombat, foe } = f;
        if (!inCombat) return null;
        const foeSeat = foe;
        const list = state.units.filter(u => {
            if (u.seat !== foeSeat || u.system !== combat.system || u.area !== combat.pos) return false;
            if (step.anyFoe) return !u.routed;
            const def = R.unitOf(state, u);
            return !!def && [2, 3].includes(def.kl || 0);
        }).map(u => u.id);
        for (const st of state.structures) {
            if (st.seat !== foeSeat || st.type !== 'bastion') continue;
            if (st.system !== combat.system || st.area !== combat.pos) continue;
            list.push(st.id);
        }
        if (!list.length) return null;
        return { question: { kind: 'units', who: seat, op: 'damageFirst', n: 1, options: list, text: 'Какой отряд или бастион противника получает урон первым?' } };
    }

    static damageOwnRouted(effects, f) {
        const { R, state, seat, combat, inCombat, side } = f;
        // «на этапе нанесения урона в этом раунде вы можете нанести его
        // вашим деморализованным отрядам» («Авангард скитариев»): for the
        // rest of this execution round the routed units of the side may
        // be chosen for the damage as well.
        if (!inCombat) return null;
        combat.ownRoutedDamage = combat.ownRoutedDamage || {};
        combat.ownRoutedDamage[side] = combat.round;
        R.log(state, seat, state.players[seat].name + ' может нанести урон своим деморализованным отрядам в этом раунде.');
        return null;
    }

    static damageOneByOne(effects, f) {
        const { combat } = f;
        if (combat) combat.damageOneByOne = true;
        return null;
    }

    static repeatDamage(effects, f) {
        const { combat } = f;
        if (combat) combat.repeatDamage = true;
        return null;
    }

    static damageStartTokens(effects, f) {
        const { R, state, seat, step, combat, inCombat, side, p } = f;
        if (!inCombat) return null;
        const foeSide = CombatSides.foe(side);
        combat.damageStartTokens = combat.damageStartTokens || [];
        combat.damageStartTokens.push({
            side: foeSide, kind: step.kind || 'att', n: step.n || 1, round: combat.round,
        });
        R.log(state, seat, p.name + ': в начале шага повреждений противник теряет '
            + (step.n || 1) + ' жетон(ов) атаки.');
        return null;
    }

    static combatStartMorale(effects, f) {
        const { state, seat, step } = f;
        if (state.order && state.order.seat === seat) {
            state.order.chaosCombatMorale = (state.order.chaosCombatMorale || 0) + (step.n || 1);
        }
        return null;
    }

    static combatLength(effects, f) {
        const { step, combat } = f;
        if (combat) combat.maxRounds = step.n || 1;
        return null;
    }

    static deferDamage(effects, f) {
        const { R, state, seat, step, combat, inCombat, p } = f;
        if (!inCombat) return null;
        combat.deferDamage = { seat, round: combat.round, steps: step.steps || [] };
        step.done = true;
        R.log(state, seat, p.name + ': эффект карты сработает в конце шага повреждений.');
        return null;
    }

    static noDamageRetreat(effects, f) {
        const { seat, step, combat, inCombat } = f;
        if (!inCombat) return null;
        combat.noDamageRetreat = combat.noDamageRetreat || [];
        combat.noDamageRetreat.push({ seat, round: combat.round, steps: step.steps || [] });
        step.done = true;
        return null;
    }

    static noReinforce(effects, f) {
        const { seat, step, combat, foe } = f;
        if (combat) {
            combat.noReinforce = true;
            // «Ваш противник не сможет использовать жетоны подкрепления
            // во время всего боя» («Тень в варпе»): the ban follows the
            // owner of the card, whoever plays the round.
            combat.noReinforceSeat = step.who === 'foe' ? foe : seat;
        }
        return null;
    }

    static ignoreFoeAtt(effects, f) {
        const { combat } = f;
        if (combat) combat.ignoreFoeAtt = true;
        return null;
    }

    static ignoreBastion(effects, f) {
        const { state } = f;
        if (state.order) state.order.ignoreBastion = true;
        return null;
    }

    static ignoreExcess(effects, f) {
        const { R, state, seat, combat, inCombat, side, p } = f;
        if (!inCombat) return null;
        const chosen = (combat.damageFirst || [])
            .filter(x => x && x.round === combat.round).pop();
        if (!chosen) return null;
        combat.ignoreExcess = { side: chosen.side, id: chosen.id, round: combat.round };
        R.log(state, seat, p.name + ': урон сверх здоровья выбранной цели теряется.');
        return null;
    }

    static destroyRouted(effects, f) {
        const { combat } = f;
        if (combat) combat.destroyRouted = true;
        return null;
    }

    static destroyRoutedFoe(effects, f) {
        const { R, state, seat, step, combat, inCombat, p } = f;
        if (!inCombat) return null;
        combat.destroyRoutedFoe = {
            seat, round: combat.round,
            avoid: step.avoid || { kind: 'def', n: 1 },
        };
        R.log(state, seat, p.name + ': деморализованные отряды противника будут уничтожены до конца раунда.');
        step.done = true;
        return null;
    }

    static endRoundReinforce(effects, f) {
        const { R, state, seat, combat, inCombat, p } = f;
        if (!inCombat) return null;
        combat.endRoundPlans = combat.endRoundPlans || [];
        combat.endRoundPlans.push({ seat, round: combat.round, fired: false });
        R.log(state, seat, p.name + ': «Кауйон» ждёт конца раунда.');
        return null;
    }
}
