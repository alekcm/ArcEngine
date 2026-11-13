// FSRulesAdvance.js — the advance order: the two movement steps (ships, then
// ground units), the frozen routes, the single battle, the orbital strike.

class AdvanceRules {
    /** @param {any} engine the rules facade (FSRules.js) */
    constructor(engine) {
        this.engine = engine;
    }

    movableUnits(state, seat) {
        const order = state.order;
        if (!order || !OrderContext.of(order).isKind('advance')) return [];
        const sys = OrderContext.of(order).system;
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
        const move = OrderMove.of(order);
        if (move.preAdvance) {
            units = units.filter(u => {
                if (u.system !== OrderContext.of(order).system) return false;
                const d = this.engine.unitOf(state, u);
                return !!d && (d.kl || 0) <= 1;
            });
        }
        if (march.excludedUnit) units = units.filter(u => u.id !== march.excludedUnit);
        // «Быстрый ответ»: only the units that are ALREADY in the chosen
        // system may take part in the limited advance.
        if (move.quickResponse) units = units.filter(u => u.system === OrderContext.of(order).system);
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
        if (order && OrderMove.of(order).preAdvance) {
            if (unit.system !== OrderContext.of(order).system) {
                return { ok: false, error: 'Дополнительный приказ использует отряд из активной системы.' };
            }
            if ((def.kl || 0) > 1) {
                return { ok: false, error: 'Дополнительный приказ использует отряд с командным уровнем 0 или 1.' };
            }
        }
        // «Быстрый ответ»: only the units of the chosen system march, and only
        // into friendly or uncontrolled areas.
        if (order && OrderMove.of(order).quickResponse) {
            if (unit.system !== OrderContext.of(order).system) {
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
        if (target.system !== OrderContext.of(order).system) return { ok: false, error: 'Отряд может двигаться только в активную систему.' };
        // Ships stay in the voids, ground units stand on the worlds.
        if (def.type === 'ship' && area.world) return { ok: false, error: 'Корабль может стоять только в пустоте.' };
        if (def.type === 'ground' && !area.world) return { ok: false, error: 'Наземный отряд не может стоять в пустоте.' };
        // The unit may come from the active system or from one adjacent system.
        const from = unit.system;
        const adjacent = from === OrderContext.of(order).system || this.engine.neighbors(state, OrderContext.of(order).system).includes(from);
        if (!adjacent) return { ok: false, error: 'Отряд слишком далеко.' };
        // A warp storm on the edge blocks the way — unless the order says that
        // the ships may pass through the storms.
        if (from !== target.system && this.engine.stormOn(state, from, target.system)
            && !OrderMove.of(order).crossesStorm(def)) {
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
                { storms: !!(order && OrderMove.of(order).unitsThroughStorms) })) {
                return { ok: false, error: 'Нет законного пути через свои миры до этого мира.' };
            }
        }
        return { ok: true };
    }

