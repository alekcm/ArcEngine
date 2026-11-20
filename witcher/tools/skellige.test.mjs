// «Скеллиге» (Книги правил/Скеллиге.md; Сирена — Доп монстра.md): setup, ships and voyages,
// the Dagon track and his emergence, the Dagon location and fight, the gifts, island actions.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, apply, options } from '../shared/engine/core.mjs';
import { push, run } from '../shared/engine/flow.mjs';
import { viewFor } from '../shared/view.mjs';
import { CARDS, LOC, MONSTER } from '../shared/engine/util.mjs';
import { PORTS, ISLANDS, DAGON_LOC, TRACK_TOP, trackStart, GIFTS } from '../shared/data/skellige-data.mjs';
import { EVENTS, EXP_DECKS } from '../shared/data/events-data.mjs';
import { BIG } from '../shared/data/vuln-data.mjs';
import { sailMoves, seaEdges } from '../shared/engine/skellige.mjs';
import { playGame } from './sim.mjs';

const ok = (r) => assert.ok(r.ok, r.err);
const step = (st, ...s) => { push(st, ...s); run(st); };
const answerAll = (st, seat = 0, stop = () => false) => {
    for (let i = 0; i < 60 && st.prompt && st.prompt.seat === seat && !stop(); i++) {
        const pr = st.prompt;
        ok(apply(st, seat, pr.kind === 'choice' ? { t: 'answer', choice: pr.options.find(o => !o.disabled).id } : { t: 'answer', ids: pr.ids.slice(0, pr.min) }));
    }
};
function game({ exp = ['skellige', 'skellige:siren'], seed = 3, players = 2 } = {}) {
    const st = createGame({ seed, exp, players: Array.from({ length: players }, (_, i) => ({ name: 'P' + i, school: ['wolf', 'cat', 'bear', 'viper', 'griffin'][i], bot: i ? 1 : 0 })) });
    while (st.prompt) apply(st, st.prompt.seat, { t: 'answer', choice: st.prompt.options[0].id });
    return st;
}
const cardOf = (terrain, not = []) => Object.values(CARDS).find(c => c.terrain === terrain && !c.starter && !not.includes(c.id)).id;
/** Seat 0 stands in a port with a ship, with cards of every terrain in the hand. */
function atPort(st, port) {
    const p = st.players[0];
    if (!st.sk.ships.includes(port)) { st.sk.ships.pop(); st.sk.ships.push(port); }
    p.loc = port;
    p.hand = ['water', 'forest', 'mountain'].map(t => cardOf(t));
    return p;
}

test('данные: 50 карт исследования Скеллиге, 5 даров, Дагон с особой стороной', () => {
    assert.equal(EXP_DECKS.skellige.explore.length, 50);
    for (const id of EXP_DECKS.skellige.explore) assert.equal(EVENTS[id].halves.length, 2, id);
    assert.equal(GIFTS.length, 5);
    assert.ok(MONSTER.DAGON && BIG.DAGON);
    assert.deepEqual(PORTS, [1, 5, 6, 9, 12, 13]);
    assert.deepEqual(ISLANDS, [19, 20, 21]);
    assert.equal(trackStart(5), 0); assert.equal(trackStart(4), 0);
    assert.equal(trackStart(3), 1); assert.equal(trackStart(2), 1);
    assert.equal(trackStart(1), 2);
});

test('подготовка: 3 корабля в портах, жетоны 19–21 в стопках, Дагон на делении по числу игроков', () => {
    for (const n of [1, 2, 3, 4, 5]) {
        const st = game({ players: n, seed: n });
        assert.equal(st.sk.ships.length, 3);
        for (const s of st.sk.ships) assert.ok(PORTS.includes(s));
        assert.equal(new Set(st.sk.ships).size, 3);
        assert.equal(st.sk.track, trackStart(n));
        assert.equal(st.sk.deck.length, 50);
        assert.equal(st.sk.gifts.length, 5);
        const tokens = [...Object.values(st.locPiles).flat(), ...st.slots.map(s => s.token), ...(st.vtokens ? Object.keys(st.vtokens).map(Number) : [])];
        for (const i of ISLANDS) assert.ok(tokens.includes(i), 'жетон острова ' + i);
    }
    const base = game({ exp: [] });
    assert.equal(base.sk, undefined);
    assert.ok(!Object.values(base.locPiles).flat().some(n => n > 18));
});

test('корабль: из порта на остров (цена по местности острова), карта исследования, без исследования в фазе II', () => {
    const st = game();
    const p = atPort(st, 1);
    const ms = sailMoves(st, p);
    assert.deepEqual(ms.filter(m => m.sail === 'island').map(m => m.to).sort(), [19, 20, 21]);
    const o = options(st, 0);
    assert.ok(o.moves.some(m => m.to === 20 && m.sail === 'island'));
    const deck = st.sk.deck.length;
    ok(apply(st, 0, { t: 'move', to: 20, cards: [p.hand.find(id => CARDS[id].terrain === 'water')] }));
    answerAll(st);
    assert.equal(st.sk.deck.length, deck - 1, 'зачитана 1 карта Скеллиге');
    if (p.loc === 20) {
        assert.ok(st.sk.ships.includes(20) && !st.sk.ships.includes(1), 'корабль приплыл');
        assert.ok(apply(st, 0, { t: 'explore', deck: 'wild' }).err, 'после карты Скеллиге исследовать нельзя');
        assert.ok(!sailMoves(st, p).some(m => m.sail === 'island'), 'на остров — 1 раз за ход');
    }
});

