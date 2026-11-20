// Prompt window: card picks and choices asked by the engine. Only the owner sees the content;
// everyone else sees who is deciding.
import { S, $, cmd, btn } from './ctx.js';
import { icon } from './icons.js';
import { actionCard, elixirCard, bombCard, attackCard, monsterCard, eventCard, mutagenCard, specialCard, esc } from './cards.js';
import { SPECIAL } from '/shared/data/vuln-data.mjs';
import { MUTAGEN } from '/shared/data/trail-data.mjs';
import { CARDS, ATTACK, MONSTER } from '/shared/engine/util.mjs';
import { ROW_MODS } from '/shared/data/rules-data.mjs';
import { sfx } from './sound.js';
import { comboTotals } from '/shared/engine/fight.mjs';
import { eventComboError } from '/shared/engine/explore.mjs';

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
    if (pr.kind === 'choice' && pr.ui === 'row') { renderRow(el, pr); return; }
    if (pr.kind === 'choice') {
        const opts = pr.options.map((o, i) => {
            let extra = '';
            if (pr.ui === 'row' && v.row[Number(o.id)]) extra = actionCard(v.row[Number(o.id)], { small: true, cost: Math.max(0, CARDS[v.row[Number(o.id)]].cost + ROW_MODS[Number(o.id)]) });
            if (pr.ui === 'bombType') extra = bombCard(o.id, { cls: 'big' });
            const ic = o.id === 'strike' ? icon('strike') : o.id === 'bite' ? icon('bite') : '';
            return pr.ui === 'row' || pr.ui === 'bombType'
                ? `<div style="display:flex;flex-direction:column;gap:6px;align-items:center">${extra}${btn({ label: esc(o.label), why: o.disabled ? (o.hint || 'Недоступно') : null, data: `data-c="${esc(o.id)}"`, small: true, key: String(i + 1) })}</div>`
                : btn({ label: esc(o.label), icon: ic, why: o.disabled ? (o.hint || 'Недоступно') : null, data: `data-c="${esc(o.id)}"`, key: String(i + 1) });
        }).join('');
        const revealed = v.fight && v.fight.lastAttack && v.fight.lastAttack.type === null ? attackCard(v.fight.lastAttack.id) : '';
        const fightMon = v.fight && pr.ui === 'attack' ? `<div style="display:flex;justify-content:center;gap:14px;margin-bottom:10px">${monsterCard(v.fight.mon, {})}${revealed}</div>`
            : pr.ui === 'bomb' && pr.card ? `<div style="display:flex;justify-content:center;gap:14px;margin-bottom:10px">${bombCard(pr.card, { cls: 'big' })}${v.fight ? monsterCard(v.fight.mon, {}) : ''}</div>` : '';
        el.innerHTML = `<div class="box"><h2>${esc(pr.title || 'Выбор')}</h2>${pr.text ? `<p>${esc(pr.text)}</p>` : ''}${fightMon}
            <div class="${pr.ui === 'row' || pr.ui === 'bombType' ? 'cards' : 'opts'}">${opts}</div></div>`;
        for (const b of el.querySelectorAll('[data-c]')) b.onclick = () => cmd({ t: 'answer', choice: b.dataset.c }, pr.title);
        return;
    }
    // cards
    const sel = S.ui.sel;
    const cardsHtml = pr.ids.map(id => {
        const s = sel.includes(id);
        // Phase III discard: the hand as big as the purchase row (nearly touching).
        const big = pr.from === 'row' || pr.big;
        const o = { sel: s, cls: 'pick' + (big ? ' buy' : ''), small: !big && pr.ids.length > 8 };
        if (String(id).startsWith('POTION')) return elixirCard(id, o);
        if (String(id).startsWith('BOMB')) return bombCard(id, { ...o, cls: o.cls });
        if (SPECIAL[id]) return `<div class="pick ${s ? 'sel' : ''}" data-id="${esc(id)}" style="border-radius:9px">${specialCard(id, v.fight && v.fight.mon)}</div>`;
        if (ATTACK[id]) return `<div class="pick ${s ? 'sel' : ''}" data-id="${esc(id)}" style="border-radius:9px">${attackCard(id)}</div>`;
        if (MONSTER[id]) return monsterCard(id, {});
        if (MUTAGEN[id]) return mutagenCard(id, { sel: s, cls: 'pick big' });
        if (CARDS[id]) {
            if (pr.from === 'row' && !CARDS[id].burn) { const i = v.row.indexOf(id); if (i >= 0) o.cost = Math.max(0, CARDS[id].cost + ROW_MODS[i]); }
            return actionCard(id, o);
        }
        return `<div class="card pick ${s ? 'sel' : ''}" data-id="${esc(id)}"><div class="name">${esc(id)}</div></div>`;
    }).join('');
    const n = sel.length;
    // Event combo (outside a fight): click order is the chain order; totals and link check live.
    const combo = pr.ui === 'combo';
    const chainErr = combo ? eventComboError(sel) : null;
    const okCount = n >= pr.min && n <= pr.max && !chainErr;
    const need = chainErr || (pr.min === pr.max ? `Выберите ${pr.min}` : `Выберите от ${pr.min} до ${pr.max}`);
    const tot = combo && n ? comboTotals(v, v.players[S.you], sel) : null;
    const comboInfo = combo ? `<div class="combosum">${n ? `${sel.map((id, i) => `<b>${i + 1}</b> ${esc(CARDS[id].name)}`).join(' → ')} · урон <b>${tot.dmg}</b> · щит <b>+${tot.shield}</b>` : 'Щёлкайте карты по порядку цепочки'}</div>` : '';
    el.innerHTML = `<div class="box${pr.big ? ' rowbox' : ''}"><h2>${esc(pr.title || 'Выбор карт')}</h2>${pr.text ? `<p>${esc(pr.text)}</p>` : ''}
        <div class="${combo ? 'comborow' : ''}">${pr.card && combo ? `<div class="combocard">${eventCard(pr.card, { stage: 'full' })}</div>` : ''}
        <div class="${combo ? 'combopick' : ''}"><div class="cards${pr.big ? ' bigrow' : ''}">${cardsHtml || '<span style="color:var(--dim)">Нет подходящих карт</span>'}</div>${comboInfo}</div></div>
        <div class="foot"><span class="cnt">${need}. Выбрано: ${n}</span>
        ${pr.min === 0 && n === 0 ? btn({ id: 'pSkip', label: 'Пропустить', key: 'Esc' }) : ''}
        ${btn({ id: 'pOk', label: combo ? 'Разыграть' : 'Готово', primary: true, why: okCount ? null : need, key: 'Enter' })}</div></div>`;
    if (combo) sel.forEach((id, i) => { const c = el.querySelector(`.cards [data-id="${CSS.escape(id)}"]`); if (c) c.setAttribute('data-ord', i + 1); });
    // «Положите в любом порядке»: the click order is the order on top of the deck (1 = topmost).
    if (pr.ordered) sel.forEach((id, i) => { const c = el.querySelector(`.cards [data-id="${CSS.escape(id)}"]`); if (c) { c.classList.add('ordered-pick'); c.insertAdjacentHTML('beforeend', `<span class="order-n">${i + 1}</span>`); } });
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

