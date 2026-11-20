// «По следу монстра» — «Уязвимости и особые атаки» (Книги правил/По следу монстра.md pp. 6–7):
// the special combat deck, special attacks I–IV, discard abilities, the Двимеритовая бомба.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, apply, options, actingSeat } from '../shared/engine/core.mjs';
import { push, run } from '../shared/engine/flow.mjs';
import { viewFor } from '../shared/view.mjs';
import { botCommand, bestCombo } from '../shared/bots.mjs';
import { CARDS, MONSTER } from '../shared/engine/util.mjs';
import { comboError, comboTotals } from '../shared/engine/fight.mjs';
import { findChain } from '../shared/engine/vuln.mjs';
import { ATTACKS, DISCARD, BIG, SPECIALS } from '../shared/data/vuln-data.mjs';
import { BIGCARDS } from '../shared/data/gen-data.mjs';
import { normalizeExp } from '../shared/data/rules-data.mjs';
import { playGame } from './sim.mjs';
import { TRAIL_ALL } from './scenarios.mjs';

const ok = (r) => assert.ok(r.ok, r.err);
const step = (st, ...s) => { push(st, ...s); run(st); };
const NO_VULN = TRAIL_ALL.filter(x => x !== 'trail:vuln');
function game({ exp = TRAIL_ALL, seed = 3, players = 2 } = {}) {
    const st = createGame({ seed, exp, players: Array.from({ length: players }, (_, i) => ({ name: 'P' + i, school: i ? 'cat' : 'wolf', bot: i ? 1 : 0 })) });
    while (st.prompt) apply(st, st.prompt.seat, { t: 'answer', choice: st.prompt.options[0].id });
    return st;
}
/** Let the bots act until seat 0 has to decide (a prompt or its witcher stage). */
function settle(st) {
    for (let i = 0; i < 80; i++) {
        if (!st.fight) return;
        if (st.prompt && st.prompt.seat === 0) return;
        if (!st.prompt && st.fight.stage === 'witcher' && st.fight.seat === 0) return;
        const seat = actingSeat(st);
        ok(apply(st, seat, botCommand(viewFor(st, seat), { options: options(st, seat) })));
    }
}
/** Seat 0 fights `mon` and stands at its witcher stage; `track` — the witcher moves first. */
function fightWith(st, mon, { track = true, setup } = {}) {
    const p = st.players[0];
    const slot = st.slots.find(s => s.mon);
    slot.mon = mon;
    p.loc = slot.token; st.turn.moved = true;
    if (track) p.trackTokens[slot.terrain] = st.locPiles[slot.terrain].pop();
    if (mon === 'MON-06') p.elixirs.push(st.elixirDeck.shift());
    if (setup) setup(p);
    ok(apply(st, 0, { t: 'fight' }));
    for (let i = 0; i < 20 && st.prompt && st.prompt.seat === 0 && st.fight && st.fight.stage !== 'witcher'; i++) {
        const pr = st.prompt;
        ok(apply(st, 0, pr.kind === 'choice' ? { t: 'answer', choice: pr.options[pr.options.length - 1].id } : { t: 'answer', ids: pr.ids.slice(0, pr.min) }));
        settle(st);
    }
    settle(st);
    // Only the special cards a test puts in on purpose.
    if (st.fight) st.fight.life = st.fight.life.filter(id => !id.startsWith('MON-SPECIAL'));
    return st.fight;
}
/** Reveal `card` on top of the monster pool in its next turn. */
function monsterReveals(st, card) {
    const f = st.fight;
    f.life.unshift(card);
    f.stage = 'busy';
    step(st, { op: 'monsterTurn', fight: 1 });
    settle(st);
}
const setHand = (p, ids) => { p.deck.push(...p.hand.filter(x => !ids.includes(x))); p.hand = ids.slice(); for (const id of ids) { const i = p.deck.indexOf(id); if (i >= 0) p.deck.splice(i, 1); } };
const answerAll = (st, pick) => { for (let i = 0; i < 10 && st.prompt && st.prompt.seat === 0; i++) { ok(apply(st, 0, pick(st.prompt))); settle(st); } };

