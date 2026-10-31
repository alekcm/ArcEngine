// random-map.test.mjs — tests for the symmetrical random map generator.
//   node --test nemesis/tools/random-map.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomShip, originalShip } from '../shared/ship.mjs';
import { createGame } from '../shared/engine/setup.mjs';

const MIRROR = {
    '001': '001', '003': '003', '007': '007', '011': '011', '020': '020',
    '002': '004', '004': '002',
    '005': '009', '009': '005',
    '006': '008', '008': '006',
    '010': '012', '012': '010',
    '014': '015', '015': '014',
    '013': '016', '016': '013',
    '017': '018', '018': '017',
    '019': '021', '021': '019',
};

test('MAP-GEN-01: random ship is strictly horizontally symmetrical', () => {
    for (let i = 0; i < 20; i++) {
        const ship = randomShip({ seed: 'sym_' + i });
        const Y_c = 470;

        // 1. Room coordinates and kinds symmetry
        for (const [id, r] of Object.entries(ship.rooms)) {
            const mirrorId = MIRROR[id];
            const mr = ship.rooms[mirrorId];
            assert.ok(mr, 'Mirror room ' + mirrorId + ' exists for ' + id);
            assert.equal(r.kind, mr.kind, 'Room ' + id + ' and ' + mirrorId + ' share kind ' + r.kind);
            assert.equal(r.x, mr.x, 'Room ' + id + ' and ' + mirrorId + ' share X ' + r.x);
            assert.equal(r.y + mr.y, 2 * Y_c, 'Room ' + id + ' (' + r.y + ') and ' + mirrorId + ' (' + mr.y + ') are mirrored across ' + Y_c);
            assert.equal(r.tech, mr.tech, 'Tech hatch status matches between ' + id + ' and ' + mirrorId);
        }

        // 2. Corridors symmetry
        for (const [cid, c] of Object.entries(ship.corridors)) {
            const ma = MIRROR[c.a], mb = MIRROR[c.b];
            const mirrorCid = ma < mb ? ma + '-' + mb : mb + '-' + ma;
            assert.ok(ship.corridors[mirrorCid], 'Mirrored corridor ' + mirrorCid + ' exists for ' + cid);
        }
    }
});

test('MAP-GEN-02: random ship has exactly 5 slot2 in inner ring, 11 slot1 in outer ring, and required specials', () => {
    for (let i = 0; i < 20; i++) {
        const ship = randomShip({ seed: 'roles_' + i });
        assert.equal(Object.keys(ship.rooms).length, 21, 'Ship has exactly 21 rooms');

        const innerRooms = ['006', '007', '008', '014', '015'];
        const outerRooms = ['002', '003', '004', '005', '009', '010', '012', '013', '016', '017', '018'];

        // Inner ring: exactly 5 slot2 rooms
        for (const id of innerRooms) {
            assert.equal(ship.rooms[id].kind, 'slot2', 'Inner ring room ' + id + ' is slot2');
        }
        // Outer ring: exactly 11 slot1 rooms
        for (const id of outerRooms) {
            assert.equal(ship.rooms[id].kind, 'slot1', 'Outer ring room ' + id + ' is slot1');
        }

        // Specials
        assert.equal(ship.rooms['001'].kind, 'cockpit', '001 is Cockpit');
        assert.equal(ship.rooms['011'].kind, 'hibernatorium', '011 is Hibernatorium');
        assert.equal(ship.rooms['019'].kind, 'engine', '019 is Engine 3');
        assert.equal(ship.rooms['020'].kind, 'engine', '020 is Engine 2');
        assert.equal(ship.rooms['021'].kind, 'engine', '021 is Engine 1');
        assert.equal(ship.rooms['019'].engineNo, 3);
        assert.equal(ship.rooms['020'].engineNo, 2);
        assert.equal(ship.rooms['021'].engineNo, 1);
    }
});

test('MAP-GEN-03: game session with random ship opens Cockpit, Hibernatorium and 3 Engines from start', () => {
    for (let i = 0; i < 5; i++) {
        const state = createGame({
            mode: 'random',
            seed: 'session_' + i,
            players: [{ name: 'P1', charId: 'soldier' }, { name: 'P2', charId: 'scout' }],
        });

        // Hibernatorium, Cockpit, 3 Engines start explored
        assert.equal(state.roomState['001'].explored, true, 'Cockpit is open at start');
        assert.equal(state.roomState['011'].explored, true, 'Hibernatorium is open at start');
        assert.equal(state.roomState['019'].explored, true, 'Engine 3 is open at start');
        assert.equal(state.roomState['020'].explored, true, 'Engine 2 is open at start');
        assert.equal(state.roomState['021'].explored, true, 'Engine 1 is open at start');

        // All 11 slot1 and 5 slot2 rooms start closed
        for (const [id, r] of Object.entries(state.ship.rooms)) {
            if (r.kind === 'slot1' || r.kind === 'slot2') {
                assert.equal(state.roomState[id].explored, false, 'Room ' + id + ' (' + r.kind + ') starts closed');
            }
        }

        // Players start in Hibernatorium
        for (const p of state.players) {
            assert.equal(p.room, '011', 'Player ' + p.name + ' starts in Hibernatorium');
        }
    }
});

test('MAP-GEN-04: connectivity and degree limits on all generated ships', () => {
    for (let i = 0; i < 20; i++) {
        const ship = randomShip({ seed: 'deg_' + i });

        // Connectivity
        const visited = new Set(['001']);
        const q = ['001'];
        while (q.length) {
            const u = q.pop();
            for (const exit of ship.rooms[u].exits) {
                if (!visited.has(exit.to)) {
                    visited.add(exit.to);
                    q.push(exit.to);
                }
            }
        }
        assert.equal(visited.size, 21, 'All 21 rooms are connected');
        assert.ok(Object.keys(ship.corridors).length <= 30, 'Ship has at most 30 corridors, got ' + Object.keys(ship.corridors).length);

        // Degree limits
        for (const [id, r] of Object.entries(ship.rooms)) {
            const deg = r.exits.length;
            if (r.kind === 'engine') {
                assert.ok(deg >= 1 && deg <= 2, 'Engine ' + id + ' exit count ' + deg + ' in [1, 2]');
            } else if (r.kind === 'cockpit') {
                assert.ok(deg >= 2 && deg <= 3, 'Cockpit ' + id + ' exit count ' + deg + ' in [2, 3]');
            } else {
                const limit = r.tech ? 3 : 4;
                assert.ok(deg >= 2 && deg <= limit, 'Room ' + id + ' exit count ' + deg + ' in [2, ' + limit + ']');
            }
        }
    }
});
