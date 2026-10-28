// round26.test.mjs — the four remarks of the twenty-sixth round.
//   node --test nemesis/tools/round26.test.mjs
//   * a click on a room, on another character and on my own figure must open a LIST, so a stray
//     click is confirmed by a second, deliberate press instead of costing a card;
//   * the event card still swapped pictures instead of turning over;
//   * the suit sat on a line of its own under the health track instead of the third Heavy Wound slot;
//   * "The Queen Awakens" never named its Noise roll, and the other event texts were suspect too.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { EVENT_CARDS } from '../shared/data/cards.mjs';
import { eventLogLines } from '../shared/engine/events.mjs';
import { createGame } from '../shared/engine/setup.mjs';
import { answer, next, run } from '../shared/engine/core.mjs';

const clientFile = name => fs.readFileSync(new URL('../client/' + name, import.meta.url), 'utf8');
const bodyOf = (src, name) => {
    const at = src.indexOf('function ' + name);
    assert.ok(at > 0, name + ' exists');
    const end = src.indexOf('\nfunction ', at + 10);
    return src.slice(at, end > 0 ? end : src.length);
};

test('R26-01: a click on my own room opens a one-item list named after the room action', () => {
    const app = clientFile('app.js');
    const body = bodyOf(app, 'onRoomClick');
    assert.match(app, /onComputer: onComputerClick, onPlayer: onPlayerClick/, 'the scene forwards figure clicks');
    assert.match(body, /if \(id === me\.room\)/, 'my own room has its own branch');
    assert.match(body, /openWorldPop\(roomLabel\(id\), def \? def\.name/, 'the list is the room and its tile');
    assert.match(body, /label: 'Действие комнаты:', sub: def \? def\.action/, 'one item, named after the action, with what it does');
    assert.match(body, /do: \(\) => act\(\{ action: 'room' \}\)/, 'and the press is what acts');
    // Out of turn the same list opens, its single button explaining why it cannot be pressed.
    assert.match(body, /reason: a \? a\.reason : 'Не ваш ход'/, 'a list, not a silent nothing');
    // The description comes from the same tile lookup the hover card uses, so they cannot drift.
    assert.match(app, /function roomTileOf\(v, id\)/, 'one lookup for the room tile');
    assert.match(bodyOf(app, 'onRoomHover'), /const tile = rs\.tile \|\|/, 'the hover card keeps its own fallback');
});

test('R26-02: a click on another figure offers the one action that touches another character', () => {
    const app = clientFile('app.js'), scene = clientFile('scene3d.js');
    const body = bodyOf(app, 'onPlayerClick');
    assert.match(body, /openWorldPop\(other\.name[\s\S]{0,80}'Передать предмет'/, 'the list is titled after the action');
    assert.match(body, /label: 'Передать предмет'/, 'with the action itself');
    assert.match(body, /do: \(\) => act\(\{ action: 'trade' \}\)/, 'which is what the press sends');
    // The scene really hands the click over: a figure carries its id and the pick filters let it through.
    assert.match(scene, /player: p\.id/, 'the figure carries its player id');
    assert.match(scene, /this\.cb\.onPlayer\(/, 'and the click is dispatched to it');
    assert.match(scene, /metadata\.player !== undefined/, 'the pick filter lets figures through');
});

test('R26-03: a click on my own figure lists passing and every item I carry', () => {
    const app = clientFile('app.js'), scene = clientFile('scene3d.js');
    const body = bodyOf(app, 'onPlayerClick');
    assert.match(body, /if \(pid === app\.me && me\)/, 'my own figure is a branch of its own');
    assert.match(body, /label: 'Спасовать'/, 'passing comes first');
    assert.match(body, /for \(const inst of \(me\.items \|\| \[\]\)\)/, 'then everything in the backpack');
    assert.match(body, /label: itemLabel\(inst\)/, 'each item by its name');
    assert.match(body, /do: \(\) => act\(\{ action: 'item', itemId: inst\.uid \}\)/, 'and its uid is what is sent');
    assert.match(body, /reason: m \? m\.reason : 'Не ваш ход'/, 'out of turn the entries explain themselves');
    // A click that does not move the pointer more than a few pixels is a click, not a drag of the board.
    assert.match(scene, /<= 4/, 'the drag threshold is small enough to tell a click');
    assert.match(scene, /onPlayer\(pid\)/, 'and a click without a drag reports my own figure');
});

test('R26-04: the event card plays a real turn, once, and the printed text arrives with the face', () => {
    const app = clientFile('app.js'), css = clientFile('style.css');
    // The first render that sees prompt.flipped builds the card face down and adds the class a moment
    // later: a wrapper that is born with the class never animates, it just appears turned.
    assert.match(app, /const turning = flipped && !!app\.ackDown && !app\.ackHold/, 'the turn is played once');
    assert.match(app, /class="ack3d' \+ \(flipped && !turning \? ' flipped' : ''\)/, 'born face down while turning');
    assert.match(app, /setTimeout\(\(\) => \{ const el = \$\('ack3d'\); if \(el\) el\.classList\.add\('flipped'\); \}, 60\)/, 'class added after paint');
    assert.match(app, /}, 520\);/, 'text swapped after the turn, not before');
    // A state update in the middle of the turn must not rebuild the card.
    assert.match(app, /app\.ackHold\.until > Date\.now\(\)[\s\S]{0,160}return;/, 'the card is left alone while it turns');
    // The click only asks the server; every seat sees the same card turn over.
    assert.match(app, /app\.ackFlipSent = true;\s*\n\s*net\.send\(\{ t: 'flip' \}\)/, 'one table state');
    assert.match(css, /\.ack3d\.flipped\s*\{\s*transform:\s*rotateY\(180deg\)/, 'and it really turns in 3D');
});

test('R26-05: the suit lies in the third Heavy Wound slot, under the red part of the track', () => {
    const app = clientFile('app.js'), css = clientFile('style.css');
    assert.match(app, /const armorAt = me\.armor && wounds\.length < HP_SECTIONS\.length \? HP_SECTIONS\.length - 1 : -1;/,
        'the third slot, while it is still free');
    assert.match(app, /else if \(i === armorAt\) slot = '<div class="sh-slot armor" data-armor="1">🛡 '/, 'drawn as that slot');
    assert.match(app, /const armorBadge = me\.armor && armorAt < 0/, 'three wounds leave no slot: the suit rides in the header');
    assert.match(app, /closest\('\.sh-slot, \.sh-armor'\)/, 'its hover card still opens');
    assert.match(css, /#selfHud \.sh-slot\.armor\s*\{/, 'and it is styled as a slot');
    assert.doesNotMatch(css, /#selfHud \.sh-armor\s*\{/, 'no separate line under the track any more');
});

test('R26-06: every event text names the Noise roll the card really asks for', () => {
    for (const ev of EVENT_CARDS) {
        const lines = eventLogLines(ev);
        assert.ok(lines.length >= 3, ev.id + ': movement, effect and dice');
        assert.ok(lines.some(l => l.startsWith('Движение чужих: ')), ev.id + ': the intruders move');
        assert.ok(lines.some(l => l.startsWith('Бросок кубика: ')), ev.id + ': the dice are named');
        assert.doesNotMatch(lines.join(' '), /undefined|NaN/, ev.id + ': no holes');
        if (ev.noise === 'all') assert.match(ev.text, /Каждый персонаж делает бросок шума по порядку хода/,
            ev.id + ': "all" is printed as a Noise roll for every character');
        if (ev.noise === 'noCards') assert.match(ev.text, /без карт/, ev.id + ': the roll is for the empty-handed');
        if (ev.noise === 'fireMalf') assert.match(ev.text, /поломкой или огнём/, ev.id + ': the roll is for the wrecked room');
        if (ev.noise === 'none') assert.doesNotMatch(ev.text, /бросок шума/, ev.id + ': no roll at all');
    }
    // The card the table complained about, by name.
    const q = EVENT_CARDS.find(e => e.id === 'queenAwakens');
    assert.ok(q, 'the Queen Awakens is in the deck');
    assert.match(q.text, /Пробуждение|Королев/, 'and it is the right card');
    assert.match(eventLogLines(q).find(l => l.startsWith('Бросок кубика: ')), /бросок шума/);
});

test('R26-07: the whole table reads a card only after it has been turned over', () => {
    const s = createGame({ seed: 'r26', mode: 'original', draft: false, ui: { eventAck: true },
        players: [{ name: 'Alpha', charId: 'soldier' }, { name: 'Beta', charId: 'scout' }] });
    s.queue = []; s.prompt = null; s.resume = null; s.result = null;
    s.phase = 'event'; s.seating = s.players.map(p => p.id);
    s.players.forEach(p => { p.room = '011'; p.status = 'active'; });
    next(s, { op: 'event.reveal', id: 'queenAwakens' }); run(s);
    const pr = s.prompt;
    assert.equal(pr.kind, 'ack', 'the card waits for the table');
    assert.equal(pr.event, 'queenAwakens');
    assert.ok(!pr.flipped, 'it is dealt face down');
    assert.equal(answer(s, 0, pr.id, 'ok'), false, 'nobody confirms a card they have not read');
    // The server's flip message is the only thing that turns it, and it turns it for everybody.
    pr.flipped = true;
    assert.equal(answer(s, 0, pr.id, 'ok'), true, 'my Ready counts once the card is face up');
    assert.deepEqual(s.prompt.acked, [0], 'and the table sees who is ready');
    assert.equal(answer(s, 1, pr.id, 'ok'), true);
    // ... and then the card's own dice arrive — the Noise roll it prints.
    assert.equal(s.prompt && s.prompt.kind, 'dice', 'the printed Noise roll follows the read');
    assert.match(s.log.filter(l => l.kind === 'event').map(l => l.text).join(' '), /бросок шума по порядку хода/);
});