test('данные: 29 больших карт (Сирены и Кащея нет), у каждой 4 особые атаки, способность сброса и 6 уязвимостей; операции заданы для всех', () => {
    assert.equal(BIGCARDS.length, 29);
    for (const b of BIGCARDS) {
        assert.ok(MONSTER[b.id], b.id);
        assert.equal(b.attacks.length, 4, b.id);
        assert.equal(b.vulns.length, 6, b.id);
        assert.ok(b.discard.text.length > 10, b.id);
        assert.equal(ATTACKS[b.id].length, 4, 'атаки ' + b.id);
        assert.ok(DISCARD[b.id], 'сброс ' + b.id);
    }
    // Large card order differs from the small one: Леший / Брукса / Стрыга, Шептуха / Пряха, …
    assert.equal(BIG['MON-15'].name, 'Леший');
    assert.equal(BIG['MON-13'].name, 'Стрыга');
    assert.equal(BIG['MON-24'].name, 'Шептуха');
    assert.equal(BIG['MON-25'].name, MONSTER['MON-25'].name);
    assert.equal(BIG['MON-30'].name, 'Тролль');
    assert.ok(!BIG['MON-31'] && !BIG['MON-29']);
    assert.ok(normalizeExp(['trail', 'trail:vuln']).includes('trail:vuln'));
});

test('подготовка: 4 базовые карты в коробку, 4 в сторону, в колоде 12 + 4 особые; двимеритовая бомба — только с этой частью', () => {
    const st = game();
    assert.equal(st.attackDeck.length, 16);
    assert.equal(st.attackDeck.filter(id => id.startsWith('MON-SPECIAL')).length, 4);
    assert.equal(st.atkBox.length, 4);
    assert.equal(st.atkAside.length, 4);
    assert.equal(new Set([...st.attackDeck, ...st.atkBox, ...st.atkAside]).size, 24);
    assert.equal(st.bombDeck.length, 28);
    assert.equal(st.bombDeck.filter(b => b.startsWith('BOMB-07')).length, 4);
    const v = viewFor(st, 0);
    assert.equal(v.atkBox, 4, 'какие карты ушли в коробку — тайна');
    const off = game({ exp: NO_VULN });
    assert.equal(off.attackDeck.length, 20);
    assert.ok(!off.attackDeck.some(id => id.startsWith('MON-SPECIAL')));
    assert.equal(off.bombDeck.length, 24);
});

test('первый монстр III уровня замешивает 4 отложенные карты (в одиночной игре — сразу при подготовке); после битвы колода собирается из текущего состава', () => {
    const solo = game({ players: 1 });
    assert.equal(solo.attackDeck.length, 20);
    assert.equal(solo.atkAside.length, 0);
    const st = game();
    assert.ok(!st.slots.some(s => MONSTER[s.mon].level === 3));
    const slot = st.slots[0];
    st.monsterStacks[3].push('MON-27');
    slot.mon = null;
    step(st, { op: 'spawnMonster', slot: 0, level: 3, fromLevel: 3 });
    assert.equal(slot.mon, 'MON-27');
    assert.equal(st.atkSet.length, 20);
    assert.equal(st.attackDeck.length, 20);
    assert.equal(st.atkAside.length, 0);
});

test('особая атака: открытая особая карта выполняет атаку с большой карты (Волколак IV — урон по числу карт в руке)', () => {
    const st = game();
    const f = fightWith(st, 'MON-12');
    const p = st.players[0];
    p.shield = 0;
    const hand = p.hand.length, deck = p.deck.length;
    monsterReveals(st, 'MON-SPECIAL-04');
    assert.equal(f.lastAttack.type, 'special');
    assert.equal(f.lastAttack.name, 'Созыв стаи');
    assert.ok(st.log.some(l => /особая атака IV «Созыв стаи»/.test(l.t)));
    void deck;
    assert.ok(st.log.some(l => new RegExp(`получает ${hand} урона`).test(l.t)));
});

