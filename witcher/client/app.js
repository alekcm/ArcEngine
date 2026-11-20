// Client entry: connection and reconnect, message routing, event feedback (sound, banners,
// camera), hotkeys. Rendering lives in lobby.js, hud.js, prompt.js, fight.js, poker.js; the 3D
// table in board.js.
import { S, $, send, cmd, toast, banner, me } from './ctx.js';
import { Store } from './store.js';
import { Board } from './board.js';
import { loadArtIndex, esc } from './cards.js';
import { renderLobby, closeLobbyPreview } from './lobby.js';
import { renderHud, renderChat, startMove, confirmMove, cancelMove, mapTip, phase2, doLocAction, renderRow, openHelp } from './hud.js';
import { renderPrompt, promptKey, initZoom } from './prompt.js';
import { renderFight, fightKey, fightEvents, fightStarted } from './fight.js';
import { renderPoker, pokerKey } from './poker.js';
import { sfx } from './sound.js';
import { MONSTER, LOC } from '/shared/engine/util.mjs';
import { SCHOOLS } from '/shared/data/rules-data.mjs';
import { EVENTS } from '/shared/data/events-data.mjs';
import { MUTAGEN } from '/shared/data/trail-data.mjs';

let board = null;
function ensureBoard() {
    if (board) return board;
    board = S.board = new Board($('scene'), {
        onHover: (loc, x, y) => mapTip(loc, x, y),
        onClick: (loc) => {
            if (!S.view || S.view.fight || S.view.prompt) return;
            if (!startMove(loc)) { board.focus(loc, 8); }
        },
    });
    return board;
}

// ---------------------------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------------------------
let retry = 0;
function connect() {
    const ws = S.ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
    ws.onopen = () => { retry = 0; send({ t: 'join', token: S.token, name: S.name }); };
    ws.onmessage = (ev) => { let m; try { m = JSON.parse(ev.data); } catch { return; } onMessage(m); };
    ws.onclose = () => {
        S.ws = null;
        toast('Соединение потеряно — переподключаюсь…', 'info');
        setTimeout(connect, Math.min(5000, 500 * ++retry));
    };
}

function onMessage(m) {
    switch (m.t) {
        case 'welcome':
            if (m.build && window.__BUILD && m.build !== window.__BUILD) { location.reload(); return; }
            S.you = m.seat; if (m.token) { S.token = m.token; Store.set('token', m.token); }
            break;
        case 'lobby':
            S.lobby = m;
            if (m.phase === 'lobby') { S.view = null; $('hud').classList.add('hidden'); hideGameLayers(); }
            renderLobby();
            break;
        case 'state': onState(m); break;
        case 'error': toast(m.err); break;
        case 'notice': toast(m.text, 'info'); break;
        case 'chat': S.chat.push(m.msg); renderChat(); if (S.ui.tab !== 'chat') toast(`${m.msg.from}: ${m.msg.text}`, 'info'); break;
        case 'reset': S.view = null; hideGameLayers(); break;
    }
}
function hideGameLayers() {
    for (const id of ['fight', 'poker', 'modal', 'pay', 'gameover']) $(id).classList.add('hidden');
}

