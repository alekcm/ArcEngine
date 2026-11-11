import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../shared/engine/setup.mjs';
import { viewFor } from '../shared/view.mjs';
import { VOID_TYPES, VOID_ATTACK_CARDS, VOID_EVENT_CARDS, VOID_PANIC_CARDS, VOID_WEAKNESSES } from '../shared/data/voidseeders.mjs';
import { initVoidseeders, addVoidToken, returnVoidTokenToSupply, alterMadness, infectMadness, revealVoidWeakness,
    encounterVoidType, spawnVoid, killVoid, voidPowerCheck, dissipateVoid } from '../shared/engine/voidseeders.mjs';
import { moveIntrudersByCorridor, repelIntruder } from '../shared/engine/intruders.mjs';

function fresh(seed = 'void-test') {
    const s = createGame({ seed, draft: false, players: [{ name: 'A', charId: 'soldier' }, { name: 'B', charId: 'scout' }] });
    s.enemySet = 'voidseeders'; s.queue = []; s.prompt = null; s.resume = null; s.intruders = {};
    for (const r of Object.values(s.roomState)) r.objects = [];
    initVoidseeders(s);
    return s;
}
const tokenCount = s => [...s.bag.filter(t => t && t.id), ...s.voidSupply];

test('Voidseeder decks match the 20 physical attacks, panic and event cards', () => {
    for (const deck of [VOID_ATTACK_CARDS, VOID_PANIC_CARDS, VOID_EVENT_CARDS]) {
        assert.equal(deck.length, 20); assert.equal(new Set(deck.map(c => c.id)).size, 20);
    }
    assert.deepEqual(VOID_ATTACK_CARDS.map(c => c.toughness), [6,2,2,2,4,5,3,3,5,4,4,'retreat',5,6,4,'retreat','retreat',2,3,4]);
    assert.deepEqual(VOID_PANIC_CARDS.map(c => c.level), [2,3,2,2,3,3,3,3,3,3,2,2,2,2,3,3,5,5,2,4]);
    assert.equal(Object.keys(VOID_WEAKNESSES).length, 8);
    assert.deepEqual(VOID_EVENT_CARDS[0].move, { type: 'corridor', num: 4, types: ['whisperer', 'creeper'] });
    assert.deepEqual(VOID_EVENT_CARDS[19].move, { type: 'corridor', num: 3, types: ['whisperer', 'creeper'] });
});

test('setup is deterministic, limited, JSON-safe, secret and still unavailable publicly', () => {
    const a = fresh('deterministic'), b = fresh('deterministic');
    assert.deepEqual(a.bag, b.bag); assert.deepEqual(a.secret.voidWeaknesses, b.secret.voidWeaknesses);
    assert.deepEqual(a.attackDeck, b.attackDeck); assert.deepEqual(a.eventDeck, b.eventDeck); assert.deepEqual(a.voidPanicDeck, b.voidPanicDeck);
    assert.equal(tokenCount(a).length, 17); assert.equal(new Set(tokenCount(a).map(t => t.id)).size, 17);
    assert.deepEqual(a.players.map(p => p.madness), [1, 1]); assert.equal(a.nestEggs, 5);
    const view = viewFor(JSON.parse(JSON.stringify(a)), null);
    assert.deepEqual(view.voidWeaknesses, []); assert.equal(view.decks.panic, 20);
    for (const id of Object.values(a.secret.voidWeaknesses)) assert.ok(!JSON.stringify(view).includes(id), id);
});

test('madness floor, death, infection, and calm exception behave independently', () => {
    const s = fresh(), p = s.players[0], q = s.players[1];
    p.madness = 3; assert.equal(alterMadness(s, p, -1).level, 3);
    p.madness = 5; infectMadness(s, p); assert.equal(p.status, 'active');
    assert.equal(alterMadness(s, p, 1).dead, true); assert.equal(p.status, 'dead');
    q.madness = 3; s.secret.voidWeaknesses.madness = 'calmWave';
    assert.equal(revealVoidWeakness(s, 'madness'), true); assert.equal(q.madness, 2);
    assert.equal(revealVoidWeakness(s, 'madness'), false); assert.deepEqual(s.voidWeaknesses, ['calmWave']);
});

test('numbered tokens are conserved between the bag and supply', () => {
    const s = fresh(), initial = tokenCount(s).map(t => t.id).sort();
    const tok = s.bag.splice(s.bag.findIndex(t => t && t.id), 1)[0];
    returnVoidTokenToSupply(s, tok); addVoidToken(s);
    assert.deepEqual(tokenCount(s).map(t => t.id).sort(), initial);
    while (s.voidSupply.length) addVoidToken(s);
    assert.equal(addVoidToken(s), null);
    assert.deepEqual(tokenCount(s).map(t => t.id).sort(), initial);
});

test('encounter rank follows madness, blurred visions and model shortages', () => {
    const s = fresh(), p = s.players[0];
    assert.deepEqual([1,2,3,4,5].map(n => { p.madness = n; return encounterVoidType(s, p); }), ['lurker','whisperer','whisperer','creeper','despoiler']);
    s.voidWeaknesses.push('blurredVisions'); p.madness = 2; assert.equal(encounterVoidType(s, p), 'lurker');
    p.madness = 3; assert.equal(encounterVoidType(s, p), 'whisperer');
    spawnVoid(s, 'creeper', '002');
    assert.equal(spawnVoid(s, 'creeper', '002', true).type, 'whisperer');
    for (let n = 0; n < 3; n++) spawnVoid(s, 'whisperer', '002');
    assert.equal(spawnVoid(s, 'creeper', '002', true).type, 'lurker');
    s.voidDespoilerDead = true;
    assert.equal(spawnVoid(s, 'despoiler', '002', true).type, 'lurker');
    assert.equal(spawnVoid(s, 'despoiler', '002'), null);
});

