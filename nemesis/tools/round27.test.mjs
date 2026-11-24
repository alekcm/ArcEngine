import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../shared/engine/setup.mjs';
import { searchRoom } from '../shared/engine/items.mjs';
import { giveSlime, removeSlime, OPS } from '../shared/engine/core.mjs';
import { eclosionProcedure } from '../shared/engine/actions.mjs';
import { ORIGINAL_EVENT_CARDS, ORIGINAL_ATTACK_CARDS } from '../shared/data/original-cards.mjs';
import { viewFor } from '../shared/view.mjs';
import { turretOnCharacterEntry, placeTurret } from '../shared/engine/turrets.mjs';
import { roomActionAvailable } from '../shared/engine/rooms.mjs';
import { ORIGINAL_EXPLORATION_TOKENS } from '../shared/ship.mjs';

function originalGame(players = 2) {
    const chars = ['soldier', 'scout', 'mechanic', 'pilot', 'scientist'];
    const s = createGame({ rules: 'original', enemySet: 'redux', seed: 'round27-original', players: chars.slice(0, players).map((charId, i) => ({ name: `P${i}`, charId })) });
    s.queue = []; s.prompt = null; s.resume = null;
    return s;
}

test('Original Search uses item counters, draws two matching cards, and Scavenging does not spend a search', () => {
    const s = originalGame(), p = s.players[0], r = '002'; p.room = r;
    s.roomState[r].tile = 'laboratory'; s.roomState[r].itemsLeft = 2;
    const before = s.itemDecks.green.length;
    searchRoom(s, p, { op: 'noop' }, r);
    assert.equal(s.roomState[r].itemsLeft, 1);
    assert.equal(s.itemDecks.green.length, before - 2);
    assert.equal(s.prompt.kind, 'choice');
    assert.equal(s.prompt.options.length, 2);

    s.prompt = null;
    searchRoom(s, p, { op: 'noop' }, r, { scavenging: true });
    assert.equal(s.roomState[r].itemsLeft, 1);
    assert.equal(s.itemDecks.green.length, before - 4);
});

test('Original Search lets the player choose among the room icon colors', () => {
    const s = originalGame(), p = s.players[0], r = '002'; p.room = r;
    s.roomState[r].tile = 'airlock'; s.roomState[r].itemsLeft = 2;
    const redBefore = s.itemDecks.red.length, greenBefore = s.itemDecks.green.length;
    searchRoom(s, p, { op: 'noop' }, r);
    assert.equal(s.prompt.title, 'Поиск: выберите цвет колоды предметов');
    assert.deepEqual(s.prompt.options.map(o => o.id), ['green', 'red']);
    assert.equal(s.roomState[r].itemsLeft, 2);

    OPS['search.originalColor'](s, { player: p.id, then: { op: 'noop' }, roomId: r, answer: 'red' });
    assert.equal(s.itemDecks.red.length, redBefore - 2);
    assert.equal(s.itemDecks.green.length, greenBefore);
    assert.equal(s.roomState[r].itemsLeft, 1);
});

test('Original view exposes room search counters and contaminated rooms cannot be searched', () => {
    const s = originalGame(), p = s.players[0], r = '002'; p.room = r;
    s.roomState[r].tile = 'laboratory'; s.roomState[r].itemsLeft = 3;
    assert.equal(viewFor(s, p.id).roomState[r].itemsLeft, 3);
    s.roomState[r].tile = 'contaminated';
    searchRoom(s, p, { op: 'noop' }, r);
    assert.equal(s.roomState[r].itemsLeft, 3);
    assert.equal(s.prompt, null);
});

test('Slime is a base Original rule, can be removed, and never leaks into DLC player state', () => {
    const s = originalGame(), p = s.players[0];
    giveSlime(s, p);
    assert.equal(p.slime, true);
    assert.equal(removeSlime(s, p), true);
    assert.equal(Object.hasOwn(p, 'slime'), false);

    const dlc = createGame({ enemySet: 'carnomorphs', seed: 'round27-no-slime', players: [{ name: 'DLC', charId: 'soldier' }] });
    const dp = dlc.players[0];
    giveSlime(dlc, dp);
    assert.equal(Object.hasOwn(dp, 'slime'), false);
});

