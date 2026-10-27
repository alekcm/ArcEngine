// Rules-conformance audit, deliberately separate from the passing ArcEngine test suite.
// Run: node --test nemesis/tools/audit.test.mjs
// Assertions describe the supplied Redux rulebook/cards, NOT the existing bugs.
// Known discrepancies therefore fail until the gameplay implementation is corrected.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../shared/engine/setup.mjs';
import {
    OPS, answer, next, run, loseHealth, gainContamination, drawCards,
    heavyCount, handLimit, destroyShip,
} from '../shared/engine/core.mjs';
import { buildMenu } from '../shared/engine/turn.mjs';
import { roomActionCost, roomActionAvailable, giveItem } from '../shared/engine/rooms.mjs';
import { dealHits } from '../shared/engine/combat.mjs';
import { infectionProcedure, eclosionProcedure } from '../shared/engine/actions.mjs';
import { checkObjective } from '../shared/engine/endgame.mjs';
import { viewFor } from '../shared/view.mjs';
import { seedFromString, shuffle } from '../shared/rng.mjs';
import {
    CHARACTERS, ITEMS, ATTACK_CARDS, OBJECTIVES, QUEEN_CARDS, INTRUDER_TOKENS, COORDINATE_CARDS,
} from '../shared/data/cards.mjs';
import { ROOM_TILES, EXPLORATION_TOKENS } from '../shared/ship.mjs';

function fresh(chars = ['soldier', 'scout']) {
    const state = createGame({
        seed: 'redux-audit-2026-10-27', mode: 'original', draft: false,
        players: chars.map((charId, i) => ({ name: 'Audit ' + i, charId })),
    });
    state.queue = []; state.prompt = null; state.resume = null; state.result = null;
    state.phase = 'player'; state.current = 0; state.firstPlayer = 0;
    state.seating = state.players.map(p => p.id); state.turnCursor = 0; state.actionsLeft = 2;
    state.adaptations = []; state.intruders = {}; state.fx = [];
    state.secret.engines.forEach(e => { e.working = true; });
    state.secret.coordinates = 'coordA'; state.destination = 'A';
    state.players.forEach((p, i) => {
        p.hand = [p.charId + '.rest#0', p.charId + '.search#0', p.charId + '.demolition#0'];
        p.deck = Array.from({ length: 10 }, (_, k) => p.charId + '.search#' + (k + 10));
        p.discard = []; p.wounds = []; p.health = 10; p.larva = false;
        p.room = i ? '003' : '011'; p.status = 'active'; p.passed = false;
        p.objectives = [{ kind: 'personal', id: 'oldestFriend' }]; p.objective = p.objectives[0];
    });
    return state;
}
function execute(state, step) { next(state, step); run(state); }
function choose(state, value) {
    assert.ok(state.prompt, 'The fixture must have an answerable prompt');
    assert.equal(answer(state, state.prompt.player, state.prompt.id, value), true);
}
function reveal(state, id, tile) {
    state.roomState[id].explored = true;
    state.roomState[id].tile = tile;
    state.secret.tiles[id] = tile;
}
function intruder(state, type = 'adult', at = state.players[0].room, hits = 0) {
    const it = { uid: 'audit-intruder-' + (++state.intruderSeq), type, room: at, hits };
    state.intruders[it.uid] = it;
    return it;
}
function inst(state, item, extras = {}) {
    const d = ITEMS[item];
    return { uid: 'audit-item-' + (++state.itemSeq), item, broken: false,
        ...(d.weapon ? { ammo: d.weapon.max } : {}),
        ...(d.markers !== undefined ? { charge: d.markers } : {}), ...extras };
}
function play(state, card) {
    execute(state, { op: 'turn.do', player: 0, answer: { action: 'card', cardId: card } });
}

