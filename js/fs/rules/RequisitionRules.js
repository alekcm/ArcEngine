// RequisitionRules.js — the Blitz draft and the requisitions resolved during setup.
//
// The draft is deliberately face down: state keeps card ids on the server, while
// CoreRules.view sends only the suit, turn and number of backs. Once the draft
// ends, the picked cards become public and are revealed one at a time after a
// player's system tile is placed.

class RequisitionRules {
    /** @param {any} engine the rules facade (FSRules.js) */
    constructor(engine) {
        this.engine = engine;
    }

    draftGuard(state, seat, stage) {
        const board = BoardSetup.of(state);
        if (!GamePhase.of(state).is(GamePhase.SETUP) || !board.active || state.variant !== 'blitz')
            return { ok: false, error: 'Сейчас нет драфта реквизиций.' };
        if (!board.is(stage)) return { ok: false, error: 'Сейчас этот выбор недоступен.' };
        if (board.turn !== seat) return { ok: false, error: 'Сейчас очередь другого игрока.' };
        if ((state.players[seat].startChoice || 0) > 0) return { ok: false, error: 'Сначала выберите стартовые ресурсы.' };
        return null;
    }

    nextSetupSeat(board, from) {
        const order = board.turnOrder;
        if (!order.length) return from;
        const at = order.indexOf(from);
        return order[(at < 0 ? 0 : at + 1) % order.length];
    }

    cmdChooseRequisitionSuit(state, seat, cmd) {
        const board = BoardSetup.of(state);
        const error = this.draftGuard(state, seat, BoardSetup.DRAFT_SUIT);
        if (error) return error;
        const draft = board.record.blitzDraft;
        if (!draft || draft.suitChooser !== seat) return { ok: false, error: 'Сейчас выбирает масть другой игрок.' };
        const suit = FS_REQUISITIONS.suit(cmd.suit);
        if (!suit || !draft.availableSuits.includes(suit.id)) return { ok: false, error: 'Эта масть уже выбрана или неизвестна.' };
        const dealt = this.engine.shuffle(state, FS_REQUISITIONS.cardsIn(suit.id).map(card => card.id))
            .slice(0, state.players.length + 1);
        if (dealt.length !== state.players.length + 1) return { ok: false, error: 'В масти недостаточно реквизиций.' };
        draft.availableSuits.splice(draft.availableSuits.indexOf(suit.id), 1);
        draft.selectedSuits.push(suit.id);
        draft.currentSuit = suit.id;
        draft.cardHand = dealt;
        draft.cardPicks = 0;
        draft.cardChooser = seat;
        board.record.turn = seat;
        board.setStage(BoardSetup.DRAFT_CARD);
        this.engine.log(state, seat, state.players[seat].name + ' выбрал масть ' + suit.name + ' для драфта реквизиций.');
        return { ok: true };
    }

    cmdChooseRequisitionCard(state, seat, cmd) {
        const board = BoardSetup.of(state);
        const error = this.draftGuard(state, seat, BoardSetup.DRAFT_CARD);
        if (error) return error;
        const draft = board.record.blitzDraft;
        const index = Number(cmd.index);
        if (!draft || draft.cardChooser !== seat) return { ok: false, error: 'Эту карту выбирает другой игрок.' };
        if (!Number.isInteger(index) || index < 0 || index >= draft.cardHand.length)
            return { ok: false, error: 'Выберите одну из карт рубашкой вверх.' };
        const name = draft.cardHand.splice(index, 1)[0];
        const player = state.players[seat];
        player.requisitions = player.requisitions || [];
        player.requisitions.push(name);
        draft.cardPicks++;
        this.engine.log(state, seat, player.name + ' выбрал одну закрытую карту реквизиции.');

        if (draft.cardPicks < state.players.length) {
            const next = this.nextSetupSeat(board, seat);
            draft.cardChooser = next;
            board.record.turn = next;
            return { ok: true };
        }

        // One card remains in the dealt hand after every player has picked;
        // it returns to the box unseen, just like the cards not dealt.
        draft.cardHand = [];
        draft.currentSuit = null;
        draft.cardChooser = null;
        draft.cardPicks = 0;
        if (draft.selectedSuits.length >= FS_REQUISITIONS.suits.length) {
            draft.complete = true;
            draft.availableSuits = [];
            draft.suitChooser = null;
            board.record.turnIndex = 0;
            board.record.turn = board.turnOrder[0];
            board.setStage(BoardSetup.TILES);
            this.engine.log(state, -1, 'Драфт завершён: реквизиции открыты, начинается расстановка системных тайлов.');
        } else {
            draft.suitRound++;
            draft.suitChooser = this.nextSetupSeat(board, draft.suitChooser);
            board.record.turn = draft.suitChooser;
            board.setStage(BoardSetup.DRAFT_SUIT);
        }
        return { ok: true };
    }