function onState(m) {
    const prev = S.view;
    S.view = m.view; S.options = m.options; S.you = m.you; S.host = m.host; S.undo = m.undo;
    if (m.chat && !S.chat.length) { S.chat = m.chat; renderChat(); }
    $('lobby').classList.add('hidden'); closeLobbyPreview();
    $('hud').classList.remove('hidden');
    const b = ensureBoard();
    const v = S.view;
    const events = v.events || [];
    // Fight bookkeeping (the engine clears state.fight at the end; keep a result screen).
    if (v.fight && (!prev || !prev.fight)) fightStarted(v);
    for (const e of events) if (e.k === 'fightEnd') S.ui.fightResult = { result: e.result, mon: e.mon, seat: e.seat };
    if (S.ui.pay && (!S.options || !S.options.moves.some(x => x.to === S.ui.pay.to))) S.ui.pay = null;

    b.syncWitchers(v.players);
    b.syncMonsters(v.slots);
    const markers = [];
    for (const p of v.players) p.hunts.forEach((h, i) => markers.push({ key: `h${p.seat}-${h.loc}`, loc: h.loc, color: SCHOOLS[p.school].color, i }));
    for (const p of v.players) (p.quests || []).forEach((q, i) => { for (const loc of q.locs || [q.loc]) markers.push({ key: `q${p.seat}-${q.id}-${loc}`, loc, color: SCHOOLS[p.school].color, i: i + p.hunts.length, quest: true }); });
    // Quest tokens that spring on the other players («Цири и доп. события»).
    for (const tr of v.traps || []) markers.push({ key: `t${tr.id}`, loc: tr.loc, color: SCHOOLS[v.players[tr.owner].school].color, i: 3 + markers.filter(m => m.loc === tr.loc).length, quest: true });
    // «Уязвимости и особые атаки»: face-down vulnerability tokens (a dark-red hexagon).
    for (const vt of v.vulnBoard || []) markers.push({ key: `v${vt.terrain}-${vt.loc}`, loc: vt.loc, color: '#8a2a22', vuln: true });
    b.syncMarkers(markers);
    const myMoves = S.options && S.options.acting && !v.fight && !v.prompt ? S.options.moves.map(x => x.to) : [];
    b.setMoveTargets(myMoves, v.turn ? v.players[v.turn.seat].loc : null);

    renderHud();
    renderPrompt();
    renderFight();
    renderPoker(events);
    renderGameOver();
    feedback(events, prev);
}

function feedback(events, prev) {
    const v = S.view;
    for (const e of events) {
        switch (e.k) {
            case 'turn':
                if (e.seat === S.you) { banner('Ваш ход', `Раунд ${v.round}`); sfx('turn'); }
                else if (board && prev) board.focus(v.players[e.seat].loc, 9);
                break;
            case 'move': sfx('step'); break;
            case 'draw': if (e.seat === S.you) sfx('draw'); break;
            case 'gain': sfx('card'); break;
            case 'skill': sfx('shield'); break;
            case 'level': if (e.seat === S.you) banner('Новый уровень', `Уровень ведьмака ${e.v}`); break;
            case 'fightStart': banner('Битва', `${v.players[e.seat].name} против: ${MONSTER[e.mon].name}`, 1800); sfx('roar'); break;
            case 'fightEnd': sfx(e.result === 'lose' ? 'lose' : 'win'); break;
            case 'trophy': sfx('trophy'); if (e.seat !== S.you) toast(`${v.players[e.seat].name} получает трофей (${e.track}/4)`, 'info'); break;
            case 'spawn': if (board && prev) setTimeout(() => board.focus(e.loc, 9), 400); break;
            case 'elixir': if (e.seat === S.you) sfx('elixir'); break;
            case 'undo': toast('Действие отменено', 'info'); break;
            case 'win': sfx('win'); break;
            case 'hunt': sfx('coin'); break;
            case 'explore': sfx('card'); break;
            case 'gold': sfx('coin'); break;
            case 'gear': sfx('trophy'); if (e.seat === S.you) banner(EVENTS[e.id] ? EVENTS[e.id].kind + ' — ' + EVENTS[e.id].name : 'Снаряжение', 'Карта остаётся у вас до конца игры', 1800); break;
            case 'keep': sfx('card'); if (e.seat === S.you) banner(e.name, 'Карта лежит перед вами', 1600); break;
            case 'quest': sfx('card'); if (board && prev) setTimeout(() => board.focus(e.loc, 9), 300); break;
            case 'questDone': sfx('trophy'); break;
            case 'd6': sfx('dice'); break;
            case 'mutagenGain': sfx('elixir'); if (e.seat === S.you && MUTAGEN[e.id]) banner('Мутаген — ' + MUTAGEN[e.id].name, 'Срабатывает раз за битву', 1800); break;
            case 'mutagen': sfx('elixir'); if (MUTAGEN[e.id]) toast(`${v.players[e.seat].name}: ${MUTAGEN[e.id].name}`, 'info'); break;
        }
    }
    fightEvents(events);
}

