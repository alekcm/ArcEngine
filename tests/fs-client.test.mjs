// The client of the game: the panels of the phases and the actions of the player.
// The client is loaded like the browser does it; the 3D and the network are not needed
// for the logic of the panels.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScripts } from './browser-scripts.mjs';

const { get } = loadScripts(['js/fs/FSData.js', 'js/fs/FSEffects.js', 'js/fs/FSRules.js', 'js/fs/FSGame.js']);
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
        selected: [],
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
    // The counter of the orders is one counted token among the others: "4× Приказы в руке".
    assert.equal(ctx.tokens[0].label, 'Приказы в руке');
    assert.equal(ctx.tokens[0].count, FS_RULES.ORDER_TOKENS);
    assert.equal(ctx.tokens[0].count + '× ' + ctx.tokens[0].label, '4× Приказы в руке');
});

test('the client: the operations phase lists the orders of the player', () => {
    const state = newGame();
    state.phase = 'operations';
    state.turn = 0;
    state.order = null;
    // Two own tokens on top of two systems: both are the player's to open.
    state.systems[0].tokens = [{ seat: 0, order: 'advance', faceUp: false }];
    state.systems[1].tokens = [{ seat: 0, order: 'deploy', faceUp: false }];
    const client = fakeClient(state);
    const ctx = panel(client, 'operations');
    assert.equal(ctx.actions.length, 2, 'the orders of the player are listed');
    // The compact list shows the system and the order as a hint, not a wall of text.
    assert.deepEqual(ctx.actions.map(a => a.hint), ['наступление', 'развёртывание']);
    assert.equal(ctx.actions[0].label, state.systems[0].tile);
    // The corner counts only the resources of the player: the whole list of the
    // order tokens lives in its own window, not in the column.
    const byKind = Object.fromEntries(ctx.tokens.map(t => [t.label, t.count]));
    assert.equal(byKind['Наступление'], undefined, 'the orders are not listed here');
    assert.equal(byKind['Материя'], state.players[0].materiel);
    assert.equal(ctx.tokens.length, 3, 'the three counters of the player');
    // The click opens the order on the board instead of sending it at once.
    client.pending = null;
    client.refresh = () => { };
    ctx.actions[0].onClick();
    assert.equal(client.mode, 'order');
    assert.equal(client.pending.system, state.systems[0].id);
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
    // The drawn cards are the hand of the moment: one card, counted, with its type.
    assert.equal(ctx.hand.length, 1);
    assert.ok(ctx.hand[0].label.includes('Какая-то карта'));
    assert.equal(ctx.hand[0].count, 1);
    assert.equal(ctx.tokens[0].label, 'Жетоны событий');
    assert.equal(ctx.tokens[0].count, 1);
});

