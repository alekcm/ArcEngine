// appearance.test.mjs — shared preset validation and propagation into the authoritative game.
//   node --test nemesis/tools/appearance.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { LABRAT_PARTS, SENTRY_PARTS, CREW_PARTS, characterPartSlots, characterParts } from '../shared/appearance.mjs';
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
    assert.deepEqual(characterParts('pilot', custom), characterParts('pilot'), 'Lab Rat choices do not leak to the pilot');
    assert.deepEqual(characterParts(null, custom), {});
    assert.deepEqual(Object.keys(characterParts('labrat', {})), LABRAT_PARTS.map(slot => slot.id));
    for (const slot of LABRAT_PARTS) for (const option of slot.options) {
        assert.equal(characterParts('labrat', { [slot.id]: option.id })[slot.id], option.id);
    }
});

test('LAB-02: the selected parts and colors appear in every player and spectator view', () => {
    const state = createGame({ seed: 'lab-rat', draft: false, players: [player('labrat'), player('pilot')] });
    assert.deepEqual(state.players[0].parts, custom);
    assert.deepEqual(state.players[1].parts, characterParts('pilot'));
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
    assert.deepEqual(someoneElse.parts, characterParts('pilot'), 'a different character does not inherit the parts');
    assert.deepEqual(someoneElse.colors, {}, 'the existing color draft behavior is preserved');
    assert.deepEqual(pick('pilot', 'labrat').parts, original, 'a newly drafted Lab Rat uses original parts');
});

const sentryOriginal = { optics: 'classic', respirator: 'classic', shoulders: 'classic', cloak: 'classic' };
const sentryCustom = { optics: 'binocular', respirator: 'ribbed', shoulders: 'heavy', cloak: 'torn' };

test('SENTRY-01: presets are character-specific, canonical, and safely normalized', () => {
    assert.equal(characterPartSlots('sentry'), SENTRY_PARTS);
    assert.equal(characterPartSlots('labrat'), LABRAT_PARTS);
    assert.equal(characterPartSlots('pilot'), CREW_PARTS.pilot);
    assert.deepEqual(characterParts('sentry'), sentryOriginal);
    assert.deepEqual(characterParts('sentry', sentryCustom), sentryCustom);
    assert.deepEqual(characterParts('sentry', { optics: 'bad', respirator: ['ribbed'], shoulders: 'heavy', cloak: null, extra: 'bad' }),
        { ...sentryOriginal, shoulders: 'heavy' });
    assert.deepEqual(characterParts('sentry', custom), sentryOriginal, 'Lab Rat parts cannot leak into the Sentry');
    assert.deepEqual(characterParts('labrat', sentryCustom), original, 'Sentry parts cannot leak into the Lab Rat');
    for (const id of ['__proto__', 'constructor', 'toString', null, ['sentry']]) {
        assert.deepEqual(characterPartSlots(id), [], 'unknown character has no slots');
        assert.deepEqual(characterParts(id, sentryCustom), {}, 'unknown character has no parts');
    }
    assert.deepEqual(Object.fromEntries(SENTRY_PARTS.map(slot => [slot.id, slot.options.map(option => option.id)])), {
        optics: ['classic', 'binocular', 'cluster'],
        respirator: ['classic', 'reinforced', 'ribbed'],
        shoulders: ['classic', 'segmented', 'heavy'],
        cloak: ['classic', 'split', 'torn'],
    });
    for (const slot of SENTRY_PARTS) for (const option of slot.options) {
        assert.equal(characterParts('sentry', { [slot.id]: option.id })[slot.id], option.id);
    }
});

test('SENTRY-02: selected parts reach every game view and follow the same draft rules', () => {
    const guard = { name: 'Охранник', charId: 'sentry', colors: { armor: '#12abcd' }, parts: sentryCustom };
    const state = createGame({ seed: 'sentry', draft: false, players: [guard, player('labrat')] });
    for (const viewer of [0, 1, null]) {
        const visible = viewFor(state, viewer).players;
        assert.deepEqual(visible[0].parts, sentryCustom);
        assert.equal(visible[0].colors.armor, '#12abcd');
        assert.deepEqual(visible[1].parts, custom, 'the other character keeps her own choices');
    }
    function pick(config, choice) {
        const draft = createGame({ seed: 'sentry-draft', draft: true, players: [config] });
        OPS['draft.pick'](draft, { player: 0, answer: choice, hand: ['labrat', 'sentry', 'pilot'] });
        return draft.players[0];
    }
    assert.deepEqual(pick(guard, 'sentry').parts, sentryCustom);
    assert.deepEqual(pick(guard, 'labrat').parts, original, 'drafting another character uses her defaults');
    assert.deepEqual(pick(player('labrat'), 'sentry').parts, sentryOriginal, 'drafted Sentry starts with his own defaults');
});

test('CREW-01: every crew member has independent, fully validated slots', async () => {
    const { CHARACTERS } = await import('../shared/data/cards.mjs');
    assert.deepEqual(new Set([...Object.keys(CREW_PARTS), 'labrat', 'sentry']), new Set(Object.keys(CHARACTERS)));
    assert.equal(Object.keys(CREW_PARTS).length, 16);
    for (const [id, slots] of Object.entries(CREW_PARTS)) {
        assert.equal(characterPartSlots(id), slots);
        assert.equal(slots.length, 3, id + ': three role-specific categories');
        assert.equal(new Set(slots.map(s => s.id)).size, slots.length, id + ': unique slots');
        const defaults = characterParts(id);
        for (const slot of slots) {
            assert.ok(slot.label && slot.hint && slot.options.every(o => o.label && o.detail));
            assert.equal(slot.options.length, 3);
            assert.equal(slot.options[0].id, 'classic');
            assert.equal(new Set(slot.options.map(o => o.id)).size, slot.options.length);
            assert.equal(defaults[slot.id], 'classic');
            for (const option of slot.options) assert.equal(characterParts(id, { [slot.id]: option.id })[slot.id], option.id);
            for (const bad of ['<script>', '__proto__', null, ['classic'], 2])
                assert.equal(characterParts(id, { [slot.id]: bad })[slot.id], 'classic', `${id}/${slot.id}: invalid value`);
        }
        assert.deepEqual(characterParts(id, { ...defaults, injected: 'bad' }), defaults);
        assert.deepEqual(characterParts(id, []), defaults);
    }
});

test('CREW-02: every chosen appearance and color reaches public game views and obeys draft matching', () => {
    for (const [id, slots] of Object.entries(CREW_PARTS)) {
        const chosen = Object.fromEntries(slots.map(s => [s.id, s.options[1].id]));
        const config = { name: id, charId: id, colors: { test: '#123456' }, parts: chosen };
        const state = createGame({ seed: 'crew-' + id, draft: false, players: [config] });
        for (const viewer of [0, null]) {
            const p = viewFor(state, viewer).players[0];
            assert.deepEqual(p.parts, chosen, id + ': public appearance');
            assert.equal(p.colors.test, '#123456', id + ': color');
        }
        function draft(choice) {
            const g = createGame({ seed: 'crew-draft-' + id, draft: true, players: [config] });
            OPS['draft.pick'](g, { player: 0, answer: choice, hand: [id, 'labrat'] });
            return g.players[0];
        }
        assert.deepEqual(draft(id).parts, chosen, id + ': same character');
        const different = draft('labrat');
        assert.deepEqual(different.parts, original, id + ': a different character receives her defaults');
        assert.deepEqual(different.colors, {}, id + ': draft color rules stay intact');
    }
});