function renderGameOver() {
    const v = S.view, el = $('gameover');
    if (!v || v.stage !== 'over') { el.classList.add('hidden'); return; }
    if (el.dataset.closed === String(v.round)) return;
    const w = v.winner != null ? v.players[v.winner] : null;
    const rank = v.soloRank ? `<p style="font-size:18px">${esc(v.soloRank)}</p>` : '';
    el.innerHTML = `<div class="box"><h1>${w ? (w.seat === S.you ? 'Победа!' : esc(w.name) + ' побеждает') : 'Игра окончена'}</h1>
        ${w ? `<p>${esc(SCHOOLS[w.school].school)} собирает ${w.track} трофея за ${w.turns} ход(ов).</p>` : ''}${rank}
        <div style="display:flex;gap:10px;justify-content:center;margin-top:14px">
        <button class="btn" id="goClose">Посмотреть стол</button>${S.host ? '<button class="btn primary" id="goNew">Новая партия</button>' : ''}</div></div>`;
    el.classList.remove('hidden');
    $('goClose').onclick = () => { el.dataset.closed = String(v.round); el.classList.add('hidden'); };
    const n = $('goNew'); if (n) n.onclick = () => send({ t: 'newGame' });
}

// ---------------------------------------------------------------------------------------------
// Hotkeys
// ---------------------------------------------------------------------------------------------
window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
        if (e.key === 'Enter' && e.target.id === 'chatInput') return;
        if (e.key !== 'Escape') return;
    }
    if (!S.view) { if (e.key === 'Enter' && $('lStart')) $('lStart').click(); return; }
    for (const id of ['viewer', 'help']) if (!$(id).classList.contains('hidden') && e.key === 'Escape') { $(id).classList.add('hidden'); return; }
    if (e.key === 'F1') { e.preventDefault(); openHelp(); return; }
    if (pokerKey(e)) { e.preventDefault(); return; }
    if (promptKey(e)) { e.preventDefault(); return; }
    if (fightKey(e)) { e.preventDefault(); return; }
    if (S.ui.pay) {
        if (e.key === 'Enter') { confirmMove(); return; }
        if (e.key === 'Escape') { cancelMove(); return; }
    }
    const k = e.key.toLowerCase();
    if ((k === 'z' || k === 'я') && (e.ctrlKey || !e.altKey)) { send({ t: 'undo' }); return; }
    if (k === 'r' || k === 'к') { S.ui.rowOpen = !S.ui.rowOpen; renderRow(S.view); return; }
    if (e.key === 'Home') { board && board.focus(null); return; }
    if (e.key === ' ') { e.preventDefault(); const p = S.view.turn ? S.view.players[S.view.turn.seat] : me(); if (p && board) board.focus(p.loc, 7.5); return; }
    if (!S.options || !S.options.acting || S.view.fight || S.view.prompt) return;
    // Physical keys (any layout). W/A/S/D are reserved for panning the camera (board.js).
    const c = e.code;
    if (c === 'KeyT') doLocAction();
    else if (c === 'KeyF') phase2('fight');
    else if (c === 'KeyM') phase2('meditate');
    else if (c === 'KeyE') phase2(S.options.phase2.some(x => x.id === 'skipPhase2') ? 'skipPhase2' : 'endExplore');
    else if (c === 'KeyQ') { const q = S.options && (S.options.quests || []).find(x => !x.err); if (q) cmd({ t: 'quest', i: q.i }, 'задание'); }
});

// Side tabs and chat
for (const b of document.querySelectorAll('#side .tabs button')) b.onclick = () => {
    S.ui.tab = b.dataset.tab;
    for (const x of document.querySelectorAll('#side .tabs button')) x.classList.toggle('on', x === b);
    $('log').classList.toggle('hidden', S.ui.tab !== 'log');
    $('chat').classList.toggle('hidden', S.ui.tab !== 'chat');
    $('chatForm').classList.toggle('hidden', S.ui.tab !== 'chat');
};
$('chatForm').onsubmit = (e) => { e.preventDefault(); const i = $('chatInput'); if (i.value.trim()) send({ t: 'chat', text: i.value }); i.value = ''; };

// Debug/test hook (headless screenshots): window.__witcher.
initZoom();
window.__witcher = { S, send, startMove, confirmMove, phase2, get board() { return board; } };

loadArtIndex().then(connect);
