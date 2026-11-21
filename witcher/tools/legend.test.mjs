// «Легендарная охота» (Книги правил/Легендарная охота.md): setup, movement and ruins, «Прогнать»,
// the legendary fight (life = 20 − ruins, armor by the trophy track), the end of the game.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, apply, options, actingSeat } from '../shared/engine/core.mjs';
import { push, run } from '../shared/engine/flow.mjs';
import { viewFor } from '../shared/view.mjs';
import { botCommand } from '../shared/bots.mjs';
import { ADJ, MONSTER, ATTACK, CARDS } from '../shared/engine/util.mjs';
import { normalizeExp } from '../shared/data/rules-data.mjs';
import { LEGEND, LEGEND_BY_KEY, LEG_ATTACK, LEG_MOVE, RUIN, ARMOR, SOLO_MOVES, legendOpts, LEG_SPECIAL } from '../shared/data/legend-data.mjs';
import { distTo, stepOptions, freeNeighbours } from '../shared/engine/legend.mjs';
import { playGame } from './sim.mjs';

const ok = (r) => assert.ok(r.ok, r.err);
const step = (st, ...s) => { push(st, ...s); run(st); };
function game({ exp = ['legendary', 'legendary:mon:kayran'], seed = 5, players = 2 } = {}) {
    const st = createGame({ seed, exp, players: Array.from({ length: players }, (_, i) => ({ name: 'P' + i, school: ['wolf', 'cat', 'bear', 'viper', 'griffin'][i], bot: i ? 1 : 0 })) });
    while (st.prompt) apply(st, st.prompt.seat, { t: 'answer', choice: st.prompt.options[0].id });
    return st;
}
/** Bots act until seat 0 has to decide. */
function settle(st) {
    for (let i = 0; i < 200; i++) {
        if (st.stage === 'over') return;
        const seat = actingSeat(st);
        if (seat === 0 || seat == null) return;
        ok(apply(st, seat, botCommand(viewFor(st, seat), { options: options(st, seat) })));
    }
}

test('данные: 8 легендарных монстров, 20 боевых карт, 12 карт перемещения, 24 жетона руин', () => {
    assert.equal(Object.keys(LEGEND).length, 8);
    assert.equal(Object.keys(LEG_ATTACK).length, 20);
    assert.equal(Object.keys(LEG_MOVE).length, 12);
    assert.equal(Object.keys(RUIN).length, 24);
    for (const L of Object.values(LEGEND)) {
        assert.equal(L.attacks.length, 4, L.id);
        assert.equal(LEG_SPECIAL[L.id].length, 4, L.id + ': операции особых атак I–IV');
        assert.ok(MONSTER[L.id] && MONSTER[L.id].legend);
    }
    for (const m of Object.values(LEG_MOVE)) assert.equal(m.pts.length, 5);
    assert.deepEqual(ARMOR, { A: [3, 2, 1, 0, 0], B: [4, 3, 2, 1, 0] });
});

test('лобби: подпункты дополнения сохраняются только вместе с ним', () => {
    assert.deepEqual(normalizeExp(['legendary:B', 'legendary:mon:golem']), []);
    const e = normalizeExp(['legendary', 'legendary:B', 'legendary:mon:golem', 'legendary:mon:kayran', 'legendary:solo:hard', 'legendary:mon:nope']);
    assert.ok(e.includes('legendary') && e.includes('legendary:B') && e.includes('legendary:mon:kayran') && e.includes('legendary:solo:hard'));
    assert.ok(!e.includes('legendary:mon:golem') && !e.includes('legendary:mon:nope'));
    assert.deepEqual(legendOpts(['legendary']), { side: 'A', mon: null, solo: 'normal' });
    assert.equal(legendOpts([]), null);
});

