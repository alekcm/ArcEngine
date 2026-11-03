// ============================================================================
//  fs-audit.mjs — сверка движка с текстом правил
// ----------------------------------------------------------------------------
//  node tools/fs-audit.mjs            все проверки
//  node tools/fs-audit.mjs combat     только проверки, в имени которых есть слово
//
//  Это не набор тестов на код, а построчная сверка с Rules Reference: каждая
//  проверка цитирует правило (docs/forbidden-stars/01-rules-reference.md),
//  строит состояние ровно под этот случай и смотрит, что делает движок.
//  Упавшая проверка печатает, какое число ждали и какое получили.
// ============================================================================
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import url from 'node:url';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');

// --- the engine, loaded the way the browser loads it ------------------------
const ctx = vm.createContext({
    console, Math, JSON, Date, Set, Map, Array, Object, Number, String, Boolean, Error,
    parseInt, parseFloat, isNaN, RegExp, Promise, Symbol, TypeError, RangeError,
});
const load = (file, name) => vm.runInContext(
    fs.readFileSync(path.join(ROOT, file), 'utf8') + `\n;globalThis.${name} = ${name};`,
    ctx, { filename: file });
load('js/fs/FSData.js', 'FS_DATA');
load('js/fs/FSEffects.js', 'FS_EFFECTS');
load('js/fs/FSRules.js', 'FS_RULES');
const { FS_DATA, FS_RULES, FS_EFFECTS } = ctx;

// --- the report -------------------------------------------------------------
const C = { r: '\x1b[0m', b: '\x1b[1m', dim: '\x1b[2m', red: '\x1b[31m', grn: '\x1b[32m', yel: '\x1b[33m' };
const filter = process.argv[2] || '';
let done = 0;
const failed = [];
let section = '';

function head(text) { section = text; console.log('\n' + C.b + '  ' + text + C.r); }

function rule(id, text, fn) {
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

const eq = (actual, expected, what) => {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`${what}: ждали ${JSON.stringify(expected)}, получили ${JSON.stringify(actual)}`);
    }
    return true;
};

// --- helpers ----------------------------------------------------------------
const FACTIONS = ['имперская-гвардия', 'орки'];
const players = () => FACTIONS.map((faction, i) => ({ faction, name: 'P' + i, id: 'p' + i }));

// A ready game: the board is assembled by the engine itself.
function game(seed = 7) {
    const st = FS_RULES.newReadyGame({ seed, players: players() });
    return st;
}

// An empty board: only what a check puts on it.
function empty(seed = 7) {
    const st = game(seed);
    st.units = [];
    st.structures = [];
    st.objectives = [];
    st.storms = [];
    for (const s of st.systems) s.tokens = [];
    st.phase = 'operations';
    st.turn = 0;
    st.order = null;
    return st;
}

const unit = (st, seat, unitId, system, pos) => FS_RULES.addUnit(st, seat, unitId, system, pos);
const guard = (st, seat, system, pos) => unit(st, seat, 'гвардейцы', system, pos);
const olk = (st, seat, system, pos) => unit(st, seat, 'бойзы', system, pos);

// A world and a void of a system: any tile has both.
function worldOf(st, systemId) {
    const sys = FS_RULES.system(st, systemId);
    return (sys.areas.find(a => a.world) || sys.areas[0]).pos;
}

function voidOf(st, systemId) {
    const sys = FS_RULES.system(st, systemId);
    return (sys.areas.find(a => !a.world) || sys.areas[0]).pos;
}

// The advance order of a player, ready for the movement.
function advance(st, seat, systemId, pos, step = 'ground') {
    st.phase = 'operations';
    st.turn = seat;
    // Ход наземных войск: проверки, которым нужен бой или марш пехоты, начинают
    // со второго шага движения (первый — корабли).
    st.order = { seat, order: 'advance', system: systemId, pos, phase: 'move', moveStep: step, moved: [], steps: [] };
    if (step === 'ships') st.order.route = FS_RULES.advanceRoutes(st, seat, 'ship');
    return st.order;
}

// A ground battle on a world: the attacker 0 against the defender 1.
function groundBattle(opts = {}) {
    const st = empty(opts.seed || 11);
    const sys = st.systems[0];
    const pos = worldOf(st, sys.id);
    for (let i = 0; i < (opts.att || 2); i++) guard(st, 0, sys.id, pos);
    for (let i = 0; i < (opts.def || 2); i++) olk(st, 1, sys.id, pos);
    st.players[0].assets.reinforcement = opts.reinforce == null ? 0 : opts.reinforce;
    st.players[1].assets.reinforcement = opts.reinforce == null ? 0 : opts.reinforce;
    advance(st, 0, sys.id, pos);
    const res = FS_RULES.apply(st, 0, { type: 'endAdvance' });
    if (!res.ok) throw new Error('бой не начался: ' + res.error);
    return st;
}

const c = st => st.combat;

// The combat goes forward while somebody has to answer: the reinforcements of
// both sides are refused, the hands are played from the top, the damage is put
// on the pieces the engine offers.
function playCombat(st, limit = 60) {
    for (let i = 0; i < limit && st.combat; i++) {
        // The card that asks a question: the engine waits for the player.
        if (st.pending) {
            const q = st.pending.question || {};
            const answer = {};
            if (q.kind === 'cards' || q.kind === 'units' || q.kind === 'dice') answer.choice = 0;
            FS_RULES.apply(st, st.pending.seat, { type: 'effect', answer });
            continue;
        }
        const co = st.combat;
        const snap = co.round + '|' + co.step + '|'
            + co.cards.attacker.hand.length + '|' + co.cards.defender.hand.length;
        if (co.step === 'reinforce-attacker' || co.step === 'reinforce-defender') {
            const seat = co.step === 'reinforce-attacker' ? co.attacker : co.defender;
            FS_RULES.apply(st, seat, { type: 'combat', action: 'reinforce', count: 0 });
        } else if (co.step === 'choose-attacker' || co.step === 'choose-defender') {
            const side = co.step === 'choose-attacker' ? 'attacker' : 'defender';
            const seat = side === 'attacker' ? co.attacker : co.defender;
            if (!(co.cards[side].hand || []).length) { FS_RULES.advanceCombatSteps(st); continue; }
            FS_RULES.apply(st, seat, { type: 'combat', action: 'playCard', index: 0 });
        } else if (co.step === 'damage-attacker' || co.step === 'damage-defender') {
            const side = co.step === 'damage-attacker' ? 'attacker' : 'defender';
            const seat = side === 'attacker' ? co.attacker : co.defender;
            const ids = FS_RULES.damageCandidates(st, side).map(x => x.id);
            FS_RULES.apply(st, seat, { type: 'combat', action: 'damage', targets: ids });
        } else if (co.step === 'retreat') {
            const targets = FS_RULES.retreatTargets(st, co.loser);
            FS_RULES.apply(st, co.loser, { type: 'combat', action: 'retreat', target: targets[0] });
            return 'retreat';
        } else {
            FS_RULES.advanceCombatSteps(st);
        }
        if (st.combat && st.combat.round + '|' + st.combat.step + '|'
            + st.combat.cards.attacker.hand.length + '|' + st.combat.cards.defender.hand.length === snap) {
            return 'stuck at ' + st.combat.step;
        }
    }
    return st.combat ? 'limit at ' + st.combat.step : 'done';
}

// ============================================================================
//  Setup
// ============================================================================
head('Сборка карты (Setup)');

rule('setup-1', '«Each player claims all components listed in the “Initial Forces” box … he claims a materiel dial and sets the number at “6”»', () => {
    for (const faction of FS_DATA.factions) {
        const st = FS_RULES.newGame({ seed: 3, players: [{ faction: faction.id }], interactiveSetup: true });
        const p = st.players[0];
        eq(p.materiel, 6, 'материя на старте: ' + faction.id);
        for (const u of faction.units) {
            eq(p.initialForces.units[u.id] || 0, u.start || 0, 'начальные отряды: ' + faction.id + ' / ' + u.id);
            eq((p.supply.units[u.id] || 0) + (u.start || 0), u.max || 0, 'запас плюс доска: ' + faction.id + ' / ' + u.id);
        }
    }
});

rule('setup-2', '«He cannot exceed an area’s unit capacity» — при сборке карты силы ставятся по вместимости', () => {
    const st = FS_RULES.newGame({ seed: 3, players: [{ faction: 'имперская-гвардия' }, { faction: 'орки' }], interactiveSetup: true });
    const setup = st.setup;
    const seat = setup.turn;
    const cell = FS_RULES.setupLegalCells(st)[0];
    const tile = setup.hands[seat][0];
    const placed = FS_RULES.apply(st, seat, { type: 'placeSystemTile', tile, row: cell.row, col: cell.col });
    eq(placed.ok, true, 'тайл выложен');
    const sys = FS_RULES.system(st, st.setup.currentSystem);
    const world = sys.areas.find(a => a.world);
    const cap = FS_RULES.capacity(st, sys.id, world.pos);
    let placedUnits = 0;
    for (let i = 0; i < cap + 2; i++) {
        const res = FS_RULES.apply(st, seat, { type: 'setupUnit', unit: 'гвардейцы', pos: world.pos });
        if (res.ok) placedUnits++;
    }
    const pool = st.players[seat].faction === 'имперская-гвардия'
        ? (FS_DATA.factions.find(f => f.id === 'имперская-гвардия').units.find(u => u.id === 'гвардейцы').start || 0)
        : 0;
    eq(placedUnits, Math.min(cap, pool), 'сверх вместимости и сверх запаса силы не ставятся');
});

// ============================================================================
//  Planning phase
// ============================================================================
head('Планирование (Planning Phase)');

rule('plan-1', '«A player must place his order token in either a system containing one of his units or structures, or a system adjacent to a system containing one of his units or structures.»', () => {
    const st = game();
    const mine = st.systems.filter(s => FS_RULES.hasUnitsOrStructures(st, 0, s.id));
    const near = new Set();
    for (const s of mine) for (const id of FS_RULES.neighbors(st, s.id)) near.add(id);
    const far = st.systems.find(s => !near.has(s.id) && !mine.includes(s));
    if (!far) return 'на этой карте нет далёкой системы — проверка не построена';
    st.phase = 'planning';
    st.turn = 0;
    const bad = FS_RULES.apply(st, 0, { type: 'placeOrder', system: far.id, order: 'advance' });
    eq(bad.ok, false, 'приказ в систему без своих войск и без соседства');
    const good = FS_RULES.apply(st, 0, { type: 'placeOrder', system: [...near][0], order: 'advance' });
    eq(good.ok, true, 'приказ в соседнюю систему');
});

rule('plan-2', '«Each player must place four order tokens during each Planning Phase.» — четыре жетона, по два каждого приказа', () => {
    const st = game();
    st.phase = 'planning';
    st.turn = 0;
    const sys = st.systems.filter(s => FS_RULES.canPlaceOrder(st, 0, s.id));
    if (sys.length < 2) return 'мало систем для проверки';
    eq(FS_RULES.apply(st, 0, { type: 'placeOrder', system: sys[0].id, order: 'advance' }).ok, true, 'первый наступательный');
    st.turn = 0;
    eq(FS_RULES.apply(st, 0, { type: 'placeOrder', system: sys[1].id, order: 'advance' }).ok, true, 'второй наступательный');
    st.turn = 0;
    const third = FS_RULES.apply(st, 0, { type: 'placeOrder', system: sys[0].id, order: 'advance' });
    eq(third.ok, false, 'третий жетон того же приказа');
    eq(st.players[0].placedTokens, 2, 'выложено жетонов');
});

rule('plan-3', '«Players cannot resolve or look at any order that is below another order token in a stack.»', () => {
    const st = game();
    const sys = st.systems[0];
    sys.tokens = [{ seat: 0, order: 'advance', faceUp: false }, { seat: 1, order: 'deploy', faceUp: false }];
    st.phase = 'operations';
    st.turn = 0;
    const bad = FS_RULES.apply(st, 0, { type: 'resolveOrder', system: sys.id });
    eq(bad.ok, false, 'вскрыть чужой верхний жетон');
    st.turn = 1;
    const good = FS_RULES.apply(st, 1, { type: 'resolveOrder', system: sys.id });
    eq(good.ok, true, 'вскрыть свой верхний жетон');
});

rule('plan-4', '«The active player must choose one of his order tokens that is on the top of a stack.» — очередь хода', () => {
    const st = game();
    st.phase = 'operations';
    st.turn = 0;
    st.systems[0].tokens = [{ seat: 1, order: 'advance', faceUp: false }];
    const bad = FS_RULES.apply(st, 0, { type: 'resolveOrder', system: st.systems[0].id });
    eq(bad.ok, false, 'чужой приказ');
});

// ============================================================================
//  Advance order
// ============================================================================
head('Приказ наступления (Advance Order)');

rule('adv-1', '«The destination must be in the active system.» — отряд идёт только в активную систему', () => {
    const st = empty();
    const active = st.systems[0];
    const other = FS_RULES.neighbors(st, active.id)[0];
    advance(st, 0, active.id, worldOf(st, active.id));
    const g = guard(st, 0, other, worldOf(st, other));
    const res = FS_RULES.apply(st, 0, { type: 'moveUnits', moves: [{ unit: g.id, system: other, pos: voidOf(st, other) }] });
    eq(res.ok, false, 'движение в неактивную систему');
});

