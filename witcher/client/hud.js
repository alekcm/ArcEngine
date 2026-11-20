// Table HUD: participants, phase bar, monsters, card row, actions with reasons, hand, own
// tableau, log/chat, move payment and the map tooltip.
import { S, $, cmd, send, me, btn, toast } from './ctx.js';
import { icon, TERRAIN_COLOR } from './icons.js';
import { actionCard, monsterCard, elixirCard, trophyLabel, artCss, esc, fxText } from './cards.js';
import { SCHOOLS, SKILLS, SKILL_NAME, TERRAIN_NAME, ROW_MODS, LOC_ACTION_TEXT, LOC_ACTIONS, TROPHIES_TO_WIN } from '/shared/data/rules-data.mjs';
import { CARDS, LOC, MONSTER, POTION } from '/shared/engine/util.mjs';
import { movePaymentError } from '/shared/engine/turn.mjs';
import { isMuted, setMuted, sfx } from './sound.js';

const WIN = TROPHIES_TO_WIN || 4;
const skillIc = { combat: 'combat', defense: 'defense', alchemy: 'alchemy', spec: 'spec' };

export function renderHud() {
    const v = S.view;
    if (!v) return;
    renderPlayers(v);
    renderTop(v);
    renderTools();
    renderMonsters(v);
    renderRow(v);
    renderActions(v);
    renderHand(v);
    renderMine(v);
    renderLog(v);
    renderPay(v);
}

// ---------------------------------------------------------------------------------------------
function renderPlayers(v) {
    const act = v.turn ? v.turn.seat : -1;
    $('players').innerHTML = v.players.map(p => {
        const sc = SCHOOLS[p.school];
        const tr = Array.from({ length: WIN }, (_, i) => `<i class="${i < p.track ? 'on' : ''}"></i>`).join('');
        const tracks = ['forest', 'mountain', 'water'].map(t => `<span class="c-${t}" title="Жетон следа: ${TERRAIN_NAME[t]}">${icon('track', p.trackTokens[t] ? 'on' : '')}</span>`).join('');
        return `<div class="pl panel ${p.seat === act ? 'active' : ''} ${p.seat === S.you ? 'me' : ''}" style="--sc:${sc.color}" data-seat="${p.seat}">
            <div class="hd">${p.bot ? icon('bot', '', 'Бот') : ''}<span class="nm">${esc(p.name)}</span><small style="color:var(--dim)">${esc(sc.name)} · ур. ${p.level}</small></div>
            <div class="stats">
                <span class="c-gold" title="Золото">${icon('coin')}${p.gold}</span>
                <span title="Карты в руке">${icon('hand')}${p.handCount}</span>
                <span title="Колода">${icon('deck')}${p.deckCount}</span>
                <span class="c-shield" title="Щит">${icon('shield')}${p.shield}</span>
                <span title="Эликсиры" style="color:#7fd0b4">${icon('elixir')}${p.elixirs.length}</span>
                <span class="tracks">${tracks}</span>
            </div>
            <div class="skills">${SKILLS.map(s => `<span title="${SKILL_NAME[s]}">${icon(skillIc[s])}${p.skills[s]}</span>`).join('')}</div>
            <div class="troph" title="${esc(p.trophies.map(trophyLabel).join(', ') || 'Трофеев нет')}">${tr}<small>${p.track}/${WIN} трофеев</small></div>
        </div>`;
    }).join('');
    for (const el of $('players').querySelectorAll('.pl')) el.onclick = () => openPlayer(Number(el.dataset.seat));
}

function renderTop(v) {
    const t = v.turn;
    const p = t ? v.players[t.seat] : null;
    const ph = !t ? 0 : v.fight ? 2 : t.phase;
    const step = (n, label) => `<span class="${ph === n ? 'on' : ph > n ? 'done' : ''}">${label}</span>`;
    $('topbar').innerHTML = `<span class="round">Раунд ${v.round}</span>
        ${p ? `<span class="who" style="--sc:${SCHOOLS[p.school].color}"><i></i>${esc(p.name)}</span>` : ''}
        <div class="phases">${step(1, 'I. Путь')}${step(2, v.fight ? 'II. Битва' : 'II. Битва / медитация / исследование')}${step(3, 'III. Развитие')}</div>
        ${v.solo ? '<span style="color:var(--dim)">Одиночная игра</span>' : ''}`;
}

