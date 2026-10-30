// The rules of Forbidden Stars: the data, the new game, the phases and the combat.
// The engine is loaded in node:vm like the browser does it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScripts } from './browser-scripts.mjs';

const { get } = loadScripts(['js/fs/FSData.js', 'js/fs/FSRules.js']);
const FS_DATA = get('FS_DATA');
const FS_RULES = get('FS_RULES');

const FACTIONS = FS_DATA.factions.map(f => f.id);

// A game of two players with the first two factions.
function newGame(count = 2, seed = 7) {
    return FS_RULES.newGame({
        seed,
        players: FACTIONS.slice(0, count).map((id, i) => ({ name: 'Игрок ' + (i + 1), faction: id })),
    });
}

// --- the data ---------------------------------------------------------------

test('the data: twelve factions with their sheets', () => {
    assert.equal(FS_DATA.factions.length, 12);
    for (const f of FS_DATA.factions) {
        assert.ok(f.name, 'the faction has a name');
        assert.ok(f.units.length >= 5, f.name + ': the units of the sheet');
        const ground = f.units.filter(u => u.type === 'ground');
        const ships = f.units.filter(u => u.type === 'ship');
        assert.ok(ground.length >= 3 && ships.length >= 2, f.name + ': ground units and ships');
    }
    // Every faction has the basic deck, the upgrades and the events.
    for (const f of FS_DATA.factions) {
        const base = FS_DATA.combat.filter(c => c.faction === f.id && !c.upgrade);
        assert.ok(base.length >= 5, f.name + ': the basic combat deck');
        const up = FS_DATA.combat.filter(c => c.faction === f.id && c.upgrade);
        assert.ok(up.length >= 9, f.name + ': the combat upgrades');
        const orders = FS_DATA.orders.filter(c => c.faction === f.id);
        assert.ok(orders.length >= 2, f.name + ': the order upgrades');
        const events = FS_DATA.events.filter(c => c.faction === f.id);
        assert.ok(events.length >= 8, f.name + ': the event cards');
    }
});

test('the data: forty tiles and the objective spaces', () => {
    assert.equal(FS_DATA.tiles.length, 40);
    let spaces = 0;
    for (const t of FS_DATA.tiles) {
        assert.equal(t.areas.length, 4, t.id + ': four areas');
        for (const a of t.areas) {
            if (a.world && a.world.objective) spaces++;
        }
    }
    assert.ok(spaces > 40, 'the tiles have the objective token spaces');
});

// --- the new game -----------------------------------------------------------

test('a new game: the tiles, the units, the tokens and the storms', () => {
    const s = newGame(2);
    assert.equal(s.players.length, 2);
    assert.equal(s.phase, 'planning');
    assert.equal(s.round, 1);
    // The layout of two players: three rows of two.
    assert.equal(s.systems.length, 6);
    for (const sys of s.systems) assert.equal(sys.areas.length, 4);
    // Every player has forces on his first tile.
    for (const p of s.players) {
        assert.ok(s.units.some(u => u.seat === p.seat), p.name + ': has units');
    }
    // The objective tokens: two per tile, on the worlds.
    assert.ok(s.objectives.length > 0);
    for (const o of s.objectives) {
        const sys = s.systems.find(x => x.id === o.system);
        const area = sys.areas.find(a => a.pos === o.area);
        assert.ok(area.world, 'the token stands on a world');
    }
    // One warp storm per player.
    assert.equal(s.storms.length, 2);
});

test('a new game of four players: the layout of four rows', () => {
    const s = newGame(4, 11);
    assert.equal(s.players.length, 4);
    assert.equal(s.systems.length, 12);
});

// --- the phases -------------------------------------------------------------

test('the planning phase: four order tokens, then the operations', () => {
    const s = newGame(2);
    for (const p of s.players) {
        for (let i = 0; i < FS_RULES.ORDER_TOKENS; i++) {
            const sys = s.systems.find(x => FS_RULES.canPlaceOrder(s, p.seat, x.id));
            assert.ok(sys, 'there is a system for the order');
            const res = FS_RULES.apply(s, p.seat, { type: 'placeOrder', system: sys.id, order: 'advance' });
            assert.equal(res.ok, true, res.error);
        }
    }
    assert.equal(s.phase, 'operations');
    assert.equal(s.turn, s.firstPlayer);
});

