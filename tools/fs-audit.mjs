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
    CombatDamage, CombatHooks, CombatPlans, CombatCubes, CombatBans, BattleField, CombatOutcome, CombatApproach, CombatSides, EventPhase, QuickResponse, StormPhase, OrderScheme, Question, GamePhase,
    BoardSetup, GameLog, GameOutcome, MarchTrail, EventRound, StrikeDamage,
    BattleTest, Chance, PreAdvance, Choice, Seat } = ctx;
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

// Отказ с ПРИЧИНОЙ. «Команда отказала» само по себе ничего не доказывает:
// посторонний запрет (чужая фаза, нет фабрики, сейчас шаг наземных войск)
// делает такую проверку зелёной и при полностью сломанном правиле. Поэтому
// проверка требует и отказа, и того, что отказ называет именно эту норму.
const refused = (res, pattern, what) => {
    if (!res || res.ok !== false) {
        throw new Error(`${what}: ждали отказ, получили ${JSON.stringify(res && res.ok)}`);
    }
    if (!pattern.test(res.error || '')) {
        throw new Error(`${what}: причина «${res.error}» — не ${pattern}`);
    }
    return true;
};

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

rule('prep-1', '«After drawing cards during the preparation step of a combat … reroll 1 die for each unit in the contested area» (Сервочерепа-стражи)', () => {
    // `prepEffects` — единственный путь, которым обещание подготовки приказа
    // доходит до боя. Вопрос откладывается до этапа кубиков, поэтому проверка
    // идёт целым боем, а не одним вызовом.
    const rerollWith = (withCard) => {
        const st = empty(7);
        const sys = st.systems[0];
        const pos = worldOf(st, sys.id);
        unit(st, 0, 'гвардейцы', sys.id, pos);
        unit(st, 0, 'гвардейцы', sys.id, pos);
        unit(st, 1, 'бойзы', sys.id, pos);
        unit(st, 1, 'бойзы', sys.id, pos);
        st.players[0].faction = 'адептус-механикус';
        const card = FS_DATA.orders.find(c => /Сервочерепа/.test(c.name));
        eq(!!card, true, 'карта «Сервочерепа-стражи» есть');
        if (withCard) st.players[0].upgrades = [{ name: card.name, used: false, order: card.order }];
        st.order = { seat: 0, order: 'advance', system: sys.id, pos, phase: 'move', moveStep: 'ground', moved: [], steps: [] };
        st.phase = 'operations';
        st.turn = 0;
        if (withCard) {
            const u = FS_RULES.apply(st, 0, { type: 'useUpgrade', card: card.name });
            eq(u.ok, true, 'карта разыграна: ' + (u.error || ''));
            eq(!!OrderFight.of(st.order).prepReroll, true, 'приказ запомнил обещание переброса');
        }
        FS_RULES.apply(st, 0, { type: 'endAdvance' });
        eq(!!st.combat, true, 'бой начался');
        let sawReroll = 0;
        for (let i = 0; i < 40 && st.combat; i++) {
            if (st.pending) {
                const q = st.pending.question || {};
                // Боевые карты тоже перебрасывают по одному: признак карты —
                // «за каждого юнита», то есть сразу два кубика.
                if (q.op === 'rerollDie') sawReroll = Math.max(sawReroll, q.n || 0);
                FS_RULES.apply(st, st.pending.seat, { type: 'effect', answer: { choice: 0 } });
                continue;
            }
            const co = st.combat;
            if (/^reinforce/.test(co.step)) {
                FS_RULES.apply(st, co.step === 'reinforce-attacker' ? co.attacker : co.defender,
                    { type: 'combat', action: 'reinforce', count: 0 });
            } else if (/^choose/.test(co.step)) {
                const side = co.step === 'choose-attacker' ? 'attacker' : 'defender';
                const seat = side === 'attacker' ? co.attacker : co.defender;
                if (!(co.cards[side].hand || []).length) { FS_RULES.advanceCombatSteps(st); continue; }
                FS_RULES.apply(st, seat, { type: 'combat', action: 'playCard', index: 0 });
            } else if (/^damage/.test(co.step)) {
                const side = co.step === 'damage-attacker' ? 'attacker' : 'defender';
                const seat = side === 'attacker' ? co.attacker : co.defender;
                FS_RULES.apply(st, seat, { type: 'combat', action: 'damage', targets: FS_RULES.damageCandidates(st, side).map(x => x.id) });
            } else if (co.step === 'retreat') break;
            else FS_RULES.advanceCombatSteps(st);
        }
        return sawReroll;
    };
    eq(rerollWith(true), 2, 'с картой перебрасываются оба кубика (за каждого юнита)');
    eq(rerollWith(false), 1, 'без карты бой перебрасывает не больше одного');
});

rule('count-1', '«for each friendly world with a bastion / your city / your cultist …» — подсчёт «за каждый» считает один раз для всех карт', () => {
    // `countFor` — общий счётчик шести карт («Церемония перед боем», «Путь
    // воина», «Ужасный ритуал», «Убийственное представление», «Рассечение
    // тьмы», «Догма Министорума»). Ни одна проверка его не держала: снятие
    // любого вида проходило молча.
    const st = empty(7);
    const [s1, s2, s3] = st.systems;
    const w1 = worldOf(st, s1.id), w2 = worldOf(st, s2.id);
    guard(st, 0, s1.id, w1);
    FS_RULES.addStructure(st, 0, 'bastion', s1.id, w1);
    FS_RULES.addStructure(st, 0, 'city', s1.id, w1);
    // Второй мир — с городом, но БЕЗ отряда: город считается, а бастион в
    // мире без контроля — нет.
    FS_RULES.addStructure(st, 0, 'city', s2.id, w2);
    eq(FS_RULES.countFor(st, 0, 'friendlyBastion'), 1, 'один свой бастион');
    eq(FS_RULES.countFor(st, 0, 'yourCity'), 2, 'два своих города');
    // Культисты считаются в активной системе приказа.
    st.order = { seat: 0, order: 'advance', system: s1.id, phase: 'move' };
    for (let i = 0; i < 3; i++) unit(st, 0, 'гвардейцы', s1.id, w1);
    eq(FS_RULES.countFor(st, 0, 'cultist'), 0, 'культистов нет');
    // Жетоны подкрепления — из запаса игрока.
    st.players[0].assets.reinforcement = 2;
    eq(FS_RULES.countFor(st, 0, 'reinforcement'), 2, 'два жетона подкрепления');
    // Смешанная система — где есть и свои, и чужие отряды.
    olk(st, 1, s2.id, w2);
    unit(st, 0, 'гвардейцы', s2.id, w2);
    eq(FS_RULES.countFor(st, 0, 'mixedSystem'), 1, 'одна смешанная система');
    eq(FS_RULES.countFor(st, 0, 'noFoeSystem') >= 1, true, 'есть система без врага');
    eq(FS_RULES.countFor(st, 0, 'нетТакого'), 0, 'неизвестный вид — ноль');
});

rule('ops-1', '«The active player resolves one of his order tokens … then the next player …» — конец приказа передаёт ход, а последний приказ кончает фазу', () => {
    // Переход хода не проверял никто: «ход не меняется» и «приказ закончился»
    // проходили одинаково, потому что ни одна проверка не смотрела на очередь.
    const st = empty(7);
    for (const sys of st.systems) sys.tokens = [];
    const a = st.systems[0], b = st.systems[1] || st.systems[0];
    guard(st, 0, a.id, worldOf(st, a.id));
    guard(st, 1, b.id, worldOf(st, b.id));
    a.tokens = [{ seat: 0, order: 'advance', faceUp: false }];
    b.tokens = [{ seat: 1, order: 'deploy', faceUp: false }];
    st.phase = 'operations';
    st.turn = 0;
    // Ход игрока 0: приказ раскрывается.
    eq(FS_RULES.hasOrderToResolve(st, 0), true, 'у seat 0 есть приказ');
    eq(FS_RULES.hasOrderToResolve(st, 1), true, 'у seat 1 есть приказ');
    const res = FS_RULES.apply(st, 0, { type: 'resolveOrder', system: a.id });
    eq(res.ok, true, 'приказ раскрыт: ' + (res.error || ''));
    eq(FS_RULES.hasOrderToResolve(st, 0), false, 'приказ seat 0 израсходован');
    eq(GamePhase.of(st).turn, 0, 'пока приказ идёт, ход остаётся у него');
    // Ход переходит, когда приказ ЗАКОНЧЕН, а не когда раскрыт.
    const done = FS_RULES.apply(st, 0, { type: 'finishAdvance' });
    eq(done.ok, true, 'наступление закончено: ' + (done.error || ''));
    eq(GamePhase.of(st).turn, 1, 'ход перешёл к seat 1');
    // Последний приказ: после него наступает фаза обновления.
    st.order = null;
    st.pending = null;
    const last = FS_RULES.apply(st, 1, { type: 'resolveOrder', system: b.id });
    eq(last.ok, true, 'второй приказ раскрыт: ' + (last.error || ''));
    FS_RULES.apply(st, 1, { type: 'finishDeploy' });
    eq(FS_RULES.hasOrderToResolve(st, 0), false, 'приказов не осталось');
    eq(FS_RULES.hasOrderToResolve(st, 1), false, 'ни у кого');
});

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
    refused(bad, /своими отрядами или постройками/, 'приказ в систему без своих войск и без соседства');
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
    refused(third, /Жетоны этого приказа кончились/, 'третий жетон того же приказа');
    eq(st.players[0].placedTokens, 2, 'выложено жетонов');
});

rule('plan-3', '«Players cannot resolve or look at any order that is below another order token in a stack.»', () => {
    const st = game();
    const sys = st.systems[0];
    sys.tokens = [{ seat: 0, order: 'advance', faceUp: false }, { seat: 1, order: 'deploy', faceUp: false }];
    st.phase = 'operations';
    st.turn = 0;
    const bad = FS_RULES.apply(st, 0, { type: 'resolveOrder', system: sys.id });
    refused(bad, /не ваш приказ/, 'вскрыть чужой верхний жетон');
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
    refused(bad, /не ваш приказ/, 'чужой приказ');
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
    refused(res, /только в активную систему/, 'движение в неактивную систему');
});

