// app.js — Nemesis client: lobby, HUD, prompts, hand, log, chat, undo. Talks to server.mjs over
// WebSocket and renders the 3D board through scene3d.js.

import { Scene3D, Preview3D } from './scene3d.js';
import { DEFAULTS } from './characters.js';
import { DiceUI } from './dice.js';
import { TableFX } from './fx.js';
import * as Snd from './sound.js';
import { cardHtml, describeCard, esc, eventArt, itemArtHtml, itemLabel, itemTitle, woundName } from './cards.js';
import { ROOM_TILES } from '/shared/ship.mjs';
import { ITEMS, INTRUDER_NAMES, COMPUTER_CARDS, OBJECTIVES, DESTINATION_NAMES, CHARACTERS, EVENT_CARDS } from '/shared/data/cards.mjs';

const $ = id => document.getElementById(id);
const PHASES = { setup: 'Подготовка', player: 'Фаза игроков', intruder: 'Фаза чужих', event: 'Фаза событий', cleanup: 'Завершение раунда' };

// ---------------------------------------------------------------------------------------------
// Network
// ---------------------------------------------------------------------------------------------
let ws = null, wsTimer = null;
const net = {
    send(obj) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); },
    connect() {
        const proto = location.protocol === 'https:' ? 'wss://' : 'ws://';
        ws = new WebSocket(proto + location.host + '/ws');
        ws.onopen = () => { net.send({ t: 'join', token: localStorage.getItem('nemesis.token'), name: localStorage.getItem('nemesis.name') || '' }); };
        ws.onmessage = e => onMessage(JSON.parse(e.data));
        ws.onclose = () => { notice('Связь с сервером потеряна. Переподключение…', 'error'); clearTimeout(wsTimer); wsTimer = setTimeout(net.connect, 1500); };
    },
};

// ---------------------------------------------------------------------------------------------
// App state
// ---------------------------------------------------------------------------------------------
const app = {
    me: null, host: false, spectator: false,
    lobby: null, view: null, logEntries: [], selectedCards: new Set(), hoverRoom: null,
    charId: null, colors: {}, name: '', ready: false, menuCollapsed: true,
};
let scene = null, preview = null, dice = null, tableFx = null;
let cursorSent = 0, lastFloor = null;

function onMessage(m) {
    switch (m.t) {
        case 'welcome':
            if (m.token) localStorage.setItem('nemesis.token', m.token);
            app.me = m.seat; app.spectator = m.spectator;
            break;
        case 'lobby': app.lobby = m; renderLobby(); break;
        case 'state':
            if (!m.view) { app.view = null; $('hud').classList.add('hidden'); $('lobby').classList.remove('hidden'); $('endOverlay').classList.add('hidden'); return; }
            app.me = m.you; app.host = m.host;
            if (m.full) app.logEntries = [];
            app.logEntries.push(...m.view.log);
            app.view = m.view; app.undoDepth = m.undoDepth; app.history = m.history;
            renderGame();
            if (m.poses && scene) for (const [pid, pose] of Object.entries(m.poses)) scene.setPose(Number(pid), pose, true);
            break;
        case 'notice': notice(m.text, m.kind); break;
        case 'chat': addChat(m); break;
        case 'cursor': if (scene && app.view && m.pid !== app.me) { const p = app.view.players[m.pid]; if (p) scene.setCursor(m.pid, m.x, m.z, CHARACTERS[p.charId].color, p.name, m.off); } break;
        case 'pose': if (scene && m.pid !== app.me) scene.setPose(m.pid, m.pose, false); break;
        case 'ping': if (scene && app.view) { const p = app.view.players[m.pid]; if (p) { scene.ping(m.x, m.z, CHARACTERS[p.charId].color); Snd.play('ping'); if (m.pid !== app.me) notice('📍 ' + p.name + (m.room ? ' указывает на ' + roomLabel(m.room) : ' указывает на стол'), 'ping'); } } break;
    }
}

function notice(text, kind) {
    const el = document.createElement('div'); el.className = 'notice ' + (kind || ''); el.textContent = text;
    $('notices').appendChild(el);
    setTimeout(() => el.remove(), kind === 'undo' || kind === 'error' ? 7000 : 3500);
}

