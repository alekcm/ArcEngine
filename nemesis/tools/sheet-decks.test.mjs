// sheet-decks.test.mjs — the table's two working surfaces:
//   * the character sheet (C) as a place to PLAY, not only to read: cards, items, weapons and the
//     mutation card answer with the engine's own menu, and a refusal is repeated in a centred box;
//   * the deck viewer as one horizontal row with the deck choice above it, showing what is still in
//     a deck, what is in hand and what is already spent — for my cards, the computer and the Queen.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createGame } from '../shared/engine/setup.mjs';
import { viewFor } from '../shared/view.mjs';
import { OPS, next, run, answer } from '../shared/engine/core.mjs';
import { buildMenu } from '../shared/engine/turn.mjs';
import { COMPUTER_CARDS } from '../shared/data/cards.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.join(HERE, '..');
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');
const APP = read('client', 'app.js');
const HTML = read('client', 'index.html');
const CSS = read('client', 'style.css');
const SERVER = read('server.mjs');
const FX = read('client', 'fx.js');

/** Queue one engine step and run it — `run()` only drains the queue, it takes no step of its own. */
function execute(s, step) { next(s, step); run(s); }

function fresh(opts = {}) {
    const s = createGame({ seed: 'sheet-decks', players: [{ name: 'A', charId: 'soldier' }, { name: 'B', charId: 'scout' }], ...opts });
    s.queue = []; s.prompt = null; s.resume = null;
    return s;
}