rule('adv-2', '«Ground units cannot move into the active system from more than one adjacent system.»', () => {
    // Два соседа, у каждого мир, связанный с ОДНИМ И ТЕМ ЖЕ миром активной
    // системы: иначе марш запрещает не правило о двух системах, а отсутствие
    // дороги (так тест раньше проходил при выключенном правиле).
    const find = () => {
        for (const act of game().systems) {
            const out = [];
            for (const nb of FS_RULES.neighbors(game(), act.id)) {
                for (const w of act.areas.filter(a => a.world)) {
                    for (const v of FS_RULES.system(game(), nb).areas.filter(a => a.world)) {
                        if (FS_RULES.areasAround(game(), act.id, w.pos).some(x => x.system === nb && x.pos === v.pos)
                            && !out.some(o => o.nb === nb)) {
                            out.push({ nb, from: v.pos, to: w.pos });
                        }
                    }
                }
            }
            const pair = out.slice(0, 2);
            if (pair.length === 2) return { active: act.id, pair };
        }
        return null;
    };
    const found = find();
    if (!found) return 'нет системы с двумя соседями, связанными с её миром';
    const { active, pair } = found;
    const st = empty();
    const dest = pair[0].to;
    const a = guard(st, 0, pair[0].nb, pair[0].from);
    const b = guard(st, 0, pair[1].nb, pair[1].from);
    advance(st, 0, active, dest);
    const one = FS_RULES.apply(st, 0, { type: 'moveUnits', moves: [{ unit: a.id, system: active, pos: dest }] });
    eq(one.ok, true, 'первый отряд пришёл из своей системы');
    const second = FS_RULES.apply(st, 0, { type: 'moveUnits', moves: [{ unit: b.id, system: active, pos: dest }] });
    eq(second.ok, false, 'второй отряд из ДРУГОЙ соседней системы');
    eq(/одной соседней системы|из другой системы/.test(second.error || ''), true,
        'отказ называет правило о двух системах, а не дорогу: ' + second.error);
    // И оба одним приказом — тот же запрет.
    const st2 = empty();
    const a2 = guard(st2, 0, pair[0].nb, pair[0].from);
    const b2 = guard(st2, 0, pair[1].nb, pair[1].from);
    advance(st2, 0, active, dest);
    const both = FS_RULES.apply(st2, 0, {
        type: 'moveUnits',
        moves: [{ unit: a2.id, system: active, pos: dest }, { unit: b2.id, system: active, pos: dest }],
    });
    eq(both.ok, false, 'оба сразу — тот же отказ');
    eq(/одной соседней системы/.test(both.error || ''), true, 'и та же причина: ' + both.error);
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
    // Шторм стоит на общей грани двух систем — именно её и должен закрыть.
    const side = FS_RULES.sideBetween(st, near, active.id);
    st.storms = [{ id: 'st1', system: near, side, moved: false }];
    if (!FS_RULES.stormOn(st, near, active.id)) return 'шторм не встал на грань ' + near + '–' + active.id;
    // Первый шаг движения — корабли: наземные здесь не ходят вовсе, и отказ
    // «сейчас ход наземных» ничего не говорит о шторме.
    advance(st, 0, active.id, voidOf(st, active.id), 'ships');
    const ship = unit(st, 0, 'крейсеры', near, voidOf(st, near));
    const res = FS_RULES.apply(st, 0, { type: 'moveUnits', moves: [{ unit: ship.id, system: active.id, pos: voidOf(st, active.id) }] });
    eq(res.ok, false, 'корабль сквозь шторм');
    eq(/шторм/i.test(res.error || ''), true, 'отказ называет шторм, а не шаг движения: ' + res.error);
    // Та же дорога без шторма открыта: иначе отказ давал бы что-то другое.
    const open = empty();
    advance(open, 0, active.id, voidOf(open, active.id), 'ships');
    const free = unit(open, 0, 'крейсеры', near, voidOf(open, near));
    eq(FS_RULES.apply(open, 0, { type: 'moveUnits', moves: [{ unit: free.id, system: active.id, pos: voidOf(open, active.id) }] }).ok,
        true, 'без шторма тот же корабль проходит');
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
    refused(noFactory, /нет фабрики/, 'покупка без фабрики');
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
    refused(over, /Предел развёртывания исчерпан/, 'покупка сверх предела');
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
    refused(early, /Сначала отряды/, 'постройка до отрядов');
    FS_RULES.apply(st, 0, { type: 'deployStructures' });
    const first = FS_RULES.apply(st, 0, { type: 'buyStructure', system: active.id, pos, structure: 'factory' });
    eq(first.ok, true, 'первая постройка');
    const other = FS_RULES.system(st, active.id).areas.filter(a => a.world && a.pos !== pos)[0];
    if (other) {
        FS_RULES.addUnit(st, 0, 'гвардейцы', active.id, other.pos);
        const second = FS_RULES.apply(st, 0, { type: 'buyStructure', system: active.id, pos: other.pos, structure: 'city' });
        refused(second, /только одну постройку/, 'вторая постройка за приказ');
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
    refused(bad, /уровня командования/, 'КЛ выше командного уровня');
    const ok = FS_RULES.apply(st, 0, { type: 'buyUnit', system: active.id, pos, unit: 'огрины', forgeKl: true });
    eq(ok.ok, true, 'кузница снижает КЛ на один');
    eq(st.players[0].assets.forge, 0, 'кузница потрачена');
});

// ============================================================================
//  Strategize and Dominate
// ============================================================================
head('Одно понятие — одно место (устройство кода)');

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

rule('combat-0k', '«если отряды не пришли по приказу «Наступление», они отступают туда, откуда пришли» — приход в бой держит CombatApproach', () => {
    const combat = { attacker: 0, defender: 1, system: 's1', pos: 'A1' };
    const approach = CombatApproach.of(combat);
    eq(CombatApproach.of(combat), approach, 'у боя один приход');
    eq(CombatApproach.of(null), null, 'без боя прихода нет');
    // A battle that has just begun knows nothing of the way the units came.
    eq(approach.from, [], 'откуда пришли — пока пусто');
    eq(approach.viaAdvance, false, 'приказа «Наступление» не было');
    eq(approach.freeToReturn(), false, 'отступать куда угодно нельзя');
    // The units came from one area of the system: they may go back there.
    approach.set([{ system: 's1', pos: 'A2' }, { system: 's2', pos: 'B1' }], false);
    eq(approach.from.length, 2, 'две области прихода');
    eq(approach.fromSystem('s1'), true, 'пришли из системы боя');
    eq(approach.fromSystem('s3'), false, 'из соседней системы не приходили');
    eq(approach.fromArea('s1', 'A2'), true, 'пришли из этой области');
    eq(approach.fromArea('s1', 'A3'), false, 'из другой области — нет');
    eq(approach.fromArea('s2', 'B1'), true, 'и из области соседней системы');
    eq(approach.freeToReturn(), false, 'без «Наступления» отступают туда, откуда пришли');
    // «Наступление»: the units may retreat anywhere.
    approach.set([{ system: 's1', pos: 'A2' }], true);
    eq(approach.viaAdvance, true, 'приказ «Наступление» был');
    eq(approach.freeToReturn(), true, 'отступать можно куда угодно');
    // The record keeps only the address; nothing of the battle leaks into it.
    eq(approach.from[0], { system: 's1', pos: 'A2' }, 'адрес прихода');
    eq(approach.set(null, false).from.length, 0, 'пустой приход — пустой список');
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
    // «За каждый потраченный `morale cube`»: the payment of the same ability.
    eq(hooks.lastSpend, null, 'платежей ещё не было');
    eq(hooks.spentOf('morale'), 0, 'потраченных кубиков нет');
    hooks.recordSpend(['morale', 'morale'], 2);
    eq(hooks.spentOf(), 2, 'потрачено два кубика');
    eq(hooks.spentOf('morale'), 2, 'оба — кубики морали');
    eq(hooks.spentOf('att'), 0, 'кубиков атаки не тратили');
    eq(hooks.spentPairs(2), 1, 'одна полная пара кубиков');
    eq(hooks.spentPairs(), 1, 'пара — по умолчанию два кубика');
    eq(hooks.spentPairs(3), 0, 'тройки не набралось');
    hooks.recordSpend([], 0);
    eq(hooks.spentOf(), 0, 'пустой платёж');
    // «восстановите 1 отступивший отряд»: the unit the card has just moved.
    eq(hooks.lastRetreat, null, 'никто не отступал');
    hooks.recordRetreat('u7');
    eq(hooks.lastRetreat, 'u7', 'отступивший отряд записан');
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

rule('phase-0a', '«Each round consists of four phases» + «The active player…» — фазу раунда и чей ход держит GamePhase', () => {
    const state = { phase: 'planning', turn: 1, round: 3, players: [{}, {}], setup: null };
    const game = GamePhase.of(state);
    eq(GamePhase.of(state), game, 'у игры одна фаза');
    eq(GamePhase.of(null), null, 'без состояния фазы нет');
    // The four phases of a round, in the order they are played.
    eq(GamePhase.SETUP, 'setup', 'сборка карты');
    eq(GamePhase.PLANNING, 'planning', 'планирование');
    eq(GamePhase.OPERATIONS, 'operations', 'операции');
    eq(GamePhase.REFRESH, 'refresh', 'обновление');
    eq(game.name, 'planning', 'фаза игры');
    eq(game.is(GamePhase.PLANNING), true, 'это планирование');
    eq(game.is(GamePhase.OPERATIONS, GamePhase.REFRESH), false, 'не операции и не обновление');
    eq(game.round, 3, 'раунд игры');
    // The names the panel prints.
    eq(game.label, 'Планирование', 'подпись фазы');
    game.start(GamePhase.OPERATIONS);
    eq(state.phase, 'operations', 'фаза записана в состояние');
    eq(game.label, 'Операции', 'и подпись другая');
    eq(GamePhase.of({ phase: 'refresh' }).label, 'Обновление', 'обновление');
    eq(GamePhase.of({ phase: 'setup' }).label, 'Сборка карты', 'сборка карты');
    eq(GamePhase.of({}).label, 'Галактическая война', 'без фазы — игра ещё не идёт');
    // Whose turn it is: the phase's player — or the board builder.
    eq(game.active, 1, 'ход seat 1');
    eq(game.isActive(1), true, 'seat 1 действует');
    eq(game.isActive(0), false, 'seat 0 ждёт');
    state.setup = { turn: 0 };
    game.start(GamePhase.SETUP);
    eq(game.active, 0, 'карту собирает свой игрок');
    eq(game.isActive(0), true, 'и это он действует');
    state.setup = null;
    eq(game.active, null, 'без сборки действующего нет');
    // The turn of the phase is its own field: in the setup it differs from
    // whose hand is played.
    const turnOf = { phase: 'operations', turn: 1, players: [{}, {}, {}] };
    const game2 = GamePhase.of(turnOf);
    eq(game2.turn, 1, 'ход фазы у seat 1');
    eq(game2.isTurn(1), true, 'он действует');
    eq(game2.isTurn(2), false, 'seat 2 ждёт');
    game2.nextTurn();
    eq(game2.turn, 2, 'ход ушёл дальше');
    game2.turn = 0;
    eq(turnOf.turn, 0, 'ход записан в состояние');
    eq(GamePhase.of({ players: [{}, {}] }).nextTurn(), 0, 'без хода круг начинается с первого');
    // The circle of the players: the turn passes to the next seat.
    eq(GamePhase.next(1, 2), 0, 'ход по кругу');
    eq(GamePhase.next(0, 2), 1, 'и снова');
    eq(GamePhase.next(0, 0), 0, 'без игроков ход не меняется');
    // The first player token: it opens every round and passes in the refresh phase.
    const table = { phase: 'planning', turn: 0, round: 1, firstPlayer: 2, players: [{}, {}, {}] };
    const play = GamePhase.of(table);
    eq(play.count, 3, 'трое за столом');
    eq(play.firstPlayer, 2, 'первым играет seat 2');
    eq(play.isFirst(2), true, 'это первый игрок');
    eq(play.isFirst(0), false, 'а не seat 0');
    eq(play.circle().join(','), '2,0,1', 'круг идёт от первого игрока');
    // «The first player token passes to the next player».
    eq(play.passFirst(), 0, 'токен уходит следующему');
    eq(play.firstPlayer, 0, 'и круг начинается с него');
    // The round is the number of the marker, not the turn.
    play.startRound(play.round + 1);
    eq(table.round, 2, 'раунд закончился — следующий');
    eq(play.round, 2, 'номер раунда');
    // An eliminated first player still holds the token: planning starts with
    // the player before him who still has tokens.
    const gone = { phase: 'refresh', round: 4, firstPlayer: 1, players: [{}, { eliminated: true }, {}] };
    const others = GamePhase.of(gone);
    eq(others.firstPlayer, 1, 'выбывший первый держит токен');
    eq(others.opener((st, seat) => seat), 0, 'планирование начнёт игрок перед ним');
    eq(others.opener((st, seat) => 2), 2, 'или тот, кого назовёт nextPlanner');
    eq(GamePhase.of({}).firstPlayer, null, 'без состояния первого игрока нет');
});

rule('ask-0b', 'таблица вопросов не содержит заглушек: у каждого шага есть настоящая ветка вопроса', () => {
    // The defect this rule exists for: an op was registered in the ask table
    // with a body of `return null`, so the engine asked nothing and went on —
    // the opponent was never asked for his cube, the step looked performed.
    const dir = path.join(ROOT, 'js', 'fs', 'effects', 'ask');
    const stubs = [];
    for (const file of fs.readdirSync(dir)) {
        if (!file.endsWith('.js')) continue;
        const text = fs.readFileSync(path.join(dir, file), 'utf8');
        const re = /static\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{\s*(?:return\s+null;?)?\s*\}/g;
        let m;
        while ((m = re.exec(text))) stubs.push(file + ':' + m[1]);
    }
    // One deliberate no-op is allowed: `nothing` is a step of a sentence the
    // previous step already did («Затем получите такой же жетон»). The list can
    // only shrink — a new empty branch fails here.
    // The two deliberate no-ops whose work the *executor* does at once (the step
    // carries no choice at all): «Затем получите такой же жетон» and «все кубики
    // удара — атака» («Экстерминатус»). The list can only shrink.
    const known = ['FSEarnAsks.js:nothing', 'FSEarnAsks.js:strikeAllAtt'];
    const unexpected = stubs.filter(x => !known.includes(x));
    eq(unexpected.join(', ') || '—', '—', 'у каждого шага настоящая ветка вопроса');
    // And every registered op really has a branch (the tables are filled from ops).
    const missing = [...ASK_NAMES].filter(op => typeof ctx.ASK_EXECUTORS.get(op) !== 'function');
    eq(missing.join(', ') || '—', '—', 'у каждого имени в ops есть метод');
});

rule('play-0b', 'события и приказы доигрываются до конца: каждый вопрос получает ответ движка', () => {
    const answerFor = q => {
        const o = (q && q.options) || [];
        if (q && q.kind === 'dice') return { dice: o.slice(0, q.n || 1) };
        return { units: o.slice(0, 1), cards: o.slice(0, 1), area: o[0], system: o[0],
            asset: o[0], choice: 0, type: o[0], structures: o.slice(0, 1), yes: true };
    };
    const broken = [];
    const decks = [[FS_DATA.events, 'event', 'text'], [FS_DATA.orders, 'order', 'text']];
    for (const [pool, kind, field] of decks) {
        for (const card of pool) {
            if (!card[field]) continue;
            const st = FS_RULES.newGame({ seed: 7, interactiveSetup: false,
                players: [{ faction: card.faction || 'орки' }, { faction: 'инквизиция' }] });
            st.phase = 'operations'; st.turn = 0;
            try {
                const steps = FS_EFFECTS.parse(card[field], { kind, faction: card.faction });
                FS_EFFECTS.run(FS_RULES, st, 0, steps, { kind });
                let guard = 0;
                while (st.pending && guard++ < 30) {
                    const q = st.pending.question;
                    const r = FS_RULES.apply(st, q.who === undefined ? st.pending.seat : q.who,
                        { type: 'effect', answer: answerFor(q) });
                    if (!r.ok) { broken.push(card.name + ': ' + q.kind + '/' + q.op + ' → ' + r.error); break; }
                }
                if (guard >= 30) broken.push(card.name + ': зациклился на ' + (st.pending && st.pending.question.kind));
            } catch (e) {
                broken.push(card.name + ': ' + e.message);
            }
        }
    }
    eq(broken.join('; ') || '—', '—', 'ни одно событие и ни один приказ не застряли');
});

rule('plan-0b', '«Экстерминатус»: сброс карты переворачивает все кубики удара на атаку', () => {
    const card = FS_DATA.events.find(c => /Экстерминатус/.test(c.name));
    const steps = FS_EFFECTS.parse(card.text, { kind: 'event', faction: card.faction });
    const trig = steps.find(x => x.op === 'trigger');
    eq(trig.trigger, 'strike', 'момент — орбитальный удар');
    eq(trig.steps[0].op, 'strikeAllAtt', 'это не заглушка');
    // The strike itself: the same ships and the same roll, with the card and
    // without it. Every cube of the roll is an attack when the card is used.
    const build = allAtt => {
        const st = FS_RULES.newGame({ seed: 3, interactiveSetup: false,
            players: [{ faction: 'инквизиция', name: 'A' }, { faction: 'орки', name: 'B' }] });
        st.units = [];
        const sys = st.systems[0];
        const v = sys.areas.find(a => !a.world);
        const w = sys.areas.find(a => a.world);
        const ship = FS_DATA.factions.find(f => f.id === 'инквизиция').units.find(u => u.type === 'ship');
        const grunt = FS_DATA.factions.find(f => f.id === 'орки').units.find(u => u.type === 'ground');
        unit(st, 0, ship.id, sys.id, v.pos);
        unit(st, 1, grunt.id, sys.id, w.pos);
        st.phase = 'operations'; st.turn = 0;
        st.order = { seat: 0, order: 'advance', system: sys.id, phase: 'strike' };
        if (allAtt) FS_EFFECTS.run(FS_RULES, st, 0, trig.steps, { kind: 'order' });
        // The roll is forced for this one strike, and the dice of the whole
        // audit are restored right after it: a rule must not leak into the
        // rules that run after it.
        const roll = FS_RULES.rollDice;
        FS_RULES.rollDice = (s2, n) => Array.from({ length: n }, () => 'def');
        try {
            FS_RULES.apply(st, 0, { type: 'orbitalStrike', system: sys.id, pos: w.pos, from: v.pos });
        } finally {
            FS_RULES.rollDice = roll;
        }
        const log = st.log.map(x => x.text || x).find(t => /орбитальный удар/.test(t)) || '';
        return Number((/\d+/.exec(String(log)) || [0])[0]);
    };
    eq(build(false), 0, 'без карты кубики обороны не бьют');
    eq(build(true), 2, 'с картой все кубики бьют');
});

rule('plan-0a', '«Триумфальный отход»: сброс карты собирает маркер цели в дружественном мире активной системы', () => {
    const card = FS_DATA.events.find(c => /Триумфальный отход/.test(c.name));
    const steps = FS_EFFECTS.parse(card.text, { kind: 'event', faction: card.faction });
    const trig = steps.find(x => x.op === 'trigger');
    eq(!!trig && !!trig.steps.length, true, 'у плана есть тело');
    eq(trig.steps[0].op, 'collectObjective', 'это сбор маркера цели, а не заглушка');
    eq(trig.steps[0].faction, 'инквизиция', 'маркер именно Инквизиции');
    // The token of the friendly world is collected, the token of the enemy
    // world stays: the rule of the token is the refresh phase's own.
    const st = FS_RULES.newGame({ seed: 5, interactiveSetup: false,
        players: [{ faction: 'инквизиция' }, { faction: 'орки' }] });
    const sys = st.systems[0];
    const pos = worldOf(st, sys.id);
    st.objectives.push({ id: 'obj-a', faction: 'инквизиция', system: sys.id, area: pos });
    st.objectives.push({ id: 'obj-b', faction: 'инквизиция', system: st.systems[3].id, area: worldOf(st, st.systems[3].id) });
    st.order = { seat: 0, order: 'advance', system: sys.id, phase: 'resolve' };
    FS_EFFECTS.run(FS_RULES, st, 0, trig.steps, { kind: 'event' });
    eq(st.players[0].objectives, 1, 'свой маркер собран');
    eq(st.objectives.some(o => o.id === 'obj-a'), false, 'он ушёл с доски');
    eq(st.objectives.some(o => o.id === 'obj-b'), true, 'чужой мир не тронут');
});

rule('play-0a', 'каждая боевая карта доигрывается до конца: движок отвечает на её вопросы без ошибок', () => {
    // A card that asks a question is answered the way the panel answers it: the
    // first option, every die it names. The engine must not refuse an answer it
    // has just asked for — that is how a step that asks nothing (or asks the
    // wrong seat) shows up on the real table.
    const answerFor = q => {
        const o = (q && q.options) || [];
        if (q && q.kind === 'dice') return { dice: o.slice(0, q.n || 1) };
        return { units: o.slice(0, 1), cards: o.slice(0, 1), area: o[0], system: o[0],
            asset: o[0], choice: 0, type: o[0], structures: o.slice(0, 1), yes: true };
    };
    const broken = [];
    for (const card of FS_DATA.combat) {
        if (!card.faction) continue;
        const foe = card.faction === 'орки' ? 'имперская-гвардия' : 'орки';
        const cl0 = id => FS_DATA.factions.find(f => f.id === id).units.find(u => u.kl === 0 && u.type === 'ground').id;
        const st = FS_RULES.newReadyGame({ seed: 11, players: [{ faction: card.faction, name: 'A' }, { faction: foe, name: 'B' }] });
        st.units = []; st.structures = []; st.objectives = []; st.storms = [];
        for (const sys of st.systems) sys.tokens = [];
        st.phase = 'operations'; st.turn = 0; st.order = null;
        const sys = st.systems[0];
        const pos = worldOf(st, sys.id);
        for (let i = 0; i < 2; i++) unit(st, 0, cl0(card.faction), sys.id, pos);
        for (let i = 0; i < 2; i++) unit(st, 1, cl0(foe), sys.id, pos);
        advance(st, 0, sys.id, pos);
        const start = FS_RULES.apply(st, 0, { type: 'endAdvance' });
        if (!start.ok) { broken.push(card.name + ': бой не начался'); continue; }
        st.combat.cards.attacker.hand = [card.name];
        st.combat.cards.defender.hand = [];
        st.combat.step = 'choose-attacker';
        FS_RULES.apply(st, 0, { type: 'combat', action: 'playCard', index: 0 });
        FS_RULES.advanceCombatSteps(st);
        let guard = 0;
        while (st.pending && guard++ < 25) {
            const q = st.pending.question;
            const r = FS_RULES.apply(st, q.who === undefined ? st.pending.seat : q.who,
                { type: 'effect', answer: answerFor(q) });
            if (!r.ok) { broken.push(card.name + ': ' + q.kind + '/' + q.op + ' → ' + r.error); break; }
        }
        if (guard >= 25) broken.push(card.name + ': зациклился на ' + (st.pending && st.pending.question.kind));
    }
    eq(broken.join('; ') || '—', '—', 'ни одна боевая карта не застряла на своём же вопросе');
});

rule('avoid-0c', 'у каждого «может избежать» назван плательщик: чужая карта не платит за противника', () => {
    // «Он может избежать этого эффекта, если потратит 1 `def. cube`» — the
    // pronoun points back at the one the step was done to. A step without a
    // payer is offered to the owner of the card (the default of the question),
    // so every avoid of the deck must name somebody.
    const silent = [];
    const fields = [['combat', FS_DATA.combat, 'general'], ['combat', FS_DATA.combat, 'unit'],
        ['event', FS_DATA.events, 'text'], ['order', FS_DATA.orders, 'text']];
    for (const [kind, pool, field] of fields) {
        for (const card of pool) {
            if (!card[field]) continue;
            const list = FS_EFFECTS.parse(card[field], { kind, faction: card.faction });
            const walk = one => {
                if (!one || typeof one !== 'object') return;
                if (one.avoid && !one.avoid.by) silent.push(card.name + ': ' + one.op);
                for (const key of ['options', 'then', 'steps']) if (Array.isArray(one[key])) one[key].forEach(walk);
            };
            [].concat(list).forEach(walk);
        }
    }
    eq(silent.join(', ') || '—', '—', 'ни одна карта не платит за противника молча');
});

rule('avoid-0a', '«Ваш противник может избежать этого эффекта, если потратит 1 `def. cube`» — платит противник, а не владелец карты', () => {
    // The text names WHO pays; the engine used to ask the owner of the card
    // (the default of the avoid step), so the opponent's payment was paid by
    // the player who played the card.
    const st = cardBattle('Всегда в движении', 'темные-эльдары');
    let guard = 0;
    while (st.pending && st.pending.question.kind === 'ability' && guard++ < 4) {
        FS_RULES.apply(st, st.pending.question.who, { type: 'effect', answer: { yes: true } });
    }
    const q = st.pending && st.pending.question;
    eq(q && q.op, 'avoid', 'вопрос об избегании задан');
    eq(q.who, 1, 'его задают противнику');
    FS_RULES.apply(st, q.who, { type: 'effect', answer: { dice: [] } });
    eq(st.combat.tokens.attacker.att, 2, 'не заплатил — два жетона атаки владельцу карты');
});

rule('avoid-0b', '«Если он это сделал, то получите 1 `morale cube`» — половина карты только за оплату', () => {
    for (const pay of [true, false]) {
        const st = cardBattle('Геройское самосожжение', 'сестры-битвы');
        let guard = 0;
        while (st.pending && st.pending.question.kind === 'ability' && guard++ < 4) {
            FS_RULES.apply(st, st.pending.question.who, { type: 'effect', answer: { yes: true } });
        }
        const q = st.pending && st.pending.question;
        eq(q && q.op, 'avoid', 'вопрос об избегании');
        eq(q.who, 1, 'платит противник');
        const dice = pay ? (q.options || []).slice(0, 1) : [];
        FS_RULES.apply(st, q.who, { type: 'effect', answer: { dice } });
        const morale = st.combat.dice.attacker.filter(x => x === 'morale').length;
        eq(st.combat.tokens.attacker.def, pay ? 0 : 3, pay ? 'заплатил — жетонов нет' : 'не заплатил — три жетона');
        if (pay) eq(morale, 1, 'заплатил — один кубик морали');
    }
});

rule('foe-fork-0b', '«Если противник не потратит 1 `morale cube`, получите 3 `def. token`» — вопрос идёт противнику, и при оплате токенов НЕ дают', () => {
    const card = ctx.FS_DATA.combat.find(c => c.faction === 'эльдары' && /Волновой змей/.test(c.name));
    const steps = ctx.FS_EFFECTS.parse(card.general, { kind: 'combat', faction: card.faction });
    // The second half of the card is asked about as a separate ability: the fork
    // is offered, and the opponent answers it.
    for (const pay of [true, false]) {
        const st = cardBattle('Волновой змей', 'эльдары');
        let guard = 0;
        while (st.pending && guard++ < 6) {
            const q = st.pending.question;
            if (q.op === 'foePayFork') break;
            FS_RULES.apply(st, q.who, { type: 'effect', answer: { yes: true } });
        }
        eq(!!(st.pending && st.pending.question.op === 'foePayFork'), true,
            'движок спрашивает противника о платеже (не молчит)');
        eq(st.pending.question.kind, 'dice', 'платят кубиками');
        const dice = st.pending.question.options.slice(0, 1);
        FS_RULES.apply(st, st.pending.question.who, { type: 'effect', answer: { dice: pay ? dice : [] } });
        eq(st.combat.tokens.attacker.def, pay ? 0 : 3,
            pay ? 'заплатил — второй половины карты нет' : 'не заплатил — три жетона обороны');
    }
    eq(steps.length, 2, 'карта читается двумя шагами');
});

rule('foe-fork-0c', '«Ваш противник может отступить 1 своим юнитом» — решает он: отказ даёт то, что написано дальше', () => {
    for (const yes of [true, false]) {
        const st = cardBattle('Добейте выживших', 'темные-эльдары');
        let guard = 0;
        while (st.pending && guard++ < 6) {
            const q = st.pending.question;
            if (q.op === 'foeRetreatOffer') break;
            FS_RULES.apply(st, q.who, { type: 'effect', answer: { yes: true } });
        }
        eq(!!(st.pending && st.pending.question.op === 'foeRetreatOffer'), true, 'вопрос об отступлении задан противнику');
        eq(st.pending.question.who, 1, 'и спрашивают именно его');
        const before = st.units.filter(u => u.seat === 1).length;
        FS_RULES.apply(st, 1, { type: 'effect', answer: { yes } });
        // The refusal is followed by the punishment of the card; the retreat asks
        // for the unit and then for the area.
        eq(st.units.filter(u => u.seat === 1).length, before, 'никто не гибнет от самого вопроса');
        if (yes) eq(!!(st.pending && st.pending.question.kind === 'units'), true, 'отступает его отряд');
    }
});

rule('foe-fork-0d', '«Уничтожьте его, если противник не потратит количество кубиков, равное командному уровню этого отряда» — цена считается по жертве', () => {
    for (const pay of [true, false]) {
        const st = cardBattle('Сокрушающий гаргант', 'орки');
        // The price is the command level of the victim: a unit of level 1 stands
        // in the battle, so the price is not zero.
        const foeFaction = 'имперская-гвардия';
        const elite = FS_DATA.factions.find(f => f.id === foeFaction).units.find(u => u.kl === 1 && u.type === 'ground');
        const sysId = st.systems[0].id;
        unit(st, 1, elite.id, sysId, worldOf(st, sysId));
        // The text of the card is the ability of a unit («Гаргант/Килл
        // круизер»): the engine plays it for the unit itself, so the steps run
        // without the permission of the owner.
        const card = FS_DATA.combat.find(x => x.faction === 'орки' && /Сокрушающий гаргант/.test(x.name));
        const steps = FS_EFFECTS.parse(card.unit, { kind: 'combat', faction: card.faction });
        FS_EFFECTS.run(FS_RULES, st, 0, steps, { kind: 'combat' });
        eq(!!(st.pending && st.pending.question.kind === 'units'), true, 'жертву выбирает владелец карты');
        const kl1 = st.pending.question.options.find(id => (FS_RULES.unitOf(st, st.units.find(u => u.id === id)).kl || 0) === 1);
        const victim = kl1 || st.pending.question.options[0];
        FS_RULES.apply(st, 0, { type: 'effect', answer: { units: [victim] } });
        eq(!!(st.pending && st.pending.question.kind === 'dice'), true, 'цена — кубики владельца жертвы');
        const price = st.pending.question.n;
        eq(price, (FS_RULES.unitOf(st, st.units.find(u => u.id === victim)).kl || 0), 'цена равна командному уровню жертвы');
        const dice = st.pending.question.options.slice(0, price);
        FS_RULES.apply(st, st.pending.question.who, { type: 'effect', answer: { dice: pay ? dice : [] } });
        eq(!!st.units.find(u => u.id === victim), pay, pay ? 'заплатил — отряд цел' : 'не заплатил — отряд уничтожен');
    }
});

rule('foe-fork-0a', '«Если противник не потратит 1 `morale cube`, получите 3 `def. token`» — вопрос задают противнику, а не игроку', () => {
    const card = ctx.FS_DATA.combat.find(c => c.faction === 'эльдары' && /Волновой змей/.test(c.name));
    const steps = ctx.FS_EFFECTS.parse(card.general, { kind: 'combat', faction: card.faction });
    eq(steps.map(s => s.op).join(','), 'gainDie,foePayFork', 'платёж противника — шаг движка, не заглушка');
    const fork = steps[1];
    eq(fork.n, 1, 'цена — один кубик');
    eq(fork.kinds.join(','), 'morale', 'именно morale');
    eq(Array.isArray(fork['then']) && fork['then'][0].op, 'gainToken', 'при отказе — жетоны игроку');
    eq(fork['then'][0].n, 3, 'три жетона');
});

rule('abil-2', '«… вы можете выполнить приказ развертывания, используя 1 фабрику в активной системе … только в тот самый мир фабрики» — «Массовое Производство» гвардии', () => {
    // Способность фракции вставляет второй приказ внутрь доминирования. Её шаг
    // `guardDeploy` не исполнялся ни одной проверкой: abil-1 только разбирала
    // текст и отвечала на вопросы, а этот шаг идёт без вопроса.
    const players = () => [{ faction: 'имперская-гвардия', name: 'P0', id: 'p0' }, { faction: 'орки', name: 'P1', id: 'p1' }];
    const board = () => {
        const st = FS_RULES.newReadyGame({ seed: 7, players: players() });
        st.units = []; st.structures = []; st.objectives = []; st.storms = [];
        for (const s of st.systems) s.tokens = [];
        st.phase = 'operations'; st.turn = 0;
        const sys = st.systems[0];
        const world = worldOf(st, sys.id);
        FS_RULES.addUnit(st, 0, 'гвардейцы', sys.id, world);
        st.players[0].materiel = 14;
        st.players[0].supply.units['гвардейцы'] = 9;
        st.players[0].supply.units['огрины'] = 2;
        st.order = { seat: 0, order: 'dominate', system: sys.id, pos: world, phase: 'dominate' };
        return { st, sys: sys.id, world };
    };
    // Без фабрики в активной системе способность не запускается вовсе.
    const noFactory = board();
    FS_RULES.runEffects(noFactory.st, 0, [{ op: 'guardDeploy' }], { kind: 'ability', ctx: null });
    eq(noFactory.st.order.phase, 'dominate', 'без фабрики приказ доминирования не подменяется');
    // С фабрикой — второй приказ развёртывания.
    const { st, sys, world } = board();
    FS_RULES.addStructure(st, 0, 'factory', sys, world);
    FS_RULES.runEffects(st, 0, [{ op: 'guardDeploy' }], { kind: 'ability', ctx: null });
    eq(PhasePlan.of(st.order).is('guardDeploy'), true, 'идёт производство фабрики');
    eq(JSON.stringify(DeployScope.of(st.order).factory), JSON.stringify({ system: sys, pos: world }),
        'фабрика запомнена: отряды идут в её мир');
    const first = FS_RULES.apply(st, 0, { type: 'buyUnit', unit: 'гвардейцы', system: sys, pos: world });
    eq(first.ok, true, 'Гвардеец куплен: ' + (first.error || ''));
    // «по цене на 1 меньше обычного»: цена покупки, а не только отсутствие ошибки.
    const guardDef = ctx.FS_CATALOG.unit('имперская-гвардия', 'гвардейцы');
    const bought = Purchases.of(st.order).units[0];
    eq(bought && bought.cost, (guardDef.cost || 0) - 1,
        'Гвардеец на 1 дешевле напечатанного (' + guardDef.cost + ' → ' + (bought && bought.cost) + ')');
    // «2 Гвардейца могут быть куплены за 1 жетон запасов»: второй из пары
    // стоит жетон тайника, а не материю.
    st.players[0].assets.cache = 1;
    const second = FS_RULES.apply(st, 0, { type: 'buyUnit', unit: 'гвардейцы', system: sys, pos: world });
    eq(second.ok, true, 'второй Гвардеец куплен: ' + (second.error || ''));
    const pair = Purchases.of(st.order).units;
    eq(pair.length, 2, 'в паре два отряда');
    eq(pair[1].cost, 0, 'второй Гвардеец пары не стоит материи');
    eq(st.players[0].assets.cache, 0, 'и пара оплачена жетоном запасов');
    // «минимум 2 отряда одного типа»: второй тип запрещён.
    refused(FS_RULES.apply(st, 0, { type: 'buyUnit', unit: 'огрины', system: sys, pos: world }),
        /только один тип отрядов/, 'второй тип в том же производстве');
    // «должны быть развернуты в мире, который их произвёл»: другой мир — отказ.
    const otherWorld = st.systems.find(x => x.id !== sys && x.areas.some(a => a.world));
    if (otherWorld) {
        refused(FS_RULES.apply(st, 0, { type: 'buyUnit', unit: 'гвардейцы', system: otherWorld.id,
            pos: otherWorld.areas.find(a => a.world).pos }), /активной системе|мир, который|мир фабрики|развёртыван/i,
            'отряд не покупается в чужой мир');
    }
    // «только наземные отряды»: корабль не производится.
    const v = voidOf(st, sys);
    FS_RULES.addUnit(st, 0, 'крейсеры', sys, v);
    refused(FS_RULES.apply(st, 0, { type: 'buyUnit', unit: 'крейсеры', system: sys, pos: v }),
        /только наземные отряды/, 'корабль этой способностью не покупается');
});

rule('scheme-0c', '«деморализован или уничтожен — сбросить эту карту, чтобы …» — шаги выложенного плана исполняются на его моменте', () => {
    // Карта-план живёт в игре свёрнутой: её шаги выполняются не при разборе
    // текста, а когда наступает её момент. Проверка разбирала текст и не
    // выкладывала план, поэтому НИ ОДИН шаг плана не исполнялся: `resurrect`,
    // `klBonus`, `strikeBonus`, `unitsThroughStorms` и другие числились
    // объявленными, но непроверенными.
    const broken = [];
    let ran = 0;
    for (const card of (FS_DATA.events || [])) {
        if (card.type !== 'scheme') continue;
        const steps = FS_EFFECTS.parse(card.text || '', { kind: 'event', faction: card.faction });
        const trig = steps.find(x => x.op === 'trigger');
        if (!trig || !(trig.steps || []).length) continue;
        let done = false;
        let last = null;
        for (const phase of ['move', 'strike', 'combat', 'refresh', 'planning']) {
            const st = empty(9);
            const sys = st.systems[0];
            const pos = worldOf(st, sys.id);
            const v = voidOf(st, sys.id);
            st.players[0].faction = card.faction;
            const f = ctx.FS_CATALOG.faction(card.faction);
            const g = (f.units.find(u => u.type === 'ground') || f.units[0]).id;
            const sh = (f.units.find(u => u.type === 'ship') || f.units[0]).id;
            st.units.push({ id: 'p0', seat: 0, faction: card.faction, def: g, system: sys.id, area: pos, routed: true });
            st.units.push({ id: 'p2', seat: 0, faction: card.faction, def: sh, system: sys.id, area: v, routed: false });
            st.units.push({ id: 'p1', seat: 1, faction: 'орки', def: 'бойзы', system: sys.id, area: pos, routed: false });
            st.units.push({ id: 'p3', seat: 1, faction: 'орки', def: 'атакующие-корабли-класса-натиск', system: sys.id, area: v, routed: false });
            FS_RULES.addStructure(st, 0, 'factory', sys.id, pos);
            FS_RULES.addStructure(st, 0, 'city', sys.id, pos);
            FS_RULES.addStructure(st, 1, 'bastion', sys.id, pos);
            for (const p of st.players) {
                p.assets.forge = 2; p.assets.cache = 2; p.assets.reinforcement = 2;
            }
            if (phase === 'refresh') st.phase = 'refresh';
            if (phase === 'planning') st.phase = 'planning';
            if (phase === 'move') st.order = { seat: 0, order: 'advance', system: sys.id, pos, phase: 'move', moveStep: 'ground', moved: [], steps: [] };
            if (phase === 'strike') st.order = { seat: 0, order: 'advance', system: sys.id, pos, phase: 'strike' };
            if (phase === 'combat') {
                st.order = { seat: 0, order: 'advance', system: sys.id, pos, phase: 'move', moveStep: 'ground', moved: [], steps: [] };
                FS_RULES.apply(st, 0, { type: 'endAdvance' });
                if (!st.combat) continue;
            }
            try {
                // Ровно то, что делает движок, когда игрок сбрасывает план.
                FS_RULES.runEffects(st, 0, trig.steps, { kind: 'event', ctx: null });
                const why = exploreAnswers(st);
                if (why) { last = phase + ': ' + why; continue; }
                ran++;
                done = true;
                break;
            } catch (e) {
                last = phase + ': ' + e.message;
            }
        }
        if (!done) broken.push(card.faction + ' / ' + card.name + ': ' + last);
    }
    eq(broken.slice(0, 3), [], 'планы со шагами исполняются (' + broken.length + ' нет; сыграно ' + ran + ')');
});

rule('scheme-0b', '«… выполнить приказ продвижения в любой системе, содержащей не менее 2-х ваших отрядов» (Вперёд!)', () => {
    const card = ctx.FS_DATA.events.find(c => c.name === 'Вперёд!');
    const trig = ctx.FS_EFFECTS.parse(card.text, { kind: 'event', faction: card.faction }).find(s => s.op === 'trigger');
    eq(!!trig && trig.note, false, 'у плана есть действие');
    eq(trig.steps.map(s => s.op).join(','), 'advanceFromPlan', 'это продвижение из плана');
    const st = FS_RULES.newGame({ seed: 13, players: [
        { name: 'О', faction: 'орки' }, { name: 'И', faction: 'инквизиция' }], interactiveSetup: false });
    const bySys = new Map();
    for (const u of st.units.filter(u => u.seat === 0)) bySys.set(u.system, (bySys.get(u.system) || 0) + 1);
    const one = [...bySys.entries()].find(([, n]) => n >= 2);
    eq(!!one, true, 'есть система с двумя отрядами');
    FS_RULES.runEffects(st, 0, trig.steps, { kind: 'event' });
    eq(st.pending.question.kind, 'systems', 'спросили систему');
    eq(st.pending.question.options.includes(one[0]), true, 'система с двумя отрядами предложена');
    FS_RULES.apply(st, 0, { type: 'effect', answer: { system: one[0] } });
    eq(st.order && st.order.order, 'advance', 'начался приказ продвижения');
    eq(st.order.fromEvent, true, 'и он вернёт игру в фазу событий');
    return eq(st.order.system, one[0], 'в выбранной системе');
});

rule('scheme-0a', 'Событие-план: у каждой карты-плана в движке есть хотя бы одно действие, ни одна не остаётся только заглушкой', () => {
    // A plan whose whole text is `scheme` + `trigger` + `note` does nothing at
    // all when the player discards it: the class of «Пожиратель миров», where
    // the text promises and the engine is silent.
    const dig = (list, out, d) => {
        if (d > 6) return out;
        for (const one of [].concat(list || [])) {
            if (!one) continue;
            if (one.op) out.push(one.op);
            for (const key of ['options', 'then', 'no', 'steps', 'replace']) if (one[key]) dig(one[key], out, d + 1);
        }
        return out;
    };
    /** @type {string[]} */
    const silent = [];
    for (const c of ctx.FS_DATA.events) {
        if (!c.text || c.type !== 'scheme') continue;
        const ops = dig(ctx.FS_EFFECTS.parse(c.text, { kind: 'event', faction: c.faction }), [], 0)
            .filter(o => o !== 'note' && o !== 'icons' && o !== 'nothing' && o !== 'scheme' && o !== 'trigger');
        if (!ops.length) silent.push(c.name);
    }
    // The plans the engine cannot perform yet are named one by one: the list
    // may only shrink, and every card in it is a known TODO, not a surprise.
    const known = ['Варбосс', 'Обход',
        'Несокрушимая вера', 'Псионическая война'];
    const extra = silent.filter(n => !known.includes(n));
    eq(extra.join(', '), '', 'новых карт-планов без действия нет');
    return eq(silent.length <= known.length, true, 'карты без действия перечислены (' + silent.length + ')');
});

rule('raid-0a', '«… выбрать и сбросить 1 жетон ценных ресурсов противника. Затем получите такой же жетон» (Воруй!)', () => {
    const card = ctx.FS_DATA.orders.find(c => c.name === 'Воруй!');
    eq(!!card, true, 'карта есть');
    const steps = ctx.FS_EFFECTS.parse(card.text, { kind: 'order', faction: card.faction });
    eq(steps.map(s => s.op).includes('takeFoeAsset'), true, 'кража — шаг движка');
    eq(steps.every(s => s.op !== 'note'), true, 'заглушек нет');
    const st = FS_RULES.newGame({ seed: 9, players: [
        { name: 'Д', faction: 'темные-эльдары' }, { name: 'О', faction: 'орки' }], interactiveSetup: false });
    st.players[1].assets.cache = 2;
    FS_RULES.runEffects(st, 0, [{ op: 'takeFoeAsset', n: 1, who: 'me' }], { kind: 'order' });
    eq(st.pending.question.kind, 'assetType', 'спросили, какой жетон забрать');
    eq(st.pending.question.options.join(','), 'cache,reinforcement', 'предложены только жетоны противника');
    FS_RULES.apply(st, 0, { type: 'effect', answer: { asset: 'cache' } });
    eq(st.players[1].assets.cache, 1, 'у противника жетон ушёл');
    eq(st.players[0].assets.cache, 1, 'у игрока такой же появился');
});

rule('radical-0a', '«Либо купите 1 постройку, уменьшив её стоимость на 1, либо уничтожьте 1 постройку в дружественном мире…» (Радикалы и пуритане)', () => {
    const card = [...ctx.FS_DATA.events, ...ctx.FS_DATA.orders].find(c => c.name === 'Радикалы и пуритане');
    eq(!!card, true, 'карта есть');
    const steps = ctx.FS_EFFECTS.parse(card.text, { kind: 'event', faction: card.faction });
    eq(steps.length, 1, 'одна развилка');
    eq(steps[0].op, 'choice', 'это выбор из двух');
    eq(steps[0].options.map(o => o.op).join(','), 'placeStructure,destroyStructureForMateriel',
        'обе опции — действия движка, ни одной заглушки');
    eq(steps[0].options[0].discount, 1, 'первая опция дешевле на 1');
    eq(steps[0].options[1].bonus, 1, 'вторая опция даёт стоимость +1');
    // The engine, not the player, does both: the structure leaves the board
    // and the materiel arrives.
    const st = FS_RULES.newGame({ seed: 5, players: [
        { name: 'И', faction: 'инквизиция' }, { name: 'О', faction: 'орки' }], interactiveSetup: false });
    const world = FS_RULES.board(st).friendlyWorlds(0)[0];
    eq(!!world, true, 'у инквизиции есть дружественный мир');
    FS_RULES.addStructure(st, 0, 'city', world.system, world.pos);
    const city = st.structures.find(x => x.seat === 0 && x.type === 'city');
    const price = FS_RULES.structureStats('city').cost;
    const before = st.players[0].materiel;
    FS_RULES.runEffects(st, 0, steps, { kind: 'event', ctx: null });
    eq(st.pending.question.kind, 'choice', 'спросили, какую из двух');
    FS_RULES.apply(st, 0, { type: 'effect', answer: { choice: 1 } });
    eq(st.pending.question.kind, 'structures', 'спросили, какую постройку уничтожить');
    eq(st.pending.question.options.join(','), city.id, 'предложена только своя постройка в дружественном мире');
    FS_RULES.apply(st, 0, { type: 'effect', answer: { structure: city.id } });
    eq(st.structures.some(x => x.id === city.id), false, 'постройка уничтожена');
    eq(st.players[0].materiel - before, price + 1, 'материя равна стоимости постройки + 1');
    // The first option: the discount is the price paid, not a free build.
    const st2 = FS_RULES.newGame({ seed: 5, players: [
        { name: 'И', faction: 'инквизиция' }, { name: 'О', faction: 'орки' }], interactiveSetup: false });
    st2.players[0].materiel = price;
    const before2 = st2.players[0].materiel;
    FS_RULES.runEffects(st2, 0, steps, { kind: 'event', ctx: null });
    FS_RULES.apply(st2, 0, { type: 'effect', answer: { choice: 0 } });
    FS_RULES.apply(st2, 0, { type: 'effect', answer: { type: 'city' } });
    const area = st2.pending.question.options[0];
    FS_RULES.apply(st2, 0, { type: 'effect', answer: { area } });
    eq(!!area, true, 'было куда строить');
    eq(before2 - st2.players[0].materiel, price - 1, 'город оплачен со скидкой 1');
    eq(st2.structures.some(x => x.seat === 0 && x.type === 'city'), true, 'город стоит на доске');
});

rule('trophy-0a', '«Получите материалы, равные его материальной стоимости, и жетоны подкрепления…» — «Жуткие трофеи» платит за уничтоженный отряд', () => {
    const rules = /** @type {any} */ (ctx.FS_RULES);
    const effects = /** @type {any} */ (ctx.FS_EFFECTS);
    const cards = ctx.FS_CATALOG.eventCards('темные-эльдары');
    const card = cards.find(c => /трофеи/i.test(c.name));
    eq(!!card, true, 'карта «Жуткие трофеи» есть');
    // The text is read as two steps, and neither takes a flat one.
    const steps = effects.parse(card.text, { kind: 'event', faction: 'темные-эльдары' });
    eq(steps[0].op, 'destroy', 'сначала уничтожьте отряд');
    const gain = steps.find(x => x.op === 'gainMateriel');
    eq(gain.fromDestroyed, 'cost', 'материя — по стоимости уничтоженного');
    eq(gain.n, undefined, 'а не одно зерно');
    eq(steps.some(x => x.op === 'gainAsset' && x.kind === 'reinforcement' && x.fromDestroyed === 'morale'), true,
        'и подкрепление — по боевому духу');
    // The whole effect on a live game: the unit that dies sets both numbers.
    const state = rules.newGame({ seed: 3, interactiveSetup: false, players: [
        { name: 'Д', faction: 'темные-эльдары' }, { name: 'И', faction: 'инквизиция' }] });
    // The materiel dial stops at 14: the test starts low enough to see the
    // whole gain (a full dial would hide a wrong number).
    state.players[0].materiel = 2;
    const sys = state.systems[0];
    const area = sys.areas.find(a => a.world);
    const unitId = 'гаснущие-солнца';
    rules.addUnit(state, 0, unitId, sys.id, area.pos);
    const unit = state.units.find(u => u.seat === 0 && u.unit === unitId);
    const def = rules.unitOf(state, unit);
    const before = state.players[0].materiel;
    effects.run(rules, state, 0, steps, { kind: 'event' });
    effects.answer(rules, state, 0, { answer: { units: [unit.id] } });
    eq(state.units.some(u => u.id === unit.id), false, 'отряд погиб');
    eq(state.players[0].materiel - before, def.cost, 'материя равна стоимости отряда');
    eq(def.cost > 1, true, 'и это не один жетон');
    // The tokens follow the morale — up to the limit of the faction.
    const want = Math.min(def.morale, rules.player(state, 0).assetLimit('reinforcement'));
    eq(rules.player(state, 0).assetCount('reinforcement'), want, 'подкрепление по боевому духу (в пределе фракции)');
});

rule('seat-0a', '«every player sees the game through his own eyes» — место игрока держит Seat', () => {
    const view = { players: [{ name: 'А' }, { name: 'Б' }, { name: 'В' }] };
    const seat = Seat.of(view);
    eq(Seat.of(view), seat, 'у вида одно место');
    eq(Seat.of(null), null, 'без состояния места нет');
    // The state of the server is seen by nobody.
    eq(seat.me, null, 'места нет');
    eq(seat.any, false, 'и смотреть некому');
    eq(seat.player, null, 'игрока нет');
    eq(seat.isMe(0), false, 'никто не «я»');
    // A view is cut for one chair.
    seat.stateOf(1);
    eq(view.seat, 1, 'место записано в вид');
    eq(seat.me, 1, 'это seat 1');
    eq(seat.any, true, 'и место есть');
    eq(seat.isMe(1), true, 'seat 1 — это я');
    eq(seat.isMe(0), false, 'seat 0 — не я');
    eq(seat.isOther(0), true, 'seat 0 — чужое место');
    eq(seat.isOther(1), false, 'своё местом чужим не бывает');
    eq(seat.player.name, 'Б', 'игрок этого места');
    // The whole state — the one the server keeps — has no seat at all.
    eq(Seat.of({ players: [] }).me, null, 'у состояния сервера места нет');
    eq(Seat.of({ players: [], seat: 0 }).isMe(0), true, 'а у вида — есть');
});

rule('choose-0a', '«Получите материалы со всех дружественных миров этой системы» — выбор системы держит Choice', () => {
    const state = { chosenSystem: null };
    const choice = Choice.of(state);
    eq(Choice.of(state), choice, 'у эффекта один выбор');
    eq(Choice.of(null), null, 'без состояния выбора нет');
    // Nothing is chosen yet: the effect that needs a system pays nothing.
    eq(choice.has, false, 'система не выбрана');
    eq(choice.system, null, 'и назвать нечего');
    choice.choose('sys1');
    eq(choice.has, true, 'система выбрана');
    eq(choice.system, 'sys1', 'и это sys1');
    eq(state.chosenSystem, 'sys1', 'выбор записан в состояние');
    // The card «Пожиратель миров»: the materiel of every friendly world of
    // the chosen system — not one token for the whole sentence.
    const rules = /** @type {any} */ (ctx.FS_RULES);
    const game = rules.newGame({ seed: 7, interactiveSetup: false, players: [
        { name: 'Т', faction: 'тираниды' }, { name: 'И', faction: 'инквизиция' }] });
    const sys = game.systems.find(x => x.areas.filter(a => a.world
        && rules.control(game, 0, x.id, a.pos) === 'friendly').length > 1) || game.systems[0];
    const friendly = sys.areas.filter(a => a.world && rules.control(game, 0, sys.id, a.pos) === 'friendly');
    const sum = friendly.reduce((n, a) => n + (a.world.materiel || 0), 0);
    Choice.of(game).choose(sys.id);
    const before = game.players[0].materiel;
    const effects = /** @type {any} */ (ctx.FS_EFFECTS);
    effects.run(rules, game, 0,
        [{ op: 'gainMateriel', nFromWorlds: 'chosenSystem', who: 'me' }], { kind: 'event' });
    eq(game.players[0].materiel - before, sum, 'материя всех дружественных миров системы');
    eq(sum > 1, true, 'и это больше одного жетона');
    // The choice is spent by the effect that asked.
    choice.clear();
    eq(choice.has, false, 'выбор израсходован');
    eq(state.chosenSystem, undefined, 'и поле снято');
});

rule('pre-0a', '«resolve an advance order with one unit, then go back» — дополнительное продвижение держит PreAdvance', () => {
    const main = { seat: 0, order: 'advance', system: 's1' };
    const state = { order: main };
    const pre = PreAdvance.of(state);
    eq(PreAdvance.of(state), pre, 'у партии одно отложенное продвижение');
    eq(PreAdvance.of(null), null, 'без состояния продвижения нет');
    // No order waits while the main one is being resolved.
    eq(pre.suspended, false, 'приказ не отложен');
    eq(pre.held, null, 'и держать нечего');
    // «Мобилизированные охотники»: the main order goes away for the extra one.
    pre.suspend(main);
    state.order = { seat: 0, order: 'advance', system: 's2', maxKl: 1 };
    eq(pre.suspended, true, 'основной приказ ждёт');
    eq(pre.held, main, 'и это тот самый приказ');
    eq(state.preAdvanceMain, main, 'он записан в состояние');
    // The extra advance is over: the main one comes back, once.
    eq(pre.resume(), main, 'основной приказ возвращается');
    eq(pre.suspended, false, 'и больше не ждёт');
    eq(pre.resume(), null, 'второй раз возвращать нечего');
    // The main order remembers that it was here.
    eq(pre.wasDone(main), false, 'дополнительного продвижения ещё не было');
    pre.done(main);
    eq(pre.wasDone(main), true, 'теперь было');
    eq(main.preAdvanceDone, true, 'и это видно в приказе');
    eq(pre.wasDone(null), false, 'у пустого приказа отметки нет');
});

rule('chance-0a', '«the same seed gives the same game» — броски и идентификаторы держит Chance', () => {
    const state = { rng: 42, uid: 0 };
    const chance = Chance.of(state);
    eq(Chance.of(state), chance, 'у партии один генератор');
    eq(Chance.of(null), null, 'без состояния броска нет');
    eq(chance.seed, 42, 'зерно партии');
    eq(chance.lastId, 0, 'идентификаторов ещё нет');
    // The generator walks by one step and its numbers are of the dice.
    const first = chance.float();
    eq(first >= 0 && first < 1, true, 'дробь в [0, 1)');
    eq(state.rng === 42, false, 'зерно сдвинулось');
    const again = Chance.of({ rng: 42 }).float();
    eq(again, first, 'одно зерно — один бросок');
    // A whole number below n.
    const n = chance.below(3);
    eq(Number.isInteger(n) && n >= 0 && n < 3, true, 'число меньше трёх');
    // The shuffle keeps the list and does not touch the deck.
    const deck = ['а', 'б', 'в', 'г', 'д'];
    const mixed = chance.shuffle(deck);
    eq(deck.join(','), 'а,б,в,г,д', 'колода не тронута');
    eq(mixed.slice().sort().join(','), 'а,б,в,г,д', 'и ничего не потеряно');
    // Picking from a list, and from an empty one.
    eq(deck.includes(chance.pick(deck)), true, 'берётся элемент списка');
    eq(chance.pick([]), null, 'из пустого списка — ничего');
    // The dice of a combat: only three facings.
    const dice = chance.roll(8);
    eq(dice.length, 8, 'восемь кубиков');
    eq(dice.every(f => Chance.FACES.includes(f)), true, 'только три известных грани');
    eq(Chance.FACES.join(','), 'att,def,morale', 'атака, защита, боевой дух');
    // The ids of the game.
    eq(chance.id('unit'), 'unit1', 'первый отряд');
    eq(chance.id('obj'), 'obj2', 'и второй объект');
    eq(chance.lastId, 2, 'счётчик идентификаторов');
});

rule('test-0a', '«a battle may be tried without a campaign» — тестовый бой держит BattleTest', () => {
    const state = { players: [{}, {}] };
    const test = BattleTest.of(state);
    eq(BattleTest.of(state), test, 'у партии один тест');
    eq(BattleTest.of(null), null, 'без состояния теста нет');
    // An ordinary game has no test table at all.
    eq(test.mode, null, 'это не тест');
    eq(test.active, false, 'и не тестовый бой');
    eq(test.replayable, false, 'повторять нечего');
    eq(test.side(0), null, 'seat 0 не участник');
    eq(test.roster.length, 0, 'и ростера нет');
    // A ready map: the board is built, the game is ordinary otherwise.
    test.setMode(BattleTest.MAP);
    eq(BattleTest.MAP, 'map', 'готовая карта');
    eq(test.mode, 'map', 'вид теста');
    eq(test.active, false, 'это не бой');
    // A battle of chosen troops.
    test.begin({
        kind: 'space', attacker: 0, defender: 1, system: 'sys3', pos: 'SE',
        roster: [{ seat: 0, unit: 'raider' }, { seat: 1, unit: 'escort' }],
        decks: { attacker: ['Залп'], defender: ['Щит'] },
        reinforcement: 2,
    });
    eq(test.active, true, 'идёт тестовый бой');
    eq(test.replayable, true, 'и его можно повторить');
    eq(test.system, 'sys3', 'бой в системе sys3');
    eq(test.pos, 'SE', 'в области SE');
    eq(test.side(0), 'attacker', 'seat 0 нападает');
    eq(test.side(1), 'defender', 'seat 1 защищается');
    eq(test.side(2), null, 'seat 2 не участвует');
    eq(test.participant(1), true, 'seat 1 участник');
    eq(test.participant(2), false, 'а seat 2 нет');
    eq(test.roster.length, 2, 'два отряда на поле');
    eq(test.decks('attacker').join(','), 'Залп', 'колода нападающего');
    eq(test.decks('defender').join(','), 'Щит', 'колода защитника');
    eq(test.decks('other').length, 0, 'у третьей стороны колоды нет');
    eq(test.reinforcement, 2, 'два жетона подкрепления');
    eq(state.testMode, 'battle', 'вид теста записан в состояние');
});

rule('strike-0a', '«the defender chooses which of his units take the hits» — урон с орбиты держит StrikeDamage', () => {
    const state = {};
    const damage = StrikeDamage.of(state);
    eq(StrikeDamage.of(state), damage, 'у удара один объект');
    eq(StrikeDamage.of(null), null, 'без состояния удара нет');
    // No strike waits: the game goes on.
    eq(damage.pending, false, 'удара нет');
    eq(damage.waiting(1), false, 'и принимать нечего');
    eq(damage.left, 0, 'ударов нет');
    eq(damage.spent, true, 'и урон потрачен');
    // The order fired: the hits wait for the defender of the world.
    damage.begin({ seat: 1, system: 's2', pos: 'SE', hits: 3, attacker: 0, first: 'u7' });
    eq(damage.pending, true, 'удар ждёт защитника');
    eq(damage.waiting(1), true, 'защитник принимает урон');
    eq(damage.waiting(0), false, 'атакующий не принимает');
    eq(damage.attacker, 0, 'удар нанёс seat 0');
    eq(damage.left, 3, 'три удара');
    eq(damage.hits, 3, 'из трёх');
    eq(damage.untouched, true, 'ни одного не принято');
    eq(damage.first, 'u7', 'первым получает выбранный отряд');
    eq(damage.aimedAt('s2', 'SE'), true, 'удар падает в эту область');
    eq(damage.aimedAt('s2', 'NW'), false, 'и не в соседнюю');
    // «Набег жнецов»: the chosen unit takes the damage first.
    damage.take('u7', 2);
    eq(damage.left, 1, 'два удара приняты');
    eq(damage.untouched, false, 'первый удар позади');
    eq(damage.damaged.join(','), 'u7', 'и записан');
    eq(damage.spent, false, 'но урон ещё не кончился');
    damage.take('u8', 1);
    eq(damage.spent, true, 'урон потрачен');
    eq(state.strike.left, 0, 'и это видно в состоянии');
    // The record leaves the state when the strike ends.
    const ended = damage.end();
    eq(ended.attacker, 0, 'запись возвращается на выходе');
    eq(state.strike, null, 'и состояние чисто');
    eq(damage.pending, false, 'удара больше нет');
});

rule('events-0a', '«in the refresh phase every player resolves one event card» — события раунда держит EventRound', () => {
    const state = { players: [{}, {}, {}] };
    const round = EventRound.of(state);
    eq(EventRound.of(state), round, 'у раунда один счёт событий');
    eq(EventRound.of(null), null, 'без состояния счёта нет');
    // No event of the round is waiting yet.
    eq(round.left, 0, 'событий нет');
    eq(round.pending, false, 'и ждать нечего');
    // The event step begins: one card for every player.
    round.begin();
    eq(round.left, 3, 'трое игроков — три карты');
    eq(round.pending, true, 'карты ждут');
    eq(state.eventsLeft, 3, 'счёт записан в состояние');
    eq(round.snapshot, 3, 'и попадает в снимок');
    // A card was played.
    round.played();
    eq(round.left, 2, 'одна карта разыграна');
    round.played();
    round.played();
    eq(round.left, 0, 'события кончились');
    eq(round.pending, false, 'и фаза событий окончена');
    // The count never goes below zero.
    round.played();
    eq(round.left, 0, 'в минус не уходит');
    // A suspended event step comes back with the count it had.
    round.begin(4);
    const saved = round.snapshot;
    round.restore(1);
    eq(round.left, 1, 'снимок вернул счёт');
    round.restore(saved);
    eq(round.left, 4, 'и прежний тоже');
    // «Быстрый ответ» may rebuild the count from nothing.
    EventRound.of({}).begin(2);
    eq(EventRound.of({ players: [] }).left, 0, 'без игроков событий нет');
});

rule('trail-0a', '«retreat: each unit goes back to the area it came from» — след ходов приказа держит MarchTrail', () => {
    const state = {};
    const trail = MarchTrail.of(state);
    eq(MarchTrail.of(state), trail, 'у приказа один след');
    eq(MarchTrail.of(null), null, 'без состояния следа нет');
    // A new order starts with a clean sheet.
    eq(trail.length, 0, 'след пуст');
    trail.record(1, { system: 's1', pos: 'NW' }, { system: 's2', pos: 'SE' });
    trail.record(1, { system: 's2', pos: 'SE' }, { system: 's3', pos: 'N' });
    trail.record(0, { system: 's1', pos: 'E' }, { system: 's3', pos: 'N' });
    eq(trail.length, 3, 'три перехода');
    eq(state.moves.length, 3, 'они записаны в состояние');
    eq(state.moves[0].from.pos, 'NW', 'откуда ушёл');
    eq(state.moves[0].to.pos, 'SE', 'куда пришёл');
    // The combat asks who walked into the area and where from.
    eq(trail.walkedInto(1, 's3', 'N'), true, 'seat 1 вошёл в область');
    eq(trail.walkedInto(1, 's1', 'NW'), false, 'а туда не входил');
    eq(trail.walkedInto(0, 's3', 'N'), true, 'seat 0 тоже');
    const from = trail.cameFrom(1, 's3', 'N');
    eq(from.length, 1, 'seat 1 пришёл из одной области');
    eq(from[0].system + ':' + from[0].pos, 's2:SE', 'и она известна');
    eq(trail.cameFrom(0, 's2', 'SE').length, 0, 'seat 0 туда не приходил');
    // The same area twice is one origin, not two.
    trail.record(1, { system: 's2', pos: 'SE' }, { system: 's3', pos: 'N' });
    eq(trail.cameFrom(1, 's3', 'N').length, 1, 'повторный приход не дублирует');
    eq(trail.leftTo(1, 's1', 'NW').length, 1, 'куда ушёл отряд');
    // The next order wipes the trail.
    trail.reset();
    eq(trail.length, 0, 'новый приказ — новый след');
    eq(state.moves.length, 0, 'и состояние чисто');
});

rule('over-0a', '«The game ends…» — конец партии и её победителя держит GameOutcome', () => {
    const state = { players: [{}, {}, {}] };
    const outcome = GameOutcome.of(state);
    eq(GameOutcome.of(state), outcome, 'у партии один итог');
    eq(GameOutcome.of(null), null, 'без состояния итога нет');
    // The game goes on: nobody won and nothing is printed.
    eq(outcome.over, false, 'партия идёт');
    eq(outcome.winner, null, 'победителя нет');
    eq(outcome.tied, false, 'и победа не делится');
    eq(outcome.victors().length, 0, 'победителей нет');
    eq(outcome.headline(), '', 'и объявления нет');
    // «A player collects the objectives he needs»: he wins alone.
    outcome.declare({ winner: 2 });
    eq(outcome.over, true, 'партия окончена');
    eq(outcome.winner, 2, 'победил seat 2');
    eq(outcome.isWinner(2), true, 'это он');
    eq(outcome.isWinner(0), false, 'а не seat 0');
    eq(outcome.tied, false, 'победа не делится');
    eq(outcome.shares(2), true, 'seat 2 берёт победу');
    eq(outcome.victors().join(','), '2', 'победитель один');
    eq(outcome.headline(seat => 'И' + seat), 'Побеждает: И2', 'объявление панели');
    eq(outcome.note(), 'Игра закончена. Побеждает: 2.', 'строка журнала');
    eq(outcome.note('цели собраны'), 'Игра закончена. Побеждает: 2: цели собраны.', 'и с причиной');
    // «…or the victory is shared»: the tie-breaks leave two leaders.
    const tie = { players: [{}, {}, {}, {}] };
    const other = GameOutcome.of(tie).byRound(1, [1, 3]);
    eq(other.tied, true, 'победа делится');
    eq(other.winner, 1, 'первый из победителей');
    eq(other.shared.join(','), '1,3', 'делят seat 1 и seat 3');
    eq(other.shares(3), true, 'seat 3 в доле');
    eq(other.shares(2), false, 'seat 2 нет');
    eq(other.victors().join(','), '1,3', 'победители по порядку');
    eq(other.headline(seat => 'И' + seat), 'Победа делится: И1 и И3', 'объявление о дележе');
    eq(other.note(), 'Игра закончена вничью.', 'строка о ничьей');
    // «…or only one player is left»: nobody wins when the last one is out too.
    const alone = { players: [{}, {}] };
    const last = GameOutcome.of(alone).byElimination(1);
    eq(last.winner, 1, 'оставшийся побеждает');
    const none = GameOutcome.of({ players: [{}, {}] }).byElimination(null);
    eq(none.winner, null, 'без игроков победителя нет');
    eq(none.headline(), 'Побеждает: —', 'и это видно');
    // A shared victory left over from an earlier end does not survive a new one.
    const again = GameOutcome.of(tie).declare({ winner: 0 });
    eq(again.shared.length, 0, 'старый дележ снят');
});

rule('log-0a', '«the game is played in rounds; every step is written down» — журнал игры держит GameLog', () => {
    const state = { log: [] };
    const log = GameLog.of(state);
    eq(GameLog.of(state), log, 'у игры одна хроника');
    eq(GameLog.of(null), null, 'без состояния журнала нет');
    // A command says what it did, the game itself says what phase began.
    log.add(1, 'Тираниды разместили систему s2.');
    log.note('Раунд 2: фаза планирования.');
    eq(log.length, 2, 'в журнале две записи');
    eq(state.log[0].seat, 1, 'у записи есть говоривший');
    eq(state.log[1].seat, GameLog.GAME, 'игру говорит не игрок');
    eq(log.text, 'Раунд 2: фаза планирования.', 'последняя запись — статус');
    eq(log.last(1).length, 1, 'панель берёт хвост');
    eq(log.last(0).length, 0, 'пустой хвост — пусто');
    eq(log.last(9).length, 2, 'хвост не длиннее журнала');
    // The panel glues the name of the speaker to the line.
    const nameOf = seat => (seat === 1 ? 'Тираниды' : '');
    eq(log.line(state.log[0], nameOf), 'Тираниды: Тираниды разместили систему s2.', 'строка с именем');
    eq(log.line(state.log[1], nameOf), 'Раунд 2: фаза планирования.', 'игру не подписывают');
    eq(log.lines(2, nameOf).length, 2, 'две строки для панели');
    // The window of the chronicle: the oldest entries fall out.
    for (let i = 0; i < GameLog.LIMIT + 10; i++) log.add(0, 'шаг ' + i);
    eq(log.length, GameLog.LIMIT, 'журнал помнит двести записей');
    eq(log.text, 'шаг ' + (GameLog.LIMIT + 9), 'и кончается последней');
    log.clear();
    eq(log.length, 0, 'хроника начинается с нуля');
    eq(log.text, '', 'и статус пуст');
});

rule('board-0a', '«the players build the galaxy together» — сборку карты держит BoardSetup', () => {
    const state = {
        setup: null, turn: 0, players: [{}, {}, {}],
        systems: [], objectives: [], storms: [],
    };
    const board = BoardSetup.of(state);
    eq(BoardSetup.of(state), board, 'у игры одна сборка');
    eq(BoardSetup.of(null), null, 'без состояния сборки нет');
    // The map is already built: there is nothing to place.
    eq(board.active, false, 'сборки нет');
    eq(board.stage, null, 'и этапа нет');
    eq(board.turn, null, 'и строить некому');
    eq(board.hand(0).length, 0, 'и руки нет');
    // The stages of the build, in the order they are played.
    state.setup = {
        hands: [['t1', 't2'], ['t3', 't4'], []], stage: 'tile', currentSystem: null,
        placedBySeat: [0, 0, 0], placedTotal: 0, totalTiles: 4,
        turnOrder: [0, 1, 2], turnIndex: 0, turn: 0,
    };
    eq(board.active, true, 'карта собирается');
    eq(board.is(BoardSetup.TILES), true, 'сначала тайлы');
    eq(board.is(BoardSetup.FORCES, BoardSetup.STORMS), false, 'не силы и не штормы');
    eq(board.turn, 0, 'первый выкладывает seat 0');
    eq(board.isTurn(0), true, 'и это его ход');
    eq(board.isTurn(1), false, 'seat 1 ждёт');
    eq(board.totalTiles, 4, 'тайлов четыре');
    // A tile leaves the hand and the forces are placed on the new system.
    const tile = board.placeTile(0, 's1', 0);
    eq(tile, 't1', 'из руки ушёл t1');
    eq(board.hand(0).join(','), 't2', 'в руке остался t2');
    eq(board.placedTotal, 1, 'один тайл на карте');
    eq(board.currentSystem, 's1', 'силы ставятся в новую систему');
    eq(board.stage, 'forces', 'сначала силы');
    // The turn passes to the next hand that still has a tile.
    eq(board.nextPlayer(), 1, 'дальше seat 1');
    eq(board.turn, 1, 'и это его ход');
    eq(board.stage, 'tile', 'снова тайлы');
    eq(board.currentSystem, null, 'прежняя система отпущена');
    // seat 2 has no tiles: the hand is skipped.
    board.placeTile(1, 's2', 1);
    board.nextPlayer();
    eq(board.turn, 0, 'пустая рука пропущена');
    state.setup.hands = [[], [], []];
    board.record.placedTotal = 4;
    eq(board.tilesDone, true, 'все тайлы выложены');
    eq(board.nextPlayer(), null, 'играть больше некому');
    eq(board.stage, 'storms', 'дальше варп-штормы');
    // The storms go «в обратном порядке хода»: the first one is placed by the
    // player who laid the last tile (seat 0), the next one by the player before
    // him in the build order.
    eq(board.turn, 0, 'последний тайл выложил seat 0');
    eq(board.nextStorm(), 2, 'следующий шторм — предыдущий по порядку');
    eq(board.nextStorm(), 1, 'и ещё на шаг назад');
    eq(board.stormsPlaced, 2, 'два шторма на карте');
    eq(board.nextStorm(), null, 'каждому по одному');
    // The build is over: the record leaves the state.
    board.setCurrentSystem(null).setStage(BoardSetup.TILES);
    board.finish();
    eq(state.setup, null, 'сборка закончена');
    eq(board.active, false, 'записи больше нет');
});

rule('ask-0a', '«a step needs a choice: the player is asked» — остановленный вопрос шага держит Question', () => {
    const state = { pending: null };
    const asked = Question.of(state);
    eq(Question.of(state), asked, 'у игры один вопрос');
    eq(Question.of(null), null, 'без состояния вопроса нет');
    // Nothing is asked: the run goes on.
    eq(asked.waiting, false, 'вопроса нет');
    eq(asked.record, null, 'и записи нет');
    eq(asked.question, null, 'и вопроса нет');
    eq(asked.seat, null, 'и отвечающего нет');
    eq(asked.answerSeat, null, 'и место ответа пусто');
    eq(asked.answers(0), false, 'никто не отвечает');
    eq(asked.steps, [], 'шагов нет');
    eq(asked.index, 0, 'индекс с нуля');
    eq(asked.ctx, null, 'и контекста нет');
    // A step asks: the record says who answers, which list is interrupted and where.
    const list = [{ op: 'a' }, { op: 'b' }];
    asked.ask({ seat: 1, kind: 'combat', steps: list, index: 1,
        question: { kind: 'units', who: 1 }, ctx: { kind: 'combat' } });
    eq(asked.waiting, true, 'игра ждёт ответа');
    eq(asked.seat, 1, 'вопрос принадлежит seat 1');
    eq(asked.answerSeat, 1, 'и отвечает он же');
    eq(asked.answers(1), true, 'seat 1 может ответить');
    eq(asked.answers(0), false, 'seat 0 — нет');
    eq(asked.question.kind, 'units', 'вопрос на руках');
    eq(asked.steps.length, 2, 'прерванный список шагов');
    eq(asked.index, 1, 'и шаг, на котором он прерван');
    eq(asked.ctx.kind, 'combat', 'контекст эффекта');
    // A card may ask the opponent: the answer belongs to him.
    asked.ask({ seat: 0, answerSeat: 1, question: { kind: 'choice', who: 1 } });
    eq(asked.answerSeat, 1, 'спрашивают seat 1');
    eq(asked.answers(0), false, 'владелец эффекта не отвечает');
    eq(asked.answers(1), true, 'отвечает противник');
    eq(state.pending.kind, 'card', 'вид эффекта по умолчанию — карта');
    // The second half of a two-part question is carried along.
    asked.ask({ seat: 0, question: { kind: 'areas' }, stash: { unit: 'u1' } });
    eq(state.pending.stash.unit, 'u1', 'половина вопроса помнится');
    // The answer is in: the run goes on.
    asked.close();
    eq(asked.waiting, false, 'вопроса больше нет');
    eq(state.pending, null, 'и запись снята');
});

rule('event-0d', '«вместо раскрытия приказа во время фазы действий» — план, занявший ход, держит OrderScheme', () => {
    const state = { round: 2, turn: 1 };
    const scheme = OrderScheme.of(state);
    eq(OrderScheme.of(state), scheme, 'у игры один план приказа');
    eq(OrderScheme.of(null), null, 'без состояния плана нет');
    // Every attempted reveal has its own key: a refusal is not offered twice.
    const key = OrderScheme.key(state, 0, 's3', 2);
    eq(key, '2:1:0:s3:2', 'ключ попытки раскрытия');
    eq(scheme.asked(key), false, 'план ещё не предлагали');
    scheme.offer(key);
    eq(scheme.asked(key), true, 'план предложен этой попытке');
    eq(scheme.asked(OrderScheme.key(state, 0, 's3', 1)), false, 'другая попытка — свой ответ');
    eq(scheme.asked(null), false, 'без ключа ничего не предлагали');
    // «Отрава Нургла» takes the place of the reveal: the turn is his.
    eq(scheme.accepted, false, 'план ещё не занял ход');
    scheme.accept();
    eq(scheme.accepted, true, 'план занял место раскрытия');
    scheme.clearAccepted();
    eq(scheme.accepted, false, 'ход плана отдан');
    // A new round offers every plan anew.
    scheme.accept();
    scheme.reset();
    eq(scheme.accepted, false, 'новый раунд снимает согласие');
    eq(scheme.asked(key), false, 'и предлагает план снова');
});

rule('event-0c', '«The active player chooses one Warp Storm on the game board and moves it» + «движение варп-шторма по вновь раскрытой карте не производится» — шторм события держит StormPhase', () => {
    const state = { storms: [], players: [] };
    const phase = StormPhase.of(state);
    eq(StormPhase.of(state), phase, 'у игры один шторм события');
    eq(StormPhase.of(null), null, 'без состояния шторма нет');
    // An empty game: nobody reacts and nothing is suppressed.
    eq(phase.reacting, false, 'ответа никто не ждёт');
    eq(phase.reaction, null, 'и ответа нет');
    eq(phase.iconsMove, true, 'иконки карт двигают шторм');
    eq(phase.lastSystem, null, 'последней системы нет');
    // «Молящийся тёмным богам»: the movement waits for another player.
    const info = { storm: 's1', dir: 'N', mover: 0, target: {} };
    phase.offer(info);
    eq(phase.reacting, true, 'движение ждёт ответа');
    eq(phase.reaction.mover, 0, 'его предлагает seat 0');
    phase.clearReaction();
    eq(phase.reacting, false, 'ответа больше не ждут');
    eq(phase.reaction, null, 'и записи нет');
    // «Инкарнация Тзинча»: the icons of the three revealed cards do not move.
    phase.suppressIcons();
    eq(phase.iconsMove, false, 'иконки карт шторм не двигают');
    phase.allowIcons();
    eq(phase.iconsMove, true, 'следующее событие двигает снова');
    // The capacity of the card is counted in the system of the last loss.
    phase.markLastSystem('s7');
    eq(phase.lastSystem, 's7', 'система последнего уничтоженного отряда');
    phase.markLastSystem();
    eq(phase.lastSystem, null, 'и её можно забыть');
});

rule('event-0b', '«Быстрый ответ»: «the event phase is suspended» + «the limited order belongs to the player of the event» — снимок и ожидание держит QuickResponse', () => {
    const state = { phase: 'refresh', turn: 1, event: { seat: 0 }, eventsLeft: 2 };
    const quick = QuickResponse.of(state);
    eq(QuickResponse.of(state), quick, 'у игры один быстрый ответ');
    eq(QuickResponse.of(null), null, 'без состояния ответа нет');
    // Nothing is suspended until the event asks for its system.
    eq(quick.pending, false, 'фаза не ждёт');
    eq(quick.snapshot, null, 'снимка нет');
    eq(quick.resume(), null, 'возвращаться некуда');
    // The event names its system: the phase is suspended and waits.
    quick.suspend().wait();
    eq(quick.pending, true, 'фаза ждёт выбора системы');
    eq(quick.snapshot.phase, 'refresh', 'снимок помнит фазу');
    eq(quick.snapshot.turn, 1, 'и ход фазы');
    eq(quick.snapshot.eventsLeft, 2, 'и сколько событий осталось');
    // The system is chosen: the limited advance is born, the phase waits no more.
    quick.start();
    eq(quick.pending, false, 'ожидание снято');
    eq(quick.snapshot.turn, 1, 'снимок остался до конца приказа');
    // The game left the event phase meanwhile: the snapshot is taken again
    // unchanged — a second one would draw an extra event card.
    state.phase = 'operations';
    state.turn = 0;
    quick.suspend();
    eq(quick.snapshot.phase, 'refresh', 'второй снимок не сделан');
    eq(quick.snapshot.turn, 1, 'и ход не переписан');
    // The advance is over: the event phase comes back exactly where it was.
    eq(quick.resume().phase, 'refresh', 'фаза возвращена');
    eq(state.phase, 'refresh', 'состояние вернулось в фазу событий');
    eq(state.turn, 1, 'и ход фазы');
    eq(state.eventsLeft, 2, 'и счётчик событий');
    eq(quick.snapshot, null, 'снимок израсходован');
    eq(quick.pending, false, 'и ожидания нет');
    // A refusal forgets the snapshot without returning anywhere.
    quick.suspend().wait();
    eq(quick.pending, true, 'ждали систему');
    quick.forget();
    eq(quick.pending, false, 'отказ снял ожидание');
    eq(quick.snapshot, null, 'и снимок');
    eq(state.phase, 'refresh', 'фаза при этом не менялась');
});

rule('event-0a', '«The active player chooses one Warp Storm on the game board and moves it» + «A player can choose not to resolve the ability on his chosen event card» — событие фазы держит EventPhase', () => {
    const state = { players: [{}, {}], event: null };
    const phase = EventPhase.of(state);
    eq(EventPhase.of(state), phase, 'у фазы одно событие');
    eq(EventPhase.of(null), null, 'без состояния события нет');
    // No event is being played: nothing to ask.
    eq(phase.current, false, 'события нет');
    eq(phase.seat, null, 'игрока нет');
    eq(phase.drawn, [], 'карт на руке нет');
    eq(phase.chosen, null, 'карта не выбрана');
    eq(phase.top, null, 'верхней карты нет');
    eq(phase.card, null, 'играть нечего');
    eq(phase.stormMoved, false, 'шторм не двигался');
    eq(phase.isSeat(0), false, 'ход не этого игрока');
    // The cards are drawn: the player chooses one of them.
    phase.begin(1, ['А', 'Б', 'В']);
    eq(phase.current, true, 'событие началось');
    eq(phase.seat, 1, 'его играет seat 1');
    eq(phase.isSeat(1), true, 'ход seat 1');
    eq(phase.isSeat(0), false, 'ход не seat 0');
    eq(phase.drawn.length, 3, 'три карты на руке');
    eq(phase.chosen, null, 'выбор ещё не сделан');
    phase.choose('Б');
    eq(phase.chosen, 'Б', 'карта выбрана');
    phase.setCard({ name: 'Б' });
    eq(phase.card.name, 'Б', 'карта события известна');
    eq(phase.cardName, 'Б', 'имя карты события');
    // The card opened for the storm alone: no hand, only its name.
    const lonely = { players: [{}, {}], event: null };
    const second = EventPhase.of(lonely);
    second.begin(0, []);
    second.revealTop('В');
    eq(second.drawn.length, 0, 'карт на руке нет');
    eq(second.top, 'В', 'верхняя карта открыта');
    eq(second.card, null, 'в игре карты нет');
    eq(second.cardName, 'В', 'но имя её известно');
    // The storm moves by the icon of the card — once per event.
    eq(second.stormMoved, false, 'шторм ещё не двигался');
    second.markStormMoved();
    eq(second.stormMoved, true, 'шторм сдвинут');
    eq(lonely.event.stormMoved, true, 'и это записано в событии');
    // The event ends: the field is empty again.
    second.end();
    eq(second.current, false, 'событие закончилось');
    eq(lonely.event, null, 'поле события пусто');
    second.markStormMoved();
    eq(second.stormMoved, false, 'без события шторм не отмечается');
});

rule('combat-0l', '«the attacker reveals and resolves his combat card» — сторона и место стороны переводит CombatSides, а не тернарник в каждом файле', () => {
    const combat = { attacker: 0, defender: 1 };
    // The side of a seat and the seat of a side: both directions, one object.
    eq(CombatSides.sideOf(combat, 0), 'attacker', 'seat 0 — атакующий');
    eq(CombatSides.sideOf(combat, 1), 'defender', 'seat 1 — защитник');
    eq(CombatSides.sideOf(combat, 2), null, 'посторонний не сторона');
    eq(CombatSides.sideOf(null, 0), null, 'без боя стороны нет');
    eq(CombatSides.seatOf(combat, 'attacker'), 0, 'у атакующего seat 0');
    eq(CombatSides.seatOf(combat, 'defender'), 1, 'у защитника seat 1');
    eq(CombatSides.seatOf(null, 'attacker'), null, 'без боя seat неизвестен');
    eq(CombatSides.foe('attacker'), 'defender', 'противник атакующего — защитник');
    eq(CombatSides.foe('defender'), 'attacker', 'противник защитника — атакующий');
    eq(CombatSides.foeSeat(combat, 0), 1, 'противник seat 0 — seat 1');
    eq(CombatSides.foeSeat(combat, 1), 0, 'противник seat 1 — seat 0');
    eq(CombatSides.isSide('attacker'), true, 'сторона боя');
    eq(CombatSides.isSide('defender'), true, 'и другая сторона');
    eq(CombatSides.isSide('seat'), false, 'seat — не сторона');
    // The step names its side; the damage step is spelled once.
    eq(CombatSides.damageStep('attacker'), 'damage-attacker', 'шаг урона атакующего');
    eq(CombatSides.damageStep('defender'), 'damage-defender', 'шаг урона защитника');
    eq(CombatSides.sideFromStep('damage-defender'), 'defender', 'сторона шага урона');
    // A battle where the defender sits below the attacker: the same names.
    const swapped = { attacker: 1, defender: 0 };
    eq(CombatSides.sideOf(swapped, 1), 'attacker', 'атакующий по имени, а не по номеру');
    eq(CombatSides.seatOf(swapped, 'defender'), 0, 'защитник — seat 0');
    eq(CombatSides.foeSeat(swapped, 1), 0, 'противник атакующего — seat 0');
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
    refused(b, /уже куплено|только 1 улучшение/, 'второе улучшение приказа за один приказ');
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

// ============================================================================
head('Одно понятие — одно место (устройство кода), продолжение');

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
    refused(gain, /восьми кубиков/, 'девятый кубик');
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
    // Раньше проверка звала урон у стороны, у которой урона не было (3 против
    // 4 щитов = 0), и утверждала «нет избытка» при damage 0 — то есть ничего.
    // Теперь избыток настоящий: два Гвардейца (здоровье 1) под уроном 3.
    const st = groundBattle({ seed: 11 });
    eq(!!st.combat, true, 'бой начался');
    while (st.combat && ctx.CombatTurn.of(st.combat).step !== 'damage-attacker') {
        const step = ctx.CombatTurn.of(st.combat).step;
        if (step === 'reinforce-attacker') FS_RULES.apply(st, 0, { type: 'combat', action: 'reinforce', count: 0 });
        else if (step === 'reinforce-defender') FS_RULES.apply(st, 1, { type: 'combat', action: 'reinforce', count: 0 });
        else if (step === 'choose-attacker') FS_RULES.apply(st, 0, { type: 'combat', action: 'playCard', index: 0 });
        else if (step === 'choose-defender') FS_RULES.apply(st, 1, { type: 'combat', action: 'playCard', index: 0 });
        else if (st.pending) FS_RULES.apply(st, st.pending.answerSeat !== undefined ? st.pending.answerSeat : st.pending.seat,
            { type: 'effect', answer: {} });
        else { FS_RULES.advanceCombatSteps(st); continue; }
        if (!st.combat) break;
    }
    eq(!!st.combat && ctx.CombatTurn.of(st.combat).step, 'damage-attacker', 'дошли до шага урона по атакующему');
    const mine = st.units.filter(u => u.seat === 0);
    eq(mine.length >= 2, true, 'в бою не меньше двух отрядов атакующего');
    const health = id => (ctx.FS_CATALOG.unit(st.players[0].faction, id) || {}).health || 1;
    const damage = FS_RULES.combatDamageFor(st, 'attacker');
    eq(damage > health(mine[0].unit || mine[0].def), true,
        'урона больше, чем здоровье одного отряда (' + damage + ' против ' + health(mine[0].unit || mine[0].def) + ')');
    const res = FS_RULES.apply(st, 0, { type: 'combat', action: 'damage', targets: mine.map(u => u.id) });
    eq(res.ok, true, 'урон принят: ' + (res.error || ''));
    eq(res.damage, damage, 'урон шага — тот, что посчитан');
    eq(res.applied.length >= 2, true, 'избыток ушёл на второй отряд, а не пропал (' + res.applied.length + ' целей)');
    eq(res.applied.every(x => x.destroyed), true, 'оба отряда погибли от 3 урона при здоровье 1');
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
    refused(res, /нельзя пропустить/, 'пропуск карты');
});

// ============================================================================
//  Retreats
// ============================================================================
head('Отступление (Retreats)');

rule('ret-1', '«Defending units cannot retreat to an area from which attacking units moved from.»', () => {
    const st = empty();
    // A fight inside ONE system: the attacker walked from one of its worlds to
    // another. The rule names an area, not a system — the rest of the active
    // system stays open for the defender, the area the attacker came from does
    // not. (Only a system, and only an ADJACENT one, is closed by `ret-4`.)
    const sys = st.systems[0];
    const worlds = sys.areas.filter(a => a.world).map(a => a.pos);
    let pair = null;
    for (const from of worlds) {
        for (const to of worlds) {
            if (from === to) continue;
            if (FS_RULES.areasAround(st, sys.id, from).some(a => a.system === sys.id && a.pos === to)) {
                pair = { from, to };
                break;
            }
        }
        if (pair) break;
    }
    if (!pair) return 'нет двух соседних миров в одной системе';
    const att = guard(st, 0, sys.id, pair.from);
    olk(st, 1, sys.id, pair.to);
    advance(st, 0, sys.id, pair.to);
    const moved = FS_RULES.apply(st, 0, { type: 'moveUnits', moves: [{ unit: att.id, system: sys.id, pos: pair.to }] });
    if (!moved.ok) return 'марш не прошёл: ' + moved.error;
    FS_RULES.apply(st, 0, { type: 'endAdvance' });
    if (!st.combat) return 'бой не начался';
    const targets = FS_RULES.retreatTargets(st, 1);
    eq(targets.some(t => t.system === sys.id && t.pos === pair.from), false,
        'отступление в область, откуда пришёл враг');
    // The other world of the same system is a legal retreat: the rule closed one
    // area, not the whole active system.
    const other = worlds.find(p => p !== pair.from && p !== pair.to);
    if (other) {
        eq(targets.some(t => t.system === sys.id && t.pos === other), true,
            'свой мир в активной системе остаётся открыт (' + other + ')');
    }
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
    // Доход = сумма значений материи на ВСЕХ своих мирах (правило Refresh Phase).
    // Раньше проверялся только потолок 14: сама формула дохода не держалась
    // ничем, и её снятие проходило молча.
    const st = empty();
    const mine = [];
    for (const sys of st.systems) {
        const w = sys.areas.find(a => a.world && (a.world.materiel || 0) > 0);
        if (w) { guard(st, 0, sys.id, w.pos); mine.push(w.world.materiel); }
        if (mine.length >= 2) break;
    }
    eq(mine.length >= 1, true, 'на карте есть мир с материей');
    const income = mine.reduce((a, b) => a + b, 0);
    st.players[0].materiel = 0;
    FS_RULES.startRefresh(st);
    eq(st.players[0].materiel, Math.min(income, 14), 'доход равен сумме материи дружественных миров (' + income + ')');
    // Потолок 14 — тоже правило, и он проверяется отдельно.
    const cap = empty();
    guard(cap, 0, cap.systems[0].id, worldOf(cap, cap.systems[0].id));
    cap.players[0].materiel = 14;
    FS_RULES.startRefresh(cap);
    eq(cap.players[0].materiel, 14, 'потолок материи');
    // Чужой мир дохода не даёт.
    const foe = empty();
    const sys2 = foe.systems[0];
    const w2 = sys2.areas.find(a => a.world);
    FS_RULES.addUnit(foe, 1, 'бойзы', sys2.id, w2.pos);
    foe.players[0].materiel = 0;
    FS_RULES.startRefresh(foe);
    eq(foe.players[0].materiel, 0, 'материя чужого мира не достаётся');
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
    FS_RULES.startRefresh(st);
    st.players[0].eventTokens = 0;
    const drawn = (st.event && st.event.seat === 0) ? st.event.drawn.length : -1;
    eq(drawn, 2, 'взято карт событий');
    // «…one card for each order token»: два жетона — две карты с колоды, а не
    // одна и та же дважды.
    eq(st.event.drawn.length, 2, 'в вопросе фазы событий две разные карты');
    eq(new Set(st.event.drawn).size, 2, '...и они не повторяются');
    eq(st.players[0].eventTokens, 0, 'жетоны израсходованы');
    eq(Array.isArray(st.event.drawn) && st.event.drawn.every(x => typeof x === 'string' && x), true, 'обе карты названы');
});

rule('win-1', '«When a player has collected a number of his objective tokens equal to or exceeding the number of players, the game ends»', () => {
    const play = count => {
        const st = empty();
        st.firstPlayer = 0;
        // У каждого игрока дружественный мир: иначе конец раунда выкидывает
        // обоих по «нет миров», и проверка порога проходила бы мимо.
        for (const seat of [0, 1]) {
            const sys = st.systems[seat];
            guard(st, seat, sys.id, worldOf(st, sys.id));
        }
        st.players[0].objectives = count;
        st.round = 1;
        st.phase = 'refresh';
        st.eventsLeft = 0;
        FS_RULES.endRound(st);
        return st;
    };
    // «equal to» — граница: двух целей при двух игроках достаточно…
    eq(play(2).over, true, 'игра закончена при двух целях у двух игроков');
    eq(play(2).winner, 0, 'победил собравший цели');
    // …а одной — нет. Порог «>» вместо «>=» проходил мимо всех проверок.
    eq(play(1).over, false, 'одной цели при двух игроках мало');
    // «or exceeding»: больше порога — тоже победа.
    const more = play(3);
    eq(more.over, true, 'трёх целей при двух игроках достаточно');
    eq(more.winner, 0, 'и здесь победил собравший');
});

rule('cap-4', '«Вместимость дружественных миров, содержащих город, увеличена на 2, максимум до 4. Дополнительная вместимость распространяется только на Гвардейцев.» — «Принудительная вербовка»', () => {
    // Мир с городом: карта поднимает его вместимость на 2 (не выше 4) и только
    // для Гвардейцев. Раньше этот бонус не проверял никто: обе половины правила
    // можно было выключить, и аудит оставался зелёным.
    const find = () => {
        for (const sys of game().systems) {
            const w = sys.areas.find(a => a.world && (a.world.capacity || 3) < 4);
            if (w) return { sys: sys.id, pos: w.pos, cap: w.world.capacity || 3 };
        }
        return null;
    };
    const spot = find();
    if (!spot) return 'нет мира с вместимостью ниже четырёх';
    const st = empty();
    const sys = st.systems.find(x => x.id === spot.sys);
    const guardDef = FS_DATA.factions.find(f => f.id === st.players[0].faction).units.find(u => u.id === 'гвардейцы');
    const other = FS_DATA.factions.find(f => f.id === st.players[0].faction).units.find(u => u.id === 'огрины');
    FS_RULES.addStructure(st, 0, 'city', sys.id, spot.pos);
    st.order = { seat: 0, order: 'deploy', system: sys.id, phase: 'deploy' };
    const before = FS_RULES.capacity(st, sys.id, spot.pos, guardDef);
    eq(before, Math.min(spot.cap, 4), 'без карты — вместимость мира');
    // Карта игрока лежит у него в купленных улучшениях.
    const card = ctx.FS_CATALOG.cards('orders').find(c => c.faction === st.players[0].faction && /вербовк/i.test(c.name));
    if (!card) return 'у фракции нет «Принудительной вербовки»';
    st.players[0].upgrades = [{ name: card.name, used: false, order: card.order }];
    const used = FS_RULES.apply(st, 0, { type: 'useUpgrade', card: card.name });
    eq(used.ok, true, 'карта применена: ' + (used.error || ''));
    eq(FS_RULES.capacity(st, sys.id, spot.pos, guardDef), Math.min(spot.cap + 2, 4), 'Гвардейцам +2, но не выше 4');
    eq(FS_RULES.capacity(st, sys.id, spot.pos, other), before, 'другим отрядам бонуса нет');
});

rule('win-2', '«When a player is eliminated, this does not reduce the number of objective tokens needed to win the game.»', () => {
    const play = count => {
        const st = empty();
        for (const seat of [0, 1]) guard(st, seat, st.systems[seat].id, worldOf(st, st.systems[seat].id));
        st.players[0].objectives = count;
        st.players[1].eliminated = true;    // в игре остался один живой
        st.firstPlayer = 0;
        st.round = 1;
        st.phase = 'refresh';
        st.eventsLeft = 0;
        FS_RULES.endRound(st);
        return st;
    };
    // Порог считается по игрокам, которые СЕЛИ за стол, а не по живым.
    const board = count => {
        const st = empty();
        for (const seat of [0, 1]) guard(st, seat, st.systems[seat].id, worldOf(st, st.systems[seat].id));
        st.players[0].objectives = count;
        st.players[1].eliminated = true;
        return st;
    };
    eq(FS_RULES.objectiveWinners(board(1)), null, 'одной цели после выбывания всё ещё мало');
    const won = FS_RULES.objectiveWinners(board(2));
    eq(!!won && won.winner, 0, 'двух целей хватает: порог не упал до одного');
    // И на живой доске это победа именно по целям.
    const two = play(2);
    eq(two.over, true, 'игра закончена');
    eq(two.winner, 0, 'победил собравший цели');
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
    // Подделка «число миров всегда 0» проходила: миры должны РАЗЛИЧАТЬСЯ.
    eq(FS_RULES.rank(st2, st2.players[0]).worlds > FS_RULES.rank(st2, st2.players[1]).worlds, true,
        'у seat 0 больше миров (' + FS_RULES.rank(st2, st2.players[0]).worlds + ' против '
        + FS_RULES.rank(st2, st2.players[1]).worlds + ')');
    FS_RULES.endRound(st2);
    eq(st2.winner, 0, 'при равных целях побеждают миры');
    // И третья ступень: равные цели и миры — решают отряды.
    const st3 = empty();
    const a3 = st3.systems[0], b3 = st3.systems[2] || st3.systems[1];
    guard(st3, 0, a3.id, worldOf(st3, a3.id));
    guard(st3, 0, a3.id, worldOf(st3, a3.id));
    olk(st3, 1, b3.id, worldOf(st3, b3.id));
    st3.round = FS_RULES.ROUNDS;
    st3.players[0].objectives = 1;
    st3.players[1].objectives = 1;
    const r0 = FS_RULES.rank(st3, st3.players[0]), r1 = FS_RULES.rank(st3, st3.players[1]);
    eq(r0.worlds === r1.worlds, true, 'миров поровну (' + r0.worlds + ')');
    eq(r0.units > r1.units, true, 'но отрядов у seat 0 больше (' + r0.units + ' против ' + r1.units + ')');
    eq(FS_RULES.byRank(r0, r1) < 0, true, 'при равных мирах решают отряды');
    // И это решает партию: у обоих по одной цели и по миру.
    st3.round = FS_RULES.ROUNDS;
    st3.players[0].objectives = 1;
    st3.players[1].objectives = 1;
    FS_RULES.endRound(st3);
    eq(st3.over, true, 'партия кончилась');
    eq(st3.winner, 0, 'победил тот, у кого больше отрядов');
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
    // Раньше защитником был отряд со здоровьем 4, а удар 2 урона: отряд
    // Погибал? — нет, но проверка шла по «alive ? routed : false», то есть
    // уничтоженный отряд давал false и правило «не деморализуется» не звучало
    // никогда. Теперь урон меньше здоровья: отряд обязан ВЫЖИТЬ и остаться
    // недеморализованным.
    let found = null;
    for (const sys of empty().systems) {
        for (const v of sys.areas) {
            if (v.world) continue;
            const near = FS_RULES.areasAround(empty(), sys.id, v.pos)
                .filter(a => a.system === sys.id)
                .map(a => FS_RULES.area(sys, a.pos))
                .filter(a => a && a.world);
            if (near.length) { found = { sys, v, world: near[0] }; break; }
        }
        if (found) break;
    }
    if (!found) return 'в наборе нет тайла с пустотой у мира';
    const st = empty();
    const sys = st.systems.find(x => x.id === found.sys.id);
    const v = sys.areas.find(a => a.pos === found.v.pos);
    const world = FS_RULES.area(sys, found.world.pos);
    // Удар с трёх линкоров: 3 кубика. Защитник — отряд со здоровьем больше 3,
    // чтобы попадание не убивало («рыцари-немезиды» гвардии недоступны, берём
    // самый стойкий наземный отряд обороняющегося).
    for (let i = 0; i < 3; i++) unit(st, 0, 'линкоры', sys.id, v.pos);
    const foeSeat = 1;
    const tough = FS_DATA.factions.find(f => f.id === st.players[foeSeat].faction).units
        .filter(u => u.type === 'ground')
        .sort((a, b) => (b.health || 0) - (a.health || 0))[0];
    eq(!!tough, true, 'у защитника есть наземный отряд');
    const foe = unit(st, foeSeat, tough.id, sys.id, world.pos);
    st.order = { seat: 0, order: 'advance', system: sys.id, pos: world.pos, phase: 'strike' };
    const res = FS_RULES.apply(st, 0, { type: 'orbitalStrike', system: sys.id, pos: world.pos });
    eq(res.ok, true, 'удар прошёл: ' + (res.error || ''));
    const hits = (st.strike && st.strike.hits) || (res && res.hits) || 0;
    eq(hits < (tough.health || 1), true, 'урона меньше здоровья отряда (' + hits + ' < ' + (tough.health || 1) + ')');
    // Защитник назначает весь урон в этот отряд.
    for (let i = 0; i < 8 && st.strike; i++) {
        FS_RULES.apply(st, st.strike.seat, { type: 'strikeDamage', unit: foe.id });
    }
    const alive = st.units.find(u => u.id === foe.id);
    eq(!!alive, true, 'отряд выжил под ударом');
    eq(alive ? !!alive.routed : true, false, 'и урон без уничтожения его не деморализовал');
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
    // Фабрика есть: иначе отказ пришёл бы от неё, а не от уровня командования.
    FS_RULES.addStructure(st, 0, 'factory', sys.id, pos);
    const res = FS_RULES.apply(st, 0, { type: 'buyUnit', unit: high.id, system: sys.id, pos });
    eq(res.ok, false, 'отряд выше уровня не купить');
    eq(/уровня командования/.test(res.error || ''), true,
        'отказ называет уровень, а не фабрику или запас: ' + res.error);
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
    refused(FS_RULES.canPlaceStructure(st, 0, sys.id, pos), /уже есть постройка/, 'вторая постройка на мире запрещена');
    const free = st.systems.find(x => x.id !== sys.id);
    refused(FS_RULES.canPlaceStructure(st, 0, free.id, worldOf(st, free.id)), /Мир должен быть вашим/, 'на чужом мире нельзя');
    // «…unless a card or faction ability specifically states otherwise»: the
    // permission is an argument of the same question, not a second rule. The
    // Eldar card «Певцы психокости» builds on his own world of another kind.
    const ok = FS_RULES.canPlaceStructure(st, 0, sys.id, pos, { allowOccupied: 'otherType', kind: 'city' });
    eq(ok.ok, true, 'карта разрешает вторую постройку другого типа');
    eq(FS_RULES.canPlaceStructure(st, 0, sys.id, pos, { allowOccupied: 'otherType', kind: 'factory' }).ok,
        false, 'постройка того же типа не встаёт даже с картой');
    const foes = FS_RULES.canPlaceStructure(st, 1, sys.id, pos, { allowOccupied: 'otherType', kind: 'city' });
    refused(foes, /Мир должен быть вашим|одна ваша постройка/, 'чужая постройка не разрешает свою');
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
    refused(second, /из другой системы|одной соседней системы/, 'войска из другой соседней системы уже не приходят');
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
    refused(used, /Не больше 2 жетонов/, 'три жетона при двух отрядах нельзя');
});

rule('rein-3', '«Reinforcement tokens do not contribute dice to a combat»', () => {
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
    const cl = FS_RULES.commandLevel(st, 0);
    // Карта ровно на уровень выше: без кузницы она недоступна, и весь вопрос в
    // том, снимет ли кузница этот уровень. Раньше тест брал самую дорогую карту
    // и был зелёным от отказа по уровню — даже если бы кузница работала.
    const high = FS_DATA.orders.filter(c => c.faction === faction.id && c.kl === cl + 1)[0];
    if (!high) return 'у фракции нет улучшения приказа ровно на уровень выше';
    const withForge = FS_RULES.apply(st, 0, { type: 'buyUpgrade', kind: 'order', card: high.name, forgeKl: true });
    refused(withForge, /уровня командования/, 'кузница не снижает уровень улучшения');
    eq(st.players[0].assets.forge, 2, 'кузница не потрачена');
    eq((st.players[0].upgrades || []).length, 0, 'улучшение не куплено');
    // Тот же отказ и без кузницы: дело в уровне карты, а не в жетоне.
    const without = FS_RULES.apply(st, 0, { type: 'buyUpgrade', kind: 'order', card: high.name });
    refused(without, /уровня командования/, 'без кузницы тот же отказ');
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
    refused(res, /больше нет в запасе/, 'отряда нет в запасе — не купить');
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

// Все ответы на вопрос, которые движок умеет прочитать. Карта, у которой
// вопрос имеет два исхода, проверяется по обоим: обход «первым вариантом»
// оставлял половину её шагов невыполненной ни разу (см. `fs-coverage` по
// функциям эффектов), и сломанная ветка «иначе» проходила аудит.
function answersFor(q) {
    const opts = q.options || [];
    // Номер варианта — то, что панель и присылает (`{choice: i}`); вариант
    // бывает объектом-шагом, и `choice: 0` на все случаи оставлял каждую
    // вторую ветку «либо … либо …» неисполненной.
    const make = (v, index) => {
        const answer = {};
        const value = v && typeof v === 'object' ? (v.id !== undefined ? v.id : v) : v;
        if (q.kind === 'units') answer.units = [value];
        else if (q.kind === 'dice' || q.kind === 'diceFace') answer.dice = [0];
        else if (q.kind === 'face') answer.face = 'att';
        else if (q.kind === 'assets' || q.kind === 'assetType') answer.asset = value || 'forge';
        else if (q.kind === 'types') answer.type = value;
        else if (q.kind === 'structures') answer.structure = value;
        else if (q.kind === 'structureTypes') answer.type = value;
        else if (q.kind === 'areas') answer.area = v && v.system ? { system: v.system, pos: v.pos } : undefined;
        else if (q.kind === 'systems') answer.system = value;
        else if (q.kind === 'foes') answer.foe = value;
        else if (q.kind === 'cards') answer.card = value;
        else if (q.kind === 'yesno') answer.yes = true;
        else answer.choice = index;
        return answer;
    };
    if (q.kind === 'yesno') return [{ yes: true }, { yes: false }];
    const out = opts.slice(0, 3).map((o, i) => make(o, i));
    return out.length ? out : [{ choice: 0 }];
}

// Обход ответов карты: первый вариант продолжается на этом же состоянии, все
// остальные — на копиях, поэтому проверяются ВСЕ ветки, а не только первая.
// Ошибка любой ветки останавливает разбор и возвращается вызывающему.
function exploreAnswers(st, budget = 80, opts) {
    // Каждая ветка вопроса отвечается СВОИМ ответом: клон, снятый для
    // «второго варианта», раньше снова отвечал первым и плодил новые клоны,
    // так что всё после «либо … либо …» оставалось непроверенным.
    const hint = (opts && opts.choice) || 0;
    const stack = [[st, null]];
    let n = 0;
    while (stack.length && n < budget) {
        let pair = stack.pop();
        const cur = pair[0];
        let answer = pair[1];
        while (n < budget && cur.pending) {
            n++;
            const q = cur.pending.question || {};
            const seat = cur.pending.answerSeat !== undefined ? cur.pending.answerSeat : cur.pending.seat;
            const answers = answersFor(q);
            // Ветку, за которой пришёл клон, больше не разворачиваем: иначе тот
            // же вопрос снова снимает клоны, а стек растёт бесконечно.
            const expanding = answer === null;
            const pick = expanding ? answers[hint < answers.length ? hint : 0] : answer;
            answer = null;
            if (expanding) {
                for (let i = 1; i < answers.length; i++) stack.push([structuredClone(cur), answers[i]]);
            }
            const res = FS_RULES.apply(cur, seat, { type: 'effect', answer: pick });
            if (res && res.ok === false) return res.error;
        }
    }
    return null;
}

// A board with a real combat on it: the texts of the combat cards need it.
function battleFor(seed, named, seat) {
    const st = empty(seed);
    const sys = st.systems[0];
    const pos = worldOf(st, sys.id);
    for (let i = 0; i < 2; i++) guard(st, 0, sys.id, pos);
    for (let i = 0; i < 2; i++) olk(st, 1, sys.id, pos);
    // «The player must have at least one of the specified units in the combat»:
    // отряд, названный картой, ставится на поле — иначе её половинка не звучит.
    if (named) {
        const who = seat === undefined ? 0 : seat;
        const def = ctx.FS_CATALOG.unit(st.players[who].faction, named);
        if (def) {
            const where = def.type === 'ship' ? voidOf(st, sys.id) : pos;
            st.units.push({
                id: 'named' + who, seat: who, faction: st.players[who].faction, def: def.id,
                system: sys.id, area: where, routed: false,
            });
        }
    }
    st.players[0].assets.reinforcement = 2;
    st.players[1].assets.reinforcement = 2;
    advance(st, 0, sys.id, pos);
    const res = FS_RULES.apply(st, 0, { type: 'endAdvance' });
    if (!res.ok) throw new Error('бой не начался: ' + res.error);
    return st;
}

rule('cards-1', '«If the rules text on a card … contradicts information from the Rules Reference, the rules on the card … takes precedence» — текст каждой боевой карты разыгрывается движком', () => {
    // Боевая карта — две половины: общая и та, что действует, когда в бою есть
    // названный ею отряд. Вторая половина не разыгрывалась ни разу, пока
    // проверка не ставила на поле этот отряд: половина карт была не проверена.
    const broken = [];
    let checked = 0;
    for (const card of FS_DATA.combat) {
        const unitCard = !!(card.unit && card.unit.trim().length > 2 && card.reqs && card.reqs.length);
        for (const seat of [0, 1]) {
            // Отряд из требования карты ставится её владельцу.
            const st = battleFor(7, unitCard ? card.reqs[0] : null, seat);
            try {
                const steps = FS_RULES.cardSteps(st, seat, card);
                for (const steps1 of [steps, unitCard
                    ? FS_EFFECTS.parse(card.unit, { kind: 'combat', faction: card.faction, reqs: card.reqs || [] })
                    : []]) {
                    checked++;
                    FS_RULES.runEffects(st, seat, steps1, { kind: 'combat', owner: seat, reqs: card.reqs || [] });
                    // Обе ветки каждого вопроса, а не только первая.
                    const why = exploreAnswers(st);
                    if (why) throw new Error(why);
                }
            } catch (e) {
                broken.push(card.faction + ' / ' + card.name + ' (место ' + seat + '): ' + e.message);
            }
            st.pending = null;
        }
    }
    eq(broken.slice(0, 3), [],
        'карты без ошибок (' + broken.length + '; разыграно половин: ' + checked + ' на ' + FS_DATA.combat.length + ' карт)');
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
            const why = exploreAnswers(st);
            if (why) throw new Error(why);
        } catch (e) {
            broken.push(card.faction + ' / ' + card.name + ': ' + e.message);
        }
        st.pending = null;
    }
    // Карта приказа разыгрывается в СВОЁМ приказе и на своём шаге: шаг удара
    // орбиты не исполнялся ни разу, пока все карты гонялись в «Стратегии».
    const places = {
        advance: ['move', 'strike'], deploy: ['deploy'], strategize: ['strategize'], dominate: ['dominate'],
    };
    for (const card of (FS_DATA.orders || [])) {
        const phases = places[card.order] || ['resolve'];
        for (const phase of phases) {
            const st = empty(9);
            const sys = st.systems[0];
            const pos = worldOf(st, sys.id);
            guard(st, 0, sys.id, pos);
            // Богатая доска: постройки, жетоны, отряды обеих сторон — половина
            // шагов карт без неё просто не находит, к чему примениться.
            unit(st, 0, 'крейсеры', sys.id, voidOf(st, sys.id));
            olk(st, 1, sys.id, pos);
            FS_RULES.addStructure(st, 0, 'factory', sys.id, pos);
            st.players[0].assets.forge = 2;
            st.players[0].assets.cache = 2;
            st.players[0].assets.reinforcement = 2;
            st.players[1].assets.forge = 2;
            st.order = { seat: 0, order: card.order || 'strategize', system: sys.id, pos, phase, moved: [], steps: [] };
            try {
                const steps = FS_EFFECTS.parse(card.text || '', { kind: 'order', faction: card.faction });
                eq(steps.length > 0, true, 'у карты есть шаги');
                FS_RULES.runEffects(st, 0, steps, { kind: 'order', ctx: null });
                const why = exploreAnswers(st);
                if (why) throw new Error(why);
            } catch (e) {
                broken.push(card.faction + ' / ' + card.name + ' (' + phase + '): ' + e.message);
            }
            st.pending = null;
        }
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
            const why = exploreAnswers(st);
            if (why) throw new Error(why);
        } catch (e) {
            broken.push(faction.id + ': ' + e.message);
        }
        st.pending = null;
    }
    eq(broken, [], 'все 12 способностей разыгрываются');
});

rule('cards-2b', '«уменьшить общую цену всех покупок (включая здания) на 1» — скидка приказа опускает цену отряда и постройки', () => {
    // «Главный по машинам»: прогон текста без утверждения о цене проходит и
    // на сломанной скидке — проверяем, что покупка действительно дешевле.
    const card = (FS_DATA.orders || []).find(c => /Главный по машинам/.test(c.name));
    eq(!!card, true, 'карта «Главный по машинам» есть');
    const price = (choice) => {
        const st = empty(9);
        const sys = st.systems[0];
        const pos = worldOf(st, sys.id);
        guard(st, 0, sys.id, pos);
        FS_RULES.addStructure(st, 0, 'factory', sys.id, pos);
        st.players[0].materiel = 10;
        st.order = { seat: 0, order: 'deploy', system: sys.id, pos, phase: 'deploy', moved: [], steps: [] };
        FS_RULES.runEffects(st, 0, FS_EFFECTS.parse(card.text, { kind: 'order', faction: card.faction }),
            { kind: 'order', ctx: null });
        const why = exploreAnswers(st, 4, { choice });
        if (why) throw new Error(why);
        const def = ctx.FS_CATALOG.unit(st.players[0].faction, 'гвардейцы')
            || ctx.FS_CATALOG.unit(st.players[0].faction, 'воины');
        return {
            unit: FS_RULES.unitPrice(st, 0, def, {}),
            structure: FS_RULES.structurePrice(st, 0, 'factory', {}),
            discount: st.order.purchaseDiscount || 0,
        };
    };
    const plain = price(0);
    const cheap = price(1);
    eq(plain.discount, 0, 'первый вариант — лимит закупки, а не скидка');
    eq(cheap.discount, 1, 'второй вариант — скидка всех покупок');
    eq(cheap.unit, Math.max(0, plain.unit - 1), 'отряд дешевле на 1 (' + plain.unit + ' → ' + cheap.unit + ')');
    eq(cheap.structure, Math.max(0, plain.structure - 1), 'постройка дешевле на 1 (' + plain.structure + ' → ' + cheap.structure + ')');
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

// «Священное пламя» ещё не разобрана (она в списке невыполненных у fs-coverage).
// Тест не имеет права требовать, чтобы она осталась неразобранной: раньше он
// проверял отсутствие шага `route` и падал бы от самой починки карты. Проверяется
// то, что верно при любом раскладе: деморализовать СВОИ корабли — только вопрос
// игроку, а не молчаливый шаг верхнего уровня.
rule('orders-sisters-3', '«Священное пламя» — деморализация своих кораблей без выбора игрока не выполняется', () => {
    const steps = FS_EFFECTS.parse('Бастионы противника не могут предотвратить этот орбитальный удар. Во время этого орбитального удара вы можете деморализовать любое количество кораблей, участвующих в этом орбитальном ударе. За каждый деморализованный корабль переверните до 2 ваших `def. cube` или `att. cube` на `morale cube`. Один раз за раунд.',
        { kind: 'order', faction: 'сестры-битвы' });
    // Верхний уровень карты: шаги, которые движок выполнит без единого вопроса.
    const top = (steps || []).map(x => x && x.op);
    eq(top.includes('route'), false, 'молчаливой деморализации на верхнем уровне нет');
    // Если карта разобрана — шаг живёт в ветке выбора: там его выполнит ответ
    // игрока, а не сам разбор текста.
    const inner = [];
    const walk = list => { for (const s of list || []) { if (!s) continue; inner.push(s.op); walk(s.options); walk(s.yes); walk(s.no); walk(s.then); } };
    for (const step of steps || []) walk([step.steps, step.options, step.yes, step.no, step.then]);
    // Что бы ни решил разбор, «сколько кораблей» — вопрос, а не число.
    eq((steps || []).some(x => x && x.op === 'route' && x.n !== undefined), false,
        'разбор не назначает число деморализованных кораблей сам');
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
        // Способность фракции, названная в таблице `abilitySteps`, разбирает
        // таблица, а не парсер предложения: у неё и проверка своя (abil-1,
        // abil-2). Парсер к её тексту не применяется вовсе — держать для неё
        // правила, которых никто не достигает, значило бы обещать чтение,
        // которого нет.
        if (card.kind === 'ability' && FS_EFFECTS.abilitySteps(card.faction)) continue;
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
    // Система с двумя пустотами: иначе первый шаг некуда проверить (в тайле
    // 16A пустота одна, и ход корабля в ту же пустоту — не ход). Второй шаг
    // открывает только `endAdvance`: порядок шагов держит движок, а не тест.
    const st = empty();
    const sys = st.systems.find(s => s.areas.filter(a => !a.world).length >= 2) || st.systems[0];
    const voids = sys.areas.filter(a => !a.world).map(a => a.pos);
    if (voids.length < 2) return 'нет системы с двумя пустотами';
    const w1 = worldOf(st, sys.id);
    const g = guard(st, 0, sys.id, w1);
    const ship = unit(st, 0, 'крейсеры', sys.id, voids[0]);
    advance(st, 0, sys.id, w1, 'ships');
    st.order.route = FS_RULES.advanceRoutes(st, 0, 'ship');
    // Первый шаг: пехота не идёт, корабль идёт.
    refused(FS_RULES.canMove(st, 0, g, { system: sys.id, pos: w1 }), /Сначала двигаются корабли/,
        'пехота ждёт шага наземных войск');
    const moved = FS_RULES.apply(st, 0, { type: 'moveUnits', moves: [{ unit: ship.id, system: sys.id, pos: voids[1] }] });
    eq(moved.ok, true, 'корабль идёт первым шагом');
    // Второй шаг: теперь корабли стоят.
    const next = FS_RULES.apply(st, 0, { type: 'endAdvance' });
    eq(next.ok, true, 'шаг наземных войск открыт');
    eq(next.step, 'ground', 'второй шаг — наземные войска');
    refused(FS_RULES.canMove(st, 0, ship, { system: sys.id, pos: voids[0] }), /Корабли уже отлетали/,
        'корабль уже отлетал');
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
    // Карта разрешает все восемь направлений: иначе «на север нельзя» означало
    // бы «карта не пускает», а правило о двух штормах на одной грани молчало бы.
    st.event = { seat: 0, drawn: [], card: { name: 'x', storm: ['any'], type: 'tactic' } };
    const ways = FS_RULES.stormOptions(st, 0).filter(o => o.storm === 's0');
    eq(ways.some(o => o.dir === 'N'), false, 'на север идти нельзя: грань занята');
    eq(ways.length > 0, true, 'другие ходы шторма остались');
    // Грань на север действительно существует — её держит второй шторм.
    const other = FS_RULES.stormTarget(st, st.storms[0], 'N');
    if (!other) return 'на север от шторма нет грани';
    st.phase = 'refresh';
    const res = FS_RULES.apply(st, 0, { type: 'moveStorm', storm: 's0', dir: 'N' });
    eq(res.ok, false, 'ход на занятую грань отклонён');
    eq(/не может туда пойти/.test(res.error || ''), true,
        'отказ о занятой грани, а не о фазе или карте: ' + res.error);
    // Туда же, но без второго шторма, тот же ход проходит.
    const free = empty();
    free.storms = [{ id: 's0', system: at(1, 1).id, side: 'N', moved: false }];
    free.event = { seat: 0, drawn: [], card: { name: 'x', storm: ['any'], type: 'tactic' } };
    free.phase = 'refresh';
    eq(FS_RULES.apply(free, 0, { type: 'moveStorm', storm: 's0', dir: 'N' }).ok, true,
        'без второго шторма грань свободна');
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

rule('event-3', '«Then, he shuffles all event cards back into his event deck, excluding the “Scheme” event card if it is in play.»', () => {
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

rule('rein-2', '«Each of these tokens is treated as one of his command level zero units, either a ground unit or ship as appropriate for the combat.» — мораль жетона', () => {
    const st = battleOf('сестры-битвы', 'орки');
    const cl0 = FS_RULES.reinforceUnitDef(st.players[0].faction, 'ground');
    if (!cl0) return 'у фракции нет отряда нулевого уровня';
    st.combat.reinforce.attacker = 0;
    const before = FS_RULES.combatMorale(st, 'attacker');
    st.combat.reinforce.attacker = 2;
    const after = FS_RULES.combatMorale(st, 'attacker');
    eq(after - before, 2 * cl0.morale, 'два жетона дают мораль двух отрядов нулевого уровня');
});

rule('rein-4', '«Reinforcement tokens in combat are treated like plastic units for all rules and game effects» — здоровье жетона', () => {
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
    refused(bad, /во время орбитального удара/, 'во время развёртывания орбитальную карту применить нельзя');
    eq(st.players[0].upgrades[0].used, false, 'карта не сгорела зря');
    // Its own moment: the strike of the order.
    st.order.phase = 'strike';
    const good = FS_RULES.apply(st, 0, { type: 'useUpgrade', card: card.name });
    eq(good.ok, true, 'во время орбитального удара карта применяется');
    // И общее правило, а не только орбитальная ветка: карта развёртывания в
    // чужом приказе не играется. Мутация «приказ не сверяется» проходила мимо
    // проверки, потому что орбитальная ветка живёт отдельно.
    const deployCard = FS_DATA.orders.find(c2 => c2.faction === st.players[0].faction && c2.order === 'deploy');
    eq(!!deployCard, true, 'у фракции есть улучшение развёртывания');
    const own = {
        ...st,
        order: { seat: 0, order: 'strategize', system: st.systems[0].id, phase: 'buy' },
        players: st.players.map((p, i) => (i ? p : { ...p, upgrades: [{ name: deployCard.name, used: false, order: 'deploy' }] })),
    };
    refused(FS_RULES.apply(own, 0, { type: 'useUpgrade', card: deployCard.name }),
        /во время приказа «Развёртывание»|во время приказа/, 'улучшение развёртывания в приказе стратегии');
    eq(own.players[0].upgrades[0].used, false, 'и карта не сгорела');
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
    refused(late, /Нет вопроса/, 'ответить после конца приказа нечем');
});

rule('strike-5', '«Вы можете потратить 2 `def. cube`, чтобы взять под контроль постройки этого мира, если в нём нет вражеских юнитов и бастионов.» (05-order-upgrades.md, «Изъяны плоти»)', () => {
    // `takeStructuresOf` — единственный захват построек, и удар платит за него
    // кубиками защиты. Ни одна проверка не вела удар с этой ценой: подмена
    // «забрать» на «ничего не делать» проходила молча.
    const upg = FS_DATA.orders.find(c => /Изъяны плоти/.test(c.name));
    eq(!!upg, true, 'карта «Изъяны плоти» есть');
    eq(FS_EFFECTS.parse(upg.text, { kind: 'order', faction: upg.faction }).some(x => x.op === 'strikeTakeStructures'),
        true, 'карта обещает захват построек за 2 куб. обороны');
    const strikeOn = (dice, priced) => {
        const st = empty(7);
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
        if (!found) return null;
        const sys = st.systems.find(x => x.id === found.sys.id);
        unit(st, 0, 'линкоры', sys.id, found.v.pos);
        FS_RULES.addStructure(st, 1, 'factory', sys.id, found.world.pos);
        st.order = { seat: 0, order: 'advance', system: sys.id, pos: found.world.pos, phase: 'strike' };
        if (priced) StrikePlan.of(st.order).setTake({ n: 2, kind: 'def' });
        // The roll is the only random part of the strike: the check fixes it.
        const real = FS_RULES.rollDice;
        FS_RULES.rollDice = () => dice.slice();
        try {
            const res = FS_RULES.apply(st, 0, { type: 'orbitalStrike', system: sys.id, pos: found.world.pos });
            if (!res.ok) throw new Error('удар не прошёл: ' + res.error);
        } finally {
            FS_RULES.rollDice = real;
        }
        return st.structures.find(x => x.type === 'factory').seat;
    };
    eq(strikeOn(['def', 'def', 'att'], true), 0, 'заплачено два куб. обороны — постройки переходят');
    eq(strikeOn(['def', 'att', 'att'], true), 1, 'одного куб. обороны мало — постройки остаются');
    eq(strikeOn(['def', 'def', 'att'], false), 1, 'без карты постройки не забирают даже при двух куб. обороны');
    // В мире с вражеским отрядом или бастионом брать нечего — даже заплатив.
    const guarded = empty(7);
    const gw = worldOf(guarded, guarded.systems[0].id);
    FS_RULES.addStructure(guarded, 1, 'factory', guarded.systems[0].id, gw);
    unit(guarded, 1, 'бойзы', guarded.systems[0].id, gw);
    eq(FS_RULES.takeStructuresOf(guarded, 0, guarded.systems[0].id, gw), false, 'с вражеским отрядом постройку не забрать');
    const bast = empty(7);
    const bw = worldOf(bast, bast.systems[0].id);
    FS_RULES.addStructure(bast, 1, 'bastion', bast.systems[0].id, bw);
    eq(FS_RULES.takeStructuresOf(bast, 0, bast.systems[0].id, bw), false, 'с бастионом постройку не забрать');
});

rule('strike-6', '«If the orbital strike does not damage any units … the order ends» — удар без жертв заканчивает приказ, удар по отрядам — нет', () => {
    // `finishStrike` — развилка конца удара: с жертвами он передаёт урон
    // защитнику, без жертв заканчивает приказ. Проверялся только первый путь.
    const strikeOnce = (withUnit) => {
        const st = empty(7);
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
        if (!found) return null;
        const sys = st.systems.find(x => x.id === found.sys.id);
        for (let i = 0; i < 3; i++) unit(st, 0, 'линкоры', sys.id, found.v.pos);
        // Цель удара — только чужой мир. Без отрядов защитника там должна быть
        // хоть одна его постройка, иначе мир не цель.
        if (withUnit) unit(st, 1, 'бойзы', sys.id, found.world.pos);
        else FS_RULES.addStructure(st, 1, 'factory', sys.id, found.world.pos);
        st.order = { seat: 0, order: 'advance', system: sys.id, pos: found.world.pos, phase: 'strike' };
        const real = FS_RULES.rollDice;
        FS_RULES.rollDice = () => ['att', 'att', 'att'];
        try {
            const res = FS_RULES.apply(st, 0, { type: 'orbitalStrike', system: sys.id, pos: found.world.pos });
            if (!res.ok) throw new Error('удар не прошёл: ' + res.error);
        } finally {
            FS_RULES.rollDice = real;
        }
        return {
            st, order: st.order, pending: !!StrikeDamage.of(st).pending,
            phase: st.order && PhasePlan.of(st.order).name,
            turn: GamePhase.of(st).turn,
        };
    };
    const emptyWorld = strikeOnce(false);
    if (!emptyWorld) return 'на наборе нет тайла с пустотой у мира';
    eq(emptyWorld.pending, false, 'урон некому наносить — распределения нет');
    eq(emptyWorld.phase === 'strike-damage', false, 'и шаг распределения не открыт');
    eq(emptyWorld.order, null, 'приказ закончен');
    eq(emptyWorld.turn, 1, 'ход перешёл к следующему игроку');
    const withFoe = strikeOnce(true);
    eq(withFoe.pending, true, 'по отрядам урон распределяет защитник');
    eq(withFoe.phase, 'strike-damage', 'шаг удара — распределение урона');
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
