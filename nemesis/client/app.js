// app.js — Nemesis client: lobby, HUD, prompts, hand, log, chat, undo. Talks to server.mjs over
// WebSocket and renders the 3D board through scene3d.js.

import { Scene3D, Preview3D, setPreviewCameraPose } from './scene3d.js';
import { TUNE } from './tuning.js';
import { galleryPods } from './gallery.js';
import { characterColors } from './characters.js';
import { characterPartSlots, characterParts } from '../shared/appearance.mjs';
import { DiceUI } from './dice.js';
import { TableFX } from './fx.js';
import * as Snd from './sound.js';
import { cardArt, cardHtml, computerArt, describeCard, esc, itemArtHtml, itemLabel, itemTitle, objectiveArt, woundName, woundShort, eventArt, attackArt, queenArt, itemArt } from './cards.js';
import { ROOM_TILES, BASIC_TILES, ADDITIONAL_TILES, galleryShip, tileKeyedEdits } from '/shared/ship.mjs';
import { ITEMS, INTRUDER_NAMES, COMPUTER_CARDS, OBJECTIVES, DESTINATION_NAMES, CHARACTERS, ADAPTATIONS, FEATS, objectiveTextOf,
    EVENT_CARDS, ATTACK_CARDS, QUEEN_CARDS, WOUNDS, DECK_NAMES } from '/shared/data/cards.mjs';

const $ = id => document.getElementById(id);
const PHASES = { setup: 'Подготовка', draft: 'Выбор персонажей', player: 'Фаза игроков', intruder: 'Фаза чужих', event: 'Фаза событий', cleanup: 'Завершение раунда' };
const WORKSHOP_LABELS = {
    soldier: { title: 'Солдат', button: 'Мастерская Солдата', hint: 'Шлем, броня, оружие и ранец', caption: 'Модель · силовая броня' },
    scout: { title: 'Разведчица', button: 'Мастерская Разведчицы', hint: 'Волосы, броня, наруч и винтовка', caption: 'Модель · разведка' },
    mechanic: { title: 'Механик', button: 'Мастерская Механика', hint: 'Маска, инструменты и ранец', caption: 'Модель · техническая служба' },
    pilot: { title: 'Пилот', button: 'Мастерская Пилота', hint: 'Причёска, монокль, куртка и снаряжение', caption: 'Модель · пилотирование' },
    hacker: { title: 'Хакер', button: 'Мастерская Хакера', hint: 'Капюшон, маска и киберруки', caption: 'Модель · цифровая разведка' },
    scientist: { title: 'Учёный', button: 'Мастерская Учёного', hint: 'Очки, кресло и планшет', caption: 'Модель · исследования' },
    medic: { title: 'Медик', button: 'Мастерская Медика', hint: 'Причёска, маска и аптечка', caption: 'Модель · медицина' },
    janitor: { title: 'Уборщик', button: 'Мастерская Уборщика', hint: 'Борода, кепка и пылесос', caption: 'Модель · обслуживание' },
    ceo: { title: 'Директор', button: 'Мастерская Директора', hint: 'Причёска, пальто и робот', caption: 'Модель · руководство' },
    android: { title: 'Андроид', button: 'Мастерская Андроида', hint: 'Причёска, импланты и жилет', caption: 'Модель · синтетический экипаж' },
    convict: { title: 'Заключённый', button: 'Мастерская Заключённого', hint: 'Намордник, пластины и оковы', caption: 'Модель · заключение' },
    psych: { title: 'Психолог', button: 'Мастерская Психолога', hint: 'Причёска, гарнитура и дроны', caption: 'Модель · поддержка экипажа' },
    bounty: { title: 'Охотник за головами', button: 'Мастерская Охотника', hint: 'Причёска, броня и снаряжение собаки', caption: 'Модель · охотник и спутник' },
    captain: { title: 'Капитан', button: 'Мастерская Капитана', hint: 'Причёска и броня', caption: 'Модель · командование' },
    survivor: { title: 'Выжившая', button: 'Мастерская Выжившей', hint: 'Причёска, бандана, рация и снаряжение', caption: 'Модель · выживание' },
    xeno: { title: 'Ксенобиолог', button: 'Мастерская Ксенобиолога', hint: 'Кудри, манипулятор и исследовательское снаряжение', caption: 'Модель · ксенобиология' },
    labrat: { title: 'Подопытная', button: 'Мастерская Подопытной', hint: 'Причёска, одежда и другие детали', caption: 'Модель · эксперимент' },
    sentry: { title: 'Охранник', button: 'Мастерская Охранника', hint: 'Оптика, броня и другие детали', caption: 'Модель · служба охраны' },
};

// What a designer changed in the editor's Nemesis tab (editor.bat): the door numbers and the parts
// of the board (moved, turned, recoloured, hidden, deleted). Both files are optional and local.
let BOARD_EDITS = {};
try {
    const r = await fetch('/client/tuning.json', { cache: 'no-store' });
    if (r.ok) TUNE.load((await r.json()).values || {});
} catch { /* no saved tuning next to the client: run on the defaults */ }
// The file is written by the editor next to the client, and a Windows checkout keeps the client in
// "Nemesis/" while a Linux one uses "nemesis/" — the same folder on one machine, two paths in git.
// Either place is tried, so the saved edits load on both.
let rawBoardEdits = {};
for (const url of ['/client/board-edits.json', '/Nemesis/client/board-edits.json']) {
    try {
        const r = await fetch(url, { cache: 'no-store' });
        if (!r.ok) continue;
        const j = await r.json();
        if (j && j.edits && typeof j.edits === 'object' && !Array.isArray(j.edits)) {
            // On a case-sensitive checkout both paths can exist as separate files. Merge both, with
            // the canonical lowercase path (fetched first) winning duplicate ids.
            rawBoardEdits = Object.assign({}, j.edits, rawBoardEdits);
        }
    } catch { /* try the other case */ }
}
BOARD_EDITS = tileKeyedEdits(rawBoardEdits);

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
        ws.onclose = () => { app.pendingParts = null; notice('Связь с сервером потеряна. Переподключение…', 'error'); clearTimeout(wsTimer); wsTimer = setTimeout(net.connect, 1500); };
    },
};

// ---------------------------------------------------------------------------------------------
// App state
// ---------------------------------------------------------------------------------------------
const app = {
    me: null, host: false, spectator: false,
    lobby: null, view: null, logEntries: [], selectedCards: new Set(), hoverRoom: null,
    charId: null, colors: {}, parts: {}, pendingParts: null, labWorkshop: false, name: '', ready: false, menuCollapsed: true,
    canUndo: false, bagShown: null, bagTimer: null, deckKind: 'event', altHeld: false,
    wp: null, itemPick: null, itemPickMin: false, gallery: false,
    hoverCard: null,    // card under the pointer: { kind: 'card', id } | { kind: 'item', uid }
    showing: null,      // the card currently shown to the table: { card, from, cid }
    showCid: '',        // id of my own show, so the server echo does not draw it twice
    showTimer: null,
};
const EVENT_BY_ID = Object.fromEntries(EVENT_CARDS.map(e => [e.id, e]));
const ATTACK_BY_ID = Object.fromEntries(ATTACK_CARDS.map(e => [e.id, e]));
const TOKEN_ICON = { blank: '○', larva: '🐛', adult: '👾', drone: '🦂', queen: '👑' };
let scene = null, preview = null, dice = null, tableFx = null;
let galleryScene = null;   // lobby room gallery: its own small 3D scene, built on first open
let cursorSent = 0, lastFloor = null;

function onMessage(m) {
    switch (m.t) {
        case 'welcome':
            if (m.token) localStorage.setItem('nemesis.token', m.token);
            app.me = m.seat; app.spectator = m.spectator;
            break;
        case 'lobby': app.lobby = m; renderLobby(); break;
        case 'state':
            // The server stamps every state with the build it is serving. A tab that outlived a
            // restart (the socket reconnects on its own) would otherwise keep running the old scene
            // for ever — it would draw a door that no longer exists in the code. Reload instead.
            if (m.build && window.__BUILD && m.build !== window.__BUILD && !app.reloaded) {
                app.reloaded = true;
                location.reload();
                return;
            }
            if (!m.view) { app.view = null; $('hud').classList.add('hidden'); $('lobby').classList.remove('hidden'); $('endOverlay').classList.add('hidden'); return; }
            if (app.labWorkshop) closeLabWorkshop(false);
            app.me = m.you; app.host = m.host;
            if (m.full) app.logEntries = [];
            app.logEntries.push(...m.view.log);
            app.view = m.view; app.undoDepth = m.undoDepth; app.history = m.history; app.canUndo = !!m.canUndo;
            if (app.gallery) closeGallery();       // the table started while the gallery was open
            if (app.wp && (!app.view.prompt || app.view.prompt.id !== app.wp.prId)) closeWorldPop();
            renderGame();
            if (m.poses && scene) for (const [pid, pose] of Object.entries(m.poses)) scene.setPose(Number(pid), pose, true);
            break;
        case 'notice': notice(m.text, m.kind); break;
        case 'chat': addChat(m); break;
        case 'show': {
            // A card somebody shows to the table. My own show is already on screen (sent locally),
            // so the echo only confirms it reached the others.
            if (m.pid === app.me && m.cid && m.cid === app.showCid) break;
            presentCard(m.card, m.from || 'Игрок');
            break;
        }
        case 'cursor': if (scene && app.view && m.pid !== app.me) { const p = app.view.players[m.pid]; if (p && CHARACTERS[p.charId]) scene.setCursor(m.pid, m.x, m.z, CHARACTERS[p.charId].color, p.name, m.off); } break;
        case 'pose': if (scene && m.pid !== app.me) scene.setPose(m.pid, m.pose, false); break;
        case 'ping': if (scene && app.view) { const p = app.view.players[m.pid]; if (p && CHARACTERS[p.charId]) { scene.ping(m.x, m.z, CHARACTERS[p.charId].color); Snd.play('ping'); if (m.pid !== app.me) notice('📍 ' + p.name + (m.room ? ' указывает на ' + roomLabel(m.room) : ' указывает на стол'), 'ping'); } } break;
    }
}

