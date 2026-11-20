// «Цири и доп. события»: expansion exploration cards in the lobby, quest tokens that spring on
// other players, secret cards, new option costs, poker events and the two companions. Every
// test drives the real engine through apply() (or a queued step + run()).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, apply } from '../shared/engine/core.mjs';
import { ensureExplore, effectSteps } from '../shared/engine/explore.mjs';
import { buyOptions } from '../shared/engine/turn.mjs';
import { push, run } from '../shared/engine/flow.mjs';
import { viewFor } from '../shared/view.mjs';
import { ADJ, CARDS } from '../shared/engine/util.mjs';
import { EVENTS, EXPLORE_DECKS, EXP_DECKS } from '../shared/data/events-data.mjs';
import { SCHOOLS } from '../shared/data/rules-data.mjs';
import { playGame } from './sim.mjs';

const ok = (r) => assert.ok(r.ok, r.err);
function game(exp = ['ciri'], n = 2, seed = 7) {
    const schools = ['wolf', 'bear', 'cat', 'griffin', 'viper'];
    const st = createGame({ seed, exp, players: Array.from({ length: n }, (_, i) => ({ name: 'P' + i, school: schools[i] })) });
    while (st.prompt) apply(st, st.prompt.seat, { t: 'answer', choice: st.prompt.options[0].id });
    return st;
}
/** Put `id` on top of its deck and explore it as seat 0. */
function exploreCard(st, id) {
    const decks = ensureExplore(st);
    const deck = Object.keys(decks).find(d => decks[d].includes(id));
    assert.ok(deck, `${id} в колодах`);
    decks[deck] = [id, ...decks[deck].filter(x => x !== id)];
    ok(apply(st, 0, { t: 'explore', deck }));
}
const step = (st, ...s) => { push(st, ...s); run(st); };
const answer = (st, a) => ok(apply(st, st.prompt.seat, a));
/** Click through «Продолжить» prompts of `seat`. */
function okAll(st, seat) { while (st.prompt && st.prompt.seat === seat && st.prompt.options && st.prompt.options.some(o => o.id === 'ok')) answer(st, { t: 'answer', choice: 'ok' }); }

test('лобби: «Цири и доп. события» замешивает свои карты в колоды исследования, без него — нет', () => {
    const on = ensureExplore(game(['ciri']));
    const off = ensureExplore(game([]));
    for (const d of ['city', 'wild']) {
        assert.equal(off[d].length, EXPLORE_DECKS[d].length);
        assert.equal(on[d].length, EXPLORE_DECKS[d].length + EXP_DECKS.ciri[d].length);
        for (const id of EXP_DECKS.ciri[d]) assert.ok(on[d].includes(id));
    }
    assert.equal(EXP_DECKS.ciri.city.length + EXP_DECKS.ciri.wild.length, 78, 'все 36 + 42 карты дополнения поддержаны');
});

test('жетон задания «закончит там ход»: срабатывает у другого игрока, событие разыгрывает он, жетон сбрасывается', () => {
    const st = game();
    const [a, b] = st.players;
    exploreCard(st, 'CONT82-39');
    answer(st, { t: 'answer', choice: 'a' });
    answer(st, { t: 'answer', choice: 'ok' });
    assert.equal(st.traps.length, 1);
    const tr = st.traps[0];
    assert.equal(tr.loc, a.loc);
    assert.equal(tr.owner, 0);
    assert.equal(tr.event, 'CONT80-12');
    // The token is public, the event behind it is not.
    const vb = viewFor(st, 1);
    assert.equal(vb.traps[0].loc, a.loc);
    assert.equal(vb.traps[0].event, undefined);
    assert.equal(viewFor(st, 0).traps[0].event, 'CONT80-12');
    // Its owner never springs it.
    while (st.prompt) answer(st, st.prompt.options ? { t: 'answer', choice: st.prompt.options[0].id } : { t: 'answer', ids: st.prompt.ids.slice(0, st.prompt.min) });
    step(st, { op: 'trapCheck', seat: 0, on: 'end' });
    assert.equal(st.traps.length, 1);
    b.loc = tr.loc; b.elixirs = [];
    step(st, { op: 'trapCheck', seat: 1, on: 'end' });
    assert.equal(st.prompt.seat, 1);
    assert.equal(st.prompt.card, 'CONT80-12');
    okAll(st, 1);
    assert.ok(b.elixirs.length >= 3, 'событие 109: эликсиры (до лимита)');
    assert.equal(st.traps.length, 0, 'жетон сброшен');
    assert.ok(st.eventsUsed.includes('CONT80-12'));
});