test('lairs drop carcasses; the third destroyed lair permanently destroys the Despoiler', () => {
    const s = fresh(), d = spawnVoid(s, 'despoiler', '002');
    const lairs = [spawnVoid(s, 'lair', '002'), spawnVoid(s, 'lair', '003'), spawnVoid(s, 'lair', '004')];
    assert.equal(spawnVoid(s, 'lair', '005'), null);
    assert.equal(killVoid(s, d), false);
    assert.equal(killVoid(s, lairs[0]), true); assert.ok(s.intruders[d.uid]);
    assert.equal(spawnVoid(s, 'lair', '005'), null, 'destroyed lair miniature cannot return');
    killVoid(s, lairs[1]); killVoid(s, lairs[2]);
    assert.equal(s.voidLairsDestroyed, 3); assert.equal(s.voidDespoilerDead, true);
    assert.equal(s.intruders[d.uid], undefined); assert.equal(spawnVoid(s, 'despoiler', '002'), null);
    assert.deepEqual(['002','003','004'].map(id => s.roomState[id].objects.map(o => o.type)), [['carcass'], ['carcass'], ['carcass']]);
    assert.equal(s.roomState['002'].objects.length, 1, 'the Despoiler left no carcass');
});

test('toughness checks use low, single and high values; cards are drawn and discarded', () => {
    for (const [type, hits, expected] of [['lurker', 2, 'killed'], ['whisperer', 2, 'killed'], ['creeper', 2, 'survived'], ['lair', 2, 'survived'], ['despoiler', 100, 'survived']]) {
        const s = fresh(), it = spawnVoid(s, type, '002');
        s.attackDeck = ['voidAttack2', 'voidAttack1']; s.attackDiscard = [];
        const res = voidPowerCheck(s, it, hits);
        assert.equal(res.result, expected, type); assert.equal(res.cards.length, ['lurker','creeper','lair'].includes(type) ? 2 : 1);
        assert.equal(it.hits, type === 'despoiler' ? 0 : hits);
        assert.equal(s.attackDiscard.length, res.cards.length);
    }
});

test('retreat arrow overrides numeric values, lairs stay put, and closed doors work correctly', () => {
    for (const type of [...VOID_TYPES, 'lair']) {
        const s = fresh(), it = spawnVoid(s, type, '002');
        const e = s.ship.rooms['002'].exits[0], c = s.ship.corridors[e.corridor]; c.door = 'closed';
        s.attackDeck = ['voidAttack12', 'voidAttack2']; s.attackDiscard = [];
        const res = voidPowerCheck(s, it, 20);
        assert.equal(res.result, type === 'lair' ? 'survived' : 'retreat', type);
        assert.equal(it.room, type === 'lair' ? '002' : e.to); assert.equal(c.door, 'closed');
    }
    const s = fresh(), it = spawnVoid(s, 'whisperer', '002');
    const e = s.ship.rooms['002'].exits[0]; s.ship.corridors[e.corridor].door = 'closed';
    s.voidWeaknesses = ['solidBulkheads']; assert.equal(repelIntruder(s, it), false);
    assert.equal(it.room, '002'); assert.equal(s.ship.corridors[e.corridor].door, 'destroyed');
});

test('dissipation respects adjacent players behind doors, leaves lairs and adds physical tokens', () => {
    const s = fresh(), p = s.players[0], q = s.players[1];
    const far = Object.keys(s.ship.rooms).find(id => !s.ship.rooms[id].exits.some(e => e.to === p.room));
    const adjacent = s.ship.rooms[far].exits[0].to; p.room = adjacent; q.room = adjacent;
    const c = s.ship.corridors[s.ship.rooms[far].exits[0].corridor]; c.door = 'closed';
    const w = spawnVoid(s, 'whisperer', far), lair = spawnVoid(s, 'lair', far);
    assert.ok(!dissipateVoid(s).includes(w.uid));
    p.room = q.room = Object.keys(s.ship.rooms).find(id => id !== far && !s.ship.rooms[far].exits.some(e => e.to === id));
    const total = tokenCount(s).length, before = s.bag.length;
    assert.deepEqual(dissipateVoid(s), [w.uid]); assert.ok(s.intruders[lair.uid]);
    assert.equal(s.bag.length, before + 1); assert.equal(tokenCount(s).length, total);
    for (const e of s.ship.rooms[far].exits) assert.equal(s.ship.corridors[e.corridor].noise, true);
});

test('nightmare event movement ignores a closed door and never moves a lair', () => {
    const s = fresh(), p = s.players[0], q = s.players[1]; p.room = q.room = '011';
    const room = Object.keys(s.ship.rooms).find(id => id !== p.room && s.ship.rooms[id].exits.length);
    const e = s.ship.rooms[room].exits[0], num = (e.nums || [e.num])[0];
    s.ship.corridors[e.corridor].door = 'closed';
    const it = spawnVoid(s, 'lurker', room), lair = spawnVoid(s, 'lair', room);
    moveIntrudersByCorridor(s, num); assert.equal(it.room, e.to); assert.equal(lair.room, room);
    assert.equal(s.ship.corridors[e.corridor].door, 'closed');
});

import { OPS, run, next, bagTokenMeaning } from '../shared/engine/core.mjs';
import { panicSupported } from '../shared/engine/void-panic.mjs';
import { dealHits } from '../shared/engine/combat.mjs';
import { seedFromString, shuffle } from '../shared/rng.mjs';

