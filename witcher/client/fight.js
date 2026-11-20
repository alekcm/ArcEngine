// Monster fight table: monster card and life pool, the last attack, the combo builder with a
// live preview of damage/shield/draw (same comboTotals as the engine), elixirs, specialization,
// trophy abilities, fight log and the result screen.
import { S, $, cmd, me, btn, toast } from './ctx.js';
import { icon } from './icons.js';
import { actionCard, monsterCard, attackCard, esc } from './cards.js';
import { CARDS, MONSTER, POTION } from '/shared/engine/util.mjs';
import { SCHOOLS, SPEC_TABLE } from '/shared/data/rules-data.mjs';
import { linkIndex, comboTotals, comboError } from '/shared/engine/fight.mjs';
import { sfx } from './sound.js';

let logFrom = 0;
export function fightStarted(v) { logFrom = v.log.length ? v.log[v.log.length - 1].i - 8 : 0; S.ui.combo = []; }

export function renderFight() {
    const v = S.view, el = $('fight');
    const f = v && v.fight;
    const res = S.ui.fightResult;
    if (!f && !res) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    if (!f && res) { renderResult(el, res); return; }
    S.ui.fightSnap = { mon: f.mon, seat: f.seat };
    const fighter = v.players[f.seat];
    const mine = f.seat === S.you;
    const p = mine ? me() : null;
    const m = MONSTER[f.mon];
    const myStage = mine && f.stage === 'witcher' && !v.prompt;
    const o = S.options && S.options.fight;
    const combo = S.ui.combo = (S.ui.combo || []).filter(id => p && p.hand.includes(id));
    const lifePct = Math.max(0, Math.min(100, (f.lifeCount / m.life) * 100));
    const free = !!(f.cur && f.cur.blizzard && combo.length >= 2 && linkIndex(CARDS[combo[combo.length - 2]], CARDS[combo[combo.length - 1]]) < 0);
    const tot = p && combo.length ? comboTotals(v, p, combo, { free }) : null;
    const cErr = p ? comboError(v, p, combo, { free }) : 'Не ваш ход';

    const last = f.lastAttack ? `<div class="lastatk"><span>Последняя атака</span>${attackCard(f.lastAttack.id, f.lastAttack.type)}</div>` : '';
    // The previous combo as one compact line (the cards themselves are in the log and discard).
    const lastCombo = f.lastCombo && f.lastCombo.ids.length ? `<div class="lastcombo"><span>Прошлая комбинация:</span> ${f.lastCombo.ids.map(id => esc(CARDS[id].name)).join(' › ')} <span class="fx dmg">${icon('sword')}<b>${f.lastCombo.dmg}</b></span></div>` : '';

    const comboHtml = combo.length ? combo.map((id, i) => {
        const prev = i > 0 ? CARDS[combo[i - 1]] : null;
        return (i ? '<span class="arrow">›</span>' : '') + actionCard(id, { order: i + 1, cls: 'pick', linkHi: i < combo.length - 1 ? linkIndex(CARDS[id], CARDS[combo[i + 1]]) : null });
    }).join('') : `<span class="empty">${myStage ? 'Кликайте карты руки по порядку: каждая следующая должна совпадать по цвету со связкой предыдущей' : mine ? 'Подождите…' : `${esc(fighter.name)} сражается`}</span>`;

    const fbtns = [];
    if (myStage && o) {
        for (const e of o.elixirs) { const po = POTION[e.id.split('#')[0]]; fbtns.push(btn({ label: `${esc(po.name)}`, icon: icon('elixir', 'c-forest'), why: e.err, data: `data-el="${esc(e.id)}"`, small: true }).replace('<button', `<button title="${esc(po.text)}"`)); }
        const sc = SCHOOLS[p.school];
        if (p.school === 'cat' || p.school === 'griffin') fbtns.push(btn({ label: `Специализация: ${esc(sc.spec)}`, icon: icon('spec'), why: o.spec, data: 'data-spec="1"', small: true }));
        for (const a of o.active) fbtns.push(btn({ label: esc(a.label), icon: icon(a.key.startsWith('CONT') ? 'combat' : 'trophy'), why: a.err, data: `data-act="${esc(a.key)}"`, small: true }));
    }

    // Hand cards are big (readable without zoom); when they do not fit they overlap like a fan.
    const handN = p ? p.hand.filter(id => !combo.includes(id)).length : 0;
    const overlap = handN > 1 ? Math.max(0, (handN * ((window.innerHeight <= 900 ? 214 : 250) + 8) - Math.min(window.innerWidth - 40, 1500)) / (handN - 1)) : 0;
    const hand = p ? p.hand.map((id, i) => {
        if (combo.includes(id)) return '';
        let ok = myStage;
        let why = '';
        if (ok && combo.length) {
            const lastC = CARDS[combo[combo.length - 1]];
            if (linkIndex(lastC, CARDS[id]) < 0 && !(f.cur && f.cur.blizzard && !free)) { ok = false; why = 'Не соединяется с последней картой'; }
            if (f.cur && f.cur.onlyOne) { ok = false; why = 'Только 1 карта'; }
        }
        if (ok && !combo.length && f.cur && f.cur.forcedFirst && p.hand.includes(f.cur.forcedFirst) && id !== f.cur.forcedFirst) { ok = false; why = 'Первой должна быть «' + CARDS[f.cur.forcedFirst].name + '»'; }
        return `<div class="hslot" style="margin-right:${-overlap}px" ${why ? `title="${esc(why)}"` : ''}>${actionCard(id, { cls: (ok ? 'pick can' : 'no') + ' huge' })}<kbd>${i + 1}</kbd></div>`;
    }).join('') : `<span style="color:var(--dim)">Рука ${esc(fighter.name)}: ${fighter.handCount} карт</span>`;

    const flog = v.log.filter(l => l.i >= logFrom).slice(-14).map(l => `<div>${esc(l.t)}</div>`).join('');
    const ps = fighter;
    el.innerHTML = `
    <div class="ftop"><b>${esc(fighter.name)} против: ${esc(m.name)}</b>
        <span class="turnbadge ${f.stage === 'witcher' ? 'me' : ''}">${f.stage === 'witcher' ? `Ход ведьмака ${Math.max(1, f.wTurns)}` : 'Ход монстра'}</span>
        ${f.track ? `<span class="turnbadge">${icon('track')} жетон следа: ведьмак ходит первым</span>` : ''}
        <span class="turnbadge">Эликсиры: ${f.elixirsUsed}</span></div>
    <div class="mon">
        <div id="fMonCard">${monsterCard(f.mon, { big: true, life: f.lifeCount })}</div>
        <div class="pool"><div class="stack" id="fPool">${f.lifeCount}</div><div>Запас жизни монстра<div class="lifebar"><i style="width:${lifePct}%"></i></div><small style="color:var(--dim)">сброс атак: ${f.monDiscard.length}</small></div></div>
    </div>
    <div class="center">
        <div class="crow">${last}<div class="combo" id="fCombo">${comboHtml}</div></div>
        <div class="totals">${tot ? `<span class="fx dmg">${icon('sword')}<b>${tot.dmg}</b></span><span class="fx shield">${icon('shield')}<b>+${tot.shield}</b></span><span class="fx draw">${icon('draw')}<b>${tot.draw}</b></span>${tot.top ? `<span class="fx top">${icon('top')}<b>${tot.top}</b></span>` : ''}${tot.ret.length ? `<span class="fx ret">${icon('ret')}<b>${tot.ret.length}</b></span>` : ''}${free ? '<span style="color:#9ccff0">Пурга: последняя карта без связки</span>' : ''}` : ''}</div>
        ${myStage ? `<div style="display:flex;gap:8px">${btn({ id: 'fPlay', label: combo.length ? `Разыграть (${combo.length})` : (p.hand.length ? 'Разыграть' : 'Пропустить (рука пуста)'), primary: true, why: cErr, key: 'Enter' })}${combo.length ? btn({ id: 'fClear', label: 'Сбросить выбор', key: 'Backspace' }) : ''}</div>` : ''}
        ${lastCombo}
    </div>
    <div class="me">
        <div class="wit panel" id="fWit" style="border-color:${SCHOOLS[ps.school].color}">
            <div style="font-family:var(--serif);font-size:17px;color:var(--gold2)">${esc(ps.name)} · ${esc(SCHOOLS[ps.school].name)}</div>
            <div class="bigstat">
                <span class="c-shield">${icon('shield')}${ps.shield}<small>щит (макс. ${ps.skills.defense >= 4 ? 4 : ps.skills.defense})</small></span>
                <span>${icon('deck')}${ps.deckCount}<small>колода</small></span>
                <span>${icon('hand')}${ps.handCount}<small>рука</small></span>
            </div>
            <div style="font-size:12px;color:var(--dim);text-align:center">Жизнь ведьмака = колода + рука: ${ps.deckCount + ps.handCount}</div>
        </div>
        <div class="fbtns">${fbtns.join('')}</div>
        <div class="flog panel">${flog}</div>
    </div>
    <div class="fhand">${hand}</div>`;

    const fl = el.querySelector('.flog'); if (fl) fl.scrollTop = fl.scrollHeight;
    for (const c of el.querySelectorAll('.fhand .card.pick')) c.onclick = () => addCard(c.dataset.id);
    for (const c of el.querySelectorAll('#fCombo .card')) c.onclick = () => { const i = S.ui.combo.indexOf(c.dataset.id); S.ui.combo = S.ui.combo.slice(0, i); sfx('card'); renderFight(); };
    for (const b of el.querySelectorAll('[data-el]')) b.onclick = () => { sfx('elixir'); cmd({ t: 'elixir', id: b.dataset.el }, 'эликсир'); };
    for (const b of el.querySelectorAll('[data-spec]')) b.onclick = () => cmd({ t: 'spec' }, 'специализация');
    for (const b of el.querySelectorAll('[data-act]')) b.onclick = () => cmd({ t: 'active', key: b.dataset.act }, 'трофей');
    const play = $('fPlay'); if (play) play.onclick = () => playCombo();
    const clr = $('fClear'); if (clr) clr.onclick = () => { S.ui.combo = []; renderFight(); };
}