// Controls: correct basic mechanisms must remain distinguished from discrepancies.
test('OK-01 / Атака.txt: 20 attack cards, including six Bite cards', () => {
    const s = fresh();
    assert.equal(s.attackDeck.length, 20);
    assert.equal(s.attackDeck.filter(c => c === 'bite').length, 6);
});
test('OK-02 / Атака.txt: green and red item multiplicities', () => {
    const s = fresh();
    const expected = {
        green: { synthFood: 3, stimulants: 3, caffeine: 3, autodoc: 3, medkit: 5, antiseptic: 3, stapler: 7, adrenaline: 3 },
        red: { supportCrate: 1, selfDestructKey: 1, armor: 3, grenade: 5, flashbang: 3, energyCharge: 10, evacKey: 1, taser: 3, logCodes: 1, detonator: 2 },
    };
    for (const [deck, counts] of Object.entries(expected)) {
        assert.equal(s.itemDecks[deck].length, 30);
        for (const [id, count] of Object.entries(counts)) assert.equal(s.itemDecks[deck].filter(c => c === id).length, count, id);
    }
});
test('OK-03 / Атака.txt: eight serious wounds, three copies each', () => {
    const s = fresh();
    assert.equal(s.woundDeck.length, 24);
    for (const id of new Set(s.woundDeck)) assert.equal(s.woundDeck.filter(w => w === id).length, 3, id);
});
test('OK-04 / pp. 2, 25: starting bag, exploration supply, feats and adaptations', () => {
    for (let n = 1; n <= 5; n++) {
        const s = fresh(Object.keys(CHARACTERS).slice(0, n));
        assert.equal(s.bag.filter(c => c === 'adult').length, 5 + n);
        assert.equal(s.bag.filter(c => c === 'larva').length, 4);
        assert.equal(s.bag.filter(c => c === 'blank').length, 1);
        assert.equal(s.feats.length, 6);
        assert.equal(s.adaptationsRemoved, 0);
    }
    assert.equal(EXPLORATION_TOKENS.length, 16);
    const s = createGame({ seed: 'adapt-control', players: [{ name: 'A', charId: 'soldier' }] });
    assert.equal(s.adaptations.length, 3);
});
test('OK-05 / p. 5: contamination cannot pay a basic action cost', () => {
    const s = fresh(), p = s.players[0];
    p.hand = ['contam#test'];
    assert.equal(buildMenu(s, p).actions.find(a => a.id === 'move').enabled, false);
});
test('OK-06 / p. 20: Infection discards scanned cards and places at most one larva', () => {
    const s = fresh(), p = s.players[0];
    p.hand = ['contam#yes', 'contam#no']; s.secret.contamInfected['contam#yes'] = true;
    infectionProcedure(s, p);
    assert.equal(p.larva, true); assert.equal(p.hand.length, 0);
    assert.deepEqual(p.discard, ['contam#yes', 'contam#no']);
});
test('OK-07 / p. 20: ordinary Eclosion checks ANY contamination, not only infected', () => {
    const s = fresh(), p = s.players[0];
    p.hand = []; p.deck = ['contam#clean', ...p.deck];
    s.secret.contamInfected['contam#clean'] = false;
    eclosionProcedure(s, p);
    assert.equal(p.status, 'dead');
});
test('OK-08 / Attack scan: Tail variants are different and match their printed text', () => {
    assert.deepEqual(ATTACK_CARDS.find(c => c.id === 'tail1').adult, [{ op: 'dmg', n: 1 }, { op: 'contam' }]);
    assert.deepEqual(ATTACK_CARDS.find(c => c.id === 'tail2').adult, [{ op: 'contam' }]);
});
test('OK-09 / p. 11: a numeric result no higher than Queen Hits triggers the card procedure', () => {
    const s = fresh(), p = s.players[0], q = intruder(s, 'queen');
    s.pendingRoll = { die: 'combat', value: 2 };
    dealHits(s, p, q, 2, 0);
    assert.ok(s.queue.some(step => step.op === 'queen.card'));
});

