// FSRulesAdvance.js — the advance order: the two movement steps (ships, then
// ground units), the frozen routes, the single battle, the orbital strike.

class AdvanceRules {
    /** @param {any} engine the rules facade (FSRules.js) */
    constructor(engine) {
        this.engine = engine;
    }

    movableUnits(state, seat) {
        const order = state.order;
        if (!order || order.order !== 'advance') return [];
        const sys = order.system;
        const from = new Set([sys].concat(this.engine.neighbors(state, sys)));
        const march = MarchPlan.of(order);
        const step = march.step;
        let units = state.units.filter(u => {
            if (u.seat !== seat || !from.has(u.system) || u.routed || march.hasMoved(u.id)) return false;
            const def = this.engine.unitOf(state, u);
            if (!def) return false;
            // The ships move in the first step, the ground units in the second one.
            return step === 'ships' ? def.type === 'ship' : def.type === 'ground';
        });
        // «Мобилизированные охотники»: the extra advance uses one KL0/1 unit
        // that was ALREADY in the active system; that same unit then sits out
        // the main advance.
        if (order.preAdvance) {
            units = units.filter(u => {
                if (u.system !== order.system) return false;
                const d = this.engine.unitOf(state, u);
                return !!d && (d.kl || 0) <= 1;
            });
        }
        if (march.excludedUnit) units = units.filter(u => u.id !== march.excludedUnit);
        // «Быстрый ответ»: only the units that are ALREADY in the chosen
        // system may take part in the limited advance.
        if (order.quickResponse) units = units.filter(u => u.system === order.system);
        // The frozen routes decide: a unit without a road does not count.
        if (march.route) return units.filter(u => march.hasRoad(u.id));
        return units;
    }

    moveAllowed(state, seat, unit, target) {
        const order = state.order;
        const def = this.engine.unitOf(state, unit);
        if (!def) return { ok: false, error: 'Неизвестный отряд.' };
        // The unit of the extra advance cannot march twice in the same order.
        const march = MarchPlan.of(order);
        if (march && march.excludedUnit === unit.id) {
            return { ok: false, error: 'Этот отряд уже участвовал в дополнительном приказе продвижения.' };
        }
        if (order && order.preAdvance) {
            if (unit.system !== order.system) {
                return { ok: false, error: 'Дополнительный приказ использует отряд из активной системы.' };
            }
            if ((def.kl || 0) > 1) {
                return { ok: false, error: 'Дополнительный приказ использует отряд с командным уровнем 0 или 1.' };
            }
        }
        // «Быстрый ответ»: only the units of the chosen system march, and only
        // into friendly or uncontrolled areas.
        if (order && order.quickResponse) {
            if (unit.system !== order.system) {
                return { ok: false, error: 'Ограниченное продвижение — только отряды этой системы.' };
            }
            const ctrl = this.engine.control(state, seat, target.system, target.pos);
            // `control` is read from the mover's point of view: an area held
            // only by another player looks like «none» to him. Such an area is
            // enemy-controlled, not uncontrolled — check the other seats too.
            const foreign = state.units.some(u => u.seat !== seat
                && u.system === target.system && u.area === target.pos)
                || state.structures.some(s2 => s2.seat !== seat
                    && s2.system === target.system && s2.area === target.pos);
            if (foreign || (ctrl !== 'friendly' && ctrl !== 'none')) {
                return { ok: false, error: 'Продвижение только в дружественные или никем не контролируемые области.' };
            }
        }
        const sys = this.engine.system(state, target.system);
        const area = this.engine.area(sys, target.pos);
        if (!area) return { ok: false, error: 'Нет такой области.' };
        // The destination must be in the active system.
        if (target.system !== order.system) return { ok: false, error: 'Отряд может двигаться только в активную систему.' };
        // Ships stay in the voids, ground units stand on the worlds.
        if (def.type === 'ship' && area.world) return { ok: false, error: 'Корабль может стоять только в пустоте.' };
        if (def.type === 'ground' && !area.world) return { ok: false, error: 'Наземный отряд не может стоять в пустоте.' };
        // The unit may come from the active system or from one adjacent system.
        const from = unit.system;
        const adjacent = from === order.system || this.engine.neighbors(state, order.system).includes(from);
        if (!adjacent) return { ok: false, error: 'Отряд слишком далеко.' };
        // A warp storm on the edge blocks the way — unless the order says that
        // the ships may pass through the storms.
        if (from !== target.system && this.engine.stormOn(state, from, target.system)
            && !(state.order.unitsThroughStorms
                || (def.type === 'ship' && state.order.shipsThroughStorms))) {
            return { ok: false, error: 'Варп-шторм преграждает путь.' };
        }
        // The movement may go over the capacity of an area, but never above five
        // units: the rules cap the end of the movement at five models.
        if (!this.engine.hasRoom(state, target.system, target.pos, seat, 1)) {
            return { ok: false, error: this.engine.unitLimitText() };
        }
        // Ground units need a legal path through the worlds they already hold:
        // a neutral world stops the march. The path is measured from where the
        // unit stood when the movement began — inside the active system too,
        // where the march is not limited to the neighbouring worlds
        // («Ground units on a world adjacent to the destination world always
        // have a legal movement path»).
        if (def.type === 'ground') {
            if (!this.engine.pathExists(state, seat, unit.system, unit.area, target.system, target.pos,
                { storms: !!(order && order.unitsThroughStorms) })) {
                return { ok: false, error: 'Нет законного пути через свои миры до этого мира.' };
            }
        }
        return { ok: true };
    }

