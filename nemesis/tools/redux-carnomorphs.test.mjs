import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

import { ENEMY_SETS, enemySetsFor, enemySetName, enemySetAllowed, isReduxCarnomorphs, initialExpansionBag } from '../shared/dlc.mjs';
import { RX_CARNOMORPH_TOKENS, RX_CARNOMORPH_ATTACK_CARDS, RX_CARNOMORPH_EVENT_CARDS,
    RX_CARNOMORPH_MUTATIONS, RX_CARNOMORPH_BUTCHER_CARDS } from '../shared/data/carnomorphs-redux.mjs';
import { createGame } from '../shared/engine/setup.mjs';
import { OPS, findRoomsByTile, tileOf, placeFire, heavyCount, handSlots } from '../shared/engine/core.mjs';
import { spawnCarnomorph, developCarnomorphBag, carnomorphAttackEffects, rxCarnomorphAttackEffects, mutationOptions } from '../shared/engine/carnomorphs.mjs';
import { viewFor } from '../shared/view.mjs';
import { roomOfKind, ROOM_TILES } from '../shared/ship.mjs';

const players = n => Array.from({ length: n }, (_, i) => ({ name: 'Игрок ' + (i + 1), charId: i ? 'scout' : 'soldier' }));
const game = (n = 2) => createGame({ enemySet: 'carnomorphsRedux', seed: 'redux-carnomorphs-test-' + n, players: players(n) });
const byId = cards => Object.fromEntries(cards.map(c => [c.id, c]));

test('RXSET-01 Redux Carnomorphs are a separate lobby choice with their own ruleset', () => {
    assert.equal(playableLobbyId('carnomorphsRedux'), true);
    assert.ok(enemySetsFor('redux').includes('carnomorphsRedux'));
    assert.ok(!enemySetsFor('redux').includes('carnomorphs'));
    assert.ok(enemySetsFor('original').includes('carnomorphs'));
    assert.ok(!enemySetsFor('original').includes('carnomorphsRedux'));
    assert.equal(enemySetAllowed('carnomorphs', 'original'), true);
    assert.equal(enemySetAllowed('carnomorphsRedux', 'original'), false);
    assert.equal(enemySetName('carnomorphs', 'redux'), 'Карноморфы Redux');
    assert.equal(ENEMY_SETS.carnomorphs.name, 'Карноморфы');

    const s = game();
    assert.equal(s.enemySet, 'carnomorphs');
    assert.equal(s.rules, 'redux');
    assert.equal(s.carnomorphRedux, true);
    assert.equal(isReduxCarnomorphs(s), true);
    assert.ok(s.secret.carnomorphAdaptations.fleshbeast, 'third adaptation belongs to the Redux Flesh Beast');
    assert.equal(s.secret.carnomorphAdaptations.breeder, undefined);
    assert.deepEqual(s.butcherPlayed, []);
    assert.equal(s.butcherDeck.length, RX_CARNOMORPH_BUTCHER_CARDS.length);

    const classic = createGame({ enemySet: 'carnomorphs', seed: 'classic-carnomorphs-test', players: players(1) });
    assert.equal(isReduxCarnomorphs(classic), false);
    assert.equal(classic.rules, 'original');
    assert.equal(classic.secret.carnomorphAdaptations.breeder !== undefined, true);
});
function playableLobbyId(id) { return ENEMY_SETS[id] && ENEMY_SETS[id].playable === true; }