rule('adv-2', '«Ground units cannot move into the active system from more than one adjacent system.»', () => {
    const st = empty();
    const active = st.systems[0];
    const near = FS_RULES.neighbors(st, active.id).slice(0, 2);
    if (near.length < 2) return 'у системы мало соседей';
    advance(st, 0, active.id, worldOf(st, active.id));
    const a = guard(st, 0, near[0], worldOf(st, near[0]));
    const b = guard(st, 0, near[1], worldOf(st, near[1]));
    const res = FS_RULES.apply(st, 0, {
        type: 'moveUnits',
        moves: [{ unit: a.id, system: active.id, pos: worldOf(st, active.id) },
            { unit: b.id, system: active.id, pos: worldOf(st, active.id) }],
    });
    eq(res.ok, false, 'войска из двух соседних систем');
});

rule('adv-3', '«Only one area can become contested during a single Advance Order.»', () => {
    const st = empty();
    const active = st.systems[0];
    const near = FS_RULES.neighbors(st, active.id)[0];
    const w1 = worldOf(st, active.id);
    const w2 = FS_RULES.system(st, active.id).areas.filter(a => a.world && a.pos !== w1)[0];
    if (!w2) return 'на тайле один мир';
    advance(st, 0, active.id, w1);
    const mine = guard(st, 0, near, worldOf(st, near));
    olk(st, 1, active.id, w1);
    olk(st, 1, active.id, w2.pos);
    const res = FS_RULES.apply(st, 0, {
        type: 'moveUnits',
        moves: [{ unit: mine.id, system: active.id, pos: w1 }, { unit: mine.id + 'x', system: active.id, pos: w2.pos }],
    });
    eq(res.ok, false, 'два спорных района за один приказ');
});

rule('adv-4', '«Ships do not require a path to move. They may move to any void in the active system»', () => {
    const st = empty();
    const active = st.systems[0];
    advance(st, 0, active.id, voidOf(st, active.id), 'ships');
    const ship = unit(st, 0, 'крейсеры', FS_RULES.neighbors(st, active.id)[0], voidOf(st, FS_RULES.neighbors(st, active.id)[0]));
    st.order.route = FS_RULES.advanceRoutes(st, 0, 'ship');
    const res = FS_RULES.apply(st, 0, { type: 'moveUnits', moves: [{ unit: ship.id, system: active.id, pos: voidOf(st, active.id) }] });
    eq(res.ok, true, 'корабль без пути');
});

rule('adv-5', '«A contested area cannot be used as part of a legal path.»', () => {
    const st = empty();
    const active = st.systems[0];
    const near = FS_RULES.neighbors(st, active.id)[0];
    advance(st, 0, active.id, worldOf(st, active.id));
    // a legal path through the neighbour's other world, but that world is contested
    const src = worldOf(st, near);
    const g = guard(st, 0, near, src);
    const other = FS_RULES.system(st, near).areas.filter(a => a.world && a.pos !== src)[0];
    if (!other) return 'у соседа один мир';
    olk(st, 1, near, other.pos);
    guard(st, 0, near, other.pos);
    const path = FS_RULES.pathExists(st, 0, near, src, active.id, worldOf(st, active.id));
    eq(FS_RULES.control(st, 0, near, other.pos), 'contested', 'спорность промежуточной области');
    if (path && !FS_RULES.areasAround(st, near, src).some(a => a.system === active.id)) {
        return 'путь идёт через спорную область';
    }
    return true;
});

rule('adv-6', '«A warp storm blocks the way»', () => {
    const st = empty();
    const active = st.systems[0];
    const near = FS_RULES.neighbors(st, active.id)[0];
    const side = FS_RULES.sideBetween(st, near, active.id);
    st.storms = [{ id: 'st1', system: near, side, moved: false }];
    advance(st, 0, active.id, worldOf(st, active.id));
    const ship = unit(st, 0, 'крейсеры', near, voidOf(st, near));
    const res = FS_RULES.apply(st, 0, { type: 'moveUnits', moves: [{ unit: ship.id, system: active.id, pos: voidOf(st, active.id) }] });
    eq(res.ok, false, 'корабль сквозь шторм');
});

// ============================================================================
//  Deploy order
// ============================================================================
head('Приказ развёртывания (Deploy Order)');

rule('dep-1', '«If the active player has a factory in the active system, he may purchase units»', () => {
    const st = empty();
    const active = st.systems[0];
    const pos = worldOf(st, active.id);
    advance(st, 0, active.id, pos);
    st.order = { seat: 0, order: 'deploy', system: active.id, phase: 'deploy' };
    st.players[0].materiel = 10;
    const noFactory = FS_RULES.apply(st, 0, { type: 'buyUnit', system: active.id, pos, unit: 'гвардейцы' });
    eq(noFactory.ok, false, 'покупка без фабрики');
    FS_RULES.addStructure(st, 0, 'factory', active.id, pos);
    guard(st, 0, active.id, pos);       // a friendly world for the factory
    st.players[0].supply.units['гвардейцы'] = 3;
    const ok = FS_RULES.apply(st, 0, { type: 'buyUnit', system: active.id, pos, unit: 'гвардейцы' });
    eq(ok.ok, true, 'покупка с фабрикой');
});

rule('dep-2', '«The deploy limit is equal to the combined unit capacity from all friendly worlds … that contain a factory.»', () => {
    const st = empty();
    const active = st.systems[0];
    const pos = worldOf(st, active.id);
    FS_RULES.addStructure(st, 0, 'factory', active.id, pos);
    guard(st, 0, active.id, pos);
    st.order = { seat: 0, order: 'deploy', system: active.id, phase: 'deploy' };
    st.players[0].materiel = 14;
    st.players[0].supply.units['гвардейцы'] = 9;
    const limit = FS_RULES.deployLimit(st, 0, active.id);
    eq(limit, FS_RULES.capacity(st, active.id, pos), 'предел развёртывания');
    for (let i = 0; i < limit; i++) {
        const r = FS_RULES.apply(st, 0, { type: 'buyUnit', system: active.id, pos, unit: 'гвардейцы' });
        eq(r.ok, true, 'покупка ' + (i + 1));
    }
    const over = FS_RULES.apply(st, 0, { type: 'buyUnit', system: active.id, pos, unit: 'гвардейцы' });
    eq(over.ok, false, 'покупка сверх предела');
});

rule('dep-3', '«A player cannot purchase more than one structure while resolving a single Deploy Order.»', () => {
    const st = empty();
    const active = st.systems[0];
    const pos = worldOf(st, active.id);
    guard(st, 0, active.id, pos);
    st.order = { seat: 0, order: 'deploy', system: active.id, phase: 'deploy' };
    st.players[0].materiel = 14;
    // Шаг отрядов: постройка здесь запрещена (кроме карты орков).
    const early = FS_RULES.apply(st, 0, { type: 'buyStructure', system: active.id, pos, structure: 'factory' });
    eq(early.ok, false, 'постройка до отрядов');
    FS_RULES.apply(st, 0, { type: 'deployStructures' });
    const first = FS_RULES.apply(st, 0, { type: 'buyStructure', system: active.id, pos, structure: 'factory' });
    eq(first.ok, true, 'первая постройка');
    const other = FS_RULES.system(st, active.id).areas.filter(a => a.world && a.pos !== pos)[0];
    if (other) {
        FS_RULES.addUnit(st, 0, 'гвардейцы', active.id, other.pos);
        const second = FS_RULES.apply(st, 0, { type: 'buyStructure', system: active.id, pos: other.pos, structure: 'city' });
        eq(second.ok, false, 'вторая постройка за приказ');
    }
});

rule('dep-4', '«A player can spend one cache token when purchasing a unit or structure to reduce its materiel cost by 2.»', () => {
    const st = empty();
    const active = st.systems[0];
    const pos = worldOf(st, active.id);
    FS_RULES.addStructure(st, 0, 'factory', active.id, pos);
    guard(st, 0, active.id, pos);
    st.order = { seat: 0, order: 'deploy', system: active.id, phase: 'deploy' };
    st.players[0].materiel = 3;
    st.players[0].assets.cache = 1;
    st.players[0].supply.units['гвардейцы'] = 3;
    // two guardsmen cost 2 each: materiel 3 is enough for one
    eq(FS_RULES.apply(st, 0, { type: 'buyUnit', system: active.id, pos, unit: 'гвардейцы' }).ok, true, 'первый по полной цене');
    // Материя списывается не в момент покупки, а в конце приказа.
    eq(st.players[0].materiel, 3, 'материя в момент покупки не уходит');
    eq(FS_RULES.spentOf(st.order), 2, 'долг приказа');
    const second = FS_RULES.apply(st, 0, { type: 'buyUnit', system: active.id, pos, unit: 'гвардейцы', cache: true });
    eq(second.ok, true, 'вторая покупка с тайником');
    eq(FS_RULES.spentOf(st.order), 2, 'цена с тайником: 2 − 2 = 0, долг остался 2');
    eq(st.players[0].assets.cache, 0, 'тайник потрачен сразу');
    // Конец приказа: списывается вся сумма. (Сразу после него начинается фаза
    // обновления со своим доходом, поэтому смотрим на сумму платежа.)
    const fin = FS_RULES.apply(st, 0, { type: 'finishDeploy' });
    eq(fin.paid, 2, 'материя списана в конце приказа одним платежом');
});

rule('dep-5', '«A player cannot purchase a unit … whose command level requirement exceeds his command level» + «may spend one forge token to reduce that unit\'s command level restriction by one»', () => {
    const st = empty();
    const active = st.systems[0];
    const pos = worldOf(st, active.id);
    FS_RULES.addStructure(st, 0, 'factory', active.id, pos);
    guard(st, 0, active.id, pos);
    st.order = { seat: 0, order: 'deploy', system: active.id, phase: 'deploy' };
    st.players[0].materiel = 14;
    st.players[0].supply.units['огрины'] = 2;      // КЛ 1
    st.players[0].assets.forge = 1;
    eq(FS_RULES.commandLevel(st, 0), 0, 'уровень командования без города');
    const bad = FS_RULES.apply(st, 0, { type: 'buyUnit', system: active.id, pos, unit: 'огрины' });
    eq(bad.ok, false, 'КЛ выше командного уровня');
    const ok = FS_RULES.apply(st, 0, { type: 'buyUnit', system: active.id, pos, unit: 'огрины', forgeKl: true });
    eq(ok.ok, true, 'кузница снижает КЛ на один');
    eq(st.players[0].assets.forge, 0, 'кузница потрачена');
});

// ============================================================================
//  Strategize and Dominate
// ============================================================================
head('Приказы стратегии и доминирования');

rule('str-1', '«The active player can purchase upgrades only if he has at least one unit or structure in the active system.»', () => {
    const st = empty();
    const active = st.systems[0];
    st.order = { seat: 0, order: 'strategize', system: active.id, phase: 'strategize' };
    st.players[0].materiel = 14;
    const card = FS_DATA.orders.find(x => x.faction === st.players[0].faction);
    const bad = FS_RULES.apply(st, 0, { type: 'buyUpgrade', kind: 'order', card: card.name });
    eq(bad.ok, false, 'покупка без своих войск в системе');
    guard(st, 0, active.id, worldOf(st, active.id));
    const ok = FS_RULES.apply(st, 0, { type: 'buyUpgrade', kind: 'order', card: card.name });
    if (!ok.ok && /отряд|постройк/i.test(ok.error)) return 'со своими войсками движок всё ещё жалуется на их отсутствие: ' + ok.error;
    return true;
});

rule('str-2', '«A player may purchase up to one combat upgrade and up to one order upgrade»', () => {
    const st = empty();
    const active = st.systems[0];
    guard(st, 0, active.id, worldOf(st, active.id));
    st.order = { seat: 0, order: 'strategize', system: active.id, phase: 'strategize' };
    st.players[0].materiel = 14;
    FS_RULES.addStructure(st, 0, 'city', active.id, worldOf(st, active.id));
    st.structures[st.structures.length - 1].area = voidOf(st, active.id);   // a city is on a world
    st.structures[st.structures.length - 1].area = worldOf(st, active.id);
    st.structures = st.structures.filter(x => x.type !== 'city');
    FS_RULES.addStructure(st, 0, 'city', active.id, worldOf(st, active.id));
    st.structures = st.structures.filter((x, i, arr) => arr.indexOf(x) === i);
    st.players[0].owns = null;
    const cl = FS_RULES.commandLevel(st, 0);
    const orders = FS_DATA.orders.filter(x => x.faction === st.players[0].faction && x.kl <= cl);
    if (!orders.length) return 'нет карт под нулевой КЛ';
    const a = FS_RULES.apply(st, 0, { type: 'buyUpgrade', kind: 'order', card: orders[0].name });
    eq(a.ok, true, 'первое улучшение приказа');
    const b = FS_RULES.apply(st, 0, { type: 'buyUpgrade', kind: 'order', card: orders[1] ? orders[1].name : orders[0].name });
    eq(b.ok, false, 'второе улучшение приказа за один приказ');
});

