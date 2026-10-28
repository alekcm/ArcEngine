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
