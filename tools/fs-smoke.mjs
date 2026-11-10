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

// --- a whole round, for any number of players --------------------------------
// The same rules must serve a duel and a full table: the map, the factions and
// the number of players change, the code path does not.
section('раунд: планирование → операции → обновление (2 и 4 игрока)');
const FACTION_POOL = ['имперская-гвардия', 'орки', 'некроны', 'эльдары'];
const seatsOf = n => Array.from({ length: n }, (_, i) => ({
    faction: FACTION_POOL[i % FACTION_POOL.length], name: 'P' + i, id: 'p' + i,
}));

function playRound(players, seed) {
    const st = R.newReadyGame({ seed, players });
    const orders = ['advance', 'deploy', 'strategize', 'dominate'];
    if (st.phase !== 'planning') throw new Error('партия не началась с планирования');
    let n = 0;
    while (st.phase === 'planning' && n++ < 64) {
        const seat = st.turn;
        const sys = st.systems.find(s => R.canPlaceOrder(st, seat, s.id));
        if (!sys) throw new Error('некуда положить приказ игроку ' + seat);
        // The hand holds two tokens of every kind: take a kind that is left.
        const kind = orders.find(o => R.orderLeft(st, seat, o) > 0);
        if (!kind) throw new Error('у игрока ' + seat + ' кончились приказы, а планирование идёт');
        must(st, seat, { type: 'placeOrder', system: sys.id, order: kind }, 'placeOrder');
    }
    const laid = st.systems.reduce((a, s) => a + s.tokens.length, 0);
    if (st.phase !== 'operations') throw new Error('планирование не перешло в операции (жетонов ' + laid + ')');
    if (laid !== R.ORDER_TOKENS * players.length) {
        throw new Error('выложено ' + laid + ' жетонов вместо ' + R.ORDER_TOKENS * players.length);
    }

    n = 0;
    while (st.phase === 'operations' && n++ < 128) {
        if (R.trimQueue(st).any()) {
            const entry = R.trimQueue(st).entries()[0];
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

    n = 0;
    while (st.phase === 'refresh' && !st.over && n++ < 64) {
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
    return 'раунд ' + st.round + ', систем ' + st.systems.length + ', штормов ' + st.storms.length;
}

for (const count of [2, 4]) {
    try {
        ok(count + ' игрока: ' + playRound(seatsOf(count), 11));
    } catch (e) {
        fail(count + ' игрока: ' + e.message);
    }
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

// --- the two halves of a step are registered, not written in a switch -------
section('шаги карт: реестр исполнителей');
try {
    const STEPS = engine('STEP_EXECUTORS');
    const ASKS = engine('ASK_EXECUTORS');
    if (!(STEPS instanceof Map) || !(ASKS instanceof Map)) throw new Error('реестры шагов не загрузились');
    if (STEPS.size < 70) throw new Error('исполнителей шагов слишком мало: ' + STEPS.size);
    if (ASKS.size < 150) throw new Error('вопросов шага слишком мало: ' + ASKS.size);
    // A step that the engine reaches but nobody registered would silently do
    // nothing — that is exactly how a rule disappears in a refactoring.
    const sample = ['gainToken', 'placeUnit', 'gainAsset', 'once', 'note', 'choice', 'rerollDie'];
    for (const op of sample) {
        if (!STEPS.has(op) && !ASKS.has(op)) throw new Error('шаг «' + op + '» никто не исполняет');
    }
    // Every registered name must be a function: a typo in an ops list would
    // register `undefined` and the step would quietly do nothing.
    for (const [op, fn] of STEPS) if (typeof fn !== 'function') throw new Error('исполнитель «' + op + '» не функция');
    for (const [op, fn] of ASKS) if (typeof fn !== 'function') throw new Error('вопрос «' + op + '» не функция');
    ok(STEPS.size + ' исполнителей и ' + ASKS.size + ' вопросов шага, каждый — функция');
} catch (e) {
    fail(e.message);
}

// --- one door to the printed data -------------------------------------------
// FS_DATA is the generated file; every other script reads it through the
// catalogue or through the card decks. A new lookup written straight on FS_DATA
// is how a faction colour, a card text or a limit starts to differ between the
// map, the panel and the rules — so it fails here.
section('данные только через каталог');
try {
    const offenders = [];
    for (const file of htmlFiles().filter(f => f.endsWith('.js')
        && !f.startsWith('libs/') && f !== 'js/fs/FSData.js')) {
        const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
        for (const m of text.matchAll(/FS_DATA\.(\w+)/g)) {
            // The two catalogues are built FROM the data file — that is their job.
            if (/FSCatalog|FSCards/.test(file)) continue;
            offenders.push(file + ': FS_DATA.' + m[1]);
        }
    }
    if (offenders.length) throw new Error(offenders.slice(0, 4).join('; '));
    ok('ни один скрипт, кроме каталогов, не читает FS_DATA напрямую');
} catch (e) {
    fail(e.message);
}

// --- one concept, one place ---------------------------------------------------
// The bug this guards against: the token limit was counted in twenty places, so
// raising it for the Tyranids fixed one purchase and left the rest. The account
// of the tokens now lives in PlayerEntity (js/fs/core/FSPlayers.js) alone; a
// file that writes `assets[...]` or `assets.x` directly is a second copy of that
// account, and the next fix will miss it.
section('жетоны: одно место учёта');
try {
    const offenders = [];
    for (const file of htmlFiles().filter(f => f.endsWith('.js')
        && !f.startsWith('libs/') && f !== 'js/fs/FSData.js' && f !== 'js/fs/core/FSPlayers.js')) {
        // The data file names the asset kinds of the printed worlds ("assets": [...])
        // — that is a description of a tile, not the account of a player.
        const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
        let m;
        const write = /\bassets\s*\[[^\]]+\]\s*(=(?!=)|\+\+|--|\+=|-=)/g;
        while ((m = write.exec(text))) {
            const line = text.slice(0, m.index).split('\n').length;
            offenders.push(file + ':' + line + ' — assets[…] =');
        }
        const field = /\bassets\.(?:forge|cache|reinforcement|prosperity)\s*(=(?!=)|\+\+|--|\+=|-=)/g;
        while ((m = field.exec(text))) {
            const line = text.slice(0, m.index).split('\n').length;
            offenders.push(file + ':' + line + ' — assets.' + m[0].split('.')[1]);
        }
    }
    if (offenders.length) throw new Error(offenders.slice(0, 5).join('; '));
    ok('ни один скрипт, кроме PlayerEntity, не пишет в assets напрямую');
} catch (e) {
    fail(e.message);
}

// --- the combat deck and the combat hand: one account ------------------------
section('боевая колода и рука: одно место учёта');
try {
    const owners = new Set(['js/fs/FSCards.js', 'js/fs/core/FSPlayers.js', 'js/fs/FSData.js']);
    const offenders = [];
    for (const file of htmlFiles().filter(f => f.endsWith('.js') && !f.startsWith('libs/'))) {
        const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
        // The deck and the hand of a battle are objects of FSCards.js: a rule,
        // a card or the panel asks them instead of splicing the arrays itself.
        const rules = [
            // decks.combat = [cards] — a deck built by hand. The number the view
            // sends to the panel (decks.combat = 10) is not a deck.
            [/\bdecks\.combat\s*=\s*(?!=)(?![\d\s;,)])|\bdecks\.combat\.(?:push|splice|shift|unshift|pop)\b/, 'decks.combat'],
            [/\bdecks\.upgradeCombat\s*=\s*(?!=)(?![\d\s;,)])|\bdecks\.upgradeCombat\.(?:push|splice|shift|unshift|pop)\b/, 'decks.upgradeCombat'],
            [/\bcards\s*\[[^\]]+\]\s*\.\s*(?:hand|chosen)\s*(=(?!=)|\.(?:push|splice|shift|unshift|pop)\b)/g, 'cards[side].hand'],
        ];
        for (const [re, what] of rules) {
            const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
            let m;
            while ((m = g.exec(text))) {
                if (owners.has(file)) continue;
                const line = text.slice(0, m.index).split('\n').length;
                offenders.push(file + ':' + line + ' — ' + what);
            }
        }
    }
    if (offenders.length) throw new Error(offenders.slice(0, 5).join('; '));
    ok('ни один скрипт, кроме FSCards.js, не правит колоду и руку боя напрямую');
} catch (e) {
    fail(e.message);
}

