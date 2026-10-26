// cards.js — card / item descriptions and HTML rendering for the client (Russian text + icons).

import { CHARACTERS, FIELD_DATA, ITEMS, WOUNDS } from '/shared/data/cards.mjs';

export function describeCard(cardId) {
    if (cardId.startsWith('contam#')) return { name: 'Заражение', text: 'Нельзя разыграть или сбросить для оплаты. Проверяется в Хирургии, Автодоком или картой «Отдых».', contam: true };
    const base = cardId.split('#')[0];
    const [owner, key] = base.split('.');
    if (owner === 'field') return Object.assign({ field: true }, FIELD_DATA[key]);
    const ch = CHARACTERS[owner];
    return ch && ch.cards[key] ? ch.cards[key] : { name: cardId, text: '' };
}

export function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]); }

/** Hand card element. info = {enabled, reason} from the turn menu (optional). */
/** Characters whose action decks have illustrations in client/art/<charId>/<cardKey>.jpg. */
const ART_DECKS = { android: ['alwaysPrepared', 'computerSkills', 'deactivation', 'demolition', 'fastRepairs', 'interruption', 'powerUp', 'protocolOverride', 'search', 'selfRepair'] };
function cardArt(cardId) {
    const [owner, key] = cardId.split('#')[0].split('.');
    return ART_DECKS[owner] && ART_DECKS[owner].includes(key) ? 'art/' + owner + '/' + key + '.jpg' : null;
}

export function cardHtml(cardId, info, selected) {
    const d = describeCard(cardId);
    const cls = ['card'];
    if (d.contam) cls.push('contam'); if (d.field) cls.push('field');
    if (info && info.enabled) cls.push('playable'); else if (info) cls.push('disabled');
    if (selected) cls.push('selected');
    const icon = d.contam ? '☣' : d.reaction ? '⚡' : d.field ? '📡' : '';
    const art = cardArt(cardId);
    if (art) cls.push('with-art');
    return '<div class="' + cls.join(' ') + '" data-card="' + esc(cardId) + '" title="' + esc(d.text) + '">' +
        (art ? '<div class="cart" style="background-image:url(' + art + ')"></div>' : '') +
        (d.cost > 1 ? '<div class="ccost" title="Сбросьте ещё ' + (d.cost - 1) + '">' + d.cost + '</div>' : '') +
        '<div class="cname">' + icon + ' ' + esc(d.name) + '</div>' +
        '<div class="ctext">' + esc(d.text) + '</div>' +
        (info && !info.enabled && info.reason ? '<div class="cwhy">' + esc(info.reason) + '</div>' : '') +
        '</div>';
}

export function itemLabel(inst) {
    const d = ITEMS[inst.item];
    let s = d.name;
    if (d.weapon) s += ' [' + inst.ammo + '/' + d.weapon.max + ']';
    if (d.markers !== undefined) s += ' [' + (inst.charge ?? d.markers) + ' ⬢]';
    if (inst.broken) s += ' (сломано)';
    return s;
}
export function itemTitle(inst) { const d = ITEMS[inst.item]; return d.text || ''; }
export function woundName(w) { return WOUNDS[w] ? WOUNDS[w].name : w; }