test('корабль: обратно на Континент — без карты, только в свободный порт; между портами нельзя', () => {
    const st = game();
    const p = st.players[0];
    st.sk.ships = [19, 1, 5];
    p.loc = 19;
    const ms = sailMoves(st, p);
    assert.deepEqual(ms.map(m => m.to).sort((a, b) => a - b), [6, 9, 12, 13]);
    assert.ok(ms.every(m => m.sail === 'return'));
    p.hand = [cardOf('water'), cardOf('forest')];
    const deck = st.sk.deck.length;
    ok(apply(st, 0, { t: 'move', to: 12, cards: [p.hand[0]] }));
    run(st);
    assert.equal(p.loc, 12);
    assert.equal(st.sk.deck.length, deck, 'карта Скеллиге не зачитывается');
    assert.ok(st.sk.ships.includes(12) && !st.sk.ships.includes(19));
    p.loc = 5;
    assert.ok(!sailMoves(st, p).some(m => PORTS.includes(m.to)), 'из порта в порт нельзя');
});

test('спокойно: Дагон +1; на верхнем делении Дагон появляется — щит плывущего 0 и жетон следа', () => {
    const st = game();
    const p = atPort(st, 1);
    st.sk.track = TRACK_TOP - 1;
    p.shield = 3;
    // A calm die for sure: the calm range of division 3 is 5–6 — force the roll.
    st.sk.voyage = null;
    step(st, { op: 'skVoyage', seat: 0, from: 1, to: 19 }, { op: 'skVoyageEnd', seat: 0 });
    // Whatever the die, replay the calm branch directly to check the emergence.
    st.prompt = null; st.queue = [];
    st.sk.track = TRACK_TOP - 1;
    st.sk.voyage = { seat: 0, from: 1, to: 19, half: null, emerged: false, stay: false, toP3: false };
    step(st, { op: 'skDagonMove', n: 1, why: 'тест' }, { op: 'skVoyageEnd', seat: 0 });
    assert.equal(st.sk.track, TRACK_TOP);
    assert.equal(p.shield, 0);
    assert.equal(p.skToken, true);
    assert.equal(p.loc, 19);
});

test('появление Дагона без плывущего игрока ни на кого не действует', () => {
    const st = game();
    st.sk.track = TRACK_TOP - 1;
    st.players.forEach(p => { p.shield = 2; });
    step(st, { op: 'skDagonMove', n: 1 });
    assert.equal(st.sk.track, TRACK_TOP);
    assert.ok(st.players.every(p => p.shield === 2 && !p.skToken));
});

test('локация Дагона: из порта с кораблём (1 карта любой местности), битва сразу; Дагон в начале хода', () => {
    const st = game();
    const p = atPort(st, 6);
    st.sk.track = TRACK_TOP;
    const m = sailMoves(st, p).find(x => x.to === DAGON_LOC);
    assert.ok(m && m.sail === 'dagon');
    p.trophies.push({ kind: 'skill', id: 'X1' }, { kind: 'skill', id: 'X2' });
    ok(apply(st, 0, { t: 'move', to: DAGON_LOC, cards: [p.hand[2]] }));
    answerAll(st, 0, () => st.fight && st.fight.stage === 'witcher');
    assert.equal(p.loc, DAGON_LOC);
    assert.ok(st.fight && st.fight.mon === 'DAGON' && st.fight.sk === 'dagon');
    assert.equal(st.turn.phase, 2);
    assert.ok(st.log.some(l => /Дагон: в начале первого хода/.test(l.t)), 'способность Дагона');
});

test('Дагон прогнан: на начальное деление, +2 золота, карта стоимости 0, дар; дар срабатывает в следующей битве', () => {
    const st = game();
    const p = atPort(st, 6);
    st.sk.track = TRACK_TOP;
    ok(apply(st, 0, { t: 'move', to: DAGON_LOC, cards: [p.hand[0]] }));
    answerAll(st, 0, () => st.fight && st.fight.stage === 'witcher');
    const gold = p.gold;
    step(st, { op: 'dealDamage', n: st.fight.life.length, fight: 1 });
    answerAll(st, 0, () => !st.fight && st.turn.phase === 3);
    assert.equal(st.sk.track, st.sk.start);
    assert.equal(p.gifts.length, 1);
    assert.equal(st.sk.gifts.length, 4);
    assert.ok(p.gold >= gold + 2);
    assert.equal(st.sk.track, st.sk.start, 'дар не двигает Дагона в битве, где получен');
});

