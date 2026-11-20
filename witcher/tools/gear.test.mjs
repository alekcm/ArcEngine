// Equipment, companions and «keep in front» event cards (База.md p. 17: taken at once, kept to
// the end of the game; p. 22: used at step 1 of a fight turn unless the card says when).
// Every test drives the real engine through apply().
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, apply, options } from '../shared/engine/core.mjs';
import { ensureExplore } from '../shared/engine/explore.mjs';
import { comboTotals } from '../shared/engine/fight.mjs';
import { run } from '../shared/engine/flow.mjs';
import { ADJ, LOC, CARDS } from '../shared/engine/util.mjs';
import { EVENTS, EXPLORE_DECKS, EXP_DECKS } from '../shared/data/events-data.mjs';
import { ELIXIR_LIMIT } from '../shared/data/rules-data.mjs';

const ok = (r) => assert.ok(r.ok, r.err);
function solo(seed = 5) {
    const st = createGame({ seed, players: [{ name: 'P0', school: 'wolf' }] });
    while (st.prompt) apply(st, st.prompt.seat, { t: 'answer', choice: st.prompt.options[0].id });
    return st;
}
const first = (pr) => pr.kind === 'choice' ? { t: 'answer', choice: pr.options.find(o => !o.disabled).id } : { t: 'answer', ids: pr.ids.slice(0, pr.min) };
/** A fight with a plain monster (Леший, MON-15: no abilities in the fight) and the given gear. */
function fight(gear, { track = false, seed = 5, attack = null } = {}) {
    const st = solo(seed);
    const p = st.players[0];
    p.gear = gear.slice();
    const slot = st.slots.find(s => s.mon);
    slot.mon = 'MON-15';
    p.loc = slot.token; st.turn.moved = true;
    p.trackTokens = { forest: null, mountain: null, water: null };
    if (track) p.trackTokens[slot.terrain] = 99;
    if (attack) {
        // Every life card is this attack (both sides), so the first monster attack is known.
        st.attackDeck = Array.from({ length: 20 }, () => attack);
    }
    ok(apply(st, 0, { t: 'fight' }));
    return { st, p };
}
const take = (st, id) => { st.queue.unshift({ op: 'takeEvent', seat: 0, id }); run(st); };

// Cards that cannot be reached yet (their chain leads to an unsupported card) — none now.
const NOT_YET = new Set();
test('данные: все 14 карт снаряжения и спутников «Ивенты 1» реализованы и достижимы из колод', () => {
    const gear = Object.entries(EVENTS).filter(([, c]) => c.gear && !c.exp).map(([id]) => id).sort();
    assert.equal(gear.length, 14);
    const reach = reachable(Object.values(EXPLORE_DECKS).flat());
    for (const g of gear) assert.equal(reach.has(g), !NOT_YET.has(g), `${g} (${EVENTS[g].name}) достижим`);
});
test('данные: спутники «Цири и доп. события» (Гроббо, Гертруда) достижимы из колод дополнения', () => {
    const gear = Object.entries(EVENTS).filter(([, c]) => c.gear && c.exp === 'ciri').map(([id]) => id).sort();
    assert.deepEqual(gear, ['CONT80-37', 'CONT80-39']);
    const reach = reachable(Object.values(EXP_DECKS.ciri).flat());
    for (const g of gear) assert.ok(reach.has(g), `${g} достижим`);
});
function reachable(start) {
    const reach = new Set();
    const walk = (fx) => { for (const e of fx || []) { if (e.event) reach.add(e.event); if (e.secret) reach.add(e.secret); if (e.trap) reach.add(e.trap.event); if (e.quest) reach.add(e.quest.event); if (e.keep && e.keep.event) reach.add(e.keep.event); if (e.roll) e.roll.forEach(b => walk(b.fx)); if (e.poker) { walk(e.poker.win); walk(e.poker.lose); } if (e.if) { walk(e.fx); walk(e.else); } } };
    for (let i = 0; i < 5; i++) for (const id of [...start, ...reach]) { const c = EVENTS[id]; if (!c) continue; walk(c.fx); if (c.a) { walk(c.a.fx); walk(c.b.fx); } }
    return reach;
}

