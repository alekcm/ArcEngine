// The test modes of the lobby over the socket: the ready map and the battlefield.
// One person plays both seats, so the server sends the view of the seat that has
// to act — the planner, the fighter of the current step, the drawer of the event.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { ROOT, loadScripts } from './browser-scripts.mjs';

const { get } = loadScripts(['js/fs/FSData.js', 'js/fs/FSEffects.js', 'js/fs/FSRules.js']);
const FS_DATA = get('FS_DATA');
const FS_RULES = get('FS_RULES');

const PORT = 18600 + (process.pid % 300);

function startServer() {
    const proc = spawn(process.execPath, ['tools/fs-server.mjs', '--port=' + PORT], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    return new Promise((resolve, reject) => {
        let out = '';
        const timer = setTimeout(() => reject(new Error('the server did not start: ' + out)), 8000);
        proc.stdout.on('data', chunk => {
            out += chunk.toString();
            if (out.includes('http://localhost:')) { clearTimeout(timer); resolve(proc); }
        });
        proc.stderr.on('data', chunk => { out += chunk.toString(); });
        proc.on('exit', code => { clearTimeout(timer); reject(new Error('the server exited: ' + code + ' ' + out)); });
    });
}

function connect() {
    const ws = new WebSocket('ws://127.0.0.1:' + PORT + '/ws');
    const messages = [];
    ws.addEventListener('message', ev => messages.push(JSON.parse(ev.data)));
    return {
        ws,
        messages,
        open: new Promise((resolve, reject) => {
            ws.addEventListener('open', () => resolve());
            ws.addEventListener('error', () => reject(new Error('the socket failed')));
        }),
        send(obj) { ws.send(JSON.stringify(obj)); },
        view() {
            const list = messages.filter(m => m.t === 'state');
            return list.length ? list[list.length - 1].view : null;
        },
        errors() { return messages.filter(m => m.t === 'err').map(m => m.msg); },
        close() { ws.close(); },
    };
}

const wait = ms => new Promise(r => setTimeout(r, ms));

// A command: the state that follows it.
async function send(client, cmd) {
    const before = client.messages.filter(m => m.t === 'state').length;
    client.send({ t: 'cmd', cmd });
    for (let i = 0; i < 300; i++) {
        const list = client.messages.filter(m => m.t === 'state');
        if (list.length > before) return list[list.length - 1].view;
        await wait(10);
    }
    throw new Error('no state after ' + JSON.stringify(cmd));
}

// One client in a fresh room with a chosen faction.
async function soloClient(faction) {
    const client = connect();
    await client.open;
    client.send({ t: 'hello', room: '', name: 'Тестер' });
    await wait(120);
    client.send({ t: 'faction', faction });
    await wait(120);
    return client;
}

test('the test mode: the ready map starts 1×1 straight at the planning', async t => {
    const proc = await startServer();
    t.after(() => proc.kill());
    const a = await soloClient('имперская-гвардия');
    t.after(() => a.close());

    a.send({ t: 'test', mode: 'map' });
    await wait(250);
    const view = a.view();
    assert.ok(view, 'the state came');
    assert.equal(view.solo, true, 'one person plays both seats');
    assert.equal(view.mode, 'map');
    assert.equal(view.phase, 'planning', 'the board is already assembled');
    assert.equal(view.setup, null, 'there is nothing to assemble');
    assert.equal(view.systems.length, 6, 'the map of a 1×1 party');
    assert.ok(view.units.length > 0, 'the initial forces are on the board');
    assert.ok(view.objectives.length > 0, 'the objective tokens are placed');
    assert.equal(view.players[1].name, 'Противник', 'the second seat is the opponent');
    assert.notEqual(view.players[0].faction, view.players[1].faction);

    // The planning: the seat with tokens in hand acts, and the view follows it.
    let state = view;
    const seats = new Set();
    for (let i = 0; i < 8 && state.phase === 'planning'; i++) {
        const seat = state.seat;
        seats.add(seat);
        const legal = state.systems.filter(sys => FS_RULES.canPlaceOrder(state, seat, sys.id));
        assert.ok(legal.length, 'the player has a system for an order');
        const tokens = state.systems.reduce((n, sys) => n + sys.tokens.length, 0);
        state = await send(a, { type: 'placeOrder', system: legal[0].id, order: 'advance' });
        assert.equal(state.systems.reduce((n, sys) => n + sys.tokens.length, 0), tokens + 1, 'the order token is on the board');
    }
    assert.equal(state.phase, 'operations', 'eight orders end the planning');
    assert.deepEqual([...seats].sort(), [0, 1], 'both seats were played from one client');
    assert.equal(state.seat, state.turn, 'the operations go to the seat whose turn it is');
    assert.equal(a.errors().length, 0, 'no command was refused: ' + a.errors().join('; '));
});

test('the test mode: the battlefield takes the chosen troops and cards', async t => {
    const proc = await startServer();
    t.after(() => proc.kill());
    const a = await soloClient('орки');
    t.after(() => a.close());

    const orks = FS_DATA.factions.find(f => f.id === 'орки');
    const ground = orks.units.filter(u => u.type !== 'ship');
    const baseCards = FS_DATA.combat.filter(c => c.faction === 'орки' && !c.upgrade).map(c => c.name);
    const chosenCard = baseCards[0];

    a.send({
        t: 'test', mode: 'battle',
        battle: { kind: 'ground', units: { [ground[0].id]: 3 }, cards: [chosenCard, 'не-карта'] },
    });
    await wait(250);
    const view = a.view();
    assert.ok(view.combat, 'the combat is on');
    assert.equal(view.solo, true);
    assert.equal(view.mode, 'battle');
    assert.equal(view.combat.step, 'reinforce-attacker', 'the fight opens with the reinforcements');

    // Only the chosen troops are on the field, and only of the chosen kind.
    const mine = view.units.filter(u => u.seat === 0);
    assert.equal(mine.length, 3, 'three chosen troops');
    for (const u of mine) assert.equal(u.unit, ground[0].id);
    const area = view.systems.find(s => s.id === view.combat.system).areas.find(x => x.pos === view.combat.pos);
    assert.ok(area.world, 'the ground battle is fought on a world');
    for (const u of view.units) {
        assert.equal(u.system, view.combat.system);
        assert.equal(u.area, view.combat.pos);
    }
    // The deck of the chosen cards: two copies, no foreign cards.
    const hand = view.combat.cards.attacker.hand;
    assert.ok(hand.length > 0, 'the attacker holds cards');
    for (const card of hand) assert.equal(card, chosenCard);

    // The whole first round: the reinforcement, the cards, the damage.
    let state = view;
    state = await send(a, { type: 'combat', action: 'reinforce', count: 0 });
    assert.equal(state.seat, 1, 'the defender chooses his reinforcements next');
    assert.equal(state.combat.step, 'reinforce-defender');
    assert.deepEqual(state.combat.cards.defender.hand.length > 0, true, 'the defender sees his own hand');
    assert.equal(state.combat.cards.attacker.hand.length, 0, 'and not the hand of the attacker');

    state = await send(a, { type: 'combat', action: 'reinforce', count: 0 });
    assert.equal(state.combat.step, 'choose-attacker');
    assert.equal(state.seat, 0);
    assert.ok(state.combat.cards.attacker.hand.length > 0, 'the attacker sees his hand again');
    state = await send(a, { type: 'combat', action: 'playCard', index: 0 });
    assert.ok(state.combat.cards.attacker.played.length === 1 || state.pending, 'the card is played');
    if (state.combat.step === 'choose-attacker') {
        state = await send(a, { type: 'combat', action: 'skipCard' });
    }
    while (state.pending) {
        const pending = state.pending;
        const q = pending.question || {};
        let answer = {};
        if (q.kind === 'units') answer = { units: (q.options || []).slice(0, q.n || 1) };
        else if (q.kind === 'dice' || q.kind === 'face') answer = { dice: (q.options || []).slice(0, 1), face: 'att' };
        else if (q.kind === 'yesno') answer = { dice: [] };
        else if (q.kind === 'cards') answer = { card: (q.options || [])[0] };
        else if (q.kind === 'choice') answer = { choice: 0 };
        else if (q.kind === 'areas') answer = { area: (q.options || [])[0] };
        else if (q.kind === 'types') answer = { type: (q.options || [])[0] };
        else if (q.kind === 'assets' || q.kind === 'assetType') answer = { asset: (q.options || [])[0] };
        else if (q.kind === 'scheme') answer = { choice: 0 };
        else if (q.kind === 'modules') answer = null;
        if (!answer) break;
        const before = JSON.stringify(pending);
        state = await send(a, { type: 'effect', answer });
        if (JSON.stringify(state.pending) === before) break;
    }
    assert.ok(state.combat, 'the combat goes on');
    assert.equal(a.errors().length, 0, 'no command was refused: ' + a.errors().join('; '));
});

test('the test mode: the rules build the map and the field without the players', () => {
    const players = [
        { name: 'Первый', faction: FS_DATA.factions[0].id },
        { name: 'Второй', faction: FS_DATA.factions[1].id },
    ];
    const map = FS_RULES.newReadyGame({ seed: 11, players });
    assert.equal(map.phase, 'planning');
    assert.equal(map.setup, null);
    assert.equal(map.systems.length, 6);
    assert.ok(map.storms.length >= 1, 'the storms are rolled');
    assert.equal(map.testMode, 'map');

    const ground = FS_DATA.factions[0].units.filter(u => u.type !== 'ship');
    const ships = FS_DATA.factions[0].units.filter(u => u.type === 'ship');
    const cards = FS_DATA.combat.filter(c => c.faction === FS_DATA.factions[0].id && !c.upgrade).map(c => c.name);

    const field = FS_RULES.newBattleTest({
        seed: 12, players, kind: 'ground',
        units: { [ground[0].id]: 2, [ships[0].id]: 2 },
        cards: [cards[0], cards[1]],
    });
    // The ships do not march into a ground battle.
    assert.equal(field.units.filter(u => u.seat === 0).length, 2);
    for (const u of field.units) assert.notEqual(u.unit, ships[0].id);
    assert.equal(field.combat.step, 'reinforce-attacker');
    // Two copies of the two chosen cards — and enough to deal a hand of five.
    assert.equal(new Set(field.combat.cards.attacker.hand).size, 2);
    assert.equal(field.combat.cards.attacker.hand.length, 5);

    const space = FS_RULES.newBattleTest({
        seed: 13, players, kind: 'space', units: { [ships[1].id]: 3 }, cards,
    });
    const spaceArea = space.systems.find(s => s.id === space.combat.system).areas.find(a => a.pos === space.combat.pos);
    assert.ok(!spaceArea.world, 'the space battle is fought over the system');
    for (const u of space.units.filter(x => x.seat === 0)) assert.equal(u.unit, ships[1].id);
    assert.equal(space.units.filter(u => u.seat === 0).length, 3);

    // The loser leaves the field — a test battle stays on the board.
    space.combat.loser = 1;
    const retreat = FS_RULES.apply(space, 1, { type: 'combat', action: 'retreat' });
    assert.equal(retreat.ok, true);
    assert.equal(space.combat, null, 'the fight is over');
    assert.equal(space.phase, 'operations', 'the test battle does not run the ordinary turn order');

    // The same battle again: the fallen return and the decks are dealt anew.
    const before = space.units.length;
    const again = FS_RULES.apply(space, 0, { type: 'rematchBattle' });
    assert.equal(again.ok, true);
    assert.equal(space.units.length, before, 'the roster is restored');
    assert.equal(space.combat.step, 'reinforce-attacker');
    assert.equal(space.combat.round, 1);
});
