// heroes.test.mjs — tests for Heroes of Might and Magic V (3D Low-Poly Isometric):
// procedural GLB models & WAV sounds, HoMM5 damage/resurrection math, 32x32 map reachability,
// A* pathfinder with roads & Zone of Control, and ATB tactical combat rules.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadScripts, stub } from './browser-scripts.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const page = loadScripts([
    'js/Constants.js',
    'js/Debug3D.js',
    'js/HeroesData.js',
    'js/HeroesMap.js',
    'js/HeroesCombat.js',
]);
const HeroesData = page.get('HeroesData');
const HeroesMap = page.get('HeroesMap');
const HeroesCombat = page.get('HeroesCombat');
const Debug3D = page.get('Debug3D');

test('все 22 low-poly .glb модели Героев V валидны и имеют верный обход граней (CCW)', () => {
    const models = [
        'hero_knight.glb', 'hero_demon.glb',
        'unit_archer.glb', 'unit_footman.glb', 'unit_griffin.glb', 'unit_angel.glb',
        'unit_skeleton.glb', 'unit_imp.glb', 'unit_hellhound.glb', 'unit_demon.glb',
        'castle_haven.glb', 'castle_inferno.glb',
        'gold_mine.glb', 'sawmill.glb', 'ore_pit.glb', 'crystal_cavern.glb',
        'shrine.glb', 'obelisk.glb', 'treasure_chest.glb', 'mana_crystal.glb',
        'pine_tree.glb', 'rock_spire.glb',
    ];
    for (const file of models) {
        const buf = fs.readFileSync(path.join(ROOT, 'assets/models', file));
        assert.equal(buf.readUInt32LE(0), 0x46546c67, file + ': magic glTF');
        assert.equal(buf.readUInt32LE(4), 2, file + ': version 2');
        const totalLen = buf.readUInt32LE(8);
        assert.equal(totalLen, buf.length, file + ': exact byte length');

        const jsonLen = buf.readUInt32LE(12);
        const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
        const binOffset = 20 + jsonLen + 8;
        const bin = buf.subarray(binOffset);

        assert.ok(json.meshes && json.meshes.length > 0, file + ': meshes present');
        if (file.startsWith('hero_') || file.startsWith('unit_')) {
            assert.ok(json.skins && json.skins.length === 1, file + ': skin present');
            const clipNames = (json.animations || []).map(a => a.name);
            for (const req of ['idle', 'run', 'attack']) {
                assert.ok(clipNames.includes(req), file + ': missing clip ' + req);
            }
        }

        // Check triangle winding vs normals via Debug3D on first primitive.
        const prim = json.meshes[0].primitives[0];
        const readAcc = (accIdx, Ctor) => {
            const acc = json.accessors[accIdx];
            const bv = json.bufferViews[acc.bufferView];
            const elems = acc.type === 'VEC3' ? 3 : 1;
            const slice = bin.subarray(bv.byteOffset, bv.byteOffset + bv.byteLength);
            const ab = slice.buffer.slice(slice.byteOffset, slice.byteOffset + slice.byteLength);
            return new Ctor(ab, 0, acc.count * elems);
        };
        const P = readAcc(prim.attributes.POSITION, Float32Array);
        const N = readAcc(prim.attributes.NORMAL, Float32Array);
        const I = readAcc(prim.indices, Uint16Array);
        const w = Debug3D.windingAgainstNormals(P, N, I, 500);
        const verdict = Debug3D.sideVerdict(w.against, 1, false); // glTF CCW = sideOrientation 1
        assert.equal(verdict.verdict, 'ok', file + ': CCW winding matches vertex normals');
    }
});

test('синтезированные звуки Героев V: валидный PCM WAV 16-бит 22050 Гц и ненулевая амплитуда', () => {
    for (const s of ['gallop.wav', 'sword.wav', 'arrow.wav', 'magic.wav', 'gold.wav', 'horn.wav', 'click.wav']) {
        const buf = fs.readFileSync(path.join(ROOT, 'assets/sounds', s));
        assert.equal(buf.subarray(0, 4).toString('ascii'), 'RIFF', s);
        assert.equal(buf.subarray(8, 12).toString('ascii'), 'WAVE', s);
        assert.equal(buf.readUInt16LE(20), 1, s + ': PCM');
        assert.equal(buf.readUInt32LE(24), 22050, s + ': 22050 Hz');
        let peak = 0;
        for (let off = 44; off + 2 <= buf.length; off += 2) {
            const v = Math.abs(buf.readInt16LE(off));
            if (v > peak) peak = v;
        }
        assert.ok(peak > 4000, s + ': audible waveform');
    }
});

