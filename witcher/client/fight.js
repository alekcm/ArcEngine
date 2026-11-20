// Monster fight table: monster card and life pool, the last attack, the combo builder with a
// live preview of damage/shield/draw (same comboTotals as the engine), elixirs, specialization,
// trophy abilities, fight log and the result screen.
import { S, $, cmd, me, btn, toast } from './ctx.js';
import { icon } from './icons.js';
import { actionCard, monsterCard, attackCard, mutagenCard, esc } from './cards.js';
import { MUTAGEN } from '/shared/data/trail-data.mjs';
import { bombOf } from '/shared/data/bombs-data.mjs';
import { CARDS, MONSTER, POTION } from '/shared/engine/util.mjs';
import { SCHOOLS, SPEC_TABLE, trailOn } from '/shared/data/rules-data.mjs';
import { linkIndex, comboTotals, comboError, bloodFx } from '/shared/engine/fight.mjs';
import { COLOR_SHORT } from '/shared/data/rules-data.mjs';
import { sfx } from './sound.js';

let logFrom = 0;
export function fightStarted(v) { logFrom = v.log.length ? v.log[v.log.length - 1].i - 8 : 0; S.ui.combo = []; S.ui.blood = null; S.ui.mutOff = []; S.ui.mut8 = 'dmg'; }
/** Mutagen choices of the combo builder: switched-off mutagens and the MUT-08 effect. */
const mutOpts = () => ({ mutOff: S.ui.mutOff || [], mut8: S.ui.mut8 || 'dmg' });
/** Цири's «Старшая Кровь» in the combo builder: null (off), 'armed' (the next card joins with any
 *  colour) or the index of the card joined by the blood link. */
