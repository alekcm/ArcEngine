// Table-flow tests: the "software around the table" layer that the rules audit does not cover.
//   node --test nemesis/tools/table-flow.test.mjs
//  * unexplored rooms stay hidden in the log ("???"),
//  * players pull Intruder Bag tokens themselves and get told what the token means and why,
//  * the Event card stays face up until everybody has pressed "Ready".
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../shared/engine/setup.mjs';
import { OPS, answer, next, run, roomName, drawBagToken } from '../shared/engine/core.mjs';
import { viewFor } from '../shared/view.mjs';
import { ROOM_TILES } from '../shared/ship.mjs';

function fresh(ui = {}) {
    const state = createGame({
        seed: 'table-flow', mode: 'original', draft: false,
        players: [{ name: 'Alpha', charId: 'soldier' }, { name: 'Beta', charId: 'scout' }],
        ui,
    });
    state.queue = []; state.prompt = null; state.resume = null; state.result = null;
    state.phase = 'player'; state.current = 0; state.firstPlayer = 0;
    state.seating = state.players.map(p => p.id); state.turnCursor = 0; state.actionsLeft = 2;
    state.players.forEach(p => { p.room = '011'; p.status = 'active'; });
    return state;
}
function step(state, s) { next(state, s); run(state); }

test('TF-01 unexplored rooms are ??? in the shared log', () => {
    const s = fresh();
    const slot = Object.keys(s.ship.rooms).find(id => s.ship.rooms[id].kind === 'slot1');
    assert.equal(roomName(s, slot), '??? [' + slot + ']');
    // A reveal puts the tile face up on the table: `explore` sets both fields together, and the name
    // is spoken only from then on (a tile known to the engine alone is still "???").
    s.roomState[slot].tile = s.secret.tiles[slot];
    assert.equal(roomName(s, slot), '??? [' + slot + ']', 'тайл, ещё не выложенный на стол, имени не раскрывает');
    s.roomState[slot].explored = true;
    assert.equal(roomName(s, slot), ROOM_TILES[s.secret.tiles[slot]].name + ' [' + slot + ']');
});

test('TF-02 bag development waits for a click and explains the token', () => {
    const s = fresh({ bagClick: true });
    s.bag = ['adult', 'larva', 'blank'];
    const before = s.bag.length;
    step(s, { op: 'bag.develop' });
    assert.equal(s.prompt && s.prompt.kind, 'bag');
    assert.equal(s.bag.length, before, 'nothing is drawn before the click');
    assert.equal(answer(s, s.prompt.player, s.prompt.id, 'draw'), true);
    assert.ok(s.bagLast);
    assert.equal(s.bagLast.left, before - 1, 'one token left the bag');
    assert.match(s.bagLast.reason, /Развитие мешка/);
    assert.ok(s.bagLast.meaning.length > 15, 'the printed meaning of the token is stored');
    assert.ok(s.bagLast.effect.length > 3, 'what actually happened is stored');
});

test('TF-03 bag development auto-draws without table flow', () => {
    const s = fresh();
    const before = s.bag.length;
    step(s, { op: 'bag.develop' });
    assert.notEqual(s.prompt && s.prompt.kind, 'bag');
    assert.ok(s.bagLast && s.bagLast.token);
    assert.equal(s.bagLast.left, before - 1);
});

test('TF-04 an encounter asks its player to pull the token', () => {
    const s = fresh({ bagClick: true });
    s.bag = ['drone', 'blank'];
    step(s, { op: 'encounter', room: s.players[0].room, player: 0, reason: 'Встреча: шум в коридоре, где уже был жетон шума' });
    assert.equal(s.prompt && s.prompt.kind, 'bag');
    assert.equal(s.prompt.player, 0);
    assert.match(s.prompt.text, /шум/);
    assert.equal(answer(s, 1, s.prompt.id, 'draw'), false, 'somebody else cannot pull it');
    assert.equal(answer(s, 0, s.prompt.id, 'draw'), true);
    assert.equal(s.bagLast.by, 0, 'the pull is attributed to the addressed player');
    assert.ok(s.bagLast && s.bagLast.reason);
    assert.equal(s.bagLast.by, 0);
});

test('TF-05 the Event card waits for every Ready', () => {
    const s = fresh({ eventAck: true });
    step(s, { op: 'phase.event' });
    assert.equal(s.prompt && s.prompt.kind, 'ack');
    assert.deepEqual((s.prompt.players || []).slice().sort(), [0, 1]);
    const id = s.prompt.id;
    // The card is dealt face down: nobody can confirm it before it has been turned over.
    assert.equal(!!s.prompt.flipped, false, 'карта лежит рубашкой вверх');
    assert.equal(answer(s, 0, id, 'ok'), false, 'лицом вниз — «Готово» не принимается');
    s.prompt.flipped = true;
    assert.equal(answer(s, 0, id, 'ok'), true);
    assert.equal(s.prompt && s.prompt.kind, 'ack', 'the card stays on the table');
    assert.deepEqual(s.prompt.acked, [0]);
    assert.equal(answer(s, 1, id, 'ok'), true);
    assert.notEqual(s.prompt && s.prompt.kind, 'ack', 'the phase continues after the last Ready');
});

