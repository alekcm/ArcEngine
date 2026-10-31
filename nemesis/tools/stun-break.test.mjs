// stun-break.test.mjs — tests for Stun card, weapon breaking mechanics, and intruder repelling without noise rolls.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../shared/engine/setup.mjs';
import { answer, next, run, spawnIntruder } from '../shared/engine/core.mjs';

function fresh() {
    const state = createGame({
        seed: 'stun_test', mode: 'original', draft: false,
        players: [{ name: 'Alpha', charId: 'soldier' }, { name: 'Beta', charId: 'scout' }],
    });
    state.queue = []; state.prompt = null; state.resume = null; state.result = null;
    state.phase = 'player'; state.current = 0; state.firstPlayer = 0;
    state.seating = state.players.map(p => p.id); state.turnCursor = 0; state.actionsLeft = 2;
    state.players.forEach(p => { p.room = '011'; p.status = 'active'; });
    state.adaptations = []; // Ensure fearless adaptation does not block repelling in unit tests
    return state;
}

test('STUN-01: Stun works only on other characters in the same room', () => {
    const s = fresh();
    s.players[0].room = '011';
    s.players[1].room = '002'; // Different room!
    s.players[1].hand = s.players[1].deck.splice(0, 2); // 2 cards (<= 3)

    // Trigger card.stun for player 0
    next(s, { op: 'card.stun', player: 0 });
    run(s);

    // No valid target in other room -> returns to turn.choose with prompt.kind === 'turn'
    assert.ok(s.prompt && s.prompt.kind === 'turn', 'Player in other room cannot be stunned');

    // Move Beta into the same room (011)
    s.prompt = null;
    s.queue = [];
    s.players[1].room = '011';
    next(s, { op: 'card.stun', player: 0 });
    run(s);

    assert.equal(s.prompt && s.prompt.kind, 'choice');
    const stunOptsSameRoom = s.prompt.options.filter(o => o.id.startsWith('stun:'));
    assert.equal(stunOptsSameRoom.length, 1, 'Player in same room can be stunned');
    assert.equal(stunOptsSameRoom[0].id, 'stun:1');
});

test('STUN-02: Breaking weapon first time adds malfunction token (broken: true) and does not destroy it', () => {
    const s = fresh();
    const adult = spawnIntruder(s, 'adult', '011');
    assert.ok(adult);
    const rifle = s.players[0].items.find(i => i.item === 'soldierGun');
    assert.ok(rifle);
    assert.equal(rifle.broken, false);

    next(s, { op: 'card.stun', player: 0 });
    run(s);

    const breakOpt = s.prompt.options.find(o => o.id === 'break:' + rifle.uid);
    assert.ok(breakOpt, 'Break weapon option is available');

    answer(s, 0, s.prompt.id, 'break:' + rifle.uid);
    run(s);

    // Rifle should still be in player's inventory, but marked broken
    assert.ok(s.players[0].items.some(i => i.uid === rifle.uid), 'Rifle still exists');
    assert.equal(rifle.broken, true, 'Rifle has malfunction token (broken: true)');

    // Adult was repelled from room 011
    assert.notEqual(adult.room, '011', 'Adult was repelled from 011');

    // And NO noise roll was prompted
    assert.ok(!s.prompt || s.prompt.kind !== 'dice', 'No noise roll was triggered');
});

test('STUN-03: Breaking an already broken weapon destroys it (second breakage)', () => {
    const s = fresh();
    const adult = spawnIntruder(s, 'adult', '011');
    assert.ok(adult);
    const rifle = s.players[0].items.find(i => i.item === 'soldierGun');
    assert.ok(rifle);
    rifle.broken = true; // Already broken once!

    next(s, { op: 'card.stun', player: 0 });
    run(s);

    const breakOpt = s.prompt.options.find(o => o.id === 'break:' + rifle.uid);
    assert.ok(breakOpt, 'Option to break second time is available');

    answer(s, 0, s.prompt.id, 'break:' + rifle.uid);
    run(s);

    // Rifle should now be destroyed (removed from player's items)
    assert.equal(s.players[0].items.some(i => i.uid === rifle.uid), false, 'Broken rifle was destroyed');
    assert.notEqual(adult.room, '011', 'Adult was repelled');

    // And NO noise roll was prompted
    assert.ok(!s.prompt || s.prompt.kind !== 'dice', 'No noise roll was triggered');
});

test('REPEL-01: Repelling an intruder with Forcing Fire or Shriek does not roll noise', () => {
    const s = fresh();
    const adult = spawnIntruder(s, 'adult', '011');
    const rifle = s.players[0].items.find(i => i.item === 'soldierGun');
    rifle.ammo = 3;

    next(s, { op: 'card.forcingFire.pick', player: 0, answer: rifle.uid });
    run(s);

    assert.notEqual(adult.room, '011', 'Adult was repelled');
    assert.ok(!s.prompt || s.prompt.kind !== 'dice', 'Forcing Fire did not trigger noise roll');

    // Test Shriek
    s.prompt = null;
    s.queue = [];
    const adult2 = spawnIntruder(s, 'adult', '011');
    next(s, { op: 'card.shriek', player: 0 });
    run(s);

    assert.notEqual(adult2.room, '011', 'Adult was repelled by Shriek');
    assert.ok(!s.prompt || s.prompt.kind !== 'dice', 'Shriek did not trigger noise roll');
});
