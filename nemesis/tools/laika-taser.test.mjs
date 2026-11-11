import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../shared/engine/setup.mjs';
import { OPS, answer, next, run } from '../shared/engine/core.mjs';
import { itemRequirement } from '../shared/engine/turn.mjs';

function fresh() {
    const s = createGame({ seed: 'laika-taser', mode: 'original', draft: false, adaptations: '0',
        players: [{ name: 'Hunter', charId: 'bounty' }, { name: 'Crew', charId: 'scout' }, { name: 'Remote', charId: 'soldier' }] });
    s.queue = []; s.prompt = null; s.resume = null; s.result = null; s.phase = 'test'; s.intruders = {};
    s.players.forEach((p, i) => { p.status = 'active'; p.pod = null; p.room = i ? '006' : '011'; });
    s.roomState['014'].explored = true; s.roomState['014'].tile = 'laboratory';
    s.secret.tokens['014'] = null;
    return s;
}
function execute(s, step) { next(s, step); run(s); }

for (const op of ['move.go', 'move.direct']) for (const explored of [true, false]) for (const careful of (op === 'move.go' ? [false, true] : [false])) {
    test(`Laika: ${op}, explored=${explored}, careful=${careful} recalls her but suppresses arrival noise`, () => {
        const s = fresh(), p = s.players[0]; p.laika = '014';
        s.roomState['014'].explored = explored;
        s.secret.tiles['014'] = 'laboratory';
        execute(s, { op, player: p.id, dest: '014', careful, then: { op: 'noop' } });
        assert.equal(p.room, '014');
        assert.equal(p.laika, 'board', 'Laika is recalled automatically');
        assert.equal(s.prompt, null, 'no noise die and no careful-noise placement');
        assert.ok(s.roomState['014'].explored, 'normal exploration still occurs');
        assert.ok(s.log.some(e => /В комнате Лайка — бросок шума не делается/.test(e.text)));
    });
}

test('Laika: without an on-board dog in the destination, movement still makes noise', () => {
    for (const dog of ['board', null, '015']) for (const careful of [false, true]) {
        const s = fresh(), p = s.players[0]; p.laika = dog;
        execute(s, { op: 'move.go', player: p.id, dest: '014', careful, then: { op: 'noop' } });
        assert.equal(s.prompt?.kind, careful ? 'choice' : 'dice', `dog=${dog}, careful=${careful}`);
    }
});

test('Laika: any other character entering her room also skips noise; remote dog remains', () => {
    const s = fresh(), owner = s.players[0], other = s.players[1];
    owner.room = '011'; owner.laika = '014'; other.room = '011';
    execute(s, { op: 'move.go', player: other.id, dest: '014', then: { op: 'noop' } });
    assert.equal(s.prompt, null);
    assert.equal(owner.laika, '014');
});

test('Laika: a dog that is not on the board does not suppress noise', () => {
    for (const status of ['dead', 'hibernating']) {
        const s = fresh(), owner = s.players[0], other = s.players[1];
        owner.status = status; owner.laika = '014'; other.room = '011';
        execute(s, { op: 'move.go', player: other.id, dest: '014', then: { op: 'noop' } });
        assert.equal(s.prompt?.kind, 'dice');
    }
});

test('Taser: only active players and intruders in the same room are offered', () => {
    const s = fresh(), [p, local, remote] = s.players;
    const item = { uid: 'taser1', item: 'taser' }; p.items.push(item);
    local.room = p.room;
    p.hand = ['bounty.rest#0']; local.hand = ['scout.rest#0', 'scout.search#0']; remote.hand = ['soldier.rest#0'];
    s.intruders.local = { uid: 'local', type: 'adult', room: p.room, hits: 0 };
    s.intruders.remote = { uid: 'remote', type: 'adult', room: remote.room, hits: 0 };
    assert.equal(itemRequirement(s, p, item), '');
    execute(s, { op: 'item.use', player: p.id, uid: item.uid, then: { op: 'noop' } });
    assert.deepEqual(s.prompt.options.map(o => o.id), ['i:local', 'p:0', 'p:1']);
    const prompt = s.prompt.id;
    assert.equal(answer(s, p.id, prompt, 'p:2'), false, 'a forged remote target is rejected');
    assert.equal(answer(s, p.id, prompt, 'i:remote'), false);
    assert.equal(answer(s, p.id, prompt, 'p:1'), true);
    assert.equal(local.hand.length, 0);
    assert.deepEqual(remote.hand, ['soldier.rest#0']);
    assert.ok(!p.items.includes(item));
});

