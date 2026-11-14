// FSCardAsks.js — вопросы шага: карты.
//
// Одна группа веток бывшего switch в FS_EFFECTS.step(), который решает,
// ЧТО шаг спросит у игрока. Тело каждого шага перенесено дословно;
// окружение — параметр effects и рамка шага f (FSStepContext).

class CardAsks {
    static ops = ['playCard', 'playAnyCard', 'playEvent', 'playTopCard', 'drawCombatCards', 'discardCard', 'discardFoeCard', 'discardFoeTop', 'discardFoeStaged', 'peekFoeCard', 'repeatCard', 'activateEvents', 'activateDrawnEvent', 'returnActivatedEvent', 'drawEvents', 'chooseEventAbility', 'lookEvents', 'sequence', 'choice', 'chooseFoe', 'chooseWorld', 'chooseSystem', 'foeAllow', 'require', 'note', 'scheme', 'trigger', 'preAdvance', 'limitedOrder', 'guardDeploy', 'once', 'icons', 'onDiscard', 'discardHand'];

    // «сбросьте 1 карту из вашей руки» («Фанатичное рвение», «Луизианское
    // гостеприимство»): the owner names the card; its «чтобы» follows the
    // discard (`then`), nothing happens with an empty hand.
    static discardHand(effects, f) {
        const { R, state, seat, step, inCombat } = f;
        const hand = inCombat ? R.player(state, seat).combatHand : null;
        if (!hand || !hand.size()) return null;
        return { question: { kind: 'cards', who: seat, op: 'discardHand', n: step.n || 1,
            options: hand.cards().slice(), text: 'Какую карту сбросить?' } };
    }

    // «Если эта карта была сброшена, то получите 2 `att. token`» («Святая
    // троица»): a card that is PLAYED was not discarded — the line is silent.
    // The discard of the card from the hand performs it (cardDiscarded).
    static onDiscard() {
        return null;
    }

    static playCard(effects, f) {
        const { R, state, seat, inCombat } = f;
        const hand = inCombat ? R.player(state, seat).combatHand : null;
        if (!hand || !hand.size()) return null;
        return { question: { kind: 'cards', who: seat, op: 'playCard', options: hand.cards().slice(), text: 'Какую карту разыграть?' } };
    }

    static playAnyCard(effects, f) {
        const { R, state, seat, combat, inCombat, side } = f;
        if (!inCombat) return null;
        const played = CombatCards.of(combat).names(side);
        const seen = [];
        const list = [];
        for (const n of R.player(state, seat).combatDeck.cards()) {
            if (played.includes(n) || seen.includes(n)) continue;
            seen.push(n);
            list.push(n);
        }
        if (!list.length) return null;
        return { question: { kind: 'cards', who: seat, op: 'playAnyCard', options: list, text: 'Какую карту сыграть из колоды?' } };
    }

    static playEvent(effects, f) {
        const { seat, p } = f;
        const hand = p.eventHand || [];
        if (!hand.length) return null;
        return { question: { kind: 'cards', who: seat, op: 'playEvent', options: hand.slice(), text: 'Какую карту события разыграть?' } };
    }

    static playTopCard(effects, f) {
        const { R, state, seat, step, combat, inCombat, side, p } = f;
        if (!inCombat) return null;
        const deck = R.player(state, seat).combatDeck;
        if (!deck.size()) return null;
        const name = deck.draw();
        const card = FS_CATALOG.card('combat', p.faction, name);
        CombatCards.of(combat).put(side, { name, card, side, valuesOnly: true }, CombatTurn.of(combat).round);
        R.log(state, seat, p.name + ' достаёт верхнюю карту колоды: «' + name + '» — только её боевые значения.');
        step.done = true;
        return null;
    }

