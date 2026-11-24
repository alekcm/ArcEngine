import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createGame } from '../shared/engine/setup.mjs';
import { searchRoom } from '../shared/engine/items.mjs';
import { giveSlime, removeSlime, OPS, answer, run, spawnIntruder } from '../shared/engine/core.mjs';
import { eclosionProcedure } from '../shared/engine/actions.mjs';
import { originalApplyWounds } from '../shared/engine/original.mjs';
import { ORIGINAL_EVENT_CARDS, ORIGINAL_ATTACK_CARDS } from '../shared/data/original-cards.mjs';
import { viewFor } from '../shared/view.mjs';
import { placeTurret, turretOnCharacterEntry } from '../shared/engine/turrets.mjs';
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

test('Original event data has 20 cards and selected handlers resolve representative effects', () => {
    assert.equal(ORIGINAL_EVENT_CARDS.length, 20);
    assert.equal(ORIGINAL_ATTACK_CARDS.length, 20);
    assert.deepEqual(ORIGINAL_EVENT_CARDS.slice(0, 4).map(c => c.effect), ['eggProtection', 'brood', 'regeneration', 'rampage']);
    assert.match(ORIGINAL_EVENT_CARDS.find(c => c.id === 'origEv9').text, /в Комнату с наименьшим номером без поломки/);
    assert.doesNotMatch(ORIGINAL_EVENT_CARDS.find(c => c.id === 'origEv9').text, /разведанную/);

    const s = originalGame(), roomA = '002', roomB = '003';
    s.roomState['001'].malfunction = true;
    s.roomState[roomA].explored = false; s.roomState[roomA].tile = null;
    s.secret.tiles[roomA] = 'laboratory';
    s.roomState[roomB].explored = true; s.roomState[roomB].malfunction = false;
    OPS['event.effect'](s, { id: 'origEv9' }); // printed effect: lowest-numbered eligible Room, explored or not
    assert.equal(s.roomState[roomA].malfunction, true);
    assert.equal(s.roomState[roomB].malfunction, false);

    s.ship.corridors[Object.keys(s.ship.corridors)[0]].door = 'closed';
    OPS['event.effect'](s, { id: 'origEv15' }); // bulkheads open
    assert.ok(Object.values(s.ship.corridors).every(c => c.door !== 'closed'));

    const pod = s.pods.slice().sort((a, b) => a.num - b.num)[0];
    OPS['event.effect'](s, { id: 'origEv19' }); // pod ejection
    assert.equal(pod.removed, true);
});

