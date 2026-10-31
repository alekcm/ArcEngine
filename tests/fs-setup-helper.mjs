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
