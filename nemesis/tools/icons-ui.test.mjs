// icons-ui.test.mjs — the presentation layer the table actually looks at:
//   * every emoji still stored in the rules data has a hand-drawn replacement,
//   * the client swaps them on render (and keeps chat/tooltips out of it),
//   * an empty hand offers «Спасовать» in the hand's place,
//   * a mutation card is chosen by its picture, in the centred card window,
//   * the infected / clean halves are coloured.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ICONS, EM_ALIASES, iconize, ic, watchIcons } from '../client/icons.mjs';
import { CARNOMORPH_MUTATIONS } from '../shared/data/carnomorphs.mjs';
import { mutationOptions } from '../shared/engine/carnomorphs.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.join(HERE, '..');
const APP = fs.readFileSync(path.join(ROOT, 'client', 'app.js'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'client', 'style.css'), 'utf8');
const SCENE = fs.readFileSync(path.join(ROOT, 'client', 'scene3d.js'), 'utf8');
const DICE = fs.readFileSync(path.join(ROOT, 'client', 'dice.js'), 'utf8');

const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/gu;

function sources() {
    const files = [];
    const walk = dir => {
        for (const name of fs.readdirSync(dir)) {
            const p = path.join(dir, name);
            const st = fs.statSync(p);
            if (st.isDirectory()) walk(p);
            else if (/\.(mjs|js|css|html)$/.test(name)) files.push(p);
        }
    };
    walk(path.join(ROOT, 'client'));
    walk(path.join(ROOT, 'shared'));
    return files;
}

test('every emoji in the rules and the client has a drawn replacement', () => {
    const missing = new Set();
    for (const file of sources()) {
        if (file.endsWith('icons.mjs')) continue;   // the legacy map itself
        const text = fs.readFileSync(file, 'utf8');
        for (const m of text.match(EMOJI) || []) if (!EM_ALIASES[m]) missing.add(m);
    }
    assert.deepEqual([...missing], [], 'unmapped emoji: ' + [...missing].join(' '));
});

test('every alias points at a real drawing and iconize replaces the glyph', () => {
    for (const [emoji, name] of Object.entries(EM_ALIASES)) {
        assert.ok(ICONS[name], emoji + ' → ' + name + ' is missing');
    }
    const markup = iconize('Огонь 🔥 и спора 🟢');
    assert.match(markup, /<svg class="gi"/);
    assert.equal(EMOJI.test(markup.replace(/<svg[\s\S]*?<\/svg>/g, '')), false, 'no emoji survives');
    assert.equal(ic('flame'), ICONS.flame);
    assert.equal(ic('no-such-icon'), '');
});

test('the client paints icons after every render, but never inside chat or tooltips', () => {
    assert.match(APP, /import \{ iconizeDom, ic \} from '\.\/icons\.mjs';/);
    assert.match(APP, /function drawIcons\(root\) \{ iconizeDom\(root \|\| document\.body\); \}/);
    assert.ok((APP.match(/drawIcons\(/g) || []).length >= 5, 'called from the render paths');
    assert.match(APP, /renderTopbar\(\); renderPlayers\(\); renderLog\(\); renderHistory\(\); renderHand\(\); renderHint\(\); refreshOverlays\(\); drawIcons\(\);/);
    assert.match(CSS, /\.gi \{ width: 1em; height: 1em;/);
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
    // A DOM text node can be swapped for an SVG; a 3D label or a die face cannot, so those two
    // files must not carry a single symbol from the emoji ranges at all.
    for (const [name, src] of [['scene3d.js', SCENE], ['dice.js', DICE]]) {
        assert.deepEqual([...new Set(src.match(EMOJI) || [])], [], name + ' still types a glyph');
    }
    assert.match(SCENE, /ранения: ' \+ it\.hits/, 'wounds are spelled out on the label');
    assert.match(DICE, /function paintCross\(ctx, cx, cy, r, color\)/);
    assert.match(DICE, /paintCross\(ctx, 64, 66, 34, '#f7f2ea'\)/);
});

test('a safety-net observer iconizes panels that render without calling drawIcons', () => {
    assert.equal(typeof watchIcons, 'function');
    assert.match(APP, /import \{ watchIcons \} from '\.\/icons\.mjs';/);
    assert.match(APP, /watchIcons\(document\);/);
    // and it stays out of the same places iconizeDom does
    const src = fs.readFileSync(path.join(ROOT, 'client', 'icons.mjs'), 'utf8');
    assert.match(src, /const SKIP = 'script,style,textarea,\.chat,#chatLog,#log \.chat,\[data-noicons\]';/);
    assert.match(src, /if \(host && host\.isConnected\) iconizeDom\(host\)/);
});
