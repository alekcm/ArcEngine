// blueprints-ui.test.mjs — tests for Nemesis Plans room selection, fullscreen button,
// center-screen turn notification, and intruder rotation facing combat targets.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('PLANS-01: Nemesis Plans (Чертежи «Немезиды») prompts player to choose 2 unexplored rooms', async () => {
    const { createGame } = await import('../shared/engine/setup.mjs');
    const engine = await import('../shared/engine/core.mjs');
    await import('../shared/engine/items.mjs');

    const state = createGame({ seed: 'plans-test', players: [{ name: 'Player1', charId: 'soldier' }] });
    const p = state.players[0];
    p.items.push({ uid: 'np-uid', item: 'nemesisPlans' });

    state.prompt = null;
    state.queue = [{ op: 'item.use', player: p.id, uid: 'np-uid', then: { op: 'noop' } }];
    engine.run(state);

    // Step 1: Prompt to pick 1st unexplored room
    assert.ok(state.prompt, 'Prompt displayed for first room');
    assert.equal(state.prompt.kind, 'room');
    assert.match(state.prompt.title, /Чертежи «Немезиды»/);
    assert.ok(state.prompt.rooms && state.prompt.rooms.length >= 2, 'Lists unexplored rooms');

    const r1 = state.prompt.rooms[0];
    engine.answer(state, p.id, state.prompt.id, r1);

    // Step 2: Prompt to pick 2nd unexplored room
    assert.ok(state.prompt, 'Prompt displayed for second room');
    assert.equal(state.prompt.kind, 'room');
    assert.ok(!state.prompt.rooms.includes(r1), 'Does not include already picked room');

    const r2 = state.prompt.rooms[0];
    engine.answer(state, p.id, state.prompt.id, r2);

    // Step 3: Info prompt showing revealed rooms and tiles known
    assert.ok(state.prompt, 'Info prompt displayed');
    assert.equal(state.prompt.kind, 'info');
    assert.ok(p.knownTiles[r1], 'First room tile recorded in knownTiles');
    assert.ok(p.knownTiles[r2], 'Second room tile recorded in knownTiles');
    assert.ok(!p.items.some(i => i.uid === 'np-uid'), 'Nemesis plans item was consumed');
    assert.ok((state.itemDiscard.yellow || []).includes('nemesisPlans'), 'Item placed in yellow discard deck');
});

test('FS-01: Fullscreen button exists at top-left and toggles fullscreen', () => {
    const html = fs.readFileSync('nemesis/client/index.html', 'utf8');
    assert.match(html, /<div id="topbar">\s*<button id="fsBtn"/, 'fsBtn is at the start of topbar (top-left)');

    const appJs = fs.readFileSync('nemesis/client/app.js', 'utf8');
    assert.match(appJs, /\$\('fsBtn'\)\.onclick/, 'app.js wires up fsBtn click handler');
    assert.match(appJs, /requestFullscreen/, 'app.js invokes requestFullscreen');
});

test('BANNER-01: Center-screen text notification shows when player turn starts', () => {
    const appJs = fs.readFileSync('nemesis/client/app.js', 'utf8');
    assert.match(appJs, /showCenterTurnBanner\(/, 'app.js defines and calls showCenterTurnBanner');
    assert.match(appJs, /turnCenterBanner/, 'creates turnCenterBanner element');

    const css = fs.readFileSync('nemesis/client/style.css', 'utf8');
    assert.match(css, /\.turn-center-banner\s*\{[^}]*position:\s*fixed;[^}]*top:\s*50%;[^}]*left:\s*50%;/, 'turn banner centered on screen in CSS');
});

test('ROT-01: Intruder rotation faces character who attacks it or whom it attacks', async () => {
    const { createGame } = await import('../shared/engine/setup.mjs');
    const { viewFor } = await import('../shared/view.mjs');
    const { dealHits } = await import('../shared/engine/combat.mjs');

    const state = createGame({ seed: 'rot-test', players: [{ name: 'Soldier', charId: 'soldier' }] });
    const p = state.players[0];
    state.intruders['it_test'] = { uid: 'it_test', type: 'adult', room: p.room, hits: 0 };

    dealHits(state, p, state.intruders['it_test'], 1, 0);

    assert.ok(state.lastCombatAction, 'lastCombatAction set');
    assert.equal(state.lastCombatAction.player, p.id);
    assert.equal(state.lastCombatAction.intruder, 'it_test');

    const v = viewFor(state, p.id);
    assert.ok(v.lastCombatAction, 'lastCombatAction included in view');
    assert.equal(v.lastCombatAction.player, p.id);
    assert.equal(v.lastCombatAction.intruder, 'it_test');

    const sceneJs = fs.readFileSync('nemesis/client/scene3d.js', 'utf8');
    assert.match(sceneJs, /view\.lastCombatAction/, 'scene3d.js inspects view.lastCombatAction for intruder rotation');
    assert.match(sceneJs, /Math\.atan2\(/, 'computes facing angle towards combat target');
});