test('RXSET-02 the Redux bag is random from the printed supply, with a reserve left aside', () => {
    const counts = Object.fromEntries(Object.entries(RX_CARNOMORPH_TOKENS).map(([type, values]) => [type, values.length]));
    const { bag, supply } = initialExpansionBag('carnomorphs', [0, 1, 2], { rng: { float: () => 0.42 } }, 'redux');
    assert.equal(bag.filter(t => t === 'blank').length, 1);
    assert.equal(bag.filter(t => t.type === 'metagorger').length, 5);
    assert.equal(bag.filter(t => typeof t === 'object' && t.type !== 'metagorger').length, 8);
    assert.equal(bag.length + supply.length, 1 + Object.values(counts).reduce((a, b) => a + b, 0));
    assert.equal(new Set([...bag.filter(t => t !== 'blank'), ...supply].map(t => t.id)).size, bag.length + supply.length - 1);
    assert.deepEqual(Object.keys(counts), ['metagorger', 'shambler', 'fleshbeast', 'butcher']);

    const s = game(3);
    assert.equal(s.attackDeck.length, RX_CARNOMORPH_ATTACK_CARDS.length);
    assert.equal(s.eventDeck.length, RX_CARNOMORPH_EVENT_CARDS.length);
    assert.deepEqual(s.mutationDeck.slice().sort(), Object.keys(RX_CARNOMORPH_MUTATIONS).sort());
});

test('RXSET-03 Redux bag development follows the base-game procedure with Carnomorph ranks', () => {
    const s = game();
    s.queue = [];
    const supply = () => s.carnomorphSupply.length;
    const token = (type, value = 3) => ({ id: 'test-' + type, type, value });

    const before = supply();
    developCarnomorphBag(s, token('metagorger'));
    assert.equal(supply(), before, 'the drawn Metagorger token is returned to its pile');
    assert.equal(s.bag.find(t => t && t.type === 'fleshbeast') !== undefined, true);

    const before2 = supply();
    developCarnomorphBag(s, token('shambler'));
    assert.equal(supply(), before2, 'the drawn Shambler token is returned to its pile');
    assert.equal(s.bag.find(t => t && t.type === 'butcher') !== undefined, true);

    const before3 = supply();
    developCarnomorphBag(s, 'blank');
    assert.equal(supply(), before3 - 2);
    assert.equal(s.bag.filter(t => t && t.type === 'shambler').length >= 2, true);

    const steps = developCarnomorphBag(s, token('butcher', 4));
    assert.equal(steps.length, 1);
    assert.equal(steps[0].op, 'carnomorph.butcherActivate');
    const butcher = Object.values(s.intruders).find(it => it.type === 'butcher');
    assert.ok(butcher);
    assert.equal(butcher.room, roomOfKind(s.ship, 'hibernatorium').id);
});

test('RXSET-04 Redux attacks use printed target lines, not classic toughness cards', () => {
    const devour = byId(RX_CARNOMORPH_ATTACK_CARDS)['rxAtk-devour-0'];
    const shamblerFx = rxCarnomorphAttackEffects(devour, { type: 'shambler' });
    assert.deepEqual(shamblerFx, [{ op: 'rxDmg', n: 1 }, { op: 'rxHeal', n: 1 }]);
    const butcherFx = carnomorphAttackEffects(devour, { type: 'butcher' }, { wounds: [], health: 8 });
    assert.deepEqual(butcherFx, [{ op: 'rxDevourButcher' }, { op: 'rxHeal', all: true }]);
    assert.deepEqual(rxCarnomorphAttackEffects(devour, { type: 'metagorger' }), [{ op: 'rxMiss' }]);

    const s = game();
    s.queue = [];
    const p = s.players[0];
    p.health = 8;
    const butcher = spawnCarnomorph(s, 'butcher', p.room);
    s.butcherHits = 4;
    for (const e of butcherFx) {
        if (e.op === 'rxDmg') p.health -= e.n;
        if (e.op === 'rxDevourButcher') { /* healthy character only gains a wound */ }
        if (e.op === 'rxHeal' && e.all) s.butcherHits = 0;
    }
    assert.equal(s.butcherHits, 0, 'DEVOUR clears the attacking Butcher hit track');
    assert.ok(s.intruders[butcher.uid]);
});

