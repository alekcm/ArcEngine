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

    /** Remember a new contested area until the combat that created it ends. */
    queueEffectCombat(state, attacker, defender, area, arrivals) {
        if (!state.effectCombatQueue) state.effectCombatQueue = [];
        let entry = state.effectCombatQueue.find(q => q.attacker === attacker && q.defender === defender
            && q.system === area.system && q.pos === area.pos);
        if (!entry) {
            entry = { attacker, defender, system: area.system, pos: area.pos, arrivals: [] };
            state.effectCombatQueue.push(entry);
        }
        for (const arrival of arrivals || []) {
            entry.arrivals = entry.arrivals.filter(a => a.id !== arrival.id);
            entry.arrivals.push({ id: arrival.id, from: { system: arrival.from.system, pos: arrival.from.pos } });
        }
    }

    /** Start the first still-contested follow-up; the queue stays plain JSON. */
    beginEffectCombat(state) {
        while ((state.effectCombatQueue || []).length) {
            const entry = state.effectCombatQueue.shift();
            if (!state.effectCombatQueue.length) delete state.effectCombatQueue;
            const attackers = state.units.filter(u => u.seat === entry.attacker
                && u.system === entry.system && u.area === entry.pos);
            const defenders = this.engine.board(state).warSeatsAt(entry.system, entry.pos);
            const arrivals = (entry.arrivals || []).filter(a => attackers.some(u => u.id === a.id));
            if (!arrivals.length || !defenders.has(entry.defender)) continue;
            const origins = [];
            for (const a of arrivals) {
                const last = MarchTrail.of(state).lastOf(entry.attacker, a.id);
                if (last && (last.to.system !== entry.system || last.to.pos !== entry.pos
                    || last.from.system !== a.from.system || last.from.pos !== a.from.pos)) continue;
                if (!origins.some(x => x.system === a.from.system && x.pos === a.from.pos)) origins.push(a.from);
            }
            this.startCombat(state, entry.attacker, entry.defender, entry.system, entry.pos,
                { effectInitiated: true, origins });
            return true;
        }
        return false;
    }

    startCombat(state, attacker, defender, systemId, pos, options = null) {
        // An effect-initiated combat is not the battle of the still-open Advance
        // order: its attacker must retreat to the effect's actual origins.
        const effectInitiated = !!(options && options.effectInitiated);
        const origins = effectInitiated ? (options.origins || []) : this.attackerOrigins(state, systemId, pos, attacker);
        const viaAdvance = !effectInitiated && !!(state.order
            && OrderContext.of(state.order).isKind('advance') && origins.length);
        // The defender without a single unrouted unit or bastion loses at once:
        // the preparation and the execution are skipped (the rules, "Combat").
        const ready = state.units.some(u => u.seat === defender && u.system === systemId && u.area === pos && !u.routed)
            || state.structures.some(x => x.seat === defender && x.system === systemId && x.area === pos && x.type === 'bastion');
        if (!ready) {
            this.engine.log(state, attacker, 'Защищать область некому: ' + state.players[attacker].name + ' побеждает сразу.');
            this.captureStructures(state, systemId, pos, attacker, defender);
            const routed = state.units.some(u => u.seat === defender && u.system === systemId && u.area === pos);
            if (routed) {
                // The loser still retreats routed units, even though no dice or
                // combat cards were drawn. Keep the choice in the saved combat.
                const combat = {
                    system: systemId, pos, attacker, defender, round: 1, step: 'retreat',
                    dice: { attacker: [], defender: [] },
                    tokens: { attacker: { att: 0, def: 0 }, defender: { att: 0, def: 0 } },
                    cards: { attacker: { hand: [], played: [] }, defender: { hand: [], played: [] } },
                };
                if (effectInitiated) combat.effectInitiated = true;
                CombatApproach.of(combat).set(origins, viaAdvance);
                CombatOutcome.of(combat).decide('attacker');
                state.combat = combat;
                if (!this.retreatTargets(state, defender).length) this.combatRetreat(state, defender, 'defender', {});
                return state.combat;
            }
            state.combat = null;
            if (BattleTest.of(state).replayable && !(state.effectCombatQueue || []).length) {
                this.engine.closeOrder(state); return null;
            }
            const order = state.order;
            if (order && !effectInitiated) PhasePlan.of(order).set('done');
            this.engine.finishOrder(state, order ? OrderContext.of(order).seat : attacker);
            return null;
        }
        const combat = {
            system: systemId,
            pos,
            attacker,
            defender,
            round: 1,
            step: 'combat-start',
            dice: { attacker: [], defender: [] },
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
        // The battle exists before preparation: a combat-start plan can change
        // a whole deck before either player rolls or draws his five cards.
        if (effectInitiated) combat.effectInitiated = true;
        state.combat = combat;
        CombatApproach.of(combat).set(origins, viaAdvance);
        CombatHooks.of(combat).beginStartWindow();
        this.engine.log(state, attacker, 'Бой в системе ' + this.engine.system(state, systemId).tile + ': '
            + state.players[attacker].name + ' против ' + state.players[defender].name + '.');
        this.continueCombatStart(state);
    }

    /** Offer both sides their start-of-combat plans before preparation. */
    continueCombatStart(state) {
        const combat = state.combat;
        if (!combat || !CombatTurn.of(combat).is('combat-start') || Question.of(state).waiting) return;
        const hooks = CombatHooks.of(combat);
        const window = hooks.startWindow;
        if (!window) return;
        // A plan that was accepted has left its owner's play area. A refusal
        // ends that side's window; accepting one still permits its other plans.
        if (window.offered) {
            const remaining = (state.players[window.offered.seat].schemes || []).map(s => s.name);
            // Counts distinguish discarding one of two identically named plans
            // from refusing the whole offer. Old saves stored only the names.
            const before = window.offered.counts;
            const used = before
                ? Object.keys(before).some(name => remaining.filter(n => n === name).length < before[name])
                : window.offered.names.some(name => !remaining.includes(name));
            if (used) hooks.markStartUsed();
            else window.next++;
            window.offered = null;
        }
        const sides = ['attacker', 'defender'];
        while (window.next < sides.length) {
            const side = sides[window.next];
            const owner = CombatSides.seatOf(combat, side);
            if (this.engine.maybeScheme(state, owner, 'combat-start', { kind: 'combat', ctx: { side } })) {
                const names = Question.of(state).question.options.slice();
                const counts = {};
                for (const scheme of state.players[owner].schemes || []) {
                    if (names.includes(scheme.name)) counts[scheme.name] = (counts[scheme.name] || 0) + 1;
                }
                window.offered = { seat: owner, names, counts };
                return;
            }
            window.next++;
        }
        hooks.endStartWindow();
        this.prepareCombat(state);
    }

    /** Roll and deal once, after the serialisable start window has closed. */
    prepareCombat(state) {
        const combat = state.combat;
        if (!combat || !CombatTurn.of(combat).is('combat-start')) return;
        const attacker = CombatSides.seatOf(combat, 'attacker');
        const defender = CombatSides.seatOf(combat, 'defender');
        const field = BattleField.of(combat);
        const turn = CombatTurn.of(combat);
        turn.setStep('reinforce-attacker');
        const roll = seat => {
            const n = Math.min(this.combatValue(state, seat, field.system, field.pos), this.engine.DICE_MAX);
            return this.engine.rollDice(state, n);
        };
        turn.setDice('attacker', roll(attacker)).setDice('defender', roll(defender));
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
            const myOrder = combat.effectInitiated ? null : this.engine.orderOf(state, seat);
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
        if (!combat.effectInitiated && tally0 && tally0.chaosCombatMorale
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
        // «Если во время выполнения этого приказа вы начали битву в мире, то
        // получите 1 `any cube` за каждую недеморализованную сестру Репентию в
        // шаге вызова подкреплений» («Божественное избавление»): the promise
        // of the order goes to the battle that fits it — a battle in a void
        // leaves it for a later one of the same order.
        if (!combat.effectInitiated && tally0 && tally0.combatStartDice.length
            && (OrderContext.of(state.order).isSeat(attacker) || OrderContext.of(state.order).isSeat(defender))) {
            const area0 = this.engine.area(this.engine.system(state, field.system), field.pos);
            const inWorld = !!(area0 && area0.world);
            const list = tally0.takeCombatStartDice(e => !e.worldOnly || inWorld);
            if (list.length) CombatPlans.of(combat).setStartDice({ seat: OrderContext.of(state.order).seat, list });
        }
        // «Если происходит бой, разыграйте только ОДИН раунд» («Мобилизированные
        // охотники»): the limit belongs to the combat this order starts.
        const fight = OrderFight.of(state.order);
        if (!combat.effectInitiated && fight && fight.combatRounds && OrderContext.of(state.order).isSeat(attacker)) {
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
        const promised = !combat.effectInitiated && state.order && OrderContext.of(state.order).isSeat(attacker)
            && tally ? tally.promisedReinforce : null;
        if (promised) {
            tally.takePromisedReinforce();
            this.engine.runEffects(state, attacker, [{
                op: 'placeReinforcement', n: promised.n || 1, free: promised.free,
                here: true, who: 'me', ability: 'Бесчисленные: жетон подкрепления в спорной области.',
            }], { kind: 'combat', ctx: { side: CombatSides.sideOf(combat, attacker) } });
        }
        // Preparation upgrades happen after the plans, roll and ordinary deal.
        // Round-start plans still wait until both sides finish reinforcing. An
        // empty or forbidden reinforcement step needs no client command; advance
        // it as part of the same action that started preparation.
        if (!combat.effectInitiated) this.prepEffects(state, attacker);
        if (!Question.of(state).waiting) this.advanceCombatSteps(state);
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
        // The preparation may wait for one or several answers. Resume the
        // reinforcement step on the server after the LAST answer, including
        // after a JSON save, rather than relying on a browser's auto-pass.
        const turn = CombatTurn.of(state.combat);
        turn.hold(turn.step);
        this.engine.runEffects(state, seat, steps, { kind: 'combat', ctx: { side: CombatSides.sideOf(state.combat, seat) } });
        // Preparation can change dice or the deck, so it cannot be undone by
        // merely returning the marching units and the dealt hands.
        CombatHooks.of(state.combat).markDecision();
        return true;
    }

    cmdCombat(state, seat, cmd) {
        const c = state.combat;
        if (!c) return { ok: false, error: 'Боя нет.' };
        const side = CombatSides.sideOf(c, seat);
        if (!side) return { ok: false, error: 'Вы не участвуете в бою.' };
        const turn = CombatTurn.of(c);
        switch (cmd.action) {
            case 'reinforce':
                if (!turn.is('reinforce-' + side)) return { ok: false, error: 'Сейчас не ваш шаг подкрепления.' };
                return this.combatReinforce(state, seat, side, cmd);
            case 'playCard':
                if (!turn.is('choose-' + side)) return { ok: false, error: 'Сейчас не ваш выбор карты.' };
                return this.combatPlayCard(state, seat, side, cmd);
            case 'damage': {
                // A card can give its owner the right to assign the opponent's
                // damage. The current step still decides which side is hit.
                const whose = turn.is('damage-attacker') ? 'attacker'
                    : turn.is('damage-defender') ? 'defender' : null;
                if (!whose) return { ok: false, error: 'Сейчас не шаг урона.' };
                const assignSeat = CombatHooks.of(c).assignSeat(CombatSides.seatOf(c, whose));
                if (assignSeat !== seat) return { ok: false, error: 'Урон назначает другой игрок.' };
                return this.combatDamage(state, seat, whose, cmd);
            }
            // Cubes, dice and rerolls are granted only by resolving effects;
            // accepting these as standalone network commands permits free gains.
            case 'token': case 'die': case 'reroll':
                return { ok: false, error: 'Кубики и жетоны меняются только эффектами.' };
            case 'skipCard': return this.combatSkipCard(state, seat, side);
            case 'retreat':
                if (!turn.is('retreat')) return { ok: false, error: 'Сейчас не шаг отступления.' };
                return this.combatRetreat(state, seat, side, cmd);
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
        const tokenState = CombatTokens.of(c);
        const tokens = [];
        for (let i = 0; i < t.used; i++) {
            // Destroyed or moved-away slots are not targets in this battle;
            // other slots keep their stable ids across damage and JSON saves.
            if (!tokenState.alive(side, i)) continue;
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

    reinforceTokenHealth(state, side) {
        const c = state.combat;
        if (!c) return 1;
        const owner = CombatSides.seatOf(c, side);
        const def = this.reinforceTokenDef(state, side);
        // The health of a piece is shaped by the cards of its own side only.
        return CombatDamage.of(c).health(owner, def ? def.health : 1);
    }

    reinforceTokenIndex(state, side, id) {
        const tokens = CombatTokens.of(state.combat);
        return tokens ? tokens.indexOf(side, id) : -1;
    }

    routeReinforcementToken(state, side, index) {
        const combat = state.combat;
        const tokens = CombatTokens.of(combat);
        if (!tokens || !tokens.route(side, index)) return false;
        CombatPlans.of(combat).noteRoutedFoe(CombatSides.seatOf(combat, side), 'reinforce-' + side + '-' + index);
        return true;
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
        const plans = CombatPlans.of(state.combat);
        if (!unit.routed && plans) plans.noteRoutedFoe(unit.seat, unit.id);
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
        // «все отряды ... не могут получать повреждения»: reinforcement
        // tokens are units, while bastions remain legal damage targets.
        if (CombatDamage.of(c).unitsProtected(CombatTurn.of(c).round))
            return items.filter(x => x.type === 'bastion');
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
        const trail = MarchTrail.of(state);
        const participants = state.units.filter(u => u.seat === seat && u.system === systemId && u.area === pos)
            .map(u => u.id);
        const march = state.order ? MarchPlan.of(state.order) : null;
        for (const step of (march ? march.steps : [])) {
            for (const m of step) {
                // Identified trail records contain later effect movements too;
                // when present, the last one is the authoritative arrival.
                if (!participants.includes(m.id) || trail.lastOf(seat, m.id)) continue;
                // Old saves may lack both a piece on the trail and a destination
                // on the march step; then the unit's current location is the best
                // available evidence of where the step ended.
                if (m.toSystem !== undefined && (m.toSystem !== systemId || m.toArea !== pos)) continue;
                push({ system: m.fromSystem, pos: m.fromArea });
            }
        }
        for (const from of trail.cameFrom(seat, systemId, pos, participants)) push(from);
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
        if (CombatBans.of(c).forbidsReinforce(seat, side)) return 0;
        const units = BattleField.of(c).units(state, seat);
        return Math.min(units.length, this.engine.player(state, seat).assetCount('reinforcement'));
    }

    combatReinforce(state, seat, side, cmd) {
        const c = state.combat;
        const count = cmd.count == null ? 0 : cmd.count;
        if (!Number.isInteger(count) || count < 0) return { ok: false, error: 'Укажите целое количество подкреплений.' };
        // The card of the opponent may forbid the reinforcement.
        const foe = CombatSides.foe(side);
        const other = this.combatValues(state, foe);
        void other;
        // The card names the player who may not reinforce: without a name the
        // ban is the old one, on the defender.
        // A banned player still needs to pass the step with zero tokens.
        if (count > 0 && CombatBans.of(c).forbidsReinforce(seat, side)) {
            return { ok: false, error: 'Противник не может размещать жетоны подкрепления.' };
        }
        const max = this.maxReinforce(state, seat, side);
        if (count > max) return { ok: false, error: 'Не больше ' + max + ' жетонов подкрепления.' };
        CombatHooks.of(c).markDecision();
        const tokens = CombatTokens.of(c);
        tokens.add(side, count, false);
        // Tokens leave the player's play area when used; after combat they go
        // to the common supply, not back into that player's assets.
        this.engine.player(state, seat).payAsset('reinforcement', count);
        tokens.setSpent(side, count);
        if (this.offerReinforceEnd(state, seat, side)) return { ok: true, pending: true };
        this.finishReinforce(state, side);
        return { ok: true };
    }

    // The end-of-reinforcement plans are available even when this player had
    // no tokens to place and the step advances automatically.
    offerReinforceEnd(state, seat, side) {
        const tokens = CombatTokens.of(state.combat);
        if (!tokens || tokens.hookAsked(side)) return false;
        tokens.askHook(side);
        if (!this.engine.maybeScheme(state, seat, 'reinforce-end', { kind: 'combat', ctx: { side } })) return false;
        tokens.setPending(side);
        return true;
    }

    /**
     * «Божественное избавление»: the dice the order promised to its battle,
     * given once at the end of the reinforcement step. «1 `any cube`» is a
     * rolled die; a named face is that face.
     */
    grantStartDice(state) {
        const c = state.combat;
        const plan = c && CombatPlans.of(c).takeStartDice();
        if (!plan || !state.players[plan.seat]) return;
        const side = CombatSides.sideOf(c, plan.seat);
        if (!side) return;
        const turn = CombatTurn.of(c);
        let given = 0;
        for (const e of plan.list || []) {
            const n = e.per
                ? FS_EFFECTS.count(this.engine, state, plan.seat,
                    { n: e.n || 1, per: e.per, filter: e.filter || null, inBattle: true, max: e.max }, { kind: 'combat' })
                : (e.n || 1);
            for (let i = 0; i < n; i++) {
                const face = !e.kind || e.kind === 'any' ? this.engine.rollDice(state, 1)[0] : e.kind;
                if (!turn.add(side, face)) break;
                given++;
            }
        }
        if (given) {
            this.engine.log(state, plan.seat, state.players[plan.seat].name
                + ' получает кубики по улучшению приказа: ' + given + '.');
        }
    }

    finishReinforce(state, side) {
        const c = state.combat;
        if (!c) return;
        const turn = CombatTurn.of(c);
        turn.setStep(side === 'attacker' ? 'reinforce-defender' : 'choose-attacker');
        // The next side may also have no legal reinforcement. Skip its empty
        // step now, but still offer its end-of-reinforcement scheme window.
        this.advanceCombatSteps(state);
    }

    loseReinforcementTokens(state, side, n) {
        const c = state.combat;
        if (!c || !n) return 0;
        let left = n;
        while (left > 0) {
            const t = this.tokenUnits(state, side);
            const tokenState = CombatTokens.of(c);
            // The flipped tokens are destroyed first, then the standing ones;
            // a token that has already left the battlefield is not a target.
            let index = this.reinforceFlipped(state, side).find(i => tokenState.alive(side, i));
            if (index === undefined) {
                for (let i = 0; i < t.used; i++) {
                    if (tokenState.alive(side, i)) { index = i; break; }
                }
            }
            if (index === undefined) break;
            this.destroyReinforcementToken(state, side, index, false);
            // Like every used reinforcement, it belongs to the common supply
            // after combat rather than returning to its owner's assets.
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
        let index = Number(cmd.index);
        // «каждый раз, когда ваш противник должен выбрать боевую карту, она
        // выбирается случайным образом» («Познание агонии»): the player still
        // sends the command, the dice pick the card.
        if (CombatBans.of(c).randomCardFor(side) && hand.size() > 0) {
            index = this.engine.rand(state, hand.size());
            this.engine.log(state, seat, state.players[seat].name + ': боевая карта выбирается случайно.');
        }
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
                // The dice this card rolls are its own («выброшенные во время
                // применения общих способностей этой карты»).
                CombatHooks.of(c).resetRolls();
                // «ваш противник не может разыграть общие способности на
                // следующей открытой боевой карте» («Ослепляющий залп»): this
                // card is read without its general half.
                const noGeneral = CombatBans.of(c).takeGeneralBan(side);
                if (noGeneral) {
                    this.engine.log(state, staged.seat, state.players[staged.seat].name
                        + ': общие способности этой карты не разыгрываются.');
                }
                const steps = this.engine.cardSteps(state, staged.seat, staged.card, { noGeneral });
                if (steps.length) {
                    // The reveal waits for the effect of the card to be over.
                    turn.step = 'effect';
                    turn.nextStep = 'reveal';
                    // «A player can choose not to resolve one of his abilities»:
                    // the owner of the card decides about each of them.
                    this.engine.runEffects(state, staged.seat, steps, { kind: 'combat', ctx: { side }, optional: true });
                    return turn.step;
                }
                // A card with no applicable ability still counts as revealed:
                // continue to the other card or to damage without another action.
                continue;
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
        // A scheme or preparation question suspends the step until its answer.
        if (!turn || Question.of(state).waiting) return null;
        for (let i = 0; i < 12; i++) {
            const before = turn.step, beforeRound = turn.round;
            const beforeRepeat = CombatDamage.of(c).repeated;
            // Even a zero-token step has an end-of-reinforcement window.
            if (turn.is('reinforce-attacker')
                && this.maxReinforce(state, CombatSides.seatOf(c, 'attacker'), 'attacker') <= 0) {
                if (this.offerReinforceEnd(state, CombatSides.seatOf(c, 'attacker'), 'attacker')) return null;
                turn.setStep('reinforce-defender');
            }
            if (turn.is('reinforce-defender')
                && this.maxReinforce(state, CombatSides.seatOf(c, 'defender'), 'defender') <= 0) {
                if (this.offerReinforceEnd(state, CombatSides.seatOf(c, 'defender'), 'defender')) return null;
                turn.setStep('choose-attacker');
            }
            // The dice an order promised «в шаге вызова подкреплений» arrive
            // when that step is over, counted by the units that stand there then.
            if (turn.choosing && CombatPlans.of(c).startDice) this.grantStartDice(state);
            // A round begins after reinforcement, before either card is chosen.
            // Both players may have a plan; the held step resumes after each
            // answer, including after a save or a network reconnect.
            if (turn.choosing) {
                for (const side of ['attacker', 'defender']) {
                    if (!CombatHooks.of(c).ask('roundHook', side)) continue;
                    const owner = CombatSides.seatOf(c, side);
                    if (this.engine.maybeScheme(state, owner, 'round', { kind: 'combat', ctx: { side } })) {
                        turn.hold(turn.step);
                        return null;
                    }
                }
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
            if (turn.is('reveal')) {
                this.combatReveal(state);
                if (state.combat !== c || Question.of(state).waiting) return null;
            }
            // The damage step begins once, before EITHER player assigns hits.
            // A plan at this moment is available even when both totals are zero.
            // Keep the held step and each answered seat in the serialised combat.
            if (turn.is('damage-attacker')) {
                const hooks = CombatHooks.of(c);
                for (const side of ['attacker', 'defender']) {
                    if (!hooks.ask('damageStartHook', side)) continue;
                    const owner = CombatSides.seatOf(c, side);
                    if (this.engine.maybeScheme(state, owner, 'damage-start', { kind: 'combat', ctx: { side } })) {
                        turn.hold(turn.step);
                        return null;
                    }
                }
            }
            // Damage is still calculated for both players when a force leaves
            // during the round. An empty side has no pieces to receive its hits.
            if (turn.is('damage-attacker') && (this.combatDamageFor(state, 'attacker') <= 0
                || !this.pieces(state, c, 'attacker').length)) {
                CombatDamage.of(c).setDealt('attacker', 0);
                CombatCards.of(c).setApplied('attacker', []);
                turn.setStep('damage-defender');
            }
            if (turn.is('damage-defender') && (this.combatDamageFor(state, 'defender') <= 0
                || !this.pieces(state, c, 'defender').length)) {
                CombatDamage.of(c).setDealt('defender', 0);
                CombatCards.of(c).setApplied('defender', []);
                this.endDamageStep(state);
                if (state.combat !== c || Question.of(state).waiting) return null;
            }
            // Effects at the end of damage may need answers. Their serialised
            // continuation returns here, not directly to the end of the round.
            if (turn.is('damage-end')) {
                this.endDamageStep(state);
                if (state.combat !== c || Question.of(state).waiting) return null;
            }
            // The effect of a card took the place of the end of the round: when
            // it is over the round ends for good.
            if (turn.is('round-end')) {
                this.endCombatRound(state);
                if (state.combat !== c) return null;
            }
            // The first zero-damage step can repeat back to the same named
            // step. That is progress, not a stall; process its start window
            // and any automatic zero damage without requiring a client command.
            if (turn.step === before && turn.round === beforeRound
                && CombatDamage.of(c).repeated === beforeRepeat) break;
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
        morale += this.routedMoraleHalf(state, side);
        return { att, def, morale };
    }

    /**
     * «… добавить половину значения боевого духа (с округлением вверх) ваших
     * деморализованных отрядов к суммарному значению во время шага разрешения
     * битвы» («Несокрушимая вера»): the routed units of the area count in part.
     */
    routedMoraleHalf(state, side) {
        const c = state.combat;
        const seat = CombatSides.seatOf(c, side);
        if (seat === null || seat === undefined || !CombatPlans.of(c).countsRoutedMoraleHalf(seat)) return 0;
        const field = BattleField.of(c);
        let routed = 0;
        for (const u of this.engine.unitsAt(state, field.system, field.pos)) {
            if (u.seat !== seat || !u.routed) continue;
            const def = this.engine.unitOf(state, u);
            if (def) routed += def.morale || 0;
        }
        const tokenDef = this.engine.reinforceTokenDef(state, side);
        if (tokenDef) routed += this.tokenUnits(state, side).routed * (tokenDef.morale || 0);
        return Math.ceil(routed / 2);
    }

    combatValuesParts(state, side) {
        const c = state.combat;
        const dice = CombatBans.of(c).dice(side, CombatTurn.of(c).live(side));
        const tokens = CombatCubes.of(c).values(side);
        const icons = CombatCards.of(c).icons(side);
        const seat = CombatSides.seatOf(c, side);
        const field = BattleField.of(c);
        const unitsMorale = this.moraleFromPieces(state, field.system, field.pos, seat)
            + this.tokenMorale(state, side) + this.routedMoraleHalf(state, side);
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

    /**
     * «ваши отряды с командным уровнем N или ниже не могут быть деморализованы»:
     * is the routing of this unit forbidden in this round? The damage step and
     * the preview both ask here, so the promise cannot part with the rule.
     */
    forbidsRouteFor(state, unit, def) {
        const c = state.combat;
        if (!c) return false;
        const turn = CombatTurn.of(c);
        return CombatDamage.of(c).forbidsRoute(unit.seat, def ? def.kl || 0 : 0, turn ? turn.round : 0);
    }

    /**
     * «если бы отряд был уничтожен, вместо этого он отступает»: the card of the
     * round saves a unit only when there is a place it can really go. A card
     * without a way out does not save the unit — and the preview must say so too.
     * The targets are computed twice with the same answer: the damage step asks
     * this question and `retreatInsteadOfDestroy` asks it again.
     */
    retreatAvailable(state, unit) {
        return !!this.retreatTarget(state, unit);
    }

    /**
     * The place the unit retreats to instead of dying, or null: one answer for
     * the preview and for the damage step, so their promises cannot part.
     */
    retreatTarget(state, unit) {
        const c = state.combat;
        if (!c || !unit) return null;
        const plan = CombatDamage.of(c).retreatPlan(unit.seat, CombatTurn.of(c).round);
        if (!plan) return null;
        const def = this.engine.unitOf(state, unit);
        if (!def) return null;
        const ground = def.type === 'ground';
        const to = (this.retreatTargets(state, unit.seat) || []).find(t => {
            const sys = this.engine.system(state, t.system);
            const a = sys ? this.engine.area(sys, t.pos) : null;
            return !!a && !!a.world === ground;
        });
        return to || null;
    }

    damagePreview(state, side, targets) {
        const c = state.combat;
        const damage = this.combatDamageFor(state, side);
        const rules = CombatDamage.of(c);
        const round = CombatTurn.of(c).round;
        const oneByOne = rules.oneByOne(side);
        const allowed = new Set(this.canTakeDamage(state, c, side).map(x => x.id));
        const marked = rules.firstOf(side, round);
        // A previously chosen piece may have died or left before this step.
        const first = marked && allowed.has(marked.id) ? marked.id : null;
        const selected = (targets || []).slice();
        const needsFirst = !!(damage > 0 && first && !selected.includes(first));
        const rows = [];
        if (needsFirst) return { damage, placed: 0, left: damage, discarded: 0, rows, oneByOne, first, needsFirst };
        if (first && selected.includes(first)) {
            selected.splice(selected.indexOf(first), 1);
            selected.unshift(first);
        }
        const excess = rules.excessOf(round);
        const excessId = excess && first && excess.id === first ? first
            : (excess && excess.id === 'fallen' && excess.side === side ? 'fallen' : null);
        let left = damage, discarded = 0;
        const dropExcess = id => {
            if (!excessId) return;
            if (id === excessId) { discarded += left; left = 0; }
            // «Мученичество»: the damage past the first fallen unit is lost.
            const last = rows.length ? rows[rows.length - 1] : null;
            if (excessId === 'fallen' && last && last.destroyed && !last.bastion && !last.retreat) {
                discarded += left; left = 0;
            }
        };
        for (const id of selected) {
            if (left <= 0) break;
            if (!allowed.has(id)) continue;
            if (typeof id === 'string' && id.startsWith('reinforce-')) {
                // A preview is drawn on EVERY click while the player picks the
                // pieces. It must never change the battle: the old version
                // flipped the token here, before the damage was even sent.
                if (this.reinforceTokenIndex(state, side, id) < 0) continue;
                const def0 = this.reinforceTokenDef(state, side);
                const health = this.reinforceTokenHealth(state, side);
                const take = oneByOne ? 1 : Math.min(left, health);
                const destroyed = oneByOne ? health <= 1 : left >= health;
                const routed = !destroyed && !this.reinforceNoRoute(state, side);
                left -= take;
                rows.push({ id, name: def0 ? def0.name : 'Подкрепление', health, take,
                    destroyed, routed, token: true });
                dropExcess(id);
                continue;
            }
            const unit = state.units.find(u => u.id === id);
            if (unit) {
                const def = this.engine.unitOf(state, unit);
                const health = CombatDamage.of(c).health(unit.seat, def ? def.health : 1);
                const take = oneByOne ? 1 : Math.min(left, health);
                const destroyed = oneByOne ? health <= 1 : left >= health;
                left -= take;
                // The preview must promise what the damage will really do: a card
                // may keep the unit standing («не может быть деморализован») or
                // take it off the field before the destruction («отступите
                // вместо уничтожения»). The damage step reads the same two rules.
                const keep = this.forbidsRouteFor(state, unit, def);
                const retreat = destroyed && this.retreatAvailable(state, unit);
                rows.push({ id: unit.id, name: def ? def.name : unit.id, health, take,
                    destroyed: destroyed && !retreat, routed: destroyed ? (!retreat && !!unit.routed) : !keep,
                    retreat });
                dropExcess(id);
                continue;
            }
            const bastion = state.structures.find(st => st.id === id);
            if (bastion) {
                const health = this.engine.structureStats(bastion.type).health;
                const take = Math.min(left, health);
                const destroyed = left >= health;
                left -= take;
                rows.push({ id: bastion.id, name: this.engine.structureStats(bastion.type).name || bastion.type, health, take, destroyed, bastion: true });
                dropExcess(id);
            }
        }
        return { damage, placed: damage - left - discarded, left: Math.max(0, left), discarded, rows, oneByOne, first, needsFirst };
    }

    damageCandidates(state, side) {
        const c = state.combat;
        const owner = CombatSides.seatOf(c, side);
        const rules = CombatDamage.of(c);
        const out = [];
        const field = BattleField.of(c);
        for (const u of state.units) {
            if (u.seat !== owner || !field.holds(u)) continue;
            const def = this.engine.unitOf(state, u);
            if (!def) continue;
            // The panel must show the health the damage step will really use,
            // cards of the round included — not the printed value.
            out.push({ id: u.id, name: def.name, health: rules ? rules.health(u.seat, def.health) : def.health,
                morale: def.morale, routed: !!u.routed, type: def.type, kind: 'unit' });
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
        const health0 = this.reinforceTokenHealth(state, side);
        const flipped = this.reinforceFlipped(state, side);
        const tokenState = CombatTokens.of(c);
        for (let i = 0; i < t.used; i++) {
            if (!tokenState.alive(side, i)) continue;
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
            else { this.endDamageStep(state); if (state.combat === c) this.advanceCombatSteps(state); }
            return { ok: true, damage: 0, applied: [] };
        }
        // Validate before opening any reactive plan or changing hook state: an
        // invalid network command must neither spend a question nor skip damage.
        if (cmd.targets != null && !Array.isArray(cmd.targets)) return { ok: false, error: 'Укажите список целей урона.' };
        const targets = (cmd.targets || []).slice();
        const able = new Set(this.canTakeDamage(state, c, side).map(x => x.id));
        if (new Set(targets).size !== targets.length || targets.some(id => !able.has(id))) {
            return { ok: false, error: 'Этот отряд не может получить урон повторно или не участвует в бою.' };
        }
        const rules = CombatDamage.of(c);
        // «Этот отряд или бастион получает урон первым» («Бронетанковый клин»).
        const marked = rules.firstOf(side, turn.round);
        // The marked piece may have been destroyed, routed, or moved away by
        // another effect before damage. An ineligible target cannot block play.
        const firstHit = marked && able.has(marked.id) ? marked : null;
        if (firstHit) {
            const at = targets.indexOf(firstHit.id);
            if (at < 0) return { ok: false, error: 'Урон сначала получает выбранный картой отряд или бастион.' };
            if (at > 0) { targets.splice(at, 1); targets.unshift(firstHit.id); }
        }
        // «Монт'ка» deliberately discards excess damage after the named target.
        // «Игнорируйте весь урон, который превышает здоровье этого юнита»
        // («Мученичество»): the unit is the first of the owner's to fall, and
        // the rest of the damage of that step is lost with it.
        const keeping = rules.excessOf(turn.round);
        const excessId = keeping && firstHit && keeping.id === firstHit.id ? keeping.id
            : (keeping && keeping.id === 'fallen' && keeping.side === side ? 'fallen' : null);
        const preview = this.damagePreview(state, side, targets);
        if (preview.left > 0 && targets.length < able.size) {
            return { ok: false, error: 'Сначала распределите оставшийся урон.' };
        }
        // The schemes of the damage step are used before the damage.
        const hooks = CombatHooks.of(c);
        if (hooks.ask('damageHook', side)) {
            if (this.engine.maybeScheme(state, seat, 'damage', { kind: 'combat', ctx: { side } })) return { ok: true, pending: true };
        }
        rules.setDealt(side, damage);
        return this.continueCombatDamage(state, {
            side, damage, left: damage, targets, index: 0, applied: [],
            oneByOne: rules.oneByOne(side), excessId,
        });
    }

    // Damage is assigned in order. A reaction to one unit must finish before
    // the next unit suffers its hit; progress is plain data for JSON/LAN/undo.
    continueCombatDamage(state, progress) {
        const c = state.combat;
        if (!c) return { ok: true };
        const { side, damage, targets, applied, oneByOne, excessId } = progress;
        const turn = CombatTurn.of(c);
        const rules = CombatDamage.of(c);
        const cards = CombatCards.of(c);
        const hooks = CombatHooks.of(c);
        let left = progress.left;
        const dropExcess = id => {
            if (!excessId) return;
            if (id === excessId) left = 0;
            // «Игнорируйте весь урон, который превышает здоровье этого юнита»
            // («Мученичество»): the piece that has just fallen takes the rest.
            const last = applied.length ? applied[applied.length - 1] : null;
            if (excessId === 'fallen' && last && last.destroyed && !last.bastion) left = 0;
        };
        const offerHit = (index) => {
            progress.left = left;
            progress.index = index + 1;
            cards.setApplied(side, applied);
            // Old interrupted saves may already have refused this reaction.
            if (hooks.asked('criticalHook', side)) return false;
            return this.maybeCriticalStrike(state, side, damage, [applied[applied.length - 1]], progress);
        };
        for (let i = progress.index; i < targets.length; i++) {
            if (left <= 0) break;
            const id = targets[i];
            if (typeof id === 'string' && id.startsWith('reinforce-')) {
                const index = this.reinforceTokenIndex(state, side, id);
                if (index < 0) { dropExcess(id); continue; }
                const health = this.reinforceTokenHealth(state, side);
                if (oneByOne) {
                    // «распределять урон … по 1 единице за раз»: one point on
                    // this token, the rest goes on to the next chosen piece.
                    left -= 1;
                    if (health <= 1) {
                        this.noteFallenToken(state, side, index, true);
                        this.destroyReinforcementToken(state, side, index, true);
                        applied.push({ token: id, destroyed: true });
                    } else {
                        if (!this.reinforceNoRoute(state, side)) {
                            this.noteFallenToken(state, side, index, false);
                            this.routeReinforcementToken(state, side, index);
                        }
                        applied.push({ token: id, destroyed: false, routed: true });
                    }
                } else if (left >= health) {
                    // Damage equal to health destroys the token; the excess is
                    // assigned to the next piece (rules, "Damage And Health").
                    left -= health;
                    this.noteFallenToken(state, side, index, true);
                    this.destroyReinforcementToken(state, side, index, true);
                    applied.push({ token: id, destroyed: true });
                } else {
                    // A nonlethal hit only flips the token. A card may keep it
                    // standing. Damage that does not destroy a unit is spent.
                    left = 0;
                    if (!this.reinforceNoRoute(state, side)) {
                        this.noteFallenToken(state, side, index, false);
                        this.routeReinforcementToken(state, side, index);
                    }
                    applied.push({ token: id, destroyed: false, routed: true });
                }
                dropExcess(id);
                if (offerHit(i)) return { ok: true, pending: true, damage, applied };
                continue;
            }
            const unit = state.units.find(u => u.id === id);
            if (unit) {
                const def = this.engine.unitOf(state, unit);
                // The card may raise the health of the units or lower it.
                const health = rules.health(unit.seat, def ? def.health : 1);
                // «во время этого раунда боя, когда 1 из ваших отрядов должен
                // быть уничтожен, вместо этого он отступает»: the card saves a
                // unit from DESTRUCTION only. The old order asked it before the
                // damage was weighed, so a single point of damage walked the
                // unit out of the battle.
                const lethal = oneByOne ? health <= 1 : left >= health;
                const to = lethal ? this.retreatTarget(state, unit) : null;
                if (lethal) {
                    left -= oneByOne ? 1 : health;
                    if (to && this.retreatInsteadOfDestroy(state, unit, to)) {
                        applied.push({ unit: unit.id, retreated: true });
                    } else {
                        applied.push({ unit: unit.id, destroyed: true });
                        this.noteResurrect(state, unit, true);
                        this.noteFallen(state, unit, true);
                        this.engine.destroyUnit(state, unit);
                    }
                } else if (oneByOne) {
                    // The damage goes one point at a time — but one point is
                    // still damage: a unit that suffers it and lives is routed
                    // (01, «Suffering Damage»), no exception for single hits.
                    // The old code left the unit standing, against the preview
                    // that promised the routing («Святая троица»).
                    left -= 1;
                    const keep = this.forbidsRouteFor(state, unit, def);
                    if (!keep) {
                        this.noteFallen(state, unit, false);
                        this.routeUnit(state, unit, turn.round);
                        this.noteResurrect(state, unit, false);
                    }
                    applied.push({ unit: unit.id, destroyed: false });
                } else {
                    // The card may keep the unit from being routed.
                    const keep = this.forbidsRouteFor(state, unit, def);
                    if (!keep) {
                        this.noteFallen(state, unit, false);
                        this.routeUnit(state, unit, turn.round);
                        this.noteResurrect(state, unit, false);
                    }
                    left = 0;
                    applied.push({ unit: unit.id, destroyed: false });
                }
                dropExcess(id);
                if (offerHit(i)) return { ok: true, pending: true, damage, applied };
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
        return this.finishCombatDamage(state, side, damage, applied);
    }

    finishCombatDamage(state, side, damage, applied) {
        const c = state.combat;
        if (!c) return { ok: true, damage, applied };
        if (side === 'attacker') { CombatTurn.of(c).setStep('damage-defender'); this.advanceCombatSteps(state); }
        else { this.endDamageStep(state); if (state.combat === c) this.advanceCombatSteps(state); }
        return { ok: true, damage, applied };
    }

    endDamageStep(state) {
        const c = state.combat;
        if (!c) return;
        const rules = CombatDamage.of(c);
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
        // Both damage steps have their own end windows. Resolve the first one
        // completely, including questions, before beginning the extra step.
        if (rules.repeats && !rules.repeated) {
            rules.repeatOnce();
            CombatPlans.of(c).resetDestroyed().resetFallenStep().resetResurrectStep().resetDeferredStep();
            CombatHooks.of(c).forget('damageHook', 'damageStartHook', 'criticalHook').forgetEnd();
            rules.resetDamage();
            CombatCards.of(c).clearApplied();
            CombatTurn.of(c).setStep('damage-attacker');
            this.engine.log(state, -1, 'Шаг нанесения повреждений повторяется.');
            return;
        }
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
        if (pending.tokenSide) {
            // A reinforcement is a unit, but has no plastic model or asset to
            // refund: return its original slot, just as with «Уклонение».
            if (!CombatTokens.of(c).restoreFallen(pending.tokenSide, pending.tokenIndex)) return;
        } else if (alive) {
            this.restoreUnit(state, alive);
        } else if (pending.destroyed) {
            const p = state.players[pending.seat];
            if ((p.supply.units[pending.def] || 0) <= 0) return;
            p.supply.units[pending.def] -= 1;
            this.engine.addUnit(state, pending.seat, pending.def, pending.system, pending.pos);
        } else return;
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
        CombatTurn.of(c).holdEffect('damage-end');
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
            .filter(u => (u.routedRound === undefined || u.routedRound === turn.round)
                && !(d.handled || []).includes(u.id))
            .map(u => ({ id: u.id }));
        // Reinforcements are units as well. Remember when each token was flipped
        // so a survivor from a previous round is not treated as newly routed.
        const tokens = CombatTokens.of(c);
        for (const index of tokens.flipped(foeSide)) {
            const id = 'reinforce-' + foeSide + '-' + index;
            if (tokens.alive(foeSide, index) && tokens.routedInRound(foeSide, index, turn.round)
                && !(d.handled || []).includes(id)) units.push({ id, tokenSide: foeSide, tokenIndex: index });
        }
        d.done = true;
        if (!units.length) return false;
        // A paid-for unit stays routed. Do not ask about it again just because
        // another unit falls in the repeated step; a fresh routing re-arms it.
        d.handled = (d.handled || []).concat(units.map(u => u.id));
        const avoid = d.avoid || { kind: 'def', n: 1 };
        const steps = units.map(u => ({
            op: 'avoidDestroy',
            unit: u.id, tokenSide: u.tokenSide, tokenIndex: u.tokenIndex,
            avoid,
            ability: 'деморализованный отряд уничтожается; можно избежать уничтожения за 1 `def. cube`',
        }));
        turn.holdEffect('damage-end');
        this.engine.runEffects(state, d.seat, steps, { kind: 'combat', ctx: { side: CombatSides.sideOf(c, d.seat) } });
        return true;
    }

    deferredDamage(state) {
        const c = state.combat;
        const plans = CombatPlans.of(c);
        for (let d = plans.takeDeferred(); d; d = plans.takeDeferred()) {
            const foeSeat = CombatSides.foeSeat(c, d.seat);
            const targets = BattleField.of(c).units(state, foeSeat);
            const foeSide = CombatSides.sideOf(c, foeSeat);
            const tokens = CombatTokens.of(c);
            const hasToken = Array.from({ length: tokens.used(foeSide) }, (_, i) => i)
                .some(i => tokens.alive(foeSide, i));
            // «Рой потрошителей» needs no opponent to aim at. If another
            // effect has no legal target, still try the remaining promises.
            // A live reinforcement is also a possible unit target.
            // «когда 1 из ваших юнитов умирает …, получите 1 `def. cube`»
            // («Мученичество») is paid to the owner: it needs no enemy either.
            const needsTarget = (d.steps || []).some(x => x
                && !['gainMateriel', 'gainDie', 'gainToken'].includes(x.op));
            if (needsTarget && !targets.length && !hasToken) continue;
            CombatTurn.of(c).holdEffect('damage-end');
            // Effects can mutate their step list while running; keep a clean
            // copy for a later repeated damage step and for JSON saves.
            const steps = JSON.parse(JSON.stringify(d.steps || []));
            this.engine.runEffects(state, d.seat, steps, {
                kind: 'combat', ctx: { side: CombatSides.sideOf(c, d.seat) },
            });
            return true;
        }
        return false;
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
        CombatCards.of(c).clearStaged().clearPeek();
        for (const side of ['attacker', 'defender']) {
            CombatCards.of(c).setChosen(side, null);
            this.engine.player(state, CombatSides.seatOf(c, side)).combatHand.setChosen(null);
        }
        // The effects that belonged to the previous round are over.
        plans.expire(turn.round);
        CombatHooks.of(c).reset();
        turn.setStep('choose-attacker');
        CombatDamage.of(c).resetDamage();
        this.advanceCombatSteps(state);
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
            const seat = CombatSides.seatOf(c, side);
            // «… противник теряет 3 `att. token` ИЛИ 3 `def. cube`»
            // («Механизированная боевая группа»): the cubes of the battle go
            // first, the tokens of the supply after them.
            if (one.what === 'die') {
                let left = n;
                for (let i = 0; i < left; i++) {
                    const at = turn.indexOf(side, kind);
                    if (at < 0) break;
                    turn.take(side, at);
                }
                this.engine.log(state, seat, state.players[seat].name + ' теряет ' + n
                    + ' кубик(ов) в начале шага повреждений.');
                continue;
            }
            CombatCubes.of(c).take(side, kind, n);
            this.engine.log(state, seat, state.players[seat].name + ' теряет ' + n
                + ' жетон(ов) в начале шага повреждений.');
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

    /** Reinforcements are level-zero units too; remember the actual token slot. */
    noteFallenToken(state, side, index, destroyed) {
        const c = state.combat;
        const tokens = CombatTokens.of(c);
        if (!tokens || !tokens.alive(side, index)) return;
        const wasRouted = tokens.flipped(side).includes(index);
        if (wasRouted && !destroyed) return;
        const def = this.reinforceTokenDef(state, side);
        if (!def) return;
        const field = BattleField.of(c);
        const entry = {
            id: 'reinforce-' + side + '-' + index, def: def.id,
            seat: CombatSides.seatOf(c, side), system: field.system, pos: field.pos,
            tokenSide: side, tokenIndex: index, destroyed: !!destroyed, kl: 0,
        };
        const plans = CombatPlans.of(c);
        // «Уклонение» names previously unrouted units; the sphere also reacts
        // to the destruction of a token that was already routed.
        if (!wasRouted) plans.noteFallen(entry);
        const sphere = this.engine.schemesOf(state, entry.seat)
            .find(s => (s.steps || []).some(x => x.op === 'resurrect' && (x.maxKl === undefined || x.maxKl >= 0)));
        if (sphere) plans.noteCandidate(Object.assign({}, entry));
    }

    retreatInsteadOfDestroy(state, unit, to) {
        const c = state.combat;
        const plan = c && CombatDamage.of(c).retreatPlan(unit.seat, CombatTurn.of(c).round);
        if (!plan) return false;
        const t = to || this.retreatTarget(state, unit);
        if (!t) return false;
        plan.used = true;
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
        CombatTurn.of(c).holdEffect('damage-end');
        const side = CombatSides.sideOf(c, plan.seat);
        this.engine.runEffects(state, plan.seat, [{
            op: 'restoreFallenOffer', who: 'me',
            candidates: candidates.map(x => x.id), plan,
        }], { kind: 'combat', ctx: { side } });
        return true;
    }

    maybeCriticalStrike(state, side, damage, applied, progress) {
        const c = state.combat;
        if (!c) return false;
        const victimSeat = CombatSides.seatOf(c, side);
        const owner = CombatSides.foeSeat(c, victimSeat);
        const p = state.players[owner];
        const field = BattleField.of(c);
        // A lethal hit has already destroyed its unit; an unhit, routed-away
        // unit or a bastion is not a legal target for this plan either.
        const damageTargets = (applied || []).map(entry => entry.unit || entry.token).filter(id => {
            if (!id) return false;
            const u = state.units.find(x => x.id === id);
            if (u) return u.seat === victimSeat && field.holds(u);
            return this.reinforceTokenIndex(state, side, id) >= 0;
        });
        if (!damageTargets.length || !p) return false;
        const schemes = (p.schemes || []).filter(x => x && x.trigger === 'damage' && x.defer
            && (x.steps || []).some(y => y && y.op === 'destroyDamagedFoe'));
        if (!schemes.length) return false;
        const hooks = CombatHooks.of(c);
        hooks.damageResume = { side, damage, applied, afterDamage: true, progress: progress || null };
        CombatTurn.of(c).holdEffect('effect');
        Question.of(state).ask({
            seat: owner, kind: 'scheme',
            question: {
                kind: 'scheme', who: owner, options: schemes.map(x => x.name),
                text: 'Сбросить карту: ' + schemes.map(x => '«' + x.name + '»').join(', ') + '?',
            },
            ctx: { kind: 'combat', ctx: { side, damageTargets }, schemes },
        });
        return true;
    }

    resumeDamage(state) {
        const c = state.combat;
        const d = CombatHooks.of(c) ? CombatHooks.of(c).takeDamageResume() : null;
        if (!d) return;
        if (!d.afterDamage) {
            // Old saves interrupted before damage. The plan may have removed a
            // selected piece meanwhile: drop stale IDs, then either apply the
            // remaining complete assignment or leave the step open for a new one.
            // In either case the already answered reaction must not be offered
            // again (including after refusal or after a fresh assignment).
            CombatHooks.of(c).ask('criticalHook', d.side);
            const able = new Set(this.canTakeDamage(state, c, d.side).map(x => x.id));
            const targets = ((d.cmd && d.cmd.targets) || []).filter(id => able.has(id));
            CombatTurn.of(c).setStep(CombatSides.damageStep(d.side));
            this.combatDamage(state, d.seat, d.side, { targets });
            return;
        }
        const applied = d.progress ? d.progress.applied : d.applied;
        for (const entry of applied || []) {
            if (entry.unit && !state.units.some(u => u.id === entry.unit)) entry.destroyed = true;
            if (entry.token && this.reinforceTokenIndex(state, d.side, entry.token) < 0) entry.destroyed = true;
        }
        CombatCards.of(c).setApplied(d.side, applied);
        if (d.progress) {
            CombatTurn.of(c).setStep(CombatSides.damageStep(d.side));
            this.continueCombatDamage(state, d.progress);
        } else {
            // Compatibility with a save made after the full old assignment.
            this.finishCombatDamage(state, d.side, d.damage, applied);
        }
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
        // «… если вы победитель — противник выбирает и уничтожает 1
        // деморализованный отряд до отступления» («Страшный приговор»): the
        // promise of the order that started this battle, kept by its winner.
        const fight0 = !c.effectInitiated && state.order ? OrderFight.of(state.order) : null;
        if (fight0 && fight0.winnerDestroysRouted) {
            fight0.takeWinnerDestroysRouted();
            if (OrderContext.of(state.order).isSeat(winner) && !wiped) {
                this.engine.runEffects(state, winner, [{
                    op: 'destroy', n: 1, pick: true, who: 'foe', routed: true, chooser: 'foe',
                    noAbilityQuestion: true, ability: 'Страшный приговор',
                }], { kind: 'combat', ctx: { side: CombatSides.sideOf(c, winner) } });
            }
        }
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
            // Used reinforcements return to the shared supply, not the player's
            // play area. They were already subtracted from assets when placed.
            CombatTokens.of(c).setSpent(side, 0);
        }
        // Tokens moved to other areas remain on the board during combat, but
        // like all used reinforcements they leave play at combat cleanup.
        state.units = state.units.filter(u => !u.reinforcementCombat);
        // A combat-end scheme still belongs to this battlefield. Even when the
        // loser has no models, do not close it until that question is answered.
        if (noTroops && !Question.of(state).waiting)
            this.combatRetreat(state, loser, attackerWins ? 'defender' : 'attacker', {});
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
        // Only defenders are limited to the battle system and its neighbours.
        // An attacking unit that marched may retreat further, and an attacker
        // moved by an effect may have come from a more distant system.
        const systems = side === 'defender'
            ? [field.system].concat(this.engine.neighbors(state, field.system))
            : state.systems.map(system => system.id);
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
                    // system. If attacking units moved from an ADJACENT system,
                    // the defender's units cannot retreat to that system.
                    // Defending units cannot retreat to an area from which
                    // attacking units moved from.» The ban of a system names an
                    // adjacent one: the active system stays open, but the very
                    // area the attackers came from does not.
                    if (sid !== field.system && came.fromSystem(sid)) continue;
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
        if (BattleTest.of(state).replayable && !(state.effectCombatQueue || []).length) {
            this.engine.closeOrder(state);
            return { ok: true };
        }
        // The loser may be the defender, but the order and any suspended event
        // belong to the attacker who revealed it.
        const owner = state.order ? OrderContext.of(state.order).seat : CombatSides.seatOf(c, 'attacker');
        this.engine.finishOrder(state, owner);
        return { ok: true };
    }

}