// ---------------------------------------------------------------------------------------------
// Lobby
// ---------------------------------------------------------------------------------------------
function renderLobby() {
    const L = app.lobby; if (!L) return;
    const inGame = L.phase === 'playing' && app.view;
    $('lobby').classList.toggle('hidden', !!inGame);
    if (inGame) return;
    const mySeat = L.seats.find(s => s.id === app.me);
    if (mySeat) {
        if (document.activeElement !== $('nameInput')) $('nameInput').value = mySeat.name;
        app.charId = mySeat.charId; app.colors = mySeat.colors || {}; app.ready = mySeat.ready;
        app.host = mySeat.host;
    }
    // characters
    $('charList').innerHTML = Object.entries(L.characters).map(([id, c]) => {
        const taken = L.seats.some(s => s.charId === id && s.id !== app.me);
        return '<div class="char-card ' + (id === app.charId ? 'sel' : '') + (taken ? ' taken' : '') + '" data-char="' + id + '" style="border-left:5px solid ' + c.color + '"><b>' + esc(c.name) + '</b><small>' + esc((CHARACTERS[id] ? CHARACTERS[id].startItems : []).map(si => ITEMS[si.item].name).join(', ')) + '</small></div>';
    }).join('');
    for (const el of $('charList').querySelectorAll('.char-card')) el.onclick = () => { if (el.classList.contains('taken')) return; net.send({ t: 'lobby', charId: el.dataset.char, colors: {} }); };
    // paint zones
    const ch = L.characters[app.charId];
    if (ch) {
        const def = DEFAULTS[app.charId] || {};
        $('paintZones').innerHTML = ch.zones.map(z => {
            const cur = app.colors[z.id] || def[z.id] || z.presets[0];
            return '<div class="zone"><span class="zname">' + esc(z.label) + '</span>' +
                z.presets.map(p => '<span class="swatch ' + (p.toLowerCase() === cur.toLowerCase() ? 'sel' : '') + '" data-zone="' + z.id + '" data-color="' + p + '" style="background:' + p + '"></span>').join('') +
                '<span class="swatch custom" title="Своя палитра"><input type="color" data-zone="' + z.id + '" value="' + cur + '"></span></div>';
        }).join('');
        for (const el of $('paintZones').querySelectorAll('.swatch[data-color]')) el.onclick = () => sendColor(el.dataset.zone, el.dataset.color);
        for (const el of $('paintZones').querySelectorAll('input[type=color]')) el.oninput = () => sendColor(el.dataset.zone, el.value);
        if (!preview) preview = new Preview3D($('previewCanvas'));
        preview.show(app.charId, Object.assign({}, def, app.colors));
    }
    // seats
    $('seatList').innerHTML = L.seats.map(s => {
        const c = L.characters[s.charId];
        return '<div class="seat ' + (s.online ? '' : 'off') + '"><span class="dot" style="background:' + (c ? c.color : '#888') + '"></span><span class="nm">' + esc(s.name) + (s.host ? ' 👑' : '') + (s.id === app.me ? ' (вы)' : '') + '</span><span class="st">' + (c ? c.name : '') + ' · ' + (s.online ? (s.ready ? 'готов' : 'не готов') : 'оффлайн') + '</span>' +
            (app.host && s.id !== app.me ? '<button class="btn small danger" data-kick="' + s.id + '">✕</button>' : '') + '</div>';
    }).join('') || '<div class="hint">Пока никого…</div>';
    for (const el of $('seatList').querySelectorAll('[data-kick]')) el.onclick = () => net.send({ t: 'lobby', kick: Number(el.dataset.kick) });
    // settings
    $('modeSelect').value = L.settings.mode; if (document.activeElement !== $('seedInput')) $('seedInput').value = L.settings.seed || '';
    $('modeSelect').disabled = !app.host; $('seedInput').disabled = !app.host;
    $('lanAddr').textContent = L.addresses.length ? L.addresses.map(a => 'http://' + a + ':' + L.port).join('   ') : location.origin;
    $('readyBtn').textContent = app.ready ? 'Не готов' : 'Готов';
    $('readyBtn').disabled = app.spectator;
    const online = L.seats.filter(s => s.online);
    $('startBtn').disabled = !app.host || online.length < 1 || online.some(s => !s.ready);
    $('startBtn').title = app.host ? 'Все подключённые игроки должны нажать «Готов»' : 'Начать может только ведущий';
}
function sendColor(zone, color) { app.colors = Object.assign({}, app.colors, { [zone]: color }); net.send({ t: 'lobby', colors: app.colors }); }

$('nameInput').onchange = () => { localStorage.setItem('nemesis.name', $('nameInput').value); net.send({ t: 'lobby', name: $('nameInput').value }); };
$('readyBtn').onclick = () => net.send({ t: 'lobby', ready: !app.ready });
$('startBtn').onclick = () => net.send({ t: 'start' });
$('modeSelect').onchange = () => net.send({ t: 'lobby', settings: { mode: $('modeSelect').value, seed: $('seedInput').value } });
$('seedInput').onchange = () => net.send({ t: 'lobby', settings: { mode: $('modeSelect').value, seed: $('seedInput').value } });
$('restartBtn').onclick = () => { if (app.host) net.send({ t: 'restart' }); else $('endOverlay').classList.add('hidden'); };