/** Big card at the right edge of the screen, then the same card as a chat entry. */
const CARD_SHOW_MS = 5000;
function cardBlock(card, cls) {
    const art = card.art ? '<div class="cb-art" style="background-image:url(' + esc(card.art) + ')"></div>'
        : '<div class="cb-art plain"><span>🂠</span></div>';
    return '<div class="' + cls + '">' + art + (card.tag ? '<span class="tag">' + esc(card.tag) + '</span>' : '') +
        '<b>' + esc(card.name) + '</b><small>' + esc(card.text || '') + '</small></div>';
}
function presentCard(card, from) {
    if (!card || !card.name) return;
    const box = $('cardShow');
    clearTimeout(app.showTimer);
    // A card still on screen goes straight to the chat: nobody should lose a shown card.
    if (app.showing) addChatCard(app.showing.from, app.showing.card);
    app.showing = { card, from };
    box.innerHTML = '<div class="cs-from">' + esc(from || 'Игрок') + ' показывает</div>' + cardBlock(card, 'cs-card');
    box.classList.remove('hidden');
    requestAnimationFrame(() => box.classList.add('on'));
    app.showTimer = setTimeout(() => {
        box.classList.remove('on');
        setTimeout(() => { if (!box.classList.contains('on')) box.classList.add('hidden'); }, 260);
        addChatCard(from, card);
        if (app.showing && app.showing.card === card) app.showing = null;
    }, CARD_SHOW_MS);
}
function addChatCard(from, card) {
    const d = document.createElement('div');
    d.className = 'chat-line';
    d.innerHTML = '<b>' + esc(from || 'Игрок') + ':</b> <span class="chat-show">показывает карту</span>' + cardBlock(card, 'chat-card');
    $('chatLines').appendChild(d);
    $('chatLines').scrollTop = $('chatLines').scrollHeight;
}
/** Card under the pointer, ready to be shown: a hand/action card or an item from the sheet. */
function hoveredCardDesc() {
    const h = app.hoverCard; if (!h || !app.view) return null;
    if (h.kind === 'card') {
        const d = describeCard(h.id);
        return { name: d.name, text: d.text || '', art: cardArt(h.id) || '',
            tag: d.contam ? 'заражение' : d.field ? 'полевые данные' : 'карта действия' };
    }
    const me = app.view.players.find(p => p.id === app.me); if (!me) return null;
    const inst = (me.items || []).find(i => i.uid === h.uid) || (me.armor && me.armor.uid === h.uid ? me.armor : null);
    const d = inst && ITEMS[inst.item]; if (!d) return null;
    return { name: d.name, text: d.text || '', art: itemArt(inst.item) || '', tag: 'предмет' };
}
function showCardToTable(card) {
    const me = app.view && app.view.players.find(p => p.id === app.me);
    const from = me ? me.name : 'Вы';
    const cid = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    app.showCid = cid;
    net.send({ t: 'show', cid, card });
    presentCard(card, from);
    Snd.play('click');
}
// Remember what the pointer is over: a hand/action card or an item anywhere in the UI.
document.addEventListener('pointerover', e => {
    const el = e.target && e.target.closest ? e.target : null;
    if (!el) { app.hoverCard = null; return; }
    const cardEl = el.closest('[data-card]');
    if (cardEl) { app.hoverCard = { kind: 'card', id: cardEl.dataset.card }; return; }
    const itemEl = el.closest('[data-item]');
    app.hoverCard = itemEl ? { kind: 'item', uid: itemEl.dataset.item } : null;
});

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
    const previousCharId = app.charId;
    const activePicker = document.activeElement && document.activeElement.matches
        && document.activeElement.matches('#paintZones input[type="color"]') ? document.activeElement : null;
    const activePickerZone = activePicker && activePicker.dataset.zone;
    const activePickerColor = activePicker && activePicker.value;
    const activeSwatch = document.activeElement && document.activeElement.matches
        && document.activeElement.matches('#paintZones button[data-color]') ? document.activeElement : null;
    const swatchFocus = activeSwatch && { zone: activeSwatch.dataset.zone, color: activeSwatch.dataset.color };
    const inGame = L.phase === 'playing' && app.view;
    $('lobby').classList.toggle('hidden', !!inGame || app.gallery);
    if (inGame) return;
    const mySeat = L.seats.find(s => s.id === app.me);
    if (mySeat) {
        if (document.activeElement !== $('nameInput')) $('nameInput').value = mySeat.name;
        app.charId = mySeat.charId; app.colors = mySeat.colors || {}; app.ready = mySeat.ready;
        if (app.charId !== previousCharId) app.pendingParts = null;
        const parts = characterParts(app.charId, mySeat.parts);
        if (!app.pendingParts || JSON.stringify(parts) === app.pendingParts) { app.parts = parts; app.pendingParts = null; }
        if (activePicker && activePickerZone && app.charId === previousCharId) {
            app.colors = Object.assign({}, app.colors, { [activePickerZone]: activePickerColor });
        }
        app.host = mySeat.host;
    }
    const workshop = WORKSHOP_LABELS[app.charId];
    const labAvailable = !!mySeat && !!workshop && characterPartSlots(app.charId).length > 0 && L.phase === 'lobby';
    $('labOpen').classList.toggle('hidden', !labAvailable);
    if (labAvailable) {
        $('labOpenTitle').textContent = workshop.button; $('labOpenHint').textContent = workshop.hint;
        $('labTitle').innerHTML = esc(workshop.title) + ' <span>· мастерская</span>';
        $('labStageName').textContent = workshop.title; $('labStageCaption').textContent = workshop.caption;
        $('labSlotCount').textContent = '/ ' + String(characterPartSlots(app.charId).length).padStart(2, '0');
    }
    if (app.labWorkshop && (!labAvailable || app.charId !== previousCharId)) closeLabWorkshop(false);
    // characters
    $('charList').innerHTML = Object.entries(L.characters).map(([id, c]) => {
        const taken = L.seats.some(s => s.charId === id && s.id !== app.me);
        return '<div class="char-card ' + (id === app.charId ? 'sel' : '') + (taken ? ' taken' : '') + '" data-char="' + id + '" style="border-left:5px solid ' + c.color + '"><b>' + esc(c.name) + '</b><small>' + esc((CHARACTERS[id] ? CHARACTERS[id].startItems : []).map(si => ITEMS[si.item].name).join(', ')) + '</small></div>';
    }).join('');
    for (const el of $('charList').querySelectorAll('.char-card')) el.onclick = () => { if (el.classList.contains('taken')) return; net.send({ t: 'lobby', charId: el.dataset.char }); };
    // paint zones
    const ch = L.characters[app.charId];
    if (ch) {
        const keepPicker = activePicker && app.charId === previousCharId;
        if (!keepPicker) {
            $('paintZones').innerHTML = ch.zones.map(z => {
                const cur = characterColors(app.charId, app.colors)[z.id] || z.presets[0];
                const presetSelected = z.presets.some(p => p.toLowerCase() === cur.toLowerCase());
                return '<div class="zone"><span class="zname">' + esc(z.label) + '</span>' +
                    z.presets.map(p => '<button type="button" class="swatch ' + (p.toLowerCase() === cur.toLowerCase() ? 'sel' : '') + '" data-zone="' + z.id + '" data-color="' + p + '" style="background:' + p + '" aria-label="' + esc(z.label) + ': ' + p + '" aria-pressed="' + (p.toLowerCase() === cur.toLowerCase()) + '"></button>').join('') +
                    '<span class="swatch custom ' + (!presetSelected ? 'sel' : '') + '" title="Своя палитра"><input type="color" data-zone="' + z.id + '" value="' + cur + '" aria-label="Свой цвет: ' + esc(z.label) + '"></span></div>';
            }).join('');
            for (const el of $('paintZones').querySelectorAll('.swatch[data-color]')) el.onclick = () => sendColor(el.dataset.zone, el.dataset.color);
            for (const el of $('paintZones').querySelectorAll('input[type=color]')) {
                const zone = el.dataset.zone;
                // A native colour picker emits many `input` events while the user is still choosing.
                // Sending each one causes the lobby broadcast to replace this input mid-selection; keep
                // those changes local for the live preview and send only the committed colour on `change`.
                el.oninput = () => {
                    app.colors = Object.assign({}, app.colors, { [zone]: el.value });
                    updateSwatches(zone, el.value);
                    if (preview) preview.show(app.charId, app.colors, app.parts);
                };
                el.onchange = () => sendColor(zone, el.value);
            }
            // Preset buttons are rebuilt on a lobby broadcast; retain keyboard position afterwards.
            if (swatchFocus && app.charId === previousCharId) {
                const replacement = [...$('paintZones').querySelectorAll('button[data-color]')]
                    .find(el => el.dataset.zone === swatchFocus.zone && el.dataset.color === swatchFocus.color);
                if (replacement) replacement.focus({ preventScroll: true });
            }
        }
        if (!preview) preview = new Preview3D($('previewCanvas'));
        preview.show(app.charId, app.colors, app.parts);
        if (app.labWorkshop) updateLabSelection();
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
function updateSwatches(zone, color) {
    let isPreset = false;
    for (const el of $('paintZones').querySelectorAll('.swatch[data-color]')) if (el.dataset.zone === zone) {
        const selected = el.dataset.color.toLowerCase() === color.toLowerCase();
        isPreset ||= selected;
        el.classList.toggle('sel', selected);
        el.setAttribute('aria-pressed', String(selected));
    }
    for (const input of $('paintZones').querySelectorAll('input[type=color]')) if (input.dataset.zone === zone) {
        if (input.value !== color) input.value = color;
        input.parentElement.classList.toggle('sel', !isPreset);
    }
}
function sendColor(zone, color) {
    if (!ws || ws.readyState !== 1) {
        // A picker may have changed the local preview, but it cannot be saved while offline.
        const seat = app.lobby?.seats.find(s => s.id === app.me);
        app.colors = Object.assign({}, seat?.colors);
        const current = characterColors(app.charId, app.colors)[zone]
            || app.lobby?.characters?.[app.charId]?.zones?.find(z => z.id === zone)?.presets?.[0] || '#888888';
        updateSwatches(zone, current);
        if (preview) preview.show(app.charId, app.colors, app.parts);
        notice('Нет связи с сервером — изменения не сохранены.', 'error');
        return;
    }
    app.colors = Object.assign({}, app.colors, { [zone]: color });
    updateSwatches(zone, color);
    if (preview) preview.show(app.charId, app.colors, app.parts);
    net.send({ t: 'lobby', colors: app.colors });
}

// ---------------------------------------------------------------------------------------------
// Character workshop. It reuses the lobby's 3D canvas so switching screens does not
// create another WebGL engine. The server validates the selected ids and shares them with the table.
// ---------------------------------------------------------------------------------------------
let labCameraPose = null;
function setLabPage(page) {
    const details = page !== 'colors';
    $('labPartsTab').setAttribute('aria-pressed', String(details));
    $('labColorsTab').setAttribute('aria-pressed', String(!details));
    $('labOptions').classList.toggle('hidden', !details);
    $('labColorPanel').classList.toggle('hidden', details);
    $('labReset').classList.toggle('hidden', !details);
    // A long list of parts may have been scrolled to its end before switching pages.
    $('labOptions').parentElement.scrollTop = 0;
}
function updateLabSelection() {
    for (const button of $('labOptions').querySelectorAll('[data-part][data-value]')) {
        button.setAttribute('aria-pressed', String(app.parts[button.dataset.part] === button.dataset.value));
    }
}
function setLabParts(parts) {
    if (!characterPartSlots(app.charId).length || !app.labWorkshop) return;
    if (!ws || ws.readyState !== 1) { notice('Нет связи с сервером — изменения не сохранены.', 'error'); return; }
    app.parts = characterParts(app.charId, parts);
    app.pendingParts = JSON.stringify(app.parts);
    updateLabSelection();
    if (preview) preview.show(app.charId, app.colors, app.parts);
    net.send({ t: 'lobby', parts: app.parts });
}
function openLabWorkshop() {
    if (!preview || !WORKSHOP_LABELS[app.charId] || !characterPartSlots(app.charId).length || app.spectator || !app.lobby || app.lobby.phase !== 'lobby') return;
    renderLabOptions(app.charId);
    app.labWorkshop = true;
    $('labColorHost').appendChild($('paintZones'));
    setLabPage('parts');
    $('labWorkshop').classList.remove('hidden');
    $('labCanvasHost').appendChild($('previewCanvas'));
    const cam = preview.camera;
    labCameraPose = { alpha: cam.alpha, beta: cam.beta, radius: cam.radius, target: cam.target.clone() };
    // Frame the seated scientist and the wider/taller companion models without cutting them off.
    const framing = {
        scientist: { x: 0, y: 0.7, radius: 2.9 },
        ceo: { x: -0.2, y: 0.95, radius: 3.7 },
        bounty: { x: 0.17, y: 0.95, radius: 3.7 },
        xeno: { x: 0, y: 1.05, radius: 3.6 },
    }[app.charId] || { x: 0, y: 0.95, radius: 3.3 };
    setPreviewCameraPose(cam, {
        target: new (window.BABYLON.Vector3)(framing.x, framing.y, 0),
        alpha: Math.PI / 2 - 0.28, beta: 1.3, radius: framing.radius,
    });
    preview.show(app.charId, app.colors, app.parts);
    updateLabSelection();
    preview.engine.resize();
    requestAnimationFrame(() => { if (app.labWorkshop && preview) preview.engine.resize(); });
    $('labClose').focus();
}
function closeLabWorkshop(restoreFocus = true) {
    if (!app.labWorkshop) return;
    app.labWorkshop = false;
    $('charPreview').appendChild($('previewCanvas'));
    $('paintLobbyHost').appendChild($('paintZones'));
    $('labWorkshop').classList.add('hidden');
    if (preview && labCameraPose) {
        setPreviewCameraPose(preview.camera, labCameraPose);
        labCameraPose = null;
        requestAnimationFrame(() => { if (preview) preview.engine.resize(); });
    }
    if (restoreFocus && !$('labOpen').classList.contains('hidden')) $('labOpen').focus({ preventScroll: true });
}
function renderLabOptions(charId) {
    $('labOptions').innerHTML = characterPartSlots(charId).map((slot, i) =>
        '<section class="lab-slot" role="group" aria-labelledby="lab-slot-' + slot.id + '">' +
        '<div class="lab-slot-heading"><h4 id="lab-slot-' + slot.id + '"><span>' + String(i + 1).padStart(2, '0') + '</span>' + esc(slot.label) + '</h4><small>' + esc(slot.hint) + '</small></div>' +
        '<div class="lab-preset-grid">' + slot.options.map(option =>
            '<button type="button" class="lab-preset" data-part="' + slot.id + '" data-value="' + option.id + '" aria-pressed="false"><b>' + esc(option.label) + '</b><small>' + esc(option.detail) + '</small></button>'
        ).join('') + '</div></section>'
    ).join('');
}
$('labOptions').onclick = e => {
    const button = e.target.closest('[data-part][data-value]');
    if (button) setLabParts(Object.assign({}, app.parts, { [button.dataset.part]: button.dataset.value }));
};
$('labOpen').onclick = openLabWorkshop;
$('labClose').onclick = () => closeLabWorkshop();
$('labDone').onclick = () => closeLabWorkshop();
$('labPartsTab').onclick = () => setLabPage('parts');
$('labColorsTab').onclick = () => setLabPage('colors');
$('labReset').onclick = () => setLabParts({});
$('labColorReset').onclick = () => {
    if (!ws || ws.readyState !== 1) { notice('Нет связи с сервером — изменения не сохранены.', 'error'); return; }
    app.colors = {};
    if (preview) preview.show(app.charId, {}, app.parts);
    net.send({ t: 'lobby', colors: {} });
};

// ---------------------------------------------------------------------------------------------
// Room gallery (test ship). A normal game shuffles only 11 basic + 5 additional tiles onto the
// board, so most rooms never show up. This button on the character-selection screen opens a
// separate scene with *every* room tile of the game (25), already revealed, for looking at the
// models. It is client-side only: nothing is sent to the server and no game state is touched.
// ---------------------------------------------------------------------------------------------
const GALLERY_GROUPS = [
    ['Особые комнаты', ['cockpit', 'hibernatorium', 'engine']],
    ['Базовые тайлы · слот 1', BASIC_TILES],
    ['Дополнительные тайлы · слот 2', ADDITIONAL_TILES],
];

/** A view-shaped object for Scene3D: all rooms known and explored, no players or intruders. */
function galleryView(ship) {
    const roomState = {};
    for (const r of Object.values(ship.rooms)) {
        roomState[r.id] = { tile: ship.galleryTiles[r.id], explored: true, fire: false, malfunction: false, objects: [], token: null };
    }
    return {
        ship, roomState, players: [], intruders: {}, fx: [], pods: galleryPods(), podsUnlocked: true,
        nestEggs: 5, time: 15, selfDestruct: 0, destination: 'B', current: null, phase: 'gallery', lastShot: null,
    };
}

function gallerySize() {
    const b = galleryScene.view.ship.bounds;
    return { w: (b.maxX - b.minX) * 0.1, h: (b.maxY - b.minY) * 0.1 };
}

function resetGalleryCam() {
    if (!galleryScene) return;
    const { w, h } = gallerySize();
    galleryScene.markRoom(null);
    galleryScene.flyTo(new (window.BABYLON.Vector3)(0, 0, 0), Math.max(110, Math.max(w, h) * 1.3));
    for (const el of $('galleryList').querySelectorAll('.gal-room')) el.classList.remove('sel');
}

function focusGalleryRoom(id) {
    if (!galleryScene) return;
    if (!id) { resetGalleryCam(); return; }
    galleryScene.markRoom(id);
    galleryScene.focusRoom(id, 30);
    for (const el of $('galleryList').querySelectorAll('.gal-room')) el.classList.toggle('sel', el.dataset.room === id);
}

function renderGalleryList() {
    const ship = galleryScene && galleryScene.view && galleryScene.view.ship; if (!ship) return;
    const byTile = {};
    for (const [id, tile] of Object.entries(ship.galleryTiles)) byTile[tile] = id;
    $('galleryList').innerHTML = '<button class="btn small gal-all" id="galAll">⤢ Весь корабль</button>' +
        GALLERY_GROUPS.map(([title, tiles]) => '<h4>' + esc(title) + '</h4>' + tiles.map(t => {
            const id = byTile[t];
            return '<button class="gal-room" data-room="' + id + '"><b>' + id + '</b>' + esc(ROOM_TILES[t].name) + '</button>';
        }).join('')).join('') +
        '<p class="gal-note">В отсеках A и B стоят все четыре капсулы: A1 открыта, A2 заперта, B1 занята, B2 открыта.</p>';
    for (const el of $('galleryList').querySelectorAll('.gal-room')) el.onclick = () => { closeWorldPop(); focusGalleryRoom(el.dataset.room); Snd.play('click'); };
    $('galAll').onclick = () => { resetGalleryCam(); Snd.play('click'); };
}

function galleryHint(text, bad) {
    const el = $('galleryHint'); if (!el) return;
    el.textContent = text;
    el.style.color = bad ? '#f0b3b3' : '';
}

function openGallery() {
    if (!app.lobby) return;
    if (!galleryScene && !window.BABYLON) { galleryHint('Не удалось открыть тестовый корабль: браузер не загрузил 3D-движок (WebGL).', true); return; }
    $('lobby').classList.add('hidden');
    $('gallery').classList.remove('hidden');
    app.gallery = true;
    try {
        if (!galleryScene) galleryScene = new Scene3D($('galleryCanvas'), {
            onHover: id => { $('galleryCanvas').style.cursor = id ? 'pointer' : ''; },
            onClick: id => focusGalleryRoom(id),
        });
        galleryScene.gallery = true;
        galleryScene.setEdits(BOARD_EDITS);
        galleryScene.setActive(true);
        galleryScene.update(galleryView(galleryShip()), ROOM_TILES, INTRUDER_NAMES, []);
        galleryScene.camera.alpha = -Math.PI / 2;
        galleryScene.camera.beta = 0.85;
        resetGalleryCam();
        renderGalleryList();
        Snd.play('click');
    } catch (err) {
        console.error(err);
        closeGallery();
        galleryHint('Не удалось построить тестовый корабль: ' + ((err && err.message) || err), true);
    }
}

function closeGallery() {
    if (!app.gallery) return;
    app.gallery = false;
    if (galleryScene) galleryScene.setActive(false);
    $('gallery').classList.add('hidden');
    if (app.lobby) renderLobby(); else $('lobby').classList.remove('hidden');
    Snd.play('click');
}

$('nameInput').onchange = () => { localStorage.setItem('nemesis.name', $('nameInput').value); net.send({ t: 'lobby', name: $('nameInput').value }); };
$('readyBtn').onclick = () => net.send({ t: 'lobby', ready: !app.ready });
$('galleryBtn').onclick = () => openGallery();
$('galleryClose').onclick = () => closeGallery();
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
            onComputer: onComputerClick, onPlayer: onPlayerClick,
            onCursor: (x, z, room) => { lastFloor = { x, z, room }; const now = performance.now(); if (now - cursorSent > 50) { cursorSent = now; net.send({ t: 'cursor', x, z }); } },
            onPose: pose => net.send({ t: 'pose', dx: pose.dx, dz: pose.dz, rot: pose.rot }),
        });
        // The pointer left the board (onto the HUD): my table cursor must not stay frozen on the map.
        $('scene').addEventListener('pointerleave', () => { if (app.view) net.send({ t: 'cursor', off: true }); });
    }
    if (!scene.editMode && !scene.boardEditsApplied) { scene.setEdits(BOARD_EDITS); scene.boardEditsApplied = true; }
    scene.setMe(app.me);
    if (!tableFx) {
        tableFx = new TableFX($('table'), $('fxLayer'), pid => document.querySelector('.pcard[data-pid="' + pid + '"]'), INTRUDER_NAMES);
        tableFx.onShake = k => scene && scene.shake(k);
        // a question that was held back while a token/attack card played is asked as soon as the
        // table is quiet again
        tableFx.onIdle = () => { if (app.promptDeferred) { app.promptDeferred = false; renderPrompt(); } };
    }
    if (!dice) {
        dice = new DiceUI($('dice'), () => act('roll'));
        dice.afterHide = () => { if (app.view) dice.update(app.view, app.me, playerName); };
        dice.onLanded = () => {
            app.rollHold = false; if (!app.view) return;
            const pr = app.view.prompt;
            // The noise die said "something is there": read the result first, then one soft yellow glow
            // around the screen, and only after that the token window — centred where the die was.
            // The prompt must be a bag this very roll opened: a bag left over from an earlier action
            // (or a stale view) used to light the screen up after a roll that found nothing.
            const fromThisRoll = pr && pr.kind === 'bag' && (pr.id || 0) > (app.diceId || 0);
            if (fromThisRoll && pr.player === app.me) {
                flashEdges();
                // the die has been read: clear the middle of the table for the token window
                setTimeout(() => { dice.clearHide(); dice.hide(); if (app.view) renderGame(); }, 560);
            } else renderGame();
        };
    }
    // Effects are fed from EVERY state, including the one that freezes the scene for a die. When a
    // character runs from an intruder, the escape attack card and the noise die of the destination
    // room arrive in the same state; the gate below used to return before the fx queue was even
    // touched, so the card that hit the runner was never shown. Feeding the queue is harmless —
    // while the die is on the table the queue is paused, and it plays the moment the die is read.
    const prPre = v.prompt, dicePre = prPre && prPre.kind === 'dice';
    const freshPre = v.lastRoll && dice.lastSeen !== null && v.lastRoll.n !== dice.lastSeen;
    tableFx.pause();
    tableFx.update(v, app.me);
    if (!dicePre && !freshPre && !app.rollHold) tableFx.resume();   // a die still on the table holds it
    // Dice gate. The engine moves the figure and reveals the room BEFORE asking for the noise roll, so the 3D
    // scene (and the card/bag fx) freeze from the moment a dice prompt appears until the rolled die has landed:
    // the player sees the result first, only then the figure runs and the room token flips.
    const pr = v.prompt;
    const dicePrompt = pr && pr.kind === 'dice';
    // Remember which prompt the die belongs to: a bag prompt with a higher id can only have been
    // opened by this roll (ids grow with every question the engine asks).
    if (dicePrompt) app.diceId = pr.id || 0;
    const freshRoll = v.lastRoll && dice.lastSeen !== null && v.lastRoll.n !== dice.lastSeen;
    if (dicePrompt || freshRoll) {
        app.rollHold = true;
        tableFx.pause();
        // While the die is being asked for, the scene is frozen: a room revealed by this very move is
        // still lying face down. The die must not name it before the tile has been turned over.
        dice.update(v, app.me, playerName, diceTitleMask(pr));
        renderTopbar(); renderPlayers(); renderLog(); renderHistory(); renderHand(); renderHint(); refreshOverlays();
        // Nothing that spoils the die result: while the die is on the table the follow-up question
        // (pull an intruder token) stays hidden. It appears once the die has landed — see dice.onLanded.
        $('prompt').classList.add('hidden'); $('menuToggle').classList.add('hidden');
        $('bagStrip').classList.add('hidden');
        // Watchdog: a hold must never outlive the die (a lost result, a reconnect in the middle of a roll).
        setTimeout(() => {
            if (!app.rollHold) return;
            const p = app.view && app.view.prompt;
            if (p && p.kind === 'dice') return;
            app.rollHold = false; renderGame();
        }, 6000);
        return;
    }
    if (app.rollHold) return;   // die tumbling or just landed: keep the frozen scene until it is read
    app.rollHold = false;
    // Rooms the engine is explicitly asking about light up with the orange ring. Neighbouring rooms
    // used to pulse on every turn as a "you can walk there" hint — that blinked non-stop, so it is gone;
    // clicking a neighbouring room still offers to go there.
    const selectable = pr && pr.kind === 'room' && !pr.waiting ? pr.rooms : [];
    scene.update(v, ROOM_TILES, INTRUDER_NAMES, selectable);
    renderTopbar(); renderPlayers(); renderLog(); renderHistory(); renderPrompt(); renderHand();
    renderBagStrip(); renderHint(); refreshOverlays();
    const meNow2 = v.players.find(x => x.id === app.me);
    $('sheetBtn').classList.toggle('attention', !!(meNow2 && itemPickMap(v.prompt, meNow2).size));
    dice.update(v, app.me, playerName, diceTitleMask(pr));
    tableFx.resume();          // the die is not on the table: whatever the queue holds may play
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
    // Escape pods are pieces on the table: their number, section and state are public, only the
    // location of the evacuation sections is secret (the tiles are face down until explored).
    const pods = v.pods || [];
    $('tbPods').innerHTML = pods.length
        ? pods.map(p => '<span class="podchip ' + (p.launched || p.removed ? 'gone' : p.occupants.length ? 'busy' : p.locked ? 'locked' : 'open') + '">' +
            '№' + p.num + '<i>' + p.section + '</i>' + (p.launched ? '🚀' : p.removed ? '✕' : p.locked ? '🔒' : '🔓') +
            (p.occupants.length ? '<em>' + p.occupants.length + '/2</em>' : '') + '</span>').join('')
        : '—';
    $('tbPods').classList.toggle('itag', pods.length > 0);
    $('tbPods').title = pods.length
        ? 'Спасательные капсулы (стр. 2, шаг 7): номер · секция A/B · 🔒 заперта / 🔓 открыта / 🚀 улетела. ' +
          'Сколько их — зависит от числа игроков; открываются после первой смерти или на жёлтой зоне самоуничтожения.'
        : '';
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
    renderSelfHud();
}