function addCard(id) {
    S.ui.combo.push(id);
    sfx('card');
    renderFight();
}
export function playCombo() {
    const v = S.view, p = me(), f = v.fight;
    if (!f || !p) return;
    const combo = S.ui.combo || [];
    const free = !!(f.cur && f.cur.blizzard && combo.length >= 2 && linkIndex(CARDS[combo[combo.length - 2]], CARDS[combo[combo.length - 1]]) < 0);
    const e = comboError(v, p, combo, { free });
    if (e) { toast(e); return; }
    sfx('sword');
    cmd({ t: 'combo', ids: combo.slice(), free }, 'комбинация');
    S.ui.combo = [];
}
export function fightKey(e) {
    const v = S.view;
    if (!v || !v.fight) { if (S.ui.fightResult && (e.key === 'Enter' || e.key === 'Escape')) { S.ui.fightResult = null; renderFight(); return true; } return false; }
    if (v.fight.seat !== S.you || v.fight.stage !== 'witcher' || v.prompt) return false;
    const p = me();
    if (e.key === 'Enter') { playCombo(); return true; }
    if (e.key === 'Backspace' || e.key === 'Escape') { S.ui.combo = (S.ui.combo || []).slice(0, -1); renderFight(); return true; }
    if (/^[1-9]$/.test(e.key)) {
        const id = p.hand[Number(e.key) - 1];
        if (id && !S.ui.combo.includes(id)) {
            const el = document.querySelector(`#fight .fhand .card.pick[data-id="${id}"]`);
            if (el) addCard(id); else toast('Эта карта не соединяется с комбинацией');
        }
        return true;
    }
    return false;
}

