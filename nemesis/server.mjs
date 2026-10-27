// ============================================================================
//  Nemesis — LAN game server (Node ≥ 18, zero dependencies)
// ----------------------------------------------------------------------------
//  * serves the client (nemesis/client) and the Babylon runtime (../libs);
//  * hand-rolled WebSocket (RFC 6455) — no npm packages;
//  * authoritative rules: the full state lives only here, clients get filtered views;
//  * undo: a JSON snapshot is pushed before every accepted answer; the host may
//    roll back step by step, everyone is notified.
//
//    node server.mjs            -> port 8090 (or the next free one)
//    node server.mjs --port=N
// ============================================================================
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import os from 'node:os';
import crypto from 'node:crypto';
import { createGame } from './shared/engine/setup.mjs';
import { answer } from './shared/engine/core.mjs';
import { viewFor } from './shared/view.mjs';
import { CHARACTERS } from './shared/data/cards.mjs';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const argPort = process.argv.find(a => /^--port=\d+$/.test(a));
const PORT_BASE = argPort ? Number(argPort.split('=')[1]) : 8090;
const MAX_PLAYERS = 5;
const UNDO_LIMIT = 300;

const MIME = {
    '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.mjs': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
    '.glb': 'model/gltf-binary', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wasm': 'application/wasm', '.txt': 'text/plain; charset=utf-8',
};

// ---------------------------------------------------------------------------------------------
// Static files
// ---------------------------------------------------------------------------------------------
function serveStatic(req, res) {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/' || p === '/index.html') { res.writeHead(302, { Location: '/client/' }); res.end(); return; }
    if (p === '/client' || p === '/client/') p = '/client/index.html';
    let file;
    if (p.startsWith('/libs/')) file = path.join(REPO, p);
    else if (p.startsWith('/Nemesis/')) file = path.join(REPO, p);
    else file = path.join(HERE, p);
    const rel = path.relative(REPO, file);
    if (rel.startsWith('..')) { res.writeHead(403); res.end(); return; }
    fs.stat(file, (err, st) => {
        if (err || !st.isFile()) { if (p === '/favicon.ico') { res.writeHead(204); res.end(); return; } res.writeHead(404); res.end('404 ' + p); return; }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-store' });
        fs.createReadStream(file).pipe(res);
    });
}

// ---------------------------------------------------------------------------------------------
// Minimal WebSocket
// ---------------------------------------------------------------------------------------------
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
class Socket {
    constructor(sock) {
        this.sock = sock; this.buf = Buffer.alloc(0); this.alive = true; this.onmessage = null; this.onclose = null;
        sock.on('data', d => this.feed(d));
        sock.on('close', () => this.close());
        sock.on('error', () => this.close());
    }
    feed(d) {
        this.buf = Buffer.concat([this.buf, d]);
        for (;;) {
            if (this.buf.length < 2) return;
            const b0 = this.buf[0], b1 = this.buf[1];
            const op = b0 & 0x0f, masked = !!(b1 & 0x80);
            let len = b1 & 0x7f, off = 2;
            if (len === 126) { if (this.buf.length < 4) return; len = this.buf.readUInt16BE(2); off = 4; }
            else if (len === 127) { if (this.buf.length < 10) return; len = Number(this.buf.readBigUInt64BE(2)); off = 10; }
            const maskKey = masked ? this.buf.subarray(off, off + 4) : null;
            if (masked) off += 4;
            if (this.buf.length < off + len) return;
            const payload = Buffer.from(this.buf.subarray(off, off + len));
            this.buf = this.buf.subarray(off + len);
            if (masked) for (let i = 0; i < payload.length; i++) payload[i] ^= maskKey[i & 3];
            if (op === 8) { this.close(); return; }
            if (op === 9) { this.frame(10, payload); continue; }
            if (op === 1 && this.onmessage) { try { this.onmessage(JSON.parse(payload.toString('utf8'))); } catch (e) { console.error('bad message', e.message); } }
        }
    }
    frame(op, payload) {
        if (!this.alive) return;
        const len = payload.length;
        let head;
        if (len < 126) head = Buffer.from([0x80 | op, len]);
        else if (len < 65536) { head = Buffer.alloc(4); head[0] = 0x80 | op; head[1] = 126; head.writeUInt16BE(len, 2); }
        else { head = Buffer.alloc(10); head[0] = 0x80 | op; head[1] = 127; head.writeBigUInt64BE(BigInt(len), 2); }
        try { this.sock.write(Buffer.concat([head, payload])); } catch (e) { this.close(); }
    }
    send(obj) { this.frame(1, Buffer.from(JSON.stringify(obj), 'utf8')); }
    close() { if (!this.alive) return; this.alive = false; try { this.sock.destroy(); } catch (e) { /* ignore */ } if (this.onclose) this.onclose(); }
}
function upgrade(req, sock) {
    const key = req.headers['sec-websocket-key'];
    if (!key) { sock.destroy(); return null; }
    const accept = crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
    sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
    return new Socket(sock);
}

