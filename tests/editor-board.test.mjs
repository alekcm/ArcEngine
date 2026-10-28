// The editor's Nemesis tab edits PARTS of the board: move, rotate, scale, recolour, hide, delete,
// and it saves them to nemesis/client/board-edits.json (_utils/editor/save.mjs: saveBoard), which
// the game applies while it builds the board.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { BOARD_REL, sanitizeEdit, sanitizeEdits, saveBoard, saveTuning } from '../_utils/editor/save.mjs';
import { ROOT } from './browser-scripts.mjs';

const temps = [];
after(() => { for (const dir of temps) fs.rmSync(dir, { recursive: true, force: true }); });

function tempRoot() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arcengine-board-'));
    temps.push(root);
    return root;
}
const read = (root) => JSON.parse(fs.readFileSync(path.join(root, BOARD_REL), 'utf8'));
const backups = (root, prefix) => {
    const dir = path.join(root, '_utils', '.backups');
    return fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.startsWith(prefix + '-')).sort() : [];
};

test('saveBoard: пишет правки деталей и только известные поля', async () => {
    const root = tempRoot();
    const r = await saveBoard(root, {
        'room:101#4': { pos: [1, 2, 3], color: '#FFAA00', hidden: true, evil: 'x' },
        'cor:5#2': { deleted: true },
        'bad id with spaces': { pos: [1, 2, 3] },
        'room:101#9': { junk: 1 },
    });
    assert.equal(r.ok, true);
    assert.equal(r.saved, 2, 'две годные правки');
    assert.deepEqual(read(root), { edits: {
        'cor:5#2': { deleted: true },
        'room:101#4': { pos: [1, 2, 3], color: '#ffaa00', hidden: true },
    } });
});

test('sanitizeEdit: мусор в числах и цвете отбрасывается, а не ломает файл', () => {
    assert.deepEqual(sanitizeEdit({ pos: [1, 'два', 3] }), undefined, 'вектор не из чисел');
    assert.deepEqual(sanitizeEdit({ pos: [1, 2] }), undefined, 'вектор не из трёх чисел');
    assert.deepEqual(sanitizeEdit({ pos: [1e9, 0, 0] }), undefined, 'неразумная координата');
    assert.deepEqual(sanitizeEdit({ color: 'red' }), undefined, 'имя цвета не hex');
    assert.deepEqual(sanitizeEdit({ color: '#012345' }), { color: '#012345' });
    assert.deepEqual(sanitizeEdit({ glow: -2 }), undefined, 'свечение не отрицательное');
    assert.deepEqual(sanitizeEdit({ hidden: 'yes' }), undefined, 'скрытие — только true');
    assert.deepEqual(sanitizeEdit({ pos: [0.123456, 0, 0] }), { pos: [0.123, 0, 0] }, 'округление до тысячных');
    assert.deepEqual(sanitizeEdit(null), undefined);
    assert.deepEqual(sanitizeEdit([]), undefined);
});

test('saveBoard: осознанный пустой набор — пустой файл, то есть доска как в коде', async () => {
    const root = tempRoot();
    await saveBoard(root, { 'room:1#0': { deleted: true } });
    // без force это отказ (см. тест про затирание); очистка — только явная
    const r = await saveBoard(root, {}, { force: true });
    assert.equal(r.ok, true);
    assert.deepEqual(read(root), { edits: {} });
});

test('saveBoard: прежний файл уходит в бэкап board-*.json', async () => {
    const root = tempRoot();
    await saveBoard(root, { 'room:1#0': { pos: [1, 0, 0] } });
    await saveBoard(root, { 'room:1#0': { pos: [2, 0, 0] } });
    const files = backups(root, 'board');
    assert.equal(files.length, 1);
    assert.match(files[0], /\.json$/);
    assert.deepEqual(read(root).edits['room:1#0'].pos, [2, 0, 0]);
});

test('saveBoard: не объект — отказ, файл не появляется', async () => {
    const root = tempRoot();
    for (const bad of [null, 'строка', 7, [1]]) {
        const r = await saveBoard(root, bad);
        assert.equal(r.ok, false);
        assert.equal(r.code, 'bad_board');
    }
    assert.equal(fs.existsSync(path.join(root, BOARD_REL)), false);
});

test('два файла редактора не мешают друг другу', async () => {
    const root = tempRoot();
    await saveTuning(root, { 'door.beamW': 5.9 });
    await saveBoard(root, { 'room:1#0': { deleted: true } });
    assert.deepEqual(read(root).edits, { 'room:1#0': { deleted: true } });
    assert.ok(fs.existsSync(path.join(root, 'nemesis/client/tuning.json')));
    assert.deepEqual(sanitizeEdits(read(root).edits), { 'room:1#0': { deleted: true } });
});

