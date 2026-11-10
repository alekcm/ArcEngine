// FSRulesCombat.js — the battle: the rounds, the cards, the dice, the damage,
// the reinforcements, the retreats and the trophies.

class CombatRules {
    /** @param {any} engine the rules facade (FSRules.js) */
    constructor(engine) {
        this.engine = engine;
    }

    combatValue(state, seat, systemId, pos) {
        let sum = 0;
        for (const u of this.engine.unitsAt(state, systemId, pos)) {
            if (u.seat !== seat || u.routed) continue;
            const def = this.engine.unitOf(state, u);
            if (def) sum += def.combat;
        }
        // A bastion fights with its printed values, as if it were a unit.
        for (const st of this.engine.structuresAt(state, systemId, pos)) {
            if (st.seat === seat && st.type === 'bastion') sum += this.engine.structureStats('bastion').combat;
        }
        return sum;
    }

    captureStructures(state, systemId, pos, winner, loser) {
        const taken = [];
        const p = state.players[winner];
        for (const st of this.engine.structuresAt(state, systemId, pos)) {
            if (st.seat !== loser) continue;
            // A structure without a free control token of the winner is destroyed
            // at once: the components are limited (the rules, "Component Limitations").
            if (this.engine.structureTokensLeft(state, winner) <= 0) {
                state.structures = state.structures.filter(x => x !== st);
                this.engine.log(state, winner, state.players[winner].name + ': жетона контроля нет, постройка уничтожена.');
                continue;
            }
            st.seat = winner;
            taken.push(st);
        }
        return taken;
    }

    startCombat(state, attacker, defender, systemId, pos) {
        // The defender without a single unrouted unit or bastion loses at once:
        // the preparation and the execution are skipped (the rules, "Combat").
        const ready = state.units.some(u => u.seat === defender && u.system === systemId && u.area === pos && !u.routed)
            || state.structures.some(x => x.seat === defender && x.system === systemId && x.area === pos && x.type === 'bastion');
        if (!ready) {
            this.engine.log(state, attacker, 'Защищать область некому: ' + state.players[attacker].name + ' побеждает сразу.');
            this.captureStructures(state, systemId, pos, attacker, defender);
            state.combat = null;
            if (state.testBattle) { this.engine.closeOrder(state); return null; }
            const order = state.order;
            if (order) PhasePlan.of(order).set('done');
            this.engine.finishOrder(state, attacker);
            return null;
        }
        const roll = seat => {
            const n = Math.min(this.combatValue(state, seat, systemId, pos), this.engine.DICE_MAX);
            return this.engine.rollDice(state, n);
        };
        // Where the attacking units came from: the retreats are judged by it,
        // and only the movement of this order counts.
        const origins = this.attackerOrigins(state, systemId, pos, attacker);
        const viaAdvance = !!(state.order && OrderContext.of(state.order).isKind('advance') && origins.length);
        const combat = {
            system: systemId,
            pos,
            attacker,
            defender,
            round: 1,
            step: 'reinforce-attacker',
            dice: { attacker: roll(attacker), defender: roll(defender) },
            tokens: { attacker: { att: 0, def: 0 }, defender: { att: 0, def: 0 } },
            cards: { attacker: { hand: [], played: [] }, defender: { hand: [], played: [] } },
            staged: { attacker: null, defender: null },
            reinforce: { attacker: 0, defender: 0 },
            reinforceRouted: { attacker: 0, defender: 0 },
            reinforceFlipped: { attacker: [], defender: [] },
            reinforceDestroyed: { attacker: [], defender: [] },
            damage: { attacker: 0, defender: 0 },
            winner: null,
        };
        // The battle is on the table before the deal: the hand of a player is the
        // hand of THIS battle. Where the attacker came from is kept with it.
        state.combat = combat;
        CombatApproach.of(combat).set(origins, viaAdvance);
        const turn = CombatTurn.of(combat);
        // Five combat cards for both players.
        for (const seat of [attacker, defender]) {
            const p = state.players[seat];
            const deck = this.engine.player(state, seat).combatDeck;
            if (!deck.size()) {
                // The basic deck: five cards, two copies of every card.
                const cards = FS_CATALOG.baseCombatCards(p.faction).map(c => c.name);
                for (const name of cards) deck.add(name, 2);
                deck.shuffle();
            }
            // The order may give more cards for the combat.
            const myOrder = this.engine.orderOf(state, seat);
            const extra = (myOrder && myOrder.extraCombatCards) || 0;
            // A short deck (a battle test with a few chosen cards) deals what it has.
            const hand = this.engine.player(state, seat).combatHand;
            for (let i = 0; i < FS_RULES_CONFIG.COMBAT_HAND + extra; i++) {
                const card = deck.draw();
                if (card) hand.put(card);
            }
        }
        // «… получить 1 `morale cube` в начале боя, вызванного этим приказом»
        // («Прикосновение варпа»): the advance belongs to the owner of the plan.
        const tally0 = OrderTally.of(state.order);
        if (tally0 && tally0.chaosCombatMorale
            && (OrderContext.of(state.order).isSeat(attacker) || OrderContext.of(state.order).isSeat(defender))) {
            const side = CombatSides.sideOf(combat, OrderContext.of(state.order).seat);
            const dice = tally0.takeChaosCombatMorale();
            for (let i = 0; i < dice; i++) {
                if (!turn.add(side, 'morale')) break;
            }
            const owner = OrderContext.of(state.order).seat;
            this.engine.log(state, owner, state.players[owner].name
                + ' получает кубик морали в начале боя.');
        }
        // «Если происходит бой, разыграйте только ОДИН раунд» («Мобилизированные
        // охотники»): the limit belongs to the combat this order starts.
        const fight = OrderFight.of(state.order);
        if (fight && fight.combatRounds && OrderContext.of(state.order).isSeat(attacker)) {
            turn.maxRounds = fight.combatRounds;
        }
        // The roster of the first round: the cards that pay for the losses of a
        // round read it («Выводок термаганов»).
        CombatPlans.of(combat).roster = this.rosterOfRound(state, combat);
        // «Разыграв этот приказ … вы можете разместить 1 бесплатный жетон
        // подкрепления в спорной области в начале шага призыва подкреплений»
        // («Бесчисленные»): the token the order promised stands in the area of
        // the combat its order has just started.
        const tally = OrderTally.of(state.order);
        const promised = state.order && OrderContext.of(state.order).isSeat(attacker) && tally ? tally.promisedReinforce : null;
        if (promised) {
            tally.takePromisedReinforce();
            this.engine.runEffects(state, attacker, [{
                op: 'placeReinforcement', n: promised.n || 1, free: promised.free,
                here: true, who: 'me', ability: 'Бесчисленные: жетон подкрепления в спорной области.',
            }], { kind: 'combat', ctx: { side: CombatSides.sideOf(combat, attacker) } });
        }
        this.engine.log(state, attacker, 'Бой в системе ' + this.engine.system(state, systemId).tile + ': '
            + state.players[attacker].name + ' против ' + state.players[defender].name + '.');
        // The schemes of the start of the combat; a scheme of «the start of a
        // round of combat» has its round 1 here as well as every next one.
        this.engine.maybeScheme(state, attacker, 'combat-start', { kind: 'combat', ctx: { side: 'attacker' } });
        if (!Question.of(state).waiting) {
            this.engine.maybeScheme(state, attacker, 'round', { kind: 'combat', ctx: { side: 'attacker' } });
        } else if (this.engine.schemesOf(state, attacker).some(x => x.trigger === 'round' && !x.defer)) {
            // Both questions at once are impossible: the round one waits for the
            // answer to the question of the start of the combat.
            CombatHooks.of(combat).roundQueued = true;
        }
        // The upgrade of the preparation step («Сервочерепа-стражи») asks its
        // question now — or waits for the scheme that is being answered.
        this.prepEffects(state, attacker);
    }

