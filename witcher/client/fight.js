// Monster fight table: monster card and life pool, the last attack, the combo builder with a
// live preview of damage/shield/draw (same comboTotals as the engine), elixirs, specialization,
// trophy abilities, fight log and the result screen.
import { S, $, cmd, me, btn, toast } from './ctx.js';
import { icon } from './icons.js';
import { actionCard, monsterCard, attackCard, mutagenCard, bigMonsterCard, specialCard, esc, trophyLabel } from './cards.js';
import { nextText, ROMAN, vulnText } from '/shared/data/vuln-data.mjs';
import { restrictError } from '/shared/engine/vuln.mjs';
import { MUTAGEN } from '/shared/data/trail-data.mjs';
import { bombOf } from '/shared/data/bombs-data.mjs';
import { CARDS, MONSTER, POTION, ATTACK } from '/shared/engine/util.mjs';
import { SCHOOLS, SPEC_TABLE, trailOn, isMage } from '/shared/data/rules-data.mjs';
import { linkIndex, comboTotals, comboError, bloodFx, wlinkIndex } from '/shared/engine/fight.mjs';
import { onceOf } from '/shared/engine/duel.mjs';
import { COLOR_SHORT } from '/shared/data/rules-data.mjs';
import { sfx } from './sound.js';

let logFrom = 0;
export function fightStarted(v) { logFrom = v.log.length ? v.log[v.log.length - 1].i - 8 : 0; S.ui.combo = []; S.ui.mpay = []; S.ui.blood = null; S.ui.wlink = null; S.ui.mutOff = []; S.ui.mut8 = 'dmg'; }
/** «Чародеи»: indices of the combo cards whose additional effect is paid with energy. */
const payOf = () => (S.ui.mpay || []).filter(i => i < (S.ui.combo || []).length && CARDS[S.ui.combo[i]] && CARDS[S.ui.combo[i]].extra);
/** Can `id` follow `prev` in a mage's combo: a printed link, or a link of any colour (printed or bought). */
const mageJoins = (prev, id, i) => linkIndex(prev, CARDS[id]) >= 0 || !!prev.fx.anyLink || !!(prev.extra && prev.extra.fx.anyLink)
    || (prev.special === 'philLink' && ['cat', 'owl'].includes(S.view.fight && S.view.fight.once && S.view.fight.once.philForm));   // «Трансформация»
/** Short text of a mage effect (fx of a card, its extra or a link). */
export function mageFxText(f) {
    const p = [];
    if (f.dmg) p.push(`урон ${f.dmg}`);
    if (f.dmgE) p.push('урон = энергия');
    if (f.barrier) p.push(`барьер ${f.barrier}`);
    if (f.barrierE) p.push('барьер = энергия');
    if (f.energy) p.push(`энергия +${f.energy}`);
    if (f.draw) p.push(`добор ${f.draw > 0 ? '+' : ''}${f.draw}`);
    if (f.drawE) p.push('добор + энергия');
    if (f.top) p.push('верхняя карта сброса');
    if (f.anyDiscard) p.push('любая карта из сброса');
    if (f.ret) p.push('эта карта вернётся в руку');
    if (f.anyLink) p.push('связь любого цвета');
    return p.join(', ') || 'нет эффекта';
}
/** Witcher fight: the seat shown in the bottom panel (you, when you take part) — set by renderFight. */
let focusSeat = null;
/** Трофей Цири in the combo builder: null, 'armed' or the index of the card it joins. */
const wlinkAt = () => (typeof S.ui.wlink === 'number' && S.ui.wlink < (S.ui.combo || []).length) ? S.ui.wlink : null;
/** Mutagen choices of the combo builder: switched-off mutagens and the MUT-08 effect. */
const mutOpts = () => ({ mutOff: S.ui.mutOff || [], mut8: S.ui.mut8 || 'dmg' });
/** Цири's «Старшая Кровь» in the combo builder: null (off), 'armed' (the next card joins with any
 *  colour) or the index of the card joined by the blood link. */
const bloodAt = () => (typeof S.ui.blood === 'number' && S.ui.blood < (S.ui.combo || []).length) ? S.ui.blood : null;

