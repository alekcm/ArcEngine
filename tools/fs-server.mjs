// ============================================================================
//  ArcEngine — Forbidden Stars: the LAN server
// ----------------------------------------------------------------------------
//  Serves the game over the local network: the static files of the project and
//  the game itself over a WebSocket. No dependencies — the WebSocket protocol
//  (RFC 6455) is implemented here, Node's http server does the rest.
//
//      node tools/fs-server.mjs [--port=8080]
//
//  The server owns the game: the clients send commands (FSRules.apply) and get
//  the new state back. Two to four players play in a room. A client that opens
//  the plain address lands in the default room (the one printed at startup);
//  anybody with a link ?room=CODE joins that room explicitly:
//      http://<this computer>:8080/?room=ABCD
//  The game starts when everybody has chosen a faction.
// ============================================================================
import http from 'node:http';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import url from 'node:url';
import vm from 'node:vm';
import { execFile } from 'node:child_process';
import { createEngineContext } from './fs-engine.mjs';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const NO_OPEN = process.argv.includes('--no-open');
const argPort = process.argv.find(a => /^--port=\d+$/.test(a));
const PORT_BASE = argPort ? Number(argPort.split('=')[1]) : (Number(process.env.PORT) || 8080);
// The port the server actually bound to (it may differ from PORT_BASE when the
// port is taken and the next one is tried) — the invite links are built from it.
let boundPort = PORT_BASE;

// The build stamp: the short hash of the commit the server runs from, printed
// into the page — so it is always visible which build is actually served.
let GIT_COMMIT = 'unknown';
try {
    GIT_COMMIT = execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim();
} catch { /* not a git checkout — the stamp stays 'unknown' */ }

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
    '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
    '.glb': 'model/gltf-binary', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8',
    '.ico': 'image/x-icon', '.obj': 'text/plain; charset=utf-8',
};

const C = { r: '\x1b[0m', b: '\x1b[1m', dim: '\x1b[2m', red: '\x1b[31m', grn: '\x1b[32m', ylw: '\x1b[33m', cyn: '\x1b[36m' };

// ---------------------------------------------------------------------------
//  The game rules in the server: the same classic scripts the browser loads.
// ---------------------------------------------------------------------------
const context = createEngineContext();
const FS_DATA = context.FS_DATA;
const FS_RULES = context.FS_RULES;

// ---------------------------------------------------------------------------
//  Rooms
// ---------------------------------------------------------------------------
/** @type {Map<string, Room>} */
const rooms = new Map();

class Room {
    constructor(code) {
        this.code = code;
        /** @type {Player[]} */
        this.players = [];
        this.state = null;
        this.started = false;
        this.nextId = 1;
        this.log = [];
        // 'game' — the ordinary party; 'map' and 'battle' — the test modes of the lobby.
        this.mode = 'game';
        // «Отменить ход»: a snapshot of the state before every successful command,
        // newest last. One step back restores whatever the last command changed —
        // whose command it was does not matter.
        /** @type {any[]} */
        this.undoStack = [];
        // A test party is played by one person: both seats belong to him, so the
        // server sends the view of the seat that has to act right now.
        this.solo = false;
    }

    add(name, faction, id, palette) {
        let player = id ? this.players.find(p => p.id === id) : null;
        if (player) {
            player.name = name;
            if (faction) player.faction = faction;
            if (palette) player.palette = palette;
            return player;
        }
        player = {
            id: id || ('p' + this.nextId++),
            name: name || ('Игрок ' + (this.players.length + 1)),
            faction: faction || '',
            palette: palette || null,
            seat: this.players.length,
            ws: null,
        };
        this.players.push(player);
        return player;
    }

    remove(player) {
        const i = this.players.indexOf(player);
        if (i >= 0) this.players.splice(i, 1);
    }

    // The game starts when everybody has a faction.
    tryStart() {
        if (this.started || this.players.length < 2) return false;
        if (this.players.some(p => !p.faction)) return false;
        const factions = new Set(this.players.map(p => p.faction));
        if (factions.size !== this.players.length) return false;
        this.state = FS_RULES.newGame({
            seed: (Date.now() % 100000) + 1,
            players: this.players.map(p => ({ name: p.name, faction: p.faction, palette: p.palette })),
            interactiveSetup: true,
        });
        this.started = true;
        this.undoStack = [];
        return true;
    }
}

