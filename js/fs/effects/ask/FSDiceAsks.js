// FSDiceAsks.js — вопросы шага: кубики.
//
// Одна группа веток бывшего switch в FS_EFFECTS.step(), который решает,
// ЧТО шаг спросит у игрока. Тело каждого шага перенесено дословно;
// окружение — параметр effects и рамка шага f (FSStepContext).

class DiceAsks {
    static ops = ['stealMostDie', 'gainDie', 'loseDie', 'rerollDie', 'spendDie', 'flipDie', 'rerollValue', 'stealDie', 'convertFoeDice', 'setDie', 'loseDieIfMore', 'rerollAll', 'moveUnitToCombatForDice'];

    static stealMostDie(effects, f) {
        const { seat, step, combat, inCombat, side } = f;
        // «противник теряет 1 `att. cube`, 1 `def. cube` или 1 `morale
        // cube` — в зависимости от того, чего больше всего. Если
        // одинаково, выбираете Вы. Затем получите … того же»
        // («Аколыты-гибриды»).
        if (!inCombat) return null;
        const foe = CombatSides.foe(side);
        const kinds = step.kinds || ['att', 'def', 'morale'];
        const live = d => d !== null && d !== undefined;
        const counts = {};
        for (const k of kinds) counts[k] = (combat.dice[foe] || []).filter(d => d === k).length;
        const have = kinds.filter(k => counts[k] > 0);
        if (!have.length) return null;
        if (!step.kind) {
            const max = Math.max.apply(null, have.map(k => counts[k]));
            const top = have.filter(k => counts[k] === max);
            if (top.length > 1) {
                // «Если одинаково, выбираете Вы».
                return {
                    question: {
                        kind: 'choice', who: seat, op: 'stealMostDie',
                        options: top.map(k => ({ op: 'stealMostDie', kind: k, kinds: kinds, gain: step.gain, text: effects.kindName(k) })),
                        text: 'Какой кубик отнять у противника?',
                    },
                };
            }
            step.kind = top[0];
        }
        return { question: { kind: 'yesno', who: seat, op: 'stealMostDie', kind2: step.kind, text: 'Отнять у противника ' + effects.kindName(step.kind) + '?' } };
    }

    static gainDie(effects, f) {
        const { R, state, seat, step, ctx, combat, inCombat, side, foe } = f;
        let n = effects.count(R, state, seat, step, ctx);
        if (step.inBattle && combat && step.per === 'unit') {
            // "in the reinforce step" — the units of this battle, not the board.
            const here = state.units.filter(u => u.seat === seat && !u.routed
                && u.system === combat.system && u.area === combat.pos
                && effects.unitFits(R.unitOf(state, u), step.filter));
            n = (step.n || 1) * (here.length
                + (step.filter ? 0 : R.tokenUnits(state, side).alive));
        }
        if (!inCombat) {
            // «Во время этого орбитального удара получите 1 `any cube`»
            // («Набег жнецов»): the cube of the strike is rolled, and only
            // its `att` face adds a hit to the strike.
            if (state.order && state.order.phase === 'strike' && state.order.seat === seat) {
                let bonus = 0;
                const faces = [];
                for (let i = 0; i < n; i++) {
                    const face = step.kind === 'any' ? R.rollDice(state, 1)[0] : step.kind;
                    if (face === 'att') bonus += 1;
                    faces.push(face);
                }
                // The cube the card gave is a cube of the player: the
                // payment of «Разведка генокрадов» may spend it.
                StrikePlan.of(state.order).addDice(faces).addBonus(bonus);
                R.log(state, seat, state.players[seat].name + ' получает кубик для удара с орбиты'
                    + (bonus ? ': он выпал на атаку.' : ': он не выпал на атаку.'));
            }
            return null;
        }
        // The condition of the text: "if the opponent has a die of this kind".
        if (step.onlyIfFoeHas) {
            const s2 = CombatSides.foe(side);
            if (!(combat.dice[s2] || []).includes(step.onlyIfFoeHas)) return null;
        }
        // «… для того, чтобы получить 1 `any cube`» (the opponent's
        // branch of «Соблазны Хаоса»): the die belongs to the OTHER side.
        const dSide = step.who === 'foe'
            ? (CombatSides.foe(side)) : side;
        // No more than DICE_MAX dice in a combat: a card that gives a
        // die past the limit simply adds nothing.
        const room = Math.max(0, R.DICE_MAX - combat.dice[dSide].filter(Boolean).length);
        const got = Math.min(n, room);
        for (let i = 0; i < got; i++) {
            combat.dice[dSide].push(step.kind === 'any' ? R.rollDice(state, 1)[0] : step.kind);
        }
        R.log(state, seat, (step.who === 'foe' ? 'Противник получает '
            : state.players[seat].name + ' получает ') + got + ' кубик(ов)'
            + (step.kind !== 'any' ? ' ' + effects.kindName(step.kind) : '') + '.'
            + (got < n ? ' Больше восьми кубиков быть не может.' : ''));
        return null;
    }

