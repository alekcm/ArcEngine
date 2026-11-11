// ============================================================================
//  fs-walk.mjs — партия целиком, глазами клиента
// ----------------------------------------------------------------------------
//  node tools/fs-walk.mjs            все сценарии
//  node tools/fs-walk.mjs --seed=3   только один сид
//
//  Зачем это, если есть 280 проверок правил и 23 проверки экрана.
//
//  Правила проверены по одному, экраны — по одному. А игра ломается на стыке:
//  состояние перешло в новую фазу, и панель клиента упала; кнопка нарисована,
//  а нажатие роняет клиент; панель собралась, но пустая — игроку нечего делать.
//  Так нашлись камера, ширина правого низа и JSON-круг: все три не в правилах,
//  а на стыке, и ни один старый гейт их не видел.
//
//  Здесь партия проходится как автомат: на КАЖДОМ шаге, до и после команды,
//  собираются все панели клиента и проверяется, что
//    * ни одна не бросила исключение;
//    * у каждой кнопки есть обработчик;
//    * нажатие кнопки не роняет клиент;
//    * в фазе, где игрок должен что-то делать, нарисована хоть одна кнопка;
//    * состояние после каждой команды пересылается через JSON, как на сервере.
// ============================================================================
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import url from 'node:url';
import { createEngineContext } from './fs-engine.mjs';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const C = { r: '\x1b[0m', b: '\x1b[1m', dim: '\x1b[2m', red: '\x1b[31m', grn: '\x1b[32m', yel: '\x1b[33m' };
const seedArg = (process.argv.find(a => a.startsWith('--seed=')) || '').split('=')[1];
const seeds = seedArg ? [seedArg] : ['1', '2'];
// Фильтр проверок — позиционный аргумент, как в fs-screens.mjs: нужен
// мутационной таблице, чтобы ломать одну проверку, а не весь проход.
const filter = process.argv.slice(2).find(a => !a.startsWith('--')) || '';

let done = 0;
const failed = [];
function check(name, fn) {
    if (filter && !name.toLowerCase().includes(filter.toLowerCase())) return;
    done++;
    try {
        const why = fn();
        if (why && why !== true) {
            failed.push({ name, why: String(why) });
            console.log('  ' + C.red + 'FAIL' + C.r + ' ' + name + '\n       ' + C.red + why + C.r);
        } else {
            console.log('  ' + C.grn + 'ok  ' + C.r + C.dim + name + C.r);
        }
    } catch (e) {
        failed.push({ name, why: e && e.message });
        console.log('  ' + C.red + 'FAIL' + C.r + ' ' + name + '\n       ' + C.red + (e && e.message) + C.r);
        if (process.env.WALK_STACK && e && e.stack) console.log('       ' + C.dim + e.stack.split('\n').slice(1, 6).join('\n       ') + C.r);
    }
}

const nothing = () => undefined;

// --- клиент в node-заглушке -------------------------------------------------
function el(tag) {
    const node = {
        tagName: String(tag || 'div').toUpperCase(), children: [], className: '', id: '', textContent: '',
        title: '', type: '', value: '', maxLength: 0, disabled: false,
        style: { setProperty: nothing, removeProperty: nothing },
        classList: { add: nothing, remove: nothing, toggle: nothing, contains: () => false },
        append(...xs) { for (const x of xs) this.children.push(x); },
        appendChild(x) { this.children.push(x); return x; },
        replaceChildren(...xs) { this.children = xs; },
        remove: nothing, setAttribute: nothing, getAttribute: () => null,
        addEventListener: nothing, removeEventListener: nothing, focus: nothing, blur: nothing,
        getContext: () => null, getBoundingClientRect: () => ({ width: 0, height: 0, left: 0, top: 0 }),
        querySelector: () => null, querySelectorAll: () => [],
    };
    Object.defineProperty(node, 'childNodes', { get() { return this.children; } });
    return node;
}

const ctx = createEngineContext();
Object.assign(ctx, {
    document: Object.assign(ctx.document || {}, {
        body: el('body'), documentElement: el('html'), createElement: el,
        getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener: nothing,
    }),
    window: null, innerWidth: 1400, innerHeight: 900, IS_MOBILE: false,
    localStorage: { getItem: () => null, setItem: nothing, removeItem: nothing },
    navigator: { userAgent: 'walk', clipboard: null },
    requestAnimationFrame: () => 0, performance: { now: () => 0 },
    FS_TILE_PX: 260, FS_CAMERA_ZOOM: 0.62, FS_CAMERA_PITCH_DEG: 62,
    setInterval: nothing, clearInterval: nothing,
    BABYLON: (() => {
        const mesh = () => ({
            isPickable: true, isVisible: true, material: null,
            position: { x: 0, y: 0, z: 0, set: nothing },
            rotation: { x: 0, y: 0, z: 0, set: nothing },
            scaling: { x: 1, y: 1, z: 1, set: nothing },
            setEnabled: nothing, isEnabled: () => true, dispose: nothing,
        });
        return {
            Vector3: function (x, y, z) { this.x = x; this.y = y; this.z = z; },
            Color3: function () {},
            StandardMaterial: function () { this.emissiveColor = null; this.diffuseColor = null; this.disableLighting = false; },
            MeshBuilder: new Proxy({}, { get: () => (...a) => mesh() }),
            Mesh: { DOUBLESIDE: 0 },
        };
    })(),
});
ctx.addEventListener = nothing;
ctx.removeEventListener = nothing;
ctx.window = ctx;
ctx.UI = { root: null, get: () => null, def: () => ({}), init: nothing, add: nothing, set: nothing, removeAll: nothing, text: nothing, show: nothing };
ctx.Store = { get: () => '', set: nothing, del: nothing };

for (const file of ['js/CameraControl.js', 'js/fs/FSIcons.js', 'js/fs/FSView.js', 'js/fs/FSUI.js', 'js/fs/FSGame.js']) {
    try {
        vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), ctx, { filename: file });
    } catch (e) {
        console.log('  ' + C.yel + 'предупреждение' + C.r + ' ' + file + ': ' + e.message);
    }
}

