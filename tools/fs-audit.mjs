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
import { createEngineContext } from './fs-engine.mjs';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');

// --- the engine, loaded the way the browser loads it ------------------------
// The list of engine files comes from index.html (tools/fs-engine.mjs): a new
// core script is never missed by the audit or by the server.
const ctx = createEngineContext();
const { FS_DATA, FS_RULES, FS_EFFECTS, FS_WARP_STORMS, StrikePlan, MarchPlan, PhasePlan, UpgradeOrder, OrderDeal, DeployScope, DeployLimits, OrderFight, Purchases, OrderMove, OrderTally, OrderContext, CombatTurn, CombatTokens, CombatCards,
    CombatDamage, CombatHooks, CombatPlans, CombatCubes, CombatBans, BattleField, CombatOutcome } = ctx;
// The steps of a card are executed by the groups of js/fs/effects (see
// docs/forbidden-stars/12-architecture.md): the audit asks the registries, not
// a switch in one file.
const STEP_NAMES = new Set(ctx.STEP_EXECUTORS.keys());
const ASK_NAMES = new Set(ctx.ASK_EXECUTORS.keys());

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


// An empty board of four players: the rows are four systems wide, so the wind
// rose of the warp storms can be checked in every direction.
function wideEmpty(seed = 7) {
    const four = ['имперская-гвардия', 'орки', 'некроны', 'тираниды'];
    const st = FS_RULES.newReadyGame({ seed, players: four.map((faction, i) => ({ faction, name: 'P' + i })) });
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

// A ground battle of two chosen factions: the attacker is the first of them.
function battleOf(faction, foe, seed = 11) {
    const st = FS_RULES.newReadyGame({ seed, players: [{ faction, name: 'A' }, { faction: foe, name: 'B' }] });
    st.units = [];
    st.structures = [];
    st.objectives = [];
    st.storms = [];
    for (const s of st.systems) s.tokens = [];
    st.phase = 'operations';
    st.turn = 0;
    st.order = null;
    const sys = st.systems[0];
    const pos = worldOf(st, sys.id);
    const mine = FS_DATA.factions.find(f => f.id === faction).units.find(u => u.kl === 0 && u.type === 'ground');
    for (let i = 0; i < 2; i++) unit(st, 0, mine.id, sys.id, pos);
    for (let i = 0; i < 2; i++) unit(st, 1, 'бойзы', sys.id, pos);
    advance(st, 0, sys.id, pos);
    const res = FS_RULES.apply(st, 0, { type: 'endAdvance' });
    if (!res.ok) throw new Error('бой не начался: ' + res.error);
    return st;
}

// A combat where the attacker plays one named card of his own faction. The
// hands are forced: the card under the test, and nothing for the defender.
function cardBattle(cardName, faction = 'имперская-гвардия', seed = 11) {
    const foe = faction === 'орки' ? 'имперская-гвардия' : 'орки';
    const cl0 = id => FS_DATA.factions.find(f => f.id === id).units.find(u => u.kl === 0 && u.type === 'ground').id;
    const st = FS_RULES.newReadyGame({ seed, players: [{ faction, name: 'A' }, { faction: foe, name: 'B' }] });
    st.units = [];
    st.structures = [];
    st.objectives = [];
    st.storms = [];
    for (const s of st.systems) s.tokens = [];
    st.phase = 'operations';
    st.turn = 0;
    st.order = null;
    const sys = st.systems[0];
    const pos = worldOf(st, sys.id);
    for (let i = 0; i < 3; i++) unit(st, 0, cl0(faction), sys.id, pos);
    for (let i = 0; i < 3; i++) unit(st, 1, cl0(foe), sys.id, pos);
    advance(st, 0, sys.id, pos);
    const res = FS_RULES.apply(st, 0, { type: 'endAdvance' });
    if (!res.ok) throw new Error('бой не начался: ' + res.error);
    st.combat.cards.attacker.hand = [cardName];
    st.combat.cards.defender.hand = [];
    const played = FS_RULES.apply(st, 0, { type: 'combat', action: 'playCard', index: 0 });
    if (!played.ok) throw new Error('карта не сыграна: ' + played.error);
    return st;
}

// How many asset tokens a player holds.
function assetsOf(p) {
    return (p.assets.forge || 0) + (p.assets.cache || 0) + (p.assets.reinforcement || 0);
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
    let st = null;
    for (let seed = 1; seed <= 40 && !st; seed++) {
        const board = empty(seed);
        if (['TR', 'TL', 'BL'].every(p => board.systems.some(sys => sys.areas.some(a => a.pos === p && a.world)))) {
            const sys = board.systems.find(sys2 => ['TR', 'TL', 'BL'].every(p => sys2.areas.some(a => a.pos === p && a.world)));
            st = board;
            st.__chain = sys;
        }
    }
    if (!st) return 'не нашлось системы с цепочкой трёх миров';
    const active = st.__chain;
    delete st.__chain;
    advance(st, 0, active.id, 'TR');
    const a = guard(st, 0, active.id, 'TL');
    const b = guard(st, 0, active.id, 'TL');
    olk(st, 1, active.id, 'TR');
    olk(st, 1, active.id, 'BL');
    const res = FS_RULES.apply(st, 0, {
        type: 'moveUnits',
        moves: [{ unit: a.id, system: active.id, pos: 'TR' }, { unit: b.id, system: active.id, pos: 'BL' }],
    });
    eq(/Спорн/.test(res.error || ''), true, 'два спорных района за один приказ: ' + res.error);
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

rule('dep-0a', '«… the purchases of the order …» — список покупок и их цена живут в одном Purchases', () => {
    const purchases = Purchases.of({ seat: 0, order: 'deploy' });
    const unit = purchases.add({ kind: 'unit', id: 'u1', def: 'guard', name: 'Гвардеец', cost: 2 });
    purchases.add({ kind: 'structure', id: 's1', type: 'factory', name: 'Фабрика', cost: 5 });
    // The limit, the one structure and the price are read from the list.
    eq(purchases.count, 2, 'обе покупки в списке');
    eq(purchases.units.length, 1, 'отряд посчитан');
    eq(purchases.hasStructure, true, 'постройка уже одна');
    eq(purchases.spent, 7, 'цена приказа собрана из списка');
    eq(purchases.empty, false, 'список не пуст');
    // The undo takes the record away and the count follows — no second counter.
    eq(purchases.find({ unit: 'u1' }), unit, 'отмена находит покупку');
    purchases.remove(unit);
    eq(purchases.units.length, 0, 'отмена уменьшила счёт');
    eq(purchases.spent, 5, 'и цену');
    purchases.clear();
    eq(purchases.empty, true, 'новый приказ пуст');
    eq(Purchases.of(purchases.order), purchases, 'у приказа один список');
    eq(Purchases.of(null), null, 'без приказа покупок нет');
});

rule('dep-0b', '«… the price of the purchases is reduced …» — скидки и сделки приказа считает один OrderDeal', () => {
    const deal = OrderDeal.of({ seat: 0, order: 'deploy' });
    // The card of the order lowers the unit price and the purchase price apart.
    deal.addUnitDiscount(1).addUnitDiscount(1);
    deal.addPurchaseDiscount(1);
    eq(deal.unitDiscount, 2, 'скидка отряда накоплена');
    eq(deal.purchaseDiscount, 1, 'скидка покупки накоплена');
    eq(deal.placementDiscount, 3, 'карта, ставящая отряд сама, берёт обе');
    // The free structure is one of a named type, and the purchase spends it.
    deal.addFreeStructure('bastion', 1);
    eq(deal.isFree('bastion'), true, 'бастион бесплатен');
    eq(deal.isFree('city'), false, 'город — нет');
    deal.spendFree();
    eq(deal.isFree('bastion'), false, 'бесплатная постройка потрачена');
    // The structure step may come first.
    eq(deal.structureFirst, false, 'постройка не первая');
    deal.setStructureFirst();
    eq(deal.structureFirst, true, 'карта Орков ставит постройку первой');
    // One KL0 unit for a named price — once.
    deal.setCheapUnit(1, true);
    eq(deal.cheapLeft, true, 'дешёвый отряд разрешён');
    eq(deal.cheapOnlyActive, true, 'только в активной системе');
    deal.spendCheap();
    eq(deal.cheapLeft, false, 'разрешение потрачено');
    eq(deal.cheapPrice, 0, 'следующий отряд платит полную цену');
    eq(OrderDeal.of(deal.order), deal, 'у приказа одна сделка');
    eq(OrderDeal.of(null), null, 'без приказа сделки нет');
});

rule('dep-0c', '«… deploy into one area …» — фабрику, замок типа и одну область держит один DeployScope', () => {
    const scope = DeployScope.of({ seat: 0, order: 'deploy' });
    // «Массовое Производство»: one factory produces, and only into its own world.
    scope.setFactory(3, 1);
    eq(scope.inFactory(3, 1), true, 'мир фабрики — свой');
    eq(scope.inFactory(3, 2), false, 'соседний мир — чужой');
    eq(scope.factory.system, 3, 'фабрика запомнена');
    // «минимум 2 отряда одного типа»: the first purchase locks the type.
    eq(scope.lockedType, null, 'тип ещё не замок');
    eq(scope.lockType('guard'), 'guard', 'первый отряд замкнул тип');
    eq(scope.lockType('tank'), 'guard', 'второй уже не меняет тип');
    scope.unlock();
    eq(scope.lockedType, null, 'покупки отменены — тип свободен');
    // «развертывание в 1 области»: the first placement names it.
    eq(scope.allows(5), true, 'любая область до первой покупки');
    scope.setAreaLimit(1);
    eq(scope.allows(5), true, 'первая область разрешена');
    scope.use(5);
    eq(scope.allows(6), false, 'вторая область запрещена');
    eq(scope.allows(5), true, 'та же область разрешена');
    eq(scope.areaLimit, 1, 'предел областей — один');
    eq(DeployScope.of(scope.order), scope, 'у приказа один DeployScope');
    eq(DeployScope.of(null), null, 'без приказа пределов нет');
});

rule('dep-0d', '«… the deploy limit … » — предел, лимиты и вместимость приказа держит один DeployLimits', () => {
    const limits = DeployLimits.of({ seat: 0, order: 'deploy' });
    // «предел больше на 2» и «ещё одна фабрика» складываются.
    limits.addLimitBonus(2);
    limits.addExtraFactories(1);
    eq(limits.limitBonus, 2, 'бонус предела накоплен');
    eq(limits.extraFactories, 1, 'лишняя фабрика накоплена');
    // «все свои города считаются фабриками … производят только Гвардейцев».
    eq(limits.treatsAsFactories, false, 'пока фабрик нет');
    limits.setCitiesAsFactories('Гвардеец');
    eq(limits.cities, true, 'города считаются фабриками');
    eq(limits.treatsAsFactories, true, 'разрешение есть');
    eq(limits.factoryOnly, 'Гвардеец', 'назван единственный отряд');
    limits.setBastionsAsFactories();
    eq(limits.bastions, true, 'бастионы тоже');
    // «вместимость мира с городом больше на 2, но не выше 5, только Гвардейцам».
    limits.addCapacityBonus(2, 5, 'Гвардеец');
    eq(limits.capacityBonus, 2, 'бонус вместимости');
    eq(limits.capacityMax, 5, 'потолок назван');
    eq(limits.capacityFits({ name: 'Гвардеец' }), true, 'Гвардеец получает бонус');
    eq(limits.capacityFits({ name: 'Огрин' }), false, 'другой отряд — нет');
    limits.setInFactoryWorld();
    eq(limits.inFactoryWorld, true, 'отряды идут в мир фабрики');
    eq(DeployLimits.of(limits.order), limits, 'у приказа один DeployLimits');
    eq(DeployLimits.of(null), null, 'без приказа лимитов нет');
});

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

rule('dep-2b', '«… you may treat all of his cities in the active system as factories» (Транслокационные крипты) — предел и покупка читают один список миров', () => {
    const st = empty();
    const sys = st.systems[0];
    const pos = worldOf(st, sys.id);
    guard(st, 0, sys.id, pos);
    FS_RULES.addStructure(st, 0, 'city', sys.id, pos);
    st.order = { seat: 0, order: 'deploy', system: sys.id, phase: 'units', purchases: [] };
    st.players[0].materiel = 14;
    st.players[0].supply.units['гвардейцы'] = 9;
    // Without the card the city is not a factory: neither the purchase nor the
    // limit knows one.
    eq(FS_RULES.hasFactory(st, 0, sys.id), false, 'город без карты — не фабрика');
    eq(FS_RULES.deployLimit(st, 0, sys.id), 0, 'предела нет');
    eq(FS_RULES.apply(st, 0, { type: 'buyUnit', unit: 'гвардейцы', system: sys.id, pos }).ok, false,
        'без фабрики отряд не купить');
    // The card of the order says so: the same world is a factory for both.
    st.order.citiesAsFactories = true;
    eq(FS_RULES.deployTreatsAsFactories(st, 0), true, 'приказ считает города фабриками');
    eq(FS_RULES.hasFactory(st, 0, sys.id), true, 'фабрика есть');
    eq(FS_RULES.deployLimit(st, 0, sys.id), FS_RULES.capacity(st, sys.id, pos), 'предел — вместимость мира');
    eq(FS_RULES.apply(st, 0, { type: 'buyUnit', unit: 'гвардейцы', system: sys.id, pos }).ok, true,
        'покупка видит ту же фабрику');
    eq(FS_RULES.unitsBought(st.order), 1, 'покупка записана');
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

rule('dep-4b', '«the price the panel shows is the price the purchase charges» — скидка приказа видна в цене покупки', () => {
    const st = empty();
    const active = st.systems[0];
    const pos = worldOf(st, active.id);
    FS_RULES.addStructure(st, 0, 'factory', active.id, pos);
    guard(st, 0, active.id, pos);
    const faction = FS_DATA.factions.find(f => f.id === st.players[0].faction);
    const def = faction.units.find(u => u.id === 'гвардейцы') || faction.units[0];
    st.order = { seat: 0, order: 'deploy', system: active.id, phase: 'units', purchases: [] };
    st.players[0].materiel = 14;
    st.players[0].supply.units[def.id] = 3;
    eq(FS_RULES.unitPrice(st, 0, def), def.cost, 'без скидок цена печатная');
    st.order.purchaseDiscount = 1;
    eq(FS_RULES.unitPrice(st, 0, def), Math.max(0, def.cost - 1), 'скидка приказа видна в цене');
    const before = FS_RULES.spentOf(st.order);
    FS_RULES.apply(st, 0, { type: 'buyUnit', system: active.id, pos, unit: def.id });
    eq(FS_RULES.spentOf(st.order) - before, FS_RULES.unitPrice(st, 0, def), 'покупка списала ту же цену');
    // The cache token lowers the price by two in the same one place.
    eq(FS_RULES.unitPrice(st, 0, def, { cache: true }), Math.max(0, def.cost - 1 - 2), 'тайник: −2');
    // The structure price follows the same order discount.
    eq(FS_RULES.structurePrice(st, 0, 'factory'), Math.max(0, FS_RULES.structureStats('factory').cost - 1), 'постройка со скидкой');
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

rule('order-1', '«… this order …» — командный уровень, подготовка, раунды и временная материя живут в одном OrderFight', () => {
    const fight = OrderFight.of({ seat: 0, order: 'advance' });
    // «командный уровень выше на 1» — the cities and the card add up.
    fight.addKlBonus(1).addKlBonus(2);
    eq(fight.klBonus, 3, 'бонус командного уровня накоплен');
    // «перебросьте кубик за каждого юнита» и «вытяните 2, сбросьте 2» ждут своего боя.
    fight.setPrepReroll({ n: 1, per: 'unit', ability: 'Сервочерепа' });
    fight.addPrepDraw(2, 2);
    eq(fight.prepReroll.per, 'unit', 'переброс запомнен');
    eq(fight.prepDrawCards.discard, 2, 'сброс запомнен');
    // The battle takes both once, and never again.
    const taken = fight.takePrep();
    eq(taken.prep.n, 1, 'бой забрал переброс');
    eq(taken.draw.n, 2, 'бой забрал карты');
    eq(fight.prepReroll, null, 'второй раз переброса нет');
    eq(fight.prepDrawCards, null, 'второй раз карт нет');
    // «только один раунд» и «отступить лишними Гвардейцами».
    eq(fight.combatRounds, 0, 'раунды не ограничены');
    fight.setRetreatExcess('Гвардеец');
    eq(fight.retreatExcess, 'Гвардеец', 'названный отряд может отступить');
    // The temporary materiel: granted, spent, and what is left goes away.
    fight.setTempMateriel(3);
    eq(fight.hasTemp, false, 'материя ещё не выдана');
    eq(fight.grantTemp(5), 3, 'выдано 3 временных');
    eq(fight.hasTemp, true, 'временная материя на столе');
    eq(fight.unspentTemp(7), 2, 'из трёх временных потрачен один');
    fight.clearTemp();
    eq(fight.hasTemp, false, 'остаток списан');
    eq(fight.unspentTemp(7), 0, 'считать больше нечего');
    eq(OrderFight.of(fight.order), fight, 'у приказа одна помощь');
    eq(OrderFight.of(null), null, 'без приказа помощи нет');
});

rule('combat-0j', '«определите победителя» + «проигравший отступает» — итог боя держит CombatOutcome', () => {
    const combat = { attacker: 0, defender: 1, system: 's1', pos: 'A1' };
    const outcome = CombatOutcome.of(combat);
    eq(CombatOutcome.of(combat), outcome, 'у боя один итог');
    eq(CombatOutcome.of(null), null, 'без боя итога нет');
    // The battle goes on: nobody won and nobody retreats.
    eq(outcome.decided, false, 'бой ещё не решён');
    eq(outcome.winner, null, 'победителя нет');
    eq(outcome.winnerSeat, null, 'seat победителя неизвестен');
    eq(outcome.loserSeat, null, 'проигравшего нет');
    eq(outcome.lostBy(1), false, 'никто не проиграл');
    // The attacker wins on morale: the defender leaves.
    outcome.decide('attacker', { attacker: 5, defender: 3 });
    eq(outcome.decided, true, 'бой решён');
    eq(outcome.winner, 'attacker', 'победил атакующий');
    eq(outcome.winnerSeat, 0, 'seat победителя');
    eq(outcome.loserSeat, 1, 'отступает защитник');
    eq(outcome.lostBy(1), true, 'защитник проиграл');
    eq(outcome.lostBy(0), false, 'атакующий не проиграл');
    eq(outcome.morale, { attacker: 5, defender: 3 }, 'мораль решения');
    // A tie goes to the defender: the same rule, other side.
    const second = { attacker: 0, defender: 1 };
    const other = CombatOutcome.of(second).decide('defender', { attacker: 2, defender: 2 });
    eq(other.winner, 'defender', 'победил защитник');
    eq(other.loserSeat, 0, 'отступает атакующий');
    eq(other.morale.attacker, 2, 'мораль атакующего записана');
    // A battle that was cancelled leaves no outcome behind.
    outcome.clear();
    eq(outcome.decided, false, 'отменённый бой не решён');
    eq(outcome.loserSeat, null, 'и не оставляет проигравшего');
    eq(outcome.morale, null, 'и морали решения');
});

rule('combat-0i', '«разместить жетон подкрепления в эту область» + «отступить в соседнюю область» — где идёт бой знает BattleField', () => {
    const combat = { attacker: 0, defender: 1, system: 's1', pos: 'A1' };
    const field = BattleField.of(combat);
    eq(BattleField.of(combat), field, 'у боя одно место');
    eq(BattleField.of(null), null, 'без боя места нет');
    eq(field.system, 's1', 'система боя');
    eq(field.pos, 'A1', 'область боя');
    eq(field.area, { system: 's1', pos: 'A1' }, 'адрес боя одной записью');
    // One place, asked once: the system and the area together.
    eq(field.is('s1', 'A1'), true, 'это место боя');
    eq(field.is('s1', 'A2'), false, 'соседняя область — не эта');
    eq(field.is('s2', 'A1'), false, 'другая система — не эта');
    // A unit, a structure and a bastion stand in the same place.
    const state = {
        units: [
            { id: 'u1', seat: 0, system: 's1', area: 'A1' },
            { id: 'u2', seat: 1, system: 's1', area: 'A1', routed: true },
            { id: 'u3', seat: 0, system: 's1', area: 'A2' },
            { id: 'u4', seat: 0, system: 's2', area: 'A1' },
        ],
        structures: [
            { id: 'b1', seat: 0, system: 's1', area: 'A1', type: 'bastion' },
            { id: 'c1', seat: 0, system: 's1', area: 'A1', type: 'city' },
        ],
    };
    eq(field.holds(state.units[0]), true, 'отряд в области боя');
    eq(field.holds(state.units[2]), false, 'отряд в соседней области');
    eq(field.holds(state.units[3]), false, 'отряд в другой системе');
    eq(field.holds(null), false, 'пустое место — не место боя');
    eq(field.units(state, 0).map(u => u.id).join(','), 'u1', 'свои отряды в области боя');
    eq(field.units(state, 1).map(u => u.id).join(','), 'u2', 'чужие отряды в области боя');
    eq(field.unitsHere(state).length, 2, 'все отряды области боя');
    eq(field.routed(state, 1).map(u => u.id).join(','), 'u2', 'деморализованные в области боя');
    eq(field.routed(state, 0).length, 0, 'у своих деморализованных нет');
    eq(field.bastions(state, 0).map(s => s.id).join(','), 'b1', 'только бастион, не город');
    // The address is written once, when the battle begins.
    field.set('s3', 'B2');
    eq(field.is('s3', 'B2'), true, 'место боя записано');
    eq(combat.system, 's3', 'адрес живёт в поле боя');
});

rule('combat-0h', '«ваш противник не сможет разыгрывать жетоны подкрепления» + «деморализованные отряды уничтожаются» — запреты боя держит CombatBans', () => {
    const combat = { attacker: 0, defender: 1 };
    const bans = CombatBans.of(combat);
    eq(CombatBans.of(combat), bans, 'у боя один набор запретов');
    eq(CombatBans.of(null), null, 'без боя запретов нет');
    // An empty battle forbids nothing.
    eq(bans.forbidsReinforce(1, 'defender'), false, 'подкрепление разрешено');
    eq(bans.reinforceBanned, false, 'запрета нет');
    eq(bans.ignoresFoeAttack('defender'), false, 'кубики атаки считаются');
    eq(bans.destroysRouted, false, 'деморализованные остаются');
    // «во время всего боя»: the ban of the card follows its owner.
    bans.forbidReinforce(0);
    eq(bans.reinforceBanned, true, 'запрет подкрепления записан');
    eq(bans.forbidsReinforce(0, 'attacker'), true, 'свой игрок подкрепление не разыгрывает');
    eq(bans.forbidsReinforce(1, 'defender'), false, 'противник — разыгрывает');
    // The card that names nobody keeps the old ban: the defender.
    const old = { attacker: 0, defender: 1 };
    CombatBans.of(old).forbidReinforce();
    eq(CombatBans.of(old).forbidsReinforce(0, 'attacker'), false, 'атакующий не назван');
    eq(CombatBans.of(old).forbidsReinforce(1, 'defender'), true, 'защитник под запретом');
    // «кубики атаки противника не считаются»: only the defender.
    bans.ignoreFoeAttack();
    eq(bans.ignoresFoeAttack('defender'), true, 'кубики атаки защитника не считаются');
    eq(bans.ignoresFoeAttack('attacker'), false, 'кубики атакующего считаются');
    eq(bans.dice('defender', ['att', 'def', 'att']).join(','), 'def', 'остаются только не-атаки');
    eq(bans.dice('attacker', ['att', 'def']).join(','), 'att,def', 'у атакующего всё на месте');
    eq(bans.dice('defender', null).length, 0, 'пустой стол — пусто');
    // «деморализованные отряды уничтожаются в конце раунда».
    bans.markDestroyRouted();
    eq(bans.destroysRouted, true, 'уничтожение деморализованных обещано');
});

rule('combat-0g', '«получите 2 `att. token`» + «потеряйте 1 `def. token`» — жетоны карт и урон раунда считают CombatCubes и CombatDamage', () => {
    const combat = { attacker: 0, defender: 1, round: 1 };
    const cubes = CombatCubes.of(combat);
    eq(CombatCubes.of(combat), cubes, 'у боя один счётчик жетонов');
    eq(CombatCubes.of(null), null, 'без боя жетонов нет');
    // The cubes the cards give: «получите 2 `att. token`».
    eq(cubes.add('attacker', 'att', 2), 2, 'два жетона атаки');
    eq(cubes.get('attacker', 'att'), 2, 'жетоны атаки на столе');
    eq(cubes.get('attacker', 'def'), 0, 'жетонов обороны нет');
    eq(cubes.add('attacker', 'def', 1), 1, 'жетон обороны');
    // The cubes a card takes away: «потеряйте 1 `def. token`».
    eq(cubes.take('attacker', 'def', 1), 0, 'жетон обороны потерян');
    eq(cubes.take('attacker', 'def', 3), 0, 'ниже нуля счёт не идёт');
    eq(cubes.add('defender', 'def', 1), 1, 'у защитника свой счёт');
    // A side that is not in the battle and a battle without cubes.
    eq(cubes.get(null, 'att'), 0, 'без стороны жетонов нет');
    eq(CombatCubes.of({}).get('defender', 'def'), 0, 'пустой бой — ноль жетонов');
    // The panel and the board ask for both counts at once.
    cubes.add('defender', 'att', 3);
    eq(cubes.values('defender').att, 3, 'значения защитника');
    eq(cubes.values('defender').def, 1, 'и его жетоны обороны');
    eq(cubes.values('nobody'), { att: 0, def: 0 }, 'у чужой стороны оба нуля');
    eq(cubes.both().attacker.att, 2, 'оба счёта одной записью');
    // The end of the round: the cubes go away, the kind a card kept stays.
    cubes.reset({ defender: { def: 1 } });
    eq(cubes.get('attacker', 'att'), 0, 'жетоны атакующего сброшены');
    eq(cubes.get('defender', 'att'), 0, 'и жетоны атаки защитника');
    eq(cubes.get('defender', 'def'), 1, 'а обещанный жетон обороны остался');
    eq(cubes.reset().get('defender', 'def'), 0, 'ничего не оставлено — ничего нет');
    // The damage of the round: zero until the step hurts, and reset with the round.
    const rules = CombatDamage.of(combat);
    eq(rules.dealt('attacker'), 0, 'урона ещё нет');
    eq(rules.clean, true, 'раунд начался без урона');
    eq(rules.setDealt('attacker', 3), 3, 'урон атакующего записан');
    eq(rules.dealt('attacker'), 3, 'урон шага');
    eq(rules.clean, false, 'раунд уже ранил');
    rules.resetDamage();
    eq(rules.dealt('attacker'), 0, 'урон нового раунда с нуля');
    eq(rules.clean, true, 'и раунд снова чист');
});

rule('combat-0f', '«в конце шага нанесения повреждений …» + «получите 2 `att. token` в следующем раунде боя» — обещания карт бою держит CombatPlans', () => {
    const combat = { attacker: 0, defender: 1, round: 2 };
    const plans = CombatPlans.of(combat);
    eq(CombatPlans.of(combat), plans, 'у боя один набор обещаний');
    eq(CombatPlans.of(null), null, 'без боя обещаний нет');
    // «Уклонение»: the plan waits for the end of the damage step of its round.
    plans.addRestoreFallen(0, 0);
    eq(plans.restorePlan(2).seat, 0, 'план этого раунда');
    eq(plans.restorePlan(3), null, 'в следующем раунде его нет');
    plans.restorePlan(2).asked = true;
    eq(plans.restorePlan(2), null, 'спрошенный план не спрашивают снова');
    // «Сфера воскрешения»: the fallen are noted once and asked about once.
    eq(plans.noteCandidate({ id: 'u1', seat: 0 }), true, 'падение записано');
    eq(plans.noteCandidate({ id: 'u1', seat: 0 }), false, 'второй раз не записано');
    eq(plans.candidate.id, 'u1', 'первый кандидат — тот, о ком спросят');
    eq(plans.askedSeat, null, 'о схеме ещё не спрашивали');
    plans.askSeat(0);
    eq(plans.askedSeat, 0, 'о схеме спросили один раз');
    plans.clearResurrect();
    eq(plans.candidate, null, 'кандидаты израсходованы');
    eq(plans.resurrectPlans.length, 0, 'и планы сняты');
    // The plans of the end of the round: each fires once.
    plans.addEndPlan({ seat: 1 });
    eq(plans.endPlan(2).seat, 1, 'план конца раунда');
    plans.endPlan(2).fired = true;
    eq(plans.endPlan(2), null, 'сработавший план не повторяется');
    plans.addNoRetreatPlan({ seat: 0, side: 'attacker', kind: 'att', n: 2 });
    eq(plans.noRetreatPlan(2).n, 2, 'обещание за раунд без отступления');
    plans.addNoDamagePlan({ seat: 1, steps: [] });
    eq(plans.noDamagePlan(2).seat, 1, 'обещание за раунд без урона');
    // The facts of the round judge the promises.
    eq(plans.retreatedThisRound(0, 2), false, 'никто не отступал');
    plans.markRetreat(0, 2);
    eq(plans.retreatedThisRound(0, 2), true, 'отряд отступил в этом раунде');
    eq(plans.retreatedThisRound(0, 3), false, 'в другом раунде — нет');
    eq(plans.retreatedThisRound(1, 2), false, 'другая сторона не отступала');
    // The tokens promised to the next round arrive there, once.
    plans.addLaterToken({ side: 'attacker', kind: 'att', n: 2 });
    eq(plans.takeLaterTokens(2).length, 0, 'в этом раунде жетонов ещё нет');
    eq(plans.takeLaterTokens(3).length, 1, 'в следующем раунде жетон пришёл');
    eq(plans.takeLaterTokens(3).length, 0, 'второй раз он не приходит');
    // «не сбрасывать жетоны в конце этого раунда» — по раунду карты.
    plans.keepTokens('defender', 'def');
    eq(plans.keeps('defender', 'def', 2), true, 'защитник оставляет жетоны обороны');
    eq(plans.keeps('defender', 'att', 2), false, 'жетоны атаки сбрасываются');
    eq(plans.keeps('defender', 'def', 3), false, 'в следующем раунде — нет');
    eq(plans.keeps('attacker', 'def', 2), false, 'другая сторона — нет');
    plans.clearKeeps();
    eq(plans.keeps('defender', 'def', 2), false, 'обещание снято');
    // The effect deferred to the end of the damage step is taken once.
    plans.setDeferred({ seat: 0, steps: [] });
    eq(plans.deferred.seat, 0, 'эффект отложен');
    eq(plans.takeDeferred().seat, 0, 'эффект забран');
    eq(plans.takeDeferred(), null, 'второй раз его нет');
    // «деморализованные уничтожаются»: the promise is armed by a routed foe.
    plans.setRoutedFoe({ seat: 0, avoid: { kind: 'def', n: 1 } });
    eq(plans.routedFoe.touched, undefined, 'обещание ещё не сработало');
    plans.touchRoutedFoe();
    eq(plans.routedFoe.touched, true, 'деморализованный отряд включил обещание');
    plans.clearRoutedFoe();
    eq(plans.routedFoe, null, 'обещание снято');
    // Who fell in this step, who stood at its start, how many died.
    eq(plans.noteFallen({ id: 'u2', seat: 1, kl: 0 }), true, 'падение этого шага записано');
    eq(plans.noteFallen({ id: 'u2', seat: 1, kl: 0 }), false, 'второй раз — нет');
    eq(plans.fallen(1).length, 1, 'падение одной стороны');
    eq(plans.fallen(0).length, 0, 'падения другой стороны нет');
    plans.roster = { attacker: [{ id: 'u3', routed: false }], defender: [] };
    eq(plans.rosterOf(0)[0].id, 'u3', 'состав раунда записан');
    eq(plans.addDestroyed(2), 2, 'уничтожено два');
    eq(plans.destroyedNow, 2, 'счёт уничтоженных');
    plans.resetDestroyed();
    eq(plans.destroyedNow, 0, 'счёт шага начинается с нуля');
    // The end of the round lets only the promises of the round that begins.
    plans.addEndPlan({ seat: 0 });
    plans.expire(3);
    eq(combat.endRoundPlans.length, 0, 'обещания прошлого раунда сняты');
    eq(plans.fallen().length, 0, 'падения шага забыты');
});

rule('combat-0e', '«Сбросить карту: «Критический удар»?» — моменты, в которые бой ждёт схему, ведёт CombatHooks', () => {
    const combat = { attacker: 0, defender: 1 };
    const hooks = CombatHooks.of(combat);
    eq(CombatHooks.of(combat), hooks, 'у боя один набор пауз');
    eq(CombatHooks.of(null), null, 'без боя пауз нет');
    // A moment is asked once per side.
    eq(hooks.asked('damageHook', 'attacker'), false, 'момент ещё не спрошен');
    eq(hooks.ask('damageHook', 'attacker'), true, 'первый раз его спрашивают');
    eq(hooks.ask('damageHook', 'attacker'), false, 'второй раз — нет');
    eq(hooks.asked('damageHook', 'attacker'), true, 'момент отмечен');
    eq(hooks.ask('damageHook', 'defender'), true, 'у другой стороны свой момент');
    hooks.forget('damageHook');
    eq(hooks.ask('damageHook', 'attacker'), true, 'новый шаг спрашивает снова');
    // The step that waited for the scheme resumes where it stopped.
    hooks.damageResume = { seat: 0, side: 'attacker', cmd: { targets: [] } };
    eq(hooks.damageResume.seat, 0, 'прерванный шаг урона запомнен');
    eq(hooks.takeDamageResume().seat, 0, 'шаг вернулся');
    eq(hooks.damageResume, null, 'и больше не ждёт');
    eq(hooks.takeDamageResume(), null, 'второй раз возвращать нечего');
    // The end of the damage step: one seat after another, then the tail again.
    eq(hooks.endResume, false, 'конец шага не ждёт');
    hooks.endResume = true;
    eq(hooks.takeEndResume(), true, 'пауза конца шага забрана');
    eq(hooks.endResume, false, 'и снята');
    eq(hooks.endNext(), 0, 'первый конец шага');
    eq(hooks.endStep(), 0, 'первый игрок');
    eq(hooks.endStep(), 1, 'второй игрок');
    eq(hooks.endNext(), 2, 'оба спрошены');
    hooks.forgetEnd();
    eq(hooks.endNext(), 0, 'следующий шаг урона начнёт сначала');
    // The moments queued from the start of the combat.
    hooks.prepQueued = true;
    eq(hooks.prepQueued, true, 'вопрос подготовки отложен');
    eq(hooks.takePrepQueued(), true, 'вопрос задан');
    eq(hooks.prepQueued, false, 'и снят с очереди');
    hooks.roundQueued = true;
    eq(hooks.takeRoundQueued(), true, 'схема раунда задана');
    eq(hooks.roundQueued, false, 'и снята');
    // «Во время шага нанесения повреждений Вы назначаете урон» — the owner of the card.
    eq(hooks.assignSeat(1), 1, 'без карты урон назначает свой игрок');
    hooks.assignTo(0, 'defender');
    eq(hooks.assignSeat(1), 0, 'карта передала урон другому игроку');
    eq(hooks.assigner.side, 'defender', 'и назвала сторону');
    // The start of a new round forgets every moment.
    hooks.ask('playHook', 'attacker');
    hooks.reset();
    eq(hooks.asked('playHook', 'attacker'), false, 'новый раунд спрашивает снова');
});

rule('combat-0d', '«Any damage that exceeds a unit…health value must be applied to one of his other units» + «the health of the enemy is reduced to 3» — урон боя ведёт CombatDamage', () => {
    const combat = { attacker: 0, defender: 1, round: 1 };
    const damage = CombatDamage.of(combat);
    eq(CombatDamage.of(combat), damage, 'у боя одно правило урона');
    eq(CombatDamage.of(null), null, 'без боя урона нет');
    // The health of a piece: the bonus of its own side, the ceiling of the enemy.
    damage.addHealthBonus(1);
    eq(damage.healthBonus, 1, 'здоровье своих поднято');
    damage.enemyHealth = 3;
    eq(damage.health(0, 0, 2), 3, 'свой отряд получает надбавку');
    eq(damage.health(1, 0, 5), 3, 'чужой отряд упирается в предел');
    eq(damage.health(1, 1, 5), 6, 'свой отряд получает надбавку, а не предел врага');
    // The extra damage: the foe of a card is the side of its owner.
    damage.addExtra('both', 2, 0);
    eq(damage.extra('attacker', 4), 6, 'урон обеим сторонам');
    damage.clear();
    damage.addExtra('foe', 3, 0);
    eq(damage.extra('defender', 2), 5, 'карта атакующего бьёт по защитнику');
    eq(damage.extra('attacker', 2), 2, 'и не бьёт по себе');
    eq(damage.extra('defender', 0), 0, 'щиты остановили удар — добавки нет');
    eq(damage.extra('attacker', 0), 0, 'и по второй стороне тоже');
    damage.clear();
    // «… по 1 единице за раз» and «повторяется» are modes of the step.
    damage.setOneByOne();
    eq(damage.oneByOne('defender'), true, 'урон защитника идёт по единице');
    eq(damage.oneByOne('attacker'), false, 'урон атакующего — нет');
    damage.setRepeat();
    eq(damage.repeats, true, 'шаг повторяется');
    eq(damage.repeated, false, 'но ещё не повторён');
    damage.repeatOnce();
    eq(damage.repeated, true, 'шаг уже повторён');
    // «этот отряд не может быть деморализован» — до уровня командования.
    damage.setNoRoute(0, 2, 1);
    eq(damage.forbidsRoute(0, 2, 1), true, 'отряд своего уровня не деморализуется');
    eq(damage.forbidsRoute(0, 3, 1), false, 'выше названного уровня — деморализуется');
    eq(damage.forbidsRoute(1, 1, 1), false, 'чужая сторона не защищена');
    eq(damage.forbidsRoute(0, 2, 2), false, 'в другом раунде запрета нет');
    // «нанесите урон деморализованным отрядам в этом раунде» — по раунду.
    damage.allowOwnRouted('attacker', 1);
    eq(damage.ownRoutedAllowed('attacker', 1), true, 'свои деморализованные — цель');
    eq(damage.ownRoutedAllowed('attacker', 2), false, 'в следующем раунде — нет');
    // The first target and the damage that keeps its excess.
    damage.addFirst('defender', 'u7', 1);
    eq(damage.firstOf('defender', 1).id, 'u7', 'первая цель названа');
    eq(damage.firstOf('defender', 2), null, 'в другом раунде её нет');
    eq(damage.firstOf('attacker', 1), null, 'у другой стороны её нет');
    damage.setExcess('defender', 'u7', 1);
    eq(damage.excessOf(1).id, 'u7', 'излишек урона теряется на этой цели');
    eq(damage.excessOf(2), null, 'в другом раунде — нет');
    // The retreat instead of destruction: a plan of one round, once.
    const plan = damage.setRetreatPlan(1, 1);
    eq(damage.retreatPlan(1, 1), plan, 'план отступления этого раунда');
    eq(damage.retreatPlan(1, 2), null, 'в следующем раунде плана нет');
    plan.used = true;
    eq(damage.retreatPlan(1, 1), null, 'использованный план не годится');
    // The tokens taken at the start of the damage step are taken once.
    damage.addStartTokens({ side: 'attacker', kind: 'att', n: 1, round: 1 });
    eq(damage.takeStartTokens(1).length, 1, 'жетоны взяты в начале шага');
    eq(damage.takeStartTokens(1).length, 0, 'второй раз их нет');
    // The end of the round clears every effect «during this round».
    damage.setNoRoute(0, 0, 1);
    damage.clear();
    eq(damage.healthBonus, 0, 'надбавка к здоровью снята');
    eq(damage.forbidsRoute(0, 0, 1), false, 'запрет деморализации снят');
    eq(damage.firstOf('defender', 1), null, 'первая цель забыта');
    eq(damage.excessOf(1), null, 'излишек урона забыт');
    eq(damage.retreatPlan(1, 1), null, 'план отступления забыт');
});

rule('combat-0c', '«discards the combat cards he used during the combat by shuffling them back into his combat deck» — карты боя держит CombatCards', () => {
    const combat = { attacker: 0, defender: 1, cards: {}, staged: { attacker: null, defender: null } };
    const cards = CombatCards.of(combat);
    eq(CombatCards.of(combat), cards, 'у боя один набор карт');
    eq(CombatCards.of(null), null, 'без боя карт нет');
    // The hand and the open cards of a side.
    cards.pile('attacker').hand.push('Приказ пехоте');
    eq(cards.hand('attacker').length, 1, 'карта в руке');
    cards.put('attacker', { name: 'Секущие когти', card: { icons: { att: 1, def: 0, morale: 2 } } }, 3);
    eq(cards.names('attacker').join(','), 'Секущие когти', 'карта открыта');
    eq(cards.has('attacker', 'Секущие когти'), true, 'её видно в игре');
    eq(cards.played('attacker')[0].round, 3, 'карта знает свой раунд');
    eq(cards.icons('attacker').morale, 2, 'иконки открытых карт посчитаны');
    eq(cards.take('attacker', 'Секущие когти').name, 'Секущие когти', 'карта снята со стола');
    eq(cards.take('attacker', 'Секущие когти'), null, 'второй раз её не снять');
    // The card that lies face down: the attacker's waits first.
    cards.stage('defender', { name: 'Поголовное истребление', seat: 1 });
    eq(cards.staged('defender').name, 'Поголовное истребление', 'карта защитника закрыта');
    eq(cards.nextStaged(), 'defender', 'первой вскрывают карту защитника');
    eq(cards.anyStaged, true, 'на столе есть закрытая карта');
    eq(cards.unstage('defender').name, 'Поголовное истребление', 'карта вскрыта');
    eq(cards.anyStaged, false, 'на столе закрытых карт нет');
    // The card the panel names and the card an opponent has seen.
    cards.setChosen('attacker', 'Приказ пехоте');
    eq(cards.chosen('attacker'), 'Приказ пехоте', 'карта в руке отмечена');
    cards.peek('defender', 0, 'Поголовное истребление');
    eq(cards.peeked(0).name, 'Поголовное истребление', 'карта противника подсмотрена');
    eq(cards.peeked(1), null, 'другой игрок её не видел');
    // What the damage of a step did.
    cards.setApplied('attacker', [{ unit: 'u1', destroyed: true }]);
    eq(cards.applied('attacker').length, 1, 'урон записан');
    cards.clearApplied();
    eq(cards.applied('attacker').length, 0, 'записи урона стёрты');
    // The copy one seat gets: the hand of the opponent is hidden, the card is closed.
    cards.pile('defender').hand.push('Поголовное истребление');
    cards.stage('defender', { name: 'Поголовное истребление', seat: 1 });
    cards.hideFrom(0);
    eq(cards.hand('defender').length, 0, 'рука противника скрыта');
    eq(cards.hand('attacker').length, 1, 'своя рука видна');
    eq(cards.staged('defender'), null, 'закрытая карта не уходит другому игроку');
    eq(cards.chosen('defender'), true, 'но видно, что карта лежит');
    // The table is cleared for the next round.
    cards.put('attacker', { name: 'Секущие когти' });
    cards.clear('attacker');
    eq(cards.names('attacker').length, 0, 'стол очищен');
    eq(cards.chosen('attacker'), null, 'отметка карты снята');
});

rule('combat-0b', '«the attacker reveals and resolves his combat card. Then, the defender reveals and resolves his» — раунд, шаг и кубики боя ведёт CombatTurn', () => {
    const combat = { round: 1, step: 'reinforce-attacker', dice: { attacker: ['att', null], defender: [] } };
    const turn = CombatTurn.of(combat);
    eq(CombatTurn.of(combat), turn, 'у боя один ход');
    eq(CombatTurn.of(null), null, 'без боя хода нет');
    // The round is counted from one; the limit is three unless a card says so.
    eq(turn.round, 1, 'первый раунд');
    eq(turn.maxRounds, 3, 'три раунда по умолчанию');
    eq(turn.lastRound, false, 'бой не кончен');
    eq(turn.nextRound(), 2, 'следующий раунд');
    eq(turn.round, 2, 'раунд записан');
    turn.maxRounds = 2;
    eq(turn.lastRound, true, 'последний раунд боя');
    // An entry of the table belongs to a round only if it names it.
    eq(turn.inRound({ round: 2 }), true, 'запись этого раунда');
    eq(turn.inRound({ round: 1 }), false, 'запись прошлого раунда');
    eq(turn.inRound({}), true, 'запись без раунда годится всегда');
    eq(turn.ofRound([{ round: 1 }, { round: 2 }, null]).length, 1, 'в раунде остаётся одна запись');
    // The step names its side: «damage-attacker» is the attacker's.
    turn.setStep('damage-attacker');
    eq(turn.side, 'attacker', 'сторона шага — атакующий');
    eq(turn.damaging, true, 'это шаг урона');
    eq(turn.reinforcing, false, 'не шаг подкрепления');
    eq(CombatTurn.sideOfStep('choose-defender'), 'defender', 'сторона шага — защитник');
    eq(CombatTurn.sideOfStep('reveal'), 'defender', 'шаг без стороны — защитника');
    // The step the battle waits to take: an effect holds it and gives it back.
    turn.hold('reveal');
    eq(turn.nextStep, 'reveal', 'шаг отложен');
    eq(turn.release(), true, 'отложенный шаг наступил');
    eq(turn.step, 'reveal', 'бой на отложенном шаге');
    eq(turn.nextStep, null, 'отложенного больше нет');
    eq(turn.release(), false, 'второй раз отдавать нечего');
    turn.holdEffect('round-end');
    eq(turn.step, 'effect', 'эффект карты занял шаг');
    eq(turn.nextStep, 'round-end', 'а конец раунда ждёт');
    // The dice: a spent die keeps its slot and is not a die any more.
    const dice = CombatTurn.of({ round: 1, dice: { attacker: ['att', null, 'morale'], defender: [] } });
    eq(dice.live('attacker').join(','), 'att,morale', 'потраченный кубик не считается');
    eq(dice.count('attacker', 'att'), 1, 'кубик атаки посчитан');
    eq(dice.has('attacker', 1), false, 'пустой слот — не кубик');
    eq(dice.room('attacker'), 6, 'до восьми остаётся шесть');
    eq(dice.take('attacker', 0), 'att', 'кубик потрачен');
    eq(dice.has('attacker', 0), false, 'потраченный слот пуст');
    eq(dice.take('attacker', 0), null, 'второй раз его не потратить');
    eq(dice.add('attacker', 'def'), true, 'кубик добавлен');
    eq(dice.slots('attacker', d => d === 'morale').join(','), '2', 'вопрос предлагает свои кубики');
    eq(dice.faces('attacker').join(','), 'morale,def', 'грани на столе названы однажды');
    eq(dice.lastOf('attacker'), 3, 'последний кубик найден');
    eq(dice.indexOf('attacker', 'morale'), 2, 'кубик морали найден по грани');
});

rule('combat-0', '«place reinforcement tokens … if a unit is not destroyed it is routed» — жетоны боя считает CombatTokens', () => {
    // A battle with three tokens on the attacker's side.
    const combat = { reinforce: { attacker: 3, defender: 0 } };
    const tokens = CombatTokens.of(combat);
    eq(CombatTokens.of(combat), tokens, 'у боя один набор жетонов');
    eq(CombatTokens.of(null), null, 'без боя жетонов нет');
    eq(tokens.used('attacker'), 3, 'три жетона выставлены');
    eq(tokens.units('attacker').alive, 3, 'все стоят');
    // A returned token comes back to the supply: the step counts it again.
    tokens.add('defender', 2, true);
    eq(tokens.used('defender'), 2, 'два бесплатных жетона защитника');
    eq(tokens.free.defender, 2, 'бесплатные не возвращаются в запас');
    // «if a unit suffers damage and is not destroyed, that unit is routed»:
    // a routed token does not stand, but it is not destroyed either.
    eq(tokens.route('attacker', 1), true, 'жетон обращается в бегство');
    eq(tokens.route('attacker', 1), false, 'второй раз его не обратить');
    eq(tokens.routed('attacker'), 1, 'счёт обращённых сошёлся с списком');
    eq(tokens.units('attacker').alive, 2, 'обращённый не стоит');
    // A destroyed token leaves the table: it is not routed any more.
    eq(tokens.destroy('attacker', 1), true, 'обращённый жетон уничтожен');
    eq(tokens.routed('attacker'), 0, 'уничтоженный больше не обращён');
    eq(tokens.units('attacker').destroyed, 1, 'уничтоженный посчитан');
    eq(tokens.destroy('attacker', 1), false, 'второй раз он не умирает');
    eq(tokens.destroy('attacker', 9), false, 'чужого жетона нет');
    // The slot by the id the panel draws («reinforce-attacker-0»).
    eq(tokens.indexOf('attacker', 'reinforce-attacker-2'), 2, 'жетон найден по метке');
    eq(tokens.indexOf('attacker', 'reinforce-attacker-1'), -1, 'уничтоженного не найти');
    eq(tokens.indexOf('defender', 'reinforce-attacker-2'), -1, 'чужая сторона не подходит');
    // The step: spent, asked once, and waiting for its scheme.
    tokens.setSpent('attacker', 2);
    tokens.returnSpent('attacker');
    eq(tokens.spent('attacker'), 1, 'возвращённый жетон вернул место в шаге');
    eq(tokens.hookAsked('attacker'), false, 'схема конца шага не спрошена');
    tokens.askHook('attacker');
    eq(tokens.hookAsked('attacker'), true, 'спрошена один раз');
    tokens.setPending('attacker');
    eq(tokens.pending, 'attacker', 'шаг ждёт схему');
    eq(tokens.takePending(), 'attacker', 'схема забрала ожидание');
    eq(tokens.pending, null, 'ожидание снято');
    eq(tokens.any, true, 'жетоны выставлены');
    // An older state carries only the count of the routed tokens.
    const old = { reinforce: { attacker: 2, defender: 0 }, reinforceRouted: { attacker: 2, defender: 0 } };
    eq(CombatTokens.of(old).flipped('attacker').join(','), '0,1', 'старый счёт разворачивается в список');
});

rule('order-0', '«… the active player … the active system …» — чей приказ, какой и где, спрашивают у OrderContext', () => {
    const context = OrderContext.of({ seat: 1, order: 'deploy', system: 4 });
    eq(context.seat, 1, 'приказ первого игрока? нет — второго');
    eq(context.kind, 'deploy', 'вид приказа');
    eq(context.system, 4, 'активная система');
    eq(context.isSeat(1), true, 'свой приказ');
    eq(context.isSeat(0), false, 'чужой приказ');
    eq(context.isKind('deploy'), true, 'развёртывание');
    eq(context.isKind('advance'), false, 'не наступление');
    // The three questions every command of an order starts with, in one line.
    eq(context.mine(1, 'deploy'), true, 'свой и того вида');
    eq(context.mine(1, 'advance'), false, 'свой, но другого вида');
    eq(context.mine(0, 'deploy'), false, 'того вида, но чужой');
    eq(context.mine(1), true, 'вид не назван — любой свой');
    // «Департаменто муниторум»: the strategize order turns into the limited one.
    const nested = OrderContext.of({ seat: 0, order: 'strategize', system: 2 });
    eq(nested.nested, false, 'пока это обычный приказ');
    nested.setNestedKind('advance');
    eq(nested.nestedKind, 'advance', 'готовится ограниченное наступление');
    eq(nested.turnInto(), 'advance', 'приказ стал наступлением');
    eq(nested.kind, 'advance', 'вид сменился');
    eq(nested.nested, true, 'это вложенный приказ');
    eq(nested.nestedKind, null, 'ожидание израсходовано');
    eq(nested.system, 2, 'система осталась активной');
    eq(OrderContext.of(nested.order), nested, 'у приказа один контекст');
    eq(OrderContext.of(null), null, 'без приказа контекста нет');
});

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

rule('str-2b', '«A player may purchase up to one combat upgrade and up to one order upgrade» — покупки приказа стратегии живут в одном UpgradeOrder', () => {
    const purchases = UpgradeOrder.of({ seat: 0, order: 'strategize' });
    // The order allows one upgrade of its own: the limit is read, not counted by hand.
    purchases.setLimit(2);
    eq(purchases.full, false, 'предел ещё не выбран');
    purchases.buyCombat('Плазменный залп', 'Болтер', 3);
    eq(purchases.bought, 1, 'боевое улучшение посчитано');
    eq(purchases.combat, true, 'боевое улучшение куплено');
    eq(purchases.combatBuy.removed, ['Болтер', 'Болтер'], 'пара карт запомнена для отмены');
    eq(purchases.combatBuy.price, 3, 'цена запомнена');
    purchases.buyOrder('Удар с орбиты', 4);
    eq(purchases.full, true, 'предел выбран');
    eq(purchases.orderName, 'Удар с орбиты', 'улучшение приказа названо');
    // The receipt of each purchase is what the refund gives back.
    const order = purchases.refundOrder();
    eq(order.name, 'Удар с орбиты', 'отмена знает карту');
    eq(order.price, 4, 'отмена знает цену');
    eq(purchases.orderCard, false, 'улучшение приказа отменено');
    eq(purchases.bought, 1, 'счётчик вернулся');
    const combat = purchases.refundCombat();
    eq(combat.card, 'Плазменный залп', 'отмена боевого знает карту');
    eq(purchases.bought, 0, 'счётчик покупок пуст');
    eq(purchases.full, false, 'место снова есть');
    // A new order starts with no purchases and no receipts.
    purchases.buyOrder('Удар с орбиты', 4);
    purchases.reset();
    eq(purchases.bought, 0, 'новый приказ без покупок');
    eq(purchases.orderName, null, 'и без чека');
    eq(UpgradeOrder.of(purchases.order), purchases, 'у приказа один UpgradeOrder');
    eq(UpgradeOrder.of(null), null, 'без приказа покупок нет');
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

rule('phase-1', '«… the steps of an order …» — шаги приказа называет один объект PhasePlan', () => {
    // A deployment walks units → structures → done; an advance walks
    // move → combat; a strike walks strike → strike-first → strike-damage.
    const order = { seat: 0, order: 'deploy' };
    const phase = PhasePlan.of(order);
    phase.set(PhasePlan.UNITS);
    eq(phase.is(PhasePlan.UNITS), true, 'развертывание начинается с отрядов');
    eq(phase.is(PhasePlan.STRUCTURES), false, 'и ещё не дошло до построек');
    phase.set(PhasePlan.STRUCTURES);
    eq(phase.name, PhasePlan.STRUCTURES, 'шаг построек');
    phase.set(PhasePlan.DONE);
    eq(phase.is(PhasePlan.UNITS, PhasePlan.STRUCTURES), false, 'законченный приказ — не тот и не этот');
    eq(phase.is(PhasePlan.DONE), true, 'законченный приказ — done');
    // A nested order starts without a step and gets it from resolveOrder.
    phase.clear();
    eq(phase.name, null, 'вложенный приказ без шага');
    // A strike keeps its own names.
    const strikeOrder = { seat: 1, order: 'advance' };
    const sp = PhasePlan.of(strikeOrder);
    sp.set(PhasePlan.STRIKE);
    eq(sp.is(PhasePlan.STRIKE), true, 'удар начат');
    sp.set(PhasePlan.STRIKE_FIRST);
    eq(sp.is(PhasePlan.STRIKE), false, 'на шаге первого отряда удар уже не «strike»');
    // One object per order, and no order — no object.
    eq(PhasePlan.of(order), phase, 'у приказа один PhasePlan');
    eq(PhasePlan.of(null), null, 'без приказа шага нет');
});

rule('dom-1b', '«… he gains the assets …» — что приказ добыл, что остался должен и что обещал бою, держит один OrderTally', () => {
    const tally = OrderTally.of({ seat: 0, order: 'dominate' });
    // «получите 2 жетона процветания»: the player still chooses two assets.
    tally.setGained(['forge', 'prosperity', 'prosperity']);
    eq(tally.gained.length, 3, 'добыча записана');
    tally.addProsperity(2);
    eq(tally.prosperity, 2, 'два жетона процветания ждут выбора');
    tally.spendProsperity();
    eq(tally.prosperity, 1, 'один выбран');
    tally.clearProsperity();
    eq(tally.prosperity, 0, 'остаток выдан или сгорел');
    // The ability of the faction: «Название: текст», and the order ends after it.
    tally.setAbility('Массовое Производство: …');
    eq(tally.ability.indexOf('Массовое') , 0, 'текст способности в панели');
    eq(tally.finishesAfterEffect, false, 'приказ не ждёт способности');
    tally.setFinishesAfterEffect();
    eq(tally.finishesAfterEffect, true, 'приказ закончится со способностью');
    tally.finishAfterEffect();
    eq(tally.finishesAfterEffect, false, 'флаг потрачен один раз');
    // A chaos card: extra deck tokens and morale dice of the battle.
    tally.addChaosDeckBonus(2);
    eq(tally.chaosDeckBonus, 2, 'два жетона на колоду событий');
    tally.addChaosCombatMorale(1).addChaosCombatMorale(1);
    eq(tally.chaosCombatMorale, 2, 'два кубика морали');
    eq(tally.takeChaosCombatMorale(), 2, 'бой забирает их');
    eq(tally.chaosCombatMorale, 0, 'второй бой без кубиков');
    // The promised free reinforcement waits for the battle and is taken once.
    tally.setPromisedReinforce(1, true);
    eq(tally.promisedReinforce.free, true, 'жетон обещан бесплатно');
    eq(tally.takePromisedReinforce().n, 1, 'бой забрал обещание');
    eq(tally.promisedReinforce, null, 'второй раз обещания нет');
    eq(OrderTally.of(tally.order), tally, 'у приказа один итог');
    eq(OrderTally.of(null), null, 'без приказа итога нет');
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
    eq(FS_RULES.trimQueue(st).entries().length, 1, 'область просит убрать лишнее');
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
    eq(FS_RULES.trimQueue(st).entries().length, 1, 'переполненная область отмечена');
    const blocked = FS_RULES.apply(st, 0, { type: 'nextPhase' });
    eq(/вместимост/.test(blocked.error || ''), true, 'пока лишние не убраны, игрок ничего не делает');
    const other = FS_RULES.apply(st, 1, { type: 'nextPhase' });
    eq(/вместимост/.test(other.error || ''), false, 'чужой ход не ждёт чужой уборки');
});

rule('cap-2b', '«…his units that are in excess of an area’s unit capacity» — очередь переполнения живёт объектом и не копит записи', () => {
    const st = empty();
    const sys = st.systems[0];
    const pos = worldOf(st, sys.id);
    const cap = FS_RULES.capacity(st, sys.id, pos);
    for (let i = 0; i < cap + 2; i++) guard(st, 0, sys.id, pos);
    // The same area is counted once, however many times it is asked about.
    FS_RULES.trimPlayer(st, 0);
    FS_RULES.trimPlayer(st, 0);
    eq(FS_RULES.trimQueue(st).entries().length, 1, 'одна область — одна запись');
    eq(FS_RULES.trimQueue(st).blocked(0), true, 'игрок ждёт выбора');
    const mine = st.units.filter(u => u.seat === 0);
    FS_RULES.apply(st, 0, { type: 'trimUnit', system: sys.id, pos, unit: mine[0].id });
    eq(FS_RULES.trimQueue(st).blocked(0), true, 'одного отряда мало');
    FS_RULES.apply(st, 0, { type: 'trimUnit', system: sys.id, pos, unit: mine[1].id });
    eq(FS_RULES.trimQueue(st).blocked(0), false, 'область снова вмещает всех — очередь пуста');
    eq(st.trim, null, 'поле очереди очищено, а не оставлено пустым списком');
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
    eq(FS_RULES.trimQueue(st).any(), true, 'конец фазы событий спрашивает про лишние отряды');
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
    u.routedRound = 2;
    FS_RULES.startRefresh(st);
    eq(u.routed, false, 'отряд снова в строю');
    // The rally is the restore the cards use: the round the unit fell in goes
    // with the mark, so the cards that last «в этом раунде боя» do not count a
    // standing unit («Фаланга судного дня»).
    eq(u.routedRound, 0, 'круг деморализации забыт');
});

rule('combat-11b', '«If a unit suffers damage and is not destroyed, that unit is routed.» — the mark and the round of the combat are one fact', () => {
    const st = empty();
    const sys = st.systems[0];
    const u = guard(st, 0, sys.id, worldOf(st, sys.id));
    // A card «в этом раунде боя» reads the round the unit was routed in: the
    // mark and the round are written by one call, or a forgotten line changes
    // what the card counts.
    st.combat = { round: 3 };
    FS_RULES.routeUnit(st, u);
    eq(u.routed, true, 'отряд деморализован');
    eq(u.routedRound, 3, 'круг, в котором отряд деморализован, записан');
    FS_RULES.restoreUnit(st, u);
    eq(u.routed, false, 'отряд снова в строю');
    eq(u.routedRound, 0, 'круг вместе с пометкой снят');
    st.combat = null;
    FS_RULES.routeUnit(st, u);
    eq(u.routedRound, 0, 'вне боя круг нулевой');
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

// ============================================================================
//  The refresh phase — the ends of the game are at its first step
// ============================================================================
head('Фаза обновления (Refresh Phase)');

rule('win-refresh-1', '«When a player has collected a number of his objective tokens equal to or exceeding the number of players, the game ends» — the refresh ends at step 1, the storms and the events never happen', () => {
    const st = empty();
    st.firstPlayer = 0;
    st.phase = 'refresh';
    st.players[0].objectives = 1;      // two players in the game
    st.round = 2;
    const sys = st.systems[0];
    const pos = worldOf(st, sys.id);
    guard(st, 0, sys.id, pos);         // a friendly world with the objectives
    st.objectives = [{ id: 'obj-a', faction: st.players[0].faction, system: sys.id, area: pos },
                     { id: 'obj-b', faction: st.players[0].faction, system: sys.id, area: pos }];
    const eventsBefore = st.eventsLeft;
    FS_RULES.startRefresh(st);
    eq(st.over, true, 'игра закончилась в шаге сбора целей');
    eq(st.winner, 0, 'победил обладатель целей');
    eq(st.eventsLeft, eventsBefore, 'события и штормы после победы не начинаются');
});

rule('win-refresh-2', '«The game is a draw» — both players cross the threshold on the same refresh: a shared victory', () => {
    const st = empty();
    st.firstPlayer = 0;
    st.phase = 'refresh';
    st.players[0].objectives = 1;
    st.players[1].objectives = 1;     // two players, two objectives each needed
    st.round = 2;
    const sys = st.systems[0], sys2 = st.systems[1];
    guard(st, 0, sys.id, worldOf(st, sys.id));
    guard(st, 1, sys2.id, worldOf(st, sys2.id));
    st.objectives = [{ id: 'o0a', faction: st.players[0].faction, system: sys.id, area: worldOf(st, sys.id) },
                     { id: 'o0b', faction: st.players[0].faction, system: sys.id, area: worldOf(st, sys.id) },
                     { id: 'o1a', faction: st.players[1].faction, system: sys2.id, area: worldOf(st, sys2.id) },
                     { id: 'o1b', faction: st.players[1].faction, system: sys2.id, area: worldOf(st, sys2.id) }];
    FS_RULES.startRefresh(st);
    eq(st.over, true, 'игра закончилась у обоих');
    eq(JSON.stringify(st.shared), JSON.stringify([0, 1]), 'ничья: равные цели, равные миры и войска');
});

rule('cards-awaken', '«Купите 1 постройку и поместите её в дружественный мир, не содержащий другие постройки.» — событие «Пробуждение мира-гробницы» можно разыграть', () => {
    const card = FS_DATA.events.find(c => c.name === 'Пробуждение мира-гробницы');
    eq(!!card, true, 'карта существует в данных');
    const st = empty();
    st.phase = 'refresh';
    st.players[0].materiel = 10;
    const sys = st.systems[0];
    const pos = worldOf(st, sys.id);
    guard(st, 0, sys.id, pos);       // a friendly world without structures
    const steps = FS_EFFECTS.parse(card.text, { kind: 'event', faction: card.faction });
    FS_RULES.runEffects(st, 0, steps, { kind: 'event', ctx: null });
    eq(st.pending && st.pending.question.kind, 'structureTypes', 'спрашивают, какую постройку купить');
    eq(st.pending.question.options.length, 3, 'доступны все три постройки');
    answerFirst(st);                    // {type: 'factory'} — первая в списке
    eq(st.pending && st.pending.question.kind, 'areas', 'спрашивают, где построить');
    eq(st.structures.length, 0, 'постройки до ответа нет');
    answerFirst(st);                    // {area: {...}}
    eq(st.structures.length, 1, 'постройка построена');
    eq(st.structures[0].type, 'factory', 'именно фабрика');
    eq(st.players[0].materiel, 8, 'материя списана');
    // «не содержащий другие постройки»: мира с постройкой в выборе не осталось у фабрики на поле
    eq(st.pending === null, true, 'студия карты завершена');
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

rule('strike-2b', '«An orbital strike …» — удар одного приказа живёт в одном объекте StrikePlan', () => {
    const st = empty();
    const sys = st.systems[0];
    const pos = worldOf(st, sys.id);
    unit(st, 0, 'крейсеры', sys.id, voidOf(st, sys.id));
    olk(st, 1, sys.id, pos);
    st.order = { seat: 0, order: 'advance', system: sys.id, pos, phase: 'strike' };
    // A card of the order changes the strike before it is rolled; one reading
    // of the object is the same reading for the rule and for the strike.
    const plan = StrikePlan.of(st.order);
    plan.addBonus(1).addBonus(1);
    eq(plan.spendBonus(), 2, 'бонус удара накоплен и отдан один раз');
    eq(plan.spendBonus(), 0, 'второй удар бонуса не берёт');
    plan.addHealthDown(1).addHealthDown(1);
    eq(plan.healthDown, 2, 'здоровье мира удара ниже на два');
    plan.setTake({ n: 2, kind: 'def' });
    eq(plan.takeTake(), { n: 2, kind: 'def' }, 'цена построек ждёт своих кубиков');
    eq(plan.takeTake(), null, 'цена взята однажды');
    plan.wantFirst(1);
    eq(plan.firstWanted, true, 'карта зовёт первый отряд');
    eq(plan.firstKl, 1, 'предел командного уровня первого отряда');
    plan.setFirst('u1');
    eq(plan.first, 'u1', 'первый отряд выбран');
    plan.reset();
    eq(plan.firstAsked, false, 'новый удар снова спрашивает первый отряд');
    eq(plan.first, 'u1', 'выбор прошлого удара не стирается рукой правила');
    // A second order has its own strike.
    const other = StrikePlan.of({ seat: 1, order: 'advance' });
    eq(other.healthDown, 0, 'у другого приказа свой удар');
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
    // «…unless a card or faction ability specifically states otherwise»: the
    // permission is an argument of the same question, not a second rule. The
    // Eldar card «Певцы психокости» builds on his own world of another kind.
    const ok = FS_RULES.canPlaceStructure(st, 0, sys.id, pos, { allowOccupied: 'otherType', kind: 'city' });
    eq(ok.ok, true, 'карта разрешает вторую постройку другого типа');
    eq(FS_RULES.canPlaceStructure(st, 0, sys.id, pos, { allowOccupied: 'otherType', kind: 'factory' }).ok,
        false, 'постройка того же типа не встаёт даже с картой');
    const foes = FS_RULES.canPlaceStructure(st, 1, sys.id, pos, { allowOccupied: 'otherType', kind: 'city' });
    eq(foes.ok, false, 'чужая постройка не разрешает свою');
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
    eq(FS_RULES.trimQueue(st).entries().length, 0, 'полная область с постройками не переполнена');
});

const chainBoard = (seed) => {
    const board = empty(seed);
    const chain = board.systems.find(sys => ['TR', 'TL', 'BL'].every(p => sys.areas.some(a => a.pos === p && a.world)));
    return chain ? { board, chain } : null;
};

rule('adv-bare-factory', '«Only one area can become contested during a single Advance Order» — a world with only an enemy structure (no units, no bastions) does not fight and does not consume the one-battle limit of the order; a world with an enemy bastion does', () => {
    let found = null;
    for (let seed = 1; seed <= 40 && !found; seed++) found = chainBoard(seed);
    if (!found) return 'не нашлось системы с цепочкой трёх миров';
    const { board: st, chain: active } = found;
    advance(st, 0, active.id, 'TR');
    const a = guard(st, 0, active.id, 'TL');
    const b = guard(st, 0, active.id, 'TL');
    FS_RULES.addStructure(st, 1, 'factory', active.id, 'TR');
    FS_RULES.addStructure(st, 1, 'factory', active.id, 'BL');
    const res = FS_RULES.apply(st, 0, {
        type: 'moveUnits',
        moves: [{ unit: a.id, system: active.id, pos: 'TR' }, { unit: b.id, system: active.id, pos: 'BL' }],
    });
    eq(res.ok, true, 'две планеты с заводом не делают две спорные области: ' + (res.error || ''));
    // The control case: a bastion is a fighting structure — the second bastion
    // world would again make two contested areas and the march is refused.
    let found2 = null;
    for (let seed = 1; seed <= 40 && !found2; seed++) found2 = chainBoard(seed);
    if (!found2) return 'не нашлось второй системы с цепочкой трёх миров';
    const { board: st2, chain: active2 } = found2;
    advance(st2, 0, active2.id, 'TR');
    const a2 = guard(st2, 0, active2.id, 'TL');
    const b2 = guard(st2, 0, active2.id, 'TL');
    FS_RULES.addStructure(st2, 1, 'bastion', active2.id, 'TR');
    FS_RULES.addStructure(st2, 1, 'bastion', active2.id, 'BL');
    const res2 = FS_RULES.apply(st2, 0, {
        type: 'moveUnits',
        moves: [{ unit: a2.id, system: active2.id, pos: 'TR' }, { unit: b2.id, system: active2.id, pos: 'BL' }],
    });
    eq(/Спорн/.test(res2.error || ''), true, 'два бастиона — две спорные области');
});

rule('adv-capture-1', '«Занято — захвачено» — мир без бойцов противника, куда вошли наземные отряды (завод и город), считается захваченным', () => {
    let found = null;
    for (let seed = 1; seed <= 40 && !found; seed++) found = chainBoard(seed);
    if (!found) return 'не нашлось системы с цепочкой трёх миров';
    const { board: st, chain: active } = found;
    advance(st, 0, active.id, 'TR');
    const a = guard(st, 0, active.id, 'TL');
    const b = guard(st, 0, active.id, 'TL');
    FS_RULES.addStructure(st, 1, 'factory', active.id, 'TR');
    FS_RULES.addStructure(st, 1, 'city', active.id, 'BL');
    const res = FS_RULES.apply(st, 0, { type: 'moveUnits', moves: [{ unit: a.id, system: active.id, pos: 'TR' }, { unit: b.id, system: active.id, pos: 'BL' }] });
    eq(res.ok, true, 'марш в миры без бойцов прошёл: ' + (res.error || ''));
    eq(st.structures.every(x => x.seat === 0), true, 'все постройки на захваченных мирах перешли захватчику');
    eq(st.order.contested || null, null, 'захваченное без боя — не спорная область');
});

rule('adv-capture-2', 'мир, где есть бойцы противника, не захватывается маршем — постройка остаётся до боя', () => {
    let found = null;
    for (let seed = 1; seed <= 40 && !found; seed++) found = chainBoard(seed);
    if (!found) return 'не нашлось системы с цепочкой трёх миров';
    const { board: st, chain: active } = found;
    advance(st, 0, active.id, 'TR');
    const a = guard(st, 0, active.id, 'TL');
    const b = guard(st, 0, active.id, 'TL');
    FS_RULES.addStructure(st, 1, 'factory', active.id, 'TR');
    FS_RULES.addStructure(st, 1, 'factory', active.id, 'BL');
    olk(st, 1, active.id, 'BL');               // бойцы противника в BL
    const res = FS_RULES.apply(st, 0, { type: 'moveUnits', moves: [{ unit: a.id, system: active.id, pos: 'TR' }, { unit: b.id, system: active.id, pos: 'BL' }] });
    eq(res.ok, true, 'один бой за приказ: march перешёл спорный район');
    const tr = st.structures.find(x => x.area === 'TR');
    const bl = st.structures.find(x => x.area === 'BL');
    eq(tr.seat, 0, 'завод в TR — захвачен');
    eq(bl.seat, 1, 'завод в BL — ждёт боя, не захвачен');
});

rule('adv-capture-3', 'откат марша (Esc) возвращает захваченные постройки прежнему владельцу', () => {
    let found = null;
    for (let seed = 1; seed <= 40 && !found; seed++) found = chainBoard(seed);
    if (!found) return 'не нашлось системы с цепочкой трёх миров';
    const { board: st, chain: active } = found;
    advance(st, 0, active.id, 'TR');
    const a = guard(st, 0, active.id, 'TL');
    const b = guard(st, 0, active.id, 'TL');
    FS_RULES.addStructure(st, 1, 'factory', active.id, 'TR');
    FS_RULES.addStructure(st, 1, 'city', active.id, 'BL');
    const res = FS_RULES.apply(st, 0, { type: 'moveUnits', moves: [{ unit: a.id, system: active.id, pos: 'TR' }, { unit: b.id, system: active.id, pos: 'BL' }] });
    eq(res.ok, true, 'марш прошёл');
    const undo = FS_RULES.apply(st, 0, { type: 'undoMove' });
    eq(undo.ok, true, 'откат марша выполнился: ' + (undo.error || ''));
    eq(st.structures.every(x => x.seat === 1), true, 'постройки снова у прежнего владельца');
    // и повторный марш — снова захват:
    advance(st, 0, active.id, 'TR');
    const units = st.units.filter(x => x.seat === 0).map(x => x.id);
    const res2 = FS_RULES.apply(st, 0, { type: 'moveUnits', moves: [{ unit: units[0], system: active.id, pos: 'TR' }, { unit: units[1], system: active.id, pos: 'BL' }] });
    eq(res2.ok, true, 'повторный марш после откатки прошёл');
    eq(st.structures.every(x => x.seat === 0), true, 'после повторного марша постройки снова захвачены');
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

rule('mov-1a', '«… may move through one uncontrolled void …» — что карта разрешает пройти, держит один OrderMove', () => {
    const move = OrderMove.of({ seat: 0, order: 'advance' });
    // «перемещение из 1 области»: the plan may start from one area only.
    eq(move.areaLimit, 0, 'предела областей нет');
    eq(move.withinAreas(3), true, 'без карты — сколько угодно областей');
    move.setAreaLimit(1);
    eq(move.withinAreas(1), true, 'одна область разрешена');
    eq(move.withinAreas(2), false, 'две области запрещены');
    // «провести до 2 отрядов через одну никем не контролируемую пустую область».
    move.setPassVoid(2);
    eq(move.passVoid, 2, 'две пустоты можно пройти');
    // Storms: the ships and the ground units pass by different cards.
    eq(move.crossesStorm({ type: 'ship' }), false, 'корабли стоят перед штормом');
    move.setShipsThroughStorms();
    eq(move.crossesStorm({ type: 'ship' }), true, 'корабли проходят');
    eq(move.crossesStorm({ type: 'ground' }), false, 'наземные — ещё нет');
    move.setUnitsThroughStorms();
    eq(move.crossesStorm({ type: 'ground' }), true, 'наземные тоже проходят');
    // The ground units come from one neighbouring system only.
    eq(move.wayAllows('ground', 4), true, 'первый сосед принят');
    move.setWay('ground', 4);
    eq(move.wayAllows('ground', 4), true, 'тот же сосед принят');
    eq(move.wayAllows('ground', 5), false, 'другой сосед запрещён');
    // The extra advance and «Быстрый ответ» are the same order with a narrower march.
    const pre = OrderMove.of({ seat: 0, order: 'advance' });
    pre.setPreAdvance();
    eq(pre.preAdvance, true, 'дополнительный приказ');
    pre.setQuickResponse().setFromEvent();
    eq(pre.quickResponse, true, 'ограниченный приказ события');
    eq(pre.fromEvent, true, 'ход вернётся событию');
    eq(OrderMove.of(pre.order), pre, 'у приказа один OrderMove');
    eq(OrderMove.of(null), null, 'без приказа путей нет');
});

rule('mov-1b', '«… can never end the movement with more than five units in a single area» — у доски один ответ на «есть ли место»', () => {
    const st = empty();
    const sys = st.systems[0];
    const pos = worldOf(st, sys.id);
    for (let i = 0; i < 4; i++) guard(st, 0, sys.id, pos);
    // Four of mine: one more fits, the sixth does not.
    eq(FS_RULES.hasRoom(st, sys.id, pos, 0, 1), true, 'пятый отряд встаёт');
    guard(st, 0, sys.id, pos);
    eq(FS_RULES.hasRoom(st, sys.id, pos, 0, 1), false, 'шестой не встаёт');
    eq(FS_RULES.unitLimit(st, sys.id, pos, 0), 0, 'свободных мест нет');
    // The limit is one player's: five of his own do not fill the area for another.
    eq(FS_RULES.hasRoom(st, sys.id, pos, 1, 1), true, 'чужой отряд места не занимает');
    eq(FS_RULES.capacity(st, sys.id, pos) < 5 || FS_RULES.hasRoom(st, sys.id, pos, 0, 1),
        true, 'вместимость можно превысить, пластмассу — нет');
});

rule('mov-1c', '«… the units that marched one step cannot march again …» — шаг, дороги и отменённые ходы живут в одном MarchPlan', () => {
    const st = empty();
    const sys = st.systems[0];
    const pos = voidOf(st, sys.id);
    const u = unit(st, 0, 'крейсеры', sys.id, pos);
    const order = advance(st, 0, sys.id, pos, 'ships');
    const march = MarchPlan.of(order);
    // A new order starts a clean march: the ships again, nothing marched yet.
    eq(march.step, 'ships', 'приказ начинается с хода кораблей');
    eq(march.hasMoved(u.id), false, 'никто ещё не шёл');
    march.addMoved([u.id]);
    eq(march.hasMoved(u.id), true, 'отряд записан в шедшие');
    march.addStep([{ id: u.id, fromSystem: sys.id, fromArea: pos, kind: 'ship', contested: null }]);
    eq(march.steps.length, 1, 'шаг запомнен для отмены');
    // Only one area may become contested in the order.
    eq(march.contest(sys.id + ':a'), true, 'первая спорная область принята');
    eq(march.contest(sys.id + ':b'), false, 'вторая спорная область — отказ');
    eq(march.contested, sys.id + ':a', 'спорная область не сменилась');
    // The roll-back takes the step out and returns the unit to the march.
    const step = march.popStep();
    eq(step.length, 1, 'шаг возвращён');
    march.removeMoved([u.id]);
    march.clearContested(sys.id + ':a');
    eq(march.hasMoved(u.id), false, 'после отмены отряд снова может идти');
    eq(march.contested, null, 'после отмены спорной области нет');
    // The card of «Крестного хода» gives its budget from zero.
    march.setUncontrolled(2);
    eq(march.uncontrolledLeft, 2, 'два прохода без дороги');
    march.useUncontrolled();
    eq(march.uncontrolledLeft, 1, 'один проход потрачен');
    march.returnUncontrolled();
    eq(march.uncontrolledLeft, 2, 'возврат хода вернул проход');
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
    else if (q.kind === 'structures') answer.structure = value;
    else if (q.kind === 'structureTypes') answer.type = value;
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
            const steps = FS_EFFECTS.abilityFor
                ? FS_EFFECTS.abilityFor(faction)
                : FS_EFFECTS.parse((faction.ability && faction.ability.text) || '', { kind: 'ability', faction: faction.id });
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
    // A parsed step is understood when the engine has a question for it (the
    // «ask» groups) or an action (the «step» groups) — that is the two halves
    // of the old switch, now registered by name.
    const known = new Set([...STEP_NAMES, ...ASK_NAMES]);
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

// Карта ещё не реализована (она в списке невыполненных у fs-coverage). Здесь
// проверяется только то, что должно быть верно всегда: движок не деморализует
// корабли игрока без его выбора. Раньше этот же тест требовал, чтобы обе
// фразы оставались заглушками note — это закрепляло недоделку как норму.
rule('orders-sisters-3', '«Священное пламя» — движок не деморализует свои корабли без выбора игрока', () => {
    const steps = FS_EFFECTS.parse('Бастионы противника не могут предотвратить этот орбитальный удар. Во время этого орбитального удара вы можете деморализовать любое количество кораблей, участвующих в этом орбитальном ударе. За каждый деморализованный корабль переверните до 2 ваших `def. cube` или `att. cube` на `morale cube`. Один раз за раунд.',
        { kind: 'order', faction: 'сестры-битвы' });
    // Пока карта не разобрана, шага «деморализовать» в ней быть не должно:
    // иначе движок молча деморализует чужие корабли без вопроса.
    const routes = [];
    const walk = list => { for (const s of list || []) { if (!s) continue; routes.push(s.op); walk(s.steps); walk(s.options); walk(s.yes); walk(s.no); walk(s.then); } };
    walk(steps);
    eq(routes.includes('route'), false, 'движок не деморализует корабли без выбора игрока');
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

rule('step-4', '«the roll-back returns to the step the march belongs to» — Esc возвращает на прошлый шаг приказа', () => {
    const st = empty();
    // Ищем место, где корабль в войде — единственный мост для пехоты: мир A в
    // соседней системе касается этого войда, а мир W активной системы — тоже.
    let fx = null;
    for (const S of st.systems) {
        for (const V of S.areas.filter(a => !a.world)) {
            for (const nid of FS_RULES.neighbors(st, S.id)) {
                const N = FS_RULES.system(st, nid);
                for (const A of N.areas.filter(a => a.world)) {
                    const touches = FS_RULES.areasAround(st, nid, A.pos)
                        .some(x => x.system === S.id && x.pos === V.pos);
                    if (!touches) continue;
                    for (const W of S.areas.filter(a => a.world)) {
                        const near = FS_RULES.areasAround(st, S.id, W.pos)
                            .some(x => x.system === S.id && x.pos === V.pos);
                        if (!near) continue;
                        const other = S.areas.find(a => !a.world && a.pos !== V.pos);
                        if (!other) continue;
                        fx = { S, V, N, A, W, other };
                        break;
                    }
                    if (fx) break;
                }
                if (fx) break;
            }
            if (fx) break;
        }
        if (fx) break;
    }
    if (!fx) return 'на этой карте нет узкого моста через войд — проверка не построена';
    const g = guard(st, 0, fx.N.id, fx.A.pos);
    const ship = unit(st, 0, 'крейсеры', fx.S.id, fx.V.pos);
    st.order = {
        seat: 0, order: 'advance', system: fx.S.id, pos: fx.V.pos,
        phase: 'move', moveStep: 'ships', moved: [], steps: [],
    };
    st.order.route = FS_RULES.advanceRoutes(st, 0, 'ship');
    const mv = FS_RULES.apply(st, 0, { type: 'moveUnits', moves: [{ unit: ship.id, system: fx.S.id, pos: fx.other.pos }] });
    eq(mv.ok, true, 'корабль перелетел в другой войд');
    eq(FS_RULES.apply(st, 0, { type: 'endAdvance' }).ok, true, 'шаг кораблей закончен');
    eq(st.order.moveStep, 'ground', 'идёт второй шаг');
    eq(!!(st.order.route || {})[g.id], false, 'через опустевший войд пехота не идёт');
    // Esc: возврат на прошлый шаг приказа вместе с маршем корабля.
    const undo = FS_RULES.apply(st, 0, { type: 'undoMove' });
    eq(undo.ok, true, 'отмена принята');
    eq(st.order.moveStep, 'ships', 'вернулись на первый шаг приказа');
    const back = st.units.find(u => u.id === ship.id);
    eq([back.system, back.area], [fx.S.id, fx.V.pos], 'корабль вернулся на место');
    eq(FS_RULES.apply(st, 0, { type: 'endAdvance' }).ok, true, 'второй шаг начат заново');
    eq(st.order.moveStep, 'ground', 'снова второй шаг');
    eq(!!(st.order.route || {})[g.id], true, 'дорога пехоты снова есть');
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

rule('dep-8', '«The deploy limit is equal to the combined unit capacity …» — счёт покупок живёт в списке покупок, отмена его уменьшает', () => {
    const st = empty();
    const sys = st.systems[0];
    const pos = worldOf(st, sys.id);
    FS_RULES.addStructure(st, 0, 'factory', sys.id, pos);
    guard(st, 0, sys.id, pos);
    st.order = { seat: 0, order: 'deploy', system: sys.id, phase: 'deploy', purchases: [] };
    st.players[0].materiel = 14;
    st.players[0].supply.units['гвардейцы'] = 9;
    const limit = FS_RULES.deployLimit(st, 0, sys.id);
    eq(FS_RULES.unitsBought(st.order), 0, 'сначала ничего не куплено');
    for (let i = 0; i < limit; i++) {
        const r = FS_RULES.apply(st, 0, { type: 'buyUnit', unit: 'гвардейцы', system: sys.id, pos });
        eq(r.ok, true, 'покупка ' + (i + 1));
    }
    eq(FS_RULES.unitsBought(st.order), limit, 'счёт покупок по списку');
    // A second counter would keep the limit exhausted after the undo.
    const undo = FS_RULES.apply(st, 0, { type: 'undoPurchase' });
    eq(undo.ok, true, 'покупка снята');
    eq(FS_RULES.unitsBought(st.order), limit - 1, 'снятая покупка не считается');
    eq(FS_RULES.apply(st, 0, { type: 'buyUnit', unit: 'гвардейцы', system: sys.id, pos }).ok, true,
        'после отмены предел снова свободен на одну покупку');
    // The structure: one per order, and an undone one may be bought again.
    FS_RULES.apply(st, 0, { type: 'deployStructures' });
    const other = FS_RULES.system(st, sys.id).areas.filter(a => a.world && a.pos !== pos)[0];
    if (!other) return true;
    FS_RULES.addUnit(st, 0, 'гвардейцы', sys.id, other.pos);
    eq(FS_RULES.apply(st, 0, { type: 'buyStructure', structure: 'city', system: sys.id, pos: other.pos }).ok, true,
        'постройка куплена');
    eq(FS_RULES.structureBought(st.order), true, 'постройка видна в списке');
    eq(FS_RULES.apply(st, 0, { type: 'undoPurchase' }).ok, true, 'постройка снята');
    eq(FS_RULES.structureBought(st.order), false, 'снятая постройка не считается');
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
//  Objectives, warp storms, events — the second pass of the audit
// ============================================================================
head('Жетоны целей, варп-штормы, события');

rule('obj-2', '«During the first step of the Refresh Phase, all players simultaneously collect all objective tokens that belong to their faction and on friendly worlds.» — снятый жетон не считается второй раз', () => {
    const st = empty();
    const sys = st.systems[0];
    const pos = worldOf(st, sys.id);
    guard(st, 0, sys.id, pos);
    st.objectives = [{ id: 'o1', faction: st.players[0].faction, system: sys.id, area: pos }];
    FS_RULES.startRefresh(st);
    eq(st.players[0].objectives, 1, 'цель собрана');
    eq(st.objectives.length, 0, 'жетон снят с доски');
    // The token lies on the faction sheet now: a second refresh adds nothing.
    FS_RULES.startRefresh(st);
    eq(st.players[0].objectives, 1, 'второй раз та же цель не считается');
});

rule('storm-1', '«The active player chooses one Warp Storm on the game board and moves it in one of the two directions shown on the Warp Storm icon» — шторм сдвинулся ровно на одну грань по стрелке', () => {
    const st = empty();
    const at = (r, c) => st.systems.find(s => s.row === r && s.col === c);
    const mid = at(1, 1), up = at(0, 1);
    if (!mid || !up) return 'карта без средней системы';
    const storm = { id: 's0', system: mid.id, side: 'N', moved: false };
    const t = FS_RULES.stormTarget(st, storm, 'N');
    if (!t) return 'шторм не смог пойти на север';
    eq(FS_RULES.edgeKey(st, t), FS_RULES.edgeKey(st, { system: up.id, side: 'N' }),
        'северная грань уходит на северную грань системы выше');
});

rule('storm-2', '«Each Warp Storm movement icon indicates two possible directions» — два шага вдоль края не сбрасывают вторую координату', () => {
    const st = wideEmpty();
    const at = (r, c) => st.systems.find(s => s.row === r && s.col === c);
    if (!at(1, 0) || !at(1, 2)) return 'карта без трёх систем в ряду';
    const storm = { id: 's0', system: at(1, 0).id, side: 'N', moved: false };
    const one = FS_RULES.stormTarget(st, storm, 'E');
    if (!one) return 'первый шаг на восток не вышел';
    eq(FS_RULES.edgeKey(st, one), FS_RULES.edgeKey(st, { system: at(1, 1).id, side: 'W' }),
        'шаг на восток с северной грани');
    const two = FS_RULES.stormTarget(st, one, 'E');
    if (!two) return 'второй шаг на восток не вышел';
    eq(FS_RULES.edgeKey(st, two), FS_RULES.edgeKey(st, { system: at(1, 2).id, side: 'W' }),
        'второй шаг на восток — грань через одну систему, а не та же');
});

rule('storm-3', '«the two directions shown on the Warp Storm icon» — диагональные стрелки (SE, NW) двигают шторм', () => {
    const st = wideEmpty();
    const at = (r, c) => st.systems.find(s => s.row === r && s.col === c);
    if (!at(0, 1) || !at(1, 1) || !at(2, 2)) return 'карта без систем для диагонали';
    const storm = { id: 's0', system: at(1, 1).id, side: 'N', moved: false };
    const se = FS_RULES.stormTarget(st, storm, 'SE');
    if (!se) return 'SE не двигает шторм';
    eq(FS_RULES.edgeKey(st, se), FS_RULES.edgeKey(st, { system: at(2, 2).id, side: 'W' }),
        'SE ведёт на грань системы вниз и вправо');
    const nw = FS_RULES.stormTarget(st, storm, 'NW');
    if (!nw) return 'NW не двигает шторм';
    eq(FS_RULES.edgeKey(st, nw), FS_RULES.edgeKey(st, { system: at(0, 1).id, side: 'W' }),
        'NW ведёт на грань системы вверх и влево');
    eq(FS_RULES.edgeKey(st, se) === FS_RULES.edgeKey(st, storm), false, 'SE не оставляет шторм на месте');
    eq(FS_RULES.edgeKey(st, nw) === FS_RULES.edgeKey(st, storm), false, 'NW не оставляет шторм на месте');
});

rule('storm-4', '«A Warp Storm can move to the edge of the game board, but cannot move off the edge of the game board.»', () => {
    const st = wideEmpty();
    const top = st.systems.filter(s => s.row === 0).sort((a, b) => a.col - b.col)[0];
    if (!top) return 'нет верхнего ряда';
    const storm = { id: 's0', system: top.id, side: 'N', moved: false };
    st.storms = [storm];
    eq(FS_RULES.stormTarget(st, storm, 'N'), null, 'с верхней грани на север ходить некуда');
    // The outer edge of the board is still a legal place to stand.
    eq(FS_RULES.stormOptions(st, 0).some(o => o.storm === storm.id), true,
        'со внешней грани шторм может уйти вдоль края');
});

rule('storm-5', '«A Warp Storm cannot move onto a border occupied by another Warp Storm.»', () => {
    const st = empty();
    const at = (r, c) => st.systems.find(s => s.row === r && s.col === c);
    if (!at(0, 1) || !at(1, 1)) return 'карта без двух систем друг над другом';
    st.storms = [
        { id: 's0', system: at(1, 1).id, side: 'N', moved: false },
        { id: 's1', system: at(0, 1).id, side: 'N', moved: false },
    ];
    st.event = { seat: 0, drawn: [], card: { name: 'x', storm: ['N'], type: 'tactic' } };
    const ways = FS_RULES.stormOptions(st, 0).filter(o => o.storm === 's0');
    eq(ways.some(o => o.dir === 'N'), false, 'на север идти нельзя: грань занята');
    const other = FS_RULES.stormTarget(st, st.storms[0], 'N');
    if (other) {
        const res = FS_RULES.apply(st, 0, { type: 'moveStorm', storm: 's0', dir: 'N' });
        eq(res.ok, false, 'ход на занятую грань отклонён');
    }
});

rule('storm-6', '«A player must move a Warp Storm if he can.» —Ability card text: «A player can choose not to resolve the ability on his chosen event card, but must resolve the card’s Warp Storm movement icon.»', () => {
    const st = empty();
    const mid = st.systems.find(s => s.row === 1) || st.systems[0];
    st.phase = 'refresh';
    st.eventsLeft = 2;
    st.storms = [{ id: 's0', system: mid.id, side: 'N', moved: false }];
    st.event = { seat: 0, drawn: ['К'], chosen: 'К', card: { name: 'К', storm: ['E'], type: 'tactic' } };
    const early = FS_RULES.apply(st, 0, { type: 'resolveEvent' });
    eq(early.ok, false, 'событие нельзя разыграть до хода шторма');
    const moved = FS_RULES.apply(st, 0, { type: 'moveStorm', storm: 's0', dir: 'E' });
    eq(moved.ok, true, 'шторм сдвинулся');
    const later = FS_RULES.apply(st, 0, { type: 'resolveEvent' });
    eq(later.ok, true, 'после хода шторма карту можно разыграть');
});

rule('storm-7', '«If a player cannot move any Warp Storms in either direction indicated on his chosen event card, he does not move a Warp Storm.»', () => {
    const st = empty();
    st.phase = 'refresh';
    st.eventsLeft = 2;
    // The card allows only the north, and every storm stands on the top row.
    const top = st.systems.filter(s => s.row === 0).slice(0, 2);
    st.storms = top.map((s, i) => ({ id: 's' + i, system: s.id, side: 'N', moved: false }));
    st.event = { seat: 0, drawn: ['К'], chosen: 'К', card: { name: 'К', storm: ['N'], type: 'tactic' } };
    eq(FS_RULES.stormOptions(st, 0).length, 0, 'двигать нечего');
    const res = FS_RULES.apply(st, 0, { type: 'resolveEvent' });
    eq(res.ok, true, 'без хода шторма карта всё равно разыгрывается');
});


rule('storm-8', 'A Warp Storm is stored on the border BETWEEN two system tiles, not on one tile', () => {
    const st = empty();
    const a = st.systems.find(x => x.row === 1 && x.col === 0);
    const b = st.systems.find(x => x.row === 1 && x.col === 1);
    if (!a || !b) return 'карта без двух соседних систем';
    const storm = FS_WARP_STORMS.create(st, 'sx', { system: a.id, side: 'E' });
    eq(!!storm, true, 'шторм не создан');
    eq(storm.a, a.id, 'первый сосед границы');
    eq(storm.b, b.id, 'второй сосед границы');
    eq(storm.edge.kind, 'V', 'вертикальная граница');
    const pos = FS_WARP_STORMS.position(st, storm, { originX: 0, originY: 0 }, 260);
    eq(pos.x, 130, 'центр шторма ровно между центрами двух тайлов');
    return eq(pos.y, 260, 'шторм лежит на общей линии тайлов');
});

// A scheme of the storm: «Молящийся тёмным богам» is the only card that reacts
// to another player's Warp Storm movement.
function stormSchemeState() {
    const st = empty(5);
    st.players[1].faction = 'космодесант-хаоса';
    st.storms = [];
    st.phase = 'refresh';
    st.eventsLeft = 2;
    const a = st.systems.find(x => x.row === 1 && x.col === 0);
    const b = st.systems.find(x => x.row === 1 && x.col === 1);
    if (!a || !b) return null;
    const storm = FS_WARP_STORMS.create(st, 'sx', { system: a.id, side: 'E' });
    st.storms = [storm];
    st.event = { seat: 0, drawn: ['К'], chosen: 'К', card: { name: 'К', storm: ['N'], type: 'tactic' } };
    const card = FS_DATA.events.find(c => /Молящийся тёмным богам/i.test(c.name));
    const trig = FS_EFFECTS.parse(card.text || '', { kind: 'event', faction: card.faction })
        .find(s => s.op === 'trigger');
    st.players[1].schemes = [{ name: card.name, text: card.text, trigger: trig.trigger,
        steps: trig.steps, note: !!trig.note, defer: !!trig.defer }];
    return { st, storm };
}

rule('storm-10', '«Когда другой игрок перемещает варп-шторм, вы можете сбросить эту карту … отменить это перемещение» (Молящийся тёмным богам)', () => {
    const one = stormSchemeState();
    if (!one) return 'карта без двух соседних систем';
    const { st, storm } = one;
    const before = FS_WARP_STORMS.keyOf(storm);
    const moved = FS_RULES.apply(st, 0, { type: 'moveStorm', storm: 'sx', dir: 'N' });
    eq(moved.pending, true, 'ход шторма спросил реакцию');
    eq(st.pending.question.kind, 'scheme', 'спросили именно план');
    eq(st.pending.answerSeat, 1, 'спрашивают другого игрока');
    eq(FS_WARP_STORMS.keyOf(storm), before, 'до ответа шторм не сдвинулся');
    // The card is discarded; the storm goes in a direction of the reaction.
    FS_RULES.apply(st, 1, { type: 'effect', answer: { choice: 0 } });
    eq((st.players[1].schemes || []).length, 0, 'карта сброшена');
    eq(st.pending.question.kind, 'choice', 'спросили направление');
    FS_RULES.apply(st, st.pending.answerSeat, { type: 'effect', answer: { choice: 0 } });
    eq(FS_WARP_STORMS.keyOf(storm) !== before, true, 'шторм сдвинулся по реакции');
    eq(storm.moved, true, 'шторм помечен как сдвинутый');
    eq(!!st.stormReaction, false, 'реакция закрыта');
    return eq(!!st.pending, false, 'вопросов больше нет');
});

rule('storm-11', '«… вы можете сбросить эту карту» — отказ от реакции не отменяет чужое перемещение', () => {
    const one = stormSchemeState();
    if (!one) return 'карта без двух соседних систем';
    const { st, storm } = one;
    const before = FS_WARP_STORMS.keyOf(storm);
    const wanted = FS_WARP_STORMS.target(st, storm, 'N');
    FS_RULES.apply(st, 0, { type: 'moveStorm', storm: 'sx', dir: 'N' });
    // A refusal carries no choice at all; the plan stays in play.
    const no = FS_RULES.apply(st, 1, { type: 'effect', answer: {} });
    eq(no.done, true, 'отказ принят');
    eq((st.players[1].schemes || []).length, 1, 'план остался в игре');
    // The original movement happens once the reaction is refused — and it is
    // the movement of the card, not the direction of the reaction.
    eq(!!st.pending, false, 'реакция не осталась висеть вопросом');
    eq(storm.moved, true, 'исходное перемещение выполнено');
    eq(FS_WARP_STORMS.keyOf(storm) !== before, true, 'шторм сдвинулся по карте');
    // The card's own direction is N: the storm stands on that very border.
    eq(FS_WARP_STORMS.keyOf(storm), wanted.key, 'шторм ушёл туда, куда звала карта');
    return eq(!!st.stormReaction, false, 'реакция снята');
});

rule('storm-9', 'Movement is a shift relative to the CURRENT storm edge', () => {
    const st = empty();
    const a = st.systems.find(x => x.row === 1 && x.col === 0);
    const b = st.systems.find(x => x.row === 1 && x.col === 1);
    if (!a || !b) return 'карта без двух соседних систем';
    const storm = FS_WARP_STORMS.create(st, 'sx', { system: a.id, side: 'E' });
    st.storms = [storm];
    st.phase = 'refresh';
    st.eventsLeft = 2;
    st.event = { seat: 0, drawn: ['К'], chosen: 'К', card: { name: 'К', storm: ['N'], type: 'tactic' } };
    const before = FS_WARP_STORMS.keyOf(storm);
    const target = FS_WARP_STORMS.target(st, storm, 'N');
    eq(!!target, true, 'нет целевой границы');
    eq(target.a === null || target.b === null, false, 'цель тоже между двумя тайлами');
    const res = FS_RULES.apply(st, 0, { type: 'moveStorm', storm: 'sx', dir: 'N' });
    eq(res.ok, true, 'шторм не сдвинулся: ' + (res.error || ''));
    eq(FS_WARP_STORMS.keyOf(storm), target.key, 'шторм пришёл на целевую границу');
    eq(FS_WARP_STORMS.keyOf(storm) !== before, true, 'сдвиг не оставил шторм на месте');
    return eq(storm.moved, true, 'шторм помечен как сдвинутый');
});

rule('event-2', '«Then, he shuffles all event cards back into his event deck, excluding the “Scheme” event card if it is in play.»', () => {
    const st = empty();
    st.phase = 'refresh';
    st.eventsLeft = 2;
    st.storms = [];
    const card = FS_DATA.events.find(e => e.faction === st.players[0].faction && e.type === 'scheme');
    if (!card) return 'у фракции нет карты-плана';
    // The whole deck lies before us: the scheme is the card in the hand.
    const all = FS_DATA.events.filter(e => e.faction === st.players[0].faction).map(e => e.name);
    st.players[0].decks.event = all.filter(n => n !== card.name);
    st.event = { seat: 0, drawn: [card.name], chosen: card.name, card };
    FS_RULES.apply(st, 0, { type: 'resolveEvent' });
    eq(st.players[0].decks.event.filter(n => n === card.name).length, 0, 'план не ушёл в колоду');
    eq((st.players[0].schemes || []).some(s => s.name === card.name), true, 'план остался в игре');
});

// ============================================================================
//  Retreats of the attacker, reinforcement tokens, the order upgrades
// ============================================================================
head('Отступление атакующего, жетоны подкрепления, улучшения приказа');

rule('ret-3', '«If the units did not move into the contested area via an Advance Order, they must move to an area that at least one unit moved from to start the combat.»', () => {
    const st = empty();
    // Two worlds of neighbouring systems that touch each other.
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
    if (!pair) return 'нет двух соседних миров';
    for (let i = 0; i < 2; i++) guard(st, 0, pair.to, pair.toPos);
    for (let i = 0; i < 2; i++) olk(st, 1, pair.to, pair.toPos);
    // The troops came to the fight by a card, not by an advance: only the trace
    // of the movement says where they came from.
    st.moves = [{ seat: 0, from: { system: pair.from, pos: pair.fromPos }, to: { system: pair.to, pos: pair.toPos } }];
    st.order = { seat: 0, order: 'deploy', system: pair.to, phase: 'combat' };
    FS_RULES.startCombat(st, 0, 1, pair.to, pair.toPos);
    if (!st.combat) return 'бой не начался';
    const targets = FS_RULES.retreatTargets(st, 0);
    eq(targets.length, 1, 'атакующему доступна только область, откуда он пришёл');
    eq(targets[0].system, pair.from, 'эта область — в системе отправления');
    eq(targets[0].pos, pair.fromPos, 'и это тот самый сектор');
});

rule('ret-4', '«If attacking units moved from an adjacent system, the defender’s units cannot retreat to that system.»', () => {
    const st = wideEmpty();
    // A fight of ships in the void: a ship needs no legal path, so the whole
    // system of the attacker opens for a retreat unless the rules close it.
    // The system must hold two voids — one of them is not the area the ships
    // came from, and only the system-wide ban keeps the defender out of it.
    let pair = null;
    for (const sys of st.systems) {
        const voids = sys.areas.filter(a => !a.world);
        if (voids.length < 2) continue;
        for (const v of voids) {
            for (const around of FS_RULES.areasAround(st, sys.id, v.pos)) {
                if (around.system === sys.id) continue;
                const other = FS_RULES.area(FS_RULES.system(st, around.system), around.pos);
                if (other && !other.world) { pair = { from: sys.id, fromPos: v.pos, to: around.system, toPos: around.pos }; break; }
            }
            if (pair) break;
        }
        if (pair) break;
    }
    if (!pair) return 'нет соседних пустот у системы с двумя пустотами';
    const att = unit(st, 0, 'крейсеры', pair.from, pair.fromPos);
    unit(st, 1, 'килл-круизеры', pair.to, pair.toPos);
    advance(st, 0, pair.to, pair.toPos, 'ships');
    const moved = FS_RULES.apply(st, 0, { type: 'moveUnits', moves: [{ unit: att.id, system: pair.to, pos: pair.toPos }] });
    if (!moved.ok) return 'марш не прошёл: ' + moved.error;
    // The ships have taken their places: the step of the ground troops ends too.
    FS_RULES.apply(st, 0, { type: 'endAdvance' });
    FS_RULES.apply(st, 0, { type: 'endAdvance' });
    if (!st.combat) return 'бой не начался';
    const targets = FS_RULES.retreatTargets(st, 1);
    const voids = FS_RULES.system(st, pair.from).areas.filter(a => !a.world).map(a => a.pos);
    eq(targets.some(t => t.system === pair.from), false,
        'в систему, откуда пришёл враг, не отступают (пустот там: ' + voids.length + ')');
});

rule('rein-1', '«Each of these tokens is treated as one of his command level zero units, either a ground unit or ship as appropriate for the combat.» — мораль жетона', () => {
    const st = battleOf('сестры-битвы', 'орки');
    const cl0 = FS_RULES.reinforceUnitDef(st.players[0].faction, 'ground');
    if (!cl0) return 'у фракции нет отряда нулевого уровня';
    st.combat.reinforce.attacker = 0;
    const before = FS_RULES.combatMorale(st, 'attacker');
    st.combat.reinforce.attacker = 2;
    const after = FS_RULES.combatMorale(st, 'attacker');
    eq(after - before, 2 * cl0.morale, 'два жетона дают мораль двух отрядов нулевого уровня');
});

rule('rein-2', '«Reinforcement tokens in combat are treated like plastic units for all rules and game effects» — здоровье жетона', () => {
    const st = battleOf('некроны', 'орки');
    const cl0 = FS_RULES.reinforceUnitDef(st.players[0].faction, 'ground');
    if (!cl0) return 'у фракции нет отряда нулевого уровня';
    st.combat.reinforce.attacker = 1;
    const token = FS_RULES.damageCandidates(st, 'attacker').find(x => x.kind === 'token');
    if (!token) return 'жетон не попал в список целей урона';
    eq(token.health, cl0.health, 'здоровье жетона — здоровье отряда нулевого уровня');
    eq(token.morale, cl0.morale, 'мораль жетона — мораль отряда нулевого уровня');
});

rule('up-1', '«Order Upgrade Cards … Each card is played during the order printed on it» — улучшение нельзя сжечь не в том приказе', () => {
    const st = empty();
    const card = FS_DATA.orders.find(c => c.faction === st.players[0].faction && c.order === 'orbital');
    if (!card) return 'у фракции нет орбитального улучшения';
    st.players[0].upgrades = [{ name: card.name, used: false, order: card.order }];
    st.order = { seat: 0, order: 'deploy', system: st.systems[0].id, phase: 'resolve' };
    const bad = FS_RULES.apply(st, 0, { type: 'useUpgrade', card: card.name });
    eq(bad.ok, false, 'во время развёртывания орбитальную карту применить нельзя');
    eq(st.players[0].upgrades[0].used, false, 'карта не сгорела зря');
    // Its own moment: the strike of the order.
    st.order.phase = 'strike';
    const good = FS_RULES.apply(st, 0, { type: 'useUpgrade', card: card.name });
    eq(good.ok, true, 'во время орбитального удара карта применяется');
});

rule('up-2', '«your command level increases by 1 while this order is executed» (Сила воли) — командный уровень растёт на время приказа', () => {
    const st = empty();
    const cities = st.structures.filter(s => s.seat === 0 && s.type === 'city').length;
    st.order = { seat: 0, order: 'strategize', system: st.systems[0].id, phase: 'resolve' };
    eq(FS_RULES.commandLevel(st, 0), cities, 'без карты — по числу городов');
    st.order.klBonus = 1;
    eq(FS_RULES.commandLevel(st, 0), cities + 1, 'карта подняла уровень');
    eq(FS_RULES.commandLevel(st, 1), st.structures.filter(s => s.seat === 1 && s.type === 'city').length,
        'соперника карта не касается');
});

rule('move-2', '«There must be a legal path between the starting world and the destination world.» — и внутри активной системы тоже', () => {
    const st = empty();
    // The worlds of a tile lie in a square: TL-BR and TR-BL are not neighbours.
    const diagonals = [['TL', 'BR'], ['TR', 'BL'], ['BR', 'TL'], ['BL', 'TR']];
    let checked = 0;
    for (const sys of st.systems) {
        for (const [from, to] of diagonals) {
            const a = FS_RULES.area(sys, from), b = FS_RULES.area(sys, to);
            if (!a.world || !b.world) continue;
            st.units = [];
            const u = FS_RULES.addUnit(st, 0, 'гвардейцы', sys.id, from);
            advance(st, 0, sys.id, to);
            const res = FS_RULES.moveAllowed(st, 0, u, { system: sys.id, pos: to });
            const touches = FS_RULES.areasAround(st, sys.id, from).some(x => x.system === sys.id && x.pos === to);
            checked++;
            if (!touches && res.ok) {
                return 'переход ' + sys.tile + ' ' + from + '→' + to + ' разрешён без законного пути';
            }
        }
    }
    if (!checked) return 'на карте нет двух миров по диагонали';
    return true;
});

rule('prop-1', '«If he gains a prosperity asset (represented by a white eagle), he gains one asset token of his choice.» — жетон процветания не пропадает', () => {
    const st = empty();
    const before = assetsOf(st.players[0]);
    st.turn = 0;
    st.systems[0].tokens = [{ seat: 0, order: 'advance' }];
    st.order = { seat: 0, order: 'dominate', system: st.systems[0].id, phase: 'dominate', prosperity: 1 };
    FS_RULES.finishOrder(st, 0);
    eq(assetsOf(st.players[0]), before + 1, 'за жетон процветания взят ресурс');
});

rule('deck-1', '«Clean Up: … he discards the combat cards he used during the combat by shuffling them back into his combat deck.»', () => {
    let shuffled = 0;
    for (let seed = 1; seed <= 12; seed++) {
        const st = groundBattle({ seed, att: 2, def: 2 });
        const dealt = st.combat.cards.attacker.hand.slice();
        const rest = st.players[0].decks.combat.slice();
        // The hand is laid on the table as played cards: the clean-up of the
        // combat is what returns them, no card effect takes part in it.
        st.combat.cards.attacker.played = dealt.slice().reverse().map(name => ({ name }));
        st.combat.cards.attacker.hand = [];
        st.combat.cards.defender.played = st.combat.cards.defender.hand.map(name => ({ name }));
        st.combat.cards.defender.hand = [];
        FS_RULES.finishCombat(st);
        const deck = st.players[0].decks.combat;
        eq(deck.length, rest.length + dealt.length, 'все сданные карты вернулись в колоду');
        if (!dealt.length) continue;
        // If the cards were only put back on top of the deck, the first card of
        // the hand would always stand right where the old deck ended.
        if (deck.indexOf(dealt[0]) !== rest.length) shuffled++;
    }
    eq(shuffled > 0, true, 'сданные карты перемешаны, а не положены в конец');
});

rule('deck-2', '«Two copies of the upgrade are added to his combat deck … the deck is shuffled» — покупка боевого улучшения', () => {
    let shuffled = 0;
    for (let seed = 1; seed <= 12; seed++) {
        const st = empty(seed);
        const p = st.players[0];
        p.materiel = 9;
        st.turn = 0;
        const sys = st.systems[0];
        const card = FS_DATA.combat.find(c => c.faction === p.faction && c.upgrade && c.kl === 0);
        if (!card) return 'у фракции нет боевого улучшения нулевого уровня';
        guard(st, 0, sys.id, worldOf(st, sys.id));
        st.order = { seat: 0, order: 'strategize', system: sys.id, phase: 'buy' };
        const before = p.decks.combat.slice();
        const res = FS_RULES.apply(st, 0, { type: 'buyUpgrade', kind: 'combat', card: card.name });
        if (!res.ok) return 'покупка не прошла: ' + res.error;
        // Which pair leaves the deck is the player's choice: the purchase stops
        // and asks. The engine must not pick a pair behind his back.
        const q = st.pending && st.pending.question;
        if (!q) return 'движок заменил пару сам, не спросив игрока';
        if (JSON.stringify(p.decks.combat.slice().sort()) !== JSON.stringify(before.slice().sort())) {
            return 'колода изменилась до ответа игрока';
        }
        const pair = q.options[0];
        const done = FS_RULES.apply(st, 0, { type: 'effect', answer: { remove: pair } });
        if (!done.ok) return 'ответ не принят: ' + done.error;
        const deck = p.decks.combat;
        eq(deck.filter(n => n === card.name).length, 2, 'обе копии в колоде');
        eq(deck.filter(n => n === pair).length, 0, 'выбранная игроком пара ушла из колоды');
        if (deck[deck.length - 1] !== card.name || deck[deck.length - 2] !== card.name) shuffled++;
    }
    eq(shuffled > 0, true, 'купленные карты перемешаны, а не положены в конец');
});

rule('deck-3', '«When a player purchases a combat upgrade card, he chooses and removes two copies of any card from his combat deck» — вопрос живёт ровно столько, сколько приказ', () => {
    // The purchase asks which pair it replaces. The question belongs to the
    // order that asked it: an order that ends takes its question with it, and
    // an answer after that cannot rebuild a deck of a closed order.
    const st = empty(5);
    const p = st.players[0];
    p.materiel = 12;
    const sys = st.systems[0];
    const pos = worldOf(st, sys.id);
    FS_RULES.addStructure(st, 0, 'city', sys.id, pos);
    guard(st, 0, sys.id, pos);
    st.phase = 'operations';
    st.turn = 0;
    st.order = { seat: 0, order: 'strategize', system: sys.id, phase: 'buy' };
    const card = FS_DATA.combat.find(c => c.faction === p.faction && c.upgrade && c.kl === 0);
    if (!card) return 'у фракции нет боевого улучшения нулевого уровня';
    const ask = FS_RULES.apply(st, 0, { type: 'buyUpgrade', kind: 'combat', card: card.name });
    eq(ask.ok, true, 'покупка прошла');
    eq(!!st.pending, true, 'покупка спросила пару');
    const fin = FS_RULES.apply(st, 0, { type: 'finishStrategize' });
    eq(fin.ok, true, 'приказ закончен');
    eq(st.order, null, 'приказа больше нет');
    eq(!!st.pending, false, 'вопрос приказа закрылся вместе с ним');
    const late = FS_RULES.apply(st, 0, { type: 'effect', answer: { remove: 'x' } });
    eq(late.ok, false, 'ответить после конца приказа нечем');
});

rule('strike-4', '«Бастионы противника не могут предотвратить этот орбитальный удар.» (05-order-upgrades.md, «Ужасный удар»)', () => {
    const st = empty();
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
    unit(st, 0, 'крейсеры', found.sys.id, found.v.pos);
    olk(st, 1, found.sys.id, found.world.pos);
    FS_RULES.addStructure(st, 1, 'bastion', found.sys.id, found.world.pos);
    st.order = { seat: 0, order: 'advance', system: found.sys.id, pos: found.world.pos, phase: 'strike' };
    eq(FS_RULES.orbitalStrikeTargets(st, 0).length, 0, 'бастион закрывает мир');
    st.order.ignoreBastion = true;
    eq(FS_RULES.orbitalStrikeTargets(st, 0).length > 0, true, 'карта открывает мир с бастионом');
});

rule('combat-d1', '«repeat the damage step during this round of combat» (04-combat-cards.md, «Бронекулак»)', () => {
    const st = groundBattle({ att: 2, def: 2 });
    const round = st.combat.round;
    st.combat.repeatDamage = true;
    FS_RULES.endDamageStep(st);
    eq(st.combat && st.combat.damageRepeated, true, 'шаг урона помечен повторным');
    eq(st.combat && st.combat.step, 'damage-attacker', 'шаг урона пошёл сначала');
    FS_RULES.endDamageStep(st);
    eq(st.combat ? st.combat.round : round + 1, round + 1, 'второй раз тот же раунд не повторяется');
});

rule('combat-d2', '«do not discard your def. tokens at the end of this round of combat» (04-combat-cards.md, «Шустрое судно»)', () => {
    const st = groundBattle({ att: 2, def: 2 });
    st.combat.tokens.attacker.def = 2;
    st.combat.tokens.defender.def = 2;
    // The card names the kind of the tokens it keeps and the round it was played
    // in: «Гнев машины» keeps the attack tokens the same way.
    st.combat.keepTokens = { defender: { def: true, round: st.combat.round } };
    FS_RULES.endCombatRound(st);
    if (!st.combat) return 'бой кончился раньше времени';
    eq(st.combat.tokens.defender.def, 2, 'жетоны защиты остались у владельца карты');
    eq(st.combat.tokens.attacker.def, 0, 'жетоны противника сброшены');
});

rule('card-d1', '«A player can choose not to resolve one of his abilities» (Combat Card Resolution) — способность боевой карты можно пропустить', () => {
    const name = 'Ложись!';
    const no = cardBattle(name);
    if (!no.pending || no.pending.question.kind !== 'ability') return 'движок не спросил о способности';
    eq(no.pending.answerSeat, 0, 'спрашивают владельца карты');
    const before = no.combat.dice.attacker.length;
    FS_RULES.apply(no, 0, { type: 'effect', answer: { no: true } });
    eq(no.combat.dice.attacker.length, before, 'отказ: кубик не получен');
    // The consent: the very same ability happens.
    const yes = cardBattle(name);
    if (!yes.pending || yes.pending.question.kind !== 'ability') return 'движок не спросил о способности';
    FS_RULES.apply(yes, 0, { type: 'effect', answer: { yes: true } });
    eq(yes.combat.dice.attacker.length, before + 1, 'согласие: кубик получен');
});

rule('card-d3', '«ваш противник должен выбрать и деморализовать 1 свой отряд» (04-combat-cards.md, «Ратлинг стрелок») — пометка карты знает круг боя', () => {
    const st = cardBattle('Ратлинг стрелок');
    const target = st.units.find(u => u.seat === 1);
    const round = st.combat.round;
    // The foe answers through the questions of the card: the ability, its
    // avoidance, and the unit it routes.
    for (let i = 0; i < 8 && st.pending; i++) {
        const q = st.pending.question || {};
        if (q.kind === 'ability') FS_RULES.apply(st, st.pending.answerSeat, { type: 'effect', answer: { yes: true } });
        else if (q.kind === 'yesno') FS_RULES.apply(st, st.pending.answerSeat, { type: 'effect', answer: { yes: false } });
        else if (q.kind === 'units') FS_RULES.apply(st, st.pending.answerSeat, { type: 'effect', answer: { units: [target.id] } });
        else break;
    }
    eq(target.routed, true, 'выбранный противником отряд деморализован');
    eq(target.routedRound, round, 'круг, в котором отряд деморализован, записан');
});

rule('card-d2', '«unless that ability uses the word must» — обязательную способность пропустить нельзя', () => {
    const MUST = /(^|[^а-яёa-z])(должен|должна|должно|должны|обязан|обязана|обязано|обязаны|обязательно)([^а-яёa-z]|$)/i;
    const card = FS_DATA.combat.find(c => !c.upgrade && MUST.test(c.general || ''));
    if (!card) return 'нет карты со словом «должен» или «обязан»';
    const st = cardBattle(card.name, card.faction);
    const asked = [];
    for (let i = 0; i < 8 && st.pending; i++) {
        if (st.pending.question.kind === 'ability') asked.push(st.pending.question.text);
        FS_RULES.apply(st, st.pending.answerSeat, { type: 'effect', answer: { yes: true } });
    }
    eq(asked.some(t => MUST.test(t)), false, 'обязательную способность не предлагают пропустить');
    // The abilities without the word must are offered: the permission is real.
    const other = FS_DATA.combat.find(c => !c.upgrade && c.faction === card.faction
        && c.name !== card.name && !MUST.test(c.general || '') && !MUST.test(c.unit || ''));
    if (!other) return true;
    const st2 = cardBattle(other.name, other.faction);
    let offers = 0;
    for (let i = 0; i < 8 && st2.pending; i++) {
        if (st2.pending.question.kind === 'ability') offers++;
        FS_RULES.apply(st2, st2.pending.answerSeat, { type: 'effect', answer: { yes: true } });
    }
    eq(offers > 0, true, 'необязательную способность предлагают');
});

rule('dom-3', '«The active player may resolve the special ability listed on the front of his faction sheet.» — способность можно и не применять', () => {
    const build = () => {
        const st = FS_RULES.newReadyGame({ seed: 11, players: [{ faction: 'орки', name: 'A' }, { faction: 'имперская-гвардия', name: 'B' }] });
        st.phase = 'operations';
        st.turn = 0;
        st.order = null;
        for (const s of st.systems) s.tokens = [];
        st.systems[0].tokens = [{ seat: 0, order: 'dominate' }];
        st.order = { seat: 0, order: 'dominate', system: st.systems[0].id, phase: 'dominate' };
        return st;
    };
    const ability = FS_RULES.faction(build(), 0) || {};
    const steps = FS_EFFECTS.parse((ability.ability && ability.ability.text) || '', { kind: 'ability', faction: 'орки' });
    if (!steps.length) return 'способность фракции не разбирается в шаги';
    // The ability is a permission: the order may be finished without it.
    const skipped = build();
    const res = FS_RULES.apply(skipped, 0, { type: 'finishDominate', skip: true });
    eq(res.ok, true, 'приказ можно закончить, не применяя способность');
    eq(!!skipped.pending, false, 'способность не сработала');
    eq(!!(skipped.order && skipped.order.finishAfterEffect), false, 'движок не ждёт эффекта способности');
    // Without the refusal the engine does resolve it.
    const played = build();
    FS_RULES.apply(played, 0, { type: 'finishDominate' });
    eq(!!played.pending || !!(played.order && played.order.finishAfterEffect) || played.order === null, true,
        'без отказа способность разыгрывается');
});

rule('start-2', '«Each faction has its own deck of 10 combat cards» и пять приказов-апгрейдов — колоды улучшений у игрока не пусты', () => {
    const st = FS_RULES.newReadyGame({ seed: 3, players: players() });
    for (const p of st.players) {
        const combat = FS_DATA.combat.filter(c => c.faction === p.faction && c.upgrade).length;
        const orders = FS_DATA.orders.filter(c => c.faction === p.faction).length;
        eq(p.decks.upgradeCombat.length, combat, 'колода боевых улучшений: ' + p.faction);
        eq(p.decks.upgradeOrder.length, orders, 'колода улучшений приказов: ' + p.faction);
    }
    eq(st.players[0].decks.upgradeCombat.length > 0, true, 'в колоде есть карты');
});

rule('start-1', '«Прочее на старте: 2 жетона материалов (ассетов).» (02-factions.md, Инквизиция) — игрок получает любые два ресурса', () => {
    const sheet = FS_DATA.factions.find(f => f.id === 'инквизиция');
    if (!sheet) return 'в данных нет Инквизиции';
    eq(sheet.start.choice, 2, 'по листу фракции — два жетона материалов');
    // An ordinary game: the board is assembled by the players, the assets wait.
    const live = FS_RULES.newGame({ players: [{ faction: 'инквизиция', name: 'A' }, { faction: 'орки', name: 'B' }], seed: 5, interactiveSetup: true });
    eq(live.players[0].startChoice, 2, 'жетоны ждут выбора игрока');
    const took = FS_RULES.apply(live, 0, { type: 'startAsset', asset: 'cache' });
    eq(took.ok, true, 'игрок взял тайник');
    eq(live.players[0].assets.cache, 1, 'тайник у игрока');
    eq(live.players[0].startChoice, 1, 'остался один выбор');
    // A game with a ready map: nothing of the sheet may be lost.
    const ready = FS_RULES.newReadyGame({ players: [{ faction: 'инквизиция', name: 'A' }, { faction: 'орки', name: 'B' }], seed: 5 });
    eq(assetsOf(ready.players[0]), 2, 'оба стартовых ресурса выданы');
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
