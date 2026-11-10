// FSPurchaseSteps.js — шаги эффектов: покупки.
//
// Одна группа веток бывшего switch в FS_EFFECTS.apply(). Тело каждого шага
// перенесено дословно; изменилось только окружение: «движок эффектов» теперь
// приходит параметром effects, а общая рамка шага — объектом f (FSStepContext).

class PurchaseSteps {
    static ops = ['buyUpgrade', 'buyAnyUpgrade', 'buyBastionNearby', 'strikePayPick'];

    static buyUpgrade(effects, f) {
        const { R, state, seat, step, answer, p, combat } = f;
        const card = answer.card;
        if (!card) return null;
        const off = effects.upgradeDiscount(R, state, seat, step);
        if (step.kind === 'combat') {
            const c = FS_CATALOG.card('combat', p.faction, card);
            if (!c) return null;
            // Event cards do not add a command-level gate: the discount
            // and the printed text are the whole restriction here.
            const price = c.upgrade ? Math.max(0, (c.cost || 0) - off) : 0;
            if (p.materiel < price) return null;
            const deck = FS_CARDS.combatDeck(R, state, seat);
            if (deck.count(c.name) >= 2) return null;
            const remove = answer.remove || answer.replace || answer.deckCard;
            // The player names the pair to replace. No card is added to
            // the deck and no materiel is spent before this answer.
            if (!remove) {
                const pairs = deck.pairOptions();
                if (!pairs.length) return null;
                return { question: {
                    kind: 'cards', who: seat, op: 'buyUpgradeReplace', kind2: 'combat',
                    card: c.name, discount: off, options: pairs,
                    text: 'Какую пару карт боевой колоды заменить?',
                } };
            }
            const before = deck.size();
            if (!deck.replacePair(remove, c.name) || deck.size() !== before) return null;
            R.player(state, seat).payMateriel(price);
            R.log(state, seat, state.players[seat].name + ' заменяет пару «' + remove
                + '» на боевое улучшение «' + c.name + '».');
            return null;
        }
        const c = FS_CATALOG.card('orders', p.faction, card);
        if (!c) return null;
        // The discount of the card covers the upgrades of the orders
        // too: «Купите одну карту улучшения приказа, уменьшив её
        // стоимость …» («Лингва Технис»).
        const price = Math.max(0, (c.cost || 0) - off);
        if (p.materiel < price) return null;
        if ((p.upgrades || []).some(u => u.name === c.name)) return null;
        const pile = p.decks && Array.isArray(p.decks.upgradeOrder) ? p.decks.upgradeOrder : null;
        R.player(state, seat).payMateriel(price);
        p.upgrades.push({ name: c.name, used: false, order: c.order });
        if (pile && pile.includes(c.name)) pile.splice(pile.indexOf(c.name), 1);
        R.log(state, seat, state.players[seat].name + ' покупает улучшение приказа «' + c.name + '».');
        return null;
    }

    static buyAnyUpgrade(effects, f) {
        const { R, state, seat, step, answer, combat } = f;
        const raw = String(answer.card || '');
        const at = raw.indexOf(':');
        const kind = at < 0 ? 'combat' : raw.slice(0, at);
        const name = at < 0 ? raw : raw.slice(at + 1);
        const cap = effects.stormCapFor(R, state, StormPhase.of(state).lastSystem);
        const p2 = state.players[seat];
        if (kind === 'combat') {
            const card = FS_CATALOG.upgradeCombatCards(p2.faction)
                .find(c => c.name === name && (c.kl || 0) <= cap);
            if (!card) return null;
            const deck = FS_CARDS.combatDeck(R, state, seat);
            const remove = answer.remove || answer.replace || answer.deckCard;
            if (!remove) {
                const pairs = deck.pairOptions();
                if (!pairs.length) return null;
                return { question: {
                    kind: 'cards', who: seat, op: 'buyAnyUpgradeReplace', kind2: 'combat',
                    card: raw, options: pairs,
                    text: 'Какую пару карт боевой колоды заменить?',
                } };
            }
            const before = deck.size();
            if (!deck.replacePair(remove, name) || deck.size() !== before) return null;
            R.log(state, seat, p2.name + ' заменяет пару «' + remove
                + '» на бесплатное боевое улучшение «' + name + '».');
            step.done = true;
            return null;
        }
        const card = FS_CATALOG.card('orders', p2.faction, name);
        if (card && (card.kl || 0) > cap) return null;
        if (!card || (p2.upgrades || []).some(u => u.name === name)) return null;
        p2.upgrades.push({ name, used: false, order: card.order });
        const pile = p2.decks.upgradeOrder;
        if (Array.isArray(pile)) {
            const at2 = pile.indexOf(name);
            if (at2 >= 0) pile.splice(at2, 1);
        }
        R.log(state, seat, p2.name + ' бесплатно получает улучшение приказа «' + name + '».');
        step.done = true;
        return null;
    }

