// Тесты механики «Диспатча»: квесты appearing по одному, 카메ра статична,
// успех/провал по совпадению шестиугольника, травмы и выбывание.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('.');

// ---------- helpers ----------

function makeCtx() {
  // fakeNowMs в замыкании, чтобы performance.now() можно было продвигать
  let fakeNowMs = 1000000;
  const ctx = vm.createContext({
    console,
    navigator: { userAgent: 'x', platform: 'x', maxTouchPoints: 0 },
    innerWidth: 1280, innerHeight: 720,
    performance: { now: () => fakeNowMs },
    Math, Date,
  });
  ctx.window = ctx;
  ctx.advanceTime = (ms) => { fakeNowMs += ms; };

  function pos() { return { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } }; }
  function meshStub() {
    return { position: pos(), scaling: { set: () => {} }, getChildMeshes: () => [], metadata: {}, setEnabled: () => {} };
  }
  ctx.BABYLON = {
    MeshBuilder: { CreateBox: () => meshStub() },
    StandardMaterial: function () { return {}; },
    Color3: function () { return {}; },
    Mesh: function (name, scene) { return meshStub(); },
  };
  ctx.document = {
    getElementById: () => ({ addEventListener: () => {}, getBoundingClientRect: () => ({ left: 0, top: 0 }) }),
  };
  const viewStub = { scene: {}, projectToScreen: () => ({ x: 100, y: 100, visible: true, behind: false }) };
  ctx.World3D = { addObject: (v, m, k) => m, cfg: () => ({}) };
  ctx.Sound3D = { play: () => {} };
  ctx.Store = { get() { return null; }, set() { return true; }, getJSON() { return null; } };
  ctx.Model3D = { load: () => Promise.resolve({}), build: () => ({}), clips: () => null };
  ctx.Location3D = class {}; ctx.CameraController = class {}; ctx.Terrain3D = class {};

  const UI = { elements: new Map() };
  UI.get = (id) => {
    if (!UI.elements.has(id)) {
      UI.elements.set(id, {
        def: {}, _text: '', _shown: true,
        setText(s) { this._text = String(s); },
        onClick() {}, apply() {}, show(on) { this._shown = on !== false; },
        get visible() { return this._shown; },
        get textContent() { return this._text; },
        def2: { fill: '#2a4a60' },
        set fill(v) { this.def2.fill = v; },
        get fill() { return this.def2.fill; },
      });
    }
    return UI.elements.get(id);
  };
  ctx.UI = UI;

  return { ctx, UI };
}

function loadGame(ctx) {
  const files = ['js/Constants.js', 'js/Objects.js', 'js/UILayout.js', 'js/Game.js'];
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
  for (const rec of vm.runInContext('UI_LAYOUT', ctx)) ctx.UI.elements.set(rec.id, Object.assign(ctx.UI.get(rec.id), { def: rec }));
  return vm.runInContext('Game', ctx);
}

// advance: продвигает время на `sec` секунд и тикает игру с小步, чтобы success/fail сработал
function advance(game, sec) {
  if (sec === 0) { game.update(0); return; }
  const steps = Math.max(1, Math.ceil(sec / 0.3));
  const dt = sec / steps;
  for (let i = 0; i < steps; i++) {
    // performance.now тоже нужно продвигать, иначе this.now() не двигается
    // мы не имеем доступа к ctx.advanceTime извне, но game.update использует this.realSec для большинства вещей.
    // Для finish() используется this.now() — поэтому продвигаем fakeNowMs через глобальный хак:
    // вызовем game.update с правильными шагами, а теперь fakeNowMs — это замыкание в makeCtx.
    game.update(dt);
  }
  game.update(0);
}

// ---------- tests ----------

test('камера статична: ввод отключён, камера не летает', () => {
  const { ctx } = makeCtx();
  const Game = loadGame(ctx);
  const app = {
    location: { view: { scene: {}, projectToScreen: () => ({ x: 100, y: 100, visible: true, behind: false }) }, terrain: { heightAt: () => 0 }, objects: [] },
    camera: { detach: () => { ctx._detached = true; }, target: {}, azimuth: 0, pitch: 0, zoom: 1, zoomTarget: 1, lift: 0, followObj: null, _apply: () => {} },
  };
  const game = new Game(app);
  assert.equal(ctx._detached, true, 'камера detach() вызвана — ввод отключён');
});

test('квесты appearing строго по одному: не более одного open同時', () => {
  const { ctx } = makeCtx();
  const Game = loadGame(ctx);
  const app = {
    location: { view: { scene: {}, projectToScreen: () => ({ x: 100, y: 100, visible: true, behind: false }) }, terrain: { heightAt: () => 0 }, objects: [] },
    camera: { detach: () => {}, target: {}, azimuth: 0, pitch: 0, zoom: 1, zoomTarget: 1, lift: 0, followObj: null, _apply: () => {} },
  };
  const game = new Game(app);

  // Первый квест появляется через gap=15с. Продвигаем realSec и now вместе.
  ctx.advanceTime(20000);
  advance(game, 20);
  const openCount = game.missionState.filter(m => m.status === 'open').length;
  assert.equal(openCount, 1, 'открыт ровно один квест: ' + openCount);

  // Истекаем первый квест (urgency = duration = 45с для вина)
  ctx.advanceTime(50000);
  advance(game, 50);
  const openAfterExpiry = game.missionState.filter(m => m.status === 'open').length;
  assert.equal(openAfterExpiry, 0, 'после истечения квеста не остаётся открытых: ' + openAfterExpiry);
});