// ---------------------------------------------------------------------------------------------
// Room / lobby
// ---------------------------------------------------------------------------------------------
const game = {
    phase: 'lobby',                   // 'lobby' | 'playing'
    seats: [],                        // [{token, name, charId, colors, ready, socket|null}]
    settings: { mode: 'original', seed: '', draft: true }, poses: {},
    state: null,
    undo: [],                         // [{json, label}]
    history: [],                      // labels of accepted actions (for the undo list)
    chat: [],
};
const clients = new Set();            // sockets (spectators included)

function num(v) { v = Number(v); return Number.isFinite(v) ? Math.round(v * 100) / 100 : 0; }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function seatOf(socket) { return game.seats.find(s => s.socket === socket); }
function hostSeat() { return game.seats.find(s => s.socket) || game.seats[0]; }
function isHost(socket) { const s = seatOf(socket); return s && s === hostSeat(); }

function lobbyMsg() {
    return { t: 'lobby', phase: game.phase, settings: game.settings,
        seats: game.seats.map((s, i) => ({ id: i, name: s.name, charId: s.charId, colors: s.colors, ready: s.ready, online: !!s.socket, host: s === hostSeat() })),
        characters: Object.fromEntries(Object.entries(CHARACTERS).map(([k, c]) => [k, { name: c.name, color: c.color, health: c.health, zones: c.zones }])),
        addresses: lanAddresses(), port: PORT };
}
function broadcastLobby() { for (const c of clients) c.send(lobbyMsg()); }

function sendState(socket, full) {
    if (!game.state) return;
    const seat = seatOf(socket);
    const pid = seat ? game.seats.indexOf(seat) : null;
    const from = full ? 0 : (socket.logSeen || 0);
    const view = viewFor(game.state, pid, from);
    socket.logSeen = game.state.logSeq;
    socket.send({ t: 'state', you: pid, host: isHost(socket), view, full: !!full, undoDepth: game.undo.length, history: game.history.slice(-12), poses: full ? game.poses : undefined });
}
function broadcastState(full) { for (const c of clients) sendState(c, full); }
function broadcastNotice(text, kind = 'notice') { for (const c of clients) c.send({ t: 'notice', text, kind }); }

function label(state, choice) {
    const pr = state.prompt; if (!pr) return '?';
    const who = pr.player === 'host' ? 'Ведущий' : state.players[pr.player].name;
    let what = '';
    if (pr.kind === 'turn') what = choice.action === 'card' ? 'карта' : choice.action === 'item' ? 'предмет' : (pr.actions.find(a => a.id === choice.action) || {}).label || choice.action;
    else if (pr.kind === 'choice') what = pr.title + ' → ' + ((pr.options.find(o => o.id === choice) || {}).label || choice);
    else if (pr.kind === 'room') what = pr.title + ' → ' + choice;
    else if (pr.kind === 'cards') what = pr.title;
    else what = pr.title;
    return who + ': ' + what;
}

