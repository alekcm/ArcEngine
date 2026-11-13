// FSChooseSteps.js — шаги эффектов: выбор и порядок.
//
// Одна группа веток бывшего switch в FS_EFFECTS.apply(). Тело каждого шага
// перенесено дословно; изменилось только окружение: «движок эффектов» теперь
// приходит параметром effects, а общая рамка шага — объектом f (FSStepContext).

class ChooseSteps {
    static ops = ['reorderOwnOrder', 'advanceFromPlan', 'choice', 'chooseSystem', 'chooseFoe', 'chooseWorld', 'foeAllow', 'lookEvents', 'sequence', 'restore', 'damageFirst', 'limitedOrder', 'stormReaction', 'strikeRouteDamaged', 'strikeFirstPick', 'strikeDestroyOne', 'guardDeploy', 'preAdvance'];

    static reorderOwnOrder(effects, f) {
        const { R, state, seat, step, answer } = f;
        if (!step.selected) {
            const offer = OrderAsks.reorderOwnOrder(effects, f);
            const selected = offer && offer.question.options[Number(answer.choice)];
            if (!selected) return null;
            const sys = R.system(state, selected.system);
            const token = sys && sys.tokens[selected.index];
            if (!token || token.seat !== seat) return null;
            step.selected = { system: sys.id, index: selected.index };
            return { question: { kind: 'choice', who: seat, op: 'reorderOwnOrder',
                options: ['Поверх стека', 'Под стек'], text: 'Куда положить выбранный приказ?',
                privateText: 'Вы смотрите приказ «' + R.orderName(token.order) + '». Куда его положить?' } };
        }
        const sys = R.system(state, step.selected.system);
        const token = sys && sys.tokens[step.selected.index];
        if (!token || token.seat !== seat) return null;
        sys.tokens.splice(step.selected.index, 1);
        if (Number(answer.choice) === 0) sys.tokens.push(token);
        else sys.tokens.unshift(token);
        R.log(state, seat, state.players[seat].name + ' перекладывает свой приказ в стеке.');
        step.done = true;
        return null;
    }

    static choice(effects, f) {
        const { R, state, seat, step, answer, ctx } = f;
        const i = Number(answer.choice);
        const option = step.options && step.options[i];
        if (!option) return null;
        if (effects.fullSupplyPlacement(option) && !effects.canOfferPlacement(R, state, seat, option)) {
            return { ok: false, error: 'Для платного размещения нужны все отряды, материалы и подходящий мир.' };
        }
        // «за каждый имеющийся у вас `morale cube` получите 1 … либо 1 …»
        // — the count belongs to the branch that was chosen.
        // Pair-scaled branches retain the pair rule themselves (the count is
        // taken when the branch registers its damage-step effect). Scaling the
        // choice as well would count the same pairs twice.
        if (step.per && step.per !== 'pair') {
            const total = effects.count(R, state, seat,
                { n: 1, per: step.per, perKind: step.perKind, max: step.max, filter: step.filter, inBattle: step.inBattle }, ctx);
            // «Если у вас больше недеморализованных отрядов…» — a count
            // of zero pays nothing at all.
            if (total <= 0) return null;
            if (total > 1) option.n = (option.n || 1) * total;
        }
        const q = effects.step(R, state, seat, option, ctx);
        // The branch may do all its work at once (there is nothing to destroy,
        // so no question is asked): the count of what it did belongs to its
        // «чтобы»-steps, just as it does when the branch had to be answered.
        if (!q && Array.isArray(option.then)) effects.spreadCount(option.then, -1, option);
        // The branch of the choice may add steps of its own — the ability
        // of the card it repeats («Жизнеотсос»): they join the chain
        // after the choice, not inside it.
        if (Array.isArray(option.then) && option.then.length) {
            step.then = (step.then || []).concat(option.then);
            option.then = [];
            step.done = true;
        }
        return q;
    }

    static chooseSystem(effects, f) {
        const { R, state, seat, step, answer } = f;
        // «Выберите систему» («Пожиратель миров»): the steps that follow
        // read the choice. «Быстрый ответ» starts a limited advance in
        // the chosen system right after the choice.
        if (answer.system) Choice.of(state).choose(answer.system);
        if (step.quickResponse && answer.system && typeof R.startQuickResponse === 'function') {
            R.startQuickResponse(state, seat, answer.system);
        }
        return null;
    }

    static chooseFoe(effects, f) {
        const { answer, ctx } = f;
        // The opponent of the effect.
        if (answer.foe !== undefined) ctx.foe = answer.foe;
        return null;
    }

    static chooseWorld(effects, f) {
        const { answer, ctx } = f;
        // The world of the effect: the next steps work with it.
        if (answer.area) ctx.world = answer.area;
        return null;
    }

    static foeAllow(effects, f) {
        const { R, state, seat, step, answer, combat, inCombat } = f;
        // Recheck old/saved questions too: an impossible action is not a valid
        // acceptance. Once accepted, the opponent must actually select it.
        const hasTarget = effects.foeAllowHasTarget(R, state, seat, step, combat, inCombat);
        const refused = !!answer.no || hasTarget === false;
        const list = JSON.parse(JSON.stringify((refused ? step.no : step.yes) || []));
        if (!list.length) return null;
        if (!refused && hasTarget === true) list[0].strict = true;
        return { replace: list };
    }

