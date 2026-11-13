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
        title: '', type: '', value: '', maxLength: 0, disabled: false, dataset: {}, attributes: {}, listeners: {},
        style: { setProperty: nothing, removeProperty: nothing },
        classList: { add: nothing, remove: nothing, toggle: nothing, contains: () => false },
        append(...xs) { for (const x of xs) this.children.push(x); },
        get childNodes() { return this.children; },
        appendChild(x) { this.children.push(x); return x; },
        contains(x) { return this.children.includes(x); },
        removeChild(x) { const i = this.children.indexOf(x); if (i >= 0) this.children.splice(i, 1); },
        replaceChildren(...xs) { this.children = xs; },
        remove: nothing,
        setAttribute(name, value) { this.attributes[name] = String(value); },
        getAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null; },
        addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); },
        removeEventListener: nothing, focus: nothing, blur: nothing,
        click() { if (!this.disabled) for (const fn of this.listeners.click || []) fn({ target: this, preventDefault: nothing }); },
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

screen('lan-identities-ui', 'переподключение, разные комнаты, безопасный перенос старого секрета и комната по умолчанию', () => {
    const old = {
        store: ctx.Store, net: ctx.FSNet, location: ctx.location, url: ctx.URL, params: ctx.URLSearchParams, history: ctx.history,
        query: ctx.document.querySelector, create: FS_VIEW.create, ground: FS_VIEW.spaceGround, mount: FSUI.mount,
        hand: FSUI.onHandPlay, undo: FSUI.onUndo,
    };
    const methods = ['setupCamera', 'bindPointer', 'bindSetupKeys', 'bindUndoKey', 'showLobby'];
    const originals = methods.map(name => FS_GAME.prototype[name]);
    const values = new Map(), connections = [];
    let defaultRoom = '', failKey = '';
    try {
        ctx.Store = {
            get: key => values.get(key) || null,
            set: (key, value) => { if (key === failKey) return false; values.set(key, value); return true; },
            remove: key => values.delete(key),
        };
        ctx.URL = URL;
        ctx.URLSearchParams = URLSearchParams;
        ctx.history = { replaceState: nothing };
        ctx.document.querySelector = selector => selector === 'meta[name="fs-default-room"]'
            ? { getAttribute: () => defaultRoom } : null;
        ctx.FSNet = { connect: opts => {
            const handlers = {};
            const net = { on(name, fn) { handlers[name] = fn; return net; } };
            connections.push({ opts, handlers });
            return net;
        } };
        FS_VIEW.create = () => ({});
        FS_VIEW.spaceGround = nothing;
        FSUI.mount = nothing;
        methods.forEach(name => { FS_GAME.prototype[name] = nothing; });
        const open = room => {
            const url = new URL('http://localhost/?name=Игрок');
            if (room !== null) url.searchParams.set('room', room);
            ctx.location = { search: url.search, href: url.href };
            const game = new FS_GAME({ location: {}, camera: {} });
            return { game, connection: connections[connections.length - 1] };
        };
        const joined = (entry, room, id) => entry.connection.handlers.joined({ room, id, seat: 0, factions: [] });
        const alphaId = 'A'.repeat(32), betaId = 'B'.repeat(32);
        const first = open(' alpha ');
        if (first.connection.opts.room !== 'ALPHA') return 'код комнаты не приведён к виду сервера';
        joined(first, 'ALPHA', alphaId);
        const second = open('beta');
        if (second.connection.opts.id) return 'в новую комнату передан секрет предыдущей';
        joined(second, 'BETA', betaId);
        const alpha = open(' ALpHa '), beta = open('BETA');
        if (alpha.game.id !== alphaId || alpha.connection.opts.id !== alphaId) return 'после входа в BETA потеряно место ALPHA';
        if (beta.game.id !== betaId || beta.connection.opts.id !== betaId) return 'для BETA выбран чужой секрет';
        joined(alpha, 'ALPHA', '');
        if (alpha.game.id !== alphaId || values.get('fs.id.ALPHA') !== alphaId) return 'отказ сервера стёр сохранённый секрет';

        // Old servers issued public ids such as p1. They cannot be used as a
        // credential in an unrelated room; hardened servers never issue them.
        values.set('fs.id', 'p1');
        if (open('GAMMA').connection.opts.id) return 'старый публичный id использован как секрет';
        const legacy = 'L'.repeat(32), fresh = 'N'.repeat(32);
        values.set('fs.id', legacy);
        const other = open('GAMMA');
        if (other.connection.opts.id !== legacy) return 'не предложен старый непредсказуемый секрет';
        joined(other, 'GAMMA', fresh);
        if (values.get('fs.id') !== legacy) return 'вход в другую комнату потерял старый секрет';
        const refused = open('DELTA');
        joined(refused, 'DELTA', '');
        if (values.get('fs.id') !== legacy) return 'отказ при переносе потерял старый секрет';
        const migrated = open('DELTA');
        if (migrated.connection.opts.id !== legacy) return 'старый секрет не повторён после отказа';
        joined(migrated, 'DELTA', legacy);
        if (values.get('fs.id.DELTA') !== legacy || values.has('fs.id')) return 'подтверждённый секрет не привязан к комнате';
        const unwritable = 'U'.repeat(32);
        values.set('fs.id', unwritable);
        failKey = 'fs.id.EPSILON';
        const failedSave = open('EPSILON');
        joined(failedSave, 'EPSILON', unwritable);
        if (values.get('fs.id') !== unwritable) return 'старый секрет удалён при неудачном сохранении';
        failKey = ''; values.delete('fs.id');

        // The server supplies the default code in the page: it identifies the
        // room before the first hello, even without a room query parameter.
        defaultRoom = 'BETA';
        const plain = open(null);
        if (plain.connection.opts.room !== 'BETA' || plain.connection.opts.id !== betaId) return 'обычный адрес не вернул место комнаты по умолчанию';
        defaultRoom = '__FS_DEFAULT_ROOM__';
        const unresolved = open(null);
        if (unresolved.connection.opts.room || unresolved.connection.opts.id) return 'незаполненная метка принята за код комнаты';
        return true;
    } finally {
        ctx.Store = old.store; ctx.FSNet = old.net; ctx.location = old.location;
        ctx.URL = old.url; ctx.URLSearchParams = old.params; ctx.history = old.history;
        ctx.document.querySelector = old.query;
        FS_VIEW.create = old.create; FS_VIEW.spaceGround = old.ground; FSUI.mount = old.mount;
        FSUI.onHandPlay = old.hand; FSUI.onUndo = old.undo;
        methods.forEach((name, i) => { FS_GAME.prototype[name] = originals[i]; });
    }
});

