// FSMoveSteps.js — шаги эффектов: движение.
//
// Одна группа веток бывшего switch в FS_EFFECTS.apply(). Тело каждого шага
// перенесено дословно; изменилось только окружение: «движок эффектов» теперь
// приходит параметром effects, а общая рамка шага — объектом f (FSStepContext).

class MoveSteps {
    static ops = ['moveUnits', 'moveStructure', 'moveUnit', 'route', 'retreat', 'retreatInstead', 'evacuate', 'swapCombatCards', 'swapCombatPair'];

    static moveUnits(effects, f) {
        const { R, state, seat, step, answer, units } = f;
        if (step.sourceWorld) {
            // The first question: the world the units are taken from.
            if (!answer.source) {
                const worlds = effects.sourceWorlds(R, state, seat);
                if (!worlds.length) return null;
                return { question: { kind: 'areas', answerKey: 'source', stage: 'source', who: seat, op: 'moveUnits', options: worlds, text: 'С какого мира забрать отряды?' } };
            }
            // The second question: any number of my unrouted units from it.
            if (answer.units === undefined) {
                const all = state.units.filter(u => u.seat === seat && !u.routed
                    && u.system === answer.source.system && u.area === answer.source.pos);
                if (!all.length) return null;
                return { question: { kind: 'units', who: seat, op: 'moveUnits', n: all.length, options: all.map(u => u.id), text: 'Какие отряды забрать? (любое количество)' } };
            }
            if (!answer.units.length) return null;
        } else {
            const list0 = units(answer.units);
            if (!list0.length) return null;
        }
        const list = units(answer.units);
        if (!list.length) return null;
        const area = answer.area;
        if (!area) {
            const areas = effects.areasForAbility(R, state, seat, step.dest);
            if (!areas.length) return null;
            return { question: { kind: 'areas', who: seat, op: 'moveUnits', options: areas, text: 'Куда переместить отряды?' } };
        }
        for (const u of list) R.board(state).moveUnit(u, area, { seat });
        R.log(state, seat, state.players[seat].name + ' перемещает отряды.');
        return null;
    }

    static moveStructure(effects, f) {
        const { R, state, seat, step, answer } = f;
        const s = state.structures.find(x => x.id === (answer.structure || answer.id));
        const area = answer.area;
        if (!s) return null;
        if (!area) {
            // «в ДРУГОЙ мир» — the world the factory stands in is not a
            // destination.
            const areas = effects.areasForAbility(R, state, seat, step.dest || 'worldActiveOrAdjacentNeutralOrFriendly')
                .filter(a => a.system !== s.system || a.pos !== s.area);
            if (!areas.length) return null;
            return { question: { kind: 'areas', who: seat, op: 'moveStructure', options: areas, text: 'Куда передвинуть фабрику?' } };
        }
        R.board(state).moveUnit(s, area, { seat });
        R.log(state, seat, state.players[seat].name + ' перемещает фабрику.');
        return null;
    }

    static moveUnit(effects, f) {
        const { R, state, seat, step, answer, units } = f;
        const u = units(answer.units)[0];
        const area = answer.area;
        if (!u) return null;
        if (!area) {
            const areas = effects.areasForAbility(R, state, seat, step.dest);
            if (!areas.length) return null;
            return { question: { kind: 'areas', who: seat, op: 'moveUnit', options: areas, text: 'Куда переместить отряд?' } };
        }
        R.board(state).moveUnit(u, area, { seat });
        return null;
    }

    static route(effects, f) {
        const { R, state, seat, step, answer, combat, inCombat, units } = f;
        const routed = units(answer.units);
        for (const u of routed) {
            // The round the unit was routed in: the cards that last
            // «в этом раунде боя» count only these («Фаланга судного дня»).
            R.routeUnit(state, u, inCombat && combat ? CombatTurn.of(combat).round : null);
            R.log(state, u.seat, state.players[u.seat].name + ': отряд деморализован.');
        }
        step.done = routed.length > 0;
        step.routedCount = routed.length;
        // «…за каждый отряд, который вы деморализовали» — the steps of
        // «Если вы это сделаете» count what this step did.
        for (const one of (Array.isArray(step.then) ? step.then : [])) {
            if (one && one.per === 'routed') one.n = routed.length;
        }
        if (inCombat && combat && routed.some(u => u.seat !== seat)) {
            CombatPlans.of(combat).touchRoutedFoe();
        }
        return null;
    }