// ---------------------------------------------------------------------------------------------
// Game rendering
// ---------------------------------------------------------------------------------------------
function renderGame() {
    const v = app.view;
    $('lobby').classList.add('hidden'); $('hud').classList.remove('hidden');
    if (!scene) {
        scene = new Scene3D($('scene'), {
            onHover: onRoomHover, onClick: onRoomClick,
            onCursor: (x, z, room) => { lastFloor = { x, z, room }; const now = performance.now(); if (now - cursorSent > 50) { cursorSent = now; net.send({ t: 'cursor', x, z }); } },
            onPose: pose => net.send({ t: 'pose', dx: pose.dx, dz: pose.dz, rot: pose.rot }),
        });
    }
    scene.setMe(app.me);
    if (!dice) { dice = new DiceUI($('dice'), () => act('roll')); dice.afterHide = () => { if (app.view) dice.update(app.view, app.me, playerName); }; dice.onLanded = () => { app.rollHold = false; if (app.view) renderGame(); }; }
    // Dice gate. The engine moves the figure and reveals the room BEFORE asking for the noise roll, so the 3D
    // scene (and the card/bag fx) freeze from the moment a dice prompt appears until the rolled die has landed:
    // the player sees the result first, only then the figure runs and the room token flips.
    const pr = v.prompt;
    const dicePrompt = pr && pr.kind === 'dice';
    const freshRoll = v.lastRoll && dice.lastSeen !== null && v.lastRoll.n !== dice.lastSeen;
    if (dicePrompt || freshRoll) {
        app.rollHold = true;
        dice.update(v, app.me, playerName);
        renderTopbar(); renderPlayers(); renderLog(); renderHistory(); renderPrompt(); renderHand();
        if (freshRoll) setTimeout(() => { if (app.rollHold && !(app.view.prompt && app.view.prompt.kind === 'dice')) { app.rollHold = false; renderGame(); } }, 5000);   // safety net
        return;
    }
    if (app.rollHold && dice.rolling) return;   // die still tumbling: keep the frozen scene until it lands
    app.rollHold = false;
    const selectable = pr && pr.kind === 'room' && !pr.waiting ? pr.rooms : [];
    scene.update(v, ROOM_TILES, INTRUDER_NAMES, selectable);
    renderTopbar(); renderPlayers(); renderLog(); renderHistory(); renderPrompt(); renderHand();
    revealEvent(v);
    dice.update(v, app.me, playerName);
    if (!tableFx) { tableFx = new TableFX($('table'), $('fxLayer'), pid => document.querySelector('.pcard[data-pid="' + pid + '"]'), INTRUDER_NAMES); tableFx.onShake = k => scene && scene.shake(k); }
    tableFx.update(v, app.me);
    renderPilePopups(v); syncPanes();
    if (v.result) renderEnd();
}

function renderTopbar() {
    const v = app.view;
    renderTrack(v);
    $('tbDest').textContent = v.destination;
    const bk = v.bagKnown; $('tbBag').textContent = v.bagCount + ' (' + ['blank', 'larva', 'adult', 'drone', 'queen'].filter(k => bk[k]).map(k => INTRUDER_NAMES[k][0] + bk[k]).join(' ') + ')';
    $('tbMarkers').textContent = (8 - v.fireLeft) + '/8 · ' + (8 - v.malfLeft) + '/8';
    $('tbComputer').textContent = v.computerCard ? COMPUTER_CARDS[v.computerCard].name : '—';
    $('tbComputer').title = v.computerCard ? COMPUTER_CARDS[v.computerCard].text : '';
    $('undoBtn').disabled = !app.host || !app.undoDepth;
    $('undoBtn').title = app.host ? 'Откатить последнее действие (' + (app.undoDepth || 0) + ' в стеке)' : 'Откатывать может только ведущий';
}

function hpBar(p) {
    const sections = [[10, 9, 8], [7, 6, 5], [4, 3, 2], [1]];
    let s = '';
    sections.forEach((sec, si) => { for (const n of sec) s += '<i class="' + (si === 1 ? 'mid' : si === 2 ? 'heavy' : si === 3 ? 'last' : '') + (p.health >= n ? ' on' : '') + '" title="' + n + '"></i>'; if (si < 3) s += '<i style="width:3px;background:none"></i>'; });
    return '<div class="hp" title="Здоровье: ' + p.health + ' / 10' + (p.health === 0 ? ' — при смерти' : '') + '">' + s + '</div>';
}
function statusName(p) { return ({ active: '', dead: 'ПОГИБ', escaped: 'УЛЕТЕЛ', hibernating: 'ГИБЕРНАЦИЯ' })[p.status] || p.status; }