test('Every Original Event effect has a focused state-level regression', () => {
    {
        const s = originalGame(), nest = '002'; s.roomState[nest].tile = 'nest';
        s.players[0].room = nest; s.players[1].room = '003'; s.players[1].heavy = [{ type: 'egg' }];
        OPS['event.effect'](s, { id: 'origEv1' });
        assert.equal(s.queue.filter(x => x.op === 'encounter').length, 2, 'Egg Protection contacts Characters in the Nest and carrying Eggs');
    }
    {
        const s = originalGame(), nest = '002'; s.roomState[nest].tile = 'nest'; s.nestEggs = 1;
        s.players[0].room = nest; s.players[0].hand = []; s.players[1].status = 'dead';
        const larvaTokensBefore = s.bag.filter(t => t === 'larva').length;
        OPS['event.effect'](s, { id: 'origEv2' });
        assert.equal(s.nestEggs, 0); assert.equal(s.players[0].larva, true);
        assert.equal(s.bag.filter(t => t === 'larva').length, larvaTokensBefore, 'infecting a qualifying Character does not also add a Larva token');
    }
    {
        const s = originalGame(); s.intruders.i1 = { uid: 'i1', type: 'adult', room: '002', hits: 3 };
        OPS['event.effect'](s, { id: 'origEv3' }); assert.equal(s.intruders.i1.hits, 1);
    }
    {
        const s = originalGame(); s.roomState['002'].tile = 'laboratory'; s.roomState['003'].tile = 'nest';
        s.intruders.i1 = { uid: 'i1', type: 'adult', room: '002', hits: 0 };
        s.intruders.i2 = { uid: 'i2', type: 'crawler', room: '003', hits: 0 };
        OPS['event.effect'](s, { id: 'origEv4' });
        assert.equal(s.roomState['002'].malfunction, true); assert.equal(s.roomState['003'].malfunction, false);
    }
    {
        const s = originalGame(); s.players[1].status = 'dead';
        s.intruders.i1 = { uid: 'i1', type: 'adult', room: '002', hits: 0 };
        s.intruders.i2 = { uid: 'i2', type: 'drone', room: s.players[0].room, hits: 0 };
        OPS['event.effect'](s, { id: 'origEv5' });
        assert.equal(s.intruders.i1, undefined); assert.equal(s.intruders.i2.type, 'drone'); assert.ok(s.bag.includes('adult'));
    }
    for (const id of ['origEv6', 'origEv7']) {
        const s = originalGame(); s.players[1].status = 'dead';
        const from = '011', to = s.ship.rooms[from].exits[0].to; s.players[0].room = to;
        s.intruders.i1 = { uid: 'i1', type: 'drone', room: from, hits: 0 };
        s.intruders.i2 = { uid: 'i2', type: 'adult', room: from, hits: 0 };
        OPS['event.effect'](s, { id });
        assert.equal(s.intruders.i1.room, to, id + ' moves the adjacent Drone to the lowest-numbered Character Room');
        assert.equal(s.intruders.i2.room, from, id + ' does not move an Adult; verified against the printed Russian Event sheet');
    }
    {
        const s = originalGame(), from = '011';
        const exits = s.ship.rooms[from].exits.filter(e => e.corridor !== 'tech').sort((a, b) => a.to.localeCompare(b.to));
        s.players[0].room = exits[0].to; s.players[1].room = exits.at(-1).to;
        s.ship.corridors[exits[0].corridor].door = 'closed';
        s.intruders.i1 = { uid: 'i1', type: 'drone', room: from, hits: 0 };
        OPS['event.effect'](s, { id: 'origEv6' });
        assert.equal(s.intruders.i1.room, from, 'the Hunt does not choose a higher-numbered open route when the printed lowest-numbered target is behind a door');
        assert.equal(s.ship.corridors[exits[0].corridor].door, 'destroyed', 'Original Intruders destroy a closed Door instead of crossing it');
    }
    {
        const s = originalGame(), candidate = Object.keys(s.ship.rooms).sort().find(id => !['cockpit', 'hibernatorium', 'engine'].includes(s.ship.rooms[id].kind));
        for (const id of Object.keys(s.ship.rooms)) s.roomState[id].malfunction = id !== candidate;
        s.roomState[candidate].explored = false; s.roomState[candidate].tile = null; s.secret.tiles[candidate] = 'laboratory'; s.malfLeft = 1;
        OPS['event.effect'](s, { id: 'origEv9' });
        assert.equal(s.roomState[candidate].malfunction, true, 'Malfunction event picks the lowest-numbered eligible Room even if it is unexplored');
    }
    {
        const s = originalGame(), r = '011'; s.players[0].room = r; s.players[0].slime = true; s.players[1].status = 'dead';
        OPS['event.effect'](s, { id: 'origEv8' });
        assert.ok(s.ship.rooms[r].exits.every(e => s.ship.corridors[e.corridor].noise));
    }
    {
        const s = originalGame(), r = '011'; s.roomState[r].fire = true; s.roomState[r].itemsLeft = 3;
        const neighbor = s.ship.rooms[r].exits[0].to;
        OPS['event.effect'](s, { id: 'origEv10' });
        assert.equal(s.roomState[r].itemsLeft, 0); assert.equal(s.roomState[neighbor].fire, true);
    }
    {
        const s = originalGame(); s.players[0].larva = true;
        OPS['event.effect'](s, { id: 'origEv11' });
        assert.deepEqual(s.queue.map(x => x.op), ['event.origHatch', 'event.origInfect4']);
    }
    {
        const s = originalGame(); s.players[0].room = Object.keys(s.ship.rooms).find(id => s.ship.rooms[id].tech);
        OPS['event.effect'](s, { id: 'origEv12' }); assert.equal(s.ship.techNoise, true);
        s.queue = []; OPS['event.effect'](s, { id: 'origEv12' });
        assert.ok(s.queue.some(x => x.op === 'noise.roll' && s.ship.rooms[x.room].tech));
    }
    {
        const s = originalGame(), nest = '002'; s.roomState[nest].tile = 'nest'; s.roomState[nest].explored = true;
        OPS['event.effect'](s, { id: 'origEv13' });
        assert.ok(s.ship.rooms[nest].exits.every(e => s.ship.corridors[e.corridor].noise));
    }
    {
        const s = originalGame(), h = Object.keys(s.ship.rooms).find(id => s.ship.rooms[id].kind === 'hibernatorium');
        OPS['event.effect'](s, { id: 'origEv14' }); assert.equal(s.roomState[h].fire, true);
    }
    {
        const s = originalGame(), r = '011'; s.roomState[r].fire = true;
        const neighbor = s.ship.rooms[r].exits[0].to;
        OPS['event.effect'](s, { id: 'origEv16' });
        assert.equal(s.roomState[r].malfunction, true); assert.equal(s.roomState[neighbor].fire, true);
    }
    {
        const s = originalGame(), gen = '002'; s.roomState[gen].tile = 'generator';
        for (const p of s.players) p.status = 'active';
        s.roomState[gen].malfunction = true; OPS['event.effect'](s, { id: 'origEv17' });
        assert.equal(s.selfDestruct, 1);
    }
    {
        const s = originalGame(); s.malfLeft = 20;
        s.roomState['002'].explored = false; s.roomState['002'].tile = null; s.secret.tiles['002'] = 'laboratory';
        OPS['event.effect'](s, { id: 'origEv18' }); assert.equal(s.roomState['002'].malfunction, true);
    }
    {
        const s = originalGame(); s.malfLeft = 20;
        s.roomState['002'].explored = false; s.roomState['002'].tile = null; s.secret.tiles['002'] = 'commandCenter';
        OPS['event.effect'](s, { id: 'origEv20' }); assert.equal(s.roomState['002'].malfunction, true);
    }
    {
        const s = originalGame();
        const pod = s.pods.filter(p => !p.launched && !p.removed).sort((a, b) => a.num - b.num)[0];
        OPS['event.effect'](s, { id: 'origEv19' });
        assert.equal(pod.removed, true, 'Escape Pod event removes the lowest-numbered available Pod');
    }
});