    static retreat(effects, f) {
        const { R, state, step, answer, combat, inCombat, units } = f;
        const u = units(answer.units)[0];
        if (!u) return null;
        // A retreat during a round of combat follows the retreat rules:
        // the unit leaves the contested area (and is routed). Without an
        // area to retreat to the unit is destroyed (the rules, «Retreats»).
        if (inCombat && combat) {
            if (!answer.area) {
                // The area of the retreat fits the unit that leaves: a
                // ground unit goes to a world, a ship to a void.
                const def = R.unitOf(state, u);
                const wantWorld = def ? def.type === 'ground' : true;
                let targets = typeof R.retreatTargets === 'function' ? R.retreatTargets(state, u.seat) : [];
                targets = targets.filter(t => {
                    const sys = R.system(state, t.system);
                    const a = sys ? R.area(sys, t.pos) : null;
                    return !!a && !!a.world === wantWorld;
                });
                if (targets.length) {
                    return { question: { kind: 'areas', who: u.seat, op: 'retreat', options: targets, text: 'Куда отступить?' } };
                }
                R.log(state, u.seat, state.players[u.seat].name + ': отступать некуда, отряд гибнет.');
                R.destroyUnit(state, u);
                step.done = true;
                return null;
            }
            R.board(state).moveUnit(u, answer.area, { seat: u.seat });
            if (typeof R.trimArea === 'function') R.trimArea(state, u.seat, u.system, u.area);
        }
        R.routeUnit(state, u);
        if (step.record && combat) combat.lastRetreat = u.id;
        if (typeof R.markRetreat === 'function') R.markRetreat(state, u.seat);
        R.log(state, u.seat, state.players[u.seat].name + ': отряд отступает.');
        step.done = true;
        return null;
    }

    static retreatInstead(effects, f) {
        const { R, state, seat, step, answer, p, combat, inCombat } = f;
        if (!inCombat || answer.no) return null;
        CombatDamage.of(combat).setRetreatPlan(seat, CombatTurn.of(combat).round);
        R.log(state, seat, p.name + ': уничтоженный отряд отступит вместо гибели.');
        step.done = true;
        return null;
    }

    static evacuate(effects, f) {
        const { R, state, seat, step, answer, p } = f;
        if (step.stage !== 'type' && step.stage !== 'area') {
            const st = state.structures.find(x => x.id === answer.structure && x.seat === seat);
            if (!st) return null;
            step.sourceSystem = st.system;
            step.sourceArea = st.area;
            R.destroyStructure(state, st);
            step.stage = 'type';
            return { question: {
                kind: 'types', who: seat, op: 'evacuate', n: 1,
                options: ['factory', 'city', 'bastion'], text: 'Какую постройку разместить?',
            } };
        }
        if (step.stage === 'type') {
            const type = answer.type || 'factory';
            step.type = type;
            const areas = effects.evacuateAreas(R, state, seat, step.sourceSystem, step.sourceArea);
            if (!areas.length) {
                R.log(state, seat, '«Эвакуация»: некуда поставить постройку.');
                return null;
            }
            step.stage = 'area';
            return { question: {
                kind: 'areas', who: seat, op: 'evacuate', n: 1,
                options: areas, text: 'Где разместить постройку?',
            } };
        }
        const area = answer.area;
        const type = step.type || 'factory';
        if (!area || !R.canTakeStructure(state, seat, type).ok) return null;
        R.addStructure(state, seat, type, area.system, area.pos);
        R.log(state, seat, p.name + ': «Эвакуация» бесплатно ставит постройку.');
        step.done = true;
        return null;
    }

    static swapCombatCards(effects, f) {
        const { R, state, seat, step, answer } = f;
        const names = (answer.cards && answer.cards.length)
            ? answer.cards : (answer.card ? [answer.card] : []);
        const deck = R.player(state, seat).combatDeck;
        const steps = names.filter(n => deck.count(n) >= 2)
            .map(n => ({ op: 'swapCombatPair', name: n, who: 'me' }));
        step.done = true;
        return steps.length ? { replace: steps } : null;
    }

    static swapCombatPair(effects, f) {
        const { R, state, seat, step, answer, p, combat } = f;
        const name = answer.card;
        const card = FS_CATALOG.card('combat', p.faction, step.name);
        const deck = R.player(state, seat).combatDeck;
        const pile = deck.upgradePile();
        const up = FS_CATALOG.upgradeCombatCards(p.faction).find(c => c.name === name);
        if (!up || !card || (up.kl || 0) > (card.kl || 0) || !pile.includes(name)) return null;
        // Одна замена пары на всю игру: тот же объект колоды, что у покупки.
        const pair = deck.pairOptions().includes(step.name) ? step.name : null;
        if (!pair) return null;
        if (!deck.replacePair(step.name, name)) return null;
        R.log(state, seat, p.name + ': пара «' + step.name + '» заменена парой «' + name + '».');
        step.done = true;
        return null;
    }
}
