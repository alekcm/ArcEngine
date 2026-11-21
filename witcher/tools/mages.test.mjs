// «Чародеи» (Книги правил/Чародеи.md; Маги/*.md): mage cards and boards, the mage row and the
// same-position rule, the start location, Мудрость and energy, barrier, the card-by-card combo
// with energy payments, the five specializations, the trophies for defeating a mage, bot games.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, apply, options, actingSeat } from '../shared/engine/core.mjs';
import { push, run } from '../shared/engine/flow.mjs';
import { viewFor } from '../shared/view.mjs';
import { botCommand, bestCombo, cardValue } from '../shared/bots.mjs';
import { CARDS, maxShield } from '../shared/engine/util.mjs';
import { comboError, comboTotals } from '../shared/engine/fight.mjs';
import { MAGE_COMMON, MAGE_START, MAGES, MAGE_TROPHIES } from '../shared/data/mages-data.mjs';
import { SCHOOLS, SPEC_TABLE, wtrophyCards, normalizeExp, skillName } from '../shared/data/rules-data.mjs';
import { mageStartLocs } from '../shared/engine/setup.mjs';
import { playGame } from './sim.mjs';

const ok = (r) => assert.ok(r.ok, r.err);
const step = (st, ...s) => { push(st, ...s); run(st); };
const M = ['alzur', 'ardea', 'gehira', 'otar', 'philippa'];
function game({ schools = ['alzur', 'wolf'], seed = 3, bots = true } = {}) {
    const st = createGame({ seed, exp: ['mages'], players: schools.map((school, i) => ({ name: 'P' + i, school, bot: i && bots ? 1 : 0 })) });
    while (st.prompt) apply(st, st.prompt.seat, { t: 'answer', choice: st.prompt.options[0].id });
    return st;
}
function settle(st) {
    for (let i = 0; i < 80; i++) {
        if (!st.fight) return;
        if (st.prompt && st.prompt.seat === 0) return;
        if (!st.prompt && st.fight.stage === 'witcher' && st.fight.seat === 0) return;
        const seat = actingSeat(st);
        ok(apply(st, seat, botCommand(viewFor(st, seat), { options: options(st, seat) })));
    }
}
/** Seat 0 fights `mon` (a track token: the player moves first) and stands at its witcher stage. */
function fightWith(st, mon = 'MON-01', { track = true } = {}) {
    const p = st.players[0];
    const slot = st.slots.find(s => s.mon);
    slot.mon = mon;
    p.loc = slot.token; st.turn.moved = true;
    if (track) p.trackTokens[slot.terrain] = st.locPiles[slot.terrain].pop();
    ok(apply(st, 0, { t: 'fight' }));
    for (let i = 0; i < 20 && st.prompt && st.prompt.seat === 0 && st.fight && st.fight.stage !== 'witcher'; i++) {
        const pr = st.prompt;
        ok(apply(st, 0, pr.kind === 'choice' ? { t: 'answer', choice: pr.options[pr.options.length - 1].id } : { t: 'answer', ids: pr.ids.slice(0, pr.min) }));
        settle(st);
    }
    settle(st);
    if (st.fight) st.fight.life = st.fight.life.filter(id => !id.startsWith('MON-SPECIAL'));
    return st.fight;
}
const setHand = (p, ids) => { p.deck.push(...p.hand.filter(x => !ids.includes(x))); p.hand = ids.slice(); for (const id of ids) { let i = p.deck.indexOf(id); if (i >= 0) p.deck.splice(i, 1); i = p.discard.indexOf(id); if (i >= 0) p.discard.splice(i, 1); } };

test('данные: 90 общих карт, 50 начальных (по 10, по 2 каждого цвета), 5 планшетов, 20 трофеев', () => {
    assert.equal(MAGE_COMMON.length, 90);
    assert.equal(MAGE_START.length, 50);
    for (const m of M) {
        const deck = MAGE_START.filter(c => c.mage === m);
        assert.equal(deck.length, 10, m);
        for (const col of ['blue', 'red', 'green', 'purple', 'yellow']) assert.equal(deck.filter(c => c.color === col).length, 2, m + ' ' + col);
        assert.equal(deck.filter(c => c.terrain === 'joker').length, 1, m);
        assert.ok(SCHOOLS[m].mage && SCHOOLS[m].exp === 'mages');
        assert.equal(SPEC_TABLE[m].length, 5);
        assert.equal(wtrophyCards(m).length, 4);
    }
    assert.equal(MAGE_TROPHIES.length, 20);
    assert.deepEqual(SPEC_TABLE.alzur.map(r => r[0]), [-3, -1, 0, 2, 2]);
    assert.deepEqual(SPEC_TABLE.gehira, [[1, 0], [2, 0], [2, 1], [3, 1], [3, 1]]);
    assert.deepEqual(MAGES.otar.table, [[1, 0], [1, 1], [2, 1], [2, 2], [2, 2]]);
    // M-START-03: no base damage, У3 only for 2 energy; M-START-17: a link of any colour for 1 energy.
    assert.deepEqual(CARDS['M-START-03'].fx, {});
    assert.deepEqual(CARDS['M-START-03'].extra, { cost: 2, fx: { dmg: 3 } });
    assert.deepEqual(CARDS['M-START-17'].extra, { cost: 1, fx: { anyLink: true } });
    assert.ok(normalizeExp(['mages']).includes('mages'));
});

