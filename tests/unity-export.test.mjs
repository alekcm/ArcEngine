// Export to Unity (tools/export-unity.mjs): the one coordinate conversion, records with every field
// (JsonUtility gives 0 for a missing one), the terrain heights, the porting report, the package copy
// into the Unity project — and that the export and the importer in unity/ speak the same format.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { API, FORMAT, PACKAGE, eulerToUnity, exportTerrain, modelBounds, normalizeObject, normalizeUI, report, scanGame, syncPackage, toUnity }
  from '../tools/export-unity.mjs';
import { ROOT, loadScripts, stub } from './browser-scripts.mjs';

const temps = [];
after(() => { for (const dir of temps) fs.rmSync(dir, { recursive: true, force: true }); });
function tempDir(files = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'arcengine-unity-'));
  temps.push(root);
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  }
  return root;
}
const near = (a, b, eps, msg) => a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < eps, (msg || '') + ` [${i}] ${v} vs ${b[i]}`));

test('координаты: x/100, высота/100, −y/100; поворот [x, y, z]° -> [−x, y, z]°', () => {
  assert.deepEqual(toUnity(1050, 825, 30), [10.5, 0.3, -8.25]);
  assert.deepEqual(eulerToUnity([10, 34.4, -5]), [-10, 34.4, -5]);
});

test('экспорт и импорт пакета говорят на одном формате, имя пакета совпадает', () => {
  const importer = fs.readFileSync(path.join(ROOT, 'unity', PACKAGE, 'Editor/ArcImporter.cs'), 'utf8');
  assert.equal(Number(importer.match(/public const int Format = (\d+);/)[1]), FORMAT, 'FORMAT в export-unity.mjs и Format в ArcImporter.cs');
  assert.equal(JSON.parse(fs.readFileSync(path.join(ROOT, 'unity', PACKAGE, 'package.json'), 'utf8')).name, PACKAGE);
});

test('запись объекта: все поля, старая форма rot/scale числом читается как в placeObject', () => {
  const o = normalizeObject({ name: 'tree', model: 'assets/models/t.fbx', x: '5', y: 7, rot: 90, scale: 2 });
  assert.deepEqual(o.rot, [0, 90, 0]);
  assert.deepEqual(o.scale, [2, 2, 2]);
  assert.equal(o.x, 5);
  assert.equal(o.kind, 'prop');
  assert.deepEqual(o.sound, { src: '', volume: 1, loop: true, falloffMin: 0, falloffMax: 0 }, 'громкость 1, а не 0 от JsonUtility');
  assert.equal(normalizeObject({ sound: { src: 'a', loop: false, volume: 0.2 } }).sound.loop, false);
  assert.deepEqual(normalizeObject({ scale: [0, -1, 3] }).scale, [1, 1, 3], 'неположительный масштаб — 1');
});

test('запись UI: дефолты вида под записью — альфа и видимость не обнуляются', () => {
  const UI = loadScripts(['js/Constants.js', 'js/UI.js']).get('UI');
  const t = normalizeUI({ id: 'score', kind: 'text', text: 'x' }, UI.DEFAULTS);
  assert.equal(t.alpha, 1);
  assert.equal(t.visible, 1);
  assert.equal(t.fontSize, UI.DEFAULTS.text.fontSize);
  const b = normalizeUI({ id: 'hp', kind: 'bar', visible: 0 }, UI.DEFAULTS);
  assert.equal(b.visible, 0, 'скрытый остаётся скрытым');
  assert.equal(b.w, UI.DEFAULTS.bar.w);
});

test('земля: terrain.bytes — узлы сетки как в Terrain3D, за ними кольцо (шум − 1 px)', () => {
  const page = loadScripts(['js/Constants.js', 'libs/simplex-noise.js', 'js/Terrain3D.js'], { BABYLON: stub(), World3D: stub() });
  const T = new (page.get('Terrain3D'))({ scene: stub() }, { worldW: 256, worldH: 128, cell: 8 });
  const { meta, bytes } = exportTerrain(T);
  const f = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
  assert.equal(f.length, meta.grid.nx * meta.grid.ny + meta.ring.nx * meta.ring.ny);
  assert.equal(f[5], T.hgrid[5]);
  assert.equal(f[f.length - 1], Math.fround(T.terrainNoise(meta.ring.x0 + (meta.ring.nx - 1) * meta.ring.cell, meta.ring.y0 + (meta.ring.ny - 1) * meta.ring.cell) - 1));
  assert.equal(meta.ring.holeX1, (T.nx - 1) * T.cell);
});

test('габариты GLB-модели в метрах Unity: место, рост, разворот', async () => {
  const o = normalizeObject({ name: 'hero', model: 'assets/models/character.glb', x: 1000, y: 500, h: 0, rot: [0, 0, 0], scale: [0.25, 0.25, 0.25] });
  const [b] = await modelBounds(ROOT, [o], () => 30);
  near([(b.min[0] + b.max[0]) / 2, (b.min[2] + b.max[2]) / 2], [10, -5], 0.05, 'над точкой карты');
  assert.ok(Math.abs(b.max[1] - b.min[1] - 1.865 * 0.25) < 0.02, 'рост 1,865 м × 0,25');
  assert.ok(Math.abs(b.min[1] - 0.3) < 0.02, 'стоит на земле (30 px)');
  // glTF front +Z -> the kit's nose +X: the model's front half (z > 0 in the file) is on +X in Unity.
  const [turned] = await modelBounds(ROOT, [{ ...o, rot: [0, 180, 0] }], () => 30);
  near([b.centroid[0] - 10, b.centroid[2] + 5], [-(turned.centroid[0] - 10), -(turned.centroid[2] + 5)], 1e-3, 'разворот на 180° отражает центр вершин');
});