// --- the hard limit of an area: one question --------------------------------
section('вместимость и предел области: одно место');
try {
    const offenders = [];
    const files = fs.readdirSync(path.join(ROOT, 'js/fs/rules')).map(f => 'js/fs/rules/' + f)
        .concat(fs.readdirSync(path.join(ROOT, 'js/fs/effects')).filter(f => f.endsWith('.js')).map(f => 'js/fs/effects/' + f));
    // The board owns the number and the question «есть ли место?»; the setup
    // counts the plastic of a tile it has not built yet, and the core words
    // the refusal. Every other file asks.
    const owners = new Set(['js/fs/core/FSBoard.js', 'js/fs/core/FSRulesConfig.js',
        'js/fs/rules/SetupRules.js', 'js/fs/rules/CoreRules.js']);
    for (const file of files) {
        if (owners.has(file)) continue;
        const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
        // «No more than five units of one player in an area» is asked by the
        // board (unitLimit/hasRoom), never counted by hand in a rule or a card.
        const re = /AREA_MAX_UNITS|\.filter\(u => u\.seat === [^)]*\)\.length\s*[+>=]/g;
        let m;
        while ((m = re.exec(text))) {
            const line = text.slice(0, m.index).split('\n').length;
            offenders.push(file + ':' + line);
        }
    }
    if (offenders.length) throw new Error(offenders.slice(0, 4).join('; '));
    ok('предел области считает только доска');
} catch (e) {
    fail(e.message);
}

// --- the end of an order: one place -----------------------------------------
section('конец приказа: одно место');
try {
    const offenders = [];
    for (const file of htmlFiles().filter(f => f.endsWith('.js') && !f.startsWith('libs/'))) {
        if (file === 'js/fs/rules/OperationsRules.js' || file === 'js/fs/FSData.js') continue;
        const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
        // The order of a turn ends through closeOrder: it is the only place that
        // knows a question of the order ends with it.
        const re = /\bstate\.order\s*=\s*null/g;
        let m;
        while ((m = re.exec(text))) {
            const line = text.slice(0, m.index).split('\n').length;
            offenders.push(file + ':' + line);
        }
    }
    if (offenders.length) throw new Error(offenders.slice(0, 4).join('; '));
    ok('приказ закрывается только через closeOrder');
} catch (e) {
    fail(e.message);
}

// --- a piece changes its area: one movement ---------------------------------
section('перенос фигуры: одно движение');
try {
    const offenders = [];
    const owners = new Set(['js/fs/core/FSBoard.js', 'js/fs/FSData.js']);
    for (const file of htmlFiles().filter(f => f.endsWith('.js') && !f.startsWith('libs/'))) {
        if (owners.has(file)) continue;
        const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
        // `unit.system = …; unit.area = …` is the movement of a piece. The board
        // writes it (and the list of moves with it): a rule or a card asks.
        const names = /\b(u|unit|s|piece|st|w)\.system\s*=\s*(?!=)[^;\n]+;[^\n]*?\b\1\.(?:area|pos)\s*=/g;
        let m;
        while ((m = names.exec(text))) {
            const line = text.slice(0, m.index).split('\n').length;
            offenders.push(file + ':' + line);
        }
    }
    if (offenders.length) throw new Error(offenders.slice(0, 4).join('; '));
    ok('фигуру переносит только доска');
} catch (e) {
    fail(e.message);
}

// --- a unit is routed: one place ---------------------------------------------
section('деморализация: одно место');
try {
    const owners = new Set(['js/fs/rules/CombatRules.js', 'js/fs/FSData.js']);
    const offenders = [];
    for (const file of htmlFiles().filter(f => f.endsWith('.js') && !f.startsWith('libs/'))) {
        if (owners.has(file)) continue;
        const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
        // «If a unit suffers damage and is not destroyed, that unit is routed.»
        // The mark and the round it happened in are one fact: a rule or a card
        // asks routeUnit / restoreUnit, never writes the field by hand.
        // `step.routed` is not a unit: it is the filter a card puts on its
        // «уничтожьте деморализованный отряд» step.
        const re = /\b(?!(?:step|one)\b)[A-Za-z_$][\w$]*\.routed\s*=(?!=)/g;
        let m;
        while ((m = re.exec(text))) {
            const line = text.slice(0, m.index).split('\n').length;
            offenders.push(file + ':' + line);
        }
    }
    if (offenders.length) throw new Error(offenders.slice(0, 4).join('; '));
    ok('деморализует и восстанавливает только бой');
} catch (e) {
    fail(e.message);
}

// --- the purchases of an order: one list -------------------------------------
section('покупки приказа: один список');
try {
    const offenders = [];
    for (const file of htmlFiles().filter(f => f.endsWith('.js') && !f.startsWith('libs/'))) {
        if (file === 'js/fs/FSData.js') continue;
        const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
        // What the order has bought is its list of purchases: the deploy limit,
        // the one structure and the faction deal are counted from it. A second
        // counter drifts from the list the moment an undo takes a record away.
        const re = /\b[A-Za-z_$][\w$]*\.(?:bought|dealBought|structureBought)\s*=(?!=)/g;
        let m;
        while ((m = re.exec(text))) {
            const line = text.slice(0, m.index).split('\n').length;
            offenders.push(file + ':' + line);
        }
    }
    if (offenders.length) throw new Error(offenders.slice(0, 4).join('; '));
    ok('счёт покупок берётся из списка покупок');
} catch (e) {
    fail(e.message);
}

// --- the excess of an area: one queue ----------------------------------------
section('сверх вместимости: одна очередь');
try {
    const owners = new Set(['js/fs/core/FSTrim.js', 'js/fs/FSData.js']);
    const offenders = [];
    for (const file of htmlFiles().filter(f => f.endsWith('.js') && !f.startsWith('libs/'))) {
        if (owners.has(file)) continue;
        const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
        // The areas that wait for their owner's choice are a queue: it owns
        // `state.trim`. A rule asks the queue, the panel and the server read it
        // through the same object — nobody rebuilds the list by hand.
        const re = /\bstate\.trim\b/g;
        let m;
        while ((m = re.exec(text))) {
            const line = text.slice(0, m.index).split('\n').length;
            offenders.push(file + ':' + line);
        }
    }
    if (offenders.length) throw new Error(offenders.slice(0, 4).join('; '));
    ok('переполненные области ведёт только очередь');
} catch (e) {
    fail(e.message);
}

// --- a warp storm stands on one edge ------------------------------------------
section('варп-шторм: одна запись границы');
try {
    const owners = new Set(['js/fs/FSWarpStorms.js', 'js/fs/FSData.js']);
    const offenders = [];
    for (const file of htmlFiles().filter(f => f.endsWith('.js') && !f.startsWith('libs/'))) {
        if (owners.has(file)) continue;
        const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
        // A storm is a record of one border of the grid: `edge`, `a`, `b`, `tiles`
        // come from the field together, and a rule or a card asks it to move.
        const re = /\bstorm\.(?:edge|a|b|tiles)\s*=(?!=)/g;
        let m;
        while ((m = re.exec(text))) {
            const line = text.slice(0, m.index).split('\n').length;
            offenders.push(file + ':' + line);
        }
    }
    if (offenders.length) throw new Error(offenders.slice(0, 4).join('; '));
    ok('границу шторма пишет только поле штормов');
} catch (e) {
    fail(e.message);
}