    canMove(state, seat, unit, target) {
        const order = state.order;
        if (!order || order.order !== 'advance') return { ok: false, error: 'Это не приказ наступления.' };
        if (unit.seat !== seat) return { ok: false, error: 'Это не ваш отряд.' };
        if (unit.routed) return { ok: false, error: 'Деморализованный отряд не двигается.' };
        // The step of the movement: the ships first, then the ground units.
        const march = MarchPlan.of(order);
        const def0 = this.engine.unitOf(state, unit);
        const step = march.step;
        if (def0 && step === 'ships' && def0.type !== 'ship') {
            return { ok: false, error: 'Сначала двигаются корабли, затем наземные войска.' };
        }
        if (def0 && step === 'ground' && def0.type !== 'ground') {
            return { ok: false, error: 'Корабли уже отлетали: теперь двигаются только наземные войска.' };
        }
        if (march.hasMoved(unit.id)) return { ok: false, error: 'Этот отряд уже сдвинулся в этом приказе.' };
        const route = march.roadsOf(unit.id);
        if (route) {
            const found = route.some(t => t.system === target.system && t.pos === target.pos);
            if (!found) {
                const same = route.length;
                return { ok: false, error: same ? 'Этот мир не был доступен в начале движения.' : 'Этому отряду некуда идти.' };
            }
            return { ok: true };
        }
        return this.moveAllowed(state, seat, unit, target);
    }

    advanceRoutes(state, seat, kind) {
        const order = state.order;
        const out = {};
        for (const unit of state.units) {
            if (unit.seat !== seat || unit.routed) continue;
            const def = this.engine.unitOf(state, unit);
            if (!def) continue;
            if (kind && def.type !== kind) continue;
            const from = unit.system;
            if (!(from === order.system || this.engine.neighbors(state, order.system).includes(from))) continue;
            const list = [];
            for (const area of this.engine.system(state, order.system).areas) {
                if (this.moveAllowed(state, seat, unit, { system: order.system, pos: area.pos }).ok) {
                    list.push({ system: order.system, pos: area.pos });
                }
            }
            if (list.length) out[unit.id] = list;
        }
        return out;
    }

