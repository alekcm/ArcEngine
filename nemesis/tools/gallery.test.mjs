// Room gallery (test ship) — checks the board the client opens from the lobby to look at every
// room model. This is not a rules test: a normal game places only 11 basic + 5 additional tiles,
// the gallery has to show *all* of them at once, including optional Aftermath tiles.
// Run: node --test nemesis/tools/gallery.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { ROOM_TILES, BASIC_TILES, ADDITIONAL_TILES, VISUAL_TILES, GALLERY_TILES, galleryShip, neighbors } from '../shared/ship.mjs';

const SPECIAL = ['cockpit', 'hibernatorium', 'engine'];

test('GAL-01: the test ship holds every room tile of the game exactly once', () => {
    const ship = galleryShip();
    const ids = Object.keys(ship.rooms);
    assert.equal(ids.length, Object.keys(ROOM_TILES).length, 'room count = tile count');
    assert.equal(ids.length, 35);
    assert.deepEqual([...GALLERY_TILES].sort(), Object.keys(ROOM_TILES).sort());
    const tiles = ids.map(id => ship.galleryTiles[id]);
    assert.equal(new Set(tiles).size, tiles.length, 'no tile is placed twice');
    for (const t of tiles) assert.ok(ROOM_TILES[t], 'unknown tile ' + t);
    for (const t of BASIC_TILES) assert.ok(tiles.includes(t), 'basic tile missing: ' + t);
    for (const t of ADDITIONAL_TILES) assert.ok(tiles.includes(t), 'additional tile missing: ' + t);
    for (const t of SPECIAL) assert.ok(tiles.includes(t), 'special tile missing: ' + t);
});

test('GAL-01b original-rule visuals live in the gallery, never in a real deal', () => {
    assert.ok(VISUAL_TILES.length >= 9, 'all printed original rooms have a visual tile');
    for (const tile of VISUAL_TILES) {
        assert.ok(ROOM_TILES[tile].visualOnly, tile + ' is marked visual-only');
        assert.ok(!BASIC_TILES.includes(tile) && !ADDITIONAL_TILES.includes(tile), tile + ' is not dealt');
    }
});

test('GAL-02: the board is one connected grid where every room has two to four exits', () => {
    const ship = galleryShip();
    const ids = Object.keys(ship.rooms);
    assert.equal(ship.mode, 'gallery');
    // The 5x5 layout stays stable; the 3x3 visual block adds 12 joins, plus one from the Aftermath berth.
    assert.equal(Object.keys(ship.corridors).length, 56);
    for (const id of ids) {
        const deg = ship.rooms[id].exits.length;
        assert.ok(deg >= 2 && deg <= 4, 'room ' + id + ' has ' + deg + ' exits');
        for (const e of ship.rooms[id].exits) assert.ok(ship.rooms[e.to], 'exit to a missing room');
    }
    const seen = new Set([ids[0]]), queue = [ids[0]];
    while (queue.length) for (const n of neighbors(ship, queue.shift())) if (!seen.has(n)) { seen.add(n); queue.push(n); }
    assert.equal(seen.size, ids.length, 'the whole board is reachable');
    assert.ok(Object.values(ship.rooms).some(r => r.tech), 'some technical corridors to look at');
});

test('GAL-03: every room keeps the kind, slot and engine number of its tile', () => {
    const ship = galleryShip();
    for (const r of Object.values(ship.rooms)) {
        const tile = ship.galleryTiles[r.id];
        const def = ROOM_TILES[tile];
        const kind = SPECIAL.includes(tile) ? tile : def.slot === '1' ? 'slot1' : 'slot2';
        assert.equal(r.kind, kind, tile + ' → ' + r.kind);
        if (kind === 'engine') assert.ok(r.engineNo >= 1, 'the engine room is numbered');
    }
    assert.equal(Object.values(ship.rooms).filter(r => r.kind === 'engine').length, 1);
    assert.equal(Object.values(ship.rooms).filter(r => r.kind === 'cockpit').length, 1);
    assert.equal(Object.values(ship.rooms).filter(r => r.kind === 'hibernatorium').length, 1);
    // the layout is deterministic: the client rebuilds it on every visit
    assert.deepEqual(galleryShip().bounds, ship.bounds);
    assert.deepEqual(Object.keys(galleryShip().rooms), Object.keys(ship.rooms));
});
