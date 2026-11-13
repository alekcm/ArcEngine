// FSBuyAsks.js — вопросы шага: покупки.
//
// Одна группа веток бывшего switch в FS_EFFECTS.step(), который решает,
// ЧТО шаг спросит у игрока. Тело каждого шага перенесено дословно;
// окружение — параметр effects и рамка шага f (FSStepContext).

class BuyAsks {
    static ops = ['buyUpgrade', 'buyAnyUpgrade', 'buyBastionNearby', 'strikePayPick', 'strikePay'];

    static buyUpgrade(effects, f) {
        const { R, state, seat, step, p } = f;
        const kind = step.kind || 'combat';
        // «Вы можете тратить жетоны подкрепления, чтобы уменьшить его стоимость
        // на 2 за каждый жетон» («Убийственное представление»): the player
        // names how many tokens he spends before he sees what he can afford.
        if (step.payAssets && step.spendAssets === undefined) {
            const have = R.player(state, seat).assetCount(step.payAssets.kind || 'reinforcement');
            if (have > 0) {
                const options = [];
                for (let i = 0; i <= have; i++) options.push(String(i));
                return { question: { kind: 'choice', who: seat, op: 'buyUpgrade', stage: 'spend', options,
                    text: 'Сколько жетонов «' + (R.assetName ? R.assetName(step.payAssets.kind || 'reinforcement') : 'подкрепления')
                        + '» потратить (скидка ' + (step.payAssets.each || 1) + ' за жетон)?' } };
            }
            step.spendAssets = 0;
        }
        // An event still purchases a card: the ordinary command-level and
        // materiel restrictions apply unless its text says otherwise.
        const discount = effects.upgradeDiscount(R, state, seat, step);
        const pile = kind === 'combat'
            ? FS_CARDS.combatDeck(R, state, seat).upgradeOptions()
            : FS_CARDS.orderUpgradeOptions(state, seat);
        const list = pile.filter(name => {
            const card = FS_CATALOG.card(kind === 'combat' ? 'combat' : 'orders', p.faction, name);
            if (!card || (card.kl || 0) > R.commandLevel(state, seat)) return false;
            const cost = kind === 'combat' && !card.upgrade ? 0 : (card.cost || 0);
            return Math.max(0, cost - discount) <= (p.materiel || 0);
        });
        if (!list.length) return null;
        return { question: { kind: 'cards', who: seat, op: 'buyUpgrade', kind2: kind, options: list, discount, text: 'Какое улучшение купить?' } };
    }

    static buyAnyUpgrade(effects, f) {
        const { R, state, seat, step, combat, p } = f;
        const sysId = StormPhase.of(state).lastSystem;
        const cap = effects.stormCapFor(R, state, sysId);
        const combatPile = new Set(R.player(state, seat).combatDeck.upgradeOptions());
        const orderPile = new Set(FS_CARDS.orderUpgradeOptions(state, seat));
        const options = FS_CATALOG.upgradeCombatCards(p.faction)
            .filter(c => (c.kl || 0) <= cap && combatPile.has(c.name)
                && !R.player(state, seat).combatDeck.cards().includes(c.name))
            .map(c => 'combat:' + c.name)
            .concat(FS_CATALOG.orderCards(p.faction)
                .filter(c => (c.kl || 0) <= cap && orderPile.has(c.name))
                .map(c => 'order:' + c.name));
        if (!options.length) return null;
        step.cap = cap;
        return { question: { kind: 'cards', who: seat, op: 'buyAnyUpgrade',
            options, text: 'Какую карту улучшения получить бесплатно?' } };
    }

    static buyBastionNearby(effects, f) {
        const { R, state, seat, step, p } = f;
        const order = state.order;
        if (order && Purchases.of(order).empty) {
            R.log(state, seat, p.name + ': бастион покупается вдобавок к покупке приказа — сначала купите отряд или постройку.');
            return null;
        }
        const cost = step.cost === undefined ? R.structureStats('bastion').cost : step.cost;
        if ((p.materiel || 0) < cost) {
            R.log(state, seat, p.name + ' не хватает материи на бастион.');
            return null;
        }
        const can = R.canTakeStructure(state, seat, 'bastion');
        if (!can.ok) {
            R.log(state, seat, can.error);
            return null;
        }
        const areas = effects.bastionAreasNearby(R, state, seat);
        if (!areas.length) {
            R.log(state, seat, p.name + ': рядом нет мира без постройки.');
            return null;
        }
        return { question: { kind: 'areas', who: seat, op: 'buyBastionNearby', options: areas, text: 'Где разместить бастион?' } };
    }

    static strikePayPick(effects, f) {
        const { state, seat, step } = f;
        const plan = state.order && StrikePlan.of(state.order).planned;
        const pay = plan && (plan.pays || [])[step.index || 0];
        if (!plan || !pay) return null;
        const cap = effects.strikePayCap(plan, pay);
        const required = (pay.n || 1) * (pay.per === 'ship' ? (plan.ships || 1) : 1);
        if (cap <= 0 || (!pay.upTo && cap < required)) return null;
        const amounts = pay.upTo ? Array.from({ length: cap + 1 }, (_, i) => i) : [0, required];
        const options = amounts.map(i => i + ' '
            + (i === 1 ? 'кубик' : (i >= 2 && i <= 4 ? 'кубика' : 'кубиков')));
        return { question: {
            kind: 'choice', who: seat, op: 'strikePayPick', index: step.index || 0,
            options: options, text: 'Сколько кубиков удара потратить?',
        } };
    }

    static strikePay(effects, f) {
        const { state, step } = f;
        if (state.order) {
            // «Мицетические споры» and «Разведка генокрадов» may both be
            // used on one orbital strike (01-rules-reference.md,
            // Orbital Strike). Each card keeps its own payment and its
            // own reward, so they are a list, not one pair of fields.
            StrikePlan.of(state.order).addPay({
                n: step.n || 1, kind: step.kind || 'att', per: step.per || null,
                upTo: !!step.upTo, reward: step.reward || null,
            });
        }
        return null;
    }
}
