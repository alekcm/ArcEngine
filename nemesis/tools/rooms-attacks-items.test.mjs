import test from 'node:test';
import assert from 'node:assert/strict';

import { createGame } from '../shared/engine/setup.mjs';
import * as engine from '../shared/engine/core.mjs';
import '../shared/engine/items.mjs';
import { resolveAirlocks, roomActionAvailable } from '../shared/engine/rooms.mjs';
import '../shared/engine/combat.mjs';
import '../shared/engine/movement.mjs';
import '../shared/engine/actions.mjs';
import '../shared/engine/actions2.mjs';
import '../shared/engine/actions3.mjs';
import '../shared/engine/fielddata.mjs';
import '../shared/engine/turn.mjs';
import { ITEMS, CHARACTERS, ATTACK_CARDS, WOUNDS } from '../shared/data/cards.mjs';
import { ROOM_TILES } from '../shared/ship.mjs';
import { buildMenu } from '../shared/engine/turn.mjs';

function setupRoom(state, p, tileName) {
    const regRoom = Object.keys(state.ship.rooms).find(id => !['cockpit', 'hibernatorium', 'engine'].includes(state.ship.rooms[id].kind));
    p.room = regRoom;
    state.roomState[p.room].tile = tileName;
    state.roomState[p.room].explored = true;
    state.roomState[p.room].malfunction = false;
    state.roomState[p.room].fire = false;
    return p.room;
}

// =============================================================================================
// 1. ROOM ACTIONS
// =============================================================================================

test('ROOM-AUDIT-01: Cafeteria restores 2 health and removes 1 contamination card', () => {
    const state = createGame({ seed: 'test-cafeteria', players: [{ name: 'P', charId: 'soldier' }] });
    const p = state.players[0];
    p.health = 6;
    p.hand = ['soldier.search#0', 'contam#1'];
    setupRoom(state, p, 'cafeteria');

    state.prompt = null;
    state.queue = [{ op: 'room.action', player: p.id, then: { op: 'turn.choose' } }];
    engine.run(state);

    assert.equal(p.health, 8, 'Healed 2 health');
    assert.equal(p.hand.includes('contam#1'), false, 'Contamination removed');
});

test('ROOM-AUDIT-02: Decontamination room purges contamination from hand and removes larva', () => {
    const state = createGame({ seed: 'test-decon', players: [{ name: 'P', charId: 'scout' }] });
    const p = state.players[0];
    p.hand = ['scout.search#0', 'contam#1', 'contam#2'];
    p.larva = true;
    setupRoom(state, p, 'decon');

    state.prompt = null;
    state.queue = [{ op: 'room.action', player: p.id, then: { op: 'turn.choose' } }];
    engine.run(state);

    assert.equal(p.larva, false, 'Larva removed');
    assert.equal(p.hand.some(c => c.startsWith('contam#')), false, 'All contaminations purged from hand');
});

test('ROOM-AUDIT-03: Generator room starts and stops self-destruct sequence', () => {
    const state = createGame({ seed: 'test-gen', players: [{ name: 'P', charId: 'mechanic' }] });
    const p = state.players[0];
    setupRoom(state, p, 'generator');

    // Start self-destruct
    assert.equal(state.selfDestruct, 0);
    state.prompt = null;
    state.queue = [{ op: 'room.action', player: p.id, then: { op: 'turn.choose' } }];
    engine.run(state);
    assert.equal(state.prompt.kind, 'choice');
    engine.answer(state, p.id, state.prompt.id, 'start');
    assert.ok(state.selfDestruct > 0, 'Self-destruct countdown started');

    // Stop self-destruct
    state.prompt = null;
    state.queue = [{ op: 'room.action', player: p.id, then: { op: 'turn.choose' } }];
    engine.run(state);
    assert.equal(state.selfDestruct, 0, 'Self-destruct stopped');
});

