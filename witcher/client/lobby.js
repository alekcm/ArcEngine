// Lobby: name, school (with a rotating miniature preview), seats with bots, host settings,
// expansions, saved games, LAN addresses.
import { S, $, send, btn } from './ctx.js';
import { Store } from './store.js';
import { icon } from './icons.js';
import { esc } from './cards.js';
import { SCHOOLS, SCHOOL_ORDER, GAME_MODES, HOUSE_RULES, EXPANSIONS_READY } from '/shared/data/rules-data.mjs';
import { TRAIL_PARTS } from '/shared/data/trail-data.mjs';
import { LEGENDS } from '/shared/data/gen-data.mjs';
import { ARMOR, SOLO_MOVES, SOLO_NAME, legendOpts } from '/shared/data/legend-data.mjs';
import { Preview } from './board.js';

let preview = null;
const SCHOOL_TEXT = {
    wolf: 'Эрим. «Владение мечом»: после комбинации из 3+ карт — дополнительный урон и добор.',
    cat: 'Кайлар. «Прыть»: в первый ход битвы — посмотреть верх колоды и взять карты.',
    bear: 'Ауфар. «Доспехи»: когда щит падает до 0 — щит и добор.',
    viper: 'Джаспер. «Отравленный клинок»: когда противник сбрасывает карты — сбросить ещё.',
    griffin: 'Годрик. «Магия»: Знак любого цвета продолжает комбинацию.',
    ciri: 'Цири. «Старшая Кровь»: раз за битву одна карта комбинации получает связь любого цвета. Родная школа — Каэр Морхен.',
    manticore: 'Алувар. «Быстрый метаболизм»: раз за битву сбросить неиспользованные эликсиры — урон и карты из колоды.',
    alzur: 'Альзур, чародей. «Молнии»: энергия −1 и бросок кубика — до 3 урона. Старт — в свободной локации школы.',
    ardea: 'Ардея, чародейка. «Левитация»: энергия и карты. Старт — в свободной локации школы.',
    gehira: 'Гехира, чародейка. «Некромантия»: сбросить карту — урон и энергия. Старт — в свободной локации школы.',
    otar: 'Отар, чародей. «Телепортация»: в первый ход битвы — барьер и энергия. Старт — в свободной локации школы.',
    philippa: 'Филиппа, чародейка. «Полиморфизм»: бросок кубика — облик с эффектом. Старт — в свободной локации школы.',
};
const SCHOOL_NEEDS = { ciri: '«Цири и доп. события»', 'trail:manticore': '«По следу монстра» → Школа Мантикоры', mages: '«Чародеи»' };
const EXPANSIONS = [
    ['legendary', 'Легендарная охота', 'вместо гонки за трофеями — общий враг: легендарный монстр бродит по Континенту и оставляет руины; кто победит его, тот и выиграл (8 монстров, включая Кейрана)'],
    ['skellige', 'Скеллиге', 'острова 19–21, корабли и 50 карт исследования Скеллиге; Дагон поднимается из пучины — прогнавший его получает дар'],
    ['mages', 'Чародеи', 'пять играбельных чародеев: энергия вместо щита, барьер, доп. эффекты карт за энергию и свой ряд карт'],
    ['ciri', 'Цири и доп. события', 'Цири, новые события исследования, тайные карты и жетоны заданий'],
    ['trail', 'По следу монстра', 'мини-дополнения можно включать по отдельности — уязвимости и особые атаки монстров подключаются следующими'],
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
        const open = sc.base || (L.settings.exp || []).includes(sc.exp);
        const cls = k === mySchool ? 'sel' : (taken.has(k) || !open) ? 'taken' : '';
        const why = !open ? `Включите дополнение ${SCHOOL_NEEDS[sc.exp] || ''}` : taken.has(k) ? 'Уже выбрано другим игроком' : '';
        return `<div class="school ${cls}" data-school="${k}" style="--sc:${sc.color}" ${why ? `title="${esc(why)}"` : ''}><b>${esc(sc.mage ? `${sc.hero} · ${sc.school.toLowerCase()}` : sc.school)}</b><small>${esc(SCHOOL_TEXT[k] || '')}${!open ? '<em> · нужно дополнение</em>' : ''}</small></div>`;
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
            <div style="color:var(--dim);font-size:13px;margin-bottom:8px">${legendOpts(L.settings.exp) ? (solo ? 'Одиночная «Легендарная охота»: победите легендарного монстра, пока не кончились карты его перемещения.' : `${L.seats.length} игрока(ов): цель — победить легендарного монстра.`) : solo ? 'Одиночная игра (по правилам соло: 3 монстра I–III, победа — убить всех и получить трофей навыка).' : `${L.seats.length} игрока(ов): цель — 4 трофея.`}</div>
            ${modeHtml(L, isHost)}
            ${isHost ? `<label class="check"><input type="checkbox" id="lRandom" ${L.settings.randomFirst ? 'checked' : ''}> Случайный первый игрок</label>
            <div class="row" style="margin-top:8px"><label>Зерно случайности (необязательно)</label><input id="lSeed" maxlength="20" value="${esc(L.settings.seed || '')}" placeholder="любая строка"></div>` : '<div style="color:var(--dim)">Настройки выбирает хозяин стола.</div>'}
            <h3>Дополнения</h3>
            <div class="exp">${EXPANSIONS.map(([id, n, d]) => {
                const ready = EXPANSIONS_READY.includes(id);
                const why = !ready ? 'Подключается на следующем этапе' : !isHost ? 'Дополнения выбирает хозяин стола' : '';
                return `<label class="check" style="${ready ? '' : 'opacity:.5'}" title="${why}"><input type="checkbox" data-exp="${id}" ${(L.settings.exp || []).includes(id) ? 'checked' : ''} ${ready && isHost ? '' : 'disabled'}><span><b>${n}</b> — ${d}</span></label>${id === 'trail' ? trailParts(L, isHost) : id === 'legendary' ? legendParts(L, isHost, solo) : id === 'skellige' ? skelligeParts(L, isHost) : id === 'mages' ? magesParts(L, isHost) : ''}`;
            }).join('')}
            <div style="margin-top:4px">Дополнения подключаются по очереди: «Цири и доп. события» — играбельная Цири, новые карты исследования, тайные события и жетоны заданий; «По следу монстра» — бомбы, Мантикора, тролль, мутагены, уникальные и мастерские действия.</div></div>
            ${isHost && L.saves && L.saves.length ? `<h3>Сохранённые партии</h3><div class="saves">${L.saves.slice(0, 16).map(n => btn({ label: esc(n), small: true, data: `data-load="${esc(n)}"`, icon: icon('save') })).join('')}</div>` : ''}
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
    for (const c of el.querySelectorAll('[data-exp]')) c.onchange = () => {
        let exp = [...el.querySelectorAll('[data-exp]:checked')].map(x => x.dataset.exp);
        // «Легендарная охота»: the monster / difficulty selects stay while the expansion is on.
        exp = exp.includes('legendary') ? [...exp, ...(L.settings.exp || []).filter(x => /^legendary:(mon|solo):/.test(x))] : exp.filter(x => !x.startsWith('legendary:'));
        if (!exp.includes('skellige')) exp = exp.filter(x => !x.startsWith('skellige:'));
        if (!exp.includes('mages')) exp = exp.filter(x => !x.startsWith('mages:'));
        // Switching «По следу монстра» on turns every mini-expansion on; switching all of them off turns it off.
        if (c.dataset.exp === 'trail' && c.checked) exp = [...exp.filter(x => !x.startsWith('trail:')), ...TRAIL_PARTS.map(t => 'trail:' + t.id)];
        if (c.dataset.exp.startsWith('trail:') && !exp.some(x => x.startsWith('trail:'))) exp = exp.filter(x => x !== 'trail');
        send({ t: 'lobby', settings: { exp } });
    };
    for (const c of el.querySelectorAll('[data-legsel]')) c.onchange = () => {
        const kind = c.dataset.legsel;
        const exp = (L.settings.exp || []).filter(x => !x.startsWith(`legendary:${kind}:`));
        if (c.value) exp.push(`legendary:${kind}:${c.value}`);
        send({ t: 'lobby', settings: { exp } });
    };
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

/** «По следу монстра» mini-expansions, each on its own (Книги правил/По следу монстра.md p. 3). */
function trailParts(L, isHost) {
    const exp = L.settings.exp || [];
    const on = exp.includes('trail');
    return `<div class="subexp ${on ? '' : 'off'}">${TRAIL_PARTS.map(t => {
        const id = 'trail:' + t.id;
        const why = !on ? 'Сначала включите «По следу монстра»' : !isHost ? 'Дополнения выбирает хозяин стола' : '';
        return `<label class="check" title="${esc(why)}"><input type="checkbox" data-exp="${id}" ${on && exp.includes(id) ? 'checked' : ''} ${on && isHost ? '' : 'disabled'}><span><b>${esc(t.name)}</b> — ${esc(t.text)}</span></label>`;
    }).join('')}</div>`;
}

/** «Легендарная охота»: memo side A/B, the monster (or random), the solo difficulty (rules pp. 3, 7). */
function legendParts(L, isHost, solo) {
    const o = legendOpts(L.settings.exp);
    const on = !!o, dis = on && isHost ? '' : 'disabled';
    const exp = L.settings.exp || [];
    const why = !on ? 'Сначала включите «Легендарную охоту»' : !isHost ? 'Дополнения выбирает хозяин стола' : '';
    const opt = (v, t, sel) => `<option value="${v}" ${sel ? 'selected' : ''}>${esc(t)}</option>`;
    return `<div class="subexp ${on ? '' : 'off'}" title="${esc(why)}">
        <label class="check"><input type="checkbox" data-exp="legendary:B" ${on && exp.includes('legendary:B') ? 'checked' : ''} ${dis}><span><b>Памятка, сторона Б</b> — броня монстра по трофеям ${ARMOR.B.join('/')} вместо ${ARMOR.A.join('/')} (сложнее)</span></label>
        <div class="legsel"><label>Легендарный монстр</label><select data-legsel="mon" ${dis}>${opt('', 'Случайный', !o || !o.mon)}${LEGENDS.map(l => opt(l.key, `${l.name} · старт в локации ${l.start}`, o && o.mon === l.key)).join('')}</select></div>
        ${solo ? `<div class="legsel"><label>Сложность одиночной игры</label><select data-legsel="solo" ${dis}>${Object.keys(SOLO_MOVES).map(k => opt(k, `${SOLO_NAME[k]} — ${SOLO_MOVES[k]} карт перемещения`, (o ? o.solo : 'normal') === k)).join('')}</select></div>` : ''}
    </div>`;
}

/** «Скеллиге»: Сирена (Доп монстра.md) — waits in the Dagon location while Dagon is under water. */
function skelligeParts(L, isHost) {
    const exp = L.settings.exp || [];
    const on = exp.includes('skellige'), dis = on && isHost ? '' : 'disabled';
    return `<div class="subexp ${on ? '' : 'off'}" title="${on ? '' : 'Сначала включите «Скеллиге»'}">
        <label class="check"><input type="checkbox" data-exp="skellige:siren" ${on && exp.includes('skellige:siren') ? 'checked' : ''} ${dis}><span><b>Сирена</b> — монстр I уровня в локации Дагона, пока Дагона нет (трофей без жетона трофеев)</span></label>
    </div>`;
}

/** «Чародеи»: Кащей (Доп монстра.md p. 2) — a level III monster added to the stack and decks. */
function magesParts(L, isHost) {
    const exp = L.settings.exp || [];
    const on = exp.includes('mages'), dis = on && isHost ? '' : 'disabled';
    return `<div class="subexp ${on ? '' : 'off'}" title="${on ? '' : 'Сначала включите «Чародеи»'}">
        <label class="check"><input type="checkbox" data-exp="mages:koshchei" ${on && exp.includes('mages:koshchei') ? 'checked' : ''} ${dis}><span><b>Кащей</b> — монстр III уровня: фиолетовые эффекты не действуют; с уязвимостями — своя большая карта</span></label>
    </div>`;
}

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
