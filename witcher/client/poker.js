// Dice poker table: 3D CSS dice, reroll selection, result. Rolls come from the server RNG; the
// client only animates towards the faces it receives.
import { S, $, cmd, btn } from './ctx.js';
import { esc } from './cards.js';
import { pokerValue, POKER_NAMES, SOLO_POKER } from '/shared/engine/turn.mjs';
import { sfx } from './sound.js';

const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const FACE_ROT = { 1: [0, 0], 6: [0, 180], 2: [0, -90], 5: [0, 90], 3: [90, 0], 4: [-90, 0] };
const spins = { a: [0, 0, 0, 0, 0], b: [0, 0, 0, 0, 0] };
let shownKey = null, closedKey = null, sel = [];
let lastDice = { a: null, b: null };

function face(n) { return `<div class="f f${n}">${Array.from({ length: 9 }, (_, i) => `<i class="${PIPS[n].includes(i) ? 'on' : ''}"></i>`).join('')}</div>`; }
function die(side, i, val, pickable, isSel, dark) {
    const [rx, ry] = FACE_ROT[val];
    const s = spins[side][i];
    return `<div class="die ${pickable ? 'pick' : ''} ${isSel ? 'sel' : ''} ${dark ? 'dark' : ''}" data-i="${i}" style="transform:rotateX(${rx + s * 360}deg) rotateY(${ry + s * 720}deg)">${[1, 2, 3, 4, 5, 6].map(face).join('')}</div>`;
}

export function renderPoker(events = []) {
    const v = S.view, el = $('poker');
    const pk = v && v.poker;
    if (!pk) { el.classList.add('hidden'); return; }
    const key = `${pk.seat}:${v.round}:${v.log.length > 0 ? v.log.filter(l => l.kind === 'poker').length : 0}`;
    const startKey = pk.seat + ':' + JSON.stringify(pk.rerolledB) + (pk.done ? '' : JSON.stringify(pk.a));
    if (pk.done && closedKey === key) { el.classList.add('hidden'); return; }
    // Spin dice that changed (or were just rolled).
    for (const side of ['a', 'b']) {
        const d = pk[side];
        if (!d) continue;
        const prev = lastDice[side];
        for (let i = 0; i < 5; i++) if (!prev || prev[i] !== d[i] || events.some(e => (e.k === 'pokerRoll') || (e.k === 'pokerReroll' && e.who === side && e.idx.includes(i)))) spins[side][i] += 1;
        lastDice[side] = d.slice();
    }
    if (events.some(e => e.k === 'pokerRoll' || e.k === 'pokerReroll')) sfx('dice');
    const p = v.players[pk.seat];
    const mine = pk.seat === S.you;
    const myPrompt = v.prompt && !v.prompt.foreign && v.prompt.kind === 'dice';
    if (!myPrompt) sel = [];
    const va = pokerValue(pk.a)[0];
    const vb = pk.b ? pokerValue(pk.b)[0] : null;
    const result = pk.done
        ? pk.res ? pk.res : (v.solo ? `${POKER_NAMES[va]}: +${pk.reward ?? SOLO_POKER[va]} золота` : pk.winner === 'a' ? `${p.name} выигрывает ${pk.pot} золота` : 'Горожане забирают ставку')
        : myPrompt ? 'Выберите кубики для переброса' : `${p.name} думает…`;
    el.classList.remove('hidden');
    el.innerHTML = `<div class="tbl"><h2>Покер на костях</h2>
        ${pk.b ? `<div class="side"><div class="who">${esc(pk.opp || 'Горожане')}<small>${POKER_NAMES[vb]}</small></div><div class="dice">${pk.b.map((d, i) => die('b', i, d, false, false, true)).join('')}</div></div>` : ''}
        <div class="side"><div class="who">${esc(p.name)}<small>${POKER_NAMES[va]}</small></div><div class="dice" id="pkA">${pk.a.map((d, i) => die('a', i, d, myPrompt, sel.includes(i), false)).join('')}</div></div>
        <div class="res">${esc(result)}</div>
        <div class="foot">${myPrompt ? btn({ id: 'pkGo', label: sel.length ? `Перебросить ${sel.length}` : 'Оставить как есть', primary: true, key: 'Enter' }) : ''}
            ${pk.done ? btn({ id: 'pkClose', label: 'Закрыть', primary: true, key: 'Enter' }) : ''}</div>
        <div class="ranks">Пара &lt; две пары &lt; тройка &lt; малый стрит 1–5 &lt; большой стрит 2–6 &lt; фул-хаус &lt; каре &lt; покер. ${pk.vs === 'fixed' ? 'Нужна комбинация строго лучше.' : v.solo ? 'Одиночная игра: выплата по комбинации.' : 'Ничья — в пользу игрока.'}</div></div>`;
    if (myPrompt) for (const d of el.querySelectorAll('#pkA .die')) d.onclick = () => {
        const i = Number(d.dataset.i);
        if (sel.includes(i)) sel.splice(sel.indexOf(i), 1); else sel.push(i);
        sfx('click');
        renderPoker();
    };
    const go = $('pkGo'); if (go) go.onclick = () => { cmd({ t: 'answer', ids: sel.slice().sort() }, 'переброс'); sel = []; };
    const cl = $('pkClose'); if (cl) cl.onclick = () => { closedKey = key; el.classList.add('hidden'); };
    if (pk.done && !mine) setTimeout(() => { if (closedKey !== key) { closedKey = key; el.classList.add('hidden'); } }, 5000);
    if (pk.done && events.some(e => e.k === 'pokerEnd')) sfx(pk.winner === 'a' ? 'coin' : 'lose', 0.9);
}
export function pokerKey(e) {
    const el = $('poker');
    if (el.classList.contains('hidden')) return false;
    if (e.key === 'Enter' || e.key === 'Escape') { const b = $('pkGo') || $('pkClose'); if (b && (e.key === 'Enter' || b.id === 'pkClose')) b.click(); return true; }
    if (/^[1-5]$/.test(e.key) && $('pkGo')) { const i = Number(e.key) - 1; if (sel.includes(i)) sel.splice(sel.indexOf(i), 1); else sel.push(i); renderPoker(); return true; }
    return false;
}
