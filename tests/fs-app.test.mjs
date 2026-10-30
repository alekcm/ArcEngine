// The client of the game as a whole: the connection, the panels and the board.
// The 3D is a stub (Babylon), the network is a stub — the logic is real.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadScripts, stub } from './browser-scripts.mjs';

function fakeElement(tag) {
    return {
        tagName: tag, style: {}, dataset: {}, children: [], textContent: '', className: '',
        appendChild(c) { this.children.push(c); return c; },
        removeChild(c) { this.children = this.children.filter(x => x !== c); },
        remove() { }, addEventListener() { }, removeEventListener() { },
    };
}

const canvas = Object.assign(fakeElement('canvas'), {
    clientWidth: 1280, clientHeight: 720, offsetLeft: 0, offsetTop: 0,
    parentElement: fakeElement('div'),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }),
});

const scene = {
    pick: () => null,
    pointerX: 0, pointerY: 0,
};

const { get } = loadScripts(
    ['js/Constants.js', 'js/UILayout.js', 'js/UI.js', 'js/fs/FSData.js', 'js/fs/FSRules.js',
        'js/fs/FSNet.js', 'js/fs/FSView.js', 'js/fs/FSUI.js', 'js/fs/FSGame.js'],
    {
        document: { createElement: fakeElement, body: fakeElement('body'), querySelector: () => null },
        BABYLON: stub(),
        World3D: { addObject() { }, removeObject() { } },
        URLSearchParams,
        location: { search: '', origin: 'http://localhost:8080', href: 'http://localhost:8080/' },
        history: { replaceState() { } },
    }
);
const UI = get('UI');
const FS_DATA = get('FS_DATA');
const FS_RULES = get('FS_RULES');
const FSNet = get('FSNet');
const FSGame = get('FSGame');

// The network: the commands of the client are collected.
const sent = [];
const handlers = new Map();
FSNet.connect = () => ({
    on(type, fn) { if (!handlers.has(type)) handlers.set(type, []); handlers.get(type).push(fn); return this; },
    send() { return true; },
    cmd(c) { sent.push(c); return true; },
    faction(f) { sent.push({ type: 'faction', faction: f }); return true; },
    emit(type, data) { for (const fn of handlers.get(type) || []) fn(data); },
});

const app = {
    location: {
        width: 2048, height: 2048,
        terrain: { heightAt: () => 0 },
        view: { world: { canvas }, scene },
    },
    camera: { azimuth: 0, pitch: 1, zoom: 1, zoomTarget: 1, lookAt() { } },
};

test('the client: the lobby, the state and the panels of the phases', () => {
    UI.init(canvas);
    const game = new FSGame(app);
    assert.ok(game.view, 'the board is created');
    // The lobby: the room and the factions.
    game.emit = null;
    const net = { on: () => { }, send: () => { }, cmd: () => { }, faction: () => { } };
    void net;
    // The connection is stubbed — the messages come by hand.
    handlers.get('joined').forEach(fn => fn({
        id: 'p1', room: 'ABCD', seat: 0,
        factions: FS_DATA.factions.map(f => ({ id: f.id, name: f.name, color: f.color })),
    }));
    assert.equal(UI.get('fsLobby').visible, true);
    assert.ok(UI.get('fsLobbyInfo').inner.textContent.includes('ABCD'));
    // The choice of the faction.
    const factionButtons = [...UI.elements.values()].filter(e => e.def.parent === 'fsLobby' && e.def.kind === 'button' && e.def.id !== 'fsLobbyBtn');
    assert.equal(factionButtons.length, 12);
    factionButtons[0]._click(factionButtons[0]);
    assert.deepEqual(sent[sent.length - 1], { type: 'faction', faction: FS_DATA.factions[0].id });

    // The game: the state of the rules engine arrives.
    const state = FS_RULES.view(FS_RULES.newGame({
        seed: 21,
        players: FS_DATA.factions.slice(0, 2).map((f, i) => ({ name: 'Игрок ' + (i + 1), faction: f })),
    }), 0);
    game.onState(state);
    assert.equal(UI.get('fsLobby').visible, false);
    assert.ok(UI.get('fsPhase').inner.textContent.includes('Раунд 1'));
    assert.ok(UI.get('fsPlayers').inner.textContent.includes('Игрок 1'));
    // The planning phase: the four orders.
    const actionButtons = [...UI.elements.values()].filter(e => e.def.parent === 'fsActions' && e.def.kind === 'button' && e.def.id !== 'fsBtn');
    assert.equal(actionButtons.length, 4);
    // The click of the order puts the client in the mode of placing it.
    actionButtons[0]._click(actionButtons[0]);
    assert.equal(game.mode, 'placeOrder');
    assert.equal(game.pending.order, 'advance');

    // The operations phase: the orders of the player.
    const raw = FS_RULES.newGame({
        seed: 21,
        players: FS_DATA.factions.slice(0, 2).map((f, i) => ({ name: 'Игрок ' + (i + 1), faction: f })),
    });
    for (const p of raw.players) {
        for (let i = 0; i < FS_RULES.ORDER_TOKENS; i++) {
            const sys = raw.systems.find(x => FS_RULES.canPlaceOrder(raw, p.seat, x.id));
            FS_RULES.apply(raw, p.seat, { type: 'placeOrder', system: sys.id, order: 'advance' });
        }
    }
    game.onState(FS_RULES.view(raw, 0));
    assert.ok(UI.get('fsSideTitle').inner.textContent.includes('Операции'));
    const ops = [...UI.elements.values()].filter(e => e.def.parent === 'fsActions' && e.def.kind === 'button' && e.def.id !== 'fsBtn');
    assert.ok(ops.length >= 1);
    // The click of the order sends the command.
    ops[0]._click(ops[0]);
    assert.ok(sent.some(c => c.type === 'resolveOrder'));
});

test('the client: every command of the panels is known to the rules', () => {
    // The commands the client sends must be understood by the rules engine.
    const source = readFileSync(new URL('../js/fs/FSGame.js', import.meta.url), 'utf8');
    const sent = new Set();
    for (const m of source.matchAll(/this\.net\.cmd\(\{\s*type:\s*'([^']+)'/g)) sent.add(m[1]);
    assert.ok(sent.size >= 8, 'the client sends the commands');
    const rules = readFileSync(new URL('../js/fs/FSRules.js', import.meta.url), 'utf8');
    const known = new Set();
    for (const m of rules.matchAll(/case '([a-zA-Z]+)': return this\.cmd/g)) known.add(m[1]);
    for (const type of sent) {
        assert.ok(known.has(type), 'the rules know the command ' + type);
    }
});

test('the client: the game over is shown', () => {
    UI.init(canvas);
    const game = new FSGame(app);
    const state = FS_RULES.view(FS_RULES.newGame({
        seed: 22,
        players: FS_DATA.factions.slice(0, 2).map((f, i) => ({ name: 'Игрок ' + (i + 1), faction: f })),
    }), 0);
    state.over = true;
    state.winner = 1;
    game.onState(state);
    assert.equal(UI.get('fsSideTitle').inner.textContent, 'Игра окончена');
    assert.ok(UI.get('fsSideText').inner.textContent.includes('Игрок 2'));
});