    prepEffects(state, seat) {
        const order = state.order;
        if (!order || !OrderContext.of(order).isSeat(seat) || !state.combat) return false;
        const fight = OrderFight.of(order);
        const prep = fight.prepReroll;
        const draw = fight.prepDrawCards;
        if (!prep && !draw) return false;
        if (Question.of(state).waiting) {
            // The scheme of the start of the combat is answered first; the
            // abilities of the order are asked as soon as the answer is in.
            CombatHooks.of(state.combat).prepQueued = true;
            return false;
        }
        const taken = fight.takePrep();
        const steps = [];
        if (draw) {
            steps.push({
                op: 'drawCombatCards', n: draw.n || 0, discard: draw.discard || 0, who: 'me',
                ability: 'Священные масла: дополнительные боевые карты этапа подготовки.',
            });
        }
        if (prep) {
            steps.push({
                op: 'rerollDie', n: prep.n || 1, kind: prep.kind || 'any', per: prep.per || null,
                inBattle: !!prep.inBattle, who: 'me', ability: prep.ability,
            });
        }
        this.engine.runEffects(state, seat, steps, { kind: 'combat', ctx: { side: CombatSides.sideOf(state.combat, seat) } });
        return true;
    }

    cmdCombat(state, seat, cmd) {
        const c = state.combat;
        if (!c) return { ok: false, error: 'Боя нет.' };
        const side = CombatSides.sideOf(c, seat);
        if (!side) return { ok: false, error: 'Вы не участвуете в бою.' };
        switch (cmd.action) {
            case 'reinforce': return this.combatReinforce(state, seat, side, cmd);
            case 'playCard': return this.combatPlayCard(state, seat, side, cmd);
            case 'damage': {
                // «Во время шага нанесения повреждений Вы назначаете урон
                // отрядам и бастионам противника» («Величие роя»): the damage of
                // the other side is placed by the owner of the card.
                const a = CombatHooks.of(c).assigner;
                const foeSide = CombatSides.foe(side);
                const step = CombatTurn.of(c);
                const foeStep = CombatSides.damageStep(foeSide);
                const myStep = CombatSides.damageStep(side);
                if (a && step.is(foeStep) && a.seat === seat) {
                    return this.combatDamage(state, seat, foeSide, cmd);
                }
                if (a && step.is(myStep) && a.seat !== seat) {
                    return { ok: false, error: 'Урон назначает владелец карты.' };
                }
                return this.combatDamage(state, seat, side, cmd);
            }
            case 'token': return this.combatToken(state, seat, side, cmd);
            case 'die': return this.combatDie(state, seat, side, cmd);
            case 'reroll': return this.combatReroll(state, seat, side, cmd);
            case 'skipCard': return this.combatSkipCard(state, seat, side);
            case 'retreat': return this.combatRetreat(state, seat, side, cmd);
            default: return { ok: false, error: 'Неизвестное действие боя.' };
        }
    }

    pieces(state, c, side) {
        const seat = CombatSides.seatOf(c, side);
        const field = BattleField.of(c);
        const units = field.units(state, seat);
        const bastions = field.bastions(state, seat);
        const t = this.tokenUnits(state, side);
        const flipped = this.reinforceFlipped(state, side);
        const dead = this.reinforceDestroyed(state, side);
        const tokens = [];
        for (let i = 0; i < t.used; i++) {
            // A destroyed token has left the board; the other slots keep their
            // ids, so a target picked before the first hit is still valid.
            if (dead.indexOf(i) >= 0) continue;
            tokens.push({ id: 'reinforce-' + side + '-' + i, kind: 'token', routed: flipped.indexOf(i) >= 0 });
        }
        return units.concat(bastions, tokens);
    }

    reinforceUnitDef(factionId, type) {
        const f = this.engine.factionById(factionId);
        if (!f) return null;
        return f.units.find(u => u.kl === 0 && u.type === (type || 'ground'))
            || f.units.find(u => u.kl === 0)
            || null;
    }

    reinforceFlipped(state, side) {
        const tokens = CombatTokens.of(state.combat);
        return tokens ? tokens.flipped(side) : [];
    }

    reinforceDestroyed(state, side) {
        const tokens = CombatTokens.of(state.combat);
        return tokens ? tokens.destroyed(side) : [];
    }

    reinforceTokenDef(state, side) {
        const c = state.combat;
        if (!c) return null;
        const seat = CombatSides.seatOf(c, side);
        const field = BattleField.of(c);
        const area = this.engine.area(this.engine.system(state, field.system), field.pos);
        return this.reinforceUnitDef(state.players[seat].faction, area && area.world ? 'ground' : 'ship');
    }

    reinforceTokenHealth(state, side, seat) {
        const c = state.combat;
        if (!c) return 1;
        const owner = CombatSides.seatOf(c, side);
        const actor = seat === undefined ? owner : seat;
        const def = this.reinforceTokenDef(state, side);
        return CombatDamage.of(c).health(owner, actor, def ? def.health : 1);
    }

    reinforceTokenIndex(state, side, id) {
        const tokens = CombatTokens.of(state.combat);
        return tokens ? tokens.indexOf(side, id) : -1;
    }

    routeReinforcementToken(state, side, index) {
        const tokens = CombatTokens.of(state.combat);
        return tokens ? tokens.route(side, index) : false;
    }

    destroyReinforcementToken(state, side, index, loss) {
        const tokens = CombatTokens.of(state.combat);
        if (!tokens || !tokens.destroy(side, index)) return false;
        // «за каждый уничтоженный отряд» counts a token as a unit too.
        const c = state.combat;
        if (loss) CombatPlans.of(c).addDestroyed(1);
        return true;
    }

    reinforceNoRoute(state, side) {
        const c = state.combat;
        if (!c) return false;
        const seat = CombatSides.seatOf(c, side);
        // A token is a command level zero unit: any ban of its side covers it.
        return CombatDamage.of(c).forbidsRoute(seat, 0, CombatTurn.of(c).round);
    }

    tokenUnits(state, side) {
        const tokens = CombatTokens.of(state.combat);
        return tokens ? tokens.units(side) : { used: 0, routed: 0, destroyed: 0, alive: 0 };
    }

    /**
     * «If a unit suffers damage and is not destroyed, that unit is routed.»
     * One place marks a unit as routed — and remembers the round of the combat
     * it fell in, which the cards that last «в этом раунде» read.
     * @param {any} state @param {any} unit @param {number} [round] of the combat
     */
    routeUnit(state, unit, round) {
        if (!unit) return false;
        unit.routed = true;
        const turn = CombatTurn.of(state.combat);
        const r = round !== undefined && round !== null
            ? round : (turn ? turn.round : 0);
        unit.routedRound = r || 0;
        return true;
    }

    /** «…восстановить отряд»: a unit stands up again — outside any round. */
    restoreUnit(state, unit) {
        if (!unit) return false;
        unit.routed = false;
        unit.routedRound = 0;
        return true;
    }

    canTakeDamage(state, c, side) {
        const items = this.pieces(state, c, side);
        if (CombatDamage.of(c).ownRoutedAllowed(side, CombatTurn.of(c).round)) return items;
        const ready = items.filter(x => x.type ? x.type === 'bastion' : !x.routed);
        return ready.length ? ready : items;
    }

    attackerOrigins(state, systemId, pos, seat) {
        const out = [];
        const push = ref => {
            if (!ref) return;
            if (!out.some(x => x.system === ref.system && x.pos === ref.pos)) out.push({ system: ref.system, pos: ref.pos });
        };
        const march = state.order ? MarchPlan.of(state.order) : null;
        for (const step of (march ? march.steps : [])) {
            for (const m of step) {
                // A step of the march knows the area it contested: only the
                // troops that walked into this very area count here.
                const dest = m.contested || march.contested || '';
                const [sid, areaPos] = dest.split(':');
                if (sid !== systemId || areaPos !== pos) continue;
                push({ system: m.fromSystem, pos: m.fromArea });
            }
        }
        for (const m of (state.moves || [])) {
            if (m.seat !== seat) continue;
            if (m.to.system !== systemId || m.to.pos !== pos) continue;
            push(m.from);
        }
        return out;
    }

    tokenMorale(state, side) {
        const c = state.combat;
        if (!c) return 0;
        const seat = CombatSides.seatOf(c, side);
        const field = BattleField.of(c);
        const area = this.engine.area(this.engine.system(state, field.system), field.pos);
        const type = area && area.world ? 'ground' : 'ship';
        const def = this.reinforceUnitDef(state.players[seat].faction, type);
        return this.tokenUnits(state, side).alive * (def ? def.morale : 0);
    }