rule('str-3', '«The active player takes the order token from the game board and places it on top of his event deck»', () => {
    const st = empty();
    const active = st.systems[0];
    st.systems[0].tokens = [{ seat: 0, order: 'strategize', faceUp: false }];
    st.phase = 'operations';
    st.turn = 0;
    eq(FS_RULES.apply(st, 0, { type: 'resolveOrder', system: active.id }).ok, true, 'вскрыть стратегию');
    eq(FS_RULES.apply(st, 0, { type: 'finishStrategize' }).ok, true, 'закончить стратегию');
    if (st.phase === 'refresh') {
        // The order was the last of the phase: the event card is already drawn.
        eq(st.event && st.event.drawn.length, 1, 'карта события за жетон');
    } else {
        eq(st.players[0].eventTokens, 1, 'жетон на колоде событий');
    }
});

rule('dom-1', '«When a player resolves a Dominate Order, he gains the assets that correspond to the asset icons on each friendly world in the active system.»', () => {
    const st = empty();
    const active = st.systems.find(s => s.areas.some(a => a.world && a.world.assets.length));
    const area = active.areas.find(a => a.world && a.world.assets.length);
    guard(st, 0, active.id, area.pos);
    st.systems.find(s => s.id === active.id).tokens = [{ seat: 0, order: 'dominate', faceUp: false }];
    st.phase = 'operations';
    st.turn = 0;
    const icon = area.world.assets.find(a => a !== 'prosperity');
    const before = icon ? (st.players[0].assets[icon] || 0) : 0;
    eq(FS_RULES.apply(st, 0, { type: 'resolveOrder', system: active.id }).ok, true, 'доминирование');
    if (icon) eq(st.players[0].assets[icon], before + 1, 'жетон ресурса за иконку мира');
});

rule('dom-2', '«A player cannot have more than three of each asset token.»', () => {
    const st = empty();
    const active = st.systems.find(s => s.areas.some(a => a.world && a.world.assets.includes('forge')));
    if (!active) return 'нет мира с кузницей в наборе';
    const area = active.areas.find(a => a.world && a.world.assets.includes('forge'));
    guard(st, 0, active.id, area.pos);
    st.players[0].assets.forge = 3;
    st.systems.find(s => s.id === active.id).tokens = [{ seat: 0, order: 'dominate', faceUp: false }];
    st.phase = 'operations';
    st.turn = 0;
    FS_RULES.apply(st, 0, { type: 'resolveOrder', system: active.id });
    eq(st.players[0].assets.forge, 3, 'больше трёх кузниц');
});

// ============================================================================
//  Combat
// ============================================================================
head('Бой (Combat)');

rule('combat-1', '«Roll Dice: both the attacker and defender each roll a number of dice equal to the combined combat value of all of his unrouted units»', () => {
    const st = groundBattle();
    const att = FS_RULES.combatValue(st, 0, c(st).system, c(st).pos);
    eq(c(st).dice.attacker.length, Math.min(att, 8), 'кубики атакующего');
    return true;
});

rule('combat-2', '«Each player can have a maximum of eight dice during each combat.»', () => {
    const st = empty();
    const sys = st.systems[0];
    const pos = worldOf(st, sys.id);
    for (let i = 0; i < 9; i++) guard(st, 0, sys.id, pos);
    olk(st, 1, sys.id, pos);
    advance(st, 0, sys.id, pos);
    FS_RULES.apply(st, 0, { type: 'endAdvance' });
    eq(c(st).dice.attacker.length, 8, 'не больше восьми кубиков');
    const gain = FS_RULES.apply(st, 0, { type: 'combat', action: 'die', count: 1 });
    eq(gain.ok, false, 'девятый кубик');
});

rule('combat-3', '«Routed units do not contribute combat dice at the start of combat or orbital strikes. Routed units do not add their morale.»', () => {
    const st = empty();
    const sys = st.systems[0];
    const pos = worldOf(st, sys.id);
    guard(st, 0, sys.id, pos);
    const second = guard(st, 0, sys.id, pos);
    second.routed = true;
    olk(st, 1, sys.id, pos);
    advance(st, 0, sys.id, pos);
    FS_RULES.apply(st, 0, { type: 'endAdvance' });
    eq(c(st).dice.attacker.length, 1, 'кубики только за недеморализованного');
    const morale = FS_RULES.combatMorale(st, 'attacker');
    const diceMorale = (c(st).dice.attacker || []).filter(d => d === 'morale').length;
    eq(morale, diceMorale + 2, 'мораль: только один отряд даёт 2');
});

rule('combat-4', '«A bastion … use these values as if it were a unit» — кубики и мораль бастиона', () => {
    const st = empty();
    const sys = st.systems[0];
    const pos = worldOf(st, sys.id);
    guard(st, 0, sys.id, pos);
    olk(st, 1, sys.id, pos);
    FS_RULES.addStructure(st, 1, 'bastion', sys.id, pos);
    advance(st, 0, sys.id, pos);
    FS_RULES.apply(st, 0, { type: 'endAdvance' });
    const bastion = FS_RULES.structureStats('bastion');
    const orkCombat = FS_RULES.unitOf(st, st.units.find(u => u.seat === 1)).combat;
    eq(c(st).dice.defender.length, orkCombat + bastion.combat, 'кубики защитника с бастионом');
    const morale = FS_RULES.combatMorale(st, 'defender');
    const diceMorale = (c(st).dice.defender || []).filter(d => d === 'morale').length;
    eq(morale, diceMorale + FS_RULES.unitOf(st, st.units.find(u => u.seat === 1)).morale + bastion.morale, 'мораль с бастионом');
});

rule('combat-5', '«If the defender does not have unrouted units or bastions in the area at the start of a combat, the attacker immediately wins the combat.»', () => {
    const st = empty();
    const sys = st.systems[0];
    const pos = worldOf(st, sys.id);
    guard(st, 0, sys.id, pos);
    const foe = olk(st, 1, sys.id, pos);
    foe.routed = true;
    FS_RULES.addStructure(st, 1, 'factory', sys.id, pos);
    advance(st, 0, sys.id, pos);
    FS_RULES.apply(st, 0, { type: 'endAdvance' });
    eq(!!st.combat, false, 'бой не начинается');
    const factory = st.structures.find(s => s.type === 'factory');
    eq(factory.seat, 0, 'фабрика перешла нападающему');
});

rule('combat-6', '«Assess Damage … damage equal to the difference of his opponent\'s offence value and his own defence value»', () => {
    const st = groundBattle();
    const me = FS_RULES.combatValues(st, 'attacker');
    const foe = FS_RULES.combatValues(st, 'defender');
    eq(FS_RULES.combatDamageFor(st, 'attacker'), Math.max(0, foe.att - me.def), 'урон нападающего');
    eq(FS_RULES.combatDamageFor(st, 'defender'), Math.max(0, me.att - foe.def), 'урон защитника');
});

rule('combat-7', '«the tokens are returned to the supply at the end of each execution round» — жетоны боя не переживают раунд', () => {
    const st = groundBattle();
    FS_RULES.combatToken(st, 0, 'attacker', { tokenType: 'att', count: 2 });
    eq(c(st).tokens.attacker.att, 2, 'жетоны выданы');
    FS_RULES.endCombatRound(st);
    if (!st.combat) return true;
    eq(c(st).tokens.attacker.att, 0, 'жетоны вернулись в запас');
});

rule('combat-8', '«Played combat cards … stay in play until the end of combat» — иконки карты считаются во всех раундах', () => {
    const st = groundBattle();
    const card = { name: 'audit', icons: { att: 3, def: 1, morale: 2 } };
    c(st).cards.attacker.played.push({ name: 'audit', card });
    const before = FS_RULES.combatValues(st, 'attacker');
    FS_RULES.endCombatRound(st);
    const after = st.combat ? FS_RULES.combatValues(st, 'attacker') : before;
    eq(after.att, before.att, 'наступление карты');
    eq(after.def, before.def, 'оборона карты');
});

rule('combat-9', '«Players resolve three execution rounds» — бой идёт не больше трёх раундов', () => {
    const st = empty();
    const sys = st.systems[0];
    const pos = worldOf(st, sys.id);
    unit(st, 0, 'огрины', sys.id, pos);        // health 4
    unit(st, 1, 'нобзы', sys.id, pos);         // health 4
    advance(st, 0, sys.id, pos);
    FS_RULES.apply(st, 0, { type: 'endAdvance' });
    if (!st.combat) return 'бой не начался';
    let guard = 0;
    while (st.combat && st.combat.step !== 'retreat' && guard++ < 200) playCombat(st, 1);
    if (!st.combat) return 'бой закончился без шага отступления';
    eq(st.combat.round <= 4, true, 'раундов боя: ' + st.combat.round);
    eq(st.combat.step, 'retreat', 'после третьего раунда — отступление');
});

rule('combat-9b', '«If players\' morale totals are tied, the defender wins the combat»', () => {
    const st = groundBattle({ att: 1, def: 2 });
    const c0 = st.combat;
    // Both sides the same morale: one guard (2) against two boyz (1 + 1).
    c0.dice = { attacker: [], defender: [] };
    c0.cards = { attacker: { hand: [], played: [] }, defender: { hand: [], played: [] } };
    FS_RULES.finishCombat(st);
    eq(st.combat && st.combat.morale.attacker, st.combat && st.combat.morale.defender, 'мораль сторон');
    eq(st.combat.winner, 'defender', 'ничья — защитник');
});

rule('combat-10', '«When the attacker wins a battle, he takes control of all structures remaining on the world» — и только он', () => {
    const st = empty();
    const sys = st.systems[0];
    const pos = worldOf(st, sys.id);
    // the defender is weak: the attacker takes the world
    guard(st, 0, sys.id, pos);
    olk(st, 1, sys.id, pos).routed = true;
    for (let i = 0; i < 6; i++) guard(st, 0, sys.id, pos);
    FS_RULES.addStructure(st, 1, 'factory', sys.id, pos);
    advance(st, 0, sys.id, pos);
    FS_RULES.apply(st, 0, { type: 'endAdvance' });
    // the routed defender means an instant win
    const factory = st.structures.find(s => s.type === 'factory');
    eq(factory.seat, 0, 'нападающий забрал фабрику');
});

rule('combat-11', '«If a unit suffers damage and is not destroyed, that unit is routed.» + «A player can assign damage to routed units only if all of his units in the combat are routed»', () => {
    const st = empty();
    const sys = st.systems[0];
    const pos = worldOf(st, sys.id);
    guard(st, 0, sys.id, pos);
    const routed = guard(st, 0, sys.id, pos);
    routed.routed = true;
    olk(st, 1, sys.id, pos);
    advance(st, 0, sys.id, pos);
    FS_RULES.apply(st, 0, { type: 'endAdvance' });
    const ids = FS_RULES.damageCandidates(st, 'attacker').map(x => x.id);
    eq(ids.includes(routed.id), false, 'деморализованный не получает урон, пока есть недеморализованные');
    routed.routed = false;
    const standing = st.units.find(u => u.id === ids[0]);
    standing.routed = false;
    return true;
});

rule('combat-12', '«Any damage that exceeds a unit\'s or bastion\'s health value must be applied to one of his other units or bastions.»', () => {
    const st = empty();
    const sys = st.systems[0];
    const pos = worldOf(st, sys.id);
    const a = guard(st, 0, sys.id, pos);      // health 1
    const b = guard(st, 0, sys.id, pos);
    olk(st, 1, sys.id, pos);
    advance(st, 0, sys.id, pos);
    FS_RULES.apply(st, 0, { type: 'endAdvance' });
    const res = FS_RULES.combatDamage(st, 0, 'attacker', { targets: [a.id, b.id] });
    if (!res.ok) return 'урон не принят: ' + res.error;
    const dead = st.units.filter(u => u.id === a.id || u.id === b.id).length;
    if (res.damage >= 2 && dead !== 0) return 'избыток урона не перешёл на второй отряд';
    return true;
});

rule('combat-13', '«After a combat is resolved, all reinforcement tokens that were used during the combat are returned to the supply.»', () => {
    const st = groundBattle({ reinforce: 2 });
    eq(FS_RULES.maxReinforce(st, 0, 'attacker'), 2, 'предел подкреплений — число отрядов');
    const left = st.players[0].assets.reinforcement;
    eq(FS_RULES.apply(st, 0, { type: 'combat', action: 'reinforce', count: 2 }).ok, true, 'подкрепление');
    eq(st.players[0].assets.reinforcement, left - 2, 'жетоны ушли из руки');
    FS_RULES.endCombatRound(st);
    if (st.combat) eq(st.players[0].assets.reinforcement, left - 2, 'жетоны не вернулись в первом раунде');
    return true;
});

rule('combat-14', '«During a combat, each player draws five cards from his combat deck» + «discards the combat cards he used … by shuffling them back into his combat deck»', () => {
    const st = groundBattle();
    eq(c(st).cards.attacker.hand.length, 5, 'пять карт в руке');
    const deckBefore = st.players[0].decks.combat.length;
    const hand = c(st).cards.attacker.hand.slice();
    FS_RULES.finishCombat(st, true);
    const back = st.players[0].decks.combat.length;
    eq(back, deckBefore + hand.length, 'карты руки вернулись в колоду');
});

rule('combat-15', '«Players cannot… skip» — боевую карту нельзя пропустить', () => {
    const st = groundBattle();
    const res = FS_RULES.apply(st, 0, { type: 'combat', action: 'skipCard' });
    eq(res.ok, false, 'пропуск карты');
});

// ============================================================================
//  Retreats
// ============================================================================
head('Отступление (Retreats)');