const FSUI = vm.runInContext('FSUI', ctx);
const FS_RULES = vm.runInContext('FS_RULES', ctx);
const FS_GAME = vm.runInContext('FSGame', ctx);
const SEAT = vm.runInContext('Seat', ctx);
const GAME_PHASE = vm.runInContext('GamePhase', ctx);
const ORDER_CONTEXT = vm.runInContext('OrderContext', ctx);
const PHASE_PLAN = vm.runInContext('PhasePlan', ctx);
const BOARD_SETUP = vm.runInContext('BoardSetup', ctx);
FSUI.modernRoot = el();

const PANELS = [
    'panelSetup', 'panelPlanning', 'panelOperations', 'panelRefresh', 'panelAdvance', 'panelDeploy',
    'panelGuardDeploy', 'panelStrategize', 'panelDominate', 'panelCombat', 'panelQuestion',
    'panelTrim', 'panelStrikeDamage', 'panelTestBattle',
];

/** Клиент на состоянии: тот же класс, что в браузере, без сети и без canvas. */
function clientFor(state) {
    const game = Object.create(FS_GAME.prototype);
    game.state = state;
    // Вид-пустышка: колец нет, поэтому рисование — пустой цикл, а логика
    // подсветки (какие области выбрать) выполняется по-настоящему.
    game.view = { metrics: null, highlights: [], selection: [], selectionRings: [] };
    game.app = {
        location: { width: 1400, height: 900, terrain: { heightAt: () => 0 } },
        camera: { azimuth: -Math.PI / 2 },
    };
    // Те же поля, что ставит конструктор FSGame, — панель вправе читать любое.
    game.mode = 'idle';
    game.pending = null;
    game.lastCard = null;
    game.damageTargets = [];
    game.hand = [];
    game.status = '';
    game.warn = '';
    game.overflow = null;
    game.deployOverflow = null;
    game.trimPick = [];
    game.selected = [];
    game.moveKind = null;
    game.hover = null;
    game.hoverAt = 0;
    game.plaque = null;
    game.name = '';
    game.faction = '';
    game.lobby = { code: '', players: [], factions: [], started: false };
    game.invites = [];
    game.palette = null;
    game.testMode = 'game';
    game.battle = { kind: 'ground', units: {}, cards: [] };
    game.room = '';
    game.id = '';
    game.effectPick = [];
    game.effectDie = null;
    game.orderKey = '';
    game.reinforcePick = 0;
    game.reinforceStep = null;
    game.pendingQuestionRef = null;
    game.questionMarkersActive = false;
    game.strikeTargets = null;
    game.autoReinforced = null;
    game.deployOpts = { cache: false, forgeKl: false };
    game.net = { cmd: nothing, undo: nothing, on: nothing };
    return game;
}

// --- классы видов, нужные развилке ------------------------------------------
const GAME_OUTCOME = vm.runInContext('GameOutcome', ctx);
const BATTLE_TEST = vm.runInContext('BattleTest', ctx);
const BOARD = vm.runInContext('Board', ctx);
const STRIKE_DAMAGE = vm.runInContext('StrikeDamage', ctx);
const FS_CATALOG = vm.runInContext('FS_CATALOG', ctx);

/** Какие из 14 панелей хоть раз отработали. Пустая панель в гейте — провал. */
const covered = new Set();

/**
 * Всё нажимаемое панели: шесть списков, каждый из которых FSUI рисует
 * настоящими кнопками (actions, leftActions, cardChoices, upgrades, hand,
 * battleHand). Считается из ctx, а не из DOM: в дереве всегда есть служебные
 * кнопки («Отменить ход», участники), и счёт по DOM пустоту не видит никогда.
 */
function pressables(ctxPanel) {
    const out = [];
    const take = (list) => {
        for (const a of list || []) {
            if (a && typeof a.onClick === 'function' && a.enabled !== false) out.push(a);
        }
    };
    take(ctxPanel.actions);
    take(ctxPanel.leftActions);
    take(ctxPanel.cardChoices);
    if (ctxPanel.upgrades) {
        take(ctxPanel.upgrades.combat);
        take(ctxPanel.upgrades.order);
    }
    take(ctxPanel.hand);
    take(ctxPanel.battleHand);
    return out;
}

/**
 * Экран клиента на этом состоянии — те же вызовы панелей, что делает
 * FSGame.refresh(), с теми же условиями. Панель рисуется на ВИДЕ места
 * (FS_RULES.view — то же, что сервер шлёт клиенту: рука тайлов, варианты
 * целей, маскировка чужих карт), а не на сыром состоянии. Ветка 3D (кольца,
 * табличка, камера) здесь не выполняется: без браузера её нет, и это
 * названо честно. Возвращает собранный контекст панели.
 */
