// ============================================================================
//  fs-screens.mjs — экраны, которые видит игрок
// ----------------------------------------------------------------------------
//  node tools/fs-screens.mjs
//
//  Проверки правил держат движок: 278 проверок и 94 мутации в fs-audit.
//  А игра при этом может быть непроходимой — так и случилось дважды:
//
//    * лобби не рисовалось вовсе: FSUI.lobby() вызывает renderModern(null),
//      а renderModern спрашивал у GamePhase.of(null) метод .is(). Исключение
//      срывало отрисовку ДО меню, и игрок видел пустую сцену;
//    * на карте миры съезжали к центру тайла (четверть тайла умножалась на
//      половину стороны области), а в панели участников печатался исходник
//      замыкания вместо чисел жетонов.
//
//  * ПКМ в игре не водила карту (запертый азимут выключал и поворот, и панораму),
//    а Q/E, принадлежа камере, мешали игре: они же поворачивают тайл и играют
//    карты боя.
//
//  Ни одну из этих поломок не ловила ни одна проверка правил. Здесь то же,
//  что fs-audit делает для правил: каждая проверка строит ровно тот случай и
//  смотрит, что получилось на экране. Мутации — в fs-mutate-screens.mjs.
// ============================================================================
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import url from 'node:url';
import { createRequire } from 'node:module';
import { createEngineContext } from './fs-engine.mjs';

export const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');

const C = { r: '\x1b[0m', b: '\x1b[1m', dim: '\x1b[2m', red: '\x1b[31m', grn: '\x1b[32m', yel: '\x1b[33m' };
const filter = process.argv[2] || '';
let done = 0;
const failed = [];

function head(text) { console.log('\n' + C.b + '  ' + text + C.r); }

/** Одна проверка экрана: имя, что она утверждает, и тело. */
function screen(id, text, fn) {
    if (filter && !(id + ' ' + text).toLowerCase().includes(filter.toLowerCase())) return;
    done++;
    try {
        const res = fn();
        if (res === true || res === undefined) {
            console.log('  ' + C.grn + 'ok  ' + C.r + C.dim + id + C.r + '  ' + text);
        } else {
            failed.push({ id, why: String(res) });
            console.log('  ' + C.red + 'FAIL' + C.r + ' ' + id + '  ' + text + '\n       ' + C.red + res + C.r);
        }
    } catch (e) {
        failed.push({ id, why: e && e.message });
        console.log('  ' + C.red + 'FAIL' + C.r + ' ' + id + '  ' + text + '\n       ' + C.red + (e && e.message) + C.r);
    }
}

// --- the page: the engine plus a DOM the panel can actually draw into -------
const ctx = createEngineContext();
const nothing = () => undefined;

/** A node of the stand-in DOM: a real tree, so a check can read what was drawn. */
function el(tag) {
    const node = {
        tagName: String(tag || 'div').toUpperCase(), children: [], className: '', id: '', textContent: '',
        title: '', type: '', value: '', maxLength: 0, disabled: false, dataset: {}, style: { setProperty: nothing, removeProperty: nothing },
        classList: { add: nothing, remove: nothing, toggle: nothing, contains: () => false },
        append(...xs) { for (const x of xs) this.children.push(x); },
        appendChild(x) { this.children.push(x); return x; },
        contains(x) { return this.children.includes(x); },
        removeChild(x) { const i = this.children.indexOf(x); if (i >= 0) this.children.splice(i, 1); },
        replaceChildren(...xs) { this.children = xs; },
        remove: nothing, setAttribute: nothing, getAttribute: () => null,
        addEventListener: nothing, removeEventListener: nothing, focus: nothing, blur: nothing,
        getContext: () => null, getBoundingClientRect: () => ({ width: 0, height: 0, left: 0, top: 0 }),
        querySelector: () => null, querySelectorAll: () => [],
    };
    return node;
}

Object.assign(ctx, {
    document: Object.assign(ctx.document || {}, {
        body: el('body'), documentElement: el('html'), createElement: el,
        getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener: nothing,
    }),
    // window — сам контекст, но клавиши камера слушает на нём: без этих двух
    // методов attach() падает, и «работает ли ПКМ» проверить нечем.
    window: null,
    innerWidth: 1400,
    innerHeight: 900,
    IS_MOBILE: false,
    localStorage: { getItem: () => null, setItem: nothing, removeItem: nothing },
    navigator: { userAgent: 'screens', clipboard: null },
    requestAnimationFrame: () => 0,
    performance: { now: () => 0 },
    // Константы вида из js/Constants.js: клиент читает их как обычные имена.
    FS_TILE_PX: 260, FS_CAMERA_ZOOM: 0.62, FS_CAMERA_PITCH_DEG: 62,
    setInterval: nothing, clearInterval: nothing,
    // Babylon нужен камере только чтобы положить позицию и точку взгляда:
    // настоящий вектор заменяем тем же, что и всё остальное, — заглушкой.
    BABYLON: { Vector3: function (x, y, z) { this.x = x; this.y = y; this.z = z; } },
});
ctx.addEventListener = nothing;
ctx.removeEventListener = nothing;
ctx.window = ctx;
ctx.UI = { root: null, get: () => null, def: () => ({}), init: nothing, add: nothing, set: nothing, removeAll: nothing, text: nothing, show: nothing };
ctx.Store = { get: () => '', set: nothing, del: nothing };

// Клиент и панель — те же файлы и тот же порядок, что в index.html.
for (const file of ['js/CameraControl.js', 'js/fs/FSIcons.js', 'js/fs/FSView.js', 'js/fs/FSUI.js', 'js/fs/FSGame.js']) {
    try {
        vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), ctx, { filename: file });
    } catch (e) {
        // Экран грузится и без клиента: проверки панели важнее клиента сети.
        console.log('  ' + C.yel + 'предупреждение' + C.r + ' ' + file + ': ' + e.message);
    }
}
const FSUI = vm.runInContext('FSUI', ctx);
const FS_RULES = vm.runInContext('FS_RULES', ctx);
const FS_VIEW = vm.runInContext('FSView', ctx);
const TILE_GEOMETRY = vm.runInContext('TileGeometry', ctx);
const CAMERA = vm.runInContext('CameraController', ctx);
const FS_GAME = vm.runInContext('FSGame', ctx);
const BOARD_SETUP = vm.runInContext('BoardSetup', ctx);
FSUI.modernRoot = el();

const SEAT_PLAYERS = [
    { faction: 'имперская-гвардия', name: 'Алекс', id: 'p0' },
    { faction: 'некроны', name: 'Противник', id: 'p1' },
];
const party = seed => FS_RULES.newReadyGame({ seed: seed || 'screens', players: SEAT_PLAYERS });

const SCREEN_CTX = { mode: 'idle', title: '', text: '', status: '' };

/** Экран лобби — ровно так, как его рисует клиент сразу после подключения. */
function drawLobby() {
    FSUI.lobby({
        code: 'ABCD', name: 'Проба', faction: '', palette: null, players: [],
        factions: [{ id: 'некроны', name: 'Некроны', color: '#3f7d4e' }], link: 'http://localhost/?room=ABCD',
        modes: [{ id: 'game', icon: 'ui.menu', title: 'Обычная игра', text: '…' }], mode: 'game',
        status: '', battle: { kind: 'ground', units: {}, cards: [], total: 0, deck: 0 },
        onMode: nothing, onBattle: nothing, onStart: nothing, onPalette: nothing,
    }, nothing, nothing);
}

/** Сколько узлов в дереве экрана. */
function countNodes(root) {
    let n = 0;
    (function walk(x) {
        n++;
        for (const c of (x && x.children) || []) walk(c);
    })(root);
    return n;
}

/** Все тексты узлов дерева. */
function textsOf(root) {
    const out = [];
    (function walk(n) {
        if (!n) return;
        const t = String(n.textContent || '').trim();
        if (t) out.push(t);
        for (const c of n.children || []) walk(c);
    })(root);
    return out;
}

// ============================================================================
head('Лобби: экран, с которого начинается игра');

screen('lobby-1', 'лобби рисуется без состояния — до партии состояния ещё нет', () => {
    // Раньше здесь падало: GamePhase.of(null) не имеет .is(), и исключение
    // срывало отрисовку ДО меню — на экране оставалась пустая сцена.
    drawLobby();
    const texts = textsOf(FSUI.modernRoot);
    if (!texts.some(t => /Forbidden Stars/i.test(t))) throw new Error('в лобби нет заголовка игры');
    if (!texts.some(t => /Обычная игра/.test(t))) throw new Error('в лобби нет выбора режима');
    return true;
});

screen('lobby-2', 'после партии лобби не остаётся на экране — уходит по первой же отрисовке', () => {
    drawLobby();
    if (!FSUI.currentLobby) throw new Error('лобби не показано — проверять нечего');
    FSUI.update(party('lobby-2'), SCREEN_CTX);
    const classes = [];
    (function walk(n) {
        if (!n) return;
        classes.push(String(n.className || ''));
        for (const c of n.children || []) walk(c);
    })(FSUI.modernRoot);
    // Лобби — это `fs-lobby`; панель партии — `fs-topbar`. Если отрисовка не
    // вышла из режима лобби, на экране окажутся оба.
    if (classes.some(c => /(^|\s)fs-lobby(\s|$)/.test(c))) return 'лобби осталось поверх партии (fs-lobby в дереве)';
    if (!classes.some(c => /(^|\s)fs-topbar(\s|$)/.test(c))) return 'панель партии не нарисована (нет fs-topbar)';
    const texts = textsOf(FSUI.modernRoot);
    if (texts.some(t => /Стратегическая игра · 2–4 игрока/.test(t))) return 'текст лобби остался на экране';
    return true;
});

// ============================================================================
head('Панель участников: что в ней напечатано');

screen('panel-1', 'панель участников печатает числа жетонов, а не исходник замыкания', () => {
    const st = party('panel-1');
    st.players[0].assets = { forge: 1, cache: 2, reinforcement: 0 };
    st.players[1].assets = { forge: 0, cache: 0, reinforcement: 0 };
    FSUI.update(st, SCREEN_CTX);
    const texts = textsOf(FSUI.modernRoot);
    // На экране был текст «kind => (face ? face.assetCount(kind) : 0)»: в
    // строку ресурсов передавали функцию, а не её значение.
    const leaked = texts.filter(t => /=>|assetCount|face \?/.test(t));
    if (leaked.length) return 'в панели исходник замыкания: ' + leaked[0];
    return true;
});

screen('panel-2', 'три значка ресурсов показывают ровно то, что лежит у игрока', () => {
    const st = party('panel-2');
    st.players[0].assets = { forge: 1, cache: 2, reinforcement: 3 };
    FSUI.update(st, SCREEN_CTX);
    const chips = [];
    (function walk(n) {
        if (!n) return;
        if (String(n.className || '').includes('fs-asset-chip')) {
            chips.push(textsOf(n).join('|'));
        }
        for (const c of n.children || []) walk(c);
    })(FSUI.modernRoot);
    if (chips.length !== 6) return 'значков ресурсов ' + chips.length + ', ждали 6 (по три на игрока)';
    const mine = chips.slice(0, 3).join(' ');
    for (const n of ['1', '2', '3']) {
        if (!new RegExp('(^|\\|)' + n + '($|\\|)').test(chips.slice(0, 3).join('|'))) {
            return 'у первого игрока нет числа ' + n + ' (видно: ' + mine + ')';
        }
    }
    return true;
});