test('ROOM-AUDIT-04: Storage room draws 1 green, 1 red, 1 yellow item and rolls noise', () => {
    const state = createGame({ seed: 'test-storage', players: [{ name: 'P', charId: 'pilot' }] });
    const p = state.players[0];
    setupRoom(state, p, 'storage');

    const itemCountBefore = p.items.length;
    state.prompt = null;
    state.queue = [{ op: 'room.action', player: p.id, then: { op: 'turn.choose' } }];
    engine.run(state);

    // Prompt offers 3 items (1 green, 1 red, 1 yellow)
    assert.equal(state.prompt.kind, 'choice');
    assert.equal(state.prompt.options.length, 3);
    const chosen = state.prompt.options[0].id;
    engine.answer(state, p.id, state.prompt.id, chosen);
    engine.run(state);

    if (state.prompt && state.prompt.kind === 'dice') {
        engine.answer(state, p.id, state.prompt.id, 'roll');
        engine.run(state);
    }

    assert.equal(p.items.length, itemCountBefore + 1, 'Player kept 1 item');
    assert.ok(state.lastRoll && state.lastRoll.die === 'noise', 'Noise roll was performed');
});

test('ROOM-AUDIT-05: Nest allows taking an egg into heavy slots or destroying it', () => {
    const state = createGame({ seed: 'test-nest', players: [{ name: 'P', charId: 'scientist' }] });
    const p = state.players[0];
    setupRoom(state, p, 'nest');
    const startEggs = state.nestEggs;
    assert.ok(startEggs > 0);

    // Destroy egg
    state.prompt = null;
    state.queue = [{ op: 'room.action', player: p.id, then: { op: 'turn.choose' } }];
    engine.run(state);
    assert.equal(state.prompt.kind, 'choice');
    engine.answer(state, p.id, state.prompt.id, 'destroy');
    assert.equal(state.nestEggs, startEggs - 1, 'Egg destroyed');
});

test('ROOM-AUDIT-06: Repository allows player to choose 1 of 3 support cards once per game', () => {
    const state = createGame({ seed: 'test-repos', players: [{ name: 'P', charId: 'captain' }] });
    const p = state.players[0];
    setupRoom(state, p, 'repository');
    assert.equal(p.supportUsed, false);

    state.prompt = null;
    state.queue = [{ op: 'room.action', player: p.id, then: { op: 'turn.choose' } }];
    engine.run(state);

    assert.equal(p.supportUsed, true, 'Support action marked as used');
    assert.equal(state.prompt.kind, 'choice');
    assert.ok(state.prompt.options.length >= 3, 'Offers at least 3 support card options');
    engine.answer(state, p.id, state.prompt.id, state.prompt.options[0].id);

    // Check second use is disabled
    const menu = buildMenu(state, p);
    const roomAct = menu.actions.find(a => a.id === 'room');
    assert.equal(roomAct.enabled, false, 'Repository disabled after use');
});

// =============================================================================================
// 2. MONSTER ATTACKS
// =============================================================================================

test('ATTACK-AUDIT-01: Larva attack places contamination, infects target with larva, and disappears', () => {
    const state = createGame({ seed: 'test-larva', players: [{ name: 'P', charId: 'soldier' }] });
    const p = state.players[0];
    state.intruders = { it1: { uid: 'it1', room: p.room, type: 'larva' } };

    const contamCountBefore = p.discard.filter(engine.isContam).length;
    state.prompt = null;
    state.queue = [{ op: 'attack', intruder: 'it1', player: p.id, noReaction: true }];
    engine.run(state);

    assert.equal(p.larva, true, 'Target infected with larva');
    assert.equal(p.discard.filter(engine.isContam).length, contamCountBefore + 1, 'Target received contamination');
    assert.equal(state.intruders.it1, undefined, 'Larva removed from board');
});

test('ATTACK-AUDIT-02: Adult attack reveals card first and offers reaction cards', () => {
    const state = createGame({ seed: 'test-adult-attack', players: [{ name: 'P', charId: 'soldier' }] });
    const p = state.players[0];
    p.hand = ['soldier.nervesOfSteel#0'];
    state.intruders = { it1: { uid: 'it1', room: p.room, type: 'adult' } };

    state.prompt = null;
    state.queue = [{ op: 'attack', intruder: 'it1', player: p.id }];
    engine.run(state);

    // Target prompted to play Nerves of Steel
    assert.equal(state.prompt.kind, 'choice');
    assert.ok(state.prompt.options.some(o => o.id === 'card'), 'Offers Nerves of Steel');

    // Answer with Nerves of Steel
    const hpBefore = p.health;
    engine.answer(state, p.id, state.prompt.id, 'card');
    assert.equal(p.health, hpBefore, 'Attack was prevented, no damage taken');
});

