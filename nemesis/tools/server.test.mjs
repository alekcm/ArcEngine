// server.test.mjs — the game server as the browser sees it: a WebSocket at /ws that answers a join
// with the lobby (characters, seats, settings, addresses).
//
// This exists because the lobby once came up EMPTY — no characters, no players, no address — and the
// cause was not the client at all: `server.on('upgrade', …)` had been deleted from server.mjs while
// another feature was being reverted, so nothing ever upgraded and the page sat on static HTML with
// no state. A page that renders but never connects looks like a "saved a room and broke the lobby"
// bug; one test that actually opens the socket finds it in a second.
//   node --test nemesis/tools/server.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { characterParts, characterPartSlots, CREW_PARTS } from '../shared/appearance.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SERVER = path.join(HERE, '..', 'server.mjs');
const SRC = fs.readFileSync(SERVER, 'utf8');
const CLIENT_SRC = fs.readFileSync(path.join(HERE, '..', 'client', 'app.js'), 'utf8');
const CLIENT_HTML = fs.readFileSync(path.join(HERE, '..', 'client', 'index.html'), 'utf8');

/** A port that is very likely free: the server itself walks up on EADDRINUSE anyway. */
const pickPort = () => 8600 + Math.floor(Math.random() * 300);

/** Start the game server and resolve as soon as it says which port it took. */
function startServer(port) {
    const child = spawn(process.execPath, [SERVER, '--port=' + port], { cwd: path.join(HERE, '..'), stdio: ['ignore', 'pipe', 'pipe'] });
    const out = [];
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { child.kill(); reject(new Error('the server did not start: ' + out.join(''))); }, 10000);
        const onData = (buf) => {
            out.push(String(buf));
            const m = out.join('').match(/localhost:(\d+)/);
            if (m) { clearTimeout(timer); resolve({ child, port: Number(m[1]) }); }
        };
        child.stdout.on('data', onData);
        child.stderr.on('data', onData);
        child.on('exit', (code) => { clearTimeout(timer); reject(new Error('the server exited (' + code + '): ' + out.join(''))); });
    });
}

/** A WebSocket client with just enough of the protocol to join and hear the lobby. */
function wsClient(port) {
    return new Promise((resolve, reject) => {
        const key = crypto.randomBytes(16).toString('base64');
        const sock = net.connect(port, '127.0.0.1');
        let buffer = Buffer.alloc(0);
        let upgraded = false;
        const listeners = [];
        const client = {
            messages: [],
            send(obj) { sock.write(frame(1, Buffer.from(JSON.stringify(obj), 'utf8'))); },
            close() { try { sock.destroy(); } catch { /* gone */ } },
            onMessage(fn) { listeners.push(fn); },
        };
        const fail = (e) => { try { sock.destroy(); } catch { /* gone */ } reject(e); };
        sock.setTimeout(8000, () => fail(new Error('the socket stayed silent')));
        sock.on('error', fail);
        sock.on('connect', () => {
            sock.write(
                'GET /ws HTTP/1.1\r\n' +
                'Host: 127.0.0.1:' + port + '\r\n' +
                'Upgrade: websocket\r\nConnection: Upgrade\r\n' +
                'Sec-WebSocket-Key: ' + key + '\r\n' +
                'Sec-WebSocket-Version: 13\r\n\r\n');
        });
        sock.on('data', (chunk) => {
            buffer = Buffer.concat([buffer, chunk]);
            if (!upgraded) {
                const end = buffer.indexOf('\r\n\r\n');
                if (end < 0) return;
                const head = buffer.slice(0, end).toString('utf8');
                if (!/^HTTP\/1\.1 101/.test(head)) return fail(new Error('no upgrade: ' + head.split('\r\n')[0]));
                buffer = buffer.slice(end + 4);
                upgraded = true;
                resolve(client);
            }
            for (;;) {
                const msg = readFrame(buffer);
                if (!msg) break;
                buffer = buffer.slice(msg.consumed);
                if (msg.op === 1) {
                    let json = null;
                    try { json = JSON.parse(msg.payload); } catch { json = null; }
                    client.messages.push(json);
                    for (const fn of listeners) fn(json);
                }
            }
        });
    });
}