test('DECK-01 / Атака.txt: the Queen health deck has 14 cards with the specified copies', () => {
    const s = fresh();
    const counts = Object.fromEntries(QUEEN_CARDS.map(c => [c.id, 1]));
    counts.q2malf = 3; counts.q2act = 3; counts.q1repel = 2;
    const actual = Object.fromEntries(Object.keys(counts).map(id => [id, s.queenDeck.filter(i => QUEEN_CARDS[i].id === id).length]));
    assert.deepEqual({ size: s.queenDeck.length, copies: actual }, { size: 14, copies: counts });
});
test('ACT-01 / Dashboard: a normal Room Action costs two cards', () => {
    const s = fresh(); reveal(s, '006', 'comms'); s.players[0].room = '006';
    assert.equal(roomActionCost(s, s.players[0]), 2);
});
test('ACT-02 / Dashboard: Computer and Pick Up Object are not-in-combat actions', () => {
    const s = fresh(), p = s.players[0];
    reveal(s, '006', 'comms'); p.room = '006'; p.items = [];
    s.roomState['006'].objects = [{ type: 'corpse' }]; intruder(s);
    const menu = buildMenu(s, p);
    assert.deepEqual(Object.fromEntries(['computer', 'pickup'].map(id => [id, menu.actions.find(a => a.id === id).enabled])),
        { computer: false, pickup: false });
});
test('HP-01 / p. 13, Dashboard: losing ten health from the first space reaches the skull', () => {
    const s = fresh(), p = s.players[0]; loseHealth(s, p, 10, 'audit');
    assert.equal(p.status, 'dead');
});
test('QUEUE-01 / p. 17: Archives resolves the knowledge reward BEFORE another action', () => {
    const s = fresh(), p = s.players[0]; reveal(s, '006', 'archives'); p.room = '006';
    execute(s, { op: 'room.action', player: 0 });
    assert.equal(p.knowledge, 3);
    assert.match(s.prompt.title, /Порог знаний 3/);
});
test('QUEUE-02 / p. 11: a critical shot resolves a Queen Health card BEFORE the turn menu', () => {
    const s = fresh(), p = s.players[0], q = intruder(s, 'queen');
    p.items = [inst(s, 'handgun')]; s.pendingRoll = { die: 'combat', value: 'crit' };
    const before = s.queenDeck.length;
    execute(s, { op: 'shoot.fire', player: 0, weapon: p.items[0].uid, target: q.uid });
    assert.ok(s.queenDeck.length < before, 'Queen Health procedure is still pending behind turn.choose');
});
test('QUEUE-03 / p. 14: a newly gained heavy item enforces hand capacity immediately', () => {
    const s = fresh(), p = s.players[0]; p.items = [inst(s, 'handgun'), inst(s, 'scoutRifle')];
    execute(s, { op: 'item.keepOne', player: 0, answer: '0', cards: ['medkit'], then: { op: 'turn.choose' } });
    assert.ok(heavyCount(p) <= handLimit(p) || s.prompt.kind !== 'turn', 'Three occupied slots are allowed at the next action menu');
});
test('COMBAT-01 / p. 12: Larva attacks offer Nerves of Steel prevention', () => {
    const s = fresh(), p = s.players[0], it = intruder(s, 'larva');
    p.hand = ['soldier.nervesOfSteel#0'];
    execute(s, { op: 'attack', player: 0, intruder: it.uid, context: 'surprise' });
    assert.equal(p.larva, false, 'Attack applied before the reaction window');
    assert.equal(s.prompt.kind, 'choice');
});
test('COMBAT-02 / Blood Sense: the moving character is followed to the destination', () => {
    const s = fresh(), p = s.players[0], it = intruder(s, 'drone');
    const dest = s.ship.rooms[p.room].exits[0].to; reveal(s, dest, 'comms');
    s.attackDeck = ['bloodSense']; s.attackDiscard = [];
    execute(s, { op: 'move.chosen', player: 0, answer: dest, noNoise: true, then: { op: 'turn.choose' } });
    assert.equal(p.room, dest);
    assert.equal(it.room, dest);
});
test('CARD-01 / My Little Friend: the burst actually reaches a shooting roll', () => {
    const s = fresh(), p = s.players[0]; p.items = [inst(s, 'soldierGun', { ammo: 2 })]; intruder(s);
    execute(s, { op: 'card.myLittleFriend', player: 0 }); choose(s, 'burst');
    assert.equal(s.prompt.kind, 'dice');
});
for (const [char, card, at, targetAfterPayment] of [
    ['mechanic', 'duckAndCover', '011', 'room'],
    ['mechanic', 'technicalCorridors', '005', 'room'],
    ['labrat', 'feelOfDark', '011', 'room'],
    ['sentry', 'facilityTour', '011', 'room'],
    ['scout', 'scavenging', '006', 'choice'],
]) {
    test('COST-01 / ' + char + '.' + card + ': printed extra discard is charged once, not twice', () => {
        const s = fresh([char, 'soldier']), p = s.players[0];
        reveal(s, '006', 'comms'); reveal(s, at, 'comms'); p.room = at;
        const id = char + '.' + card + '#0';
        assert.ok(CHARACTERS[char].cards[card], 'Use a real character card id');
        p.hand = [id, char + '.search#10', char + '.demolition#10'];
        play(s, id);
        assert.equal(s.prompt.kind, 'cards'); choose(s, [s.prompt.cards[0]]);
        if (card === 'facilityTour') choose(s, '0');
        assert.equal(s.prompt.kind, targetAfterPayment, s.prompt.title);
    });
}
test('COST-02 / Repairs: removing a malfunction requires its printed additional discard', () => {
    const s = fresh(), p = s.players[0]; reveal(s, '006', 'comms'); p.room = '006';
    s.roomState[p.room].malfunction = true;
    p.hand = ['soldier.repairs#0', 'soldier.search#0'];
    play(s, p.hand[0]); choose(s, 'malf');
    assert.ok(p.hand.length === 0 || s.prompt.kind === 'cards', 'Malfunction removed with no extra card payment');
});
test('CARD-02 / Computer Skills: use the ROOM, not the face-up Computer Action', () => {
    const s = fresh(['pilot', 'soldier']), p = s.players[0]; reveal(s, '006', 'comms'); p.room = '006';
    execute(s, { op: 'card.computerSkills', player: 0 }); choose(s, 'comp');
    assert.equal(p.signal, true);
});
test('CARD-03 / CEO ActionDeck: both additional reaction cards are present (12 cards total)', () => {
    assert.equal(Object.keys(CHARACTERS.ceo.cards).length, 12);
});
test('CARD-04 / Convict Duck and Cover: the printed redirect reaction is available', () => {
    const s = fresh(['convict', 'soldier']), p = s.players[0], it = intruder(s);
    s.players[1].room = p.room; p.hand = ['convict.duckAndCover#0'];
    execute(s, { op: 'attack', player: 0, intruder: it.uid, context: 'phase' });
    assert.ok(s.prompt?.options?.some(o => o.id === 'duck'));
});
test('CARD-05 / Deactivation: the attack card is revealed before the reaction decision', () => {
    const s = fresh(['android', 'soldier']), p = s.players[0], it = intruder(s);
    p.hand = ['android.deactivation#0']; s.attackDeck = ['scratch1', 'bite'];
    execute(s, { op: 'attack', player: 0, intruder: it.uid, context: 'phase' });
    assert.equal(s.attackDeck.length, 1);
});
test('ROOM-01 / Surgery: all clean deck cards are also discarded, not left in the deck', () => {
    const s = fresh(), p = s.players[0];
    reveal(s, '006', 'surgery'); p.room = '006';
    p.deck = ['soldier.search#9', 'contam#clean']; p.discard = [];
    execute(s, { op: 'room.action', player: 0 });
    assert.equal(p.deck.length, 0);
});
test('ROOM-02 / Laboratory: a Character Corpse is an analyzable Heavy Object', () => {
    const s = fresh(), p = s.players[0]; reveal(s, '006', 'laboratory'); p.room = '006';
    p.items = []; p.heavy = [{ type: 'charCorpse', who: 1 }];
    assert.equal(roomActionAvailable(s, p).ok, true);
});
test('ROOM-03 / Airlock: occupants remain alive until the end of the Player Phase', () => {
    const s = fresh(); reveal(s, '006', 'airlock'); s.players[0].room = '006';
    const target = '002'; s.players[1].room = target; const it = intruder(s, 'adult', target);
    execute(s, { op: 'room.airlock', player: 0, answer: target, then: { op: 'turn.choose' } });
    assert.equal(s.players[1].status, 'active'); assert.ok(s.intruders[it.uid]);
});
test('ROOM-04 / Server Room: the chosen remote room may have a malfunction', () => {
    const s = fresh(), p = s.players[0]; reveal(s, '006', 'server'); reveal(s, '014', 'comms');
    p.room = '006'; s.roomState['014'].malfunction = true;
    execute(s, { op: 'room.server', player: 0, answer: '014', then: { op: 'turn.choose' } });
    assert.equal(p.signal, true);
});
test('ROOM-05 / printed Laboratory tile: Search draws three green items', () => {
    assert.deepEqual(ROOM_TILES.laboratory.items, ['green', 'green', 'green']);
});
test('ROOM-06 / printed Archives tile: three red icons, not one yellow', () => {
    assert.deepEqual(ROOM_TILES.archives.items, ['red', 'red', 'red']);
});
test('COMPUTER-01 / Lock-down: resolve immediately when revealed AFTER a Computer Action', () => {
    const s = fresh(); reveal(s, '006', 'comms'); s.players[0].room = '006';
    s.computerCard = 'actionB'; s.computerDeck = ['lockdown', 'actionA']; s.computerDiscard = [];
    execute(s, { op: 'computer.start', player: 0 }); choose(s, 'heal');
    assert.equal(s.roomState['006'].malfunction, true);
    assert.notEqual(s.computerCard, 'lockdown');
});
test('COMPUTER-02 / p. 20, Computer B: contamination cannot pay Discard 1 Action card', () => {
    const s = fresh(), p = s.players[0]; p.hand = ['soldier.search#0', 'contam#test'];
    s.computerCard = 'actionB'; execute(s, { op: 'computer.start', player: 0 }); choose(s, 'know');
    assert.equal(s.prompt.cards.some(c => c.startsWith('contam#')), false);
});
test('ITEM-01 / Medkit: remove a serious wound AND restore three health in the same use', () => {
    const s = fresh(), p = s.players[0];
    p.health = 2; p.wounds = ['eyes']; p.items = [inst(s, 'medkit')];
    execute(s, { op: 'item.use', player: 0, uid: p.items[0].uid, then: { op: 'turn.choose' } });
    choose(s, 'w:0:eyes');
    if (s.prompt.kind !== 'turn' && s.prompt.options?.some(o => o.id === 'heal:0')) choose(s, 'heal:0');
    assert.equal(p.wounds.length, 0); assert.equal(p.health, 5);
});
test('ITEM-02 / Grenade Launcher: there is no normal single-target shooting mode', () => {
    const s = fresh(), p = s.players[0]; p.items = [inst(s, 'grenadeLauncher')]; intruder(s);
    execute(s, { op: 'shoot.start', player: 0 });
    assert.equal(s.prompt.options?.some(o => o.id === 'normal') ?? false, false);
});
test('ITEM-03 / Grenade Launcher: Armory cannot reload it without a Grenade', () => {
    const s = fresh(), p = s.players[0]; const w = inst(s, 'grenadeLauncher', { ammo: 0 }); p.items = [w];
    execute(s, { op: 'room.reload', player: 0, answer: w.uid, n: 2, then: { op: 'turn.choose' } });
    assert.equal(w.ammo, 0);
});
test('ITEM-04 / Sniper Rifle: basic Shoot is available when the ONLY target is nearby', () => {
    const s = fresh(), p = s.players[0]; p.items = [inst(s, 'sniperRifle')];
    intruder(s, 'adult', s.ship.rooms[p.room].exits[0].to);
    assert.equal(buildMenu(s, p).actions.find(a => a.id === 'shoot').enabled, true);
});
test('ITEM-05 / Assault Rifle: a natural 2 is critical even if Agile changes it', () => {
    const s = fresh(), p = s.players[0], it = intruder(s); s.adaptations = ['agile'];
    const w = inst(s, 'assaultRifle'); s.pendingRoll = { die: 'combat', value: 2 };
    dealHits(s, p, it, 1, 0, { weapon: w });
    assert.equal(s.intruders[it.uid], undefined);
});
test('ITEM-06 / Assault Rifle: its natural-2 effect also works against the Queen', () => {
    const s = fresh(), p = s.players[0], q = intruder(s, 'queen');
    const w = inst(s, 'assaultRifle'); s.pendingRoll = { die: 'combat', value: 2 };
    dealHits(s, p, q, 1, 0, { weapon: w });
    assert.ok(s.queue.some(step => step.op === 'queen.card'));
});
test('ITEM-07 / p. 10, Field Experience: normal non-Fire damage makes a combat kill-check', () => {
    const s = fresh(['xeno', 'soldier']); intruder(s);
    execute(s, { op: 'card.fieldExperience', player: 0 });
    assert.equal(s.prompt.kind, 'dice');
});
test('ITEM-08 / Hardened Armor: replacing a wound by two health loss is optional', () => {
    const s = fresh(), p = s.players[0]; p.armor = inst(s, 'hardenedArmor'); const it = intruder(s, 'drone');
    s.attackDeck = ['bite']; execute(s, { op: 'attack', player: 0, intruder: it.uid, context: 'phase' });
    assert.equal(s.prompt.kind, 'choice', 'Wound automatically replaced with health loss');
});
test('ITEM-09 / p. 13: a heavily injured character cannot gain armor', () => {
    const s = fresh(), p = s.players[0]; p.health = 3; p.armor = null;
    giveItem(s, p, 'armor');
    assert.equal(p.armor, null);
});
test('FEAT-01 / Overpower: ignore Fearless repel prevention', () => {
    const s = fresh(), p = s.players[0], it = intruder(s); s.adaptations = ['fearless'];
    execute(s, { op: 'feat.overpower', player: 0, then: { op: 'turn.choose' } });
    const dest = s.prompt.rooms[0]; choose(s, dest);
    assert.equal(it.room, dest);
});
test('FEAT-02 / Breach: ignore additional card costs of Computer Actions', () => {
    const s = fresh(), p = s.players[0]; s.computerCard = 'actionB';
    execute(s, { op: 'feat.breach', player: 0, then: { op: 'turn.choose' } });
    choose(s, 'go'); choose(s, 'know');
    assert.notEqual(s.prompt.kind, 'cards', 'Breach still asks for the printed additional card payment');
});
test('EVENT-01 / Queen Awakens: Queen tokens are limited to the available pool', () => {
    const s = fresh(); s.bag = ['queen', 'queen'];
    execute(s, { op: 'event.effect', id: 'queenAwakens' });
    assert.ok(s.bag.filter(t => t === 'queen').length <= INTRUDER_TOKENS.queen);
});
test('INV-01 / p. 14: other players cannot see regular light item identities', () => {
    const s = fresh(); s.players[1].items = [inst(s, 'stimulants')];
    const other = viewFor(s, 0).players[1];
    assert.equal(JSON.stringify(other.items).includes('stimulants'), false);
});
test('INV-02 / pp. 5, 24: another player cannot see the two secret Objective options', () => {
    const s = fresh(), p = s.players[0];
    p.objectives = [{ kind: 'personal', id: 'oldestFriend' }, { kind: 'corporate', id: 'priorityOne' }]; p.objective = null;
    execute(s, { op: 'turn.do', player: 0, answer: { action: 'objective' } });
    assert.equal(viewFor(s, 1).prompt.options, undefined);
});
test('INV-03 / p. 21: secret engine status is absent from other players\' prompt title', () => {
    const s = fresh(); s.players[0].room = '019';
    execute(s, { op: 'engine.toggle', player: 0, then: { op: 'turn.choose' } });
    assert.doesNotMatch(viewFor(s, 1).prompt.title, /ИСПРАВЕН|ПОВРЕЖДЁН/);
});
test('INV-04 / p. 14: receiving a Heavy Object enforces the recipient\'s hand capacity', () => {
    const s = fresh(), p = s.players[0], t = s.players[1]; t.room = p.room;
    p.heavy = [{ type: 'corpse' }]; t.items = [inst(s, 'handgun'), inst(s, 'scoutRifle')];
    execute(s, { op: 'trade.done', player: 0, answer: '1:heavy:0', then: { op: 'turn.choose' } });
    assert.ok(heavyCount(t) <= handLimit(t) || s.prompt.player === t.id, 'Recipient has three occupied slots without a capacity prompt');
});
test('INV-05 / Laika: Cannot be discarded also applies to the free Drop action', () => {
    const s = fresh(['bounty', 'soldier']), p = s.players[0];
    execute(s, { op: 'turn.do', player: 0, answer: { action: 'drop' } });
    assert.equal(s.prompt.options.some(o => o.id === 'item:' + p.items.find(i => i.item === 'laika').uid), false);
});
test('ANDROID-01 / Synthetic: infected contamination is scanned, removed and replaced on draw', () => {
    const s = fresh(['android', 'soldier']), p = s.players[0];
    p.hand = []; p.deck = ['contam#bad', 'android.search#7']; s.secret.contamInfected['contam#bad'] = true;
    drawCards(s, p, 1);
    assert.deepEqual({ health: p.health, hand: p.hand }, { health: 9, hand: ['android.search#7'] });
});
test('ANDROID-02 / Synthetic: a Larva cannot infect the Android', () => {
    const s = fresh(['android', 'soldier']), p = s.players[0], it = intruder(s, 'larva'); p.hand = [];
    execute(s, { op: 'attack', player: 0, intruder: it.uid, context: 'surprise' });
    assert.equal(p.larva, false);
});
test('ANDROID-03 / UPS: reshuffling with zero markers kills the Android', () => {
    const s = fresh(['android', 'soldier']), p = s.players[0];
    p.items.find(i => i.item === 'ups').charge = 0; p.deck = []; p.hand = []; p.discard = ['android.search#0'];
    drawCards(s, p, 1); assert.equal(p.status, 'dead');
});
test('START-01 / original starters: Cuffs 6, Robot 5, UPS 3 markers', () => {
    assert.deepEqual({ cuffs: ITEMS.cuffs.markers, robot: ITEMS.robot.markers, ups: ITEMS.ups.markers },
        { cuffs: 6, robot: 5, ups: 3 });
});
test('START-02 / Android gun: requires no ammo, not three charges with +1 shooting', () => {
    assert.equal(ITEMS.energyPistol.weapon.noAmmo, true);
});
test('START-03 / Hacker Smart Gun: reroll, not a permanent +1 modifier', () => {
    assert.deepEqual({ reroll: !!ITEMS.smartGun.weapon.reroll, plusOne: !!ITEMS.smartGun.weapon.plusOne },
        { reroll: true, plusOne: false });
});
test('START-04 / Sentry: starts with the Sentry SMG, not the Pilot-like shotgun', () => {
    const s = fresh(['sentry', 'soldier']), p = s.players[0];
    const gun = p.items.find(i => ITEMS[i.item].weapon);
    assert.deepEqual({ max: ITEMS[gun.item].weapon.max, boost: ITEMS[gun.item].weapon.boost },
        { max: 5, boost: { ammo: 1, hits: 1 } });
});
test('START-05 / CEO Robot: the starting Body wound exists', () => {
    const s = createGame({ seed: 'ceo-start', players: [{ name: 'CEO', charId: 'ceo' }, { name: 'S', charId: 'soldier' }] });
    assert.ok(s.players[0].wounds.includes('body'));
});
test('QUEST-01 / Tools: quest activation is an available option', () => {
    const s = fresh(['soldier', 'scout']), p = s.players[0]; p.items.push(inst(s, 'tools'));
    const tool = p.items.find(i => i.item === 'tools');
    execute(s, { op: 'item.use', player: 0, uid: tool.uid, then: { op: 'turn.choose' } });
    assert.ok(s.prompt.options?.some(o => /[Кк]вест|[Аа]ктив/.test(o.label)));
});
test('END-01 / p. 22: no Event Phase occurs after the last active character hibernates', () => {
    const s = fresh(); s.players[1].status = 'dead'; s.time = 8;
    s.eventDeck = ['queenAwakens']; const start = s.logSeq;
    execute(s, { op: 'room.hibernate', player: 0 });
    assert.equal(s.log.filter(l => l.n > start).some(l => l.text.includes('Фаза событий') || l.text.includes('фаза событий')), false);
});
test('END-02 / p. 22: destroying the ship also destroys the Nest for Objective checks', () => {
    const s = fresh(); destroyShip(s, 'audit');
    assert.equal(s.nestDestroyed, true);
});
test('END-03 / p. 23: a larva is checked by final Eclosion, not an automatic death', () => {
    const s = fresh(), p = s.players[0]; s.players[1].status = 'dead';
    p.status = 'escaped'; p.larva = true; p.hand = []; p.discard = [];
    p.deck = Object.keys(CHARACTERS.soldier.cards).map((key, i) => 'soldier.' + key + '#' + i);
    // Fixed seed chosen so the one added Contamination is NOT among the four drawn cards.
    s.rng = seedFromString('final-eclosion-safe-0');
    const reference = structuredClone(s), ref = reference.players[0];
    gainContamination(reference, ref, 1);
    ref.deck = shuffle(reference, [...ref.deck, ...ref.discard.splice(0)]);
    assert.equal(ref.deck.slice(0, 4).some(c => c.startsWith('contam#')), false, 'Fixture must be a surviving reference draw');
    execute(s, { op: 'game.end' });
    assert.equal(p.status, 'escaped');
});
test('END-04 / p. 23: game end waits for the Objective choice instead of looping', () => {
    const s = fresh();
    s.queue = []; s.prompt = null; s.resume = null; s.phase = 'player';
    s.players[0].status = 'escaped';
    s.players[0].objectives = [{ kind: 'personal', id: 'oldestFriend' }, { kind: 'corporate', id: 'priorityOne' }];
    s.players[0].objective = null;
    s.players[1].status = 'dead';
    execute(s, { op: 'turn.end' });
    assert.equal(s.prompt.kind, 'choice', 'the pending Objective choice must survive the automatic end');
    assert.equal(s.result, null);
});

