// FSMoveSteps.js — шаги эффектов: движение.
//
// Одна группа веток бывшего switch в FS_EFFECTS.apply(). Тело каждого шага
// перенесено дословно; изменилось только окружение: «движок эффектов» теперь
// приходит параметром effects, а общая рамка шага — объектом f (FSStepContext).

class MoveSteps {
    static ops = ['warpGateMove', 'moveUnits', 'moveStructure', 'moveUnit', 'route', 'retreat', 'retreatInstead', 'strikeRetreatOffer', 'evacuate', 'swapCombatCards', 'swapCombatPair'];

    static warpGateMove(effects, f) {
        const { R, state, seat, step, answer } = f;
        if (!step.source) {
            step.source = { system: answer.source.system, pos: answer.source.pos };
            const options = state.units.filter(u => u.seat === seat && !u.routed
                && u.system === step.source.system && u.area === step.source.pos).map(u => u.id);
            if (!options.length) return null;
            return { question: { kind: 'units', who: seat, op: 'warpGateMove',
                n: options.length, options, text: 'Какие отряды переместить? (любое количество)' } };
        }
        if (!step.selected) {
            step.selected = (answer.units || []).slice();
            if (!step.selected.length) return null;
            const options = effects.warpGateDestinations(R, state, seat, step.source);
            if (!options.length) return null;
            return { question: { kind: 'areas', who: seat, op: 'warpGateMove', options,
                text: 'В какую дружественную или свободную область переместиться?' } };
        }
        for (const id of step.selected) {
            const unit = state.units.find(u => u.id === id && u.seat === seat && !u.routed
                && u.system === step.source.system && u.area === step.source.pos);
            if (unit) R.board(state).moveUnit(unit, answer.area, { seat });
        }
        R.log(state, seat, state.players[seat].name + ' перемещает отряды через врата варпа.');
        step.done = true;
        return null;
    }