    cmdMoveUnits(state, seat, cmd) {
        const order = state.order;
        if (!order || order.order !== 'advance') return { ok: false, error: 'Это не приказ наступления.' };
        if (order.seat !== seat) return { ok: false, error: 'Сейчас ход другого игрока.' };
        const march = MarchPlan.of(order);
        const moves = cmd.moves || [];
        // The order may limit the number of the units that move.
        if (march.moveLimit && moves.length > march.moveLimit) {
            return { ok: false, error: 'Можно переместить не больше ' + march.moveLimit + ' отрядов.' };
        }
        // «Мобилизированные охотники»: ONE unit for the whole extra advance,
        // not one ship and then one ground unit.
        if (order.preAdvance && moves.length + march.moved.length > 1) {
            return { ok: false, error: 'Дополнительный приказ использует только 1 отряд.' };
        }
        // «… если хотя бы один из этих отрядов — Гвардеец» («Адептус Астрономика»).
        if (march.mustInclude && moves.length) {
            const ok = moves.some(m => {
                const u = state.units.find(x => x.id === m.unit);
                const def = u ? this.engine.unitOf(state, u) : null;
                return !!def && FS_EFFECTS.sameName(def.name, march.mustInclude);
            });
            if (!ok) return { ok: false, error: 'Среди перемещаемых отрядов должен быть ' + march.mustInclude + '.' };
        }
        // Every move is checked before any of them is done: the movement of the
        // ground units is simultaneous.
        const plan = [];
        const temp = state.units.map(u => ({ ...u }));
        for (const m of moves) {
            const unit = temp.find(u => u.id === m.unit);
            if (!unit) return { ok: false, error: 'Нет такого отряда.' };
            const check = this.canMove(state, seat, unit, { system: m.system, pos: m.pos });
            if (!check.ok) return check;
            const from = unit.system;
            const fromArea = unit.area;
            const def = this.engine.unitOf(state, unit);
            // A copy of the state: the plan is measured, nothing is recorded.
            this.engine.board(state).placeUnit(unit, m);
            plan.push({ id: unit.id, from, fromArea, type: def ? def.type : 'ground', system: m.system, pos: m.pos });
        }
        // «перемещение из 1 области» («Департаменто муниторум»).
        if (order.moveAreaLimit) {
            const src = new Set(plan.map(m => m.from + ':' + m.fromArea));
            if (src.size > order.moveAreaLimit) {
                return { ok: false, error: 'Перемещение ограничено ' + order.moveAreaLimit + ' областью.' };
            }
        }
        // No area may end the movement with more than five of the player's units.
        // A plan entry names its target; a unit that stays put names its own
        // system and area (the board's field is «area», not «pos»).
        const totals = new Map();
        for (const u of state.units) {
            if (u.seat !== seat) continue;
            const p2 = plan.find(m => m.id === u.id);
            const key = p2 ? p2.system + ':' + p2.pos : u.system + ':' + u.area;
            totals.set(key, (totals.get(key) || 0) + 1);
        }
        for (const [key, n] of totals) {
            // The same hard limit the one move above asks, counted for the
            // whole plan: five units of one player in one area.
            const [systemId, pos] = key.split(':');
            if (n - this.engine.unitLimit(state, systemId, pos, seat) > 0) {
                return { ok: false, error: this.engine.unitLimitText() };
            }
        }
        // The ground units may come into the active system from one neighbour only,
        // and a ship that came from a neighbour closes the way for the others. The
        // rule holds for the whole order, not only for one command.
        const ground = plan.filter(m => m.type === 'ground' && m.from !== order.system);
        const ships = plan.filter(m => m.type === 'ship' && m.from !== order.system);
        const ways = order.ways = order.ways || { ground: null, ship: null };
        const froms = new Set();
        for (const m of ground) froms.add(m.from);
        for (const m of ships) froms.add(m.from);
        if (froms.size > 1) {
            return { ok: false, error: 'Наземные отряды могут прийти в активную систему только из одной соседней системы.' };
        }
        if (froms.size === 1) {
            const way = [...froms][0];
            if (ground.length && ways.ground && ways.ground !== way) {
                return { ok: false, error: 'Наземные отряды уже пришли из другой системы.' };
            }
            if (ships.length && ways.ship && ways.ship !== way) {
                return { ok: false, error: 'Корабли уже пришли из другой системы.' };
            }
            if (ground.length && ways.ship && ways.ship !== way) {
                return { ok: false, error: 'Корабли пришли из другой системы: наземные отряды не могут прийти из этой.' };
            }
            if (ships.length && ways.ground && ways.ground !== way) {
                return { ok: false, error: 'Наземные отряды пришли из другой системы: корабли не могут прийти из этой.' };
            }
        }
        // Only one area may become contested during the whole order: the check is
        // done on a copy, before anything is changed in the game.
        const before = new Set(this.contestedAreas(state).map(a => a.system + ':' + a.pos));
        const tempUnits = state.units.map(u => ({ ...u }));
        // The same movement, on the copy the check is measured against.
        const tempState = { ...state, units: tempUnits };
        for (const m of plan) {
            const unit = tempUnits.find(u => u.id === m.id);
            this.engine.board(tempState).placeUnit(unit, m);
        }
        const fresh = this.contestedAreas(tempState).filter(a => !before.has(a.system + ':' + a.pos));
        if (fresh.length > 1) return { ok: false, error: 'Спорной может стать только одна область.' };
        if (fresh.length === 1) {
            const key = fresh[0].system + ':' + fresh[0].pos;
            if (!march.contest(key)) {
                return { ok: false, error: 'Спорной может стать только одна область.' };
            }
        }
        // The ways of this command are remembered for the rest of the order.
        if (froms.size === 1) {
            const way = [...froms][0];
            if (ground.length) ways.ground = way;
            if (ships.length) ways.ship = way;
        }
        for (const m of plan) {
            const unit = state.units.find(u => u.id === m.id);
            // The step of the march: the trace of it (a combat judges the
            // retreats by it) and the new area are one movement of the board.
            this.engine.board(state).moveUnit(unit, m, { seat });
        }
        // «Занято — захвачено»: мир, куда вошли наземные отряды и где нет
        // бойцов противника (ни отрядов, ни бастионов), считается захваченным:
        // постройки противника переходят новому владельцу, отпор возможен
        // только в бою. Ручная откатка марша (Esc) вернёт постройки прежнему
        // владельцу — смета захвата хранится в записи шага.
        const captures = {};
        for (const m of plan) {
            if (m.type !== 'ground') continue;
            const sys = this.engine.system(state, m.system);
            const area = this.engine.area(sys, m.pos);
            if (!area || !area.world) continue;
            const war = this.engine.warSeatsAt(state, m.system, m.pos);
            let hostile = false;
            for (const s of war) if (s !== seat) { hostile = true; break; }
            if (hostile) continue;
            const losers = new Set();
            for (const s of state.structures) {
                if (s.system === m.system && s.area === m.pos && s.seat !== seat) losers.add(s.seat);
            }
            for (const loser of losers) {
                for (const st of this.engine.captureStructures(state, m.system, m.pos, seat, loser)) {
                    (captures[m.id] = captures[m.id] || []).push({ id: st.id, from: loser });
                }
            }
        }
        if (Object.keys(captures).length) {
            const n = new Set(Object.values(captures).flat().map(c => c.id)).size;
            this.engine.log(state, seat, state.players[seat].name + ' захватывает постройки противника: ' + n + '.');
        }
        // "Крестный ход": the passage through an uncontrolled world is paid for by
        // the unit, not by the area; the ordinary path is tried first.
        if (order.uncontrolled) {
            for (const m of plan) {
                if (!this.engine.pathExists(state, seat, m.from, m.fromArea, m.system, m.pos, { uncontrolled: false })) {
                    march.useUncontrolled();
                    m.usedUncontrolled = true;
                }
            }
        }
        // The units that marched this time do not march again in the same order.
        march.addMoved(plan.map(m => m.id));
        if (order.preAdvance && plan.length) march.setPreAdvanceUnit(plan[0].id);
        // The step is remembered: the player may take it back with Esc. Each step
        // knows whose march it was, so the roll-back can return to the step of the
        // order it belongs to (ships or ground units).
        const kinds = new Map();
        for (const m of plan) {
            const u = state.units.find(x => x.id === m.id);
            const def = u ? this.engine.unitOf(state, u) : null;
            kinds.set(m.id, def && def.type === 'ship' ? 'ship' : 'ground');
        }
        const stepContested = march.contested;
        march.addStep(plan.map(m => ({
            id: m.id, fromSystem: m.from, fromArea: m.fromArea, usedUncontrolled: !!m.usedUncontrolled,
            kind: kinds.get(m.id) || 'ground', contested: stepContested, captured: captures[m.id] || [],
        })));
        return { ok: true };
    }