test('подготовка: монстр в начальной локации, колоды обычных монстров без легендарных', () => {
    const st = game();
    const L = st.legend;
    assert.equal(L.mon, 'LEG-KAYRAN');
    assert.equal(L.loc, LEGEND_BY_KEY.kayran.start);
    assert.equal(L.moveDeck.length, 12);
    assert.equal(L.ruinPool.length, 24);
    for (const lv of [1, 2, 3]) assert.ok(!st.monsterStacks[lv].some(id => LEGEND[id]));
    assert.ok(!st.slots.some(s => s.mon && LEGEND[s.mon]));
    for (const p of st.players) assert.deepEqual(p.ruins, []);
    // Random monster when none is chosen; side B.
    const st2 = game({ exp: ['legendary', 'legendary:B'], seed: 9 });
    assert.ok(LEGEND[st2.legend.mon]);
    assert.equal(st2.legend.side, 'B');
});

test('одиночная игра: колода перемещения 9/8/7 по сложности', () => {
    for (const [k, n] of Object.entries(SOLO_MOVES)) {
        const st = game({ exp: ['legendary', 'legendary:solo:' + k], players: 1 });
        assert.equal(st.legend.moveDeck.length, n, k);
    }
});

test('перемещение: ближайший шаг к основной локации, руины в покинутых локациях, в руины не заходит', () => {
    const st = game();
    const L = st.legend;
    const from = L.loc;
    const card = L.moveDeck[0];
    const c = LEG_MOVE[card];
    step(st, { op: 'legendMove' });
    const pts = c.pts[1];
    assert.equal(L.moveDiscard[0], card);
    assert.ok(Object.keys(L.ruins).length >= 1 || L.loc === from, 'ушёл — оставил руины');
    if (L.loc !== from) assert.ok(L.ruins[from] != null, 'руины в начальной локации');
    assert.ok(Object.keys(L.ruins).length <= pts);
    assert.ok(L.ruins[L.loc] == null);
    // stepOptions: neighbours without ruins only, nearest first.
    const d = distTo(c.main);
    const opts = stepOptions(st, c.main);
    for (const n of opts) { assert.ok(ADJ[L.loc].includes(n)); assert.equal(L.ruins[n], undefined); }
    const free = freeNeighbours(st, L.loc);
    const best = Math.min(...ADJ[L.loc].filter(n => d[n] != null).map(n => d[n]));
    if (free.some(n => d[n] === best)) assert.ok(opts.every(n => d[n] === best), 'ближайшие соседи');
    else assert.deepEqual(opts.sort(), free.slice().sort(), 'все ближайшие в руинах — любой сосед без руин');
});

test('локация монстра: действие закрыто; «Прогнать» — после перемещения, сбросом карты', () => {
    const st = game();
    const p = st.players[0], L = st.legend;
    p.loc = L.loc;
    let o = options(st, 0);
    assert.ok(o.chase.err, 'до перемещения нельзя');
    st.turn.moved = true;
    o = options(st, 0);
    assert.ok(o.loc.err && /закрывает/.test(o.loc.err));
    assert.equal(o.chase.err, null);
    const hand = p.hand.length, from = L.loc;
    ok(apply(st, 0, { t: 'chase' }));
    if (st.prompt && st.prompt.seat === 0 && st.prompt.kind === 'cards') ok(apply(st, 0, { t: 'answer', ids: [st.prompt.ids[0]] }));
    while (st.prompt && st.prompt.seat === 0) ok(apply(st, 0, { t: 'answer', choice: st.prompt.options[0].id }));
    assert.equal(p.hand.length, hand - 1);
    assert.notEqual(L.loc, from, 'монстр ушёл на 1 шаг');
    assert.ok(ADJ[from].includes(L.loc));
    assert.ok(L.ruins[from] != null);
});

test('руины: в конце фазы I игрок забирает жетон и получает бонус', () => {
    const st = game();
    const p = st.players[0], L = st.legend;
    const loc = ADJ[p.loc].find(n => n !== p.loc && n !== L.loc);
    L.ruins[loc] = 'RUIN-03';
    p.loc = loc; st.turn.moved = true;
    const gold = p.gold;
    ok(apply(st, 0, { t: 'explore', deck: 'wild' }));
    assert.deepEqual(p.ruins, ['RUIN-03']);
    assert.equal(L.ruins[loc], undefined);
    if (RUIN['RUIN-03'].fx.gold) assert.equal(p.gold >= gold + RUIN['RUIN-03'].fx.gold, true);
});