// The default room: everybody who opens the plain address the server prints
// lands in one common room — the friends do not have to exchange a code at all.
// Rooms with an explicit ?room=CODE still work for separate games.
const defaultRoom = new Room(roomCode());
rooms.set(defaultRoom.code, defaultRoom);

// The seat a solo player has to act for right now: the question of an effect,
// the step of a combat, the placement of a tile or the ordinary turn.
function activeSeat(state) {
    if (!state) return 0;
    // A seat that has troops above the capacity of an area owes the choice of
    // what goes back to the supply before anything else can happen. In a solo
    // party the view shows his chair (and the «сверх вместимости» panel with it)
    // until the excess is chosen; the LAN seats keep their usual views.
    for (const p of state.players) {
        if ((state.trim || []).some(t => t.seat === p.seat)) return p.seat;
    }
    if (state.pending) {
        return state.pending.answerSeat === undefined ? state.pending.seat : state.pending.answerSeat;
    }
    const c = state.combat;
    if (c) {
        if (c.step === 'retreat') return c.loser != null ? c.loser : c.defender;
        const side = String(c.step).slice(String(c.step).indexOf('-') + 1);
        return side === 'attacker' ? c.attacker : c.defender;
    }
    if (state.setup) return state.setup.turn;
    // The refresh phase resolves the event of one player at a time.
    if (state.phase === 'refresh' && state.event && state.event.seat != null) return state.event.seat;
    return state.turn;
}

// The two seats of a test party: the host and the opponent he also plays.
function testSeats(room, host) {
    const hostFaction = host.faction || FS_DATA.factions[0].id;
    const foe = FS_DATA.factions.find(f => f.id !== hostFaction) || FS_DATA.factions[1];
    // The host always sits first: the views and the seats of the room agree.
    const i = room.players.indexOf(host);
    if (i > 0) {
        room.players.splice(i, 1);
        room.players.unshift(host);
    }
    host.seat = 0;
    let foePlayer = room.players.find(p => p.bot);
    if (!foePlayer) {
        foePlayer = { id: 'bot', name: 'Противник', faction: foe.id, seat: 1, ws: null, bot: true };
        room.players[1] = foePlayer;
    }
    foePlayer.faction = foe.id;
    foePlayer.seat = 1;
    foePlayer.ws = null;
    return [
        { name: host.name, faction: hostFaction, palette: host.palette || null },
        { name: foePlayer.name, faction: foe.id, palette: foePlayer.palette || null },
    ];
}

// The two test modes of the lobby. 'map' opens the same 1×1 party with the board
// already assembled; 'battle' puts the chosen troops and decks on one field.
function startTest(room, host, msg) {
    if (room.started) return { ok: false, error: 'Партия уже идёт: обновите страницу, чтобы начать тест.' };
    const players = testSeats(room, host);
    const seed = (Date.now() % 100000) + 1;
    if (msg.mode === 'map') {
        room.state = FS_RULES.newReadyGame({ seed, players });
    } else if (msg.mode === 'battle') {
        const battle = msg.battle || {};
        room.state = FS_RULES.newBattleTest({
            seed, players,
            kind: battle.kind === 'space' ? 'space' : 'ground',
            units: battle.units || {},
            foeUnits: battle.foeUnits || {},
            cards: battle.cards || [],
            foeCards: battle.foeCards || [],
        });
    } else {
        return { ok: false, error: 'Неизвестный режим теста.' };
    }
    room.mode = msg.mode;
    room.solo = true;
    room.started = true;
    room.undoStack = [];
    return { ok: true };
}

function roomCode() {
    const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code;
    do {
        code = '';
        for (let i = 0; i < 4; i++) code += letters[crypto.randomInt(letters.length)];
    } while (rooms.has(code));
    return code;
}

// ---------------------------------------------------------------------------
//  WebSocket (RFC 6455) — the server side
// ---------------------------------------------------------------------------
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