// --- The tab's markup and strings, without a browser -----------------------------------------

const EDITOR_HTML = fs.readFileSync(path.join(ROOT, '_utils/editor/index.html'), 'utf8');
const PANEL_JS = fs.readFileSync(path.join(ROOT, 'nemesis/client/editor-panel.js'), 'utf8');
const I18N_JS = fs.readFileSync(path.join(ROOT, '_utils/editor/i18n.js'), 'utf8');

test('вкладка Nemesis: всё, к чему обращается модуль, есть на странице', () => {
    const ids = new Set([...EDITOR_HTML.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
    for (const m of PANEL_JS.matchAll(/getElementById\('([^']+)'\)/g)) {
        assert.ok(ids.has(m[1]), '# ' + m[1] + ' должен быть в index.html');
    }
    assert.match(EDITOR_HTML, /data-tab="nemesis"/, 'кнопка вкладки');
    assert.match(EDITOR_HTML, /<script type="module" src="\/nemesis\/client\/editor-panel\.js">/, 'модуль подключён');
    assert.match(fs.readFileSync(path.join(ROOT, '_utils/editor/objects-panel.js'), 'utf8'),
        /TABS: \[[^\]]*'nemesis'[^\]]*\]/, 'PaneTabs знает вкладку');
    for (const id of ['nemesis-part', 'nemesis-edits', 'nemesis-modes', 'btn-nemesis-revert']) {
        assert.ok(ids.has(id), 'вкладка редактирования: #' + id);
    }
});

test('вкладка Nemesis: каждая строка интерфейса есть на EN и RU', () => {
    const en = I18N_JS.slice(I18N_JS.indexOf('en: {'), I18N_JS.indexOf('ru: {'));
    const ru = I18N_JS.slice(I18N_JS.indexOf('ru: {'));
    const keys = new Set([...EDITOR_HTML.matchAll(/data-i18n(?:-title)?="([^"]+)"/g)].map(m => m[1]).filter(k => k.startsWith('nem.')));
    for (const m of PANEL_JS.matchAll(/I18N\.t\('([^']+)'/g)) keys.add(m[1]);
    for (const k of keys) {
        if (!k.startsWith('nem.')) continue;
        assert.ok(en.includes("'" + k + "':"), k + ' — EN');
        assert.ok(ru.includes("'" + k + "':"), k + ' — RU');
    }
});

test('saveBoard: пустой набор НЕ затирает непустой файл без force', async () => {
    const root = tempRoot();
    await saveBoard(root, { 'room:1#0': { pos: [1, 0, 0] }, 'room:1#1': { color: '#112233' } });
    const refused = await saveBoard(root, {});
    assert.equal(refused.ok, false);
    assert.equal(refused.code, 'would_wipe');
    assert.equal(refused.onDisk, 2, 'в отказе сказано, сколько правок спасено');
    assert.equal(Object.keys(read(root).edits).length, 2, 'файл на диске не тронут');
    // панель, которая так и не загрузилась, шлёт мусор — это тоже пустой набор
    const junk = await saveBoard(root, { 'bad id': { pos: [1, 2, 3] } });
    assert.equal(junk.ok, false, 'отброшенный мусор — тоже пустой набор');
    assert.equal(Object.keys(read(root).edits).length, 2);
    // а осознанное «Отменить всё» всё-таки пишет пустой файл
    const forced = await saveBoard(root, {}, { force: true });
    assert.equal(forced.ok, true);
    assert.deepEqual(read(root), { edits: {} });
    assert.equal(backups(root, 'board').length, 1, 'правки, которые спаслись от затирания, лежат в бэкапе');
});

test('saveBoard: пустой набор в пустой файл — можно и без force', async () => {
    const root = tempRoot();
    const r = await saveBoard(root, {});
    assert.equal(r.ok, true, 'первый запуск: стирать нечего');
    assert.deepEqual(read(root), { edits: {} });
});

test('вкладка: «Отменить всё» спрашивает, а Save ждёт загрузки файла', () => {
    assert.match(PANEL_JS, /confirm\(I18N\.t\('nem\.confirmRevertAll'/, 'пустой файл пишется только после подтверждения');
    assert.match(PANEL_JS, /this\.save\(true\)/, 'осознанная очистка идёт с force');
    assert.match(PANEL_JS, /force: force === true/, 'и доезжает до сервера');
    assert.match(PANEL_JS, /this\.loaded = false/, 'до загрузки файла панель помнит, что не загрузилась');
    assert.match(PANEL_JS, /disabled = !dirty \|\| !this\.loaded/, 'Save закрыт, пока файл не прочитан');
});
