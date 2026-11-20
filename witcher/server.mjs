// ============================================================================
//  Ведьмак: Старый мир — LAN game server (Node >= 18, zero dependencies)
// ----------------------------------------------------------------------------
//  * serves the client (witcher/client), the engine (witcher/shared), Babylon (../libs)
//    and the miniatures (Witcher/**/*.obj -> compact decimated meshes at /models/…);
//  * hand-rolled WebSocket (RFC 6455);
//  * authoritative rules: the full state lives only here, every seat gets its own view;
//  * undo (snapshots), save/load (witcher/saves), reconnect by token, bots.
//
//    node witcher/server.mjs            -> port 8095 (or the next free one)
//    node witcher/server.mjs --port=N
// ============================================================================
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { createGame, apply, options, actingSeat } from './shared/engine/core.mjs';
import { viewFor } from './shared/view.mjs';
import { botCommand } from './shared/bots.mjs';
import { SCHOOLS, SCHOOL_ORDER, BOT_NAMES, normalizeRules, normalizeExp } from './shared/data/rules-data.mjs';
import { MONSTERS, LEGENDS } from './shared/data/gen-data.mjs';
import { objToMesh } from './tools/obj.mjs';
import { writeScenarios, SCENARIO_NAMES } from './tools/scenarios.mjs';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const SAVES = path.join(HERE, 'saves');
const argPort = process.argv.find(a => /^--port=\d+$/.test(a));
const PORT_BASE = argPort ? Number(argPort.split('=')[1]) : 8095;
const MAX_SEATS = 5;
const UNDO_LIMIT = 200;
const BOT_DELAY = Number(process.env.WITCHER_BOT_DELAY ?? 650);

const MIME = {
    '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.mjs': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
};

