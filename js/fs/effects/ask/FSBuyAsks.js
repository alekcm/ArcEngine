// FSBuyAsks.js — вопросы шага: покупки.
//
// Одна группа веток бывшего switch в FS_EFFECTS.step(), который решает,
// ЧТО шаг спросит у игрока. Тело каждого шага перенесено дословно;
// окружение — параметр effects и рамка шага f (FSStepContext).

class BuyAsks {
    static ops = ['buyUpgrade', 'buyAnyUpgrade', 'buyBastionNearby', 'strikePayPick', 'strikePay'];

    static buyUpgrade(effects, f) {
        const { R, state, seat, step, combat } = f;
        const kind = step.kind || 'combat';
        // Only the physical cards still lying in the face-up upgrade
        // pile can be bought; a basic card returned there costs zero.
        const discount = effects.upgradeDiscount(R, state, seat, step);
        const list = kind === 'combat'
            ? FS_CARDS.combatDeck(R, state, seat).upgradeOptions()
            : FS_CARDS.orderUpgradeOptions(state, seat);
        if (!list.length) return null;
        return { question: { kind: 'cards', who: seat, op: 'buyUpgrade', kind2: kind, options: list, discount, text: 'Какое улучшение купить?' } };
    }

    static buyAnyUpgrade(effects, f) {
        const { R, state, seat, step, combat, p } = f;
        const sysId = state.chaosLastSystem;
        const cap = effects.stormCapFor(R, state, sysId);
        const owned = new Set((p.upgrades || []).map(u => u.name));
        const options = FS_CATALOG.upgradeCombatCards(p.faction)
            .filter(c => (c.kl || 0) <= cap && !R.player(state, seat).combatDeck.cards().includes(c.name))
            .map(c => 'combat:' + c.name)
            .concat(FS_CATALOG.orderCards(p.faction)
                .filter(c => (c.kl || 0) <= cap && !owned.has(c.name))
                .map(c => 'order:' + c.name));
        if (!options.length) return null;
        step.cap = cap;
        return { question: { kind: 'cards', who: seat, op: 'buyAnyUpgrade',
            options, text: 'Какую карту улучшения получить бесплатно?' } };
    }

    static buyBastionNearby(effects, f) {
        const { R, state, seat, step, p } = f;
        const order = state.order;
        if (order && !(order.purchases || []).length) {
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
        const plan = state.order && state.order.strikePlanned;
        const pay = plan && (plan.pays || [])[step.index || 0];
        if (!plan || !pay) return null;
        const cap = effects.strikePayCap(plan, pay);
        if (cap <= 0) return null;
        const options = [];
        for (let i = 0; i <= cap; i++) {
            options.push(i + ' ' + (i === 1 ? 'кубик' : (i >= 2 && i <= 4 ? 'кубика' : 'кубиков')));
        }
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
            const list = state.order.strikePays || (state.order.strikePays = []);
            const pay = { n: step.n || 1, kind: step.kind || 'att', per: step.per || null, reward: null };
            list.push(pay);
            state.order.strikePay = pay;
        }
        return null;
    }
}