/** One masked client frame (clients always mask). */
function frame(op, payload) {
    const len = payload.length;
    const head = len < 126
        ? Buffer.from([0x80 | op, 0x80 | len])
        : len < 65536 ? (() => { const b = Buffer.alloc(4); b[0] = 0x80 | op; b[1] = 0x80 | 126; b.writeUInt16BE(len, 2); return b; })()
            : (() => { const b = Buffer.alloc(10); b[0] = 0x80 | op; b[1] = 0x80 | 127; b.writeBigUInt64BE(BigInt(len), 2); return b; })();
    const mask = crypto.randomBytes(4);
    const body = Buffer.from(payload);
    for (let i = 0; i < body.length; i++) body[i] ^= mask[i % 4];
    return Buffer.concat([head, mask, body]);
}

/** Parse one server frame (never masked) out of the buffer; null when it is still incomplete. */
function readFrame(buf) {
    if (buf.length < 2) return null;
    const op = buf[0] & 0x0f;
    const masked = (buf[1] & 0x80) !== 0;
    let len = buf[1] & 0x7f, offset = 2;
    if (len === 126) { if (buf.length < 4) return null; len = buf.readUInt16BE(2); offset = 4; }
    else if (len === 127) { if (buf.length < 10) return null; len = Number(buf.readBigUInt64BE(2)); offset = 10; }
    const maskLen = masked ? 4 : 0;
    if (buf.length < offset + maskLen + len) return null;
    const payload = buf.slice(offset + maskLen, offset + maskLen + len);
    return { op, payload, consumed: offset + maskLen + len };
}

/** Wait for a message that passes the filter, or fail after `ms`. */
function waitFor(client, filter, what, ms = 5000) {
    const found = client.messages.find(filter);
    if (found) return Promise.resolve(found);
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('no ' + what + ' in 5 s; got: ' +
            client.messages.map(m => (m && m.t) || '?').join(', '))), ms);
        client.onMessage((m) => {
            if (m && filter(m)) { clearTimeout(timer); resolve(m); }
        });
    });
}

test('SRV-01: сервер поднимает сокет — /ws отвечает 101 и присылает лобби', async (t) => {
    const { child, port } = await startServer(pickPort());
    t.after(() => { try { child.kill(); } catch { /* gone */ } });
    const client = await wsClient(port);
    t.after(() => client.close());

    client.send({ t: 'join', token: null, name: 'тест' });
    const lobby = await waitFor(client, m => m && m.t === 'lobby', 'lobby');
    assert.ok(lobby.characters && Object.keys(lobby.characters).length >= 10,
        'в лобби есть персонажи — иначе окно выбора пустое');
    assert.equal(lobby.seats.length, 1, 'подключившийся игрок сидит за столом');
    assert.equal(lobby.seats[0].name, 'тест');
    assert.ok(lobby.seats[0].host, 'первый — ведущий');
    assert.ok(lobby.settings && lobby.settings.mode, 'настройки партии пришли');
    assert.equal(lobby.settings.draft, false, 'новая партия по умолчанию без драфта');
    assert.ok(Array.isArray(lobby.addresses), 'адрес для друзей пришёл');
});