test('OBJ-01 / Pursuit of Science: max Knowledge means eight, not most among players', () => {
    const s = fresh(), p = s.players[0]; p.knowledgeActive = true; p.knowledge = 7; s.players[1].knowledge = 6;
    assert.equal(checkObjective(s, p, OBJECTIVES.personal.pursuit, 'earth'), false);
});
test('OBJ-02 / Ab Ovo: an Egg analyzed by another character satisfies the printed global condition', () => {
    const s = fresh(); s.analyzed.egg = true; s.players[0].analyzed.egg = false;
    assert.equal(checkObjective(s, s.players[0], OBJECTIVES.corporate.abOvo, 'earth'), true);
});
test('OBJ-03 / Best Friends Forever: shares the hibernating friend\'s Venus safety exception', () => {
    const s = fresh();
    for (const p of s.players) p.status = 'hibernating';
    s.players[0].objectives = [{ kind: 'personal', id: 'bff' }]; s.players[0].objective = s.players[0].objectives[0];
    s.players[1].objectives = [{ kind: 'personal', id: 'highestBidder' }]; s.players[1].objective = s.players[1].objectives[0];
    s.secret.coordinates = 'coordA'; s.destination = 'C';
    execute(s, { op: 'game.end' });
    assert.equal(s.players[0].status, 'hibernating');
});