function renderTools() {
    const u = S.undo || {};
    const canUndo = u.depth > 0 && (u.self || S.host);
    $('tools').innerHTML = [
        btn({ id: 'tRow', label: '', icon: icon('card'), small: true, key: 'R' }).replace('<button', '<button title="Ряд карт"'),
        btn({ id: 'tUndo', label: '', icon: icon('undo'), small: true, key: 'Z', why: canUndo ? null : (u.depth ? 'Отменить чужое или открывшее скрытое действие может только хозяин стола' : 'Нечего отменять') }).replace('<button', `<button title="Отменить: ${esc(u.label || '')}"`),
        S.host ? btn({ id: 'tSave', label: '', icon: icon('save'), small: true }).replace('<button', '<button title="Сохранить партию"') : '',
        S.host ? btn({ id: 'tLobby', label: 'Лобби', small: true }).replace('<button', '<button title="Завершить партию и вернуться в лобби (сохраните её перед этим)"') : '',
        btn({ id: 'tSound', label: '', icon: icon(isMuted() ? 'mute' : 'sound'), small: true }).replace('<button', '<button title="Звук"'),
        btn({ id: 'tHelp', label: '', icon: icon('help'), small: true, key: 'F1' }).replace('<button', '<button title="Справка и горячие клавиши"'),
    ].join('');
    const on = (id, f) => { const e = $(id); if (e) e.onclick = f; };
    on('tRow', () => { S.ui.rowOpen = !S.ui.rowOpen; renderRow(S.view); });
    on('tUndo', () => send({ t: 'undo' }));
    on('tSave', () => { const n = prompt('Название сохранения', ''); if (n !== null) send({ t: 'save', name: n }); });
    on('tLobby', () => { if (confirm('Вернуться в лобби? Несохранённая партия будет потеряна (автосохранение — в списке сохранений).')) send({ t: 'newGame' }); });
    on('tSound', () => { setMuted(!isMuted()); renderTools(); });
    on('tHelp', () => openHelp());
}

function renderMonsters(v) {
    $('monsters').innerHTML = v.slots.map((s, i) => {
        if (!s.mon) return `<div class="mslot panel" style="--tc:${TERRAIN_COLOR[s.terrain]}"><div class="mini" style="background:#0005"></div><div class="inf"><b style="color:var(--dim)">Нет монстра</b><small>${icon(s.terrain, 'c-' + s.terrain)}${TERRAIN_NAME[s.terrain]}</small></div></div>`;
        const m = MONSTER[s.mon];
        const hunters = v.players.filter(p => p.trackTokens[s.terrain]).map(p => `<i style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${SCHOOLS[p.school].color}" title="${esc(p.name)}: жетон следа"></i>`).join('');
        return `<div class="mslot panel" style="--tc:${TERRAIN_COLOR[s.terrain]}" data-slot="${i}" title="${esc(m.name + ': ' + m.ability)}">
            <div class="mini" style="background-image:${artCss(s.mon, '#5a2a2a', 'skull')}"></div>
            <div class="inf"><b>${esc(m.name)} <span class="lvb">${['', 'I', 'II', 'III'][m.level]}</span></b>
            <small>${icon(s.terrain, 'c-' + s.terrain)}${esc(LOC[s.token] ? LOC[s.token].name : '?')} · жизнь ${m.life} ${hunters}</small></div></div>`;
    }).join('');
    for (const el of $('monsters').querySelectorAll('.mslot[data-slot]')) {
        const s = v.slots[Number(el.dataset.slot)];
        el.onclick = () => { S.board && S.board.focus(s.token); openViewer(MONSTER[s.mon].name, monsterCard(s.mon, { big: true, trophy: true })); };
    }
}

