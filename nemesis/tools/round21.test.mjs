// round21.test.mjs — the five remarks made at the table after the twentieth round.
//   node --test nemesis/tools/round21.test.mjs
//   * a pass must be confirmable without ticking a card first ("Подтвердить" was dead until a card
//     was selected and un-selected again);
//   * the event card in the journal reads as three lines inside one card — intruder movement, the
//     effect of the card, and the dice it asks for — not as one wall of printed text;
//   * the event card is dealt face down, anybody at the table may turn it over, and "Готово" only
//     opens after that;
//   * a room that has not been revealed must never be named ("Бросок шума — Пожарный пост [003]"
//     named a tile that was still lying face down);
//   * a character who just walked into a room may walk straight back through the door that closed
//     behind them (the closed door used to make the room unreachable).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createGame } from '../shared/engine/setup.mjs';
import { answer, next, run, roomName } from '../shared/engine/core.mjs';
import { eventLogLines } from '../shared/engine/events.mjs';
import { EVENT_CARDS } from '../shared/data/cards.mjs';
import { viewFor } from '../shared/view.mjs';
import { ROOM_TILES } from '../shared/ship.mjs';

function fresh(ui = {}) {
    const state = createGame({
        seed: 'round21', mode: 'original', draft: false,
        players: [{ name: 'Alpha', charId: 'soldier' }, { name: 'Beta', charId: 'scout' }],
        ui,
    });
    state.queue = []; state.prompt = null; state.resume = null; state.result = null;
    state.phase = 'player'; state.current = 0; state.firstPlayer = 0;
    state.seating = state.players.map(p => p.id); state.turnCursor = 0; state.actionsLeft = 2;
    state.players.forEach(p => { p.room = '011'; p.status = 'active'; });
    return state;
}
const clientFile = (name) => fs.readFileSync(new URL('../client/' + name, import.meta.url), 'utf8');

test('R21-01: a pass is confirmed without picking a card first', () => {
    const s = fresh();
    s.players[0].hand = s.players[0].deck.splice(0, 2);
    next(s, { op: 'pass.discard', player: 0 });
    run(s);
    assert.equal(s.prompt && s.prompt.kind, 'cards');
    assert.equal(s.prompt.min, 0, 'ни одной карты сбрасывать не обязательно');
    assert.equal(s.prompt.max, s.players[0].hand.length);
    const id = s.prompt.id;
    assert.equal(answer(s, 0, id, []), true, 'пустой выбор принимается сразу');
    // The button itself: disabled only when something HAS to be picked.
    const app = clientFile('app.js');
    assert.ok(app.includes("id=\"cardsOk\"' + (needPick ? ' disabled' : '')"), 'кнопка активна, если min = 0');
});