test('final Nightmare check caps madness without killing until its card check', () => {
    const s = fresh(), p = s.players[0]; s.phase = 'setup'; s.voidEnd = { reasons: {}, destination: null };
    p.madness = 3; p.hand = ['contam#a']; p.deck = []; p.discard = []; s.secret.contamInfected['contam#a'] = false;
    OPS['game.voidFinal'](s, { index: 0 });
    assert.equal(p.madness, 4); assert.equal(p.status, 'active'); assert.deepEqual(p.hand, ['contam#a']);
    s.queue = []; p.madness = 5;
    OPS['game.voidFinal'](s, { index: 0 });
    assert.equal(p.status, 'dead'); assert.match(s.voidEnd.reasons[p.id], /финальной проверки безумия/);
});

test('mental resilience changes the final draw to 3 without leaking hidden infection results', () => {
    const cards = ['soldier.rest#0','soldier.search#0','soldier.repairs#0','contam#hidden'];
    const seed = Array.from({ length: 200 }, (_, i) => seedFromString(String(i))).find(rng => {
        const h = { rng }; return shuffle(h, [...cards])[3] === 'contam#hidden';
    });
    assert.ok(seed !== undefined);
    for (const resilient of [false, true]) {
        const s = fresh(), p = s.players[0]; s.phase = 'setup'; s.voidEnd = { reasons: {}, destination: null };
        s.rng = seed; p.madness = 5; p.hand = cards.slice(0, 2); p.deck = cards.slice(2, 3); p.discard = cards.slice(3);
        s.secret.contamInfected['contam#hidden'] = false;
        s.voidWeaknesses = resilient ? ['mentalResilience'] : [];
        OPS['game.voidFinal'](s, { index: 0 });
        assert.equal(p.hand.length, resilient ? 3 : 4);
        assert.equal(p.status, resilient ? 'active' : 'dead');
    }
});

test('drawn Voidseeder token labels are pack-specific', () => {
    const s = fresh();
    assert.match(bagTokenMeaning(s, 'blank'), /кошмаров/);
    assert.match(bagTokenMeaning(s, { madness: 0 }), /безумия/);
    assert.match(bagTokenMeaning(s, { id: 'nightmare-1', value: 3 }), /значением 3/);
});

import '../shared/engine/void-panic.mjs';
import { answer } from '../shared/engine/core.mjs';
function panic(s, id, player = 0) {
    s.phase = 'setup'; s.queue = []; s.prompt = null; s.resume = null;
    s.voidPanicDeck = [id]; s.voidPanicDiscard = [];
    next(s, { op: 'void.panic', player }); run(s);
}

test('panic threshold and inapplicable effects increase madness, including lethal overflow', () => {
    const s = fresh(), p = s.players[0]; p.madness = 1;
    panic(s, 'voidPanic4'); assert.equal(p.madness, 2); assert.equal(s.roomState[p.room].malfunction, false);
    p.madness = 5; s.roomState[p.room].fire = true;
    panic(s, 'voidPanic9'); assert.equal(p.status, 'dead');
});

test('a companion can interrupt a panic effect, without increasing madness', () => {
    let s = fresh(); const p = s.players[0], q = s.players[1];
    p.madness = 3; q.room = p.room; q.hand = ['scout.interruption#0'];
    panic(s, 'voidPanic9');
    assert.equal(s.prompt.player, q.id); assert.equal(s.prompt.reaction, true);
    s = JSON.parse(JSON.stringify(s));
    assert.equal(answer(s, q.id, s.prompt.id, 'yes'), true);
    assert.equal(s.roomState[p.room].fire, false); assert.equal(s.players[0].madness, 3);
    assert.equal(s.players[1].hand.length, 0); assert.ok(s.players[1].discard.includes('scout.interruption#0'));
});

test('panic card selections are private, survive JSON, and discard only the selected weapon ammunition', () => {
    let s = fresh(), p = s.players[0]; p.madness = 3;
    p.items.push({ uid: 'second-gun', item: 'handgun', ammo: 2 });
    panic(s, 'voidPanic5');
    assert.equal(s.prompt.kind, 'choice'); assert.equal(s.prompt.secret, true);
    assert.equal(viewFor(s, 1).prompt.options, undefined);
    s = JSON.parse(JSON.stringify(s));
    assert.equal(answer(s, 0, s.prompt.id, 'second-gun'), true);
    assert.equal(s.players[0].items.find(i => i.uid === 'second-gun').ammo, 0);
    assert.ok(s.players[0].items.some(i => i.uid !== 'second-gun' && i.ammo > 0));
});

test('apathy queues each private discard and only afterwards raises the initiating player madness', () => {
    let s = fresh(), p = s.players[0], q = s.players[1]; p.madness = 2; q.room = p.room;
    p.hand = ['soldier.rest#0', 'contam#1']; q.hand = ['scout.rest#0', 'contam#2'];
    panic(s, 'voidPanic1');
    const first = s.prompt.player, second = first === 0 ? 1 : 0;
    assert.equal(viewFor(s, second).prompt.cards, undefined);
    s = JSON.parse(JSON.stringify(s));
    assert.equal(answer(s, first, s.prompt.id, [s.players[first].hand.find(c => !c.startsWith('contam#'))]), true);
    assert.equal(s.players[0].madness, 2);
    assert.equal(answer(s, second, s.prompt.id, [s.players[second].hand.find(c => !c.startsWith('contam#'))]), true);
    assert.equal(s.players[0].madness, 3);
    assert.deepEqual(s.players.map(o => o.hand), [['contam#1'], ['contam#2']]);
});

test('defeatism, self-harm and heart attack apply their printed effects', () => {
    let s = fresh(), p = s.players[0], q = s.players[1]; p.madness = 3; q.madness = 4; q.room = p.room; q.hand = [];
    panic(s, 'voidPanic10'); assert.equal(p.madness, 4); assert.equal(q.madness, 5);
    const hp = p.health; panic(s, 'voidPanic15'); assert.equal(p.health, hp - 2);
    p.madness = 5; panic(s, 'voidPanic17'); assert.equal(p.status, 'dead');
});

