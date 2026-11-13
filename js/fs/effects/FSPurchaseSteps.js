// FSPurchaseSteps.js — шаги эффектов: покупки.
//
// Одна группа веток бывшего switch в FS_EFFECTS.apply(). Тело каждого шага
// перенесено дословно; изменилось только окружение: «движок эффектов» теперь
// приходит параметром effects, а общая рамка шага — объектом f (FSStepContext).

class PurchaseSteps {
    static ops = ['buyUpgrade', 'buyAnyUpgrade', 'buyBastionNearby', 'strikePayPick'];

    static buyUpgrade(effects, f) {
        const { R, state, seat, step, answer, p, combat } = f;
        // The number of tokens to spend («Убийственное представление») is
        // the first answer: the step asks again, now about the card.
        if (step.payAssets && step.spendAssets === undefined) {
            const have = R.player(state, seat).assetCount(step.payAssets.kind || 'reinforcement');
            const n = Math.max(0, Math.min(have, Number(answer.choice) || 0));
            step.spendAssets = n;
            step.noAbilityQuestion = true;
            return { replace: [step] };
        }
        const card = answer.card;
        if (!card) return null;
        const off = effects.upgradeDiscount(R, state, seat, step);
        // The tokens of the discount are paid with the card, not before it.
        const payTokens = () => {
            if (!step.payAssets || !step.spendAssets) return;
            R.player(state, seat).payAsset(step.payAssets.kind || 'reinforcement', step.spendAssets);
            R.log(state, seat, state.players[seat].name + ' тратит ' + step.spendAssets + ' жетон(а) на скидку.');
        };
        if (step.kind === 'combat') {
            const c = FS_CATALOG.card('combat', p.faction, card);
            if (!c || (c.kl || 0) > R.commandLevel(state, seat)) return null;
            const price = c.upgrade ? Math.max(0, (c.cost || 0) - off) : 0;
            if (p.materiel < price) return null;
            const deck = FS_CARDS.combatDeck(R, state, seat);
            if (!deck.upgradePile().includes(c.name) || deck.count(c.name) >= 2) return null;
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
            payTokens();
            R.log(state, seat, state.players[seat].name + ' заменяет пару «' + remove
                + '» на боевое улучшение «' + c.name + '».');
            return null;
        }
        const c = FS_CATALOG.card('orders', p.faction, card);
        if (!c || (c.kl || 0) > R.commandLevel(state, seat)) return null;
        // The discount of the card covers the upgrades of the orders
        // too: «Купите одну карту улучшения приказа, уменьшив её
        // стоимость …» («Лингва Технис»).
        const price = Math.max(0, (c.cost || 0) - off);
        if (p.materiel < price) return null;
        if ((p.upgrades || []).some(u => u.name === c.name)) return null;
        const pile = p.decks && Array.isArray(p.decks.upgradeOrder) ? p.decks.upgradeOrder : null;
        if (pile && !pile.includes(c.name)) return null;
        R.player(state, seat).payMateriel(price);
        payTokens();
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
            if (!deck.upgradePile().includes(name) || deck.count(name) >= 2) return null;
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
        const pile = p2.decks.upgradeOrder;
        if (Array.isArray(pile) && !pile.includes(name)) return null;
        p2.upgrades.push({ name, used: false, order: card.order });
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
        const required = (pay.n || 1) * (pay.per === 'ship' ? (plan.ships || 1) : 1);
        const want = pay.upTo ? Math.max(0, Math.min(cap, i || 0)) : (i === 1 && cap >= required ? required : 0);
        const owner = ctx && ctx.owner !== undefined ? ctx.owner : seat;
        const player = state.players[owner];
        if (want > 0) {
            // A payment of any face is the player's choice: an attack die
            // sacrifices damage, while a defence die may be needed by a later
            // ability. Hold this question and the rolled pool across saves.
            const kind = pay.kind || 'att';
            const pool = plan.pool || [];
            let indices;
            if (kind === 'any') {
                if (!Array.isArray(answer.dice)) {
                    return { question: {
                        kind: 'dice', who: owner, op: 'strikePayPick', diceSource: 'strike',
                        n: want, required: true,
                        options: pool.map((face, slot) => face == null ? -1 : slot).filter(slot => slot >= 0),
                        text: 'Какие кубики удара потратить?',
                    } };
                }
                indices = answer.dice.slice().sort((a, b) => b - a);
            } else {
                indices = [];
                for (let slot = 0; slot < pool.length && indices.length < want; slot++) {
                    if (pool[slot] === kind) indices.push(slot);
                }
                indices.reverse();
            }
            if (indices.length !== want) return null;
            for (const at of indices) {
                if (pool[at] === 'att') plan.hits = Math.max(0, plan.hits - 1);
                pool.splice(at, 1);
            }
            plan.paid[index] = want;
            if (state.order) StrikePlan.of(state.order).setPaid(want);
            R.log(state, owner, player.name + ' тратит ' + want + ' '
                + (want === 1 ? 'кубик' : 'кубика') + ' удара.');
        }
        if (want <= 0) return null;
        const reward = pay.reward || {};
        if (reward.moveShips) {
            // «Обстрел»: the roll is already fixed. The player may move any
            // of his ships from the active system before assigning the damage.
            return { replace: [{ op: 'moveUnits', n: 0, all: true, pick: true,
                unitType: 'ship', ofSystem: 'active', dest: 'strikeNeighborVoid',
                strict: true, who: 'me' }] };
        }
        if (reward.moveShipActive) {
            // «Затмевающий спуск»: one ship of the active system goes to
            // another void of the same system — a new battle may follow.
            return { replace: [{ op: 'moveUnits', n: 1, pick: true,
                unitType: 'ship', ofSystem: 'active', dest: 'otherVoidActive', who: 'me' }] };
        }
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
        if (reward.worldAsset) {
            // «можете потратить 1 `morale cube`, чтобы получить ценный ресурс
            // этого мира» («Неотвратимые раскопки»): the asset tokens printed
            // on the world of the strike, without its materiel.
            return { replace: [{ op: 'gainWorldAssets', assetsOnly: true, noAbilityQuestion: true,
                world: { system: plan.system, pos: plan.pos }, who: 'me' }] };
        }
        return null;
    }
}