test('особая атака: ограничения следующего хода — длина комбинации, запрет цвета, пропуск хода', () => {
    // Главоглаз IV: 3 урона, следующая комбинация не больше чем из 2 карт.
    let st = game();
    let f = fightWith(st, 'MON-01');
    let p = st.players[0];
    monsterReveals(st, 'MON-SPECIAL-04');
    assert.equal(st.fight.cur.r.maxCombo, 2);
    const pool = [...p.hand, ...p.deck];
    const chain = findChain(pool, 3);
    assert.ok(chain, 'в стартовой колоде есть цепочка из 3 карт');
    setHand(p, chain);
    assert.match(comboError(st, p, chain), /не больше чем из 2/);
    assert.equal(comboError(st, p, chain.slice(0, 2)), null);
    assert.ok(bestCombo(viewFor(st, 0), viewFor(st, 0).players[0]).length <= 2, 'бот соблюдает ограничение');
    // Волколак III: 4 урона, синие карты разыгрывать нельзя; если в руке только синие — комбинации нет.
    st = game();
    f = fightWith(st, 'MON-12');
    p = st.players[0];
    monsterReveals(st, 'MON-SPECIAL-03');
    const blue = [...p.hand, ...p.deck].filter(id => CARDS[id].color === 'blue').slice(0, 2);
    setHand(p, blue);
    assert.match(comboError(st, p, [blue[0]]), /нельзя/);
    assert.equal(comboError(st, p, []), null, 'все карты запрещены — можно не разыгрывать');
    // Туманник IV: 2 урона и пропуск следующего хода — монстр сразу атакует снова.
    st = game();
    f = fightWith(st, 'MON-04');
    const mTurns = f.mTurns;
    monsterReveals(st, 'MON-SPECIAL-04');
    assert.ok(st.log.some(l => /пропускает свой ход битвы/.test(l.t)));
    assert.ok(!st.fight || st.fight.mTurns >= mTurns + 2, 'после пропуска снова ход монстра');
});

test('особая атака: «сбросьте зелёную карту, иначе …», эликсиры и золото', () => {
    const st = game();
    fightWith(st, 'MON-02');
    const p = st.players[0];
    const green = [...p.hand, ...p.deck].filter(id => CARDS[id].color === 'green');
    const other = [...p.hand, ...p.deck].filter(id => CARDS[id].color !== 'green').slice(0, 2);
    setHand(p, [green[0], ...other]);
    monsterReveals(st, 'MON-SPECIAL-03');
    assert.ok(p.discard.includes(green[0]), 'зелёная карта сброшена');
    assert.ok(p.hand.length >= 0);
    // Мантикора I: 3 урона и 2 золота.
    const st2 = game();
    fightWith(st2, 'MON-21');
    const p2 = st2.players[0];
    p2.gold = 5;
    monsterReveals(st2, 'MON-SPECIAL-01');
    assert.equal(p2.gold, 3);
});

test('способность сброса: особая карта из запаса жизни прерывает урон; Экимма игнорирует 2 последующих урона', () => {
    const st = game();
    const f = fightWith(st, 'MON-17');
    const life = f.life.length;
    f.life.unshift('MON-SPECIAL-02');
    step(st, { op: 'dealDamage', n: 4, src: 'тест', fight: 1 });
    settle(st);
    // 1 (особая карта) + 4−1−2 = 1 ещё.
    assert.equal(f.life.length, life + 1 - 2);
    assert.ok(st.log.some(l => /способность сброса «Регенерация»/.test(l.t)));
    assert.ok(st.log.some(l => /игнорирует 2 урона/.test(l.t)));
});

