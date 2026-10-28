// clarity.test.mjs — what the table is told, and why.
//   node --test nemesis/tools/clarity.test.mjs
// Two things were saying the wrong thing:
//   * an Attack card flew onto the table with its name only — "Смертоносные когти" without a word
//     about what they do ("−1 здоровье" for an adult). The rules text lives in the card, it just
//     never reached the client: `fx` carried the name and the intruder, not the effect.
//   * a "Встреча" face on the noise die printed "жетон шума выпал в коридор, где уже был шум" under
//     the bag, sending the table to look for a corridor that had no token at all. There are two
//     different ways to reach an encounter and each has to name its own cause.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../shared/engine/setup.mjs';
import { next, run, spawnIntruder, corridorsOf, room } from '../shared/engine/core.mjs';
import { attackEffectText, dealHits } from '../shared/engine/combat.mjs';
import { ATTACK_CARDS } from '../shared/data/cards.mjs';

function fresh(ui = {}) {
    const state = createGame({
        seed: 'clarity', mode: 'original', draft: false,
        players: [{ name: 'Alpha', charId: 'soldier' }, { name: 'Beta', charId: 'scout' }],
        ui,
    });
    state.queue = []; state.prompt = null; state.resume = null; state.result = null;
    state.phase = 'player'; state.current = 0; state.firstPlayer = 0;
    state.seating = state.players.map(p => p.id); state.turnCursor = 0; state.actionsLeft = 2;
    state.players.forEach(p => { p.room = '011'; p.status = 'active'; });
    return state;
}

test('CLR-01: an attack card says what it does to the intruder that is attacking', () => {
    const claws = ATTACK_CARDS.find(c => c.id === 'claws1');
    assert.equal(attackEffectText(claws, 'adult'), 'Взрослый: −1 здоровье.');
    assert.match(attackEffectText(claws, 'drone'), /^Дрон: тяжело ранен/);
    assert.equal(attackEffectText(claws, 'queen'), 'Королева: −2 здоровья.');
    // cards printed without a rank split come back whole
    const scratch = ATTACK_CARDS.find(c => c.id === 'scratch1');
    assert.equal(attackEffectText(scratch, 'adult'), '−1 здоровье.');
    assert.equal(attackEffectText(scratch, 'queen'), '−1 здоровье.');
});

test('CLR-02: the revealed card carries its rules text to the table', () => {
    const s = fresh();
    const it = spawnIntruder(s, 'adult', '011');
    assert.ok(it, 'an adult is on the board');
    next(s, { op: 'attack', intruder: it.uid });
    run(s);
    const f = [...(s.fx || [])].reverse().find(x => x.type === 'attack');
    assert.ok(f, 'an attack card was revealed');
    assert.ok(f.name, 'the card has a name');
    assert.ok(f.text && f.text.length > 10, 'the card carries its printed text');
    assert.ok(f.effect && f.effect.length > 3, 'the card carries the effect for this rank');
    assert.ok(f.text.includes(f.effect.replace(/^[^:]+:\s*/, '')) || f.effect === f.text,
        'the effect is taken from the printed text');
});

test('CLR-03: an encounter on the noise die names the die, not a corridor', () => {
    const s = fresh({ bagClick: true });
    s.pendingRoll = { die: 'noise', value: 'encounter' };
    next(s, { op: 'noise.roll', player: 0, room: '011' });
    run(s);
    assert.equal(s.prompt && s.prompt.kind, 'bag', 'the bag window is open');
    const text = s.prompt.text || '';
    assert.match(text, /куб|гран/i, 'the reason says the die showed the encounter face');
    assert.doesNotMatch(text, /уже был шум/i, 'nothing about a corridor that already had a token');
});

test('CLR-04: a noise token landing on an occupied corridor keeps its own reason', () => {
    const s = fresh({ bagClick: true });
    const cors = corridorsOf(s, '011');
    assert.ok(cors.length >= 2, 'a room with corridors');
    const c = cors[0];
    const num = c.nums[0];
    if (c.id === 'tech') s.ship.techNoise = true; else s.ship.corridors[c.id].noise = true;
    s.pendingRoll = { die: 'noise', value: num };
    next(s, { op: 'noise.roll', player: 0, room: '011' });
    run(s);
    assert.equal(s.prompt && s.prompt.kind, 'bag', 'the bag window is open');
    assert.match(s.prompt.text || '', /уже был/i, 'this encounter really is the second token');
});

test('CLR-05: a killed adult leaves a carcass on the deck', () => {
    const s = fresh();
    const it = spawnIntruder(s, 'adult', '011');
    assert.ok(it, 'an adult is on the board');
    const before = room(s, '011').objects.length;
    const killed = dealHits(s, s.players[0], it, 1, 0, { forcedRoll: 'crit' });
    assert.equal(killed, true, 'a critical hit kills');
    const objects = room(s, '011').objects;
    assert.equal(objects.length, before + 1, 'the carcass is an object of the room');
    assert.equal(objects[objects.length - 1].type, 'carcass');
    assert.equal(s.carcassCount, 1, 'and it counts for the "bug hunt" objective');
});
