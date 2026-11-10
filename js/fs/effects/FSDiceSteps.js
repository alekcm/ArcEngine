// FSDiceSteps.js — шаги эффектов: кубики.
//
// Одна группа веток бывшего switch в FS_EFFECTS.apply(). Тело каждого шага
// перенесено дословно; изменилось только окружение: «движок эффектов» теперь
// приходит параметром effects, а общая рамка шага — объектом f (FSStepContext).

class DiceSteps {
    static ops = ['stealMostDie', 'loseDie', 'rerollDie', 'spendDie', 'flipDie', 'rerollValue', 'stealDie', 'convertFoeDice', 'setDie', 'moveUnitToCombatForDice', 'foeSpendOrPay', 'foePayFork', 'foeRetreatOffer', 'destroyFoeUnlessPays'];

    static stealMostDie(effects, f) {
        const { R, state, seat, step, answer, combat, side } = f;
        if (answer.no) return null;
        const kind = step.kind || answer.kind;
        const s2 = CombatSides.foe(side);
        const turn = CombatTurn.of(combat);
        const at = turn.indexOf(s2, kind);
        if (at < 0) return null;
        turn.take(s2, at);
        R.log(state, seat, state.players[seat].name + ': противник теряет ' + effects.kindName(kind) + '.');
        if (step.gain !== false) {
            const room = turn.room(side);
            if (room > 0) {
                turn.add(side, kind);
                R.log(state, seat, state.players[seat].name + ' получает ' + effects.kindName(kind) + '.');
            }
        }
        return null;
    }

    static loseDie(effects, f) {
        const { answer, combat, side, liveIndex } = f;
        const s2 = CombatSides.foe(side);
        const turn = CombatTurn.of(combat);
        for (const i of (answer.dice || []).slice().sort((a, b) => b - a)) {
            if (liveIndex(s2, i)) turn.take(s2, i);
        }
        return null;
    }

    static rerollDie(effects, f) {
        const { R, state, answer, combat, diceTarget, liveIndex } = f;
        const s2 = diceTarget();
        const turn = CombatTurn.of(combat);
        for (const i of (answer.dice || [])) {
            if (liveIndex(s2, i)) turn.put(s2, i, R.rollDice(state, 1)[0]);
        }
        return null;
    }

    static spendDie(effects, f) {
        const { step, answer, combat, diceTarget, liveIndex } = f;
        const s2 = diceTarget();
        const kinds = Array.isArray(step.kinds) && step.kinds.length ? step.kinds : [step.kind];
        const turn = CombatTurn.of(combat);
        let spent = 0;
        for (const i of (answer.dice || [])) {
            if (liveIndex(s2, i)) { turn.take(s2, i); spent++; }
        }
        // «За каждый потраченный `morale cube` Вы получаете …»
        // («Величие роя»): the gain of the card is counted by the cubes
        // this very payment took, not by the cubes that are left.
        step.spentCount = spent;
        CombatHooks.of(combat).recordSpend(kinds, spent);
        return null;
    }

    static flipDie(effects, f) {
        const { step, answer, combat, diceTarget, liveIndex } = f;
        const s2 = diceTarget();
        const turn = CombatTurn.of(combat);
        for (const i of (answer.dice || [])) {
            if (liveIndex(s2, i)) turn.put(s2, i, step.to);
        }
        return null;
    }

    static rerollValue(effects, f) {
        const { R, state, answer, combat, diceTarget } = f;
        // All the dice of the chosen value are rerolled.
        const s2 = diceTarget();
        const face = answer.face || 'att';
        const turn = CombatTurn.of(combat);
        for (let i = 0; i < turn.dice(s2).length; i++) {
            if (turn.dice(s2)[i] === face) turn.put(s2, i, R.rollDice(state, 1)[0]);
        }
        return null;
    }

    static stealDie(effects, f) {
        const { R, state, seat, answer, combat, side } = f;
        const s2 = CombatSides.foe(side);
        const turn = CombatTurn.of(combat);
        for (const i of (answer.dice || [])) {
            const value = turn.take(s2, i);
            if (value !== null) turn.add(side, value);
        }
        R.log(state, seat, state.players[seat].name + ' забирает кубик противника.');
        return null;
    }