screen('panel-3', 'панель партии рисуется на настоящей партии', () => {
    const st = party('panel-3');
    FSUI.update(st, SCREEN_CTX);
    const texts = textsOf(FSUI.modernRoot);
    if (!texts.some(t => /FORBIDDEN STARS/.test(t))) return 'нет верхней плашки игры';
    if (!texts.some(t => /Раунд 1/.test(t))) return 'нет номера раунда';
    return true;
});

// ============================================================================
head('Камера: правая кнопка и высота');

/**
 * Камера на заглушке вида. Babylon нужен только в _syncCamera — его
 * подменяем, всё остальное (углы, пределы, ввод) настоящее.
 */
function cameraOnBoard() {
    const scene = {
        camera: { position: { set: nothing }, setTarget: nothing, fov: 0 },
        world: { canvas: { clientWidth: 1400, clientHeight: 900 } },
        engine: { getAspectRatio: () => 16 / 9 },
        refreshMatrices: nothing,
        pointerToGround: (px, py) => ({ x: px, y: py }),
        fitShadowFrustum: nothing,
    };
    const cam = new CAMERA(scene, { bounds: { w: 520, h: 780 } });
    cam.attach({ addEventListener: nothing, removeEventListener: nothing, style: {}, getBoundingClientRect: () => ({ left: 0, top: 0 }) });
    return cam;
}

function gameCamera() {
    const cam = cameraOnBoard();
    const game = Object.create(FS_GAME.prototype);
    game.app = { camera: cam, location: { width: 520, height: 780 } };
    game.setupCamera.call(game);
    return cam;
}

const cameraPoint = cam => [cam.target.x, cam.target.y, cam.target.h];
const cameraDistance = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));

/** Нажатие кнопки мыши по доске: e.button 0 — левая, 2 — правая. */
const press = (button, x, y, pointerId) => ({ button, clientX: x, clientY: y, pointerId: pointerId || 1, pointerType: 'mouse', preventDefault: nothing });
const moveTo = (x, y, pointerId) => ({ clientX: x, clientY: y, pointerId: pointerId || 1, pointerType: 'mouse', preventDefault: nothing });

screen('cam-1', 'правая кнопка поворачивает камеру: глаз на месте, вид меняется', () => {
    // В игре ПКМ должна КРУТИТЬ камеру: это первое, чего ждёшь от 3D-сцены.
    // Запертый азимут отбирал поворот и оставлял только панораму.
    const cam = cameraOnBoard();
    const az0 = cam.azimuth, e0 = cam._eye();
    cam._onDown(press(2, 400, 400));
    cam._onMove(moveTo(700, 400));
    cam._onUp({ pointerId: 1 });
    if (Math.abs(cam.azimuth - az0) < 0.05) return 'камера не повернулась: азимут остался ' + az0.toFixed(3);
    // Поворот — это поворот: ГЛАЗ остаётся на месте, вокруг него ходит вид.
    // (Точка взгляда при этом законно уезжает — она и есть «куда смотрим».)
    const e1 = cam._eye();
    const drift = Math.hypot(e1.x - e0.x, e1.y - e0.y, e1.h - e0.h);
    if (drift > 1) return 'вместо поворота камера переехала на ' + drift.toFixed(1) + ' px';
    if (Math.abs(cam.target.x - e0.x) < 1 && Math.abs(cam.target.y - e0.y) < 1) return 'вид не изменился: цель осталась прежней';
    if (cam._pointers.size) return 'кнопка не отпущена — камера продолжит крутиться';
    return true;
});

screen('cam-2', 'правая кнопка меняет наклон, не трогая поворот', () => {
    const cam = cameraOnBoard();
    const az0 = cam.azimuth, pitch0 = cam.pitch, e0 = cam._eye();
    cam._onDown(press(2, 400, 400));
    cam._onMove(moveTo(400, 120));           // по вертикали — наклон
    cam._onUp({ pointerId: 1 });
    if (Math.abs(cam.pitch - pitch0) < 0.02) return 'наклон не изменился';
    if (Math.abs(cam.azimuth - az0) > 1e-9) return 'движение по вертикали повернуло камеру по горизонтали';
    const e1 = cam._eye();
    if (Math.hypot(e1.x - e0.x, e1.y - e0.y, e1.h - e0.h) > 1) return 'камера переехала вместо наклона';
    return true;
});

screen('cam-3', 'Q/E не двигают камеру: эти клавиши не её', () => {
    // Раньше Q/E были полётом камеры («вниз/вверх» вдоль мировой вертикали):
    // при взгляде сверху полёт уводил камеру вперёд, а не поднимал её. Теперь
    // Q/E камере не принадлежат — их забирает игра (поворот тайла).
    const cam = cameraOnBoard();
    // Высота камеры — это lift и target.h: старое «поднятие/опускание» двигало
    // именно их (полёт вдоль мировой вертикали), а не наклон.
    const before = { pitch: cam.pitch, x: cam.target.x, y: cam.target.y, h: cam.target.h, lift: cam.lift };
    // Каждая клавиша проверяется ОТДЕЛЬНО: Q и E двигали камеру в разные
    // стороны, и пара «вниз, потом вверх» возвращала её на место — проверка
    // на паре проходила бы при полностью рабочем старом поведении.
    for (const code of ['KeyQ', 'KeyE']) {
        cam._onKey({ code, preventDefault: nothing }, true);
        for (let i = 0; i < 20; i++) cam.update(1 / 60);
        cam._onKey({ code, preventDefault: nothing }, false);
        if (cam.pitch !== before.pitch) return code + ' изменила наклон камеры: ' + before.pitch.toFixed(3) + ' → ' + cam.pitch.toFixed(3);
        if (cam.target.x !== before.x || cam.target.y !== before.y) return code + ' сдвинула камеру по карте';
        if (cam.target.h !== before.h || cam.lift !== before.lift) {
            return code + ' изменила высоту камеры: lift ' + before.lift.toFixed(3) + ' → ' + cam.lift.toFixed(3);
        }
        if (cam._keys.size) return code + ' попала в набор клавиш полёта';
    }
    return true;
});

screen('cam-4', 'Q/E не перехватываются камерой: игра получает их целиком', () => {
    // Если камера зовёт preventDefault на Q/E, приказ «повернуть тайл» может не
    // сработать: клавишу уже съел кто-то другой.
    const cam = cameraOnBoard();
    const taken = [];
    for (const code of ['KeyQ', 'KeyE']) {
        cam._onKey({ code, preventDefault: () => taken.push(code) }, true);
        cam._onKey({ code, preventDefault: () => taken.push(code) }, false);
    }
    if (taken.length) return 'камера перехватила ' + taken.join(', ');
    return true;
});

screen('cam-5', 'сборка карты поворачивает тайл по Q/E', () => {
    // Проверка на стык: клавиши у камеры отобраны, значит поворот тайла обязан
    // работать в игре. Смотрим сам обработчик FSGame (он на window, в захвате).
    const listeners = [];
    const fakeWindow = { addEventListener: (type, fn) => listeners.push({ type, fn }) };
    const game = Object.create(FS_GAME.prototype);
    game.app = { camera: cameraOnBoard() };
    game.mode = 'placeTile';
    game.pending = { tile: '1A' };
    const setup = {
        record: { myTurn: true },
    };
    game.state = { systems: [], setup: { stage: 'tiles' }, players: [] };
    const turns = [];
    game.transformSetupTile = action => turns.push(action);
    // BoardSetup.of(state) спрашиваем у настоящего движка: подсовываем запись
    // ровно такую, какую он отдаёт на сборке карты.
    const savedOf = BOARD_SETUP.of;
    BOARD_SETUP.of = () => setup;
    // Обработчик вешается на window — на время проверки это заглушка.
    const oldWindow = ctx.window;
    ctx.window = fakeWindow;
    try {
        game.bindSetupKeys.call(game);
        const handler = listeners.find(l => l.type === 'keydown');
        if (!handler) return 'обработчик клавиш сборки не повешен';
        handler.fn({ code: 'KeyQ', target: null, preventDefault: nothing, stopImmediatePropagation: nothing, repeat: false });
        handler.fn({ code: 'KeyE', target: null, preventDefault: nothing, stopImmediatePropagation: nothing, repeat: false });
        if (turns.join(',') !== 'left,right') return 'поворот тайла не сработал: ' + (turns.join(',') || 'ничего');
        return true;
    } finally {
        ctx.window = oldWindow;
        BOARD_SETUP.of = savedOf;
    }
});

screen('cam-6', 'игра не запирает азимут: поворот камеры доступен всегда', () => {
    // Замок азимута («север всегда вверху») и был причиной того, что ПКМ не
    // крутила камеру. Проверяем сам setupCamera игры, а не намерение.
    const game = Object.create(FS_GAME.prototype);
    const cam = cameraOnBoard();
    game.app = { camera: cam, location: { width: 1400, height: 900 } };
    game.setupCamera.call(game);
    if (cam.azimuthLocked) return 'камера заперта: правой кнопкой не повернуть';
    const az0 = cam.azimuth;
    cam._onDown(press(2, 400, 400));
    cam._onMove(moveTo(700, 400));
    cam._onUp({ pointerId: 1 });
    if (Math.abs(cam.azimuth - az0) < 0.05) return 'камера не повернулась после setupCamera';
    return true;
});

screen('cam-7', 'компас показывает, где север, после поворота камеры', () => {
    // Раз камеру теперь крутят, «где север» больше не очевидно: на верхней
    // плашке стоит компас. Север вверху — 0°, камера на восток — север слева.
    const game = Object.create(FS_GAME.prototype);
    const cam = cameraOnBoard();
    game.app = { camera: cam, location: { width: 1400, height: 900 } };
    game.setupCamera.call(game);
    const up = game.compassAngle();
    if (Math.abs(up - 0) > 0.001) return 'при взгляде «север вверху» компас показывает ' + up;
    cam.azimuth = 0;                        // камера смотрит на восток
    const east = game.compassAngle();
    if (Math.abs(east - (-90)) > 0.001) return 'камера на восток, а компас показывает ' + east + ' (ждали −90)';
    cam.azimuth = 90 * Math.PI / 180;       // камера смотрит на юг — север за спиной
    const south = game.compassAngle();
    if (Math.abs(Math.abs(south) - 180) > 0.001) return 'камера на юг, а компас показывает ' + south + ' (ждали ±180)';
    cam.azimuth = 180 * Math.PI / 180;      // камера смотрит на запад — север справа
    const west = game.compassAngle();
    if (Math.abs(west - 90) > 0.001) return 'камера на запад, а компас показывает ' + west + ' (ждали 90)';
    return true;
});

