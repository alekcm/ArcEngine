// round28.test.mjs — the four remarks of the twenty-eighth round.
//   node --test nemesis/tools/round28.test.mjs
//   * «Разрушительный огонь» really resolves an ENCOUNTER for empty hands — the card says so, the
//     journal said "Noise roll"; every event text was checked against the printed deck again;
//   * the event card turned over with an animation the first time and simply appeared after that;
//   * an attack card listed all three ranks instead of the one that is attacking;
//   * running away from an intruder never showed the attack card that was played on the runner.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ATTACK_CARDS, EVENT_CARDS } from '../shared/data/cards.mjs';
import { eventLogLines } from '../shared/engine/events.mjs';
import { attackEffectText } from '../shared/engine/combat.mjs';
import { createGame } from '../shared/engine/setup.mjs';
import { next, run, answer } from '../shared/engine/core.mjs';

const clientFile = name => fs.readFileSync(new URL('../client/' + name, import.meta.url), 'utf8');

function game(setup, ui = {}) {
    const s = createGame({ seed: 'round28', mode: 'original', draft: false, ui,
        players: [{ name: 'A', charId: 'soldier' }, { name: 'B', charId: 'scout' }] });
    s.queue = []; s.prompt = null; s.resume = null; s.result = null;
    s.fx = []; s.fxSeq = 0; s.intruders = {};
    s.phase = 'event'; s.seating = s.players.map(p => p.id);
    s.players.forEach(p => { p.room = '011'; p.status = 'active'; p.pod = null; });
    if (setup) setup(s);
    return s;
}

test('R28-01: every event says exactly what its last band asks for', () => {
    // Printed deck, checked card by card against the scan:
    //   «Each Character makes a Noise roll in turn order»   → 12 cards (noise: 'all')
    //   «Each Character with no A in hand resolves <Encounter> in turn order» → 4 cards (noCards)
    //   «Each Character in a Room with <Malfunction> or <Fire> resolves <Encounter>» → 2 cards (fireMalf)
    //   «Reshuffle the Event deck»                          → 2 cards (none)
    const kinds = { all: 0, noCards: 0, fireMalf: 0, none: 0 };
    for (const ev of EVENT_CARDS) {
        const lines = eventLogLines(ev);
        const last = lines[lines.length - 1];
        kinds[ev.noise]++;
        if (ev.noise === 'all') {
            assert.match(ev.text, /Каждый персонаж делает бросок шума по порядку хода\./, ev.id + ': бросок шума');
            assert.match(last, /^Бросок кубика: .*бросок шума/, ev.id + ': журнал — бросок');
        } else if (ev.noise === 'noCards') {
            assert.match(ev.text, /без карт действий в руке разрешает встречу по порядку хода\./, ev.id + ': встреча за пустую руку');
            assert.match(last, /^Встреча: .*без карт действий/, ev.id + ': журнал — встреча');
            assert.doesNotMatch(ev.text, /бросок шума/, ev.id + ': никакого броска шума');
        } else if (ev.noise === 'fireMalf') {
            assert.match(ev.text, /в комнате с поломкой или огнём разрешает встречу по порядку хода\./, ev.id + ': встреча за поломку/огонь');
            assert.match(last, /^Встреча: .*поломкой или огнём/, ev.id + ': журнал — встреча');
            assert.doesNotMatch(ev.text, /бросок шума/, ev.id + ': никакого броска шума');
        } else {
            assert.doesNotMatch(ev.text, /бросок шума|встреч/i, ev.id + ': ни броска, ни встречи');
            assert.equal(last, 'Броска кубика нет.', ev.id + ': журнал — ничего');
        }
    }
    assert.deepEqual(kinds, { all: 12, noCards: 4, fireMalf: 2, none: 2 }, 'колода целиком: 12/4/2/2');
    // The card the table complained about, by name.
    const fire = EVENT_CARDS.find(e => e.id === 'damagingFire');
    assert.equal(fire.name, 'Разрушительный огонь');
    assert.match(fire.text, /Каждый персонаж без карт действий в руке разрешает встречу по порядку хода\./);
});

test('R28-02: an Encounter event draws from the bag, a Noise event rolls the die', () => {
    // Разрушительный огонь with an empty hand: the bag opens, no die.
    let s = game(st => { st.players[0].hand = []; st.players[1].hand = ['scout.b']; }, { bagClick: true });
    next(s, { op: 'event.reveal', id: 'damagingFire' }); run(s);
    assert.equal(s.prompt && s.prompt.kind, 'bag', 'пустая рука — встреча из мешка');
    assert.match(s.prompt.text || '', /Разрушительный огонь/, 'окно мешка называет событие');
    // Damage in a room with fire: also an Encounter, not a Noise roll (the printed card says so).
    s = game(st => { st.roomState['011'].fire = true; st.players[0].hand = ['soldier.a']; st.players[1].hand = ['scout.b']; }, { bagClick: true });
    next(s, { op: 'event.reveal', id: 'damage' }); run(s);
    assert.equal(s.prompt && s.prompt.kind, 'bag', 'комната с огнём — встреча');
    // Short Circuit in a room with a malfunction: the same.
    s = game(st => { st.roomState['011'].malfunction = true; st.players[0].hand = ['soldier.a']; st.players[1].hand = ['scout.b']; }, { bagClick: true });
    next(s, { op: 'event.reveal', id: 'shortCircuit' }); run(s);
    assert.equal(s.prompt && s.prompt.kind, 'bag', 'комната с поломкой — встреча');
    // A card that says "every character makes a Noise roll" still rolls the die.
    s = game(st => { st.players[0].hand = ['soldier.a']; });
    next(s, { op: 'event.reveal', id: 'fireWave' }); run(s);
    assert.equal(s.prompt && s.prompt.kind, 'dice', 'бросок шума остаётся броском');
    assert.equal(s.prompt.die, 'noise');
});