// Phase III purchase: the row itself, big cards nearly touching; a card is bought by clicking
// it (mouse only — no number keys). Unaffordable cards are dimmed with the reason under them.
// Alt + hover enlarges any card (see initZoom).
function renderRow(el, pr) {
    const v = S.view;
    const cards = pr.options.map(o => {
        const slot = Number(o.id), id = v.row[slot];
        if (!id) return '';
        const cost = o.cost != null ? o.cost : Math.max(0, CARDS[id].cost + ROW_MODS[slot]);
        return `<div class="buyslot ${o.disabled ? 'dis' : ''}" data-c="${esc(o.id)}" ${o.disabled ? `title="${esc(o.hint || 'Недоступно')}"` : ''}>
            ${actionCard(id, { cls: 'buy ' + (o.disabled ? 'no' : 'pick'), cost })}
            <div class="buycap">${o.disabled ? esc(o.hint || 'Недоступно') : o.burn ? 'убрать из игры 1 карту' : `сбросить ${cost}`}</div></div>`;
    }).join('');
    el.innerHTML = `<div class="box rowbox"><h2>${esc(pr.title || 'Выбор')}</h2>${pr.text ? `<p>${esc(pr.text)}</p>` : ''}
        <div class="buyrow">${cards}</div>
        <p class="zoomhint">Щёлкните карту, чтобы взять её. Alt + наведение — увеличить карту.</p></div>`;
    for (const b of el.querySelectorAll('.buyslot:not(.dis)')) b.onclick = () => cmd({ t: 'answer', choice: b.dataset.c }, pr.title);
}

/**
 * Alt + hover: the card under the cursor itself grows in place (buy row, hand, fight) — no
 * second copy. It is scaled by a transform, kept inside the window; ancestors that clip their
 * content (scrolling boxes) let it out while it is enlarged.
 */