class WS {
    constructor(socket) {
        this.socket = socket;
        this.buffer = Buffer.alloc(0);
        this.fragments = [];
        this.fragmentOpcode = 0;
        this.open = true;
        socket.on('data', chunk => this.onData(chunk));
        socket.on('close', () => {
            this.open = false;
            if (this.onClose) this.onClose();
        });
        socket.on('error', () => { this.open = false; });
    }

    onData(chunk) {
        this.buffer = Buffer.concat([this.buffer, chunk]);
        for (;;) {
            const frame = this.readFrame();
            if (!frame) break;
            this.onFrame(frame);
        }
    }

    // One frame from the buffer (null — the data is not complete yet).
    readFrame() {
        const buf = this.buffer;
        if (buf.length < 2) return null;
        const fin = (buf[0] & 0x80) !== 0;
        const opcode = buf[0] & 0x0f;
        const masked = (buf[1] & 0x80) !== 0;
        let len = buf[1] & 0x7f;
        let offset = 2;
        if (len === 126) {
            if (buf.length < offset + 2) return null;
            len = buf.readUInt16BE(offset);
            offset += 2;
        } else if (len === 127) {
            if (buf.length < offset + 8) return null;
            len = Number(buf.readBigUInt64BE(offset));
            offset += 8;
        }
        let mask = null;
        if (masked) {
            if (buf.length < offset + 4) return null;
            mask = buf.subarray(offset, offset + 4);
            offset += 4;
        }
        if (buf.length < offset + len) return null;
        const payload = Buffer.from(buf.subarray(offset, offset + len));
        if (mask) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
        this.buffer = buf.subarray(offset + len);
        return { fin, opcode, payload };
    }

    onFrame(frame) {
        if (frame.opcode === 0x8) { this.close(); return; }         // close
        if (frame.opcode === 0x9) { this.send(0xA, frame.payload); return; }   // ping -> pong
        if (frame.opcode === 0xA) return;                            // pong
        if (frame.opcode === 0x0) {                                  // a fragment
            this.fragments.push(frame.payload);
            if (frame.fin) {
                const data = Buffer.concat(this.fragments);
                this.fragments = [];
                this.onMessage(data.toString('utf8'));
            }
            return;
        }
        this.onMessage(frame.payload.toString('utf8'));
    }

    onMessage(text) {
        let msg;
        try { msg = JSON.parse(text); } catch { return; }
        try {
            this.handler(msg);
        } catch (e) {
            this.send({ t: 'err', msg: String(e && e.message ? e.message : e) });
        }
    }

    // A text frame (the server does not mask).
    send(obj) {
        if (!this.open) return;
        const data = Buffer.from(typeof obj === 'string' ? obj : JSON.stringify(obj), 'utf8');
        this.sendFrame(0x1, data);
    }

    sendFrame(opcode, data) {
        const len = data.length;
        let header;
        if (len < 126) {
            header = Buffer.alloc(2);
            header[1] = len;
        } else if (len < 65536) {
            header = Buffer.alloc(4);
            header[1] = 126;
            header.writeUInt16BE(len, 2);
        } else {
            header = Buffer.alloc(10);
            header[1] = 127;
            header.writeBigUInt64BE(BigInt(len), 2);
        }
        header[0] = 0x80 | opcode;
        try {
            this.socket.write(Buffer.concat([header, data]));
        } catch (e) {
            this.open = false;
        }
    }

    close() {
        this.open = false;
        try { this.sendFrame(0x8, Buffer.alloc(0)); } catch { /* the socket is gone */ }
        this.socket.end();
    }
}

// ---------------------------------------------------------------------------
//  The game protocol
// ---------------------------------------------------------------------------
function broadcast(room, message, except) {
    for (const p of room.players) {
        if (!p.ws || p.ws === except) continue;
        p.ws.send(message);
    }
}

function sendState(room) {
    if (!room.state) return;
    const soloSeat = room.solo ? activeSeat(room.state) : null;
    for (const p of room.players) {
        if (!p.ws) continue;
        const view = FS_RULES.view(room.state, room.solo ? soloSeat : p.seat);
        // How many steps «Отменить ход» can go back.
        view.undo = room.undoStack.length;
        if (room.solo) {
            // The client shows the same chair to the player and tells him whom he plays.
            view.solo = true;
            view.mode = room.mode;
        }
        p.ws.send({ t: 'state', view, solo: room.solo || undefined, mode: room.mode });
    }
}

