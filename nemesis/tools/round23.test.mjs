// round23.test.mjs — the seven remarks made at the table after the twenty-second round.
//   node --test nemesis/tools/round23.test.mjs
//   * figures stood with their feet in the floor tiles (the deck sat below the shell);
//   * a noisy tech corridor kept half of its lights blue (only some parts shared the LED material);
//   * a room could be picked from the action panel but not by clicking it on the board;
//   * the event card swapped picture instead of turning over;
//   * a noise roll that found nothing still lit the screen up as if an intruder had appeared;
//   * a careful move could not be aimed at a corridor that already carried a noise token;
//   * the attack card opened on top of the token pull instead of after it, and left too early.
// The first two are pinned in tools/scene.test.mjs (SCN-04/06/12/13); the rest are here.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createGame } from '../shared/engine/setup.mjs';
import { answer, next, run } from '../shared/engine/core.mjs';
import { buildMenu } from '../shared/engine/turn.mjs';

function fresh() {
    const state = createGame({
        seed: 'round23', mode: 'original', draft: false,
        players: [{ name: 'Alpha', charId: 'soldier' }, { name: 'Beta', charId: 'scout' }],
        ui: { bagClick: true },
    });
    state.queue = []; state.prompt = null; state.resume = null; state.result = null;
    state.phase = 'player'; state.current = 0; state.firstPlayer = 0;
    state.seating = state.players.map(p => p.id); state.turnCursor = 0; state.actionsLeft = 2;
    state.players.forEach(p => { p.room = '011'; p.status = 'active'; });
    return state;
}
const clientFile = name => fs.readFileSync(new URL('../client/' + name, import.meta.url), 'utf8');

test('R23-01: the careful move can be aimed at a corridor that already carries noise', () => {
    const s = fresh();
    const from = '011', to = '014';
    for (const c of Object.values(s.ship.corridors)) c.noise = false;
    s.ship.techNoise = false;
    const dest = s.ship.rooms[to].exits;
    assert.ok(dest.length >= 2, '014 has more than one corridor');
    // One corridor of the destination already carries a token, the others are free: the move is legal
    // (there is somewhere to put the token) and the taken corridor must still be on the list — walking
    // into it is the encounter the table was hunting for.
    s.ship.corridors[dest[0].corridor].noise = true;

    s.players[0].hand = s.players[0].deck.splice(0, 3);
    const menu = buildMenu(s, s.players[0]);
    assert.ok(menu.actions.find(a => a.id === 'careful').enabled, 'careful movement is offered');

    next(s, { op: 'move.start', player: 0, careful: true, pay: 0, dest: to });
    run(s);
    assert.equal(s.prompt && s.prompt.kind, 'choice', 'the corridor is chosen from a list');
    const ids = s.prompt.options.map(o => o.id);
    for (const e of dest) assert.ok(ids.includes(e.corridor), 'коридор ' + e.corridor + ' в списке');
    const noisy = s.prompt.options.find(o => o.id === dest[0].corridor);
    assert.match(noisy.label, /уже с шумом — встреча/, 'a taken corridor is marked as an encounter');
    assert.doesNotMatch(s.prompt.options.find(o => o.id === dest[1].corridor).label, /уже с шумом/);

    const id = s.prompt.id;
    assert.equal(answer(s, 0, id, dest[0].corridor), true);
    // Walking into the token is an encounter, not a second token on the same corridor.
    assert.equal(s.prompt && s.prompt.kind, 'bag', 'встреча: тянем жетон из мешка');
    // The encounter itself clears the tokens around the room — the corridor did not get a second one.
    assert.equal(s.ship.corridors[dest[0].corridor].noise, false, 'no second token on the same corridor');
    assert.match(String(s.prompt.text || ''), /уже был жетон шума/, 'the bag names the corridor as the cause');
    assert.equal(answer(s, 0, s.prompt.id, 'draw'), true);
    assert.equal(s.prompt && s.prompt.kind, 'turn', 'the turn goes on after the encounter');
});