    maxReinforce(state, seat, side) {
        const c = state.combat;
        const units = BattleField.of(c).units(state, seat);
        return Math.min(units.length, this.engine.player(state, seat).assetCount('reinforcement'));
    }

    combatReinforce(state, seat, side, cmd) {
        const c = state.combat;
        const count = Math.max(0, Number(cmd.count) || 0);
        // The card of the opponent may forbid the reinforcement.
        const foe = CombatSides.foe(side);
        const other = this.combatValues(state, foe);
        void other;
        // The card names the player who may not reinforce: without a name the
        // ban is the old one, on the defender.
        if (CombatBans.of(c).forbidsReinforce(seat, side)) {
            return { ok: false, error: 'Противник не может размещать жетоны подкрепления.' };
        }
        const max = this.maxReinforce(state, seat, side);
        if (count > max) return { ok: false, error: 'Не больше ' + max + ' жетонов подкрепления.' };
        const tokens = CombatTokens.of(c);
        tokens.add(side, count, false);
        // A reinforced token leaves the reserve: one counter for every token
        // that comes and goes, so the limit of the faction holds here too.
        this.engine.player(state, seat).payAsset('reinforcement', count);
        tokens.setSpent(side, count);
        // «В конце шага призыва подкреплений …» («Зов астропатов»): the moment of
        // the card, offered before the step is closed.
        if (!tokens.hookAsked(side)) {
            tokens.askHook(side);
            if (this.engine.maybeScheme(state, seat, 'reinforce-end', { kind: 'combat', ctx: { side } })) {
                tokens.setPending(side);
                return { ok: true, pending: true };
            }
        }
        this.finishReinforce(state, side);
        return { ok: true };
    }

    finishReinforce(state, side) {
        const c = state.combat;
        if (!c) return;
        const turn = CombatTurn.of(c);
        if (side === 'attacker') turn.setStep('reinforce-defender');
        else { turn.setStep('choose-attacker'); this.advanceCombatSteps(state); }
    }

    loseReinforcementTokens(state, side, n) {
        const c = state.combat;
        if (!c || !n) return 0;
        let left = n;
        while (left > 0) {
            const t = this.tokenUnits(state, side);
            const dead = this.reinforceDestroyed(state, side);
            // The flipped tokens are destroyed first, then the standing ones.
            let index = this.reinforceFlipped(state, side).find(i => i < t.used && dead.indexOf(i) < 0);
            if (index === undefined) {
                for (let i = 0; i < t.used; i++) {
                    if (dead.indexOf(i) < 0) { index = i; break; }
                }
            }
            if (index === undefined) break;
            this.destroyReinforcementToken(state, side, index, false);
            // A token destroyed by a card does not come back to the player's
            // assets at clean-up.
            CombatTokens.of(c).returnSpent(side);
            left -= 1;
        }
        const lost = n - left;
        if (lost) this.engine.log(state, -1, 'Уничтожено жетонов подкрепления: ' + lost + '.');
        return lost;
    }

    combatToken(state, seat, side, cmd) {
        const c = state.combat;
        const foe = CombatSides.foe(side);
        const target = cmd.target === 'foe' ? foe : side;
        const count = Math.max(0, Number(cmd.count) || 0);
        const kind = cmd.tokenType === 'def' ? 'def' : 'att';
        const cubes = CombatCubes.of(c);
        if (target === foe && count > 0) {
            // The foe gives away no more cubes than it has.
            const take = Math.min(count, cubes.get(foe, kind));
            cubes.take(foe, kind, take);
            return { ok: true, count: take };
        }
        cubes.add(target, kind, count);
        return { ok: true, count };
    }

    combatDie(state, seat, side, cmd) {
        void seat;
        const turn = CombatTurn.of(state.combat);
        const foe = CombatSides.foe(side);
        const target = cmd.target === 'foe' ? foe : side;
        const count = Math.max(0, Number(cmd.count) || 0);
        if (target === foe) {
            // The dice of the opponent are taken from the table, one by one.
            let take = 0;
            for (let k = 0; k < count; k++) {
                const idx = turn.dice(target).findIndex(d => d && d !== 'blank');
                if (idx < 0) break;
                turn.take(target, idx);
                take++;
            }
            return { ok: true, count: take };
        }
        if (turn.room(target) < count) return { ok: false, error: 'Больше восьми кубиков быть не может.' };
        for (let i = 0; i < count; i++) {
            const face = FACE_KINDS.includes(cmd.face) ? cmd.face : 'any';
            turn.add(target, face === 'any' ? this.engine.rollDice(state, 1)[0] : face);
        }
        return { ok: true, count };
    }

    combatReroll(state, seat, side, cmd) {
        void seat;
        const turn = CombatTurn.of(state.combat);
        const index = Number(cmd.index);
        if (!turn.has(side, index)) return { ok: false, error: 'Нет такого кубика.' };
        turn.put(side, index, this.engine.rollDice(state, 1)[0]);
        return { ok: true };
    }

    combatPlayCard(state, seat, side, cmd) {
        const c = state.combat;
        const hand = this.engine.player(state, seat).combatHand;
        const index = Number(cmd.index);
        // The card is taken out of the hand and laid face down on the table.
        const name = hand.takeAt(index);
        if (!name) return { ok: false, error: 'Нет такой карты.' };
        const card = FS_CATALOG.card('combat', state.players[seat].faction, name);
        const cards = CombatCards.of(c);
        cards.stage(side, { name, card, seat });
        hand.setChosen(name);
        this.engine.log(state, seat, state.players[seat].name + ' выбирает боевую карту и кладёт её закрытой.');
        // «The attacker and defender simultaneously choose one combat card from
        // their hands and place it facedown in front of them. The attacker
        // reveals and resolves his combat card. Then, the defender reveals and
        // resolves his combat card.» Neither card is turned over before both of
        // them lie on the table: a card revealed too early resolves while the
        // other player is still choosing, and his own card play would overwrite
        // the questions the first card is still asking.
        const otherSide = CombatSides.foe(side);
        const otherDone = !!cards.staged(otherSide)
            || !this.engine.player(state, CombatSides.seatOf(c, otherSide)).combatHand.size();
        const turn = CombatTurn.of(c);
        if (otherDone) turn.setStep('reveal');
        else turn.setStep(side === 'attacker' ? 'choose-defender' : 'choose-attacker');
        this.advanceCombatSteps(state);
        return { ok: true, card: card || null, staged: true };
    }

    combatReveal(state) {
        const c = state.combat;
        const turn = CombatTurn.of(c);
        if (!turn || !turn.is('reveal')) return null;
        const cards = CombatCards.of(c);
        // The first card that was chosen and is not yet in play.
        for (const side of ['attacker', 'defender']) {
            const staged = cards.staged(side);
            if (staged) {
                cards.unstage(side);
                this.engine.player(state, staged.seat).combatHand.setChosen(null);
                cards.put(side, { name: staged.name, card: staged.card, side }, turn.round);
                this.engine.log(state, staged.seat, state.players[staged.seat].name
                    + ' вскрывает боевую карту «' + staged.name + '».');
                const steps = this.engine.cardSteps(state, staged.seat, staged.card);
                if (steps.length) {
                    // The reveal waits for the effect of the card to be over.
                    turn.step = 'effect';
                    turn.nextStep = 'reveal';
                    // «A player can choose not to resolve one of his abilities»:
                    // the owner of the card decides about each of them.
                    this.engine.runEffects(state, staged.seat, steps, { kind: 'combat', ctx: { side }, optional: true });
                    return turn.step;
                }
                return turn.step;
            }
        }
        // Both cards are open: the damage of the round comes next.
        CombatPlans.of(c).resetDestroyed();
        turn.setStep('damage-attacker');
        this.advanceCombatSteps(state);
        return turn.step;
    }

    combatSkipCard(state, seat, side) {
        void state; void seat; void side;
        return { ok: false, error: 'Боевую карту нельзя пропустить.' };
    }