// Only well-formed #rrggbb colors survive; anything else is dropped so the
// clients can fall back to faction-color shades.
function cleanPalette(pal) {
    if (!pal || typeof pal !== 'object') return null;
    const hex = c => /^#[0-9a-fA-F]{6}$/.test(String(c || '')) ? String(c).toLowerCase() : null;
    const out = { primary: hex(pal.primary), secondary1: hex(pal.secondary1), secondary2: hex(pal.secondary2) };
    return out.primary || out.secondary1 || out.secondary2 ? out : null;
}

function sendRoomInfo(room) {
    broadcast(room, {
        t: 'room',
        code: room.code,
        started: room.started,
        players: room.players.map(p => ({ id: p.id, name: p.name, faction: p.faction, palette: p.palette || null, seat: p.seat })),
    });
}

function handle(ws, msg) {
    if (!msg || typeof msg !== 'object') return;
    // FS_DEBUG=1 — what the server receives (for the diagnosis).
    if (process.env.FS_DEBUG) console.log('  [fs] ' + msg.t + ' ' + JSON.stringify(msg).slice(0, 120));
    if (msg.t === 'hello') {
        const code = String(msg.room || '').trim().toUpperCase();
        let room = code ? rooms.get(code) : defaultRoom;
        if (!room) {
            room = new Room(code || roomCode());
            rooms.set(room.code, room);
        }
        // A party that has already started cannot take a new player: the seats are
        // fixed. The player who was in the room rejoins by his id; anybody else is
        // told so honestly instead of being handed a seat that does not exist.
        const known = msg.id ? room.players.find(p => p.id === String(msg.id)) : null;
        if (room.started && !known) {
            ws.send({ t: 'joined', id: '', room: room.code, seat: 0, palette: null, started: true, factions: FS_DATA.factions.map(f => ({ id: f.id, name: f.name, color: f.color })), invites: [] });
            ws.send({ t: 'err', msg: 'Игра в этой комнате уже идёт. Дождитесь конца партии.' });
            return;
        }
        const player = room.add(msg.name, msg.faction, msg.id, cleanPalette(msg.palette));
        player.ws = ws;
        ws.room = room;
        ws.player = player;
        ws.send({ t: 'joined', id: player.id, room: room.code, seat: player.seat, palette: player.palette || null, started: room.started, factions: FS_DATA.factions.map(f => ({ id: f.id, name: f.name, color: f.color })), invites: roomInvites(room) });
        sendRoomInfo(room);
        if (room.state) sendState(room);
        return;
    }
    if (msg.t === 'cmd') {
        const room = ws.room, player = ws.player;
        if (!room || !player) return;
        if (!room.state) { ws.send({ t: 'err', msg: 'Игра ещё не началась.' }); return; }
        // In a test party the player acts for the seat whose turn it is.
        const seat = room.solo ? activeSeat(room.state) : player.seat;
        // The state before the command — the step the undo button will restore.
        const pre = JSON.parse(JSON.stringify(room.state));
        const res = FS_RULES.apply(room.state, seat, msg.cmd);
        if (process.env.FS_DEBUG) console.log('  [fs] apply -> ' + JSON.stringify(res).slice(0, 120));
        if (!res.ok) { ws.send({ t: 'err', msg: res.error || 'Нельзя.' }); return; }
        room.undoStack.push(pre);
        if (room.undoStack.length > 200) room.undoStack.shift();
        sendState(room);
        return;
    }
    if (msg.t === 'undo') {
        const room = ws.room;
        if (!room) return;
        if (!room.state) { ws.send({ t: 'err', msg: 'Игра ещё не началась.' }); return; }
        const pre = room.undoStack.pop();
        if (!pre) { ws.send({ t: 'err', msg: 'Нечего отменять.' }); return; }
        room.state = pre;
        sendState(room);
        return;
    }
    if (msg.t === 'test') {
        const room = ws.room, player = ws.player;
        if (!room || !player) return;
        const res = startTest(room, player, msg);
        if (!res.ok) { ws.send({ t: 'err', msg: res.error }); return; }
        sendRoomInfo(room);
        sendState(room);
        return;
    }
    if (msg.t === 'faction') {
        const room = ws.room, player = ws.player;
        if (!room || !player) return;
        if (room.started) { ws.send({ t: 'err', msg: 'Игра уже идёт.' }); return; }
        player.faction = msg.faction;
        sendRoomInfo(room);
        if (room.tryStart()) {
            sendRoomInfo(room);
            sendState(room);
        }
        return;
    }
    if (msg.t === 'palette') {
        const room = ws.room, player = ws.player;
        if (!room || !player) return;
        if (room.started) { ws.send({ t: 'err', msg: 'Игра уже идёт.' }); return; }
        player.palette = cleanPalette(msg.palette);
        sendRoomInfo(room);
        return;
    }
    if (msg.t === 'leave') {
        const room = ws.room;
        if (!room) return;
        // During a game the seats must not shift — the player stays in the room.
        if (!room.started) {
            room.remove(ws.player);
            if (!room.players.length) rooms.delete(room.code);
        }
        sendRoomInfo(room);
        return;
    }
    if (msg.t === 'ping') { ws.send({ t: 'pong' }); return; }
}

