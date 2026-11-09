// FSChooseSteps.js — шаги эффектов: выбор и порядок.
//
// Одна группа веток бывшего switch в FS_EFFECTS.apply(). Тело каждого шага
// перенесено дословно; изменилось только окружение: «движок эффектов» теперь
// приходит параметром effects, а общая рамка шага — объектом f (FSStepContext).

class ChooseSteps {
    static ops = ['choice', 'chooseSystem', 'chooseFoe', 'chooseWorld', 'foeAllow', 'lookEvents', 'sequence', 'restore', 'damageFirst', 'limitedOrder', 'stormReaction', 'strikeRouteDamaged', 'strikeFirstPick', 'strikeDestroyOne', 'guardDeploy', 'preAdvance'];

    static choice(effects, f) {
        const { R, state, seat, step, answer, ctx } = f;
        const i = Number(answer.choice);
        const option = step.options && step.options[i];
        if (!option) return null;
        // «за каждый имеющийся у вас `morale cube` получите 1 … либо 1 …»
        // — the count belongs to the branch that was chosen.
        if (step.per) {
            const total = effects.count(R, state, seat,
                { n: 1, per: step.per, perKind: step.perKind, max: step.max, filter: step.filter, inBattle: step.inBattle }, ctx);
            // «Если у вас больше недеморализованных отрядов…» — a count
            // of zero pays nothing at all.
            if (total <= 0) return null;
            if (total > 1) option.n = (option.n || 1) * total;
        }
        const q = effects.step(R, state, seat, option, ctx);
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
        if (answer.system) state.chosenSystem = answer.system;
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
        const { step, answer } = f;
        // The branch of his answer takes the place of the question.
        const list = (answer.no ? step.no : step.yes) || [];
        if (!list.length) return null;
        return { replace: JSON.parse(JSON.stringify(list)) };
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
        const { R, state, step, answer, units } = f;
        const back = units(answer.units);
        for (const u of back) {
            R.restoreUnit(state, u);
            R.log(state, u.seat, state.players[u.seat].name + ': отряд восстановлен.');
        }
        step.done = back.length > 0;
        return null;
    }

    static damageFirst(effects, f) {
        const { R, state, seat, answer, combat, side } = f;
        const id = (answer.units || [])[0];
        if (!id) return null;
        const foeSide = CombatSides.foe(side);
        combat.damageFirst = combat.damageFirst || [];
        combat.damageFirst.push({ side: foeSide, id, round: CombatTurn.of(combat).round });
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