export function renderRow(v) {
    const el = $('row');
    el.classList.toggle('open', !!S.ui.rowOpen);
    if (!S.ui.rowOpen) return;
    el.innerHTML = `<div class="ttl"><span>Ряд карт · модификаторы стоимости слева направо</span><span>${icon('deck')} ${v.actionDeck}</span></div>
        <div class="cards">${v.row.map((id, i) => id ? actionCard(id, { small: true, cost: Math.max(0, CARDS[id].cost + ROW_MODS[i]), mod: ROW_MODS[i] }) : '<div class="card small blank" style="opacity:.2"></div>').join('')}</div>`;
}

// ---------------------------------------------------------------------------------------------
function renderActions(v) {
    const o = S.options;
    const p = me();
    const box = $('actions');
    const hint = $('hint');
    if (!p || !o || v.fight || v.prompt || v.stage === 'over') {
        box.classList.add('hidden');
        const act = v.turn ? v.players[v.turn.seat] : null;
        hint.textContent = v.stage === 'over' ? '' : v.prompt && v.prompt.seat !== S.you ? `Ждём: ${v.players[v.prompt.seat].name} — ${v.prompt.title || 'решение'}` : act && act.seat !== S.you && !v.fight ? `Ходит ${act.name}` : '';
        return;
    }
    box.classList.remove('hidden');
    if (S.ui.pay) { box.classList.add('hidden'); hint.textContent = ''; return; }
    if (!o.acting) { box.classList.add('hidden'); hint.textContent = v.turn ? `Ходит ${v.players[v.turn.seat].name}` : ''; return; }
    const t = v.turn;
    const parts = [];
    // Location action
    const L = o.loc;
    if (L && L.kind) {
        if (L.kind === 'school' && !L.err) {
            for (const c of L.choices) parts.push(btn({ label: `${esc(c.label)} · ${c.cost}`, icon: icon(skillIc[c.id]), why: c.err, data: `data-loc-skill="${c.id}"` }));
        } else if (L.kind === 'hunt' && !L.err) {
            for (const c of L.choices) parts.push(btn({ label: `Выследить: ${esc(c.label)}`, icon: icon('track'), why: c.err, data: `data-loc-slot="${c.id}"` }));
            parts.push(btn({ label: 'Только +1 золото', icon: icon('coin'), data: 'data-loc-slot=""' }));
        } else {
            parts.push(btn({ label: esc(locLabel(L, p)), icon: icon(locIcon(L.kind)), why: L.err, data: 'data-loc="1"', key: 'A' }));
        }
        parts.push('<span class="sep"></span>');
    }
    for (const a of o.phase2) {
        if (a.id === 'meditate' && a.err) continue;
        const ic = a.id === 'fight' ? 'sword' : a.id === 'meditate' ? 'meditate' : 'explore';
        const key = a.id === 'fight' ? 'F' : a.id === 'meditate' ? 'M' : a.id === 'explore-city' ? 'C' : 'W';
        let why = a.err;
        if (!why && a.id !== 'fight' && !t.moved && o.moves.length) why = null;
        parts.push(btn({ label: esc(a.label), icon: icon(ic), why, primary: a.id === 'fight' && !a.err, data: `data-p2="${a.id}"`, key }));
    }
    box.innerHTML = parts.join('');
    hint.textContent = !t.moved ? 'Фаза I: переместитесь — кликните подсвеченную локацию на карте (или сразу выберите действие фазы II)'
        : L && L.kind && !L.err ? 'Можно выполнить действие локации, затем выберите действие фазы II' : 'Выберите действие фазы II: битва, медитация или исследование';
    for (const b of box.querySelectorAll('[data-loc]')) b.onclick = () => cmd({ t: 'loc' }, 'действие локации');
    for (const b of box.querySelectorAll('[data-loc-skill]')) b.onclick = () => cmd({ t: 'loc', skill: b.dataset.locSkill }, 'тренировка');
    for (const b of box.querySelectorAll('[data-loc-slot]')) b.onclick = () => cmd({ t: 'loc', slot: b.dataset.locSlot === '' ? undefined : Number(b.dataset.locSlot) }, 'выслеживание');
    for (const b of box.querySelectorAll('[data-p2]')) b.onclick = () => phase2(b.dataset.p2);
}
export function phase2(id) {
    const o = S.options; if (!o) return;
    const a = o.phase2.find(x => x.id === id);
    if (!a) return;
    if (a.err) { toast(a.err); return; }
    if (id === 'fight') cmd({ t: 'fight' }, 'битва');
    else if (id === 'meditate') {
        if (a.trophies.length === 1) cmd({ t: 'meditate', trophy: a.trophies[0] }, 'медитация');
        else openChoice('Медитация', 'Какой трофей навыка взять?', a.trophies.map(tid => ({ id: tid, label: trophyLabel({ kind: 'skill', id: tid }) })), (c) => cmd({ t: 'meditate', trophy: c }, 'медитация'));
    } else cmd({ t: 'explore', deck: id === 'explore-city' ? 'city' : 'wild' }, 'исследование');
}
function locLabel(L, p) {
    switch (L.kind) {
        case 'raise': return `${LOC[p.loc].name}: ${SKILL_NAME[L.skill]} +1`;
        case 'poker': return `${LOC[p.loc].name}: покер с горожанами`;
        case 'elixir': return `${LOC[p.loc].name}: взять эликсир`;
        case 'poor': return `${LOC[p.loc].name}: нищие кварталы`;
        case 'swap': return `${LOC[p.loc].name}: обмен карты`;
        case 'school': return `${LOC[p.loc].name}: тренировка`;
        case 'hunt': return `${LOC[p.loc].name}: выслеживание`;
    }
    return L.text || 'Действие локации';
}
const locIcon = (k) => ({ raise: 'level', poker: 'poker', elixir: 'elixir', poor: 'coin', swap: 'card', school: 'school', hunt: 'track' }[k] || 'spec');
export function doLocAction() { const L = S.options && S.options.loc; if (L && L.kind && !L.err && !['school', 'hunt'].includes(L.kind)) cmd({ t: 'loc' }, 'действие локации'); else if (L && L.err) toast(L.err); }