test('отчёт: вызовы игры и их двойники, что без двойника, контракт сцены', () => {
  const root = tempDir({ 'js/Game.js': [
    "const hero = app.location.findByTag('player')[0];",
    "UI.get('score').setText('1'); UI.get('lives').setValue(0.5);",
    "const box = BABYLON.MeshBuilder.CreateBox('b', {}, scene); // UI.get('commented') не считается",
    'const k = typeof GAME_SPEED !== \'undefined\' ? GAME_SPEED : 2;',
  ].join('\n') });
  const scan = scanGame(root, ['js/Game.js']);
  const row = (src) => scan.rows.find(r => r.js === src);
  assert.equal(row(API.find(a => a[1].startsWith('UI.Get'))[0].source).count, 1);
  assert.equal(row(API.find(a => a[1].startsWith('app.Location.FindByTag'))[0].source).first, 'js/Game.js:1');
  assert.ok(scan.rows.some(r => r.note === 'manual' && r.js.includes('BABYLON')), 'BABYLON — руками');
  assert.deepEqual(scan.uiIds.sort(), ['lives', 'score']);
  const md = report({ files: ['js/Game.js'], scan, diff: { base: null, why: 'нет тега arc-base' },
    constants: { numbers: [{ name: 'GAME_SPEED', value: 2 }], strings: [] },
    objects: [normalizeObject({ tag: 'player' })], layout: [{ id: 'score' }], assets: [], bounds: [null] });
  assert.match(md, /`lives` \*\*нет в UILayout\.js\*\*/);
  assert.doesNotMatch(md, /`player` \*\*нет/);
  assert.match(md, /`GAME_SPEED` = 2/);
  assert.match(md, /git tag arc-base/);
  assert.match(md, /\*\*Нет шапки\*\*/, 'файл без шапки помечен');
});

test('отчёт: шапка файла — описание фичи; обращение к набору, которого нет в таблице, — «проверить»', () => {
  const root = tempDir({
    'js/Jetpack.js': [
      '// Jetpack.js — a jetpack: hold Space to fly, fuel runs out in JETPACK_FUEL_SEC.',
      '// Lands by itself when the fuel is gone.',
      '',
      "UI.get('fuel').setValue(UI.scale());",
      'app.location.loadGround(); app.location.findByTag("pad");',
      'const back = window.location.href; World3D.engine.getFps();',
    ].join('\n'),
    'js/Shop.js': '/*\n * Shop.js — buy upgrades between rounds.\n */\nconst x = 1;',
  });
  const scan = scanGame(root, ['js/Jetpack.js', 'js/Shop.js']);
  assert.equal(scan.headers['js/Jetpack.js'], 'Jetpack.js — a jetpack: hold Space to fly, fuel runs out in JETPACK_FUEL_SEC.\nLands by itself when the fuel is gone.');
  assert.equal(scan.headers['js/Shop.js'], 'Shop.js — buy upgrades between rounds.');
  assert.deepEqual(scan.unknown.map(u => u.call).sort(), ['UI.scale', 'location.loadGround'],
    'известные (UI.get, findByTag, getFps) и window.location — не в списке');
  const md = report({ files: ['js/Jetpack.js', 'js/Shop.js'], scan, diff: { base: 'abc1234', files: [] },
    constants: { numbers: [], strings: [] }, objects: [], layout: [], assets: [], bounds: [] });
  assert.match(md, /### `js\/Jetpack\.js`\n\n> Jetpack\.js — a jetpack/);
  assert.match(md, /\| `UI\.scale` \| 1 \| js\/Jetpack\.js:4 \|/);
});

test('пакет: копия в Packages/ проекта; правка пользователя не затирается; ссылка из manifest — без копии', () => {
  const project = tempDir({ 'Packages/manifest.json': '{"dependencies":{}}' });
  const first = syncPackage(ROOT, project);
  assert.equal(first.mode, 'embedded');
  const arc = path.join(project, 'Packages', PACKAGE, 'Runtime/Arc.cs');
  assert.equal(fs.readFileSync(arc, 'utf8'), fs.readFileSync(path.join(ROOT, 'unity', PACKAGE, 'Runtime/Arc.cs'), 'utf8'));
  fs.appendFileSync(arc, '// правка в Unity\n');
  const second = syncPackage(ROOT, project);
  assert.deepEqual(second.kept, ['Runtime/Arc.cs']);
  assert.match(fs.readFileSync(arc, 'utf8'), /правка в Unity/);
  const linked = tempDir({ 'Packages/manifest.json': JSON.stringify({ dependencies: { [PACKAGE]: 'file:../elsewhere' } }) });
  assert.equal(syncPackage(ROOT, linked).mode, 'manifest');
  assert.ok(!fs.existsSync(path.join(linked, 'Packages', PACKAGE)));
});