test('Кая: в битве с монстром ведьмак ходит первым и без жетона следа', () => {
    const { st } = fight(['CONT79-23']);
    while (st.prompt) ok(apply(st, 0, first(st.prompt)));
    assert.equal(st.fight.turn, 'witcher');
    assert.equal(st.fight.mTurns, 0);
    const { st: st2 } = fight([]);
    while (st2.prompt) ok(apply(st2, 0, first(st2.prompt)));
    assert.ok(!st2.fight || st2.fight.mTurns >= 1, 'без Каи и жетона первым ходит монстр');
});

test('Арбалет (14): один раз за битву в первый ход — 2 урона; Арбалет (01) — за сброс карты', () => {
    const { st, p } = fight(['CONT79-14', 'CONT79-01'], { track: true });
    while (st.prompt) ok(apply(st, 0, first(st.prompt)));
    const life = st.fight.life.length;
    ok(apply(st, 0, { t: 'active', key: 'CONT79-14' }));
    assert.equal(st.fight.life.length, life - 2);
    assert.match(options(st, 0).fight.active.find(a => a.key === 'CONT79-14').err, /Уже использовано/);
    const id = p.hand[0];
    ok(apply(st, 0, { t: 'active', key: 'CONT79-01' }));
    assert.equal(st.prompt.title, 'Арбалет');
    ok(apply(st, 0, { t: 'answer', ids: [id] }));
    assert.ok(p.discard.includes(id));
    assert.equal(st.fight.life.length, life - 4);
});

test('Арбалет: во второй ход битвы недоступен (причина на кнопке)', () => {
    const { st } = fight(['CONT79-14'], { track: true });
    while (st.prompt) ok(apply(st, 0, first(st.prompt)));
    st.fight.wTurns = 2;
    assert.match(options(st, 0).fight.active.find(a => a.key === 'CONT79-14').err, /первый ход/);
});

test('Доспех, Наручи, Эдгар, меч Журавля: бонусы видны в подсчёте комбинации', () => {
    const { st, p } = fight(['CONT79-13', 'CONT79-28', 'CONT79-50'], { track: true });
    while (st.prompt) ok(apply(st, 0, first(st.prompt)));
    const green = Object.values(CARDS).find(c => c.color === 'green' && !c.links.length);
    const blue = Object.values(CARDS).find(c => c.color === 'blue' && !c.links.length) || Object.values(CARDS).find(c => c.color === 'blue');
    const base = comboTotals({ fight: null }, { ...p, gear: [] }, [green.id]);
    const t = comboTotals(st, p, [green.id]);
    assert.equal(t.shield, base.shield + 1 + 1, 'доспех +1 за зелёную, наручи +1');
    assert.equal(t.dmg, base.dmg + 3, 'Эдгар: первая комбинация +3 урона');
    p.keeps = [{ id: 'CONT79-26B', kind: 'blueDmg', name: 'Меч' }];
    const tb = comboTotals(st, p, [blue.id]);
    const bb = comboTotals(st, { ...p, keeps: [] }, [blue.id]);
    assert.equal(tb.dmg, bb.dmg + 1, 'синяя карта +1 урон');
    // Once per fight: after the first combo the bracers and Эдгар are spent.
    st.fight.once.g28 = true; st.fight.once.g50 = true;
    const t2 = comboTotals(st, p, [green.id]);
    assert.equal(t2.shield, base.shield + 1);
    assert.equal(t2.dmg, base.dmg);
});

test('Ярдель: урон первой атаки монстра снижен на 2', () => {
    const { st, p } = fight(['CONT79-05'], { attack: 'MON-ATK-02' });
    assert.ok(st.log.some(l => /Ярдель: урон первой атаки снижен на 2/.test(l.t)), 'эффект в журнале');
    assert.ok(st.fight === null || st.fight.once.g05);
    void p;
});

test('Оскар: перед первым ходом монстра — 2 верхние карты, одна в сброс, другая атакует', () => {
    const { st } = fight(['CONT79-18']);
    while (st.prompt && st.prompt.title !== 'Оскар') ok(apply(st, 0, first(st.prompt)));
    assert.equal(st.prompt.title, 'Оскар');
    assert.equal(st.prompt.ids.length, 2);
    const [a, b] = st.prompt.ids;
    const life = st.fight.life.length;
    ok(apply(st, 0, { t: 'answer', ids: [a] }));
    assert.ok(st.fight.monDiscard.includes(a));
    assert.equal(st.fight.lastAttack.id, b, 'оставшаяся карта — атака монстра');
    assert.equal(st.fight.life.length, life - 2);
});