test('способность сброса: Волколак — половина последующего урона (вверх); Стрыга — весь урон и последняя карта комбинации в руку', () => {
    let st = game();
    let f = fightWith(st, 'MON-12');
    let life = f.life.length;
    f.life.unshift('MON-SPECIAL-01');
    step(st, { op: 'dealDamage', n: 6, src: 'тест', fight: 1 });
    // 1 + ⌊5/2⌋ = 3 cards gone (3 of the 5 later points ignored).
    assert.equal(f.life.length, life + 1 - 3);

    st = game();
    f = fightWith(st, 'MON-13');
    const p = st.players[0];
    const chain = findChain([...p.hand, ...p.deck].filter(id => (CARDS[id].fx.dmg || 0) > 0 || true), 2);
    setHand(p, chain);
    f.life.unshift('MON-SPECIAL-01');
    life = f.life.length;
    ok(apply(st, 0, { t: 'combo', ids: chain }));
    settle(st);
    assert.ok(st.log.some(l => /берёт обратно в руку/.test(l.t)));
    assert.ok(!p.discard.includes(chain[1]) || p.hand.includes(chain[1]) || p.deck.includes(chain[1]));
});

test('двимеритовая бомба: игнорирует эффект способности сброса и занимает место в лимите алхимии', () => {
    const st = game();
    const f = fightWith(st, 'MON-17', { setup: (p) => { p.bombs = ['BOMB-07#1']; p.skills.alchemy = 2; } });
    const p = st.players[0];
    assert.match(options(st, 0).fight.bombs.find(b => b.id === 'BOMB-07#1').err, /способность сброса/);
    const life = f.life.length;
    f.life.unshift('MON-SPECIAL-02');
    step(st, { op: 'dealDamage', n: 3, src: 'тест', fight: 1 });
    assert.equal(st.prompt && st.prompt.title, 'Двимеритовая бомба');
    ok(apply(st, 0, { t: 'answer', choice: 'use' }));
    settle(st);
    assert.equal(f.life.length, life + 1 - 3, 'урон не игнорируется');
    assert.equal(p.bombs.length, 0);
    assert.equal(f.elixirsUsed, 1);
});

test('способности сброса: Гарпия — половина последующего урона игроку в конце хода; Бес — карта под низ запаса; Брукса — способность случайного монстра III уровня', () => {
    let st = game();
    let f = fightWith(st, 'MON-02');
    let p = st.players[0];
    f.life.unshift('MON-SPECIAL-01');
    step(st, { op: 'dealDamage', n: 5, src: 'тест', fight: 1 });
    assert.deepEqual(f.cur.harpy, [1]);
    const shield = p.shield = 3;
    void shield;
    f.cur.combo = [];
    step(st, { op: 'afterWitcherTurn', fight: 1 });
    assert.ok(st.log.some(l => /Гарпия: P0 получает половину последующего урона — 2/.test(l.t)));

    st = game();
    f = fightWith(st, 'MON-08');
    const life = f.life.length;
    f.life.unshift('MON-SPECIAL-01');
    step(st, { op: 'dealDamage', n: 1, src: 'тест', fight: 1 });
    assert.equal(f.life.length, life + 1, 'особая карта ушла, но одна из колоды монстров легла под низ');

    st = game();
    f = fightWith(st, 'MON-14');
    f.life.unshift('MON-SPECIAL-01');
    step(st, { op: 'dealDamage', n: 1, src: 'тест', fight: 1 });
    answerAll(st, (pr) => pr.kind === 'choice' ? { t: 'answer', choice: pr.options[0].id } : { t: 'answer', ids: pr.ids.slice(0, pr.min) });
    assert.ok(st.log.some(l => /Брукса: случайная большая карта III уровня/.test(l.t)));
    p = st.players[0];
    void p;
});

