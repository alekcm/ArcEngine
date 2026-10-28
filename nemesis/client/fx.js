// fx.js — "physical table" feel: deck piles on screen and flying-card animations.
//
// The engine records card movements in view.fx ({n, type, ...}); every client replays the
// entries it has not seen yet:
//   draw    — cards fly from the player's deck pile to their hand (or to their panel for others)
//   discard — a card flies from the hand to the player's discard pile
//   remove  — a card flies from the hand and burns out (removed from the game)
//   contam  — a contamination card drops from the top onto the player's discard
//   item    — a card is pulled from the coloured item deck (green/red/yellow/support)
//   event / attack / queen — a card is drawn from the shared deck, flips face up in the centre
//                            and slides to its discard
import { esc, describeCard, eventArt, attackArt, queenArt, cardArt, itemArt } from './cards.js';
import { ITEMS } from '/shared/data/cards.mjs';
import * as Snd from './sound.js';

const DECK_LABELS = { green: 'Зелёная', red: 'Красная', yellow: 'Жёлтая', support: 'Поддержка', event: 'События', attack: 'Атаки', queen: 'Королева', bag: 'Мешок' };
const DECK_COLORS = { green: '#2f9e55', red: '#b63a3a', yellow: '#c9a227', support: '#6b7fa3', event: '#8a5a2b', attack: '#7a2d5a', queen: '#5b2a86', own: '#2c5a7a', contam: '#5a7a2a', bag: '#6b4f2a' };

const TOKEN_ICON = { blank: '○', larva: '🐛', adult: '👾', drone: '🦂', queen: '👑' };

export class TableFX {
    constructor(tableEl, layerEl, getPlayerEl, intruderNames) {
        this.table = tableEl; this.layer = layerEl; this.getPlayerEl = getPlayerEl; this.intruderNames = intruderNames || {};
        this.lastSeen = null; this.queue = []; this.busy = false; this.playing = null;
    }

    /** Redraw the deck piles (counts) and replay new fx entries. */
    update(view, me) {
        const mine = view.players.find(p => p.id === me);
        const piles = [];
        if (mine) { piles.push(['own', 'Моя колода', mine.deckCount]); piles.push(['owndisc', 'Мой сброс', mine.discardCount]); }
        for (const k of ['event', 'attack', 'queen', 'bag']) piles.push([k, DECK_LABELS[k], k === 'bag' ? view.bagCount : view.decks[k]]);
        for (const k of ['green', 'red', 'yellow', 'support']) piles.push([k, DECK_LABELS[k], view.decks[k]]);
        this.table.innerHTML = piles.map(([k, label, n]) =>
            '<div class="pile' + (n === 0 ? ' empty' : '') + '" data-pile="' + k + '" title="' + esc(label) + ': ' + n + ' — нажмите, чтобы посмотреть"><div class="pback" style="--pc:' + (DECK_COLORS[k === 'owndisc' ? 'own' : k] || '#345') + '">' +
            (k === 'owndisc' ? '<span class="pdisc">⤵</span>' : k === 'bag' ? '<span class="pdisc">🎒</span>' : '') + '<span class="pcount">' + n + '</span></div><div class="plabel">' + esc(label) + '</div></div>').join('');
        const fx = view.fx || [];
        if (this.lastSeen === null) { this.lastSeen = fx.length ? fx[fx.length - 1].n : 0; return; }   // nothing to replay on (re)connect
        for (const f of fx) if (f.n > this.lastSeen) { this.lastSeen = f.n; this.queue.push(Object.assign({ me, view }, f)); }
        this.pump();
    }

    /** True while the table is showing a token pull or an attack card: the next question waits. */
    get holding() { return this.busy && (this.playing === 'bag' || this.playing === 'attack'); }

    pump() {
        if (this.busy || !this.queue.length) return;
        const f = this.queue.shift(); this.busy = true; this.playing = f.type;
        const done = () => {
            this.busy = false; this.playing = null; this.pump();
            // the table has finished its beat: a question held back by `holding` may appear now
            if (!this.busy && !this.queue.length && this.onIdle) this.onIdle();
        };
        try { this.play(f, done); } catch (e) { console.warn('fx', e); done(); }
    }

    rect(sel) { const el = typeof sel === 'string' ? document.querySelector(sel) : sel; return el ? el.getBoundingClientRect() : null; }
    pileRect(k) { return this.rect('.pile[data-pile="' + k + '"] .pback'); }
    handRect() { const h = this.rect('#hand'); return h && h.width > 40 ? h : { left: innerWidth / 2 - 64, top: innerHeight - 190, width: 128, height: 176 }; }
    playerRect(pid) { const el = this.getPlayerEl(pid); return el ? el.getBoundingClientRect() : { left: 20, top: 120, width: 240, height: 60 }; }
    centerRect(w = 170, h = 236) { return { left: innerWidth / 2 - w / 2, top: innerHeight / 2 - h / 2 - 40, width: w, height: h }; }
    midpoint(r) { return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }

