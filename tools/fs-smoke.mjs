// ============================================================================
//  fs-smoke.mjs — the game loads and a party runs
// ----------------------------------------------------------------------------
//  node tools/fs-smoke.mjs
//
//  The rules audit (fs-audit.mjs) checks single rules; this check is about the
//  seams: every classic script of index.html loads in the browser order without
//  throwing, the engine the LAN server builds is the same one, and a whole round
//  (planning → operations → refresh) can be played through the real command API
//  without a broken command.
//
//  It was written after the server had drifted from index.html: it never loaded
//  FSCards.js and FSWarpStorms.js, so buying an upgrade or moving a storm worked
//  in the browser and failed on the server. The load list now comes from
//  index.html (tools/fs-engine.mjs), and this smoke test keeps it honest.
// ============================================================================
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { ROOT, htmlFiles } from './fs-engine.mjs';

const C = { r: '\x1b[0m', b: '\x1b[1m', dim: '\x1b[2m', red: '\x1b[31m', grn: '\x1b[32m', yel: '\x1b[33m' };
let failed = 0;
const ok = m => console.log('  ' + C.grn + 'ok  ' + C.r + C.dim + m + C.r);
const fail = m => { failed++; console.log('  ' + C.red + 'FAIL' + C.r + ' ' + m); };
const section = m => console.log('\n' + C.b + '  ' + m + C.r);

// --- the page, as far as the scripts touch it at load time -------------------
/** A stand-in for Babylon and the DOM: the scripts define their classes, nothing renders. */
function pageContext() {
    const noop = () => undefined;
    const mesh = () => new Proxy({}, { get: (t, k) => (k === 'then' ? undefined : (typeof k === 'string' && /^(position|rotation|scaling)$/.test(k) ? { x: 0, y: 0, z: 0, set: noop, copyFrom: noop } : noop)), set: () => true });
    const BABYLON = new Proxy({}, {
        get: (t, key) => {
            if (key === 'Vector3' || key === 'Color3' || key === 'Color4' || key === 'Quaternion') {
                return function () { return { x: 0, y: 0, z: 0, r: 0, g: 0, b: 0, a: 1, scale: () => ({ x: 0, y: 0, z: 0 }), clone: () => ({ x: 0, y: 0, z: 0 }), add: () => ({ x: 0, y: 0, z: 0 }) }; };
            }
            if (key === 'Scene' || key === 'Engine') return function () { return { FOGMODE_EXP2: 0 }; };
            if (key && String(key).startsWith('Create')) return mesh;
            if (key === 'MeshBuilder') return new Proxy({}, { get: () => mesh });
            return new Proxy(function () {}, { get: () => noop, construct: () => mesh() });
        },
    });
    const element = () => ({
        style: { setProperty: noop }, classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
        append: noop, appendChild: noop, remove: noop, setAttribute: noop, getContext: () => ({}),
        addEventListener: noop, removeEventListener: noop, getBoundingClientRect: () => ({ width: 0, height: 0, left: 0, top: 0 }),
    });
    const document = {
        createElement: element, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
        body: element(), addEventListener: noop, documentElement: element(),
    };
    const window = { addEventListener: noop, removeEventListener: noop, location: { protocol: 'http:', host: 'localhost', search: '', href: 'http://localhost/' }, navigator: { userAgent: 'smoke' }, requestAnimationFrame: () => 0 };
    return vm.createContext({
        console, Math, JSON, Date, Set, Map, Array, Object, Number, String, Boolean, Error,
        parseInt, parseFloat, isNaN, RegExp, Promise, Symbol, TypeError, RangeError, WeakMap, WeakSet, Reflect, Proxy,
        setTimeout: noop, clearTimeout: noop, requestAnimationFrame: () => 0, performance: { now: () => 0 },
        document, window, navigator: window.navigator, location: window.location, localStorage: { getItem: () => null, setItem: noop },
        BABYLON,
    });
}