test('жетон задания «придёт туда»: срабатывает при перемещении другого игрока; «остаётся» — не для него в этот ход', () => {
    const st = game();
    const b = st.players[1];
    const loc = ADJ[b.loc][0];
    step(st, { op: 'trapPut', seat: 0, trap: { where: 'here', on: 'move', event: 'CONT80-15' }, loc, terrain: null });
    b.loc = loc;
    step(st, { op: 'arrive', seat: 1 });
    assert.equal(st.prompt.seat, 1);
    assert.equal(st.prompt.card, 'CONT80-15');
    // Roll by alchemy ×2 + d6: with alchemy 1 the result is 3–8; at 3–7 the token stays.
    b.skills.alchemy = 0;
    okAll(st, 1);
    while (st.prompt && st.prompt.seat === 1) answer(st, st.prompt.options ? { t: 'answer', choice: st.prompt.options[0].id } : { t: 'answer', ids: st.prompt.ids.slice(0, st.prompt.min) });
    const stays = st.traps.length === 1;
    if (stays) {
        assert.ok(st.traps[0].immune, 'остался, но не для этого игрока в этот ход');
        step(st, { op: 'arrive', seat: 1 });
        assert.ok(!st.prompt, 'второй раз в этот ход не срабатывает');
    }
});

test('жетон задания: «в любую соседнюю локацию» — выбор, «случайный жетон водной локации» — из стопки', () => {
    const st = game();
    const a = st.players[0];
    step(st, { op: 'trapPlace', seat: 0, trap: { where: 'adj', on: 'move', event: 'CONT80-05' } });
    assert.equal(st.prompt.title, 'Жетон задания');
    assert.deepEqual(st.prompt.options.map(o => Number(o.id)).sort((x, y) => x - y), ADJ[a.loc].slice().sort((x, y) => x - y));
    answer(st, { t: 'answer', choice: st.prompt.options[0].id });
    assert.equal(st.traps[0].loc, ADJ[a.loc][0]);
    const water = st.locPiles.water.length;
    step(st, { op: 'trapPlace', seat: 0, trap: { where: 'water', on: 'move', event: 'CONT80-20' } });
    assert.equal(st.locPiles.water.length, water - 1);
    assert.equal(st.traps[1].terrain, 'water');
    // Sprung and discarded: the location token goes back to its pile.
    st.players[1].loc = st.traps[1].loc;
    step(st, { op: 'trapCheck', seat: 1, on: 'move' });
    while (st.prompt) answer(st, st.prompt.options ? { t: 'answer', choice: st.prompt.options[0].id } : { t: 'answer', ids: st.prompt.ids.slice(0, st.prompt.min) });
    assert.equal(st.locPiles.water.length, water);
});

test('тайное событие: берётся в закрытую и зачитывается первому другому игроку, выполнившему условие', () => {
    const st = game();
    const [a, b] = st.players;
    step(st, ...effectSteps(0, [{ secret: 'CONT80-35' }], {}));
    assert.deepEqual(a.secrets, ['CONT80-35']);
    assert.equal(viewFor(st, 1).players[0].secrets, undefined, 'другие видят только количество');
    assert.equal(viewFor(st, 1).players[0].secretCount, 1);
    // The owner raising alchemy does not trigger his own card.
    step(st, { op: 'raiseSkill', seat: 0, skill: 'alchemy', why: 'тест' });
    while (st.prompt) answer(st, st.prompt.options ? { t: 'answer', choice: st.prompt.options[0].id } : { t: 'answer', ids: st.prompt.ids.slice(0, st.prompt.min) });
    assert.deepEqual(a.secrets, ['CONT80-35']);
    b.gold = 0;
    step(st, { op: 'raiseSkill', seat: 1, skill: 'alchemy', why: 'тест' });
    while (st.prompt && st.prompt.card !== 'CONT80-35') answer(st, st.prompt.options ? { t: 'answer', choice: st.prompt.options[0].id } : { t: 'answer', ids: st.prompt.ids.slice(0, st.prompt.min) });
    assert.equal(st.prompt.seat, 1);
    okAll(st, 1);
    assert.deepEqual(a.secrets, []);
    assert.equal(b.elixirs.length, 0, 'все эликсиры сброшены');
    assert.equal(b.gold, 1);
});

