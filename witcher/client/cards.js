// Card faces (DOM). Art is swappable per card: drop client/art/<ID>.jpg|png|webp and it is used
// instead of the generated placeholder (the server lists the folder in /art-index.json, so
// there are no 404 probes). Placeholders are deterministic vector compositions — every card
// id gets its own sky, ridge line, emblem and pattern, so cards stay distinguishable.
import { CARDS, MONSTER, ATTACK, POTION } from '/shared/engine/util.mjs';
import { COLOR_NAME, TERRAIN_NAME, SKILL_NAME } from '/shared/data/rules-data.mjs';
import { SKILLTROPHIES, WITCHERTROPHIES } from '/shared/data/gen-data.mjs';
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
const fxIcons = (f, big = false) => {
    const out = [];
    if (f.dmg) out.push(`<span class="fx dmg">${icon('sword')}<b>${f.dmg}</b></span>`);
    if (f.shield) out.push(`<span class="fx shield">${icon('shield')}<b>${f.shield}</b></span>`);
    if (f.draw) out.push(`<span class="fx draw">${icon('draw')}<b>${f.draw}</b></span>`);
    if (f.top) out.push(`<span class="fx top" title="Взять верхнюю карту колоды">${icon('top')}</span>`);
    if (f.ret) out.push(`<span class="fx ret" title="Вернуть карту в руку">${icon('ret')}</span>`);
    return out.join('');
};
export function fxText(f) {
    const p = [];
    if (f.dmg) p.push(`урон ${f.dmg}`);
    if (f.shield) p.push(`щит +${f.shield}`);
    if (f.draw) p.push(`взять ${f.draw}`);
    if (f.top) p.push('взять верхнюю карту колоды');
    if (f.ret) p.push('эта карта вернётся в руку');
    return p.join(', ') || 'нет эффекта';
}

/** Action card (starter or common). opts: {sel, dim, order, small, cost, mod, linkHi} */
export function actionCard(id, opts = {}) {
    const c = CARDS[id];
    if (!c) return `<div class="card blank"></div>`;
    const col = CARD_COLOR[c.color] || '#777';
    const links = c.links.map((l, i) => `<div class="link ${opts.linkHi === i ? 'hi' : ''}" style="--lc:${CARD_COLOR[l.color] || '#ccc'}" title="Связка: следующая ${esc(COLOR_NAME[l.color] || 'любая').toLowerCase()} → ${esc(fxText(l.fx))}"><i></i>${fxIcons(l.fx) || '<span class="fx none">—</span>'}</div>`).join('');
    const terr = c.terrain;
    const cost = opts.cost != null ? opts.cost : c.cost;
    const tip = `${c.name} — ${COLOR_NAME[c.color]}. ${fxText(c.fx)}. Стоимость ${c.cost}. Местность: ${TERRAIN_NAME[terr]}.` + c.links.map(l => ` Связка (${COLOR_NAME[l.color]}): ${fxText(l.fx)}.`).join('');
    return `<div class="card action ${opts.small ? 'small' : ''} ${opts.sel ? 'sel' : ''} ${opts.dim ? 'dim' : ''} ${opts.cls || ''}" data-id="${esc(id)}" style="--cc:${col}" title="${esc(tip)}">
        <div class="art" style="background-image:${artCss(id, col)}"></div>
        <div class="cost">${icon('coin')}<b>${cost}</b>${opts.mod ? `<s>${opts.mod > 0 ? '+' : ''}${opts.mod}</s>` : ''}</div>
        <div class="terr" style="--tc:${TERRAIN_COLOR[terr]}">${icon(terr)}</div>
        ${opts.order ? `<div class="order">${opts.order}</div>` : ''}
        <div class="name">${esc(c.name)}</div>
        <div class="main">${fxIcons(c.fx) || '<span class="fx none">—</span>'}</div>
        <div class="links">${links}</div>
        <div class="kind">${esc(COLOR_NAME[c.color] || '')}</div>
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

export function attackCard(id, type) {
    const a = ATTACK[id];
    if (!a) return '';
    const row = (k, ic, label) => `<div class="atk ${type === k ? 'on' : type ? 'off' : ''}">${icon(ic)}<b>${label}</b><span>${esc(a[k + 'Text'])}</span></div>`;
    return `<div class="card attack" data-id="${esc(id)}">${row('strike', 'strike', 'Удар')}${row('bite', 'bite', 'Укус')}</div>`;
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
export { SKILL_NAME };