    static loseDie(effects, f) {
        const { R, state, seat, step, combat, inCombat, side } = f;
        if (!inCombat) return null;
        const s2 = CombatSides.foe(side);
        const live = d => d !== null && d !== undefined;
        const options = combat.dice[s2].map((d, i) => i)
            .filter(i => live(combat.dice[s2][i])
                && (step.kind === 'any' || combat.dice[s2][i] === step.kind));
        if (!options.length) return null;
        const n = Math.min(step.n, options.length);
        // The dice of one kind are alike and a loss of all that is possible is
        // not a choice either: the engine takes them itself, without a question.
        if (step.kind !== 'any' || n >= options.length) {
            const gone = options.slice(0, n);
            for (const i of gone) combat.dice[s2][i] = null;
            R.log(state, seat, (s2 === side ? 'Вы теряете ' : 'Противник теряет ') + n
                + ' кубик(ов)' + (step.kind !== 'any' ? ' ' + effects.kindName(step.kind) : '') + '.');
            return null;
        }
        return { question: { kind: 'dice', who: effects.seatOf(combat, s2), diceSide: s2, op: 'loseDie', n, options, kind2: step.kind, text: 'Какие кубики теряются?' } };
    }

    static rerollDie(effects, f) {
        const { R, state, seat, step, ctx, combat, inCombat, side } = f;
        if (!inCombat) return null;
        const s2 = effects.diceSideOf(combat, side, step);
        // The text may name a union of kinds: «перебросьте 2 `def. cube`
        // и/или `morale cube`» — the dice of any listed kind are offered.
        const kinds = Array.isArray(step.kinds) && step.kinds.length ? step.kinds : [step.kind];
        const fits = d => kinds.includes('any') || kinds.includes(d);
        const options = combat.dice[s2].map((d, i) => i)
            .filter(i => combat.dice[s2][i] !== null && combat.dice[s2][i] !== undefined && fits(combat.dice[s2][i]));
        if (!options.length) return null;
        if (step.all) {
            // All the dice of the kind are rerolled.
            for (const i of options) combat.dice[s2][i] = R.rollDice(state, 1)[0];
            R.log(state, seat, state.players[seat].name + ' перебрасывает кубики.');
            return null;
        }
        const want = effects.count(R, state, seat, step, ctx);
        const q = { question: { kind: 'dice', who: effects.diceAsker(combat, side, step), diceSide: s2, op: 'rerollDie', n: Math.min(want, options.length), options, kind2: step.kind, kinds, text: 'Какие кубики перебросить?' } };
        // «вы обязаны перебросить 2 `def. cube` и/или `morale cube`» —
        // fewer dice than asked for is all that can be done.
        return q;
    }

