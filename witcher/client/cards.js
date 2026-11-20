// Card faces (DOM). Art is swappable per card: drop client/art/<ID>.jpg|png|webp and it is used
// instead of the generated placeholder (the server lists the folder in /art-index.json, so
// there are no 404 probes). Placeholders are deterministic vector compositions — every card
// id gets its own sky, ridge line, emblem and pattern, so cards stay distinguishable.
import { CARDS, MONSTER, ATTACK, POTION, LOC } from '/shared/engine/util.mjs';
import { COLOR_NAME, TERRAIN_NAME, SKILL_NAME } from '/shared/data/rules-data.mjs';
import { SKILLTROPHIES, WITCHERTROPHIES } from '/shared/data/gen-data.mjs';
import { EVENTS } from '/shared/data/events-data.mjs';
import { icon, CARD_COLOR, TERRAIN_COLOR } from './icons.js';

let ART = {};
export async function loadArtIndex() {
    try { ART = await (await fetch('/art-index.json')).json(); } catch { ART = {}; }
}
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export { esc };

function hash(s) {
    let h = 2166136261;
    for (const ch of s) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
    // murmur3 finaliser: ids differ only in the last digits, spread them over all bits
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
    return h >>> 0;
}
function rng(seed) { let a = seed; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const EMBLEMS = ['sword', 'shield', 'spec', 'skull', 'eye', 'alchemy', 'combat', 'bite', 'strike', 'crown', 'forest', 'mountain', 'water', 'potion', 'meditate', 'explore'];
const placeholderCache = new Map();
/** Deterministic placeholder art (SVG data URI) for any card id. */
export function placeholder(id, base = '#666', emblem = null) {
    const key = id + base + emblem;
    if (placeholderCache.has(key)) return placeholderCache.get(key);
    const r = rng(hash(id));
    const hue = Math.floor(r() * 360);
    const sky1 = `hsl(${hue},38%,${18 + r() * 10}%)`, sky2 = `hsl(${(hue + 40) % 360},45%,${34 + r() * 14}%)`;
    let ridge = 'M0 120', ridge2 = 'M0 130';
    const n = 5 + Math.floor(r() * 5);
    for (let i = 0; i <= n; i++) { ridge += ` L${(i / n) * 200} ${70 + r() * 45}`; ridge2 += ` L${(i / n) * 200} ${95 + r() * 35}`; }
    ridge += ' L200 160 L0 160Z'; ridge2 += ' L200 160 L0 160Z';
    const stars = Array.from({ length: 6 + Math.floor(r() * 10) }, () => `<circle cx="${(r() * 200).toFixed(1)}" cy="${(r() * 70).toFixed(1)}" r="${(0.5 + r() * 1.4).toFixed(1)}" fill="#fff" opacity="${(0.25 + r() * 0.5).toFixed(2)}"/>`).join('');
    const moon = `<circle cx="${(30 + r() * 140).toFixed(0)}" cy="${(18 + r() * 30).toFixed(0)}" r="${(8 + r() * 12).toFixed(0)}" fill="hsl(${(hue + 180) % 360},60%,80%)" opacity=".55"/>`;
    const em = emblem || EMBLEMS[Math.floor(r() * EMBLEMS.length)];
    const rot = Math.floor(r() * 30 - 15);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 160"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky1}"/><stop offset="1" stop-color="${sky2}"/></linearGradient>`
        + `<radialGradient id="v" cx=".5" cy=".45" r=".7"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".6"/></radialGradient></defs>`
        + `<rect width="200" height="160" fill="url(#g)"/>${stars}${moon}`
        + `<path d="${ridge}" fill="${base}" opacity=".55"/><path d="${ridge2}" fill="#0c0d10" opacity=".8"/>`
        + `<g transform="translate(100 78) rotate(${rot}) scale(2.6) translate(-12 -12)" color="#f4ead2" opacity=".9">${iconBody(em)}</g>`
        + `<rect width="200" height="160" fill="url(#v)"/></svg>`;
    const uri = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg).replace(/'/g, '%27');
    placeholderCache.set(key, uri);
    return uri;
}
function iconBody(name) { return icon(name).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, ''); }

/** CSS background for a card's art window: real art if present, else the placeholder. */
export function artCss(id, base, emblem) {
    const file = ART[id];
    return file ? `url('art/${encodeURI(file)}')` : `url('${placeholder(id, base, emblem)}')`;
}

// ---------------------------------------------------------------------------------------------
export function fxText(f) {
    const p = [];
    if (f.dmg) p.push(`урон ${f.dmg}`);
    if (f.shield) p.push(`щит +${f.shield}`);
    if (f.draw) p.push(`взять ${f.draw}`);
    if (f.top) p.push('взять верхнюю карту колоды');
    if (f.ret) p.push('эта карта вернётся в руку');
    return p.join(', ') || 'нет эффекта';
}

// ---------------------------------------------------------------------------------------------
// Printed faces 1:1. Every face is laid out in the scan's own pixel space (579 × 899) and scaled
// with --k, so positions measured on the original cards (tools/frames.mjs, GEO) are used as is.
// Layer order of an action card: art → link tabs → frame of the card colour (stripe, ornament,
// map strip, plate, cost box) → terrain medallion, school emblem → icons, name, cost.
const A = 'assets/cards/';
const img = (n, cls = '', st = '') => `<img class="${cls}" src="${A}${n}.webp" style="${st}" alt="" draggable="false">`;
const svgI = (vb, body, cls) => `<svg class="${cls}" viewBox="${vb}" fill="none" stroke="#f4efe3" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const HAND = '<path d="M13 70V57a2.4 2.4 0 0 1 4.8 0v-4a2.4 2.4 0 0 1 4.8 0v-1a2.4 2.4 0 0 1 4.8 0v2a2.4 2.4 0 0 1 4.8 0v10c0 4-3 7-7 7h-5c-3 0-5-2-7.2-4.5z" fill="#f4efe3" stroke="none"/>';
// Glyphs not cut from the scans (thin line art) — redrawn after the printed ones.
const GLYPH_SVG = {
    tray: () => svgI('0 0 48 20', '<path d="M3 4l5 12h32l5-12"/><path d="M17 4l7 6 7-6"/>', 'g tray'),
    stack: () => svgI('0 0 48 30', '<path d="M4 8l20-6 20 6-20 6z"/><path d="M4 15l20 6 20-6"/><path d="M4 22l20 6 20-6"/>', 'g stack'),
    top: () => svgI('0 0 44 76', '<rect x="10" y="3" width="24" height="30" rx="2"/><path d="M15 8v20l14-20v20"/><path d="M22 37v10m-5-5l5 5 5-5"/>' + HAND, 'g top'),
    ret: () => svgI('0 0 44 76', '<rect x="8" y="3" width="24" height="32" rx="2"/><path d="M20 10v12m0 6v.5"/><path d="M36 46a12 12 0 0 1-8 14"/><path d="M27 55l1 5 5-1"/>' + HAND, 'g ret'),
};
/** Strip/tab icon column for an effect, exactly as printed: one slash per damage, shield badge,
 *  ±N over a tray (1 card) or a stack (several), the "top card" and "return" glyphs. */
function fxGlyphs(f) {
    const out = [];
    for (let i = 0; i < (f.dmg || 0); i++) out.push(img('glyph-slash', 'g slash'));
    if (f.shield) for (let i = 0; i < f.shield; i++) out.push(img('glyph-shield', 'g shield'));
    if (f.draw) out.push(`<div class="g draw"><b>${f.draw > 0 ? '+' : '−'}${Math.abs(f.draw)}</b>${Math.abs(f.draw) > 1 ? GLYPH_SVG.stack() : GLYPH_SVG.tray()}</div>`);
    if (f.top) out.push(GLYPH_SVG.top());
    if (f.ret) out.push(GLYPH_SVG.ret());
    return out.join('');
}
// Link tab slot per target colour (measured: the tab sits where its colour is, top to bottom).
const TAB = { green: [100, -14], yellow: [95, 94], purple: [86, 196], blue: [76, 299], red: [66, 402] };
const nameSize = (name) => Math.min(27, Math.floor(250 / (name.length * 0.56)));

/** Action card (starter or common). opts: {sel, dim, order, small, cost, mod, linkHi} */
export function actionCard(id, opts = {}) {
    const c = CARDS[id];
    if (!c) return `<div class="card blank"></div>`;
    const col = CARD_COLOR[c.color] || '#777';
    const terr = c.terrain;
    const cost = opts.cost != null ? opts.cost : c.cost;
    const tabs = c.links.map((l, i) => {
        const [x, y] = TAB[l.color] || TAB.red;
        return `<div class="tab ${opts.linkHi === i ? 'hi' : ''}" style="left:${x}px;top:${y}px" title="Связка: следующая ${esc(COLOR_NAME[l.color] || 'любая').toLowerCase()} → ${esc(fxText(l.fx))}">
            <i style="background-image:url('${A}tab-${l.color}.webp')"></i>
            <div class="ic ${l.color === 'green' ? 'up' : ''}">${fxGlyphs(l.fx)}</div></div>`;
    }).join('');
    const tip = `${c.name} — ${COLOR_NAME[c.color]}. ${fxText(c.fx)}. Стоимость ${c.cost}. Местность: ${TERRAIN_NAME[terr]}.` + c.links.map(l => ` Связка (${COLOR_NAME[l.color]}): ${fxText(l.fx)}.`).join('');
    const cc = cost < c.cost ? 'down' : cost > c.cost ? 'up' : '';
    return `<div class="card action ${opts.small ? 'small' : ''} ${opts.sel ? 'sel' : ''} ${opts.dim ? 'dim' : ''} ${opts.cls || ''}" data-id="${esc(id)}" style="--cc:${col}" title="${esc(tip)}">
        <div class="face">
            <div class="art" style="background-image:${artCss(id, col)}"></div>
            ${tabs}
            ${img('frame-' + c.color, 'frame')}
            ${img('terrain-' + terr, 'terr')}
            ${c.school ? img('emblem-' + c.school, 'emblem') : ''}
            <div class="strip">${fxGlyphs(c.fx)}</div>
            <div class="nm" style="font-size:${nameSize(c.name)}px">${esc(c.name)}</div>
            <div class="cs ${cc}">${cost}</div>
        </div>
        ${opts.mod ? `<div class="cmod ${opts.mod < 0 ? 'down' : 'up'}">${opts.mod > 0 ? '+' : '−'}${Math.abs(opts.mod)}</div>` : ''}
        ${opts.order ? `<div class="order">${opts.order}</div>` : ''}
    </div>`;
}

export function cardBack(kind = 'action', label = '') {
    return `<div class="card back ${kind}"><div class="emb">${icon(kind === 'monster' ? 'skull' : kind === 'elixir' ? 'elixir' : 'spec')}</div>${label ? `<b>${esc(label)}</b>` : ''}</div>`;
}

export function monsterCard(id, opts = {}) {
    const m = MONSTER[id];
    if (!m) return '';
    const lv = ['', 'I', 'II', 'III'][m.level];
    return `<div class="card monster lv${m.level} ${opts.big ? 'big' : ''} ${opts.cls || ''}" data-id="${esc(id)}" title="${esc(m.name + '. ' + m.ability)}">
        <div class="art" style="background-image:${artCss(id, '#5a2a2a', 'skull')}"></div>
        <div class="lv">${lv}</div>
        <div class="life">${icon('card')}<b>${opts.life != null ? opts.life : m.life}</b></div>
        <div class="name">${esc(m.name)}</div>
        <div class="txt">${esc(m.ability)}</div>
        ${opts.trophy ? `<div class="txt trophy"><i>${icon('trophy')}</i>${esc(m.trophy)}</div>` : ''}
    </div>`;
}

// Monster attack card: background (frame + both pentagons) cut from the scans; parchment panel
// is a border-image; texts are the printed ones; icons are the printed glyphs.
const SKILL_GEN = { combat: 'сражения', defense: 'защиты', alchemy: 'алхимии', spec: 'специализации' };
const ROMAN = ['I', 'II', 'III'];
const hex = (lv) => `<svg class="hex" viewBox="0 0 40 46" fill="none" stroke="#f4efe3" stroke-width="3.4" stroke-linejoin="round"><path d="M20 3l15 8.5v23L20 43 5 34.5v-23z"/>${Array.from({ length: lv + 1 }, (_, i) => `<path d="M${20 + (i - lv / 2) * 6} 15v16"/>`).join('')}</svg>`;
const slashes = (n, cls = '') => Array.from({ length: n }, () => img('glyph-slash', 'g slash ' + cls)).join('');
function attackSide(e) {
    let text, icons;
    if (e.k === 'dmg' && !e.lvl) { text = `Игрок получает ${e.n} урона.`; icons = `<div class="arow">${slashes(e.n)}</div>`; }
    else if (e.k === 'dmg') { text = `Игрок получает ${e.lvl.join(', ').replace(/, (\d+)$/, ' или $1')} единиц урона в зависимости от уровня монстра.`; icons = levels(e.lvl.map(n => `<span class="pile">${slashes(n, 'sm')}</span>`)); }
    else if (e.k === 'skill') { text = `Игрок понижает свой навык <b>${SKILL_GEN[e.skill].toUpperCase()}</b> на 1, а также получает 0–2 урона согласно уровню монстра:`; icons = levels(e.lvl.map(n => `<span class="pile">${slashes(n, 'sm')}</span>`)); }
    else if (e.k === 'dmgSkill') { text = `Игрок получает урон, равный его уровню <b>${SKILL_GEN[e.skill].toUpperCase()}</b>.`; icons = `<div class="arow">${img('glyph-slash', 'g slash')}<span class="eq">=</span>${img('glyph-' + e.skill, 'g skill')}</div>`; }
    else if (e.k === 'remove') { text = 'Игрок убирает из игры 1 карту из своей руки (если в руке нет карт то верхнюю карту из своей колоды).'; icons = `<div class="arow">${img('glyph-burn', 'g burn')}</div>`; }
    else if (e.k === 'randDiscard') { text = 'Игрок сбрасывает несколько случайных карт из своей руки в зависимости от уровня монстра:'; icons = levels(e.lvl.map(n => `<span class="x">x${n}</span>`)); }
    else { text = ''; icons = ''; }
    return { text, icons, long: text.replace(/<[^>]+>/g, '').length > 30 };
}
const levels = (cells) => `<div class="arow lv">${cells.map((c, i) => `<span class="lvc">${hex(i)}<i>:</i>${c}</span>`).join('')}</div>`;

export function attackCard(id, type, opts = {}) {
    const a = ATTACK[id];
    if (!a) return '';
    const sec = (k) => {
        const s = attackSide(a[k]);
        return `<div class="sec ${k} ${type === k ? 'on' : type ? 'off' : ''}"><div class="apanel ${s.long ? 'long' : ''}"><span>${s.text}</span></div><div class="icons">${s.icons}</div></div>`;
    };
    return `<div class="card attack ${opts.small ? 'small' : ''} ${opts.cls || ''}" data-id="${esc(id)}" title="${esc('Удар: ' + a.strikeText + '. Укус: ' + a.biteText + '.')}">
        <div class="face">${img('attack-bg', 'frame')}${sec('strike')}${sec('bite')}</div></div>`;
}

export function elixirCard(inst, opts = {}) {
    const id = String(inst).split('#')[0];
    const e = POTION[id];
    if (!e) return '';
    return `<div class="card elixir ${opts.sel ? 'sel' : ''} ${opts.dim ? 'dim' : ''}" data-id="${esc(inst)}" title="${esc(e.name + ': ' + e.text)}">
        <div class="art" style="background-image:${artCss(id, '#2c5a4a', 'potion')}"></div>
        <div class="name">${esc(e.name)}</div><div class="txt">${esc(e.text)}</div></div>`;
}

export function trophyCard(t) {
    if (t.kind === 'monster') return monsterCard(t.id, { trophy: true, cls: 'trophy-card' });
    if (t.kind === 'skill') {
        const sk = SKILLTROPHIES.find(s => s.id === String(t.id).split('#')[0]);
        return `<div class="card skilltrophy" title="${esc(sk ? sk.text : '')}"><div class="art" style="background-image:${artCss(String(t.id).split('#')[0], '#3a3a5a', 'spec')}"></div><div class="name">${esc(sk ? sk.title : t.id)}</div><div class="txt">${esc(sk ? sk.text : '')}</div></div>`;
    }
    if (t.kind === 'witcher') return `<div class="card skilltrophy"><div class="name">Трофей ведьмака</div><div class="txt">${esc(WITCHERTROPHIES[t.id] || '')}</div></div>`;
    return '';
}
export function trophyLabel(t) {
    if (t.kind === 'monster') return MONSTER[t.id] ? MONSTER[t.id].name : t.id;
    if (t.kind === 'skill') { const sk = SKILLTROPHIES.find(s => s.id === String(t.id).split('#')[0]); return sk ? sk.title : 'Навык'; }
    if (t.kind === 'witcher') return 'Трофей ведьмака';
    return '?';
}

// ---------------------------------------------------------------------------------------------
// Event cards — the printed layout 1:1: parchment (assets/cards/event-bg.webp, cut from the
// scans), intro, options А/Б in dark discs, the «—∞✿∞—» divider, outcomes with the effect in
// bold. stage: 'choose' — outcomes are still covered (in the box game the neighbour reads them
// only after the choice); 'outcome' — the picked one is lit, the other dimmed; 'full' — all.
// Equipment cards are art + a parchment box, the art is swappable like any other (art/<ID>.*).
const STAR = '<svg class="evq" viewBox="0 0 24 24"><path d="M12 1.5l2.3 7.2 7.2 2.3-7.2 2.3L12 20.5l-2.3-7.2L2.5 11l7.2-2.3z" fill="#2a2420"/><path d="M12 6.5l1.2 3.6 3.6 1.2-3.6 1.2L12 16.1l-1.2-3.6-3.6-1.2 3.6-1.2z" fill="#e9dcc3"/></svg>';
const BOOK = '<svg class="evb" viewBox="0 0 26 20"><path d="M1 3c4-1.6 8-1.4 11.4.8V19C8.6 17 5 16.8 1 18.2zM25 3c-4-1.6-8-1.4-11.4.8V19c3.8-2 7.4-2.2 11.4-.8z" fill="#2a2420"/></svg>';
const para = (t) => t.split('\n').map(l => `<p class="${/^«/.test(l) ? 'q' : ''}">${esc(l)}</p>`).join('');
const disc = (k) => `<b class="evd">${k === 'a' ? 'А' : 'Б'}</b>`;
function effectHtml(o) {
    const q = o.fx && o.fx.find(e => e.quest);
    if (!q) return `<p class="eff">${br(o.effect)}</p>`;
    // The printed effect without its quest part, then the quest block (star, place, book number).
    const rest = (o.effect || '').replace(/(При любом результате: )?Задание:.*$/s, '').trim();
    const Q = q.quest;
    const where = Q.terrain ? `${TERRAIN_ADJ[Q.terrain]} локация` : Q.school ? 'локация вашей школы' : `${LOC[Q.loc].name} (${Q.loc})`;
    const pay = Q.gold ? `сбросьте ${Q.gold} золота, чтобы взять ` : '';
    return `${rest ? `<p class="eff">${br(rest)}</p>` : ''}<div class="evquest">${STAR}<div><b>Задание: ${esc(where)}.</b><br><b>В локации: ${pay}${BOOK} ${EVENTS[Q.event].num}.</b></div></div>`;
}
const TERRAIN_ADJ = { forest: 'лесная', mountain: 'горная', water: 'водная' };
const br = (s) => esc(s || '').replace(/\n/g, '<br>');
export function eventCard(id, opts = {}) {
    const ev = EVENTS[id];
    if (!ev) return '';
    const st = opts.stage || 'full';
    if (ev.gear) {
        return `<div class="evcard gear ${opts.small ? 'small' : ''} ${opts.cls || ''}" data-id="${esc(id)}" title="${esc(ev.name + ': ' + ev.text)}">
            <div class="evart" style="background-image:${artCss(id, '#6a4a2a', 'combat')}"></div>
            <div class="evbox"><div class="evkind">${esc(ev.kind || 'Снаряжение')}</div><p>Положите эту карту перед собой.</p><img class="evdiv" src="${A}event-div.webp" alt="">
            <div class="evname">${esc(ev.name)}</div><p class="eff"><b>Один раз за битву:</b><br>${esc(ev.text.replace(/^(Снаряжение\. )?Один раз за битву:\s*/, ''))}</p></div></div>`;
    }
    let body = para(ev.intro);
    if (ev.a) {
        const line = (k) => `<div class="evopt ${opts.pick === k ? 'on' : ''}" ${opts.choose ? `data-c="${k}"` : ''}>${disc(k)}<span>${esc(ev[k].label)}</span></div>`;
        const res = (k) => `<div class="evres ${st === 'outcome' && opts.pick !== k ? 'off' : ''} ${opts.pick === k ? 'on' : ''}">${disc(k)}<span>${esc(ev[k].outcome)}</span>${effectHtml(ev[k])}</div>`;
        body += line('a') + line('b') + `<img class="evdiv" src="${A}event-div.webp" alt="">`;
        body += st === 'choose' ? `<div class="evhide"><span>Последствия откроются после выбора</span></div>` : res('a') + res('b');
    } else if (ev.fx && ev.fx.some(e => e.roll)) {
        const r = ev.fx.find(e => e.roll);
        const head = !r.by ? 'Бросьте кубик:' : r.by === 'level' ? 'По уровню ведьмака:' : `По навыку ${SKILL_GEN_C[r.by]}:`;
        body += `<p class="eff">${head}</p>` + r.roll.map(b => `<div class="evroll ${opts.dice ? (opts.dice >= b.from && opts.dice <= b.to ? 'on' : 'off') : ''}"><b class="rng">${b.from === b.to ? b.from : b.from + '–' + b.to}:</b><div>${b.text ? `<p>${esc(b.text)}</p>` : ''}${b.effect ? `<p class="eff">${esc(b.effect)}</p>` : ''}</div></div>`).join('');
        const tail = ev.effect.split('\n').filter(l => l.startsWith('При любом результате'));
        if (tail.length) body += `<p class="eff">${br(tail.join('\n'))}</p>`;
    } else if (ev.effect) {
        body += `<img class="evdiv" src="${A}event-div.webp" alt="">` + effectHtml(ev);
    }
    return `<div class="evcard ${opts.small ? 'small' : ''} ${opts.cls || ''}" data-id="${esc(id)}">${body}</div>`;
}
export { SKILL_NAME };
const SKILL_GEN_C = { combat: 'сражения', defense: 'защиты', alchemy: 'алхимии', spec: 'специализации' };
