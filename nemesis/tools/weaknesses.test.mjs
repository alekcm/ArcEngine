// weaknesses.test.mjs — Intruder Weaknesses variant (the alternative to Adaptations) and the
// alternative noise die (a d10 without Encounter faces).
// Run: node --test nemesis/tools/weaknesses.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../shared/engine/setup.mjs';
import { OPS, next, run, NOISE_DIE, NOISE_DIE_SAFE } from '../shared/engine/core.mjs';
import { analyzeAdaptation } from '../shared/engine/rooms.mjs';
import { dealHits, phosphateWound } from '../shared/engine/combat.mjs';
import { repelIntruder, moveOneToward } from '../shared/engine/intruders.mjs';
import { checkObjective } from '../shared/engine/endgame.mjs';
import { viewFor } from '../shared/view.mjs';
import { WEAKNESSES, OBJECTIVES } from '../shared/data/cards.mjs';

function fresh(extra = {}) {
    const state = createGame({
        seed: 'weaknesses-2026', mode: 'original', draft: false,
        players: [{ name: 'A', charId: 'soldier' }, { name: 'B', charId: 'scout' }],
        ...extra,
    });
    state.queue = []; state.prompt = null; state.resume = null; state.result = null;
    state.phase = 'player'; state.adaptations = []; state.intruders = {}; state.fx = [];
    state.players.forEach((p, i) => { p.room = i ? '003' : '011'; p.status = 'active'; p.health = 10; p.wounds = []; });
    return state;
}
function intruder(state, type = 'adult', at = state.players[0].room, hits = 0) {
    const it = { uid: 'wk-' + (++state.intruderSeq), type, room: at, hits };
    state.intruders[it.uid] = it;
    return it;
}
function execute(state, step) { next(state, step); run(state); }

test('WK-01: setup hides 3 distinct weaknesses (corpse/carcass/egg); the view never leaks them', () => {
    const s = fresh({ weaknessMode: true });
    assert.deepEqual(s.adaptations, []);
    assert.deepEqual(s.weaknesses, []);
    const bound = s.secret.weaknesses;
    assert.deepEqual(Object.keys(bound).sort(), ['carcass', 'corpse', 'egg']);
    assert.equal(new Set(Object.values(bound)).size, 3, 'three distinct weaknesses');
    for (const k of Object.values(bound)) assert.ok(WEAKNESSES[k], 'valid weakness: ' + k);
    const v = viewFor(s, 0);
    assert.equal(v.weaknessMode, true);
    assert.deepEqual(v.weaknesses, []);
    const json = JSON.stringify(v);
    for (const k of Object.values(bound)) assert.ok(!json.includes(k), 'hidden weakness leaks to the client: ' + k);
    const plain = fresh();
    assert.equal(plain.weaknessMode, false);
    assert.equal(plain.secret.weaknesses, undefined);
});

test('WK-02: analyzing an object in the Lab reveals its bound weakness exactly once', () => {
    const s = fresh({ weaknessMode: true });
    const p = s.players[0];
    analyzeAdaptation(s, p, 'egg', { op: 'noop' });
    assert.equal(s.analyzed.egg, true);
    assert.deepEqual(s.weaknesses, [s.secret.weaknesses.egg]);
    analyzeAdaptation(s, p, 'egg', { op: 'noop' });
    assert.equal(s.weaknesses.length, 1, 'a second egg analysis reveals nothing');
    analyzeAdaptation(s, p, 'charCorpse', { op: 'noop' });   // a character's corpse is the Human Corpse
    assert.deepEqual(s.weaknesses, [s.secret.weaknesses.egg, s.secret.weaknesses.corpse]);
    assert.equal(s.analyzed.carcass, false);
});

test('WK-03: interactive noise rolls use the d10 variant (no encounters) only in variant mode', () => {
    const rollFaces = (state, n) => {
        const seen = new Set();
        for (let i = 0; i < n; i++) {
            OPS['dice.rolled'](state, { die: 'noise', player: 0, then: { op: 'noop' } });
            seen.add(state.pendingRoll.value);
            state.pendingRoll = null;
        }
        return seen;
    };
    const safe = rollFaces(fresh({ noiseVariant: true }), 400);
    assert.ok(!safe.has('encounter'), 'the variant die never rolls an encounter');
    for (const v of safe) assert.ok(NOISE_DIE_SAFE.includes(v), 'face comes from the d10: ' + v);
    assert.ok(safe.has('danger') && safe.has('silence'), 'claw marks (danger) and ✕ (silence) both occur');
    const std = rollFaces(fresh(), 400);
    for (const v of std) assert.ok(NOISE_DIE.includes(v));
    assert.ok(std.has('encounter'), 'the standard die keeps its encounter faces');
});