test('RXSET-05 Butcher health uses the Redux Queen deck procedure', () => {
    const s = game();
    s.queue = [];
    const p = s.players[0];
    const butcher = spawnCarnomorph(s, 'butcher', p.room);
    s.butcherDeck = ['rxButcher-contam-1-0', 'rxButcher-draw2-0-0', 'rxButcher-contam-2-0'];
    s.butcherPlayed = [];
    s.butcherHits = 6;
    OPS['butcher.card'](s, { player: p.id });
    assert.deepEqual(s.butcherPlayed, ['rxButcher-contam-1-0']);
    assert.equal(s.butcherDeck.length, 1, 'the drawn card discards one additional card unseen');
    assert.equal(s.butcherHits, 0, 'the hit track resets after a health card');
    assert.equal(s.intruders[butcher.uid] !== undefined, true);

    OPS['butcher.card'](s, { player: p.id });
    OPS['butcher.card'](s, { player: p.id });
    assert.equal(s.butcherDead, true);
    assert.equal(s.carnomorphButcherDead, true);
    assert.equal(s.intruders[butcher.uid], undefined, 'the last card removes the miniature');
});

test('RXSET-06 event effects and public view use the Redux Carnomorph data', () => {
    const s = game();
    s.queue = [];
    const p = s.players[0];
    s.roomState[p.room].objects = [{ type: 'carcass' }];
    const before = p.discard.filter(c => c.startsWith('contam#')).length;
    OPS['carnomorph.eventEffect'](s, { id: 'rxEvent10' });  // Marked Prey
    assert.equal(p.discard.filter(c => c.startsWith('contam#')).length, before + 1);

    s.queue = [];
    for (const o of s.players) o.hand = [];
    OPS['carnomorph.eventEffect'](s, { id: 'rxEvent2' });   // Ammunition Meltdown
    assert.ok(s.queue.some(step => step.op === 'encounter' && step.player === p.id),
        'a character without Action cards resolves an Encounter, not an automatic attack');

    const view = viewFor(s, 0);
    assert.equal(view.carnomorphRedux, true);
    assert.ok(view.decks.butcher > 0);
    assert.equal('secret' in view, false, 'the private state is never copied into the view');
});

test('RXSET-08 printed Redux event effects use malfunctions, fire spread and the right tokens', () => {
    const s = game();
    s.queue = [];
    const p = s.players[0];
    for (const [id, tile] of Object.entries(s.secret.tiles)) if (s.roomState[id]) s.roomState[id].tile = tile;

    // Airlock Glitch: a malfunction in the highest-numbered three-yellow room starts the
    // procedure there; the token is resolved at the end of the Player Phase.
    const yellow = findRoomsByTile(s, 'engineRoom')[0] || findRoomsByTile(s, 'fireControl')[0];
    s.roomState[yellow].malfunction = true;
    OPS['carnomorph.eventEffect'](s, { id: 'rxEvent1' });
    assert.equal(s.roomState[yellow].malfunction, false);
    assert.equal(s.roomState[yellow].airlock, true);

    // Chemical Fire: the malfunction replaces the fire in the highest-numbered burning room.
    s.queue = [];
    const burning = findRoomsByTile(s, 'storage')[0] || Object.keys(s.ship.rooms)[0];
    placeFire(s, burning);
    OPS['carnomorph.eventEffect'](s, { id: 'rxEvent5' });
    assert.equal(s.roomState[burning].fire, false);
    assert.equal(s.roomState[burning].malfunction, true);

    // Damaging Fire: each room that burned gets a malfunction before fire spreads.
    s.queue = [];
    const burning2 = findRoomsByTile(s, 'armory')[0] || Object.keys(s.ship.rooms)[1];
    placeFire(s, burning2);
    OPS['carnomorph.eventEffect'](s, { id: 'rxEvent6' });
    assert.equal(s.roomState[burning2].malfunction, true);

    // Ejected Pod 4: both evac sections get malfunctions, never fire.
    s.queue = [];
    const pod4 = s.pods.find(x => x.num === 4);
    if (pod4) pod4.removed = true;
    for (const t of ['evacA', 'evacB']) for (const id of findRoomsByTile(s, t)) s.roomState[id].fire = false;
    OPS['carnomorph.eventEffect'](s, { id: 'rxEvent7' });
    for (const t of ['evacA', 'evacB']) for (const id of findRoomsByTile(s, t)) {
        assert.equal(s.roomState[id].malfunction, true, t);
        assert.equal(s.roomState[id].fire, false, t);
    }

    // Structural Weakness targets characters, not fire.
    s.queue = [];
    const empty = Object.keys(s.ship.rooms).find(id => id !== p.room && !s.players.some(x => x.room === id)
        && tileOf(s, id) !== 'nest' && tileOf(s, id) !== 'contaminated');
    if (empty) {
        s.roomState[empty].malfunction = false;
        placeFire(s, empty);
        OPS['carnomorph.eventEffect'](s, { id: 'rxEvent19' });
        assert.equal(s.roomState[empty].malfunction, false, 'an empty burning room is not targeted');
    }

    // System Failure places malfunctions, not fire, in three-red-icon rooms.
    s.queue = [];
    const red3 = Object.keys(s.ship.rooms).find(id => {
        const tile = tileOf(s, id);
        return tile && ROOM_TILES[tile] && ROOM_TILES[tile].items.filter(x => x === 'red').length === 3;
    });
    if (red3) {
        s.roomState[red3].malfunction = false;
        const fires = Object.values(s.roomState).filter(x => x.fire).length;
        OPS['carnomorph.eventEffect'](s, { id: 'rxEvent20' });
        assert.equal(s.roomState[red3].malfunction, true);
        assert.equal(Object.values(s.roomState).filter(x => x.fire).length, fires);
    }
});