    cmdUndoMove(state, seat) {
        const order = this.engine.orderOf(state, seat, 'advance');
        if (!order) return { ok: false, error: 'Нечего отменять.' };
        // The last march may be taken back while the movement runs — and also
        // right after the combat has started: nothing has happened in the battle
        // yet (no reinforcements, no cards, no dice).
        if (order.phase === 'combat') {
            const c = state.combat;
            const fresh = c && c.round === 1 && c.step === 'reinforce-attacker'
                && !c.reinforce.attacker && !c.reinforce.defender
                && !c.cards.attacker.played.length && !c.cards.defender.played.length
                && c.damage.attacker === 0 && c.damage.defender === 0;
            if (!fresh) return { ok: false, error: 'Бой уже начался: отменить движение нельзя.' };
            // The hands go back to the decks and the battle is cancelled.
            for (const side of ['attacker', 'defender']) {
                const combatSeat = c[side];
                // The hand goes back on top of the deck: the same account of
                // the deck the purchase and the clean-up use.
                const player = this.engine.player(state, combatSeat);
                player.combatHand.returnAll(true);
                player.combatDeck.shuffle();
            }
            state.combat = null;
            order.phase = 'move';
            MarchPlan.of(order).setStep('ground');
        }
        if (order.phase !== 'move') return { ok: false, error: 'Движение уже закончено.' };
        const march = MarchPlan.of(order);
        const last = march.popStep();
        if (!last) return { ok: false, error: 'Отменять нечего.' };
        for (const m of last.slice().reverse()) {
            const unit = state.units.find(u => u.id === m.id);
            if (!unit) continue;
            this.engine.board(state).placeUnit(unit, { system: m.fromSystem, pos: m.fromArea });
            // The structures taken during this march go back to their former
            // owner (a control token ran out: they were destroyed instead).
            for (const cap of m.captured || []) {
                const stDef = state.structures.find(x => x.id === cap.id);
                if (stDef && stDef.seat === seat) stDef.seat = cap.from;
            }
            if (m.usedUncontrolled) march.returnUncontrolled();
            march.removeMoved([m.id]);
        }
        // The roll-back goes back a step of the order as well: a returned march of
        // the ships puts the player into the first step again, and the roads are
        // measured anew with the ships where they now stand. Without this the
        // player stayed in the second step with a ship that had been put back.
        const kind = last[0] && last[0].kind === 'ship' ? 'ship' : 'ground';
        const area = last.map(m => m.contested).find(Boolean);
        if (area) march.clearContested(area);
        if (kind === 'ship') {
            march.setStep('ships').setRoute(this.advanceRoutes(state, seat, 'ship'));
        } else if (order.phase === 'move') {
            march.setStep('ground');
        }
        return { ok: true, undone: last.length, step: kind === 'ship' ? 'ships' : 'ground' };
    }

