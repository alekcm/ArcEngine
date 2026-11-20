// Битва ведьмаков, ставки, закрытая корчма, покер с ведьмаком и трофеи ведьмаков
// (Книги правил/База.md pp. 13–14, 20–23, 27–29; Ведьмаки/Трофеи.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, apply, options, actingSeat } from '../shared/engine/core.mjs';
import { push, run } from '../shared/engine/flow.mjs';
import { viewFor } from '../shared/view.mjs';
import { botCommand } from '../shared/bots.mjs';
import { CARDS, maxShield } from '../shared/engine/util.mjs';
import { comboTotals, comboError } from '../shared/engine/fight.mjs';
import { SCHOOLS, wtrophyCards } from '../shared/data/rules-data.mjs';

const ok = (r) => assert.ok(r.ok, r.err);
function game({ seed = 7, players = 2, schools = ['wolf', 'cat', 'bear'], bots = [] } = {}) {
    const st = createGame({ seed, exp: {}, players: Array.from({ length: players }, (_, i) => ({ name: 'P' + i, school: schools[i], bot: bots.includes(i) ? 1 : 0 })) });
    while (st.prompt) apply(st, st.prompt.seat, { t: 'answer', choice: st.prompt.options[0].id });
    return st;
}
/** Put every witcher in a non-school location; the active one has moved there. */
function meet(st, loc = 5) {
    for (const p of st.players) p.loc = loc;
    st.turn.moved = true;
    return st;
}
/** Everyone answers prompts by the bot rules until the fight is over. */
function playOut(st, max = 400) {
    for (let i = 0; i < max && st.fight; i++) {
        const seat = actingSeat(st);
        if (seat == null) break;
        ok(apply(st, seat, botCommand(viewFor(st, seat), { options: options(st, seat) })));
    }
}
const logHas = (st, re) => st.log.some(l => re.test(l.t));

test('битва ведьмаков: запрещена в локации школы, в закрытой корчме и после покера с ним', () => {
    const st = meet(game());
    const p = st.players[0];
    p.loc = st.players[1].loc = SCHOOLS.wolf.home;
    assert.match(options(st, 0).phase2.find(x => x.id === 'duel-1').err, /школы/);
    p.loc = st.players[1].loc = 5;
    st.closedTavern = 5;
    assert.match(options(st, 0).phase2.find(x => x.id === 'duel-1').err, /корчма/);
    st.closedTavern = null;
    st.turn.pokered = [1];
    assert.match(options(st, 0).phase2.find(x => x.id === 'duel-1').err, /покер/);
    st.turn.pokered = [];
    assert.equal(options(st, 0).phase2.find(x => x.id === 'duel-1').err, null);
});

test('битва ведьмаков: запасы жизней, нападающий ходит первым, урон — щит, колода, рука', () => {
    const st = meet(game());
    const [a, d] = st.players;
    d.shield = 1;
    ok(apply(st, 0, { t: 'duel', seat: 1 }));
    const f = st.fight;
    assert.equal(f.kind, 'duel');
    assert.equal(f.seat, 0);
    assert.equal(d.discard.length, 0, 'сброс замешан в колоду');
    assert.equal(f.stage, 'witcher');
    const deck0 = d.deck.length;
    // A 1-card combo with damage: the shield takes the first point.
    const id = a.hand.find(x => (CARDS[x].fx.dmg || 0) >= 2) || a.hand[0];
    const dmg = comboTotals(st, a, [id]).dmg;
    ok(apply(st, 0, { t: 'combo', ids: [id] }));
    while (st.prompt) ok(apply(st, st.prompt.seat, botCommand(viewFor(st, st.prompt.seat), { options: options(st, st.prompt.seat) })));
    if (dmg >= 1) assert.equal(d.shield, 0);
    assert.equal(d.deck.length, deck0 - Math.max(0, dmg - 1));
    assert.equal(st.fight.seat, 1, 'теперь ходит защищающийся');
    assert.equal(st.fight.stage, 'witcher');
});