function renderFork(state, seat, label) {
    const view = FS_RULES.view(state, seat);
    const game = clientFor(view);
    const call = (name) => { covered.add(name); game[name](view, ctxPanel); };
    const ctxPanel = {
        title: '', text: '', status: '', warn: '', actions: [], mode: 'idle',
        setupCellSelected: false, compass: 0, battle: null, tokens: null, hand: null,
    };
    const s = view;
    const me = SEAT.of(s).me;
    try {
        if (s.pending) {
            if (s.combat) call('panelCombat');
            call('panelQuestion');
            if (s.combat) { ctxPanel.battleHand = game.hand || []; if (!ctxPanel.battle) ctxPanel.battle = null; }
        } else if (FS_RULES.trimQueue(s).blocked(me)) {
            call('panelTrim');
        } else if (STRIKE_DAMAGE.of(s).pending) {
            if (STRIKE_DAMAGE.of(s).waiting(me)) call('panelStrikeDamage');
            else { ctxPanel.title = 'Орбитальный удар'; ctxPanel.text = 'Защитник распределяет урон.'; }
        } else if (GAME_OUTCOME.of(s).over) {
            ctxPanel.title = 'Игра окончена';
            ctxPanel.text = GAME_OUTCOME.of(s).headline(seat2 => (s.players[seat2] ? s.players[seat2].name : '—'));
            ctxPanel.status = '';
        } else if (BATTLE_TEST.of(s).active && !s.combat) {
            call('panelTestBattle');
        } else if (BATTLE_TEST.of(s).active) {
            // Бой идёт: ниже рисуется только панель боя.
        } else if (s.phase === 'setup') {
            call('panelSetup');
        } else if (s.phase === 'planning') {
            call('panelPlanning');
        } else if (s.phase === 'operations') {
            call('panelOperations');
        } else if (s.phase === 'refresh') {
            call('panelRefresh');
        }
        if (s.order && ORDER_CONTEXT.of(s.order).isSeat(me) && !BATTLE_TEST.of(s).active) {
            if (ORDER_CONTEXT.of(s.order).isKind('advance')) call('panelAdvance');
            if (PHASE_PLAN.of(s.order).is('guardDeploy')) call('panelGuardDeploy');
            else if (ORDER_CONTEXT.of(s.order).isKind('deploy')) call('panelDeploy');
            else if (ORDER_CONTEXT.of(s.order).isKind('strategize')) call('panelStrategize');
            else if (ORDER_CONTEXT.of(s.order).isKind('dominate')) call('panelDominate');
        }
        if (s.phase === 'operations' && s.players[me]) {
            for (const u of (s.players[me].upgrades || []).filter(x => !x.used)) {
                const c = FS_CATALOG.card('orders', s.players[me].faction, u.name);
                const kind = u.order || (c && c.order);
                const right = !kind || (s.order && ORDER_CONTEXT.of(s.order).isSeat(me)
                    && (kind === 'orbital' ? PHASE_PLAN.of(s.order).is('strike') : ORDER_CONTEXT.of(s.order).isKind(kind)));
                if (!right) continue;
                ctxPanel.actions.push({
                    label: 'Применить улучшение: ' + u.name,
                    onClick: () => game.net.cmd({ type: 'useUpgrade', card: u.name }),
                });
            }
        }
        if (s.combat) call('panelCombat');
        ctxPanel.battleHand = game.hand || [];
        if (!s.combat) ctxPanel.battle = null;
        ctxPanel.mode = game.mode;
    } catch (e) {
        const inner = process.env.WALK_STACK && e && e.stack ? '\n       ' + C.dim + 'внутри: ' + e.stack.split('\n').slice(0, 5).join('\n       ') + C.r : '';
        throw new Error('шаг «' + label + '», место ' + seat + ': панель упала: ' + (e && e.message) + inner);
    }
    for (const action of (ctxPanel.actions || []).concat(ctxPanel.leftActions || [])) {
        if (action && action.onClick !== undefined && typeof action.onClick !== 'function') {
            throw new Error('шаг «' + label + '»: у действия «' + (action.label || action.kind) + '» onClick не функция');
        }
    }
    try {
        FSUI.update(s, ctxPanel);
    } catch (e) {
        const inner = process.env.WALK_STACK && e && e.stack ? '\n       ' + C.dim + 'внутри: ' + e.stack.split('\n').slice(0, 5).join('\n       ') + C.r : '';
        throw new Error('шаг «' + label + '», место ' + seat + ': экран упал: ' + (e && e.message) + inner);
    }
    return ctxPanel;
}

/** В этой фазе у этого места обязана быть хоть одна кнопка. */
function needsButtons(state, seat) {
    if (state.over || GAME_OUTCOME.of(state).over) return false;
    if (state.pending) {
        const must = state.pending.answerSeat === undefined ? state.pending.seat : state.pending.answerSeat;
        return must === seat;
    }
    if (FS_RULES.trimQueue(state).blocked(seat)) return true;
    if (STRIKE_DAMAGE.of(state).pending) return STRIKE_DAMAGE.of(state).waiting(seat);
    if (BATTLE_TEST.of(state).active) return !state.combat; // «Ещё бой»
    if (state.phase === 'setup') {
        const board = BOARD_SETUP.of(state);
        if (!board.active || board.turn !== seat) return false;
        // Стадия штормов начинается кликом по доске — у свежей панели кнопок
        // нет по замыслу; стороны после выбора системы проверяются отдельно.
        if (board.stage === BOARD_SETUP.STORMS) return false;
        return true;
    }
    if (state.phase === 'planning') return GAME_PHASE.of(state).isTurn(seat);
    if (state.phase === 'operations') {
        if (!state.order) return GAME_PHASE.of(state).isTurn(seat);
        return ORDER_CONTEXT.of(state.order).isSeat(seat);
    }
    if (state.phase === 'refresh') return !!state.event && state.event.seat === seat;
    return false;
}

// --- автомат ходов: что сервер ждёт прямо сейчас ------------------------------
/**
 * Ответ на вопрос карты — руками клиента. Панель panelQuestion уже знает
 * протокол каждого вида вопроса (какие кнопки, в каком порядке, что шлёт
 * каждая): автомат жмёт её кнопки по порядку, пока одна не пошлёт команду
 * effect. Писать ответы руками для каждого вида — значит продублировать
 * панель и проверять дубликат, а не игру: так проход и вис на вопросе
 * «С какого мира забрать отряды?», отвечая {choice:0} вместо области.
 *
 * Клиент на время вопроса один: выбор в несколько нажатий (отряды, грань
 * кубика) копится в нём, панель перечитывается после каждого нажатия.
 */
