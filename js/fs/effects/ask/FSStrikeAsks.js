// FSStrikeAsks.js — вопросы шага: орбитальный удар.
//
// Одна группа веток бывшего switch в FS_EFFECTS.step(), который решает,
// ЧТО шаг спросит у игрока. Тело каждого шага перенесено дословно;
// окружение — параметр effects и рамка шага f (FSStepContext).

class StrikeAsks {
    static ops = ['strikeBonus', 'strikeReward', 'strikeTakeStructures', 'offerCaptureStrike', 'captureStrike', 'strikeHealthDown', 'strikeFirst', 'strikeFirstPick', 'strikeDestroyOne', 'strikeRouteDamaged', 'assignDamage', 'protectCombatUnits', 'extraDamage', 'damageFirst', 'damageOwnRouted', 'damageOneByOne', 'repeatDamage', 'damageStartTokens', 'combatStartMorale', 'combatStartDice', 'routedMoraleHalf', 'strikeIfRolled', 'strikeIfMorale', 'strikeRetreatOffer', 'winnerDestroysRouted', 'combatLength', 'deferDamage', 'noDamageRetreat', 'noReinforce', 'ignoreFoeAtt', 'ignoreBastion', 'ignoreExcess', 'destroyRouted', 'destroyRoutedFoe', 'endRoundReinforce'];