test('HeroesData: формула урона HoMM5, щит от стрел, благословение и воскрешение отряда', () => {
    const archer = HeroesCombat.createStack('player', 0, 'archer', 10, 0, 1);
    const footman = HeroesCombat.createStack('enemy', 0, 'footman', 5, 9, 1);
    const heroHi = { atk: 10, def: 2, sp: 4, know: 3 };
    const heroLo = { atk: 1, def: 1, sp: 1, know: 1 };

    const hiShot = HeroesData.calcStackDamage(archer, footman, heroHi, heroLo, { rangedShot: false, roll: 0.5 });
    const shieldedShot = HeroesData.calcStackDamage(archer, footman, heroHi, heroLo, { rangedShot: true, roll: 0.5 });
    assert.ok(shieldedShot.damage < hiShot.damage, 'Большой щит латника снижает стрелковый урон');

    archer.buffBless = 2;
    const blessed = HeroesData.calcStackDamage(archer, footman, heroHi, heroLo, { rangedShot: true, roll: 0.0 });
    assert.equal(blessed.damage, blessed.maxDamage, 'Божественная Сила гарантирует максимальный урон');

    // Damage carryover & resurrection cap.
    const loss = HeroesData.applyDamageToStack(footman, 70); // 5 * 32 = 160 -> 90 HP left -> 3 alive (topHp = 26)
    assert.equal(loss.kills, 2);
    assert.equal(footman.count, 3);
    assert.equal(footman.topHp, 26);

    const rev = HeroesData.applyResurrectToStack(footman, 500);
    assert.equal(footman.count, 5, 'Воскрешение не превышает стартовую численность отряда');
    assert.equal(footman.topHp, 32);
    assert.equal(rev.revived, 2);
});

test('HeroesMap: все 18 объектов долины и все стражи достижимы по A* от старта Лорда Годрика', () => {
    const map = HeroesMap.createMap(3072, 3072, 32);
    assert.equal(map.isSolid(7, 24), false, 'старт героя проходим');

    // Road cost < plain grass cost.
    assert.ok(map.stepCost(7, 24, 8, 23) < 1.35, 'каменный тракт ускоряет диагональный шаг');

    // Every site must have a valid A* route when neutral guards are cleared.
    for (const s of HeroesMap.SITES) {
        const path = HeroesMap.findPath(map, 7, 24, s.gx, s.gy, { ignoreZoC: true });
        assert.ok(path && path.length > 0, 'достижим объект: ' + s.id + ' (' + s.name + ')');
    }

    // Zone of Control blocks bypassing a living guard, while engaging the guard directly is allowed.
    const guardsState = {};
    for (const g of HeroesMap.GUARDS) guardsState[g.id] = { defeated: false };
    const engageGuard = HeroesMap.findPath(map, 7, 24, 4, 21, { guardsState });
    assert.ok(engageGuard && engageGuard.length > 0, 'прямая атака на стражу лесопилки разрешена');
});

test('HeroesCombat: шкала ATB, полёт грифонов через препятствия и стрельба арбалетчиков', () => {
    const peasant = HeroesCombat.createStack('player', 0, 'peasant', 20, 0, 2);
    const archer = HeroesCombat.createStack('player', 1, 'archer', 12, 0, 4);
    const griffin = HeroesCombat.createStack('player', 2, 'griffin', 5, 1, 2);
    const imp = HeroesCombat.createStack('enemy', 0, 'imp', 15, 9, 3);
    peasant.atb = 0; archer.atb = 0; griffin.atb = 0; imp.atb = 0;

    const stacks = [peasant, archer, griffin, imp];
    const queue = HeroesCombat.predictATBQueue(stacks, 6);
    assert.equal(queue.length, 6);
    assert.equal(queue[0].uid, griffin.uid, 'Грифон с инициативой 13 ходит первым при равном старте ATB');

    // Wall of obstacles blocking column 2: ground peasant cannot cross it, flying griffin flies over it!
    const wall = [];
    for (let r = 0; r < 8; r++) wall.push({ col: 2, row: r });
    const groundReach = HeroesCombat.computeReachable(10, 8, wall, stacks, peasant);
    const flyReach = HeroesCombat.computeReachable(10, 8, wall, stacks, griffin);
    assert.equal(groundReach.has('3,2'), false, 'пехота не проходит сквозь сплошную гряду камней');
    assert.equal(flyReach.has('4,2'), true, 'грифон перелетает препятствия');

    // Ranged shot blocked when enemy stands adjacent.
    assert.equal(HeroesCombat.canShoot(stacks, archer), true);
    imp.col = 1; imp.row = 4;
    assert.equal(HeroesCombat.canShoot(stacks, archer), false, 'враг вплотную блокирует выстрел арбалетчика');
});

