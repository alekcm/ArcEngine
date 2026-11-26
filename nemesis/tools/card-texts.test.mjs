// card-texts.test.mjs — the catalogue of every attack, event, adaptation and weakness text.
//   node --test nemesis/tools/card-texts.test.mjs
// The document must be the generator output (never a hand copy), every card must carry a real
// description, and the text the table prints must not leak internal keys like "green".
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cardTexts } from './card-texts.mjs';
import { ATTACK_CARDS, EVENT_CARDS, ADAPTATIONS, WEAKNESSES } from '../shared/data/cards.mjs';
import { CARNOMORPH_ATTACK_CARDS, CARNOMORPH_ADAPTATIONS } from '../shared/data/carnomorphs.mjs';
import { CARNOMORPH_EVENT_CARDS } from '../shared/data/carnomorph-events.mjs';
import { VOID_ATTACK_CARDS, VOID_EVENT_CARDS, VOID_WEAKNESSES } from '../shared/data/voidseeders.mjs';
import { CHYTRID_ATTACK_CARDS, CHYTRID_EVENT_CARDS, CHYTRID_WEAKNESSES, chytridEventText } from '../shared/data/chytrids.mjs';
import { eventTextFor, EVENT_NOISE_TEXT } from '../shared/data/event-text.mjs';

const doc = () => readFileSync(new URL('../../docs/NEMESIS_CARD_TEXTS.md', import.meta.url), 'utf8');

test('CARD-TEXT-01 the catalogue is the generator output, never a hand copy', () => {
    assert.equal(doc(), cardTexts(), 'run: node nemesis/tools/card-texts.mjs --write');
    assert.match(doc(), /# Nemesis — все описания атак, событий, адаптаций и уязвимостей/);
    assert.match(doc(), /## Базовая игра \(Redux\)/);
    assert.match(doc(), /## Карноморфы/);
    assert.match(doc(), /## Сеятели Пустоты \(Кошмары\)/);
    assert.match(doc(), /## Хитриды/);
});

test('CARD-TEXT-02 every pack has its full deck, and every card has a description', () => {
    assert.equal(ATTACK_CARDS.reduce((n, c) => n + (c.count || 1), 0), 20, 'the basic attack deck is 20 cards');
    assert.equal(ATTACK_CARDS.length, 15, 'in 15 kinds');
    assert.equal(EVENT_CARDS.length, 20);
    assert.equal(Object.keys(ADAPTATIONS).length, 8);
    assert.equal(Object.keys(WEAKNESSES).length, 8);
    for (const [name, list] of [['carnomorph attacks', CARNOMORPH_ATTACK_CARDS], ['carnomorph events', CARNOMORPH_EVENT_CARDS],
        ['void attacks', VOID_ATTACK_CARDS], ['void events', VOID_EVENT_CARDS],
        ['chytrid attacks', CHYTRID_ATTACK_CARDS], ['chytrid events', CHYTRID_EVENT_CARDS]]) {
        assert.equal(list.length, 20, name + ': 20 cards');
        for (const c of list) {
            assert.ok(c.name && c.name.length > 1, name + ': ' + c.id + ' has a name');
            const text = c.id.startsWith('carnoEvent') || c.id.startsWith('voidEvent') || c.id.startsWith('chyEvent')
                ? eventTextFor(c) : c.text;
            assert.ok(typeof text === 'string' && text.length > 12, name + ': ' + c.id + ' has a description');
        }
    }
    for (const [name, set] of [['carnomorph adaptations', CARNOMORPH_ADAPTATIONS], ['void weaknesses', VOID_WEAKNESSES],
        ['chytrid weaknesses', CHYTRID_WEAKNESSES], ['basic adaptations', ADAPTATIONS], ['basic weaknesses', WEAKNESSES]]) {
        for (const [k, card] of Object.entries(set)) {
            assert.ok(card.name && card.text && card.text.length > 12, name + ': ' + k);
        }
    }
});

test('CARD-TEXT-03 original Carnomorph events do not acquire the Redux noise band', () => {
    for (const c of CARNOMORPH_EVENT_CARDS) assert.ok(!eventTextFor(c).includes(EVENT_NOISE_TEXT), c.id);
    for (const list of [VOID_EVENT_CARDS, CHYTRID_EVENT_CARDS]) {
        for (const c of list) assert.ok(eventTextFor(c).includes(EVENT_NOISE_TEXT), c.id);
    }
    assert.equal(EVENT_NOISE_TEXT, 'Бросок кубика: каждый персонаж делает бросок шума.');
});

test('CARD-TEXT-04 the chytrid growth colour is printed in words, never as the data key', () => {
    const card = CHYTRID_EVENT_CARDS[0];
    assert.match(chytridEventText(card), /Рост: (зелёный|фиолетовый|нет)/);
    for (const c of CHYTRID_EVENT_CARDS) assert.ok(!/Рост: .*(green|purple)/.test(chytridEventText(c)), c.id);
    const doubled = { ...card, growth: ['purple', 'purple'] };
    assert.match(chytridEventText(doubled), /Рост: фиолетовый ×2/);
    assert.match(doc(), /Рост: зелёный/);
});

test('CARD-TEXT-05 the document holds the texts themselves, not just their headers', () => {
    const d = doc();
    assert.ok(d.includes('Укус'), 'a basic attack is listed');
    assert.ok(d.includes('Каждый персонаж делает бросок шума по порядку хода'), 'a basic event text is listed');
    assert.ok(d.includes('Проворство'), 'a basic adaptation is listed');
    assert.ok(d.includes('Уязвимость к огню'), 'a weakness is listed');
    assert.ok(d.includes('Детонация амуниции'), 'the ammunition detonation card is listed');
    assert.ok(d.includes('Истощение хитина'), 'a chytrid weakness is listed');
    // and it also names what is still simplified, so nothing hides behind a table
    assert.match(d, /## Где эффект карты пока упрощён/);
    assert.match(d, /Персонаж получает фишку слизи и 1 карту инфекции/);
});