// ---------------------------------------------------------------------------------------------
function renderHand(v) {
    const p = me();
    const el = $('hand');
    if (!p || !p.hand || v.fight) { el.innerHTML = ''; return; }
    const pay = S.ui.pay;
    el.innerHTML = p.hand.map(id => {
        let cls = '';
        if (pay) {
            cls = 'pick';
            if (!movePaymentError(v, p, pay.to, [id], 0)) cls += ' can';
        }
        return actionCard(id, { sel: pay && pay.cards.includes(id), cls });
    }).join('');
    for (const c of el.querySelectorAll('.card')) c.onclick = () => {
        if (!S.ui.pay) return;
        const id = c.dataset.id, pc = S.ui.pay.cards;
        if (pc.includes(id)) pc.splice(pc.indexOf(id), 1); else { pc.push(id); if (pc.length > 2) pc.shift(); }
        sfx('card');
        // A single matching card pays at once on double click.
        renderHand(S.view); renderPay(S.view);
    };
    for (const c of el.querySelectorAll('.card')) c.ondblclick = () => {
        if (!S.ui.pay) return;
        if (!movePaymentError(v, p, S.ui.pay.to, [c.dataset.id], 0)) doMove(S.ui.pay.to, [c.dataset.id], 0);
    };
}

function renderMine(v) {
    const p = me();
    const el = $('mine');
    if (!p) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    const sc = SCHOOLS[p.school];
    el.innerHTML = `<div class="r" style="font-family:var(--serif);font-size:15px;color:${sc.color}"><b style="color:var(--gold2)">${esc(sc.school)}</b> · ${esc(LOC[p.loc].name)}</div>
        <div class="r" style="margin-top:4px;color:var(--dim)">Специализация: ${esc(sc.spec)} (${p.skills.spec})</div>
        <div class="elixirs">${p.elixirs.map(e => { const po = POTION[e.split('#')[0]]; return `<span class="el" title="${esc(po.name + ': ' + po.text)}">${icon('elixir', 'c-forest')}${esc(po.name)}</span>`; }).join('') || '<span style="color:var(--dim);font-size:12px">Эликсиров нет</span>'}</div>
        ${p.hunts.length ? `<div class="r" style="margin-top:6px;font-size:12px;color:var(--dim)">Задания: ${p.hunts.map(h => `${TERRAIN_NAME[h.terrain]} → ${esc(LOC[h.loc].name)} (${h.gold} зол.)`).join(', ')}</div>` : ''}
        <div class="zones">
            ${btn({ id: 'zDiscard', label: `Сброс ${p.discard.length}`, small: true, icon: icon('card') })}
            ${btn({ id: 'zTroph', label: `Трофеи ${p.trophies.length}`, small: true, icon: icon('trophy') })}
            ${btn({ id: 'zRemoved', label: `Убраны ${p.removed.length}`, small: true })}
        </div>`;
    $('zDiscard').onclick = () => openViewer('Ваш сброс', p.discard.map(id => actionCard(id, { small: true })).join('') || 'Пусто');
    $('zRemoved').onclick = () => openViewer('Убраны из игры', p.removed.map(id => actionCard(id, { small: true })).join('') || 'Пусто');
    $('zTroph').onclick = () => openPlayer(p.seat);
}

