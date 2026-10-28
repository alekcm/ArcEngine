// Escape-pod tests: the two launch routes must agree on the finish order.
//   node --test nemesis/tools/pods.test.mjs
//  * launching from the Evacuation tile and launching at the start of a turn both record the
//    character in the finish order (the "Heroic Escape" Objective is decided by that order),
//  * a launched pod cannot be boarded again and its seats are freed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../shared/engine/setup.mjs';
import { answer, next, run } from '../shared/engine/core.mjs';
import { OBJECTIVES } from '../shared/data/cards.mjs';
import { checkObjective } from '../shared/engine/endgame.mjs';

function fresh() {
    const state = createGame({
        seed: 'pods', mode: 'original', draft: false,
        players: [{ name: 'Alpha', charId: 'soldier' }, { name: 'Beta', charId: 'scout' }],
    });
    state.queue = []; state.prompt = null; state.resume = null; state.result = null;
    state.phase = 'player'; state.current = 0; state.firstPlayer = 0;
    state.seating = state.players.map(p => p.id); state.turnCursor = 0; state.actionsLeft = 2;
    state.players.forEach(p => { p.status = 'active'; p.passed = false; p.room = '003'; p.pod = null; });
    for (const id of Object.keys(state.ship.rooms)) {
        state.roomState[id].explored = true;
        state.roomState[id].tile = state.roomState[id].tile || 'storage';
    }
    state.roomState['003'].tile = 'evacA';
    state.pods.forEach(p => { p.occupants = []; p.launched = false; p.removed = false; p.locked = false; });
    return state;
}
/** Answer prompts with the first usable option unless `choose` returns something. */
function drive(state, choose = () => undefined) {
    for (let i = 0; i < 40 && state.prompt && !state.result; i++) {
        const pr = state.prompt;
        if (pr.kind === 'turn') return;
        let a = choose(pr);
        if (a === undefined) {
            if (pr.kind === 'choice') a = (pr.options.find(o => !o.disabled) || {}).id;
            else if (pr.kind === 'room') a = pr.rooms[0];
            else if (pr.kind === 'cards') a = pr.cards.slice(0, Math.max(pr.min, 1));
            else if (pr.kind === 'dice') a = 'roll';
            else if (pr.kind === 'info') a = 'ok';
            else if (pr.kind === 'bag') a = 'draw';
        }
        assert.ok(answer(state, pr.player, pr.id, a), 'prompt must accept ' + pr.kind + ': ' + pr.title);
    }
}

test('PD-01 launching at the start of a turn records the finish order', () => {
    const s = fresh();
    const pod = s.pods.find(p => p.section === 'A');
    s.players[0].pod = pod.num; pod.occupants = [0];
    next(s, { op: 'pod.turn', player: 0 }); run(s);
    drive(s, pr => (pr.options || []).some(o => o.id === 'launch') ? 'launch' : undefined);
    assert.equal(s.players[0].status, 'escaped');
    assert.deepEqual(s.finishOrder, [0], 'the pod launch must be part of the finish order');
    assert.equal(pod.launched, true);
    assert.deepEqual(pod.occupants, []);
});

test('PD-02 launching from the Evacuation tile records the finish order too', () => {
    const s = fresh();
    next(s, { op: 'room.action', player: 0, room: '003' }); run(s);
    drive(s, pr => (pr.options || []).some(o => o.id === 'launch') ? 'launch'
        : (pr.options || []).some(o => o.id === '1') ? '1' : undefined);
    assert.equal(s.players[0].status, 'escaped');
    assert.deepEqual(s.finishOrder, [0]);
});

test('PD-03 the finish order decides "Heroic Escape"', () => {
    const s = fresh();
    const pod = s.pods.find(p => p.section === 'A');
    s.players[0].pod = pod.num; pod.occupants = [0];
    next(s, { op: 'pod.turn', player: 0 }); run(s);
    drive(s, pr => (pr.options || []).some(o => o.id === 'launch') ? 'launch' : undefined);
    // The other character stays on board and survives, so the last finisher is Heroic.
    s.players[1].status = 'hibernating';
    const def = Object.values(OBJECTIVES.personal).find(o => o.check === 'heroicEscape');
    assert.ok(def, 'the Heroic Escape Objective exists');
    assert.equal(checkObjective(s, s.players[0], def, 'earth'), true, 'the last finisher with a survivor wins');
});