test('подготовка: ряд чародеев над обычным, чародеи выбирают свободную локацию школы с последнего игрока', () => {
    const st = createGame({ seed: 4, exp: ['mages'], players: [{ name: 'A', school: 'ardea' }, { name: 'B', school: 'wolf' }, { name: 'C', school: 'otar' }] });
    assert.equal(st.row.length, 6); assert.equal(st.mrow.length, 6);
    assert.ok(st.row.every(id => !CARDS[id].mageCard));
    assert.ok(st.mrow.every(id => CARDS[id].mageCard));
    assert.ok(st.mrow.slice(3).every(id => CARDS[id].cost === 0), 'три карты стоимости 0 справа');
    assert.equal(st.mactionDeck.length, 90 - 6);
    // Last player (C) chooses first; the wolf's Каэр Морхен is taken.
    assert.equal(st.prompt.seat, 2);
    assert.ok(!st.prompt.options.some(o => o.loc === 3));
    ok(apply(st, 2, { t: 'answer', choice: '17' }));
    assert.equal(st.players[2].loc, 17); assert.equal(st.players[2].home, 17);
    assert.equal(st.prompt.seat, 0);
    assert.ok(!st.prompt.options.some(o => o.loc === 17 || o.loc === 3));
    ok(apply(st, 0, { t: 'answer', choice: '10' }));
    assert.equal(st.players[0].home, 10);
    assert.deepEqual(st.players[0].deck.concat(st.players[0].hand).sort(), MAGE_START.filter(c => c.mage === 'ardea').map(c => c.id).sort());
    assert.equal(st.stage, 'turn');
    // All mages: the mage row lies in the normal places, the normal cards are boxed.
    const all = createGame({ seed: 5, exp: ['mages'], players: M.slice(0, 3).map((school, i) => ({ name: 'M' + i, school, bot: 1 })) });
    assert.ok(!all.mrow);
    assert.ok(all.row.every(id => CARDS[id].mageCard));
    assert.ok(all.actionDeck.every(id => CARDS[id].mageCard));
    assert.equal(new Set(all.players.map(p => p.home)).size, 3);
    for (const p of all.players) assert.ok([1, 3, 10, 15, 17].includes(p.home));
    assert.equal(mageStartLocs(all).length, 2);
});

test('фаза III: чародей берёт из своего ряда, карта той же позиции другого ряда уходит из игры, оба ряда пополняются', () => {
    const st = game({ schools: ['alzur', 'wolf'], bots: false });
    const p = st.players[0];
    st.turn.phase = 3;
    p.hand = [];
    const mageCard = st.mrow[5], normal = st.row[5];
    const deckBefore = st.mactionDeck.length;
    step(st, { op: 'p3buyAsk' });
    assert.equal(st.prompt.row, 'mrow');
    assert.ok(st.prompt.options.every(o => CARDS[st.mrow[Number(o.id)]].mageCard));
    ok(apply(st, 0, { t: 'answer', choice: '5' }));
    assert.ok(p.hand.includes(mageCard));
    assert.ok(st.removedRow.includes(normal));
    assert.ok(st.row.every(Boolean) && st.mrow.every(Boolean));
    assert.equal(st.mactionDeck.length, deckBefore - 1);
});