    contestedAreas(state) {
        return this.engine.board(state).contestedAreas();
    }

    cmdEndAdvance(state, seat, cmd) {
        if (state.strike) return { ok: false, error: 'Сначала распределите урон орбитального удара.' };
        const order = state.order;
        if (!order || order.order !== 'advance') return { ok: false, error: 'Это не приказ наступления.' };
        if (order.seat !== seat) return { ok: false, error: 'Сейчас ход другого игрока.' };
        if (order.phase === 'move' && MarchPlan.of(order).step !== 'ground') {
            const march = MarchPlan.of(order);
            march.setStep('ground');
            // The roads of the ground units are measured now — after the ships
            // have taken their places, as the rules require.
            march.setRoute(this.advanceRoutes(state, seat, 'ground'));
            this.engine.log(state, seat, state.players[seat].name + ': корабли встали, идут наземные войска.');
            return { ok: true, step: 'ground' };
        }
        // The troops stay as they are: a world of one place may hold a whole army,
        // and a battle is fought by every unit that stands there.
        let contested = this.contestedAreas(state);
        // The area that became contested during this order is the one to fight for.
        const march = MarchPlan.of(order);
        if (march.contested) {
            const [system, pos] = march.contested.split(':');
            const found = contested.find(a => a.system === system && a.pos === pos);
            if (found) contested = [found];
        }
        if (contested.length === 1) {
            const area = contested[0];
            const mine = state.units.some(u => u.seat === seat && u.system === area.system && u.area === area.pos);
            const their = state.units.find(u => u.seat !== seat && u.system === area.system && u.area === area.pos);
            const bastion = state.structures.find(s => s.seat !== seat && s.system === area.system && s.area === area.pos && s.type === 'bastion');
            const defender = their ? their.seat : bastion ? bastion.seat : seat;
            order.phase = 'combat';
            this.engine.startCombat(state, seat, defender, area.system, area.pos);
            return { ok: true };
        }
        // «Мобилизированные охотники»: the extra advance is over; the main
        // advance of the same order resumes with its own movement still frozen.
        if (order.preAdvance) {
            order.phase = 'done';
            this.engine.finishOrder(state, seat);
            return { ok: true };
        }
        // No combat. An orbital strike is offered only when it has a target: an
        // enemy world under the friendly ships of the system.
        if (!this.orbitalStrikeTargets(state, seat).length) {
            order.phase = 'done';
            this.engine.finishOrder(state, seat);
            return { ok: true };
        }
        order.phase = 'strike';
        return { ok: true };
    }

    orbitalStrikeTargets(state, seat) {
        const order = state.order;
        if (!order) return [];
        const sys = this.engine.system(state, order.system);
        if (!sys) return [];
        const out = [];
        for (const from of sys.areas) {
            if (from.world) continue;
            const ships = state.units.filter(u => {
                if (u.seat !== seat || u.system !== order.system || u.area !== from.pos || u.routed) return false;
                const def = this.engine.unitOf(state, u);
                return !!def && def.type === 'ship';
            });
            if (!ships.length) continue;
            // The world must stand next to the void the ships shoot from.
            const near = this.engine.areasAround(state, order.system, from.pos)
                .filter(a => a.system === order.system);
            for (const area of sys.areas) {
                if (!area.world) continue;
                if (!near.some(a => a.pos === area.pos)) continue;
                // Only an enemy world is a target: it holds the troops or the
                // buildings of another player, and none of ours.
                if (this.engine.areaState(state, seat, order.system, area.pos) !== 'enemy') continue;
                // A bastion shields the world — unless the card that grants the
                // strike ignores it («Ужасный удар», «Полное разрушение», ...).
                if (!StrikePlan.of(order).ignoresBastion
                    && this.engine.structuresAt(state, order.system, area.pos).some(st => st.type === 'bastion')) continue;
                out.push({ system: order.system, pos: area.pos, from: from.pos, ships: ships.map(u => u.id) });
            }
        }
        return out;
    }

