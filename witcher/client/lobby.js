// Lobby: name, school (with a rotating miniature preview), seats with bots, host settings,
// expansions, saved games, LAN addresses.
import { S, $, send, btn } from './ctx.js';
import { Store } from './store.js';
import { icon } from './icons.js';
import { esc } from './cards.js';
import { SCHOOLS, SCHOOL_ORDER, GAME_MODES, HOUSE_RULES } from '/shared/data/rules-data.mjs';
import { Preview } from './board.js';

let preview = null;
const SCHOOL_TEXT = {
    wolf: 'Эрим. «Владение мечом»: после комбинации из 3+ карт — дополнительный урон и добор.',
    cat: 'Кайлар. «Прыть»: в первый ход битвы — посмотреть верх колоды и взять карты.',
    bear: 'Ауфар. «Доспехи»: когда щит падает до 0 — щит и добор.',
    viper: 'Джаспер. «Отравленный клинок»: когда противник сбрасывает карты — сбросить ещё.',
    griffin: 'Годрик. «Магия»: Знак любого цвета продолжает комбинацию.',
};
const EXPANSIONS = [
    ['legendary', 'Легендарная охота', 'легендарные монстры и снаряжение'],
    ['skellige', 'Скеллиге', 'острова 19–21, корабли и новые события'],
    ['mages', 'Чародеи', 'играбельные чародеи'],
    ['ciri', 'Цири и доп. события', 'Цири и новые колоды событий'],
    ['trail', 'По следу монстра', 'выслеживание монстров'],
    ['extra', 'Дополнительный монстр', 'новый монстр'],
];