test('MAP-01 / original board: printed Technical Corridor entrances, not guessed rooms', () => {
    const s = fresh();
    assert.deepEqual(Object.values(s.ship.rooms).filter(r => r.tech).map(r => r.id).sort(),
        ['002', '004', '005', '009', '014', '015', '019', '021']);
});
test('MAP-02 / original board: Cockpit to room 002 is corridor number three', () => {
    const s = fresh(); assert.deepEqual(s.ship.rooms['001'].exits.find(e => e.to === '002').nums, [3]);
});
test('PHASE-01 / p. 4: resolve Intruder attacks top-to-bottom, not by room ID', () => {
    const s = fresh(); s.players[0].room = '005'; s.players[1].room = '001';
    const top = intruder(s, 'adult', '005'); intruder(s, 'adult', '001');
    OPS['phase.intruder'](s);
    assert.equal(s.queue.find(step => step.op === 'attack').intruder, top.uid);
});
test('EVENT-02 / Breaking In: fresh Tech noise does not ALSO cause nearby Corridor noise', () => {
    const s = fresh(), p = s.players[0]; p.room = '002'; s.ship.techNoise = false;
    for (const c of Object.values(s.ship.corridors)) c.noise = false;
    OPS['event.effect'](s, { id: 'breakingIn' });
    assert.equal(s.ship.techNoise, true);
    assert.equal(s.ship.rooms[p.room].exits.some(e => s.ship.corridors[e.corridor].noise), false);
});
test('EVENT-03 / Bulkheads Open: no Action cards means Encounter, NOT a Noise roll', () => {
    const s = fresh(), p = s.players[0]; p.hand = []; s.players[1].status = 'dead';
    OPS['event.noise'](s, { id: 'bulkheadsOpen' });
    assert.ok(s.queue.some(step => step.op === 'encounter'), 'Event must schedule an Encounter rather than a Noise roll');
});
test('EVENT-04 / Bulkheads Open: a hand of only Contamination has NO Action cards', () => {
    const s = fresh(); s.players[0].hand = ['contam#1']; s.players[1].status = 'dead';
    OPS['event.noise'](s, { id: 'bulkheadsOpen' });
    assert.ok(s.queue.some(step => step.op === 'encounter'), 'Event must schedule an Encounter rather than a Noise roll');
});
test('EVENT-05 / Egg Protection: one Drone per ROOM with Eggs, not per Egg-carrying player', () => {
    const s = fresh(); s.players[0].room = '006'; s.players[1].room = '006';
    for (const p of s.players) p.heavy = [{ type: 'egg' }];
    OPS['event.effect'](s, { id: 'eggProtection' });
    assert.equal(Object.values(s.intruders).filter(i => i.type === 'drone' && i.room === '006').length, 1);
});
test('EVENT-06 / event targeting: count Action cards, not Contamination, for the printed tie-break', async () => {
    const { moveIntrudersToClosest } = await import('../shared/engine/intruders.mjs');
    const s = fresh(), center = '011';
    const exits = s.ship.rooms[center].exits;
    s.players[0].room = exits[0].to; s.players[1].room = exits[1].to;
    s.players[0].hand = ['contam#1', 'contam#2']; s.players[1].hand = ['scout.rest#0'];
    const it = intruder(s, 'adult', center); moveIntrudersToClosest(s);
    assert.equal(it.room, s.players[0].room);
});
test('FEAT-03 / Conviction: apply a critical result to Queen, not silent removal from board', () => {
    const s = fresh(); const q = intruder(s, 'queen'), before = s.queenDeck.length;
    execute(s, { op: 'feat.conviction', player: 0, then: { op: 'turn.choose' } }); choose(s, q.uid);
    assert.ok(s.queenDeck.length < before, 'No Queen Health procedure took place');
});
test('ITEM-10 / Grenade Launcher: the printed effect is critical to every Intruder, not one Hit', () => {
    const s = fresh(), p = s.players[0], it = intruder(s); const w = inst(s, 'grenadeLauncher'); p.items = [w];
    execute(s, { op: 'shoot.grenade', player: 0, answer: p.room, weapon: w.uid });
    assert.equal(s.intruders[it.uid], undefined);
});
test('ITEM-11 / Perimeter Security Device: prevention costs one Action card, not a charge', () => {
    const s = fresh(), p = s.players[0], dev = inst(s, 'perimeterDevice', { ammo: 2 }); p.items = [dev];
    execute(s, { op: 'perimeter.ask', player: 0, uid: dev.uid, then: { op: 'noise.roll', player: 0 } });
    choose(s, 'yes');
    assert.ok(p.hand.length === 2 || s.prompt.kind === 'cards');
});
test('INV-06 / p. 14: a transfer requires the receiving character\'s agreement', () => {
    const s = fresh(), p = s.players[0], t = s.players[1]; t.room = p.room; p.heavy = [{ type: 'egg' }];
    execute(s, { op: 'trade.done', player: 0, answer: '1:heavy:0', then: { op: 'turn.choose' } });
    assert.ok(p.heavy.some(h => h.type === 'egg') || s.prompt.player === t.id, 'Object transferred without asking the recipient');
});
test('OK-10 / Energy Charge scan: three ammo, not a supposed two-ammo erratum', () => {
    const s = fresh(), p = s.players[0], w = inst(s, 'assaultRifle', { ammo: 0 }); p.items = [w];
    execute(s, { op: 'item.energy', player: 0, answer: 'w:' + w.uid, then: { op: 'turn.choose' } });
    assert.equal(w.ammo, 3);
});