    static convertFoeDice(effects, f) {
        const { R, state, seat, step, answer, combat, side } = f;
        const s2 = CombatSides.foe(side);
        const turn = CombatTurn.of(combat);
        const dice = turn.dice(s2);
        // «… сконвертировать до 2 его кубов определённого значения в
        // любое другое значение по его выбору» («Превосходство машин»):
        // the opponent names the value he converts and then the value he
        // converts it to — both choices are his.
        if (step.face === undefined) {
            step.face = answer.face;
            const names = { att: 'атака', def: 'оборона', morale: 'мораль' };
            const others = ['att', 'def', 'morale'].filter(x => x !== step.face);
            return {
                question: {
                    kind: 'choice', who: effects.seatOf(combat, s2), op: 'convertFoeDice',
                    options: others.map(x => ({ text: names[x] })),
                    text: 'В какое значение превратить кубики?',
                },
            };
        }
        const face = step.face;
        const others = ['att', 'def', 'morale'].filter(x => x !== face);
        const to = others[Number(answer.choice)] || answer.to;
        if (!to) return null;
        const n = Math.min(step.n || 2, dice.filter(d => d === face).length);
        let done = 0;
        for (let i = 0; i < dice.length && done < n; i++) {
            if (dice[i] !== face) continue;
            dice[i] = to;
            done++;
        }
        R.log(state, seat, state.players[effects.seatOf(combat, s2)].name
            + ' конвертирует ' + done + ' своих кубик(ов) в '
            + (to === 'att' ? 'атаку' : to === 'def' ? 'оборону' : 'мораль') + '.');
        return null;
    }

    static setDie(effects, f) {
        const { step, answer, combat, inCombat, side, units, diceSide, diceTarget, liveIndex } = f;
        const s2 = inCombat ? diceTarget() : side;
        const i = answer.dice && answer.dice.length ? answer.dice[0] : -1;
        const turn = CombatTurn.of(combat);
        if (inCombat ? liveIndex(s2, i) : turn.has(s2, i)) turn.put(s2, i, answer.face || 'att');
        step.done = true;
        // «за каждого … переверните 1 ваш кубик» — the next flip is asked
        // until the count of the units is spent.
        if (step.left !== undefined) {
            step.left = Math.max(0, step.left - 1);
            if (step.left > 0) {
                const options = turn.dice(s2).map((d, at) => at).filter(at => turn.has(s2, at));
                if (options.length) {
                    return { question: { kind: 'diceFace', who: effects.diceAsker(combat, side, step), diceSide: s2, op: 'setDie', n: 1, left: step.left, options, text: 'Какой кубик перевернуть и на какую грань? (' + step.left + ')' } };
                }
            }
        }
        return null;
    }

    static moveUnitToCombatForDice(effects, f) {
        const { R, state, seat, step, answer, p, combat, inCombat, side, units } = f;
        if (!inCombat) return null;
        const u = units(answer.units)[0];
        if (!u) return null;
        const def = R.unitOf(state, u);
        if (!def) return null;
        const n = def.combat || 0;
        R.board(state).moveUnit(u, BattleField.of(combat).area, { seat });
        if (typeof R.trimArea === 'function') R.trimArea(state, seat, u.system, u.area);
        const got = Math.min(n, CombatTurn.of(combat).room(side));
        CombatTurn.of(combat).addMany(side, R.rollDice(state, got));
        R.log(state, seat, p.name + ' перемещает «' + def.name + '» и получает '
            + got + ' `any cube`.');
        step.done = true;
        return null;
    }

    // «Если противник не потратит 1 `morale cube`, получите 3 `def. token`»:
    // the question to the opponent is asked by DiceAsks; this branch acts on
    // his answer — pays what he picked, and the second half of the card
    // happens only when he pays less than the price.
    static foePayFork(effects, f) {
        const { R, state, step, answer, combat, side } = f;
        const foeSide = CombatSides.foe(side);
        const foeSeat = CombatSides.seatOf(combat, foeSide);
        const need = step.n || 1;
        const fit = Array.isArray(step.options) ? step.options : [];
        const turn = CombatTurn.of(combat);
        const picked = (answer.dice || []).filter(i => fit.includes(i) && turn.has(foeSide, i)).slice(0, need);
        for (const i of picked) turn.take(foeSide, i);
        if (picked.length) {
            R.log(state, foeSeat, state.players[foeSeat].name + ' платит '
                + picked.length + ' кубик(а) и отменяет эффект.');
        }
        const left = need - picked.length;
        if (left <= 0) {
            // Paid in full: the second half of the card does not happen, and the
            // steps of the refusal must not be spliced in after the step.
            step.then = [];
            step.done = true;
            return null;
        }
        step.done = true;
        return Array.isArray(step.then) && step.then.length
            ? { replace: step.then.slice() }
            : null;
    }

