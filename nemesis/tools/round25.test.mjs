// round25.test.mjs — Р.25: компьютер как точка на карте.
//   node --test nemesis/tools/round25.test.mjs
// The complaint: the Computer was only reachable from the action panel. A click on the console in
// the room has to open the three actions of the face-up Computer card under the header
// «Выберите компьютерное действие:», and an option that costs a card asks for that card next.
// The 3D half of the round (bloom, label size, colour overlay, the click box itself) is pinned in
// scene.test.mjs — SCN-13..16.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../shared/engine/setup.mjs';
import { answer, next, run } from '../shared/engine/core.mjs';

function fresh() {
    const state = createGame({
        seed: 'round-25', mode: 'original', draft: false,
        players: [{ name: 'P0', charId: 'soldier' }, { name: 'P1', charId: 'scout' }],
    });
    state.queue = []; state.prompt = null; state.resume = null; state.result = null;
    state.phase = 'player'; state.current = 0; state.firstPlayer = 0;
    state.seating = state.players.map(p => p.id); state.turnCursor = 0; state.actionsLeft = 2;
    state.adaptations = []; state.intruders = {}; state.fx = [];
    state.players.forEach((p, i) => {
        p.hand = [p.charId + '.rest#0', p.charId + '.search#0', p.charId + '.demolition#0'];
        p.deck = Array.from({ length: 10 }, (_, k) => p.charId + '.search#' + (k + 10));
        p.discard = []; p.wounds = []; p.health = 10; p.larva = false;
        p.room = i ? '003' : '006'; p.status = 'active'; p.passed = false;
    });
    // 006 has a Computer; the card on the table decides which three actions are on offer.
    state.roomState['006'].explored = true;
    state.roomState['006'].tile = 'comms';
    state.secret.tiles['006'] = 'comms';
    state.computerCard = 'actionB';
    state.computerDeck = ['actionA', 'actionC', 'actionD', 'actionE'];
    state.computerDiscard = [];
    return state;
}
const execute = (state, step) => { next(state, step); run(state); };
const choose = (state, value) => {
    assert.ok(state.prompt, 'ожидается промпт, на который можно ответить');
    assert.equal(answer(state, state.prompt.player, state.prompt.id, value), true);
};

test('R25-01: the Computer asks «Выберите компьютерное действие:» with the three options of the card', () => {
    const s = fresh();
    execute(s, { op: 'computer.start', player: 0 });
    assert.equal(s.prompt.kind, 'choice');
    assert.equal(s.prompt.title, 'Выберите компьютерное действие:');
    assert.match(s.prompt.text || '', /Действие B/, 'название карты остаётся в подписи окна');
    assert.deepEqual(s.prompt.options.map(o => o.id), ['know', 'heal', 'fixComp']);
    assert.deepEqual(s.prompt.options.filter(o => o.disabled).map(o => o.id), ['fixComp'], 'поломки нет — только fixComp закрыт');
});

test('R25-02: a click on the console names the action — no list, straight to the effect', () => {
    const s = fresh(), p = s.players[0];
    p.health = 5;
    execute(s, { op: 'computer.start', player: 0, pick: 'heal' });
    assert.equal(p.health, 6, 'вариант выполнен сразу');
    assert.equal(s.prompt.kind, 'turn', 'списка не было — сразу следующий выбор действия');
    assert.ok(!s.log.some(l => /сейчас нельзя/.test(l.text)), 'выбор не отвергнут');
});

test('R25-03: an option that cannot be used says why and shows the list instead of failing silently', () => {
    const s = fresh();
    execute(s, { op: 'computer.start', player: 0, pick: 'fixComp' });   // nothing is broken
    assert.equal(s.prompt.kind, 'choice', 'открывается список вариантов');
    assert.equal(s.prompt.title, 'Выберите компьютерное действие:');
    assert.ok(s.log.some(l => /сейчас нельзя/.test(l.text) && /поломк/i.test(l.text)), 'причина в журнале');
    const blocked = s.prompt.options.find(o => o.id === 'fixComp');
    assert.equal(blocked.disabled, true, 'и сам вариант помечен недоступным');
});

test('R25-04: the action list carries the pick through the card payment, and the discard is asked next', () => {
    const s = fresh(), p = s.players[0];
    p.health = 5;
    execute(s, { op: 'turn.do', player: 0, answer: { action: 'computer', pick: 'heal' } });
    assert.equal(s.prompt.kind, 'cards', 'сначала оплата действия картой');
    choose(s, [s.prompt.cards[0]]);
    assert.equal(p.health, 6, 'после оплаты выполнен именно выбранный вариант');
    assert.equal(p.hand.length, 2, 'карта оплаты ушла в сброс');
    // «Сбросьте 1 карту действия» is still asked by the option itself, after the action is paid for.
    const s2 = fresh(), q = s2.players[0];
    s2.computerCard = 'actionD';
    s2.computerDeck = ['actionA', 'actionB'];
    execute(s2, { op: 'turn.do', player: 0, answer: { action: 'computer', pick: 'know' } });
    choose(s2, [s2.prompt.cards[0]]);                       // payment of the action
    assert.equal(s2.prompt.kind, 'cards', 'вариант «получите 1 знание» просит сбросить карту');
    assert.match(s2.prompt.title, /Сбросьте 1 карту/);
    const knowBefore = q.knowledge || 0;
    choose(s2, [s2.prompt.cards[0]]);
    assert.equal(q.hand.length, 1, 'оплата действия и карта за знание — две карты');
    assert.ok((q.knowledge || 0) > knowBefore, 'знание получено (+1 за вариант и +1 за решённое действие)');
});