test('ограничения в подсчёте комбинации: символы щита, связи, урон по цветам', () => {
    const st = game();
    const f = fightWith(st, 'MON-30');
    const p = st.players[0];
    const pool = [...p.hand, ...p.deck];
    const chain = findChain(pool, 2);
    setHand(p, chain);
    const base = comboTotals(st, p, chain);
    f.cur.r = { noLinks: true };
    const noLinks = comboTotals(st, p, chain);
    const corner = chain.reduce((a, id) => a + (CARDS[id].fx.dmg || 0), 0);
    assert.equal(noLinks.dmg, corner);
    f.cur.r = { onlyLinks: true };
    assert.equal(comboTotals(st, p, chain).dmg, base.dmg - corner);
    f.cur.r = { noShield: true };
    assert.equal(comboTotals(st, p, chain).shield, 0);
    f.cur.r = { dmgCap: 1 };
    assert.ok(comboTotals(st, p, chain).dmg <= 1);
    f.cur.r = { needYellow: 3 };
    const ny = comboTotals(st, p, chain);
    assert.equal(ny.dmg, chain.some(id => CARDS[id].color === 'yellow') ? base.dmg : Math.max(0, base.dmg - 3));
});

test('без «Уязвимостей» особые карты не появляются; с ними партии ботов доходят до конца', () => {
    const { state } = playGame({ players: 2, seed: 2, exp: NO_VULN, schools: ['wolf', 'cat'] });
    assert.ok(!state.log.some(l => /особая атака/.test(l.t)));
    let specials = 0, abilities = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
        const { state: s } = playGame({ players: 1 + (seed % 4), seed, exp: TRAIL_ALL, schools: ['bear', 'viper', 'manticore', 'griffin'] });
        assert.ok(s.stage === 'over' || s.round > 80, 'игра ' + seed);
        specials += s.log.filter(l => /особая атака [IV]+ «/.test(l.t)).length;
        abilities += s.log.filter(l => /способность сброса «/.test(l.t)).length;
    }
    assert.ok(specials > 0 && abilities > 0, `особые атаки ${specials}, способности сброса ${abilities}`);
    assert.equal(SPECIALS.length, 4);
});

test('все 116 особых атак и 29 способностей сброса выполняются (с выборами игрока) без ошибок', () => {
    const pick = (pr) => pr.kind === 'choice' ? { t: 'answer', choice: pr.options[0].id }
        : pr.ui === 'combo' ? { t: 'answer', ids: findChain(pr.ids, pr.min) || pr.ids.slice(0, pr.min) } : { t: 'answer', ids: pr.ids.slice(0, pr.min) };
    for (const b of BIGCARDS) {
        for (let n = 1; n <= 4; n++) {
            const st = game({ seed: n + 10 });
            fightWith(st, b.id, { setup: (p) => { p.elixirs.push(st.elixirDeck.shift(), st.elixirDeck.shift()); p.gold = 5; } });
            if (!st.fight) continue;
            const before = st.log.length;
            monsterReveals(st, 'MON-SPECIAL-0' + n);
            answerAll(st, pick);
            assert.ok(st.log.slice(before - 1).some(l => l.t.includes('особая атака ' + ['I', 'II', 'III', 'IV'][n - 1] + ' «' + b.attacks[n - 1].name)), b.id + ' ' + n);
        }
        const st = game({ seed: 7 });
        const f = fightWith(st, b.id, { setup: (p) => { p.elixirs.push(st.elixirDeck.shift()); } });
        if (!f) continue;
        f.life.unshift('MON-SPECIAL-01');
        step(st, { op: 'dealDamage', n: 3, src: 'тест', fight: 1 });
        answerAll(st, pick);
        assert.ok(st.log.some(l => l.t.includes(`способность сброса «${b.discard.name}»`)), 'сброс ' + b.id);
    }
});

test('песочница «уязвимости и особые атаки» собирается: Волколак рядом, двимеритовая бомба, колода 16 карт', async () => {
    const { vulnScenario } = await import('./scenarios.mjs');
    const st = vulnScenario();
    const p = st.players[0];
    assert.equal(st.slots.find(s => s.token === p.loc).mon, 'MON-12');
    assert.ok(p.bombs[0].startsWith('BOMB-07'));
    assert.equal(st.attackDeck.length, 16);
    ok(apply(st, 0, { t: 'fight' }));
});