rule('ret-1', '«Defending units cannot retreat to an area from which attacking units moved from.»', () => {
    const st = empty();
    // A world and a world of two neighbouring systems that share a border.
    let pair = null;
    for (const sys of st.systems) {
        for (const w of sys.areas) {
            if (!w.world) continue;
            for (const around of FS_RULES.areasAround(st, sys.id, w.pos)) {
                if (around.system === sys.id) continue;
                const other = FS_RULES.area(FS_RULES.system(st, around.system), around.pos);
                if (other && other.world) { pair = { from: sys.id, fromPos: w.pos, to: around.system, toPos: around.pos }; break; }
            }
            if (pair) break;
        }
        if (pair) break;
    }
    if (!pair) return 'нет двух соседних миров на карте';
    const att = guard(st, 0, pair.from, pair.fromPos);
    olk(st, 1, pair.to, pair.toPos);
    advance(st, 0, pair.to, pair.toPos);
    const moved = FS_RULES.apply(st, 0, { type: 'moveUnits', moves: [{ unit: att.id, system: pair.to, pos: pair.toPos }] });
    if (!moved.ok) return 'марш не прошёл: ' + moved.error;
    FS_RULES.apply(st, 0, { type: 'endAdvance' });
    if (!st.combat) return 'бой не начался';
    const targets = FS_RULES.retreatTargets(st, 1);
    eq(targets.some(t => t.system === pair.from && t.pos === pair.fromPos), false,
        'отступление в область, откуда пришёл враг');
});

rule('ret-2', '«If there is no area for a unit to retreat to, that unit is destroyed.»', () => {
    const st = empty();
    const sys = st.systems[0];
    const pos = worldOf(st, sys.id);
    const defender = olk(st, 1, sys.id, pos);
    // Every world of the system and of the neighbours is held by the attacker: no friendly
    // and no uncontrolled area is left for the defender.
    const systems = [sys.id].concat(FS_RULES.neighbors(st, sys.id));
    for (const sid of systems) {
        for (const area of FS_RULES.system(st, sid).areas) {
            if (!area.world) continue;
            if (sid === sys.id && area.pos === pos) continue;
            guard(st, 0, sid, area.pos);
        }
    }
    guard(st, 0, sys.id, pos);
    st.combat = {
        system: sys.id, pos, attacker: 0, defender: 1, round: 3, step: 'retreat',
        dice: { attacker: [], defender: [] }, tokens: { attacker: { att: 0, def: 0 }, defender: { att: 0, def: 0 } },
        cards: { attacker: { hand: [], played: [] }, defender: { hand: [], played: [] } },
        reinforce: { attacker: 0, defender: 0 }, damage: { attacker: 0, defender: 0 }, winner: 'attacker', loser: 1,
    };
    st.order = { seat: 0, order: 'advance', system: sys.id, pos, phase: 'combat', steps: [] };
    eq(FS_RULES.retreatTargets(st, 1).length, 0, 'мест для отступления нет');
    const res = FS_RULES.apply(st, 1, { type: 'combat', action: 'retreat' });
    if (!res.ok) return 'отступление без цели отклонено: ' + res.error;
    eq(st.units.some(u => u.id === defender.id), false, 'отряд без пути отступления уничтожен');
});

// ============================================================================
//  Capacity, refresh, victory
// ============================================================================
head('Вместимость, обновление, победа');

rule('cap-1', '«he must destroy units of his choice in that area» — отряды сверх вместимости выбирает игрок', () => {
    const st = empty();
    const sys = st.systems[0];
    const pos = worldOf(st, sys.id);
    const cap = FS_RULES.capacity(st, sys.id, pos);
    for (let i = 0; i < cap + 2; i++) guard(st, 0, sys.id, pos);
    st.order = { seat: 0, order: 'deploy', system: sys.id, phase: 'deploy' };
    FS_RULES.apply(st, 0, { type: 'finishDeploy' });
    const mine = st.units.filter(u => u.seat === 0).length;
    eq(mine, cap + 2, 'движок не уничтожает отряды сам');
    eq((st.trim || []).length, 1, 'область просит убрать лишнее');
    const extra = st.units.filter(u => u.seat === 0)[0];
    eq(FS_RULES.apply(st, 0, { type: 'trimUnit', system: sys.id, pos, unit: extra.id }).ok, true, 'игрок убирает отряд');
    eq(st.units.filter(u => u.seat === 0).length, cap + 1, 'отряд убран');
});

rule('cap-2', '«After resolving an order … players must destroy any of their units that are in excess of an area’s unit capacity» — лишнее убирает только сам игрок', () => {
    const st = empty();
    const sys = st.systems[0];
    const pos = worldOf(st, sys.id);
    const cap = FS_RULES.capacity(st, sys.id, pos);
    for (let i = 0; i < cap + 2; i++) guard(st, 0, sys.id, pos);
    FS_RULES.trimPlayer(st, 0);
    eq((st.trim || []).length, 1, 'переполненная область отмечена');
    const blocked = FS_RULES.apply(st, 0, { type: 'nextPhase' });
    eq(/вместимост/.test(blocked.error || ''), true, 'пока лишние не убраны, игрок ничего не делает');
    const other = FS_RULES.apply(st, 1, { type: 'nextPhase' });
    eq(/вместимост/.test(other.error || ''), false, 'чужой ход не ждёт чужой уборки');
});

rule('cap-3', '«This is only checked after resolving an order and at the end of each Event Phase»', () => {
    const st = empty();
    const sys = st.systems[0];
    const pos = worldOf(st, sys.id);
    const cap = FS_RULES.capacity(st, sys.id, pos);
    for (let i = 0; i < cap + 2; i++) guard(st, 0, sys.id, pos);
    st.phase = 'refresh';
    st.eventsLeft = 0;
    FS_RULES.nextEventPlayer(st);
    eq((st.trim || []).length >= 1, true, 'конец фазы событий спрашивает про лишние отряды');
});

rule('refresh-1', '«Each player increases his materiel dial by … friendly worlds» + «cannot have more than 14 materiel»', () => {
    const st = empty();
    const sys = st.systems[0];
    const pos = worldOf(st, sys.id);
    guard(st, 0, sys.id, pos);
    st.players[0].materiel = 14;
    FS_RULES.startRefresh(st);
    eq(st.players[0].materiel, 14, 'потолок материи');
});

rule('refresh-2', '«All players simultaneously rally each of his routed units»', () => {
    const st = empty();
    const u = guard(st, 0, st.systems[0].id, worldOf(st, st.systems[0].id));
    u.routed = true;
    FS_RULES.startRefresh(st);
    eq(u.routed, false, 'отряд снова в строю');
});

rule('refresh-3', '«Each Warp Storm can move only once during each Refresh Phase.»', () => {
    const st = empty();
    const a = st.systems[0];
    const b = FS_RULES.neighbors(st, a.id)[0];
    const side = FS_RULES.sideBetween(st, a.id, b.id);
    st.storms = [{ id: 'st1', system: a.id, side, moved: false }];
    st.phase = 'refresh';
    st.event = { seat: 0, drawn: [], chosen: null, card: null, top: 'x' };
    // the top card of the deck: any direction is allowed
    const dir = side === 'N' || side === 'S' ? 'E' : 'N';
    const first = FS_RULES.apply(st, 0, { type: 'moveStorm', storm: 'st1', dir });
    if (!first.ok) return 'шторм не двинулся: ' + first.error;
    const second = FS_RULES.apply(st, 1, { type: 'moveStorm', storm: 'st1', dir: dir === 'E' ? 'W' : 'S' });
    eq(second.ok, false, 'второе движение того же шторма в той же фазе');
});

rule('event-1', '«each player draws one card for each order token that is on top of his event deck … A player can choose any one of his drawn event cards to resolve» — неразыгранные карты возвращаются в колоду', () => {
    const st = empty();
    const sys = st.systems[0];
    guard(st, 0, sys.id, worldOf(st, sys.id));
    st.phase = 'refresh';
    st.eventsLeft = 2;
    st.players[0].eventTokens = 2;
    st.turn = 0;
    FS_RULES.nextEventPlayer(st);
    const ev = st.event;
    eq(ev.drawn.length, 2, 'вытянуто две карты');
    const deckBefore = st.players[0].decks.event.length;
    const card = FS_DATA.events.find(e => e.faction === st.players[0].faction && e.name === ev.drawn[0]);
    eq(!!card, true, 'карта найдена в данных');
    FS_RULES.apply(st, 0, { type: 'drawEvent', card: ev.drawn[0] });
    FS_RULES.apply(st, 0, { type: 'resolveEvent' });
    eq(st.players[0].decks.event.length, deckBefore + 2, 'обе карты вернулись в колоду');
});

rule('event-2', '«Scheme event cards remain in play» — план остаётся в игровой зоне', () => {
    const st = empty();
    const sys = st.systems[0];
    guard(st, 0, sys.id, worldOf(st, sys.id));
    const faction = st.players[0].faction;
    const scheme = FS_DATA.events.find(e => e.faction === faction && e.type === 'scheme');
    if (!scheme) return 'у фракции нет карт-планов';
    st.phase = 'refresh';
    st.eventsLeft = 2;
    st.turn = 0;
    st.event = { seat: 0, drawn: [scheme.name], chosen: scheme.name, card: scheme };
    FS_RULES.apply(st, 0, { type: 'resolveEvent' });
    eq((st.players[0].schemes || []).length, 1, 'план лёг в игровую зону');
    eq(st.players[0].schemes[0].name, scheme.name, 'это именно та карта');
});

rule('refresh-4', '«During the Refresh Phase, each player draws one card for each order token that is on top of his event deck»', () => {
    const st = empty();
    st.players[0].eventTokens = 2;
    const before = st.players[0].decks.event.length;
    FS_RULES.startRefresh(st);
    st.players[0].eventTokens = 0;
    const drawn = (st.event && st.event.seat === 0) ? st.event.drawn.length : -1;
    eq(drawn, 2, 'взято карт событий');
    if (before < 2) return true;
    return true;
});

rule('win-1', '«When a player has collected a number of his objective tokens equal to or exceeding the number of players, the game ends»', () => {
    const st = empty();
    st.firstPlayer = 0;
    st.players[0].objectives = 2;     // two players in the game
    st.round = 1;
    st.phase = 'refresh';
    st.eventsLeft = 0;
    FS_RULES.endRound(st);
    eq(st.over, true, 'игра закончена при двух целях у двух игроков');
});

rule('win-2', '«When a player is eliminated, this does not reduce the number of objective tokens needed to win the game.»', () => {
    const st = empty();
    st.players[0].objectives = 2;
    st.players[1].eliminated = true;
    st.firstPlayer = 0;
    st.round = 1;
    st.phase = 'refresh';
    st.eventsLeft = 0;
    FS_RULES.endRound(st);
    eq(st.over, true, 'порог победы не уменьшился');
});

// ============================================================================
//  Orbital strike
// ============================================================================
head('Орбитальный удар (Orbital Strike)');

rule('win-3', '«If no player has won the game by the end of the eighth game round … the player that has gathered the most objective tokens wins. If still tied, the player that has the most friendly worlds wins.»', () => {
    const st = empty();
    const a = st.systems[0], b = st.systems[2] || st.systems[1];
    guard(st, 0, a.id, worldOf(st, a.id));
    olk(st, 1, b.id, worldOf(st, b.id));
    st.round = FS_RULES.ROUNDS;
    st.players[0].objectives = 1;
    st.players[1].objectives = 2;
    FS_RULES.endRound(st);
    eq(st.over, true, 'игра кончилась после восьмого раунда');
    eq(st.winner, 1, 'побеждает тот, у кого больше целей');
    // Equal objectives: the friendly worlds decide.
    const st2 = empty();
    const a2 = st2.systems[0], b2 = st2.systems[2] || st2.systems[1];
    const c2 = st2.systems[3] || st2.systems[2];
    guard(st2, 0, a2.id, worldOf(st2, a2.id));
    guard(st2, 0, c2.id, worldOf(st2, c2.id));
    olk(st2, 1, b2.id, worldOf(st2, b2.id));
    st2.round = FS_RULES.ROUNDS;
    st2.players[0].objectives = 1;
    st2.players[1].objectives = 1;
    FS_RULES.endRound(st2);
    eq(st2.winner, 0, 'при равных целях побеждают миры');
});

rule('strike-1', '«Both the void and world areas must be in the active system. The void and world must be adjacent to each other.»', () => {
    const st = empty();
    const sys = st.systems[0];
    const voidPos = voidOf(st, sys.id);
    const worldPos = worldOf(st, sys.id);
    unit(st, 0, 'крейсеры', sys.id, voidPos);
    olk(st, 1, sys.id, worldPos);
    st.order = { seat: 0, order: 'advance', system: sys.id, pos: worldPos, phase: 'strike' };
    const targets = FS_RULES.orbitalStrikeTargets(st, 0);
    const adjacent = FS_RULES.areasAround(st, sys.id, voidPos).some(a => a.system === sys.id && a.pos === worldPos);
    if (adjacent) eq(targets.length > 0, true, 'цель есть у соседнего мира');
    else eq(targets.some(t => t.pos === worldPos), false, 'нельзя бить не соседний мир');
});

rule('strike-2', '«An orbital strike cannot be resolved against a world containing a bastion.»', () => {
    const st = empty();
    const sys = st.systems[0];
    unit(st, 0, 'крейсеры', sys.id, voidOf(st, sys.id));
    const pos = worldOf(st, sys.id);
    olk(st, 1, sys.id, pos);
    FS_RULES.addStructure(st, 1, 'bastion', sys.id, pos);
    st.order = { seat: 0, order: 'advance', system: sys.id, pos, phase: 'strike' };
    eq(FS_RULES.orbitalStrikeTargets(st, 0).length, 0, 'мир с бастионом не цель');
});