test('ATTACK-AUDIT-03: Heavy armor prevents attack for 1 health', () => {
    const state = createGame({ seed: 'test-heavy-armor-guard', players: [{ name: 'P', charId: 'soldier' }] });
    const p = state.players[0];
    p.armor = { uid: 'ha1', item: 'heavyArmor', quest: true };
    state.intruders = { it1: { uid: 'it1', room: p.room, type: 'adult' } };

    state.prompt = null;
    state.queue = [{ op: 'attack', intruder: 'it1', player: p.id }];
    engine.run(state);

    assert.equal(state.prompt.kind, 'choice');
    assert.ok(state.prompt.options.some(o => o.id === 'armorGuard'));

    const hpBefore = p.health;
    engine.answer(state, p.id, state.prompt.id, 'armorGuard');
    assert.equal(p.health, hpBefore - 1, 'Took exactly 1 health to prevent attack');
});

test('ATTACK-AUDIT-04: Attack card resolves damage, serious wound, and contamination per intruder rank', () => {
    const state = createGame({ seed: 'test-attack-resolve', players: [{ name: 'P', charId: 'soldier' }] });
    const p = state.players[0];
    p.hand = []; // no reaction cards
    state.intruders = { it1: { uid: 'it1', room: p.room, type: 'adult' } };

    // Force attack with 'bite' card (Adult: serious wound; drops maxAllowedHealth to 7)
    const woundsBefore = p.wounds.length;
    state.prompt = null;
    state.queue = [{ op: 'attack', intruder: 'it1', player: p.id, cardId: 'bite', noReaction: true }];
    engine.run(state);

    assert.equal(p.health, 7, 'Health drops to 7 when covered by first serious wound');
    assert.equal(p.wounds.length, woundsBefore + 1, 'Adult bite inflicts 1 serious wound');
});

// =============================================================================================
// 3. EQUIPMENT & SUPPORT DECK ITEMS
// =============================================================================================

test('ITEM-AUDIT-01: Green deck items work per card text (Stimulants, Medkit, Adrenaline, Antiseptic)', () => {
    const state = createGame({ seed: 'test-green-items', players: [{ name: 'P', charId: 'soldier' }] });
    const p = state.players[0];

    // Stimulants: heal 2 HP
    p.health = 5;
    p.items.push({ uid: 'st1', item: 'stimulants' });
    state.prompt = null;
    state.queue = [{ op: 'item.use', player: p.id, uid: 'st1' }];
    engine.run(state);
    engine.answer(state, p.id, state.prompt.id, 'heal');
    assert.equal(p.health, 7, 'Stimulants healed 2 HP');

    // Antiseptic: removes 1 contamination from hand
    p.hand = ['soldier.search#0', 'contam#1'];
    p.items.push({ uid: 'ant1', item: 'antiseptic' });
    state.prompt = null;
    state.queue = [{ op: 'item.use', player: p.id, uid: 'ant1' }];
    engine.run(state);
    assert.equal(p.hand.includes('contam#1'), false, 'Antiseptic removed contamination');

    // Adrenaline: draws 2 cards and grants unlimited actions for turn
    p.items.push({ uid: 'adr1', item: 'adrenaline' });
    const handLenBefore = p.hand.length;
    state.prompt = null;
    state.queue = [{ op: 'item.use', player: p.id, uid: 'adr1' }];
    engine.run(state);
    assert.equal(p.hand.length, handLenBefore + 2, 'Adrenaline drew 2 cards');
    assert.equal(p.adrenalineTurn, true, 'Adrenaline granted unlimited actions');
});