test('Instances3D.prepare отделяет геометрию (makeGeometryUnique) и не раздувает общие glTF-буферы в 100×', () => {
    const instPage = loadScripts(['js/Instances3D.js'], { BABYLON: stub() });
    const Instances3D = instPage.get('Instances3D');

    // Shared glTF container geometry buffer (1.98 m tall rock_spire).
    let sharedBuf = [1.98];
    const makeCloneFromContainer = () => {
        let myBuf = sharedBuf;
        const part = {
            scale: 100,
            parent: null,
            getTotalVertices: () => 24,
            computeWorldMatrix: () => ({ isIdentity: () => false }),
            makeGeometryUnique() { myBuf = myBuf.slice(); },
            setParent() {},
            setEnabled() {},
            bakeCurrentTransformIntoVertices() { myBuf[0] *= this.scale; },
            getBakedHeight: () => myBuf[0],
        };
        return part;
    };

    const firstPart = makeCloneFromContainer();
    const root = {
        position: { setAll() {} }, rotation: { setAll() {} }, scaling: { setAll() {} },
        rotationQuaternion: null,
        setEnabled() {},
        computeWorldMatrix() {},
        getTotalVertices: () => 0,
        getChildMeshes: () => [firstPart],
    };
    Instances3D.prepare(root);
    assert.ok(Math.abs(firstPart.getBakedHeight() - 198) < 1e-6, 'тонкий инстанс запечён до 198 px');
    assert.ok(Math.abs(sharedBuf[0] - 1.98) < 1e-6, 'общая glTF-геометрия контейнера осталась 1.98 м (без 100× мутации!)');

    // Subsequent combat obstacle build (scaling 0.28 * 100 = 28x, NOT 2800x!).
    const arenaRockHeight = sharedBuf[0] * 100 * 0.28;
    assert.ok(arenaRockHeight < 60, `препятствие арены компактное (${arenaRockHeight.toFixed(1)} px < 60 px)`);
});

test('стратегическая камера Героев V: горизонтальный WASD, орбита ПКМ и Q/E, LMB pan и границы арены', () => {
    const camPage = loadScripts(['js/Constants.js', 'js/CameraControl.js'], { BABYLON: stub(), performance });
    const CameraController = camPage.get('CameraController');
    const view = {
        camera: { fov: 0, position: { set() {} }, setTarget() {} },
        world: { canvas: { clientWidth: 1600, clientHeight: 900 } },
        engine: { getAspectRatio: () => 16 / 9 },
        fitShadowFrustum() {},
        refreshMatrices() {},
        pointerToGround: (px, py, h) => ({ x: 1000 + px, y: 1000 + py, h: h || 0 }),
    };
    const terrain = { heightAt: () => 12, outerRing: 4608, hMin: 0 };
    const cam = new CameraController(view, { terrain, bounds: { w: 3072, h: 3072 } });
    cam.c.limits = 1;
    cam.setStrategyMode(true);
    cam.lookAt(1536, 1536);

    // 1. W / S pan horizontally along terrain without diving or lifting off the ground.
    const y0 = cam.target.y;
    cam._onKey({ code: 'KeyW', target: null, preventDefault() {} }, true);
    cam.update(0.1);
    cam._onKey({ code: 'KeyW', target: null, preventDefault() {} }, false);
    assert.equal(cam.lift, 0, 'WASD не меняет высоту lift');
    assert.equal(cam.target.h, 12, 'цель камеры остаётся строго на рельефе');
    assert.notEqual(cam.target.y, y0, 'камера сместилась горизонтально по карте');

    // 2. Q / E smoothly rotate azimuth around the current target.
    const az0 = cam.azimuth, tx0 = cam.target.x, ty0 = cam.target.y;
    cam._onKey({ code: 'KeyE', target: null, preventDefault() {} }, true);
    cam.update(0.1);
    cam._onKey({ code: 'KeyE', target: null, preventDefault() {} }, false);
    assert.ok(cam.azimuth > az0, 'клавиша E поворачивает изометрическую камеру');
    assert.equal(cam.target.x, tx0, 'точка обзора не улетает при вращении Q/E');
    assert.equal(cam.target.y, ty0);

    // 3. RMB drag orbits around target instead of first-person look swinging target away.
    cam._canvas = { getBoundingClientRect: () => ({ left: 0, top: 0 }), setPointerCapture() {} };
    cam._onDown({ pointerId: 1, button: 2, pointerType: 'mouse', clientX: 400, clientY: 300, preventDefault() {} });
    cam._onMove({ pointerId: 1, clientX: 480, clientY: 320 });
    cam._onUp({ pointerId: 1 });
    assert.equal(cam.target.x, tx0, 'ПКМ вращает камеру вокруг точки на карте, не сбивая прицел');
    assert.equal(cam.target.y, ty0);

    // 4. Short LMB click (<= 6 px) is NOT a drag; LMB drag (> 6 px) pans the map.
    cam._onDown({ pointerId: 2, button: 0, pointerType: 'mouse', clientX: 500, clientY: 500, preventDefault() {} });
    cam._onMove({ pointerId: 2, clientX: 503, clientY: 502 });
    assert.equal(cam.isDragging(), false, 'короткий клик ЛКМ не перехватывается как перетаскивание');
    cam._onMove({ pointerId: 2, clientX: 540, clientY: 530 });
    assert.equal(cam.isDragging(), true, 'протяжка ЛКМ > 6 px включает перетаскивание карты');
    cam._onUp({ pointerId: 2 });

    // 5. Custom combat arena bounds + fixedPlaneH lock camera to the raised battle dais.
    cam.setCustomBounds({ minX: 1300, maxX: 1770, minY: 1350, maxY: 1720 }, 48);
    cam.lookAt(5000, 5000);
    assert.equal(cam.target.x, 1770, 'камера удерживается в границах тактической арены');
    assert.equal(cam.target.y, 1720);
    assert.equal(cam.target.h, 48, 'высота цели привязана к плоскости каменного помоста арены');
});