    static strikeBonus(effects, f) {
        const { R, state, seat, step } = f;
        if (state.order && PhasePlan.of(state.order).is('strike') && OrderContext.of(state.order).isSeat(seat)) {
            StrikePlan.of(state.order).addBonus(step.n || 0);
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
                        : (step.moveShips ? { moveShips: true }
                        : (step.moveShipActive ? { moveShipActive: true }
                        : (step.place ? { place: step.place }
                            : (step.units
                                ? { units: step.units }
                                : { asset: step.asset, n: step.n || 1 }))))));
            StrikePlan.of(state.order).setReward(reward);
        }
        return null;
    }

    // «Если вы выбросили хотя бы 2 `att. cube` во время выполнения этого
    // орбитального удара, то получите 1 жетон подкрепления» («Охота за
    // рабами»): the roll of the strike decides; the steps wait for it.
    static strikeIfRolled(effects, f) {
        const { R, state, seat, step, p } = f;
        if (!state.order || !OrderContext.of(state.order).isSeat(seat)) return null;
        StrikePlan.of(state.order).setRolledReward({
            kind: step.kind || 'att', atLeast: step.atLeast || 1,
            steps: (step.steps || []).map(one => Object.assign({ noAbilityQuestion: true }, one)),
        });
        R.log(state, seat, p.name + ': награда ждёт броска орбитального удара.');
        return null;
    }

    // «Если суммарный боевой дух всех ваших кораблей, участвующих в этом
    // орбитальном ударе, превышает суммарный боевой дух всех
    // недеморализованных отрядов и бастионов на выбранном мире, то …» («Боевые
    // гимны»): the target is chosen after the card is burned, so the steps
    // wait for the roll, when the fleet and the world are both known.
    static strikeIfMorale(effects, f) {
        const { R, state, seat, step, p } = f;
        if (!state.order || !OrderContext.of(state.order).isSeat(seat)) return null;
        StrikePlan.of(state.order).setMoraleReward({
            steps: (step.steps || []).map(one => Object.assign({ noAbilityQuestion: true }, one)),
        });
        R.log(state, seat, p.name + ': эффект ждёт орбитального удара и сравнения боевого духа.');
        return null;
    }

    // «Затем вы можете потратить 1 `def. cube`, чтобы вынудить вашего
    // противника отступить этим отрядом» («Боевые гимны»): a cube of the
    // strike's own roll buys the retreat of the unit the card routed.
    static strikeRetreatOffer(effects, f) {
        const { R, state, seat, step, p } = f;
        const plan = state.order && StrikePlan.of(state.order).planned;
        const unit = plan && plan.routedUnit ? state.units.find(u => u.id === plan.routedUnit) : null;
        if (!plan || !unit) return null;
        const kind = step.kind || 'def';
        if (!(plan.pool || []).includes(kind)) {
            R.log(state, seat, p.name + ': в броске удара нет кубика «' + kind + '» — отступление не куплено.');
            return null;
        }
        return { question: {
            kind: 'yesno', who: seat, op: 'strikeRetreatOffer', options: [],
            text: 'Потратить 1 `def. cube` удара, чтобы отряд противника отступил?',
        } };
    }

    static strikeTakeStructures(effects, f) {
        const { R, state, seat, step } = f;
        // «Изъяны плоти»: the upgrade is burned before the strike, the
        // cubes it pays with are the ones the strike rolls — the order
        // remembers the price and the world answers for it later.
        if (state.order && OrderContext.of(state.order).isSeat(seat)) {
            StrikePlan.of(state.order).setTake({ n: step.n || 1, kind: step.kind || 'def' });
            R.log(state, seat, state.players[seat].name
                + ': постройки мира удара будут взяты под контроль за '
                + (step.n || 1) + ' куб. обороны.');
        }
        return null;
    }

    static offerCaptureStrike(effects, f) {
        const { R, state, seat, step } = f;
        const plan = state.order && StrikePlan.of(state.order).planned;
        const kind = step.kind || 'def';
        const count = step.n || 2;
        if (!plan || (plan.pool || []).filter(face => face === kind).length < count
            || !R.canTakeStructuresOf(state, seat, step.system, step.pos)) return null;
        return { replace: [{
            op: 'choice', text: 'Потратить 2 кубика обороны и захватить постройки?', options: [
                { op: 'captureStrike', system: step.system, pos: step.pos, n: count, kind,
                    text: 'Потратить кубики и захватить постройки' },
                { op: 'nothing', text: 'Не тратить кубики' },
            ],
        }] };
    }

    static captureStrike(effects, f) {
        const { R, state, seat, step } = f;
        const plan = state.order && StrikePlan.of(state.order).planned;
        const pool = plan && plan.pool;
        const kind = step.kind || 'def';
        const count = step.n || 2;
        if (!pool || pool.filter(face => face === kind).length < count) return null;
        if (!R.takeStructuresOf(state, seat, step.system, step.pos)) return null;
        for (let i = 0; i < count; i++) pool.splice(pool.indexOf(kind), 1);
        R.log(state, seat, state.players[seat].name + ' тратит кубиков обороны: ' + count + '.');
        return null;
    }

    static strikeHealthDown(effects, f) {
        const { R, state, seat, step } = f;
        // «временно убавить здоровье всех юнитов в атакуемом мире на 1»
        // («Заряд радиации»): the strike that follows is deadlier — the
        // health of the units of the world is lower while it lasts.
        if (state.order && OrderContext.of(state.order).isSeat(seat)) {
            const strike = StrikePlan.of(state.order).addHealthDown(step.n || 1);
            R.log(state, seat, state.players[seat].name
                + ': здоровье отрядов в мире удара ниже на ' + strike.healthDown + '.');
        }
        return null;
    }

    static strikeFirst(effects, f) {
        const { state, step } = f;
        if (state.order) StrikePlan.of(state.order).wantFirst(step.maxKl === undefined ? 0 : step.maxKl);
        step.done = true;
        return null;
    }

    static strikeFirstPick(effects, f) {
        const { R, state, seat, step } = f;
        const order = state.order;
        const planned = order && StrikePlan.of(order).planned;
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

    static protectCombatUnits(effects, f) {
        const { R, state, combat, inCombat, side } = f;
        if (inCombat) CombatDamage.of(combat).protectAllUnits(CombatTurn.of(combat).round,
            effects.combatEffectSource(R, state, side));
        return null;
    }

    static assignDamage(effects, f) {
        const { R, state, seat, combat, inCombat, side, p } = f;
        if (!inCombat) return null;
        CombatHooks.of(combat).assignTo(seat, side);
        R.log(state, seat, p.name + ' сам назначает урон отрядам и бастионам противника.');
        return null;
    }

    static extraDamage(effects, f) {
        const { seat, step, combat, inCombat, side, foe } = f;
        if (!inCombat) return null;
        // The extra damage goes to one side or to both. The «foe» of a
        // card that offers «the opponent takes 3 more damage» is the side
        // other than the card's player: the role is fixed for this combat.
        CombatDamage.of(combat).addExtra(step.who, step.n || 0, seat);
        return null;
    }

    static damageFirst(effects, f) {
        const { R, state, seat, step, combat, inCombat, foe } = f;
        if (!inCombat) return null;
        const foeSeat = foe;
        const list = state.units.filter(u => {
            if (u.seat !== foeSeat || !BattleField.of(combat).holds(u)) return false;
            if (step.anyFoe) return !u.routed;
            const def = R.unitOf(state, u);
            return !!def && [2, 3].includes(def.kl || 0);
        }).map(u => u.id);
        for (const st of state.structures) {
            if (st.seat !== foeSeat || st.type !== 'bastion') continue;
            if (!BattleField.of(combat).holds(st)) continue;
            list.push(st.id);
        }
        // In combat an unrouted reinforcement token is a level-zero unit.
        // It is eligible for «Монт'ка» just like a plastic unit, unless it has
        // already been destroyed or moved out of the contested area.
        if (step.anyFoe) {
            const foeSide = CombatSides.sideOf(combat, foeSeat);
            const tokens = CombatTokens.of(combat);
            if (foeSide && tokens) {
                for (let i = 0; i < tokens.used(foeSide); i++) {
                    if (tokens.alive(foeSide, i) && !tokens.flipped(foeSide).includes(i)) {
                        list.push('reinforce-' + foeSide + '-' + i);
                    }
                }
            }
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
        CombatDamage.of(combat).allowOwnRouted(side, CombatTurn.of(combat).round);
        R.log(state, seat, state.players[seat].name + ' может нанести урон своим деморализованным отрядам в этом раунде.');
        return null;
    }

    static damageOneByOne(effects, f) {
        const { combat, side } = f;
        if (combat && side) CombatDamage.of(combat).setOneByOne(CombatSides.foe(side));
        return null;
    }

    static repeatDamage(effects, f) {
        const { combat } = f;
        if (combat) CombatDamage.of(combat).setRepeat();
        return null;
    }

    static damageStartTokens(effects, f) {
        const { R, state, seat, step, ctx, combat, inCombat, side, p } = f;
        if (!inCombat) return null;
        const foeSide = CombatSides.foe(side);
        // The pair count belongs to the moment the card is played, not the
        // later damage step. Use the shared combat count, including tokens.
        const n = effects.count(R, state, seat, step, ctx);
        if (step.per === 'pair' && n <= 0) return null;
        CombatDamage.of(combat).addStartTokens({
            side: foeSide, kind: step.kind || 'att', what: step.what || 'token', n,
            round: CombatTurn.of(combat).round,
        });
        R.log(state, seat, p.name + ': в начале шага повреждений противник теряет ' + n
            + (step.what === 'die' ? ' кубик(ов).' : ' жетон(ов).'));
        return null;
    }

    static combatStartMorale(effects, f) {
        const { state, seat, step } = f;
        if (state.order && OrderContext.of(state.order).isSeat(seat)) {
            OrderTally.of(state.order).addChaosCombatMorale(step.n || 1);
        }
        return null;
    }

    // «Если во время выполнения этого приказа вы начали битву в мире, то
    // получите 1 `any cube` за каждую недеморализованную сестру Репентию в
    // шаге вызова подкреплений» («Божественное избавление»): the order
    // promises the dice; the battle that fits counts and rolls them when its
    // reinforcement step is over.
    static combatStartDice(effects, f) {
        const { R, state, seat, step, p } = f;
        if (!state.order || !OrderContext.of(state.order).isSeat(seat)) return null;
        OrderTally.of(state.order).addCombatStartDice({
            kind: step.kind || 'any', n: step.n || 1, per: step.per || null,
            filter: step.filter || null, max: step.max || 0, worldOnly: !!step.worldOnly,
        });
        R.log(state, seat, p.name + ': кубики будут получены в битве этого приказа.');
        return null;
    }

    // «… добавить половину значения боевого духа (с округлением вверх) ваших
    // деморализованных отрядов к суммарному значению во время шага разрешения
    // битвы» («Несокрушимая вера»): the resolution counts them from now on.
    static routedMoraleHalf(effects, f) {
        const { R, state, seat, combat, inCombat, p } = f;
        if (!inCombat) return null;
        CombatPlans.of(combat).setRoutedMoraleHalf(seat);
        R.log(state, seat, p.name + ': деморализованные отряды добавят половину боевого духа при разрешении битвы.');
        return null;
    }

    static combatLength(effects, f) {
        const { step, combat } = f;
        if (combat) CombatTurn.of(combat).maxRounds = step.n || 1;
        return null;
    }

    // «Во время шага разрешения боя, начатого этим приказом, если вы
    // победитель — противник выбирает и уничтожает 1 деморализованный отряд
    // до отступления» («Страшный приговор»): the order remembers, the battle pays.
    static winnerDestroysRouted(effects, f) {
        const { R, state, seat, p } = f;
        if (!state.order || !OrderContext.of(state.order).isSeat(seat)) return null;
        OrderFight.of(state.order).setWinnerDestroysRouted(true);
        R.log(state, seat, p.name + ': победа в бою этого приказа будет стоить противнику деморализованного отряда.');
        return null;
    }

    static deferDamage(effects, f) {
        const { R, state, seat, step, combat, inCombat, p } = f;
        if (!inCombat) return null;
        // Preserve an absent flag in historical pending steps: the plan can
        // recognise the old Ripper reward, while an explicit false stays once.
        CombatPlans.of(combat).setDeferred({ seat, steps: step.steps || [], eachStep: step.eachStep });
        step.done = true;
        R.log(state, seat, p.name + ': эффект карты сработает в конце шага повреждений.');
        return null;
    }

    static noDamageRetreat(effects, f) {
        const { seat, step, combat, inCombat } = f;
        if (!inCombat) return null;
        CombatPlans.of(combat).addNoDamagePlan({ seat, steps: step.steps || [] });
        step.done = true;
        return null;
    }

    static noReinforce(effects, f) {
        const { seat, step, combat, foe } = f;
        // The Tyranid plan forbids tokens for the whole fight; Tau's plan is
        // limited to preparation. Old saved Tau steps retain the printed text.
        // «не может размещать жетоны подкрепления в эту область … в текущем
        // раунде битвы» («Фанатичное рвение»): the ban of one round only.
        const scope = step.scope === 'round' ? 'round'
            : (step.scope === 'preparation' || /этапе подготовки/i.test(step.ability || '')
                ? 'preparation' : 'battle');
        if (combat) CombatBans.of(combat).forbidReinforce(step.who === 'foe' ? foe : seat, scope);
        return null;
    }

    static ignoreFoeAtt(effects, f) {
        // «В этом раунде игнорируйте все вражеские `att. cube`» («Кара Божья»):
        // the card silences the dice of the OTHER side — the foe of the player
        // who played it, and only for the round it was played in.
        const { combat, side, step } = f;
        // «ваш противник» из текста — сторона, названная шагом (`who: 'foe'`),
        // а не «защитник» по умолчанию: эту же карту можно разыграть в атаке.
        const foe = step && step.who === 'me' ? side : (side ? (side === 'attacker' ? 'defender' : 'attacker') : null);
        if (combat) CombatBans.of(combat).ignoreFoeAttack(foe);
        return null;
    }

    static ignoreBastion(effects, f) {
        const { state } = f;
        if (state.order) StrikePlan.of(state.order).ignoreBastion();
        return null;
    }

    static ignoreExcess(effects, f) {
        const { R, state, seat, step, combat, inCombat, side, p } = f;
        if (!inCombat) return null;
        if (step.fallen) {
            // «Игнорируйте весь урон, который превышает здоровье этого юнита»
            // («Мученичество»): the unit is whichever of the owner's dies in
            // the damage step — the damage left after its death is lost.
            CombatDamage.of(combat).setExcess(side, 'fallen', CombatTurn.of(combat).round);
            R.log(state, seat, p.name + ': урон сверх здоровья погибшего отряда теряется.');
            return null;
        }
        const chosen = CombatDamage.of(combat).lastFirst(CombatTurn.of(combat).round);
        if (!chosen) return null;
        CombatDamage.of(combat).setExcess(chosen.side, chosen.id, CombatTurn.of(combat).round);
        R.log(state, seat, p.name + ': урон сверх здоровья выбранной цели теряется.');
        return null;
    }

    static destroyRouted(effects, f) {
        const { combat } = f;
        if (combat) CombatBans.of(combat).markDestroyRouted();
        return null;
    }

    static destroyRoutedFoe(effects, f) {
        const { R, state, seat, step, combat, inCombat, p } = f;
        if (!inCombat) return null;
        CombatPlans.of(combat).setRoutedFoe({
            seat,
            avoid: step.avoid || { kind: 'def', n: 1 },
        });
        R.log(state, seat, p.name + ': деморализованные отряды противника будут уничтожены до конца раунда.');
        step.done = true;
        return null;
    }

    static endRoundReinforce(effects, f) {
        const { R, state, seat, combat, inCombat, p } = f;
        if (!inCombat) return null;
        CombatPlans.of(combat).addEndPlan({ seat });
        R.log(state, seat, p.name + ': «Кауйон» ждёт конца раунда.');
        return null;
    }
}