function renderPlayers() {
    const v = app.view;
    $('players').innerHTML = v.players.map(p => {
        const me = p.id === app.me;
        const tags = [];
        if (p.pod) tags.push('<span class="tag blue">капсула №' + p.pod + '</span>');
        if (p.passed && v.phase === 'player') tags.push('<span class="tag">пас</span>');
        for (const w of p.wounds) tags.push('<span class="tag red" title="' + esc(woundName(w)) + '">травма: ' + esc(woundName(w)) + '</span>');
        if (p.larva) tags.push('<span class="tag purple">личинка</span>');
        if (p.armor) tags.push('<span class="tag itag" title="' + esc(itemTitle(p.armor)) + '">' + itemArtHtml(p.armor) + '🛡 ' + esc(itemLabel(p.armor)) + (p.armor.item === 'probeArm' ? ' · жетонов свободно ' + (p.armor.charge ?? ITEMS.probeArm.markers) : '') + '</span>');
        if (p.tissue) tags.push('<span class="tag yellow">🧫 ткань ×' + p.tissue + '</span>');
        if (p.laika) tags.push('<span class="tag yellow">🐕 Лайка: ' + (p.laika === 'board' ? 'рядом' : 'в ' + esc(roomLabel(p.laika))) + '</span>');
        if (p.signal) tags.push('<span class="tag green">сигнал</span>');
        tags.push('<span class="tag yellow">знания ' + p.knowledge + (p.knowledgeActive ? ' ✓' : '') + '</span>');
        tags.push('<span class="tag" title="Карт в руке / колоде / сбросе (заражений в сбросе)">🂠 ' + p.handCount + ' / ' + p.deckCount + ' / ' + p.discardCount + (p.contamInDiscard ? ' ☣' + p.contamInDiscard : '') + '</span>');
        const items = p.items.map(i => '<span class="itag" title="' + esc(itemTitle(i)) + '">' + itemArtHtml(i) + (ITEMS[i.item].weapon ? '🔫' : ITEMS[i.item].kind === 'heavy' ? '📦' : '🔹') + esc(itemLabel(i)) + '</span>').join('')
            + p.heavy.map(h => '<span>🧳 ' + ({ corpse: 'труп', charCorpse: 'труп персонажа', carcass: 'туша', egg: 'яйцо' })[h.type] + '</span>').join('');
        let obj = '';
        if (me && p.objectives) obj = '<div class="items" style="color:#ffd27f">' + p.objectives.map(o => '🎯 ' + esc(OBJECTIVES[o.kind][o.id].name) + ': ' + esc(OBJECTIVES[o.kind][o.id].text.replace('{target}', o.target !== undefined ? v.players[o.target].name : ''))).join('<br>') + '</div>';
        let known = '';
        if (me) {
            const ke = Object.entries(p.knownEngines || {}); if (ke.length) known += '<div class="items">⚙ ' + ke.map(([n, w]) => '№' + n + ': ' + (w ? 'исправен' : 'повреждён')).join(', ') + '</div>';
            if (p.knownCoords) known += '<div class="items">🧭 координаты известны (см. Рубку)</div>';
        }
        return '<div class="pcard ' + (v.current === p.id && v.phase === 'player' ? 'current' : '') + (me ? ' me' : '') + (p.status === 'dead' ? ' dead' : '') + '" data-pid="' + p.id + '" style="border-left-color:' + CHARACTERS[p.charId].color + '">' +
            '<div class="pname"><span>' + esc(p.name) + (me ? ' (вы)' : '') + '</span><small>' + esc(p.charName) + ' ' + statusName(p) + '</small></div>' +
            hpBar(p) + '<div class="tags">' + tags.join('') + '</div><div class="items">' + items + '</div>' + obj + known +
            '<div class="items dim">📍 ' + esc(roomLabel(p.room)) + '</div></div>';
    }).join('');
}

function roomLabel(id) {
    const v = app.view; const r = v.ship.rooms[id]; const rs = v.roomState[id];
    const tile = rs.tile || (r.kind === 'cockpit' ? 'cockpit' : r.kind === 'hibernatorium' ? 'hibernatorium' : r.kind === 'engine' ? 'engine' : null);
    return (tile ? ROOM_TILES[tile].name + (r.kind === 'engine' ? ' №' + r.engineNo : '') : (r.kind === 'slot1' ? 'Комната «1»' : 'Комната «2»')) + ' [' + id + ']';
}

function renderLog() {
    const el = $('log');
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 30;
    el.innerHTML = app.logEntries.slice(-400).map(l => '<div class="l ' + l.kind + '">' + esc(l.text) + '</div>').join('');
    if (atBottom) el.scrollTop = el.scrollHeight;
}
/** Big illustrated card shown in the middle of the screen when a new Event card is revealed. Click or wait to dismiss. */
const REVEAL_MS = 7000;
function revealEvent(v) {
    const key = v.lastEvent ? v.round + ':' + v.lastEvent : null;
    if (!key || app.revealSeen === key) return;
    const first = app.revealSeen === undefined;
    app.revealSeen = key;
    if (first) return;   // joining mid-game: do not replay the last event
    const ev = EVENT_CARDS.find(e => e.id === v.lastEvent); if (!ev) return;
    const art = eventArt(ev.id);
    showReveal('<div class="rcard event">' + (art ? '<div class="rart" style="background-image:url(' + art + ')"></div>' : '') +
        '<div class="rkind">Событие</div><div class="rname">' + esc(ev.name) + '</div><div class="rtext">' + esc(ev.text || '') + '</div></div>');
}
function showReveal(html) {
    let el = document.getElementById('reveal');
    if (!el) { el = document.createElement('div'); el.id = 'reveal'; document.body.appendChild(el); el.onclick = () => el.classList.remove('show'); }
    el.innerHTML = html; el.classList.add('show');
    clearTimeout(app.revealTimer); app.revealTimer = setTimeout(() => el.classList.remove('show'), REVEAL_MS);
}
function renderHistory() { $('history').innerHTML = (app.history || []).map(h => '<div>' + esc(h) + '</div>').join('') || '<div class="hint">Пока нет действий</div>'; }