test('Original setup and all 20 Event cards match the printed corridor, Intruder types and finish policy', () => {
    const s = originalGame();
    assert.deepEqual(s.eventDeck.slice().sort(), ORIGINAL_EVENT_CARDS.map(c => c.id).sort(), 'createGame installs each physical Event card once');
    const actual = ORIGINAL_EVENT_CARDS.map(c => [c.move.num, c.move.types.join(','), c.effect, c.finish]);
    const printed = [
        [2, 'drone,queen', 'eggProtection', 'discard'],
        [3, 'adult,drone', 'brood', 'discard'],
        [1, 'drone,queen', 'regeneration', 'discard'],
        [2, 'crawler,adult', 'rampage', 'discard'],
        [4, 'crawler,drone', 'lurking', 'discard'],
        [3, 'drone,queen', 'hunt', 'discard'],
        [2, 'crawler,drone,queen', 'hunt', 'discard'],
        [3, 'crawler,adult', 'scentOfPrey', 'discard'],
        [2, 'adult,drone', 'malfunction', 'self'],
        [4, 'crawler,drone,queen', 'consumingFire', 'discard'],
        [1, 'crawler,drone,queen', 'eclosion', 'discard'],
        [4, 'adult,drone', 'techNoise', 'discard'],
        [3, 'crawler,drone,queen', 'hiveNoise', 'discard'],
        [4, 'drone,queen', 'flammable', 'discard'],
        [1, 'adult,drone', 'bulkheadsOpen', 'discard'],
        [1, 'crawler,drone', 'damagingFire', 'discard'],
        [1, 'adult,drone,queen', 'coolantLeak', 'remove'],
        [2, 'adult,drone,queen', 'lifeSupport', 'remove'],
        [3, 'adult,drone,queen', 'podEjection', 'remove'],
        [4, 'adult,drone,queen', 'shortCircuit', 'remove'],
    ];
    assert.deepEqual(actual, printed);
});

test('Every Original Event moves exactly its printed Intruder types through its printed numbered corridor', () => {
    const types = ['crawler', 'adult', 'drone', 'queen'];
    for (const card of ORIGINAL_EVENT_CARDS) {
        const s = originalGame(), from = '011';
        for (const p of s.players) p.room = '001';
        const exit = s.ship.rooms[from].exits.find(e => (e.nums || [e.num]).includes(card.move.num));
        assert.ok(exit, card.id + ' needs a matching exit in the test room');
        for (const type of types) {
            const uid = card.id + ':' + type;
            s.intruders[uid] = { uid, type, room: from, hits: 0 };
        }

        OPS['event.movement'](s, { id: card.id });
        for (const type of types) {
            const expected = card.move.types.includes(type) ? exit.to : from;
            assert.equal(s.intruders[card.id + ':' + type].room, expected, card.id + ' / ' + type);
        }
    }
});