test('all physical panic effects have explicit handling', () => {
    for (const card of VOID_PANIC_CARDS) assert.equal(panicSupported(card), true, card.effect);
});

function inSetup(s) { s.phase = 'setup'; s.queue = []; s.prompt = null; s.resume = null; s.players.forEach(p => { p.hand = []; }); }

test('encounters return blank and madness tokens, make noise and panic the character causing encounter', () => {
    const s = fresh(), p = s.players[0]; inSetup(s); p.madness = 1;
    const token = s.bag.splice(s.bag.findIndex(t => t && t.madness === 1), 1)[0];
    s.voidPanicDeck = ['voidPanic4'];
    next(s, { op: 'encounter', player: p.id, room: p.room, token }); run(s);
    assert.equal(p.madness, 2); assert.ok(s.bag.includes(token));
    assert.equal(Object.keys(s.intruders).length, 0);
    for (const e of s.ship.rooms[p.room].exits) assert.equal(s.ship.corridors[e.corridor].noise, true);
});

test('encounter value, rank, surprise and rational-thinking weakness survive serialization', () => {
    for (const rational of [false, true]) {
        let s = fresh(), p = s.players[0]; inSetup(s); p.madness = 3; p.hand = [];
        s.voidWeaknesses = rational ? ['rationalThinking'] : [];
        const index = s.bag.findIndex(t => t && t.value >= 2), token = s.bag.splice(index, 1)[0];
        s.voidPanicDeck = ['voidPanic15'];
        s = JSON.parse(JSON.stringify(s)); p = s.players[0]; const initialHealth = p.health;
        next(s, { op: 'encounter', player: p.id, room: p.room, token }); run(s);
        assert.equal(Object.values(s.intruders)[0].type, 'whisperer');
        assert.equal(p.discard.filter(c => c.startsWith('contam#')).length, rational ? 0 : 1);
        assert.equal(p.health, initialHealth - 2);
        assert.ok(s.voidSupply.some(t => t.id === token.id));
    }
});

test('danger-reaction weakness reduces the encounter threshold but not below 1', () => {
    const s = fresh(), p = s.players[0]; inSetup(s); p.madness = 2; p.hand = ['soldier.rest#0'];
    s.voidWeaknesses = ['dangerReaction'];
    const i = s.bag.findIndex(t => t && t.value === 2), token = s.bag.splice(i, 1)[0];
    next(s, { op: 'encounter', player: p.id, room: p.room, token }); run(s);
    assert.equal(Object.values(s.intruders)[0].type, 'whisperer');
    assert.deepEqual(p.hand, ['soldier.rest#0']); assert.equal(s.voidPanicDiscard.length, 0);
});

test('bag development returns a number, adds a finite token on blank, and removes inactive player tokens', () => {
    const s = fresh(); inSetup(s);
    const i = s.bag.findIndex(t => t && t.value !== undefined), numeric = s.bag.splice(i, 1)[0];
    OPS['void.bagDevelop'](s, { token: numeric });
    assert.ok(s.bag.includes(numeric));
    assert.equal(s.queue.filter(x => x.op === 'noise.roll').length, 2); s.queue = [];
    s.bag.splice(s.bag.indexOf('blank'), 1); const before = s.voidSupply.length;
    OPS['void.bagDevelop'](s, { token: 'blank' }); assert.ok(s.bag.includes('blank')); assert.equal(s.voidSupply.length, before - 1);
    s.players[1].status = 'escaped'; const idx = s.bag.findIndex(t => t && t.madness === 1), expired = s.bag.splice(idx, 1)[0];
    OPS['void.bagDevelop'](s, { token: expired }); assert.ok(!s.bag.includes(expired)); assert.equal(s.queue[0].op, 'bag.develop');
});

test('normal Nightmare attack respects targets and attack deck does not reshuffle on a miss', () => {
    const s = fresh(), p = s.players[0]; inSetup(s); const it = spawnVoid(s, 'lurker', p.room);
    s.attackDeck = ['voidAttack1']; s.attackDiscard = [];
    next(s, { op: 'attack', intruder: it.uid, player: p.id, context: 'phase' }); run(s);
    assert.equal(p.wounds.length, 0); assert.deepEqual(s.attackDiscard, ['voidAttack1']);
    assert.match(s.log.at(-1).text, /не попала/);
});

test('nightmare division spawns identical type without scheduling an extra phase attack', () => {
    const s = fresh(), p = s.players[0]; inSetup(s); const it = spawnVoid(s, 'lurker', p.room);
    s.attackDeck = ['voidAttack7']; s.attackDiscard = [];
    next(s, { op: 'attack', intruder: it.uid, player: p.id, context: 'phase' }); run(s);
    assert.equal(Object.values(s.intruders).filter(i => i.type === 'lurker').length, 2);
    assert.equal(s.attackDiscard.length, 1); assert.equal(p.wounds.length, 0);
});

test('lair end-of-turn noise is rolled despite combat; a lair never makes an escape attack', () => {
    const s = fresh(), p = s.players[0]; inSetup(s); s.current = p.id;
    const lair = spawnVoid(s, 'lair', p.room);
    OPS['turn.end'](s); assert.equal(s.queue[0].op, 'noise.roll'); assert.equal(s.queue[0].allowCombat, true);
    s.queue = []; OPS['attack'](s, { intruder: lair.uid, player: p.id, context: 'escape' });
    assert.equal(s.queue.length, 0); assert.equal(s.prompt, null);
    OPS['noise.roll'](s, { player: p.id, room: p.room, allowCombat: true, forced: 'silence' });
    assert.match(s.log.at(-1).text, /Шум/);
});