test('мудрость и энергия: максимум вне битвы — мудрость, в битве — 4; повышение мудрости даёт энергию; урон идёт мимо энергии', () => {
    const st = game();
    const p = st.players[0];
    assert.equal(skillName(p, 'defense'), 'Мудрость');
    assert.equal(maxShield(st, p), 1);
    p.shield = 0;
    step(st, { op: 'raiseSkill', seat: 0, skill: 'defense' });
    assert.equal(p.skills.defense, 2); assert.equal(p.shield, 1);
    fightWith(st);
    assert.equal(maxShield(st, p), 4);
    p.shield = 2;
    const deck = p.deck.length;
    st.fight.turn = 'monster';
    step(st, { op: 'hurtWitcher', fight: 1, n: 2 });
    assert.equal(p.shield, 2, 'энергия не понижается уроном');
    assert.equal(p.deck.length, deck - 2);
    st.fight.turn = 'witcher';
});

test('барьер снижает урон хода монстра и обнуляется в конце его хода', () => {
    const st = game();
    const p = st.players[0];
    fightWith(st);
    p.barrier = 3;
    st.fight.turn = 'monster';
    const deck = p.deck.length;
    step(st, { op: 'hurtWitcher', fight: 1, n: 2 });
    assert.equal(p.deck.length, deck, 'урон 2 поглощён');
    assert.equal(p.barrier, 1);
    // Discards are not damage: the barrier does not stop them.
    step(st, { op: 'afterMonsterTurn', fight: 1 });
    assert.equal(p.barrier, 0);
});

test('комбинация чародея: по порядку, энергия меняется по ходу; доплата за доп. эффект; связь «вернуть эту»', () => {
    const st = game();
    const p = st.players[0];
    fightWith(st);
    p.shield = 0;
    setHand(p, ['M-START-01', 'M-START-03']);
    // Круг воды: energy +2 → Сгусток силы pays 2 for 3 damage; the red link returns Круг воды.
    assert.match(comboError(st, p, ['M-START-03', 'M-START-01'], { pay: [0] }) || '', /энерги/);
    assert.equal(comboError(st, p, ['M-START-01', 'M-START-03'], { pay: [1] }), null);
    const t = comboTotals(st, p, ['M-START-01', 'M-START-03'], { pay: [1] });
    assert.equal(t.dmg, 3); assert.equal(t.energyEnd, 0); assert.deepEqual(t.ret, ['M-START-01']);
    const n0 = st.log.length;
    ok(apply(st, 0, { t: 'combo', ids: ['M-START-01', 'M-START-03'], pay: [1] }));
    const lines = st.log.slice(n0).map(l => l.t);
    assert.ok(lines.some(t => /наносит 3 урона/.test(t)), lines.join('\n'));
    assert.ok(lines.some(t => /\(доп\. эффект\): урон 3/.test(t)));
    assert.ok(p.hand.includes('M-START-01') || !st.fight, 'Круг воды вернулся в руку');
});

test('связь любого цвета — только за энергию; «урон = энергия» и «барьер = энергия» читают энергию в момент карты; добор + энергия — на этапе 4', () => {
    const st = game({ schools: ['philippa', 'wolf'] });
    const p = st.players[0];
    fightWith(st);
    p.shield = 1;
    setHand(p, ['M-START-17', 'M-START-34']);
    assert.match(comboError(st, p, ['M-START-17', 'M-START-34']) || '', /за энергию/);
    assert.equal(comboError(st, p, ['M-START-17', 'M-START-34'], { pay: [0] }), null);
    p.shield = 0;
    assert.match(comboError(st, p, ['M-START-17', 'M-START-34'], { pay: [0] }) || '', /Не хватает энергии/);
    // Энергия 3: M-A-33 (барьер 1, за 2 энергии урон = энергия) → 1 урон после оплаты.
    p.shield = 3;
    const a = comboTotals(st, p, ['M-A-33'], { pay: [0] });
    assert.equal(a.dmg, 1); assert.equal(a.barrier, 1); assert.equal(a.energyEnd, 1);
    const b = comboTotals(st, p, ['M-A-12'], {});
    assert.equal(b.barrier, 3);
    // Д+Э: +energy cards at the end of the turn.
    setHand(p, ['M-B-42']);
    p.shield = 2;
    const hand0 = p.hand.length;
    const deck0 = p.deck.length;
    ok(apply(st, 0, { t: 'combo', ids: ['M-B-42'] }));
    const drawn = deck0 - p.deck.length;
    assert.equal(drawn, 1 + 2, 'сражение 1 + энергия 2');
    assert.ok(hand0 >= 1);
});

test('Кащей (MON-29): доп. эффекты фиолетовых карт недоступны', () => {
    const st = game();
    const p = st.players[0];
    fightWith(st, 'MON-29');
    p.shield = 2;
    setHand(p, ['M-START-06']);
    assert.match(comboError(st, p, ['M-START-06'], { pay: [0] }) || '', /не действует/);
    assert.equal(comboTotals(st, p, ['M-START-06']).draw, 0);
});