    advanceCombatSteps(state) {
        const c = state.combat;
        const turn = CombatTurn.of(c);
        if (!turn) return null;
        for (let i = 0; i < 12; i++) {
            const before = turn.step;
            // The reinforcement is asked only from the player who has the tokens.
            if (turn.is('reinforce-attacker')
                && this.maxReinforce(state, CombatSides.seatOf(c, 'attacker'), 'attacker') <= 0) {
                turn.setStep('reinforce-defender');
            }
            if (turn.is('reinforce-defender')
                && this.maxReinforce(state, CombatSides.seatOf(c, 'defender'), 'defender') <= 0) {
                turn.setStep('choose-attacker');
            }
            // «Вместо того, чтобы играть боевую карту из руки, вы можете сбросить
            // эту карту…» («Тактический гений»): the moment of the card play.
            if (turn.choosing) {
                const hs = turn.side;
                const hseat = CombatSides.seatOf(c, hs);
                if (CombatHooks.of(c).ask('playHook', hs)) {
                    const was = turn.step;
                    if (this.engine.maybeScheme(state, hseat, 'combat-play', { kind: 'combat', ctx: { side: hs } })) {
                        turn.hold(was);
                        return null;
                    }
                }
            }
            // A side with an empty hand has nothing to lay down: the choice
            // belongs to the other side — the hand says so, not the record.
            const handSize = s2 => this.engine.player(state, CombatSides.seatOf(c, s2)).combatHand.size();
            if (turn.is('choose-attacker') && !handSize('attacker')) turn.setStep('choose-defender');
            if (turn.is('choose-defender') && !handSize('defender')) {
                turn.setStep(CombatCards.of(c).staged('attacker') ? 'reveal' : 'damage-attacker');
            }
            if (turn.is('reveal')) { this.combatReveal(state); if (!state.combat) return null; }
            if (turn.is('damage-attacker') && this.combatDamageFor(state, 'attacker') <= 0) {
                CombatDamage.of(c).setDealt('attacker', 0);
                CombatCards.of(c).setApplied('attacker', []);
                turn.setStep('damage-defender');
            }
            if (turn.is('damage-defender') && this.combatDamageFor(state, 'defender') <= 0) {
                CombatDamage.of(c).setDealt('defender', 0);
                CombatCards.of(c).setApplied('defender', []);
                this.endDamageStep(state);
                if (!state.combat) return null;
            }
            // The effect of a card took the place of the end of the round: when
            // it is over the round ends for good.
            if (turn.is('round-end')) {
                this.endCombatRound(state);
                if (!state.combat) return null;
            }
            if (turn.step === before) break;
        }
        return turn.step;
    }

    skipEmptyChoose(state) {
        return this.advanceCombatSteps(state);
    }

    combatValues(state, side) {
        const c = state.combat;
        // The card may make the attack dice of the enemy useless.
        const dice = CombatBans.of(c).dice(side, CombatTurn.of(c).live(side));
        const tokens = CombatCubes.of(c).values(side);
        const icons = CombatCards.of(c).icons(side);
        const seat = CombatSides.seatOf(c, side);
        let att = 0, def = 0, morale = 0;
        for (const d of dice) {
            if (d === 'att') att++;
            else if (d === 'def') def++;
            else if (d === 'morale') morale++;
        }
        att += tokens.att + icons.att;
        def += tokens.def + icons.def;
        morale += icons.morale;
        // The printed morale of the unrouted units, the bastions and the
        // reinforcement tokens is the bulk of the combat morale (the rules,
        // "Morale"); only the icons on the cards and the dice add to it.
        const field = BattleField.of(c);
        morale += this.moraleFromPieces(state, field.system, field.pos, seat);
        morale += this.tokenMorale(state, side);
        return { att, def, morale };
    }

    combatValuesParts(state, side) {
        const c = state.combat;
        const dice = CombatBans.of(c).dice(side, CombatTurn.of(c).live(side));
        const tokens = CombatCubes.of(c).values(side);
        const icons = CombatCards.of(c).icons(side);
        const seat = CombatSides.seatOf(c, side);
        const field = BattleField.of(c);
        const unitsMorale = this.moraleFromPieces(state, field.system, field.pos, seat)
            + this.tokenMorale(state, side);
        const parts = {
            att: { dice: 0, tokens: tokens.att || 0, cards: 0, units: 0, total: 0 },
            def: { dice: 0, tokens: tokens.def || 0, cards: 0, units: 0, total: 0 },
            morale: { dice: 0, tokens: 0, cards: 0, units: unitsMorale, total: 0 },
        };
        for (const d of dice) if (parts[d]) parts[d].dice++;
        for (const kind of ['att', 'def', 'morale']) parts[kind].cards = icons[kind];
        for (const kind of ['att', 'def', 'morale']) {
            const p = parts[kind];
            p.total = p.dice + p.tokens + p.cards + p.units;
        }
        return parts;
    }

    combatDamageFor(state, side) {
        const c = state.combat;
        if (c) this.applyDamageStartTokens(state);
        const other = CombatSides.foe(side);
        const me = this.combatValues(state, side);
        const them = this.combatValues(state, other);
        let damage = Math.max(0, them.att - me.def);
        // The card may add the damage to one side or to both. The damage the
        // card adds to the opponent is paid only when he really is hurt: «если
        // противник получил урон, он получает ещё 3 урона» («Секущие когти»),
        // «если ваш противник будет распределять какой-либо урон…» — a blow the
        // shields stopped stays stopped.
        return CombatDamage.of(c).extra(side, damage);
    }

    damagePreview(state, side, targets, seat) {
        const c = state.combat;
        const owner = CombatSides.seatOf(c, side);
        const actor = seat === undefined ? owner : seat;
        const damage = this.combatDamageFor(state, side);
        const oneByOne = CombatDamage.of(c).oneByOne(side);
        const rows = [];
        let left = damage;
        for (const id of targets || []) {
            if (left <= 0) break;
            if (typeof id === 'string' && id.startsWith('reinforce-')) {
                // A preview is drawn on EVERY click while the player picks the
                // pieces. It must never change the battle: the old version
                // flipped the token here, before the damage was even sent.
                if (this.reinforceTokenIndex(state, side, id) < 0) continue;
                const def0 = this.reinforceTokenDef(state, side);
                const health = this.reinforceTokenHealth(state, side, actor);
                const take = oneByOne ? 1 : Math.min(left, health);
                const destroyed = oneByOne ? health <= 1 : left >= health;
                const routed = !destroyed && !this.reinforceNoRoute(state, side);
                left -= take;
                rows.push({ id, name: def0 ? def0.name : 'Подкрепление', health, take,
                    destroyed, routed, token: true });
                continue;
            }
            const unit = state.units.find(u => u.id === id);
            if (unit) {
                const def = this.engine.unitOf(state, unit);
                const health = CombatDamage.of(c).health(unit.seat, actor, def ? def.health : 1);
                const take = oneByOne ? 1 : Math.min(left, health);
                const destroyed = oneByOne ? health <= 1 : left >= health;
                left -= take;
                rows.push({ id: unit.id, name: def ? def.name : unit.id, health, take, destroyed, routed: destroyed ? !!unit.routed : !destroyed });
                continue;
            }
            const bastion = state.structures.find(st => st.id === id);
            if (bastion) {
                const health = this.engine.structureStats(bastion.type).health;
                const take = Math.min(left, health);
                const destroyed = left >= health;
                left -= take;
                rows.push({ id: bastion.id, name: this.engine.structureStats(bastion.type).name || bastion.type, health, take, destroyed, bastion: true });
            }
        }
        return { damage, placed: damage - left, left: Math.max(0, left), rows, oneByOne };
    }