test('тайное событие «переместится в Вызиму (7)» срабатывает только там', () => {
    const st = game();
    const b = st.players[1];
    st.players[0].secrets = ['CONT80-27'];
    b.loc = 6;
    step(st, { op: 'arrive', seat: 1 });
    assert.ok(!st.prompt);
    b.loc = 7;
    step(st, { op: 'arrive', seat: 1 });
    assert.equal(st.prompt.seat, 1);
    assert.equal(st.prompt.card, 'CONT80-27');
    answer(st, { t: 'answer', choice: 'ok' });
    assert.equal(st.prompt.ui, 'combo', 'сыграть комбинацию из руки (без добора)');
    assert.deepEqual(st.prompt.ids.slice().sort(), b.hand.slice().sort());
});

test('стоимости вариантов: эликсир, карта цвета, любая карта из руки', () => {
    const st = game();
    const a = st.players[0];
    a.elixirs = [];
    exploreCard(st, 'CONT82-39');
    const b = st.prompt.options.find(o => o.id === 'b');
    assert.equal(b.disabled, true);
    assert.match(b.hint, /эликсир/);

    const s2 = game();
    const p = s2.players[0];
    p.hand = p.hand.filter(id => CARDS[id].color !== 'yellow');
    step(s2, { op: 'takeEvent', seat: 0, id: 'CONT80-25' });
    assert.equal(s2.prompt.options.find(o => o.id === 'a').disabled, true, 'нет жёлтой карты');
    assert.match(s2.prompt.options.find(o => o.id === 'a').hint, /жёлтая/);
    const hand = p.hand.length;
    answer(s2, { t: 'answer', choice: 'b' });
    if (s2.prompt.title === 'Оплата') answer(s2, { t: 'answer', ids: [s2.prompt.ids[0]] });
    assert.equal(p.hand.length, hand - 1, 'сброшена 1 карта из руки');
    assert.equal(s2.prompt.title, 'Последствия');
});

test('покер против кубиков на карте (CITY1-35): нужна комбинация строго лучше 2–2–3–3–3', () => {
    const st = game([]);
    const a = st.players[0];
    exploreCard(st, 'CITY1-35');
    answer(st, { t: 'answer', choice: 'a' });
    answer(st, { t: 'answer', choice: 'ok' });
    assert.equal(st.poker.vs, 'fixed');
    assert.deepEqual(st.poker.b, [2, 2, 3, 3, 3]);
    const gold = a.gold;
    assert.equal(st.prompt.kind, 'dice');
    answer(st, { t: 'answer', ids: [] });
    assert.ok(st.poker.done);
    assert.equal(a.gold - gold, st.poker.winner === 'a' ? 5 : 0);
});

test('покер без своей ставки (CITY2-08) и ставка 2 по тайному событию (CONT80-22)', () => {
    const st = game();
    const a = st.players[0];
    a.gold = 3;
    step(st, { op: 'takeEvent', seat: 0, id: 'CITY2-08' });
    answer(st, { t: 'answer', choice: 'a' });
    answer(st, { t: 'answer', choice: 'ok' });
    assert.equal(st.poker.stake, 0);
    assert.equal(st.poker.pot, 2);
    assert.equal(a.gold, 3, 'своё золото не ставится');
    answer(st, { t: 'answer', ids: [] });
    assert.equal(a.gold, st.poker.winner === 'a' ? 5 : 3);

    const s2 = game();
    const q = s2.players[0];
    s2.players[1].secrets = ['CONT80-22'];
    q.gold = 1;
    push(s2, { op: 'pokerStart', seat: 0, vs: 'town', loc: true });
    push(s2, { op: 'trapCheck', seat: 0, on: 'poker' });
    run(s2);
    assert.equal(s2.prompt.card, 'CONT80-22');
    okAll(s2, 0);
    assert.equal(q.gold, 1, 'на ставку 2 золота не хватает — покера нет');
    assert.ok(!s2.prompt);
});

