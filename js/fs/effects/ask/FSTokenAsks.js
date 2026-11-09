// FSTokenAsks.js — вопросы шага: жетоны боя.
//
// Одна группа веток бывшего switch в FS_EFFECTS.step(), который решает,
// ЧТО шаг спросит у игрока. Тело каждого шага перенесено дословно;
// окружение — параметр effects и рамка шага f (FSStepContext).

class TokenAsks {
    static ops = ['gainToken', 'loseToken', 'keepTokens', 'loseReinforcement', 'gainTokensLater', 'foeSpendOrPay'];

    static gainToken(effects, f) {
        const { R, state, seat, step, ctx, combat, inCombat, side, foe, p } = f;
        const n = effects.count(R, state, seat, step, ctx);
        if (!inCombat) return null;
        // «если ни один из ваших отрядов не отступил во время этого
        // раунда» («Притворное отступление»): the check belongs to the
        // END of the round, so the tokens arrive in the next one.
        if (step.cond && step.cond.noRetreat) {
            CombatPlans.of(combat).addNoRetreatPlan({
                seat, side, kind: step.kind || 'att', n,
            });
            R.log(state, seat, p.name + ': жетоны ждут конца раунда без отступления.');
            return null;
        }
        // «получите 2 `def. token`, если оппонент не удалит 1 `def. cube`»
        // — the opponent is asked for the cube first: paid, the tokens
        // are not given at all.
        if (step.avoid && step.avoid.by === 'foe' && !step.avoidAsked && foe !== null) {
            const ask = effects.avoidQuestion(R, state, foe, step, combat, side);
            if (ask) {
                step.avoidAsked = true;
                return ask;
            }
        }
        const s2 = side;
        CombatCubes.of(combat).add(s2, step.kind, n);
        R.log(state, seat, state.players[seat].name + ' получает ' + n + ' ' + (step.kind === 'att' ? 'жетонов атаки' : 'жетонов обороны') + '.');
        return null;
    }

    static loseToken(effects, f) {
        const { R, state, seat, step, ctx, combat, inCombat, side, target } = f;
        const n = effects.count(R, state, seat, step, ctx);
        if (!inCombat) return null;
        const s2 = target === seat ? side : (CombatSides.foe(side));
        CombatCubes.of(combat).take(s2, step.kind, n);
        R.log(state, target, state.players[target].name + ' теряет ' + n + ' ' + (step.kind === 'att' ? 'жетонов атаки' : 'жетонов обороны') + '.');
        return null;
    }

    static keepTokens(effects, f) {
        const { step, combat, side } = f;
        // «do not discard your def. tokens at the end of this round of
        // combat» — the side that played the card keeps the tokens of
        // the kind the card names («Шустрое судно» keeps `def. token`,
        // «Гнев машины» keeps `att. token`).
        // The card keeps the tokens of the round it was played in — the next
        // round discards them as usual.
        if (combat) CombatPlans.of(combat).keepTokens(side, step.kind);
        return null;
    }

    static loseReinforcement(effects, f) {
        const { R, state, seat, step, inCombat, side, target } = f;
        if (!inCombat) return null;
        const s2 = target === seat ? side : (CombatSides.foe(side));
        const n = step.n === undefined ? 1 : step.n;
        R.loseReinforcementTokens(state, s2, n);
        step.done = n > 0;
        return null;
    }

    static gainTokensLater(effects, f) {
        const { R, state, seat, step, combat, inCombat, side, p } = f;
        if (!inCombat) return null;
        const kind = step.kind === 'att' ? 'att' : 'def';
        CombatPlans.of(combat).addLaterToken({ side, kind, n: step.n || 1 });
        R.log(state, seat, p.name + ' получит ' + (step.n || 1) + ' жетон(ов) '
            + (kind === 'att' ? 'атаки' : 'обороны') + ' в следующем раунде боя.');
        return null;
    }

    static foeSpendOrPay(effects, f) {
        const { step, combat, inCombat, side } = f;
        if (!inCombat || step.stage === 'dice') return null;
        const foeSide = CombatSides.foe(side);
        const options = CombatTurn.of(combat).slots(foeSide, d => d === step.kind);
        const need = step.n || 3;
        if (!options.length) {
            return { replace: [{ op: 'gainToken', n: (step.per || 2) * need, kind: 'att', who: 'me' }] };
        }
        if (step.optional) {
            return { question: {
                kind: 'yesno', who: effects.seatOf(combat, foeSide), op: 'foeSpendOrPay',
                text: 'Потратить ' + need + ' `morale cube`?',
            } };
        }
        step.stage = 'dice';
        return { question: {
            kind: 'dice', who: effects.seatOf(combat, foeSide), diceSide: foeSide,
            op: 'foeSpendOrPay', n: Math.min(need, options.length), options,
            any: true, text: 'Какие `morale cube` потратить?',
        } };
    }
}
