import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScripts } from './browser-scripts.mjs';
import { setupCommand } from './fs-setup-helper.mjs';

const { get } = loadScripts(['js/fs/FSData.js', 'js/fs/FSEffects.js', 'js/fs/FSRules.js', 'js/fs/FSView.js', 'js/fs/FSGame.js']);
const data = get('FS_DATA'), rules = get('FS_RULES'), FSView = get('FSView'), Game = get('FSGame');
function game(count = 2, seed = 13, start = 0) {
    return rules.newGame({ seed, interactiveSetup: true,
        players: Array.from({ length: count }, (_, i) => ({ name: 'P' + i, faction: data.factions[(start + i) % data.factions.length].id })) });
}
function cmd(s, type, fields = {}, seat = s.setup.turn) { return rules.apply(s, seat, { type, ...fields }); }
function tile(s) { const cell = rules.setupLegalCells(s)[0]; assert.ok(cmd(s, 'placeSystemTile', { tile: s.setup.hands[s.setup.turn][0], ...cell }).ok); return s.systems.at(-1); }

test('starting forces and objective pools are separate from the reserves', () => {
    const s = game(4);
    for (const p of s.players) {
        const f = data.factions.find(x => x.id === p.faction);
        assert.equal(s.setup.hands[p.seat].length, 3);
        assert.equal(data.tiles.find(t => t.id === s.setup.hands[p.seat][0]).home, p.faction);
        for (const u of f.units) {
            assert.equal(p.initialForces.units[u.id] || 0, u.start || 0);
            assert.equal(p.supply.units[u.id], u.max - (u.start || 0));
        }
        for (const kind of ['factory', 'city', 'bastion']) assert.equal(p.supply.structures[kind] + p.initialForces.structures[kind], 3);
        assert.equal(p.objectivePool.length, 6);
        for (const other of s.players) assert.equal(p.objectivePool.filter(faction => faction === other.faction).length, other.seat === p.seat ? 0 : 2);
    }
});

test('force placement validates turn, area, type, capacity and supports undo', () => {
    const s = game(), seat = s.setup.turn, sys = tile(s);
    const def = rules.faction(s, seat).units.find(u => u.start && u.type === 'ground');
    const ship = rules.faction(s, seat).units.find(u => u.start && u.type === 'ship');
    const world = sys.areas.find(a => a.world), empty = sys.areas.find(a => !a.world);
    const before = s.players[seat].initialForces.units[def.id];
    assert.equal(cmd(s, 'setupUnit', { unit: def.id, pos: world.pos }, 1-seat).ok, false);
    assert.equal(cmd(s, 'setupUnit', { unit: def.id, pos: empty.pos }).ok, false);
    assert.equal(cmd(s, 'setupUnit', { unit: ship.id, pos: world.pos }).ok, false);
    assert.equal(cmd(s, 'setupUnit', { unit: def.id, pos: 'invalid' }).ok, false);
    assert.ok(cmd(s, 'setupUnit', { unit: def.id, pos: world.pos }).ok);
    assert.equal(s.players[seat].initialForces.units[def.id], before - 1);
    const piece = s.units.at(-1);
    assert.ok(cmd(s, 'removeSetupForce', { kind: 'unit', id: piece.id }).ok);
    assert.equal(s.players[seat].initialForces.units[def.id], before);
    assert.equal(s.units.some(u => u.id === piece.id), false);
    while (s.players[seat].initialForces.units[def.id] > 0 && rules.unitsAt(s, sys.id, world.pos).length < rules.capacity(s, sys.id, world.pos)) assert.ok(cmd(s, 'setupUnit', { unit: def.id, pos: world.pos }).ok);
    if (rules.unitsAt(s, sys.id, world.pos).length === rules.capacity(s, sys.id, world.pos)) assert.equal(cmd(s, 'setupUnit', { unit: def.id, pos: world.pos }).ok, false);
    assert.ok(cmd(s, 'setupStructure', { structure: 'factory', pos: world.pos }).ok);
    assert.equal(cmd(s, 'setupStructure', { structure: 'factory', pos: world.pos }).ok, false);
    assert.equal(cmd(s, 'placeSystemTile', { tile: s.setup.hands[seat][0], row: 1, col: 0 }).ok, false);
});

test('finishing a tile cannot strand remaining forces; all must be placed by the third tile', () => {
    const s = game(); tile(s);
    const seat = s.setup.turn;
    s.players[seat].initialForces.units = { [rules.faction(s, seat).units.find(u => u.type === 'ground').id]: 100 };
    assert.equal(cmd(s, 'finishSetupForces').ok, false);
    assert.equal(s.setup.stage, 'forces');
    s.players[seat].initialForces.units = {};
    s.players[seat].initialForces.structures = {};
    assert.ok(cmd(s, 'finishSetupForces').ok);
});