test('INV-07 / public seed: a client cannot reconstruct secret rooms, engines and coordinates', () => {
    const config = { seed: 'seed-audit-replay', mode: 'original',
        players: [{ name: 'A', charId: 'soldier' }, { name: 'B', charId: 'scout' }] };
    const s = createGame(config), v = viewFor(s, 0);
    if (v.seedStr === undefined) return;
    const replay = createGame({ ...config, seed: v.seedStr });
    assert.notDeepEqual(replay.secret, s.secret, 'Public setup parameters recreate all secret setup information');
});

test('OK-11 / p. 5: Careful Movement excludes a destination whose corridors all have Noise', () => {
    const s = fresh(), p = s.players[0]; s.ship.techNoise = true;
    for (const c of Object.values(s.ship.corridors)) c.noise = true;
    OPS['move.start'](s, { player: p.id, careful: true, then: { op: 'turn.choose' } });
    assert.equal(s.prompt?.kind === 'room', false);
});
test('NOISE-01 / pp. 7, 19: eligible Intruder breaks a Door on Danger; do not ALSO place Noise everywhere', () => {
    const s = fresh(), p = s.players[0], e = s.ship.rooms[p.room].exits[0];
    intruder(s, 'adult', e.to); s.ship.corridors[e.corridor].door = 'closed';
    s.pendingRoll = { die: 'noise', value: 'danger' };
    OPS['noise.roll'](s, { op: 'noise.roll', player: p.id, room: p.room });
    assert.equal(s.ship.corridors[e.corridor].door, 'destroyed');
    assert.equal(s.ship.rooms[p.room].exits.some(e => s.ship.corridors[e.corridor].noise), false);
});