    setupGuard(state, seat, stage) {
        const board = BoardSetup.of(state);
        if (!GamePhase.of(state).is(GamePhase.SETUP) || !board.active || state.variant !== 'blitz')
            return { ok: false, error: 'Сейчас нет расстановки блица.' };
        if (!board.is(stage)) return { ok: false, error: 'Сначала завершите текущее действие расстановки.' };
        if (board.turn !== seat) return { ok: false, error: 'Сейчас ход другого игрока.' };
        return null;
    }

    cmdSelectRequisition(state, seat, cmd) {
        const board = BoardSetup.of(state);
        const error = this.setupGuard(state, seat, BoardSetup.REQUISITION);
        if (error) return error;
        const player = state.players[seat];
        const cardId = String(cmd.card || '');
        const at = (player.requisitions || []).indexOf(cardId);
        const card = FS_REQUISITIONS.card(cardId);
        if (!card || at < 0) return { ok: false, error: 'Эта реквизиция не принадлежит игроку.' };
        player.requisitions.splice(at, 1);
        this.engine.log(state, seat, player.name + ' открывает реквизицию «' + card.name + '».');

        if (!this.requisitionCanResolve(state, seat, card)) {
            this.engine.log(state, seat, 'Реквизицию «' + card.name + '» нельзя разрешить сейчас: она сброшена без эффекта.');
            board.setStage(BoardSetup.FORCES);
            return { ok: true };
        }
        if (['materiel', 'asset', 'holdfields'].includes(card.effect)) {
            this.resolveAutomaticRequisition(state, seat, card);
            board.setStage(BoardSetup.FORCES);
            return { ok: true };
        }
        board.record.pendingRequisition = { seat, card: card.id, system: board.currentSystem };
        board.setStage(BoardSetup.REQUISITION_EFFECT);
        return { ok: true };
    }

    requisitionCanResolve(state, seat, card) {
        const player = PlayerEntity.of(state, seat);
        if (!player || !card) return false;
        if (card.effect === 'materiel') return player.materiel < FS_RULES_CONFIG.MATERIEL_MAX;
        if (card.effect === 'asset') return player.hasRoomFor(card.asset);
        if (card.effect === 'holdfields') return true;
        return this.requisitionOptions(state, seat, card.id).length > 0;
    }

    resolveAutomaticRequisition(state, seat, card) {
        const p = state.players[seat];
        if (card.effect === 'materiel') {
            const before = p.materiel || 0;
            PlayerEntity.of(state, seat).gainMateriel(card.amount);
            const gained = (p.materiel || 0) - before;
            this.engine.log(state, seat, p.name + ' получает ' + gained + ' материи по реквизиции «' + card.name + '».');
        } else if (card.effect === 'asset') {
            const gained = PlayerEntity.of(state, seat).addAsset(card.asset, card.amount);
            this.engine.log(state, seat, p.name + ' получает ' + gained + ' ' + this.engine.assetName(card.asset)
                + ' по реквизиции «' + card.name + '».');
        } else if (card.effect === 'holdfields') {
            p.holdfieldsRound = 1;
            this.engine.log(state, seat, p.name + ' защищает свои дружественные миры от орбитальных ударов в первом раунде.');
        }
    }

    /** A world/system's printed label for the setup choice list. */
    setupTargetLabel(state, system, pos) {
        const area = system && system.areas.find(a => a.pos === pos);
        const location = area && area.world ? area.world.name : 'Пустота';
        return (system ? system.tile + ' · ' : '') + location;
    }

    isHostileSystem(state, seat, system) {
        if (!system) return false;
        // `system.owner` is only the seat that laid the tile during setup; it
        // does not represent control. A hostile system is one with an enemy
        // piece currently on its board.
        return (state.units || []).some(unit => unit.system === system.id && unit.seat !== seat)
            || (state.structures || []).some(structure => structure.system === system.id && structure.seat !== seat);
    }

