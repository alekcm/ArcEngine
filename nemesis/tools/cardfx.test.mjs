// cardfx.test.mjs — what the table shows while cards move.
//   node --test nemesis/tools/cardfx.test.mjs
// Three complaints from the table:
//   * «Поиск» showed the played card in the middle of the screen, right on top of the item list the
//     player has to pick from — the card must go straight to the discard pile;
//   * drawing the items for that Search played "pull a card out of the deck" for every colour;
//   * a normal draw flew a shrunken grey rectangle instead of the whole card.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createGame } from '../shared/engine/setup.mjs';
import { searchRoom } from '../shared/engine/items.mjs';
import { drawItem } from '../shared/engine/rooms.mjs';
import { ROOM_TILES } from '../shared/ship.mjs';

const src = fs.readFileSync(new URL('../client/fx.js', import.meta.url), 'utf8');

function fresh() {
    const state = createGame({
        seed: 'cardfx', mode: 'original', draft: false,
        players: [{ name: 'Alpha', charId: 'soldier' }, { name: 'Beta', charId: 'scout' }],
    });
    state.queue = []; state.prompt = null; state.resume = null; state.result = null;
    state.players.forEach(p => { p.room = '011'; p.status = 'active'; });
    state.fx = [];
    return state;
}

test('CFX-01 a Search draws its items quietly: nothing flies out of the deck', () => {
    const s = fresh();
    // a tile with three item icons is the worst case: three "pulled from the deck" animations
    const tile = Object.keys(ROOM_TILES).find(t => (ROOM_TILES[t].items || []).length >= 2);
    assert.ok(tile, 'the game has a room with item icons');
    const slot = Object.keys(s.ship.rooms).find(id => s.ship.rooms[id].kind === 'slot1');
    s.roomState[slot].tile = tile;
    s.roomState[slot].explored = true;
    const p = s.players[0];
    p.room = slot;
    searchRoom(s, p, { op: 'turn.choose' });
    const items = s.fx.filter(e => e.type === 'item');
    assert.equal(items.length, ROOM_TILES[tile].items.length, 'one card per icon is still drawn');
    for (const e of items) assert.equal(e.quiet, true, 'the Search draw is quiet');
    // and a normal item pickup still animates
    s.fx = [];
    drawItem(s, ROOM_TILES[tile].items[0]);
    const one = s.fx.filter(e => e.type === 'item');
    assert.equal(one.length, 1);
    assert.ok(!one[0].quiet, 'an ordinary item draw keeps its animation');
});