let logLen = 0;
function renderLog(v) {
    const el = $('log');
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 30;
    el.innerHTML = v.log.slice(-250).map(l => `<div class="${l.kind || ''}">${esc(l.t)}</div>`).join('');
    if (atBottom || v.log.length !== logLen) el.scrollTop = el.scrollHeight;
    logLen = v.log.length;
}
export function renderChat() {
    const el = $('chat');
    el.innerHTML = S.chat.map(m => `<div><b style="color:var(--gold2)">${esc(m.from)}:</b> ${esc(m.text)}</div>`).join('');
    el.scrollTop = el.scrollHeight;
}

// ---------------------------------------------------------------------------------------------
// Movement
// ---------------------------------------------------------------------------------------------
export function startMove(to) {
    const o = S.options, v = S.view, p = me();
    if (!o || !p || !o.moves.some(m => m.to === to)) return false;
    // A single matching card in hand: suggest it, but let the player choose.
    S.ui.pay = { to, cards: [], gold: 0 };
    const singles = p.hand.filter(id => !movePaymentError(v, p, to, [id], 0));
    if (singles.length === 1 && p.hand.length >= 1) S.ui.pay.cards = [singles[0]];
    renderHand(v); renderPay(v); renderActions(v);
    return true;
}
function doMove(to, cards, gold) {
    S.ui.pay = null;
    cmd({ t: 'move', to, cards, gold }, 'перемещение в ' + LOC[to].name);
}
function renderPay(v) {
    const el = $('pay');
    const pay = S.ui.pay;
    const p = me();
    if (!pay || !p || !S.options || !S.options.moves.some(m => m.to === pay.to)) { el.classList.add('hidden'); S.ui.pay = null; return; }
    el.classList.remove('hidden');
    const dest = LOC[pay.to];
    const err = movePaymentError(v, p, pay.to, pay.cards, pay.gold);
    const goldOk = p.gold >= 1;
    el.innerHTML = `<span class="t">${icon('move')} ${esc(dest.name)} <span class="c-${dest.terrain}">${icon(dest.terrain)}</span></span>
        <span style="color:var(--dim);font-size:12.5px;max-width:330px">Оплата: карта «${TERRAIN_NAME[dest.terrain].toLowerCase()}» или джокер (подсвечены), 2 любые карты, или 1 карта + 1 золото. Выберите карты в руке.</span>
        <label class="check" ${goldOk ? '' : 'style="opacity:.4"'}><input type="checkbox" id="payGold" ${pay.gold ? 'checked' : ''} ${goldOk ? '' : 'disabled'}> +1 золото</label>
        ${btn({ id: 'payGo', label: 'Идти', primary: true, why: err, key: 'Enter' })}
        ${btn({ id: 'payCancel', label: 'Отмена', key: 'Esc' })}`;
    $('payGold').onchange = (e) => { pay.gold = e.target.checked ? 1 : 0; if (pay.gold && pay.cards.length > 1) pay.cards.splice(1); renderPay(v); renderHand(v); };
    const go = $('payGo'); if (go) go.onclick = () => doMove(pay.to, pay.cards.slice(), pay.gold);
    $('payCancel').onclick = () => cancelMove();
}
export function confirmMove() { const pay = S.ui.pay; if (pay && !movePaymentError(S.view, me(), pay.to, pay.cards, pay.gold)) doMove(pay.to, pay.cards.slice(), pay.gold); }
export function cancelMove() { S.ui.pay = null; renderHand(S.view); renderPay(S.view); renderActions(S.view); }