    static spendDie(effects, f) {
        const { R, state, seat, step, ctx, combat, inCombat, side } = f;
        if (!inCombat) return null;
        const s2 = effects.diceSideOf(combat, side, step);
        // A step may cover a union of cube kinds («тратится def. или morale»):
        // one spend of one die of ANY listed kind resolves the card.
        const kinds = Array.isArray(step.kinds) && step.kinds.length ? step.kinds : [step.kind];
        const match = d => d !== null && d !== undefined && (kinds.includes('any') || kinds.includes(d));
        const options = combat.dice[s2].map((d, i) => i).filter(i => match(combat.dice[s2][i]));
        // «за каждого недеморализованного Воина или Корабля-Улья
        // потратьте 1 кубик» («Выводок воинов», другая редакция): one
        // cube for every unit the card counts.
        const want0 = step.per ? effects.count(R, state, seat, step, ctx) : step.n;
        if (!options.length) {
            // «Потратьте любое количество `morale cube`» («Величие роя»):
            // zero is a legal answer, so the card goes on.
            if (step.any) return null;
            // «Потратьте … чтобы …» — a payment that cannot be made
            // buys nothing: the rest of the ability does not happen.
            R.log(state, seat, state.players[seat].name + ' нечем оплатить: «'
                + String(step.ability || '').slice(0, 60) + '» не выполняется.');
            return step.pick ? { stop: true } : null;
        }
        if (step.all) {
            // All the dice of the kind are spent: they lie on the
            // ground, spent in place — never spliced out, so the
            // remaining dice keep their identity.
            for (const i of options) combat.dice[s2][i] = null;
            R.log(state, seat, state.players[seat].name + ' тратит кубики.');
            return null;
        }
        return {
            question: {
                kind: 'dice', who: effects.diceAsker(combat, side, step), diceSide: s2,
                op: 'spendDie', n: Math.max(1, Math.min(want0, options.length)), options,
                kind2: step.kind, kinds,
                // «Потратьте любое количество `morale cube`»: the count
                // is free, so fewer dice than offered may be chosen.
                any: !!step.any,
                text: step.any ? 'Какие кубики потратить? (любое количество)' : 'Какие кубики потратить?',
            },
        };
    }

    static flipDie(effects, f) {
        const { R, state, seat, step, combat, inCombat, side } = f;
        if (!inCombat) {
            // «Вы можете перевернуть 1 из своих `morale cube` на `att.
            // cube`» во время орбитального удара («Маскированная
            // бомбардировка»): the cube of the strike is a hit.
            if (state.order && state.order.phase === 'strike' && state.order.seat === seat) {
                StrikePlan.of(state.order).addBonus(step.n || 1);
                R.log(state, seat, state.players[seat].name + ' обращает кубик удара в атаку.');
            }
            return null;
        }
        const s2 = effects.diceSideOf(combat, side, step);
        const options = combat.dice[s2].map((d, i) => i).filter(i => combat.dice[s2][i] !== null && combat.dice[s2][i] !== undefined && (step.kind === 'any' || combat.dice[s2][i] === step.kind));
        if (!options.length) return null;
        if (step.all) {
            for (const i of options) combat.dice[s2][i] = step.to;
            return null;
        }
        return { question: { kind: 'dice', who: effects.diceAsker(combat, side, step), diceSide: s2, op: 'flipDie', n: Math.min(step.n, options.length), options, kind2: step.kind, text: 'Какие кубики перевернуть на ' + (step.to === 'att' ? 'атаку' : step.to === 'def' ? 'оборону' : 'мораль') + '?' } };
    }

    static rerollValue(effects, f) {
        const { step, combat, inCombat, side } = f;
        if (!inCombat) return null;
        const s2 = effects.diceSideOf(combat, side, step);
        // «Перебросьте все ваши кубики одного типа» («Огонь и
        // продвижение»): the choice is a FACE, not a die index.
        const options = [...new Set((combat.dice[s2] || [])
            .filter(d => d !== null && d !== undefined))];
        if (!options.length) return null;
        return { question: { kind: 'face', who: effects.diceAsker(combat, side, step), diceSide: s2, op: 'rerollValue', options, text: 'Какое значение кубиков перебросить?' } };
    }

