// noise.test.mjs — the noise numbers on the doors.
//   node --test nemesis/tools/noise.test.mjs
// A corridor is one passage, so the board prints one set of digits on it and both rooms joined by it
// read the same digits. The generator used to number the two ends independently: the door between
// 012 and 016 read "1 2" from 012 and "4" from 016, so a 3 rolled in 012 pointed at corridor 009-012
// and a 4 rolled in 016 at the same corridor — while the corridor marked "3 4" on the board got
// nothing. Two rules are pinned here: one set per corridor, and a roll of a printed digit always
// lights that corridor and only that corridor.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../shared/engine/setup.mjs';
import { next, run } from '../shared/engine/core.mjs';
import { originalShip, randomShip } from '../shared/ship.mjs';

function fresh() {
    const state = createGame({
        seed: 'noise', mode: 'original', draft: false,
        players: [{ name: 'Alpha', charId: 'soldier' }, { name: 'Beta', charId: 'scout' }],
        ui: { bagClick: true },
    });
    state.queue = []; state.prompt = null; state.resume = null; state.result = null;
    state.phase = 'player'; state.current = 0; state.firstPlayer = 0;
    state.seating = state.players.map(p => p.id); state.turnCursor = 0; state.actionsLeft = 2;
    state.players.forEach(p => { p.room = '011'; p.status = 'active'; });
    return state;
}
const numsOf = (room, e) => (e.nums && e.nums.length ? e.nums : [e.num]).filter(Boolean);

test('DR-09: a corridor carries one set of numbers, the same on both of its ends', () => {
    const boards = [originalShip()];
    for (let i = 0; i < 6; i++) boards.push(randomShip({ players: 4, seed: 'n' + i }));
    for (const ship of boards) {
        for (const c of Object.values(ship.corridors)) {
            const a = ship.rooms[c.a].exits.find(e => e.corridor === c.id);
            const b = ship.rooms[c.b].exits.find(e => e.corridor === c.id);
            assert.ok(a && b, c.id + ': both ends exist');
            assert.deepEqual(numsOf(ship.rooms[c.a], a).slice().sort(), numsOf(ship.rooms[c.b], b).slice().sort(),
                c.id + ': the same digits on both sides of the door');
        }
        for (const r of Object.values(ship.rooms)) {
            const all = [...r.exits.flatMap(e => numsOf(r, e)), ...(r.techNums || [])].sort();
            assert.deepEqual([...new Set(all)], [1, 2, 3, 4],
                r.id + ': the room still deals all four noise numbers, without repeats (' + all.join(',') + ')');
        }
    }
});

test('DR-10: a printed digit lights its own corridor and no other one', () => {
    const s = fresh();
    const room = s.ship.rooms['012'];
    const door = room.exits.find(e => e.to === '016');
    assert.ok(door, '012 has a door to 016');
    assert.deepEqual(numsOf(room, door).slice().sort(), [3, 4], 'the door between 012 and 016 reads "3 4"');

    const lightUp = (roomId, value) => {
        for (const c of Object.values(s.ship.corridors)) c.noise = false;
        s.ship.techNoise = false;
        s.pendingRoll = { die: 'noise', value };
        next(s, { op: 'noise.roll', player: 0, room: roomId });
        run(s);
        const lit = Object.values(s.ship.corridors).filter(c => c.noise).map(c => c.id);
        return { lit, tech: s.ship.techNoise, prompt: s.prompt && s.prompt.kind };
    };

    for (const [roomId, value] of [['012', 3], ['012', 4], ['016', 3], ['016', 4]]) {
        s.queue = []; s.prompt = null;
        const r = lightUp(roomId, value);
        assert.deepEqual(r.lit, ['012-016'], 'шум ' + value + ' в ' + roomId + ' зажигает только коридор 012-016');
        assert.equal(r.tech, false, 'тех. коридоры не получают шум');
    }

    // rolling a second token onto the same corridor is an encounter, and the reason says so
    s.queue = []; s.prompt = null;
    s.ship.corridors['012-016'].noise = true;
    s.pendingRoll = { die: 'noise', value: 3 };
    next(s, { op: 'noise.roll', player: 0, room: '016' });
    run(s);
    assert.equal(s.prompt && s.prompt.kind, 'bag', 'жетон уже лежал — тянем из мешка');
    assert.match(String(s.prompt.text || ''), /уже был (шум|жетон)/i, 'причина названа: в коридоре уже был жетон шума');
});
