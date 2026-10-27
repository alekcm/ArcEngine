// Field data (полевые данные) — the permanent action cards you add to your own deck when your
// Knowledge crosses 3, 5 and 8. Checks the reward flow and that every card has an illustration.
//   node --test nemesis/tools/fielddata.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createGame } from '../shared/engine/setup.mjs';
import { answer, gainKnowledge, run } from '../shared/engine/core.mjs';
import { FIELD_DATA } from '../shared/data/cards.mjs';

const ROOT = new URL('..', import.meta.url).pathname;               // nemesis/
const CARDS_JS = fs.readFileSync(ROOT + 'client/cards.js', 'utf8');
const ART_FIELD = Array.from(CARDS_JS.match(/const ART_FIELD = [\s\S]*?\];/)[0].matchAll(/'([A-Za-z]+)'/g), m => m[1]);

function fresh(chars = ['soldier', 'scout']) {
    const state = createGame({
        seed: 'field-data', mode: 'original', draft: false,
        players: chars.map((charId, i) => ({ name: 'FD ' + i, charId })),
    });
    state.queue = []; state.prompt = null; state.resume = null; state.result = null;
    state.phase = 'player'; state.current = 0;
    state.seating = state.players.map(p => p.id); state.turnCursor = 0; state.actionsLeft = 2;
    state.players.forEach(p => { p.status = 'active'; p.passed = false; });
    return state;
}
/** Gain knowledge and answer the threshold prompt if one appears. Returns the card that was taken. */
function gain(state, p, n) {
    gainKnowledge(state, p, n); run(state);
    const pr = state.prompt;
    if (!pr || !/Порог знаний/.test(pr.title || '')) return null;
    const pick = pr.options[1];
    assert.equal(answer(state, p.id, pr.id, pick.id), true);
    state.prompt = null; state.resume = null; state.queue = [];      // the turn menu is not what we test here
    return pick.id;
}

test('FDV-01 knowledge thresholds fire once each, at 3, 5 and 8', () => {
    const s = fresh();
    const p = s.players[0];
    assert.equal(p.knowledge, 1);
    const at3 = gain(s, p, 2);
    assert.ok(at3 && at3.startsWith('field.'), 'a Field data card is offered at 3 knowledge');
    assert.equal(p.knowledge, 3);
    assert.equal(gain(s, p, 1), null, 'nothing extra between the thresholds');
    const at5 = gain(s, p, 1);
    assert.ok(at5 && at5.startsWith('field.'), 'one more at 5 knowledge');
    const at8 = gain(s, p, 3);
    assert.ok(at8 && at8.startsWith('field.'), 'and one more at 8 knowledge');
    assert.equal(p.knowledge, 8);
    assert.equal(gain(s, p, 2), null, '8 is the maximum: no more rewards');
    assert.equal(p.knowledge, 8);
});

test('FDV-02 the reward is three cards, one of them goes on top of my deck', () => {
    const s = fresh();
    const p = s.players[0];
    const before = s.fieldDataDeck.length;
    const deckBefore = p.deck.length;
    gainKnowledge(s, p, 2); run(s);
    const pr = s.prompt;
    assert.equal(pr.options.length, 3, 'three cards to choose from');
    assert.equal(new Set(pr.options.map(o => o.id)).size, 3, 'all distinct');
    for (const o of pr.options) {
        const key = o.id.split('#')[0].split('.')[1];
        assert.equal(o.label, FIELD_DATA[key].name, 'the label is the card name');
        assert.equal(o.desc, FIELD_DATA[key].text, 'the description is the rules text');
        assert.equal(o.art, 'field/' + key, 'the choice shows the card illustration');
    }
    const chosen = pr.options[2].id;
    assert.equal(answer(s, 0, pr.id, chosen), true);
    assert.equal(p.deck[0], chosen, 'the chosen card is the next card I draw');
    assert.equal(p.deck.length, deckBefore + 1);
    assert.equal(s.fieldDataDeck.length, before - 1, 'the deck shrinks by one: three taken, two put back');
    const keys = s.fieldDataDeck.map(c => c.split('#')[0]);
    assert.ok(!keys.includes(chosen.split('#')[0]), 'the chosen card is no longer in the deck');
});

test('FDV-03 every Field data card has an illustration wired into the client', () => {
    const keys = Object.keys(FIELD_DATA);
    assert.equal(ART_FIELD.length, new Set(ART_FIELD).size, 'no duplicates in the art list');
    assert.deepEqual([...ART_FIELD].sort(), [...keys].sort(), 'the art list is exactly the Field data set');
    const missing = keys.filter(k => !fs.existsSync(ROOT + 'client/art/field/' + k + '.jpg'));
    assert.deepEqual(missing, [], 'every card has client/art/field/<key>.jpg');
    for (const k of keys) {
        assert.ok(FIELD_DATA[k].name && FIELD_DATA[k].text, k + ' has a name and rules text');
        assert.ok(!/undefined/.test(FIELD_DATA[k].text), k + ' text is filled in');
    }
});

test('FDV-04 the Field data deck itself holds every card exactly once', () => {
    const s = fresh();
    assert.equal(s.fieldDataDeck.length, Object.keys(FIELD_DATA).length);
    assert.deepEqual([...s.fieldDataDeck].sort(), Object.keys(FIELD_DATA).map(k => 'field.' + k + '#0').sort());
});