test('three lair exploration tokens replace two malfunctions and one door deterministically', () => {
    const config = { seed: 'lair-replacement', draft: false, players: [{ name: 'A', charId: 'soldier' }, { name: 'B', charId: 'scout' }] };
    const s = createGame(config), original = { ...s.secret.tokens }; s.enemySet = 'voidseeders'; initVoidseeders(s);
    const replaced = Object.keys(original).filter(id => s.secret.tokens[id] !== original[id]);
    assert.equal(replaced.length, 3); assert.deepEqual(replaced.map(id => original[id]).sort(), ['door', 'malfunction', 'malfunction']);
    const id = replaced[0]; s.players[0].room = id; s.queue = []; s.prompt = null; s.phase = 'setup';
    OPS.explore(s, { player: 0, room: id });
    assert.ok(Object.values(s.intruders).some(it => it.type === 'lair' && it.room === id));
    assert.equal(s.roomState[id].token, null);
});

test('player attack uses Redux die effects, then checks the Nightmare attack cards for toughness', () => {
    const s = fresh(), p = s.players[0], it = spawnVoid(s, 'lurker', p.room); inSetup(s);
    s.attackDeck = ['voidAttack2', 'voidAttack3']; s.attackDiscard = [];
    assert.equal(dealHits(s, p, it, 2, 0, { forcedRoll: 6 }), true);
    assert.equal(s.intruders[it.uid], undefined); assert.deepEqual(s.attackDiscard, ['voidAttack2', 'voidAttack3']);
});

test('destroying the last lair counts as destruction even if Despoiler is not on the board', () => {
    const s = fresh(); const lairs = ['002', '003', '004'].map(id => spawnVoid(s, 'lair', id));
    const n = s.voidSupply.length;
    for (const it of lairs) killVoid(s, it);
    assert.equal(s.voidDespoilerDead, true); assert.equal(s.voidSupply.length, n - 1);
});

test('every physical Voidseeder event dispatches and retains its defined finish policy', () => {
    for (const card of VOID_EVENT_CARDS) {
        const s = fresh('event-' + card.id); inSetup(s);
        assert.doesNotThrow(() => OPS['void.eventEffect'](s, { id: card.id }), card.id);
        s.eventDeck = []; s.eventDiscard = ['voidEvent2']; s.voidEventRemoved = [];
        OPS['event.finish'](s, { id: card.id });
        if (card.finish === 'remove') { assert.ok(s.voidEventRemoved.includes(card.id)); assert.deepEqual(s.eventDeck, ['voidEvent2']); }
        else if (card.finish === 'shuffleDiscard') { assert.deepEqual(new Set(s.eventDeck), new Set(['voidEvent2', card.id])); }
        else assert.ok(s.eventDiscard.includes(card.id));
    }
});

test('event hunt crosses closed doors, skips lairs and does not make an extra attack', () => {
    const s = fresh(), p = s.players[0]; inSetup(s);
    const dest = p.room, exit = s.ship.rooms[dest].exits[0];
    s.players[1].room = dest; s.ship.corridors[exit.corridor].door = 'closed';
    const it = spawnVoid(s, 'lurker', exit.to), lair = spawnVoid(s, 'lair', exit.to);
    OPS['void.eventEffect'](s, { id: 'voidEvent7' });
    assert.equal(it.room, dest); assert.equal(lair.room, exit.to); assert.equal(s.ship.corridors[exit.corridor].door, 'closed');
    assert.equal(s.queue.filter(x => x.op === 'attack').length, 0);
});

test('event fear checks madness against hand size; panic attack scans just the five newly drawn cards', () => {
    const s = fresh(), p = s.players[0], q = s.players[1]; inSetup(s);
    p.madness = 3; p.hand = ['soldier.rest#0']; q.madness = 1; q.hand = ['scout.rest#0'];
    OPS['void.eventEffect'](s, { id: 'voidEvent14' });
    assert.equal(p.discard.filter(x => x.startsWith('contam#')).length, 1); assert.equal(q.discard.length, 0);
    p.deck = ['contam#77', 'soldier.move#0', 'soldier.shoot#0']; p.discard = [];
    s.secret.contamInfected['contam#77'] = true;
    OPS['void.eventPanicAttack'](s, { player: p.id });
    assert.equal(p.madness, 5); assert.equal(p.hand.length, 0); assert.ok(p.discard.includes('contam#77')); assert.ok(p.discard.includes('soldier.rest#0'));
});

test('event whisper reveals one event and resolves a repeated corridor noise as an encounter', () => {
    const s = fresh(), p = s.players[0]; inSetup(s); s.players[1].status = 'escaped';
    const exit = s.ship.rooms[p.room].exits[0]; const n = (exit.nums || [exit.num])[0];
    const card = VOID_EVENT_CARDS.find(c => c.move.num === n); s.eventDeck = [card.id]; s.eventDiscard = [];
    s.ship.corridors[exit.corridor].noise = true;
    OPS['void.eventEffect'](s, { id: 'voidEvent19' });
    assert.deepEqual(s.eventDiscard, [card.id]); assert.equal(s.queue[0].op, 'void.eventWhisper');
    OPS['void.eventWhisper'](s, s.queue.shift()); assert.equal(s.queue[0].op, 'encounter');
    assert.equal(s.ship.corridors[exit.corridor].noise, false);
});

test('hopelessness keeps the existing hand private and removes only a newly drawn action after restoration', () => {
    let s = fresh(), p = s.players[0]; inSetup(s); p.madness = 3; p.hand = ['soldier.rest#0'];
    p.deck = ['soldier.move#0', 'contam#88', 'soldier.shoot#0']; p.discard = [];
    panic(s, 'voidPanic2');
    assert.equal(s.prompt.kind, 'cards'); assert.deepEqual(s.prompt.cards, ['soldier.move#0', 'soldier.shoot#0']);
    assert.equal(viewFor(s, 1).prompt.cards, undefined);
    s = JSON.parse(JSON.stringify(s)); assert.equal(answer(s, 0, s.prompt.id, ['soldier.move#0']), true); p = s.players[0];
    assert.deepEqual(p.hand, ['soldier.rest#0']); assert.ok(p.removedCards.includes('soldier.move#0'));
    assert.deepEqual(new Set(p.discard), new Set(['contam#88', 'soldier.shoot#0']));
});