// --- what an order is: one object -------------------------------------------
section('кто и какой приказ: один объект');
try {
    const owners = new Set(['js/fs/core/FSOrderContext.js', 'js/fs/core/FSDeal.js', 'js/fs/FSData.js']);
    const offenders = [];
    for (const file of htmlFiles().filter(f => f.endsWith('.js') && !f.startsWith('libs/'))) {
        if (owners.has(file)) continue;
        const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
        // Whose order it is, of what kind and where it happens is one question
        // (OrderContext); so is the pair of «Массового Производства» (OrderDeal).
        const re = /\b(?:state\.order|s\.order|order)\.(?:system|seat|order|nestedKind|nested|supplyDeal)\b/g;
        let m;
        while ((m = re.exec(text))) {
            const line = text.slice(0, m.index).split('\n').length;
            offenders.push(file + ':' + line);
        }
    }
    if (offenders.length) throw new Error(offenders.slice(0, 4).join('; '));
    ok('кто и какой приказ, спрашивают у OrderContext');
} catch (e) {
    fail(e.message);
}

// --- the moments a battle waits for: one object ------------------------------
// --- what the cards promised to a battle: one object -------------------------
section('обещания карт бою: один объект');
try {
    const owners = new Set(['js/fs/core/FSCombatPlans.js', 'js/fs/FSData.js']);
    const offenders = [];
    for (const file of htmlFiles().filter(f => f.endsWith('.js') && !f.startsWith('libs/'))) {
        if (owners.has(file)) continue;
        const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
        // The plans a card leaves for the end of the damage step or of the round,
        // the tokens promised to the next round and the facts of the round are
        // one object: CombatPlans.
        const re = /\b(?:state\.combat|s\.combat|combat|c|cbt)\.(?:resurrectPlan|resurrectCandidates|resurrectAsked|restoreFallen|endRoundPlans|endRoundNoRetreat|noDamageRetreat|laterTokens|deferDamage|destroyRoutedFoe|keepTokens|fallenThisStep|roundUnits|retreated|destroyedNow)\b/g;
        let m;
        while ((m = re.exec(text))) {
            const line = text.slice(0, m.index).split('\n').length;
            offenders.push(file + ':' + line);
        }
    }
    if (offenders.length) throw new Error(offenders.slice(0, 4).join('; '));
    ok('обещания карт бою спрашивают у CombatPlans');
} catch (e) {
    fail(e.message);
}

// --- the phase of a game and the turn: one object ----------------------------
section('фаза игры: один объект');
try {
    const owners = new Set(['js/fs/core/FSGamePhase.js', 'js/fs/rules/SetupRules.js',
        'js/fs/core/FSQuickResponse.js']);
    const offenders = [];
    for (const file of htmlFiles().filter(f => f.endsWith('.js') && !f.startsWith('libs/'))) {
        if (owners.has(file)) continue;
        const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
        // Фаза раунда, чей ход, круг игроков и номер раунда — один объект
        // GamePhase: строки фаз и поля state.phase/state.turn/state.firstPlayer/
        // state.round не читают руками ни правила, ни доска, ни панель.
        const re = /\bstate\.(?:phase|firstPlayer|round|turn)\b/g;
        let m;
        while ((m = re.exec(text))) {
            const line = text.slice(0, m.index).split('\n').length;
            offenders.push(file + ':' + line);
        }
    }
    if (offenders.length) throw new Error(offenders.slice(0, 4).join('; '));
    ok('фазу игры, круг и раунд спрашивают у GamePhase');
} catch (e) {
    fail(e.message);
}

// --- the chronicle of a game: one object -------------------------------------
section('журнал игры: один объект');
try {
    const owners = new Set(['js/fs/core/FSGameLog.js', 'js/fs/rules/CoreRules.js']);
    const offenders = [];
    for (const file of htmlFiles().filter(f => f.endsWith('.js') && !f.startsWith('libs/'))) {
        if (owners.has(file)) continue;
        const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
        // Запись журнала — один объект GameLog: поле state.log не читают и не
        // режут руками ни правила, ни панель.
        const re = /\bstate\.log\b/g;
        let m;
        while ((m = re.exec(text))) {
            const line = text.slice(0, m.index).split('\n').length;
            offenders.push(file + ':' + line);
        }
    }
    if (offenders.length) throw new Error(offenders.slice(0, 4).join('; '));
    ok('журнал игры спрашивают у GameLog');
} catch (e) {
    fail(e.message);
}

// --- the dice and the ids of a game: one object -------------------------------
section('броски и идентификаторы: один объект');
try {
    const owners = new Set(['js/fs/core/FSChance.js']);
    const offenders = [];
    for (const file of htmlFiles().filter(f => f.endsWith('.js') && !f.startsWith('libs/'))) {
        if (owners.has(file)) continue;
        const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
        // Генератор партии и счётчик идентификаторов — один объект Chance:
        // числа state.rng/state.uid не трогают руками ни правила, ни доска.
        const re = /\bstate\.(?:rng|uid)\b/g;
        let m;
        while ((m = re.exec(text))) {
            const line = text.slice(0, m.index).split('\n').length;
            offenders.push(file + ':' + line);
        }
    }
    if (offenders.length) throw new Error(offenders.slice(0, 4).join('; '));
    ok('броски и идентификаторы спрашивают у Chance');
} catch (e) {
    fail(e.message);
}

// --- a test battle: one object ------------------------------------------------
section('тестовый бой: один объект');
try {
    const owners = new Set(['js/fs/core/FSBattleTest.js']);
    const offenders = [];
    for (const file of htmlFiles().filter(f => f.endsWith('.js') && !f.startsWith('libs/'))) {
        if (owners.has(file)) continue;
        const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
        // Тестовая партия и тестовый бой — один объект BattleTest: поля
        // state.testMode/state.testBattle не читают руками ни правила, ни панель.
        const re = /\b(?:state|s)\.test(?:Mode|Battle)\b/g;
        let m;
        while ((m = re.exec(text))) {
            const line = text.slice(0, m.index).split('\n').length;
            offenders.push(file + ':' + line);
        }
    }
    if (offenders.length) throw new Error(offenders.slice(0, 4).join('; '));
    ok('тестовый бой спрашивают у BattleTest');
} catch (e) {
    fail(e.message);
}

// --- the damage of an orbital strike: one object ------------------------------
section('урон с орбиты: один объект');
try {
    const owners = new Set(['js/fs/core/FSStrikeDamage.js']);
    const offenders = [];
    for (const file of htmlFiles().filter(f => f.endsWith('.js') && !f.startsWith('libs/'))) {
        if (owners.has(file)) continue;
        const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
        // Ожидающий урон орбитального удара — один объект StrikeDamage: поле
        // state.strike не читают руками ни правила, ни панель.
        const re = /\bstate\.strike\b/g;
        let m;
        while ((m = re.exec(text))) {
            const line = text.slice(0, m.index).split('\n').length;
            offenders.push(file + ':' + line);
        }
    }
    if (offenders.length) throw new Error(offenders.slice(0, 4).join('; '));
    ok('урон с орбиты спрашивают у StrikeDamage');
} catch (e) {
    fail(e.message);
}