    unitFits(state, system, pos, count) {
        const already = this.engine.unitsAt(state, system, pos).length;
        return already + count <= this.engine.capacity(state, system, pos);
    }

    requisitionUnitsFit(state, seat, placements, routed) {
        const copy = JSON.parse(JSON.stringify(state));
        const p = copy.players[seat];
        const counts = new Map();
        for (const place of placements) counts.set(place.unit, (counts.get(place.unit) || 0) + 1);
        for (const [unit, n] of counts) {
            if (!p.supply || !p.supply.units || (p.supply.units[unit] || 0) < n) return false;
            p.supply.units[unit] -= n;
        }
        for (let i = 0; i < placements.length; i++) {
            const place = placements[i];
            copy.units.push({
                id: 'requisition-fit-' + i,
                seat,
                faction: p.faction,
                unit: place.unit,
                system: place.system,
                area: place.pos,
                routed: !!routed,
            });
        }
        return this.requisitionInitialForcesFit(copy, seat);
    }

    /**
     * Check that free Blitz placements still leave room for all unplaced
     * starting forces. The tile being resolved is no longer in the player's
     * hand, so include its remaining capacity explicitly alongside future tiles.
     */
    requisitionInitialForcesFit(state, seat) {
        const board = BoardSetup.of(state);
        const system = this.engine.system(state, board.currentSystem);
        if (!system) return false;
        const record = board.record || {};
        const hand = Array.isArray(record.hands) ? (record.hands[seat] || []).slice()
            : Array.isArray(record.hand) ? record.hand.slice() : [];
        const capacityTile = {
            areas: system.areas.map(area => {
                const used = this.engine.unitsAt(state, system.id, area.pos).length;
                const capacity = Math.max(0, this.engine.capacity(state, system.id, area.pos) - used);
                if (area.world) {
                    return {
                        world: Object.assign({}, area.world, { capacity }),
                        structureAvailable: !this.engine.hasStructure(state, system.id, area.pos),
                    };
                }
                return { world: null, capacity };
            }),
        };
        return this.engine.setupForcesFit(state, seat, capacityTile, -1, hand);
    }

    /** Unit pieces still in reserve that satisfy the card's command level/type. */
    requisitionUnitDefs(state, seat, card) {
        const faction = FS_CATALOG.faction(state.players[seat].faction);
        const supply = state.players[seat].supply && state.players[seat].supply.units || {};
        return ((faction && faction.units) || []).filter(unit => Number(unit.kl || 0) === Number(card.kl || 0)
            && (card.unitType === 'ship' ? unit.type === 'ship' : unit.type !== 'ship')
            && (supply[unit.id] || 0) > 0);
    }

    requisitionAreas(state, seat, card) {
        const board = BoardSetup.of(state);
        const active = this.engine.system(state, board.currentSystem);
        if (!active) return [];
        if (card.target === 'active-world') return active.areas.filter(a => a.world)
            .map(a => ({ system: active, area: a }));
        if (card.target === 'active-void') return active.areas.filter(a => !a.world)
            .map(a => ({ system: active, area: a }));
        const out = [];
        for (const system of state.systems || []) {
            if (!this.isHostileSystem(state, seat, system)) continue;
            for (const area of system.areas || []) {
                if (!area.world) continue;
                const units = this.engine.unitsAt(state, system.id, area.pos);
                if (card.target === 'uncontrolled-hostile-world'
                    && this.engine.areaState(state, seat, system.id, area.pos) !== 'uncontrolled') continue;
                if (card.target === 'unoccupied-hostile-world'
                    && (units.length || this.engine.hasStructure(state, system.id, area.pos))) continue;
                out.push({ system, area });
            }
        }
        return out;
    }

    requisitionSingleUnitOptions(state, seat, card) {
        const defs = this.requisitionUnitDefs(state, seat, card);
        const areas = this.requisitionAreas(state, seat, card);
        const out = [];
        for (const unit of defs) for (const target of areas) {
            if (!this.unitFits(state, target.system.id, target.area.pos, 1)) continue;
            const placement = { unit: unit.id, system: target.system.id, pos: target.area.pos };
            if (!this.requisitionUnitsFit(state, seat, [placement], card.routed)) continue;
            out.push({
                kind: 'unit', unit: unit.id, system: target.system.id, pos: target.area.pos,
                routed: !!card.routed,
                label: unit.name + ' · ' + this.setupTargetLabel(state, target.system, target.area.pos),
            });
        }
        return out;
    }

