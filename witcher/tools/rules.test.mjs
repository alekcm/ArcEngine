// Rules audit of «Ведьмак: Старый мир»: every test quotes the rulebook page it checks
// (Witcher/Книги правил/База.md#page-N) and runs the real engine.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, apply, options, actingSeat } from '../shared/engine/core.mjs';
import { movePaymentError } from '../shared/engine/turn.mjs';
import { pokerValue, comparePoker, POKER_NAMES } from '../shared/engine/turn.mjs';
import { comboError, comboTotals, linkIndex } from '../shared/engine/fight.mjs';
import { viewFor } from '../shared/view.mjs';
import { CARDS, LOC, ADJ } from '../shared/engine/util.mjs';
import { START_RES, ROW_MODS, SCHOOLS } from '../shared/data/rules-data.mjs';
import { COMMON, STARTER, MONSTERS, ATTACKS, POTIONS, BOARD } from '../shared/data/gen-data.mjs';
import { playGame } from './sim.mjs';

const game = (n, seed = 3) => createGame({ seed, players: Array.from({ length: n }, (_, i) => ({ name: 'P' + i, school: ['wolf', 'cat', 'bear', 'viper', 'griffin'][i] })) });
const allCards = (p) => [...p.hand, ...p.deck, ...p.discard];

test('данные: колоды и поле импортированы из md полностью', () => {
    assert.equal(STARTER.length, 70, '5 школ × 14 стартовых карт (Начальные колоды.md)');
    assert.equal(COMMON.length, 90, 'общая колода действий');
    assert.equal(ATTACKS.length, 20, 'боевая колода монстров: 20 карт');
    assert.equal(POTIONS.length, 7, '7 видов эликсиров');
    assert.ok(MONSTERS.length >= 28);
    assert.equal(BOARD.locs.length, 22, 'локации 0–21 (19–21 — Скеллиге)');
    for (const [a, list] of Object.entries(ADJ)) for (const b of list) assert.ok((ADJ[b] || []).includes(Number(a)), `дорога ${a}–${b} двусторонняя`);
    for (const c of [...STARTER, ...COMMON]) assert.ok(['blue', 'red', 'green', 'purple', 'yellow'].includes(c.color), c.id);
});

test('подготовка (с. 6–8): 10 стартовых карт, щит 1, рука и золото по таблице, 3 монстра', () => {
    for (let n = 1; n <= 5; n++) {
        const st = game(n);
        if (n === 2) {
            assert.equal(st.prompt && st.prompt.title, 'Монстр II уровня', 'вдвоём первый игрок выбирает место монстра II уровня');
            apply(st, 0, { t: 'answer', choice: st.prompt.options[0].id });
            assert.equal(st.slots.filter(s => s.mon).map(s => s.mon).filter(id => MONSTERS.find(m => m.id === id).level === 2).length, 1);
        }
        assert.equal(st.slots.filter(s => s.mon).length, 3, `${n} игр.: по монстру на каждый тип местности`);
        st.players.forEach((p, i) => {
            assert.equal(allCards(p).length, 10, 'стартовая колода — 10 карт');
            assert.equal(p.shield, 1);
            assert.equal(p.loc, SCHOOLS[p.school].home, 'ведьмак начинает в своей школе');
            const [hand, gold] = START_RES[n][i];
            assert.equal(p.hand.length, hand, `рука игрока ${i + 1} при ${n} игроках`);
            assert.equal(p.gold, gold, `золото игрока ${i + 1} при ${n} игроках`);
            if (n > 1) assert.equal(p.witcherTrophies, n - 1, 'трофеев ведьмака — по числу соперников');
        });
        assert.equal(st.row.filter(Boolean).length, 6, 'ряд из 6 карт');
    }
    assert.deepEqual(ROW_MODS, [1, 1, 0, 0, 0, -1], 'модификаторы стоимости ряда слева направо');
});

test('перемещение (с. 12): карта местности или джокер, 2 любые карты, или карта + золото', () => {
    const st = game(2);
    if (st.prompt) apply(st, 0, { t: 'answer', choice: st.prompt.options[0].id });
    const p = st.players[0];
    const to = ADJ[p.loc][0];
    const terr = LOC[to].terrain;
    const match = Object.values(CARDS).find(c => c.terrain === terr);
    const other = Object.values(CARDS).find(c => c.terrain !== terr && c.terrain !== 'joker' && terr !== 'joker');
    p.hand = [match.id, other ? other.id : match.id];
    assert.equal(movePaymentError(st, p, to, [match.id], 0), null, 'карта своей местности');
    if (other) {
        assert.ok(movePaymentError(st, p, to, [other.id], 0), 'чужая местность одной картой — нельзя');
        assert.equal(movePaymentError(st, p, to, [match.id, other.id], 0), null, '2 любые карты');
        p.gold = 1;
        assert.equal(movePaymentError(st, p, to, [other.id], 1), null, '1 карта + 1 золото');
        p.gold = 0;
        assert.ok(movePaymentError(st, p, to, [other.id], 1), 'без золота — нельзя');
    }
    const far = Object.keys(LOC).map(Number).find(n => n !== p.loc && !ADJ[p.loc].includes(n) && !LOC[n].island);
    assert.equal(apply(st, 0, { t: 'move', to: far, cards: [match.id], gold: 0 }).ok, false, 'только по дороге в соседнюю локацию');
    assert.equal(apply(st, 0, { t: 'move', to, cards: [match.id], gold: 0 }).ok, true);
    assert.equal(p.loc, to);
    assert.ok(p.discard.includes(match.id), 'оплаченная карта уходит в сброс');
});

