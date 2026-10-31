import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScripts } from './browser-scripts.mjs';

const { get } = loadScripts(['js/fs/FSData.js', 'js/fs/FSEffects.js', 'js/fs/FSRules.js', 'js/fs/FSView.js', 'js/fs/FSUI.js', 'js/fs/FSGame.js']);
const data = get('FS_DATA'), rules = get('FS_RULES'), view = get('FSView'), Game = get('FSGame');

function game(count = 2) {
    const s = rules.newGame({ seed: 9, interactiveSetup: true,
        players: data.factions.slice(0, count).map((f, i) => ({ name: 'P' + i, faction: f.id })) });
    for (const p of s.players) { p.initialForces = { units: {}, structures: {} }; p.objectivePool = []; }
    return s;
}
function place(s, row, col) {
    const seat = s.setup.turn;
    const result = rules.apply(s, seat, { type: 'placeSystemTile', tile: s.setup.hands[seat][0], row, col });
    if (!result.ok) return result;
    assert.ok(rules.apply(s, seat, { type: 'finishSetupForces' }).ok);
    while (s.setup && s.setup.stage === 'storms') {
        const edge = rules.setupStormEdges(s)[0];
        assert.ok(rules.apply(s, s.setup.turn, { type: 'setupStorm', ...edge }).ok);
    }
    return result;
}
function keys(cells) { return Array.from(cells, c => c.row + ':' + c.col).sort(); }

test('setup grows in all four directions and allows either 2×3 orientation', () => {
    for (const cells of [
        [[0,0], [0,-1], [0,1], [1,0], [1,-1], [1,1]],
        [[0,0], [-1,0], [1,0], [0,1], [-1,1], [1,1]],
    ]) {
        const s = game();
        assert.deepEqual(keys(rules.setupLegalCells(s)), ['0:0']);
        assert.equal(place(s, ...cells[0]).ok, true);
        assert.deepEqual(keys(rules.setupLegalCells(s)), ['-1:0', '0:-1', '0:1', '1:0']);
        for (const cell of cells.slice(1)) assert.equal(place(s, ...cell).ok, true, String(cell));
        assert.equal(s.phase, 'planning');
        assert.equal(s.systems.length, 6);
        const rows = new Set(s.systems.map(x => x.row)), cols = new Set(s.systems.map(x => x.col));
        assert.deepEqual([rows.size, cols.size].sort(), [2, 3]);
    }
});

test('setup rejects protrusions, diagonal cells, occupied cells and malformed coordinates', () => {
    const s = game();
    assert.ok(place(s, 0, 0).ok);
    for (const [r,c] of [[1,1], [0,0], [4,0], [NaN,0]]) assert.equal(place(s, r, c).ok, false);
    assert.ok(place(s, 0, 1).ok);
    assert.ok(place(s, 0, 2).ok);
    assert.ok(!keys(rules.setupLegalCells(s)).includes('0:3'));
    assert.ok(!keys(rules.setupLegalCells(s)).includes('2:1'));
    assert.equal(place(s, 0, 3).ok, false);
});

test('all possible two-player layouts can be completed to a rectangle', () => {
    function walk(s) {
        if (s.phase !== 'setup') {
            const rows = s.systems.map(x => x.row), cols = s.systems.map(x => x.col);
            assert.equal((Math.max(...rows)-Math.min(...rows)+1) * (Math.max(...cols)-Math.min(...cols)+1), 6);
            return;
        }
        const cells = rules.setupLegalCells(s);
        assert.ok(cells.length);
        for (const cell of cells) {
            const copy = JSON.parse(JSON.stringify(s));
            assert.ok(place(copy, cell.row, cell.col).ok);
            walk(copy);
        }
    }
    walk(game());
});

test('system neighbors, area edges and storms use aligned full edges', () => {
    const s = game();
    for (const cell of [[0,0], [0,1], [1,0], [1,1]]) assert.ok(place(s, ...cell).ok);
    const [a,b,c,d] = s.systems;
    assert.deepEqual(Array.from(rules.neighbors(s, a.id)).sort(), [b.id,c.id].sort());
    assert.equal(rules.sideBetween(s, a.id, d.id), null);
    assert.equal(rules.across(s, a.id, 'E'), b.id);
    assert.equal(rules.areasTouch(s, a.id, 'TR', b.id, 'TL'), true);
    assert.equal(rules.areasTouch(s, a.id, 'TR', b.id, 'BL'), false);
    assert.equal(rules.areasTouch(s, a.id, 'BR', c.id, 'TR'), true);
    assert.equal(rules.allEdges(s).length, 12);
});

test('board positions remain stable while setup expands', () => {
    const app = { location: { width: 2048, height: 2048 } };
    const v = {};
    const s = game();
    let visible = rules.view(s, s.setup.turn);
    view.measure(app, v, visible);
    const initial = view.tilePos(app, { row: 0, col: 0 }, v.metrics);
    assert.ok(place(s, 0, 0).ok);
    assert.ok(place(s, -1, 0).ok);
    visible = rules.view(s, s.setup.turn);
    view.measure(app, v, visible);
    assert.deepEqual(view.tilePos(app, s.systems[0], v.metrics), initial);
    assert.equal(view.tilePos(app, s.systems[1], v.metrics).x, initial.x);
});

test('pointer uses canvas-relative event coordinates, ignores drags and right clicks', () => {
    const handlers = {}, calls = [];
    const canvas = { addEventListener: (name, fn) => { handlers[name] = fn; }, getBoundingClientRect: () => ({ left: 25, top: 50 }) };
    const client = Object.create(Game.prototype);
    client.app = { location: { view: { world: { canvas } } } };
    client.onClick = (x,y) => calls.push([x,y]);
    client.bindPointer();
    const event = (x,y,button=0) => ({ clientX:x, clientY:y, button, pointerId:1 });
    handlers.pointerdown(event(125, 250)); handlers.pointerup(event(125,250));
    handlers.pointerdown(event(100, 100)); handlers.pointerup(event(120,100));
    handlers.pointerdown(event(100, 100, 2)); handlers.pointerup(event(100,100,2));
    assert.deepEqual(calls, [[100,200]]);
});

test('ground paths cannot jump between diagonally opposite sectors of the same system', () => {
    const s = game();
    assert.ok(place(s, 0, 0).ok);
    const sys = s.systems[0];
    s.units = []; s.structures = [];
    assert.equal(rules.pathExists(s, 0, sys.id, 'TL', sys.id, 'BR'), false);
    s.units.push({ seat: 0, system: sys.id, area: 'TR' });
    assert.equal(rules.pathExists(s, 0, sys.id, 'TL', sys.id, 'BR'), true);
});

test('tile preview presents all four sectors and world properties', () => {
    function element() { return { children: [], textContent: '', append(...nodes) { this.children.push(...nodes); } }; }
    const loaded = loadScripts(['js/fs/FSData.js', 'js/fs/FSUI.js'], { document: { createElement: element } });
    const tile = loaded.get('FS_DATA').tiles.find(t => t.id === '13A');
    const preview = loaded.get('FSUI').tilePreview(tile);
    const text = node => node.textContent + node.children.map(text).join(' ');
    const contents = text(preview);
    assert.equal(preview.children[1].children.length, 4);
    for (const expected of ['13A', 'Fendris', 'Isthar', 'Carnac', 'Пустота', 'Материя', 'Вместимость', 'Кузница', 'Запасы', 'Цель']) {
        assert.ok(contents.includes(expected), expected);
    }
});
