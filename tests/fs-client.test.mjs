// The client of the game: the panels of the phases and the actions of the player.
// The client is loaded like the browser does it; the 3D and the network are not needed
// for the logic of the panels.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScripts } from './browser-scripts.mjs';

const { get } = loadScripts(['js/fs/FSData.js', 'js/fs/FSRules.js', 'js/fs/FSGame.js']);
const FS_DATA = get('FS_DATA');
const FS_RULES = get('FS_RULES');
const FSGame = get('FSGame');

// A client without the 3D and without the network: only the panels.
function fakeClient(state) {
    const sent = [];
    const client = Object.create(FSGame.prototype);
    Object.assign(client, {
        state,
        mode: 'idle',
        pending: null,
        damageTargets: [],
        status: '',
        lastCard: null,
        sent,
        view: { metrics: null, scene: null, highlights: [] },
        app: { location: { width: 2048, height: 2048, terrain: { heightAt: () => 0 } }, camera: {} },
        net: { cmd: c => sent.push(c), faction: () => { } },
        refresh() { },
        highlightMove() { },
    });
    return client;
}

// The panel of the phase with the actions it offers.
function panel(client, phase) {
    const ctx = { title: '', text: '', status: '', actions: [] };
    const s = client.state;
    if (phase === 'planning') client.panelPlanning(s, ctx);
    else if (phase === 'operations') client.panelOperations(s, ctx);
    else if (phase === 'refresh') client.panelRefresh(s, ctx);
    return ctx;
}

function rawGame(count = 2, seed = 5) {
    return FS_RULES.newGame({
        seed,
        players: FS_DATA.factions.slice(0, count).map((f, i) => ({ name: 'Игрок ' + (i + 1), faction: f })),
    });
}

// The state of the client: the view of the rules engine for the first player.
function newGame(count = 2, seed = 5) {
    return FS_RULES.view(rawGame(count, seed), 0);
}

test('the client: the planning phase offers the four orders', () => {
    const state = newGame();
    const client = fakeClient(state);
    const ctx = panel(client, 'planning');
    assert.equal(ctx.actions.length, 4);
    assert.deepEqual(ctx.actions.map(a => a.label), ['Наступление', 'Развёртывание', 'Стратегия', 'Доминирование']);
    assert.ok(ctx.text.includes('0 из 4'), 'the counter of the orders is shown');
});

test('the client: the operations phase lists the orders of the player', () => {
    const raw = rawGame();
    for (const p of raw.players) {
        for (let i = 0; i < FS_RULES.ORDER_TOKENS; i++) {
            const sys = raw.systems.find(x => FS_RULES.canPlaceOrder(raw, p.seat, x.id));
            FS_RULES.apply(raw, p.seat, { type: 'placeOrder', system: sys.id, order: 'advance' });
        }
    }
    const state = FS_RULES.view(raw, 0);
    const client = fakeClient(state);
    const ctx = panel(client, 'operations');
    assert.ok(ctx.actions.length >= 2, 'the orders of the player are listed');
    assert.ok(ctx.actions[0].label.includes('наступление'), ctx.actions[0].label);
});

test('the client: the advance order offers the units and the end of the movement', () => {
    const state = newGame();
    state.order = { seat: 0, order: 'advance', system: state.systems[0].id, phase: 'move' };
    const client = fakeClient(state);
    const ctx = { title: '', text: '', status: '', actions: [] };
    client.panelAdvance(state, ctx);
    assert.ok(ctx.actions.length >= 1);
    assert.equal(ctx.actions[ctx.actions.length - 1].label, 'Закончить движение');
});

test('the client: the deploy order offers the units of the supply', () => {
    const state = newGame();
    const seat = 0;
    const p = state.players[seat];
    p.supply.units[Object.keys(p.supply.units)[0]] = 2;
    state.order = { seat, order: 'deploy', system: state.systems[0].id, phase: 'deploy' };
    const client = fakeClient(state);
    const ctx = { title: '', text: '', status: '', actions: [] };
    client.panelDeploy(state, ctx);
    assert.ok(ctx.actions.length >= 1);
    assert.equal(ctx.actions[ctx.actions.length - 1].label, 'Закончить развёртывание');
});

test('the client: the refresh phase offers the event cards', () => {
    const state = newGame();
    state.phase = 'refresh';
    state.event = { seat: 0, drawn: ['Какая-то карта'], chosen: null };
    const client = fakeClient(state);
    const ctx = panel(client, 'refresh');
    assert.equal(ctx.actions.length, 1);
    assert.ok(ctx.actions[0].label.includes('Какая-то карта'));
});

test('the client: the combat panel follows the steps of the combat', () => {
    const raw = rawGame();
    const sys = raw.systems[0];
    const area = sys.areas.find(a => a.world);
    for (const u of raw.units) { u.system = sys.id; u.area = area.pos; }
    FS_RULES.startCombat(raw, 0, 1, sys.id, area.pos);
    const state = FS_RULES.view(raw, 0);
    const client = fakeClient(state);
    const ctx = { title: '', text: '', status: '', actions: [] };
    client.panelCombat(state, ctx);
    // The preparation: the reinforcement tokens of the attacker.
    assert.ok(ctx.actions.length >= 1);
    assert.ok(ctx.actions[0].label.includes('Подкреплений'));
    // The choice of the card.
    state.combat.step = 'choose-attacker';
    const ctx2 = { title: '', text: '', status: '', actions: [] };
    client.panelCombat(state, ctx2);
    assert.ok(ctx2.actions.length >= 6, 'the five cards of the hand and the skip');
});