    static lookEvents(effects, f) {
        const { R, state, seat, answer, p } = f;
        const name = answer.card;
        const deck = p.decks.event;
        if (!name || !deck.includes(name)) return null;
        // The chosen card stays on top, the others go to the bottom.
        const rest = deck.filter(x => x !== name);
        const top = deck.filter(x => x === name);
        p.decks.event = top.concat(rest);
        R.log(state, seat, state.players[seat].name + ' смотрит карты событий.');
        return null;
    }

    static sequence(effects, f) {
        const { step } = f;
        // The steps of the sequence are executed in the place of it.
        return { replace: step.steps || [] };
    }

    static restore(effects, f) {
        const { R, state, step, answer, units, combat, inCombat } = f;
        const back = units(answer.units);
        const tokenTargets = [];
        if (inCombat && combat) for (const id of answer.units || []) {
            // Moved reinforcement tokens are already represented in state.units.
            if (typeof id !== 'string' || !id.startsWith('reinforce-') || back.some(u => u.id === id)) continue;
            const tokens = CombatTokens.of(combat);
            const side = ['attacker', 'defender'].find(s => tokens.indexOf(s, id) >= 0);
            const index = side ? tokens.indexOf(side, id) : -1;
            if (index < 0 || !tokens.flipped(side).includes(index)) {
                return { ok: false, error: 'Подкрепление больше нельзя восстановить.' };
            }
            tokenTargets.push({ side, index, seat: CombatSides.seatOf(combat, side) });
        }
        for (const u of back) {
            R.restoreUnit(state, u);
            R.log(state, u.seat, state.players[u.seat].name + ': отряд восстановлен.');
        }
        for (const t of tokenTargets) {
            CombatTokens.of(combat).restoreFallen(t.side, t.index);
            R.log(state, t.seat, state.players[t.seat].name + ': подкрепление восстановлено.');
        }
        step.done = back.length + tokenTargets.length > 0;
        return null;
    }

    static damageFirst(effects, f) {
        const { R, state, seat, answer, combat, side } = f;
        const id = (answer.units || [])[0];
        if (!id) return null;
        const foeSide = CombatSides.foe(side);
        CombatDamage.of(combat).addFirst(foeSide, id, CombatTurn.of(combat).round);
        R.log(state, seat, 'Выбранный отряд противника получает урон первым.');
        return null;
    }

    static limitedOrder(effects, f) {
        const { R, state, seat, step, p } = f;
        if (!state.order) return null;
        OrderContext.of(state.order).setNestedKind(step.kind);
        R.log(state, seat, p.name + ' готовит ограниченный приказ: '
            + (step.text || step.kind) + '.');
        return null;
    }

    // «Вместо раскрытия приказа во время фазы действий вы можете сбросить эту
    // карту для того, чтобы выполнить приказ продвижения в любой системе,
    // содержащей не менее 2-х ваших отрядов» («Вперёд!»): the plan replaces the
    // reveal — the order begins, and the plan does NOT take the turn with it.
    static advanceFromPlan(effects, f) {
        const { R, state, seat, answer, p } = f;
        const id = answer.system || (answer.choice !== undefined && typeof answer.choice === 'string' ? answer.choice : null);
        const sys = state.systems.find(x => x.id === id);
        if (!sys) return null;
        OrderScheme.of(state).clearAccepted();
        if (typeof R.startPlanAdvance === 'function') {
            R.startPlanAdvance(state, seat, sys.id);
        }
        R.log(state, seat, p.name + ' выполняет «Вперёд!»: приказ продвижения в системе.');
        return { replace: [] };
    }

    static stormReaction(effects, f) {
        const { R, state, step, answer, ctx } = f;
        const info = ctx && ctx.ctx && ctx.ctx.stormReaction;
        const dirs = step.dirs || [];
        const i = Number(answer.choice);
        const dir = answer.dir || dirs[Number.isFinite(i) ? i : 0] || null;
        if (info && typeof R.finishStormReaction === 'function') {
            R.finishStormReaction(state, info, dir);
        }
        return null;
    }

    static strikeRouteDamaged(effects, f) {
        const { R, state, step, answer } = f;
        const id = (answer.units || [])[0];
        const unit = state.units.find(u => u.id === id);
        if (unit) {
            R.routeUnit(state, unit);
            R.log(state, unit.seat, state.players[unit.seat].name + ': отряд деморализован ударом с орбиты.');
        }
        step.done = true;
        return null;
    }

    static strikeFirstPick(effects, f) {
        const { state, answer } = f;
        const id = (answer.units || [])[0];
        if (state.order && id) StrikePlan.of(state.order).setFirst(id);
        return null;
    }

    static strikeDestroyOne(effects, f) {
        const { R, state, seat, step, answer } = f;
        const id = (answer.units || [])[0];
        if (!id) return null;
        const unit = state.units.find(u => u.id === id);
        if (unit) R.destroyUnit(state, unit);
        else {
            const structure = state.structures.find(s => s.id === id);
            if (structure) R.destroyStructure(state, structure);
        }
        R.log(state, seat, 'В мире орбитального удара уничтожен отряд или постройка.');
        step.done = true;
        return null;
    }

    static guardDeploy(effects, f) {
        const { R, state, seat, answer } = f;
        const factory = answer.factory || answer.area;
        if (factory) return effects.startGuardDeploy(R, state, seat, factory);
        return null;
    }

    static preAdvance(effects, f) {
        const { R, state, seat, step, answer } = f;
        if (answer.no) return null;
        if (typeof R.startPreAdvance === 'function') R.startPreAdvance(state, seat);
        step.done = true;
        return null;
    }
}
