// Цири as a playable hero («Цири и доп. события», p. 4): her board, starter deck, home school
// Каэр Морхен (3) shared with the Wolf, and «Старшая Кровь» — once per fight one card of the
// combo gets a link of any colour whose effect follows the specialization level.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, apply, options, actingSeat, locActionInfo } from '../shared/engine/core.mjs';
import { comboError, comboTotals, linkIndex, bloodError } from '../shared/engine/fight.mjs';
import { viewFor } from '../shared/view.mjs';
import { botCommand, bestCombo } from '../shared/bots.mjs';
import { CARDS } from '../shared/engine/util.mjs';
import { SCHOOLS, SPEC_TABLE } from '../shared/data/rules-data.mjs';
import { playGame } from './sim.mjs';

const ok = (r) => assert.ok(r.ok, r.err);
function game(seed = 3) {
    const st = createGame({ seed, exp: ['ciri'], players: [{ name: 'Цири', school: 'ciri' }, { name: 'Эскель', school: 'wolf', bot: 1 }] });
    while (st.prompt) apply(st, st.prompt.seat, { t: 'answer', choice: st.prompt.options[0].id });
    return st;
}
/** Two hand cards that do not link to each other (in this order). */
function unlinkedPair() {
    const ids = Object.keys(CARDS).filter(id => !id.startsWith('W-START'));
    for (const a of ids) for (const b of ids) if (a !== b && CARDS[a].links.length && linkIndex(CARDS[a], CARDS[b]) < 0) return [a, b];
}
const fightState = (p, extra = {}) => ({ fight: { stage: 'witcher', seat: p.seat, mon: 'MON-01', once: {}, cur: { forcedFirst: null, onlyOne: false, blizzard: false }, ...extra } });

test('Цири: планшет «Дитя Старшей Крови», старт в Каэр Морхене (3), начальная колода W-START-61..70', () => {
    const st = game();
    const c = st.players[0];
    assert.equal(SCHOOLS.ciri.home, 3);
    assert.equal(c.loc, 3);
    const all = [...c.hand, ...c.deck, ...c.discard].sort();
    assert.deepEqual(all, Array.from({ length: 10 }, (_, i) => 'W-START-' + (61 + i)).sort());
    assert.deepEqual(SPEC_TABLE.ciri, [[0, -1], [0, 1], [1, 1], [2, 1], [2, 1]], 'таблица планшета');
});

test('Цири тренирует специализацию в школе Волка (3), но не в чужих школах', () => {
    const st = game();
    const c = st.players[0];
    c.gold = 10; st.turn.moved = true;
    const home = locActionInfo(st, c);
    assert.equal(home.kind, 'school');
    assert.equal(home.choices.find(x => x.id === 'spec').err, null);
    c.loc = SCHOOLS.cat.home;
    const away = locActionInfo(st, c);
    assert.match(away.choices.find(x => x.id === 'spec').err, /своей школе/);
});

test('«Старшая Кровь»: несвязанная пара легальна только через неё; эффект связи по уровню специализации', () => {
    const [a, b] = unlinkedPair();
    const p = { seat: 0, school: 'ciri', hand: [a, b], trophies: [], gear: [], keeps: [], skills: { spec: 1 } };
    const st = fightState(p);
    assert.ok(comboError(st, p, [a, b]), 'без Старшей Крови не соединяется');
    assert.equal(comboError(st, p, [a, b], { blood: 1 }), null);
    assert.ok(comboError(st, p, [a, b], { blood: 0 }), 'связь нужна между двумя картами');
    assert.ok(comboError(st, p, [a, b], { blood: 2 }));
    const base = (CARDS[a].fx.dmg || 0) + (CARDS[b].fx.dmg || 0);
    const baseDraw = (CARDS[a].fx.draw || 0) + (CARDS[b].fx.draw || 0);
    for (let lvl = 1; lvl <= 5; lvl++) {
        p.skills.spec = lvl;
        const t = comboTotals(st, p, [a, b], { blood: 1 });
        assert.equal(t.dmg, base + SPEC_TABLE.ciri[lvl - 1][0], 'урон уровня ' + lvl);
        assert.equal(t.draw, baseDraw + SPEC_TABLE.ciri[lvl - 1][1], 'добор уровня ' + lvl);
        assert.equal(t.blood.color, CARDS[b].color);
    }
    // Once per fight; only Цири.
    st.fight.once.spec = true;
    assert.match(comboError(st, p, [a, b], { blood: 1 }), /уже использована/);
    const wolf = { ...p, school: 'wolf' };
    assert.match(bloodError(fightState(wolf), wolf), /Только у Цири/);
});

/** Drive the game until seat 0 builds a combo in a fight. */
function toWitcherTurn(st) {
    for (let i = 0; i < 200; i++) {
        const f = st.fight;
        if (f && f.seat === 0 && f.stage === 'witcher' && !st.prompt) return true;
        const seat = actingSeat(st);
        const cmd = botCommand(viewFor(st, seat), { options: options(st, seat) });
        ok(apply(st, seat, cmd));
    }
    return false;
}

test('битва Цири: комбинация со Старшей Кровью проходит через движок, второй раз — нельзя', () => {
    const st = game(5);
    const c = st.players[0];
    const slot = st.slots.find(s => s.mon);
    c.loc = slot.token; st.turn.moved = true;
    const [a, b] = unlinkedPair();
    ok(apply(st, 0, { t: 'fight' }));
    assert.ok(toWitcherTurn(st), 'ход Цири в битве');
    c.hand.push(a, b);
    for (const id of [a, b]) { const i = st.actionDeck.indexOf(id); if (i >= 0) st.actionDeck.splice(i, 1); }
    c.skills.spec = 3;
    assert.equal(options(st, 0).fight.blood, null, 'кнопка доступна');
    assert.ok(!apply(st, 0, { t: 'combo', ids: [a, b] }).ok, 'без Старшей Крови — нелегально');
    ok(apply(st, 0, { t: 'combo', ids: [a, b], blood: 1 }));
    assert.ok(st.log.some(l => /Старшая Кровь/.test(l.t)), 'в журнале');
    if (st.fight) {
        assert.equal(st.fight.once.spec, true);
        if (st.fight.stage === 'witcher' || toWitcherTurn(st)) {
            if (st.fight && st.fight.seat === 0) assert.match(options(st, 0).fight.blood, /уже использована/);
        }
    }
});

test('бот за Цири использует Старшую Кровь, когда она даёт выгоду', () => {
    const [a, b] = unlinkedPair();
    const p = { seat: 0, school: 'ciri', hand: [a, b], trophies: [], gear: [], keeps: [], skills: { spec: 5 }, shield: 0 };
    const st = fightState(p);
    const r = bestCombo(st, p, true);
    assert.deepEqual(r.ids.length, 2);
    assert.equal(r.blood, 1);
});

test('партии ботов с Цири на 1–5 игроков: только легальные команды, партии доходят до конца', () => {
    let used = 0;
    for (const n of [1, 2, 3, 5]) {
        for (const seed of [1, 2]) {
            const schools = ['ciri', 'wolf', 'cat', 'bear', 'viper'].slice(0, n);
            const { state } = playGame({ players: n, seed, exp: ['ciri'], schools });
            assert.ok(state.stage === 'over' || state.round > 80, 'партия завершена');
            assert.equal(state.players[0].school, 'ciri');
            used += state.log.filter(l => /Старшая Кровь/.test(l.t)).length;
        }
    }
    assert.ok(used > 0, 'Старшая Кровь используется ботами');
});