// ---------------------------------------------------------------------------------------------
// Build stamp: a tab that survived a restart compares it and reloads itself.
// ---------------------------------------------------------------------------------------------
function buildStamp() {
    const h = crypto.createHash('sha1');
    const walk = (dir) => {
        let list = [];
        try { list = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
        for (const e of list.sort((a, b) => a.name.localeCompare(b.name))) {
            const p = path.join(dir, e.name);
            if (e.isDirectory()) walk(p);
            else if (/\.(js|mjs|css|html)$/.test(e.name)) { const st = fs.statSync(p); h.update(p + st.size + Math.round(st.mtimeMs)); }
        }
    };
    walk(path.join(HERE, 'client')); walk(path.join(HERE, 'shared'));
    return h.digest('hex').slice(0, 10);
}
const BUILD = buildStamp();

// ---------------------------------------------------------------------------------------------
// Models: OBJ -> decimated JSON mesh (memory cache)
// ---------------------------------------------------------------------------------------------
const MODEL_FILES = {};
for (const [k, s] of Object.entries(SCHOOLS)) MODEL_FILES['w-' + k] = path.join(REPO, s.model);
for (const m of MONSTERS) MODEL_FILES[m.id] = path.join(REPO, 'Witcher', 'Миниатюры монстров', m.model);
for (const m of LEGENDS) MODEL_FILES[m.id] = path.join(REPO, 'Witcher', 'Легендарные монстры', m.model);
MODEL_FILES.DAGON = path.join(REPO, 'Witcher', 'Миниатюры монстров', 'Дагон.obj');   // «Скеллиге»
const modelCache = new Map();
const MODEL_TRIS = 40000;
function modelJson(key, tris = MODEL_TRIS) {
    const ck = key + '@' + tris;
    if (modelCache.has(ck)) return modelCache.get(ck);
    const file = MODEL_FILES[key];
    if (!file || !fs.existsSync(file)) return null;
    const json = JSON.stringify(objToMesh(fs.readFileSync(file, 'utf8'), { targetTris: tris }));
    modelCache.set(ck, json);
    return json;
}

// ---------------------------------------------------------------------------------------------
// Static files
// ---------------------------------------------------------------------------------------------
function serve(req, res) {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/' || p === '/index.html') { res.writeHead(302, { Location: '/client/' }); res.end(); return; }
    if (p === '/client' || p === '/client/') p = '/client/index.html';
    if (p === '/favicon.ico') { res.writeHead(204); res.end(); return; }
    if (p === '/art-index.json') {
        // Real card art dropped into client/art/<ID>.jpg|png|webp replaces the placeholder.
        const idx = {};
        try { for (const f of fs.readdirSync(path.join(HERE, 'client', 'art'))) { const mm = /^(.+)\.(jpe?g|png|webp|svg)$/i.exec(f); if (mm) idx[mm[1]] = f; } } catch { /* no art yet */ }
        res.writeHead(200, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
        res.end(JSON.stringify(idx));
        return;
    }
    let m;
    if ((m = /^\/models\/([A-Za-z0-9-]+)\.json$/.exec(p))) {
        const q = Number(new URL(req.url, 'http://x').searchParams.get('tris')) || MODEL_TRIS;
        const j = modelJson(m[1], Math.max(500, Math.min(60000, q)));
        if (!j) { res.writeHead(404); res.end(); return; }
        res.writeHead(200, { 'Content-Type': MIME['.json'], 'Cache-Control': 'max-age=3600' });
        res.end(j);
        return;
    }
    const root = p.startsWith('/client/') ? path.join(HERE, 'client')
        : p.startsWith('/shared/') ? path.join(HERE, 'shared')
        : p.startsWith('/libs/') ? path.join(REPO, 'libs') : null;
    if (!root) { res.writeHead(403); res.end(); return; }
    const prefix = p.slice(1).split('/')[0];
    const file = path.join(root, p.slice(prefix.length + 2));
    const rel = path.relative(root, file);
    if (rel.startsWith('..') || path.isAbsolute(rel)) { res.writeHead(403); res.end(); return; }
    fs.stat(file, (e, st) => {
        if (e || !st.isFile()) { res.writeHead(404); res.end('404'); return; }
        if (/index\.html$/.test(file)) {
            const html = fs.readFileSync(file, 'utf8').replace('<script type="module" src="app.js"></script>',
                `<script>window.__BUILD='${BUILD}';</script><script type="module" src="app.js?v=${BUILD}"></script>`);
            res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store' });
            res.end(html);
            return;
        }
        const big = /\.(jpg|png|webp)$/.test(file) || p.startsWith('/libs/');
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': big ? 'max-age=3600' : 'no-store' });
        fs.createReadStream(file).pipe(res);
    });
}

// ---------------------------------------------------------------------------------------------
// WebSocket
// ---------------------------------------------------------------------------------------------
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
class Socket {
    constructor(sock) {
        this.sock = sock; this.buf = Buffer.alloc(0); this.alive = true; this.onmessage = null; this.onclose = null;
        sock.on('data', d => this.feed(d)); sock.on('close', () => this.close()); sock.on('error', () => this.close());
    }
    feed(d) {
        this.buf = Buffer.concat([this.buf, d]);
        for (;;) {
            if (this.buf.length < 2) return;
            const op = this.buf[0] & 0x0f, masked = !!(this.buf[1] & 0x80);
            let len = this.buf[1] & 0x7f, off = 2;
            if (len === 126) { if (this.buf.length < 4) return; len = this.buf.readUInt16BE(2); off = 4; }
            else if (len === 127) { if (this.buf.length < 10) return; len = Number(this.buf.readBigUInt64BE(2)); off = 10; }
            const key = masked ? this.buf.subarray(off, off + 4) : null;
            if (masked) off += 4;
            if (this.buf.length < off + len) return;
            const payload = Buffer.from(this.buf.subarray(off, off + len));
            this.buf = this.buf.subarray(off + len);
            if (masked) for (let i = 0; i < payload.length; i++) payload[i] ^= key[i & 3];
            if (op === 8) { this.close(); return; }
            if (op === 9) { this.frame(10, payload); continue; }
            if (op === 1 && this.onmessage) { let msg; try { msg = JSON.parse(payload.toString('utf8')); } catch { continue; } try { this.onmessage(msg); } catch (e) { console.error('handler error', e); } }
        }
    }
    frame(op, payload) {
        if (!this.alive) return;
        const len = payload.length;
        let head;
        if (len < 126) head = Buffer.from([0x80 | op, len]);
        else if (len < 65536) { head = Buffer.alloc(4); head[0] = 0x80 | op; head[1] = 126; head.writeUInt16BE(len, 2); }
        else { head = Buffer.alloc(10); head[0] = 0x80 | op; head[1] = 127; head.writeBigUInt64BE(BigInt(len), 2); }
        try { this.sock.write(Buffer.concat([head, payload])); } catch { this.close(); }
    }
    send(obj) { this.frame(1, Buffer.from(JSON.stringify(obj), 'utf8')); }
    close() { if (!this.alive) return; this.alive = false; try { this.sock.destroy(); } catch { /* */ } if (this.onclose) this.onclose(); }
}

// ---------------------------------------------------------------------------------------------
// Room
// ---------------------------------------------------------------------------------------------
const room = {
    phase: 'lobby',
    seats: [],      // { token, name, school, bot, socket }
    settings: { randomFirst: false, seed: '', exp: [], ...normalizeRules('custom') },   // + mode, rules (house rules)
    state: null,
    undo: [],       // { json, seat, label, self }
    chat: [],
};
const clients = new Set();
const cleanName = (s) => String(s || '').replace(/[<>]/g, '').trim().slice(0, 20);
const seatOf = (sock) => room.seats.findIndex(s => s.socket === sock);
const hostIndex = () => { const i = room.seats.findIndex(s => s.socket && !s.bot); return i; };
const isHost = (sock) => { const i = seatOf(sock); return i >= 0 && i === hostIndex(); };
// Expansion heroes (Цири) can be picked only while their expansion is switched on.
const schoolAllowed = (k) => !!SCHOOLS[k] && (!SCHOOLS[k].exp || (room.settings.exp || []).includes(SCHOOLS[k].exp));
const freeSchool = () => [...SCHOOL_ORDER, ...Object.keys(SCHOOLS).filter(k => !SCHOOL_ORDER.includes(k))].find(k => schoolAllowed(k) && !room.seats.some(s => s.school === k)) || 'wolf';

function lanAddresses() {
    const out = [];
    for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
    return out;
}
function lobbyMsg() {
    return {
        t: 'lobby', phase: room.phase, settings: room.settings, build: BUILD, addresses: lanAddresses(), port: PORT,
        seats: room.seats.map((s, i) => ({ id: i, name: s.name, school: s.school, bot: s.bot, online: !!s.socket || !!s.bot, host: i === hostIndex() })),
        saves: listSaves(),
    };
}
function broadcastLobby() { for (const c of clients) c.send(lobbyMsg()); }

function sendState(sock) {
    if (!room.state) return;
    const seat = seatOf(sock);
    const st = room.state;
    const view = viewFor(st, seat >= 0 ? seat : -1);
    const opts = seat >= 0 ? options(st, seat) : null;
    sock.send({ t: 'state', you: seat, host: isHost(sock), view, options: opts, build: BUILD, undo: undoInfo(seat), chat: room.chat.slice(-50) });
}
function broadcastState() { for (const c of clients) sendState(c); }
function notice(text) { for (const c of clients) c.send({ t: 'notice', text }); }

function undoInfo(seat) {
    const last = room.undo[room.undo.length - 1];
    return { depth: room.undo.length, self: !!(last && last.self && last.seat === seat), label: last ? last.label : '' };
}

/** Can the player take back their own command? Only if it revealed nothing: no RNG used and no deck shrank. */
function revealedNothing(before, after) {
    if (before.rng !== after.rng) return false;
    if (before.actionDeck.length !== after.actionDeck.length || before.elixirDeck.length !== after.elixirDeck.length) return false;
    for (let i = 0; i < before.players.length; i++) if (before.players[i].deck.length !== after.players[i].deck.length) return false;
    // Exploration cards and location tokens (quests) are hidden until drawn.
    if (JSON.stringify(before.explore || null) !== JSON.stringify(after.explore || null)) return false;
    if (JSON.stringify(before.locPiles) !== JSON.stringify(after.locPiles)) return false;
    return true;
}

function runCommand(seat, cmd, label) {
    const st = room.state;
    const json = JSON.stringify(st);
    const before = JSON.parse(json);
    const r = apply(st, seat, cmd);
    if (!r.ok) return r;
    room.undo.push({ json, seat, label, self: !room.seats[seat]?.bot && revealedNothing(before, st) });
    if (room.undo.length > UNDO_LIMIT) room.undo.shift();
    if (st.stage === 'over') saveGame('autosave-final');
    return r;
}

let botTimer = null;
function scheduleBots() {
    clearTimeout(botTimer);
    const st = room.state;
    if (!st || st.stage === 'over') return;
    const seat = actingSeat(st);
    if (seat == null) return;
    const s = room.seats[seat];
    if (!s || (!s.bot && !st.players[seat].away)) return;
    botTimer = setTimeout(() => {
        const view = viewFor(st, seat);
        const cmd = botCommand(view, { options: options(st, seat) });
        if (!cmd) return;
        const r = runCommand(seat, cmd, `${s.name}: бот`);
        if (!r.ok) { console.error('bot command rejected', cmd, r.err); return; }
        broadcastState();
        scheduleBots();
    }, BOT_DELAY);
}

// ---------------------------------------------------------------------------------------------
// Saves
// ---------------------------------------------------------------------------------------------
function listSaves() {
    try { return fs.readdirSync(SAVES).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)).sort().reverse().slice(0, 30); } catch { return []; }
}
function saveGame(name) {
    if (!room.state) return null;
    fs.mkdirSync(SAVES, { recursive: true });
    const n = (String(name || '').replace(/[^\p{L}\p{N} _-]/gu, '').trim() || new Date().toISOString().replace(/[:.]/g, '-')).slice(0, 50);
    fs.writeFileSync(path.join(SAVES, n + '.json'), JSON.stringify({ v: 1, seats: room.seats.map(s => ({ name: s.name, school: s.school, bot: s.bot })), state: room.state }));
    return n;
}
function loadGame(name) {
    const f = path.join(SAVES, String(name).replace(/[\/\\]/g, '') + '.json');
    if (!fs.existsSync(f)) return false;
    const data = JSON.parse(fs.readFileSync(f, 'utf8'));
    // Connected humans take the save's human seats (same school first, then in order); the rest
    // of the human seats wait offline for a reconnect, bot seats stay bots.
    const humans = room.seats.filter(o => !o.bot && o.socket);
    const seats = data.seats.map(s => ({ token: crypto.randomBytes(12).toString('hex'), name: s.name, school: s.school, bot: s.bot ? 1 : 0, socket: null }));
    const place = (h, seat) => { seat.token = h.token; seat.socket = h.socket; seat.name = h.name; humans.splice(humans.indexOf(h), 1); };
    for (const seat of seats) { if (seat.bot) continue; const h = humans.find(x => x.school === seat.school); if (h) place(h, seat); }
    for (const seat of seats) { if (seat.bot || seat.socket || !humans.length) continue; place(humans[0], seat); }
    room.seats = seats;
    for (let i = 0; i < seats.length; i++) if (data.state.players[i]) { data.state.players[i].name = seats[i].name; data.state.players[i].bot = seats[i].bot; }
    room.state = data.state;
    room.phase = 'playing';
    room.undo = [];
    return true;
}