    canMove(state, seat, unit, target) {
        const order = state.order;
        if (!order || !OrderContext.of(order).isKind('advance')) return { ok: false, error: 'Это не приказ наступления.' };
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
        const now = this.moveAllowed(state, seat, unit, target);
        // The frozen roads of the step are the whole answer: a unit without a
        // road at the start of the step does not get one from a later march,
        // even when the board of the moment would let it pass. The board is
        // consulted only for the reason of a refusal.
        if (now.ok && march.route) return { ok: false, error: 'Этому отряду некуда идти: в начале движения у него не было дороги.' };
        return now;
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
            if (!(from === OrderContext.of(order).system || this.engine.neighbors(state, OrderContext.of(order).system).includes(from))) continue;
            const list = [];
            for (const area of this.engine.system(state, OrderContext.of(order).system).areas) {
                if (this.moveAllowed(state, seat, unit, { system: OrderContext.of(order).system, pos: area.pos }).ok) {
                    list.push({ system: OrderContext.of(order).system, pos: area.pos });
                }
            }
            if (list.length) out[unit.id] = list;
        }
        return out;
    }

    // An ability may change the roads after the order was revealed. Rebuild
    // them from the beginning of this movement step, not from units already
    // marched: ground movement is simultaneous even when entered in clicks.
    refreshAdvanceRoutes(state, seat) {
        const order = state.order;
        if (!order || !OrderContext.of(order).isKind('advance')
            || !OrderContext.of(order).isSeat(seat) || !PhasePlan.of(order).is('move')) return;
        const march = MarchPlan.of(order);
        march.setRoute(this.advanceRoutes(this.stepStartState(state, march), seat, march.kind));
    }

    /** The board as it stood when this movement step began: the marched units back at their origins. */
    stepStartState(state, march) {
        // A measuring copy: the pieces are put back without a trail, and no
        // battle of the live state is touched by the placement.
        const copy = Object.assign({}, state, { units: state.units.map(u => ({ ...u })), combat: null });
        const board = this.engine.board(copy);
        for (const group of march.steps.slice().reverse()) for (const record of group) {
            if (record.kind !== march.kind) continue;
            const unit = copy.units.find(u => u.id === record.id);
            if (unit) board.placeUnit(unit, { system: record.fromSystem, pos: record.fromArea });
        }
        return copy;
    }

    /**
     * «Крестный ход»: the units of this march that have no ordinary path and
     * need the passage through an uncontrolled world. Measured on the board of
     * the start of the step, as every legal path of a simultaneous movement is.
     */
    uncontrolledPassages(state, seat, plan) {
        const order = state.order;
        const march = MarchPlan.of(order);
        if (!march || !march.uncontrolledLimit) return [];
        const atStart = this.stepStartState(state, march);
        const storms = !!OrderMove.of(order).unitsThroughStorms;
        return plan.filter(m => m.type !== 'ship'
            && !this.engine.pathExists(atStart, seat, m.from, m.fromArea, m.system, m.pos, { uncontrolled: false, storms }));
    }

    /**
     * «Орочьи корабли»: the units of this march that have no ordinary path and
     * need the passage through an empty void — each with the voids it could
     * have walked through. Measured on the board of the start of the step.
     * @returns {{ move: any, options: string[] }[]}
     */
    voidPassages(state, seat, plan) {
        const order = state.order;
        const move = OrderMove.of(order);
        const march = MarchPlan.of(order);
        if (!move || !march || !move.passVoid) return [];
        const atStart = this.stepStartState(state, march);
        const board = this.engine.board(atStart);
        const storms = !!move.unitsThroughStorms;
        const voids = [];
        for (const sys of atStart.systems) {
            for (const area of sys.areas) {
                // «никем не контролируемая»: nobody has units or structures there.
                if (area.world || board.warSeatsAt(sys.id, area.pos).size) continue;
                voids.push(sys.id + ':' + area.pos);
            }
        }
        const out = [];
        for (const m of plan) {
            if (m.type === 'ship') continue;
            if (this.engine.pathExists(atStart, seat, m.from, m.fromArea, m.system, m.pos, { passVoid: false, storms })) continue;
            const options = voids.filter(key => this.engine.pathExists(atStart, seat, m.from, m.fromArea, m.system, m.pos, { voidOnly: key, storms }));
            out.push({ move: m, options });
        }
        return out;
    }

    /** The one void of «Орочьих кораблей»: what every paid passage of the order agrees on. */
    settleVoidAreas(order) {
        let areas = null;
        for (const group of MarchPlan.of(order).steps) {
            for (const r of group) {
                if (!r.usedVoid || !r.voidOptions) continue;
                areas = areas ? areas.filter(k => r.voidOptions.includes(k)) : r.voidOptions.slice();
            }
        }
        OrderMove.of(order).setPassVoidAreas(areas);
    }

    cmdMoveUnits(state, seat, cmd) {
        const order = state.order;
        if (!order || !OrderContext.of(order).isKind('advance')) return { ok: false, error: 'Это не приказ наступления.' };
        if (!OrderContext.of(order).isSeat(seat)) return { ok: false, error: 'Сейчас ход другого игрока.' };
        const march = MarchPlan.of(order);
        const moves = cmd.moves || [];
        // The order may limit the number of the units that move.
        if (march.moveLimit && moves.length > march.moveLimit) {
            return { ok: false, error: 'Можно переместить не больше ' + march.moveLimit + ' отрядов.' };
        }
        // «Мобилизированные охотники»: ONE unit for the whole extra advance,
        // not one ship and then one ground unit.
        if (OrderMove.of(order).preAdvance && moves.length + march.moved.length > 1) {
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
        const move = OrderMove.of(order);
        const src = new Set(plan.map(m => m.from + ':' + m.fromArea));
        if (!move.withinAreas(src.size)) {
            return { ok: false, error: 'Перемещение ограничено ' + move.areaLimit + ' областью.' };
        }
        // «Крестный ход»: the passage is for N units of the whole order. The
        // frozen roads were drawn with that budget for every unit; the units
        // that already spent it cannot be read off them.
        const passages = this.uncontrolledPassages(state, seat, plan);
        if (passages.length > march.uncontrolledLeft) {
            return { ok: false, error: 'Через неконтролируемые миры в этом приказе могут пройти не больше '
                + march.uncontrolledLimit + ' отрядов.' };
        }
        // «Орочьи корабли»: ONE empty void for N units of the whole order. The
        // frozen roads were drawn with the budget for every unit; the budget
        // and the one void are settled here, when the units actually march.
        const voidPasses = this.voidPassages(state, seat, plan);
        if (voidPasses.length > move.passVoidLeft) {
            return { ok: false, error: 'Через никем не контролируемую пустоту в этом приказе могут пройти не больше '
                + move.passVoid + ' отрядов.' };
        }
        let voidAreas = move.passVoidAreas;
        for (const p of voidPasses) voidAreas = voidAreas ? voidAreas.filter(k => p.options.includes(k)) : p.options.slice();
        if (voidPasses.length && !(voidAreas && voidAreas.length)) {
            return { ok: false, error: 'Карта открывает одну пустоту на весь приказ: этим отрядам она не по пути.' };
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
            // `n` is the total that would END the movement here — it is
            // counted against the cap (five), not against the room left: the
            // room is measured before the move. Against the room, a march out
            // of a stack of four was refused (three remain, the room was one)
            // and so was joining four (five would end, the room was one).
            const [systemId, pos] = key.split(':');
            if (n - this.engine.unitLimit(state, systemId, pos) > 0) {
                return { ok: false, error: this.engine.unitLimitText() };
            }
        }
        // The ground units may come into the active system from one neighbour only,
        // and a ship that came from a neighbour closes the way for the others. The
        // rule holds for the whole order, not only for one command.
        const ground = plan.filter(m => m.type === 'ground' && m.from !== OrderContext.of(order).system);
        const ships = plan.filter(m => m.type === 'ship' && m.from !== OrderContext.of(order).system);
        const froms = new Set();
        for (const m of ground) froms.add(m.from);
        for (const m of ships) froms.add(m.from);
        if (froms.size > 1) {
            return { ok: false, error: 'Наземные отряды могут прийти в активную систему только из одной соседней системы.' };
        }
        if (froms.size === 1) {
            const way = [...froms][0];
            if (ground.length && !move.wayAllows('ground', way)) {
                return { ok: false, error: 'Наземные отряды уже пришли из другой системы.' };
            }
            if (ships.length && !move.wayAllows('ship', way)) {
                return { ok: false, error: 'Корабли уже пришли из другой системы.' };
            }
            if (ground.length && !move.wayAllows('ship', way)) {
                return { ok: false, error: 'Корабли пришли из другой системы: наземные отряды не могут прийти из этой.' };
            }
            if (ships.length && !move.wayAllows('ground', way)) {
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
            if (ground.length) move.setWay('ground', way);
            if (ships.length) move.setWay('ship', way);
        }
        for (const m of plan) {
            const unit = state.units.find(u => u.id === m.id);
            // The step of the march: the trace of it (a combat judges the
            // retreats by it) and the new area are one movement of the board.
            this.engine.board(state).moveUnit(unit, m, { seat });
        }
        // Even an undefended factory or city makes its area contested. Capture
        // happens in combat resolution, after the entire movement has ended.
        // "Крестный ход": the passage through an uncontrolled world is paid for by
        // the unit, not by the area; the ordinary path was tried first, above.
        for (const m of passages) {
            march.useUncontrolled();
            m.usedUncontrolled = true;
        }
        for (const p of voidPasses) {
            move.usePassVoid();
            p.move.usedVoid = true;
            p.move.voidOptions = p.options;
        }
        // The units that marched this time do not march again in the same order.
        march.addMoved(plan.map(m => m.id));
        if (move.preAdvance && plan.length) march.setPreAdvanceUnit(plan[0].id);
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
            id: m.id, fromSystem: m.from, fromArea: m.fromArea, toSystem: m.system, toArea: m.pos,
            usedUncontrolled: !!m.usedUncontrolled, usedVoid: !!m.usedVoid, voidOptions: m.voidOptions || null,
            kind: kinds.get(m.id) || 'ground', contested: stepContested,
        })));
        if (voidPasses.length) this.settleVoidAreas(order);
        return { ok: true };
    }

    cmdUndoMove(state, seat) {
        const order = this.engine.orderOf(state, seat, 'advance');
        if (!order) return { ok: false, error: 'Нечего отменять.' };
        // The last march may be taken back while the movement runs — and also
        // right after the combat has started: nothing has happened in the battle
        // yet (no reinforcements, no cards, no dice).
        if (PhasePlan.of(order).is('combat')) {
            const c = state.combat;
            const turn = CombatTurn.of(c);
            const fresh = turn && !c.effectInitiated && turn.round === 1
                && turn.is('reinforce-attacker', 'reinforce-defender', 'choose-attacker')
                && !CombatHooks.of(c).startUsed && !CombatHooks.of(c).decisionMade
                && !CombatTokens.of(c).any
                && !CombatCards.of(c).staged('attacker') && !CombatCards.of(c).staged('defender')
                && !CombatCards.of(c).played('attacker').length
                && !CombatCards.of(c).played('defender').length
                && CombatDamage.of(c).clean;
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
            PhasePlan.of(order).set('move');
            MarchPlan.of(order).setStep('ground');
        }
        if (!PhasePlan.of(order).is('move')) return { ok: false, error: 'Движение уже закончено.' };
        const march = MarchPlan.of(order);
        const last = march.popStep();
        if (!last) return { ok: false, error: 'Отменять нечего.' };
        for (const m of last.slice().reverse()) {
            const unit = state.units.find(u => u.id === m.id);
            if (!unit) continue;
            const to = { system: unit.system, pos: unit.area };
            const from = { system: m.fromSystem, pos: m.fromArea };
            this.engine.board(state).placeUnit(unit, from);
            MarchTrail.of(state).unrecord(seat, from, to, m.id);
            // A legacy save may already have recorded an immediate capture.
            for (const cap of m.captured || []) {
                const stDef = state.structures.find(x => x.id === cap.id);
                if (stDef && stDef.seat === seat) stDef.seat = cap.from;
            }
            if (m.usedUncontrolled) march.returnUncontrolled();
            if (m.usedVoid) OrderMove.of(order).returnPassVoid();
            march.removeMoved([m.id]);
        }
        if (last.some(m => m.usedVoid)) this.settleVoidAreas(order);
        // The roll-back goes back a step of the order as well: a returned march of
        // the ships puts the player into the first step again, and the roads are
        // measured anew with the ships where they now stand. Without this the
        // player stayed in the second step with a ship that had been put back.
        const kind = last[0] && last[0].kind === 'ship' ? 'ship' : 'ground';
        const area = last.map(m => m.contested).find(Boolean);
        if (area && !this.contestedAreas(state).some(a => a.system + ':' + a.pos === area)) {
            march.clearContested(area);
        }
        if (kind === 'ship') {
            march.setStep('ships').setRoute(this.advanceRoutes(state, seat, 'ship'));
        } else if (PhasePlan.of(order).is('move')) {
            march.setStep('ground');
        }
        return { ok: true, undone: last.length, step: kind === 'ship' ? 'ships' : 'ground' };
    }

    contestedAreas(state) {
        return this.engine.board(state).contestedAreas();
    }

    cmdEndAdvance(state, seat, cmd) {
        if (StrikeDamage.of(state).pending) return { ok: false, error: 'Сначала распределите урон орбитального удара.' };
        const order = state.order;
        if (!order || !OrderContext.of(order).isKind('advance')) return { ok: false, error: 'Это не приказ наступления.' };
        if (!OrderContext.of(order).isSeat(seat)) return { ok: false, error: 'Сейчас ход другого игрока.' };
        if (PhasePlan.of(order).is('corsair')) return { ok: false, error: 'Примените рейд или закончите приказ.' };
        if (PhasePlan.of(order).is('move') && MarchPlan.of(order).step !== 'ground') {
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
        let contested = this.contestedAreas(state).filter(a => state.units.some(u => u.seat === seat
            && u.system === a.system && u.area === a.pos));
        // The area that became contested during this order is the one to fight for.
        const march = MarchPlan.of(order);
        if (march.contested) {
            const [system, pos] = march.contested.split(':');
            const found = contested.find(a => a.system === system && a.pos === pos);
            if (found) contested = [found];
        }
        if (contested.length > 1) return { ok: false, error: 'Спорной может стать только одна область.' };
        if (contested.length === 1) {
            const area = contested[0];
            const their = state.units.find(u => u.seat !== seat && u.system === area.system && u.area === area.pos);
            const structure = state.structures.find(s => s.seat !== seat && s.system === area.system && s.area === area.pos);
            const defender = their ? their.seat : structure && structure.seat;
            if (defender === null || defender === undefined) return { ok: false, error: 'Нет защитника спорной области.' };
            PhasePlan.of(order).set('combat');
            this.engine.startCombat(state, seat, defender, area.system, area.pos);
            return { ok: true };
        }
        // «Мобилизированные охотники»: the extra advance is over; the main
        // advance of the same order resumes with its own movement still frozen.
        if (OrderMove.of(order).preAdvance) {
            PhasePlan.of(order).set('done');
            this.engine.finishOrder(state, seat);
            return { ok: true };
        }
        // A bastion-protected world can become a valid target when the player
        // uses an unused orbital upgrade. Offer the strike window before asking
        // the player whether to spend that upgrade.
        const p = state.players[seat];
        const canIgnoreBastion = (p.upgrades || []).some(up => {
            if (up.used) return false;
            const card = FS_CATALOG.card('orders', p.faction, up.name);
            return card && card.order === 'orbital'
                && FS_EFFECTS.parse(card.text || '', { kind: 'order', faction: p.faction })
                    .some(step => step.op === 'ignoreBastion');
        });
        if (!this.orbitalStrikeTargets(state, seat).length
            && !(canIgnoreBastion && this.orbitalStrikeTargets(state, seat, { ignoreBastion: true }).length)) {
            PhasePlan.of(order).set('done');
            this.engine.finishOrder(state, seat);
            return { ok: true };
        }
        PhasePlan.of(order).set('strike');
        return { ok: true };
    }

    orbitalStrikeTargets(state, seat, opts = {}) {
        const order = state.order;
        if (!order) return [];
        const sys = this.engine.system(state, OrderContext.of(order).system);
        if (!sys) return [];
        const out = [];
        for (const from of sys.areas) {
            if (from.world) continue;
            const ships = state.units.filter(u => {
                if (u.seat !== seat || u.system !== OrderContext.of(order).system || u.area !== from.pos || u.routed) return false;
                const def = this.engine.unitOf(state, u);
                return !!def && def.type === 'ship';
            });
            if (!ships.length) continue;
            // The world must stand next to the void the ships shoot from.
            const near = this.engine.areasAround(state, OrderContext.of(order).system, from.pos)
                .filter(a => a.system === OrderContext.of(order).system);
            for (const area of sys.areas) {
                if (!area.world) continue;
                if (!near.some(a => a.pos === area.pos)) continue;
                // Only an enemy world is a target: it holds the troops or the
                // buildings of another player, and none of ours.
                if (this.engine.areaState(state, seat, OrderContext.of(order).system, area.pos) !== 'enemy') continue;
                // A bastion shields the world — unless the card that grants the
                // strike ignores it («Ужасный удар», «Полное разрушение», ...).
                if (!opts.ignoreBastion && !StrikePlan.of(order).ignoresBastion
                    && this.engine.structuresAt(state, OrderContext.of(order).system, area.pos).some(st => st.type === 'bastion')) continue;
                out.push({ system: OrderContext.of(order).system, pos: area.pos, from: from.pos, ships: ships.map(u => u.id) });
            }
        }
        return out;
    }

    cmdOrbitalStrike(state, seat, cmd) {
        const order = state.order;
        const strike = StrikePlan.of(order);
        if (!order || !PhasePlan.of(order).is('strike')) return { ok: false, error: 'Сейчас нельзя наносить орбитальный удар.' };
        if (!OrderContext.of(order).isSeat(seat)) return { ok: false, error: 'Это не ваш приказ.' };
        const targets = this.orbitalStrikeTargets(state, seat);
        const target = targets.find(t => t.system === cmd.system && t.pos === cmd.pos
            && (cmd.from === undefined || t.from === cmd.from));
        if (!target) return { ok: false, error: 'По этому миру нельзя нанести удар.' };
        // Only the ships of the chosen void take part: the others stay out.
        const ids = cmd.ships === undefined ? target.ships : cmd.ships;
        if (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length
            || ids.some(id => !target.ships.includes(id))) {
            return { ok: false, error: 'Выберите доступные корабли без повторений.' };
        }
        const ships = ids.map(id => state.units.find(u => u.id === id));
        if (ships.some(u => !u)) return { ok: false, error: 'Нужен хотя бы один корабль.' };
        strike.reset();
        // The scheme is offered only after the target and fleet were validated.
        if (!strike.hookUsed()) {
            if (this.engine.maybeScheme(state, seat, 'strike', { kind: 'order', ctx: null })) return { ok: true, pending: true };
        }
        // «… и разместите его в этом мире» («Мицетические споры»): the effects of
        // the strike read the world it is aimed at from the order.
        strike.setWorld({ system: target.system, pos: target.pos });
        // Radiation reduces health before damage is assigned. Units whose
        // health reaches zero die immediately, even on a roll with no hits.
        if (strike.healthDown) {
            const victims = state.units.filter(u => u.system === target.system && u.area === target.pos);
            for (const unit of victims) {
                const def = this.engine.unitOf(state, unit);
                let health = def ? def.health : 1;
                if (unit.seat !== seat && strike.enemyHealth !== null) health = Math.min(health, strike.enemyHealth);
                if (health <= strike.healthDown) {
                    this.engine.destroyUnit(state, unit);
                    this.engine.log(state, unit.seat, state.players[unit.seat].name + ': отряд погиб от радиации.');
                }
            }
        }
        const offence = ships.reduce((n, u) => {
            const def = this.engine.unitOf(state, u);
            return n + (def ? def.combat : 0);
        }, 0);
        // Dice granted by upgrades are part of the same eight-die limit.
        const room = Math.max(0, this.engine.DICE_MAX - strike.dice.length);
        let dice = this.engine.rollDice(state, Math.min(offence, room));
        // «…перевернуть все ваши кубики, которые вы бросали, на `att. cube`»
        // («Экстерминатус»): the card is used before the strike, and every cube
        // of the roll becomes a hit. The faces stay in the roll: the cards that
        // pay with `def. cube` have nothing to pay with after this one.
        if (strike.spendAllAtt()) dice = dice.map(() => 'att');
        // The cube of «Набега жнецов» adds its own hit to the strike.
        const bonus = strike.spendBonus();
        const hits = dice.filter(d => d === 'att').length + bonus;
        // «Вы можете потратить 2 `def. cube`, чтобы взять под контроль постройки
        // этого мира, если в нём нет вражеских юнитов и бастионов» («Изъяны
        // плоти»): the cubes the card pays with are the ones the strike has just
        // rolled, so the price is taken from them here.
        const take = strike.takeTake();
        // The damage is assigned by the player who suffers it — his units are the
        // ones that go back to the supply, and the damage that does not destroy a
        // unit is ignored (no routing during a strike).
        const defender = state.players.findIndex(p => p.seat !== seat
            && (state.units.some(u => u.seat === p.seat && u.system === target.system && u.area === target.pos)
                || state.structures.some(s => s.seat === p.seat && s.system === target.system && s.area === target.pos)));
        const victims = state.units.filter(u => u.system === target.system && u.area === target.pos && u.seat !== seat)
            .concat(state.structures.filter(s => s.system === target.system && s.area === target.pos
                && s.seat !== seat && s.type === 'bastion'));
        // Keep the roll and its target across the optional post-roll scheme.
        // Pre-roll schemes such as «Экстерминатус» were already offered above.
        const planned = {
            system: target.system, pos: target.pos, hits, defender,
            victims: victims.map(u => u.id), cap: 0,
            ships: ships.length, pool: dice.concat(strike.dice),
            pays: strike.pays.slice(), paid: [], take, afterRollScheme: true,
        };
        strike.setPlanned(planned);
        PhasePlan.of(order).set('strike-first');
        if (this.engine.maybeScheme(state, seat, 'strike-rolled', { kind: 'order', ctx: null })) {
            return { ok: true, pending: true };
        }
        delete planned.afterRollScheme;
        return this.continueRolledStrike(state, seat, planned);
    }

    /** Ask the payments against the final rolled pool, then assign damage. */
    continueRolledStrike(state, seat, planned) {
        const order = state.order;
        const strike = StrikePlan.of(order);
        if (!strike || !planned) return { ok: false, error: 'Удара нет.' };
        const paySteps = [];
        this.engine.log(state, seat, state.players[seat].name
            + ' наносит орбитальный удар: ' + planned.hits + ' урона.');
        if (planned.pays.length && !strike.paysAsked) {
            strike.askPays(true);
            const caps = planned.pays.map(pay => FS_EFFECTS.strikePayCap(planned, pay));
            planned.cap = Math.max(0, ...caps);
            if (planned.cap > 0) {
                for (let i = 0; i < planned.pays.length; i++) paySteps.push({ op: 'strikePayPick', index: i });
            }
        }
        if (planned.take) {
            const take = planned.take;
            delete planned.take;
            paySteps.push({ op: 'offerCaptureStrike', system: planned.system, pos: planned.pos,
                n: take.n, kind: take.kind });
        }
        const wantsFirst = planned.hits > 0 && planned.victims.length && planned.defender >= 0
            && strike.firstWanted && !strike.first;
        if (wantsFirst) paySteps.push({ op: 'strikeFirstPick', maxKl: strike.firstKl });
        if (paySteps.length) {
            strike.setPlanned(planned);
            PhasePlan.of(order).set('strike-first');
            this.engine.runEffects(state, seat, paySteps, { kind: 'order', ctx: null });
            return { ok: true, pending: true, hits: planned.hits };
        }
        strike.clearPlanned();
        const victims = planned.victims.map(id => state.units.find(u => u.id === id)
            || state.structures.find(s => s.id === id && s.type === 'bastion')).filter(Boolean);
        return this.finishStrike(state, seat, { system: planned.system, pos: planned.pos },
            planned.hits, victims, planned.defender);
    }

    finishStrike(state, seat, target, hits, victims, defender) {
        const order = state.order;
        if (hits > 0 && victims.length && defender >= 0) {
            StrikeDamage.of(state).begin({
                seat: defender, system: target.system, pos: target.pos,
                hits, attacker: seat,
                first: order ? StrikePlan.of(order).first : null,
            });
            PhasePlan.of(order).set('strike-damage');
            return { ok: true, pending: true, hits };
        }
        if (order) PhasePlan.of(order).set('done');
        this.engine.finishOrder(state, seat);
        return { ok: true, hits };
    }

    canTakeStructuresOf(state, seat, systemId, pos) {
        const enemies = state.units.some(u => u.seat !== seat && u.system === systemId && u.area === pos);
        const list = this.engine.structuresAt(state, systemId, pos).filter(s => s.seat !== seat);
        return !enemies && list.length > 0 && !list.some(s => s.type === 'bastion');
    }

    takeStructuresOf(state, seat, systemId, pos) {
        if (!this.canTakeStructuresOf(state, seat, systemId, pos)) {
            this.engine.log(state, seat, 'Постройки мира нельзя взять под контроль: в нём есть вражеские отряды или бастион.');
            return false;
        }
        const list = this.engine.structuresAt(state, systemId, pos).filter(s => s.seat !== seat);
        for (const s of list) {
            // Like capture after combat, a structure without a control token
            // of its new owner is destroyed rather than exceeding the supply.
            if (this.engine.structureTokensLeft(state, seat) <= 0) {
                this.engine.destroyStructure(state, s);
                this.engine.log(state, seat, 'Нет жетона контроля: постройка уничтожена.');
                continue;
            }
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
        if (planned.afterRollScheme) {
            delete planned.afterRollScheme;
            return this.continueRolledStrike(state, seat, planned);
        }
        // «Точные удары»: the payment has just been made, so the choice of the
        // unit that suffers the damage first is asked NOW — after all payments,
        // still before the damage. Any enemy unit of the world qualifies.
        const wantsFirst = planned.hits > 0 && (planned.victims || []).length
            && planned.defender >= 0 && strike.firstWanted && !strike.first;
        if (wantsFirst && !strike.firstAsked) {
            strike.askFirst(true);
            PhasePlan.of(order).set('strike-first');
            this.engine.runEffects(state, seat, [{
                op: 'strikeFirstPick',
                maxKl: strike.firstKl,
            }], { kind: 'order', ctx: null });
            return { ok: true, pending: true };
        }
        strike.clearPlanned();
        const victims = (planned.victims || []).map(id =>
            state.units.find(u => u.id === id) || state.structures.find(s => s.id === id && s.type === 'bastion'))
            .filter(Boolean);
        return this.finishStrike(state, seat, { system: planned.system, pos: planned.pos },
            planned.hits, victims, planned.defender);
    }

    cmdStrikeDamage(state, seat, cmd) {
        const damage = StrikeDamage.of(state);
        if (!damage.pending) return { ok: false, error: 'Сейчас нет орбитального удара.' };
        if (!damage.waiting(seat)) return { ok: false, error: 'Урон распределяет защитник.' };
        const unit = state.units.find(u => u.id === cmd.unit && u.seat === seat
            && damage.aimedAt(u.system, u.area));
        const bastion = state.structures.find(s => s.id === (cmd.structure || cmd.unit)
            && s.seat === seat && s.type === 'bastion' && damage.aimedAt(s.system, s.area));
        const victim = unit || bastion;
        if (!victim) return { ok: false, error: 'Нет такого отряда или бастиона.' };
        const otherReady = state.units.some(u => u.seat === seat && !u.routed
            && damage.aimedAt(u.system, u.area));
        const hasBastion = state.structures.some(s => s.seat === seat && s.type === 'bastion'
            && damage.aimedAt(s.system, s.area));
        // A card that explicitly names the first victim overrides the normal
        // restriction on routed units; otherwise it could make the strike hang.
        const chosenFirst = unit && damage.untouched && damage.first === unit.id;
        if (unit && unit.routed && !chosenFirst && (otherReady || hasBastion)) {
            return { ok: false, error: 'Сначала урон получают недеморализованные отряды или бастион.' };
        }
        // The unit of «Набега жнецов» receives the damage before the others.
        if (damage.first && damage.untouched && victim.id !== damage.first) {
            const first = state.units.find(u => u.id === damage.first);
            if (first) return { ok: false, error: 'Сначала урон получает выбранный отряд.' };
        }
        const def = unit ? this.engine.unitOf(state, unit) : this.engine.structureStats('bastion');
        let health = def ? def.health : 1;
        // «Во время этого орбитального удара здоровье отрядов вашего противника
        // уменьшается до 3» («Вирусные бомбы»).
        const cap = state.order && OrderContext.of(state.order).isSeat(damage.attacker)
            ? StrikePlan.of(state.order).enemyHealth : null;
        if (unit && cap) health = Math.min(health, cap);
        // «временно убавить здоровье всех юнитов в атакуемом мире на 1» («Заряд
        // радиации»): the health of every unit of the world is lower while the
        // strike lasts — «можно опустить здоровье до 0 и убить мгновенно».
        const down = state.order && OrderContext.of(state.order).isSeat(damage.attacker)
            ? StrikePlan.of(state.order).healthDown : 0;
        if (unit && down) health = Math.max(0, health - down);
        if (damage.left >= health) {
            damage.take(victim.id, health);
            if (unit) this.engine.destroyUnit(state, unit);
            else this.engine.destroyStructure(state, bastion);
            this.engine.log(state, seat, state.players[seat].name
                + (unit ? ' теряет отряд' : ' теряет бастион') + ' под ударом с орбиты.');
        } else {
            // Not enough damage: it is ignored, the unit is not routed.
            damage.take(victim.id, damage.left);
        }
        const left = state.units.some(u => u.seat === seat && damage.aimedAt(u.system, u.area))
            || state.structures.some(s => s.seat === seat && s.type === 'bastion' && damage.aimedAt(s.system, s.area));
        if (damage.spent || !left) this.endStrike(state);
        return { ok: true };
    }

    endStrike(state) {
        const damage = StrikeDamage.of(state);
        const order = state.order;
        // «Страх с небес»: after the damage, one surviving unit that was hit is
        // routed. The order ends when that last question is answered.
        const hit = [...new Set(damage.damaged)].filter(id => state.units.some(u => u.id === id));
        if (order && StrikePlan.of(order).routesAfterDamage && hit.length) {
            const attacker = damage.attacker;
            damage.end();
            StrikePlan.of(order).clearRoutes();
            PhasePlan.of(order).set('done');
            StrikePlan.of(order).finishAfterQuestion(true);
            this.engine.runEffects(state, attacker, [{
                op: 'strikeRouteDamaged', attacker, options: hit,
            }], { kind: 'order', ctx: null });
            return { ok: true, pending: true };
        }
        const attacker = damage.attacker;
        damage.end();
        if (order) {
            PhasePlan.of(order).set('done');
            this.engine.finishOrder(state, attacker === null ? OrderContext.of(order).seat : attacker);
        }
        return { ok: true };
    }

    cmdFinishAdvance(state, seat) {
        if (StrikeDamage.of(state).pending) return { ok: false, error: 'Сначала распределите урон орбитального удара.' };
        if (state.combat) return { ok: false, error: 'Сначала закончите бой.' };
        const order = this.engine.orderOf(state, seat, 'advance');
        if (!order) return { ok: false, error: 'Нечего заканчивать.' };
        if (OrderMove.of(order).preAdvance) {
            this.finishPreAdvance(state, seat);
            return { ok: true };
        }
        this.engine.finishOrder(state, seat);
        return { ok: true };
    }

    startPreAdvance(state, seat) {
        const main = state.order;
        if (!main || main.order !== 'advance') return;
        PreAdvance.of(state).suspend(main);
        MarchTrail.of(state).reset();
        /** @type {any} */
        const pre = {
            seat, order: 'advance', system: main.system, maxKl: 1, combatRounds: 1,
        };
        state.order = pre;
        PhasePlan.of(pre).set('move');
        OrderMove.of(pre).setPreAdvance();
        const march = MarchPlan.of(pre);
        march.reset().setStep('ships').setMoveLimit(1).setRoute(this.advanceRoutes(state, seat, 'ship'));
        this.engine.log(state, seat, state.players[seat].name
            + ' выполняет дополнительный приказ продвижения одним отрядом.');
    }

    /** An ordinary advance replaces the reveal for the Ork scheme «Вперёд!». */
    startPlanAdvance(state, seat, systemId) {
        GamePhase.of(state).turn = seat;
        MarchTrail.of(state).reset();
        const order = { seat, order: 'advance', system: systemId };
        state.order = order;
        PhasePlan.of(order).set('move');
        MarchPlan.of(order).reset().setStep('ships').setRoute(this.advanceRoutes(state, seat, 'ship'));
    }

    startQuickResponse(state, seat, systemId) {
        // The event phase is suspended: the limited advance of «Быстрого
        // ответа» is resolved now, and the snapshot goes back on its end.
        // cmdResolveEvent() took this snapshot BEFORE the event phase could
        // advance to the next player. Reuse it: a second `nextEventPlayer`
        // would draw and discard an extra event card.
        const quick = QuickResponse.of(state);
        quick.suspend();
        quick.start();
        // The limited order belongs to the player of the event even though the
        // event-phase turn had already passed to the next player.
        GamePhase.of(state).turn = seat;
        MarchTrail.of(state).reset();
        /** @type {any} */
        const order = {
            seat, order: 'advance', system: systemId,
        };
        GamePhase.of(state).start(GamePhase.OPERATIONS);
        state.order = order;
        PhasePlan.of(order).set('move');
        OrderMove.of(order).setQuickResponse().setFromEvent();
        MarchPlan.of(order).reset();
        MarchPlan.of(order).setRoute(this.advanceRoutes(state, seat, 'ship'));
        this.engine.log(state, seat, state.players[seat].name
            + ' выполняет ограниченный приказ продвижения в выбранной системе.');
    }

    finishPreAdvance(state, seat) {
        const pre = state.order;
        const main = PreAdvance.of(state).resume();
        if (main) {
            MarchPlan.of(main).exclude(pre ? MarchPlan.of(pre).preAdvanceUnit : null);
            PreAdvance.of(state).done(main);
            state.order = main;
            this.engine.log(state, seat, state.players[seat].name
                + ' возвращается к основному приказу продвижения.');
        }
    }

}