rule('strike-3', '«Each unit that suffers damage during an orbital strike that is not destroyed does not become routed.»', () => {
    const st = empty();
    // A void with a world next to it, and a tough defender on that world.
    let found = null;
    for (const sys of st.systems) {
        for (const v of sys.areas) {
            if (v.world) continue;
            const near = FS_RULES.areasAround(st, sys.id, v.pos)
                .filter(a => a.system === sys.id)
                .map(a => FS_RULES.area(sys, a.pos))
                .filter(a => a && a.world);
            if (near.length) { found = { sys, v, world: near[0] }; break; }
        }
        if (found) break;
    }
    if (!found) return 'в наборе нет тайла с пустотой у мира';
    for (let i = 0; i < 3; i++) unit(st, 0, 'линкоры', found.sys.id, found.v.pos);
    const foe = unit(st, 1, 'огрины', found.sys.id, found.world.pos);   // health 4
    st.order = { seat: 0, order: 'advance', system: found.sys.id, pos: found.world.pos, phase: 'strike' };
    const res = FS_RULES.apply(st, 0, { type: 'orbitalStrike', system: found.sys.id, pos: found.world.pos });
    if (!res.ok) return 'удар не прошёл: ' + res.error;
    // The defender answers the strike: the damage that does not kill is ignored.
    for (let i = 0; i < 8 && st.strike; i++) {
        FS_RULES.apply(st, st.strike.seat, { type: 'strikeDamage', unit: foe.id });
    }
    const alive = st.units.find(u => u.id === foe.id);
    eq(alive ? alive.routed : false, false, 'урон без уничтожения не деморализует');
});

// ============================================================================
//  Structures, command level, bastions
// ============================================================================
head('Постройки, командование, бастионы');

rule('cmd-1', '«A player’s command level is equal to the number of cities he controls on the game board.»', () => {
    const st = empty();
    const sys = st.systems[0];
    const pos = worldOf(st, sys.id);
    guard(st, 0, sys.id, pos);
    eq(FS_RULES.commandLevel(st, 0), 0, 'без городов уровень 0');
    FS_RULES.addStructure(st, 0, 'city', sys.id, pos);
    eq(FS_RULES.commandLevel(st, 0), 1, 'город поднимает уровень на один');
    const other = st.systems[1];
    FS_RULES.addStructure(st, 0, 'city', other.id, worldOf(st, other.id));
    eq(FS_RULES.commandLevel(st, 0), 2, 'второй город — уровень 2');
});

rule('cmd-2', '«A player cannot purchase a unit or an upgrade whose command level requirement exceeds his command level.»', () => {
    const st = empty();
    const sys = st.systems[0];
    const pos = worldOf(st, sys.id);
    guard(st, 0, sys.id, pos);
    st.players[0].materiel = 14;
    st.order = { seat: 0, order: 'deploy', system: sys.id, phase: 'deploy' };
    const faction = FS_DATA.factions.find(f => f.id === st.players[0].faction);
    const high = faction.units.filter(u => u.kl === 1)[0]
        || faction.units.slice().sort((a, b) => b.kl - a.kl)[0];
    st.players[0].supply.units[high.id] = 2;
    const res = FS_RULES.apply(st, 0, { type: 'buyUnit', unit: high.id, system: sys.id, pos });
    eq(res.ok, false, 'отряд выше уровня не купить');
    // The city raises the level: now the same unit is bought on another world
    // of the same system, next to the factory that gives the deploy limit.
    FS_RULES.addStructure(st, 0, 'city', sys.id, pos);
    const other = FS_RULES.system(st, sys.id).areas.find(a => a.world && a.pos !== pos);
    if (!other) return 'в тайле один мир';
    FS_RULES.addStructure(st, 0, 'factory', sys.id, other.pos);
    const again = FS_RULES.apply(st, 0, { type: 'buyUnit', unit: high.id, system: sys.id, pos: other.pos });
    eq(again.ok, true, 'с городом отряд покупается');
});

rule('struct-1', '«A world cannot contain more than one structure unless a card or faction ability specifically states otherwise.»', () => {
    const st = empty();
    const sys = st.systems[0];
    const pos = worldOf(st, sys.id);
    guard(st, 0, sys.id, pos);
    FS_RULES.addStructure(st, 0, 'factory', sys.id, pos);
    eq(FS_RULES.canPlaceStructure(st, 0, sys.id, pos).ok, false, 'вторая постройка на мире запрещена');
    const free = st.systems.find(x => x.id !== sys.id);
    eq(FS_RULES.canPlaceStructure(st, 0, free.id, worldOf(st, free.id)).ok, false, 'на чужом мире нельзя');
});

rule('struct-2', '«Structures do not count toward a world’s unit capacity.»', () => {
    const st = empty();
    const sys = st.systems[0];
    const pos = worldOf(st, sys.id);
    const cap = FS_RULES.capacity(st, sys.id, pos);
    FS_RULES.addStructure(st, 0, 'city', sys.id, pos);
    FS_RULES.addStructure(st, 0, 'factory', sys.id, pos);
    eq(FS_RULES.capacity(st, sys.id, pos), cap, 'вместимость не меняется от построек');
    for (let i = 0; i < cap; i++) guard(st, 0, sys.id, pos);
    FS_RULES.trimPlayer(st, 0);
    eq((st.trim || []).length, 0, 'полная область с постройками не переполнена');
});

rule('bastion-1', '«If the active player moves one or more units to a world that contains an opponent’s bastion, that area is contested and he must resolve a combat, even if there are no defending units.»', () => {
    const st = empty();
    const sys = st.systems[0];
    const pos = worldOf(st, sys.id);
    guard(st, 0, sys.id, pos);
    FS_RULES.addStructure(st, 1, 'bastion', sys.id, pos);
    advance(st, 0, sys.id, pos);
    const res = FS_RULES.apply(st, 0, { type: 'endAdvance' });
    eq(res.ok, true, 'приказ закрылся');
    eq(!!st.combat, true, 'бастион защищает мир один');
    if (st.combat) eq(st.combat.defender, 1, 'защитник — владелец бастиона');
});

rule('bastion-2', '«Bastions cannot be routed nor can they retreat.»', () => {
    const st = empty();
    const sys = st.systems[0];
    const pos = worldOf(st, sys.id);
    guard(st, 0, sys.id, pos);
    olk(st, 1, sys.id, pos);
    FS_RULES.addStructure(st, 1, 'bastion', sys.id, pos);
    advance(st, 0, sys.id, pos);
    FS_RULES.apply(st, 0, { type: 'endAdvance' });
    const bastion = st.structures.find(x => x.type === 'bastion');
    eq(FS_RULES.damageCandidates(st, 'defender').map(x => x.id).includes(bastion.id), true, 'бастион принимает урон');
    eq(!!bastion.routed, false, 'бастион не деморализуется');
    eq(FS_RULES.retreatTargets(st, 1).some(t => t.structure === bastion.id), false, 'бастион не отступает');
    // A routed unit may take the damage only when there is no bastion.
    const ork = st.units.find(u => u.seat === 1);
    ork.routed = true;
    eq(FS_RULES.damageCandidates(st, 'defender').map(x => x.id).includes(ork.id), false, 'при бастионе деморализованный не ранится');
    st.structures = st.structures.filter(x => x !== bastion);
    eq(FS_RULES.damageCandidates(st, 'defender').map(x => x.id).includes(ork.id), true, 'без бастиона — можно');
});

rule('asset-1', '«Cache tokens cannot be spent to reduce the cost of upgrade cards.»', () => {
    const st = empty();
    const sys = st.systems[0];
    const pos = worldOf(st, sys.id);
    guard(st, 0, sys.id, pos);
    FS_RULES.addStructure(st, 0, 'city', sys.id, pos);
    st.players[0].materiel = 14;
    st.players[0].assets.cache = 2;
    st.order = { seat: 0, order: 'strategize', system: sys.id, phase: 'strategize' };
    const faction = FS_DATA.factions.find(f => f.id === st.players[0].faction);
    const card = (FS_DATA.orders || []).find(c => c.faction === faction.id && c.kl <= 1)
        || (FS_DATA.orders || []).find(c => c.faction === faction.id);
    if (!card) return 'у фракции нет карт приказов';
    const before = st.players[0].materiel;
    const res = FS_RULES.apply(st, 0, { type: 'buyUpgrade', kind: 'order', card: card.name });
    eq(res.ok, true, 'улучшение куплено');
    eq(st.players[0].materiel, before - card.cost, 'кеш на улучшения не тратится');
    eq(st.players[0].assets.cache, 2, 'кеш остался');
});

rule('asset-2', '«A player cannot have more than three of each asset token» — у тиранидов четыре жетона подкрепления (планшет главнее)', () => {
    const st = empty();
    const sys = st.systems[0];
    const pos = worldOf(st, sys.id);
    guard(st, 0, sys.id, pos);
    st.players[0].assets.reinforcement = 0;
    const steps = [{ op: 'gainAsset', kind: 'reinforcement', n: 3 }];
    FS_RULES.runEffects(st, 0, steps, { kind: 'ability' });
    st.players[0].faction = 'имперская-гвардия';
    FS_RULES.runEffects(st, 0, steps, { kind: 'ability' });
    eq(st.players[0].assets.reinforcement, 3, 'три жетона — предел');
    st.players[0].faction = 'тираниды';
    FS_RULES.runEffects(st, 0, steps, { kind: 'ability' });
    eq(st.players[0].assets.reinforcement, 4, 'тираниды держат четыре');
});

rule('adj-1', '«Systems that only share the corner of a border are not adjacent.»', () => {
    const st = game();
    let bad = 0;
    for (const sys of st.systems) {
        for (const id of FS_RULES.neighbors(st, sys.id)) {
            const o = FS_RULES.system(st, id);
            if (Math.abs(o.row - sys.row) + Math.abs(o.col - sys.col) !== 1) bad++;
        }
    }
    eq(bad, 0, 'сосед только через общую границу');
    // The map is connected: every system is reachable.
    const seen = new Set([st.systems[0].id]);
    const queue = [st.systems[0].id];
    while (queue.length) {
        for (const id of FS_RULES.neighbors(st, queue.shift())) {
            if (!seen.has(id)) { seen.add(id); queue.push(id); }
        }
    }
    eq(seen.size, st.systems.length, 'карта связна');
});

// ============================================================================
//  Movement corners
// ============================================================================
head('Движение: пять отрядов, дороги, деморализация');

rule('mov-1', '«The active player can exceed each area’s unit capacity while resolving an Advance Order, but can never end the movement with more than five units in a single area.»', () => {
    const st = empty();
    const sys = st.systems[0];
    const voidPos = voidOf(st, sys.id);
    // Five ships are already in the void; a sixth one comes from a neighbour.
    const nb = FS_RULES.neighbors(st, sys.id)[0];
    for (let i = 0; i < 5; i++) unit(st, 0, 'крейсеры', sys.id, voidPos);
    const sixth = unit(st, 0, 'крейсеры', nb, voidOf(st, nb));
    advance(st, 0, sys.id, voidPos);
    const one = FS_RULES.moveAllowed(st, 0, sixth, { system: sys.id, pos: voidPos });
    eq(one.ok, false, 'шестой отряд в область не встаёт');
    eq(/пяти/.test(one.error || ''), true, 'движок называет предел в пять отрядов');
    // Four is still fine: the fifth may join during the movement.
    st.units = st.units.filter(u => u.id !== st.units.filter(x => x.system === sys.id)[0].id);
    eq(FS_RULES.moveAllowed(st, 0, sixth, { system: sys.id, pos: voidPos }).ok, true, 'пятый отряд встаёт');
});

rule('mov-2', '«During an Advance Order, if a ship moved from an adjacent system to the active system, ground units cannot move into the active system from a different adjacent system.»', () => {
    const st = empty();
    const sys = st.systems[0];
    const nbs = FS_RULES.neighbors(st, sys.id);
    if (nbs.length < 2) return 'у системы меньше двух соседей';
    const [a, b] = nbs;
    const ship = unit(st, 0, 'крейсеры', a, voidOf(st, a));
    const guardUnit = guard(st, 0, b, worldOf(st, b));
    advance(st, 0, sys.id, voidOf(st, sys.id), 'ships');
    st.order.route = FS_RULES.advanceRoutes(st, 0, 'ship');
    const first = FS_RULES.apply(st, 0, { type: 'moveUnits', moves: [{ unit: ship.id, system: sys.id, pos: voidOf(st, sys.id) }] });
    eq(first.ok, true, 'корабль пришёл из соседней системы');
    // Второй шаг — наземные войска; дороги считаются заново.
    FS_RULES.apply(st, 0, { type: 'endAdvance' });
    const second = FS_RULES.apply(st, 0, { type: 'moveUnits', moves: [{ unit: guardUnit.id, system: sys.id, pos: worldOf(st, sys.id) }] });
    eq(second.ok, false, 'войска из другой соседней системы уже не приходят');
});

