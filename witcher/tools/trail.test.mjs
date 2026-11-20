// «По следу монстра» beyond the bombs (Книги правил/По следу монстра.md pp. 3–5): lobby parts,
// Школа Мантикоры, тролль, мутагены, уникальные и мастерские действия.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, apply, options, actingSeat } from '../shared/engine/core.mjs';
import { push, run } from '../shared/engine/flow.mjs';
import { viewFor } from '../shared/view.mjs';
import { botCommand } from '../shared/bots.mjs';
import { CARDS, ADJ } from '../shared/engine/util.mjs';
import { linkIndex, comboTotals, comboError, specError } from '../shared/engine/fight.mjs';
import { buyCost, movePaymentError } from '../shared/engine/turn.mjs';
import { normalizeExp, trailOn } from '../shared/data/rules-data.mjs';
import { MASTERS, UNIQUES, MUTAGENS } from '../shared/data/trail-data.mjs';
import { COMMON } from '../shared/data/gen-data.mjs';
import { playGame } from './sim.mjs';
import { TRAIL_ALL, trailScenario } from './scenarios.mjs';

const ok = (r) => assert.ok(r.ok, r.err);
function game({ exp = TRAIL_ALL, school = 'manticore', seed = 4 } = {}) {
    const st = createGame({ seed, exp, players: [{ name: 'P0', school }, { name: 'P1', school: 'cat' }] });
    while (st.prompt) apply(st, st.prompt.seat, { t: 'answer', choice: st.prompt.options[0].id });
    return st;
}
const step = (st, ...s) => { push(st, ...s); run(st); };
/** A fight of seat 0 at its witcher stage (bots answer the rest); `hand` replaces the hand then. */
function fight(st, { setup, hand } = {}) {
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
    if (hand) { p.deck.push(...p.hand); p.hand = hand.slice(); for (const id of hand) { const i = p.deck.indexOf(id); if (i >= 0) p.deck.splice(i, 1); } }
    return st.fight;
}

test('лобби: части «По следу монстра» включаются по отдельности; голое «trail» старых сохранений — только бомбы', () => {
    assert.deepEqual(normalizeExp(['trail']), ['trail', 'trail:bombs']);
    assert.deepEqual(normalizeExp(['trail:masters']), [], 'без самого дополнения части не включаются');
    assert.ok(trailOn(['trail', 'trail:masters'], 'masters'));
    assert.ok(!trailOn(['trail', 'trail:masters'], 'bombs'));
    assert.ok(trailOn(['trail'], 'bombs'));
});

test('подготовка: мастерские карты в колоде действий, тролль среди монстров III уровня, уникальная карта — 11-я в колоде, колода мутагенов', () => {
    const st = game();
    const all = [...st.actionDeck, ...st.row];
    assert.equal(all.length, COMMON.length + 40);
    assert.equal(MASTERS.length, 40);
    assert.ok(st.monsterStacks[3].includes('MON-30') || st.slots.some(s => s.mon === 'MON-30'));
    const p = st.players[0];
    assert.equal(p.hand.length + p.deck.length, 11);
    assert.ok([...p.hand, ...p.deck].includes('WITCHER-UNIQUE-06'));
    assert.equal(st.mutagenDeck.length, 15);
    const base = game({ exp: [], school: 'wolf' });
    assert.equal([...base.actionDeck, ...base.row].length, COMMON.length);
    assert.equal(base.players[0].hand.length + base.players[0].deck.length, 10);
    assert.equal(base.mutagenDeck.length, 0);
    assert.equal(UNIQUES.length, 7);
    assert.equal(MUTAGENS.length, 15);
});

test('Школа Мантикоры: «Быстрый метаболизм» I — сбросить 2 эликсира: 1 урон; III — 1 эликсир: 1 урон и 2 карты', () => {
    const st = game();
    const f = fight(st, { setup: (p) => { p.elixirs = ['POTION-01#1']; p.skills.spec = 1; } });
    const p = st.players[0];
    assert.match(specError(st, p), /Нужно 2/);
    p.elixirs.push('POTION-02#1');
    assert.equal(specError(st, p), null);
    const life = f.life.length, hand = p.hand.length;
    ok(apply(st, 0, { t: 'spec' }));
    assert.equal(p.elixirs.length, 0);
    assert.equal(f.life.length, life - 1);
    assert.equal(p.hand.length, hand);
    assert.match(specError(st, p), /уже использована/);

    const st2 = game({ seed: 6 });
    const f2 = fight(st2, { setup: (p2) => { p2.elixirs = ['POTION-01#1', 'POTION-03#1']; p2.skills.spec = 3; } });
    const p2 = st2.players[0];
    const life2 = f2.life.length, hand2 = p2.hand.length, deck2 = p2.deck.length;
    ok(apply(st2, 0, { t: 'spec' }));
    assert.equal(st2.prompt.op, 'manticoreDo', 'на III уровне — выбор эликсира');
    ok(apply(st2, 0, { t: 'answer', ids: ['POTION-03#1'] }));
    assert.deepEqual(p2.elixirs, ['POTION-01#1']);
    assert.equal(f2.life.length, life2 - 1);
    assert.equal(p2.hand.length, hand2 + Math.min(2, deck2));
});

