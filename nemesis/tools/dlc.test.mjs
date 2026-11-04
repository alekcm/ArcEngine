import test from 'node:test';
import assert from 'node:assert/strict';
import { ENEMY_SETS, playableEnemySet, VOIDSEEDER_TOKENS, initialExpansionBag, changeMadness, gainMutation } from '../shared/dlc.mjs';
import { createGame } from '../shared/engine/setup.mjs';
import { seedFromString } from '../shared/rng.mjs';

const rng = () => ({ rng: seedFromString('dlc-tests') });
const count = (xs, value) => xs.filter(x => x === value).length;

test('all DLC are selectable, but unknown pack IDs cannot start a game', () => {
    for (const id of ['redux', 'carnomorphs', 'voidseeders', 'chytrids']) assert.equal(playableEnemySet(id), true);
    for (const id of ['__proto__', 'unknown']) {
        assert.equal(playableEnemySet(id), false);
        assert.throws(() => createGame({ enemySet: id, players: [] }), /not playable/);
    }
    assert.equal(ENEMY_SETS.redux.playable, true);
});

test('carnomorph initial bag and supply obey player count and token limits', () => {
    for (let n = 1; n <= 5; n++) {
        const { bag, supply } = initialExpansionBag('carnomorphs', Array.from({ length: n }, (_, i) => i), rng());
        assert.equal(count(bag, 'blank'), 1);
        assert.equal(bag.filter(t => t.type === 'blueMetagorger').length, 2);
        assert.equal(bag.filter(t => t.type === 'redMetagorger').length, n + 2);
        const all = [...bag, ...supply].filter(t => t !== 'blank');
        const values = type => all.filter(t => t.type === type).map(t => t.value).sort();
        assert.deepEqual(values('redMetagorger'), [2, 2, 2, 2, 3, 3, 3, 3]);
        assert.deepEqual(values('blueMetagorger'), [1, 1]);
        assert.deepEqual(values('shambler'), [2, 2, 2, 2, 3, 3, 3, 3, 3, 4, 4, 4]);
        assert.deepEqual(values('breeder'), [3, 4, 4]);
        assert.deepEqual(values('butcher'), [4]);
        assert.equal(new Set(all.map(t => t.id)).size, all.length);
    }
});

test('voidseeder bag uses the supplied 17 tokens plus the blank and player madness tokens', () => {
    assert.deepEqual([1, 2, 3, 4].map(v => count(VOIDSEEDER_TOKENS, v)), [3, 5, 6, 3]);
    for (let n = 1; n <= 5; n++) {
        const players = Array.from({ length: n }, (_, i) => i);
        const { bag, supply } = initialExpansionBag('voidseeders', players, rng());
        assert.equal(count(bag, 'blank'), 1);
        assert.equal(bag.filter(t => t && t.id).length, n + 2);
        assert.deepEqual(bag.filter(t => t && t.madness !== undefined).map(t => t.madness), players);
        const tokens = [...bag.filter(t => t && t.id), ...supply];
        assert.equal(tokens.length, 17);
        assert.equal(new Set(tokens.map(t => t.id)).size, 17);
        assert.deepEqual([1, 2, 3, 4].map(v => tokens.filter(t => t.value === v).length), [3, 5, 6, 3]);
        assert.deepEqual(initialExpansionBag('voidseeders', players, rng()), { bag, supply });
    }
    assert.throws(() => initialExpansionBag('voidseeders', [1, 1], rng()), RangeError);
});

test('madness cannot decrease below 3 once reached; increasing beyond 5 kills', () => {
    assert.deepEqual(changeMadness(2, -1), { level: 1, dead: false });
    assert.deepEqual(changeMadness(3, -1), { level: 3, dead: false });
    assert.deepEqual(changeMadness(5, -20), { level: 3, dead: false });
    assert.deepEqual(changeMadness(4, 1), { level: 5, dead: false });
    assert.deepEqual(changeMadness(5, 1), { level: 5, dead: true });
    assert.throws(() => changeMadness(0, 1), RangeError);
});

test('first mutation grants a card; later markers persist if the card was removed', () => {
    assert.deepEqual(gainMutation(false, 0), { hasCard: true, markers: 0, gainedCard: true, dead: false });
    assert.deepEqual(gainMutation(false, 2), { hasCard: true, markers: 2, gainedCard: true, dead: false });
    assert.deepEqual(gainMutation(true, 2), { hasCard: true, markers: 3, gainedCard: false, dead: false });
    assert.deepEqual(gainMutation(true, 3), { hasCard: true, markers: 4, gainedCard: false, dead: true });
});

import { initCarnomorphs, addCarnomorphToken, spawnCarnomorph, killCarnomorph, feedCarnomorphs } from '../shared/engine/carnomorphs.mjs';

function carnoState() {
    const state = createGame({ seed: 'carnomorph-mechanics', players: [{ name: 'Test', charId: 'soldier' }] });
    state.queue = []; state.prompt = null; state.resume = null;
    state.players[0].room = '011'; state.players[0].status = 'active';
    state.intruders = {};
    for (const rs of Object.values(state.roomState)) rs.objects = [];
    initCarnomorphs(state);
    return state;
}

test('carnomorph token supply uses red before blue and cannot manufacture tokens', () => {
    const s = carnoState();
    assert.equal(s.nestEggs, 8);
    const initial = s.bag.length + s.carnomorphSupply.length;
    while (s.carnomorphSupply.some(t => t.type === 'redMetagorger')) assert.equal(addCarnomorphToken(s, 'metagorger').type, 'redMetagorger');
    assert.equal(addCarnomorphToken(s, 'metagorger'), null);
    const blue = s.bag.splice(s.bag.findIndex(t => t.type === 'blueMetagorger'), 1)[0];
    s.carnomorphSupply.push(blue);
    assert.equal(addCarnomorphToken(s, 'metagorger'), blue);
    assert.equal(s.bag.length + s.carnomorphSupply.length, initial);
});

test('feeding heals and evolves with priority; the eaten miniature cannot feed again', () => {
    const s = carnoState(), at = '002';
    const shambler = spawnCarnomorph(s, 'shambler', at);
    const metagorger = spawnCarnomorph(s, 'metagorger', at);
    shambler.hits = 3;
    s.roomState[at].objects = [{ type: 'carcass' }, { type: 'charCorpse', who: 1 }, { type: 'egg' }];
    feedCarnomorphs(s);
    assert.equal(shambler.type, 'breeder');
    assert.equal(shambler.hits, 0);
    assert.equal(metagorger.type, 'shambler');
    assert.deepEqual(s.roomState[at].objects, [{ type: 'carcass' }]);
    assert.deepEqual(s.carnomorphRevealed, ['shambler', 'breeder']);

    const s2 = carnoState(), one = spawnCarnomorph(s2, 'metagorger', at), two = spawnCarnomorph(s2, 'metagorger', at);
    feedCarnomorphs(s2);
    assert.equal(one.type, 'shambler');
    assert.equal(s2.intruders[two.uid], undefined);
    assert.equal(Object.keys(s2.intruders).length, 1);
});

test('feeding does not occur in combat and consumes nest eggs one at a time', () => {
    const s = carnoState();
    s.roomState['002'].tile = 'nest'; s.roomState['002'].explored = true;
    const breeder = spawnCarnomorph(s, 'breeder', '002');
    const gorger = spawnCarnomorph(s, 'metagorger', '002');
    s.players[0].room = '002';
    feedCarnomorphs(s);
    assert.equal(s.nestEggs, 8); assert.equal(breeder.type, 'breeder');
    s.players[0].room = '011';
    s.nestEggs = 2;
    feedCarnomorphs(s);
    assert.equal(s.nestEggs, 0); assert.equal(s.nestDestroyed, true);
    assert.equal(breeder.type, 'butcher'); assert.equal(gorger.type, 'shambler');
});

test('feeding heals even if next miniature is unavailable or the butcher is dead', () => {
    const s = carnoState(), at = '002';
    const feeder = spawnCarnomorph(s, 'shambler', at); feeder.hits = 2;
    for (let i = 0; i < 3; i++) spawnCarnomorph(s, 'breeder', '003');
    s.roomState[at].objects.push({ type: 'carcass' });
    feedCarnomorphs(s);
    assert.equal(feeder.type, 'shambler'); assert.equal(feeder.hits, 0);
    assert.equal(s.roomState[at].objects.length, 0);
    const breeder = Object.values(s.intruders).find(it => it.type === 'breeder');
    s.carnomorphButcherDead = true; breeder.hits = 3;
    s.roomState['003'].objects.push({ type: 'corpse' });
    feedCarnomorphs(s);
    assert.equal(breeder.type, 'breeder'); assert.equal(breeder.hits, 0);
    assert.equal(spawnCarnomorph(s, 'butcher', '003'), null);
});

test('lethal carnomorph effects place carcasses and shamblers without drawing bag tokens', () => {
    for (const [type, bodies, shamblers] of [['metagorger', 1, 0], ['shambler', 1, 0], ['breeder', 1, 1], ['butcher', 0, 2]]) {
        const s = carnoState(), at = '002', it = spawnCarnomorph(s, type, at);
        const bag = JSON.stringify(s.bag);
        killCarnomorph(s, it);
        assert.equal(s.roomState[at].objects.filter(o => o.type === 'carcass').length, bodies, type);
        assert.equal(Object.values(s.intruders).filter(i => i.type === 'shambler').length, shamblers, type);
        assert.equal(JSON.stringify(s.bag), bag, type);
        if (type === 'butcher') assert.equal(spawnCarnomorph(s, 'butcher', at), null);
    }
});

import { CARNOMORPH_ATTACK_CARDS } from '../shared/data/carnomorphs.mjs';
import { initCarnomorphAttackDeck, carnPowerCheck } from '../shared/engine/carnomorphs.mjs';

test('twenty Carnomorph attack cards retain each printed toughness pair and rank', () => {
    assert.equal(CARNOMORPH_ATTACK_CARDS.length, 20);
    assert.equal(new Set(CARNOMORPH_ATTACK_CARDS.map(c => c.id)).size, 20);
    assert.deepEqual(CARNOMORPH_ATTACK_CARDS.map(c => c.effect), [
        'vomit', 'vomit', 'powerful', 'powerful', 'devour',
        'devour', 'multiply', 'multiply', 'bite', 'bite',
        'bite', 'bite', 'lash', 'lash', 'lash', 'lash', 'lash', 'scratch', 'scratch', 'scratch',
    ]);
    assert.deepEqual(CARNOMORPH_ATTACK_CARDS[2].targets, ['breeder', 'butcher']);
    assert.deepEqual(CARNOMORPH_ATTACK_CARDS[6].targets, ['shambler', 'breeder']);
    assert.deepEqual(CARNOMORPH_ATTACK_CARDS[4].targets, ['butcher']);
});

