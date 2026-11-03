// blueprints-ui.test.mjs — tests for Nemesis Plans room selection, fullscreen button,
// center-screen turn notification, intruder rotation facing combat targets,
// Emotion Scanner card fixes, and difficulty editor (adaptations & noise die variant).

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

test('SCAN-01: Emotion Scanner allows choosing player in neighbouring room, shows normal card name and full text', async () => {
    const { createGame } = await import('../shared/engine/setup.mjs');
    const engine = await import('../shared/engine/core.mjs');
    await import('../shared/engine/actions2.mjs');

    const state = createGame({
        seed: 'scan-test',
        players: [
            { name: 'Psych', charId: 'psych' },
            { name: 'Android', charId: 'android' }
        ]
    });
    const p1 = state.players[0];
    const p2 = state.players[1];

    // Put p1 in Hibernatorium (011) and p2 in neighbouring room (006)
    p1.room = '011';
    p2.room = '006';
    p2.deck = ['android.protocolOverride#0'];

    state.prompt = null;
    state.queue = [{ op: 'card.emotionScanner', player: p1.id }];
    engine.run(state);

    assert.ok(state.prompt, 'Target selection prompt displayed');
    assert.ok(state.prompt.options.some(o => o.id === String(p2.id)), 'Android in neighbouring room is selectable');

    engine.answer(state, p1.id, state.prompt.id, String(p2.id));

    assert.ok(state.prompt, 'Scanned card choice prompt displayed');
    assert.ok(state.prompt.scannedCard, 'scannedCard object present');
    assert.equal(state.prompt.scannedCard.name, 'Обход протокола', 'Shows normal Russian card name, not code identifier');
    assert.match(state.prompt.scannedCard.text, /Сбросьте 1 жетон ИБП/, 'Contains full printed card text');
    assert.match(state.prompt.text, /Обход протокола/, 'Prompt text includes localized card title');
    assert.match(state.prompt.text, /Сбросьте 1 жетон ИБП/, 'Prompt text includes full card description');

    // Test action: discard
    engine.answer(state, p1.id, state.prompt.id, 'discard');
    assert.equal(p2.discard[p2.discard.length - 1], 'android.protocolOverride#0', 'Card moved to target discard');

    // UI elements check
    const appJs = fs.readFileSync('nemesis/client/app.js', 'utf8');
    assert.match(appJs, /scannedCardModal/, 'Client app manages scannedCardModal for center-screen card text');
    const css = fs.readFileSync('nemesis/client/style.css', 'utf8');
    assert.match(css, /\.scanned-card-modal/, 'CSS styles centered scanned-card modal');
});

test('DIFF-01: Difficulty editor in lobby configures or disables alien adaptations', async () => {
    const { createGame } = await import('../shared/engine/setup.mjs');

    // 1. Adaptations disabled (0)
    const state0 = createGame({ seed: 'diff-0', adaptations: '0', players: [{ name: 'A', charId: 'soldier' }] });
    assert.equal(state0.adaptations.length, 0, '0 adaptations when configured to 0');

    // 2. All 8 adaptations (Nightmare mode)
    const stateAll = createGame({ seed: 'diff-all', adaptations: 'all', players: [{ name: 'A', charId: 'soldier' }] });
    assert.equal(stateAll.adaptations.length, 8, 'All 8 adaptations active in nightmare mode');

    // 3. Custom count (1 adaptation)
    const state1 = createGame({ seed: 'diff-1', adaptations: '1', players: [{ name: 'A', charId: 'soldier' }] });
    assert.equal(state1.adaptations.length, 1, '1 adaptation active');

    // 4. Default is 3
    const stateDef = createGame({ seed: 'diff-def', players: [{ name: 'A', charId: 'soldier' }] });
    assert.equal(stateDef.adaptations.length, 3, 'Default 3 adaptations');

    // HTML lobby check
    const html = fs.readFileSync('nemesis/client/index.html', 'utf8');
    assert.match(html, /id="adaptSelect"/, 'adaptSelect present in hostSettings');
});