screen('lan-retry-ui', 'сеть повторяет свой секрет после отказа и принимает новый после успешного входа', () => {
    const sockets = [], timers = [];
    class Socket {
        static OPEN = 1;
        constructor() { this.readyState = Socket.OPEN; this.sent = []; sockets.push(this); }
        send(text) { this.sent.push(JSON.parse(text)); }
        close() { if (this.onclose) this.onclose(); }
    }
    const sandbox = vm.createContext({
        location: { protocol: 'http:', host: 'localhost:8080' },
        WebSocket: Socket, setTimeout: fn => timers.push(fn),
    });
    const network = vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/fs/FSNet.js'), 'utf8') + '\nFSNet', sandbox);
    const original = 'A'.repeat(32), replacement = 'B'.repeat(32);
    const net = network.connect({ room: 'ALPHA', id: original, name: 'Игрок' });
    const first = sockets[0];
    first.onopen();
    if (first.sent[0].id !== original) return 'первое соединение не отправило свой секрет';
    first.onmessage({ data: JSON.stringify({ t: 'joined', id: '', room: 'ALPHA' }) });
    if (net.id !== original) return 'отказ очистил секрет сетевого клиента';
    first.onclose();
    if (!timers.length) return 'после обрыва не назначено переподключение';
    timers.shift()();
    const retry = sockets[1];
    retry.onopen();
    if (retry.sent[0].id !== original) return 'переподключение потеряло секрет после отказа';
    retry.onmessage({ data: JSON.stringify({ t: 'joined', id: replacement, room: 'ALPHA' }) });
    if (net.id !== replacement) return 'успешный вход не обновил секрет';
    net.stop();
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
head('Сборка карты: две стороны тайла, значки и начальные силы');

/** Настоящая сборка и клиент на том виде, который получил бы игрок по сети. */
function setupFixture() {
    const live = FS_RULES.newGame({ seed: 42, players: SEAT_PLAYERS, interactiveSetup: true });
    const seat = live.setup.turn;
    const view = FS_RULES.view(live, seat);
    const sent = [], previews = [];
    const game = Object.create(FS_GAME.prototype);
    Object.assign(game, {
        state: view, view: {}, app: {}, mode: 'idle', pending: null, setupSubmitting: false, status: '', warn: '',
        net: { cmd: cmd => { sent.push(JSON.parse(JSON.stringify(cmd))); return true; } },
        highlightSetupCells: nothing, highlightSetupTargets: nothing, refresh: nothing,
        updateSetupPreview: () => previews.push(JSON.parse(JSON.stringify(game.pending))),
    });
    const panel = () => {
        const out = { title: '', text: '', status: '', warn: '', actions: [], mode: game.mode, setupCellSelected: false };
        game.panelSetup(game.state, out);
        return out;
    };
    return { live, seat, view, game, sent, previews, panel };
}

screen('setup-ui-1', 'обе стороны каждого физического тайла показаны рядом и каждая нажимается', () => {
    const f = setupFixture(), p = f.panel();
    FSUI.update(f.view, p);
    const rows = nodesWithClass(FSUI.modernRoot, 'fs-tile-row');
    if (rows.length !== f.view.setup.hand.length) return 'число рядов не равно числу тайлов в руке';
    const css = fs.readFileSync(path.join(ROOT, 'js/fs/FSUI.css'), 'utf8');
    const rowStyle = css.match(/\.fs-tile-row\{([^}]*)\}/);
    if (!rowStyle || !/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/.test(rowStyle[1])) return 'две стороны не стоят в двух колонках';
    for (let i = 0; i < rows.length; i++) {
        const handTile = f.view.setup.hand[i];
        const faces = FS_RULES.tileFaces(handTile);
        if (faces.length !== 2 || rows[i].children.length !== 2) return handTile + ': ожидались две отдельные кнопки';
        for (let j = 0; j < 2; j++) {
            const button = rows[i].children[j];
            if (button.tagName !== 'BUTTON' || !textsOf(button).includes('Система ' + faces[j].id)) return handTile + ': неверная сторона в кнопке ' + j;
            if (button.getAttribute('aria-pressed') !== 'false') return faces[j].id + ': незапрошенная сторона выделена';
            button.click();
            if (f.game.pending.handTile !== handTile || f.game.pending.tile !== faces[j].id) return faces[j].id + ': клик выбрал другую сторону или тайл';
        }
    }
    return true;
});

screen('setup-ui-2', 'выбор стороны сохраняет клетку и поворот, подтверждение отправляет её ровно раз', () => {
    const f = setupFixture(), id = f.view.setup.hand[0];
    const [a, b] = FS_RULES.tileFaces(id);
    const clickFace = face => {
        FSUI.update(f.view, f.panel());
        const button = nodesWithClass(FSUI.modernRoot, 'fs-tile-choice').find(n => textsOf(n).includes('Система ' + face));
        if (!button) throw new Error('нет кнопки ' + face);
        button.click();
    };
    clickFace(b.id);
    if (f.game.pending.tile !== b.id || f.game.pending.handTile !== id) return 'сторона B не выбрана';
    const cell = f.view.setup.legalCells[0];
    f.game.pending.cell = { row: cell.row, col: cell.col };
    f.game.transformSetupTile('right');
    let p = f.panel();
    let chosen = p.actions.filter(x => x.tile && x.selected);
    if (chosen.length !== 1 || chosen[0].tile.id !== b.id || f.game.pending.rotation !== 1) return 'не выделена повёрнутая сторона B';
    const signature = areas => areas.map(area => area.pos + ':' + (area.world ? area.world.name : '-')).join('|');
    const rotated = FS_RULES.createSystemFromTile({ systems: [] }, b, f.seat, 0, 0, 1);
    if (signature(chosen[0].tile.areas) !== signature(rotated.areas)) return 'секторы выбранной стороны не повёрнуты вместе с доской';
    clickFace(a.id);
    if (f.game.pending.tile !== a.id || f.game.pending.rotation !== 1 || JSON.stringify(f.game.pending.cell) !== JSON.stringify(cell)) return 'переход на A потерял сторону, поворот или клетку';
    const latest = f.previews[f.previews.length - 1];
    if (!latest || latest.tile !== a.id || latest.rotation !== 1 || JSON.stringify(latest.cell) !== JSON.stringify(cell)) return 'предпросмотр не обновился на выбранную A';
    f.game.transformSetupTile('flip');
    if (f.game.pending.tile !== b.id || f.game.pending.rotation !== 1) return 'клавиша смены стороны перестала работать';
    p = f.panel();
    if (p.actions.filter(x => x.tile && x.selected).map(x => x.tile.id).join() !== b.id) return 'выделение не перешло на B';
    const other = FS_RULES.tileFaces(f.view.setup.hand[1])[1].id;
    clickFace(other);
    if (f.game.pending.tile !== other || f.game.pending.rotation !== 0 || JSON.stringify(f.game.pending.cell) !== JSON.stringify(cell)) return 'другой тайл потерял клетку или унаследовал поворот';
    clickFace(b.id);
    f.game.transformSetupTile('right');
    f.game.confirmSetupTile();
    f.game.confirmSetupTile();
    clickFace(a.id);
    if (f.sent.length !== 1 || f.game.pending.tile !== b.id) return 'отправка повторилась или позволила сменить сторону до ответа';
    const cmd = f.sent[0];
    if (cmd.type !== 'placeSystemTile' || cmd.tile !== b.id || cmd.rotation !== 1 || cmd.row !== cell.row || cmd.col !== cell.col) return 'серверу отправлены неверные сторона, поворот или клетка';
    const result = FS_RULES.apply(f.live, f.seat, cmd);
    if (!result.ok) return 'сервер отклонил выбранную сторону: ' + result.error;
    const sys = f.live.systems.find(s => s.id === f.live.setup.currentSystem);
    if (!sys || sys.tile !== b.id || f.live.setup.hands[f.seat].includes(id)) return 'поставлена не B или физический тайл не ушёл из руки';
    return true;
});

screen('setup-ui-3', 'у миров точные числа и значки, в пустоте нет вместимости и не показаны цели', () => {
    const catalog = vm.runInContext('FS_CATALOG', ctx);
    const glyphs = { forge: ['asset.forge', 'Кузница'], cache: ['asset.cache', 'Запасы'], reinforcement: ['order.event', 'Подкрепление'], prosperity: ['asset.prosperity', 'Процветание'] };
    let objectives = 0, doubles = 0, voids = 0, worlds = 0;
    for (const tile of catalog.tiles) {
        const preview = FSUI.tilePreview(tile);
        const sectors = nodesWithClass(preview, 'fs-tile-sector');
        if (sectors.length !== 4) return tile.id + ': должно быть четыре сектора';
        if (textsOf(preview).some(t => /материя|вместимость|кузница|запасы|подкрепление|процветание|цель/i.test(t))) return tile.id + ': в превью осталась текстовая подпись характеристики, ресурса или цели';
        for (let i = 0; i < 4; i++) {
            const area = tile.areas.find(x => x.pos === ['TL', 'TR', 'BL', 'BR'][i]);
            const world = area && area.world, sector = sectors[i];
            const stats = nodesWithClass(sector, 'fs-tile-stat');
            const icons = nodesWithClass(sector, 'fs-ico');
            if (icons.some(n => n.getAttribute('data-icon') === 'mark.objective')) return tile.id + ': цель видна значком';
            if (world) { worlds++; if (world.objective) objectives++; }
            else {
                voids++;
                if (icons.some(n => n.getAttribute('data-icon') === 'mark.skull') || textsOf(sector).some(t => /\d/.test(t))) return tile.id + ': вместимость показана в пустоте';
            }
            const wanted = world
                ? [['asset.materiel', 'Материя', world.materiel || 0], ['mark.skull', 'Вместимость', world.capacity]]
                : [];
            if (stats.length !== wanted.length) return tile.id + ': неверное число характеристик в ' + area.pos;
            for (let j = 0; j < wanted.length; j++) {
                const icon = nodesWithClass(stats[j], 'fs-tile-stat-icon')[0];
                if (!icon || icon.getAttribute('data-icon') !== wanted[j][0] || icon.getAttribute('aria-label') !== wanted[j][1]
                    || !textsOf(stats[j]).includes(String(wanted[j][2])) || !stats[j].title.includes(String(wanted[j][2]))) {
                    return tile.id + ': неправильный значок, число или подсказка в ' + area.pos;
                }
            }
            const resources = nodesWithClass(sector, 'fs-tile-asset-icon');
            const assets = world ? world.assets || [] : [];
            if (assets.length > 1) doubles++;
            if (resources.length !== assets.length) return tile.id + ': потерян жетон ресурса в ' + area.pos;
            for (let j = 0; j < assets.length; j++) {
                const [icon, label] = glyphs[assets[j]];
                if (resources[j].getAttribute('data-icon') !== icon || resources[j].getAttribute('aria-label') !== label || resources[j].title !== label) return tile.id + ': неверный ресурс ' + assets[j];
            }
            if (world && !textsOf(sector).includes(world.name)) return tile.id + ': потеряно название мира';
            if (!world && !textsOf(sector).includes('Пустота')) return tile.id + ': потеряна пустота';
        }
    }
    if (!objectives || !doubles || !voids || !worlds) return 'проверка не встретила миры, пустоту, места цели или повторные ресурсы';
    return true;
});

screen('setup-ui-4', 'начальные силы без дублирующего списка, этап целей сохраняет выбор и постановку', () => {
    const f = setupFixture(), id = f.view.setup.hand[0], face = FS_RULES.tileFaces(id)[1];
    const cell = f.view.setup.legalCells[0];
    const placed = FS_RULES.apply(f.live, f.seat, { type: 'placeSystemTile', tile: face.id, row: cell.row, col: cell.col });
    if (!placed.ok) return 'нельзя создать экран сил: ' + placed.error;
    f.game.state = FS_RULES.view(f.live, f.seat);
    let p = f.panel();
    if (p.tokens && p.tokens.length) return 'список «Ваши жетоны» вернулся';
    const initial = f.live.players[f.seat].initialForces;
    const faction = vm.runInContext('FS_CATALOG', ctx).faction(f.live.players[f.seat].faction);
    const expected = [];
    for (const [id, n] of Object.entries(initial.units)) if (n) expected.push([faction.units.find(u => u.id === id).name, n]);
    const structureNames = { factory: 'Фабрика', bastion: 'Бастион', city: 'Город' };
    for (const [id, n] of Object.entries(initial.structures)) if (n) expected.push([structureNames[id], n]);
    const picks = p.actions.filter(x => x.kind === 'pick');
    if (picks.length !== expected.length || expected.some(([name, n]) => !picks.some(x => x.label === name && x.count === n))) return 'количество фигур исчезло с кнопок';
    FSUI.update(f.game.state, p);
    if (nodesWithClass(FSUI.modernRoot, 'fs-tokens').length) return 'полоса жетонов нарисована в DOM';
    const counts = nodesWithClass(FSUI.modernRoot, 'fs-pick-count').map(x => x.textContent);
    if (counts.length !== expected.length || expected.some(([, n]) => !counts.includes(n + '×'))) return 'счёт не нарисован на кнопках фигур';
    if (!p.actions.some(x => x.kind === 'primary' && /Завершить размещение сил/.test(x.label))) return 'исчезло завершение размещения сил';
    const done = FS_RULES.apply(f.live, f.seat, { type: 'finishSetupForces' });
    if (!done.ok || f.live.setup.stage !== 'objectives') return 'не удалось перейти к настоящему этапу целей';
    f.game.state = FS_RULES.view(f.live, f.seat);
    p = f.panel();
    if (!p.hand || !p.hand.length || !f.game.state.setup.objectiveOptions.length) return 'выбор жетона цели соперника пропал';
    p.hand[0].onClick();
    const option = f.game.state.setup.objectiveOptions.find(x => x.faction === f.game.pending.faction);
    if (f.game.mode !== 'setupObjective' || !option || !option.areas.length) return 'клик по жетону цели не выбирает его';
    f.game.pending.pos = option.areas[0];
    f.game.confirmSetupObjective();
    const cmd = f.sent.at(-1);
    if (!cmd || cmd.type !== 'setupObjective' || cmd.faction !== option.faction || cmd.pos !== option.areas[0]) return 'подтверждение цели отправляет неверную команду';
    const result = FS_RULES.apply(f.live, f.seat, cmd);
    if (!result.ok || !f.live.objectives.some(x => x.faction === option.faction && x.area === option.areas[0])) return 'движок не поставил жетон цели';
    return true;
});

screen('setup-ui-5', 'выбор нижнего тайла и поворот не сбрасывают прокрутку, новый этап начинает сверху', () => {
    const f = setupFixture(), root = FSUI.modernRoot, query = root.querySelector;
    root.querySelector = selector => selector[0] === '.' ? nodesWithClass(root, selector.slice(1))[0] || null : null;
    try {
        FSUI.update(f.view, f.panel());
        nodesWithClass(root, 'fs-actions')[0].scrollTop = 177;
        const rows = nodesWithClass(root, 'fs-tile-row');
        rows[rows.length - 1].children[1].click();
        FSUI.update(f.view, f.panel());
        if (nodesWithClass(root, 'fs-actions')[0].scrollTop !== 177) return 'выбор нижнего тайла вернул список к началу';
        f.game.transformSetupTile('right');
        FSUI.update(f.view, f.panel());
        if (nodesWithClass(root, 'fs-actions')[0].scrollTop !== 177) return 'поворот сбросил прокрутку';
        const cell = f.view.setup.legalCells[0];
        const result = FS_RULES.apply(f.live, f.seat, { type: 'placeSystemTile', tile: f.view.setup.hand[0], row: cell.row, col: cell.col });
        if (!result.ok) return 'не удалось перейти к силам: ' + result.error;
        f.game.state = FS_RULES.view(f.live, f.seat); f.game.mode = 'idle'; f.game.pending = null;
        FSUI.update(f.game.state, f.panel());
        if (nodesWithClass(root, 'fs-actions')[0].scrollTop !== 0) return 'новый этап унаследовал прокрутку старого';
        return true;
    } finally { root.querySelector = query; }
});

screen('setup-ui-6', 'компактная мобильная сборка доступна до выбора и не переносится на этап сил', () => {
    // В node нет расчёта геометрии; реальные размеры и клики отдельно проверяют
    // в браузере. Здесь фиксируем, что компактный режим включается уже в руке.
    const f = setupFixture(), root = FSUI.modernRoot, original = root.classList, classes = new Set();
    root.classList = {
        add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name),
        toggle: (name, on) => { if (on) classes.add(name); else classes.delete(name); },
    };
    try {
        FSUI.update(f.view, f.panel());
        if (!classes.has('is-setup-tiles')) return 'компактная панель не включилась до выбора стороны';
        nodesWithClass(root, 'fs-tile-choice')[1].click();
        FSUI.update(f.view, f.panel());
        if (!classes.has('is-setup-tiles')) return 'компактная панель исчезла после выбора стороны';
        const css = fs.readFileSync(path.join(ROOT, 'js/fs/FSUI.css'), 'utf8');
        const portrait = css.match(/\.fs-shell\.is-mobile\.is-setup-tiles \.fs-main-panel\{([^}]*)\}/);
        const landscape = css.match(/@media \(orientation:landscape\) and \(max-height:550px\)\{\s*\.fs-shell\.is-mobile\.is-setup-tiles \.fs-main-panel\{([^}]*)\}/);
        const plaque = css.match(/\.fs-shell\.is-mobile\.is-setup-tiles \.fs-plaque\{([^}]*)\}/);
        if (!portrait || !/(?:^|;)height:min\(44vh,350px\)/.test(portrait[1])) return 'нет компактной панели в портретной ориентации';
        if (!landscape || !/width:min\(356px,45vw\)/.test(landscape[1])) return 'альбомная панель перекрывает центр доски';
        if (!plaque || !/max-width:calc\(100vw - 16px\)/.test(plaque[1])) return 'подтверждение тайла не ограничено шириной экрана';
        const cell = f.view.setup.legalCells[0];
        const result = FS_RULES.apply(f.live, f.seat, { type: 'placeSystemTile', tile: f.view.setup.hand[0], row: cell.row, col: cell.col });
        if (!result.ok) return 'не удалось перейти к силам: ' + result.error;
        f.game.state = FS_RULES.view(f.live, f.seat); f.game.mode = 'idle'; f.game.pending = null;
        FSUI.update(f.game.state, f.panel());
        if (classes.has('is-setup-tiles')) return 'режим тайлов остался на этапе начальных сил';
        return true;
    } finally { root.classList = original; }
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
            parts: { att: part(2, 1, 3, 0), def: part(1, 0, 2, 0), morale: part(2, 0, 1, 4) },
            values: { att: 6, def: 3, morale: 7 }, deals: 4, takes: 2 },
        { side: 'defender', name: 'Противник', color: '#448866',
            parts: { att: part(3, 1, 0, 0), def: part(2, 0, 0, 0), morale: part(1, 0, 1, 2) },
            values: { att: 4, def: 2, morale: 4 }, deals: 2, takes: 4, peeked: { name: 'Подсмотренная карта' } },
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
        const expected = [
            ['2', '+', '1', '+', '3', '6'], ['1', '+', '0', '+', '2', '3'], ['2', '+', '1', '+', '4', '7'],
            ['3', '+', '1', '+', '0', '4'], ['2', '+', '0', '+', '0', '2'], ['1', '+', '1', '+', '2', '4'],
        ];
        for (let i = 0; i < expected.length; i++) {
            if (textsOf(lines[i]).join('|') !== expected[i].join('|')) return 'неверные слагаемые или сумма в строке ' + (i + 1) + ': ' + textsOf(lines[i]).join('|');
            const sum = lines[i].querySelector('.fs-battle-line-sum');
            const titles = sum.children.filter(x => x.classList.contains('fs-battle-part')).map(x => x.title);
            const sources = i % 3 === 2 ? ['С кубиков', 'С карт', 'С отрядов и бастионов'] : ['С кубиков', 'С жетонов', 'С карт'];
            if (titles.join('|') !== sources.join('|')) return 'неверные источники в строке ' + (i + 1) + ': ' + titles.join('|');
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
            const view = { scene: {}, tiles: new Map(), metrics: { originX: 0, originY: 0 }, stormPending: 'sx',
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

head('Переполнение и ожидающие способности');

screen('trim-priority-1', 'оба места видят верную панель при одновременном вопросе и переполнении', () => {
    // Use the actual refresh() branch: a card question must not hide the trim
    // controls, and the other LAN seat must not see a button it cannot press.
    const st = party('trim-priority');
    st.units = []; st.structures = []; st.objectives = []; st.storms = [];
    for (const s of st.systems) s.tokens = [];
    st.phase = 'operations'; st.turn = 0; st.order = null;
    const sys = st.systems[0], area = sys.areas.find(a => a.world);
    const cap = FS_RULES.capacity(st, sys.id, area.pos);
    for (let i = 0; i < cap + 1; i++) FS_RULES.addUnit(st, 0, 'гвардейцы', sys.id, area.pos);
    st.systems[1].tokens.push({ seat: 1, order: 'deploy', faceUp: false });
    FS_RULES.trimQueue(st).ask(0, sys.id, area.pos, cap, cap + 1);
    st.orderTrimPending = true;
    FS_RULES.runEffects(st, 1, [{ op: 'chooseSystem', who: 'me' }], { kind: 'event' });
    if (!st.pending) return 'не создан ожидающий вопрос способности';
    const clients = [0, 1].map(seat => {
        const game = Object.create(FS_GAME.prototype);
        Object.assign(game, {
            state: FS_RULES.view(st, seat), view: { highlights: [], selection: [], selectionRings: [] },
            app: { camera: { azimuth: 0 } }, mode: 'idle', pending: null, orderKey: '',
            hand: [], trimPick: [], effectPick: [], effectDie: null, pendingQuestionRef: null,
            questionMarkersActive: false, reinforceStep: null, status: '', warn: '',
            ringAreas: nothing, refreshPlaque: nothing, updateQuestionMarkers: nothing,
            net: { cmd: cmd => FS_RULES.apply(st, seat, cmd) },
        });
        return game;
    });
    const oldUpdate = FSUI.update;
    let panel = null;
    FSUI.update = (state, next) => { panel = next; };
    try {
        clients[0].refresh();
        if (panel.title !== 'Сверх вместимости' || panel.panelClass !== 'is-trim') return 'вопрос скрыл панель переполнения';
        const chip = panel.actions.find(a => a.kind === 'chip');
        if (!chip) return 'нет кнопки выбора лишнего отряда';
        chip.onClick();
        if (clients[0].trimPick.length !== 1) return 'кнопка не отметила отряд';
        const marked = clients[0].trimPick[0];
        clients[0].clickTrim({ fs: 'unit', unit: marked });
        if (clients[0].trimPick.length !== 0) return 'повторный клик по модели не снимает отметку';
        chip.onClick();
        const confirm = panel.actions.find(a => a.kind === 'primary');
        if (!confirm) return 'нет подтверждения';
        clients[1].refresh();
        if (!/Ожидаем/.test(panel.text) || panel.actions.length) return 'второе место не ждёт переполнение';
        if (FS_RULES.apply(st, 1, { type: 'effect', answer: { system: sys.id } }).ok) return 'второе место отвечает до удаления избытка';
        confirm.onClick();
        if (st.orderTrimPending || FS_RULES.trimQueue(st).any()) return 'очередь избытка не закрыта';
        if (!st.pending || st.pending.seat !== 1) return 'ожидающий вопрос потерялся';
        clients[1].state = FS_RULES.view(st, 1);
        clients[1].refresh();
        if (panel.title === 'Сверх вместимости') return 'после переполнения вопрос не появился';
        if (!FS_RULES.apply(st, 1, { type: 'effect', answer: { system: sys.id } }).ok || st.pending) return 'вопрос после переполнения не разрешён';
        return true;
    } finally {
        FSUI.update = oldUpdate;
    }
});

screen('combat-pending-controls', 'вопрос плана не показывает и не исполняет прерванное распределение урона', () => {
    const st = FS_RULES.newBattleTest({ seed: 5, players: [
        { faction: 'эльдары', name: 'Эльдар', id: 'p0' },
        { faction: 'имперская-гвардия', name: 'Гвардия', id: 'p1' },
    ], units: { 'аспектные-воины': 2 }, foeUnits: { 'гвардейцы': 2 } });
    const apply = (seat, cmd) => {
        const result = FS_RULES.apply(st, seat, cmd);
        if (!result.ok) throw new Error(result.error);
    };
    apply(0, { type: 'combat', action: 'reinforce', count: 1 });
    apply(1, { type: 'combat', action: 'reinforce', count: 0 });
    st.combat.step = 'damage-attacker';
    st.combat.dice.attacker = [];
    st.combat.dice.defender = ['att', 'att'];
    FS_RULES.keepEventScheme(st, 0, ctx.FS_DATA.events.find(card => card.faction === 'эльдары' && card.name === 'Предвидение'));
    FS_RULES.advanceCombatSteps(st);
    if (st.pending?.question?.kind !== 'scheme') return 'не открылось окно «Предвидения»';
    const game = Object.create(FS_GAME.prototype), sent = [];
    const unit = st.units.find(u => u.seat === 0 && u.system === st.combat.system && u.area === st.combat.pos);
    Object.assign(game, {
        state: FS_RULES.view(st, 0),
        view: { highlights: [], selection: [], selectionRings: [], scene: {
            pick: () => ({ hit: true, pickedMesh: { metadata: { fs: 'unit', unit: unit.id, system: unit.system, pos: unit.area } }, pickedPoint: null }),
        } },
        app: { camera: { azimuth: 0 } }, mode: 'idle', pending: null, orderKey: '',
        hand: [], damageTargets: [], effectPick: [], effectDie: null, pendingQuestionRef: null,
        questionMarkersActive: false, reinforceStep: null, status: '', warn: '',
        refreshPlaque: nothing, updateQuestionMarkers: nothing,
        net: { cmd: cmd => { sent.push(cmd); return FS_RULES.apply(st, 0, cmd); } },
    });
    const oldUpdate = FSUI.update;
    let panel = null;
    FSUI.update = (state, next) => { panel = next; };
    try {
        game.refresh();
        if (!panel.battle || !panel.actions.some(a => /Сбросить: Предвидение/.test(a.label))) return 'нет счёта боя или вопроса плана';
        if (panel.actions.some(a => /Разложите урон|Принять урон|Аспектные воины/.test(a.label))) return 'кнопки прерванного урона мешают ответу';
        if (game.mode === 'damage') return 'клик по полю всё ещё выбирает цель урона';
        game.onClick(0, 0);
        if (game.damageTargets.length || sent.some(cmd => cmd.type === 'combat')) return 'клик по модели выполняет прерванный бой';
        const refuse = panel.actions.find(a => /Не сбрасывать план/.test(a.label));
        if (!refuse) return 'нет отказа от плана';
        refuse.onClick();
        if (st.pending) return 'отказ не закрыл вопрос';
        game.state = FS_RULES.view(st, 0);
        // The stand-in DOM has no Babylon mesh builder; the real board clears
        // these rings on the same refresh (covered by the browser check).
        game.questionMarkersActive = false;
        game.refresh();
        if (game.mode !== 'damage' || !panel.actions.some(a => /Разложите урон|Принять урон/.test(a.label))) return 'после отказа урон не возобновился';
        game.onClick(0, 0);
        if (!game.damageTargets.includes(unit.id)) return 'после отказа модель нельзя выбрать';
        return true;
    } finally { FSUI.update = oldUpdate; }
});

screen('tau-critical-token', '«Критический удар»: раненый жетон можно выбрать списком и на доске, кольцо указывает его место', () => {
    const setup = () => {
        let st = FS_RULES.newBattleTest({ seed: 13, players: [
            { faction: 'империя-тау', name: 'Тау', id: 'p0' },
            { faction: 'некроны', name: 'Некроны', id: 'p1' },
        ], units: { 'воины-огня': 2 }, foeUnits: { 'воины': 2 } });
        const apply = (seat, cmd) => {
            const res = FS_RULES.apply(st, seat, cmd);
            if (!res.ok) throw new Error(res.error || 'команда отклонена');
        };
        apply(0, { type: 'combat', action: 'reinforce', count: 0 });
        apply(1, { type: 'combat', action: 'reinforce', count: 1 });
        FS_RULES.keepEventScheme(st, 0, ctx.FS_DATA.events.find(card => card.faction === 'империя-тау' && card.name === 'Критический удар'));
        st.combat.step = 'damage-defender';
        st.combat.dice.attacker = ['att']; st.combat.dice.defender = [];
        const token = 'reinforce-defender-0';
        apply(1, { type: 'combat', action: 'damage', targets: [token] });
        if (st.pending?.question?.kind !== 'scheme') throw new Error('реакция не предложена после ранения');
        st = JSON.parse(JSON.stringify(st));
        apply(0, { type: 'effect', answer: { choice: 0 } });
        if (JSON.stringify(st.pending?.question?.options) !== JSON.stringify([token])) throw new Error('жетон не предложен');
        const sent = [], game = Object.assign(Object.create(FS_GAME.prototype), {
            state: FS_RULES.view(st, 0), effectPick: [], effectDie: null, refresh: nothing,
            view: { unitPositions: new Map(), reinforceAnchors: [{ side: 'defender', index: 0, x: 11, y: 12, z: 13 }] },
            app: {}, net: { cmd: cmd => { sent.push(cmd); return FS_RULES.apply(st, 0, cmd); } },
        });
        return { st, token, sent, game };
    };
    {
        const { st, token, sent, game } = setup();
        const panel = { actions: [], title: '', text: '', status: '' };
        game.panelQuestion(game.state, panel);
        const option = panel.actions.find(a => /Подкрепление/.test(a.label));
        if (!option) return 'нет жетона в списке допустимых целей';
        option.onClick();
        if (sent.length || !game.effectPick.includes(token)) return 'выбор в списке не отмечен';
        const confirm = panel.actions.find(a => a.kind === 'primary');
        if (!confirm) return 'нет подтверждения';
        confirm.onClick();
        if (sent[0]?.answer?.units?.[0] !== token || !st.combat.reinforceDestroyed.defender.includes(0)) return 'список не уничтожил жетон';
    }
    {
        const { st, token, sent, game } = setup();
        const oldShow = FS_VIEW.showSelection, oldHighlight = FS_VIEW.highlight;
        let rings = null;
        try {
            FS_VIEW.showSelection = (app, view, list) => { rings = list; };
            FS_VIEW.highlight = nothing;
            game.updateQuestionMarkers();
        } finally { FS_VIEW.showSelection = oldShow; FS_VIEW.highlight = oldHighlight; }
        if (!rings || !rings.some(p => p.x === 11 && p.y === 12 && p.z === 13)) return 'жетон не отмечен на доске';
        const field = st.combat;
        game.questionClick({ fs: 'token', reinforce: true, reinforceId: token, side: 'attacker', system: field.system, pos: field.pos });
        if (sent.length) return 'поддельная сторона жетона принята';
        game.questionClick({ fs: 'token', reinforce: true, reinforceId: token, side: 'defender', system: field.system, pos: field.pos });
        if (sent[0]?.answer?.units?.[0] !== token || !st.combat.reinforceDestroyed.defender.includes(0)) return 'клик по жетону не уничтожил его';
    }
    return true;
});

screen('chaos-route-tokens', '«все» выбирается целиком: жетон доступен на доске и в панели, раннее подтверждение недоступно', () => {
    for (const chaos of [0, 1]) {
        const foe = 1 - chaos, ownSide = chaos === 0 ? 'attacker' : 'defender', foeSide = foe === 0 ? 'attacker' : 'defender';
        const factions = chaos === 0 ? ['космодесант-хаоса', 'имперская-гвардия'] : ['имперская-гвардия', 'космодесант-хаоса'];
        let st = FS_RULES.newBattleTest({ seed: 25,
            players: factions.map((faction, seat) => ({ faction, name: 'Игрок ' + seat, id: 'p' + seat })),
            units: { [chaos === 0 ? 'культисты' : 'гвардейцы']: 2 },
            foeUnits: { [chaos === 1 ? 'культисты' : 'гвардейцы']: 2 } });
        st.players[foe].assets.reinforcement = 1;
        for (const seat of [0, 1]) {
            const r = FS_RULES.apply(st, seat, { type: 'combat', action: 'reinforce', count: seat === foe ? 1 : 0 });
            if (!r.ok) throw new Error(r.error);
        }
        st.combat.dice[ownSide] = ['morale', 'morale']; st.combat.dice[foeSide] = ['att'];
        const card = ctx.FS_DATA.combat.find(c => c.faction === 'космодесант-хаоса' && c.name === 'Хаос всепобеждающий');
        const route = ctx.FS_EFFECTS.parse(card.general, { kind: 'combat', faction: 'космодесант-хаоса' }).find(s => s.op === 'route');
        FS_RULES.runEffects(st, chaos, [route], { kind: 'combat', ctx: { side: ownSide } });
        st = JSON.parse(JSON.stringify(st));
        const q = st.pending?.question, token = 'reinforce-' + foeSide + '-0';
        if (!q || q.op !== 'route' || !q.options.includes(token) || q.n !== 3) return 'нет вопроса на все две модели и жетон';
        const sent = [], game = Object.assign(Object.create(FS_GAME.prototype), {
            state: FS_RULES.view(st, chaos), effectPick: [], effectDie: null, refresh: nothing,
            view: { unitPositions: new Map(), reinforceAnchors: [{ side: foeSide, index: 0, x: 1, y: 2, z: 3 }] },
            app: {}, net: { cmd: cmd => { sent.push(cmd); const r = FS_RULES.apply(st, chaos, cmd); if (!r.ok) throw new Error(r.error); } },
        });
        const draw = () => { const panel = { actions: [], title: '', text: '', status: '' }; game.panelQuestion(game.state, panel); return panel; };
        let panel = draw();
        if (panel.actions.find(a => a.kind === 'primary')?.enabled !== false) return 'можно подтвердить пустой выбор';
        if (!panel.actions.some(a => /Подкрепление/.test(a.label))) return 'подкрепления нет в списке';
        const field = st.combat;
        game.questionClick({ fs: 'token', reinforce: true, reinforceId: token, side: foeSide, system: field.system, pos: field.pos });
        if (sent.length || !game.effectPick.includes(token)) return 'клик по жетону не отметил его';
        panel = draw();
        if (panel.actions.find(a => a.kind === 'primary')?.enabled !== false) return 'можно подтвердить частичный выбор';
        for (const action of panel.actions.filter(a => a.kind === 'pick' && !/Подкрепление/.test(a.label))) action.onClick();
        panel = draw();
        const confirm = panel.actions.find(a => a.kind === 'primary');
        if (!confirm || confirm.enabled !== true) return 'полный выбор нельзя подтвердить';
        confirm.onClick();
        if (sent.length !== 1 || sent[0].answer.units.length !== 3 || !st.combat.reinforceFlipped[foeSide].includes(0)) return 'полный выбор не применён';
    }
    return true;
});

screen('combat-reroll-count', 'обязательный и «до двух» переброс доступны целиком, в том числе в моделированных старых вопросах', () => {
    for (const guard of [0, 1]) for (const upto of [false, true]) for (const legacy of [false, true])
        for (const available of [1, 3]) for (const amount of (upto ? [0, 1, 2] : [Math.min(2, available)])) {
        if (amount > Math.min(2, available)) continue;
        const foe = 1 - guard, guardSide = guard === 0 ? 'attacker' : 'defender', foeSide = foe === 0 ? 'attacker' : 'defender';
        const factions = guard === 0 ? ['имперская-гвардия', 'некроны'] : ['некроны', 'имперская-гвардия'];
        let st = FS_RULES.newBattleTest({ seed: 29,
            players: factions.map((faction, seat) => ({ faction, name: 'Игрок ' + seat, id: 'p' + seat })),
            units: guard === 0 ? { 'гвардейцы': 1, 'огрины': 1 } : { 'воины': 2 },
            foeUnits: guard === 1 ? { 'гвардейцы': 1, 'огрины': 1 } : { 'воины': 2 } });
        for (const seat of [0, 1]) {
            const res = FS_RULES.apply(st, seat, { type: 'combat', action: 'reinforce', count: 0 });
            if (!res.ok) throw new Error(res.error);
        }
        st.combat.dice[foeSide] = Array(available).fill('att');
        const card = ctx.FS_DATA.combat.find(c => c.faction === (upto ? 'некроны' : 'имперская-гвардия')
            && c.name === (upto ? 'Воля повелителя' : 'Поддержка титана'));
        const step = ctx.FS_EFFECTS.parse(card.general, { kind: 'combat', faction: card.faction }).find(s => s.op === 'rerollDie');
        FS_RULES.runEffects(st, upto ? foe : guard, [step], { kind: 'combat', ctx: { side: upto ? foeSide : guardSide } });
        st = JSON.parse(JSON.stringify(st));
        const limit = Math.min(2, available);
        if (st.pending?.answerSeat !== foe || st.pending.question.n !== limit) return 'нет вопроса на доступное число кубиков правильной стороне';
        if (legacy) {
            // Model inconsistent flags independently of the saved step: the
            // step, not a stale UI hint, determines the legal cardinality.
            st.pending.question.required = upto;
            st.pending.question.any = !upto;
            st.pending.question.multi = !upto;
        }
        const sent = [], game = Object.assign(Object.create(FS_GAME.prototype), {
            state: FS_RULES.view(st, foe), effectPick: [], effectDie: null, refresh: nothing,
            net: { cmd: cmd => { sent.push(cmd); const r = FS_RULES.apply(st, foe, cmd); if (!r.ok) throw new Error(r.error); } },
        });
        const draw = () => { const panel = { actions: [], title: '', text: '', status: '' }; game.panelQuestion(game.state, panel); return panel; };
        let panel = draw(), confirm = panel.actions.find(a => a.kind === 'primary');
        if (!upto && limit === 1) {
            if (confirm) return 'точный выбор единственного кубика не требует отдельного подтверждения';
            const pick = panel.actions.find(a => a.kind === 'pick');
            if (!pick) return 'нет единственного кубика в списке';
            pick.onClick();
        } else {
            if (!confirm || confirm.enabled !== upto) return 'неверная доступность пустого выбора';
            for (let i = 0; i < amount; i++) {
                const options = panel.actions.filter(a => a.kind === 'pick');
                if (!options[i]) return 'нет нужного кубика в списке';
                options[i].onClick();
                if (sent.length) return 'клик по одному кубику преждевременно отправил вопрос';
                panel = draw();
                confirm = panel.actions.find(a => a.kind === 'primary');
                if (!confirm || confirm.enabled !== (upto || i + 1 === limit)) return 'неверная доступность подтверждения';
            }
            confirm.onClick();
        }
        if (sent.length !== 1 || sent[0]?.answer?.dice?.length !== amount) return 'отправлено не выбранное число кубиков';
    }
    return true;
});

screen('chaos-foe-choice', 'противник действительно может согласиться или отказаться, не оплачивая кубик', () => {
    for (const chaos of [0, 1]) for (const accept of [false, true]) {
        const foe = 1 - chaos, side = chaos === 0 ? 'attacker' : 'defender';
        const factions = chaos === 0 ? ['космодесант-хаоса', 'имперская-гвардия'] : ['имперская-гвардия', 'космодесант-хаоса'];
        let st = FS_RULES.newBattleTest({ seed: 23,
            players: factions.map((faction, seat) => ({ faction, name: 'Игрок ' + seat, id: 'p' + seat })),
            units: { [chaos === 0 ? 'хелбруты' : 'гвардейцы']: 2 },
            foeUnits: { [chaos === 1 ? 'хелбруты' : 'гвардейцы']: 2 } });
        for (const seat of [0, 1]) {
            const r = FS_RULES.apply(st, seat, { type: 'combat', action: 'reinforce', count: 0 });
            if (!r.ok) throw new Error(r.error);
        }
        const card = ctx.FS_DATA.combat.find(c => c.faction === 'космодесант-хаоса' && c.name === 'Демоническая гибкость');
        FS_RULES.runEffects(st, chaos, ctx.FS_EFFECTS.parse(card.unit, { kind: 'combat', faction: 'космодесант-хаоса' }),
            { kind: 'combat', ctx: { side } });
        if (st.pending?.question?.op !== 'foeAllow' || st.pending.answerSeat !== foe) return 'нет вопроса противнику';
        st = JSON.parse(JSON.stringify(st));
        const sent = [], game = Object.assign(Object.create(FS_GAME.prototype), {
            state: FS_RULES.view(st, foe), effectPick: [], effectDie: null, refresh: nothing,
            net: { cmd: cmd => { sent.push(cmd); const r = FS_RULES.apply(st, foe, cmd); if (!r.ok) throw new Error(r.error); } },
        });
        const panel = { actions: [], title: '', text: '', status: '' };
        game.panelQuestion(game.state, panel);
        if (panel.actions.some(a => /кубик/i.test(a.label) || a.icon === 'cube.morale')) return 'ответ требует выдуманную плату';
        const choice = panel.actions.find(a => accept ? /^Да/i.test(a.label) : /^Нет/i.test(a.label));
        if (!choice) return 'нет кнопки согласия или отказа';
        choice.onClick();
        if (JSON.stringify(sent[0]?.answer) !== JSON.stringify(accept ? { yes: true } : { no: true })) return 'кнопка отправила неверный ответ';
        if (accept) {
            if (st.pending?.question?.op !== 'destroy' || st.pending.answerSeat !== foe) return 'согласие не предложило свою жертву';
            const id = st.pending.question.options[0];
            const r = FS_RULES.apply(st, foe, { type: 'effect', answer: { units: [id] } });
            if (!r.ok || st.units.some(u => u.id === id)) return 'согласившийся противник не уничтожил выбранный отряд';
            if (st.combat.tokens[side].def !== 0) return 'за согласие неверно выданы жетоны';
        } else if (st.combat.tokens[side].def !== 4 || st.pending) return 'отказ не дал Хаосу четыре жетона';
    }
    return true;
});

screen('chaos-foe-target', 'после согласия противник выбирает жетон; сохранённый вопрос тоже нельзя подтвердить пустым', () => {
    for (const chaos of [0, 1]) for (const op of ['route', 'destroy']) for (const legacy of ['new', 'absent', 'atMost']) {
        const foe = 1 - chaos, side = chaos === 0 ? 'attacker' : 'defender', foeSide = foe === 0 ? 'attacker' : 'defender';
        const factions = chaos === 0 ? ['космодесант-хаоса', 'имперская-гвардия'] : ['имперская-гвардия', 'космодесант-хаоса'];
        let st = FS_RULES.newBattleTest({ seed: 27,
            players: factions.map((faction, seat) => ({ faction, name: 'Игрок ' + seat, id: 'p' + seat })),
            units: { [chaos === 0 ? 'культисты' : 'гвардейцы']: 2 },
            foeUnits: { [chaos === 1 ? 'культисты' : 'гвардейцы']: 2 } });
        st.players[foe].assets.reinforcement = 1;
        for (const seat of [0, 1]) {
            const r = FS_RULES.apply(st, seat, { type: 'combat', action: 'reinforce', count: seat === foe ? 1 : 0 });
            if (!r.ok) throw new Error(r.error);
        }
        const name = op === 'route' ? 'Нечистые намерения' : 'Демоническая гибкость';
        const card = ctx.FS_DATA.combat.find(c => c.faction === 'космодесант-хаоса' && c.name === name);
        FS_RULES.runEffects(st, chaos, ctx.FS_EFFECTS.parse(card.unit, { kind: 'combat', faction: 'космодесант-хаоса' }),
            { kind: 'combat', ctx: { side } });
        if (!FS_RULES.apply(st, foe, { type: 'effect', answer: { yes: true } }).ok) return 'нет согласия';
        if (st.pending?.question?.op !== op || st.pending.answerSeat !== foe) return 'цель не предложена противнику';
        st = JSON.parse(JSON.stringify(st));
        if (legacy === 'absent') delete st.pending.question.strictUnits;
        if (legacy === 'atMost') st.pending.question.strictUnits = 'atMost';
        if (legacy !== 'new') delete st.pending.steps[st.pending.index].strict;
        const token = 'reinforce-' + foeSide + '-0', sent = [];
        const game = Object.assign(Object.create(FS_GAME.prototype), {
            state: FS_RULES.view(st, foe), effectPick: [], effectDie: null, refresh: nothing,
            net: { cmd: cmd => { sent.push(cmd); const r = FS_RULES.apply(st, foe, cmd); if (!r.ok) throw new Error(r.error); } },
        });
        const draw = () => { const panel = { actions: [], title: '', text: '', status: '' }; game.panelQuestion(game.state, panel); return panel; };
        let panel = draw();
        if (panel.actions.find(a => a.kind === 'primary')?.enabled !== false) return 'пустой выбор можно подтвердить';
        const tokenPick = panel.actions.find(a => a.kind === 'pick' && /Подкрепление/.test(a.label));
        if (!tokenPick) return 'жетон отсутствует в списке';
        tokenPick.onClick();
        panel = draw();
        const confirm = panel.actions.find(a => a.kind === 'primary');
        if (!confirm?.enabled) return 'выбранный жетон нельзя подтвердить';
        confirm.onClick();
        if (JSON.stringify(sent[0]?.answer) !== JSON.stringify({ units: [token] })) return 'отправлена не та цель';
        const slots = ctx.CombatTokens.of(st.combat);
        if (op === 'route' ? !slots.flipped(foeSide).includes(0) : slots.alive(foeSide, 0)) return 'выбранный жетон не изменён';
    }
    return true;
});

screen('necron-resurrect-choice', '«Сфера воскрешения»: кнопки согласия и отказа для модели и жетона без платы кубиком', () => {
    for (const necron of [0, 1]) for (const accept of [false, true]) for (const piece of ['model', 'token'])
        for (const lethal of [false, true]) {
        if (piece === 'model' && lethal) continue;
        const factions = necron === 0 ? ['некроны', 'космодесант'] : ['космодесант', 'некроны'];
        let st = FS_RULES.newBattleTest({ seed: 17,
            players: factions.map((faction, seat) => ({ faction, name: 'Игрок ' + seat, id: 'p' + seat })),
            units: { [necron === 0 ? 'воины' : 'скауты']: 3 },
            foeUnits: { [necron === 1 ? 'воины' : 'скауты']: 3 } });
        const apply = (seat, cmd) => {
            const res = FS_RULES.apply(st, seat, cmd);
            if (!res.ok) throw new Error(res.error || 'команда отклонена');
        };
        FS_RULES.keepEventScheme(st, necron, ctx.FS_DATA.events.find(c => c.faction === 'некроны' && c.name === 'Сфера воскрешения'));
        if (piece === 'token') st.players[necron].assets.reinforcement = 1;
        for (const seat of [0, 1]) apply(seat, { type: 'combat', action: 'reinforce',
            count: piece === 'token' && seat === necron ? 1 : 0 });
        const side = necron === 0 ? 'attacker' : 'defender';
        st.combat.step = 'damage-' + side;
        st.combat.dice[side] = []; st.combat.dice[necron === 0 ? 'defender' : 'attacker'] = Array(lethal ? 3 : 1).fill('att');
        const unit = st.units.find(u => u.seat === necron);
        const target = piece === 'token' ? 'reinforce-' + side + '-0' : unit.id;
        const supply = st.players[necron].supply.units['воины'], assets = st.players[necron].assets.reinforcement;
        apply(necron, { type: 'combat', action: 'damage', targets: [target] });
        if (st.pending?.question?.op !== 'resurrectOffer') return 'нет настоящего вопроса плана';
        st = JSON.parse(JSON.stringify(st));
        const sent = [], game = Object.assign(Object.create(FS_GAME.prototype), {
            state: FS_RULES.view(st, necron), effectPick: [], effectDie: null, refresh: nothing,
            net: { cmd: cmd => { sent.push(cmd); apply(necron, cmd); } },
        });
        const panel = { actions: [], title: '', text: '', status: '' };
        game.panelQuestion(game.state, panel);
        if (panel.actions.some(a => /кубик/i.test(a.label) || a.icon === 'cube.morale')) return 'панель требует несуществующую плату кубиком';
        const choice = panel.actions.find(a => accept ? /сбросить план/i.test(a.label) && !/не сбросить/i.test(a.label)
            : /не сбросить план/i.test(a.label));
        if (!choice) return 'нет отдельной кнопки согласия или отказа';
        choice.onClick();
        if (sent.length !== 1 || JSON.stringify(sent[0].answer) !== JSON.stringify(accept ? { yes: true } : { no: true })) return 'отправлен неверный ответ';
        if (st.players[necron].schemes.length !== (accept ? 0 : 1)) return 'план сброшен вопреки решению';
        if (piece === 'model' && st.units.find(u => u.id === unit.id)?.routed !== !accept) return 'отряд не соответствует решению';
        if (piece === 'token') {
            const token = ctx.CombatTokens.of(st.combat);
            if (token.alive(side, 0) !== (accept || !lethal) || token.flipped(side).includes(0) !== (!accept && !lethal))
                return 'жетон не соответствует решению';
            if (st.players[necron].supply.units['воины'] !== supply || st.players[necron].assets.reinforcement !== assets)
                return 'для жетона создана модель или выдан ресурс';
        }
        if (st.pending) return 'бой не продолжился';
    }
    return true;
});

screen('tau-evasion-fallen', '«Уклонение»: уничтоженные модель и подкрепление видны в списке и возвращаются через панель', () => {
    for (const accept of [false, true]) {
        let st = FS_RULES.newBattleTest({ seed: 13, players: [
            { faction: 'империя-тау', name: 'Тау', id: 'p0' },
            { faction: 'некроны', name: 'Некроны', id: 'p1' },
        ], units: { 'воины-огня': 3 }, foeUnits: { 'воины': 3 } });
        const apply = (seat, cmd) => {
            const res = FS_RULES.apply(st, seat, cmd);
            if (!res.ok) throw new Error(res.error || 'команда отклонена');
        };
        apply(0, { type: 'combat', action: 'reinforce', count: 1 });
        apply(1, { type: 'combat', action: 'reinforce', count: 0 });
        ctx.CombatPlans.of(st.combat).addRestoreFallen(0, 0);
        st.combat.step = 'damage-attacker';
        st.combat.dice.attacker = []; st.combat.dice.defender = ['att', 'att'];
        const unit = st.units.find(u => u.seat === 0), token = 'reinforce-attacker-0';
        const supply = st.players[0].supply.units['воины-огня'];
        apply(0, { type: 'combat', action: 'damage', targets: [unit.id, token] });
        if (st.pending?.question?.op !== 'restoreFallenOffer') return 'нет настоящего вопроса после урона';
        st = JSON.parse(JSON.stringify(st));
        const sent = [], game = Object.assign(Object.create(FS_GAME.prototype), {
            state: FS_RULES.view(st, 0), effectPick: [], effectDie: null, refresh: nothing,
            net: { cmd: cmd => { sent.push(cmd); apply(0, cmd); } },
        });
        const render = () => {
            const panel = { actions: [], title: '', text: '', status: '' };
            game.panelQuestion(game.state, panel);
            return panel;
        };
        let panel = render();
        const choices = panel.actions.filter(a => a.kind === 'pick');
        if (choices.length !== 2) return 'уничтоженные модель и жетон не показаны в списке: ' + choices.map(a => a.label).join(', ');
        if (!choices.some(a => /Воин/i.test(a.label) && !/подкреплен/i.test(a.label))) return 'нет названия уничтоженной модели';
        if (!choices.some(a => /подкреплен/i.test(a.label))) return 'нет названия уничтоженного подкрепления';
        if (accept) for (const choice of choices) choice.onClick();
        panel = render();
        if (panel.actions.filter(a => a.kind === 'pick' && a.selected).length !== (accept ? 2 : 0)) return 'выбор не сохранился при перерисовке';
        panel.actions.find(a => a.kind === 'primary').onClick();
        if (sent.length !== 1 || JSON.stringify(sent[0].answer.units) !== JSON.stringify(accept ? [unit.id, token] : [])) return 'панель отправила другой ответ';
        if (st.pending) return 'ответ не продолжил бой';
        if (st.players[0].supply.units['воины-огня'] !== supply + (accept ? 0 : 1)) return 'запас модели после ответа неверен';
        if (ctx.CombatTokens.of(st.combat).units('attacker').alive !== (accept ? 1 : 0)) return 'жетон не вернулся или вернулся при отказе';
    }
    return true;
});

screen('tau-reinforce-ban', 'запрещённая сторона видит причину и автоматически проходит свой шаг без жетонов', () => {
    for (const side of ['attacker', 'defender']) {
        const st = FS_RULES.newBattleTest({ seed: 19, players: [
            { faction: 'империя-тау', name: 'Тау', id: 'p0' },
            { faction: 'некроны', name: 'Некроны', id: 'p1' },
        ], units: { 'воины-огня': 2 }, foeUnits: { 'воины': 2 } });
        const seat = side === 'attacker' ? 0 : 1;
        st.combat.step = 'reinforce-' + side;
        ctx.CombatBans.of(st.combat).forbidReinforce(seat, 'preparation');
        const sent = [], timers = [];
        const game = Object.assign(Object.create(FS_GAME.prototype), { state: FS_RULES.view(st, seat),
            mode: 'idle', hand: [], reinforcePick: 0, autoReinforced: null,
            net: { cmd: cmd => { sent.push(cmd); return FS_RULES.apply(st, seat, cmd); } } });
        const oldTimer = ctx.setTimeout;
        try {
            ctx.setTimeout = fn => { timers.push(fn); };
            const panel = { actions: [], status: '' };
            game.panelCombat(game.state, panel);
            game.panelCombat(game.state, { actions: [], status: '' });
            if (!/запрещ/i.test(panel.text)) return 'нет понятной причины запрета';
            if (panel.counter || panel.actions.some(a => /Начать бой/.test(a.label))) return 'запрещённой стороне предлагаются жетоны';
            if (timers.length !== 1) return 'автопропуск послан несколько раз';
            timers[0]();
            if (sent.length !== 1 || sent[0].count !== 0) return 'автопропуск не отправил ноль';
            if (st.players[seat].assets.reinforcement !== 2) return 'автопропуск потратил жетоны';
        } finally { ctx.setTimeout = oldTimer; }
    }
    return true;
});

screen('tau-montka-preview', "«Монт'ка»: экран требует первую цель и показывает потерянный избыток без лишних целей", () => {
    const st = FS_RULES.newBattleTest({ seed: 17, players: [
        { faction: 'империя-тау', name: 'Тау', id: 'p0' },
        { faction: 'некроны', name: 'Некроны', id: 'p1' },
    ], units: { 'воины-огня': 2 }, foeUnits: { 'воины': 2 } });
    for (const seat of [0, 1]) {
        const res = FS_RULES.apply(st, seat, { type: 'combat', action: 'reinforce', count: 0 });
        if (!res.ok) throw new Error(res.error);
    }
    const c = st.combat, [first, other] = st.units.filter(u => u.seat === 1);
    c.step = 'damage-defender'; c.dice.attacker = Array(6).fill('att'); c.dice.defender = [];
    const rules = ctx.CombatDamage.of(c);
    rules.addFirst('defender', first.id, c.round);
    rules.setExcess('defender', first.id, c.round);
    const sent = [];
    const game = Object.assign(Object.create(FS_GAME.prototype), { state: FS_RULES.view(st, 1),
        damageTargets: [other.id], mode: 'idle', hand: [], refresh: nothing,
        net: { cmd: cmd => { sent.push(cmd); return FS_RULES.apply(st, 1, cmd); } } });
    const render = () => { const panel = { actions: [], status: '' }; game.panelCombat(game.state, panel); return panel; };
    let panel = render();
    if (!/перв/i.test(panel.status)) return 'не объяснено, какую цель выбрать первой';
    if (panel.actions.find(a => a.kind === 'primary')?.enabled !== false) return 'можно подтвердить без обязательной цели';
    game.damageTargets.push(first.id);
    panel = render();
    const firstRow = panel.battle.damage.rows.find(row => row.id === first.id);
    const otherRow = panel.battle.damage.rows.find(row => row.id === other.id);
    if (!firstRow?.destroyed || otherRow?.take || otherRow?.destroyed) return 'предпросмотр обещает урон не той цели или двум целям';
    if (panel.battle.damage.left !== 0 || panel.battle.damage.discarded !== 3) return 'избыток не показан потерянным';
    if (!/потер/i.test(panel.status)) return 'потерянный избыток не объяснён';
    const confirm = panel.actions.find(a => a.kind === 'primary');
    if (!confirm?.enabled) return 'нельзя подтвердить после выбора обязательной цели';
    confirm.onClick();
    if (sent.length !== 1 || st.units.some(u => u.id === first.id) || !st.units.some(u => u.id === other.id))
        return 'фактический результат расходится с экраном';
    return true;
});

screen('tau-philosophy-multi', '«Философия войны»: на экране выбираются две пары или ни одной, затем каждая заменяется', () => {
    const players = [
        { faction: 'империя-тау', name: 'Тау', id: 'p0' },
        { faction: 'имперская-гвардия', name: 'Гвардия', id: 'p1' },
    ];
    const setup = () => {
        const st = FS_RULES.newReadyGame({ seed: 5, players });
        st.units = []; st.structures = []; st.storms = [];
        const sys = st.systems[0], pos = sys.areas.find(a => a.world).pos;
        FS_RULES.addUnit(st, 0, 'воины-огня', sys.id, pos);
        FS_RULES.addUnit(st, 1, 'гвардейцы', sys.id, pos);
        st.phase = 'operations'; st.turn = 0;
        st.order = { seat: 0, order: 'advance', system: sys.id, phase: 'combat' };
        const names = ['Стелс-команды', 'Команды следопытов', 'Тактическое отступление', 'Охотничьи стаи круутов', 'Перекрестный огонь'];
        st.players[0].decks.combat = names.flatMap(name => [name, name]);
        st.players[0].decks.upgradeCombat = ["Монт'ка", 'Кауйон'];
        FS_RULES.keepEventScheme(st, 0, ctx.FS_DATA.events.find(c => c.faction === 'империя-тау' && c.name === 'Философия войны'));
        FS_RULES.startCombat(st, 0, 1, sys.id, pos);
        const yes = FS_RULES.apply(st, 0, { type: 'effect', answer: { choice: 0 } });
        if (!yes.ok || st.pending?.question?.op !== 'swapCombatCards') throw new Error('нет выбора пар');
        return st;
    };
    for (const empty of [false, true]) {
        let st = setup(), sent = [];
        const game = Object.assign(Object.create(FS_GAME.prototype), { effectPick: [], effectDie: null, refresh: nothing,
            net: { cmd: cmd => { sent.push(cmd); const r = FS_RULES.apply(st, 0, cmd); if (!r.ok) throw new Error(r.error); } } });
        const render = () => {
            game.state = FS_RULES.view(st, 0);
            const panel = { actions: [], title: '', text: '', status: '', mode: 'idle' };
            game.panelQuestion(game.state, panel); FSUI.update(game.state, panel);
            return panel;
        };
        let panel = render();
        if (!empty) {
            for (const name of ['Стелс-команды', 'Команды следопытов']) {
                const button = nodesWithClass(FSUI.modernRoot, 'fs-card-choice').find(n => textsOf(n).includes(name));
                if (!button) return 'нет карточки «' + name + '»';
                button.click();
                if (sent.length) return 'первый клик отправил ответ вместо множественного выбора';
                panel = render();
                const selected = nodesWithClass(FSUI.modernRoot, 'fs-card-choice').find(n => textsOf(n).includes(name));
                if (selected.getAttribute('aria-pressed') !== 'true') return 'выбор пары не отмечен';
            }
        }
        const count = empty ? 0 : 2;
        const apply = nodesWithClass(FSUI.modernRoot, 'fs-primary').find(n => textsOf(n).some(t => t.includes('(' + count + '/')));
        if (!apply) return 'нет кнопки подтверждения ' + count + ' пар';
        apply.click();
        if (JSON.stringify(sent[0]?.answer?.cards) !== JSON.stringify(empty ? [] : ['Стелс-команды', 'Команды следопытов']))
            return 'кнопка отправила неверный список пар';
        if (empty) {
            if (st.pending || st.combat.cards.attacker.hand.length !== 5) return 'пустой выбор не продолжил раздачу';
            continue;
        }
        st = JSON.parse(JSON.stringify(st));
        for (const name of ["Монт'ка", 'Кауйон']) {
            panel = render();
            const button = nodesWithClass(FSUI.modernRoot, 'fs-card-choice').find(n => textsOf(n).includes(name));
            if (!button) return 'нет замены «' + name + '»';
            button.click();
        }
        const all = st.players[0].decks.combat.concat(st.combat.cards.attacker.hand);
        if (st.pending || all.filter(n => n === "Монт'ка" || n === 'Кауйон').length !== 4) return 'две замены не завершены';
    }
    return true;
});

screen('combat-immediate-retreat', 'после победы без подготовки защитник видит выбор отступления и может его подтвердить', () => {
    let st = party('immediate-retreat');
    st.units = []; st.structures = []; st.objectives = []; st.storms = [];
    for (const s of st.systems) s.tokens = [];
    st.phase = 'operations'; st.turn = 0;
    let pair = null;
    for (const sys of st.systems) for (const area of sys.areas.filter(a => a.world)) {
        const target = FS_RULES.areasAround(st, sys.id, area.pos).find(a => {
            const other = FS_RULES.area(FS_RULES.system(st, a.system), a.pos);
            return other && other.world;
        });
        if (target && !pair) pair = { sys, pos: area.pos, target };
    }
    if (!pair) return 'для проверки нужны два соседних мира';
    const { sys, pos, target } = pair;
    FS_RULES.addUnit(st, 0, 'гвардейцы', sys.id, pos);
    const defender = FS_RULES.addUnit(st, 1, 'воины', sys.id, pos);
    defender.routed = true;
    FS_RULES.addUnit(st, 1, 'воины', target.system, target.pos);
    FS_RULES.addStructure(st, 1, 'factory', sys.id, pos);
    st.systems[1].tokens.push({ seat: 1, order: 'deploy', faceUp: false });
    st.order = { seat: 0, order: 'advance', system: sys.id, phase: 'move', moveStep: 'ground', moved: [], steps: [] };
    const started = FS_RULES.apply(st, 0, { type: 'endAdvance' });
    if (!started.ok || !st.combat || st.combat.step !== 'retreat') return 'отступление не началось';
    st = JSON.parse(JSON.stringify(st));
    const clients = [0, 1].map(seat => {
        const game = Object.create(FS_GAME.prototype);
        Object.assign(game, { state: FS_RULES.view(st, seat), hand: [], mode: 'idle',
            net: { cmd: cmd => FS_RULES.apply(st, seat, cmd) } });
        return game;
    });
    const waiting = { actions: [] };
    clients[0].panelCombat(clients[0].state, waiting);
    if (!/Проигравший отступает/.test(waiting.text) || waiting.actions.length) return 'победитель не ожидает защитника';
    const retreat = { actions: [] };
    clients[1].panelCombat(clients[1].state, retreat);
    const pick = retreat.actions.find(a => a.kind === 'pick' && a.label.endsWith(' · ' + target.pos));
    if (!pick || clients[1].mode !== 'retreat') return 'защитнику не предложен дружественный мир';
    pick.onClick();
    const unit = st.units.find(u => u.id === defender.id);
    if (!unit || unit.system !== target.system || unit.area !== target.pos || !unit.routed) return 'кнопка не отвела отряд';
    if (st.combat || st.order || st.turn !== 1) return 'бой или приказ не закончился после отступления';
    return true;
});

screen('mech-blessing-ui', '«Благословение»: подтверждение события обновляет запасы и кузницы на панели', () => {
    const players = [
        { faction: 'адептус-механикус', name: 'Мех', id: 'p0' },
        { faction: 'имперская-гвардия', name: 'Гвардия', id: 'p1' },
    ];
    let st = FS_RULES.newReadyGame({ seed: 5, players });
    st.phase = 'refresh';
    st.eventsLeft = 2;
    st.players[0].materiel = 3;
    Object.assign(st.players[0].assets, { forge: 0, cache: 1, reinforcement: 0 });
    const name = 'Благословение Бога-Машины';
    st.event = { seat: 0, drawn: [name], chosen: name, stormMoved: true,
        card: ctx.FS_DATA.events.find(e => e.faction === 'адептус-механикус' && e.name === name) };
    st = JSON.parse(JSON.stringify(st));
    const game = Object.create(FS_GAME.prototype);
    Object.assign(game, { state: FS_RULES.view(st, 0), pending: null, status: '', mode: 'idle', refresh: nothing,
        net: { cmd: cmd => {
            const result = FS_RULES.apply(st, 0, cmd);
            if (!result.ok) throw new Error(result.error);
        } } });
    const panel = { actions: [], title: '', text: '', status: '', mode: 'idle' };
    game.panelRefresh(game.state, panel);
    FSUI.update(game.state, panel);
    const play = nodesWithClass(FSUI.modernRoot, 'fs-primary').find(b => textsOf(b).includes('Разыграть событие'));
    if (!play) return 'нет кнопки разыгрывания';
    play.click();
    const confirm = nodesWithClass(FSUI.modernRoot, 'fs-event-modal-confirm')[0];
    if (!confirm || !textsOf(FSUI.eventOverlay).includes(name)) return 'нет подтверждения с нужной картой';
    confirm.click();
    if (st.pending || st.players[0].materiel !== 3) return 'событие не завершено или изменило материю';
    FSUI.update(FS_RULES.view(st, 0), SCREEN_CTX);
    const chips = nodesWithClass(FSUI.modernRoot, 'fs-asset-chip');
    const own = chips.slice(0, 3);
    for (const [title, count] of [['Кузницы', '1'], ['Запасы', '2'], ['Подкрепления', '0']]) {
        const chip = own.find(c => c.title === title);
        if (!chip || !textsOf(chip).includes(count)) return title + ' не показывает ' + count;
    }
    return true;
});

screen('infiltrator-choices-ui', 'кнопки разведки скитариев различают кубики и жетоны и применяют выбранное', () => {
    const players = [
        { faction: 'адептус-механикус', name: 'Мех', id: 'p0' },
        { faction: 'имперская-гвардия', name: 'Гвардия', id: 'p1' },
    ];
    let st = FS_RULES.newBattleTest({ seed: 5, players,
        units: { 'скитарии': 2 }, foeUnits: { 'гвардейцы': 2 } });
    st.combat.cards.attacker.hand = ['Скитарии-инфильтраторы'];
    st.combat.cards.defender.hand = ['Ложись!'];
    st.combat.dice.attacker = [];
    const apply = (seat, cmd) => {
        const res = FS_RULES.apply(st, seat, cmd);
        if (!res.ok) throw new Error('команда экрана отклонена: ' + res.error);
    };
    apply(0, { type: 'combat', action: 'reinforce', count: 0 });
    apply(1, { type: 'combat', action: 'reinforce', count: 0 });
    apply(0, { type: 'combat', action: 'playCard', index: 0 });
    apply(1, { type: 'combat', action: 'playCard', index: 0 });
    apply(0, { type: 'effect', answer: {} }); // look at the opponent's card
    st = JSON.parse(JSON.stringify(st));
    const game = Object.create(FS_GAME.prototype);
    Object.assign(game, { effectPick: [], effectDie: null, refresh: nothing,
        net: { cmd: cmd => apply(0, cmd) } });
    const render = () => {
        game.state = FS_RULES.view(st, 0);
        const panel = { actions: [], title: '', text: '', status: '', mode: 'idle' };
        game.panelQuestion(game.state, panel);
        FSUI.update(game.state, panel);
        return panel;
    };
    const pick = label => {
        const button = nodesWithClass(FSUI.modernRoot, 'fs-pick').find(n => textsOf(n).includes(label));
        if (!button) throw new Error('нет кнопки «' + label + '»');
        button.click();
    };
    let panel = render();
    if (JSON.stringify(panel.actions.map(a => a.label)) !== JSON.stringify(['1 кубик обороны', '1 кубик атаки'])) {
        return 'основной выбор не различает кубики: ' + JSON.stringify(panel.actions.map(a => a.label));
    }
    pick('1 кубик атаки');
    if (st.combat.dice.attacker.filter(x => x === 'att').length !== 1) return 'кнопка не добавила кубик атаки';
    if (st.pending && st.pending.question.kind === 'ability') apply(0, { type: 'effect', answer: {} });
    st = JSON.parse(JSON.stringify(st));
    panel = render();
    if (JSON.stringify(panel.actions.map(a => a.label)) !== JSON.stringify(['1 кубик морали', '2 жетона атаки', '2 жетона обороны'])) {
        return 'выбор отряда не различает кубик и жетоны: ' + JSON.stringify(panel.actions.map(a => a.label));
    }
    pick('2 жетона обороны');
    if (st.combat.tokens.attacker.def !== 2) return 'кнопка не добавила два жетона обороны';
    return true;
});

screen('mechanicus-mixed-choices-ui', 'выбор восстановления, жетона и броска кубика виден разными кнопками', () => {
    const players = [
        { faction: 'адептус-механикус', name: 'Мех', id: 'p0' },
        { faction: 'имперская-гвардия', name: 'Гвардия', id: 'p1' },
    ];
    for (const scenario of [
        { card: 'Техножрецы', expected: ['Восстановите 1 деморализованный отряд', '1 жетон обороны', '1 жетон атаки'],
            choice: '1 жетон обороны', tokens: ['def', 1] },
        { card: 'Превосходство машин', expected: ['1 кубик с броском', '2 жетона атаки'],
            choice: '2 жетона атаки', tokens: ['att', 2] },
    ]) {
        let st = FS_RULES.newBattleTest({ seed: 5, players,
            units: { 'скитарии': 2, 'онагры': 1 }, foeUnits: { 'гвардейцы': 2 } });
        st.combat.cards.attacker.hand = [scenario.card];
        st.combat.cards.defender.hand = ['Ложись!'];
        st.combat.dice.attacker = [];
        st.units.find(u => u.seat === 0 && u.unit === 'скитарии').routed = true;
        const apply = (seat, cmd) => {
            const res = FS_RULES.apply(st, seat, cmd);
            if (!res.ok) throw new Error(scenario.card + ': команда отклонена: ' + res.error);
        };
        apply(0, { type: 'combat', action: 'reinforce', count: 0 });
        apply(1, { type: 'combat', action: 'reinforce', count: 0 });
        apply(0, { type: 'combat', action: 'playCard', index: 0 });
        apply(1, { type: 'combat', action: 'playCard', index: 0 });
        if (st.pending && st.pending.question.kind === 'ability') apply(0, { type: 'effect', answer: {} });
        st = JSON.parse(JSON.stringify(st));
        const game = Object.create(FS_GAME.prototype);
        Object.assign(game, { effectPick: [], effectDie: null, refresh: nothing,
            net: { cmd: cmd => apply(0, cmd) }, state: FS_RULES.view(st, 0) });
        const panel = { actions: [], title: '', text: '', status: '', mode: 'idle' };
        game.panelQuestion(game.state, panel);
        FSUI.update(game.state, panel);
        const labels = panel.actions.map(a => a.label);
        if (JSON.stringify(labels) !== JSON.stringify(scenario.expected)) return scenario.card + ': ' + JSON.stringify(labels);
        const button = nodesWithClass(FSUI.modernRoot, 'fs-pick').find(n => textsOf(n).includes(scenario.choice));
        if (!button) return scenario.card + ': нет кнопки «' + scenario.choice + '»';
        button.click();
        if (st.combat.tokens.attacker[scenario.tokens[0]] !== scenario.tokens[1]) return scenario.card + ': выбранный жетон не получен';
    }
    return true;
});

screen('strike-pay-ui', 'реальные улучшения одного удара проходят через кнопки панели и JSON', () => {
    const players = [
        { faction: 'тираниды', name: 'Рой', id: 'p0' },
        { faction: 'имперская-гвардия', name: 'Защитник', id: 'p1' },
    ];
    let st = FS_RULES.newReadyGame({ seed: 5, players });
    st.units = []; st.structures = []; st.objectives = []; st.storms = [];
    for (const s of st.systems) s.tokens = [];
    st.phase = 'operations'; st.turn = 0; st.order = null;
    const sys = st.systems[0], space = sys.areas.find(a => !a.world);
    const world = FS_RULES.areasAround(st, sys.id, space.pos)
        .map(a => FS_RULES.area(FS_RULES.system(st, a.system), a.pos)).find(a => a && a.world);
    if (!space || !world) return 'для проверки нужны пустота и соседний мир';
    FS_RULES.addUnit(st, 0, 'корабли-ульи', sys.id, space.pos);
    FS_RULES.addUnit(st, 0, 'корабли-ульи', sys.id, space.pos);
    FS_RULES.addStructure(st, 1, 'factory', sys.id, world.pos);
    st.players[0].materiel = 14;
    st.players[0].assets.reinforcement = 0;
    st.players[0].upgrades = ['Мицетические споры', 'Камери размножения', 'Разведка генокрадов']
        .map(name => ({ name, used: false }));
    sys.tokens.push({ seat: 0, order: 'advance', faceUp: false });
    st.systems[1].tokens.push({ seat: 1, order: 'deploy', faceUp: false });
    const roll = FS_RULES.rollDice;
    FS_RULES.rollDice = (state, n) => Array(n).fill('att');
    try {
        const apply = cmd => {
            const res = FS_RULES.apply(st, 0, cmd);
            if (!res.ok) throw new Error('команда экрана отклонена: ' + res.error);
        };
        apply({ type: 'resolveOrder', system: sys.id });
        st.order.phase = 'strike';
        apply({ type: 'useUpgrade', card: 'Мицетические споры' });
        apply({ type: 'useUpgrade', card: 'Разведка генокрадов' });
        apply({ type: 'orbitalStrike', system: sys.id, pos: world.pos });
        const game = Object.create(FS_GAME.prototype);
        Object.assign(game, { effectPick: [], effectDie: null, refresh: nothing, net: { cmd: apply } });
        const render = () => {
            game.state = FS_RULES.view(st, 0);
            const panel = { actions: [], title: '', text: '', status: '', mode: 'idle' };
            game.panelQuestion(game.state, panel);
            FSUI.update(game.state, panel);
            return panel;
        };
        const button = label => {
            let found = null;
            (function visit(n) {
                if (found || !n) return;
                if (n.tagName === 'BUTTON' && textsOf(n).includes(label)) { found = n; return; }
                for (const child of n.children || []) visit(child);
            })(FSUI.modernRoot);
            if (!found) throw new Error('на панели нет кнопки «' + label + '»');
            found.click();
        };
        render();
        button('2 кубика');
        if (!st.pending || st.pending.question.kind !== 'types') return 'первая плата не открыла покупку';
        st = JSON.parse(JSON.stringify(st));
        render(); button('Гаунты');
        if (!st.pending || st.pending.question.kind !== 'areas') return 'выбор модели не открыл мир';
        st = JSON.parse(JSON.stringify(st));
        const panel = render();
        const destination = panel.actions.find(a => a.kind === 'pick');
        if (!destination) return 'панель не предлагает мир удара';
        button(destination.label);
        if (!st.pending || st.pending.question.op !== 'strikePayPick' || st.pending.question.index !== 1) {
            return 'после покупки не показана вторая плата';
        }
        if (st.order.strikePlanned.pool.length !== 5) return 'кубики первой платы не убраны из общего пула';
        st = JSON.parse(JSON.stringify(st));
        render(); button('2 кубика');
        if (st.pending || st.players[0].assets.reinforcement !== 2 || st.players[0].materiel !== 10) {
            return 'плата или награды после второго выбора неверны';
        }
        if (st.units.filter(u => u.seat === 0 && u.system === sys.id && u.area === world.pos).length !== 2) {
            return 'на мире удара нет двух купленных отрядов';
        }
        return true;
    } finally {
        FS_RULES.rollDice = roll;
    }
});

screen('strike-structure-ui', 'защитник выбирает бастион как цель эффекта; атакующий и поддельный ответ отклоняются', () => {
    const players = [
        { faction: 'космодесант-хаоса', name: 'Хаос', id: 'p0' },
        { faction: 'имперская-гвардия', name: 'Гвардия', id: 'p1' },
    ];
    let st = FS_RULES.newReadyGame({ seed: 5, players });
    st.units = []; st.structures = []; st.objectives = []; st.storms = [];
    for (const s of st.systems) s.tokens = [];
    st.phase = 'operations'; st.turn = 0; st.order = null;
    const sys = st.systems[0], space = sys.areas.find(a => !a.world);
    const world = space && FS_RULES.areasAround(st, sys.id, space.pos)
        .filter(a => a.system === sys.id).map(a => FS_RULES.area(sys, a.pos)).find(a => a && a.world);
    if (!space || !world) return 'для проверки нужны пустота и соседний мир';
    FS_RULES.addUnit(st, 0, 'эсминцы-класса-иконоборец', sys.id, space.pos);
    const victim = FS_RULES.addUnit(st, 1, 'гвардейцы', sys.id, world.pos);
    const bastion = FS_RULES.addStructure(st, 1, 'bastion', sys.id, world.pos);
    st.players[0].upgrades = [{ name: 'Полное разрушение', used: false }];
    sys.tokens.push({ seat: 0, order: 'advance', faceUp: false });
    st.systems[1].tokens.push({ seat: 1, order: 'deploy', faceUp: false });
    const roll = FS_RULES.rollDice;
    FS_RULES.rollDice = (state, n) => Array(n).fill('def');
    try {
        const apply = (seat, cmd) => {
            const res = FS_RULES.apply(st, seat, cmd);
            if (!res.ok) throw new Error('команда экрана отклонена: ' + res.error);
        };
        apply(0, { type: 'resolveOrder', system: sys.id });
        st.order.phase = 'strike';
        apply(0, { type: 'useUpgrade', card: 'Полное разрушение' });
        apply(0, { type: 'orbitalStrike', system: sys.id, pos: world.pos });
        apply(0, { type: 'effect', answer: { choice: 1 } });
        if (!st.pending || st.pending.question.op !== 'strikeDestroyOne') return 'не задан вопрос защитнику';
        if (FS_RULES.apply(st, 0, { type: 'effect', answer: { units: [bastion.id] } }).ok) return 'атакующий отвечает за защитника';
        if (FS_RULES.apply(st, 1, { type: 'effect', answer: { units: ['чужая-цель'] } }).ok) return 'поддельная цель принята';
        st = JSON.parse(JSON.stringify(st));
        const game = seat => Object.assign(Object.create(FS_GAME.prototype), {
            state: FS_RULES.view(st, seat), effectPick: [], effectDie: null, refresh: nothing,
            net: { cmd: cmd => apply(seat, cmd) },
        });
        const attacker = game(0), defender = game(1);
        const wait = { actions: [] };
        attacker.panelQuestion(attacker.state, wait);
        if (wait.actions.length || !/Ждём/.test(wait.status)) return 'атакующий не видит ожидание';
        const render = () => {
            defender.state = FS_RULES.view(st, 1);
            const panel = { actions: [], title: '', text: '', status: '', mode: 'idle' };
            defender.panelQuestion(defender.state, panel);
            FSUI.update(defender.state, panel);
            return panel;
        };
        const button = label => {
            let found = null;
            (function visit(n) {
                if (found || !n) return;
                if (n.tagName === 'BUTTON' && textsOf(n).includes(label)) { found = n; return; }
                for (const child of n.children || []) visit(child);
            })(FSUI.modernRoot);
            if (!found) throw new Error('на панели нет кнопки «' + label + '»');
            found.click();
        };
        const panel = render();
        const pick = panel.actions.find(a => a.label === FS_RULES.structureName('bastion'));
        if (!pick || !panel.actions.some(a => /Гвардейцы/i.test(a.label))) return 'панель не показывает обе допустимые цели';
        button(pick.label);
        render(); button('Применить (1/1)');
        if (st.structures.some(s => s.id === bastion.id)) return 'бастион не уничтожен';
        if (!st.units.some(u => u.id === victim.id)) return 'вместо бастиона уничтожен отряд';
        return true;
    } finally {
        FS_RULES.rollDice = roll;
    }
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

// Run the real board update and picking against Babylon's NullEngine. Only
// texture painting is replaced: the tile, planet and slot meshes stay real.
function setupUndoScene(check) {
    return chipScene({}, ({ B, scene, view }) => {
        const app = view.app;
        Object.assign(app.location, { width: 800, height: 600, terrain: { heightAt: () => 0 } });
        const originalTexture = B.DynamicTexture;
        const saved = { drawTile: FS_VIEW.drawTile, planetMaterial: FS_VIEW.planetMaterial, drawCombat: FS_VIEW.drawCombat };
        try {
            B.DynamicTexture = class extends B.Texture {
                constructor(name, size, scene) { super(null, scene); this.name = name; }
                getContext() { return {}; }
                update() {}
            };
            FS_VIEW.drawTile = (v, sys, rec) => { rec.lastFace = sys.tile; rec.lastRotation = sys.rotation; };
            FS_VIEW.planetMaterial = (v, name) => {
                if (!v.planetMaterials.has(name)) {
                    const mat = part => new B.StandardMaterial('test-world:' + name + ':' + part, scene);
                    v.planetMaterials.set(name, { surface: mat('surface'), clouds: mat('clouds'), rim: mat('rim'), glow: mat('glow') });
                }
                return v.planetMaterials.get(name);
            };
            FS_VIEW.drawCombat = nothing;
            const display = (state, seat) => FS_VIEW.update(app, view, FS_RULES.view(state, seat));
            const hit = cell => {
                const pos = FS_VIEW.tilePos(app, cell, view.metrics);
                const ray = new B.Ray(new B.Vector3(pos.x, 500, pos.y), new B.Vector3(0, -1, 0));
                for (const mesh of scene.meshes) mesh.computeWorldMatrix(true);
                const pick = scene.pickWithRay(ray, mesh => mesh.isPickable && mesh.isEnabled());
                return pick && pick.pickedMesh && pick.pickedMesh.metadata;
            };
            const checkWorlds = sys => {
                for (const area of sys.areas) {
                    const key = sys.id + ':' + area.pos, planet = view.planets.get(key);
                    if (!area.world) {
                        if (planet && planet.mesh.isEnabled()) return key + ': лишняя планета в пустоте';
                        continue;
                    }
                    if (!planet || !planet.mesh.isEnabled()) return key + ': нет планеты';
                    if (planet.mesh.metadata.world !== area.world.name || planet.mesh.material.name !== 'test-world:' + area.world.name + ':surface') return key + ': осталась поверхность прежнего мира';
                    const pos = FS_VIEW.discAt(app, sys, area.pos, view.metrics);
                    if (Math.abs(planet.mesh.position.x - pos.x) > .01 || Math.abs(planet.mesh.position.z - pos.z) > .01) return key + ': планета не на своей клетке';
                }
                return null;
            };
            return check({ scene, view, display, hit, checkWorlds });
        } finally {
            B.DynamicTexture = originalTexture;
            Object.assign(FS_VIEW, saved);
        }
    });
}

head('Отмена при сборке карты');

screen('setup-undo-1', 'отменённый тайл не перекрывает клетку, другую сторону можно поставить снова', () => {
    return setupUndoScene(({ scene, view, display, hit, checkWorlds }) => {
        const live = FS_RULES.newGame({ seed: 42, players: SEAT_PLAYERS, interactiveSetup: true });
        const seat = live.setup.turn, cell = FS_RULES.setupLegalCells(live)[0];
        const [a, b] = FS_RULES.tileFaces(live.setup.hands[seat][0]);
        const before = JSON.parse(JSON.stringify(live));
        display(live, seat);
        if (!hit(cell) || hit(cell).fs !== 'setupCell') return 'первую клетку нельзя выбрать';
        const first = FS_RULES.apply(live, seat, { type: 'placeSystemTile', tile: a.id, row: cell.row, col: cell.col });
        if (!first.ok) return 'тайл не поставлен: ' + first.error;
        display(live, seat);
        const old = view.tiles.get('sys1'), worlds = [...view.planets.values()];
        if (!old || !worlds.length) return 'исходный тайл или его миры не нарисованы';
        display(before, seat);
        const picked = hit(cell);
        if (!picked || picked.fs !== 'setupCell') return 'после отмены клетку закрывает прежний тайл: ' + JSON.stringify(picked);
        if (view.tiles.has('sys1') || [old.base, old.top, ...old.decorations].some(mesh => !mesh.isDisposed())) return 'снятый тайл остался в сцене';
        if (worlds.some(planet => [planet.mesh, planet.clouds, planet.atmosphere, planet.rim].some(mesh => !mesh.isDisposed()))) return 'миры снятого тайла остались в сцене';
        if (scene.materials.includes(old.mat) || scene.textures.includes(old.tex)) return 'материал или текстура снятого тайла остались в сцене';
        const second = FS_RULES.apply(before, seat, { type: 'placeSystemTile', tile: b.id, rotation: 1, row: cell.row, col: cell.col });
        if (!second.ok) return 'после отмены нельзя поставить другую сторону: ' + second.error;
        display(before, seat);
        const current = view.tiles.get('sys1');
        if (!current || current === old || current.lastFace !== b.id || current.lastRotation !== 1) return 'повторно поставлена прежняя сторона или потерян поворот';
        return checkWorlds(before.systems[0]) || true;
    });
});

screen('setup-undo-2', 'после отката тот же id системы может обозначать другую клетку и сторону', () => {
    return setupUndoScene(({ view, display, hit, checkWorlds }) => {
        const live = FS_RULES.newGame({ seed: 42, players: SEAT_PLAYERS, interactiveSetup: true });
        const firstSeat = live.setup.turn;
        const first = FS_RULES.apply(live, firstSeat, { type: 'placeSystemTile', tile: live.setup.hands[firstSeat][0], row: 0, col: 0 });
        if (!first.ok) return 'первый тайл не поставлен: ' + first.error;
        const finish = FS_RULES.apply(live, firstSeat, { type: 'finishSetupForces' });
        if (!finish.ok) return 'этап сил не завершился: ' + finish.error;
        if (live.setup.stage === 'objectives') {
            const option = FS_RULES.setupObjectiveOptions(live)[0];
            if (!option) return 'нет жетона цели';
            const objective = FS_RULES.apply(live, firstSeat, { type: 'setupObjective', faction: option.faction, pos: option.areas[0] });
            if (!objective.ok) return 'цель не поставлена: ' + objective.error;
        }
        if (live.setup.stage !== 'tile' || live.setup.turn === firstSeat) return 'очередь не перешла второму игроку';
        const seat = live.setup.turn, cells = FS_RULES.setupLegalCells(live), [a, b] = FS_RULES.tileFaces(live.setup.hands[seat][0]);
        if (cells.length < 2) return 'нечего проверить: нет второй клетки';
        const before = JSON.parse(JSON.stringify(live));
        const placed = FS_RULES.apply(live, seat, { type: 'placeSystemTile', tile: a.id, row: cells[0].row, col: cells[0].col });
        if (!placed.ok) return 'второй тайл не поставлен: ' + placed.error;
        // A reconnect may skip the intermediate empty snapshot entirely. Each
        // placement component must be sufficient to invalidate the old mesh.
        const cases = [
            { label: 'другая клетка', tile: a.id, rotation: 0, cell: cells[1] },
            { label: 'другая сторона', tile: b.id, rotation: 0, cell: cells[0] },
            { label: 'другой поворот', tile: a.id, rotation: 2, cell: cells[0] },
            { label: 'всё сразу', tile: b.id, rotation: 2, cell: cells[1] },
        ];
        for (const item of cases) {
            const alternative = JSON.parse(JSON.stringify(before));
            const replaced = FS_RULES.apply(alternative, seat, { type: 'placeSystemTile', tile: item.tile, rotation: item.rotation, row: item.cell.row, col: item.cell.col });
            if (!replaced.ok) return item.label + ': тайл не поставлен: ' + replaced.error;
            display(live, seat);
            const stable = view.tiles.get('sys1'), old = view.tiles.get('sys2');
            if (!stable || !old) return item.label + ': не нарисованы обе системы';
            display(alternative, seat);
            const current = view.tiles.get('sys2'), expected = alternative.systems.find(sys => sys.id === 'sys2');
            if (view.tiles.get('sys1') !== stable) return item.label + ': неизменённая система пересоздана';
            if (!current || current === old || !old.top.isDisposed()) return item.label + ': повторно использован старый тайл sys2';
            if (current.lastFace !== item.tile || current.lastRotation !== item.rotation) return item.label + ': старая сторона или поворот сохранились';
            const position = FS_VIEW.tilePos(view.app, expected, view.metrics);
            if (Math.abs(current.top.position.x - position.x) > .01 || Math.abs(current.top.position.z - position.y) > .01) return item.label + ': новый тайл остался на прежней клетке';
            if (item.cell !== cells[0]) {
                const oldHit = hit(cells[0]);
                if (oldHit && oldHit.system === 'sys2') return item.label + ': старый тайл по-прежнему перехватывает клики';
            }
            const problem = checkWorlds(expected);
            if (problem) return item.label + ': ' + problem;
            display(alternative, seat);
            if (view.tiles.get('sys2') !== current) return item.label + ': неизменённый тайл пересоздаётся при каждом обновлении';
        }
        return true;
    });
});

screen('setup-undo-3', 'отмена этапа целей убирает неподтверждённый жетон и выбор', () => {
    return setupUndoScene(({ scene, view }) => {
        const live = FS_RULES.newGame({ seed: 42, players: SEAT_PLAYERS, interactiveSetup: true });
        const seat = live.setup.turn;
        const placed = FS_RULES.apply(live, seat, { type: 'placeSystemTile', tile: live.setup.hands[seat][0], row: 0, col: 0 });
        if (!placed.ok) return 'тайл не поставлен: ' + placed.error;
        const before = JSON.parse(JSON.stringify(live));
        const finish = FS_RULES.apply(live, seat, { type: 'finishSetupForces' });
        if (!finish.ok || live.setup.stage !== 'objectives') return 'этап целей не начался';
        const option = FS_RULES.setupObjectiveOptions(live)[0];
        FS_VIEW.showGhost(view.app, view, { x: 400, y: 0, z: 300 }, '#ffffff');
        const ghost = view.ghost, oldUpdate = FS_VIEW.update, oldShow = FSUI.show;
        const game = Object.create(FS_GAME.prototype);
        Object.assign(game, {
            app: view.app, view, state: FS_RULES.view(live, seat),
            setupKey: ['objectives', seat, live.setup.currentSystem].join(':'),
            lastSeat: seat, lastPhase: 'setup', lastRound: live.round,
            mode: 'setupObjective', pending: { faction: option.faction, pos: option.areas[0] }, selected: [],
            updateStormGhosts: nothing, clearSelection: nothing, refresh: nothing,
        });
        try {
            FS_VIEW.update = nothing; FSUI.show = nothing;
            game.onState(FS_RULES.view(before, seat));
        } finally {
            FS_VIEW.update = oldUpdate; FSUI.show = oldShow;
        }
        if (game.mode !== 'idle' || game.pending) return 'выбор цели пережил отмену этапа';
        if (view.ghost || !ghost.disc.isDisposed() || !ghost.ring.isDisposed()) return 'призрак отменённой цели остался на доске';
        if (!ghost.root.isDisposed() || scene.materials.includes(ghost.mat)) return 'объект или материал призрака остался в сцене';
        return true;
    });
});

screen('setup-undo-4', 'откат жетона цели перепроверяет незавершённый выбор в партии на четверых', () => {
    return setupUndoScene(({ view }) => {
        const players = SEAT_PLAYERS.concat({ faction: 'орки', name: 'Третий', id: 'p2' }, { faction: 'эльдары', name: 'Четвёртый', id: 'p3' });
        for (const [pool, remainsLegal] of [
            [['некроны', 'некроны', 'орки', 'эльдары'], false],
            [['некроны', 'некроны', 'орки', 'орки', 'эльдары', 'эльдары'], true],
        ]) {
            const live = FS_RULES.newGame({ seed: 42, players, interactiveSetup: true });
            const seat = live.setup.turn;
            const placed = FS_RULES.apply(live, seat, { type: 'placeSystemTile', tile: live.setup.hands[seat][0], row: 0, col: 0 });
            if (!placed.ok) return 'тайл не поставлен: ' + placed.error;
            const finish = FS_RULES.apply(live, seat, { type: 'finishSetupForces' });
            if (!finish.ok || live.setup.stage !== 'objectives') return 'этап целей не начался';
            live.players[seat].objectivePool = pool.slice();
            const before = JSON.parse(JSON.stringify(live));
            const option = FS_RULES.setupObjectiveOptions(live).find(o => o.faction === 'некроны');
            const first = FS_RULES.apply(live, seat, { type: 'setupObjective', faction: option.faction, pos: option.areas[0] });
            const next = FS_RULES.setupObjectiveOptions(live).find(o => o.faction === 'орки');
            if (!first.ok || !next || live.setup.stage !== 'objectives') return 'не подготовлен выбор второго жетона';
            FS_VIEW.showGhost(view.app, view, { x: 400, y: 0, z: 300 }, '#ffffff');
            const ghost = view.ghost, oldUpdate = FS_VIEW.update, oldShow = FSUI.show;
            const game = Object.create(FS_GAME.prototype);
            Object.assign(game, {
                app: view.app, view, state: FS_RULES.view(live, seat),
                setupKey: ['objectives', seat, live.setup.currentSystem].join(':'),
                lastSeat: seat, lastPhase: 'setup', lastRound: live.round,
                mode: 'setupObjective', pending: { faction: 'орки', pos: next.areas[0] }, selected: [],
                updateStormGhosts: nothing, clearSelection: nothing, highlightSetupTargets: nothing, refresh: nothing,
            });
            try {
                FS_VIEW.update = nothing; FSUI.show = nothing;
                game.onState(FS_RULES.view(before, seat));
            } finally {
                FS_VIEW.update = oldUpdate; FSUI.show = oldShow;
            }
            if (remainsLegal) {
                if (game.mode !== 'setupObjective' || game.pending?.faction !== 'орки' || view.ghost !== ghost) return 'допустимый выбор зря сброшен';
                // The faction can still be legal while its selected world is no
                // longer free in a newer snapshot.
                game.pending.pos = option.areas[0];
                try {
                    FS_VIEW.update = nothing; FSUI.show = nothing;
                    game.onState(FS_RULES.view(live, seat));
                } finally {
                    FS_VIEW.update = oldUpdate; FSUI.show = oldShow;
                }
                if (game.mode !== 'setupObjective' || game.pending?.faction !== 'орки' || game.pending.pos !== null || view.ghost) return 'занятый мир не снят с выбора';
            } else {
                if (game.mode !== 'idle' || game.pending || view.ghost || !ghost.disc.isDisposed()) return 'недопустимый жетон остался выбран после отмены';
                const panel = { title: '', text: '', status: '', actions: [] };
                game.panelSetup(game.state, panel);
                if (!panel.hand || panel.hand.length !== 1 || !/Некроны/.test(panel.hand[0].label)) return 'панель не предлагает допустимый жетон';
            }
        }
        return true;
    });
});

screen('setup-undo-5', 'предпросмотр не перехватывает клики и полностью очищается при смене стороны', () => {
    return setupUndoScene(({ scene, view, display, hit }) => {
        const live = FS_RULES.newGame({ seed: 42, players: SEAT_PLAYERS, interactiveSetup: true });
        const seat = live.setup.turn, cell = FS_RULES.setupLegalCells(live)[0];
        const faces = FS_RULES.tileFaces(live.setup.hands[seat][0]);
        const state = FS_RULES.view(live, seat);
        display(live, seat);
        const meshCount = scene.meshes.length;
        let warmMaterials = 0, warmTextures = 0;
        for (let i = 0; i < 6; i++) {
            FS_VIEW.showSetupPreview(view.app, view, state, faces[i % 2], cell, i % 4);
            const preview = view.setupPreview, worlds = [...preview.ghost.planets.values()];
            if (!hit(cell) || hit(cell).fs !== 'setupCell') return 'предпросмотр закрывает выбор клетки';
            FS_VIEW.clearSetupPreview(view);
            if (view.setupPreview || [preview.rec.base, preview.rec.top, ...preview.rec.decorations].some(mesh => !mesh.isDisposed())) return 'предпросмотр тайла не удалён';
            if (worlds.some(planet => [planet.mesh, planet.clouds, planet.atmosphere, planet.rim].some(mesh => !mesh.isDisposed()))) return 'миры предпросмотра остались в сцене';
            if (scene.materials.includes(preview.rec.mat) || scene.textures.includes(preview.rec.tex) || scene.meshes.length !== meshCount) return 'ресурсы предпросмотра накапливаются';
            if (i === 1) { warmMaterials = scene.materials.length; warmTextures = scene.textures.length; }
            if (i > 1 && (scene.materials.length !== warmMaterials || scene.textures.length !== warmTextures)) return 'повторные смены стороны накапливают ресурсы';
        }
        return true;
    });
});

screen('setup-undo-6', 'кнопка, ПКМ и Escape снимают предпросмотр тайла и подсветку', () => {
    return setupUndoScene(({ scene, view, display, hit }) => {
        const live = FS_RULES.newGame({ seed: 42, players: SEAT_PLAYERS, interactiveSetup: true });
        const seat = live.setup.turn, cell = FS_RULES.setupLegalCells(live)[0];
        const state = FS_RULES.view(live, seat), face = FS_RULES.tileFaces(state.setup.hand[0])[0];
        display(live, seat);
        const game = Object.create(FS_GAME.prototype);
        Object.assign(game, { app: view.app, view, state, status: '', refresh: nothing });
        const oldAdd = ctx.addEventListener, oldPick = scene.pick;
        let escape;
        try {
            ctx.addEventListener = (type, handler) => { if (type === 'keydown') escape = handler; };
            game.bindUndoKey();
            scene.pick = () => ({ hit: false });
            for (const action of ['кнопка', 'ПКМ', 'Escape']) {
                game.mode = 'placeTile'; game.pending = { handTile: state.setup.hand[0], tile: face.id, rotation: 0, cell };
                FS_VIEW.showSetupPreview(view.app, view, state, face, cell, 0);
                const preview = view.setupPreview;
                FS_VIEW.highlight(view, [{ x: 400, y: 10, z: 300 }]);
                if (action === 'кнопка') game.plaqueInfo(state).view.actions.find(a => a.label === 'Отмена').onClick();
                else if (action === 'ПКМ') game.onRightClick(0, 0);
                else escape({ key: 'Escape', code: 'Escape', target: null });
                if (game.mode !== 'idle' || game.pending) return action + ': выбор остался';
                if (view.setupPreview || !preview.rec.top.isDisposed()) return action + ': предпросмотр остался на доске';
                if (view.highlights.some(ring => ring.isEnabled())) return action + ': подсветка осталась на доске';
                if (!hit(cell) || hit(cell).fs !== 'setupCell') return action + ': клетка больше не доступна';
            }
        } finally {
            ctx.addEventListener = oldAdd; scene.pick = oldPick;
        }
        return true;
    });
});

screen('setup-undo-7', 'отмена и смена жетона цели удаляют его неподтверждённый призрак', () => {
    return setupUndoScene(({ scene, view }) => {
        const players = SEAT_PLAYERS.concat({ faction: 'орки', name: 'Третий', id: 'p2' }, { faction: 'эльдары', name: 'Четвёртый', id: 'p3' });
        const live = FS_RULES.newGame({ seed: 42, players, interactiveSetup: true });
        const seat = live.setup.turn;
        const placed = FS_RULES.apply(live, seat, { type: 'placeSystemTile', tile: live.setup.hands[seat][0], row: 0, col: 0 });
        const finish = FS_RULES.apply(live, seat, { type: 'finishSetupForces' });
        if (!placed.ok || !finish.ok || live.setup.stage !== 'objectives') return 'этап целей не начался';
        const state = FS_RULES.view(live, seat), options = state.setup.objectiveOptions;
        if (options.length < 2) return 'не подготовлен выбор между двумя жетонами';
        const game = Object.create(FS_GAME.prototype);
        Object.assign(game, { app: view.app, view, state, status: '', refresh: nothing, highlightSetupTargets: nothing });
        const oldAdd = ctx.addEventListener, oldPick = scene.pick;
        let escape;
        try {
            ctx.addEventListener = (type, handler) => { if (type === 'keydown') escape = handler; };
            game.bindUndoKey();
            scene.pick = () => ({ hit: false });
            for (const action of ['кнопка', 'ПКМ', 'Escape', 'тот же жетон', 'другой жетон']) {
                game.mode = 'setupObjective'; game.pending = { faction: options[0].faction, pos: options[0].areas[0] };
                FS_VIEW.showGhost(view.app, view, { x: 400, y: 0, z: 300 }, '#ffffff');
                const ghost = view.ghost;
                FS_VIEW.highlight(view, [{ x: 400, y: 10, z: 300 }]);
                if (action === 'кнопка') game.plaqueInfo(state).view.actions.find(a => a.label === 'Отмена').onClick();
                else if (action === 'ПКМ') game.onRightClick(0, 0);
                else if (action === 'Escape') escape({ key: 'Escape', code: 'Escape', target: null });
                else {
                    const panel = { title: '', text: '', status: '', actions: [] };
                    game.panelSetup(state, panel);
                    panel.hand[action === 'другой жетон' ? 1 : 0].onClick();
                }
                if (view.ghost || !ghost.root.isDisposed() || scene.materials.includes(ghost.mat)) return action + ': призрак остался на доске';
                if (action === 'ПКМ' || action === 'Escape') {
                    if (game.mode !== 'idle' || game.pending) return action + ': выбор остался';
                    if (view.highlights.some(ring => ring.isEnabled())) return action + ': подсветка осталась на доске';
                } else {
                    const expected = action === 'другой жетон' ? options[1].faction : options[0].faction;
                    if (game.mode !== 'setupObjective' || game.pending?.faction !== expected || game.pending.pos) return action + ': неверный выбор жетона';
                }
            }
        } finally {
            ctx.addEventListener = oldAdd; scene.pick = oldPick;
        }
        return true;
    });
});

screen('setup-undo-8', 'после пропущенных снимков перепроверяется выбранная клетка и рука', () => {
    return setupUndoScene(({ scene, view, display, hit }) => {
        const copy = value => JSON.parse(JSON.stringify(value));
        const live = FS_RULES.newGame({ seed: 42, players: SEAT_PLAYERS, interactiveSetup: true });
        const advance = (state, cell) => {
            const seat = state.setup.turn;
            const placed = FS_RULES.apply(state, seat, { type: 'placeSystemTile', tile: state.setup.hands[seat][0], row: cell.row, col: cell.col });
            if (!placed.ok) throw new Error('не удалось поставить тайл: ' + placed.error);
            // Place as many real starting forces as needed to finish this tile.
            for (let attempts = 0; state.setup.stage === 'forces' && attempts < 20; attempts++) {
                const finish = FS_RULES.apply(state, seat, { type: 'finishSetupForces' });
                if (finish.ok) break;
                const sys = state.systems.find(s => s.id === state.setup.currentSystem), initial = state.players[seat].initialForces;
                let placedForce = false;
                for (const [id, count] of Object.entries(initial.units)) {
                    if (!count) continue;
                    const def = FS_RULES.unitDef(state, seat, id);
                    for (const area of sys.areas) {
                        if ((def.type === 'ground') !== !!area.world || FS_RULES.unitsAt(state, sys.id, area.pos).length >= FS_RULES.capacity(state, sys.id, area.pos)) continue;
                        if (FS_RULES.apply(state, seat, { type: 'setupUnit', unit: id, pos: area.pos }).ok) { placedForce = true; break; }
                    }
                    if (placedForce) break;
                }
                if (!placedForce) for (const [id, count] of Object.entries(initial.structures)) {
                    if (!count) continue;
                    for (const area of sys.areas) {
                        if (FS_RULES.apply(state, seat, { type: 'setupStructure', structure: id, pos: area.pos }).ok) { placedForce = true; break; }
                    }
                    if (placedForce) break;
                }
                if (!placedForce) throw new Error('не удалось разместить начальные силы');
            }
            if (state.setup.stage === 'forces') throw new Error('силы не завершены');
            while (state.setup.stage === 'objectives' && state.setup.turn === seat) {
                const option = FS_RULES.setupObjectiveOptions(state)[0];
                const result = FS_RULES.apply(state, seat, { type: 'setupObjective', faction: option.faction, pos: option.areas[0] });
                if (!result.ok) throw new Error('не удалось поставить цель: ' + result.error);
            }
        };
        advance(live, { row: 0, col: 0 });
        advance(live, FS_RULES.setupLegalCells(live)[0]);
        const choices = FS_RULES.setupLegalCells(live), original = copy(live), alternative = copy(live);
        advance(original, choices[0]); advance(alternative, choices[1]);
        const seat = original.setup.turn, oldState = FS_RULES.view(original, seat), newState = FS_RULES.view(alternative, seat);
        if (oldState.setup.stage !== 'tile' || newState.setup.stage !== 'tile' || !newState.setup.myTurn) return 'не подготовлены два снимка одного хода';
        const isCell = (a, b) => a.row === b.row && a.col === b.col;
        const common = oldState.setup.legalCells.find(c => newState.setup.legalCells.some(x => isCell(c, x)));
        const lost = oldState.setup.legalCells.find(c => !newState.setup.legalCells.some(x => isCell(c, x)));
        const fresh = newState.setup.legalCells.find(c => !oldState.setup.legalCells.some(x => isCell(c, x)));
        if (!common || !lost || !fresh) return 'не подготовлены изменившиеся клетки';
        const handTile = oldState.setup.hand[0], face = FS_RULES.tileFaces(handTile)[0], sent = [];
        const game = Object.create(FS_GAME.prototype);
        Object.assign(game, { app: view.app, view, state: oldState, setupKey: ['tile', seat, null].join(':'),
            lastSeat: seat, lastPhase: 'setup', lastRound: oldState.round, selected: [], status: '',
            updateStormGhosts: nothing, clearSelection: nothing, refresh: nothing,
            net: { cmd: cmd => { sent.push(cmd); return true; } } });
        const oldShow = FSUI.show, oldUnit = FS_VIEW.addFactionUnit, oldStructure = FS_VIEW.structureModel, oldPick = scene.pick;
        try {
            FSUI.show = nothing; FS_VIEW.addFactionUnit = nothing; FS_VIEW.structureModel = nothing;
            const choose = cell => {
                display(original, seat); game.state = oldState;
                game.mode = 'placeTile'; game.pending = { handTile, tile: face.id, rotation: 1, cell };
                FS_VIEW.showSetupPreview(view.app, view, oldState, face, cell, 1);
                game.highlightSetupCells();
                return view.setupPreview;
            };
            const ringsMatch = () => {
                const actual = view.highlights.filter(r => r.isEnabled()).map(r => r.position.x + ':' + r.position.z).sort();
                const expected = newState.setup.legalCells.map(c => { const p = FS_VIEW.tilePos(view.app, c, view.metrics); return p.x + ':' + p.y; }).sort();
                return JSON.stringify(actual) === JSON.stringify(expected);
            };
            let preview = choose(common);
            game.onState(newState);
            if (game.mode !== 'placeTile' || !isCell(game.pending.cell, common) || view.setupPreview !== preview) return 'допустимая клетка или тайл зря сброшены';
            if (!ringsMatch()) return 'подсветка не обновилась после пропущенных снимков';
            preview = choose(lost);
            game.onState(newState);
            if (game.mode !== 'placeTile' || game.pending?.tile !== face.id || game.pending.rotation !== 1 || game.pending.cell !== null) return 'недопустимая клетка не снята или потерян тайл';
            if (view.setupPreview || !preview.rec.top.isDisposed() || !ringsMatch()) return 'прежний предпросмотр или подсветка остались';
            const picked = hit(fresh);
            if (!picked || picked.fs !== 'setupCell') return 'новую допустимую клетку нельзя выбрать';
            scene.pick = () => ({ hit: true, pickedMesh: { metadata: picked } });
            game.onClick(0, 0);
            if (!game.pending.cell || !isCell(game.pending.cell, fresh) || !view.setupPreview) return 'повторный выбор клетки не работает';
            game.confirmSetupTile();
            if (sent.length !== 1 || sent[0].tile !== face.id || sent[0].rotation !== 1 || !isCell(sent[0], fresh)) return 'подтверждение отправляет неверную постановку';
            const replay = FS_RULES.apply(copy(alternative), seat, sent[0]);
            if (!replay.ok) return 'сервер отклонил новую постановку: ' + replay.error;
            preview = choose(common);
            const withoutTile = copy(newState);
            withoutTile.setup.hand = withoutTile.setup.hand.filter(id => id !== handTile);
            game.onState(withoutTile);
            if (game.mode !== 'idle' || game.pending || view.setupPreview || !preview.rec.top.isDisposed()) return 'выбор тайла, которого больше нет в руке, остался';
        } finally {
            FSUI.show = oldShow; FS_VIEW.addFactionUnit = oldUnit; FS_VIEW.structureModel = oldStructure; scene.pick = oldPick;
        }
        return true;
    });
});

const chipItem = (key, x, y, z) => ({ key, x, y, z, hp: 3, morale: 2, label: key, routed: false });
const closePx = (a, b) => Number.isFinite(a) && Math.abs(a - b) < 0.15;

head('Модели деморализованных отрядов');

screen('mech-models-ui', 'шесть моделей Механикус соответствуют файлу начальных сил', () => {
    const folder = 'Warhammer/Адептус механикус/';
    const source = fs.readFileSync(path.join(ROOT, folder, 'Начальные силы.txt'), 'utf8');
    const listed = new Map();
    for (const line of source.split(/\r?\n/)) {
        const match = /^\d+\s+(.+?)\s+-\s+(.+\.obj)$/.exec(line.trim());
        if (match) listed.set(match[1], match[2]);
    }
    const names = {
        'скитарии': 'скитарии', 'крепкие-крейсеры': 'крейсеры', 'катафроны': 'катафоны',
        'онагры': 'онагры', 'боевые-ковчеги': 'боевые ковчеги', 'тяжелые-титаны': 'титана',
    };
    const models = FS_VIEW.FACTION_UNIT_MODELS['адептус-механикус'];
    if (listed.size !== 6 || !models || Object.keys(models).length !== 6) return 'ожидались шесть сопоставлений моделей';
    for (const [unit, sourceName] of Object.entries(names)) {
        const spec = models[unit], filename = listed.get(sourceName);
        if (!spec || spec[0] !== folder || spec[1] !== filename) return 'не совпадает модель: ' + unit;
        if (!fs.existsSync(path.join(ROOT, folder, filename))) return 'нет файла модели: ' + unit;
    }
    return true;
});

screen('unit-model-1', 'своя модель и окраска лежат на поверхности, выбираются и встают обратно', () => {
    return chipScene({}, ({ B, scene, view }) => {
        const app = view.app;
        Object.assign(app.location, { width: 800, height: 600, terrain: { heightAt: () => 11 } });
        // Проверяем настоящий update и загрузчик моделей; отключаем лишь саму
        // доску и кубики, не относящиеся к выбору и положению фигурок.
        const names = ['ensureTile', 'drawTile', 'updateSetupSlots', 'updatePlanets', 'clearMarkers',
            'addMarker', 'drawCombat', 'factionModel', 'factionModelMaterial', 'iconTexture'];
        const saved = Object.fromEntries(names.map(name => [name, FS_VIEW[name]]));
        const importMesh = B.ImportMeshAsync;
        const jobs = [];
        let ready = 0;
        try {
            FS_VIEW.ensureTile = () => ({ drawn: null });
            FS_VIEW.drawTile = FS_VIEW.updateSetupSlots = FS_VIEW.updatePlanets = nothing;
            FS_VIEW.clearMarkers = v => {
                for (const marker of v.markers) marker.mesh.dispose(false, false);
                v.markers = []; v.animated = []; v.unitPositions = new Map();
            };
            FS_VIEW.addMarker = (v, mesh) => { v.markers.push({ mesh }); return mesh; };
            FS_VIEW.drawCombat = (a, v, s) => { v.reinforceAnchors = []; FS_VIEW.drawUnitChips(a, v, s); };
            FS_VIEW.factionModelMaterial = (v, faction, color) => v.material('test-' + faction, color || '#777777');
            // Управляем моментом завершения импорта, как при медленной сети.
            // Реальный factionModel нормализует и кэширует полученные меши.
            B.ImportMeshAsync = (file, target, options) => ({ then(resolve) {
                const job = { file, target, options, resolve };
                jobs.push(job);
                return { catch() { return job; } };
            } });
            view.onModelReady = () => { ready++; };
            const rootOf = unit => (view.markers.find(m => m.mesh.metadata && m.mesh.metadata.unit === unit.id) || {}).mesh;
            const partsOf = root => root.getChildMeshes(false).filter(m => m.getTotalVertices() > 0);
            const near = (a, b) => Number.isFinite(a) && Math.abs(a - b) < 0.002;
            const bounds = root => root.getHierarchyBoundingVectors(true);
            const grounded = (unit, root) => {
                const p = view.unitPositions.get(unit.id), b = bounds(root);
                return p && near((b.min.x + b.max.x) / 2, p.x) && near(b.min.y, p.y)
                    && near((b.min.z + b.max.z) / 2, p.z);
            };
            const size = root => { const b = bounds(root); return b.max.subtract(b.min); };
            for (const kind of ['ground', 'ship']) {
                const { st } = chipBattle('unit-model-' + kind);
                const combat = st.combat;
                st.units = []; st.combat = null;
                const sys = st.systems.find(s => s.areas.some(a => kind === 'ground' ? !!a.world : !a.world));
                const area = sys.areas.find(a => kind === 'ground' ? !!a.world : !a.world);
                combat.system = sys.id; combat.pos = area.pos;
                st.players[0].palette = { primary: '#224466', secondary1: '#aa8855', secondary2: '#5588aa' };
                const ownId = kind === 'ground' ? 'гвардейцы' : 'крейсеры';
                const otherId = kind === 'ground' ? 'огрины' : 'линкоры';
                const enemyId = kind === 'ground' ? 'воины' : 'крейсеры-жнец';
                const own = FS_RULES.addUnit(st, 0, ownId, sys.id, area.pos);
                const other = FS_RULES.addUnit(st, 0, otherId, sys.id, area.pos);
                const enemy = FS_RULES.addUnit(st, 1, enemyId, sys.id, area.pos);
                for (const u of [own, other, enemy]) u.routed = true;
                view.modelCache.clear(); view.modelLoads.clear(); jobs.length = 0; ready = 0;
                FS_VIEW.update(app, view, st);
                const files = [own, other, enemy].map(u => FS_VIEW.FACTION_UNIT_MODELS[u.faction][u.unit][1]);
                if (jobs.length !== files.length || files.some(file => !jobs.some(job => job.file === file))) {
                    return kind + ': деморализованные отряды не запросили свои OBJ';
                }
                if (view.modelLoads.size !== 3) return kind + ': запросы не ждут окончания загрузки';
                for (const u of [own, other, enemy]) {
                    const root = rootOf(u);
                    if (!root || root.name !== 'fs-u' + u.id || !near(root.rotation.z, Math.PI / 2)) {
                        return kind + ': пока OBJ грузится, нет лежащей запасной фигурки ' + u.unit;
                    }
                }
                const twin = FS_RULES.addUnit(st, 0, ownId, sys.id, area.pos);
                FS_VIEW.update(app, view, st);
                if (jobs.length !== 3) return kind + ': одинаковые отряды повторно запросили модель';
                const fallbackParts = root => root.getTotalVertices && root.getTotalVertices() > 0 ? [root] : partsOf(root);
                const checkFallback = () => {
                    const fall = rootOf(own), stand = rootOf(twin);
                    if (!fall || !stand || fall.name !== 'fs-u' + own.id || stand.name !== 'fs-u' + twin.id) return 'нет запасных фигурок';
                    const fp = fallbackParts(fall), sp = fallbackParts(stand);
                    if (fp.length !== sp.length || fp.some((p, i) => p.material !== sp[i].material
                        || p.getTotalVertices() !== sp[i].getTotalVertices() || p.getTotalIndices() !== sp[i].getTotalIndices())) {
                        return 'обычный и лежащий отряды различаются не только наклоном';
                    }
                    for (const u of [own, twin]) if (!near(bounds(rootOf(u)).min.y, view.unitPositions.get(u.id).y)) return 'запасная фигурка провалилась под поверхность';
                    const fs = size(fall), ss = size(stand);
                    return !near(fs.x, ss.y) || !near(fs.y, ss.x) || !near(fs.z, ss.z) ? 'запасная фигурка не лежит на боку' : null;
                };
                const pendingError = checkFallback();
                if (pendingError) return kind + ': во время загрузки ' + pendingError;
                // Меши намеренно с несоосными и по-разному смещёнными началами.
                // Если повернуть их без нормализации, фигурка улетит или уйдёт
                // под поверхность; несколько частей проверяют общую границу.
                const shapes = [
                    { p: [60, -34, 28], size: [8, 22, 12] },
                    { p: [-75, 46, -24], size: [30, 12, 18] },
                    { p: [17, 91, 50], size: [14, 27, 9] },
                ];
                for (const job of jobs) {
                    const shape = shapes[files.indexOf(job.file)];
                    const [x, y, z] = shape.p, [w, h, d] = shape.size;
                    const body = B.MeshBuilder.CreateBox('body-' + job.file, { width: w, height: h, depth: d }, scene);
                    body.position.set(x, y, z);
                    const detail = B.MeshBuilder.CreateBox('detail-' + job.file, { width: w / 4, height: h / 4, depth: d / 4 }, scene);
                    detail.position.set(x + w / 3, y + h / 2, z);
                    job.resolve({ meshes: [body, detail] });
                }
                if (view.modelLoads.size || ready !== 3) return kind + ': завершение импорта не обновляет модели';
                FS_VIEW.update(app, view, st);
                if (jobs.length !== 3) return kind + ': одинаковые отряды повторно загрузили модель';
                for (const u of [own, other, enemy, twin]) {
                    const root = rootOf(u);
                    if (!root || root.name !== 'fs-unit-model-' + u.id) return kind + ': вместо OBJ нарисован заменитель ' + u.unit;
                    if (!grounded(u, root)) return kind + ': модель ' + u.unit + ' смещена или провалилась под поверхность';
                    if (!near(root.rotation.z, u.routed ? Math.PI / 2 : 0)) return kind + ': неверный наклон ' + u.unit;
                    const parts = partsOf(root);
                    if (parts.length !== 2 || parts.some(p => !p.isPickable || p.metadata.unit !== u.id
                        || p.metadata.system !== sys.id || p.metadata.pos !== area.pos)) return kind + ': модель ' + u.unit + ' нельзя выбрать';
                    const target = parts[0]; target.computeWorldMatrix(true);
                    const c = target.getBoundingInfo().boundingBox.centerWorld;
                    const hit = scene.pickWithRay(new B.Ray(new B.Vector3(c.x, c.y + 100, c.z), new B.Vector3(0, -1, 0)), mesh => mesh === target);
                    if (!hit || !hit.hit || hit.pickedMesh.metadata.unit !== u.id) return kind + ': луч выбора не попал в ' + u.unit;
                }
                const fallen = rootOf(own), upright = rootOf(twin), fp = partsOf(fallen), up = partsOf(upright);
                if (fp.some((p, i) => p.geometry !== up[i].geometry || p.material !== up[i].material)) {
                    return kind + ': деморализованный отряд потерял геометрию или цвета обычного';
                }
                if (partsOf(rootOf(other))[0].geometry === fp[0].geometry || partsOf(rootOf(enemy))[0].geometry === fp[0].geometry) {
                    return kind + ': разные типы или фракции получили одну модель';
                }
                const f = size(fallen), u = size(upright);
                if (!near(f.x, u.y) || !near(f.y, u.x) || !near(f.z, u.z)) return kind + ': модель не лежит на боку';
                // В кэше null означает, что OBJ не загрузился. И после такой
                // ошибки обычная и лежащая запасные фигурки остаются одинаковыми.
                const key = own.faction + ':' + kind + ':' + own.unit + ':' + FS_VIEW.paletteKey(st.players[0].palette);
                const cachedModel = view.modelCache.get(key);
                view.modelCache.set(key, null);
                FS_VIEW.update(app, view, st);
                const failedError = checkFallback();
                if (failedError) return kind + ': после ошибки загрузки ' + failedError;
                view.modelCache.set(key, cachedModel);
                FS_VIEW.update(app, view, st);
                // В бою плашка должна принадлежать настоящей повёрнутой модели,
                // а не старому заменителю; после восстановления модель встаёт.
                st.combat = combat;
                FS_VIEW.update(app, view, st);
                for (const unit of [own, other, enemy]) {
                    const root = rootOf(unit), chip = view.unitChips.find(c => c.key.startsWith(unit.id + ':'));
                    if (!root || !grounded(unit, root) || !near(root.rotation.z, Math.PI / 2)) return kind + ': в бою модель сбилась с места';
                    if (!chip || chip.root !== root || !chip.routed || chip.morale !== 0) return kind + ': плашка не следует за деморализованным отрядом';
                }
                // Подкрепление тоже представлено фигуркой юнита. Проверяем
                // настоящий drawCombat: белые обычная и лежащая модели должны
                // использовать общую геометрию и оставаться на поверхности.
                const cached = FS_VIEW.factionModel(view, own.faction, kind, own.unit, st.players[0].palette);
                combat.dice = { attacker: [], defender: [] };
                combat.reinforce = { attacker: 2, defender: 0 };
                combat.reinforceFlipped = { attacker: [1], defender: [] };
                FS_VIEW.factionModel = () => cached;
                try { saved.drawCombat.call(FS_VIEW, app, view, st); }
                finally { FS_VIEW.factionModel = saved.factionModel; }
                const reinRoot = i => (view.markers.find(m => m.mesh.metadata && m.mesh.metadata.reinforceId === 'reinforce-attacker-' + i) || {}).mesh;
                for (const i of [0, 1]) {
                    const root = reinRoot(i), anchor = view.reinforceAnchors.find(a => a.side === 'attacker' && a.index === i);
                    if (!root || !anchor || !near(root.rotation.z, i ? Math.PI / 2 : 0)) return kind + ': подкрепление не перевернулось';
                    const b = bounds(root), parts = partsOf(root);
                    if (!near((b.min.x + b.max.x) / 2, anchor.x) || !near(b.min.y, anchor.y)
                        || !near((b.min.z + b.max.z) / 2, anchor.z)) return kind + ': подкрепление смещено или провалилось';
                    if (parts.length !== 2 || parts.some(p => !p.isPickable || p.metadata.reinforceId !== 'reinforce-attacker-' + i)) {
                        return kind + ': подкрепление нельзя выбрать';
                    }
                    const chip = view.unitChips.find(c => c.key.startsWith('rein:attacker:' + i + ':'));
                    if (!chip || chip.root !== root || chip.routed !== !!i) return kind + ': плашка потеряла подкрепление';
                }
                const standingRein = partsOf(reinRoot(0)), fallenRein = partsOf(reinRoot(1));
                if (fallenRein.some((p, i) => p.geometry !== standingRein[i].geometry || p.material !== standingRein[i].material)) {
                    return kind + ': подкрепления получили разные модели или окраску';
                }
                // То же условие действует для временного диска, если модель
                // подкрепления ещё загружается или не смогла загрузиться.
                FS_VIEW.update(app, view, st);
                const icons = [];
                FS_VIEW.factionModel = () => null;
                FS_VIEW.iconTexture = (v, icon, color) => { icons.push({ icon, color }); return null; };
                try { saved.drawCombat.call(FS_VIEW, app, view, st); }
                finally { FS_VIEW.factionModel = saved.factionModel; FS_VIEW.iconTexture = saved.iconTexture; }
                for (const i of [0, 1]) {
                    const root = reinRoot(i), anchor = view.reinforceAnchors.find(a => a.side === 'attacker' && a.index === i);
                    if (!root || !anchor || !near(root.rotation.z, i ? Math.PI / 2 : 0)
                        || !near(bounds(root).min.y, anchor.y)) return kind + ': запасное подкрепление провалилось или не повернулось';
                    if (partsOf(root).some(p => !p.isPickable || p.metadata.reinforceId !== 'reinforce-attacker-' + i)) {
                        return kind + ': запасное подкрепление нельзя выбрать';
                    }
                }
                const uprightFallback = partsOf(reinRoot(0)), fallenFallback = partsOf(reinRoot(1));
                if (uprightFallback.length !== fallenFallback.length || fallenFallback.some((p, i) =>
                    p.getTotalVertices() !== uprightFallback[i].getTotalVertices()
                    || !p.material.diffuseColor.equals(uprightFallback[i].material.diffuseColor)
                    || !p.material.emissiveColor.equals(uprightFallback[i].material.emissiveColor)
                    || p.material.alpha !== uprightFallback[i].material.alpha)
                    || icons.some(icon => icon.color !== icons[0].color)) return kind + ': запасные подкрепления отличаются не только наклоном';
                own.routed = false;
                FS_VIEW.update(app, view, st);
                const restored = rootOf(own), restoredChip = view.unitChips.find(c => c.key.startsWith(own.id + ':'));
                if (!restored || !near(restored.rotation.z, 0) || partsOf(restored)[0].geometry !== partsOf(rootOf(twin))[0].geometry
                    || !restoredChip || restoredChip.routed) return kind + ': восстановленный отряд не вернулся к обычной модели';
                st.combat = null;
                FS_VIEW.update(app, view, st);
                if (!grounded(own, rootOf(own))) return kind + ': восстановленный отряд стоит не на поверхности';
            }
            return true;
        } finally {
            B.ImportMeshAsync = importMesh;
            Object.assign(FS_VIEW, saved);
        }
    });
});

head('Бой: проекция плашек');

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