test('damage checks draw exactly one attack card and use the correct toughness column', () => {
    const s = carnoState(), a = spawnCarnomorph(s, 'metagorger', '002'), b = spawnCarnomorph(s, 'shambler', '003');
    initCarnomorphAttackDeck(s);
    s.attackDeck = ['carnoAttack1', 'carnoAttack1']; s.attackDiscard = [];
    assert.equal(carnPowerCheck(s, a, 2).result, 'survived'); // Metagorger threshold 3
    assert.equal(carnPowerCheck(s, b, 2).result, 'survived'); // other threshold 4
    assert.equal(s.attackDeck.length, 0); assert.equal(s.attackDiscard.length, 2);
    s.attackDeck = ['carnoAttack1'];
    assert.equal(carnPowerCheck(s, a, 1).result, 'killed');
    assert.equal(s.intruders[a.uid], undefined);
    assert.equal(s.intruders[b.uid], b);
});

test('attack card arrow retreats even with enough damage, and discards the card', () => {
    const s = carnoState(), it = spawnCarnomorph(s, 'shambler', '002');
    s.adaptations = []; s.attackDeck = ['carnoAttack3']; s.attackDiscard = [];
    it.hits = 20;
    const from = it.room;
    assert.equal(carnPowerCheck(s, it, 1).result, 'retreat');
    assert.ok(s.intruders[it.uid]);
    assert.notEqual(it.room, from);
    assert.deepEqual(s.attackDiscard, ['carnoAttack3']);
});

test('Carnomorph attack effects respect rank icons and omit slime', () => {
    const s = carnoState(), p = s.players[0];
    const it = spawnCarnomorph(s, 'shambler', p.room);
    const before = p.health;
    s.enemySet = 'carnomorphs'; p.hand = []; s.carnomorphAdaptations.shambler = null;
    OPS.attack(s, { intruder: it.uid, player: p.id, cardId: 'carnoAttack3', noReaction: true });
    assert.equal(p.health, before);
    OPS.attack(s, { intruder: it.uid, player: p.id, cardId: 'carnoAttack18', noReaction: true });
    assert.equal(p.health, before - 1);
    assert.equal(p.discard.filter(x => x.startsWith('contam#')).length, 1);
    OPS.attack(s, { intruder: it.uid, player: p.id, cardId: 'carnoAttack1', noReaction: true });
    assert.ok(s.roomState[p.room].objects.some(x => x.type === 'carcass'));
    assert.equal(Object.hasOwn(p, 'slime'), false);
    OPS.attack(s, { intruder: it.uid, player: p.id, cardId: 'carnoAttack7', noReaction: true });
    assert.equal(Object.values(s.intruders).filter(i => i.type === 'metagorger').length, 1);
});

test('devour kills a wounded victim, heals the butcher and does not affect other ranks', () => {
    const s = carnoState(), p = s.players[0];
    const butcher = spawnCarnomorph(s, 'butcher', p.room);
    p.wounds = ['body']; butcher.hits = 3;
    s.enemySet = 'carnomorphs'; p.hand = [];
    OPS.attack(s, { intruder: butcher.uid, player: p.id, cardId: 'carnoAttack5', noReaction: true });
    assert.equal(p.status, 'dead'); assert.equal(butcher.hits, 0);
    assert.ok(s.roomState[p.room].objects.some(x => x.type === 'charCorpse'));
});

import { OPS, next, run, answer } from '../shared/engine/core.mjs';
import { analyzeAdaptation } from '../shared/engine/rooms.mjs';
import { viewFor } from '../shared/view.mjs';
import { developCarnomorphBag } from '../shared/engine/carnomorphs.mjs';

test('analysis removes hidden or revealed adaptations without exposing hidden identities', () => {
    const s = carnoState(), p = s.players[0]; s.enemySet = 'carnomorphs';
    s.secret.carnomorphAdaptations = { shambler: 'regeneration', breeder: 'tentacles', butcher: 'acceleration' };
    assert.ok(!JSON.stringify(viewFor(s, null)).includes('regeneration'));
    analyzeAdaptation(s, p, 'charCorpse', null);
    assert.deepEqual(s.carnomorphRemoved, ['shambler']);
    assert.equal(s.adaptationsRemoved, 1);
    assert.ok(!JSON.stringify(viewFor(s, null)).includes('regeneration'));
    spawnCarnomorph(s, 'shambler', '002');
    assert.equal(s.carnomorphAdaptations.shambler, null, 'removed hidden card cannot reappear');
    analyzeAdaptation(s, p, 'charCorpse', null);
    assert.equal(s.adaptationsRemoved, 1, 'same adaptation cannot be counted twice');
    spawnCarnomorph(s, 'breeder', '003');
    assert.equal(s.carnomorphAdaptations.breeder, 'tentacles');
    analyzeAdaptation(s, p, 'carcass', null);
    assert.equal(s.carnomorphAdaptations.breeder, null);
    assert.deepEqual(s.carnomorphRemoved, ['shambler', 'breeder']);
    assert.equal(s.adaptationsRemoved, 2);
});

test('regeneration increases the card toughness only after being revealed', () => {
    const s = carnoState();
    s.secret.carnomorphAdaptations.shambler = 'regeneration';
    const it = spawnCarnomorph(s, 'shambler', '002');
    s.attackDeck = ['carnoAttack1', 'carnoAttack1']; s.attackDiscard = [];
    assert.equal(carnPowerCheck(s, it, 4).result, 'survived');
    assert.equal(carnPowerCheck(s, it, 1).result, 'killed');
});

test('mutation choice is private, retains unchosen card, and survives JSON snapshot', () => {
    const s = carnoState(), p = s.players[0];
    s.phase = 'setup'; s.enemySet = 'carnomorphs';
    next(s, { op: 'carnomorph.gainCard', player: p.id }); run(s);
    assert.equal(s.prompt.secret, true); assert.equal(s.prompt.options.length, 2);
    const options = s.prompt.options.map(x => x.id), chosen = options[0];
    const hidden = viewFor(s, null);
    assert.equal(hidden.prompt.options, undefined);
    assert.ok(!JSON.stringify(hidden.prompt).includes(chosen));
    const restored = JSON.parse(JSON.stringify(s));
    assert.equal(answer(restored, p.id, restored.prompt.id, chosen), true);
    assert.equal(restored.players[0].mutationCard, chosen);
    assert.equal(restored.mutationDeck.length, 11);
    assert.ok(restored.mutationDeck.includes(options[1]));
    assert.equal(viewFor(restored, null).players[0].mutationCard, undefined);
    assert.equal(viewFor(restored, p.id).players[0].mutationCard, chosen);
    restored.players[0].mutationRevealed = true;
    assert.equal(viewFor(restored, null).players[0].mutationCard, chosen);
});

test('fourth mutation marker kills and places a shambler, but first award gives only a card', () => {
    const s = carnoState(), p = s.players[0]; s.phase = 'setup';
    next(s, { op: 'carnomorph.gainMarker', player: p.id }); run(s);
    assert.equal(p.mutationMarkers, 0); assert.ok(s.prompt);
    assert.equal(answer(s, p.id, s.prompt.id, s.prompt.options[0].id), true);
    assert.ok(p.mutationCard); assert.equal(p.mutationMarkers, 0);
    p.mutationMarkers = 3;
    next(s, { op: 'carnomorph.gainMarker', player: p.id }); run(s);
    assert.equal(p.status, 'dead');
    assert.ok(Object.values(s.intruders).some(it => it.type === 'shambler' && it.room === p.room));
    assert.ok(s.roomState[p.room].objects.some(o => o.type === 'charCorpse'));
});

test('red metagorger development adds at most one miniature to every applicable room', () => {
    const s = carnoState(), p = s.players[0];
    spawnCarnomorph(s, 'metagorger', '002');
    s.roomState['002'].objects.push({ type: 'egg' });
    s.roomState['003'].objects.push({ type: 'charCorpse', who: 9 });
    p.heavy.push({ type: 'egg' });
    s.roomState['004'].tile = 'nest'; s.roomState['004'].explored = true; s.nestDiscovered = true;
    const idx = s.bag.findIndex(t => t.type === 'redMetagorger');
    const token = s.bag.splice(idx, 1)[0];
    assert.deepEqual(developCarnomorphBag(s, token), []);
    for (const [roomId, count] of [['002', 2], ['003', 1], ['004', 1], [p.room, 1]])
        assert.equal(Object.values(s.intruders).filter(it => it.room === roomId && it.type === 'metagorger').length, count, roomId);
    assert.ok(s.bag.includes(token));
});

test('blank development removes only shamblers outside combat and skips noise in combat', () => {
    const s = carnoState(), p = s.players[0];
    const away = spawnCarnomorph(s, 'shambler', '002');
    const fighting = spawnCarnomorph(s, 'shambler', p.room);
    s.bag.splice(s.bag.indexOf('blank'), 1);
    const before = s.bag.length, steps = developCarnomorphBag(s, 'blank');
    assert.equal(s.intruders[away.uid], undefined); assert.ok(s.intruders[fighting.uid]);
    assert.equal(s.bag.length, before + 3);
    assert.ok(s.bag.some(t => t.type === 'shambler'));
    assert.deepEqual(steps, []);
});

test('bag butcher targets first player without slime and starts an encounter', () => {
    const s = carnoState(), p = s.players[s.firstPlayer];
    const idx = s.carnomorphSupply.findIndex(t => t.type === 'butcher');
    const token = s.carnomorphSupply.splice(idx, 1)[0];
    const steps = developCarnomorphBag(s, token);
    assert.equal(steps[0].op, 'encounter'); assert.equal(steps[0].player, p.id);
    assert.ok(Object.values(s.intruders).some(it => it.type === 'butcher' && it.room === p.room));
});

import { dealHits } from '../shared/engine/combat.mjs';
import { moveIntrudersByCorridor } from '../shared/engine/intruders.mjs';

test('real combat draws a Carnomorph attack card, uses its effects and keeps it in the discard', () => {
    const s = carnoState(), p = s.players[0]; s.phase = 'setup'; s.enemySet = 'carnomorphs'; p.hand = [];
    const it = spawnCarnomorph(s, 'shambler', p.room); s.carnomorphAdaptations.shambler = null;
    s.attackDeck = ['carnoAttack18']; s.attackDiscard = [];
    const health = p.health;
    next(s, { op: 'attack', intruder: it.uid, player: p.id }); run(s);
    assert.equal(p.health, health - 1);
    assert.equal(p.discard.filter(c => c.startsWith('contam#')).length, 1);
    assert.deepEqual(s.attackDiscard, ['carnoAttack18']);
});

