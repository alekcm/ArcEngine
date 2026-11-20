// Exploration slice (База.md pp. 16–17): choice → consequences → quest → event card, gear in
// a fight. Every test drives the real engine through apply().
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, apply, options } from '../shared/engine/core.mjs';
import { ensureExplore } from '../shared/engine/explore.mjs';
import { viewFor } from '../shared/view.mjs';
import { ADJ, LOC } from '../shared/engine/util.mjs';
import { EVENTS, EXPLORE_DECKS } from '../shared/data/events-data.mjs';

function solo(seed = 5) {
    const st = createGame({ seed, players: [{ name: 'P0', school: 'wolf' }] });
    while (st.prompt) apply(st, st.prompt.seat, { t: 'answer', choice: st.prompt.options[0].id });
    return st;
}
/** Put `id` on top of its deck and explore it. */
function exploreCard(st, id) {
    const decks = ensureExplore(st);
    const deck = Object.keys(EXPLORE_DECKS).find(d => EXPLORE_DECKS[d].includes(id));
    decks[deck] = [id, ...decks[deck].filter(x => x !== id)];
    const r = apply(st, 0, { t: 'explore', deck });
    assert.ok(r.ok, r.err);
    return deck;
}
const ok = (r) => assert.ok(r.ok, r.err);

test('исследование (с. 16): карта показывает вступление и варианты А/Б, затем последствия', () => {
    const st = solo();
    exploreCard(st, 'CITY1-01');
    assert.equal(st.prompt.ui, 'event');
    assert.equal(st.prompt.card, 'CITY1-01');
    assert.deepEqual(st.prompt.options.map(o => o.id), ['a', 'b']);
    assert.equal(st.prompt.stage, 'choose');
    st.players[0].gold = 1;
    ok(apply(st, 0, { t: 'answer', choice: 'a' }));
    assert.equal(st.prompt.title, 'Последствия');
    assert.equal(st.prompt.pick, 'a');
    assert.match(st.prompt.effect, /Сбросьте 2 золота/);
    const combat = st.players[0].skills.combat;
    ok(apply(st, 0, { t: 'answer', choice: 'ok' }));
    // «Насколько это возможно»: 1 золото из 2 сбрасывается, навык растёт.
    assert.equal(st.players[0].gold, 0);
    assert.equal(st.players[0].skills.combat, combat + 1);
});

test('стоимость варианта (с. 16): нельзя выбрать вариант, который не можете оплатить полностью', () => {
    const st = solo();
    st.players[0].gold = 0;
    exploreCard(st, 'CONT81-13');
    const b = st.prompt.options.find(o => o.id === 'b');
    assert.equal(b.disabled, true);
    assert.match(b.hint, /золота/);
    const r = apply(st, 0, { t: 'answer', choice: 'b' });
    assert.equal(r.ok, false);
});

test('фаза III: «возьмите на 1 карту больше/меньше» меняет добор этого хода', () => {
    for (const [id, pick, want] of [['CITY1-02', 'b', 4], ['CONT81-13', 'a', 2]]) { // hand 1: draws 2 ± 1
        const st = solo();
        const p = st.players[0];
        p.deck.push(...p.hand.splice(1));
        exploreCard(st, id);
        ok(apply(st, 0, { t: 'answer', choice: pick }));
        ok(apply(st, 0, { t: 'answer', choice: 'ok' }));
        assert.equal(st.prompt.title, 'Фаза III: сброс');
        ok(apply(st, 0, { t: 'answer', ids: [] }));
        assert.equal(st.prompt.title, 'Фаза III: новая карта');
        assert.equal(p.hand.length, want, `${id}: 1 + (2 ${want > 3 ? '+' : '−'} 1)`);
    }
});

test('снаряжение: «Кастет» один раз за битву — сбросить карту и нанести 2 урона', () => {
    const st = solo();
    const p = st.players[0];
    p.gold = 3;
    exploreCard(st, 'CONT81-13');
    ok(apply(st, 0, { t: 'answer', choice: 'b' }));
    ok(apply(st, 0, { t: 'answer', choice: 'ok' }));
    assert.deepEqual(p.gear, ['CONT79-15']);
    assert.equal(p.gold, 2, 'стоимость варианта оплачена');
    // Next turn: walk to a monster and fight.
    while (st.turn.seat !== 0 || st.turn.phase !== 1 || st.prompt) {
        if (st.prompt) ok(apply(st, st.prompt.seat, st.prompt.kind === 'choice' ? { t: 'answer', choice: st.prompt.options.find(o => !o.disabled).id } : { t: 'answer', ids: st.prompt.ids.slice(0, st.prompt.min) }));
        else break;
    }
    const slot = st.slots.find(s => s.mon);
    p.loc = slot.token; st.turn.moved = true;
    ok(apply(st, 0, { t: 'fight' }));
    while (st.prompt) ok(apply(st, st.prompt.seat, st.prompt.kind === 'choice' ? { t: 'answer', choice: st.prompt.options.find(o => !o.disabled).id } : { t: 'answer', ids: st.prompt.ids.slice(0, st.prompt.min) }));
    if (!st.fight || st.fight.stage !== 'witcher') return; // the monster may have opened and ended it
    const act = options(st, 0).fight.active.find(a => a.key === 'CONT79-15');
    assert.ok(act && !act.err, 'кастет доступен в битве');
    const life = st.fight.life.length;
    ok(apply(st, 0, { t: 'active', key: 'CONT79-15' }));
    assert.equal(st.prompt.title, 'Кастет');
    const id = p.hand[0];
    ok(apply(st, 0, { t: 'answer', ids: [id] }));
    assert.ok(p.discard.includes(id));
    assert.equal(st.fight ? st.fight.life.length : 0, Math.max(0, life - 2));
    if (st.fight) assert.match(options(st, 0).fight.active.find(a => a.key === 'CONT79-15').err, /Уже использовано/);
});