function answerViaClient(st) {
    const pending = st.pending;
    const seat = pending.answerSeat === undefined ? pending.seat : pending.answerSeat;
    const q0 = pending.question || {};
    const view = FS_RULES.view(st, seat);
    const game = clientFor(view);
    const sent = [];
    game.net = { cmd: (c) => { sent.push(c); }, undo: nothing, on: nothing };
    game.refresh = nothing;
    const clicked = new Set();
    for (let round = 0; round < 40; round++) {
        const ctxPanel = { title: '', text: '', status: '', warn: '', actions: [], mode: 'idle', setupCellSelected: false };
        game.panelQuestion(view, ctxPanel);
        const actions = (ctxPanel.actions || []).filter(a => a && typeof a.onClick === 'function' && a.enabled !== false);
        const next = actions.findIndex((a, i) => !clicked.has(i + ':' + (a.label || a.kind || '')));
        if (next < 0) break;
        const action = actions[next];
        clicked.add(next + ':' + (action.label || action.kind || ''));
        sent.length = 0;
        action.onClick();
        const effect = sent.find(c => c && c.type === 'effect');
        if (effect) return { seat, cmd: effect };
    }
    throw new Error('вопрос без ответа: kind=' + (q0.kind || '?') + ' op=' + (q0.op || '?')
        + ' seat=' + seat + ' — у панели нет кнопки, посылающей ответ');
}

/**
 * Ветка панели сборки за кликом по доске: система уже выбрана, панель
 * показывает её свободные стороны. Единственное место, где проход
 * подставляет выбор с доски: без него ветка сторон не рисуется никогда.
 * Возвращает null, если стороны выбирать негде.
 */
function stormSidesPanels(st, seat) {
    const sys = st.systems.find(s => FS_RULES.setupStormSides(st, s.id).length);
    if (!sys) return null;
    const view = FS_RULES.view(st, seat);
    const game = clientFor(view);
    const sent = [];
    game.net = { cmd: (c) => { sent.push(c); }, undo: nothing, on: nothing };
    game.refresh = nothing;
    game.mode = 'setupStorm';
    game.pending = { system: sys.id };
    const ctxPanel = {
        title: '', text: '', status: '', warn: '', actions: [], mode: game.mode,
        setupCellSelected: false, compass: 0, battle: null, tokens: null, hand: null,
    };
    covered.add('panelSetup');
    game.panelSetup(view, ctxPanel);
    return { game, view, ctxPanel, sent, sys };
}

/** Один шаг боя вперёд. Возвращает false, если бой кончился. */
function combatStep(st) {
    if (!st.combat) return false;
    if (st.pending) {
        const kind = (st.pending.question || {}).kind || '?';
        const a = answerViaClient(st);
        const res = FS_RULES.apply(st, a.seat, a.cmd);
        if (!res.ok) throw new Error('ответ на вопрос боя не прошёл (' + kind + '): ' + res.error);
        return !!st.combat;
    }
    const co = st.combat;
    if (co.step === 'reinforce-attacker' || co.step === 'reinforce-defender') {
        const seat = co.step === 'reinforce-attacker' ? co.attacker : co.defender;
        FS_RULES.apply(st, seat, { type: 'combat', action: 'reinforce', count: 0 });
    } else if (co.step === 'choose-attacker' || co.step === 'choose-defender') {
        const side = co.step === 'choose-attacker' ? 'attacker' : 'defender';
        const seat = side === 'attacker' ? co.attacker : co.defender;
        if (!(co.cards[side].hand || []).length) FS_RULES.advanceCombatSteps(st);
        else FS_RULES.apply(st, seat, { type: 'combat', action: 'playCard', index: 0 });
    } else if (co.step === 'damage-attacker' || co.step === 'damage-defender') {
        const side = co.step === 'damage-attacker' ? 'attacker' : 'defender';
        const seat = side === 'attacker' ? co.attacker : co.defender;
        const ids = FS_RULES.damageCandidates(st, side).map(x => x.id);
        FS_RULES.apply(st, seat, { type: 'combat', action: 'damage', targets: ids });
    } else if (co.step === 'retreat') {
        const targets = FS_RULES.retreatTargets(st, co.loser);
        FS_RULES.apply(st, co.loser, { type: 'combat', action: 'retreat', target: targets[0] });
    } else {
        FS_RULES.advanceCombatSteps(st);
    }
    return !!st.combat;
}

/** Один шаг сборки карты. */
function setupStep(st) {
    const board = BOARD_SETUP.of(st);
    const seat = board.turn;
    const stage = board.stage;
    if (stage === BOARD_SETUP.TILES) {
        const cell = FS_RULES.setupLegalCells(st)[0];
        const tile = board.hand(seat)[0];
        return { seat, cmd: { type: 'placeSystemTile', tile, row: cell.row, col: cell.col } };
    }
    if (stage === BOARD_SETUP.FORCES) {
        const initial = st.players[seat].initialForces;
        const sys = FS_RULES.system(st, board.currentSystem);
        const unitId = Object.keys(initial.units).find(id => initial.units[id] > 0);
        if (unitId) {
            const def = FS_RULES.unitDef(st, seat, unitId);
            const area = sys.areas.find(a => !!a.world === (def.type !== 'ship')
                && FS_RULES.unitsAt(st, sys.id, a.pos).length < FS_RULES.capacity(st, sys.id, a.pos));
            if (area) return { seat, cmd: { type: 'setupUnit', unit: unitId, pos: area.pos } };
        }
        const structId = Object.keys(initial.structures).find(id => initial.structures[id] > 0);
        if (structId) {
            const area = sys.areas.find(a => a.world && FS_RULES.canPlaceStructure(st, seat, sys.id, a.pos, { ignoreControl: true }).ok);
            if (area) return { seat, cmd: { type: 'setupStructure', structure: structId, pos: area.pos } };
        }
        return { seat, cmd: { type: 'finishSetupForces' } };
    }
    if (stage === BOARD_SETUP.OBJECTIVES) {
        const opt = FS_RULES.setupObjectiveOptions(st)[0];
        if (opt) return { seat, cmd: { type: 'setupObjective', faction: opt.faction, pos: opt.areas[0] } };
        return null;
    }
    if (stage === BOARD_SETUP.STORMS) {
        const edges = FS_RULES.setupStormEdges(st);
        // Край называется системой и стороной: ищем систему, у которой эта
        // граница свободна.
        for (const sys of st.systems) {
            for (const side of FS_RULES.setupStormSides(st, sys.id)) {
                return { seat, cmd: { type: 'setupStorm', system: sys.id, side } };
            }
        }
        if (!edges.length) return null;
        return null;
    }
    return null;
}