test('real Metagorger attack pauses for a secret mutation choice before applying its effects', () => {
    const s = carnoState(), p = s.players[0]; s.phase = 'setup'; s.enemySet = 'carnomorphs'; p.hand = [];
    const it = spawnCarnomorph(s, 'metagorger', p.room), health = p.health;
    const before = s.bag.length;
    next(s, { op: 'attack', intruder: it.uid, player: p.id }); run(s);
    assert.equal(s.prompt.secret, true); assert.equal(p.health, health);
    const restored = JSON.parse(JSON.stringify(s));
    assert.ok(answer(restored, p.id, restored.prompt.id, restored.prompt.options[0].id));
    assert.equal(restored.players[0].health, health - 1);
    assert.ok(restored.players[0].mutationCard);
    assert.ok(restored.players[0].discard.some(c => c.startsWith('contam#')));
    assert.equal(restored.intruders[it.uid], undefined);
    assert.equal(restored.bag.length, before + 1);
    assert.ok(restored.bag.some(t => t.type === 'shambler'));
});

test('Redux shots against carnomorphs use the DLC toughness card rather than the die kill check', () => {
    const s = carnoState(), p = s.players[0]; s.enemySet = 'carnomorphs';
    const it = spawnCarnomorph(s, 'shambler', p.room); s.carnomorphAdaptations.shambler = null;
    s.attackDeck = ['carnoAttack1', 'carnoAttack1']; s.attackDiscard = [];
    assert.equal(dealHits(s, p, it, 1, 0, { forcedRoll: 'crit' }), false);
    assert.equal(it.hits, 1); assert.ok(s.intruders[it.uid]);
    assert.equal(dealHits(s, p, it, 3, 0, { forcedRoll: 6 }), true);
    assert.equal(s.intruders[it.uid], undefined);
    assert.equal(s.attackDiscard.length, 2);
});

test('first appearance by an encounter returns its numbered token to the supply', () => {
    const s = carnoState(), p = s.players[0]; s.phase = 'setup'; s.enemySet = 'carnomorphs';
    const idx = s.carnomorphSupply.findIndex(t => t.type === 'shambler');
    const token = s.carnomorphSupply.splice(idx, 1)[0];
    next(s, { op: 'encounter', player: p.id, room: p.room, token, noSurprise: true }); run(s);
    assert.ok(s.carnomorphSupply.some(t => t.id === token.id));
    assert.ok(Object.values(s.intruders).some(it => it.type === 'shambler' && it.room === p.room));
    assert.ok(s.carnomorphAdaptations.shambler);
});

test('the Butcher cannot leave through technical corridors', () => {
    const s = carnoState(); s.enemySet = 'carnomorphs';
    const id = Object.keys(s.ship.rooms).find(r => s.ship.rooms[r].tech && s.ship.rooms[r].techNums?.length);
    assert.ok(id);
    const it = spawnCarnomorph(s, 'butcher', id);
    const num = s.ship.rooms[id].techNums.find(n => !s.ship.rooms[id].exits.some(e => (e.nums || [e.num]).includes(n)));
    assert.notEqual(num, undefined);
    const before = s.bag.length;
    moveIntrudersByCorridor(s, num);
    assert.equal(s.intruders[it.uid].room, id);
    assert.equal(s.bag.length, before);
});

import { infectionProcedure } from '../shared/engine/actions.mjs';

test('scanning infected cards during Rest grants mutation markers rather than a larva', () => {
    const s = carnoState(), p = s.players[0]; s.phase = 'setup'; s.enemySet = 'carnomorphs';
    p.mutationCard = 'claw'; p.hand = ['contam#x', 'contam#y'];
    s.secret.contamInfected['contam#x'] = true; s.secret.contamInfected['contam#y'] = true;
    infectionProcedure(s, p, true, 'rest'); run(s);
    assert.equal(p.mutationMarkers, 2); assert.equal(p.larva, false);
    assert.equal(p.discard.filter(c => c.startsWith('contam#')).length, 2);
});

test('Carnomorph phase advances the tracks first, then attacks/feed before fire', () => {
    const s = carnoState(), p = s.players[0]; s.enemySet = 'carnomorphs'; s.time = 12;
    s.selfDestruct = 3; s.roomState[p.room].fire = true;
    const it = spawnCarnomorph(s, 'shambler', p.room); s.carnomorphAdaptations.shambler = null;
    s.attackDeck = ['carnoAttack18', 'carnoAttack20']; s.attackDiscard = []; p.hand = [];
    OPS['phase.intruder'](s);
    assert.equal(s.queue.shift().op, 'carnomorph.phaseStart');
    OPS['carnomorph.phaseStart'](s);
    assert.equal(s.time, 11); assert.equal(s.selfDestruct, 4); assert.equal(s.podsUnlocked, true);
    assert.deepEqual(s.queue.map(x => x.op), ['carnomorph.phaseAct', 'carnomorph.phaseFire', 'phase.event']);
    const health = p.health;
    OPS['carnomorph.phaseAct'](s, s.queue.shift());
    assert.equal(s.queue[0].op, 'attack');
    OPS.attack(s, s.queue.shift()); // reveal before reactions
    OPS.attack(s, s.queue.shift()); // resolve
    assert.equal(p.health, health - 1); assert.equal(it.hits, 0);
    assert.equal(s.queue.shift().op, 'carnomorph.phaseFire');
    OPS['carnomorph.phaseFire'](s);
    assert.equal(it.hits, 1); assert.equal(s.attackDiscard.length, 2);
});

test('revealed Carnomorph fire resistance prevents fire injury and drawing a card', () => {
    const s = carnoState(), p = s.players[0]; s.enemySet = 'carnomorphs';
    s.secret.carnomorphAdaptations.shambler = 'fireResistance';
    const it = spawnCarnomorph(s, 'shambler', p.room);
    s.roomState[p.room].fire = true; s.attackDeck = ['carnoAttack1']; s.attackDiscard = [];
    OPS['carnomorph.phaseFire'](s);
    assert.equal(it.hits, 0); assert.deepEqual(s.attackDeck, ['carnoAttack1']);
});

test('ravenous feeds from a heavy object in combat before the attack', () => {
    const s = carnoState(), p = s.players[0]; s.enemySet = 'carnomorphs';
    s.secret.carnomorphAdaptations.shambler = 'ravenous';
    const it = spawnCarnomorph(s, 'shambler', p.room);
    it.hits = 2; s.roomState[p.room].objects.push({ type: 'carcass' });
    OPS['carnomorph.phaseAct'](s, { intruder: it.uid });
    assert.equal(it.type, 'breeder'); assert.equal(it.hits, 0);
    assert.equal(s.roomState[p.room].objects.length, 0);
    assert.equal(s.queue[0].op, 'attack');
});

import { CARNOMORPH_EVENT_CARDS } from '../shared/data/carnomorph-events.mjs';
import { initCarnomorphEventDeck } from '../shared/engine/carnomorph-events.mjs';
import { eventLogLines } from '../shared/engine/events.mjs';

test('the physical event deck has 20 distinct cards with the printed movement icons', () => {
    const s = carnoState();
    initCarnomorphEventDeck(s);
    assert.equal(s.eventDeck.length, 20);
    assert.equal(new Set(s.eventDeck).size, 20);
    assert.deepEqual(CARNOMORPH_EVENT_CARDS[0].move, { type: 'corridor', num: 2, types: ['shambler', 'breeder', 'butcher'] });
    assert.deepEqual(CARNOMORPH_EVENT_CARDS[19].move, { type: 'corridor', num: 2, types: ['metagorger', 'shambler'] });
    assert.match(eventLogLines(CARNOMORPH_EVENT_CARDS[7]).join(' '), /Поиск биомассы/);
    assert.match(eventLogLines(CARNOMORPH_EVENT_CARDS[7]).join(' '), /тяжёлым объектом/);
});

test('event movement moves only indicated types, without moving monsters in combat', () => {
    const s = carnoState(); s.enemySet = 'carnomorphs';
    const start = Object.keys(s.ship.rooms).find(id => id !== s.players[0].room && s.ship.rooms[id].exits.some(e => (e.nums || [e.num]).includes(2)));
    const edge = s.ship.rooms[start].exits.find(e => (e.nums || [e.num]).includes(2));
    s.ship.corridors[edge.corridor].door = 'open';
    const shambler = spawnCarnomorph(s, 'shambler', start), gorger = spawnCarnomorph(s, 'metagorger', start);
    const inCombat = spawnCarnomorph(s, 'breeder', s.players[0].room);
    OPS['event.movement'](s, { id: 'carnoEvent1' });
    assert.equal(shambler.room, edge.to); assert.equal(gorger.room, start); assert.equal(inCombat.room, s.players[0].room);
    assert.deepEqual(s.queue.map(x => x.op), ['carnomorph.eventEffect', 'event.finish', 'phase.cleanup']);
});

test('event finish distinguishes shuffling self, removing self and ordinary discard', () => {
    const s = carnoState(); s.enemySet = 'carnomorphs';
    s.eventDeck = ['carnoEvent2']; s.eventDiscard = ['carnoEvent3']; s.carnomorphEventRemoved = [];
    OPS['event.finish'](s, { id: 'carnoEvent1' }); s.queue = [];
    assert.deepEqual(new Set(s.eventDeck), new Set(['carnoEvent1', 'carnoEvent2']));
    assert.deepEqual(s.eventDiscard, ['carnoEvent3']);
    OPS['event.finish'](s, { id: 'carnoEvent7' }); s.queue = [];
    assert.deepEqual(new Set(s.eventDeck), new Set(['carnoEvent1', 'carnoEvent2', 'carnoEvent3']));
    assert.deepEqual(s.eventDiscard, []); assert.deepEqual(s.carnomorphEventRemoved, ['carnoEvent7']);
    OPS['event.finish'](s, { id: 'carnoEvent4' });
    assert.deepEqual(s.eventDiscard, ['carnoEvent4']); assert.equal(s.queue[0].op, 'bag.develop');
});

test('chemical explosion picks highest burning room, recycles fire and respects closed doors', () => {
    const s = carnoState(); s.enemySet = 'carnomorphs';
    const id = Object.keys(s.ship.rooms).find(r => s.ship.rooms[r].exits.length >= 2);
    const [open, closed] = s.ship.rooms[id].exits;
    s.ship.corridors[open.corridor].door = 'open'; s.ship.corridors[closed.corridor].door = 'closed';
    for (const r of Object.keys(s.ship.rooms)) s.roomState[r].fire = false;
    s.roomState[id].fire = true; s.fireLeft = 7;
    OPS['carnomorph.eventEffect'](s, { id: 'carnoEvent1' });
    assert.equal(s.roomState[id].fire, false); assert.equal(s.roomState[id].malfunction, true);
    assert.equal(s.roomState[open.to].fire, true); assert.equal(s.roomState[closed.to].fire, false);
});

test('ambush returns only noncombat non-metagorgers to the bag', () => {
    const s = carnoState(); s.enemySet = 'carnomorphs';
    const a = spawnCarnomorph(s, 'shambler', '002'), b = spawnCarnomorph(s, 'metagorger', '002');
    const c = spawnCarnomorph(s, 'breeder', s.players[0].room);
    const old = s.bag.length;
    OPS['carnomorph.eventEffect'](s, { id: 'carnoEvent2' });
    assert.equal(s.intruders[a.uid], undefined); assert.ok(s.intruders[b.uid]); assert.ok(s.intruders[c.uid]);
    assert.equal(s.bag.length, old + 1); assert.ok(s.bag.some(t => t.type === 'shambler'));
});

