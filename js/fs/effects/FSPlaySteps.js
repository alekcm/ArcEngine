// FSPlaySteps.js — шаги эффектов: карты.
//
// Одна группа веток бывшего switch в FS_EFFECTS.apply(). Тело каждого шага
// перенесено дословно; изменилось только окружение: «движок эффектов» теперь
// приходит параметром effects, а общая рамка шага — объектом f (FSStepContext).

class PlaySteps {
    static ops = ['playEvent', 'playCard', 'playAnyCard', 'activateEvents', 'chooseEventAbility', 'discardFoeCard', 'discardHand', 'drawCombatCards'];

    static playEvent(effects, f) {
        const { R, state, seat, step, answer, p, other } = f;
        const name = answer.card;
        const hand = p.eventHand || [];
        if (!name || !hand.includes(name)) return null;
        // The other drawn cards are held until the chosen effect is finished;
        // afterwards they return to the deck, but not while it is drawing cards.
        const others = hand.filter(other => other !== name);
        for (const other of others) R.holdEventCard(state, seat, other);
        p.eventHand = [];
        const card = FS_CATALOG.card('events', p.faction, name);
        if (!card) return null;
        R.log(state, seat, state.players[seat].name + ' разыграл карту события «' + name + '».');
        const returns = others.map(other => ({ op: 'returnActivatedEvent', name: other }));
        if (card.type === 'scheme') {
            R.keepEventScheme(state, seat, card);
            return { replace: returns };
        }
        // A tactic returns only after its questions and effects have resolved.
        const steps = FS_EFFECTS.parse(card.text || '', { kind: 'event', faction: p.faction });
        return { replace: steps.concat([{ op: 'returnActivatedEvent', name }], returns) };
    }

    static playCard(effects, f) {
        const { R, state, seat, step, answer, p, combat, inCombat, side } = f;
        const name = answer.card;
        if (!name || !inCombat) return null;
        const hand = R.player(state, seat).combatHand;
        if (hand.take(name) === null) return null;
        const card = FS_CATALOG.card('combat', p.faction, name);
        if (step.staged) {
            CombatCards.of(combat).stage(side, { name, card, seat });
            R.log(state, seat, p.name + ' играет новую боевую карту «' + name + '».');
        } else {
            // «получите её боевые значки до конца этого раунда битвы»
            // («Бесспорная мудрость»): the icons are forgotten with the round;
            // «до конца этой битвы» («Крылатый удар») is the usual card in play.
            const entry = { name, card, valuesOnly: true };
            if (step.thisRound) entry.untilRound = CombatTurn.of(combat).round;
            CombatCards.of(combat).put(side, entry);
        }
        step.done = true;
        return null;
    }

    static playAnyCard(effects, f) {
        const { R, state, seat, step, answer, p, combat, inCombat, side, other } = f;
        const name = answer.card;
        if (!name || !inCombat) return null;
        const deck = R.player(state, seat).combatDeck.cards();
        const i = deck.indexOf(name);
        if (i < 0) return null;
        // «сыграть любую карту из своей боевой колоды или колоды
        // улучшений, кроме карты, которая уже была разыграна»
        // («Тактический гений»): the card comes to the hand and is played
        // in this round like any other card of it.
        deck.splice(i, 1);
        R.player(state, seat).combatHand.put(name);
        R.log(state, seat, p.name + ' берёт из колоды карту «' + name + '».');
        step.done = true;
        return null;
    }

    static activateEvents(effects, f) {
        return CardAsks.activateEvents(effects, f);
    }

    static chooseEventAbility(effects, f) {
        const { R, state, seat, answer, p, other } = f;
        const name = answer.card;
        const hand = p.eventHand || [];
        if (!name || !hand.includes(name)) return null;
        // Resolve the chosen ability, then discard the others as printed.
        // No icon on a newly revealed card moves a second Warp Storm.
        StormPhase.of(state).suppressIcons();
        const others = hand.filter(other => other !== name);
        for (const other of others) R.holdEventCard(state, seat, other);
        p.eventHand = [];
        const card = FS_CATALOG.card('events', p.faction, name);
        if (!card) return null;
        EventPhase.of(state).setCard(card);
        const steps = FS_EFFECTS.parse(card.text || '', { kind: 'event', faction: p.faction });
        const returns = others.map(other => ({ op: 'returnActivatedEvent', name: other }));
        if (card.type === 'scheme') {
            R.keepEventScheme(state, seat, card);
            return { replace: returns };
        }
        return { replace: steps.concat([{ op: 'returnActivatedEvent', name }], returns) };
    }

    static discardFoeCard(effects, f) {
        const { R, state, seat, answer, combat, side } = f;
        const s2 = CombatSides.foe(side);
        const played = CombatCards.of(combat).played(s2);
        const name = answer.card;
        const at = played.findIndex(c2 => c2.card && c2.card.name === name);
        if (at < 0) return null;
        const card = played.splice(at, 1)[0];
        R.player(state, effects.seatOf(combat, s2)).combatDeck.add(card.card.name);
        R.log(state, seat, state.players[seat].name + ': карта противника «' + name + '» сброшена.');
        return null;
    }

    static discardHand(effects, f) {
        const { R, state, seat, step, answer, combat } = f;
        const hand = combat ? R.player(state, seat).combatHand : null;
        if (!hand) return null;
        const names = answer.cards && answer.cards.length ? answer.cards
            : (answer.card ? [answer.card] : []);
        for (const name of names) {
            if (!hand.discard(name)) continue;
            R.log(state, seat, state.players[seat].name + ' сбрасывает боевую карту «' + name + '».');
            // «Сбросьте карту, чтобы отступить 1 вашим юнитом»: the «чтобы»
            // of the step follows a real discard.
            step.done = true;
            // «Если эта карта была сброшена …» («Святая троица»).
            effects.cardDiscarded(R, state, seat, name, f.ctx);
        }
        return null;
    }

    static drawCombatCards(effects, f) {
        const { R, state, seat, step, answer, p, combat, side } = f;
        const hand = combat ? R.player(state, seat).combatHand : null;
        if (!hand) return null;
        const names = answer.cards && answer.cards.length ? answer.cards
            : (answer.card ? [answer.card] : []);
        for (const name of names) {
            if (!hand.discard(name)) continue;
            if (step.discardLeft !== undefined) step.discardLeft -= 1;
            R.log(state, seat, state.players[seat].name + ' сбрасывает боевую карту «' + name + '».');
            effects.cardDiscarded(R, state, seat, name, f.ctx);
            break;
        }
        if (step.discardLeft > 0 && hand.size()) {
            return { question: { kind: 'cards', who: seat, op: 'discardHand', n: 1, options: hand.cards().slice(), text: 'Какую карту сбросить (осталось ' + step.discardLeft + ')?' } };
        }
        step.discardLeft = 0;
        return null;
    }
}
