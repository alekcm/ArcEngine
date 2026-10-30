// Every command of the engine is tried on a real game: the rules must answer
// without a crash and the state must change as the rules say.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScripts } from './browser-scripts.mjs';

const { get } = loadScripts(['js/fs/FSData.js', 'js/fs/FSRules.js']);
const FS_DATA = get('FS_DATA');
const FS_RULES = get('FS_RULES');

const FACTIONS = FS_DATA.factions.map(f => f.id);

function newGame(count = 2, seed = 11) {
    return FS_RULES.newGame({
        seed,
        players: FACTIONS.slice(0, count).map((id, i) => ({ name: 'Игрок ' + (i + 1), faction: id })),
    });
}

// The system of the player: where his units stand.
function homeSystem(s, seat) {
    return s.systems.find(x => s.units.some(u => u.seat === seat && u.system === x.id));
}

// The system of the other player: a foreign world to fight for.
function foreignSystem(s, seat) {
    const other = s.players.find(p => p.seat !== seat);
    return s.systems.find(x => x.owner === other.seat);
}

// The planning phase of everybody: the operations phase begins.
function enterOperations(s) {
    for (const p of s.players) {
        for (let i = 0; i < FS_RULES.ORDER_TOKENS; i++) {
            const sys = s.systems.find(x => FS_RULES.canPlaceOrder(s, p.seat, x.id));
            FS_RULES.apply(s, p.seat, { type: 'placeOrder', system: sys.id, order: 'advance' });
        }
    }
    assert.equal(s.phase, 'operations');
}

test('the operations: the token may go to the event deck instead of the order', () => {
    const s = newGame(2);
    const sys = homeSystem(s, 0);
    enterOperations(s);
    const tokens = s.players[0].eventTokens;
    const res = FS_RULES.apply(s, 0, { type: 'resolveOrder', system: sys.id, toEventDeck: true });
    assert.equal(res.ok, true, res.error);
    assert.equal(s.players[0].eventTokens, tokens + 1, 'the token lies on the event deck');
});

test('the deploy order: a structure stands on a friendly world', () => {
    const s = newGame(2);
    // The second tile of the player: a unit makes a world his.
    const sys = s.systems.find(x => x.owner === 0 && x.id !== homeSystem(s, 0).id);
    const world = sys.areas.find(a => a.world);
    const unit = s.units.find(u => u.seat === 0);
    unit.system = sys.id;
    unit.area = world.pos;
    s.players[0].materiel = 14;
    s.phase = 'operations';
    s.order = { seat: 0, order: 'deploy', system: sys.id };
    const res = FS_RULES.apply(s, 0, { type: 'buyStructure', structure: 'city', system: sys.id, pos: world.pos });
    assert.equal(res.ok, true, res.error);
    assert.equal(s.structures.filter(x => x.seat === 0 && x.type === 'city').length, 1);
    assert.equal(s.players[0].materiel, 14 - FS_RULES.structureStats('city').cost);
    // The second structure of the order is not allowed.
    const again = FS_RULES.apply(s, 0, { type: 'buyStructure', structure: 'bastion', system: sys.id, pos: world.pos });
    assert.equal(again.ok, false);
    // The end of the order.
    const end = FS_RULES.apply(s, 0, { type: 'finishDeploy' });
    assert.equal(end.ok, true, end.error);
});

test('the strategize order: an upgrade is bought and used once per round', () => {
    const s = newGame(2);
    const sys = homeSystem(s, 0);
    const faction = s.players[0].faction;
    const card = FS_DATA.orders.find(c => c.faction === faction && c.kl <= FS_RULES.commandLevel(s, 0));
    assert.ok(card, 'the faction has an order upgrade');
    // The token of the strategize order and the operations phase.
    enterOperations(s);
    const orders = FS_RULES.availableOrders(s, 0);
    assert.ok(orders.length, 'the player has an order to resolve');
    const top = FS_RULES.system(s, orders[0].system);
    top.tokens[top.tokens.length - 1].order = 'strategize';
    s.players[0].materiel = 14;
    const opened = FS_RULES.apply(s, 0, { type: 'resolveOrder', system: orders[0].system });
    assert.equal(opened.ok, true, opened.error);
    assert.equal(s.order.order, 'strategize');
    const res = FS_RULES.apply(s, 0, { type: 'buyUpgrade', kind: 'order', card: card.name });
    assert.equal(res.ok, true, res.error);
    assert.equal(s.players[0].upgrades.length, 1);
    // The upgrade works once per round.
    const use = FS_RULES.apply(s, 0, { type: 'useUpgrade', card: card.name });
    assert.equal(use.ok, true, use.error);
    const again = FS_RULES.apply(s, 0, { type: 'useUpgrade', card: card.name });
    assert.equal(again.ok, false, 'the upgrade is used only once per round');
    // The token goes to the event deck.
    const end = FS_RULES.apply(s, 0, { type: 'finishStrategize' });
    assert.equal(end.ok, true, end.error);
    assert.equal(s.players[0].eventTokens, 1);
});

