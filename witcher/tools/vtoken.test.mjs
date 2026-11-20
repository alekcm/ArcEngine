// «По следу монстра» — «Уязвимости и особые атаки»: vulnerability tokens on the board and their
// effects in the fight (Книги правил/По следу монстра.md pp. 6–7, Монстры/Уязвимости.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, apply, options, actingSeat } from '../shared/engine/core.mjs';
import { push, run } from '../shared/engine/flow.mjs';
import { viewFor } from '../shared/view.mjs';
import { botCommand } from '../shared/bots.mjs';
import { CARDS, LOC, MONSTER, ATTACK, maxShield } from '../shared/engine/util.mjs';
import { comboTotals } from '../shared/engine/fight.mjs';
import { VULNS, BIG, vulnWindow } from '../shared/data/vuln-data.mjs';
import { TERRAINS } from '../shared/data/rules-data.mjs';
import { TRAIL_ALL } from './scenarios.mjs';

const ok = (r) => assert.ok(r.ok, r.err);
const step = (st, ...s) => { push(st, ...s); run(st); };
function game({ seed = 5, players = 2, exp = TRAIL_ALL } = {}) {
    const st = createGame({ seed, exp, players: Array.from({ length: players }, (_, i) => ({ name: 'P' + i, school: i ? 'cat' : 'wolf', bot: i ? 1 : 0 })) });
    while (st.prompt) apply(st, st.prompt.seat, { t: 'answer', choice: st.prompt.options[0].id });
    return st;
}
/** Seat 0 answers its own prompts: «yes»/first option, and 1 card when it may (exercises the costs). */
function answer0(st) {
    const pr = st.prompt;
    if (pr.kind === 'choice') { const o = pr.options.find(x => !x.disabled); return { t: 'answer', choice: o.id }; }
    return { t: 'answer', ids: pr.ids.slice(0, Math.max(pr.min, Math.min(1, pr.max))) };
}
/** Bots act (and seat 0 answers prompts) until seat 0 is at its witcher stage or the fight is over. */
function settle(st, { answers = true } = {}) {
    for (let i = 0; i < 120; i++) {
        if (!st.fight) return;
        if (st.prompt && st.prompt.seat === 0) { if (!answers) return; ok(apply(st, 0, answer0(st))); continue; }
        if (!st.prompt && st.fight.stage === 'witcher' && st.fight.seat === 0) return;
        const seat = actingSeat(st);
        ok(apply(st, seat, botCommand(viewFor(st, seat), { options: options(st, seat) })));
    }
}
/** Seat 0 fights `mon` holding vulnerability tokens `ns` of its terrain. */
function fightWith(st, mon, ns, { track = false, setup, answers = true } = {}) {
    const p = st.players[0];
    const slot = st.slots.find(s => s.mon);
    slot.mon = mon;
    p.loc = slot.token; st.turn.moved = true;
    p.vulns = ns.map(n => ({ terrain: slot.terrain, n }));
    if (track) p.trackTokens[slot.terrain] = st.locPiles[slot.terrain].pop();
    if (mon === 'MON-06') p.elixirs.push(st.elixirDeck.shift());
    if (setup) setup(p);
    ok(apply(st, 0, { t: 'fight' }));
    settle(st, { answers });
    return st.fight;
}
const logHas = (st, re) => st.log.some(l => re.test(l.t));

test('данные: 174 уязвимости закодированы, у каждой операции есть окно, игнорируемые атаки есть на карте', () => {
    let n = 0;
    for (const [id, list] of Object.entries(VULNS)) {
        assert.equal(list.length, 6, id);
        for (const ops of list) { n++; for (const o of ops) { assert.ok(vulnWindow(o), id + ' ' + o.k); if (o.k === 'ignSp') assert.ok(BIG[id].attacks.some(a => a.name === o.name), o.name); } }
    }
    assert.equal(n, 174);
    assert.deepEqual(Object.keys(VULNS).sort(), Object.keys(BIG).sort());
});