/** Number of the special attack the last monster card triggered (a special card or a legendary «N-я особая атака» side). */
function spN(la) {
    if (!la) return null;
    if (la.n) return la.n;
    const a = ATTACK[la.id], side = a && la.type && a[la.type];
    return side && side.k === 'special' ? side.n : null;
}
export function renderFight() {
    const v = S.view, el = $('fight');
    const f = v && v.fight;
    const res = S.ui.fightResult;
    if (!f && !res) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    el.classList.toggle('vuln', !!(f && f.vuln));
    if (!f && res) { renderResult(el, res); return; }
    S.ui.fightSnap = { mon: f.mon, seat: f.seat };
    const duel = f.kind === 'duel';
    // Witcher fight: a participant always sees itself below and the opponent on top.
    const focus = focusSeat = duel && (S.you === f.att || S.you === f.def) ? S.you : f.seat;
    const fighter = v.players[focus];
    const mine = f.seat === S.you;
    const p = focus === S.you ? me() : null;
    const m = duel ? null : MONSTER[f.mon];
    const opp = duel ? v.players[focus === f.att ? f.def : f.att] : null;
    const myStage = mine && f.stage === 'witcher' && !v.prompt;
    const o = S.options && S.options.fight;
    const combo = S.ui.combo = (S.ui.combo || []).filter(id => p && p.hand.includes(id));
    const mage = isMage(fighter);
    const pay = S.ui.mpay = payOf();
    const bOpt = o ? o.blood : undefined;               // undefined: not Цири; null: available; string: why not
    if (bOpt !== null && S.ui.blood === 'armed') S.ui.blood = null;
    if (typeof S.ui.blood === 'number' && S.ui.blood >= combo.length) S.ui.blood = null;
    const blood = bloodAt();
    const armed = S.ui.blood === 'armed';
    const wOpt = o ? o.wlink : undefined;               // трофей Цири: undefined — нет, null — доступен
    if (wOpt !== null && S.ui.wlink === 'armed') S.ui.wlink = null;
    if (typeof S.ui.wlink === 'number' && S.ui.wlink >= combo.length) S.ui.wlink = null;
    const wlink = wlinkAt();
    const wArmed = S.ui.wlink === 'armed' && combo.length > 0 && CARDS[combo[combo.length - 1]].links.length > 0;
    const lifePct = duel ? 0 : Math.max(0, Math.min(100, (f.lifeCount / m.life) * 100));
    const free = !!(f.cur && f.cur.blizzard && combo.length >= 2 && linkIndex(CARDS[combo[combo.length - 2]], CARDS[combo[combo.length - 1]]) < 0);
    const tot = p && mine && combo.length ? comboTotals(v, p, combo, { free, blood, wlink, pay, ...mutOpts() }) : null;
    const cErr = p && mine ? comboError(v, p, combo, { free, blood, wlink, pay }) : 'Не ваш ход';

    const last = f.lastAttack ? `<div class="lastatk"><span>${f.lastAttack.type === 'special' ? 'Особая атака' : 'Последняя атака'}</span>${f.lastAttack.type === 'special' ? specialCard(f.lastAttack.id, f.mon) : attackCard(f.lastAttack.id, f.lastAttack.type)}</div>` : '';
    // «Уязвимости и особые атаки»: restrictions in force now / next turn, monster's next turn, whole fight.
    const rulesNow = (f.vuln || f.legend) ? [
        ...nextText(f.cur && f.stage === 'witcher' ? f.cur.r : null).map(t => `<span title="Действует в этом ходу битвы">${esc(t)}</span>`),
        ...nextText(f.nextW).map(t => `<span class="next" title="Следующий ход ведьмака">след. ход: ${esc(t)}</span>`),
        ...(f.nextM && f.nextM.chooseType ? ['<span class="next">след. ход монстра: тип атаки выбирается после открытия карты</span>'] : []),
        ...(f.nextM && f.nextM.plus ? [`<span class="next">след. атака монстра: +${f.nextM.plus} урона</span>`] : []),
        ...(f.whole && f.whole.shieldCap != null ? [`<span>до конца битвы: щит растёт не больше чем на ${f.whole.shieldCap} за ход</span>`] : []),
        ...(f.whole && f.whole.defLess ? [`<span>до конца битвы: навык защиты −${f.whole.defLess}</span>`] : []),
        ...(f.vt && f.vt.ns.length ? [`<span class="vt" title="${esc(f.vt.ns.map(n => ROMAN[n - 1] + ': ' + vulnText(f.mon, n)).join('\n'))}">${icon('skull', 'c-vuln')} уязвимости: ${f.vt.ns.map(n => ROMAN[n - 1]).join(', ')}</span>`] : []),
        ...(f.cur && f.cur.ign && f.stage === 'witcher' && (f.cur.ign.all || f.cur.ign.half) ? [`<span>монстр игнорирует ${f.cur.ign.all ? 'весь урон' : 'половину урона'}</span>`] : []),
    ] : [];
    // The previous combo as one compact line (the cards themselves are in the log and discard).
    const lastCombo = f.lastCombo && f.lastCombo.ids.length ? `<div class="lastcombo"><span>Прошлая комбинация:</span> ${f.lastCombo.ids.map(id => esc(CARDS[id].name)).join(' › ')} <span class="fx dmg">${icon('sword')}<b>${f.lastCombo.dmg}</b></span></div>` : '';

    const comboHtml = combo.length ? combo.map((id, i) => {
        const prev = i > 0 ? CARDS[combo[i - 1]] : null;
        const arrow = !i ? '' : i === wlink ? `<span class="arrow blood" title="Трофей Цири: связь считается ${esc(COLOR_SHORT[CARDS[id].color])}">${icon('trophy')}</span>` : i === blood ? `<span class="arrow blood" title="Старшая Кровь: ${esc(COLOR_SHORT[CARDS[id].color])} связь">${icon('spec')}</span>` : '<span class="arrow">›</span>';
        const card = actionCard(id, { order: i + 1, cls: 'pick', linkHi: i < combo.length - 1 && i + 1 !== blood ? (i + 1 === wlink ? wlinkIndex(CARDS[id]) : linkIndex(CARDS[id], CARDS[combo[i + 1]])) : null });
        // «Чародеи»: the additional effect of the card — paid with energy when switched on.
        const ex = mage && CARDS[id].extra;
        const payBtn = ex ? `<button class="paytog ${pay.includes(i) ? 'on' : ''}" data-pay="${i}" title="${esc(`Доп. эффект за ${ex.all ? `всю энергию (не меньше ${ex.cost})` : `${ex.cost} энергии`}: ${mageFxText(ex.fx)}. Клик — включить/выключить.`)}">${pay.includes(i) ? '✓' : '+'} ${esc(mageFxText(ex.fx))} · ${ex.all ? `вся энергия (≥${ex.cost})` : `−${ex.cost} эн.`}</button>` : '';
        return arrow + (ex ? `<div class="paycard">${card}${payBtn}</div>` : card);
    }).join('') : `<span class="empty">${myStage ? 'Кликайте карты руки по порядку: каждая следующая должна совпадать по цвету со связкой предыдущей' + (bOpt === null ? '. «Старшая Кровь» один раз за битву соединит две любые карты' : '') : mine ? 'Подождите…' : `${esc(fighter.name)} сражается`}</span>`;

    const fbtns = [];
    if (myStage && o) {
        for (const e of o.elixirs) { const po = POTION[e.id.split('#')[0]]; fbtns.push(btn({ label: `${esc(po.name)}`, icon: icon('elixir', 'c-forest'), why: e.err, data: `data-el="${esc(e.id)}"`, small: true }).replace('<button', `<button title="${esc(po.text)}"`)); }
        for (const e of o.vulnElixir || []) { const po = POTION[e.id.split('#')[0]]; fbtns.push(btn({ label: `${esc(po.name)} → верхняя карта сброса`, icon: icon('skull', 'c-vuln'), why: e.err, data: `data-vel="${esc(e.id)}"`, small: true }).replace('<button', `<button title="Уязвимость: сбросьте неиспользованный эликсир, чтобы взять верхнюю карту своего сброса (считается в лимит алхимии)"`)); }
        for (const b of o.bombs || []) { const bd = bombOf(b.id); fbtns.push(btn({ label: `Бомба: ${esc(bd.name)}`, icon: icon('bomb', 'c-bomb'), why: b.err, data: `data-bomb="${esc(b.id)}"`, small: true }).replace('<button', `<button title="${esc(bd.text)}"`)); }
        const sc = SCHOOLS[p.school];
        for (const a of o.vulnActs || []) fbtns.push(btn({ label: esc(a.label), icon: icon('skull', 'c-vuln'), why: a.err, data: `data-vact="${a.i}"`, small: true }).replace('<button', `<button title="${esc(a.text)}"`));
        if (p.school === 'cat' || p.school === 'griffin' || p.school === 'manticore' || isMage(p)) fbtns.push(btn({ label: `Специализация: ${esc(sc.spec)}`, icon: icon('spec'), why: o.spec, data: 'data-spec="1"', small: true }));
        if (bOpt !== undefined) {
            const bf = bloodFx(p);
            const fxTxt = `${bf.dmg ? `урон ${bf.dmg}, ` : ''}${bf.draw >= 0 ? '+' : ''}${bf.draw} карт(а) в конце хода`;
            const label = blood != null ? 'Старшая Кровь: в комбинации' : armed ? 'Старшая Кровь: выберите карту' : 'Старшая Кровь';
            fbtns.push(btn({ label, icon: icon('spec'), why: blood != null ? null : bOpt, data: 'data-blood="1"', small: true, primary: armed || blood != null })
                .replace('<button', `<button title="${esc(`Раз за битву: следующая карта комбинации соединяется связью любого цвета (${fxTxt}). Повторный клик — отменить.`)}"`));
        }
        if (wOpt !== undefined) {
            const label = wlink != null ? 'Трофей Цири: в комбинации' : S.ui.wlink === 'armed' ? 'Трофей Цири: выберите карту' : 'Трофей Цири: связь любого цвета';
            fbtns.push(btn({ label, icon: icon('trophy'), why: wlink != null ? null : wOpt, data: 'data-wlink="1"', small: true, primary: S.ui.wlink != null })
                .replace('<button', `<button title="${esc('Раз за битву: одна связь последней карты комбинации считается цветом следующей карты (эффект связи — напечатанный). Повторный клик — отменить.')}"`));
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
            if (linkIndex(lastC, CARDS[id]) < 0 && !(mage && mageJoins(lastC, id)) && !(f.cur && f.cur.blizzard && !free) && !armed && !wArmed) { ok = false; why = bOpt === null ? 'Не соединяется с последней картой (можно через «Старшую Кровь»)' : 'Не соединяется с последней картой'; }
            if (f.cur && f.cur.onlyOne) { ok = false; why = 'Только 1 карта'; }
        }
        if (!mine && duel) { ok = false; why = 'Сейчас ход противника'; }
        if (ok) { const re = restrictError(f, p, [...combo, id]); if (re) { ok = false; why = re; } }
        if (ok && !combo.length && f.cur && f.cur.forcedFirst && p.hand.includes(f.cur.forcedFirst) && id !== f.cur.forcedFirst) { ok = false; why = 'Первой должна быть «' + CARDS[f.cur.forcedFirst].name + '»'; }
        return `<div class="hslot" style="margin-right:${-overlap}px" ${why ? `title="${esc(why)}"` : ''}>${actionCard(id, { cls: (ok ? 'pick can' : 'no') + ' huge' })}<kbd>${i + 1}</kbd></div>`;
    }).join('') : `<span style="color:var(--dim)">Рука ${esc(fighter.name)}: ${fighter.handCount} карт</span>`;

    const flog = v.log.filter(l => l.i >= logFrom).slice(-14).map(l => `<div>${esc(l.t)}</div>`).join('');
    const ps = fighter;
    el.innerHTML = `
    <div class="ftop"><b>${duel ? `Битва ведьмаков: ${esc(v.players[f.att].name)} против ${esc(v.players[f.def].name)}` : `${esc(fighter.name)} против: ${esc(m.name)}`}</b>
        <span class="turnbadge ${f.stage === 'witcher' && (!duel || mine) ? 'me' : ''}">${duel ? `Ходит ${esc(v.players[f.seat].name)} · ход ${Math.max(1, f.wTurns)}` : f.stage === 'witcher' ? `Ход ${isMage(v.players[f.seat]) ? 'чародея' : 'ведьмака'} ${Math.max(1, f.wTurns)}` : 'Ход монстра'}</span>
        ${duel && (f.bets || []).length ? `<span class="turnbadge" title="Ставки игроков, не участвующих в битве">${icon('coin')} ставки: ${f.bets.map(b => `${esc(v.players[b.seat].name)} → ${esc(v.players[b.on === 'att' ? f.att : f.def].name)}`).join(', ')}</span>` : ''}
        ${f.track ? `<span class="turnbadge">${icon('track')} жетон следа: ведьмак ходит первым</span>` : ''}
        ${f.legend ? `<span class="turnbadge" title="Урон за каждый ход битвы игрока снижается на уровень брони (памятка «Легендарной охоты», по шкале трофеев)">${icon('shield')} броня ${f.armorBase}${f.cur && f.turn === 'witcher' && f.cur.armor !== f.armorBase ? ` (в этом ходу ${f.cur.armor})` : ''}</span>` : ''}
        <span class="turnbadge" title="Лимит по навыку алхимии">${trailOn(v, 'bombs') ? 'Эликсиры и бомбы' : 'Эликсиры'}: ${f.elixirsUsed}</span>
        ${f.noAbility ? '<span class="turnbadge">Чёртов гриб: способность монстра не действует</span>' : ''}${f.moonDust ? '<span class="turnbadge">Лунная пыль: тип следующей атаки можно сменить</span>' : ''}</div>
    ${duel ? oppPanel(v, f, opp) : `<div class="mon">
        <div id="fMonCard">${f.vuln || f.legend ? bigMonsterCard(f.mon, { life: f.lifeCount, dice: f.dice, cls: 'infight', armor: f.legend ? (f.cur && f.turn === 'witcher' ? Math.max(0, f.cur.armor - (f.cur.armorUsed || 0)) : f.armorBase) : null, hi: f.stage !== 'witcher' ? spN(f.lastAttack) : null }) : monsterCard(f.mon, { big: true, life: f.lifeCount })}</div>
        <div class="pool"><div class="stack" id="fPool">${f.lifeCount}</div><div>Запас жизни монстра<div class="lifebar"><i style="width:${lifePct}%"></i></div><small style="color:var(--dim)">сброс атак: ${f.monDiscard.length}</small></div></div>
    </div>`}
    <div class="center">
        <div class="crow">${last}<div class="combo" id="fCombo">${comboHtml}</div></div>
        <div class="totals">${tot ? `<span class="fx dmg">${icon('sword')}<b>${tot.dmg}</b></span>${mage ? `<span class="fx shield" title="Энергия до и после комбинации">${icon('spec')}<b>${tot.energyStart}→${tot.energyEnd}</b></span><span class="fx barrier" title="Барьер: снижает урон следующего хода противника">${icon('shield')}<b>${tot.barrier || 0}</b></span>${tot.drawE ? `<span class="fx draw" title="Добор + энергия (на этапе 4)">${icon('draw')}<b>+${tot.drawE}×эн.</b></span>` : ''}` : `<span class="fx shield">${icon('shield')}<b>+${tot.shield}</b></span>`}<span class="fx draw">${icon('draw')}<b>${tot.draw}</b></span>${tot.top ? `<span class="fx top">${icon('top')}<b>${tot.top}</b></span>` : ''}${tot.ret.length ? `<span class="fx ret">${icon('ret')}<b>${tot.ret.length}</b></span>` : ''}${tot.dice.length ? `<span class="fx dice" title="Бросок кубика при розыгрыше">${icon('dice')}<b>${tot.dice.length}</b></span>` : ''}${tot.fixedDraw != null ? '<span class="bloodnote">Решающий удар: в конце хода — 0 карт</span>' : ''}${free ? '<span style="color:#9ccff0">Пурга: последняя карта без связки</span>' : ''}${tot.blood ? `<span class="bloodnote">Старшая Кровь: ${esc(COLOR_SHORT[tot.blood.color])} связь${tot.blood.off ? ' (подавлена)' : ''}</span>` : armed ? '<span class="bloodnote">Старшая Кровь: следующая карта — любого цвета</span>' : ''}` : armed ? '<span class="bloodnote">Старшая Кровь: следующая карта после первой — любого цвета</span>' : ''}</div>
        ${rulesNow.length ? `<div class="rules-now">${rulesNow.join('')}</div>` : ''}
        ${myStage ? `<div style="display:flex;gap:8px">${btn({ id: 'fPlay', label: combo.length ? `Разыграть (${combo.length})` : (!p.hand.length ? 'Пропустить (рука пуста)' : !cErr ? 'Пропустить (нет разрешённых карт)' : 'Разыграть'), primary: true, why: cErr, key: 'Enter' })}${combo.length ? btn({ id: 'fClear', label: 'Сбросить выбор', key: 'Backspace' }) : ''}</div>` : ''}
        ${lastCombo}
    </div>
    <div class="me">
        <div class="wit panel" id="fWit" style="border-color:${SCHOOLS[ps.school].color}">
            <div style="font-family:var(--serif);font-size:17px;color:var(--gold2)">${esc(ps.name)} · ${esc(SCHOOLS[ps.school].name)}</div>
            <div class="bigstat">
                ${isMage(ps) ? `<span class="c-shield" title="Энергия: тратится на доп. эффекты карт; урон её не снижает">${icon('spec')}${ps.shield}<small>энергия (макс. 4)</small></span><span title="Барьер: снижает урон следующего хода противника">${icon('shield')}${ps.barrier || 0}<small>барьер</small></span>`
                    : `<span class="c-shield">${icon('shield')}${ps.shield}<small>щит (макс. ${ps.skills.defense >= 4 ? 4 : ps.skills.defense})</small></span>${ps.barrier ? `<span title="Барьер: снижает урон следующего хода противника">${icon('shield')}${ps.barrier}<small>барьер</small></span>` : ''}`}
                <span>${icon('deck')}${ps.deckCount}<small>колода</small></span>
                <span>${icon('hand')}${ps.handCount}<small>рука</small></span>
            </div>
            <div style="font-size:12px;color:var(--dim);text-align:center">Жизнь ${isMage(ps) ? 'чародея' : 'ведьмака'} = колода + рука: ${ps.deckCount + ps.handCount}</div>
        </div>
        <div class="fbtns">${fbtns.join('')}</div>
        ${mutagensHtml(ps, duel ? { ...f, once: onceOf(f, ps.seat) } : f, tot, mine)}
        <div class="flog panel">${flog}</div>
    </div>
    <div class="fhand">${hand}</div>`;

    const fl = el.querySelector('.flog'); if (fl) fl.scrollTop = fl.scrollHeight;
    for (const c of el.querySelectorAll('.fhand .card.pick')) c.onclick = () => addCard(c.dataset.id);
    for (const c of el.querySelectorAll('#fCombo .card')) c.onclick = () => { const i = S.ui.combo.indexOf(c.dataset.id); S.ui.combo = S.ui.combo.slice(0, i); S.ui.mpay = (S.ui.mpay || []).filter(x => x < i); if (typeof S.ui.blood === 'number' && S.ui.blood >= i) S.ui.blood = null; if (typeof S.ui.wlink === 'number' && S.ui.wlink >= i) S.ui.wlink = null; sfx('card'); renderFight(); };
    for (const b of el.querySelectorAll('[data-blood]')) b.onclick = () => { toggleBlood(); };
    for (const b of el.querySelectorAll('[data-wlink]')) b.onclick = () => { toggleWlink(); };
    for (const b of el.querySelectorAll('[data-el]')) b.onclick = () => { sfx('elixir'); cmd({ t: 'elixir', id: b.dataset.el }, 'эликсир'); };
    for (const b of el.querySelectorAll('[data-vact]')) b.onclick = () => { sfx('card'); cmd({ t: 'vulnAct', i: Number(b.dataset.vact) }, 'уязвимость'); };
    for (const b of el.querySelectorAll('[data-pay]')) b.onclick = (e) => { e.stopPropagation(); const i = Number(b.dataset.pay); const cur = new Set(S.ui.mpay || []); if (cur.has(i)) cur.delete(i); else cur.add(i); S.ui.mpay = [...cur]; sfx('card'); renderFight(); };
    for (const b of el.querySelectorAll('[data-vel]')) b.onclick = () => { sfx('elixir'); cmd({ t: 'vulnElixir', id: b.dataset.vel }, 'уязвимость'); };
    for (const b of el.querySelectorAll('[data-bomb]')) b.onclick = () => { sfx('hit'); cmd({ t: 'bomb', id: b.dataset.bomb }, 'бомба'); };
    for (const c of el.querySelectorAll('.fmuts [data-mut]')) c.onclick = () => toggleMut(c.dataset.mut, tot);
    for (const b of el.querySelectorAll('[data-spec]')) b.onclick = () => cmd({ t: 'spec' }, 'специализация');
    for (const b of el.querySelectorAll('[data-act]')) b.onclick = () => cmd({ t: 'active', key: b.dataset.act }, 'трофей');
    const play = $('fPlay'); if (play) play.onclick = () => playCombo();
    const clr = $('fClear'); if (clr) clr.onclick = () => { S.ui.combo = []; S.ui.mpay = []; S.ui.blood = null; S.ui.wlink = null; renderFight(); };
}