    requisitionUnitPairOptions(state, seat, card) {
        const defs = this.requisitionUnitDefs(state, seat, card);
        const p = state.players[seat];
        const supply = p.supply && p.supply.units || {};
        const pairs = [];
        for (let i = 0; i < defs.length; i++) for (let j = i; j < defs.length; j++) {
            const a = defs[i], b = defs[j];
            if (a.id === b.id && (supply[a.id] || 0) < 2) continue;
            pairs.push([a, b]);
        }
        const areas = this.requisitionAreas(state, seat, card);
        const out = [];
        if (card.sameArea) {
            for (const [a, b] of pairs) for (const target of areas) {
                if (!this.unitFits(state, target.system.id, target.area.pos, 2)) continue;
                const placements = [a, b].map(unit => ({ unit: unit.id, system: target.system.id, pos: target.area.pos }));
                if (!this.requisitionUnitsFit(state, seat, placements, card.routed)) continue;
                out.push({
                    kind: 'unit-pair', placements,
                    label: a.name + (a.id === b.id ? ' ×2' : ' + ' + b.name)
                        + ' · ' + this.setupTargetLabel(state, target.system, target.area.pos),
                });
            }
        } else if (card.differentAreas) {
            for (const [a, b] of pairs) for (let i = 0; i < areas.length; i++) for (let j = i + 1; j < areas.length; j++) {
                const one = areas[i], two = areas[j];
                if (one.system.id !== two.system.id || one.area.pos === two.area.pos) continue;
                if (!this.unitFits(state, one.system.id, one.area.pos, 1)
                    || !this.unitFits(state, two.system.id, two.area.pos, 1)) continue;
                const placements = [
                    { unit: a.id, system: one.system.id, pos: one.area.pos },
                    { unit: b.id, system: two.system.id, pos: two.area.pos },
                ];
                if (!this.requisitionUnitsFit(state, seat, placements, card.routed)) continue;
                out.push({
                    kind: 'unit-pair', placements,
                    label: a.name + ' · ' + this.setupTargetLabel(state, one.system, one.area.pos)
                        + '  +  ' + b.name + ' · ' + this.setupTargetLabel(state, two.system, two.area.pos),
                });
            }
        }
        return out;
    }

    requisitionStructureOptions(state, seat, card) {
        const board = BoardSetup.of(state);
        const system = this.engine.system(state, board.currentSystem);
        if (!system) return [];
        const p = state.players[seat];
        const initial = p.initialForces && p.initialForces.structures || {};
        const reserved = Object.values(initial).reduce((n, x) => n + (Number(x) || 0), 0);
        const already = (state.structures || []).filter(s => s.seat === seat).length;
        if (already + reserved + 1 > FS_RULES_CONFIG.STRUCTURE_TOKENS) return [];
        if (!this.engine.canTakeStructure(state, seat, card.structure).ok) return [];
        const out = [];
        for (const area of system.areas) {
            if (!area.world || !this.engine.canPlaceStructure(state, seat, system.id, area.pos, { ignoreControl: true }).ok) continue;
            const copy = JSON.parse(JSON.stringify(state));
            copy.structures.push({ id: 'requisition-fit-structure', seat, type: card.structure, system: system.id, area: area.pos });
            if (!this.requisitionInitialForcesFit(copy, seat)) continue;
            out.push({
                kind: 'structure', structure: card.structure, system: system.id, pos: area.pos,
                label: this.engine.structureName(card.structure) + ' · ' + this.setupTargetLabel(state, system, area.pos),
            });
        }
        return out;
    }

