// ============================================================================
//  fs-play.mjs — партии ботов: каждая фракция играет целиком
// ----------------------------------------------------------------------------
//  node tools/fs-play.mjs                      расписание: каждая фракция — три
//                                              дуэли и один стол на четверых
//  node tools/fs-play.mjs --faction=орки       только партии с этой фракцией
//  node tools/fs-play.mjs --seed=7             один сид для всех партий
//  node tools/fs-play.mjs --rounds=3           короче партии (по умолчанию 8)
//  node tools/fs-play.mjs --games=2            столько сидов на каждую пару
//  node tools/fs-play.mjs --verbose            журнал каждой партии
//  node tools/fs-play.mjs --vs=эльдары,орки --seed=11   одна конкретная партия
//  node tools/fs-play.mjs --log                при падении — состояние в /tmp
//
//  Зачем это, если есть проверки карт по одной и проход клиента.
//
//  Проверки карт берут карту на подготовленном состоянии; проход (fs-walk)
//  доигрывает партию, ничего не покупая и никуда не двигаясь. Между ними —
//  настоящая игра: случайные покупки, марши в чужие миры, бои на несколько
//  раундов с картами и жетонами, орбитальные удары, улучшения приказов,
//  планы и события, переполнение, отступления — всё в одном состоянии, с
//  перепиской через JSON после каждой команды, как делает сервер.
//
//  Бот не умён: он берёт случайную законную команду. Движок обязан принять её
//  или отказать словами правил. Партия провалена, если
//    * команда или ответ на вопрос падает исключением (TypeError и прочее);
//    * вопрос карты не принимает ни одного законного ответа;
//    * обязательная команда (раскрыть приказ, закончить его, перейти к
//      следующей фазе) отвергнута;
//    * состояние не переживает JSON;
//    * партия стоит на месте: одно и то же состояние много команд подряд;
//    * нарушен инвариант: отрицательная материя, жетонов больше предела,
//      отряд вне доски, корабль на земле, фигурок больше, чем в коробке.
// ============================================================================
import fs from 'node:fs';
import { createEngineContext } from './fs-engine.mjs';

const C = { r: '\x1b[0m', b: '\x1b[1m', dim: '\x1b[2m', red: '\x1b[31m', grn: '\x1b[32m', yel: '\x1b[33m', cyn: '\x1b[36m' };
const argOf = (name, d) => { const a = process.argv.find(x => x.startsWith('--' + name + '=')); return a ? a.split('=').slice(1).join('=') : d; };
const VERBOSE = process.argv.includes('--verbose');
const LOG = process.argv.includes('--log');
const ONLY = argOf('faction', '');
const SEED = argOf('seed', '');
const ROUNDS = Number(argOf('rounds', '8')) || 8;
const GAMES = Number(argOf('games', '1')) || 1;
const VS = argOf('vs', '');  // --vs=орки,эльдары[,…] — одна конкретная партия (с --seed)

const ctx = createEngineContext();
const { FS_RULES: R, FS_CATALOG, FS_CARDS, FS_EFFECTS, PhasePlan, MarchPlan, OrderContext, OrderTally, OrderDeal,
    CombatTurn, CombatSides, Question, StrikeDamage, GameOutcome, BoardSetup, StrikePlan, Purchases } = ctx;

const FACTIONS = FS_CATALOG.factions.map(f => f.id);