    cmdOrbitalStrike(state, seat, cmd) {
        const order = state.order;
        const strike = StrikePlan.of(order);
        if (strike) strike.reset();
        if (!order || order.phase !== 'strike') return { ok: false, error: 'Сейчас нельзя наносить орбитальный удар.' };
        // The schemes of the strike are used before the strike.
        if (!strike.hookUsed()) {
            if (this.engine.maybeScheme(state, seat, 'strike', { kind: 'order', ctx: null })) return { ok: true, pending: true };
        }
        const targets = this.orbitalStrikeTargets(state, seat);
        const target = targets.find(t => t.system === cmd.system && t.pos === cmd.pos
            && (cmd.from === undefined || t.from === cmd.from));
        if (!target) return { ok: false, error: 'По этому миру нельзя нанести удар.' };
        // Only the ships of the chosen void take part: the others stay out.
        const ids = (cmd.ships && cmd.ships.length ? cmd.ships : target.ships);
        const ships = ids.map(id => state.units.find(u => u.id === id && target.ships.includes(id))).filter(Boolean);
        if (!ships.length) return { ok: false, error: 'Нужен хотя бы один корабль.' };
        // «… и разместите его в этом мире» («Мицетические споры»): the effects of
        // the strike read the world it is aimed at from the order.
        strike.setWorld({ system: target.system, pos: target.pos });
        const offence = ships.reduce((n, u) => {
            const def = this.engine.unitOf(state, u);
            return n + (def ? def.combat : 0);
        }, 0);
        const dice = this.engine.rollDice(state, Math.min(offence, this.engine.DICE_MAX));
        // The cube of «Набега жнецов» adds its own hit to the strike.
        const bonus = strike.spendBonus();
        const hits = dice.filter(d => d === 'att').length + bonus;
        this.engine.log(state, seat, state.players[seat].name + ' наносит орбитальный удар: ' + hits + ' урона.');
        // «Вы можете потратить 2 `def. cube`, чтобы взять под контроль постройки
        // этого мира, если в нём нет вражеских юнитов и бастионов» («Изъяны
        // плоти»): the cubes the card pays with are the ones the strike has just
        // rolled, so the price is taken from them here.
        const take = strike.takeTake();
        if (take && dice.filter(d => d === (take.kind || 'def')).length >= (take.n || 1)) {
            this.takeStructuresOf(state, seat, target.system, target.pos);
        }
        // The damage is assigned by the player who suffers it — his units are the
        // ones that go back to the supply, and the damage that does not destroy a
        // unit is ignored (no routing during a strike).
        const defender = state.players.findIndex(p => p.seat !== seat
            && (state.units.some(u => u.seat === p.seat && u.system === target.system && u.area === target.pos)
                || state.structures.some(s => s.seat === p.seat && s.system === target.system && s.area === target.pos)));
        const victims = state.units.filter(u => u.system === target.system && u.area === target.pos && u.seat !== seat);
        // «Во время выполнения этого орбитального удара вы можете потратить до
        // 2 `att. cube` за каждый корабль …» («Мицетические споры») and «… чтобы
        // получить 1 жетон подкрепления за каждый потраченный `att. cube`»
        // («Разведка генокрадов»): BOTH cards may be used on the same strike
        // (01-rules-reference.md, Orbital Strike), so every card keeps its own
        // payment and reward. The questions are asked in the order the cards
        // were used, against one common pool of the cubes of this strike.
        const pays = strike.pays;
        /** @type {any} */
        let planned = null;
        const paySteps = [];
        if (pays.length && !strike.paysAsked) {
            strike.askPays(true);
            // The cubes that may be paid: the ones the strike has rolled and the
            // ones a card has given («Разведка генокрадов»).
            const payPlan = {
                system: target.system, pos: target.pos, hits, defender,
                victims: victims.map(u => u.id), cap: 0,
                ships: ships.length, pool: dice.concat(strike.dice),
                pays: pays.slice(), paid: [],
            };
            const caps = payPlan.pays.map(pay2 => FS_EFFECTS.strikePayCap(payPlan, pay2));
            payPlan.cap = Math.max(0, ...caps);
            if (payPlan.cap > 0) {
                planned = payPlan;
                for (let i = 0; i < payPlan.pays.length; i++) paySteps.push({ op: 'strikePayPick', index: i });
            }
        }
        // «Вы можете выбрать 1 отряд с командным уровнем 0 в этом мире. Этот
        // отряд получит урон первым во время этого орбитального удара»
        // («Набег жнецов»): the choice is independent of the payments. A player
        // has one faction, so the two cards never meet in practice, but both
        // are choices made BEFORE the damage is suffered and both are asked.
        const wantsFirst = hits > 0 && victims.length && defender >= 0
            && strike.firstWanted && !strike.first;
        if (paySteps.length || wantsFirst) {
            if (!planned) planned = {
                system: target.system, pos: target.pos, hits, defender,
                victims: victims.map(u => u.id), cap: 0,
                ships: ships.length, pool: [], pays: [], paid: [],
            };
            if (wantsFirst) paySteps.push({
                op: 'strikeFirstPick',
                maxKl: strike.firstKl,
            });
            strike.setPlanned(planned);
            order.phase = 'strike-first';
            this.engine.runEffects(state, seat, paySteps, { kind: 'order', ctx: null });
            return { ok: true, pending: true, hits };
        }
        return this.finishStrike(state, seat, target, hits, victims, defender);
    }