function nextCommand(st) {
    if (st.over || GAME_OUTCOME.of(st).over) return null;
    if (st.pending) return answerViaClient(st);
    const trim = FS_RULES.trimQueue(st);
    if (trim.any()) {
        const entry = trim.entries()[0];
        const unit = st.units.find(u => u.seat === entry.seat && u.system === entry.system && u.area === entry.pos);
        if (unit) return { seat: entry.seat, cmd: { type: 'trimUnit', unit: unit.id } };
        return null;
    }
    if (st.combat) return { combat: true };
    if (st.phase === 'setup' && BOARD_SETUP.of(st).active) return setupStep(st);
    if (st.phase === 'planning') {
        const seat = st.turn;
        const p = st.players[seat];
        const kinds = ['advance', 'deploy', 'strategize', 'dominate'];
        // Приказы выкладываются по кругу: за круглый стол выходят все четыре
        // вида, и все четыре панели приказов рисуются в проходе.
        for (let i = 0; i < kinds.length; i++) {
            const kind = kinds[((p.placedTokens || 0) + i) % kinds.length];
            if (FS_RULES.orderLeft(st, seat, kind) <= 0) continue;
            const sys = st.systems.find(s => FS_RULES.canPlaceOrder(st, seat, s.id));
            if (sys) return { seat, cmd: { type: 'placeOrder', system: sys.id, order: kind } };
        }
        return null;
    }
    if (st.phase === 'operations') {
        if (!st.order) {
            const seat = st.turn;
            const sys = st.systems.find(s => s.tokens.length && s.tokens[s.tokens.length - 1].seat === seat);
            return sys ? { seat, cmd: { type: 'resolveOrder', system: sys.id } } : null;
        }
        const seat = st.order.seat;
        const kind = st.order.order;
        if (PHASE_PLAN.of(st.order).is('guardDeploy')) return { seat, cmd: { type: 'finishGuardDeploy' } };
        if (kind === 'advance') return { seat, cmd: { type: 'finishAdvance' } };
        if (kind === 'deploy') return { seat, cmd: { type: 'finishDeploy' } };
        if (kind === 'strategize') return { seat, cmd: { type: 'finishStrategize' } };
        if (kind === 'dominate') return { seat, cmd: { type: 'finishDominate' } };
        return null;
    }
    if (st.phase === 'refresh') {
        if (!st.event) return { seat: st.turn, cmd: { type: 'nextPhase' } };
        const seat = st.event.seat;
        if (st.eventsLeft <= 0) return { seat, cmd: { type: 'nextPhase' } };
        if (!st.event.stormMoved) {
            const opts = FS_RULES.stormOptions(st, seat);
            if (opts.length) return { seat, cmd: { type: 'moveStorm', storm: opts[0].storm, dir: opts[0].dir } };
        }
        if ((st.event.drawn || []).length && !st.event.chosen) {
            return { seat, cmd: { type: 'drawEvent', card: st.event.drawn[0] } };
        }
        return { seat, cmd: { type: 'resolveEvent' } };
    }
    return null;
}

/**
 * Метка шага: всё, что отличает один экран от другого, — фаза, очередь,
 * приказ, шаг боя, вид вопроса, стадия сборки, событие. Без этого детектор
 * застревания срабатывает на законных повторах: вся сборка карты — один
 * «setup/1/-», хотя экраны там разные.
 */
function stepLabel(tag, st) {
    let label = tag + ' · ' + st.phase + '/' + st.round + '/ход' + st.turn + '/'
        + (st.order ? st.order.order + ':' + st.order.phase : '-');
    if (st.combat) label += '/бой:' + st.combat.step;
    if (st.pending) {
        const q = st.pending.question || {};
        label += '/вопрос:' + (q.kind || '?') + ':' + (q.op || '?');
    }
    if (st.phase === 'setup' && BOARD_SETUP.of(st).active) {
        label += '/сборка:' + BOARD_SETUP.of(st).stage + ':' + BOARD_SETUP.of(st).turn;
    }
    if (st.phase === 'refresh' && st.event) label += '/событие:' + st.event.seat;
    if (FS_RULES.trimQueue(st).any()) label += '/переполнение';
    if (STRIKE_DAMAGE.of(st).pending) label += '/удар';
    return label;
}

/**
 * Партия целиком: на каждом шаге экран рисуется для КАЖДОГО места, команда
 * уходит как от клиента, состояние до и после пересылается через JSON.
 */