test('задание (с. 17): жетон локации нужной местности, выполнение в фазе I, карта события с броском', () => {
    const st = solo();
    const p = st.players[0];
    exploreCard(st, 'CONT81-15');
    ok(apply(st, 0, { t: 'answer', choice: 'a' }));
    ok(apply(st, 0, { t: 'answer', choice: 'ok' }));
    assert.equal(p.quests.length, 1);
    const q = p.quests[0];
    assert.equal(q.event, 'CONT79-41');
    assert.equal(LOC[q.loc].terrain, 'water', 'жетон водной локации');
    assert.equal(viewFor(st, 0).players[0].quests[0].loc, q.loc, 'жетон задания лежит открыто');
    // Complete it: next turn, standing on the location in phase I.
    while (st.prompt) ok(apply(st, 0, st.prompt.kind === 'choice' ? { t: 'answer', choice: st.prompt.options.find(o => !o.disabled).id } : { t: 'answer', ids: st.prompt.ids.slice(0, st.prompt.min) }));
    assert.equal(st.turn.phase, 1);
    p.loc = ADJ[q.loc][0];
    assert.match(options(st, 0).quests[0].err, /Нужно быть/);
    p.loc = q.loc;
    assert.equal(options(st, 0).quests[0].err, null);
    const gold = p.gold;
    ok(apply(st, 0, { t: 'quest', i: 0 }));
    assert.equal(p.quests.length, 0);
    assert.equal(st.prompt.card, 'CONT79-41');
    ok(apply(st, 0, { t: 'answer', choice: 'ok' }));
    assert.match(st.prompt.title, /Бросок кубика: [1-6]/);
    ok(apply(st, 0, { t: 'answer', choice: 'ok' }));
    assert.ok(p.gold >= gold + 2, 'любой исход приносит золото');
    assert.equal(st.turn.phase, 1, 'задание не тратит фазу II');
});

test('«переместитесь в соседнюю локацию без сброса карт, затем можете выполнить её действие»', () => {
    const st = solo();
    const p = st.players[0];
    p.gold = 2;
    const from = p.loc, hand = p.hand.length;
    exploreCard(st, 'CONT81-15');
    ok(apply(st, 0, { t: 'answer', choice: 'b' }));
    ok(apply(st, 0, { t: 'answer', choice: 'ok' }));
    assert.equal(p.gold, 1);
    assert.equal(st.prompt.ui, 'move');
    const to = Number(st.prompt.options[0].id);
    assert.ok(ADJ[from].includes(to));
    ok(apply(st, 0, { t: 'answer', choice: String(to) }));
    assert.equal(p.loc, to);
    assert.equal(p.hand.length, hand, 'карты не сбрасываются');
    assert.ok(st.turn.afterExplore);
    const o = options(st, 0);
    assert.deepEqual(o.phase2.map(x => x.id), ['endExplore']);
    assert.equal(o.moves.length, 0);
    assert.equal(apply(st, 0, { t: 'fight' }).ok, false);
    ok(apply(st, 0, { t: 'endExplore' }));
    assert.notEqual(st.turn.afterExplore && st.turn.phase === 1, true);
});

test('колоды исследования скрыты: в представлении только число карт', () => {
    const st = solo();
    ensureExplore(st);
    const v = viewFor(st, 0);
    assert.equal(typeof v.explore.city, 'number');
    for (const id of Object.values(EXPLORE_DECKS).flat()) assert.ok(EVENTS[id].a && EVENTS[id].b, id);
});

test('карты битвы (срез): «Мощный Аард» → «Блок» → красная — урон, щит по связке, возврат «Блока» в руку', async () => {
    const { comboTotals } = await import('../shared/engine/fight.mjs');
    const { CARDS } = await import('../shared/engine/util.mjs');
    const st = solo();
    const p = st.players[0];
    const red = Object.values(CARDS).find(c => c.color === 'red' && c.fx.dmg && !c.id.startsWith('W-START'));
    // Мощный Аард W-B-11: У1, связь З → Щ1. Блок W-B-01 (зелёный): Щ2, связи Ж/К → вернуть эту.
    const t = comboTotals(st, p, ['W-B-11', 'W-B-01', red.id]);
    assert.equal(t.dmg, 1 + red.fx.dmg, 'урон Аарда + красной');
    assert.equal(t.shield, 2 + 1 + (red.fx.shield || 0), 'Щ2 Блока + Щ1 связи Аарда');
    assert.ok(t.ret.includes('W-B-01'), 'связь К «Блока» возвращает его в руку');
    // Without the red card the Блок link is unused: no return.
    assert.ok(!comboTotals(st, p, ['W-B-11', 'W-B-01']).ret.includes('W-B-01'));
});