test('evacuation error launches the highest B pod including its occupants', () => {
    const s = carnoState(); s.enemySet = 'carnomorphs'; const p = s.players[0];
    s.pods = [{ num: 2, section: 'B', occupants: [], launched: false, removed: false },
        { num: 4, section: 'B', occupants: [p.id], launched: false, removed: false },
        { num: 5, section: 'A', occupants: [], launched: false, removed: false }];
    p.pod = 4;
    OPS['carnomorph.eventEffect'](s, { id: 'carnoEvent7' });
    assert.equal(s.pods[1].launched, true); assert.equal(s.pods[0].launched, false);
    assert.equal(p.status, 'escaped'); assert.equal(p.pod, null); assert.ok(s.finishOrder.includes(p.id));
});

test('awakening replaces loose carcasses, preserves carried carcasses and queues attacks', () => {
    const s = carnoState(); s.enemySet = 'carnomorphs'; const p = s.players[0];
    p.heavy = [{ type: 'carcass' }]; s.roomState[p.room].objects = [{ type: 'carcass' }, { type: 'carcass' }];
    OPS['carnomorph.eventEffect'](s, { id: 'carnoEvent12' });
    assert.equal(s.roomState[p.room].objects.length, 0); assert.equal(p.heavy.length, 1);
    assert.equal(Object.values(s.intruders).filter(i => i.type === 'shambler').length, 2);
    assert.equal(s.queue.filter(x => x.op === 'attack').length, 2);
});

test('threatening mutation checks only four drawn cards and gives at most one marker', () => {
    const s = carnoState(); s.phase = 'setup'; s.enemySet = 'carnomorphs'; const p = s.players[0];
    p.mutationCard = 'claw'; p.mutationMarkers = 0; p.hand = ['contam#old'];
    p.deck = ['contam#a', 'contam#b', 'soldier.rest#x', 'contam#clean']; p.discard = [];
    Object.assign(s.secret.contamInfected, { 'contam#old': true, 'contam#a': true, 'contam#b': true, 'contam#clean': false });
    next(s, { op: 'carnomorph.eventMutation', player: p.id }); run(s);
    assert.equal(p.mutationMarkers, 1); assert.deepEqual(p.hand, ['contam#old']);
    assert.equal(p.discard.length, 4); assert.equal(p.larva, false);
});

test('event reveal and mutation selection survive serialization before bag development', () => {
    const s = carnoState(); s.enemySet = 'carnomorphs'; s.ui.eventAck = true; s.ui.bagClick = true;
    const p = s.players[0]; p.hand = []; p.deck = ['contam#one']; p.discard = []; s.secret.contamInfected['contam#one'] = true;
    s.eventDeck = ['carnoEvent19']; s.eventDiscard = []; s.mutationDeck = ['claw', 'scream'];
    next(s, { op: 'phase.event' }); run(s);
    assert.equal(s.prompt.kind, 'ack'); assert.equal(s.prompt.event, 'carnoEvent19');
    let restored = JSON.parse(JSON.stringify(s)); restored.prompt.flipped = true;
    assert.ok(answer(restored, p.id, restored.prompt.id, 'ok'));
    assert.equal(restored.prompt.secret, true); assert.equal(restored.resume.op, 'carnomorph.pickMutation');
    restored = JSON.parse(JSON.stringify(restored));
    assert.ok(answer(restored, p.id, restored.prompt.id, 'claw'));
    assert.equal(restored.players[0].mutationCard, 'claw');
    assert.deepEqual(restored.eventDiscard, ['carnoEvent19']);
    assert.equal(restored.prompt.kind, 'bag');
});

test('surgery removes a mutation card but never its permanent mutation markers', () => {
    const s = carnoState(), p = s.players[0]; s.enemySet = 'carnomorphs';
    p.mutationCard = 'claw'; p.mutationMarkers = 3; p.mutationRevealed = true;
    OPS['room.action'](s, { player: p.id, room: p.room, tile: 'surgery' });
    assert.equal(p.mutationCard, null); assert.equal(p.mutationMarkers, 3);
    assert.equal(p.mutationRevealed, false); assert.deepEqual(s.mutationDiscard, ['claw']);
});

test('fire resistance prevents flamethrower damage but not other weapons or the die roll', () => {
    const s = carnoState(), p = s.players[0]; s.enemySet = 'carnomorphs';
    s.secret.carnomorphAdaptations.shambler = 'fireResistance';
    const it = spawnCarnomorph(s, 'shambler', p.room);
    s.attackDeck = ['carnoAttack1']; s.attackDiscard = [];
    dealHits(s, p, it, 1, 0, { weapon: { item: 'flamethrower' }, forcedRoll: 2 });
    assert.equal(it.hits, 0); assert.deepEqual(s.attackDeck, ['carnoAttack1']);
    dealHits(s, p, it, 1, 0, { forcedRoll: 2 });
    assert.equal(it.hits, 1); assert.deepEqual(s.attackDiscard, ['carnoAttack1']);
});

test('biomass searches carried heavy objects and includes monsters in combat but excludes butcher', () => {
    const s = carnoState(), p = s.players[0]; s.enemySet = 'carnomorphs';
    const start = Object.keys(s.ship.rooms).find(id => s.ship.rooms[id].exits.length >= 2);
    const exits = [...s.ship.rooms[start].exits].sort((a, b) => a.to.localeCompare(b.to, undefined, { numeric: true }));
    const target = exits[0]; s.ship.corridors[target.corridor].door = 'open';
    p.room = start; p.heavy = [];
    s.roomState[target.to].objects.push({ type: 'egg' });
    const g = spawnCarnomorph(s, 'metagorger', start), b = spawnCarnomorph(s, 'butcher', start);
    OPS['carnomorph.eventEffect'](s, { id: 'carnoEvent8' });
    assert.equal(g.room, target.to); assert.equal(b.room, start);
    const s2 = carnoState(), p2 = s2.players[0]; s2.enemySet = 'carnomorphs';
    const e = s2.ship.rooms[start].exits.find(e => e.to === target.to);
    s2.ship.corridors[e.corridor].door = 'open'; p2.room = target.to; p2.heavy = [{ type: 'carcass' }];
    const g2 = spawnCarnomorph(s2, 'metagorger', start);
    OPS['carnomorph.eventEffect'](s2, { id: 'carnoEvent8' });
    assert.equal(g2.room, target.to);
});

test('pursuit moves noncombat carnivores except metagorgers to neighbouring character', () => {
    const s = carnoState(), p = s.players[0]; s.enemySet = 'carnomorphs';
    const from = Object.keys(s.ship.rooms).find(id => id !== p.room && s.ship.rooms[id].exits.length > 0);
    const e = s.ship.rooms[from].exits[0]; s.ship.corridors[e.corridor].door = 'open'; p.room = e.to;
    const a = spawnCarnomorph(s, 'shambler', from), b = spawnCarnomorph(s, 'metagorger', from);
    const c = spawnCarnomorph(s, 'breeder', p.room);
    OPS['carnomorph.eventEffect'](s, { id: 'carnoEvent10' });
    assert.equal(a.room, e.to); assert.equal(b.room, from); assert.equal(c.room, p.room);
});

test('roar places noise around every carnomorph room, including technical entrances', () => {
    const s = carnoState(); s.enemySet = 'carnomorphs';
    const id = Object.keys(s.ship.rooms).find(r => s.ship.rooms[r].tech);
    for (const c of Object.values(s.ship.corridors)) c.noise = false;
    s.ship.techNoise = false;
    spawnCarnomorph(s, 'metagorger', id);
    OPS['carnomorph.eventEffect'](s, { id: 'carnoEvent16' });
    for (const c of s.ship.rooms[id].exits) assert.equal(s.ship.corridors[c.corridor].noise, true);
    assert.equal(s.ship.techNoise, true);
});

test('generator overload uses actual malfunctions, not the supply count', () => {
    const s = carnoState(); s.enemySet = 'carnomorphs'; s.selfDestruct = 0;
    const rooms = Object.keys(s.roomState);
    for (const rs of Object.values(s.roomState)) rs.malfunction = false;
    s.malfLeft = 0;
    for (const id of rooms.slice(0, 2)) s.roomState[id].malfunction = true;
    OPS['carnomorph.eventEffect'](s, { id: 'carnoEvent11' });
    assert.equal(s.selfDestruct, 0);
    s.roomState[rooms[2]].malfunction = true;
    OPS['carnomorph.eventEffect'](s, { id: 'carnoEvent11' });
    assert.equal(s.selfDestruct, 1);
});

test('all event effects accept a normal JSON snapshot without adding slime or inventing room colours', () => {
    for (const ev of CARNOMORPH_EVENT_CARDS) {
        const s = JSON.parse(JSON.stringify(carnoState())); s.enemySet = 'carnomorphs';
        OPS['carnomorph.eventEffect'](s, { id: ev.id });
        assert.equal('slime' in s.players[0], false, ev.name);
    }
});

test('Carnomorph bag development never schedules noise rolls for characters in combat', () => {
    for (const type of ['blueMetagorger', 'shambler', 'breeder']) {
        const s = carnoState(), p = s.players[0]; s.enemySet = 'carnomorphs';
        spawnCarnomorph(s, 'metagorger', p.room);
        const index = s.carnomorphSupply.findIndex(t => t.type === type);
        const token = index >= 0 ? s.carnomorphSupply.splice(index, 1)[0] : s.bag.splice(s.bag.findIndex(t => t.type === type), 1)[0];
        assert.ok(token);
        assert.deepEqual(developCarnomorphBag(s, token), [], type);
    }
    const s = carnoState(), p = s.players[0]; s.enemySet = 'carnomorphs';
    spawnCarnomorph(s, 'metagorger', p.room);
    assert.deepEqual(developCarnomorphBag(s, 'blank'), []);
});

import { buildMenu } from '../shared/engine/turn.mjs';
import { mutationActionAvailability } from '../shared/engine/carnomorph-mutations.mjs';

function mutationState(id, infected = true) {
    const s = carnoState(), p = s.players[0];
    s.enemySet = 'carnomorphs'; s.phase = 'setup'; p.mutationCard = id;
    p.mutationMarkers = 0; p.mutationRevealed = false;
    p.hand = ['contam#scan']; p.deck = []; p.discard = [];
    s.secret.contamInfected['contam#scan'] = infected;
    s.attackDeck = ['carnoAttack1', 'carnoAttack1', 'carnoAttack1']; s.attackDiscard = [];
    return s;
}
function beginMutation(s) {
    next(s, { op: 'mutation.start', player: 0, then: { op: 'noop' } }); run(s);
    assert.equal(s.prompt.kind, 'cards'); assert.equal(s.prompt.secret, true);
    assert.ok(answer(s, 0, s.prompt.id, ['contam#scan']));
}