    damageCandidates(state, side, seat) {
        const c = state.combat;
        const owner = CombatSides.seatOf(c, side);
        const actor = seat === undefined ? owner : seat;
        const out = [];
        const field = BattleField.of(c);
        for (const u of state.units) {
            if (u.seat !== owner || !field.holds(u)) continue;
            const def = this.engine.unitOf(state, u);
            if (!def) continue;
            out.push({ id: u.id, name: def.name, health: def.health, morale: def.morale,
                routed: !!u.routed, type: def.type, kind: 'unit' });
        }
        // Only a bastion has a health value: a city or a factory takes no damage.
        for (const s of state.structures) {
            if (s.seat !== owner || !field.holds(s) || s.type !== 'bastion') continue;
            const st = this.engine.structureStats('bastion');
            out.push({ id: s.id, name: st.name || 'bastion', health: st.health, morale: st.morale || 0,
                routed: false, type: 'structure', kind: 'structure' });
        }
        // A reinforcement token is treated like a plastic unit for all rules and
        // game effects: it has the health and the morale of the command level
        // zero miniature it stands for. Lethal damage destroys it; a routed
        // one is flipped to its routed side.
        const t = this.tokenUnits(state, side);
        const def0 = this.reinforceTokenDef(state, side);
        const health0 = this.reinforceTokenHealth(state, side, actor);
        const flipped = this.reinforceFlipped(state, side);
        const dead = this.reinforceDestroyed(state, side);
        for (let i = 0; i < t.used; i++) {
            if (dead.indexOf(i) >= 0) continue;
            out.push({
                id: 'reinforce-' + side + '-' + i, name: def0 ? def0.name : 'Подкрепление',
                health: health0, morale: def0 ? def0.morale : 0,
                routed: flipped.indexOf(i) >= 0, type: def0 ? def0.type : 'ground', kind: 'token',
            });
        }
        // A routed unit can take damage only when the side has nothing else.
        const allowed = new Set(this.canTakeDamage(state, c, side).map(x => x.id));
        return out.filter(x => allowed.has(x.id));
    }

    combatDamage(state, seat, side, cmd) {
        const c = state.combat;
        const damage = this.combatDamageFor(state, side);
        // No real damage — no question and no assignment: the shields did the work.
        const turn = CombatTurn.of(c);
        const cards = CombatCards.of(c);
        if (damage <= 0) {
            CombatDamage.of(c).setDealt(side, 0);
            cards.setApplied(side, []);
            if (side === 'attacker') { turn.setStep('damage-defender'); this.advanceCombatSteps(state); }
            else { this.endDamageStep(state); this.advanceCombatSteps(state); }
            return { ok: true, damage: 0, applied: [] };
        }
        // The schemes of the damage step are used before the damage.
        const hooks = CombatHooks.of(c);
        if (hooks.ask('damageHook', side)) {
            if (this.engine.maybeScheme(state, seat, 'damage', { kind: 'combat', ctx: { side } })) return { ok: true, pending: true };
        }
        // «Критический удар» belongs to the opponent of the player who assigns
        // the damage: its scheme is offered before the units are hit.
        if (hooks.ask('criticalHook', side)) {
            if (this.maybeCriticalStrike(state, seat, side, cmd.targets || [])) {
                return { ok: true, pending: true };
            }
        }
        // Only the pieces the rules allow may be chosen: an unrouted unit, a
        // bastion — or a routed unit when the side has nothing else left.
        const able = new Set(this.canTakeDamage(state, c, side).map(x => x.id));
        for (const id of (cmd.targets || [])) {
            if (!able.has(id)) return { ok: false, error: 'Этот отряд не может получить урон.' };
        }
        const rules = CombatDamage.of(c);
        rules.setDealt(side, damage);
        // The card may make the damage go one point at a time.
        const oneByOne = rules.oneByOne(side);
        const targets = cmd.targets || [];
        // «Этот отряд или бастион получает урон первым» («Бронетанковый клин»):
        // the piece the card chose takes the damage before everything else.
        const firstHit = rules.firstOf(side, turn.round);
        if (firstHit && damage > 0) {
            const at = targets.indexOf(firstHit.id);
            if (at > 0) {
                targets.splice(at, 1);
                targets.unshift(firstHit.id);
            } else if (at < 0) {
                return { ok: false, error: 'Урон сначала получает выбранный картой отряд или бастион.' };
            }
        }
        // «Урон, превышающий значение здоровья выбранного отряда или
        // бастиона, теряется» («Монт'ка»): the chosen piece is the ONLY one
        // that takes damage this step.
        const keeping = rules.excessOf(turn.round);
        const excessId = keeping && firstHit && keeping.id === firstHit.id ? keeping.id : null;
        // The damage is applied to the chosen units in order.
        let left = damage;
        const applied = [];
        const dropExcess = id => { if (excessId && id === excessId) left = 0; };
        for (const id of targets) {
            if (left <= 0) break;
            if (typeof id === 'string' && id.startsWith('reinforce-')) {
                const index = this.reinforceTokenIndex(state, side, id);
                if (index < 0) { dropExcess(id); continue; }
                const health = this.reinforceTokenHealth(state, side, seat);
                if (oneByOne) {
                    // «распределять урон … по 1 единице за раз»: one point on
                    // this token, the rest goes on to the next chosen piece.
                    left -= 1;
                    if (health <= 1) {
                        this.destroyReinforcementToken(state, side, index, true);
                        applied.push({ token: id, destroyed: true });
                    } else {
                        if (!this.reinforceNoRoute(state, side)) this.routeReinforcementToken(state, side, index);
                        applied.push({ token: id, destroyed: false, routed: true });
                    }
                } else if (left >= health) {
                    // Damage equal to health destroys the token; the excess is
                    // assigned to the next piece (rules, "Damage And Health").
                    left -= health;
                    this.destroyReinforcementToken(state, side, index, true);
                    applied.push({ token: id, destroyed: true });
                } else {
                    // A nonlethal hit only flips the token. A card may keep it
                    // standing. Damage that does not destroy a unit is spent.
                    left = 0;
                    if (!this.reinforceNoRoute(state, side)) this.routeReinforcementToken(state, side, index);
                    applied.push({ token: id, destroyed: false, routed: true });
                }
                dropExcess(id);
                continue;
            }
            const unit = state.units.find(u => u.id === id);
            if (unit) {
                const def = this.engine.unitOf(state, unit);
                // The card may raise the health of the units or lower it.
                const health = rules.health(unit.seat, seat, def ? def.health : 1);
                if (this.retreatInsteadOfDestroy(state, unit)) {
                    left -= health;
                    applied.push({ unit: unit.id, retreated: true });
                } else if (left >= health && !oneByOne) {
                    left -= health;
                    applied.push({ unit: unit.id, destroyed: true });
                    this.noteResurrect(state, unit, true);
                    this.noteFallen(state, unit, true);
                    this.engine.destroyUnit(state, unit);
                } else if (oneByOne) {
                    // The damage goes one point at a time.
                    left -= 1;
                    if (health <= 1) {
                        if (this.retreatInsteadOfDestroy(state, unit)) {
                            applied.push({ unit: unit.id, retreated: true });
                        } else {
                            applied.push({ unit: unit.id, destroyed: true });
                            this.noteResurrect(state, unit, true);
                            this.noteFallen(state, unit, true);
                            this.engine.destroyUnit(state, unit);
                        }
                    } else {
                        applied.push({ unit: unit.id, destroyed: false });
                    }
                } else {
                    // The card may keep the unit from being routed.
                    const keep = rules.forbidsRoute(unit.seat, def ? def.kl || 0 : 0, turn.round);
                    if (!keep) {
                        this.noteFallen(state, unit, false);
                        this.routeUnit(state, unit, turn.round);
                        this.noteResurrect(state, unit, false);
                    }
                    left = 0;
                    applied.push({ unit: unit.id, destroyed: false });
                }
                dropExcess(id);
                continue;
            }
            const bastion = state.structures.find(s => s.id === id && s.type === 'bastion');
            if (bastion) {
                const health = this.engine.structureStats('bastion').health;
                if (left >= health) {
                    left -= health;
                    applied.push({ bastion: bastion.id, destroyed: true });
                    this.engine.destroyStructure(state, bastion);
                } else {
                    left = 0;    // the damage to a bastion is ignored
                    applied.push({ bastion: bastion.id, destroyed: false });
                }
                dropExcess(id);
            }
        }
        cards.setApplied(side, applied);
        if (side === 'attacker') { turn.setStep('damage-defender'); this.advanceCombatSteps(state); }
        else { this.endDamageStep(state); this.advanceCombatSteps(state); }
        return { ok: true, damage, applied };
    }

