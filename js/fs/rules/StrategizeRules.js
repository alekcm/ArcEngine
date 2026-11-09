// FSRulesStrategize.js — the strategize order: the upgrade cards, their
// levels, the discounts and the refund of a mis-bought card.

class StrategizeRules {
    /** @param {any} engine the rules facade (FSRules.js) */
    constructor(engine) {
        this.engine = engine;
    }

    cmdBuyUpgrade(state, seat, cmd) {
        const order = this.engine.orderOf(state, seat, 'strategize');
        if (!order) return { ok: false, error: 'Сейчас нельзя покупать улучшения.' };
        const p = state.players[seat];
        if (!this.engine.hasUnitsOrStructures(state, seat, order.system)) {
            return { ok: false, error: 'В активной системе нет ваших отрядов и построек.' };
        }
        const upgrades = UpgradeOrder.of(order);
        // The order may allow only one upgrade.
        if (upgrades.full) {
            return { ok: false, error: 'Можно купить только ' + upgrades.limit + ' улучшение(я).' };
        }
        const kind = cmd.kind;       // 'combat' | 'order'
        if (kind === 'combat') {
            if (upgrades.combat) return { ok: false, error: 'Боевое улучшение уже куплено.' };
            const card = FS_CATALOG.card('combat', p.faction, cmd.card);
            if (!card) return { ok: false, error: 'Нет такой карты.' };
            if (card.kl > this.engine.commandLevel(state, seat)) return { ok: false, error: 'Не хватает уровня командования.' };
            // A basic card that was returned to the upgrade pile costs zero.
            const cost = card.upgrade ? Math.max(0, card.cost - (p.cardDiscount || 0)) : 0;
            if (p.materiel < cost) return { ok: false, error: 'Не хватает материи.' };
            const deck = FS_CARDS.combatDeck(this.engine, state, seat);
            if (deck.count(card.name) >= 2) return { ok: false, error: 'Эта карта улучшения уже есть у вас в колоде.' };
            const pile = deck.upgradePile();
            if (pile.length && !pile.includes(card.name)) return { ok: false, error: 'Этой карты нет в колоде улучшений.' };
            // Which pair leaves the deck is the player's choice and nobody
            // else's: the rule replaces two copies of one card, and both pairs
            // are equally legal. The engine used to pick the first legal pair
            // itself, so a purchase made without naming the pair threw out a
            // card the player had never chosen. Now the command waits for the
            // answer — the same way a card's own step does.
            const pairs = deck.pairOptions().filter(name => name !== card.name);
            if (!pairs.length) return { ok: false, error: 'В колоде нет двух копий одной карты.' };
            const wanted = cmd.remove;
            if (!wanted) {
                // The question of the order is the SAME object the cards and the
                // panel use in state.pending: one shape, one reader.
                state.pending = {
                    seat, answerSeat: seat, kind: 'order',
                    steps: [], index: 0,
                    question: {
                        kind: 'cards', op: 'buyUpgradeReplace', kind2: 'combat', card: card.name,
                        options: pairs, text: 'Какую пару карт боевой колоды заменить?',
                    },
                    // The remembered half of the purchase: nothing is paid and
                    // nothing leaves the deck until the pair is named.
                    ctx: { buyUpgrade: { type: 'buyUpgrade', kind: 'combat', card: card.name } },
                };
                return { ok: true, pending: true };
            }
            if (!pairs.includes(wanted)) return { ok: false, error: 'Такой пары в колоде нет.' };
            const before = deck.size();
            if (!deck.replacePair(wanted, card.name) || deck.size() !== before) {
                return { ok: false, error: 'Пару карт заменить не удалось.' };
            }
            this.engine.player(state, seat).payMateriel(cost);
            // Kept for the refund: the pair that left the deck, the card that came in.
            upgrades.buyCombat(card.name, wanted, cost);
            this.engine.log(state, seat, p.name + ' заменяет пару «' + wanted + '» на «' + card.name + '».');
            return { ok: true };
        }
        if (kind === 'order') {
            if (upgrades.orderCard) return { ok: false, error: 'Улучшение приказа уже куплено.' };
            const card = FS_CATALOG.card('orders', p.faction, cmd.card);
            if (!card) return { ok: false, error: 'Нет такой карты.' };
            if (card.kl > this.engine.commandLevel(state, seat)) return { ok: false, error: 'Не хватает уровня командования.' };
            const cost = Math.max(0, card.cost - (p.cardDiscount || 0));
            if (p.materiel < cost) return { ok: false, error: 'Не хватает материи.' };
            // One copy of each order upgrade per player: already-owned cards are not offered twice.
            if ((p.upgrades || []).some(u => u.name === card.name)) {
                return { ok: false, error: 'Такое улучшение приказа у вас уже есть.' };
            }
            const pile = p.decks && Array.isArray(p.decks.upgradeOrder) ? p.decks.upgradeOrder : null;
            if (pile && !pile.includes(card.name)) return { ok: false, error: 'Этой карты нет в колоде улучшений.' };
            this.engine.player(state, seat).payMateriel(cost);
            p.upgrades.push({ name: card.name, used: false, order: card.order });
            if (pile) pile.splice(pile.indexOf(card.name), 1);
            // Kept for the refund.
            upgrades.buyOrder(card.name, cost);
            this.engine.log(state, seat, p.name + ' купил улучшение приказа «' + card.name + '».');
            return { ok: true };
        }
        return { ok: false, error: 'Неизвестный тип улучшения.' };
    }