    static drawCombatCards(effects, f) {
        const { R, state, seat, step, inCombat, p } = f;
        if (!inCombat) return null;
        const hand = R.player(state, seat).combatHand;
        const deck = R.player(state, seat).combatDeck;
        let drawn = 0;
        for (let i = 0; i < (step.n || 1); i++) {
            const name = deck.draw();
            if (!name) break;
            hand.put(name);
            drawn++;
        }
        if (!drawn) return null;
        R.log(state, seat, p.name + ' берёт дополнительные боевые карты: ' + drawn + '.');
        step.done = true;
        if (step.discard === 0) return null;
        const drop = Math.min(step.discard || drawn, hand.size());
        if (!drop) return null;
        step.discardLeft = drop;
        return { question: { kind: 'cards', who: seat, op: 'discardHand', n: 1, options: hand.cards().slice(), text: 'Какую карту сбросить (осталось ' + drop + ')?' } };
    }

    static discardCard(effects, f) {
        const { R, state, seat, combat, inCombat, side, target } = f;
        if (!inCombat) return null;
        const s2 = target === seat ? side : (CombatSides.foe(side));
        const hand = R.player(state, CombatSides.seatOf(combat, s2)).combatHand;
        if (!hand.size()) return null;
        // «… должен сбросить с руки 1 случайную боевую карту»: the card is random
        // because the printed text says so, not because the engine is shy of
        // asking. A card of the player's own choice is asked, never rolled.
        const name = hand.takeAt(R.rand(state, hand.size()));
        hand.deck.add(name);
        const loser = CombatSides.seatOf(combat, s2);
        R.log(state, loser, 'Сброшена боевая карта «' + name + '».');
        // «Если эта карта была сброшена …» («Святая троица»): the owner of
        // the hand is paid by the card he has just lost.
        effects.cardDiscarded(R, state, loser, name, f.ctx);
        return null;
    }

    static discardFoeCard(effects, f) {
        const { combat, inCombat, side } = f;
        if (!inCombat) return null;
        const s2 = CombatSides.foe(side);
        const options = CombatCards.of(combat).played(s2)
            .map(c2 => c2.card && c2.card.name).filter(Boolean);
        // The cards of a round are turned over together: the card the
        // opponent laid for this round is face up too when the first card
        // resolves («Прорвать фронт», «Дночерпатель») — it may be the one
        // discarded, and then neither its icons nor its abilities count.
        const staged = CombatCards.of(combat).staged(s2);
        if (staged && staged.name && !options.includes(staged.name)) options.push(staged.name);
        if (!options.length) return null;
        return { question: { kind: 'cards', who: f.step.picker === 'me' ? f.seat : effects.seatOf(combat, s2), op: 'discardFoeCard', options, text: 'Какую карту сбросить?' } };
    }

    static discardFoeTop(effects, f) {
        const { R, state, seat, step, combat, inCombat, side, p } = f;
        if (!inCombat) return null;
        const s2 = CombatSides.foe(side);
        const seat2 = effects.seatOf(combat, s2);
        const deck = R.player(state, seat2).combatDeck;
        if (!deck.size()) return null;
        const name = deck.draw();
        // The card is out of this battle only: it returns to the deck of its
        // owner when the battle ends (the clean-up of the combat).
        CombatCards.of(combat).discard(s2, name);
        R.log(state, seat, p.name + ': противник сбрасывает верхнюю карту боевой колоды — «' + name + '».');
        // «Вы получаете боевые значки с этой карты до конца этого раунда» («Мек
        // бойз»): the icons of the discarded card count for the owner of the
        // ability, its text does not — and only until the round is over.
        if (step.gainIcons) {
            const card = FS_CATALOG.card('combat', state.players[seat2].faction, name);
            if (card) {
                const entry = { name, card, valuesOnly: true, borrowed: true };
                if (step.thisRound) entry.untilRound = CombatTurn.of(combat).round;
                CombatCards.of(combat).put(side, entry, CombatTurn.of(combat).round);
                const icons = card.icons || {};
                R.log(state, seat, p.name + ' получает боевые значки карты «' + name + '» до конца раунда: атака '
                    + (icons.att || 0) + ', оборона ' + (icons.def || 0) + ', боевой дух ' + (icons.morale || 0) + '.');
            }
        }
        return null;
    }

