// appearance.test.mjs — shared preset validation and propagation into the authoritative game.
//   node --test nemesis/tools/appearance.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { LABRAT_PARTS, characterParts } from '../shared/appearance.mjs';
import { createGame } from '../shared/engine/setup.mjs';
import { OPS } from '../shared/engine/core.mjs';
import { viewFor } from '../shared/view.mjs';

const original = { hair: 'loose', eyes: 'bandage', outfit: 'gown', implants: 'classic' };
const custom = { hair: 'ponytail', eyes: 'layered', outfit: 'torn', implants: 'wrapped' };
const player = (charId, parts = custom) => ({ name: 'Алекс', charId, colors: { gown: '#12abcd' }, parts });

test('LAB-01: preset normalization accepts only the defined Lab Rat options', () => {
    assert.deepEqual(characterParts('labrat'), original);
    assert.deepEqual(characterParts('labrat', custom), custom);
    assert.deepEqual(characterParts('labrat', {
        hair: '<script>', eyes: ['wide'], outfit: 'suit', implants: null, extra: 'bad',
    }), original);
    assert.deepEqual(characterParts('labrat', ['messy', 'wide']), original);
    assert.deepEqual(Object.fromEntries(LABRAT_PARTS.map(slot => [slot.id, slot.options.map(option => option.id)])), {
        hair: ['loose', 'messy', 'ponytail'],
        eyes: ['bandage', 'wide', 'layered', 'tails'],
        outfit: ['gown', 'torn', 'long'],
        implants: ['classic', 'temples', 'neck', 'wrapped'],
    });
    // Lobby data saved before the redesign can still arrive. Disallowed choices safely revert
    // independently; previously selected canonical choices (including ponytail) survive.
    for (const [slot, removed] of Object.entries({ hair: ['bob', 'shaved'], eyes: ['visor', 'none'], outfit: ['coat', 'suit'], implants: ['crown', 'none'] })) {
        for (const old of removed) assert.deepEqual(characterParts('labrat', { ...custom, [slot]: old }), { ...custom, [slot]: original[slot] }, `${slot}/${old}`);
    }
    assert.deepEqual(characterParts('pilot', custom), {}, 'no mesh customization leaks to other characters');
    assert.deepEqual(characterParts(null, custom), {});
    assert.deepEqual(Object.keys(characterParts('labrat', {})), LABRAT_PARTS.map(slot => slot.id));
    for (const slot of LABRAT_PARTS) for (const option of slot.options) {
        assert.equal(characterParts('labrat', { [slot.id]: option.id })[slot.id], option.id);
    }
});

test('LAB-02: the selected parts and colors appear in every player and spectator view', () => {
    const state = createGame({ seed: 'lab-rat', draft: false, players: [player('labrat'), player('pilot')] });
    assert.deepEqual(state.players[0].parts, custom);
    assert.deepEqual(state.players[1].parts, {});
    for (const viewer of [0, 1, null]) {
        const publicPlayer = viewFor(state, viewer).players[0];
        assert.deepEqual(publicPlayer.parts, custom);
        assert.equal(publicPlayer.colors.gown, '#12abcd');
    }
});

test('LAB-03: a draft applies lobby parts only if the selected character matches', () => {
    function pick(configChar, choice) {
        const state = createGame({ seed: 'lab-draft', draft: true, players: [player(configChar)] });
        OPS['draft.pick'](state, { player: 0, answer: choice, hand: ['labrat', 'pilot', 'soldier'] });
        return state.players[0];
    }
    assert.deepEqual(pick('labrat', 'labrat').parts, custom, 'the player drafted the character they customized');
    const someoneElse = pick('labrat', 'pilot');
    assert.deepEqual(someoneElse.parts, {}, 'a different character does not inherit the parts');
    assert.deepEqual(someoneElse.colors, {}, 'the existing color draft behavior is preserved');
    assert.deepEqual(pick('pilot', 'labrat').parts, original, 'a newly drafted Lab Rat uses original parts');
});
