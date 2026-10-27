// app.js — Nemesis client: lobby, HUD, prompts, hand, log, chat, undo. Talks to server.mjs over
// WebSocket and renders the 3D board through scene3d.js.

import { Scene3D, Preview3D } from './scene3d.js';
import { DEFAULTS } from './characters.js';
import { DiceUI } from './dice.js';
import { TableFX } from './fx.js';
import * as Snd from './sound.js';
import { cardHtml, computerArt, describeCard, esc, itemArtHtml, itemLabel, itemTitle, objectiveArt, woundName, eventArt, attackArt, queenArt, itemArt } from './cards.js';
import { ROOM_TILES } from '/shared/ship.mjs';
import { ITEMS, INTRUDER_NAMES, COMPUTER_CARDS, OBJECTIVES, DESTINATION_NAMES, CHARACTERS, ADAPTATIONS, objectiveTextOf,
    EVENT_CARDS, ATTACK_CARDS, QUEEN_CARDS, WOUNDS, DECK_NAMES } from '/shared/data/cards.mjs';

const $ = id => document.getElementById(id);
const PHASES = { setup: 'Подготовка', draft: 'Выбор персонажей', player: 'Фаза игроков', intruder: 'Фаза чужих', event: 'Фаза событий', cleanup: 'Завершение раунда' };

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
    canUndo: false, bagShown: null, bagTimer: null, deckKind: 'event', altHeld: false,
    wp: null, itemPick: null, itemPickMin: false,
};
const EVENT_BY_ID = Object.fromEntries(EVENT_CARDS.map(e => [e.id, e]));
const ATTACK_BY_ID = Object.fromEntries(ATTACK_CARDS.map(e => [e.id, e]));
const TOKEN_ICON = { blank: '○', larva: '🐛', adult: '👾', drone: '🦂', queen: '👑' };
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
            app.view = m.view; app.undoDepth = m.undoDepth; app.history = m.history; app.canUndo = !!m.canUndo;
            if (app.wp && (!app.view.prompt || app.view.prompt.id !== app.wp.prId)) closeWorldPop();
            renderGame();
            if (m.poses && scene) for (const [pid, pose] of Object.entries(m.poses)) scene.setPose(Number(pid), pose, true);
            break;
        case 'notice': notice(m.text, m.kind); break;
        case 'chat': addChat(m); break;
        case 'cursor': if (scene && app.view && m.pid !== app.me) { const p = app.view.players[m.pid]; if (p && CHARACTERS[p.charId]) scene.setCursor(m.pid, m.x, m.z, CHARACTERS[p.charId].color, p.name, m.off); } break;
        case 'pose': if (scene && m.pid !== app.me) scene.setPose(m.pid, m.pose, false); break;
        case 'ping': if (scene && app.view) { const p = app.view.players[m.pid]; if (p && CHARACTERS[p.charId]) { scene.ping(m.x, m.z, CHARACTERS[p.charId].color); Snd.play('ping'); if (m.pid !== app.me) notice('📍 ' + p.name + (m.room ? ' указывает на ' + roomLabel(m.room) : ' указывает на стол'), 'ping'); } } break;
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
    $('modeSelect').value = L.settings.mode; $('draftSelect').value = L.settings.draft === false ? '0' : '1'; if (document.activeElement !== $('seedInput')) $('seedInput').value = L.settings.seed || '';
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
const sendSettings = () => net.send({ t: 'lobby', settings: { mode: $('modeSelect').value, seed: $('seedInput').value, draft: $('draftSelect').value === '1' } });
$('modeSelect').onchange = sendSettings;
$('seedInput').onchange = sendSettings;
$('draftSelect').onchange = sendSettings;
$('restartBtn').onclick = () => { if (app.host) net.send({ t: 'restart' }); else $('endOverlay').classList.add('hidden'); };