test('битва: запас жизни 20 − жетоны руин, ведьмак с руинами ходит первым, броня поглощает урон', () => {
    const st = game();
    const p = st.players[0], L = st.legend;
    p.ruins.push(L.ruinPool.pop(), L.ruinPool.pop());
    p.trophies.push({ kind: 'skill', id: st.skillTrophies.shift() }); p.track = 1;
    p.loc = L.loc; st.turn.moved = true;
    ok(apply(st, 0, { t: 'legend' }));
    while (st.prompt && st.prompt.seat === 0 && st.fight.stage !== 'witcher') ok(apply(st, 0, st.prompt.kind === 'choice' ? { t: 'answer', choice: st.prompt.options[0].id } : { t: 'answer', ids: st.prompt.ids.slice(0, st.prompt.min) }));
    const f = st.fight;
    assert.ok(f.legend);
    assert.equal(f.life.length + f.monDiscard.length, 20);
    assert.equal(f.life.length, 18);
    assert.equal(f.stage, 'witcher', 'ходит первым');
    assert.equal(f.armorBase, ARMOR.A[1]);
    assert.equal(f.cur.armor, ARMOR.A[1] + (f.cur.r.armorPlus || 0));
    // Deal 3 damage directly: the armor eats the first points.
    const before = f.life.length;
    step(st, { op: 'dealDamage', n: 3, fight: 1 });
    assert.equal(before - f.life.length, Math.max(0, 3 - f.cur.armor));
});

test('трофеи: 4 трофея не заканчивают партию, броня падает по шкале', () => {
    const st = game();
    const p = st.players[0];
    for (let i = 0; i < 5; i++) step(st, { op: 'gainTrophy', seat: 0, kind: 'skill', id: 'X' + i });
    while (st.prompt && st.prompt.seat === 0) ok(apply(st, 0, st.prompt.kind === 'choice' ? { t: 'answer', choice: st.prompt.options[0].id } : { t: 'answer', ids: st.prompt.ids.slice(0, st.prompt.min) }));
    assert.equal(p.track, 4);
    assert.notEqual(st.stage, 'over');
});

test('одиночная игра: нужна карта перемещения, а колода пуста — поражение', () => {
    const st = game({ exp: ['legendary', 'legendary:solo:hard'], players: 1 });
    st.legend.moveDeck = [];
    step(st, { op: 'legendMove' });
    assert.equal(st.stage, 'over');
    assert.equal(st.lost, true);
    assert.equal(st.winner, null);
});

test('вид игрока: колоды скрыты, чужие жетоны руин — только числом', () => {
    const st = game();
    st.players[1].ruins.push('RUIN-01');
    st.legend.ruins[3] = 'RUIN-02';
    const v = viewFor(st, 0);
    assert.equal(typeof v.legend.moveDeck, 'number');
    assert.equal(typeof v.legend.ruinPool, 'number');
    assert.deepEqual(v.legend.ruins, [3]);
    assert.equal(v.players[1].ruins, undefined);
    assert.equal(v.players[1].ruinCount, 1);
    assert.deepEqual(v.players[0].ruins, []);
});

test('партии ботов (2–4 игрока, стороны А/Б): кто-то побеждает легендарного монстра', () => {
    for (const [players, seed, sub] of [[2, 1, []], [3, 2, ['legendary:B']], [4, 3, ['legendary:mon:gaunter']], [3, 4, ['legendary:mon:unseen']]]) {
        const { state } = playGame({ players, seed, exp: ['legendary', ...sub] });
        assert.equal(state.stage, 'over', `${players}p seed ${seed}`);
        assert.ok(state.winner != null, `${players}p seed ${seed}: победитель`);
        assert.ok(state.log.some(l => /побеждает легендарного монстра/.test(l.t)));
    }
});

test('одиночная партия бота доходит до конца (победа или поражение)', () => {
    for (const seed of [1, 2]) {
        const { state } = playGame({ players: 1, seed, exp: ['legendary', 'legendary:solo:easy'] });
        assert.equal(state.stage, 'over');
        assert.ok(state.winner != null || state.lost);
    }
});

test('боевые карты легендарного монстра входят в общий справочник атак', () => {
    for (const id of Object.keys(LEG_ATTACK)) assert.ok(ATTACK[id]);
});