// ---------------------------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------------------------
function renderPrompt() {
    const v = app.view; const pr = v.prompt; const el = $('prompt'); const tg = $('menuToggle');
    app.selectedCards.clear();
    if (!pr || pr.kind === 'dice') { el.classList.add('hidden'); tg.classList.add('hidden'); return; }   // dice prompts are shown by DiceUI
    const who = pr.player === 'host' ? 'Ведущий' : v.players[pr.player].name;
    // Collapsing: the turn menu remembers the player's choice; other prompts re-open when a new one arrives.
    // Collapsing: the action list opens by itself at the start of the player's turn and then keeps whatever the
    // player chose until the turn ends; other prompts always open when a new one arrives.
    if (pr.id !== app.lastPromptId) {
        app.lastPromptId = pr.id;
        if (pr.kind !== 'turn') app.promptCollapsed = false;
        else { const tk = v.round + ':' + pr.player; if (tk !== app.turnKey) { app.turnKey = tk; app.menuCollapsed = false; } app.promptCollapsed = app.menuCollapsed; }
    }
    const mine = !pr.waiting;
    tg.classList.toggle('hidden', !mine && !pr.waiting);
    tg.textContent = app.promptCollapsed ? '☰ ' + (pr.kind === 'turn' ? 'Действия' : 'Открыть окно') : '✕ Свернуть';
    tg.classList.toggle('attention', mine && app.promptCollapsed);
    el.classList.toggle('hidden', app.promptCollapsed);
    if (pr.waiting) {
        el.classList.add('waiting');
        el.innerHTML = '<h4>' + esc(who) + ' <span class="waiting-dots">думает</span></h4><div class="ptext">' + esc(pr.title || '') + '</div>';
        return;
    }
    el.classList.remove('waiting');
    let html = '<h4>' + esc(pr.title) + '</h4>';
    if (pr.text) html += '<div class="ptext">' + esc(pr.text) + '</div>';
    switch (pr.kind) {
        case 'turn': {
            html += '<div class="menu-cols"><div><h5>Действия</h5><div class="opts">' + pr.actions.map(a =>
                '<button class="opt" data-act="' + a.id + '" ' + (a.enabled ? '' : 'disabled') + '><span>' + esc(a.label) + (a.cost ? ' <small>(' + a.cost + ' 🂠)</small>' : '') + '</span>' + (a.reason ? '<span class="why">' + esc(a.reason) + '</span>' : '') + '</button>').join('') + '</div></div>';
            html += '<div><h5>Предметы</h5><div class="opts">' + (pr.items.length ? pr.items.map(i => {
                const pp = v.players[pr.player]; const inst = pp.items.find(x => x.uid === i.uid) || (pp.armor && pp.armor.uid === i.uid ? pp.armor : null);
                return '<button class="opt" data-item="' + i.uid + '" ' + (i.enabled ? '' : 'disabled') + ' title="' + esc(inst ? itemTitle(inst) : '') + '">' + (inst ? itemArtHtml(inst) : '') + '<span>' + esc(inst ? itemLabel(inst) : i.uid) + (i.cost ? ' <small>(' + i.cost + ' 🂠)</small>' : ' <small>(бесплатно)</small>') + '</span>' + (i.reason ? '<span class="why">' + esc(i.reason) + '</span>' : '') + '</button>';
            }).join('') : '<div class="hint">Нет используемых предметов</div>') + '<div class="hint" style="margin-top:6px">Карты действий — внизу: нажмите на карту, чтобы разыграть.</div></div></div></div>';
            break;
        }
        case 'choice':
            html += '<div class="opts">' + pr.options.map(o => '<button class="opt" data-opt="' + esc(o.id) + '" ' + (o.disabled ? 'disabled' : '') + '><span>' + esc(o.label) + (o.tag ? ' <small>· ' + esc(o.tag) + '</small>' : '') + '</span>' + (o.desc ? '<small>' + esc(o.desc) + '</small>' : '') + '</button>').join('') + '</div>';
            if (pr.cancel) html += '<div class="prompt-buttons"><button class="btn" data-opt="cancel">Отмена</button></div>';
            break;
        case 'room':
            html += '<div class="ptext">Нажмите на комнату на карте или выберите из списка:</div><div class="opt-row">' + pr.rooms.map(r => '<button class="opt" data-room="' + r + '">' + esc(roomLabel(r)) + '</button>').join('') + '</div>';
            if (pr.cancel) html += '<div class="prompt-buttons"><button class="btn" data-opt="cancel">Отмена</button></div>';
            break;
        case 'cards':
            html += '<div class="ptext">Выберите карт: ' + (pr.min === pr.max ? pr.min : pr.min + '–' + pr.max) + ' (нажимайте на карты в руке внизу)</div><div class="prompt-buttons">' + (pr.cancel ? '<button class="btn" data-opt="cancel">Отмена</button>' : '') + '<button class="btn primary" id="cardsOk" disabled>Подтвердить</button></div>';
            break;
        case 'info':
            html += '<div class="prompt-buttons"><button class="btn primary" data-opt="ok">Понятно</button></div>';
            break;
    }
    el.innerHTML = html;
    for (const b of el.querySelectorAll('[data-act]')) b.onclick = () => act({ action: b.dataset.act });
    for (const b of el.querySelectorAll('[data-item]')) b.onclick = () => act({ action: 'item', itemId: b.dataset.item });
    for (const b of el.querySelectorAll('[data-opt]')) b.onclick = () => act(b.dataset.opt);
    for (const b of el.querySelectorAll('[data-room]')) b.onclick = () => act(b.dataset.room);
    const ok = $('cardsOk'); if (ok) ok.onclick = () => act([...app.selectedCards]);
}
function playerName(id) { const v = app.view; return v && v.players[id] ? v.players[id].name : ''; }
function act(answer) { const pr = app.view && app.view.prompt; if (!pr) return; net.send({ t: 'act', promptId: pr.id, answer }); }

