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
//  the new state back. Two to four players join a room by its code:
//      http://<this computer>:8080/?room=ABCD
//  The first player of a room may be joined by anybody with the code; the game
//  starts when everybody has chosen a faction.
// ============================================================================
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import url from 'node:url';
import vm from 'node:vm';
import { execFile } from 'node:child_process';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const NO_OPEN = process.argv.includes('--no-open');
const argPort = process.argv.find(a => /^--port=\d+$/.test(a));
const PORT_BASE = argPort ? Number(argPort.split('=')[1]) : (Number(process.env.PORT) || 8080);

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
const context = vm.createContext({ console, Math, JSON, Date, Object, Array, String, Number, Boolean, Error });
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/fs/FSData.js'), 'utf8'), context, { filename: 'js/fs/FSData.js' });
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/fs/FSRules.js'), 'utf8'), context, { filename: 'js/fs/FSRules.js' });
const FS_DATA = vm.runInContext('FS_DATA', context);
const FS_RULES = vm.runInContext('FS_RULES', context);

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
    }

    add(name, faction, id) {
        let player = id ? this.players.find(p => p.id === id) : null;
        if (player) {
            player.name = name;
            if (faction) player.faction = faction;
            return player;
        }
        player = {
            id: id || ('p' + this.nextId++),
            name: name || ('Игрок ' + (this.players.length + 1)),
            faction: faction || '',
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
            players: this.players.map(p => ({ name: p.name, faction: p.faction })),
        });
        this.started = true;
        return true;
    }
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
    for (const p of room.players) {
        if (!p.ws) continue;
        p.ws.send({ t: 'state', view: FS_RULES.view(room.state, p.seat) });
    }
}

function sendRoomInfo(room) {
    broadcast(room, {
        t: 'room',
        code: room.code,
        started: room.started,
        players: room.players.map(p => ({ id: p.id, name: p.name, faction: p.faction, seat: p.seat })),
    });
}

function handle(ws, msg) {
    if (!msg || typeof msg !== 'object') return;
    // FS_DEBUG=1 — what the server receives (for the diagnosis).
    if (process.env.FS_DEBUG) console.log('  [fs] ' + msg.t + ' ' + JSON.stringify(msg).slice(0, 120));
    if (msg.t === 'hello') {
        let room = rooms.get(msg.room);
        if (!room) {
            room = new Room(msg.room || roomCode());
            rooms.set(room.code, room);
        }
        const player = room.add(msg.name, msg.faction, msg.id);
        player.ws = ws;
        ws.room = room;
        ws.player = player;
        ws.send({ t: 'joined', id: player.id, room: room.code, seat: player.seat, factions: FS_DATA.factions.map(f => ({ id: f.id, name: f.name, color: f.color })) });
        sendRoomInfo(room);
        if (room.state) sendState(room);
        return;
    }
    if (msg.t === 'cmd') {
        const room = ws.room, player = ws.player;
        if (!room || !player) return;
        if (!room.state) { ws.send({ t: 'err', msg: 'Игра ещё не началась.' }); return; }
        const res = FS_RULES.apply(room.state, player.seat, msg.cmd);
        if (process.env.FS_DEBUG) console.log('  [fs] apply -> ' + JSON.stringify(res).slice(0, 120));
        if (!res.ok) { ws.send({ t: 'err', msg: res.error || 'Нельзя.' }); return; }
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
function localAddresses() {
    const out = [];
    const ifaces = osInterfaces();
    for (const list of Object.values(ifaces || {})) {
        for (const i of list) {
            if (i.family !== 'IPv4' || i.internal) continue;
            out.push(i.address);
        }
    }
    return out;
}

function osInterfaces() {
    return os.networkInterfaces();
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
        const addr = `http://localhost:${port}/`;
        console.log(`\n${C.cyn}${C.b}  Forbidden Stars${C.r} ${C.dim}— сервер для локальной сети${C.r}`);
        console.log(`${C.dim}  ${'-'.repeat(46)}${C.r}`);
        console.log(`  ${C.grn}${C.b}${addr}${C.r}`);
        for (const ip of localAddresses()) console.log(`  ${C.grn}${C.b}http://${ip}:${port}/${C.r}  ${C.dim}— для друзей в этой сети${C.r}`);
        console.log(`${C.dim}  комната: игроки открывают ссылку с ?room=КОД (код покажет хост).${C.r}`);
        console.log(`${C.dim}  Ctrl+C — остановить${C.r}\n`);
        if (!NO_OPEN) {
            const cmd = process.platform === 'win32' ? 'cmd' : (process.platform === 'darwin' ? 'open' : 'xdg-open');
            const args = process.platform === 'win32' ? ['/c', 'start', '', addr] : [addr];
            execFile(cmd, args, () => { });
        }
    });
}

listen(PORT_BASE);