test('Original melee against a Nest Egg has no miss wound or contamination and rolls Noise after each attempt', () => {
    const s = originalGame(), p = s.players[0];
    p.room = '002'; p.wounds = []; p.hand = [];
    s.nestEggs = 3; s.queue = [];
    s.pendingRoll = { die: 'combatOriginal', value: 'miss' };
    OPS['room.nestMelee'](s, { player: p.id, then: { op: 'noop' } });
    assert.equal(s.nestEggs, 3);
    assert.deepEqual(p.wounds, []);
    assert.deepEqual(p.hand, []);
    assert.equal(s.queue[0].op, 'noise.roll');

    s.queue = []; s.pendingRoll = { die: 'combatOriginal', value: 'one' };
    OPS['room.nestMelee'](s, { player: p.id, then: { op: 'noop' } });
    assert.equal(s.nestEggs, 2);
    assert.equal(s.queue[0].op, 'noise.roll');
});

test('Original event IDs map to the physical 20-card deck and resolve their printed effects', () => {
    assert.equal(ORIGINAL_EVENT_CARDS.length, 20);
    assert.equal(ORIGINAL_ATTACK_CARDS.length, 20);
    assert.deepEqual(ORIGINAL_EVENT_CARDS.slice(0, 4).map(c => c.effect), ['eggProtection', 'brood', 'regeneration', 'rampage']);

    const s = originalGame(), roomA = '002', roomB = '003';
    s.roomState['001'].malfunction = true;
    s.roomState[roomA].explored = true; s.roomState[roomA].malfunction = false;
    s.roomState[roomB].explored = true; s.roomState[roomB].malfunction = false;
    OPS['event.effect'](s, { id: 'origEv9' }); // malfunction: lowest-numbered explored room
    assert.equal(s.roomState[roomA].malfunction, true);
    assert.equal(s.roomState[roomB].malfunction, false);

    s.ship.corridors[Object.keys(s.ship.corridors)[0]].door = 'closed';
    OPS['event.effect'](s, { id: 'origEv15' }); // bulkheads open
    assert.ok(Object.values(s.ship.corridors).every(c => c.door !== 'closed'));

    const pod = s.pods.slice().sort((a, b) => a.num - b.num)[0];
    OPS['event.effect'](s, { id: 'origEv19' }); // pod ejection
    assert.equal(pod.removed, true);
});

test('Original Danger exploration token moves one adjacent non-combat Intruder instead of rolling Danger again', () => {
    const s = originalGame(), p = s.players[0], dst = '002';
    p.room = dst;
    const exit = s.ship.rooms[dst].exits.find(e => e.corridor !== 'tech');
    const from = exit.to;
    s.ship.corridors[exit.corridor].door = 'open';
    s.roomState[dst].explored = false;
    s.secret.tiles[dst] = 'laboratory';
    s.secret.tokens[dst] = { effect: 'danger', items: 2, label: 'Опасность (2 предм.)' };
    s.intruders.auditDanger = { uid: 'auditDanger', type: 'adult', room: from, hits: 0 };
    s.queue = [];

    OPS.explore(s, { room: dst, player: p.id, from });
    assert.equal(s.roomState[dst].itemsLeft, 2);
    assert.equal(s.queue[0].op, 'original.exploreDanger');
    OPS['original.exploreDanger'](s, s.queue.shift());
    OPS['original.dangerMove'](s, s.queue.shift());
    assert.equal(s.intruders.auditDanger.room, dst);
    assert.equal(s.queue.length, 0);
});