    static stealDie(effects, f) {
        const { combat, inCombat, side } = f;
        if (!inCombat) return null;
        const s2 = CombatSides.foe(side);
        const options = combat.dice[s2].map((d, i) => i).filter(i => combat.dice[s2][i] !== null && combat.dice[s2][i] !== undefined);
        if (!options.length) return null;
        return { question: { kind: 'dice', who: effects.seatOf(combat, s2), diceSide: s2, op: 'stealDie', options, text: 'Какой кубик сбросить?' } };
    }

    static convertFoeDice(effects, f) {
        const { step, combat, inCombat, side } = f;
        if (!inCombat) return null;
        const s2 = CombatSides.foe(side);
        const faces = [...new Set(combat.dice[s2])].filter(d => d !== null && d !== undefined);
        if (!faces.length) return null;
        return { question: { kind: 'face', who: effects.seatOf(combat, s2), diceSide: s2, op: 'convertFoeDice', options: faces, n: step.n || 2, text: 'Какие кубики сконвертировать?' } };
    }

    static setDie(effects, f) {
        const { R, state, seat, step, ctx, combat, inCombat, side } = f;
        if (!inCombat) return null;
        const s2 = effects.diceSideOf(combat, side, step);
        const options = combat.dice[s2].map((d, i) => i).filter(i => combat.dice[s2][i] !== null && combat.dice[s2][i] !== undefined);
        if (!options.length) return null;
        // «за каждого недеморализованного воина или крейсер переверните
        // 1 ваш кубик» — one flip per unit, each to any side.
        if (step.left === undefined) {
            const total = step.per ? effects.count(R, state, seat, step, ctx) : (step.n || 1);
            step.left = Math.max(0, total);
        }
        if (!step.left) return null;
        return { question: { kind: 'diceFace', who: effects.diceAsker(combat, side, step), diceSide: s2, op: 'setDie', n: 1, left: step.left, options, text: 'Какой кубик перевернуть и на какую грань? (' + step.left + ')' } };
    }

    static loseDieIfMore(effects, f) {
        const { R, state, seat, step, combat, inCombat, side } = f;
        if (!inCombat) return null;
        const s2 = CombatSides.foe(side);
        const mine = effects.countCubes(R, state, seat, combat, 'morale');
        const theirs = effects.countCubes(R, state, effects.seatOf(combat, s2), combat, 'morale');
        if (theirs <= mine) return null;
        const at = combat.dice[s2].indexOf(step.kind || 'morale');
        if (at < 0) return null;
        combat.dice[s2][at] = null;
        R.log(state, seat, 'Противник теряет кубик морали.');
        return null;
    }

    static rerollAll(effects, f) {
        const { R, state, seat, combat, inCombat } = f;
        if (!inCombat) return null;
        // Both sides roll all of their unspent dice again: the spent
        // stay spent, where they lie.
        for (const s2 of ['attacker', 'defender']) {
            combat.dice[s2] = combat.dice[s2].map(d => d === null || d === undefined ? null : R.rollDice(state, 1)[0]);
        }
        R.log(state, seat, 'Все кубики перебрасываются.');
        return null;
    }

    static moveUnitToCombatForDice(effects, f) {
        const { R, state, seat, combat, inCombat } = f;
        if (!inCombat) return null;
        const around = (R.areasAround ? R.areasAround(state, combat.system, combat.pos) : []) || [];
        const ids = new Set(around.map(a => a.system + ':' + a.pos));
        /** @type {any[]} */
        const list = state.units.filter(u => u.seat === seat && !u.routed
            && ids.has(u.system + ':' + u.area)).map(u => u.id);
        if (!list.length) return null;
        return { question: {
            kind: 'units', who: seat, op: 'moveUnitToCombatForDice', n: 1,
            options: list, text: 'Какой отряд переместить в эту область?',
        } };
    }
}
