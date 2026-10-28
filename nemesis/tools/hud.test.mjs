// hud.test.mjs — the corner of the screen that answers "how hurt am I" and the top-bar popups.
//   node --test nemesis/tools/hud.test.mjs
// Two layout bugs, pinned down by their structure rather than by a screenshot:
//   * the Computer / Adaptations popups lived inside #topbar, and #topbar scrolls horizontally —
//     a scrolling box clips its children, so both popups were cut off at the bar's lower edge.
//     They are now lifted into #tbPop, a fixed layer that is not a child of the bar.
//   * health and injuries were only visible in the character sheet or in the players list. A band
//     in the lower-right corner shows them all the time.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = p => fs.readFileSync(new URL('../client/' + p, import.meta.url), 'utf8');
const html = read('index.html');
const css = read('style.css');
const app = read('app.js');

test('HUD-01: the top-bar popup layer is outside the scrolling bar', () => {
    assert.match(html, /<div id="tbPop"/, 'the popup layer exists');
    const start = html.indexOf('<div id="topbar">'), pop = html.indexOf('id="tbPop"');
    assert.ok(start > 0 && pop > start, 'the layer comes after the bar opens');
    const between = html.slice(start, html.lastIndexOf('<div', pop));
    const open = (between.match(/<div/g) || []).length, close = (between.match(/<\/div>/g) || []).length;
    assert.equal(open, close, '#tbPop is not inside #topbar (its scrolling box would clip it)');
});

test('HUD-02: the copy inside the bar never opens by itself, and the bar drives the layer', () => {
    assert.match(css, /#topbar \.ipop\s*\{\s*display:\s*none/, 'the clipped copy is hidden');
    assert.match(css, /#tbPop\.show\s*\{\s*display:\s*block/, 'the layer can be shown');
    assert.match(app, /function showTbPop\(/, 'the layer is filled from the hovered item');
    assert.match(app, /'topbar'\)\.addEventListener\('pointerover'/, 'the bar forwards the hover');
    assert.match(app, /'topbar'\)\.addEventListener\('pointerleave'/, 'and hides it when the pointer leaves');
});

test('HUD-03: my health and injuries sit in the lower-right corner', () => {
    assert.match(html, /<div id="selfHud"/, 'the band exists');
    assert.match(css, /#selfHud\s*\{[^}]*position:\s*fixed[^}]*right:[^}]*bottom:/, 'fixed in the corner');
    assert.match(css, /#selfHud \.hp i\.on/, 'it reuses the health cells');
    assert.match(app, /function renderSelfHud\(\)/, 'it is rendered from the view');
    assert.match(app, /\n\s+renderSelfHud\(\);/, 'on every top-bar update');
    assert.match(app, /\$\('selfHud'\)\.onclick/, 'clicking it opens the sheet');
});

test('HUD-04: a weapon button in the intruder card says what the weapon does', async () => {
    const { ITEMS } = await import('../shared/data/cards.mjs');
    assert.match(app, /function weaponEffect\(/, 'the rules text is reduced to the effect');
    assert.match(app, /weaponEffect\(d\)/, 'and used on the weapon buttons');
    assert.ok(app.includes('Дальнобойное оружие[^.]*\\.\\s*'), 'the same preamble is stripped');
    // every printed weapon text carries that preamble, so the rest is the effect
    for (const key of ['soldierGun', 'handgun', 'flamethrower']) {
        assert.match(ITEMS[key].text, /^Дальнобойное оружие[^.]*\./, key + ' starts with the preamble');
    }
    const eff = String(ITEMS.soldierGun.text).replace(/^Дальнобойное оружие[^.]*\.\s*/, '').trim();
    assert.equal(eff, 'Первый выстрел в ходу наносит 1 дополнительное ранение.');
});