// --- случайность партии: свой генератор, чтобы сид повторял партию ----------
function rngOf(seed) {
    let a = 0;
    for (const ch of String(seed)) a = (a * 31 + ch.charCodeAt(0)) >>> 0;
    a = (a || 1) >>> 0;
    return () => {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const pick = (rnd, list) => (list && list.length ? list[Math.floor(rnd() * list.length)] : undefined);
const shuffled = (rnd, list) => {
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
    return out;
};
const chance = (rnd, p) => rnd() < p;

// --- что считается падением, а что — отказом правил --------------------------
const CRASH = /TypeError|ReferenceError|RangeError|SyntaxError|Cannot read|Cannot set|Cannot convert|Cannot destructure|Cannot access|is not a function|is not a constructor|is not defined|is not iterable|is not an object|before initialization|Maximum call stack|too much recursion|of undefined|of null|undefined is not|null is not|Reduce of empty array|Invalid array length|circular structure|Assignment to constant/;

class GameFailure extends Error {
    constructor(message, snapshot) { super(message); this.snapshot = snapshot; }
}

// --- ответ на вопрос карты --------------------------------------------------
/** Все ответы, которые стоит попробовать: первый — случайный, дальше — запасные. */
function answersFor(rnd, st, q) {
    const opts = Array.isArray(q.options) ? q.options : [];
    const n = Math.max(1, Number(q.n) || 1);
    const first = opts[0];
    const some = k => shuffled(rnd, opts).slice(0, Math.min(k, opts.length));
    const out = [];
    switch (q.kind) {
        case 'ability':
            out.push(chance(rnd, 0.75) ? { yes: true } : { no: true }, { yes: true }, {}, { no: true });
            break;
        case 'yesno':
            if (q.op === 'avoid') out.push(chance(rnd, 0.5) ? { dice: opts.slice(0, n) } : { dice: [] }, { dice: [] }, { dice: opts.slice(0, n) }, { no: true });
            else out.push(chance(rnd, 0.6) ? { yes: true } : { no: true }, { yes: true }, { no: true }, {});
            break;
        case 'scheme':
            out.push(chance(rnd, 0.7) ? { choice: Math.floor(rnd() * Math.max(1, opts.length)) } : { no: true }, { choice: 0 }, { no: true }, {});
            break;
        case 'choice':
            out.push({ choice: Math.floor(rnd() * Math.max(1, opts.length)) }, { choice: 0 }, { no: true }, {});
            break;
        case 'units':
            out.push({ units: some(n) }, { units: opts.slice(0, n) }, { units: first === undefined ? [] : [first] }, { units: [] }, { no: true });
            break;
        case 'dice':
            out.push({ dice: some(n) }, { dice: opts.slice(0, n) }, { dice: opts.slice() }, { dice: first === undefined ? [] : [first] }, { dice: [] }, { no: true });
            break;
        case 'diceFace':
            out.push({ dice: [pick(rnd, opts)], face: pick(rnd, ['att', 'def', 'morale']) }, { dice: [first], face: 'att' }, { dice: [] }, { no: true });
            break;
        case 'face':
            out.push({ face: pick(rnd, opts.length ? opts : ['att', 'def', 'morale']) }, { face: 'att' }, { no: true });
            break;
        case 'foes':
            out.push({ foe: pick(rnd, opts) }, { foe: first }, { no: true });
            break;
        case 'types': case 'structureTypes':
            out.push({ type: pick(rnd, opts) }, { type: first }, { no: true });
            break;
        case 'areas': {
            const key = q.answerKey || 'area';
            out.push({ [key]: pick(rnd, opts) }, { [key]: first }, { area: first }, { no: true });
            break;
        }
        case 'systems':
            out.push({ system: pick(rnd, opts) }, { system: first }, { no: true });
            break;
        case 'cards':
            if (q.op === 'buyUpgradeReplace' || q.op === 'buyAnyUpgradeReplace') out.push({ card: q.card, remove: pick(rnd, opts) }, { card: q.card, remove: first }, { remove: first }, { no: true });
            else if (q.op === 'swapCombatCards') out.push({ cards: chance(rnd, 0.5) ? some(1) : [] }, { cards: [] }, { no: true });
            else out.push({ card: pick(rnd, opts) }, { card: first }, { cards: [first] }, { no: true });
            break;
        case 'structures':
            out.push({ structure: pick(rnd, opts) }, { structure: first }, { no: true });
            break;
        case 'assets': case 'assetType':
            out.push({ asset: pick(rnd, opts) }, { asset: first }, { asset: 'forge' }, { asset: 'cache' }, { asset: 'reinforcement' }, { no: true });
            break;
        default:
            out.push({ choice: 0 }, { yes: true }, {}, { no: true }, { units: opts.slice(0, n) }, { dice: opts.slice(0, n) });
    }
    return out;
}

const answerSeat = st => (st.pending.answerSeat === undefined ? st.pending.seat : st.pending.answerSeat);

/** Вопросы по видам: сколько раз принят первый (случайный) ответ, сколько — запасной, и чем отказывали. */
const QUESTIONS = {};
function noteQuestion(q, index, errors) {
    const key = (q.kind || '?') + ':' + (q.op || '?');
    const rec = QUESTIONS[key] || (QUESTIONS[key] = { total: 0, first: 0, fallback: 0, errors: {} });
    rec.total++;
    if (index === 0) rec.first++; else rec.fallback++;
    for (const e of errors) rec.errors[e] = (rec.errors[e] || 0) + 1;
}

// --- бот одного шага --------------------------------------------------------
const enemyAt = (st, seat, system, pos) => st.units.some(u => u.seat !== seat && u.system === system && u.area === pos)
    || st.structures.some(s => s.seat !== seat && s.system === system && s.area === pos);
const unitsAt = (st, seat, system, pos) => st.units.filter(u => u.seat === seat && u.system === system && u.area === pos);

/** Все улучшения приказов игрока, которые ещё не тратились в этом раунде. */
function unusedUpgrades(st, seat) {
    const p = st.players[seat];
    return (p.upgrades || []).filter(u => !u.used).map(u => ({ name: u.name, card: FS_CATALOG.card('orders', p.faction, u.name) }));
}

class Bot {
    constructor(rnd, stats) { this.rnd = rnd; this.stats = stats; }

    /**
     * Следующая команда: `{ seat, cmd, must }` (must — отказ недопустим),
     * `{ combat: true }` — шаг боя, `null` — делать нечего.
     */
    next(st) {
        const rnd = this.rnd;
        const trim = R.trimQueue(st);
        if (trim.any()) {
            const entry = trim.entries()[0];
            const unit = pick(rnd, st.units.filter(u => u.seat === entry.seat && u.system === entry.system && u.area === entry.pos));
            if (!unit) throw new GameFailure('переполнение без отряда', entry);
            this.stats.trims++;
            return { seat: entry.seat, cmd: { type: 'trimUnit', unit: unit.id }, must: true };
        }
        if (st.pending) return { question: true };
        if (st.over || GameOutcome.of(st).over) return null;
        if (StrikeDamage.of(st).pending) return this.strikeDamage(st);
        if (st.combat) return { combat: true };
        if (st.phase === 'setup' && BoardSetup.of(st).active) return this.setup(st);
        if (st.phase === 'planning') return this.planning(st);
        if (st.phase === 'operations') return this.operations(st);
        if (st.phase === 'refresh') return this.refresh(st);
        return null;
    }

    strikeDamage(st) {
        const damage = StrikeDamage.of(st);
        const seat = st.strike.seat;
        const sys = damage.system, pos = damage.pos;
        const units = st.units.filter(u => u.seat === seat && u.system === sys && u.area === pos);
        const bastions = st.structures.filter(s => s.seat === seat && s.type === 'bastion' && s.system === sys && s.area === pos);
        const order = [];
        const first = damage.first ? units.find(u => u.id === damage.first) : null;
        if (first) order.push(first);
        for (const u of shuffled(this.rnd, units.filter(u => !u.routed && u !== first))) order.push(u);
        for (const b of bastions) order.push(b);
        for (const u of shuffled(this.rnd, units.filter(u => u.routed && u !== first))) order.push(u);
        if (!order.length) throw new GameFailure('удар ждёт урона, а бить некого', st.strike);
        return { seat, tries: order.map(x => ({ type: 'strikeDamage', unit: x.id, structure: x.id })), must: true, label: 'strikeDamage' };
    }

    setup(st) {
        const board = BoardSetup.of(st);
        const seat = board.turn;
        const stage = board.stage;
        // Стартовые жетоны на выбор (Инквизиция): берутся во время сборки.
        const chooser = st.players.find(p => (p.startChoice || 0) > 0);
        if (chooser && chance(this.rnd, 0.7)) {
            const kinds = ['forge', 'cache', 'reinforcement'].filter(k => R.player(st, chooser.seat).hasRoomFor(k));
            if (kinds.length) return { seat: chooser.seat, cmd: { type: 'startAsset', asset: pick(this.rnd, kinds) }, must: true, label: 'startAsset' };
        }
        if (stage === BoardSetup.TILES) {
            const cell = pick(this.rnd, R.setupLegalCells(st));
            const tile = pick(this.rnd, board.hand(seat));
            return { seat, cmd: { type: 'placeSystemTile', tile, row: cell.row, col: cell.col }, must: true };
        }
        if (stage === BoardSetup.FORCES) {
            const initial = st.players[seat].initialForces;
            const sys = R.system(st, board.currentSystem);
            const unitId = Object.keys(initial.units).find(id => initial.units[id] > 0);
            if (unitId) {
                const def = R.unitDef(st, seat, unitId);
                const area = sys.areas.find(a => !!a.world === (def.type !== 'ship')
                    && R.unitsAt(st, sys.id, a.pos).length < R.capacity(st, sys.id, a.pos));
                if (area) return { seat, cmd: { type: 'setupUnit', unit: unitId, pos: area.pos }, must: true };
            }
            const structId = Object.keys(initial.structures).find(id => initial.structures[id] > 0);
            if (structId) {
                const area = sys.areas.find(a => a.world && R.canPlaceStructure(st, seat, sys.id, a.pos, { ignoreControl: true }).ok);
                if (area) return { seat, cmd: { type: 'setupStructure', structure: structId, pos: area.pos }, must: true };
            }
            return { seat, cmd: { type: 'finishSetupForces' }, must: true };
        }
        if (stage === BoardSetup.OBJECTIVES) {
            const opt = pick(this.rnd, R.setupObjectiveOptions(st));
            if (opt) return { seat, cmd: { type: 'setupObjective', faction: opt.faction, pos: pick(this.rnd, opt.areas) }, must: true };
            return null;
        }
        if (stage === BoardSetup.STORMS) {
            for (const sys of shuffled(this.rnd, st.systems)) {
                const sides = R.setupStormSides(st, sys.id);
                if (sides.length) return { seat, cmd: { type: 'setupStorm', system: sys.id, side: pick(this.rnd, sides) }, must: true };
            }
            return null;
        }
        return null;
    }

    planning(st) {
        const seat = st.turn;
        const kinds = shuffled(this.rnd, ['advance', 'deploy', 'strategize', 'dominate']).filter(k => R.orderLeft(st, seat, k) > 0);
        if (!kinds.length) throw new GameFailure('у игрока ' + seat + ' кончились приказы, а планирование идёт', null);
        const systems = st.systems.filter(s => R.canPlaceOrder(st, seat, s.id));
        if (!systems.length) throw new GameFailure('некуда положить приказ игроку ' + seat, null);
        // Веса: своя система — втрое, соседняя со своей — вдвое, остальные — по разу.
        const mine = new Set(st.units.filter(u => u.seat === seat).map(u => u.system)
            .concat(st.structures.filter(s => s.seat === seat).map(s => s.system)));
        const near = new Set();
        for (const id of mine) for (const n of R.neighbors(st, id)) near.add(n);
        const foes = new Set(st.units.filter(u => u.seat !== seat).map(u => u.system)
            .concat(st.structures.filter(s => s.seat !== seat).map(s => s.system)));
        // Наступление — туда, где противник достижим: иначе боёв не будет.
        let kind = kinds[0];
        if (R.orderLeft(st, seat, 'advance') > 0 && chance(this.rnd, 0.6)) {
            const hot = systems.filter(s => foes.has(s.id) && (mine.has(s.id) || near.has(s.id)));
            if (hot.length) {
                this.stats.orders++;
                return { seat, cmd: { type: 'placeOrder', system: pick(this.rnd, hot).id, order: 'advance' }, must: true };
            }
            if (kind !== 'advance' && chance(this.rnd, 0.5)) kind = 'advance';
        }
        const bag = [];
        for (const s of systems) {
            const w = mine.has(s.id) ? 3 : (near.has(s.id) ? (foes.has(s.id) ? 4 : 2) : 1);
            for (let i = 0; i < w; i++) bag.push(s);
        }
        const sys = pick(this.rnd, bag);
        this.stats.orders++;
        return { seat, cmd: { type: 'placeOrder', system: sys.id, order: kind }, must: true };
    }

    operations(st) {
        const rnd = this.rnd;
        if (!st.order) {
            const seat = st.turn;
            const systems = st.systems.filter(s => s.tokens.length && s.tokens[s.tokens.length - 1].seat === seat);
            if (!systems.length) throw new GameFailure('у игрока ' + seat + ' нет приказа, но операции идут', { turn: st.turn });
            const sys = pick(rnd, systems);
            const toEventDeck = chance(rnd, 0.05);
            if (toEventDeck) this.stats.eventTokens++;
            return { seat, cmd: { type: 'resolveOrder', system: sys.id, toEventDeck }, must: true, label: 'resolveOrder' };
        }
        const order = st.order;
        const seat = order.seat;
        const kind = order.order;
        const plan = PhasePlan.of(order);
        if (plan.is('guardDeploy')) return this.guardDeploy(st, seat);
        // Улучшение приказа этого вида — иногда, пока приказ идёт.
        const burn = this.useUpgrade(st, seat, kind);
        if (burn) return burn;
        if (kind === 'advance') return this.advance(st, seat, order);
        if (kind === 'deploy') return this.deploy(st, seat, order);
        if (kind === 'strategize') return this.strategize(st, seat, order);
        if (kind === 'dominate') return this.dominate(st, seat, order);
        throw new GameFailure('неизвестный приказ ' + kind, order);
    }

    useUpgrade(st, seat, kind) {
        if (!chance(this.rnd, 0.6)) return null;
        const strike = kind === 'advance' && PhasePlan.of(st.order).is('strike');
        const wanted = kind === 'advance' ? (strike ? ['orbital'] : ['advance']) : [kind];
        const cards = unusedUpgrades(st, seat).filter(u => u.card && wanted.includes(u.card.order));
        if (!cards.length) return null;
        // Одна попытка на шаг: отказ правил — не провал.
        const key = 'upgrade:' + st.round + ':' + seat + ':' + kind;
        this.tried = this.tried || new Set();
        const fresh = cards.filter(u => !this.tried.has(key + ':' + u.name));
        if (!fresh.length) return null;
        const u = pick(this.rnd, fresh);
        this.tried.add(key + ':' + u.name);
        return { seat, cmd: { type: 'useUpgrade', card: u.name }, must: false, label: 'useUpgrade', onOk: () => { this.stats.upgradesUsed++; } };
    }

    advance(st, seat, order) {
        const rnd = this.rnd;
        const plan = PhasePlan.of(order);
        const march = MarchPlan.of(order);
        const active = OrderContext.of(order).system;
        if (plan.is('move')) {
            const key = 'move:' + st.round + ':' + seat + ':' + active + ':' + march.step + ':' + march.moved.length;
            this.tried = this.tried || new Set();
            if (!this.tried.has(key) && chance(rnd, 0.85)) {
                this.tried.add(key);
                const units = shuffled(rnd, R.movableUnits(st, seat));
                const sys = R.system(st, active);
                if (units.length && sys) {
                    const areas = shuffled(rnd, sys.areas);
                    // Чужая область — чаще: без боёв партия ничего не проверяет.
                    areas.sort((a, b) => (enemyAt(st, seat, sys.id, b.pos) ? 1 : 0) - (enemyAt(st, seat, sys.id, a.pos) ? 1 : 0));
                    for (const area of areas) {
                        const hostile = enemyAt(st, seat, sys.id, area.pos);
                        if (hostile && chance(rnd, 0.1)) continue;
                        const can = units.filter(u => R.canMove(st, seat, u, { system: sys.id, pos: area.pos }).ok);
                        if (!can.length) continue;
                        const cap = R.capacity(st, sys.id, area.pos);
                        const already = unitsAt(st, seat, sys.id, area.pos).length;
                        const room = Math.max(1, cap - already);
                        const count = Math.max(1, Math.min(can.length, chance(rnd, 0.3) ? room + 1 : room));
                        const moves = can.slice(0, count).map(u => ({ unit: u.id, system: sys.id, pos: area.pos }));
                        return { seat, cmd: { type: 'moveUnits', moves }, must: false, label: 'moveUnits',
                            onOk: () => { this.stats.moves += moves.length; if (hostile) this.stats.marchesIntoEnemy++; } };
                    }
                }
            }
            if (march.moved.length && chance(rnd, 0.05)) return { seat, cmd: { type: 'undoMove' }, must: false, label: 'undoMove' };
            return { seat, cmd: { type: 'endAdvance' }, must: true, label: 'endAdvance' };
        }
        if (plan.is('strike')) {
            const targets = R.orbitalStrikeTargets(st, seat);
            if (targets.length && chance(rnd, 0.8)) {
                const t = pick(rnd, targets);
                return { seat, cmd: { type: 'orbitalStrike', system: t.system, pos: t.pos }, must: false, label: 'orbitalStrike',
                    onOk: () => { this.stats.strikes++; }, fallback: { type: 'finishAdvance' } };
            }
            return { seat, cmd: { type: 'finishAdvance' }, must: true, label: 'finishAdvance' };
        }
        if (plan.is('corsair')) {
            return { seat, cmd: { type: 'finishAdvance' }, must: true, label: 'finishAdvance' };
        }
        return { seat, tries: [{ type: 'finishAdvance' }, { type: 'endAdvance' }], must: true, label: 'finishAdvance' };
    }

    deploy(st, seat, order) {
        const rnd = this.rnd;
        const active = OrderContext.of(order).system;
        const sys = R.system(st, active);
        const p = st.players[seat];
        const step = R.deployStep(order);
        const bought = Purchases.of(order).list.length;
        if (bought && chance(rnd, 0.04)) return { seat, cmd: { type: 'undoPurchase' }, must: false, label: 'undoPurchase' };
        if (step === 'units') {
            const key = 'buy:' + st.round + ':' + seat + ':' + bought;
            this.tried = this.tried || new Set();
            const attempts = (this.attempts = this.attempts || {});
            attempts[key] = (attempts[key] || 0) + 1;
            if (attempts[key] <= 4 && chance(rnd, 0.9) && R.hasFactory(st, seat, sys.id)) {
                const left = p.materiel - R.spentOf(order);
                const cl = R.commandLevel(st, seat);
                const defs = shuffled(rnd, R.faction(st, seat).units.filter(d => (p.supply.units[d.id] || 0) > 0 && (d.kl || 0) <= cl));
                for (const def of defs) {
                    const cache = R.player(st, seat).assetCount('cache') > 0 && chance(rnd, 0.5);
                    const price = R.unitPrice(st, seat, def, { cache });
                    if (price > left) continue;
                    const areas = shuffled(rnd, sys.areas.filter(a => !!a.world === (def.type !== 'ship')));
                    for (const area of areas) {
                        if (!R.canPlaceUnit(st, seat, sys.id, area.pos, def).ok) continue;
                        return { seat, cmd: { type: 'buyUnit', unit: def.id, system: sys.id, pos: area.pos, cache }, must: false, label: 'buyUnit',
                            onOk: () => { this.stats.unitsBought++; } };
                    }
                }
            }
            if (OrderDeal.of(order).structureFirst && chance(rnd, 0.5)) {
                const buy = this.structurePurchase(st, seat, sys);
                if (buy) return buy;
            }
            return { seat, cmd: { type: 'deployStructures' }, must: true, label: 'deployStructures' };
        }
        const key = 'struct:' + st.round + ':' + seat + ':' + active;
        this.tried = this.tried || new Set();
        if (!this.tried.has(key)) {
            this.tried.add(key);
            const buy = this.structurePurchase(st, seat, sys);
            if (buy) return buy;
        }
        return { seat, cmd: { type: 'finishDeploy' }, must: true, label: 'finishDeploy' };
    }

    structurePurchase(st, seat, sys) {
        const rnd = this.rnd;
        const p = st.players[seat];
        const left = p.materiel - R.spentOf(st.order);
        for (const type of shuffled(rnd, ['city', 'factory', 'bastion'])) {
            const cache = R.player(st, seat).assetCount('cache') > 0 && chance(rnd, 0.5);
            if (R.structurePrice(st, seat, type, { cache }) > left) continue;
            for (const area of shuffled(rnd, sys.areas.filter(a => a.world))) {
                if (!R.canPlaceStructure(st, seat, sys.id, area.pos).ok) continue;
                return { seat, cmd: { type: 'buyStructure', kind: type, system: sys.id, pos: area.pos, cache }, must: false, label: 'buyStructure',
                    onOk: () => { this.stats.structuresBought++; } };
            }
        }
        return null;
    }

    guardDeploy(st, seat) {
        const rnd = this.rnd;
        const order = st.order;
        const bought = Purchases.of(order).units.length;
        const key = 'guard:' + st.round + ':' + seat + ':' + bought;
        this.tried = this.tried || new Set();
        if (!this.tried.has(key) && bought < 2 && chance(rnd, 0.8)) {
            this.tried.add(key);
            const sys = R.system(st, OrderContext.of(order).system);
            const p = st.players[seat];
            const left = p.materiel - R.spentOf(order);
            const cl = R.commandLevel(st, seat);
            const defs = shuffled(rnd, R.faction(st, seat).units.filter(d => d.type !== 'ship' && (p.supply.units[d.id] || 0) > 0 && (d.kl || 0) <= cl));
            // «Массовое Производство»: the one factory produces into its own world.
            const factory = ctx.DeployScope.of(order).factory;
            const worlds = factory && factory.system === sys.id ? sys.areas.filter(a => a.pos === factory.pos) : sys.areas.filter(a => a.world);
            for (const def of defs) {
                if (R.unitPrice(st, seat, def, {}) > left) continue;
                for (const area of shuffled(rnd, worlds)) {
                    return { seat, cmd: { type: 'buyUnit', unit: def.id, system: sys.id, pos: area.pos }, must: false, label: 'buyUnit(guard)',
                        onOk: () => { this.stats.unitsBought++; } };
                }
            }
        }
        if (bought === 1) return { seat, tries: [{ type: 'finishGuardDeploy' }, { type: 'undoPurchase' }], must: true, label: 'finishGuardDeploy' };
        return { seat, cmd: { type: 'finishGuardDeploy' }, must: true, label: 'finishGuardDeploy' };
    }

    strategize(st, seat, order) {
        const rnd = this.rnd;
        const p = st.players[seat];
        const key = 'strat:' + st.round + ':' + seat + ':' + OrderContext.of(order).system;
        this.tried = this.tried || new Set();
        const attempts = (this.attempts = this.attempts || {});
        attempts[key] = (attempts[key] || 0) + 1;
        const present = R.board(st).hasUnitsOrStructures(seat, OrderContext.of(order).system);
        if (present && attempts[key] <= 3 && chance(rnd, 0.85)) {
            const cl = R.commandLevel(st, seat);
            if (chance(rnd, 0.5)) {
                const deck = FS_CARDS.combatDeck(R, st, seat);
                const names = shuffled(rnd, deck.upgradePile().slice());
                for (const name of names) {
                    const card = FS_CATALOG.card('combat', p.faction, name);
                    if (!card || card.kl > cl || R.cardPrice(st, seat, card) > p.materiel) continue;
                    return { seat, cmd: { type: 'buyUpgrade', kind: 'combat', card: name }, must: false, label: 'buyUpgrade(combat)',
                        onOk: () => { this.stats.combatUpgrades++; } };
                }
            }
            const pile = shuffled(rnd, (p.decks && p.decks.upgradeOrder) || []);
            for (const name of pile) {
                const card = FS_CATALOG.card('orders', p.faction, name);
                if (!card || card.kl > cl || R.cardPrice(st, seat, card) > p.materiel) continue;
                return { seat, cmd: { type: 'buyUpgrade', kind: 'order', card: name }, must: false, label: 'buyUpgrade(order)',
                    onOk: () => { this.stats.orderUpgrades++; } };
            }
        }
        return { seat, cmd: { type: 'finishStrategize' }, must: true, label: 'finishStrategize' };
    }

    dominate(st, seat, order) {
        const rnd = this.rnd;
        const tally = OrderTally.of(order);
        if (tally.prosperity > 0) {
            const player = R.player(st, seat);
            const kinds = ['forge', 'cache', 'reinforcement'].filter(k => player.hasRoomFor(k));
            if (kinds.length && chance(rnd, 0.8)) {
                return { seat, cmd: { type: 'takeProsperity', asset: pick(rnd, kinds) }, must: false, label: 'takeProsperity',
                    onOk: () => { this.stats.prosperity++; } };
            }
        }
        return { seat, cmd: { type: 'finishDominate', skip: chance(rnd, 0.2) }, must: true, label: 'finishDominate' };
    }

    refresh(st) {
        const rnd = this.rnd;
        if (!st.event) return { seat: st.turn, cmd: { type: 'nextPhase' }, must: true, label: 'nextPhase' };
        const seat = st.event.seat;
        if (st.eventsLeft <= 0) return { seat, cmd: { type: 'nextPhase' }, must: true, label: 'nextPhase' };
        if (!st.event.stormMoved) {
            const opts = R.stormOptions(st, seat);
            if (opts.length) {
                const o = pick(rnd, opts);
                return { seat, cmd: { type: 'moveStorm', storm: o.storm, dir: o.dir }, must: true, label: 'moveStorm', onOk: () => { this.stats.storms++; } };
            }
        }
        if ((st.event.drawn || []).length && !st.event.chosen) {
            return { seat, cmd: { type: 'drawEvent', card: pick(rnd, st.event.drawn) }, must: true, label: 'drawEvent' };
        }
        return { seat, cmd: { type: 'resolveEvent' }, must: true, label: 'resolveEvent', onOk: () => { this.stats.events++; } };
    }

    /** Один шаг боя: как в проходе клиента, но с выбором по жребию. */
    combat(st) {
        const rnd = this.rnd;
        const c = st.combat;
        const turn = CombatTurn.of(c);
        const step = turn.step;
        const sideOf = s => (s.endsWith('attacker') ? 'attacker' : 'defender');
        if (step === 'reinforce-attacker' || step === 'reinforce-defender') {
            const side = sideOf(step);
            const seat = CombatSides.seatOf(c, side);
            const max = R.maxReinforce(st, seat, side);
            const count = max > 0 ? Math.floor(rnd() * (max + 1)) : 0;
            return { seat, tries: [{ type: 'combat', action: 'reinforce', count }, { type: 'combat', action: 'reinforce', count: 0 }], must: true, label: 'reinforce',
                onOk: () => { this.stats.reinforcements += count; } };
        }
        if (step === 'choose-attacker' || step === 'choose-defender') {
            const side = sideOf(step);
            const seat = CombatSides.seatOf(c, side);
            const hand = (c.cards[side] && c.cards[side].hand) || [];
            if (!hand.length) { R.advanceCombatSteps(st); return { advanced: true }; }
            const index = Math.floor(rnd() * hand.length);
            return { seat, cmd: { type: 'combat', action: 'playCard', index }, must: true, label: 'playCard', onOk: () => { this.stats.cardsPlayed++; } };
        }
        if (step === 'damage-attacker' || step === 'damage-defender') {
            const side = sideOf(step);
            const seat = ctx.CombatHooks.of(c).assignSeat(CombatSides.seatOf(c, side));
            const ids = shuffled(rnd, R.damageCandidates(st, side).map(x => x.id));
            return { seat, tries: [{ type: 'combat', action: 'damage', targets: ids }, { type: 'combat', action: 'damage', targets: R.damageCandidates(st, side).map(x => x.id) }],
                must: true, label: 'damage' };
        }
        if (step === 'retreat') {
            const loser = c.loser;
            const targets = R.retreatTargets(st, loser);
            const t = pick(rnd, targets);
            return { seat: loser, cmd: { type: 'combat', action: 'retreat', target: t }, must: true, label: 'retreat', onOk: () => { this.stats.retreats++; } };
        }
        R.advanceCombatSteps(st);
        return { advanced: true };
    }
}

// --- инварианты состояния ----------------------------------------------------
function invariants(st) {
    const problems = [];
    for (const p of st.players) {
        if (!(p.materiel >= 0)) problems.push(p.name + ': материя ' + p.materiel);
        const player = R.player(st, p.seat);
        for (const kind of ['forge', 'cache', 'reinforcement']) {
            const have = p.assets[kind] || 0;
            if (have < 0 || have > player.assetLimit(kind)) problems.push(p.name + ': жетонов ' + kind + ' ' + have + ' при пределе ' + player.assetLimit(kind));
        }
        const faction = R.faction(st, p.seat);
        for (const def of faction.units) {
            const onBoard = st.units.filter(u => u.seat === p.seat && u.unit === def.id && !u.reinforcementCombat).length;
            const supply = p.supply.units[def.id] || 0;
            if (onBoard + supply > (def.max || 0)) problems.push(p.name + ': ' + def.name + ' на доске ' + onBoard + ' + в запасе ' + supply + ' > ' + def.max);
            if (supply < 0) problems.push(p.name + ': запас ' + def.name + ' отрицательный');
        }
    }
    for (const u of st.units) {
        const sys = R.system(st, u.system);
        const area = sys && sys.areas.find(a => a.pos === u.area);
        if (!area) { problems.push('отряд ' + u.id + ' вне доски: ' + u.system + '/' + u.area); continue; }
        const def = R.unitOf(st, u);
        if (def && def.type === 'ship' && area.world) problems.push('корабль ' + u.id + ' стоит на мире ' + u.system + '/' + u.area);
        if (def && def.type !== 'ship' && !area.world) problems.push('наземный отряд ' + u.id + ' стоит в пустоте ' + u.system + '/' + u.area);
    }
    for (const s of st.structures) {
        const sys = R.system(st, s.system);
        const area = sys && sys.areas.find(a => a.pos === s.area);
        if (!area || !area.world) problems.push('постройка ' + s.id + ' не на мире: ' + s.system + '/' + s.area);
    }
    for (const type of Object.keys(R.STRUCTURE_POOL || {})) {
        const used = st.structures.filter(x => x.type === type).length;
        if (used > R.STRUCTURE_POOL[type]) problems.push('построек «' + type + '» на доске ' + used + ' при ' + R.STRUCTURE_POOL[type] + ' в коробке');
    }
    for (const p of st.players) {
        if (R.player(st, p.seat).structureTokensLeft() < 0) problems.push(p.name + ': жетонов контроля построек меньше нуля');
    }
    if (!st.combat) {
        for (const u of st.units) if (u.reinforcementCombat) problems.push('жетон подкрепления ' + u.id + ' остался на доске после боя');
    }
    const ids = new Set();
    for (const u of st.units) { if (ids.has(u.id)) problems.push('два отряда с id ' + u.id); ids.add(u.id); }
    for (const x of st.structures) { if (ids.has(x.id)) problems.push('два объекта с id ' + x.id); ids.add(x.id); }
    return problems;
}

/** Строки журнала, в которых проступил код: undefined, NaN, [object Object]. */
let logSeen = 0;
function logSanity(st) {
    const log = st.log || [];
    const bad = [];
    for (let i = Math.max(0, log.length - 50); i < log.length; i++) {
        const text = String(log[i].text);
        if (/undefined|NaN|\[object Object\]|\bnull\b/.test(text)) bad.push(text);
    }
    return bad;
}

// --- партия -------------------------------------------------------------------
function newStats() {
    return { commands: 0, questions: 0, orders: 0, moves: 0, marchesIntoEnemy: 0, battles: 0, combatRounds: 0, cardsPlayed: 0,
        reinforcements: 0, retreats: 0, strikes: 0, unitsBought: 0, structuresBought: 0, combatUpgrades: 0, orderUpgrades: 0,
        upgradesUsed: 0, prosperity: 0, events: 0, storms: 0, trims: 0, eventTokens: 0, refusals: 0, schemes: 0 };
}

function playGame(players, seed, rounds, run) {
    const rnd = rngOf(seed + '|' + players.map(p => p.faction).join('+'));
    const stats = newStats();
    const bot = new Bot(rnd, stats);
    const interactive = ((Number(seed) | 0) % 2) === 1;
    let st = R.newGame({ seed: (Number(seed) | 0) || 1, players, interactiveSetup: interactive });
    const refusals = {};
    const describe = (label, extra) => label + ' · раунд ' + st.round + ' · ' + st.phase + (st.order ? ' · ' + st.order.order + ':' + (st.order.phase || PhasePlan.of(st.order).phase || '') : '')
        + (st.combat ? ' · бой:' + CombatTurn.of(st.combat).step : '') + (extra ? ' · ' + extra : '');
    const fail = (message, snapshot) => {
        const failure = new GameFailure(describe(message), snapshot);
        failure.log = (st.log || []).slice(-30).map(l => (l.seat >= 0 ? l.seat + ': ' : '') + l.text);
        failure.state = st;
        throw failure;
    };
    const roundtrip = () => {
        try { st = JSON.parse(JSON.stringify(st)); } catch (e) { fail('состояние не переживает JSON: ' + (e && e.message), null); }
        if (run) run.st = st;
    };
    if (run) run.st = st;
    const check = last => {
        const problems = invariants(st);
        if (problems.length) fail('инвариант: ' + problems.join('; '), { last });
        const bad = logSanity(st);
        if (bad.length) fail('в журнале проступил код: ' + bad.join(' | '), { last });
    };
    const apply = (seat, cmd) => {
        stats.commands++;
        const res = R.apply(st, seat, cmd);
        if (!res) fail('команда ' + cmd.type + ' не вернула ответа', cmd);
        if (res.ok === false && CRASH.test(String(res.error || ''))) fail('команда ' + cmd.type + ' упала: ' + res.error, cmd);
        return res;
    };
    let lastHash = '', same = 0, steps = 0;
    let inCombat = false, combatRound = 0;
    const MAX = 40000;
    while (steps++ < MAX) {
        if (st.over || GameOutcome.of(st).over) break;
        if (st.round > rounds) break;
        // Застревание: одно и то же состояние много команд подряд.
        const hash = JSON.stringify([st.round, st.phase, st.turn, st.order, st.pending, st.combat && [st.combat.round, st.combat.step, st.combat.dice, st.combat.tokens], st.strike, st.trim, st.event, st.units.length, st.players.map(p => [p.materiel, p.assets])]);
        if (hash === lastHash) { if (++same > 60) fail('партия стоит на месте', { pending: st.pending, order: st.order, combat: st.combat && st.combat.step }); }
        else { lastHash = hash; same = 0; }
        if (st.combat) {
            const r = CombatTurn.of(st.combat).round || 1;
            if (!inCombat) { inCombat = true; combatRound = r; stats.battles++; stats.combatRounds++; }
            else if (r > combatRound) { combatRound = r; stats.combatRounds++; }
        } else inCombat = false;
        const step = bot.next(st);
        if (!step) {
            if (st.over || GameOutcome.of(st).over) break;
            fail('боту нечего делать', { phase: st.phase, pending: st.pending });
        }
        if (step.question) {
            const q = st.pending.question || {};
            const seat = answerSeat(st);
            const answers = answersFor(rnd, st, q);
            let done = false, lastError = '', index = 0;
            const errors = [];
            for (const answer of answers) {
                const res = apply(seat, { type: 'effect', answer });
                if (res.ok !== false) { done = true; break; }
                lastError = res.error || '';
                errors.push(lastError);
                index++;
            }
            if (!done) fail('вопрос «' + (q.kind || '?') + ':' + (q.op || '?') + '» не принял ни одного ответа: ' + lastError, { question: q, answers });
            noteQuestion(q, index, errors);
            stats.questions++;
            if (q.kind === 'scheme') stats.schemes++;
            roundtrip();
            check({ type: 'effect', question: q.kind + ':' + q.op });
            continue;
        }
        if (step.combat) {
            const before = st.combat.round + '|' + CombatTurn.of(st.combat).step;
            const move = bot.combat(st);
            if (move.advanced) {
                if (st.combat && st.combat.round + '|' + CombatTurn.of(st.combat).step === before && !st.pending) fail('бой застрял на шаге ' + before, st.combat);
                roundtrip();
                continue;
            }
            const tries = move.tries || [move.cmd];
            let done = false, lastError = '';
            for (const cmd of tries) {
                const res = apply(move.seat, cmd);
                if (res.ok !== false) { done = true; if (move.onOk) move.onOk(); break; }
                lastError = res.error || '';
            }
            if (!done) fail('шаг боя «' + move.label + '» отвергнут: ' + lastError, { tries, combat: st.combat });
            roundtrip();
            check(tries[0]);
            continue;
        }
        const tries = step.tries || [step.cmd];
        let done = false, lastError = '';
        for (const cmd of tries) {
            const res = apply(step.seat, cmd);
            if (res.ok !== false) { done = true; if (step.onOk) step.onOk(); break; }
            lastError = res.error || '';
        }
        if (!done) {
            if (step.fallback) {
                const res = apply(step.seat, step.fallback);
                if (res.ok !== false) done = true; else lastError = res.error || lastError;
            }
        }
        if (!done) {
            if (step.must) fail('команда «' + (step.label || tries[0].type) + '» отвергнута: ' + lastError, { tries, order: st.order, pending: st.pending });
            stats.refusals++;
            const key = (step.label || tries[0].type) + ': ' + lastError;
            refusals[key] = (refusals[key] || 0) + 1;
        }
        roundtrip();
        check(tries[0]);
    }
    if (steps >= MAX) fail('партия не доходит до конца за ' + MAX + ' шагов', null);
    return { st, stats, steps, refusals, interactive };
}

/** Партия с журналом при любом падении — и бота, и движка. */
function playGameLogged(players, seed, rounds) {
    const run = { st: null };
    try {
        return playGame(players, seed, rounds, run);
    } catch (e) {
        if (e && !e.log && run.st) {
            e.log = (run.st.log || []).slice(-30).map(l => (l.seat >= 0 ? l.seat + ': ' : '') + l.text);
            e.state = run.st;
        }
        throw e;
    }
}

// --- расписание ---------------------------------------------------------------
function schedule() {
    const list = FACTIONS.slice();
    const games = [];
    const seeds = SEED ? [SEED] : Array.from({ length: GAMES }, (_, i) => String(i + 1));
    if (VS) {
        const factions = VS.split(',').map(x => x.trim()).filter(Boolean);
        for (const f of factions) if (!list.includes(f)) throw new Error('нет фракции «' + f + '»; есть: ' + list.join(', '));
        return seeds.map(seed => ({ name: factions.join(' против '), factions, seed }));
    }
    // Соперники меняются от сида к сиду: за несколько сидов каждая фракция
    // встречается с каждой, и за столом на четверых соседи тоже разные.
    const n = list.length;
    seeds.forEach((seed, si) => {
        for (let i = 0; i < n; i++) {
            for (const k of [1 + si, 5 + 2 * si, 7 + 3 * si]) {
                const foe = list[(i + k) % n];
                if (foe === list[i]) continue;
                games.push({ name: list[i] + ' против ' + foe, factions: [list[i], foe], seed });
            }
        }
        const turned = list.slice(si % n).concat(list.slice(0, si % n));
        const step = 1 + (si % 3);
        for (let t = 0; t < 3; t++) {
            const four = [0, 1, 2, 3].map(j => turned[(t * 4 + j * step) % n]);
            if (new Set(four).size < 4) continue;
            games.push({ name: 'стол: ' + four.join(', '), factions: four, seed });
        }
    });
    const seen = new Set();
    const unique = games.filter(g => { const key = g.factions.join('+') + '|' + g.seed; if (seen.has(key)) return false; seen.add(key); return true; });
    return ONLY ? unique.filter(g => g.factions.includes(ONLY)) : unique;
}

const started = Date.now();
console.log('\n' + C.cyn + C.b + '  Forbidden Stars' + C.r + ' ' + C.dim + '— партии ботов: ' + FACTIONS.length + ' фракций, до ' + ROUNDS + ' раундов' + C.r + '\n');
const failed = [];
const perFaction = {};
for (const f of FACTIONS) perFaction[f] = { games: 0, battles: 0, cards: 0, events: 0, upgradesUsed: 0, strikes: 0, questions: 0 };
const total = newStats();
let played = 0;
for (const game of schedule()) {
    const players = game.factions.map((faction, i) => ({ faction, name: 'P' + i + ' ' + (FS_CATALOG.faction(faction) || {}).name, id: 'p' + i }));
    const tag = game.name + ', сид ' + game.seed;
    try {
        const { st, stats, refusals, interactive } = playGameLogged(players, game.seed, ROUNDS);
        played++;
        for (const k of Object.keys(total)) total[k] += stats[k] || 0;
        for (const f of game.factions) {
            const pf = perFaction[f];
            pf.games++; pf.battles += stats.battles; pf.cards += stats.cardsPlayed; pf.events += stats.events;
            pf.upgradesUsed += stats.upgradesUsed; pf.strikes += stats.strikes; pf.questions += stats.questions;
        }
        const end = st.over || GameOutcome.of(st).over ? 'партия окончена' + (st.winner !== null && st.winner !== undefined ? ', победил ' + (st.players[st.winner] ? st.players[st.winner].name : st.winner) : '')
            : 'сыграно раундов: ' + (st.round - 1);
        console.log('  ' + C.grn + 'ok  ' + C.r + tag + C.dim + ' — ' + end + '; команд ' + stats.commands + ', боёв ' + stats.battles
            + ' (раундов боя ' + stats.combatRounds + ', карт ' + stats.cardsPlayed + '), ударов ' + stats.strikes + ', покупок ' + (stats.unitsBought + stats.structuresBought)
            + ', улучшений ' + (stats.combatUpgrades + stats.orderUpgrades) + '/' + stats.upgradesUsed + ', событий ' + stats.events + ', вопросов ' + stats.questions + C.r);
        if (VERBOSE) {
            console.log('       ' + C.dim + (interactive ? 'сборка карты вручную; ' : 'карта готовая; ') + JSON.stringify(stats) + C.r);
            for (const l of (st.log || []).filter(l => /выбывает|Игра закончена|собирает маркер цели|цели собраны/.test(l.text)).slice(-6)) console.log('       ' + C.dim + '  журнал: ' + l.text + C.r);
            if (LOG) for (const l of st.log || []) console.log('       ' + C.dim + '  | ' + (l.seat >= 0 ? l.seat + ': ' : '') + l.text + C.r);
            for (const k of Object.keys(refusals).sort((a, b) => refusals[b] - refusals[a])) console.log('       ' + C.dim + '  отказ ×' + refusals[k] + ' ' + k + C.r);
        }
    } catch (e) {
        failed.push({ tag, error: e && e.message, snapshot: e && e.snapshot });
        console.log('  ' + C.red + 'FAIL' + C.r + ' ' + tag + '\n       ' + C.red + (e && e.message) + C.r);
        if (e && e.snapshot !== undefined && e.snapshot !== null) console.log('       ' + C.dim + String(JSON.stringify(e.snapshot)).slice(0, 700) + C.r);
        if (VERBOSE && e && e.stack && !(e instanceof GameFailure)) console.log('       ' + C.dim + e.stack.split('\n').slice(1, 6).join('\n       ') + C.r);
        if (VERBOSE && e && e.log) for (const line of e.log) console.log('       ' + C.dim + '  | ' + line + C.r);
        if (LOG && e && e.state) {
            const dumpPath = '/tmp/fs-play-fail-' + (failed.length) + '.json';
            fs.writeFileSync(dumpPath, JSON.stringify(e.state, null, 1));
            console.log('       ' + C.dim + 'состояние сохранено: ' + dumpPath + C.r);
        }
    }
}

console.log('\n' + C.b + '  Фракции' + C.r);
for (const f of FACTIONS) {
    const pf = perFaction[f];
    if (!pf.games) continue;
    console.log('  ' + C.dim + f.padEnd(20) + C.r + ' партий ' + String(pf.games).padStart(2) + ', боёв ' + String(pf.battles).padStart(3)
        + ', карт боя ' + String(pf.cards).padStart(4) + ', событий ' + String(pf.events).padStart(3) + ', улучшений применено ' + String(pf.upgradesUsed).padStart(3)
        + ', ударов ' + String(pf.strikes).padStart(3) + ', вопросов ' + String(pf.questions).padStart(4));
}
if (VERBOSE) {
    console.log('\n' + C.b + '  Вопросы карт' + C.r + C.dim + ' (вид:операция — всего / принят первый ответ / принят запасной; частые отказы)' + C.r);
    for (const key of Object.keys(QUESTIONS).sort((a, b) => QUESTIONS[b].total - QUESTIONS[a].total)) {
        const r = QUESTIONS[key];
        const errs = Object.keys(r.errors).sort((a, b) => r.errors[b] - r.errors[a]).slice(0, 2).map(e => '«' + e + '»×' + r.errors[e]).join(', ');
        console.log('  ' + (r.fallback > r.first ? C.yel : C.dim) + key.padEnd(34) + C.r + String(r.total).padStart(5) + String(r.first).padStart(6) + String(r.fallback).padStart(6) + (errs ? '  ' + C.dim + errs + C.r : ''));
    }
}
const secs = ((Date.now() - started) / 1000).toFixed(1);
console.log('\n  ' + C.dim + 'Всего: партий ' + played + ', команд ' + total.commands + ', боёв ' + total.battles + ', карт боя ' + total.cardsPlayed
    + ', ударов ' + total.strikes + ', покупок ' + (total.unitsBought + total.structuresBought) + ', событий ' + total.events + ', вопросов ' + total.questions
    + ', отказов правил ' + total.refusals + '; ' + secs + ' с' + C.r);
if (failed.length) {
    console.log('\n' + C.red + C.b + '  Не прошло: ' + failed.length + ' из ' + (played + failed.length) + C.r);
    for (const f of failed) console.log('   — ' + f.tag + ': ' + f.error);
    console.log('');
    process.exit(1);
}
console.log('\n' + C.grn + C.b + '  Все партии сыграны: ' + played + '.' + C.r + '\n');