test('Кожаные сапоги: в конце первого хода битвы — на 2 карты больше', () => {
    const { st, p } = fight(['CONT79-31'], { track: true });
    while (st.prompt) ok(apply(st, 0, first(st.prompt)));
    ok(apply(st, 0, { t: 'combo', ids: [p.hand[0]] }));
    assert.ok(st.log.some(l => /кожаные сапоги — \+2 карты/.test(l.t)));
});

test('Лекарство: карта из сброса замешивается в колоду', () => {
    const { st, p } = fight(['CONT79-56'], { track: true });
    while (st.prompt) ok(apply(st, 0, first(st.prompt)));
    p.discard.push(p.hand.pop());
    const id = p.discard[p.discard.length - 1];
    const deck = p.deck.length;
    ok(apply(st, 0, { t: 'active', key: 'CONT79-56' }));
    ok(apply(st, 0, { t: 'answer', ids: [id] }));
    assert.ok(!p.discard.includes(id));
    assert.equal(p.deck.length, deck + 1);
});

test('Адья: бросок в первый ход — урон монстру и/или ведьмаку по таблице', () => {
    const { st } = fight(['CONT79-20'], { track: true });
    while (st.prompt) ok(apply(st, 0, first(st.prompt)));
    const life = st.fight.life.length;
    ok(apply(st, 0, { t: 'active', key: 'CONT79-20' }));
    while (st.prompt) ok(apply(st, 0, first(st.prompt)));
    const m = st.log.map(l => l.t).find(t => /Адья — бросок/.test(t)).match(/бросок (\d)/);
    const r = Number(m[1]);
    assert.equal(st.fight.life.length, r >= 2 ? life - 2 : life);
});

test('Эдгар де Спота: после победы — событие 51, затем Эдгар уходит, щит понижен', () => {
    const { st, p } = fight(['CONT79-50'], { track: true });
    while (st.prompt) ok(apply(st, 0, first(st.prompt)));
    st.fight.life.splice(1);           // one card left: the next hit wins
    ok(apply(st, 0, { t: 'combo', ids: [p.hand.find(id => CARDS[id].fx.dmg) || p.hand[0]] }));
    let guard = 0;
    while (st.prompt && st.prompt.card !== 'CONT79-51' && guard++ < 10) ok(apply(st, 0, first(st.prompt)));
    assert.equal(st.prompt.card, 'CONT79-51');
    const sh = p.shield;
    ok(apply(st, 0, { t: 'answer', choice: 'b' }));
    ok(apply(st, 0, { t: 'answer', choice: 'ok' }));
    assert.ok(!p.gear.includes('CONT79-50'));
    assert.equal(p.shield, Math.max(0, sh - 1));
});

test('Лошадь: раз в ход — в соседнюю лесную локацию без сброса карт; Мартин — +1 золото в Хенфорсе', () => {
    const st = solo();
    const p = st.players[0];
    const from = Object.keys(ADJ).map(Number).find(l => ADJ[l].some(n => LOC[n].terrain === 'forest'));
    p.loc = from;
    p.gear = ['CONT79-16'];
    const g = options(st, 0).gearMoves.find(x => x.key === 'CONT79-16');
    assert.ok(g && !g.err, g && g.err);
    const hand = p.hand.length;
    ok(apply(st, 0, { t: 'gearMove', key: 'CONT79-16' }));
    assert.equal(st.prompt.ui, 'move');
    const to = st.prompt.options.find(o => o.id !== 'cancel').id;
    assert.equal(LOC[Number(to)].terrain, 'forest');
    ok(apply(st, 0, { t: 'answer', choice: to }));
    assert.equal(p.loc, Number(to));
    assert.equal(p.hand.length, hand, 'карты не сбрасываются');
    assert.equal(apply(st, 0, { t: 'gearMove', key: 'CONT79-16' }).ok, false, 'один раз за ход');
    // Мартин
    const st2 = solo();
    const q = st2.players[0];
    q.gear = ['CONT79-11'];
    const nb = ADJ[2][0];
    q.loc = nb; q.hand.push('W-START-01', 'W-START-02');
    const gold = q.gold;
    ok(apply(st2, 0, { t: 'move', to: 2, cards: q.hand.slice(-2), gold: 0 }));
    assert.equal(q.gold, gold + 1);
});