    cmdRefundUpgrade(state, seat, cmd) {
        const order = this.engine.orderOf(state, seat, 'strategize');
        if (!order) return { ok: false, error: 'Отменить можно только улучшения приказа стратегии.' };
        const p = state.players[seat];
        const upgrades = UpgradeOrder.of(order);
        if (cmd.kind === 'combat') {
            const buy = upgrades.combatBuy;
            if (!buy || buy.card !== cmd.card) return { ok: false, error: 'Это улучшение сейчас не куплено.' };
            const deck = FS_CARDS.combatDeck(this.engine, state, seat);
            if (!deck.replacePair(buy.card, buy.removed[0])) {
                return { ok: false, error: 'В колоде нет купленных копий — отмена невозможна.' };
            }
            const card = FS_CATALOG.card('combat', p.faction, buy.card);
            const fallback = card ? Math.max(0, card.cost - (p.cardDiscount || 0)) : 0;
            this.engine.player(state, seat).gainMateriel(buy.price != null ? buy.price : fallback);
            upgrades.refundCombat();
            this.engine.log(state, seat, p.name + ' отменил покупку боевого улучшения «' + buy.card + '».');
            return { ok: true };
        }
        if (cmd.kind === 'order') {
            const name = upgrades.orderName;
            if (!name || name !== cmd.card) return { ok: false, error: 'Улучшение сейчас не куплено.' };
            const idx = (p.upgrades || []).findIndex(u => u.name === name);
            if (idx < 0) return { ok: false, error: 'Улучшение уже куда-то пропало — отмена невозможна.' };
            const card = FS_CATALOG.card('orders', p.faction, name);
            const fallback = card ? Math.max(0, card.cost - (p.cardDiscount || 0)) : 0;
            p.upgrades.splice(idx, 1);
            const pile = p.decks && Array.isArray(p.decks.upgradeOrder) ? p.decks.upgradeOrder : null;
            if (pile && !pile.includes(name)) pile.push(name);
            const receipt = upgrades.orderBuy;
            this.engine.player(state, seat).gainMateriel(receipt && receipt.price != null
                ? receipt.price : fallback);
            upgrades.refundOrder();
            this.engine.log(state, seat, p.name + ' отменил покупку улучшения приказа «' + name + '».');
            return { ok: true };
        }
        return { ok: false, error: 'Неизвестный тип улучшения.' };
    }

    cmdFinishStrategize(state, seat) {
        const order = this.engine.orderOf(state, seat, 'strategize');
        if (!order) return { ok: false, error: 'Нечего заканчивать.' };
        // «Затем разыграйте ограниченное Развертывание …, Продвижение … или
        // Доминирование … в активной системе» («Департаменто муниторум»): the
        // order turns into the second, limited one instead of ending.
        if (order.nestedKind) {
            const kind = order.nestedKind;
            order.nestedKind = null;
            order.nested = true;
            order.order = kind;
            PhasePlan.of(order).set(null);
            if (Purchases.of(order)) Purchases.of(order).clear();
            const purchases = UpgradeOrder.of(order);
            if (purchases) purchases.reset();
            if (kind === 'advance') order.moveAreaLimit = 1;
            if (kind === 'deploy') DeployScope.of(order).setAreaLimit(1);
            const res = this.engine.resolveOrder(state, seat, kind, order.system);
            if (res && res.ok === false) return res;
            this.engine.log(state, seat, state.players[seat].name + ' разыгрывает ограниченный приказ: '
                + this.engine.orderName(kind) + '.');
            return { ok: true, nested: true };
        }
        const p2 = state.players[seat];
        p2.eventTokens++;
        this.engine.log(state, seat, p2.name + ' кладёт приказ на колоду событий.');
        // «помимо этого приказа … еще 2 жетона приказов из своей игровой зоны»:
        // they are USED tokens, not the strategize token just put on the deck.
        const bonus = (state.order && state.order.chaosDeckBonus) || 0;
        if (bonus > 0) {
            const free = Math.min(bonus, this.engine.usedOrderTokens(state, seat));
            p2.eventTokens += free;
            if (free) this.engine.log(state, seat, p2.name + ' кладёт ещё ' + free + ' жетон(ов) приказов на колоду событий.');
        }
        this.engine.finishOrder(state, seat);
        return { ok: true };
    }

}