test('R23-02: clicking a neighbouring room on the board offers the move, closed door or not', () => {
    const app = clientFile('app.js');
    const at = app.indexOf('function onRoomClick');
    assert.ok(at > 0, 'the board click handler exists');
    const body = app.slice(at, app.indexOf('\nfunction ', at + 10));
    assert.doesNotMatch(body, /door !== 'closed'/, 'a closed door must not answer for the room');
    assert.match(body, /find\(e => e\.to === id\)/, 'the neighbour is found by its destination');
    // The move is offered from the room popup, exactly as the action panel offers it.
    assert.match(body, /openWorldPop\(/);
    assert.match(body, /action: 'careful'/, 'the popup offers the careful move as well');
});

test('R23-03: the event card turns over in 3D instead of swapping a picture', () => {
    const app = clientFile('app.js'), css = clientFile('style.css');
    // Both faces live in the markup, one behind the other, and the wrapper carries the turn.
    assert.match(app, /class="ack3d/, 'a turning wrapper');
    assert.match(app, /ack-face aback/, 'the printed back');
    assert.match(app, /ack-face afront/, 'the printed front');
    assert.match(css, /\.ack3d\s*\{[^}]*transform-style:\s*preserve-3d/, 'really three-dimensional');
    assert.match(css, /\.ack3d\.flipped\s*\{\s*transform:\s*rotateY\(180deg\)/, 'one half-turn');
    assert.match(css, /\.ack-face\s*\{[^}]*backface-visibility:\s*hidden/, 'only one face is seen');
    assert.match(css, /\.ack-face\.afront\s*\{\s*transform:\s*rotateY\(180deg\)/, 'the front starts face down');
    // The turn plays once per card, not on every re-render of the table: the render that first sees
    // prompt.flipped builds the card face down again and adds the class a moment later (a card that
    // was simply re-rendered face up looked like an instant swap).
    assert.match(app, /const turning = flipped && !!app\.ackDown && !ackHeld\(pr\)/, 'the turn is played once');
    assert.match(app, /app\.ackHold = \{ id: pr\.id, until: Date\.now\(\) \+ 700 \}/, 'and held while it plays');
    assert.match(app, /function ackHeld\(pr\)[\s\S]{0,180}app\.ackHold\.until > Date\.now\(\)/, 'the hold belongs to its card');
    assert.match(app, /if \(ackHeld\(pr\) && \$\('ack3d'\)\) return;/, 'later renders leave the card alone');
    // The click asks the server for the table turn instead of swapping the picture itself.
    assert.match(app, /app\.ackFlipSent = true;\s*\n\s*net\.send\(\{ t: 'flip' \}\)/, 'the click turns it for the whole table');
});

test('R23-04: only a bag this very roll opened may flash the screen', () => {
    const app = clientFile('app.js');
    assert.match(app, /if \(dicePrompt\) app\.diceId = pr\.id/, 'the die remembers its question');
    assert.match(app, /pr\.id \|\| 0\) > \(app\.diceId \|\| 0\)/, 'the bag must be younger than the die');
    assert.match(app, /const fromThisRoll = pr && pr\.kind === 'bag'/, 'and still be a bag');
});

test('R23-05: the attack card waits for the token pull and stays four seconds', () => {
    const fx = clientFile('fx.js');
    assert.match(fx, /get holding\(\)\s*\{\s*return this\.busy && \(this\.playing === 'bag' \|\| this\.playing === 'attack'\)/,
        'the table knows when the token or the attack card owns the middle');
    assert.match(fx, /this\.playing = f\.type/, 'it remembers which effect is playing');
    assert.match(fx, /k === 'attack' \? 4000 : 3200/, 'the attack card is held for four seconds');
    const app = clientFile('app.js');
    assert.match(app, /tableFx\.holding/, 'a question waits while the table is busy');
    assert.match(app, /app\.promptDeferred = true/, 'and is remembered instead of lost');
    assert.match(app, /tableFx\.onIdle = \(\) => \{ if \(app\.promptDeferred\)/, 'asked once the table is quiet');
});