/** Hover popups on the deck piles: my discard pile lists its cards, my deck shows the count. */
function renderPilePopups(v) {
    const me = v.players.find(p => p.id === app.me); if (!me) return;
    const disc = document.querySelector('.pile[data-pile="owndisc"]');
    if (disc && me.discard) {
        const pop = document.createElement('div'); pop.className = 'ppop';
        pop.innerHTML = '<h5>Мой сброс · ' + me.discard.length + '</h5>' + (me.discard.length ? me.discard.map(c => { const d = describeCard(c); return '<div class="' + (d.contam ? 'contam' : '') + '">' + esc(d.name) + '</div>'; }).join('') : '<div>пусто</div>');
        disc.appendChild(pop);
    }
    const own = document.querySelector('.pile[data-pile="own"]');
    if (own) { const pop = document.createElement('div'); pop.className = 'ppop'; pop.innerHTML = '<h5>Моя колода</h5><div>Карт: ' + me.deckCount + '</div><div>В руке: ' + (me.hand ? me.hand.length : '?') + '</div>'; own.appendChild(pop); }
}

/** Top-bar track: round/phase text, 15 time cells (blue from 8 down) and the 6-cell self-destruct track. */
function renderTrack(v) {
    let h = '<div class="tphase">Раунд ' + v.round + '<b>' + esc(PHASES[v.phase] || v.phase) + '</b></div><div class="trk time">';
    for (let i = 15; i >= 1; i--) h += '<div class="cell' + (i <= 8 ? ' blue' : '') + (i > v.time ? ' done' : '') + (i === v.time ? ' cur' : '') + '" title="Время: ' + i + '">' + i + '</div>';
    h += '</div>';
    if (v.selfDestruct > 0) {
        h += '<div class="trk sd" title="Самоуничтожение: ' + v.selfDestruct + '/6">';
        for (let i = 1; i <= 6; i++) h += '<div class="cell' + (i >= 4 ? ' y' : '') + (i < v.selfDestruct ? ' done' : '') + (i === v.selfDestruct ? ' cur' : '') + '">' + (i >= 4 ? '!' : i) + '</div>';
        h += '</div>';
    }
    $('track').innerHTML = h;
}

function renderHand() {
    const v = app.view; const me = v.players.find(p => p.id === app.me);
    const el = $('hand');
    if (!me || !me.hand) { el.innerHTML = ''; return; }
    const pr = v.prompt; const mine = pr && !pr.waiting && pr.player === app.me;
    const menu = mine && pr.kind === 'turn' ? Object.fromEntries(pr.cards.map(c => [c.id, c])) : null;
    const picking = mine && pr.kind === 'cards' ? new Set(pr.cards) : null;
    el.innerHTML = me.hand.map(c => cardHtml(c, menu ? menu[c] : picking ? { enabled: picking.has(c), reason: picking.has(c) ? '' : 'Нельзя выбрать' } : null, app.selectedCards.has(c))).join('');
    const cards = [...el.querySelectorAll('.card')], mid = (cards.length - 1) / 2;
    cards.forEach((cel, i) => { const k = i - mid; cel.style.setProperty('--fan', (k * 4) + 'deg'); cel.style.setProperty('--lift', (Math.abs(k) * 6) + 'px'); });
    for (const cel of el.querySelectorAll('.card')) cel.onclick = () => {
        const id = cel.dataset.card;
        if (menu && menu[id] && menu[id].enabled) act({ action: 'card', cardId: id });
        else if (picking && picking.has(id)) {
            if (app.selectedCards.has(id)) app.selectedCards.delete(id); else if (app.selectedCards.size < pr.max) app.selectedCards.add(id);
            for (const c2 of el.querySelectorAll('.card')) c2.classList.toggle('selected', app.selectedCards.has(c2.dataset.card));
            const ok = $('cardsOk'); if (ok) ok.disabled = app.selectedCards.size < pr.min || app.selectedCards.size > pr.max;
        }
    };
}