test('Original Silence with Slime uses the Danger effect and falls back to a normal Noise roll', () => {
    const s = originalGame(), p = s.players[0], dst = '002';
    p.room = dst; p.slime = true;
    s.roomState[dst].explored = false;
    s.secret.tiles[dst] = 'laboratory';
    s.secret.tokens[dst] = { effect: 'silence', items: 1, label: 'Тишина (1 предм.)' };
    s.queue = [];

    OPS.explore(s, { room: dst, player: p.id, from: '001' });
    OPS['original.exploreDanger'](s, s.queue.shift());
    assert.equal(s.queue[0].op, 'noise.roll');
    assert.equal(s.queue[0].forced, undefined);
});

test('Original Noise-die Danger moves only one adjacent Intruder', () => {
    const s = originalGame(), p = s.players[0], dst = '002';
    p.room = dst;
    const exits = s.ship.rooms[dst].exits.filter(e => e.corridor !== 'tech');
    assert.ok(exits.length >= 2);
    s.ship.corridors[exits[0].corridor].door = 'open';
    s.ship.corridors[exits[1].corridor].door = 'open';
    s.intruders.auditDangerA = { uid: 'auditDangerA', type: 'adult', room: exits[0].to, hits: 0 };
    s.intruders.auditDangerB = { uid: 'auditDangerB', type: 'adult', room: exits[1].to, hits: 0 };
    s.queue = [];

    OPS['noise.roll'](s, { player: p.id, room: dst, forced: 'danger' });
    assert.equal(s.queue[0].op, 'original.noiseDanger');
    OPS['original.noiseDanger'](s, s.queue.shift());
    assert.equal(s.prompt.kind, 'choice');
    const selected = s.prompt.options[0].id;
    OPS['original.dangerChosen'](s, { room: dst, fallback: 'noiseTokens', answer: selected });
    OPS['original.dangerMove'](s, s.queue.shift());
    assert.equal(Object.values(s.intruders).filter(it => it.room === dst).length, 1);
});

test('Aftermath adds exactly three no-counter Turret exploration tokens to Original', () => {
    const turrets = ORIGINAL_EXPLORATION_TOKENS.filter(t => t.effect === 'turret');
    assert.equal(turrets.length, 3);
    assert.ok(turrets.every(t => t.items === undefined));
    assert.equal(ORIGINAL_EXPLORATION_TOKENS.length, 23);
});

test('The Aftermath option guarantees the Defense Room only in Original base games', () => {
    const players = [{ name: 'P0', charId: 'soldier' }, { name: 'P1', charId: 'scout' }];
    const plain = createGame({ rules: 'original', enemySet: 'redux', seed: 'aftermath-room-option', players });
    const withDefense = createGame({ rules: 'original', enemySet: 'redux', seed: 'aftermath-room-option', players, aftermathRooms: true });
    assert.equal(plain.aftermathRooms, false);
    assert.ok(!Object.values(plain.secret.tiles).includes('defense'));
    assert.equal(withDefense.aftermathRooms, true);
    assert.equal(Object.values(withDefense.secret.tiles).filter(tile => tile === 'defense').length, 1);

    const reduxOn = createGame({ rules: 'redux', enemySet: 'redux', seed: 'aftermath-room-option', players, aftermathRooms: true });
    const reduxOff = createGame({ rules: 'redux', enemySet: 'redux', seed: 'aftermath-room-option', players });
    assert.equal(reduxOn.aftermathRooms, false);
    assert.deepEqual(reduxOn.secret.tiles, reduxOff.secret.tiles);
    assert.equal(reduxOn.rng, reduxOff.rng);
});

test('Turret status stays hidden until entry, then Target: All wounds a character in Player Phase', () => {
    const s = originalGame(), p = s.players[0], r = '002';
    p.room = r;
    s.roomState[r].tile = 'laboratory';
    s.secret.turretStatuses = ['all', 'intruders', 'inactive'];
    const turret = placeTurret(s, r);
    assert.ok(turret);
    assert.equal(viewFor(s, p.id).turrets[0].status, null);

    turretOnCharacterEntry(s, p, r);
    assert.equal(turret.status, 'all');
    assert.equal(p.health, 9);
    assert.equal(p.wounds.length, 0);
    assert.equal(viewFor(s, p.id).turrets[0].status, 'all');
});

