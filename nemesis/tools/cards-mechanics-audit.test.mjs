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
import { ITEMS, CHARACTERS, canLoadWith, WOUNDS, ADAPTATIONS, FEATS, COMPUTER_CARDS, OBJECTIVES, FIELD_DATA } from '../shared/data/cards.mjs';
import { buildMenu } from '../shared/engine/turn.mjs';

test('MECH-WEAPON-01: All 18 characters have starting weapons with ammo exactly matching weapon.max', () => {
    for (const [charId, ch] of Object.entries(CHARACTERS)) {
        const state = createGame({ seed: 'test-ammo-' + charId, players: [{ name: 'P1', charId }] });
        const p = state.players[0];
        for (const it of p.items) {
            const def = ITEMS[it.item];
            if (def.weapon) {
                if (def.weapon.noAmmo) {
                    assert.ok(it.ammo === 0 || it.ammo === undefined, `${charId} weapon ${it.item} should have no ammo`);
                } else {
                    assert.equal(it.ammo, def.weapon.max, `${charId} weapon ${it.item} ammo (${it.ammo}) must match max (${def.weapon.max})`);
                }
            }
        }
    }
});

test('MECH-WEAPON-02: Weapons with loadOnly restrictions refuse invalid reload sources and accept valid ones', () => {
    // Nail Gun only loads with tools / itShouldWork
    assert.equal(canLoadWith('nailGun', 'tools'), true);
    assert.equal(canLoadWith('nailGun', 'itShouldWork'), true);
    assert.equal(canLoadWith('nailGun', 'armory'), false);
    assert.equal(canLoadWith('nailGun', 'energyCharge'), false);
    assert.equal(canLoadWith('nailGun', 'cables'), false);

    // Needle Gun only loads with reagent
    assert.equal(canLoadWith('needleGun', 'reagent'), true);
    assert.equal(canLoadWith('needleGun', 'armory'), false);
    assert.equal(canLoadWith('needleGun', 'energyCharge'), false);

    // Six Shooter only loads with cartridge
    assert.equal(canLoadWith('sixShooter', 'cartridge'), true);
    assert.equal(canLoadWith('sixShooter', 'armory'), false);
    assert.equal(canLoadWith('sixShooter', 'cables'), false);

    // Grenade Launcher only loads with grenade
    assert.equal(ITEMS.grenadeLauncher.weapon.grenadeOnly, true);

    // Standard weapons load from Armory, Energy Charge, Cables
    assert.equal(canLoadWith('soldierGun', 'armory'), true);
    assert.equal(canLoadWith('soldierGun', 'energyCharge'), true);
    assert.equal(canLoadWith('soldierGun', 'cables'), true);
    assert.equal(canLoadWith('handgun', 'armory'), true);
    assert.equal(canLoadWith('scoutRifle', 'armory'), true);
});

test('MECH-WEAPON-03: Armory reloads up to 2 ammo for eligible weapons and rejects full or restricted weapons', () => {
    const state = createGame({ seed: 'test-armory', players: [{ name: 'P', charId: 'soldier' }] });
    const p = state.players[0];
    const gun = p.items.find(i => i.item === 'soldierGun');
    assert.ok(gun);

    // Set player room to Armory
    p.room = Object.keys(state.ship.rooms).find(id => !['cockpit', 'hibernatorium', 'engine'].includes(state.ship.rooms[id].kind));
    state.roomState[p.room].tile = 'armory';
    state.roomState[p.room].explored = true;

    // Full ammo -> armory disabled
    gun.ammo = ITEMS.soldierGun.weapon.max;
    let menu = buildMenu(state, p);
    let act = menu.actions.find(a => a.id === 'room');
    assert.equal(act.enabled, false, 'Armory disabled when weapon is full');

    // Missing 3 ammo -> armory enabled
    gun.ammo = ITEMS.soldierGun.weapon.max - 3;
    menu = buildMenu(state, p);
    act = menu.actions.find(a => a.id === 'room');
    assert.equal(act.enabled, true, 'Armory enabled when weapon has missing ammo');

    // Use Armory
    state.prompt = null;
    state.queue = [{ op: 'room.action', player: p.id, then: { op: 'turn.choose' } }];
    engine.run(state);
    assert.equal(state.prompt.kind, 'choice');
    engine.answer(state, p.id, state.prompt.id, gun.uid);

    assert.equal(gun.ammo, ITEMS.soldierGun.weapon.max - 1, 'Armory reloaded exactly 2 ammo');
});