export function initZoom() {
    let over = null, cur = null, hosts = [];
    const TARGET_H = 560;
    const reset = () => {
        if (cur) { cur.classList.remove('altzoom'); cur.style.removeProperty('--zt'); }
        for (const h of hosts) h.classList.remove('zoomhost');
        cur = null; hosts = [];
    };
    const show = (on) => {
        const c = on && over && over.closest ? over.closest('.card.action, .card.attack, .card.mutagen, .evcard') : null;
        if (c === cur) return;
        reset();
        if (!c) return;
        const r = c.getBoundingClientRect();
        const s = Math.min(TARGET_H / r.height, (innerHeight - 16) / r.height, (innerWidth - 16) / r.width);
        if (s < 1.08) return;
        const w = r.width * s, h = r.height * s;
        const L = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2));
        const T = Math.max(8, Math.min(innerHeight - h - 8, r.top + r.height / 2 - h / 2));
        // The origin is the card's own top-left corner: translate by the offset of the new box.
        c.style.setProperty('--zt', `translate(${(L - r.left).toFixed(1)}px, ${(T - r.top).toFixed(1)}px) scale(${s.toFixed(3)})`);
        for (let e = c.parentElement; e && e !== document.body; e = e.parentElement) {
            const st = getComputedStyle(e);
            if (st.overflow !== 'visible' || st.overflowX !== 'visible' || st.overflowY !== 'visible') { e.classList.add('zoomhost'); hosts.push(e); }
        }
        c.classList.add('altzoom');
        cur = c;
    };
    document.addEventListener('mouseover', (e) => { if (cur && cur.contains(e.target)) return; over = e.target; show(e.altKey); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Alt') { e.preventDefault(); show(true); } });
    document.addEventListener('keyup', (e) => { if (e.key === 'Alt') { e.preventDefault(); show(false); } });
    window.addEventListener('blur', () => show(false));
    // A re-render replaces the card element: drop the stale state.
    new MutationObserver(() => { if (cur && !cur.isConnected) reset(); }).observe(document.body, { childList: true, subtree: true });
}

// Exploration / event card: the card itself on the left (options are clickable on it, like
// pointing at the printed line), buttons with the reasons for disabled options on the right.
function renderEvent(el, pr) {
    const choose = pr.stage === 'choose';
    // House rule «Открытые последствия»: both outcomes are printed before the choice.
    // Only the bold effects are opened; flavour text stays covered until it is picked.
    const open = !!(S.view.rules && S.view.rules.openEvents);
    const card = eventCard(pr.card, { stage: choose ? (open ? 'open' : 'choose') : pr.stage === 'outcome' ? 'outcome' : 'full', pick: pr.pick, dice: pr.sum != null ? pr.sum : pr.dice, choose, open });
    const opts = pr.options.map((o, i) => btn({ label: esc(o.label), why: o.disabled ? (o.hint || 'Недоступно') : null, data: `data-c="${esc(o.id)}"`, key: String(i + 1), primary: !choose && i === 0 })).join('');
    const sub = pr.stage === 'outcome' ? `<p class="eff" style="color:var(--gold2)">${esc(pr.effect || '')}</p>`
        : pr.stage === 'roll' ? `<div style="display:flex;align-items:center;gap:12px"><span class="evdice">${pr.dice}</span><span style="color:var(--dim)">${pr.rollKind === 'sea' ? 'Скеллиге: результат сравнивается с делением Дагона на шкале' : pr.rollKind === 'combo' ? 'Исход по урону комбинации' : pr.sum != null ? `Выпало ${pr.dice}, сумма ${pr.sum}` : `Выпало ${pr.dice}`} — исход подсвечен на карте</span></div>`
        : choose ? `<p style="color:var(--dim)">Выберите вариант: щёлкните строку на карте или кнопку.${open ? ' Эффекты последствий открыты (правило стола), описание — после выбора.' : ''}</p>` : '';
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
    if (pr.kind === 'choice' && pr.ui !== 'row' && /^[1-9]$/.test(e.key)) {
        const o = pr.options[Number(e.key) - 1];
        if (o && !o.disabled) cmd({ t: 'answer', choice: o.id }, pr.title);
        return true;
    }
    if (pr.kind === 'cards' && e.key === 'Enter') { const b = $('pOk'); if (b && !b.disabled) b.click(); return true; }
    if (pr.kind === 'cards' && e.key === 'Escape') { const b = $('pSkip'); if (b) b.click(); return true; }
    return false;
}