screen('cam-8', 'Alt показывает плашки, а каждая клавиша WASD продолжает двигать камеру', () => {
    return withAltUI(({ root, fireWindow }) => {
        const cam = gameCamera();
        for (const alt of [
            { code: 'AltLeft', key: 'Alt', mods: { altKey: true } },
            { code: 'AltRight', key: 'Alt', mods: { altKey: true } },
            { code: 'AltRight', key: 'AltGraph', mods: { altKey: true, ctrlKey: true, getModifierState: key => key === 'AltGraph' } },
        ]) {
            fireWindow('keydown', { code: alt.code, key: alt.key, ...alt.mods });
            if (!root.classList.contains('is-alt')) return alt.key + ' не показал плашки';
            for (const code of ['KeyW', 'KeyA', 'KeyS', 'KeyD']) {
                cam.lookAt(260, 390);
                const before = cameraPoint(cam);
                const down = fireWindow('keydown', { code, ...alt.mods });
                cam.update(0.05);
                const after = cameraPoint(cam);
                const dx = after[0] - before[0], dy = after[1] - before[1];
                if (cameraDistance(before, after) < 0.01) return alt.key + ' + ' + code + ' не сдвигает камеру';
                if ((code === 'KeyW' && dy >= 0) || (code === 'KeyS' && dy <= 0)
                    || (code === 'KeyA' && dx >= 0) || (code === 'KeyD' && dx <= 0)) return code + ' двигает камеру не в ту сторону';
                if (!down.defaultPrevented) return alt.key + ' + ' + code + ' не блокирует действие браузера';
                if (!root.classList.contains('is-alt')) return 'при движении исчезли плашки';
                fireWindow('keyup', { code, ...alt.mods });
                if (cam._keys.size) return code + ' осталась зажатой после отпускания';
                const stopped = cameraPoint(cam);
                cam.update(0.05);
                if (cameraDistance(stopped, cameraPoint(cam)) > 1e-6) return code + ' продолжает двигать камеру после отпускания';
            }
            fireWindow('keyup', { code: alt.code, key: alt.key });
            if (root.classList.contains('is-alt')) return alt.key + ' отпущен, но плашки остались';
        }
        return true;
    });
});

screen('cam-9', 'WASD не залипают при смене модификатора, фокуса или скрытии вкладки', () => {
    return withAltUI(({ root, fireWindow, fireDocument }) => {
        const cam = gameCamera();
        fireWindow('keydown', { code: 'KeyW' });
        fireWindow('keydown', { code: 'AltLeft', key: 'Alt', altKey: true });
        fireWindow('keyup', { code: 'KeyW', altKey: true });
        if (cam._keys.size || !root.classList.contains('is-alt')) return 'W отпущена при зажатом Alt, но камера не остановилась';
        fireWindow('keyup', { code: 'AltLeft', key: 'Alt' });

        fireWindow('keydown', { code: 'AltLeft', key: 'Alt', altKey: true });
        fireWindow('keydown', { code: 'KeyW', altKey: true });
        fireWindow('keyup', { code: 'AltLeft', key: 'Alt' });
        const before = cameraPoint(cam);
        cam.update(0.05);
        if (root.classList.contains('is-alt') || cameraDistance(before, cameraPoint(cam)) < 0.01) {
            return 'после отпускания Alt плашки должны исчезнуть, а зажатая W — продолжить движение';
        }
        fireWindow('keyup', { code: 'KeyW' });
        if (cam._keys.size) return 'W застряла после отпускания Alt';

        fireWindow('keydown', { code: 'AltLeft', key: 'Alt', altKey: true });
        fireWindow('keydown', { code: 'KeyW', altKey: true });
        fireWindow('keydown', { code: 'KeyD', altKey: true });
        fireWindow('keyup', { code: 'KeyW', altKey: true });
        if (!cam._keys.has('KeyD') || cam._keys.has('KeyW')) return 'отпускание W не оставило D в полёте';
        fireWindow('keyup', { code: 'KeyD', altKey: true });
        fireWindow('keyup', { code: 'AltLeft', key: 'Alt' });
        if (cam._keys.size) return 'диагональное движение не остановилось';

        for (const mods of [{ ctrlKey: true }, { metaKey: true }, { target: { tagName: 'INPUT' } }]) {
            fireWindow('keydown', { code: 'KeyA' });
            const up = fireWindow('keyup', { code: 'KeyA', ...mods });
            if (cam._keys.size) return 'клавиша застряла после смены модификатора или фокуса';
            if (up.defaultPrevented) return 'отпускание в поле ввода или с Ctrl/Meta перехвачено камерой';
        }
        fireWindow('keydown', { code: 'AltLeft', key: 'Alt', altKey: true });
        fireWindow('keydown', { code: 'KeyD', altKey: true });
        fireWindow('blur');
        if (cam._keys.size || root.classList.contains('is-alt')) return 'потеря фокуса не сбросила камеру и плашки';

        fireWindow('keydown', { code: 'AltLeft', key: 'Alt', altKey: true });
        fireWindow('keydown', { code: 'KeyW', altKey: true });
        fireDocument('visibilitychange');
        if (!cam._keys.has('KeyW') || !root.classList.contains('is-alt')) return 'видимая вкладка сбросила движение';
        ctx.document.hidden = true;
        fireDocument('visibilitychange');
        if (cam._keys.size || root.classList.contains('is-alt')) return 'скрытая вкладка не сбросила камеру и плашки';
        ctx.document.hidden = false;
        fireDocument('visibilitychange');
        if (cam._keys.size || root.classList.contains('is-alt')) return 'при возврате на вкладку движение возобновилось само';
        cam.detach();
        cam._keys.add('KeyW');
        ctx.document.hidden = true;
        fireDocument('visibilitychange');
        if (!cam._keys.has('KeyW')) return 'после detach остался слушатель скрытия вкладки';
        cam._keys.clear();
        return true;
    });
});

screen('cam-10', 'Alt+WASD не отнимает текстовый ввод и другие сочетания клавиш', () => {
    const unclaimed = (cam, code, props) => {
        const e = Object.assign({ code, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } }, props);
        cam._onKey(e, true);
        return !e.defaultPrevented && !cam._keys.size;
    };
    // The editor and the sample game keep their original Alt shortcuts.
    const plain = cameraOnBoard();
    if (!unclaimed(plain, 'KeyW', { altKey: true })) return 'камера вне Forbidden Stars перехватила Alt+W';
    const cam = gameCamera();
    for (const props of [
        { ctrlKey: true }, { metaKey: true }, { ctrlKey: true, altKey: true }, { metaKey: true, altKey: true },
        { altKey: true, target: { tagName: 'INPUT' } },
        { altKey: true, target: { tagName: 'TEXTAREA' } },
        { altKey: true, target: { tagName: 'SELECT' } },
        { altKey: true, target: { tagName: 'DIV', isContentEditable: true } },
    ]) {
        if (!unclaimed(cam, 'KeyW', props)) return 'камера перехватила системное сочетание или текстовый ввод';
    }
    for (const code of ['ArrowLeft', 'ArrowRight', 'KeyQ', 'KeyE']) {
        if (!unclaimed(cam, code, { altKey: true })) return 'камера перехватила Alt+' + code;
    }
    let homes = 0;
    cam.home = () => { homes++; };
    if (!unclaimed(cam, 'KeyR', { altKey: true }) || homes) return 'Alt+R вернул камеру домой';
    cam._onKey({ code: 'ArrowLeft', preventDefault: nothing }, true);
    if (!cam._keys.has('ArrowLeft')) return 'стрелка без Alt перестала двигать камеру';
    const up = { code: 'ArrowLeft', altKey: true, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
    cam._onKey(up, false);
    if (cam._keys.size || up.defaultPrevented) return 'стрелка залипла или Alt+стрелка перехвачена';
    return true;
});

// ============================================================================
head('Панель приказа: что в ней напечатано');

/** Узлы дерева с классом (по классу целиком, не по подстроке). */
function nodesWithClass(root, cls) {
    const out = [];
    (function walk(n) {
        if (!n) return;
        if (String(n.className || '').split(/\s+/).includes(cls)) out.push(n);
        for (const c of n.children || []) walk(c);
    })(root);
    return out;
}

/**
 * Партия, доведённая до панели «Массовое Производство»: у меня фабрика в
 * активной системе, приказ развёртывания уже превращён способностью в
 * производство. Панель при этом строит сам клиент, поэтому проверка говорит
 * ровно то, что видел игрок.
 */
function guardDeployGame() {
    const st = party('guard');
    const me = 0;
    const sys = st.systems.find(x => (x.areas || []).some(a => a.world)).id;
    const world = st.systems.find(x => x.id === sys).areas.find(a => a.world).pos;
    st.units = []; st.structures = []; st.objectives = []; st.storms = [];
    for (const x of st.systems) x.tokens = [];
    FS_RULES.addUnit(st, me, 'гвардейцы', sys, world);
    FS_RULES.addStructure(st, me, 'factory', sys, world);
    st.players[me].materiel = 14;
    st.players[me].supply.units['гвардейцы'] = 9;
    st.phase = 'operations'; st.turn = me;
    st.seat = me;                       // клиент получает состояние со своим местом
    st.order = { seat: me, order: 'deploy', system: sys, pos: world, phase: 'deploy' };
    FS_RULES.runEffects(st, me, [{ op: 'guardDeploy' }], { kind: 'ability', ctx: null });
    return st;
}

screen('panel-4', 'в панели «Массовое Производство» нет полосы «Ваши жетоны»', () => {
    // Жалоба игрока: в панели производства два счёта одного и того же —
    // полоса «Ваши жетоны» и число на самих войсках прямо под ней.
    const st = guardDeployGame();
    const ctxPanel = Object.assign({}, SCREEN_CTX, { actions: [], tokens: null });
    FSUI.update(st, ctxPanel);
    // Панель строит сам клиент: берём её токены оттуда, а не из контекста.
    const game = vm.runInContext('FSGame', ctx);
    const probe = Object.create(game.prototype);
    probe.state = st;
    probe.view = null; probe.mode = 'idle'; probe.status = ''; probe.warn = '';
    const gc = { title: '', text: '', status: '', warn: '', actions: [], mode: 'idle', setupCellSelected: false };
    probe.panelGuardDeploy(st, gc);
    if (gc.title !== 'Массовое Производство') return 'собран не тот экран: ' + gc.title;
    if (gc.tokens && gc.tokens.length) return 'полоса «Ваши жетоны» вернулась: ' + JSON.stringify(gc.tokens).slice(0, 90);
    return true;
});

screen('panel-5', 'счёт отрядов остался на самих войсках', () => {
    // Убирая полосу, нельзя потерять сам счёт — он живёт в подписи войск.
    const st = guardDeployGame();
    const game = vm.runInContext('FSGame', ctx);
    const probe = Object.create(game.prototype);
    probe.state = st; probe.view = null; probe.mode = 'idle'; probe.status = ''; probe.warn = '';
    probe.deployOpts = { cache: false, forgeKl: false };
    const gc = { title: '', text: '', status: '', warn: '', actions: [], mode: 'idle', setupCellSelected: false };
    probe.panelGuardDeploy(st, gc);
    const units = gc.actions.filter(a => a.kind === 'pick' && typeof a.count === 'number');
    if (!units.length) return 'в панели нет войск со счётом';
    const guards = units.find(a => /Гвардейц/.test(a.label));
    if (!guards) return 'в панели нет Гвардейцев: ' + units.map(a => a.label).join(', ');
    if (guards.count !== 9) return 'на Гвардейцах счёт ' + guards.count + ', а в запасе 9';
    return true;
});

