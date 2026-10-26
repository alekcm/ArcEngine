import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadScripts, stub } from './browser-scripts.mjs';

function data() {
    return loadScripts(['js/Warcraft3Data.js']).get('Warcraft3Data');
}

test('Warcraft III RTS data: all four core Alliance/Orc archetypes and their costs are defined', () => {
    const W = data();
    for (const id of ['peasant', 'footman', 'archer', 'paladin', 'grunt', 'headhunter', 'blademaster']) {
        const unit = W.UNITS[id];
        assert.ok(unit, `unit exists: ${id}`);
        assert.ok(unit.hp > 0 && unit.damage > 0 && unit.speed > 0, `combat stats: ${id}`);
        assert.ok(unit.cooldown > 0 && unit.range > 0 && unit.food > 0, `RTS stats: ${id}`);
    }
    for (const id of ['townhall', 'barracks', 'farm', 'tower', 'altar', 'greatHall', 'orcBarracks', 'goldMine']) {
        const building = W.BUILDINGS[id];
        assert.ok(building, `building exists: ${id}`);
        assert.ok(building.hp > 0 && building.footprint[0] > 0 && building.footprint[1] > 0, `building footprint/health: ${id}`);
    }
    assert.equal(W.UNITS.peasant.team, 'alliance');
    assert.equal(W.UNITS.grunt.team, 'horde');
    assert.equal(W.UNITS.archer.role, 'ranged');
    assert.equal(W.UNITS.paladin.role, 'hero');
});

test('Warcraft III grid coordinates round-trip and clamp to the 48×48 map', () => {
    const W = data();
    assert.deepEqual({ ...W.worldToCell(0, 0) }, { x: 0, y: 0 });
    assert.deepEqual({ ...W.worldToCell(3072, 3072) }, { x: 47, y: 47 });
    assert.deepEqual({ ...W.cellToWorld(12, 29) }, { x: 800, y: 1888 });
    const c = W.worldToCell(800, 1888);
    assert.deepEqual({ ...c }, { x: 12, y: 29 });
});

test('Warcraft III A*: roads around obstacles, no diagonal corner cutting, and sealed goals fail', () => {
    const W = data();
    const n = 9;
    const blocked = new Set();
    for (let y = 0; y < n - 1; y++) blocked.add(y * n + 4); // one opening at (4,8)
    const route = W.findPath(n, blocked, 1, 1, 7, 1);
    assert.ok(route && route.length > 0);
    assert.deepEqual({ ...route.at(-1) }, { x: 7, y: 1 });
    assert.ok(route.some(p => p.y >= 6), 'A* routes around the wall through its only opening');
    assert.ok(route.every(p => !blocked.has(p.y * n + p.x)), 'no path point crosses a blocked tile');

    const corner = new Set([1, 2]);
    assert.equal(W.findPath(2, corner, 0, 0, 1, 1), null, 'diagonal movement cannot clip blocked corners');
    assert.equal(W.findPath(3, new Set([4]), 0, 1, 1, 1), null, 'a blocked goal is unreachable');
    assert.equal(W.findPath(3, new Set(), 1, 1, 1, 1).length, 0, 'same-cell route is empty');
});

test('Warcraft III economy: affordability is checked before atomic gold/lumber payment', () => {
    const W = data();
    const stock = { gold: 260, lumber: 170 };
    assert.equal(W.canAfford(stock, W.BUILDINGS.barracks), true);
    assert.equal(W.pay(stock, W.BUILDINGS.barracks), true);
    assert.deepEqual({ ...stock }, { gold: 20, lumber: 10 });
    assert.equal(W.pay(stock, W.BUILDINGS.farm), false);
    assert.deepEqual({ ...stock }, { gold: 20, lumber: 10 }, 'failed payment leaves resources untouched');
});

test('Warcraft3RTS loads as a classic browser script and shares the pure grid rules', () => {
    const page = loadScripts(['js/Warcraft3Data.js', 'js/Warcraft3RTS.js'], { BABYLON: stub() });
    assert.equal(typeof page.get('Warcraft3RTS'), 'function');
    assert.equal(page.get('Warcraft3Data').GRID_SIZE, 48);
});