    static buyBastionNearby(effects, f) {
        const { R, state, seat, step, answer, ctx } = f;
        const area = answer.area;
        if (!area) return null;
        const cost = step.cost === undefined ? R.structureStats('bastion').cost : step.cost;
        const buyer = state.players[ctx && ctx.owner !== undefined ? ctx.owner : seat];
        if ((buyer.materiel || 0) < cost) return null;
        const can = R.canTakeStructure(state, buyer.seat, 'bastion');
        if (!can.ok) return null;
        R.player(state, buyer.seat).payMateriel(cost);
        R.addStructure(state, buyer.seat, 'bastion', area.system, area.pos);
        R.log(state, buyer.seat, buyer.name + ' покупает бастион за ' + cost + ' материи.');
        step.done = true;
        return null;
    }

    static strikePayPick(effects, f) {
        const { R, state, seat, step, answer, ctx, units } = f;
        const plan = state.order && StrikePlan.of(state.order).planned;
        const index = step.index || 0;
        const pay = plan && (plan.pays || [])[index];
        if (!plan || !pay) return null;
        const cap = effects.strikePayCap(plan, pay);
        const i = Number(answer.choice);
        const want = Math.max(0, Math.min(cap, Number.isFinite(i) ? i : 0));
        const owner = ctx && ctx.owner !== undefined ? ctx.owner : seat;
        const player = state.players[owner];
        if (want > 0) {
            // The cubes are spent before any damage is suffered: they
            // leave the common pool of this strike for good.
            const kind = pay.kind || 'att';
            for (let k = 0; k < want; k++) {
                const pool = plan.pool || [];
                const at = kind === 'any'
                    ? pool.findIndex(d => d !== null && d !== undefined)
                    : pool.indexOf(kind);
                if (at >= 0) pool.splice(at, 1);
            }
            plan.paid[index] = want;
            if (state.order) StrikePlan.of(state.order).setPaid(want);
            R.log(state, owner, player.name + ' тратит ' + want + ' '
                + (want === 1 ? 'кубик' : 'кубика') + ' удара.');
        }
        if (want <= 0) return null;
        const reward = pay.reward || {};
        if (reward.units) {
            // One question per kind of unit: the models of the chosen
            // kind are bought at the printed price and stand in the
            // world the strike was aimed at.
            return {
                replace: [{
                    op: 'placeUnit', n: want, buy: true, pick: true, who: 'me',
                    maxKl: reward.units.maxKl, dest: reward.units.dest || 'orderWorld',
                }],
            };
        }
        if (reward.destroyOne) {
            // «Полное разрушение»: the defender destroys one of his own
            // units or buildings in the world of the strike.
            return { replace: [{
                op: 'strikeDestroyOne', who: 'me',
                system: plan.system, pos: plan.pos, defender: plan.defender,
            }] };
        }
        if (reward.routeDamaged) {
            // «Страх с небес»: the damaged units are remembered by
            // cmdStrikeDamage and one of them is routed at the end.
            if (state.order) StrikePlan.of(state.order).routeDamagedAfter();
        }
        if (reward.first) {
            // «Точные удары»: the payment was made, so the chosen enemy
            // unit takes the damage first. The question follows in
            // resumeStrike, after all the payments of the strike.
            if (state.order) StrikePlan.of(state.order).wantFirst(reward.maxKl);
        }
        if (reward.asset) {
            const n = want * (reward.n || 1);
            R.player(state, owner).addAsset(reward.asset, n);
            R.log(state, owner, player.name + ' получает жетон(ы): ' + reward.asset + ' × ' + n + '.');
        }
        return null;
    }
}