test('специализации: Молнии, Левитация, Некромантия, Телепортация (первый ход), Полиморфизм', () => {
    // Альзур: −1 energy, die + modifier.
    let st = game({ schools: ['alzur', 'wolf'] });
    let p = st.players[0];
    fightWith(st);
    p.shield = 0;
    assert.match(options(st, 0).fight.spec || '', /энерги/);
    p.shield = 2; p.skills.spec = 4;
    ok(apply(st, 0, { t: 'spec' }));
    settle(st);
    assert.equal(p.shield, 1);
    assert.ok(st.fight.once.spec);
    assert.ok(st.log.some(l => /Молнии/.test(l.t)));
    // Ардея: +1 energy, 0 cards at level I.
    st = game({ schools: ['ardea', 'wolf'] }); p = st.players[0];
    fightWith(st); p.shield = 0;
    const h = p.hand.length;
    ok(apply(st, 0, { t: 'spec' })); settle(st);
    assert.equal(p.shield, 1); assert.equal(p.hand.length, h);
    // Гехира: discard 1 → 1 damage at level I.
    st = game({ schools: ['gehira', 'wolf'] }); p = st.players[0];
    fightWith(st);
    const life = st.fight.life.length, hand = p.hand.length;
    ok(apply(st, 0, { t: 'spec' }));
    if (st.prompt && st.prompt.seat === 0) ok(apply(st, 0, { t: 'answer', ids: [st.prompt.ids[0]] }));
    settle(st);
    assert.equal(p.hand.length, hand - 1); assert.equal(st.fight.life.length, life - 1);
    // Отар: only in the first fight turn; barrier 1.
    st = game({ schools: ['otar', 'wolf'] }); p = st.players[0];
    fightWith(st);
    assert.equal(st.fight.wTurns, 1);
    ok(apply(st, 0, { t: 'spec' })); settle(st);
    assert.equal(p.barrier, 1);
    // Филиппа: a form by the die (the result 1+ always opens Кошка at level III).
    st = game({ schools: ['philippa', 'wolf'] }); p = st.players[0];
    p.skills.spec = 3;
    fightWith(st);
    ok(apply(st, 0, { t: 'spec' }));
    if (st.prompt && st.prompt.seat === 0) ok(apply(st, 0, { t: 'answer', choice: st.prompt.options[0].id }));
    settle(st);
    assert.ok(st.fight.once.philForm);
});

test('трофей за чародея: победитель битвы получает MAGE-TROPHY, эффект трофея Отара — щит −1 → барьер 2', () => {
    const st = game({ schools: ['wolf', 'otar'] });
    const a = st.players[0], d = st.players[1];
    d.loc = a.loc = 2; st.turn.moved = true;
    step(st, { op: 'duelStart', seat: 0, target: 1 });
    st.fight.loser = 1;
    st.queue = st.queue.filter(s => !s.fight);
    st.prompt = null;
    step(st, { op: 'duelConsequences' });
    for (let i = 0; i < 10 && st.prompt; i++) apply(st, st.prompt.seat, st.prompt.kind === 'choice' ? { t: 'answer', choice: st.prompt.options[0].id } : { t: 'answer', ids: st.prompt.ids.slice(0, st.prompt.min) });
    const tr = a.trophies.find(t => t.kind === 'witcher' && t.id === 'otar');
    assert.ok(tr, 'трофей Отара');
    assert.ok(/^MAGE-TROPHY-1[3-6]$/.test(tr.card), tr.card);
});

test('боты: партии только чародеев и смешанные доигрываются; бот платит энергией за доп. эффекты', () => {
    let paid = 0;
    for (let seed = 1; seed <= 4; seed++) {
        for (const schools of [M.slice(0, 3), ['wolf', M[seed % 5], 'cat', M[(seed + 2) % 5]]]) {
            const { state } = playGame({ players: schools.length, seed, schools, exp: ['mages'] });
            assert.ok(state.stage === 'over' || state.round > 80, 'партия закончилась');
            paid += state.log.filter(l => /\(доп\. эффект\)/.test(l.t)).length;
        }
    }
    assert.ok(paid > 0, 'доп. эффекты разыгрывались');
    const st = game({ schools: ['alzur', 'wolf'] });
    const p = st.players[0];
    fightWith(st);
    p.shield = 0;
    setHand(p, ['M-START-01', 'M-START-03']);
    const ids = bestCombo(viewFor(st, 0), viewFor(st, 0).players[0]);
    assert.deepEqual([...ids], ['M-START-01', 'M-START-03']);
    assert.deepEqual(ids.pay, [1]);
});

