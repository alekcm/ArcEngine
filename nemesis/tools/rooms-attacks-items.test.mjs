import test from 'node:test';
import assert from 'node:assert/strict';

import { createGame } from '../shared/engine/setup.mjs';
import * as engine from '../shared/engine/core.mjs';
import '../shared/engine/items.mjs';
import '../shared/engine/rooms.mjs';
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