// --- the event cards of a round: one object ----------------------------------
section('события раунда: один объект');
try {
    const owners = new Set(['js/fs/core/FSEventRound.js', 'js/fs/rules/SetupRules.js']);
    const offenders = [];
    for (const file of htmlFiles().filter(f => f.endsWith('.js') && !f.startsWith('libs/'))) {
        if (owners.has(file)) continue;
        const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
        // Сколько карт событий ещё не разыграно — один объект EventRound:
        // число state.eventsLeft не считают руками ни правила, ни снимок
        // «Быстрого ответа».
        const re = /\bstate\.eventsLeft\b/g;
        let m;
        while ((m = re.exec(text))) {
            const line = text.slice(0, m.index).split('\n').length;
            offenders.push(file + ':' + line);
        }
    }
    if (offenders.length) throw new Error(offenders.slice(0, 4).join('; '));
    ok('события раунда считает EventRound');
} catch (e) {
    fail(e.message);
}

// --- where the troops of an order came from: one object ----------------------
section('след ходов: один объект');
try {
    const owners = new Set(['js/fs/core/FSMarchTrail.js']);
    const offenders = [];
    for (const file of htmlFiles().filter(f => f.endsWith('.js') && !f.startsWith('libs/'))) {
        if (owners.has(file)) continue;
        const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
        // Откуда пришли отряды приказа (для отступления) — один объект
        // MarchTrail: список state.moves пишет только доска через него.
        const re = /\bstate\.moves\b/g;
        let m;
        while ((m = re.exec(text))) {
            const line = text.slice(0, m.index).split('\n').length;
            offenders.push(file + ':' + line);
        }
    }
    if (offenders.length) throw new Error(offenders.slice(0, 4).join('; '));
    ok('след ходов приказа спрашивают у MarchTrail');
} catch (e) {
    fail(e.message);
}

// --- the end of a game: one object -------------------------------------------
section('итог партии: один объект');
try {
    const owners = new Set(['js/fs/core/FSGameOutcome.js']);
    const offenders = [];
    for (const file of htmlFiles().filter(f => f.endsWith('.js') && !f.startsWith('libs/'))) {
        if (owners.has(file)) continue;
        const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
        // Конец партии и её победитель — один объект GameOutcome: поля
        // state.over/state.winner/state.shared не читают руками ни правила, ни
        // панель.
        const re = /\bstate\.(?:over|winner|shared)\b/g;
        let m;
        while ((m = re.exec(text))) {
            const line = text.slice(0, m.index).split('\n').length;
            offenders.push(file + ':' + line);
        }
    }
    if (offenders.length) throw new Error(offenders.slice(0, 4).join('; '));
    ok('итог партии спрашивают у GameOutcome');
} catch (e) {
    fail(e.message);
}

// --- the building of the board: one object -----------------------------------
section('сборка карты: один объект');
try {
    const owners = new Set(['js/fs/core/FSBoardSetup.js', 'js/fs/rules/SetupRules.js',
        'js/fs/core/FSGamePhase.js']);
    const offenders = [];
    for (const file of htmlFiles().filter(f => f.endsWith('.js') && !f.startsWith('libs/'))) {
        if (owners.has(file)) continue;
        const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
        // Этап сборки карты, чья рука играет и где ставятся силы — один объект
        // BoardSetup: поле state.setup не читают руками ни правила, ни доска,
        // ни панель. (В RuleSet сборки оно остаётся записью — это вид на доску
        // для одного места.)
        const re = /\bstate\.setup\b/g;
        let m;
        while ((m = re.exec(text))) {
            const line = text.slice(0, m.index).split('\n').length;
            offenders.push(file + ':' + line);
        }
    }
    if (offenders.length) throw new Error(offenders.slice(0, 4).join('; '));
    ok('этап сборки карты спрашивают у BoardSetup');
} catch (e) {
    fail(e.message);
}

// --- the question of a step: one object --------------------------------------
section('вопрос шага: один объект');
try {
    const owners = new Set(['js/fs/core/FSQuestion.js']);
    const offenders = [];
    for (const file of htmlFiles().filter(f => f.endsWith('.js') && !f.startsWith('libs/'))) {
        if (owners.has(file)) continue;
        const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
        // Остановленный вопрос шага (кто отвечает, где продолжать) — один объект
        // Question: поле state.pending не пишут и не читают руками.
        const re = /\bstate\.pending\b/g;
        let m;
        while ((m = re.exec(text))) {
            const line = text.slice(0, m.index).split('\n').length;
            offenders.push(file + ':' + line);
        }
    }
    if (offenders.length) throw new Error(offenders.slice(0, 4).join('; '));
    ok('вопрос шага спрашивают у Question');
} catch (e) {
    fail(e.message);
}

// --- «вместо раскрытия приказа»: one object ----------------------------------
section('план вместо приказа: один объект');
try {
    const owners = new Set(['js/fs/core/FSOrderScheme.js']);
    const offenders = [];
    for (const file of htmlFiles().filter(f => f.endsWith('.js') && !f.startsWith('libs/'))) {
        if (owners.has(file)) continue;
        const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
        // План, занявший место раскрытия приказа: предложение (один раз на
        // попытку) и согласие спрашивают у OrderScheme.
        const re = /\bstate\.(?:operationSchemeOffered|operationSchemeAccepted)\b/g;
        let m;
        while ((m = re.exec(text))) {
            const line = text.slice(0, m.index).split('\n').length;
            offenders.push(file + ':' + line);
        }
    }
    if (offenders.length) throw new Error(offenders.slice(0, 4).join('; '));
    ok('план вместо приказа спрашивают у OrderScheme');
} catch (e) {
    fail(e.message);
}

// --- the storm of an event: one object ---------------------------------------
section('шторм события: один объект');
try {
    const owners = new Set(['js/fs/core/FSStormPhase.js']);
    const offenders = [];
    for (const file of htmlFiles().filter(f => f.endsWith('.js') && !f.startsWith('libs/'))) {
        if (owners.has(file)) continue;
        const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
        // Сдвиг шторма по карте события, ответ «Молящегося» и подавление иконок
        // — один объект StormPhase: поля не читают руками.
        const re = /\bstate\.(?:stormReaction|chaosNoStormMove|chaosLastSystem)\b/g;
        let m;
        while ((m = re.exec(text))) {
            const line = text.slice(0, m.index).split('\n').length;
            offenders.push(file + ':' + line);
        }
    }
    if (offenders.length) throw new Error(offenders.slice(0, 4).join('; '));
    ok('шторм события спрашивают у StormPhase');
} catch (e) {
    fail(e.message);
}

// --- «Быстрый ответ»: one object ---------------------------------------------
section('быстрый ответ: один объект');
try {
    const owners = new Set(['js/fs/core/FSQuickResponse.js']);
    const offenders = [];
    for (const file of htmlFiles().filter(f => f.endsWith('.js') && !f.startsWith('libs/'))) {
        if (owners.has(file)) continue;
        const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
        // Фаза событий, приостановленная ради ограниченного продвижения: снимок
        // и ожидание спрашивают у QuickResponse.
        const re = /\bstate\.(?:quickResponsePending|quickResponseSnapshot)\b/g;
        let m;
        while ((m = re.exec(text))) {
            const line = text.slice(0, m.index).split('\n').length;
            offenders.push(file + ':' + line);
        }
    }
    if (offenders.length) throw new Error(offenders.slice(0, 4).join('; '));
    ok('«Быстрый ответ» спрашивают у QuickResponse');
} catch (e) {
    fail(e.message);
}