// ---------------------------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------------------------
function onMessage(sock, m) {
    switch (m.t) {
        case 'join': {
            let idx = m.token ? room.seats.findIndex(s => s.token === m.token) : -1;
            if (idx < 0 && room.phase === 'playing') {
                // Unknown browser during a game: take over the first human seat that is offline
                // (a player who switched browser or cleared storage); otherwise spectate.
                idx = room.seats.findIndex(s => !s.bot && !s.socket);
            }
            if (idx >= 0) { const s = room.seats[idx]; if (s.socket && s.socket !== sock) s.socket.close(); s.socket = sock; }
            else if (room.phase === 'lobby' && room.seats.length < MAX_SEATS) {
                room.seats.push({ token: crypto.randomBytes(12).toString('hex'), name: cleanName(m.name) || 'Ведьмак ' + (room.seats.length + 1), school: freeSchool(), bot: 0, socket: sock });
                idx = room.seats.length - 1;
            }
            sock.send({ t: 'welcome', token: idx >= 0 ? room.seats[idx].token : null, seat: idx, build: BUILD });
            broadcastLobby();
            if (room.state) sendState(sock);
            if (idx >= 0) notice(room.seats[idx].name + ' подключился');
            break;
        }
        case 'lobby': {
            const idx = seatOf(sock);
            if (idx < 0 || room.phase !== 'lobby') return;
            const s = room.seats[idx];
            if (typeof m.name === 'string') s.name = cleanName(m.name) || s.name;
            if (typeof m.school === 'string' && schoolAllowed(m.school) && !room.seats.some((o, i) => i !== idx && o.school === m.school)) s.school = m.school;
            if (isHost(sock)) {
                if (m.settings) {
                    if (typeof m.settings.randomFirst === 'boolean') room.settings.randomFirst = m.settings.randomFirst;
                    if (typeof m.settings.seed === 'string') room.settings.seed = m.settings.seed.slice(0, 20);
                    if (m.settings.exp) {
                        room.settings.exp = normalizeExp(m.settings.exp);
                        for (const o of room.seats) if (!schoolAllowed(o.school)) { o.school = '-'; o.school = freeSchool(); }
                    }
                    if (typeof m.settings.mode === 'string' || (m.settings.rules && typeof m.settings.rules === 'object')) {
                        // The custom choice is remembered separately: MMR forces everything on, and switching back restores it.
                        const mode = typeof m.settings.mode === 'string' ? m.settings.mode : room.settings.mode;
                        if (mode === 'custom' && m.settings.rules) room.customRules = { ...(room.customRules || {}), ...m.settings.rules };
                        Object.assign(room.settings, normalizeRules(mode, room.customRules || {}));
                    }
                }
                if (m.addBot && room.seats.length < MAX_SEATS) {
                    const school = freeSchool();
                    room.seats.push({ token: crypto.randomBytes(12).toString('hex'), name: BOT_NAMES[room.seats.length % BOT_NAMES.length], school, bot: 1, socket: null });
                }
                if (m.kick != null) { const k = room.seats[m.kick]; if (k && m.kick !== idx) { if (k.socket) k.socket.close(); room.seats.splice(m.kick, 1); } }
                if (m.botSchool && room.seats[m.botSchool.id]?.bot && schoolAllowed(m.botSchool.school) && !room.seats.some(o => o.school === m.botSchool.school)) room.seats[m.botSchool.id].school = m.botSchool.school;
            }
            broadcastLobby();
            break;
        }
        case 'start': {
            if (!isHost(sock) || room.phase !== 'lobby') return;
            room.seats = room.seats.filter(s => s.socket || s.bot);
            if (!room.seats.length) return;
            const seed = room.settings.seed ? hashSeed(room.settings.seed) : (Date.now() & 0x7fffffff);
            const order = room.seats.slice();
            if (room.settings.randomFirst) { for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; } }
            room.seats = order;
            room.state = createGame({ seed, players: room.seats.map(s => ({ name: s.name, school: s.school, bot: s.bot })), mode: room.settings.mode, rules: room.settings.rules, exp: room.settings.exp });
            room.phase = 'playing'; room.undo = [];
            console.log('Game started:', room.seats.map(s => s.name + '/' + s.school).join(', '));
            broadcastLobby(); broadcastState(); scheduleBots();
            break;
        }
        case 'cmd': {
            const idx = seatOf(sock);
            if (idx < 0 || !room.state) return;
            const r = runCommand(idx, m.cmd, `${room.seats[idx].name}: ${m.label || m.cmd?.t}`);
            if (!r.ok) { sock.send({ t: 'error', err: r.err }); return; }
            broadcastState(); scheduleBots();
            break;
        }
        case 'undo': {
            const idx = seatOf(sock);
            const last = room.undo[room.undo.length - 1];
            if (!last || !room.state) return;
            const self = last.self && last.seat === idx;
            if (!self && !isHost(sock)) { sock.send({ t: 'error', err: 'Отменить чужое или открывшее скрытое действие может только хозяин стола' }); return; }
            room.undo.pop();
            room.state = JSON.parse(last.json);
            room.state.events = [{ k: 'undo' }];
            notice(`Отмена: ${last.label}`);
            broadcastState(); scheduleBots();
            break;
        }
        case 'save': {
            if (!isHost(sock)) return;
            const n = saveGame(m.name);
            if (n) notice('Партия сохранена: ' + n);
            broadcastLobby();
            break;
        }
        case 'load': {
            if (!isHost(sock)) return;
            if (loadGame(m.name)) {
                // Sandboxes take the lobby's current mode and house rules (to try them out).
                if (/^Песочница/.test(m.name) && room.state) Object.assign(room.state, normalizeRules(room.settings.mode, room.settings.rules), { exp: normalizeExp([...(room.state.exp || []), ...(room.settings.exp || [])]) });
                notice('Загружена партия: ' + m.name); for (const c of clients) { const i = seatOf(c); c.send({ t: 'welcome', token: i >= 0 ? room.seats[i].token : null, seat: i, build: BUILD }); } broadcastLobby(); broadcastState(); scheduleBots();
            }
            break;
        }
        case 'newGame': {
            if (!isHost(sock)) return;
            if (room.state && room.state.stage !== 'over') saveGame('Автосохранение');
            room.phase = 'lobby'; room.state = null; room.undo = [];
            room.seats = room.seats.filter(s => s.socket || s.bot);
            broadcastLobby();
            for (const c of clients) c.send({ t: 'reset' });
            break;
        }
        case 'chat': {
            const idx = seatOf(sock);
            const text = String(m.text || '').replace(/[<>]/g, '').trim().slice(0, 200);
            if (!text) return;
            const msg = { from: idx >= 0 ? room.seats[idx].name : 'Зритель', text, at: Date.now() };
            room.chat.push(msg); if (room.chat.length > 200) room.chat.shift();
            for (const c of clients) c.send({ t: 'chat', msg });
            break;
        }
        case 'away': {
            // A player may hand their seat to a bot (and take it back).
            const idx = seatOf(sock);
            if (idx < 0 || !room.state) return;
            room.state.players[idx].away = !!m.on;
            broadcastState(); scheduleBots();
            break;
        }
    }
}
function hashSeed(s) { let h = 2166136261; for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h & 0x7fffffff; }