// The printed Dashboard: 10 cells in three sections a Heavy Wound can cover — green 10-8, orange 7-5,
// red 4-2 — then the near-death cell (1) standing on its own, then the skull. The last cell is NOT part
// of the third wound: a third Heavy Wound caps Health at 1, but it covers only 4-2, so the slot under
// the red cells is exactly three cells wide and the cell 1 has no box under it.
const HP_SECTIONS = [[10, 9, 8], [7, 6, 5], [4, 3, 2]];
const HP_LAST = 1;
/** The near-death cell: red like the section it closes, but outside every wound box. */
const LAST_CELL = (p) => hpCell(p, 2, HP_LAST);
/** One cell of the track: `on` = that much health is still mine, `here` = the marker stands on it. */
function hpCell(p, si, n) {
    return '<i class="' + (si === 1 ? 'mid ' : si === 2 ? 'heavy ' : '') + (n === 1 ? 'last ' : '') +
        (p.health >= n ? 'on ' : '') + (p.health === n ? 'here' : '') + '" title="' + n + '"></i>';
}
/** The skull closes the track at the right, exactly as on the board: 10 on the left, death on the right. */
function hpSkull(p) { return '<span class="hp-skull' + (p.health <= 1 ? ' near' : '') + '">☠</span>'; }
function hpBar(p) {
    const groups = HP_SECTIONS.map((sec, si) => '<span class="hp-sec">' + sec.map(n => hpCell(p, si, n)).join('') + '</span>').join('');
    return '<div class="hp" title="Здоровье: ' + p.health + ' / 10' + (p.health === 0 ? ' — при смерти' : '') + '">' +
        groups + '<span class="hp-sec hp-last">' + LAST_CELL(p) + '</span>' + hpSkull(p) + '</div>';
}

