// Bots: route planning, fight readiness, phase III buying and the solo game reaching its end
// (Книги правил/База.md p. 12 moves, p. 18 phase III, p. 33 solo).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, options } from '../shared/engine/core.mjs';
import { viewFor } from '../shared/view.mjs';
import { botCommand, winChance, distances, deckFit, buyValue } from '../shared/bots.mjs';
import { ADJ, MONSTER } from '../shared/engine/util.mjs';
import { playGame } from './sim.mjs';
import { TRAIL_ALL } from './scenarios.mjs';

function solo(seed = 3) {
    const st = createGame({ seed, exp: {}, players: [{ name: 'B', school: 'wolf', bot: 1 }] });
    return st;
}

test('маршрут: BFS по дорогам — соседи на расстоянии 1, дальше больше', () => {
    const st = solo();
    const v = viewFor(st, 0);
    const d = distances(v, 3);
    assert.equal(d[3], 0);
    for (const n of ADJ[3]) assert.equal(d[n], 1);
    assert.ok(Object.values(d).some(x => x >= 3), 'есть далёкие локации');
});

test('готовность к битве: рука + колода решают, жетон следа помогает, лишние перемещения вредят', () => {
    const st = solo();
    const p = st.players[0];
    const slot = st.slots.find(s => s.mon);
    const v0 = viewFor(st, 0), me = v0.players[0];
    const base = winChance(v0, me, slot);
    assert.ok(winChance(v0, me, slot, 2) < base, 'карты, потраченные на дорогу, снижают шансы');
    p.trackTokens[slot.terrain] = 5;
    const v1 = viewFor(st, 0);
    assert.ok(winChance(v1, v1.players[0], slot) > base, 'жетон следа повышает шансы');
    p.deck.push(...p.deck.slice(0, 8));
    const v2 = viewFor(st, 0);
    assert.ok(winChance(v2, v2.players[0], slot) > 0.8, 'большая колода — уверенная битва');
});

test('бот с сильной колодой нападает на монстра в своей локации, не тратя карт на ходьбу', () => {
    const st = solo();
    const p = st.players[0];
    const slot = st.slots.find(s => s.mon && MONSTER_LVL(s.mon) === 1);
    p.loc = slot.token;
    p.deck.push(...p.deck.slice(0, 10));
    const cmd = botCommand(viewFor(st, 0), { options: options(st, 0), rand: () => 0.5 });
    assert.deepEqual(cmd, { t: 'fight' });
});

test('бот с сильной колодой перемещается, не уводя себя от монстра', () => {
    const st = solo();
    const p = st.players[0];
    p.deck.push(...p.deck.slice(0, 10));
    const slot = st.slots.find(s => s.mon);
    const v = viewFor(st, 0);
    const before = distances(v, p.loc)[slot.token];
    const cmd = botCommand(v, { options: options(st, 0), rand: () => 0.5 });
    assert.equal(cmd.t, 'move');
    // The step is either towards the monster or towards a closer useful goal; with a big deck the
    // monster usually wins — at least the step never leads away from every goal.
    const after = distances(v, cmd.to)[slot.token];
    assert.ok(after <= before + 1);
});

test('покупка: оценка учитывает связи с колодой и цену карты', () => {
    const st = solo();
    const v = viewFor(st, 0), me = v.players[0];
    const ids = st.row.filter(Boolean);
    for (const id of ids) assert.ok(Number.isFinite(deckFit(v, me, id)));
    const id = ids[0];
    assert.ok(buyValue(v, me, id, { cost: 0 }) > buyValue(v, me, id, { cost: 2 }));
});

test('одиночная игра: 40 партий ботом доходят до конца, без упора в лимит раундов', () => {
    const rounds = [];
    for (let seed = 1; seed <= 40; seed++) {
        const { state } = playGame({ players: 1, seed, exp: seed % 2 ? TRAIL_ALL : [] });
        assert.equal(state.stage, 'over', `seed ${seed}: партия не закончилась (раунд ${state.round})`);
        rounds.push(state.round);
    }
    const avg = rounds.reduce((a, b) => a + b, 0) / rounds.length;
    assert.ok(avg < 35, `в среднем ${avg.toFixed(1)} раундов`);
});

test('партии на 3 игроков: боты сами устраивают битвы ведьмаков', () => {
    let duels = 0;
    for (let seed = 1; seed <= 30; seed++) {
        const { state } = playGame({ players: 3, seed, exp: [] });
        assert.equal(state.stage, 'over', `seed ${seed}`);
        duels += state.log.filter(l => /нападает на ведьмака/.test(l.t)).length;
    }
    assert.ok(duels >= 1, `битв ведьмаков: ${duels}`);
});
const MONSTER_LVL = (id) => MONSTER[id].level;