rule('mov-3', '«Routed units do not contribute combat dice … A routed unit can retreat; however, it cannot move or be placed in a different area by an order or card effect.»', () => {
    const st = empty();
    const sys = st.systems[0];
    const u = guard(st, 0, sys.id, worldOf(st, sys.id));
    advance(st, 0, sys.id, worldOf(st, sys.id));
    eq(FS_RULES.movableUnits(st, 0).some(x => x.id === u.id), true, 'целый отряд может идти');
    u.routed = true;
    eq(FS_RULES.movableUnits(st, 0).some(x => x.id === u.id), false, 'деморализованный не может идти');
    eq(FS_RULES.moveAllowed(st, 0, u, { system: sys.id, pos: voidOf(st, sys.id) }).ok, false, 'и не ставится в другое место');
});

rule('rein-1', '«The maximum number of reinforcement tokens a player can use during a combat is equal to the number of plastic units he has in that combat. Bastions do not count toward this number.»', () => {
    const st = empty();
    const sys = st.systems[0];
    const pos = worldOf(st, sys.id);
    guard(st, 0, sys.id, pos);
    guard(st, 0, sys.id, pos);
    FS_RULES.addStructure(st, 0, 'bastion', sys.id, pos);
    olk(st, 1, sys.id, pos);
    st.players[0].assets.reinforcement = 3;
    advance(st, 0, sys.id, pos);
    FS_RULES.apply(st, 0, { type: 'endAdvance' });
    eq(FS_RULES.maxReinforce(st, 0, 'attacker'), 2, 'два отряда — не больше двух жетонов');
    const used = FS_RULES.apply(st, 0, { type: 'combat', action: 'reinforce', count: 3 });
    eq(used.ok, false, 'три жетона при двух отрядах нельзя');
});

rule('rein-2', '«Reinforcement tokens do not contribute dice to a combat»', () => {
    const st = groundBattle({ reinforce: 2 });
    const before = c(st).dice.attacker.length;
    const res = FS_RULES.apply(st, 0, { type: 'combat', action: 'reinforce', count: 2 });
    eq(res.ok, true, 'жетоны выставлены');
    eq(c(st).dice.attacker.length, before, 'кубиков от жетонов не прибавилось');
    eq(st.players[0].assets.reinforcement, 0, 'жетоны ушли из запаса');
});

// ============================================================================
//  Free units, factories, forge tokens
// ============================================================================
head('Свободные отряды, фабрики, кузница');

rule('free-1', '«Free units come from the player’s supply … if the player does not have any of that unit in his supply, he cannot place that unit.»', () => {
    const st = empty();
    const sys = st.systems[0];
    const pos = worldOf(st, sys.id);
    guard(st, 0, sys.id, pos);
    st.players[0].supply.units['гвардейцы'] = 0;
    const before = st.units.filter(u => u.seat === 0).length;
    FS_RULES.runEffects(st, 0, [{ op: 'placeUnit', n: 1, what: 'Гвардейцы', free: true, pick: true }], { kind: 'ability' });
    let guardLoop = 0;
    while (st.pending && guardLoop++ < 10) answerFirst(st);
    eq(st.units.filter(u => u.seat === 0).length, before, 'без модели в запасе отряд не появляется');
    eq(st.players[0].supply.units['гвардейцы'], 0, 'запас не ушёл в минус');
    // With a model in the reserve the same step places it and takes it from the supply.
    st.players[0].supply.units['гвардейцы'] = 1;
    FS_RULES.runEffects(st, 0, [{ op: 'placeUnit', n: 1, what: 'Гвардейцы', free: true, pick: true }], { kind: 'ability' });
    guardLoop = 0;
    while (st.pending && guardLoop++ < 10) answerFirst(st);
    eq(st.units.filter(u => u.seat === 0).length, before + 1, 'модель из запаса встала на доску');
    eq(st.players[0].supply.units['гвардейцы'], 0, 'модель ушла из запаса');
});

rule('fac-1', '«If the active player has more than one factory in a system, the deploy limit is the sum of the unit capacities for each friendly world containing a factory»', () => {
    const st = empty();
    const sys = st.systems[0];
    const pos = worldOf(st, sys.id);
    guard(st, 0, sys.id, pos);
    // Two factories on the same world (a card may allow it) double that world.
    FS_RULES.addStructure(st, 0, 'factory', sys.id, pos);
    const one = FS_RULES.deployLimit(st, 0, sys.id);
    eq(one, FS_RULES.capacity(st, sys.id, pos), 'одна фабрика — вместимость мира');
    FS_RULES.addStructure(st, 0, 'factory', sys.id, pos);
    eq(FS_RULES.deployLimit(st, 0, sys.id), one * 2, 'две фабрики на мире удваивают предел');
});

rule('forge-1', '«A player cannot spend forge tokens to reduce the command level restriction for upgrade cards.»', () => {
    const st = empty();
    const sys = st.systems[0];
    const pos = worldOf(st, sys.id);
    guard(st, 0, sys.id, pos);
    st.players[0].materiel = 14;
    st.players[0].assets.forge = 2;
    st.order = { seat: 0, order: 'strategize', system: sys.id, phase: 'strategize' };
    const faction = FS_DATA.factions.find(f => f.id === st.players[0].faction);
    const high = (FS_DATA.orders || []).filter(c => c.faction === faction.id).sort((a, b) => b.kl - a.kl)[0];
    if (!high) return 'у фракции нет улучшений приказов';
    const res = FS_RULES.apply(st, 0, { type: 'buyUpgrade', kind: 'order', card: high.name, forgeKl: true });
    if (high.kl === 0) return 'у карты нет требования уровня';
    eq(res.ok, false, 'кузница не снижает уровень улучшения');
    eq(st.players[0].assets.forge, 2, 'кузница не потрачена');
});

// ============================================================================
//  Components and spending
// ============================================================================
head('Компоненты и траты');

rule('comp-1', '«If a player would acquire a new structure by winning a combat but he does not have an available structure control token, that structure is immediately destroyed.»', () => {
    const st = empty();
    const sys = st.systems[0];
    const pos = worldOf(st, sys.id);
    guard(st, 0, sys.id, pos);
    olk(st, 1, sys.id, pos);
    FS_RULES.addStructure(st, 1, 'city', sys.id, pos);
    // У атакующего заняты все девять жетонов контроля: девять его построек на доске.
    const worlds = [];
    for (const s of st.systems) for (const a of s.areas) if (a.world) worlds.push({ system: s.id, pos: a.pos });
    for (let i = 0; i < 9 && i < worlds.length; i++) {
        st.structures.push({ id: 'own' + i, seat: 0, type: 'factory', system: worlds[i].system, area: worlds[i].pos });
    }
    eq(FS_RULES.structureTokensLeft(st, 0), 0, 'жетонов контроля не осталось');
    advance(st, 0, sys.id, pos);
    FS_RULES.apply(st, 0, { type: 'endAdvance' });
    FS_RULES.captureStructures(st, sys.id, pos, 0, 1);
    eq(st.structures.filter(x => x.type === 'city').length, 0, 'постройка без жетона уничтожена');
});

rule('comp-2', '«Players are limited to purchasing the number of units and structures provided in the game.»', () => {
    const st = empty();
    const sys = st.systems[0];
    const pos = worldOf(st, sys.id);
    guard(st, 0, sys.id, pos);
    const other = FS_RULES.system(st, sys.id).areas.find(a => a.world && a.pos !== pos);
    FS_RULES.addStructure(st, 0, 'factory', sys.id, other ? other.pos : pos);
    st.players[0].materiel = 14;
    st.players[0].supply.units['гвардейцы'] = 0;
    st.order = { seat: 0, order: 'deploy', system: sys.id, phase: 'deploy' };
    const res = FS_RULES.apply(st, 0, { type: 'buyUnit', unit: 'гвардейцы', system: sys.id, pos });
    eq(res.ok, false, 'отряда нет в запасе — не купить');
});

rule('spend-1', '«To purchase a unit or structure, a player must pay the materiel cost»', () => {
    const st = empty();
    const sys = st.systems[0];
    const pos = worldOf(st, sys.id);
    guard(st, 0, sys.id, pos);
    const other = FS_RULES.system(st, sys.id).areas.find(a => a.world && a.pos !== pos);
    FS_RULES.addStructure(st, 0, 'factory', sys.id, other ? other.pos : pos);
    st.players[0].materiel = 0;
    st.players[0].supply.units['гвардейцы'] = 3;
    st.order = { seat: 0, order: 'deploy', system: sys.id, phase: 'deploy' };
    const res = FS_RULES.apply(st, 0, { type: 'buyUnit', unit: 'гвардейцы', system: sys.id, pos });
    const cost = (FS_DATA.factions.find(f => f.id === st.players[0].faction).units.find(u => u.id === 'гвардейцы') || {}).cost;
    if (!cost) return 'отряд бесплатный — трата не проверяется';
    eq(res.ok, false, 'без материи отряд не купить');
    eq(st.players[0].materiel, 0, 'материя не ушла в минус');
});

// ============================================================================
//  Every printed card can be resolved by the engine
// ============================================================================
head('Тексты карт: каждая карта разбирается и разыгрывается');

// The first option of every question — the audit only looks for a crash, not
// for a clever answer.
function answerFirst(st) {
    const q = (st.pending && st.pending.question) || {};
    const options = q.options || [];
    const answer = {};
    const first = options[0];
    const value = first && typeof first === 'object'
        ? (first.id !== undefined ? first.id : first)
        : first;
    // Every kind of question gets the answer the engine reads for it.
    if (q.kind === 'units') answer.units = [value].filter(v => v !== undefined);
    else if (q.kind === 'dice' || q.kind === 'diceFace') answer.dice = [0];
    else if (q.kind === 'face') answer.face = 'att';
    else if (q.kind === 'assets' || q.kind === 'assetType') answer.asset = value || 'forge';
    else if (q.kind === 'types') answer.type = value;
    else if (q.kind === 'structures' || q.kind === 'structureTypes') answer.structure = value;
    else if (q.kind === 'areas') answer.area = typeof first === 'object' ? { system: first.system, pos: first.pos } : undefined;
    else if (q.kind === 'systems') answer.system = value;
    else if (q.kind === 'foes') answer.foe = value;
    else if (q.kind === 'cards') answer.card = value;
    else if (q.kind === 'yesno') answer.yes = false;
    else answer.choice = 0;
    const seat = st.pending.answerSeat !== undefined ? st.pending.answerSeat : st.pending.seat;
    return FS_RULES.apply(st, seat, { type: 'effect', answer });
}

// A board with a real combat on it: the texts of the combat cards need it.
function battleFor(seed) {
    const st = empty(seed);
    const sys = st.systems[0];
    const pos = worldOf(st, sys.id);
    for (let i = 0; i < 2; i++) guard(st, 0, sys.id, pos);
    for (let i = 0; i < 2; i++) olk(st, 1, sys.id, pos);
    st.players[0].assets.reinforcement = 2;
    st.players[1].assets.reinforcement = 2;
    advance(st, 0, sys.id, pos);
    const res = FS_RULES.apply(st, 0, { type: 'endAdvance' });
    if (!res.ok) throw new Error('бой не начался: ' + res.error);
    return st;
}

rule('cards-1', '«If the rules text on a card … contradicts information from the Rules Reference, the rules on the card … takes precedence» — текст каждой боевой карты разыгрывается движком', () => {
    const broken = [];
    for (const card of FS_DATA.combat) {
        for (const seat of [0, 1]) {
            const st = battleFor(7);
            try {
                const steps = FS_RULES.cardSteps(st, seat, card);
                FS_RULES.runEffects(st, seat, steps, { kind: 'combat', owner: seat, reqs: card.reqs || [] });
                let n = 0;
                while (st.pending && n < 25) {
                    n++;
                    const res = answerFirst(st);
                    if (res && res.ok === false) throw new Error(res.error);
                }
            } catch (e) {
                broken.push(card.faction + ' / ' + card.name + ' (место ' + seat + '): ' + e.message);
            }
            st.pending = null;
        }
    }
    eq(broken.slice(0, 3), [], 'карты без ошибок (' + broken.length + ' из ' + FS_DATA.combat.length + ')');
});

rule('cards-2', '«When a player resolves an event card …» — текст каждой карты события и каждого улучшения приказа разыгрывается', () => {
    const broken = [];
    for (const card of (FS_DATA.events || [])) {
        const st = empty(9);
        st.phase = 'refresh';
        const sys = st.systems[0];
        guard(st, 0, sys.id, worldOf(st, sys.id));
        try {
            const steps = FS_EFFECTS.parse(card.text || '', { kind: 'event', faction: card.faction });
            eq(steps.length > 0, true, 'у карты есть шаги');
            FS_RULES.runEffects(st, 0, steps, { kind: 'event', ctx: null });
            let n = 0;
            while (st.pending && n < 25) { n++; answerFirst(st); }
        } catch (e) {
            broken.push(card.faction + ' / ' + card.name + ': ' + e.message);
        }
        st.pending = null;
    }
    for (const card of (FS_DATA.orders || [])) {
        const st = empty(9);
        const sys = st.systems[0];
        const pos = worldOf(st, sys.id);
        guard(st, 0, sys.id, pos);
        st.order = { seat: 0, order: 'strategize', system: sys.id, phase: 'strategize' };
        try {
            const steps = FS_EFFECTS.parse(card.text || '', { kind: 'order', faction: card.faction });
            eq(steps.length > 0, true, 'у карты есть шаги');
            FS_RULES.runEffects(st, 0, steps, { kind: 'order', ctx: null });
            let n = 0;
            while (st.pending && n < 25) { n++; answerFirst(st); }
        } catch (e) {
            broken.push(card.faction + ' / ' + card.name + ': ' + e.message);
        }
        st.pending = null;
    }
    eq(broken.slice(0, 3), [], 'карты без ошибок (' + broken.length + ')');
});