test('WK-04: Reaction to Danger lowers the surprise-attack threshold by 1 (min 1)', () => {
    const surprise = (weak, handN, token = 'adult') => {
        const s = fresh({ weaknessMode: true });
        s.weaknesses = weak ? ['dangerSense'] : [];
        const it = intruder(s, token, s.players[0].room);
        s.players[0].hand = s.players[0].hand.slice(0, handN);
        OPS['encounter.surprise'](s, { room: s.players[0].room, token, intruder: it.uid, player: 0 });
        return s.queue.some(q => q.op === 'attack');
    };
    assert.equal(surprise(false, 2), true, 'adult threshold 3: 2 cards are attacked');
    assert.equal(surprise(true, 2), false, 'threshold 3−1=2: 2 cards are safe');
    assert.equal(surprise(true, 1), true, 'threshold 2: 1 card is attacked');
    assert.equal(surprise(true, 0, 'larva'), true, 'the larva threshold stays 1, not 0');
});

test('WK-05: Movement Habits — only the Queen and Drones destroy closed doors (retreat)', () => {
    const repelThroughClosedDoor = (weak, type) => {
        const s = fresh({ weaknessMode: true });
        s.weaknesses = weak ? ['movementHabits'] : [];
        const roomId = s.players[0].room;
        const c = s.ship.corridors[s.ship.rooms[roomId].exits[0].corridor];
        c.door = 'closed';
        repelIntruder(s, intruder(s, type, roomId));   // tries exits[0]
        return c.door;
    };
    assert.equal(repelThroughClosedDoor(false, 'adult'), 'destroyed', 'without the weakness an adult breaks the door');
    assert.equal(repelThroughClosedDoor(true, 'adult'), 'closed', 'an adult cannot destroy a closed door');
    assert.equal(repelThroughClosedDoor(true, 'larva'), 'closed');
    assert.equal(repelThroughClosedDoor(true, 'drone'), 'destroyed', 'drones («Охотники») still can');
    assert.equal(repelThroughClosedDoor(true, 'queen'), 'destroyed', 'the Queen still can');
});

test('WK-06: Movement Habits also stop an intruder moving toward a character', () => {
    const toward = (weak) => {
        const s = fresh({ weaknessMode: true });
        s.weaknesses = weak ? ['movementHabits'] : [];
        const from = '011', e0 = s.ship.rooms[from].exits[0];
        s.players[0].room = e0.to;
        const it = intruder(s, 'adult', from);
        const doors = s.ship.rooms[from].exits.filter(e => e.to === e0.to).map(e => s.ship.corridors[e.corridor]);
        for (const c of doors) c.door = 'closed';
        moveOneToward(s, it, [s.players[0]]);
        return { room: it.room, doors: doors.map(c => c.door) };
    };
    const base = toward(false);
    assert.equal(base.room, '011');
    assert.ok(base.doors.includes('destroyed'), 'baseline: the adult smashes the door instead of moving');
    const wk = toward(true);
    assert.equal(wk.room, '011');
    assert.ok(wk.doors.every(d => d === 'closed'), 'weakness: every closed door stays intact');
});

test('WK-07: Vulnerability to Fire doubles fire injuries in the Intruder Phase', () => {
    const burn = (weak, type = 'adult') => {
        const s = fresh({ weaknessMode: true });
        s.weaknesses = weak ? ['fireVuln'] : [];
        const it = intruder(s, type, s.players[1].room, 0);
        s.roomState[s.players[1].room].fire = true;
        OPS['phase.intruder'](s);
        return type === 'queen' ? s.queenHits : it.hits;
    };
    assert.equal(burn(false), 1);
    assert.equal(burn(true), 2);
    assert.equal(burn(false, 'queen'), 1);
    assert.equal(burn(true, 'queen'), 2);
});

