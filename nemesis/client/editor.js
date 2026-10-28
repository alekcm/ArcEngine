// editor.js — the Nemesis board editor page (client/editor.html), opened by "editor.bat nemesis".
//
// It builds the same ship the game builds — the full test ship from shared/ship.mjs, every room and
// every corridor door — and lets a designer move the numbers that used to need a code change: the
// door frame, the beam, the stencil on it, the colours, the emergency lamps. Every control edits
// client/tuning.js's table and rebuilds the scene; "Save" writes client/tuning.json, which the game
// and the lobby gallery read at boot (see Scene3D.update -> tuning.js).

import { Scene3D } from './scene3d.js';
import { ROOM_TILES, galleryShip } from '/shared/ship.mjs';
import { INTRUDER_NAMES } from '/shared/data/cards.mjs';
import { TUNE, SCHEMA } from './tuning.js';

const $ = (id) => document.getElementById(id);

let scene = null, ship = null, view = null, rebuildTimer = null;

/** The gallery view: all rooms known and explored, no players, no intruders. */
function galleryView(s) {
    const roomState = {};
    for (const r of Object.values(s.rooms)) {
        roomState[r.id] = { tile: s.galleryTiles[r.id], explored: true, fire: false, malfunction: false, objects: [], token: null };
    }
    return {
        ship: s, roomState, players: [], intruders: {}, fx: [], pods: [], podsUnlocked: true,
        nestEggs: 5, time: 15, selfDestruct: 0, destination: 'B', current: null, phase: 'gallery', lastShot: null,
    };
}

const fmt = (v) => (typeof v === 'number' ? (Math.abs(v) >= 10 ? v.toFixed(0) : v.toFixed(2)) : v);

function status(text, bad) {
    const el = $('status');
    el.textContent = text || '';
    el.classList.toggle('bad', !!bad);
}

// ---------------------------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------------------------
async function boot() {
    if (!window.BABYLON) { status('Браузер не загрузил 3D-движок (WebGL). Открой страницу заново.', true); return; }
    await loadOverrides();
    ship = galleryShip();
    view = galleryView(ship);
    scene = new Scene3D($('scene'), { onHover: id => { $('scene').style.cursor = id ? 'pointer' : ''; } });
    scene.gallery = true;                     // room names instead of ids, as in the gallery
    scene.setActive(true);
    scene.update(view, ROOM_TILES, INTRUDER_NAMES, []);
    scene.camera.alpha = -Math.PI / 2;
    scene.camera.beta = 0.85;
    fitAll();
    buildPanel();
    hookKeys();
}

/** tuning.json is written by this page; a fresh checkout has none and that is fine. */
async function loadOverrides() {
    try {
        const r = await fetch('/api/tuning', { cache: 'no-store' });
        if (!r.ok) return;
        const j = await r.json();
        TUNE.load(j.values || j);
        if (TUNE.changed()) status('Загружены сохранённые правки.');
    } catch { /* no file yet */ }
}

function rebuildSoon() {
    clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(() => { if (scene) scene.rebuild(view, ROOM_TILES, INTRUDER_NAMES, []); }, 120);
}

// ---------------------------------------------------------------------------------------------
// Camera helpers
// ---------------------------------------------------------------------------------------------
function fitAll() {
    if (!scene) return;
    const b = ship.bounds;
    const w = (b.maxX - b.minX) * 0.1, h = (b.maxY - b.minY) * 0.1;
    scene.flyTo(new (window.BABYLON.Vector3)(0, 0, 0), Math.max(110, Math.max(w, h) * 1.3));
}

/** Look at the first corridor door — the thing these sliders mostly move. */
function focusDoor() {
    if (!scene) return;
    const n = Object.values(scene.corridorNodes).find(c => c.door);
    if (!n) { status('Двери ещё не построены.', true); return; }
    const p = n.door.getAbsolutePosition();
    scene.flyTo(new (window.BABYLON.Vector3)(p.x, 1.4, p.z), 26);
}

// ---------------------------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------------------------
function buildPanel() {
    const root = $('groups');
    root.innerHTML = '';
    for (const g of SCHEMA) {
        const box = document.createElement('section');
        box.className = 'group';
        const title = document.createElement('h2');
        title.textContent = g.title;
        box.appendChild(title);
        for (const it of g.items) box.appendChild(field(g.id + '.' + it.key, it));
        root.appendChild(box);
    }
}

function field(key, it) {
    const row = document.createElement('label');
    row.className = 'field';
    row.dataset.key = key;
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = it.label;
    row.appendChild(name);

    if (typeof it.v === 'string') {
        const color = document.createElement('input');
        color.type = 'color';
        color.value = TUNE.color(key);
        color.oninput = () => { TUNE.set(key, color.value); rebuildSoon(); };
        row.appendChild(color);
    } else {
        const out = document.createElement('output');
        out.textContent = fmt(TUNE.get(key));
        const range = document.createElement('input');
        range.type = 'range';
        range.min = it.min; range.max = it.max; range.step = it.step;
        range.value = TUNE.get(key);
        range.oninput = () => { TUNE.set(key, Number(range.value)); out.textContent = fmt(TUNE.get(key)); rebuildSoon(); };
        row.appendChild(out);
        row.appendChild(range);
    }
    return row;
}

// ---------------------------------------------------------------------------------------------
// Save / reset
// ---------------------------------------------------------------------------------------------
async function save() {
    const btn = $('save');
    btn.disabled = true;
    try {
        const r = await fetch('/api/tuning', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ values: TUNE.diff() }),
        });
        const j = await r.json().catch(() => ({}));
        if (r.ok) status('Сохранено: ' + (j.saved || 0) + ' правок в nemesis/client/tuning.json. Перезапусти игру — они уже там.');
        else status('Не сохранилось: ' + (j.error || ('HTTP ' + r.status)), true);
    } catch (e) {
        status('Сервер не отвечает: ' + (e && e.message ? e.message : e), true);
    }
    btn.disabled = false;
}

function reset() {
    TUNE.reset();
    buildPanel();
    rebuildSoon();
    status('Возвращены значения из кода — нажми «Сохранить», чтобы стереть правки и на диске.');
}

// ---------------------------------------------------------------------------------------------
// Keys: Alt is the neon overlay the game uses, F fits the board, D flies to a door
// ---------------------------------------------------------------------------------------------
function hookKeys() {
    addEventListener('keydown', (e) => {
        if (e.key === 'Alt') { e.preventDefault(); if (scene) scene.setAlt(true); }
        else if (!e.ctrlKey && !e.metaKey && (e.key === 'f' || e.key === 'F' || e.key === 'а' || e.key === 'А')) fitAll();
        else if (!e.ctrlKey && !e.metaKey && (e.key === 'd' || e.key === 'D' || e.key === 'в' || e.key === 'В')) focusDoor();
    });
    addEventListener('keyup', (e) => { if (e.key === 'Alt') { if (scene) scene.setAlt(false); } });
    addEventListener('blur', () => { if (scene) scene.setAlt(false); });
}

$('save').onclick = save;
$('reset').onclick = reset;
$('fit').onclick = fitAll;
$('door').onclick = focusDoor;

boot().catch((e) => { console.error(e); status('Не удалось построить доску: ' + (e && e.message ? e.message : e), true); });
