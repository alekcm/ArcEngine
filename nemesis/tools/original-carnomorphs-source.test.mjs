import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../shared/engine/setup.mjs';
import { OPS, giveSlime, removeSlime } from '../shared/engine/core.mjs';
import { spawnCarnomorph, resolveCarnomorphEncounter, carnomorphAttackEffects, developCarnomorphBag, analyzeCarnomorphAdaptation } from '../shared/engine/carnomorphs.mjs';
import { CARNOMORPH_ATTACK_BY_ID } from '../shared/data/carnomorphs.mjs';
import { eventTextFor } from '../shared/data/event-text.mjs';
import { CARNOMORPH_EVENT_BY_ID } from '../shared/data/carnomorph-events.mjs';
import '../shared/engine/events.mjs';
import '../shared/engine/carnomorph-events.mjs';

function game() {
    const s = createGame({ rules: 'original', enemySet: 'carnomorphs', seed: 'printed-carno', players: [
        { name: 'А', charId: 'soldier' }, { name: 'Б', charId: 'scout' },
    ] });
    s.queue = []; s.prompt = null; s.intruders = {};
    for (const p of s.players) { p.status = 'active'; p.room = '011'; p.heavy = []; }
    for (const rs of Object.values(s.roomState)) rs.objects = [];
    return s;
}

test('original Carnomorph event moves only printed types and adds no universal noise roll', () => {
    const s = game();
    const start = Object.keys(s.ship.rooms).find(id => id !== '011' && s.ship.rooms[id].exits.some(e => (e.nums || [e.num]).includes(2)));
    const edge = s.ship.rooms[start].exits.find(e => (e.nums || [e.num]).includes(2));
    s.ship.corridors[edge.corridor].door = 'open';
    const shambler = spawnCarnomorph(s, 'shambler', start);
    const metagorger = spawnCarnomorph(s, 'metagorger', start);
    OPS['event.movement'](s, { id: 'carnoEvent1' });
    assert.equal(shambler.room, edge.to);
    assert.equal(metagorger.room, start);
    s.queue = [];
    OPS['event.noise'](s, { id: 'carnoEvent1' });
    assert.deepEqual(s.queue, []);
    const text = eventTextFor(CARNOMORPH_EVENT_BY_ID.carnoEvent1);
    assert.doesNotMatch(text, /все карноморфы|каждый персонаж делает бросок шума/);
});

test('original slime effects are available to Carnomorphs, not Redux Carnomorphs', () => {
    const s = game(), p = s.players[0];
    giveSlime(s, p); assert.equal(p.slime, true);
    assert.equal(removeSlime(s, p), true);
    s.roomState[p.room].objects.push({ type: 'carcass' });
    OPS['carnomorph.eventEffect'](s, { id: 'carnoEvent5' });
    assert.ok(s.players.every(x => x.slime));
    const corridor = s.ship.rooms[p.room].exits[0].corridor;
    s.ship.corridors[corridor].door = 'open';
    OPS['carnomorph.eventEffect'](s, { id: 'carnoEvent6' });
    assert.equal(s.ship.corridors[corridor].door, 'closed');
    const redux = createGame({ rules: 'redux', enemySet: 'carnomorphsRedux', players: [{ name: 'R', charId: 'soldier' }] });
    giveSlime(redux, redux.players[0]); assert.notEqual(redux.players[0].slime, true);
    assert.ok(carnomorphAttackEffects(CARNOMORPH_ATTACK_BY_ID.carnoAttack1, { type: 'shambler' }, p).some(x => x.op === 'origSlime'));
    assert.ok(carnomorphAttackEffects(CARNOMORPH_ATTACK_BY_ID.carnoAttack7, { type: 'shambler' }, p).some(x => x.op === 'origSlime'));
});

test('blank encounter adds a red Metagorger only when the bag was emptied', () => {
    const s = game(), r = '002';
    s.bag = ['other'];
    resolveCarnomorphEncounter(s, { token: 'blank', room: r });
    assert.deepEqual(s.bag, ['other', 'blank']);
    s.bag = [];
    resolveCarnomorphEncounter(s, { token: 'blank', room: r });
    assert.equal(s.bag.filter(x => x && x.type === 'redMetagorger').length, 1);
    assert.ok(s.bag.includes('blank'));
});

test('original analysis cannot remove a hidden adaptation', () => {
    const s = game();
    assert.equal(analyzeCarnomorphAdaptation(s, 'corpse'), false);
    assert.equal(s.analyzed.corpse, false);
    spawnCarnomorph(s, 'shambler', '002');
    assert.equal(analyzeCarnomorphAdaptation(s, 'corpse'), true);
    assert.ok(s.carnomorphRemoved.includes('shambler'));
});