test('DIFF-02: Noise die variant is a d10 without encounter faces', async () => {
    const { createGame } = await import('../shared/engine/setup.mjs');
    const { NOISE_DIE, NOISE_DIE_SAFE, roll } = await import('../shared/engine/core.mjs');

    // Standard die has 2 encounters, 1 silence, 1 danger
    assert.equal(NOISE_DIE.filter(f => f === 'encounter').length, 2);
    assert.equal(NOISE_DIE.filter(f => f === 'silence').length, 1);
    assert.equal(NOISE_DIE.filter(f => f === 'danger').length, 1);

    // Alternative die: a d10 — 0 encounters, 1 danger (claw marks), 1 silence (✕), numbers ×2
    assert.equal(NOISE_DIE_SAFE.length, 10, 'Alternative noise die is a d10');
    assert.equal(NOISE_DIE_SAFE.filter(f => f === 'encounter').length, 0, 'No encounter faces on the d10');
    assert.equal(NOISE_DIE_SAFE.filter(f => f === 'silence').length, 1, 'One silence face');
    assert.equal(NOISE_DIE_SAFE.filter(f => f === 'danger').length, 1, 'One danger face');
    for (const n of [1, 2, 3, 4]) assert.equal(NOISE_DIE_SAFE.filter(f => f === n).length, 2, 'Two faces of ' + n);

    const state = createGame({ seed: 'noise-safe', noiseVariant: true, players: [{ name: 'A', charId: 'soldier' }] });
    assert.equal(state.noiseVariant, true, 'noiseVariant saved in state');

    // HTML lobby check
    const html = fs.readFileSync('nemesis/client/index.html', 'utf8');
    assert.match(html, /id="noiseDieSelect"/, 'noiseDieSelect present in hostSettings');
});

test('ANDROID-QUEST-01: Android UPS is in quest items and activates in Generator room', async () => {
    const { createGame } = await import('../shared/engine/setup.mjs');
    const engine = await import('../shared/engine/core.mjs');
    await import('../shared/engine/items.mjs');
    await import('../shared/engine/turn.mjs');

    const state = createGame({ seed: 'and-quest-test', players: [{ name: 'And', charId: 'android' }] });
    const p = state.players[0];

    // 1. Check starting state
    assert.ok(p.quests.some(q => q.item === 'ups' && !q.open), 'UPS is in quest items as closed');
    assert.ok(!p.items.some(i => i.item === 'ups'), 'UPS is not in backpack items initially');
    const q = p.quests.find(q => q.item === 'ups');
    assert.equal(q.charge, 3, 'UPS starts with 3 charges');

    // 2. In non-generator room (e.g. Hibernatorium), quest action cannot be performed
    p.room = '011'; // Hibernatorium
    p.hand = ['android.alwaysPrepared#0', 'android.computerSkills#0', 'android.deactivation#0', 'android.fastRepairs#0', 'android.powerUp#0'];
    state.prompt = null;
    state.queue = [{ op: 'turn.choose' }];
    engine.run(state);

    assert.ok(state.prompt, 'Turn prompt is displayed');
    const questActionNonGen = state.prompt.actions.find(a => a.id === 'quest');
    assert.ok(questActionNonGen, 'Quest action listed in menu');
    assert.equal(questActionNonGen.enabled, false, 'Quest action disabled outside Generator');
    assert.match(questActionNonGen.reason, /Генератор/, 'Reason mentions Generator');

    // 3. Move Android to Generator room
    // Find Generator room in ship (from secret.tiles and reveal it)
    const genRoomId = Object.entries(state.secret.tiles).find(([, tile]) => tile === 'generator')[0];
    assert.ok(genRoomId, 'Generator room exists on ship');
    state.roomState[genRoomId].explored = true;
    state.roomState[genRoomId].tile = 'generator';
    p.room = genRoomId;

    state.prompt = null;
    state.queue = [{ op: 'turn.choose' }];
    engine.run(state);

    const questActionGen = state.prompt.actions.find(a => a.id === 'quest');
    assert.ok(questActionGen, 'Quest action listed in Generator');
    assert.equal(questActionGen.enabled, true, 'Quest action enabled in Generator');

    // 4. Activate quest item in Generator
    const ansOk = engine.answer(state, p.id, state.prompt.id, { action: 'quest' });
    assert.equal(ansOk, true, 'Turn answer accepted');

    assert.equal(q.open, true, 'UPS quest card is now open');
    assert.equal(q.charge, 5, 'UPS charges increased by +2 to 5');
    const openedUps = p.items.find(i => i.item === 'ups');
    assert.ok(openedUps, 'UPS is now in active player items');
    assert.equal(openedUps.charge, 5, 'Active UPS has 5 charges');
});