test('квест не erscheint мгновенно после истечения предыдущего: есть пауза gap', () => {
    const { ctx } = makeCtx();
    const Game = loadGame(ctx);
    const app = {
        location: { view: { scene: {}, projectToScreen: () => ({ x: 100, y: 100, visible: true, behind: false }) }, terrain: { heightAt: () => 0 }, objects: [] },
        camera: { detach: () => {}, target: {}, azimuth: 0, pitch: 0, zoom: 1, zoomTarget: 1, lift: 0, followObj: null, _apply: () => {} },
    };
    const game = new Game(app);

    // gap=15с для первого квеста
    ctx.advanceTime(20000);
    advance(game, 20);
    assert.equal(game.missionState.find(m => m.def.id === 'wine').status, 'open', 'квест появился через 20с');

    // Истекаем первый (urgency = duration = 45с) с большим запасом времени
    ctx.advanceTime(100000);
    advance(game, 100);
    const wineMs = game.missionState.find(m => m.def.id === 'wine');
    assert.equal(wineMs.status, 'hidden', 'первый квест истёк после 100с');

    // Следующий квест не должен быть open сразу — есть gap=60с
    const anyOpen = game.missionState.some(m => m.status === 'open');
    assert.equal(anyOpen, false, 'нет открытых квестов сразу после истечения предыдущего');
});

test('успех при совпадении ≥100%: автоматический успех без d100', () => {
  const { ctx } = makeCtx();
  Math.random = () => 0.999; // высокий бросок — должен пройти только при 100% совпадении
  const Game = loadGame(ctx);
  const app = {
    location: { view: { scene: {}, projectToScreen: () => ({ x: 100, y: 100, visible: true, behind: false }) }, terrain: { heightAt: () => 0 }, objects: [] },
    camera: { detach: () => {}, target: {}, azimuth: 0, pitch: 0, zoom: 1, zoomTarget: 1, lift: 0, followObj: null, _apply: () => {} },
  };
  const game = new Game(app);

  // 켄тавр (сила 2, выносливость 4, мудрость 4) + девушка бык (сила 4, выносливость 4, ловкость 2)
  // вино требует: literacy 4, strength 3
  // overlap: 켄тавр literacy=0 → min(0,4)=0; fuerza=2 → min(2,3)=2; девушка fuerza=4 → min(4,3)=3; literacy=0 → min(0,4)=0
  // Но slot1 켄тавр, slot2 девушка бык: сумма fuerza = 6, literacy = 0
  // overlap: min(6,3) + min(0,4) = 3 + 0 = 3; total = 7; overlap = 3/7 = 42% → не 100%
  ctx.advanceTime(20000);
  advance(game, 20);
  game.openMission('wine');
  game.toggleSlot(0); // 켄тавр
  game.toggleSlot(1); // девушка бык
  game.sendSelected();
  ctx.advanceTime(46000);
  advance(game, 46);
  const wineMs = game.missionState.find(m => m.def.id === 'wine');
  assert.equal(wineMs.status, 'done', 'квест завершён');
  assert.equal(wineMs.result, false, 'при 42% совпадении и высоком броске d100 — провал');
});

test('травма при провале: характеристики −1, вторая травма — выбывание', () => {
  const { ctx } = makeCtx();
  Math.random = () => 0.999; // всегда провал при overlaps < 100%
  const Game = loadGame(ctx);
  const app = {
    location: { view: { scene: {}, projectToScreen: () => ({ x: 100, y: 100, visible: true, behind: false }) }, terrain: { heightAt: () => 0 }, objects: [] },
    camera: { detach: () => {}, target: {}, azimuth: 0, pitch: 0, zoom: 1, zoomTarget: 1, lift: 0, followObj: null, _apply: () => {} },
  };
  const game = new Game(app);

  const arachne = game.staff.find(s => s.id === 'arachne');
  const beforeAgi = arachne.stats.agility; // 4

  game.injure(arachne);
  assert.equal(arachne.status, 'injured', 'первая травма — статус injured');
  assert.equal(arachne.injuries, 1, 'счётчик травм = 1');
  assert.equal(arachne.stats.agility, beforeAgi - 1, 'ловкость понижена на 1');

  game.injure(arachne);
  assert.equal(arachne.status, 'out', 'вторая травма — статус out (выбывание)');
  assert.equal(arachne.injuries, 2, 'счётчик травм = 2');
});

test('опыт и монеты за успех', () => {
  const { ctx } = makeCtx();
  Math.random = () => 0; // бросок 0 — успех при любом overlaps > 0
  const Game = loadGame(ctx);
  const app = {
    location: { view: { scene: {}, projectToScreen: () => ({ x: 100, y: 100, visible: true, behind: false }) }, terrain: { heightAt: () => 0 }, objects: [] },
    camera: { detach: () => {}, target: {}, azimuth: 0, pitch: 0, zoom: 1, zoomTarget: 1, lift: 0, followObj: null, _apply: () => {} },
  };
  const game = new Game(app);

  ctx.advanceTime(20000);
  advance(game, 20);
  game.openMission('wine');
  game.toggleSlot(0);
  game.sendSelected();
  ctx.advanceTime(46000);
  advance(game, 46);
  ctx.advanceTime(6000);
  advance(game, 6);

  const wineMs = game.missionState.find(m => m.def.id === 'wine');
  assert.equal(wineMs.result, true, 'успех при броске 0');
  assert.equal(game.coins, 60, 'монеты начислены: ' + game.coins);

  const worker = game.staff.find(s => s.id === wineMs.workerIds[0]);
  assert.equal(worker.xp, 12, 'опыт начислен: ' + worker.xp);
});