function walkGame(st, tag, maxSteps = 700) {
    const seen = new Set();
    const empty = [];
    let steps = 0;
    let same = 0, lastLabel = '';
    const seats = st.players.map(p => p.seat);
    while (steps++ < maxSteps) {
        const label = stepLabel(tag, st);
        if (label === lastLabel && ++same > 25) {
            const snap = JSON.stringify({ pending: st.pending || null, order: st.order || null, turn: st.turn });
            throw new Error('шаг «' + label + '» повторяется: проход застрял. Снимок: ' + String(snap).slice(0, 600));
        }
        if (label !== lastLabel) { lastLabel = label; same = 0; }
        if (!seen.has(label)) {
            seen.add(label);
            if (process.env.WALK_DEBUG) console.log('       ' + C.dim + label + C.r);
            for (const seat of seats) {
                const panel = renderFork(st, seat, label);
                if (needsButtons(st, seat) && !pressables(panel).length) {
                    empty.push(label + ' (место ' + seat + ')');
                }
            }
            // Стадия штормов: стороны после выбора системы на доске.
            if (st.phase === 'setup' && BOARD_SETUP.of(st).active
                && BOARD_SETUP.of(st).stage === BOARD_SETUP.STORMS) {
                const seat = BOARD_SETUP.of(st).turn;
                const sp = stormSidesPanels(st, seat);
                if (sp) {
                    try {
                        FSUI.update(sp.view, sp.ctxPanel);
                    } catch (e) {
                        throw new Error('шаг «' + label + ' · шторм: стороны»: экран упал: ' + (e && e.message));
                    }
                    if (!pressables(sp.ctxPanel).length) {
                        empty.push(label + ' (шторм: стороны ' + sp.sys.id + ')');
                    }
                }
            }
        }
        if (st.over || GAME_OUTCOME.of(st).over) break;
        // Как на сервере: состояние копируется перед каждой командой.
        JSON.parse(JSON.stringify(st));
        const step = nextCommand(st);
        if (!step) break;
        if (step.combat) {
            const snap = st.combat.round + '|' + st.combat.step;
            combatStep(st);
            if (st.combat && st.combat.round + '|' + st.combat.step === snap && !st.pending) {
                throw new Error('бой застрял на шаге «' + label + '»: ' + snap);
            }
        } else {
            const res = FS_RULES.apply(st, step.seat, step.cmd);
            if (!res || !res.ok) {
                throw new Error('шаг «' + label + '»: команда ' + step.cmd.type + ' не прошла: ' + (res && res.error));
            }
        }
        JSON.parse(JSON.stringify(st));
        if (!st.over && st.round > 2) break;
    }
    if (steps >= maxSteps) throw new Error(tag + ': партия не доходит: ' + maxSteps + ' шагов');
    if (empty.length) throw new Error('без кнопок остались: ' + empty.slice(0, 5).join(' | '));
    // И финальный экран — тоже для каждого места.
    for (const seat of seats) renderFork(st, seat, tag + ' · конец');
    if (process.env.WALK_DEBUG) console.log('       ' + C.dim + 'шагов ' + steps + ', экранов ' + seen.size + C.r);
    return true;
}

// --- проход: партии целиком ---------------------------------------------------
const PARTIES = [
    { name: 'ИГ против некронов', players: [{ faction: 'имперская-гвардия', name: 'P0', id: 'p0' }, { faction: 'некроны', name: 'P1', id: 'p1' }] },
    { name: 'орки против эльдаров', players: [{ faction: 'орки', name: 'P0', id: 'p0' }, { faction: 'эльдары', name: 'P1', id: 'p1' }] },
];

for (const party of PARTIES) {
    for (const seed of seeds) {
        check(party.name + ', сид ' + seed + ': партия со сборки карты до конца второго раунда', () => {
            const st = FS_RULES.newGame({ seed: party.name + seed, players: party.players, interactiveSetup: true });
            return walkGame(st, party.name + '/' + seed);
        });
    }
}

// --- адресные состояния: редкие панели ----------------------------------------
const groundOf = (st, seat) => {
    const sys = st.systems[0];
    return (sys.areas.find(a => a.world) || sys.areas[0]).pos;
};

check('бой: каждый шаг для обеих сторон, вопрос карты, конец боя', () => {
    const players = PARTIES[0].players;
    const st = FS_RULES.newBattleTest({
        seed: 5, players, kind: 'ground',
        units: { 'гвардейцы': 3 }, foeUnits: { 'воины': 3 },
    });
    if (!st.combat) throw new Error('бой не начался');
    const seen = new Set();
    let steps = 0;
    while (st.combat && steps++ < 120) {
        const qTag = st.pending ? '/вопрос:' + (((st.pending.question || {}).kind) || '?') : '';
        const label = 'бой · ' + st.combat.round + '/' + st.combat.step + qTag;
        if (!seen.has(label)) {
            seen.add(label);
            if (process.env.WALK_DEBUG) console.log('       ' + C.dim + label + C.r);
            for (const seat of [0, 1]) {
                const panel = renderFork(st, seat, label);
                // В бою кнопки положены отвечающей стороне; чужая сторона ждёт.
                if (st.pending) {
                    const must = st.pending.answerSeat === undefined ? st.pending.seat : st.pending.answerSeat;
                    if (must === seat && !pressables(panel).length) {
                        throw new Error('на шаге «' + label + '» отвечающей стороне нечего нажать');
                    }
                }
            }
        }
        JSON.parse(JSON.stringify(st));
        const snap = st.combat.round + '|' + st.combat.step;
        combatStep(st);
        if (st.combat && st.combat.round + '|' + st.combat.step === snap && !st.pending) break;
        JSON.parse(JSON.stringify(st));
    }
    if (st.combat) throw new Error('бой не закончился за 120 шагов: ' + st.combat.step);
    // Конец тестового боя — панель «Ещё бой».
    for (const seat of [0, 1]) renderFork(st, seat, 'бой · конец');
    if (process.env.WALK_DEBUG) console.log('       ' + C.dim + 'шагов ' + steps + ', экранов ' + seen.size + C.r);
    return true;
});

check('вопрос карты поверх боя: обе стороны видят экран', () => {
    const st = FS_RULES.newBattleTest({
        seed: 3, players: PARTIES[0].players, kind: 'ground',
        units: { 'гвардейцы': 2 }, foeUnits: { 'воины': 2 },
    });
    st.combat.dice.attacker = ['att', 'att'];
    FS_RULES.runEffects(st, 0, [{ op: 'flipDie', n: 1, kind: 'att', to: 'morale', pick: true }], { kind: 'combat', ctx: null });
    if (!st.pending) throw new Error('движок не спросил, какой кубик');
    for (const seat of [0, 1]) {
        const panel = renderFork(st, seat, 'вопрос карты');
        if (seat === st.pending.seat && !pressables(panel).length) {
            throw new Error('отвечающей стороне нечего нажать');
        }
    }
    return true;
});