test('Original event finish policies discard, reshuffle, and remove the physical cards as printed', () => {
    const discard = originalGame();
    discard.eventDeck = []; discard.eventDiscard = [];
    OPS['event.finish'](discard, { id: 'origEv1' });
    assert.deepEqual(discard.eventDiscard, ['origEv1']);

    const self = originalGame();
    self.eventDeck = ['origEv1']; self.eventDiscard = ['origEv2'];
    OPS['event.finish'](self, { id: 'origEv9' });
    assert.ok(self.eventDeck.includes('origEv9'));
    assert.ok(self.eventDeck.includes('origEv1'));
    assert.deepEqual(self.eventDiscard, ['origEv2'], 'self-shuffling Malfunction leaves other discards alone');

    const removed = originalGame();
    removed.eventDeck = ['origEv1']; removed.eventDiscard = ['origEv2'];
    removed.turretEntries = [{ kind: 'intruder', id: 'late-event-spawn', room: '002' }];
    OPS['event.finish'](removed, { id: 'origEv17' });
    assert.equal(removed.turretEntries.length, 1, 'entries must remain until Hive Development, which follows Event finish');
    OPS['phase.cleanup'](removed);
    assert.deepEqual(removed.turretEntries, [], 'entries after this round’s Fire Damage expire before next round as stale entries');
    assert.deepEqual(removed.origEventRemoved, ['origEv17']);
    assert.ok(removed.eventDeck.includes('origEv2'), 'remove-policy events shuffle the discard back into the deck');
    assert.ok(!removed.eventDeck.includes('origEv17'));
    assert.deepEqual(removed.eventDiscard, []);
});

test('Original Attack deck setup and toughness values match the printed physical-card distribution', () => {
    const s = originalGame();
    assert.deepEqual(s.attackDeck.slice().sort(), ORIGINAL_ATTACK_CARDS.map(c => c.id).sort(), 'createGame installs each physical Attack card once');
    const actual = ORIGINAL_ATTACK_CARDS.map(c => c.effect + ':' + c.wound).sort();
    const actualTargets = ORIGINAL_ATTACK_CARDS.map(c => c.targets.slice().sort().join(','));
    // Independently transcribed toughness and Intruder-symbol rows from the physical sheet
    // Nemesis/Оригинальная игра/Чужие - Атака.png.
    const printedTargets = [
        'adult,crawler,drone,queen', 'adult,crawler,drone,queen', 'adult,crawler,drone,queen', 'adult,crawler,drone,queen',
        'adult,drone,queen', 'adult,drone,queen', 'adult,drone,queen', 'adult,crawler,drone,queen',
        'crawler,queen', 'crawler', 'adult,drone,queen', 'adult,drone,queen', 'adult,drone,queen',
        'adult,drone,queen', 'adult,drone,queen', 'crawler', 'drone,queen', 'drone,queen', 'queen', 'queen',
    ];
    assert.deepEqual(actualTargets, printedTargets);
    const printed = [
        'scratch:2', 'scratch:3', 'scratch:5', 'scratch:6',
        'claws:3', 'claws:4', 'claws:5', 'claws:retreat',
        'bite:4', 'bite:4', 'bite:retreat', 'bite:retreat',
        'slime:5', 'summon:3', 'transform:4', 'transform:5',
        'frenzy:3', 'frenzy:4', 'tail:2', 'tail:5',
    ].sort();
    assert.deepEqual(actual, printed);
});