test('tearing bandages applies damage before awarding at most one fitting serious wound', () => {
    const cases = [
        // Wounds, health before the damage, and whether a new wound fits afterward.
        [[], 9, false], [[], 8, true], [[], 3, true],
        [['eyes'], 6, false], [['eyes'], 5, true], [['eyes'], 2, true],
        [['eyes', 'guts'], 3, false], [['eyes', 'guts'], 2, true],
    ];
    for (const id of ['voidPanic11', 'voidPanic12']) {
        const card = VOID_PANIC_CARDS.find(c => c.id === id);
        assert.match(card.text, /3\/6\/9/);
        for (const [wounds, health, fits] of cases) {
            const s = fresh(), p = s.players[0]; inSetup(s);
            p.madness = 2; p.health = health; p.wounds = wounds.slice(); p.armor = null;
            s.woundDeck = ['leg', 'body']; s.woundDiscard = [];
            panic(s, id);
            assert.equal(p.health, health - 1, `${id}: ${wounds.length} wounds, ${health} HP`);
            assert.equal(p.status, 'active');
            assert.deepEqual(p.wounds, fits ? [...wounds, 'leg'] : wounds, `${id}: ${wounds.length} wounds, ${health} HP`);
            assert.deepEqual(s.woundDeck, fits ? ['body'] : ['leg', 'body']);
        }
    }
});

test('tearing bandages does not grant a wound after lethal damage or below the panic threshold', () => {
    for (const id of ['voidPanic11', 'voidPanic12']) {
        for (const wounds of [[], ['eyes', 'guts', 'body']]) {
            const s = fresh(), p = s.players[0]; inSetup(s);
            p.madness = 2; p.health = 1; p.wounds = wounds.slice(); p.armor = null;
            s.woundDeck = ['leg'];
            panic(s, id);
            assert.equal(p.status, 'dead');
            assert.deepEqual(p.wounds, wounds);
            assert.deepEqual(s.woundDeck, ['leg']);
        }
        const s = fresh(), p = s.players[0]; inSetup(s);
        p.madness = 1; p.health = 8; p.wounds = [];
        panic(s, id);
        assert.equal(p.health, 8);
        assert.deepEqual(p.wounds, []);
        assert.equal(p.madness, 2);
    }
});

test('tearing bandages resolves wound consequences before its continuation', () => {
    const s = fresh(), p = s.players[0]; inSetup(s);
    p.madness = 2; p.health = 8; p.wounds = []; p.armor = null;
    s.woundDeck = ['arm'];
    OPS['void.panicApply'](s, { player: p.id, card: 'voidPanic11', then: { op: 'noop' } });
    assert.deepEqual(p.wounds, ['arm']);
    assert.deepEqual(s.queue.map(step => step.op), ['wound.armCheck', 'noop']);
});

test('tearing bandages can still be interrupted before damage and trauma', () => {
    const s = fresh(), p = s.players[0], q = s.players[1]; inSetup(s);
    p.madness = 2; p.health = 8; p.wounds = []; p.armor = null;
    q.room = p.room; q.hand = ['scout.interruption#0'];
    s.woundDeck = ['leg'];
    panic(s, 'voidPanic11');
    assert.equal(s.prompt.player, q.id);
    assert.equal(s.prompt.reaction, true);
    assert.equal(answer(s, q.id, s.prompt.id, 'yes'), true);
    assert.equal(p.health, 8);
    assert.deepEqual(p.wounds, []);
    assert.deepEqual(s.woundDeck, ['leg']);
    assert.equal(p.madness, 2);
});

test('sabotage omits the missing item counter', () => {
    const s = fresh(), p = s.players[0]; inSetup(s); p.madness = 2;
    panic(s, 'voidPanic13'); assert.equal(p.madness, 2); assert.match(s.log.at(-1).text, /Счётчик предметов/);
});

test('Voidseeder phase advances time before attacks and fire, and lairs do not attack', () => {
    const s = fresh(), p = s.players[0]; inSetup(s); const t = s.time;
    spawnVoid(s, 'lair', p.room); spawnVoid(s, 'lurker', p.room); spawnVoid(s, 'whisperer', p.room);
    OPS['void.phaseStart'](s);
    assert.equal(s.time, t - 1);
    assert.deepEqual(s.queue.map(x => x.op), ['attack', 'attack', 'void.phaseFire', 'phase.event']);
    assert.deepEqual(s.queue.filter(x => x.op === 'attack').map(x => s.intruders[x.intruder].type), ['whisperer', 'lurker']);
});

test('rest offers both reduction and scanning, infection resets to five without a larva', () => {
    let s = fresh(), p = s.players[0]; inSetup(s); p.madness = 4;
    p.hand = ['contam#infected', 'contam#clean']; s.secret.contamInfected['contam#infected'] = true; s.secret.contamInfected['contam#clean'] = false;
    next(s, { op: 'void.rest', player: p.id }); run(s);
    assert.ok(s.prompt.options.some(o => o.id === 'both')); assert.equal(viewFor(s, 1).prompt.options, undefined);
    s = JSON.parse(JSON.stringify(s)); assert.equal(answer(s, 0, s.prompt.id, 'both'), true); p = s.players[0];
    assert.equal(p.madness, 5); assert.equal(p.larva, false); assert.ok(p.discard.includes('contam#infected')); assert.ok(p.removedCards.includes('contam#clean'));
});