    /** Create a flying card element; `face` is inner HTML for the front (null = back only). */
    makeCard(color, face, w = 86, h = 118) {
        const el = document.createElement('div');
        el.className = 'flycard' + (face ? ' faced' : '');
        el.style.setProperty('--pc', color); el.style.width = w + 'px'; el.style.height = h + 'px';
        el.innerHTML = '<div class="fc-inner"><div class="fc-back"></div><div class="fc-front">' + (face || '') + '</div></div>';
        this.layer.appendChild(el);
        return el;
    }
    /** Fly `el` from rect a to rect b (centres) with optional flip & scale, then call cb. */
    fly(el, a, b, ms, opts = {}, cb) {
        const A = this.midpoint(a), Bm = this.midpoint(b);
        const kf = [
            { transform: 'translate(' + (A.x - el.offsetWidth / 2) + 'px,' + (A.y - el.offsetHeight / 2) + 'px) rotate(' + (opts.rotA || 0) + 'deg) scale(' + (opts.scaleA || 1) + ')', opacity: opts.fadeIn ? 0 : 1 },
            { transform: 'translate(' + (Bm.x - el.offsetWidth / 2) + 'px,' + (Bm.y - el.offsetHeight / 2) + 'px) rotate(' + (opts.rotB || 0) + 'deg) scale(' + (opts.scaleB || 1) + ')', opacity: opts.fadeOut ? 0 : 1 },
        ];
        if (opts.arc) kf.splice(1, 0, { transform: 'translate(' + ((A.x + Bm.x) / 2 - el.offsetWidth / 2) + 'px,' + ((A.y + Bm.y) / 2 - el.offsetHeight / 2 - opts.arc) + 'px) rotate(' + (((opts.rotA || 0) + (opts.rotB || 0)) / 2) + 'deg) scale(' + (((opts.scaleA || 1) + (opts.scaleB || 1)) / 2 * 1.15) + ')', opacity: 1, offset: 0.5 });
        const anim = el.animate(kf, { duration: ms, easing: opts.easing || 'cubic-bezier(.25,.8,.3,1)', fill: 'forwards' });
        anim.onfinish = () => { if (cb) cb(); };
        return anim;
    }
    flip(el, ms = 350) { el.classList.add('flipped'); return new Promise(r => setTimeout(r, ms)); }