    // «Уничтожьте его, если противник не потратит количество кубиков, равное
    // командному уровню этого отряда» («Сокрушающий гаргант»): the victim is
    // chosen by the owner of the card, and its owner pays the cubes for it.
    static destroyFoeUnlessPays(effects, f) {
        const { R, state, seat, step, answer, combat, inCombat, side } = f;
        if (!inCombat || !combat) return null;
        const foeSide = CombatSides.foe(side);
        const foeSeat = CombatSides.seatOf(combat, foeSide);
        if (foeSeat === null || foeSeat === undefined) return null;
        const turn = CombatTurn.of(combat);
        if (step.stage === 'victim') {
            const victim = (answer.units || []).map(id => state.units.find(u => u.id === id)).filter(Boolean)[0];
            step.stage = 'dice';
            if (!victim) { step.done = true; return null; }
            step.victim = victim.id;
            const def = R.unitOf(state, victim);
            const price = step.perKl && def ? (def.kl || 0) : (step.n || 1);
            const options = turn.slots(foeSide, () => true);
            step.price = price;
            if (!price || !options.length) {
                R.destroyUnit(state, victim);
                R.log(state, seat, state.players[seat].name + ' уничтожает отряд: платить нечем.');
                step.done = true;
                return null;
            }
            step.options = options;
            return { question: {
                kind: 'dice', who: foeSeat, diceSide: foeSide, op: 'destroyFoeUnlessPays',
                n: Math.min(price, options.length), options, any: true,
                text: 'Потратить ' + price + ' кубик(а) или потерять отряд?',
            } };
        }
        const fit = Array.isArray(step.options) ? step.options : [];
        const picked = (answer.dice || []).filter(i => fit.includes(i) && turn.has(foeSide, i)).slice(0, step.price || 1);
        for (const i of picked) turn.take(foeSide, i);
        const victim = state.units.find(u => u.id === step.victim);
        if (victim && picked.length < (step.price || 1)) {
            R.destroyUnit(state, victim);
            R.log(state, seat, state.players[seat].name + ' уничтожает отряд противника.');
        } else if (victim) {
            R.log(state, foeSeat, state.players[foeSeat].name + ' платит и сохраняет отряд.');
        }
        step.done = true;
        return null;
    }

    // «Ваш противник может отступить 1 своим юнитом»: the question is his
    // (DiceAsks). A refusal runs the passage the card names.
    static foeRetreatOffer(effects, f) {
        const { step, answer } = f;
        if (answer.no) { step.done = true; return null; }
        step.done = true;
        const n = step.n || 1;
        return { replace: [{ op: 'retreat', n, pick: true, who: 'foe' }] };
    }

    static foeSpendOrPay(effects, f) {
        const { R, state, seat, step, answer, p, combat, inCombat, side, diceSide } = f;
        if (!inCombat) return null;
        const foeSide = CombatSides.foe(side);
        const dice = CombatTurn.of(combat).dice(foeSide);
        /** @type {any[]} */
        const options = dice.map((d, i) => i).filter(i => dice[i] === step.kind);
        const need = step.n || 3;
        const gain = missing => {
            const n2 = (step.per || 2) * Math.max(0, missing);
            if (n2 > 0) {
                CombatCubes.of(combat).add(side, 'att', n2);
                R.log(state, seat, p.name + ' получает ' + n2 + ' `att. token` '
                    + 'за неоплаченные кубики противника.');
            }
        };
        if (step.stage !== 'dice') {
            if (step.optional && answer.no) { gain(need); step.done = true; return null; }
            if (!options.length) { gain(need); step.done = true; return null; }
            step.stage = 'dice';
            return { question: {
                kind: 'dice', who: effects.seatOf(combat, foeSide), diceSide: foeSide,
                op: 'foeSpendOrPay', n: Math.min(need, options.length), options,
                any: true, text: 'Какие `morale cube` потратить?',
            } };
        }
        const picked = (answer.dice || []).filter(i => options.includes(i));
        for (const i of picked) CombatTurn.of(combat).take(foeSide, i);
        gain(need - picked.length);
        step.done = true;
        return null;
    }
}