    endDamageStep(state) {
        const c = state.combat;
        if (!c) return;
        const rules = CombatDamage.of(c);
        if (rules.repeats && !rules.repeated) {
            rules.repeatOnce();
            CombatPlans.of(c).resetDestroyed();
            CombatHooks.of(c).forget('damageHook').forgetEnd();
            rules.resetDamage();
            CombatCards.of(c).clearApplied();
            CombatTurn.of(c).setStep('damage-attacker');
            this.engine.log(state, -1, 'Шаг нанесения повреждений повторяется.');
            return;
        }
        // «в конце шага нанесения повреждений … деморализовать 1 отряд
        // противника» («Совращённый Хаосом»): both combatants may hold a plan.
        const hooks = CombatHooks.of(c);
        const ends = [CombatSides.seatOf(c, 'attacker'), CombatSides.seatOf(c, 'defender')];
        for (let at = hooks.endNext(); at < ends.length; at = hooks.endNext()) {
            const seat = ends[hooks.endStep()];
            const side = CombatSides.sideOf(c, seat);
            if (this.engine.maybeScheme(state, seat, 'damage-end', { kind: 'combat', ctx: { side } })) {
                hooks.endResume = true;
                return;
            }
        }
        // «… поместить обратно в эту область в конце шага нанесения урона»
        // («Уклонение»): the fallen KL0 units come back before the round ends.
        if (this.offerFallenRestore(state)) return;
        // «вернуть этого юнита недеморализованным обратно после этапа получения
        // урона» («Сфера воскрешения»).
        if (this.schemeResurrect(state)) return;
        // «если в этом раунде боя отряд противника становится деморализованным,
        // он уничтожается» («Фаланга судного дня»).
        if (this.destroyRoutedFoe(state)) return;
        // «… в конце первого шага нанесения повреждений» («Ракета Death Strike»).
        if (this.deferredDamage(state)) return;
        this.endCombatRound(state);
    }

    noteResurrect(state, unit, destroyed) {
        const c = state.combat;
        if (!c) return;
        // Only a scheme of the fall of a unit of the printed command level.
        const scheme = this.engine.schemesOf(state, unit.seat)
            .find(x => (x.steps || []).some(y => y.op === 'resurrect'));
        if (!scheme) return;
        const stepR = (scheme.steps || []).find(y => y.op === 'resurrect');
        const def = this.engine.unitOf(state, unit);
        if (!def) return;
        const kl = stepR && stepR.maxKl !== undefined ? stepR.maxKl : 1;
        if ((def.kl || 0) > kl) return;
        CombatPlans.of(c).noteCandidate({
            unit: unit.unit, def: def.id, id: unit.id, seat: unit.seat,
            system: unit.system, pos: unit.area, destroyed,
        });
    }

    applyResurrect(state) {
        const c = state.combat;
        const plans = CombatPlans.of(c);
        const pending = plans ? plans.candidate : null;
        if (!pending) return;
        plans.clearResurrect();
        const alive = state.units.find(u => u.id === pending.id);
        if (alive) {
            this.restoreUnit(state, alive);
        } else if (pending.destroyed) {
            const p = state.players[pending.seat];
            if ((p.supply.units[pending.def] || 0) > 0) p.supply.units[pending.def] -= 1;
            this.engine.addUnit(state, pending.seat, pending.def, pending.system, pending.pos);
        }
        this.engine.log(state, pending.seat, state.players[pending.seat].name + ': «Сфера воскрешения» возвращает отряд.');
    }

    schemeResurrect(state) {
        const c = state.combat;
        const plans = CombatPlans.of(c);
        if (!plans || !plans.candidates.length) return false;
        const candidate = plans.candidate;
        if (plans.askedSeat === candidate.seat) return false;
        const scheme = this.engine.schemesOf(state, candidate.seat)
            .find(x => (x.steps || []).some(y => y.op === 'resurrect'));
        if (!scheme) { plans.candidates = []; return false; }
        plans.askSeat(candidate.seat);
        CombatTurn.of(c).holdEffect('round-end');
        const side = CombatSides.sideOf(c, candidate.seat);
        this.engine.runEffects(state, candidate.seat, [{ op: 'resurrectOffer' }], { kind: 'combat', ctx: { side } });
        return true;
    }

    destroyRoutedFoe(state) {
        const c = state.combat;
        const turn = CombatTurn.of(c);
        const plans = CombatPlans.of(c);
        const d = plans.routedFoe;
        if (!d || d.done) return false;
        if (!turn.inRound(d)) { plans.clearRoutedFoe(); return false; }
        const foeSide = CombatSides.foe(CombatSides.sideOf(c, d.seat));
        const foeSeat = CombatSides.seatOf(c, foeSide);
        // «если в этом раунде боя отряд противника становится деморализованным» —
        // the units that were routed in this round.
        const units = BattleField.of(c).routed(state, foeSeat)
            .filter(u => u.routedRound === undefined || u.routedRound === turn.round);
        d.done = true;
        if (!units.length) return false;
        const avoid = d.avoid || { kind: 'def', n: 1 };
        const steps = units.map(u => ({
            op: 'avoidDestroy',
            unit: u.id,
            avoid,
            ability: 'деморализованный отряд уничтожается; можно избежать уничтожения за 1 `def. cube`',
        }));
        turn.holdEffect('round-end');
        this.engine.runEffects(state, d.seat, steps, { kind: 'combat', ctx: { side: CombatSides.sideOf(c, d.seat) } });
        return true;
    }

    deferredDamage(state) {
        const c = state.combat;
        const d = CombatPlans.of(c).takeDeferred();
        if (!d) return false;
        const foeSeat = CombatSides.foeSeat(c, d.seat);
        const targets = BattleField.of(c).units(state, foeSeat);
        // «получите по 1 материалу за каждый уничтоженный отряд» («Рой
        // потрошителей») needs no piece of the opponent to aim at.
        const needsTarget = (d.steps || []).some(x => x && x.op !== 'gainMateriel');
        if (needsTarget && !targets.length) return false;
        CombatTurn.of(c).holdEffect('round-end');
        this.engine.runEffects(state, d.seat, d.steps, {
            kind: 'combat', ctx: { side: CombatSides.sideOf(c, d.seat) },
        });
        return true;
    }