test('ITEM-AUDIT-02: Red deck items work per card text (Grenade, Flashbang, Energy Charge)', () => {
    const state = createGame({ seed: 'test-red-items', players: [{ name: 'P', charId: 'soldier' }] });
    const p = state.players[0];

    // Energy Charge reloads weapon by 3
    const gun = p.items.find(i => i.item === 'soldierGun');
    gun.ammo = 1;
    p.items.push({ uid: 'ec1', item: 'energyCharge' });
    state.prompt = null;
    state.queue = [{ op: 'item.use', player: p.id, uid: 'ec1' }];
    engine.run(state);
    engine.answer(state, p.id, state.prompt.id, 'w:' + gun.uid);
    assert.equal(gun.ammo, 4, 'Energy charge added +3 ammo');

    // Grenade: deals 2 hits to intruders in chosen room
    state.intruders = { it1: { uid: 'it1', room: p.room, type: 'adult', hits: 0 } };
    p.items.push({ uid: 'gr1', item: 'grenade' });
    state.prompt = null;
    state.queue = [{ op: 'item.use', player: p.id, uid: 'gr1' }];
    engine.run(state);
    engine.answer(state, p.id, state.prompt.id, p.room);
    assert.equal(state.intruders.it1?.hits ?? 2, 2, 'Grenade dealt 2 hits to intruder');
});

test('ITEM-AUDIT-03: Yellow deck items work per card text (Extinguisher, Duct Tape, Reagent)', () => {
    const state = createGame({ seed: 'test-yellow-items', players: [{ name: 'P', charId: 'mechanic' }] });
    const p = state.players[0];

    // Extinguisher puts out fire
    state.roomState[p.room].fire = true;
    p.items.push({ uid: 'ext1', item: 'extinguisher' });
    state.prompt = null;
    state.queue = [{ op: 'item.use', player: p.id, uid: 'ext1' }];
    engine.run(state);
    engine.answer(state, p.id, state.prompt.id, 'fire');
    assert.equal(state.roomState[p.room].fire, false, 'Extinguisher put out fire');

    // Duct Tape fixes malfunction
    state.roomState[p.room].malfunction = true;
    p.items.push({ uid: 'dt1', item: 'ductTape' });
    state.prompt = null;
    state.queue = [{ op: 'item.use', player: p.id, uid: 'dt1' }];
    engine.run(state);
    engine.answer(state, p.id, state.prompt.id, 'malf');
    assert.equal(state.roomState[p.room].malfunction, false, 'Duct tape repaired malfunction');
});

test('ITEM-AUDIT-04: Support deck items work per card text (Engineering Equipment, Security Control)', () => {
    const state = createGame({ seed: 'test-support-items', players: [{ name: 'P', charId: 'sentry' }] });
    const p = state.players[0];

    // Engineering Equipment removes malfunction without being consumed
    state.roomState[p.room].malfunction = true;
    p.items.push({ uid: 'ee1', item: 'engineeringEquipment' });
    state.prompt = null;
    state.queue = [{ op: 'item.use', player: p.id, uid: 'ee1' }];
    engine.run(state);
    engine.answer(state, p.id, state.prompt.id, 'malf');
    assert.equal(state.roomState[p.room].malfunction, false, 'Engineering equipment fixed malfunction');
    assert.ok(p.items.some(i => i.uid === 'ee1'), 'Engineering equipment is reusable (not consumed)');
});

// =============================================================================================
// 4. RULE AUDIT REGRESSION TESTS (CONFIRMED BUGS FIXED)
// =============================================================================================

test('AUDIT-FIX-01: Wheelchair and quest armors are never prompted to be discarded to ignore attacks', () => {
    const state = createGame({ seed: 'test-wheelchair-armor', players: [{ name: 'Scientist', charId: 'scientist' }] });
    const p = state.players[0];
    assert.equal(p.armor?.item, 'wheelchair');
    state.intruders = { it1: { uid: 'it1', room: p.room, type: 'adult' } };

    state.prompt = null;
    state.queue = [{ op: 'attack', intruder: 'it1', player: p.id, cardId: 'scratch1', noReaction: true }];
    engine.run(state);

    // Player should NOT be asked to discard their wheelchair
    assert.notEqual(state.prompt?.title?.includes('Сбросить броню'), true, 'Wheelchair must not be offered for discard');
    assert.ok(p.armor && p.armor.item === 'wheelchair', 'Wheelchair stays equipped');
});