test('mutation action scans a secret card, spends a marker and heals on either scan result', () => {
    for (const infected of [true, false]) {
        const s = mutationState('regeneration', infected), p = s.players[0];
        p.wounds = ['leg'];
        assert.equal(mutationActionAvailability(s, p).ok, true);
        beginMutation(s);
        assert.equal(p.mutationRevealed, true); assert.equal(p.mutationMarkers, 1);
        assert.equal(s.prompt.kind, 'choice');
        assert.ok(answer(s, p.id, s.prompt.id, 'leg'));
        assert.deepEqual(p.wounds, []);
        assert.equal(p.discard.includes('contam#scan'), infected);
        assert.equal((p.removedCards || []).includes('contam#scan'), !infected);
        if (!infected) assert.ok(p.discard.some(c => c.startsWith('contam#') && c !== 'contam#scan'));
    }
});

test('turn menu starts a mutation without paying action cards and restores a scan prompt from JSON', () => {
    let s = mutationState('regeneration'); const p = s.players[0];
    p.wounds = ['arm']; s.phase = 'player'; s.current = p.id; s.actionsLeft = 2;
    next(s, { op: 'turn.choose' }); run(s);
    assert.ok(s.prompt.actions.find(a => a.id === 'mutation' && a.enabled));
    assert.ok(answer(s, p.id, s.prompt.id, { action: 'mutation' }));
    assert.equal(s.actionsLeft, 1); assert.equal(s.prompt.kind, 'cards');
    assert.equal(viewFor(s, null).prompt.cards, undefined);
    assert.equal(viewFor(s, null).players[0].mutationCard, undefined);
    s = JSON.parse(JSON.stringify(s));
    assert.ok(answer(s, p.id, s.prompt.id, ['contam#scan']));
    assert.equal(s.players[0].mutationMarkers, 1);
    assert.equal(viewFor(s, null).players[0].mutationCard, 'regeneration');
    assert.ok(answer(s, p.id, s.prompt.id, 'arm'));
    assert.equal(s.prompt.kind, 'turn'); assert.deepEqual(s.players[0].wounds, []);
});

test('fourth marker kills before a mutation effect can heal', () => {
    const s = mutationState('regeneration'), p = s.players[0];
    p.wounds = ['leg']; p.mutationMarkers = 3;
    beginMutation(s);
    assert.equal(p.status, 'dead'); assert.deepEqual(p.wounds, ['leg']);
    assert.equal(s.prompt, null); assert.ok(Object.values(s.intruders).some(i => i.type === 'shambler'));
});

test('adaptation mutation keeps one of three and discards the other two and old card', () => {
    const s = mutationState('adaptation'); s.mutationDeck = ['claw', 'scream', 'gastric', 'trickster'];
    beginMutation(s);
    assert.equal(s.prompt.secret, true); assert.equal(s.prompt.options.length, 3);
    assert.ok(answer(s, 0, s.prompt.id, 'scream'));
    assert.equal(s.players[0].mutationCard, 'scream'); assert.equal(s.players[0].mutationRevealed, false);
    assert.deepEqual(s.mutationDiscard, ['adaptation', 'claw', 'gastric']); assert.deepEqual(s.mutationDeck, ['trickster']);
});

test('claw infected uses a normal combat roll and two hits; clean draws only toughness card', () => {
    for (const infected of [true, false]) {
        const s = mutationState('claw', infected), p = s.players[0];
        const it = spawnCarnomorph(s, 'shambler', p.room); s.carnomorphAdaptations.shambler = null;
        beginMutation(s);
        assert.ok(answer(s, p.id, s.prompt.id, it.uid));
        if (infected) { assert.equal(s.prompt.kind, 'dice'); assert.ok(answer(s, p.id, s.prompt.id, 'roll')); }
        assert.equal(it.hits, infected ? 2 : 1); assert.deepEqual(s.attackDiscard, ['carnoAttack1']);
    }
});

test('gastric mutation consumes only loose egg or carcass and draws after healing', () => {
    const s = mutationState('gastric'), p = s.players[0];
    s.roomState[p.room].objects = [{ type: 'carcass' }]; p.wounds = ['leg']; p.health = 5;
    p.deck = ['soldier.rest#1', 'soldier.rest#2'];
    beginMutation(s);
    assert.ok(answer(s, p.id, s.prompt.id, '0'));
    assert.equal(s.prompt.kind, 'choice'); assert.ok(answer(s, p.id, s.prompt.id, 'leg'));
    assert.deepEqual(p.wounds, []); assert.equal(p.hand.length, 2); assert.deepEqual(s.roomState[p.room].objects, []);
});

test('genome error may remove contamination drawn with its effect without exposing choices to others', () => {
    const s = mutationState('genomeError'), p = s.players[0];
    p.deck = ['contam#drawn', 'soldier.rest#1']; s.secret.contamInfected['contam#drawn'] = true;
    beginMutation(s);
    assert.equal(s.prompt.secret, true); assert.equal(viewFor(s, null).prompt.options, undefined);
    assert.ok(answer(s, p.id, s.prompt.id, 'yes'));
    assert.deepEqual(p.hand, ['soldier.rest#1']); assert.ok(p.removedCards.includes('contam#drawn'));
});

test('mutation menu enforces infection, combat and target requirements without changing Redux', () => {
    const s = mutationState('gastric'), p = s.players[0];
    assert.equal(buildMenu(s, p).actions.find(a => a.id === 'mutation').enabled, false);
    s.roomState[p.room].objects.push({ type: 'egg' });
    assert.equal(buildMenu(s, p).actions.find(a => a.id === 'mutation').enabled, true);
    spawnCarnomorph(s, 'shambler', p.room);
    assert.equal(buildMenu(s, p).actions.find(a => a.id === 'mutation').reason, 'Нельзя в бою');
    s.enemySet = 'redux'; assert.equal(buildMenu(s, p).actions.some(a => a.id === 'mutation'), false);
});

test('mimicry is offered before revealing an attack card, and infected solo ignores the attack', () => {
    const s = mutationState('mimicry'), p = s.players[0];
    const it = spawnCarnomorph(s, 'shambler', p.room); s.carnomorphAdaptations.shambler = null;
    s.attackDeck = ['carnoAttack18']; s.attackDiscard = [];
    const hp = p.health;
    next(s, { op: 'attack', intruder: it.uid, player: p.id, context: 'phase' }); run(s);
    assert.equal(s.prompt.kind, 'choice'); assert.equal(s.prompt.secret, true);
    assert.deepEqual(s.attackDeck, ['carnoAttack18']);
    assert.ok(answer(s, p.id, s.prompt.id, 'yes'));
    assert.ok(answer(s, p.id, s.prompt.id, ['contam#scan']));
    assert.equal(p.health, hp); assert.equal(p.mutationMarkers, 1);
    assert.deepEqual(s.attackDeck, ['carnoAttack18']); assert.deepEqual(s.attackDiscard, []);
});

test('clean solo mimicry resumes the original attack after scanning', () => {
    const s = mutationState('mimicry', false), p = s.players[0];
    const it = spawnCarnomorph(s, 'shambler', p.room); s.carnomorphAdaptations.shambler = null;
    s.attackDeck = ['carnoAttack18']; s.attackDiscard = [];
    const hp = p.health;
    next(s, { op: 'attack', intruder: it.uid, player: p.id, context: 'phase' }); run(s);
    assert.ok(answer(s, p.id, s.prompt.id, 'yes'));
    assert.ok(answer(s, p.id, s.prompt.id, ['contam#scan']));
    assert.equal(p.health, hp - 1); assert.deepEqual(s.attackDiscard, ['carnoAttack18']);
});

test('infected keen senses changes the result after a noise roll without a second die roll', () => {
    const s = mutationState('senses'), p = s.players[0];
    const target = s.ship.rooms[p.room].exits.find(e => (e.nums || [e.num]).some(n => n !== 2));
    assert.ok(target); const num = (target.nums || [target.num]).find(n => n !== 2);
    s.pendingRoll = { die: 'noise', value: 2 }; s.pendingRollPlayer = p.id;
    next(s, { op: 'noise.roll', player: p.id, room: p.room }); run(s);
    assert.equal(s.prompt.secret, true); assert.ok(answer(s, p.id, s.prompt.id, 'yes'));
    assert.ok(answer(s, p.id, s.prompt.id, ['contam#scan']));
    assert.ok(!s.prompt.options.some(o => o.id === '2'));
    const rolls = s.rollSeq;
    assert.ok(answer(s, p.id, s.prompt.id, String(num)));
    assert.equal(s.rollSeq, rolls); assert.equal(s.lastRoll.value, num); assert.equal(s.ship.corridors[target.corridor].noise, true);
    assert.equal(p.mutationMarkers, 1);
});

test('clean keen senses requires a second roll and never reoffers the same reaction', () => {
    const s = mutationState('senses', false), p = s.players[0];
    s.pendingRoll = { die: 'noise', value: 'silence' };
    next(s, { op: 'noise.roll', player: p.id, room: p.room }); run(s);
    assert.ok(answer(s, p.id, s.prompt.id, 'yes'));
    assert.ok(answer(s, p.id, s.prompt.id, ['contam#scan']));
    assert.equal(s.prompt.kind, 'dice');
    assert.ok(answer(s, p.id, s.prompt.id, 'roll'));
    assert.notEqual(s.prompt?.resume?.op, 'mutation.offerSenses');
    assert.equal(p.mutationMarkers, 1);
});

test('trickster passes a closed door without changing it and escapes without noise when infected', () => {
    const s = mutationState('trickster'), p = s.players[0];
    const exit = s.ship.rooms[p.room].exits[0], door = s.ship.corridors[exit.corridor];
    door.door = 'closed'; s.roomState[exit.to].explored = true;
    beginMutation(s); assert.equal(s.prompt.kind, 'room');
    assert.ok(answer(s, p.id, s.prompt.id, exit.to));
    assert.equal(p.room, exit.to); assert.equal(door.door, 'closed');
    assert.equal(s.prompt, null);
});

test('boiling blood applies damage to original targets, not newly spawned shamblers', () => {
    const s = mutationState('boilingBlood'), p = s.players[0];
    const it = spawnCarnomorph(s, 'breeder', p.room); s.carnomorphAdaptations.breeder = null;
    s.attackDeck = ['carnoAttack20']; s.attackDiscard = [];
    it.hits = 2; // threshold 3, so death releases a shambler
    beginMutation(s);
    assert.equal(s.intruders[it.uid], undefined);
    const spawned = Object.values(s.intruders).find(i => i.type === 'shambler');
    assert.ok(spawned); assert.equal(spawned.hits, 0); assert.equal(s.attackDiscard.length, 1);
});