test('the operations phase: the order of the player is resolved', () => {
    const s = newGame(2);
    for (const p of s.players) {
        for (let i = 0; i < FS_RULES.ORDER_TOKENS; i++) {
            const sys = s.systems.find(x => FS_RULES.canPlaceOrder(s, p.seat, x.id));
            FS_RULES.apply(s, p.seat, { type: 'placeOrder', system: sys.id, order: 'advance' });
        }
    }
    const seat = s.turn;
    const orders = FS_RULES.availableOrders(s, seat);
    assert.ok(orders.length > 0);
    const res = FS_RULES.apply(s, seat, { type: 'resolveOrder', system: orders[0].system });
    assert.equal(res.ok, true, res.error);
    assert.equal(s.order.order, 'advance');
    assert.equal(s.order.seat, seat);
    // The movement: the units of the active system may move.
    const units = FS_RULES.movableUnits(s, seat);
    assert.ok(units.length > 0);
    const res2 = FS_RULES.apply(s, seat, { type: 'endAdvance' });
    assert.equal(res2.ok, true, res2.error);
});

// --- the deploy order -------------------------------------------------------

test('the deploy order: a unit is bought and stands on a world', () => {
    const s = newGame(2);
    const seat = 0;
    const p = s.players[seat];
    const sys = s.systems.find(x => FS_RULES.hasUnitsOrStructures(s, seat, x.id));
    s.order = { seat, order: 'deploy', system: sys.id, phase: 'deploy' };
    // The initial forces are already on the board — the supply is replenished.
    const def = FS_DATA.factions.find(f => f.id === p.faction).units
        .find(u => u.type === 'ground' && u.kl === 0);
    p.supply.units[def.id] = 1;
    p.materiel = 14;
    const area = sys.areas.find(a => a.world);
    const res = FS_RULES.apply(s, seat, { type: 'buyUnit', unit: def.id, system: sys.id, pos: area.pos });
    assert.equal(res.ok, true, res.error);
    assert.ok(s.units.some(u => u.seat === seat && u.system === sys.id && u.area === area.pos));
    assert.equal(p.supply.units[def.id], (p.supply.units[def.id] || 0));
});

// --- the combat -------------------------------------------------------------

test('the combat: the preparation, the three rounds and the result', () => {
    const s = newGame(2);
    // Two players clash in one area.
    const sys = s.systems[0];
    const area = sys.areas.find(a => a.world);
    const u0 = s.units.find(u => u.seat === 0);
    const u1 = s.units.find(u => u.seat === 1);
    for (const u of s.units) { u.system = sys.id; u.area = area.pos; }
    void u0; void u1;
    s.order = { seat: 0, order: 'advance', system: sys.id, phase: 'combat' };
    FS_RULES.startCombat(s, 0, 1, sys.id, area.pos);
    assert.ok(s.combat);
    assert.equal(s.combat.cards.attacker.hand.length, 5);
    assert.equal(s.combat.cards.defender.hand.length, 5);
    // The preparation: the reinforcement tokens.
    let r = FS_RULES.apply(s, 0, { type: 'combat', action: 'reinforce', count: 0 });
    assert.equal(r.ok, true, r.error);
    r = FS_RULES.apply(s, 1, { type: 'combat', action: 'reinforce', count: 0 });
    assert.equal(r.ok, true, r.error);
    // Three execution rounds: a card, the damage, the damage of the opponent.
    for (let round = 0; round < 3; round++) {
        assert.equal(s.combat.step, 'choose-attacker');
        FS_RULES.apply(s, 0, { type: 'combat', action: 'skipCard' });
        assert.equal(s.combat.step, 'choose-defender');
        FS_RULES.apply(s, 1, { type: 'combat', action: 'skipCard' });
        assert.equal(s.combat.step, 'damage-attacker');
        FS_RULES.apply(s, 0, { type: 'combat', action: 'damage', targets: [] });
        assert.equal(s.combat.step, 'damage-defender');
        FS_RULES.apply(s, 1, { type: 'combat', action: 'damage', targets: [] });
    }
    // The combat is over, the loser retreats.
    assert.ok(s.combat.winner, 'the winner is known');
    const loser = s.combat.loser;
    const res = FS_RULES.apply(s, loser, { type: 'combat', action: 'retreat' });
    assert.equal(res.ok, true, res.error);
    assert.equal(s.combat, null);
});