test('butcher bag development targets slime with fewest cards and reuses the drawn token', () => {
    const s = game();
    const [a, b] = s.players;
    a.room = '002'; b.room = '003'; a.slime = b.slime = true;
    a.hand = ['one', 'two']; b.hand = ['one'];
    const index = s.carnomorphSupply.findIndex(t => t.type === 'butcher');
    const token = s.carnomorphSupply.splice(index, 1)[0];
    const bagBefore = s.bag.length;
    const steps = developCarnomorphBag(s, token);
    assert.equal(steps.length, 1);
    assert.equal(steps[0].player, b.id);
    assert.equal(steps[0].token, token);
    OPS.encounter(s, steps[0]);
    assert.equal(s.bag.length, bagBefore);
    assert.equal(s.queue[0].op, 'carnomorph.encounter');
    OPS['carnomorph.encounter'](s, s.queue.shift());
    assert.equal(Object.values(s.intruders).filter(it => it.type === 'butcher').length, 1);
    assert.equal(Object.values(s.intruders).find(it => it.type === 'butcher').room, b.room);
});

import { dealHits, applyHitsNoRoll } from '../shared/engine/combat.mjs';

test('original damage draws the printed toughness card, not two numerical dice', () => {
    const s = game(), p = s.players[0];
    const it = spawnCarnomorph(s, 'shambler', p.room);
    s.carnomorphAdaptations.shambler = null;
    s.attackDeck = ['carnoAttack1', 'carnoAttack20']; s.attackDiscard = [];
    assert.equal(dealHits(s, p, it, 1, 0, { weapon: { item: 'scientistPistol' }, forcedRoll: 'one' }), false);
    assert.equal(it.hits, 1);
    assert.deepEqual(s.attackDiscard, ['carnoAttack1']);
    assert.equal(applyHitsNoRoll(s, it, 1), false);
    assert.equal(it.hits, 2);
    assert.deepEqual(s.attackDiscard, ['carnoAttack1', 'carnoAttack20']);
});

test('original combat die respects Carnomorph symbols and agility', () => {
    const s = game(), p = s.players[0];
    const it = spawnCarnomorph(s, 'metagorger', p.room);
    s.carnomorphAdaptations = { shambler: null, breeder: null, butcher: null };
    s.attackDeck = ['carnoAttack1']; s.attackDiscard = [];
    dealHits(s, p, it, 1, 0, { weapon: { item: 'scientistPistol' }, forcedRoll: 'small' });
    assert.equal(it.hits, 1);
    assert.deepEqual(s.attackDiscard, ['carnoAttack1']);
    s.carnomorphAdaptations.shambler = 'agility';
    s.attackDeck = ['carnoAttack1']; s.attackDiscard = [];
    dealHits(s, p, it, 1, 0, { weapon: { item: 'scientistPistol' }, forcedRoll: 'small' });
    assert.equal(it.hits, 1);
    assert.deepEqual(s.attackDiscard, []);
});

import { combatDieFor, ORIGINAL_COMBAT_DIE } from '../shared/engine/core.mjs';
import '../shared/engine/carnomorph-mutations.mjs';

test('original infected claw applies its first wound before the original die roll', () => {
    const s = game(), p = s.players[0], it = spawnCarnomorph(s, 'shambler', p.room);
    s.carnomorphAdaptations.shambler = null;
    s.attackDeck = ['carnoAttack1', 'carnoAttack1']; s.attackDiscard = [];
    assert.equal(combatDieFor(s, p), ORIGINAL_COMBAT_DIE);
    OPS['mutation.clawTarget'](s, { player: p.id, answer: it.uid, infected: true });
    assert.equal(it.hits, 1);
    assert.deepEqual(s.attackDiscard, ['carnoAttack1']);
    const step = s.queue.shift();
    s.pendingRoll = { die: 'combatOriginal', value: 'two' };
    OPS['mutation.originalClawRoll'](s, step);
    assert.equal(it.hits, 3);
    assert.deepEqual(s.attackDiscard, ['carnoAttack1', 'carnoAttack1']);
});

test('red Metagorger development recognizes carried heavy objects, not ordinary items', () => {
    const s = game(), [a, b] = s.players;
    a.room = '002'; b.room = '003';
    a.heavy = [{ type: 'egg' }]; b.heavy = [{ type: 'tool' }];
    developCarnomorphBag(s, { type: 'redMetagorger', value: 2 });
    assert.ok(Object.values(s.intruders).some(it => it.type === 'metagorger' && it.room === a.room));
    assert.ok(!Object.values(s.intruders).some(it => it.type === 'metagorger' && it.room === b.room));
});

test('Butcher selects lowest player number on a tie and skips an inactive first player', () => {
    const s = game(), [a, b] = s.players;
    a.slime = b.slime = true; a.hand = b.hand = ['one']; s.firstPlayer = b.id;
    assert.equal(developCarnomorphBag(s, { type: 'butcher', value: 4 })[0].player, a.id);
    a.slime = b.slime = false; b.status = 'dead';
    assert.equal(developCarnomorphBag(s, { type: 'butcher', value: 4 })[0].player, a.id);
});