// ============================================================================
head('Правая кнопка: отмена по щелчку, а не по зажатию');

/**
 * Клиент игры, подключённый к canvas-заглушке: обработчики запоминаются,
 * чтобы их можно было позвать так же, как зовёт браузер.
 */
function pointerGame() {
    const game = Object.create(FS_GAME.prototype);
    const handlers = {};
    const canvas = {
        addEventListener: (name, fn) => { (handlers[name] = handlers[name] || []).push(fn); },
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 1400, height: 900 }),
    };
    game.app = { location: { view: { world: { canvas } } }, camera: null };
    game.calls = [];
    game.onRightClick = (x, y) => game.calls.push(['right', x, y]);
    game.onClick = (x, y) => game.calls.push(['click', x, y]);
    game.onHover = nothing;
    game.bindPointer();
    const fire = (name, e) => { for (const fn of handlers[name] || []) fn(e); };
    return { game, fire };
}

screen('right-1', 'зажатие ПКМ с протяжкой камеру поворачивает, но действие не отменяет', () => {
    // Жалоба: отмена срабатывала на pointerdown — то есть в тот миг, когда
    // игрок только собирался крутить камеру зажатой правой кнопкой.
    const { game, fire } = pointerGame();
    fire('pointerdown', { button: 2, clientX: 400, clientY: 400, pointerId: 1 });
    if (game.calls.length) return 'отмена сработала на нажатии: ' + JSON.stringify(game.calls);
    fire('pointermove', { clientX: 520, clientY: 430, pointerId: 1 });
    fire('pointerup', { button: 2, clientX: 520, clientY: 430, pointerId: 1 });
    if (game.calls.length) return 'протяжка ПКМ всё равно отменила действие: ' + JSON.stringify(game.calls);
    return true;
});

screen('right-2', 'одиночный щелчок ПКМ по-прежнему отменяет', () => {
    const { game, fire } = pointerGame();
    fire('pointerdown', { button: 2, clientX: 400, clientY: 400, pointerId: 1 });
    fire('pointerup', { button: 2, clientX: 401, clientY: 400, pointerId: 1 });
    if (game.calls.length !== 1 || game.calls[0][0] !== 'right') {
        return 'щелчок ПКМ не отменил: ' + JSON.stringify(game.calls);
    }
    if (game.calls[0][1] !== 401 || game.calls[0][2] !== 400) return 'щелчок попал не туда: ' + JSON.stringify(game.calls[0]);
    return true;
});

screen('right-3', 'правая кнопка не мешает обычному щелчку левой', () => {
    // Два независимых жеста: правое нажатие не должно сбить левое.
    const { game, fire } = pointerGame();
    fire('pointerdown', { button: 0, clientX: 300, clientY: 300, pointerId: 2 });
    fire('pointerup', { button: 0, clientX: 300, clientY: 300, pointerId: 2 });
    if (game.calls.length !== 1 || game.calls[0][0] !== 'click') return 'левый щелчок потерялся: ' + JSON.stringify(game.calls);
    // Протяжка левой — камера, не выбор.
    game.calls.length = 0;
    fire('pointerdown', { button: 0, clientX: 300, clientY: 300, pointerId: 3 });
    fire('pointerup', { button: 0, clientX: 500, clientY: 300, pointerId: 3 });
    if (game.calls.length) return 'протяжка левой кнопкой сработала как щелчок';
    return true;
});

// ============================================================================
head('Правый низ: одна плашка на весь экран');

/**
 * Читает CSS игры и отдаёт список правил: [селектор, тело].
 * Размер панели — про CSS, а не про дерево: узел в заглушке не имеет
 * computed style, и «стало шире» без чтения стилей не поймать.
 */
function cssRules(file) {
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const rules = [];
    for (const m of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) rules.push([m[1].trim(), m[2]]);
    return rules;
}

/** Фиксированный размер правого низа: и ширина, и высота — в переменных оболочки. */
const PANEL_W = 'min(356px,calc(100vw - 36px))';
const PANEL_H = '69vh';

screen('layout-1', 'у правой нижней плашки ровно один размер на весь экран', () => {
    // Жалоба игрока: на планировании панель узкая (как «Участники»), а с
    // реализацией жетонов — шире. Причина не в одной строке: размер задавали
    // четыре правила (.fs-main-panel, .is-battle, @media и .is-planning), и
    // каждое тянуло в свою сторону. Теперь размер — две переменные.
    const shell = cssRules('js/fs/FSUI.css').find(([sel]) => sel === '.fs-shell');
    if (!shell) return 'в CSS нет .fs-shell';
    if (!shell[1].includes('--fs-panel-w:' + PANEL_W)) return 'нет --fs-panel-w:' + PANEL_W;
    if (!shell[1].includes('--fs-panel-h:' + PANEL_H)) return 'нет --fs-panel-h:' + PANEL_H;
    const panel = cssRules('js/fs/FSUI.css').find(([sel]) => sel === '.fs-main-panel');
    if (!panel) return 'в CSS нет .fs-main-panel';
    if (!/width:var\(--fs-panel-w\)/.test(panel[1])) return 'ширина панели не берётся из --fs-panel-w';
    if (!/height:var\(--fs-panel-h\)/.test(panel[1])) return 'высота панели не берётся из --fs-panel-h';
    return true;
});

screen('layout-2', 'ни один этап, приказ или бой не меняет размер правого низа', () => {
    // Guard the right action panel against phase-dependent width/height.
    // The separate battle score in the opposite corner has its own size.
    // The panel may use its shared size variables and intrinsic values only.
    const targets = /^\.(fs-main-panel|fs-orders-pop)(\.[\w-]+)?$/;
    const decl = /(?:^|;)\s*((?:max-)?(?:width|height))\s*:\s*([^;]+)/g;
    const allowed = /^(var\(--fs-panel-[wh]\)|auto|100%|none|0)$/;
    const parts = sel => { const xs = sel.replace(/\s*[>+~]\s*/g, ' ').split(/\s+/); return xs[xs.length - 1]; };
    const bad = [];
    for (const [sel, body] of cssRules('js/fs/FSUI.css')) {
        // Вложенные потомки (.fs-main-panel .fs-action) — про текст и иконки, не про плашку.
        if (!targets.test(parts(sel))) continue;
        // Мобильная ветка — другая раскладка (нижний лист во всю ширину), её не трогаем.
        if (/\.is-mobile/.test(sel)) continue;
        for (const m of body.matchAll(decl)) {
            const value = m[2].trim();
            if (allowed.test(value)) continue;
            bad.push(sel + ' { ' + m[1] + ':' + value + ' }');
        }
    }
    if (bad.length) return 'размер правого низа меняют: ' + bad.slice(0, 3).join(' | ');
    return true;
});

function battleLayoutContext() {
    const part = (dice, tokens, cards, units) => ({ dice, tokens, cards, units, total: dice + tokens + cards + units });
    const sides = [
        { side: 'attacker', name: 'Алекс', mine: true, color: '#aa8844',
            parts: { att: part(2, 1, 3, 0), def: part(1, 0, 2, 0), morale: part(0, 1, 0, 4) },
            values: { att: 6, def: 3, morale: 5 }, deals: 4, takes: 2 },
        { side: 'defender', name: 'Противник', color: '#448866',
            parts: { att: part(3, 1, 0, 0), def: part(2, 0, 0, 0), morale: part(0, 0, 1, 2) },
            values: { att: 4, def: 2, morale: 3 }, deals: 2, takes: 4, peeked: { name: 'Подсмотренная карта' } },
    ];
    return Object.assign({}, SCREEN_CTX, {
        battle: { round: 1, maxRounds: 3, sides, damage: { total: 2, left: 1, rows: [{ name: 'Боец', health: 3, take: 1 }] } },
        battleHand: Array.from({ length: 5 }, (_, i) => ({ name: 'Карта ' + (i + 1), text: 'Текст', playable: true })),
    });
}

screen('layout-3', 'счёт боя со всеми числами вынесен из правой панели в левый низ', () => {
    return withAltUI(({ root }) => {
        const { st } = chipBattle('layout-score');
        FSUI.renderModern(st, battleLayoutContext());
        const score = root.querySelector('.fs-battle-panel');
        const panel = root.querySelector('.fs-main-panel');
        if (!score || !root.children.includes(score) || panel.querySelector('.fs-battle-panel')) return 'счёт боя не отдельная панель рядом с правой';
        const texts = textsOf(score).join('|');
        for (const t of ['Алекс', 'Противник', 'сопернику', 'получит 2', 'получит 4', 'Подсмотренная карта', 'осталось 1', 'Боец']) {
            if (!texts.includes(t)) return 'в перенесённом счёте нет «' + t + '»: ' + texts;
        }
        const lines = [];
        (function walk(n) { if (n.classList && n.classList.contains('fs-battle-line')) lines.push(n); for (const c of n.children || []) walk(c); })(score);
        if (lines.length !== 6) return 'строк атаки, защиты и морали: ' + lines.length + ', ожидали шесть';
        const expected = [['2', '+', '1', '+', '3', '6'], ['1', '+', '0', '+', '2', '3'], ['0', '+', '1', '+', '0', '+', '4', '5']];
        for (let i = 0; i < expected.length; i++) {
            if (textsOf(lines[i]).join('|') !== expected[i].join('|')) return 'исчезли слагаемые или сумма в строке ' + (i + 1) + ': ' + textsOf(lines[i]).join('|');
        }
        const rule = cssRules('js/fs/FSUI.css').find(([sel]) => sel === '.fs-battle-panel');
        if (!rule || !/position\s*:\s*absolute/.test(rule[1]) || !/left\s*:\s*10px/.test(rule[1]) || !/bottom\s*:\s*10px/.test(rule[1])) {
            return 'панель счёта не закреплена в левом нижнем углу';
        }
        const hide = score.querySelector('.fs-battle-ctl');
        hide.click();
        const hidden = root.querySelector('.fs-battle-panel'), restore = root.querySelector('.fs-battle-restore');
        if (!hidden || !hidden.classList.contains('is-hidden') || !restore) return 'нельзя скрыть счёт и вернуть его кнопкой';
        restore.click();
        if (root.querySelector('.fs-battle-panel').classList.contains('is-hidden') || root.querySelector('.fs-battle-restore')) return 'кнопка возврата не открыла счёт';
        return true;
    });
});