function onMessage(socket, m) {
    switch (m.t) {
        case 'join': {
            let seat = m.token ? game.seats.find(s => s.token === m.token) : null;
            if (seat) { if (seat.socket && seat.socket !== socket) seat.socket.close(); seat.socket = socket; }
            else if (game.phase === 'lobby' && game.seats.length < MAX_PLAYERS) {
                seat = { token: crypto.randomBytes(12).toString('hex'), name: cleanName(m.name) || 'Игрок ' + (game.seats.length + 1), charId: freeChar(), colors: {}, ready: false, socket };
                game.seats.push(seat);
            }
            socket.send({ t: 'welcome', token: seat ? seat.token : null, seat: seat ? game.seats.indexOf(seat) : null, spectator: !seat });
            broadcastLobby();
            if (game.state) sendState(socket, true);
            if (seat) broadcastNotice((seat.name) + ' подключился.', 'join');
            break;
        }
        case 'lobby': {
            const seat = seatOf(socket); if (!seat || game.phase !== 'lobby') return;
            if (typeof m.name === 'string') seat.name = cleanName(m.name) || seat.name;
            if (m.charId && CHARACTERS[m.charId] && !game.seats.some(s => s !== seat && s.charId === m.charId)) seat.charId = m.charId;
            if (m.colors && typeof m.colors === 'object') seat.colors = sanitizeColors(seat.charId, m.colors);
            if (typeof m.ready === 'boolean') seat.ready = m.ready;
            if (m.settings && isHost(socket)) { if (m.settings.mode === 'random' || m.settings.mode === 'original') game.settings.mode = m.settings.mode; if (typeof m.settings.seed === 'string') game.settings.seed = m.settings.seed.slice(0, 32); if (typeof m.settings.draft === 'boolean') game.settings.draft = m.settings.draft; }
            if (m.kick !== undefined && isHost(socket)) { const k = game.seats[m.kick]; if (k && k !== seat) { if (k.socket) k.socket.close(); game.seats.splice(m.kick, 1); } }
            broadcastLobby();
            break;
        }
        case 'start': {
            if (!isHost(socket) || game.phase !== 'lobby') return;
            const seats = game.seats.filter(s => s.socket);
            if (seats.length < 1) return;
            game.seats = seats;
            game.state = createGame({ secretSeed: crypto.randomBytes(32).toString('hex'), seed: game.settings.seed || String(Date.now()), mode: game.settings.mode, draft: game.settings.draft, players: seats.map(s => ({ name: s.name, charId: s.charId, colors: s.colors })) });
            game.phase = 'playing'; game.undo = []; game.history = []; game.poses = {};
            for (const c of clients) c.logSeen = 0;
            broadcastLobby(); broadcastState(true);
            console.log('Game started:', seats.map(s => s.name + '/' + s.charId).join(', '), 'mode=' + game.settings.mode);
            break;
        }
        case 'act': {
            const st = game.state; if (!st || !st.prompt) return;
            const seat = seatOf(socket); if (!seat) return;
            const pid = game.seats.indexOf(seat);
            const pr = st.prompt;
            if (pr.player !== pid && !(pr.player === 'host' && isHost(socket))) return;
            const snap = JSON.stringify(st);
            const lbl = label(st, m.answer);
            let ok = false;
            try { ok = answer(st, pr.player === 'host' ? 'host' : pid, m.promptId, m.answer); }
            catch (e) {
                console.error('Engine error:', e);
                game.state = JSON.parse(snap);
                broadcastNotice('Ошибка движка при действии «' + lbl + '». Действие отменено. ' + e.message, 'error');
                broadcastState(true);
                return;
            }
            if (!ok) { socket.send({ t: 'notice', text: 'Недопустимый ответ.', kind: 'error' }); sendState(socket, true); return; }
            game.undo.push({ json: snap, label: lbl });
            if (game.undo.length > UNDO_LIMIT) game.undo.shift();
            game.history.push(lbl);
            broadcastState(false);
            break;
        }
        case 'undo': {
            if (!isHost(socket) || !game.state) return;
            const n = Math.max(1, Math.min(Number(m.steps) || 1, game.undo.length));
            if (!n) return;
            let entry = null;
            for (let i = 0; i < n; i++) { entry = game.undo.pop(); game.history.pop(); }
            game.state = JSON.parse(entry.json);
            broadcastNotice('⟲ Ведущий откатил ' + (n === 1 ? 'действие' : n + ' действия') + ': «' + entry.label + '».', 'undo');
            broadcastState(true);
            break;
        }
        // --- table presence (not part of the game state): cursors, pings, figure poses ---
        case 'cursor': {
            const seat = seatOf(socket); if (!seat) return;
            const pid = game.seats.indexOf(seat);
            const msg = { t: 'cursor', pid, x: num(m.x), z: num(m.z), off: !!m.off };
            for (const c of clients) if (c !== socket) c.send(msg);
            break;
        }
        case 'ping': {
            const seat = seatOf(socket); if (!seat) return;
            const pid = game.seats.indexOf(seat);
            const now = Date.now(); if (socket.lastPing && now - socket.lastPing < 150) return; socket.lastPing = now;
            const msg = { t: 'ping', pid, x: num(m.x), z: num(m.z), room: typeof m.room === 'string' ? m.room.slice(0, 8) : null };
            for (const c of clients) c.send(msg);
            break;
        }
        case 'pose': {
            const seat = seatOf(socket); if (!seat) return;
            const pid = game.seats.indexOf(seat);
            const pose = { dx: clamp(num(m.dx), -6, 6), dz: clamp(num(m.dz), -6, 6), rot: num(m.rot) };
            game.poses[pid] = pose;
            const msg = { t: 'pose', pid, pose };
            for (const c of clients) if (c !== socket) c.send(msg);
            break;
        }
        case 'chat': {
            const seat = seatOf(socket);
            const text = String(m.text || '').slice(0, 300);
            if (!text) return;
            const msg = { t: 'chat', from: seat ? seat.name : 'Зритель', text, time: Date.now() };
            game.chat.push(msg);
            for (const c of clients) c.send(msg);
            break;
        }
        case 'restart': {
            if (!isHost(socket)) return;
            game.phase = 'lobby'; game.state = null; game.undo = []; game.history = [];
            for (const s of game.seats) s.ready = false;
            broadcastLobby();
            for (const c of clients) c.send({ t: 'state', view: null });
            break;
        }
        case 'sync': sendState(socket, true); break;
    }
}