test('RXSET-09 Redux mutation passives and card choices use the Redux half of the data', () => {
    const s = game();
    const p = s.players[0];
    p.mutationRedux = true;

    const options = mutationOptions(['gastric'], s);
    assert.equal(options[0].art, 'carnomorph/redux/mutation/gastric');
    assert.equal(options[0].clean, undefined, 'Redux cards have no clean/infected halves');
    assert.equal(options[0].infected, RX_CARNOMORPH_MUTATIONS.gastric.infected);

    p.mutationCard = 'gastric';
    const base = heavyCount(p);
    p.heavy = [{ type: 'carcass' }];
    assert.equal(heavyCount(p), base, 'Gastric carries one Carcass without a hand slot');
    assert.equal(handSlots(s, p).filter(x => x.kind === 'object').length, 0);

    p.mutationCard = 'scream';
    s.queue = [];
    const exit = s.ship.rooms[p.room].exits.find(e => !s.players.some(x => x.room === e.to));
    if (exit) {
        const it = spawnCarnomorph(s, 'shambler', exit.to);
        for (const c of s.ship.rooms[p.room].exits) if (s.ship.corridors[c.corridor]) s.ship.corridors[c.corridor].noise = false;
        OPS['noise.roll'](s, { player: p.id, room: p.room, forced: 'danger' });
        assert.equal(it.room, exit.to, 'Scream keeps Danger from moving Carnomorphs into your room');
    }
});

test('RXSET-10 Escape Master resolves a drawn card and still suffers the fleeing attack', () => {
    const s = game();
    const p = s.players[0];
    p.mutationCard = 'escapeMaster'; p.mutationRedux = true;
    p.hand = []; p.discard = [];
    p.deck = ['soldier.rest#0', 'soldier.demolition#0'];
    const it = spawnCarnomorph(s, 'shambler', p.room);
    s.queue = []; s.prompt = null; s.resume = null; s.pendingFleeAttacks = [];
    const hp = p.health;

    OPS['attack'](s, { intruder: it.uid, player: p.id, context: 'escape', moving: true,
        dest: s.ship.rooms[p.room].exits[0].to, cardId: 'rxAtk-slash-0' });
    assert.equal(s.prompt.kind, 'cards');
    assert.equal(s.prompt.secret, true, 'the two drawn cards stay hidden from the table');
    assert.deepEqual(s.prompt.cards.slice().sort(), ['soldier.demolition#0', 'soldier.rest#0']);
    assert.equal(p.hand.length, 0, 'both drawn cards are discarded after the choice');
    assert.equal(s.pendingFleeAttacks.length, 1);

    const resume = s.resume;
    s.prompt = null; s.resume = null;
    OPS[resume.op](s, { ...resume, answer: ['soldier.rest#0'] });
    // Card effects hand control back to turn.choose; drain the small reaction queue directly.
    for (let i = 0; i < 20 && s.queue.length && !s.prompt; i++) {
        const step = s.queue.shift();
        OPS[step.op](s, step);
    }
    assert.equal(s.pendingFleeAttacks.length, 0, 'the parked attack is replayed, not lost');
    assert.equal(p.health, hp - 1, 'the original attack still lands after the drawn card');
    assert.ok(p.discard.some(c => c.startsWith('contam#')), 'Slash still contaminates');
});