test('битва ведьмаков до конца: трофей, золото по репутации, карта 0, закрытая корчма', () => {
    for (const seed of [3, 4, 5, 6, 7, 8]) {
        const st = meet(game({ seed, bots: [0, 1] }));
        const [a, d] = st.players;
        d.hand = d.hand.slice(0, 1); d.deck = d.deck.slice(0, 2); d.discard = [];
        const g0 = [a.gold, d.gold];
        ok(apply(st, 0, { t: 'duel', seat: 1 }));
        playOut(st);
        assert.equal(st.fight, null, 'битва закончилась');
        assert.equal(st.closedTavern, 5);
        const won = st.lastFight.winner === 0;
        if (won) {
            assert.equal(a.gold - g0[0], 1, 'проигравший без трофеев: 1 золото');
            assert.ok(a.trophies.some(t => t.kind === 'witcher' && t.id === 'cat' && wtrophyCards('cat').includes(t.card)));
            assert.equal(d.hand.length, 3, 'защищающийся берёт 3 карты');
        } else {
            assert.equal(d.gold - g0[1], 1);
            assert.equal(d.hand.length, 4, 'отбившийся берёт 4 карты');
            assert.equal(st.turn.drawDelta, -1);
        }
        assert.equal(a.shield, maxShield(st, a));
        assert.ok([...a.deck, ...a.hand, ...a.discard].length + [...d.deck, ...d.hand, ...d.discard].length > 0);
    }
});

test('второй трофей той же школы не берётся; ставки при 3 игроках', () => {
    const st = meet(game({ players: 3, bots: [0, 1] }));
    const [a, d, c] = st.players;
    c.loc = 9;
    a.trophies.push({ kind: 'witcher', id: 'cat', card: 'WITCHER-TROPHY-05' });
    d.hand = []; d.deck = d.deck.slice(0, 1); d.discard = [];
    d.shield = 0;
    ok(apply(st, 0, { t: 'duel', seat: 1 }));
    // Seat 2 (human) is asked for a bet.
    assert.equal(st.prompt.seat, 2);
    const g2 = c.gold;
    ok(apply(st, 2, { t: 'answer', choice: 'att' }));
    assert.equal(c.gold, g2 - 1);
    playOut(st);
    if (st.lastFight.winner === 0) {
        assert.equal(a.trophies.filter(t => t.kind === 'witcher').length, 1);
        assert.equal(c.gold, g2 + 1, 'ставка: золото назад и +1 (как победителю)');
    } else assert.equal(c.gold, g2 - 1);
});

test('при игре вдвоём ставок нет; одиночная игра — нет битвы ведьмаков', () => {
    const st = meet(game({ bots: [1] }));
    ok(apply(st, 0, { t: 'duel', seat: 1 }));
    assert.ok(!st.prompt || st.prompt.title !== 'Ставка на битву ведьмаков');
});

test('покер с ведьмаком: по 1 золоту + 1 из запаса, соперник перебрасывает первым, один раз за ход', () => {
    const st = meet(game());
    const [a, d] = st.players;
    a.gold = 3; d.gold = 2;
    const pk = options(st, 0).pokers.find(x => x.seat === 1);
    assert.equal(pk.err, null);
    ok(apply(st, 0, { t: 'wpoker', seat: 1 }));
    assert.equal(st.prompt.seat, 1, 'первым перебрасывает соперник');
    assert.equal(st.prompt.side, 'b');
    ok(apply(st, 1, { t: 'answer', ids: [] }));
    assert.equal(st.prompt.seat, 0);
    ok(apply(st, 0, { t: 'answer', ids: [] }));
    assert.ok(st.poker.done);
    assert.equal(a.gold + d.gold, 3 + 2 + 1);
    assert.match(options(st, 0).pokers.find(x => x.seat === 1).err, /уже играли/);
    assert.match(options(st, 0).phase2.find(x => x.id === 'duel-1').err, /покер/);
    assert.equal(st.lastPoker.vs, 'witcher');
});