test('Original physical Attack effects resolve through the production attack operator', () => {
    function attack(cardId, intruderType, players = 1, prepare = () => {}) {
        const s = originalGame(players), p = s.players[0], room = '002';
        for (const q of s.players) q.room = room;
        const it = spawnIntruder(s, intruderType, room);
        prepare(s, p, it);
        s.attackDeck = [cardId]; s.attackDiscard = [];
        OPS.attack(s, { op: 'attack', player: p.id, intruder: it.uid, context: 'phase', noReaction: true });
        run(s);
        return { s, p, it, room };
    }
    {
        const { p } = attack('origAtk1', 'adult');
        assert.equal(p.health, 9, 'Scratch: one Light Wound is one health');
        assert.equal(p.discard.filter(c => String(c).startsWith('contam#')).length, 1);
    }
    {
        const { p } = attack('origAtk5', 'drone');
        assert.equal(p.health, 8, 'Claws: two Light Wounds');
        assert.equal(p.discard.filter(c => String(c).startsWith('contam#')).length, 1);
    }
    {
        const { p } = attack('origAtk14', 'adult');
        assert.equal(p.wounds.length, 1, 'Bite: gain a Serious Wound below the two-wound death threshold');
    }
    {
        const { p } = attack('origAtk8', 'adult');
        assert.equal(p.slime, true, 'Slime: gain the Slime marker');
        assert.equal(p.discard.filter(c => String(c).startsWith('contam#')).length, 1);
    }
    {
        const { s, room } = attack('origAtk9', 'queen', 1, s => { s.bag = ['adult']; });
        assert.equal(Object.values(s.intruders).filter(it => it.room === room).length, 2, 'Summon: the drawn bag token adds a figure without another Encounter');
    }
    {
        const { s, p, room } = attack('origAtk10', 'crawler', 1, (_s, target) => { target.hand = []; });
        assert.ok(Object.values(s.intruders).some(it => it.type === 'drone' && it.room === room), 'Transform: replace the Crawler with a Drone');
        assert.ok(s.log.some(entry => entry.text.includes('внезапная атака Дрона')), 'no cards in hand triggers the printed Surprise Attack');
    }
    {
        const { s, p } = attack('origAtk17', 'drone', 2, (_s, target) => { target.wounds = ['head', 'chest']; });
        const other = s.players[1];
        assert.equal(p.status, 'dead', 'Frenzy: a Character with at least two Serious Wounds dies');
        assert.equal(other.wounds.length, 1, 'Frenzy: the other Character receives a Serious Wound');
    }
    {
        const { p } = attack('origAtk19', 'queen', 1, (_s, target) => { target.wounds = ['arm']; });
        assert.equal(p.status, 'dead', 'Tail: a Character with one Serious Wound dies');
    }
});

test('Both printed Original Bite Retreat cards execute a real toughness retreat', () => {
    for (const attackId of ['origAtk6', 'origAtk7']) {
        const s = originalGame(), r = '002';
        const exit = s.ship.rooms[r].exits.find(e => e.corridor !== 'tech');
        const event = ORIGINAL_EVENT_CARDS.find(c => c.move.num === exit.num);
        assert.ok(event, 'need a physical Event with corridor ' + exit.num);
        s.attackDeck = [attackId]; s.eventDeck = [event.id]; s.attackDiscard = []; s.eventDiscard = [];
        const intruder = { uid: 'retreat-' + attackId, type: 'adult', room: r, hits: 0 };
        s.intruders[intruder.uid] = intruder;

        originalApplyWounds(s, intruder, 1);
        assert.equal(s.intruders[intruder.uid].room, exit.to, attackId + ' retreats along the drawn Event corridor');
        assert.deepEqual(s.attackDiscard, [attackId]);
        assert.deepEqual(s.eventDiscard, [event.id]);
    }
});