test('mimicry redirects the attack to another player without leaking the unrevealed mutation', () => {
    const s = mutationState('mimicry'), p = s.players[0];
    const other = JSON.parse(JSON.stringify(p));
    other.id = 1; other.name = 'Other'; other.mutationCard = null; other.mutationRevealed = false; other.hand = [];
    s.players.push(other); s.seating = [0, 1];
    const it = spawnCarnomorph(s, 'shambler', p.room); s.carnomorphAdaptations.shambler = null;
    s.attackDeck = ['carnoAttack18']; s.attackDiscard = [];
    const hp = p.health, otherHp = other.health;
    const visible = viewFor(s, 1);
    assert.equal(visible.players[0].hasMutation, true); assert.equal(visible.players[0].mutationCard, undefined);
    next(s, { op: 'attack', intruder: it.uid, player: p.id, context: 'phase' }); run(s);
    assert.ok(answer(s, p.id, s.prompt.id, 'yes'));
    assert.ok(answer(s, p.id, s.prompt.id, ['contam#scan']));
    assert.equal(s.prompt.title, 'Мимикрия: кто станет целью атаки?');
    assert.ok(answer(s, p.id, s.prompt.id, '1'));
    assert.equal(p.health, hp); assert.equal(other.health, otherHp - 1);
    assert.deepEqual(s.attackDiscard, ['carnoAttack18']);
});

test('adaptation clean discards the old mutation and draws exactly one hidden card', () => {
    const s = mutationState('adaptation', false); s.mutationDeck = ['claw', 'scream'];
    beginMutation(s);
    assert.equal(s.players[0].mutationCard, 'claw'); assert.equal(s.players[0].mutationRevealed, false);
    assert.deepEqual(s.mutationDiscard, ['adaptation']); assert.deepEqual(s.mutationDeck, ['scream']);
});

test('escape artist infected prevents escape attacks while clean does not; both skip noise', () => {
    for (const infected of [true, false]) {
        const s = mutationState('escapeArtist', infected), p = s.players[0];
        const exit = s.ship.rooms[p.room].exits[0], hp = p.health;
        s.roomState[exit.to].explored = true;
        spawnCarnomorph(s, 'shambler', p.room); s.carnomorphAdaptations.shambler = null;
        s.attackDeck = ['carnoAttack18']; s.attackDiscard = [];
        beginMutation(s); assert.equal(s.prompt.kind, 'room');
        assert.ok(answer(s, p.id, s.prompt.id, exit.to));
        assert.equal(p.room, exit.to); assert.equal(p.health, hp - (infected ? 0 : 1));
        assert.equal(s.attackDiscard.length, infected ? 0 : 1); assert.equal(s.prompt, null);
    }
});

test('shape change travels between technical entrances and skips noise only when infected', () => {
    for (const infected of [true, false]) {
        const s = mutationState('shapeChange', infected), p = s.players[0];
        const rooms = Object.values(s.ship.rooms).filter(r => r.tech);
        p.room = rooms[0].id; const to = rooms[1].id; s.roomState[to].explored = true;
        beginMutation(s); assert.equal(s.prompt.kind, 'room');
        assert.ok(answer(s, p.id, s.prompt.id, to));
        assert.equal(p.room, to);
        if (infected) assert.equal(s.prompt, null); else assert.equal(s.prompt.kind, 'dice');
    }
});

test('infected scream lets the player choose a valid adjacent room for the target', () => {
    const s = mutationState('scream'), p = s.players[0];
    const it = spawnCarnomorph(s, 'breeder', p.room), e = s.ship.rooms[p.room].exits[0];
    s.ship.corridors[e.corridor].door = 'open';
    beginMutation(s); assert.ok(answer(s, p.id, s.prompt.id, it.uid));
    assert.equal(s.prompt.kind, 'room'); assert.ok(answer(s, p.id, s.prompt.id, e.to));
    assert.equal(it.room, e.to);
});

test('infected boiling blood wounds other characters but not the mutation user', () => {
    const s = mutationState('boilingBlood'), p = s.players[0];
    const other = JSON.parse(JSON.stringify(p)); other.id = 1; other.name = 'Other'; other.hand = []; other.wounds = [];
    s.players.push(other); s.seating = [0, 1]; s.woundDeck = ['leg'];
    const ownHp = p.health, hp = other.health;
    beginMutation(s);
    assert.equal(p.health, ownHp); assert.deepEqual(p.wounds, []);
    assert.equal(other.health, Math.min(hp - 1, 7)); assert.deepEqual(other.wounds, ['leg']);
});

test('declining keen senses keeps the original die without scanning or adding a marker', () => {
    const s = mutationState('senses'), p = s.players[0];
    s.pendingRoll = { die: 'noise', value: 'silence' };
    next(s, { op: 'noise.roll', player: p.id, room: p.room }); run(s);
    assert.ok(answer(s, p.id, s.prompt.id, 'no'));
    assert.equal(p.mutationMarkers, 0); assert.equal(p.mutationRevealed, false);
    assert.deepEqual(p.hand, ['contam#scan']); assert.equal(s.prompt, null);
});

function finalMutationState(id = null) {
    const s = mutationState(id || 'claw'), p = s.players[0];
    p.mutationCard = id; p.mutationMarkers = 0; p.status = 'escaped'; p.pod = null;
    p.objective = p.objectives[0]; p.objectives = [p.objective];
    s.shipDestroyed = true; s.finishOrder = [p.id]; s.phase = 'setup';
    p.hand = []; p.deck = []; p.discard = []; s.mutationDeck = ['claw', 'scream', 'gastric'];
    return s;
}

test('final Carnomorph check scans an unmutated survivor and preserves the secret selection through JSON', () => {
    let s = finalMutationState(), p = s.players[0];
    p.hand = ['contam#infected', 'contam#clean', 'contam#clean2', 'contam#clean3'];
    Object.assign(s.secret.contamInfected, { 'contam#infected': true, 'contam#clean': false, 'contam#clean2': false, 'contam#clean3': false });
    next(s, { op: 'game.end' }); run(s);
    assert.equal(s.prompt.secret, true); assert.equal(s.result, null);
    assert.equal(viewFor(s, null).prompt.options, undefined);
    s = JSON.parse(JSON.stringify(s));
    assert.ok(answer(s, p.id, s.prompt.id, 'claw'));
    assert.equal(s.result.results[0].alive, false);
    assert.match(s.result.results[0].why, /мутац/);
    assert.equal(s.players[0].mutationMarkers, 4);
    assert.equal(s.players[0].hand.length, 4);
    assert.equal(s.carnomorphEnd, undefined);
});

test('final check ignores clean infections without a mutation card and checks all infections with one', () => {
    const clean = finalMutationState(), p = clean.players[0];
    p.hand = ['contam#clean']; clean.secret.contamInfected['contam#clean'] = false;
    next(clean, { op: 'game.end' }); run(clean);
    assert.equal(clean.result.results[0].alive, true); assert.equal(p.mutationCard, null); assert.equal(p.mutationMarkers, 0);
    const mutated = finalMutationState('claw'), q = mutated.players[0]; q.mutationMarkers = 3;
    q.deck = ['contam#clean']; mutated.secret.contamInfected['contam#clean'] = false;
    next(mutated, { op: 'game.end' }); run(mutated);
    assert.equal(mutated.result.results[0].alive, false); assert.equal(q.mutationMarkers, 4);
});

test('final check shuffles hand, deck and discard together and counts only four drawn cards', () => {
    const s = finalMutationState('claw'), p = s.players[0]; p.mutationMarkers = 0;
    p.hand = ['contam#a']; p.deck = ['contam#b']; p.discard = ['contam#c', 'contam#d', 'contam#e'];
    next(s, { op: 'game.end' }); run(s);
    assert.equal(p.hand.length, 4); assert.equal(p.deck.length, 1); assert.deepEqual(p.discard, []);
    assert.equal(p.mutationMarkers, 4); assert.equal(s.result.results[0].alive, false);
});

test('Carnomorph agility makes only the natural critical face miss without drawing a toughness card', () => {
    const s = carnoState(), p = s.players[0]; s.enemySet = 'carnomorphs';
    s.secret.carnomorphAdaptations.shambler = 'agility';
    const it = spawnCarnomorph(s, 'shambler', p.room);
    s.attackDeck = ['carnoAttack1']; s.attackDiscard = [];
    assert.equal(dealHits(s, p, it, 2, 0, { forcedRoll: 'crit' }), false);
    assert.equal(it.hits, 0); assert.deepEqual(s.attackDeck, ['carnoAttack1']);
    dealHits(s, p, it, 1, 0, { forcedRoll: 2 });
    assert.equal(it.hits, 1); assert.deepEqual(s.attackDiscard, ['carnoAttack1']);
});

test('unrevealed or removed agility does not change critical attacks', () => {
    for (const revealed of [false, true]) {
        const s = carnoState(), p = s.players[0]; s.enemySet = 'carnomorphs';
        s.secret.carnomorphAdaptations.shambler = 'agility';
        const it = spawnCarnomorph(s, 'shambler', p.room);
        if (!revealed) s.carnomorphAdaptations.shambler = null;
        else { s.carnomorphAdaptations.shambler = null; s.carnomorphRemoved.push('shambler'); }
        s.attackDeck = ['carnoAttack1']; s.attackDiscard = [];
        dealHits(s, p, it, 1, 0, { forcedRoll: 'crit' });
        assert.equal(it.hits, 1); assert.deepEqual(s.attackDiscard, ['carnoAttack1']);
    }
});

import { bagTokenCounts, bagTokenLabel, bagTokenIcon } from '../shared/bag-tokens.mjs';
import { bagTokenMeaning, corridorsOf } from '../shared/engine/core.mjs';
import { OBJECTIVES, objectiveTextOf } from '../shared/data/cards.mjs';
import { checkObjective } from '../shared/engine/endgame.mjs';
import { resolveAirlocks } from '../shared/engine/rooms.mjs';

test('Carnomorph objectives and displayed text use the Butcher, while Redux uses the Queen', () => {
    const s = carnoState(), p = s.players[0];
    s.enemySet = 'carnomorphs';
    s.players.push({ ...p, id: 1, number: 2, name: 'Other', status: 'active' });
    const trophy = OBJECTIVES.personal.trophyHunter, priority = OBJECTIVES.corporate.priorityOne;
    assert.match(objectiveTextOf(trophy, s.players, s.enemySet), /Мясник/);
    assert.match(objectiveTextOf(priority, s.players, s.enemySet), /Мясник/);
    assert.match(objectiveTextOf(trophy, s.players, 'redux'), /Королева/);
    s.queenDead = true; s.carnomorphButcherDead = false;
    assert.equal(checkObjective(s, p, trophy, 'earth'), false);
    assert.equal(checkObjective(s, p, priority, 'earth'), true);
    s.carnomorphButcherDead = true;
    assert.equal(checkObjective(s, p, trophy, 'earth'), true);
    assert.equal(checkObjective(s, p, priority, 'earth'), false);
    s.enemySet = 'redux'; s.queenDead = false;
    assert.equal(checkObjective(s, p, trophy, 'earth'), false);
    assert.equal(checkObjective(s, p, priority, 'earth'), true);
});