// ---------------------------------------------------------------------------------------------
// Map tooltip
// ---------------------------------------------------------------------------------------------
export function mapTip(loc, x, y) {
    const el = $('maptip');
    if (loc == null || !S.view) { el.classList.add('hidden'); return; }
    const v = S.view, L = LOC[loc];
    const act = LOC_ACTIONS[loc];
    const here = v.players.filter(p => p.loc === loc).map(p => esc(p.name)).join(', ');
    const slot = v.slots.find(s => s.mon && s.token === loc);
    const can = S.options && S.options.moves.some(m => m.to === loc);
    const p = me();
    let why = '';
    if (!can && p && S.options && S.options.acting && !v.fight) {
        why = v.turn && v.turn.phase !== 1 ? '' : p.loc === loc ? 'Вы здесь' : 'Нет прямой дороги отсюда';
    }
    el.innerHTML = `<b>${loc}. ${esc(L.name)}</b> <span class="c-${L.terrain}">${icon(L.terrain)}</span> ${esc(TERRAIN_NAME[L.terrain])}${L.port ? ` · ${icon('port')} порт` : ''}
        ${L.school ? `<div>${icon('school')} ${esc(SCHOOLS[L.school] ? SCHOOLS[L.school].school : 'Школа')}</div>` : ''}
        ${act ? `<div style="color:#d8ccb7">${esc(LOC_ACTION_TEXT[act.kind])}</div>` : ''}
        ${slot ? `<div class="c-red">${icon('skull')} ${esc(MONSTER[slot.mon].name)} (ур. ${MONSTER[slot.mon].level})</div>` : ''}
        ${here ? `<div>${icon('meditate')} ${here}</div>` : ''}
        ${can ? '<div class="ok">Клик — переместиться сюда</div>' : why ? `<div class="why">${why}</div>` : ''}`;
    el.classList.remove('hidden');
    el.style.left = Math.min(window.innerWidth - 310, x + 16) + 'px';
    el.style.top = Math.min(window.innerHeight - 140, y + 12) + 'px';
}

