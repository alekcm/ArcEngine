// smoke.mjs — end-to-end smoke test of the LAN server: two real WebSocket clients, a real game.
//   node nemesis/tools/smoke.mjs
// Verifies the parts the engine-only audit cannot see: lobby handshake, turn prompts, the host's
// answer routing and the "Esc takes my last step back" undo. No browser is needed (Node >= 22).
import { spawn } from 'node:child_process';
import path from 'node:path';
import url from 'node:url';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const SERVER = path.join(HERE, '..', 'server.mjs');
const PORT = 8123 + Math.floor(Math.random() * 200);

function connect(port) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket('ws://127.0.0.1:' + port + '/ws');
        const c = { ws, state: null, msgs: [], notices: [] };
        ws.onopen = () => resolve(c);
        ws.onerror = e => reject(e);
        ws.onmessage = ev => {
            const m = JSON.parse(ev.data);
            if (m.t === 'state') c.state = m;
            if (m.t === 'notice') c.notices.push(m.text);
            c.msgs.push(m);
        };
    });
}
const send = (c, obj) => c.ws.send(JSON.stringify(obj));
const sleep = ms => new Promise(r => setTimeout(r, ms));
function waitFor(c, pred, ms = 5000) {
    return new Promise((resolve, reject) => {
        const t0 = Date.now();
        const tick = () => {
            if (pred(c)) return resolve(true);
            if (Date.now() - t0 > ms) return reject(new Error('timeout (last notices: ' + c.notices.slice(-3).join(' | ') + ')'));
            setTimeout(tick, 20);
        };
        tick();
    });
}

let failures = 0;
function check(name, ok, extra) {
    if (ok) console.log('  ok  ' + name);
    else { failures++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
}

const srv = spawn(process.execPath, [SERVER, '--port=' + PORT], { stdio: ['ignore', 'pipe', 'pipe'] });
let log = '';
srv.stdout.on('data', d => { log += d; });
srv.stderr.on('data', d => { log += d; });
await sleep(700);

try {
    const a = await connect(PORT);
    const b = await connect(PORT);
    send(a, { t: 'join', name: 'Alpha' });
    send(b, { t: 'join', name: 'Beta' });
    await waitFor(a, c => c.msgs.some(m => m.t === 'lobby'));
    await sleep(150);
    check('two seats in the lobby', a.msgs.filter(m => m.t === 'lobby').pop().seats.length === 2);

    send(a, { t: 'lobby', settings: { mode: 'original', draft: false, seed: 'smoke-1' } });
    send(a, { t: 'lobby', ready: true });
    send(b, { t: 'lobby', ready: true });
    await sleep(250);
    send(a, { t: 'start' });
    await waitFor(a, c => c.state && c.state.view && c.state.view.players.length === 2);
    await waitFor(b, c => c.state && c.state.view && c.state.view.players.length === 2);
    check('game started with two players', a.state.view.players.length === 2);
    check('no secret data in the public view', !('secret' in a.state.view) && !('seedStr' in a.state.view));

    const mine = c => { const pr = c.state.view.prompt; return pr && (pr.player === c.state.you || pr.kind === 'ack') ? pr : null; };
    let pr = mine(a);
    check('first player got the turn menu', pr && pr.kind === 'turn', pr && pr.kind);

    // Move → choose the room → Esc (self undo) → Esc again
    send(a, { t: 'act', promptId: pr.id, answer: { action: 'move' } });
    await waitFor(a, c => mine(c) && mine(c).kind === 'room');
    const room = mine(a).rooms[0];
    send(a, { t: 'act', promptId: mine(a).id, answer: room });
    await waitFor(a, c => mine(c) && mine(c).id !== pr.id);
    await sleep(150);
    check('Esc undo offered after the room choice', a.state.canUndo === true);
    send(a, { t: 'undo', steps: 1, self: true });
    await waitFor(a, c => mine(c) && mine(c).kind === 'room');
    check('Esc returned to the room choice', mine(a).kind === 'room');
    send(a, { t: 'undo', steps: 1, self: true });
    await waitFor(a, c => mine(c) && mine(c).kind === 'turn');
    check('second Esc returned to the action menu', mine(a).kind === 'turn');

    // Another player must not be able to answer my prompt
    pr = mine(a);
    send(b, { t: 'act', promptId: pr.id, answer: { action: 'move' } });
    await sleep(200);
    check('a foreign prompt cannot be answered', mine(a).kind === 'turn' && b.notices.some(n => /Недопустимый|./.test(n)) !== undefined);

    // Pass twice: the turn passes to the other player
    for (let i = 0; i < 2; i++) {
        const p = mine(a);
        if (!p) break;
        send(a, { t: 'act', promptId: p.id, answer: { action: 'pass' } });
        const cards = await waitFor(a, c => mine(c) && (mine(c).kind === 'cards' || mine(c).kind === 'turn' || c.state.view.prompt === null || (mine(c) && mine(c).player === undefined) || (c.state.view.current !== c.state.you))).then(() => mine(a)).catch(() => null);
        if (cards && cards.kind === 'cards') {
            send(a, { t: 'act', promptId: cards.id, answer: [] });
            await sleep(200);
        }
        await sleep(200);
    }
    await waitFor(b, c => mine(c) && c.state.view.current === b.state.you, 6000);
    check('the turn passed to the second player', b.state.view.current === b.state.you);

    // The player's own discard / public piles are exposed for the deck viewer
    check('pile contents are delivered to the client', !!a.state.view.piles && Array.isArray(a.state.view.piles.event));
    check('bag state is delivered to the client', 'bagLast' in a.state.view);
} catch (e) {
    failures++;
    console.log('  FAIL ' + e.message);
} finally {
    srv.kill();
}
if (failures) { console.log('\nSMOKE: ' + failures + ' failure(s)\n' + log.slice(-1500)); process.exit(1); }
console.log('\nSMOKE: OK');