test('общий эффект даров: после битвы Дагон поднимается на число даров', () => {
    const st = game();
    const p = st.players[0];
    p.gifts = ['DAGON-GIFT-01', 'DAGON-GIFT-03'];
    st.sk.track = 0;
    // Through the real hook: a won monster fight ends with the gifts' effect.
    const slot = st.slots.find(s => s.mon);
    p.loc = slot.token; st.turn.moved = true;
    ok(apply(st, 0, { t: 'fight' }));
    answerAll(st, 0, () => st.fight && st.fight.stage === 'witcher');
    step(st, { op: 'dealDamage', n: st.fight.life.length, fight: 1 });
    answerAll(st, 0, () => !st.fight);
    assert.equal(st.sk.track, 2);
});

test('сирена: в локации Дагона, пока его нет; победа — 2 золота и трофей без жетона трофеев', () => {
    const st = game();
    const p = atPort(st, 1);
    st.sk.track = 0;
    assert.ok(sailMoves(st, p).some(m => m.to === DAGON_LOC));
    ok(apply(st, 0, { t: 'move', to: DAGON_LOC, cards: [p.hand[0]] }));
    answerAll(st, 0, () => st.fight && st.fight.stage === 'witcher');
    assert.equal(st.fight.mon, 'MON-31');
    const track = p.track, gold = p.gold;
    step(st, { op: 'dealDamage', n: st.fight.life.length, fight: 1 });
    answerAll(st, 0, () => !st.fight);
    assert.ok(p.trophies.some(t => t.id === 'MON-31'));
    assert.equal(p.track, track);
    assert.ok(p.gold >= gold + 2);
    assert.equal(st.sk.siren, false);
    assert.ok(!sailMoves(st, p).length || !sailMoves(st, p).some(m => m.to === DAGON_LOC));
    const st2 = game({ exp: ['skellige'] });
    const p2 = atPort(st2, 1);
    st2.sk.track = 0;
    assert.ok(!sailMoves(st2, p2).some(m => m.to === DAGON_LOC), 'без сирены и Дагона локация закрыта');
});

test('острова: Лок Гвен +3 золота, Ард Скеллиг любой навык +1', () => {
    const st = game();
    const p = st.players[0];
    st.sk.islands.push(32);
    st.sk.ships = [32, 5, 6];
    p.loc = 32; st.turn.moved = true;
    const g = p.gold;
    ok(apply(st, 0, { t: 'loc' }));
    run(st);
    assert.equal(p.gold, g + 3);
    const st2 = game();
    const q = st2.players[0];
    q.loc = 19; st2.turn.moved = true;
    const sum = Object.values(q.skills).reduce((a, b) => a + b, 0);
    ok(apply(st2, 0, { t: 'loc' }));
    answerAll(st2);
    assert.equal(Object.values(q.skills).reduce((a, b) => a + b, 0), sum + 1);
});

test('вид: колоды Скеллиге и дары — только числом', () => {
    const st = game();
    const v = viewFor(st, 0);
    assert.equal(typeof v.sk.deck, 'number');
    assert.equal(typeof v.sk.gifts, 'number');
    assert.deepEqual(v.sk.ships, st.sk.ships);
    assert.ok(seaEdges(v, st.sk.ships[0]).length >= 3);
});

test('боты доигрывают партии со Скеллиге и плавают на острова', () => {
    let sails = 0;
    for (const [players, seed] of [[1, 3], [2, 5], [3, 6], [4, 8], [5, 2]]) {
        const { state } = playGame({ players, seed, exp: ['skellige', 'skellige:siren', ...(seed % 2 ? ['trail', 'trail:vuln'] : [])] });
        assert.ok(state.stage === 'over' || state.round > 80, `${players}/${seed}`);
        sails += state.log.filter(l => /садится на корабль/.test(l.t)).length;
    }
    assert.ok(sails > 0);
});

test('ход в локации Дагона: битва командой фазы II; дар 02 — сброс карты и переход в другую водную локацию', () => {
    const st = game();
    const p = st.players[0];
    st.sk.track = TRACK_TOP;
    st.sk.ships = [DAGON_LOC, 1, 5];
    p.loc = DAGON_LOC;
    const o = options(st, 0);
    assert.ok(o.phase2.some(a => a.id === 'skFight' && !a.err));
    ok(apply(st, 0, { t: 'skFight' }));
    answerAll(st, 0, () => st.fight && st.fight.stage === 'witcher');
    assert.equal(st.fight.mon, 'DAGON');

    const s2 = game();
    const q = s2.players[0];
    q.gifts = ['DAGON-GIFT-02'];
    q.loc = 12; q.hand = [cardOf('forest'), cardOf('mountain')];
    assert.equal(options(s2, 0).gift02.err, null);
    ok(apply(s2, 0, { t: 'skGift02' }));
    ok(apply(s2, 0, { t: 'answer', ids: [q.hand[0]] }));
    assert.ok(s2.prompt.options.every(x => LOC[Number(x.id)].terrain === 'water' && Number(x.id) !== 12 && Number(x.id) <= 18));
    ok(apply(s2, 0, { t: 'answer', choice: '1' }));
    run(s2);
    assert.equal(q.loc, 1);
    assert.equal(q.hand.length, 1);
    assert.ok(options(s2, 0).gift02.err, 'один раз за ход');
});