screen('layout-4', 'во время боя плашки раунда нет вовсе, после боя она возвращается с прежним состоянием', () => {
    return withAltUI(({ root }) => {
        const normal = party('layout-header');
        const { st } = chipBattle('layout-header-combat');
        FSUI.renderModern(normal, SCREEN_CTX);
        if (!root.querySelector('.fs-topbar')) return 'до боя пропала плашка партии';
        root.querySelector('.fs-topbar-toggle').click();
        if (FSUI.panelState().topbar) return 'плашка не свернулась до боя';
        FSUI.renderModern(st, battleLayoutContext());
        if (root.querySelector('.fs-topbar') || root.querySelector('.fs-topbar-toggle')) return 'в бою плашка или её кнопка осталась';
        FSUI.renderModern(normal, SCREEN_CTX);
        if (!root.querySelector('.fs-topbar') || !root.classList.contains('is-topbar-off')) return 'после боя не восстановлена свёрнутая плашка';
        root.querySelector('.fs-topbar-toggle').click();
        if (root.classList.contains('is-topbar-off')) return 'после боя плашку не раскрыть';
        return true;
    });
});

screen('layout-5', 'участники видны в бою справа сверху, их можно скрыть и вернуть', () => {
    return withAltUI(({ root }) => {
        const { st } = chipBattle('layout-players');
        FSUI.renderModern(st, battleLayoutContext());
        let rail = root.querySelector('.fs-left-rail');
        if (!rail || !rail.querySelector('.fs-card') || !textsOf(rail).includes('Участники')) return 'карточка участников не нарисована в бою';
        for (const p of st.players) if (!textsOf(rail).includes(p.name)) return 'нет участника ' + p.name;
        const styles = cssRules('js/fs/FSUI.css');
        const base = styles.find(([sel]) => sel === '.fs-shell.is-battle .fs-left-rail');
        const mobile = styles.find(([sel]) => sel === '.fs-shell.is-mobile.is-battle .fs-left-rail');
        if (!base || !/display\s*:\s*flex/.test(base[1]) || !mobile || !/top\s*:\s*55px/.test(mobile[1]) || !/right\s*:\s*0/.test(mobile[1])) {
            return 'в CSS участники скрыты либо не стоят в верхнем правом углу';
        }
        const landscapeRail = styles.find(([sel, body]) => sel === '.fs-shell.is-mobile.is-battle .fs-left-rail' && /width\s*:\s*min\(280px,50vw\)/.test(body));
        const landscapeScore = styles.find(([sel, body]) => sel === '.fs-shell.is-mobile.is-battle .fs-battle-panel' && body.includes('calc(100vw - min(280px,50vw) - 20px)'));
        if (!landscapeRail || !landscapeScore) return 'на низком широком экране счёт перекрывает участников';
        const drawer = styles.find(([sel]) => sel === '.fs-shell.is-battle .fs-faction-drawer');
        if (!drawer || !/z-index\s*:\s*11/.test(drawer[1])) return 'угловые кнопки перекрывают закрытие досье';
        root.querySelector('.fs-panel-switch').click();
        rail = root.querySelector('.fs-left-rail');
        if (rail.querySelector('.fs-card')) return 'переключатель не скрыл участников';
        root.querySelector('.fs-panel-switch').click();
        if (!root.querySelector('.fs-left-rail').querySelector('.fs-card')) return 'переключатель не вернул участников';
        return true;
    });
});