test('R28-03: an attack card shows only the rank that is attacking', () => {
    const claws = ATTACK_CARDS.find(c => c.id === 'claws1');
    assert.equal(attackEffectText(claws, 'queen'), '−2 здоровья.', 'королева читает свою строку');
    assert.equal(attackEffectText(claws, 'adult'), '−1 здоровье.', 'взрослый — свою');
    assert.match(attackEffectText(claws, 'drone'), /^тяжело ранен/, 'дрон — свою');
    for (const who of ['adult', 'drone', 'queen']) {
        const t = attackEffectText(claws, who);
        for (const other of ['Взрослый', 'Дрон', 'Королева']) assert.ok(!t.includes(other), who + ': без чужих строк');
    }
    // A label shared by two ranks is one segment.
    const blood = ATTACK_CARDS.find(c => c.id === 'bloodSense');
    assert.equal(attackEffectText(blood, 'drone'), 'потеряйте 2 здоровья; если вы перемещались, чужой следует за вами.');
    // Every card with a rank split names one rank only for each of the three.
    for (const card of ATTACK_CARDS) {
        if (!/^(Взрослый|Дрон|Королева)/.test(card.text)) continue;
        for (const who of ['adult', 'drone', 'queen']) {
            const t = attackEffectText(card, who);
            assert.ok(t.length >= 3, card.id + '/' + who + ': текст есть');
            assert.ok(!/[А-Яа-я]+:\s/.test(t), card.id + '/' + who + ': без перечисления («…: … Взрослый: …»)');
        }
    }
    // The card on the table prints that text once: the whole card only when the ranks share it.
    const fx = clientFile('fx.js');
    assert.match(fx, /const only = k === 'attack' && f\.effect && f\.text && f\.effect !== f\.text;/, 'одна строка на карте');
    assert.match(fx, /f\.text !== f\.effect && !only \? '<p>'/, 'полный текст — только если он не перечень');
});

test('R28-04: the event card turns over every time, not only the first time', () => {
    const app = clientFile('app.js');
    // The hold of a finished turn used to outlive its card: the next card was drawn already face up.
    assert.match(app, /if \(app\.ackId !== pr\.id\) \{ app\.ackId = pr\.id; app\.ackDown = false; app\.ackFlipSent = false; app\.ackHold = null; \}/,
        'новая карта начинается с чистого листа');
    assert.match(app, /function ackHeld\(pr\) \{\s*return !!\(app\.ackHold && pr && pr\.kind === 'ack' && pr\.id === app\.ackHold\.id &&/,
        'задержка принадлежит своей карте');
    assert.match(app, /const turning = flipped && !!app\.ackDown && !ackHeld\(pr\)/, 'поворот играет у каждой карты');
    assert.match(app, /setTimeout\(\(\) => \{ const el = \$\('ack3d'\); if \(el\) el\.classList\.add\('flipped'\); \}, 60\)/,
        'класс ставится после кадра — переход действительно играет');
});

test('R28-05: the attack card of an escape reaches the table', () => {
    // The engine does draw the card: fleeing from a room with an adult puts an `attack` fx in the state.
    const s = game(st => {
        st.phase = 'player'; st.current = 0; st.firstPlayer = 0; st.turnCursor = 0; st.actionsLeft = 2;
        st.players.forEach(p => { p.hand = ['soldier.a', 'soldier.b', 'soldier.c']; });
        st.intruders = { 900: { uid: '900', type: 'adult', room: '011' } };
    });
    const dest = s.ship.rooms['011'].exits[0].to;
    next(s, { op: 'move.chosen', player: 0, answer: dest, pay: 0 });
    run(s);
    // The soldier wears the starting heavy armour, so the adult's attack first asks whether to
    // discard it. Keep the armour and let the card resolve.
    if (s.prompt && /Сбросить броню/.test(s.prompt.title || '')) { answer(s, 0, s.prompt.id, 'no'); run(s); }
    const f = (s.fx || []).find(x => x.type === 'attack');
    assert.ok(f, 'атака при бегстве раскрывает карту');
    assert.equal(f.player, 0);
    assert.ok(f.effect && !f.effect.includes('Королева:'), 'на карте — только строка этого чужого');
    // That same state also asks for the Noise die of the destination room: the two arrive together,
    // which is exactly what used to swallow the card.
    assert.equal(s.prompt && s.prompt.kind, 'dice', 'в том же состоянии — бросок шума');
    // The client feeds the fx queue before the die freezes the scene, and only defers playing it.
    const app = clientFile('app.js'), fx = clientFile('fx.js');
    const feed = app.indexOf('tableFx.update(v, app.me);');
    const gate = app.indexOf('if (dicePrompt || freshRoll) {');
    assert.ok(feed > 0 && gate > feed, 'очередь эффектов получает состояние ДО кубикового шлюза');
    assert.match(app, /tableFx\.pause\(\);[\s\S]{0,80}tableFx\.update\(v, app\.me\);/, 'на время броска очередь ждёт');
    assert.match(app, /tableFx\.resume\(\); {10}\/\/ the die is not on the table/, 'и играет, когда кубик прочитан');
    assert.match(fx, /pause\(\) \{ this\.paused = true; \}/, 'пауза');
    assert.match(fx, /resume\(\) \{ if \(!this\.paused\) return; this\.paused = false; this\.pump\(\); \}/, 'и продолжение');
    assert.match(fx, /if \(this\.busy \|\| this\.paused \|\| !this\.queue\.length\) return;/, 'на паузе ничего не стартует');
});
