// Bombs («По следу монстра», p. 4; Доп колоды/Бомбы.md): elixir-or-bomb when taking an elixir,
// the limit of 4, the shared alchemy limit in a fight, each bomb's effect, «Чёртов гриб» before
// the life pools, and the house rule «Выбор бомбы и восстановление».
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, apply, options, actingSeat } from '../shared/engine/core.mjs';
import { push, run } from '../shared/engine/flow.mjs';
import { viewFor } from '../shared/view.mjs';
import { botCommand } from '../shared/bots.mjs';
import { CARDS, MONSTER } from '../shared/engine/util.mjs';
import { BOMBS_IN_PLAY } from '../shared/data/bombs-data.mjs';
import { playGame } from './sim.mjs';

const ok = (r) => assert.ok(r.ok, r.err);
function game({ exp = ['trail'], rules = {}, seed = 4 } = {}) {
    const st = createGame({ seed, exp, rules, players: [{ name: 'P0', school: 'bear' }, { name: 'P1', school: 'cat' }] });
    while (st.prompt) apply(st, st.prompt.seat, { t: 'answer', choice: st.prompt.options[0].id });
    return st;
}
const step = (st, ...s) => { push(st, ...s); run(st); };
const give = (st, p, id) => { const inst = st.bombDeck.find(x => x.startsWith(id + '#')); st.bombDeck.splice(st.bombDeck.indexOf(inst), 1); p.bombs.push(inst); return inst; };

test('колода бомб: 6 видов × 4 копии (двимеритовая ждёт «Уязвимостей»), только с «По следу монстра»', () => {
    assert.equal(game().bombDeck.length, 24);
    assert.equal(BOMBS_IN_PLAY.length, 6);
    assert.equal(game({ exp: [] }).bombDeck.length, 0);
});

test('взятие эликсира: можно получить бомбу за 1 эликсир и 1 золото; без эликсира или золота — нет вопроса', () => {
    const st = game();
    const p = st.players[0];
    p.elixirs = []; p.gold = 3;
    step(st, { op: 'gainElixir', seat: 0, n: 1 });
    assert.equal(st.prompt, null, 'без эликсира бомбу не получить');
    assert.equal(p.elixirs.length, 1);
    step(st, { op: 'gainElixir', seat: 0, n: 1 });
    assert.equal(st.prompt.ui, 'bombOffer');
    ok(apply(st, 0, { t: 'answer', choice: 'bomb' }));
    if (st.prompt && st.prompt.op === 'bombPay') ok(apply(st, 0, { t: 'answer', ids: [p.elixirs[0]] }));
    assert.equal(p.bombs.length, 1);
    assert.equal(p.elixirs.length, 0, 'эликсир сброшен, нового не взято');
    assert.equal(p.gold, 2);
    // Without the expansion: no question at all.
    const off = game({ exp: [] });
    off.players[0].elixirs = ['POTION-01#9']; off.players[0].gold = 3;
    step(off, { op: 'gainElixir', seat: 0, n: 1 });
    assert.equal(off.prompt, null);
    assert.equal(off.players[0].elixirs.length, 2);
});

test('не больше 4 бомб; правило стола — вид бомбы выбирается', () => {
    const st = game({ rules: { bombs: true } });
    const p = st.players[0];
    p.gold = 9; p.elixirs = ['POTION-01#9', 'POTION-02#9'];
    step(st, { op: 'gainElixir', seat: 0, n: 1 });
    ok(apply(st, 0, { t: 'answer', choice: 'bomb' }));
    ok(apply(st, 0, { t: 'answer', ids: ['POTION-02#9'] }));
    assert.equal(st.prompt.ui, 'bombType');
    ok(apply(st, 0, { t: 'answer', choice: 'BOMB-04' }));
    assert.ok(p.bombs[0].startsWith('BOMB-04#'));
    for (const id of ['BOMB-01', 'BOMB-02', 'BOMB-03']) give(st, p, id);
    step(st, { op: 'gainElixir', seat: 0, n: 1 });
    assert.equal(st.prompt, null, 'с 4 бомбами — только эликсир');
});