/** My own health, always in the lower-LEFT corner, drawn like the printed Dashboard: three sections
 *  left to right (10 down to 2), the near-death cell on its own, the skull last, and one narrow slot
 *  under each section for its Heavy Wound. A wound caps Health at 7 / 4 / 1, so the first slot sits
 *  under the green section, the second under the orange one and the third under the red one — three
 *  slots, because a fourth wound kills. The third slot covers 4-2 only: the last cell belongs to no
 *  wound, so it stands beside the slots instead of under the third one. The suit is not a wound, so it
 *  takes its own line instead of a fourth box. Only names live here — the rules text and the art are a
 *  card that appears on hover. An empty slot keeps a grey placeholder, so the row reads "nothing here
 *  yet" without words. */
function renderSelfHud() {
    const v = app.view, el = $('selfHud');
    const me = v && v.players.find(p => p.id === app.me);
    if (!me || !me.charId || me.status === 'dead' || me.status === 'escaped') { el.classList.add('hidden'); hideHudPop(); return; }
    el.classList.remove('hidden');
    const st = me.health >= 8 ? 'здоров' : me.health >= 5 ? 'ранен' : 'тяжело ранен';
    const wounds = me.wounds || [];
    // The suit is a heavy object, not a fourth wound: it lies in the third Heavy Wound slot, under the
    // red part of the track (4-2), exactly where the printed Dashboard keeps it. Wounds fill their
    // slots from the left, so the third slot is free until the third wound — and a third wound is the
    // one that brings the character to the last cell, when the suit is long gone.
    const armorAt = me.armor && wounds.length < HP_SECTIONS.length ? HP_SECTIONS.length - 1 : -1;
    const bar = HP_SECTIONS.map((sec, i) => {
        const w = wounds[i];
        let slot;
        if (w) slot = '<div class="sh-slot wound" data-wound="' + esc(w) + '">' + esc(woundShort(w)) + '</div>';
        else if (i === armorAt) slot = '<div class="sh-slot armor" data-armor="1">🛡 ' + esc(itemLabel(me.armor)) + '</div>';
        else slot = '<div class="sh-slot empty"></div>';
        return '<div class="sh-lvl"><div class="sh-cells">' + sec.map(n => hpCell(me, i, n)).join('') + '</div>' + slot + '</div>';
    }).join('');
    // the near-death cell: no slot under it, it is not part of any wound
    const lastCell = '<div class="sh-cells sh-last">' + LAST_CELL(me) + '</div>';
    // no free slot (three wounds): the suit rides along in the header instead of a line of its own
    const armorBadge = me.armor && armorAt < 0 ? ' · 🛡 ' + esc(itemLabel(me.armor)) : '';
    el.classList.toggle('dead', me.health <= 1);
    el.innerHTML = '<div class="sh-head"><b>' + esc(me.charName || me.name) + '</b><small>' + esc(st) + ' · ' + me.health + ' / 10' + armorBadge + '</small></div>' +
        '<div class="sh-hp">' + bar + lastCell + hpSkull(me) + '</div>';
    el.title = 'Здоровье и травмы — нажмите, чтобы открыть планшет (C)';
}

/** The card behind a name in the health HUD: the wound's rules text, or the suit with its art. */
const HUD_POP_PAD = 8;
function hideHudPop() { const el = $('hudPop'); if (el) { el.classList.add('hidden'); el.classList.remove('show', 'armor'); } }
function showHudPop(tag) {
    const el = $('hudPop'); if (!el) return;
    const v = app.view, me = v && v.players.find(p => p.id === app.me);
    let html = '', armor = false;
    const w = tag.dataset.wound;
    if (w) {
        html = '<b>🩸 ' + esc(WOUNDS[w] ? WOUNDS[w].name : w) + '</b><span>' + esc(WOUNDS[w] ? WOUNDS[w].text : '') + '</span>';
    } else if (tag.dataset.armor && me && me.armor) {
        const art = itemArt(me.armor.item);
        armor = true;
        html = (art ? '<span class="ipart" style="background-image:url(' + art + ')"></span>' : '') +
            '<b>🛡 ' + esc(itemLabel(me.armor)) + '</b><span>' + esc(itemTitle(me.armor)) + '</span>';
    } else return;
    el.innerHTML = html;
    el.classList.remove('hidden'); el.classList.toggle('armor', armor); el.classList.add('show');
    const r = tag.getBoundingClientRect(), w2 = el.offsetWidth, h2 = el.offsetHeight;
    const x = Math.min(window.innerWidth - w2 - HUD_POP_PAD, Math.max(HUD_POP_PAD, r.left));
    let y = r.top - h2 - 6;                                        // the card sits above the name
    if (y < HUD_POP_PAD) y = Math.min(window.innerHeight - h2 - HUD_POP_PAD, r.bottom + 6);
    el.style.left = Math.round(x) + 'px'; el.style.top = Math.round(y) + 'px';
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
        // A closed quest card lies face down on the sheet: its name is public, its reward is not.
        for (const q of (p.quests || [])) if (!q.open && ITEMS[q.item]) tags.push('<span class="tag yellow" title="Квестовый предмет закрыт — откроется действием в комнате, напечатанной на карте">🔒 ' + esc(ITEMS[q.item].name) + '</span>');
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
/** Title override for the die: keeps an unexplored room hidden until its tile is face up. */
function diceTitleMask(pr) {
    if (!pr || pr.kind !== 'dice' || !pr.room || !pr.title) return null;
    const node = scene && scene.roomNodes ? scene.roomNodes[pr.room] : null;
    if (node && node.shell) return null;                 // the room is already open on the table
    const masked = pr.title.replace(/[^—–]*\[[^\]]*\]\s*$/, '??? [' + pr.room + ']');
    return masked === pr.title ? null : { title: masked };
}