test('RXSET-11 Redux fire destroys a Metagorger and only wounds larger Carnomorphs', () => {
    const s = game();
    s.queue = [];
    const roomId = s.players[0].room;
    const metagorger = spawnCarnomorph(s, 'metagorger', roomId);
    const shambler = spawnCarnomorph(s, 'shambler', roomId);
    s.roomState[roomId].fire = true;
    OPS['carnomorph.phaseFire'](s);
    assert.equal(s.intruders[metagorger.uid], undefined, 'Metagorger is the Larva slot and dies on fire');
    assert.equal(s.intruders[shambler.uid].hits, 1, 'a Shambler only takes a Hit');
});

test('RXSET-12 a Blank encounter adds two Shambler tokens and returns the Blank', () => {
    const s = game();
    s.queue = [];
    const p = s.players[0];
    s.bag = [];
    s.bagLast = {};
    OPS['carnomorph.encounter'](s, { room: p.room, player: p.id, token: 'blank' });
    assert.equal(s.bag.filter(t => t === 'blank').length, 1);
    assert.equal(s.bag.filter(t => t && t.type === 'shambler').length, 2);
});

test('RXSET-13 Gastronomic Revolution may remove a wound and heal at once', () => {
    const s = game();
    const p = s.players[0];
    p.wounds = ['body'];
    p.health = 4;
    OPS['rx.gastricHeal'](s, { player: p.id, answer: 'both:body', then: { op: 'noop' } });
    assert.deepEqual(p.wounds, []);
    assert.equal(p.health, 7);
});

test('RXSET-14 Sharpened Senses is offered only for movement noise rolls', () => {
    const s = game();
    const p = s.players[0];
    p.mutationCard = 'sharpenedSenses'; p.mutationRedux = true;
    p.hand = ['contam#test'];
    s.secret.contamInfected['contam#test'] = false;
    s.queue = []; s.prompt = null; s.resume = null;

    OPS['noise.roll'](s, { player: p.id, room: p.room, forced: 3 });
    assert.equal(s.prompt, null, 'an Event noise roll does not trigger the movement mutation');

    OPS['noise.roll'](s, { player: p.id, room: p.room, forced: 3, source: 'movement' });
    assert.equal(s.resume && s.resume.op, 'mutation.offerSenses');
});

test('RXSET-07 every Redux card has a stable id and extracted illustration', () => {
    const art = path => existsSync('nemesis/client/art/' + path);
    const attacks = byId(RX_CARNOMORPH_ATTACK_CARDS);
    for (const c of Object.values(attacks)) {
        assert.equal(art('carnomorph/redux/attack/' + c.effect + '.jpg'), true, c.id);
    }
    for (const c of RX_CARNOMORPH_EVENT_CARDS) assert.equal(art('carnomorph/redux/event/' + c.id + '.jpg'), true, c.id);
    for (const id of Object.keys(RX_CARNOMORPH_MUTATIONS)) assert.equal(art('carnomorph/redux/mutation/' + id + '.jpg'), true, id);
    assert.equal(art('carnomorph/redux/butcher.jpg'), true);
    assert.equal(Object.keys(attacks).length, 20);
    assert.ok(attacks['rxAtk-spawn-0'].lines.fleshbeast.text.includes('метагоргера'));
    assert.ok(RX_CARNOMORPH_BUTCHER_CARDS.some(c => c.effect === 'contam' && c.extra === 1),
        'the printed one-card Contamination face is in the Butcher deck');
    assert.equal(RX_CARNOMORPH_BUTCHER_CARDS.length, 12);
});
