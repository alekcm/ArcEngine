// FSGainSteps.js — шаги эффектов: доход.
//
// Одна группа веток бывшего switch в FS_EFFECTS.apply(). Тело каждого шага
// перенесено дословно; изменилось только окружение: «движок эффектов» теперь
// приходит параметром effects, а общая рамка шага — объектом f (FSStepContext).

class GainSteps {
    static ops = ['gainAsset', 'exchangeMateriel', 'exchangeAsset', 'loseAsset', 'gainWorldAssets', 'gainSystemMateriel', 'gainByUnit'];

    static gainAsset(effects, f) {
        const { R, state, seat, step, answer, ctx, p } = f;
        const kind = answer.asset || step.kind || 'forge';
        // «получить 1 жетон подкрепления за каждый потраченный `att.
        // cube`» («Разведка генокрадов»): the payment sets the count.
        const n = effects.count(R, state, seat, step, ctx);
        if (n <= 0) return null;
        // Предел жетонов считается в одном месте — PlayerEntity.addAsset;
        // здесь только просьба «дай n», а не арифметика над лимитом.
        R.player(state, seat).addAsset(kind, n);
        R.log(state, seat, state.players[seat].name + ' получает жетон(ы): ' + kind + ' × ' + n + '.');
        return null;
    }

    static exchangeMateriel(effects, f) {
        const { R, state, seat, step, answer, p } = f;
        const kind = answer.asset || answer.assetType || 'forge';
        const n = Math.min(step.n || 1, p.materiel);
        if (n <= 0) return null;
        R.player(state, seat).payMateriel(n);
        // The Tyranids keep four tokens of EVERY kind: the raised limit of the
        // faction lives in the catalogue and is applied by addAsset.
        R.player(state, seat).addAsset(kind, n * (step.gain || 1));
        R.log(state, seat, state.players[seat].name + ' меняет материю на жетон ресурса.');
        return null;
    }

    static exchangeAsset(effects, f) {
        const { R, state, seat, step, answer, p } = f;
        const kind = answer.asset || answer.assetType || 'forge';
        const n = Math.min(step.n || 1, R.player(state, seat).assetCount(kind));
        if (n <= 0) return null;
        R.player(state, seat).payAsset(kind, n);
        R.player(state, seat).gainMateriel(n * (step.gain || 1));
        R.log(state, seat, state.players[seat].name + ' меняет жетон ресурса на материю.');
        return null;
    }

    static loseAsset(effects, f) {
        const { R, state, seat, step, answer, target } = f;
        const p2 = state.players[target] || state.players[seat];
        const kind = answer.asset || (answer.assets || [])[0];
        if (!kind || !p2) return null;
        R.player(state, p2.seat).takeAsset(kind, step.n || 1);
        R.log(state, p2.seat, p2.name + ' теряет жетон: ' + kind + '.');
        return null;
    }

    static gainWorldAssets(effects, f) {
        const { R, state, seat, step, answer, ctx, p } = f;
        const area = answer.area || ctx.world;
        // The second leg of the step: the token the player chose for the
        // world's prosperity icon.
        if (answer.asset) {
            const kind = answer.asset;
            R.player(state, seat).addAsset(kind, step.prosperity || 1);
            R.log(state, seat, state.players[seat].name + ' берёт жетон процветания: ' + kind + '.');
            return null;
        }
        if (!area) return null;
        return effects.gainWorldAssetsBody(R, state, seat, step, area);
    }

    static gainSystemMateriel(effects, f) {
        const { R, state, seat, answer } = f;
        const sys = Board.of(state).system(answer.system);
        if (!sys) return null;
        let sum = 0;
        for (const a of sys.areas) {
            if (!a.world) continue;
            if (R.control(state, seat, sys.id, a.pos) !== 'friendly') continue;
            sum += a.world.materiel || 0;
        }
        R.player(state, seat).gainMateriel(sum);
        R.log(state, seat, state.players[seat].name + ' получает материю: ' + sum + '.');
        return null;
    }

    static gainByUnit(effects, f) {
        const { R, state, seat, step, answer, units } = f;
        // The chosen unit decides the number of the tokens: its printed
        // combat value («Ржавые сталкеры»).
        const u = units(answer.units)[0];
        const def = u ? R.unitOf(state, u) : null;
        step.picked = u ? u.id : null;
        step.pickedValue = def ? (def[step.stat || 'combat'] || 0) : 0;
        step.done = !!u;
        const combat = state.combat;
        if (!u || !combat) return null;
        const side = CombatSides.sideOf(combat, seat);
        const n = step.pickedValue;
        if (n > 0) {
            combat.tokens[side][step.kind] += n;
            R.log(state, seat, state.players[seat].name + ' получает ' + n + ' '
                + (step.kind === 'att' ? 'жетонов атаки' : 'жетонов обороны')
                + ' по боевому значению выбранного отряда.');
        }
        return null;
    }
}
