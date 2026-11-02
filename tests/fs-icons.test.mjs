// The icons of the game are drawn, not typed: every symbol of the table is a
// vector shape of FSIcons, and the rules of a card become runs of text and icons.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { ROOT, loadScripts } from './browser-scripts.mjs';

const { get } = loadScripts(['js/fs/FSIcons.js', 'js/fs/FSData.js']);
const FSIcons = get('FSIcons');
const FS_DATA = get('FS_DATA');

// A flat 2D context: enough to count what was painted.
function recorder() {
    const calls = [];
    const noop = name => (...args) => calls.push([name, ...args]);
    const ctx = {
        calls,
        font: '', fillStyle: '', strokeStyle: '', lineWidth: 1, lineCap: '', lineJoin: '',
        textAlign: '', textBaseline: '', globalAlpha: 1,
        clearRect: noop('clearRect'), fillRect: noop('fillRect'), beginPath: noop('beginPath'),
        closePath: noop('closePath'), moveTo: noop('moveTo'), lineTo: noop('lineTo'), arc: noop('arc'),
        quadraticCurveTo: noop('quadraticCurveTo'), fill: noop('fill'), stroke: noop('stroke'),
        save: noop('save'), restore: noop('restore'), translate: noop('translate'),
        scale: noop('scale'), rotate: noop('rotate'), setLineDash: noop('setLineDash'),
        fillText: noop('fillText'), measureText: text => ({ width: String(text).length * 6 }),
        createLinearGradient: () => ({ addColorStop() { } }),
    };
    return ctx;
}

test('the icons of the table are shapes: cubes, tokens, dice, orders and marks', () => {
    for (const name of ['cube.att', 'cube.def', 'cube.morale', 'cube.any',
        'token.att', 'token.def', 'die.att', 'die.def', 'die.morale', 'die.blank',
        'order.advance', 'order.deploy', 'order.strategize', 'order.dominate', 'order.event',
        'mark.objective', 'mark.city', 'mark.bastion', 'mark.ship', 'mark.ground', 'mark.damage',
        'ui.card', 'ui.reinforce', 'ui.retreat', 'ui.close', 'ui.check']) {
        const shape = FSIcons.shape(name);
        assert.ok(shape && shape.parts.length, 'the shape ' + name + ' is drawn');
        const ctx = recorder();
        assert.equal(FSIcons.canvas(ctx, name, 16, 16, 32), true, 'the shape ' + name + ' is painted');
        assert.ok(ctx.calls.length > 2, 'the shape ' + name + ' has parts');
        const svg = FSIcons.svg(name);
        assert.ok(/^<svg /.test(svg) && svg.includes('</svg>'), 'the shape ' + name + ' is an SVG too');
    }
    // An unknown name is not an icon: the panel keeps it as a letter.
    assert.equal(FSIcons.shape('no-such-icon'), null);
    assert.ok(FSIcons.url('cube.att').startsWith('url("data:image/svg+xml,'));
    assert.equal(FSIcons.url('no-such-icon'), 'none');
});

test('a cube of the game is a cube: three faces, and its blazon on the top one', () => {
    const shape = FSIcons.shape('cube.att');
    const faces = shape.parts.filter(p => p.t === 'p');
    assert.ok(faces.length >= 3, 'the three faces of the cube');
    // The blazon of attack is two crossed blades.
    const blades = shape.parts.filter(p => p.t === 'l');
    assert.equal(blades.length, 2, 'the two blades of the attack');
    const def = FSIcons.shape('cube.def');
    assert.ok(def.parts.some(p => p.t === 'p' && p.fill === 'ink'), 'the shield of the defence');
    const morale = FSIcons.shape('cube.morale');
    assert.ok(morale.parts.some(p => p.t === 'p' && p.fill === 'ink' && p.pts.length >= 10), 'the star of the morale');
});

test('the rules text of a card is runs: italics, bold and the cubes as icons', () => {
    const blocks = FSIcons.runs('Получите 2 `att. token`. *Воин:* если есть `morale cube` — **сила**.');
    const flat = blocks.flat();
    const icons = flat.filter(r => r.t === 'icon').map(r => r.name);
    assert.equal(JSON.stringify(icons), JSON.stringify(['att. token', 'morale cube']));
    assert.ok(flat.some(r => r.italic && r.v === 'Воин:'), 'the italics of the card');
    assert.ok(flat.some(r => r.bold && r.v === 'сила'), 'the bold of the card');
    const text = flat.filter(r => r.t === 'text').map(r => r.v).join('');
    assert.ok(!/[*`]/.test(text), 'no markup is left in the text: ' + text);
    // The words of the data map to the shapes of the table.
    assert.equal(FSIcons.fromCardWord('att. token'), 'token.att');
    assert.equal(FSIcons.fromCardWord('morale cube'), 'cube.morale');
    assert.equal(FSIcons.fromCardWord('def. cube'), 'cube.def');
    assert.equal(FSIcons.fromCardWord('any cube'), 'cube.any');
    assert.equal(FSIcons.fromCardWord('?'), 'cube.any');
});

test('the face of a card carries its name, its cubes and its whole text', () => {
    const card = FS_DATA.combat.find(c => c.general && c.general.includes('`'));
    assert.ok(card, 'a card with an icon in its text');
    const ctx = recorder();
    FSIcons.cardFace(ctx, 384, 538, card, { color: '#8a6a3a', faction: 'имперская-гвардия' });
    const painted = ctx.calls.map(c => c[0]);
    assert.ok(painted.includes('fillText'), 'the text is drawn on the card');
    // The name is drawn, and the rule text as well — never the markup.
    const words = ctx.calls.filter(c => c[0] === 'fillText').map(c => String(c[1])).join(' ');
    assert.ok(words.includes(card.name), 'the name of the card is on the card');
    assert.ok(!/[*`]/.test(words), 'no markup on the card: ' + words);
    // The cubes of the card are drawn as shapes, not as words.
    assert.ok(painted.filter(n => n === 'fill').length > 3, 'the cubes of the card are painted');
    // The back of a card is not the same picture.
    const back = recorder();
    FSIcons.cardBack(back, 384, 538, '#8a6a3a');
    assert.ok(back.calls.length > 3);
});

test('no built-in emoji anywhere in the game interface', () => {
    const dir = path.join(ROOT, 'js/fs');
    const emoji = /[\u{1F000}-\u{1FAFF}\u{1F1E6}-\u{1F1FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
    const offenders = [];
    for (const file of readdirSync(dir)) {
        if (!/\.(js|css|html)$/.test(file)) continue;
        const body = readFileSync(path.join(dir, file), 'utf8');
        const lines = body.split('\n');
        lines.forEach((line, i) => {
            if (emoji.test(line)) offenders.push(file + ':' + (i + 1) + ' ' + line.trim().slice(0, 80));
        });
    }
    assert.equal(offenders.join('\n'), '', 'the interface draws its icons instead of typing them');
});