    static discardFoeStaged(effects, f) {
        const { R, state, seat, step, combat, inCombat, side, p } = f;
        if (!inCombat) return null;
        const foeSide = CombatSides.foe(side);
        const staged = CombatCards.of(combat).staged(foeSide);
        if (!staged) return null;
        CombatCards.of(combat).unstage(foeSide);
        const foeSeat = effects.seatOf(combat, foeSide);
        R.player(state, foeSeat).combatHand.setChosen(null);
        R.player(state, foeSeat).combatDeck.add(staged.name);
        R.log(state, seat, p.name + ': карта противника «' + staged.name + '» сброшена.');
        step.done = true;
        return null;
    }

    static peekFoeCard(effects, f) {
        const { R, state, seat, step, combat, inCombat, side } = f;
        // «Если вы — атакующий, подсмотрите карту оппонента»
        // («Скитарии-инфильтраторы»): the card the opponent laid for this
        // round is turned face up for the player of the card only.
        if (!inCombat) return null;
        if (step.onlyAttacker && side !== 'attacker') {
            R.log(state, seat, 'Карта действует только на атакующего: подсмотреть карту нельзя.');
            return null;
        }
        const foeSide = CombatSides.foe(side);
        const staged = CombatCards.of(combat).staged(foeSide);
        const name = (staged && staged.name) || CombatCards.of(combat).chosen(foeSide) || null;
        if (!name) {
            R.log(state, seat, 'Противник ещё не выбрал карту — подсматривать нечего.');
            return null;
        }
        CombatCards.of(combat).peek(foeSide, seat, name);
        // The log is broadcast to every seat; only the peeking player's combat
        // view may name a card that is still face down.
        R.log(state, seat, state.players[seat].name + ' подсмотрел закрытую карту противника.');
        return null;
    }