test('ARMOR-QUEEN-01: Heavy Armor can prevent Queen attack when moving away', async () => {
    const { createGame } = await import('../shared/engine/setup.mjs');
    const engine = await import('../shared/engine/core.mjs');
    await import('../shared/engine/combat.mjs');
    await import('../shared/engine/movement.mjs');

    const state = createGame({ seed: 'queen-armor-test', players: [{ name: 'Sol', charId: 'soldier' }] });
    const p = state.players[0];
    p.armor = { uid: 'a1', item: 'heavyArmor' };
    p.wounds.push('body'); // heavily wounded
    p.health = 4; // heavily wounded health zone

    // Queen is in player's room
    const q = { uid: 'queen_test', type: 'queen', room: p.room, hits: 0 };
    state.intruders['queen_test'] = q;

    // Stack lethal bite attack on top of attack deck
    state.attackDeck.unshift('bite');

    const exitRoom = state.ship.rooms[p.room].exits[0].to;
    state.roomState[exitRoom].explored = true;

    state.prompt = null;
    state.queue = [{ op: 'move.chosen', player: p.id, answer: exitRoom }];
    engine.run(state);

    // Player should be prompted with reaction to Queen's attack
    assert.ok(state.prompt, 'Reaction prompt displayed for Queen attack');
    const armorOpt = state.prompt.options.find(o => o.id === 'armorGuard');
    assert.ok(armorOpt, 'Heavy Armor reaction option is available against Queen attack');

    // Use Heavy Armor reaction
    const ans = engine.answer(state, p.id, state.prompt.id, 'armorGuard');
    assert.equal(ans, true, 'Armor reaction accepted');

    // Player survived, avoided instant death from bite, and moved to target room
    assert.equal(p.status, 'active', 'Player is alive');
    assert.equal(p.room, exitRoom, 'Player successfully moved to target room');
});

test('CONVICT-CUFFS-01: Convict cuffs automatically come off hands and flip when last marker is removed', async () => {
    const { createGame } = await import('../shared/engine/setup.mjs');
    const engine = await import('../shared/engine/core.mjs');
    await import('../shared/engine/actions2.mjs');

    const state = createGame({ seed: 'convict-cuffs-test', players: [{ name: 'Con', charId: 'convict' }] });
    const p = state.players[0];
    const cuffs = p.items.find(i => i.item === 'cuffs');

    assert.ok(cuffs, 'Convict starts with cuffs');
    assert.equal(cuffs.charge, 6, 'Cuffs start with 6 markers');
    assert.equal(engine.heavyCount(p), 1, 'Cuffs occupy hand space (heavyCount=1)');
    assert.equal(engine.handSlots(state, p)[0].kind, 'item', 'Cuffs are in hands');

    // Remove 5 markers down to 1
    cuffs.charge = 1;

    // Use bash card to remove the 6th (last) marker
    state.prompt = null;
    p.hand = ['convict.bash#0'];
    state.queue = [{ op: 'card.bash', player: p.id }];
    engine.run(state);

    assert.equal(cuffs.charge, 0, 'Cuffs charge is 0');
    assert.equal(cuffs.flipped, true, 'Cuffs are flipped over');
    assert.equal(engine.heavyCount(p), 0, 'Cuffs are no longer heavy (heavyCount=0)');
    assert.ok(engine.handSlots(state, p).every(s => s.kind === 'empty'), 'Both hands are now empty');
});