test('the strategize order: a combat upgrade goes to the deck', () => {
    const s = newGame(2);
    const sys = homeSystem(s, 0);
    const faction = s.players[0].faction;
    const card = FS_DATA.combat.find(c => c.faction === faction && c.upgrade && c.kl <= FS_RULES.commandLevel(s, 0));
    assert.ok(card, 'the faction has a combat upgrade');
    const deck = s.players[0].decks.combat.length;
    s.players[0].materiel = 14;
    s.phase = 'operations';
    s.order = { seat: 0, order: 'strategize', system: sys.id };
    const res = FS_RULES.apply(s, 0, { type: 'buyUpgrade', kind: 'combat', card: card.name });
    assert.equal(res.ok, true, res.error);
    assert.equal(s.players[0].decks.combat.length, deck, 'the deck keeps its size');
    assert.ok(s.players[0].decks.combat.includes(card.name), 'the card is in the deck');
});

test('the advance order: the orbital strike hits the enemy world', () => {
    const s = newGame(2);
    const sys = foreignSystem(s, 0);
    assert.ok(sys, 'the system of the other player');
    // The ships of the player and an enemy unit on a world of the system.
    const ship = s.units.find(u => u.seat === 0 && FS_RULES.unitOf(s, u).type === 'ship');
    const void0 = sys.areas.find(a => !a.world);
    ship.system = sys.id;
    ship.area = void0.pos;
    const world = sys.areas.find(a => a.world);
    const foe = s.units.find(u => u.seat === 1);
    foe.system = sys.id;
    foe.area = world.pos;
    s.order = { seat: 0, order: 'advance', system: sys.id, phase: 'move' };
    // The end of the movement: no contested area — the strike is possible.
    const end = FS_RULES.apply(s, 0, { type: 'endAdvance' });
    assert.equal(end.ok, true, end.error);
    assert.equal(s.order.phase, 'strike');
    const targets = FS_RULES.orbitalStrikeTargets(s, 0);
    assert.ok(targets.some(t => t.pos === world.pos), 'the enemy world is a target');
    const res = FS_RULES.apply(s, 0, { type: 'orbitalStrike', system: sys.id, pos: world.pos, ships: [ship.id] });
    assert.equal(res.ok, true, res.error);
    assert.equal(s.order, null, 'the order is over');
});

test('the advance order: a friendly world may not be struck', () => {
    const s = newGame(2);
    const sys = foreignSystem(s, 0);
    const ship = s.units.find(u => u.seat === 0 && FS_RULES.unitOf(s, u).type === 'ship');
    const void0 = sys.areas.find(a => !a.world);
    ship.system = sys.id;
    ship.area = void0.pos;
    s.order = { seat: 0, order: 'advance', system: sys.id, phase: 'strike' };
    const targets = FS_RULES.orbitalStrikeTargets(s, 0);
    assert.ok(targets.length > 0, 'there is a target');
    for (const t of targets) {
        assert.notEqual(FS_RULES.control(s, 0, t.system, t.pos), 'friendly');
    }
    const res = FS_RULES.apply(s, 0, { type: 'orbitalStrike', system: sys.id, pos: targets[0].pos, ships: [ship.id] });
    assert.equal(res.ok, true, res.error);
});

