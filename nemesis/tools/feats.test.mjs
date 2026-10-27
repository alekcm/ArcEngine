// Feats (Подвиги) pool tests: the deck viewer lists the shared pool, so the state has to remember
// which cards are still available and which ones already left the game.
//   node --test nemesis/tools/feats.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../shared/engine/setup.mjs';
import { OPS, answer, next, run } from '../shared/engine/core.mjs';
import { viewFor } from '../shared/view.mjs';
import { FEATS } from '../shared/data/cards.mjs';

function fresh(chars = ['soldier', 'scout']) {
    const state = createGame({
        seed: 'feats-viewer', mode: 'original', draft: false,
        players: chars.map((charId, i) => ({ name: 'Feat ' + i, charId })),
    });
    state.queue = []; state.prompt = null; state.resume = null; state.result = null;
    state.phase = 'player'; state.current = 0; state.firstPlayer = 0;
    state.seating = state.players.map(p => p.id); state.turnCursor = 0; state.actionsLeft = 2;
    state.players.forEach(p => { p.status = 'active'; p.passed = false; });
    return state;
}

test('FT-01 setup: six distinct Feats, nothing taken yet', () => {
    const s = fresh();
    assert.equal(s.feats.length, 6);
    assert.equal(new Set(s.feats).size, 6, 'no duplicates');
    for (const k of s.feats) assert.ok(FEATS[k], 'known feat ' + k);
    assert.deepEqual(s.featsUsed, []);
});

test('FT-02 view: the pool and the cards taken from it are public', () => {
    const s = fresh();
    s.feats = ['revelation', 'respite'];
    s.featsUsed = ['rush'];
    for (const viewer of [0, 1, null]) {
        const v = viewFor(s, viewer);
        assert.deepEqual(v.feats, ['revelation', 'respite'], 'pool is visible to viewer ' + viewer);
        assert.deepEqual(v.featsUsed, ['rush'], 'taken cards are visible to viewer ' + viewer);
    }
});

test('FT-03 feat.pick removes the card from the pool and records it as used', () => {
    const s = fresh();
    s.feats = ['revelation', 'respite'];
    s.featsUsed = [];
    next(s, { op: 'feat.offer', player: 0, then: { op: 'turn.choose' } });
    run(s);
    assert.ok(s.prompt && s.prompt.kind === 'choice', 'the Feat choice is offered');
    assert.deepEqual(s.prompt.options.map(o => o.id).sort(), ['respite', 'revelation']);
    assert.equal(answer(s, 0, s.prompt.id, 'revelation'), true);
    assert.deepEqual(s.feats, ['respite'], 'the taken Feat leaves the pool');
    assert.deepEqual(s.featsUsed, ['revelation'], 'and is remembered as used');
    assert.ok(s.prompt && /разыграть/i.test(s.prompt.title), 'then it asks whether to resolve it');
    assert.equal(answer(s, 0, s.prompt.id, 'no'), true);
    assert.deepEqual(s.featsUsed, ['revelation'], 'discarding without effect does not record it twice');
    assert.deepEqual(s.feats, ['respite']);
});

test('FT-04 endgame removal also records the Feat as gone', () => {
    const s = fresh();
    s.feats = ['revelation', 'respite'];
    s.featsUsed = [];
    OPS['game.endFeat'](s, { player: 0, answer: 'respite' });   // the queued game.end step is not run
    assert.deepEqual(s.feats, ['revelation']);
    assert.deepEqual(s.featsUsed, ['respite']);
});
