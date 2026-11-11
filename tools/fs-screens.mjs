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
        title: '', type: '', value: '', maxLength: 0, disabled: false, style: { setProperty: nothing, removeProperty: nothing },
        classList: { add: nothing, remove: nothing, toggle: nothing, contains: () => false },
        append(...xs) { for (const x of xs) this.children.push(x); },
        appendChild(x) { this.children.push(x); return x; },
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

// ============================================================================
console.log('\n' + (failed.length
    ? C.red + C.b + '  Экраны: ' + failed.length + ' провалов из ' + done + '.' + C.r
    : C.grn + C.b + '  Экраны сходятся: ' + done + ' проверок, 0 провалов.' + C.r) + '\n');
for (const f of failed) console.log('   ' + C.red + '· ' + f.id + C.r + ' — ' + f.why);
process.exit(failed.length ? 1 : 0);