test('Taser: intruder repel still works, while stale or invalid targets are harmless', () => {
    const s = fresh(), [p, local, remote] = s.players;
    p.items.push({ uid: 'taser1', item: 'taser' }); local.room = p.room;
    local.hand = ['scout.rest#0']; remote.hand = ['soldier.rest#0'];
    s.intruders.local = { uid: 'local', type: 'adult', room: p.room, hits: 0 };
    execute(s, { op: 'item.use', player: p.id, uid: 'taser1', then: { op: 'noop' } });
    assert.equal(answer(s, p.id, s.prompt.id, 'i:local'), true);
    assert.notEqual(s.intruders.local.room, p.room);
    // Revalidate a restored/pending step even if its target has since changed rooms.
    OPS['item.taser'](s, { player: p.id, answer: 'p:2', then: { op: 'noop' } });
    assert.deepEqual(remote.hand, ['soldier.rest#0']);
    OPS['item.taser'](s, { player: p.id, answer: 'p:999', then: { op: 'noop' } });
    assert.deepEqual(local.hand, ['scout.rest#0']);
});

test('Taser: no valid target leaves the item intact and disables it in the menu', () => {
    const s = fresh(), [p, local] = s.players;
    const item = { uid: 'taser1', item: 'taser' }; p.items.push(item); p.hand = [];
    local.room = p.room; local.pod = 1; local.hand = ['scout.rest#0'];
    s.players[2].hand = ['soldier.rest#0'];
    assert.equal(itemRequirement(s, p, item), 'Нет цели в комнате');
    p.hand = ['bounty.rest#0'];
    assert.equal(itemRequirement(s, p, item), 'Нет цели в комнате', 'payment would empty the only local hand');
    p.hand = ['bounty.rest#0', 'bounty.search#0'];
    assert.equal(itemRequirement(s, p, item), '', 'the user may still choose themselves if cards remain');
    p.hand = [];
    execute(s, { op: 'item.use', player: p.id, uid: item.uid, then: { op: 'noop' } });
    assert.equal(s.prompt, null); assert.ok(p.items.includes(item));
    assert.ok(!(s.itemDiscard.red || []).includes('taser'));
});

test('Laika: a real paid move completes without a noise prompt when the Hunter rejoins her', () => {
    const s = fresh(), p = s.players[0];
    s.phase = 'player'; s.current = p.id; s.actionsLeft = 2;
    p.laika = '014'; p.hand = ['bounty.rest#0', 'bounty.search#0'];
    execute(s, { op: 'turn.choose' });
    assert.equal(s.prompt.kind, 'turn');
    assert.equal(answer(s, p.id, s.prompt.id, { action: 'move', dest: '014' }), true);
    assert.equal(s.prompt.kind, 'cards');
    assert.equal(answer(s, p.id, s.prompt.id, ['bounty.rest#0']), true);
    assert.equal(p.room, '014'); assert.equal(p.laika, 'board');
    assert.equal(s.prompt.kind, 'turn', 'the next action is offered without a noise die');
    assert.equal(s.actionsLeft, 1);
});

test('Taser: the paid item action lists only nearby targets after paying', () => {
    const s = fresh(), [p, local, remote] = s.players;
    s.phase = 'player'; s.current = p.id; s.actionsLeft = 2;
    p.hand = ['bounty.rest#0']; p.items.push({ uid: 'taser1', item: 'taser' });
    local.room = p.room; local.hand = ['scout.rest#0']; remote.hand = ['soldier.rest#0'];
    execute(s, { op: 'turn.choose' });
    assert.equal(answer(s, p.id, s.prompt.id, { action: 'item', itemId: 'taser1' }), true);
    assert.equal(s.prompt.kind, 'cards');
    assert.equal(answer(s, p.id, s.prompt.id, ['bounty.rest#0']), true);
    assert.deepEqual(s.prompt.options.map(o => o.id), ['p:1']);
    assert.equal(answer(s, p.id, s.prompt.id, 'p:1'), true);
    assert.equal(local.hand.length, 0); assert.equal(remote.hand.length, 1);
});