test('R21-02: the event is logged as movement / effect / dice inside one card', () => {
    const ev = EVENT_CARDS.find(e => e.id === 'bulkheadsOpen');
    const lines = eventLogLines(ev);
    assert.equal(lines[0], '📜 Событие: «Переборки открыты».');
    assert.equal(lines[1], 'Движение чужих: Все чужие движутся к ближайшему персонажу.');
    assert.equal(lines[2], 'Эффект: Откройте все двери (кроме уничтоженных).');
    assert.equal(lines[3], 'Бросок кубика: Персонажи без карт в руке делают бросок шума.');

    // A card that spawns an intruder says so in its effect line, not in a separate card.
    const eggs = eventLogLines(EVENT_CARDS.find(e => e.id === 'eggProtection'));
    assert.ok(eggs.some(l => l.startsWith('Эффект: ') && /Дрон появляется/.test(l)), 'появление чужого — в эффекте');
    assert.ok(eggs.some(l => l.startsWith('Бросок кубика: ')), 'и требование броска — отдельной строкой');

    // Every event card answers all three questions.
    for (const e of EVENT_CARDS) {
        const L = eventLogLines(e);
        assert.ok(L.some(x => x.startsWith('Движение чужих: ')), e.id + ': строка движения');
        assert.ok(L.some(x => x.startsWith('Бросок кубика: ')), e.id + ': строка броска');
        assert.ok(L.every(x => !x.includes('\n')), e.id + ': строки разделены переводом строки, а не внутри строки');
    }

    // One journal entry, three lines: the player reads it as one card of the log.
    const s = fresh();
    next(s, { op: 'event.reveal', id: 'bulkheadsOpen' });
    run(s);
    const entry = s.log.filter(l => l.kind === 'event' && l.text.startsWith('📜 Событие')).pop();
    assert.ok(entry, 'событие попало в журнал');
    const parts = entry.text.split('\n');
    assert.equal(parts.length, 4, 'заголовок + три строки');
    assert.ok(parts[1].startsWith('Движение чужих: ') && parts[2].startsWith('Эффект: ') && parts[3].startsWith('Бросок кубика: '));
    // The log panel keeps the line breaks instead of flattening them into one paragraph.
    assert.match(clientFile('style.css'), /#log \.l \{[^}]*white-space: pre-line/);
});

test('R21-03: the event card lies face down and anybody may turn it over', () => {
    const s = fresh({ eventAck: true });
    next(s, { op: 'event.reveal', id: 'damage' });
    run(s);
    assert.equal(s.prompt && s.prompt.kind, 'ack');
    assert.equal(!!s.prompt.flipped, false, 'карта лежит рубашкой вниз');
    const id = s.prompt.id;
    assert.equal(answer(s, 0, id, 'ok'), false, 'лицом вниз «Готово» не принимается');
    assert.equal(answer(s, 'host', id, 'all'), false, 'даже ведущий не пропускает непрочитанную карту');

    // The flip is a table action: it changes the prompt every screen sees.
    s.prompt.flipped = true;
    assert.equal(viewFor(s, 0).prompt.flipped, true);
    assert.equal(viewFor(s, 1).prompt.flipped, true);
    assert.equal(answer(s, 0, id, 'ok'), true);
    assert.deepEqual(s.prompt.acked, [0]);

    const app = clientFile('app.js');
    assert.ok(app.includes("id=\"ackFlip\""), 'рубашка кликабельна');
    assert.ok(app.includes("net.send({ t: 'flip' })"), 'клиент шлёт переворот');
    assert.ok(app.includes('Сначала переверните карту события.'), 'подсказка до переворота');
    assert.ok(fs.readFileSync(new URL('../server.mjs', import.meta.url), 'utf8').includes("case 'flip':"), 'сервер принимает переворот от любого игрока');
});

test('R21-04: a room nobody has revealed is never named', () => {
    const s = fresh();
    const slot = Object.keys(s.ship.rooms).find(id => s.ship.rooms[id].kind === 'slot1' && !s.ship.rooms[id].tech);
    const tileName = ROOM_TILES[s.secret.tiles[slot]].name;
    assert.equal(roomName(s, slot), '??? [' + slot + ']', 'до разведки — только номер');

    // A noise roll in that room asks for the die without naming the tile.
    s.players[0].room = slot;
    next(s, { op: 'noise.roll', player: 0, room: slot });
    run(s);
    assert.equal(s.prompt && s.prompt.kind, 'dice');
    assert.match(s.prompt.title, new RegExp('\\?\\?\\? \\[' + slot + '\\]$'), 'в заголовке броска — ???');
    assert.ok(!s.prompt.title.includes(tileName), 'имя неисследованной комнаты не прозвучало');
    assert.equal(s.prompt.room, slot, 'клиент знает комнату и сам решит, когда её называть');
    assert.equal(viewFor(s, 1).prompt.room, slot, 'и у остальных экранов есть id комнаты для той же маски');

    // Once the tile lies face up on the table the name is spoken again.
    s.prompt = null; s.resume = null; s.pendingRoll = null; s.queue = [];
    s.roomState[slot].explored = true;
    s.roomState[slot].tile = s.secret.tiles[slot];
    next(s, { op: 'noise.roll', player: 0, room: slot });
    run(s);
    assert.ok(s.prompt.title.includes(tileName), 'разведанная комната называется своим именем');

    // The client keeps the same rule while the scene is frozen for the die: the die prompt names a
    // room only when the room's shell is already built on the table.
    const app = clientFile('app.js');
    assert.ok(app.includes('function diceTitleMask'), 'маска заголовка броска на клиенте');
    assert.ok(app.includes("'??? [' + pr.room + ']'"), 'клиент подставляет ??? для неразвёрнутой комнаты');
    assert.ok(clientFile('dice.js').includes('(opts && opts.title)'), 'DiceUI принимает заголовок с маской');
});

test('R21-05: the door that closed behind you does not lock you out of the room you left', () => {
    const s = fresh();
    const p = s.players[0];
    for (const id of ['003', '007']) {
        s.roomState[id].explored = true;
        s.roomState[id].tile = s.secret.tiles[id];
    }
    p.room = '003';
    s.ship.corridors['003-007'].door = 'closed';   // the exploration token closed it behind the character
    next(s, { op: 'move.start', player: 0 });
    run(s);
    assert.equal(s.prompt && s.prompt.kind, 'room');
    assert.ok(s.prompt.rooms.includes('007'), '007 снова доступна следующим действием');
    const id = s.prompt.id;
    s.pendingRoll = { die: 'noise', value: 'silence' };   // no encounter on the way
    assert.equal(answer(s, 0, id, '007'), true);
    assert.equal(p.room, '007', 'персонаж вернулся в покинутую комнату');
    assert.equal(s.ship.corridors['003-007'].door, 'open', 'дверь открылась, чтобы пройти');
    assert.ok(s.log.some(l => /открывает дверь 003-007/.test(l.text)), 'об этом сказано в журнале');
});