// ---------------------------------------------------------------------------
//  The static server
// ---------------------------------------------------------------------------
const server = http.createServer(async (req, res) => {
    let pathname;
    try {
        pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    } catch {
        res.writeHead(400); return res.end('Bad URL');
    }
    if (pathname === '/') pathname = '/index.html';
    const filePath = path.join(ROOT, pathname);
    if (!filePath.startsWith(ROOT + path.sep) && filePath !== ROOT) {
        res.writeHead(403); return res.end('Forbidden');
    }
    let st;
    try {
        st = await fsp.stat(filePath);
    } catch {
        if (pathname === '/favicon.ico') { res.writeHead(204); return res.end(); }
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('Not found: ' + pathname);
    }
    if (st.isDirectory()) { res.writeHead(403); return res.end('No listing'); }
    const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    // index.html gets the build stamp injected: which commit is being served.
    if (pathname === '/index.html') {
        let html = fs.readFileSync(filePath, 'utf8');
        html = html.split('__GIT_COMMIT__').join(GIT_COMMIT);
        const body = Buffer.from(html, 'utf8');
        res.writeHead(200, {
            'Content-Type': type,
            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
            'Content-Length': body.length,
        });
        if (req.method === 'HEAD') return res.end();
        return res.end(body);
    }
    res.writeHead(200, {
        'Content-Type': type,
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'Accept-Ranges': 'bytes',
        'Content-Length': st.size,
    });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(filePath).pipe(res);
});

// The WebSocket upgrade.
server.on('upgrade', (req, socket) => {
    const key = req.headers['sec-websocket-key'];
    if (!key || !/websocket/i.test(req.headers.upgrade || '')) {
        socket.destroy();
        return;
    }
    const accept = crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
    socket.write('HTTP/1.1 101 Switching Protocols\r\n'
        + 'Upgrade: websocket\r\n'
        + 'Connection: Upgrade\r\n'
        + 'Sec-WebSocket-Accept: ' + accept + '\r\n\r\n');
    socket.setNoDelay(true);
    const ws = new WS(socket);
    ws.handler = msg => handle(ws, msg);
    ws.onClose = () => {
        const room = ws.room, player = ws.player;
        if (!room || !player) return;
        player.ws = null;
        sendRoomInfo(room);
    };
});

// The close handler of the socket (the room must know that the player is gone).
server.on('connection', () => { /* the upgrade handler sets everything up */ });

// ---------------------------------------------------------------------------
//  Start
// ---------------------------------------------------------------------------
// Ctrl+C does NOT stop the server: in the Windows console it is also the copy
// shortcut, and copying the room link must not kill the party. The server
// stops when the user types «q» (or «стоп») and presses Enter.
let stopping = false;
function shutdown() {
    if (stopping) return;
    stopping = true;
    console.log(`\n${C.dim}  Останавливаю сервер…${C.r}`);
    for (const room of rooms.values()) for (const p of room.players) if (p.ws && p.ws.open) p.ws.close();
    try { server.close(); } catch { /* the sockets are already gone */ }
    const t1 = setTimeout(() => process.exit(0), 300);
    const t2 = setTimeout(() => process.exit(0), 1500);
    t1.unref(); t2.unref();
}