// ---- Кащей (Набор монстров; Монстры/Кащей.md) -------------------------------------------------
const KX = ['mages', 'mages:koshchei', 'trail', 'trail:vuln'];
function kGame(schools = ['wolf', 'cat'], seed = 3) {
    const st = createGame({ seed, exp: KX, players: schools.map((school, i) => ({ name: 'P' + i, school, bot: i ? 1 : 0 })) });
    while (st.prompt) apply(st, st.prompt.seat, { t: 'answer', choice: st.prompt.options[0].id });
    return st;
}
/** Seat 0 fights Кащей with vulnerability tokens `ns`; its own prompts take the first option. */
function kFight(st, ns = [], setup) {
    const p = st.players[0];
    const slot = st.slots.find(s => s.mon);
    slot.mon = 'MON-29';
    p.loc = slot.token; st.turn.moved = true;
    p.vulns = ns.map(n => ({ terrain: slot.terrain, n }));
    if (setup) setup(p);
    ok(apply(st, 0, { t: 'fight' }));
    for (let i = 0; i < 40 && st.fight; i++) {
        if (st.prompt && st.prompt.seat === 0) { const pr = st.prompt; ok(apply(st, 0, pr.kind === 'choice' ? { t: 'answer', choice: pr.options.find(o => !o.disabled).id } : { t: 'answer', ids: pr.ids.slice(0, Math.max(pr.min, 0)) })); continue; }
        if (!st.prompt && st.fight.stage === 'witcher' && st.fight.seat === 0) break;
        const seat = actingSeat(st);
        ok(apply(st, seat, botCommand(viewFor(st, seat), { options: options(st, seat) })));
    }
    if (st.fight) st.fight.life = st.fight.life.filter(id => !id.startsWith('MON-SPECIAL'));
    return st.fight;
}
const logHas = (st, re) => st.log.some(l => re.test(l.t));

test('Кащей: только с «Чародеями» и отдельной галочкой; в стопке III уровня; большая карта из md', async () => {
    assert.deepEqual(normalizeExp(['mages:koshchei']), []);
    assert.ok(normalizeExp(['mages', 'mages:koshchei']).includes('mages:koshchei'));
    const { BIG, ATTACKS, DISCARD, VULNS, vulnWindow } = await import('../shared/data/vuln-data.mjs');
    assert.equal(BIG['MON-29'].attacks.length, 4);
    assert.equal(BIG['MON-29'].discard.name, 'Хитиновый панцирь');
    assert.equal(BIG['MON-29'].vulns.length, 6);
    assert.equal(ATTACKS['MON-29'].length, 4);
    assert.deepEqual(DISCARD['MON-29'], { poolBottom: 1 });
    assert.deepEqual(VULNS['MON-29'].map(o => vulnWindow(o[0])), ['fight', 'pre', 'fight', 'post', 'fight', 'm1']);
    const all = (st) => [...Object.values(st.monsterStacks).flat(), ...st.slots.map(s => s.mon), ...(st.extraStack || []), ...(st.pendingMons || [])];
    for (let seed = 1; seed <= 3; seed++) {
        assert.ok(all(createGame({ seed, exp: ['mages', 'mages:koshchei'], players: [{ name: 'A', school: 'wolf' }, { name: 'B', school: 'cat' }] })).includes('MON-29'));
        assert.ok(!all(createGame({ seed, exp: ['mages'], players: [{ name: 'A', school: 'wolf' }, { name: 'B', school: 'cat' }] })).includes('MON-29'));
    }
});

test('Кащей, особые атаки I и IV: урон синих карт и синих связей / углов красных карт игнорируется в следующий ход', () => {
    const st = kGame();
    const p = st.players[0];
    kFight(st);
    const blue = Object.keys(CARDS).find(id => CARDS[id].color === 'blue' && !CARDS[id].mageCard && CARDS[id].fx.dmg >= 1 && !CARDS[id].any);
    const red = Object.keys(CARDS).find(id => CARDS[id].color === 'red' && !CARDS[id].mageCard && CARDS[id].fx.dmg >= 1 && !CARDS[id].any);
    const base = comboTotals(st, p, [blue]).dmg;
    assert.ok(base >= 1);
    st.fight.cur.r = { noDmgBlue: true };
    assert.equal(comboTotals(st, p, [blue]).dmg, 0);
    assert.equal(comboTotals(st, p, [red]).dmg, CARDS[red].fx.dmg);
    st.fight.cur.r = { noDmgRed: true };
    assert.equal(comboTotals(st, p, [red]).dmg, 0);
    assert.equal(comboTotals(st, p, [blue]).dmg, base);
    // A mage: the energy-paid extra of a red card is a red corner too.
    const m = kGame(['alzur', 'wolf']);
    const q = m.players[0];
    kFight(m);
    q.shield = 2;
    m.fight.cur.r = { noDmgRed: true };
    assert.equal(comboTotals(m, q, ['M-START-03'], { pay: [0] }).dmg, 0);
    m.fight.cur.r = {};
    assert.equal(comboTotals(m, q, ['M-START-03'], { pay: [0] }).dmg, 3);
});