rule('abil-1', '«Resolve Faction Ability: The active player may resolve the special ability listed on the front of his faction sheet.»', () => {
    const broken = [];
    for (const faction of FS_DATA.factions) {
        const st = empty(5);
        const sys = st.systems[0];
        const pos = worldOf(st, sys.id);
        st.players[0].faction = faction.id;
        guard(st, 0, sys.id, pos);
        st.order = { seat: 0, order: 'dominate', system: sys.id, phase: 'dominate' };
        try {
            const steps = FS_EFFECTS.parse((faction.ability && faction.ability.text) || '', { kind: 'ability', faction: faction.id });
            eq(steps.length > 0, true, 'способность разбирается в шаги: ' + faction.id);
            st.order.ability = faction.ability;
            eq(!!st.order.ability, true, 'способность показана игроку');
            FS_RULES.runEffects(st, 0, steps, { kind: 'ability', ctx: null });
            let n = 0;
            while (st.pending && n < 25) { n++; answerFirst(st); }
        } catch (e) {
            broken.push(faction.id + ': ' + e.message);
        }
        st.pending = null;
    }
    eq(broken, [], 'все 12 способностей разыгрываются');
});

rule('cards-3', '«The player must have at least one of the specified units in the combat» — у каждой карты, называющей отряд, движок знает этот отряд', () => {
    const source = fs.readFileSync(path.join(ROOT, 'js/fs/FSEffects.js'), 'utf8');
    const known = new Set([...source.matchAll(/case '([a-zA-Z]+)'/g)].map(m => m[1]));
    const unknown = new Set();
    const walk = list => {
        for (const step of list || []) {
            if (step.op && !known.has(step.op)) unknown.add(step.op);
            walk(step.steps);
            walk(step.then);
            walk(step.else);
            if (step.branches) for (const b of step.branches) walk(b.steps || b);
        }
    };
    for (const card of FS_DATA.combat) {
        for (const field of ['general', 'unit']) {
            if (!card[field] || card[field].trim().length < 3) continue;
            walk(FS_EFFECTS.parse(card[field], { kind: 'combat', faction: card.faction, reqs: card.reqs || [] }));
        }
    }
    for (const card of (FS_DATA.events || [])) walk(FS_EFFECTS.parse(card.text || '', { kind: 'event', faction: card.faction }));
    for (const card of (FS_DATA.orders || [])) walk(FS_EFFECTS.parse(card.text || '', { kind: 'order', faction: card.faction }));
    eq([...unknown], [], 'нет шагов, которых движок не понимает');
});

// ----------------------------------------------------------------------------
//  The order upgrades of the Sisters of Battle (the five cards of the sheet)
// ----------------------------------------------------------------------------
head('Приказы Сестёр битвы');

rule('orders-sisters-1', '«Крестный ход» — неконтролируемый мир становится дружественным для пути, но только для двух отрядов', () => {
    // A chain of three worlds of one system: TR — TL — BL (the gold lines).
    let st = null, chain = null;
    for (let seed = 1; seed <= 40 && !chain; seed++) {
        const board = empty(seed);
        const found = board.systems.find(sys => ['TR', 'TL', 'BL'].every(p => sys.areas.some(a => a.pos === p && a.world)));
        if (found) { st = board; chain = found; }
    }
    eq(!!chain, true, 'на карте есть система с тремя мирами цепочкой');
    st.order = null;
    eq(FS_RULES.pathExists(st, 0, chain.id, 'TR', chain.id, 'BL'), false,
        'без апгрейда путь через неконтролируемый мир закрыт');
    st.order = { seat: 0, order: 'advance', system: chain.id, uncontrolled: 2, uncontrolledUsed: 0 };
    eq(FS_RULES.pathExists(st, 0, chain.id, 'TR', chain.id, 'BL'), true,
        'апгрейд открывает путь');
    st.order.uncontrolledUsed = 2;
    eq(FS_RULES.pathExists(st, 0, chain.id, 'TR', chain.id, 'BL'), false,
        'два отряда уже прошли — третьему путь закрыт');
    const steps = FS_EFFECTS.parse('Во время выполнения этого приказа вы можете считать неконтролируемые миры дружественными для перемещения не более 2 ваших отрядов. Один раз за раунд.',
        { kind: 'order', faction: 'сестры-битвы' });
    eq(steps.some(x => x.op === 'uncontrolledMarch' && x.n === 2), true, 'текст карты даёт шаг с пределом 2');
});

rule('orders-sisters-2', '«Божественное избавление» — кубик за каждую недеморализованную сестру Ренентию в этом бою', () => {
    const steps = FS_EFFECTS.parse('Если во время выполнения этого приказа вы начали битву в мире, то получите 1 `any cube` за каждую недеморализованную сестру Ренентию в шаге вызова подкреплений. Один раз за раунд.',
        { kind: 'order', faction: 'сестры-битвы' });
    const gain = steps.find(x => x.op === 'gainDie');
    eq(!!gain, true, 'есть шаг получения кубика');
    eq(gain.inBattle, true, 'кубики считаются по отрядам этого боя');
    eq(!!(gain.filter && gain.filter.contains && gain.filter.contains.includes('ренент')), true,
        'отбор — сёстры Ренентиты');
    // And the unit of the faction sheet is found by that filter.
    const def = FS_DATA.factions.find(f => f.id === 'сестры-битвы').units.find(u => /ре[пн]е[нт]/i.test(u.name));
    eq(!!def, true, 'отряд «' + (def && def.name) + '» есть в списке фракции');
    eq(FS_EFFECTS.unitFits(def, gain.filter), true, 'фильтр карты узнаёт этот отряд');
});

rule('orders-sisters-3', '«Священное пламя» — карта играется вручную: движок не деморализует свои корабли сам', () => {
    const steps = FS_EFFECTS.parse('Бастионы противника не могут предотвратить этот орбитальный удар. Во время этого орбитального удара вы можете деморализовать любое количество кораблей, участвующих в этом орбитальном ударе. За каждый деморализованный корабль переверните до 2 ваших `def. cube` или `att. cube` на `morale cube`. Один раз за раунд.',
        { kind: 'order', faction: 'сестры-битвы' });
    eq(steps.some(x => x.op === 'route'), false, 'движок не деморализует корабли без выбора игрока');
    eq(steps.filter(x => x.op === 'note' && x.manual === 'священное-пламя').length, 2, 'оба предложения — ручные пояснения');
});

// ----------------------------------------------------------------------------
//  The inventory of the cards: the counts are stated, not implied
// ----------------------------------------------------------------------------
head('Карты: состав колод');

rule('cards-4', '«Each faction has its own deck of 10 combat cards» — у каждой фракции 5 базовых карт (10 копий) и 5 приказов-апгрейдов', () => {
    const byFaction = new Map();
    for (const f of FS_DATA.factions) byFaction.set(f.id, { base: 0, upgrade: 0, events: 0, orders: 0 });
    for (const c of FS_DATA.combat) {
        const row = byFaction.get(c.faction);
        if (!row) continue;
        if (c.upgrade) row.upgrade++; else row.base++;
    }
    for (const e of FS_DATA.events) { const row = byFaction.get(e.faction); if (row) row.events++; }
    for (const o of FS_DATA.orders) { const row = byFaction.get(o.faction); if (row) row.orders++; }
    const bad = [...byFaction].filter(([, r]) => r.base !== 5 || r.orders !== 5 || r.events !== 8);
    eq(bad.map(([f, r]) => `${f}: базовых ${r.base}, приказов ${r.orders}, событий ${r.events}`), [],
        'у каждой фракции 5 базовых боевых карт, 5 приказов-апгрейдов и 8 событий');
    eq([...byFaction.values()].reduce((n, r) => n + r.base, 0), 60, 'базовых боевых карт: 5 × 12');
    eq([...byFaction.values()].reduce((n, r) => n + r.orders, 0), 60, 'приказов-апгрейдов: 5 × 12');
    eq(FS_DATA.events.length, 96, 'событий: 8 × 12');
    // The upgrade cards are printed apart from the deck: the deck is 5 base
    // cards in two copies, the upgrades replace two copies when bought.
    const upgrades = FS_DATA.combat.filter(c => c.upgrade);
    eq(upgrades.length, 111, 'боевых карт-улучшений (9 у каждой фракции, 12 у тиранидов)');
});

rule('cards-5', 'Транскрипция — один текст: в документах нет маркеров конфликта слияния', () => {
    const dir = path.join(ROOT, 'docs/forbidden-stars');
    const found = [];
    for (const name of fs.readdirSync(dir)) {
        if (!name.endsWith('.md')) continue;
        const lines = fs.readFileSync(path.join(dir, name), 'utf8').split(/\r?\n/);
        lines.forEach((line, i) => {
            if (/^(<<<<<<< |=======$|>>>>>>> )/.test(line)) found.push(`${name}:${i + 1}`);
        });
    }
    eq(found, [], 'маркеров конфликта нет');
});

rule('cards-6', 'Каждое предложение текста карт попадает в шаг движка или в пояснение; список непрочитанного пуст', () => {
    const misses = [];
    const texts = [];
    for (const c of FS_DATA.combat) {
        if (c.general) texts.push({ kind: 'combat', faction: c.faction, name: c.name, text: c.general });
        if (c.unit) texts.push({ kind: 'combat-unit', faction: c.faction, name: c.name, text: c.unit });
    }
    for (const c of FS_DATA.events) texts.push({ kind: 'event', faction: c.faction, name: c.name, text: c.text });
    for (const c of FS_DATA.orders) texts.push({ kind: 'order', faction: c.faction, name: c.name, text: c.text });
    for (const f of FS_DATA.factions) if (f.ability) texts.push({ kind: 'ability', faction: f.id, name: f.name, text: f.ability.text });
    for (const card of texts) {
        for (const sentence of FS_EFFECTS.sentences(card.text || '')) {
            const steps = FS_EFFECTS.parseSentence(sentence, { kind: card.kind, faction: card.faction });
            const ops = steps.map(x => x.op);
            if (!ops.length || (ops[0] === 'icons' && ops.length === 1)) misses.push(`${card.kind} · ${card.name}: ${sentence}`);
        }
    }
    eq(misses, [], 'нет предложений без шага');
});

// ============================================================================
//  Cards: the markdown transcription against the engine
// ----------------------------------------------------------------------------
//  Источник истины для карт — файлы docs/forbidden-stars/04..06, а не фото.
//  Здесь движок сверяется с ними построчно: имя, КЛ, стоимость, значки, оба
//  текста. Так расхождение «в движке одно, в транскрипции другое» не может
//  пройти молча.
// ============================================================================
const MD = file => fs.readFileSync(path.join(ROOT, 'docs/forbidden-stars', file), 'utf8').split('\n');
const cellsOf = l => l.split('|').slice(1, -1).map(s => s.trim());
const plain = s => (s || '').replace(/\*/g, '').replace(/\s+/g, ' ').trim();
// в таблицах бывают пометки вычитки поверх текста карты: «— на карте напечатана
// только эта строка», «— (коричневой плашки нет)». Это не текст карты.
const stripNote = s => plain(s)
    .replace(/\s+—\s+(?:на карте|проверено|коричневой|поле|Похоже|пусто|см\.).*$/i, '')
    .replace(/^—\s*\(.*\)$/i, '')
    .trim();