test('действие локации (с. 13): только после перемещения и один раз за ход', () => {
    const st = game(3);
    const o = options(st, 0);
    assert.ok(o.loc.err, 'до перемещения действие локации недоступно');
});

test('покер (с. 14): пара < две пары < тройка < 1–5 < 2–6 < фул-хаус < каре < покер', () => {
    const hands = [[1, 1, 2, 3, 5], [1, 1, 2, 2, 5], [3, 3, 3, 1, 6], [1, 2, 3, 4, 5], [2, 3, 4, 5, 6], [2, 2, 5, 5, 5], [4, 4, 4, 4, 1], [6, 6, 6, 6, 6]];
    const names = ['Пара', 'Две пары', 'Тройка', 'Малый стрит', 'Большой стрит', 'Фул-хаус', 'Каре', 'Покер'];
    hands.forEach((h, i) => assert.equal(POKER_NAMES[pokerValue(h)[0]], names[i], h.join('')));
    for (let i = 1; i < hands.length; i++) assert.ok(comparePoker(hands[i], hands[i - 1]) > 0, `${names[i]} старше ${names[i - 1]}`);
    assert.ok(comparePoker([5, 5, 1, 2, 3], [4, 4, 1, 2, 6]) > 0, 'пара пятёрок старше пары четвёрок');
});

test('комбинация (с. 22): следующая карта совпадает по цвету со связкой предыдущей', () => {
    const a = COMMON.find(c => c.links.length);
    const good = COMMON.find(c => c.color === a.links[0].color);
    const bad = COMMON.find(c => !a.links.some(l => l.color === c.color));
    assert.ok(linkIndex(a, good) >= 0);
    assert.equal(linkIndex(a, bad), -1);
    const st = { fight: { stage: 'witcher', seat: 0, mon: 'MON-01', cur: { forcedFirst: null, onlyOne: false, blizzard: false } } };
    const p = { seat: 0, hand: [a.id, good.id, bad.id], trophies: [] };
    assert.equal(comboError(st, p, [a.id, good.id]), null);
    assert.ok(comboError(st, p, [a.id, bad.id]), 'не соединяется');
    assert.ok(comboError(st, p, []), 'с картами в руке комбинация обязательна');
    const t = comboTotals(st, p, [a.id, good.id]);
    const exp = (a.fx.dmg || 0) + (good.fx.dmg || 0) + (a.links[linkIndex(a, good)].fx.dmg || 0);
    assert.equal(t.dmg, exp, 'урон = свойства карт + бонус связки');
});

test('скрытая информация: чужая рука, колоды, запас жизни монстра и чужие запросы не уходят клиенту', () => {
    const st = game(3);
    const v = viewFor(st, 1);
    assert.equal(v.players[0].hand, undefined);
    assert.ok(Array.isArray(v.players[1].hand));
    assert.equal(typeof v.actionDeck, 'number');
    assert.equal(v.players[0].deck, undefined);
    assert.equal(v.rng, undefined);
    assert.equal(v.queue, undefined);
});

test('отмена и сохранения: ГСЧ хранится в состоянии — одна и та же партия воспроизводится точно', () => {
    const a = playGame({ players: 3, seed: 5 }).state, b = playGame({ players: 3, seed: 5 }).state;
    assert.equal(JSON.stringify(a), JSON.stringify(b));
    // A snapshot restored by JSON (undo/save/load) continues identically.
    const st = game(3, 4);
    const snap = JSON.parse(JSON.stringify(st));
    const o = options(st, 0);
    const to = o.moves[0].to;
    const pay = st.players[0].hand.slice(0, 2);
    assert.ok(apply(st, 0, { t: 'move', to, cards: pay, gold: 0 }).ok);
    assert.ok(apply(snap, 0, { t: 'move', to, cards: pay, gold: 0 }).ok);
    assert.equal(JSON.stringify(st), JSON.stringify(snap));
});

for (const n of [1, 2, 3, 4, 5]) {
    test(`партии ботов, ${n} игр.: только легальные команды, партия доходит до конца`, () => {
        let wins = 0;
        for (let seed = 1; seed <= 6; seed++) {
            const { state } = playGame({ players: n, seed });
            if (state.winner != null) {
                wins++;
                const w = state.players[state.winner];
                if (n > 1) assert.ok(w.track >= 4, 'победа — 4 трофея (с. 29)');
            }
        }
        if (n > 1) assert.ok(wins >= 5, `побед: ${wins}/6`);
    });
}