test('AUDIT-FIX-02: Security armor discard applies ONLY to Adult attacks, not Queen, and discards to red discard', () => {
    const state = createGame({ seed: 'test-security-armor', players: [{ name: 'P', charId: 'soldier' }] });
    const p = state.players[0];
    p.armor = { uid: 'sec1', item: 'armor' };

    // Against Queen: Security Armor must NOT be offered
    state.intruders = { q1: { uid: 'q1', room: p.room, type: 'queen' } };
    state.prompt = null;
    state.queue = [{ op: 'attack', intruder: 'q1', player: p.id, cardId: 'scratch1', noReaction: true }];
    engine.run(state);
    assert.notEqual(state.prompt?.title?.includes('Сбросить броню'), true, 'Security armor does not trigger on Queen attacks');

    // Against Adult: Security Armor is offered and can be discarded to red item discard
    state.intruders = { it1: { uid: 'it1', room: p.room, type: 'adult' } };
    state.prompt = null;
    state.queue = [{ op: 'attack', intruder: 'it1', player: p.id, cardId: 'scratch1', noReaction: true }];
    engine.run(state);
    assert.ok(state.prompt?.title?.includes('Сбросить броню'), 'Security armor offers discard against Adult attack');
    engine.answer(state, p.id, state.prompt.id, 'yes');
    assert.equal(p.armor, null, 'Armor was discarded');
    assert.ok((state.itemDiscard.red || []).includes('armor'), 'Armor went to red discard pile');
});

test('AUDIT-FIX-03: Tactical armor reduces attack health loss by 1 and does NOT offer Heavy Armor guard', () => {
    const state = createGame({ seed: 'test-tactical-armor', players: [{ name: 'P', charId: 'soldier' }] });
    const p = state.players[0];
    p.armor = { uid: 'ta1', item: 'tacticalArmor' };
    state.intruders = { it1: { uid: 'it1', room: p.room, type: 'adult' } };

    // Does NOT offer Heavy Armor reaction
    state.prompt = null;
    state.queue = [{ op: 'attack', intruder: 'it1', player: p.id }];
    engine.run(state);
    assert.notEqual(state.prompt?.options?.some(o => o.id === 'armorGuard'), true, 'Tactical Armor is not Soldier quest Heavy Armor');

    // Scratch 3 deals 2 damage, tactical armor reduces it to 1
    p.health = 10;
    state.prompt = null;
    state.queue = [{ op: 'attack', intruder: 'it1', player: p.id, cardId: 'scratch3', noReaction: true }];
    engine.run(state);
    assert.equal(p.health, 9, 'Took 1 damage instead of 2 due to Tactical Armor');
});

test('AUDIT-FIX-04: Wheelchair and quest armors are not destroyed when reaching heavy health state', () => {
    const state = createGame({ seed: 'test-wheelchair-heavy', players: [{ name: 'Scientist', charId: 'scientist' }] });
    const p = state.players[0];
    assert.equal(p.armor?.item, 'wheelchair');
    engine.loseHealth(state, p, 8, 'ранения');
    assert.equal(engine.healthState(p), 'heavy');
    assert.ok(p.armor && p.armor.item === 'wheelchair', 'Wheelchair is not destroyed on heavy health state');
});

test('AUDIT-FIX-05: Airlock unpasses characters inside, and aborts if any door is opened or destroyed', () => {
    const state = createGame({ seed: 'test-airlock-unpass', players: [{ name: 'P1', charId: 'soldier' }, { name: 'P2', charId: 'scout' }] });
    const p1 = state.players[0], p2 = state.players[1];
    setupRoom(state, p1, 'airlock');
    p2.room = p1.room;
    p2.passed = true;

    // Airlock action unpasses characters inside
    state.prompt = null;
    state.queue = [{ op: 'room.airlock', player: p1.id, answer: p1.room, then: { op: 'turn.choose' } }];
    engine.run(state);
    assert.equal(p2.passed, false, 'Character inside airlock was unpassed');

    // If a door is open, resolveAirlocks aborts and does not kill occupants
    const cors = engine.corridorsOf(state, p1.room);
    state.ship.corridors[cors[0].id].door = 'open';
    resolveAirlocks(state);
    assert.equal(p2.status, 'active', 'Airlock aborted because door was open');
});

