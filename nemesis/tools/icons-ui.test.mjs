// icons-ui.test.mjs — the presentation layer the table actually looks at:
//   * emoji are shown as typed: the hand-drawn swap was rolled back at the table's request,
//   * an empty hand offers «Спасовать» in the hand's place,
//   * a mutation card is chosen by its picture, in the centred card window,
//   * the infected / clean halves are coloured,
//   * the 3D labels and the die faces draw their marks instead of typing a symbol.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ICONS, EM_ALIASES, iconize, ic } from '../client/icons.mjs';
import { CARNOMORPH_MUTATIONS } from '../shared/data/carnomorphs.mjs';
import { mutationOptions } from '../shared/engine/carnomorphs.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.join(HERE, '..');
const APP = fs.readFileSync(path.join(ROOT, 'client', 'app.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'client', 'style.css'), 'utf8');
const SCENE = fs.readFileSync(path.join(ROOT, 'client', 'scene3d.js'), 'utf8');
const DICE = fs.readFileSync(path.join(ROOT, 'client', 'dice.js'), 'utf8');

const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/gu;

test('the client shows the emoji as typed: nothing swaps them on render', () => {
    // The drawn icon set lived in icons.mjs and rewrote every text node of the table. It is off: the
    // table asked for its emoji back, so drawIcons() is a no-op and the safety-net observer is gone.
    assert.ok(!/watchIcons/.test(APP), 'the observer is not wired into the client');
    assert.ok(!/iconizeDom/.test(APP), 'no text node is rewritten');
    assert.match(APP, /function drawIcons\(\) \{ \/\* no-op: system emoji are shown as authored \*\/ \}/);
    assert.ok((APP.match(/drawIcons\(/g) || []).length >= 3, 'the call sites stay: one entry point, not five');
    // rules text and the client may hold emoji freely again — no map has to cover them
    assert.match(APP, /🎒 Рюкзак/);
    assert.match(APP, /🧬 Мутация/);
});

test('an empty hand shows the pass button in the hand s place', () => {
    assert.match(APP, /if \(!me\.hand\.length\) \{/);
    assert.match(APP, /id="handPass"/);
    assert.match(APP, /act\(\{ action: 'pass' \}\)/);
    assert.match(CSS, /#hand \.hand-pass/);
});

test('mutation cards are chosen by their picture with both halves coloured', () => {
    const opts = mutationOptions(Object.keys(CARNOMORPH_MUTATIONS).slice(0, 2));
    for (const o of opts) {
        assert.match(o.art, /^carnomorph\/mutation\//);
        assert.equal(o.infected, CARNOMORPH_MUTATIONS[o.id].infected);
        assert.equal(o.clean, CARNOMORPH_MUTATIONS[o.id].clean);
    }
    // the client routes any picture choice to the centred picker and prints the halves
    assert.match(APP, /const cardOpts = pr\.options\.filter\(o => o\.art\);/);
    assert.match(APP, /class="ip-halves"><span class="inf">ЗАРАЖЁН<\/span>/);
    assert.match(CSS, /\.inf \{ color: #e2604f; \}/);
    assert.match(CSS, /\.clean \{ color: #6fd08a; \}/);
});

test('the canvas layers draw their marks instead of typing a device glyph', () => {
    // A DOM text node can carry an emoji; a 3D label or a die face cannot, so those two files must
    // not carry a single symbol from the emoji ranges at all.
    for (const [name, src] of [['scene3d.js', SCENE], ['dice.js', DICE]]) {
        assert.deepEqual([...new Set(src.match(EMOJI) || [])], [], name + ' still types a glyph');
    }
    assert.match(SCENE, /ранения: ' \+ it\.hits/, 'wounds are spelled out on the label');
    assert.match(DICE, /function paintCross\(ctx, cx, cy, r, color\)/);
    assert.match(DICE, /paintCross\(ctx, 64, 66, 34, '#f7f2ea'\)/);
});

test('the dormant icon set is intact, so it can be switched back on with one line', () => {
    assert.ok(Object.keys(ICONS).length > 50, 'the drawings are still there');
    for (const [emoji, name] of Object.entries(EM_ALIASES)) assert.ok(ICONS[name], emoji + ' → ' + name);
    assert.match(iconize('Огонь 🔥'), /<svg class="gi"/);
    assert.equal(ic('flame'), ICONS.flame);
});