check('переполнение: игрок убирает лишнее, второй ждёт', () => {
    const st = FS_RULES.newReadyGame({ seed: 7, players: PARTIES[0].players });
    st.units = []; st.structures = []; st.objectives = []; st.storms = [];
    for (const s of st.systems) s.tokens = [];
    st.phase = 'operations'; st.turn = 0;
    const sys = st.systems[0];
    const pos = groundOf(st, 0);
    const cap = FS_RULES.capacity(st, sys.id, pos);
    for (let i = 0; i < cap + 2; i++) FS_RULES.addUnit(st, 0, 'гвардейцы', sys.id, pos);
    st.order = { seat: 0, order: 'deploy', system: sys.id, phase: 'deploy' };
    const res = FS_RULES.apply(st, 0, { type: 'finishDeploy' });
    if (!res.ok) throw new Error('finishDeploy не прошёл: ' + res.error);
    if (!FS_RULES.trimQueue(st).blocked(0)) throw new Error('очередь переполнения не заблокировала игрока');
    for (const seat of [0, 1]) {
        const panel = renderFork(st, seat, 'переполнение');
        if (seat === 0 && !pressables(panel).length) {
            throw new Error('игроку нечего нажать при переполнении');
        }
    }
    const unit = st.units.find(u => u.seat === 0);
    const trim = FS_RULES.apply(st, 0, { type: 'trimUnit', unit: unit.id });
    if (!trim.ok) throw new Error('trimUnit не прошёл: ' + trim.error);
    renderFork(st, 0, 'переполнение · после уборки');
    return true;
});

check('удар с орбиты: защитник распределяет урон', () => {
    const st = FS_RULES.newGame({
        seed: 3, interactiveSetup: false,
        players: [{ faction: 'инквизиция', name: 'P0' }, { faction: 'орки', name: 'P1' }],
    });
    st.units = [];
    const sys = st.systems[0];
    const v = sys.areas.find(a => !a.world);
    const w = sys.areas.find(a => a.world);
    const ship = FS_CATALOG.faction('инквизиция').units.find(u => u.type === 'ship');
    const grunt = FS_CATALOG.faction('орки').units.find(u => u.type === 'ground');
    FS_RULES.addUnit(st, 0, ship.id, sys.id, v.pos);
    FS_RULES.addUnit(st, 1, grunt.id, sys.id, w.pos);
    st.phase = 'operations'; st.turn = 0;
    st.order = { seat: 0, order: 'advance', system: sys.id, phase: 'strike' };
    const res = FS_RULES.apply(st, 0, { type: 'orbitalStrike', system: sys.id, pos: w.pos, from: v.pos });
    if (!res.ok) throw new Error('orbitalStrike не прошёл: ' + res.error);
    if (!STRIKE_DAMAGE.of(st).pending) throw new Error('урон с орбиты не ждёт распределения');
    for (const seat of [0, 1]) renderFork(st, seat, 'удар с орбиты');
    return true;
});

check('«Массовое Производство»: панель, две покупки пары, конец производства', () => {
    const st = FS_RULES.newReadyGame({ seed: 7, players: PARTIES[0].players });
    st.units = []; st.structures = []; st.objectives = []; st.storms = [];
    for (const s of st.systems) s.tokens = [];
    st.phase = 'operations'; st.turn = 0;
    const sys = st.systems[0];
    const world = groundOf(st, 0);
    FS_RULES.addUnit(st, 0, 'гвардейцы', sys.id, world);
    FS_RULES.addStructure(st, 0, 'factory', sys.id, world);
    st.players[0].materiel = 14;
    st.players[0].supply.units['гвардейцы'] = 9;
    st.order = { seat: 0, order: 'dominate', system: sys.id, pos: world, phase: 'dominate' };
    FS_RULES.runEffects(st, 0, [{ op: 'guardDeploy' }], { kind: 'ability', ctx: null });
    if (!PHASE_PLAN.of(st.order).is('guardDeploy')) throw new Error('производство не началось');
    renderFork(st, 0, 'производство · начало');
    renderFork(st, 1, 'производство · начало');
    for (const n of [1, 2]) {
        JSON.parse(JSON.stringify(st));
        const res = FS_RULES.apply(st, 0, { type: 'buyUnit', unit: 'гвардейцы', system: sys.id, pos: world });
        if (!res.ok) throw new Error('покупка ' + n + ' не прошла: ' + res.error);
        JSON.parse(JSON.stringify(st));
        renderFork(st, 0, 'производство · покупка ' + n);
    }
    const fin = FS_RULES.apply(st, 0, { type: 'finishGuardDeploy' });
    if (!fin.ok) throw new Error('finishGuardDeploy не прошёл: ' + fin.error);
    renderFork(st, 0, 'производство · конец');
    return true;
});

