// The editor's Nemesis tab writes the board numbers to nemesis/client/tuning.json
// (_utils/editor/save.mjs: saveTuning) — the one file the game reads at boot.
//
// The point of the test is the filtering: the file is shared by an editor page, a game client and
// a hand-edit, so a value from outside the schema must never reach the board.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { saveTuning, TUNING_REL } from '../_utils/editor/save.mjs';
import { DEFAULTS, doorSpec, sanitizeAll, SCHEMA, TUNE } from '../nemesis/client/tuning.js';
import { ROOT } from './browser-scripts.mjs';

const temps = [];
after(() => { for (const dir of temps) fs.rmSync(dir, { recursive: true, force: true }); TUNE.reset(); });

function tempRoot(files = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arcengine-tuning-'));
  temps.push(root);
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  }
  return root;
}
const read = (root) => JSON.parse(fs.readFileSync(path.join(root, TUNING_REL), 'utf8'));
const backups = (root, prefix) => {
  const dir = path.join(root, '_utils', '.backups');
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.startsWith(prefix + '-')).sort() : [];
};

test('saveTuning: пишет только известные ключи и только отличия от кода', async () => {
  const root = tempRoot();
  const r = await saveTuning(root, { 'door.beamW': 3.2, 'evil.key': 1, 'door.postH': 'мусор', 'door.paint': '#AABBCC' });
  assert.equal(r.ok, true);
  assert.equal(r.saved, 2);
  assert.deepEqual(read(root), { values: { 'door.beamW': 3.2, 'door.paint': '#aabbcc' } });
});

test('saveTuning: диапазон зажимается, мусор не проходит', async () => {
  const root = tempRoot();
  await saveTuning(root, { 'door.postH': 999, 'door.beamW': -5 });
  const v = read(root).values;
  assert.equal(v['door.postH'], 2.6, 'выше диапазона — по верхней границе');
  assert.equal(v['door.beamW'], 2.4, 'ниже диапазона — по нижней границе');
});

test('saveTuning: пустой список — пустой файл (сброс к значениям из кода)', async () => {
  const root = tempRoot();
  await saveTuning(root, { 'door.beamW': 3 });
  const r = await saveTuning(root, {});
  assert.equal(r.ok, true);
  assert.equal(r.saved, 0);
  assert.deepEqual(read(root), { values: {} }, 'файл очищен, игра возьмёт таблицу из tuning.js');
});

test('saveTuning: прежний файл уходит в бэкап, со своим расширением', async () => {
  const root = tempRoot();
  await saveTuning(root, { 'door.beamW': 3 });
  await saveTuning(root, { 'door.beamW': 3.6 });
  const files = backups(root, 'tuning');
  assert.equal(files.length, 1, 'одна копия на одно перезаписанное состояние');
  assert.match(files[0], /\.json$/, 'бэкап — json, а не .js');
  assert.equal(read(root).values['door.beamW'], 3.6);
});

test('saveTuning: не объект — отказ, файл не появляется', async () => {
  const root = tempRoot();
  for (const bad of [null, undefined, 'строка', 42, [1, 2]]) {
    const r = await saveTuning(root, bad);
    assert.equal(r.ok, false);
    assert.equal(r.code, 'bad_tuning');
  }
  assert.equal(fs.existsSync(path.join(root, TUNING_REL)), false);
});

test('сохранённое читается обратно и даёт ту же дверь', async () => {
  const root = tempRoot();
  await saveTuning(root, { 'door.beamW': 3.8, 'door.postH': 2.6, 'door.steel': '#9aa4ae' });
  TUNE.reset();
  TUNE.load(sanitizeAll(read(root).values));
  const D = doorSpec();
  assert.equal(D.beamW, 3.8);
  assert.equal(D.postH, 2.6);
  assert.equal(D.steel, '#9aa4ae');
  assert.ok(D.beamW > D.openW, 'балка шире проёма');
  TUNE.reset();
});