test('freeMove на 3 локации, «доберите до 5 эликсиров», скидка на карту ряда', () => {
    const st = game();
    const a = st.players[0];
    step(st, ...effectSteps(0, [{ freeMove: 3 }], {}));
    const reach = st.prompt.options.map(o => Number(o.id));
    assert.ok(reach.length > ADJ[a.loc].length, 'дальше соседних');
    for (const n of ADJ[a.loc]) assert.ok(reach.includes(n));
    st.prompt = null;
    a.elixirs = ['POTION-01#1'];
    step(st, ...effectSteps(0, [{ elixirTo: 5, noLimit: true }], {}));
    assert.equal(a.elixirs.length, 5);
    const before = buyOptions(st, a).map(o => o.cost);
    step(st, ...effectSteps(0, [{ buyDiscount: 1 }], {}));
    const after = buyOptions(st, a).map(o => o.cost);
    after.forEach((c, i) => assert.equal(c, Math.max(0, before[i] - 1)));
});

test('Гертруда: карты ряда без надбавки ячейки; Гроббо: +1 карта после формирования запасов жизни', () => {
    const st = game();
    const a = st.players[0];
    const before = buyOptions(st, a).map(o => o.cost);
    a.gear.push('CONT80-39');
    const after = buyOptions(st, a);
    assert.ok(after.some((o, i) => o.cost < before[i]), 'надбавка +1 снята');
    assert.ok(after.every((o, i) => o.cost <= before[i]));
    // Гроббо.
    const s2 = game([], 1, 3);
    const p = s2.players[0];
    p.gear.push('CONT80-37');
    const slot = s2.slots.find(x => x.mon);
    p.loc = slot.token;
    const hand = p.hand.length;
    ok(apply(s2, 0, { t: 'fight' }));
    while (s2.prompt && s2.fight && s2.fight.stage !== 'witcher') answer(s2, s2.prompt.options ? { t: 'answer', choice: s2.prompt.options[0].id } : { t: 'answer', ids: s2.prompt.ids.slice(0, s2.prompt.min) });
    assert.ok(s2.fight.once.g37, 'Гроббо сработал');
    assert.ok(s2.log.some(l => /Гроббо/.test(l.t)));
    assert.ok(p.hand.length >= hand);
});

test('задание «локация вашей школы или школы другого игрока» выполняется в любой школе стола', () => {
    const st = game([]);
    const [a, b] = st.players;
    step(st, ...effectSteps(0, [{ quest: { event: 'CONT79-10', school: 'any' } }], { card: 'CONT81-26' }));
    const q = a.quests.at(-1);
    assert.deepEqual(q.locs.slice().sort((x, y) => x - y), [SCHOOLS[a.school].home, SCHOOLS[b.school].home].sort((x, y) => x - y));
    assert.equal(EVENTS['CONT79-10'].fx[0].if.ownSchool, true);
});

for (const n of [1, 2, 3, 4]) {
    test(`партии ботов с «Цири и доп. события», ${n} игр.: только легальные команды, партия доходит до конца`, () => {
        let wins = 0, used = 0;
        for (let seed = 1; seed <= 6; seed++) {
            const { state } = playGame({ players: n, seed, exp: ['ciri'] });
            if (state.winner != null) wins++;
            used += state.eventsUsed.filter(id => EVENTS[id] && EVENTS[id].exp === 'ciri').length;
        }
        if (n > 1) assert.ok(wins >= 5, `побед: ${wins}/6`);
        assert.ok(used > 0, 'карты дополнения разыгрывались');
    });
}
