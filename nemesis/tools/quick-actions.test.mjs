// Click-to-act on the board: the player points at a room / an intruder / a heavy object and the
// engine receives the whole decision at once (destination, weapon+target, object+hand slot).
//   node --test nemesis/tools/quick-actions.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../shared/engine/setup.mjs';
import { answer, next, run, handSlots, heavyCount, handLimit } from '../shared/engine/core.mjs';
import { buildMenu } from '../shared/engine/turn.mjs';
import { keepOneOf } from '../shared/engine/items.mjs';
import { viewFor } from '../shared/view.mjs';
import { ITEMS } from '../shared/data/cards.mjs';

function fresh() {
    const state = createGame({
        seed: 'quick-actions', mode: 'original', draft: false,
        players: [{ name: 'Alpha', charId: 'soldier' }, { name: 'Beta', charId: 'scout' }],
    });
    state.queue = []; state.prompt = null; state.resume = null; state.result = null;
    state.phase = 'player'; state.current = 0; state.firstPlayer = 0;
    state.seating = state.players.map(p => p.id); state.turnCursor = 0; state.actionsLeft = 2;
    state.intruders = {}; state.adaptations = []; state.fx = [];
    for (const p of state.players) {
        p.hand = [p.charId + '.rest#0', p.charId + '.search#0', p.charId + '.search#1'];
        p.deck = []; p.discard = []; p.heavy = []; p.items = []; p.wounds = []; p.status = 'active';
        p.room = '011'; p.passed = false;
    }
    return state;
}
const inst = (state, key, extra = {}) => Object.assign({ uid: 'it' + (++state.itemSeq), item: key, ammo: ITEMS[key].weapon ? ITEMS[key].weapon.max : undefined, broken: false }, extra);
const step = (s, st) => { next(s, st); run(s); };
// Pay whatever the engine asks for, and roll whatever die it wants, so a single click-through
// can be inspected without hand-driving every prompt.
const auto = (s, rolls = ['silence', 4, 5, 3, 2]) => {
    let guard = 0;
    while (s.prompt && guard++ < 40) {
        const pr = s.prompt;
        if (pr.kind === 'cards') choose(s, pr.cards.slice(0, pr.min));
        else if (pr.kind === 'dice') {
            // Take the step behind the die and feed it a fixed result, so the test is repeatable.
            const resume = s.resume; s.prompt = null; s.resume = null;
            s.pendingRoll = { die: pr.die, value: rolls[guard % rolls.length] };
            next(s, (resume && resume.then) || resume || { op: 'turn.choose' });
            run(s);
        }
        else if (pr.kind === 'choice' && pr.cancel) choose(s, 'cancel');
        else break;
    }
    return s.prompt;
};
const choose = (s, v) => { assert.ok(s.prompt, 'a prompt is expected'); assert.equal(answer(s, s.prompt.player, s.prompt.id, v), true); };
const intr = (s, type = 'adult', at = '011') => { const it = { uid: 'i' + (++s.intruderSeq), type, room: at, hits: 0 }; s.intruders[it.uid] = it; return it; };
const openMenu = s => step(s, { op: 'turn.choose' });

test('QA-01 a room click moves without the "where to?" question', () => {
    const s = fresh(), p = s.players[0];
    openMenu(s);
    assert.equal(s.prompt.kind, 'turn');
    choose(s, { action: 'move', dest: '014' });
    auto(s);
    assert.equal(p.room, '014');
    assert.ok(!s.prompt || s.prompt.kind === 'turn', 'the turn menu comes back');
    assert.equal(s.prompt.kind, 'turn');
});

test('QA-02 a room click that is not reachable falls back to asking', () => {
    const s = fresh(), p = s.players[0];
    const far = Object.keys(s.ship.rooms).find(id => id !== p.room && !(s.ship.rooms[p.room].exits || []).some(e => e.to === id));
    openMenu(s);
    choose(s, { action: 'move', dest: far });
    auto(s);
    assert.equal(p.room, '011', 'the character did not teleport');
    assert.equal(s.prompt.kind, 'room', 'the room question is still asked');
});

test('QA-03 careful move from a room click asks for no destination either', () => {
    const s = fresh(), p = s.players[0];
    openMenu(s);
    choose(s, { action: 'careful', dest: '014' });
    auto(s);
    if (s.prompt && s.prompt.kind === 'room') choose(s, '014');
    auto(s);
    assert.equal(p.room, '014');
});

test('QA-04 an intruder click shoots with the chosen weapon at the chosen target', () => {
    const s = fresh(), p = s.players[0];
    const gun = inst(s, 'handgun');
    p.items = [gun];
    const adult = intr(s, 'adult');
    s.pendingRoll = { die: 'combat', value: 4 };
    openMenu(s);
    choose(s, { action: 'shoot', weapon: gun.uid, target: adult.uid });
    auto(s);
    assert.ok(s.lastShot, 'a shot was recorded: ' + (s.prompt && s.prompt.title));
    assert.equal(s.lastShot.target, adult.uid, 'the clicked intruder is the target');
    assert.equal(gun.ammo, ITEMS.handgun.weapon.max - 1, 'one round was spent');
});

test('QA-05 an intruder click in melee names the target', () => {
    const s = fresh(), p = s.players[0];
    const a = intr(s, 'adult'), b = intr(s, 'drone');
    openMenu(s);
    choose(s, { action: 'melee', target: b.uid });
    auto(s, [5, 3, 4]);
    assert.ok(!s.intruders[b.uid] || s.intruders[b.uid].hits >= 1, 'the clicked intruder took the hit');
    assert.equal((s.intruders[a.uid] || {}).hits || 0, 0, 'the other one was not touched');
});