    play(f, done) {
        const v = f.view, isMe = f.player === f.me;
        const pname = f.player != null && v.players[f.player] ? v.players[f.player].name : '';
        switch (f.type) {
            case 'draw': {
                Snd.play('card'); if (f.n > 1) Snd.play('card', 110);
                const from = isMe ? this.pileRect('own') : this.playerRect(f.player);
                const to = isMe ? this.handRect() : this.playerRect(f.player);
                const n = Math.min(f.n, 5);
                for (let i = 0; i < n; i++) {
                    // The card comes out WHOLE: a hand-sized card body with its back design, sliding
                    // out from under the deck pile in the bottom-right corner and into the fan. The
                    // old version shrank to a grey rectangle on the way and looked like a placeholder.
                    const el = this.makeCard(DECK_COLORS.own, null, 128, 176);
                    const start = from ? { left: from.left + 6, top: from.top + 6, width: from.width, height: from.height } : to;
                    setTimeout(() => this.fly(el, start, isMe ? { left: to.left + i * 40, top: to.top, width: 128, height: 176 } : to, 470, { rotA: -14, rotB: 0, arc: 30, scaleA: 1, scaleB: isMe ? 1 : 0.45, fadeOut: !isMe }, () => { el.remove(); if (i === n - 1) done(); }), i * 110);
                }
                if (!n) done();
                break;
            }
            case 'play': case 'useItem': {
                // a played action card (or used item) flies from the hand to the centre of the table, shows its art for a moment, then goes to the discard pile
                const isItem = f.type === 'useItem';
                const d = isItem ? ITEMS[f.item] : describeCard(f.card);
                const art = isItem ? itemArt(f.item) : cardArt(f.card);
                const face = (art ? '<div class="fc-art" style="background-image:url(' + art + ')"></div>' : '') + '<small>' + (isItem ? 'Предмет' : 'Карта') + (pname ? ' · ' + esc(pname) : '') + '</small><b>' + esc(d.name) + '</b>' + (d.text ? '<p>' + esc(d.text) + '</p>' : '');
                const origin = this.cardOrigin && this.cardOrigin.id === f.card ? this.cardOrigin.rect : null; this.cardOrigin = null;
                const from = origin || (isMe ? this.handRect() : this.playerRect(f.player));
                // «Поиск» opens its item picker the instant it is played. Parking the card in the
                // middle of the table for a second covered the very list the player had to choose
                // from, so the card goes straight from the hand to its discard pile.
                if (!isItem && d.effect === 'search') {
                    this.skipNext = f.card;
                    const to = isMe ? this.pileRect('owndisc') : this.playerRect(f.player);
                    const el = this.makeCard(DECK_COLORS.own, '<b>' + esc(d.name) + '</b>', 128, 176);
                    el.classList.add('flipped');
                    Snd.play('card');
                    this.fly(el, from, to || from, 380, { rotA: -8, rotB: 22, scaleB: 0.55, fadeOut: !isMe }, () => { el.remove(); done(); });
                    break;
                }
                const mid = this.centerRect(art ? 220 : 170, art ? 330 : 236);
                const el = this.makeCard(DECK_COLORS.own, face, art ? 220 : 170, art ? 330 : 236);
                el.classList.add('flipped');
                Snd.play('card');
                this.fly(el, from, mid, 420, { rotA: -6, rotB: 0, scaleA: 0.6, scaleB: 1, arc: 30 }, async () => {
                    await new Promise(r => setTimeout(r, isItem ? 1300 : 1100));
                    const to = isMe && !isItem ? this.pileRect('owndisc') : this.playerRect(f.player);
                    if (!isItem) this.skipNext = f.card;   // the engine's following discard/remove fx for this card is folded into this flight
                    this.fly(el, mid, to || mid, 420, { rotB: 20, scaleB: 0.45, fadeOut: isItem || !isMe }, () => { el.remove(); done(); });
                });
                break;
            }
            case 'discard': case 'remove': {
                if (this.skipNext === f.card) {
                    this.skipNext = null;
                    if (f.type === 'remove') { const el = this.makeCard(DECK_COLORS.own, '<b>' + esc(describeCard(f.card).name) + '</b>', 100, 140); el.classList.add('flipped'); this.fly(el, this.centerRect(100, 140), this.centerRect(100, 140), 10, {}, () => { el.classList.add('burn'); Snd.play('burn'); setTimeout(() => { el.remove(); done(); }, 700); }); }
                    else done();
                    break;
                }
                const d = describeCard(f.card);
                const face = '<b>' + esc(d.name) + '</b>';
                const from = isMe ? this.handRect() : this.playerRect(f.player);
                const to = isMe ? this.pileRect('owndisc') : this.playerRect(f.player);
                const el = this.makeCard(d.contam ? DECK_COLORS.contam : DECK_COLORS.own, face);
                el.classList.add('flipped');
                const burn = f.type === 'remove';
                Snd.play(burn ? 'burn' : 'card');
                this.fly(el, from, burn ? this.centerRect(100, 140) : (to || from), burn ? 500 : 520, { rotB: burn ? 0 : 25, arc: 60, scaleB: burn ? 1.1 : 0.55, fadeOut: !isMe && !burn }, () => {
                    if (burn) { el.classList.add('burn'); setTimeout(() => { el.remove(); done(); }, 700); }
                    else { el.remove(); done(); }
                });
                break;
            }
            case 'contam': {
                Snd.play('contam'); if (isMe) this.vignette('green');
                const to = isMe ? this.pileRect('owndisc') : this.playerRect(f.player);
                const n = Math.min(f.n, 3);
                for (let i = 0; i < n; i++) {
                    const el = this.makeCard(DECK_COLORS.contam, '<b>☣ Заражение</b>');
                    el.classList.add('flipped');
                    const from = { left: innerWidth / 2 - 43, top: -140, width: 86, height: 118 };
                    setTimeout(() => this.fly(el, from, to || from, 650, { rotA: -30, rotB: 15, scaleB: 0.55, easing: 'cubic-bezier(.5,0,.8,.6)' }, () => { el.remove(); if (i === n - 1) done(); }), i * 150);
                }
                break;
            }
            case 'item': {
                // A Search draws several items at once behind a picker: no card has to fly out of the
                // deck for each of them, it only covered the choice.
                if (f.quiet) { done(); break; }
                Snd.play('card');
                const from = this.pileRect(f.deck);
                const to = isMe ? this.handRect() : this.centerRect(100, 140);
                const el = this.makeCard(DECK_COLORS[f.deck], null);
                this.fly(el, from || to, to, 650, { rotA: 8, rotB: -4, arc: 90, scaleA: 0.9, scaleB: 1.05, fadeOut: true }, () => { el.remove(); done(); });
                break;
            }
            case 'event': case 'attack': case 'queen': {
                const k = f.type;
                // The Event card is drawn by the table-wide event window itself (centred, closed by
                // «Готово»), so a second flying copy would sit on top of it.
                if (k === 'event' && f.view && f.view.prompt && f.view.prompt.kind === 'ack' && f.view.prompt.event === f.card) { Snd.play('card'); done(); break; }
                const from = this.pileRect(k);
                const mid = this.centerRect();
                const title = k === 'event' ? 'Событие' : k === 'attack' ? 'Атака' + (f.intruder ? ' · ' + (this.intruderNames[f.intruder] || f.intruder) : '') : 'Королева';
                const art = k === 'event' ? eventArt(f.card) : k === 'attack' ? attackArt(f.card) : queenArt(f.card);
                // Attack cards carry the effect of the rank that is attacking (`effect`) and the whole
                // printed text (`text`): the card must explain itself on the table, not only in the chat.
                const face = (art ? '<div class="fc-art" style="background-image:url(' + art + ')"></div>' : '') + '<small>' + esc(title) + '</small><b>' + esc(f.name || '') + '</b>' +
                    (f.effect ? '<p class="fc-eff">' + esc(f.effect) + '</p>' : '') +
                    (f.text && f.text !== f.effect ? '<p>' + esc(f.text) + '</p>' : '') +
                    (pname && k === 'attack' ? '<em>→ ' + esc(pname) + '</em>' : '');
                const el = this.makeCard(DECK_COLORS[k], face, art ? 220 : 170, art ? 330 : 236);
                Snd.play('card');
                this.fly(el, from || mid, mid, 550, { rotA: -10, rotB: 0, scaleA: 0.5, scaleB: 1, arc: 30 }, async () => {
                    Snd.play('flip'); await this.flip(el);
                    // The attack card is the one thing on the table that explains the hit: it stays
                    // four seconds. An event card stays longer, a queen card longer still.
                    await new Promise(r => setTimeout(r, k === 'attack' ? 4000 : 3200));
                    this.fly(el, mid, from || mid, 450, { rotB: 20, scaleB: 0.4, fadeOut: true }, () => { el.remove(); done(); });
                });
                break;
            }
            case 'bag': {
                // the intruder bag: a pouch slides in, a token is pulled out and flipped
                Snd.play('bag');
                const name = this.intruderNames[f.token] || f.token;
                const el = document.createElement('div');
                el.className = 'bagfx';
                el.innerHTML = '<div class="bag-pouch">🎒<small>мешок · ' + (f.left ?? '') + '</small></div><div class="bag-token tok-' + esc(f.token) + '"><div class="bt-inner"><div class="bt-back">?</div><div class="bt-front"><b>' + esc(TOKEN_ICON[f.token] || '?') + '</b><span>' + esc(name) + '</span></div></div></div>';
                this.layer.appendChild(el);
                setTimeout(() => { el.classList.add('pulled'); }, 450);
                setTimeout(() => { el.classList.add('shown'); Snd.play('flip'); if (f.token !== 'blank') Snd.play('roar', 150); }, 1000);
                setTimeout(() => { el.classList.add('gone'); setTimeout(() => { el.remove(); done(); }, 350); }, 2500);
                break;
            }
            case 'spawn': { if (!this.lastRoar || Date.now() - this.lastRoar > 1500) { Snd.play('roar'); this.lastRoar = Date.now(); } done(); break; }
            case 'damage': {
                Snd.play('hurt');
                if (isMe) { this.vignette('red'); if (this.onShake) this.onShake(Math.min(1, 0.4 + f.n * 0.2)); }
                else { const el = this.getPlayerEl(f.player); if (el) { el.classList.remove('hit'); void el.offsetWidth; el.classList.add('hit'); } }
                done(); break;
            }
            case 'siren': { Snd.play('siren'); this.banner('⚠ САМОУНИЧТОЖЕНИЕ ЗАПУЩЕНО', 'red', 2600); setTimeout(done, 600); break; }
            case 'sdBeep': { Snd.play('beep'); this.banner('⏱ Самоуничтожение: ' + f.count + '/6', f.count >= 4 ? 'red' : 'blue', 1500); done(); break; }
            case 'explore': { Snd.play('tile'); done(); break; }
            default: done();
        }
    }

    /** Full-screen coloured vignette flash (damage = red, contamination = green). */
    vignette(color) {
        const el = document.createElement('div'); el.className = 'vignette ' + color; this.layer.appendChild(el);
        setTimeout(() => el.remove(), 900);
    }
    /** Short centred banner text. */
    banner(text, color, ms) {
        const el = document.createElement('div'); el.className = 'fxbanner ' + color; el.textContent = text; this.layer.appendChild(el);
        setTimeout(() => { el.classList.add('gone'); setTimeout(() => el.remove(), 400); }, ms);
    }
}