test('WK-08: Attack Habits — an Adult Bite gives a light injury instead of a serious wound', () => {
    const bite = (weak, type = 'adult') => {
        const s = fresh({ weaknessMode: true });
        s.weaknesses = weak ? ['attackHabits'] : [];
        const p = s.players[0];
        p.hand = []; p.armor = null; p.health = 10; p.wounds = [];
        const it = intruder(s, type, p.room);
        execute(s, { op: 'attack', intruder: it.uid, player: p.id, cardId: 'bite', noReaction: true, context: 'phase' });
        return { wounds: p.wounds.length, health: p.health };
    };
    assert.deepEqual(bite(false), { wounds: 1, health: 7 }, 'printed bite: a serious wound (health capped at 7)');
    assert.deepEqual(bite(true), { wounds: 0, health: 9 }, 'weakness: a light injury (−1 health) instead');
    assert.deepEqual(bite(true, 'drone'), { wounds: 1, health: 7 }, 'only Adults («Трутни») are affected');
});

test('WK-09: Weak Spots — a natural 6 against an Adult counts as a Critical', () => {
    const shot = (weak, type = 'adult', rollFace = 6) => {
        const s = fresh({ weaknessMode: true });
        s.weaknesses = weak ? ['weakSpots'] : [];
        const it = intruder(s, type, s.players[0].room, 0);
        const died = dealHits(s, s.players[0], it, 1, 0, { forcedRoll: rollFace });
        return { died, gone: !s.intruders[it.uid] };
    };
    assert.deepEqual(shot(false), { died: false, gone: false });
    assert.deepEqual(shot(true), { died: true, gone: true });
    assert.deepEqual(shot(true, 'drone'), { died: false, gone: false }, 'only Adults («Трутни»)');
    assert.deepEqual(shot(true, 'adult', 5), { died: false, gone: false }, 'only the natural 6');
});

test('WK-10: Dying Species — toughness of all intruders is reduced by 1', () => {
    const s = fresh({ weaknessMode: true });
    const a = intruder(s, 'adult', s.players[0].room, 0);
    assert.equal(dealHits(s, s.players[0], a, 2, 0, { forcedRoll: 3 }), false, 'roll 3 > 2 hits: survives');
    s.weaknesses = ['endangered'];
    const b = intruder(s, 'adult', s.players[0].room, 0);
    assert.equal(dealHits(s, s.players[0], b, 2, 0, { forcedRoll: 3 }), true, 'roll 3 − 1 ≤ 2 hits: dies');
});

test('WK-11: Energy Vulnerability — energy weapons deal +1 injury', () => {
    const shot = (weak, item) => {
        const s = fresh({ weaknessMode: true });
        s.weaknesses = weak ? ['energyVuln'] : [];
        const it = intruder(s, 'adult', s.players[0].room, 0);
        dealHits(s, s.players[0], it, 1, 0, { forcedRoll: 6, weapon: { item } });
        return it.hits;
    };
    assert.equal(shot(false, 'plasmaGun'), 1);
    assert.equal(shot(true, 'plasmaGun'), 2, 'plasma gun (energy): +1');
    assert.equal(shot(true, 'sonicGun'), 2, 'sonic gun (energy): +1');
    assert.equal(shot(true, 'armGun'), 2, 'UPS arm gun (energy): +1');
    assert.equal(shot(true, 'smg'), 1, 'kinetic weapons are unchanged');
});

test('WK-12: Phosphates — extinguisher/fire-control wounds the intruder it drives off', () => {
    const s = fresh({ weaknessMode: true });
    const it = intruder(s, 'adult', s.players[0].room, 0);
    phosphateWound(s, it);
    assert.equal(it.hits, 0, 'a hidden weakness does nothing');
    s.weaknesses = ['phosphates'];
    phosphateWound(s, it);
    assert.equal(it.hits, 1);
    delete s.intruders[it.uid];
    phosphateWound(s, it);   // already off the board: a safe no-op
    assert.equal(it.hits, 1);
});

test('WK-13: Extreme Field Biology counts revealed weaknesses in the variant', () => {
    const def = OBJECTIVES.corporate.extremeBiology;
    const s = fresh({ weaknessMode: true });
    assert.equal(checkObjective(s, s.players[0], def, 'earth'), false);
    s.weaknesses = ['fireVuln', 'phosphates'];
    assert.equal(checkObjective(s, s.players[0], def, 'earth'), true);
    const a = fresh();
    a.adaptationsRemoved = 2;
    assert.equal(checkObjective(a, a.players[0], def, 'earth'), true, 'adaptations mode is unchanged');
});