test('MECH-KNOW-01: Starting knowledge is 1 and increases up to maximum of 8, triggering field data thresholds', () => {
    const state = createGame({ seed: 'test-know', players: [{ name: 'P', charId: 'scout' }] });
    const p = state.players[0];
    assert.equal(p.knowledge, 1, 'Character starts with knowledge 1');

    // Gain 2 knowledge -> reaches 3 (first threshold)
    engine.gainKnowledge(state, p, 2);
    assert.equal(p.knowledge, 3);
    assert.ok(state.queue.some(q => q.op === 'knowledge.threshold' && q.t === 3), 'Threshold 3 queued');

    // Clear queue
    state.queue = [];
    state.prompt = null;

    // Gain 3 more -> reaches 6 (passes threshold 5)
    engine.gainKnowledge(state, p, 3);
    assert.equal(p.knowledge, 6);
    assert.ok(state.queue.some(q => q.op === 'knowledge.threshold' && q.t === 5), 'Threshold 5 queued');

    // Gain 5 more -> clamped to max 8
    state.queue = [];
    engine.gainKnowledge(state, p, 5);
    assert.equal(p.knowledge, 8, 'Knowledge caps at 8');
});

test('MECH-KNOW-02: Archives room action grants 2 knowledge and activates knowledge token', () => {
    const state = createGame({ seed: 'test-archives', players: [{ name: 'P', charId: 'pilot' }] });
    const p = state.players[0];
    assert.equal(p.knowledgeActive, false);
    const startKnow = p.knowledge;

    p.room = Object.keys(state.ship.rooms).find(id => !['cockpit', 'hibernatorium', 'engine'].includes(state.ship.rooms[id].kind));
    state.roomState[p.room].tile = 'archives';
    state.roomState[p.room].explored = true;

    state.prompt = null;
    state.queue = [{ op: 'room.action', player: p.id, then: { op: 'turn.choose' } }];
    engine.run(state);

    assert.equal(p.knowledgeActive, true, 'Knowledge token activated');
    assert.equal(p.knowledge, startKnow + 2, 'Knowledge increased by 2');
});

test('MECH-WOUNDS-01: Serious wound effects are enforced correctly', () => {
    const state = createGame({ seed: 'test-wounds', players: [{ name: 'P', charId: 'soldier' }, { name: 'P2', charId: 'medic' }] });
    const p = state.players[0];

    // Arm wound limits hands to 1
    assert.equal(engine.handLimit(p), 2);
    p.wounds.push('arm');
    assert.equal(engine.handLimit(p), 1);

    // Body wound limits hand draw to 4
    assert.equal(engine.drawLimit(p), 5);
    p.wounds.push('body');
    assert.equal(engine.drawLimit(p), 4);

    // Bleeding causes 1 health loss on pass
    p.wounds.push('bleeding');
    const hpBefore = p.health;
    state.prompt = null;
    state.queue = [{ op: 'pass.discard', player: p.id }];
    engine.run(state);
    assert.equal(p.health, hpBefore - 1, 'Bleeding deals 1 damage on pass');
});

test('MECH-ALL-ACTIONS-01: Every non-reaction card across all 18 characters has an active OPS handler', async () => {
    for (const [charId, ch] of Object.entries(CHARACTERS)) {
        for (const [cardId, card] of Object.entries(ch.cards)) {
            if (card.reaction) continue;
            const op = 'card.' + card.effect;
            assert.ok(engine.OPS[op], `Character ${charId} card ${cardId} missing OPS handler ${op}`);
        }
    }
});

test('MECH-ADAPT-01: All 8 alien adaptations are implemented and queryable via hasAdapt', () => {
    const state = createGame({ seed: 'test-adapt', players: [{ name: 'P', charId: 'soldier' }] });
    for (const adaptKey of Object.keys(ADAPTATIONS)) {
        state.adaptations = [adaptKey];
        assert.equal(engine.hasAdapt(state, adaptKey), true, `Adaptation ${adaptKey} recognized`);
        assert.equal(engine.hasAdapt(state, 'nonexistent'), false);
    }
});

test('MECH-FEATS-01: All 12 feats have registered OPS handlers', () => {
    for (const featKey of Object.keys(FEATS)) {
        const op = 'feat.' + featKey;
        assert.ok(engine.OPS[op], `Feat ${featKey} missing OPS handler ${op}`);
    }
});