test('карты «перед собой»: следующее исследование заменено (4 золота / событие), колода не тронута', () => {
    const st = solo();
    const p = st.players[0];
    const decks = ensureExplore(st);
    p.keeps = [{ id: 'CONT79-22B', card: 'CONT79-22', kind: 'nextExplore', gold: 4, name: 'Шкатулка' }];
    const city = decks.city.length;
    const gold = p.gold;
    ok(apply(st, 0, { t: 'explore', deck: 'city' }));
    while (st.prompt && !/Фаза III/.test(st.prompt.title || '')) ok(apply(st, 0, first(st.prompt)));
    assert.equal(decks.city.length, city);
    assert.equal(p.gold, gold + 4);
    assert.equal(p.keeps.length, 0);
    assert.equal(st.turn.phase, 3, 'затем фаза III, как после исследования');
});

test('карты «перед собой»: тренировка дешевле на 3 (не менее 1), лимит эликсиров 5', async () => {
    const { trainCost, elixirCap } = await import('../shared/engine/effects.mjs');
    const p = { skills: { combat: 3, defense: 1, alchemy: 1, spec: 1 }, keeps: [{ kind: 'train', n: 3 }] };
    assert.equal(trainCost(p, 'combat'), 1);
    assert.equal(trainCost({ ...p, keeps: [] }, 'combat'), 4);
    assert.equal(elixirCap({ keeps: [] }), ELIXIR_LIMIT);
    assert.equal(elixirCap({ keeps: [{ kind: 'elixirLimit', n: 5 }] }), 5);
});

test('событие «навык × 2 + кубик» (36): сумма выбирает строку таблицы', () => {
    const st = solo();
    take(st, 'CONT79-36');
    ok(apply(st, 0, { t: 'answer', choice: 'ok' }));
    assert.equal(st.prompt.stage, 'roll');
    const p = st.players[0];
    assert.equal(st.prompt.sum, p.skills.combat * 2 + st.prompt.dice);
    assert.match(st.prompt.title, /× 2/);
});

test('событие с комбинацией (12): взять 2 карты, разыграть цепочку, таблица по урону; 3–4 — бесплатная карта ряда', async () => {
    const { linkIndex } = await import('../shared/engine/fight.mjs');
    const st = solo();
    const p = st.players[0];
    p.shield = 3;
    const hand = p.hand.length;
    take(st, 'CONT79-12');
    ok(apply(st, 0, { t: 'answer', choice: 'ok' }));
    assert.equal(p.shield, 1, 'щит −2');
    assert.equal(st.prompt.ui, 'combo');
    assert.equal(p.hand.length, hand + 2, 'взяты 2 карты');
    assert.equal(st.turn.drawDelta, 0, 'добор фазы III не меняется');
    // An unlinked pair is refused with the reason.
    const bad = p.hand.flatMap(a => p.hand.filter(b => b !== a).map(b => [a, b])).find(([a, b]) => linkIndex(CARDS[a], CARDS[b]) < 0);
    if (bad) { const r = apply(st, 0, { t: 'answer', ids: bad }); assert.equal(r.ok, false); assert.match(r.err, /не соединяется/); }
    const id = p.hand[0];
    const dmg = CARDS[id].fx.dmg || 0;
    ok(apply(st, 0, { t: 'answer', ids: [id] }));
    assert.ok(p.discard.includes(id), 'карта комбинации в сбросе');
    assert.equal(st.prompt.stage, 'roll');
    assert.equal(st.prompt.rollKind, 'combo');
    assert.equal(st.prompt.dice, dmg);
    assert.match(st.prompt.title, /Урон комбинации/);
    // Branch 3–4 directly: the phase III card is free.
    const st2 = solo();
    st2.queue.unshift({ op: 'eventFx', seat: 0, e: { freeBuy: true } }); run(st2);
    assert.equal(st2.turn.freeBuy, true);
    const { buyOptions } = await import('../shared/engine/turn.mjs');
    assert.ok(buyOptions(st2, st2.players[0]).every(o => o.cost === 0));
});