// --- the event of the refresh phase: one object -------------------------------
section('событие фазы: один объект');
try {
    const owners = new Set(['js/fs/core/FSEventPhase.js']);
    const offenders = [];
    for (const file of htmlFiles().filter(f => f.endsWith('.js') && !f.startsWith('libs/'))) {
        if (owners.has(file)) continue;
        const text = fs.readFileSync(file.startsWith('/') ? file : path.join(ROOT, file), 'utf8');
        // Событие фазы обновления — выбор карты, открытая карта и сдвинутый
        // шторм: его поля не читают руками ни правила, ни эффекты.
        const re = /\bstate\.event\.(?:seat|drawn|chosen|top|card|stormMoved)\b/g;
        let m;
        while ((m = re.exec(text))) {
            const line = text.slice(0, m.index).split('\n').length;
            offenders.push(file + ':' + line);
        }
    }
    if (offenders.length) throw new Error(offenders.slice(0, 4).join('; '));
    ok('событие фазы спрашивают у EventPhase');
} catch (e) {
    fail(e.message);
}

// --- who plays which side: one object ----------------------------------------
section('стороны боя: один объект');
try {
    const owners = new Set(['js/fs/core/FSCombatSides.js', 'js/fs/core/FSCombatBans.js',
        'js/fs/core/FSCombatApproach.js', 'js/fs/core/FSBattleField.js', 'js/fs/FSData.js']);
    const offenders = [];
    for (const file of htmlFiles().filter(f => f.endsWith('.js') && !f.startsWith('libs/'))) {
        if (owners.has(file)) continue;
        const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
        // «сторона места и место стороны» — перевод seat ↔ сторона живёт в
        // CombatSides: `c.attacker`/`c.defender` не читают руками.
        const re = /\b(?:state\.combat|s\.combat|combat|c|cbt)\.(?:attacker|defender)\b/g;
        let m;
        while ((m = re.exec(text))) {
            const line = text.slice(0, m.index).split('\n').length;
            offenders.push(file + ':' + line);
        }
    }
    if (offenders.length) throw new Error(offenders.slice(0, 4).join('; '));
    ok('стороны боя спрашивают у CombatSides');
} catch (e) {
    fail(e.message);
}

// --- how the attacker came: one object ---------------------------------------
section('приход в бой: один объект');
try {
    const owners = new Set(['js/fs/core/FSCombatApproach.js', 'js/fs/FSData.js']);
    const offenders = [];
    for (const file of htmlFiles().filter(f => f.endsWith('.js') && !f.startsWith('libs/'))) {
        if (owners.has(file)) continue;
        const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
        // «если отряды пришли не по приказу «Наступление», они отступают туда,
        // откуда пришли»: откуда и как — один вопрос CombatApproach.
        const re = /\b(?:state\.combat|s\.combat|combat|c|cbt)\.(?:attackerFrom|viaAdvance)\b/g;
        let m;
        while ((m = re.exec(text))) {
            const line = text.slice(0, m.index).split('\n').length;
            offenders.push(file + ':' + line);
        }
    }
    if (offenders.length) throw new Error(offenders.slice(0, 4).join('; '));
    ok('приход в бой спрашивают у CombatApproach');
} catch (e) {
    fail(e.message);
}

// --- how a battle ended: one object ------------------------------------------
section('итог боя: один объект');
try {
    const owners = new Set(['js/fs/core/FSCombatOutcome.js', 'js/fs/FSData.js']);
    const offenders = [];
    for (const file of htmlFiles().filter(f => f.endsWith('.js') && !f.startsWith('libs/'))) {
        if (owners.has(file)) continue;
        const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
        // «кто выиграл и кто отступает» — победившая сторона, проигравший seat
        // и мораль решения спрашиваются у одного объекта CombatOutcome.
        const re = /\b(?:state\.combat|s\.combat|combat|c|cbt)\.(?:winner|loser|morale)\b/g;
        let m;
        while ((m = re.exec(text))) {
            const line = text.slice(0, m.index).split('\n').length;
            offenders.push(file + ':' + line);
        }
    }
    if (offenders.length) throw new Error(offenders.slice(0, 4).join('; '));
    ok('итог боя спрашивают у CombatOutcome');
} catch (e) {
    fail(e.message);
}

// --- where a battle stands: one object ----------------------------------------
section('место боя: один объект');
try {
    const owners = new Set(['js/fs/core/FSBattleField.js', 'js/fs/FSData.js']);
    const offenders = [];
    for (const file of htmlFiles().filter(f => f.endsWith('.js') && !f.startsWith('libs/'))) {
        if (owners.has(file)) continue;
        const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
        // «эта область боя» — система и область вместе: и адрес, и вопрос «кто
        // здесь стоит» задают BattleField.
        const re = /\b(?:state\.combat|s\.combat|combat|c|cbt)\.(?:system|pos)\b/g;
        let m;
        while ((m = re.exec(text))) {
            const line = text.slice(0, m.index).split('\n').length;
            offenders.push(file + ':' + line);
        }
    }
    if (offenders.length) throw new Error(offenders.slice(0, 4).join('; '));
    ok('место боя спрашивают у BattleField');
} catch (e) {
    fail(e.message);
}

// --- what a battle forbids: one object ---------------------------------------
section('запреты боя: один объект');
try {
    const owners = new Set(['js/fs/core/FSCombatBans.js', 'js/fs/FSData.js']);
    const offenders = [];
    for (const file of htmlFiles().filter(f => f.endsWith('.js') && !f.startsWith('libs/'))) {
        if (owners.has(file)) continue;
        const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
        // «жетоны подкрепления противник не разыгрывает», «кубики атаки не
        // считаются» и «деморализованные уничтожаются» — три запрета одного
        // объекта CombatBans.
        const re = /\b(?:state\.combat|s\.combat|combat|c|cbt)\.(?:noReinforce|noReinforceSeat|ignoreFoeAtt|destroyRouted)\b/g;
        let m;
        while ((m = re.exec(text))) {
            const line = text.slice(0, m.index).split('\n').length;
            offenders.push(file + ':' + line);
        }
    }
    if (offenders.length) throw new Error(offenders.slice(0, 4).join('; '));
    ok('запреты боя спрашивают у CombatBans');
} catch (e) {
    fail(e.message);
}

// --- the cubes of a battle: one object --------------------------------------
section('жетоны карт бою: один объект');
try {
    const owners = new Set(['js/fs/core/FSCombatCubes.js', 'js/fs/core/FSCombatDamage.js', 'js/fs/FSData.js']);
    const offenders = [];
    for (const file of htmlFiles().filter(f => f.endsWith('.js') && !f.startsWith('libs/'))) {
        if (owners.has(file)) continue;
        const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
        // The `att.`/`def.` tokens the cards give and take and the damage the
        // round dealt are two counts of the battle, and each has one object:
        // CombatCubes and CombatDamage.
        const re = /\b(?:state\.combat|s\.combat|combat|c|cbt)\.(?:tokens|damage)\b/g;
        let m;
        while ((m = re.exec(text))) {
            const line = text.slice(0, m.index).split('\n').length;
            offenders.push(file + ':' + line);
        }
    }
    if (offenders.length) throw new Error(offenders.slice(0, 4).join('; '));
    ok('жетоны и урон карт спрашивают у CombatCubes и CombatDamage');
} catch (e) {
    fail(e.message);
}