test('grenade launcher and detonator kill original Carnomorphs and preserve death spawns', () => {
    for (const op of ['shoot.grenade', 'item.detonate']) {
        const s = carnoState(), p = s.players[0]; s.enemySet = 'carnomorphs';
        const r = Object.keys(s.ship.rooms).find(x => x !== p.room);
        const butcher = spawnCarnomorph(s, 'butcher', r), breeder = spawnCarnomorph(s, 'breeder', r);
        p.items.push({ uid: 'launcher', item: 'grenadeLauncher', ammo: 1 });
        OPS[op](s, { player: p.id, answer: r, weapon: 'launcher' });
        assert.equal(s.intruders[butcher.uid], undefined);
        assert.equal(s.intruders[breeder.uid], undefined);
        assert.equal(s.carnomorphButcherDead, true);
        assert.equal(Object.values(s.intruders).filter(it => it.type === 'shambler' && it.room === r).length, 3);
        assert.equal(s.roomState[r].objects.filter(o => o.type === 'carcass').length, 1);
        assert.equal(spawnCarnomorph(s, 'butcher', r), null);
    }
});

test('airlock kills Butcher in space without leaving remains or spawning Shamblers', () => {
    const s = carnoState(), p = s.players[0]; s.enemySet = 'carnomorphs';
    const r = Object.keys(s.ship.rooms).find(x => x !== p.room);
    const butcher = spawnCarnomorph(s, 'butcher', r), breeder = spawnCarnomorph(s, 'breeder', r);
    for (const c of corridorsOf(s, r)) if (c.id !== 'tech') s.ship.corridors[c.id].door = 'closed';
    s.roomState[r].airlock = true; resolveAirlocks(s);
    assert.equal(s.intruders[butcher.uid], undefined); assert.equal(s.intruders[breeder.uid], undefined);
    assert.equal(s.carnomorphButcherDead, true); assert.equal(Object.values(s.intruders).length, 0);
    assert.deepEqual(s.roomState[r].objects, []); assert.equal(spawnCarnomorph(s, 'butcher', r), null);
});

test('BF gun adds its bonus in the Carnomorph toughness check, not before a missed attack', () => {
    const s = carnoState(), p = s.players[0]; s.enemySet = 'carnomorphs';
    s.secret.carnomorphAdaptations.shambler = 'agility';
    const it = spawnCarnomorph(s, 'shambler', p.room); s.attackDeck = ['carnoAttack1']; s.attackDiscard = [];
    dealHits(s, p, it, 1, 0, { weapon: { item: 'bfGun' }, forcedRoll: 5 });
    assert.equal(it.hits, 2); assert.deepEqual(s.attackDiscard, ['carnoAttack1']);
    const before = it.hits; s.attackDeck = ['carnoAttack1'];
    dealHits(s, p, it, 1, 0, { weapon: { item: 'bfGun' }, forcedRoll: 'crit' });
    assert.equal(it.hits, before); assert.deepEqual(s.attackDeck, ['carnoAttack1']);
});

test('bag view counts object tokens by public type without leaking their hidden values', () => {
    const s = carnoState(); s.enemySet = 'carnomorphs';
    s.bag = ['blank', { type: 'redMetagorger', value: 2 }, { type: 'redMetagorger', value: 3 }, { type: 'shambler', value: 4 }];
    const v = viewFor(s, 0); assert.deepEqual(v.bagKnown, { blank: 1, redMetagorger: 2, shambler: 1 });
    assert.deepEqual(bagTokenCounts(s.bag), v.bagKnown);
    assert.equal(bagTokenLabel(s.bag[1]), 'Красный глодатель · 2');
    assert.equal(bagTokenIcon(s.bag[1]), '🔴');
    assert.equal(bagTokenLabel('adult'), 'Взрослый');
    assert.match(bagTokenMeaning(s, s.bag[1]), /значением 2/);
    assert.doesNotMatch(bagTokenMeaning(s, 'blank'), /взрослых/);
    assert.equal(JSON.stringify(v.bagKnown).includes('[object Object]'), false);
});

test('adult-targeting Redux effects address Shamblers only in Carnomorph games', () => {
    const s = carnoState(), p = s.players[0]; s.enemySet = 'carnomorphs';
    const r = p.room, shambler = spawnCarnomorph(s, 'shambler', r);
    p.items.push({ uid: 'riot', item: 'riotgun', ammo: 4 });
    OPS['shoot.mode'](s, { player: p.id, weapon: 'riot' });
    assert.ok(s.prompt.options.some(o => o.id === 'repel'));
    s.prompt = null; s.resume = null;
    OPS['shoot.modeChosen'](s, { player: p.id, weapon: 'riot', answer: 'repel' });
    assert.equal(p.items.find(i => i.uid === 'riot').ammo, 2);
    assert.notEqual(shambler.room, r);
    s.queue = [];
    OPS['room.containment'](s, { player: p.id, answer: r });
    assert.ok(Object.values(s.intruders).some(i => i.type === 'shambler' && i.room === r));
    assert.equal(Object.values(s.intruders).some(i => i.type === 'adult'), false);
    assert.ok(s.carnomorphRevealed.includes('shambler'));
});

test('autodoc and surgery kit remove the mutation card but preserve markers', () => {
    for (const kind of ['autodoc', 'surgeryKit']) {
        const s = carnoState(), p = s.players[0]; s.enemySet = 'carnomorphs';
        p.mutationCard = 'claw'; p.mutationRevealed = true; p.mutationMarkers = 2;
        p.items.push({ uid: 'cure', item: kind });
        if (kind === 'autodoc') OPS['item.use'](s, { player: p.id, uid: 'cure' });
        else OPS['item.surgeryKit'](s, { player: p.id, uid: 'cure', answer: String(p.id) });
        assert.equal(p.mutationCard, null); assert.equal(p.mutationRevealed, false);
        assert.equal(p.mutationMarkers, 2); assert.ok(s.mutationDiscard.includes('claw'));
        assert.equal(p.items.some(i => i.uid === 'cure'), false);
    }
});

test('Conviction directly kills a Carnomorph and triggers its death consequences', () => {
    const s = carnoState(), p = s.players[0]; s.enemySet = 'carnomorphs';
    const butcher = spawnCarnomorph(s, 'butcher', p.room);
    s.attackDeck = ['carnoAttack1']; s.attackDiscard = [];
    OPS['feat.conviction.kill'](s, { player: p.id, answer: butcher.uid });
    assert.equal(s.intruders[butcher.uid], undefined); assert.equal(s.carnomorphButcherDead, true);
    assert.equal(Object.values(s.intruders).filter(i => i.type === 'shambler').length, 2);
    assert.deepEqual(s.attackDeck, ['carnoAttack1']);
});

test('egg and carcass analyses remove their hidden adaptations while retaining Redux objective checks', () => {
    const s = carnoState(), p = s.players[0]; s.enemySet = 'carnomorphs'; p.signal = true;
    const egg = OBJECTIVES.corporate.abOvo, corpse = OBJECTIVES.corporate.necroscopy;
    s.roomState[p.room].objects.push({ type: 'egg' }, { type: 'carcass' });
    OPS['room.lab'](s, { player: p.id, room: p.room, answer: 'room:0' });
    assert.ok(s.carnomorphRemoved.includes('butcher')); assert.equal(checkObjective(s, p, egg, 'earth'), true);
    OPS['room.lab'](s, { player: p.id, room: p.room, answer: 'room:0' });
    assert.ok(s.carnomorphRemoved.includes('breeder')); assert.equal(checkObjective(s, p, corpse, 'earth'), true);
    assert.equal(s.adaptationsRemoved, 2);
});

test('Field Experience can redraw Carnomorph tokens during both encounter and bag development', () => {
    for (const op of ['encounter', 'bag.develop']) {
        let s = carnoState(), p = s.players[0]; s.phase = 'setup'; s.enemySet = 'carnomorphs';
        p.hand = ['xeno.fieldExperience#0']; p.tissue = 1;
        const token = { id: 'red-test', type: 'redMetagorger', value: 3 };
        s.bag = ['blank'];
        next(s, { op, player: p.id, room: p.room, token }); run(s);
        assert.match(s.prompt.title, /Красный глодатель · 3/);
        assert.equal(s.carnomorphSupply.some(t => t.id === token.id), false);
        s = JSON.parse(JSON.stringify(s)); p = s.players[0];
        assert.ok(answer(s, p.id, s.prompt.id, 'yes'));
        assert.equal(p.tissue, 0); assert.ok(p.discard.includes('xeno.fieldExperience#0'));
        assert.doesNotMatch(s.log.map(l => l.text).join(' '), /undefined|\[object Object\]/);
        assert.equal([...s.bag, ...s.carnomorphSupply].filter(t => t && t.id === token.id).length, 1);
    }
});

test('Predictable Movements deals toughness damage before Carnomorph surprise and can stop it by retreat', () => {
    let s = carnoState(), p = s.players[0]; s.phase = 'setup'; s.enemySet = 'carnomorphs';
    p.hand = ['field.predictableMovements#0']; s.attackDeck = ['carnoAttack3', 'carnoAttack1']; s.attackDiscard = [];
    const token = { id: 's-test', type: 'shambler', value: 4 };
    next(s, { op: 'encounter', player: p.id, room: p.room, token }); run(s);
    assert.match(s.prompt.title, /Предсказуемые движения/);
    s = JSON.parse(JSON.stringify(s)); p = s.players[0];
    assert.ok(answer(s, p.id, s.prompt.id, 'yes'));
    assert.equal(Object.values(s.intruders)[0].hits, 1);
    assert.notEqual(Object.values(s.intruders)[0].room, p.room);
    assert.deepEqual(s.attackDeck, ['carnoAttack1']);
    assert.equal(s.queue.some(x => x.op === 'attack'), false);
});

test('Substitution allows danger movement through closed doors, including predictable movement reaction', () => {
    for (const react of [false, true]) {
        let s = carnoState(), p = s.players[0]; s.phase = 'setup'; s.enemySet = 'carnomorphs';
        s.secret.carnomorphAdaptations.shambler = 'substitution';
        const exit = s.ship.rooms[p.room].exits[0];
        for (const e of s.ship.rooms[p.room].exits) s.ship.corridors[e.corridor].door = 'closed';
        const it = spawnCarnomorph(s, 'shambler', exit.to); s.attackDeck = ['carnoAttack1']; s.attackDiscard = [];
        p.hand = react ? ['field.predictableMovements#0'] : [];
        s.pendingRoll = { die: 'noise', value: 'danger' };
        next(s, { op: 'noise.roll', player: p.id, room: p.room }); run(s);
        if (react) { assert.match(s.prompt.title, /Предсказуемые движения/); s = JSON.parse(JSON.stringify(s)); assert.ok(answer(s, 0, s.prompt.id, 'yes')); assert.equal(s.intruders[it.uid].room, exit.to); assert.equal(s.intruders[it.uid].hits, 1); }
        else assert.equal(s.intruders[it.uid].room, p.room);
        assert.equal(s.ship.corridors[exit.corridor].door, 'closed');
    }
});