    finishStrike(state, seat, target, hits, victims, defender) {
        const order = state.order;
        if (hits > 0 && victims.length && defender >= 0) {
            state.strike = {
                seat: defender, system: target.system, pos: target.pos,
                left: hits, hits, attacker: seat,
                first: order ? StrikePlan.of(order).first : null,
            };
            order.phase = 'strike-damage';
            return { ok: true, pending: true, hits };
        }
        if (order) order.phase = 'done';
        this.engine.finishOrder(state, seat);
        return { ok: true, hits };
    }

    takeStructuresOf(state, seat, systemId, pos) {
        const enemies = state.units.filter(u => u.seat !== seat && u.system === systemId && u.area === pos);
        const list = this.engine.structuresAt(state, systemId, pos).filter(s => s.seat !== seat);
        if (enemies.length || list.some(s => s.type === 'bastion') || !list.length) {
            this.engine.log(state, seat, 'Постройки мира нельзя взять под контроль: в нём есть вражеские отряды или бастион.');
            return false;
        }
        for (const s of list) {
            s.seat = seat;
            this.engine.log(state, seat, state.players[seat].name + ' берёт под контроль постройку мира: '
                + (this.engine.structureName ? this.engine.structureName(s.type) : s.type) + '.');
        }
        return true;
    }

    resumeStrike(state, seat) {
        const order = state.order;
        const strike = StrikePlan.of(order);
        const planned = strike && strike.planned;
        if (!planned) return { ok: true };
        // «Точные удары»: the payment has just been made, so the choice of the
        // unit that suffers the damage first is asked NOW — after all payments,
        // still before the damage. Any enemy unit of the world qualifies.
        const wantsFirst = planned.hits > 0 && (planned.victims || []).length
            && planned.defender >= 0 && strike.firstWanted && !strike.first;
        if (wantsFirst && !strike.firstAsked) {
            strike.askFirst(true);
            order.phase = 'strike-first';
            this.engine.runEffects(state, seat, [{
                op: 'strikeFirstPick',
                maxKl: strike.firstKl,
            }], { kind: 'order', ctx: null });
            return { ok: true, pending: true };
        }
        strike.clearPlanned();
        const victims = (planned.victims || []).map(id => state.units.find(u => u.id === id)).filter(Boolean);
        return this.finishStrike(state, seat, { system: planned.system, pos: planned.pos },
            planned.hits, victims, planned.defender);
    }

    cmdStrikeDamage(state, seat, cmd) {
        const st = state.strike;
        if (!st) return { ok: false, error: 'Сейчас нет орбитального удара.' };
        if (st.seat !== seat) return { ok: false, error: 'Урон распределяет защитник.' };
        const unit = state.units.find(u => u.id === cmd.unit && u.seat === seat && u.system === st.system && u.area === st.pos);
        if (!unit) return { ok: false, error: 'Нет такого отряда.' };
        // The unit of «Набега жнецов» receives the damage before the others.
        if (st.first && st.left === st.hits && unit.id !== st.first) {
            const first = state.units.find(u => u.id === st.first);
            if (first) return { ok: false, error: 'Сначала урон получает выбранный отряд.' };
        }
        st.damaged = st.damaged || [];
        st.damaged.push(unit.id);
        const def = this.engine.unitOf(state, unit);
        let health = def ? def.health : 1;
        // «Во время этого орбитального удара здоровье отрядов вашего противника
        // уменьшается до 3» («Вирусные бомбы»).
        const cap = state.order && state.order.seat === st.attacker
            ? StrikePlan.of(state.order).enemyHealth : null;
        if (cap) health = Math.min(health, cap);
        // «временно убавить здоровье всех юнитов в атакуемом мире на 1» («Заряд
        // радиации»): the health of every unit of the world is lower while the
        // strike lasts — «можно опустить здоровье до 0 и убить мгновенно».
        const down = state.order && state.order.seat === st.attacker
            ? StrikePlan.of(state.order).healthDown : 0;
        if (down) health = Math.max(0, health - down);
        if (st.left >= health) {
            st.left -= health;
            this.engine.destroyUnit(state, unit);
            this.engine.log(state, seat, state.players[seat].name + ' теряет отряд под ударом с орбиты.');
        } else {
            // Not enough damage: it is ignored, the unit is not routed.
            st.left = 0;
        }
        const left = state.units.filter(u => u.seat === seat && u.system === st.system && u.area === st.pos).length;
        if (st.left <= 0 || !left) this.endStrike(state);
        return { ok: true };
    }