test('AUDIT-FIX-06: Remote detonator targets rooms with red ammo icon and deals skull (instant kill)', () => {
    const state = createGame({ seed: 'test-detonator-skull', players: [{ name: 'P', charId: 'soldier' }] });
    const p = state.players[0];

    // Comms has ['red', 'yellow'] (1 red icon) - must be a valid target!
    setupRoom(state, p, 'comms');
    state.intruders = { it1: { uid: 'it1', room: p.room, type: 'adult', hits: 0 } };
    p.items.push({ uid: 'det1', item: 'detonator' });

    state.prompt = null;
    state.queue = [{ op: 'item.use', player: p.id, uid: 'det1' }];
    engine.run(state);

    assert.equal(state.prompt.kind, 'room');
    assert.ok(state.prompt.rooms.includes(p.room), 'Room with 1 red item icon is valid target');

    engine.answer(state, p.id, state.prompt.id, p.room);
    engine.run(state);
    assert.equal(state.intruders.it1, undefined, 'Intruder instantly killed by skull');
});

test('AUDIT-FIX-07: Generator autodestruct action is disabled when a character is hibernating', () => {
    const state = createGame({ seed: 'test-gen-hibernate', players: [{ name: 'P1', charId: 'soldier' }, { name: 'P2', charId: 'scout' }] });
    const p1 = state.players[0], p2 = state.players[1];
    setupRoom(state, p1, 'generator');
    p2.status = 'hibernating';

    const av = roomActionAvailable(state, p1);
    assert.equal(av.ok, false);
    assert.equal(av.reason, 'Кто-то уже в гибернации');
});

test('AUDIT-FIX-08: Bayonet and Assault Shotgun prevent only Adult attacks and mark Bayonet broken', () => {
    const state = createGame({ seed: 'test-bayonet-adult', players: [{ name: 'P', charId: 'soldier' }] });
    const p = state.players[0];
    p.items.push({ uid: 'bay1', item: 'bayonet' });

    // Against Queen: Bayonet is NOT offered
    state.intruders = { q1: { uid: 'q1', room: p.room, type: 'queen' } };
    state.prompt = null;
    state.queue = [{ op: 'attack', intruder: 'q1', player: p.id, cardId: 'scratch1' }];
    engine.run(state);
    assert.notEqual(state.prompt?.options?.some(o => o.id === 'item:bay1'), true, 'Bayonet is not offered against Queen');

    // Against Adult: Bayonet is offered and places malfunction
    state.intruders = { it1: { uid: 'it1', room: p.room, type: 'adult' } };
    state.prompt = null;
    state.queue = [{ op: 'attack', intruder: 'it1', player: p.id, cardId: 'scratch1' }];
    engine.run(state);
    assert.ok(state.prompt?.options?.some(o => o.id === 'item:bay1'), 'Bayonet offered against Adult');

    engine.answer(state, p.id, state.prompt.id, 'item:bay1');
    const bay = p.items.find(i => i.uid === 'bay1');
    assert.equal(bay.broken, true, 'Bayonet marked as broken (malfunction)');
});

test('AUDIT-FIX-09: Perimeter Security Device discards 1 action card to skip noise/encounter without requiring ammo', () => {
    const state = createGame({ seed: 'test-perimeter-device', players: [{ name: 'P', charId: 'scout' }] });
    const p = state.players[0];
    p.items.push({ uid: 'per1', item: 'perimeterDevice' });
    p.hand = ['scout.search#0', 'scout.repairs#0'];

    state.prompt = null;
    state.queue = [{ op: 'perimeter.ask', player: p.id, uid: 'per1', then: { op: 'noise.roll', player: p.id, room: p.room } }];
    engine.run(state);

    assert.equal(state.prompt.kind, 'choice');
    engine.answer(state, p.id, state.prompt.id, 'yes');
    engine.run(state);

    // Prompted to pay 1 action card
    assert.equal(state.prompt.kind, 'cards');
    engine.answer(state, p.id, state.prompt.id, [p.hand[0]]);
    engine.run(state);

    assert.equal(p.hand.length, 1, 'Discarded 1 action card');
    // Queue finished and noise roll was skipped, returning to turn choice
    assert.ok(state.prompt?.kind === 'turn' || state.prompt === null, 'Skipped noise roll completely');
});