test('Кащей, уязвимости ведьмака: II Пурга, IV — 4 карты колоды, VI барьер 2, I щит +2 за жёлтую, V 2 урона за комбинацию из 1 карты', () => {
    const st = kGame();
    const p = st.players[0];
    const elix = p.elixirs.length;
    kFight(st, [1, 2, 4, 5, 6]);
    assert.ok(logHas(st, /эликсир «Пурга» из колоды/));
    assert.ok(p.elixirs.length > elix);
    // VI: before the first monster turn; I + V: a single yellow card.
    const y = Object.keys(CARDS).find(id => CARDS[id].color === 'yellow' && !CARDS[id].mageCard && !CARDS[id].any && CARDS[id].fx.shield == null && !CARDS[id].fx.dmg);
    setHand(p, [y, ...p.deck.slice(0, 2)]);
    p.shield = 0;
    const n0 = st.log.length;
    ok(apply(st, 0, { t: 'combo', ids: [y] }));
    const lines = st.log.slice(n0).map(l => l.t).join('\n');
    assert.match(lines, /жёлтая карта — щит \+2/, lines);
    assert.match(lines, /комбинация из 1 карты — 2 урона/);
    assert.ok(logHas(st, /барьер \+2 \(\d\) \(уязвимость VI\)/), 'VI: барьер до первого хода монстра');
    // Once per fight.
    assert.ok(st.fight.vt.kYellowUsed && st.fight.vt.kOneUsed);
});

test('Кащей, уязвимости кнопкой: III щит −1 → 2 урона; у чародея I — кубик, V — энергия −1 → 1 урон, IV — 2 карты', () => {
    let st = kGame();
    let p = st.players[0];
    kFight(st, [3]);
    p.shield = 1;
    let acts = options(st, 0).fight.vulnActs;
    assert.equal(acts.length, 1);
    assert.equal(acts[0].err, null);
    const life = st.fight.life.length;
    ok(apply(st, 0, { t: 'vulnAct', i: 0 }));
    assert.equal(p.shield, 0);
    assert.equal(st.fight.life.length, life - 2);
    assert.match(options(st, 0).fight.vulnActs[0].err, /Уже/);
    // A mage.
    st = kGame(['otar', 'wolf']); p = st.players[0];
    const hand0 = () => p.hand.length;
    kFight(st, [1, 4, 5]);
    assert.ok(logHas(st, /Уязвимость IV: \+2 карт/));
    acts = options(st, 0).fight.vulnActs;
    assert.equal(acts.length, 2);
    assert.ok(acts.some(a => /кубик/.test(a.label)) && acts.some(a => /энергия −1 → 1 урона/.test(a.label)));
    const die = acts.find(a => /кубик/.test(a.label));
    ok(apply(st, 0, { t: 'vulnAct', i: die.i }));
    assert.ok(logHas(st, /Уязвимость I: бросок \d/));
    assert.ok(hand0() >= 0);
});

test('трофей «Кащей»: перед первым ходом монстра — барьер 3 (раз за битву); боты доигрывают партии с Кащеем', () => {
    const st = kGame();
    const p = st.players[0];
    p.trophies.push({ kind: 'monster', id: 'MON-29' });
    kFight(st);
    p.hand = p.hand.slice(0, 1);
    ok(apply(st, 0, { t: 'combo', ids: [p.hand[0]] }));
    assert.ok(logHas(st, /барьер \+3 \(3\) \(трофей «Кащей»\)/));
    for (let seed = 1; seed <= 3; seed++) {
        const { state } = playGame({ players: 3, seed, schools: ['wolf', 'alzur', 'cat'], exp: KX });
        assert.ok(state.stage === 'over' || state.round > 80);
    }
});