test('мастерские действия: Боевой транс — любой цвет, серые карты не продолжают комбинацию, Пируэт и Обман', () => {
    const trance = CARDS['MASTER-29'], ambush = CARDS['MASTER-33'];
    const aard = CARDS['W-START-57']; // purple Aard without links
    const withLinks = CARDS['W-START-51']; // blue, green link
    assert.ok(linkIndex(withLinks, trance) >= 0, 'транс присоединяется к любой связи');
    assert.ok(linkIndex(trance, aard) >= 0, 'после транса — любой цвет');
    assert.equal(linkIndex(trance, ambush), -1, 'серую карту не присоединить');
    const st = game();
    fight(st, { hand: ['MASTER-02', 'MASTER-17', 'W-START-59', 'MASTER-33', 'MASTER-05'] });
    const p = st.players[0];
    assert.match(comboError(st, p, ['W-START-59', 'MASTER-33']), /не соединяется/);
    // Пируэт (blue, needs yellow before): Ирден (yellow, link green) cannot join, so test via totals directly.
    const t1 = comboTotals(st, p, ['MASTER-02']);
    assert.equal(t1.dmg, 3);
    const t2 = comboTotals(st, p, ['W-START-59', 'MASTER-02'], {});
    assert.equal(t2.dmg, 3 + 1, 'Пируэт после жёлтой карты: +1 урон');
    // Обман (yellow, double green link): 1 damage, +3 with two green cards after it.
    const t3 = comboTotals(st, p, ['MASTER-17', 'W-START-55', 'W-START-56']);
    assert.equal(t3.dmg, 1 + 3);
    const t4 = comboTotals(st, p, ['MASTER-17', 'W-START-55']);
    assert.equal(t4.dmg, 1);
    // Решающий удар: 4 damage, 0 cards at the end of the turn.
    const t5 = comboTotals(st, p, ['MASTER-05']);
    assert.equal(t5.dmg, 4); assert.equal(t5.fixedDraw, 0);
    const life = st.fight.life.length, hand = p.hand.length;
    ok(apply(st, 0, { t: 'combo', ids: ['MASTER-05'] }));
    for (let i = 0; i < 20 && st.prompt; i++) ok(apply(st, st.prompt.seat, botCommand(viewFor(st, st.prompt.seat), {})));
    assert.equal(life - (st.fight ? st.fight.life.length : 0) >= 4 || !st.fight, true);
    if (st.fight && st.fight.stage === 'witcher') assert.ok(p.hand.length <= hand, 'в конце хода — 0 карт');
});

test('мастерские действия: Засада бросает кубик (2–4 урона), Река гнева: 3 урона при щите 0 и пустой колоде, щит до максимума', () => {
    const st = game();
    const f = fight(st, { hand: ['MASTER-33', 'MASTER-37'] });
    const p = st.players[0];
    const life = f.life.length;
    ok(apply(st, 0, { t: 'combo', ids: ['MASTER-33'] }));
    const lost = life - (st.fight ? st.fight.life.length : 0);
    assert.ok(lost >= 2 && lost <= 4, 'урон засады ' + lost);
    p.shield = 0; p.deck = [];
    const t = comboTotals(st, p, ['MASTER-37']);
    assert.equal(t.dmg, 3); assert.equal(t.shieldMax, true);
    p.shield = 1;
    assert.equal(comboTotals(st, p, ['MASTER-37']).dmg, 1);
});

test('покупка за «убрать карту из руки»: ячейка ряда не меняет цену, карта уходит из игры', () => {
    const st = game();
    const p = st.players[0];
    st.row[0] = 'MASTER-06';
    assert.equal(buyCost(st, p, 0), -1);
    st.turn.phase = 3;
    p.hand = ['W-START-51', 'W-START-52'];
    step(st, { op: 'p3buyAsk' });
    const o = st.prompt.options.find(x => x.id === '0');
    assert.ok(o.burn && !o.disabled);
    ok(apply(st, 0, { t: 'answer', choice: '0' }));
    assert.equal(st.prompt.args.burn, true);
    ok(apply(st, 0, { t: 'answer', ids: ['W-START-51'] }));
    assert.ok(p.removed.includes('W-START-51'));
    assert.ok(p.hand.includes('MASTER-06'));
    assert.ok(!p.discard.includes('W-START-51'));
});

test('эффекты сброса: Уворот — щит +2, Контратака — 2 урона монстру, когда атака сбрасывает их из колоды', () => {
    const st = game();
    const f = fight(st, { hand: ['W-START-51'] });
    const p = st.players[0];
    p.skills.defense = 4; p.shield = 0;
    p.deck.unshift('MASTER-09', 'MASTER-21');
    const life = f.life.length;
    f.turn = 'monster'; f.cur = null;
    step(st, { op: 'hurtWitcher', fight: 1, n: 2 });
    assert.equal(p.shield, 2, 'Уворот: щит +2');
    assert.equal(f.life.length, life - 2, 'Контратака: 2 урона');
});