test('QUEST-AUDIT-01: Bloody Camouflage requires Nest room and no intruders', async () => {
    const { createGame } = await import('../shared/engine/setup.mjs');
    const engine = await import('../shared/engine/core.mjs');
    await import('../shared/engine/items.mjs');
    const { buildMenu } = await import('../shared/engine/turn.mjs');

    const state = createGame({ seed: 'test-labrat-nest', players: [{ name: 'LR', charId: 'labrat' }] });
    const p = state.players[0];
    const q = p.quests[0];
    assert.equal(q.item, 'bloodyCamouflage');

    // Use regular room (not hibernatorium fixture)
    const regRoom = Object.keys(state.ship.rooms).find(id => !['cockpit', 'hibernatorium', 'engine'].includes(state.ship.rooms[id].kind));
    p.room = regRoom;

    // Not in Nest: quest action disabled
    state.roomState[p.room].tile = 'storage';
    state.roomState[p.room].explored = true;
    let menu = buildMenu(state, p);
    let qAct = menu.actions.find(a => a.id === 'quest');
    assert.equal(qAct.enabled, false, 'Disabled outside Nest');

    // In Nest with intruder: quest action disabled
    state.roomState[p.room].tile = 'nest';
    state.intruders = { it1: { uid: 'it1', room: p.room, type: 'adult' } };
    menu = buildMenu(state, p);
    qAct = menu.actions.find(a => a.id === 'quest');
    assert.equal(qAct.enabled, false, 'Disabled with intruder');

    // In Nest without intruder: quest action enabled
    delete state.intruders.it1;
    menu = buildMenu(state, p);
    qAct = menu.actions.find(a => a.id === 'quest');
    assert.equal(qAct.enabled, true, 'Enabled in Nest without intruders');

    // Open it
    state.prompt = null;
    state.queue = [{ op: 'quest.open', player: p.id, uid: q.uid }];
    engine.run(state);
    assert.equal(q.open, true);
    assert.equal(p.armor?.item, 'bloodyCamouflage');
});

test('QUEST-AUDIT-02: Research Equipment requires Computer without malfunction; is consumed on use', async () => {
    const { createGame } = await import('../shared/engine/setup.mjs');
    const engine = await import('../shared/engine/core.mjs');
    await import('../shared/engine/items.mjs');
    await import('../shared/engine/actions2.mjs');
    await import('../shared/engine/rooms.mjs');
    const { buildMenu } = await import('../shared/engine/turn.mjs');

    const state = createGame({ seed: 'test-xeno-res', players: [{ name: 'Xen', charId: 'xeno' }] });
    const p = state.players[0];
    const q = p.quests[0];
    assert.equal(q.item, 'researchEquipment');

    const regRoom = Object.keys(state.ship.rooms).find(id => !['cockpit', 'hibernatorium', 'engine'].includes(state.ship.rooms[id].kind));
    p.room = regRoom;

    // Non-computer room: disabled
    state.roomState[p.room].tile = 'storage';
    state.roomState[p.room].explored = true;
    let menu = buildMenu(state, p);
    assert.equal(menu.actions.find(a => a.id === 'quest').enabled, false);

    // Computer room with malfunction: disabled
    state.roomState[p.room].tile = 'commandCenter';
    state.roomState[p.room].malfunction = true;
    menu = buildMenu(state, p);
    assert.equal(menu.actions.find(a => a.id === 'quest').enabled, false);

    // Computer room without malfunction: enabled
    state.roomState[p.room].malfunction = false;
    menu = buildMenu(state, p);
    assert.equal(menu.actions.find(a => a.id === 'quest').enabled, true);

    // Open quest item
    state.prompt = null;
    state.queue = [{ op: 'quest.open', player: p.id, uid: q.uid }];
    engine.run(state);
    assert.equal(q.open, true);
    const equip = p.items.find(i => i.item === 'researchEquipment');
    assert.ok(equip);

    // Put a carcass in the room and use research equipment
    state.roomState[p.room].objects = [{ type: 'carcass' }];
    state.prompt = null;
    state.queue = [{ op: 'item.use', player: p.id, uid: equip.uid }];
    engine.run(state);
    assert.equal(state.prompt.kind, 'choice');
    engine.answer(state, p.id, state.prompt.id, 'room:0');

    // Equipment must be consumed (removed from items)
    assert.equal(p.items.some(i => i.item === 'researchEquipment'), false, 'Research equipment is one-use and consumed');
    assert.equal(p.knowledge, 3, 'Gained 2 knowledge (started at 1)');
});