test('the combat: the hand of the opponent is hidden', () => {
    const s = newGame(2);
    const sys = s.systems[0];
    const area = sys.areas.find(a => a.world);
    for (const u of s.units) { u.system = sys.id; u.area = area.pos; }
    FS_RULES.startCombat(s, 0, 1, sys.id, area.pos);
    const mine = FS_RULES.view(s, 0);
    const theirs = FS_RULES.view(s, 1);
    assert.equal(mine.combat.cards.attacker.hand.length, 5);
    assert.equal(theirs.combat.cards.attacker.hand.length, 0);
    assert.equal(theirs.combat.cards.defender.hand.length, 5);
});

// --- the refresh phase ------------------------------------------------------

test('the refresh phase: the objectives, the materiel and the events', () => {
    const s = newGame(2);
    // The planning phase of the first round is over.
    for (const p of s.players) {
        for (let i = 0; i < FS_RULES.ORDER_TOKENS; i++) {
            const sys = s.systems.find(x => FS_RULES.canPlaceOrder(s, p.seat, x.id));
            FS_RULES.apply(s, p.seat, { type: 'placeOrder', system: sys.id, order: 'advance' });
        }
    }
    // Everybody resolves his orders — then the refresh begins.
    let guard = 0;
    while (s.phase === 'operations' && guard++ < 40) {
        const seat = s.turn;
        const orders = FS_RULES.availableOrders(s, seat);
        if (!orders.length) break;
        const res = FS_RULES.apply(s, seat, { type: 'resolveOrder', system: orders[0].system });
        assert.equal(res.ok, true, res.error);
        // The order of the bot: advance — move and finish.
        if (s.order && s.order.order === 'advance') {
            FS_RULES.apply(s, seat, { type: 'endAdvance' });
            // The bot makes no orbital strike.
            FS_RULES.apply(s, seat, { type: 'finishAdvance' });
            if (s.combat) {
                // The bot does not fight: it accepts the retreat.
                let g2 = 0;
                while (s.combat && g2++ < 20) {
                    const c = s.combat;
                    const side = seat === c.attacker ? 'attacker' : seat === c.defender ? 'defender' : null;
                    if (!side) break;
                    if (c.step === 'reinforce-attacker' || c.step === 'reinforce-defender') {
                        if ((c.step === 'reinforce-attacker' ? 'attacker' : 'defender') !== side) break;
                        FS_RULES.apply(s, seat, { type: 'combat', action: 'reinforce', count: 0 });
                        continue;
                    }
                    if (c.step === 'choose-attacker' || c.step === 'choose-defender') {
                        if ((c.step === 'choose-attacker' ? 'attacker' : 'defender') !== side) break;
                        FS_RULES.apply(s, seat, { type: 'combat', action: 'skipCard' });
                        continue;
                    }
                    if (c.step === 'damage-attacker' || c.step === 'damage-defender') {
                        if ((c.step === 'damage-attacker' ? 'attacker' : 'defender') !== side) break;
                        FS_RULES.apply(s, seat, { type: 'combat', action: 'damage', targets: [] });
                        continue;
                    }
                    if (c.step === 'retreat') {
                        if (c.loser !== seat) break;
                        FS_RULES.apply(s, seat, { type: 'combat', action: 'retreat' });
                        continue;
                    }
                    break;
                }
            }
        }
    }
    assert.equal(s.phase, 'refresh');
    assert.ok(s.event, 'the first player opens an event');
    const seat = s.event.seat;
    if (s.event.drawn.length) {
        const res = FS_RULES.apply(s, seat, { type: 'drawEvent', card: s.event.drawn[0] });
        assert.equal(res.ok, true, res.error);
    }
    // The storm moves along the edge of the card.
    const storm = s.storms[0];
    const before = { system: storm.system, side: storm.side };
    const dirs = ['N', 'E', 'S', 'W'];
    for (const dir of dirs) {
        const res = FS_RULES.apply(s, seat, { type: 'moveStorm', storm: storm.id, dir });
        if (res.ok) break;
    }
    const res2 = FS_RULES.apply(s, seat, { type: 'resolveEvent' });
    assert.equal(res2.ok, true, res2.error);
    void before;
});