// ---------------------------------------------------------------------------------------------
let PORT = PORT_BASE;
const server = http.createServer(serve);
server.on('upgrade', (req, sock) => {
    if (!/^\/ws\b/.test(req.url)) { sock.destroy(); return; }
    const key = req.headers['sec-websocket-key'];
    if (!key) { sock.destroy(); return; }
    const accept = crypto.createHash('sha1').update(key + WS_GUID).digest('base64');
    sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
    const ws = new Socket(sock);
    clients.add(ws);
    ws.onmessage = (m) => onMessage(ws, m);
    ws.onclose = () => {
        clients.delete(ws);
        const i = seatOf(ws);
        if (i >= 0) {
            room.seats[i].socket = null;
            if (room.phase === 'lobby') room.seats.splice(i, 1);
            else notice(room.seats[i].name + ' отключился');
            broadcastLobby();
        }
    };
});
function openBrowser(link) {
    const cmd = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', link]] : process.platform === 'darwin' ? ['open', [link]] : ['xdg-open', [link]];
    try { spawn(cmd[0], cmd[1], { detached: true, stdio: 'ignore' }).unref(); } catch { /* the address is printed anyway */ }
}
function listen(port, tries = 0) {
    server.once('error', (e) => { if (e.code === 'EADDRINUSE' && tries < 20) listen(port + 1, tries + 1); else throw e; });
    server.listen(port, '0.0.0.0', () => {
        PORT = port;
        console.log(`\n  Ведьмак: Старый мир — сервер запущен (сборка ${BUILD})`);
        console.log(`  Этот компьютер:  http://localhost:${port}/`);
        for (const a of lanAddresses()) console.log(`  Друзья по сети:  http://${a}:${port}/`);
        console.log('');
        if (process.argv.includes('--open')) openBrowser(`http://localhost:${port}/`);
    });
}
// Sandbox positions (fight test, poker test, mid-game) are always available in the lobby.
try { if (SCENARIO_NAMES.some(n => !listSaves().includes(n))) writeScenarios(); } catch (e) { console.warn('scenarios:', e.message); }
listen(PORT_BASE);