section('паузы боя: один объект');
try {
    const owners = new Set(['js/fs/core/FSCombatHooks.js', 'js/fs/FSData.js']);
    const offenders = [];
    for (const file of htmlFiles().filter(f => f.endsWith('.js') && !f.startsWith('libs/'))) {
        if (owners.has(file)) continue;
        const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
        // The schemes asked once per side and per step, the step that waited for
        // them and the moments queued from the start of the combat are one
        // object: CombatHooks.
        const re = /\b(?:state\.combat|s\.combat|combat|c|cbt)\.(?:damageHook|criticalHook|damageEndHook|damageEndResume|damageResume|playHook|prepQueued|roundSchemeQueued|assignDamage|lastSpend|lastRetreat)\b/g;
        let m;
        while ((m = re.exec(text))) {
            const line = text.slice(0, m.index).split('\n').length;
            offenders.push(file + ':' + line);
        }
    }
    if (offenders.length) throw new Error(offenders.slice(0, 4).join('; '));
    ok('паузы боя спрашивают у CombatHooks');
} catch (e) {
    fail(e.message);
}

// --- the damage of a battle: one object -------------------------------------
section('урон боя: один объект');
try {
    const owners = new Set(['js/fs/core/FSCombatDamage.js', 'js/fs/core/FSCombatTurn.js', 'js/fs/FSData.js']);
    const offenders = [];
    for (const file of htmlFiles().filter(f => f.endsWith('.js') && !f.startsWith('libs/'))) {
        if (owners.has(file)) continue;
        const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
        // The health the cards grant, the damage they add, the bans and plans of
        // a round are one object: CombatDamage.
        const re = /\b(?:state\.combat|s\.combat|combat|c|cbt)\.(?:healthBonus|enemyHealth|extraDamage\w*|damageOneByOne|repeatDamage|damageRepeated|noRoute|ownRoutedDamage|damageFirst|ignoreExcess|retreatInstead|damageStartTokens|damageStartRound)\b/g;
        let m;
        while ((m = re.exec(text))) {
            const line = text.slice(0, m.index).split('\n').length;
            offenders.push(file + ':' + line);
        }
    }
    if (offenders.length) throw new Error(offenders.slice(0, 4).join('; '));
    ok('урон боя считают у CombatDamage');
} catch (e) {
    fail(e.message);
}

// --- the cards of a battle: one object --------------------------------------
section('карты боя: один объект');
try {
    const owners = new Set(['js/fs/core/FSCombatCards.js', 'js/fs/FSData.js']);
    const offenders = [];
    for (const file of htmlFiles().filter(f => f.endsWith('.js') && !f.startsWith('libs/'))) {
        if (owners.has(file)) continue;
        const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
        // The hand and the open cards of a side, the card that lies face down,
        // what the damage of a step did and the card an opponent has seen are one
        // object: CombatCards.
        const re = /\b(?:state\.combat|s\.combat|combat|c|cbt)\.(?:cards|staged|applied|peek|chosen)\b/g;
        let m;
        while ((m = re.exec(text))) {
            const line = text.slice(0, m.index).split('\n').length;
            offenders.push(file + ':' + line);
        }
    }
    if (offenders.length) throw new Error(offenders.slice(0, 4).join('; '));
    ok('карты боя спрашивают у CombatCards');
} catch (e) {
    fail(e.message);
}

// --- the turn of a battle: one object ---------------------------------------
section('ход боя: один объект');
try {
    const owners = new Set(['js/fs/core/FSCombatTurn.js', 'js/fs/FSData.js']);
    const offenders = [];
    for (const file of htmlFiles().filter(f => f.endsWith('.js') && !f.startsWith('libs/'))) {
        if (owners.has(file)) continue;
        const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
        // The round of the battle, the step it is at, the step it waits to take
        // and the dice on the table are one object: CombatTurn.
        const re = /\b(?:state\.combat|s\.combat|combat|c|cbt)\.(?:step|nextStep|round|maxRounds|dice)\b/g;
        let m;
        while ((m = re.exec(text))) {
            const line = text.slice(0, m.index).split('\n').length;
            offenders.push(file + ':' + line);
        }
    }
    if (offenders.length) throw new Error(offenders.slice(0, 4).join('; '));
    ok('раунд, шаг и кубики боя спрашивают у CombatTurn');
} catch (e) {
    fail(e.message);
}

// --- the tokens of a battle: one object -------------------------------------
section('жетоны боя: один объект');
try {
    const owners = new Set(['js/fs/core/FSCombatTokens.js', 'js/fs/FSData.js']);
    const offenders = [];
    for (const file of htmlFiles().filter(f => f.endsWith('.js') && !f.startsWith('libs/'))) {
        if (owners.has(file)) continue;
        const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
        // How many tokens a side placed, which of them are routed or destroyed,
        // how many the step has spent and whether it waits for a scheme are one
        // object: CombatTokens.
        const re = /\b(?:state\.combat|s\.combat|combat|c)\.(?:reinforceFree|reinforceRouted|reinforceUsed|reinforceHook|reinforcePending|reinforceFlipped|reinforceDestroyed)\b/g;
        let m;
        while ((m = re.exec(text))) {
            const line = text.slice(0, m.index).split('\n').length;
            offenders.push(file + ':' + line);
        }
    }
    if (offenders.length) throw new Error(offenders.slice(0, 4).join('; '));
    ok('жетоны боя считают у CombatTokens');
} catch (e) {
    fail(e.message);
}

// --- what an order gained and promised: one object --------------------------
section('итог приказа: один объект');
try {
    const owners = new Set(['js/fs/core/FSOrderTally.js', 'js/fs/FSData.js']);
    const offenders = [];
    for (const file of htmlFiles().filter(f => f.endsWith('.js') && !f.startsWith('libs/'))) {
        if (owners.has(file)) continue;
        const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
        // What a dominate order granted, what it still owes the player and what
        // it promised to its battle are one object: OrderTally.
        const re = /\b(?:state\.order|s\.order|order)\.(?:gained|prosperity|ability|finishAfterEffect|chaosDeckBonus|chaosCombatMorale|combatReinforce)\b/g;
        let m;
        while ((m = re.exec(text))) {
            const line = text.slice(0, m.index).split('\n').length;
            offenders.push(file + ':' + line);
        }
    }
    if (offenders.length) throw new Error(offenders.slice(0, 4).join('; '));
    ok('итог приказа спрашивают у OrderTally');
} catch (e) {
    fail(e.message);
}

// --- where an order lets its units march: one object ------------------------
section('пути приказа: один объект');
try {
    const owners = new Set(['js/fs/core/FSOrderMove.js', 'js/fs/FSData.js']);
    const offenders = [];
    for (const file of htmlFiles().filter(f => f.endsWith('.js') && !f.startsWith('libs/'))) {
        if (owners.has(file)) continue;
        const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
        // What the card of an advance lets the units cross (one area of origin,
        // storms, empty voids, the way they came) is one object: OrderMove.
        const re = /\b(?:state\.order|s\.order|order)\.(?:moveAreaLimit|passVoid|unitsThroughStorms|shipsThroughStorms|ways|preAdvance|quickResponse|fromEvent)\b/g;
        let m;
        while ((m = re.exec(text))) {
            const line = text.slice(0, m.index).split('\n').length;
            offenders.push(file + ':' + line);
        }
    }
    if (offenders.length) throw new Error(offenders.slice(0, 4).join('; '));
    ok('пути приказа спрашивают у OrderMove');
} catch (e) {
    fail(e.message);
}

// --- what an order has bought: one object -----------------------------------
section('покупки развёртывания: один список');
try {
    const owners = new Set(['js/fs/core/FSPurchases.js', 'js/fs/FSData.js']);
    const offenders = [];
    for (const file of htmlFiles().filter(f => f.endsWith('.js') && !f.startsWith('libs/'))) {
        if (owners.has(file)) continue;
        const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
        // The list of what an order bought is one object: the deploy limit, the
        // one structure and the panel ask Purchases, they do not push by hand.
        const re = /\b(?:state\.order|s\.order|order)\.purchases\b/g;
        let m;
        while ((m = re.exec(text))) {
            const line = text.slice(0, m.index).split('\n').length;
            offenders.push(file + ':' + line);
        }
    }
    if (offenders.length) throw new Error(offenders.slice(0, 4).join('; '));
    ok('список покупок приказа спрашивают у Purchases');
} catch (e) {
    fail(e.message);
}