    endCombatRound(state) {
        const c = state.combat;
        const turn = CombatTurn.of(c);
        // «если ни один из ваших отрядов не отступил во время этого раунда»
        // («Притворное отступление»): the answer is known only now, and the
        // combat tokens of this round are about to be discarded — the reward
        // belongs to the next round.
        const plans = CombatPlans.of(c);
        const noRet = plans.noRetreatPlan(turn.round);
        if (noRet) {
            noRet.fired = true;
            if (!plans.retreatedThisRound(noRet.seat, turn.round)) {
                plans.addLaterToken({ side: noRet.side, kind: noRet.kind, n: noRet.n });
                this.engine.log(state, noRet.seat, state.players[noRet.seat].name
                    + ' не отступал: ' + noRet.n + ' жетон(ов) в следующем раунде.');
            }
        }
        // «Если ваши отряды или бастионы не получат урона в конце этого раунда,
        // ваш противник отступает одним из своих отрядов» («Фаланга монолита»).
        const pendingRetreat = plans.noDamagePlan(turn.round);
        if (pendingRetreat) {
            const entry = pendingRetreat;
            entry.fired = true;
            const side = CombatSides.sideOf(c, entry.seat);
            // «если ваши отряды или бастионы не получат урона в конце этого
            // раунда»: the damage the card's owner placed on his own pieces.
            const damage = CombatDamage.of(c).dealt(side);
            if (damage === 0) {
                turn.holdEffect('round-end');
                this.engine.runEffects(state, entry.seat, entry.steps, { kind: 'combat', ctx: { side } });
                return;
            }
        }
        // «В конце этого раунда … переместить 1 из ваших отрядов из соседней
        // области в эту» («Кауйон»): the move happens before the tokens of the
        // round are discarded, and the dice it gives stay for the damage step.
        const endPlan = plans.endPlan(turn.round);
        if (endPlan) {
            endPlan.fired = true;
            turn.holdEffect('round-end');
            const side = CombatSides.sideOf(c, endPlan.seat);
            this.engine.runEffects(state, endPlan.seat, [{
                op: 'moveUnitToCombatForDice', who: 'me',
                ability: 'переместить 1 отряд из соседней области в эту и получить кубики по его боевой силе',
            }], { kind: 'combat', ctx: { side } });
            return;
        }
        // The combat tokens go back to the supply at the end of every execution
        // round: only the dice and the cards are counted again. A card may keep
        // the tokens of the kind it names for the round it was played in
        // («Шустрое судно» — `def. token`, «Гнев машины» — `att. token`).
        const cubes = CombatCubes.of(c);
        const keepSide = side => ({
            att: plans.keeps(side, 'att', turn.round) ? cubes.get(side, 'att') : 0,
            def: plans.keeps(side, 'def', turn.round) ? cubes.get(side, 'def') : 0,
        });
        cubes.reset({ attacker: keepSide('attacker'), defender: keepSide('defender') });
        plans.clearKeeps();
        // The effects printed «during this round of combat» end here: the
        // health bonus, the routing ban and the chosen first target must not
        // leak into the next execution round.
        CombatDamage.of(c).clear();
        // The card may destroy the units that became routed.
        if (CombatBans.of(c).destroysRouted) {
            const field = BattleField.of(c);
            const attackerSeat = CombatSides.seatOf(c, 'attacker');
            for (const u of field.routed(state, attackerSeat)
                .concat(field.routed(state, CombatSides.seatOf(c, 'defender')))) {
                this.engine.log(state, attackerSeat, 'Деморализованный отряд уничтожен.');
                this.engine.destroyUnit(state, u);
            }
            // A flipped reinforcement token is a routed unit too.
            for (const side of ['attacker', 'defender']) {
                for (const i of this.reinforceFlipped(state, side).slice()) {
                    this.destroyReinforcementToken(state, side, i, false);
                }
            }
        }
        // The side without a single unit or bastion left loses the combat: the
        // rest of the execution round is over and the resolution begins.
        if (!this.pieces(state, c, 'attacker').length || !this.pieces(state, c, 'defender').length) {
            this.finishCombat(state, true);
            return;
        }
        if (turn.lastRound) { this.finishCombat(state); return; }
        turn.nextRound();
        // «получите 2 `att. token` в следующем раунде боя» («Крылатый ужас»):
        // the tokens the card promised come from the supply now. «За каждого
        // вашего уничтоженного или деморализованного в этом раунде юнита
        // получите 1 `def. token`» («Выводок термаганов») counts the losses of
        // the round that has just ended: one token for each of them.
        const lostOf = seat => {
            const snap = plans.rosterOf(seat);
            let n = 0;
            for (const s of snap) {
                const now = state.units.find(u => u.id === s.id);
                if (!now) n++;
                else if (!s.routed && now.routed) n++;
            }
            return n;
        };
        for (const one of plans.takeLaterTokens(turn.round)) {
            const seat = CombatSides.seatOf(c, one.side);
            const n = one.per === 'lostRound' ? (one.n || 1) * lostOf(seat) : (one.n || 1);
            if (n <= 0) continue;
            CombatCubes.of(c).add(one.side, one.kind, n);
            this.engine.log(state, seat, state.players[seat].name + ' получает ' + n
                + ' жетон(ов) ' + (one.kind === 'att' ? 'атаки' : 'обороны') + '.');
        }
        plans.roster = this.rosterOfRound(state, c);
        CombatCards.of(c).clearStaged();
        for (const side of ['attacker', 'defender']) {
            CombatCards.of(c).setChosen(side, null);
            this.engine.player(state, CombatSides.seatOf(c, side)).combatHand.setChosen(null);
        }
        // The effects that belonged to the previous round are over.
        plans.expire(turn.round);
        CombatHooks.of(c).reset();
        turn.setStep('choose-attacker');
        this.advanceCombatSteps(state);
        // The schemes of the start of the round.
        this.engine.maybeScheme(state, CombatSides.seatOf(c, 'attacker'), 'round',
            { kind: 'combat', ctx: { side: 'attacker' } });
        CombatDamage.of(c).resetDamage();
    }

    rosterOfRound(state, c) {
        const one = seat => state.units.filter(u => u.seat === seat)
            .map(u => ({ id: u.id, routed: !!u.routed }));
        const attacker = CombatSides.seatOf(c, 'attacker');
        const defender = CombatSides.seatOf(c, 'defender');
        return { attacker: one(attacker), defender: one(defender) };
    }

    applyDamageStartTokens(state) {
        const c = state.combat;
        const turn = CombatTurn.of(c);
        if (!turn) return;
        for (const one of CombatDamage.of(c).takeStartTokens(turn.round)) {
            const side = one.side;
            const kind = one.kind || 'att';
            const n = one.n || 1;
            CombatCubes.of(c).take(side, kind, n);
            const seat = CombatSides.seatOf(c, side);
            this.engine.log(state, seat, state.players[seat].name + ' теряет ' + n
                + ' жетон(ов) атаки в начале шага повреждений.');
        }
    }

    noteFallen(state, unit, destroyed) {
        const c = state.combat;
        if (!c || unit.routed) return;
        const def = this.engine.unitOf(state, unit);
        if (!def) return;
        CombatPlans.of(c).noteFallen({
            id: unit.id, def: def.id, seat: unit.seat,
            system: unit.system, pos: unit.area,
            destroyed: !!destroyed, kl: def.kl || 0,
        });
    }

    retreatInsteadOfDestroy(state, unit) {
        const c = state.combat;
        const plan = c && CombatDamage.of(c).retreatPlan(unit.seat, CombatTurn.of(c).round);
        if (!plan) return false;
        const def = this.engine.unitOf(state, unit);
        if (!def) return false;
        const ground = def.type === 'ground';
        const targets = (this.retreatTargets(state, unit.seat) || []).filter(t => {
            const sys = this.engine.system(state, t.system);
            const a = sys ? this.engine.area(sys, t.pos) : null;
            return !!a && !!a.world === ground;
        });
        if (!targets.length) return false;
        plan.used = true;
        const t = targets[0];
        // One movement of a piece: the trace and the area are written once.
        this.engine.board(state).moveUnit(unit, t, { seat: unit.seat });
        this.routeUnit(state, unit);
        this.markRetreat(state, unit.seat);
        this.engine.trimArea(state, unit.seat, t.system, t.pos);
        this.engine.log(state, unit.seat, state.players[unit.seat].name
            + ': отряд отступает вместо уничтожения.');
        return true;
    }

    markRetreat(state, seat) {
        const c = state.combat;
        if (!c) return;
        CombatPlans.of(c).markRetreat(seat);
    }

    offerFallenRestore(state) {
        const c = state.combat;
        if (!c) return false;
        const promises = CombatPlans.of(c);
        const plan = promises.restorePlan(CombatTurn.of(c).round);
        if (!plan) return false;
        const candidates = promises.fallen(plan.seat).filter(x => (x.kl || 0) <= plan.maxKl);
        if (!candidates.length) return false;
        plan.asked = true;
        plan.candidates = candidates.slice();
        CombatTurn.of(c).holdEffect('round-end');
        const side = CombatSides.sideOf(c, plan.seat);
        this.engine.runEffects(state, plan.seat, [{
            op: 'restoreFallenOffer', who: 'me',
            candidates: candidates.map(x => x.id), plan,
        }], { kind: 'combat', ctx: { side } });
        return true;
    }

    maybeCriticalStrike(state, seat, side, targets) {
        const c = state.combat;
        if (!c || !targets || !targets.length) return false;
        /** @type {any[]} */
        const damageTargets = targets.filter(id => {
            const u = state.units.find(x => x.id === id);
            return !!u && u.seat === seat;
        });
        if (!damageTargets.length) return false;
        for (const p of state.players) {
            if (p.seat === seat) continue;
            const schemes = (p.schemes || []).filter(x => x && x.trigger === 'damage'
                && (x.steps || []).some(y => y && y.op === 'destroyDamagedFoe'));
            if (!schemes.length) continue;
            const hooks = CombatHooks.of(c);
            hooks.ask('damageHook', side);
            hooks.ask('criticalHook', side);
            hooks.damageResume = { seat, side, cmd: { targets: targets.slice() } };
            CombatTurn.of(c).holdEffect('effect');
            Question.of(state).ask({
                seat: p.seat, kind: 'scheme',
                question: {
                    kind: 'scheme', who: p.seat, options: schemes.map(x => x.name),
                    text: 'Сбросить карту: ' + schemes.map(x => '«' + x.name + '»').join(', ') + '?',
                },
                ctx: { kind: 'combat', ctx: { side, damageTargets }, schemes },
            });
            return true;
        }
        return false;
    }