test('rest cannot reduce madness below the floor and may decline infection scanning', () => {
    const s = fresh(), p = s.players[0]; inSetup(s); p.madness = 3; p.hand = ['contam#1'];
    next(s, { op: 'void.rest', player: p.id }); run(s);
    assert.deepEqual(s.prompt.options.map(o => o.id), ['scan', 'none']);
    assert.equal(answer(s, 0, s.prompt.id, 'none'), true); assert.equal(p.madness, 3); assert.deepEqual(p.hand, ['contam#1']);
});

test('laboratory reveals the assigned weakness for a living mind at level three or higher', () => {
    const s = fresh(), p = s.players[0]; inSetup(s); p.madness = 3;
    s.secret.voidWeaknesses.madness = 'solidBulkheads';
    const before = p.knowledge; OPS['room.lab'](s, { player: p.id, answer: 'mind:0', room: p.room, then: { op: 'noop' } });
    assert.equal(p.knowledge, before + 2); assert.deepEqual(s.voidWeaknesses, ['solidBulkheads']);
    assert.equal(s.voidAnalyzed.madness, true); assert.equal(p.madness, 3);
});

test('whisper treats a shared corridor as one location, not once per character', () => {
    const s = fresh(), p = s.players[0]; inSetup(s); s.players[1].room = p.room;
    const e = s.ship.rooms[p.room].exits[0], n = (e.nums || [e.num])[0];
    s.eventDeck = [VOID_EVENT_CARDS.find(c => c.move.num === n).id];
    OPS['void.eventEffect'](s, { id: 'voidEvent19' });
    const targets = s.queue.filter(x => x.op === 'void.eventWhisper' && x.corridor === e.corridor);
    assert.equal(targets.length, 1);
});

test('instant destruction honors lair and nightmare consequences but Despoiler stays protected', () => {
    const s = fresh(), p = s.players[0]; inSetup(s);
    const w = { uid: 'grenade-test', item: 'grenadeLauncher', ammo: 1 }; p.items.push(w);
    const monster = spawnVoid(s, 'lurker', p.room), lair = spawnVoid(s, 'lair', p.room), boss = spawnVoid(s, 'despoiler', p.room);
    const n = s.voidSupply.length;
    OPS['shoot.grenade'](s, { player: p.id, weapon: w.uid, answer: p.room, then: { op: 'noop' } });
    assert.equal(s.intruders[monster.uid], undefined); assert.equal(s.intruders[lair.uid], undefined);
    assert.ok(s.intruders[boss.uid]); assert.equal(s.voidLairsDestroyed, 1);
    assert.equal(s.voidSupply.length, n - 1); assert.ok(s.roomState[p.room].objects.some(o => o.type === 'carcass'));
});

test('whisperer is the adult equivalent and containment releases one', async () => {
    const { isAdultEquivalent } = await import('../shared/engine/core.mjs');
    const s = fresh(), p = s.players[0]; inSetup(s); const id = p.room;
    OPS['room.containment'](s, { player: p.id, answer: id });
    const it = Object.values(s.intruders)[0]; assert.equal(it.type, 'whisperer'); assert.equal(isAdultEquivalent(s, it), true);
    assert.equal(isAdultEquivalent(s, { type: 'adult' }), false);
});

test('void room actions replace Redux effects: decontamination permits rest, cafeteria heals one', () => {
    const s = fresh(), p = s.players[0]; inSetup(s); p.madness = 2; p.health -= 2; p.hand = ['contam#test'];
    const hp = p.health; OPS['room.action'](s, { player: p.id, tile: 'cafeteria', then: { op: 'noop' } });
    assert.equal(p.health, hp + 1); assert.deepEqual(p.hand, ['contam#test']); assert.equal(s.queue[0].op, 'void.rest');
    s.queue = []; OPS['room.action'](s, { player: p.id, tile: 'decon', then: { op: 'noop' } });
    assert.deepEqual(p.hand, ['contam#test']); assert.equal(s.queue[0].op, 'void.rest');
});

test('airlock destroys the lair without leaving an object and does not kill Despoiler', async () => {
    const { resolveAirlocks } = await import('../shared/engine/rooms.mjs');
    const s = fresh(), p = s.players[0]; inSetup(s); p.room = '011';
    const target = Object.keys(s.ship.rooms).find(id => id !== p.room && s.ship.rooms[id].tech);
    const lair = spawnVoid(s, 'lair', target), boss = spawnVoid(s, 'despoiler', target), small = spawnVoid(s, 'lurker', target);
    for (const e of s.ship.rooms[target].exits) s.ship.corridors[e.corridor].door = 'closed';
    s.roomState[target].airlock = true;
    resolveAirlocks(s);
    assert.equal(s.intruders[lair.uid], undefined); assert.equal(s.voidLairsDestroyed, 1);
    assert.equal(s.intruders[small.uid], undefined); assert.equal(s.intruders[boss.uid], undefined);
    assert.equal(s.voidDespoilerDead, false); assert.equal(s.roomState[target].objects.length, 0);
});

test('Determination offers one reroll before shooting or melee against a lair', () => {
    for (const mode of ['shoot', 'melee']) {
        const s = fresh(), p = s.players[0], lair = spawnVoid(s, 'lair', p.room);
        s.voidWeaknesses.push('determination'); s.pendingRoll = { die: 'combat', value: 5 }; s.pendingRollPlayer = p.id;
        p.items = [{ uid: 'gun', item: 'handgun', ammo: 2 }];
        const step = mode === 'shoot' ? { op: 'shoot.fire', player: p.id, weapon: 'gun', target: lair.uid, then: { op: 'noop' } }
            : { op: 'melee.hit', player: p.id, target: lair.uid, then: { op: 'noop' } };
        OPS[step.op](s, step); assert.match(s.prompt.title, /Решительность/); assert.equal(s.resume.op, 'shoot.rerollAns');
        const reply = { ...s.resume, answer: 'keep' }; s.prompt = null; s.resume = null;
        OPS['shoot.rerollAns'](s, reply); const resolved = s.queue.shift();
        assert.equal(resolved.rerollResolved, true); assert.equal(resolved.forcedRoll, 5);
        s.attackDeck = ['voidAttack1', 'voidAttack1']; OPS[resolved.op](s, resolved);
        assert.equal(s.prompt, null); assert.equal(s.queue[0].op, 'noop'); assert.equal(lair.hits, 1);
        if (mode === 'shoot') assert.equal(p.items[0].ammo, 1);
    }
});

