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
        // The other cards go back to the deck.
        for (const other of hand) if (other !== name) p.decks.event.push(other);
        p.eventHand = [];
        const card = FS_CATALOG.card('events', p.faction, name);
        if (!card) return null;
        R.log(state, seat, state.players[seat].name + ' разыграл карту события «' + name + '».');
        if (card.type === 'scheme') {
            const steps = FS_EFFECTS.parse(card.text || '', { kind: 'event', faction: p.faction });
            const trig = steps.find(x => x && x.op === 'trigger');
            const keep = /не больше 2/i.test(card.text || '')
                ? (p.schemes || []).slice(0, 1) : [];
            p.schemes = keep.concat([{
                name: card.name, text: card.text || '',
                trigger: trig ? trig.trigger : null,
                steps: trig ? trig.steps : [],
                note: trig ? !!trig.note : true, defer: trig ? !!trig.defer : false,
                orderType: trig ? trig.orderType || null : null,
                insteadOfOrder: trig ? !!trig.insteadOfOrder : false,
            }]);
            R.log(state, seat, p.name + ' держит план «' + card.name + '».');
            step.done = true;
            return null;
        }
        // A tactic card is resolved, not kept: it goes back to the
        // event deck like every other drawn card. A scheme card stays
        // in play and is handled above.
        p.decks.event.push(name);
        const steps = FS_EFFECTS.parse(card.text || '', { kind: 'event', faction: p.faction });
        return { replace: steps };
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
            CombatCards.of(combat).put(side, { name, card, valuesOnly: true });
        }
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
        const { R, state, seat, step, p } = f;
        // «взять две верхних карты из колоды событий и активировать их
        // способности» («Некромеханика»): both cards are taken from the
        // top of the deck and both abilities happen, one after another.
        const steps = [];
        for (let i = 0; i < (step.n || 1); i++) {
            const name = R.drawEventCard(state, seat);
            if (!name) break;
            const card = FS_CATALOG.cardNamed('events', name);
            R.log(state, seat, state.players[seat].name + ' активирует карту события «' + name + '».');
            if (card) steps.push(...FS_EFFECTS.parse(card.text || '', { kind: 'event', faction: p.faction }));
        }
        return steps.length ? { replace: steps } : null;
    }

    static chooseEventAbility(effects, f) {
        const { R, state, seat, answer, p, other } = f;
        const name = answer.card;
        const hand = p.eventHand || [];
        if (!name || !hand.includes(name)) return null;
        // The two other cards are discarded. No icon on a newly revealed
        // card moves a Warp Storm: the storm icon of THIS tactic was the
        // only one to resolve (06-events.md, «Инкарнация Тзинча»).
        StormPhase.of(state).suppressIcons();
        for (const other of hand) if (other !== name) p.decks.event.push(other);
        p.eventHand = [];
        const card = FS_CATALOG.card('events', p.faction, name);
        if (!card) return null;
        EventPhase.of(state).setCard(card);
        const steps = FS_EFFECTS.parse(card.text || '', { kind: 'event', faction: p.faction });
        if (card.type === 'scheme') {
            const trig = steps.find(x => x && x.op === 'trigger');
            // A scheme replaces the other plans; Tau's «не больше 2»
            // keeps one of them. Here the card is chosen from the deck,
            // so its own text decides.
            const keep = /не больше 2/i.test(card.text || '')
                ? (p.schemes || []).slice(0, 1) : [];
            p.schemes = keep.concat([{
                name: card.name, text: card.text || '',
                trigger: trig ? trig.trigger : null,
                steps: trig ? trig.steps : [],
                note: trig ? !!trig.note : true,
                defer: trig ? !!trig.defer : false,
                orderType: trig ? trig.orderType || null : null,
                insteadOfOrder: trig ? !!trig.insteadOfOrder : false,
            }]);
            R.log(state, seat, p.name + ' держит план «' + card.name + '».');
            return null;
        }
        p.decks.event.push(name);
        return { replace: steps };
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
        const { R, state, seat, answer, p, combat, side } = f;
        const hand = combat ? R.player(state, seat).combatHand : null;
        if (!hand) return null;
        const names = answer.cards && answer.cards.length ? answer.cards
            : (answer.card ? [answer.card] : []);
        for (const name of names) {
            if (!hand.discard(name)) continue;
            R.log(state, seat, state.players[seat].name + ' сбрасывает боевую карту «' + name + '».');
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
            break;
        }
        if (step.discardLeft > 0 && hand.size()) {
            return { question: { kind: 'cards', who: seat, op: 'discardHand', n: 1, options: hand.cards().slice(), text: 'Какую карту сбросить (осталось ' + step.discardLeft + ')?' } };
        }
        step.discardLeft = 0;
        return null;
    }
}