// ---------------------------------------------------------------------------------------------
// Viewers
// ---------------------------------------------------------------------------------------------
export function openViewer(title, html) {
    const el = $('viewer');
    el.innerHTML = `<div class="box"><h2>${esc(title)} ${btn({ id: 'vClose', label: '', icon: icon('close'), small: true, key: 'Esc' })}</h2><div class="cards">${html}</div></div>`;
    el.classList.remove('hidden');
    $('vClose').onclick = () => el.classList.add('hidden');
    el.onclick = (e) => { if (e.target === el) el.classList.add('hidden'); };
}
function openPlayer(seat) {
    const p = S.view.players[seat];
    const sc = SCHOOLS[p.school];
    const trophies = p.trophies.map(t => `<div style="display:flex;flex-direction:column;gap:4px;align-items:center">${t.kind === 'monster' ? monsterCard(t.id, { trophy: true, cls: 'trophy-card' }) : `<div class="card skilltrophy"><div class="name" style="top:20%">${esc(trophyLabel(t))}</div></div>`}</div>`).join('');
    openViewer(`${p.name} — ${sc.school}`, `<div style="width:100%;color:#d8ccb7;margin-bottom:8px">Уровень ${p.level}. ${SKILLS.map(s => `${SKILL_NAME[s]} ${p.skills[s]}`).join(', ')}. Трофеи ведьмаков в запасе: ${p.witcherTrophies}. Побеждено монстров: ${p.monstersDefeated}.</div>
        <h3 style="width:100%;margin:6px 0;color:var(--gold)">Трофеи (${p.track}/${WIN})</h3>${trophies || '<span style="color:var(--dim)">Пока нет</span>'}
        <h3 style="width:100%;margin:12px 0 6px;color:var(--gold)">Сброс (${p.discard.length})</h3>${p.discard.map(id => actionCard(id, { small: true })).join('') || '<span style="color:var(--dim)">Пусто</span>'}`);
}
export function openChoice(title, text, options, onPick) {
    const el = $('modal');
    el.className = '';
    el.innerHTML = `<div class="box"><h2>${esc(title)}</h2><p>${esc(text)}</p><div class="opts">${options.map(o => btn({ label: esc(o.label), data: `data-c="${esc(o.id)}"` })).join('')}</div><div class="foot">${btn({ id: 'mCancel', label: 'Отмена' })}</div></div>`;
    for (const b of el.querySelectorAll('[data-c]')) b.onclick = () => { el.classList.add('hidden'); onPick(b.dataset.c); };
    $('mCancel').onclick = () => el.classList.add('hidden');
}
export function openHelp() {
    const el = $('help');
    el.innerHTML = `<div class="box"><h2>Справка ${btn({ id: 'hClose', label: '', icon: icon('close'), small: true, key: 'Esc' })}</h2>
    <p>Цель — первым собрать <b>${WIN} трофея</b>; последний должен быть получен в битве. Ход: <b>I.</b> переместиться (оплата картой местности, двумя любыми картами или картой + золото) и выполнить действие локации; <b>II.</b> битва, медитация или исследование; <b>III.</b> добор до 3 карт и покупка карты из ряда.</p>
    <p>Битва: жизнь ведьмака — его колода и рука, жизнь монстра — его колода атаки. В свой ход разыграйте комбинацию: каждая следующая карта должна совпадать по цвету с одной из связок предыдущей.</p>
    <table>
    <tr><td><kbd>ЛКМ</kbd> по локации</td><td>переместиться (подсвечены доступные)</td></tr>
    <tr><td><kbd>ПКМ</kbd> + тащить / колесо</td><td>сдвиг / масштаб карты; <kbd>Home</kbd> — общий вид, <kbd>Space</kbd> — к активному ведьмаку</td></tr>
    <tr><td><kbd>A</kbd></td><td>действие локации</td></tr>
    <tr><td><kbd>F</kbd> / <kbd>M</kbd> / <kbd>C</kbd> / <kbd>W</kbd></td><td>битва / медитация / исследовать город / окрестности</td></tr>
    <tr><td><kbd>R</kbd></td><td>показать ряд карт</td></tr>
    <tr><td><kbd>Enter</kbd></td><td>подтвердить (оплата, комбинация, выбор)</td></tr>
    <tr><td><kbd>Esc</kbd></td><td>отмена / закрыть окно</td></tr>
    <tr><td><kbd>Z</kbd></td><td>отменить своё последнее действие (если оно ничего не открыло)</td></tr>
    <tr><td><kbd>1</kbd>–<kbd>9</kbd></td><td>в битве — добавить карту руки в комбинацию</td></tr>
    </table>
    <p style="color:var(--dim);font-size:12px">Арт карт — заглушки. Чтобы поставить свой, положите файл <code>witcher/client/art/&lt;ID карты&gt;.jpg</code> (или .png/.webp) — ID видны в подсказках к картам в режиме разработчика (Ctrl+Shift+I → data-id).</p></div>`;
    el.classList.remove('hidden');
    $('hClose').onclick = () => el.classList.add('hidden');
    el.onclick = (e) => { if (e.target === el) el.classList.add('hidden'); };
}
export { fxText };