const ctx = pageContext();
section('загрузка скриптов index.html');
let loaded = 0;
for (const file of htmlFiles().filter(f => f.endsWith('.js') && !f.startsWith('libs/'))) {
    try {
        vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), ctx, { filename: file });
        loaded++;
    } catch (e) {
        fail(file + ': ' + e.message);
        break;
    }
}
if (!failed) ok(loaded + ' скриптов загружено в порядке index.html');

const engine = name => vm.runInContext(name, ctx);
/** @type {any} */ const R = engine('FS_RULES');
/** @type {any} */ const CAT = engine('FS_CATALOG');
/** @type {any} */ const CARDS = engine('FS_CARDS');
/** @type {any} */ const STORMS = engine('FS_WARP_STORMS');

// --- helpers ----------------------------------------------------------------
const seedPlayers = () => ([
    { faction: 'имперская-гвардия', name: 'P0', id: 'p0' },
    { faction: 'орки', name: 'P1', id: 'p1' },
]);
const apply = (st, seat, cmd) => R.apply(st, seat, cmd);
const must = (st, seat, cmd, what) => {
    const res = apply(st, seat, cmd);
    if (!res || res.ok === false) throw new Error(what + ': ' + ((res && res.error) || 'нет ответа'));
    return res;
};

// --- one full round ---------------------------------------------------------
section('раунд: планирование → операции → обновление');
try {
    const st = R.newReadyGame({ seed: 11, players: seedPlayers() });
    const orders = ['advance', 'deploy', 'strategize', 'dominate'];
    let n = 0;
    while (st.phase === 'planning' && n++ < 32) {
        const seat = st.turn;
        const sys = st.systems.find(s => R.canPlaceOrder(st, seat, s.id));
        if (!sys) throw new Error('некуда положить приказ игроку ' + seat);
        // The hand holds two tokens of every kind: take the first kind left.
        const kind = orders.find(o => R.orderLeft(st, seat, o) > 0)
            || orders.find(o => R.orderLeft(st, 1 - seat, o) > 0);
        must(st, seat, { type: 'placeOrder', system: sys.id, order: kind }, 'placeOrder');
    }
    if (st.phase !== 'operations') throw new Error('планирование не перешло в операции (жетонов ' + st.systems.reduce((a, s) => a + s.tokens.length, 0) + ')');
    ok('все приказы выложены, фаза операций');

    n = 0;
    while (st.phase === 'operations' && n++ < 64) {
        if (st.trim && st.trim.length) {
            const entry = st.trim[0];
            const unit = st.units.find(u => u.seat === entry.seat && u.system === entry.system && u.area === entry.pos);
            if (!unit) throw new Error('переполнение без отряда');
            must(st, entry.seat, { type: 'trimUnit', unit: unit.id }, 'trimUnit');
            continue;
        }
        if (!st.order) {
            const seat = st.turn;
            const sys = st.systems.find(s => s.tokens.length && s.tokens[s.tokens.length - 1].seat === seat);
            if (!sys) throw new Error('у игрока ' + seat + ' нет приказа, но операции идут');
            must(st, seat, { type: 'resolveOrder', system: sys.id }, 'resolveOrder');
            continue;
        }
        const seat = st.order.seat;
        const kind = st.order.order;
        if (kind === 'advance') must(st, seat, { type: 'finishAdvance' }, 'finishAdvance');
        else if (kind === 'deploy') must(st, seat, { type: 'finishDeploy' }, 'finishDeploy');
        else if (kind === 'strategize') must(st, seat, { type: 'finishStrategize' }, 'finishStrategize');
        else if (kind === 'dominate') must(st, seat, { type: 'finishDominate' }, 'finishDominate');
        else throw new Error('неизвестный приказ ' + kind);
    }
    if (st.phase !== 'refresh') throw new Error('операции не закончились: фаза ' + st.phase);
    ok('все приказы разыграны, фаза обновления');

    n = 0;
    while (st.phase === 'refresh' && !st.over && n++ < 32) {
        if (!st.event) { must(st, st.turn, { type: 'nextPhase' }, 'nextPhase'); break; }
        const seat = st.event.seat;
        if (st.eventsLeft <= 0) { must(st, seat, { type: 'nextPhase' }, 'nextPhase'); break; }
        if (!st.event.stormMoved) {
            const opts = R.stormOptions(st, seat);
            if (opts.length) { must(st, seat, { type: 'moveStorm', storm: opts[0].storm, dir: opts[0].dir }, 'moveStorm'); continue; }
        }
        if ((st.event.drawn || []).length && !st.event.chosen) {
            must(st, seat, { type: 'drawEvent', card: st.event.drawn[0] }, 'drawEvent');
        }
        must(st, seat, { type: 'resolveEvent' }, 'resolveEvent');
    }
    if (!st.over && st.round !== 2) throw new Error('раунд не закончился: round=' + st.round + ', phase=' + st.phase);
    ok('обновление дошло до конца: раунд ' + st.round);
} catch (e) {
    fail(e.message);
}