// ---------------------------------------------------------------------------------------------
// Game rendering
// ---------------------------------------------------------------------------------------------
function renderGame() {
    const v = app.view;
    $('lobby').classList.add('hidden'); $('hud').classList.remove('hidden');
    if (!scene) {
        scene = new Scene3D($('scene'), {
            onHover: onRoomHover, onClick: onRoomClick, onIntruder: onIntruderClick, onObject: onObjectClick,
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
        renderTopbar(); renderPlayers(); renderLog(); renderHistory(); renderPrompt(); renderHand(); renderBagStrip(); renderHint(); refreshOverlays();
        if (freshRoll) setTimeout(() => { if (app.rollHold && !(app.view.prompt && app.view.prompt.kind === 'dice')) { app.rollHold = false; renderGame(); } }, 5000);   // safety net
        return;
    }
    if (app.rollHold && dice.rolling) return;   // die still tumbling: keep the frozen scene until it lands
    app.rollHold = false;
    // Rooms the player may click: the engine is asking "where to?", or it is my turn and these
    // are the neighbouring rooms I can walk into.
    const meNow = v.players.find(x => x.id === app.me);
    const selectable = pr && pr.kind === 'room' && !pr.waiting
        ? pr.rooms
        : (pr && pr.kind === 'turn' && pr.player === app.me && meNow && meNow.status === 'active'
            ? (v.ship.rooms[meNow.room].exits || []).map(e => e.to) : []);
    scene.update(v, ROOM_TILES, INTRUDER_NAMES, selectable);
    renderTopbar(); renderPlayers(); renderLog(); renderHistory(); renderPrompt(); renderHand();
    renderBagStrip(); renderHint(); refreshOverlays();
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
    const cc = v.computerCard ? COMPUTER_CARDS[v.computerCard] : null;
    const ccText = cc ? (cc.options ? Object.values(cc.options).map(t => '• ' + t).join('\n') : cc.text) : '';
    $('tbComputer').innerHTML = cc ? esc(cc.name) + '<span class="ipop"><span class="ipart" style="background-image:url(' + computerArt(v.computerCard) + ')"></span><b>' + esc(cc.name) + '</b><span class="pre">' + esc(ccText) + '</span></span>' : '—';
    $('tbComputer').classList.toggle('itag', !!cc);
    const ad = v.adaptations || [];
    $('tbAdapt').innerHTML = ad.length ? ad.map(k => '<span class="itag adapt">' + esc(ADAPTATIONS[k].name) + '<span class="ipop"><b>🧬 ' + esc(ADAPTATIONS[k].name) + '</b><span>' + esc(ADAPTATIONS[k].text) + '</span></span></span>').join('<span class="sep"> · </span>') : 'нет' + (v.adaptationsRemoved ? ' (удалено ' + v.adaptationsRemoved + ')' : '');
    const cur = v.players[v.current];
    const mineTurn = v.phase === 'player' && v.current === app.me;
    $('tbTurn').textContent = v.phase === 'player' && cur ? (mineTurn ? 'Ваш ход' : cur.name) : (PHASES[v.phase] || '—');
    const badge = $('turnBadge');
    badge.classList.toggle('me', mineTurn);
    if (v.phase === 'player' && v.current !== app.lastBadgeTurn) {
        app.lastBadgeTurn = v.current;
        if (mineTurn) { badge.classList.remove('flash'); void badge.offsetWidth; badge.classList.add('flash'); setTimeout(() => badge.classList.remove('flash'), 1700); }
    }
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
            + p.heavy.map(h => '<span>🧳 ' + ({ corpse: 'труп', charCorpse: 'труп персонажа', carcass: 'туша', egg: 'яйцо' })[h.type] + '</span>').join('')
            // p. 14: another character's light items are hidden; show only how many there are.
            + ((p.itemCount || 0) > p.items.length ? '<span class="tag" title="Лёгкие предметы другого персонажа скрыты">🔒 карт предметов: ' + p.itemCount + '</span>' : '');
        let obj = '';
        if (me && p.objectives) obj = '<div class="objs">' + p.objectives.map(o => '<div class="obj ' + o.kind + '" style="background-image:url(' + objectiveArt(o.kind) + ')"><b>🎯 ' + esc(OBJECTIVES[o.kind][o.id].name) + '</b><span>' + esc(objectiveTextOf(OBJECTIVES[o.kind][o.id], v.players)) + '</span></div>').join('') + '</div>';
        let known = '';
        if (me) {
            const ke = Object.entries(p.knownEngines || {}); if (ke.length) known += '<div class="items">⚙ ' + ke.map(([n, w]) => '№' + n + ': ' + (w ? 'исправен' : 'повреждён')).join(', ') + '</div>';
            if (p.knownCoords) known += '<div class="items">🧭 координаты известны (см. Рубку)</div>';
        }
        return '<div class="pcard ' + (v.current === p.id && v.phase === 'player' ? 'current' : '') + (me ? ' me' : '') + (p.status === 'dead' ? ' dead' : '') + '" data-pid="' + p.id + '"' + (me ? ' title="Нажмите, чтобы открыть планшет персонажа (C)"' : '') + ' style="border-left-color:' + (CHARACTERS[p.charId] ? CHARACTERS[p.charId].color : '#888') + '">' +
            '<div class="pname"><span>' + (p.number ? '<i class="pnum">' + p.number + '</i> ' : '') + esc(p.name) + (me ? ' (вы)' : '') + '</span><small>' + esc(p.charName) + ' ' + statusName(p) + '</small></div>' +
            hpBar(p) + '<div class="tags">' + tags.join('') + '</div><div class="items">' + items + '</div>' + obj + known +
            '<div class="items dim">📍 ' + esc(roomLabel(p.room)) + '</div></div>';
    }).join('');
}

function roomLabel(id) {
    const v = app.view; const r = v.ship.rooms[id]; const rs = v.roomState[id];
    const tile = rs.tile || (r.kind === 'cockpit' ? 'cockpit' : r.kind === 'hibernatorium' ? 'hibernatorium' : r.kind === 'engine' ? 'engine' : null);
    // An unexplored slot room is "???" for everyone until somebody flips its tile.
    return (tile ? ROOM_TILES[tile].name + (r.kind === 'engine' ? ' №' + r.engineNo : '') : '???') + ' [' + id + ']';
}

function renderLog() {
    const el = $('log');
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 30;
    el.innerHTML = app.logEntries.slice(-400).map(l => '<div class="l ' + l.kind + '">' + esc(l.text) + '</div>').join('');
    if (atBottom) el.scrollTop = el.scrollHeight;
}
function renderHistory() { $('history').innerHTML = (app.history || []).map(h => '<div>' + esc(h) + '</div>').join('') || '<div class="hint">Пока нет действий</div>'; }