test('Скрытый: +урон за руины в первый ход и у особой атаки без урона («Подчинение разума»)', () => {
    for (const [n, purple] of [[2, false], [1, true]]) {
        const st = game({ exp: ['legendary', 'legendary:mon:unseen'] });
        const p = st.players[0];
        p.loc = st.legend.loc; st.turn.moved = true; p.ruins = ['RUIN-01', 'RUIN-02'];
        ok(apply(st, 0, { t: 'legend' }));
        // I «Нечеловеческая сила» with a purple card in hand: the card is discarded, no damage.
        if (purple) p.hand.push(Object.values(CARDS).find(c => c.color === 'purple' && !p.hand.includes(c.id)).id);
        const f = st.fight; f.turn = 'monster'; f.mTurns = 1; f.stage = 'busy';
        f.lastAttack = { id: 'x', type: 'special', n };
        const mark = st.log.length;
        step(st, { op: 'spAttack', fight: 1, n });
        if (st.prompt && st.prompt.seat === 0) ok(apply(st, 0, { t: 'answer', ids: st.prompt.ids.slice(0, st.prompt.min || 1) }));
        const text = st.log.slice(mark).map(l => l.t).join('\n');
        assert.match(text, /Скрытый \+2 \(руины\)/, `атака ${n}`);
        assert.match(text, /получает 2 урона/, `атака ${n}`);
    }
});

test('боты: «Прогнать», пока к битве не готовы; соло — монстр туда, где больше свободных соседей', () => {
    for (const players of [2, 1]) {
        const st = game({ exp: players === 1 ? ['legendary', 'legendary:solo:normal'] : ['legendary', 'legendary:mon:kayran'], players });
        const p = st.players[0], L = st.legend;
        p.loc = L.loc; st.turn.moved = true; p.quests = []; p.hunts = [];
        for (const s of st.slots) if (s.token === L.loc) s.mon = null;
        for (const n of Object.keys(L.ruins)) delete L.ruins[n];
        assert.equal(options(st, 0).chase.err, null);
        const cmd = botCommand(viewFor(st, 0), { options: options(st, 0) });
        assert.deepEqual(cmd, { t: 'chase' }, `${players} игрок(а): руины за 1 карту вместо безнадёжной битвы`);
        if (players === 1) {
            const from = L.loc;
            const free = (n) => freeNeighbours(st, n).filter(x => x !== from).length;
            const best = Math.max(...freeNeighbours(st, from).map(free));
            p.bot = 1;
            ok(apply(st, 0, cmd));
            assert.ok(L.ruins[from] != null);
            assert.equal(free(L.loc), best, 'выбрана соседняя локация с наибольшим числом свободных соседей');
        }
    }
});

test('боты: в битве с Пугачом комбинация не больше чем из 3 цветов', () => {
    const st = game({ exp: ['legendary', 'legendary:mon:fiend'] });
    const p = st.players[0];
    p.loc = st.legend.loc; st.turn.moved = true;
    ok(apply(st, 0, { t: 'legend' }));
    for (let i = 0; i < 20 && st.prompt && st.prompt.seat === 0; i++) ok(apply(st, 0, st.prompt.kind === 'choice' ? { t: 'answer', choice: st.prompt.options[0].id } : { t: 'answer', ids: st.prompt.ids.slice(0, st.prompt.min) }));
    settle(st);
    const f = st.fight;
    if (f.stage !== 'witcher') { f.stage = 'witcher'; f.turn = 'witcher'; }
    // The chain a bot used to play here: 4 linked cards of 4 colours.
    const hand = ['W-B-13', 'W-A-15', 'W-A-41', 'W-START-10'];
    for (const id of hand) for (const pile of [p.deck, p.discard]) { const i = pile.indexOf(id); if (i >= 0) pile.splice(i, 1); }
    p.deck.push(...p.hand); p.hand = hand.slice();
    assert.ok(new Set(hand.map(id => CARDS[id].color)).size > 3);
    const cmd = botCommand(viewFor(st, 0), { options: options(st, 0) });
    assert.equal(cmd.t, 'combo');
    assert.ok(new Set(cmd.ids.map(id => CARDS[id].color)).size <= 3);
    ok(apply(st, 0, cmd));
});
