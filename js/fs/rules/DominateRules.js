// FSRulesDominate.js — the dominate order: the assets of the friendly worlds,
// the prosperity tokens and the ability of the faction.

class DominateRules {
    /** @param {any} engine the rules facade (FSRules.js) */
    constructor(engine) {
        this.engine = engine;
    }

    dominate(state, seat, systemId) {
        const p = state.players[seat];
        const sys = this.engine.system(state, systemId);
        const gained = [];
        for (const area of sys.areas) {
            if (!area.world) continue;
            if (this.engine.control(state, seat, systemId, area.pos) !== 'friendly') continue;
            for (const asset of area.world.assets) {
                if (asset === 'prosperity') {
                    // The player chooses the token.
                    gained.push('prosperity');
                    state.order.prosperity = (state.order.prosperity || 0) + 1;
                } else if (this.engine.player(state, seat).addAsset(asset, 1)) {
                    gained.push(asset);
                }
            }
        }
        state.order.gained = gained;
        if (gained.length) {
            this.engine.log(state, seat, p.name + ' получил ресурсы: ' + gained.join(', ') + '.');
        }
        // The faction ability is resolved by the player (it is a card-like text).
        PhasePlan.of(state.order).set('dominate');
        state.order.ability = this.engine.faction(state, seat).ability;
    }

    cmdTakeProsperity(state, seat, cmd) {
        const order = this.engine.orderOf(state, seat, 'dominate');
        if (!order) return { ok: false, error: 'Сейчас не приказ доминирования.' };
        if (!order.prosperity) return { ok: false, error: 'Нет жетонов процветания.' };
        const asset = cmd.asset;
        if (!['forge', 'cache', 'reinforcement'].includes(asset)) return { ok: false, error: 'Неизвестный ресурс.' };
        const p = state.players[seat];
        const player = this.engine.player(state, seat);
        if (!player.hasRoomFor(asset)) return { ok: false, error: 'У вас уже ' + player.assetLimit(asset) + ' таких жетонов.' };
        player.addAsset(asset, 1);
        order.prosperity--;
        this.engine.log(state, seat, p.name + ' взял жетон процветания: ' + this.engine.assetName(asset) + '.');
        return { ok: true };
    }

    takeProsperityLeft(state, seat) {
        const order = state.order;
        if (!order || !order.prosperity) return;
        const p = state.players[seat];
        while (order.prosperity > 0) {
            const player = this.engine.player(state, seat);
            const free = player.freeAssetKinds();
            if (!free.length) break;    // every asset is at its limit
            player.addAsset(free[0], 1);
            order.prosperity--;
            this.engine.log(state, seat, p.name + ' берёт за жетон процветания: ' + this.engine.assetName(free[0]) + '.');
        }
        order.prosperity = 0;
    }

    cmdFinishDominate(state, seat, cmd = {}) {
        const order = this.engine.orderOf(state, seat, 'dominate');
        if (!order) return { ok: false, error: 'Нечего заканчивать.' };
        // The ability of the faction: the text is the rule.
        const faction = this.engine.faction(state, seat);
        const text = faction && faction.ability ? faction.ability.text : '';
        const steps = typeof FS_EFFECTS.abilityFor === 'function'
            ? FS_EFFECTS.abilityFor(faction)
            : FS_EFFECTS.parse(text || '', { kind: 'ability', faction: state.players[seat].faction });
        // A faction ability is a permission, not a duty: the player may leave
        // it alone («you may ...»).
        if (steps.length && !cmd.skip) {
            // The order is over when the effect of the ability is done.
            order.finishAfterEffect = true;
            this.engine.runEffects(state, seat, steps, { kind: 'ability', ctx: null });
            return { ok: true, pending: true };
        }
        this.engine.finishOrder(state, seat);
        return { ok: true };
    }

}