/** A fight of seat 0 at its witcher stage (bots answer the rest). */
function fight(st, setup) {
    const p = st.players[0];
    const slot = st.slots.find(s => s.mon);
    p.loc = slot.token; st.turn.moved = true;
    p.trackTokens[slot.terrain] = st.locPiles[slot.terrain].pop();
    if (setup) setup(p);
    ok(apply(st, 0, { t: 'fight' }));
    for (let i = 0; i < 50 && !(st.fight && st.fight.stage === 'witcher' && !st.prompt); i++) {
        const seat = actingSeat(st);
        ok(apply(st, seat, botCommand(viewFor(st, seat), { options: options(st, seat) })));
    }
    return st.fight;
}

test('битва: бомбы и эликсиры делят лимит алхимии; эффекты Сна дракона и Танцующей звезды', () => {
    const st = game();
    const p = st.players[0];
    let b2, b3, b1;
    const f = fight(st, (p) => { p.skills.alchemy = 2; b2 = give(st, p, 'BOMB-02'); b3 = give(st, p, 'BOMB-03'); b1 = give(st, p, 'BOMB-01'); p.elixirs = ['POTION-06#9']; });
    assert.ok(f);
    const life0 = f.life.length;
    ok(apply(st, 0, { t: 'bomb', id: b2 }));
    assert.equal(st.fight.life.length, life0 - 1, 'Сон дракона: 1 урон');
    assert.equal(st.fight.cur.dragon, true);
    // The purple bonus: +1 damage to a combo with a purple card.
    const purple = Object.keys(CARDS).find(id => CARDS[id].color === 'purple' && !CARDS[id].links.length);
    if (purple) {
        p.hand.push(purple);
        const { comboTotals } = awaitImport;
        assert.equal(comboTotals(st, p, [purple]).dmg, (CARDS[purple].fx.dmg || 0) + 1);
        p.hand.pop();
    }
    const hand0 = p.hand.length, life1 = st.fight.life.length;
    const nest = /Гнездо/.test(MONSTER[st.fight.mon].name) ? 2 : 1;
    ok(apply(st, 0, { t: 'bomb', id: b3 }));
    assert.equal(st.fight.life.length, life1 - nest);
    assert.equal(p.hand.length, hand0 + Math.min(nest, hand0 + p.deck.length));
    // Limit 2 reached: neither a third bomb nor the elixir.
    p.discard.push(p.hand[0]);
    assert.match(apply(st, 0, { t: 'bomb', id: b1 }).err, /Лимит алхимии: 2 эликсира\(ов\) и бомб/);
    assert.match(apply(st, 0, { t: 'elixir', id: 'POTION-06#9' }).err, /Лимит алхимии/);
});
const awaitImport = await import('../shared/engine/fight.mjs');

test('Самум — 1 из 2 верхних карт сброса; Северный ветер — карта монстра в сброс и порядок остальных', () => {
    const st = game();
    const p = st.players[0];
    let b1, b4;
    fight(st, (p) => { p.skills.alchemy = 3; b1 = give(st, p, 'BOMB-01'); b4 = give(st, p, 'BOMB-04'); });
    const [x, y] = Object.keys(CARDS).filter(id => !p.hand.includes(id)).slice(0, 2);
    p.discard.push(x, y);
    ok(apply(st, 0, { t: 'bomb', id: b1 }));
    assert.equal(st.prompt.op, 'samumDo');
    assert.deepEqual(st.prompt.ids.slice().sort(), [x, y].sort());
    ok(apply(st, 0, { t: 'answer', ids: [x] }));
    assert.ok(p.hand.includes(x) && !p.discard.includes(x));
    const top = st.fight.life.slice(0, 3);
    ok(apply(st, 0, { t: 'bomb', id: b4 }));
    assert.deepEqual(st.prompt.ids, top);
    ok(apply(st, 0, { t: 'answer', ids: [top[0]] }));
    assert.ok(st.fight.monDiscard.includes(top[0]));
    assert.equal(st.prompt.op, 'northWindOrder');
    ok(apply(st, 0, { t: 'answer', ids: [top[2]] }));
    assert.deepEqual(st.fight.life.slice(0, 2), [top[2], top[1]], 'выбранная карта сверху');
});