// --- the deck object the server used to break on ----------------------------
section('колоды и штормы через движок (то, что не грузилось на сервере)');
try {
    const st = R.newReadyGame({ seed: 3, players: seedPlayers() });
    const deck = CARDS.combatDeck(R, st, 0);
    if (!deck || typeof deck.upgradeOptions !== 'function') throw new Error('нет колоды боя');
    const opts = deck.upgradeOptions();
    if (!opts.length) throw new Error('нет улучшений в колоде');
    ok('колода боя: ' + opts.length + ' улучшений');
    const storms = STORMS.options(st, STORMS.directions);
    if (!storms.length) throw new Error('нет ходов шторма');
    const storm = STORMS.options(st, STORMS.directions)[0];
    const ref = STORMS.target(st, (st.storms || []).find(s => s.id === storm.storm), storm.dir);
    if (!ref) throw new Error('шторм не нашёл цели');
    ok('шторм: ' + storm.dir + ' → ' + ref.key);
} catch (e) {
    fail(e.message);
}

// --- a battle is built and the first command is accepted --------------------
section('тест боя');
try {
    const st = R.newBattleTest({ seed: 5, players: seedPlayers(), units: { 'гвардейцы': 2 }, foeUnits: { 'бойзы': 2 } });
    if (!st.combat) throw new Error('бой не начался');
    const c = st.combat;
    if (!(c.dice.attacker.length || c.dice.defender.length)) throw new Error('кубики не брошены');
    ok('бой создан: ' + c.step + ', кубиков ' + (c.dice.attacker.length + c.dice.defender.length));
    const side = String(c.step).endsWith('attacker') ? 'attacker' : 'defender';
    const seat = c[side];
    must(st, seat, { type: 'combat', action: 'reinforce', count: 0 }, 'combat reinforce');
    ok('шаг подкрепления принял команду');
} catch (e) {
    fail(e.message);
}

// --- the catalogue is the one face of the data ------------------------------
section('каталог');
try {
    if (!CAT.faction('орки') || CAT.factionColor('орки') !== '#6aa832') throw new Error('фракции не читаются');
    if (CAT.assetLimit('тираниды', 'reinforcement') !== 4 || CAT.assetLimit('орки', 'reinforcement') !== 3) throw new Error('предел ресурсов');
    const p = CAT.palette({ primary: '#112233' }, '#445566');
    if (p.primary !== '#112233' || !/^#[0-9a-f]{6}$/.test(p.secondary1)) throw new Error('палитра');
    ok('фракции, цвета, палитры и предел ресурсов из одного места');
} catch (e) {
    fail(e.message);
}

console.log('\n' + (failed
    ? C.red + C.b + '  Дым не прошёл: ' + failed + ' проверок.' + C.r
    : C.grn + C.b + '  Дым прошёл: игра грузится и раунд играется.' + C.r) + '\n');
process.exit(failed ? 1 : 0);
