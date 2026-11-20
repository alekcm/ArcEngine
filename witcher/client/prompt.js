// Prompt window: card picks and choices asked by the engine. Only the owner sees the content;
// everyone else sees who is deciding.
import { S, $, cmd, btn } from './ctx.js';
import { icon } from './icons.js';
import { actionCard, elixirCard, attackCard, monsterCard, eventCard, esc } from './cards.js';
import { CARDS, ATTACK, MONSTER } from '/shared/engine/util.mjs';
import { ROW_MODS } from '/shared/data/rules-data.mjs';
import { sfx } from './sound.js';

let lastKey = '';
export function renderPrompt() {
    const v = S.view, el = $('modal');
    const pr = v && v.prompt;
    if (!pr || pr.kind === 'dice') { el.classList.add('hidden'); lastKey = ''; return; }
    if (pr.foreign) {
        // Someone else decides: a small passive notice (the HUD hint also says it).
        el.className = 'passive';
        el.innerHTML = `<div class="box" style="min-width:0;position:fixed;top:120px;left:50%;transform:translateX(-50%);padding:10px 16px"><div class="wait"><div class="spinner"></div>${esc(v.players[pr.seat].name)}: ${esc(pr.title || 'принимает решение')}</div></div>`;
        if (v.fight) el.classList.add('hidden');
        lastKey = '';
        return;
    }
    const key = JSON.stringify([pr.title, pr.ids, pr.options, pr.text, pr.card, pr.stage]);
    if (key !== lastKey) { S.ui.sel = []; lastKey = key; sfx('card'); }
    el.className = '';
    if (pr.kind === 'choice' && pr.ui === 'event') { renderEvent(el, pr); return; }
    if (pr.kind === 'choice') {
        const opts = pr.options.map((o, i) => {
            let extra = '';
            if (pr.ui === 'row' && v.row[Number(o.id)]) extra = actionCard(v.row[Number(o.id)], { small: true, cost: Math.max(0, CARDS[v.row[Number(o.id)]].cost + ROW_MODS[Number(o.id)]) });
            const ic = o.id === 'strike' ? icon('strike') : o.id === 'bite' ? icon('bite') : '';
            return pr.ui === 'row'
                ? `<div style="display:flex;flex-direction:column;gap:6px;align-items:center">${extra}${btn({ label: esc(o.label), why: o.disabled ? (o.hint || 'Недоступно') : null, data: `data-c="${esc(o.id)}"`, small: true, key: String(i + 1) })}</div>`
                : btn({ label: esc(o.label), icon: ic, why: o.disabled ? (o.hint || 'Недоступно') : null, data: `data-c="${esc(o.id)}"`, key: String(i + 1) });
        }).join('');
        const fightMon = v.fight && pr.ui === 'attack' ? `<div style="display:flex;justify-content:center;margin-bottom:10px">${monsterCard(v.fight.mon, {})}</div>` : '';
        el.innerHTML = `<div class="box"><h2>${esc(pr.title || 'Выбор')}</h2>${pr.text ? `<p>${esc(pr.text)}</p>` : ''}${fightMon}
            <div class="${pr.ui === 'row' ? 'cards' : 'opts'}">${opts}</div></div>`;
        for (const b of el.querySelectorAll('[data-c]')) b.onclick = () => cmd({ t: 'answer', choice: b.dataset.c }, pr.title);
        return;
    }
    // cards
    const sel = S.ui.sel;
    const cardsHtml = pr.ids.map(id => {
        const s = sel.includes(id);
        const o = { sel: s, cls: 'pick', small: pr.ids.length > 8 };
        if (String(id).startsWith('POTION')) return elixirCard(id, o);
        if (ATTACK[id]) return `<div class="pick ${s ? 'sel' : ''}" data-id="${esc(id)}" style="border-radius:9px">${attackCard(id)}</div>`;
        if (MONSTER[id]) return monsterCard(id, {});
        if (CARDS[id]) {
            if (pr.from === 'row') { const i = v.row.indexOf(id); if (i >= 0) o.cost = Math.max(0, CARDS[id].cost + ROW_MODS[i]); }
            return actionCard(id, o);
        }
        return `<div class="card pick ${s ? 'sel' : ''}" data-id="${esc(id)}"><div class="name">${esc(id)}</div></div>`;
    }).join('');
    const n = sel.length;
    const okCount = n >= pr.min && n <= pr.max;
    const need = pr.min === pr.max ? `Выберите ${pr.min}` : `Выберите от ${pr.min} до ${pr.max}`;
    el.innerHTML = `<div class="box"><h2>${esc(pr.title || 'Выбор карт')}</h2>${pr.text ? `<p>${esc(pr.text)}</p>` : ''}
        <div class="cards">${cardsHtml || '<span style="color:var(--dim)">Нет подходящих карт</span>'}</div>
        <div class="foot"><span class="cnt">${need}. Выбрано: ${n}</span>
        ${pr.min === 0 && n === 0 ? btn({ id: 'pSkip', label: 'Пропустить', key: 'Esc' }) : ''}
        ${btn({ id: 'pOk', label: 'Готово', primary: true, why: okCount ? null : need, key: 'Enter' })}</div></div>`;
    for (const c of el.querySelectorAll('.pick')) c.onclick = () => {
        const id = c.dataset.id;
        if (sel.includes(id)) sel.splice(sel.indexOf(id), 1);
        else { sel.push(id); if (sel.length > pr.max) sel.shift(); }
        sfx('card');
        renderPrompt();
    };
    const ok = $('pOk'); if (ok) ok.onclick = () => cmd({ t: 'answer', ids: sel.slice() }, pr.title);
    const skip = $('pSkip'); if (skip) skip.onclick = () => cmd({ t: 'answer', ids: [] }, pr.title);
}