test('уникальные действия: Танец мечей (+1 урон при 3 картах), Цикл дыхания возвращает использованный эликсир', () => {
    const st = game({ school: 'ciri' });
    fight(st, { hand: ['WITCHER-UNIQUE-07', 'W-START-62'] });
    const p = st.players[0];
    const one = comboTotals(st, p, ['WITCHER-UNIQUE-07']);
    assert.equal(one.dmg, 0);
    const st2 = game();
    const f2 = fight(st2, { setup: (q) => { q.elixirs = ['POTION-01#1']; q.skills.alchemy = 1; }, hand: ['WITCHER-UNIQUE-06', 'W-START-55'] });
    const p2 = st2.players[0];
    ok(apply(st2, 0, { t: 'elixir', id: 'POTION-01#1' }));
    for (let i = 0; i < 10 && st2.prompt; i++) ok(apply(st2, 0, botCommand(viewFor(st2, 0), {})));
    assert.equal(f2.elixirsUsed, 1);
    ok(apply(st2, 0, { t: 'combo', ids: ['WITCHER-UNIQUE-06', 'W-START-55'] }));
    for (let i = 0; i < 10 && st2.prompt && st2.prompt.seat === 0; i++) ok(apply(st2, 0, botCommand(viewFor(st2, 0), {})));
    assert.ok(p2.elixirs.includes('POTION-01#1'), 'эликсир снова можно использовать');
    assert.equal(f2.usedElixirs.length, 0);
});

test('мутагены: за уровень — выбор 1 из 3, остальные назад; раз за битву; MUT-08 — урон или +2 карты', () => {
    const st = game();
    const p = st.players[0];
    p.skills = { combat: 2, defense: 2, alchemy: 2, spec: 2 };
    step(st, { op: 'levelCheck', seat: 0 });
    assert.equal(p.level, 2);
    assert.equal(st.prompt.ids.length, 3);
    const pick = st.prompt.ids[1];
    ok(apply(st, 0, { t: 'answer', ids: [pick] }));
    assert.deepEqual(p.mutagens, [pick]);
    assert.equal(st.mutagenDeck.length, 14);

    const st2 = game({ seed: 9 });
    const f = fight(st2, { setup: (q) => { q.mutagens = ['MUT-05', 'MUT-08']; q.skills.defense = 2; q.shield = 1; }, hand: ['W-START-51', 'W-START-55', 'W-START-56'] });
    const q = st2.players[0];
    const t = comboTotals(st2, q, ['W-START-51', 'W-START-55']);
    assert.equal(t.muts.find(m => m.id === 'MUT-05').on, true, 'ровно 2 карты');
    assert.equal(t.shield, 1 + 1);
    assert.equal(t.muts.find(m => m.id === 'MUT-08').on, true, 'щит дорос до максимума');
    const t8 = comboTotals(st2, q, ['W-START-51', 'W-START-55'], { mut8: 'draw' });
    assert.equal(t8.draw - t.draw, 2);
    const off = comboTotals(st2, q, ['W-START-51', 'W-START-55'], { mutOff: ['MUT-05'] });
    assert.equal(off.muts.find(m => m.id === 'MUT-05').on, false);
    ok(apply(st2, 0, { t: 'combo', ids: ['W-START-51', 'W-START-55'] }));
    assert.ok(f.once['mMUT-05'] && f.once['mMUT-08']);
    assert.equal(comboTotals(st2, q, ['W-START-51', 'W-START-55']).muts.find(m => m.id === 'MUT-05').used, true);
});

test('Выносливость: два перемещения за одну карту, действие первой локации пропускается', () => {
    const st = game();
    const p = st.players[0];
    p.hand = ['MASTER-25', 'W-START-51'];
    st.turn.moved = false;
    const o = options(st, 0);
    const far = o.moves.find(m => m.via != null);
    assert.ok(far, 'есть цели через одну локацию');
    assert.ok(!ADJ[p.loc].includes(far.to));
    assert.match(movePaymentError(st, p, far.to, ['W-START-51'], 0, far.via), /Выносливость/);
    ok(apply(st, 0, { t: 'move', to: far.to, via: far.via, cards: ['MASTER-25'], gold: 0 }));
    assert.equal(p.loc, far.to);
    assert.ok(p.discard.includes('MASTER-25'));
});

test('песочница «По следу монстра» собирается; партии ботов со всеми мини-дополнениями доходят до конца', () => {
    const st = trailScenario();
    assert.equal(st.players[0].school, 'manticore');
    assert.equal(st.players[0].mutagens.length, 3);
    for (const seed of [1, 2, 3, 4, 5, 6]) {
        const { state } = playGame({ players: 2 + (seed % 3), seed, exp: TRAIL_ALL, schools: ['manticore', 'ciri', 'wolf', 'bear'] });
        assert.ok(state.stage === 'over' || state.round > 80, 'игра ' + seed);
    }
});
