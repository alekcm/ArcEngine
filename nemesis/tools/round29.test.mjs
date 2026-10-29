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

test('R29-01 only one central panel can close the door; there are no side leaves', () => {
    const src = read('client/scene3d.js');
    assert.match(src, /add\('dclosed', D\.openW, D\.postH/,
        'сцена строит одну сплошную панель точно по ширине проёма');
    assert.match(src, /closedDoor\.setEnabled\(closed\)/,
        'панель показывается только при закрытой двери');
    for (const gone of ["'ps'", "'pivot'", "'dleft'", "'dright'", "'dside'", 'panelSwing', 'pivotX', 'panelW', 'panelH']) {
        assert.ok(!src.includes(gone), 'в сцене нет боковых створок или их механики «' + gone + '»');
    }
    assert.ok(!src.includes('b8c4d0'), 'нет старого цвета серых боковых створок');
    const node = src.slice(src.indexOf('this.corridorNodes[c.id] = {'), src.indexOf('this.corridorNodes[c.id] = {') + 320);
    assert.ok(node.includes('closedDoor'), 'узел коридора хранит центральную панель');
    for (const field of ['panels', 'pivots', 'panelSwing']) assert.ok(!node.includes(field), 'узел без состояния боковых створок «' + field + '»');
});

test('R29-02 the tuning table has no side-leaf geometry left', () => {
    const tune = read('client/tuning.js');
    for (const gone of ['pivotX', 'panelW', 'panelH', 'panelSwing']) assert.ok(!tune.includes(gone), 'doorSpec без боковой механики «' + gone + '»');
    // the digits are sized from the plate's width only
    assert.match(tune, /const decalW = Math\.max\(0\.4, Math\.min\(beamW \* n\('numShare'\), beamW - 0\.4\)\);/,
        'ширина трафарета — только от ширины плиты');
});

test('R29-03 the server sends the closed-only panel, no side leaves, and a build stamp', async () => {
    const port = 8137;
    const srv = spawn(process.execPath, ['server.mjs', '--port=' + port], { cwd: new URL('.', repo).pathname, stdio: 'ignore' });
    try {
        await new Promise(r => setTimeout(r, 1200));
        const html = await (await fetch('http://127.0.0.1:' + port + '/client/')).text();
        const js = await (await fetch('http://127.0.0.1:' + port + '/client/scene3d.js')).text();
        const stamp = /window\.__BUILD = '([a-f0-9]+)'/.exec(html);
        const url = /app\.js\?v=([a-f0-9]+)/.exec(html);
        assert.ok(stamp, 'страница несёт штамп сборки');
        assert.match(js, /add\('dclosed', D\.openW, D\.postH/, 'браузер получает одну панель, закрывающую проём');
        assert.match(js, /closedDoor\.setEnabled\(closed\)/, 'браузер скрывает панель при открытой двери');
        for (const gone of ["'ps'", "'pivot'", "'dleft'", "'dright'", "'dside'", 'panelSwing']) {
            assert.ok(!js.includes(gone), 'браузер не получает боковые створки «' + gone + '»');
        }
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