test('QUEST-AUDIT-03: Canine Upgrades lets Bounty Hunter Search in Laika room and recalls Laika', async () => {
    const { createGame } = await import('../shared/engine/setup.mjs');
    const engine = await import('../shared/engine/core.mjs');
    await import('../shared/engine/items.mjs');
    await import('../shared/engine/actions.mjs');
    const { buildMenu } = await import('../shared/engine/turn.mjs');

    const state = createGame({ seed: 'test-bounty-search', players: [{ name: 'Bounty', charId: 'bounty' }] });
    const p = state.players[0];
    p.quests[0].open = true;
    p.items.push({ uid: 'cu1', item: 'canineUpgrades', quest: true });

    // Hunter is in empty room with no items (e.g. cockpit)
    p.room = Object.keys(state.ship.rooms).find(id => state.ship.rooms[id].kind === 'cockpit');
    p.hand = ['bounty.search#0'];

    // Laika is on board: search cannot be played because cockpit has no items
    p.laika = 'board';
    let menu = buildMenu(state, p);
    assert.equal(menu.cards.find(c => c.id === 'bounty.search#0').enabled, false);

    // Send Laika to an explored regular room with items (e.g. laboratory)
    const otherRoom = Object.keys(state.ship.rooms).find(id => !['cockpit', 'hibernatorium', 'engine'].includes(state.ship.rooms[id].kind));
    state.roomState[otherRoom].tile = 'laboratory';
    state.roomState[otherRoom].explored = true;
    p.laika = otherRoom;

    // Now search card should be enabled thanks to Canine Upgrades
    menu = buildMenu(state, p);
    assert.equal(menu.cards.find(c => c.id === 'bounty.search#0').enabled, true);

    // Play search card
    state.prompt = null;
    state.queue = [{ op: 'card.search', player: p.id }];
    engine.run(state);

    // Laika returns to the hunter and items are drawn from Laika's room
    assert.equal(p.laika, 'board', 'Laika returned to hunter');
    assert.ok(state.prompt && state.prompt.kind === 'choice', 'Prompt offers drawn items');
});