/** Is this card in the middle of its half-turn right now? (its hold is short and belongs to it) */
function ackHeld(pr) {
    return !!(app.ackHold && pr && pr.kind === 'ack' && pr.id === app.ackHold.id &&
        pr.flipped && app.ackHold.until > Date.now());
}

function renderPrompt() {
    const v = app.view; const pr = v.prompt; const el = $('prompt'); const tg = $('menuToggle');
    app.selectedCards.clear();
    // The token pull and the attack card own the middle of the table while they play: a question that
    // arrives during them (the attack window, the next choice) waits, otherwise it covered the token
    // and the table never saw who came out of the bag.
    if (pr && pr.kind !== 'dice' && tableFx && tableFx.holding) {
        el.classList.add('hidden'); tg.classList.add('hidden'); app.promptDeferred = true; return;
    }
    if (!pr || pr.kind === 'dice') { el.classList.add('hidden'); tg.classList.add('hidden'); el.classList.remove('bagmode', 'eventmode'); closeItemPicker(); return; }   // dice prompts are shown by DiceUI
    // A state update can land in the middle of the half-second the card takes to turn. Rewriting
    // #prompt then rebuilt the card — the turn restarted, or finished in a flash. The card is left
    // alone (with the ready ticks it carries) until the turn is over.
    if (ackHeld(pr) && $('ack3d')) return;   // a card in the middle of its half-turn is left alone
    const who = pr.kind === 'ack' ? 'Вся команда' : pr.player === 'host' ? 'Ведущий' : (v.players[pr.player] || {}).name || '';
    // The action list opens only when the player asks for it: every turn starts folded, then keeps the
    // player's choice until the turn ends. Other prompts open by themselves when a new one arrives.
    if (pr.kind === 'turn') {
        const tk = v.round + ':' + pr.player;
        if (tk !== app.turnKey) { app.turnKey = tk; app.menuCollapsed = true; }
        app.promptCollapsed = app.menuCollapsed;
    } else if (pr.id !== app.lastPromptId) app.promptCollapsed = false;
    if (pr.id !== app.lastPromptId) {
        app.lastPromptId = pr.id;
        // QoL: a cue when the table needs ME (my turn, my die, my token, my Ready).
        const forMe = pr.player === app.me || (pr.kind === 'ack' && pr.mine);
        if (forMe && !pr.waiting) {
            if (pr.kind === 'turn') { notice('Ваш ход.', 'turn'); Snd.play('ping'); }
            else if (pr.kind === 'dice' || pr.kind === 'bag') Snd.play('click');
        }
    }
    const isAck = pr.kind === 'ack';
    const mine = !pr.waiting;
    // The event card and the token request are windows of the table centre — they appear where the
    // card/die landed, not in the bottom-left corner, and they never start folded.
    const eventMode = isAck && !!pr.event;
    const bagMode = pr.kind === 'bag' && !pr.waiting;   // only the puller's own window moves to the centre
    el.classList.toggle('bagmode', bagMode);
    el.classList.toggle('eventmode', eventMode);
    tg.classList.toggle('hidden', bagMode || eventMode || (!mine && !pr.waiting));
    tg.textContent = app.promptCollapsed ? '☰ ' + (pr.kind === 'turn' ? 'Действия' : 'Открыть окно') : '✕ Свернуть';
    tg.classList.toggle('attention', mine && app.promptCollapsed);
    el.classList.toggle('hidden', app.promptCollapsed && !bagMode && !eventMode);
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
            {
                // The same choice can be made on the cards of my own backpack (C opens the sheet).
                const picks = itemPickMap(pr, myChar());
                if (picks.size) html += '<div class="prompt-buttons"><button class="btn primary" id="pickInv" title="Открыть планшет персонажа: подсвеченные предметы и слоты рук нажимаются">🎒 Выбрать из инвентаря · C</button></div>';
            }
            if (pr.cancel) html += '<div class="prompt-buttons"><button class="btn" data-opt="cancel">Отмена</button></div>';
            break;
        case 'room':
            html += '<div class="ptext">Нажмите на комнату на карте или выберите из списка:</div><div class="opt-row">' + pr.rooms.map(r => '<button class="opt" data-room="' + r + '">' + esc(roomLabel(r)) + '</button>').join('') + '</div>';
            if (pr.cancel) html += '<div class="prompt-buttons"><button class="btn" data-opt="cancel">Отмена</button></div>';
            break;
        case 'cards':
            // A pass ("discard any number of cards") starts with nothing selected: the button must be
            // pressable right away instead of waiting for a card to be ticked and unticked again.
            const needPick = (pr.min || 0) > 0;
            html += '<div class="ptext">' + (needPick ? 'Выберите карт: ' + (pr.min === pr.max ? pr.min : pr.min + '–' + pr.max) : 'Можно сбросить любые карты — или ни одной') + ' (нажимайте на карты в руке внизу)</div>' +
                '<div class="prompt-buttons">' + (pr.cancel ? '<button class="btn" data-opt="cancel">Отмена</button>' : '') +
                '<button class="btn primary" id="cardsOk"' + (needPick ? ' disabled' : '') + '>Подтвердить</button></div>';
            break;
        case 'info':
            html += '<div class="prompt-buttons"><button class="btn primary" data-opt="ok">Понятно</button></div>';
            break;
        case 'ack': {
            // The event card is dealt face down. Any player at the table may turn it over — the flip
            // is a table state (prompt.flipped), so everyone sees the same card at the same time, and
            // only after that does "Готово" open: nobody confirms a card they have not read.
            const ev = pr.event ? EVENT_BY_ID[pr.event] : null;
            const art = ev ? eventArt(ev.id) : null;
            const flipped = !ev || !!pr.flipped;
            if (ev) {
                // The card is a card: both faces sit in the markup and the wrapper turns over in 3D.
                // The render that first sees prompt.flipped builds the card face DOWN again and adds
                // the class a moment later, so the browser really plays the turn — a card that was
                // simply re-rendered face up looked like an instant swap. Any later render (a seat
                // changing, the ready list filling up) shows it already turned.
                // A new card: forget the previous one entirely. The hold of the last turn used to
                // outlive its card, so every card after the first one was drawn already face up and
                // simply appeared — the turn only ever played once per session.
                if (app.ackId !== pr.id) { app.ackId = pr.id; app.ackDown = false; app.ackFlipSent = false; app.ackHold = null; }
                const turning = flipped && !!app.ackDown && !ackHeld(pr);
                if (turning) app.ackDown = false; else if (!flipped) app.ackDown = true;
                const faceDown = !flipped || turning;
                html = '<h4 id="ackTitle">' + (faceDown ? '📜 Карта события' : '📜 ' + esc(ev.name)) + '</h4>' +
                    '<div class="ack-card ' + (flipped ? 'up' : 'down') + '" id="ackFlip"' +
                    (flipped ? '' : ' title="Перевернуть карту события"') + '>' +
                    '<div class="ack3d' + (flipped && !turning ? ' flipped' : '') + '" id="ack3d">' +
                    '<div class="ack-face aback">?</div>' +
                    '<div class="ack-face afront"' + (art ? ' style="background-image:url(' + art + ')"' : '') + '></div>' +
                    '</div>' +
                    '<div class="atext' + (faceDown ? ' dim' : '') + '" id="ackText">' + (faceDown
                        ? 'Карта лежит лицом вниз. Нажмите на неё, чтобы перевернуть — её увидят все игроки.'
                        : esc(pr.text || ev.text)) + '</div></div>';
                if (turning) {
                    app.ackHold = { id: pr.id, until: Date.now() + 700 };
                    setTimeout(() => { const el = $('ack3d'); if (el) el.classList.add('flipped'); }, 60);
                    // the printed text comes with the printed face, not before it
                    setTimeout(() => {
                        const t = $('ackText'), h = $('ackTitle');
                        if (t) { t.classList.remove('dim'); t.textContent = pr.text || ev.text; }
                        if (h) h.textContent = '📜 ' + ev.name;
                    }, 520);
                }
            }
            html += '<div class="ack-ready">' + (pr.players || []).map(id => {
                const p = v.players[id] || {}; const done = (pr.acked || []).includes(id);
                return '<span class="rd' + (done ? ' on' : '') + '">' + (done ? '✔ ' : '… ') + esc(p.name || ('#' + id)) + '</span>';
            }).join('') + '</div>';
            if (!flipped) {
                if (pr.mine) html += '<div class="prompt-buttons"><button class="btn primary" data-opt="ok" disabled>Готово</button></div>';
                html += '<div class="ptext dim">Сначала переверните карту события.</div>';
            } else if (pr.mine) html += '<div class="prompt-buttons"><button class="btn primary" data-opt="ok">Готово</button></div>';
            else if (pr.waiting) html += '<div class="ptext dim">Вы готовы — ждём остальных…</div>';
            else if (!(pr.players || []).includes(app.me)) html += '<div class="ptext dim">Игроки читают карту события…</div>';
            if (app.host && flipped) html += '<div class="prompt-buttons"><button class="btn small" data-opt="all" title="Если кто-то отошёл">Готово за всех</button></div>';
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
                '<div class="bag-reason">' + esc(pr.text || '') + '</div></div></div>' +
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
    if ($('pickInv')) $('pickInv').onclick = () => openSheet();
    for (const b of el.querySelectorAll('[data-room]')) b.onclick = () => act(b.dataset.room);
    // The face-down event card: any seat can turn it over for the whole table. The turn itself is
    // played by the render that comes back with prompt.flipped — flipping it here as well made the
    // card snap back to its back for a frame before the server state replaced it.
    if ($('ackFlip')) $('ackFlip').onclick = () => {
        const c = $('ackFlip');
        if (!c || !c.classList.contains('down')) return;   // already turned / being turned
        c.classList.remove('down'); c.style.cursor = 'progress';
        app.ackFlipSent = true;
        net.send({ t: 'flip' });
    };
    const ok = $('cardsOk'); if (ok) ok.onclick = () => act([...app.selectedCards]);
}

/** A single soft yellow glow around the screen edges — the "the die said something happened" beat
 *  between the die landing and the token request. Fires once, then removes itself. */
function flashEdges() {
    const layer = $('fxLayer') || document.body;
    const el = document.createElement('div');
    el.className = 'edgeflash';
    layer.appendChild(el);
    setTimeout(() => el.remove(), 900);
}

/** The last bag token: the result, the reason and what it means. */
function renderBagStrip() {
    const el = $('bagStrip'); const v = app.view; const b = v && v.bagLast;
    if (!b) { el.classList.add('hidden'); return; }
    if (app.bagShown === b.n) return;
    app.bagShown = b.n;
    const who = b.by != null && v.players[b.by] ? v.players[b.by].name : '';
    el.innerHTML = '<span class="bt-ico">' + (TOKEN_ICON[b.token] || '🎒') + '</span>' +
        '<div><div class="bt-name">' + esc(INTRUDER_NAMES[b.token] || b.token) + (who ? ' · ' + esc(who) : '') + '</div>' +
        '<div class="bt-why">' + esc(b.reason || '—') + '</div>' +
        '<div class="bt-effect">' + esc(b.effect || b.meaning || '') + '</div></div>' +
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
    hints.push('<b>ЛКМ</b> по комнате — идти, по чужому — атака', '<b>Alt</b> названия комнат, неоновые номера на дверях и поиск', '<b>C</b> персонаж', '<b>F</b> к себе', '<b>Q/E</b> поворот', '<b>WASD</b> камера');
    // The build stamp sits at the end of the hint bar: one glance settles "are you looking at the
    // scene I just changed?" without opening the console.
    const stamp = window.__BUILD ? '<span class="buildtag" title="Версия сборки">сб. ' + window.__BUILD.slice(0, 6) + '</span>' : '';
    $('hintBar').innerHTML = hints.map(h => '<span>' + h + '</span>').join('<span>·</span>') + stamp;
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
/** The tile a room turned out to be, or a fixed one for the rooms whose kind is printed on the slot. */
function roomTileOf(v, id) {
    const rs = v.roomState[id], r = v.ship.rooms[id];
    if (!rs || !r) return null;
    return rs.tile || (r.kind === 'cockpit' ? 'cockpit' : r.kind === 'hibernatorium' ? 'hibernatorium' : r.kind === 'engine' ? 'engine' : null);
}
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
    // Escape pods of this section: how many there are, whether they are open and who sits inside.
    if (tile === 'evacA' || tile === 'evacB') {
        const sec = tile === 'evacA' ? 'A' : 'B';
        const pods = (v.pods || []).filter(p => p.section === sec);
        if (pods.length) html += '<div>🚀 ' + pods.map(p => '№' + p.num + ' — ' + (p.launched ? 'уже улетела' : p.removed ? 'разрушена'
            : (p.locked ? 'заперта' : 'открыта') + (p.occupants.length ? ', занято ' + p.occupants.length + '/2' : ''))).join(' · ') + '</div>';
    }
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
    if (!me) { scene.focusRoom(id); return; }
    // My own room: the one action that belongs to it, with what it does — a list, so a stray click
    // on the floor is confirmed by a second, deliberate press. The list opens even out of turn: the
    // single button then explains why it cannot be pressed, which is less puzzling than nothing.
    if (id === me.room) {
        const tile = roomTileOf(v, id), def = tile ? ROOM_TILES[tile] : null;
        const a = menuActionOf(menu, 'room');
        openWorldPop(roomLabel(id), def ? def.name : 'Комната ещё не исследована', [{
            label: 'Действие комнаты:', sub: def ? def.action : 'Сначала разведайте комнату',
            disabled: !a || !a.enabled, reason: a ? a.reason : 'Не ваш ход',
            do: () => act({ action: 'room' }),
        }], scene.screenOf('room', id));
        return;
    }
    if (!menu) { scene.focusRoom(id); return; }
    // A closed door does not make a neighbour unreachable: it opens on the way through (the same
    // rule the action list follows), so the click must offer the move exactly like the list does.
    const exit = (v.ship.rooms[me.room].exits || []).find(e => e.to === id);
    if (!exit) { scene.focusRoom(id); return; }   // not a neighbour: just look at it
    const mv = menuActionOf(menu, 'move'), cw = menuActionOf(menu, 'careful');
    openWorldPop('Идём в ' + roomLabel(id), 'Выберите, как идти', [
        { label: 'Идти', sub: mv ? (mv.cost ? mv.cost + ' карт(ы) · шум по броску' : '') : '', disabled: !mv || !mv.enabled, reason: mv && mv.reason, do: () => act({ action: 'move', dest: id }) },
        { label: 'Красться (осторожно)', sub: cw ? (cw.cost ? cw.cost + ' карт(ы) · выбрать коридор' : '') : '', disabled: !cw || !cw.enabled, reason: cw && cw.reason, do: () => act({ action: 'careful', dest: id }) },
    ], scene.screenOf('room', id));
}

/**
 * A click on a figure on the board. Someone else: the one action that touches another character.
 * Myself: passing and every item I carry, so a mis-click on my own figure costs nothing and the
 * press that follows is the confirmation of what I meant to do.
 */
function onPlayerClick(pid, px, py) {
    const v = app.view; if (!v) return;
    const me = myChar(), menu = turnMenuPrompt();
    const other = v.players.find(p => p.id === pid);
    if (!other) return;
    const anchor = scene.screenOf('char', pid) || (px ? { x: px, y: py } : null);
    if (pid === app.me && me) {
        const buttons = [];
        const pass = menuActionOf(menu, 'pass');
        buttons.push({ label: 'Спасовать', sub: 'закончить ход', disabled: !pass || !pass.enabled,
            reason: pass ? pass.reason : 'Не ваш ход', do: () => act({ action: 'pass' }) });
        const offered = new Map(((menu && menu.items) || []).map(i => [i.uid, i]));
        for (const inst of (me.items || [])) {
            const m = offered.get(inst.uid);
            buttons.push({
                label: itemLabel(inst) + (m && m.cost ? ' · ' + m.cost + ' 🂠' : ''),
                art: itemArt(inst.item),
                sub: m && m.cost ? 'применить (' + m.cost + ' карт)' : 'в инвентаре',
                disabled: !m || !m.enabled,
                reason: m ? m.reason : 'Не ваш ход',
                do: () => act({ action: 'item', itemId: inst.uid }),
            });
        }
        openWorldPop(me.name + (me.charName ? ' — ' + me.charName : ''), 'Выберите действие', buttons, anchor);
        return;
    }
    if (!me) { scene.focusRoom(other.room); return; }
    const a = menuActionOf(menu, 'trade');
    openWorldPop(other.name + (other.charName ? ' — ' + other.charName : ''), 'Передать предмет', [{
        label: 'Передать предмет', sub: a && a.cost ? a.cost + ' карт(ы)' : 'другому персонажу в комнате',
        disabled: !a || !a.enabled, reason: a ? a.reason : 'Не ваш ход', do: () => act({ action: 'trade' }),
    }], anchor);
}

/**
 * A click on the console of a room with a Computer: the three actions of the face-up Computer card,
 * offered where the player pointed, exactly like a click on a neighbouring room offers the ways to
 * walk there. The engine still has the last word — a blocked action is refused with its reason and
 * the usual list opens, and every option that costs a card asks for that card next.
 */
function onComputerClick(roomId, px, py) {
    const v = app.view; if (!v) return;
    const pr = v.prompt;
    // The engine is asking "where to?" — the console is inside that room, so answer it.
    if (pr && pr.kind === 'room' && !pr.waiting && pr.player === app.me && (pr.rooms || []).includes(roomId)) { act(roomId); return; }
    const me = myChar(), menu = turnMenuPrompt();
    if (!menu || !me || me.room !== roomId) { scene.focusRoom(roomId); return; }
    const a = menuActionOf(menu, 'computer');
    if (!a) { notice('В этой комнате нет компьютера.', 'info'); return; }
    if (!a.enabled) { notice(a.reason || 'Компьютер сейчас недоступен.', 'info'); return; }
    const card = v.computerCard, def = card ? COMPUTER_CARDS[card] : null;
    const opts = def && def.options ? Object.entries(def.options) : [];
    if (!opts.length) { act({ action: 'computer' }); return; }   // Lockdown: it resolves at once
    openWorldPop('Выберите компьютерное действие:', 'Компьютер — «' + def.name + '»', opts.map(([id, text]) => ({
        label: text,
        do: () => act({ action: 'computer', pick: id }),
    })), scene.screenOf('cpu', roomId) || { x: px, y: py });
}

/** The rules text of a weapon without «Дальнобойное оружие, N патронов.» — that part is already
 *  in the button line (name, ammo), and the rest is exactly "what the weapon does". */
function weaponEffect(d) {
    return String((d && d.text) || '').replace(/^Дальнобойное оружие[^.]*\.\s*/, '').trim();
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
        const bits = ['выстрел', d.weapon.noAmmo ? 'без патронов' : 'патронов ' + w.ammo];
        if (d.weapon.sniper && !inRoom) bits.push('снайперский');
        // What the weapon actually does, not just its name and ammo: the printed rules text minus
        // the «Дальнобойное оружие, N патронов.» preamble that repeats the ammo we already show.
        const eff = weaponEffect(d);
        buttons.push({ label: d.name, sub: bits.join(' · ') + (eff ? ' · ' + eff : ''),
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
    // When the choice is about things I already carry, the backpack is a valid (and prettier) way in.
    const inBag = itemPickMap(pr, myChar()).size;
    $('ipMin').textContent = '✕ Свернуть';
    let invBtn = $('ipInv');
    if (inBag) {
        if (!invBtn) { invBtn = document.createElement('button'); invBtn.id = 'ipInv'; invBtn.className = 'btn small'; $('ipMin').before(invBtn); }
        invBtn.textContent = '🎒 Из инвентаря';
        invBtn.onclick = () => openSheet();
    } else if (invBtn) invBtn.remove();
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
    // The game is over: the host starts a new one. It goes back to the lobby, where the map, the seed
    // and the draft can be changed — nothing is locked in after a finished game.
    $('restartBtn').textContent = app.host ? '🔄 Новая игра' : 'Закрыть';
    $('restartBtn').disabled = false;
    $('restartHint').textContent = app.host
        ? 'Вернёт всех в лобби — там можно сменить карту, зерно и драфт персонажей.'
        : 'Новую игру начнёт ведущий.';
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
    if (app.labWorkshop) {
        if (e.key === 'Escape') { e.preventDefault(); closeLabWorkshop(); }
        else if (e.key === 'Tab') {
            const buttons = [...$('labWorkshop').querySelectorAll('button:not(:disabled)')];
            if (buttons.length && e.shiftKey && document.activeElement === buttons[0]) { e.preventDefault(); buttons[buttons.length - 1].focus(); }
            else if (buttons.length && !e.shiftKey && document.activeElement === buttons[buttons.length - 1]) { e.preventDefault(); buttons[0].focus(); }
        }
        return;
    }
    const typing = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');
    if (e.key === 'Escape') {
        if (app.gallery) { closeGallery(); return; }
        if (closeWorldPop()) return;
        if (closeOverlay()) return;
        if (typing) { e.target.blur(); return; }
        // Esc = take back my own last step (the server allows it only inside my own turn).
        if (app.view && app.view.prompt && app.canUndo) { net.send({ t: 'undo', steps: 1, self: true }); Snd.play('click'); }
        else if (app.view) notice('Шаг назад недоступен: откатить можно только свой последний выбор в свой ход.', 'error');
        return;
    }
    // In the room gallery the same keys fly the camera around the test ship.
    if (app.gallery) {
        const g = { w: [0, 1], s: [0, -1], a: [-1, 0], d: [1, 0], ц: [0, 1], ы: [0, -1], ф: [-1, 0], в: [1, 0] }[e.key.toLowerCase()];
        if (g && galleryScene) { e.preventDefault(); galleryScene.panCam(g[0], g[1]); }
        else if (galleryScene && 'qQйЙ'.includes(e.key)) galleryScene.rotateCam(-Math.PI / 12);
        else if (galleryScene && 'eEуУ'.includes(e.key)) galleryScene.rotateCam(Math.PI / 12);
        return;
    }
    if (typing || !app.view) return;
    // Hold Alt: room names, neon corridor numbers on the doors and the Search item colours.
    if (e.key === 'Alt' && !app.altHeld) { e.preventDefault(); app.altHeld = true; if (scene) scene.setAlt(true); }
    // WASD pans the board; any camera move cancels a pending board question (like Esc).
    const wasd = { w: [0, 1], s: [0, -1], a: [-1, 0], d: [1, 0], ц: [0, 1], ы: [0, -1], ф: [-1, 0], в: [1, 0] }[e.key.toLowerCase()];
    if (wasd && scene) { closeWorldPop(); e.preventDefault(); scene.panCam(wasd[0], wasd[1]); }
    if (e.key === 'Tab') {
        e.preventDefault();
        if (!e.repeat) {
            const card = hoveredCardDesc();          // Tab over a card shows it to the whole table
            if (card) showCardToTable(card);
            else if (lastFloor && scene) net.send({ t: 'ping', x: lastFloor.x, z: lastFloor.z, room: lastFloor.room });
        }
    }
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
$('selfHud').onclick = () => openSheet();
// Hovering a name in the health HUD opens its card (wound text / suit art); leaving the HUD drops it.
$('selfHud').addEventListener('pointerover', e => {
    const slot = e.target && e.target.closest ? e.target.closest('.sh-slot, .sh-armor') : null;
    if (slot && !slot.classList.contains('empty')) showHudPop(slot); else hideHudPop();
});
$('selfHud').addEventListener('pointerleave', hideHudPop);

// ---------------------------------------------------------------------------------------------
// Top-bar popups (Computer, Adaptations)
// The bar itself scrolls sideways, and `overflow` clips every child that sticks out of it — the
// popups under "Компьютер" and "Адаптации чужих" were cut off by the bar's lower edge. The markup
// stays where it is (the bar is redrawn on every update), but the content is shown in #tbPop, a
// fixed layer under the element, so nothing can clip it.
// ---------------------------------------------------------------------------------------------
const TB_POP_PAD = 8;
function hideTbPop() { const el = $('tbPop'); el.classList.remove('show'); el.classList.add('hidden'); }
function showTbPop(tag) {
    const src = tag.querySelector('.ipop'); if (!src) return hideTbPop();
    const el = $('tbPop');
    el.innerHTML = src.innerHTML;
    el.classList.remove('hidden'); el.classList.add('show');
    const r = tag.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
    const x = Math.max(TB_POP_PAD, Math.min(window.innerWidth - w - TB_POP_PAD, r.left));
    let y = r.bottom + 6;
    if (y + h > window.innerHeight - TB_POP_PAD) y = Math.max(TB_POP_PAD, r.top - h - 6);   // flip above
    el.style.left = Math.round(x) + 'px'; el.style.top = Math.round(y) + 'px';
}
$('topbar').addEventListener('pointerover', e => {
    const tag = e.target && e.target.closest ? e.target.closest('.itag') : null;
    if (tag && $('topbar').contains(tag)) showTbPop(tag); else hideTbPop();
});
$('topbar').addEventListener('pointerleave', hideTbPop);
$('topbar').addEventListener('scroll', hideTbPop, { passive: true });

// ---------------------------------------------------------------------------------------------
// Character sheet (my backpack, weapons, quest item, wounds, suit, objectives, cards)
// ---------------------------------------------------------------------------------------------
function healthCells(p) {
    const groups = HP_SECTIONS.map((sec, si) => '<span class="hp-sec">' + sec.map(n => hpCell(p, si, n)).join('') + '</span>').join('');
    return '<div class="sheet-hp">' + groups + '<span class="hp-sec hp-last">' + LAST_CELL(p) + '</span>' + hpSkull(p) + '</div>';
}
// ---------------------------------------------------------------------------------------------
// Answering an item prompt straight from the inventory
// The engine offers prompt options by reference ("item:<uid>", "heavy:<idx>", "slot:<k>", or a bare
// uid for a weapon/item choice). Those references are matched against what lies in my backpack, so
// a click on the card in the character sheet is the same answer as a click on the option button.
// ---------------------------------------------------------------------------------------------
function itemPickMap(pr, me) {
    if (!pr || pr.kind !== 'choice' || pr.player !== app.me || pr.waiting || !Array.isArray(pr.options)) return new Map();
    const found = new Map();
    const set = (key, id) => { if (!key) return; if (!found.has(key)) found.set(key, new Set()); found.get(key).add(id); };
    const uids = new Set((me.items || []).map(i => i.uid));
    for (const o of pr.options) {
        if (o.disabled) continue;
        const id = String(o.id);
        const mItem = /(?:^|:)item:([^:]+)$/.exec(id);
        if (mItem) { set('item:' + mItem[1], id); continue; }                  // "item:<uid>" and "<target>:item:<uid>"
        const mHeavy = /^heavy:(\d+)$/.exec(id);
        if (mHeavy) { set('heavy:' + mHeavy[1], id); continue; }
        if (/^slot:\d+$/.test(id)) { set(id, id); continue; }                  // "which hand?"
        if (uids.has(id)) set('item:' + id, id);                               // a bare weapon/item uid
    }
    // A reference that answers several different options (e.g. "give it to A or to B") cannot be
    // clicked unambiguously: leave those to the ordinary option list.
    const map = new Map();
    for (const [key, ids] of found) if (ids.size === 1) map.set(key, [...ids][0]);
    return map;
}
/** Which hand holds what right now — the client-side mirror of the engine's handSlots(). */
function myHandSlots(me) {
    if (me.handSlots) return me.handSlots;
    const slots = [];
    for (const i of me.items || []) {
        const d = ITEMS[i.item]; if (!d || d.kind !== 'heavy') continue;
        if (d.bayonet && (me.items || []).some(o => ITEMS[o.item] && ITEMS[o.item].weapon)) continue;
        slots.push({ ref: 'item:' + i.uid, name: d.name, kind: 'item' });
        if (d.twoSlots) slots.push({ ref: null, name: d.name, kind: 'filler' });
    }
    for (const [idx, h] of (me.heavy || []).entries()) slots.push({ ref: 'heavy:' + idx, name: ({ corpse: 'Человеческий труп', charCorpse: 'Труп персонажа', carcass: 'Туша чужого', egg: 'Яйцо чужого' })[h.type] || h.type, kind: 'object' });
    const limit = (me.wounds || []).includes('arm') ? 1 : 2;
    while (slots.length < limit) slots.push({ ref: null, name: '', kind: 'empty' });
    return slots.slice(0, limit);
}
function sheetItemHtml(inst, picks) {
    const d = ITEMS[inst.item]; if (!d) return '';
    const art = itemArt(inst.item);
    const meta = [];
    meta.push(d.kind === 'heavy' ? 'тяжёлый предмет' : d.kind === 'armor' ? 'броня (костюм)' : 'лёгкий предмет');
    if (d.weapon) meta.push('патроны ' + (inst.ammo ?? 0) + '/' + d.weapon.max);
    if (d.markers !== undefined) meta.push('жетоны ' + (inst.charge ?? d.markers) + '/' + d.markers);
    if (inst.broken) meta.push('сломано');
    if (d.oneUse) meta.push('одноразовый');
    const opt = picks ? picks.get('item:' + inst.uid) : null;
    return '<div class="sheet-item' + (d.quest ? ' quest' : '') + (d.kind === 'armor' ? ' armor' : '') + (opt ? ' pickable' : '') + '" data-item="' + esc(inst.uid) + '"' +
        (opt ? ' data-pick="' + esc(opt) + '" title="Нажмите, чтобы выбрать этот предмет"' : '') + '>' +
        (art ? '<div class="si-art" style="background-image:url(' + art + ')"></div>' : '') +
        '<div><b>' + esc(d.name) + (d.quest ? ' · квестовый' : '') + '</b><small>' + esc(d.text || '') + '</small>' +
        '<small style="color:#8394a8">' + esc(meta.join(' · ')) + '</small></div>' +
        (opt ? '<span class="si-pick">Выбрать</span>' : '') + '</div>';
}
function openSheet(quiet) {
    const v = app.view; if (!v) return;
    const me = v.players.find(p => p.id === app.me);
    if (!me) { notice('Вы наблюдатель — своего персонажа нет.', 'error'); return; }
    const ch = CHARACTERS[me.charId] || {};
    const items = me.items || [];
    const pr = v.prompt;
    const picks = itemPickMap(pr, me);
    // Quest items are not starting gear: the sheet shows the card closed, with the room printed on
    // it, and opening costs the Action the menu offers. Only the android's UPS begins open.
    const quests = items.filter(i => ITEMS[i.item] && ITEMS[i.item].quest && !ITEMS[i.item].weapon);
    const closedQuests = (me.quests || []).filter(q => !q.open);
    const questMenu = pr && pr.player === me.id ? (pr.actions || []).find(a => a.id === 'quest') : null;
    const closedQuestHtml = closedQuests.map(q => {
        const d = ITEMS[q.item] || {};
        const where = !d.questRoom || d.questRoom === 'any' ? 'любая комната'
            : (ROOM_TILES[d.questRoom] ? ROOM_TILES[d.questRoom].name : d.questRoom);
        const pay = d.questBlue ? 'бесплатно (синяя комната)' : 'сбросьте 1 жетон';
        const art = itemArt(q.item);
        const open = !!(questMenu && questMenu.enabled);
        return '<div class="sheet-item quest closed' + (open ? ' pickable' : '') + '"' + (open ? ' data-pick="quest"' : '') +
            ' title="' + esc(open ? 'Нажмите, чтобы открыть: это стоит 1 действие' : (questMenu && questMenu.reason) || 'Закрыт: откроется по правилам карты') + '">' +
            (art ? '<div class="si-art" style="background-image:url(' + art + ')"></div>' : '') +
            '<div><b>' + esc(d.name || q.item) + ' · закрыт 🔒</b>' +
            '<small>' + esc(d.text || '') + '</small>' +
            '<small style="color:#8394a8">Активация: ' + esc(where) + ' · ' + esc(pay) + ' · 1 действие</small>' +
            ((questMenu && !questMenu.enabled && questMenu.reason) ? '<small style="color:#e2a33f">' + esc(questMenu.reason) + '</small>' : '') +
            '</div>' + (open ? '<span class="si-pick">Открыть</span>' : '') + '</div>';
    }).join('');
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
    const heavy = (me.heavy || []).map((h, idx) => {
        const opt = picks.get('heavy:' + idx);
        return '<div class="sheet-item' + (opt ? ' pickable' : '') + '"' + (opt ? ' data-pick="' + esc(opt) + '" title="Нажмите, чтобы выбрать этот объект"' : '') + '><div><b>' +
            ({ corpse: 'Человеческий труп', charCorpse: 'Труп персонажа', carcass: 'Туша чужого', egg: 'Яйцо чужого' })[h.type] +
            '</b><small>Тяжёлый объект · занимает слот рук</small></div>' + (opt ? '<span class="si-pick">Выбрать</span>' : '') + '</div>';
    }).join('');
    // Hands: what is in each slot right now (a slot prompt can be answered by clicking the row).
    const slotRows = myHandSlots(me);
    const hands = slotRows.length ? '<div class="sheet-slot-row">' + slotRows.map((sl, k) => {
        const opt = picks.get('slot:' + k);
        const nm = sl.kind === 'empty' ? 'пусто' : sl.name;
        const fill = sl.kind === 'filler' ? ' (вторая рука)' : '';
        return '<div class="sheet-slot ' + sl.kind + (opt ? ' pickable' : '') + '"' + (opt ? ' data-pick="' + esc(opt) + '" title="Нажмите, чтобы положить объект в этот слот"' : '') + '>' +
            '<i>Слот ' + (k + 1) + '</i><b>' + esc(nm) + fill + '</b>' + (opt ? '<span class="si-pick">Выбрать</span>' : '') + '</div>';
    }).join('') + '</div>' : '';
    const pickHint = picks.size ? '<div class="sheet-pick-hint">🖱 Сейчас движок ждёт выбора: нажмите на подсвеченный предмет или слот руки — это и будет ответом. Остальные предметы можно рассмотреть спокойно.</div>' : '';
    $('sheetBody').innerHTML =
        '<div class="sheet-head"><div><h2>' + esc(me.name) + '</h2><div class="sub">' + esc(me.charName) +
        (me.number ? ' · игрок №' + me.number : '') + ' · ' + esc(statusName(me) || 'на борту') + ' · 📍 ' + esc(roomLabel(me.room)) + '</div></div>' +
        healthCells(me) + '<div class="sheet-chips">' + chips.join('') + '</div></div>' +
        '<div class="sheet-decks"><button class="btn small" data-sheet-deck="own" title="Колода закрыта: видно только количество">🂠 Колода действий · ' + me.deckCount + '</button>' +
        '<button class="btn small" data-sheet-deck="owndisc" title="Открыть мой сброс">⤵ Сброс · ' + me.discardCount + '</button>' +
        (me.contamInDiscard ? '<button class="btn small danger" data-sheet-deck="owndisc">☣ заражений в сбросе: ' + me.contamInDiscard + '</button>' : '') + '</div>' +
        pickHint +
        '<div class="sheet-cols">' +
        (hands ? '<div class="sheet-sec"><h4>🖐 Руки</h4>' + hands + '</div>' : '') +
        '<div class="sheet-sec"><h4>🎯 Цели · что даёт выполнение</h4>' + (objs || '<div class="empty">Цель ещё не выбрана — выберите бесплатным действием.</div>') + '</div>' +
        '<div class="sheet-sec"><h4>🏆 Квестовые предметы</h4><div class="sheet-items">' + (closedQuestHtml + quests.map(i => sheetItemHtml(i, picks)).join('') || '<div class="empty">Нет квестовых предметов.</div>') + '</div>' +
        (closedQuests.length ? '<div class="empty" style="margin-top:6px">Закрытая карта ждёт действия «Открыть квестовый предмет» в комнате, напечатанной на ней. Карта «Инструменты» открывает её где угодно.</div>' : '') + '</div>' +
        '<div class="sheet-sec"><h4>🎒 Рюкзак · оружие</h4><div class="sheet-items">' + (weapons.map(i => sheetItemHtml(i, picks)).join('') || '<div class="empty">Оружия нет.</div>') + '</div></div>' +
        '<div class="sheet-sec"><h4>📦 Предметы и костюм</h4><div class="sheet-items">' + (armor + gear.map(i => sheetItemHtml(i, picks)).join('') + heavy || '<div class="empty">Пусто.</div>') + '</div></div>' +
        '<div class="sheet-sec"><h4>🩸 Травмы</h4>' + (wounds || '<div class="empty">Травм нет.</div>') + '</div>' +
        '<div class="sheet-sec" style="grid-column:1/-1"><h4>🂠 Карты в руке · ' + (me.hand || []).length + '</h4><div class="sheet-hand">' + hand + '</div></div>' +
        '</div>';
    for (const b of $('sheetBody').querySelectorAll('[data-sheet-deck]')) b.onclick = () => openDeck(b.dataset.sheetDeck);
    for (const b of $('sheetBody').querySelectorAll('[data-pick]')) b.onclick = () => { const id = b.dataset.pick; $('sheetOverlay').classList.add('hidden'); act(id); };
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
    computer: 'Компьютер · сброс', feats: 'Подвиги · запас', own: 'Моя колода', owndisc: 'Мой сброс карт действий' };
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
    if (kind === 'feats') {
        // The shared Feat pool: after keeping an Objective a player takes one Feat, resolves it and the
        // card leaves the game. Both parts are public, so the viewer shows the pool and what is gone.
        const pool = v.feats || [], used = v.featsUsed || [];
        for (const k of pool) if (FEATS[k]) list.push({ name: FEATS[k].name, text: FEATS[k].text, tag: 'в запасе', art: 'art/feat/' + k + '.jpg' });
        for (const k of used) if (FEATS[k] && !pool.includes(k)) list.push({ name: FEATS[k].name, text: FEATS[k].text, tag: 'выбыл из игры', art: 'art/feat/' + k + '.jpg', gone: true });
        return {
            note: 'Подвиги — общий запас команды на всю партию: после выбора цели вы берёте из него один подвиг, сразу разыгрываете его (или убираете без розыгрыша) — и карта уходит из игры. В запасе: ' + pool.length + ' из ' + (pool.length + used.length) + '.',
            cards: list,
        };
    }
    return { note: '', cards: list };
}
function openDeck(kind, quiet) {
    const v = app.view; if (!v) return;
    app.deckKind = kind || 'event';
    const me = v.players.find(p => p.id === app.me);
    const tabs = ['event', 'attack', 'queen', 'wound', 'green', 'red', 'yellow', 'support', 'computer', 'feats', 'own', 'owndisc'];
    const counts = { event: (v.piles && v.piles.event || []).length, attack: (v.piles && v.piles.attack || []).length, queen: (v.piles && v.piles.queen || []).length,
        wound: (v.piles && v.piles.wound || []).length, computer: (v.piles && v.piles.computer || []).length,
        green: ((v.piles && v.piles.items && v.piles.items.green) || []).length, red: ((v.piles && v.piles.items && v.piles.items.red) || []).length,
        yellow: ((v.piles && v.piles.items && v.piles.items.yellow) || []).length, support: ((v.piles && v.piles.items && v.piles.items.support) || []).length,
        feats: (v.feats || []).length,
        own: me ? me.deckCount : 0, owndisc: me ? me.discardCount : 0 };
    const { note, cards } = deckList(app.deckKind, v, me);
    const box = $('deckOverlay').querySelector('.help-box'); const keep = quiet && box ? box.scrollTop : 0;
    $('deckTitle').textContent = DECK_TITLES[app.deckKind] || 'Колоды';
    $('deckBody').innerHTML = '<div class="deck-tabs">' + tabs.map(k => '<button class="btn small' + (k === app.deckKind ? ' active' : '') + '" data-deck="' + k + '">' + esc(DECK_TITLES[k].split(' · ')[0]) + ' (' + (counts[k] || 0) + ')</button>').join('') + '</div>' +
        (note ? '<div class="hint" style="margin-bottom:8px">' + esc(note) + '</div>' : '') +
        (cards.length ? '<div class="deck-grid">' + cards.map(c => '<div class="deck-card' + (c.art ? ' has-art' : '') + (c.gone ? ' gone' : '') + '">' +
            (c.art ? '<i class="dart" style="background-image:url(' + esc(c.art) + ')"></i>' : '') +
            (c.tag ? '<span class="tag">' + esc(c.tag) + '</span>' : '') + '<b>' + esc(c.name) + '</b><small>' + esc(c.text || '') + '</small></div>').join('') + '</div>'
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
<h4>Спасательные капсулы</h4><p>Их количество зависит от числа игроков: 1–2 игрока — 2 капсулы, 3–4 — 3, 5 — 4; они раскладываются по секциям A и B по кругу (№1 в A, №2 в B и так далее) и до поры заперты. Состояние капсул всегда видно в верхней строке (№ · секция · 🔒/🔓/🚀 · занято n/2), а сами капсулы стоят в эвакуационных отсеках, как только отсек разведан. Отпираются они после первой гибели персонажа или когда самоуничтожение доходит до жёлтой зоны; ключ эвакуации и контроль шлюзов могут переключать замок. В отсеке: бросок шума, затем посадка (до 2 человек), старт — и вы вне корабля.</p>
<h4>Конец игры</h4><p>Когда время дойдёт до 0 (или сработает самоуничтожение/капсулы): проверяются двигатели (нужно ≥2 исправных), пункт назначения (A–D по тайной карте координат), заражение всех карт выживших и цели.</p>
<h4>Управление</h4><p>ЛКМ по комнате — идти (спросит «идти или красться»), по чужому — атака своим оружием или ближний бой, по тяжёлому объекту — в какую руку взять. Нажатие мимо окна, <b>Esc</b> или <b>WASD</b> отменяют вопрос. WASD — панорама, ПКМ/СКМ — поворот камеры, колесо — масштаб. Наведите на комнату — подсказка.</p>
<h4>Горячие клавиши</h4><p><b>Esc</b> — закрыть окно или вернуть свой последний шаг (пока вы выбираете действие). <b>Alt</b> (удерживать) — названия комнат, неоновые номера на дверях коридоров и цвета поиска над комнатами. <b>C</b> — планшет персонажа, <b>F</b> — к своей комнате, <b>Tab</b> — пинг по столу (а если курсор над картой в руке или предметом — показать эту карту всем на 5 секунд, потом она останется в чате), <b>Q</b>/<b>E</b> — повернуть камеру, <b>Enter</b> — подтвердить выбранные карты, <b>1…9</b> — нажать кнопку в окне выбора.</p>
<h4>Выбор предмета</h4><p>Когда движок просит выбрать предмет (что сбросить, каким оружием стрелять, что передать, в какую руку взять объект), ответить можно тремя способами: кнопкой в списке, в центральном окне с картинками — или <b>прямо в планшете персонажа</b> (клавиша C): нужные предметы и слоты рук подсвечиваются и нажимаются, кнопка «🧍 Персонаж» в это время мигает. Удобно, когда предметов много и по картинке понятнее, чем по названию.</p>
<h4>Мешок и события</h4><p>Жетон из мешка тянет сам игрок — нажмите на мешок или на большую кнопку; внизу появится, <i>зачем</i> тянули и что вытянули. Карта события остаётся на столе, пока каждый не нажмёт «Готово».</p>
<h4>Колоды и сбросы</h4><p>Любая стопка внизу справа (и кнопка «🃏 Колоды») открывает просмотр: события, атаки чужих, карты здоровья Королевы, тяжёлые травмы, сбросы предметов, компьютер и ваш собственный сброс. Вкладка <b>«Подвиги»</b> показывает общий запас одноразовых карт, которые вы получите за выбор цели: что ещё в запасе и что уже выбыло из игры.</p>
<h4>Откат</h4><p>Ведущий (👑) может откатить любое количество действий кнопкой «⟲ Откатить ход» — все получают уведомление.</p>`;

net.connect();