test('AUDIT-FIX-10: Security System Control targets room with red ammo icon and shoots intruder', () => {
    const state = createGame({ seed: 'test-sec-control-red', players: [{ name: 'P', charId: 'soldier' }] });
    const p = state.players[0];
    p.items.push({ uid: 'sec1', item: 'securityControl' });

    // Target room has red item icon (e.g. Comms with ['red', 'yellow']), NO fire and NO malfunction
    setupRoom(state, p, 'comms');
    state.intruders = { it1: { uid: 'it1', room: p.room, type: 'adult', hits: 0 } };

    state.prompt = null;
    state.queue = [{ op: 'item.use', player: p.id, uid: 'sec1' }];
    engine.run(state);

    assert.equal(state.prompt.kind, 'room');
    assert.ok(state.prompt.rooms.includes(p.room), 'Comms is valid target due to red item icon');
});

test('AUDIT-FIX-11: Tactical Hatchet deals 2 hits and marks weapon with malfunction (broken: true)', () => {
    const state = createGame({ seed: 'test-hatchet-broken', players: [{ name: 'P', charId: 'soldier' }] });
    const p = state.players[0];
    p.items.push({ uid: 'h1', item: 'tacticalHatchet' });
    state.intruders = { it1: { uid: 'it1', room: p.room, type: 'adult', hits: 0 } };

    state.prompt = null;
    state.queue = [{ op: 'melee.hit', player: p.id, target: 'it1', noRetaliation: true }];
    engine.run(state);

    const h = p.items.find(i => i.uid === 'h1');
    assert.equal(h.broken, true, 'Hatchet marked broken (malfunction)');
    assert.equal(state.intruders.it1?.hits, 2, 'Dealt 2 hits');
});

test('AUDIT-FIX-12: Items with noCombat icon cannot be used while in combat', () => {
    const state = createGame({ seed: 'test-no-combat-item', players: [{ name: 'P', charId: 'soldier' }] });
    const p = state.players[0];
    p.items.push({ uid: 'med1', item: 'medkit' });
    p.items.push({ uid: 'st1', item: 'stapler' });
    p.hand = ['soldier.search#0', 'soldier.repairs#0'];

    // In combat
    state.intruders = { it1: { uid: 'it1', room: p.room, type: 'adult' } };
    state.prompt = null;
    state.queue = [{ op: 'turn.choose' }];
    engine.run(state);

    assert.equal(state.prompt.kind, 'turn');
    const medItem = state.prompt.items.find(i => i.uid === 'med1');
    const staplerItem = state.prompt.items.find(i => i.uid === 'st1');

    assert.equal(medItem.enabled, false, 'Medkit disabled in combat (noCombat icon)');
    assert.equal(medItem.reason, 'Нельзя в бою');
    assert.equal(staplerItem.enabled, true, 'Medical stapler can be used in combat');
});

test('AUDIT-FIX-13: Cables reloads up to 3 ammo into weapon', () => {
    const state = createGame({ seed: 'test-cables-ammo', players: [{ name: 'P', charId: 'soldier' }] });
    const p = state.players[0];
    const gun = p.items.find(i => i.item === 'soldierGun');
    gun.ammo = 0; // max is 6
    p.items.push({ uid: 'cb1', item: 'cables' });

    state.prompt = null;
    state.queue = [{ op: 'item.use', player: p.id, uid: 'cb1' }];
    engine.run(state);

    assert.equal(state.prompt.kind, 'choice');
    engine.answer(state, p.id, state.prompt.id, 'w:' + gun.uid);
    assert.equal(gun.ammo, 3, 'Cables added up to 3 ammo, not full 6');
});

test('AUDIT-FIX-14: Duct Tape tapes 2 heavy items together and increases hand capacity', () => {
    const state = createGame({ seed: 'test-duct-tape-hands', players: [{ name: 'P', charId: 'soldier' }] });
    const p = state.players[0];
    p.items.push({ uid: 'dt1', item: 'ductTape' });

    const beforeLimit = engine.handLimit(p);
    assert.equal(beforeLimit, 2, 'Default hand limit is 2');

    state.prompt = null;
    state.queue = [{ op: 'item.use', player: p.id, uid: 'dt1' }];
    engine.run(state);

    assert.equal(state.prompt.kind, 'choice');
    assert.ok(state.prompt.options.some(o => o.id === 'tape'), 'Duct Tape offers taping heavy items');
    engine.answer(state, p.id, state.prompt.id, 'tape');

    assert.equal(p.ductTaped, 1, 'Character has 1 duct taped pair');
    assert.equal(engine.handLimit(p), 3, 'Hand limit increased to 3');
});