test('Чёртов гриб: до запасов жизней — +2 карты, способность монстра не действует (Баргест не снимает щит)', () => {
    const st = game();
    const p = st.players[0];
    const slot = st.slots.find(s => s.mon);
    slot.mon = 'MON-07';   // Баргест: before the life pools, the witcher loses 1 shield
    p.loc = slot.token; st.turn.moved = true;
    p.shield = 1;
    const inst = give(st, p, 'BOMB-06');
    ok(apply(st, 0, { t: 'fight' }));
    while (st.prompt && st.prompt.op !== 'mushroomDo') ok(apply(st, st.prompt.seat, botCommand(viewFor(st, st.prompt.seat), { options: options(st, st.prompt.seat) })));
    assert.equal(st.prompt.op, 'mushroomDo');
    const cards = p.hand.length + p.deck.length;
    const hand0 = p.hand.length;
    ok(apply(st, 0, { t: 'answer', choice: 'use' }));
    assert.equal(st.fight.noAbility, true);
    assert.equal(p.hand.length, hand0 + 2);
    assert.equal(p.hand.length + p.deck.length, cards);
    assert.equal(p.shield, 1, 'Баргест не сработал');
    assert.ok(!p.bombs.includes(inst));
    assert.equal(st.fight.elixirsUsed, 1);
});

test('Лунная пыль: в следующий ход монстра тип атаки можно сменить после открытия карты', () => {
    const st = game();
    const p = st.players[0];
    let b5;
    fight(st, (p) => { b5 = give(st, p, 'BOMB-05'); });
    ok(apply(st, 0, { t: 'bomb', id: b5 }));
    assert.equal(st.fight.moonDust, true);
    ok(apply(st, 0, { t: 'combo', ids: [p.hand[0]] }));
    for (let i = 0; i < 20 && !(st.prompt && st.prompt.title === 'Лунная пыль'); i++) {
        const seat = actingSeat(st);
        if (seat === 0 && st.fight && st.fight.stage === 'witcher') break;
        ok(apply(st, seat, botCommand(viewFor(st, seat), { options: options(st, seat) })));
    }
    if (!st.fight) return;  // the combo already won
    assert.equal(st.prompt.title, 'Лунная пыль');
    const before = st.fight.lastAttack.type;
    ok(apply(st, 0, { t: 'answer', choice: 'switch' }));
    assert.notEqual(st.fight ? st.fight.lastAttack.type : null, before);
});

test('правило стола: после битвы использованную бомбу можно восстановить за 2 золота', () => {
    const st = game({ rules: { bombs: true } });
    const p = st.players[0];
    let b2;
    fight(st, (p) => { b2 = give(st, p, 'BOMB-02'); p.gold = 4; });
    ok(apply(st, 0, { t: 'bomb', id: b2 }));
    for (let i = 0; i < 400 && !(st.prompt && st.prompt.ui === 'bombReturn'); i++) {
        const seat = actingSeat(st);
        ok(apply(st, seat, botCommand(viewFor(st, seat), { options: options(st, seat) })));
        if (!st.fight && !(st.prompt && st.prompt.ui === 'bombReturn') && st.turn.seat !== 0) break;
    }
    assert.equal(st.prompt && st.prompt.ui, 'bombReturn');
    const gold = p.gold;
    ok(apply(st, 0, { t: 'answer', ids: [b2] }));
    assert.ok(p.bombs.includes(b2));
    assert.equal(p.gold, gold - 2);
});

test('партии ботов с «По следу монстра» (и с правилами MMR): только легальные команды, бомбы в ходу', () => {
    let got = 0, used = 0;
    for (const n of [1, 2, 3, 4]) for (const seed of [1, 2, 3]) {
        const { state } = playGame({ players: n, seed, exp: ['trail'] });
        assert.ok(state.stage === 'over' || state.round > 80);
        got += state.log.filter(l => /получает бомбу/.test(l.t)).length;
        used += state.log.filter(l => /бросает бомбу/.test(l.t)).length;
    }
    assert.ok(got > 0 && used > 0, `бомбы получены (${got}) и брошены (${used})`);
});