function cleanName(n) { return String(n || '').replace(/[^\p{L}\p{N} _\-\.]/gu, '').trim().slice(0, 20); }
function freeChar() { return Object.keys(CHARACTERS).find(k => !game.seats.some(s => s.charId === k)) || Object.keys(CHARACTERS)[0]; }
function sanitizeColors(charId, colors) {
    const out = {};
    for (const z of CHARACTERS[charId].zones) { const v = colors[z.id]; if (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v)) out[z.id] = v.toLowerCase(); }
    return out;
}
function lanAddresses() {
    const out = [];
    for (const list of Object.values(os.networkInterfaces())) for (const i of list) if (i.family === 'IPv4' && !i.internal) out.push(i.address);
    return out;
}

// ---------------------------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------------------------
let PORT = PORT_BASE;
const server = http.createServer(serveStatic);
server.on('upgrade', (req, sock) => {
    const ws = upgrade(req, sock);
    if (!ws) return;
    clients.add(ws);
    ws.onmessage = m => onMessage(ws, m);
    ws.onclose = () => {
        clients.delete(ws);
        const seat = seatOf(ws);
        if (seat) { seat.socket = null; broadcastNotice(seat.name + ' отключился.', 'leave'); if (game.phase === 'lobby') { /* keep seat for reconnect */ } broadcastLobby(); }
    };
});
function listen(port, tries) {
    server.once('error', e => { if (e.code === 'EADDRINUSE' && tries > 0) listen(port + 1, tries - 1); else { console.error(e.message); process.exit(1); } });
    server.listen(port, '0.0.0.0', () => {
        PORT = port;
        console.log('\n  Nemesis server: http://localhost:' + port);
        for (const a of lanAddresses()) console.log('  LAN:            http://' + a + ':' + port);
        console.log('');
    });
}
listen(PORT_BASE, 20);