    upgradeOptions(state, seat, combatOnly) {
        const p = state.players[seat];
        const out = [];
        if (!combatOnly) {
            const pile = Array.isArray(p.decks && p.decks.upgradeOrder) ? p.decks.upgradeOrder
                : Array.isArray(p.decksUpgradeOrderKnown) ? p.decksUpgradeOrderKnown
                    : FS_CATALOG.orderCards(p.faction).map(card => card.name);
            for (const name of pile) {
                const card = FS_CATALOG.card('orders', p.faction, name);
                if (!card || Number(card.kl || 0) !== 0 || (p.upgrades || []).some(u => u.name === name)) continue;
                out.push({ kind: 'order-upgrade', card: name, label: 'Улучшение приказа · ' + name });
            }
            return out;
        }
        const deckCards = Array.isArray(p.decks && p.decks.combat) ? p.decks.combat
            : Array.isArray(p.decksCombatKnown) ? p.decksCombatKnown : [];
        const pile = Array.isArray(p.decks && p.decks.upgradeCombat) ? p.decks.upgradeCombat
            : Array.isArray(p.decksUpgradeCombatKnown) ? p.decksUpgradeCombatKnown : [];
        const counts = new Map();
        for (const name of deckCards) counts.set(name, (counts.get(name) || 0) + 1);
        const pairs = [...counts.entries()].filter(([, count]) => count >= 2).map(([name]) => name);
        for (const name of pile) {
            const card = FS_CATALOG.card('combat', p.faction, name);
            if (!card || Number(card.kl || 0) !== 0 || (counts.get(name) || 0) >= 2) continue;
            for (const remove of pairs) {
                if (remove === name) continue;
                out.push({ kind: 'combat-upgrade', card: name, remove,
                    label: 'Боевое улучшение · ' + name + ' (заменить пару «' + remove + '»)' });
            }
        }
        return out;
    }

    requisitionOptions(state, seat, cardId) {
        const card = FS_REQUISITIONS.card(cardId);
        const p = state && state.players && state.players[seat];
        if (!card || !p) return [];
        const board = BoardSetup.of(state);
        const active = this.engine.system(state, board && board.currentSystem);
        switch (card.effect) {
            case 'structure':
                return this.requisitionStructureOptions(state, seat, card);
            case 'swap':
                return active ? this.engine.neighbors(state, active.id).map(id => {
                    const other = this.engine.system(state, id);
                    return other ? { kind: 'swap', system: id,
                        label: 'Обменять с системой ' + other.tile } : null;
                }).filter(Boolean) : [];
            case 'rout': {
                if (!active) return [];
                const out = [];
                for (const id of this.engine.neighbors(state, active.id)) {
                    const system = this.engine.system(state, id);
                    if (!this.isHostileSystem(state, seat, system)) continue;
                    for (const area of system.areas) {
                        const units = this.engine.unitsAt(state, id, area.pos);
                        if (!units.length) continue;
                        out.push({ kind: 'rout', system: id, pos: area.pos,
                            label: 'Деморализовать отряды · ' + this.setupTargetLabel(state, system, area.pos) });
                    }
                }
                return out;
            }
            case 'unit':
                return this.requisitionSingleUnitOptions(state, seat, card);
            case 'unit-pair':
                return this.requisitionUnitPairOptions(state, seat, card);
            case 'efficient':
                return this.upgradeOptions(state, seat, false);
            case 'combat-upgrade':
                return this.upgradeOptions(state, seat, true);
            case 'prepare':
                return (p.eventHand || []).map((name, handIndex) => {
                    const event = FS_CATALOG.cardNamed('events', name);
                    return { kind: 'prepare', event: name, handIndex,
                        label: 'Событие · ' + (event ? event.name : name) };
                });
            default:
                return [];
        }
    }

    cmdResolveRequisition(state, seat, cmd) {
        const board = BoardSetup.of(state);
        const error = this.setupGuard(state, seat, BoardSetup.REQUISITION_EFFECT);
        if (error) return error;
        const pending = board.record.pendingRequisition;
        if (!pending || pending.seat !== seat || pending.system !== board.currentSystem)
            return { ok: false, error: 'Нет ожидающей реквизиции.' };
        const card = FS_REQUISITIONS.card(pending.card);
        const options = card ? this.requisitionOptions(state, seat, card.id) : [];
        const index = Number(cmd.choice);
        if (!Number.isInteger(index) || index < 0 || index >= options.length)
            return { ok: false, error: 'Выберите один из доступных способов разрешить реквизицию.' };
        const option = options[index];
        const result = this.applyRequisitionChoice(state, seat, card, option);
        if (!result.ok) return result;
        board.record.pendingRequisition = null;
        board.setStage(BoardSetup.FORCES);
        this.engine.log(state, seat, state.players[seat].name + ' разрешил реквизицию «' + card.name + '».');
        return { ok: true };
    }