    // Wave Serpent may start one new contested area per original battle. The
    // five-attacker limit applies BEFORE that follow-up starts, not as a
    // capacity trim after it. Recompute this both when offering and accepting.
    static waveDestinations(effects, f, list) {
        const { R, state, seat, combat } = f;
        if (!combat || !list.length) return [];
        const prior = combat.waveContested;
        return R.areasAround(state, list[0].system, list[0].area).filter(area => {
            const world = effects.areaWorld(state, area.system, area.pos);
            if (!list.every(u => {
                const def = R.unitOf(state, u);
                return def && world === (def.type === 'ground');
            })) return false;
            if (area.system !== list[0].system && R.board(state).stormOn(list[0].system, area.system)) return false;
            const owners = [...R.board(state).warSeatsAt(area.system, area.pos)];
            const enemies = owners.filter(owner => owner !== seat);
            if (!enemies.length) return true;
            if (enemies.length !== 1) return false;
            if (prior && (prior.system !== area.system || prior.pos !== area.pos)) return false;
            // An already contested destination is usable only if THIS card has
            // queued it; a third faction cannot join somebody else's battle.
            if (owners.includes(seat) && !(state.effectCombatQueue || []).some(q => q.attacker === seat
                && q.defender === enemies[0] && q.system === area.system && q.pos === area.pos)) return false;
            // Used reinforcements return to the supply when this combat is
            // cleaned up, before the queued combat starts. They are units now,
            // but are not attackers in that later combat's five-unit limit:
            // the board counts the pieces that last.
            const stays = u => !u.reinforcementCombat && u.tokenSide === undefined;
            return R.board(state).hasLastingRoom(area.system, area.pos, seat, list.filter(stays).length);
        });
    }

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
        } else if (step.dest !== 'eldarWaveAdjacent') {
            const list0 = units(answer.units);
            if (!list0.length) return null;
        }
        let list = units(answer.units);
        if (step.dest === 'eldarWaveAdjacent') {
            const ids = answer.units || [];
            if (!ids.length) return null;
            // Recheck both plastic pieces and live reinforcement slots at each
            // stage. The first answer may have gone over the network or through
            // JSON while a selected unit became invalid.
            const eligible = effects.unitsOf(R, state, seat, f.combat, step);
            list = ids.map(id => eligible.find(u => u.id === id));
            if (list.some(u => !u)) return { ok: false, error: 'Выбранный отряд больше нельзя переместить.' };
        }
        if (!list.length) return null;
        const area = answer.area;
        if (!area) {
            // «в соседнюю область» — the neighbour of the area they stand in.
            const dest = step.dest === 'adjacentArea'
                ? { from: { system: list[0].system, pos: list[0].area } } : step.dest;
            const eldarAdjacent = step.dest === 'adjacentFriendlyOrUncontrolled' || step.dest === 'eldarWaveAdjacent';
            let areas = step.dest === 'eldarWaveAdjacent'
                ? this.waveDestinations(effects, f, list)
                : eldarAdjacent
                    ? R.areasAround(state, list[0].system, list[0].area).filter(a => {
                        const standing = effects.areaStanding(state, seat, a.system, a.pos);
                        const defs = list.map(u => R.unitOf(state, u));
                        const world = effects.areaWorld(state, a.system, a.pos);
                        return (standing === 'friendly' || standing === 'uncontrolled')
                            && defs.every(def => !!def && world === (def.type === 'ground'))
                            && (a.system === list[0].system || !R.board(state).stormOn(list[0].system, a.system));
                    })
                    : effects.areasForAbility(R, state, seat, dest);
            if (step.dest === 'friendlyOrUncontrolledWorldAdjacent') {
                // Chaos Contagion moves a ground unit; unlike placing a model,
                // it needs a friendly path and cannot cross a Warp Storm.
                areas = areas.filter(a => list.every(u => R.pathExists(state, seat, u.system, u.area, a.system, a.pos,
                    { uncontrolled: false, storms: false })));
            }
            // «в другую пустоту в активной системе» («Затмевающий спуск»):
            // not the void the ship stands in.
            if (step.dest === 'otherVoidActive') {
                areas = areas.filter(a => !list.some(u => u.system === a.system && u.area === a.pos));
            }
            // A ground unit stands in a world, a ship in a void: the card lets
            // the player move any number of them, and each needs its own place.
            if (step.dest === 'adjacentArea') {
                const defs = list.map(u => R.unitOf(state, u)).filter(Boolean);
                if (defs.some(d => d.type === 'ground')) areas = areas.filter(a => effects.areaWorld(state, a.system, a.pos));
                if (defs.some(d => d.type !== 'ground')) areas = areas.filter(a => !effects.areaWorld(state, a.system, a.pos));
            }
            // «Это может привести к новой битве» («Праздник кровопролития»,
            // «Затмевающий спуск»): the units may enter an area of ONE other
            // player — a battle of two others is not theirs to join.
            if (step.dest === 'adjacentArea' || step.dest === 'otherVoidActive') {
                areas = areas.filter(a => [...R.board(state).warSeatsAt(a.system, a.pos)].filter(o => o !== seat).length <= 1);
            }
            // Keep the unit question open if this force has no legal target:
            // the player can choose fewer models rather than silently losing it.
            if (!areas.length && step.dest === 'eldarWaveAdjacent') {
                return { ok: false, error: 'Для выбранных отрядов нет допустимой соседней области.' };
            }
            if (!areas.length) return null;
            return { question: { kind: 'areas', who: seat, op: 'moveUnits', options: areas, text: 'Куда переместить отряды?' } };
        }
        let defender = null;
        let arrivals = [];
        if (step.dest === 'eldarWaveAdjacent') {
            if (!this.waveDestinations(effects, f, list).some(a => a.system === area.system && a.pos === area.pos)) {
                return { ok: false, error: 'Эта область больше недоступна для перемещения.' };
            }
            const enemies = [...R.board(state).warSeatsAt(area.system, area.pos)].filter(owner => owner !== seat);
            if (enemies.length) {
                defender = enemies[0];
                arrivals = list.map(u => ({ id: u.id, from: { system: u.system, pos: u.area } }));
                f.combat.waveContested = { system: area.system, pos: area.pos };
            }
        } else if (step.dest === 'adjacentArea' || step.dest === 'otherVoidActive') {
            // «Это может привести к новой битве по завершении текущей»
            // («Праздник кровопролития»), «… по завершении текущего
            // орбитального удара» («Затмевающий спуск»): the area of another
            // player is entered now, the battle for it waits for the end of
            // the current one.
            const enemies = [...R.board(state).warSeatsAt(area.system, area.pos)].filter(owner => owner !== seat);
            if (enemies.length === 1) {
                defender = enemies[0];
                arrivals = list.map(u => ({ id: u.id, from: { system: u.system, pos: u.area } }));
            }
        }
        for (const u of list) {
            if (step.dest === 'eldarWaveAdjacent' && u.tokenSide !== undefined) {
                // A live combat slot becomes one temporary board unit until the
                // old combat is cleaned up, just as for «Предвидение».
                CombatTokens.of(f.combat).moveAway(u.tokenSide, u.tokenIndex);
                const token = { id: u.id, seat, faction: state.players[seat].faction, unit: u.unit,
                    system: u.system, area: u.area, routed: false,
                    reinforcementCombat: { side: u.tokenSide, index: u.tokenIndex } };
                state.units.push(token);
                R.board(state).moveUnit(token, area, { seat });
            } else R.board(state).moveUnit(u, area, { seat });
        }
        if (defender !== null) R.queueEffectCombat(state, seat, defender, area, arrivals);
        R.log(state, seat, state.players[seat].name + ' перемещает отряды.');
        // «Если вы это сделали, то получите …» («Выстрелить и исчезнуть»).
        step.done = true;
        return null;
    }

    static moveStructure(effects, f) {
        const { R, state, seat, step, answer } = f;
        const s = state.structures.find(x => x.id === (answer.structure || answer.id));
        const area = answer.area;
        if (!s) return null;
        const areas = step.groundPath
            ? effects.factoryDestinations(R, state, seat, s, step)
            : effects.areasForAbility(R, state, seat, step.dest || 'worldActiveOrAdjacentNeutralOrFriendly')
                .filter(a => a.system !== s.system || a.pos !== s.area);
        if (!area) {
            if (!areas.length) return null;
            return { question: { kind: 'areas', who: seat, op: 'moveStructure', options: areas, text: 'Куда передвинуть фабрику?' } };
        }
        if (!areas.some(a => a.system === area.system && a.pos === area.pos)) return { ok: false, error: 'Фабрика не может попасть в этот мир.' };
        R.board(state).moveUnit(s, area, { seat });
        // The upgrade refers to this specific moved factory, even when the
        // destination is in a different system from the Dominate order.
        if (step.groundPath && state.order) OrderTally.of(state.order).setMovedFactory(s);
        R.log(state, seat, state.players[seat].name + ' перемещает фабрику.');
        return null;
    }

    static moveUnit(effects, f) {
        const { R, state, seat, step, answer, units } = f;
        const u = units(answer.units)[0];
        const area = answer.area;
        if (!u) return null;
        if (!area) {
            let areas = effects.areasForAbility(R, state, seat, step.dest);
            if (step.dest === 'uncontrolledOtherVoid')
                areas = areas.filter(a => a.system !== u.system || a.pos !== u.area);
            if (!areas.length) return null;
            return { question: { kind: 'areas', who: seat, op: 'moveUnit', options: areas, text: 'Куда переместить отряд?' } };
        }
        R.board(state).moveUnit(u, area, { seat });
        step.done = true;
        return null;
    }

    static route(effects, f) {
        const { R, state, seat, step, answer, combat, inCombat, units } = f;
        const routed = units(answer.units);
        const tokenTargets = [];
        if (inCombat && combat) for (const id of answer.units || []) {
            // A token already moved out of this battle is represented by a
            // board unit; only unresolved combat slots need token handling.
            if (typeof id !== 'string' || !id.startsWith('reinforce-') || routed.some(u => u.id === id)) continue;
            const tokens = CombatTokens.of(combat);
            const side = ['attacker', 'defender'].find(s => tokens.indexOf(s, id) >= 0);
            const index = side ? tokens.indexOf(side, id) : -1;
            if (index < 0 || tokens.flipped(side).includes(index)) {
                return { ok: false, error: 'Подкрепление больше нельзя деморализовать.' };
            }
            tokenTargets.push({ side, index, seat: CombatSides.seatOf(combat, side) });
        }
        for (const u of routed) {
            // The round the unit was routed in: the cards that last
            // «в этом раунде боя» count only these («Фаланга судного дня»).
            R.routeUnit(state, u, inCombat && combat ? CombatTurn.of(combat).round : null);
            R.log(state, u.seat, state.players[u.seat].name + ': отряд деморализован.');
        }
        for (const t of tokenTargets) {
            R.routeReinforcementToken(state, t.side, t.index);
            R.log(state, t.seat, state.players[t.seat].name + ': подкрепление деморализовано.');
        }
        const count = routed.length + tokenTargets.length;
        step.done = count > 0;
        step.routedCount = count;
        // «Затем вы можете потратить 1 `def. cube`, чтобы вынудить вашего
        // противника отступить этим отрядом» («Боевые гимны»): the strike
        // remembers the unit its card routed.
        if (step.strikeWorld && state.order && routed.length) StrikePlan.of(state.order).noteRouted(routed[0].id);
        // «…за каждый отряд, который вы деморализовали» — the steps of
        // «Если вы это сделаете» count what this step did.
        for (const one of (Array.isArray(step.then) ? step.then : [])) {
            if (one && one.per === 'routed') one.n = count;
        }
        if (inCombat && combat && routed.some(u => u.seat !== seat)) {
            CombatPlans.of(combat).touchRoutedFoe();
        }
        return null;
    }

    static retreat(effects, f) {
        const { R, state, seat, step, answer, combat, inCombat, units, ctx } = f;
        const u = units(answer.units)[0];
        if (!u) return null;
        // «Отступите 1 своим отрядом за каждый потраченный `morale cube`»
        // («Скауты ветераны»): one retreat per cube, each with its own unit
        // and its own area — the step repeats itself while retreats are left.
        const left = (step.left === undefined
            ? (step.per ? effects.count(R, state, seat, step, ctx) : (step.n || 1))
            : step.left) - 1;
        const again = () => (left > 0
            ? { replace: [Object.assign({}, step, { left, done: false, noAbilityQuestion: true })] }
            : null);
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
                return again();
            }
            R.board(state).moveUnit(u, answer.area, { seat: u.seat });
            if (typeof R.trimArea === 'function') R.trimArea(state, u.seat, u.system, u.area);
        }
        R.routeUnit(state, u);
        if (step.record && combat) CombatHooks.of(combat).recordRetreat(u.id);
        if (typeof R.markRetreat === 'function') R.markRetreat(state, u.seat);
        R.log(state, u.seat, state.players[u.seat].name + ': отряд отступает.');
        step.done = true;
        return again();
    }

    /**
     * «… потратить 1 `def. cube`, чтобы вынудить вашего противника отступить
     * этим отрядом» («Боевые гимны»): the cube leaves the pool of the strike,
     * the routed unit retreats by the rules of a retreat — to an area of its
     * kind in the system or next to it that holds no enemy, chosen by its
     * owner; without such an area it is destroyed.
     */
    static strikeRetreatOffer(effects, f) {
        const { R, state, seat, step, answer, p } = f;
        const plan = state.order && StrikePlan.of(state.order).planned;
        const unit = plan && plan.routedUnit ? state.units.find(u => u.id === plan.routedUnit) : null;
        if (!plan || !unit) return null;
        if (step.stage !== 'area') {
            if (answer.no) { step.done = true; return null; }
            const kind = step.kind || 'def';
            const at = (plan.pool || []).lastIndexOf(kind);
            if (at < 0) return null;
            plan.pool.splice(at, 1);
            R.log(state, seat, p.name + ' тратит `def. cube` удара: отряд противника должен отступить.');
            step.stage = 'area';
            const targets = effects.retreatAreasOutside(R, state, unit);
            if (!targets.length) {
                R.log(state, unit.seat, state.players[unit.seat].name + ': отступать некуда, отряд гибнет.');
                R.destroyUnit(state, unit);
                step.done = true;
                return null;
            }
            step.targets = targets;
            return { question: { kind: 'areas', who: unit.seat, op: 'strikeRetreatOffer', options: targets, text: 'Куда отступить?' } };
        }
        const area = answer.area;
        const fits = area && (step.targets || []).some(t => t.system === area.system && t.pos === area.pos);
        if (!fits) return { ok: false, error: 'Выберите предложенную область.' };
        R.board(state).moveUnit(unit, area, { seat: unit.seat });
        if (typeof R.trimArea === 'function') R.trimArea(state, unit.seat, unit.system, unit.area);
        R.log(state, unit.seat, state.players[unit.seat].name + ': отряд отступает.');
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
        const { R, state, seat, step, answer, p, combat } = f;
        // The one destination is chosen for all eligible units, including the
        // reinforcement tokens. A routed unit cannot move by a card effect.
        if (step.unitsFromCombat) {
            const area = answer.area;
            const legal = effects.combatEvacuationAreas(R, state, seat, combat);
            if (!area || !legal.some(a => a.system === area.system && a.pos === area.pos)) {
                return { ok: false, error: 'Эту область выбрать нельзя.' };
            }
            const force = effects.combatEvacuees(R, state, seat, combat);
            for (const u of force.units) R.board(state).moveUnit(u, area, { seat });
            const side = CombatSides.sideOf(combat, seat);
            const tokenState = CombatTokens.of(combat);
            const def = R.reinforceTokenDef(state, side);
            for (const index of force.tokens) {
                if (!tokenState.moveAway(side, index)) continue;
                // A moved token still exists on the board until combat cleanup.
                // It has the CL0 unit's attributes but consumes no plastic.
                state.units.push({ id: 'reinforce-' + side + '-' + index, seat,
                    faction: state.players[seat].faction, unit: def.id,
                    system: area.system, area: area.pos, routed: false,
                    reinforcementCombat: { side, index } });
            }
            R.log(state, seat, p.name + ' выводит отряды из боя в другую область.');
            step.done = true;
            return null;
        }
        if (step.stage !== 'type' && step.stage !== 'area') {
            const st = state.structures.find(x => x.id === answer.structure && x.seat === seat);
            if (!st) return null;
            step.sourceSystem = st.system;
            step.sourceArea = st.area;
            R.destroyStructure(state, st);
            // The removed model and its control token return to the common
            // supply before offering only types that can actually be placed.
            const types = ['factory', 'city', 'bastion'].filter(type => R.canTakeStructure(state, seat, type).ok);
            if (!types.length) return null;
            step.stage = 'type';
            return { question: {
                kind: 'types', who: seat, op: 'evacuate', n: 1,
                options: types, text: 'Какую постройку разместить?',
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
        const can = R.canTakeStructure(state, seat, type);
        if (!can.ok) return can;
        const legal = effects.evacuateAreas(R, state, seat, step.sourceSystem, step.sourceArea);
        if (!area || !legal.some(a => a.system === area.system && a.pos === area.pos)) {
            return { ok: false, error: 'Этот мир выбрать нельзя.' };
        }
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
        const up = FS_CATALOG.card('combat', p.faction, name);
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