test('the combat: a reinforcement token adds a unit', () => {
    const s = newGame(2);
    const sys = s.systems[0];
    const area = sys.areas.find(a => a.world);
    for (const u of s.units) { u.system = sys.id; u.area = area.pos; }
    s.players[0].assets.reinforcement = 2;
    FS_RULES.startCombat(s, 0, 1, sys.id, area.pos);
    const res = FS_RULES.apply(s, 0, { type: 'combat', action: 'reinforce', count: 1 });
    assert.equal(res.ok, true, res.error);
    assert.equal(s.players[0].assets.reinforcement, 1);
    assert.equal(s.combat.reinforce.attacker, 1);
    // The defender may not use more tokens than he has.
    const bad = FS_RULES.apply(s, 1, { type: 'combat', action: 'reinforce', count: 5 });
    assert.equal(bad.ok, false);
});

test('the refresh phase: the storm moves once per player', () => {
    const s = newGame(2);
    // The planning phase of the first round and the orders of everybody.
    enterOperations(s);
    let guard = 0;
    while (s.phase === 'operations' && guard++ < 40) {
        const seat = s.turn;
        const orders = FS_RULES.availableOrders(s, seat);
        if (!orders.length) break;
        FS_RULES.apply(s, seat, { type: 'resolveOrder', system: orders[0].system });
        if (s.order && s.order.order === 'advance') {
            FS_RULES.apply(s, seat, { type: 'endAdvance' });
            FS_RULES.apply(s, seat, { type: 'finishAdvance' });
        }
        if (s.combat) {
            let g2 = 0;
            while (s.combat && g2++ < 20) {
                const c = s.combat;
                const side = seat === c.attacker ? 'attacker' : seat === c.defender ? 'defender' : null;
                if (!side) break;
                if (c.step.indexOf('reinforce') === 0) {
                    FS_RULES.apply(seat, seat, { type: 'combat', action: 'reinforce', count: 0 });
                    continue;
                }
                if (c.step === 'choose-attacker' || c.step === 'choose-defender') {
                    FS_RULES.apply(seat, seat, { type: 'combat', action: 'skipCard' });
                    continue;
                }
                if (c.step === 'damage-attacker' || c.step === 'damage-defender') {
                    FS_RULES.apply(seat, seat, { type: 'combat', action: 'damage', targets: [] });
                    continue;
                }
                break;
            }
            if (s.combat) FS_RULES.apply(s.combat.loser, { type: 'combat', action: 'retreat' });
        }
    }
    assert.equal(s.phase, 'refresh');
    assert.ok(s.event, 'the first player plays the event');
    // The storm of the player: the card shows the direction.
    const card = s.event.card || s.event.top;
    assert.ok(card, 'the card of the event is known');
    const storm = s.storms[0];
    const dirs = (card.storm && card.storm[0] !== 'any') ? card.storm : ['N', 'E', 'S', 'W'];
    let res = null, dir = dirs[0];
    for (const d of dirs) {
        res = FS_RULES.apply(s, s.event.seat, { type: 'moveStorm', storm: storm.id, dir: d });
        if (res.ok) { dir = d; break; }
    }
    assert.equal(res.ok, true, res.error);
    assert.equal(storm.moved[s.event.seat], true);
    // The same player may not move the same storm twice.
    const again = FS_RULES.apply(s, s.event.seat, { type: 'moveStorm', storm: storm.id, dir });
    assert.equal(again.ok, false);
    // The event is played and the next player is up.
    if (s.event.drawn.length) {
        FS_RULES.apply(s, s.event.seat, { type: 'drawEvent', card: s.event.drawn[0] });
    }
    const end = FS_RULES.apply(s, s.event.seat, { type: 'resolveEvent' });
    assert.equal(end.ok, true, end.error);
    assert.ok(s.event, 'the second player plays the event');
    // The second player may move the same storm.
    const storm2 = s.storms[0];
    const card2 = s.event.card || s.event.top;
    const dirs2 = (card2.storm && card2.storm[0] !== 'any') ? card2.storm : ['N', 'E', 'S', 'W'];
    let res2 = null;
    for (const d of dirs2) {
        res2 = FS_RULES.apply(s, s.event.seat, { type: 'moveStorm', storm: storm2.id, dir: d });
        if (res2.ok) break;
    }
    assert.equal(res2.ok, true, res2.error);
});

test('the rally: a routed unit stands again', () => {
    const s = newGame(2);
    const unit = s.units.find(u => u.seat === 0);
    unit.routed = true;
    const res = FS_RULES.apply(s, 0, { type: 'rally', unit: unit.id });
    assert.equal(res.ok, true, res.error);
    assert.equal(unit.routed, false);
});
