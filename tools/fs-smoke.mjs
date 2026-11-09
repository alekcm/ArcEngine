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