// --- каждая кнопка нажимается ---------------------------------------------------
check('каждая кнопка прохода нажимается без падения клиента', () => {
    // Кнопка рисуется, а клик роняет клиент — так выглядит «белый экран».
    // Здесь каждая кнопка нажимается на живом состоянии; сеть — заглушка,
    // перерисовка выключена (она проверяется отдельно на каждом шаге выше).
    const pressed = [];
    const press = (state, seat, label) => {
        const view = FS_RULES.view(state, seat);
        const game = clientFor(view);
        const sent = [];
        game.net = { cmd: (c) => { sent.push(c); }, undo: nothing, on: nothing };
        game.refresh = nothing;
        const ctxPanel = { title: '', text: '', status: '', warn: '', actions: [], mode: 'idle', setupCellSelected: false };
        // Та же развилка, что в renderFork, но кнопки нужны живьём.
        const me = SEAT.of(view).me;
        const call = (name) => game[name](view, ctxPanel);
        if (view.pending) {
            if (view.combat) call('panelCombat');
            call('panelQuestion');
        } else if (FS_RULES.trimQueue(view).blocked(me)) {
            call('panelTrim');
        } else if (STRIKE_DAMAGE.of(view).pending) {
            if (STRIKE_DAMAGE.of(view).waiting(me)) call('panelStrikeDamage');
        } else if (GAME_OUTCOME.of(view).over) {
            // Кнопок нет.
        } else if (BATTLE_TEST.of(view).active && !view.combat) {
            call('panelTestBattle');
        } else if (BATTLE_TEST.of(view).active) {
            // Только бой ниже.
        } else if (view.phase === 'setup') {
            call('panelSetup');
        } else if (view.phase === 'planning') {
            call('panelPlanning');
        } else if (view.phase === 'operations') {
            call('panelOperations');
        } else if (view.phase === 'refresh') {
            call('panelRefresh');
        }
        if (view.order && ORDER_CONTEXT.of(view.order).isSeat(me) && !BATTLE_TEST.of(view).active) {
            if (ORDER_CONTEXT.of(view.order).isKind('advance')) call('panelAdvance');
            if (PHASE_PLAN.of(view.order).is('guardDeploy')) call('panelGuardDeploy');
            else if (ORDER_CONTEXT.of(view.order).isKind('deploy')) call('panelDeploy');
            else if (ORDER_CONTEXT.of(view.order).isKind('strategize')) call('panelStrategize');
            else if (ORDER_CONTEXT.of(view.order).isKind('dominate')) call('panelDominate');
        }
        if (view.combat) call('panelCombat');
        // Жмутся все шесть списков: actions, leftActions («Закончить приказ»
        // стратегии — там), ряды карт, рука. Карты вопроса дублируют свои
        // обработчики в actions, поэтому жмутся один раз — через actions.
        const lists = [ctxPanel.actions, ctxPanel.leftActions, ctxPanel.hand, game.hand || []];
        if (ctxPanel.upgrades) lists.push(ctxPanel.upgrades.combat, ctxPanel.upgrades.order);
        // Ряды карт руки боя — тоже кнопки (выбор пары для улучшения).
        const seen = new Set();
        for (const list of lists) {
            for (const action of list || []) {
                if (!action || typeof action.onClick !== 'function') continue;
                if (action.enabled === false) continue;
                if (seen.has(action.onClick)) continue;
                seen.add(action.onClick);
                pressOne(game, action, state, seat, label, sent, pressed);
            }
        }
        // Стороны шторма живут за кликом по доске: выбор подставляется.
        if (view.phase === 'setup' && view.setup && view.setup.stage === 'storms' && view.setup.turn === seat) {
            const sp = stormSidesPanels(state, seat);
            if (sp) {
                for (const action of pressables(sp.ctxPanel)) {
                    pressOne(sp.game, action, state, seat, label + '/шторм', sp.sent, pressed);
                }
            }
        }
    };
    // Одно нажатие: клик не роняет клиент, посланная команда существует.
    const pressOne = (game, action, state, seat, label, sent, pressed) => {
        try {
            action.onClick();
            pressed.push(action.label || action.kind || action.name);
        } catch (e) {
            const inner = process.env.WALK_STACK && e && e.stack ? '\n       ' + C.dim + 'внутри: ' + e.stack.split('\n').slice(0, 5).join('\n       ') + C.r : '';
            throw new Error('нажатие «' + (action.label || action.kind || action.name) + '» на шаге «' + label + '» упало: ' + (e && e.message) + inner);
        }
        // Каждая посланная команда обязана существовать: опечатка в типе —
        // это кнопка, которая не делает ничего и никогда, сервер отвечает
        // «Неизвестная команда». Проверка идёт на копии состояния, сама
        // партия от нажатий не двигается. Остальное (отказ движка, его
        // исключение) — законный ответ сервера, не провал.
        for (const c of sent.splice(0)) {
            if (!c || typeof c.type !== 'string') continue;
            let verdict = null;
            try {
                const probe = JSON.parse(JSON.stringify(state));
                const res = FS_RULES.apply(probe, seat, c);
                if (res && res.ok === false && /^Неизвестная команда/.test(res.error || '')) verdict = res.error;
            } catch (e) {
                if (process.env.WALK_DEBUG) {
                    console.log('       ' + C.dim + 'движок бросил на «' + (action.label || action.kind || action.name)
                        + '» ' + c.type + ': ' + (e && e.message) + C.r);
                }
            }
            if (verdict) {
                throw new Error('кнопка «' + (action.label || action.kind || action.name) + '» на шаге «' + label
                    + '» шлёт несуществующую команду: ' + c.type);
            }
        }
    };
    // Кнопки собираются по ходу короткой партии и всех адресных состояний.
    const st = FS_RULES.newGame({ seed: 'buttons', players: PARTIES[0].players, interactiveSetup: true });
    const seats = st.players.map(p => p.seat);
    for (let i = 0; i < 120; i++) {
        const label = st.phase + '/' + (st.order ? st.order.order : '-') + '/' + i;
        for (const seat of seats) press(st, seat, label);
        if (st.over || GAME_OUTCOME.of(st).over) break;
        const step = nextCommand(st);
        if (!step) break;
        if (step.combat) { if (!combatStep(st)) break; }
        else { const res = FS_RULES.apply(st, step.seat, step.cmd); if (!res.ok) break; }
        if (st.round > 1 || st.phase === 'refresh') break;
    }
    if (!pressed.length) throw new Error('ни одной кнопки не нажато — проверка пустая');
    if (process.env.WALK_DEBUG) console.log('       ' + C.dim + 'нажато ' + pressed.length + ' кнопок' + C.r);
    return true;
});

// --- покрытие: все 14 панелей обязаны отработать -------------------------------
// Только в полном проходе: под фильтром остальные проверки пропущены и
// множество covered неполно.
if (!filter) check('все 14 панелей отработали в проходе', () => {
    const missing = PANELS.filter(p => !covered.has(p));
    if (missing.length) return 'не рисовались: ' + missing.join(', ');
    return true;
});

// ============================================================================
console.log('\n' + (failed.length
    ? C.red + C.b + '  Проход: ' + failed.length + ' провалов из ' + done + '.' + C.r
    : C.grn + C.b + '  Проход чист: ' + done + ' проверок, 0 провалов.' + C.r) + '\n');
for (const f of failed) console.log('   ' + C.red + '· ' + f.name + C.r + ' — ' + f.why);
process.exit(failed.length ? 1 : 0);