test('QUEST-AUDIT-04: Ship Codes regains removed Action cards on activation', async () => {
    const { createGame } = await import('../shared/engine/setup.mjs');
    const engine = await import('../shared/engine/core.mjs');
    await import('../shared/engine/items.mjs');

    const state = createGame({ seed: 'test-ceo-shipcodes', players: [{ name: 'CEO', charId: 'ceo' }] });
    const p = state.players[0];
    const q = p.quests[0];

    // Remove an action card from game
    const removedCard = p.hand[0];
    engine.removeCardFromGame(state, p, removedCard);
    assert.equal(p.hand.includes(removedCard), false);
    assert.deepEqual(p.removedCards, [removedCard]);

    // Go to regular room explored as Archives room and activate Ship Codes
    const regRoom = Object.keys(state.ship.rooms).find(id => !['cockpit', 'hibernatorium', 'engine'].includes(state.ship.rooms[id].kind));
    p.room = regRoom;
    state.roomState[p.room].tile = 'archives';
    state.roomState[p.room].explored = true;
    state.prompt = null;
    state.queue = [{ op: 'quest.open', player: p.id, uid: q.uid }];
    engine.run(state);

    assert.equal(q.open, true);
    assert.ok(p.discard.includes(removedCard), 'Removed action card was returned to discard');
    assert.equal(p.removedCards.length, 0, 'removedCards array is cleared');
});

test('QUEST-AUDIT-05: Surgery Kit discards hand & deck, clears contaminations, removes larva, passes', async () => {
    const { createGame } = await import('../shared/engine/setup.mjs');
    const engine = await import('../shared/engine/core.mjs');
    await import('../shared/engine/items.mjs');
    await import('../shared/engine/actions2.mjs');

    const state = createGame({ seed: 'test-medic-surgery', players: [{ name: 'Doc', charId: 'medic' }, { name: 'Soldier', charId: 'soldier' }] });
    const p = state.players[0];
    p.items.push({ uid: 'sk1', item: 'surgeryKit', quest: true });
    p.hand = ['medic.firstAid#0', 'contam#1'];
    p.deck = ['medic.rest#0', 'contam#2'];
    p.discard = ['medic.search#0', 'contam#3'];
    p.larva = true;

    state.prompt = null;
    state.queue = [{ op: 'item.surgeryKit', player: p.id, uid: 'sk1', answer: String(p.id), then: { op: 'turn.choose' } }];
    engine.run(state);

    assert.equal(p.larva, false, 'Larva removed');
    assert.equal(p.passed, true, 'Target forced to pass');
    assert.equal(p.hand.length, 0, 'Hand discarded');
    assert.equal(p.deck.length, 0, 'Deck discarded');
    assert.ok(p.discard.includes('medic.firstAid#0'), 'Action card from hand in discard');
    assert.ok(p.discard.includes('medic.rest#0'), 'Action card from deck in discard');
    assert.ok(p.discard.includes('medic.search#0'), 'Action card from discard retained');
    assert.equal(p.discard.some(c => c.startsWith('contam#')), false, 'All contamination cards removed');
    assert.equal(p.items.some(i => i.item === 'surgeryKit'), false, 'Surgery kit consumed');
});

test('QUEST-AUDIT-06: Universal rule - Quest items cannot be opened when intruders are present in room', async () => {
    const { createGame } = await import('../shared/engine/setup.mjs');
    const { buildMenu } = await import('../shared/engine/turn.mjs');

    const state = createGame({ seed: 'test-quest-nointruders', players: [{ name: 'Capt', charId: 'captain' }] });
    const p = state.players[0];
    const q = p.quests[0];
    assert.ok(q, 'Captain has intercom quest');

    // Comms room without intruder -> enabled
    const regRoom = Object.keys(state.ship.rooms).find(id => !['cockpit', 'hibernatorium', 'engine'].includes(state.ship.rooms[id].kind));
    p.room = regRoom;
    state.roomState[p.room].tile = 'comms';
    state.roomState[p.room].explored = true;

    let menu = buildMenu(state, p);
    let qAct = menu.actions.find(a => a.id === 'quest');
    assert.equal(qAct.enabled, true, 'Enabled without intruder');

    // Add intruder -> disabled with reason
    state.intruders = { it1: { uid: 'it1', room: p.room, type: 'creeper' } };
    menu = buildMenu(state, p);
    qAct = menu.actions.find(a => a.id === 'quest');
    assert.equal(qAct.enabled, false, 'Disabled with intruder');
    assert.match(qAct.reason, /чуж/i, 'Reason mentions intruder');
});