// ---------------------------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------------------------
function renderPrompt() {
    const v = app.view; const pr = v.prompt; const el = $('prompt'); const tg = $('menuToggle');
    app.selectedCards.clear();
    if (!pr || pr.kind === 'dice') { el.classList.add('hidden'); tg.classList.add('hidden'); closeItemPicker(); return; }   // dice prompts are shown by DiceUI
    const who = pr.kind === 'ack' ? 'Вся команда' : pr.player === 'host' ? 'Ведущий' : (v.players[pr.player] || {}).name || '';
    // Collapsing: the turn menu remembers the player's choice; other prompts re-open when a new one arrives.
    // Collapsing: the action list opens by itself at the start of the player's turn and then keeps whatever the
    // player chose until the turn ends; other prompts always open when a new one arrives.
    if (pr.id !== app.lastPromptId) {
        app.lastPromptId = pr.id;
        if (pr.kind !== 'turn') app.promptCollapsed = false;
        else { const tk = v.round + ':' + pr.player; if (tk !== app.turnKey) { app.turnKey = tk; app.menuCollapsed = false; } app.promptCollapsed = app.menuCollapsed; }
        // QoL: a cue when the table needs ME (my turn, my die, my token, my Ready).
        const forMe = pr.player === app.me || (pr.kind === 'ack' && pr.mine);
        if (forMe && !pr.waiting) {
            if (pr.kind === 'turn') { notice('Ваш ход.', 'turn'); Snd.play('ping'); }
            else if (pr.kind === 'dice' || pr.kind === 'bag') Snd.play('click');
        }
    }
    const isAck = pr.kind === 'ack';
    const mine = !pr.waiting;
    tg.classList.toggle('hidden', !mine && !pr.waiting);
    tg.textContent = app.promptCollapsed ? '☰ ' + (pr.kind === 'turn' ? 'Действия' : 'Открыть окно') : '✕ Свернуть';
    tg.classList.toggle('attention', mine && app.promptCollapsed);
    el.classList.toggle('hidden', app.promptCollapsed);
    if (pr.waiting && !isAck) {
        el.classList.add('waiting');
        el.innerHTML = '<h4>' + esc(who) + ' <span class="waiting-dots">думает</span></h4><div class="ptext">' + esc(pr.title || '') + '</div>';
        return;
    }
    el.classList.remove('waiting');
    // Choosing an item (search, support crate, a reward…): show it as a big centred window with
    // pictures. It can be minimised and opened again from the floating button.
    if (pr.kind === 'choice' && !pr.waiting && pr.player === app.me && Array.isArray(pr.options)) {
        const itemOpts = pr.options.filter(o => o.item);
        if (itemOpts.length >= 2 && itemOpts.length >= pr.options.length - 1) {
            if (!app.itemPick || app.itemPick.pr !== pr.id) openItemPicker(pr, pr.options);
            el.classList.add('hidden'); tg.classList.add('hidden');
            return;
        }
    }
    if (app.itemPick) closeItemPicker();
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
            html += '<div class="opts">' + pr.options.map(o => {
                const art = o.item ? itemArt(o.item) : (o.art ? 'art/' + o.art + '.jpg' : null);
                return '<button class="opt' + (art ? ' opt-art' : '') + '" data-opt="' + esc(o.id) + '" ' + (o.disabled ? 'disabled' : '') + '>' +
                    (art ? '<i class="oart" style="background-image:url(' + esc(art) + ')"></i>' : '') +
                    '<span>' + esc(o.label) + (o.tag ? ' <small>· ' + esc(o.tag) + '</small>' : '') + '</span>' + (o.desc ? '<small>' + esc(o.desc) + '</small>' : '') + '</button>';
            }).join('') + '</div>';
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
        case 'ack': {
            // Event card: stays face up until every player has pressed Ready.
            const ev = pr.event ? EVENT_BY_ID[pr.event] : null;
            const art = ev ? eventArt(ev.id) : null;
            if (ev) html = '<h4>📜 ' + esc(ev.name) + '</h4>' +
                '<div class="ack-card">' + (art ? '<div class="aart" style="background-image:url(' + art + ')"></div>' : '') +
                '<div class="atext">' + esc(pr.text || ev.text) + '</div></div>';
            html += '<div class="ack-ready">' + (pr.players || []).map(id => {
                const p = v.players[id] || {}; const done = (pr.acked || []).includes(id);
                return '<span class="rd' + (done ? ' on' : '') + '">' + (done ? '✔ ' : '… ') + esc(p.name || ('#' + id)) + '</span>';
            }).join('') + '</div>';
            if (pr.mine) html += '<div class="prompt-buttons"><button class="btn primary" data-opt="ok">Готово</button></div>';
            else if (pr.waiting) html += '<div class="ptext dim">Вы готовы — ждём остальных…</div>';
            else if (!(pr.players || []).includes(app.me)) html += '<div class="ptext dim">Игроки читают карту события…</div>';
            if (app.host) html += '<div class="prompt-buttons"><button class="btn small" data-opt="all" title="Если кто-то отошёл">Готово за всех</button></div>';
            break;
        }
        case 'bag':
            if (pr.waiting) {   // someone else is pulling the token — the host can help out
                html += '<div class="ptext dim">' + esc(who) + ' тянет жетон из мешка…</div>';
                if (app.host) html += '<div class="prompt-buttons"><button class="btn small" data-opt="draw">Вытянуть за игрока</button></div>';
                break;
            }
            html += '<div class="bag-box"><div class="bag-icon">🎒</div><div>' +
                '<div class="bag-count">Жетонов в мешке: ' + (pr.count ?? v.bagCount) + '</div>' +
                '<div class="bag-reason">Зачем: ' + esc(pr.text || '') + '</div></div></div>' +
                '<div class="prompt-buttons"><button class="btn primary big" data-opt="draw">Вытянуть жетон</button></div>' +
                '<div class="ptext dim" style="font-size:11px">Можно нажать и на мешок в панели колод внизу справа.</div>';
            break;
    }
    el.innerHTML = html;
    // Number keys 1..9 press the visible prompt buttons in order.
    let idx = 0;
    for (const b of el.querySelectorAll('[data-act],[data-item],[data-opt],[data-room],#cardsOk')) if (!b.disabled) b.dataset.idx = String(++idx);
    for (const b of el.querySelectorAll('[data-act]')) b.onclick = () => act({ action: b.dataset.act });
    for (const b of el.querySelectorAll('[data-item]')) b.onclick = () => act({ action: 'item', itemId: b.dataset.item });
    for (const b of el.querySelectorAll('[data-opt]')) b.onclick = () => act(b.dataset.opt);
    for (const b of el.querySelectorAll('[data-room]')) b.onclick = () => act(b.dataset.room);
    const ok = $('cardsOk'); if (ok) ok.onclick = () => act([...app.selectedCards]);
}

/** The last bag token: what was pulled, why it was pulled and what it means. */
function renderBagStrip() {
    const el = $('bagStrip'); const v = app.view; const b = v && v.bagLast;
    if (!b) { el.classList.add('hidden'); return; }
    if (app.bagShown === b.n) return;
    app.bagShown = b.n;
    const who = b.by != null && v.players[b.by] ? v.players[b.by].name : '';
    el.innerHTML = '<span class="bt-ico">' + (TOKEN_ICON[b.token] || '🎒') + '</span>' +
        '<div><div class="bt-name">' + esc(INTRUDER_NAMES[b.token] || b.token) + (who ? ' · ' + esc(who) : '') + '</div>' +
        '<div class="bt-why">Зачем: ' + esc(b.reason || '—') + '</div>' +
        '<div class="bt-effect">' + esc(b.meaning || '') + (b.effect ? ' <b>Итог:</b> ' + esc(b.effect) : '') + '</div></div>' +
        '<button class="bt-close" title="Скрыть">✕</button>';
    el.classList.remove('hidden');
    el.querySelector('.bt-close').onclick = () => el.classList.add('hidden');
    clearTimeout(app.bagTimer);
    app.bagTimer = setTimeout(() => el.classList.add('hidden'), 18000);
}