test('CFX-02 «Поиск» goes from the hand straight to the discard, never through the centre', () => {
    // the card effect is what the client keys on: the same `search` that opens the picker
    assert.ok(/d\.effect === 'search'/.test(src), 'the played card knows it is a Search');
    const branch = src.slice(src.indexOf("case 'play': case 'useItem':"));
    const guard = branch.slice(0, branch.indexOf("const mid = this.centerRect"));
    assert.ok(/pileRect\('owndisc'\)/.test(guard), 'the Search card flies to the discard pile');
    assert.ok(!/this\.centerRect\(/.test(guard), 'and never parks in the middle of the table');
    assert.ok(/this\.skipNext = f\.card/.test(guard), 'the following discard fx for the same card is folded in');
});

test('CFX-03 a drawn card is a whole card, sliding out of the deck', () => {
    const draw = src.slice(src.indexOf("case 'draw': {"), src.indexOf("case 'play': case 'useItem':"));
    assert.ok(/makeCard\(DECK_COLORS\.own, null, 128, 176\)/.test(draw), 'a full-size card is used, not a small silhouette');
    assert.ok(!/makeCard\(DECK_COLORS\.own, null\)/.test(draw), 'no default small card');
    assert.ok(/scaleA: 1/.test(draw), 'it does not start shrunken');
    assert.ok(/pileRect\('own'\)/.test(draw), 'it comes out of the deck pile in the corner');
});

test('CFX-04 the item fly-out is skipped only when the draw is quiet', () => {
    assert.ok(/if \(f\.quiet\) \{ done\(\); break; \}/.test(src), 'a quiet draw plays no animation');
    const item = src.slice(src.indexOf("case 'item': {"), src.indexOf("case 'event': case 'attack': case 'queen':"));
    assert.ok(/this\.makeCard\(DECK_COLORS\[f\.deck\], null\)/.test(item), 'an ordinary item still flies out of its deck');
});

// Exercise the actual client queue with public views, including legacy snapshots whose `n` was
// overwritten by a card/damage count. A full state is the same path used by undo and reconnect.
test('CFX-05 undo and legacy saves do not replay the card history after a count event', async () => {
    const { fx } = await import('../shared/engine/core.mjs');
    const { viewFor } = await import('../shared/view.mjs');
    const clientSrc = src.replace(/^import .*;\s*$/gm, '').replace('export class TableFX', 'class TableFX');
    const TableFX = new Function('esc', clientSrc + '\nreturn TableFX;')(x => x);
    const clients = [0, 1].map(() => {
        const c = new TableFX({ innerHTML: '' }, {}, () => null, {});
        c.played = []; c.play = (f, done) => { c.played.push([f.seq, f.type, f.n]); done(); };
        return c;
    });
    const s = fresh(); s.fxSeq = 0;
    for (let i = 0; i < 300; i++) fx(s, { type: 'play', card: 'soldier.search' });
    fx(s, { type: 'draw', player: 0, n: 2 });
    // Old stored games have no seq. The last `n` is the count, not the 301st event.
    s.fx.forEach(f => delete f.seq);
    const snapshot = JSON.stringify(s);
    const withoutCounter = JSON.parse(snapshot); delete withoutCounter.fxSeq;
    assert.equal(viewFor(withoutCounter, 0).fx.at(-1).seq, 301, 'older saves without a counter recover the tail');
    fx(withoutCounter, { type: 'draw', n: 3, player: 0 });
    assert.equal(viewFor(withoutCounter, 0).fx.at(-1).seq, 302, 'the recovered counter advances');
    for (let i = 0; i < clients.length; i++) {
        const v = viewFor(s, i);
        assert.equal(v.fx.length, 256);
        assert.equal(v.fx[0].seq, 46);
        assert.equal(v.fx.at(-1).seq, 301);
        assert.equal(v.fx.at(-1).n, 2);
        clients[i].update(v, i); // full state on reconnect/load
        clients[i].update(v, i);
        assert.deepEqual(clients[i].played, []);
    }
    fx(s, { type: 'play', card: 'soldier.search' });
    fx(s, { type: 'contam', player: 0, n: 1 });
    fx(s, { type: 'damage', player: 0, n: 3 });
    for (let i = 0; i < clients.length; i++) {
        clients[i].update(viewFor(s, i), i);
        clients[i].update(viewFor(s, i), i);
        assert.deepEqual(clients[i].played, [[302, 'play', 302], [303, 'contam', 1], [304, 'damage', 3]]);
    }
    const restored = JSON.parse(snapshot);
    for (let i = 0; i < clients.length; i++) {
        clients[i].reset(); clients[i].update(viewFor(restored, i), i);
        clients[i].update(viewFor(restored, i), i);
        assert.equal(clients[i].played.length, 3, 'undo is a baseline, not new effects');
    }
    fx(restored, { type: 'draw', player: 0, n: 4 });
    fx(restored, { type: 'play', card: 'soldier.search' });
    for (let i = 0; i < clients.length; i++) {
        clients[i].update(viewFor(restored, i), i);
        clients[i].update(viewFor(restored, i), i);
        assert.deepEqual(clients[i].played.slice(3), [[302, 'draw', 4], [303, 'play', 303]], 'new timeline plays exactly once');
    }
});

test('CFX-06 reset cancels the current effect and stale callbacks cannot interfere with the new timeline', async () => {
    const timers = [], nodes = [];
    const document = {
        createElement: () => {
            const el = { style: { setProperty() {} }, classList: { add() {} }, offsetWidth: 100, offsetHeight: 140,
                remove() { this.removed = true; }, animate() { const anim = {}; this.anim = anim; return anim; } };
            nodes.push(el); return el;
        },
        querySelector: () => null, body: { appendChild() {} },
    };
    const clientSrc = src.replace(/^import .*;\s*$/gm, '').replace('export class TableFX', 'class TableFX');
    const TableFX = new Function('document', 'setTimeout', 'esc', 'describeCard', 'cardArt', 'Snd', 'innerWidth', 'innerHeight',
        clientSrc + '\nreturn TableFX;')(document, fn => timers.push(fn), x => x,
        () => ({ name: 'card' }), () => null, { play() {} }, 800, 600);
    const c = new TableFX({ innerHTML: '' }, { appendChild() {} }, () => null, {});
    const view = { players: [], decks: {}, bagCount: 0, fx: [] };
    c.update(view, 0);
    c.update({ ...view, fx: [{ seq: 1, n: 1, type: 'play', player: 0, card: 'one' }] }, 0);
    const old = nodes[0], oldFinish = old.anim.onfinish;
    assert.equal(c.busy, true);
    oldFinish(); // the old card has already reached the centre and is waiting to fly away
    c.reset(); c.update(view, 0);
    assert.equal(old.removed, true);
    assert.equal(c.busy, false);
    c.update({ ...view, fx: [{ seq: 1, n: 1, type: 'play', player: 0, card: 'two' }] }, 0);
    assert.equal(c.busy, true);
    oldFinish(); // the old animation may still call onfinish after being removed
    while (timers.length) timers.shift()();
    await Promise.resolve();
    assert.equal(c.busy, true, 'old completion cannot finish the new effect');
    assert.equal(c.skipNext, null);
    assert.equal(nodes.length, 2);
});