function renderResult(el, r) {
    const m = MONSTER[r.mon];
    const v = S.view;
    const who = v.players[r.seat];
    const text = r.result === 'win' ? `${who.name} побеждает: ${m.name}. +2 золота и трофей.`
        : r.result === 'chase' ? `${m.name} отступает (в колоде атак осталось не больше 1 карты). ${who.name}: +2 золота и базовая карта; монстр заменён.`
        : `${who.name} теряет сознание. Монстр остаётся; ведьмак получает жетон следа и базовую карту.`;
    el.innerHTML = `<div class="result"><div>${monsterCard(r.mon, { big: true })}</div>
        <b class="${r.result === 'lose' ? 'lose' : ''}">${r.result === 'win' ? 'Победа' : r.result === 'chase' ? 'Монстр изгнан' : 'Поражение'}</b>
        <span>${esc(text)}</span>${btn({ id: 'fResOk', label: 'Продолжить', primary: true, key: 'Enter' })}</div>`;
    $('fResOk').onclick = () => { S.ui.fightResult = null; renderFight(); };
}

/** Visual feedback for fight events (damage numbers, shakes). */
export function fightEvents(events) {
    for (const e of events) {
        if (e.k === 'monsterHit') { floatNum('fMonCard', '−' + e.n); const c = $('fMonCard'); if (c) { c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake'); } sfx('hit'); }
        if (e.k === 'witcherHit') { floatNum('fWit', '−' + e.n); const c = $('fWit'); if (c) { c.classList.remove('flash-red'); void c.offsetWidth; c.classList.add('flash-red'); } sfx('hit', 0.1); }
        if (e.k === 'monsterAttack') sfx('roar');
    }
}
function floatNum(id, text, cls = '') {
    const host = $(id);
    if (!host) return;
    const r = host.getBoundingClientRect();
    const d = document.createElement('div');
    d.className = 'dmgnum ' + cls; d.textContent = text;
    d.style.left = (r.left + r.width / 2) + 'px'; d.style.top = (r.top + r.height * 0.3) + 'px'; d.style.position = 'fixed';
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 1200);
}