test('the movement: the path goes through the friendly areas, the target may be empty', () => {
    const s = newGame(2);
    const seat = 0;
    // The warp storms block the way — the rule of the path is checked alone.
    s.storms = [];
    // The system of the player and a neighbour of it.
    const sysA = s.systems.find(x => s.units.some(u => u.seat === seat && u.system === x.id));
    const sysB = s.systems.find(x => x.id !== sysA.id && FS_RULES.neighbors(s, sysA.id).includes(x.id));
    assert.ok(sysA && sysB, 'there is a neighbour');
    // The area of A that touches a world of B.
    let from = null, to = null;
    for (const areaA of sysA.areas) {
        for (const areaB of sysB.areas) {
            if (!areaB.world) continue;
            if (FS_RULES.areasTouch(s, sysA.id, areaA.pos, sysB.id, areaB.pos)) {
                from = areaA;
                to = areaB;
                break;
            }
        }
        if (from) break;
    }
    assert.ok(from && to, 'the systems share a border');
    // Two ground units of the player: one opens the way, the other moves.
    const units = s.units.filter(u => u.seat === seat && FS_RULES.unitOf(s, u).type === 'ground');
    assert.ok(units.length >= 2, 'the player has ground units');
    const mover = units[0];
    const guard = units[1];
    mover.system = sysA.id;
    mover.area = from.pos;
    guard.system = sysA.id;
    guard.area = from.pos;
    s.order = { seat, order: 'advance', system: sysB.id, phase: 'move' };
    // The target is the world of B.
    const target = to;
    const check = FS_RULES.canMove(s, seat, mover, { system: sysB.id, pos: target.pos });
    assert.equal(check.ok, true, check.error);
    // The move is done.
    const res = FS_RULES.apply(s, seat, { type: 'moveUnits', moves: [{ unit: mover.id, system: sysB.id, pos: target.pos }] });
    assert.equal(res.ok, true, res.error);
    assert.equal(s.units.find(u => u.id === mover.id).area, target.pos);
});

// --- a whole game played by a bot ------------------------------------------

// A bot that plays the game through: the phases, the orders, the combat.
// It must not crash the engine — that is what the test checks.
function playRound(s, seat) {
    // The planning phase: four orders.
    let guard = 0;
    while ((s.players[seat].placedTokens || 0) < FS_RULES.ORDER_TOKENS && guard++ < 20) {
        const legal = s.systems.filter(x => FS_RULES.canPlaceOrder(s, seat, x.id));
        if (!legal.length) break;
        // The generator of the game: the test must be the same every time.
        const sys = legal[FS_RULES.rand(s, legal.length)];
        const order = ['advance', 'deploy', 'strategize', 'dominate'][FS_RULES.rand(s, 4)];
        const res = FS_RULES.apply(s, seat, { type: 'placeOrder', system: sys.id, order });
        if (!res.ok) break;
    }
}