test('поле: по жетону на каждого монстра — в локации его местности без игроков; номер скрыт от всех', () => {
    const st = game();
    assert.equal(st.vulnBoard.length, 3);
    for (const v of st.vulnBoard) {
        assert.equal(LOC[v.loc].terrain, v.terrain);
        assert.ok(st.slots.some(s => s.terrain === v.terrain && s.mon));
        assert.ok(!st.players.some(p => p.loc === v.loc));
        assert.equal(st.vulnPiles[v.terrain].length, 5);
    }
    const view = viewFor(st, 0);
    assert.ok(view.vulnBoard.every(v => v.n === undefined && v.loc));
    assert.equal(view.vulnPiles.forest, 5);
    // Without the part: no tokens.
    const off = game({ exp: TRAIL_ALL.filter(x => x !== 'trail:vuln') });
    assert.equal(off.vulnBoard, undefined);
});

test('поле: войдя в локацию с жетоном, игрок берёт его лицом вверх, на поле появляется новый; все 6 у игроков — новый не кладётся', () => {
    const st = game();
    const p = st.players[0];
    const tok = st.vulnBoard[0];
    const n = tok.n;
    p.loc = tok.loc;
    step(st, { op: 'arrive', seat: 0 });
    assert.deepEqual(p.vulns, [{ terrain: tok.terrain, n }]);
    const fresh = st.vulnBoard.find(v => v.terrain === tok.terrain);
    assert.ok(fresh && fresh.loc !== tok.loc);
    assert.equal(st.vulnPiles[tok.terrain].length, 4);
    assert.ok(logHas(st, /берёт жетон уязвимости/));
    // Take the remaining 5.
    for (let i = 0; i < 5; i++) { const t = st.vulnBoard.find(v => v.terrain === tok.terrain); p.loc = t.loc; step(st, { op: 'arrive', seat: 0 }); }
    assert.equal(p.vulns.filter(v => v.terrain === tok.terrain).length, 6);
    assert.ok(!st.vulnBoard.some(v => v.terrain === tok.terrain));
    assert.ok(logHas(st, /у игроков — новый не размещается/));
});

test('последствия: победа или изгнание — жетоны местности сбрасываются у всех, 6 перемешиваются, новому монстру — новый жетон; поражение — жетоны остаются', () => {
    const st = game();
    const f = fightWith(st, 'MON-12', [2, 5]);
    const t = f.terrain;
    st.players[1].vulns = [{ terrain: t, n: 1 }];
    f.life = ['MON-ATK-01'];
    step(st, { op: 'dealDamage', fight: 1, n: 1 });
    settle(st);
    assert.ok(!st.fight);
    assert.equal(st.players[0].vulns.filter(v => v.terrain === t).length, 0);
    assert.equal(st.players[1].vulns.length, 0);
    assert.equal(st.vulnBoard.filter(v => v.terrain === t).length, 1, 'новый жетон для нового монстра');
    assert.equal(st.vulnPiles[t].length, 5);
    // Defeat: the tokens stay.
    const st2 = game({ seed: 9 });
    const f2 = fightWith(st2, 'MON-12', [3]);
    const p = st2.players[0];
    p.hand = []; p.deck = [];
    step(st2, { op: 'afterWitcherTurn', fight: 1 });
    settle(st2);
    assert.ok(!st2.fight);
    assert.deepEqual(p.vulns, [{ terrain: f2.terrain, n: 3 }]);
});

test('битва: «вы первым делаете ход», жизнь монстра снижена, щит выше максимума, добор после запасов', () => {
    let st = game();
    let f = fightWith(st, 'MON-27', [1, 2, 4, 5]);      // жизнь −2, щит +4, ходите первым, +2 карты
    const p = st.players[0];
    assert.equal(f.monDiscard.length + f.life.length, MONSTER['MON-27'].life - 2);
    assert.equal(f.mTurns, 0, 'ведьмак ходит первым без жетона следа');
    assert.ok(p.shield > maxShield(st, p), 'щит выше максимума');
    assert.ok(logHas(st, /Уязвимость V: \+2 карт/));
    // Without the tokens the monster goes first.
    st = game();
    f = fightWith(st, 'MON-27', []);
    assert.ok(f.mTurns >= 1);
});