// Exploration / event card: the card itself on the left (options are clickable on it, like
// pointing at the printed line), buttons with the reasons for disabled options on the right.
function renderEvent(el, pr) {
    const choose = pr.stage === 'choose';
    const card = eventCard(pr.card, { stage: choose ? 'choose' : pr.stage === 'outcome' ? 'outcome' : 'full', pick: pr.pick, dice: pr.dice, choose });
    const opts = pr.options.map((o, i) => btn({ label: esc(o.label), why: o.disabled ? (o.hint || 'Недоступно') : null, data: `data-c="${esc(o.id)}"`, key: String(i + 1), primary: !choose && i === 0 })).join('');
    const sub = pr.stage === 'outcome' ? `<p class="eff" style="color:var(--gold2)">${esc(pr.effect || '')}</p>`
        : pr.stage === 'roll' ? `<div style="display:flex;align-items:center;gap:12px"><span class="evdice">${pr.dice}</span><span style="color:var(--dim)">Выпало ${pr.dice} — исход подсвечен на карте</span></div>`
        : choose ? '<p style="color:var(--dim)">Выберите вариант: щёлкните строку на карте или кнопку.</p>' : '';
    el.innerHTML = `<div class="box evbox-wrap">${card}<div class="evside"><h2>${esc(pr.title || 'Событие')}</h2>${sub}<div class="opts">${opts}</div></div></div>`;
    for (const o of pr.options) if (o.disabled) { const line = el.querySelector(`.evopt[data-c="${o.id}"]`); if (line) { line.classList.add('dis'); line.title = o.hint || ''; } }
    for (const b of el.querySelectorAll('[data-c]')) b.onclick = () => {
        const o = pr.options.find(x => x.id === b.dataset.c);
        if (o && !o.disabled) cmd({ t: 'answer', choice: o.id }, pr.title);
    };
}

export function promptKey(e) {
    const v = S.view, pr = v && v.prompt;
    if (!pr || pr.foreign || pr.kind === 'dice') return false;
    if (pr.kind === 'choice' && /^[1-9]$/.test(e.key)) {
        const o = pr.options[Number(e.key) - 1];
        if (o && !o.disabled) cmd({ t: 'answer', choice: o.id }, pr.title);
        return true;
    }
    if (pr.kind === 'cards' && e.key === 'Enter') { const b = $('pOk'); if (b && !b.disabled) b.click(); return true; }
    if (pr.kind === 'cards' && e.key === 'Escape') { const b = $('pSkip'); if (b) b.click(); return true; }
    return false;
}
