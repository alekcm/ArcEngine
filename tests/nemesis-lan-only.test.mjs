// The Nemesis board game has exactly one entrance — its LAN server (nemesis.bat), started by
// nemesis/server.mjs. The kit's dev server (run.bat) and the editor (editor.bat) serve the whole
// project root, so without the guard they would hand out the game page too: a lobby with no /ws
// behind it, i.e. an endless "Связь с сервером потеряна" loop. The client's modules must stay
// reachable from both — the editor's Nemesis tab imports scene3d.js and tuning.js.
//   node --test tests/nemesis-lan-only.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { test } from 'node:test';
import { ROOT } from './browser-scripts.mjs';
import { isNemesisGamePage, nemesisLanOnlyPage } from '../tools/game-entry.mjs';

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** A likely-free port: both servers walk up by themselves when it is taken. */
function freePort() {
    return new Promise((resolve, reject) => {
        const s = net.createServer();
        s.once('error', reject);
        s.listen(0, '127.0.0.1', () => {
            const { port } = s.address();
            s.close(() => resolve(port));
        });
    });
}

/** Start a server and resolve once it says which port it took. */
async function startServer(script, port) {
    const child = spawn(process.execPath, [script, '--port=' + port, '--no-open'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    const out = [];
    return await new Promise((resolve, reject) => {
        const timer = setTimeout(() => { child.kill(); reject(new Error(script + ' did not start: ' + out.join(''))); }, 20000);
        const onData = (b) => {
            out.push(String(b));
            const m = out.join('').match(/localhost:(\d+)/);
            if (m) { clearTimeout(timer); resolve({ child, port: Number(m[1]) }); }
        };
        child.stdout.on('data', onData);
        child.stderr.on('data', onData);
        child.on('exit', (code) => { clearTimeout(timer); reject(new Error(script + ' exited (' + code + '): ' + out.join(''))); });
    });
}

test('LAN-01: the guard matches the game PAGE only, not the client its modules', () => {
    for (const p of ['/nemesis/client', '/nemesis/client/', '/nemesis/client/index.html', '/Nemesis/Client/Index.html',
        '/nemesis//client/', '/nemesis/client/./index.html', '/nemesis/client/../client/index.html', '/nemesis\\client\\index.html',
        '/nemesis/client./', '/nemesis/client/index.html.', '/nemesis/client/index.html '])
        assert.ok(isNemesisGamePage(p), p + ' — это страница игры');
    for (const p of ['/', '/index.html', '/nemesis/client/app.js', '/nemesis/client/scene3d.js',
        '/nemesis/client/tuning.js', '/nemesis/shared/ship.mjs', '/Nemesis/client/board-edits.json'])
        assert.ok(!isNemesisGamePage(p), p + ' — не страница игры');
    const page = nemesisLanOnlyPage();
    assert.match(page, /nemesis\.bat/, 'страница говорит, чем запускать игру');
    assert.match(page, /локальной сети/, 'и почему именно так');
    assert.doesNotMatch(page, /<script/i, 'страница-заглушка ничего не исполняет');
});

test('LAN-02: the dev server (run.bat) does not hand out the game page', async (t) => {
    const { child, port } = await startServer('tools/dev-server.mjs', await freePort());
    t.after(() => { try { child.kill(); } catch { /* gone */ } });
    const base = 'http://127.0.0.1:' + port;

    for (const page of ['/nemesis/client/', '/nemesis/client', '/nemesis/client/index.html', '/nemesis//client/', '/nemesis/client/./index.html']) {
        const r = await fetch(base + page, { redirect: 'manual' });
        assert.equal(r.status, 403, page + ' → 403');
        assert.match(await r.text(), /nemesis\.bat/, page + ': ответ объясняет, как запустить игру');
    }
    // The kit's own game is untouched.
    assert.equal((await fetch(base + '/', { redirect: 'manual' })).status, 200, 'игра набора открывается как раньше');
    // The client's modules stay: the Nemesis tab in the editor imports them through this server? No —
    // through its own, but both must keep serving them.
    assert.equal((await fetch(base + '/nemesis/client/scene3d.js')).status, 200, 'модули клиента на месте');
    assert.equal((await fetch(base + '/nemesis/client/style.css')).status, 200, 'стили клиента на месте');
});

test('LAN-03: the editor (editor.bat) does not hand out the game page', async (t) => {
    const { child, port } = await startServer('_utils/editor/server.mjs', await freePort());
    t.after(() => { try { child.kill(); } catch { /* gone */ } });
    const base = 'http://127.0.0.1:' + port;

    for (const page of ['/nemesis/client/', '/nemesis/client/index.html']) {
        const r = await fetch(base + page, { redirect: 'manual' });
        assert.equal(r.status, 403, page + ' → 403');
        assert.match(await r.text(), /nemesis\.bat/, page + ': ответ объясняет, как запустить игру');
    }
    // The editor and its Nemesis tab still work: the tab imports these very modules.
    assert.equal((await fetch(base + '/api/status')).status, 200, 'API редактора живо');
    assert.equal((await fetch(base + '/nemesis/client/scene3d.js')).status, 200, 'модуль сцены для вкладки Nemesis');
    assert.equal((await fetch(base + '/nemesis/client/tuning.js')).status, 200, 'схема доски для вкладки Nemesis');
});

test('LAN-04: the client connects only when the LAN server served the page', () => {
    const app = read('nemesis/client/app.js');
    const html = read('nemesis/client/index.html');
    assert.match(app, /if \(window\.__BUILD\) net\.connect\(\);/, 'в игру входят только со страницы LAN-сервера (штамп сборки)');
    assert.match(app, /else lanOnlyNotice\(\);/, 'любая другая страница получает инструкцию');
    assert.match(app, /function lanOnlyNotice\(\)/, 'инструкция — это функция, а не молчаливый пустой лобби');
    assert.match(app, /\$\('lanOnly'\)/, 'инструкция показывает готовый блок страницы');
    assert.match(html, /id="lanOnly"/, 'блок инструкции есть в самой странице — он виден, даже если модуль не загрузился');
    assert.match(html, /if \(!window\.__BUILD\) document\.getElementById\('lanOnly'\)\.classList\.remove\('hidden'\);/,
        'страница без штампа (диск, статический хост) сразу говорит, что так игра не запустится');
    assert.doesNotMatch(app, /^\s*net\.connect\(\);\s*$/m, 'безусловного подключения больше нет');
});
