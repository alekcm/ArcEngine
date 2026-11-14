// FSDestroySteps.js — шаги эффектов: уничтожение.
//
// Одна группа веток бывшего switch в FS_EFFECTS.apply(). Тело каждого шага
// перенесено дословно; изменилось только окружение: «движок эффектов» теперь
// приходит параметром effects, а общая рамка шага — объектом f (FSStepContext).

class DestroySteps {
    static ops = ['destroyUnit', 'destroy', 'destroyForMateriel', 'destroyStructureForMateriel', 'destroyStructureHere', 'destroyDamagedFoe', 'avoidDestroy', 'sabotage', 'replaceStructure', 'replaceStructureType'];

    static destroyUnit(effects, f) {
        const { R, state, seat, answer, units } = f;
        const list = units(answer.units);
        for (const u of list) {
            R.destroyUnit(state, u);
            R.log(state, seat, state.players[seat].name + ' уничтожает отряд.');
        }
        return null;
    }

    static destroy(effects, f) {
        const { R, state, step, answer, units, combat, inCombat, target } = f;
        if (combat && effects.combatWorldLowDestroy(step)) {
            const id = (answer.units || [])[0];
            if (!effects.combatWorldLowTargets(R, state, combat, target).includes(id)) {
                return { ok: false, error: 'Цель больше не находится в мире боя.' };
            }
            const victim = state.units.find(u => u.id === id);
            const def = victim ? R.unitOf(state, victim) : R.reinforceTokenDef(state, CombatSides.sideOf(combat, target));
            if (victim) R.destroyUnit(state, victim);
            else {
                const side = CombatSides.sideOf(combat, target);
                const index = CombatTokens.of(combat).indexOf(side, id);
                if (index < 0 || !R.destroyReinforcementToken(state, side, index, true)) {
                    return { ok: false, error: 'Подкрепление больше не находится в бою.' };
                }
            }
            step.done = true;
            step.destroyedDefs = def ? [def] : [];
            step.destroyedCount = 1;
            return null;
        }
        const dead = units(answer.units);
        const tokenTargets = [];
        if (inCombat && combat) for (const id of answer.units || []) {
            // Moved reinforcement tokens are already represented in state.units.
            if (typeof id !== 'string' || !id.startsWith('reinforce-') || dead.some(u => u.id === id)) continue;
            const tokens = CombatTokens.of(combat);
            const side = ['attacker', 'defender'].find(s => tokens.indexOf(s, id) >= 0);
            const index = side ? tokens.indexOf(side, id) : -1;
            if (index < 0) return { ok: false, error: 'Подкрепление больше не находится в бою.' };
            tokenTargets.push({ side, index, def: R.reinforceTokenDef(state, side) });
        }
        // «Задетый варпом» counts the storms on the borders of the
        // system the destroyed cultist stood in.
        const system = dead.length ? dead[0].system : (tokenTargets.length ? BattleField.of(combat).system : null);
        if (step.recordSystem && system) {
            StormPhase.of(state).markLastSystem(system);
            step.destroyedSystem = system;
        }
        const defs = dead.map(u => R.unitOf(state, u)).concat(tokenTargets.map(t => t.def)).filter(Boolean);
        for (const u of dead) R.destroyUnit(state, u);
        for (const t of tokenTargets) R.destroyReinforcementToken(state, t.side, t.index, true);
        step.done = dead.length + tokenTargets.length > 0;
        // The actual printed profile of each loss is used by subsequent steps.
        step.destroyedDefs = defs;
        step.destroyedCount = dead.length + tokenTargets.length;
        return null;
    }

    static destroyForMateriel(effects, f) {
        const { R, state, seat, step, answer, ctx } = f;
        const area = answer.area;
        if (!area) return null;
        const owner = ctx && ctx.owner !== undefined ? ctx.owner : seat;
        const player = state.players[owner];
        let sum = 0;
        let cities = 0;
        const units = state.units.filter(u => u.seat === owner
            && u.system === area.system && u.area === area.pos);
        for (const u of units.slice()) {
            const def = R.unitOf(state, u);
            sum += def ? (def.cost || 0) : 0;
            R.destroyUnit(state, u);
        }
        const built = state.structures.filter(s2 => s2.seat === owner
            && s2.system === area.system && s2.area === area.pos);
        for (const s2 of built.slice()) {
            sum += (R.structureStats(s2.type) || {}).cost || 0;
            if (s2.type === 'city') cities++;
            R.destroyStructure(state, s2);
        }
        if (!units.length && !built.length) return null;
        const fight = OrderFight.of(state.order);
        if (fight) fight.setTempMateriel(sum);
        // «Уничтоженный город засчитывается в ваш командный уровень на
        // время выполнения этого приказа.»
        if (cities && fight) fight.addKlBonus(cities);
        R.log(state, owner, player.name + ' уничтожает в мире ' + units.length
            + ' отряд(ов) и ' + built.length + ' постройку(ок): временно '
            + sum + ' материи.');
        step.done = true;
        return null;
    }