test('битва: игнорировать особую атаку всю битву; в первый ход монстра урон −2 и эффекты кроме урона игнорируются', () => {
    let st = game();
    let f = fightWith(st, 'MON-12', [4], { track: true });
    const p = st.players[0];
    p.shield = 0;
    const hand = p.hand.length + p.deck.length;
    f.life.unshift('MON-SPECIAL-04'); f.stage = 'busy';
    step(st, { op: 'monsterTurn', fight: 1 }); settle(st);
    assert.ok(logHas(st, /«Созыв стаи» игнорируется/));
    assert.equal(p.hand.length + p.deck.length, hand, 'урона нет');
    assert.ok(!logHas(st, /получает \d+ урона/));
    // Волколак II: в первый ход монстра — только урон («Безудержная ярость»: 3 урона, без ограничения следующего хода).
    st = game();
    f = fightWith(st, 'MON-12', [2], { track: true });
    st.players[0].shield = 0;
    f.life.unshift('MON-SPECIAL-02'); f.stage = 'busy';
    step(st, { op: 'monsterTurn', fight: 1 }); settle(st);
    assert.ok(logHas(st, /эффекты особой атаки, кроме урона, игнорируются/));
    assert.ok(logHas(st, /получает 3 урона/));
    assert.ok(!st.fight.cur || !st.fight.cur.r || !st.fight.cur.r.ignoreDmg, 'ограничение следующего хода не наложено');
    // Гарпия V: урон первой атаки −2.
    st = game();
    f = fightWith(st, 'MON-02', [5], { track: true });
    st.players[0].shield = 0;
    const dmg2 = (a) => a.k === 'dmg' && (a.n != null ? a.n : a.lvl[0]) >= 2;
    f.life.unshift(Object.keys(ATTACK).find(id => dmg2(ATTACK[id].strike) && dmg2(ATTACK[id].bite))); f.stage = 'busy';
    step(st, { op: 'monsterTurn', fight: 1 }); settle(st);
    assert.ok(logHas(st, /урон первой атаки снижен на 2/));
});

test('битва: способность сброса игнорируется в первый раз (и до конца хода), жетон сбрасывается', () => {
    const st = game();
    const f = fightWith(st, 'MON-05', [4], { track: true });
    const p = st.players[0];
    f.life.unshift('MON-SPECIAL-01', 'MON-SPECIAL-02');
    step(st, { op: 'dealDamage', fight: 1, n: 2 });
    settle(st);
    assert.ok(logHas(st, /«Подземные ходы» игнорируется/));
    assert.ok(logHas(st, /снова игнорируется в этом ходу/));
    assert.equal(p.vulns.length, 0, 'жетон сброшен');
});

test('битва: первый ход ведьмака — каждая красная +1 урон (в предпросмотре тоже); прогнать = победить; золото за победу', () => {
    const st = game();
    const f = fightWith(st, 'MON-27', [3, 6], { track: true });
    const p = st.players[0];
    const red = [...p.hand, ...p.deck, ...p.discard].find(id => CARDS[id].color === 'red');
    const base = comboTotals({ ...st, fight: { ...f, vt: null } }, p, [red]).dmg;
    assert.equal(comboTotals(st, p, [red]).dmg, base + 1);
    const gold = p.gold;
    f.life = ['MON-ATK-01'];
    step(st, { op: 'dealDamage', fight: 1, n: 1 });
    settle(st);
    assert.equal(p.gold, gold + 2 + 2, '+2 за победу и +2 по уязвимости');
    // Стрыга IV: chased → consequences of a win (a trophy).
    const st2 = game({ seed: 11 });
    const f2 = fightWith(st2, 'MON-13', [4], { track: true });
    const p2 = st2.players[0];
    f2.life = ['MON-ATK-01'];
    p2.hand = []; p2.deck = [];
    step(st2, { op: 'afterWitcherTurn', fight: 1 });
    settle(st2);
    assert.ok(p2.trophies.some(t => t.id === 'MON-13'));
});

