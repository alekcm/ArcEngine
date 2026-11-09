// FSDestroySteps.js — шаги эффектов: уничтожение.
//
// Одна группа веток бывшего switch в FS_EFFECTS.apply(). Тело каждого шага
// перенесено дословно; изменилось только окружение: «движок эффектов» теперь
// приходит параметром effects, а общая рамка шага — объектом f (FSStepContext).

class DestroySteps {
    static ops = ['destroyUnit', 'destroy', 'destroyForMateriel', 'destroyDamagedFoe', 'avoidDestroy', 'sabotage', 'replaceStructure', 'replaceStructureType'];

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
        const { R, state, step, answer, units } = f;
        const dead = units(answer.units);
        // «Задетый варпом» counts the storms on the borders of the
        // system the destroyed cultist stood in.
        if (step.recordSystem && dead.length) {
            state.chaosLastSystem = dead[0].system;
            step.destroyedSystem = dead[0].system;
        }
        for (const u of dead) R.destroyUnit(state, u);
        step.done = dead.length > 0;
        // «… чтобы противник потерял 2 кубика за каждого уничтоженного
        // Гвардейца» — the next steps count what this one destroyed.
        step.destroyedCount = dead.length;
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
        if (state.order) state.order.tempMateriel = sum;
        // «Уничтоженный город засчитывается в ваш командный уровень на
        // время выполнения этого приказа.»
        if (cities && state.order) {
            state.order.klBonus = (state.order.klBonus || 0) + cities;
        }
        R.log(state, owner, player.name + ' уничтожает в мире ' + units.length
            + ' отряд(ов) и ' + built.length + ' постройку(ок): временно '
            + sum + ' материи.');
        step.done = true;
        return null;
    }

    static destroyDamagedFoe(effects, f) {
        const { R, state, seat, step, answer, p, units } = f;
        if (answer.no) return null;
        const u = units(answer.units)[0];
        if (!u || u.seat === seat) return null;
        R.destroyUnit(state, u);
        R.log(state, seat, p.name + ': «Критический удар» уничтожает отряд, получивший урон.');
        step.done = true;
        return null;
    }

    static avoidDestroy(effects, f) {
        const { R, state, step } = f;
        const victim = state.units.find(u => u.id === step.unit);
        if (victim) {
            R.destroyUnit(state, victim);
            R.log(state, victim.seat, state.players[victim.seat].name + ': деморализованный отряд уничтожен.');
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
        if (!st) return null;
        const u = state.units.find(x => x.id === step.unitId);
        if (u) R.destroyUnit(state, u);
        R.destroyStructure(state, st);
        R.log(state, seat, p.name + ': «Саботаж» уничтожает отряд и вражескую постройку.');
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
        if (!['city', 'factory', 'bastion'].includes(type)) return null;
        s.type = type;
        R.log(state, seat, state.players[seat].name + ' заменяет постройку.');
        return null;
    }
}