    resumeDamage(state) {
        const c = state.combat;
        const d = CombatHooks.of(c) ? CombatHooks.of(c).takeDamageResume() : null;
        if (!d) return;
        this.combatDamage(state, d.seat, d.side, d.cmd);
    }

    moraleFromPieces(state, systemId, pos, seat) {
        let units = 0;
        for (const u of this.engine.unitsAt(state, systemId, pos)) {
            if (u.seat !== seat || u.routed) continue;
            const def = this.engine.unitOf(state, u);
            if (def) units += def.morale || 0;
        }
        for (const s of this.engine.structuresAt(state, systemId, pos)) {
            if (s.seat !== seat) continue;
            units += this.engine.structureStats(s.type).morale || 0;
        }
        return units;
    }

    combatMorale(state, side) {
        const c = state.combat;
        // The combat values already carry the units, the bastions, the
        // reinforcement tokens, the cards and the dice.
        return this.combatValues(state, side).morale;
    }

    finishCombat(state, wiped = false) {
        const c = state.combat;
        const attMorale = this.combatMorale(state, 'attacker');
        const defMorale = this.combatMorale(state, 'defender');
        // A tie goes to the defender; a side whose troops are all gone loses
        // without any morale count.
        let attackerWins;
        if (wiped) {
            const attLeft = this.pieces(state, c, 'attacker').length;
            const defLeft = this.pieces(state, c, 'defender').length;
            attackerWins = attLeft > 0 && defLeft === 0;
        } else {
            attackerWins = attMorale > defMorale;
        }
        const outcome = CombatOutcome.of(c).decide(attackerWins ? 'attacker' : 'defender',
            { attacker: attMorale, defender: defMorale });
        const loser = outcome.loserSeat;
        const winner = outcome.winnerSeat;
        this.engine.log(state, winner, 'Бой ' + (wiped ? 'закончен' : 'выигран') + ': мораль '
            + (attackerWins ? attMorale : defMorale) + ' против ' + (attackerWins ? defMorale : attMorale) + '.');
        // Only the attacker takes the structures of the world (the rules).
        const field = BattleField.of(c);
        if (attackerWins) {
            this.captureStructures(state, field.system, field.pos,
                CombatSides.seatOf(c, 'attacker'), CombatSides.seatOf(c, 'defender'));
        }
        CombatTurn.of(c).setStep('retreat');
        // A player whose troops all died has nothing to retreat: the combat ends
        // without asking where the dead should go.
        const noTroops = !BattleField.of(c).units(state, loser).length;
        // The schemes of the end of the combat.
        this.engine.maybeScheme(state, winner, 'combat-end', { kind: 'combat', ctx: { side: CombatSides.sideOf(c, winner) } });
        // The combat cards go back into the deck, the reinforcement tokens too.
        for (const side of ['attacker', 'defender']) {
            const seat = CombatSides.seatOf(c, side);
            const p = state.players[seat];
            // Both the cards that were played and the cards that stayed in the hand
            // go back into the deck: a combat deals five cards and returns five.
            // «discards the combat cards he used during the combat by shuffling
            // them back into his combat deck». A card that was only chosen and
            // never turned over (the combat ended in between) is returned too.
            const deck = this.engine.player(state, p.seat).combatDeck;
            const cards = CombatCards.of(c);
            for (const card of cards.played(side)) deck.add(card.name);
            const hand = this.engine.player(state, p.seat).combatHand;
            hand.returnAll();
            // The card that was only chosen and never turned over goes back too.
            const staged = cards.staged(side);
            if (staged && !cards.has(side, staged.name)) deck.add(staged.name);
            cards.clear(side);
            deck.shuffle();
            // The reinforcement tokens of the combat go back to the supply here, at
            // the clean-up of the combat.
            const tokens = CombatTokens.of(c);
            this.engine.player(state, seat).addAsset('reinforcement', tokens.spent(side));
            tokens.setSpent(side, 0);
        }
        if (noTroops) this.combatRetreat(state, loser, attackerWins ? 'defender' : 'attacker', {});
    }

    retreatTargets(state, seat) {
        const c = state.combat;
        if (!c) return [];
        const side = CombatSides.sideOf(c, seat);
        const units = BattleField.of(c).units(state, seat);
        if (!units.length) return [];
        const defs = units.map(u => this.engine.unitOf(state, u)).filter(Boolean);
        const ground = defs.length ? defs[0].type === 'ground' : true;
        // «If the units did not move into the contested area via an Advance
        // Order, they must move to an area that at least one unit moved from to
        // start the combat.» Otherwise the general retreat rules apply.
        const came = CombatApproach.of(c);
        const free = side === 'attacker' && came.freeToReturn();
        const field = BattleField.of(c);
        const systems = [field.system].concat(this.engine.neighbors(state, field.system));
        const out = [];
        for (const sid of systems) {
            const sys = this.engine.system(state, sid);
            if (!sys) continue;
            for (const area of sys.areas) {
                if (!!area.world !== ground) continue;
                if (field.is(sid, area.pos)) continue;
                const where = this.engine.areaState(state, seat, sid, area.pos);
                if (where === 'contested' || where === 'enemy') continue;
                if (side === 'defender') {
                    // «The area the retreating units move to must either be in
                    // the active system or in a system adjacent to the active
                    // system. If attacking units moved from an adjacent system,
                    // the defender's units cannot retreat to that system.
                    // Defending units cannot retreat to an area from which
                    // attacking units moved from.»
                    if (came.fromSystem(sid)) continue;
                    if (came.fromArea(sid, area.pos)) continue;
                } else if (!free) {
                    // Not an Advance: back to an area a unit moved from. Without
                    // such an area the units cannot retreat and are destroyed.
                    if (!came.fromArea(sid, area.pos)) continue;
                }
                // A ground unit walks a legal path to the area it retreats to.
                if (ground && !this.engine.pathExists(state, seat, field.system, field.pos, sid, area.pos)) continue;
                out.push({ system: sid, pos: area.pos, state: where });
            }
        }
        // The defender prefers a friendly area; uncontrolled is the last resort.
        if (side === 'defender') {
            const friendly = out.filter(t => t.state === 'friendly');
            if (friendly.length) return friendly.map(({ system, pos }) => ({ system, pos }));
        }
        return out.map(({ system, pos }) => ({ system, pos }));
    }

    combatRetreat(state, seat, side, cmd) {
        const c = state.combat;
        if (!CombatOutcome.of(c).lostBy(seat)) return { ok: false, error: 'Отступает проигравший.' };
        const units = BattleField.of(c).units(state, seat);
        const targets = this.retreatTargets(state, seat);
        let target = null;
        if (cmd && cmd.target) {
            target = targets.find(t => t.system === cmd.target.system && t.pos === cmd.target.pos) || null;
            if (!target) return { ok: false, error: 'Отступать в эту область нельзя.' };
        } else if (targets.length) {
            return { ok: false, error: 'Выберите, куда отступить.' };
        }
        for (const u of units) {
            if (target) this.engine.board(state).moveUnit(u, target, { seat });
            this.routeUnit(state, u);
            this.markRetreat(state, seat);
        }
        // No area to retreat to: the unit is destroyed (the rules, "Retreats").
        if (!target) {
            for (const u of units) this.engine.destroyUnit(state, u);
            if (units.length) this.engine.log(state, seat, state.players[seat].name + ': отступать некуда, отряды гибнут.');
        }
        // The troops over the capacity of the new area are chosen by the player.
        if (target) this.engine.trimArea(state, seat, target.system, target.pos);
        this.engine.log(state, seat, state.players[seat].name + ' отступает.');
        state.combat = null;
        // A test battle stays on the field: the player may start it again.
        if (state.testBattle) {
            this.engine.closeOrder(state);
            return { ok: true };
        }
        // The order that started the combat is over.
        this.engine.finishOrder(state, seat);
        return { ok: true };
    }

}