test('личные карты чародеев («Уникальные действия»): 11-я карта колоды и их особые эффекты', () => {
    const uq = createGame({ seed: 5, exp: ['mages', 'trail', 'trail:unique'], players: [{ name: 'A', school: 'gehira' }, { name: 'B', school: 'wolf', bot: 1 }] });
    const all = (p) => [...p.hand, ...p.deck, ...p.discard];
    assert.ok(all(uq.players[0]).includes('MAGE-UNIQUE-05'));
    assert.equal(all(uq.players[0]).length, 11);
    assert.ok(!all(game().players[0]).some(id => id.startsWith('MAGE-UNIQUE')));
    // 01 «Скопление силы» (Альзур): +1 урон и +1 барьер, пока энергия в этой комбинации не тратилась.
    let st = game({ schools: ['alzur', 'wolf'] }); let p = st.players[0];
    fightWith(st); p.shield = 3;
    const t1 = comboTotals(st, p, ['MAGE-UNIQUE-01']);
    assert.equal(t1.dmg, 1); assert.equal(t1.barrier, 3);
    // M-START-03 (У3 за 2 энергии) первой: потратили — бонуса нет. Её связь должна вести к красной.
    const lead = MAGE_START.find(c => c.extra && c.links.some(l => l.color === 'red'));
    const t2 = comboTotals(st, p, [lead.id, 'MAGE-UNIQUE-01'], { pay: [0] });
    assert.equal(t2.byCard['MAGE-UNIQUE-01'] || 0, 0);
    const t3 = comboTotals(st, p, [lead.id, 'MAGE-UNIQUE-01']);
    assert.equal(t3.byCard['MAGE-UNIQUE-01'], 1);
    // 03 «Взрыв силы» (Ардея): вся энергия (≥3) → +3 урона.
    assert.deepEqual(CARDS['MAGE-UNIQUE-03'].extra, { cost: 3, all: true, fx: { dmg: 3 } });
    p.shield = 4;
    const b = comboTotals(st, p, ['MAGE-UNIQUE-03'], { pay: [0] });
    assert.equal(b.dmg, 4); assert.equal(b.energyEnd, 0);
    p.shield = 2;
    assert.match(comboTotals(st, p, ['MAGE-UNIQUE-03'], { pay: [0] }).mageErr || '', /не меньше 3/);
    // 04 «Отъём силы» (Отар): 3 символа барьера в комбинации → энергия +3.
    p.shield = 0;
    // M-A-15 (Б2) → «Отъём силы» → M-A-41 (зелёная, Б1): 3 символа барьера.
    const d = comboTotals(st, p, ['M-A-15', 'MAGE-UNIQUE-04', 'M-A-41']);
    assert.equal(d.barrierSym, 3);
    assert.equal(d.energyEnd, 3);
    assert.equal(comboTotals(st, p, ['M-A-15', 'MAGE-UNIQUE-04']).energyEnd, 0);
    const d0 = comboTotals(st, p, ['MAGE-UNIQUE-04']);
    assert.equal(d0.energyEnd, 0);
    // 02 «Трансформация» (Филиппа): связи всех цветов после Кошки/Совы.
    const next = 'M-START-01';
    assert.ok(comboTotals(st, p, ['MAGE-UNIQUE-02', next]).mageErr);
    st.fight.once.philForm = 'owl';
    assert.equal(comboTotals(st, p, ['MAGE-UNIQUE-02', next]).mageErr, null);
});

test('«Тёмный транс»: после «Некромантии» Гехира разыгрывает его без комбинации', () => {
    const st = game({ schools: ['gehira', 'wolf'] }); const p = st.players[0];
    fightWith(st, 'MON-01');
    setHand(p, ['MAGE-UNIQUE-05', 'M-START-21', 'M-START-22']);
    p.discard.push('M-START-23');
    const before = st.fight.cur.drawMod;
    ok(apply(st, 0, { t: 'spec' }));
    assert.equal(st.prompt.op, 'gehiraDo');
    ok(apply(st, 0, { t: 'answer', ids: ['M-START-21'] }));
    assert.equal(st.prompt.op, 'tranceDo');
    ok(apply(st, 0, { t: 'answer', choice: 'yes' }));
    assert.ok(p.hand.includes('M-START-21'), 'верхняя карта сброса — сброшенная «Некромантией»');
    assert.ok(p.discard.includes('MAGE-UNIQUE-05') && !p.hand.includes('MAGE-UNIQUE-05'));
    assert.equal(st.fight.cur.drawMod, before + 2);
});