    static repeatCard(effects, f) {
        const { R, state, seat, step, combat, inCombat, side, p } = f;
        // «Повторите основную способность карты, разыгранной в
        // предыдущем раунде боя» («Почитание духа машины») and
        // «активируйте способность подразделения с карты, разыгранной в
        // предыдущем раунде боя» («Жизнеотсос»): the box of the card the
        // player resolved one round ago is read again — with the
        // requisites of the unit ability checked anew.
        if (!inCombat) return null;
        const entry = CombatCards.of(combat).played(side)
            .find(x => (x.round || 0) === CombatTurn.of(combat).round - 1);
        const card = entry && entry.card;
        if (!card) {
            R.log(state, seat, 'В предыдущем раунде боя карта не разыгрывалась — повторять нечего.');
            return null;
        }
        const text = step.box === 'unit' ? (card.unit || '') : (card.general || '');
        if (!text || /^\s*\*\(/.test(text)) {
            R.log(state, seat, 'У карты «' + card.name + '» нет такой способности.');
            return null;
        }
        const ctx2 = { kind: 'combat', faction: p.faction };
        if (step.box === 'unit') {
            const reqs = card.reqs || [];
            const standing = state.units.filter(u => u.seat === seat && !u.routed
                && BattleField.of(combat).holds(u));
            const there = effects.meetsRequisite(card,
                standing.map(u => (R.unitOf(state, u) || {}).name).filter(Boolean), ctx2);
            if (!there) {
                R.log(state, seat, 'Отряда для способности карты «' + card.name + '» в бою нет.');
                return null;
            }
            ctx2.reqs = reqs;
            ctx2.present = standing.map(u => (R.unitOf(state, u) || {}).name).filter(Boolean);
        }
        const steps = effects.parse(text, ctx2);
        R.log(state, seat, state.players[seat].name + ' повторяет способность карты «' + card.name + '».');
        if (!steps.length) return null;
        // The steps of the repeated ability are performed right after
        // this one, as a part of the same card.
        step.then = steps;
        step.done = true;
        return null;
    }

    static activateEvents(effects, f) {
        const { R, state, seat, step } = f;
        // Both cards are drawn before either resolves; held cards cannot be
        // drawn again if the deck must be reshuffled between the two draws.
        const names = [];
        for (let i = 0; i < (step.n || 1); i++) {
            const name = R.drawEventCard(state, seat);
            if (!name) break;
            names.push(name);
        }
        step.done = true;
        return names.length ? { replace: names.map(name => ({ op: 'activateDrawnEvent', name })) } : null;
    }

    static activateDrawnEvent(effects, f) {
        const { R, state, seat, step, p } = f;
        const card = FS_CATALOG.card('events', p.faction, step.name);
        if (!card) return null;
        R.log(state, seat, p.name + ' активирует карту события «' + card.name + '».');
        if (card.type === 'scheme') {
            R.keepEventScheme(state, seat, card);
            return null;
        }
        const steps = effects.parse(card.text || '', { kind: 'event', faction: p.faction });
        return { replace: steps.concat([{ op: 'returnActivatedEvent', name: card.name }]) };
    }

    static returnActivatedEvent(effects, f) {
        const { R, state, seat, step } = f;
        R.returnActivatedEvent(state, seat, step.name);
        return null;
    }

    static drawEvents(effects, f) {
        const { R, state, seat, step, p } = f;
        p.eventHand = p.eventHand || [];
        for (let i = 0; i < (step.n || 1); i++) {
            const name = R.drawEventCard(state, seat);
            if (!name) break;
            p.eventHand = p.eventHand || [];
            p.eventHand.push(name);
        }
        R.log(state, seat, state.players[seat].name + ' берёт карты событий: ' + p.eventHand.join(', ') + '.');
        return null;
    }

    static chooseEventAbility(effects, f) {
        const { seat, p } = f;
        const hand = p.eventHand || [];
        if (!hand.length) return null;
        return { question: { kind: 'cards', who: seat, op: 'chooseEventAbility',
            options: hand.slice(), text: 'Способность какой карты использовать?' } };
    }

    static lookEvents(effects, f) {
        const { R, state, seat, step, p } = f;
        // The deck is built when it is first touched: a look at its top cards
        // touches it.
        R.initializeEventDeck(state, seat);
        const names = p.decks.event.slice(0, step.n || 3);
        if (!names.length) return null;
        return { question: { kind: 'cards', who: seat, op: 'lookEvents', options: names, text: 'Какую карту оставить наверху?' } };
    }

    static sequence(effects, f) {
        const { step } = f;
        // The steps of the step: the answer flow replaces the list with it.
        return { replace: step.steps || [] };
    }

    static choice(effects, f) {
        const { R, state, seat, step, foe } = f;
        // «За каждый `morale cube` получите `att. token` или `def. token`»
        // («Скауты ветераны»): without a single cube there is nothing to
        // choose the kind of — the question is not asked.
        if (step.per && step.per !== 'pair') {
            const total = effects.count(R, state, seat,
                { n: 1, per: step.per, perKind: step.perKind, max: step.max, filter: step.filter, inBattle: step.inBattle }, f.ctx);
            if (total <= 0) return null;
        }
        // «Багровая стража»: do not offer a paid pair without both models,
        // or suppress the free single model when it is still available. Keep
        // the filtered list on the step so its indices survive JSON transport.
        if ((step.options || []).some(option => effects.fullSupplyPlacement(option))) {
            step.options = step.options.filter(option => effects.canOfferPlacement(R, state, seat, option));
            if (!step.options.length) return null;
        }
        // «Выберите одну из способностей: *Бастион:* … — или — *Сестра
        // Репентия/…:* …» («Разрушительный рефрен»): a branch of a requisite
        // line is offered only while one of its units stands in the battle;
        // a lone remaining branch is simply performed.
        if ((step.options || []).some(option => option && Array.isArray(option.reqNames))) {
            step.options = step.options.filter(option => !option || !Array.isArray(option.reqNames)
                || effects.condSatisfied(R, state, seat, { reqNames: option.reqNames }, f.ctx));
            if (!step.options.length) return null;
            if (step.options.length === 1) return { replace: [step.options[0]] };
        }
        // «Либо бесплатно разместите 1 ваш отряд космодесанта в дружественном
        // мире, где есть любая ваша постройка, либо … 1 отряд скаутов в любом
        // дружественном мире» («Героическая атака», «Защита Императора»): a
        // branch that has nowhere to stand — or nothing in the supply — is
        // not offered; a lone remaining branch is simply performed.
        if (step.placeable && (step.options || []).length) {
            const possible = step.options.filter(option => effects.canOfferBranch(R, state, seat, option));
            if (possible.length !== step.options.length) {
                step.options = possible;
                if (!step.options.length) {
                    R.log(state, seat, state.players[seat].name + ': ни одну из ветвей карты выполнить нельзя.');
                    return null;
                }
                if (step.options.length === 1) return { replace: [step.options[0]] };
            }
        }
        // «либо потратить 1 жетон подкрепления, чтобы …, либо …» («Воплощённая
        // злоба», «Поддержка чёрного сердца»): a branch that opens with a price
        // the player cannot pay is not offered; a lone remaining branch is
        // simply performed.
        if ((step.who === undefined || step.who === 'me') && (step.options || []).some(option => effects.optionPrice(option))) {
            const payable = step.options.filter(option => effects.canPayOption(R, state, seat, option));
            if (payable.length !== step.options.length) {
                step.options = payable;
                if (!step.options.length) return null;
                if (step.options.length === 1) return { replace: [step.options[0]] };
            }
        }
        // «Ваш противник выполняет 3 раза: либо …, либо …» («Подавляющее
        // присутствие»): the alternatives belong to the opponent, so he
        // is the one who is asked.
        const asker = step.chooser !== 'me' && step.who === 'foe' && foe !== null ? foe : seat;
        return { question: { kind: 'choice', who: asker, op: 'choice', options: step.options, text: step.text } };
    }

    static chooseFoe(effects, f) {
        const { state, seat, p } = f;
        const foes = state.players.filter(p => p.seat !== seat).map(p => p.seat);
        if (!foes.length) return null;
        return { question: { kind: 'foes', who: seat, op: 'chooseFoe', options: foes, text: 'Выберите противника.' } };
    }

    static chooseWorld(effects, f) {
        const { R, state, seat } = f;
        const worlds = effects.friendlyWorlds(R, state, seat);
        if (!worlds.length) return null;
        return { question: { kind: 'areas', who: seat, op: 'chooseWorld', options: worlds, text: 'Выберите дружественный мир.' } };
    }

    static chooseSystem(effects, f) {
        const { state, seat } = f;
        const list = state.systems.map(sys => sys.id);
        if (!list.length) return null;
        return { question: { kind: 'systems', who: seat, op: 'chooseSystem', options: list, text: 'Выберите систему.' } };
    }

    static foeAllow(effects, f) {
        const { R, state, seat, step, combat, inCombat, foe } = f;
        // An impossible agreement is equivalent to not doing the action; it
        // cannot prevent the other branch without paying the promised cost.
        if (effects.foeAllowHasTarget(R, state, seat, step, combat, inCombat) === false) {
            return { replace: JSON.parse(JSON.stringify(step.no || [])) };
        }
        // «если противник позволяет» — the opponent says yes or no, and
        // the branch of his answer is performed by the card.
        const asker = foe !== null ? foe : seat;
        return {
            question: {
                kind: 'yesno', who: asker, op: 'foeAllow',
                text: 'Позволить: «' + String(step.text || '').slice(0, 70) + '»?',
            },
        };
    }

    static require(effects, f) {
        const { R, state, seat, step, p } = f;
        const active = state.order ? OrderContext.of(state.order).system : null;
        let ok = true;
        if (step.what === 'materiel') {
            ok = (p.materiel || 0) >= (step.n || 1);
        } else if (step.what === 'unitsOrStructures') {
            ok = !!(active && R.hasUnitsOrStructures(state, seat, active));
        } else if (step.what === 'unroutedShip') {
            ok = !!active && state.units.some(u => u.seat === seat && !u.routed && u.system === active
                && (R.unitOf(state, u) || {}).type === 'ship');
        } else if (step.what === 'friendlyOrUncontrolledWorld') {
            const sys = active ? R.system(state, active) : null;
            ok = !!sys && sys.areas.some(a => {
                if (!a.world) return false;
                const c = R.control(state, seat, active, a.pos);
                return c === 'friendly' || c === 'none';
            });
        } else if (step.what === 'upgrade') {
            // «Нужно быть главным по машинам» («Святой трубопровод»): the
            // upgrade the card names must be among the cards the player
            // has bought — without it the ability is not his to use. The
            // text names the card in another case («главным по машинам»
            // for «Главный по машинам»), so the words are compared by
            // their stems.
            const stems = t => String(t || '').toLowerCase().replace(/[^а-яёa-z\s]/g, ' ')
                .split(/\s+/).filter(Boolean).map(w => effects.stem(w)).join(' ');
            const want = stems(step.name);
            ok = !!want && (p.upgrades || []).some(u => stems(u.name) === want);
        }
        if (ok) return null;
        R.log(state, seat, 'Способность не может быть применена: не хватает условий.');
        // The prerequisite of an upgrade card («Нужно быть главным по
        // машинам») forbids the ability alone: the order the player is
        // executing goes on without it.
        if (step.what !== 'upgrade' && !step.orderOnly) {
            const tally = OrderTally.of(state.order);
            if (tally && tally.finishesAfterEffect) tally.finishAfterEffect();
            if (state.order && OrderContext.of(state.order).isSeat(seat)) R.finishOrder(state, seat);
        }
        return { stop: true };
    }

    static note(effects, f) {
        const { R, state, seat, step } = f;
        // The sentence says no rule of its own: the engine shows it to
        // the player as a clarification of the rules.
        if (step.text) R.log(state, seat, step.text);
        return null;
    }

    static scheme(effects, f) {
        const { state, seat } = f;
        // The card stays in play: the scheme waits for its moment.
        const schemes = state.players[seat].schemes || [];
        for (const s of schemes) {
            if (s && s.name && s.trigger) return null;
        }
        return null;
    }

    static trigger(effects, f) {
        // The scheme waits: it is used when its moment comes.
        return null;
    }

    static preAdvance(effects, f) {
        const { state, seat } = f;
        if (!state.order || !OrderContext.of(state.order).isKind('advance')) return null;
        return { question: {
            kind: 'yesno', who: seat, op: 'preAdvance',
            text: 'Выполнить дополнительный приказ продвижения одним отрядом?',
        } };
    }

    static limitedOrder(effects, f) {
        const { R, state, seat, step, p } = f;
        if (!state.order) return null;
        OrderContext.of(state.order).setNestedKind(step.kind);
        R.log(state, seat, p.name + ' готовит ограниченный приказ: '
            + (step.text || step.kind) + '.');
        step.done = true;
        return null;
    }

    static guardDeploy(effects, f) {
        const { R, state, seat } = f;
        const active = state.order ? OrderContext.of(state.order).system : null;
        const factories = active
            ? state.structures.filter(st => st.seat === seat && st.type === 'factory' && st.system === active)
            : [];
        if (!factories.length) {
            R.log(state, seat, 'Способность «Массовое Производство» не применена: в активной системе нет вашей фабрики.');
            return null;
        }
        const areas = factories.map(st => ({ system: st.system, pos: st.area }));
        if (areas.length > 1) {
            return { question: { kind: 'areas', answerKey: 'factory', stage: 'factory', who: seat, op: 'guardDeploy', options: areas, text: 'Какая фабрика производит отряды?' } };
        }
        return effects.startGuardDeploy(R, state, seat, areas[0]);
    }

    static once(effects, f) {
        const { R, state, seat, step } = f;
        // The sentence says no rule of its own: the engine shows it to
        // the player as a clarification of the rules.
        if (step.text) R.log(state, seat, step.text);
        return null;
    }

    static icons(effects, f) {
        const { R, state, step, combat, side, foe } = f;
        // The icons of a phrase that the rules did not read: the tokens
        // and the dice are taken as they are.
        for (const ic of step.icons || []) {
            const s2 = step.who === 'foe' ? (CombatSides.foe(side)) : side;
            if (!s2) continue;
            if (ic.kind === 'token') {
                const cubes = CombatCubes.of(combat);
                if (step.who === 'foe') cubes.take(s2, ic.icon, 1);
                else cubes.add(s2, ic.icon, 1);
            } else if (ic.kind === 'cube') {
                const turn = CombatTurn.of(combat);
                if (step.who === 'foe') turn.take(s2, turn.lastOf(s2));
                else turn.add(s2, ic.icon === 'any' ? R.rollDice(state, 1)[0] : ic.icon);
            }
        }
        return null;
    }
}