const bloodAt = () => (typeof S.ui.blood === 'number' && S.ui.blood < (S.ui.combo || []).length) ? S.ui.blood : null;

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
    const bOpt = o ? o.blood : undefined;               // undefined: not Цири; null: available; string: why not
    if (bOpt !== null && S.ui.blood === 'armed') S.ui.blood = null;
    if (typeof S.ui.blood === 'number' && S.ui.blood >= combo.length) S.ui.blood = null;
    const blood = bloodAt();
    const armed = S.ui.blood === 'armed';
    const lifePct = Math.max(0, Math.min(100, (f.lifeCount / m.life) * 100));
    const free = !!(f.cur && f.cur.blizzard && combo.length >= 2 && linkIndex(CARDS[combo[combo.length - 2]], CARDS[combo[combo.length - 1]]) < 0);
    const tot = p && combo.length ? comboTotals(v, p, combo, { free, blood, ...mutOpts() }) : null;
    const cErr = p ? comboError(v, p, combo, { free, blood }) : 'Не ваш ход';

    const last = f.lastAttack ? `<div class="lastatk"><span>Последняя атака</span>${attackCard(f.lastAttack.id, f.lastAttack.type)}</div>` : '';
    // The previous combo as one compact line (the cards themselves are in the log and discard).
    const lastCombo = f.lastCombo && f.lastCombo.ids.length ? `<div class="lastcombo"><span>Прошлая комбинация:</span> ${f.lastCombo.ids.map(id => esc(CARDS[id].name)).join(' › ')} <span class="fx dmg">${icon('sword')}<b>${f.lastCombo.dmg}</b></span></div>` : '';

    const comboHtml = combo.length ? combo.map((id, i) => {
        const prev = i > 0 ? CARDS[combo[i - 1]] : null;
        const arrow = !i ? '' : i === blood ? `<span class="arrow blood" title="Старшая Кровь: ${esc(COLOR_SHORT[CARDS[id].color])} связь">${icon('spec')}</span>` : '<span class="arrow">›</span>';
        return arrow + actionCard(id, { order: i + 1, cls: 'pick', linkHi: i < combo.length - 1 && i + 1 !== blood ? linkIndex(CARDS[id], CARDS[combo[i + 1]]) : null });
    }).join('') : `<span class="empty">${myStage ? 'Кликайте карты руки по порядку: каждая следующая должна совпадать по цвету со связкой предыдущей' + (bOpt === null ? '. «Старшая Кровь» один раз за битву соединит две любые карты' : '') : mine ? 'Подождите…' : `${esc(fighter.name)} сражается`}</span>`;

    const fbtns = [];
    if (myStage && o) {
        for (const e of o.elixirs) { const po = POTION[e.id.split('#')[0]]; fbtns.push(btn({ label: `${esc(po.name)}`, icon: icon('elixir', 'c-forest'), why: e.err, data: `data-el="${esc(e.id)}"`, small: true }).replace('<button', `<button title="${esc(po.text)}"`)); }
        for (const b of o.bombs || []) { const bd = bombOf(b.id); fbtns.push(btn({ label: `Бомба: ${esc(bd.name)}`, icon: icon('bomb', 'c-bomb'), why: b.err, data: `data-bomb="${esc(b.id)}"`, small: true }).replace('<button', `<button title="${esc(bd.text)}"`)); }
        const sc = SCHOOLS[p.school];
        if (p.school === 'cat' || p.school === 'griffin' || p.school === 'manticore') fbtns.push(btn({ label: `Специализация: ${esc(sc.spec)}`, icon: icon('spec'), why: o.spec, data: 'data-spec="1"', small: true }));
        if (bOpt !== undefined) {
            const bf = bloodFx(p);
            const fxTxt = `${bf.dmg ? `урон ${bf.dmg}, ` : ''}${bf.draw >= 0 ? '+' : ''}${bf.draw} карт(а) в конце хода`;
            const label = blood != null ? 'Старшая Кровь: в комбинации' : armed ? 'Старшая Кровь: выберите карту' : 'Старшая Кровь';
            fbtns.push(btn({ label, icon: icon('spec'), why: blood != null ? null : bOpt, data: 'data-blood="1"', small: true, primary: armed || blood != null })
                .replace('<button', `<button title="${esc(`Раз за битву: следующая карта комбинации соединяется связью любого цвета (${fxTxt}). Повторный клик — отменить.`)}"`));
        }
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
            if (linkIndex(lastC, CARDS[id]) < 0 && !(f.cur && f.cur.blizzard && !free) && !armed) { ok = false; why = bOpt === null ? 'Не соединяется с последней картой (можно через «Старшую Кровь»)' : 'Не соединяется с последней картой'; }
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
        <span class="turnbadge" title="Лимит по навыку алхимии">${trailOn(v, 'bombs') ? 'Эликсиры и бомбы' : 'Эликсиры'}: ${f.elixirsUsed}</span>
        ${f.noAbility ? '<span class="turnbadge">Чёртов гриб: способность монстра не действует</span>' : ''}${f.moonDust ? '<span class="turnbadge">Лунная пыль: тип следующей атаки можно сменить</span>' : ''}</div>
    <div class="mon">
        <div id="fMonCard">${monsterCard(f.mon, { big: true, life: f.lifeCount })}</div>
        <div class="pool"><div class="stack" id="fPool">${f.lifeCount}</div><div>Запас жизни монстра<div class="lifebar"><i style="width:${lifePct}%"></i></div><small style="color:var(--dim)">сброс атак: ${f.monDiscard.length}</small></div></div>
    </div>
    <div class="center">
        <div class="crow">${last}<div class="combo" id="fCombo">${comboHtml}</div></div>
        <div class="totals">${tot ? `<span class="fx dmg">${icon('sword')}<b>${tot.dmg}</b></span><span class="fx shield">${icon('shield')}<b>+${tot.shield}</b></span><span class="fx draw">${icon('draw')}<b>${tot.draw}</b></span>${tot.top ? `<span class="fx top">${icon('top')}<b>${tot.top}</b></span>` : ''}${tot.ret.length ? `<span class="fx ret">${icon('ret')}<b>${tot.ret.length}</b></span>` : ''}${tot.dice.length ? `<span class="fx dice" title="Бросок кубика при розыгрыше">${icon('dice')}<b>${tot.dice.length}</b></span>` : ''}${tot.fixedDraw != null ? '<span class="bloodnote">Решающий удар: в конце хода — 0 карт</span>' : ''}${free ? '<span style="color:#9ccff0">Пурга: последняя карта без связки</span>' : ''}${tot.blood ? `<span class="bloodnote">Старшая Кровь: ${esc(COLOR_SHORT[tot.blood.color])} связь${tot.blood.off ? ' (подавлена)' : ''}</span>` : armed ? '<span class="bloodnote">Старшая Кровь: следующая карта — любого цвета</span>' : ''}` : armed ? '<span class="bloodnote">Старшая Кровь: следующая карта после первой — любого цвета</span>' : ''}</div>
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
        ${mutagensHtml(ps, f, tot, mine)}
        <div class="flog panel">${flog}</div>
    </div>
    <div class="fhand">${hand}</div>`;

    const fl = el.querySelector('.flog'); if (fl) fl.scrollTop = fl.scrollHeight;
    for (const c of el.querySelectorAll('.fhand .card.pick')) c.onclick = () => addCard(c.dataset.id);
    for (const c of el.querySelectorAll('#fCombo .card')) c.onclick = () => { const i = S.ui.combo.indexOf(c.dataset.id); S.ui.combo = S.ui.combo.slice(0, i); if (typeof S.ui.blood === 'number' && S.ui.blood >= i) S.ui.blood = null; sfx('card'); renderFight(); };
    for (const b of el.querySelectorAll('[data-blood]')) b.onclick = () => { toggleBlood(); };
    for (const b of el.querySelectorAll('[data-el]')) b.onclick = () => { sfx('elixir'); cmd({ t: 'elixir', id: b.dataset.el }, 'эликсир'); };
    for (const b of el.querySelectorAll('[data-bomb]')) b.onclick = () => { sfx('hit'); cmd({ t: 'bomb', id: b.dataset.bomb }, 'бомба'); };
    for (const c of el.querySelectorAll('.fmuts [data-mut]')) c.onclick = () => toggleMut(c.dataset.mut, tot);
    for (const b of el.querySelectorAll('[data-spec]')) b.onclick = () => cmd({ t: 'spec' }, 'специализация');
    for (const b of el.querySelectorAll('[data-act]')) b.onclick = () => cmd({ t: 'active', key: b.dataset.act }, 'трофей');
    const play = $('fPlay'); if (play) play.onclick = () => playCombo();
    const clr = $('fClear'); if (clr) clr.onclick = () => { S.ui.combo = []; S.ui.blood = null; renderFight(); };
}

/** Mutagens of the fighter: used ones greyed, the ones the current combo triggers glow; a click
 *  switches a triggered mutagen off (or, for MUT-08, between «урон 1» and «+2 карты»). */
function mutagensHtml(ps, f, tot, mine) {
    const list = ps.mutagens || [];
    if (!list.length) return '';
    const st = Object.fromEntries(((tot && tot.muts) || []).map(m => [m.id, m]));
    const cards = list.map(id => {
        const used = !!f.once['m' + id];
        const m = st[id];
        const cls = used ? 'used' : m && m.on ? 'on' : m && m.ok ? 'off' : '';
        const cap = used ? 'использован' : m && m.on ? (id === 'MUT-08' ? (S.ui.mut8 === 'draw' ? 'сработает: +2 карты' : 'сработает: урон 1') : 'сработает') : m && m.ok ? 'выключен' : MUTAGEN[id].when === 'end' ? 'в конце хода' : 'условие не выполнено';
        return `<div class="fmut ${cls}" ${mine && m && m.ok ? `data-mut="${id}"` : ''}>${mutagenCard(id, { cls: 'small', used })}<small>${cap}</small></div>`;
    }).join('');
    return `<div class="fmuts panel"><div class="ttl">Мутагены — раз за битву</div><div class="row2">${cards}</div></div>`;
}
function toggleMut(id, tot) {
    const off = S.ui.mutOff = S.ui.mutOff || [];
    if (id === 'MUT-08' && !off.includes(id)) {
        if ((S.ui.mut8 || 'dmg') === 'dmg') S.ui.mut8 = 'draw'; else { S.ui.mut8 = 'dmg'; off.push(id); }
    } else if (off.includes(id)) off.splice(off.indexOf(id), 1);
    else off.push(id);
    sfx('card');
    renderFight();
}
function toggleBlood() {
    const o = S.options && S.options.fight;
    if (S.ui.blood != null) { S.ui.blood = null; renderFight(); return; }
    if (!o || o.blood !== null) { if (o && o.blood) toast(o.blood); return; }
    S.ui.blood = 'armed';
    sfx('card');
    renderFight();
}
function addCard(id) {
    const combo = S.ui.combo;
    if (S.ui.blood === 'armed' && combo.length) S.ui.blood = combo.length;
    combo.push(id);
    sfx('card');
    renderFight();
}
export function playCombo() {
    const v = S.view, p = me(), f = v.fight;
    if (!f || !p) return;
    const combo = S.ui.combo || [];
    const free = !!(f.cur && f.cur.blizzard && combo.length >= 2 && linkIndex(CARDS[combo[combo.length - 2]], CARDS[combo[combo.length - 1]]) < 0);
    const blood = bloodAt();
    const e = comboError(v, p, combo, { free, blood });
    if (e) { toast(e); return; }
    sfx('sword');
    cmd({ t: 'combo', ids: combo.slice(), free, ...(blood != null ? { blood } : {}), ...mutOpts() }, 'комбинация');
    S.ui.combo = []; S.ui.blood = null;
}
export function fightKey(e) {
    const v = S.view;
    if (!v || !v.fight) { if (S.ui.fightResult && (e.key === 'Enter' || e.key === 'Escape')) { S.ui.fightResult = null; renderFight(); return true; } return false; }
    if (v.fight.seat !== S.you || v.fight.stage !== 'witcher' || v.prompt) return false;
    const p = me();
    if (e.key === 'Enter') { playCombo(); return true; }
    if (e.key === 'Backspace' || e.key === 'Escape') { S.ui.combo = (S.ui.combo || []).slice(0, -1); if (typeof S.ui.blood === 'number' && S.ui.blood >= S.ui.combo.length) S.ui.blood = null; renderFight(); return true; }
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