test('melee never offers retaliation against a surviving lair or a retreated nightmare', () => {
    for (const type of ['lair', 'whisperer']) {
        const s = fresh(), p = s.players[0], it = spawnVoid(s, type, p.room);
        p.items = [{ uid: 'gun', item: 'handgun', ammo: 2 }]; s.pendingRoll = { die: 'combat', value: 4 }; s.pendingRollPlayer = p.id;
        s.attackDeck = type === 'lair' ? ['voidAttack1', 'voidAttack1'] : ['voidAttack12'];
        OPS['melee.hit'](s, { player: p.id, target: it.uid, then: { op: 'noop' } });
        assert.equal(s.prompt, null); assert.equal(s.queue[0].op, 'noop');
        if (type === 'whisperer') assert.notEqual(it.room, p.room);
    }
});

import { checkObjective } from '../shared/engine/endgame.mjs';
import { OBJECTIVES, objectiveTextOf } from '../shared/data/cards.mjs';
test('Despoiler replaces the Queen in the two objectives, including third-lair destruction',()=>{
    const s=fresh(),p=s.players[0],trophy=OBJECTIVES.personal.trophyHunter,priority=OBJECTIVES.corporate.priorityOne;
    assert.match(objectiveTextOf(trophy,s.players,'voidseeders'),/Гнетущий должен быть убит/);
    assert.match(objectiveTextOf(priority,s.players,'voidseeders'),/Гнетущий не убит/);
    assert.equal(checkObjective(s,p,trophy,'earth'),false);assert.equal(checkObjective(s,p,priority,'earth'),true);
    for(const id of ['002','003','004'])killVoid(s,spawnVoid(s,'lair',id));
    assert.equal(s.voidDespoilerDead,true);assert.equal(checkObjective(s,p,trophy,'earth'),true);assert.equal(checkObjective(s,p,priority,'earth'),false);
});

test('protective armor is offered for a hitting Whisperer attack, not an incompatible attack card', () => {
    for (const hits of [false,true]) {
        const s=fresh(),p=s.players[0];p.hand=[];s.players[1].hand=[];p.armor={item:'armor'};
        const it=spawnVoid(s,'whisperer',p.room),card=VOID_ATTACK_CARDS.find(c=>c.targets.includes('whisperer')===hits);
        OPS.attack(s,{player:p.id,intruder:it.uid,cardId:card.id,noReaction:true,context:'phase'});
        assert.equal(!!s.prompt,hits,card.id);
        if(hits) assert.match(s.prompt.title,/Сбросить броню/);
    }
});

test('Sentinel recognizes a Nightmare attack that reduces health exactly to zero as lethal', () => {
    const s=fresh(),p=s.players[0];p.charId='bounty';p.hand=['bounty.sentinel#1'];p.laika='board';p.health=1;s.players[1].hand=[];
    const it=spawnVoid(s,'whisperer',p.room),card=VOID_ATTACK_CARDS.find(c=>c.effect==='cut'&&c.targets.includes('whisperer'));
    OPS.attack(s,{player:p.id,intruder:it.uid,cardId:card.id,noReaction:true,context:'phase'});
    assert.match(s.prompt.title,/Страж/);assert.equal(p.status,'active');
});

test('panic illustrations map stable card IDs to the matching physical sheet cells',()=>{
    const sheet=['apathy','hopelessness','madness','rage','bloodlust','hallucinations','hallucinations','bloodlust','pyromania','bandages','bandages','defeatism','selfHarm','sabotage','sabotage','selfHarm','heartAttack','heartAttack','destruction','blindFlee'];
    assert.equal(new Set(VOID_PANIC_CARDS.map(c=>c.sheetIndex)).size,20);
    for(const card of VOID_PANIC_CARDS)assert.equal(sheet[card.sheetIndex],card.effect,card.id);
});

test('attack artwork follows physical sheet effect and toughness for every stable card ID',()=>{
    const sheet=[['frenzy',6],['frenzy',2],['intimidation',4],['intimidation',2],['intimidation',2],['cut',4],['devourMind',5],['division',3],['intimidation',5],['division',3],['devourMind',4],['cut','retreat'],['cut',5],['cut',6],['bite','retreat'],['horror','retreat'],['horror',4],['bite',2],['bite',4],['bite',3]];
    assert.equal(new Set(VOID_ATTACK_CARDS.map(c=>c.sheetIndex)).size,20);
    for(const card of VOID_ATTACK_CARDS)assert.deepEqual(sheet[card.sheetIndex],[card.effect,card.toughness],card.id);
});

test('event art follows the physical sheet including movement number for stable IDs',()=>{
    const sheet=[['agoraphobia',4],['autophobia',1],['autophobia',4],['fuelExplosion',1],['neurosis',4],['systemError',2],['hunt',1],['hunt',3],['hunt',1],['aiFailure',1],['generatorOverheat',4],['podEjection',3],['fireWall',4],['fear',3],['fear',3],['whisper',3],['panicAttack',1],['panicAttack',2],['panicAttack',2],['whisper',2]];
    assert.equal(new Set(VOID_EVENT_CARDS.map(c=>c.sheetIndex)).size,20);
    for(const card of VOID_EVENT_CARDS)assert.deepEqual(sheet[card.sheetIndex],[card.effect,card.move.num],card.id);
});