test('Original global malfunction events also affect matching unexplored Rooms', () => {
    const s = originalGame(), hiddenGreen = '002', hiddenYellowComputer = '003';
    s.malfLeft = 20;
    for (const [id, tile] of [[hiddenGreen, 'laboratory'], [hiddenYellowComputer, 'commandCenter']]) {
        s.roomState[id].explored = false;
        s.roomState[id].tile = null;
        s.roomState[id].malfunction = false;
        s.secret.tiles[id] = tile;
    }

    OPS['event.effect'](s, { id: 'origEv18' }); // Life Support Failure: each Green Room
    assert.equal(s.roomState[hiddenGreen].malfunction, true);
    OPS['event.effect'](s, { id: 'origEv20' }); // Short Circuit: each Yellow Computer Room
    assert.equal(s.roomState[hiddenYellowComputer].malfunction, true);
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

test('Original exploration data matches the checked-in token inventory transcription', () => {
    const inventory = fs.readFileSync(new URL('../../Nemesis/Оригинальная игра/Комнаты/Токены разведки.txt', import.meta.url), 'utf8');
    const rows = inventory.split(/\r?\n/).slice(inventory.split(/\r?\n/).findIndex(line => line.trim() === 'Начинаю:') + 1).map(line => line.trim()).filter(Boolean);
    const sourceTokens = rows.map(line => {
        const m = /^(.+?)\s*-\s*(\d+)\s*$/.exec(line);
        assert.ok(m, 'malformed inventory row: ' + line);
        const effect = ({ 'Шум': 'danger', 'Слизь': 'slime', 'Турель': 'turret', 'Тишина': 'silence', 'Дверь': 'door', 'Поломка': 'malfunction', 'Огонь': 'fire' })[m[1]];
        assert.ok(effect, 'unknown token in inventory transcription: ' + m[1]);
        return effect + ':' + Number(m[2]);
    }).sort();
    const implemented = ORIGINAL_EXPLORATION_TOKENS.map(t => t.effect + ':' + t.items).sort();
    assert.equal(sourceTokens.length, 23);
    assert.equal(implemented.length, 23);
    assert.deepEqual(implemented, sourceTokens);
});

test('Time advances once in the phase assigned to each Original, Redux and DLC rules path', () => {
    const base = originalGame();
    base.queue = []; base.prompt = null; base.resume = null; base.phase = 'player'; base.time = 10;
    OPS['phase.intruder'](base);
    assert.equal(base.time, 9, 'Original base time advances at Intruder Phase start');
    base.queue = []; OPS['phase.cleanup'](base);
    assert.equal(base.time, 9, 'Original base time must not decrement again at Cleanup');

    const redux = createGame({ rules: 'redux', enemySet: 'redux', seed: 'audit-redux-time', players: [
        { name: 'A', charId: 'soldier' }, { name: 'B', charId: 'scout' },
    ] });
    redux.queue = []; redux.prompt = null; redux.resume = null; redux.time = 10;
    OPS['phase.intruder'](redux);
    assert.equal(redux.time, 10, 'Redux does not advance time at Intruder Phase start');
    redux.queue = []; OPS['phase.cleanup'](redux);
    assert.equal(redux.time, 9, 'Redux advances time at Cleanup');

    const chy = createGame({ enemySet: 'chytrids', seed: 'audit-real-chytrid-setup', players: [
        { name: 'A', charId: 'soldier' }, { name: 'B', charId: 'scout' },
    ] });
    assert.equal(chy.rules, 'original', 'this is the actual lobby configuration for a DLC set');
    chy.queue = []; chy.prompt = null; chy.resume = null; chy.phase = 'player'; chy.time = 10;
    OPS['phase.intruder'](chy);
    assert.equal(chy.time, 10, 'Redux-adapted Chytrids do not take the Original base-game time step');
    assert.ok(!chy.queue.some(step => step.op === 'original.phaseFire'));
    chy.queue = []; OPS['phase.cleanup'](chy);
    assert.equal(chy.time, 9, 'Redux-adapted Chytrids advance time at Cleanup');

    for (const [enemySet, startOp] of [['carnomorphs', 'carnomorph.phaseStart'], ['voidseeders', 'void.phaseStart']]) {
        const s = createGame({ enemySet, seed: 'audit-' + enemySet + '-time', players: [
            { name: 'A', charId: 'soldier' }, { name: 'B', charId: 'scout' },
        ] });
        assert.equal(s.rules, 'original');
        s.queue = []; s.prompt = null; s.resume = null; s.phase = 'intruder'; s.time = 10;
        OPS[startOp](s);
        assert.equal(s.time, 9, enemySet + ' owns its time decrement at phase start');
        s.queue = []; OPS['phase.cleanup'](s);
        assert.equal(s.time, 9, enemySet + ' must not decrement again at Cleanup');
    }
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

test('Original Aftermath Turret statuses are independently randomized per miniature', () => {
    const s = createGame({ rules: 'original', enemySet: 'redux', seed: 'turret-seed-0', players: [
        { name: 'A', charId: 'soldier' }, { name: 'B', charId: 'scout' },
    ] });
    assert.equal(s.secret.turretStatuses.length, 3);
    assert.ok(new Set(s.secret.turretStatuses).size < 3, 'fixed seed demonstrates duplicates are allowed; statuses are not dealt from a shared one-each pool');
});

test('A real character move reveals a Target: All Turret; its Light Wound resolves in the Fire Damage step', () => {
    const s = originalGame(), p = s.players[0], from = '001';
    const exit = s.ship.rooms[from].exits[0], r = exit.to;
    p.room = from;
    s.ship.corridors[exit.corridor].door = 'open';
    s.roomState[r].tile = 'laboratory'; s.roomState[r].explored = true;
    s.secret.turretStatuses = ['all', 'intruders', 'inactive'];
    const turret = placeTurret(s, r);
    assert.ok(turret);
    assert.equal(viewFor(s, p.id).turrets[0].status, null);

    s.phase = 'player';
    OPS['move.go'](s, { player: p.id, dest: r, noNoise: true, then: { op: 'noop' } });
    run(s);
    assert.equal(turret.status, 'all');
    assert.equal(p.health, 10, 'turret shooting is not immediate on entry');
    assert.equal(p.wounds.length, 0);
    assert.equal(viewFor(s, p.id).turrets[0].status, 'all');

    s.prompt = null; // this fixture has not advanced through the rest of the Player Phase
    OPS['original.phaseFire'](s); run(s);
    assert.equal(p.health, 9, 'Target: All causes one Light Wound at Fire Damage');
    OPS['original.phaseFire'](s); run(s);
    assert.equal(p.health, 9, 'a character who stayed in the Room is not shot again without re-entering');
});

test('Aftermath Defense Room action changes a selected Turret status', () => {
    const s = originalGame(), p = s.players[0], defenseRoom = '002', turretRoom = '003';
    p.room = defenseRoom;
    s.roomState[defenseRoom].tile = 'defense';
    s.roomState[turretRoom].tile = 'laboratory';
    s.secret.turretStatuses = ['inactive', 'all', 'intruders'];
    const turret = placeTurret(s, turretRoom);
    assert.equal(roomActionAvailable(s, p).ok, true);

    OPS['room.action'](s, { player: p.id, tile: 'defense', then: { op: 'noop' } });
    assert.equal(s.prompt.title, 'Отсек обороны: какую турель переключить?');
    assert.equal(answer(s, p.id, s.prompt.id, String(turret.id)), true);
    assert.equal(s.prompt.title, 'Выберите новый статус турели');
    assert.equal(answer(s, p.id, s.prompt.id, 'all'), true);
    assert.equal(turret.status, null, 'the changed Status is placed facedown');
    assert.equal(s.secret.turretStatuses[turret.id - 1], 'all');
    assert.equal(viewFor(s, p.id).turrets[0].status, null);
    p.room = turretRoom;
    turretOnCharacterEntry(s, p, turretRoom);
    assert.equal(turret.status, 'all', 'the face-down Status is revealed when a Character enters the Room');
});

test('Aftermath Demolition can destroy an active Turret; Inactive Turrets remain indestructible', () => {
    const s = originalGame(), p = s.players[0], r = '002';
    s.roomState[r].tile = 'laboratory';
    s.secret.turretStatuses = ['all', 'inactive', 'intruders'];
    const active = placeTurret(s, r); active.status = 'all';
    OPS['card.demolition'](s, { player: p.id });
    assert.ok(s.prompt.options.some(o => o.id === 'turret:' + active.id));
    assert.equal(answer(s, p.id, s.prompt.id, 'turret:' + active.id), true);
    run(s);
    assert.equal(active.destroyed, true);

    const inactive = placeTurret(s, '003');
    s.secret.turretStatuses[inactive.id - 1] = 'inactive';
    OPS['turret.destroy'](s, { turretId: inactive.id, then: { op: 'noop' } });
    run(s);
    assert.equal(inactive.destroyed, false);
});

test('A spawned Intruder is recorded as a Turret entrant and shot only during Fire Damage', () => {
    const s = originalGame(), r = '002';
    s.phase = 'player';
    s.roomState[r].tile = 'laboratory'; s.secret.turretStatuses = ['intruders', 'all', 'inactive'];
    const turret = placeTurret(s, r);
    const it = spawnIntruder(s, 'adult', r);
    assert.equal(it.hits, 0, 'spawning does not cause an immediate Turret shot');
    assert.deepEqual(s.turretEntries, [{ kind: 'intruder', id: it.uid, room: r }]);
    assert.equal(turret.status, null, 'an Intruder spawning does not reveal the hidden Status');
    OPS['original.phaseFire'](s); run(s);
    assert.equal(it.hits, 1, 'Target: Intruders fires during Fire Damage');
    assert.equal(turret.status, null);
    assert.deepEqual(s.turretEntries, [], 'Fire Damage clears this-turn entrants after resolving the Turrets');
});

test('Turrets hit figures that entered earlier in the turn even if they have since left the Room', () => {
    const s = originalGame(), p = s.players[0], r = '002';
    s.roomState[r].tile = 'laboratory'; s.secret.turretStatuses = ['all', 'inactive', 'intruders'];
    const turret = placeTurret(s, r); turret.status = 'all';
    p.room = r; turretOnCharacterEntry(s, p, r); p.room = '003';
    const it = spawnIntruder(s, 'adult', r); it.room = '003';
    assert.equal(p.health, 10);
    assert.equal(it.hits, 0);

    OPS['original.phaseFire'](s); run(s);
    assert.equal(p.health, 9, 'Target: All shoots a Character recorded as having entered this turn');
    assert.equal(it.hits, 1, 'the entry-triggered shot resolves even after the Intruder moved away');
});

test('Turret exploration tokens preserve their Search counter and placement excludes Nest and slime-covered rooms only', () => {
    const s = originalGame(), r = '002';
    s.roomState[r].tile = 'laboratory';
    const token = { effect: 'turret', items: 2, label: 'Турель (2 предм.)' };
    s.secret.tiles[r] = 'laboratory'; s.secret.tokens[r] = token;
    OPS.explore(s, { room: r, player: s.players[0].id, from: '001' });
    assert.equal(s.roomState[r].itemsLeft, 2);
    assert.equal(s.turrets.length, 1);
    searchRoom(s, s.players[0], { op: 'noop' }, r);
    assert.equal(s.roomState[r].itemsLeft, 1, 'search spends one counter from the same discovered turret token');

    s.roomState['003'].explored = false; s.secret.tiles['003'] = 'nest'; s.secret.tokens['003'] = token;
    OPS.explore(s, { room: '003', player: s.players[0].id, from: '001' });
    s.roomState['004'].explored = false; s.secret.tiles['004'] = 'contaminated'; s.secret.tokens['004'] = token;
    OPS.explore(s, { room: '004', player: s.players[0].id, from: '001' });
    assert.equal(s.turrets.length, 2, 'the physical rules prohibit Nest and slime-covered Rooms, not contaminated Rooms');

    s.roomState['005'].slimeCovered = true;
    assert.equal(placeTurret(s, '005'), null, 'a Room covered in Slime cannot contain a Turret');
});

test('Original Fire Damage step resolves Turret shots and ordinary room Fire separately', () => {
    const s = originalGame(), p = s.players[0], turretRoom = '002', fireRoom = '003';
    p.room = turretRoom; s.phase = 'setup';
    s.roomState[turretRoom].tile = 'laboratory';
    s.roomState[fireRoom].tile = 'laboratory'; s.roomState[fireRoom].fire = true;
    s.secret.turretStatuses = ['all', 'inactive', 'intruders'];
    const turret = placeTurret(s, turretRoom); turret.status = 'all';
    const turretLarva = spawnIntruder(s, 'larva', turretRoom);
    const fireLarva = spawnIntruder(s, 'larva', fireRoom);

    OPS['original.phaseFire'](s);
    assert.deepEqual(s.queue.map(step => step.op), ['turret.eventPhase', 'original.fireDamage']);
    run(s);
    assert.equal(turret.destroyed, true);
    assert.equal(s.intruders[turretLarva.uid], undefined, 'the Turret shoots the Larva that spawned in its Room');
    assert.equal(s.intruders[fireLarva.uid], undefined, 'ordinary Room Fire independently burns the other Larva');
    assert.equal(p.health, 10, 'a Character already standing in the Room is not an entrant');
});

test('Fire Damage does not repeatedly shoot standing occupants; active Turrets are destroyed by any Intruder in-room', () => {
    const s = originalGame(), p = s.players[0], r = '002';
    p.room = r; s.roomState[r].tile = 'laboratory';
    s.secret.turretStatuses = ['all', 'inactive', 'intruders'];
    const active = placeTurret(s, r); active.status = 'all';
    const intruder = spawnIntruder(s, 'adult', r);
    s.turretEntries = []; // model an Intruder that was already in the room before this turn
    OPS['turret.eventPhase'](s);
    assert.equal(p.health, 10, 'standing Characters are not shot');
    assert.equal(intruder.hits, 0, 'standing Intruders are not shot');
    assert.equal(active.destroyed, true, 'the Intruder destroys an active Turret in its Room');

    const inactiveRoom = '003'; s.roomState[inactiveRoom].tile = 'laboratory';
    const inactive = placeTurret(s, inactiveRoom); inactive.status = 'inactive';
    const second = spawnIntruder(s, 'adult', inactiveRoom);
    s.turretEntries = [];
    OPS['turret.eventPhase'](s);
    assert.equal(second.hits, 0);
    assert.equal(inactive.destroyed, false, 'an inactive Turret cannot be destroyed');
});

test('Original Eclosion spawns a Crawler rather than a Redux Adult', () => {
    const s = originalGame(), p = s.players[0];
    p.room = '011'; p.status = 'active'; p.hand.push('contam#round27');
    eclosionProcedure(s, p);
    assert.ok(Object.values(s.intruders).some(i => i.type === 'crawler' && i.room === '011'));
    assert.ok(!Object.values(s.intruders).some(i => i.type === 'adult' && i.room === '011'));
});