test('схема: у каждого пункта подпись на двух языках, дефолт проходит санитайзер', () => {
  assert.ok(Object.keys(DEFAULTS).length >= 10, 'в таблице есть что крутить');
  for (const g of SCHEMA) {
    assert.ok(g.title && g.title.en && g.title.ru, g.id + ': название группы на EN и RU');
    for (const it of g.items) {
      const key = g.id + '.' + it.key;
      assert.ok(it.label && it.label.en && it.label.ru, key + ': подпись на EN и RU');
      assert.equal(sanitizeAll({ [key]: it.v })[key], it.v, key + ': дефолт проходит санитайзер без изменений');
    }
  }
});

// --- The tab in the editor page ------------------------------------------------------------
// No browser here, so what can be checked without one: every id and every interface string the
// Nemesis tab touches actually exists on the page, in both languages. A typo there is a crash on
// open that no headless test would otherwise catch.

const EDITOR_HTML = fs.readFileSync(path.join(ROOT, '_utils/editor/index.html'), 'utf8');
const PANEL_JS = fs.readFileSync(path.join(ROOT, 'nemesis/client/editor-panel.js'), 'utf8');
const I18N_JS = fs.readFileSync(path.join(ROOT, '_utils/editor/i18n.js'), 'utf8');

test('вкладка Nemesis: панель, канвас и кнопки, на которые опирается модуль, есть в index.html', () => {
    const ids = new Set([...EDITOR_HTML.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
    for (const id of ['nemesis-canvas', 'nemesis-groups', 'nemesis-note', 'nemesis-status',
        'nemesis-part', 'nemesis-edits', 'btn-nemesis-save', 'btn-nemesis-revert', 'btn-nemesis-fit', 'btn-nemesis-door']) {
        assert.ok(ids.has(id), 'index.html: #' + id);
    }
    // the module and the page agree on every element it reaches for
    for (const m of PANEL_JS.matchAll(/getElementById\('([^']+)'\)/g)) {
        assert.ok(ids.has(m[1]), 'editor-panel.js: #' + m[1] + ' must exist in index.html');
    }
    // the tab button exists and PaneTabs knows the name
    assert.match(EDITOR_HTML, /data-tab="nemesis"/, 'the tab button');
    assert.match(EDITOR_HTML, /<script type="module" src="\/nemesis\/client\/editor-panel\.js">/, 'the panel module is loaded');
    assert.match(fs.readFileSync(path.join(ROOT, '_utils/editor/objects-panel.js'), 'utf8'),
        /TABS: \[[^\]]*'nemesis'[^\]]*\]/, 'PaneTabs.TABS includes the tab');
});

test('вкладка Nemesis: каждая строка интерфейса есть на EN и RU, каждый ключ существует', () => {
    const dicts = ['en', 'ru'].map(lang => {
        const start = I18N_JS.indexOf(lang + ': {');
        assert.ok(start > 0, 'dictionary ' + lang);
        const other = ['en', 'ru'].map(l => I18N_JS.indexOf(l + ': {')).filter(i => i > start).sort((a, b) => a - b)[0];
        return I18N_JS.slice(start, other || I18N_JS.length);
    });
    const keys = new Set([...EDITOR_HTML.matchAll(/data-i18n(?:-title)?="([^"]+)"/g)]
        .map(m => m[1]).filter(k => k.startsWith('nem.')));
    for (const m of PANEL_JS.matchAll(/I18N\.t\('([^']+)'/g)) if (m[1].startsWith('nem.')) keys.add(m[1]);
    assert.ok(keys.size >= 8, 'the tab has its strings: ' + keys.size);
    for (const key of keys) {
        for (const [i, dict] of dicts.entries()) {
            assert.ok(dict.includes("'" + key + "':"), key + ' — ' + (i ? 'RU' : 'EN') + ' dictionary');
        }
    }
});