test('SHEET-01 the sheet answers with the turn menu: cards, items, a weapon shot and the mutation card', () => {
    // the sheet only offers actions while the engine's turn menu belongs to that player
    assert.match(APP, /const turn = isMine && pr && pr\.kind === 'turn' && pr\.player === me\.id && !pr\.waiting \? pr : null;/);
    assert.match(APP, /const menuCards = turn \? new Map\(\(turn\.cards \|\| \[\]\)\.map\(c => \[c\.id, c\]\)\) : null;/);
    assert.match(APP, /const menuItems = turn \? new Map\(\(turn\.items \|\| \[\]\)\.map\(i => \[i\.uid, i\]\)\) : null;/);
    // a weapon click fires it (the engine then asks which intruder), an item click uses it
    assert.match(APP, /registerAct\('shoot:' \+ inst\.uid, \{ action: 'shoot', weapon: inst\.uid \}, shoot,/);
    assert.match(APP, /registerAct\('item:' \+ inst\.uid, \{ action: 'item', itemId: inst\.uid \}, info, offTurn\)/);
    assert.match(APP, /\{ action: 'mutation' \}/);
    // a card in hand is played straight from the sheet
    assert.match(APP, /act\(\{ action: 'card', cardId: id \}\)/);
    // and the click is wired on the rendered sheet
    assert.match(APP, /querySelectorAll\('\[data-act\]'\)/);
    assert.match(APP, /querySelectorAll\('\.sheet-hand \.card'\)/);
});

test('SHEET-02 a refusal is repeated in a centred window, in the engine s own words', () => {
    assert.match(HTML, /id="sheetWarn"/);
    assert.match(HTML, /id="swText"/);
    assert.match(APP, /function warnCentre\(text, title\)/);
    assert.match(APP, /if \(!a\.enabled\) \{ warnCentre\(a\.reason \|\| 'Сейчас нельзя'\); return; \}/);
    assert.match(CSS, /#sheetWarn \{ position: fixed; inset: 0; z-index: 60; display: flex; align-items: center; justify-content: center;/);
    // the reason really is the printed one: noCombat cards and a shot without a target say so
    const s = fresh();
    s.enemySet = 'carnomorphs';
    const p = s.players[0];
    p.hand = ['contam#1'];
    const menu = buildMenu(s, p);
    assert.equal(menu.cards[0].enabled, false);
    assert.equal(menu.cards[0].reason, 'Заражение');
    assert.equal(menu.actions.find(a => a.id === 'shoot').reason, 'Нет чужих в комнате');
    p.items = [];
    assert.equal(buildMenu(s, p).actions.find(a => a.id === 'shoot').reason, 'Нет заряженного оружия');
    assert.equal(menu.actions.find(a => a.id === 'melee').reason, 'Нет чужих в комнате');
});

test('DECKS-01 my deck is a set for my eyes only, and the computer/Queen decks are on the table', () => {
    const s = fresh();
    const mine = viewFor(s, 0), other = viewFor(s, 1);
    assert.ok(Array.isArray(mine.players[0].deck), 'the owner sees the cards of their deck');
    assert.deepEqual(mine.players[0].deck.slice().sort(), s.players[0].deck.slice().sort(), 'exactly the cards they hold');
    assert.equal(other.players[0].deck, undefined, 'another player still sees only the count');
    assert.equal(other.players[0].deckCount, s.players[0].deck.length);
    // the computer: the deck list, the active card and the discard are all public
    assert.deepEqual(mine.computerDeck, s.computerDeck);
    assert.ok(mine.decks.computer === s.computerDeck.length);
    assert.ok(s.computerCard, 'a card is active from setup');
    // the Queen health deck is a set of indexes; the played cards stay the face-up pile
    assert.deepEqual(mine.queenDeck.slice().sort(), s.queenDeck.slice().sort());
    assert.deepEqual(mine.piles.queen, s.queenPlayed || []);
});

test('DECKS-02 the viewer is one row of cards with the deck choice above it', () => {
    assert.match(APP, /const tabs = \['computer', 'own', \.\.\.\(v\.carnomorphRedux \? \['butcher'\] : v\.enemySet === 'voidseeders' \? \['panic'\] : \['queen'\]\), 'event', 'attack', 'wound', 'feats'\];/);
    // the tabs are printed above the row, never below it
    assert.match(APP, /'<div class="deck-tabs">' \+ tabs\.map/);
    assert.match(APP, /'<div class="deck-row">' \+ cards\.map/);
    assert.match(CSS, /\.deck-row \{ display: flex; align-items: stretch; gap: 12px; overflow-x: auto;/);
    // the body is a plain column — a leftover CSS grid made the deck choice a column on the left and
    // squeezed the row into one card (the bug the table reported with a screenshot)
    assert.match(HTML, /<div id="deckBody"><\/div>/);
    assert.ok(!/id="deckBody" class=/.test(HTML), 'no grid on the deck body');
    assert.ok(!/\.deck-grid \{[^}]*repeat\(auto-fill/.test(CSS) || !/deck-grid/.test(HTML), 'the old grid is not used');
    // one card = picture, name, text — the same idea as the item picker
    assert.match(CSS, /\.deck-row \.deck-card \.dart \{ height: 118px;/);
    // states in colour: in hand lit, active amber, spent faded
    assert.match(CSS, /\.deck-card\.st-hand \{[^}]*border-color: var\(--acc\)/);
    assert.match(CSS, /\.deck-card\.st-active \{[^}]*border-color: #e2b33f/);
    assert.match(CSS, /\.deck-card\.st-spent \{ opacity: \.45;/);
});

test('DECKS-03 my cards, the computer and the Queen show deck/hand/active/spent together', () => {
    // my cards: deck (sorted, so the draw order stays hidden), then hand, then discard
    assert.match(APP, /for \(const id of \(me\.deck \|\| \[\]\)\.slice\(\)\.sort\(\)\) list\.push\(actionCard\(id, 'deck'\)\);/);
    assert.match(APP, /for \(const id of \(me\.hand \|\| \[\]\)\) list\.push\(actionCard\(id, 'hand'\)\);/);
    assert.match(APP, /for \(const id of \(me\.discard \|\| \[\]\)\) list\.push\(actionCard\(id, 'spent'\)\);/);
    // the computer: the active card first, then the deck, then the discard
    assert.match(APP, /if \(v\.computerCard\) list\.push\(computerCard\(v\.computerCard, 'active'\)\);/);
    assert.match(APP, /for \(const id of \(v\.computerDeck \|\| \[\]\)\.slice\(\)\.sort\(\)\) list\.push\(computerCard\(id, 'deck'\)\);/);
    assert.match(APP, /for \(const id of \(piles\.computer \|\| \[\]\)\) list\.push\(computerCard\(id, 'spent'\)\);/);
    // the Queen: the deck ordinary, the drawn cards faded
    assert.match(APP, /for \(const idx of \(v\.queenDeck \|\| \[\]\)\.slice\(\)\.sort\(\(a, b\) => a - b\)\) list\.push\(queenCard\(idx, 'deck'\)\);/);
    assert.match(APP, /for \(const idx of \(piles\.queen \|\| \[\]\)\) list\.push\(queenCard\(idx, 'spent'\)\);/);
    // pictures everywhere they exist
    assert.match(APP, /art: cardArt\(id\), state, tag: DECK_STATE_TAGS\[state\]/);
    assert.match(APP, /art: computerArt\(id\), state/);
    assert.match(APP, /art: queenArt\(\), state/);
});

test('DECKS-04 the bottom-right corner is one row of three piles: my cards, the feats, the Queen', () => {
    // deck + discard became one «Моя колода», the Feat pool joined the corner, events/attacks left it
    assert.match(FX, /if \(mine\) piles\.push\(\['own', 'Моя колода', mine\.deckCount\]\);/);
    assert.match(FX, /piles\.push\(\['feats', 'Подвиги', \(view\.feats \|\| \[\]\)\.length\]\);/);
    assert.match(FX, /const shared = view\.enemySet === 'voidseeders' \? 'panic' : 'queen';\n        piles\.push\(\[shared, DECK_LABELS\[shared\], \(view\.decks \|\| \{\}\)\[shared\]\]\);/);
    assert.ok(!/owndisc/.test(FX), 'the separate discard pile is gone — and so are its animation targets');
    for (const gone of ['bag', 'event', 'attack']) assert.ok(!new RegExp("piles\\.push\\(\\['" + gone).test(FX), 'no ' + gone + ' pile in the corner');
    assert.ok(!/'green', 'red', 'yellow', 'support'\]\) piles/.test(FX), 'no item decks in the corner');
    // one row of three: the grid has exactly three columns and never wraps
    assert.match(CSS, /#table \{[^}]*display: grid; grid-template-columns: repeat\(3, 58px\);/);
    assert.match(CSS, /#table \.pile \{[^}]*width: 58px;/);
    // the hover popups follow the merge: one «Моя колода» with the three counts, plus the Feat list
    assert.match(APP, /const own = document\.querySelector\('\.pile\[data-pile="own"\]'\);/);
    assert.match(APP, /В сбросе: ' \+ \(me\.discard \? me\.discard\.length : '\?'\)/);
    assert.match(APP, /const feats = document\.querySelector\('\.pile\[data-pile="feats"\]'\);/);
});

test('DECKS-05 a computer action prints its three effects, not just «Выберите одно из трёх»', () => {
    // the shipped helper, run on the real card data
    const start = APP.indexOf('function computerCardText');
    const end = APP.indexOf('function computerCard(');
    const helper = new Function('COMPUTER_CARDS', APP.slice(start, end) + '; return computerCardText;')(COMPUTER_CARDS);
    for (const id of ['actionA', 'actionB', 'actionC', 'actionD', 'actionE']) {
        const c = COMPUTER_CARDS[id];
        const text = helper(c);
        const lines = text.split('\n');
        assert.equal(lines[0], c.text, id + ': the printed line stays on top');
        assert.equal(lines.length, 4, id + ': a line per option');
        assert.deepEqual(lines.slice(1), Object.values(c.options).map(o => '• ' + o), id + ': the three options verbatim');
    }
    // a card without options keeps its plain text
    assert.equal(helper({ text: 'Просто текст.' }), 'Просто текст.');
    // the viewer prints it with its line breaks kept (CSS pre-line, not collapsed into one blob)
    assert.match(CSS, /\.deck-row \.deck-card small \{[^}]*white-space: pre-line;/);
});

test('DECKS-06 six cards fit in one row: a wider window and a narrower card', () => {
    assert.match(CSS, /#deckOverlay \.help-box \{ width: min\(1320px, 97vw\);/);
    assert.match(CSS, /\.deck-row \.deck-card \{ flex: 1 1 196px; min-width: 178px; max-width: 260px;/);
    // 6 × 196 + 5 × 12 gaps = 1236 — inside the 1320 window, so the sixth card is never cut off
    assert.ok(6 * 196 + 5 * 12 <= 1320, 'six bases and their gaps fit the window');
});

test('HUD-04 «Пункт»: unread information, the coordinates I saw, and what the table was told', () => {
    // hover: a player who never looked gets the plain sentence, and everybody sees the last announcement
    assert.match(APP, /Вы ещё не проверили эту информацию/);
    assert.match(APP, /const claim = v\.claims && v\.claims\.destination \? v\.claims\.destination : null;/);
    assert.match(APP, /const told = \(coord \? '<span class="tbrow">Нажмите, чтобы отметить пункт для остальных<\/span>' : ''\) \+/);
    assert.match(APP, /\(claim \? '<span class="tbrow">Объявлено: летим в ' \+ esc\(claim\.value\) \+ ' · ' \+ esc\(playerName\(claim\.by\) \|\| 'игрок'\) \+ '<\/span>' : ''\);/);
    // the four announcement buttons exist for the player who has seen the coordinates, in a panel of their own
    assert.match(HTML, /id="destOverlay"/);
    assert.match(APP, /function openDestPanel\(\)/);
    assert.match(APP, /'<div class="dest-buttons">' \+ \['A', 'B', 'C', 'D'\]\.map\(k => '<button class="btn" data-claim="' \+ k \+ '">Отметить: ' \+ k \+ ' — '/);
    assert.match(APP, /b\.onclick = \(\) => \{ net\.send\(\{ t: 'claim', dest: b\.dataset\.claim \}\); \$\('destOverlay'\)\.classList\.add\('hidden'\); Snd\.play\('click'\); \};/);
    assert.match(APP, /\$\('tbDest'\)\.onclick = \(\) => openDestPanel\(\);/);
    // a player who has not looked sees no buttons, only the sentence
    assert.match(APP, /if \(!coord\) \{\n        \$\('destBody'\)\.innerHTML = '<p class="hint">Вы ещё не проверили эту информацию\.<\/p>' \+ claimed;/);
});

test('HUD-05 «Двигатели»: what I saw myself, what was announced, and ??? for the rest', () => {
    assert.match(HTML, /<span class="lbl">Двигатели<\/span><b id="tbEngines">/);
    assert.match(APP, /const seen = known\[n\] === undefined \? '\?\?\?' : \(known\[n\] \? 'исправен' : 'повреждён'\);/);
    assert.match(APP, /const said = announced\[n\] \? ' · объявлено: ' \+ \(announced\[n\]\.working \? 'исправен' : 'повреждён'\)/);
    assert.match(APP, /\$\('tbEngines'\)\.innerHTML = \(knownCount \? knownWorking \+ '\/4' : '\?\/4'\)/);
});

test('CLAIM-01 an engine announcement is offered, is public, and is never checked against the truth', () => {
    const s = fresh();
    s.queue = []; s.prompt = null;
    const p = s.players[0];
    const engineRoom = Object.keys(s.ship.rooms).find(id => s.ship.rooms[id].kind === 'engine');
    p.room = engineRoom;
    const no = s.ship.rooms[engineRoom].engineNo;
    const truth = s.secret.engines.find(e => e.no === no).working;
    execute(s, { op: 'engine.toggle', player: 0, then: { op: 'noop' } });
    assert.equal(s.prompt.kind, 'choice');
    assert.ok(s.prompt.secret, 'the true state is not shown to the others');
    assert.deepEqual(s.prompt.options.map(o => o.id), ['work', 'break']);
    answer(s, 0, s.prompt.id, 'work');
    // the offer follows the change: three answers, and a lie is one of them
    assert.equal(s.prompt.kind, 'choice');
    assert.ok(s.prompt.secret, 'the engine state stays with its owner');
    assert.deepEqual(s.prompt.options.map(o => o.id), ['ok', 'broken', 'no']);
    assert.match(viewFor(s, 1).prompt.title, /скрытую информацию/);
    assert.doesNotMatch(viewFor(s, 1).prompt.title, /ИСПРАВЕН|ПОВРЕЖДЁН/);
    // …and it is public: everyone sees the claim, nobody sees the real engine
    assert.equal(viewFor(s, 1).claims.engines[no], undefined);
    answer(s, 0, s.prompt.id, 'broken');
    const claimed = viewFor(s, 1).claims.engines[no];
    assert.equal(claimed.working, false, 'the table is told «повреждён» even though the player just made it whole');
    assert.equal(claimed.by, 0);
    assert.equal(s.secret.engines.find(e => e.no === no).working, true, 'the truth is untouched by the claim');
    assert.ok(s.log.some(l => /двигатель №/.test(l.text) && /повреждён/.test(l.text)), 'and the claim is in the log');
});

test('CLAIM-03 reading all four engines keeps the whole list in one window, then offers the announcement', () => {
    const s = fresh();
    s.queue = []; s.prompt = null;
    const p = s.players[0];
    const room = Object.keys(s.ship.rooms).find(id => s.ship.rooms[id].kind === 'engine');
    const no = s.ship.rooms[room].engineNo;
    execute(s, { op: 'room.action', player: 0, room, tile: 'engineRoom', then: { op: 'noop' } });
    // one window, all four engines, still private
    assert.ok(s.prompt.secret);
    assert.equal(s.prompt.options.map(o => o.id).join(','), 'tell,no');
    for (const e of s.secret.engines) {
        assert.match(s.prompt.text, new RegExp('Двигатель №' + e.no + ': ' + (e.working ? 'ИСПРАВЕН' : 'ПОВРЕЖДЁН')));
        assert.equal(p.knownEngines[e.no], e.working, 'what was read stays with the reader');
    }
    assert.equal(viewFor(s, 1).claims.engines && Object.keys(viewFor(s, 1).claims.engines).length, 0, 'nothing is announced yet');
    // saying «tell» asks one question per engine; «no» would simply close the window
    answer(s, 0, s.prompt.id, 'tell');
    assert.equal(s.prompt.title, 'Двигатель №' + s.secret.engines[0].no + ': ' + (s.secret.engines[0].working ? 'ИСПРАВЕН' : 'ПОВРЕЖДЁН'));
    assert.deepEqual(s.prompt.options.map(o => o.id), ['ok', 'broken', 'no']);
    answer(s, 0, s.prompt.id, 'ok');
    assert.equal(Object.keys(viewFor(s, 1).claims.engines).length, 1, 'one announcement recorded, the rest still to come');
    assert.equal(viewFor(s, 1).claims.engines[s.secret.engines[0].no].working, true);
});

test('CLAIM-02 «летим в пункт X» is a public, unchecked announcement', () => {
    const s = fresh();
    s.queue = []; s.prompt = null;
    const truth = s.destination;
    execute(s, { op: 'claim.dest', player: 0, answer: 'D' });
    assert.equal(s.destination, truth, 'the real destination is not changed by the announcement');
    assert.equal(viewFor(s, 1).claims.destination.value, 'D');
    assert.equal(viewFor(s, 1).claims.destination.by, 0);
    s.prompt = null; s.resume = null; s.queue = [];   // nothing queued: the claim is what runs next
    execute(s, { op: 'claim.dest', player: 1, answer: 'A' });
    assert.equal(viewFor(s, 0).claims.destination.value, 'A', 'the newest announcement wins');
    // the server accepts it from any seated player and drops garbage instead of throwing
    assert.match(SERVER, /case 'claim': \{/);
    assert.match(SERVER, /if \(!\['A', 'B', 'C', 'D'\]\.includes\(value\) \|\| !st\.players\[pid\]\) return;/);
    assert.match(SERVER, /claimDestination\(st, st\.players\[pid\], value\);/);
});

test('ACT-01 the played computer action is shown in the middle of the screen, with only that action', () => {
    const s = fresh();
    s.queue = []; s.prompt = null;
    const p = s.players[0];
    p.hand = ['soldier.coveringFire#0'];
    execute(s, { op: 'computer.option', player: 0, card: 'actionC', answer: 'ammo', then: { op: 'noop' } });
    assert.equal(s.lastComputerAction.card, 'actionC');
    assert.equal(s.lastComputerAction.option, 'ammo');
    assert.ok(s.lastComputerAction.seq >= 1, 'every play gets its own sequence number');
    assert.equal(viewFor(s, 1).lastComputerAction.option, 'ammo', 'the whole table sees which action was played');
    // the client draws the card with the played action only, never the three options at once
    assert.match(HTML, /<div id="compAct" class="hidden"/);
    assert.match(HTML, /id="compActArt"/);
    assert.match(APP, /\$\('compActText'\)\.textContent = c\.options \? c\.options\[a\.option\] : \(c\.text \|\| ''\);/);
    assert.match(APP, /\$\('compActArt'\)\.style\.backgroundImage = 'url\(' \+ computerArt\(a\.card\) \+ '\)';/);
    assert.match(APP, /renderPilePopups\(v\); renderComputerAction\(v\); syncPanes\(\);/);
    assert.match(CSS, /#compAct \{ position: fixed; left: 50%; top: 42%; transform: translate\(-50%, -50%\);/);
});

test('LOBBY-02 the d10 noise die and the intruder Weaknesses are the standard, not the alternative', () => {
    const alien = HTML.slice(HTML.indexOf('id="alienModeSelect"'), HTML.indexOf('id="adaptSelect"'));
    assert.match(alien, /<option value="weaknesses" selected>Стандарт — Слабости/);
    assert.match(alien, /<option value="evolutions">Альтернатива — Адаптации/);
    const die = HTML.slice(HTML.indexOf('id="noiseDieSelect"'));
    assert.match(die, /<option value="safe" selected>Стандарт — d10/);
    assert.match(die, /<option value="standard">Альтернатива — 12 граней/);
    // a fresh lobby starts on them, and the game log no longer calls the d10 an alternative
    assert.match(SERVER, /noiseVariant: true, alienMode: 'weaknesses'/);
    const SETUP = read('shared', 'engine', 'setup.mjs');
    assert.match(SETUP, /if \(state\.noiseVariant\) log\(state, 'Кубик шума: d10 без граней «Встреча»/);
    assert.ok(!/альтернативный d10/.test(SETUP), 'the start log does not call the standard die alternative');
    // the client still speaks the engine's settings: 'safe' ⇄ noiseVariant, weaknesses ⇄ weaknessMode
    assert.match(APP, /noiseVariant: \$\('noiseDieSelect'\) \? \$\('noiseDieSelect'\)\.value === 'safe' : false,/);
    assert.match(APP, /\$\('noiseDieSelect'\)\.value = L\.settings\.noiseVariant \? 'safe' : 'standard';/);
});

test('HUD-01 fire and malfunctions read out of nine, the top bar opens the bag and the coordinates', () => {
    // 8 markers may be placed, the NINTH destroys the ship: a clean board is 0/9, not 1/9
    assert.match(APP, /\$\('tbMarkers'\)\.textContent = \(8 - v\.fireLeft\) \+ '\/9 · ' \+ \(8 - v\.malfLeft\) \+ '\/9';/);
    const clean = fresh();
    const cv = viewFor(clean, 0);
    assert.equal(8 - cv.fireLeft, 0, 'a fresh ship has no fire markers');
    assert.equal(8 - cv.malfLeft, 0, 'and no malfunction markers');
    // the ninth marker really is the end: the engine keeps 8 in reserve and destroys the ship at 0
    assert.match(read('shared', 'engine', 'setup.mjs'), /fireLeft: 8, malfLeft: 8/);
    assert.match(read('shared', 'engine', 'core.mjs'), /if \(state\.fireLeft <= 0\) \{ destroyShip\(state, 'девятый маркер огня/);
    // the bag's contents live in a hover popup, not in the bar itself
    assert.match(APP, /const bagRows = Object\.entries\(bk\)\.filter\(\(\[, n\]\) => n > 0\)/);
    assert.match(APP, /\$\('tbBag'\)\.innerHTML = v\.bagCount \+ '<span class="ipop"><b>Мешок · '/);
    // a pilot who has looked at the coordinates can open them again from the destination cell
    assert.match(APP, /const coord = mine && mine\.knownCoords \? COORDINATE_CARDS\.find\(c => c\.id === mine\.knownCoords\) : null;/);
});

test('HUD-02 the hint bar keeps ЛКМ, ALT and C, and the old panes and buttons are gone', () => {
    assert.match(APP, /const hints = \['<b>ЛКМ<\/b> по комнате — идти, по чужому — атака', '<b>ALT<\/b> режим отображения', '<b>C<\/b> персонаж'\];/);
    assert.ok(!/playersToggle/.test(HTML), 'the left pane is removed from the page');
    assert.ok(!/id="players"/.test(HTML), 'and with it the players list');
    for (const id of ['sheetBtn', 'decksBtn', 'focusBtn']) assert.ok(!new RegExp('id="' + id + '"').test(HTML), id + ' left the top bar');
    // the sheet is still reachable: C and a click on the self HUD
    assert.match(APP, /else if \(e\.key === 'c' \|\| e\.key === 'C' \|\| e\.key === 'с' \|\| e\.key === 'С'\)/);
    assert.match(APP, /\$\('selfHud'\)\.onclick = e => \{ const card = e\.target\.closest\('\[data-player-id\]'\); openSheet\(false, card \? Number\(card\.dataset\.playerId\) : undefined\); \};/);
});

test('HUD-03 a hidden carnomorph adaptation is a lock and nothing else', () => {
    assert.match(APP, /if \(slot\.status === 'hidden'\) return '<span class="itag">' \+ label \+ '🔒<\/span>';/);
    assert.ok(!/🔒 скрыта<\/span>/.test(APP), 'the word «скрыта» is not printed any more');
});

test('LOBBY-01 undo can belong to every player, not only the host', () => {
    assert.match(HTML, /<select id="undoAnyoneSelect">/);
    assert.match(HTML, /<option value="all">Любой игрок<\/option>/);
    assert.match(APP, /undoAnyone: \$\('undoAnyoneSelect'\) \? \$\('undoAnyoneSelect'\)\.value === 'all' : false,/);
    assert.match(SERVER, /if \(typeof m\.settings\.undoAnyone === 'boolean'\) game\.settings\.undoAnyone = m\.settings\.undoAnyone;/);
    assert.match(SERVER, /if \(!isHost\(socket\) && !\(game\.settings\.undoAnyone && seat\)\) return;/);
    assert.match(SERVER, /canRollBack: isHost\(socket\) \|\| !!\(game\.settings\.undoAnyone && pid != null\)/);
    assert.match(APP, /\$\('undoBtn'\)\.disabled = !app\.canRollBack \|\| !app\.undoDepth;/);
});