export function renderLobby() {
    const L = S.lobby, el = $('lobby');
    if (!L || L.phase !== 'lobby') { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    const mySeat = L.seats[S.you];
    const isHost = mySeat && mySeat.host;
    const mySchool = mySeat ? mySeat.school : 'wolf';
    const taken = new Set(L.seats.filter((s, i) => i !== S.you).map(s => s.school));
    const schools = Object.entries(SCHOOLS).map(([k, sc]) => {
        const base = sc.base;
        const cls = k === mySchool ? 'sel' : (taken.has(k) || !base) ? 'taken' : '';
        return `<div class="school ${cls}" data-school="${k}" style="--sc:${sc.color}" ${!base ? 'title="Школа из дополнения — появится вместе с ним"' : ''}><b>${esc(sc.school)}</b><small>${esc(SCHOOL_TEXT[k] || (base ? '' : 'Дополнение — скоро'))}</small></div>`;
    }).join('');
    const seats = L.seats.map(s => `<div class="seat" style="--sc:${SCHOOLS[s.school].color}"><span class="dot"></span><span class="nm">${s.bot ? icon('bot') + ' ' : ''}${esc(s.name)}</span><span class="tag ${s.host ? 'host' : ''}">${s.host ? 'хозяин' : s.bot ? 'бот' : s.online ? 'в сети' : 'не в сети'} · ${esc(SCHOOLS[s.school].name)}</span>${isHost && s.id !== S.you ? btn({ label: '', icon: icon('close'), small: true, data: `data-kick="${s.id}"` }) : ''}</div>`).join('');
    const solo = L.seats.length === 1;
    const prevActive = document.activeElement && document.activeElement.id;
    el.innerHTML = `<div class="lobby-box">
        <h1>Ведьмак: Старый мир<small>Компьютерная версия настольной игры · до 5 игроков по сети, боты, одиночная игра</small></h1>
        <div class="lobby-cols"><div>
            <div class="row"><label>Ваше имя</label><input id="lName" maxlength="20" value="${esc(mySeat ? mySeat.name : S.name)}"></div>
            <div class="row"><label>Школа ведьмаков</label><div class="schools">${schools}</div></div>
            <div id="lPrevSlot"></div>
        </div><div>
            <h3>Игроки (${L.seats.length}/5)</h3>
            <div class="seat-list">${seats}</div>
            ${isHost ? `<div style="margin-top:8px">${btn({ id: 'lBot', label: 'Добавить бота', icon: icon('bot'), small: true, why: L.seats.length >= 5 ? 'Мест больше нет' : null })}</div>` : ''}
            <h3>Партия</h3>
            <div style="color:var(--dim);font-size:13px;margin-bottom:8px">${solo ? 'Одиночная игра (по правилам соло: 3 монстра I–III, победа — убить всех и получить трофей навыка).' : `${L.seats.length} игрока(ов): цель — 4 трофея.`}</div>
            ${modeHtml(L, isHost)}
            ${isHost ? `<label class="check"><input type="checkbox" id="lRandom" ${L.settings.randomFirst ? 'checked' : ''}> Случайный первый игрок</label>
            <div class="row" style="margin-top:8px"><label>Зерно случайности (необязательно)</label><input id="lSeed" maxlength="20" value="${esc(L.settings.seed || '')}" placeholder="любая строка"></div>` : '<div style="color:var(--dim)">Настройки выбирает хозяин стола.</div>'}
            <h3>Дополнения</h3>
            <div class="exp">${EXPANSIONS.map(([id, n, d]) => `<label class="check" style="opacity:.5" title="Подключается на следующем этапе"><input type="checkbox" disabled><span><b>${n}</b> — ${d}</span></label>`).join('')}
            <div style="margin-top:4px">Базовая игра готова; дополнения подключаются по очереди.</div></div>
            ${isHost && L.saves && L.saves.length ? `<h3>Сохранённые партии</h3><div class="saves">${L.saves.slice(0, 8).map(n => btn({ label: esc(n), small: true, data: `data-load="${esc(n)}"`, icon: icon('save') })).join('')}</div>` : ''}
            <div class="lobby-actions">${isHost ? btn({ id: 'lStart', label: 'Начать партию', primary: true, key: 'Enter' }) : '<span style="color:var(--dim)">Ждём, пока хозяин начнёт партию…</span>'}</div>
            <div class="lan">Друзья в той же сети подключаются по адресу: ${(L.addresses || []).map(a => `<code>http://${a}:${L.port}/</code>`).join(' ') || '<code>' + location.host + '</code>'}</div>
        </div></div></div>`;
    const nameIn = $('lName');
    nameIn.onchange = () => { S.name = nameIn.value; Store.set('name', S.name); send({ t: 'lobby', name: nameIn.value }); };
    if (prevActive === 'lName') { nameIn.focus(); nameIn.setSelectionRange(nameIn.value.length, nameIn.value.length); }
    for (const c of el.querySelectorAll('.school')) c.onclick = () => { if (!c.classList.contains('taken')) send({ t: 'lobby', school: c.dataset.school }); };
    for (const b of el.querySelectorAll('[data-kick]')) b.onclick = () => send({ t: 'lobby', kick: Number(b.dataset.kick) });
    for (const b of el.querySelectorAll('[data-load]')) b.onclick = () => send({ t: 'load', name: b.dataset.load });
    const on = (id, ev, f) => { const e = $(id); if (e) e[ev] = f; };
    on('lBot', 'onclick', () => send({ t: 'lobby', addBot: true }));
    on('lRandom', 'onchange', (e) => send({ t: 'lobby', settings: { randomFirst: e.target.checked } }));
    on('lSeed', 'onchange', (e) => send({ t: 'lobby', settings: { seed: e.target.value } }));
    on('lStart', 'onclick', () => send({ t: 'start' }));
    for (const b of el.querySelectorAll('[data-mode]')) b.onclick = () => { if (isHost) send({ t: 'lobby', settings: { mode: b.dataset.mode } }); };
    for (const c of el.querySelectorAll('[data-rule]')) c.onchange = () => send({ t: 'lobby', settings: { rules: { [c.dataset.rule]: c.checked } } });
    // One persistent preview canvas (WebGL contexts are limited), moved into the fresh markup.
    if (!previewBox) {
        previewBox = document.createElement('div');
        previewBox.className = 'preview';
        previewBox.innerHTML = '<canvas></canvas><div class="cap"><b></b><span></span></div>';
        try { preview = new Preview(previewBox.querySelector('canvas')); } catch (e) { console.warn('preview', e); }
    }
    $('lPrevSlot').replaceWith(previewBox);
    previewBox.querySelector('.cap b').textContent = SCHOOLS[mySchool].hero;
    previewBox.querySelector('.cap span').textContent = `${SCHOOLS[mySchool].school} · специализация «${SCHOOLS[mySchool].spec}»`;
    if (preview) { preview.show(mySchool); preview.engine.stopRenderLoop(); preview.engine.runRenderLoop(() => preview.scene.render()); setTimeout(() => preview.engine.resize(), 0); }
}
let previewBox = null;

/** Game creation mode: «Кастомная игра» (house rules toggled freely) or «Игра на MMR» (all on). */
function modeHtml(L, isHost) {
    const mode = L.settings.mode || 'custom';
    const rules = L.settings.rules || {};
    const tabs = Object.entries(GAME_MODES).map(([id, m]) => `<button class="mode ${mode === id ? 'on' : ''}" data-mode="${id}" ${isHost ? '' : 'disabled'} title="${esc(m.text)}"><b>${esc(m.name)}</b><small>${esc(m.text)}</small></button>`).join('');
    const list = HOUSE_RULES.map(r => {
        const locked = !isHost || mode === 'mmr';
        const why = mode === 'mmr' ? 'В игре на MMR все правила стола включены' : !isHost ? 'Настройки выбирает хозяин стола' : '';
        return `<label class="check rule ${locked ? 'locked' : ''}" title="${esc(why)}"><input type="checkbox" data-rule="${r.id}" ${rules[r.id] ? 'checked' : ''} ${locked ? 'disabled' : ''}><span><b>${esc(r.name)}</b> — ${esc(r.text)}${r.needsText ? `<em>${esc(r.needsText)}</em>` : ''}</span></label>`;
    }).join('');
    return `<div class="modes">${tabs}</div><div class="rules">${list}</div>`;
}
export function closeLobbyPreview() { if (preview) { preview.engine.stopRenderLoop(); } }