test('OK-12 / four Field Data cards already charge the printed extra discard centrally', () => {
    for (const key of ['evasiveManeuvering', 'hunkerDown', 'quickHands', 'reposition']) {
        const s = fresh(), p = s.players[0], id = 'field.' + key + '#0';
        reveal(s, '006', 'comms'); p.room = '006'; intruder(s, 'adult', '011');
        p.hand = [id, 'soldier.search#10'];
        play(s, id);
        assert.equal(s.prompt.kind, 'cards', key);
        assert.equal(s.prompt.min, 1, key); assert.equal(s.prompt.max, 1, key);
    }
});
test('FD-01 / Safety in Numbers: requires ANOTHER character in the room', () => {
    const s = fresh(), p = s.players[0], card = 'field.safetyInNumbers#0';
    p.hand = [card, 'soldier.rest#10', 'soldier.search#10', 'soldier.demolition#10'];
    assert.equal(buildMenu(s, p).cards.find(c => c.id === card).enabled, false);
    s.players[1].room = p.room;
    assert.equal(buildMenu(s, p).cards.find(c => c.id === card).enabled, true);
});
test('FD-02 / Rapid Response: Computer is also a basic one-card Action', () => {
    const s = fresh(), p = s.players[0]; reveal(s, '006', 'comms'); p.room = '006';
    execute(s, { op: 'card.fdRapid', player: 0 });
    assert.ok(s.prompt.options.some(o => o.id === 'computer'));
});