// ---------------------------------------------------------------------------------------------
// Room hover / click
// ---------------------------------------------------------------------------------------------
function onRoomHover(id, x, y) {
    const el = $('roomInfo');
    if (!id || !app.view) { el.classList.add('hidden'); return; }
    const v = app.view; const r = v.ship.rooms[id]; const rs = v.roomState[id];
    const me = v.players.find(p => p.id === app.me);
    const tile = rs.tile || (r.kind === 'cockpit' ? 'cockpit' : r.kind === 'hibernatorium' ? 'hibernatorium' : r.kind === 'engine' ? 'engine' : null);
    let html = '<b>' + esc(roomLabel(id)) + '</b>';
    if (tile) html += '<div>' + esc(ROOM_TILES[tile].action) + '</div><div class="dim">Предметы: ' + (ROOM_TILES[tile].items.map(c => ({ green: '🟢', red: '🔴', yellow: '🟡' })[c]).join('') || '—') + (ROOM_TILES[tile].computer ? ' · 💻 компьютер' : '') + '</div>';
    else if (me && me.knownTiles && me.knownTiles[id]) html += '<div class="dim">Вам известно: ' + esc(ROOM_TILES[me.knownTiles[id]].name) + '</div>';
    else html += '<div class="dim">Не разведана</div>';
    const flags = [];
    if (rs.fire) flags.push('🔥 огонь'); if (rs.malfunction) flags.push('⚠ поломка'); if (r.tech) flags.push('🕳 тех. вход');
    const intr = Object.values(v.intruders).filter(i => i.room === id);
    if (intr.length) flags.push('👾 ' + intr.map(i => INTRUDER_NAMES[i.type] + (i.hits ? '(' + i.hits + ')' : '')).join(', '));
    const objs = rs.objects.map(o => ({ corpse: 'труп', charCorpse: 'труп персонажа', carcass: 'туша', egg: 'яйцо' })[o.type]);
    if (objs.length) flags.push('📦 ' + objs.join(', '));
    if (tile === 'nest') flags.push('🥚 яиц: ' + v.nestEggs);
    const ppl = v.players.filter(p => p.room === id && (p.status === 'active' || p.status === 'hibernating') && !p.pod).map(p => p.name);
    if (ppl.length) flags.push('🧑 ' + ppl.join(', '));
    if (flags.length) html += '<div>' + flags.join(' · ') + '</div>';
    html += '<div class="dim">Выходы: ' + r.exits.map(e => (e.nums || [e.num]).join('/') + '→' + e.to + (v.ship.corridors[e.corridor].door === 'closed' ? ' 🚪' : v.ship.corridors[e.corridor].door === 'destroyed' ? ' 💥' : '') + (v.ship.corridors[e.corridor].noise ? ' 🔊' : '')).join(', ') + '</div>';
    el.innerHTML = html; el.classList.remove('hidden');
    el.style.left = Math.min(window.innerWidth - 300, x + 16) + 'px'; el.style.top = Math.min(window.innerHeight - 160, y + 16) + 'px';
}
function onRoomClick(id) {
    const pr = app.view && app.view.prompt;
    if (pr && pr.kind === 'room' && !pr.waiting && pr.player === app.me && pr.rooms.includes(id)) act(id);
    else scene.focusRoom(id);
}

// ---------------------------------------------------------------------------------------------
// End of game
// ---------------------------------------------------------------------------------------------
function renderEnd() {
    const r = app.view.result;
    $('endBody').innerHTML = '<p>' + (r.shipDestroyed ? 'Корабль уничтожен.' : 'Корабль прибыл: ' + esc(DESTINATION_NAMES[r.destination] || r.destination) + '.') + '</p>' +
        r.results.map(x => '<div class="end-row"><span class="res ' + (x.win ? 'win' : 'lose') + '">' + (x.win ? 'ПОБЕДА' : 'ПОРАЖЕНИЕ') + '</span><span><b>' + esc(app.view.players[x.player].name) + '</b> — ' + esc(x.objective) + '<br><small>' + esc(x.objectiveText) + ' · ' + esc(x.why) + '</small></span></div>').join('');
    $('restartBtn').textContent = app.host ? 'Вернуться в лобби' : 'Закрыть';
    $('endOverlay').classList.remove('hidden');
}