// --- what an order lends to its battle: one object ---------------------------
section('помощь приказа бою: один объект');
try {
    const owners = new Set(['js/fs/core/FSOrderFight.js', 'js/fs/FSData.js']);
    const offenders = [];
    for (const file of htmlFiles().filter(f => f.endsWith('.js') && !f.startsWith('libs/'))) {
        if (owners.has(file)) continue;
        const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
        // What an order lends to its battle (command level, the preparation, the
        // extra cards, one round, the excess, the temporary materiel) is one
        // object: the rules and the cards ask OrderFight.
        const re = /\b(?:state\.order|s\.order|order)\.(?:klBonus|prepReroll|prepDrawCards|extraCombatCards|combatRounds|retreatExcessUnits|tempMateriel|tempBefore|tempAdded)\b/g;
        let m;
        while ((m = re.exec(text))) {
            const line = text.slice(0, m.index).split('\n').length;
            offenders.push(file + ':' + line);
        }
    }
    if (offenders.length) throw new Error(offenders.slice(0, 4).join('; '));
    ok('помощь приказа бою спрашивают у OrderFight');
} catch (e) {
    fail(e.message);
}

// --- what an order does to the deploy limit: one object ---------------------
section('предел и вместимость приказа: один объект');
try {
    const owners = new Set(['js/fs/core/FSDeployLimits.js', 'js/fs/FSData.js']);
    const offenders = [];
    for (const file of htmlFiles().filter(f => f.endsWith('.js') && !f.startsWith('libs/'))) {
        if (owners.has(file)) continue;
        const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
        // The bonus of the limit, the extra factories, "cities as factories" and
        // the capacity of a city world are one object: a rule asks DeployLimits.
        const re = /\b(?:state\.order|s\.order|order)\.(?:deployLimitBonus|extraFactories|citiesAsFactories|bastionsAsFactories|factoryOnly|deployInFactoryWorld|capacityBonus|capacityMax|capacityBonusOnly)\b/g;
        let m;
        while ((m = re.exec(text))) {
            const line = text.slice(0, m.index).split('\n').length;
            offenders.push(file + ':' + line);
        }
    }
    if (offenders.length) throw new Error(offenders.slice(0, 4).join('; '));
    ok('предел и вместимость приказа спрашивают у DeployLimits');
} catch (e) {
    fail(e.message);
}

// --- where an order may deploy: one object ----------------------------------
section('пределы развёртывания приказа: один объект');
try {
    const owners = new Set(['js/fs/core/FSDeployScope.js', 'js/fs/FSData.js']);
    const offenders = [];
    for (const file of htmlFiles().filter(f => f.endsWith('.js') && !f.startsWith('libs/'))) {
        if (owners.has(file)) continue;
        const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
        // The producing factory, the locked type and the one area of a limited
        // deployment are one object: a rule and the panel ask DeployScope.
        const re = /\b(?:state\.order|s\.order|order|ord)\.(?:guardFactory|unitsLocked|deployAreas|deployAreaLimit)\b/g;
        let m;
        while ((m = re.exec(text))) {
            const line = text.slice(0, m.index).split('\n').length;
            offenders.push(file + ':' + line);
        }
    }
    if (offenders.length) throw new Error(offenders.slice(0, 4).join('; '));
    ok('пределы развёртывания спрашивают у DeployScope');
} catch (e) {
    fail(e.message);
}

// --- the deal of an order: one object ---------------------------------------
section('скидки и сделки приказа: один объект');
try {
    const owners = new Set(['js/fs/core/FSDeal.js', 'js/fs/FSData.js']);
    const offenders = [];
    for (const file of htmlFiles().filter(f => f.endsWith('.js') && !f.startsWith('libs/'))) {
        if (owners.has(file)) continue;
        const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
        // The discounts and the deals of an order are one object: the price of
        // a unit and of a structure ask OrderDeal, they do not read the fields.
        const re = /\b(?:state\.order|s\.order|order)\.(?:discount|purchaseDiscount|cheapUnit|cheapUnitOnly|cheapUnitUsed|freeStructure|freeStructureKind|structureFirst)\b/g;
        let m;
        while ((m = re.exec(text))) {
            const line = text.slice(0, m.index).split('\n').length;
            offenders.push(file + ':' + line);
        }
    }
    if (offenders.length) throw new Error(offenders.slice(0, 4).join('; '));
    ok('скидки и сделки приказа спрашивают у OrderDeal');
} catch (e) {
    fail(e.message);
}

// --- the purchases of a strategize order: one object ------------------------
section('покупки улучшений: один объект');
try {
    const owners = new Set(['js/fs/core/FSUpgrades.js', 'js/fs/FSData.js']);
    const offenders = [];
    for (const file of htmlFiles().filter(f => f.endsWith('.js') && !f.startsWith('libs/'))) {
        if (owners.has(file)) continue;
        const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
        // The bought cards and their receipts (for the refund) are one object:
        // a rule or the panel asks UpgradeOrder, it does not read the fields.
        const re = /\b(?:state\.order|s\.order|order)\.(?:upgradesBought|upgradeLimit|combatUpgrade|combatBuy|orderUpgrade|orderUpgradeName|orderBuy)\b/g;
        let m;
        while ((m = re.exec(text))) {
            const line = text.slice(0, m.index).split('\n').length;
            offenders.push(file + ':' + line);
        }
    }
    if (offenders.length) throw new Error(offenders.slice(0, 4).join('; '));
    ok('купленные улучшения пишет только UpgradeOrder');
} catch (e) {
    fail(e.message);
}

// --- the step of an order: one object ---------------------------------------
section('шаг приказа: один объект');
try {
    const owners = new Set(['js/fs/core/FSPhase.js', 'js/fs/FSData.js']);
    const offenders = [];
    for (const file of htmlFiles().filter(f => f.endsWith('.js') && !f.startsWith('libs/'))) {
        if (owners.has(file)) continue;
        const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
        // `order.phase` is a small machine: its steps are compared by name in
        // one place, never with a literal in a rule or in the panel.
        // `state.phase` is the phase of the round and `view.phase` its copy in
        // the panel — they are this guard's own `state.phase`/`view.phase`
        // strings, which the regex reads as `state.phase` with a prefix. The
        // step of an order is the only other `phase` that is written and read.
        // `s.phase` is the phase of the round too (`s` is the state there), so
        // only the names an order goes by are looked for.
        const re = /\.order\.phase\b|(?:^|[^.\w])order\.phase\b|\b(?:ord|main|pre)\.phase\b/gm;
        let m;
        while ((m = re.exec(text))) {
            const line = text.slice(0, m.index).split('\n').length;
            offenders.push(file + ':' + line);
        }
    }
    if (offenders.length) throw new Error(offenders.slice(0, 4).join('; '));
    ok('шаг приказа спрашивают у PhasePlan');
} catch (e) {
    fail(e.message);
}