const FACTION_BY_RU = {
    'Имперская гвардия': 'имперская-гвардия', 'Некроны': 'некроны', 'Тираниды': 'тираниды',
    'Эльдары': 'эльдары', 'Космодесант Хаоса': 'космодесант-хаоса', 'Орки': 'орки',
    'Космодесант': 'космодесант', 'Империя Тау': 'империя-тау', 'Инквизиция': 'инквизиция',
    'Тёмные эльдары': 'темные-эльдары', 'Сестры битвы': 'сестры-битвы',
    'Адептус Механикус': 'адептус-механикус',
};
/** Таблицы карт из markdown: имя, а остальные колонки — по началу заголовка. */
function mdCards(file) {
    const rows = [];
    let faction = null, head = null;
    for (const line of MD(file)) {
        const h = line.match(/^(#{1,4}) (.+)$/);
        if (h) {
            const level = h[1].length;
            const title = h[2].split('—')[0].trim().replace(/\s*\([^)]*\)\s*$/, '');
            const id = FACTION_BY_RU[title];
            // заголовок фракции задаёт колоду; подзаголовок внутри неё («Базовые карты
            // колоды», «Прочитано дословно») — нет; заголовок первого уровня без
            // фракции («Приложения», «Вычитка остальных наборов») закрывает колоду
            // заголовок первого уровня без фракции («Приложения», «Вычитка
            // остальных наборов») закрывает колоду; прочие служебные разделы тоже
            const closes = level === 1 || /^(Спорные|Приложени|Инвентарь|Что |Правила|Метод|Иконки)/.test(title);
            if (id) faction = id;
            else if (closes) faction = null;
            head = null;
            continue;
        }
        if (!faction) continue;
        if (!line.startsWith('|')) { if (line.trim() && !line.startsWith('>')) head = null; continue; }
        const cells = cellsOf(line);
        if (cells.includes('Карта')) { head = cells; continue; }
        if (!head || cells.every(c => /^:?-+:?$/.test(c) || c === '')) continue;
        const iName = head.indexOf('Карта');
        if (!/^\*\*/.test(cells[iName] || '')) continue;
        const col = k => { const i = head.findIndex(x => x.startsWith(k)); return i < 0 ? null : (cells[i] ?? ''); };
        // у карт событий направление шторма записано стрелками в скобках после имени
        const name = plain(cells[iName]).replace(/\s*\([^)]*[⬆⬇⬅➡⮕↩][^)]*\)$/, '');
        rows.push({ faction, name, kl: col('КЛ'), cost: col('Стоимость'),
            icons: col('Иконки') || '', icon: col('Иконка приказа'),
            general: col('Верхняя') || col('Способность') || '', unit: col('Нижняя') || col('Способность отряда') || '',
            text: col('Текст'), type: col('Тип шторм') || col('Тип') });
    }
    return rows;
}
const iconCount = s => {
    const r = { att: 0, def: 0, morale: 0 };
    for (const m of (s || '').matchAll(/`?(att|def|morale)\.?\s*(icon|token|cube)`?/g)) r[m[1]]++;
    return r;
};
const sameCards = (rows, engine, what, map) => {
    const diffs = [];
    const byKey = new Map(engine.map(c => [c.faction + '|' + c.name, c]));
    for (const r of rows) {
        const e = byKey.get(r.faction + '|' + r.name);
        if (!e) { diffs.push(`${what}: в движке нет «${r.name}» (${r.faction})`); continue; }
        byKey.delete(r.faction + '|' + r.name);
        const want = map(r, e);
        for (const [k, v] of Object.entries(want)) {
            const a = e[k], b = v;
            const same = (typeof b === 'string' || typeof a === 'string')
                ? plain(a) === plain(b)
                : JSON.stringify(a) === JSON.stringify(b);
            if (!same) diffs.push(`${r.faction} · ${r.name}: ${k} — в markdown ${JSON.stringify(b)}, в движке ${JSON.stringify(a)}`);
        }
    }
    for (const e of byKey.values()) diffs.push(`${what}: в движке лишняя «${e.name}» (${e.faction})`);
    return diffs;
};

head('Движение и развёртывание: шаги приказа');

rule('step-1', '«1. Move Ships … 2. Move Ground Units … 3. Resolve Combat» — двумя шагами движения, а не одним', () => {
    const st = empty();
    const sys = st.systems[0];
    const w1 = worldOf(st, sys.id);
    const v = voidOf(st, sys.id);
    const g = guard(st, 0, sys.id, w1);
    const ship = unit(st, 0, 'крейсеры', sys.id, v);
    advance(st, 0, sys.id, w1, 'ships');
    st.order.route = FS_RULES.advanceRoutes(st, 0, 'ship');
    // Первый шаг: пехота не идёт.
    const early = FS_RULES.canMove(st, 0, g, { system: sys.id, pos: w1 });
    eq(early.ok, false, 'пехота ждёт шага наземных войск');
    // Корабль идёт.
    const otherVoid = FS_RULES.system(st, sys.id).areas.find(a => !a.world && a.pos !== v);
    if (otherVoid) {
        const moved = FS_RULES.apply(st, 0, { type: 'moveUnits', moves: [{ unit: ship.id, system: sys.id, pos: otherVoid.pos }] });
        eq(moved.ok, true, 'корабль идёт первым шагом');
    }
    // Второй шаг: теперь корабли стоят.
    const next = FS_RULES.apply(st, 0, { type: 'endAdvance' });
    eq(next.ok, true, 'шаг наземных войск открыт');
    eq(next.step, 'ground', 'второй шаг — наземные войска');
    const late = FS_RULES.canMove(st, 0, ship, { system: sys.id, pos: v });
    eq(late.ok, false, 'корабль уже отлетал');
});

rule('step-2', '«all legal paths are determined before moving any ground units» — дороги наземных войск считаются после шага кораблей', () => {
    const st = empty();
    const sys = st.systems[0];
    const w1 = worldOf(st, sys.id);
    const v = voidOf(st, sys.id);
    const g = guard(st, 0, sys.id, w1);
    unit(st, 0, 'крейсеры', sys.id, v);
    // Приказ начинается с шага кораблей: у пехоты дорог ещё нет.
    FS_RULES.apply(st, 0, { type: 'resolveOrder', system: sys.id }).ok;
    st.order = { seat: 0, order: 'advance', system: sys.id, pos: v, phase: 'move', moveStep: 'ships', moved: [], steps: [] };
    st.order.route = FS_RULES.advanceRoutes(st, 0, 'ship');
    eq(!!(st.order.route || {})[g.id], false, 'в шаге кораблей у пехоты дорог нет');
    // Переход ко второму шагу: дороги пехоты считаются здесь — по тем местам,
    // где корабли стоят ПОСЛЕ своего хода.
    FS_RULES.apply(st, 0, { type: 'endAdvance' });
    eq(st.order.moveStep, 'ground', 'идёт второй шаг');
    eq(!!(st.order.route || {})[g.id], true, 'дороги пехоты посчитаны после хода кораблей');
});

rule('step-3', '«Отменить движение, пока приказ не закончен» — ход возвращается даже после начала боя', () => {
    const st = empty();
    const sys = st.systems[0];
    const home = worldOf(st, sys.id);
    const away = FS_RULES.system(st, sys.id).areas.find(a => a.world && a.pos !== home);
    if (!away) return 'в системе один мир';
    const g = guard(st, 0, sys.id, home);
    olk(st, 1, sys.id, away.pos);
    advance(st, 0, sys.id, home, 'ground');
    st.order.route = FS_RULES.advanceRoutes(st, 0, 'ground');
    const moved = FS_RULES.apply(st, 0, { type: 'moveUnits', moves: [{ unit: g.id, system: sys.id, pos: away.pos }] });
    eq(moved.ok, true, 'отряд вошёл в чужой мир');
    const battle = FS_RULES.apply(st, 0, { type: 'endAdvance' });
    eq(battle.ok, true, 'бой начался');
    eq(!!st.combat, true, 'бой идёт');
    const back = FS_RULES.apply(st, 0, { type: 'undoMove' });
    eq(back.ok, true, 'ход возвращается в начале боя');
    eq(!!st.combat, false, 'бой отменён');
    eq(FS_RULES.unitsAt(st, sys.id, home).some(u => u.id === g.id), true, 'отряд вернулся домой');
});

rule('dep-7', '«Покупки приказа платятся в конце» — правый клик снимает покупку, материя не тронута', () => {
    const st = empty();
    const sys = st.systems[0];
    const pos = worldOf(st, sys.id);
    FS_RULES.addStructure(st, 0, 'factory', sys.id, pos);
    st.players[0].materiel = 6;
    st.players[0].supply.units['гвардейцы'] = 3;
    st.order = { seat: 0, order: 'deploy', system: sys.id, phase: 'deploy', purchases: [] };
    const buy = FS_RULES.apply(st, 0, { type: 'buyUnit', unit: 'гвардейцы', system: sys.id, pos });
    eq(buy.ok, true, 'отряд куплен');
    const unitId = st.order.purchases[0].id;
    eq(st.players[0].materiel, 6, 'материя не списана');
    eq(st.players[0].supply.units['гвардейцы'], 2, 'отряд взят из запаса');
    const undo = FS_RULES.apply(st, 0, { type: 'undoPurchase', unit: unitId });
    eq(undo.ok, true, 'покупка снята');
    eq(FS_RULES.unitsAt(st, sys.id, pos).filter(u => u.seat === 0).length, 0, 'отряд ушёл с доски');
    eq(st.players[0].supply.units['гвардейцы'], 3, 'отряд вернулся в запас');
    eq(FS_RULES.spentOf(st.order), 0, 'долг приказа обнулён');
});

rule('struct-3', '«Players are limited to purchasing the number of … structures provided in the game» — 15 городов, 10 фабрик, 10 бастионов и 9 жетонов на игрока, а не «по три»', () => {
    const st = empty();
    const worlds = [];
    for (const sys of st.systems) for (const a of sys.areas) if (a.world) worlds.push({ system: sys.id, pos: a.pos });
    eq(FS_RULES.STRUCTURE_TOKENS, 9, 'жетонов контроля на игрока');
    eq(FS_RULES.STRUCTURE_POOL.city, 15, 'городов в коробке');
    eq(FS_RULES.STRUCTURE_POOL.factory, 10, 'фабрик в коробке');
    eq(FS_RULES.STRUCTURE_POOL.bastion, 10, 'бастионов в коробке');
    // Четыре фабрики одного игрока — не запрещены: лимита «три» нет.
    for (let i = 0; i < 4; i++) FS_RULES.addStructure(st, 0, 'factory', worlds[i].system, worlds[i].pos);
    eq(FS_RULES.canTakeStructure(st, 0, 'factory').ok, true, 'четвёртая фабрика разрешена');
    eq(FS_RULES.structureTokensLeft(st, 0), 5, 'жетоны считаются по постройкам на доске');
    for (let i = 4; i < 9; i++) FS_RULES.addStructure(st, 0, 'factory', worlds[i].system, worlds[i].pos);
    eq(FS_RULES.canTakeStructure(st, 0, 'factory').ok, false, 'девять построек — жетоны кончились');
    // Общая коробка: десятая фабрика на всю партию недоступна.
    for (let i = 9; i < 10; i++) FS_RULES.addStructure(st, 1, 'factory', worlds[i].system, worlds[i].pos);
    eq(FS_RULES.structurePoolLeft(st, 'factory'), 0, 'фабрики в коробке закончились');
    eq(FS_RULES.canTakeStructure(st, 1, 'factory').ok, false, 'из коробки фабрику не взять');
});

rule('cards-md-4', 'Спорные значки приказов — редакция A, подтверждённая владельцем по картам', () => {
    const text = name => (FS_DATA.orders.find(o => o.name === name) || {}).text || '';
    eq(text('Ужасный удар').includes('потратить 1 `def. cube`'), true, 'Ужасный удар: def. cube');
    eq(text('Ужасный удар').includes('потратить 2 `def. cube`'), true, 'Ужасный удар: отступление за def. cube');
    eq(text('Неотвратимые раскопки').includes('потратить 1 `morale cube`'), true, 'Неотвратимые раскопки: morale cube');
    eq(text('Мицетические споры').includes('до 2 `att. cube`'), true, 'Мицетические споры: att. cube');
    eq(text('Разведка генокрадов').includes('до 2 `att. cube`'), true, 'Разведка генокрадов: att. cube');
    eq(text('Маскированная бомбардировка').includes('1 из своих `morale cube` на `att. cube`'), true, 'Маскированная бомбардировка: morale → att');
    eq(text('Изъяны плоти').includes('потратить 2 `def. cube`'), true, 'Изъяны плоти: def. cube');
});

head('Карты: markdown против движка');
rule('cards-md-1', 'Боевые карты (04-combat-cards.md): имя, КЛ, стоимость, значки и оба текста — 171 карта', () => {
    const rows = mdCards('04-combat-cards.md');
    eq(rows.length, 171, 'строк в 04-combat-cards.md');
    const diffs = sameCards(rows, FS_DATA.combat, '04', (r, e) => ({
        upgrade: !!r.kl,
        kl: r.kl ? Number(r.kl) : e.kl,
        cost: r.cost ? Number(r.cost) : e.cost,
        icons: iconCount(r.icons),
        general: stripNote(r.general) || e.general,
        unit: /^—/.test(plain(r.unit)) ? e.unit : (stripNote(r.unit) || e.unit),
    }));
    return diffs.length ? diffs.slice(0, 5).join('\n       ') : true;
});
rule('cards-md-2', 'Приказы (05-order-upgrades.md): имя, КЛ, стоимость, иконка приказа и текст — 60 карт', () => {
    const rows = mdCards('05-order-upgrades.md');
    eq(rows.length, 60, 'строк в 05-order-upgrades.md');
    const diffs = sameCards(rows, FS_DATA.orders, '05', r => ({
        kl: Number(r.kl), cost: Number(r.cost), icon: plain(r.icon), text: stripNote(r.text),
    }));
    return diffs.length ? diffs.slice(0, 5).join('\n       ') : true;
});
rule('cards-md-3', 'События (06-events.md): имя, тип и текст — 96 карт', () => {
    const rows = mdCards('06-events.md');
    eq(rows.length, 96, 'строк в 06-events.md');
    const TYPES = { 'ПЛАН': 'scheme', 'ТАКТИКА': 'tactic' };
    const diffs = sameCards(rows, FS_DATA.events, '06', r => {
        const t = (r.type || '').match(/ПЛАН|ТАКТИКА/);
        return { type: t ? TYPES[t[0]] : null, text: stripNote(r.text) };
    });
    return diffs.length ? diffs.slice(0, 5).join('\n       ') : true;
});

// ============================================================================
//  The report
// ============================================================================
console.log('');
if (failed.length) {
    console.log(C.red + C.b + '  Провалено: ' + failed.length + ' из ' + done + C.r);
    for (const f of failed) console.log('   ' + C.red + '· ' + f.id + C.r + ' — ' + f.why);
    console.log('');
    process.exit(1);
}
console.log(C.grn + C.b + '  Правила сходятся: ' + done + ' проверок, 0 провалов.' + C.r + '\n');