test('the client: the battlefield of the lobby is chosen by troops and cards', () => {
    const sent = [];
    const client = Object.create(FSGame.prototype);
    Object.assign(client, {
        faction: 'орки',
        battle: { kind: 'ground', units: {}, cards: [] },
        status: '',
        testMode: 'battle',
        // The socket adds the type of the message, as FSNet.test does.
        net: { connected: true, test: message => sent.push(Object.assign({ t: 'test' }, message)) },
        showLobby() { },
    });
    const faction = FS_DATA.factions.find(f => f.id === 'орки');
    const ground = faction.units.filter(u => u.type !== 'ship');
    const ships = faction.units.filter(u => u.type === 'ship');
    const cards = FS_DATA.combat.filter(c => c.faction === 'орки' && !c.upgrade).map(c => c.name);

    client.resetBattle('ground');
    let info = client.battleInfo();
    assert.deepEqual(info.units.map(u => u.id), ground.map(u => u.id), 'only the ground troops enter a ground battle');
    assert.equal(info.units[0].count, 2, 'two troops of the first kind are chosen');
    assert.equal(info.deck, cards.length * 2, 'the whole base deck: two copies of every card');

    // The count of a troop grows on a click and stops at four.
    client.onBattle({ toggleUnit: ground[0].id });
    assert.equal(client.battleInfo().units[0].count, 3);
    client.onBattle({ toggleUnit: ground[0].id });
    assert.equal(client.battleInfo().units[0].count, 0, 'the fourth click takes it off the field');
    client.onBattle({ toggleUnit: ground[0].id });

    // A card may be taken out of the deck and returned to it.
    client.onBattle({ toggleCard: cards[0] });
    assert.equal(client.battleInfo().deck, (cards.length - 1) * 2);
    client.onBattle({ toggleCard: cards[0] });
    assert.equal(client.battleInfo().deck, cards.length * 2);

    // The space battle: the ships, the deck is the same.
    client.onBattle({ kind: 'space' });
    info = client.battleInfo();
    assert.deepEqual(info.units.map(u => u.id), ships.map(u => u.id));
    assert.equal(info.kind, 'space');

    // The command of the start carries the chosen troops and cards.
    client.onBattle({ kind: 'ground' });
    client.startTest();
    assert.equal(sent.length, 1);
    assert.equal(sent[0].t, 'test');
    assert.equal(sent[0].mode, 'battle');
    assert.equal(sent[0].battle.kind, 'ground');
    assert.ok(Object.keys(sent[0].battle.units).length > 0, 'the troops are sent');
    assert.deepEqual(sent[0].battle.cards, cards, 'the deck is sent');

    // The ready map needs no troops at all.
    client.testMode = 'map';
    client.startTest();
    assert.equal(sent[1].mode, 'map');
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
    // The reinforcement tokens are counted, not written out in a sentence.
    assert.ok(ctx.actions.every(a => a.kind === 'pick'));
    assert.equal(ctx.actions[0].label, 'Без подкреплений');
    // The board of the battle: the dice of both sides and their totals.
    assert.ok(ctx.battle, 'the dice panel is there');
    assert.equal(ctx.battle.sides.length, 2);
    assert.ok(Array.isArray(ctx.battle.sides[0].dice));
    assert.ok(ctx.battle.sides[0].values && typeof ctx.battle.sides[0].values.att === 'number');
    // The choice of the card: the hand, and no way to skip it.
    state.combat.step = 'choose-attacker';
    const ctx2 = { title: '', text: '', status: '', actions: [] };
    client.panelCombat(state, ctx2);
    assert.ok(ctx2.actions.length >= 5, 'the five cards of the hand');
    assert.ok(ctx2.actions.every(a => a.kind === 'pick'), 'every action is a card');
    assert.ok(ctx2.actions.some(a => a.count && a.count.includes('⚔')), 'the icons of the card are counted');
    assert.ok(!ctx2.actions.some(a => /пропуст/i.test(a.label)), 'a card is never skipped');
    // The hand at the bottom of the screen holds the same cards.
    assert.equal(client.hand.length, 5);
    assert.ok(client.hand.every(c => c.playable));
    // The damage: the pieces to pick and the total that is left to place.
    state.combat.step = 'damage-attacker';
    const ctx3 = { title: '', text: '', status: '', actions: [] };
    client.damageTargets = [];
    client.panelCombat(state, ctx3);
    assert.ok(ctx3.battle.damage, 'the damage of the step is on the board');
    assert.ok(typeof ctx3.battle.damage.total === 'number');
    assert.ok(ctx3.battle.damage.rows.length >= 1, 'the pieces that may take the damage');
    const confirm = ctx3.actions.find(a => a.kind === 'primary');
    if (ctx3.battle.damage.total > 0) {
        assert.equal(confirm.enabled, false, 'nothing is accepted before the whole damage is placed');
        // A click on a piece takes it into the group of the damaged ones.
        const pick = ctx3.actions.find(a => a.kind === 'pick');
        pick.onClick();
        assert.equal(client.damageTargets.length, 1);
    }
});