test('покер с ведьмаком: только после перемещения и если у обоих есть золото', () => {
    const st = meet(game());
    st.turn.moved = false;
    assert.match(options(st, 0).pokers[0].err, /переместитесь/);
    st.turn.moved = true;
    st.players[1].gold = 0;
    assert.match(options(st, 0).pokers[0].err, /нет золота/);
});

test('трофей Мантикоры: сбросить эликсир — 1 урон; трофей Цири: связь любого цвета', () => {
    const st = meet(game());
    const [a, d] = st.players;
    a.trophies.push({ kind: 'witcher', id: 'manticore', card: 'WITCHER-TROPHY-21' }, { kind: 'witcher', id: 'ciri', card: 'WITCHER-TROPHY-25' });
    a.elixirs = [st.elixirDeck.shift()];
    d.shield = 0;
    ok(apply(st, 0, { t: 'duel', seat: 1 }));
    const o = options(st, 0).fight;
    assert.ok(o.active.some(x => x.key === 'W-manticore' && !x.err));
    assert.equal(o.wlink, null);
    const deck0 = d.deck.length;
    ok(apply(st, 0, { t: 'active', key: 'W-manticore' }));
    assert.equal(a.elixirs.length, 0);
    assert.equal(d.deck.length, deck0 - 1);
    assert.match(options(st, 0).fight.active.find(x => x.key === 'W-manticore').err, /уже/i);
    // Two cards that do not connect: with the Ciri trophy they do.
    let pair = null;
    for (const x of a.hand) for (const y of a.hand) if (x !== y && CARDS[x].links.length && comboError(st, a, [x, y]) && !pair) pair = [x, y];
    if (pair) {
        assert.equal(comboError(st, a, pair, { wlink: 1 }), null);
        const t = comboTotals(st, a, pair, { wlink: 1 });
        assert.ok(t.wlink);
        ok(apply(st, 0, { t: 'combo', ids: pair, wlink: 1 }));
        assert.ok(logHas(st, /трофей Цири/));
    }
});

test('партии ботов с частыми битвами ведьмаков: без зависаний и незаконных команд', () => {
    const homes = new Set(Object.values(SCHOOLS).map(s => s.home));
    let duels = 0;
    for (let g = 1; g <= 9; g++) {
        const players = 2 + (g % 3);
        const st = createGame({ seed: 900 + g, exp: g % 2 ? ['trail', 'ciri', 'vuln', 'bombs'] : [], players: Array.from({ length: players }, (_, i) => ({ name: 'Б' + i, school: ['wolf', 'cat', 'bear', 'viper', 'griffin'][(i + g) % 5], bot: 1 })) });
        let r = g * 7919 + 13; const rand = () => { r = (r * 1103515245 + 12345) % 2147483648; return r / 2147483648; };
        let last = null;
        for (let s = 0; s < 30000 && st.stage !== 'over' && st.round <= 80; s++) {
            const t = st.turn;
            if (t && t.phase === 1 && !st.prompt && !st.fight && last !== t && !t.moved) {
                last = t;
                const p = st.players[t.seat];
                if (!homes.has(p.loc) && rand() < 0.5) { for (const q of st.players) q.loc = p.loc; t.moved = true; }
            }
            const seat = actingSeat(st);
            assert.notEqual(seat, null, 'кто-то должен действовать');
            const cmd = botCommand(viewFor(st, seat), { options: options(st, seat), rand });
            assert.ok(cmd, 'у бота есть команда');
            ok(apply(st, seat, cmd));
        }
        duels += st.log.filter(l => /нападает на ведьмака/.test(l.t)).length;
    }
    assert.ok(duels >= 5, 'битв ведьмаков: ' + duels);
});