test('SRV-02: подключение по сокету вообще зарегистрировано в server.mjs', () => {
    // exactly the line that went missing and left the lobby without state
    assert.match(SRC, /server\.on\('upgrade'/, 'server.on(\'upgrade\') должен быть в server.mjs');
    assert.match(SRC, /clients\.add\(ws\)/, 'сокет попадает в список клиентов');
    assert.match(SRC, /ws\.onmessage\s*=\s*m\s*=>\s*onMessage\(ws,\s*m\)/, 'сообщения уходят в onMessage');
    // and the page the browser gets is the game, not a static stub
    assert.match(SRC, /serveStatic/, 'статика раздаётся');
});

test('LOBBY-01: выбор своего цвета отправляется только после завершения палитры', () => {
    const start = CLIENT_SRC.indexOf("for (const el of $('paintZones').querySelectorAll('input[type=color]')) {");
    const end = CLIENT_SRC.indexOf('if (!preview)', start);
    assert.ok(start >= 0 && end > start, 'обработчики произвольного цвета существуют');
    const handlers = CLIENT_SRC.slice(start, end);
    assert.match(handlers, /el\.oninput = \(\) => \{/,
        'input обновляет локальный preview, не вызывает сетевую перерисовку');
    assert.match(handlers, /el\.onchange = \(\) => sendColor\(zone, el\.value\)/,
        'выбранный произвольный цвет отправляется после commit');
    assert.doesNotMatch(handlers, /el\.oninput\s*=\s*\(\)\s*=>\s*sendColor/,
        'не отправлять каждый промежуточный оттенок: серверный broadcast закрывал picker');
    assert.match(CLIENT_SRC, /const keepPicker = activePicker && app\.charId === previousCharId;/,
        'чужое обновление лобби не удаляет открытый native picker');
    assert.match(CLIENT_SRC, /if \(!keepPicker\) \{\s*\$\('paintZones'\)\.innerHTML/s,
        'зоны цветов не перестраиваются, пока палитра открыта');
});

test('LOBBY-02: one paint control moves between the lobby and the workshop without duplicating state', () => {
    assert.equal((CLIENT_HTML.match(/id="paintZones"/g) || []).length, 1, 'one shared palette');
    for (const id of ['paintLobbyHost', 'labColorHost', 'labPartsTab', 'labColorsTab', 'labColorReset'])
        assert.match(CLIENT_HTML, new RegExp(`id="${id}"`), id + ': accessible workshop control');
    assert.match(CLIENT_SRC, /\$\('labColorHost'\)\.appendChild\(\$\('paintZones'\)\)/, 'opening moves existing controls');
    assert.match(CLIENT_SRC, /\$\('paintLobbyHost'\)\.appendChild\(\$\('paintZones'\)\)/, 'closing restores the lobby controls');
    assert.match(CLIENT_SRC, /\$\('labColorsTab'\)\.onclick = \(\) => setLabPage\('colors'\)/, 'color page is selectable');
    assert.match(CLIENT_SRC, /\$\('labColorReset'\)\.onclick[\s\S]*?net\.send\(\{ t: 'lobby', colors: \{\} \}\)/, 'reset uses the existing network palette');
    assert.match(CLIENT_SRC, /aria-label="Свой цвет:/, 'native color inputs are labelled');
    assert.match(CLIENT_SRC, /aria-pressed=/, 'preset choices expose their selection');
});

test('SRV-03: без сокета клиенту нечего рисовать — проверяем, что стук в /ws не висит', async (t) => {
    const { child, port } = await startServer(pickPort());
    t.after(() => { try { child.kill(); } catch { /* gone */ } });
    // a plain HTTP GET on /ws must be answered (or refused) quickly, not left hanging
    const status = await new Promise((resolve, reject) => {
        const sock = net.connect(port, '127.0.0.1', () => sock.write('GET /ws HTTP/1.1\r\nHost: x\r\n\r\n'));
        sock.setTimeout(4000, () => { sock.destroy(); reject(new Error('/ws hung')); });
        sock.on('data', (b) => { sock.destroy(); resolve(String(b).split('\r\n')[0]); });
        sock.on('error', reject);
    });
    assert.match(status, /^HTTP\/1\.1 \d{3}/, 'ответ есть: ' + status);
});

test('SRV-04: произвольный hex-цвет персонажа сохраняется в лобби', async (t) => {
    const { child, port } = await startServer(pickPort());
    t.after(() => { try { child.kill(); } catch { /* gone */ } });
    const client = await wsClient(port);
    t.after(() => client.close());

    client.send({ t: 'join', token: null, name: 'цвет' });
    const lobby = await waitFor(client, m => m && m.t === 'lobby' && m.seats && m.seats.length === 1, 'lobby');
    const charId = lobby.seats[0].charId;
    const zone = lobby.characters[charId].zones[0].id;
    client.send({ t: 'lobby', colors: { [zone]: '#12AbCd' } });
    const updated = await waitFor(client,
        m => m && m.t === 'lobby' && m.seats && m.seats[0].colors && m.seats[0].colors[zone] === '#12abcd',
        'custom character colour');
    assert.equal(updated.seats[0].colors[zone], '#12abcd', 'любой корректный hex принимается, не только палитра');
});

test('SRV-05: игра отдаёт исправленный board-edits.json по Windows-пути с большой буквы', async (t) => {
    const file = path.join(HERE, '..', '..', 'Nemesis', 'client', 'board-edits.json');
    if (!fs.existsSync(file)) { t.skip('нет локального board-edits.json в этом checkout'); return; }
    const { child, port } = await startServer(pickPort());
    t.after(() => { try { child.kill(); } catch { /* gone */ } });

    const response = await fetch('http://127.0.0.1:' + port + '/Nemesis/client/board-edits.json', { cache: 'no-store' });
    assert.equal(response.status, 200, 'верхнерегистровый путь не должен теряться на Linux');
    const json = await response.json();
    assert.ok(Object.keys(json.edits || {}).length > 0, 'сервер отдаёт сохранённые записи, а не пустой fallback');
});

test('SRV-06: детали Подопытной проверяются, сохраняются и видны в партии другим игрокам', async (t) => {
    const { child, port } = await startServer(pickPort());
    t.after(() => { try { child.kill(); } catch { /* gone */ } });
    const owner = await wsClient(port), other = await wsClient(port);
    t.after(() => { owner.close(); other.close(); });
    owner.send({ t: 'join', token: null, name: 'Автор' });
    await waitFor(owner, m => m && m.t === 'lobby' && m.seats.length === 1, 'first player');
    other.send({ t: 'join', token: null, name: 'Друг' });
    await waitFor(other, m => m && m.t === 'lobby' && m.seats.length === 2, 'second player');

    // Start looking after the current message to avoid matching an earlier lobby snapshot.
    async function change(message, filter, what) {
        const from = other.messages.length;
        const result = waitFor(other, m => other.messages.indexOf(m) >= from && filter(m), what);
        owner.send(message);
        return result;
    }
    const custom = { hair: 'messy', eyes: 'tails', outfit: 'torn', implants: 'temples' };
    const updated = await change({ t: 'lobby', charId: 'labrat', colors: { gown: '#12abcd' }, parts: { ...custom, injected: 'bad' } },
        m => m && m.t === 'lobby' && m.seats[0].parts?.hair === 'messy', 'custom parts');
    assert.deepEqual(updated.seats[0].parts, custom, 'other players receive the canonical preset');
    assert.equal(updated.seats[0].colors.gown, '#12abcd');

    const invalid = await change({ t: 'lobby', parts: { hair: 'bob', eyes: 'visor', outfit: 'coat', implants: 'crown', injected: 'bad' } },
        m => m && m.t === 'lobby' && m.seats[0].parts?.outfit === 'gown', 'removed parts fall back safely');
    assert.deepEqual(invalid.seats[0].parts, { hair: 'loose', eyes: 'bandage', outfit: 'gown', implants: 'classic' });
    await change({ t: 'lobby', parts: custom }, m => m && m.t === 'lobby' && m.seats[0].parts?.outfit === 'torn', 'restored parts');

    const switched = await change({ t: 'lobby', charId: 'pilot', parts: { hair: 'shaved' } },
        m => m && m.t === 'lobby' && m.seats[0].charId === 'pilot', 'another character');
    assert.deepEqual(switched.seats[0].parts, characterParts('pilot'), 'the pilot receives their own defaults, not Lab Rat parts');
    assert.deepEqual(switched.seats[0].colors, {}, 'the pilot does not inherit the Lab Rat palette');
    const returned = await change({ t: 'lobby', charId: 'labrat' },
        m => m && m.t === 'lobby' && m.seats[0].charId === 'labrat', 'Lab Rat again');
    assert.deepEqual(returned.seats[0].parts, custom, 'switching back restores the selected Lab Rat parts');
    assert.equal(returned.seats[0].colors.gown, '#12abcd', 'switching back restores her colors too');

    const state = await change({ t: 'start' }, m => m && m.t === 'state' && m.view && m.view.players.length === 2, 'game state');
    assert.deepEqual(state.view.players[0].parts, custom, 'the public game view carries the selected parts');
    assert.equal(state.view.players[0].colors.gown, '#12abcd', 'custom colors still reach the game');
    assert.deepEqual(state.view.players[1].parts, characterParts(state.view.players[1].charId), 'the other character keeps their own defaults');
});

test('SRV-07: Охранник и Подопытная сохраняют независимые варианты при смене персонажа', async (t) => {
    const { child, port } = await startServer(pickPort());
    t.after(() => { try { child.kill(); } catch { /* gone */ } });
    const owner = await wsClient(port), other = await wsClient(port);
    t.after(() => { owner.close(); other.close(); });
    owner.send({ t: 'join', token: null, name: 'Автор' });
    await waitFor(owner, m => m?.t === 'lobby' && m.seats.length === 1, 'first player');
    other.send({ t: 'join', token: null, name: 'Друг' });
    await waitFor(other, m => m?.t === 'lobby' && m.seats.length === 2, 'second player');

    async function change(message, filter, what) {
        const from = other.messages.length;
        const result = waitFor(other, m => other.messages.indexOf(m) >= from && filter(m), what);
        owner.send(message);
        return result;
    }
    const lab = { hair: 'messy', eyes: 'wide', outfit: 'long', implants: 'neck' };
    const guard = { optics: 'cluster', respirator: 'ribbed', shoulders: 'heavy', cloak: 'split' };
    await change({ t: 'lobby', charId: 'labrat', parts: lab }, m => m?.t === 'lobby' && m.seats[0].parts?.hair === 'messy', 'Lab Rat choices');
    let msg = await change({ t: 'lobby', charId: 'sentry' }, m => m?.t === 'lobby' && m.seats[0].charId === 'sentry', 'new Sentry');
    assert.deepEqual(msg.seats[0].parts, { optics: 'classic', respirator: 'classic', shoulders: 'classic', cloak: 'classic' });
    msg = await change({ t: 'lobby', parts: { ...guard, injected: 'bad' }, colors: { armor: '#12abcd' } },
        m => m?.t === 'lobby' && m.seats[0].parts?.optics === 'cluster', 'custom Sentry');
    assert.deepEqual(msg.seats[0].parts, guard);
    assert.equal(msg.seats[0].colors.armor, '#12abcd');

    msg = await change({ t: 'lobby', charId: 'labrat' }, m => m?.t === 'lobby' && m.seats[0].charId === 'labrat', 'Lab Rat restored');
    assert.deepEqual(msg.seats[0].parts, lab);
    assert.deepEqual(msg.seats[0].colors, {}, 'the Sentry palette does not leak');
    msg = await change({ t: 'lobby', charId: 'sentry' }, m => m?.t === 'lobby' && m.seats[0].charId === 'sentry', 'Sentry restored');
    assert.deepEqual(msg.seats[0].parts, guard);
    assert.equal(msg.seats[0].colors.armor, '#12abcd', 'the Sentry palette is restored');
    msg = await change({ t: 'lobby', charId: 'pilot' }, m => m?.t === 'lobby' && m.seats[0].charId === 'pilot', 'pilot');
    assert.deepEqual(msg.seats[0].parts, characterParts('pilot'));
    msg = await change({ t: 'lobby', charId: 'sentry' }, m => m?.t === 'lobby' && m.seats[0].charId === 'sentry', 'Sentry after pilot');
    assert.deepEqual(msg.seats[0].parts, guard);

    msg = await change({ t: 'lobby', parts: { ...guard, optics: 'bad', respirator: ['ribbed'] } },
        m => m?.t === 'lobby' && m.seats[0].parts?.optics === 'classic', 'invalid parts');
    assert.deepEqual(msg.seats[0].parts, { ...guard, optics: 'classic', respirator: 'classic' });
    await change({ t: 'lobby', parts: guard, colors: { armor: '#12abcd' } }, m => m?.t === 'lobby' && m.seats[0].parts?.optics === 'cluster', 'restore before game');
    msg = await change({ t: 'lobby', charId: '__proto__' }, m => m?.t === 'lobby', 'reject prototype character');
    assert.equal(msg.seats[0].charId, 'sentry');
    const state = await change({ t: 'start' }, m => m?.t === 'state' && m.view?.players.length === 2, 'game state');
    assert.deepEqual(state.view.players[0].parts, guard, 'other players see the figure in game');
    assert.equal(state.view.players[0].colors.armor, '#12abcd');
});

test('SRV-08: все мастерские независимо сохраняются, проверяются и видны другому игроку', async (t) => {
    const { child, port } = await startServer(pickPort());
    t.after(() => { try { child.kill(); } catch { /* gone */ } });
    const owner = await wsClient(port), other = await wsClient(port);
    t.after(() => { owner.close(); other.close(); });
    owner.send({ t: 'join', token: null, name: 'Автор' });
    await waitFor(owner, m => m?.t === 'lobby' && m.seats.length === 1, 'first player');
    other.send({ t: 'join', token: null, name: 'Друг' });
    await waitFor(other, m => m?.t === 'lobby' && m.seats.length === 2, 'second player');
    // Free every new crew character for the owner and keep the observer on a different workshop.
    let from = other.messages.length;
    let next = waitFor(other, m => other.messages.indexOf(m) >= from && m?.t === 'lobby' && m.seats[1].charId === 'labrat', 'observer character');
    other.send({ t: 'lobby', charId: 'labrat' }); await next;
    async function change(message, filter, what) {
        const from = other.messages.length;
        const result = waitFor(other, m => other.messages.indexOf(m) >= from && filter(m), what);
        owner.send(message); return result;
    }
    const saved = {}, savedColors = {};
    for (const [index, [id, slots]] of Object.entries(CREW_PARTS).entries()) {
        // Entering an unseen character must not inherit the previous one's palette.
        let msg = await change({ t: 'lobby', charId: id }, m => m?.t === 'lobby' && m.seats[0].charId === id, 'enter ' + id);
        assert.deepEqual(msg.seats[0].colors, {}, id + ': no color leaks from the previous character');
        const parts = Object.fromEntries(slots.map((slot, i) => [slot.id, slot.options[1 + i % 2].id]));
        const colors = { skin: '#' + (0x112233 + index * 0x010101).toString(16).padStart(6, '0') };
        saved[id] = parts; savedColors[id] = colors;
        msg = await change({ t: 'lobby', parts: { ...parts, injected: 'not allowed' }, colors },
            m => m?.t === 'lobby' && m.seats[0].parts?.[slots[0].id] === parts[slots[0].id], 'custom ' + id);
        assert.deepEqual(msg.seats[0].parts, parts, id + ': observer gets validated choices');
        assert.deepEqual(msg.seats[0].colors, colors, id + ': observer gets the palette');
    }
    for (const id of Object.keys(CREW_PARTS)) {
        const msg = await change({ t: 'lobby', charId: id }, m => m?.t === 'lobby' && m.seats[0].charId === id, 'restore ' + id);
        assert.deepEqual(msg.seats[0].parts, saved[id], id + ': selection survives switching between characters');
        assert.deepEqual(msg.seats[0].colors, savedColors[id], id + ': palette is restored independently');
    }
    const slot = characterPartSlots('xeno')[0];
    let msg = await change({ t: 'lobby', parts: { ...saved.xeno, [slot.id]: ['invalid'] }, colors: { coat: '#12abcd' } },
        m => m?.t === 'lobby' && m.seats[0].parts[slot.id] === 'classic', 'invalid xeno part');
    assert.deepEqual(msg.seats[0].parts, { ...saved.xeno, [slot.id]: 'classic' }, 'only the invalid slot is reset');
    assert.equal(msg.seats[0].colors.coat, '#12abcd');
    await change({ t: 'lobby', parts: saved.xeno }, m => m?.t === 'lobby' && m.seats[0].parts[slot.id] === saved.xeno[slot.id], 'restore xeno');
    msg = await change({ t: 'start' }, m => m?.t === 'state' && m.view?.players.length === 2, 'public game');
    assert.deepEqual(msg.view.players[0].parts, saved.xeno);
    assert.equal(msg.view.players[0].colors.coat, '#12abcd');
    assert.deepEqual(msg.view.players[1].parts, characterParts('labrat'));
});

test('SRV-09: драфт сохраняет выбранный образ только при совпадении персонажа', async (t) => {
    const chosen = { hair: 'longtail', probe: 'twin', jacket: 'pockets' };
    for (const sameCharacter of [true, false]) {
        const { child, port } = await startServer(pickPort());
        t.after(() => { try { child.kill(); } catch { /* gone */ } });
        const client = await wsClient(port); t.after(() => client.close());
        client.send({ t: 'join', token: null, name: 'Автор' });
        await waitFor(client, m => m?.t === 'lobby' && m.seats.length === 1, 'joined');
        client.send({ t: 'lobby', charId: 'xeno', parts: chosen, colors: { coat: '#12abcd' },
            settings: { mode: 'original', seed: 'workshop-draft-7', draft: true } });
        await waitFor(client, m => m?.t === 'lobby' && m.seats[0].charId === 'xeno' && m.settings.draft, 'draft settings');
        client.send({ t: 'start' });
        const draft = await waitFor(client, m => m?.t === 'state' && m.view?.phase === 'draft' && m.view.prompt?.options, 'draft prompt');
        const options = draft.view.prompt.options.map(o => o.id);
        assert.ok(options.includes('xeno'), 'the deterministic hand contains the customized character');
        const pick = sameCharacter ? 'xeno' : options.find(id => id !== 'xeno');
        client.send({ t: 'act', promptId: draft.view.prompt.id, answer: pick });
        const state = await waitFor(client, m => m?.t === 'state' && m.view?.players[0].charId === pick, 'draft result');
        assert.deepEqual(state.view.players[0].parts, sameCharacter ? chosen : characterParts(pick));
        assert.deepEqual(state.view.players[0].colors, sameCharacter ? { coat: '#12abcd' } : {});
    }
});