    static destroyDamagedFoe(effects, f) {
        const { R, state, seat, step, answer, p, combat, units } = f;
        if (answer.no) return null;
        const id = (answer.units || [])[0];
        const u = units(answer.units)[0];
        if (u && u.seat !== seat) {
            // A nonlethal hit may have already recorded this routed unit for a
            // later restoration. If the plan destroys it, retain that fact.
            const plans = combat && CombatPlans.of(combat);
            if (plans) {
                for (const record of plans.fallen(u.seat).concat(plans.candidates)) {
                    if (record.id === u.id) record.destroyed = true;
                }
                R.noteFallen(state, u, true);
                R.noteResurrect(state, u, true);
            }
            R.destroyUnit(state, u);
        } else {
            const foe = combat && CombatSides.foe(CombatSides.sideOf(combat, seat));
            const index = foe ? CombatTokens.of(combat).indexOf(foe, id) : -1;
            if (index < 0 || !R.destroyReinforcementToken(state, foe, index, true)) return null;
        }
        R.log(state, seat, p.name + ': уничтожен отряд противника, ставший добычей.');
        step.done = true;
        return null;
    }

    static avoidDestroy(effects, f) {
        const { R, state, step, combat } = f;
        const victim = state.units.find(u => u.id === step.unit);
        if (victim) {
            R.destroyUnit(state, victim);
            R.log(state, victim.seat, state.players[victim.seat].name + ': деморализованный отряд уничтожен.');
        } else if (combat && step.tokenSide && R.destroyReinforcementToken(state, step.tokenSide, step.tokenIndex, true)) {
            const owner = CombatSides.seatOf(combat, step.tokenSide);
            R.log(state, owner, state.players[owner].name + ': деморализованное подкрепление уничтожено.');
        }
        step.done = true;
        return null;
    }

    static sabotage(effects, f) {
        const { R, state, seat, step, answer, p, units } = f;
        if (step.stage !== 'structure') {
            const u = units(answer.units)[0];
            if (!u) return null;
            step.unitId = u.id;
            step.unitSystem = u.system;
            /** @type {any[]} */
            const foeStructs = state.structures
                .filter(x => x.seat !== seat && x.system === u.system).map(x => x.id);
            if (!foeStructs.length) {
                R.log(state, seat, 'В этой системе нет вражеской постройки: «Саботаж» не выполняется.');
                return null;
            }
            step.stage = 'structure';
            return { question: {
                kind: 'structures', who: seat, op: 'sabotage', n: 1,
                options: foeStructs, text: 'Какую вражескую постройку уничтожить?',
            } };
        }
        const st = state.structures.find(x => x.id === answer.structure
            && x.seat !== seat && x.system === step.unitSystem);
        const u = state.units.find(x => x.id === step.unitId && x.seat === seat
            && !x.routed && x.system === step.unitSystem);
        // Never destroy the building if the previously selected price is gone.
        if (!st || !u) return { ok: false, error: 'Выбранные отряд или постройка больше недоступны.' };
        R.destroyUnit(state, u);
        R.destroyStructure(state, st);
        R.log(state, seat, p.name + ': «Саботаж» уничтожает отряд и вражескую постройку.');
        step.done = true;
        return null;
    }

    // «уничтожить 1 постройку в этом мире» («Сокруши это!»): the building stands
    // in the world of the fight, and the card does not ask who owns it — the
    // player picks it (his own building may be the only one there).
    static destroyStructureHere(effects, f) {
        const { R, state, seat, answer, step } = f;
        const st = state.structures.find(x => x.id === answer.structure
            && x.system === step.system && x.area === step.pos);
        if (!st) return null;
        R.destroyStructure(state, st);
        R.log(state, seat, state.players[seat].name + ' уничтожает постройку в этом мире.');
        step.done = true;
        return null;
    }

    // «Уничтожьте 1 постройку в дружественном мире, чтобы получить материалы,
    // равные её материальной стоимости, увеличенной на 1» («Радикалы и
    // пуритане»): the price is paid by the building, the reward is its cost.
    static destroyStructureForMateriel(effects, f) {
        const { R, state, seat, step, answer } = f;
        const st = state.structures.find(x => x.id === answer.structure && x.seat === seat);
        if (!st) return null;
        const cost = (R.structureStats(st.type) || {}).cost || 0;
        R.destroyStructure(state, st);
        const n = cost + (step.bonus || 0);
        if (n > 0) R.player(state, seat).gainMateriel(n);
        R.log(state, seat, state.players[seat].name + ' уничтожает постройку и получает '
            + n + ' материал(а).');
        step.done = true;
        return null;
    }

    static replaceStructure(effects, f) {
        const { state, answer } = f;
        const s = state.structures.find(x => x.id === answer.structure);
        if (!s) return null;
        // The new kind of the structure is asked next.
        return { replace: [{ op: 'replaceStructureType', structure: s.id }] };
    }

    static replaceStructureType(effects, f) {
        const { R, state, seat, step, answer } = f;
        const s = state.structures.find(x => x.id === step.structure);
        const type = answer.type;
        if (!s || !type) return null;
        if (!['city', 'factory', 'bastion'].includes(type) || type === s.type) return null;
        if (typeof R.structurePoolLeft === 'function' && R.structurePoolLeft(state, type) <= 0) {
            return { ok: false, error: 'Такие постройки закончились в коробке.' };
        }
        const was = s.type;
        s.type = type;
        R.log(state, seat, state.players[seat].name + ' заменяет постройку: ' + R.structureName(was)
            + ' → ' + R.structureName(type) + '.');
        step.done = true;
        return null;
    }
}