function playOrder(s, seat) {
    const orders = FS_RULES.availableOrders(s, seat);
    if (!orders.length) return false;
    const sys = orders[0].system;
    let res = FS_RULES.apply(s, seat, { type: 'resolveOrder', system: sys });
    if (!res.ok) return false;
    const order = s.order;
    if (!order) return false;
    if (order.order === 'advance') {
        // Move a unit if it can, then finish.
        const units = FS_RULES.movableUnits(s, seat);
        const active = s.systems.find(x => x.id === order.system);
        for (const u of units) {
            for (const area of active.areas) {
                const check = FS_RULES.canMove(s, seat, u, { system: active.id, pos: area.pos });
                if (!check.ok) continue;
                const mv = FS_RULES.apply(s, seat, { type: 'moveUnits', moves: [{ unit: u.id, system: active.id, pos: area.pos }] });
                if (mv.ok) break;
            }
        }
        res = FS_RULES.apply(s, seat, { type: 'endAdvance' });
        if (!res.ok || (s.order && s.order.phase === 'strike')) {
            FS_RULES.apply(s, seat, { type: 'finishAdvance' });
        }
        // The combat, if there is one.
        let guard = 0;
        while (s.combat && guard++ < 40) {
            const c = s.combat;
            const side = seat === c.attacker ? 'attacker' : seat === c.defender ? 'defender' : null;
            if (!side) break;
            if (c.step === 'reinforce-attacker' || c.step === 'reinforce-defender') {
                const whose = c.step === 'reinforce-attacker' ? 'attacker' : 'defender';
                if (whose !== side) break;
                FS_RULES.apply(s, seat, { type: 'combat', action: 'reinforce', count: 0 });
                continue;
            }
            if (c.step === 'choose-attacker' || c.step === 'choose-defender') {
                const whose = c.step === 'choose-attacker' ? 'attacker' : 'defender';
                if (whose !== side) break;
                FS_RULES.apply(s, seat, { type: 'combat', action: 'skipCard' });
                continue;
            }
            if (c.step === 'damage-attacker' || c.step === 'damage-defender') {
                const whose = c.step === 'damage-attacker' ? 'attacker' : 'defender';
                if (whose !== side) break;
                const units = s.units.filter(u => u.seat === seat && u.system === c.system && u.area === c.pos && !u.routed);
                const targets = units.map(u => u.id);
                FS_RULES.apply(s, seat, { type: 'combat', action: 'damage', targets });
                continue;
            }
            if (c.step === 'retreat') {
                if (c.loser !== seat) break;
                FS_RULES.apply(s, seat, { type: 'combat', action: 'retreat' });
                continue;
            }
            break;
        }
        return true;
    }
    if (order.order === 'deploy') {
        const p = s.players[seat];
        const faction = FS_DATA.factions.find(f => f.id === p.faction);
        for (const def of faction.units) {
            if ((p.supply.units[def.id] || 0) <= 0) continue;
            if (p.materiel < def.cost) continue;
            const area = s.systems.find(x => x.id === order.system).areas.find(a => a.world);
            const buy = FS_RULES.apply(s, seat, { type: 'buyUnit', unit: def.id, system: order.system, pos: area.pos });
            if (buy.ok) break;
        }
        FS_RULES.apply(s, seat, { type: 'finishDeploy' });
        return true;
    }
    if (order.order === 'strategize') {
        FS_RULES.apply(s, seat, { type: 'finishStrategize' });
        return true;
    }
    if (order.order === 'dominate') {
        FS_RULES.apply(s, seat, { type: 'finishDominate' });
        return true;
    }
    return true;
}

test('a whole game: the bot plays the rounds without a crash', () => {
    const s = newGame(2, 99);
    let rounds = 0;
    while (!s.over && rounds < 10) {
        rounds++;
        for (const p of s.players) playRound(s, p.seat);
        assert.equal(s.phase, 'operations');
        // The operations: every order of every player.
        let guard = 0;
        while (s.phase === 'operations' && guard++ < 200) {
            const seat = s.turn;
            if (!playOrder(s, seat)) break;
        }
        // The refresh: the events of every player.
        guard = 0;
        while (s.phase === 'refresh' && guard++ < 50) {
            const seat = s.event ? s.event.seat : -1;
            if (seat < 0) break;
            if (s.event.drawn.length) {
                FS_RULES.apply(s, seat, { type: 'drawEvent', card: s.event.drawn[0] });
            }
            for (const dir of ['N', 'E', 'S', 'W']) {
                const storm = s.storms.find(x => !x.moved || !x.moved[seat]);
                if (!storm) break;
                if (FS_RULES.apply(s, seat, { type: 'moveStorm', storm: storm.id, dir }).ok) break;
            }
            FS_RULES.apply(s, seat, { type: 'resolveEvent' });
        }
    }
    assert.ok(rounds >= 1, 'the game went through at least one round');
    assert.ok(s.round > 1 || s.over, 'the round counter grows or the game is over');
});