    endStrike(state) {
        const st = state.strike;
        const order = state.order;
        // «Страх с небес»: after the damage, one surviving unit that was hit is
        // routed. The order ends when that last question is answered.
        if (order && StrikePlan.of(order).routesAfterDamage && st && (st.damaged || []).length) {
            const ids = [...new Set(st.damaged)].filter(id => state.units.some(u => u.id === id));
            if (ids.length) {
                state.strike = null;
                order.chaosRouteDamaged = false;
                order.phase = 'done';
                StrikePlan.of(order).finishAfterQuestion(true);
                this.engine.runEffects(state, st.attacker, [{
                    op: 'strikeRouteDamaged', attacker: st.attacker, options: ids,
                }], { kind: 'order', ctx: null });
                return { ok: true, pending: true };
            }
        }
        state.strike = null;
        if (order) {
            order.phase = 'done';
            this.engine.finishOrder(state, st ? st.attacker : (order.seat));
        }
        return { ok: true };
    }

    cmdFinishAdvance(state, seat) {
        const order = this.engine.orderOf(state, seat, 'advance');
        if (!order) return { ok: false, error: 'Нечего заканчивать.' };
        if (order.preAdvance) {
            this.finishPreAdvance(state, seat);
            return { ok: true };
        }
        this.engine.finishOrder(state, seat);
        return { ok: true };
    }

    startPreAdvance(state, seat) {
        const main = state.order;
        if (!main || main.order !== 'advance') return;
        state.preAdvanceMain = main;
        state.moves = [];
        /** @type {any} */
        const pre = {
            seat, order: 'advance', system: main.system, phase: 'move',
            preAdvance: true, maxKl: 1, combatRounds: 1,
        };
        state.order = pre;
        const march = MarchPlan.of(pre);
        march.reset().setStep('ships').setMoveLimit(1).setRoute(this.advanceRoutes(state, seat, 'ship'));
        this.engine.log(state, seat, state.players[seat].name
            + ' выполняет дополнительный приказ продвижения одним отрядом.');
    }

    startQuickResponse(state, seat, systemId) {
        // The event phase is suspended: the limited advance of «Быстрого
        // ответа» is resolved now, and the snapshot goes back on its end.
        // cmdResolveEvent() took this snapshot BEFORE the event phase could
        // advance to the next player. Reuse it: a second `nextEventPlayer`
        // would draw and discard an extra event card.
        if (!state.quickResponseSnapshot) {
            state.quickResponseSnapshot = {
                phase: state.phase, turn: state.turn,
                event: state.event, eventsLeft: state.eventsLeft,
            };
        }
        state.quickResponsePending = false;
        // The limited order belongs to the player of the event even though the
        // event-phase turn had already passed to the next player.
        state.turn = seat;
        state.moves = [];
        /** @type {any} */
        const order = {
            seat, order: 'advance', system: systemId, phase: 'move',
            quickResponse: true, fromEvent: true,
        };
        state.phase = 'operations';
        state.order = order;
        MarchPlan.of(order).reset();
        MarchPlan.of(order).setRoute(this.advanceRoutes(state, seat, 'ship'));
        this.engine.log(state, seat, state.players[seat].name
            + ' выполняет ограниченный приказ продвижения в выбранной системе.');
    }

    finishPreAdvance(state, seat) {
        const pre = state.order;
        const main = state.preAdvanceMain;
        delete state.preAdvanceMain;
        if (main) {
            MarchPlan.of(main).exclude(pre ? MarchPlan.of(pre).preAdvanceUnit : null);
            main.preAdvanceDone = true;
            state.order = main;
            this.engine.log(state, seat, state.players[seat].name
                + ' возвращается к основному приказу продвижения.');
        }
    }

}