// --- the march of an advance: one object ------------------------------------
section('марш наступления: один объект');
try {
    const owners = new Set(['js/fs/core/FSMarch.js', 'js/fs/FSData.js']);
    const offenders = [];
    for (const file of htmlFiles().filter(f => f.endsWith('.js') && !f.startsWith('libs/'))) {
        if (owners.has(file)) continue;
        const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
        // The march of an order (the step, the frozen roads, the marched units,
        // the undo stack, the contested area) is one object: FSMarch.js.
        const re = /\border\.(?:moved|route|moveStep|steps|contested|moveLimit|mustInclude|uncontrolledUsed|excludedUnit|preAdvanceUnit)\b\s*(?:[-+*\/]?=(?!=)|\.\w+\s*\()/g;
        let m;
        while ((m = re.exec(text))) {
            const line = text.slice(0, m.index).split('\n').length;
            offenders.push(file + ':' + line);
        }
    }
    if (offenders.length) throw new Error(offenders.slice(0, 4).join('; '));
    ok('поля марша пишет только MarchPlan');
} catch (e) {
    fail(e.message);
}

// --- an orbital strike: one object -------------------------------------------
section('орбитальный удар: один объект');
try {
    const owners = new Set(['js/fs/core/FSStrike.js', 'js/fs/FSData.js']);
    const offenders = [];
    for (const file of htmlFiles().filter(f => f.endsWith('.js') && !f.startsWith('libs/'))) {
        if (owners.has(file)) continue;
        const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
        // The sixteen fields of the strike of an order are one object: a rule or
        // a card asks StrikePlan, nobody writes `order.strikeBonus` by hand.
        const re = /\border\.strike[A-Z]\w*\s*(?:[-+*\/]?=(?!=)|\.\w+\s*\()/g;
        let m;
        while ((m = re.exec(text))) {
            const line = text.slice(0, m.index).split('\n').length;
            offenders.push(file + ':' + line);
        }
    }
    if (offenders.length) throw new Error(offenders.slice(0, 4).join('; '));
    ok('поля удара пишет только StrikePlan');
} catch (e) {
    fail(e.message);
}

// --- materiel: one account --------------------------------------------------
section('материя: одно место учёта');
try {
    const owners = new Set(['js/fs/core/FSPlayers.js', 'js/fs/FSData.js']);
    const offenders = [];
    for (const file of htmlFiles().filter(f => f.endsWith('.js') && !f.startsWith('libs/'))) {
        if (owners.has(file)) continue;
        const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
        // The materiel dial (and its limit of 14) belongs to PlayerEntity: a rule
        // pays with payMateriel and gains with gainMateriel, never by hand.
        // A write to the field of a player: `p.materiel -= 2`. A local variable
        // (`const materiel = …`) and the materiel printed on a world are reads.
        const re = /\b[A-Za-z_$][\w$]*\.materiel\s*(?:[-+]?=(?!=))/g;
        let m;
        while ((m = re.exec(text))) {
            const line = text.slice(0, m.index).split('\n').length;
            offenders.push(file + ':' + line);
        }
    }
    if (offenders.length) throw new Error(offenders.slice(0, 5).join('; '));
    ok('материю начисляет и списывает только PlayerEntity');
} catch (e) {
    fail(e.message);
}

// --- a structure on a world: one question -----------------------------------
section('постройка на мире: одно правило');
try {
    const offenders = [];
    // «A world cannot contain more than one structure unless a card or faction
    // ability specifically states otherwise» is answered by canPlaceStructure,
    // with the permission of the card in its hand. The board only lists what
    // stands there; the setup and the rule itself may count.
    const owners = new Set(['js/fs/rules/DeployRules.js', 'js/fs/core/FSBoard.js', 'js/fs/FSCards.js']);
    const files = [];
    const walk = dir => {
        for (const name of fs.readdirSync(path.join(ROOT, dir))) {
            const rel = dir + '/' + name;
            if (fs.statSync(path.join(ROOT, rel)).isDirectory()) walk(rel);
            else if (name.endsWith('.js')) files.push(rel);
        }
    };
    walk('js/fs');
    for (const file of files) {
        if (owners.has(file) || file === 'js/fs/FSData.js') continue;
        const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
        if (/R\.structuresAt\(|FS_RULES\.structuresAt\(/.test(text) && !/canPlaceStructure/.test(text)) {
            // A file that both counts the structures and asks the rule is fine.
        }
        // A count of the structures of a world is a place that asks the rule of
        // the structure; «стоит ли постройка» is Board.hasStructure.
        const re = /structuresAt\([^)]*\)\s*(?:\.length|\|\|\s*\[\]\s*\]?\.length)/g;
        let m;
        while ((m = re.exec(text))) {
            const line = text.slice(0, m.index).split('\n').length;
            offenders.push(file + ':' + line);
        }
    }
    if (offenders.length) throw new Error(offenders.slice(0, 4).join('; '));
    ok('можно ли ставить постройку, решает одно правило');
} catch (e) {
    fail(e.message);
}

// --- the subject layer answers the questions the rules ask -------------------
section('предметный слой');
try {
    const SIDES = engine('CombatSides');
    const BOARD = engine('Board');
    // Who is who in a battle, and the step of a side.
    const c = { attacker: 0, defender: 1 };
    if (SIDES.sideOf(c, 1) !== 'defender' || SIDES.sideOf(c, 2) !== null) throw new Error('сторона места');
    if (SIDES.seatOf(c, 'defender') !== 1 || SIDES.foe('defender') !== 'attacker') throw new Error('место стороны');
    if (SIDES.sideFromStep('damage-attacker') !== 'attacker'
        || SIDES.sideFromStep('round-end') !== 'defender') throw new Error('сторона шага');
    // The top of a pile of orders: only it may resolve.
    const st = R.newReadyGame({ seed: 5, players: seedPlayers() });
    const sys = st.systems[0];
    sys.tokens = [{ seat: 0, order: 'advance' }, { seat: 1, order: 'deploy' }];
    if (BOARD.of(st).topOrder(sys.id).seat !== 1) throw new Error('верх стопки приказов');
    if (R.availableOrders(st, 0).length !== 0 || R.availableOrders(st, 1).length !== 1) {
        throw new Error('доступные приказы не совпали с верхом стопки');
    }
    ok('стороны боя, верх стопки приказов и доступные приказы');
} catch (e) {
    fail(e.message);
}

// --- the client and the rules agree on the names -----------------------------
// The rules are split into services, so a method the panel calls may simply not
// be on the facade any more. TypeScript sees core/ and rules/ only, so this is
// the one check that looks at the seam the panel uses.
section('стык клиента и правил');
try {
    const clientFiles = htmlFiles().filter(f => f.startsWith('js/')
        && !f.startsWith('js/fs/core/') && !f.startsWith('js/fs/rules/'));
    const problems = [];
    let seen = 0;
    for (const file of clientFiles) {
        const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
        for (const m of text.matchAll(/FS_RULES\.([A-Za-z_]\w*)/g)) {
            seen++;
            const name = m[1];
            if (!(name in R)) problems.push(file + ': FS_RULES.' + name + ' нет');
        }
        for (const m of text.matchAll(/RULES\.([A-Za-z_]\w*)\s*\(/g)) {
            seen++;
            if (typeof R[m[1]] !== 'function') problems.push(file + ': R.' + m[1] + ' не функция');
        }
        for (const m of text.matchAll(/FS_CATALOG\.([A-Za-z_]\w*)/g)) {
            seen++;
            if (!(m[1] in CAT)) problems.push(file + ': FS_CATALOG.' + m[1] + ' нет');
        }
    }
    if (problems.length) throw new Error(problems.slice(0, 5).join('; '));
    ok(seen + ' обращений клиента к правилам и каталогу существуют');
} catch (e) {
    fail(e.message);
}

console.log('\n' + (failed
    ? C.red + C.b + '  Дым не прошёл: ' + failed + ' проверок.' + C.r
    : C.grn + C.b + '  Дым прошёл: игра грузится и раунд играется.' + C.r) + '\n');
process.exit(failed ? 1 : 0);