test('Гюнтер О’Дим I «Управление временем»: чародей теряет весь барьер вместо энергии', () => {
    const st = game({ schools: ['otar', 'wolf'] }); const p = st.players[0];
    fightWith(st, 'MON-01');
    p.shield = 3; p.barrier = 4;
    step(st, { op: 'spOp', fight: 1, o: { k: 'shield0', mageBarrier: true } });
    assert.equal(p.barrier, 0); assert.equal(p.shield, 3);
    const w = game({ schools: ['wolf', 'cat'] }); const q = w.players[0];
    fightWith(w, 'MON-01');
    q.shield = 2;
    step(w, { op: 'spOp', fight: 1, o: { k: 'shield0', mageBarrier: true } });
    assert.equal(q.shield, 0);
});

test('боты-чародеи: энергия вне комбинации — «Молнии» и «энергия → урон» Кащея, только если комбинация не теряет больше', () => {
    // «M-START-03»: no base damage, 3 damage for 2 energy — with energy 2 the die (level I: 1/3 damage)
    // would leave the extra unpaid.
    const st = game({ schools: ['alzur', 'wolf'] });
    const p = st.players[0];
    fightWith(st);
    setHand(p, ['M-START-03']);
    p.shield = 2; p.skills.spec = 1;
    let cmd = botCommand(viewFor(st, 0), { options: options(st, 0) });
    assert.equal(cmd.t, 'combo');
    assert.deepEqual(cmd.pay, [0], 'энергия идёт на доплату «У3»');
    // Level IV (+2 to the die: 2⅓ damage on average) and spare energy — the die first.
    p.shield = 4; p.skills.spec = 4;
    cmd = botCommand(viewFor(st, 0), { options: options(st, 0) });
    assert.deepEqual(cmd, { t: 'spec' });
    // Кащей V: «энергия −1 → 1 урон» — not with the last 2 energy needed for the extra.
    const k = kGame(['otar', 'wolf']); const q = k.players[0];
    kFight(k, [5]);
    setHand(q, ['M-START-03']);
    k.fight.once.spec = 1;
    q.shield = 2;
    cmd = botCommand(viewFor(k, 0), { options: options(k, 0) });
    assert.equal(cmd.t, 'combo');
    q.shield = 4;
    cmd = botCommand(viewFor(k, 0), { options: options(k, 0) });
    assert.equal(cmd.t, 'vulnAct');
});

test('боты-чародеи: ценность карты — урон и барьер, а не энергия и добор (подгонка по битвам ботов)', () => {
    // Зовущая вода (1 урон, барьер 2) > Буря силы (2 урона) > Змеиный мираж (1 урон, добор, 4 связи)
    // > Сила жизни (энергия 3) > Сила вод (барьер = энергии).
    const order = ['M-A-15', 'M-B-40', 'M-B-24', 'M-B-02', 'M-A-12'].map(cardValue);
    for (let i = 1; i < order.length; i++) assert.ok(order[i - 1] > order[i], `${i}: ${order}`);
    // Witcher cards keep their old value.
    assert.equal(cardValue('W-A-01'), 3 + 1.5 + 0);
});

test('боты: трофей Цири в комбинации — у ведьмака и у чародея, раз за битву', () => {
    for (const [school, pair] of [['wolf', ['W-A-01', 'W-A-19']], ['alzur', ['M-A-11', 'M-B-40']]]) {
        const st = game({ schools: [school, 'cat'] });
        const p = st.players[0];
        p.trophies.push({ kind: 'witcher', id: 'ciri', card: 'WITCHER-TROPHY-25' });
        fightWith(st);
        st.fight.once.spec = true;   // no specialization in the way
        setHand(p, pair);
        assert.ok(comboError(st, p, pair), `${school}: без трофея карты не соединяются`);
        assert.equal(options(st, 0).fight.wlink, null);
        const cmd = botCommand(viewFor(st, 0), { options: options(st, 0) });
        assert.deepEqual([cmd.t, cmd.ids, cmd.wlink], ['combo', pair, 1], school);
        ok(apply(st, 0, cmd));
        assert.ok(st.fight.once.wCiri, `${school}: трофей отмечен использованным`);
        assert.match(st.log.map(l => l.t).join('\n'), /трофей Цири/);
        // Used: the next turn the bot no longer counts on it.
        settle(st);
        assert.ok(st.fight && st.fight.stage === 'witcher' && st.fight.seat === 0, `${school}: битва продолжается`);
        {
            setHand(p, pair);
            assert.ok(options(st, 0).fight.wlink);
            const again = botCommand(viewFor(st, 0), { options: options(st, 0) });
            assert.equal(again.wlink, undefined);
            assert.equal(again.ids.length, 1);
        }
    }
});
