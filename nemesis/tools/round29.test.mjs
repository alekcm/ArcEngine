// round29.test.mjs — «створки двери удалены» проверяется по собранной сцене и по тому, что сервер
// отдаёт браузеру, а не по обещанию в отчёте. Плюс штамп сборки: вкладка, пережившая перезапуск
// сервера, обязана перезагрузиться сама, иначе стол смотрит на вчерашнюю сцену и спорит с кодом.
//   node --test nemesis/tools/round29.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawn } from 'node:child_process';

const repo = new URL('../', import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, repo), 'utf8');

test('R29-01 the door is built without leaves and without side plates', () => {
    const src = read('client/scene3d.js');
    // nothing in the corridor builder creates a leaf, its stripe or a pivot any more
    for (const gone of ["'panel'", "'ps'", "'pivot'", 'panelSwing', 'pivotX', 'panelW', 'panelH']) {
        assert.ok(!src.includes(gone), 'в сцене нет «' + gone + '»');
    }
    assert.ok(!src.includes('b8c4d0'), 'нет даже цвета серых створок');
    // and the door node carries no leaf fields for some other code to animate
    const node = src.slice(src.indexOf('this.corridorNodes[c.id] = {'), src.indexOf('this.corridorNodes[c.id] = {') + 320);
    for (const field of ['panels', 'pivots', 'panelSwing']) assert.ok(!node.includes(field), 'узел коридора без «' + field + '»');
});

test('R29-02 the tuning table has no leaf geometry left', () => {
    const tune = read('client/tuning.js');
    for (const gone of ['pivotX', 'panelW', 'panelH', 'panelSwing']) assert.ok(!tune.includes(gone), 'doorSpec без «' + gone + '»');
    // the digits are sized from the plate's width only
    assert.match(tune, /const decalW = Math\.max\(0\.4, Math\.min\(beamW \* n\('numShare'\), beamW - 0\.4\)\);/,
        'ширина трафарета — только от ширины плиты');
});

test('R29-03 what the server sends has no leaves either, and the page carries a build stamp', async () => {
    const port = 8137;
    const srv = spawn(process.execPath, ['server.mjs', '--port=' + port], { cwd: new URL('.', repo).pathname, stdio: 'ignore' });
    try {
        await new Promise(r => setTimeout(r, 1200));
        const html = await (await fetch('http://127.0.0.1:' + port + '/client/')).text();
        const js = await (await fetch('http://127.0.0.1:' + port + '/client/scene3d.js')).text();
        const stamp = /window\.__BUILD = '([a-f0-9]+)'/.exec(html);
        const url = /app\.js\?v=([a-f0-9]+)/.exec(html);
        assert.ok(stamp, 'страница несёт штамп сборки');
        assert.equal(js.includes("'panel'") || js.includes('b8c4d0'), false, 'браузер получает сцену без створок');
        assert.ok(url && url[1] === stamp[1], 'модуль запрашивается под штампом — кэш не отдаст старый файл');
    } finally { srv.kill(); }
});

test('R29-04 a tab that outlived a restart reloads itself', () => {
    const app = read('client/app.js');
    assert.match(app, /if \(m\.build && window\.__BUILD && m\.build !== window\.__BUILD && !app\.reloaded\)/,
        'приложение сверяет штамп сервера со своим');
    assert.match(app, /location\.reload\(\)/, 'и перезагружается, а не рисует вчерашнюю сцену');
    assert.match(app, /class="buildtag"/, 'штамп виден в подсказке — чтобы такие споры решались одним взглядом');
});
