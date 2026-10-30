// appearance.test.mjs — shared preset validation and propagation into the authoritative game.
//   node --test nemesis/tools/appearance.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { LABRAT_PARTS, SENTRY_PARTS, CREW_PARTS, characterPartSlots, characterParts } from '../shared/appearance.mjs';
import { createGame } from '../shared/engine/setup.mjs';
import { OPS } from '../shared/engine/core.mjs';
import { viewFor } from '../shared/view.mjs';

const original = { hair: 'loose', eyes: 'bandage', outfit: 'gown', ankle: 'classic', wrists: 'classic' };
const custom = { hair: 'ponytail', eyes: 'layered', outfit: 'torn', ankle: 'tag', wrists: 'bandaged' };
const player = (charId, parts = custom) => ({ name: 'Алекс', charId, colors: { gown: '#12abcd' }, parts });

test('LAB-01: preset normalization accepts only the defined Lab Rat options', () => {
    assert.deepEqual(characterParts('labrat'), original);
    assert.deepEqual(characterParts('labrat', custom), custom);
    assert.deepEqual(characterParts('labrat', {
        hair: '<script>', eyes: ['wide'], outfit: 'suit', ankle: null, extra: 'bad',
    }), original);
    assert.deepEqual(characterParts('labrat', ['messy', 'wide']), original);
    assert.deepEqual(Object.fromEntries(LABRAT_PARTS.map(slot => [slot.id, slot.options.map(option => option.id)])), {
        hair: ['loose', 'messy', 'ponytail'],
        eyes: ['bandage', 'wide', 'layered', 'tails'],
        outfit: ['gown', 'torn', 'long'],
        ankle: ['classic', 'tracker', 'tag'],
        wrists: ['classic', 'bandaged', 'restraints'],
    });
    // Lobby data saved before the redesign can still arrive. Disallowed choices safely revert
    // independently; previously selected canonical choices (including ponytail) survive.
    for (const [slot, removed] of Object.entries({ hair: ['bob', 'shaved'], eyes: ['visor', 'none'], outfit: ['coat', 'suit'], ankle: ['implant', 'boots'] })) {
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

const sentryOriginal = { suit: 'classic', optics: 'classic', respirator: 'classic', shoulders: 'classic', cloak: 'classic' };
const sentryCustom = { suit: 'breacher', optics: 'binocular', respirator: 'ribbed', shoulders: 'heavy', cloak: 'torn' };

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
        suit: ['classic', 'patrol', 'breacher'],
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
        assert.equal(slots.length, 5, id + ': five independent role-specific categories');
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

test('ROLE-04: existing choices survive the richer workshop schemas', () => {
    assert.deepEqual(characterParts('soldier', { helmet: 'braced', shoulders: 'layered', pack: 'ribbed' }), {
        helmet: 'braced', suit: 'classic', shoulders: 'layered', pack: 'ribbed', rifle: 'classic',
    });
    assert.deepEqual(characterParts('soldier', { helmet: 'caged', shoulders: 'extended', pack: 'valves' }), {
        helmet: 'caged', suit: 'classic', shoulders: 'extended', pack: 'valves', rifle: 'classic',
    });
    assert.deepEqual(characterParts('mechanic', { shield: 'framed', belt: 'tools', pack: 'gauges' }), {
        shield: 'framed', outfit: 'classic', belt: 'tools', pack: 'gauges', welder: 'classic',
    });
    assert.deepEqual(characterParts('mechanic', { shield: 'twinlamp', belt: 'pouches', pack: 'ribbed' }), {
        shield: 'twinlamp', outfit: 'classic', belt: 'pouches', pack: 'ribbed', welder: 'classic',
    });
    assert.deepEqual(characterParts('scout', { hair: 'braid', bracer: 'display', vest: 'plated' }), {
        hair: 'braid', bracer: 'display', vest: 'plated', shoulders: 'classic', rifle: 'classic',
    });
    assert.deepEqual(characterParts('scout', { hair: 'tied', bracer: 'cells', vest: 'pouches' }), {
        hair: 'tied', bracer: 'cells', vest: 'pouches', shoulders: 'classic', rifle: 'classic',
    });
    assert.deepEqual(characterParts('pilot', { hair: 'spiky', optics: 'round', coat: 'lapels' }), {
        hair: 'spiky', optics: 'round', coat: 'lapels', headset: 'classic', sidearm: 'classic',
    });
    assert.deepEqual(characterParts('pilot', { hair: 'side', optics: 'wide', coat: 'long' }), {
        hair: 'side', optics: 'wide', coat: 'long', headset: 'classic', sidearm: 'classic',
    });
    assert.deepEqual(characterParts('hacker', { hood: 'rimmed', mask: 'seams', arms: 'ribbed' }), {
        hood: 'rimmed', mask: 'seams', arms: 'ribbed', vest: 'classic', smartgun: 'classic',
    });
    assert.deepEqual(characterParts('hacker', { hood: 'long', mask: 'vented', arms: 'terminal' }), {
        hood: 'long', mask: 'vented', arms: 'terminal', vest: 'classic', smartgun: 'classic',
    });
    assert.deepEqual(characterParts('scientist', { goggles: 'round', chair: 'spoked', tablet: 'panel' }), {
        goggles: 'round', chair: 'spoked', tablet: 'panel', coat: 'classic', scanner: 'classic',
    });
    assert.deepEqual(characterParts('scientist', { goggles: 'visor', chair: 'guards', tablet: 'scanner' }), {
        goggles: 'visor', chair: 'guards', tablet: 'scanner', coat: 'classic', scanner: 'classic',
    });
    assert.deepEqual(characterParts('medic', { hair: 'tied', mask: 'filters', kit: 'pouch' }), {
        hair: 'tied', mask: 'filters', kit: 'pouch', coat: 'classic', injector: 'classic',
    });
    assert.deepEqual(characterParts('medic', { hair: 'wavy', mask: 'valve', kit: 'canisters' }), {
        hair: 'wavy', mask: 'valve', kit: 'canisters', coat: 'classic', injector: 'classic',
    });
    assert.deepEqual(characterParts('janitor', { beard: 'long', cap: 'banded', vacuum: 'ribbed' }), {
        beard: 'long', cap: 'banded', vacuum: 'ribbed', outfit: 'classic', wand: 'classic',
    });
    assert.deepEqual(characterParts('janitor', { beard: 'forked', cap: 'lamp', vacuum: 'twin' }), {
        beard: 'forked', cap: 'lamp', vacuum: 'twin', outfit: 'classic', wand: 'classic',
    });
    assert.deepEqual(characterParts('ceo', { hair: 'spiky', collar: 'trim', robot: 'sensor' }), {
        hair: 'spiky', collar: 'trim', robot: 'sensor', coat: 'classic', sidearm: 'classic',
    });
    assert.deepEqual(characterParts('ceo', { hair: 'side', collar: 'high', robot: 'armored' }), {
        hair: 'side', collar: 'high', robot: 'armored', coat: 'classic', sidearm: 'classic',
    });
    assert.deepEqual(characterParts('android', { hair: 'tied', implants: 'temples', vest: 'lapels' }), {
        hair: 'tied', trousers: 'classic', vest: 'lapels', arms: 'classic', sidearm: 'classic',
    });
    assert.deepEqual(characterParts('android', { hair: 'bob', implants: 'jaw', vest: 'pockets' }), {
        hair: 'bob', trousers: 'classic', vest: 'pockets', arms: 'classic', sidearm: 'classic',
    });
    assert.deepEqual(characterParts('convict', { muzzle: 'vents', plates: 'asymmetric', chains: 'links' }), {
        muzzle: 'vents', plates: 'asymmetric', chains: 'links', trousers: 'classic', tattoos: 'classic',
    });
    assert.deepEqual(characterParts('psych', { hair: 'layered', headset: 'sensor', drones: 'rotors' }), {
        hair: 'layered', headset: 'sensor', drones: 'rotors', vest: 'classic', sleeves: 'classic',
    });
    assert.deepEqual(characterParts('bounty', { hair: 'spiky', armor: 'heavy', dog: 'packs' }), {
        hair: 'spiky', armor: 'heavy', dog: 'packs', outfit: 'classic', rifle: 'classic',
    });
    assert.deepEqual(characterParts('captain', { hair: 'swept', shoulders: 'layered', vest: 'radio' }), {
        hair: 'swept', shoulders: 'layered', vest: 'radio', uniform: 'classic', sidearm: 'classic',
    });
    assert.deepEqual(characterParts('survivor', { hair: 'wavy', bandana: 'folded', radio: 'dual' }), {
        hair: 'wavy', bandana: 'folded', radio: 'dual', outfit: 'classic', sidearm: 'classic',
    });
    assert.deepEqual(characterParts('survivor', { hair: 'long', bandana: 'tails', radio: 'caged' }), {
        hair: 'long', bandana: 'tails', radio: 'caged', outfit: 'classic', sidearm: 'classic',
    });
    assert.deepEqual(characterParts('xeno', { hair: 'loosecurl', probe: 'twin', jacket: 'collar' }), {
        hair: 'loosecurl', probe: 'twin', jacket: 'collar', trousers: 'classic', tool: 'classic',
    });
    assert.deepEqual(characterParts('xeno', { hair: 'longtail', probe: 'shield', jacket: 'pockets' }), {
        hair: 'longtail', probe: 'shield', jacket: 'pockets', trousers: 'classic', tool: 'classic',
    });
});

test('REV-10: removed implant and arm slots migrate without losing other choices', () => {
    const oldAndroid = { hair: 'tied', implants: 'jaw', vest: 'pockets', arms: 'rolled', sidearm: 'pulse' };
    const android = { hair: 'tied', trousers: 'classic', vest: 'pockets', arms: 'rolled', sidearm: 'pulse' };
    const oldConvict = { muzzle: 'guard', plates: 'shoulder', chains: 'links', trousers: 'cargo', arms: 'cybernetic' };
    const convict = { muzzle: 'guard', plates: 'shoulder', chains: 'links', trousers: 'cargo', tattoos: 'classic' };
    assert.deepEqual(characterParts('android', oldAndroid), android);
    assert.deepEqual(characterParts('convict', oldConvict), convict);
    assert.deepEqual(characterParts('android', { ...oldAndroid, trousers: 'utility' }), { ...android, trousers: 'utility' });
    assert.deepEqual(characterParts('convict', { ...oldConvict, tattoos: 'tribal' }), { ...convict, tattoos: 'tribal' });
    assert.deepEqual(characterParts('labrat', { hair: 'ponytail', eyes: 'wide', outfit: 'long', implants: 'neck' }),
        { hair: 'ponytail', eyes: 'wide', outfit: 'long', ankle: 'classic', wrists: 'classic' }, 'old patient implant slot is discarded while the remaining choices survive');
    const oldPatient = { hair: 'messy', eyes: 'tails', outfit: 'torn', implants: 'temples', wrists: 'restraints' };
    const migratedPatient = { hair: 'messy', eyes: 'tails', outfit: 'torn', ankle: 'classic', wrists: 'restraints' };
    assert.deepEqual(characterParts('labrat', oldPatient), migratedPatient, 'removed implants become the plain ankle without losing other choices');
    assert.deepEqual(characterParts('labrat', { ...oldPatient, ankle: 'tracker' }), { ...migratedPatient, ankle: 'tracker' });
    assert.deepEqual(characterParts('sentry', { optics: 'cluster', respirator: 'ribbed', shoulders: 'heavy', cloak: 'split' }),
        { suit: 'classic', optics: 'cluster', respirator: 'ribbed', shoulders: 'heavy', cloak: 'split' }, 'old Sentry selections gain only a default');
    const state = createGame({ seed: 'legacy-outfits', draft: false, players: [player('android', oldAndroid), player('convict', oldConvict)] });
    for (const viewer of [0, 1, null]) {
        const players = viewFor(state, viewer).players;
        assert.deepEqual(players[0].parts, android); assert.deepEqual(players[1].parts, convict);
    }
    const draft = createGame({ seed: 'legacy-draft', draft: true, players: [player('android', oldAndroid)] });
    OPS['draft.pick'](draft, { player: 0, answer: 'android', hand: ['android', 'convict'] });
    assert.deepEqual(draft.players[0].parts, android, 'draft preserves the normalized old selections');
    const patientDraft = createGame({ seed: 'legacy-patient-draft', draft: true, players: [player('labrat', oldPatient)] });
    OPS['draft.pick'](patientDraft, { player: 0, answer: 'labrat', hand: ['labrat', 'sentry'] });
    assert.deepEqual(patientDraft.players[0].parts, migratedPatient, 'draft also migrates the patient without losing the remaining choices');
    assert.equal(viewFor(patientDraft, 0).players[0].colors.gown, '#12abcd', 'legacy patient colours survive the draft');
});