process.on('SIGINT', () => {
    console.log(`${C.dim}  Ctrl+C свободен для копирования. Чтобы остановить сервер, наберите q и нажмите Enter.${C.r}`);
});

try {
    process.stdin.setEncoding('utf8');
    let buf = '';
    process.stdin.on('data', chunk => {
        buf += chunk;
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, i).trim().toLowerCase();
            buf = buf.slice(i + 1);
            if (line === 'q' || line === 'quit' || line === 'exit' || line === 'stop' || line === 'стоп') shutdown();
        }
    });
    process.stdin.resume();
} catch { /* no stdin — the window close stops the server */ }

// Prefer the ordinary private ranges for the invite link (the friends sit on the
// same LAN); link-local addresses go last — they are rarely reachable by peers.
function addressRank(ip) {
    if (ip.startsWith('192.168.')) return 0;
    if (ip.startsWith('10.')) return 1;
    if (/^172\.(1[6-9]|2[0-9]|3[01])\./.test(ip)) return 2;
    if (ip.startsWith('169.254.')) return 9;
    return 5;
}

function localAddresses() {
    const out = [];
    const ifaces = osInterfaces();
    for (const list of Object.values(ifaces || {})) {
        for (const i of list) {
            if (i.family !== 'IPv4' || i.internal) continue;
            out.push(i.address);
        }
    }
    out.sort((a, b) => addressRank(a) - addressRank(b));
    return out;
}

function osInterfaces() {
    return os.networkInterfaces();
}

// The invite links of a room: one per LAN address of this machine. The clients
// use them to build the link they show in the lobby — that way the link works
// even when the host opened the game through localhost.
function roomInvites(room) {
    const out = [];
    for (const ip of localAddresses()) out.push('http://' + ip + ':' + boundPort + '/?room=' + room.code);
    return out;
}

function listen(port, attempt = 0) {
    server.once('error', err => {
        if (err.code === 'EADDRINUSE' && attempt < 20) {
            console.log(`${C.dim}  порт ${port} занят, пробую ${port + 1}${C.r}`);
            return listen(port + 1, attempt + 1);
        }
        console.error(`${C.red}Не удалось поднять сервер: ${err.message}${C.r}`);
        process.exit(1);
    });
    server.listen(port, '0.0.0.0', () => {
        boundPort = port;
        const addr = `http://localhost:${port}/`;
        const ips = localAddresses();
        console.log(`\n${C.cyn}${C.b}  Forbidden Stars${C.r} ${C.dim}— сервер для локальной сети${C.r}`);
        console.log(`${C.dim}  ${'-'.repeat(46)}${C.r}`);
        console.log(`  этот компьютер: ${C.grn}${C.b}${addr}${C.r}`);
        console.log(`  ${C.grn}${C.b}комната «${defaultRoom.code}»${C.r} ${C.dim}— ссылка для друзей (отправьте её в чат):${C.r}`);
        for (const ip of ips) console.log(`    ${C.grn}${C.b}http://${ip}:${port}/?room=${defaultRoom.code}${C.r}`);
        if (ips.length) console.log(`${C.dim}  Простая ссылка ${C.r}${C.dim}http://<этот-компьютер>:${port}/${C.r}${C.dim} тоже ведёт в эту комнату.${C.r}`);
        console.log(`${C.dim}  Другая комната: добавьте ?room=КОД к ссылке (код придумает хост).${C.r}`);
        console.log(`${C.dim}  q + Enter — остановить (Ctrl+C свободен для копирования)${C.r}\n`);
        if (!NO_OPEN) {
            const cmd = process.platform === 'win32' ? 'cmd' : (process.platform === 'darwin' ? 'open' : 'xdg-open');
            const args = process.platform === 'win32' ? ['/c', 'start', '', addr] : [addr];
            execFile(cmd, args, () => { });
        }
    });
}

listen(PORT_BASE);