    applyRequisitionChoice(state, seat, card, option) {
        const p = state.players[seat];
        if (option.kind === 'structure') {
            if (!this.engine.canTakeStructure(state, seat, option.structure).ok
                || !this.engine.canPlaceStructure(state, seat, option.system, option.pos, { ignoreControl: true }).ok)
                return { ok: false, error: 'На выбранном мире больше нельзя поставить эту постройку.' };
            this.engine.addStructure(state, seat, option.structure, option.system, option.pos);
            return { ok: true };
        }
        if (option.kind === 'swap') {
            const active = this.engine.system(state, BoardSetup.of(state).currentSystem);
            const other = this.engine.system(state, option.system);
            if (!active || !other || !this.engine.neighbors(state, active.id).includes(other.id))
                return { ok: false, error: 'Для обмена выберите соседнюю систему.' };
            const row = active.row, col = active.col;
            active.row = other.row; active.col = other.col;
            other.row = row; other.col = col;
            return { ok: true };
        }
        if (option.kind === 'rout') {
            const system = this.engine.system(state, option.system);
            const units = this.engine.unitsAt(state, option.system, option.pos);
            if (!system || !this.isHostileSystem(state, seat, system)
                || !this.engine.neighbors(state, BoardSetup.of(state).currentSystem).includes(system.id)
                || !units.length)
                return { ok: false, error: 'В этой области больше нельзя применить «Skirmish».' };
            for (const unit of units) this.engine.routeUnit(state, unit);
            return { ok: true };
        }
        if (option.kind === 'unit' || option.kind === 'unit-pair') {
            const placements = option.kind === 'unit' ? [option] : (option.placements || []);
            const unitCounts = new Map();
            for (const place of placements) unitCounts.set(place.unit, (unitCounts.get(place.unit) || 0) + 1);
            for (const [unit, n] of unitCounts) {
                const def = FS_CATALOG.unit(p.faction, unit);
                if (!def || Number(def.kl || 0) !== Number(card.kl || 0)
                    || (card.unitType === 'ship' ? def.type !== 'ship' : def.type === 'ship')
                    || (p.supply.units[unit] || 0) < n) return { ok: false, error: 'Не хватает подходящих отрядов в резерве.' };
            }
            for (const place of placements) {
                if (!this.unitFits(state, place.system, place.pos, 1)) return { ok: false, error: 'В выбранной области больше нет места.' };
            }
            if (!this.requisitionUnitsFit(state, seat, placements, !!card.routed))
                return { ok: false, error: 'После этой расстановки не поместятся начальные силы.' };
            for (const [unit, n] of unitCounts) PlayerEntity.of(state, seat).takeSupply(unit, n);
            for (const place of placements) {
                const piece = this.engine.addUnit(state, seat, place.unit, place.system, place.pos);
                if (card.routed) this.engine.routeUnit(state, piece);
            }
            return { ok: true };
        }
        if (option.kind === 'order-upgrade') {
            const upgrade = FS_CATALOG.card('orders', p.faction, option.card);
            const pile = p.decks && p.decks.upgradeOrder;
            if (!upgrade || Number(upgrade.kl || 0) !== 0 || !Array.isArray(pile) || !pile.includes(option.card)
                || (p.upgrades || []).some(u => u.name === option.card))
                return { ok: false, error: 'Это улучшение приказа больше недоступно.' };
            p.upgrades.push({ name: upgrade.name, used: false, order: upgrade.order });
            pile.splice(pile.indexOf(option.card), 1);
            p.eventTokens = (p.eventTokens || 0) + 1;
            return { ok: true };
        }
        if (option.kind === 'combat-upgrade') {
            const upgrade = FS_CATALOG.card('combat', p.faction, option.card);
            const deck = PlayerEntity.of(state, seat).combatDeck;
            if (!upgrade || Number(upgrade.kl || 0) !== 0 || !deck.upgradeOptions().includes(option.card)
                || deck.count(option.card) >= 2 || !deck.replacePair(option.remove, option.card))
                return { ok: false, error: 'Это боевое улучшение больше недоступно.' };
            if (card.effect === 'efficient') p.eventTokens = (p.eventTokens || 0) + 1;
            return { ok: true };
        }
        if (option.kind === 'prepare') {
            const hand = p.eventHand || [];
            const at = Number(option.handIndex);
            if (!Number.isInteger(at) || at < 0 || at >= hand.length || hand[at] !== option.event)
                return { ok: false, error: 'Эта карта события больше не в руке.' };
            const name = hand.splice(at, 1)[0];
            p.noEventShuffleRound = 1;
            this.engine.initializeEventDeck(state, seat);
            p.decks.event = [name].concat((p.decks.event || []).filter(n => n !== name));
            return { ok: true };
        }
        return { ok: false, error: 'Неизвестный эффект реквизиции.' };
    }
}