screen('layout-6', 'подложка руки следует ширине карт, а не растягивается на экран', () => {
    return withAltUI(({ root }) => {
        const { st } = chipBattle('layout-hand');
        const ctxPanel = battleLayoutContext();
        for (const count of [5, 1, 3, 7]) {
            const cards = battleLayoutContext().battleHand;
            ctxPanel.battleHand = (count > 5 ? cards.concat(cards.slice(0, count - 5)) : cards.slice(0, count));
            FSUI.renderModern(st, ctxPanel);
            const hand = root.querySelector('.fs-battle-hand');
            if (!hand || hand.querySelector('.fs-battle-cards').children.length !== count) return 'потерялись карты руки: ' + count;
            if (hand.classList.contains('has-extra') !== (count > 5)) return 'дополнительные карты не получили свою компактную раскладку';
            if (hand.style['--fs-hand-count'] !== String(count)) return 'потеряно число карт для позиционирования превью';
            if (hand.querySelector('.fs-battle-cards').children.some((card, i) => card.style['--fs-card-index'] !== String(i))) return 'у карт нет индекса для позиционирования превью';
        }
        const styles = cssRules('js/fs/FSUI.css');
        const base = styles.find(([sel]) => sel === '.fs-battle-hand');
        const card = styles.find(([sel]) => sel === '.fs-battle-card');
        const desktop = styles.find(([sel]) => sel === '.fs-shell.is-battle:not(.is-mobile) .fs-battle-hand');
        const mobile = styles.find(([sel]) => sel === '.fs-shell.is-mobile.is-battle .fs-battle-hand');
        if (!base || !/width\s*:\s*max-content/.test(base[1])) return 'ширина подложки не следует содержимому';
        if (!card || !/margin-right\s*:\s*var\(--fs-hand-margin\)/.test(card[1]) || !/transform-origin\s*:\s*0 100%/.test(card[1])) return 'место каждой карты не соответствует её видимой ширине';
        const longPreview = styles.find(([sel]) => sel === '.fs-battle-card:hover:not(:disabled)');
        const previewText = styles.find(([sel]) => sel === '.fs-battle-card:hover:not(:disabled) .fs-battle-card-text');
        const previewLayer = styles.find(([sel]) => sel === '.fs-battle-hand:has(.fs-battle-card:hover:not(:disabled))');
        if (!/max-height\s*:\s*238px/.test(card[1]) || !longPreview || !/max-height\s*:\s*var\(--fs-preview-max-height\)/.test(longPreview[1]) || !previewText || !/overflow-y\s*:\s*auto/.test(previewText[1])) return 'длинный текст карты накрывает счёт или недоступен в превью';
        if (!previewLayer || !/z-index\s*:\s*10/.test(previewLayer[1])) return 'угловые кнопки закрывают превью карты';
        if (!desktop || !/right\s*:\s*auto/.test(desktop[1]) || !mobile || !/right\s*:\s*auto/.test(mobile[1])) return 'подложка снова растянута между двумя краями';
        if (!styles.some(([sel]) => sel.includes('.fs-battle-hand.has-extra'))) return 'нет стилей для дополнительных карт';
        const preview = styles.find(([sel]) => sel === '.fs-shell.is-mobile.is-battle .fs-battle-card');
        if (!preview || !/--fs-preview-shift\s*:\s*clamp\(/.test(preview[1]) || !/var\(--fs-card-index\)/.test(preview[1])) return 'превью крайних карт выходит за экран';
        return true;
    });
});

screen('layout-7', 'на узком экране выбор целей и кнопки боя доступны при прокрутке панели', () => {
    return withAltUI(({ root }) => {
        const { st } = chipBattle('layout-mobile-actions');
        let picked = 0;
        const ctxPanel = battleLayoutContext();
        ctxPanel.actions = [
            { kind: 'pick', label: 'Первый боец', onClick: () => { picked++; } },
            { kind: 'pick', label: 'Второй боец', onClick: () => { picked++; } },
            { kind: 'primary', label: 'Принять урон', onClick: () => { picked++; } },
        ];
        FSUI.renderModern(st, ctxPanel);
        const panel = root.querySelector('.fs-main-panel'), grid = panel.querySelector('.fs-pick-grid');
        if (!grid || grid.children.length !== 2) return 'цели повреждений потерялись';
        grid.children[0].click();
        panel.querySelector('.fs-primary').click();
        if (picked !== 2) return 'цель или подтверждение не отвечают на нажатие';
        const styles = cssRules('js/fs/FSUI.css');
        const scroll = styles.find(([sel]) => sel === '.fs-shell.is-battle .fs-main-panel');
        const actions = styles.find(([sel]) => sel === '.fs-shell.is-mobile.is-battle .fs-main-panel>.fs-actions');
        const cols = styles.find(([sel]) => sel === '.fs-shell.is-mobile.is-battle .fs-pick-grid');
        if (!scroll || !/overflow-y\s*:\s*auto/.test(scroll[1])) return 'панель действий не прокручивается';
        if (!actions || !/display\s*:\s*flex/.test(actions[1]) || !/flex\s*:\s*0 0 auto/.test(actions[1]) || !/overflow\s*:\s*visible/.test(actions[1])) return 'список целей схлопывается внутри мобильной панели';
        if (!cols || !/grid-template-columns\s*:\s*repeat\(2,/.test(cols[1])) return 'цели слишком узкие для нажатия';
        return true;
    });
});

// ============================================================================
head('Стол: где на тайле стоят миры');

screen('table-1', 'четверть тайла одна для рисунка и для миров', () => {
    // Миры съезжали к центру тайла и наезжали друг на друга: раскладка брала
    // центр четверти, но умножала его на половину стороны области.
    for (const pos of ['TL', 'TR', 'BL', 'BR']) {
        const q = TILE_GEOMETRY.square(pos);
        if (Math.abs(Math.abs(q.cx - 0.5) - 0.25) > 1e-9) return 'центр четверти ' + pos + ' не на четверти тайла';
        if (Math.abs(Math.abs(q.cy - 0.5) - 0.25) > 1e-9) return 'центр четверти ' + pos + ' не на четверти по вертикали';
        if (Math.abs(q.size - 0.5) > 1e-9) return 'четверть ' + pos + ' занимает не половину стороны тайла';
    }
    return true;
});

screen('table-2', 'миры двух соседних четвертей не перекрываются', () => {
    // Спрашивается САМА раскладка стола (FSView.areaPos), а не константа
    // четверти: иначе «взять половину тайла вместо целого» проходит молча —
    // константа-то правильная, а мир всё равно стоит вдвое ближе.
    const app = { location: { width: 1400, height: 900 } };
    const sys = { id: 'S', row: 0, col: 0 };
    const left = FS_VIEW.areaPos(app, sys, 'TL', null);
    const right = FS_VIEW.areaPos(app, sys, 'TR', null);
    const between = Math.abs(right.x - left.x);
    const TILE = FS_VIEW.TILE;
    if (Math.abs(between - TILE / 2) > 1e-6) {
        return 'два соседних мира стоят на ' + between + ' друг от друга, ждали половину тайла ' + TILE / 2;
    }
    if (between <= FS_VIEW.PLANET_D) {
        return 'два мира перекрываются: между ними ' + between + ', диаметр ' + FS_VIEW.PLANET_D;
    }
    // И по вертикали то же: раскладка не должна «схлопывать» ось.
    const top = FS_VIEW.areaPos(app, sys, 'TL', null);
    const bottom = FS_VIEW.areaPos(app, sys, 'BL', null);
    if (Math.abs(Math.abs(bottom.y - top.y) - TILE / 2) > 1e-6) {
        return 'по вертикали миры стоят на ' + Math.abs(bottom.y - top.y) + ', ждали ' + TILE / 2;
    }
    return true;
});

screen('table-3', 'мир не выходит за пределы своей четверти', () => {
    // Раньше мир свисал с тайла: центр четверти умножался на половину стороны
    // области. Теперь проверяется сама раскладка — от центра мира до края
    // тайла должно оставаться не меньше радиуса.
    const TILE = FS_VIEW.TILE;
    const app = { location: { width: 1400, height: 900 } };
    const sys = { id: 'S', row: 0, col: 0 };
    const topLeft = FS_VIEW.areaPos(app, sys, 'TL', null);
    const center = FS_VIEW.areaPos(app, sys, 'BR', null);
    // Центр тайла — середина между двумя противоположными четвертями.
    const cx = (topLeft.x + center.x) / 2, cy = (topLeft.y + center.y) / 2;
    const toEdge = Math.min(Math.abs(topLeft.x - cx), Math.abs(topLeft.y - cy), TILE / 2);
    if (toEdge < FS_VIEW.PLANET_D / 2) {
        return 'мир свисает с тайла: до края ' + toEdge + ', радиус ' + FS_VIEW.PLANET_D / 2;
    }
    return true;
});

head('Варп-шторм: выбор отмеченной грани');

screen('storm-ghost-1', '«Смертоукасатели»: обе отмеченные грани показаны и каждая принимает клик', () => {
    const field = ctx.FS_WARP_STORMS;
    const card = ctx.FS_DATA.events.find(e => e.faction === 'некроны' && e.name === 'Смертоукасатели');
    if (!card) return 'нет карты «Смертоукасатели»';
    // Запускаем настоящее FSView.update: вместо Babylon — узлы с координатами
    // и размерами, остальное рисование выключено, чтобы проверить сами полосы.
    const draw = (st, ghosts) => {
        const names = ['measure', 'ensureTile', 'drawTile', 'updateSetupSlots', 'updatePlanets', 'clearMarkers', 'drawCombat', 'addMarker'];
        const saved = Object.fromEntries(names.map(name => [name, FS_VIEW[name]]));
        const oldBabylon = ctx.BABYLON;
        const boxes = [];
        const point = () => ({ x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } });
        try {
            for (const name of names) FS_VIEW[name] = nothing;
            FS_VIEW.ensureTile = () => ({ drawn: null });
            ctx.BABYLON = {
                TransformNode: function (name) { this.name = name; this.position = point(); },
                MeshBuilder: { CreateBox: (name, size) => {
                    const box = { name, size, position: point() };
                    boxes.push(box);
                    return box;
                } },
            };
            const app = { location: { terrain: { heightAt: () => 0 } } };
            const view = { scene: {}, metrics: { originX: 0, originY: 0 }, stormPending: 'sx',
                stormGhosts: ghosts, material: () => ({}) };
            FS_VIEW.update(app, view, st);
        } finally {
            Object.assign(FS_VIEW, saved);
            ctx.BABYLON = oldBabylon;
        }
        return boxes.filter(box => box.metadata && box.metadata.fs === 'storm-ghost');
    };
    const examples = [
        // Стоячий между двумя верхними тайлами: отметки слева и справа от него.
        { edge: { kind: 'V', row: 0, col: 1 }, targets: [
            { key: 'V:0:0', x: -130, y: 0, horizontal: false },
            { key: 'V:0:2', x: 390, y: 0, horizontal: false },
        ] },
        // Контроль: лежачий между двумя тайлами по-прежнему идёт вверх/вниз.
        { edge: { kind: 'H', row: 1, col: 0 }, targets: [
            { key: 'H:0:0', x: 0, y: -130, horizontal: true },
            { key: 'H:2:0', x: 0, y: 390, horizontal: true },
        ] },
    ];
    for (const example of examples) {
        for (const destination of example.targets) {
            // Отдельное состояние на каждый клик: событие двигает шторм один раз.
            const st = party('storm-ghost');
            st.seat = 1; // некроны, как на карте
            st.phase = 'refresh';
            st.eventsLeft = 2;
            st.event = { seat: 1, drawn: [card.name], chosen: card.name, card };
            st.storms = [field.create(st, 'sx', example.edge)];
            st.units = []; st.structures = []; st.objectives = [];
            for (const sys of st.systems) sys.tokens = [];
            const game = Object.create(FS_GAME.prototype);
            let sent = null, result = null;
            Object.assign(game, {
                state: st, view: {}, app: null, mode: 'idle', pending: null,
                refresh: nothing,
                net: { cmd: cmd => { sent = cmd; result = FS_RULES.apply(st, 1, cmd); } },
            });
            game.stormClick({ fs: 'storm', storm: 'sx' });
            const ghosts = game.view.stormGhosts || [];
            const actual = ghosts.map(g => g.key).sort().join(',');
            const wanted = example.targets.map(t => t.key).sort().join(',');
            if (actual !== wanted) return 'для ' + field.keyOf(example.edge) + ' ждали ' + wanted + ', получили ' + actual;
            const ghost = ghosts.find(g => g.key === destination.key);
            const pos = field.position(st, ghost, { originX: 0, originY: 0 }, 260);
            if (!pos || pos.x !== destination.x || pos.y !== destination.y || pos.horizontal !== destination.horizontal) {
                return 'призрак ' + destination.key + ' рассчитан не на отмеченной грани: ' + JSON.stringify(pos);
            }
            const rendered = draw(st, ghosts);
            if (rendered.length !== example.targets.length) return 'нарисовано призраков: ' + rendered.length;
            const marker = rendered.find(box => box.metadata.key === destination.key);
            if (!marker || !marker.isPickable) return 'нет кликабельной полосы на ' + destination.key;
            if (marker.parent.position.x !== destination.x || marker.parent.position.z !== destination.y) {
                return 'полоса ' + destination.key + ' нарисована не на отмеченной грани';
            }
            const width = destination.horizontal ? FS_VIEW.TILE - 20 : 6;
            const depth = destination.horizontal ? 6 : FS_VIEW.TILE - 20;
            if (marker.size.width !== width || marker.size.depth !== depth) return 'полоса ' + destination.key + ' повёрнута неправильно';
            if (marker.metadata.dir !== ghost.dir || marker.metadata.storm !== 'sx') return 'полоса потеряла направление или шторм';
            // Клик по метаданным настоящей нарисованной полосы должен поставить
            // шторм именно на неё, а не на другую грань.
            game.stormClick(marker.metadata);
            if (!sent || sent.type !== 'moveStorm' || sent.dir !== ghost.dir) return 'клик по ' + destination.key + ' не отправил его направление';
            if (!result || !result.ok) return 'клик по ' + destination.key + ' отклонён: ' + (result && result.error);
            if (field.keyOf(st.storms[0]) !== destination.key) return 'шторм после клика стоит не на ' + destination.key;
            if (!st.event.stormMoved) return 'событие не заметило движение';
        }
    }
    return true;
});

head('Бой: плашки здоровья под миньками');

function chipBattle(seed) {
    const st = party(seed || 'chips');
    st.units = [];
    st.structures = [];
    st.objectives = [];
    st.storms = [];
    for (const s of st.systems) s.tokens = [];
    st.phase = 'operations';
    st.turn = 0;
    st.order = null;
    const sys = st.systems[0];
    const pos = (sys.areas.find(a => a.world) || sys.areas[0]).pos;
    const guard = FS_RULES.addUnit(st, 0, 'гвардейцы', sys.id, pos);
    const warrior = FS_RULES.addUnit(st, 1, 'воины', sys.id, pos);
    st.order = { seat: 0, order: 'advance', system: sys.id, pos, phase: 'move', moveStep: 'ground', moved: [], steps: [] };
    const started = FS_RULES.apply(st, 0, { type: 'endAdvance' });
    if (!started.ok || !st.combat) throw new Error('бой не начался: ' + (started.error || 'нет боя'));
    st.combat.reinforce = { attacker: 0, defender: 1 };
    return { st, guard, warrior };
}

screen('combat-chip-1', 'плашка бойца показывает здоровье из правил, а не номер места', () => {
    // Был случай: воин некронов (здоровье 3) входил в бой с подкреплением, а
    // плашка под минькой показывала 1 сердце. Подсказка урона при этом писала
    // верные 3 — врала только плашка: в базу здоровья попадал номер места.
    const { st, guard, warrior } = chipBattle();
    const view = {
        unitPositions: new Map([[guard.id, { x: 0, y: 0, z: 0 }], [warrior.id, { x: 1, y: 0, z: 0 }]]),
        reinforceAnchors: [{ side: 'defender', index: 0, x: 2, y: 0, z: 0, routed: false }],
        unitChips: [],
        unitChipNodes: [],
    };
    FS_VIEW.drawUnitChips(null, view, st);
    const chip = prefix => (view.unitChips || []).find(c => (c.key || '').startsWith(prefix));
    const w = chip(warrior.id + ':');
    if (!w) return 'у воина нет плашки';
    if (w.hp !== 3) return 'воин: на плашке ' + w.hp + ', в правилах 3';
    if (w.morale !== 0) return 'воин: плашка показывает мораль ' + w.morale + ' вместо 0';
    const g = chip(guard.id + ':');
    if (!g) return 'у гвардейца нет плашки';
    if (g.hp !== 1) return 'гвардеец: на плашке ' + g.hp + ', в правилах 1';
    if (g.morale !== 2) return 'гвардеец: плашка показывает мораль ' + g.morale + ' вместо 2';
    // Жетон подкрепления — отряд КЛ0 фракции по правилам: у некронов это тоже
    // воин, и его 3 сердца на плашке — верные, а не перепутанные с воином.
    const r = chip('rein:defender:');
    if (!r) return 'у подкрепления нет плашки';
    if (r.hp !== 3) return 'подкрепление: на плашке ' + r.hp + ', в правилах 3';
    if (r.morale !== 0) return 'подкрепление: плашка показывает мораль ' + r.morale + ' вместо 0';
    return true;
});

// Проверяем не самодельную проекцию: локальный Babylon рендерит кадры настоящей
// камеры в NullEngine, а FSView.create подписывает тот же обработчик, что в игре.
// DOM здесь — дерево-заглушка; положение на странице дополнительно проверяется
// в настоящем браузере. В конструктор View3D не входим: нужны лишь его реальные
// методы проекции и матрицы сцены, а не свет и текстуры.
let realBabylon, realView3D;
function chipScene(opts, check) {
    const oldBabylon = ctx.BABYLON, oldGet = ctx.document.getElementById;
    if (!realBabylon) realBabylon = createRequire(import.meta.url)(path.join(ROOT, 'libs/babylon.js'));
    ctx.BABYLON = realBabylon;
    if (!realView3D) {
        vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/World3D.js'), 'utf8'), ctx, { filename: 'js/World3D.js' });
        realView3D = vm.runInContext('View3D', ctx);
    }
    const B = realBabylon;
    const cw = opts.cssWidth || 800, ch = opts.cssHeight || 600;
    const canvasRect = { left: opts.canvasLeft || 0, top: opts.canvasTop || 0,
        width: opts.rectWidth || cw, height: opts.rectHeight || ch };
    const layerRect = { left: opts.layerLeft || 0, top: opts.layerTop || 0, width: cw, height: ch };
    const canvas = { clientWidth: cw, clientHeight: ch, getBoundingClientRect: () => canvasRect };
    const layer = el('div');
    layer.getBoundingClientRect = () => layerRect;
    ctx.document.getElementById = id => id === 'fs-unit-chips' ? layer : null;
    const engine = new B.NullEngine({ renderWidth: opts.renderWidth || cw, renderHeight: opts.renderHeight || ch });
    const scene = new B.Scene(engine);
    scene.useRightHandedSystem = true;
    const camera = new B.TargetCamera('screen-test-camera', new B.Vector3(180, 300, 400), scene);
    camera.minZ = 1; camera.maxZ = 9000;
    camera.setTarget(new B.Vector3(0, 0, 0));
    if (opts.viewport) camera.viewport = new B.Viewport(...opts.viewport);
    scene.activeCamera = camera;
    const worldView = Object.assign(Object.create(realView3D.prototype), { world: { canvas }, engine, scene, camera });
    const app = { location: { view: worldView } };
    try {
        const view = FS_VIEW.create(app);
        // Independent reference: project with the actual current camera matrices
        // straight into the canvas CSS viewport, not through View3D or chipTick.
        const expected = item => {
            const matrix = camera.getViewMatrix(true).multiply(camera.getProjectionMatrix(true));
            const p = B.Vector3.Project(new B.Vector3(item.x, item.y, item.z), B.Matrix.Identity(), matrix,
                camera.viewport.toGlobal(cw, ch));
            return { x: canvasRect.left - layerRect.left + p.x * canvasRect.width / cw,
                y: canvasRect.top - layerRect.top + p.y * canvasRect.height / ch, z: p.z };
        };
        return check({ B, engine, scene, camera, view, layer, expected });
    } finally {
        scene.dispose(); engine.dispose();
        ctx.BABYLON = oldBabylon;
        ctx.document.getElementById = oldGet;
    }
}

const chipItem = (key, x, y, z) => ({ key, x, y, z, hp: 3, morale: 2, label: key, routed: false });
const closePx = (a, b) => Number.isFinite(a) && Math.abs(a - b) < 0.15;

screen('combat-chip-2', 'плашки стоят под своими бойцами при любом масштабе и размере холста', () => {
    const cases = [
        { renderWidth: 600, renderHeight: 450 },     // 0.75 render-pixels на CSS-пиксель
        { renderWidth: 800, renderHeight: 600 },
        { renderWidth: 1200, renderHeight: 900 },
        { renderWidth: 1600, renderHeight: 1200 },
        // Разные коэффициенты по осям, смещение и CSS-масштаб самого canvas.
        { renderWidth: 1600, renderHeight: 900, canvasLeft: 43, canvasTop: 31,
            layerLeft: 7, layerTop: 11, rectWidth: 920, rectHeight: 540, viewport: [0.08, 0.1, 0.84, 0.8] },
    ];
    for (const opts of cases) {
        const fail = chipScene(opts, ({ scene, view, expected }) => {
            view.unitChips = [chipItem('guard', -100, 4, -30), chipItem('warrior', 85, 12, 40),
                chipItem('rein:defender:0', 30, 3, -80)];
            scene.render(); scene.render(); // отдельная проверка ниже ловит первый кадр и движение камеры
            for (let i = 0; i < view.unitChips.length; i++) {
                const item = view.unitChips[i], node = view.unitChipNodes[i], p = expected(item);
                if (!node || node.style.display !== 'flex') return item.key + ': плашка не видна';
                const x = parseFloat(node.style.left), y = parseFloat(node.style.top);
                if (!closePx(x, p.x) || !closePx(y, p.y + 4)) {
                    return item.key + ': получили (' + x.toFixed(1) + ', ' + y.toFixed(1) + '), ожидали ('
                        + p.x.toFixed(1) + ', ' + (p.y + 4).toFixed(1) + ')';
                }
            }
            return null;
        });
        if (fail) return opts.renderWidth + '×' + opts.renderHeight + ': ' + fail;
    }
    return true;
});

screen('combat-chip-3', 'плашки совпадают с камерой уже на первом кадре и без запаздывания при движении', () => {
    return chipScene({}, ({ B, scene, camera, view, expected }) => {
        const item = chipItem('fighter', 100, 5, -35);
        view.unitChips = [item];
        scene.render();
        const node = view.unitChipNodes[0], p0 = expected(item);
        if (!node || node.style.display !== 'flex' || !closePx(parseFloat(node.style.left), p0.x)) {
            return 'в первом кадре плашка не попала под бойца';
        }
        camera.position = new B.Vector3(-140, 170, 320);
        camera.setTarget(new B.Vector3(30, 0, 20));
        const p1 = expected(item);
        if (Math.abs(p1.x - p0.x) < 15) return 'проверка не сдвинула проекцию достаточно далеко';
        scene.render(); // ни одного дополнительного кадра
        const x = parseFloat(node.style.left), y = parseFloat(node.style.top);
        if (!closePx(x, p1.x) || !closePx(y, p1.y + 4)) {
            return 'после движения камеры плашка (' + x.toFixed(1) + ', ' + y.toFixed(1)
                + '), боец (' + p1.x.toFixed(1) + ', ' + (p1.y + 4).toFixed(1) + ')';
        }
        return true;
    });
});

screen('combat-chip-4', 'плашка скрывается за камерой, обрезается у края и удаляется после боя', () => {
    const css = fs.readFileSync(path.join(ROOT, 'js/fs/FSUI.css'), 'utf8');
    const rule = css.match(/\.fs-unit-chips\{([^}]*)\}/);
    if (!rule || !/overflow\s*:\s*hidden/.test(rule[1])) return 'слой не обрезает плашку за краем';
    return chipScene({}, ({ scene, camera, view, layer, expected }) => {
        // Точка за камерой и точка перед ней, но за боковым краем экрана.
        const eye = camera.position;
        view.unitChips = [chipItem('behind', eye.x * 2, eye.y * 2, eye.z * 2),
            chipItem('edge', 4000, 0, -1800)];
        const behind = expected(view.unitChips[0]), edge = expected(view.unitChips[1]);
        if (behind.z >= 0 && behind.z <= 1) return 'проверка не поставила бойца за камеру';
        if (!(edge.z >= 0 && edge.z <= 1) || (edge.x >= 0 && edge.x <= 800)) return 'проверка не поставила бойца за край';
        scene.render(); scene.render();
        if (view.unitChipNodes[0].style.display !== 'none') return 'боец за камерой оставил плашку на экране';
        if (view.unitChipNodes[1].style.display !== 'flex') return 'плашка у края не может быть обрезана слоем';
        view.unitChips = [];
        scene.render();
        if (view.unitChipNodes.length || layer.children.length) return 'после боя плашки не удалены';
        return true;
    });
});