test('Aftermath Defense Room action changes a selected Turret status', () => {
    const s = originalGame(), p = s.players[0], defenseRoom = '002', turretRoom = '003';
    p.room = defenseRoom;
    s.roomState[defenseRoom].tile = 'defense';
    s.roomState[turretRoom].tile = 'laboratory';
    s.secret.turretStatuses = ['inactive', 'all', 'intruders'];
    const turret = placeTurret(s, turretRoom);
    assert.equal(roomActionAvailable(s, p).ok, true);

    OPS['room.action'](s, { player: p.id, tile: 'defense' });
    assert.equal(s.prompt.title, 'Отсек обороны: какую турель переключить?');
    OPS['room.defense'](s, { player: p.id, answer: String(turret.id), then: { op: 'noop' } });
    OPS['turret.control'](s, s.queue.shift());
    assert.equal(s.prompt.title, 'Выберите новый статус турели');
    OPS['turret.control'](s, { turretId: turret.id, answer: 'all', then: { op: 'noop' } });
    assert.equal(turret.status, 'all');
});

test('A hidden active Turret shoots an Intruder that appears before a character reveals its status', () => {
    const s = originalGame(), r = '002';
    s.roomState[r].tile = 'laboratory'; s.secret.turretStatuses = ['intruders', 'all', 'inactive'];
    const turret = placeTurret(s, r);
    const it = { uid: 'turretSpawn', type: 'adult', room: r, hits: 0 };
    s.intruders[it.uid] = it;
    OPS['turret.intruderEntry'](s, { intruder: it.uid });
    assert.equal(it.hits, 1);
    assert.equal(turret.status, null);
});

test('Turret exploration tokens add no Search counter and never place in Nest or Contaminated rooms', () => {
    const s = originalGame(), r = '002';
    s.roomState[r].tile = 'laboratory';
    const token = { effect: 'turret', label: 'Турель' };
    s.secret.tiles[r] = 'laboratory'; s.secret.tokens[r] = token;
    OPS.explore(s, { room: r, player: s.players[0].id, from: '001' });
    assert.equal(s.roomState[r].itemsLeft, undefined);
    assert.equal(s.turrets.length, 1);

    for (const [id, tile] of [['003', 'nest'], ['004', 'contaminated']]) {
        s.roomState[id].explored = false; s.secret.tiles[id] = tile; s.secret.tokens[id] = token;
        OPS.explore(s, { room: id, player: s.players[0].id, from: '001' });
    }
    assert.equal(s.turrets.length, 1);
});

test('Event-Phase active Turret shoots its room occupants; inactive Turret does nothing', () => {
    const s = originalGame(), p = s.players[0], r = '002';
    p.room = r; s.roomState[r].tile = 'laboratory';
    s.secret.turretStatuses = ['all', 'inactive', 'intruders'];
    const active = placeTurret(s, r); active.status = 'all';
    const intruder = { uid: 'turretAdult', type: 'adult', room: r, hits: 0 };
    s.intruders[intruder.uid] = intruder;
    OPS['turret.eventPhase'](s);
    assert.equal(p.health, 9);
    assert.equal(intruder.hits, 1);
    assert.equal(active.destroyed, true);

    const inactiveRoom = '003'; s.roomState[inactiveRoom].tile = 'laboratory';
    const inactive = placeTurret(s, inactiveRoom); inactive.status = 'inactive';
    const second = { uid: 'inactiveAdult', type: 'adult', room: inactiveRoom, hits: 0 };
    s.intruders[second.uid] = second;
    OPS['turret.eventPhase'](s);
    assert.equal(second.hits, 0);
});

test('Original Eclosion spawns a Crawler rather than a Redux Adult', () => {
    const s = originalGame(), p = s.players[0];
    p.room = '011'; p.status = 'active'; p.hand.push('contam#round27');
    eclosionProcedure(s, p);
    assert.ok(Object.values(s.intruders).some(i => i.type === 'crawler' && i.room === '011'));
    assert.ok(!Object.values(s.intruders).some(i => i.type === 'adult' && i.room === '011'));
});