/** Contextual key hints at the bottom of the screen. */
function renderHint() {
    const v = app.view; if (!v) return;
    const pr = v.prompt; const hints = [];
    if (pr && !pr.waiting && pr.kind !== 'dice' && pr.kind !== 'ack') hints.push('<b>1–9</b> выбор');
    if (app.canUndo) hints.push('<b>Esc</b> шаг назад');
    hints.push('<b>ЛКМ</b> по комнате — идти, по чужому — атака', '<b>Alt</b> коридоры и поиск', '<b>C</b> персонаж', '<b>F</b> к себе', '<b>Q/E</b> поворот', '<b>WASD</b> камера');
    $('hintBar').innerHTML = hints.map(h => '<span>' + h + '</span>').join('<span>·</span>');
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
        if (menu && menu[id] && menu[id].enabled) { if (tableFx) tableFx.cardOrigin = { id, rect: cel.getBoundingClientRect() }; act({ action: 'card', cardId: id }); }
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
    else html += '<div class="dim">??? — не разведана</div>';
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
// ---------------------------------------------------------------------------------------------
// Click-to-act on the board: a room asks "walk or sneak?", an intruder asks "with what?", a heavy
// object asks "which hand?". The questions are plain client-side popups anchored above the mesh,
// so clicking anywhere else (or moving the camera) cancels them before anything is sent.
// ---------------------------------------------------------------------------------------------
function turnMenuPrompt() {
    const pr = app.view && app.view.prompt;
    return pr && pr.kind === 'turn' && pr.player === app.me && !pr.waiting ? pr : null;
}
function menuActionOf(pr, id) { return ((pr && pr.actions) || []).find(a => a.id === id) || null; }
function myChar() { const v = app.view; return v ? v.players.find(p => p.id === app.me) : null; }
function myFirable() {
    const me = myChar(); if (!me) return [];
    const belt = me.armor && ITEMS[me.armor.item] && ITEMS[me.armor.item].ammoMax ? (me.armor.ammo || 0) : 0;
    return (me.items || []).filter(i => { const d = ITEMS[i.item]; return d && d.weapon && !i.broken && (d.weapon.noAmmo || i.ammo > 0 || belt > 0); });
}
const HEAVY_NAMES_UI = { corpse: 'Человеческий труп', charCorpse: 'Труп персонажа', carcass: 'Туша чужого', egg: 'Яйцо чужого' };

function openWorldPop(title, sub, buttons, anchor) {
    const el = $('worldPop');
    const pr = app.view && app.view.prompt;
    app.wp = { prId: pr ? pr.id : null };
    el.innerHTML = '<button class="wp-close" title="Отмена (Esc)">✕</button><h5>' + esc(title) + '</h5>' +
        (sub ? '<div class="wp-sub">' + esc(sub) + '</div>' : '') +
        '<div class="wp-btns">' + buttons.map((b, i) => '<button class="wp-btn" data-wp="' + i + '"' + (b.disabled ? ' disabled' : '') + '>' +
            (b.art ? '<span class="art" style="background-image:url(' + b.art + ')"></span>' : '') +
            '<span>' + esc(b.label) + (b.sub ? '<small>' + esc(b.sub) + '</small>' : '') + (b.disabled && b.reason ? '<small style="color:#e0917a">' + esc(b.reason) + '</small>' : '') + '</span></button>').join('') + '</div>';
    el.classList.remove('down', 'hidden');
    const w = el.offsetWidth, h = el.offsetHeight;
    let x = anchor ? anchor.x - w / 2 : window.innerWidth / 2;
    let y = anchor ? anchor.y - h - 18 : 90;
    if (y < 54) { y = anchor ? anchor.y + 18 : 54; el.classList.add('down'); }
    x = Math.max(8, Math.min(window.innerWidth - w - 8, x));
    y = Math.max(54, Math.min(window.innerHeight - h - 8, y));
    el.style.left = x + 'px'; el.style.top = y + 'px';
    for (const btn of el.querySelectorAll('.wp-btn')) btn.onclick = () => { const b = buttons[Number(btn.dataset.wp)]; closeWorldPop(); if (b && !b.disabled && b.do) b.do(); };
    el.querySelector('.wp-close').onclick = () => closeWorldPop();
    Snd.play('click');
}
function closeWorldPop() {
    const el = $('worldPop');
    if (!el || el.classList.contains('hidden')) { app.wp = null; return false; }
    el.classList.add('hidden');
    app.wp = null;
    return true;
}

function onRoomClick(id) {
    const v = app.view; if (!v) return;
    const pr = v.prompt;
    // The engine itself is asking "where to?" — answer it.
    if (pr && pr.kind === 'room' && !pr.waiting && pr.player === app.me && (pr.rooms || []).includes(id)) { act(id); return; }
    const me = myChar();
    const menu = turnMenuPrompt();
    if (!menu || !me || id === me.room) { scene.focusRoom(id); return; }
    const exit = (v.ship.rooms[me.room].exits || []).find(e => e.to === id && v.ship.corridors[e.corridor].door !== 'closed');
    if (!exit) { scene.focusRoom(id); return; }   // not a neighbour: just look at it
    const mv = menuActionOf(menu, 'move'), cw = menuActionOf(menu, 'careful');
    openWorldPop('Идём в ' + roomLabel(id), 'Выберите, как идти', [
        { label: 'Идти', sub: mv ? (mv.cost ? mv.cost + ' карт(ы) · шум по броску' : '') : '', disabled: !mv || !mv.enabled, reason: mv && mv.reason, do: () => act({ action: 'move', dest: id }) },
        { label: 'Красться (осторожно)', sub: cw ? (cw.cost ? cw.cost + ' карт(ы) · выбрать коридор без шума' : '') : '', disabled: !cw || !cw.enabled, reason: cw && cw.reason, do: () => act({ action: 'careful', dest: id }) },
    ], scene.screenOf('room', id));
}

function onIntruderClick(uid, roomId, x, y) {
    const v = app.view; if (!v) return;
    const it = v.intruders[uid];
    const menu = turnMenuPrompt();
    const me = myChar();
    if (!it) return;
    if (!menu || !me) { scene.focusRoom(it.room || roomId); return; }
    const inRoom = it.room === me.room;
    const adjacent = (v.ship.rooms[me.room].exits || []).some(e => e.to === it.room);
    const shoot = menuActionOf(menu, 'shoot'), melee = menuActionOf(menu, 'melee');
    const weapons = myFirable().filter(w => inRoom || (adjacent && ITEMS[w.item].weapon.sniper));
    const buttons = [];
    for (const w of weapons) {
        const d = ITEMS[w.item];
        buttons.push({ label: d.name, sub: 'выстрел · ' + (d.weapon.noAmmo ? 'без патронов' : 'патронов ' + w.ammo) + (d.weapon.sniper && !inRoom ? ' · снайперский' : ''),
            art: itemArt(w.item), disabled: !shoot || !shoot.enabled, reason: shoot && shoot.reason,
            do: () => act({ action: 'shoot', weapon: w.uid, target: uid }) });
    }
    if (inRoom) buttons.push({ label: 'Ближний бой', sub: '1 карта · заражение и ответная атака', disabled: !melee || !melee.enabled, reason: melee && melee.reason, do: () => act({ action: 'melee', target: uid }) });
    if (!buttons.length) buttons.push({ label: 'Отсюда не достать', sub: 'Нужно быть в комнате с чужим (или иметь снайперскую винтовку)', disabled: true });
    openWorldPop(INTRUDER_NAMES[it.type] + (it.hits ? ' ✚' + it.hits : ''), 'Комната: ' + roomLabel(it.room) + (inRoom ? '' : ' — не ваша комната'), buttons, scene.screenOf('intr', uid) || { x: x, y: y });
}

function onObjectClick(roomId, index, x, y) {
    const v = app.view; if (!v) return;
    const me = myChar(); const menu = turnMenuPrompt();
    const rs = v.roomState[roomId]; if (!rs) return;
    const o = (rs.objects || [])[index]; if (!o) return;
    if (!menu || !me || me.room !== roomId) { scene.focusRoom(roomId); return; }
    const pickup = menuActionOf(menu, 'pickup');
    const slots = (me.handSlots && me.handSlots.length ? me.handSlots : [{ kind: 'empty' }, { kind: 'empty' }]);
    const buttons = slots.map((s, k) => {
        const name = slots.length > 1 ? 'Слот ' + (k + 1) : 'Рука';
        // The second slot of a two-handed weapon has no reference of its own: dropping the weapon
        // itself is what frees the place for the object.
        const real = s.kind === 'filler' ? (slots.find(x => x.kind === 'item' && x.two) || {}).ref || null : s.ref;
        if (s.kind === 'empty') return { label: name + ': пусто', sub: 'Положить «' + (HEAVY_NAMES_UI[o.type] || 'объект') + '»', disabled: !pickup || !pickup.enabled, reason: pickup && pickup.reason, do: () => act({ action: 'pickup', object: index, free: null }) };
        return { label: name + ': ' + s.name, sub: 'Выбросить «' + s.name + '» и взять объект',
            art: real ? itemArt(String(real).slice(5)) : null,
            disabled: !pickup || !pickup.enabled, reason: pickup && pickup.reason, do: () => act({ action: 'pickup', object: index, free: real }) };
    });
    openWorldPop('Взять: ' + (HEAVY_NAMES_UI[o.type] || 'объект'), 'Куда положить? Выброс из слота бесплатный.', buttons, scene.screenOf('room', roomId) || { x: x, y: y });
}

// ---------------------------------------------------------------------------------------------
// Centred item chooser
// ---------------------------------------------------------------------------------------------
function openItemPicker(pr, options) {
    app.itemPickMin = false;
    app.itemPick = { pr: pr.id, count: options.filter(o => o.item).length };
    $('ipTitle').textContent = pr.title || 'Выбор предмета';
    $('ipBody').innerHTML = options.map(o => {
        const art = o.item ? itemArt(o.item) : null;
        return '<button class="ip-card' + (o.item ? '' : ' plain') + '" data-opt="' + esc(o.id) + '">' +
            (o.item ? (art ? '<div class="ip-art" style="background-image:url(' + art + ')"></div>' : '<div class="ip-noart">📦</div>') : '') +
            '<b>' + esc(o.label) + '</b>' + (o.desc ? '<small>' + esc(o.desc) + '</small>' : '') +
            (o.tag ? '<span class="tag">' + esc(o.tag) + '</span>' : '') + '</button>';
    }).join('');
    for (const b of $('ipBody').querySelectorAll('[data-opt]')) b.onclick = () => { const ans = b.dataset.opt; closeItemPicker(); act(ans); };
    if (!app.itemPickMin) { $('itemPick').classList.remove('hidden'); $('ipRestore').classList.add('hidden'); }
}
function closeItemPicker() {
    $('itemPick').classList.add('hidden');
    $('ipRestore').classList.add('hidden');
    app.itemPick = null; app.itemPickMin = false;
}
function minimizeItemPicker() {
    if (!app.itemPick) return;
    app.itemPickMin = true;
    $('itemPick').classList.add('hidden');
    $('ipRestore').textContent = '🃏 Выбор предмета (' + app.itemPick.count + ')';
    $('ipRestore').classList.remove('hidden');
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
/** Close the topmost modal overlay; returns true when something was closed. */
function closeOverlay() {
    for (const id of ['sheetOverlay', 'deckOverlay', 'helpOverlay']) {
        const el = $(id); if (el && !el.classList.contains('hidden')) { el.classList.add('hidden'); return true; }
    }
    return false;
}

document.addEventListener('keydown', e => {
    const typing = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');
    if (e.key === 'Escape') {
        if (closeWorldPop()) return;
        if (closeOverlay()) return;
        if (typing) { e.target.blur(); return; }
        // Esc = take back my own last step (the server allows it only inside my own turn).
        if (app.view && app.view.prompt && app.canUndo) { net.send({ t: 'undo', steps: 1, self: true }); Snd.play('click'); }
        else if (app.view) notice('Шаг назад недоступен: откатить можно только свой последний выбор в свой ход.', 'error');
        return;
    }
    if (typing || !app.view) return;
    // Hold Alt: corridor numbers and the Search item colours over the rooms.
    if (e.key === 'Alt' && !app.altHeld) { e.preventDefault(); app.altHeld = true; if (scene) scene.setAlt(true); }
    // WASD pans the board; any camera move cancels a pending board question (like Esc).
    const wasd = { w: [0, 1], s: [0, -1], a: [-1, 0], d: [1, 0], ц: [0, 1], ы: [0, -1], ф: [-1, 0], в: [1, 0] }[e.key.toLowerCase()];
    if (wasd && scene) { closeWorldPop(); e.preventDefault(); scene.panCam(wasd[0], wasd[1]); }
    if (e.key === 'Tab') { e.preventDefault(); if (lastFloor && !e.repeat && scene) net.send({ t: 'ping', x: lastFloor.x, z: lastFloor.z, room: lastFloor.room }); }
    else if (e.key === 'q' || e.key === 'Q' || e.key === 'й' || e.key === 'Й') { closeWorldPop(); if (scene) scene.rotateMe(-Math.PI / 12); }
    else if (e.key === 'e' || e.key === 'E' || e.key === 'у' || e.key === 'У') { closeWorldPop(); if (scene) scene.rotateMe(Math.PI / 12); }
    else if (e.key === 'c' || e.key === 'C' || e.key === 'с' || e.key === 'С') openSheet();
    else if (e.key === 'f' || e.key === 'F' || e.key === 'а' || e.key === 'А') focusMe();
    else if (e.key === 'Enter') { const ok = $('cardsOk'); if (ok && !ok.disabled) { e.preventDefault(); ok.click(); } }
    else if (/^[1-9]$/.test(e.key)) { const b = document.querySelector('#prompt [data-idx="' + e.key + '"]'); if (b && !b.disabled) { e.preventDefault(); b.click(); } }
});
document.addEventListener('keyup', e => {
    if (e.key === 'Alt') { app.altHeld = false; if (scene) scene.setAlt(false); }
});
window.addEventListener('blur', () => {
    app.altHeld = false; if (scene) scene.setAlt(false);
    if (app.view) net.send({ t: 'cursor', off: true });
});

function focusMe() {
    const v = app.view; if (!v || !scene) return;
    const me = v.players.find(p => p.id === app.me);
    if (me) scene.focusRoom(me.room);
}
$('players').addEventListener('click', e => { if (e.target.closest('.pcard.me')) openSheet(); });
$('sheetBtn').onclick = () => openSheet();
$('decksBtn').onclick = () => openDeck(app.deckKind || 'event');
$('focusBtn').onclick = () => focusMe();
$('sheetClose').onclick = () => $('sheetOverlay').classList.add('hidden');
$('deckClose').onclick = () => $('deckOverlay').classList.add('hidden');
$('sheetOverlay').onclick = e => { if (e.target === $('sheetOverlay')) $('sheetOverlay').classList.add('hidden'); };
$('ipMin').onclick = () => minimizeItemPicker();
$('ipRestore').onclick = () => { if (!app.itemPick) return; app.itemPickMin = false; $('ipRestore').classList.add('hidden'); $('itemPick').classList.remove('hidden'); };
// A click anywhere outside the question (or a wheel on the board) cancels it before anything is
// sent to the engine — the same feel as Esc and as moving the camera.
document.addEventListener('pointerdown', e => {
    if (!app.wp || !e.target || !e.target.closest) return;
    if (e.target.closest('#worldPop')) return;
    closeWorldPop();
}, true);
$('scene').addEventListener('wheel', () => closeWorldPop(), { passive: true });
$('deckOverlay').onclick = e => { if (e.target === $('deckOverlay')) $('deckOverlay').classList.add('hidden'); };

// A click on any pile at the bottom right opens its viewer (the bag pile draws a token when asked).
$('table').addEventListener('click', e => {
    const pile = e.target.closest('.pile'); if (!pile) return;
    const kind = pile.dataset.pile;
    const pr = app.view && app.view.prompt;
    if (kind === 'bag' && pr && pr.kind === 'bag' && !pr.waiting) { act('draw'); return; }
    openDeck(kind);
});

// ---------------------------------------------------------------------------------------------
// Character sheet (my backpack, weapons, quest item, wounds, suit, objectives, cards)
// ---------------------------------------------------------------------------------------------
function healthCells(p) {
    const sections = [[10, 9, 8], [7, 6, 5], [4, 3, 2], [1]];
    let out = '';
    sections.forEach((sec, si) => {
        for (const n of sec) out += '<i class="' + (si === 1 ? 'mid' : si === 2 ? 'heavy' : si === 3 ? 'last' : '') + (p.health >= n ? ' on' : '') + '" title="' + n + '"></i>';
    });
    return '<div class="sheet-hp">' + out + '</div>';
}
function sheetItemHtml(inst) {
    const d = ITEMS[inst.item]; if (!d) return '';
    const art = itemArt(inst.item);
    const meta = [];
    meta.push(d.kind === 'heavy' ? 'тяжёлый предмет' : d.kind === 'armor' ? 'броня (костюм)' : 'лёгкий предмет');
    if (d.weapon) meta.push('патроны ' + (inst.ammo ?? 0) + '/' + d.weapon.max);
    if (d.markers !== undefined) meta.push('жетоны ' + (inst.charge ?? d.markers) + '/' + d.markers);
    if (inst.broken) meta.push('сломано');
    if (d.oneUse) meta.push('одноразовый');
    return '<div class="sheet-item' + (d.quest ? ' quest' : '') + (d.kind === 'armor' ? ' armor' : '') + '">' +
        (art ? '<div class="si-art" style="background-image:url(' + art + ')"></div>' : '') +
        '<div><b>' + esc(d.name) + (d.quest ? ' · квестовый' : '') + '</b><small>' + esc(d.text || '') + '</small>' +
        '<small style="color:#8394a8">' + esc(meta.join(' · ')) + '</small></div></div>';
}
function openSheet(quiet) {
    const v = app.view; if (!v) return;
    const me = v.players.find(p => p.id === app.me);
    if (!me) { notice('Вы наблюдатель — своего персонажа нет.', 'error'); return; }
    const ch = CHARACTERS[me.charId] || {};
    const items = me.items || [];
    const quests = items.filter(i => ITEMS[i.item] && ITEMS[i.item].quest);
    const armor = me.armor ? sheetItemHtml(me.armor) : '';
    const weapons = items.filter(i => ITEMS[i.item] && ITEMS[i.item].weapon);
    const gear = items.filter(i => !(ITEMS[i.item] && (ITEMS[i.item].quest || ITEMS[i.item].weapon)));
    const wounds = (me.wounds || []).map(w => '<div class="sheet-wound"><b>' + esc(WOUNDS[w] ? WOUNDS[w].name : w) + '</b><small>' + esc(WOUNDS[w] ? WOUNDS[w].text : '') + '</small></div>').join('');
    const objs = (me.objectives || []).map(o => '<div class="sheet-goal" style="background-image:url(' + objectiveArt(o.kind) + ')"><b>🎯 ' + esc(OBJECTIVES[o.kind][o.id].name) + ' · ' + (o.kind === 'corporate' ? 'корпоративная' : 'личная') + '</b><span>' + esc(objectiveTextOf(OBJECTIVES[o.kind][o.id], v.players)) + '</span></div>').join('');
    const hand = (me.hand || []).map(c => cardHtml(c, null, false)).join('') || '<div class="deck-empty">Пусто</div>';
    const chips = [];
    chips.push('<span class="tag yellow">знания ' + me.knowledge + (me.knowledgeActive ? ' ✓' : '') + ' / 8</span>');
    if (me.signal) chips.push('<span class="tag green">сигнал отправлен</span>');
    if (me.larva) chips.push('<span class="tag purple">личинка</span>');
    if (me.laika) chips.push('<span class="tag yellow">🐕 Лайка: ' + (me.laika === 'board' ? 'рядом' : esc(roomLabel(me.laika))) + '</span>');
    if (me.canFire === false) chips.push('<span class="tag red">нельзя стрелять</span>');
    chips.push('<span class="tag">карт в колоде: ' + me.deckCount + '</span>');
    chips.push('<span class="tag">карт в сбросе: ' + me.discardCount + '</span>');
    if (me.contamInDiscard) chips.push('<span class="tag red">☣ заражений в сбросе: ' + me.contamInDiscard + '</span>');
    if (me.handCount != null) chips.push('<span class="tag">карт в руке: ' + me.handCount + '</span>');
    const heavy = (me.heavy || []).map(h => '<div class="sheet-item"><div><b>' + ({ corpse: 'Человеческий труп', charCorpse: 'Труп персонажа', carcass: 'Туша чужого', egg: 'Яйцо чужого' })[h.type] + '</b><small>Тяжёлый объект · занимает слот рук</small></div></div>').join('');
    $('sheetBody').innerHTML =
        '<div class="sheet-head"><div><h2>' + esc(me.name) + '</h2><div class="sub">' + esc(me.charName) +
        (me.number ? ' · игрок №' + me.number : '') + ' · ' + esc(statusName(me) || 'на борту') + ' · 📍 ' + esc(roomLabel(me.room)) + '</div></div>' +
        healthCells(me) + '<div class="sheet-chips">' + chips.join('') + '</div></div>' +
        '<div class="sheet-decks"><button class="btn small" data-sheet-deck="own" title="Колода закрыта: видно только количество">🂠 Колода действий · ' + me.deckCount + '</button>' +
        '<button class="btn small" data-sheet-deck="owndisc" title="Открыть мой сброс">⤵ Сброс · ' + me.discardCount + '</button>' +
        (me.contamInDiscard ? '<button class="btn small danger" data-sheet-deck="owndisc">☣ заражений в сбросе: ' + me.contamInDiscard + '</button>' : '') + '</div>' +
        '<div class="sheet-cols">' +
        '<div class="sheet-sec"><h4>🎯 Цели · что даёт выполнение</h4>' + (objs || '<div class="empty">Цель ещё не выбрана — выберите бесплатным действием.</div>') + '</div>' +
        '<div class="sheet-sec"><h4>🏆 Квестовый предмет</h4><div class="sheet-items">' + (quests.map(sheetItemHtml).join('') || '<div class="empty">Нет квестового предмета.</div>') + '</div>' +
        (quests.length ? '<div class="empty" style="margin-top:6px">Награда за выполнение — свойство этого предмета; оплата и условия показаны в меню действий.</div>' : '') + '</div>' +
        '<div class="sheet-sec"><h4>🎒 Рюкзак · оружие</h4><div class="sheet-items">' + (weapons.map(sheetItemHtml).join('') || '<div class="empty">Оружия нет.</div>') + '</div></div>' +
        '<div class="sheet-sec"><h4>📦 Предметы и костюм</h4><div class="sheet-items">' + (armor + gear.map(sheetItemHtml).join('') + heavy || '<div class="empty">Пусто.</div>') + '</div></div>' +
        '<div class="sheet-sec"><h4>🩸 Травмы</h4>' + (wounds || '<div class="empty">Травм нет.</div>') + '</div>' +
        '<div class="sheet-sec" style="grid-column:1/-1"><h4>🂠 Карты в руке · ' + (me.hand || []).length + '</h4><div class="sheet-hand">' + hand + '</div></div>' +
        '</div>';
    for (const b of $('sheetBody').querySelectorAll('[data-sheet-deck]')) b.onclick = () => openDeck(b.dataset.sheetDeck);
    $('sheetOverlay').classList.remove('hidden');
    if (!quiet) Snd.play('click');
}

/** Keep an open panel in sync with a new state: it is a live view, not a snapshot. */
function refreshOverlays() {
    if (!app.view) return;
    if (!$('sheetOverlay').classList.contains('hidden')) openSheet(true);
    if (!$('deckOverlay').classList.contains('hidden')) openDeck(app.deckKind, true);
}

// ---------------------------------------------------------------------------------------------
// Deck viewer: every face-up pile on the table plus my own discard
// ---------------------------------------------------------------------------------------------
const DECK_TITLES = { event: 'События · сброс', attack: 'Атаки чужих · сброс', queen: 'Здоровье Королевы · открытые', wound: 'Тяжёлые травмы · сброс',
    green: 'Зелёные предметы · сброс', red: 'Красные предметы · сброс', yellow: 'Жёлтые предметы · сброс', support: 'Поддержка · сброс',
    computer: 'Компьютер · сброс', own: 'Моя колода', owndisc: 'Мой сброс карт действий' };
function deckList(kind, v, me) {
    const piles = v.piles || {};
    const list = [];
    if (kind === 'own') {
        return { note: 'Колода закрыта: видно только количество карт (' + (me ? me.deckCount : 0) + '). Порядок карт не раскрывается.', cards: [] };
    }
    if (kind === 'owndisc') {
        if (!me) return { note: 'Вы наблюдатель.', cards: [] };
        for (const c of (me.discard || [])) { const d = describeCard(c); list.push({ name: d.name, text: d.text, tag: d.contam ? 'заражение' : '' }); }
        return { note: 'Карты в вашем сбросе (' + list.length + ').', cards: list };
    }
    if (kind === 'event') for (const id of (piles.event || [])) { const e = EVENT_BY_ID[id]; if (e) list.push({ name: e.name, text: e.text, tag: 'событие' }); }
    if (kind === 'attack') for (const id of (piles.attack || [])) { const a = ATTACK_BY_ID[id]; if (a) list.push({ name: a.name, text: a.text, tag: 'атака' }); }
    if (kind === 'queen') for (const idx of (piles.queen || [])) { const q = QUEEN_CARDS[idx]; if (q) list.push({ name: 'Карта здоровья', text: q.text + ' (сбросить ещё: ' + q.extra + ')', tag: 'королева' }); }
    if (kind === 'wound') for (const w of (piles.wound || [])) list.push({ name: WOUNDS[w] ? WOUNDS[w].name : w, text: WOUNDS[w] ? WOUNDS[w].text : '', tag: 'травма' });
    if (kind === 'computer') for (const id of (piles.computer || [])) { const c = COMPUTER_CARDS[id]; if (c) list.push({ name: c.name, text: c.text || Object.values(c.options || {}).join(' / '), tag: 'компьютер' }); }
    if (['green', 'red', 'yellow', 'support'].includes(kind)) for (const key of ((piles.items || {})[kind] || [])) { const it = ITEMS[key]; if (it) list.push({ name: it.name, text: it.text, tag: DECK_NAMES[kind] }); }
    return { note: '', cards: list };
}
function openDeck(kind, quiet) {
    const v = app.view; if (!v) return;
    app.deckKind = kind || 'event';
    const me = v.players.find(p => p.id === app.me);
    const tabs = ['event', 'attack', 'queen', 'wound', 'green', 'red', 'yellow', 'support', 'computer', 'own', 'owndisc'];
    const counts = { event: (v.piles && v.piles.event || []).length, attack: (v.piles && v.piles.attack || []).length, queen: (v.piles && v.piles.queen || []).length,
        wound: (v.piles && v.piles.wound || []).length, computer: (v.piles && v.piles.computer || []).length,
        green: ((v.piles && v.piles.items && v.piles.items.green) || []).length, red: ((v.piles && v.piles.items && v.piles.items.red) || []).length,
        yellow: ((v.piles && v.piles.items && v.piles.items.yellow) || []).length, support: ((v.piles && v.piles.items && v.piles.items.support) || []).length,
        own: me ? me.deckCount : 0, owndisc: me ? me.discardCount : 0 };
    const { note, cards } = deckList(app.deckKind, v, me);
    const box = $('deckOverlay').querySelector('.help-box'); const keep = quiet && box ? box.scrollTop : 0;
    $('deckTitle').textContent = DECK_TITLES[app.deckKind] || 'Колоды';
    $('deckBody').innerHTML = '<div class="deck-tabs">' + tabs.map(k => '<button class="btn small' + (k === app.deckKind ? ' active' : '') + '" data-deck="' + k + '">' + esc(DECK_TITLES[k].split(' · ')[0]) + ' (' + (counts[k] || 0) + ')</button>').join('') + '</div>' +
        (note ? '<div class="hint" style="margin-bottom:8px">' + esc(note) + '</div>' : '') +
        (cards.length ? '<div class="deck-grid">' + cards.map(c => '<div class="deck-card">' + (c.tag ? '<span class="tag">' + esc(c.tag) + '</span>' : '') + '<b>' + esc(c.name) + '</b><small>' + esc(c.text || '') + '</small></div>').join('') + '</div>'
            : '<div class="deck-empty">Здесь пусто.</div>');
    for (const b of $('deckBody').querySelectorAll('[data-deck]')) b.onclick = () => openDeck(b.dataset.deck);
    $('deckOverlay').classList.remove('hidden');
    if (keep && box) box.scrollTop = keep;
    if (!quiet) Snd.play('click');
}

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
<h4>Горячие клавиши</h4><p><b>Esc</b> — закрыть окно или вернуть свой последний шаг (пока вы выбираете действие). <b>Alt</b> (удерживать) — номера коридоров и цвета поиска над комнатами. <b>C</b> — планшет персонажа, <b>F</b> — к своей комнате, <b>Tab</b> — пинг на карте, <b>Q</b>/<b>E</b> — повернуть камеру, <b>Enter</b> — подтвердить выбранные карты, <b>1…9</b> — нажать кнопку в окне выбора.</p>
<h4>Мешок и события</h4><p>Жетон из мешка тянет сам игрок — нажмите на мешок или на большую кнопку; внизу появится, <i>зачем</i> тянули и что вытянули. Карта события остаётся на столе, пока каждый не нажмёт «Готово».</p>
<h4>Колоды и сбросы</h4><p>Любая стопка внизу справа (и кнопка «🃏 Колоды») открывает просмотр: события, атаки чужих, карты здоровья Королевы, тяжёлые травмы, сбросы предметов, компьютер и ваш собственный сброс.</p>
<h4>Откат</h4><p>Ведущий (👑) может откатить любое количество действий кнопкой «⟲ Откатить ход» — все получают уведомление.</p>`;

net.connect();