test('битва: Главоглаз II — в любой момент сбросить эликсир за верхнюю карту сброса (в лимите алхимии)', () => {
    const st = game();
    const f = fightWith(st, 'MON-01', [2], { track: true, setup: (p) => { p.elixirs.push('POTION-01#1'); p.skills.alchemy = 1; } });
    const p = st.players[0];
    p.discard.push(p.deck.shift());
    const top = p.discard[p.discard.length - 1];
    ok(apply(st, 0, { t: 'vulnElixir', id: 'POTION-01#1' }));
    assert.ok(p.hand.includes(top));
    assert.equal(f.elixirsUsed, 1);
    p.elixirs.push('POTION-02#1'); p.discard.push(p.deck.shift());
    assert.equal(apply(st, 0, { t: 'vulnElixir', id: 'POTION-02#1' }).ok, false, 'лимит алхимии');
});

test('битва: выбор особой атаки после открытия карты (Грифон I), в первый ход монстра не больше 1 урона (Виверна III)', () => {
    let st = game();
    let f = fightWith(st, 'MON-09', [1], { track: true, answers: false });
    f.life.unshift('MON-SPECIAL-04'); f.stage = 'busy';
    step(st, { op: 'monsterTurn', fight: 1 });
    assert.equal(st.prompt.op, 'vtSpChosen');
    ok(apply(st, 0, { t: 'answer', choice: '1' }));
    settle(st);
    assert.equal(st.fight.lastAttack.n, 1);
    assert.ok(logHas(st, /особая атака I «Острый клюв»/));
    st = game();
    f = fightWith(st, 'MON-10', [3], { track: true, setup: (p) => p.elixirs.push('POTION-01#1') });
    assert.equal(f.vt.cap1, 3);
    st.players[0].shield = 0;
    f.life.unshift('MON-ATK-01'); f.stage = 'busy';
    step(st, { op: 'monsterTurn', fight: 1 }); settle(st);
    assert.ok(logHas(st, /не больше 1 урона/) || !logHas(st, /получает [2-9] урона/));
});

test('все 174 уязвимости: битва с каждой проходит до конца без ошибок (игрок соглашается на всё)', () => {
    let fights = 0;
    for (const mon of Object.keys(VULNS)) {
        for (let n = 1; n <= 6; n++) {
            for (const track of [false, true]) {
                const st = game({ seed: 100 + n });
                const f = fightWith(st, mon, [n], { track, setup: (p) => { p.elixirs.push(st.elixirDeck.shift(), st.elixirDeck.shift()); p.gold = 4; p.bombs.push(...st.bombDeck.splice(0, 2)); } });
                if (!f) continue;
                for (let i = 0; i < 400 && st.fight; i++) {
                    settle(st);
                    if (!st.fight) break;
                    const cmd = botCommand(viewFor(st, 0), { options: options(st, 0) });
                    ok(apply(st, 0, cmd));
                }
                assert.ok(!st.fight, `${mon} ${n}: битва не закончилась`);
                fights++;
            }
        }
    }
    assert.equal(fights, 348);
});

test('партии ботов со всеми частями «По следу монстра» доходят до конца; жетоны уязвимостей подбираются', async () => {
    const { playGame } = await import('./sim.mjs');
    let taken = 0;
    for (const players of [1, 2, 3, 4]) {
        const { state } = playGame({ seed: 40 + players, players, exp: TRAIL_ALL, maxSteps: 30000 });
        assert.equal(state.stage, 'over', `${players} игрок(а): партия не закончилась`);
        taken += state.log.filter(l => /берёт жетон уязвимости/.test(l.t)).length;
    }
    assert.ok(taken > 0, 'жетоны подбирались');
    void TERRAINS;
});
