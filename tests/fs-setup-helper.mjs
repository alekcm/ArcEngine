// A deterministic setup player shared by the rule and WebSocket tests.
export function setupCommand(rules, data, state) {
    const setup = state.setup, seat = state.seat ?? setup.turn;
    if (setup.stage === 'tile') {
        const cell = (setup.legalCells || rules.setupLegalCells(state))[0];
        const tile = (setup.hand || setup.hands[seat])[0];
        return { type: 'placeSystemTile', tile, row: cell.row, col: cell.col };
    }
    if (setup.stage === 'forces') {
        const sys = state.systems.find(s => s.id === setup.currentSystem);
        const initial = state.players[seat].initialForces;
        const faction = data.factions.find(f => f.id === state.players[seat].faction);
        for (const [id, n] of Object.entries(initial.units)) {
            if (!n) continue;
            const def = faction.units.find(u => u.id === id);
            const area = sys.areas.find(a => (def.type === 'ground') === !!a.world && rules.unitsAt(state, sys.id, a.pos).length < rules.capacity(state, sys.id, a.pos));
            if (area) return { type: 'setupUnit', unit: id, pos: area.pos };
        }
        for (const [type, n] of Object.entries(initial.structures)) {
            if (!n) continue;
            const area = sys.areas.find(a => a.world && !rules.structuresAt(state, sys.id, a.pos).length);
            if (area) return { type: 'setupStructure', structure: type, pos: area.pos };
        }
        return { type: 'finishSetupForces' };
    }
    if (setup.stage === 'objectives') {
        const option = (setup.objectiveOptions || rules.setupObjectiveOptions(state))[0];
        return { type: 'setupObjective', faction: option.faction, pos: option.areas[0] };
    }
    if (setup.stage === 'storms') {
        const edge = (setup.stormEdges || rules.setupStormEdges(state))[0];
        return { type: 'setupStorm', ...edge };
    }
    throw new Error('unknown setup stage: ' + setup.stage);
}

// The planning phase of the whole table: the players lay their tokens one at a
// time, in a circle, until everybody is done. Returns the number of the tokens.
export function placeAllOrders(rules, state, pick = null, order = null) {
    // Two tokens of every kind, so the whole hand is four different orders unless
    // the caller names one.
    const kinds = ['advance', 'deploy', 'strategize', 'dominate'];
    let placed = 0;
    let guard = 0;
    while (state.phase === 'planning' && guard++ < 200) {
        const seat = state.turn;
        const legal = state.systems.filter(sys => rules.canPlaceOrder(state, seat, sys.id));
        if (!legal.length) break;
        const sys = pick ? pick(state, seat, legal) : legal[placed % legal.length];
        const p = state.players[seat];
        // The kind has to have a token left in the hand of this player.
        const kind = order || kinds.find(k => !p.placedOf || (p.placedOf[k] || 0) < 2);
        const res = rules.apply(state, seat, { type: 'placeOrder', system: sys.id, order: kind });
        if (!res.ok) break;
        placed++;
    }
    return placed;
}

// One step of a combat, done by the seat that has to act: the reinforcement is
// taken without tokens, a card of the hand is played and the damage of the seat
// goes to all of its pieces. Returns what was done (or null at the end).
export function playCombatStep(rules, state, seat) {
    const c = state.combat;
    if (!c) return null;
    const side = seat === c.attacker ? 'attacker' : seat === c.defender ? 'defender' : null;
    if (!side) return null;
    if (c.step === 'reinforce-attacker' || c.step === 'reinforce-defender') {
        return rules.apply(state, seat, { type: 'combat', action: 'reinforce', count: 0 });
    }
    if (c.step === 'choose-attacker' || c.step === 'choose-defender') {
        if (!(c.cards[side].hand || []).length) return null;
        return rules.apply(state, seat, { type: 'combat', action: 'playCard', index: 0 });
    }
    if (c.step === 'reveal') {
        // The engine turns the chosen cards over by itself; nothing to send.
        return { ok: true, reveal: true };
    }
    if (c.step === 'damage-attacker' || c.step === 'damage-defender') {
        const targets = rules.damageCandidates(state, side).map(x => x.id);
        return rules.apply(state, seat, { type: 'combat', action: 'damage', targets });
    }
    if (c.step === 'retreat') {
        return rules.apply(state, seat, { type: 'combat', action: 'retreat' });
    }
    return null;
}
