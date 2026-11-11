// FSRulesDominate.js — the dominate order: the assets of the friendly worlds,
// the prosperity tokens and the ability of the faction.

class DominateRules {
    /** @param {any} engine the rules facade (FSRules.js) */
    constructor(engine) {
        this.engine = engine;
    }

    dominate(state, seat, systemId) {
        const p = state.players[seat];
        const tally = OrderTally.of(state.order);
        const sys = this.engine.system(state, systemId);
        // «Развертывание (в 1 области), Продвижение (перемещение из 1 области)
        // или Доминирование (сбор активов из 1 мира …)» («Департаменто
        // муниторум»): the nested order is limited to one world.
        if (OrderContext.of(state.order).nested) {
            PhasePlan.of(state.order).set('dominate');
            tally.setAbility(this.engine.factionAbilityText(state, seat));
            /** @type {any} */
            const res = this.dominateOneWorld(state, seat, systemId);
            if (res && res.pending) return res;
            return { ok: true };
        }
        const gained = [];
        for (const area of sys.areas) {
            if (!area.world) continue;
            if (this.engine.control(state, seat, systemId, area.pos) !== 'friendly') continue;
            for (const asset of area.world.assets) {
                if (asset === 'prosperity') {
                    // The player chooses the token.
                    gained.push('prosperity');
                    tally.addProsperity(1);
                } else if (this.engine.player(state, seat).addAsset(asset, 1)) {
                    gained.push(asset);
                }
            }
        }
        tally.setGained(gained);
        if (gained.length) {
            this.engine.log(state, seat, p.name + ' получил ресурсы: ' + gained.join(', ') + '.');
        }
        // The faction ability is resolved by the player (it is a card-like text).
        PhasePlan.of(state.order).set('dominate');
        tally.setAbility(this.engine.factionAbilityText(state, seat));
    }

    /**
     * «Доминирование (сбор активов из 1 мира …)» — «Департаменто муниторум»:
     * вложенный приказ собирает активы ровно одного мира активной системы.
     * Мир называет игрок: миров с ресурсами может быть несколько, и «сбор со
     * всех» — это уже другой приказ.
     */
    dominateOneWorld(state, seat, systemId) {
        const worlds = this.engine.board(state).friendlyWorlds(seat)
            .filter(a => a.system === systemId);
        if (!worlds.length) return null;
        if (worlds.length === 1) return this.gatherWorld(state, seat, worlds[0]);
        // The question belongs to the order that asked it: an answer after the
        // order is over has nothing to apply (Question).
        Question.of(state).ask({
            seat, kind: 'order',
            question: {
                kind: 'areas', who: seat, op: 'dominateWorld',
                options: worlds.map(a => ({ system: a.system, pos: a.pos })),
                text: 'С какого мира собрать активы?',
            },
            ctx: { dominateWorld: { seat, systemId } },
        });
        return { pending: true };
    }

    /** The assets of one world: the same counts the full order uses. */
    gatherWorld(state, seat, area) {
        const tally = OrderTally.of(state.order);
        const gained = [];
        const sys = this.engine.system(state, area.system);
        const a = sys && sys.areas.find(x => x.pos === area.pos);
        if (!a || !a.world) return null;
        for (const asset of a.world.assets || []) {
            if (asset === 'prosperity') {
                gained.push('prosperity');
                tally.addProsperity(1);
            } else if (this.engine.player(state, seat).addAsset(asset, 1)) {
                gained.push(asset);
            }
        }
        tally.setGained(gained);
        if (gained.length) {
            this.engine.log(state, seat, state.players[seat].name
                + ' собирает активы мира ' + a.world.name + ': ' + gained.join(', ') + '.');
        }
        return gained;
    }

    cmdTakeProsperity(state, seat, cmd) {
        const order = this.engine.orderOf(state, seat, 'dominate');
        if (!order) return { ok: false, error: 'Сейчас не приказ доминирования.' };
        const tally = OrderTally.of(order);
        if (!tally.prosperity) return { ok: false, error: 'Нет жетонов процветания.' };
        const asset = cmd.asset;
        if (!['forge', 'cache', 'reinforcement'].includes(asset)) return { ok: false, error: 'Неизвестный ресурс.' };
        const p = state.players[seat];
        const player = this.engine.player(state, seat);
        if (!player.hasRoomFor(asset)) return { ok: false, error: 'У вас уже ' + player.assetLimit(asset) + ' таких жетонов.' };
        player.addAsset(asset, 1);
        tally.spendProsperity();
        this.engine.log(state, seat, p.name + ' взял жетон процветания: ' + this.engine.assetName(asset) + '.');
        return { ok: true };
    }

    takeProsperityLeft(state, seat) {
        const order = state.order;
        const tally = OrderTally.of(order);
        if (!tally || !tally.prosperity) return;
        const p = state.players[seat];
        while (tally.prosperity > 0) {
            const player = this.engine.player(state, seat);
            const free = player.freeAssetKinds();
            if (!free.length) break;    // every asset is at its limit
            player.addAsset(free[0], 1);
            tally.spendProsperity();
            this.engine.log(state, seat, p.name + ' берёт за жетон процветания: ' + this.engine.assetName(free[0]) + '.');
        }
        tally.clearProsperity();
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
            OrderTally.of(order).setFinishesAfterEffect();
            this.engine.runEffects(state, seat, steps, { kind: 'ability', ctx: null });
            return { ok: true, pending: true };
        }
        this.engine.finishOrder(state, seat);
        return { ok: true };
    }

}