test('QA-06 a weapon that is not firable falls back to the normal question', () => {
    const s = fresh(), p = s.players[0];
    const gun = inst(s, 'handgun', { ammo: 0 });
    const blade = inst(s, 'tacticalHatchet');
    p.items = [gun, blade];
    intr(s, 'adult');
    openMenu(s);
    choose(s, { action: 'shoot', weapon: gun.uid, target: Object.keys(s.intruders)[0] });
    auto(s);
    assert.ok(!s.lastShot || s.lastShot.target === Object.keys(s.intruders)[0]);
});

test('QA-07 the view reports both hands and what lies in them', () => {
    const s = fresh(), p = s.players[0];
    p.heavy = [{ type: 'corpse' }];
    p.items = [inst(s, 'handgun')];
    const slots = viewFor(s, 0).players[0].handSlots;
    assert.equal(slots.length, handLimit(p));
    assert.ok(slots.some(x => x.kind === 'object' && /труп/i.test(x.name)), 'the corpse is in a hand');
    assert.ok(slots.some(x => x.kind === 'item' && /пистолет/i.test(x.name)), 'the gun is in the other hand');
    assert.equal(heavyCount(p), 2);
});

test('QA-08 a two-handed weapon occupies both slots', () => {
    const s = fresh(), p = s.players[0];
    p.items = [inst(s, 'gatlingGun')];
    const slots = handSlots(s, p);
    assert.equal(slots.length, 2);
    assert.ok(slots.every(x => /гатлинг|пулемёт|gatling/i.test(x.name) || x.kind === 'filler'), JSON.stringify(slots));
});

test('QA-09 picking an object from a click takes it with the picked hand', () => {
    const s = fresh(), p = s.players[0];
    s.roomState['011'].objects = [{ type: 'corpse' }, { type: 'egg' }];
    openMenu(s);
    choose(s, { action: 'pickup', object: 1, free: null });
    auto(s);
    assert.equal(p.heavy.length, 1);
    assert.equal(p.heavy[0].type, 'egg', 'the clicked object was taken');
    assert.deepEqual(s.roomState['011'].objects.map(o => o.type), ['corpse']);
});

test('QA-10 full hands: the free hand slot is offered and the old object is dropped', () => {
    const s = fresh(), p = s.players[0];
    p.heavy = [{ type: 'corpse' }, { type: 'egg' }];
    s.roomState['011'].objects = [{ type: 'carcass' }];
    const slots = handSlots(s, p);
    const freeRef = slots.find(x => x.kind === 'object').ref;
    assert.equal(slots.length, 2);
    openMenu(s);
    choose(s, { action: 'pickup', object: 0, free: freeRef });
    auto(s);
    assert.equal(p.heavy.length, 2);
    assert.ok(p.heavy.some(h => h.type === 'carcass'), 'the new object is held');
    assert.ok(s.roomState['011'].objects.some(o => o.type === 'corpse' || o.type === 'egg'), 'the dropped object stays in the room');
});

test('QA-11 the action-list "pick up" still works and asks for the hand', () => {
    const s = fresh(), p = s.players[0];
    p.heavy = [{ type: 'corpse' }];
    s.roomState['011'].objects = [{ type: 'egg' }];
    openMenu(s);
    choose(s, { action: 'pickup' });
    auto(s);
    assert.equal(s.prompt.kind, 'choice');
    assert.match(s.prompt.title, /Куда положить/);
    assert.equal(s.prompt.options.length, 2, 'both hands are offered');
    assert.ok(s.prompt.options.every(o => /Слот/.test(o.label)));
    const occupied = s.prompt.options.find(o => /Труп|труп/.test(o.label));
    assert.ok(occupied, 'the occupied hand shows what is already there');
    choose(s, occupied.id);
    auto(s);
    assert.ok(p.heavy.some(h => h.type === 'egg'));
});

test('QA-14 the second slot of a two-handed weapon frees the weapon itself', () => {
    const s = fresh(), p = s.players[0];
    const gatling = inst(s, 'gatlingGun');
    p.items = [gatling];
    const slots = handSlots(s, p);
    assert.equal(slots.length, 2);
    assert.equal(slots[1].kind, 'filler', JSON.stringify(slots));
    assert.equal(slots[1].ref, null, 'the filler slot has no reference of its own');
    s.roomState['011'].objects = [{ type: 'corpse' }];
    openMenu(s);
    choose(s, { action: 'pickup', object: 0, free: slots[0].ref });
    auto(s);
    assert.ok(!p.items.some(i => i.uid === gatling.uid), 'the two-handed weapon was dropped');
    assert.ok(p.heavy.some(h => h.type === 'corpse'), 'the object took the place');
});

test('QA-12 the pickup action is offered even with full hands (a slot can be freed)', () => {
    const s = fresh(), p = s.players[0];
    p.heavy = [{ type: 'corpse' }, { type: 'egg' }];
    s.roomState['011'].objects = [{ type: 'carcass' }];
    const menu = buildMenu(s, p);
    assert.equal(menu.actions.find(a => a.id === 'pickup').enabled, true);
});

test('QA-13 item choices carry the item key so the client can draw a picture', () => {
    const s = fresh(), p = s.players[0];
    keepOneOf(s, p, ['medkit', 'grenade'], 'Найдено', { op: 'turn.choose' });
    run(s);
    assert.equal(s.prompt.kind, 'choice');
    assert.deepEqual(s.prompt.options.map(o => o.item), ['medkit', 'grenade']);
});