/** Witcher fight: the opponent on top — school, shield, deck, hand, elixirs and witcher trophies. */
function oppPanel(v, f, q) {
    const sc = SCHOOLS[q.school];
    const onTurn = f.seat === q.seat;
    const tro = q.trophies.filter(t => t.kind === 'witcher').map(t => `<span class="turnbadge">${esc(trophyLabel(t))}</span>`).join('');
    return `<div class="mon duel">
        <div id="fMonCard" class="wit panel" style="border-color:${sc.color}">
            <div style="font-family:var(--serif);font-size:17px;color:var(--gold2)">${esc(q.name)} · ${esc(sc.name)}${onTurn ? ' · <span style="color:var(--gold)">ходит</span>' : ''}</div>
            <div class="bigstat">
                <span class="c-shield">${icon(isMage(q) ? 'spec' : 'shield')}${q.shield}<small>${isMage(q) ? 'энергия' : 'щит'}</small></span>${q.barrier ? `<span>${icon('shield')}${q.barrier}<small>барьер</small></span>` : ''}
                <span>${icon('deck')}${q.deckCount}<small>колода</small></span>
                <span>${icon('hand')}${q.handCount}<small>рука</small></span>
                <span>${icon('elixir', 'c-forest')}${q.elixirs.length}<small>эликсиры</small></span>
            </div>
            <div style="font-size:12px;color:var(--dim);text-align:center">Жизнь = колода + рука: ${q.deckCount + q.handCount} · сброс: ${q.discard.length}</div>
            ${tro ? `<div style="display:flex;gap:4px;flex-wrap:wrap;justify-content:center">${tro}</div>` : ''}
        </div>
        <div class="pool"><div style="font-size:13px;color:var(--dim);max-width:260px">Урон по ведьмаку: сначала щит, затем верх колоды, затем карты руки на выбор. Без карт в колоде и руке — потеря сознания.</div></div>
    </div>`;
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
function toggleWlink() {
    const o = S.options && S.options.fight;
    if (S.ui.wlink != null) { S.ui.wlink = null; renderFight(); return; }
    if (!o || o.wlink !== null) { if (o && o.wlink) toast(o.wlink); return; }
    S.ui.wlink = 'armed';
    sfx('card');
    renderFight();
}
function addCard(id) {
    const combo = S.ui.combo;
    if (S.ui.blood === 'armed' && combo.length) S.ui.blood = combo.length;
    // Трофей Цири: spent only where the cards really do not connect.
    else if (S.ui.wlink === 'armed' && combo.length && linkIndex(CARDS[combo[combo.length - 1]], CARDS[id]) < 0) S.ui.wlink = combo.length;
    // «Чародеи»: the previous card reaches this one only through its paid «связь любого цвета».
    const v = S.view, f = v && v.fight;
    if (f && isMage(me()) && combo.length) {
        const prev = CARDS[combo[combo.length - 1]];
        if (linkIndex(prev, CARDS[id]) < 0 && !prev.fx.anyLink && prev.extra && prev.extra.fx.anyLink) S.ui.mpay = [...new Set([...(S.ui.mpay || []), combo.length - 1])];
    }
    combo.push(id);
    sfx('card');
    renderFight();
}
export function playCombo() {
    const v = S.view, p = me(), f = v.fight;
    if (!f || !p) return;
    const combo = S.ui.combo || [];
    const free = !!(f.cur && f.cur.blizzard && combo.length >= 2 && linkIndex(CARDS[combo[combo.length - 2]], CARDS[combo[combo.length - 1]]) < 0);
    const blood = bloodAt(), wlink = wlinkAt();
    const pay = payOf();
    const e = comboError(v, p, combo, { free, blood, wlink, pay });
    if (e) { toast(e); return; }
    sfx('sword');
    cmd({ t: 'combo', ids: combo.slice(), free, ...(blood != null ? { blood } : {}), ...(wlink != null ? { wlink } : {}), ...(pay.length ? { pay } : {}), ...mutOpts() }, 'комбинация');
    S.ui.combo = []; S.ui.mpay = []; S.ui.blood = null; S.ui.wlink = null;
}
export function fightKey(e) {
    const v = S.view;
    if (!v || !v.fight) { if (S.ui.fightResult && (e.key === 'Enter' || e.key === 'Escape')) { S.ui.fightResult = null; renderFight(); return true; } return false; }
    if (v.fight.seat !== S.you || v.fight.stage !== 'witcher' || v.prompt) return false;
    const p = me();
    if (e.key === 'Enter') { playCombo(); return true; }
    if (e.key === 'Backspace' || e.key === 'Escape') { S.ui.combo = (S.ui.combo || []).slice(0, -1); S.ui.mpay = (S.ui.mpay || []).filter(x => x < S.ui.combo.length); if (typeof S.ui.blood === 'number' && S.ui.blood >= S.ui.combo.length) S.ui.blood = null; if (typeof S.ui.wlink === 'number' && S.ui.wlink >= S.ui.combo.length) S.ui.wlink = null; renderFight(); return true; }
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
    const v = S.view;
    if (r.kind === 'duel') {
        const w = v.players[r.winner], a = v.players[r.seat], d = v.players[r.vs];
        const lost = r.winner !== S.you && (S.you === r.seat || S.you === r.vs);
        const text = r.result === 'win' ? `${a.name} побеждает ${d.name}: золото по репутации проигравшего и трофей ведьмака (если такого ещё нет). ${d.name} берёт карту стоимостью 0 и 3 карты.`
            : `${d.name} отбивается от ${a.name}: золото по репутации, 4 карты. ${a.name} берёт карту стоимостью 0, в фазу III — на 1 карту меньше.`;
        el.innerHTML = `<div class="result"><b class="${lost ? 'lose' : ''}">Победа: ${esc(w.name)}</b>
            <span>${esc(text)} Корчма в этой локации закрыта для битв ведьмаков.</span>${btn({ id: 'fResOk', label: 'Продолжить', primary: true, key: 'Enter' })}</div>`;
        $('fResOk').onclick = () => { S.ui.fightResult = null; renderFight(); };
        return;
    }
    const m = MONSTER[r.mon];
    const who = v.players[r.seat];
    const text = m.legend ? (r.result === 'win' ? `${who.name} побеждает легендарного монстра — ${m.name} — и выигрывает партию!` : `${who.name} не смог победить: ${m.name}. Вместо обычных последствий — жетон руин из запаса и его бонус.`)
        : r.result === 'win' ? `${who.name} побеждает: ${m.name}. +2 золота и трофей.`
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
        if (e.k === 'witcherHit') { const id = S.view && S.view.fight && S.view.fight.kind === 'duel' && e.seat !== focusSeat ? 'fMonCard' : 'fWit'; floatNum(id, '−' + e.n); const c = $(id); if (c) { c.classList.remove('flash-red'); void c.offsetWidth; c.classList.add('flash-red'); } sfx('hit', 0.1); }
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