// The supplied Coordinates JPEG has eight distinct faces (four columns, two rows).
test('MAP-03 / Coordinates sheet: all eight printed destination permutations are present', () => {
    const signature = c => ['A', 'B', 'C', 'D'].map(k => c[k]).join(',');
    const expected = [
        { A: 'earth', B: 'mars', C: 'venus', D: 'space' },
        { A: 'earth', B: 'space', C: 'mars', D: 'venus' },
        { A: 'space', B: 'earth', C: 'venus', D: 'mars' },
        { A: 'venus', B: 'earth', C: 'space', D: 'mars' },
        { A: 'mars', B: 'venus', C: 'earth', D: 'space' },
        { A: 'space', B: 'mars', C: 'earth', D: 'venus' },
        { A: 'mars', B: 'venus', C: 'space', D: 'earth' },
        { A: 'venus', B: 'space', C: 'mars', D: 'earth' },
    ];
    assert.deepEqual(COORDINATE_CARDS.map(signature).sort(), expected.map(signature).sort());
});

// --- CEO reactions added with the printed 12-card deck ------------------------------------------
test('CEO-01 / Just One More Thing: after Pass draw 1 and take an extra Turn, then pass', () => {
    const s = fresh(['ceo', 'soldier']), p = s.players[0];
    const card = 'ceo.justOneMoreThing#0';
    p.hand = [card, 'ceo.search#10'];
    execute(s, { op: 'turn.do', player: 0, answer: { action: 'pass' } });
    if (s.prompt.kind === 'cards') choose(s, []);   // the ordinary "discard on Pass" window comes first
    assert.equal(s.prompt.kind, 'choice');
    assert.match(s.prompt.title, /Ещё одну вещь/);
    choose(s, 'yes');
    assert.equal(p.hand.length, 2, 'The Pass discarded nothing and the reaction drew 1 card');
    assert.equal(p.hand.includes(card), false, 'The card leaves the game');
    assert.equal(s.prompt.kind, 'turn');
    assert.equal(s.prompt.player, p.id, 'The same character takes the additional Turn');
});
test('CEO-02 / Stop It!: after the Attack card is revealed the reaction cancels the attack', () => {
    const s = fresh(['ceo', 'soldier']), p = s.players[0], it = intruder(s);
    const card = 'ceo.stopIt#0';
    p.hand = [card]; p.health = 10;
    s.attackDeck = ['bite']; s.attackDiscard = [];
    execute(s, { op: 'attack', player: 0, intruder: it.uid, context: 'phase' });
    assert.ok(s.prompt.options.some(o => o.id === 'stopit'));
    choose(s, 'stopit');
    assert.equal(p.status, 'active');
    assert.equal(p.hand.includes(card), false, 'The card is removed from the game');
});

// --- Support deck edge cases fixed after the print audit ----------------------------------------
test('ITEM-12 / Sonic Gun: a special result places a malfunction in your Room, not Noise', () => {
    const s = fresh(), p = s.players[0], it = intruder(s);
    p.items = [inst(s, 'sonicGun')];
    s.pendingRoll = { die: 'combat', value: 2 };
    execute(s, { op: 'shoot.fire', player: 0, weapon: p.items[0].uid, target: it.uid, then: { op: 'turn.choose' } });
    assert.equal(s.roomState[p.room].malfunction, true);
});
test('ITEM-13 / Tactical Hatchet: 2 Hits without a combat roll, then an orange malfunction', () => {
    const s = fresh(), p = s.players[0], it = intruder(s);
    p.items = [inst(s, 'tacticalHatchet')];
    execute(s, { op: 'melee.hit', player: 0, target: it.uid, then: { op: 'turn.choose' } });
    assert.equal(it.hits, 2, 'the printed effect is exactly 2 Hits, not a rolled result');
    assert.equal(p.items[0].charge, 1, 'an orange malfunction marker is placed on the weapon');
});
test('START-06 / Smart Gun: the reroll is the player\'s decision and the second result is final', () => {
    const s = fresh(['hacker', 'soldier']), p = s.players[0], it = intruder(s);
    p.items = [inst(s, 'smartGun')];
    s.pendingRoll = { die: 'combat', value: 3 };
    execute(s, { op: 'shoot.fire', player: 0, weapon: p.items[0].uid, target: it.uid, then: { op: 'turn.choose' } });
    assert.equal(s.prompt.kind, 'choice', 'the player chooses whether to reroll');
    assert.match(s.prompt.title, /Перебросить/);
    choose(s, 'keep');
    assert.equal(it.hits, 1, 'keeping the first roll resolves the shot with it');
});