screen('combat-chip-5', 'плашка начинается под опорной точкой, а не поднимается на фигурку', () => {
    const css = fs.readFileSync(path.join(ROOT, 'js/fs/FSUI.css'), 'utf8');
    const rule = css.match(/\.fs-unit-chip\{([^}]*)\}/);
    if (!rule || !/transform\s*:\s*translate\(\s*-50%\s*,\s*0(?:px|%)?\s*\)/.test(rule[1])) {
        return 'CSS поднимает плашку над опорной точкой, на саму фигурку';
    }
    return true;
});

screen('combat-chip-6', 'плашка под видимой фигуркой, включая повёрнутую модель и подкрепление', () => {
    return chipScene({ renderWidth: 1200, renderHeight: 900 }, ({ B, scene, camera, view }) => {
        const { st, guard, warrior } = chipBattle('chips-geometry');
        // Геометрия моделей смещена относительно начала узла, как у OBJ в игре.
        // У воина поворот, у подкрепления отдельный корень с metadata.reinforceId.
        const make = (metadata, pos, local, angle) => {
            const root = new B.TransformNode('model', scene);
            root.metadata = metadata;
            root.position.set(...pos);
            root.rotation.y = angle;
            const body = B.MeshBuilder.CreateBox('part', { width: 26, height: 30, depth: 18 }, scene);
            body.parent = root;
            body.position.set(...local);
            return root;
        };
        // Пока OBJ загружается, вместо него может быть сам меш-цилиндр без дочерних узлов.
        const fallback = B.MeshBuilder.CreateCylinder('fallback', { diameter: 20, height: 18 }, scene);
        fallback.metadata = { fs: 'unit', unit: guard.id };
        fallback.position.set(5, 8, -10);
        const roots = new Map([
            [guard.id, fallback],
            [warrior.id, make({ fs: 'unit', unit: warrior.id }, [75, 4, 15], [-12, 15, 8], -0.9)],
            ['reinforce-defender-0', make({ fs: 'token', reinforceId: 'reinforce-defender-0' }, [-65, 3, 20], [6, 15, -12], 0.5)],
        ]);
        view.markers = Array.from(roots.values(), mesh => ({ mesh }));
        view.unitPositions = new Map([[guard.id, { x: 5, y: 2, z: -10 }], [warrior.id, { x: 75, y: 4, z: 15 }]]);
        view.reinforceAnchors = [{ side: 'defender', index: 0, x: -65, y: 3, z: 20, routed: false }];
        FS_VIEW.drawUnitChips(null, view, st);
        const verify = () => {
            const matrix = camera.getViewMatrix(true).multiply(camera.getProjectionMatrix(true));
            const viewport = camera.viewport.toGlobal(800, 600);
            const project = (x, y, z) => B.Vector3.Project(new B.Vector3(x, y, z), B.Matrix.Identity(), matrix, viewport);
            for (let i = 0; i < view.unitChips.length; i++) {
                const item = view.unitChips[i];
                const key = item.key.startsWith('rein:') ? 'reinforce-defender-0' : item.key.split(':')[0];
                const root = roots.get(key);
                if (!root) return 'нет модели для ' + item.key;
                const bounds = root.getHierarchyBoundingVectors(true), min = bounds.min, max = bounds.max;
                const center = project((min.x + max.x) / 2, min.y, (min.z + max.z) / 2);
                let bottom = -Infinity;
                for (const x of [min.x, max.x]) for (const y of [min.y, max.y]) for (const z of [min.z, max.z]) {
                    bottom = Math.max(bottom, project(x, y, z).y);
                }
                const node = view.unitChipNodes[i], x = parseFloat(node.style.left), y = parseFloat(node.style.top);
                if (!closePx(x, center.x) || !closePx(y, bottom + 4)) {
                    return key + ': плашка (' + x.toFixed(1) + ', ' + y.toFixed(1) + '), низ модели ('
                        + center.x.toFixed(1) + ', ' + (bottom + 4).toFixed(1) + ')';
                }
            }
            return null;
        };
        scene.render();
        const first = verify();
        if (first) return first;
        // Не только камера: если фигурка сдвинулась или повернулась, плашка
        // должна следовать за её геометрией, а не за старым местом на столе.
        roots.get(warrior.id).position.x += 30;
        roots.get(warrior.id).rotation.y += 0.8;
        camera.position.x -= 80; camera.setTarget(new B.Vector3(0, 0, 0));
        scene.render();
        const moved = verify();
        if (moved) return moved;
        // Сама модель за камерой, хотя старая координата на столе впереди.
        const eye = camera.position;
        roots.get(warrior.id).position.set(eye.x * 2, eye.y * 2, eye.z * 2);
        scene.render();
        const index = view.unitChips.findIndex(item => item.key.startsWith(warrior.id + ':'));
        if (index < 0 || view.unitChipNodes[index].style.display !== 'none') return 'плашка осталась на старом месте, когда модель ушла за камеру';
        return true;
    });
});

