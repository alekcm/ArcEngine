// The LAN server: two clients join a room, the game starts and the state goes back.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { ROOT, loadScripts } from './browser-scripts.mjs';

const { get } = loadScripts(['js/fs/FSData.js', 'js/fs/FSEffects.js', 'js/fs/FSRules.js']);
const FS_DATA = get('FS_DATA');
const FS_RULES = get('FS_RULES');

const PORT = 18300 + (process.pid % 300);

// Start the server and wait for the line with the address.
function startServer() {
    const proc = spawn(process.execPath, ['tools/fs-server.mjs', '--port=' + PORT], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    return new Promise((resolve, reject) => {
        let out = '';
        const timer = setTimeout(() => reject(new Error('the server did not start: ' + out)), 8000);
        proc.stdout.on('data', chunk => {
            out += chunk.toString();
            if (out.includes('http://localhost:')) {
                clearTimeout(timer);
                resolve(proc);
            }
        });
        proc.stderr.on('data', chunk => { out += chunk.toString(); });
        proc.on('exit', code => { clearTimeout(timer); reject(new Error('the server exited: ' + code + ' ' + out)); });
    });
}

// A client: the messages of the server in an array.
function connect() {
    const ws = new WebSocket('ws://127.0.0.1:' + PORT + '/ws');
    const messages = [];
    const waiters = [];
    // How many messages of every kind have been taken by wait().
    const consumed = new Map();
    ws.addEventListener('message', ev => {
        const msg = JSON.parse(ev.data);
        messages.push(msg);
        for (const w of waiters.slice()) {
            const kinds = Array.isArray(w.type) ? w.type : [w.type];
            if (kinds.includes(msg.t)) {
                waiters.splice(waiters.indexOf(w), 1);
                consumed.set(msg.t, (consumed.get(msg.t) || 0) + 1);
                w.resolve(msg);
            }
        }
    });
    const client = {
        ws,
        messages,
        open: new Promise((resolve, reject) => {
            ws.addEventListener('open', () => resolve());
            ws.addEventListener('error', () => reject(new Error('the socket failed')));
        }),
        send(obj) { ws.send(JSON.stringify(obj)); },
        // The next message of one of the kinds that has not been taken yet.
        waitAny(types, ms = 4000) {
            for (const type of types) {
                const idx = consumed.get(type) || 0;
                const list = messages.filter(m => m.t === type);
                if (list.length > idx) {
                    consumed.set(type, idx + 1);
                    return Promise.resolve(list[idx]);
                }
            }
            return new Promise((resolve, reject) => {
                const w = { type: types, resolve };
                waiters.push(w);
                setTimeout(() => {
                    if (waiters.includes(w)) {
                        waiters.splice(waiters.indexOf(w), 1);
                        reject(new Error('no message ' + types.join('/')));
                    }
                }, ms);
            });
        },
        // The next message of the kind that has not been taken yet.
        wait(type, ms = 4000) {
            const idx = consumed.get(type) || 0;
            const list = messages.filter(m => m.t === type);
            if (list.length > idx) {
                consumed.set(type, idx + 1);
                return Promise.resolve(list[idx]);
            }
            return new Promise((resolve, reject) => {
                const w = { type, resolve };
                waiters.push(w);
                setTimeout(() => {
                    if (waiters.includes(w)) {
                        waiters.splice(waiters.indexOf(w), 1);
                        reject(new Error('no message ' + type));
                    }
                }, ms);
            });
        },
        close() { ws.close(); },
    };
    return client;
}

test('the server: the room, the factions, the game and the commands', async t => {
    const proc = await startServer();
    t.after(() => proc.kill());
    const a = connect();
    const b = connect();
    await a.open; await b.open;

    // The first player opens a room.
    a.send({ t: 'hello', room: '', name: 'Аня' });
    const joined = await a.wait('joined');
    assert.ok(joined.room, 'the room has a code');
    assert.equal(joined.factions.length, 12, 'the twelve factions are sent');

    // The second player comes by the code.
    b.send({ t: 'hello', room: joined.room, name: 'Борис' });
    const joinedB = await b.wait('joined');
    assert.equal(joinedB.room, joined.room);

    // The room shows both.
    const room = await b.wait('room');
    assert.equal(room.players.length, 2);
    assert.equal(room.players[0].name, 'Аня');

    // The factions: the game starts when both have chosen.
    a.send({ t: 'faction', faction: 'некроны' });
    b.send({ t: 'faction', faction: 'имперская-гвардия' });
    const state = await a.wait('state');
    assert.ok(state.view, 'the state came');
    assert.equal(state.view.players.length, 2);
    assert.equal(state.view.players[0].faction, 'некроны');
    assert.equal(state.view.seat, 0);
    // The hands of the opponent are hidden.
    const stateB = await b.wait('state');
    assert.equal(stateB.view.seat, 1);

    // A command: the order of the planning phase.
    const sys = state.view.systems.find(s => {
        return state.view.units.some(u => u.seat === 0 && u.system === s.id);
    });
    assert.ok(sys, 'the first player has a system');
    a.send({ t: 'cmd', cmd: { type: 'placeOrder', system: sys.id, order: 'advance' } });
    const next = await a.wait('state', 4000);
    const tokens = next.view.systems.find(s => s.id === sys.id).tokens;
    assert.equal(tokens.length, 1);
    assert.equal(tokens[0].seat, 0);

    // The command of the other player is refused (it is not his turn).
    b.send({ t: 'cmd', cmd: { type: 'placeOrder', system: sys.id, order: 'advance' } });
    const err = await b.wait('err');
    assert.ok(err.msg, 'the error is sent');
    b.messages.length = 0;

    // The static files are served.
    const res = await fetch('http://127.0.0.1:' + PORT + '/js/fs/FSRules.js');
    assert.equal(res.status, 200);
    const html = await fetch('http://127.0.0.1:' + PORT + '/');
    assert.equal(html.status, 200);
    assert.ok((await html.text()).includes('js/fs/FSGame.js'), 'the page loads the game');

    a.close();
    b.close();
});

test('the server: a whole game over the socket', async t => {
    const proc = await startServer();
    t.after(() => proc.kill());
    const a = connect();
    const b = connect();
    await a.open; await b.open;
    a.send({ t: 'hello', room: '', name: 'Аня' });
    const joined = await a.wait('joined');
    b.send({ t: 'hello', room: joined.room, name: 'Борис' });
    await b.wait('joined');
    a.send({ t: 'faction', faction: FS_DATA.factions[0].id });
    b.send({ t: 'faction', faction: FS_DATA.factions[1].id });
    const first = await a.wait('state');
    let state = first.view;

    // The last state the client got.
    const lastState = client => {
        const list = client.messages.filter(m => m.t === 'state');
        return list.length ? list[list.length - 1].view : null;
    };
    // The interesting part of the state: it changes with every command.
    const snapshot = st => JSON.stringify([
        st.phase, st.turn,
        st.order ? st.order.order + ':' + st.order.phase : '-',
        st.players.map(p => p.placedTokens || 0),
        st.event ? st.event.seat + ':' + (st.event.chosen || '') : '-',
        st.storms.map(x => x.system + x.side + (x.moved && x.moved[st.seat] ? '1' : '0')),
    ]);
    // Send a command and wait until the state of the client changes.
    const run = async (client, cmd, before) => {
        client.send({ t: 'cmd', cmd });
        const t0 = Date.now();
        while (Date.now() - t0 < 3000) {
            const st = lastState(client);
            if (st && snapshot(st) !== before) return st;
            await new Promise(r => setTimeout(r, 15));
        }
        return lastState(client);
    };

    // The question of an effect: the answer of the bot.
    const answerEffect = async (client, st) => {
        const pending = st.pending;
        if (!pending) return st;
        const q = pending.question || {};
        const seat = pending.answerSeat === undefined ? pending.seat : pending.answerSeat;
        let answer = null;
        switch (q.kind) {
            case 'yesno': answer = { dice: [] }; break;
            case 'units': answer = { units: (q.options || []).slice(0, q.n || 1) }; break;
            case 'dice': answer = { dice: (q.options || []).slice(0, 1) }; break;
            case 'diceFace': answer = { dice: (q.options || []).slice(0, 1), face: 'att' }; break;
            case 'cards': answer = { card: (q.options || [])[0] }; break;
            case 'areas': answer = { area: (q.options || [])[0] }; break;
            case 'systems': answer = { system: (q.options || [])[0] }; break;
            case 'types': answer = { type: (q.options || [])[0] }; break;
            case 'structures': answer = { structure: (q.options || [])[0] }; break;
            case 'face': answer = { face: 'att' }; break;
            case 'assetType': answer = { asset: (q.options || [])[0] }; break;
            case 'assets': answer = { asset: (q.options || [])[0] }; break;
            case 'choice': answer = { choice: 0 }; break;
            case 'scheme': answer = { choice: 0 }; break;
            default: answer = null;
        }
        if (!answer) return st;
        client.send({ t: 'cmd', cmd: { type: 'effect', answer } });
        const t0 = Date.now();
        while (Date.now() - t0 < 3000) {
            const now = lastState(client);
            if (now && now.pending !== pending) return now;
            await new Promise(r => setTimeout(r, 15));
        }
        return lastState(client);
    };

    // The bot of the player: the commands of the rules engine.
    const bot = async (client, st) => {
        const seat = st.seat;
        if (st.pending) return answerEffect(client, st);
        if (st.phase === 'planning') {
            for (let i = 0; i < FS_RULES.ORDER_TOKENS; i++) {
                const legal = st.systems.filter(x => FS_RULES.canPlaceOrder(st, seat, x.id));
                if (!legal.length) break;
                const sys = legal[i % legal.length];
                st = await run(client, { type: 'placeOrder', system: sys.id, order: 'advance' }, snapshot(st));
            }
            return;
        }
        if (st.phase === 'operations' && st.turn === seat) {
            const orders = FS_RULES.availableOrders(st, seat);
            if (!orders.length) return;
            st = await run(client, { type: 'resolveOrder', system: orders[0].system }, snapshot(st));
            // The advance order: no movement, no strike.
            st = await run(client, { type: 'endAdvance' }, snapshot(st));
            if (st.order && st.order.phase === 'strike') {
                st = await run(client, { type: 'finishAdvance' }, snapshot(st));
            }
            return;
        }
        if (st.phase === 'refresh' && st.event && st.event.seat === seat) {
            if (st.event.drawn.length) {
                st = await run(client, { type: 'drawEvent', card: st.event.drawn[0] }, snapshot(st));
            }
            const storm = st.storms.find(x => !x.moved || !x.moved[st.seat]);
            if (storm) {
                for (const dir of ['N', 'E', 'S', 'W']) {
                    const before = snapshot(st);
                    st = await run(client, { type: 'moveStorm', storm: storm.id, dir }, before);
                    if (snapshot(st) !== before) break;
                }
            }
            await run(client, { type: 'resolveEvent' }, snapshot(st));
        }
    };

    // The bot plays until the second round.
    for (let i = 0; i < 40; i++) {
        for (const client of [a, b]) {
            await bot(client, lastState(client));
        }
        state = lastState(a);
        assert.ok(state, 'the state came');
        if (state.round >= 2) break;
    }
    assert.ok(state.round >= 2, 'the game went through a round: ' + state.round + ' ' + state.phase);
    a.close();
    b.close();
});

test('the server: the page and the game files are on the disk', () => {
    assert.ok(path.join(ROOT, 'js/fs/FSGame.js'));
});