import { initCarnomorphPack } from '../shared/engine/carnomorph-setup.mjs';
test('single Carnomorph setup installs all physical decks, bag and hidden assignments deterministically', () => {
    const make = () => {
        const s = createGame({ seed: 'carno-setup', players: [{ name: 'Test', charId: 'soldier' }], weaknessMode: true });
        s.enemySet = 'carnomorphs'; initCarnomorphPack(s); return s;
    };
    const s = make(), other = make();
    assert.deepEqual(s.bag, other.bag); assert.deepEqual(s.attackDeck, other.attackDeck); assert.deepEqual(s.eventDeck, other.eventDeck);
    assert.deepEqual(s.secret.carnomorphAdaptations, other.secret.carnomorphAdaptations);
    assert.equal(s.bag.length, 6); assert.equal(s.nestEggs, 8);
    assert.equal(s.attackDeck.length, 20); assert.equal(new Set(s.attackDeck).size, 20);
    assert.equal(s.eventDeck.length, 20); assert.equal(new Set(s.eventDeck).size, 20);
    assert.equal(s.mutationDeck.length, 12); assert.equal(s.weaknessMode, false); assert.equal(s.secret.weaknesses, undefined);
    assert.deepEqual(s.adaptations, []); assert.deepEqual(s.carnomorphAdaptations, { shambler: null, breeder: null, butcher: null });
    assert.ok(!JSON.stringify(viewFor(s, null)).includes(s.secret.carnomorphAdaptations.breeder));
    assert.throws(() => initCarnomorphPack({ enemySet: 'redux' }), /requires/);
});

test('declining Predictable Movements keeps the original danger result after save and restore', () => {
    let s = carnoState(), p = s.players[0]; s.phase = 'setup'; s.enemySet = 'carnomorphs';
    s.secret.carnomorphAdaptations.shambler = 'substitution';
    const exit = s.ship.rooms[p.room].exits[0], door = s.ship.corridors[exit.corridor]; door.door = 'closed';
    const it = spawnCarnomorph(s, 'shambler', exit.to);
    p.hand = ['field.predictableMovements#0']; s.pendingRoll = { die: 'noise', value: 'danger' };
    next(s, { op: 'noise.roll', player: p.id, room: p.room }); run(s);
    assert.match(s.prompt.title, /Предсказуемые движения/); const rollCount = s.rollSeq;
    s = JSON.parse(JSON.stringify(s)); assert.ok(answer(s, 0, s.prompt.id, 'no'));
    assert.equal(s.prompt, null); assert.equal(s.rollSeq, rollCount);
    assert.equal(s.intruders[it.uid].room, s.players[0].room);
    assert.equal(s.ship.corridors[exit.corridor].door, 'closed');
});

test('declining Motion Scanner reroll keeps the original result without another dice prompt', () => {
    const s = carnoState(), p = s.players[0]; s.phase = 'setup'; s.enemySet = 'carnomorphs';
    const c = corridorsOf(s, p.room).find(c => c.id !== 'tech');
    p.items.push({ uid: 'scanner', item: 'motionScanner' }); p.hand = ['soldier.rest#0'];
    s.pendingRoll = { die: 'noise', value: c.nums[0] };
    next(s, { op: 'noise.roll', player: p.id, room: p.room }); run(s);
    assert.match(s.prompt.title, /Сканер движения/); const rollCount = s.rollSeq;
    assert.ok(answer(s, p.id, s.prompt.id, 'no')); assert.equal(s.prompt, null);
    assert.equal(s.rollSeq, rollCount); assert.equal(s.ship.corridors[c.id].noise, true);
});

import { adaptationSlots, toughnessText } from '../client/carnomorph-ui.mjs';
import { attackEffectText } from '../shared/engine/combat.mjs';

test('Carnomorph HUD distinguishes revealed, hidden and removed adaptations without secret identities', () => {
    const s = carnoState();
    s.secret.carnomorphAdaptations = { shambler: 'agility', breeder: 'fireResistance', butcher: 'tentacles' };
    s.carnomorphAdaptations = { shambler: 'agility', breeder: null, butcher: null };
    s.carnomorphRemoved = ['butcher'];
    for (const viewer of [null, 0, 1]) {
        const slots = adaptationSlots(viewFor(s, viewer));
        assert.deepEqual(slots.map(x => x.status), ['open', 'hidden', 'removed']);
        assert.equal(slots[0].name, 'Проворность');
        assert.equal(slots[1].name, null); assert.equal(slots[2].name, null);
        assert.ok(!JSON.stringify(slots).includes('fireResistance'));
        assert.ok(!JSON.stringify(slots).includes('tentacles'));
    }
});

test('Carnomorph card presentation describes misses and exposes the correct toughness check', () => {
    const card = CARNOMORPH_ATTACK_CARDS[2];
    assert.match(attackEffectText(card, 'shambler'), /не попала/);
    assert.equal(attackEffectText(card, 'breeder'), card.text);
    assert.equal(toughnessText(card), 'Стойкость — глодатель: 2; остальные: отступление.');
    const s = carnoState(); s.enemySet = 'carnomorphs';
    const it = spawnCarnomorph(s, 'shambler', '002');
    s.attackDeck = ['carnoAttack3']; s.fx = [];
    assert.equal(carnPowerCheck(s, it, 1).result, 'retreat');
    const effect = s.fx.find(x => x.check);
    assert.equal(effect.card, 'carnoAttack3');
    assert.match(effect.effect, /урон 1 · стрелка → отступление/);
});

import fs from 'node:fs';
import { CARNOMORPH_MUTATIONS } from '../shared/data/carnomorphs.mjs';

test('Carnomorph art lookup covers every physical event, attack and mutation without changing Redux', async () => {
    // cards.js is a browser module; rewrite its single absolute import for Node without changing it on disk.
    const src = fs.readFileSync(new URL('../client/cards.js', import.meta.url), 'utf8')
        .replace("'/shared/data/cards.mjs'", JSON.stringify(new URL('../shared/data/cards.mjs', import.meta.url).href));
    const { eventArt, attackArt } = await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));
    const exists = path => assert.ok(fs.existsSync(new URL('../client/' + path, import.meta.url)), path);
    for (const c of CARNOMORPH_EVENT_CARDS) exists(eventArt(c.id));
    for (const c of CARNOMORPH_ATTACK_CARDS) exists(attackArt(c.id));
    for (const key of Object.keys(CARNOMORPH_MUTATIONS)) exists('art/carnomorph/mutation/' + key + '.jpg');
    assert.equal(eventArt('breakingIn'), 'art/events/breakingIn.jpg');
    assert.equal(attackArt('claws1'), 'art/attack/claws.jpg');
    assert.equal(attackArt('carnoAttack21'), null); assert.equal(eventArt('carnoEvent0'), null);
});

test('Carnomorph event face and acknowledgement include movement and adapted effect', () => {
    const s = carnoState(); s.enemySet = 'carnomorphs'; s.ui.eventAck = true;
    s.fx = []; s.queue = []; s.prompt = null;
    OPS['event.reveal'](s, { id: 'carnoEvent8' });
    const text = s.fx.find(f => f.type === 'event').text;
    assert.match(text, /Движение: Мясник — коридор 2/);
    assert.match(text, /тяжёлым объектом/);
    assert.equal(s.prompt.text, text);
});

test('ravenous feeds from floor objects or nest eggs in combat, without taking carried objects',()=>{
    for(const food of ['floor','nest','carried']){
        const s=carnoState(),p=s.players[0],r='002';p.room=r;
        const it=spawnCarnomorph(s,'shambler',r);it.hits=2;
        s.carnomorphAdaptations={shambler:'ravenous'};
        if(food==='floor')s.roomState[r].objects.push({type:'egg'});
        if(food==='nest'){s.roomState[r].tile='nest';s.roomState[r].explored=true;s.nestEggs=3;}
        if(food==='carried')p.heavy.push({type:'egg'});
        OPS['carnomorph.phaseAct'](s,{intruder:it.uid});
        assert.equal(it.type,food==='carried'?'shambler':'breeder');
        assert.equal(it.hits,food==='carried'?2:0);
        if(food==='floor')assert.equal(s.roomState[r].objects.length,0);
        if(food==='nest')assert.equal(s.nestEggs,2);
        if(food==='carried')assert.deepEqual(p.heavy,[{type:'egg'}]);
        assert.equal(s.queue[0].op,'attack');
    }
});

test('protective armor is not offered on a missed Shambler attack', () => {
    const s=carnoState(),p=s.players[0];s.enemySet='carnomorphs';p.hand=[];p.armor={item:'armor'};
    const it=spawnCarnomorph(s,'shambler',p.room);s.carnomorphAdaptations.shambler=null;
    OPS.attack(s,{player:p.id,intruder:it.uid,cardId:'carnoAttack3',noReaction:true,context:'phase'});
    assert.equal(s.prompt,null);assert.ok(p.armor);
});

test('Carnomorph attack IDs point to physical effects and both printed toughness values',()=>{
    const sheet=[['vomit',3,4],['vomit',2,5],['powerful',2,'retreat'],['powerful','retreat',5],['devour',1,5],['multiply','retreat',7],['multiply',1,4],['bite',1,8],['devour','retreat',3],['bite',3,6],['bite',1,5],['bite',2,4],['lash',1,4],['lash',1,8],['lash',1,'retreat'],['lash',3,7],['lash','retreat','retreat'],['scratch',2,'retreat'],['scratch',1,3],['scratch',1,6]];
    assert.equal(new Set(CARNOMORPH_ATTACK_CARDS.map(c=>c.sheetIndex)).size,20);
    for(const card of CARNOMORPH_ATTACK_CARDS)assert.deepEqual(sheet[card.sheetIndex],[card.effect,card.metagorger,card.other],card.id);
});

test('Carnomorph airlock failure stops when the ship is destroyed',()=>{
    const s=carnoState(); s.enemySet='carnomorphs';
    for(const [id,tile] of [['002','evacA'],['003','evacB']]){s.roomState[id].tile=tile;s.roomState[id].explored=true;s.roomState[id].malfunction=false;}
    s.malfLeft=0;
    OPS['carnomorph.eventEffect'](s,{id:'carnoEvent9'});
    assert.equal(s.shipDestroyed,true);assert.equal(s.roomState['003'].malfunction,false);
    assert.deepEqual(s.queue,[{op:'game.end'}]);
});