// Drive the real FSUI.mount handlers; unlike the basic stub, this DOM tracks
// classes and the element tree so a full shell rebuild can be checked too.
function withAltUI(check) {
    const saved = {
        root: FSUI.modernRoot, chips: FSUI.chipsEl, alt: FSUI.altZoom, keys: FSUI.altKeys,
        lobby: FSUI.currentLobby, pressed: FSUI.pressedPointer, deferred: FSUI.deferredRender,
        actionStage: FSUI.actionStage, renderState: FSUI.renderState, renderCtx: FSUI.renderCtx, lastCtx: FSUI.lastCtx, added: FSUI.added,
        panels: FSUI.panels, factionSeat: FSUI.factionSeat, drawerMounted: FSUI.drawerMounted, helpOpen: FSUI.helpOpen,
        plaqueEl: FSUI.plaqueEl, plaqueInfo: FSUI.plaqueInfo,
        body: ctx.document.body, create: ctx.document.createElement, docAdd: ctx.document.addEventListener,
        docRemove: ctx.document.removeEventListener, hidden: ctx.document.hidden,
        windowAdd: ctx.addEventListener, windowRemove: ctx.removeEventListener,
    };
    const winEvents = new Map(), docEvents = new Map();
    const listen = events => (type, fn) => {
        if (!events.has(type)) events.set(type, []);
        events.get(type).push(fn);
    };
    const unlisten = events => (type, fn) => {
        const list = events.get(type), i = list ? list.indexOf(fn) : -1;
        if (i >= 0) list.splice(i, 1);
    };
    const node = tag => {
        const n = el(tag);
        n.style.setProperty = (name, value) => { n.style[name] = String(value); };
        n.style.removeProperty = name => { delete n.style[name]; };
        const events = new Map();
        n.addEventListener = listen(events);
        n.removeEventListener = unlisten(events);
        n.click = () => { if (!n.disabled) for (const fn of events.get('click') || []) fn({ target: n, preventDefault: nothing }); };
        const classes = () => new Set(String(n.className).split(/\s+/).filter(Boolean));
        const write = set => { n.className = Array.from(set).join(' '); };
        n.classList = {
            contains: name => classes().has(name),
            add: (...names) => { const set = classes(); names.forEach(name => set.add(name)); write(set); },
            remove: (...names) => { const set = classes(); names.forEach(name => set.delete(name)); write(set); },
            toggle: (name, force) => {
                const set = classes(), on = force === undefined ? !set.has(name) : !!force;
                if (on) set.add(name); else set.delete(name);
                write(set); return on;
            },
        };
        n.querySelector = selector => {
            if (!/^\.[\w-]+$/.test(selector)) return null;
            const name = selector.slice(1);
            const find = parent => {
                for (const child of parent.children || []) {
                    if (child.classList && child.classList.contains(name)) return child;
                    const nested = find(child);
                    if (nested) return nested;
                }
                return null;
            };
            return find(n);
        };
        return n;
    };
    const fire = (events, type, data) => {
        const event = Object.assign({ key: '', code: '', defaultPrevented: false,
            preventDefault() { this.defaultPrevented = true; } }, data || {});
        for (const fn of events.get(type) || []) fn(event);
        return event;
    };
    try {
        ctx.document.body = node('body');
        ctx.document.createElement = node;
        ctx.document.addEventListener = listen(docEvents);
        ctx.document.removeEventListener = unlisten(docEvents);
        ctx.document.hidden = false;
        ctx.addEventListener = listen(winEvents);
        ctx.removeEventListener = unlisten(winEvents);
        FSUI.modernRoot = null; FSUI.chipsEl = null; FSUI.altZoom = false; FSUI.altKeys = new Set();
        FSUI.currentLobby = null; FSUI.pressedPointer = null; FSUI.deferredRender = null;
        FSUI.renderState = null; FSUI.renderCtx = null; FSUI.panels = null;
        FSUI.factionSeat = null; FSUI.helpOpen = false; FSUI.plaqueEl = null; FSUI.plaqueInfo = null;
        const root = FSUI.mount();
        return check({ root, node, fireWindow: (type, data) => fire(winEvents, type, data),
            fireDocument: (type, data) => fire(docEvents, type, data) });
    } finally {
        FSUI.modernRoot = saved.root; FSUI.chipsEl = saved.chips; FSUI.altZoom = saved.alt; FSUI.altKeys = saved.keys;
        FSUI.currentLobby = saved.lobby; FSUI.pressedPointer = saved.pressed; FSUI.deferredRender = saved.deferred;
        FSUI.actionStage = saved.actionStage; FSUI.renderState = saved.renderState; FSUI.renderCtx = saved.renderCtx;
        FSUI.lastCtx = saved.lastCtx; FSUI.added = saved.added;
        FSUI.panels = saved.panels; FSUI.factionSeat = saved.factionSeat; FSUI.drawerMounted = saved.drawerMounted;
        FSUI.helpOpen = saved.helpOpen; FSUI.plaqueEl = saved.plaqueEl; FSUI.plaqueInfo = saved.plaqueInfo;
        ctx.document.body = saved.body; ctx.document.createElement = saved.create;
        ctx.document.addEventListener = saved.docAdd; ctx.document.removeEventListener = saved.docRemove;
        ctx.document.hidden = saved.hidden; ctx.addEventListener = saved.windowAdd; ctx.removeEventListener = saved.windowRemove;
    }
}

screen('combat-chip-7', 'плашки видны только пока зажат Alt; увеличение карты по Alt сохранено', () => {
    const css = fs.readFileSync(path.join(ROOT, 'js/fs/FSUI.css'), 'utf8');
    const base = css.match(/\.fs-unit-chips\{([^}]*)\}/);
    const held = css.match(/\.fs-shell\.is-alt\s+\.fs-unit-chips\{([^}]*)\}/);
    if (!base || !/visibility\s*:\s*hidden/.test(base[1])) return 'без Alt слой плашек не скрыт';
    if (!held || !/visibility\s*:\s*visible/.test(held[1])) return 'зажатый Alt не показывает слой плашек';
    return withAltUI(({ root, node, fireWindow }) => {
        const hand = node('div'); hand.className = 'fs-battle-hand'; root.appendChild(hand);
        if (root.classList.contains('is-alt')) return 'плашки открыты до нажатия Alt';
        fireWindow('keydown', { key: 'Shift', code: 'ShiftLeft' });
        if (root.classList.contains('is-alt')) return 'плашки открылись от Shift';
        const down = fireWindow('keydown', { key: 'Alt', code: 'AltLeft' });
        if (!down.defaultPrevented) return 'Alt открывает меню браузера';
        if (!root.classList.contains('is-alt')) return 'зажатый Alt не открыл плашки';
        if (!hand.classList.contains('is-alt')) return 'старое увеличение карты по Alt перестало работать';
        fireWindow('keyup', { key: 'Shift', code: 'ShiftLeft' });
        if (!root.classList.contains('is-alt')) return 'отпускание другой клавиши скрыло плашки';
        fireWindow('keyup', { key: 'Alt', code: 'AltLeft' });
        if (root.classList.contains('is-alt') || hand.classList.contains('is-alt')) return 'после отпускания Alt состояние не сброшено';
        return true;
    });
});

screen('combat-chip-8', 'оба Alt работают независимо, включая правый AltGraph и автоповтор', () => {
    return withAltUI(({ root, fireWindow }) => {
        fireWindow('keydown', { key: 'Alt', code: 'AltLeft' });
        fireWindow('keydown', { key: 'Alt', code: 'AltLeft', repeat: true });
        fireWindow('keydown', { key: 'AltGraph', code: 'AltRight' });
        fireWindow('keyup', { key: 'Alt', code: 'AltLeft' });
        if (!root.classList.contains('is-alt')) return 'левый Alt отпущен, но правый ещё зажат';
        fireWindow('keyup', { key: 'AltGraph', code: 'AltRight' });
        if (root.classList.contains('is-alt')) return 'после отпускания обеих клавиш плашки остались';
        fireWindow('keydown', { key: 'AltGraph', code: 'AltRight' });
        if (!root.classList.contains('is-alt')) return 'правый Alt не показал плашки';
        fireWindow('keyup', { key: 'AltGraph', code: 'AltRight' });
        if (root.classList.contains('is-alt')) return 'правый Alt отпущен, но плашки остались';
        return true;
    });
});

screen('combat-chip-9', 'перерисовка боя сохраняет Alt, потеря фокуса и скрытая вкладка сбрасывают его', () => {
    return withAltUI(({ root, fireWindow, fireDocument }) => {
        const { st } = chipBattle('chips-alt');
        const battle = Object.assign({}, SCREEN_CTX, { battleHand: [{ name: 'Карта', text: 'Текст', playable: true }] });
        FSUI.renderModern(st, battle);
        const oldChips = FSUI.chipsEl;
        fireWindow('keydown', { key: 'Alt', code: 'AltLeft' });
        FSUI.renderModern(st, battle);
        const hand = root.querySelector('.fs-battle-hand');
        if (!root.classList.contains('is-alt') || !root.contains(oldChips) || FSUI.chipsEl !== oldChips) {
            return 'перерисовка боя скрыла или удалила слой при зажатом Alt';
        }
        if (!hand || !hand.classList.contains('is-alt')) return 'после перерисовки потерялось увеличение карты по Alt';
        fireWindow('blur');
        if (root.classList.contains('is-alt') || hand.classList.contains('is-alt')) return 'после потери фокуса Alt застрял';
        fireWindow('keydown', { key: 'Alt', code: 'AltRight' });
        fireWindow('keyup', { key: 'Alt', code: 'AltRight' });
        if (root.classList.contains('is-alt')) return 'после blur старая нажатая клавиша осталась в наборе';
        fireWindow('keydown', { key: 'Alt', code: 'AltLeft' });
        fireDocument('visibilitychange');
        if (!root.classList.contains('is-alt')) return 'видимая вкладка сбросила зажатый Alt';
        ctx.document.hidden = true;
        fireDocument('visibilitychange');
        if (root.classList.contains('is-alt')) return 'на скрытой вкладке плашки не сброшены';
        ctx.document.hidden = false;
        fireDocument('visibilitychange');
        if (root.classList.contains('is-alt')) return 'при возврате на вкладку плашки открылись сами';
        fireWindow('keydown', { key: 'Alt', code: 'AltRight' });
        fireWindow('keyup', { key: 'Alt', code: 'AltRight' });
        if (root.classList.contains('is-alt')) return 'после скрытия вкладки старая клавиша осталась в наборе';
        return true;
    });
});

// ============================================================================
console.log('\n' + (failed.length
    ? C.red + C.b + '  Экраны: ' + failed.length + ' провалов из ' + done + '.' + C.r
    : C.grn + C.b + '  Экраны сходятся: ' + done + ' проверок, 0 провалов.' + C.r) + '\n');
for (const f of failed) console.log('   ' + C.red + '· ' + f.id + C.r + ' — ' + f.why);
process.exit(failed.length ? 1 : 0);