// ---------------------------------------------------------------------------------------------
// Misc UI
// ---------------------------------------------------------------------------------------------
for (const t of document.querySelectorAll('.pane-tabs .tab')) t.onclick = () => {
    for (const x of document.querySelectorAll('.pane-tabs .tab')) x.classList.toggle('active', x === t);
    for (const id of ['log', 'chat', 'history']) $(id).classList.toggle('hidden', id !== t.dataset.tab);
};
$('chatInput').onkeydown = e => { if (e.key === 'Enter' && $('chatInput').value.trim()) { net.send({ t: 'chat', text: $('chatInput').value.trim() }); $('chatInput').value = ''; } };
function addChat(m) { const d = document.createElement('div'); d.innerHTML = '<b>' + esc(m.from) + ':</b> ' + esc(m.text); $('chatLines').appendChild(d); $('chatLines').scrollTop = $('chatLines').scrollHeight; if ($('chat').classList.contains('hidden')) notice('💬 ' + m.from + ': ' + m.text); }
$('menuToggle').onclick = () => {
    app.promptCollapsed = !app.promptCollapsed;
    const pr = app.view && app.view.prompt;
    if (pr && pr.kind === 'turn') app.menuCollapsed = app.promptCollapsed;
    renderPrompt(); renderHand();
};
$('undoBtn').onclick = () => { if (confirm('Откатить последнее действие? Все игроки получат уведомление.')) net.send({ t: 'undo', steps: 1 }); };
// collapsible panels (players/objectives → left, log → right, decks → down); state is remembered
const PANES = { pl: ['playersToggle', '◀', '▶'], rt: ['rightToggle', '▶', '◀'], tb: ['tableToggle', '▼', '▲'] };
function syncPanes() {
    for (const [k, [id, open, closed]] of Object.entries(PANES)) { const c = document.body.classList.contains(k + '-collapsed'); $(id).textContent = c ? closed : open; }
    const tb = $('table'); $('tableToggle').style.bottom = document.body.classList.contains('tb-collapsed') ? '4px' : (14 + tb.offsetHeight) + 'px';
}
for (const [k, [id]] of Object.entries(PANES)) {
    if (localStorage.getItem('nemesis.pane.' + k) === '1') document.body.classList.add(k + '-collapsed');
    $(id).onclick = () => { const c = document.body.classList.toggle(k + '-collapsed'); localStorage.setItem('nemesis.pane.' + k, c ? '1' : '0'); syncPanes(); Snd.play('click'); };
}
syncPanes();
const muteBtn = $('muteBtn');
function syncMute() { muteBtn.textContent = Snd.isMuted() ? '🔇' : '🔊'; muteBtn.classList.toggle('off', Snd.isMuted()); }
syncMute();
muteBtn.onclick = () => { Snd.setMuted(!Snd.isMuted()); syncMute(); if (!Snd.isMuted()) Snd.play('click'); };
for (const ev of ['pointerdown', 'keydown']) document.addEventListener(ev, () => Snd.unlock(), { capture: true });
$('helpBtn').onclick = () => { $('helpBody').innerHTML = HELP; $('helpOverlay').classList.remove('hidden'); };
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { $('helpOverlay').classList.add('hidden'); }
    const typing = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');
    if (typing || !scene || !app.view) return;
    if (e.key === 'Tab') { e.preventDefault(); if (lastFloor && !e.repeat) net.send({ t: 'ping', x: lastFloor.x, z: lastFloor.z, room: lastFloor.room }); }
    else if (e.key === 'q' || e.key === 'Q' || e.key === 'й' || e.key === 'Й') scene.rotateMe(-Math.PI / 12);
    else if (e.key === 'e' || e.key === 'E' || e.key === 'у' || e.key === 'У') scene.rotateMe(Math.PI / 12);
});
window.addEventListener('blur', () => { if (app.view) net.send({ t: 'cursor', off: true }); });

const HELP = `
<h4>Цель</h4><p>Выживите и выполните одну из двух своих целей (личную или корпоративную). Выбор цели — бесплатным действием в свой ход; до первой встречи с чужим можно не спешить.</p>
<h4>Раунд</h4><p><b>Фаза игроков:</b> по очереди по 2 действия (карты, предметы, комнаты), пока все не спасуют. В конце хода в горящей комнате — −1 здоровье.<br>
<b>Фаза чужих:</b> огонь жжёт чужих, затем все чужие атакуют персонажей в своих комнатах.<br>
<b>Фаза событий:</b> карта события (движение чужих по коридору с номером + эффект), затем развитие мешка.<br>
<b>Завершение:</b> первый игрок меняется, добор до 5 карт, время −1.</p>
<h4>Шум</h4><p>После перемещения в пустую комнату — бросок шума: жетон кладётся в коридор с выпавшим номером (если он уже там — <b>Встреча</b>: из мешка появляется чужой). «Опасность» — жетоны во все коридоры вокруг. Осторожное перемещение (2 карты) позволяет выбрать коридор без шума.</p>
<h4>Бой</h4><p>Стрельба/ближний бой: бросок D10. Крит убивает всегда; иначе чужой гибнет, если результат ≤ числа его ранений. Ближний бой даёт заражение и ответную атаку. Убегая из комнаты с чужими, вы получаете атаки.</p>
<h4>Конец игры</h4><p>Когда время дойдёт до 0 (или сработает самоуничтожение/капсулы): проверяются двигатели (нужно ≥2 исправных), пункт назначения (A–D по тайной карте координат), заражение всех карт выживших и цели.</p>
<h4>Управление</h4><p>ЛКМ — выбор комнаты / поворот камеры, ПКМ/СКМ — панорама, колесо — масштаб. Наведите на комнату — подсказка.</p>
<h4>Откат</h4><p>Ведущий (👑) может откатить любое количество действий кнопкой «⟲ Откатить ход» — все получают уведомление.</p>`;

net.connect();
