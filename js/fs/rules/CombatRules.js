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
            if (state.testBattle) { state.order = null; return null; }
            const order = state.order;
            if (order) order.phase = 'done';
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
        const viaAdvance = !!(state.order && state.order.order === 'advance' && origins.length);
        const combat = {
            system: systemId,
            pos,
            attacker,
            defender,
            attackerFrom: origins,
            viaAdvance,
            round: 1,
            roundUnits: null,
            step: 'reinforce-attacker',
            dice: { attacker: roll(attacker), defender: roll(defender) },
            tokens: { attacker: { att: 0, def: 0 }, defender: { att: 0, def: 0 } },
            cards: { attacker: { hand: [], played: [] }, defender: { hand: [], played: [] } },
            reinforce: { attacker: 0, defender: 0 },
            reinforceRouted: { attacker: 0, defender: 0 },
            reinforceFlipped: { attacker: [], defender: [] },
            reinforceDestroyed: { attacker: [], defender: [] },
            damage: { attacker: 0, defender: 0 },
            winner: null,
        };
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
            const hand = [];
            // The order may give more cards for the combat.
            const myOrder = this.engine.orderOf(state, seat);
            const extra = (myOrder && myOrder.extraCombatCards) || 0;
            // A short deck (a battle test with a few chosen cards) deals what it has.
            for (let i = 0; i < 5 + extra; i++) {
                const card = deck.draw();
                if (card) hand.push(card);
            }
            combat.cards[CombatSides.sideOf(combat, seat)].hand = hand;
        }
        state.combat = combat;
        // «… получить 1 `morale cube` в начале боя, вызванного этим приказом»
        // («Прикосновение варпа»): the advance belongs to the owner of the plan.
        if (state.order && state.order.chaosCombatMorale
            && (state.order.seat === attacker || state.order.seat === defender)) {
            const side = CombatSides.sideOf(combat, state.order.seat);
            for (let i = 0; i < state.order.chaosCombatMorale; i++) {
                if (combat.dice[side].filter(Boolean).length >= this.engine.DICE_MAX) break;
                combat.dice[side].push('morale');
            }
            this.engine.log(state, state.order.seat, state.players[state.order.seat].name
                + ' получает кубик морали в начале боя.');
            state.order.chaosCombatMorale = 0;
        }
        // «Если происходит бой, разыграйте только ОДИН раунд» («Мобилизированные
        // охотники»): the limit belongs to the combat this order starts.
        if (state.order && state.order.combatRounds && state.order.seat === attacker) {
            combat.maxRounds = state.order.combatRounds;
        }
        // The roster of the first round: the cards that pay for the losses of a
        // round read it («Выводок термаганов»).
        combat.roundUnits = this.rosterOfRound(state, combat);
        // «Разыграв этот приказ … вы можете разместить 1 бесплатный жетон
        // подкрепления в спорной области в начале шага призыва подкреплений»
        // («Бесчисленные»): the token the order promised stands in the area of
        // the combat its order has just started.
        const promised = state.order && state.order.seat === attacker && state.order.combatReinforce;
        if (promised) {
            state.order.combatReinforce = null;
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
        if (!state.pending) {
            this.engine.maybeScheme(state, attacker, 'round', { kind: 'combat', ctx: { side: 'attacker' } });
        } else if (this.engine.schemesOf(state, attacker).some(x => x.trigger === 'round' && !x.defer)) {
            // Both questions at once are impossible: the round one waits for the
            // answer to the question of the start of the combat.
            combat.roundSchemeQueued = true;
        }
        // The upgrade of the preparation step («Сервочерепа-стражи») asks its
        // question now — or waits for the scheme that is being answered.
        this.prepEffects(state, attacker);
    }

    prepEffects(state, seat) {
        const order = state.order;
        if (!order || order.seat !== seat || !state.combat) return false;
        const prep = order.prepReroll;
        const draw = order.prepDrawCards;
        if (!prep && !draw) return false;
        if (state.pending) {
            // The scheme of the start of the combat is answered first; the
            // abilities of the order are asked as soon as the answer is in.
            state.combat.prepQueued = true;
            return false;
        }
        const steps = [];
        if (draw) {
            order.prepDrawCards = null;
            steps.push({
                op: 'drawCombatCards', n: draw.n || 0, discard: draw.discard || 0, who: 'me',
                ability: 'Священные масла: дополнительные боевые карты этапа подготовки.',
            });
        }
        if (prep) {
            order.prepReroll = null;
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
                const a = c.assignDamage;
                const foeSide = CombatSides.foe(side);
                const foeStep = foeSide === 'attacker' ? 'damage-attacker' : 'damage-defender';
                const myStep = side === 'attacker' ? 'damage-attacker' : 'damage-defender';
                if (a && c.step === foeStep && a.seat === seat) {
                    return this.combatDamage(state, seat, foeSide, cmd);
                }
                if (a && c.step === myStep && a.seat !== seat) {
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
        const units = state.units.filter(u => u.seat === seat && u.system === c.system && u.area === c.pos);
        const bastions = state.structures.filter(s => s.seat === seat && s.system === c.system && s.area === c.pos && s.type === 'bastion');
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
        const c = state.combat;
        if (!c) return [];
        c.reinforceFlipped = c.reinforceFlipped || { attacker: [], defender: [] };
        if (!c.reinforceFlipped[side]) {
            // An older state carries only the count: its first N tokens were
            // the flipped ones.
            const n = (c.reinforceRouted && c.reinforceRouted[side]) || 0;
            const list = [];
            for (let i = 0; i < n; i++) list.push(i);
            c.reinforceFlipped[side] = list;
        }
        return c.reinforceFlipped[side];
    }

    reinforceDestroyed(state, side) {
        const c = state.combat;
        if (!c) return [];
        c.reinforceDestroyed = c.reinforceDestroyed || { attacker: [], defender: [] };
        return c.reinforceDestroyed[side] || (c.reinforceDestroyed[side] = []);
    }

    reinforceTokenDef(state, side) {
        const c = state.combat;
        if (!c) return null;
        const seat = CombatSides.seatOf(c, side);
        const area = this.engine.area(this.engine.system(state, c.system), c.pos);
        return this.reinforceUnitDef(state.players[seat].faction, area && area.world ? 'ground' : 'ship');
    }

    reinforceTokenHealth(state, side, seat) {
        const c = state.combat;
        if (!c) return 1;
        const owner = CombatSides.seatOf(c, side);
        const actor = seat === undefined ? owner : seat;
        const def = this.reinforceTokenDef(state, side);
        let health = def ? def.health : 1;
        if (c.healthBonus && owner === actor) health += c.healthBonus;
        if (c.enemyHealth && owner !== actor) health = Math.min(health, c.enemyHealth);
        return Math.max(1, health);
    }

    reinforceTokenIndex(state, side, id) {
        if (typeof id !== 'string' || id.indexOf('reinforce-') !== 0) return -1;
        const parts = id.split('-');
        if (parts.length !== 3 || parts[1] !== side) return -1;
        const i = Number(parts[2]);
        if (!Number.isInteger(i) || i < 0 || i >= this.tokenUnits(state, side).used) return -1;
        return this.reinforceDestroyed(state, side).indexOf(i) >= 0 ? -1 : i;
    }

    routeReinforcementToken(state, side, index) {
        if (index < 0 || index >= this.tokenUnits(state, side).used) return false;
        const flipped = this.reinforceFlipped(state, side);
        if (flipped.indexOf(index) >= 0) return false;
        flipped.push(index);
        const c = state.combat;
        c.reinforceRouted = c.reinforceRouted || { attacker: 0, defender: 0 };
        c.reinforceRouted[side] = flipped.length;
        return true;
    }

    destroyReinforcementToken(state, side, index, loss) {
        if (index < 0 || index >= this.tokenUnits(state, side).used) return false;
        const dead = this.reinforceDestroyed(state, side);
        if (dead.indexOf(index) >= 0) return false;
        dead.push(index);
        const flipped = this.reinforceFlipped(state, side);
        const at = flipped.indexOf(index);
        if (at >= 0) flipped.splice(at, 1);
        const c = state.combat;
        c.reinforceRouted = c.reinforceRouted || { attacker: 0, defender: 0 };
        c.reinforceRouted[side] = flipped.length;
        // «за каждый уничтоженный отряд» counts a token as a unit too.
        if (loss) c.destroyedNow = (c.destroyedNow || 0) + 1;
        return true;
    }

    reinforceNoRoute(state, side) {
        const c = state.combat;
        if (!c) return false;
        const seat = CombatSides.seatOf(c, side);
        return (c.noRoute || []).some(x => {
            const one = typeof x === 'number' ? { seat: x } : x;
            if (one.seat !== seat) return false;
            if (one.round !== undefined && one.round !== c.round) return false;
            return !one.kl || one.kl >= 0;   // a token is command level zero
        });
    }

    tokenUnits(state, side) {
        const c = state.combat;
        const used = (c && c.reinforce && c.reinforce[side]) || 0;
        const flipped = this.reinforceFlipped(state, side);
        const dead = this.reinforceDestroyed(state, side);
        const routed = flipped.filter(i => i < used && dead.indexOf(i) < 0).length;
        const destroyed = dead.filter(i => i < used).length;
        if (c) {
            c.reinforceRouted = c.reinforceRouted || { attacker: 0, defender: 0 };
            c.reinforceRouted[side] = routed;
        }
        return { used, routed, destroyed, alive: Math.max(0, used - routed - destroyed) };
    }

    canTakeDamage(state, c, side) {
        const items = this.pieces(state, c, side);
        if (c.ownRoutedDamage && c.ownRoutedDamage[side] === c.round) return items;
        const ready = items.filter(x => x.type ? x.type === 'bastion' : !x.routed);
        return ready.length ? ready : items;
    }

    noteMove(state, seat, unit, dest) {
        if (!unit) return;
        if (!state.moves) state.moves = [];
        state.moves.push({
            seat,
            from: { system: unit.system, pos: unit.area },
            to: { system: dest.system !== undefined ? dest.system : unit.system, pos: dest.pos !== undefined ? dest.pos : unit.area },
        });
    }

    attackerOrigins(state, systemId, pos, seat) {
        const out = [];
        const push = ref => {
            if (!ref) return;
            if (!out.some(x => x.system === ref.system && x.pos === ref.pos)) out.push({ system: ref.system, pos: ref.pos });
        };
        for (const step of ((state.order && state.order.steps) || [])) {
            for (const m of step) {
                // A step of the march knows the area it contested: only the
                // troops that walked into this very area count here.
                const dest = m.contested || (state.order && state.order.contested) || '';
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
        const area = this.engine.area(this.engine.system(state, c.system), c.pos);
        const type = area && area.world ? 'ground' : 'ship';
        const def = this.reinforceUnitDef(state.players[seat].faction, type);
        return this.tokenUnits(state, side).alive * (def ? def.morale : 0);
    }

    maxReinforce(state, seat, side) {
        const c = state.combat;
        const units = state.units.filter(u => u.seat === seat && u.system === c.system && u.area === c.pos);
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
        const banned = c.noReinforce
            && (c.noReinforceSeat === undefined ? side === 'defender' : c.noReinforceSeat === seat);
        if (banned) {
            return { ok: false, error: 'Противник не может размещать жетоны подкрепления.' };
        }
        const max = this.maxReinforce(state, seat, side);
        if (count > max) return { ok: false, error: 'Не больше ' + max + ' жетонов подкрепления.' };
        c.reinforce[side] = count;
        // A reinforced token leaves the reserve: one counter for every token
        // that comes and goes, so the limit of the faction holds here too.
        this.engine.player(state, seat).payAsset('reinforcement', count);
        c.reinforceUsed = c.reinforceUsed || {};
        c.reinforceUsed[side] = count;
        // «В конце шага призыва подкреплений …» («Зов астропатов»): the moment of
        // the card, offered before the step is closed.
        if (!c.reinforceHook || !c.reinforceHook[side]) {
            c.reinforceHook = c.reinforceHook || {};
            c.reinforceHook[side] = true;
            if (this.engine.maybeScheme(state, seat, 'reinforce-end', { kind: 'combat', ctx: { side } })) {
                c.reinforcePending = side;
                return { ok: true, pending: true };
            }
        }
        this.finishReinforce(state, side);
        return { ok: true };
    }

    finishReinforce(state, side) {
        const c = state.combat;
        if (!c) return;
        if (side === 'attacker') c.step = 'reinforce-defender';
        else { c.step = 'choose-attacker'; this.advanceCombatSteps(state); }
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
            c.reinforceUsed[side] = Math.max(0, (c.reinforceUsed[side] || 0) - 1);
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
        if (target === foe && count > 0) {
            const t = c.tokens[foe];
            const take = Math.min(count, kind === 'att' ? t.att : t.def);
            if (kind === 'att') t.att -= take; else t.def -= take;
            return { ok: true, count: take };
        }
        const t = c.tokens[target];
        if (kind === 'att') t.att += count; else t.def += count;
        return { ok: true, count };
    }

    combatDie(state, seat, side, cmd) {
        const c = state.combat;
        const foe = CombatSides.foe(side);
        const target = cmd.target === 'foe' ? foe : side;
        const count = Math.max(0, Number(cmd.count) || 0);
        const dice = c.dice[target];
        if (target === foe) {
            const take = Math.min(count, dice.filter(Boolean).length);
            for (let k = 0; k < take; k++) {
                const idx = dice.findIndex(d => d && d !== 'blank');
                if (idx < 0) break;
                dice[idx] = null;
            }
            return { ok: true, count: take };
        }
        if (dice.filter(Boolean).length + count > this.engine.DICE_MAX) return { ok: false, error: 'Больше восьми кубиков быть не может.' };
        const faces = ['att', 'def', 'morale', 'blank'];
        for (let i = 0; i < count; i++) {
            const face = faces.includes(cmd.face) ? cmd.face : 'any';
            dice.push(face === 'any' ? this.engine.rollDice(state, 1)[0] : face);
        }
        return { ok: true, count };
    }

    combatReroll(state, seat, side, cmd) {
        const c = state.combat;
        const dice = c.dice[side];
        const index = Number(cmd.index);
        if (!(index >= 0 && index < dice.length)) return { ok: false, error: 'Нет такого кубика.' };
        dice[index] = this.engine.rollDice(state, 1)[0];
        return { ok: true };
    }

    combatPlayCard(state, seat, side, cmd) {
        const c = state.combat;
        const hand = c.cards[side];
        const index = Number(cmd.index);
        if (!(index >= 0 && index < hand.hand.length)) return { ok: false, error: 'Нет такой карты.' };
        // The card is taken out of the hand and laid face down on the table.
        const name = hand.hand.splice(index, 1)[0];
        const card = FS_CATALOG.card('combat', state.players[seat].faction, name);
        c.staged = c.staged || { attacker: null, defender: null };
        c.staged[side] = { name, card, seat };
        hand.chosen = { name, card };
        this.engine.log(state, seat, state.players[seat].name + ' выбирает боевую карту и кладёт её закрытой.');
        // «The attacker and defender simultaneously choose one combat card from
        // their hands and place it facedown in front of them. The attacker
        // reveals and resolves his combat card. Then, the defender reveals and
        // resolves his combat card.» Neither card is turned over before both of
        // them lie on the table: a card revealed too early resolves while the
        // other player is still choosing, and his own card play would overwrite
        // the questions the first card is still asking.
        const otherSide = CombatSides.foe(side);
        const otherDone = !!c.staged[otherSide] || !(c.cards[otherSide].hand || []).length;
        if (otherDone) c.step = 'reveal';
        else c.step = side === 'attacker' ? 'choose-defender' : 'choose-attacker';
        this.advanceCombatSteps(state);
        return { ok: true, card: card || null, staged: true };
    }

    combatReveal(state) {
        const c = state.combat;
        if (!c || c.step !== 'reveal') return null;
        c.staged = c.staged || { attacker: null, defender: null };
        // The first card that was chosen and is not yet in play.
        const order = ['attacker', 'defender'];
        for (const side of order) {
            const staged = c.staged[side];
            if (staged) {
                c.staged[side] = null;
                const hand = c.cards[side];
                hand.chosen = null;
                hand.played.push({ name: staged.name, card: staged.card, side, round: c.round });
                this.engine.log(state, staged.seat, state.players[staged.seat].name
                    + ' вскрывает боевую карту «' + staged.name + '».');
                const steps = this.engine.cardSteps(state, staged.seat, staged.card);
                if (steps.length) {
                    c.nextStep = 'reveal';
                    c.step = 'effect';
                    // «A player can choose not to resolve one of his abilities»:
                    // the owner of the card decides about each of them.
                    this.engine.runEffects(state, staged.seat, steps, { kind: 'combat', ctx: { side }, optional: true });
                    return c.step;
                }
                return c.step;
            }
        }
        // Both cards are open: the damage of the round comes next.
        c.destroyedNow = 0;
        c.step = 'damage-attacker';
        this.advanceCombatSteps(state);
        return c.step;
    }

    combatSkipCard(state, seat, side) {
        void state; void seat; void side;
        return { ok: false, error: 'Боевую карту нельзя пропустить.' };
    }

    advanceCombatSteps(state) {
        const c = state.combat;
        if (!c) return null;
        for (let i = 0; i < 12; i++) {
            const before = c.step;
            // The reinforcement is asked only from the player who has the tokens.
            if (c.step === 'reinforce-attacker' && this.maxReinforce(state, c.attacker, 'attacker') <= 0) {
                c.step = 'reinforce-defender';
            }
            if (c.step === 'reinforce-defender' && this.maxReinforce(state, c.defender, 'defender') <= 0) {
                c.step = 'choose-attacker';
            }
            // «Вместо того, чтобы играть боевую карту из руки, вы можете сбросить
            // эту карту…» («Тактический гений»): the moment of the card play.
            if (c.step === 'choose-attacker' || c.step === 'choose-defender') {
                const hs = CombatSides.sideFromStep(c.step);
                const hseat = CombatSides.seatOf(c, hs);
                c.playHook = c.playHook || {};
                if (!c.playHook[hs]) {
                    c.playHook[hs] = true;
                    const was = c.step;
                    if (this.engine.maybeScheme(state, hseat, 'combat-play', { kind: 'combat', ctx: { side: hs } })) {
                        c.nextStep = was;
                        return null;
                    }
                }
            }
            if (c.step === 'choose-attacker' && !(c.cards.attacker.hand || []).length) c.step = 'choose-defender';
            if (c.step === 'choose-defender' && !(c.cards.defender.hand || []).length) {
                c.step = c.staged && c.staged.attacker ? 'reveal' : 'damage-attacker';
            }
            if (c.step === 'reveal') { this.combatReveal(state); if (!state.combat) return null; }
            if (c.step === 'damage-attacker' && this.combatDamageFor(state, 'attacker') <= 0) {
                c.damage.attacker = 0;
                c.applied = c.applied || {};
                c.applied.attacker = [];
                c.step = 'damage-defender';
            }
            if (c.step === 'damage-defender' && this.combatDamageFor(state, 'defender') <= 0) {
                c.damage.defender = 0;
                c.applied = c.applied || {};
                c.applied.defender = [];
                this.endDamageStep(state);
                if (!state.combat) return null;
            }
            // The effect of a card took the place of the end of the round: when
            // it is over the round ends for good.
            if (c.step === 'round-end') {
                this.endCombatRound(state);
                if (!state.combat) return null;
            }
            if (c.step === before) break;
        }
        return c.step;
    }

    skipEmptyChoose(state) {
        return this.advanceCombatSteps(state);
    }

    combatValues(state, side) {
        const c = state.combat;
        let dice = (c.dice[side] || []).filter(Boolean);
        // The card may make the attack dice of the enemy useless.
        if (c.ignoreFoeAtt && side === 'defender') dice = dice.filter(d => d !== 'att');
        const tokens = c.tokens[side];
        const played = c.cards[side].played;
        const seat = CombatSides.seatOf(c, side);
        let att = 0, def = 0, morale = 0;
        for (const d of dice) {
            if (d === 'att') att++;
            else if (d === 'def') def++;
            else if (d === 'morale') morale++;
        }
        att += tokens.att;
        def += tokens.def;
        for (const card of played) {
            if (!card.card) continue;
            att += card.card.icons.att;
            def += card.card.icons.def;
            morale += card.card.icons.morale;
        }
        // The printed morale of the unrouted units, the bastions and the
        // reinforcement tokens is the bulk of the combat morale (the rules,
        // "Morale"); only the icons on the cards and the dice add to it.
        morale += this.moraleFromPieces(state, c.system, c.pos, seat);
        morale += this.tokenMorale(state, side);
        return { att, def, morale };
    }

    combatValuesParts(state, side) {
        const c = state.combat;
        let dice = (c.dice[side] || []).filter(Boolean);
        if (c.ignoreFoeAtt && side === 'defender') dice = dice.filter(d => d !== 'att');
        const tokens = c.tokens[side];
        const played = c.cards[side].played;
        const seat = CombatSides.seatOf(c, side);
        const unitsMorale = this.moraleFromPieces(state, c.system, c.pos, seat)
            + this.tokenMorale(state, side);
        const parts = {
            att: { dice: 0, tokens: tokens.att || 0, cards: 0, units: 0, total: 0 },
            def: { dice: 0, tokens: tokens.def || 0, cards: 0, units: 0, total: 0 },
            morale: { dice: 0, tokens: 0, cards: 0, units: unitsMorale, total: 0 },
        };
        for (const d of dice) if (parts[d]) parts[d].dice++;
        for (const card of played) {
            if (!card.card || !card.card.icons) continue;
            for (const kind of ['att', 'def', 'morale']) parts[kind].cards += card.card.icons[kind] || 0;
        }
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
        const extraFoe = damage > 0 ? (c.extraDamageFoe || 0) : 0;
        if (c.extraDamageFoeSide) {
            // The extra damage belongs to the side other than the owner's.
            if (c.extraDamageFoeSide === side) damage += extraFoe;
            damage += (c.extraDamageBoth || 0);
        } else if (side === 'attacker') {
            damage += extraFoe + (c.extraDamageBoth || 0);
        } else {
            damage += (c.extraDamage || 0) + (c.extraDamageBoth || 0);
        }
        return damage;
    }

    damagePreview(state, side, targets, seat) {
        const c = state.combat;
        const owner = CombatSides.seatOf(c, side);
        const actor = seat === undefined ? owner : seat;
        const damage = this.combatDamageFor(state, side);
        const oneByOne = !!(c.damageOneByOne && side === 'defender');
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
                let health = def ? def.health : 1;
                if (c.healthBonus && unit.seat === actor) health += c.healthBonus;
                if (c.enemyHealth && unit.seat !== actor) health = Math.min(health, c.enemyHealth);
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
        for (const u of state.units) {
            if (u.seat !== owner || u.system !== c.system || u.area !== c.pos) continue;
            const def = this.engine.unitOf(state, u);
            if (!def) continue;
            out.push({ id: u.id, name: def.name, health: def.health, morale: def.morale,
                routed: !!u.routed, type: def.type, kind: 'unit' });
        }
        // Only a bastion has a health value: a city or a factory takes no damage.
        for (const s of state.structures) {
            if (s.seat !== owner || s.system !== c.system || s.area !== c.pos || s.type !== 'bastion') continue;
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
        if (damage <= 0) {
            c.damage[side] = 0;
            c.applied = c.applied || {};
            c.applied[side] = [];
            if (side === 'attacker') { c.step = 'damage-defender'; this.advanceCombatSteps(state); }
            else { this.endDamageStep(state); this.advanceCombatSteps(state); }
            return { ok: true, damage: 0, applied: [] };
        }
        // The schemes of the damage step are used before the damage.
        c.damageHook = c.damageHook || {};
        if (!c.damageHook[side]) {
            c.damageHook[side] = true;
            if (this.engine.maybeScheme(state, seat, 'damage', { kind: 'combat', ctx: { side } })) return { ok: true, pending: true };
        }
        // «Критический удар» belongs to the opponent of the player who assigns
        // the damage: its scheme is offered before the units are hit.
        c.criticalHook = c.criticalHook || {};
        if (!c.criticalHook[side]) {
            c.criticalHook[side] = true;
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
        c.damage[side] = damage;
        // The card may make the damage go one point at a time.
        const oneByOne = !!(c.damageOneByOne && side === 'defender');
        const targets = cmd.targets || [];
        // «Этот отряд или бастион получает урон первым» («Бронетанковый клин»):
        // the piece the card chose takes the damage before everything else.
        const firstHit = (c.damageFirst || []).find(x => x && x.side === side
            && (x.round === undefined || x.round === c.round) && able.has(x.id));
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
        const excessId = c.ignoreExcess && c.ignoreExcess.round === c.round
            && firstHit && c.ignoreExcess.id === firstHit.id ? c.ignoreExcess.id : null;
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
                let health = def ? def.health : 1;
                // The card may raise the health of the units or lower it.
                if (c.healthBonus && unit.seat === seat) health += c.healthBonus;
                if (c.enemyHealth && unit.seat !== seat) health = Math.min(health, c.enemyHealth);
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
                    const keep = (c.noRoute || []).some(x => {
                        const one = typeof x === 'number' ? { seat: x } : x;
                        if (one.seat !== unit.seat) return false;
                        if (one.round !== undefined && one.round !== c.round) return false;
                        return !one.kl || (def && (def.kl || 0) <= one.kl);
                    });
                    if (!keep) {
                        this.noteFallen(state, unit, false);
                        unit.routed = true;
                        unit.routedRound = c.round;
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
        c.applied = c.applied || {};
        c.applied[side] = applied;
        if (side === 'attacker') { c.step = 'damage-defender'; this.advanceCombatSteps(state); }
        else { this.endDamageStep(state); this.advanceCombatSteps(state); }
        return { ok: true, damage, applied };
    }

    endDamageStep(state) {
        const c = state.combat;
        if (!c) return;
        if (c.repeatDamage && !c.damageRepeated) {
            c.damageRepeated = true;
            c.destroyedNow = 0;
            c.damageHook = {};
            c.damageEndHook = null;
            c.damage = { attacker: 0, defender: 0 };
            c.applied = {};
            c.step = 'damage-attacker';
            this.engine.log(state, -1, 'Шаг нанесения повреждений повторяется.');
            return;
        }
        // «в конце шага нанесения повреждений … деморализовать 1 отряд
        // противника» («Совращённый Хаосом»): both combatants may hold a plan.
        if (!c.damageEndHook) c.damageEndHook = { next: 0 };
        const ends = [c.attacker, c.defender];
        while (c.damageEndHook.next < ends.length) {
            const seat = ends[c.damageEndHook.next++];
            const side = CombatSides.sideOf(c, seat);
            if (this.engine.maybeScheme(state, seat, 'damage-end', { kind: 'combat', ctx: { side } })) {
                c.damageEndResume = true;
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
        c.resurrectCandidates = c.resurrectCandidates || [];
        if (c.resurrectCandidates.some(x => x.id === unit.id)) return;
        c.resurrectCandidates.push({
            unit: unit.unit, def: def.id, id: unit.id, seat: unit.seat,
            system: unit.system, pos: unit.area, destroyed,
        });
    }

    applyResurrect(state) {
        const c = state.combat;
        const pending = c && (c.resurrectCandidates || [])[0];
        if (!pending) return;
        c.resurrectCandidates = [];
        c.resurrectPlan = [];
        const alive = state.units.find(u => u.id === pending.id);
        if (alive) {
            alive.routed = false;
            alive.routedRound = 0;
        } else if (pending.destroyed) {
            const p = state.players[pending.seat];
            if ((p.supply.units[pending.def] || 0) > 0) p.supply.units[pending.def] -= 1;
            this.engine.addUnit(state, pending.seat, pending.def, pending.system, pending.pos);
        }
        this.engine.log(state, pending.seat, state.players[pending.seat].name + ': «Сфера воскрешения» возвращает отряд.');
    }

    schemeResurrect(state) {
        const c = state.combat;
        if (!c || !(c.resurrectCandidates || []).length) return false;
        const candidate = c.resurrectCandidates[0];
        if (c.resurrectAsked === candidate.seat) return false;
        const scheme = this.engine.schemesOf(state, candidate.seat)
            .find(x => (x.steps || []).some(y => y.op === 'resurrect'));
        if (!scheme) { c.resurrectCandidates = []; return false; }
        c.resurrectAsked = candidate.seat;
        c.step = 'effect';
        c.nextStep = 'round-end';
        const side = CombatSides.sideOf(c, candidate.seat);
        this.engine.runEffects(state, candidate.seat, [{ op: 'resurrectOffer' }], { kind: 'combat', ctx: { side } });
        return true;
    }

    destroyRoutedFoe(state) {
        const c = state.combat;
        const d = c && c.destroyRoutedFoe;
        if (!d || d.done) return false;
        if (d.round !== c.round) { c.destroyRoutedFoe = null; return false; }
        const foeSide = d.seat === c.attacker ? 'defender' : 'attacker';
        const foeSeat = CombatSides.seatOf(c, foeSide);
        // «если в этом раунде боя отряд противника становится деморализованным» —
        // the units that were routed in this round.
        const units = state.units.filter(u => u.seat === foeSeat
            && u.system === c.system && u.area === c.pos && u.routed
            && (u.routedRound === undefined || u.routedRound === c.round));
        d.done = true;
        if (!units.length) return false;
        const avoid = d.avoid || { kind: 'def', n: 1 };
        const steps = units.map(u => ({
            op: 'avoidDestroy',
            unit: u.id,
            avoid,
            ability: 'деморализованный отряд уничтожается; можно избежать уничтожения за 1 `def. cube`',
        }));
        c.step = 'effect';
        c.nextStep = 'round-end';
        this.engine.runEffects(state, d.seat, steps, { kind: 'combat', ctx: { side: CombatSides.sideOf(c, d.seat) } });
        return true;
    }

    deferredDamage(state) {
        const c = state.combat;
        const d = c && c.deferDamage;
        if (!d || d.done) return false;
        d.done = true;
        const foeSeat = d.seat === c.attacker ? c.defender : c.attacker;
        const targets = state.units.filter(u => u.seat === foeSeat && u.system === c.system && u.area === c.pos);
        // «получите по 1 материалу за каждый уничтоженный отряд» («Рой
        // потрошителей») needs no piece of the opponent to aim at.
        const needsTarget = (d.steps || []).some(x => x && x.op !== 'gainMateriel');
        if (needsTarget && !targets.length) return false;
        c.step = 'effect';
        c.nextStep = 'round-end';
        this.engine.runEffects(state, d.seat, d.steps, {
            kind: 'combat', ctx: { side: CombatSides.sideOf(c, d.seat) },
        });
        return true;
    }

    endCombatRound(state) {
        const c = state.combat;
        // «если ни один из ваших отрядов не отступил во время этого раунда»
        // («Притворное отступление»): the answer is known only now, and the
        // combat tokens of this round are about to be discarded — the reward
        // belongs to the next round.
        const noRet = (c.endRoundNoRetreat || []).find(x => x && x.round === c.round && !x.fired);
        if (noRet) {
            noRet.fired = true;
            const clean = !c.retreated || c.retreated[noRet.seat] !== c.round;
            if (clean) {
                c.laterTokens = c.laterTokens || [];
                c.laterTokens.push({ side: noRet.side, kind: noRet.kind, n: noRet.n, round: c.round + 1 });
                this.engine.log(state, noRet.seat, state.players[noRet.seat].name
                    + ' не отступал: ' + noRet.n + ' жетон(ов) в следующем раунде.');
            }
        }
        // «Если ваши отряды или бастионы не получат урона в конце этого раунда,
        // ваш противник отступает одним из своих отрядов» («Фаланга монолита»).
        c.noDamageRetreat = (c.noDamageRetreat || []).filter(x => x.round === c.round || !x.fired);
        const pendingRetreat = (c.noDamageRetreat || []).filter(x => x.round === c.round && !x.fired);
        if (pendingRetreat.length) {
            const entry = pendingRetreat[0];
            entry.fired = true;
            const side = CombatSides.sideOf(c, entry.seat);
            // «если ваши отряды или бастионы не получат урона в конце этого
            // раунда»: the damage the card's owner placed on his own pieces.
            const damage = (c.damage && c.damage[side]) || 0;
            if (damage === 0) {
                c.step = 'effect';
                c.nextStep = 'round-end';
                this.engine.runEffects(state, entry.seat, entry.steps, { kind: 'combat', ctx: { side } });
                return;
            }
        }
        // «В конце этого раунда … переместить 1 из ваших отрядов из соседней
        // области в эту» («Кауйон»): the move happens before the tokens of the
        // round are discarded, and the dice it gives stay for the damage step.
        const endPlan = (c.endRoundPlans || []).find(x => x && x.round === c.round && !x.fired);
        if (endPlan) {
            endPlan.fired = true;
            c.step = 'effect';
            c.nextStep = 'round-end';
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
        const keptOf = s => {
            const k = (c.keepTokens || {})[s];
            return k && k.round === c.round ? k : null;
        };
        const keepSide = (s, kind) => {
            const k = keptOf(s);
            return k && k[kind] ? ((c.tokens[s] && c.tokens[s][kind]) || 0) : 0;
        };
        c.tokens = {
            attacker: { att: keepSide('attacker', 'att'), def: keepSide('attacker', 'def') },
            defender: { att: keepSide('defender', 'att'), def: keepSide('defender', 'def') },
        };
        c.keepTokens = null;
        // The effects printed «during this round of combat» end here: the
        // health bonus, the routing ban and the chosen first target must not
        // leak into the next execution round.
        c.enemyHealth = null;
        c.healthBonus = null;
        c.noRoute = null;
        c.damageFirst = null;
        c.retreatInstead = null;
        c.ignoreExcess = null;
        // The card may destroy the units that became routed.
        if (c.destroyRouted) {
            for (const u of state.units.slice()) {
                if (u.routed && u.system === c.system && u.area === c.pos) {
                    this.engine.log(state, c.attacker, 'Деморализованный отряд уничтожен.');
                    this.engine.destroyUnit(state, u);
                }
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
        c.round++;
        if (c.round > (c.maxRounds || 3)) { this.finishCombat(state); return; }
        // «получите 2 `att. token` в следующем раунде боя» («Крылатый ужас»):
        // the tokens the card promised come from the supply now. «За каждого
        // вашего уничтоженного или деморализованного в этом раунде юнита
        // получите 1 `def. token`» («Выводок термаганов») counts the losses of
        // the round that has just ended: one token for each of them.
        const lostOf = seat => {
            const snap = (c.roundUnits || {})[seat] || [];
            let n = 0;
            for (const s of snap) {
                const now = state.units.find(u => u.id === s.id);
                if (!now) n++;
                else if (!s.routed && now.routed) n++;
            }
            return n;
        };
        const later = (c.laterTokens || []).filter(x => x.round === c.round);
        c.laterTokens = (c.laterTokens || []).filter(x => x.round !== c.round);
        for (const one of later) {
            const seat = CombatSides.seatOf(c, one.side);
            const n = one.per === 'lostRound' ? (one.n || 1) * lostOf(seat) : (one.n || 1);
            if (n <= 0) continue;
            c.tokens[one.side][one.kind] = (c.tokens[one.side][one.kind] || 0) + n;
            this.engine.log(state, seat, state.players[seat].name + ' получает ' + n
                + ' жетон(ов) ' + (one.kind === 'att' ? 'атаки' : 'обороны') + '.');
        }
        c.roundUnits = this.rosterOfRound(state, c);
        c.staged = { attacker: null, defender: null };
        for (const side of ['attacker', 'defender']) c.cards[side].chosen = null;
        // The effects that belonged to the previous round are over.
        if (c.destroyRoutedFoe && c.destroyRoutedFoe.round !== c.round) c.destroyRoutedFoe = null;
        c.resurrectPlan = (c.resurrectPlan || []).filter(x => x.round === c.round);
        c.restoreFallen = (c.restoreFallen || []).filter(x => x.round === c.round && !x.done);
        c.endRoundPlans = (c.endRoundPlans || []).filter(x => x.round === c.round);
        c.endRoundNoRetreat = (c.endRoundNoRetreat || []).filter(x => x.round === c.round);
        c.fallenThisStep = [];
        c.damageHook = {};
        c.criticalHook = {};
        c.damageEndHook = null;
        c.damageEndResume = false;
        c.resurrectCandidates = [];
        c.resurrectAsked = null;
        c.noDamageRetreat = (c.noDamageRetreat || []).filter(x => x.round === c.round);
        c.step = 'choose-attacker';
        this.advanceCombatSteps(state);
        // The schemes of the start of the round.
        this.engine.maybeScheme(state, c.attacker, 'round', { kind: 'combat', ctx: { side: 'attacker' } });
        c.damage = { attacker: 0, defender: 0 };
    }

    rosterOfRound(state, c) {
        const one = seat => state.units.filter(u => u.seat === seat)
            .map(u => ({ id: u.id, routed: !!u.routed }));
        return { attacker: one(c.attacker), defender: one(c.defender) };
    }

    applyDamageStartTokens(state) {
        const c = state.combat;
        if (!c || !c.damageStartTokens || c.damageStartRound === c.round) return;
        c.damageStartRound = c.round;
        for (const one of c.damageStartTokens) {
            if (one.round !== undefined && one.round !== c.round) continue;
            const side = one.side;
            const kind = one.kind || 'att';
            const n = one.n || 1;
            c.tokens[side][kind] = Math.max(0, (c.tokens[side][kind] || 0) - n);
            const seat = CombatSides.seatOf(c, side);
            this.engine.log(state, seat, state.players[seat].name + ' теряет ' + n
                + ' жетон(ов) атаки в начале шага повреждений.');
        }
        c.damageStartTokens = [];
    }

    noteFallen(state, unit, destroyed) {
        const c = state.combat;
        if (!c || unit.routed) return;
        const def = this.engine.unitOf(state, unit);
        if (!def) return;
        c.fallenThisStep = c.fallenThisStep || [];
        if (c.fallenThisStep.some(x => x.id === unit.id)) return;
        c.fallenThisStep.push({
            id: unit.id, def: def.id, seat: unit.seat,
            system: unit.system, pos: unit.area,
            destroyed: !!destroyed, kl: def.kl || 0,
        });
    }

    retreatInsteadOfDestroy(state, unit) {
        const c = state.combat;
        const plan = c && c.retreatInstead;
        if (!plan || plan.seat !== unit.seat || plan.round !== c.round || plan.used) return false;
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
        this.noteMove(state, unit.seat, unit, t);
        unit.system = t.system;
        unit.area = t.pos;
        unit.routed = true;
        this.markRetreat(state, unit.seat);
        this.engine.trimArea(state, unit.seat, t.system, t.pos);
        this.engine.log(state, unit.seat, state.players[unit.seat].name
            + ': отряд отступает вместо уничтожения.');
        return true;
    }

    markRetreat(state, seat) {
        const c = state.combat;
        if (!c) return;
        c.retreated = c.retreated || {};
        c.retreated[seat] = c.round;
    }

    offerFallenRestore(state) {
        const c = state.combat;
        if (!c) return false;
        const plans = (c.restoreFallen || []).filter(x => x.round === c.round && !x.asked && !x.done);
        if (!plans.length) return false;
        const plan = plans[0];
        const candidates = (c.fallenThisStep || [])
            .filter(x => x.seat === plan.seat && (x.kl || 0) <= plan.maxKl);
        if (!candidates.length) return false;
        plan.asked = true;
        plan.candidates = candidates.slice();
        c.step = 'effect';
        c.nextStep = 'round-end';
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
            c.damageHook[side] = true;
            c.criticalHook[side] = true;
            c.damageResume = { seat, side, cmd: { targets: targets.slice() } };
            c.step = 'effect';
            c.nextStep = 'effect';
            state.pending = {
                seat: p.seat, answerSeat: p.seat, kind: 'scheme', steps: [], index: 0,
                question: {
                    kind: 'scheme', who: p.seat, options: schemes.map(x => x.name),
                    text: 'Сбросить карту: ' + schemes.map(x => '«' + x.name + '»').join(', ') + '?',
                },
                ctx: { kind: 'combat', ctx: { side, damageTargets }, schemes },
            };
            return true;
        }
        return false;
    }

    resumeDamage(state) {
        const c = state.combat;
        const d = c && c.damageResume;
        if (!d) return;
        c.damageResume = null;
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
        c.winner = attackerWins ? 'attacker' : 'defender';
        c.morale = { attacker: attMorale, defender: defMorale };
        const loser = attackerWins ? c.defender : c.attacker;
        const winner = attackerWins ? c.attacker : c.defender;
        this.engine.log(state, winner, 'Бой ' + (wiped ? 'закончен' : 'выигран') + ': мораль '
            + (attackerWins ? attMorale : defMorale) + ' против ' + (attackerWins ? defMorale : attMorale) + '.');
        // Only the attacker takes the structures of the world (the rules).
        if (attackerWins) this.captureStructures(state, c.system, c.pos, c.attacker, c.defender);
        c.loser = loser;
        c.step = 'retreat';
        // A player whose troops all died has nothing to retreat: the combat ends
        // without asking where the dead should go.
        const noTroops = !state.units.some(u => u.seat === loser && u.system === c.system && u.area === c.pos);
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
            for (const card of c.cards[side].played) deck.add(card.name);
            for (const name of (c.cards[side].hand || [])) deck.add(name);
            const staged = c.staged && c.staged[side];
            if (staged && !c.cards[side].played.some(x => x.name === staged.name)) {
                deck.add(staged.name);
            }
            c.cards[side].played = [];
            c.cards[side].hand = [];
            deck.shuffle();
            // The reinforcement tokens of the combat go back to the supply here, at
            // the clean-up of the combat.
            this.engine.player(state, seat).addAsset('reinforcement',
                c.reinforceUsed && c.reinforceUsed[side] ? c.reinforceUsed[side] : 0);
            if (c.reinforceUsed) c.reinforceUsed[side] = 0;
        }
        if (noTroops) this.combatRetreat(state, loser, attackerWins ? 'defender' : 'attacker', {});
    }

    retreatTargets(state, seat) {
        const c = state.combat;
        if (!c) return [];
        const side = CombatSides.sideOf(c, seat);
        const units = state.units.filter(u => u.seat === seat && u.system === c.system && u.area === c.pos);
        if (!units.length) return [];
        const defs = units.map(u => this.engine.unitOf(state, u)).filter(Boolean);
        const ground = defs.length ? defs[0].type === 'ground' : true;
        // The areas the attacking units moved from to start the combat.
        const came = c.attackerFrom || [];
        // «If the units did not move into the contested area via an Advance
        // Order, they must move to an area that at least one unit moved from to
        // start the combat.» Otherwise the general retreat rules apply.
        const free = side === 'attacker' && c.viaAdvance;
        const systems = [c.system].concat(this.engine.neighbors(state, c.system));
        const out = [];
        for (const sid of systems) {
            const sys = this.engine.system(state, sid);
            if (!sys) continue;
            for (const area of sys.areas) {
                if (!!area.world !== ground) continue;
                if (sid === c.system && area.pos === c.pos) continue;
                const where = this.engine.areaState(state, seat, sid, area.pos);
                if (where === 'contested' || where === 'enemy') continue;
                if (side === 'defender') {
                    // «The area the retreating units move to must either be in
                    // the active system or in a system adjacent to the active
                    // system. If attacking units moved from an adjacent system,
                    // the defender's units cannot retreat to that system.
                    // Defending units cannot retreat to an area from which
                    // attacking units moved from.»
                    if (came.some(x => x.system === sid)) continue;
                    if (came.some(x => x.system === sid && x.pos === area.pos)) continue;
                } else if (!free) {
                    // Not an Advance: back to an area a unit moved from. Without
                    // such an area the units cannot retreat and are destroyed.
                    if (!came.some(x => x.system === sid && x.pos === area.pos)) continue;
                }
                // A ground unit walks a legal path to the area it retreats to.
                if (ground && !this.engine.pathExists(state, seat, c.system, c.pos, sid, area.pos)) continue;
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
        if (c.loser !== seat) return { ok: false, error: 'Отступает проигравший.' };
        const units = state.units.filter(u => u.seat === seat && u.system === c.system && u.area === c.pos);
        const targets = this.retreatTargets(state, seat);
        let target = null;
        if (cmd && cmd.target) {
            target = targets.find(t => t.system === cmd.target.system && t.pos === cmd.target.pos) || null;
            if (!target) return { ok: false, error: 'Отступать в эту область нельзя.' };
        } else if (targets.length) {
            return { ok: false, error: 'Выберите, куда отступить.' };
        }
        for (const u of units) {
            if (target) { u.system = target.system; u.area = target.pos; }
            u.routed = true;
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
            state.order = null;
            return { ok: true };
        }
        // The order that started the combat is over.
        this.engine.finishOrder(state, seat);
        return { ok: true };
    }

}