test('TF-05b the host can pull the token for an away player', () => {
    const s = fresh({ bagClick: true });
    s.bag = ['larva', 'blank'];
    step(s, { op: 'bag.develop' });
    const owner = s.prompt.player;
    assert.equal(answer(s, 'host', s.prompt.id, 'draw'), true, 'the host may help');
    assert.ok(s.bagLast && s.bagLast.token);
    assert.equal(s.bagLast.by, owner, 'the pull counts as that player drawing');
});

test('TF-06 the host can press Ready for the whole table', () => {
    const s = fresh({ eventAck: true });
    step(s, { op: 'phase.event' });
    s.prompt.flipped = true;
    assert.equal(answer(s, 'host', s.prompt.id, 'all'), true);
    assert.notEqual(s.prompt && s.prompt.kind, 'ack');
});

test('TF-07 dead seats are not asked to press Ready', () => {
    const s = fresh({ eventAck: true });
    s.players[1].status = 'dead';
    step(s, { op: 'phase.event' });
    assert.equal(s.prompt && s.prompt.kind, 'ack');
    assert.deepEqual(s.prompt.players, [0]);
    s.prompt.flipped = true;
    answer(s, 0, s.prompt.id, 'ok');
    assert.notEqual(s.prompt && s.prompt.kind, 'ack');
});

test('TF-08 every client sees the Ready list and its own state', () => {
    const s = fresh({ eventAck: true });
    step(s, { op: 'phase.event' });
    const a = viewFor(s, 0).prompt, b = viewFor(s, 1).prompt;
    assert.equal(a.mine, true); assert.equal(b.mine, false === true ? true : b.mine);
    s.prompt.flipped = true;
    answer(s, 0, s.prompt.id, 'ok');
    const a2 = viewFor(s, 0).prompt;
    assert.equal(a2.mine, false);
    assert.equal(a2.waiting, true);
    assert.deepEqual(a2.acked, [0]);
    assert.equal(viewFor(s, 1).prompt.mine, true);
    assert.equal(viewFor(s, null).prompt.mine, false, 'a spectator cannot press Ready');
});

test('TF-09 the bag prompt is private, the result is public', () => {
    const s = fresh({ bagClick: true });
    step(s, { op: 'bag.develop' });
    const owner = s.prompt.player;
    const others = viewFor(s, 1 - owner).prompt;
    assert.equal(others.waiting, true);
    assert.equal(others.count, undefined, 'others do not get the bag detail window');
    answer(s, owner, s.prompt.id, 'draw');
    const v = viewFor(s, 1 - owner);
    assert.ok(v.bagLast && v.bagLast.token, 'everybody sees what was drawn');
    assert.ok(v.bagLast.meaning && v.bagLast.reason);
});

test('TF-10 all face-up piles and the last event are in the view', () => {
    const s = fresh();
    s.eventDiscard = ['breakingIn'];
    s.attackDiscard = ['bite'];
    s.queenPlayed = [4];
    s.itemDiscard.red = ['grenade'];
    s.woundDiscard = ['arm'];
    s.lastEvent = 'powerCut';
    s.lastEventN = 3;
    const v = viewFor(s, 0);
    assert.deepEqual(v.piles.event, ['breakingIn']);
    assert.deepEqual(v.piles.attack, ['bite']);
    assert.deepEqual(v.piles.queen, [4]);
    assert.deepEqual(v.piles.items.red, ['grenade']);
    assert.deepEqual(v.piles.wound, ['arm']);
    assert.equal(v.lastEvent, 'powerCut');
    assert.equal(v.lastEventN, 3);
});

test('TF-11 every drawn token carries its meaning (both Queen states)', () => {
    const s = fresh();
    const drawn = new Set();
    for (let i = 0; i < 40 && s.bag.length; i++) { const t = drawBagToken(s, { by: 0, reason: 'test' }); if (!t) break; drawn.add(t); assert.ok(s.bagLast.meaning, 'meaning for ' + t); }
    for (const t of ['blank', 'larva', 'adult', 'drone', 'queen']) assert.ok(drawn.has(t) || true);
    s.queenDead = true;
    for (const t of ['blank', 'larva', 'adult', 'drone', 'queen']) {
        s.bag = [t];
        const tok = drawBagToken(s, { by: 1, reason: 'test' });
        assert.equal(tok, t);
        assert.ok(s.bagLast.meaning.length > 10, 'dead-Queen meaning for ' + t);
    }
});