test('objective restrictions and choice of place are enforced, including two-player duplicate case', () => {
    const s = game(4), sys = tile(s), seat = s.setup.turn;
    s.players[seat].initialForces = { units: {}, structures: {} };
    assert.ok(cmd(s, 'finishSetupForces').ok);
    assert.equal(s.setup.stage, 'objectives');
    const options = rules.setupObjectiveOptions(s), areas = options[0].areas;
    assert.equal(options.length, 3);
    assert.equal(cmd(s, 'setupObjective', { faction: s.players[seat].faction, pos: areas[0] }).ok, false);
    assert.ok(cmd(s, 'setupObjective', { faction: options[0].faction, pos: areas[0] }).ok);
    assert.equal(cmd(s, 'setupObjective', { faction: options[0].faction, pos: areas[1] }).ok, false);
    assert.equal(cmd(s, 'setupObjective', { faction: options[1].faction, pos: areas[0] }).ok, false);
    assert.ok(cmd(s, 'setupObjective', { faction: options[1].faction, pos: areas[1] }).ok);
    assert.equal(s.objectives.filter(x => x.system === sys.id).length, 2);
    const two = game(2), sys2 = tile(two), first = two.setup.turn;
    two.players[first].initialForces = { units: {}, structures: {} };
    assert.ok(cmd(two, 'finishSetupForces').ok);
    const choice = rules.setupObjectiveOptions(two)[0];
    assert.ok(cmd(two, 'setupObjective', { faction: choice.faction, pos: choice.areas.at(-1) }).ok);
    assert.equal(two.objectives.filter(x => x.system === sys2.id).length, 1);
    assert.equal(two.setup.stage, 'tile');
});

test('setup completes for all factions and 2–4 players, with reverse storm order and conservation', () => {
    for (const count of [2,3,4]) for (let start = 0; start < data.factions.length; start++) {
        const s = game(count, start + 1, start), stormTurns = [], placedTurns = [];
        let steps = 0;
        while (s.phase === 'setup' && steps++ < 250) {
            const seat = s.setup.turn, stage = s.setup.stage;
            if (stage === 'storms') stormTurns.push(seat);
            if (stage === 'tile') placedTurns.push(seat);
            const move = setupCommand(rules, data, s);
            const result = rules.apply(s, seat, move);
            assert.ok(result.ok, `${count} players ${start}: ${JSON.stringify(move)} ${result.error}`);
        }
        assert.equal(s.phase, 'planning');
        assert.deepEqual(stormTurns, placedTurns.slice(-count).reverse());
        assert.equal(s.storms.length, count);
        for (const p of s.players) {
            const faction = data.factions.find(f => f.id === p.faction);
            for (const u of faction.units) {
                assert.equal(s.units.filter(x => x.seat === p.seat && x.unit === u.id).length, u.start || 0);
                assert.equal((p.initialForces.units[u.id] || 0), 0);
                assert.equal(p.supply.units[u.id], u.max - (u.start || 0));
            }
            for (const kind of ['factory','city','bastion']) assert.equal(s.structures.filter(x => x.seat === p.seat && x.type === kind).length, faction.start[kind] || 0);
            assert.equal(p.objectivePool.length, 0);
        }
        assert.equal(s.objectives.length, count * 2 * (count - 1));
        for (const o of s.objectives) assert.notEqual(s.systems.find(x => x.id === o.system).owner, s.players.find(p => p.faction === o.faction).seat);
    }
});

test('shared storm edges are occupied from both sides; invalid commands do not advance turns', () => {
    const s = game();
    while (s.setup.stage !== 'storms') {
        const move = setupCommand(rules, data, s);
        assert.ok(rules.apply(s, s.setup.turn, move).ok);
    }
    const a = s.systems[0], b = s.systems.find(x => rules.neighbors(s, a.id).includes(x.id));
    const side = rules.sideBetween(s, a.id, b.id), opposite = rules.sideBetween(s, b.id, a.id);
    const first = s.setup.turn;
    assert.equal(cmd(s, 'setupStorm', { system: a.id, side }, 1-first).ok, false);
    assert.ok(cmd(s, 'setupStorm', { system: a.id, side }).ok);
    const second = s.setup.turn;
    assert.equal(cmd(s, 'setupStorm', { system: b.id, side: opposite }).ok, false);
    assert.equal(s.setup.turn, second);
    assert.equal(s.storms.length, 1);
    assert.ok(cmd(s, 'setupStorm', rules.setupStormEdges(s)[0]).ok);
    assert.equal(s.phase, 'planning');
});

test('setup board clicks send selected force and objective commands; storm selection chooses a system', () => {
    const s = game(), sys = tile(s), seat = s.setup.turn;
    const client = Object.create(Game.prototype), sent = [];
    Object.assign(client, { state: rules.view(s, seat), mode: 'setupUnit', pending: { unit: 'test-unit' }, status: '',
        view: { scene: { pick: () => ({ hit: true, pickedMesh: { metadata: { fs: 'area', system: sys.id, pos: 'TL' } } }) } },
        net: { cmd: c => sent.push(c) }, refresh() {}, highlightSetupTargets() {} });
    client.onClick(20, 30);
    assert.equal(sent[0].type, 'setupUnit'); assert.equal(sent[0].pos, 'TL');
    client.mode = 'setupObjective'; client.pending = { faction: 'opponent' };
    client.onClick(20, 30);
    assert.equal(sent[1].type, 'setupObjective'); assert.equal(sent[1].faction, 'opponent');
    client.state.setup.stage = 'storms'; client.mode = 'idle'; client.pending = null;
    client.onClick(20, 30);
    assert.equal(client.mode, 'setupStorm'); assert.equal(client.pending.system, sys.id);
});
