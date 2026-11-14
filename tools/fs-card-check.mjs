// ============================================================================
//  fs-card-check.mjs — card-by-card check of a faction against the card texts
// ----------------------------------------------------------------------------
//  node tools/fs-card-check.mjs                     Адептус Механикус
//  node tools/fs-card-check.mjs --faction=тираниды  another covered faction
//  node tools/fs-card-check.mjs --only=Жёсткий      only the matching cards
//
//  tools/fs-audit.mjs checks the engine against the Rules Reference. This tool
//  checks covered card scenarios against docs/forbidden-stars (04 combat cards,
//  05 order upgrades, 06 events, 02 faction sheets). The number of scenarios
//  varies by faction; a nonempty run does not imply complete coverage.
//
//  The states are built by hand with the dice, tokens and units a check needs.
//  Some tests reveal a card through FS_RULES.apply; others isolate parsed
//  effects with FS_RULES.runEffects before answering via FS_RULES.apply. Each
//  assertion checks the resulting state, not a real server or historical save.
// ============================================================================
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import url from 'node:url';
import { createEngineContext } from './fs-engine.mjs';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');

// --- the engine, loaded the way the browser loads it ------------------------
const ctx = createEngineContext();
// The panel code this tool inspects is not part of the rules engine; load it
// on top of the same context, in the order index.html does.
const load = (file, name) => vm.runInContext(
    fs.readFileSync(path.join(ROOT, file), 'utf8') + `\n;globalThis.${name} = ${name};`,
    ctx, { filename: file });
for (const file of ['js/fs/FSView.js', 'js/fs/FSUI.js', 'js/fs/FSGame.js']) {
    if (fs.existsSync(path.join(ROOT, file))) load(file, file.split('/').pop().replace(/\.js$/, ''));
}
const { FS_DATA, FS_CARDS, FS_CATALOG, FS_RULES, FS_EFFECTS, FSGame, GamePhase, CombatTokens, CombatPlans, CombatDamage, CombatTurn, CombatCards, CombatCubes, CombatHooks, CombatOutcome, BattleField, DeployScope, OrderMove, OrderDeal, Purchases } = ctx;

// --- the report -------------------------------------------------------------
const C = { r: '\x1b[0m', b: '\x1b[1m', dim: '\x1b[2m', red: '\x1b[31m', grn: '\x1b[32m' };
const args = process.argv.slice(2);
const argOf = name => {
    const hit = args.find(a => a.startsWith('--' + name + '='));
    return hit ? hit.slice(name.length + 3) : null;
};
const FACTION = argOf('faction') || 'адептус-механикус';
const ONLY = argOf('only');
let done = 0;
const failed = [];
let group = '';
// The sections of a faction: a run checks the cards of one faction, the sections
// of the others are skipped.
let groupFaction = null;

/** The reinforcement tokens of the foe of the combat: used, routed, destroyed. */
function ctxLosses(st) {
    return CombatTokens.of(st.combat).units('defender');
}

/** A necron order of the given kind, with one upgrade card ready to play. */
function necronOrder(kind, card) {
    const st = FS_RULES.newReadyGame({
        seed: 5,
        players: players('некроны', 'имперская-гвардия'),
    });
    st.units = [];
    st.structures = [];
    st.objectives = [];
    st.storms = [];
    for (const sys of st.systems) sys.tokens = [];
    st.phase = 'operations';
    st.turn = 0;
    st.order = null;
    const sys = st.systems[0];
    st.players[0].materiel = 20;
    st.players[0].upgrades = [{ name: card, used: false, order: kind }];
    sys.tokens.push({ seat: 0, order: kind, faceUp: false });
    const res = FS_RULES.apply(st, 0, { type: 'resolveOrder', system: sys.id });
    if (!res || res.ok === false) throw new Error('приказ не раскрыт: ' + (res && res.error));
    return st;
}

function necronDeploy() {
    const st = FS_RULES.newReadyGame({
        seed: 5,
        players: players('некроны', 'имперская-гвардия'),
    });
    st.units = [];
    st.structures = [];
    st.objectives = [];
    st.storms = [];
    for (const sys of st.systems) sys.tokens = [];
    st.phase = 'operations';
    st.turn = 0;
    st.order = null;
    const sys = st.systems[0];
    const pos = worldOf(st, sys.id);
    FS_RULES.addUnit(st, 0, 'воины', sys.id, pos);
    FS_RULES.addStructure(st, 0, 'factory', sys.id, pos);
    st.players[0].materiel = 20;
    st.players[0].upgrades = [{ name: 'Миры-гробницы', used: false, order: 'deploy' }];
    sys.tokens.push({ seat: 0, order: 'deploy', faceUp: false });
    const res = FS_RULES.apply(st, 0, { type: 'resolveOrder', system: sys.id });
    if (!res || res.ok === false) throw new Error('приказ «Развёртывание» не раскрыт: ' + (res && res.error));
    return st;
}

/** The zero-level ground unit of the seat's faction (the name from the catalog). */
function groundUnitOf(st, seat) {
    const units = FS_CATALOG.faction(st.players[seat].faction).units.filter(u => u.type !== 'ship');
    return (units.find(u => u.kl === 0) || units[0] || {}).id;
}

function head(text, ofFaction) {
    group = text;
    groupFaction = ofFaction || null;
    if (!groupFaction || groupFaction === FACTION) console.log('\n' + C.b + '  ' + text + C.r);
}

function check(card, what, fn) {
    if (groupFaction && groupFaction !== FACTION) return;
    if (ONLY && !(card + ' ' + what).toLowerCase().includes(ONLY.toLowerCase())) return;
    done++;
    const id = group + ' · ' + card;
    try {
        const res = fn();
        if (res === true || res === undefined) {
            console.log('  ' + C.grn + 'ok  ' + C.r + C.dim + id + C.r + '  ' + what);
        } else {
            failed.push({ id, what, why: String(res) });
            console.log('  ' + C.red + 'FAIL' + C.r + ' ' + id + '  ' + what + '\n       ' + C.red + res + C.r);
        }
    } catch (e) {
        failed.push({ id, what, why: e && e.message });
        console.log('  ' + C.red + 'FAIL' + C.r + ' ' + id + '  ' + what + '\n       ' + C.red + (e && e.message) + C.r);
    }
}

const eq = (actual, expected, what) => {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`${what}: ждали ${JSON.stringify(expected)}, получили ${JSON.stringify(actual)}`);
    }
    return true;
};
const ok = (cond, what) => {
    if (!cond) throw new Error(what);
    return true;
};

// --- the battlefield --------------------------------------------------------
const MECH = 'адептус-механикус';
const FOE = 'имперская-гвардия';

const players = (mine, foe) => [
    { faction: mine || MECH, name: 'Мех', id: 'p0' },
    { faction: foe || FOE, name: 'ИГ', id: 'p1' },
];

/**
 * A combat in the preparation step: the troops are on the table, the dice are
 * the ones the check needs, the hand of the tested side is the card under test.
 * The other side always has a card of his own: a card is chosen by both players
 * and only then turned over, and an empty hand would end the combat at once.
 */
function battle(o = {}) {
    const st = FS_RULES.newBattleTest({
        seed: o.seed === undefined ? 5 : o.seed,
        players: players(o.faction, o.foeFaction),
        kind: o.kind,
        units: o.units === undefined ? { 'скитарии': 2, 'тяжелые-титаны': 1 } : o.units,
        foeUnits: o.foeUnits === undefined ? { 'гвардейцы': 2, 'титаны': 1 } : o.foeUnits,
    });
    const c = st.combat;
    c.cards.attacker.hand = o.hand ? o.hand.slice() : (o.card ? [o.card] : []);
    c.cards.defender.hand = o.foeHand ? o.foeHand.slice()
        : (o.foeCard ? [o.foeCard] : (o.noFoeCard ? [] : ['Ложись!']));
    if (o.roundEnd) {
        // A hand that runs out sends the battle straight to its resolution and
        // the execution round never ends: the checks of the end of the round
        // need cards left in both hands.
        while (c.cards.attacker.hand.length < 3) c.cards.attacker.hand.push('Техножрецы');
        while (c.cards.defender.hand.length < 3) c.cards.defender.hand.push('Ложись!');
    }
    if (o.dice) c.dice.attacker = o.dice.slice();
    if (o.foeDice) c.dice.defender = o.foeDice.slice();
    if (o.round) c.round = o.round;
    for (const n of o.routed || []) routeMine(st, n);
    for (const n of o.foeRouted || []) routeFoe(st, n);
    st.trace = [];
    return st;
}

const myUnits = st => st.units.filter(u => u.seat === 0);
const foeUnits = st => st.units.filter(u => u.seat === 1);
const routeMine = (st, i) => { const u = myUnits(st)[i || 0]; if (u) u.routed = true; };
const routeFoe = (st, i) => { const u = foeUnits(st)[i || 0]; if (u) u.routed = true; };
const dice = (st, side) => (st.combat.dice[side] || []).filter(d => d !== null && d !== undefined);
const count = (st, side, face) => dice(st, side).filter(d => d === face).length;
const tokens = (st, side) => st.combat.tokens[side];

/** The reinforcements are refused: the card is what the check is about. */
function refuseReinforce(st) {
    FS_RULES.apply(st, 0, { type: 'combat', action: 'reinforce', count: 0 });
    FS_RULES.apply(st, 1, { type: 'combat', action: 'reinforce', count: 0 });
}

/**
 * The card is laid face down, the other side lays his, the cards are turned
 * over: the steps of the tested card are performed by the engine and its
 * questions are answered by the policy. The card of the other side is left
 * where it is — a check reads the state the tested card alone has made.
 */
function play(st, seat, index, policy) {
    // Some card fixtures start at preparation; reach the choice through the
    // same legal zero-reinforcement commands a player would send.
    if (st.combat && /^reinforce-/.test(st.combat.step)) refuseReinforce(st);
    const c = st.combat;
    // The choices are made in the server's order: the attacker puts his card
    // face down before the defender. Both are still revealed simultaneously.
    for (const side of ['attacker', 'defender']) {
        const player = c[side];
        if (!(c.cards[side].hand || []).length) {
            FS_RULES.advanceCombatSteps(st);
            continue;
        }
        const result = FS_RULES.apply(st, player, { type: 'combat', action: 'playCard', index: player === seat ? (index || 0) : 0 });
        if (!result.ok) throw new Error((player === seat ? 'карта' : 'карта противника') + ' не сыграна: ' + result.error);
    }
    // The attacker's card is always turned over first: when the defender is the
    // one under test, the card of the attacker resolves before his.
    if (seat !== c.attacker) answerAll(st, policy, c.attacker);
    return answerAll(st, policy, seat);
}

/**
 * The questions of one card, one by one. `owner` is the seat of the player the
 * card belongs to: the questions his card asks of the opponent are answered
 * here too, but the questions of the other card stop the loop.
 */
function answerAll(st, policy, owner, limit = 80) {
    const trace = st.trace || (st.trace = []);
    for (let i = 0; i < limit; i++) {
        if (!st.pending) break;
        if (owner !== undefined && st.pending.seat !== owner) break;
        const q = st.pending.question || {};
        const seat = st.pending.answerSeat === undefined ? st.pending.seat : st.pending.answerSeat;
        // The policy answers the questions it is about; the rest go by the
        // default answer — `null` from the policy is «no opinion», not «answer
        // nothing» (an empty answer to «кого деморализовать?» would be a refusal
        // the card does not allow).
        const answer = (policy && policy(st, q, trace)) || firstOption(st, q);
        trace.push({ kind: q.kind, op: q.op, seat, text: q.text || '', options: q.options, answer });
        const res = FS_RULES.apply(st, seat, { type: 'effect', answer });
        if (!res.ok) throw new Error('ответ не принят: ' + res.error);
    }
    return trace;
}

/**
 * The execution round is played to its end: the card of the other side resolves,
 * the damage of the round is dealt, the combat tokens go back to the supply —
 * except the ones the card of the round keeps. The combat of the check is built
 * with `roundEnd` so that it does not run out of cards on the way.
 */
function nextRound(st, policy) {
    answerAll(st, policy, 0);
    answerAll(st, null, 1);
    for (let i = 0; i < 24 && st.combat && st.combat.round === 1; i++) {
        if (st.pending) { answerAll(st, null, undefined); continue; }
        const step = st.combat.step;
        if (step === 'damage-attacker' || step === 'damage-defender') {
            const side = step === 'damage-attacker' ? 'attacker' : 'defender';
            const seat = ctx.CombatHooks.of(st.combat).assignSeat(st.combat[side]);
            const targets = FS_RULES.damageCandidates(st, side).map(x => x.id);
            const r = FS_RULES.apply(st, seat, { type: 'combat', action: 'damage', targets });
            if (!r.ok) throw new Error('урон не назначен: ' + r.error);
            continue;
        }
        if (step === 'round-end') { FS_RULES.endCombatRound(st); continue; }
        break;
    }
    if (!st.combat) throw new Error('бой закончился, не дойдя до конца раунда');
    if (st.combat.round !== 2) throw new Error('раунд боя не закончился: раунд ' + st.combat.round);
    return st;
}

/**
 * The battle panel as the player sees it: the same code the client runs, on a
 * bare object — the panel is built from the state alone.
 */
function panel(st, seat) {
    const game = Object.create(FSGame.prototype);
    game.fillHand = () => { };
    game.canPlayCard = () => false;
    const ctx2 = { actions: [] };
    game.panelCombat(Object.assign({}, st, { seat }), ctx2);
    return ctx2.battle;
}

/** The default answer: the first option, the first die, the first unit. */
function firstOption(st, q) {
    const first = Array.isArray(q.options) ? q.options[0] : undefined;
    switch (q.kind) {
        case 'ability': return {};
        case 'yesno': return q.op === 'avoid' ? { dice: [first] } : {};
        case 'units': return { units: (q.options || []).slice(0, Math.max(1, q.n || 1)) };
        case 'dice': return { dice: (q.options || []).slice(0, Math.max(1, q.n || 1)) };
        case 'face': return { face: first };
        case 'diceFace': return { face: first, dice: (q.options || [])[0] };
        case 'types': return { type: first };
        case 'areas': return { area: first };
        case 'systems': return { system: first };
        case 'cards': return q.op === 'buyUpgradeReplace' || q.op === 'buyAnyUpgradeReplace'
            ? { remove: first } : { card: first };
        case 'structures': return { structure: first };
        case 'assetType':
        case 'assets': return { asset: first };
        default: return { choice: 0 };
    }
}

/** The policy that always takes the branch number n of a choice. */
const branch = (n, rest) => (st, q, trace) => {
    if (q.kind === 'choice') return { choice: n };
    return (rest || firstOption)(st, q, trace);
};

/** The card the player resolved in the round before: laid into the table. */
function playedBefore(st, side, name, round) {
    const seat = side === 'attacker' ? st.combat.attacker : st.combat.defender;
    const card = FS_DATA.combat.find(c => c.faction === st.players[seat].faction && c.name === name);
    if (!card) throw new Error('нет карты «' + name + '»');
    st.combat.cards[side].played.push({ name, card, side, round: round || 1 });
}

const cardOf = name => FS_DATA.combat.find(c => c.faction === MECH && c.name === name);

// ============================================================================
//  04-combat-cards.md — Адептус Механикус: 5 базовых карт и 9 улучшений
// ============================================================================
const faction = FS_DATA.factions.find(f => f.id === FACTION);
console.log(C.b + '\nForbidden Stars: карты фракции «' + (faction ? faction.name : FACTION) + '»' + C.r);
console.log(C.dim + 'сверка с docs/forbidden-stars: 02 (планшет), 04 (боевые), 05 (приказы), 06 (события)' + C.r);

// ---------------------------------------------------------------------------
head('Боевая колода', MECH);

// --- 1. Почитание духа машины ----------------------------------------------
// «Повторите основную способность карты, разыгранной в предыдущем раунде боя.»
// «*Скитарии/Крейсер:* получите 1 `def. token`.»
check('Почитание духа машины', 'общая способность повторяет карту прошлого раунда: 2 `def. token` «Авангарда» + 1 свой', () => {
    const st = battle({ card: 'Почитание духа машины', round: 2, units: { 'скитарии': 2 }, foeUnits: { 'гвардейцы': 2 } });
    playedBefore(st, 'attacker', 'Авангард скитариев', 1);
    refuseReinforce(st);
    play(st, 0, 0);
    return eq(tokens(st, 'attacker').def, 3, 'жетонов обороны');
});

check('Почитание духа машины', 'в первом раунде повторять нечего — только 1 `def. token` способности отряда', () => {
    const st = battle({ card: 'Почитание духа машины', units: { 'скитарии': 2 }, foeUnits: { 'гвардейцы': 2 } });
    refuseReinforce(st);
    play(st, 0, 0);
    return eq(tokens(st, 'attacker').def, 1, 'жетонов обороны');
});

check('Почитание духа машины', 'повторяется общая коробка, а не способность отряда той карты', () => {
    // «Ржавые сталкеры»: general gives 1 `att. cube`, its unit ability a die of
    // morale or tokens by the combat value. The repeat takes the general box.
    const st = battle({ card: 'Почитание духа машины', round: 2, units: { 'скитарии': 2 }, foeUnits: { 'гвардейцы': 2 }, dice: ['att'] });
    playedBefore(st, 'attacker', 'Ржавые сталкеры', 1);
    refuseReinforce(st);
    play(st, 0, 0);
    return eq([count(st, 'attacker', 'att'), tokens(st, 'attacker').def], [2, 1], 'кубов атаки и жетонов обороны');
});

// --- 2. Техножрецы ----------------------------------------------------------
// «Восстановите 1 деморализованный отряд, либо получите 1 `def. token` или 1 `att. token`.»
check('Техножрецы', 'выбор из трёх: восстановление деморализованного отряда', () => {
    const st = battle({ card: 'Техножрецы', units: { 'скитарии': 2 }, foeUnits: { 'гвардейцы': 2 }, routed: [0] });
    refuseReinforce(st);
    play(st, 0, 0, branch(0));
    return eq([myUnits(st).filter(u => u.routed).length, tokens(st, 'attacker').def, tokens(st, 'attacker').att],
        [0, 0, 0], 'деморализованных отрядов и жетонов');
});

check('Техножрецы', 'выбор из трёх: 1 `def. token`', () => {
    const st = battle({ card: 'Техножрецы', units: { 'скитарии': 2 }, foeUnits: { 'гвардейцы': 2 } });
    refuseReinforce(st);
    play(st, 0, 0, branch(1));
    return eq([tokens(st, 'attacker').def, tokens(st, 'attacker').att], [1, 0], 'жетонов');
});

check('Техножрецы', 'выбор из трёх: 1 `att. token`', () => {
    const st = battle({ card: 'Техножрецы', units: { 'скитарии': 2 }, foeUnits: { 'гвардейцы': 2 } });
    refuseReinforce(st);
    play(st, 0, 0, branch(2));
    return eq([tokens(st, 'attacker').def, tokens(st, 'attacker').att], [0, 1], 'жетонов');
});

check('Техножрецы', 'способность отряда: 1 `def. cube`', () => {
    const st = battle({ card: 'Техножрецы', units: { 'скитарии': 2 }, foeUnits: { 'гвардейцы': 2 }, dice: ['att'] });
    refuseReinforce(st);
    play(st, 0, 0, branch(1));
    return eq([count(st, 'attacker', 'def'), dice(st, 'attacker').length], [1, 2], 'кубов обороны и всего кубов');
});

check('Техножрецы', 'требование отряда: нет скитариев или крейсера — способность отряда не работает', () => {
    const st = battle({ card: 'Техножрецы', units: { 'тяжелые-титаны': 1 }, foeUnits: { 'гвардейцы': 2 }, dice: ['att'] });
    refuseReinforce(st);
    play(st, 0, 0, branch(1));
    return eq(dice(st, 'attacker').length, 1, 'кубов');
});

// --- 3. Авангард скитариев --------------------------------------------------
// «Получите 2 `def. token`.»
// «*Скитарии/Крейсер:* на этапе нанесения урона в этом раунде вы можете нанести
//  его вашим деморализованным отрядам.»
check('Авангард скитариев', '2 `def. token`', () => {
    const st = battle({ card: 'Авангард скитариев', units: { 'скитарии': 2 }, foeUnits: { 'гвардейцы': 2 } });
    refuseReinforce(st);
    play(st, 0, 0);
    return eq(tokens(st, 'attacker').def, 2, 'жетонов обороны');
});

check('Авангард скитариев', 'урон этого раунда можно назначить своим деморализованным отрядам', () => {
    const st = battle({ card: 'Авангард скитариев', units: { 'скитарии': 2 }, foeUnits: { 'гвардейцы': 2 }, routed: [0] });
    const before = FS_RULES.damageCandidates(st, 'attacker').map(x => x.id);
    refuseReinforce(st);
    play(st, 0, 0);
    const after = FS_RULES.damageCandidates(st, 'attacker').map(x => x.id);
    const routedId = myUnits(st)[0].id;
    ok(!before.includes(routedId), 'до карты деморализованный отряд не был целью');
    ok(after.includes(routedId), 'после карты деморализованный отряд стал целью урона');
    return true;
});

check('Авангард скитариев', 'разрешение действует только в этом раунде боя', () => {
    const st = battle({ card: 'Авангард скитариев', units: { 'скитарии': 2 }, foeUnits: { 'гвардейцы': 2 }, routed: [0], roundEnd: true });
    refuseReinforce(st);
    play(st, 0, 0);
    const routedId = myUnits(st)[0].id;
    ok(FS_RULES.damageCandidates(st, 'attacker').map(x => x.id).includes(routedId),
        'в первом раунде деморализованный отряд — цель урона');
    nextRound(st);                                          // the next execution round
    return ok(!FS_RULES.damageCandidates(st, 'attacker').map(x => x.id).includes(routedId),
        'во втором раунде деморализованный отряд снова не цель');
});

// --- 4. Скитарии-инфильтраторы ---------------------------------------------
// «Если вы — атакующий, подсмотрите карту оппонента. Получите либо 1 `def. cube`,
//  либо 1 `att. cube`.»
// «*Скитарии/Крейсер:* получите 1 `morale cube`, 2 `att. token` или 2 `def. token`.»
check('Скитарии-инфильтраторы', 'атакующий подсматривает карту оппонента', () => {
    const st = battle({ card: 'Скитарии-инфильтраторы', foeCard: 'Приказ пехоте', units: { 'скитарии': 2 }, foeUnits: { 'гвардейцы': 2 }, dice: ['att'] });
    refuseReinforce(st);
    // Stop immediately after the peek, while the defender's card is still
    // face down and the next ability is waiting for a decision.
    ok(FS_RULES.apply(st, 0, { type: 'combat', action: 'playCard', index: 0 }).ok, 'атакующий выбрал карту');
    ok(FS_RULES.apply(st, 1, { type: 'combat', action: 'playCard', index: 0 }).ok, 'защитник выбрал карту');
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: {} }).ok, 'атакующий подсмотрел карту');
    ok(st.pending && st.combat.staged.defender, 'карта защитника ещё закрыта');
    const view = FS_RULES.view(st, 0);
    const otherView = FS_RULES.view(st, 1);
    // Test the actual redacted network views as well as the authoritative state:
    // the browser renders the former, not the server's seat-indexed peek map.
    const mine = panel(view, 0).sides.find(s => s.side === 'defender');
    const his = panel(otherView, 1).sides.find(s => s.side === 'attacker');
    return eq([st.combat.peek[0], view.combat.peek && view.combat.peek.name,
        mine && mine.peeked && mine.peeked.name, his && his.peeked],
    ['Приказ пехоте', 'Приказ пехоте', 'Приказ пехоте', null], 'подсмотренная карта');
});

check('Скитарии-инфильтраторы', 'подсмотренная карта не остаётся в следующем раунде', () => {
    const st = battle({ card: 'Скитарии-инфильтраторы', foeCard: 'Ложись!',
        units: { 'скитарии': 2 }, foeUnits: { 'гвардейцы': 2 }, dice: [], foeDice: [], roundEnd: true });
    refuseReinforce(st);
    play(st, 0, 0);
    eq(st.combat.peek[0], 'Ложись!', 'подсмотрена карта первого раунда');
    nextRound(st);
    const view = FS_RULES.view(st, 0);
    const opponent = panel(view, 0).sides.find(s => s.side === 'defender');
    return eq([view.combat.peek, opponent && opponent.peeked], [null, null],
        'карта предыдущего раунда не выдаётся за новую');
});

check('Скитарии-инфильтраторы', 'закрытая карта не попадает в общий журнал для третьего игрока', () => {
    const st = FS_RULES.newBattleTest({
        seed: 5,
        players: players().concat([{ faction: 'некроны', name: 'Наблюдатель', id: 'p2' }]),
        units: { 'скитарии': 2 }, foeUnits: { 'гвардейцы': 2 },
    });
    st.combat.cards.attacker.hand = ['Скитарии-инфильтраторы'];
    st.combat.cards.defender.hand = ['Ложись!'];
    refuseReinforce(st);
    ok(FS_RULES.apply(st, 0, { type: 'combat', action: 'playCard', index: 0 }).ok, 'атакующий выбрал карту');
    ok(FS_RULES.apply(st, 1, { type: 'combat', action: 'playCard', index: 0 }).ok, 'защитник выбрал карту');
    eq(st.pending && st.pending.question.kind, 'ability', 'атакующий решает, подсмотреть ли карту');
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: {} }).ok, 'атакующий подсмотрел карту');
    ok(st.pending && st.combat.staged.defender, 'карта защитника ещё лежит закрытой, ожидается выбор атакующего');
    eq(FS_RULES.view(st, 0).combat.peek.name, 'Ложись!', 'атакующий видит подсмотренную карту');
    const spectator = FS_RULES.view(st, 2);
    eq(spectator.combat.peek, null, 'третьему игроку подсмотренная карта не показывается');
    ok(!spectator.log.some(line => line.text.includes('Ложись!')), 'в общем журнале нет названия закрытой карты');
});

check('Скитарии-инфильтраторы', 'отказ от подсматривания не отменяет отдельный выбор кубика', () => {
    const st = battle({ card: 'Скитарии-инфильтраторы', foeCard: 'Ложись!',
        units: { 'тяжелые-титаны': 1 }, foeUnits: { 'гвардейцы': 2 }, dice: [] });
    refuseReinforce(st);
    let refused = false;
    play(st, 0, 0, (s, q) => {
        if (!refused && q.kind === 'ability' && /подсмотр/i.test(q.text)) {
            refused = true;
            return { no: true };
        }
        return q.kind === 'choice' ? { choice: 1 } : firstOption(s, q);
    });
    ok(refused && (!st.combat.peek || !st.combat.peek[0]), 'атакующий отказался подсматривать');
    return eq(count(st, 'attacker', 'att'), 1, 'куб атаки всё равно получен');
});

check('Скитарии-инфильтраторы', 'защитник не подсматривает, но получает кубик из отдельного предложения', () => {
    // 04-combat-cards.md: «Получите либо…» is a separate sentence, not part
    // of the attack-only look at the closed card.
    const st = FS_RULES.newBattleTest({
        seed: 5,
        players: [{ faction: FOE, name: 'ИГ', id: 'p0' }, { faction: MECH, name: 'Мех', id: 'p1' }],
        units: { 'гвардейцы': 2 }, foeUnits: { 'скитарии': 2 },
    });
    st.combat.cards.attacker.hand = ['Ложись!'];
    st.combat.cards.defender.hand = ['Скитарии-инфильтраторы'];
    st.combat.dice.defender = [];
    refuseReinforce(st);
    ok(FS_RULES.apply(st, 0, { type: 'combat', action: 'playCard', index: 0 }).ok, 'атакующий выбрал карту');
    ok(FS_RULES.apply(st, 1, { type: 'combat', action: 'playCard', index: 0 }).ok, 'защитник выбрал карту');
    answerAll(st, (s, q) => q.kind === 'ability' ? { no: true } : firstOption(s, q), 0);
    const trace = answerAll(st, (s, q) => q.kind === 'choice' ? { choice: 0 } : firstOption(s, q), 1);
    ok(!st.combat.peek || !st.combat.peek[1], 'защитник не подсмотрел карту');
    ok(trace.some(t => t.kind === 'choice' && /def\. cube/.test(t.text)), 'защитнику предложен выбор основного кубика');
    return eq([count(st, 'defender', 'def'), count(st, 'defender', 'morale')], [1, 1],
        'основной куб обороны и куб морали способности отряда');
});

check('Скитарии-инфильтраторы', 'выбор: 1 `def. cube` либо 1 `att. cube`', () => {
    const st = battle({ card: 'Скитарии-инфильтраторы', units: { 'тяжелые-титаны': 1 }, foeUnits: { 'гвардейцы': 2 }, dice: [] });
    refuseReinforce(st);
    play(st, 0, 0, branch(1, (s, q) => q.kind === 'choice' ? { choice: 1 } : firstOption(s, q)));
    return eq([count(st, 'attacker', 'att'), count(st, 'attacker', 'def')], [1, 0], 'кубов');
});

check('Скитарии-инфильтраторы', 'способность отряда: выбор из трёх — куб морали, 2 `att. token` или 2 `def. token`', () => {
    const res = [];
    for (const n of [0, 1, 2]) {
        const st = battle({ card: 'Скитарии-инфильтраторы', units: { 'скитарии': 2 }, foeUnits: { 'гвардейцы': 2 }, dice: [] });
        refuseReinforce(st);
        // The first choice is the general ability, the second is the unit one.
        let seen = 0;
        play(st, 0, 0, (s, q, trace) => {
            if (q.kind === 'choice') { seen++; return { choice: seen === 1 ? 0 : n }; }
            return firstOption(s, q);
        });
        res.push([count(st, 'attacker', 'morale'), tokens(st, 'attacker').att, tokens(st, 'attacker').def]);
    }
    return eq(res, [[1, 0, 0], [0, 2, 0], [0, 0, 2]], 'куб морали / жетоны атаки / жетоны обороны');
});

// --- 5. Ржавые сталкеры -----------------------------------------------------
// «Получите 1 `att. cube`.»
// «*Скитарии/Крейсер:* либо получите 1 `morale cube`, либо выберите 1 ваш
//  недеморализованный отряд и получите количество `att. token`, равное его
//  боевому уровню.»
check('Ржавые сталкеры', '1 `att. cube`', () => {
    const st = battle({ card: 'Ржавые сталкеры', units: { 'тяжелые-титаны': 1 }, foeUnits: { 'гвардейцы': 2 }, dice: [] });
    refuseReinforce(st);
    play(st, 0, 0);
    return eq(count(st, 'attacker', 'att'), 1, 'кубов атаки');
});

check('Ржавые сталкеры', 'способность отряда: 1 `morale cube`', () => {
    const st = battle({ card: 'Ржавые сталкеры', units: { 'скитарии': 2 }, foeUnits: { 'гвардейцы': 2 }, dice: [] });
    refuseReinforce(st);
    play(st, 0, 0, (s, q) => q.kind === 'choice' ? { choice: 0 } : firstOption(s, q));
    return eq([count(st, 'attacker', 'morale'), tokens(st, 'attacker').att], [1, 0], 'куб морали и жетоны атаки');
});

check('Ржавые сталкеры', 'способность отряда: жетоны атаки по боевому значению выбранного отряда', () => {
    // Скитарии — боевое значение 2, тяжёлый титан — 3.
    const out = [];
    for (const pick of [0, 1]) {
        const st = battle({ card: 'Ржавые сталкеры', units: { 'скитарии': 1, 'тяжелые-титаны': 1 }, foeUnits: { 'гвардейцы': 2 }, dice: [] });
        refuseReinforce(st);
        play(st, 0, 0, (s, q) => {
            if (q.kind === 'choice') return { choice: 1 };
            if (q.kind === 'units') return { units: [(q.options || [])[pick]] };
            return firstOption(s, q);
        });
        out.push(tokens(st, 'attacker').att);
    }
    return eq(out, [2, 3], 'жетонов атаки за скитария и за титана');
});

check('Ржавые сталкеры', 'деморализованный отряд выбрать нельзя', () => {
    const st = battle({ card: 'Ржавые сталкеры', units: { 'скитарии': 2 }, foeUnits: { 'гвардейцы': 2 }, dice: [], routed: [0] });
    refuseReinforce(st);
    const trace = play(st, 0, 0, (s, q) => q.kind === 'choice' ? { choice: 1 } : firstOption(s, q));
    const asked = trace.filter(t => t.kind === 'units' && t.op === 'gainByUnit').pop();
    return eq((asked.options || []).length, 1, 'недеморализованных отрядов в выборе');
});

// --- 6. Трансцендентная дума ------------------------------------------------
// «*Скитарии/Крейсер:* заставьте оппонента сбросить один любой кубик по его
//  усмотрению, и затем получите себе соответствующий кубик.»
check('Трансцендентная дума', 'противник теряет кубик, вы получаете такой же', () => {
    const st = battle({ card: 'Трансцендентная дума', units: { 'скитарии': 2 }, foeUnits: { 'гвардейцы': 2 }, dice: ['att'], foeDice: ['att', 'def', 'morale'] });
    refuseReinforce(st);
    const trace = play(st, 0, 0);
    const ask = trace.find(t => t.op === 'stealDie');
    ok(ask && ask.seat === 1, 'кубик выбирает противник');
    return eq([dice(st, 'defender').length, count(st, 'attacker', 'att')], [2, 2], 'кубов противника и ваших кубов атаки');
});

check('Трансцендентная дума', 'соответствующий кубик — той же грани, что сброшенная', () => {
    const st = battle({ card: 'Трансцендентная дума', units: { 'скитарии': 2 }, foeUnits: { 'гвардейцы': 2 }, dice: [], foeDice: ['att', 'def', 'morale'] });
    refuseReinforce(st);
    play(st, 0, 0, (s, q) => q.op === 'stealDie' ? { dice: [2] } : firstOption(s, q));
    return eq([dice(st, 'attacker'), dice(st, 'defender')], [['morale'], ['att', 'def']], 'грани кубиков');
});

// --- 7. Лютая бионика -------------------------------------------------------
// «Получите либо 1 `att. cube`, либо 1 `att. token`.»
// «*Катафрон/Крейсер:* получите 2 `def. token`, если оппонент не удалит 1 `def. cube`.»
check('Лютая бионика', 'общая способность: выбор кубика или жетона атаки', () => {
    const st = battle({ card: 'Лютая бионика', units: { 'тяжелые-титаны': 1 }, foeUnits: { 'гвардейцы': 2 }, dice: [] });
    refuseReinforce(st);
    play(st, 0, 0, (s, q) => q.kind === 'choice' ? { choice: 1 } : firstOption(s, q));
    return eq([tokens(st, 'attacker').att, dice(st, 'attacker').length], [1, 0], 'жетонов и кубов атаки');
});

check('Лютая бионика', 'противник удаляет 1 `def. cube` — жетонов нет', () => {
    const st = battle({ card: 'Лютая бионика', units: { 'катафроны': 1 }, foeUnits: { 'гвардейцы': 2 }, dice: [], foeDice: ['att', 'def'] });
    refuseReinforce(st);
    const trace = play(st, 0, 0);
    const ask = trace.find(t => t.op === 'avoid');
    ok(ask && ask.seat === 1, 'плату выбирает противник');
    return eq([tokens(st, 'attacker').def, count(st, 'defender', 'def')], [0, 0], 'жетонов обороны у вас и кубов обороны у противника');
});

check('Лютая бионика', 'противник не платит — 2 `def. token`', () => {
    const st = battle({ card: 'Лютая бионика', units: { 'катафроны': 1 }, foeUnits: { 'гвардейцы': 2 }, dice: [], foeDice: ['att', 'def'] });
    refuseReinforce(st);
    play(st, 0, 0, (s, q) => q.op === 'avoid' ? {} : firstOption(s, q));
    return eq([tokens(st, 'attacker').def, count(st, 'defender', 'def')], [2, 1], 'жетонов обороны и кубов противника');
});

check('Лютая бионика', 'платить противнику нечем — 2 `def. token` без вопроса', () => {
    const st = battle({ card: 'Лютая бионика', units: { 'катафроны': 1 }, foeUnits: { 'гвардейцы': 2 }, dice: [], foeDice: ['att', 'att'] });
    refuseReinforce(st);
    const trace = play(st, 0, 0);
    return ok(!trace.some(t => t.op === 'avoid'), 'вопроса об оплате нет')
        && eq(tokens(st, 'attacker').def, 2, 'жетонов обороны');
});

// --- 8. Подавление агрессии -------------------------------------------------
// «Получите либо 1 `def. cube`, либо 1 `def. token`.»
// «*Катафрон/Крейсер:* получите 2 `att. token`, если ваш оппонент не удалит 1 `att. cube`.»
check('Подавление агрессии', 'общая способность: выбор кубика или жетона обороны', () => {
    const st = battle({ card: 'Подавление агрессии', units: { 'тяжелые-титаны': 1 }, foeUnits: { 'гвардейцы': 2 }, dice: [] });
    refuseReinforce(st);
    play(st, 0, 0, (s, q) => q.kind === 'choice' ? { choice: 0 } : firstOption(s, q));
    return eq([count(st, 'attacker', 'def'), tokens(st, 'attacker').def], [1, 0], 'кубов и жетонов обороны');
});

check('Подавление агрессии', 'противник удаляет 1 `att. cube` — жетонов нет', () => {
    const st = battle({ card: 'Подавление агрессии', units: { 'катафроны': 1 }, foeUnits: { 'гвардейцы': 2 }, dice: [], foeDice: ['att', 'def'] });
    refuseReinforce(st);
    play(st, 0, 0);
    return eq([tokens(st, 'attacker').att, count(st, 'defender', 'att')], [0, 0], 'жетонов атаки и кубов атаки противника');
});

check('Подавление агрессии', 'противник не платит — 2 `att. token`', () => {
    const st = battle({ card: 'Подавление агрессии', units: { 'крепкие-крейсеры': 1 }, kind: 'space', foeUnits: { 'крейсеры': 2 }, dice: [], foeDice: ['att'] });
    refuseReinforce(st);
    play(st, 0, 0, (s, q) => q.op === 'avoid' ? {} : firstOption(s, q));
    return eq(tokens(st, 'attacker').att, 2, 'жетонов атаки');
});

// --- 9. Жизнеотсос ----------------------------------------------------------
// «Сконвертируйте 1 из ваших кубов в `morale cube`. Либо получите 1 `any cube`,
//  либо активируйте способность подразделения с карты, разыгранной в
//  предыдущем раунде боя.»
check('Жизнеотсос', 'один ваш куб превращается в `morale cube`', () => {
    const st = battle({ card: 'Жизнеотсос', units: { 'тяжелые-титаны': 1 }, foeUnits: { 'гвардейцы': 2 }, dice: ['att', 'def'] });
    refuseReinforce(st);
    // The second sentence repeats the card of the round before — there is none,
    // so only the conversion of the first sentence is visible in the dice.
    play(st, 0, 0, (s, q) => {
        if (q.op === 'flipDie') return { dice: [0] };
        if (q.kind === 'choice') return { choice: 1 };
        return firstOption(s, q);
    });
    return eq(dice(st, 'attacker').slice().sort(), ['def', 'morale'], 'кубы после конвертации');
});

check('Жизнеотсос', 'вторая ветвь выбора: 1 `any cube`', () => {
    const st = battle({ card: 'Жизнеотсос', units: { 'тяжелые-титаны': 1 }, foeUnits: { 'гвардейцы': 2 }, dice: ['att'] });
    refuseReinforce(st);
    play(st, 0, 0, (s, q) => {
        if (q.op === 'flipDie') return { dice: [0] };
        if (q.kind === 'choice') return { choice: 0 };
        return firstOption(s, q);
    });
    return eq(dice(st, 'attacker').length, 2, 'кубов: конвертированный плюс полученный');
});

check('Жизнеотсос', 'вторая ветвь выбора: способность отряда карты прошлого раунда', () => {
    // «Техножрецы»: способность отряда даёт 1 `def. cube`.
    const st = battle({ card: 'Жизнеотсос', round: 2, units: { 'скитарии': 2 }, foeUnits: { 'гвардейцы': 2 }, dice: ['att'] });
    playedBefore(st, 'attacker', 'Техножрецы', 1);
    refuseReinforce(st);
    play(st, 0, 0, (s, q) => {
        if (q.op === 'flipDie') return { dice: [0] };
        if (q.kind === 'choice') return { choice: 1 };
        return firstOption(s, q);
    });
    return eq(count(st, 'attacker', 'def'), 1, 'кубов обороны от повторённой способности');
});

check('Жизнеотсос', 'требование отряда повторяемой карты проверяется заново', () => {
    // «Техножрецы» требуют скитариев или крейсера: в бою только титан.
    const st = battle({ card: 'Жизнеотсос', round: 2, units: { 'тяжелые-титаны': 1 }, foeUnits: { 'гвардейцы': 2 }, dice: ['att'] });
    playedBefore(st, 'attacker', 'Техножрецы', 1);
    refuseReinforce(st);
    play(st, 0, 0, (s, q) => {
        if (q.op === 'flipDie') return { dice: [0] };
        if (q.kind === 'choice') return { choice: 1 };
        return firstOption(s, q);
    });
    return eq(count(st, 'attacker', 'def'), 0, 'кубов обороны');
});

// --- 10. Превосходство машин -----------------------------------------------
// «Получите 1 `any cube` или 2 `att. token`. Удалите 1 `morale cube`, чтобы
//  восстановить 1 деморализованный отряд.»
// «*Онагр/Ковчег:* сконвертируйте до 2 ваших `def. cube` в `att. cube`.
//  Заставьте оппонента сконвертировать до 2 его кубов определённого значения в
//  любое другое значение по его выбору.»
check('Превосходство машин', 'выбор: 1 `any cube` либо 2 `att. token`', () => {
    const out = [];
    for (const n of [0, 1]) {
        const st = battle({ card: 'Превосходство машин', units: { 'тяжелые-титаны': 1 }, foeUnits: { 'гвардейцы': 2 }, dice: [] });
        refuseReinforce(st);
        play(st, 0, 0, (s, q) => q.kind === 'choice' ? { choice: n } : firstOption(s, q));
        out.push([dice(st, 'attacker').length, tokens(st, 'attacker').att]);
    }
    return eq(out, [[1, 0], [0, 2]], 'куб либо два жетона атаки');
});

check('Превосходство машин', 'удаление 1 `morale cube` восстанавливает деморализованный отряд', () => {
    const st = battle({ card: 'Превосходство машин', units: { 'скитарии': 2 }, foeUnits: { 'гвардейцы': 2 }, dice: ['morale'], routed: [0] });
    refuseReinforce(st);
    play(st, 0, 0);
    return eq([count(st, 'attacker', 'morale'), myUnits(st).filter(u => u.routed).length], [0, 0], 'кубов морали и деморализованных отрядов');
});

check('Превосходство машин', 'нет `morale cube` — отряд не восстановлен', () => {
    const st = battle({ card: 'Превосходство машин', units: { 'скитарии': 2 }, foeUnits: { 'гвардейцы': 2 }, dice: ['att'], routed: [0] });
    refuseReinforce(st);
    play(st, 0, 0);
    return eq(myUnits(st).filter(u => u.routed).length, 1, 'деморализованных отрядов');
});

check('Превосходство машин', 'способность отряда: до 2 `def. cube` превращаются в `att. cube`', () => {
    const st = battle({ card: 'Превосходство машин', units: { 'онагры': 1 }, foeUnits: { 'гвардейцы': 2 }, dice: ['def', 'def', 'def', 'att'], foeDice: ['morale'] });
    refuseReinforce(st);
    play(st, 0, 0, (s, q) => {
        // The general ability takes the tokens, so the dice stay as they were.
        if (q.kind === 'choice') return { choice: 1 };
        if (q.op === 'flipDie') return { dice: (q.options || []).slice(0, 2) };
        return firstOption(s, q);
    });
    return eq([count(st, 'attacker', 'att'), count(st, 'attacker', 'def')], [3, 1], 'кубов атаки и обороны');
});

check('Превосходство машин', 'противник сам выбирает значение и во что его превратить', () => {
    const st = battle({ card: 'Превосходство машин', units: { 'онагры': 1 }, foeUnits: { 'гвардейцы': 2 }, dice: ['att'], foeDice: ['att', 'att', 'att', 'def'] });
    refuseReinforce(st);
    const trace = play(st, 0, 0, (s, q) => {
        if (q.kind === 'face') return { face: 'att' };
        if (q.op === 'convertFoeDice') return { choice: 1 };        // 'morale'
        return firstOption(s, q);
    });
    const who = trace.filter(t => t.op === 'convertFoeDice').map(t => t.seat);
    ok(who.length === 2 && who.every(x => x === 1), 'оба вопроса заданы противнику, получено: ' + JSON.stringify(who));
    return eq([count(st, 'defender', 'morale'), count(st, 'defender', 'att'), count(st, 'defender', 'def')], [2, 1, 1], 'кубы противника');
});

// --- 11. Шустрое судно ------------------------------------------------------
// «Сконвертируйте до 2 ваших `att. cube` в `morale cube`. Удалите 1 `morale cube`,
//  чтобы получить 3 `def. token`.»
// «*Онагр/Ковчег:* не сбрасывайте ваши `def. token` в конце этого раунда боя.»
check('Шустрое судно', 'до 2 `att. cube` превращаются в `morale cube`', () => {
    const st = battle({ card: 'Шустрое судно', units: { 'тяжелые-титаны': 1 }, foeUnits: { 'гвардейцы': 2 }, dice: ['att', 'att', 'att', 'def'] });
    refuseReinforce(st);
    // The second sentence (the morale cube for the tokens) is refused, so that
    // only the conversion of the first one is visible in the dice.
    let seen = 0;
    play(st, 0, 0, (s, q) => {
        if (q.kind === 'ability') { seen++; return seen === 2 ? { no: true } : {}; }
        if (q.op === 'flipDie') return { dice: (q.options || []).slice(0, 2) };
        return firstOption(s, q);
    });
    return eq([count(st, 'attacker', 'att'), count(st, 'attacker', 'morale')], [1, 2], 'кубов атаки и морали');
});

check('Шустрое судно', 'удаление 1 `morale cube` даёт 3 `def. token`', () => {
    const st = battle({ card: 'Шустрое судно', units: { 'тяжелые-титаны': 1 }, foeUnits: { 'гвардейцы': 2 }, dice: ['att', 'att'] });
    refuseReinforce(st);
    play(st, 0, 0, (s, q) => q.op === 'flipDie' ? { dice: (q.options || []).slice(0, 2) } : firstOption(s, q));
    return eq([count(st, 'attacker', 'morale'), tokens(st, 'attacker').def], [1, 3], 'кубов морали и жетонов обороны');
});

check('Шустрое судно', 'нет `morale cube` — жетонов нет', () => {
    const st = battle({ card: 'Шустрое судно', units: { 'тяжелые-титаны': 1 }, foeUnits: { 'гвардейцы': 2 }, dice: ['def', 'def'] });
    refuseReinforce(st);
    play(st, 0, 0);
    return eq(tokens(st, 'attacker').def, 0, 'жетонов обороны');
});

check('Шустрое судно', 'жетоны обороны не сбрасываются в конце раунда', () => {
    const st = battle({ card: 'Шустрое судно', units: { 'онагры': 1 }, foeUnits: { 'гвардейцы': 2 }, dice: ['att', 'att'], roundEnd: true });
    refuseReinforce(st);
    play(st, 0, 0, (s, q) => q.op === 'flipDie' ? { dice: (q.options || []).slice(0, 2) } : firstOption(s, q));
    const before = tokens(st, 'attacker').def;
    nextRound(st);                                          // the end of the execution round
    return eq([before, tokens(st, 'attacker').def, tokens(st, 'attacker').att], [3, 3, 0], 'жетонов до и после конца раунда');
});

check('Шустрое судно', 'без способности отряда жетоны обороны сбрасываются', () => {
    const st = battle({ card: 'Шустрое судно', units: { 'тяжелые-титаны': 1 }, foeUnits: { 'гвардейцы': 2 }, dice: ['att', 'att'], roundEnd: true });
    refuseReinforce(st);
    play(st, 0, 0, (s, q) => q.op === 'flipDie' ? { dice: (q.options || []).slice(0, 2) } : firstOption(s, q));
    const before = tokens(st, 'attacker').def;
    nextRound(st);
    return eq([before, tokens(st, 'attacker').def], [3, 0], 'жетонов обороны после конца раунда');
});

check('Шустрое судно', 'жетоны атаки карта не сохраняет', () => {
    const st = battle({ card: 'Шустрое судно', units: { 'онагры': 1 }, foeUnits: { 'гвардейцы': 2 }, dice: ['att', 'att'], roundEnd: true });
    refuseReinforce(st);
    play(st, 0, 0, (s, q) => q.op === 'flipDie' ? { dice: (q.options || []).slice(0, 2) } : firstOption(s, q));
    st.combat.tokens.attacker.att = 2;                      // tokens of another card
    nextRound(st);
    return eq([tokens(st, 'attacker').def, tokens(st, 'attacker').att], [3, 0], 'жетонов обороны и атаки');
});

// --- 12. Жёсткий залп -------------------------------------------------------
// «Получите 1 `att. token`.»
// «*Скитарии/Катафрон/Онагр:* деморализуйте 1 вражеского юнита, командный уровень
//  которого не превышает командный уровень вашего сильнейшего недеморализованного
//  юнита.»
check('Жёсткий залп', '1 `att. token`', () => {
    const st = battle({ card: 'Жёсткий залп', units: { 'тяжелые-титаны': 1 }, foeUnits: { 'гвардейцы': 2 } });
    refuseReinforce(st);
    play(st, 0, 0);
    return eq(tokens(st, 'attacker').att, 1, 'жетонов атаки');
});

check('Жёсткий залп', 'цель — только отряд с КЛ не выше вашего сильнейшего', () => {
    // Ваши отряды: скитарии (КЛ 0). У противника гвардейцы (КЛ 0), огрины (КЛ 1)
    // и титаны (КЛ 3) — два последних целью быть не могут.
    const st = battle({ card: 'Жёсткий залп', units: { 'скитарии': 2 }, foeUnits: { 'гвардейцы': 1, 'огрины': 1, 'титаны': 1 } });
    refuseReinforce(st);
    const trace = play(st, 0, 0);
    const ask = trace.find(t => t.op === 'route');
    const offered = (ask.options || []).map(id => {
        const u = st.units.find(x => x.id === id);
        const d = FS_RULES.unitOf(st, u);
        return d ? d.name + '/КЛ' + d.kl : id;
    });
    return eq(offered, ['Гвардейцы/КЛ0'], 'предложенные цели');
});

check('Жёсткий залп', 'сильнейший отряд задаёт потолок: титан (КЛ 3) открывает все цели', () => {
    const st = battle({ card: 'Жёсткий залп', units: { 'скитарии': 1, 'тяжелые-титаны': 1 }, foeUnits: { 'гвардейцы': 1, 'титаны': 1 } });
    refuseReinforce(st);
    const trace = play(st, 0, 0);
    const ask = trace.find(t => t.op === 'route');
    return eq((ask.options || []).length, 2, 'целей с КЛ не выше 3');
});

check('Жёсткий залп', 'деморализованный отряд противника целью не предлагается', () => {
    const st = battle({ card: 'Жёсткий залп', units: { 'скитарии': 2 }, foeUnits: { 'гвардейцы': 2 }, foeRouted: [0] });
    refuseReinforce(st);
    const trace = play(st, 0, 0);
    const ask = trace.find(t => t.op === 'route');
    return eq((ask.options || []).length, 1, 'недеморализованных целей');
});

// --- 13. Месть духа машины --------------------------------------------------
// «Получите либо 1 `def. cube`, либо 1 `def. token`. Конвертируйте до 2 ваших
//  `att. cube` в `def. cube`.»
// «*Титан/Ковчег:* за каждый ваш `def. cube`, по счёту превышающий количество
//  вражеских `att. cube`, получите 1 `att. token` (вплоть до 4).»
check('Месть духа машины', 'выбор: 1 `def. cube` либо 1 `def. token`', () => {
    const st = battle({ card: 'Месть духа машины', units: { 'тяжелые-титаны': 1 }, foeUnits: { 'гвардейцы': 2 }, dice: [] });
    refuseReinforce(st);
    play(st, 0, 0, (s, q) => q.kind === 'choice' ? { choice: 0 } : firstOption(s, q));
    return eq([count(st, 'attacker', 'def'), tokens(st, 'attacker').def], [1, 0], 'кубов и жетонов обороны');
});

check('Месть духа машины', 'до 2 `att. cube` конвертируются в `def. cube`', () => {
    const st = battle({ card: 'Месть духа машины', units: { 'тяжелые-титаны': 1 }, foeUnits: { 'гвардейцы': 2 }, dice: ['att', 'att', 'att'], foeDice: ['morale'] });
    refuseReinforce(st);
    play(st, 0, 0, (s, q) => {
        if (q.kind === 'choice') return { choice: 1 };
        if (q.op === 'flipDie') return { dice: (q.options || []).slice(0, 2) };
        return firstOption(s, q);
    });
    return eq([count(st, 'attacker', 'def'), count(st, 'attacker', 'att')], [2, 1], 'кубов обороны и атаки');
});

check('Месть духа машины', 'жетоны атаки за превышение числа кубов обороны, но не больше 4', () => {
    // 5 ваших `def. cube` против 2 вражеских `att. cube` — разница 3. Общая
    // способность берёт жетон, а не кубик: число кубов остаётся тем же.
    const st = battle({ card: 'Месть духа машины', units: { 'тяжелые-титаны': 1 }, foeUnits: { 'гвардейцы': 2 }, dice: ['def', 'def', 'def', 'def', 'def'], foeDice: ['att', 'att', 'morale'] });
    refuseReinforce(st);
    play(st, 0, 0, (s, q) => q.kind === 'choice' ? { choice: 1 } : firstOption(s, q));
    return eq(tokens(st, 'attacker').att, 3, 'жетонов атаки');
});

check('Месть духа машины', 'предел — 4 жетона, даже если разница больше', () => {
    const st = battle({ card: 'Месть духа машины', units: { 'тяжелые-титаны': 1 }, foeUnits: { 'гвардейцы': 2 }, dice: ['def', 'def', 'def', 'def', 'def', 'def'], foeDice: ['morale'] });
    refuseReinforce(st);
    play(st, 0, 0);
    return eq(tokens(st, 'attacker').att, 4, 'жетонов атаки');
});

check('Месть духа машины', 'кубов обороны не больше, чем атаки противника — жетонов нет', () => {
    const st = battle({ card: 'Месть духа машины', units: { 'тяжелые-титаны': 1 }, foeUnits: { 'гвардейцы': 2 }, dice: ['def'], foeDice: ['att', 'att', 'att'] });
    refuseReinforce(st);
    play(st, 0, 0);
    return eq(tokens(st, 'attacker').att, 0, 'жетонов атаки');
});

// --- 14. Гнев машины --------------------------------------------------------
// «Получите 3 `att. token`.»
// «*Титан/Ковчег:* вы можете удалить 1 `morale cube`, чтобы не терять свои
//  `att. token` в конце текущего раунда битвы.»
check('Гнев машины', '3 `att. token`', () => {
    const st = battle({ card: 'Гнев машины', units: { 'тяжелые-титаны': 1 }, foeUnits: { 'гвардейцы': 2 } });
    refuseReinforce(st);
    play(st, 0, 0);
    return eq(tokens(st, 'attacker').att, 3, 'жетонов атаки');
});

check('Гнев машины', 'удаление 1 `morale cube` сохраняет жетоны атаки до конца раунда', () => {
    const st = battle({ card: 'Гнев машины', units: { 'тяжелые-титаны': 1 }, foeUnits: { 'гвардейцы': 2 }, dice: ['morale'], roundEnd: true });
    refuseReinforce(st);
    play(st, 0, 0);
    nextRound(st);
    return eq([count(st, 'attacker', 'morale'), tokens(st, 'attacker').att], [0, 3], 'кубов морали и жетонов атаки');
});

check('Гнев машины', 'куб морали не удалён — жетоны атаки сброшены в конце раунда', () => {
    const st = battle({ card: 'Гнев машины', units: { 'тяжелые-титаны': 1 }, foeUnits: { 'гвардейцы': 2 }, dice: ['morale'], roundEnd: true });
    refuseReinforce(st);
    // The player refuses the ability of the unit box.
    let seen = 0;
    play(st, 0, 0, (s, q) => {
        if (q.kind === 'ability') { seen++; return seen > 1 ? { no: true } : {}; }
        return firstOption(s, q);
    });
    nextRound(st);
    return eq([count(st, 'attacker', 'morale'), tokens(st, 'attacker').att], [1, 0], 'куб морали цел, жетоны сброшены');
});

check('Гнев машины', 'нет `morale cube` — жетоны атаки не сохранить', () => {
    const st = battle({ card: 'Гнев машины', units: { 'тяжелые-титаны': 1 }, foeUnits: { 'огрины': 2 },
        dice: ['att'], foeDice: [], roundEnd: true });
    refuseReinforce(st);
    play(st, 0, 0);
    nextRound(st);
    return eq(tokens(st, 'attacker').att, 0, 'жетонов атаки после конца раунда');
});

check('Гнев машины', 'жетоны обороны карта не сохраняет', () => {
    const st = battle({ card: 'Гнев машины', units: { 'тяжелые-титаны': 1 }, foeUnits: { 'гвардейцы': 2 }, dice: ['morale'], roundEnd: true });
    refuseReinforce(st);
    play(st, 0, 0);
    st.combat.tokens.attacker.def = 2;                            // tokens from another card
    nextRound(st);
    return eq([tokens(st, 'attacker').att, tokens(st, 'attacker').def], [3, 0], 'жетонов атаки и обороны');
});


// ============================================================================
//  Карты улучшений приказов (docs/forbidden-stars/05-order-upgrades.md)
// ============================================================================
head('Карты улучшений приказов', MECH);

/** The world area of a system (its first area when the system has no world). */
function worldOf(st, systemId) {
    const sys = FS_RULES.system(st, systemId);
    return (sys.areas.find(a => a.world) || sys.areas[0]).pos;
}

/** The void area of a system, next to the world when the tile has one. */
function voidOf(st, systemId) {
    const sys = FS_RULES.system(st, systemId);
    return (sys.areas.find(a => !a.world) || sys.areas[0]).pos;
}

/**
 * A state of the operations phase with one order of the tested faction
 * revealed in its first system: the troops and the structures the check needs
 * are on the table, the upgrade cards of the check are in the hand.
 */
function orderState(kind, o = {}) {
    const st = FS_RULES.newReadyGame({
        seed: o.seed === undefined ? 5 : o.seed,
        players: players(o.faction, o.foeFaction),
    });
    st.units = [];
    st.structures = [];
    st.objectives = [];
    st.storms = [];
    for (const sys of st.systems) sys.tokens = [];
    st.phase = 'operations';
    st.turn = 0;
    st.order = null;
    // The card may name the place it works in (a world of its own capacity).
    const sys = st.systems.find(x => x.id === (o.system || st.systems[0].id)) || st.systems[0];
    const pos = o.pos || worldOf(st, sys.id);
    for (const [id, n] of Object.entries(o.units || {})) {
        for (let i = 0; i < n; i++) FS_RULES.addUnit(st, 0, id, sys.id, pos);
    }
    for (const [id, n] of Object.entries(o.foeUnits || {})) {
        for (let i = 0; i < n; i++) FS_RULES.addUnit(st, 1, id, sys.id, pos);
    }
    for (const [id, n] of Object.entries(o.ships || {})) {
        for (let i = 0; i < n; i++) FS_RULES.addUnit(st, 0, id, sys.id, voidOf(st, sys.id));
    }
    for (const s of o.structures || []) {
        st.structures.push({ id: 'str' + st.structures.length, seat: 0, type: s, system: sys.id, area: pos });
    }
    for (const s of o.foeStructures || []) {
        st.structures.push({ id: 'foestr' + st.structures.length, seat: 1, type: s, system: sys.id, area: pos });
    }
    const p = st.players[0];
    if (o.materiel !== undefined) p.materiel = o.materiel;
    if (o.assets) Object.assign(p.assets, o.assets);
    p.upgrades = (o.upgrades || []).map(name => ({ name, used: false }));
    // The routes of an advance are frozen when the order is revealed: the
    // troops of other systems must be on the table before that.
    if (typeof o.before === 'function') o.before(st, sys);
    sys.tokens.push({ seat: 0, order: kind, faceUp: false });
    const res = FS_RULES.apply(st, 0, { type: 'resolveOrder', system: sys.id });
    if (!res || res.ok === false) throw new Error('приказ не раскрыт: ' + (res && res.error));
    return st;
}

/** Burn an upgrade card of the order in play. */
const burn = (st, name) => FS_RULES.apply(st, 0, { type: 'useUpgrade', card: name });

/** The question of the pending effect, if the effect is waiting. */
const pending = st => (st.pending && st.pending.question) || null;

const effectPolicy = (st, q) => {
    if (q.kind === 'choice' || q.kind === 'scheme') return { choice: 0 };
    if (q.kind === 'units') return { units: (q.options || []).slice(0, 1) };
    if (q.kind === 'areas') return { area: (q.options || [])[0] };
    if (q.kind === 'cards') return { card: (q.options || [])[0] };
    if (q.kind === 'types') return { type: (q.options || [])[0] };
    if (q.kind === 'assetType' || q.kind === 'assets') return { asset: (q.options || [])[0] };
    return firstOption(st, q);
};
const effectPick = (n, rest) => (st, q) => {
    if (q.kind === 'choice' || q.kind === 'scheme') return { choice: n };
    return effectPolicy(st, q);
};

/** Answer the pending effect, one question after another. */
function effectAnswer(st, answer, limit = 40) {
    for (let i = 0; i < limit && st.pending; i++) {
        // The question may be asked of the opponent: the answer belongs to the
        // seat the question names, not to the owner of the card.
        const seat = st.pending.answerSeat === undefined ? st.pending.seat : st.pending.answerSeat;
        const one = typeof answer === 'function' ? answer(st, st.pending.question) : answer;
        const res = FS_RULES.apply(st, seat, { type: 'effect', answer: one });
        if (!res || res.ok === false) throw new Error('ответ не принят: ' + (res && res.error));
        if (res.done) break;
    }
    return st;
}

// --- Сервочерепа-стражи -----------------------------------------------------
check('Сервочерепа-стражи', 'карта сгорает в приказе наступления и ждёт этапа подготовки боя', () => {
    const st = orderState('advance', { upgrades: ['Сервочерепа-стражи'], units: { 'скитарии': 1 }, foeUnits: { 'гвардейцы': 1 } });
    const res = burn(st, 'Сервочерепа-стражи');
    ok(res.ok, 'карта не сгорела: ' + res.error);
    const prep = st.order.prepReroll;
    ok(!!prep, 'приказ не запомнил переброс');
    eq([prep.n, prep.per, prep.kind], [1, 'contestedUnit', 'any'], 'по кубику за каждого юнита обеих сторон');
    return eq(st.players[0].upgrades[0].used, true, 'карта сгорела');
});

check('Сервочерепа-стражи', 'после раздачи карт перебрасывается по кубику за юнит обеих сторон', () => {
    let st = orderState('advance', { upgrades: ['Сервочерепа-стражи'], units: { 'скитарии': 2 }, foeUnits: { 'гвардейцы': 1 } });
    burn(st, 'Сервочерепа-стражи');
    const sys = st.systems[0];
    const pos = worldOf(st, sys.id);
    const roll = FS_RULES.rollDice;
    FS_RULES.rollDice = (s, n) => Array.from({ length: n }, () => 'att');
    try {
        FS_RULES.startCombat(st, 0, 1, sys.id, pos);
        const q = pending(st);
        ok(!!q, 'вопроса о перебросе нет');
        eq([q.kind, q.op, q.n, q.required], ['dice', 'rerollDie', 3, true], 'два своих и один вражеский юнит');
        eq(st.combat.cards.attacker.hand.length, 5, 'карты уже вытянуты');
        const selected = q.options.slice(0, 3);
        eq(FS_RULES.apply(st, 0, { type: 'effect', answer: { dice: [selected[0], selected[0], selected[1]] } }).ok,
            false, 'один кубик нельзя выбрать дважды');
        eq(FS_RULES.apply(st, 0, { type: 'effect', answer: { no: true } }).ok, false, 'обязательный переброс нельзя пропустить');
        st = JSON.parse(JSON.stringify(st));
        FS_RULES.rollDice = () => ['def'];
        eq(FS_RULES.apply(st, 0, { type: 'effect', answer: { dice: selected } }).ok, true, 'переброс после JSON принят');
        eq(st.combat.dice.attacker.filter(d => d === 'def').length, 3, 'переброшены три выбранных кубика');
        eq(st.pending, null, 'вопрос закрыт');
    } finally {
        FS_RULES.rollDice = roll;
    }
});

check('Сервочерепа-стражи', 'счёт области включает подкрепления, но не уничтоженные жетоны', () => {
    let st = orderState('advance', { upgrades: ['Сервочерепа-стражи'], units: { 'скитарии': 2 }, foeUnits: { 'гвардейцы': 1 } });
    burn(st, 'Сервочерепа-стражи');
    // A synthetic promise exercises the common combat-start path with a token
    // already in the area when the preparation question is created.
    st.order.combatReinforce = { n: 1, free: true };
    const sys = st.systems[0];
    const pos = worldOf(st, sys.id);
    const other = st.systems.find(s => s.id !== sys.id);
    FS_RULES.addUnit(st, 0, 'скитарии', other.id, worldOf(st, other.id));
    const roll = FS_RULES.rollDice;
    FS_RULES.rollDice = (s, n) => Array.from({ length: n }, () => 'att');
    try {
        FS_RULES.startCombat(st, 0, 1, sys.id, pos);
        const q = pending(st);
        eq(CombatTokens.of(st.combat).units('attacker').used, 1, 'обещанный жетон прибыл');
        eq([q.op, q.n], ['rerollDie', 4], 'три модели и жетон, без отряда в другом мире');
        const selected = q.options.slice(0, 4);
        st = JSON.parse(JSON.stringify(st));
        FS_RULES.rollDice = () => ['def'];
        ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { dice: selected } }).ok, 'переброс после JSON принят');
        eq(st.combat.dice.attacker.filter(d => d === 'def').length, 4, 'переброшены четыре кубика');
        // A separately prepared combat state covers routed and destroyed
        // markers; it does not claim this timing occurs in an ordinary game.
        const tokens = CombatTokens.of(st.combat);
        tokens.add('defender', 2, true);
        ok(tokens.route('defender', 0), 'один жетон деморализован');
        ok(tokens.destroy('defender', 1), 'другой жетон уничтожен');
        eq(FS_EFFECTS.count(FS_RULES, st, 0, { n: 1, per: 'contestedUnit', inBattle: true },
            { kind: 'combat', ctx: { side: 'attacker' } }), 5,
        'три модели, один свой и один сохранившийся деморализованный жетон');
    } finally {
        FS_RULES.rollDice = roll;
    }
});

check('Сервочерепа-стражи', 'без карты вопросов в начале боя нет', () => {
    const st = orderState('advance', { units: { 'скитарии': 2 }, foeUnits: { 'гвардейцы': 1 } });
    const sys = st.systems[0];
    const pos = worldOf(st, sys.id);
    FS_RULES.startCombat(st, 0, 1, sys.id, pos);
    return eq(pending(st), null, 'вопроса нет');
});

check('Сервочерепа-стражи', 'карта применяется только в приказе наступления', () => {
    const st = orderState('deploy', {
        upgrades: ['Сервочерепа-стражи'], units: { 'скитарии': 1 }, structures: ['factory'],
    });
    const res = burn(st, 'Сервочерепа-стражи');
    eq(res.ok, false, 'в приказе развёртывания карту сжечь нельзя');
    return eq(st.players[0].upgrades[0].used, false, 'карта не сгорела зря');
});

// --- Главный по машинам -----------------------------------------------------
check('Главный по машинам', 'карта даёт выбор: лимит закупки либо скидка на покупки', () => {
    const st = orderState('deploy', {
        upgrades: ['Главный по машинам'], units: { 'скитарии': 1 }, structures: ['factory'], materiel: 20,
    });
    const res = burn(st, 'Главный по машинам');
    ok(res.ok, 'карта не сгорела: ' + res.error);
    const q = pending(st);
    ok(!!q && q.kind === 'choice', 'выбора нет');
    return eq((q.options || []).map(o => o.op), ['deployLimit', 'purchaseDiscount'], 'варианты карты');
});

check('Главный по машинам', 'лимит закупки юнитов увеличивается на 1', () => {
    const st = orderState('deploy', {
        upgrades: ['Главный по машинам'], units: { 'скитарии': 1 }, structures: ['factory'], materiel: 20,
    });
    const plain = orderState('deploy', { units: { 'скитарии': 1 }, structures: ['factory'], materiel: 20 });
    const sys = st.systems[0];
    const pos = worldOf(st, sys.id);
    burn(st, 'Главный по машинам');
    effectAnswer(st, { choice: 0 });
    eq(st.order.deployLimitBonus, 1, 'бонус приказа к лимиту');
    eq(FS_RULES.deployLimit(st, 0, sys.id) - FS_RULES.deployLimit(plain, 0, sys.id), 1, 'лимит закупки');
    // The extra unit is bought for real.
    const unit = FS_DATA.factions.find(f => f.id === MECH).units.find(u => u.type === 'ground');
    for (let i = 0; i < FS_RULES.deployLimit(st, 0, sys.id); i++) {
        const r = FS_RULES.apply(st, 0, { type: 'buyUnit', unit: unit.id, system: sys.id, pos });
        ok(r.ok, 'юнит в пределах лимита не куплен: ' + r.error);
    }
    const over = FS_RULES.apply(st, 0, { type: 'buyUnit', unit: unit.id, system: sys.id, pos });
    return eq(over.ok, false, 'сверх лимита купить нельзя');
});

check('Главный по машинам', 'общая цена отряда и постройки уменьшается на 1 один раз', () => {
    const st = orderState('deploy', {
        upgrades: ['Главный по машинам'], units: { 'скитарии': 1 }, structures: ['factory'], materiel: 20,
    });
    const sys = st.systems[0];
    const pos = worldOf(st, sys.id);
    burn(st, 'Главный по машинам');
    effectAnswer(st, { choice: 1 });
    eq(st.order.purchaseDiscount, 1, 'скидка приказа');
    const unit = FS_DATA.factions.find(f => f.id === MECH).units.find(u => u.type === 'ground');
    const cost = FS_RULES.unitDef(st, 0, unit.id).cost;
    const r1 = FS_RULES.apply(st, 0, { type: 'buyUnit', unit: unit.id, system: sys.id, pos });
    ok(r1.ok, 'юнит не куплен: ' + r1.error);
    // The receipt keeps item prices; the discount applies once to its total.
    const bought = st.order.purchases.find(x => x.kind === 'unit');
    eq(bought.cost, cost, 'в чеке сохранена цена отряда');
    eq(FS_RULES.spentOf(st.order), Math.max(0, cost - 1), 'скидка учтена в промежуточном итоге');
    // The card says «включая здания»: the structure joins the same total.
    // The structures are bought in the second step of the order, on a free world.
    const step = FS_RULES.apply(st, 0, { type: 'deployStructures' });
    ok(step.ok, 'шаг построек не открыт: ' + step.error);
    const free = sys.areas.filter(a => a.world && !FS_RULES.structuresAt(st, sys.id, a.pos).length)[0];
    // A structure is built only on a world the player controls.
    FS_RULES.addUnit(st, 0, 'скитарии', sys.id, free.pos);
    const r2 = FS_RULES.apply(st, 0, { type: 'buyStructure', kind: 'bastion', system: sys.id, pos: free.pos });
    ok(r2.ok, 'постройка не куплена: ' + r2.error);
    const stat = FS_RULES.structureStats('bastion');
    const built = st.order.purchases.find(x => x.kind === 'structure');
    eq(built.cost, stat.cost, 'в чеке сохранена цена постройки');
    eq(FS_RULES.spentOf(st.order), cost + stat.cost - 1, 'одна скидка на обе покупки');
    const finish = FS_RULES.apply(st, 0, { type: 'finishDeploy' });
    ok(finish.ok, 'приказ не закончен: ' + finish.error);
    return eq(finish.paid, cost + stat.cost - 1, 'в конце списана общая сумма со скидкой 1');
});

// --- Священные масла --------------------------------------------------------
check('Священные масла', 'на этапе подготовки боя вытягиваются 2 карты и 2 сбрасываются', () => {
    const st = orderState('advance', { upgrades: ['Священные масла'], units: { 'скитарии': 1 }, foeUnits: { 'гвардейцы': 1 } });
    burn(st, 'Священные масла');
    eq(st.order.prepDrawCards, { n: 2, discard: 2 }, 'приказ ждёт этапа подготовки');
    const sys = st.systems[0];
    const pos = worldOf(st, sys.id);
    FS_RULES.startCombat(st, 0, 1, sys.id, pos);
    eq(st.combat.cards.attacker.hand.length, 7, 'рука: 5 + 2 дополнительных');
    const q = pending(st);
    ok(!!q && q.kind === 'cards', 'вопроса о сбросе нет');
    // Two cards are dropped, one answer at a time.
    for (let i = 0; i < 2 && st.pending; i++) {
        const hand = st.combat.cards.attacker.hand;
        effectAnswer(st, { cards: [hand[0]] });
    }
    return eq(st.combat.cards.attacker.hand.length, 5, 'рука после сброса');
});

check('Священные масла', 'план начала боя, обещанный жетон и подготовка заканчиваются до плана начала раунда', () => {
    let st = orderState('advance', { faction: MECH, foeFaction: 'империя-тау',
        units: { 'скитарии': 2 }, foeUnits: { 'бронекостюмы': 1 },
        upgrades: ['Священные масла', 'Сервочерепа-стражи'] });
    ok(burn(st, 'Священные масла').ok && burn(st, 'Сервочерепа-стражи').ok, 'оба улучшения применены');
    const philosophy = FS_DATA.events.find(c => c.faction === 'империя-тау' && c.name === 'Философия войны');
    FS_RULES.keepEventScheme(st, 1, philosophy);
    // Artificial cross-faction promises isolate the common ordering: the
    // Mechanicus does not own the Tyranid token or the Necron round plan.
    st.order.combatReinforce = { n: 1, free: true };
    // Both players have a real decision at reinforcement; without assets the
    // server now correctly passes their empty steps as part of preparation.
    st.players[0].assets.reinforcement = 2; st.players[1].assets.reinforcement = 2;
    const repeat = FS_DATA.events.find(c => c.faction === 'некроны' && c.name === 'Безжалостное наступление');
    const trig = FS_EFFECTS.parse(repeat.text, { kind: 'event', faction: 'некроны' }).find(x => x.op === 'trigger');
    st.players[1].schemes.push({ name: repeat.name, text: repeat.text, trigger: trig.trigger,
        steps: trig.steps, note: !!trig.note, defer: !!trig.defer });
    const system = st.order.system, pos = worldOf(st, system), roll = FS_RULES.rollDice;
    FS_RULES.rollDice = (state, n) => Array.from({ length: n }, () => 'att');
    try {
        FS_RULES.startCombat(st, 0, 1, system, pos);
        eq([st.pending?.seat, pending(st)?.options], [1, ['Философия войны']], 'сначала план до подготовки');
        eq([st.combat.cards.attacker.hand.length, CombatTokens.of(st.combat).used('attacker')], [0, 0], 'ещё нет карт и жетона');
        ok(FS_RULES.apply(st, 1, { type: 'effect', answer: { choice: 0 } }).ok, 'философия принята');
        ok(FS_RULES.apply(st, 1, { type: 'effect', answer: { cards: [] } }).ok, 'замена пропущена');
        eq(CombatTokens.of(st.combat).used('attacker'), 1, 'обещанный жетон появился');
        eq(st.combat.cards.attacker.hand.length, 7, 'сначала обычная раздача и две карты масла');
        eq([st.pending?.seat, pending(st)?.op], [0, 'discardHand'], 'идёт сброс масла');
        for (let i = 0; i < 2; i++) {
            const name = pending(st).options[0];
            st = JSON.parse(JSON.stringify(st));
            ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { cards: [name] } }).ok, 'сброшена карта после JSON');
        }
        eq(st.combat.cards.attacker.hand.length, 5, 'после масла ровно пять карт');
        eq([pending(st)?.op, pending(st)?.n], ['rerollDie', 4], 'затем переброс за три модели и жетон');
        const dice = pending(st).options.slice(0, 4);
        st = JSON.parse(JSON.stringify(st));
        ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { dice } }).ok, 'переброс после JSON');
        eq(st.pending, null, 'подготовка закончилась до плана раунда');
        eq(st.combat.step, 'reinforce-attacker', 'следом идёт призыв подкреплений');
        ok(FS_RULES.apply(st, 0, { type: 'combat', action: 'reinforce', count: 0 }).ok, 'атакующий закончил призыв');
        ok(FS_RULES.apply(st, 1, { type: 'combat', action: 'reinforce', count: 0 }).ok, 'защитник закончил призыв');
        eq([st.pending?.seat, pending(st)?.options], [1, ['Безжалостное наступление']], 'план раунда только после обеих сторон');
        st = JSON.parse(JSON.stringify(st));
        ok(FS_RULES.apply(st, 1, { type: 'effect', answer: { choice: 0 } }).ok, 'план раунда принят');
        eq([st.pending, st.combat.step, st.combat.repeatDamage], [null, 'choose-attacker', true], 'бой готов к выбору карт');
    } finally { FS_RULES.rollDice = roll; }
});

// --- Святой трубопровод -----------------------------------------------------
function moveMechFactory(st) {
    const factory = st.structures.find(s => s.seat === 0 && s.type === 'factory' && s.system === st.order.system);
    const start = FS_RULES.apply(st, 0, { type: 'finishDominate' });
    ok(start.ok, 'способность доминирования не начата: ' + start.error);
    eq(pending(st).op, 'moveStructure', 'выбирается фабрика');
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { structure: factory.id } }).ok, 'фабрика выбрана');
    const q = pending(st);
    eq(q.kind, 'areas', 'выбирается конечный мир');
    const target = q.options[0];
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { area: target } }).ok, 'фабрика перемещена');
    eq([factory.system, factory.area], [target.system, target.pos], 'та же фабрика в новом мире');
    return { id: factory.id, target };
}

check('Святой трубопровод', 'нужны «Главный по машинам» и перемещение фабрики этим приказом', () => {
    const withoutChief = orderState('dominate', { upgrades: ['Святой трубопровод'], units: { 'скитарии': 1 }, structures: ['factory'] });
    moveMechFactory(withoutChief);
    eq(burn(withoutChief, 'Святой трубопровод').ok, false, 'без «Главного по машинам» карта не применяется');
    eq(withoutChief.players[0].upgrades[0].used, false, 'отказ не расходует карту');
    const beforeMove = orderState('dominate', { upgrades: ['Святой трубопровод', 'Главный по машинам'], units: { 'скитарии': 1 }, structures: ['factory'] });
    eq(burn(beforeMove, 'Святой трубопровод').ok, false, 'до перемещения карта не применяется');
    return eq(beforeMove.players[0].upgrades[0].used, false, 'карта не сгорает до перемещения');
});

check('Святой трубопровод', 'после перемещения покупается наземный отряд в новом мире этой фабрики', () => {
    let st = orderState('dominate', {
        upgrades: ['Святой трубопровод', 'Главный по машинам'],
        units: { 'скитарии': 1 }, structures: ['factory'], materiel: 10,
    });
    const moved = moveMechFactory(st);
    st = JSON.parse(JSON.stringify(st));
    const before = st.players[0].materiel;
    const res = burn(st, 'Святой трубопровод');
    ok(res.ok, 'карта не разыграна: ' + res.error);
    const q = pending(st);
    eq(q.kind, 'types', 'предлагается тип покупаемого отряда');
    ok(q.options.includes('скитарии'), 'Скитарии доступны');
    ok(!q.options.includes('крепкие-крейсеры'), 'корабль нельзя поставить на мир');
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { type: 'скитарии' } }).ok, 'тип выбран');
    eq(pending(st).options, [moved.target], 'разрешён только новый мир именно этой фабрики');
    st = JSON.parse(JSON.stringify(st));
    const wrong = { system: st.systems[0].id, pos: worldOf(st, st.systems[0].id) };
    eq(FS_RULES.apply(st, 0, { type: 'effect', answer: { area: wrong } }).ok, false, 'старый мир отклонён');
    eq(st.players[0].materiel, before, 'до размещения материя не списана');
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { area: moved.target } }).ok, 'покупка в новом мире принята');
    eq(st.units.filter(u => u.seat === 0 && u.system === moved.target.system && u.area === moved.target.pos).length,
        1, 'купленный отряд в мире перемещённой фабрики');
    eq(before - st.players[0].materiel, FS_RULES.unitDef(st, 0, 'скитарии').cost, 'цена оплачена');
    return ok(FS_RULES.apply(st, 0, { type: 'finishDominate' }).ok, 'приказ можно закончить');
});

check('Святой трубопровод', 'фактория проходит в соседнюю систему по сухопутному пути, шторм её останавливает', () => {
    const probe = FS_RULES.newReadyGame({ seed: 5, players: players() });
    const active = probe.systems[0];
    let path = null;
    for (const source of active.areas.filter(a => a.world)) {
        const target = FS_RULES.areasAround(probe, active.id, source.pos).find(a => a.system !== active.id
            && FS_RULES.area(FS_RULES.system(probe, a.system), a.pos).world);
        if (target) { path = { source: source.pos, target }; break; }
    }
    ok(path, 'нужны соседние миры через границу систем');
    const make = () => orderState('dominate', { pos: path.source, units: { 'скитарии': 1 }, structures: ['factory'],
        upgrades: ['Святой трубопровод', 'Главный по машинам'], materiel: 10 });
    const storm = make();
    storm.storms = [{ id: 'blocked', system: active.id, side: FS_RULES.sideBetween(storm, active.id, path.target.system) }];
    ok(FS_RULES.stormOn(storm, active.id, path.target.system), 'шторм на общей границе');
    ok(FS_RULES.apply(storm, 0, { type: 'finishDominate' }).ok, 'способность начата');
    const blockedFactory = storm.structures.find(s => s.seat === 0);
    ok(FS_RULES.apply(storm, 0, { type: 'effect', answer: { structure: blockedFactory.id } }).ok, 'фабрика выбрана');
    ok(!pending(storm).options.some(a => a.system === path.target.system && a.pos === path.target.pos),
        'мир за штормом не предлагается');
    eq(FS_RULES.apply(storm, 0, { type: 'effect', answer: { area: path.target } }).ok, false, 'обход выбора через сеть отклонён');
    eq([blockedFactory.system, blockedFactory.area], [active.id, path.source], 'запрещённый путь не передвинул фабрику');

    let st = make();
    st.systems.find(s => s.id !== active.id).tokens.push({ seat: 1, order: 'deploy', faceUp: false });
    ok(FS_RULES.apply(st, 0, { type: 'finishDominate' }).ok, 'способность начата без шторма');
    const factory = st.structures.find(s => s.seat === 0);
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { structure: factory.id, area: path.target } }).ok,
        'выбор фабрики не принимает преждевременное назначение');
    eq(pending(st).kind, 'areas', 'отдельно выбирается законное назначение');
    ok(pending(st).options.some(a => a.system === path.target.system && a.pos === path.target.pos), 'соседний мир доступен');
    st = JSON.parse(JSON.stringify(st));
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { area: path.target } }).ok, 'фабрика перемещена после JSON');
    ok(burn(st, 'Святой трубопровод').ok, 'улучшение следует за перемещением');
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { type: 'скитарии', area: { system: active.id, pos: path.source } } }).ok,
        'выбран тип отряда');
    eq(pending(st).options, [path.target], 'покупка возможна только в мире переехавшей фабрики');
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { area: path.target } }).ok, 'отряд куплен в соседней системе');
    eq(st.units.filter(u => u.seat === 0 && u.system === path.target.system && u.area === path.target.pos).length, 1,
        'купленная модель в мире фабрики');
    eq(st.players[0].materiel, 8, 'списана цена Скитария');
    ok(FS_RULES.apply(st, 0, { type: 'finishDominate' }).ok, 'ход завершён');
    eq(st.turn, 1, 'ход передан сопернику');
});

check('Юркая промышленность', 'игрок может отказаться от перемещения фабрики', () => {
    const st = orderState('dominate', { units: { 'скитарии': 1 }, structures: ['factory'],
        upgrades: ['Святой трубопровод', 'Главный по машинам'] });
    st.systems[1].tokens.push({ seat: 1, order: 'deploy', faceUp: false });
    const factory = st.structures.find(s => s.seat === 0), before = [factory.system, factory.area];
    ok(FS_RULES.apply(st, 0, { type: 'finishDominate', skip: true }).ok, 'способность пропущена');
    eq([factory.system, factory.area], before, 'фабрика осталась в исходном мире');
    eq([st.order, st.pending, st.turn, st.players[0].upgrades[0].used], [null, null, 1, false],
        'приказ закрыт, улучшение не потрачено');
});

// --- Изъяны плоти -----------------------------------------------------------
/** A strike of the tested player: the ships are in the void, the target is the world. */
function strikeState(o = {}) {
    // The target of a strike is an enemy world: it holds the troops or the
    // buildings of another player and none of ours (the rules, «Orbital Strike»).
    // The world of the check is the one next to the void the ships shoot from.
    const st = FS_RULES.newReadyGame({
        seed: o.seed === undefined ? 5 : o.seed,
        players: players(o.faction, o.foeFaction),
    });
    st.units = [];
    st.structures = [];
    st.objectives = [];
    st.storms = [];
    for (const sys of st.systems) sys.tokens = [];
    st.phase = 'operations';
    st.turn = 0;
    st.order = null;
    const sys = st.systems[0];
    const foe = (o.foeUnits || {}).constructor === Object && Object.keys(o.foeUnits || {}).length
        ? Object.keys(o.foeUnits)[0] : null;
    if (foe) {
        // Отряды противника называет ПРОВЕРКА; если назван отряд чужой фракции,
        // это ошибка проверки, а не повод молча играть им.
        const own = FS_CATALOG.unit(st.players[1].faction, foe);
        if (!own) throw new Error('у фракции «' + st.players[1].faction + '» нет отряда «' + foe + '» — назовите foeFaction');
    }
    const voidArea = sys.areas.find(a => !a.world);
    const world = FS_RULES.areasAround(st, sys.id, voidArea.pos)
        .map(a => FS_RULES.area(sys, a.pos)).filter(a => a && a.world)[0];
    for (const s of (o.foeStructures || ['factory'])) {
        st.structures.push({ id: 'foe' + st.structures.length, seat: 1, type: s, system: sys.id, area: world.pos });
    }
    for (const [id, n] of Object.entries(o.foeUnits || {})) {
        for (let i = 0; i < n; i++) FS_RULES.addUnit(st, 1, id, sys.id, world.pos);
    }
    // The ships that shoot: two cruisers of the Mechanicus by default, the
    // ships the check names for another faction.
    const ships = o.ships || { 'крепкие-крейсеры': 2 };
    for (const [id, n] of Object.entries(ships)) {
        for (let i = 0; i < n; i++) FS_RULES.addUnit(st, 0, id, sys.id, voidArea.pos);
    }
    // A unit of the tested player stands elsewhere: the order is his to resolve.
    // It is HIS faction's zero-level unit — «скитарии» of the Mechanicus do not
    // exist in the Guard, and the engine now refuses a unit of another faction.
    const other = sys.areas.find(a => a.world && a.pos !== world.pos);
    const hold = o.holdUnit || groundUnitOf(st, 0);
    FS_RULES.addUnit(st, 0, hold, sys.id, other.pos);
    st.players[0].upgrades = (o.upgrades || ['Изъяны плоти']).map(name => ({ name, used: false }));
    if (o.materiel !== undefined) st.players[0].materiel = o.materiel;
    if (o.assets) Object.assign(st.players[0].assets, o.assets);
    sys.tokens.push({ seat: 0, order: 'advance', faceUp: false });
    const res = FS_RULES.apply(st, 0, { type: 'resolveOrder', system: sys.id });
    if (!res || res.ok === false) throw new Error('приказ не раскрыт: ' + (res && res.error));
    st.order.phase = 'strike';
    st.strikeWorld = world.pos;
    return st;
}

check('Изъяны плоти', 'бастионы не защищают от удара', () => {
    const st = strikeState({ foeStructures: ['bastion'] });
    const res = burn(st, 'Изъяны плоти');
    ok(res.ok, 'карта не сгорела: ' + res.error);
    return eq(!!st.order.ignoreBastion, true, 'приказ игнорирует бастионы');
});

check('Изъяны плоти', 'за 2 `def. cube` постройки мира переходят вам', () => {
    const st = strikeState({ foeStructures: ['factory', 'city'] });
    burn(st, 'Изъяны плоти');
    eq(st.order.strikeTake, { n: 2, kind: 'def' }, 'приказ ждёт кубиков удара');
    const sys = st.systems[0];
    const pos = st.strikeWorld;
    // The dice of the strike are fixed: two of them are defence cubes.
    const roll = FS_RULES.rollDice;
    FS_RULES.rollDice = () => ['def', 'def', 'att'];
    const targets = FS_RULES.orbitalStrikeTargets(st, 0);
    const target = targets.find(t => t.system === sys.id && t.pos === pos) || targets[0];
    const res = FS_RULES.apply(st, 0, { type: 'orbitalStrike', system: target.system, pos: target.pos });
    FS_RULES.rollDice = roll;
    ok(res.ok, 'удар не нанесён: ' + res.error);
    eq(pending(st).kind, 'choice', 'перед расходом кубиков предложен выбор');
    eq(st.structures.filter(s => s.seat === 0 && s.system === target.system && s.area === target.pos).length,
        0, 'до согласия постройки не захвачены');
    effectAnswer(st, { choice: 0 });
    const mine = st.structures.filter(s => s.seat === 0 && s.system === target.system && s.area === target.pos);
    return eq(mine.length, 2, 'обе постройки мира удара перешли вам');
});

check('Изъяны плоти', 'без двух `def. cube` постройки не переходят', () => {
    const st = strikeState({ foeStructures: ['factory'] });
    burn(st, 'Изъяны плоти');
    const roll = FS_RULES.rollDice;
    FS_RULES.rollDice = () => ['att', 'att', 'morale'];
    const targets = FS_RULES.orbitalStrikeTargets(st, 0);
    const target = targets[0];
    const res = FS_RULES.apply(st, 0, { type: 'orbitalStrike', system: target.system, pos: target.pos });
    FS_RULES.rollDice = roll;
    ok(res.ok, 'удар не нанесён: ' + res.error);
    const theirs = st.structures.filter(s => s.seat === 1 && s.system === target.system && s.area === target.pos);
    return eq(theirs.length, 1, 'постройка осталась у противника');
});

check('Изъяны плоти', 'общий пул платежей: доступность захвата проверяется после предшествующей траты', () => {
    // A synthetic additional payment exercises the common strike pool. The
    // Mechanicus has only one orbital upgrade with this capture ability.
    const start = () => {
        const st = strikeState({ foeStructures: ['factory'], assets: { reinforcement: 0 } });
        st.systems[1].tokens.push({ seat: 1, order: 'deploy', faceUp: false });
        ok(burn(st, 'Изъяны плоти').ok, 'улучшение применено');
        ctx.StrikePlan.of(st.order).addPay({ n: 1, kind: 'any', upTo: false, reward: { asset: 'reinforcement', n: 1 } });
        fire(st, ['def', 'def', 'att']);
        eq([pending(st).kind, pending(st).op], ['choice', 'strikePayPick'], 'сначала другой платёж');
        return st;
    };
    let st = start();
    eq(FS_RULES.apply(st, 1, { type: 'effect', answer: { choice: 1 } }).ok, false, 'чужой ответ отклонён');
    eq(FS_RULES.apply(st, 0, { type: 'effect', answer: { choice: 3, dice: [0] } }).ok, false, 'непредложенный объём отклонён');
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { choice: 1, dice: [0] } }).ok, 'объём выбран');
    eq([pending(st).kind, pending(st).op], ['dice', 'strikePayPick'], 'поддельный выбор куба не пропускает вопрос');
    eq(FS_RULES.apply(st, 0, { type: 'effect', answer: { dice: [99] } }).ok, false, 'чужой индекс кубика отклонён');
    eq(FS_RULES.apply(st, 0, { type: 'effect', answer: { dice: [0, 0] } }).ok, false, 'повтор кубика отклонён');
    st = JSON.parse(JSON.stringify(st));
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { choice: 0, dice: [0] } }).ok, 'оплачен куб обороны после JSON');
    eq(st.players[0].assets.reinforcement, 1, 'первый платёж выполнен один раз');
    eq(st.pending, null, 'захват не предлагается без двух оставшихся кубов обороны');
    eq(st.structures.find(s => s.id === 'foe0').seat, 1, 'фабрика не захвачена');

    st = start();
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { choice: 1 } }).ok, 'объём выбран');
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { dice: [2] } }).ok, 'потрачен куб атаки');
    eq([pending(st).kind, pending(st).op], ['choice', 'choice'], 'два куба обороны оставляют захват доступным');
    eq(st.order.strikePlanned.hits, 0, 'потраченный куб атаки больше не наносит урон');
    st = JSON.parse(JSON.stringify(st));
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { choice: 0 } }).ok, 'захват выбран после JSON');
    eq(st.structures.find(s => s.id === 'foe0').seat, 0, 'фабрика захвачена за оставшиеся кубы');
    eq(st.players[0].assets.reinforcement, 1, 'награда другой карты не дублируется');
});

check('Изъяны плоти', 'вражеский отряд не позволяет оплатить захват до урона, даже если погибает от удара', () => {
    // Rules Reference, Orbital Strike: dice are spent before any damage is
    // suffered, so the condition must hold at that point, not after a casualty.
    let st = strikeState({ foeUnits: { 'гвардейцы': 1 }, foeStructures: ['factory'] });
    st.systems[1].tokens.push({ seat: 1, order: 'deploy', faceUp: false });
    const defender = st.units.find(u => u.seat === 1);
    burn(st, 'Изъяны плоти');
    const roll = FS_RULES.rollDice;
    FS_RULES.rollDice = () => ['def', 'def', 'att'];
    const targets = FS_RULES.orbitalStrikeTargets(st, 0);
    const target = targets[0];
    const res = FS_RULES.apply(st, 0, { type: 'orbitalStrike', system: target.system, pos: target.pos });
    FS_RULES.rollDice = roll;
    ok(res.ok, 'удар не нанесён: ' + res.error);
    eq(st.pending, null, 'при живом отряде не предлагается захват за два кубика');
    ok(st.strike, 'урон ожидает защитника');
    st = JSON.parse(JSON.stringify(st));
    ok(FS_RULES.apply(st, 1, { type: 'strikeDamage', unit: defender.id }).ok, 'защитник распределяет урон после JSON');
    eq(st.units.some(u => u.id === defender.id), false, 'последний отряд погиб от удара');
    eq(st.pending, null, 'после урона нельзя снова предложить оплату кубиками');
    const theirs = st.structures.filter(s => s.seat === 1 && s.system === target.system && s.area === target.pos);
    return eq(theirs.length, 1, 'постройка осталась у противника');
});

// ============================================================================
//  Особенность фракции (docs/forbidden-stars/02-factions.md)
// ============================================================================
head('Особенность фракции', MECH);

check('Юркая промышленность', 'приказ доминирования двигает фабрику активной системы', () => {
    const st = orderState('dominate', { units: { 'скитарии': 1 }, structures: ['factory'] });
    const sys = st.systems[0];
    const pos = worldOf(st, sys.id);
    const ability = FS_EFFECTS.abilityFor(FS_DATA.factions.find(f => f.id === MECH));
    const step = ability[0];
    eq([step.op, step.kind, step.ofSystem], ['moveStructure', 'factory', 'active'], 'способность планшета');
    // A factory of another system is not the factory of the order.
    const far = st.systems.find(s => s.id !== sys.id);
    const farPos = worldOf(st, far.id);
    st.structures.push({ id: 'far', seat: 0, type: 'factory', system: far.id, area: farPos });
    FS_RULES.runEffects(st, 0, ability, { kind: 'ability', ctx: null });
    const q = pending(st);
    ok(!!q && q.kind === 'structures', 'вопроса о фабрике нет');
    const mine = st.structures.filter(s => s.seat === 0 && s.type === 'factory' && s.system === sys.id);
    eq(q.options.length, mine.length, 'предложены только фабрики активной системы');
    // The destination is a neutral or a friendly world of this or the next system.
    const picked = FS_RULES.apply(st, 0, { type: 'effect', answer: { structure: mine[0].id } });
    ok(picked.ok, 'фабрика не выбрана: ' + picked.error);
    const q2 = pending(st);
    ok(!!q2 && q2.kind === 'areas', 'вопроса о мире нет');
    const near = FS_RULES.neighbors(st, sys.id);
    const from = { system: sys.id, pos };
    ok(!q2.options.some(a => a.system === from.system && a.pos === from.pos), 'свой мир целью не предлагается');
    eq(q2.options.every(a => a.system === sys.id || near.includes(a.system)), true, 'мир в этой или соседней системе');
    eq(q2.options.every(a => {
        const standing = FS_EFFECTS.areaStanding(st, 0, a.system, a.pos);
        return standing === 'friendly' || standing === 'uncontrolled';
    }), true, 'мир нейтральный или дружественный');
    // The factory really moves.
    effectAnswer(st, { area: q2.options[0] }, 4);
    const moved = st.structures.find(s => s.id === mine[0].id);
    return eq([moved.system, moved.area], [q2.options[0].system, q2.options[0].pos], 'фабрика переехала');
});

// ============================================================================
//  Карты событий (docs/forbidden-stars/06-events.md)
// ============================================================================
head('Карты событий', MECH);

/**
 * A state of the refresh phase with the chosen event card of the tested faction:
 * the card is played through the real command path, exactly as the player does
 * it (the storm movement is marked as done — it is not a part of the ability).
 */
function eventState(name, o = {}) {
    const st = FS_RULES.newReadyGame({
        seed: o.seed === undefined ? 5 : o.seed,
        players: players(o.faction, o.foeFaction),
    });
    st.units = [];
    st.structures = [];
    st.objectives = [];
    st.storms = [];
    for (const sys of st.systems) sys.tokens = [];
    const sys = st.systems[0];
    const pos = worldOf(st, sys.id);
    for (const [id, n] of Object.entries(o.units || {})) {
        for (let i = 0; i < n; i++) FS_RULES.addUnit(st, 0, id, sys.id, pos);
    }
    for (const [id, n] of Object.entries(o.foeUnits || {})) {
        for (let i = 0; i < n; i++) FS_RULES.addUnit(st, 1, id, sys.id, pos);
    }
    for (const s of o.structures || []) {
        st.structures.push({ id: 'str' + st.structures.length, seat: 0, type: s, system: sys.id, area: pos });
    }
    // The ships of the check stand in the void of the system: a card may count
    // them («Разведывательные организмы») or need the void they hold to be a
    // friendly one («Флот-осколок»).
    for (const [id, n] of Object.entries(o.ships || {})) {
        for (let i = 0; i < n; i++) FS_RULES.addUnit(st, 0, id, sys.id, voidOf(st, sys.id));
    }
    const p = st.players[0];
    if (o.materiel !== undefined) p.materiel = o.materiel;
    if (o.assets) Object.assign(p.assets, o.assets);
    st.phase = 'refresh';
    st.eventsLeft = 2;
    st.event = { seat: 0, drawn: [name], chosen: name, stormMoved: true };
    st.event.card = FS_DATA.events.find(e => e.faction === (o.faction || MECH) && e.name === name);
    ok(!!st.event.card, 'нет карты события «' + name + '»');
    st.sys = sys.id;
    st.pos = pos;
    return st;
}

/** Play the chosen event card: its text is the rule the engine performs. */
const playEvent = st => FS_RULES.apply(st, 0, { type: 'resolveEvent' });

/** The units of a seat by their type. */
const unitsByType = (st, seat) => {
    const out = {};
    for (const u of st.units.filter(u => u.seat === seat)) {
        const name = (FS_RULES.unitOf(st, u) || {}).name || '?';
        out[name] = (out[name] || 0) + 1;
    }
    return out;
};

// --- Благословение Бога-Машины ----------------------------------------------
check('Благословение Бога-Машины', 'жетон запасов и жетон кузницы, без изменения материи', () => {
    // 06-events.md says «жетон материалов». The owner confirmed that this is
    // the existing cache (07-tokens.md), not materiel or an arbitrary asset.
    let st = eventState('Благословение Бога-Машины', { materiel: 3, assets: { forge: 1, cache: 0, reinforcement: 2 } });
    st = JSON.parse(JSON.stringify(st));
    ok(playEvent(st).ok, 'карта сыграна после JSON');
    const p = st.players[0];
    eq([p.materiel, p.assets.forge, p.assets.cache, p.assets.reinforcement], [3, 2, 1, 2],
        'получены кузница и тайник, материя и подкрепления не изменились');
    eq(st.pending, null, 'карта не требует выбирать тип жетона');
});

check('Благословение Бога-Машины', 'каждый предел ресурсов применяется отдельно', () => {
    for (const [forge, cache, wantForge, wantCache] of [[3, 2, 3, 3], [1, 3, 2, 3], [3, 3, 3, 3]]) {
        const st = eventState('Благословение Бога-Машины', { materiel: 3, assets: { forge, cache, reinforcement: 0 } });
        ok(playEvent(st).ok, 'карта сыграна у предела');
        eq([st.players[0].materiel, st.players[0].assets.forge, st.players[0].assets.cache],
            [3, wantForge, wantCache], 'предел кузниц ' + forge + ', тайников ' + cache);
        eq(st.pending, null, 'ограничение не оставляет ожидания');
    }
});

check('Благословение Бога-Машины', 'полученный жетон запасов снижает покупку отряда или постройки на 2 материала', () => {
    for (const purchase of ['unit', 'structure']) {
        let st = eventState('Благословение Бога-Машины', {
            units: { 'скитарии': 1 }, structures: ['factory'], materiel: 5,
            assets: { forge: 0, cache: 0, reinforcement: 0 },
        });
        const other = st.systems.find(s => s.id !== st.sys);
        FS_RULES.addStructure(st, 0, 'city', other.id, worldOf(st, other.id));
        const free = FS_RULES.system(st, st.sys).areas.find(a => a.world && a.pos !== st.pos);
        ok(!!free, 'нужен второй мир для постройки');
        FS_RULES.addUnit(st, 0, 'скитарии', st.sys, free.pos);
        ok(playEvent(st).ok, 'карта сыграна');
        eq([st.players[0].assets.cache, st.players[0].assets.forge], [1, 1], 'событие дало оба жетона');
        // Prepare a later deploy order on the same state, keeping the received
        // tokens through serialization rather than setting up a new balance.
        st = JSON.parse(JSON.stringify(st));
        st.phase = 'operations';
        st.turn = 0;
        st.event = null;
        st.eventsLeft = 0;
        st.order = null;
        const sys = FS_RULES.system(st, st.sys);
        sys.tokens.push({ seat: 0, order: 'deploy', faceUp: false });
        FS_RULES.system(st, other.id).tokens.push({ seat: 1, order: 'advance', faceUp: false });
        ok(FS_RULES.apply(st, 0, { type: 'resolveOrder', system: sys.id }).ok, 'раскрыто развёртывание');
        let result;
        if (purchase === 'unit') {
            eq(FS_RULES.unitDef(st, 0, 'катафроны').cost, 3, 'обычная цена Катафрона');
            result = FS_RULES.apply(st, 0, { type: 'buyUnit', unit: 'катафроны', system: sys.id, pos: st.pos, cache: true });
        } else {
            eq(FS_RULES.structureStats('city').cost, 3, 'обычная цена города');
            ok(FS_RULES.apply(st, 0, { type: 'deployStructures' }).ok, 'открыт шаг построек');
            result = FS_RULES.apply(st, 0, { type: 'buyStructure', kind: 'city', system: sys.id, pos: free.pos, cache: true });
        }
        ok(result.ok, purchase + ' не куплен: ' + result.error);
        eq([FS_RULES.spentOf(st.order), st.players[0].assets.cache, st.players[0].assets.forge],
            [1, 0, 1], purchase + ': цена 3 − 2, тайник потрачен, кузница осталась');
        const finish = FS_RULES.apply(st, 0, { type: 'finishDeploy' });
        ok(finish.ok, 'развёртывание закончено: ' + finish.error);
        eq([finish.paid, st.players[0].materiel], [1, 4], purchase + ': оплачена оставшаяся материя');
    }
});

// --- Мехаморфоз -------------------------------------------------------------
check('Мехаморфоз', 'бесплатная замена Скитария на Катафрона', () => {
    const st = eventState('Мехаморфоз', { units: { 'скитарии': 2, 'катафроны': 1 } });
    playEvent(st);
    const q = pending(st);
    ok(!!q && q.kind === 'choice', 'выбора нет');
    eq((q.options || []).length, 3, 'три варианта замены');
    effectAnswer(st, effectPick(0), 8);
    return eq([unitsByType(st, 0)['Скитарии'] || 0, unitsByType(st, 0)['Катафроны'] || 0], [1, 2], 'скитариев и катафронов');
});

check('Мехаморфоз', 'замена Онагра на Титана стоит жетон кузни', () => {
    const st = eventState('Мехаморфоз', { units: { 'онагры': 1, 'тяжелые-титаны': 0 }, assets: { forge: 0 } });
    playEvent(st);
    // No forge token: the paid branch is not even offered, the exchange does
    // not happen.
    const q = pending(st);
    eq([q && q.kind, (q && q.options || []).length], ['choice', 2], 'без жетона кузни ветка Титана не предлагается');
    ok(!(q.options || []).some(o => o && o.pay && o.pay.kind === 'forge'), 'оставшиеся ветки бесплатны');
    effectAnswer(st, effectPick(1), 8);
    eq(unitsByType(st, 0)['Онагры'] || 0, 1, 'без жетона кузни Онагр остался');
    // With the token the exchange goes through and the token is spent.
    const st2 = eventState('Мехаморфоз', { units: { 'онагры': 1 }, assets: { forge: 1 } });
    playEvent(st2);
    effectAnswer(st2, effectPick(2), 8);
    eq([unitsByType(st2, 0)['Онагры'] || 0, unitsByType(st2, 0)['Тяжёлые титаны'] || 0], [0, 1], 'Онагр заменён на Титана');
    return eq(st2.players[0].assets.forge, 0, 'жетон кузни потрачен');
});

check('Мехаморфоз', 'деморализованный Катафрон заменяется недеморализованным Онагром после JSON', () => {
    let st = eventState('Мехаморфоз', { units: { 'катафроны': 1, 'скитарии': 1 }, materiel: 5, assets: { forge: 1 } });
    const source = st.units.find(u => u.unit === 'катафроны');
    const wrong = st.units.find(u => u.unit === 'скитарии');
    source.routed = true;
    st.players[0].supply.units['онагры'] = 1;
    const priorKataphron = st.players[0].supply.units['катафроны'];
    ok(playEvent(st).ok, 'событие сыграно');
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { choice: 1 } }).ok, 'выбрана замена на Онагра');
    eq([pending(st).op, pending(st).options], ['replaceUnit', [source.id]], 'предложен деморализованный Катафрон');
    eq(FS_RULES.apply(st, 1, { type: 'effect', answer: { units: [source.id] } }).ok, false, 'чужой игрок не отвечает');
    eq(FS_RULES.apply(st, 0, { type: 'effect', answer: { units: [wrong.id] } }).ok, false, 'непредложенный отряд отклонён');
    st = JSON.parse(JSON.stringify(st));
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { units: [source.id] } }).ok, 'замена после JSON принята');
    const replaced = st.units.find(u => u.id === source.id);
    eq([replaced.unit, replaced.routed], ['онагры', false], 'новая модель недеморализована');
    eq([st.players[0].supply.units['катафроны'], st.players[0].supply.units['онагры']],
        [priorKataphron + 1, 0], 'старая модель возвращена, новая взята из запаса');
    eq([st.players[0].materiel, st.players[0].assets.forge], [5, 1], 'бесплатная ветка ничего не списала');
});

check('Мехаморфоз', 'без исходного отряда или модели Титана жетон кузницы не списывается', () => {
    for (const missing of ['source', 'model']) {
        const st = eventState('Мехаморфоз', {
            units: missing === 'source' ? { 'скитарии': 1 } : { 'онагры': 1 }, assets: { forge: 1 },
        });
        st.players[0].supply.units['тяжелые-титаны'] = missing === 'model' ? 0 : 1;
        const before = JSON.stringify(st.units);
        ok(playEvent(st).ok, 'событие сыграно');
        ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { choice: 2 } }).ok, 'выбрана ветка Титана');
        eq(st.players[0].assets.forge, 1, missing + ': жетон остался');
        eq(JSON.stringify(st.units), before, missing + ': отряды не заменены');
        eq(st.pending, null, missing + ': невозможный выбор не ждёт ответа');
    }
});

check('Мехаморфоз', 'наличие модели и кузницы перепроверяется перед оплатой', () => {
    for (const missing of ['model', 'forge']) {
        let st = eventState('Мехаморфоз', { units: { 'онагры': 1 }, assets: { forge: 1 } });
        st.players[0].supply.units['тяжелые-титаны'] = 1;
        const source = st.units.find(u => u.unit === 'онагры');
        ok(playEvent(st).ok, 'событие сыграно');
        ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { choice: 2 } }).ok, 'выбрана ветка Титана');
        eq(pending(st).options, [source.id], 'Онагр предложен до изменения запаса');
        st = JSON.parse(JSON.stringify(st));
        // Simulate a stale question, not an ordinary intervening player turn.
        if (missing === 'model') st.players[0].supply.units['тяжелые-титаны'] = 0;
        else st.players[0].assets.forge = 0;
        ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { units: [source.id] } }).ok, 'старый ответ обработан');
        eq(st.units.find(u => u.id === source.id).unit, 'онагры', missing + ': исходная модель осталась');
        eq(st.players[0].assets.forge, missing === 'model' ? 1 : 0, missing + ': лишняя оплата не списана');
        eq(st.players[0].supply.units['тяжелые-титаны'], missing === 'model' ? 0 : 1, missing + ': лишняя модель не взята');
    }
});

// --- Багровая стража --------------------------------------------------------
check('Багровая стража', '2 материала — 2 бесплатных Скитария в мире с фабрикой', () => {
    const st = eventState('Багровая стража', { units: { 'скитарии': 1 }, structures: ['factory'], materiel: 5 });
    playEvent(st);
    const q = pending(st);
    ok(!!q && q.kind === 'choice', 'выбора нет');
    eq((q.options || []).length, 2, 'два варианта');
    effectAnswer(st, effectPick(0), 12);
    const mine = st.units.filter(u => u.seat === 0 && u.system === st.sys && u.area === st.pos).length;
    eq(mine, 3, 'отрядов в мире фабрики (был 1 + 2 размещённых)');
    return eq(st.players[0].materiel, 3, 'материи осталось (5 − 2)');
});

check('Багровая стража', 'искусственно спорный мир: выбор, JSON и завершение события без выдуманного атакующего', () => {
    let st = eventState('Багровая стража', { units: { 'скитарии': 1 }, structures: ['factory'], materiel: 5 });
    // EventPhase has already drawn seat 0's card; the next event belongs to 1.
    st.turn = 1;
    FS_RULES.addUnit(st, 1, 'гвардейцы', st.sys, st.pos);
    eq(FS_RULES.areaState(st, 0, st.sys, st.pos), 'contested', 'мир был спорным ДО размещения');
    ok(playEvent(st).ok, 'событие сыграно');
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { choice: 0 } }).ok, 'выбрана платная ветка');
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { type: 'скитарии' } }).ok, 'выбраны Скитарии');
    st = JSON.parse(JSON.stringify(st));
    eq(pending(st).kind, 'areas', 'спрошено место после JSON');
    ok(pending(st).options.some(a => a.system === st.sys && a.pos === st.pos), 'мир с собственной фабрикой предложен');
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { area: { system: st.sys, pos: st.pos } } }).ok, 'мир выбран');
    eq([unitsByType(st, 0)['Скитарии'], st.players[0].materiel], [3, 3], 'две модели размещены за два материала');
    eq([st.phase, st.event?.seat, st.eventsLeft, st.pending, st.combat], ['refresh', 1, 1, null, null],
        'событие завершено, очередь передана следующему месту');
    eq(FS_RULES.apply(st, 0, { type: 'resolveEvent' }).ok, false, 'предыдущий игрок не может разыграть следующее событие');
    // This pre-existing contested state is not reachable in a normal event
    // phase: a battle should have been resolved when the area first became
    // contested. The fixture lacks its attacker/origins and must not fabricate
    // them, or be cited as a new effect-created battle.
});

check('Багровая стража', 'одна модель в запасе: платная ветка недоступна, бесплатная остаётся', () => {
    let st = eventState('Багровая стража', { units: { 'скитарии': 1 }, structures: ['factory'], materiel: 5 });
    st.players[0].supply.units['скитарии'] = 1;
    ok(playEvent(st).ok, 'событие разыграно');
    eq([pending(st)?.kind, pending(st)?.options.length], ['choice', 1], 'предложена только бесплатная ветка');
    eq(pending(st).options[0].op, 'placeFree', 'оставшаяся ветка не требует платы');
    const before = JSON.stringify(st);
    eq(FS_RULES.apply(st, 0, { type: 'effect', answer: { choice: 1 } }).ok, false, 'поддельный второй вариант отклонён');
    eq(JSON.stringify(st), before, 'ошибка ничего не меняет');
    st = JSON.parse(JSON.stringify(st));
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { choice: 0 } }).ok, 'бесплатная ветка выбрана после JSON');
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { area: { system: st.sys, pos: st.pos } } }).ok, 'мир выбран');
    eq([unitsByType(st, 0)['Скитарии'], st.players[0].supply.units['скитарии'], st.players[0].materiel],
        [2, 0, 5], 'размещена одна модель без оплаты');
});

check('Багровая стража', 'устаревший выбор: потеря второй модели до размещения не списывает плату', () => {
    let st = eventState('Багровая стража', { units: { 'скитарии': 1 }, structures: ['factory'], materiel: 5 });
    st.players[0].supply.units['скитарии'] = 2;
    ok(playEvent(st).ok, 'событие разыграно');
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { choice: 0 } }).ok, 'платная ветка выбрана');
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { type: 'скитарии' } }).ok, 'тип выбран');
    st = JSON.parse(JSON.stringify(st));
    st.players[0].supply.units['скитарии'] = 1;
    const before = JSON.stringify(st);
    eq(FS_RULES.apply(st, 0, { type: 'effect', answer: { area: { system: st.sys, pos: st.pos } } }).ok, false,
        'устаревший выбор отклонён');
    eq(JSON.stringify(st), before, 'нет оплаты, размещения или потери вопроса');
});

check('Багровая стража', 'размещение сверх пяти разрешено, избыток выбирается в конце фазы событий', () => {
    let st = eventState('Багровая стража', { units: { 'скитарии': 5 }, structures: ['factory'], materiel: 5 });
    st.players[0].supply.units['скитарии'] = 3;
    const other = st.systems.find(sys => sys.id !== st.sys);
    FS_RULES.addUnit(st, 1, 'гвардейцы', other.id, worldOf(st, other.id));
    // eventState already represents player 0's drawn event; the next seat is 1.
    st.turn = 1;
    ok(playEvent(st).ok, 'событие разыграно');
    effectAnswer(st, effectPick(0));
    eq(st.units.filter(u => u.seat === 0 && u.system === st.sys && u.area === st.pos).length, 7,
        'пять стоявших и два размещённых Скитария');
    eq(st.players[0].materiel, 3, 'оплачена фиксированная стоимость');
    eq(FS_RULES.trimQueue(st).any(), false, 'до конца фазы событий избыток не убирается');
    eq(st.event.seat, 1, 'сначала событие следующего игрока');
    ok(FS_RULES.apply(st, 1, { type: 'resolveEvent', skip: true }).ok, 'следующее событие завершено');
    eq([st.phase, st.eventTrimPending, FS_RULES.trimQueue(st).blocked(0)], ['refresh', true, true],
        'фаза ждёт выбора лишних отрядов');
    st = JSON.parse(JSON.stringify(st));
    eq(FS_RULES.apply(st, 1, { type: 'nextPhase' }).ok, false, 'новая фаза не начинается раньше уборки');
    const cap = FS_RULES.capacity(st, st.sys, st.pos);
    while (FS_RULES.trimQueue(st).blocked(0)) {
        const victim = st.units.find(u => u.seat === 0 && u.system === st.sys && u.area === st.pos);
        ok(FS_RULES.apply(st, 0, { type: 'trimUnit', system: st.sys, pos: st.pos, unit: victim.id }).ok,
            'владелец выбрал лишний отряд');
    }
    eq(st.units.filter(u => u.seat === 0 && u.system === st.sys && u.area === st.pos).length, cap,
        'в мире осталось по вместимости');
    eq(st.phase, 'planning', 'новый раунд начинается после последнего выбора');
});

check('Багровая стража', 'очередь избытка двух игроков, неверные ответы и планирование после JSON', () => {
    let st = eventState('Багровая стража', { units: { 'скитарии': 5 }, structures: ['factory'], materiel: 5 });
    st.players[0].supply.units['скитарии'] = 2;
    const other = st.systems.find(sys => sys.id !== st.sys);
    const otherPos = worldOf(st, other.id);
    const cap1 = FS_RULES.capacity(st, other.id, otherPos);
    for (let i = 0; i <= cap1; i++) FS_RULES.addUnit(st, 1, 'гвардейцы', other.id, otherPos);
    schemeInPlay(st, 'Научная экспедиция');
    const round = st.round;
    st.turn = 1;
    ok(playEvent(st).ok, 'тактика разыграна');
    effectAnswer(st, effectPick(1));
    eq(st.event.seat, 1, 'второй игрок разыгрывает событие до проверки вместимости');
    ok(FS_RULES.apply(st, 1, { type: 'resolveEvent', skip: true }).ok, 'второе событие закончено');
    eq([st.phase, st.round, st.pending, st.eventTrimPending], ['refresh', round, null, true],
        'сначала оба игрока выбирают лишние отряды, плана ещё нет');
    eq([FS_RULES.trimQueue(st).blocked(0), FS_RULES.trimQueue(st).blocked(1)], [true, true], 'оба игрока в очереди');
    const theirs = st.units.find(u => u.seat === 1);
    const mine = st.units.find(u => u.seat === 0);
    const size = st.units.length;
    eq(FS_RULES.apply(st, 0, { type: 'trimUnit', system: other.id, pos: otherPos, unit: theirs.id }).ok, false,
        'нельзя выбрать чужой отряд');
    eq(FS_RULES.apply(st, 1, { type: 'trimUnit', system: other.id, pos: otherPos, unit: mine.id }).ok, false,
        'нельзя убрать отряд из другой области');
    eq(FS_RULES.apply(st, 1, { type: 'nextPhase' }).ok, false, 'раннее начало фазы запрещено');
    eq(st.units.length, size, 'неверные команды ничего не уничтожили');
    st = JSON.parse(JSON.stringify(st));
    ok(FS_RULES.apply(st, 1, { type: 'trimUnit', system: other.id, pos: otherPos, unit: theirs.id }).ok,
        'второй игрок выбрал свой лишний отряд');
    eq(FS_RULES.apply(st, 1, { type: 'trimUnit', system: other.id, pos: otherPos, unit: theirs.id }).ok, false,
        'повторный ответ не удаляет другой отряд');
    eq([st.phase, st.round, st.pending, st.eventTrimPending], ['refresh', round, null, true],
        'пока первый игрок не закончил, новый раунд не наступает');
    while (FS_RULES.trimQueue(st).blocked(0)) {
        const victim = st.units.find(u => u.seat === 0 && u.system === st.sys && u.area === st.pos);
        ok(FS_RULES.apply(st, 0, { type: 'trimUnit', system: st.sys, pos: st.pos, unit: victim.id }).ok,
            'первый игрок убирает свой избыток');
    }
    eq([st.phase, st.round, st.eventTrimPending], ['planning', round + 1, undefined], 'раунд продвинулся ровно раз');
    eq([st.pending.seat, pending(st).kind], [0, 'scheme'], 'только теперь предложена Научная экспедиция');
    st = JSON.parse(JSON.stringify(st));
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { no: true } }).ok, 'отказ после сохранения');
    eq([st.phase, st.pending, st.round], ['planning', null, round + 1], 'планирование продолжается');
});

check('Багровая стража', 'без моделей, фабрики или двух материалов платная ветка недоступна', () => {
    for (const missing of ['model', 'factory', 'materiel']) {
        const st = eventState('Багровая стража', { units: { 'скитарии': 1 }, structures: missing === 'factory' ? [] : ['factory'], materiel: missing === 'materiel' ? 1 : 5 });
        if (missing === 'model') st.players[0].supply.units['скитарии'] = 0;
        const before = st.players[0].materiel;
        ok(playEvent(st).ok, 'событие разыграно');
        if (missing === 'model') eq(st.pending, null, 'без моделей не предлагается невозможное размещение');
        else {
            eq([pending(st)?.kind, pending(st)?.options.length, pending(st)?.options[0].op],
                ['choice', 1, 'placeFree'], missing + ': осталась бесплатная ветка');
        }
        eq(st.players[0].materiel, before, missing + ': стоимость не списана');
        eq(unitsByType(st, 0)['Скитарии'], 1, missing + ': отряд не создан до выбора');
    }
});

check('Багровая стража', '1 бесплатный Скитарий в любом дружественном мире', () => {
    const st = eventState('Багровая стража', { units: { 'скитарии': 1 }, materiel: 5 });
    playEvent(st);
    effectAnswer(st, effectPick(0), 12);
    eq(st.players[0].materiel, 5, 'материя не потрачена');
    return eq(st.units.filter(u => u.seat === 0).length, 2, 'отрядов у вас');
});

// --- Лингва Технис ----------------------------------------------------------
check('Лингва Технис', 'два мира с вашей фабрикой дают скидку 2 с учётом командного уровня', () => {
    let st = eventState('Лингва Технис', { units: { 'скитарии': 1 }, structures: ['factory'], materiel: 10 });
    const sys = FS_RULES.system(st, st.sys);
    const second = sys.areas.find(a => a.world && a.pos !== st.pos);
    FS_RULES.addUnit(st, 0, 'скитарии', st.sys, second.pos);
    st.structures.push({ id: 'f2', seat: 0, type: 'factory', system: st.sys, area: second.pos });
    // The text says "your factory", not "friendly world": a contested world
    // still counts. A second factory on that world does not count it twice.
    FS_RULES.addUnit(st, 1, 'гвардейцы', st.sys, second.pos);
    st.structures.push({ id: 'f3', seat: 0, type: 'factory', system: st.sys, area: second.pos });
    const citySys = st.systems[1];
    FS_RULES.addStructure(st, 0, 'city', citySys.id, worldOf(st, citySys.id));
    eq(FS_RULES.commandLevel(st, 0), 1, 'один город даёт КЛ 1');
    const before = st.players[0].materiel;
    const res = playEvent(st);
    ok(res.ok, 'карта не сыграна: ' + res.error);
    const q = pending(st);
    eq(q.op, 'buyUpgrade', 'событие ждёт покупки');
    eq(q.discount, 2, 'два мира, а не три фабрики');
    ok(q.options.includes('Святой трубопровод'), 'доступное улучшение КЛ 1 предложено');
    ok(!q.options.includes('Главный по машинам'), 'КЛ 2 пока недоступен');
    eq(FS_RULES.apply(st, 0, { type: 'effect', answer: { card: 'Главный по машинам' } }).ok,
        false, 'недоступное улучшение отклонено');
    st = JSON.parse(JSON.stringify(st));
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { card: 'Святой трубопровод' } }).ok,
        'разрешённое улучшение куплено после сохранения');
    ok(st.players[0].upgrades.some(u => u.name === 'Святой трубопровод'), 'улучшение получено');
    return eq(before - st.players[0].materiel, 0, 'стоимость 2 полностью покрыта скидкой 2');
});

check('Колода улучшений', 'пустые стопки не восстанавливаются при покупке или способности', () => {
    const st = orderState('strategize', { units: { 'скитарии': 1 }, materiel: 10 });
    const p = st.players[0];
    p.decks.upgradeCombat = [];
    p.decks.upgradeOrder = [];
    const before = p.materiel;
    eq(FS_CARDS.combatDeck(FS_RULES, st, 0).upgradeOptions(), [], 'боевая стопка действительно пуста');
    eq(FS_RULES.apply(st, 0, { type: 'buyUpgrade', kind: 'combat', card: 'Трансцендентная дума' }).ok,
        false, 'пустая боевая стопка не позволяет купить пару');
    eq(FS_RULES.apply(st, 0, { type: 'buyUpgrade', kind: 'order', card: 'Святой трубопровод' }).ok,
        false, 'пустая стопка приказов не позволяет купить карту');
    FS_RULES.runEffects(st, 0, [{ op: 'buyUpgrade', kind: 'combat', who: 'me' }], { kind: 'event' });
    eq(st.pending, null, 'событие не предлагает отсутствующие пары');
    eq([p.materiel, p.decks.upgradeCombat, p.decks.upgradeOrder], [before, [], []], 'материя и пустые стопки не менялись');
});

check('Колода улучшений', 'старое сохранение с полной колодой восстанавливает пары, с неполной — нет', () => {
    let st = orderState('strategize', { units: { 'скитарии': 1 }, materiel: 10 });
    delete st.players[0].decks.upgradeCombat;
    eq(st.players[0].decks.combat.length, 10, 'полная боевая колода');
    const deck = FS_CARDS.combatDeck(FS_RULES, st, 0);
    ok(deck.upgradeOptions().includes('Трансцендентная дума'), 'старая отсутствующая стопка восстановлена');
    const wanted = 'Трансцендентная дума';
    const before = st.players[0].materiel;
    ok(FS_RULES.apply(st, 0, { type: 'buyUpgrade', kind: 'combat', card: wanted }).ok, 'пара выбрана');
    eq(pending(st).op, 'buyUpgradeReplace', 'приказ спрашивает заменяемую пару');
    const remove = pending(st).options[0];
    eq(FS_RULES.apply(st, 0, { type: 'effect', answer: { remove: 'несуществующая карта' } }).ok,
        false, 'поддельная пара отклонена');
    eq(st.players[0].materiel, before, 'до замены оплата не списана');
    st = JSON.parse(JSON.stringify(st));
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { remove } }).ok, 'после сохранения пара заменена');
    eq(st.players[0].decks.combat.filter(n => n === wanted).length, 2, 'в колоде две купленные карты');
    eq(st.players[0].decks.combat.length, 10, 'размер колоды не изменился');
    ok(FS_RULES.apply(st, 0, { type: 'refundUpgrade', kind: 'combat', card: wanted }).ok, 'покупку можно отменить');
    eq([st.players[0].materiel, st.players[0].decks.combat.filter(n => n === remove).length],
        [before, 2], 'цена и первоначальная пара возвращены');
    const incomplete = orderState('strategize', { units: { 'скитарии': 1 }, materiel: 10 });
    incomplete.players[0].decks.combat.splice(0, 5);
    delete incomplete.players[0].decks.upgradeCombat;
    eq(FS_CARDS.combatDeck(FS_RULES, incomplete, 0).upgradeOptions(), [], 'пять карт в руке не создают лишние пары');
    eq(incomplete.players[0].decks.upgradeCombat, undefined, 'неполное старое состояние не переписано догадкой');
});

check('Колода улучшений', 'стратегия отменяет незавершённый выбор пары без оплаты', () => {
    const st = orderState('strategize', { units: { 'скитарии': 1 }, materiel: 10 });
    st.systems[1].tokens.push({ seat: 1, order: 'deploy', faceUp: false });
    const p = st.players[0], before = p.decks.combat.slice().sort(), matter = p.materiel;
    ok(FS_RULES.apply(st, 0, { type: 'buyUpgrade', kind: 'combat', card: 'Трансцендентная дума' }).ok, 'покупка начата');
    eq(pending(st).op, 'buyUpgradeReplace', 'пара ещё не выбрана');
    ok(FS_RULES.apply(st, 0, { type: 'finishStrategize' }).ok, 'приказ закончен без выбора');
    eq([st.pending, st.order, st.turn], [null, null, 1], 'вопрос закрыт, ход передан');
    eq([p.materiel, p.decks.combat.slice().sort()], [matter, before], 'карты и материя не менялись');
});

// --- Планы: Боевая кузня, Научная экспедиция, Заряд радиации, Некромеханика --
/** Put a scheme card of the tested faction into play. */
function schemeInPlay(st, name, faction) {
    const of = faction || MECH;
    const card = FS_DATA.events.find(e => e.faction === of && e.name === name);
    ok(!!card, 'нет карты «' + name + '»');
    const trig = FS_EFFECTS.parse(card.text || '', { kind: 'event', faction: of }).find(s => s.op === 'trigger');
    st.players[0].schemes = st.players[0].schemes || [];
    st.players[0].schemes.push({
        name: card.name, text: card.text || '',
        trigger: trig ? trig.trigger : null, steps: trig ? trig.steps : [],
        note: trig ? !!trig.note : true, defer: trig ? !!trig.defer : false,
        orderType: trig ? trig.orderType || null : null,
        insteadOfOrder: trig ? !!trig.insteadOfOrder : false,
    });
    return st.players[0].schemes[st.players[0].schemes.length - 1];
}

check('Боевая кузня', 'во время приказа покупается фабрика в активной системе', () => {
    const st = orderState('advance', { units: { 'скитарии': 1 }, materiel: 10 });
    const scheme = schemeInPlay(st, 'Боевая кузня');
    ok(scheme.steps.some(s => s.op === 'placeStructure'), 'план не хранит покупку фабрики');
    // The moment of the card: the activation of the order.
    st.phase = 'operations';
    st.turn = 0;
    st.order = null;
    const sys = st.systems[0];
    sys.tokens.push({ seat: 0, order: 'advance', faceUp: false });
    const res = FS_RULES.apply(st, 0, { type: 'resolveOrder', system: sys.id });
    ok(res.ok, 'приказ не раскрыт: ' + res.error);
    const q = pending(st);
    ok(!!q && q.kind === 'scheme', 'план не предложен');
    const before = st.players[0].materiel;
    effectAnswer(st, effectPick(0), 10);
    const factory = st.structures.find(s => s.seat === 0 && s.type === 'factory' && s.system === sys.id);
    ok(!!factory, 'фабрика не размещена');
    return eq(before - st.players[0].materiel, FS_RULES.structureStats('factory').cost, 'фабрика куплена за материю');
});

check('Научная экспедиция', 'перекладывает верхний свой приказ в законную смежную систему без создания жетона', () => {
    let st = orderState('advance', { units: { 'скитарии': 1 } });
    const scheme = schemeInPlay(st, 'Научная экспедиция');
    ok(scheme.steps.some(s => s.op === 'placeOrderAny'), 'план не хранит перенос приказа');
    const sys = st.systems[0];
    const targetId = FS_RULES.neighbors(st, sys.id)[0];
    const target = FS_RULES.system(st, targetId);
    ok(!!target, 'для проверки нужна соседняя система');
    const token = { seat: 0, order: 'advance', faceUp: false };
    sys.tokens.push({ seat: 1, order: 'deploy', faceUp: false }, token);
    target.tokens.push({ seat: 0, order: 'dominate', faceUp: false }, { seat: 1, order: 'advance', faceUp: false });
    st.order = null;
    st.phase = 'planning';
    st.players[0].placedTokens = 2;
    st.players[0].placedOf = { advance: 1, dominate: 1 };
    const before = st.systems.reduce((n, s) => n + s.tokens.length, 0);
    FS_RULES.offerPlanningSchemes(st, 0);
    eq(pending(st).kind, 'scheme', 'план предложен в начале планирования');
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { choice: 0 } }).ok, 'план принят');
    eq(pending(st).stage, 'source', 'спрашивается исходная стопка');
    ok(pending(st).options.includes(sys.id), 'своя верхняя фишка доступна');
    ok(!pending(st).options.includes(targetId), 'чужая верхняя фишка недоступна');
    eq(FS_RULES.apply(st, 0, { type: 'effect', answer: { system: targetId } }).ok, false, 'чужая вершина отклонена');
    st = JSON.parse(JSON.stringify(st));
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { system: sys.id } }).ok, 'источник выбран');
    eq(pending(st).stage, 'destination', 'спрашивается назначение');
    ok(pending(st).options.includes(targetId), 'смежная система доступна');
    eq(FS_RULES.apply(st, 0, { type: 'effect', answer: { system: sys.id } }).ok, false, 'исходная система не цель');
    st = JSON.parse(JSON.stringify(st));
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { system: targetId } }).ok, 'назначение выбрано');
    eq(FS_RULES.system(st, targetId).tokens.at(-1), token, 'на вершине лежит тот же приказ');
    eq(FS_RULES.system(st, sys.id).tokens.at(-1).seat, 1, 'нижний приказ остался на месте');
    eq(st.players[0].placedTokens, 2, 'счётчик размещённых приказов не изменился');
    eq(st.players[0].placedOf, { advance: 1, dominate: 1 }, 'виды жетонов не изменились');
    const foeView = FS_RULES.view(st, 1);
    eq(FS_RULES.system(foeView, targetId).tokens.at(-1).order, undefined, 'перемещённый закрытый приказ противнику не виден');
    ok(!foeView.log.some(entry => /перекладывает приказ «/.test(entry.text)), 'публичный журнал не выдаёт лицо приказа');
    return eq(st.systems.reduce((n, s) => n + s.tokens.length, 0), before, 'новый жетон не создаётся');
});

check('Заряд радиации', 'здоровье юнитов атакуемого мира убавляется на 1', () => {
    // An ogrin has 4 health: three hits of the strike do not kill it, but with
    // the card its health is 3 and the same three hits kill it. The card is
    // offered at its own moment — before the activation of the strike.
    const strike = withCard => {
        const st = strikeState({ upgrades: [], foeUnits: { 'огрины': 1 } });
        if (withCard) {
            const scheme = schemeInPlay(st, 'Заряд радиации');
            ok(scheme.trigger === 'strike', 'план ждёт орбитального удара');
        }
        const roll = FS_RULES.rollDice;
        FS_RULES.rollDice = () => ['att', 'att', 'att'];
        const target = FS_RULES.orbitalStrikeTargets(st, 0)[0];
        ok(!!target, 'нет цели для удара');
        const cmd = { type: 'orbitalStrike', system: target.system, pos: target.pos };
        const res = FS_RULES.apply(st, 0, cmd);
        ok(res.ok, 'удар не нанесён: ' + res.error);
        // The scheme of the strike is answered first: the card is discarded, and
        // only then the strike itself is fired.
        for (let i = 0; i < 6 && st.pending; i++) {
            const q = st.pending.question || {};
            const ans = (q.kind === 'scheme' || q.kind === 'choice') ? { choice: 0 } : effectPolicy(st, q);
            const r = FS_RULES.apply(st, st.pending.seat, { type: 'effect', answer: ans });
            ok(r.ok, 'ответ не принят: ' + r.error);
            if (r.done) break;
        }
        if (withCard) eq(st.order.strikeHealthDown, 1, 'приказ помнит убавление здоровья');
        if (!st.strike) {
            const again = FS_RULES.apply(st, 0, cmd);
            ok(again.ok, 'удар не нанесён после плана: ' + again.error);
        }
        FS_RULES.rollDice = roll;
        ok(!!st.strike, 'удара нет');
        // The player who suffers the strike assigns its damage.
        for (let i = 0; i < 4 && st.strike && st.strike.left > 0; i++) {
            const victim = st.units.find(u => u.seat === 1 && u.system === st.strike.system && u.area === st.strike.pos);
            if (!victim) break;
            const r = FS_RULES.apply(st, 1, { type: 'strikeDamage', unit: victim.id });
            ok(r.ok, 'урон не назначен: ' + r.error);
        }
        return st.units.filter(u => u.seat === 1 && u.system === target.system && u.area === target.pos).length;
    };
    eq(strike(false), 1, 'без карты огрин выжил');
    return eq(strike(true), 0, 'с картой огрин убит');
});

check('Заряд радиации', 'здоровье 1 убивает сразу, бастион урон получает без снижения здоровья', () => {
    const execute = faces => {
        let st = strikeState({ upgrades: ['Изъяны плоти'], foeUnits: { 'гвардейцы': 1 }, foeStructures: ['bastion'] });
        st.systems[1].tokens.push({ seat: 1, order: 'deploy', faceUp: false });
        const defender = st.units.find(u => u.seat === 1), bastion = st.structures.find(s => s.seat === 1);
        schemeInPlay(st, 'Заряд радиации');
        ok(burn(st, 'Изъяны плоти').ok, 'улучшение разрешает удар по бастиону');
        const target = FS_RULES.orbitalStrikeTargets(st, 0).find(a => a.pos === st.strikeWorld);
        ok(target, 'цель с бастионом доступна');
        const cmd = { type: 'orbitalStrike', system: target.system, pos: target.pos };
        ok(FS_RULES.apply(st, 0, cmd).ok, 'предложение плана открыто');
        eq(pending(st).kind, 'scheme', 'план спрашивается до броска');
        st = JSON.parse(JSON.stringify(st));
        ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { choice: 0 } }).ok, 'план сброшен после JSON');
        const roll = FS_RULES.rollDice;
        try {
            FS_RULES.rollDice = () => faces.slice();
            ok(FS_RULES.apply(st, 0, cmd).ok, 'орбитальный удар выполнен');
        } finally {
            FS_RULES.rollDice = roll;
        }
        eq(st.units.some(u => u.id === defender.id), false, 'юнит со здоровьем 1 погиб от радиации до назначения урона');
        ok(st.strike && st.strike.left === faces.filter(f => f === 'att').length, 'урон ждёт защитника');
        st = JSON.parse(JSON.stringify(st));
        eq(FS_RULES.apply(st, 0, { type: 'strikeDamage', structure: bastion.id }).ok, false, 'атакующий не распределяет урон защитника');
        ok(FS_RULES.apply(st, 1, { type: 'strikeDamage', structure: bastion.id }).ok, 'защитник назначил урон бастиону');
        eq([st.strike, st.order, st.turn], [null, null, 1], 'удар и приказ закончились');
        return st.structures.some(s => s.id === bastion.id);
    };
    eq(execute(['att', 'att', 'def']), true, 'два попадания не уничтожают бастион со здоровьем 3');
    eq(execute(['att', 'att', 'att']), false, 'три попадания уничтожают бастион');
});

check('Некромеханика', 'пропущенный ход: сброс плана, две карты, вложенный выбор и продолжение после JSON', () => {
    let st = eventState('Некромеханика', {
        units: { 'скитарии': 1 }, structures: ['factory'], materiel: 5, assets: { forge: 0 },
    });
    st.phase = 'operations';
    st.event = null;
    st.turn = 1;
    st.systems[1].tokens.push({ seat: 1, order: 'advance', faceUp: false });
    const scheme = schemeInPlay(st, 'Некромеханика');
    ok(scheme.steps.some(s => s.op === 'activateEvents'), 'план хранит активацию событий');
    st.players[0].decks.event = ['Багровая стража', 'Благословение Бога-Машины'];
    st.players[0].eventDeckInitialized = true;
    // Keep the shuffle deterministic while exercising the real discard and draw.
    const shuffle = FS_RULES.shuffle;
    FS_RULES.shuffle = (state, cards) => cards.slice();
    try {
        FS_RULES.nextTurn(st);
        eq([st.turn, pending(st).kind], [0, 'scheme'], 'пропускающий игрок выбирает план до следующего хода');
        ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { choice: 0 } }).ok, 'план сброшен');
        eq(st.players[0].decks.event, ['Некромеханика'], 'план сразу замешан, обе другие карты взяты до исполнения');
        eq(pending(st).kind, 'choice', 'первая тактика ждёт выбора');
        ok(!st.players[0].decks.event.includes('Благословение Бога-Машины'), 'вторая карта ещё отложена');
        st = JSON.parse(JSON.stringify(st));
        ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { choice: 1 } }).ok, 'выбрана бесплатная ветка');
        eq(pending(st).kind, 'areas', 'нужен дружественный мир');
        st = JSON.parse(JSON.stringify(st));
        ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { area: { system: st.sys, pos: st.pos } } }).ok,
            'место выбрано после сохранения');
        eq(unitsByType(st, 0)['Скитарии'], 2, 'первая тактика разместила отряд');
        eq([st.players[0].materiel, st.players[0].assets.forge, st.players[0].assets.cache], [5, 1, 1],
            'вторая тактика дала тайник и кузницу, не материю');
        eq(st.players[0].decks.event.slice().sort(), ['Некромеханика', 'Багровая стража', 'Благословение Бога-Машины'].sort(),
            'три карты вернулись по одной');
        eq([st.phase, st.turn, st.pending], ['operations', 1, null], 'передан ход игроку с приказом');
    } finally {
        FS_RULES.shuffle = shuffle;
    }
});

check('Некромеханика', 'истощение во время добора не создаёт вторую копию сброшенного плана', () => {
    let st = eventState('Некромеханика', { units: { 'скитарии': 1 } });
    st.phase = 'operations'; st.event = null; st.turn = 1;
    st.systems[1].tokens.push({ seat: 1, order: 'advance', faceUp: false });
    schemeInPlay(st, 'Некромеханика');
    st.players[0].decks.event = [];
    st.players[0].eventDeckInitialized = true;
    FS_RULES.nextTurn(st);
    eq(pending(st).kind, 'scheme', 'план предложен пропускающему игроку');
    st = JSON.parse(JSON.stringify(st));
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { choice: 0 } }).ok, 'план сброшен и активирован');
    eq(st.players[0].schemes.map(s => s.name), ['Некромеханика'], 'единственная карта плана вновь в игре');
    eq(st.players[0].decks.event, [], 'пустая колода не выдала её второй раз');
    eq([st.pending, st.turn, st.phase], [null, 1, 'operations'], 'следующий ход не застрял');
});

check('Некромеханика', 'два взятых плана последовательно заменяют друг друга и сброшенная карта возвращается', () => {
    let st = eventState('Некромеханика', { units: { 'скитарии': 1 } });
    st.phase = 'operations'; st.event = null; st.turn = 1;
    st.systems[1].tokens.push({ seat: 1, order: 'advance', faceUp: false });
    schemeInPlay(st, 'Некромеханика');
    st.players[0].decks.event = ['Боевая кузня', 'Научная экспедиция'];
    st.players[0].eventDeckInitialized = true;
    const shuffle = FS_RULES.shuffle;
    FS_RULES.shuffle = (state, cards) => cards.slice();
    try {
        FS_RULES.nextTurn(st);
        st = JSON.parse(JSON.stringify(st));
        ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { choice: 0 } }).ok, 'план сброшен');
        eq(st.players[0].schemes.map(s => s.name), ['Научная экспедиция'], 'второй план заменил первый');
        eq(st.players[0].decks.event.slice().sort(), ['Некромеханика', 'Боевая кузня'].sort(), 'оба сброшенных плана замешаны по одному');
        eq([st.pending, st.turn, st.phase], [null, 1, 'operations'], 'операции продолжились');
    } finally {
        FS_RULES.shuffle = shuffle;
    }
});

// The faction ability of the other player fails its condition at the end of
// his dominate order; his order ends, the turn passes, and the skipped player
// is offered this plan. The question must survive the end of the failed effect.
check('Некромеханика', 'пропуск хода после несработавшей способности противника: план предложен, ход не теряется', () => {
    let st = eventState('Некромеханика', { faction: MECH, foeFaction: 'империя-тау', units: { 'скитарии': 1 } });
    st.phase = 'operations'; st.event = null; st.turn = 1;
    schemeInPlay(st, 'Некромеханика');
    st.players[0].decks.event = [];
    st.players[0].eventDeckInitialized = true;
    // The Tau dominate in a system where they have nothing: the ability of
    // the faction needs units or structures there and cannot be applied.
    const empty = st.systems.find(s => s.id !== st.sys
        && !st.units.some(u => u.system === s.id) && !st.structures.some(x => x.system === s.id));
    ok(!!empty, 'нет пустой системы');
    empty.tokens.push({ seat: 1, order: 'dominate', faceUp: false });
    st.systems.find(s => s.id !== empty.id && s.id !== st.sys).tokens.push({ seat: 1, order: 'advance', faceUp: false });
    ok(FS_RULES.apply(st, 1, { type: 'resolveOrder', system: empty.id }).ok, 'приказ доминирования не раскрыт');
    st = JSON.parse(JSON.stringify(st));
    const res = FS_RULES.apply(st, 1, { type: 'finishDominate' });
    ok(res.ok, 'приказ не закончен: ' + res.error);
    ok(st.log.some(l => /не может быть применена/.test(l.text)), 'способность должна была не сработать');
    eq(st.order, null, 'приказ доминирования завершён');
    const q = pending(st);
    ok(!!q && q.kind === 'scheme', 'пропускающему игроку не предложен план');
    eq([st.turn, st.pending.seat], [0, 0], 'ход у пропускающего игрока, вопрос — ему');
    st = JSON.parse(JSON.stringify(st));
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { no: true } }).ok, 'отказ от плана не принят');
    return eq([st.phase, st.turn, st.pending, !!st.order], ['operations', 1, null, false], 'ход перешёл к игроку с приказом');
});

// ============================================================================
//  04-combat-cards.md — Тираниды: 5 базовых карт и 13 улучшений
// ============================================================================
const TYR = 'тираниды';
head('Боевая колода', TYR);

/** A battle of the Tyranids: the units the card needs are in the area. */
const tyrBattle = o => battle(Object.assign({
    faction: TYR, foeFaction: 'имперская-гвардия',
    units: { 'гаунты': 2, 'воины': 1 }, foeUnits: { 'гвардейцы': 2, 'титаны': 1 },
}, o));

/** The units of a seat, by the name of their card. */
const tyrUnits = (st, seat) => {
    const out = {};
    for (const u of st.units.filter(u => u.seat === seat)) {
        const name = (FS_RULES.unitOf(st, u) || {}).name || '?';
        out[name] = (out[name] || 0) + 1;
    }
    return out;
};

// --- Тиран улья -------------------------------------------------------------
// «Разыграйте 1 боевую карту с руки. Не применяйте её способности, но получите
//  её боевые значения до конца всего боя.»
// «*Воин/Корабль Улья:* восстановите 1 вашего юнита. Удалите 1 `morale cube`,
//  чтобы получить либо 1 `att. cube`, либо 1 `def. cube`.»
check('Тиран улья', 'вторая карта с руки даёт свои значения, но не способности', () => {
    const st = tyrBattle({
        card: 'Тиран улья', hand: ['Тиран улья', 'Выводок хормагаунов'],
        units: { 'воины': 2 }, dice: ['att'],
    });
    refuseReinforce(st);
    // The ability of the unit box is refused: only the card of the hand matters.
    play(st, 0, 0, (s, q) => (q.kind === 'cards' ? { card: 'Выводок хормагаунов' } : firstOption(s, q)));
    // «Выводок хормагаунов» gives 1 def. token by its general ability — the card
    // says its abilities are NOT applied.
    eq(tokens(st, 'attacker').def, 0, 'способности второй карты не применяются');
    // Its combat values are added for the whole battle: both cards carry 1 att.
    const cards = FS_RULES.combatValuesParts(st, 'attacker').att.cards;
    return eq(cards, 2, 'значения обеих карт (Тиран улья + Выводок хормагаунов)');
});

check('Тиран улья', 'способность отряда: восстановление и кубик за мораль', () => {
    const st = tyrBattle({ card: 'Тиран улья', units: { 'воины': 2 }, routed: [0], dice: ['morale', 'att'] });
    refuseReinforce(st);
    play(st, 0, 0, (s, q) => {
        if (q.kind === 'units') return { units: (q.options || []).slice(0, 1) };
        if (q.kind === 'dice') return { dice: (q.options || []).slice(0, 1) };
        if (q.kind === 'choice') return { choice: 0 };
        return firstOption(s, q);
    });
    eq(myUnits(st).filter(u => u.routed).length, 0, 'отряд восстановлен');
    return eq([count(st, 'attacker', 'morale'), count(st, 'attacker', 'att')], [0, 2],
        'куб морали потрачен, куб атаки получен');
});

// --- Аколыты-гибриды --------------------------------------------------------
// «противник теряет 1 `att. cube`, 1 `def. cube` или 1 `morale cube` — в
//  зависимости от того, чего больше всего. Если одинаково, выбираете Вы. Затем
//  получите 1 `att. cube`, 1 `def. cube` или 1 `morale cube`, в зависимости от
//  того, чего лишился противник.»
check('Аколыты-гибриды', 'противник теряет тот кубик, которого у него больше, и вы получаете такой же', () => {
    const st = tyrBattle({
        card: 'Аколыты-гибриды', units: { 'гаунты': 2 }, dice: ['att'],
        foeDice: ['def', 'def', 'def', 'morale'],
    });
    refuseReinforce(st);
    play(st, 0, 0);
    eq(count(st, 'defender', 'def'), 2, 'противник потерял куб обороны (их было больше всего)');
    return eq(count(st, 'attacker', 'def'), 1, 'вы получили куб обороны');
});

check('Аколыты-гибриды', 'пороовну — выбираете вы', () => {
    const st = tyrBattle({
        card: 'Аколыты-гибриды', units: { 'гаунты': 2 }, dice: ['att'],
        foeDice: ['def', 'def', 'morale', 'morale'],
    });
    refuseReinforce(st);
    let asked = null;
    play(st, 0, 0, (s, q) => {
        if (q.kind === 'choice' || q.kind === 'dice') { asked = q; return { choice: 1, dice: (q.options || []).slice(0, 1) }; }
        return firstOption(s, q);
    });
    ok(!!asked, 'выбора нет, хотя кубиков поровну');
    return eq(count(st, 'attacker', 'att') + count(st, 'attacker', 'def') + count(st, 'attacker', 'morale'), 2,
        'ваш исходный куб и один полученный');
});

// --- Роящие организмы -------------------------------------------------------
// «Если Вы атакуете, получите 2 `def. token`. Если Вы защищаетесь, либо
//  разместите 1 бесплатный жетон подкрепления в эту область, либо уничтожьте
//  2 недеморализованных Гаунта, чтобы разместить 1 бесплатный бастион в этом
//  мире, если там ещё нет построек.»
check('Роящие организмы', 'в атаке — 2 жетона обороны', () => {
    const st = tyrBattle({ card: 'Роящие организмы', units: { 'гаунты': 2 } });
    refuseReinforce(st);
    play(st, 0, 0);
    return eq(tokens(st, 'attacker').def, 2, 'жетонов обороны');
});

check('Роящие организмы', 'в обороне — жетон подкрепления либо бастион за 2 Гаунта', () => {
    // The Tyranids defend: the card is played by the second player.
    const st = battle({
        faction: 'имперская-гвардия', foeFaction: TYR,
        units: { 'гвардейцы': 2 }, foeUnits: { 'гаунты': 3 },
        card: 'Ложись!', foeCard: 'Роящие организмы',
    });
    const c = st.combat;
    refuseReinforce(st);
    let asked = null;
    play(st, 1, 0, (s, q) => {
        if (q.kind === 'choice') { asked = q; return { choice: 1 }; }
        if (q.kind === 'units') return { units: (q.options || []).slice(0, 2) };
        return firstOption(s, q);
    });
    ok(!!asked && (asked.options || []).length === 2, 'выбора из двух способностей нет');
    const bastion = st.structures.find(s => s.seat === 1 && s.type === 'bastion'
        && s.system === c.system && s.area === c.pos);
    ok(!!bastion, 'бастион не размещён');
    return eq(tyrUnits(st, 1)['Гаунты'] || 0, 1, 'два Гаунта уничтожены');
});

// --- Дождь из спор ----------------------------------------------------------
// «Уничтожьте одного недеморализованного Пожирателя в этой системе, чтобы
//  разместить одного бесплатного Воина в этот мир, и затем получить 2 `any cube`.»
check('Дождь из спор', 'Пожиратель уничтожен, Воин размещён, 2 кубика получены', () => {
    const st = tyrBattle({ card: 'Дождь из спор', units: { 'гаунты': 1 } });
    // The Пожиратели of the card stand in the void of the same system.
    const sys = FS_RULES.system(st, st.combat.system);
    const voidPos = (sys.areas.find(a => !a.world) || sys.areas[0]).pos;
    FS_RULES.addUnit(st, 0, 'пожиратели', sys.id, voidPos);
    FS_RULES.addUnit(st, 0, 'пожиратели', sys.id, voidPos);
    refuseReinforce(st);
    const before = dice(st, 'attacker').length;
    play(st, 0, 0, (s, q) => (q.kind === 'units' ? { units: (q.options || []).slice(0, 1) } : firstOption(s, q)));
    eq(tyrUnits(st, 0)['Пожиратели'] || 0, 1, 'один Пожиратель уничтожен');
    eq(tyrUnits(st, 0)['Воины'] || 0, 1, 'Воин размещён');
    return eq(dice(st, 'attacker').length - before, 2, 'два кубика получены');
});

// --- Выводок хормагаунов ----------------------------------------------------
// «Получите 1 `def. token`.»
// «*Гаунт/Пожиратель:* уничтожьте 1 недеморализованного Гаунта или Пожирателя,
//  чтобы получить 3 `att. token`.»
check('Выводок хормагаунов', 'жетон обороны и 3 жетона атаки за Гаунта', () => {
    const st = tyrBattle({ card: 'Выводок хормагаунов', units: { 'гаунты': 2 } });
    refuseReinforce(st);
    play(st, 0, 0, (s, q) => (q.kind === 'units' ? { units: (q.options || []).slice(0, 1) } : firstOption(s, q)));
    eq(tyrUnits(st, 0)['Гаунты'] || 0, 1, 'Гаунт уничтожен');
    return eq([tokens(st, 'attacker').def, tokens(st, 'attacker').att], [1, 3], 'жетонов обороны и атаки');
});

// --- Величие роя ------------------------------------------------------------
// «Потратьте любое количество `morale cube`. За каждый потраченный `morale
//  cube` Вы получаете либо 1 `att. cube`, либо 1 `def. cube`.»
// «*Биомитан/Корабль Улья:* восстановите все свои деморализованные отряды.»
check('Величие роя', 'за каждый потраченный куб морали — кубик выбранного значения', () => {
    const st = tyrBattle({ card: 'Величие роя', dice: ['morale', 'morale', 'att'] });
    refuseReinforce(st);
    play(st, 0, 0, (s, q) => {
        if (q.kind === 'dice') return { dice: (q.options || []).slice(0, 2) };
        if (q.kind === 'choice') return { choice: 0 };
        return firstOption(s, q);
    });
    eq(count(st, 'attacker', 'morale'), 0, 'кубы морали потрачены');
    return eq(count(st, 'attacker', 'att'), 3, 'исходный куб атаки и два полученных');
});

check('Величие роя', 'урон отрядам и бастионам противника назначает владелец карты', () => {
    const st = tyrBattle({
        card: 'Величие роя', units: { 'био-титаны': 1 }, dice: ['att', 'att', 'att', 'att', 'att'],
        foeUnits: { 'гвардейцы': 2 }, foeDice: [],
    });
    refuseReinforce(st);
    play(st, 0, 0);
    // The card of the other side is resolved as well: the step of the damage
    // begins only when both cards are open.
    answerAll(st, null, 1);
    eq(st.combat.step, 'damage-defender', 'бой дошёл до урона противнику');
    ok(!!st.combat.assignDamage && st.combat.assignDamage.seat === 0, 'карта не дала права назначать урон');
    // The one who suffers may not place the damage himself any more.
    const refused = FS_RULES.apply(st, 1, { type: 'combat', action: 'damage', targets: [] });
    ok(!refused.ok, 'противнику позволено назначать урон самому');
    const beforeFoe = foeUnits(st).length;
    const victim = foeUnits(st)[0];
    const targets = [victim.id, ...FS_RULES.damageCandidates(st, 'defender').map(x => x.id).filter(id => id !== victim.id)];
    const r = FS_RULES.apply(st, 0, { type: 'combat', action: 'damage', targets });
    ok(r.ok, 'владелец карты не смог назначить урон: ' + r.error);
    ok((r.applied || []).some(a => a.destroyed || a.bastion), 'назначенный урон ничего не задел');
    return eq(foeUnits(st).length < beforeFoe, true, 'отряд противника пал от назначенного урона');
});

check('Величие роя', 'способность отряда восстанавливает все деморализованные отряды', () => {
    // The requisite of the box is the unrouted Био-титан: only the Гаунты fall.
    const st = tyrBattle({ card: 'Величие роя', units: { 'био-титаны': 1, 'гаунты': 2 }, routed: [1, 2] });
    refuseReinforce(st);
    play(st, 0, 0, (s, q) => (q.kind === 'units' ? { units: (q.options || []).slice(0, 2) } : firstOption(s, q)));
    return eq(myUnits(st).filter(u => u.routed).length, 0, 'деморализованных отрядов не осталось');
});

// --- Крушащие клешни --------------------------------------------------------
// «Уничтожьте 1 из Ваших недеморализованных отрядов, чтобы получить 3
//  `att. token`.»
// «*Карнифекс/Корабль Улья:* потратьте либо 1 `att. cube`, либо 1 `morale cube`,
//  чтобы Ваш противник потерял 2 `def. cube`.»
check('Крушащие клешни', 'свой отряд уничтожен, три жетона атаки получены', () => {
    const st = tyrBattle({ card: 'Крушащие клешни', units: { 'гаунты': 2 } });
    refuseReinforce(st);
    play(st, 0, 0, (s, q) => (q.kind === 'units' ? { units: (q.options || []).slice(0, 1) } : firstOption(s, q)));
    eq(tyrUnits(st, 0)['Гаунты'] || 0, 1, 'один Гаунт уничтожен');
    return eq(tokens(st, 'attacker').att, 3, 'жетонов атаки');
});

check('Крушащие клешни', 'кубик атаки потрачен, противник лишился двух кубов обороны', () => {
    const st = tyrBattle({
        card: 'Крушащие клешни', units: { 'карнифексы': 1 },
        dice: ['att', 'morale'], foeDice: ['def', 'def', 'def'],
    });
    refuseReinforce(st);
    play(st, 0, 0, (s, q) => {
        if (q.kind === 'dice') return { dice: (q.options || []).slice(0, 1) };
        if (q.kind === 'units') return { units: (q.options || []).slice(0, 1) };
        return firstOption(s, q);
    });
    eq(count(st, 'attacker', 'att') + count(st, 'attacker', 'morale'), 1, 'один кубик потрачен');
    return eq(count(st, 'defender', 'def'), 1, 'у противника остался один куб обороны');
});

// --- Секущие когти ----------------------------------------------------------
// «Во время шага нанесения повреждений, если противник получил урон, он
//  получает ещё 3 урона.»
// «*Карнифекс/Корабль Улья:* уничтожьте 1 недеморализованный Карнифекс или
//  Корабль-Улей, чтобы получить 3 `att. token` и 2 `def. token`.»
check('Секущие когти', 'жетоны атаки и обороны за уничтоженный Карнифекс', () => {
    const st = tyrBattle({ card: 'Секущие когти', units: { 'карнифексы': 1, 'гаунты': 1 } });
    refuseReinforce(st);
    play(st, 0, 0, (s, q) => (q.kind === 'units' ? { units: (q.options || []).slice(0, 1) } : firstOption(s, q)));
    eq(tyrUnits(st, 0)['Карнифексы'] || 0, 0, 'Карнифекс уничтожен');
    return eq([tokens(st, 'attacker').att, tokens(st, 'attacker').def], [3, 2], 'жетоны атаки и обороны');
});

check('Секущие когти', 'противник получает ещё 3 урона, если урон был', () => {
    // The offence of the attacker is 3, the defence of the foe 2: one point of
    // damage becomes four.
    const st = tyrBattle({
        card: 'Секущие когти', units: { 'карнифексы': 1 }, dice: ['att', 'att', 'att'],
        foeUnits: { 'гвардейцы': 2 }, foeDice: ['def', 'def'],
    });
    refuseReinforce(st);
    play(st, 0, 0, (s, q) => (q.kind === 'units' ? { units: (q.options || []).slice(0, 1) } : firstOption(s, q)));
    const base = Math.max(0, FS_RULES.combatValues(st, 'attacker').att - FS_RULES.combatValues(st, 'defender').def);
    ok(base > 0, 'без карты урон был бы нулевым');
    return eq(FS_RULES.combatDamageFor(st, 'defender'), base + 3, 'урон противника: ' + base + ' + 3');
});

check('Секущие когти', 'удар, который щиты отбили, дополнительного урона не даёт', () => {
    const st = tyrBattle({
        card: 'Секущие когти', units: { 'карнифексы': 1 }, dice: ['att'],
        foeUnits: { 'гвардейцы': 2 }, foeDice: ['def', 'def', 'def', 'def', 'def', 'def'],
    });
    refuseReinforce(st);
    play(st, 0, 0, (s, q) => (q.kind === 'units' ? { units: (q.options || []).slice(0, 1) } : firstOption(s, q)));
    const base = FS_RULES.combatValues(st, 'attacker').att - FS_RULES.combatValues(st, 'defender').def;
    ok(base <= 0, 'ожидание: атака не пробивает оборону, а не ' + base);
    return eq(FS_RULES.combatDamageFor(st, 'defender'), 0, 'урона нет вовсе');
});

// --- Рой потрошителей -------------------------------------------------------
// «Получите 2 `att. token`.»
// «*Гаунт/Пожиратель:* в конце шага нанесения повреждений получите по 1
//  материалу за каждый уничтоженный отряд, максимум 2.»
check('Рой потрошителей', 'два жетона атаки', () => {
    const st = tyrBattle({ card: 'Рой потрошителей' });
    refuseReinforce(st);
    play(st, 0, 0);
    return eq(tokens(st, 'attacker').att, 2, 'жетонов атаки');
});

// --- Подавляющее присутствие ------------------------------------------------
// «Уничтожьте 1 Ваш недеморализованный отряд, чтобы получить 3 `att. token`
//  либо 3 `def. token`.»
// «*Биомитан/Корабль Улья:* Ваш противник выполняет 3 раза: либо деморализует
//  отряд, либо теряет 1 `any cube` на свой выбор.»
check('Подавляющее присутствие', 'отряд уничтожен, три жетона выбранного типа', () => {
    const st = tyrBattle({ card: 'Подавляющее присутствие', units: { 'гаунты': 2 } });
    refuseReinforce(st);
    play(st, 0, 0, (s, q) => {
        if (q.kind === 'units') return { units: (q.options || []).slice(0, 1) };
        if (q.kind === 'choice') return { choice: 1 };
        return firstOption(s, q);
    });
    eq(tyrUnits(st, 0)['Гаунты'] || 0, 1, 'один Гаунт уничтожен');
    return eq([tokens(st, 'attacker').att, tokens(st, 'attacker').def], [0, 3], 'три жетона обороны');
});

check('Подавляющее присутствие', 'противник трижды выбирает: отряд или кубик', () => {
    const st = tyrBattle({
        card: 'Подавляющее присутствие', units: { 'био-титаны': 1, 'гаунты': 1 },
        foeUnits: { 'гвардейцы': 3 }, foeDice: ['def'],
    });
    refuseReinforce(st);
    let asked = 0;
    play(st, 0, 0, (s, q) => {
        if (q.kind === 'units') return { units: (q.options || []).slice(0, 1) };
        if (q.kind === 'choice') { asked++; return { choice: 0 }; }
        return firstOption(s, q);
    });
    ok(asked >= 3, 'противник не выбирал три раза: вопросов ' + asked);
    return eq(foeUnits(st).filter(u => u.routed).length, 3, 'три отряда противника деморализованы');
});

// --- Крылатый ужас ----------------------------------------------------------
// «Уничтожьте 1 из Ваших недеморализованных отрядов, чтобы получить 3
//  `att. token`.»
// «*Воин/Пожиратель:* если противник позволяет, то получите 2 `def. token`.
//  Если нет, то получите 2 `att. token` в следующем раунде боя.»
check('Крылатый ужас', 'противник позволяет — два жетона обороны сразу', () => {
    const st = tyrBattle({ card: 'Крылатый ужас', units: { 'воины': 1, 'гаунты': 1 } });
    refuseReinforce(st);
    play(st, 0, 0, (s, q) => {
        if (q.kind === 'units') return { units: (q.options || []).slice(0, 1) };
        if (q.kind === 'yesno') return {};
        return firstOption(s, q);
    });
    eq(tokens(st, 'attacker').att, 3, 'три жетона атаки за отряд');
    return eq(tokens(st, 'attacker').def, 2, 'два жетона обороны с позволения противника');
});

check('Крылатый ужас', 'противник не позволяет — два жетона атаки в следующем раунде', () => {
    const st = tyrBattle({
        card: 'Крылатый ужас', units: { 'воины': 1, 'гаунты': 2 },
        foeUnits: { 'титаны': 2 }, dice: [], foeDice: [], roundEnd: true,
    });
    refuseReinforce(st);
    play(st, 0, 0, (s, q) => {
        if (q.kind === 'units') return { units: (q.options || []).slice(0, 1) };
        if (q.kind === 'yesno') return { no: true };
        return firstOption(s, q);
    });
    eq(tokens(st, 'attacker').def, 0, 'жетонов обороны нет');
    nextRound(st);
    return eq(tokens(st, 'attacker').att, 2, 'жетоны атаки пришли в следующем раунде');
});

// --- Крылатый ужас (другая редакция) ----------------------------------------
// «*Воин/Пожиратель:* Ваш противник деморализует один отряд; он может избежать
//  этого, если потратит 1 `morale cube`.»
check('Крылатый ужас (другая редакция)', 'противник деморализует отряд, если не заплатит', () => {
    const st = tyrBattle({ card: 'Крылатый ужас (другая редакция)', units: { 'воины': 1 }, foeUnits: { 'гвардейцы': 2 } });
    refuseReinforce(st);
    play(st, 0, 0, (s, q) => {
        if (q.kind === 'units') return { units: (q.options || []).slice(0, 1) };
        if (q.kind === 'yesno') return { dice: [] };
        return firstOption(s, q);
    });
    return eq(foeUnits(st).filter(u => u.routed).length, 1, 'один отряд противника деморализован');
});

// --- Выводок воинов ---------------------------------------------------------
// «Уничтожьте 1 вашего недеморализованного юнита, чтобы получить 2
//  `def. token` в этом и следующем раундах.»
// «*Воин/Корабль Улья:* перебросьте все ваши кубики одного конкретного
//  значения.»
check('Выводок воинов', 'жетоны обороны остаются и в следующем раунде', () => {
    const st = tyrBattle({ card: 'Выводок воинов', units: { 'воины': 1, 'гаунты': 1 }, roundEnd: true });
    refuseReinforce(st);
    play(st, 0, 0, (s, q) => (q.kind === 'units' ? { units: (q.options || []).slice(0, 1) } : firstOption(s, q)));
    eq(tokens(st, 'attacker').def, 2, 'два жетона обороны в этом раунде');
    nextRound(st);
    return eq(tokens(st, 'attacker').def, 2, 'жетоны обороны остались на следующий раунд');
});

check('Выводок воинов', 'способность отряда перебрасывает кубики одного значения', () => {
    const st = tyrBattle({ card: 'Выводок воинов', units: { 'воины': 1 }, dice: ['att', 'att', 'def'] });
    const roll = FS_RULES.rollDice;
    FS_RULES.rollDice = () => ['morale'];
    refuseReinforce(st);
    let asked = null;
    play(st, 0, 0, (s, q) => {
        if (q.kind === 'units') return { units: (q.options || []).slice(0, 1) };
        if (q.kind === 'face') { asked = q; return { face: 'att' }; }
        return firstOption(s, q);
    });
    FS_RULES.rollDice = roll;
    ok(!!asked, 'значения кубиков не спросили');
    return eq([count(st, 'attacker', 'att'), count(st, 'attacker', 'morale'), count(st, 'attacker', 'def')],
        [0, 2, 1], 'кубики атаки перебросились в мораль, оборона не тронута');
});

// --- Выводок воинов (другая редакция) ---------------------------------------
// «Потратьте либо 1 `att. cube`, либо 1 `morale cube`, чтобы получить 3
//  `def. token`.»
// «*Воин/Корабль Улья:* за каждого недеморализованного Воина или Корабля-Улья
//  потратьте 1 кубик, чтобы получить 1 `att. cube`, 1 `morale cube` либо
//  1 `def. cube`.»
check('Выводок воинов (другая редакция)', 'кубик атаки или морали даёт три жетона обороны', () => {
    const st = tyrBattle({ card: 'Выводок воинов (другая редакция)', units: { 'воины': 1 }, dice: ['att', 'morale'] });
    refuseReinforce(st);
    play(st, 0, 0, (s, q) => (q.kind === 'dice' ? { dice: (q.options || []).slice(0, 1) } : firstOption(s, q)));
    eq(dice(st, 'attacker').length, 1, 'один кубик потрачен');
    return eq(tokens(st, 'attacker').def, 3, 'три жетона обороны');
});

check('Выводок воинов (другая редакция)', 'по кубику за каждого Воина: трата и начисление', () => {
    const st = tyrBattle({
        card: 'Выводок воинов (другая редакция)', units: { 'воины': 2 },
        dice: ['morale', 'morale', 'morale', 'morale'],
    });
    refuseReinforce(st);
    // The first question is the payment of the general ability (one cube), the
    // second is the payment of the unit ability (one cube per Воин).
    let asked = 0;
    play(st, 0, 0, (s, q) => {
        if (q.kind === 'dice') { asked++; return { dice: (q.options || []).slice(0, asked === 1 ? 1 : 2) }; }
        if (q.kind === 'choice') return { choice: 0 };
        return firstOption(s, q);
    });
    eq(asked, 2, 'два вопроса о кубиках: общая способность и способность отряда');
    eq(tokens(st, 'attacker').def, 3, 'три жетона обороны за кубик общей способности');
    // Four cubes of morale in: one pays the general ability, two pay for the two
    // Воина, and two cubes of the chosen value come back.
    return eq([count(st, 'attacker', 'morale'), count(st, 'attacker', 'att')], [1, 2],
        'три кубика потрачены, два кубика атаки получены');
});

// --- Рой потрошителей (способность отряда) ----------------------------------
check('Рой потрошителей', 'материя за отряды, уничтоженные в шаге урона', () => {
    const st = tyrBattle({
        card: 'Рой потрошителей', units: { 'гаунты': 2 }, foeUnits: { 'гвардейцы': 2 },
        dice: ['att', 'att', 'att', 'att', 'att'], foeDice: [],
    });
    refuseReinforce(st);
    const before = st.players[0].materiel;
    play(st, 0, 0);
    // The attacker assigns the damage of the round: the units of the foe fall.
    const killed = [];
    for (let i = 0; i < 4 && st.combat && st.combat.step === 'damage-attacker'; i++) {
        const victim = foeUnits(st).filter(u => !u.routed && killed.indexOf(u.id) < 0)[0];
        if (!victim) break;
        killed.push(victim.id);
        const r = FS_RULES.apply(st, 0, { type: 'combat', action: 'damage', targets: killed.slice() });
        ok(r.ok, 'урон не назначен: ' + r.error);
    }
    answerAll(st, null, 0);
    return eq(st.players[0].materiel - before, Math.min(2, killed.length),
        'по 1 материи за уничтоженный отряд, максимум 2 (уничтожено ' + killed.length + ')');
});

check('Рой потрошителей', 'каждый повторный шаг считает только свои потери, максимум 2 материи за шаг', () => {
    for (const tyr of [0, 1]) for (const hits of [0, 1, 3]) {
        const tyrSide = tyr === 0 ? 'attacker' : 'defender', foeSide = tyr === 0 ? 'defender' : 'attacker';
        const factions = tyr === 0 ? [TYR, 'некроны'] : ['некроны', TYR];
        let st = battle({ faction: factions[0], foeFaction: factions[1],
            units: tyr === 0 ? { 'гаунты': 5, 'воины': 1 } : { 'воины': 3 },
            foeUnits: tyr === 1 ? { 'гаунты': 5, 'воины': 1 } : { 'воины': 3 },
            hand: [tyr === 0 ? 'Рой потрошителей' : 'Воин фланги'],
            foeHand: [tyr === 1 ? 'Рой потрошителей' : 'Воин фланги'],
            dice: tyr === 0 ? Array(8).fill('def') : [...Array(8).fill('def'), ...Array(12).fill('att')],
            foeDice: tyr === 1 ? Array(8).fill('def') : [...Array(8).fill('def'), ...Array(12).fill('att')], roundEnd: true });
        st.players[tyr].materiel = 0;
        FS_RULES.keepEventScheme(st, 1 - tyr, FS_DATA.events.find(c => c.faction === 'некроны' && c.name === 'Безжалостное наступление'));
        refuseReinforce(st);
        eq([st.pending?.seat, pending(st)?.options], [1 - tyr, ['Безжалостное наступление']], 'план повтора');
        ok(FS_RULES.apply(st, 1 - tyr, { type: 'effect', answer: { choice: 0 } }).ok, 'повтор принят');
        play(st, tyr, 0);
        answerAll(st, firstOption);
        eq(st.combat.step, 'damage-' + tyrSide, 'ход дошёл до урона Тиранидам');
        // Block the Tyranid attack and set the opposing attack to exactly N.
        const setHits = n => {
            CombatTurn.of(st.combat).setDice(tyrSide, Array(8).fill('def')).setDice(foeSide, Array(8).fill('def'));
            const attack = FS_RULES.combatValues(st, foeSide).att, defence = FS_RULES.combatValues(st, tyrSide).def;
            ok(defence + n >= attack, 'можно задать точный урон');
            CombatTurn.of(st.combat).setDice(foeSide, [...Array(8).fill('def'), ...Array(defence + n - attack).fill('att')]);
            eq([FS_RULES.combatDamageFor(st, tyrSide), FS_RULES.combatDamageFor(st, foeSide)], [n, 0], 'задан урон ровно одной стороне');
        };
        setHits(hits);
        const deal = () => FS_RULES.apply(st, tyr, { type: 'combat', action: 'damage',
            targets: FS_RULES.damageCandidates(st, tyrSide).map(x => x.id) });
        if (!hits) {
            FS_RULES.advanceCombatSteps(st);
            eq([st.players[tyr].materiel, st.combat.round, st.pending], [0, 2, null], 'ноль потерь в обоих шагах');
            continue;
        }
        ok(deal().ok, 'первый урон');
        eq([st.players[tyr].materiel, !!st.combat.damageRepeated, st.combat.step],
            [Math.min(2, hits), true, 'damage-' + tyrSide], 'материя за первый шаг выдана до повтора');
        st = JSON.parse(JSON.stringify(st));
        setHits(hits);
        ok(deal().ok, 'второй урон после JSON');
        const killedSecond = Math.min(hits, 5 - hits);
        eq(st.players[tyr].materiel, Math.min(2, hits) + Math.min(2, killedSecond),
            'второй шаг не повторяет старые потери и соблюдает свой предел');
        eq(st.pending, null, 'награда не оставила зависший вопрос');
    }
});

// --- Выводок термаганов -----------------------------------------------------
// «Либо получите 1 `att. token` за каждый недеморализованный отряд Гаунтов и
//  Пожирателей, либо разместите 1 бесплатный жетон подкрепления в эту область.
//  За каждого вашего уничтоженного или деморализованного в этом раунде юнита
//  получите 1 `def. token` в следующем раунде боя.»
check('Выводок термаганов', 'по жетону атаки за каждый отряд Гаунтов и Пожирателей', () => {
    const st = tyrBattle({ card: 'Выводок термаганов', units: { 'гаунты': 3 } });
    refuseReinforce(st);
    play(st, 0, 0, branch(0));
    return eq(tokens(st, 'attacker').att, 3, 'три жетона атаки за три Гаунта');
});

check('Выводок термаганов', 'вторая ветка — жетон подкрепления в область боя', () => {
    const st = tyrBattle({ card: 'Выводок термаганов', units: { 'гаунты': 3 } });
    refuseReinforce(st);
    play(st, 0, 0, (s, q) => (q.kind === 'choice' ? { choice: 1 } : firstOption(s, q)));
    const c = st.combat;
    return eq(st.combat.reinforce.attacker, 1, 'жетон подкреплений в области боя');
});

check('Выводок термаганов', 'жетоны обороны следующего раунда за потерянных юнитов', () => {
    const st = tyrBattle({
        card: 'Выводок термаганов', units: { 'гаунты': 2 }, foeUnits: { 'гвардейцы': 2, 'огрины': 2 },
        dice: ['att', 'att', 'att', 'att', 'att', 'att'], foeDice: [], roundEnd: true,
    });
    refuseReinforce(st);
    play(st, 0, 0, branch(0));
    // The attacker deals the damage of the round: one Гаунт of his own is not
    // touched, the units of the foe fall — the card counts only his own losses,
    // so one Гаунт is demoralised by the check itself.
    const victim = myUnits(st)[0];
    victim.routed = true;
    for (let i = 0; i < 3 && st.combat && st.combat.step === 'damage-attacker'; i++) {
        const target = foeUnits(st).filter(u => !u.routed)[0];
        if (!target) break;
        const r = FS_RULES.apply(st, 0, { type: 'combat', action: 'damage', targets: [target.id] });
        ok(r.ok, 'урон не назначен: ' + r.error);
    }
    answerAll(st, null, 0);
    nextRound(st);
    return eq(tokens(st, 'attacker').def, 1, 'один жетон обороны за одного потерянного юнита');
});

// --- Выводок термаганов (другая редакция) -----------------------------------
// «Уничтожьте 1 недеморализованного Гаунта или Пожирателя, чтобы получить 4
//  `def. token`.» / «*Гаунт/Пожиратель:* получите 1 `att. token` за каждого
//  недеморализованного Гаунта или Пожирателя.»
check('Выводок термаганов (другая редакция)', 'четыре жетона обороны за Гаунта', () => {
    const st = tyrBattle({ card: 'Выводок термаганов (другая редакция)', units: { 'гаунты': 2 } });
    refuseReinforce(st);
    play(st, 0, 0, (s, q) => (q.kind === 'units' ? { units: (q.options || []).slice(0, 1) } : firstOption(s, q)));
    eq(tyrUnits(st, 0)['Гаунты'] || 0, 1, 'Гаунт уничтожен');
    return eq(tokens(st, 'attacker').def, 4, 'четыре жетона обороны');
});

check('Выводок термаганов (другая редакция)', 'по жетону атаки за каждого Гаунта', () => {
    const st = tyrBattle({ card: 'Выводок термаганов (другая редакция)', units: { 'гаунты': 3 } });
    refuseReinforce(st);
    play(st, 0, 0, (s, q) => (q.kind === 'units' ? { units: (q.options || []).slice(0, 1) } : firstOption(s, q)));
    return eq(tokens(st, 'attacker').att, 2, 'два жетона атаки за двух оставшихся Гаунтов');
});

// --- Синаптический контроль -------------------------------------------------
// «Получите 1 `any cube`. Разместите 1 бесплатный жетон подкрепления в этой
//  области.»
// «*Воин/Корабль Улья:* восстановите 1 свой деморализованный отряд. Если у вас
//  больше недеморализованных отрядов, отнимите от их числа число
//  недеморализованных отрядов противника и получите 1 `att. token` или
//  1 `def. token` за каждую оставшуюся единицу.»
check('Синаптический контроль', 'кубик любого значения и жетон подкрепления', () => {
    const st = tyrBattle({ card: 'Синаптический контроль', units: { 'воины': 1 }, dice: [] });
    refuseReinforce(st);
    play(st, 0, 0);
    eq(dice(st, 'attacker').length, 1, 'кубик получен');
    return eq(st.combat.reinforce.attacker, 1, 'жетон подкреплений в области боя');
});

check('Синаптический контроль', 'отряд восстановлен, жетоны за превосходство в отрядах', () => {
    const st = tyrBattle({
        card: 'Синаптический контроль', units: { 'воины': 1, 'гаунты': 2 },
        foeUnits: { 'гвардейцы': 1 }, routed: [1],
    });
    refuseReinforce(st);
    play(st, 0, 0, (s, q) => {
        if (q.kind === 'units') return { units: (q.options || []).slice(0, 1) };
        if (q.kind === 'choice') return { choice: 0 };
        return firstOption(s, q);
    });
    eq(myUnits(st).filter(u => u.routed).length, 0, 'отряд восстановлен');
    // Three standing models plus the card's free reinforcement against one:
    // the token is a fourth unit and the surplus of three pays three tokens.
    eq(CombatTokens.of(st.combat).units('attacker').alive, 1, 'бесплатное подкрепление на поле');
    return eq(tokens(st, 'attacker').att, 3, 'три жетона атаки за превосходство в три отряда');
});

// ============================================================================
//  05-order-upgrades.md — Тираниды: 5 карт
// ============================================================================
head('Улучшения приказов', TYR);

/** A strike of the Tyranids: two devourer ships shoot at the enemy world. */
const tyrStrike = o => strikeState(Object.assign({
    faction: TYR, foeFaction: 'имперская-гвардия',
    ships: { 'пожиратели': 2 }, holdUnit: 'гаунты',
}, o));

/** The strike is fired with the dice the check needs. */
function fire(st, dice) {
    const roll = FS_RULES.rollDice;
    FS_RULES.rollDice = (s, n) => (n === 1 ? [dice[0]] : dice);
    const targets = FS_RULES.orbitalStrikeTargets(st, 0);
    const t = targets.find(x => x.pos === st.strikeWorld) || targets[0];
    const res = FS_RULES.apply(st, 0, { type: 'orbitalStrike', system: t.system, pos: t.pos });
    FS_RULES.rollDice = roll;
    ok(res.ok, 'удар не нанесён: ' + res.error);
    return t;
}

/** Fix the dice for a whole check — including the cube a card gains before the strike. */
function withFixedDice(faces, body) {
    const roll = FS_RULES.rollDice;
    FS_RULES.rollDice = (s, n) => (n === 1 ? [faces[0]] : faces.slice());
    try { return body(); } finally { FS_RULES.rollDice = roll; }
}

// --- Бесчисленные -----------------------------------------------------------
// «Разыграв этот приказ в системе, в которой у вас есть недеморализованный
//  корабль, вы можете разместить 1 бесплатный жетон подкрепления в спорной
//  области в начале шага призыва подкреплений.»
check('Бесчисленные', 'жетон подкрепления ждёт боя своего приказа', () => {
    const st = orderState('advance', {
        faction: TYR, ships: { 'пожиратели': 1 }, units: { 'гаунты': 2 },
        foeUnits: { 'гвардейцы': 2 }, upgrades: ['Бесчисленные'],
    });
    const res = burn(st, 'Бесчисленные');
    ok(res.ok, 'карта не сгорела: ' + res.error);
    // The order is resolved before its combat exists: the token waits.
    eq(st.order.combatReinforce, { n: 1, free: true }, 'приказ помнит жетон');
    const sys = st.systems[0];
    FS_RULES.startCombat(st, 0, 1, sys.id, worldOf(st, sys.id));
    eq(st.combat.reinforce.attacker, 1, 'жетон стоит в спорной области');
    // A free token comes from the supply, not from the assets of the player.
    return eq(st.players[0].assets.reinforcement, 1, 'жетон не взят из запаса игрока');
});

// --- Мицетические споры -----------------------------------------------------
// «Бастионы противника не могут предотвратить этот орбитальный удар. Во время
//  выполнения этого орбитального удара вы можете потратить до 2 `att. cube` за
//  каждый корабль. За каждый потраченный вами `att. cube` купите один отряд с
//  командным уровнем 2 или меньше и разместите его в этом мире.»
check('Мицетические споры', 'бастионы не спасают мир от удара', () => {
    const st = tyrStrike({ upgrades: ['Мицетические споры', 'Камери размножения'], foeStructures: ['bastion'] });
    const res = burn(st, 'Мицетические споры');
    ok(res.ok, 'карта не сгорела: ' + res.error);
    return eq(!!st.order.ignoreBastion, true, 'приказ игнорирует бастионы');
});

check('Мицетические споры', 'три кубика удара покупают три отряда в мир удара', () => {
    const st = tyrStrike({ upgrades: ['Мицетические споры', 'Камери размножения'], materiel: 12 });
    burn(st, 'Мицетические споры');
    const t = fire(st, ['att', 'att', 'att', 'def']);
    // Two ships: the ceiling is 2 × 2 = 4 cubes, the roll gives 3.
    const q = pending(st);
    ok(!!q, 'вопроса о трате кубиков нет');
    eq([q.kind, q.op], ['choice', 'strikePayPick'], 'приказ спрашивает, сколько кубиков потратить');
    eq(q.options.length, 4, 'потолок — 3 кубика удара (0…3)');
    answerAll(st, (s, qq) => {
        if (qq.kind === 'choice') return { choice: 3 };
        if (qq.kind === 'types') return { type: qq.options[0] };
        if (qq.kind === 'areas') return { area: qq.options[0] };
        return firstOption(s, qq);
    });
    const bought = st.units.filter(u => u.seat === 0 && u.system === t.system && u.area === t.pos);
    eq(bought.length, 3, 'три отряда куплены и поставлены в мир удара');
    ok(bought.every(u => (FS_RULES.unitOf(st, u) || {}).kl <= 2), 'все купленные отряды КЛ 2 или меньше');
    return ok(st.players[0].materiel < 12, 'материя за отряды потрачена');
});

check('Мицетические споры', 'отказ от траты не покупает ничего', () => {
    const st = tyrStrike({ upgrades: ['Мицетические споры', 'Камери размножения'], materiel: 12 });
    burn(st, 'Мицетические споры');
    const t = fire(st, ['att', 'att', 'att', 'def']);
    answerAll(st, (s, qq) => (qq.kind === 'choice' ? { choice: 0 } : firstOption(s, qq)));
    const bought = st.units.filter(u => u.seat === 0 && u.system === t.system && u.area === t.pos);
    eq(bought.length, 0, 'ничего не куплено');
    // The strike destroyed the enemy factory and paid for it: the materiel of
    // the player did not go down.
    return ok(st.players[0].materiel >= 12, 'материя на отряды не тратилась');
});

// «Требуются «Камери размножения»»: the quoted name is another order upgrade
// of the same faction. Without it the whole card is forbidden, not just its
// last sentence, so none of the abilities of the strike is announced.
check('Мицетические споры', 'без карты «Камери размножения» способность не применяется', () => {
    const st = tyrStrike({ upgrades: ['Мицетические споры'] });
    const res = burn(st, 'Мицетические споры');
    eq(res.ok, true, 'карта разыграна');
    eq((st.order.strikePays || []).length, 0, 'оплата кубиков не заявлена');
    eq(!!st.order.ignoreBastion, false, 'бастионы по-прежнему защищают мир');
    const order = st.order;
    const t = fire(st, ['att', 'att', 'def']);
    ok(!!t, 'удар нанесён');
    return eq(!!order.strikePlanned, false, 'вопроса о трате кубиков нет');
});

check('Мицетические споры', 'купленная карта «Камери размножения» открывает способность', () => {
    const st = tyrStrike({ upgrades: ['Мицетические споры', 'Камери размножения'] });
    const res = burn(st, 'Мицетические споры');
    ok(res.ok, 'карта не сгорела: ' + res.error);
    const pays = st.order.strikePays || [];
    eq(pays.length, 1, 'одна оплата кубиков');
    eq(!!st.order.ignoreBastion, true, 'бастионы не защищают мир');
    return eq(pays[0].reward && pays[0].reward.units && pays[0].reward.units.maxKl, 2,
        'награда карты — отряды КЛ 2 или меньше');
});

// --- Разведка генокрадов ----------------------------------------------------
// «Во время этого орбитального удара получите 1 `any cube`. Вы можете потратить
//  до 2 `att. cube`, чтобы получить 1 жетон подкрепления за каждый потраченный
//  `att. cube`.»
check('Разведка генокрадов', 'два кубика удара дают два жетона подкрепления', () => {
    const st = tyrStrike({ upgrades: ['Разведка генокрадов'] });
    const res = burn(st, 'Разведка генокрадов');
    ok(res.ok, 'карта не сгорела: ' + res.error);
    // The cube the card gave is a cube of the strike: it may be spent.
    eq(st.order.strikeDice.length, 1, 'кубик карты прибавлен к кубику удара');
    fire(st, ['att', 'att', 'def']);
    const q = pending(st);
    ok(!!q, 'вопроса о трате кубиков нет');
    eq(q.options.length, 3, 'потолок — 2 кубика (0…2), а не по числу кораблей');
    const before = st.players[0].assets.reinforcement;
    answerAll(st, (s, qq) => (qq.kind === 'choice' ? { choice: 2 } : firstOption(s, qq)));
    return eq(st.players[0].assets.reinforcement, before + 2, 'два жетона подкрепления за два кубика');
});

// «A player can use multiple order upgrades during the same orbital strike»
// (01-rules-reference.md, Orbital Strike): both Tyranid strike cards may be
// burned on one strike. Each keeps its own payment and reward, and one cube
// cannot be spent twice.
check('Улучшения приказов', 'две карты удара: два вопроса по очереди и обе награды', () => {
    // Five attack cubes rolled plus the any cube of «Разведки генокрадов».
    const faces = ['att', 'att', 'att', 'att', 'att', 'def'];
    return withFixedDice(faces, () => {
        const st = tyrStrike({
            upgrades: ['Мицетические споры', 'Камери размножения', 'Разведка генокрадов'],
            materiel: 20,
        });
        burn(st, 'Мицетические споры');
        burn(st, 'Разведка генокрадов');
        eq((st.order.strikePays || []).length, 2, 'обе карты заявили свою оплату');
        const t = fire(st, faces);
        const planned = st.order.strikePlanned;
        ok(!!planned, 'удар ждёт оплаты');
        const before = st.players[0].assets.reinforcement;
        const asked = [];
        answerAll(st, (s, q) => {
            if (q.op === 'strikePayPick') {
                asked.push([q.index, q.options.length - 1]);
                return { choice: 2 };
            }
            if (q.kind === 'types') return { type: q.options[0] };
            if (q.kind === 'areas') return { area: q.options[0] };
            return firstOption(s, q);
        });
        eq(asked.length, 2, 'спрошено ровно два платежа');
        eq(asked[0], [0, 4], 'первый платёж: 2 за каждый из двух кораблей');
        eq(asked[1], [1, 2], 'второй платёж: 2 из оставшихся кубиков');
        eq(planned.paid, [2, 2], 'обе траты записаны по порядку');
        eq(st.players[0].assets.reinforcement, before + 2, 'жетон подкрепления за второй платёж');
        const bought = st.units.filter(u => u.seat === 0 && u.system === t.system && u.area === t.pos);
        return eq(bought.length, 2, 'отряды за первый платёж стоят в мире удара');
    });
});

check('Улучшения приказов', 'две настоящие карты удара продолжаются после JSON без повторной траты', () => {
    // Two Hive Ships really roll six dice; the seventh die comes from the
    // upgrade. Unlike the older synthetic fixtures, the roll respects n.
    const roll = FS_RULES.rollDice;
    FS_RULES.rollDice = (state, n) => Array(n).fill('att');
    try {
        let st = tyrStrike({
            ships: { 'корабли-ульи': 2 },
            upgrades: ['Мицетические споры', 'Камери размножения', 'Разведка генокрадов'],
            materiel: 14, assets: { reinforcement: 0 },
        });
        st.systems[1].tokens.push({ seat: 1, order: 'deploy', faceUp: false });
        ok(burn(st, 'Мицетические споры').ok, 'споры применены');
        ok(burn(st, 'Разведка генокрадов').ok, 'разведка применена');
        const target = FS_RULES.orbitalStrikeTargets(st, 0).find(t => t.pos === st.strikeWorld);
        ok(!!target, 'есть цель');
        ok(FS_RULES.apply(st, 0, { type: 'orbitalStrike', system: target.system, pos: target.pos }).ok, 'удар нанесён');
        eq([pending(st).op, pending(st).index, st.order.strikePlanned.pool.length], ['strikePayPick', 0, 7],
            'шесть кубиков кораблей и один карты в общем пуле');
        st = JSON.parse(JSON.stringify(st));
        ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { choice: 2 } }).ok, 'за споры потрачено два кубика');
        eq([pending(st).kind, st.order.strikePlanned.pool.length, st.order.strikePlanned.hits], ['types', 5, 5],
            'осталось пять кубиков и пять попаданий');
        st = JSON.parse(JSON.stringify(st));
        ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { type: 'гаунты' } }).ok, 'тип купленных отрядов выбран');
        eq(pending(st).kind, 'areas', 'мир ещё не подтверждён');
        st = JSON.parse(JSON.stringify(st));
        ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { area: { system: target.system, pos: target.pos } } }).ok,
            'два отряда размещены после восстановления');
        eq([pending(st).op, pending(st).index, st.order.strikePlanned.pool.length], ['strikePayPick', 1, 5],
            'вторая карта видит только оставшиеся кубики');
        st = JSON.parse(JSON.stringify(st));
        ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { choice: 2 } }).ok, 'вторая карта потратила два оставшихся кубика');
        eq(st.pending, null, 'все вопросы закрыты');
        eq(st.players[0].assets.reinforcement, 2, 'получены два жетона подкрепления');
        eq(st.players[0].materiel, 10, 'оплачены две модели по два материала');
        eq(st.units.filter(u => u.seat === 0 && u.system === target.system && u.area === target.pos).length, 2,
            'две купленные модели в мире удара');
    } finally {
        FS_RULES.rollDice = roll;
    }
});

check('Улучшения приказов', 'порядок карт сохраняет их награды', () => {
    const faces = ['att', 'att', 'att', 'att', 'att', 'def'];
    return withFixedDice(faces, () => {
        const st = tyrStrike({
            upgrades: ['Мицетические споры', 'Камери размножения', 'Разведка генокрадов'],
            materiel: 20,
        });
        // The other order: the tokens card was burned first this time.
        burn(st, 'Разведка генокрадов');
        burn(st, 'Мицетические споры');
        const t = fire(st, faces);
        const before = st.players[0].assets.reinforcement;
        const asked = [];
        answerAll(st, (s, q) => {
            if (q.op === 'strikePayPick') {
                asked.push([q.index, q.options.length - 1]);
                return { choice: 2 };
            }
            if (q.kind === 'types') return { type: q.options[0] };
            if (q.kind === 'areas') return { area: q.options[0] };
            return firstOption(s, q);
        });
        eq(asked, [[0, 2], [1, 4]], 'сначала плоский предел 2, затем 2 за корабль');
        eq(st.players[0].assets.reinforcement, before + 2, 'первая карта дала жетоны');
        const bought = st.units.filter(u => u.seat === 0 && u.system === t.system && u.area === t.pos);
        return eq(bought.length, 2, 'вторая карта дала отряды');
    });
});

check('Улучшения приказов', 'потраченный кубик нельзя потратить второй картой', () => {
    // One attack cube rolled + the any cube of the card = two cubes in total.
    const faces = ['att', 'def', 'def'];
    return withFixedDice(faces, () => {
        const st = tyrStrike({
            upgrades: ['Мицетические споры', 'Камери размножения', 'Разведка генокрадов'],
            materiel: 20,
        });
        burn(st, 'Мицетические споры');
        burn(st, 'Разведка генокрадов');
        fire(st, faces);
        const before = st.players[0].assets.reinforcement;
        const asked = [];
        answerAll(st, (s, q) => {
            if (q.op === 'strikePayPick') {
                asked.push([q.index, q.options.length - 1]);
                return { choice: 2 };
            }
            if (q.kind === 'types') return { type: q.options[0] };
            if (q.kind === 'areas') return { area: q.options[0] };
            return firstOption(s, q);
        });
        eq(asked, [[0, 2]], 'второй карте нечего тратить и вопрос не задаётся');
        return eq(st.players[0].assets.reinforcement, before, 'жетонов за неоплаченный платёж нет');
    });
});

// --- Камери размножения -------------------------------------------------
// «После того, как вы выполните этот приказ, можете приобрести до 2 отрядов за
//  каждый недеморализованный Корабль Улей в активной системе и разместить их на
//  любых дружественных или никем не контролируемых мирах в активной системе.»
/** The order is resolved, the card is burnt: the question of the purchase. */
function cultivate(ships) {
    const st = orderState('deploy', {
        faction: TYR, ships: ships ? { 'корабли-ульи': ships } : {},
        units: { 'гаунты': 1 }, materiel: 20, structures: ['factory'],
        upgrades: ['Камери размножения'],
    });
    const sys = st.systems[0];
    const pos = worldOf(st, sys.id);
    const bought = FS_RULES.apply(st, 0, { type: 'buyUnit', unit: 'гаунты', system: sys.id, pos });
    ok(bought.ok, 'отряд приказа не куплен: ' + bought.error);
    const res = burn(st, 'Камери размножения');
    ok(res.ok, 'карта не сгорела: ' + res.error);
    return st;
}

check('Камери размножения', 'два Корабля Улья дают право на четыре отряда', () => {
    const st = cultivate(2);
    const q = pending(st);
    ok(!!q, 'вопроса о покупке нет');
    eq([q.kind, q.op, q.n], ['types', 'placeUnit', 4], 'по два отряда на каждый из двух Кораблей Ульев');
    const sys = st.systems[0];
    const was = st.units.filter(u => u.seat === 0).length;
    answerAll(st, (s, qq) => {
        if (qq.kind === 'types') return { type: qq.options[0] };
        if (qq.kind === 'areas') return { area: qq.options[0] };
        return firstOption(s, qq);
    });
    const now = st.units.filter(u => u.seat === 0);
    // The box of the faction holds a few models of a kind: the purchase stops
    // where the supply stops, and every model stands in the active system.
    ok(now.length - was >= 1, 'отряды куплены сверх приказа');
    ok(now.every(u => u.system === sys.id), 'отряды стоят в активной системе');
    return ok(st.players[0].materiel < 20, 'материя за отряды потрачена');
});

check('Камери размножения', 'один Корабль Улей даёт право на два отряда', () => {
    const st = cultivate(1);
    const q = pending(st);
    ok(!!q, 'вопроса о покупке нет');
    return eq(q.n, 2, 'два отряда за один Корабль Улей');
});

check('Камери размножения', 'без Корабля Улья покупать нечего', () => {
    const st = cultivate(0);
    return eq(!!st.pending, false, 'вопроса о покупке нет');
});

// «разместить их на … мирах» — a ship has nowhere to stand on a world: the
// Devourers are not offered, and the ground units bought are offered worlds only.
check('Камери размножения', 'корабли на мир не продаются: в списке только наземные отряды, в ответ — только миры', () => {
    const st = cultivate(1);
    const q = pending(st);
    ok(!!q && q.kind === 'types', 'нет вопроса о типе отряда');
    const ships = q.options.filter(id => (FS_RULES.unitDef(st, 0, id) || {}).type === 'ship');
    eq(ships, [], 'корабль предложен для размещения на мире');
    ok(q.options.includes('гаунты'), 'наземный отряд не предложен');
    const res = FS_RULES.apply(st, 0, { type: 'effect', answer: { type: 'гаунты' } });
    ok(res.ok, 'тип отряда не принят: ' + res.error);
    const q2 = pending(st);
    ok(!!q2 && q2.kind === 'areas', 'нет вопроса об области');
    return ok(q2.options.every(a => !!FS_RULES.area(FS_RULES.system(st, a.system), a.pos).world), 'среди областей есть пустота');
});

// ============================================================================
//  06-events.md — Тираниды: 8 карт событий
// ============================================================================
head('Карты событий', TYR);

/** The event card of the Tyranids, played through the real command path. */
const tyrEvent = (name, o) => {
    const st = eventState(name, Object.assign({ faction: TYR, foeFaction: 'имперская-гвардия' }, o));
    const res = playEvent(st);
    ok(res.ok, 'карта не сыграна: ' + res.error);
    return st;
};

// --- Флот-осколок -----------------------------------------------------------
// «Разместите 1 Пожирателя в любую дружественную пустоту.»
check('Флот-осколок', 'Пожиратель встаёт в дружественную пустоту', () => {
    // The void is friendly because a ship of the player already holds it.
    const st = tyrEvent('Флот-осколок', { units: { 'гаунты': 1 }, ships: { 'пожиратели': 1 } });
    effectAnswer(st, (s, q) => firstOption(s, q), 8);
    const ships = st.units.filter(u => u.seat === 0 && (FS_RULES.unitOf(st, u) || {}).type === 'ship');
    eq(ships.length, 2, 'второй Пожиратель размещён');
    const last = ships[ships.length - 1];
    const sys = FS_RULES.system(st, last.system);
    const area = FS_RULES.area(sys, last.area);
    ok(!area.world, 'отряд стоит в пустоте');
    return eq(FS_RULES.control(st, 0, last.system, last.area), 'friendly', 'пустота дружественная');
});

// --- Быстрая мутация --------------------------------------------------------
// «Получите 2 жетона кузницы.»
check('Быстрая мутация', 'два жетона кузницы', () => {
    const st = tyrEvent('Быстрая мутация', { assets: { forge: 1, cache: 0, reinforcement: 1 } });
    effectAnswer(st, {}, 4);
    return eq(st.players[0].assets.forge, 3, 'жетонов кузницы стало три');
});

// --- Разведывательные организмы ---------------------------------------------
// «Приобретите 1 боевое улучшение, уменьшив его стоимость на 1 за каждый
//  Корабль-Улей.»
check('Разведывательные организмы', 'цена улучшения падает на 1 за каждый Корабль-Улей', () => {
    const st = tyrEvent('Разведывательные организмы', {
        ships: { 'корабли-ульи': 2 }, materiel: 6,
    });
    const q = pending(st);
    ok(!!q, 'вопроса о покупке нет');
    eq(q.op, 'buyUpgrade', 'карта предлагает купить улучшение');
    const discount = FS_EFFECTS.upgradeDiscount(FS_RULES, st, 0,
        (st.pending.steps || []).find(s => s.op === 'buyUpgrade'));
    return eq(discount, 2, 'скидка равна числу Кораблей-Ульев');
});

// --- Пожиратель миров -------------------------------------------------------
// «Выберите систему. Получите материалы со всех дружественных миров этой
//  системы.»
check('Пожиратель миров', 'материя приходит с дружественных миров выбранной системы', () => {
    const st = tyrEvent('Пожиратель миров', { units: { 'гаунты': 1 }, materiel: 0 });
    const q = pending(st);
    ok(!!q && q.kind === 'systems', 'карта не спрашивает систему');
    // The world the units stand on is friendly: its materiel is the income.
    const sys = FS_RULES.system(st, st.sys);
    const area = FS_RULES.area(sys, st.pos);
    const want = area.world.materiel || 0;
    effectAnswer(st, (s, qq) => (qq.kind === 'systems' ? { system: st.sys } : firstOption(s, qq)), 8);
    ok(want > 0, 'в мире напечатана материя');
    return eq(st.players[0].materiel, want, 'материя равна доходу дружественного мира');
});

// --- Гнездо выводка ---------------------------------------------------------
// «…разместить бесплатно по 1 Гаунту в двух разных дружественных мирах.»
check('Гнездо выводка', 'по Гаунту в двух разных дружественных мирах', () => {
    const st = orderState('advance', {
        faction: TYR, units: { 'гаунты': 1 }, materiel: 6,
    });
    // Two friendly worlds: the card places a model in each of them.
    const sys0 = st.systems[0];
    const other = sys0.areas.filter(a => a.world).find(a => a.pos !== worldOf(st, sys0.id));
    FS_RULES.addUnit(st, 0, 'гаунты', sys0.id, other.pos);
    const scheme = schemeInPlay(st, 'Гнездо выводка', TYR);
    eq(scheme.steps.length, 2, 'план размещает два отряда');
    const was = st.units.filter(u => u.seat === 0).length;
    FS_RULES.runEffects(st, 0, scheme.steps, { kind: 'event', ctx: null });
    answerAll(st, (s, q) => {
        if (q.kind === 'types') return { type: q.options[0] };
        if (q.kind === 'areas') return { area: q.options[0] };
        return firstOption(s, q);
    });
    const placed = st.units.filter(u => u.seat === 0).slice(was);
    eq(placed.length, 2, 'два Гаунта размещены');
    const worlds = new Set(placed.map(u => u.system + '|' + u.area));
    return eq(worlds.size, 2, 'миры разные');
});

// --- Восстание верных -------------------------------------------------------
// «…разместить 1 бесплатный бастион в дружественном мире, не содержащем другие
//  постройки.»
check('Восстание верных', 'бесплатный бастион в мире без построек', () => {
    const st = orderState('advance', {
        faction: TYR, units: { 'гаунты': 1 }, materiel: 3,
    });
    const scheme = schemeInPlay(st, 'Восстание верных', TYR);
    FS_RULES.runEffects(st, 0, scheme.steps, { kind: 'event', ctx: null });
    answerAll(st, (s, q) => (q.kind === 'areas' ? { area: q.options[0] } : firstOption(s, q)));
    const built = st.structures.filter(s => s.seat === 0 && s.type === 'bastion');
    eq(built.length, 1, 'бастион построен');
    eq(st.players[0].materiel, 3, 'материя не потрачена');
    return eq(FS_RULES.control(st, 0, built[0].system, built[0].area), 'friendly', 'мир дружественный');
});

check('Восстание верных', 'план «вместо раскрытия приказа»: предложен при раскрытии, бастион поставлен, жетон приказа не тронут, ход переходит', () => {
    let st = tyrEvent('Восстание верных', { units: { 'гаунты': 1 } });
    const plan = st.players[0].schemes[0];
    eq([plan.trigger, plan.insteadOfOrder], ['operations', true], 'план ждёт фазы действий вместо приказа');
    for (const sys of st.systems) sys.tokens = [];
    const sys0 = st.systems[0];
    sys0.tokens.push({ seat: 0, order: 'advance', faceUp: false });
    st.systems[2].tokens.push({ seat: 1, order: 'deploy', faceUp: false });
    st.phase = 'operations'; st.turn = 0; st.order = null; st.event = null; FS_RULES.trimQueue(st).clear();
    st.players[0].placedTokens = 1; st.players[1].placedTokens = 1;
    ok(FS_RULES.apply(st, 0, { type: 'resolveOrder', system: sys0.id }).ok, 'приказ предложен');
    eq(pending(st).kind, 'scheme', 'план предложен вместо раскрытия');
    st = JSON.parse(JSON.stringify(st));
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { choice: 0 } }).ok, 'план принят после JSON');
    answerAll(st, (s, q) => (q.kind === 'areas' ? { area: q.options[0] } : firstOption(s, q)));
    eq(st.structures.filter(x => x.seat === 0 && x.type === 'bastion').length, 1, 'бастион поставлен');
    eq([sys0.tokens.length, st.systems[0].tokens[0].faceUp], [1, false], 'жетон приказа не раскрыт и не сброшен');
    eq([st.order, st.players[0].schemes.length], [null, 0], 'приказ не начат, план сброшен');
    return eq([st.phase, st.turn], ['operations', 1], 'ход перешёл сопернику');
});

check('Восстание верных', 'в начале фазы действий план не предлагается; после отказа приказ раскрывается как обычно', () => {
    const st = tyrEvent('Восстание верных', { units: { 'гаунты': 1 } });
    for (const sys of st.systems) sys.tokens = [];
    const sys0 = st.systems[0];
    sys0.tokens.push({ seat: 0, order: 'advance', faceUp: false });
    st.phase = 'operations'; st.turn = 0; st.order = null; st.event = null; FS_RULES.trimQueue(st).clear();
    st.players[0].placedTokens = 1;
    ok(!FS_RULES.maybeScheme(st, 0, 'operations', { kind: 'event', ctx: null }), 'в начале фазы план молчит');
    ok(FS_RULES.apply(st, 0, { type: 'resolveOrder', system: sys0.id }).ok, 'приказ предложен');
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { no: true } }).ok, 'отказ принят');
    eq(st.players[0].schemes.length, 1, 'план остался');
    ok(FS_RULES.apply(st, 0, { type: 'resolveOrder', system: sys0.id }).ok, 'приказ раскрыт повторной командой');
    return eq(st.order && st.order.order, 'advance', 'наступление началось');
});

// --- Тень в варпе -----------------------------------------------------------
// «…Ваш противник не сможет использовать жетоны подкрепления во время всего
//  боя.»
check('Тень в варпе', 'противник не может призвать подкрепление в этом бою', () => {
    const st = tyrBattle({ units: { 'гаунты': 2 }, foeUnits: { 'гвардейцы': 2 } });
    st.players[1].assets.reinforcement = 3;
    const scheme = schemeInPlay(st, 'Тень в варпе', TYR);
    FS_RULES.runEffects(st, 0, scheme.steps, { kind: 'combat', ctx: { side: 'attacker' } });
    eq(st.combat.noReinforceSeat, 1, 'запрет называет противника');
    const res = FS_RULES.apply(st, 1, { type: 'combat', action: 'reinforce', count: 2 });
    eq(res.ok, false, 'призыв подкрепления запрещён');
    // The owner of the card keeps his own reinforcement.
    st.players[0].assets.reinforcement = 2;
    const mine = FS_RULES.apply(st, 0, { type: 'combat', action: 'reinforce', count: 1 });
    return eq([mine.ok, st.combat.reinforce.attacker], [true, 1], 'владелец карты призывает подкрепление');
});

// --- Разум улья -------------------------------------------------------------
// «При выполнении любого приказа Вы можете сбросить эту карту, чтобы повысить
//  свой командный уровень на 1 за каждый Корабль-Улей.»
check('Разум улья', 'командный уровень растёт по числу Кораблей-Ульев', () => {
    const st = orderState('deploy', {
        faction: TYR, ships: { 'корабли-ульи': 2 }, units: { 'гаунты': 1 },
        structures: ['city', 'factory'], materiel: 10,
    });
    const before = FS_RULES.commandLevel(st, 0);
    const scheme = schemeInPlay(st, 'Разум улья', TYR);
    FS_RULES.runEffects(st, 0, scheme.steps, { kind: 'order', ctx: null });
    return eq([before, FS_RULES.commandLevel(st, 0)], [1, 3], 'один город и два Корабля Улья');
});

head('Улучшения приказов', TYR);

// --- Капиллярные башни ------------------------------------------------------
// «После выполнения этого приказа вы можете уничтожить любые ваши отряды или
//  постройки в одном мире активной системы, чтобы временно получить материалы,
//  равные их стоимости. Используйте эти материалы только для покупки любого
//  количества кораблей. Вы можете разместить их на дружественных и
//  неконтролируемых пустотах в активной системе. Неиспользованный остаток
//  материалов пропадает. Уничтоженный город засчитывается в ваш командный
//  уровень на время выполнения этого приказа.»

/** The order is resolved, the card is burnt, the questions are answered. */
function capillary(o) {
    const st = orderState('strategize', Object.assign({
        faction: TYR, materiel: 0, upgrades: ['Капиллярные башни'],
    }, o));
    const res = burn(st, 'Капиллярные башни');
    ok(res.ok, 'карта не сгорела: ' + res.error);
    const asked = [];
    answerAll(st, (s, q) => {
        asked.push(q.op);
        if (q.kind === 'areas') return { area: q.options[0] };
        if (q.kind === 'types') return { type: q.options[0] };
        return firstOption(s, q);
    });
    st.asked = asked;
    return st;
}

check('Капиллярные башни', 'цена уничтоженных отрядов уходит на корабли', () => {
    // Three Gaunts of one world: 3 × 2 = 6 materiel, three devourer ships.
    const st = capillary({ units: { 'гаунты': 3 } });
    eq(st.asked[0], 'destroyForMateriel', 'карта спрашивает мир');
    eq(st.units.filter(u => u.seat === 0 && (FS_RULES.unitOf(st, u) || {}).name === 'Гаунты').length, 0,
        'Гаунты уничтожены');
    const ships = st.units.filter(u => u.seat === 0 && (FS_RULES.unitOf(st, u) || {}).type === 'ship');
    eq(ships.length, 3, 'три корабля куплены');
    const sys = st.systems[0];
    ok(ships.every(u => !FS_RULES.area(FS_RULES.system(st, u.system), u.area).world), 'корабли стоят в пустотах');
    ok(ships.every(u => u.system === sys.id), 'пустоты активной системы');
    return eq(st.players[0].materiel, 0, 'материя истрачена без остатка');
});

check('Капиллярные башни', 'уничтоженный город держит командный уровень', () => {
    const st = capillary({ units: { 'гаунты': 1 }, structures: ['city'] });
    eq(st.structures.filter(s => s.seat === 0 && s.type === 'city').length, 0, 'город уничтожен');
    // The city is gone, but its command level stays for the order: 0 + 1.
    return eq(FS_RULES.commandLevel(st, 0), 1, 'командный уровень города сохранён');
});

check('Капиллярные башни', 'неиспользованный остаток материалов пропадает', () => {
    // A city alone: 3 materiel, one devourer ship for 2 — the last one is lost.
    const st = capillary({ structures: ['city'] });
    const ships = st.units.filter(u => u.seat === 0 && (FS_RULES.unitOf(st, u) || {}).type === 'ship');
    eq(ships.length, 1, 'куплен один корабль');
    return eq(st.players[0].materiel, 0, 'остаток в 1 материю пропал');
});

// ============================================================================
//  02-factions.md — Тираниды: особенность «Пожиратели Миров»
// ============================================================================
head('Особенность фракции', TYR);

/** The dominate order of the Tyranids, at the moment of its faction ability. */
function dominateState(o = {}) {
    const st = FS_RULES.newReadyGame({
        seed: 5, players: players(TYR, 'имперская-гвардия'),
    });
    st.phase = 'operations';
    st.turn = 0;
    st.order = null;
    for (const s of st.systems) s.tokens = [];
    st.systems[0].tokens = [{ seat: 0, order: 'dominate' }];
    st.order = { seat: 0, order: 'dominate', system: st.systems[0].id, phase: 'dominate' };
    if (o.assets) Object.assign(st.players[0].assets, o.assets);
    return st;
}

// «Во время выполнения приказа доминирования вы можете получить 1 жетон ресурса
//  любого типа в дополнение к жетонам ресурсов, полученным ранее текущим
//  приказом.»
check('Пожиратели Миров', 'в приказе доминирования даётся жетон ресурса любого типа', () => {
    const st = dominateState({ assets: { forge: 1, cache: 0, reinforcement: 1 } });
    const res = FS_RULES.apply(st, 0, { type: 'finishDominate' });
    ok(res.ok, 'приказ не закончен: ' + res.error);
    const q = pending(st);
    ok(!!q, 'вопроса о жетоне нет');
    eq([q.kind, q.op], ['assetType', 'gainAsset'], 'карта предлагает жетон ресурса');
    eq(q.options, ['forge', 'cache', 'reinforcement'], 'жетон любого типа');
    effectAnswer(st, { asset: 'cache' }, 4);
    return eq([st.players[0].assets.forge, st.players[0].assets.cache, st.players[0].assets.reinforcement],
        [1, 1, 1], 'взят жетон тайника, прочие не тронуты');
});

check('Пожиратели Миров', 'способность можно не применять', () => {
    const st = dominateState({ assets: { forge: 1, cache: 1, reinforcement: 1 } });
    const res = FS_RULES.apply(st, 0, { type: 'finishDominate', skip: true });
    ok(res.ok, 'приказ не закончен: ' + res.error);
    eq(!!st.pending, false, 'вопросов нет');
    return eq([st.players[0].assets.forge, st.players[0].assets.cache, st.players[0].assets.reinforcement],
        [1, 1, 1], 'жетоны не прибавились');
});

// «Количество жетонов ресурсов, которые вы можете иметь, увеличивается до 4.»
check('Пожиратели Миров', 'предел жетонов ресурса — четыре каждого типа', () => {
    const st = dominateState({ assets: { forge: 3, cache: 3, reinforcement: 3 } });
    FS_RULES.apply(st, 0, { type: 'finishDominate' });
    effectAnswer(st, { asset: 'forge' }, 4);
    // Three is the printed limit of the other factions; the Tyranids hold four.
    eq(st.players[0].assets.forge, 4, 'четвёртый жетон кузницы взят');
    eq(FS_EFFECTS.assetCap(st.players[0], 'cache'), 4, 'предел тайника тоже четыре');
    const guard = players('имперская-гвардия', TYR)[0];
    return eq(FS_EFFECTS.assetCap({ faction: guard.faction }, 'forge'), 3, 'у прочих фракций предел три');
});

// «Набег жнецов» (Некроны): the choice of the unit that takes damage first is
// independent of the payments of a strike. Removing the old guard must not
// lose this question — it is asked before the damage is suffered.
head('Боевая колода', 'некроны');
check('Фаланга судного дня', 'противник теряет 1 def, а деморализованный в этом раунде враг уничтожается', () => {
    const st = battle({
        faction: 'некроны', foeFaction: 'имперская-гвардия',
        units: { 'монолиты': 1 }, foeUnits: { 'гвардейцы': 2 },
        card: 'Фаланга судного дня', roundEnd: true,
    });
    const c = st.combat;
    c.dice.attacker = ['def', 'att'];
    c.dice.defender = ['def', 'att'];
    play(st, 0, 0, null);
    // «Ваш противник теряет 1 `def. cube`»: кубик уходит у противника.
    eq(count(st, 'defender', 'def'), 0, 'кубик защиты противника потерян');
    eq(count(st, 'defender', 'att'), 1, 'кубики атаки противника не тронуты');
    // «деморализованный в этом раунде отряд противника уничтожается».
    const foe = foeUnits(st)[0];
    foe.routed = true;
    CombatPlans.of(c).touchRoutedFoe();
    for (let i = 0; i < 30 && c && c.round === 1; i++) {
        if (st.pending) { answerAll(st, null, undefined); continue; }
        const step = c.step;
        if (step === 'damage-attacker' || step === 'damage-defender') {
            const side = step === 'damage-attacker' ? 'attacker' : 'defender';
            const seat = ctx.CombatHooks.of(c).assignSeat(c[side]);
            const result = FS_RULES.apply(st, seat, { type: 'combat', action: 'damage',
                targets: FS_RULES.damageCandidates(st, side).map(x => x.id) });
            ok(result.ok, 'урон распределён: ' + result.error);
            continue;
        }
        if (step === 'round-end') { FS_RULES.endCombatRound(st); break; }
        if (step === 'choose-attacker' || step === 'choose-defender') {
            const side = step === 'choose-attacker' ? 'attacker' : 'defender';
            const seat = side === 'attacker' ? c.attacker : c.defender;
            if (!(c.cards[side].hand || []).length) { FS_RULES.advanceCombatSteps(st); continue; }
            FS_RULES.apply(st, seat, { type: 'combat', action: 'playCard', index: 0 });
            continue;
        }
        FS_RULES.advanceCombatSteps(st);
    }
    return eq(st.units.some(u => u.id === foe.id), false, 'деморализованный отряд уничтожен в конце раунда');
});

check('Фаланга судного дня', 'в обоих шагах уничтожает новые деморализованные отряды и не переспрашивает спасённый', () => {
    for (const necron of [0, 1]) for (const payFirst of [false, true]) for (const paySecond of [false, true])
        for (const kind of ['model', 'token']) {
        const tau = 1 - necron, necSide = necron === 0 ? 'attacker' : 'defender', tauSide = tau === 0 ? 'attacker' : 'defender';
        // Fire Warrior tokens have health 1 and cannot be routed by damage.
        // Scout tokens have health 2 and exercise the rule without a fake bonus.
        const opponent = kind === 'token' ? 'космодесант' : 'империя-тау';
        const foeUnits = kind === 'token' ? { 'скауты': 3 } : { 'бронекостюмы': 3 };
        const foeCard = kind === 'token' ? 'Благословленная броня' : 'Уклонение';
        const factions = necron === 0 ? ['некроны', opponent] : [opponent, 'некроны'];
        let st = battle({ faction: factions[0], foeFaction: factions[1],
            units: necron === 0 ? { 'монолиты': 1, 'воины': 2 } : foeUnits,
            foeUnits: necron === 1 ? { 'монолиты': 1, 'воины': 2 } : foeUnits,
            hand: [necron === 0 ? 'Фаланга судного дня' : foeCard],
            foeHand: [necron === 1 ? 'Фаланга судного дня' : foeCard],
            dice: tau === 0 ? Array(8).fill('def') : [...Array(8).fill('def'), ...Array(12).fill('att')],
            foeDice: tau === 1 ? Array(8).fill('def') : [...Array(8).fill('def'), ...Array(12).fill('att')], roundEnd: true });
        FS_RULES.keepEventScheme(st, necron, FS_DATA.events.find(c => c.faction === 'некроны' && c.name === 'Безжалостное наступление'));
        if (kind === 'token') st.players[tau].assets.reinforcement = 2;
        for (const seat of [0, 1]) ok(FS_RULES.apply(st, seat, { type: 'combat', action: 'reinforce',
            count: kind === 'token' && seat === tau ? 2 : 0 }).ok, 'шаг подкреплений');
        eq([st.pending?.seat, pending(st)?.options], [necron, ['Безжалостное наступление']], 'план повтора');
        ok(FS_RULES.apply(st, necron, { type: 'effect', answer: { choice: 0 } }).ok, 'повтор принят');
        play(st, necron, 0);
        answerAll(st, firstOption);
        ok(!!CombatPlans.of(st.combat).routedFoe, 'способность Фаланги действует');
        const setHits = () => {
            CombatTurn.of(st.combat).setDice(tauSide, Array(8).fill('def')).setDice(necSide, Array(8).fill('def'));
            const attack = FS_RULES.combatValues(st, necSide).att, defence = FS_RULES.combatValues(st, tauSide).def;
            CombatTurn.of(st.combat).setDice(necSide, [...Array(8).fill('def'), ...Array(defence + 1 - attack).fill('att')]);
            eq([FS_RULES.combatDamageFor(st, tauSide), FS_RULES.combatDamageFor(st, necSide)], [1, 0], 'один нелетальный урон Тау');
        };
        setHits();
        const victims = kind === 'model'
            ? st.units.filter(u => u.seat === tau && u.unit === 'бронекостюмы').map(u => u.id)
            : [0, 1].map(i => 'reinforce-' + tauSide + '-' + i);
        const survives = id => kind === 'model' ? !!st.units.find(u => u.id === id)
            : CombatTokens.of(st.combat).alive(tauSide, Number(id.split('-')[2]));
        const hit = id => FS_RULES.apply(st, tau, { type: 'combat', action: 'damage', targets: [id] });
        ok(hit(victims[0]).ok, 'первый урон');
        eq([!!st.combat.damageRepeated, st.pending?.answerSeat, pending(st)?.op, st.pending?.steps?.[st.pending.index]?.unit],
            [false, tau, 'avoid', victims[0]], 'первый отряд спасают или уничтожают до повтора');
        st = JSON.parse(JSON.stringify(st));
        let die = pending(st).options[0];
        for (const dice of [[999], [die, die], [-1]]) {
            const before = JSON.stringify(st);
            eq(FS_RULES.apply(st, tau, { type: 'effect', answer: { dice } }).ok, false, 'поддельная или повторная плата отклоняется');
            eq(JSON.stringify(st), before, 'неверный ответ не расходует кубик и не закрывает вопрос');
        }
        ok(FS_RULES.apply(st, tau, { type: 'effect', answer: { dice: payFirst ? [die] : [] } }).ok, 'первый ответ после JSON');
        eq(survives(victims[0]), payFirst, 'первый отряд или жетон уцелел только при оплате');
        eq([!!st.combat.damageRepeated, st.combat.step, st.pending], [true, 'damage-' + tauSide, null], 'начался второй шаг');
        setHits();
        ok(hit(victims[1]).ok, 'второй урон');
        eq([st.pending?.answerSeat, pending(st)?.op, st.pending?.steps?.[st.pending.index]?.unit],
            [tau, 'avoid', victims[1]], 'второй вопрос относится только к новому отряду');
        st = JSON.parse(JSON.stringify(st));
        die = pending(st).options[0];
        ok(FS_RULES.apply(st, tau, { type: 'effect', answer: { dice: paySecond ? [die] : [] } }).ok, 'второй ответ после JSON');
        eq(survives(victims[1]), paySecond, 'второй отряд или жетон уцелел только при оплате');
        eq(st.pending, null, 'вопрос не повторяется после ответа');
    }
});

check('Фаланга судного дня', 'новый и старый жетоны, включая старые сохранения без номера раунда', () => {
    for (const necron of [0, 1]) for (const save of ['current', 'withoutRound', 'countOnly']) {
        const marine = 1 - necron, necSide = necron === 0 ? 'attacker' : 'defender', marineSide = marine === 0 ? 'attacker' : 'defender';
        const factions = necron === 0 ? ['некроны', 'космодесант'] : ['космодесант', 'некроны'];
        let st = battle({ faction: factions[0], foeFaction: factions[1],
            units: necron === 0 ? { 'монолиты': 1, 'воины': 2 } : { 'скауты': 3 },
            foeUnits: necron === 1 ? { 'монолиты': 1, 'воины': 2 } : { 'скауты': 3 },
            hand: [necron === 0 ? 'Фаланга судного дня' : 'Благословленная броня'],
            foeHand: [necron === 1 ? 'Фаланга судного дня' : 'Благословленная броня'],
            dice: necron === 0 ? Array(8).fill('att') : Array(8).fill('def'),
            foeDice: necron === 1 ? Array(8).fill('att') : Array(8).fill('def'), roundEnd: true });
        st.players[marine].assets.reinforcement = 2;
        for (const seat of [0, 1]) ok(FS_RULES.apply(st, seat, { type: 'combat', action: 'reinforce', count: seat === marine ? 2 : 0 }).ok, 'призыв');
        ok(FS_RULES.routeReinforcementToken(st, marineSide, 0), 'первый жетон деморализован в раунде 1');
        st.combat.round = 2;
        st = JSON.parse(JSON.stringify(st));
        // Old saves have no history of the round; the count-only form is even
        // older. Unknown history keeps the pre-existing routed-token behaviour.
        if (save !== 'current') delete st.combat.reinforceRoutedRounds;
        if (save === 'countOnly') delete st.combat.reinforceFlipped;
        play(st, necron, 0);
        answerAll(st, firstOption);
        CombatTurn.of(st.combat).setDice(necSide, []).setDice(marineSide, []);
        ctx.CombatCubes.of(st.combat).add(marineSide, 'def', 8);
        const attack = FS_RULES.combatValues(st, necSide).att, defence = FS_RULES.combatValues(st, marineSide).def;
        CombatTurn.of(st.combat).setDice(necSide, Array(defence + 1 - attack).fill('att'));
        eq(FS_RULES.combatDamageFor(st, marineSide), 1, 'новый жетон получит один нелетальный урон');
        ok(FS_RULES.apply(st, marine, { type: 'combat', action: 'damage', targets: ['reinforce-' + marineSide + '-1'] }).ok, 'урон');
        eq(st.pending, null, 'без кубика решение не спрашивается');
        const tokens = CombatTokens.of(st.combat);
        eq([tokens.alive(marineSide, 0), tokens.flipped(marineSide).includes(0), tokens.alive(marineSide, 1)],
            save === 'current' ? [true, true, false] : [false, false, false],
            'известный прошлый раунд сохраняется; неизвестная история использует прежнее поведение');
    }
});

/** A world of the system besides the given ones — the one left without a structure. */
function emptyWorldOf(sys, ...skip) {
    const a = (sys.areas || []).find(x => x.world && skip.indexOf(x.pos) < 0);
    return a ? a.pos : null;
}

check('Предвидение криптека', 'перенос отряда за morale cube — в дружественный мир с постройкой', () => {
    const st = battle({
        faction: 'некроны', foeFaction: 'имперская-гвардия',
        units: { 'воины': 2 }, foeUnits: { 'гвардейцы': 2 },
        card: 'Предвидение криптека',
    });
    const c = st.combat;
    c.dice.attacker = ['morale', 'morale'];
    // Карта называет мир с постройкой: мир без постройки не предлагается.
    const sys = st.systems.find(s => s.id === c.system);
    const home = sys.areas.find(a => a.world && a.pos !== c.pos) || sys.areas.find(a => a.world);
    FS_RULES.addStructure(st, 0, 'factory', sys.id, home.pos);
    const moraleBefore = count(st, 'attacker', 'morale');
    // Второй отряд стоит в мире без постройки: он «наш», но мир с постройкой —
    // единственное место, куда карта его переносит.
    const plain = emptyWorldOf(sys, c.pos, home.pos);
    if (plain) FS_RULES.addUnit(st, 0, 'воины', sys.id, plain);
    if (plain) eq(st.units.some(u => u.seat === 0 && u.area === plain), true,
        'в мире без постройки стоит наш отряд');
    let asked = null;
    play(st, 0, 0, (s2, q) => {
        if (q.kind === 'dice') return { dice: [0] };
        // Выбирается отряд, стоящий в мире БЕЗ постройки.
        if (q.kind === 'units') {
            const pick = (q.options || []).find(id => {
                const u = st.units.find(x => x.id === id);
                return u && u.area === plain;
            });
            return { units: [pick || (q.options || [])[0]] };
        }
        if (q.kind === 'areas') { asked = q.options || []; return { area: q.options[0] }; }
        return firstOption(s2, q);
    });
    eq(count(st, 'attacker', 'morale'), moraleBefore - 1, 'один morale cube потрачен');
    ok(!!asked, 'вопрос «куда» не задан');
    eq(asked.every(a => a.system === sys.id && a.pos === home.pos), true,
        'предложен только мир с нашей постройкой');
    // Мир с отрядом, но БЕЗ постройки: мир наш, а карта называет только мир с
    // постройкой — второй отряд должен быть предложен лишь в мире с фабрикой.
    if (plain) {
        eq(asked.some(a => a.pos === plain), false,
            'мир без постройки не предложен, хотя отряд стоит в нём');
    }
    return eq(st.units.filter(u => u.seat === 0 && u.system === sys.id && u.area === home.pos).length, 1,
        'отряд перенесён в этот мир');
});

check('Воля повелителя', 'после принятия настоящего «до 2» разрешено перебросить ноль, один или два разных кубика', () => {
    for (const seat of [0, 1]) for (const amount of [0, 1, 2]) {
        const st = battle({ faction: seat === 0 ? 'некроны' : 'имперская-гвардия', foeFaction: seat === 0 ? 'имперская-гвардия' : 'некроны',
            units: seat === 0 ? { 'воины': 1 } : { 'гвардейцы': 1 },
            foeUnits: seat === 0 ? { 'гвардейцы': 1 } : { 'воины': 1 }, roundEnd: true });
        refuseReinforce(st);
        const side = seat === 0 ? 'attacker' : 'defender';
        CombatTurn.of(st.combat).setDice(side, ['att', 'def', 'att']);
        const card = FS_DATA.combat.find(c => c.faction === 'некроны' && c.name === 'Воля повелителя');
        const step = FS_EFFECTS.parse(card.general, { kind: 'combat', faction: 'некроны' }).find(s => s.op === 'rerollDie');
        FS_RULES.runEffects(st, seat, [step], { kind: 'combat', optional: true, ctx: { side } });
        eq(pending(st)?.kind, 'ability', 'сначала игрок принимает способность');
        ok(FS_RULES.apply(st, seat, { type: 'effect', answer: {} }).ok, 'способность принята');
        const q = pending(st);
        eq([q?.op, q?.n, q?.any, q?.multi], ['rerollDie', 2, true, true], 'до двух — реальный множественный выбор');
        for (const dice of [[q.options[0], q.options[0]], q.options.slice(0, 3), [100], '0']) {
            const before = JSON.stringify(st);
            eq(FS_RULES.apply(st, seat, { type: 'effect', answer: { dice } }).ok, false, 'повтор, избыток и чужие кубики отклонены');
            eq(JSON.stringify(st), before, 'неверный ответ ничего не меняет');
        }
        withFixedDice(['morale'], () => ok(FS_RULES.apply(st, seat, { type: 'effect', answer: { dice: q.options.slice(0, amount) } }).ok, 'выбор до двух принят'));
        eq(dice(st, side).filter(d => d === 'morale').length, amount, 'переброшено выбранное число кубиков');
    }
});
check('Воля повелителя', 'восстановить деморализованный отряд и перебросить до 2 кубиков', () => {
    const st = battle({
        faction: 'некроны', foeFaction: 'имперская-гвардия',
        units: { 'воины': 2 }, foeUnits: { 'гвардейцы': 2 },
        card: 'Воля повелителя',
    });
    st.combat.dice.attacker = ['morale', 'att', 'att'];
    routeMine(st, 0);
    eq(myUnits(st).filter(u => u.routed).length, 1, 'один свой отряд деморализован');
    let rerollAsked = null;
    play(st, 0, 0, (s2, q) => {
        if (q.kind === 'units') return { units: (q.options || []).slice(0, 1) };
        if (q.kind === 'dice') {
            rerollAsked = q;
            // «до 2» — сервер отклоняет три кубика, а не меняет их молча.
            eq(FS_RULES.apply(s2, s2.pending.answerSeat, { type: 'effect',
                answer: { dice: (q.options || []).slice(0, 3) } }).ok, false, 'три кубика не проходят');
            return { dice: (q.options || []).slice(0, 2) };
        }
        return firstOption(s2, q);
    });
    eq(myUnits(st).filter(u => u.routed).length, 0, 'деморализованный отряд восстановлен');
    ok(!!rerollAsked, 'вопрос о перебросе не задан');
    eq(rerollAsked.n, 2, 'вопрос называет предел — два кубика');
    eq((rerollAsked.options || []).length <= 3, true, 'предложены кубики стола');
    return eq(dice(st, 'attacker').length, 3, 'кубиков на столе столько же');
});

check('Вечное завоевание', 'восстановление отряда + по кубику атаки за каждый morale cube, если в бою нужный отряд', () => {
    const st = battle({
        faction: 'некроны', foeFaction: 'имперская-гвардия',
        units: { 'воины': 2, 'монолиты': 1 }, foeUnits: { 'гвардейцы': 2 },
        card: 'Вечное завоевание',
    });
    const c = st.combat;
    c.dice.attacker = ['morale', 'morale', 'morale', 'att'];
    routeMine(st, 0);
    eq(myUnits(st).filter(u => u.routed).length, 1, 'один свой отряд деморализован');
    const attBefore = count(st, 'attacker', 'att');
    play(st, 0, 0, (s2, q) => {
        if (q.kind === 'units') return { units: (q.options || []).slice(0, 1) };
        return firstOption(s2, q);
    });
    eq(myUnits(st).filter(u => u.routed).length, 0, 'деморализованный отряд восстановлен');
    // Три `morale cube` на столе — три кубика атаки.
    return eq(count(st, 'attacker', 'att'), attBefore + 3, 'по кубику атаки за каждый morale cube');
});

check('Рой каноптепов', 'бесплатный жетон подкрепления ставится в эту область и не тратит запас', () => {
    const st = battle({ faction: 'некроны', foeFaction: 'имперская-гвардия', card: 'Рой каноптепов' });
    const before = st.players[0].assets.reinforcement;
    play(st, 0, 0, (s2, q) => {
        if (q.kind === 'areas') return { area: q.options[0] };
        return firstOption(s2, q);
    });
    eq(CombatTokens.of(st.combat).units('attacker').used, 1, 'жетон лёг на стол боя');
    eq(st.players[0].assets.reinforcement, before, 'запас игрока не тронут: жетон бесплатный');
    const tok = CombatTokens.of(st.combat).units('attacker');
    return eq([tok.alive, tok.routed], [1, 0], 'жетон в бою целый и недеморализованный');
});

/**
 * The card of the battle is turned over through the real steps of the combat:
 * the reinforcements are refused, both cards are played, the abilities are
 * answered with `policy`, and the walk stops when the damage of the round comes.
 * A check that only "plays the card" never reaches the reveal, where the
 * ability of a card is read.
 */
function playThrough(st, policy) {
    // Розыгрыш одного раунда: способности карты разрешены, урон ещё не роздан.
    // Урон и конец раунда сбрасывают жетоны раунда, поэтому проверка остаётся
    // до первого из них (иначе она читала бы уже убранный стол).
    const round0 = st.combat ? st.combat.round : 0;
    // Вопросы, которые карта задала по дороге: проверка отличает «способность
    // прозвучала» от «движок молча довёл бой».
    st.qs = [];
    for (let i = 0; i < 20 && st.combat; i++) {
        if (st.combat.round !== round0) return st;
        if (st.pending) {
            const q = st.pending.question;
            st.qs.push(q.kind + ':' + q.op);
            const seat = st.pending.answerSeat === undefined ? st.pending.seat : st.pending.answerSeat;
            const answer = policy ? policy(q) : null;
            FS_RULES.apply(st, seat, { type: 'effect', answer: answer || { choice: 0 } });
            // Последний ответ может сразу перевести бой в уход; жетоны раунда
            // при этом уже убраны, так что дальше идти незачем.
            if (st.combat && (CombatTurn.of(st.combat).step === 'retreat' || st.combat.round !== round0)) return st;
            continue;
        }
        const step = CombatTurn.of(st.combat).step;
        // Конец раунда убирает жетоны раунда: проверка читает стол ДО него.
        if (step === 'round-end') return st;
        if (step === 'reinforce-attacker' || step === 'reinforce-defender') {
            FS_RULES.apply(st, step === 'reinforce-attacker' ? 0 : 1, { type: 'combat', action: 'reinforce', count: 0 });
        } else if (step === 'choose-attacker') {
            FS_RULES.apply(st, 0, { type: 'combat', action: 'playCard', index: 0 });
        } else if (step === 'choose-defender') {
            FS_RULES.apply(st, 1, { type: 'combat', action: 'playCard', index: 0 });
        } else if (step === 'damage-attacker' || step === 'damage-defender' || step === 'retreat') {
            return st;
        } else {
            FS_RULES.advanceCombatSteps(st);
        }
    }
    return st;
}

check('Свежеватели', '«если у противника есть morale cube» — свой кубик получаю, чужой теряется', () => {
    // Общая способность даёт 2 `att. token`, способность единицы забирает
    // кубик боевого духа — но только когда он у противника ЕСТЬ.
    const withDie = battle({ faction: 'некроны', foeFaction: 'имперская-гвардия', card: 'Свежеватели', units: { 'воины': 2 }, foeUnits: { 'гвардейцы': 2 }, dice: [], foeDice: ['morale', 'att'] });
    playThrough(withDie);
    eq(count(withDie, 'attacker', 'morale'), 1, 'свой кубик боевого духа получен');
    eq(count(withDie, 'defender', 'morale'), 0, 'чужой кубик боевого духа потерян');
    eq(tokens(withDie, 'attacker').att, 2, 'два жетона атаки с общей способности');
    // Без кубика у противника условие не выполнено: способность молчит.
    const without = battle({ faction: 'некроны', foeFaction: 'имперская-гвардия', card: 'Свежеватели', units: { 'воины': 2 }, foeUnits: { 'гвардейцы': 2 }, dice: [], foeDice: ['att'] });
    playThrough(without);
    return eq(count(without, 'attacker', 'morale'), 0, 'без кубика у противника ничего не берётся');
});

check('Фаланга монолита', 'урон в конце раунда решает, отступит ли противник; отряды не деморализуются', () => {
    // Общая способность ждёт конца раунда: если по нашим отрядам и бастионам
    // урона не пришло, противник отступает одним отрядом. Способность единицы
    // («Монолит/Корабль-Гробница») держит свои отряды от деморализации в этом
    // раунде.
    // Один раунд: доводим до розыгрыша урона по защитнику — вместе с ним
    // движок закрывает раунд и разрешает отложенное правило карты.
    const runRound = foeDice => {
        const st = battle({ faction: 'некроны', foeFaction: 'имперская-гвардия', card: 'Фаланга монолита', units: { 'монолиты': 2 }, foeUnits: { 'огрины': 2 }, dice: [], foeDice, noFoeCard: true });
        const inCombat = () => (st.combat ? BattleField.of(st.combat).units(st, st.combat.defender).length : null);
        const round0 = st.combat.round;
        let before = null;
        for (let i = 0; i < 40 && st.combat; i++) {
            // Раунд закрылся вместе с ударом: отложенное правило карты уже
            // разрешено, дальше идёт новый раунд с чистым столом.
            if (st.combat.round !== round0) return { st, before };
            if (st.pending) {
                const q = st.pending.question;
                const seat = st.pending.answerSeat === undefined ? st.pending.seat : st.pending.answerSeat;
                const answer = q.kind === 'units' ? { units: (q.options || []).slice(0, 1) }
                    : q.kind === 'areas' ? { area: (q.options || [])[0] }
                        : q.kind === 'dice' ? { dice: (q.options || []).slice(0, 1) } : { choice: 0 };
                FS_RULES.apply(st, seat, { type: 'effect', answer });
                continue;
            }
            const step = CombatTurn.of(st.combat).step;
            if (step === 'reinforce-attacker' || step === 'reinforce-defender') {
                FS_RULES.apply(st, step === 'reinforce-attacker' ? 0 : 1, { type: 'combat', action: 'reinforce', count: 0 });
            } else if (step === 'choose-attacker') {
                FS_RULES.apply(st, 0, { type: 'combat', action: 'playCard', index: 0 });
            } else if (step === 'choose-defender') {
                FS_RULES.apply(st, 1, { type: 'combat', action: 'playCard', index: 0 });
            } else if (step === 'damage-attacker' || step === 'damage-defender') {
                const side = step === 'damage-attacker' ? 'attacker' : 'defender';
                before = inCombat();
                FS_RULES.apply(st, side === 'attacker' ? 0 : 1, {
                    type: 'combat', action: 'damage', targets: FS_RULES.damageCandidates(st, side).map(x => x.id),
                });
            } else FS_RULES.advanceCombatSteps(st);
        }
        return { st, before };
    };
    // По моим отрядам урона нет: в конце раунда у противника одним отрядом меньше.
    const calm = runRound([]);
    eq(calm.before, 2, 'в раунде у противника два отряда');
    eq(BattleField.of(calm.st.combat).units(calm.st, calm.st.combat.defender).length, 1, 'без урона по нашим отрядам противник отступил');
    // По моим отрядам урон пришёл: способность молчит.
    const hurt = runRound(['att', 'att', 'att']);
    eq(BattleField.of(hurt.st.combat).units(hurt.st, hurt.st.combat.defender).length, 2, 'после урона противник не отступает');
    // Деморализации своих отрядов в этом раунде не случается (способность
    // единицы требует Монолита в бою, поэтому в раскладе именно они).
    return eq(myUnits(calm.st).filter(u => u.routed).length + myUnits(hurt.st).filter(u => u.routed).length, 0,
        'свои отряды не деморализованы');
});

// --- Планы некронов ---------------------------------------------------------
check('Пробуждение мира-гробницы', 'покупка постройки в дружественном мире', () => {
    // Некроны населяют мир своим отрядом: постройка ставится только на
    // контролируемый мир. Материя 12 хватает на фабрику (2).
    const st = eventState('Пробуждение мира-гробницы', { faction: 'некроны', units: { 'воины': 1 }, materiel: 12 });
    const res = playEvent(st);
    ok(res.ok, 'событие не разыграно: ' + res.error);
    for (let i = 0; i < 6 && st.pending; i++) {
        const q = st.pending.question;
        const answer = q.kind === 'structureTypes' ? { type: 'factory' }
            : q.kind === 'areas' ? { area: (q.options || [])[0] } : { choice: 0 };
        FS_RULES.apply(st, st.pending.seat === undefined ? 0 : st.pending.seat, { type: 'effect', answer });
    }
    eq(st.structures.filter(x => x.seat === 0 && x.type === 'factory').length, 1, 'фабрика построена');
    eq(st.players[0].materiel, 10, 'заплачено 2 материи');
    // Без материи покупки нет: цена — не формальность.
    const poor = eventState('Пробуждение мира-гробницы', { faction: 'некроны', units: { 'воины': 1 }, materiel: 0 });
    ok(playEvent(poor).ok, 'событие не разыграно');
    let offered = 0;
    for (let i = 0; i < 6 && poor.pending; i++) {
        const q = poor.pending.question;
        if (q.kind === 'structureTypes' || (q.kind === 'choice' && /фабрик|город|бастион/i.test(String(q.text)))) offered++;
        const answer = q.kind === 'structureTypes' ? { type: 'factory' }
            : q.kind === 'areas' ? { area: (q.options || [])[0] } : { choice: 0 };
        FS_RULES.apply(poor, poor.pending.seat === undefined ? 0 : poor.pending.seat, { type: 'effect', answer });
    }
    eq(offered, 0, 'без материи постройка не предлагается');
    return eq(poor.structures.filter(x => x.seat === 0).length, 0, 'и на поле её нет');
});

check('Гнев дракона пустоты', 'сброс плана в начале раунда даёт по 3 урона обоим', () => {
    // План спрашивается в начале раунда боя: отказ оставляет бой как есть,
    // сброс добавляет по 3 урона каждой стороне в шаге повреждений.
    const play = use => {
        const st = battle({ faction: 'некроны', foeFaction: 'имперская-гвардия', units: { 'воины': 2 }, foeUnits: { 'огрины': 2 }, dice: ['att', 'att'], foeDice: ['att', 'att'], noFoeCard: true });
        schemeInPlay(st, 'Гнев дракона пустоты', 'некроны');
        const c = st.combat;
        const inCombat = side => (st.combat ? BattleField.of(st.combat).units(st, side).length : 0);
        const before = { mine: inCombat(c.attacker), foe: inCombat(c.defender) };
        for (let i = 0; i < 40 && st.combat; i++) {
            if (st.pending) {
                const q = st.pending.question;
                const seat = st.pending.answerSeat === undefined ? st.pending.seat : st.pending.answerSeat;
                FS_RULES.apply(st, seat, { type: 'effect', answer: q.kind === 'scheme' ? { choice: use ? 0 : 1 } : (q.kind === 'units' ? { units: (q.options || []).slice(0, 1) } : { choice: 0 }) });
                continue;
            }
            const step = CombatTurn.of(st.combat).step;
            if (step === 'retreat') break;
            if (step === 'reinforce-attacker' || step === 'reinforce-defender') {
                FS_RULES.apply(st, step === 'reinforce-attacker' ? 0 : 1, { type: 'combat', action: 'reinforce', count: 0 });
            } else if (step === 'choose-attacker') {
                FS_RULES.apply(st, 0, { type: 'combat', action: 'playCard', index: 0 });
            } else if (step === 'choose-defender') {
                FS_RULES.apply(st, 1, { type: 'combat', action: 'playCard', index: 0 });
            } else if (step === 'damage-attacker') {
                FS_RULES.apply(st, 0, { type: 'combat', action: 'damage', targets: FS_RULES.damageCandidates(st, 'attacker').map(x => x.id) });
            } else if (step === 'damage-defender') {
                FS_RULES.apply(st, 1, { type: 'combat', action: 'damage', targets: FS_RULES.damageCandidates(st, 'defender').map(x => x.id) });
            } else FS_RULES.advanceCombatSteps(st);
        }
        return { st, before, after: { mine: inCombat(c.attacker), foe: inCombat(c.defender) } };
    };
    const no = play(false);
    eq(no.after.mine, no.before.mine, 'отказ: мой отряд цел');
    eq(no.after.foe, no.before.foe, 'отказ: враг цел');
    const yes = play(true);
    return eq([yes.after.mine < yes.before.mine, yes.after.foe < yes.before.foe], [true, true],
        'сброс: обе стороны теряют по отряду от дополнительного урона');
});
check('Гнев дракона пустоты', 'новый и старый триггеры предлагают план в начале раунда обеим сторонам, а не при уроне', () => {
    for (const owner of [0, 1]) for (const legacy of [false, true]) for (const accept of [false, true]) {
        let st = owner === 0
            ? battle({ faction: 'некроны', foeFaction: 'империя-тау', units: { 'воины': 2 },
                foeUnits: { 'воины-огня': 2 }, roundEnd: true })
            : battle({ faction: 'империя-тау', foeFaction: 'некроны', units: { 'воины-огня': 2 },
                foeUnits: { 'воины': 2 }, roundEnd: true });
        const card = FS_DATA.events.find(c => c.faction === 'некроны' && c.name === 'Гнев дракона пустоты');
        FS_RULES.keepEventScheme(st, owner, card);
        eq(st.players[owner].schemes[0].trigger, 'round', 'новый план знает момент начала раунда');
        if (legacy) st.players[owner].schemes[0].trigger = 'damage'; // saved by the old parser
        eq(FS_RULES.maybeScheme(st, owner, 'damage', { kind: 'combat', ctx: {} }), false, 'план не ждёт нанесения урона');
        st = JSON.parse(JSON.stringify(st));
        refuseReinforce(st);
        eq([st.pending?.seat, pending(st)?.options], [owner, ['Гнев дракона пустоты']], 'план предлагается в начале раунда');
        st = JSON.parse(JSON.stringify(st));
        ok(FS_RULES.apply(st, owner, { type: 'effect', answer: accept ? { choice: 0 } : { no: true } }).ok, 'ответ принят');
        eq(st.pending, null, 'вопрос закрыт');
        eq(st.players[owner].schemes.length, accept ? 0 : 1, 'только сброшенный план расходуется');
        st.combat.dice.attacker = []; st.combat.dice.defender = [];
        eq([FS_RULES.combatDamageFor(st, 'attacker'), FS_RULES.combatDamageFor(st, 'defender')],
            accept ? [3, 3] : [0, 0], 'даже без атак обе стороны получают обещанный урон');
        FS_RULES.endCombatRound(st);
        eq(st.combat.extraDamageBoth || 0, 0, 'бонус не переносится в следующий раунд');
    }
});

// «Когда 1 из ваших отрядов с командным уровнем 0 или 1 деморализован или
//  уничтожен, вы можете сбросить эту карту, чтобы вернуть этого юнита
//  недеморализованным обратно после этапа получения урона.»
check('Сфера воскрешения', 'уничтоженный отряд возвращается из ЗАПАСА, запас не растёт', () => {
    // Воин (здоровье 3) уничтожается целиком: в запасе остаётся 1 модель из 2,
    // и именно она возвращается на стол. Возврат «из воздуха» оставил бы запас
    // нетронутым — модель стояла бы и на столе, и в запасе.
    const st = battle({ faction: 'некроны', foeFaction: 'имперская-гвардия', units: { 'воины': 2 }, foeUnits: { 'огрины': 2 }, dice: [], foeDice: ['att', 'att', 'att'], noFoeCard: true });
    schemeInPlay(st, 'Сфера воскрешения', 'некроны');
    const supply = () => st.players[0].supply.units['воины'] || 0;
    let offered = false, onTable = null, supplyAfter = null, left = null;
    let onTableBefore = null, supplyBefore = null;
    for (let i = 0; i < 40 && st.combat; i++) {
        if (st.pending) {
            const q = st.pending.question;
            const seat = st.pending.answerSeat === undefined ? st.pending.seat : st.pending.answerSeat;
            const answer = q.op === 'resurrectOffer' ? { choice: 0 }
                : (q.kind === 'units' ? { units: (q.options || []).slice(0, 1) } : { choice: 0 });
            if (q.op === 'resurrectOffer') {
                offered = true;
                onTableBefore = myUnits(st).length;
                supplyBefore = supply();
            }
            const res = FS_RULES.apply(st, seat, { type: 'effect', answer });
            ok(res.ok, 'ответ не принят: ' + res.error);
            if (q.op === 'resurrectOffer') {
                // Смотрим сразу после возврата: следующий раунд снова ранит отряд.
                onTable = myUnits(st).length;
                supplyAfter = supply();
                left = myUnits(st).filter(u => !u.routed).length;
            }
            continue;
        }
        const step = CombatTurn.of(st.combat).step;
        if (step === 'retreat') break;
        if (step === 'reinforce-attacker' || step === 'reinforce-defender') {
            FS_RULES.apply(st, step === 'reinforce-attacker' ? 0 : 1, { type: 'combat', action: 'reinforce', count: 0 });
        } else if (step === 'choose-attacker' || step === 'choose-defender') {
            FS_RULES.advanceCombatSteps(st);
        } else if (step === 'damage-attacker' || step === 'damage-defender') {
            const side = step === 'damage-attacker' ? 'attacker' : 'defender';
            FS_RULES.apply(st, side === 'attacker' ? st.combat.attacker : st.combat.defender,
                { type: 'combat', action: 'damage', targets: FS_RULES.damageCandidates(st, side).map(x => x.id) });
        } else FS_RULES.advanceCombatSteps(st);
    }
    eq(offered, true, 'план предложен после этапа урона');
    eq(onTable, onTableBefore + 1, 'на столе появился ещё один воин');
    eq(left, onTable, 'вернувшийся отряд недеморализован');
    return eq(supplyAfter, supplyBefore - 1,
        'модель пришла ИЗ ЗАПАСА: было ' + supplyBefore + ', стало ' + supplyAfter);
});

check('Сфера воскрешения', 'после отказа снова предлагает нового павшего в повторном шаге «Бронекулака»', () => withFixedDice(['att'], () => {
    for (const necron of [0, 1]) for (const acceptFirst of [false, true]) for (const lethal of [false, true]) {
        const marine = 1 - necron, necSide = necron === 0 ? 'attacker' : 'defender', marineSide = marine === 0 ? 'attacker' : 'defender';
        const factions = necron === 0 ? ['некроны', 'космодесант'] : ['космодесант', 'некроны'];
        let st = battle({ faction: factions[0], foeFaction: factions[1],
            units: necron === 0 ? { 'воины': 3 } : { 'ленд-рейдеры': 1, 'скауты': 2 },
            foeUnits: necron === 1 ? { 'воины': 3 } : { 'ленд-рейдеры': 1, 'скауты': 2 },
            hand: [necron === 0 ? 'Воин фланги' : 'Бронекулак'],
            foeHand: [necron === 1 ? 'Воин фланги' : 'Бронекулак'],
            dice: necron === 0 ? Array(8).fill('def') : [...Array(8).fill('def'), ...Array(12).fill('att')],
            foeDice: necron === 1 ? Array(8).fill('def') : [...Array(8).fill('def'), ...Array(12).fill('att')], roundEnd: true });
        FS_RULES.keepEventScheme(st, necron, FS_DATA.events.find(c => c.faction === 'некроны' && c.name === 'Сфера воскрешения'));
        refuseReinforce(st);
        play(st, marine, 0);
        answerAll(st, firstOption);
        eq(st.combat.repeatDamage, true, 'реальная способность Ленд рейдера повторяет урон');
        const setHits = () => {
            CombatTurn.of(st.combat).setDice(necSide, Array(8).fill('def')).setDice(marineSide, Array(8).fill('def'));
            const attack = FS_RULES.combatValues(st, marineSide).att, defence = FS_RULES.combatValues(st, necSide).def;
            CombatTurn.of(st.combat).setDice(marineSide, [...Array(8).fill('def'), ...Array(defence + (lethal ? 3 : 1) - attack).fill('att')]);
            eq([FS_RULES.combatDamageFor(st, necSide), FS_RULES.combatDamageFor(st, marineSide)],
                [lethal ? 3 : 1, 0], 'урон только Некронам');
        };
        setHits();
        const victims = st.units.filter(u => u.seat === necron && u.unit === 'воины').map(u => u.id);
        const supply = st.players[necron].supply.units['воины'];
        const hit = id => FS_RULES.apply(st, necron, { type: 'combat', action: 'damage', targets: [id] });
        ok(hit(victims[0]).ok, 'первый урон');
        eq([!!st.combat.damageRepeated, st.pending?.seat, pending(st)?.op],
            [false, necron, 'resurrectOffer'], 'первое предложение до повтора');
        st = JSON.parse(JSON.stringify(st));
        ok(FS_RULES.apply(st, necron, { type: 'effect', answer: acceptFirst ? { yes: true } : { no: true } }).ok, 'первый ответ после JSON');
        eq(st.players[necron].schemes.length, acceptFirst ? 0 : 1, 'план сбрасывается только при согласии');
        eq(st.players[necron].supply.units['воины'], supply + (lethal && !acceptFirst ? 1 : 0), 'запас первого отряда');
        eq([!!st.combat.damageRepeated, st.combat.step, st.pending], [true, 'damage-' + necSide, null], 'повтор после ответа');
        setHits();
        ok(hit(victims[1]).ok, 'второй урон');
        if (!acceptFirst) {
            eq([st.pending?.seat, pending(st)?.op, CombatPlans.of(st.combat).candidate?.id],
                [necron, 'resurrectOffer', victims[1]], 'после отказа предлагается только новый павший');
            st = JSON.parse(JSON.stringify(st));
            ok(FS_RULES.apply(st, necron, { type: 'effect', answer: { yes: true } }).ok, 'второе согласие после JSON');
            eq(st.players[necron].schemes.length, 0, 'план сброшен во втором шаге');
        }
        eq(st.players[necron].supply.units['воины'], supply + (lethal && !acceptFirst ? 1 : 0) + (lethal && acceptFirst ? 1 : 0),
            'только невозвращённые модели остались в запасе');
        eq(st.pending, null, 'оба шага закончились без лишних вопросов');
    }
}));

check('Сфера воскрешения', 'павшие жетоны предлагаются заново при повторении шага после отказа', () => withFixedDice(['att'], () => {
    for (const necron of [0, 1]) for (const acceptFirst of [false, true]) for (const lethal of [false, true]) {
        const marine = 1 - necron, necSide = necron === 0 ? 'attacker' : 'defender';
        const marineSide = marine === 0 ? 'attacker' : 'defender';
        const factions = necron === 0 ? ['некроны', 'космодесант'] : ['космодесант', 'некроны'];
        let st = battle({ faction: factions[0], foeFaction: factions[1],
            units: necron === 0 ? { 'воины': 3 } : { 'ленд-рейдеры': 1, 'скауты': 2 },
            foeUnits: necron === 1 ? { 'воины': 3 } : { 'ленд-рейдеры': 1, 'скауты': 2 },
            hand: [necron === 0 ? 'Воин фланги' : 'Бронекулак'],
            foeHand: [necron === 1 ? 'Воин фланги' : 'Бронекулак'], roundEnd: true });
        FS_RULES.keepEventScheme(st, necron, FS_DATA.events.find(c => c.faction === 'некроны' && c.name === 'Сфера воскрешения'));
        st.players[necron].assets.reinforcement = 2;
        for (const seat of [0, 1]) ok(FS_RULES.apply(st, seat, { type: 'combat', action: 'reinforce',
            count: seat === necron ? 2 : 0 }).ok, 'жетоны призваны');
        play(st, marine, 0);
        answerAll(st, firstOption);
        eq(st.combat.repeatDamage, true, 'реальный Бронекулак повторяет повреждения');
        const setHits = () => {
            CombatTurn.of(st.combat).setDice(necSide, Array(8).fill('def')).setDice(marineSide, Array(8).fill('def'));
            const att = FS_RULES.combatValues(st, marineSide).att, def = FS_RULES.combatValues(st, necSide).def;
            CombatTurn.of(st.combat).setDice(marineSide, [...Array(8).fill('def'), ...Array(def + (lethal ? 3 : 1) - att).fill('att')]);
            eq([FS_RULES.combatDamageFor(st, necSide), FS_RULES.combatDamageFor(st, marineSide)],
                [lethal ? 3 : 1, 0], 'урон только Некронам');
        };
        const ids = [0, 1].map(i => 'reinforce-' + necSide + '-' + i);
        const supply = st.players[necron].supply.units['воины'], assets = st.players[necron].assets.reinforcement;
        const models = st.units.filter(u => u.seat === necron).length;
        setHits();
        ok(FS_RULES.apply(st, necron, { type: 'combat', action: 'damage', targets: [ids[0]] }).ok, 'первый удар');
        eq([!!st.combat.damageRepeated, pending(st)?.op, CombatPlans.of(st.combat).candidate?.id],
            [false, 'resurrectOffer', ids[0]], 'первый жетон предложен до повтора');
        st = JSON.parse(JSON.stringify(st));
        ok(FS_RULES.apply(st, necron, { type: 'effect', answer: acceptFirst ? { yes: true } : { no: true } }).ok, 'первый ответ после JSON');
        eq([!!st.combat.damageRepeated, st.combat.step, st.pending], [true, 'damage-' + necSide, null], 'начался второй шаг');
        setHits();
        ok(FS_RULES.apply(st, necron, { type: 'combat', action: 'damage', targets: [ids[1]] }).ok, 'второй удар');
        if (!acceptFirst) {
            eq([pending(st)?.op, CombatPlans.of(st.combat).candidate?.id], ['resurrectOffer', ids[1]],
                'после отказа предложен только второй жетон');
            st = JSON.parse(JSON.stringify(st));
            ok(FS_RULES.apply(st, necron, { type: 'effect', answer: { yes: true } }).ok, 'второй ответ после JSON');
        }
        const t = CombatTokens.of(st.combat);
        eq([t.alive(necSide, 0), t.flipped(necSide).includes(0), t.alive(necSide, 1), t.flipped(necSide).includes(1)],
            [acceptFirst || !lethal, !acceptFirst && !lethal, !acceptFirst || !lethal, acceptFirst && !lethal],
            'вернулся выбранный жетон; второй без плана не возвращается');
        eq([st.units.filter(u => u.seat === necron).length, st.players[necron].supply.units['воины'],
            st.players[necron].assets.reinforcement, st.players[necron].schemes.length, st.pending],
            [models, supply, assets, 0, null], 'без лишней модели, ресурса или вопроса');
    }
}));

check('Сфера воскрешения', 'возвращает павший жетон подкрепления как отряд КЛ 0 без новой модели или ресурса', () => {
    for (const necron of [0, 1]) for (const lethal of [false, true]) for (const accept of [false, true])
        for (const wasRouted of [false, true]) {
        if (wasRouted && !lethal) continue;
        const necSide = necron === 0 ? 'attacker' : 'defender', foeSide = necron === 0 ? 'defender' : 'attacker';
        const factions = necron === 0 ? ['некроны', 'космодесант'] : ['космодесант', 'некроны'];
        let st = battle({ faction: factions[0], foeFaction: factions[1],
            units: necron === 0 ? { 'воины': 3 } : { 'скауты': 3 },
            foeUnits: necron === 1 ? { 'воины': 3 } : { 'скауты': 3 }, roundEnd: true });
        FS_RULES.keepEventScheme(st, necron, FS_DATA.events.find(c => c.faction === 'некроны' && c.name === 'Сфера воскрешения'));
        st.players[necron].assets.reinforcement = 1;
        for (const seat of [0, 1]) ok(FS_RULES.apply(st, seat, { type: 'combat', action: 'reinforce',
            count: seat === necron ? 1 : 0 }).ok, 'жетон призван обычным способом');
        CombatTurn.of(st.combat).setDice(necSide, Array(8).fill('def')).setDice(foeSide, Array(8).fill('def'));
        const attack = FS_RULES.combatValues(st, foeSide).att, defence = FS_RULES.combatValues(st, necSide).def;
        CombatTurn.of(st.combat).setDice(foeSide, [...Array(8).fill('def'), ...Array(defence + (lethal ? 3 : 1) - attack).fill('att')]);
        CombatTurn.of(st.combat).setStep('damage-' + necSide);
        const token = 'reinforce-' + necSide + '-0';
        if (wasRouted) {
            for (const u of st.units.filter(u => u.seat === necron)) FS_RULES.routeUnit(st, u);
            ok(FS_RULES.routeReinforcementToken(st, necSide, 0), 'жетон был деморализован до летального урона');
        }
        const models = st.units.filter(u => u.seat === necron).length, supply = st.players[necron].supply.units['воины'];
        const asset = st.players[necron].assets.reinforcement;
        ok(FS_RULES.apply(st, necron, { type: 'combat', action: 'damage', targets: [token] }).ok, 'урон жетону');
        eq([st.pending?.seat, pending(st)?.op, CombatPlans.of(st.combat).candidate?.id],
            [necron, 'resurrectOffer', token], 'жетон предложен после шага урона');
        st = JSON.parse(JSON.stringify(st));
        ok(FS_RULES.apply(st, necron, { type: 'effect', answer: accept ? { yes: true } : { no: true } }).ok, 'ответ после JSON');
        const tokens = CombatTokens.of(st.combat);
        eq([tokens.alive(necSide, 0), tokens.flipped(necSide).includes(0)],
            [accept || !lethal, !accept && !lethal], 'жетон восстановлен либо остался деморализованным/уничтоженным');
        eq([st.units.filter(u => u.seat === necron).length, st.players[necron].supply.units['воины'],
            st.players[necron].assets.reinforcement], [models, supply, asset], 'модель и ресурс не созданы');
        eq(st.players[necron].schemes.length, accept ? 0 : 1, 'план сброшен только при согласии');
    }
});

check('Сфера воскрешения', 'КЛ 2 не возвращается: предел плана — печатный КЛ 0–1', () => {
    // Монолит (КЛ 2) уничтожается в бою — и плана не задевает: текст называет
    // «отряд с командным уровнем 0 или 1». Тот же прогон с воинами (КЛ 0)
    // обязан предложить план, иначе проверка ничего не доказывает.
    const offered = (unitId, n) => {
        const st = battle({ faction: 'некроны', foeFaction: 'имперская-гвардия', units: { [unitId]: n }, foeUnits: { 'огрины': 2 }, dice: [], foeDice: Array(8).fill('att'), noFoeCard: true });
        schemeInPlay(st, 'Сфера воскрешения', 'некроны');
        let seen = false;
        for (let i = 0; i < 40 && st.combat; i++) {
            if (st.pending) {
                const q = st.pending.question;
                if (q.op === 'resurrectOffer') seen = true;
                const seat = st.pending.answerSeat === undefined ? st.pending.seat : st.pending.answerSeat;
                FS_RULES.apply(st, seat, { type: 'effect', answer: q.kind === 'units' ? { units: (q.options || []).slice(0, 1) } : { choice: 0 } });
                continue;
            }
            const step = CombatTurn.of(st.combat).step;
            if (step === 'retreat') break;
            if (step === 'reinforce-attacker' || step === 'reinforce-defender') {
                FS_RULES.apply(st, step === 'reinforce-attacker' ? 0 : 1, { type: 'combat', action: 'reinforce', count: 0 });
            } else if (step === 'choose-attacker' || step === 'choose-defender') {
                FS_RULES.advanceCombatSteps(st);
            } else if (step === 'damage-attacker' || step === 'damage-defender') {
                const side = step === 'damage-attacker' ? 'attacker' : 'defender';
                FS_RULES.apply(st, side === 'attacker' ? st.combat.attacker : st.combat.defender,
                    { type: 'combat', action: 'damage', targets: FS_RULES.damageCandidates(st, side).map(x => x.id) });
            } else FS_RULES.advanceCombatSteps(st);
        }
        return seen;
    };
    eq(offered('воины', 2), true, 'воин КЛ 0 возвращается планом');
    return eq(offered('монолиты', 2), false, 'Монолит КЛ 2 планом не возвращается');
});

check('Безжалостное наступление', 'старый триггер урона переносится в начало раунда с обеих сторон', () => {
    for (const owner of [0, 1]) for (const accept of [false, true]) {
        let st = owner === 0
            ? battle({ faction: 'некроны', foeFaction: 'империя-тау', units: { 'воины': 2 },
                foeUnits: { 'воины-огня': 2 }, roundEnd: true })
            : battle({ faction: 'империя-тау', foeFaction: 'некроны', units: { 'воины-огня': 2 },
                foeUnits: { 'воины': 2 }, roundEnd: true });
        const card = FS_DATA.events.find(c => c.faction === 'некроны' && c.name === 'Безжалостное наступление');
        FS_RULES.keepEventScheme(st, owner, card);
        eq(st.players[owner].schemes[0].trigger, 'round', 'новый план знает свой момент');
        st.players[owner].schemes[0].trigger = 'damage'; // shape stored by the old parser
        eq(FS_RULES.maybeScheme(st, owner, 'damage', { kind: 'combat', ctx: {} }), false, 'старый план не ждёт удара');
        st = JSON.parse(JSON.stringify(st));
        refuseReinforce(st);
        eq([st.pending?.seat, pending(st)?.options], [owner, ['Безжалостное наступление']], 'план предлагается в начале раунда');
        ok(FS_RULES.apply(st, owner, { type: 'effect', answer: accept ? { choice: 0 } : { no: true } }).ok, 'ответ принят');
        eq(!!st.combat.repeatDamage, accept, 'повтор соответствует ответу');
        eq(st.players[owner].schemes.length, accept ? 0 : 1, 'отказ не тратит план');
        eq(st.pending, null, 'вопрос закрыт');
    }
});

check('Безжалостное наступление', 'сброс плана даёт обоим по дополнительному шагу повреждений', () => {
    const st = battle({ faction: 'некроны', foeFaction: 'имперская-гвардия', units: { 'воины': 2 }, foeUnits: { 'огрины': 2 }, dice: ['att', 'att'], foeDice: ['att', 'att'], noFoeCard: true });
    schemeInPlay(st, 'Безжалостное наступление', 'некроны');
    let used = false;
    let repeated = false;
    for (let i = 0; i < 40 && st.combat; i++) {
        if (st.pending) {
            const q = st.pending.question;
            const seat = st.pending.answerSeat === undefined ? st.pending.seat : st.pending.answerSeat;
            if (q.kind === 'scheme' && !used) used = true;
            FS_RULES.apply(st, seat, { type: 'effect', answer: q.kind === 'scheme' ? { choice: 0 } : (q.kind === 'units' ? { units: (q.options || []).slice(0, 1) } : { choice: 0 }) });
            continue;
        }
        const step = CombatTurn.of(st.combat).step;
        if (st.combat.damageRepeated) repeated = true;
        if (step === 'retreat') break;
        if (step === 'reinforce-attacker' || step === 'reinforce-defender') {
            FS_RULES.apply(st, step === 'reinforce-attacker' ? 0 : 1, { type: 'combat', action: 'reinforce', count: 0 });
        } else if (step === 'choose-attacker') {
            FS_RULES.apply(st, 0, { type: 'combat', action: 'playCard', index: 0 });
        } else if (step === 'choose-defender') {
            FS_RULES.apply(st, 1, { type: 'combat', action: 'playCard', index: 0 });
        } else if (step === 'damage-attacker') {
            FS_RULES.apply(st, 0, { type: 'combat', action: 'damage', targets: FS_RULES.damageCandidates(st, 'attacker').map(x => x.id) });
        } else if (step === 'damage-defender') {
            FS_RULES.apply(st, 1, { type: 'combat', action: 'damage', targets: FS_RULES.damageCandidates(st, 'defender').map(x => x.id) });
        } else FS_RULES.advanceCombatSteps(st);
    }
    eq(used, true, 'план предложен у шага повреждений');
    return eq(repeated, true, 'шаг повреждений выполнен повторно');
});

check('Хрономантия', 'в начале раунда боя: 2 карты из колоды и столько же сбросить', () => {
    const st = battle({ faction: 'некроны', foeFaction: 'имперская-гвардия', units: { 'воины': 2 }, foeUnits: { 'огрины': 2 }, dice: [], noFoeCard: true });
    const hand = () => FS_CARDS.combatHand(FS_RULES, st, 0).size();
    const before = hand();
    // Верх колоды до розыгрыша: карты обязаны прийти ИМЕННО оттуда и лечь в руку.
    const top2 = FS_CARDS.combatDeck(FS_RULES, st, 0).cards().slice(0, 2);
    eq(top2.length, 2, 'в боевой колоде есть две карты');
    // План кладётся до начала боя: его вопрос задаёт сам бой.
    schemeInPlay(st, 'Хрономантия', 'некроны');
    const started = FS_RULES.maybeScheme(st, 0, 'round', { kind: 'combat', ctx: { side: 'attacker' } });
    eq(started, true, 'план предложен в начале раунда');
    eq(st.pending.question.kind, 'scheme', 'вопрос о сбросе карты');
    FS_RULES.apply(st, 0, { type: 'effect', answer: { choice: 0 } });
    // Взяли две и тут же сбросили две — но сбросить можно только то, что взяли:
    // рука выросла на две карты, и это ровно верх колоды.
    const dropped = [];
    for (let i = 0; i < 4 && st.pending; i++) {
        const q = st.pending.question;
        eq(q.kind, 'cards', 'сброс карты с руки');
        const card = (q.options || [])[0];
        dropped.push(card);
        FS_RULES.apply(st, st.pending.seat, { type: 'effect', answer: { cards: [card] } });
    }
    eq(dropped.length, 2, 'сброшены две карты');
    eq(dropped.slice().sort().join('|'), top2.slice().sort().join('|'), 'сброшены именно взятые с верха колоды');
    eq(hand(), before, 'рука та же: взяли 2 и сбросили 2');
    return eq((st.players[0].schemes || []).some(x => x.name === 'Хрономантия'), false, 'план сброшен');
});
check('Смертоукасатели', 'в начале раунда: деморализовать вражеский отряд КЛ 0–1', () => {
    const st = battle({ faction: 'некроны', foeFaction: 'имперская-гвардия', units: { 'воины': 2 }, foeUnits: { 'гвардейцы': 2, 'огрины': 1 }, dice: [], noFoeCard: true });
    schemeInPlay(st, 'Смертоукасатели', 'некроны');
    const started = FS_RULES.maybeScheme(st, 0, 'round', { kind: 'combat', ctx: { side: 'attacker' } });
    eq(started, true, 'план предложен в начале раунда');
    FS_RULES.apply(st, 0, { type: 'effect', answer: { choice: 0 } });
    const q = st.pending.question;
    eq(q.kind, 'units', 'выбор вражеского отряда');
    // Огрины первого уровня тоже годятся, гвардейцы нулевого — тем более;
    // отрядов выше первого в раскладе нет, поэтому проверяем размер выбора.
    eq((q.options || []).length, 3, 'в выборе все три отряда КЛ 0–1');
    FS_RULES.apply(st, st.pending.seat, { type: 'effect', answer: { units: (q.options || []).slice(0, 1) } });
    return eq(foeUnits(st).filter(u => u.routed).length, 1, 'один вражеский отряд деморализован');
});
check('Сфера воскрешения', 'после этапа урона возвращает деморализованный отряд недеморализованным', () => {
    const st = battle({ faction: 'некроны', foeFaction: 'имперская-гвардия', units: { 'воины': 2 }, foeUnits: { 'огрины': 2 }, dice: [], foeDice: ['att', 'att', 'att'], noFoeCard: true });
    schemeInPlay(st, 'Сфера воскрешения', 'некроны');
    let offered = false;
    let back = 0;
    let alive = 0;
    for (let i = 0; i < 40 && st.combat; i++) {
        if (st.pending) {
            const q = st.pending.question;
            const seat = st.pending.answerSeat === undefined ? st.pending.seat : st.pending.answerSeat;
            if (q.op === 'resurrectOffer') {
                offered = true;
                FS_RULES.apply(st, seat, { type: 'effect', answer: { choice: 0 } });
                // Смотрим сразу после возврата: следующий раунд может снова
                // ранить отряд, и проверка читала бы уже другое состояние.
                back = myUnits(st).filter(u => !u.routed).length;
                alive = myUnits(st).length;
                break;
            }
            FS_RULES.apply(st, seat, { type: 'effect', answer: q.kind === 'units' ? { units: (q.options || []).slice(0, 1) } : { choice: 0 } });
            continue;
        }
        const step = CombatTurn.of(st.combat).step;
        if (step === 'retreat') break;
        if (step === 'reinforce-attacker' || step === 'reinforce-defender') {
            FS_RULES.apply(st, step === 'reinforce-attacker' ? 0 : 1, { type: 'combat', action: 'reinforce', count: 0 });
        } else if (step === 'choose-attacker') {
            FS_RULES.apply(st, 0, { type: 'combat', action: 'playCard', index: 0 });
        } else if (step === 'choose-defender') {
            FS_RULES.apply(st, 1, { type: 'combat', action: 'playCard', index: 0 });
        } else if (step === 'damage-attacker') {
            FS_RULES.apply(st, 0, { type: 'combat', action: 'damage', targets: FS_RULES.damageCandidates(st, 'attacker').map(x => x.id) });
        } else if (step === 'damage-defender') {
            FS_RULES.apply(st, 1, { type: 'combat', action: 'damage', targets: FS_RULES.damageCandidates(st, 'defender').map(x => x.id) });
        } else FS_RULES.advanceCombatSteps(st);
    }
    eq(offered, true, 'план предложен после этапа урона');
    eq(alive, 2, 'отряд не потерян');
    return eq(back, 2, 'и вернулся недеморализованным');
});

check('Осколок обманщика', 'верхняя карта колоды отдаёт только свои боевые значения', () => {
    // Колоду нельзя задать заранее: берём ту, что лежит сверху, и сверяем
    // прирост значений с её иконками — текстовая способность карты при этом
    // не звучит (лишних вопросов нет).
    const st = battle({ faction: 'некроны', foeFaction: 'имперская-гвардия', card: 'Осколок обманщика', units: { 'воины': 2 }, foeUnits: { 'гвардейцы': 2 }, dice: [], noFoeCard: true });
    // Колода боя — через правила, а не через поле игрока (его там нет).
    const deck = () => FS_CARDS.combatDeck(FS_RULES, st, 0);
    const top = deck().cards()[0];
    const topIcons = (FS_DATA.combat.find(x => x.name === top) || {}).icons || {};
    const before = FS_RULES.combatValuesParts(st, 'attacker');
    const deckSize = deck().size();
    const drawn = playThrough(st);
    eq(drawn.qs.filter(q => q === 'ability:ability').length >= 1, true, 'способность карты прозвучала');
    eq(deck().size(), deckSize - 1, 'верхняя карта колоды снята');
    const after = FS_RULES.combatValuesParts(st, 'attacker');
    // В счёт идут обе вскрытые карты: сам «Осколок» и снятая с колоды.
    const ownIcons = (FS_DATA.combat.find(x => x.name === 'Осколок обманщика') || {}).icons || {};
    for (const k of ['att', 'def', 'morale']) {
        eq(after[k].total - before[k].total, (topIcons[k] || 0) + (ownIcons[k] || 0),
            'значение ' + k + ' выросло на иконки «Осколка» и «' + top + '»');
    }
    return eq(st.log.some(l => /только её боевые значения/.test(String(l && l.text || l))), true, 'карта не разыграна, только значения');
});

check('Осколок несущего ночь', '3 `att. token` и уничтожение юнита 0-го КЛ', () => {
    const st = battle({ faction: 'некроны', foeFaction: 'имперская-гвардия', card: 'Осколок несущего ночь', units: { 'воины': 2 }, foeUnits: { 'гвардейцы': 2, 'огрины': 1 }, dice: [], noFoeCard: true });
    // «Уничтожьте 1 юнита 0-го командного уровня» — любой отряд на поле,
    // владелец карты выбирает. Отряд 1-го уровня в выборе не участвует.
    // «Уничтожьте 1 юнита 0-го командного уровня» — любого на поле, включая
    // свои: игрок целится во врага.
    const foes = new Set(st.units.filter(u => u.seat === 1).map(u => u.id));
    const k0 = st.units.filter(u => foes.has(u.id) && (FS_RULES.unitOf(st, u) || {}).kl === 0).map(u => u.id);
    // Сам выбор обязан исключать отряды выше названного уровня: не только
    // «первый попавшийся» 0-го КЛ, но и отсутствие 1-го КЛ в списке.
    let options = null;
    playThrough(st, q => {
        if (q.kind !== 'units') return null;
        options = q.options || [];
        return { units: options.filter(id => foes.has(id)).slice(0, 1) };
    });
    ok(Array.isArray(options), 'выбора цели не было');
    eq(options.some(id => (FS_RULES.unitOf(st, st.units.find(u => u.id === id)) || {}).kl > 0), false, 'отряды выше 0-го КЛ в выборе отсутствуют');
    eq(tokens(st, 'attacker').att, 3, 'получены 3 `att. token`');
    eq(st.qs.includes('units:destroy'), true, 'карта выбирает, что уничтожить');
    eq(st.units.filter(u => k0.includes(u.id)).length, k0.length - 1, 'уничтожен отряд противника 0-го командного уровня');
    return eq(st.units.some(u => (FS_RULES.unitOf(st, u) || {}).name === 'Огрины'), true, 'отряд 1-го КЛ на месте');
});

check('Лич гвардия', 'деморализован свой → деморализует противник; 2 `def.` только при уже деморализованном враге', () => {
    // Общая способность: обмен деморализациями. Способность единицы: два
    // жетона обороны, но лишь если у противника УЖЕ есть деморализованный
    // отряд (условие проверяется, а не подразумевается).
    const mine = { 'бессмертные': 2 };
    // По кубику атаки с каждой стороны и без карты защиты: стол боя
    // (жетоны раунда) жив до розыгрыша урона. Лишние кубики в раскладе
    // уводят бой дальше, к уходу и очистке стола.
    const setup2 = o => battle(Object.assign({ faction: 'некроны', foeFaction: 'имперская-гвардия', card: 'Лич гвардия', units: mine, foeUnits: { 'гвардейцы': 2 }, dice: ['att'], foeDice: ['att'], noFoeCard: true }, o));
    const st = setup2({});
    playThrough(st, q => (q.kind === 'units' ? { units: (q.options || []).slice(0, 1) } : null));
    eq(myUnits(st).filter(u => u.routed).length, 1, 'один свой отряд деморализован');
    eq(foeUnits(st).filter(u => u.routed).length, 1, 'и противник деморализует свой — обмен');
    eq(tokens(st, 'attacker').def, 2, 'деморализованный враг есть — способность единицы даёт 2 `def. token`');
    // Способность единицы не звучит без деморализованного отряда противника:
    // свой отряд деморализовать отказываемся, враг остаётся целым.
    const st2 = setup2({});
    playThrough(st2, q => (q.kind === 'ability' ? { no: true } : { choice: 1 }));
    eq(myUnits(st2).filter(u => u.routed).length, 0, 'от обмена отказались — свой отряд цел');
    eq(foeUnits(st2).filter(u => u.routed).length, 0, 'и враг цел');
    return eq(tokens(st2, 'attacker').def, 0, 'без деморализованного врага 2 `def.` не выдают');
});

check('Разрушители', '«потратьте 1 `def.` или 1 `morale cube`, чтобы получить 2 `att. token`»', () => {
    // Платят кубиком боевого духа или обороны, получают жетоны атаки; без
    // подходящего кубика платить нечем.
    const paid = battle({ faction: 'некроны', foeFaction: 'имперская-гвардия', card: 'Разрушители', units: { 'бессмертные': 2 }, foeUnits: { 'гвардейцы': 2 }, dice: ['def', 'att'] });
    playThrough(paid, q => (q.kind === 'dice' ? { dice: (q.options || []).slice(0, 1) } : null));
    eq(count(paid, 'attacker', 'def'), 0, 'кубик обороны потрачен');
    eq(tokens(paid, 'attacker').att, 2, 'и получены 2 `att. token`');
    // Кубик боевого духа тоже годится.
    const viaMorale = battle({ faction: 'некроны', foeFaction: 'имперская-гвардия', card: 'Разрушители', units: { 'бессмертные': 2 }, foeUnits: { 'гвардейцы': 2 }, dice: ['morale'] });
    playThrough(viaMorale, q => (q.kind === 'dice' ? { dice: (q.options || []).slice(0, 1) } : null));
    eq(count(viaMorale, 'attacker', 'morale'), 0, 'кубик боевого духа потрачен');
    eq(tokens(viaMorale, 'attacker').att, 2, 'и жетоны получены');
    // Только кубик атаки: платить нечем, жетонов нет.
    const noPay = battle({ faction: 'некроны', foeFaction: 'имперская-гвардия', card: 'Разрушители', units: { 'бессмертные': 2 }, foeUnits: { 'гвардейцы': 2 }, dice: ['att'] });
    playThrough(noPay, q => (q.kind === 'dice' ? { dice: (q.options || []).slice(0, 1) } : null));
    eq(tokens(noPay, 'attacker').att, 0, 'без подходящего кубика жетонов нет');
    return eq(count(noPay, 'attacker', 'att'), 1, 'и кубик атаки на месте');
});

check('Триархи преторианцы', 'выбор «восстановить отряд ИЛИ бесплатный жетон подкрепления»', () => {
    // Первая ветка: деморализованный отряд встаёт, жетон не тратится.
    const restore = battle({ faction: 'некроны', foeFaction: 'имперская-гвардия', card: 'Триархи преторианцы', units: { 'воины': 1, 'бессмертные': 2 }, foeUnits: { 'гвардейцы': 2 }, dice: [] });
    const mine = myUnits(restore);
    mine[1].routed = true;
    const asset = restore.players[0].assets.reinforcement;
    playThrough(restore, q => (q.kind === 'units' ? { units: (q.options || []).slice(0, 1) } : (q.kind === 'choice' ? { choice: 0 } : null)));
    eq(mine[1].routed, false, 'выбранный отряд восстановлен');
    eq(restore.players[0].assets.reinforcement, asset, 'ветка восстановления не тратит жетонов');
    // Вторая ветка: жетон подкрепления ставится на стол боя бесплатно.
    const place = battle({ faction: 'некроны', foeFaction: 'имперская-гвардия', card: 'Триархи преторианцы', units: { 'воины': 1, 'бессмертные': 2 }, foeUnits: { 'гвардейцы': 2 }, dice: [] });
    myUnits(place)[1].routed = true;
    const asset2 = place.players[0].assets.reinforcement;
    playThrough(place, q => (q.kind === 'choice' ? { choice: 1 } : (q.kind === 'areas' ? { area: q.options[0] } : null)));
    eq(place.players[0].assets.reinforcement, asset2, 'бесплатный жетон не взят из запаса');
    return eq(CombatTokens.of(place.combat).units('attacker').used >= 1, true, 'жетон лёг на стол боя');
});

check('Триархи преторианцы', 'кубик переворачивается на выбранную грань', () => {
    // Третья половина карты: «переверните 1 ваш кубик на любую грань». Вопрос
    // есть — но проверять надо ГРАНЬ, а не факт вопроса.
    const st = battle({ faction: 'некроны', foeFaction: 'имперская-гвардия', card: 'Триархи преторианцы', units: { 'воины': 2 }, foeUnits: { 'гвардейцы': 2 }, dice: ['att', 'def'] });
    let asked = null;
    play(st, 0, 0, (s2, q) => {
        if (q.kind === 'diceFace') { asked = q; return { dice: [(q.options || [])[0]], face: 'morale' }; }
        if (q.kind === 'choice') return { choice: 0 };
        return null;
    });
    ok(!!asked, 'вопроса о грани нет');
    eq(dice(st, 'attacker')[asked.options[0]], 'morale', 'кубик лёг выбранной гранью');
});

check('Воин фланги', 'с Воином в бою карта даёт 1 кубик боевого духа; без него способность не звучит', () => {
    // Способность единицы читается только при реквизите: у некронов базовый
    // отряд называется «Воины», у корабля — «Крейсеры Жнец».
    const withUnit = battle({ faction: 'некроны', foeFaction: 'имперская-гвардия', card: 'Воин фланги', units: { 'воины': 2 }, foeUnits: { 'гвардейцы': 2 }, dice: [] });
    play(withUnit, 0, 0);
    eq(count(withUnit, 'attacker', 'morale'), 1, 'с Воином — один кубик боевого духа');
    eq(count(withUnit, 'attacker', 'att'), 0, 'и ни одного кубика атаки');
    // Без отряда-реквизита способность молчит.
    const without = battle({ faction: 'некроны', foeFaction: 'имперская-гвардия', card: 'Воин фланги', units: { 'бессмертные': 2 }, foeUnits: { 'гвардейцы': 2 }, dice: [] });
    play(without, 0, 0);
    return eq(count(without, 'attacker', 'morale'), 0, 'без Воина кубика нет');
});

check('Атакующие протоколы', '2 `att.` на карте и 1 кубик боевого духа от Воина', () => {
    const st = battle({ faction: 'некроны', foeFaction: 'имперская-гвардия', card: 'Атакующие протоколы', units: { 'воины': 2 }, foeUnits: { 'гвардейцы': 2 }, dice: [] });
    play(st, 0, 0);
    // Иконки карты дают 2 атаки, способность — 1 `morale cube`; считает их
    // боевой счёт, а не жетоны на столе.
    const icons = CombatCards.of(st.combat).icons('attacker');
    eq(icons.att, 2, 'две иконки атаки с карты');
    eq(FS_RULES.combatValues(st, 'attacker').att, 2, 'и они в боевом счёте');
    return eq(count(st, 'attacker', 'morale'), 1, 'и кубик боевого духа от Воина');
});

head('Улучшения приказов', 'некроны');

// --- Транслокационные крипты --------------------------------------------------
// «Во время выполнения этого приказа вы можете рассматривать все ваши города в
//  активной системе как фабрики. Один раз за раунд.»
check('Транслокационные крипты', 'город в активной системе работает как фабрика', () => {
    const deploy = withCard => {
        const st = FS_RULES.newReadyGame({ seed: 5, players: players('некроны', 'имперская-гвардия') });
        st.units = [];
        st.structures = [];
        st.objectives = [];
        st.storms = [];
        for (const sys of st.systems) sys.tokens = [];
        st.phase = 'operations';
        st.turn = 0;
        st.order = null;
        const sys = st.systems[0];
        const pos = worldOf(st, sys.id);
        // Воин на столе: приказ развёртывания не заканчивается сам.
        FS_RULES.addUnit(st, 0, 'воины', sys.id, pos);
        st.structures.push({ id: 'city0', seat: 0, type: 'city', system: sys.id, area: pos });
        st.players[0].materiel = 20;
        st.players[0].upgrades = withCard ? [{ name: 'Транслокационные крипты', used: false, order: 'deploy' }] : [];
        sys.tokens.push({ seat: 0, order: 'deploy', faceUp: false });
        FS_RULES.apply(st, 0, { type: 'resolveOrder', system: sys.id });
        if (withCard) {
            const res = FS_RULES.apply(st, 0, { type: 'useUpgrade', card: 'Транслокационные крипты' });
            ok(res.ok, 'карта не сгорела: ' + res.error);
            eq(st.order.citiesAsFactories, true, 'приказ помнит города-фабрики');
        }
        // Бессмертные КЛ 1: покупаются только с фабрики.
        return FS_RULES.apply(st, 0, { type: 'buyUnit', unit: 'бессмертные', system: sys.id, pos });
    };
    eq(deploy(false).ok, false, 'без карты город фабрикой не считается');
    return ok(deploy(true).ok, 'с картой Бессмертные куплены в мире с городом');
});


check('Набег жнецов', 'выбранный отряд КЛ 0 получает урон первым', () => {
    const faces = ['att', 'def', 'def'];
    return withFixedDice(faces, () => {
        const st = strikeState({
            faction: 'некроны', foeFaction: 'имперская-гвардия',
            ships: { 'крейсеры-жнец': 2 }, holdUnit: 'воины',
            foeUnits: { 'гвардейцы': 2 }, upgrades: ['Набег жнецов'],
        });
        const res = burn(st, 'Набег жнецов');
        ok(res.ok, 'карта не сгорела: ' + res.error);
        fire(st, faces);
        const q = pending(st);
        ok(!!q, 'вопрос о первом уроне не задан');
        eq([q.kind, q.op], ['units', 'strikeFirstPick'], 'спрашивается отряд, который получит урон первым');
        const options = q.options || [];
        ok(options.length === 2, 'на выбор даны оба отряда КЛ 0: ' + options.length);
        // Берём НЕ первый отряд: тогда «первый» нельзя получить случайно.
        const id = options[options.length - 1];
        answerAll(st, (s2, qq) => (qq.op === 'strikeFirstPick' ? { units: [id] } : firstOption(s2, qq)));
        eq(st.order && st.order.strikeFirst, id, 'выбор записан в приказе удара');
        ok(!!st.strike, 'удар не начался после выбора: ' + JSON.stringify(st.order && st.order.phase));
        eq(st.strike && st.strike.first, id, 'урон начинается с выбранного отряда');
        // Второй отряд — не выбранный: его удар обязан отклонить.
        const other = options.find(o => o !== id);
        const wrong = FS_RULES.apply(st, 1, { type: 'strikeDamage', unit: other });
        eq(wrong.ok, false, 'урон нельзя отдать другому отряду: ' + wrong.error);
        // Первый урон — выбранному: гвардеец (здоровье 1) гибнет, второй цел.
        const hit = FS_RULES.apply(st, 1, { type: 'strikeDamage', unit: id });
        ok(hit.ok, 'урон не назначен: ' + hit.error);
        eq(st.units.filter(u => u.seat === 1 && q.options.includes(u.id)).length, 1,
            'первым погиб именно выбранный отряд');
        eq(st.units.some(u => u.id === other), true, 'второй отряд пережил первый урон');
        // Удар был на 2: после первого попадания остаётся одно, и следующий
        // урон обязан уйти второму отряду — он и гибнет.
        if (st.strike && st.strike.left > 0) {
            const second = FS_RULES.apply(st, 1, { type: 'strikeDamage', unit: other });
            ok(second.ok, 'второй урон не принят: ' + second.error);
            eq(st.units.some(u => u.id === other), false, 'удар добил второго гвардейца');
        }
        return eq(st.strike ? st.strike.left : 0, 0, 'попадания удара израсходованы');
    });
});


check('Протоколы реанимации', 'при раскрытии восстанавливает всех своих в активной системе и пехоту в остальных', () => {
    const st = necronOrder('strategize', 'Протоколы реанимации');
    const sys = st.systems[0];
    const far = st.systems[2] || st.systems[1];
    const w = worldOf(st, sys.id);
    const fw = worldOf(st, far.id);
    const here = FS_RULES.addUnit(st, 0, 'воины', sys.id, w); here.routed = true;
    const there = FS_RULES.addUnit(st, 0, 'воины', far.id, fw); there.routed = true;
    // Корабль чужой системы не восстанавливается: карта называет пехоту, а
    // движок знает наземные отряды и корабли.
    const ship = FS_RULES.addUnit(st, 0, 'крейсеры-жнец', far.id, voidOf(st, far.id)); ship.routed = true;
    const used = FS_RULES.apply(st, 0, { type: 'useUpgrade', card: 'Протоколы реанимации' });
    ok(used.ok, 'карта не разыграна: ' + used.error);
    const q = pending(st);
    ok(!!q && q.op === 'restore', 'вопрос о восстановлении не задан');
    const offered = q.options || [];
    ok(offered.includes(here.id) && offered.includes(there.id), 'предложены отряды активной и дальней системы');
    ok(!offered.includes(ship.id), 'корабль в чужой системе не предлагается');
    answerAll(st, (s2, qq) => (qq.op === 'restore' ? { units: qq.options.slice() } : firstOption(s2, qq)));
    return eq([here.routed, there.routed, ship.routed], [false, false, true],
        'пехота восстановлена, корабль остался деморализованным');
});
check('Врата вечности', 'отряд КЛ 0–1 идёт из мира с постройкой в мир активной системы с недеморализованным Монолитом', () => {
    const st = necronOrder('advance', 'Врата вечности');
    const sys = st.systems[0];
    const worlds = sys.areas.filter(a => a.world).map(a => a.pos);
    ok(worlds.length >= 2, 'в активной системе два мира');
    const [withMono, withFactory] = worlds;
    FS_RULES.addUnit(st, 0, 'монолиты', sys.id, withMono);
    FS_RULES.addStructure(st, 0, 'factory', sys.id, withFactory);
    const u = FS_RULES.addUnit(st, 0, 'воины', sys.id, withFactory);
    // КЛ 3 из мира с постройкой не годится: карта называет КЛ 0 или 1.
    const big = FS_RULES.addUnit(st, 0, 'ктан', sys.id, withFactory);
    const used = FS_RULES.apply(st, 0, { type: 'useUpgrade', card: 'Врата вечности' });
    ok(used.ok, 'карта не разыграна: ' + used.error);
    const q = pending(st);
    ok(!!q, 'вопрос об отряде не задан');
    const offered = q.options || [];
    ok(offered.includes(u.id), 'отряд КЛ 0 предложен');
    ok(!offered.includes(big.id), 'отряд КЛ 3 не предложен');
    answerAll(st, (s2, qq) => (qq.op === 'moveUnit'
        ? (qq.kind === 'units' ? { units: [u.id] } : firstOption(s2, qq))
        : firstOption(s2, qq)));
    eq(u.area, withMono, 'отряд встал в мир с Монолитом');
    return eq(u.system, sys.id, 'и остался в активной системе');
});
check('Гибельные косы', 'план: деморализовать до 2 своих — противник теряет жетон подкрепления за каждый', () => {
    const st = eventState('Гибельные косы', { faction: 'некроны' });
    const sys = st.systems[0];
    const w = worldOf(st, sys.id);
    ok(playEvent(st).ok, 'событие не разыграно');
    // Карта с типом «план» остаётся в игровой зоне.
    const plan = (st.players[0].schemes || []).find(x => x.name === 'Гибельные косы');
    ok(!!plan, 'карта не стала планом');
    eq(plan.trigger, 'round', 'план ждёт начала раунда боя');
    // Бой: план предлагается уже на старте.
    st.units = [];
    for (let i = 0; i < 2; i++) FS_RULES.addUnit(st, 0, 'воины', sys.id, w);
    for (let i = 0; i < 2; i++) FS_RULES.addUnit(st, 1, 'гвардейцы', sys.id, w);
    st.phase = 'operations';
    st.turn = 0;
    st.order = { seat: 0, order: 'advance', system: sys.id, pos: w, phase: 'move', moveStep: 'ground', moved: [], steps: [] };
    st.players[1].assets.reinforcement = 2;
    ok(FS_RULES.apply(st, 0, { type: 'endAdvance' }).ok, 'бой начат приказом');
    ok(!!st.combat, 'бой не начался');
    // The attacker passes first; only then may the defender place tokens.
    if (st.combat.step === 'reinforce-attacker')
        ok(FS_RULES.apply(st, 0, { type: 'combat', action: 'reinforce', count: 0 }).ok, 'атакующий без жетонов');
    ok(FS_RULES.apply(st, 1, { type: 'combat', action: 'reinforce', count: 2 }).ok, 'защитник разместил жетоны');
    const q = pending(st);
    ok(!!q && q.kind === 'scheme', 'план не предложен в начале раунда');
    answerAll(st, (s2, qq) => {
        if (qq.kind === 'scheme') return { choice: 0 };
        if (qq.op === 'route') return { units: (qq.options || []).slice(0, 2) };
        return firstOption(s2, qq);
    });
    const routed = st.units.filter(u => u.seat === 0 && u.routed);
    eq(routed.length, 2, 'деморализованы оба названных отряда');
    // «противник уничтожит 1 жетон подкрепления за каждый отряд».
    const lost = ctxLosses(st);
    eq(lost.destroyed, 2, 'противник потерял два жетона подкрепления');
    ok(!(st.players[0].schemes || []).some(x => x.name === 'Гибельные косы'), 'израсходованный план сброшен');
    return eq(lost.alive, 0, 'на столе не осталось живых жетонов');
});
check('Гибельные косы', 'план: деморализовать до 2 своих — противник теряет жетон подкрепления за каждый', () => {
    const st = eventState('Гибельные косы', { faction: 'некроны' });
    const sys = st.systems[0];
    const w = worldOf(st, sys.id);
    ok(playEvent(st).ok, 'событие не разыграно');
    // Карта типа «план» остаётся в игровой зоне, а не уходит в колоду.
    const plan = (st.players[0].schemes || []).find(x => x.name === 'Гибельные косы');
    ok(!!plan, 'карта не стала планом');
    eq(plan.trigger, 'round', 'план ждёт начала раунда боя');
    // Бой: план предлагается уже на старте.
    st.units = [];
    for (let i = 0; i < 2; i++) FS_RULES.addUnit(st, 0, 'воины', sys.id, w);
    for (let i = 0; i < 2; i++) FS_RULES.addUnit(st, 1, 'гвардейцы', sys.id, w);
    st.phase = 'operations';
    st.turn = 0;
    st.order = { seat: 0, order: 'advance', system: sys.id, pos: w, phase: 'move', moveStep: 'ground', moved: [], steps: [] };
    st.players[1].assets.reinforcement = 2;
    ok(FS_RULES.apply(st, 0, { type: 'endAdvance' }).ok, 'бой начат приказом');
    ok(!!st.combat, 'бой не начался');
    if (st.combat.step === 'reinforce-attacker')
        ok(FS_RULES.apply(st, 0, { type: 'combat', action: 'reinforce', count: 0 }).ok, 'атакующий без жетонов');
    ok(FS_RULES.apply(st, 1, { type: 'combat', action: 'reinforce', count: 2 }).ok, 'защитник разместил жетоны');
    const q = pending(st);
    ok(!!q && q.kind === 'scheme', 'план не предложен в начале раунда');
    answerAll(st, (s2, qq) => {
        if (qq.kind === 'scheme') return { choice: 0 };
        if (qq.op === 'route') return { units: (qq.options || []).slice(0, 2) };
        return firstOption(s2, qq);
    });
    eq(st.units.filter(u => u.seat === 0 && u.routed).length, 2, 'деморализованы оба названных отряда');
    eq(ctxLosses(st).destroyed, 2, 'противник потерял два жетона подкрепления');
    ok(!(st.players[0].schemes || []).some(x => x.name === 'Гибельные косы'), 'израсходованный план сброшен');
    return eq(ctxLosses(st).alive, 0, 'на столе не осталось живых жетонов');
});

check('Миры-гробницы', 'доп. бастион покупается только после покупки приказом', () => {
    const st = necronDeploy();
    const early = FS_RULES.apply(st, 0, { type: 'useUpgrade', card: 'Миры-гробницы' });
    return !early.ok && /Сначала купите/.test(early.error || '')
        ? true
        : 'без покупки карта сгорела: ' + JSON.stringify(early);
});
check('Миры-гробницы', 'бастион ставится в дружественный или нейтральный мир активной или соседней системы', () => {
    const st = necronDeploy();
    const sys = st.systems[0];
    FS_RULES.apply(st, 0, { type: 'buyUnit', unit: 'воины', system: sys.id, pos: worldOf(st, sys.id) });
    const used = FS_RULES.apply(st, 0, { type: 'useUpgrade', card: 'Миры-гробницы' });
    ok(used.ok, 'карта не разыграна: ' + used.error);
    const q = pending(st);
    ok(!!q && q.op === 'buyBastionNearby', 'вопрос о мире бастиона не задан');
    const near = new Set([sys.id, ...FS_RULES.neighbors(st, sys.id)]);
    eq((q.options || []).filter(a => !near.has(a.system)).length, 0,
        'предложены только миры активной и соседних систем');
    const before = st.players[0].materiel;
    const target = q.options[0];
    answerAll(st);
    const bas = st.structures.filter(x => x.seat === 0 && x.type === 'bastion');
    eq(bas.length, 1, 'бастион поставлен');
    eq(bas[0].system, target.system, 'именно в выбранный мир');
    return eq(st.players[0].materiel, before - 2, 'бастион оплачен (2 материи)');
});

// ============================================================================
//  02 / 04 / 05 / 06 — Империя Тау: способность, 14 боевых карт, 5 приказов,
//  8 событий и обе редакции «Во имя Высшего Блага»
// ============================================================================
const TAU = 'империя-тау';
const TAU_FOE = 'имперская-гвардия';
const TAU_UNITS = {
    'воины-огня': 2, 'бронекостюмы': 1,
    'танки-рыба-молот': 1, 'бронекостюмы-превосходство': 1,
};
const TAU_FOE_UNITS = { 'гвардейцы': 2, 'огрины': 1 };
const TAU_ALT = '*Превосходство/Хранитель:* ваш противник может потратить 3 `morale cube`. За каждый `morale cube`, который он не может потратить, получите 2 `att. token`.';

/** The whole Tau roster is in the battle: every requisite has its unit. */
function tauBattle(o = {}) {
    return battle(Object.assign({
        faction: TAU, foeFaction: TAU_FOE,
        units: TAU_UNITS, foeUnits: TAU_FOE_UNITS,
    }, o));
}
const tauPlay = (st, policy, seat = 0) => {
    refuseReinforce(st);
    return play(st, seat, 0, policy);
};
const tauStrike = o => strikeState(Object.assign({
    faction: TAU, foeFaction: TAU_FOE,
    ships: { 'крейсеры-защитник': 2 }, holdUnit: 'воины-огня',
}, o));
const tauEvent = (name, o) => eventState(name, Object.assign({
    faction: TAU, foeFaction: TAU_FOE,
}, o || {}));
const stateUnit = (st, id) => st.units.find(u => u.id === id) || null;

/** A dominate order of the Tau; the opponent keeps one token so the check
 *  does not fall into the refresh phase when the ability finishes. */
function tauDominate(o = {}) {
    const st = FS_RULES.newReadyGame({ seed: 5, players: players(TAU, TAU_FOE) });
    st.units = []; st.structures = []; st.objectives = []; st.storms = [];
    for (const sys of st.systems) sys.tokens = [];
    st.phase = 'operations'; st.turn = 0; st.order = null;
    const sys = st.systems[0];
    const pos = worldOf(st, sys.id);
    for (const [id, n] of Object.entries(o.units || {})) {
        for (let i = 0; i < n; i++) FS_RULES.addUnit(st, 0, id, sys.id, pos);
    }
    for (const [id, n] of Object.entries(o.foeUnits || {})) {
        for (let i = 0; i < n; i++) FS_RULES.addUnit(st, 1, id, sys.id, pos);
    }
    for (const type of o.structures || []) {
        st.structures.push({ id: 'tau-str-' + st.structures.length, seat: 0, type, system: sys.id, area: pos });
    }
    sys.tokens.push({ seat: 0, order: 'dominate', faceUp: false });
    st.order = { seat: 0, order: 'dominate', system: sys.id, phase: 'dominate' };
    st.systems[1].tokens.push({ seat: 1, order: 'advance', faceUp: false });
    return st;
}

head('Разбор текстов', TAU);
check('Все карты', '14 боевых, 5 приказов, 8 событий; ни один текст не остался пояснением', () => {
    eq(FS_DATA.combat.filter(c => c.faction === TAU).length, 14, 'боевых карт');
    eq(FS_DATA.orders.filter(c => c.faction === TAU).length, 5, 'улучшений приказов');
    eq(FS_DATA.events.filter(c => c.faction === TAU).length, 8, 'событий');
    const f = FS_DATA.factions.find(x => x.id === TAU);
    const texts = [['ability', 'ability', FS_EFFECTS.abilityFor(f)]];
    for (const c of FS_DATA.combat.filter(x => x.faction === TAU)) {
        texts.push(['combat:' + c.name + ':general', 'combat', c.general]);
        if (c.unit) texts.push(['combat:' + c.name + ':unit', 'combat', c.unit]);
    }
    for (const c of FS_DATA.orders.filter(x => x.faction === TAU)) texts.push(['order:' + c.name, 'order', c.text]);
    for (const c of FS_DATA.events.filter(x => x.faction === TAU)) texts.push(['event:' + c.name, 'event', c.text]);
    texts.push(['combat:Во имя Высшего Блага:unit-alt', 'combat', TAU_ALT]);
    const bad = [];
    for (const [key, kind, raw] of texts) {
        const steps = Array.isArray(raw) ? raw
            : FS_EFFECTS.parse(raw || '', { kind, faction: TAU });
        for (const s of steps) {
            if (s && (s.op === 'note' || s.op === 'manual' || s.manual === true || s.note === true)) {
                bad.push(key + ':' + (s.op || '?'));
            }
        }
    }
    return eq(bad, [], 'неразобранные тексты');
});

head('Боевая колода', TAU);

check('Тактическое отступление', 'отряд отступает, `morale cube` возвращает его, реквизит даёт 2 `def. token`', () => {
    const st = tauBattle({ card: 'Тактическое отступление', dice: ['morale', 'att', 'def'] });
    tauPlay(st);
    eq(tokens(st, 'attacker').def, 2, 'жетонов обороны');
    eq(count(st, 'attacker', 'morale'), 0, 'купленной морали');
    return eq(myUnits(st).filter(u => u.routed).length, 0, 'деморализованных отрядов');
});

check('Стелс-команды', '+1 `def. token`; противник может деморализовать свой отряд', () => {
    const st = tauBattle({ card: 'Стелс-команды' });
    tauPlay(st, branch(0));
    eq(tokens(st, 'attacker').def, 1, 'жетонов обороны');
    return eq(foeUnits(st).filter(u => u.routed).length, 1, 'деморализованных отрядов противника');
});

check('Стелс-команды', 'если противник не деморализует отряд, он теряет 1 `any cube`', () => {
    const st = tauBattle({ card: 'Стелс-команды', foeDice: ['att', 'def', 'morale'] });
    tauPlay(st, branch(1));
    eq(tokens(st, 'attacker').def, 1, 'жетонов обороны');
    return eq(dice(st, 'defender').length, 2, 'кубиков противника');
});

check('Команды следопытов', 'атакующий смотрит, сбрасывает и разыгрывает новую карту из руки', () => {
    const st = tauBattle({
        hand: ['Команды следопытов', 'Стелс-команды'], foeHand: ['Ложись!'],
    });
    tauPlay(st);
    eq(st.combat.peek && st.combat.peek[0], 'Ложись!', 'подсмотренная карта');
    eq(st.combat.cards.defender.played.length, 0, 'карта противника не вскрыта');
    ok(st.combat.cards.attacker.played.some(x => x.name === 'Стелс-команды'), 'новая карта разыграна');
    return ok(st.players[1].decks.combat.includes('Ложись!'), 'карта противника сброшена в колоду');
});

check('Охотничьи стаи круутов', 'меньше отрядов: 1 `def. token`, противник теряет `att. cube`, реквизит даёт кубик', () => withFixedDice(['def'], () => {
    const st = tauBattle({
        card: 'Охотничьи стаи круутов', units: { 'воины-огня': 1 },
        foeUnits: { 'гвардейцы': 2, 'огрины': 1 },
        dice: ['morale'], foeDice: ['att', 'def'],
    });
    tauPlay(st);
    eq([tokens(st, 'attacker').def, tokens(st, 'attacker').att], [1, 0], 'жетоны');
    eq(count(st, 'defender', 'att'), 0, 'кубиков атаки противника');
    return eq(dice(st, 'attacker').length, 2, 'кубиков владельца карты');
}));

check('Охотничьи стаи круутов', 'не меньше отрядов: 1 `att. token`, чужие кубики не трогаются', () => withFixedDice(['att'], () => {
    const st = tauBattle({
        card: 'Охотничьи стаи круутов',
        units: { 'воины-огня': 3 }, foeUnits: { 'гвардейцы': 2 },
        dice: ['def'], foeDice: ['att', 'def'],
    });
    tauPlay(st);
    eq([tokens(st, 'attacker').def, tokens(st, 'attacker').att], [0, 1], 'жетоны');
    return eq(count(st, 'defender', 'att'), 1, 'кубиков атаки противника');
}));

check('Охотничьи стаи круутов', 'подсчёт включает живые модели и жетоны, даже деморализованные', () => {
    for (const tau of [0, 1]) for (const space of [false, true])
        for (const foeToken of ['standing', 'routed', 'destroyed']) for (const routedModel of [false, true]) {
        const foe = 1 - tau, ownSide = tau === 0 ? 'attacker' : 'defender', foeSide = foe === 0 ? 'attacker' : 'defender';
        const factions = tau === 0 ? [TAU, TAU_FOE] : [TAU_FOE, TAU];
        const mine = { [space ? 'крейсеры-защитник' : 'воины-огня']: 1 };
        const theirs = { [space ? 'крейсеры' : 'гвардейцы']: 1 };
        const st = battle({ faction: factions[0], foeFaction: factions[1], kind: space ? 'space' : 'ground',
            units: tau === 0 ? mine : theirs, foeUnits: tau === 1 ? mine : theirs, roundEnd: true });
        st.players[foe].assets.reinforcement = 1;
        for (const seat of [0, 1]) ok(FS_RULES.apply(st, seat, { type: 'combat', action: 'reinforce',
            count: seat === foe ? 1 : 0 }).ok, 'подготовка и призыв');
        CombatTurn.of(st.combat).setDice(ownSide, ['morale']).setDice(foeSide, ['att']);
        if (foeToken !== 'standing') ok(FS_RULES.routeReinforcementToken(st, foeSide, 0), 'чужой жетон перевёрнут');
        if (foeToken === 'destroyed') ok(FS_RULES.destroyReinforcementToken(st, foeSide, 0, true), 'чужой жетон уничтожен');
        if (routedModel) FS_RULES.routeUnit(st, st.units.find(u => u.seat === tau));
        const card = FS_DATA.combat.find(c => c.faction === TAU && c.name === 'Охотничьи стаи круутов');
        FS_RULES.runEffects(st, tau, FS_EFFECTS.parse(card.general, { kind: 'combat', faction: TAU }),
            { kind: 'combat', ctx: { side: ownSide } });
        answerAll(st, firstOption);
        const fewer = foeToken !== 'destroyed';
        eq([tokens(st, ownSide).def, tokens(st, ownSide).att, count(st, foeSide, 'att')],
            fewer ? [1, 0, 0] : [0, 1, 1], 'ветвь зависит от числа живых отрядов, не их состояния');
    }
});

check('Перекрестный огонь', 'в начале шага урона противник теряет 3 `att. token`; реквизит даёт 2 своих', () => {
    const st = tauBattle({ card: 'Перекрестный огонь' });
    tauPlay(st);
    eq(tokens(st, 'attacker').att, 2, 'своих жетонов атаки');
    eq(st.combat.damageStartTokens.length, 1, 'отложенных списаний');
    st.combat.tokens.defender.att = 3;
    FS_RULES.combatDamageFor(st, 'defender');
    eq(tokens(st, 'defender').att, 0, 'жетонов атаки противника');
    FS_RULES.combatDamageFor(st, 'defender');
    return eq(tokens(st, 'defender').att, 0, 'списание не повторяется');
});

check('Превосходство', '2 `att. token`, за два `morale cube` — два кубика; здоровье врага падает до 3', () => {
    const st = tauBattle({ card: 'Превосходство', dice: ['morale', 'morale', 'att'] });
    tauPlay(st, branch(0));
    eq(tokens(st, 'attacker').att, 2, 'жетонов атаки');
    eq(count(st, 'attacker', 'morale'), 0, 'потраченной морали');
    eq(count(st, 'attacker', 'att'), 3, 'кубиков атаки');
    // Предел читаем правилом, а не полем хранения: здоровье отряда противника
    // (печатное 5) должно упасть до 3 — и вернуться после раунда.
    const rules = CombatDamage.of(st.combat);
    eq(rules.health(1, 5), 3, 'предел здоровья врага');
    FS_RULES.endCombatRound(st);
    return eq(CombatDamage.of(st.combat).health(1, 5), 5, 'эффект только одного раунда');
});

check('Перегруппировка', 'за каждые 2 потраченных кубика восстанавливается отряд, реквизит даёт 2 кубика', () => withFixedDice(['att'], () => {
    const st = tauBattle({
        card: 'Перегруппировка', dice: ['att', 'def', 'morale', 'morale'],
        routed: [0, 1],
    });
    tauPlay(st);
    eq(myUnits(st).filter(u => u.routed).length, 0, 'деморализованных отрядов');
    eq(dice(st, 'attacker').length, 2, 'новых кубиков');
    return eq(dice(st, 'attacker').every(d => d === 'att'), true, 'лица новых кубиков');
}));

check('Перегруппировка', 'восстанавливает деморализованный жетон без новой модели или ресурса', () => {
    for (const tau of [0, 1]) for (const space of [false, true]) {
        const ownSide = tau === 0 ? 'attacker' : 'defender', foeSide = tau === 0 ? 'defender' : 'attacker';
        const factions = tau === 0 ? [TAU, TAU_FOE] : [TAU_FOE, TAU];
        const mine = { [space ? 'крейсеры-защитник' : 'воины-огня']: 1 };
        const theirs = { [space ? 'крейсеры' : 'гвардейцы']: 1 };
        let st = battle({ faction: factions[0], foeFaction: factions[1], kind: space ? 'space' : 'ground',
            units: tau === 0 ? mine : theirs, foeUnits: tau === 1 ? mine : theirs, roundEnd: true });
        for (const seat of [0, 1]) st.players[seat].assets.reinforcement = 1;
        for (const seat of [0, 1]) ok(FS_RULES.apply(st, seat, { type: 'combat', action: 'reinforce', count: 1 }).ok, 'призыв');
        CombatTurn.of(st.combat).setDice(ownSide, ['att', 'def']).setDice(foeSide, ['att']);
        ok(FS_RULES.routeReinforcementToken(st, ownSide, 0), 'подкрепление деморализовано');
        const token = 'reinforce-' + ownSide + '-0', supply = st.players[tau].supply.units[Object.keys(mine)[0]];
        const assets = st.players[tau].assets.reinforcement;
        const card = FS_DATA.combat.find(c => c.faction === TAU && c.name === 'Перегруппировка');
        FS_RULES.runEffects(st, tau, FS_EFFECTS.parse(card.general, { kind: 'combat', faction: TAU }),
            { kind: 'combat', ctx: { side: ownSide } });
        eq(pending(st)?.op, 'spendDie', 'предложена плата');
        ok(FS_RULES.apply(st, tau, { type: 'effect', answer: { dice: [0, 1] } }).ok, 'оплачено два кубика');
        eq([pending(st)?.op, pending(st)?.options], ['restore', [token]], 'павший жетон предложен для восстановления');
        const before = JSON.stringify(st);
        eq(FS_RULES.apply(st, tau, { type: 'effect', answer: { units: ['reinforce-' + foeSide + '-0'] } }).ok,
            false, 'чужой жетон не выбран');
        eq(JSON.stringify(st), before, 'недопустимый ответ не закрывает вопрос');
        st = JSON.parse(JSON.stringify(st));
        ok(FS_RULES.apply(st, tau, { type: 'effect', answer: { units: [token] } }).ok, 'выбор после JSON');
        eq([CombatTokens.of(st.combat).alive(ownSide, 0), CombatTokens.of(st.combat).flipped(ownSide).includes(0)],
            [true, false], 'жетон восстановлен');
        eq([st.players[tau].supply.units[Object.keys(mine)[0]], st.players[tau].assets.reinforcement],
            [supply, assets], 'запас и ресурс не меняются');
    }
});

check('Перегруппировка', 'оплаченные пары восстанавливают ровно столько доступных отрядов, включая модель и жетон', () => {
    for (const tau of [0, 1]) for (const space of [false, true]) {
        const ownSide = tau === 0 ? 'attacker' : 'defender', foeSide = tau === 0 ? 'defender' : 'attacker';
        const factions = tau === 0 ? [TAU, TAU_FOE] : [TAU_FOE, TAU];
        const type = space ? 'крейсеры-защитник' : 'воины-огня';
        const mine = { [type]: 2 }, theirs = { [space ? 'крейсеры' : 'гвардейцы']: 2 };
        let st = battle({ faction: factions[0], foeFaction: factions[1], kind: space ? 'space' : 'ground',
            units: tau === 0 ? mine : theirs, foeUnits: tau === 1 ? mine : theirs, roundEnd: true });
        st.players[tau].assets.reinforcement = 1;
        for (const seat of [0, 1]) ok(FS_RULES.apply(st, seat, { type: 'combat', action: 'reinforce', count: seat === tau ? 1 : 0 }).ok, 'призыв');
        CombatTurn.of(st.combat).setDice(ownSide, ['att', 'def', 'morale', 'att']).setDice(foeSide, ['att']);
        const model = st.units.find(u => u.seat === tau), token = 'reinforce-' + ownSide + '-0';
        FS_RULES.routeUnit(st, model);
        ok(FS_RULES.routeReinforcementToken(st, ownSide, 0), 'жетон деморализован');
        const card = FS_DATA.combat.find(c => c.faction === TAU && c.name === 'Перегруппировка');
        FS_RULES.runEffects(st, tau, FS_EFFECTS.parse(card.general, { kind: 'combat', faction: TAU }),
            { kind: 'combat', ctx: { side: ownSide } });
        ok(FS_RULES.apply(st, tau, { type: 'effect', answer: { dice: [0, 1, 2, 3] } }).ok, 'две пары оплачены');
        eq([pending(st)?.op, pending(st)?.n], ['restore', 2], 'за две пары нужно восстановить два отряда');
        const before = JSON.stringify(st);
        eq(FS_RULES.apply(st, tau, { type: 'effect', answer: { units: [token] } }).ok, false, 'частичное исполнение не принято');
        eq(JSON.stringify(st), before, 'частичный ответ не изменил состояние');
        st = JSON.parse(JSON.stringify(st));
        ok(FS_RULES.apply(st, tau, { type: 'effect', answer: { units: [token, model.id] } }).ok, 'оба отряда выбраны после JSON');
        eq([st.units.find(u => u.id === model.id)?.routed, CombatTokens.of(st.combat).flipped(ownSide).includes(0)],
            [false, false], 'модель и жетон восстановлены');
    }
});

check("Монт'ка", 'выбранный вражеский отряд получает урон первым, избыток урона теряется', () => {
    const st = tauBattle({ card: "Монт'ка", dice: ['att', 'def', 'morale'], foeDice: ['def'] });
    tauPlay(st);
    eq(tokens(st, 'attacker').att, 6, 'жетонов атаки: 2 карты + 4 за два кубика');
    const chosen = st.combat.damageFirst[st.combat.damageFirst.length - 1].id;
    const other = foeUnits(st).find(u => u.id !== chosen);
    ok(!!other, 'в бою есть второй вражеский отряд');
    eq(st.combat.ignoreExcess && st.combat.ignoreExcess.id, chosen, 'цель потери избытка');
    st.combat.dice.attacker = Array(8).fill('att');
    st.combat.dice.defender = ['def'];
    const res = FS_RULES.combatDamage(st, st.combat.defender, 'defender', {
        targets: [chosen, other.id],
    });
    ok(res.ok, 'урон не назначен: ' + res.error);
    eq(stateUnit(st, chosen), null, 'выбранный отряд погиб');
    eq(!!stateUnit(st, other.id), true, 'второй отряд не получил избыток');
    return eq(res.applied.length, 1, 'повреждений назначено');
});

check("Монт'ка", 'предпросмотр совпадает с первой целью и потерей избытка, включая режим по единице', () => {
    for (const one of [false, true]) {
        const st = battle({ faction: TAU, foeFaction: 'некроны', units: { 'воины-огня': 2 },
            foeUnits: { 'воины': 2 }, dice: Array(6).fill('att'), foeDice: [], roundEnd: true });
        refuseReinforce(st);
        const c = st.combat, [first, other] = foeUnits(st);
        c.step = 'damage-defender'; c.dice.attacker = Array(6).fill('att'); c.dice.defender = [];
        const rules = CombatDamage.of(c);
        rules.addFirst('defender', first.id, c.round); rules.setExcess('defender', first.id, c.round);
        if (one) rules.setOneByOne();
        const missing = FS_RULES.damagePreview(st, 'defender', [other.id]);
        eq(missing.needsFirst, true, 'без обязательной цели нельзя подтвердить');
        eq(missing.rows.length, 0, 'без обязательной цели предпросмотр не обещает удара');
        const preview = FS_RULES.damagePreview(st, 'defender', [other.id, first.id]);
        eq(preview.rows.map(row => row.id), [first.id], 'первая цель применяется перед остальными');
        eq([preview.left, preview.placed, preview.discarded], one ? [0, 1, 5] : [0, 3, 3], 'учтён потраченный и потерянный урон');
        const result = FS_RULES.apply(st, 1, { type: 'combat', action: 'damage', targets: [other.id, first.id] });
        ok(result.ok, 'урон принят: ' + result.error);
        eq(result.applied.map(row => row.unit), [first.id], 'сервер нанёс урон той же цели');
        eq(!!stateUnit(st, first.id), one, 'предпросмотр гибели совпадает');
        if (one) ok(stateUnit(st, first.id).routed, 'единица деморализует первую цель');
        ok(!!stateUnit(st, other.id) && !stateUnit(st, other.id).routed, 'избыток не затронул другую цель');
    }
});

check("Монт'ка", 'выбранная первой цель покинула бой до урона: оставшимся можно распределить урон', () => {
    const st = battle({ faction: TAU, foeFaction: 'некроны', units: { 'воины-огня': 2 },
        foeUnits: { 'воины': 2 }, dice: ['att'], foeDice: [], roundEnd: true });
    refuseReinforce(st);
    const c = st.combat, [first, other] = foeUnits(st);
    CombatDamage.of(c).addFirst('defender', first.id, c.round);
    CombatDamage.of(c).setExcess('defender', first.id, c.round);
    FS_RULES.destroyUnit(st, first);
    c.step = 'damage-defender'; c.dice.attacker = ['att']; c.dice.defender = [];
    const preview = FS_RULES.damagePreview(st, 'defender', [other.id]);
    eq(!!preview.needsFirst, false, 'несуществующая цель не блокирует предпросмотр');
    const result = FS_RULES.apply(st, 1, { type: 'combat', action: 'damage', targets: [other.id] });
    ok(result.ok, 'оставшемуся отряду можно назначить урон: ' + result.error);
    ok(stateUnit(st, other.id)?.routed, 'оставшийся отряд получил урон');
});

check("Монт'ка", 'бастион противника тоже может быть выбранной целью', () => {
    const st = tauBattle({ card: "Монт'ка", dice: ['att', 'def', 'morale'] });
    st.structures.push({ id: 'foe-bastion', seat: 1, type: 'bastion',
        system: st.combat.system, area: st.combat.pos });
    tauPlay(st, (s, q) => (q.op === 'damageFirst'
        ? { units: [(q.options || [])[(q.options || []).length - 1]] }
        : firstOption(s, q)));
    eq(st.combat.ignoreExcess && st.combat.ignoreExcess.id, 'foe-bastion', 'выбран бастион');
    const other = foeUnits(st)[0];
    st.combat.dice.attacker = Array(8).fill('att');
    st.combat.dice.defender = ['def'];
    const res = FS_RULES.combatDamage(st, st.combat.defender, 'defender', {
        targets: ['foe-bastion', other.id],
    });
    ok(res.ok, 'урон не назначен: ' + res.error);
    eq(st.structures.some(x => x.id === 'foe-bastion'), false, 'бастион уничтожен');
    return eq(!!stateUnit(st, other.id), true, 'отряд за бастионом не пострадал');
});

check("Монт'ка", 'реальная способность выбирает живой жетон, проверяет ответы и теряет избыток', () => {
    const st = tauBattle({ card: "Монт'ка", dice: ['att', 'def', 'morale'] });
    const c = st.combat;
    const rein = CombatTokens.of(c);
    rein.add('defender', 4, true);
    rein.route('defender', 1);
    rein.destroy('defender', 2);
    rein.moveAway('defender', 3);
    const target = 'reinforce-defender-0';
    let asked = false;
    tauPlay(st, (s, q) => {
        if (q.op !== 'damageFirst') return firstOption(s, q);
        asked = true;
        ok(q.options.includes(target), 'живой жетон — отряд, его можно выбрать');
        for (const forbidden of ['reinforce-defender-1', 'reinforce-defender-2', 'reinforce-defender-3'])
            ok(!q.options.includes(forbidden), 'деморализованный, уничтоженный и ушедший жетоны недоступны');
        for (const ids of [[], [myUnits(s)[0].id], ['reinforce-defender-1'], [target, foeUnits(s)[0].id]]) {
            const bad = FS_RULES.apply(s, 0, { type: 'effect', answer: { units: ids } });
            eq(bad.ok, false, 'подмена, пустой или множественный ответ отвергнут');
            eq(s.pending?.question?.op, 'damageFirst', 'вопрос остаётся открытым');
        }
        return { units: [target] };
    });
    ok(asked, 'способность запросила цель');
    eq(c.ignoreExcess?.id, target, 'жетон запомнен как обязательная цель');
    answerAll(st, null, 1); // resolve the defender's real card before assigning hits
    const other = foeUnits(st)[0];
    c.step = 'damage-defender'; c.dice.attacker = Array(8).fill('att'); c.dice.defender = [];
    const preview = FS_RULES.damagePreview(st, 'defender', [other.id, target]);
    eq(preview.rows.map(r => r.id), [target], 'предпросмотр бьёт жетон первым и не переносит избыток');
    const res = FS_RULES.apply(st, 1, { type: 'combat', action: 'damage', targets: [other.id, target] });
    ok(res.ok, 'урон жетону принят: ' + res.error);
    eq(rein.alive('defender', 0), false, 'выбранный жетон уничтожен');
    ok(stateUnit(st, other.id) && !stateUnit(st, other.id).routed, 'пластиковый отряд не получил избыток');
});

check('Кауйон', 'в атаке end-of-round способность не ждёт; 1 `def. token` всё равно приходит', () => {
    const st = tauBattle({ card: 'Кауйон' });
    tauPlay(st);
    eq(tokens(st, 'attacker').def, 1, 'жетонов обороны');
    return eq((st.combat.endRoundPlans || []).length, 0, 'планов конца раунда');
});

check('Кауйон', 'в обороне отряд из соседней области приходит и даёт кубики по боевой силе', () => withFixedDice(['att', 'att'], () => {
    const st = battle({
        faction: TAU_FOE, foeFaction: TAU,
        units: { 'гвардейцы': 2 }, foeUnits: { 'воины-огня': 2 },
        hand: ['Ложись!'], foeHand: ['Кауйон'],
        // Both damage steps stay open: an empty damage step would end the
        // execution round while the card is still being revealed.
        dice: Array(8).fill('att'), foeDice: Array(8).fill('att'), roundEnd: true,
    });
    tauPlay(st, undefined, 1);
    eq(tokens(st, 'defender').def, 1, 'жетонов обороны');
    eq((st.combat.endRoundPlans || []).length, 1, 'план конца раунда');
    const around = FS_RULES.areasAround(st, st.combat.system, st.combat.pos)
        .map(a => ({ area: a, def: FS_RULES.area(FS_RULES.system(st, a.system), a.pos) }))
        .find(x => x.def && x.def.world && !(x.area.system === st.combat.system && x.area.pos === st.combat.pos));
    ok(!!around, 'рядом есть мир');
    const u = FS_RULES.addUnit(st, 1, 'воины-огня', around.area.system, around.area.pos);
    st.combat.dice.defender = [];
    FS_RULES.endCombatRound(st);
    effectAnswer(st, firstOption, 8);
    eq(u.system, st.combat.system, 'система перемещённого отряда');
    eq(u.area, st.combat.pos, 'область перемещённого отряда');
    return eq(dice(st, 'defender').length, 2, 'кубиков по боевой силе Воина Огня');
}));

// «переместить 1 из ваших отрядов … в эту»: the fight is on a world, so a
// cruiser of the next void is not offered — only the ground unit beside it.
check('Кауйон', 'в бой на мире из соседней области приходит только наземный отряд, корабль не предлагается', () => withFixedDice(['att', 'att'], () => {
    const st = battle({
        faction: TAU_FOE, foeFaction: TAU,
        units: { 'гвардейцы': 2 }, foeUnits: { 'воины-огня': 2 },
        hand: ['Ложись!'], foeHand: ['Кауйон'],
        dice: Array(8).fill('att'), foeDice: Array(8).fill('att'), roundEnd: true,
    });
    tauPlay(st, undefined, 1);
    const around = FS_RULES.areasAround(st, st.combat.system, st.combat.pos)
        .map(a => ({ area: a, def: FS_RULES.area(FS_RULES.system(st, a.system), a.pos) }));
    const world = around.find(x => x.def && x.def.world && !(x.area.system === st.combat.system && x.area.pos === st.combat.pos));
    const voidArea = around.find(x => x.def && !x.def.world);
    ok(!!world && !!voidArea, 'рядом есть и мир, и пустота');
    const ground = FS_RULES.addUnit(st, 1, 'воины-огня', world.area.system, world.area.pos);
    const ship = FS_RULES.addUnit(st, 1, 'крейсеры-защитник', voidArea.area.system, voidArea.area.pos);
    st.combat.dice.defender = [];
    FS_RULES.endCombatRound(st);
    const q = pending(st);
    ok(!!q && q.op === 'moveUnitToCombatForDice', 'вопроса о перемещении нет');
    eq(q.options.includes(ship.id), false, 'корабль предложен в наземный бой');
    eq(q.options.includes(ground.id), true, 'наземный отряд не предложен');
    const bad = FS_RULES.apply(st, 1, { type: 'effect', answer: { units: [ship.id] } });
    ok(!bad.ok || ship.system !== st.combat.system || ship.area !== st.combat.pos, 'корабль вошёл в наземный бой');
    return eq(ship.area, voidArea.area.pos, 'корабль остался в пустоте');
}));

check('Во имя Высшего Блага', 'противник обязан перебросить все `att. cube`', () => withFixedDice(['def'], () => {
    const st = tauBattle({ card: 'Во имя Высшего Блага', foeDice: ['att', 'att', 'def'] });
    tauPlay(st);
    eq(count(st, 'defender', 'att'), 0, 'кубиков атаки противника');
    return eq(count(st, 'defender', 'def'), 3, 'кубиков обороны противника');
}));

check('Во имя Высшего Блага', '«должен»: за каждый неоплаченный `morale cube` — 2 `att. token`', () => {
    const st = tauBattle({ card: 'Во имя Высшего Блага', foeDice: ['morale', 'morale', 'def'] });
    tauPlay(st);
    eq(tokens(st, 'attacker').att, 2, 'жетонов атаки за один missing cube');
    return eq(count(st, 'defender', 'morale'), 0, 'оплаченной морали');
});

check('Во имя Высшего Блага (другая редакция)', '«может»: отказ платит 6 `att. token`', () => {
    const st = tauBattle({ foeDice: ['morale', 'morale', 'morale', 'def'] });
    refuseReinforce(st);
    const steps = FS_EFFECTS.parse(TAU_ALT, { kind: 'combat', faction: TAU });
    eq(steps.map(x => x.op), ['foeSpendOrPay'], 'альтернативный текст разобран');
    eq(steps[0].optional, true, 'редакция «может» необязательна');
    FS_RULES.runEffects(st, 0, steps, { kind: 'combat', ctx: { side: 'attacker' } });
    answerAll(st, () => ({ no: true }), 0);
    eq(tokens(st, 'attacker').att, 6, 'жетонов атаки за три неоплаченных кубика');
    return eq(count(st, 'defender', 'morale'), 3, 'кубики не потрачены');
});

check('Во имя Высшего Блага (другая редакция)', 'согласие тратит три `morale cube` и не даёт жетонов', () => {
    const st = tauBattle({ foeDice: ['morale', 'morale', 'morale', 'def'] });
    refuseReinforce(st);
    const steps = FS_EFFECTS.parse(TAU_ALT, { kind: 'combat', faction: TAU });
    FS_RULES.runEffects(st, 0, steps, { kind: 'combat', ctx: { side: 'attacker' } });
    answerAll(st, (s, q) => (q.op === 'foeSpendOrPay' && q.kind === 'yesno'
        ? {} : firstOption(s, q)), 0);
    eq(tokens(st, 'attacker').att, 0, 'жетонов атаки');
    return eq(count(st, 'defender', 'morale'), 0, 'потраченной морали');
});

check('Перестрелка', 'ветка `att. cube`: 1 `def. token`, отложенное списание 3 жетонов', () => {
    const st = tauBattle({ card: 'Перестрелка', foeDice: ['att', 'morale', 'def'] });
    tauPlay(st, branch(0));
    eq(tokens(st, 'attacker').def, 1, 'жетонов обороны');
    eq(count(st, 'defender', 'att'), 0, 'кубиков атаки противника');
    return eq(st.combat.damageStartTokens.length, 1, 'отложенных списаний');
});

check('Перестрелка', 'ветка `morale cube`: противник теряет именно мораль', () => {
    const st = tauBattle({ card: 'Перестрелка', foeDice: ['att', 'morale', 'def'] });
    tauPlay(st, branch(1));
    eq(count(st, 'defender', 'morale'), 0, 'кубиков морали противника');
    return eq(count(st, 'defender', 'att'), 1, 'кубик атаки остался');
});

check('Огонь и продвижение', 'перебрасываются все кубики одного значения; уничтожение заменяется отступлением', () => withFixedDice(['def'], () => {
    const st = tauBattle({ card: 'Огонь и продвижение', dice: ['att', 'att', 'def', 'morale'] });
    tauPlay(st);
    eq(count(st, 'attacker', 'att'), 0, 'кубиков атаки после переброса');
    eq(count(st, 'attacker', 'def'), 3, 'кубиков обороны после переброса');
    ok(!!CombatDamage.of(st.combat).retreatPlan(0, CombatTurn.of(st.combat).round), 'разрешение на отступление');
    st.combat.viaAdvance = true;
    st.combat.dice.attacker = ['def'];
    st.combat.dice.defender = Array(8).fill('att');
    const victim = myUnits(st).find(u => !u.routed && (FS_RULES.unitOf(st, u) || {}).kl === 0);
    ok(!!victim, 'есть отряд КЛ 0');
    const targets = [victim.id, ...FS_RULES.damageCandidates(st, 'attacker').map(x => x.id).filter(id => id !== victim.id)];
    const res = FS_RULES.combatDamage(st, 0, 'attacker', { targets });
    ok(res.ok, 'урон не назначен: ' + res.error);
    eq(res.applied[0] && res.applied[0].retreated, true, 'отряд отступил вместо гибели');
    eq(!!stateUnit(st, victim.id), true, 'отряд остался на поле');
    return eq(stateUnit(st, victim.id).routed, true, 'отряд деморализован');
}));

check('Притворное отступление', 'переброска без отступления: 2 `att. token` приходят в следующем раунде', () => withFixedDice(['att'], () => {
    const st = tauBattle({
        card: 'Притворное отступление',
        dice: ['def', 'def', 'att'], foeDice: ['def', 'def', 'att'],
    });
    tauPlay(st, branch(0));
    eq(count(st, 'attacker', 'att'), 3, 'своих кубиков атаки');
    eq(count(st, 'defender', 'att'), 3, 'кубиков атаки противника');
    eq((st.combat.endRoundNoRetreat || []).length, 1, 'ожидающих жетонов');
    FS_RULES.endCombatRound(st);
    eq(st.combat.round, 2, 'номер раунда');
    return eq(tokens(st, 'attacker').att, 2, 'жетонов в новом раунде');
}));

check('Притворное отступление', 'ветка отступления не даёт жетонов в конце раунда', () => withFixedDice(['att'], () => {
    const st = tauBattle({
        card: 'Притворное отступление',
        dice: ['def', 'def', 'att'], foeDice: ['def', 'def', 'att'],
    });
    st.combat.viaAdvance = true;
    tauPlay(st, branch(1));
    eq(st.combat.retreated && st.combat.retreated[0], st.combat.round, 'отступление записано');
    eq((st.combat.endRoundNoRetreat || []).length, 0, 'ожидающих жетонов');
    FS_RULES.endCombatRound(st);
    return eq(tokens(st, 'attacker').att, 0, 'жетонов атаки');
}));

check('Уклонение', '1 `any cube`; деморализованный отряд КЛ 0 возвращается в конце шага урона', () => withFixedDice(['att'], () => {
    const st = tauBattle({
        card: 'Уклонение',
        dice: Array(7).fill('att'), foeDice: Array(8).fill('att'),
    });
    tauPlay(st);
    // The opponent's own card was revealed too: its optional abilities are
    // answered before the damage step of the round begins.
    answerAll(st, firstOption);
    eq(dice(st, 'attacker').length, 8, 'семь кубиков плюс один полученный');
    eq((st.combat.restoreFallen || []).length, 1, 'план возвращения');
    const warriors = myUnits(st).filter(u => (FS_RULES.unitOf(st, u) || {}).kl === 0);
    ok(warriors.length >= 1, 'есть отряд КЛ 0');
    const victim = warriors[0];
    const before = warriors.length;
    st.combat.dice.attacker = ['att'];
    st.combat.dice.defender = Array(5).fill('att');
    const others = FS_RULES.damageCandidates(st, 'attacker').filter(x => x.id !== victim.id)
        .sort((a, b) => b.health - a.health).map(x => x.id);
    const ownTargets = [victim.id, ...others];
    const incoming = FS_RULES.combatDamageFor(st, 'attacker');
    let res = FS_RULES.apply(st, 0, { type: 'combat', action: 'damage', targets: ownTargets });
    ok(res.ok, 'урон атакующему не назначен: ' + res.error);
    eq(stateUnit(st, victim.id), null, 'отряд выбыл на шаге урона (' + incoming + ', ответ ' + JSON.stringify(res) + ')');
    if (!st.pending && st.combat.step === 'damage-defender') {
        res = FS_RULES.apply(st, 1, { type: 'combat', action: 'damage', targets: FS_RULES.damageCandidates(st, 'defender').map(x => x.id) });
        ok(res.ok, 'урон защитнику не назначен: ' + res.error);
    }
    ok(!!st.pending, 'вопрос о возвращении не задан');
    answerAll(st, firstOption, 0);
    const after = myUnits(st).filter(u => (FS_RULES.unitOf(st, u) || {}).kl === 0
        && u.system === st.combat.system && u.area === st.combat.pos && !u.routed).length;
    return eq(after, before, 'отрядов КЛ 0 вернулось в область боя');
}));

check('Уклонение', 'возвращение падших в каждом из двух шагов урона после плана Некронов', () => withFixedDice(['att'], () => {
    for (const returnFirst of [false, true]) {
        let st = tauBattle({ foeFaction: 'некроны', units: { 'воины-огня': 3 }, foeUnits: { 'воины': 3 },
            card: 'Уклонение', foeCard: 'Воин фланги', dice: ['def'], foeDice: Array(5).fill('att'), roundEnd: true });
        FS_RULES.keepEventScheme(st, 1, FS_DATA.events.find(c => c.faction === 'некроны' && c.name === 'Безжалостное наступление'));
        refuseReinforce(st);
        eq([st.pending?.seat, pending(st)?.options], [1, ['Безжалостное наступление']], 'план Некронов');
        ok(FS_RULES.apply(st, 1, { type: 'effect', answer: { choice: 0 } }).ok, 'включён повтор');
        play(st, 0, 0);
        answerAll(st, firstOption);
        ok((st.combat.restoreFallen || []).length === 1, 'нижняя способность Уклонения разыграна');
        CombatTurn.of(st.combat).setDice('attacker', []).setDice('defender', ['att', 'att']);
        eq(FS_RULES.combatDamageFor(st, 'attacker'), 1, 'один урон по Тау');
        eq(FS_RULES.combatDamageFor(st, 'defender'), 0, 'Некроны защищены');
        const supply = st.players[0].supply.units['воины-огня'];
        const first = FS_RULES.damageCandidates(st, 'attacker')[0].id;
        const firstHit = FS_RULES.apply(st, 0, { type: 'combat', action: 'damage', targets: [first] });
        ok(firstHit.ok, 'первый урон (' + st.combat.step + '): ' + firstHit.error);
        eq([!!st.combat.damageRepeated, pending(st)?.op, pending(st)?.options],
            [false, 'restoreFallenOffer', [first]], 'Уклонение спрашивает в конце первого шага');
        for (const invalid of [[first, first], ['not-offered']]) {
            eq(FS_RULES.apply(st, 0, { type: 'effect', answer: { units: invalid } }).ok, false,
                'чужая или повторная цель возвращения отклонена');
            eq(pending(st)?.op, 'restoreFallenOffer', 'вопрос не закрыт недопустимым ответом');
        }
        st = JSON.parse(JSON.stringify(st));
        ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { units: returnFirst ? [first] : [] } }).ok, 'возвращение или отказ после JSON');
        eq(st.players[0].supply.units['воины-огня'], supply + (returnFirst ? 0 : 1), 'возвращённая модель не остаётся в запасе');
        eq([st.pending, !!st.combat.damageRepeated, st.combat.step], [null, true, 'damage-attacker'], 'затем дополнительный шаг');
        const second = FS_RULES.damageCandidates(st, 'attacker').find(u => u.id !== first).id;
        ok(FS_RULES.apply(st, 0, { type: 'combat', action: 'damage', targets: [second] }).ok, 'второй урон');
        eq([pending(st)?.op, pending(st)?.options], ['restoreFallenOffer', [second]],
            'во втором шаге предлагается только новый павший отряд');
        st = JSON.parse(JSON.stringify(st));
        ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { units: [second] } }).ok, 'новый отряд возвращён после JSON');
        eq(st.players[0].supply.units['воины-огня'], supply + (returnFirst ? 0 : 1), 'второе возвращение тоже забрало модель из запаса');
        ok(!st.pending && (!st.combat || st.combat.round > 1 || st.combat.step === 'retreat'), 'раунд завершён');
        eq(st.units.filter(u => u.seat === 0 && u.unit === 'воины-огня').length, returnFirst ? 3 : 2,
            'возвращены только выбранные отряды');
    }
}));

check('Уклонение', 'павший жетон подкрепления КЛ 0 возвращается как жетон, а не пластиковая модель', () => withFixedDice(['att'], () => {
    for (const tau of [0, 1]) for (const nonlethal of [false, true]) for (const accept of [false, true]) {
        const factions = tau === 0 ? [TAU, 'некроны'] : ['некроны', TAU];
        const tauSide = tau === 0 ? 'attacker' : 'defender';
        let st = battle({ faction: factions[0], foeFaction: factions[1],
            units: { [tau === 0 ? 'воины-огня' : 'воины']: 3 },
            foeUnits: { [tau === 1 ? 'воины-огня' : 'воины']: 3 },
            hand: [tau === 0 ? 'Уклонение' : 'Воин фланги'],
            foeHand: [tau === 1 ? 'Уклонение' : 'Воин фланги'],
            dice: tau === 0 ? ['def'] : Array(5).fill('att'),
            foeDice: tau === 1 ? ['def'] : Array(5).fill('att'), roundEnd: true });
        const asset = st.players[tau].assets.reinforcement;
        const supply = st.players[tau].supply.units['воины-огня'];
        for (const seat of [0, 1]) ok(FS_RULES.apply(st, seat,
            { type: 'combat', action: 'reinforce', count: seat === tau ? 1 : 0 }).ok, 'подкрепления');
        play(st, tau, 0);
        answerAll(st, firstOption);
        ok((st.combat.restoreFallen || []).length === 1, 'сыграна способность отряда');
        CombatTurn.of(st.combat).setDice(tauSide, []).setDice(tau === 0 ? 'defender' : 'attacker', ['att', 'att']);
        if (nonlethal) CombatDamage.of(st.combat).addHealthBonus(tau, 1);
        eq(FS_RULES.combatDamageFor(st, tauSide), 1, 'один урон по Тау');
        const id = 'reinforce-' + tauSide + '-0';
        const hit = FS_RULES.apply(st, tau, { type: 'combat', action: 'damage', targets: [id] });
        ok(hit.ok, 'урон жетону: ' + hit.error);
        eq([pending(st)?.op, pending(st)?.options], ['restoreFallenOffer', [id]], 'павший жетон предложен в конце шага');
        eq([CombatTokens.of(st.combat).units(tauSide).routed, CombatTokens.of(st.combat).units(tauSide).destroyed],
            nonlethal ? [1, 0] : [0, 1], 'жетон деморализован или уничтожен');
        st = JSON.parse(JSON.stringify(st));
        ok(FS_RULES.apply(st, tau, { type: 'effect', answer: { units: accept ? [id] : [] } }).ok, 'ответ после JSON');
        const token = CombatTokens.of(st.combat).units(tauSide);
        eq([token.used, token.routed, token.destroyed, token.alive],
            accept ? [1, 0, 0, 1] : (nonlethal ? [1, 1, 0, 0] : [1, 0, 1, 0]), 'выбранный жетон возвращён лицом вверх');
        eq(st.players[tau].assets.reinforcement, asset - 1, 'потраченный жетон не возвращён игроку');
        eq(st.players[tau].supply.units['воины-огня'], supply, 'пластиковые модели не созданы и не израсходованы');
    }
}));

check('Конец раунда боя', 'здоровье, запрет деморализации и выбранная цель не протекают в следующий раунд', () => {
    const st = tauBattle({ dice: Array(8).fill('att'), foeDice: Array(8).fill('att'), roundEnd: true });
    // Ставим эффекты раунда тем самым органом, которым их ставит карта, — иначе
    // проверка закрепляла бы внутреннюю форму хранения, а не правило.
    const c = CombatDamage.of(st.combat);
    c.addHealthBonus(0, 2);
    c.setEnemyHealth(0, 3);
    c.setNoRoute(0, 0, 1);
    c.addFirst('defender', 'old-target', 1);
    c.setRetreatPlan(0, 1);
    c.setExcess('defender', 'old-target', 1);
    FS_RULES.endCombatRound(st);
    eq(st.combat.round, 2, 'номер нового раунда');
    return eq([c.healthBonus, c.enemyHealth, c.noRoute,
        st.combat.damageFirst, c.retreatPlan(0, 1), st.combat.ignoreExcess],
        [0, 0, null, null, null, null], 'эффекты одного раунда сброшены');
});

head('Особенность фракции', TAU);

check('Адаптивная тактика', 'в системе без своих сил способность не тянет карты', () => {
    const st = tauDominate();
    const p = st.players[0];
    p.decks.event = ['Автономные дроны', 'Саботаж', 'Быстрый ответ', 'Критический удар'];
    p.eventHand = [];
    const res = FS_RULES.apply(st, 0, { type: 'finishDominate' });
    ok(res.ok, 'приказ не закончен: ' + res.error);
    eq(!!st.pending, false, 'вопросов нет');
    eq(st.order, null, 'приказ завершён');
    eq(p.eventHand.length, 0, 'карты не тянулись');
    return eq(p.decks.event.length, 4, 'колода не тронута');
});

check('Адаптивная тактика', '4 карты, тактика разыгрывается и все 4 возвращаются в колоду', () => {
    const st = tauDominate({ units: { 'воины-огня': 1 }, foeUnits: { 'гвардейцы': 1 } });
    const p = st.players[0];
    p.decks.event = ['Автономные дроны', 'Саботаж', 'Быстрый ответ', 'Эвакуация'];
    p.eventHand = []; p.schemes = [];
    FS_RULES.apply(st, 0, { type: 'finishDominate' });
    eq(p.eventHand.length, 4, 'вытянуто четыре карты');
    effectAnswer(st, (s, q) => (q.op === 'playEvent'
        ? { card: 'Автономные дроны' } : firstOption(s, q)), 12);
    eq(p.eventHand.length, 0, 'рука пуста');
    eq(p.decks.event.length, 4, 'все карты вернулись в колоду');
    eq(p.schemes.length, 0, 'тактика не осталась планом');
    eq(st.order, null, 'приказ завершён');
    return eq(foeUnits(st).filter(u => u.routed).length, 1, 'вражеский отряд деморализован');
});

check('Адаптивная тактика', 'Быстрый ответ завершает вложенное продвижение до возврата карт и конца доминирования', () => {
    let st = tauDominate({ units: { 'воины-огня': 1 } });
    st.systems[1].tokens.push({ seat: 1, order: 'deploy', faceUp: false });
    const initial = ['Автономные дроны', 'Саботаж', 'Быстрый ответ', 'Эвакуация'];
    st.players[0].decks.event = initial.slice();
    st.players[0].eventDeckInitialized = true;
    st.players[0].eventHand = [];
    const originalSystem = st.order.system;
    ok(FS_RULES.apply(st, 0, { type: 'finishDominate' }).ok, 'способность доминирования начата');
    eq(pending(st).op, 'playEvent', 'вытянуты четыре карты');
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { card: 'Быстрый ответ' } }).ok, 'тактика выбрана');
    eq(pending(st).op, 'chooseSystem', 'тактика спрашивает систему');
    st = JSON.parse(JSON.stringify(st));
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { system: originalSystem } }).ok, 'система выбрана');
    eq([st.phase, st.order.order, st.order.fromEvent], ['operations', 'advance', true], 'создан вложенный приказ');
    eq(st.quickResponseSnapshot.order.order, 'dominate', 'прерванное доминирование сохранено');
    eq(st.players[0].decks.event, [], 'карты ещё не возвращены до конца тактики');
    eq(st.pending, null, 'ожидается выполнение продвижения');
    st = JSON.parse(JSON.stringify(st));
    ok(FS_RULES.apply(st, 0, { type: 'endAdvance' }).ok, 'шаг кораблей завершён');
    ok(FS_RULES.apply(st, 0, { type: 'endAdvance' }).ok, 'продвижение завершено');
    eq([st.phase, st.turn, st.order, st.pending], ['operations', 1, null, null], 'доминирование завершено, ход передан');
    eq(st.players[0].decks.event.slice().sort(), initial.slice().sort(), 'четыре карты вернулись после тактики');
    eq(st.players[0].eventDiscard, [], 'отложенных карт больше нет');
    eq(st.quickResponseSnapshot, undefined, 'продолжение удалено');
});

check('Адаптивная тактика', 'отказ от вложенного Быстрого ответа возвращает карты и заканчивает доминирование', () => {
    let st = tauDominate({ units: { 'воины-огня': 1 } });
    st.systems[1].tokens.push({ seat: 1, order: 'deploy', faceUp: false });
    const initial = ['Автономные дроны', 'Саботаж', 'Быстрый ответ', 'Эвакуация'];
    st.players[0].decks.event = initial.slice();
    st.players[0].eventDeckInitialized = true;
    ok(FS_RULES.apply(st, 0, { type: 'finishDominate' }).ok, 'способность начата');
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { card: 'Быстрый ответ' } }).ok, 'тактика выбрана');
    eq(pending(st).op, 'chooseSystem', 'предложена система');
    st = JSON.parse(JSON.stringify(st));
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { no: true } }).ok, 'отказ принят');
    eq([st.phase, st.turn, st.order, st.pending], ['operations', 1, null, null], 'доминирование завершено и ход передан');
    eq(st.players[0].decks.event.slice().sort(), initial.slice().sort(), 'все четыре карты возвращены');
    eq([st.quickResponsePending, st.quickResponseSnapshot], [undefined, undefined], 'ложного продолжения продвижения нет');
});

check('Адаптивная тактика', 'вложенный Быстрый ответ без систем не удерживает событие или приказ', () => {
    let st = tauDominate({ units: { 'воины-огня': 1 } });
    const initial = ['Автономные дроны', 'Саботаж', 'Быстрый ответ', 'Эвакуация'];
    st.players[0].decks.event = initial.slice();
    st.players[0].eventDeckInitialized = true;
    ok(FS_RULES.apply(st, 0, { type: 'finishDominate' }).ok, 'способность начата');
    // An empty board is a defensive legacy-state case, not a legal normal setup.
    st.systems = [];
    st = JSON.parse(JSON.stringify(st));
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { card: 'Быстрый ответ' } }).ok, 'тактика разрешена');
    // The last order immediately starts refresh, which reveals a new top card.
    const returned = st.players[0].decks.event.concat(st.event && st.event.seat === 0 && st.event.top ? [st.event.top] : []);
    eq(returned.sort(), initial.slice().sort(), 'все четыре карты возвращены до нового события');
    eq([st.pending, st.order, st.quickResponsePending, st.quickResponseSnapshot],
        [null, null, undefined, undefined], 'вложенного приказа и ожидающих вопросов нет');
});

check('Адаптивная тактика', 'выбранный план остаётся в игре, невыбранные карты возвращаются', () => {
    const st = tauDominate({ units: { 'воины-огня': 1 } });
    const p = st.players[0];
    p.decks.event = ['Критический удар', 'Саботаж', 'Быстрый ответ', 'Эвакуация'];
    p.eventHand = []; p.schemes = [];
    FS_RULES.apply(st, 0, { type: 'finishDominate' });
    effectAnswer(st, (s, q) => (q.op === 'playEvent'
        ? { card: 'Критический удар' } : firstOption(s, q)), 12);
    eq(p.schemes.map(x => x.name), ['Критический удар'], 'план в игре');
    eq(p.schemes[0].trigger, 'damage', 'триггер плана');
    eq(p.decks.event.length, 3, 'три невыбранные карты вернулись');
    return eq(st.order, null, 'приказ завершён');
});

head('Улучшения приказов', TAU);

check('Союзники Гуэ\'веса', 'один КЛ0 отряд за 1 материю без фабрики и лимита развёртывания', () => {
    const st = orderState('deploy', {
        faction: TAU, foeFaction: TAU_FOE,
        units: { 'воины-огня': 1 }, materiel: 2,
        upgrades: ["Союзники Гуэ'веса"],
    });
    st.systems[1].tokens.push({ seat: 1, order: 'advance', faceUp: false });
    const res = burn(st, "Союзники Гуэ'веса");
    ok(res.ok, 'карта не сгорела: ' + res.error);
    eq(st.order.cheapUnitOnly, true, 'приказ ждёт дешёвый отряд');
    const sys = st.order.system, pos = worldOf(st, sys);
    const buy = FS_RULES.apply(st, 0, { type: 'buyUnit', unit: 'воины-огня', system: sys, pos });
    ok(buy.ok, 'отряд не куплен: ' + buy.error);
    eq(st.order.purchases[0].cost, 1, 'цена отряда');
    eq(st.order.cheapUnitUsed, true, 'разрешение на дешёвый отряд потрачено');
    const again = FS_RULES.apply(st, 0, { type: 'buyUnit', unit: 'воины-огня', system: sys, pos });
    eq(again.ok, false, 'второй отряд не покупается');
    const done = FS_RULES.apply(st, 0, { type: 'finishDeploy' });
    ok(done.ok, 'приказ не закончен: ' + done.error);
    return eq(st.players[0].materiel, 1, 'потрачена ровно 1 материя');
});

check('Союзники Гуэ\'веса', 'КЛ1 отряд не размещается за 1 материю', () => {
    const st = orderState('deploy', {
        faction: TAU, foeFaction: TAU_FOE,
        units: { 'воины-огня': 1 }, materiel: 2,
        upgrades: ["Союзники Гуэ'веса"],
    });
    burn(st, "Союзники Гуэ'веса");
    const res = FS_RULES.apply(st, 0, {
        type: 'buyUnit', unit: 'бронекостюмы',
        system: st.order.system, pos: worldOf(st, st.order.system),
    });
    return eq(res.ok, false, 'КЛ1 не размещается без фабрики');
});

check('Учения Тау\'вы', 'только использованные жетоны игровой зоны уходят на колоду событий', () => {
    const st = orderState('strategize', {
        faction: TAU, foeFaction: TAU_FOE, upgrades: ["Учения Тау'вы"],
    });
    const p = st.players[0];
    p.placedTokens = 4;
    st.systems[1].tokens.push({ seat: 0, order: 'advance', faceUp: false });
    eq(FS_RULES.usedOrderTokens(st, 0), 3, 'три жетона в игровой зоне');
    const res = burn(st, "Учения Тау'вы");
    ok(res.ok, 'карта не сгорела: ' + res.error);
    eq(p.eventTokens, 3, 'жетонов на колоде событий');
    return eq(p.upgrades[0].used, true, 'карта использована');
});

check('Устройство наведения', 'бастион не защищает, +1 кубик удара добавляет попадание', () => withFixedDice(['att', 'att', 'att'], () => {
    const faces = ['att', 'att', 'att'];
    const st = tauStrike({
        foeStructures: ['bastion'], foeUnits: { 'гвардейцы': 2 },
        upgrades: ['Устройство наведения'],
    });
    const res = burn(st, 'Устройство наведения');
    ok(res.ok, 'карта не сгорела: ' + res.error);
    eq(st.order.ignoreBastion, true, 'бастионы игнорируются');
    eq(st.order.strikeDice, ['att'], 'дополнительный кубик удара');
    ok(FS_RULES.orbitalStrikeTargets(st, 0).some(t => t.pos === st.strikeWorld), 'мир с бастионом доступен');
    fire(st, faces);
    return eq(st.strike && st.strike.hits, 4, 'три попадания кубиков + одно карты');
}));

check('Точные удары', '+1 кубик, оплата одного кубика и выбор любого вражеского отряда первым', () => withFixedDice(['att', 'att', 'att'], () => {
    const faces = ['att', 'att', 'att'];
    const st = tauStrike({
        foeUnits: { 'гвардейцы': 1, 'огрины': 1 },
        upgrades: ['Точные удары'],
    });
    const res = burn(st, 'Точные удары');
    ok(res.ok, 'карта не сгорела: ' + res.error);
    eq(st.order.strikePays.length, 1, 'одна оплата удара');
    eq(st.order.strikePays[0].reward, { first: true, maxKl: null }, 'награда — первый урон без limits КЛ');
    fire(st, faces);
    // resumeStrike() asks the second question after the first effect chain has
    // already reported `done`; answerAll() keeps going while state.pending lives.
    const policy = (s, q) => {
        if (q.op === 'strikePayPick' && q.kind === 'choice') return { choice: 1 };
        if (q.op === 'strikePayPick' && q.kind === 'dice') return { dice: q.options.slice(0, q.n) };
        if (q.op === 'strikeFirstPick') return { units: [(q.options || [])[0]] };
        return firstOption(s, q);
    };
    effectAnswer(st, policy, 12);
    answerAll(st, policy, 0, 12);
    eq(st.order.strikePaid, 1, 'потрачен один кубик');
    ok(!!st.order.strikeFirst, 'отряд выбран');
    eq(st.strike && st.strike.first, st.order.strikeFirst, 'выбор попал в удар');
    return eq(st.order.strikePlanned, null, 'удар продолжен');
}));

check('Мобилизированные охотники', 'дополнительный приказ: один КЛ0/1 отряд, один раунд боя', () => {
    const st = orderState('advance', {
        faction: TAU, foeFaction: TAU_FOE,
        units: { 'воины-огня': 1, 'бронекостюмы': 1, 'бронекостюмы-превосходство': 1 },
        upgrades: ['Мобилизированные охотники'],
    });
    burn(st, 'Мобилизированные охотники');
    effectAnswer(st, {}, 4);
    ok(st.preAdvanceMain, 'основной приказ сохранён');
    eq(st.order.preAdvance, true, 'дополнительный приказ начат');
    eq([st.order.moveLimit, st.order.maxKl, st.order.combatRounds], [1, 1, 1], 'ограничения приказа');
    FS_RULES.apply(st, 0, { type: 'endAdvance' });
    const movable = FS_RULES.movableUnits(st, 0)
        .map(u => (FS_RULES.unitOf(st, u) || {}).kl);
    ok(movable.length >= 1, 'есть доступные отряды');
    return eq(movable.every(kl => kl <= 1), true, 'КЛ3 отряд исключён');
});

check('Мобилизированные охотники', 'реальный бой длится один раунд и возвращает основной приказ с исключённым отрядом', () => withFixedDice(['def'], () => {
    let st = orderState('advance', { faction: TAU, foeFaction: TAU_FOE,
        units: { 'воины-огня': 2 }, upgrades: ['Мобилизированные охотники'] });
    const sys = st.order.system, source = myUnits(st)[0].area;
    const target = FS_RULES.areasAround(st, sys, source).find(a => a.system === sys && FS_RULES.area(FS_RULES.system(st, sys), a.pos).world);
    ok(target, 'есть соседний мир');
    const defender = FS_RULES.addUnit(st, 1, 'гвардейцы', sys, target.pos);
    const actor = myUnits(st)[0].id, other = myUnits(st)[1].id;
    st.players[0].assets.reinforcement = 0; st.players[1].assets.reinforcement = 0;
    ok(burn(st, 'Мобилизированные охотники').ok, 'улучшение применено');
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { yes: true } }).ok, 'дополнительный приказ принят');
    ok(FS_RULES.apply(st, 0, { type: 'endAdvance' }).ok, 'шаг кораблей закончен');
    const move = { type: 'moveUnits', moves: [{ unit: actor, system: sys, pos: target.pos }] };
    ok(FS_RULES.apply(st, 0, move).ok, 'один отряд вошёл в мир защитника');
    eq(FS_RULES.apply(st, 0, { type: 'moveUnits', moves: [{ unit: other, system: sys, pos: target.pos }] }).ok,
        false, 'второй отряд в дополнительном приказе запрещён');
    st = JSON.parse(JSON.stringify(st));
    ok(FS_RULES.apply(st, 0, { type: 'undoMove' }).ok, 'перемещение отменено после JSON');
    ok(FS_RULES.apply(st, 0, move).ok, 'отряд повторно вошёл');
    ok(FS_RULES.apply(st, 0, { type: 'endAdvance' }).ok, 'начат бой');
    eq([st.combat?.round, st.combat?.maxRounds, st.combat?.attacker, st.combat?.defender], [1, 1, 0, 1], 'бой ограничен одним раундом');
    // Two cards in each hand make an accidental second round observable.
    st.combat.cards.attacker.hand = ['Стелс-команды', 'Стелс-команды'];
    st.combat.cards.defender.hand = ['Ложись!', 'Ложись!'];
    for (let i = 0; i < 40 && st.combat && st.combat.step !== 'retreat'; i++) {
        const c = st.combat;
        if (st.pending) {
            const q = pending(st), seat = st.pending.answerSeat ?? st.pending.seat;
            const answer = q.kind === 'ability' ? { no: true } : firstOption(st, q);
            ok(FS_RULES.apply(st, seat, { type: 'effect', answer }).ok, 'ответ на способность');
        } else if (c.step.startsWith('choose-')) {
            const side = c.step.slice('choose-'.length);
            ok(FS_RULES.apply(st, c[side], { type: 'combat', action: 'playCard', index: 0 }).ok, 'настоящая карта вскрыта');
        } else if (c.step.startsWith('damage-')) {
            const side = c.step.slice('damage-'.length);
            const seat = CombatHooks.of(c).assignSeat(c[side]);
            ok(FS_RULES.apply(st, seat, { type: 'combat', action: 'damage', targets: FS_RULES.damageCandidates(st, side).map(x => x.id) }).ok, 'урон распределён');
        } else FS_RULES.advanceCombatSteps(st);
        if (st.combat) eq(st.combat.round, 1, 'второго раунда нет');
    }
    ok(st.combat && st.combat.step === 'retreat', 'бой дошёл до разрешения с живым проигравшим');
    ok(st.units.some(u => u.id === defender.id) && st.units.some(u => u.id === actor), 'одного раунда достаточно для разрешения даже с двумя выжившими');
    st = JSON.parse(JSON.stringify(st));
    const loser = st.combat.loser, targets = FS_RULES.retreatTargets(st, loser);
    ok(FS_RULES.apply(st, loser, { type: 'combat', action: 'retreat', target: targets[0] }).ok, 'отступление после JSON');
    eq([st.combat, st.preAdvanceMain, st.order?.preAdvanceDone, st.order?.excludedUnit], [null, undefined, true, actor], 'основной приказ восстановлен и отряд исключён');
    ok(FS_RULES.apply(st, 0, { type: 'endAdvance' }).ok, 'основной приказ перешёл к наземным войскам');
    eq(FS_RULES.movableUnits(st, 0).some(u => u.id === actor), false, 'использованный отряд не предлагается');
    ok(FS_RULES.movableUnits(st, 0).some(u => u.id === other), 'другой отряд может участвовать');
}));

head('Карты событий', TAU);

check('Автономные дроны', 'только враг КЛ≤2 в системе с вашим отрядом может быть деморализован', () => {
    const st = tauEvent('Автономные дроны', {
        units: { 'воины-огня': 1 },
        foeUnits: { 'гвардейцы': 1, 'титаны': 1 },
    });
    const res = playEvent(st);
    ok(res.ok, 'карта не сыграна: ' + res.error);
    let options = null;
    effectAnswer(st, (s, q) => {
        if (q.op === 'route') options = (q.options || []).slice();
        return firstOption(s, q);
    }, 8);
    eq((options || []).length, 1, 'только один подходящий вражеский отряд');
    return eq(foeUnits(st).filter(u => u.routed).length, 1, 'деморализован один отряд');
});

check('Военный совет', 'план восстанавливает все деморализованные отряды одной системы', () => {
    const st = tauEvent('Военный совет', { units: { 'воины-огня': 1 } });
    playEvent(st);
    eq(st.players[0].schemes.map(x => x.name), ['Военный совет'], 'план в игре');
    const sysA = st.systems[0], sysB = st.systems[1];
    const a = FS_RULES.addUnit(st, 0, 'воины-огня', sysA.id, worldOf(st, sysA.id));
    const b = FS_RULES.addUnit(st, 0, 'воины-огня', sysB.id, worldOf(st, sysB.id));
    a.routed = true; b.routed = true;
    FS_RULES.maybeScheme(st, 0, 'operations', { kind: 'order', ctx: null });
    effectAnswer(st, (s, q) => (q.kind === 'systems'
        ? { system: sysA.id } : firstOption(s, q)), 8);
    eq(a.routed, false, 'отряды выбранной системы восстановлены');
    eq(b.routed, true, 'отряд другой системы остался деморализован');
    return eq(st.players[0].schemes.length, 0, 'план сброшен');
});

check('Все планы Тау', 'новый план оставляет не больше двух планов в игре', () => {
    const st = tauEvent('Критический удар', {});
    st.players[0].schemes = ['A', 'B', 'C'].map(name => ({
        name, trigger: 'operations', steps: [{ op: 'note', text: name }],
        note: false, defer: false,
    }));
    const res = playEvent(st);
    ok(res.ok, 'карта не сыграна: ' + res.error);
    return eq(st.players[0].schemes.map(x => x.name), ['A', 'Критический удар'], 'старый план и новый');
});

check('Саботаж', 'свой отряд и вражеская постройка одной системы уничтожаются', () => {
    const st = tauEvent('Саботаж', { units: { 'воины-огня': 1 } });
    st.structures.push({ id: 'foe-factory', seat: 1, type: 'factory',
        system: st.sys, area: st.pos });
    const res = playEvent(st);
    ok(res.ok, 'карта не сыграна: ' + res.error);
    effectAnswer(st, firstOption, 8);
    eq(st.units.length, 0, 'свой отряд уничтожен');
    return eq(st.structures.length, 0, 'вражеская постройка уничтожена');
});

check('Саботаж', 'выборы проверяются сервером: только свой стоящий отряд и чужая постройка в той же системе', () => {
    let st = tauEvent('Саботаж', { units: { 'воины-огня': 2 }, foeUnits: { 'гвардейцы': 1 } });
    const [sacrifice, routed] = myUnits(st), foe = foeUnits(st)[0];
    routed.routed = true;
    const sys = FS_RULES.system(st, st.sys), other = st.systems.find(s => s.id !== sys.id);
    const ownBuilding = { id: 'sabotage-own', seat: 0, type: 'city', system: sys.id, area: st.pos };
    const target = { id: 'sabotage-target', seat: 1, type: 'factory', system: sys.id,
        area: sys.areas.find(a => a.world && a.pos !== st.pos).pos };
    foe.area = target.area;
    const distant = { id: 'sabotage-distant', seat: 1, type: 'bastion', system: other.id, area: worldOf(st, other.id) };
    const emptySystem = st.systems.find(s => s.id !== sys.id && s.id !== other.id);
    const noTarget = FS_RULES.addUnit(st, 0, 'воины-огня', emptySystem.id, worldOf(st, emptySystem.id));
    st.structures.push(ownBuilding, target, distant);
    ok(playEvent(st).ok, 'событие сыграно');
    eq([pending(st).kind, pending(st).op], ['units', 'sabotage'], 'сначала выбор отряда');
    ok(pending(st).options.includes(sacrifice.id), 'стоящий свой отряд предложен');
    ok(!pending(st).options.includes(routed.id) && !pending(st).options.includes(foe.id)
        && !pending(st).options.includes(noTarget.id), 'деморализованный, чужой и отряд без цели не предложены');
    for (const ids of [[], [routed.id], [foe.id], [noTarget.id], [sacrifice.id, sacrifice.id]]) {
        eq(FS_RULES.apply(st, 0, { type: 'effect', answer: { units: ids } }).ok, false, 'поддельная жертва отвергнута');
        eq([pending(st).kind, st.units.length, st.structures.length], ['units', 4, 3], 'ответ не уничтожает и не закрывает выбор');
    }
    eq(FS_RULES.apply(st, 1, { type: 'effect', answer: { units: [sacrifice.id] } }).ok, false, 'другой игрок не отвечает');
    st = JSON.parse(JSON.stringify(st));
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { units: [sacrifice.id] } }).ok, 'законная жертва выбрана после JSON');
    eq([pending(st).kind, pending(st).options], ['structures', [target.id]], 'только вражеская постройка этой системы');
    for (const id of [ownBuilding.id, distant.id, 'not-a-building']) {
        eq(FS_RULES.apply(st, 0, { type: 'effect', answer: { structure: id } }).ok, false, 'поддельная постройка отвергнута');
        eq(st.units.length, 4, 'до законного выбора жертва не уничтожена');
    }
    eq(FS_RULES.apply(st, 0, { type: 'effect', answer: { id: target.id } }).ok, false, 'чужой формат ответа не закрывает выбор');
    // Artificially stale state: even an offered target cannot be destroyed for
    // free if the previously chosen unit is no longer an eligible sacrifice.
    const stale = JSON.parse(JSON.stringify(st));
    stale.units.find(u => u.id === sacrifice.id).routed = true;
    eq(FS_RULES.apply(stale, 0, { type: 'effect', answer: { structure: target.id } }).ok, false, 'устаревшая жертва отклонена');
    ok(stale.structures.some(x => x.id === target.id) && pending(stale).kind === 'structures', 'цель и вопрос сохранены');
    st = JSON.parse(JSON.stringify(st));
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { structure: target.id, units: [foe.id] } }).ok, 'выбрана цель после JSON');
    ok(!st.units.some(u => u.id === sacrifice.id) && st.units.some(u => u.id === foe.id), 'уничтожен ранее выбранный свой, а не подменённый чужой отряд');
    ok(!st.structures.some(x => x.id === target.id) && st.structures.some(x => x.id === ownBuilding.id)
        && st.structures.some(x => x.id === distant.id), 'уничтожена только выбранная постройка');
    eq(st.pending, null, 'событие завершено');
});

check('Саботаж', 'без подходящей пары отряда и вражеской постройки событие не уничтожает фигуры', () => {
    for (const scenario of ['no-unit', 'routed', 'no-enemy-structure', 'different-system']) {
        let st = tauEvent('Саботаж', { units: scenario === 'no-unit' ? {} : { 'воины-огня': 1 } });
        if (scenario === 'routed') st.units[0].routed = true;
        if (scenario !== 'no-enemy-structure') {
            const sys = scenario === 'different-system' ? st.systems.find(s => s.id !== st.sys) : FS_RULES.system(st, st.sys);
            st.structures.push({ id: 'no-pair', seat: 1, type: 'factory', system: sys.id, area: worldOf(st, sys.id) });
        }
        const before = JSON.stringify([st.units, st.structures]);
        st = JSON.parse(JSON.stringify(st));
        ok(playEvent(st).ok, 'событие разыграно: ' + scenario);
        eq(st.pending, null, 'нет возможной пары: ' + scenario);
        eq(JSON.stringify([st.units, st.structures]), before, 'отряд и постройка не уничтожены: ' + scenario);
    }
});

check('Быстрый ответ', 'событие приостанавливает фазу, создаёт ограниченное продвижение и возвращается в неё', () => {
    const st = tauEvent('Быстрый ответ', { units: { 'воины-огня': 1 } });
    st.turn = 1;
    st.systems[0].tokens.push({ seat: 0, order: 'advance', faceUp: false });
    const sys = FS_RULES.system(st, st.sys);
    const worlds = sys.areas.filter(a => a.world && a.pos !== st.pos);
    ok(worlds.length >= 2, 'в системе есть два других мира');
    const dest = worlds[0], enemyDest = worlds[1];
    st.structures.push({ id: 'foe-qr', seat: 1, type: 'factory', system: st.sys, area: enemyDest.pos });
    const res = playEvent(st);
    ok(res.ok, 'карта не сыграна: ' + res.error);
    eq(st.quickResponsePending, true, 'фаза событий ждёт выбора системы');
    eq(st.event, null, 'карта следующего игрока ещё не вытянута');
    effectAnswer(st, (s, q) => (q.kind === 'systems'
        ? { system: st.sys } : firstOption(s, q)), 6);
    eq(st.quickResponsePending, false, 'ожидание снято началом приказа');
    eq(st.order.quickResponse, true, 'ограниченное продвижение');
    eq(st.order.fromEvent, true, 'приказ born from event');
    eq(st.order.seat, 0, 'приказ принадлежит игроку события');
    eq(st.phase, 'operations', 'фаза действий');
    eq(st.systems[0].tokens.length, 1, 'жетон приказа не снят');
    const u = st.units.find(x => x.seat === 0);
    ok(!!u, 'отряд на поле');
    eq(FS_RULES.moveAllowed(st, 0, u, { system: st.sys, pos: enemyDest.pos }).ok, false,
        'вражеская область недоступна');
    eq(FS_RULES.moveAllowed(st, 0, u, { system: st.sys, pos: dest.pos }).ok, true,
        'неконтролируемая область доступна');
    let adv = FS_RULES.apply(st, 0, { type: 'endAdvance' });
    ok(adv.ok, 'шаг кораблей не закончен: ' + adv.error);
    const routes = st.order.route[u.id] || [];
    ok(routes.some(a => a.system === st.sys && a.pos === dest.pos), 'замороженный маршрут ведёт в свой мир');
    eq(routes.some(a => a.system === st.sys && a.pos === enemyDest.pos), false,
        'замороженный маршрут не ведёт во вражеский мир');
    const move = FS_RULES.apply(st, 0, { type: 'moveUnits',
        moves: [{ unit: u.id, system: st.sys, pos: dest.pos }] });
    ok(move.ok, 'отряд не перемещён: ' + move.error);
    eq(u.area, dest.pos, 'отряд в дружественной/неконтролируемой области');
    adv = FS_RULES.apply(st, 0, { type: 'endAdvance' });
    ok(adv.ok, 'ограниченный приказ не закончен: ' + adv.error);
    eq(st.order, null, 'временный приказ убран');
    eq(st.phase, 'refresh', 'фаза событий восстановлена');
    eq(st.quickResponseSnapshot, undefined, 'снимок фазы удалён');
    eq(st.event && st.event.seat, 1, 'событие следующего игрока наступило');
    return eq(st.eventsLeft, 1, 'осталось одно событие');
});

check('Быстрый ответ', 'продвижение и выбор избытка завершаются до следующего события, включая JSON', () => {
    let st = tauEvent('Быстрый ответ', { units: { 'воины-огня': 1 } });
    const sys = FS_RULES.system(st, st.sys);
    const destination = FS_RULES.areasAround(st, st.sys, st.pos)
        .map(a => FS_RULES.area(sys, a.pos)).find(a => a && a.world);
    ok(!!destination, 'есть соседний мир');
    const cap = FS_RULES.capacity(st, st.sys, destination.pos);
    for (let i = 0; i < cap; i++) FS_RULES.addUnit(st, 0, 'воины-огня', st.sys, destination.pos);
    const other = st.systems.find(x => x.id !== st.sys);
    FS_RULES.addUnit(st, 1, groundUnitOf(st, 1), other.id, worldOf(st, other.id));
    const moving = st.units.find(u => u.seat === 0 && u.area === st.pos);
    st.turn = 1;
    ok(playEvent(st).ok, 'тактика сыграна');
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { system: st.sys } }).ok, 'система выбрана');
    ok(FS_RULES.apply(st, 0, { type: 'endAdvance' }).ok, 'шаг кораблей завершён');
    ok(FS_RULES.apply(st, 0, { type: 'moveUnits', moves: [{ unit: moving.id, system: st.sys, pos: destination.pos }] }).ok,
        'отряд перемещён сверх вместимости');
    ok(FS_RULES.apply(st, 0, { type: 'endAdvance' }).ok, 'продвижение завершено');
    eq([st.quickResponseTrimPending, FS_RULES.trimQueue(st).blocked(0)], [true, true], 'сначала выбирается избыток');
    eq(st.event, null, 'карта следующего игрока пока не вытянута');
    ok(st.quickResponseSnapshot && st.quickResponseSnapshot.continuation, 'продолжение сохранено');
    eq(FS_RULES.apply(st, 1, { type: 'nextPhase' }).ok, false, 'другой игрок тоже ждёт выбора');
    st = JSON.parse(JSON.stringify(st));
    const remove = st.units.find(u => u.seat === 0 && u.system === st.sys && u.area === destination.pos);
    ok(FS_RULES.apply(st, 0, { type: 'trimUnit', system: st.sys, pos: destination.pos, unit: remove.id }).ok,
        'лишний отряд выбран после сохранения');
    eq([st.phase, st.event.seat, st.quickResponseTrimPending], ['refresh', 1, undefined], 'следующее событие началось после выбора');
    eq(st.quickResponseSnapshot, undefined, 'продолжение использовано');
    ok(st.players[0].decks.event.includes('Быстрый ответ'), 'карта вернулась после продвижения');
});

check('Быстрый ответ', 'отказ от выбора системы не задерживает фазу событий', () => {
    const st = tauEvent('Быстрый ответ', { units: { 'воины-огня': 1 } });
    st.turn = 1;
    const res = playEvent(st);
    ok(res.ok, 'карта не сыграна: ' + res.error);
    // «Ждёт ли событие» спрашиваем у правила, а не у поля: движок хранит это
    // флагом и вправе его удалять — проверка обязана держать правило.
    const qr = ctx.QuickResponse.of(st);
    eq(qr.pending, true, 'фаза событий ждёт выбора системы');
    effectAnswer(st, { no: true }, 6);
    eq(qr.pending, false, 'ожидание снято');
    eq(qr.snapshot, null, 'снимок удалён');
    eq(st.order, null, 'ограниченный приказ не начался');
    eq(st.phase, 'refresh', 'фаза событий продолжена');
    eq(st.event && st.event.seat, 1, 'событие следующего игрока наступило');
    return eq(st.eventsLeft, 1, 'осталось одно событие');
});

check('Философия войны', 'план меняет пару боевых карт на пару улучшений того же КЛ', () => {
    const st = tauBattle({});
    refuseReinforce(st);
    const p = st.players[0];
    p.decks.combat = ['Стелс-команды', 'Стелс-команды'];
    p.decks.upgradeCombat = ['Кауйон'];
    schemeInPlay(st, 'Философия войны', TAU);
    FS_RULES.maybeScheme(st, 0, 'combat-start', { kind: 'combat', ctx: { side: 'attacker' } });
    effectAnswer(st, firstOption, 12);
    eq(p.decks.combat.filter(n => n === 'Кауйон').length, 2, 'две карты улучшения в колоде');
    eq(p.decks.combat.filter(n => n === 'Стелс-команды').length, 0, 'пара удалена');
    eq(p.decks.upgradeCombat.includes('Кауйон'), false, 'пара снята с колоды улучшений');
    return eq(p.schemes.length, 0, 'план сброшен');
});

// Unlike the old synthetic check above, these plans are present BEFORE the
// actual Advance resolves its contested world. Preparation has not drawn cards.
function keepTauPlan(st, seat, name) {
    const card = FS_DATA.events.find(c => c.faction === TAU && c.name === name);
    ok(card, 'нет плана Тау «' + name + '»');
    FS_RULES.keepEventScheme(st, seat, card);
}
function startTauPlanBattle(st) {
    ok(FS_RULES.apply(st, 0, { type: 'endAdvance' }).ok, 'закончено движение кораблей');
    ok(FS_RULES.apply(st, 0, { type: 'endAdvance' }).ok, 'бой начался после наземного движения');
    ok(st.combat, 'спорный мир вызвал настоящий бой');
}

check('Философия войны', 'реальный бой: несколько пар, меньший КЛ, проверка ответа и замена до добора', () => {
    let st = orderState('advance', { faction: TAU, foeFaction: TAU_FOE,
        units: { 'воины-огня': 2 }, foeUnits: { 'гвардейцы': 1 } });
    const p = st.players[0];
    const pairNames = ['Перегруппировка', 'Огонь и продвижение', 'Стелс-команды', 'Команды следопытов', 'Тактическое отступление'];
    p.decks.combat = pairNames.flatMap(name => [name, name]);
    p.decks.upgradeCombat = ["Монт'ка", 'Кауйон', 'Превосходство', 'Охотничьи стаи круутов'];
    keepTauPlan(st, 0, 'Философия войны');
    const shuffle = FS_RULES.shuffle;
    FS_RULES.shuffle = (state, cards) => cards.slice().reverse();
    try {
        startTauPlanBattle(st);
        eq([st.pending && st.pending.seat, pending(st) && pending(st).kind], [0, 'scheme'], 'план предложен атакующему');
        eq([st.combat.cards.attacker.hand.length, st.players[0].decks.combat.length], [0, 10], 'план до раздачи пяти карт');
        ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { choice: 0 } }).ok, 'план сброшен');
        eq(pending(st).op, 'swapCombatCards', 'выбираются пары из всей боевой колоды');
        const chosen = ['Перегруппировка', 'Огонь и продвижение'];
        for (const name of chosen) ok(pending(st).options.includes(name), 'пара доступна: ' + name);
        eq(FS_RULES.apply(st, 0, { type: 'effect', answer: { cards: [chosen[0], chosen[0]] } }).ok,
            false, 'нельзя выбрать одну пару дважды');
        ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { cards: chosen } }).ok, 'две пары выбраны');
        eq(pending(st).op, 'swapCombatPair', 'первая замена');
        ok(pending(st).options.includes('Кауйон'), 'разрешён КЛ 0 вместо КЛ 2');
        ok(pending(st).options.includes('Охотничьи стаи круутов'), 'возвращённая базовая пара в колоде улучшений доступна');
        ok(!pending(st).options.includes('Превосходство'), 'КЛ 3 вместо КЛ 2 запрещён');
        eq(FS_RULES.apply(st, 0, { type: 'effect', answer: { card: 'Превосходство' } }).ok,
            false, 'поддельный выбор КЛ 3 отклонён');
        eq(pending(st).op, 'swapCombatPair', 'вопрос сохранён после неверного ответа');
        st = JSON.parse(JSON.stringify(st));
        ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { card: 'Кауйон' } }).ok, 'первый обмен после JSON');
        eq(pending(st).op, 'swapCombatPair', 'вторая замена не потеряна');
        ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { card: 'Охотничьи стаи круутов' } }).ok, 'вторая замена');
        eq(st.pending, null, 'вопросы плана завершены');
        const all = st.players[0].decks.combat.concat(st.combat.cards.attacker.hand);
        eq([all.length, all.filter(n => n === 'Кауйон').length,
            all.filter(n => n === 'Охотничьи стаи круутов').length], [10, 2, 2], 'обе пары заменены без потери карт');
        eq(all.filter(n => chosen.includes(n)).length, 0, 'обе старые пары выведены');
        ok(chosen.every(n => st.players[0].decks.upgradeCombat.includes(n)), 'старые пары возвращены в стопку улучшений');
        eq(st.combat.cards.attacker.hand.length, 5, 'после замены выданы пять карт');
        ok(st.combat.cards.attacker.hand.includes('Охотничьи стаи круутов'), 'новые карты участвуют в доборе этого боя');
        ok(!st.players[0].schemes.some(s => s.name === 'Философия войны'), 'план сброшен');
    } finally { FS_RULES.shuffle = shuffle; }
});

check('Перерезать линии снабжения', 'защитник применяет оба плана начала боя, запрет подкреплений не задерживает ход', () => {
    let st = orderState('advance', { faction: TAU_FOE, foeFaction: TAU,
        units: { 'гвардейцы': 2 }, foeUnits: { 'воины-огня': 2 } });
    const guard = FS_DATA.events.find(c => c.faction === TAU_FOE && c.name === 'Ракета «Death Strike»');
    FS_RULES.keepEventScheme(st, 0, guard);
    keepTauPlan(st, 1, 'Философия войны');
    keepTauPlan(st, 1, 'Перерезать линии снабжения');
    st.players[0].assets.reinforcement = 2;
    st.players[1].assets.reinforcement = 2;
    startTauPlanBattle(st);
    eq([st.pending.seat, pending(st).kind], [0, 'scheme'], 'сначала план атакующего');
    ok(pending(st).options.includes('Ракета «Death Strike»'), 'атакующему предложена ракета');
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { no: true } }).ok, 'атакующий отказался');
    eq([st.pending.seat, pending(st).kind], [1, 'scheme'], 'затем планы защищающегося');
    let idx = pending(st).options.indexOf('Перерезать линии снабжения');
    ok(idx >= 0, 'план защитника предложен');
    st = JSON.parse(JSON.stringify(st));
    eq(FS_RULES.apply(st, 0, { type: 'effect', answer: { choice: idx } }).ok, false, 'чужой ответ отвергнут');
    ok(FS_RULES.apply(st, 1, { type: 'effect', answer: { choice: idx } }).ok, 'запрет принят после JSON');
    eq(st.combat.noReinforceSeat, 0, 'подкрепления запрещены атакующему');
    eq([st.pending.seat, pending(st).kind], [1, 'scheme'], 'второй план защитника предложен в том же окне');
    idx = pending(st).options.indexOf('Философия войны');
    ok(idx >= 0, 'философия остаётся доступной');
    ok(FS_RULES.apply(st, 1, { type: 'effect', answer: { choice: idx } }).ok, 'второй план принят');
    eq(pending(st).op, 'swapCombatCards', 'предложена замена пары до раздачи');
    ok(FS_RULES.apply(st, 1, { type: 'effect', answer: { cards: [] } }).ok, 'можно не менять ни одной пары');
    eq(st.pending, null, 'оба плана разрешены');
    eq(st.combat.cards.defender.hand.length, 5, 'защите розданы карты');
    eq(FS_RULES.maxReinforce(st, 0, 'attacker'), 0, 'атакующему не предлагаются жетоны');
    if (st.combat.step === 'reinforce-attacker') {
        ok(FS_RULES.apply(st, 0, { type: 'combat', action: 'reinforce', count: 0 }).ok,
            'запрещённая сторона может пропустить шаг');
    }
    eq(st.combat.step, 'reinforce-defender', 'ход подкреплений у защитника');
    ok(FS_RULES.apply(st, 1, { type: 'combat', action: 'reinforce', count: 1 }).ok, 'защита может призвать подкрепление');
    eq([st.combat.reinforce.attacker, st.combat.reinforce.defender], [0, 1], 'запрет применён только к противнику');
    ok(st.combat.step.startsWith('choose-'), 'бой продолжается выбором карты');
    ok(st.players[0].schemes.some(s => s.name === 'Ракета «Death Strike»'), 'отклонённая ракета остаётся в игре');
    eq(st.players[1].schemes.length, 0, 'оба плана защитника сброшены');
});

check('Эвакуация', 'своя постройка бесплатно переезжает в другой дружественный мир', () => {
    const st = tauEvent('Эвакуация', { structures: ['factory'] });
    const sys = FS_RULES.system(st, st.sys);
    const other = sys.areas.find(a => a.world && a.pos !== st.pos);
    ok(!!other, 'есть другой мир');
    FS_RULES.addUnit(st, 0, 'воины-огня', st.sys, other.pos);
    const sourceId = st.structures[0].id;
    const res = playEvent(st);
    ok(res.ok, 'карта не сыграна: ' + res.error);
    effectAnswer(st, firstOption, 12);
    eq(st.structures.length, 1, 'одна постройка');
    eq(st.structures[0].id === sourceId, false, 'старая постройка убрана');
    eq(st.structures[0].area, other.pos, 'новая постройка в другом мире');
    return eq(st.structures[0].seat, 0, 'постройка осталась своей');
});

check('Эвакуация', 'запрещённые постройки, типы и миры отклоняются; новая постройка не обязана совпадать со старой', () => {
    let st = tauEvent('Эвакуация', { structures: ['factory'], materiel: 7 });
    const source = st.structures[0], sys = FS_RULES.system(st, st.sys);
    const same = sys.areas.find(a => a.world && a.pos !== source.area);
    const occupied = sys.areas.find(a => a.world && a.pos !== source.area && a.pos !== same.pos);
    const nearId = FS_RULES.neighbors(st, sys.id)[0], near = FS_RULES.system(st, nearId);
    const nearWorlds = near.areas.filter(a => a.world), dest = nearWorlds[0], enemyWorld = nearWorlds[1];
    const far = st.systems.find(s => s.id !== sys.id && !FS_RULES.neighbors(st, sys.id).includes(s.id) && s.areas.some(a => a.world));
    const farPos = worldOf(st, far.id), voidPos = sys.areas.find(a => !a.world).pos;
    FS_RULES.addUnit(st, 0, 'воины-огня', sys.id, same.pos);
    FS_RULES.addUnit(st, 0, 'воины-огня', near.id, dest.pos);
    FS_RULES.addUnit(st, 0, 'воины-огня', far.id, farPos);
    FS_RULES.addUnit(st, 1, 'гвардейцы', near.id, enemyWorld.pos);
    st.structures.push({ id: 'evac-occupied', seat: 0, type: 'city', system: sys.id, area: occupied.pos });
    st.structures.push({ id: 'evac-foe', seat: 1, type: 'factory', system: near.id, area: enemyWorld.pos });
    const edge = ['N', 'E', 'S', 'W'].find(side => FS_RULES.across(st, sys.id, side) === near.id);
    st.storms.push({ id: 'evac-storm', system: sys.id, side: edge, moved: false });
    ok(playEvent(st).ok, 'событие сыграно');
    eq([pending(st).op, pending(st).kind], ['evacuate', 'structures'], 'сначала выбор постройки');
    ok(!pending(st).options.includes('evac-foe'), 'чужую постройку не предлагают');
    eq(FS_RULES.apply(st, 0, { type: 'effect', answer: { structure: 'evac-foe' } }).ok, false, 'чужая постройка отклонена');
    eq(st.structures.length, 3, 'недопустимый ответ не платит цену');
    st = JSON.parse(JSON.stringify(st));
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { structure: source.id } }).ok, 'своя фабрика уничтожена');
    eq([pending(st).kind, pending(st).options], ['types', ['factory', 'city', 'bastion']], 'можно выбрать тип новой постройки');
    eq(FS_RULES.apply(st, 0, { type: 'effect', answer: { type: 'поддельный тип' } }).ok, false, 'неизвестный тип отклонён');
    st = JSON.parse(JSON.stringify(st));
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { type: 'bastion' } }).ok, 'выбран другой тип');
    const opts = pending(st).options, has = (system, pos) => opts.some(a => a.system === system && a.pos === pos);
    ok(has(sys.id, same.pos) && has(near.id, dest.pos), 'другой дружественный мир в той же и соседней системе, даже за штормом');
    ok(!has(sys.id, source.area) && !has(sys.id, occupied.pos) && !has(near.id, enemyWorld.pos)
        && !has(far.id, farPos) && !has(sys.id, voidPos), 'исходный, занятый, чужой, дальний мир и пустота исключены');
    for (const area of [{ system: sys.id, pos: source.area }, { system: sys.id, pos: occupied.pos },
        { system: near.id, pos: enemyWorld.pos }, { system: far.id, pos: farPos }, { system: sys.id, pos: voidPos }]) {
        eq(FS_RULES.apply(st, 0, { type: 'effect', answer: { area } }).ok, false, 'недопустимое место отклонено');
        eq(st.structures.length, 2, 'постройка не создана недопустимым ответом');
    }
    const stale = JSON.parse(JSON.stringify(st));
    FS_RULES.addUnit(stale, 1, 'гвардейцы', near.id, dest.pos);
    eq(FS_RULES.apply(stale, 0, { type: 'effect', answer: { area: { system: near.id, pos: dest.pos } } }).ok,
        false, 'устаревший мир, ставший спорным, отклонён');
    eq([stale.structures.length, pending(stale).kind], [2, 'areas'], 'устаревшее место не создаёт постройку и не закрывает вопрос');
    st = JSON.parse(JSON.stringify(st));
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { area: { system: near.id, pos: dest.pos }, type: 'city' } }).ok,
        'допустимое место принято после JSON');
    const made = st.structures.find(x => x.seat === 0 && x.system === near.id && x.area === dest.pos);
    eq([made?.type, st.players[0].materiel, st.pending], ['bastion', 7, null], 'бесплатный бастион выбранного типа, без подмены');
    ok(!st.structures.some(x => x.id === source.id), 'фабрика осталась уничтоженной');
});

check('Эвакуация', 'не предлагает исчерпанный тип, а разрушенная постройка возвращается в общий запас', () => {
    let st = tauEvent('Эвакуация', { structures: ['factory'] });
    const source = st.structures[0], sys = FS_RULES.system(st, st.sys);
    const destination = sys.areas.find(a => a.world && a.pos !== source.area);
    FS_RULES.addUnit(st, 0, 'воины-огня', sys.id, destination.pos);
    const spaces = st.systems.flatMap(s => s.areas.filter(a => a.world
        && !(s.id === sys.id && (a.pos === source.area || a.pos === destination.pos)))
        .map(a => ({ system: s.id, pos: a.pos })));
    const n = FS_RULES.STRUCTURE_POOL.bastion;
    ok(spaces.length >= n, 'для полной коробки бастионов нужны разные миры');
    for (let i = 0; i < n; i++) st.structures.push({ id: 'full-bastion-' + i,
        seat: i < 5 ? 0 : 1, type: 'bastion', system: spaces[i].system, area: spaces[i].pos });
    ok(playEvent(st).ok, 'событие сыграно');
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { structure: source.id } }).ok, 'разрушена своя фабрика');
    eq(pending(st).options, ['factory', 'city'], 'фабрика доступна, бастионы закончились');
    eq(FS_RULES.apply(st, 0, { type: 'effect', answer: { type: 'bastion' } }).ok, false, 'закончившийся тип не выбрать');
    st = JSON.parse(JSON.stringify(st));
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { type: 'factory' } }).ok, 'выбрана возвращённая фабрика');
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { area: { system: sys.id, pos: destination.pos } } }).ok,
        'фабрика поставлена в другом мире');
    eq(st.structures.filter(x => x.type === 'bastion').length, n, 'лишний бастион не создан');
    eq(st.structures.filter(x => x.type === 'factory').map(x => [x.seat, x.system, x.area]),
        [[0, sys.id, destination.pos]], 'единственная своя фабрика возвращена из коробки');
    eq(st.pending, null, 'событие завершено');
});

check('Эвакуация', 'при отсутствии своей постройки вопрос не появляется', () => {
    const st = tauEvent('Эвакуация', {});
    const sys = FS_RULES.system(st, st.sys);
    FS_RULES.addUnit(st, 0, 'воины-огня', sys.id, st.pos);
    st.structures.push({ id: 'evac-only-foe', seat: 1, type: 'city', system: st.systems[1].id,
        area: worldOf(st, st.systems[1].id) });
    ok(playEvent(st).ok, 'событие сыграно');
    eq(st.pending, null, 'нет своей постройки — нечего выбирать');
    eq(st.structures.map(s => s.id), ['evac-only-foe'], 'чужая постройка не уничтожена');
});

check('Перерезать линии снабжения', 'оба участника разыграли запреты: каждый запрещён только в своём шаге', () => {
    let st = orderState('advance', { faction: 'тираниды', foeFaction: TAU,
        units: { 'гаунты': 2 }, foeUnits: { 'воины-огня': 2 } });
    const shadow = FS_DATA.events.find(c => c.faction === 'тираниды' && c.name === 'Тень в варпе');
    FS_RULES.keepEventScheme(st, 0, shadow);
    keepTauPlan(st, 1, 'Перерезать линии снабжения');
    st.players[0].assets.reinforcement = 2; st.players[1].assets.reinforcement = 2;
    startTauPlanBattle(st);
    eq([st.pending?.seat, pending(st)?.options], [0, ['Тень в варпе']], 'первый план атакующего');
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { choice: 0 } }).ok, 'запрет тиранидов');
    eq([st.pending?.seat, pending(st)?.options], [1, ['Перерезать линии снабжения']], 'план защитника');
    st = JSON.parse(JSON.stringify(st));
    ok(FS_RULES.apply(st, 1, { type: 'effect', answer: { choice: 0 } }).ok, 'запрет Тау');
    eq([st.pending, st.combat.step, CombatTokens.of(st.combat).used('attacker'), CombatTokens.of(st.combat).used('defender')],
        [null, 'choose-attacker', 0, 0], 'оба пустых шага пройдены без клиентских команд');
    eq([st.players[0].assets.reinforcement, st.players[1].assets.reinforcement], [2, 2], 'жетоны в личных запасах');
    // Model an old saved preparation step: the server must still reject forged
    // commands against both bans, rather than only skipping it in new games.
    for (const [side, seat] of [['attacker', 0], ['defender', 1]]) {
        const old = JSON.parse(JSON.stringify(st));
        CombatTurn.of(old.combat).setStep('reinforce-' + side);
        eq(FS_RULES.maxReinforce(old, seat, side), 0, 'запрещена сторона ' + side);
        for (const fake of [-1, 1.5, '1', 1])
            eq(FS_RULES.apply(old, seat, { type: 'combat', action: 'reinforce', count: fake }).ok, false,
                'нельзя подделать число или игнорировать запрет ' + side);
        ok(FS_RULES.apply(old, seat, { type: 'combat', action: 'reinforce', count: 0 }).ok, 'нулевой шаг старого сохранения пройден');
    }
});

check('Перерезать линии снабжения', 'сервер сам проходит запрещённые и пустые шаги, не требуя команды второго игрока', () => {
    for (const owner of [0, 1]) {
        let st = owner === 0
            ? orderState('advance', { faction: TAU, foeFaction: 'некроны',
                units: { 'воины-огня': 2 }, foeUnits: { 'воины': 2 } })
            : orderState('advance', { faction: 'некроны', foeFaction: TAU,
                units: { 'воины': 2 }, foeUnits: { 'воины-огня': 2 } });
        keepTauPlan(st, owner, 'Перерезать линии снабжения');
        st.players[0].assets.reinforcement = 1;
        st.players[1].assets.reinforcement = owner === 0 ? 1 : 0;
        startTauPlanBattle(st);
        eq([st.pending?.seat, pending(st)?.options], [owner, ['Перерезать линии снабжения']], 'план на старте боя');
        st = JSON.parse(JSON.stringify(st));
        ok(FS_RULES.apply(st, owner, { type: 'effect', answer: { choice: 0 } }).ok, 'запрет принят');
        if (owner === 0) {
            eq(st.combat.step, 'reinforce-attacker', 'атакующий с жетоном сохраняет право выбора');
            ok(FS_RULES.apply(st, 0, { type: 'combat', action: 'reinforce', count: 1 }).ok, 'атакующий использовал жетон');
        }
        eq([st.pending, st.combat.step], [null, 'choose-attacker'], 'оба шага без выбора пройдены на сервере');
        eq(st.players[1 - owner].assets.reinforcement, 1, 'жетон запрещённого игрока остался при нём');
        eq(CombatTokens.of(st.combat).used(owner === 0 ? 'defender' : 'attacker'), 0, 'запрещённая сторона не вызвала подкрепление');
    }
});

check('Перерезать линии снабжения', 'пустые шаги начинаются только после вопросов подготовки боя', () => {
    let st = orderState('advance', { faction: MECH, foeFaction: TAU,
        units: { 'скитарии': 2 }, foeUnits: { 'бронекостюмы': 1 }, upgrades: ['Священные масла'] });
    ok(burn(st, 'Священные масла').ok, 'приказ подготовил дополнительные карты');
    keepTauPlan(st, 1, 'Перерезать линии снабжения');
    st.players[0].assets.reinforcement = 1;
    st.players[1].assets.reinforcement = 0;
    startTauPlanBattle(st);
    ok(FS_RULES.apply(st, 1, { type: 'effect', answer: { choice: 0 } }).ok, 'план принят');
    eq([st.pending?.seat, pending(st)?.op, st.combat.step], [0, 'discardHand', 'reinforce-attacker'],
        'сначала вопросы подготовки, не выбор боевой карты');
    for (let i = 0; i < 2; i++) {
        const name = pending(st).options[0];
        st = JSON.parse(JSON.stringify(st));
        ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { cards: [name] } }).ok, 'сброшена карта после JSON');
    }
    eq([st.pending, st.combat.step], [null, 'choose-attacker'], 'после подготовки сервер проходит оба пустых шага');
    eq([st.players[0].assets.reinforcement, CombatTokens.of(st.combat).used('attacker')], [1, 0], 'запрет не тратит жетон');
});

check('Перерезать линии снабжения', 'проверка срока запрета при прерванном эффекте и в старом сохранении', () => {
    for (const side of ['attacker', 'defender']) for (const step of ['combat-start', 'reinforce-attacker', 'reinforce-defender', 'choose-attacker']) {
        let st = tauBattle({ units: { 'воины-огня': 2 }, foeUnits: { 'огрины': 2 }, roundEnd: true });
        const seat = side === 'attacker' ? 0 : 1;
        ctx.CombatBans.of(st.combat).forbidReinforce(seat, 'preparation');
        CombatTurn.of(st.combat).holdEffect(step);
        st = JSON.parse(JSON.stringify(st));
        const before = CombatTokens.of(st.combat).used(side);
        FS_RULES.runEffects(st, seat, [{ op: 'placeReinforcement', n: 1, free: true, here: true }],
            { kind: 'combat', ctx: { side } });
        eq(CombatTokens.of(st.combat).used(side) - before, step === 'choose-attacker' ? 1 : 0,
            'эффект, прервавший ' + step + ', соблюдает срок запрета');
    }
    const old = { noReinforce: true, noReinforceSeat: 1, step: 'choose-attacker' };
    eq(ctx.CombatBans.of(old).forbidsReinforce(1, 'defender'), true, 'старый запрет без scope действует весь бой');
    ctx.CombatBans.of(old).forbidReinforce(0, 'preparation');
    eq(ctx.CombatBans.of(old).forbidsReinforce(1, 'defender'), true, 'новая запись не потеряла старую');
    eq(ctx.CombatBans.of(old).forbidsReinforce(0, 'attacker'), false, 'новый ограниченный срок завершён');
});

check('Перерезать линии снабжения', '«Зов астропатов» не обходит запрет Тау или Тиранидов при подготовке', () => {
    for (const faction of [TAU, 'тираниды']) {
        let st = orderState('advance', { faction, foeFaction: TAU_FOE,
            units: faction === TAU ? { 'воины-огня': 2 } : { 'гаунты': 2 },
            foeUnits: { 'огрины': 2 } });
        const name = faction === TAU ? 'Перерезать линии снабжения' : 'Тень в варпе';
        const ban = FS_DATA.events.find(c => c.faction === faction && c.name === name);
        const call = FS_DATA.events.find(c => c.faction === TAU_FOE && c.name === 'Зов астропатов');
        FS_RULES.keepEventScheme(st, 0, ban); FS_RULES.keepEventScheme(st, 1, call);
        st.players[0].assets.reinforcement = 1; st.players[1].assets.reinforcement = 1;
        startTauPlanBattle(st);
        eq([st.pending?.seat, pending(st)?.options], [0, [name]], 'план атакующего в начале боя');
        ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { choice: 0 } }).ok, 'запрет принят');
        ok(FS_RULES.apply(st, 0, { type: 'combat', action: 'reinforce', count: 0 }).ok, 'атакующий прошёл шаг');
        FS_RULES.advanceCombatSteps(st);
        eq([st.pending?.seat, pending(st)?.options], [1, ['Зов астропатов']], 'окно защитника не пропущено');
        st = JSON.parse(JSON.stringify(st));
        ok(FS_RULES.apply(st, 1, { type: 'effect', answer: { choice: 0 } }).ok, 'план защитника разрешён');
        eq(CombatTokens.of(st.combat).used('defender'), 0, 'бесплатные жетоны запрещены в подготовке');
        eq(st.players[1].assets.reinforcement, 1, 'личный жетон не потрачен');
        eq(st.combat.step, 'choose-attacker', 'бой продолжается');
    }
});

check('Перерезать линии снабжения', 'обещанное подкрепление запрещено при подготовке, но не после неё', () => {
    let st = orderState('advance', { faction: 'тираниды', foeFaction: TAU,
        ships: { 'пожиратели': 1 }, units: { 'гаунты': 2 }, foeUnits: { 'воины-огня': 2 },
        upgrades: ['Бесчисленные'] });
    ok(burn(st, 'Бесчисленные').ok, 'разыграны «Бесчисленные»');
    eq(st.order.combatReinforce?.n, 1, 'бесплатный жетон обещан до боя');
    keepTauPlan(st, 1, 'Перерезать линии снабжения');
    startTauPlanBattle(st);
    eq(st.pending?.seat, 1, 'защитник отвечает до подготовки');
    st = JSON.parse(JSON.stringify(st));
    ok(FS_RULES.apply(st, 1, { type: 'effect', answer: { choice: 0 } }).ok, 'запрет принят');
    eq(CombatTokens.of(st.combat).used('attacker'), 0, 'обещанный жетон при подготовке запрещён');
    eq(st.order.combatReinforce, null, 'обещание использовано один раз');
    const c = st.combat;
    c.step = 'choose-attacker';
    FS_RULES.runEffects(st, 0, [{ op: 'placeReinforcement', n: 1, free: true, here: true, who: 'me' }],
        { kind: 'combat', ctx: { side: 'attacker' } });
    eq(CombatTokens.of(c).used('attacker'), 1, 'вне подготовки запрет Тау уже не действует');
});

check('Философия войны', 'одинаковые планы после JSON сбрасываются по одной карте, отказ не тратит оставшуюся', () => {
    // Artificial duplicate: the normal deck need not contain two copies, but a
    // restored/extended game can. Consuming one must never discard every match.
    let st = orderState('advance', { faction: TAU, foeFaction: TAU_FOE,
        units: { 'воины-огня': 2 }, foeUnits: { 'гвардейцы': 1 } });
    keepTauPlan(st, 0, 'Перерезать линии снабжения');
    st.players[0].schemes.push(JSON.parse(JSON.stringify(st.players[0].schemes[0])));
    startTauPlanBattle(st);
    eq(pending(st).options.length, 2, 'две одинаковые карты в окне');
    st = JSON.parse(JSON.stringify(st));
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { choice: 0 } }).ok, 'одна карта сброшена');
    eq(st.players[0].schemes.filter(s => s.name === 'Перерезать линии снабжения').length, 1, 'вторая карта сохранена');
    eq([pending(st)?.kind, st.pending?.seat], ['scheme', 0], 'вторую карту можно разыграть или сохранить');
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { no: true } }).ok, 'отказ принят');
    eq(st.players[0].schemes.length, 1, 'отказ не сбрасывает вторую карту');
    eq(st.combat.cards.attacker.hand.length, 5, 'подготовка продолжилась ровно один раз');
});

check('Философия войны', 'старое окно без счётчиков и восстановленный снимок корректно продолжают обе стороны', () => {
    let st = orderState('advance', { faction: TAU, foeFaction: TAU_FOE,
        units: { 'воины-огня': 2 }, foeUnits: { 'гвардейцы': 1 } });
    keepTauPlan(st, 0, 'Перерезать линии снабжения');
    const rocket = FS_DATA.events.find(e => e.faction === TAU_FOE && e.name === 'Ракета «Death Strike»');
    FS_RULES.keepEventScheme(st, 1, rocket);
    startTauPlanBattle(st);
    delete st.combat.startWindow.offered.counts; // historical save contained names only
    const snapshot = JSON.stringify(st);
    for (const accept of [true, false]) {
        st = JSON.parse(snapshot);
        const r = FS_RULES.apply(st, 0, { type: 'effect', answer: accept ? { choice: 0 } : { no: true } });
        ok(r.ok, 'старое окно продолжено');
        eq([st.pending?.seat, pending(st)?.options], [1, ['Ракета «Death Strike»']], 'очередь защитника не потеряна');
        eq(st.players[0].schemes.length, accept ? 0 : 1, 'принятие и отказ учтены');
        eq(ctx.CombatBans.of(st.combat).forbidsReinforce(1, 'defender'), accept, 'запрет соответствует решению');
        ok(FS_RULES.apply(st, 1, { type: 'effect', answer: { no: true } }).ok, 'защитник отказывается от ракеты');
        eq(st.combat.cards.attacker.hand.length, 5, 'подготовка выполнена однажды');
    }
});

check('Перерезать линии снабжения', 'план запрещает противнику подкрепления в бою', () => {
    const st = tauBattle({});
    refuseReinforce(st);
    schemeInPlay(st, 'Перерезать линии снабжения', TAU);
    FS_RULES.maybeScheme(st, 0, 'combat-start', { kind: 'combat', ctx: { side: 'attacker' } });
    effectAnswer(st, { choice: 0 }, 8);
    eq(st.combat.noReinforce, true, 'запрет подкреплений');
    eq(st.combat.noReinforceSeat, 1, 'запрет относится к противнику');
    return eq(st.players[0].schemes.length, 0, 'план сброшен');
});

check('Критический удар', 'реальная «Святая троица» делит урон только противника в атаке и защите, после JSON до конца раунда', () => {
    for (const sisterSeat of [0, 1]) {
        let st = sisterSeat === 0
            ? battle({ faction: 'сестры-битвы', foeFaction: TAU,
                units: { 'сестры-битвы': 2 }, foeUnits: { 'бронекостюмы': 2 },
                card: 'Святая троица', foeCard: 'Команды следопытов', roundEnd: true })
            : battle({ faction: TAU, foeFaction: 'сестры-битвы',
                units: { 'бронекостюмы': 2 }, foeUnits: { 'сестры-битвы': 2 },
                card: 'Команды следопытов', foeCard: 'Святая троица', roundEnd: true });
        refuseReinforce(st);
        play(st, sisterSeat, 0);
        const affected = sisterSeat === 0 ? 'defender' : 'attacker';
        const ordinary = sisterSeat === 0 ? 'attacker' : 'defender';
        eq(CombatDamage.of(st.combat).oneByOne(affected), true, 'урон противника делится');
        eq(CombatDamage.of(st.combat).oneByOne(ordinary), false, 'урон Сестёр не делится');
        st = JSON.parse(JSON.stringify(st));
        // Use fixed dice after actually playing the card; neither selected card
        // contributes attack/defence icons. Two hits on the opponent's two
        // health-3 suits route both, whereas three hits kill one health-3 Sister.
        const c = st.combat;
        c.tokens = { attacker: { att: 0, def: 0 }, defender: { att: 0, def: 0 } };
        c.dice.attacker = Array(sisterSeat === 0 ? 2 : 3).fill('att');
        c.dice.defender = Array(sisterSeat === 1 ? 2 : 3).fill('att');
        c.step = 'damage-attacker';
        const suits = st.units.filter(u => u.seat !== sisterSeat).map(u => u.id);
        const sisters = st.units.filter(u => u.seat === sisterSeat).map(u => u.id);
        const affectedPreview = FS_RULES.damagePreview(st, affected, suits);
        const ordinaryPreview = FS_RULES.damagePreview(st, ordinary, [sisters[0]]);
        eq(affectedPreview.rows.map(x => [x.take, x.destroyed, x.routed]),
            [[1, false, true], [1, false, true]], 'предпросмотр двух ударов по единице');
        eq(ordinaryPreview.rows.map(x => [x.take, x.destroyed]), [[3, true]], 'у Сестёр обычное распределение');
        for (const side of ['attacker', 'defender']) {
            const seat = side === 'attacker' ? c.attacker : c.defender;
            const targets = side === affected ? suits : [sisters[0]];
            const res = FS_RULES.apply(st, seat, { type: 'combat', action: 'damage', targets });
            ok(res.ok, 'урон стороны ' + side + ' принят: ' + res.error);
            if (side === 'attacker') st = JSON.parse(JSON.stringify(st));
        }
        ok(suits.every(id => stateUnit(st, id)?.routed), 'оба бронекостюма получили по единице');
        eq(stateUnit(st, sisters[0]), null, 'одна Сестра уничтожена обычным уроном');
        ok(!!stateUnit(st, sisters[1]), 'вторая Сестра не получила урон');
        eq(st.combat.round, 2, 'начался следующий раунд');
        eq([st.combat.damageOneByOne, st.combat.damageOneByOneSide], [null, null], 'режим очищен в новом раунде');
    }
    const legacy = { damageOneByOne: true };
    eq([CombatDamage.of(legacy).oneByOne('attacker'), CombatDamage.of(legacy).oneByOne('defender')],
        [false, true], 'старый формат без стороны сохраняет прежнюю сторону');
});

check('Критический удар', 'несмертельный урон применяется до реакции; после JSON уничтожается только получивший его отряд', () => {
    let st = tauBattle({ foeUnits: { 'огрины': 2 }, dice: ['att'], foeDice: [], roundEnd: true });
    refuseReinforce(st);
    const [victim, other] = foeUnits(st);
    schemeInPlay(st, 'Критический удар', TAU);
    st.combat.dice.attacker = ['att']; st.combat.dice.defender = [];
    st.combat.step = 'damage-defender';
    const res = FS_RULES.apply(st, 1, { type: 'combat', action: 'damage', targets: [victim.id] });
    ok(res.ok, 'урон не начат: ' + res.error);
    ok(stateUnit(st, victim.id)?.routed, 'план предлагается после нанесения несмертельного урона');
    eq([pending(st)?.kind, st.pending?.seat], ['scheme', 0], 'отвечает участник боя Тау');
    st = JSON.parse(JSON.stringify(st));
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { choice: 0 } }).ok, 'план разыгран');
    eq(pending(st)?.options, [victim.id], 'не получивший урон отряд не предложен');
    eq(FS_RULES.apply(st, 0, { type: 'effect', answer: { units: [other.id] } }).ok, false, 'подмена цели отвергнута');
    eq(FS_RULES.apply(st, 0, { type: 'effect', answer: { units: [] } }).ok, false, 'после сброса плана цель обязательна');
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { units: [victim.id] } }).ok, 'получивший урон отряд уничтожен');
    eq(stateUnit(st, victim.id), null, 'цель уничтожена');
    ok(!!stateUnit(st, other.id), 'другой отряд уцелел');
    eq(st.combat.damageResume, null, 'шаг урона не повторяется');
    eq(st.pending, null, 'реакция завершена');
    return eq(st.players[0].schemes.length, 0, 'план сброшен');
});

check('Критический удар', 'смертельный урон уже уничтожил отряд: нельзя сбросить план ради другой цели', () => {
    const st = tauBattle({ foeUnits: { 'гвардейцы': 1, 'огрины': 1 }, dice: ['att'], foeDice: [], roundEnd: true });
    refuseReinforce(st);
    const victim = foeUnits(st).find(u => u.unit === 'гвардейцы');
    schemeInPlay(st, 'Критический удар', TAU);
    st.combat.dice.attacker = ['att']; st.combat.dice.defender = [];
    st.combat.step = 'damage-defender';
    const res = FS_RULES.apply(st, 1, { type: 'combat', action: 'damage', targets: [victim.id] });
    ok(res.ok, 'смертельный урон назначен');
    eq(stateUnit(st, victim.id), null, 'отряд уничтожен уроном');
    eq(!!st.pending, false, 'нельзя применить план к неполучившей урон цели');
    return eq(st.players[0].schemes.some(x => x.name === 'Критический удар'), true, 'план остался');
});

check('Критический удар', 'урон по единице: отказ на первом отряде не закрывает реакцию на втором', () => {
    // Artificial cross-faction combination isolates the order of damage events;
    // the normal Tau deck does not itself grant the one-by-one effect.
    for (const acceptSecond of [false, true]) {
        let st = tauBattle({ foeUnits: { 'огрины': 3 }, dice: ['att', 'att'], foeDice: [], roundEnd: true });
        refuseReinforce(st);
        const victims = foeUnits(st);
        schemeInPlay(st, 'Критический удар', TAU);
        st.combat.dice.attacker = ['att', 'att']; st.combat.dice.defender = [];
        st.combat.step = 'damage-defender';
        CombatDamage.of(st.combat).setOneByOne();
        const res = FS_RULES.apply(st, 1, { type: 'combat', action: 'damage', targets: [victims[0].id, victims[1].id] });
        ok(res.ok, 'распределены две единицы');
        ok(stateUnit(st, victims[0].id)?.routed, 'первый фактически получил урон');
        ok(!stateUnit(st, victims[1].id)?.routed, 'второй ожидает окончания первой реакции');
        eq(st.pending?.ctx?.ctx?.damageTargets, [victims[0].id], 'первая реакция относится к первому отряду');
        st = JSON.parse(JSON.stringify(st));
        ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { no: true } }).ok, 'первый раз можно отказаться');
        ok(stateUnit(st, victims[1].id)?.routed, 'после отказа нанесена вторая единица');
        eq(st.pending?.ctx?.ctx?.damageTargets, [victims[1].id], 'новый отряд — новое окно реакции');
        st = JSON.parse(JSON.stringify(st));
        if (acceptSecond) {
            ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { choice: 0 } }).ok, 'план принят для второго отряда');
            eq(pending(st)?.options, [victims[1].id], 'нельзя выбрать прошлую цель');
            ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { units: [victims[1].id] } }).ok, 'второй отряд уничтожен');
            eq(stateUnit(st, victims[1].id), null, 'правильная цель уничтожена');
        } else {
            ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { no: true } }).ok, 'можно отказаться снова');
            ok(st.players[0].schemes.some(x => x.name === 'Критический удар'), 'план сохранён');
            ok(stateUnit(st, victims[1].id), 'отказ не уничтожает цель');
        }
        ok(stateUnit(st, victims[0].id)?.routed, 'первый отряд сохранился');
        ok(!stateUnit(st, victims[2].id)?.routed, 'третий не получил урон');
        eq(st.pending, null, 'обе реакции завершены');
        eq(st.combat.damageResume, null, 'продолжение исчерпано');
    }
});

check('Критический удар', 'принятие первой реакции завершает её до урона следующей цели и переживает отменённый снимок', () => {
    // One-by-one is a synthetic cross-faction combination; Tau has no such card.
    let st = tauBattle({ foeUnits: { 'огрины': 3 }, dice: ['att', 'att'], foeDice: [], roundEnd: true });
    refuseReinforce(st);
    const victims = foeUnits(st).map(u => u.id);
    schemeInPlay(st, 'Критический удар', TAU);
    st.combat.dice.attacker = ['att', 'att']; st.combat.dice.defender = [];
    st.combat.step = 'damage-defender';
    CombatDamage.of(st.combat).setOneByOne('defender');
    ok(FS_RULES.apply(st, 1, { type: 'combat', action: 'damage', targets: victims.slice(0, 2) }).ok, 'две цели назначены');
    const beforeChoice = JSON.stringify(st);
    for (const accept of [true, false]) {
        st = JSON.parse(beforeChoice); // restored snapshot, like undo
        ok(stateUnit(st, victims[0])?.routed && !stateUnit(st, victims[1])?.routed, 'второй ждёт реакцию');
        ok(FS_RULES.apply(st, 0, { type: 'effect', answer: accept ? { choice: 0 } : { no: true } }).ok, 'первый ответ принят');
        if (accept) {
            st = JSON.parse(JSON.stringify(st));
            ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { units: [victims[0]] } }).ok, 'первая цель уничтожена');
            eq(stateUnit(st, victims[0]), null, 'погибла выбранная цель');
            ok(stateUnit(st, victims[1])?.routed, 'вторая цель получает отложенную единицу');
            eq(st.pending, null, 'сброшенный план не предлагается снова');
            eq(st.combat.damageResume, null, 'продолжение исчерпано');
            eq(st.combat.applied.defender.map(x => [x.unit, x.destroyed]),
                [[victims[0], true], [victims[1], false]], 'обе записи урона обновлены');
        } else {
            ok(stateUnit(st, victims[1])?.routed, 'вторая цель получила урон после отказа');
            eq(st.pending?.ctx?.ctx?.damageTargets, [victims[1]], 'новая реакция именно на вторую цель');
        }
        ok(!stateUnit(st, victims[2])?.routed, 'третья цель не задета');
    }
});

check('Критический удар', 'реакция на раненый жетон завершает его уничтожение перед следующей целью', () => {
    // The one-by-one mode is synthetic; the token and the plan are real.
    let st = tauBattle({ foeFaction: 'некроны', units: { 'воины-огня': 2 }, foeUnits: { 'воины': 2 },
        dice: ['att', 'att'], foeDice: [], roundEnd: true });
    st.players[1].assets.reinforcement = 1;
    ok(FS_RULES.apply(st, 0, { type: 'combat', action: 'reinforce', count: 0 }).ok, 'атакующий пропускает подкрепления');
    ok(FS_RULES.apply(st, 1, { type: 'combat', action: 'reinforce', count: 1 }).ok, 'защитник размещает жетон');
    const token = 'reinforce-defender-0', target = foeUnits(st)[0].id;
    schemeInPlay(st, 'Критический удар', TAU);
    st.combat.dice.attacker = ['att', 'att']; st.combat.dice.defender = [];
    st.combat.step = 'damage-defender';
    CombatDamage.of(st.combat).setOneByOne('defender');
    ok(FS_RULES.apply(st, 1, { type: 'combat', action: 'damage', targets: [token, target] }).ok, 'урон назначен');
    ok(CombatTokens.of(st.combat).flipped('defender').includes(0), 'жетон деморализован');
    ok(!stateUnit(st, target).routed, 'отряд ещё не получил урон');
    eq(st.pending?.ctx?.ctx?.damageTargets, [token], 'реакция именно на жетон');
    st = JSON.parse(JSON.stringify(st));
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { choice: 0 } }).ok, 'план принят');
    eq(pending(st)?.options, [token], 'только раненый жетон доступен');
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { units: [token] } }).ok, 'жетон уничтожен');
    eq(CombatTokens.of(st.combat).alive('defender', 0), false, 'слот жетона уничтожен');
    ok(stateUnit(st, target)?.routed, 'урон продолжился на модели');
    eq(st.combat.applied.defender.map(x => [x.token || x.unit, x.destroyed]),
        [[token, true], [target, false]], 'обе записи урона сохранены');
    eq(st.pending, null, 'повторного вопроса нет');
});

check('Критический удар', "«Монт'ка» и искусственный урон по единице: реакция не возвращает потерянный избыток", () => {
    let st = tauBattle({ faction: TAU, foeFaction: 'некроны', card: "Монт'ка",
        units: { 'воины-огня': 2 }, foeUnits: { 'воины': 2 },
        dice: ['att'], foeDice: [], roundEnd: true });
    const [first, other] = foeUnits(st).map(u => u.id);
    tauPlay(st, (s, q) => q.op === 'damageFirst' ? { units: [first] } : firstOption(s, q));
    answerAll(st, null, 1);
    eq(st.combat.ignoreExcess?.id, first, 'настоящая карта отметила цель');
    schemeInPlay(st, 'Критический удар', TAU);
    const c = st.combat;
    c.dice.attacker = Array(6).fill('att'); c.dice.defender = [];
    c.tokens.attacker.att = 0; c.tokens.defender.def = 0; c.step = 'damage-defender';
    CombatDamage.of(c).setOneByOne('defender');
    ok(FS_RULES.apply(st, 1, { type: 'combat', action: 'damage', targets: [other, first] }).ok, 'урон принят');
    ok(stateUnit(st, first)?.routed && !stateUnit(st, other)?.routed, 'первая цель ранена, вторая не задета');
    eq(st.combat.damageResume?.progress?.left, 0, 'избыток потерян до окна реакции');
    st = JSON.parse(JSON.stringify(st));
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { choice: 0 } }).ok, 'план принят');
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { units: [first] } }).ok, 'цель уничтожена');
    eq(stateUnit(st, first), null, 'выбранная цель уничтожена');
    ok(stateUnit(st, other) && !stateUnit(st, other).routed, 'потерянный избыток не назначен');
    eq(st.pending, null, 'шаг завершён');
});

check('Критический удар', 'отказ в первом шаге не мешает плану при повторном шаге урона', () => {
    let st = tauBattle({ foeFaction: 'некроны', units: { 'воины-огня': 2 }, foeUnits: { 'воины': 2 },
        dice: ['att'], foeDice: [], roundEnd: true });
    const repeat = FS_DATA.events.find(c => c.faction === 'некроны' && c.name === 'Безжалостное наступление');
    FS_RULES.keepEventScheme(st, 1, repeat);
    refuseReinforce(st);
    eq([st.pending?.seat, pending(st)?.options], [1, ['Безжалостное наступление']], 'некрон предложил план в начале раунда');
    ok(FS_RULES.apply(st, 1, { type: 'effect', answer: { choice: 0 } }).ok, 'повтор шага обещан');
    schemeInPlay(st, 'Критический удар', TAU);
    const [first, second] = foeUnits(st).map(u => u.id);
    st.combat.dice.attacker = ['att']; st.combat.dice.defender = []; st.combat.step = 'damage-defender';
    ok(FS_RULES.apply(st, 1, { type: 'combat', action: 'damage', targets: [first] }).ok, 'первое ранение');
    eq(st.pending?.ctx?.ctx?.damageTargets, [first], 'реакция на первый удар');
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { no: true } }).ok, 'первый раз отказ');
    eq([st.combat.round, st.combat.damageRepeated, st.combat.step], [1, true, 'damage-defender'], 'дополнительный шаг начался');
    st = JSON.parse(JSON.stringify(st));
    ok(FS_RULES.apply(st, 1, { type: 'combat', action: 'damage', targets: [second] }).ok, 'во втором шаге ранен другой отряд');
    eq(st.pending?.ctx?.ctx?.damageTargets, [second], 'план снова предложен');
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { choice: 0 } }).ok, 'план принят');
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { units: [second] } }).ok, 'вторая цель уничтожена');
    ok(stateUnit(st, first)?.routed && !stateUnit(st, second), 'исход обоих шагов сохранён');
    eq(st.combat.round, 2, 'раунд завершился после повторного шага');
});

check('Критический удар', 'смертельный первый удар не скрывает реакцию на раненую вторую цель', () => {
    let st = tauBattle({ foeUnits: { 'гвардейцы': 1, 'огрины': 2 }, dice: ['att', 'att'], foeDice: [], roundEnd: true });
    refuseReinforce(st);
    const first = foeUnits(st).find(u => u.unit === 'гвардейцы').id;
    const second = foeUnits(st).find(u => u.unit === 'огрины').id;
    schemeInPlay(st, 'Критический удар', TAU);
    st.combat.dice.attacker = ['att', 'att']; st.combat.dice.defender = [];
    st.combat.step = 'damage-defender';
    ok(FS_RULES.apply(st, 1, { type: 'combat', action: 'damage', targets: [first, second] }).ok, 'удар назначен');
    eq(stateUnit(st, first), null, 'первый отряд уничтожен уроном');
    ok(stateUnit(st, second)?.routed, 'второй получил оставшийся урон');
    eq(st.pending?.ctx?.ctx?.damageTargets, [second], 'реакция относится ко второму');
    st = JSON.parse(JSON.stringify(st));
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { choice: 0 } }).ok, 'план принят');
    eq(pending(st)?.options, [second], 'только раненый отряд доступен');
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { units: [second] } }).ok, 'вторая цель уничтожена');
    eq(stateUnit(st, second), null, 'она действительно уничтожена');
    eq(st.pending, null, 'шаг завершён');
});

check('Критический удар', 'старое продолжение после полного урона завершается ровно один раз', () => {
    let st = tauBattle({ foeUnits: { 'огрины': 2 }, dice: ['att'], foeDice: [], roundEnd: true });
    refuseReinforce(st);
    const [victim, other] = foeUnits(st).map(u => u.id);
    schemeInPlay(st, 'Критический удар', TAU);
    st.combat.dice.attacker = ['att']; st.combat.dice.defender = [];
    st.combat.step = 'damage-defender';
    ok(FS_RULES.apply(st, 1, { type: 'combat', action: 'damage', targets: [victim] }).ok, 'урон и вопрос открыты');
    delete st.combat.damageResume.progress; // historical afterDamage save: whole assignment was already applied
    const saved = JSON.stringify(st);
    for (const accept of [true, false]) {
        st = JSON.parse(saved);
        ok(FS_RULES.apply(st, 0, { type: 'effect', answer: accept ? { choice: 0 } : { no: true } }).ok, 'старый ответ принят');
        if (accept) ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { units: [victim] } }).ok, 'цель уничтожена');
        eq(!!stateUnit(st, victim), !accept, 'состояние цели соответствует выбору');
        ok(stateUnit(st, other) && !stateUnit(st, other).routed, 'второй отряд не получил повторный урон');
        eq(st.combat.damageResume, null, 'старое продолжение снято');
        eq(st.pending, null, 'план не предложен повторно');
        eq(st.combat.round, 2, 'раунд закончен ровно один раз');
    }
});

check('Критический удар', 'в бой не вмешивается третье место, даже если оно держит план', () => {
    const st = FS_RULES.newBattleTest({ seed: 29, players: [
        { faction: 'тираниды', name: 'Улей', id: 'p0' },
        { faction: 'некроны', name: 'Некроны', id: 'p1' },
        { faction: TAU, name: 'Наблюдатель', id: 'p2' },
    ], units: { 'гаунты': 2 }, foeUnits: { 'воины': 2 } });
    const card = FS_DATA.events.find(c => c.faction === TAU && c.name === 'Критический удар');
    FS_RULES.keepEventScheme(st, 2, card);
    refuseReinforce(st);
    st.combat.dice.attacker = ['att']; st.combat.dice.defender = [];
    st.combat.step = 'damage-defender';
    const victim = foeUnits(st)[0];
    ok(FS_RULES.apply(st, 1, { type: 'combat', action: 'damage', targets: [victim.id] }).ok, 'урон назначен');
    eq(!!st.pending, false, 'третьему месту не задан вопрос');
    ok(stateUnit(st, victim.id)?.routed, 'противник получил урон');
    ok(st.players[2].schemes.some(s => s.name === 'Критический удар'), 'план третьего места остался');
});

check('Критический удар', 'владелец назначает чужой урон: реакция принадлежит ему, а не противнику', () => {
    // Artificial cross-faction combination: the Tyranid assigner effect is given
    // to Tau to isolate ownership from the seat that sends the damage command.
    let st = tauBattle({ foeFaction: 'некроны', units: { 'воины-огня': 2 }, foeUnits: { 'воины': 2 },
        dice: ['att'], foeDice: [], roundEnd: true });
    refuseReinforce(st);
    schemeInPlay(st, 'Критический удар', TAU);
    ctx.CombatHooks.of(st.combat).assignTo(0, 'attacker');
    const victim = foeUnits(st)[0];
    st.combat.dice.attacker = ['att']; st.combat.dice.defender = []; st.combat.step = 'damage-defender';
    eq(FS_RULES.apply(st, 1, { type: 'combat', action: 'damage', targets: [victim.id] }).ok, false, 'получатель не назначает урон');
    ok(FS_RULES.apply(st, 0, { type: 'combat', action: 'damage', targets: [victim.id] }).ok, 'владелец карты назначает урон');
    eq([st.pending?.seat, pending(st)?.kind], [0, 'scheme'], 'план предложен противоположной получателю стороне');
    eq(FS_RULES.apply(st, 1, { type: 'effect', answer: { choice: 0 } }).ok, false, 'получатель не отвечает за владельца');
    st = JSON.parse(JSON.stringify(st));
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { choice: 0 } }).ok, 'план принят после JSON');
    eq(pending(st)?.options, [victim.id], 'только раненый отряд');
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { units: [victim.id] } }).ok, 'отряд уничтожен');
    eq(stateUnit(st, victim.id), null, 'цель плана уничтожена');
});

check('Критический удар', 'цель сначала деморализована, затем уничтожена планом: Сфера воскрешения возвращает её из запаса', () => {
    let st = tauBattle({ foeFaction: 'некроны', units: { 'воины-огня': 2 }, foeUnits: { 'воины': 2 },
        dice: ['att'], foeDice: [], roundEnd: true });
    refuseReinforce(st);
    schemeInPlay(st, 'Критический удар', TAU);
    const sphere = FS_DATA.events.find(c => c.faction === 'некроны' && c.name === 'Сфера воскрешения');
    FS_RULES.keepEventScheme(st, 1, sphere);
    const victim = foeUnits(st)[0], before = st.players[1].supply.units['воины'] || 0;
    st.combat.dice.attacker = ['att']; st.combat.dice.defender = []; st.combat.step = 'damage-defender';
    ok(FS_RULES.apply(st, 1, { type: 'combat', action: 'damage', targets: [victim.id] }).ok, 'нанесён несмертельный урон');
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { choice: 0 } }).ok, 'план принят');
    st = JSON.parse(JSON.stringify(st));
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { units: [victim.id] } }).ok, 'раненый отряд уничтожен');
    eq(st.pending?.question?.op, 'resurrectOffer', 'в конце урона предложена сфера');
    eq(st.players[1].supply.units['воины'], before + 1, 'уничтоженная модель ушла в запас');
    st = JSON.parse(JSON.stringify(st));
    ok(FS_RULES.apply(st, 1, { type: 'effect', answer: { choice: 0 } }).ok, 'сфера принята после JSON');
    eq(foeUnits(st).filter(u => u.unit === 'воины').length, 2, 'воин вернулся на поле');
    eq(st.players[1].supply.units['воины'], before, 'возвращена ровно одна модель из запаса');
    ok(foeUnits(st).filter(u => u.unit === 'воины').every(u => !u.routed), 'отряды недеморализованы');
});

check('Критический удар', 'старое сохранение до урона: отказ не предлагает план снова, уничтожение не блокирует бой', () => {
    for (const accept of [false, true]) {
        let st = tauBattle({ foeFaction: 'некроны', units: { 'воины-огня': 2 }, foeUnits: { 'воины': 2 },
            dice: ['att'], foeDice: [], roundEnd: true });
        refuseReinforce(st);
        const plan = schemeInPlay(st, 'Критический удар', TAU);
        const [victim, other] = foeUnits(st), c = st.combat;
        c.dice.attacker = ['att']; c.dice.defender = []; c.step = 'damage-defender';
        // Shape written by the old engine: the scheme interrupts BEFORE damage.
        c.damageResume = { seat: 1, side: 'defender', cmd: { targets: [victim.id] } };
        ctx.CombatHooks.of(c).ask('damageHook', 'defender');
        ctx.CombatHooks.of(c).ask('criticalHook', 'defender');
        CombatTurn.of(c).holdEffect('effect');
        ctx.Question.of(st).ask({ seat: 0, kind: 'scheme', question: {
            kind: 'scheme', who: 0, options: [plan.name], text: 'Сбросить план?',
        }, ctx: { kind: 'combat', ctx: { side: 'defender', damageTargets: [victim.id] }, schemes: [plan] } });
        st = JSON.parse(JSON.stringify(st));
        ok(FS_RULES.apply(st, 0, { type: 'effect', answer: accept ? { choice: 0 } : { no: true } }).ok, 'ответ на старый вопрос принят');
        if (accept) {
            ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { units: [victim.id] } }).ok, 'старый план уничтожил цель');
            eq(stateUnit(st, victim.id), null, 'цель уничтожена');
            eq(st.pending, null, 'вопрос закрыт');
            eq(st.combat.step, 'damage-defender', 'урон ждёт нового распределения');
            ok(FS_RULES.apply(st, 1, { type: 'combat', action: 'damage', targets: [other.id] }).ok, 'оставшийся урон можно назначить');
            ok(stateUnit(st, other.id)?.routed, 'урон назначен оставшемуся отряду');
        } else {
            eq(st.pending, null, 'отказанный план не предложен повторно');
            ok(stateUnit(st, victim.id)?.routed, 'прерванный урон применён ровно один раз');
            ok(st.players[0].schemes.some(s => s.name === 'Критический удар'), 'отказанный план остался');
        }
        eq(st.combat.damageResume, null, 'старое продолжение исчерпано');
    }
});

// ============================================================================
//  02 / 04 / 05 / 06 — Космодесант Хаоса: способность, 14 боевых карт,
//  5 улучшений приказов и 8 событий (включая 4 плана)
// ============================================================================
const CHAOS = 'космодесант-хаоса';
const CHAOS_FOE = 'имперская-гвардия';
// Предел области — 5 отрядов (AREA_MAX_UNITS). Набор держится НИЖЕ предела:
// иначе шаг «разместить отряд» упирается в пластик, и проверка молчит не о том,
// что проверяет. Титан КЛ 3 нужен «Объединённому Хаосу» — он и есть четвёртый.
const CHAOS_GROUND = {
    'культисты': 2, 'космодесант-хаоса': 1, 'титаны-хаоса-класса-налетчик': 1,
};
const CHAOS_SHIPS = {
    'эсминцы-класса-иконоборец': 1,
    'отвратительные-тяжелые-крейсеры': 1,
};
const IG_GROUND = { 'гвардейцы': 2, 'титаны': 1 };
const IG_SHIPS = { 'крейсеры': 2, 'линкоры': 1 };

function chaosBattle(o = {}) {
    const space = !!o.space;
    const st = battle(Object.assign({
        faction: CHAOS, foeFaction: CHAOS_FOE,
        kind: space ? 'space' : 'ground',
        units: space ? CHAOS_SHIPS : CHAOS_GROUND,
        foeUnits: space ? IG_SHIPS : IG_GROUND,
        dice: ['att', 'att', 'morale'], foeDice: ['def', 'def'],
    }, o));
    st.testCard = o.card;
    return st;
}
function chaosEvent(name, o = {}) {
    return eventState(name, Object.assign({ faction: CHAOS, foeFaction: CHAOS_FOE }, o));
}
function chaosOrder(kind, o = {}) {
    return orderState(kind, Object.assign({
        faction: CHAOS, foeFaction: CHAOS_FOE,
        units: { 'культисты': 1 }, foeUnits: { 'гвардейцы': 1 },
    }, o));
}
function chaosStrike(o = {}) {
    return strikeState(Object.assign({
        faction: CHAOS, foeFaction: CHAOS_FOE,
        ships: { 'эсминцы-класса-иконоборец': 2 }, holdUnit: 'культисты',
    }, o));
}
/** All pending effect questions, even those asked of the other player. */
function chaosEffectAnswer(st, policy = firstOption, limit = 30) {
    for (let i = 0; i < limit && st.pending; i++) {
        const q = st.pending.question || {};
        const seat = st.pending.answerSeat === undefined ? st.pending.seat : st.pending.answerSeat;
        const one = typeof policy === 'function' ? policy(st, q) : policy;
        const res = FS_RULES.apply(st, seat, { type: 'effect', answer: one });
        if (!res || res.ok === false) throw new Error('ответ не принят: ' + (res && res.error));
        if (res.done) break;
    }
    return st;
}
/**
 * One printed panel of a Chaos combat card, played through the real parse/run
 * path. Both panels are real: the game runs the upper one always and the lower
 * one only when its requisite stands in the battle. A check of ONE sentence
 * therefore runs just that sentence, without the other panel and without the
 * unrelated card the opponent has laid face down.
 */
function chaosRun(st, panel, policy = firstOption) {
    const card = FS_DATA.combat.find(c => c.faction === CHAOS && c.name === st.testCard);
    ok(!!card, 'нет боевой карты «' + st.testCard + '»');
    const text = panel === 'unit' ? card.unit : card.general;
    ok(!!text, 'нет текста ' + panel + ' у «' + st.testCard + '»');
    const steps = FS_EFFECTS.parse(text, { kind: 'combat', faction: CHAOS });
    ok(steps.length > 0, 'текст не разобран');
    FS_RULES.runEffects(st, 0, steps, { kind: 'combat', ctx: { side: 'attacker' } });
    return chaosEffectAnswer(st, policy);
}
// Both players actually spend a reinforcement before the tested printed
// ability. Its slot survives JSON, just as it does in a real combat.
function chaosTokenBattle(chaos, space = false) {
    const foe = 1 - chaos;
    const factions = chaos === 0 ? [CHAOS, CHAOS_FOE] : [CHAOS_FOE, CHAOS];
    const chaosUnits = space ? { 'эсминцы-класса-иконоборец': 1, 'отвратительные-тяжелые-крейсеры': 1 }
        : { 'культисты': 1, 'хелбруты': 1 };
    const foeUnits = space ? { 'крейсеры': 2, 'линкоры': 1 } : { 'гвардейцы': 2, 'титаны': 1 };
    const st = battle({ faction: factions[0], foeFaction: factions[1], kind: space ? 'space' : 'ground',
        units: chaos === 0 ? chaosUnits : foeUnits, foeUnits: chaos === 1 ? chaosUnits : foeUnits, roundEnd: true });
    for (const seat of [0, 1]) st.players[seat].assets.reinforcement = 1;
    for (const seat of [0, 1]) ok(FS_RULES.apply(st, seat, { type: 'combat', action: 'reinforce', count: 1 }).ok, 'жетон призван');
    const ownSide = chaos === 0 ? 'attacker' : 'defender', foeSide = foe === 0 ? 'attacker' : 'defender';
    CombatTurn.of(st.combat).setDice(ownSide, ['morale', 'morale']).setDice(foeSide, ['att']);
    return st;
}
function chaosTokenEffect(st, chaos, name, panel, until) {
    const card = FS_DATA.combat.find(c => c.faction === CHAOS && c.name === name);
    const steps = FS_EFFECTS.parse(panel === 'general' ? card.general : card.unit, { kind: 'combat', faction: CHAOS });
    ok(steps.length, 'печатная способность разобрана');
    FS_RULES.runEffects(st, chaos, steps, { kind: 'combat', ctx: { side: chaos === 0 ? 'attacker' : 'defender' } });
    for (let i = 0; i < 15 && st.pending && pending(st).op !== until; i++) {
        const q = pending(st), seat = st.pending.answerSeat === undefined ? st.pending.seat : st.pending.answerSeat;
        const answer = q.op === 'spendDie' ? { dice: [0] } : firstOption(st, q);
        ok(FS_RULES.apply(st, seat, { type: 'effect', answer }).ok, 'предыдущий выбор ' + q.op);
    }
    eq(pending(st)?.op, until, 'способность дошла до выбора ' + until);
}
const chaosNoAvoid = (st, q) => (q.op === 'avoid' ? { no: true } : firstOption(st, q));
const chaosFoeNo = (st, q) => (q.op === 'foeAllow' ? { no: true } : firstOption(st, q));
const flattenOps = list => {
    const out = [];
    const walk = arr => {
        for (const s of arr || []) {
            if (!s || typeof s !== 'object') continue;
            if (s.op) out.push(s.op);
            walk(s.steps); walk(s.then); walk(s.yes); walk(s.no);
            for (const o of s.options || []) if (o && typeof o === 'object') {
                if (o.op) out.push(o.op);
                walk(o.steps); walk(o.then); walk(o.yes); walk(o.no);
            }
        }
    };
    walk(list);
    return out;
};
function chaosScheme(name) {
    const card = FS_DATA.events.find(e => e.faction === CHAOS && e.name === name);
    ok(!!card, 'нет события «' + name + '»');
    const parsed = FS_EFFECTS.parse(card.text || '', { kind: 'event', faction: CHAOS });
    const trig = parsed.find(s => s && s.op === 'trigger');
    ok(!!trig, 'нет триггера плана «' + name + '»');
    return {
        name, text: card.text || '', trigger: trig.trigger, steps: trig.steps || [],
        note: !!trig.note, defer: !!trig.defer,
        orderType: trig.orderType || null, insteadOfOrder: !!trig.insteadOfOrder,
    };
}

head('Космодесант Хаоса — тексты карт', CHAOS);
check('Обе плашки карты', ' cardSteps и настоящий розыгрыш читают обе способности', () => {
    const name = 'Ярость Кхорна (на листе — «Арость Кхорна»)';
    const card = FS_DATA.combat.find(c => c.faction === CHAOS && c.name === name);
    const withReq = chaosBattle({ card: name, dice: ['att', 'morale'], foeDice: ['def', 'def'] });
    const steps = FS_RULES.cardSteps(withReq, 0, card);
    eq(steps.map(x => x.op), ['spendDie', 'gainToken', 'route'], 'верхняя и нижняя плашки');
    ok(steps.every(x => x.op !== 'note' && x.op !== 'manual'), 'обе плашки без заглушек');
    const noReq = chaosBattle({ card: name, units: { 'хелбруты': 1 },
        dice: ['att', 'morale'], foeDice: ['def', 'def'] });
    eq(FS_RULES.cardSteps(noReq, 0, card).map(x => x.op), ['spendDie', 'gainToken'],
        'нижняя плашка требует своего отряда');
    refuseReinforce(withReq);
    play(withReq, 0, 0, firstOption);
    eq(tokens(withReq, 'attacker').att, 3, 'верхняя способность через реальный розыгрыш');
    return eq(count(withReq, 'defender', 'def'), 1,
        'нижняя способность через реальный розыгрыш: противник заплатил кубик');
});
check('Все 42 текста', 'у каждой способности есть настоящие шаги, без note и manual', () => {
    const faction = FS_DATA.factions.find(f => f.id === CHAOS);
    const texts = [['ability', faction.ability.text]];
    for (const c of FS_DATA.combat.filter(c => c.faction === CHAOS)) {
        texts.push(['combat:' + c.name + ':general', c.general]);
        if (c.unit) texts.push(['combat:' + c.name + ':unit', c.unit]);
    }
    for (const o of FS_DATA.orders.filter(o => o.faction === CHAOS)) texts.push(['order:' + o.name, o.text]);
    for (const e of FS_DATA.events.filter(e => e.faction === CHAOS)) texts.push(['event:' + e.name, e.text]);
    eq(texts.length, 42, '42 текста фракции');
    for (const [name, text] of texts) {
        const kind = name.startsWith('combat') ? 'combat' : name.startsWith('order') ? 'order'
            : name.startsWith('event') ? 'event' : 'ability';
        const steps = FS_EFFECTS.parse(text, { kind, faction: CHAOS });
        ok(steps.length > 0, name + ': способность не разобрана');
        for (const s of flattenOps(steps)) {
            ok(s !== 'note' && s !== 'manual', name + ': остался шаг «' + s + '»');
        }
        eq(FS_EFFECTS.chaosCard(text, { faction: 'адептус-механикус' }), null,
            name + ': чужая фракция не должна получать специальный разбор');
    }
    return true;
});
check('Зараза хаоса', 'способность переносит cultist в соседний дружественный/нейтральный мир', () => {
    const faction = FS_DATA.factions.find(f => f.id === CHAOS);
    const steps = FS_EFFECTS.abilityFor(faction);
    eq(steps.map(s => s.op), ['moveUnits'], 'один шаг перемещения');
    eq([steps[0].n, steps[0].dest], [1, 'friendlyOrUncontrolledWorldAdjacent'], 'культист в соседнюю систему');
    const parsed = FS_EFFECTS.parse(faction.ability.text, { kind: 'ability', faction: CHAOS });
    return eq(parsed[0].dest, 'friendlyOrUncontrolledWorldAdjacent', 'текст тоже разобран точно');
});

// --- 04-combat-cards.md: 5 базовых карт -------------------------------------
const KHORNE = 'Ярость Кхорна (на листе — «Арость Кхорна»)';
check('Зараза хаоса', 'действительное доминирование переносит только стоящего культиста по допустимому пути', () => {
    let st = orderState('dominate', { faction: CHAOS, foeFaction: CHAOS_FOE,
        units: { 'культисты': 1, 'космодесант-хаоса': 1 }, pos: 'TR' });
    const active = st.order.system, next = FS_RULES.neighbors(st, active)[0];
    const source = st.units.find(u => u.seat === 0 && u.unit === 'культисты');
    const routed = FS_RULES.addUnit(st, 0, 'культисты', active, source.area); routed.routed = true;
    const outsider = FS_RULES.addUnit(st, 0, 'культисты', next, 'TR');
    const enemyArea = FS_RULES.neighbors(st, active)[1];
    const enemy = FS_RULES.addUnit(st, 1, 'гвардейцы', enemyArea, worldOf(st, enemyArea));
    FS_RULES.system(st, enemyArea).tokens.push({ seat: 1, order: 'deploy', faceUp: false });
    ok(FS_RULES.apply(st, 0, { type: 'finishDominate' }).ok, 'выполнен второй шаг доминирования');
    const q = st.pending?.question;
    ok(q && q.kind === 'units' && q.options.includes(source.id), 'нужный культист предложен');
    ok(!q.options.includes(routed.id) && !q.options.includes(outsider.id), 'деморализованный и сосед не предлагаются');
    eq(FS_RULES.apply(st, 0, { type: 'effect', answer: { units: [outsider.id] } }).ok, false, 'чужую систему нельзя подменить');
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { units: [source.id] } }).ok, 'культист выбран');
    st = JSON.parse(JSON.stringify(st));
    const targets = st.pending?.question?.options || [];
    const direct = { system: next, pos: 'TL' };
    ok(targets.some(a => a.system === direct.system && a.pos === direct.pos), 'соседний нейтральный мир доступен');
    ok(!targets.some(a => a.system === enemy.system && a.pos === enemy.area), 'вражеский мир не предложен');
    // TR in the neighbouring system is held by the other cultist, but the
    // empty TL between it and the source cannot be crossed by a ground unit.
    ok(!targets.some(a => a.system === next && a.pos === 'TR'), 'до удалённого мира нет дружественной цепочки');
    eq(FS_RULES.apply(st, 0, { type: 'effect', answer: { area: { system: enemy.system, pos: enemy.area } } }).ok,
        false, 'поддельный вражеский пункт отвергнут');
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { area: direct } }).ok, 'допустимое перемещение');
    eq([st.units.find(u => u.id === source.id).system, st.units.find(u => u.id === source.id).area],
        [direct.system, direct.pos], 'культист прибыл');
    eq([st.order, st.pending, st.turn], [null, null, 1], 'приказ завершён');
});
check('Зараза хаоса', 'варп-шторм на границе не пропускает культиста в соседнюю систему', () => {
    const st = orderState('dominate', { faction: CHAOS, foeFaction: CHAOS_FOE,
        units: { 'культисты': 1 }, pos: 'TR' });
    const active = st.order.system, next = FS_RULES.neighbors(st, active)[0];
    const src = st.units.find(u => u.seat === 0);
    st.storms.push({ id: 'chaos-storm', system: active, side: FS_RULES.sideBetween(st, active, next), moved: false });
    ok(FS_RULES.apply(st, 0, { type: 'finishDominate' }).ok, 'выполнена способность');
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { units: [src.id] } }).ok, 'выбран культист');
    const q = st.pending?.question;
    ok(!q || q.options.every(a => a.system !== next), 'граница со штормом недоступна');
});

head('Боевые карты', CHAOS);
check(KHORNE, '1 `att. cube` покупает 3 `att. token`', () => {
    const st = chaosBattle({ card: KHORNE, dice: ['att', 'morale'] });
    chaosRun(st, 'general');
    eq(tokens(st, 'attacker').att, 3, 'три жетона атаки');
    return eq(count(st, 'attacker', 'att'), 0, 'кубик атаки потрачен');
});
check(KHORNE, 'противник платит `def. cube` и не деморализует отряд', () => {
    const st = chaosBattle({ card: KHORNE, foeDice: ['def', 'def'] });
    chaosRun(st, 'unit');
    eq(foeUnits(st).filter(u => u.routed).length, 0, 'отряд не деморализован');
    return eq(count(st, 'defender', 'def'), 1, 'один кубик обороны потрачен');
});
check(KHORNE, 'без платы противник выбирает и деморализует 1 свой отряд', () => {
    const st = chaosBattle({ card: KHORNE, foeDice: ['def', 'def'] });
    chaosRun(st, 'unit', chaosNoAvoid);
    return eq(foeUnits(st).filter(u => u.routed).length, 1, 'один вражеский отряд деморализован');
});
check('Отвратное поколение', 'верхняя способность даёт 1 `any cube`', () => {
    const st = chaosBattle({ card: 'Отвратное поколение', dice: ['att'] });
    const before = dice(st, 'attacker').length;
    chaosRun(st, 'general');
    return eq(dice(st, 'attacker').length, before + 1, 'кубик получен');
});
check('Отвратное поколение', 'нижняя способность считает недеморализованных культистов', () => {
    const st = chaosBattle({ card: 'Отвратное поколение', foeRouted: [0] });
    chaosRun(st, 'unit');
    return eq(tokens(st, 'attacker').def, 2, 'по жетону за двух культистов');
});
check('Отвратное поколение', 'подкрепление выполняет реквизит, только пока оно стоит в бою', () => {
    for (const chaos of [0, 1]) for (const space of [false, true]) for (const status of ['standing', 'routed', 'destroyed']) {
        const st = chaosTokenBattle(chaos, space), side = chaos === 0 ? 'attacker' : 'defender';
        const base = FS_RULES.reinforceTokenDef(st, side);
        const model = st.units.find(u => u.seat === chaos && u.unit === base.id);
        ok(!!model, 'исходная модель найдена');
        FS_RULES.destroyUnit(st, model); // a card resolved before this card removed the plastic model
        if (status !== 'standing') ok(FS_RULES.routeReinforcementToken(st, side, 0), 'жетон перевёрнут');
        if (status === 'destroyed') ok(FS_RULES.destroyReinforcementToken(st, side, 0, true), 'жетон уничтожен');
        const card = FS_DATA.combat.find(c => c.faction === CHAOS && c.name === 'Отвратное поколение');
        const steps = FS_RULES.cardSteps(JSON.parse(JSON.stringify(st)), chaos, card);
        eq(steps.some(s => s.op === 'gainToken'), status === 'standing', 'реквизит определяется живым недеморализованным жетоном');
    }
});
check('Отвратное поколение', 'подкрепления учитываются в условии и в счёте подходящих культистов', () => {
    for (const chaos of [0, 1]) for (const space of [false, true])
        for (const own of ['standing', 'routed', 'destroyed']) for (const foe of ['standing', 'routed', 'destroyed']) {
        const st = chaosTokenBattle(chaos, space), ownSide = chaos === 0 ? 'attacker' : 'defender';
        const foeSide = chaos === 0 ? 'defender' : 'attacker';
        if (own !== 'standing') ok(FS_RULES.routeReinforcementToken(st, ownSide, 0), 'свой жетон перевёрнут');
        if (own === 'destroyed') ok(FS_RULES.destroyReinforcementToken(st, ownSide, 0, true), 'свой жетон уничтожен');
        if (foe !== 'standing') ok(FS_RULES.routeReinforcementToken(st, foeSide, 0), 'чужой жетон перевёрнут');
        if (foe === 'destroyed') ok(FS_RULES.destroyReinforcementToken(st, foeSide, 0, true), 'чужой жетон уничтожен');
        const card = FS_DATA.combat.find(c => c.faction === CHAOS && c.name === 'Отвратное поколение');
        const steps = FS_EFFECTS.parse(card.unit, { kind: 'combat', faction: CHAOS });
        FS_RULES.runEffects(st, chaos, steps, { kind: 'combat', ctx: { side: ownSide } });
        answerAll(st, firstOption);
        eq(tokens(st, ownSide).def, foe === 'routed' ? (own === 'standing' ? 2 : 1) : 0,
            'только живой деморализованный враг включает условие; считаются стоящие свои');
    }
});
check('Тёмная вера', 'верхняя способность даёт 1 `morale cube`', () => {
    const st = chaosBattle({ card: 'Тёмная вера', dice: ['att'] });
    chaosRun(st, 'general');
    return eq(count(st, 'attacker', 'morale'), 1, 'кубик морали получен');
});
check('Тёмная вера', 'нижняя способность ставит культиста в ДРУГОЙ мир этой системы', () => {
    const st = chaosBattle({ card: 'Тёмная вера', dice: ['morale', 'morale'], foeDice: ['att'] });
    const before = st.units.filter(u => u.seat === 0).length;
    chaosRun(st, 'unit');
    const added = st.units.filter(u => u.seat === 0).slice(before);
    eq(added.length, 1, 'один культист размещён');
    ok(added[0].area !== st.combat.pos, 'мир не спорная область');
    return eq(added[0].system, st.combat.system, 'тот же система боя');
});
check('Соблазны Хаоса', 'согласившийся противник деморализует свой отряд и получает кубик', () => {
    const st = chaosBattle({ card: 'Соблазны Хаоса', foeDice: ['def'] });
    const before = dice(st, 'defender').length;
    chaosRun(st, 'general', branch(0));
    eq(foeUnits(st).filter(u => u.routed).length, 1, 'противник деморализовал отряд');
    return eq(dice(st, 'defender').length, before + 1, 'кубик достался противнику');
});
check('Соблазны Хаоса', 'отказ противника размещает 1 культиста в области боя', () => {
    const st = chaosBattle({ card: 'Соблазны Хаоса' });
    const before = st.units.filter(u => u.seat === 0).length;
    chaosRun(st, 'general', (s, q) => {
        if (q.op === 'foeAllow') return { no: true };
        return firstOption(s, q);
    });
    const added = st.units.filter(u => u.seat === 0).slice(before);
    eq(added.length, 1, 'размещён один отряд');
    ok(/культист/i.test((FS_RULES.unitOf(st, added[0]) || {}).name || ''), 'размещён культист');
    return eq([added[0].system, added[0].area], [st.combat.system, st.combat.pos], 'в области боя');
});
check('Соблазны Хаоса', 'согласие оплачивается действительным отрядом и кубик достаётся противнику', () => withFixedDice(['att'], () => {
    for (const chaos of [0, 1]) for (const space of [false, true]) {
        const foe = 1 - chaos, ownSide = chaos === 0 ? 'attacker' : 'defender', foeSide = foe === 0 ? 'attacker' : 'defender';
        let st = chaosTokenBattle(chaos, space);
        for (const u of st.units.filter(u => u.seat === foe).slice()) FS_RULES.destroyUnit(st, u);
        const beforeDice = dice(st, foeSide).length, beforeModels = st.units.length;
        const card = FS_DATA.combat.find(c => c.faction === CHAOS && c.name === 'Соблазны Хаоса');
        FS_RULES.runEffects(st, chaos, FS_EFFECTS.parse(card.general, { kind: 'combat', faction: CHAOS }),
            { kind: 'combat', ctx: { side: ownSide } });
        eq([pending(st)?.op, st.pending?.answerSeat], ['foeAllow', foe], 'противник решает, принимать ли сделку');
        st = JSON.parse(JSON.stringify(st));
        ok(FS_RULES.apply(st, foe, { type: 'effect', answer: { yes: true } }).ok, 'сделка принята после JSON');
        const token = 'reinforce-' + foeSide + '-0';
        eq([pending(st)?.op, st.pending?.answerSeat, pending(st)?.options], ['route', foe, [token]], 'цена — единственный жетон');
        const before = JSON.stringify(st);
        eq(FS_RULES.apply(st, foe, { type: 'effect', answer: { units: [] } }).ok, false, 'сделку нельзя исполнить без жертвы');
        eq(JSON.stringify(st), before, 'неверный ответ не закрывает вопрос');
        st = JSON.parse(JSON.stringify(st));
        ok(FS_RULES.apply(st, foe, { type: 'effect', answer: { units: [token] } }).ok, 'выбран жетон');
        ok(CombatTokens.of(st.combat).flipped(foeSide).includes(0), 'жетон деморализован');
        eq(dice(st, foeSide).length, beforeDice + 1, 'только противник получил кубик');
        eq(st.units.length, beforeModels, 'Хаос не получил бесплатной модели');
    }
}));
check('Соблазны Хаоса', 'без допустимого отряда противник не получает кубик, Хаос может разместить свой', () => withFixedDice(['att'], () => {
    for (const chaos of [0, 1]) for (const space of [false, true]) {
        const foe = 1 - chaos, ownSide = chaos === 0 ? 'attacker' : 'defender', foeSide = foe === 0 ? 'attacker' : 'defender';
        const st = chaosTokenBattle(chaos, space);
        for (const u of st.units.filter(u => u.seat === foe)) FS_RULES.routeUnit(st, u);
        ok(FS_RULES.routeReinforcementToken(st, foeSide, 0), 'чужое подкрепление тоже деморализовано');
        const beforeDice = dice(st, foeSide).length, beforeModels = st.units.filter(u => u.seat === chaos).length;
        const card = FS_DATA.combat.find(c => c.faction === CHAOS && c.name === 'Соблазны Хаоса');
        FS_RULES.runEffects(st, chaos, FS_EFFECTS.parse(card.general, { kind: 'combat', faction: CHAOS }),
            { kind: 'combat', ctx: { side: ownSide } });
        ok(!st.pending || st.pending.answerSeat === chaos, 'противнику нельзя предложить недоступную сделку');
        answerAll(st, (s, q) => q.kind === 'choice' ? { choice: space ? 1 : 0 } : firstOption(s, q));
        eq(dice(st, foeSide).length, beforeDice, 'противник без оплаты не получил кубик');
        eq(st.units.filter(u => u.seat === chaos).length, beforeModels + 1, 'Хаос разместил один бесплатный подходящий отряд');
    }
}));
check('Соблазны Хаоса', 'владелец может отказаться от способности и отдельно от размещения после отказа противника', () => {
    for (const chaos of [0, 1]) for (const space of [false, true]) for (const decline of ['ability', 'placement', 'neither']) {
        const foe = 1 - chaos, side = chaos === 0 ? 'attacker' : 'defender';
        let st = chaosTokenBattle(chaos, space);
        const card = FS_DATA.combat.find(c => c.faction === CHAOS && c.name === 'Соблазны Хаоса');
        const before = st.units.filter(u => u.seat === chaos).length;
        FS_RULES.runEffects(st, chaos, FS_EFFECTS.parse(card.general, { kind: 'combat', faction: CHAOS }),
            { kind: 'combat', ctx: { side }, optional: true });
        eq([pending(st)?.kind, st.pending?.answerSeat], ['ability', chaos], 'владелец сначала решает, использовать ли способность');
        st = JSON.parse(JSON.stringify(st));
        ok(FS_RULES.apply(st, chaos, { type: 'effect', answer: decline === 'ability' ? { no: true } : { yes: true } }).ok, 'первое решение');
        if (decline !== 'ability') {
            eq([pending(st)?.op, st.pending?.answerSeat], ['foeAllow', foe], 'противник решает о собственной сделке');
            ok(FS_RULES.apply(st, foe, { type: 'effect', answer: { no: true } }).ok, 'противник отказывается');
            eq([pending(st)?.kind, st.pending?.answerSeat], ['ability', chaos], 'размещение предложено владельцу отдельно');
            st = JSON.parse(JSON.stringify(st));
            ok(FS_RULES.apply(st, chaos, { type: 'effect', answer: decline === 'placement' ? { no: true } : { yes: true } }).ok, 'решение о размещении');
            if (decline === 'neither') {
                const names = pending(st)?.options || [];
                eq(names, [space ? 'эсминцы-класса-иконоборец' : 'культисты'], 'предложен только тип, подходящий области');
                answerAll(st, firstOption);
            }
        }
        eq(st.units.filter(u => u.seat === chaos).length, before + (decline === 'neither' ? 1 : 0), 'размещение только при согласии');
        eq(st.pending, null, 'действие завершено');
    }
});
check('Соблазны Хаоса', 'вскрытая боевая карта предлагает владельцу и противнику правильные решения', () => withFixedDice(['att'], () => {
    for (const chaos of [0, 1]) for (const space of [false, true])
        for (const decision of ['skip', 'accept', 'refuse-place', 'refuse-skip']) {
        const foe = 1 - chaos, side = chaos === 0 ? 'attacker' : 'defender', foeSide = foe === 0 ? 'attacker' : 'defender';
        let st = chaosTokenBattle(chaos, space);
        st.combat.cards[side].hand = ['Соблазны Хаоса', 'Соблазны Хаоса'];
        st.combat.cards[foeSide].hand = ['Ложись!', 'Ложись!'];
        const models = st.units.filter(u => u.seat === chaos).length, foeDice = dice(st, foeSide).length;
        for (const seat of [0, 1]) ok(FS_RULES.apply(st, seat, { type: 'combat', action: 'playCard', index: 0 }).ok, 'обе карты действительно выбраны');
        // When Chaos defends, skip the Guard card first, without skipping the
        // opponent decisions made by the Chaos card itself.
        for (let i = 0; st.pending && st.pending.seat !== chaos && i < 8; i++) {
            const q = pending(st), who = st.pending.answerSeat;
            ok(FS_RULES.apply(st, who, { type: 'effect', answer: q.kind === 'ability' ? { no: true } : firstOption(st, q) }).ok, 'карта гвардии завершена');
        }
        eq([st.pending?.seat, pending(st)?.kind], [chaos, 'ability'], 'вскрытая карта сначала спрашивает владельца');
        st = JSON.parse(JSON.stringify(st));
        ok(FS_RULES.apply(st, chaos, { type: 'effect', answer: decision === 'skip' ? { no: true } : { yes: true } }).ok, 'решение владельца');
        if (decision !== 'skip') {
            eq([pending(st)?.op, st.pending?.answerSeat], ['foeAllow', foe], 'противник решает, принять ли сделку');
            st = JSON.parse(JSON.stringify(st));
            ok(FS_RULES.apply(st, foe, { type: 'effect', answer: decision === 'accept' ? { yes: true } : { no: true } }).ok, 'решение противника');
            if (decision === 'accept') {
                eq([pending(st)?.op, st.pending?.answerSeat], ['route', foe], 'цель выбирает противник');
                const token = 'reinforce-' + foeSide + '-0';
                ok(pending(st).options.includes(token), 'жетон — действительная цель');
                eq(FS_RULES.apply(st, foe, { type: 'effect', answer: { units: [] } }).ok, false, 'принятую сделку нельзя завершить без отряда');
                ok(FS_RULES.apply(st, foe, { type: 'effect', answer: { units: [token] } }).ok, 'подкрепление деморализовано');
                ok(CombatTokens.of(st.combat).flipped(foeSide).includes(0), 'жетон действительно деморализован');
                eq(dice(st, foeSide).length, foeDice + 1, 'противник получил кубик');
            } else {
                eq([pending(st)?.kind, st.pending?.answerSeat], ['ability', chaos], 'размещение отдельно предлагается владельцу');
                st = JSON.parse(JSON.stringify(st));
                ok(FS_RULES.apply(st, chaos, { type: 'effect', answer: decision === 'refuse-place' ? { yes: true } : { no: true } }).ok, 'решение о размещении');
                if (decision === 'refuse-place') {
                    eq(pending(st)?.kind, 'types', 'выбор подходящего типа');
                    ok(FS_RULES.apply(st, chaos, { type: 'effect', answer: { type: space ? 'эсминцы-класса-иконоборец' : 'культисты' } }).ok, 'выбран подходящий тип');
                    eq([pending(st)?.kind, pending(st)?.options], ['areas', [{ system: st.combat.system, pos: st.combat.pos }]], 'предложена только спорная область');
                    st = JSON.parse(JSON.stringify(st));
                    ok(FS_RULES.apply(st, chaos, { type: 'effect', answer: { area: pending(st).options[0] } }).ok, 'отряд размещён после JSON');
                }
                eq(dice(st, foeSide).length, foeDice, 'отказ не выдал противнику кубик');
            }
        }
        eq(st.units.filter(u => u.seat === chaos).length, models + Number(decision === 'refuse-place'), 'модель размещена только по отдельному согласию');
        for (let i = 0; st.pending && i < 12; i++) {
            const q = pending(st), who = st.pending.answerSeat;
            ok(FS_RULES.apply(st, who, { type: 'effect', answer: q.kind === 'ability' ? { no: true } : firstOption(st, q) }).ok, 'оставшиеся способности пропущены');
        }
        eq(st.pending, null, 'вскрытие карты завершено');
    }
}));
check('Соблазны Хаоса', 'нижняя способность: 2 `att. token` или 2 `def. token`', () => {
    const a = chaosBattle({ card: 'Соблазны Хаоса' });
    chaosRun(a, 'unit', branch(0));
    eq(tokens(a, 'attacker').att, 2, 'ветка атаки');
    const b = chaosBattle({ card: 'Соблазны Хаоса' });
    chaosRun(b, 'unit', branch(1));
    return eq(tokens(b, 'attacker').def, 2, 'ветка обороны');
});
check('Нечистые намерения', 'при большем числе `morale cube` восстанавливает свой отряд', () => {
    const st = chaosBattle({ card: 'Нечистые намерения', routed: [0],
        dice: ['morale', 'morale'], foeDice: ['att'] });
    chaosRun(st, 'general');
    return eq(myUnits(st).filter(u => u.routed).length, 0, 'отряд восстановлен');
});
check('Нечистые намерения', 'после принятия восстановления выбрать отряд обязательно', () => {
    for (const chaos of [0, 1]) for (const space of [false, true]) {
        const side = chaos === 0 ? 'attacker' : 'defender';
        let st = chaosTokenBattle(chaos, space);
        ok(FS_RULES.routeReinforcementToken(st, side, 0), 'свой жетон деморализован');
        const card = FS_DATA.combat.find(c => c.faction === CHAOS && c.name === 'Нечистые намерения');
        FS_RULES.runEffects(st, chaos, FS_EFFECTS.parse(card.general, { kind: 'combat', faction: CHAOS }),
            { kind: 'combat', ctx: { side }, optional: true });
        eq(pending(st)?.kind, 'ability', 'способность можно пропустить до исполнения');
        ok(FS_RULES.apply(st, chaos, { type: 'effect', answer: { yes: true } }).ok, 'способность принята');
        eq(pending(st)?.op, 'restore', 'требуется восстановление');
        const before = JSON.stringify(st);
        eq(FS_RULES.apply(st, chaos, { type: 'effect', answer: { units: [] } }).ok, false, 'нельзя пропустить уже принятое восстановление');
        eq(JSON.stringify(st), before, 'пустой ответ не меняет состояние');
        st = JSON.parse(JSON.stringify(st));
        ok(FS_RULES.apply(st, chaos, { type: 'effect', answer: { units: ['reinforce-' + side + '-0'] } }).ok, 'жетон восстановлен после JSON');
        ok(!CombatTokens.of(st.combat).flipped(side).includes(0), 'подкрепление стоит');
    }
});
check('Нечистые намерения', 'отказ противника даёт жетоны за культистов', () => {
    const st = chaosBattle({ card: 'Нечистые намерения' });
    chaosRun(st, 'unit', chaosFoeNo);
    return eq(tokens(st, 'attacker').att, 2, 'два жетона атаки за двух культистов');
});
check('Нечистые намерения', 'согласие противника деморализует его отряд без жетонов', () => {
    const st = chaosBattle({ card: 'Нечистые намерения' });
    chaosRun(st, 'unit');
    eq(tokens(st, 'attacker').att, 0, 'жетонов нет');
    return eq(foeUnits(st).filter(u => u.routed).length, 1, 'вражеский отряд деморализован');
});

// --- 04-combat-cards.md: 9 улучшений ---------------------------------------
check('Отметка Кхорна', '1 `att. cube` ИЛИ 1 `morale cube` покупает 3 `att. token`', () => {
    const st = chaosBattle({ card: 'Отметка Кхорна', dice: ['morale', 'morale'] });
    chaosRun(st, 'general');
    eq(tokens(st, 'attacker').att, 3, 'три жетона атаки');
    return eq(count(st, 'attacker', 'morale'), 1, 'можно потратить кубик морали');
});
check('Отметка Кхорна', 'без `def. cube` уничтожается 1 деморализованный отряд противника', () => {
    const st = chaosBattle({ card: 'Отметка Кхорна', foeRouted: [0], foeDice: ['def'] });
    const victim = foeUnits(st).find(u => u.routed);
    chaosRun(st, 'unit', chaosNoAvoid);
    return eq(stateUnit(st, victim.id), null, 'деморализованный отряд уничтожен');
});
check('Отметка Кхорна', 'противник не может пропустить уничтожение своего единственного деморализованного жетона', () => {
    for (const chaos of [0, 1]) for (const space of [false, true]) {
        const foe = 1 - chaos, foeSide = foe === 0 ? 'attacker' : 'defender';
        let st = chaosTokenBattle(chaos, space);
        for (const u of st.units.filter(u => u.seat === foe).slice()) FS_RULES.destroyUnit(st, u);
        ok(FS_RULES.routeReinforcementToken(st, foeSide, 0), 'чужой жетон деморализован');
        chaosTokenEffect(st, chaos, 'Отметка Кхорна', 'unit', 'destroy');
        const token = 'reinforce-' + foeSide + '-0';
        eq([st.pending.answerSeat, pending(st).options], [foe, [token]], 'противник сам выбирает жетон');
        const before = JSON.stringify(st);
        eq(FS_RULES.apply(st, foe, { type: 'effect', answer: { units: [] } }).ok, false, 'пустой выбор не отменяет обязательный эффект');
        eq(JSON.stringify(st), before, 'отклонённый ответ не меняет состояние');
        st = JSON.parse(JSON.stringify(st));
        ok(FS_RULES.apply(st, foe, { type: 'effect', answer: { units: [token] } }).ok, 'выбор после JSON');
        ok(!CombatTokens.of(st.combat).alive(foeSide, 0), 'жетон уничтожен');
    }
});
check('Отметка Слаанеш', '1 `any cube` и деморализация при большем числе морали', () => {
    const st = chaosBattle({ card: 'Отметка Слаанеш', dice: ['morale', 'morale'], foeDice: ['att'] });
    const before = dice(st, 'attacker').length;
    chaosRun(st, 'general');
    eq(dice(st, 'attacker').length, before + 1, 'кубик получен');
    return eq(foeUnits(st).filter(u => u.routed).length, 1, 'вражеский отряд деморализован');
});
check('Отметка Слаанеш', 'нижняя способность ставит культиста в мир боя при деморализованном враге', () => {
    const st = chaosBattle({ card: 'Отметка Слаанеш', foeRouted: [0] });
    const before = st.units.filter(u => u.seat === 0).length;
    chaosRun(st, 'unit');
    const added = st.units.filter(u => u.seat === 0).slice(before);
    eq(added.length, 1, 'культист размещён');
    return eq([added[0].system, added[0].area], [st.combat.system, st.combat.pos], 'в мире боя');
});
check('Отметка Тзинча', '1 `morale cube` и замена культиста на космодесантника хаоса', () => {
    const st = chaosBattle({ card: 'Отметка Тзинча', dice: ['morale'], foeDice: ['att'] });
    const cultist = myUnits(st).find(u => /культист/i.test((FS_RULES.unitOf(st, u) || {}).name || ''));
    chaosRun(st, 'general');
    eq(count(st, 'attacker', 'morale'), 2, 'кубик морали получен до проверки');
    return ok(/космодесант хаоса/i.test((FS_RULES.unitOf(st, stateUnit(st, cultist.id)) || {}).name || ''), 'культист заменён');
});
check('Отметка Тзинча', 'до 2 `morale cube` дают по кубику за каждый потраченный', () => {
    const st = chaosBattle({ card: 'Отметка Тзинча', dice: ['morale', 'morale', 'morale'] });
    chaosRun(st, 'unit', branch(0));
    eq(count(st, 'attacker', 'att'), 2, 'два кубика атаки за два потраченных');
    return eq(count(st, 'attacker', 'morale'), 1, 'два кубика морали потрачены');
});
check('Отметка Нургла', '1 `def. cube` ИЛИ 1 `morale cube` покупает 3 `def. token`', () => {
    const st = chaosBattle({ card: 'Отметка Нургла', dice: ['morale', 'morale'] });
    chaosRun(st, 'general');
    eq(tokens(st, 'attacker').def, 3, 'три жетона обороны');
    return eq(count(st, 'attacker', 'morale'), 1, 'кубик морали потрачен');
});
check('Отметка Нургла', 'отказ противника даёт 2 `def. token`', () => {
    const st = chaosBattle({ card: 'Отметка Нургла', foeRouted: [0] });
    chaosRun(st, 'unit', chaosFoeNo);
    return eq(tokens(st, 'attacker').def, 2, 'два жетона обороны');
});
check('Объединённый Хаос', 'отказ противника даёт 1 из трёх кубиков на выбор', () => {
    const st = chaosBattle({ card: 'Объединённый Хаос', dice: ['att'] });
    let first = true;
    chaosRun(st, 'general', (s, q) => {
        if (q.op === 'foeAllow') return { no: true };
        if (q.kind === 'choice') { const n = first ? 2 : 0; first = false; return { choice: n }; }
        return firstOption(s, q);
    });
    return eq(count(st, 'attacker', 'morale'), 1, 'выбран кубик морали');
});
check('Объединённый Хаос', 'согласие противника деморализует любой его отряд', () => {
    const st = chaosBattle({ card: 'Объединённый Хаос' });
    chaosRun(st, 'general');
    return eq(foeUnits(st).filter(u => u.routed).length, 1, 'отряд деморализован');
});
check('Объединённый Хаос', 'КЛ перемещённого отряда не выше числа культистов в системе', () => {
    const st = chaosBattle({ card: 'Объединённый Хаос' });
    const sys = FS_RULES.system(st, st.combat.system);
    const other = sys.areas.find(a => a.world && a.pos !== st.combat.pos);
    const titan = FS_RULES.addUnit(st, 0, 'титаны-хаоса-класса-налетчик', sys.id, other.pos);
    let options = null;
    chaosRun(st, 'unit', (s, q) => {
        if (q.op === 'moveUnit' && !options) options = (q.options || []).slice();
        return firstOption(s, q);
    });
    ok(!!options, 'вопрос о перемещении не задан');
    ok(!options.includes(titan.id), 'титан КЛ 3 не предлагается при двух культистах');
    return eq(stateUnit(st, titan.id).area, other.pos, 'титан остался на месте');
});
check('Нечеловеческая сила', 'выбор даёт 1 `att. cube` или 1 `def. cube`', () => {
    const a = chaosBattle({ card: 'Нечеловеческая сила', dice: ['morale'] });
    chaosRun(a, 'general', branch(0));
    eq(count(a, 'attacker', 'att'), 1, 'ветка атаки');
    const b = chaosBattle({ card: 'Нечеловеческая сила', dice: ['morale'] });
    chaosRun(b, 'general', branch(1));
    return eq(count(b, 'attacker', 'def'), 1, 'ветка обороны');
});
check('Нечеловеческая сила', 'уничтожение своего отряда даёт 4 `att. token`', () => {
    const st = chaosBattle({ card: 'Нечеловеческая сила' });
    const before = myUnits(st).length;
    chaosRun(st, 'unit');
    eq(myUnits(st).length, before - 1, 'свой отряд уничтожен');
    return eq(tokens(st, 'attacker').att, 4, 'четыре жетона атаки');
});
check('Нечеловеческая сила', 'свой жетон, в том числе деморализованный, оплачивает способность без расхода модели', () => {
    for (const chaos of [0, 1]) for (const space of [false, true]) for (const routed of [false, true]) {
        const ownSide = chaos === 0 ? 'attacker' : 'defender', foeSide = chaos === 0 ? 'defender' : 'attacker';
        let st = chaosTokenBattle(chaos, space);
        if (routed) ok(FS_RULES.routeReinforcementToken(st, ownSide, 0), 'свой жетон деморализован');
        const token = 'reinforce-' + ownSide + '-0';
        const type = FS_RULES.reinforceTokenDef(st, ownSide).id;
        const supply = st.players[chaos].supply.units[type], assets = st.players[chaos].assets.reinforcement;
        chaosTokenEffect(st, chaos, 'Нечеловеческая сила', 'unit', 'destroy');
        ok(pending(st).options.includes(token), 'жетон предложен для оплаты');
        const before = JSON.stringify(st);
        for (const forged of [['reinforce-' + foeSide + '-0'], [token, token], token, null]) {
            eq(FS_RULES.apply(st, chaos, { type: 'effect', answer: { units: forged } }).ok, false, 'чужая, повторная или некорректная цель отклонена');
            eq(JSON.stringify(st), before, 'недопустимый ответ не меняет бой');
        }
        st = JSON.parse(JSON.stringify(st));
        ok(FS_RULES.apply(st, chaos, { type: 'effect', answer: { units: [token] } }).ok, 'своя жертва выбрана после JSON');
        eq(CombatTokens.of(st.combat).alive(ownSide, 0), false, 'жетон уничтожен');
        eq(tokens(st, ownSide).att, 4, 'получены четыре жетона атаки');
        eq([st.players[chaos].supply.units[type], st.players[chaos].assets.reinforcement], [supply, assets],
            'ни запас пластиковых моделей, ни ресурсы не растут');
        ok(CombatTokens.of(st.combat).alive(foeSide, 0), 'противник не затронут');
    }
});
check('Нечеловеческая сила', 'отказ возможен до способности; после согласия точная жертва обязательна', () => {
    for (const chaos of [0, 1]) for (const space of [false, true]) for (const accept of [false, true]) {
        const side = chaos === 0 ? 'attacker' : 'defender';
        let st = chaosTokenBattle(chaos, space);
        const card = FS_DATA.combat.find(c => c.faction === CHAOS && c.name === 'Нечеловеческая сила');
        FS_RULES.runEffects(st, chaos, FS_EFFECTS.parse(card.unit, { kind: 'combat', faction: CHAOS }),
            { kind: 'combat', ctx: { side }, optional: true });
        eq([pending(st)?.kind, st.pending?.answerSeat], ['ability', chaos], 'владелец решает до исполнения');
        st = JSON.parse(JSON.stringify(st));
        ok(FS_RULES.apply(st, chaos, { type: 'effect', answer: accept ? { yes: true } : { no: true } }).ok, 'решение принято');
        if (!accept) {
            eq(tokens(st, side).att, 0, 'без жертвы нет жетонов атаки');
            eq(st.pending, null, 'отказ закрывает способность');
        } else {
            eq(pending(st)?.op, 'destroy', 'предложена жертва');
            const before = JSON.stringify(st);
            eq(FS_RULES.apply(st, chaos, { type: 'effect', answer: { units: [] } }).ok, false, 'пустой выбор не отменяет принятую способность');
            eq(JSON.stringify(st), before, 'отклонённый ответ не меняет состояние');
            ok(FS_RULES.apply(st, chaos, { type: 'effect', answer: { units: ['reinforce-' + side + '-0'] } }).ok, 'жетон выбран');
            eq(tokens(st, side).att, 4, 'награда после жертвы');
        }
    }
});
check('Демоническая гибкость', 'выбор даёт 1 `def. cube` или 1 `morale cube`', () => {
    const a = chaosBattle({ card: 'Демоническая гибкость', dice: ['att'] });
    chaosRun(a, 'general', branch(0));
    eq(count(a, 'attacker', 'def'), 1, 'ветка обороны');
    const b = chaosBattle({ card: 'Демоническая гибкость', dice: ['att'] });
    chaosRun(b, 'general', branch(1));
    return eq(count(b, 'attacker', 'morale'), 1, 'ветка морали');
});
check('Демоническая гибкость', 'отказ противника даёт 4 `def. token`', () => {
    const st = chaosBattle({ card: 'Демоническая гибкость' });
    chaosRun(st, 'unit', chaosFoeNo);
    return eq(tokens(st, 'attacker').def, 4, 'четыре жетона обороны');
});
check('Демоническая гибкость', 'согласие противника уничтожает 1 его отряд', () => {
    const st = chaosBattle({ card: 'Демоническая гибкость' });
    const before = foeUnits(st).length;
    chaosRun(st, 'unit');
    return eq(foeUnits(st).length, before - 1, 'вражеский отряд уничтожен');
});
check('Демоническая гибкость', 'согласие противника требует реальной жертвы, в том числе жетона', () => {
    const cards = [
        ['Нечистые намерения', 'unit', 'route', false],
        ['Объединённый Хаос', 'general', 'route', false],
        ['Отметка Нургла', 'unit', 'destroy', true],
        ['Демоническая гибкость', 'unit', 'destroy', true],
    ];
    for (const chaos of [0, 1]) for (const space of [false, true]) for (const [name, panel, op, routed] of cards) {
        const foe = 1 - chaos, foeSide = foe === 0 ? 'attacker' : 'defender';
        let st = chaosTokenBattle(chaos, space);
        for (const u of st.units.filter(u => u.seat === foe).slice()) FS_RULES.destroyUnit(st, u);
        if (routed) ok(FS_RULES.routeReinforcementToken(st, foeSide, 0), 'жетон заранее деморализован');
        const type = FS_RULES.reinforceTokenDef(st, foeSide).id;
        const supply = st.players[foe].supply.units[type], asset = st.players[foe].assets.reinforcement;
        chaosTokenEffect(st, chaos, name, panel, 'foeAllow');
        eq(st.pending.answerSeat, foe, name + ': решает противник');
        st = JSON.parse(JSON.stringify(st));
        ok(FS_RULES.apply(st, foe, { type: 'effect', answer: { yes: true } }).ok, name + ': согласие после JSON');
        const token = 'reinforce-' + foeSide + '-0';
        eq([pending(st)?.op, st.pending?.answerSeat, pending(st)?.options], [op, foe, [token]], name + ': только жетон в качестве цели');
        const before = JSON.stringify(st);
        for (const answer of [{ units: [] }, { units: [token, token] }, { units: ['nonexistent'] }]) {
            eq(FS_RULES.apply(st, foe, { type: 'effect', answer }).ok, false, name + ': согласие нельзя исполнить без цели');
            eq(JSON.stringify(st), before, name + ': неверный ответ не меняет состояние');
        }
        st = JSON.parse(JSON.stringify(st));
        ok(FS_RULES.apply(st, foe, { type: 'effect', answer: { units: [token] } }).ok, name + ': цель выбрана после JSON');
        if (op === 'route') ok(CombatTokens.of(st.combat).flipped(foeSide).includes(0), name + ': жетон деморализован');
        else ok(!CombatTokens.of(st.combat).alive(foeSide, 0), name + ': жетон уничтожен');
        eq([st.players[foe].supply.units[type], st.players[foe].assets.reinforcement], [supply, asset], name + ': жертва не создаёт модель или ресурс');
    }
});
check('Демоническая гибкость', 'старые сохранённые вопросы сохраняют обязательность выбора после согласия', () => {
    for (const chaos of [0, 1]) for (const space of [false, true]) for (const op of ['route', 'destroy', 'restore', 'all']) {
        const foe = 1 - chaos, side = chaos === 0 ? 'attacker' : 'defender';
        let st = chaosTokenBattle(chaos, space), answerer = chaos;
        if (op === 'route') {
            chaosTokenEffect(st, chaos, 'Нечистые намерения', 'unit', 'foeAllow');
            ok(FS_RULES.apply(st, foe, { type: 'effect', answer: { yes: true } }).ok, 'согласие на деморализацию');
            answerer = foe;
        } else if (op === 'destroy') {
            chaosTokenEffect(st, chaos, 'Демоническая гибкость', 'unit', 'foeAllow');
            ok(FS_RULES.apply(st, foe, { type: 'effect', answer: { yes: true } }).ok, 'согласие на уничтожение');
            answerer = foe;
        } else if (op === 'restore') {
            ok(FS_RULES.routeReinforcementToken(st, side, 0), 'свой жетон деморализован');
            chaosTokenEffect(st, chaos, 'Нечистые намерения', 'general', 'restore');
        } else chaosTokenEffect(st, chaos, 'Хаос всепобеждающий', 'general', 'route');
        for (const legacy of ['absent', 'atMost']) {
            const old = JSON.parse(JSON.stringify(st));
            if (legacy === 'absent') delete old.pending.question.strictUnits;
            else old.pending.question.strictUnits = 'atMost';
            const oldStep = old.pending.choice || old.pending.steps[old.pending.index];
            delete oldStep.strict;
            const before = JSON.stringify(old), q = pending(old);
            const partial = q.n > 1 ? q.options.slice(0, q.n - 1) : [];
            eq(FS_RULES.apply(old, answerer, { type: 'effect', answer: { units: partial } }).ok, false,
                op + ': старый частичный выбор отвергается');
            eq(JSON.stringify(old), before, 'ошибочный ответ не меняет сохранение');
            ok(FS_RULES.apply(old, answerer, { type: 'effect', answer: { units: q.options.slice(0, q.n) } }).ok,
                op + ': полный ответ принимается после JSON');
        }
    }
});
check('Демоническая гибкость', 'если согласиться невозможно, применяется ветвь отказа без пустого выбора', () => withFixedDice(['att'], () => {
    const cards = [
        ['Нечистые намерения', 'unit', 'allRouted', 'att', 2],
        ['Объединённый Хаос', 'general', 'allRouted', 'die', 1],
        ['Отметка Нургла', 'unit', 'noneRouted', 'def', 2],
        ['Демоническая гибкость', 'unit', 'allDestroyed', 'def', 4],
    ];
    for (const chaos of [0, 1]) for (const space of [false, true]) for (const [name, panel, mode, kind, want] of cards) {
        const foe = 1 - chaos, ownSide = chaos === 0 ? 'attacker' : 'defender', foeSide = foe === 0 ? 'attacker' : 'defender';
        const st = chaosTokenBattle(chaos, space);
        if (mode === 'allRouted') {
            for (const u of st.units.filter(u => u.seat === foe)) FS_RULES.routeUnit(st, u);
            ok(FS_RULES.routeReinforcementToken(st, foeSide, 0), name + ': чужой жетон деморализован');
        } else if (mode === 'allDestroyed') {
            for (const u of st.units.filter(u => u.seat === foe).slice()) FS_RULES.destroyUnit(st, u);
            ok(FS_RULES.destroyReinforcementToken(st, foeSide, 0, true), name + ': чужой жетон уничтожен');
        }
        const card = FS_DATA.combat.find(c => c.faction === CHAOS && c.name === name);
        FS_RULES.runEffects(st, chaos, FS_EFFECTS.parse(panel === 'general' ? card.general : card.unit,
            { kind: 'combat', faction: CHAOS }), { kind: 'combat', ctx: { side: ownSide } });
        ok(pending(st)?.op !== 'foeAllow', name + ': невозможно согласиться на недоступное действие');
        answerAll(st, firstOption);
        eq(kind === 'die' ? count(st, ownSide, 'att') : tokens(st, ownSide)[kind], want, name + ': результат невозможного согласия');
    }
}));
check('Смерть и отчаяние', 'за 2 потраченных `morale cube` уничтожаются 2 отряда КЛ 0', () => {
    const st = chaosBattle({ card: 'Смерть и отчаяние', dice: ['morale', 'morale'], foeDice: ['att'] });
    const before = st.units.length;
    chaosRun(st, 'general', branch(0));
    eq(count(st, 'attacker', 'morale'), 0, 'оба кубика морали потрачены');
    return eq(st.units.length, before - 2, 'уничтожено два КЛ-0 отряда');
});
check('Смерть и отчаяние', 'нижняя способность уничтожает деморализованный отряд противника', () => {
    const st = chaosBattle({ card: 'Смерть и отчаяние', dice: ['morale', 'morale'], foeDice: ['att'], foeRouted: [0] });
    const victim = foeUnits(st).find(u => u.routed);
    chaosRun(st, 'unit');
    return eq(stateUnit(st, victim.id), null, 'деморализованный отряд уничтожен');
});
check('Хаос всепобеждающий', '2 `any cube` и все вражеские отряды КЛ 0 деморализованы', () => {
    const st = chaosBattle({ card: 'Хаос всепобеждающий', dice: ['morale', 'morale'], foeDice: ['att'] });
    const kl0 = foeUnits(st).filter(u => (FS_RULES.unitOf(st, u) || {}).kl === 0);
    const high = foeUnits(st).filter(u => (FS_RULES.unitOf(st, u) || {}).kl > 0);
    chaosRun(st, 'general');
    ok(kl0.length >= 1, 'у противника есть отряды КЛ 0');
    ok(kl0.every(u => stateUnit(st, u.id).routed), 'все КЛ 0 деморализованы');
    ok(high.every(u => !stateUnit(st, u.id).routed), 'старшие отряды не тронуты');
    return eq(dice(st, 'attacker').length, 4, 'два полученных кубика');
});
check('Хаос всепобеждающий', 'нижняя способность деморализует 1 вражеский отряд на выбор', () => {
    const st = chaosBattle({ card: 'Хаос всепобеждающий' });
    chaosRun(st, 'unit');
    return eq(foeUnits(st).filter(u => u.routed).length, 1, 'один отряд деморализован');
});

check('Хаос всепобеждающий', 'обе способности деморализуют жетоны, а «все» нельзя исполнить частично', () => withFixedDice(['att'], () => {
    for (const chaos of [0, 1]) for (const space of [false, true]) for (const panel of ['general', 'unit']) {
        const ownSide = chaos === 0 ? 'attacker' : 'defender', foeSide = chaos === 0 ? 'defender' : 'attacker';
        let st = chaosTokenBattle(chaos, space);
        const token = 'reinforce-' + foeSide + '-0';
        chaosTokenEffect(st, chaos, 'Хаос всепобеждающий', panel, 'route');
        ok(pending(st).options.includes(token), 'подкрепление противника предложено');
        if (panel === 'general') {
            const expected = st.units.filter(u => u.seat !== chaos && (FS_RULES.unitOf(st, u)?.kl || 0) === 0).map(u => u.id);
            eq(pending(st).n, expected.length + 1, 'все модели КЛ 0 и жетон деморализуются');
            for (const id of expected) ok(pending(st).options.includes(id), 'модель тоже предложена');
        }
        const before = JSON.stringify(st);
        const forged = panel === 'general' ? [token] : ['reinforce-' + ownSide + '-0'];
        eq(FS_RULES.apply(st, chaos, { type: 'effect', answer: { units: forged } }).ok, false, 'частичный или поддельный ответ отклонён');
        eq(JSON.stringify(st), before, 'неверный ответ не меняет состояние');
        st = JSON.parse(JSON.stringify(st));
        const chosen = panel === 'general' ? pending(st).options.slice() : [token];
        ok(FS_RULES.apply(st, chaos, { type: 'effect', answer: { units: chosen } }).ok, 'ответ после JSON');
        eq(CombatTokens.of(st.combat).flipped(foeSide).includes(0), true, 'жетон перевёрнут');
        if (panel === 'general') ok(st.units.filter(u => u.seat !== chaos && (FS_RULES.unitOf(st, u)?.kl || 0) === 0)
            .every(u => u.routed), 'все вражеские модели КЛ 0 деморализованы');
        eq(CombatTokens.of(st.combat).flipped(ownSide).includes(0), false, 'свой жетон не затронут');
    }
}));

check('Смерть и отчаяние', 'обе способности выбирают живые и деморализованные жетоны как отряды КЛ 0', () => withFixedDice(['att'], () => {
    for (const chaos of [0, 1]) for (const space of [false, true]) for (const panel of ['general', 'unit']) {
        const ownSide = chaos === 0 ? 'attacker' : 'defender', foeSide = chaos === 0 ? 'defender' : 'attacker';
        let st = chaosTokenBattle(chaos, space);
        const token = 'reinforce-' + foeSide + '-0';
        ok(FS_RULES.routeReinforcementToken(st, foeSide, 0), 'жетон заранее деморализован');
        const ownDef = FS_RULES.reinforceTokenDef(st, ownSide).id, foeDef = FS_RULES.reinforceTokenDef(st, foeSide).id;
        const beforeSupply = [st.players[chaos].supply.units[ownDef], st.players[1 - chaos].supply.units[foeDef]];
        const beforeAssets = st.players.map(p => p.assets.reinforcement);
        chaosTokenEffect(st, chaos, 'Смерть и отчаяние', panel, 'destroy');
        ok(pending(st).options.includes(token), 'деморализованный жетон предложен');
        if (panel === 'general') ok(pending(st).options.includes('reinforce-' + ownSide + '-0'), 'верхняя способность допускает обе стороны');
        st = JSON.parse(JSON.stringify(st));
        ok(FS_RULES.apply(st, chaos, { type: 'effect', answer: { units: [token] } }).ok, 'выбор после JSON');
        eq(CombatTokens.of(st.combat).alive(foeSide, 0), false, 'жетон уничтожен');
        eq([st.players[chaos].supply.units[ownDef], st.players[1 - chaos].supply.units[foeDef]], beforeSupply, 'запас моделей не вырос');
        eq(st.players.map(p => p.assets.reinforcement), beforeAssets, 'жетоны не возвращены как ресурс');
    }
}));

check('Смерть и отчаяние', 'две потраченные морали уничтожают два разных КЛ 0, нулевая трата — ни одного', () => withFixedDice(['att'], () => {
    for (const chaos of [0, 1]) for (const space of [false, true]) for (const spend of [false, true]) {
        const foe = 1 - chaos, ownSide = chaos === 0 ? 'attacker' : 'defender', foeSide = foe === 0 ? 'attacker' : 'defender';
        let st = chaosTokenBattle(chaos, space);
        // A routed token remains a valid direct-destruction target.
        ok(FS_RULES.routeReinforcementToken(st, foeSide, 0), 'чужой жетон перевёрнут');
        const card = FS_DATA.combat.find(c => c.faction === CHAOS && c.name === 'Смерть и отчаяние');
        FS_RULES.runEffects(st, chaos, FS_EFFECTS.parse(card.general, { kind: 'combat', faction: CHAOS }),
            { kind: 'combat', ctx: { side: ownSide } });
        for (let i = 0; i < 8 && st.pending && pending(st).op !== 'spendDie'; i++) {
            const seat = st.pending.answerSeat === undefined ? st.pending.seat : st.pending.answerSeat;
            ok(FS_RULES.apply(st, seat, { type: 'effect', answer: firstOption(st, pending(st)) }).ok, 'выбрана награда');
        }
        eq(pending(st)?.op, 'spendDie', 'предложена трата морали');
        ok(FS_RULES.apply(st, chaos, { type: 'effect', answer: { dice: spend ? [0, 1] : [] } }).ok, 'трата');
        if (!spend) {
            ok(!st.pending || pending(st).op !== 'destroy', 'нулевая трата не предлагает уничтожения');
            ok(CombatTokens.of(st.combat).alive(ownSide, 0) && CombatTokens.of(st.combat).alive(foeSide, 0), 'оба жетона целы');
            continue;
        }
        const targets = ['reinforce-' + ownSide + '-0', 'reinforce-' + foeSide + '-0'];
        eq([pending(st)?.op, pending(st)?.n], ['destroy', 2], 'за две морали выбираются два отряда');
        for (const id of targets) ok(pending(st).options.includes(id), 'каждый жетон предложен');
        for (const id of pending(st).options) {
            if (!id.startsWith('reinforce-')) eq(FS_RULES.unitOf(st, st.units.find(u => u.id === id)).kl, 0, 'цели с более высоким КЛ исключены');
        }
        const before = JSON.stringify(st);
        for (const bad of [[], [targets[0]], [targets[0], targets[0]], [targets[0], 'nonexistent']]) {
            eq(FS_RULES.apply(st, chaos, { type: 'effect', answer: { units: bad } }).ok, false, 'частичный, повторный или поддельный ответ отклонён');
            eq(JSON.stringify(st), before, 'неверный ответ не меняет состояние');
        }
        st = JSON.parse(JSON.stringify(st));
        ok(FS_RULES.apply(st, chaos, { type: 'effect', answer: { units: targets } }).ok, 'две разные цели после JSON');
        ok(!CombatTokens.of(st.combat).alive(ownSide, 0) && !CombatTokens.of(st.combat).alive(foeSide, 0), 'уничтожены оба выбранных жетона');
    }
}));

// --- 05-order-upgrades.md ---------------------------------------------------
head('Улучшения приказов', CHAOS);
check('Расположение темных богов', 'после стратегии на колоду событий идут еще 2 использованных жетона', () => {
    const st = FS_RULES.newReadyGame({ seed: 5, players: players(CHAOS, CHAOS_FOE) });
    const sys = st.systems[0];
    for (const s of st.systems) s.tokens = [];
    st.units = []; st.structures = []; st.objectives = []; st.storms = [];
    st.phase = 'operations'; st.turn = 0; FS_RULES.trimQueue(st).clear();
    sys.tokens.push({ seat: 0, order: 'strategize', faceUp: false });
    const p = st.players[0];
    p.placedTokens = 4; p.eventTokens = 0;
    p.upgrades = [{ name: 'Расположение темных богов', used: false }];
    st.order = { seat: 0, order: 'strategize', system: sys.id, phase: 'resolve' };
    const used = burn(st, 'Расположение темных богов');
    ok(used.ok, 'улучшение не применено: ' + used.error);
    eq(st.order.chaosDeckBonus, 2, 'приказ помнит два дополнительных жетона');
    const done = FS_RULES.apply(st, 0, { type: 'finishStrategize' });
    ok(done.ok, 'стратегия не закончена: ' + done.error);
    return eq(p.eventTokens, 3, 'жетон стратегии + два использованных жетона');
});
check('Сквозь варп', 'корабли проходят через варп-шторм во время этого приказа', () => {
    const st = chaosOrder('advance', { upgrades: ['Сквозь варп'] });
    const used = burn(st, 'Сквозь варп');
    ok(used.ok, 'улучшение не применено: ' + used.error);
    ok(!!st.order.shipsThroughStorms, 'приказ не разрешил проход кораблям');
    const sys = st.systems[0];
    let side = null, nb = null;
    for (const d of ['N', 'E', 'S', 'W']) {
        const x = FS_RULES.across(st, sys.id, d);
        if (x) { side = d; nb = x; break; }
    }
    ok(!!nb, 'нет соседней системы');
    st.storms = [{ id: 'storm-chaos', system: sys.id, side, moved: false }];
    const ship = FS_RULES.addUnit(st, 0, 'эсминцы-класса-иконоборец', nb, voidOf(st, nb));
    const target = { system: sys.id, pos: voidOf(st, sys.id) };
    const yes = FS_RULES.moveAllowed(st, 0, ship, target);
    ok(yes.ok, 'шторм всё ещё мешает: ' + yes.error);
    st.order.shipsThroughStorms = false;
    const no = FS_RULES.moveAllowed(st, 0, ship, target);
    return ok(!no.ok && /варп-шторм/i.test(no.error || ''), 'без улучшения шторм запрещает путь');
});
check('Сквозь варп', 'настоящий приказ: корабль доступен, пересекает шторм и возвращается по undo после JSON', () => {
    const make = () => {
        const st = FS_RULES.newReadyGame({ seed: 5, players: players(CHAOS, CHAOS_FOE) });
        st.units = []; st.structures = []; st.objectives = []; st.storms = [];
        for (const sys of st.systems) sys.tokens = [];
        st.phase = 'operations'; st.turn = 0; st.order = null;
        const active = st.systems[0];
        const side = ['N', 'E', 'S', 'W'].find(d => FS_RULES.across(st, active.id, d));
        const neighbor = FS_RULES.across(st, active.id, side);
        const from = voidOf(st, neighbor), to = voidOf(st, active.id);
        const ship = FS_RULES.addUnit(st, 0, 'эсминцы-класса-иконоборец', neighbor, from);
        FS_RULES.addUnit(st, 1, 'гвардейцы', active.id, worldOf(st, active.id));
        st.storms = [{ id: 'warp-test', system: active.id, side, moved: false }];
        st.players[0].upgrades = [{ name: 'Сквозь варп', used: false }];
        active.tokens.push({ seat: 0, order: 'advance', faceUp: false });
        ok(FS_RULES.apply(st, 0, { type: 'resolveOrder', system: active.id }).ok, 'приказ раскрыт с уже стоящим кораблём');
        return { st, active: active.id, neighbor, ship: ship.id, from, to };
    };
    const a = make();
    eq(FS_RULES.movableUnits(a.st, 0).some(u => u.id === a.ship), false, 'до улучшения корабль не предложен');
    const command = { type: 'moveUnits', moves: [{ unit: a.ship, system: a.active, pos: a.to }] };
    eq(FS_RULES.apply(a.st, 0, command).ok, false, 'без карты проход запрещён');
    let { st } = a;
    ok(burn(st, 'Сквозь варп').ok, 'улучшение применено после раскрытия приказа');
    st = JSON.parse(JSON.stringify(st));
    ok(FS_RULES.movableUnits(st, 0).some(u => u.id === a.ship), 'корабль предложен после обновления дорог');
    ok(FS_RULES.apply(st, 0, command).ok, 'корабль пересёк шторм');
    eq([st.units.find(u => u.id === a.ship).system, st.units.find(u => u.id === a.ship).area], [a.active, a.to], 'корабль на месте назначения');
    st = JSON.parse(JSON.stringify(st));
    ok(FS_RULES.apply(st, 0, { type: 'undoMove' }).ok, 'отмена после JSON');
    eq([st.units.find(u => u.id === a.ship).system, st.units.find(u => u.id === a.ship).area], [a.neighbor, a.from], 'корабль вернулся');
    ok(FS_RULES.apply(st, 0, command).ok, 'движение можно повторить');
    ok(FS_RULES.apply(st, 0, { type: 'endAdvance' }).ok, 'шаг кораблей завершён');
    ok(FS_RULES.apply(st, 0, { type: 'endAdvance' }).ok, 'приказ завершён');
    eq(st.combat, null, 'в пустой области бой не начат');
});

check('Сквозь варп', 'улучшение после первого корабля: замороженные дороги, шторм и две отмены после JSON', () => {
    let st = FS_RULES.newReadyGame({ seed: 5, players: players(CHAOS, CHAOS_FOE) });
    st.units = []; st.structures = []; st.objectives = []; st.storms = [];
    for (const sys of st.systems) sys.tokens = [];
    st.phase = 'operations'; st.turn = 0; st.order = null;
    const active = st.systems.find(s => s.areas.filter(a => !a.world).length >= 2
        && FS_RULES.neighbors(st, s.id).length);
    ok(active, 'активная система с двумя пустотами и соседом');
    const [from, target] = active.areas.filter(a => !a.world).map(a => a.pos);
    const side = ['N', 'E', 'S', 'W'].find(d => FS_RULES.across(st, active.id, d));
    const neighbor = FS_RULES.across(st, active.id, side), outside = voidOf(st, neighbor);
    const first = FS_RULES.addUnit(st, 0, 'эсминцы-класса-иконоборец', active.id, from);
    const second = FS_RULES.addUnit(st, 0, 'эсминцы-класса-иконоборец', neighbor, outside);
    st.storms = [{ id: 'partial-warp', system: active.id, side, moved: false }];
    st.players[0].upgrades = [{ name: 'Сквозь варп', used: false }];
    active.tokens.push({ seat: 0, order: 'advance', faceUp: false });
    const next = st.systems.find(s => s.id !== active.id);
    next.tokens.push({ seat: 1, order: 'advance', faceUp: false });
    ok(FS_RULES.apply(st, 0, { type: 'resolveOrder', system: active.id }).ok, 'приказ раскрыт');
    const a = { type: 'moveUnits', moves: [{ unit: first.id, system: active.id, pos: target }] };
    const b = { type: 'moveUnits', moves: [{ unit: second.id, system: active.id, pos: target }] };
    ok(FS_RULES.apply(st, 0, a).ok, 'первый корабль двинулся до улучшения');
    eq(FS_RULES.apply(st, 0, b).ok, false, 'шторм закрывает второй корабль до улучшения');
    ok(burn(st, 'Сквозь варп').ok, 'улучшение применено после первого хода');
    st = JSON.parse(JSON.stringify(st));
    ok(FS_RULES.movableUnits(st, 0).some(u => u.id === second.id), 'корабль за штормом предложен после JSON');
    ok(!FS_RULES.movableUnits(st, 0).some(u => u.id === first.id), 'уже двинутый корабль не предложен снова');
    ok(FS_RULES.apply(st, 0, b).ok, 'второй корабль пересёк шторм');
    st = JSON.parse(JSON.stringify(st));
    ok(FS_RULES.apply(st, 0, { type: 'undoMove' }).ok, 'отменён второй корабль');
    ok(FS_RULES.apply(st, 0, { type: 'undoMove' }).ok, 'отменён первый корабль');
    eq([st.units.find(u => u.id === first.id).area, st.units.find(u => u.id === second.id).system],
        [from, neighbor], 'оба корабля вернулись к своим исходным позициям');
    ok(FS_RULES.apply(st, 0, b).ok, 'разрешение действует после обеих отмен');
});

check('Сквозь варп', 'пересчёт после частичного наземного шага не создаёт и не закрывает путь кликом', () => {
    // The upgrade is played by a real command. The second variant exercises
    // the *actual parsed step* of «Прикосновение варпа» at the same late point;
    // its later offer is synthetic, since the normal order hook offers it at
    // activation. Both must rebuild from the start of the ground step.
    for (const permission of ['ship-upgrade', 'all-units-step']) for (const open of [true, false]) {
        let st = FS_RULES.newReadyGame({ seed: 5, players: players(CHAOS, CHAOS_FOE) });
        st.units = []; st.structures = []; st.objectives = []; st.storms = [];
        for (const sys of st.systems) sys.tokens = [];
        st.phase = 'operations'; st.turn = 0; st.order = null;
        const active = st.systems.find(s => s.areas.some(a => a.world
            && FS_RULES.areasAround(st, s.id, a.pos).filter(n => n.system === s.id
                && FS_RULES.area(s, n.pos).world).length >= 2));
        ok(active, 'нужна цепочка из трёх миров');
        const bridge = active.areas.find(a => a.world && FS_RULES.areasAround(st, active.id, a.pos)
            .filter(n => n.system === active.id && FS_RULES.area(active, n.pos).world).length >= 2).pos;
        const [source, goal] = FS_RULES.areasAround(st, active.id, bridge)
            .filter(n => n.system === active.id && FS_RULES.area(active, n.pos).world).map(n => n.pos);
        const runner = FS_RULES.addUnit(st, 0, 'культисты', active.id, source);
        const mover = FS_RULES.addUnit(st, 0, 'культисты', active.id, open ? source : bridge);
        st.players[0].upgrades = [{ name: 'Сквозь варп', used: false }];
        active.tokens.push({ seat: 0, order: 'advance', faceUp: false });
        st.systems.find(s => s.id !== active.id).tokens.push({ seat: 1, order: 'advance', faceUp: false });
        ok(FS_RULES.apply(st, 0, { type: 'resolveOrder', system: active.id }).ok, 'раскрыт настоящий приказ');
        ok(FS_RULES.apply(st, 0, { type: 'endAdvance' }).ok, 'начался наземный шаг');
        const path = () => FS_RULES.pathExists(st, 0, active.id, source, active.id, goal);
        eq(path(), !open, 'состояние пути в начале шага');
        ok(FS_RULES.apply(st, 0, { type: 'moveUnits', moves: [{ unit: mover.id, system: active.id, pos: open ? bridge : goal }] }).ok,
            'первый отряд перемещён отдельной командой');
        eq(path(), open, 'текущая доска изменила проходимость моста');
        if (permission === 'ship-upgrade') {
            ok(burn(st, 'Сквозь варп').ok, 'сыграно улучшение приказа');
        } else {
            const card = FS_DATA.events.find(x => x.faction === CHAOS && x.name === 'Прикосновение варпа');
            const trigger = FS_EFFECTS.parse(card.text, { kind: 'event', faction: CHAOS }).find(x => x.op === 'trigger');
            const step = trigger.steps[0].options[0];
            eq(step.op, 'unitsThroughStorms', 'проверяем реальный шаг карты');
            ok(FS_RULES.runEffects(st, 0, [step], { kind: 'order', ctx: null }).ok, 'шаг разрешения выполнен');
        }
        st = JSON.parse(JSON.stringify(st));
        const res = FS_RULES.apply(st, 0, { type: 'moveUnits', moves: [{ unit: runner.id, system: active.id, pos: goal }] });
        eq(res.ok, !open, open ? 'захваченный первым отрядом мост не открывает новый путь'
            : 'мост, дружественный в начале шага, остаётся законным');
        if (open) {
            eq(st.units.find(u => u.id === runner.id).area, source, 'отказ не двигает второй отряд');
            ok(FS_RULES.apply(st, 0, { type: 'undoMove' }).ok, 'первый шаг можно отменить после отказа');
            ok(FS_RULES.apply(st, 0, { type: 'moveUnits', moves: [{ unit: mover.id, system: active.id, pos: bridge }] }).ok,
                'первый шаг можно повторить');
            eq(FS_RULES.apply(st, 0, { type: 'moveUnits', moves: [{ unit: runner.id, system: active.id, pos: goal }] }).ok,
                false, 'повторный клик также не открывает путь');
        }
    }
});

check('Полное разрушение', 'бастион не защищает, а 2 `def. cube` уничтожают отряд или постройку', () => {
    const st = chaosStrike({
        upgrades: ['Полное разрушение'], foeStructures: ['bastion'],
        foeUnits: { 'гвардейцы': 1 },
    });
    const bastion = st.structures.find(s => s.type === 'bastion');
    const used = burn(st, 'Полное разрушение');
    ok(used.ok, 'улучшение не применено: ' + used.error);
    ok(!!st.order.ignoreBastion, 'бастион не игнорируется');
    const target = FS_RULES.orbitalStrikeTargets(st, 0).find(t => t.pos === st.strikeWorld);
    ok(!!target, 'бастион по-прежнему закрывает цель');
    withFixedDice(['def', 'def', 'morale'], () => fire(st, ['def', 'def', 'morale']));
    chaosEffectAnswer(st, (s, q) => {
        if (q.op === 'strikePayPick') return { choice: 1 };
        if (q.op === 'strikeDestroyOne') return { units: [bastion.id] };
        return firstOption(s, q);
    });
    return eq(stateUnit(st, bastion.id) || st.structures.find(s => s.id === bastion.id), undefined,
        'бастион уничтожен');
});
check('Страх с небес', `1 morale cube маршрутизирует получивший повреждения отряд`, () => {
    return withFixedDice(['att', 'morale', 'morale'], () => {
        const st = chaosStrike({
            upgrades: ['Страх с небес'], foeStructures: ['factory'],
            foeUnits: { 'огрины': 1 },
        });
        const victim = foeUnits(st)[0];
        // An order of the other player is still waiting: finishing this strike
        // must not begin the refresh phase and rally the routed unit at once.
        st.systems[1].tokens.push({ seat: 1, order: 'deploy', faceUp: false });
        const used = burn(st, 'Страх с небес');
        ok(used.ok, 'улучшение не применено: ' + used.error);
        fire(st, ['att', 'morale', 'morale']);
        chaosEffectAnswer(st, (s, q) => (q.op === 'strikePayPick' ? { choice: 1 } : firstOption(s, q)));
        ok(!!st.strike, 'удар не дошёл до шага повреждений');
        const dmg = FS_RULES.apply(st, 1, { type: 'strikeDamage', unit: victim.id });
        ok(dmg.ok, 'урон не назначен: ' + dmg.error);
        chaosEffectAnswer(st, (s, q) => (q.op === 'strikeRouteDamaged'
            ? { units: [victim.id] } : firstOption(s, q)));
        return eq(stateUnit(st, victim.id).routed, true, 'получивший повреждения отряд деморализован');
    });
});
check('Ужасный ритуал', 'КЛ≤2 покупка в дружественной области со скидкой за культистов', () => {
    const st = chaosOrder('deploy', { upgrades: ['Ужасный ритуал'],
        units: { 'культисты': 2 }, foeUnits: {}, materiel: 10 });
    const used = burn(st, 'Ужасный ритуал');
    ok(used.ok, 'улучшение не применено: ' + used.error);
    eq(st.order.discount, 2, 'скидка 1 за каждого из двух культистов');
    const before = st.units.length;
    chaosEffectAnswer(st, (s, q) => (q.kind === 'types'
        ? { type: 'хелбруты' } : firstOption(s, q)));
    eq(st.units.length, before + 1, 'один отряд куплен');
    ok(st.units.some(u => (FS_RULES.unitOf(st, u) || {}).kl === 2), 'куплен отряд КЛ 2, хотя городов нет');
    return eq(st.players[0].materiel, 8, 'цена 4 уменьшена на 2');
});

// --- 06-events.md -----------------------------------------------------------
head('Карты событий', CHAOS);
check('Задетый варпом', 'жертва культиста даёт бесплатное улучшение с КЛ не выше числа штормов', () => {
    const st = chaosEvent('Задетый варпом', { units: { 'культисты': 1 }, materiel: 3 });
    const cultist = st.units.find(u => u.seat === 0);
    st.storms = [
        { id: 's0', system: st.sys, side: 'N', moved: false },
        { id: 's1', system: st.sys, side: 'E', moved: false },
    ];
    const res = playEvent(st);
    ok(res.ok, 'событие не разыграно: ' + res.error);
    chaosEffectAnswer(st, (s, q) => {
        if (q.op === 'destroy') return { units: [cultist.id] };
        if (q.op === 'buyAnyUpgrade') return { card: q.options[0] };
        return firstOption(s, q);
    });
    eq(stateUnit(st, cultist.id), null, 'культист уничтожен');
    eq(st.chaosLastSystem, st.sys, 'система жертвы запомнена');
    ok(st.players[0].decks.combat.some(n => /Отметка|Объединённый|Нечеловеч|Демоническ/.test(n)),
        'в колоде появилась карта боевого улучшения');
    return eq(st.players[0].materiel, 3, 'улучшение бесплатно');
});
check('Пророчества и знамения', 'первая ветка ставит 2 культистов в мир системы без культистов', () => {
    const st = chaosEvent('Пророчества и знамения', { structures: ['factory'] });
    const other = st.systems[1];
    FS_RULES.addUnit(st, 0, 'культисты', other.id, worldOf(st, other.id));
    const res = playEvent(st);
    ok(res.ok, 'событие не разыграно: ' + res.error);
    chaosEffectAnswer(st, (s, q) => (q.kind === 'choice' ? { choice: 0 } : firstOption(s, q)));
    const here = st.units.filter(u => u.seat === 0 && u.system === st.sys);
    return eq(here.length, 2, 'два культиста в системе без культистов');
});
check('Пророчества и знамения', 'вторая ветка ставит 1 культиста в любой дружественный мир', () => {
    const st = chaosEvent('Пророчества и знамения', { structures: ['factory'] });
    const res = playEvent(st);
    ok(res.ok, 'событие не разыграно: ' + res.error);
    chaosEffectAnswer(st, (s, q) => (q.kind === 'choice' ? { choice: 1 } : firstOption(s, q)));
    return eq(st.units.filter(u => u.seat === 0).length, 1, 'один культист размещён');
});
check('Инкарнация Тзинча', 'способность одной из трёх карт применяется без второго движения шторма', () => {
    let st = chaosEvent('Инкарнация Тзинча', { assets: { forge: 0, reinforcement: 0 } });
    st.storms = [{ id: 'storm-chaos', system: st.sys, side: 'N', moved: true }];
    const before = [st.storms[0].system, st.storms[0].side];
    st.players[0].decks.event = ['Военные трофеи', 'Пророчества и знамения', 'Задетый варпом'];
    const res = playEvent(st);
    ok(res.ok, 'событие не разыграно: ' + res.error);
    eq(pending(st).op, 'chooseEventAbility', 'выбрана одна из трёх карт');
    st = JSON.parse(JSON.stringify(st));
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { card: 'Военные трофеи' } }).ok, 'тактика выбрана');
    eq([st.storms[0].system, st.storms[0].side], before, 'шторм не двигался по вновь раскрытой карте');
    eq(st.players[0].assets.forge, 1, 'жетон кузницы тактики получен');
    return eq(st.players[0].assets.reinforcement, 1, 'жетон подкреплений тактики получен');
});
check('Инкарнация Тзинча', 'вложенное событие заканчивается до хода следующего игрока и не двигает шторм', () => {
    let st = chaosEvent('Инкарнация Тзинча', { structures: ['factory'] });
    st.storms = [{ id: 'storm-chaos', system: st.sys, side: 'N', moved: true }];
    const before = [st.storms[0].system, st.storms[0].side];
    st.players[0].decks.event = ['Военные трофеи', 'Пророчества и знамения', 'Задетый варпом'];
    ok(playEvent(st).ok, 'событие не разыграно');
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { card: 'Пророчества и знамения' } }).ok,
        'вложенная тактика выбрана');
    eq(pending(st).kind, 'choice', 'вложенная тактика ждёт выбора');
    eq(st.chaosNoStormMove, true, 'значок вложенной карты подавлен на время её разрешения');
    eq(st.event, null, 'новое событие ещё не началось');
    st = JSON.parse(JSON.stringify(st));
    eq(FS_RULES.apply(st, 0, { type: 'moveStorm', storm: 'storm-chaos', dir: 'E' }).ok,
        false, 'нельзя двигать шторм пока ответ не завершён');
    chaosEffectAnswer(st, firstOption);
    eq([st.storms[0].system, st.storms[0].side], before, 'шторм не двигался повторно');
    return eq(st.chaosNoStormMove, undefined, 'запрет снят перед следующим событием');
});
check('Инкарнация Тзинча', 'истощённая колода не выдаёт удержанные вложенные карты до завершения', () => {
    let st = chaosEvent('Инкарнация Тзинча', { structures: ['factory'] });
    st.turn = 1;
    st.players[0].decks.event = ['Пророчества и знамения', 'Военные трофеи'];
    st.players[0].eventDeckInitialized = true;
    ok(playEvent(st).ok, 'внешняя тактика разрешается');
    eq(pending(st).op, 'chooseEventAbility', 'вытянуты только две доступные карты');
    eq(st.players[0].eventHand.slice().sort(), ['Пророчества и знамения', 'Военные трофеи'].sort(), 'в руке обе карты');
    eq(st.players[0].decks.event, [], 'колода исчерпана');
    eq(FS_RULES.drawEventCard(st, 0), null, 'удерживаемая внешняя тактика не вытягивается повторно');
    st = JSON.parse(JSON.stringify(st));
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { card: 'Пророчества и знамения' } }).ok, 'вложенная тактика выбрана');
    eq(pending(st).kind, 'choice', 'вложенная тактика ещё ждёт решения');
    eq(FS_RULES.drawEventCard(st, 0), null, 'невыбранная и ещё разрешаемые карты не выдаются повторно');
    st = JSON.parse(JSON.stringify(st));
    chaosEffectAnswer(st, (s, q) => q.kind === 'choice' ? { choice: 1 } : firstOption(s, q));
    const expected = ['Инкарнация Тзинча', 'Пророчества и знамения', 'Военные трофеи'].sort();
    eq(st.players[0].decks.event.slice().sort(), expected, 'все три карты вернулись ровно по одной');
    eq(st.players[0].eventDiscard, [], 'удержанных карт больше нет');
    eq(st.event.seat, 1, 'после разрешения началось событие следующего игрока');
});

check('Инкарнация Тзинча', 'следующий игрок может передвинуть другой шторм по своей карте', () => {
    let st = chaosEvent('Инкарнация Тзинча', { structures: ['factory'] });
    st.turn = 1;
    st.storms = [{ id: 'already-moved', system: st.sys, side: 'N', moved: true }];
    st.players[0].decks.event = ['Военные трофеи', 'Пророчества и знамения', 'Задетый варпом'];
    const nextCard = FS_DATA.events.find(e => e.faction === st.players[1].faction);
    st.players[1].decks.event = [nextCard.name];
    st.players[1].eventDeckInitialized = true;
    st.players[1].eventTokens = 0;
    // Find a genuine unused edge with a legal direction on the next card.
    const currentEvent = st.event;
    let available = null;
    for (const edge of FS_RULES.allEdges(st)) {
        st.storms = [st.storms[0], { id: 'next-storm', system: edge.system, side: edge.side, moved: false }];
        st.event = { seat: 1, drawn: [], top: nextCard.name };
        available = FS_RULES.stormOptions(st, 1).find(x => x.storm === 'next-storm');
        if (available) break;
    }
    st.event = currentEvent;
    ok(!!available, 'есть законное движение второго шторма');
    ok(playEvent(st).ok, 'Инкарнация разыграна');
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { card: 'Пророчества и знамения' } }).ok, 'вложенная карта выбрана');
    eq(pending(st).kind, 'choice', 'вложенная карта не окончена');
    st = JSON.parse(JSON.stringify(st));
    chaosEffectAnswer(st, firstOption);
    eq(st.event.seat, 1, 'событие следующего игрока началось');
    ok(!st.chaosNoStormMove, 'подавление относится только к вложенной карте');
    const option = FS_RULES.stormOptions(st, 1).find(x => x.storm === 'next-storm');
    ok(!!option, 'новая карта предлагает движение');
    const before = FS_RULES.edgeKey(st, st.storms.find(s => s.id === option.storm));
    ok(FS_RULES.apply(st, 1, { type: 'moveStorm', storm: option.storm, dir: option.dir }).ok, 'движение принято');
    ok(FS_RULES.edgeKey(st, st.storms.find(s => s.id === option.storm)) !== before, 'шторм действительно переместился');
});

check('Военные трофеи', '1 жетон кузницы и 1 жетон подкреплений', () => {
    const st = chaosEvent('Военные трофеи', { assets: { forge: 1, reinforcement: 1 } });
    const res = playEvent(st);
    ok(res.ok, 'событие не разыграно: ' + res.error);
    eq(st.players[0].assets.forge, 2, 'жетон кузницы');
    return eq(st.players[0].assets.reinforcement, 2, 'жетон подкреплений');
});
check('Прикосновение варпа', 'план ждёт приказа продвижения и хранит обе ветки', () => {
    const st = chaosEvent('Прикосновение варпа', {});
    const res = playEvent(st);
    ok(res.ok, 'событие не разыграно: ' + res.error);
    const scheme = st.players[0].schemes[0];
    eq([scheme.trigger, scheme.orderType, scheme.insteadOfOrder], ['order', 'advance', false], 'триггер приказа');
    const ops = flattenOps(scheme.steps);
    ok(ops.includes('unitsThroughStorms'), 'ветка прохода через штормы');
    ok(ops.includes('combatStartMorale'), 'ветка кубика морали в начале боя');
    return eq(flattenOps(scheme.steps).filter(x => x === 'sequence').length, 1, 'ветка «и» тоже есть');
});
check('Прикосновение варпа', 'план не предлагается для другого приказа', () => {
    const st = chaosOrder('deploy', {});
    schemeInPlay(st, 'Прикосновение варпа', CHAOS);
    return eq(FS_RULES.maybeScheme(st, 0, 'order', { kind: 'order', ctx: null }), false,
        'план продвижения не предлагается в развертывании');
});
check('Прикосновение варпа', 'ветки плана дают проход, morale cube или оба эффекта', () => {
    const one = chaosOrder('advance', {});
    schemeInPlay(one, 'Прикосновение варпа', CHAOS);
    ok(FS_RULES.maybeScheme(one, 0, 'order', { kind: 'order', ctx: null }), 'план не предложен');
    chaosEffectAnswer(one, (s, q) => (q.kind === 'choice' ? { choice: 0 } : firstOption(s, q)));
    eq(one.order.unitsThroughStorms, true, 'первая ветка: проход через штормы');

    const two = chaosOrder('advance', {});
    schemeInPlay(two, 'Прикосновение варпа', CHAOS);
    ok(FS_RULES.maybeScheme(two, 0, 'order', { kind: 'order', ctx: null }), 'план не предложен');
    chaosEffectAnswer(two, (s, q) => (q.kind === 'choice' ? { choice: 1 } : firstOption(s, q)));
    eq(two.order.chaosCombatMorale, 1, 'вторая ветка: кубик морали');

    const both = chaosOrder('advance', {});
    schemeInPlay(both, 'Прикосновение варпа', CHAOS);
    ok(FS_RULES.maybeScheme(both, 0, 'order', { kind: 'order', ctx: null }), 'план не предложен');
    chaosEffectAnswer(both, (s, q) => (q.kind === 'choice' ? { choice: 2 } : firstOption(s, q)));
    eq(both.order.unitsThroughStorms, true, 'третья ветка: проход');
    return eq(both.order.chaosCombatMorale, 1, 'третья ветка: кубик морали');
});
check('Прикосновение варпа', 'настоящий план: корабли и наземные проходят шторм, боевая ветка и undo после JSON', () => withFixedDice(['def'], () => {
    for (const kind of ['ship', 'ground']) for (const branch of [0, 1, 2]) {
        let st = FS_RULES.newReadyGame({ seed: 5, players: players(CHAOS, CHAOS_FOE) });
        st.units = []; st.structures = []; st.objectives = []; st.storms = [];
        for (const sys of st.systems) sys.tokens = [];
        st.phase = 'operations'; st.turn = 0; st.order = null;
        let route = null;
        for (const active of st.systems) {
            for (const neighbor of FS_RULES.neighbors(st, active.id)) {
                const fromSystem = FS_RULES.system(st, neighbor);
                for (const from of fromSystem.areas) for (const to of active.areas) {
                    if (!!from.world !== (kind === 'ground') || !!to.world !== (kind === 'ground')) continue;
                    if (kind === 'ground' && !FS_RULES.areasAround(st, neighbor, from.pos)
                        .some(x => x.system === active.id && x.pos === to.pos)) continue;
                    route = { active: active.id, neighbor, from: from.pos, to: to.pos };
                    break;
                }
                if (route) break;
            }
            if (route) break;
        }
        ok(route, 'найден путь между системами');
        const side = ['N', 'E', 'S', 'W'].find(d => FS_RULES.across(st, route.active, d) === route.neighbor);
        st.storms = [{ id: 'scheme-warp', system: route.active, side, moved: false }];
        const moving = FS_RULES.addUnit(st, 0, kind === 'ship' ? 'эсминцы-класса-иконоборец' : 'культисты', route.neighbor, route.from);
        FS_RULES.addUnit(st, 1, kind === 'ship' ? 'крейсеры' : 'гвардейцы', route.active, route.to);
        st.players[0].assets.reinforcement = 0; st.players[1].assets.reinforcement = 0;
        schemeInPlay(st, 'Прикосновение варпа', CHAOS);
        FS_RULES.system(st, route.active).tokens.push({ seat: 0, order: 'advance', faceUp: false });
        ok(FS_RULES.apply(st, 0, { type: 'resolveOrder', system: route.active }).ok, 'приказ раскрыт');
        eq(pending(st)?.kind, 'scheme', 'предложен настоящий план при раскрытии');
        ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { choice: 0 } }).ok, 'план сброшен');
        st = JSON.parse(JSON.stringify(st));
        ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { choice: branch } }).ok, 'ветка выбрана после JSON');
        if (kind === 'ground') ok(FS_RULES.apply(st, 0, { type: 'endAdvance' }).ok, 'перешли к наземным');
        const cmd = { type: 'moveUnits', moves: [{ unit: moving.id, system: route.active, pos: route.to }] };
        if (branch === 1) {
            eq(FS_RULES.apply(st, 0, cmd).ok, false, 'только мораль не открывает шторм');
            continue;
        }
        ok(FS_RULES.movableUnits(st, 0).some(u => u.id === moving.id), 'отряд предложен через шторм');
        ok(FS_RULES.apply(st, 0, cmd).ok, 'пересечение выполнено');
        st = JSON.parse(JSON.stringify(st));
        ok(FS_RULES.apply(st, 0, { type: 'undoMove' }).ok, 'перемещение отменено после JSON');
        eq([st.units.find(u => u.id === moving.id).system, st.units.find(u => u.id === moving.id).area],
            [route.neighbor, route.from], 'вернулся к источнику');
        ok(FS_RULES.apply(st, 0, cmd).ok, 'пересечение повторено');
        if (kind === 'ship') ok(FS_RULES.apply(st, 0, { type: 'endAdvance' }).ok, 'корабли закончили движение');
        ok(FS_RULES.apply(st, 0, { type: 'endAdvance' }).ok, 'начался бой');
        eq([st.combat?.attacker, st.combat?.defender], [0, 1], 'стороны боя');
        eq(st.combat.dice.attacker.filter(d => d === 'morale').length, branch === 2 ? 1 : 0,
            'кубик морали только в совместной ветке');
    }
}));

check('Прикосновение варпа', 'morale cube приходит в начале боя этого приказа', () => {
    const st = chaosOrder('advance', { units: { 'культисты': 1 }, foeUnits: { 'гвардейцы': 1 } });
    const sys = FS_RULES.system(st, st.sys || st.systems[0].id);
    st.combat = null;
    st.order = { seat: 0, order: 'advance', system: sys.id, phase: 'move', chaosCombatMorale: 1 };
    withFixedDice(['def', 'def'], () => FS_RULES.startCombat(st, 0, 1, sys.id, worldOf(st, sys.id)));
    ok(!!st.combat, 'бой не начался');
    ok(count(st, 'attacker', 'morale') >= 1, 'кубик морали не добавлен');
    return eq(st.order.chaosCombatMorale, 0, 'кубик выдан один раз');
});
check('Совращённый Хаосом', 'план ждёт конца шага повреждений и деморализует вражеский отряд', () => {
    const st = chaosEvent('Совращённый Хаосом', {});
    const res = playEvent(st);
    ok(res.ok, 'событие не разыграно: ' + res.error);
    const scheme = st.players[0].schemes[0];
    return eq([scheme.trigger, scheme.insteadOfOrder], ['damage-end', false], 'триггер конца повреждений');
});
check('Совращённый Хаосом', 'движок предлагает план в endDamageStep и продолжает шаг', () => {
    const st = chaosBattle({});
    refuseReinforce(st);
    schemeInPlay(st, 'Совращённый Хаосом', CHAOS);
    // Шаг боя ставим органом шага, а не полем: движок вправе менять форму.
    CombatTurn.of(st.combat).setStep('damage-defender');
    st.combat.dice.attacker = ['def'];
    st.combat.dice.defender = ['def'];
    FS_RULES.endDamageStep(st);
    const q = pending(st);
    ok(!!q && q.kind === 'scheme', 'план конца повреждений не предложен');
    chaosEffectAnswer(st, firstOption);
    eq(foeUnits(st).filter(u => u.routed).length, 1, 'вражеский отряд деморализован');
    eq(st.players[0].schemes.length, 0, 'план сброшен');
    eq(st.combat.damageEndHook, null, 'хвост шага повреждений выполнен');
    return eq(st.combat.damageEndResume, false, 'шаг не ждёт план повторно');
});
check('Совращённый Хаосом', 'в конце урона план деморализует единственное подкрепление противника', () => {
    for (const chaos of [0, 1]) for (const space of [false, true]) {
        const foe = 1 - chaos, foeSide = foe === 0 ? 'attacker' : 'defender';
        let st = chaosTokenBattle(chaos, space);
        // After the token was legally deployed, preceding combat effects have
        // destroyed every plastic enemy; the token remains a unit in the battle.
        for (const u of st.units.filter(u => u.seat === foe).slice()) FS_RULES.destroyUnit(st, u);
        const def = FS_RULES.reinforceTokenDef(st, foeSide).id;
        const supply = st.players[foe].supply.units[def], asset = st.players[foe].assets.reinforcement;
        FS_RULES.keepEventScheme(st, chaos, FS_DATA.events.find(c => c.faction === CHAOS && c.name === 'Совращённый Хаосом'));
        CombatTurn.of(st.combat).setStep('damage-defender');
        CombatTurn.of(st.combat).setDice('attacker', ['def']).setDice('defender', ['def']);
        FS_RULES.endDamageStep(st);
        eq([st.pending?.seat, pending(st)?.kind, pending(st)?.options],
            [chaos, 'scheme', ['Совращённый Хаосом']], 'план предложен в конце повреждений');
        st = JSON.parse(JSON.stringify(st));
        ok(FS_RULES.apply(st, chaos, { type: 'effect', answer: { choice: 0 } }).ok, 'план сброшен после JSON');
        const target = 'reinforce-' + foeSide + '-0';
        eq([pending(st)?.op, pending(st)?.options], ['route', [target]], 'единственный жетон — допустимая цель');
        const before = JSON.stringify(st);
        eq(FS_RULES.apply(st, chaos, { type: 'effect', answer: { units: ['reinforce-' + (foeSide === 'attacker' ? 'defender' : 'attacker') + '-0'] } }).ok,
            false, 'свой жетон нельзя указать вместо чужого');
        eq(JSON.stringify(st), before, 'поддельный ответ не изменил состояние');
        st = JSON.parse(JSON.stringify(st));
        ok(FS_RULES.apply(st, chaos, { type: 'effect', answer: { units: [target] } }).ok, 'цель выбрана после JSON');
        ok(CombatTokens.of(st.combat).alive(foeSide, 0) && CombatTokens.of(st.combat).flipped(foeSide).includes(0),
            'подкрепление осталось в бою деморализованным');
        eq([st.players[foe].supply.units[def], st.players[foe].assets.reinforcement], [supply, asset],
            'ни модель, ни ресурс не появились в запасе');
        eq(st.players[chaos].schemes.length, 0, 'план сброшен ровно один раз');
    }
});
check('Совращённый Хаосом', 'окно каждого шага урона не пропадает при «Безжалостном наступлении» Некронов', () => {
    for (const chaos of [0, 1]) for (const acceptFirst of [false, true]) {
        const necron = 1 - chaos;
        const factions = chaos === 0 ? [CHAOS, 'некроны'] : ['некроны', CHAOS];
        let st = FS_RULES.newBattleTest({ seed: 11,
            players: factions.map((faction, seat) => ({ faction, name: 'Игрок ' + seat, id: 'p' + seat })),
            units: { [chaos === 0 ? 'культисты' : 'воины']: 3 },
            foeUnits: { [chaos === 1 ? 'культисты' : 'воины']: 3 } });
        FS_RULES.keepEventScheme(st, chaos, FS_DATA.events.find(c => c.faction === CHAOS && c.name === 'Совращённый Хаосом'));
        FS_RULES.keepEventScheme(st, necron, FS_DATA.events.find(c => c.faction === 'некроны' && c.name === 'Безжалостное наступление'));
        for (const seat of [0, 1]) ok(FS_RULES.apply(st, seat, { type: 'combat', action: 'reinforce', count: 0 }).ok, 'подготовка');
        eq([st.pending?.seat, pending(st)?.options], [necron, ['Безжалостное наступление']], 'план Некронов в начале раунда');
        ok(FS_RULES.apply(st, necron, { type: 'effect', answer: { choice: 0 } }).ok, 'повторный шаг принят');
        eq(st.combat.repeatDamage, true, 'план включает второй шаг');
        // Pin the dice and enter the damage step directly: this isolates the two
        // printed timing windows from unrelated combat-card choices.
        CombatTurn.of(st.combat).setDice('attacker', ['att']).setDice('defender', ['att']);
        CombatTurn.of(st.combat).setStep('damage-attacker');
        FS_RULES.advanceCombatSteps(st);
        const deal = () => {
            for (const [side, seat] of [['attacker', 0], ['defender', 1]]) {
                eq(st.combat.step, 'damage-' + side, 'распределение ' + side);
                const target = FS_RULES.damageCandidates(st, side).find(u => !u.routed);
                ok(!!target, 'цель урона есть');
                ok(FS_RULES.apply(st, seat, { type: 'combat', action: 'damage', targets: [target.id] }).ok, 'урон распределён');
            }
        };
        deal();
        eq([!!st.combat.damageRepeated, st.pending?.seat, pending(st)?.options],
            [false, chaos, ['Совращённый Хаосом']], 'план предложен в конце первого шага, ДО повтора');
        st = JSON.parse(JSON.stringify(st));
        ok(FS_RULES.apply(st, chaos, { type: 'effect', answer: acceptFirst ? { choice: 0 } : { no: true } }).ok, 'ответ после JSON');
        if (acceptFirst) {
            eq(pending(st)?.op, 'route', 'выбирается вражеский отряд');
            const target = pending(st).options.find(id => !st.units.find(u => u.id === id)?.routed);
            ok(!!target, 'есть недеморализованная цель');
            st = JSON.parse(JSON.stringify(st));
            ok(FS_RULES.apply(st, chaos, { type: 'effect', answer: { units: [target] } }).ok, 'цель выбрана после JSON');
            eq(st.units.find(u => u.id === target)?.routed, true, 'цель деморализована до повтора');
        }
        eq([st.pending, !!st.combat.damageRepeated, st.combat.step], [null, true, 'damage-attacker'], 'повтор начинается после окна');
        deal();
        if (!acceptFirst) {
            eq([st.pending?.seat, pending(st)?.options], [chaos, ['Совращённый Хаосом']], 'после отказа план снова предложен в конце повтора');
            st = JSON.parse(JSON.stringify(st));
            ok(FS_RULES.apply(st, chaos, { type: 'effect', answer: { no: true } }).ok, 'повторный отказ после JSON');
            eq(st.players[chaos].schemes.length, 1, 'отказанный план остался');
        } else eq(st.players[chaos].schemes.length, 0, 'принятый план не предлагается повторно');
        ok(!st.pending && (!st.combat || st.combat.round > 1 || st.combat.step === 'retreat'), 'бой вышел из шага');
    }
});
check('Совращённый Хаосом', 'живой жетон противника можно выбрать до или после повтора урона', () => {
    for (const chaos of [0, 1]) for (const space of [false, true]) for (const acceptFirst of [false, true]) {
        const necron = 1 - chaos, necronSide = necron === 0 ? 'attacker' : 'defender';
        const factions = chaos === 0 ? [CHAOS, 'некроны'] : ['некроны', CHAOS];
        const chaosType = space ? 'эсминцы-класса-иконоборец' : 'культисты';
        const necronType = space ? 'крейсеры-жнец' : 'воины';
        let st = FS_RULES.newBattleTest({ seed: 13, kind: space ? 'space' : 'ground',
            players: factions.map((faction, seat) => ({ faction, name: 'Игрок ' + seat, id: 'p' + seat })),
            units: { [chaos === 0 ? chaosType : necronType]: 3 },
            foeUnits: { [chaos === 1 ? chaosType : necronType]: 3 } });
        st.players[necron].assets.reinforcement = 1;
        FS_RULES.keepEventScheme(st, chaos, FS_DATA.events.find(c => c.faction === CHAOS && c.name === 'Совращённый Хаосом'));
        FS_RULES.keepEventScheme(st, necron, FS_DATA.events.find(c => c.faction === 'некроны' && c.name === 'Безжалостное наступление'));
        for (const seat of [0, 1]) ok(FS_RULES.apply(st, seat, { type: 'combat', action: 'reinforce', count: seat === necron ? 1 : 0 }).ok, 'призыв');
        ok(FS_RULES.apply(st, necron, { type: 'effect', answer: { choice: 0 } }).ok, 'Некроны включают повтор урона');
        const supply = st.players[necron].supply.units[necronType], asset = st.players[necron].assets.reinforcement;
        CombatTurn.of(st.combat).setDice('attacker', ['att']).setDice('defender', ['att']).setStep('damage-attacker');
        FS_RULES.advanceCombatSteps(st);
        const deal = () => {
            for (const [side, seat] of [['attacker', 0], ['defender', 1]]) {
                eq(st.combat.step, 'damage-' + side, 'очередной урон ' + side);
                const model = FS_RULES.damageCandidates(st, side).find(x => !x.routed && !x.id.startsWith('reinforce-'));
                ok(model, 'стоящая модель принимает урон, жетон остаётся доступным');
                ok(FS_RULES.apply(st, seat, { type: 'combat', action: 'damage', targets: [model.id] }).ok, 'урон распределён');
            }
        };
        deal();
        eq([!!st.combat.damageRepeated, st.pending?.seat, pending(st)?.kind], [false, chaos, 'scheme'], 'первое окно плана');
        st = JSON.parse(JSON.stringify(st));
        ok(FS_RULES.apply(st, chaos, { type: 'effect', answer: acceptFirst ? { choice: 0 } : { no: true } }).ok, 'первое решение');
        const token = 'reinforce-' + necronSide + '-0';
        const select = () => {
            eq(pending(st)?.op, 'route', 'план требует выбрать цель');
            ok(pending(st).options.includes(token), 'живое подкрепление предложено');
            st = JSON.parse(JSON.stringify(st));
            ok(FS_RULES.apply(st, chaos, { type: 'effect', answer: { units: [token] } }).ok, 'жетон выбран после JSON');
            ok(CombatTokens.of(st.combat).flipped(necronSide).includes(0), 'жетон деморализован');
        };
        if (acceptFirst) select();
        eq([st.pending, !!st.combat.damageRepeated, st.combat.step], [null, true, 'damage-attacker'], 'повтор начался');
        deal();
        if (!acceptFirst) {
            eq([st.pending?.seat, pending(st)?.kind], [chaos, 'scheme'], 'отказанный план снова предложен');
            st = JSON.parse(JSON.stringify(st));
            ok(FS_RULES.apply(st, chaos, { type: 'effect', answer: { choice: 0 } }).ok, 'принят во втором окне');
            select();
        }
        eq([st.players[necron].supply.units[necronType], st.players[necron].assets.reinforcement],
            [supply, asset], 'жетон не превращается в модель или ресурс');
        eq(st.players[chaos].schemes.length, 0, 'план сброшен один раз');
        ok(!st.pending && (!st.combat || st.combat.round > 1 || st.combat.step === 'retreat'), 'повтор завершён');
    }
});
check('Совращённый Хаосом', 'нулевой урон тоже открывает оба окна дополнительного шага', () => {
    for (const chaos of [0, 1]) {
        const necron = 1 - chaos;
        const factions = chaos === 0 ? [CHAOS, 'некроны'] : ['некроны', CHAOS];
        let st = FS_RULES.newBattleTest({ seed: 12,
            players: factions.map((faction, seat) => ({ faction, name: 'Игрок ' + seat, id: 'p' + seat })),
            units: { [chaos === 0 ? 'культисты' : 'воины']: 2 },
            foeUnits: { [chaos === 1 ? 'культисты' : 'воины']: 2 } });
        FS_RULES.keepEventScheme(st, chaos, FS_DATA.events.find(c => c.faction === CHAOS && c.name === 'Совращённый Хаосом'));
        FS_RULES.keepEventScheme(st, necron, FS_DATA.events.find(c => c.faction === 'некроны' && c.name === 'Безжалостное наступление'));
        for (const seat of [0, 1]) ok(FS_RULES.apply(st, seat, { type: 'combat', action: 'reinforce', count: 0 }).ok, 'подготовка');
        ok(FS_RULES.apply(st, necron, { type: 'effect', answer: { choice: 0 } }).ok, 'второй шаг принят');
        CombatTurn.of(st.combat).setDice('attacker', ['def']).setDice('defender', ['def']);
        CombatTurn.of(st.combat).setStep('damage-attacker');
        FS_RULES.advanceCombatSteps(st);
        eq([!!st.combat.damageRepeated, st.pending?.seat, pending(st)?.options],
            [false, chaos, ['Совращённый Хаосом']], 'первое окно не пропущено вместе с нулевым уроном');
        st = JSON.parse(JSON.stringify(st));
        ok(FS_RULES.apply(st, chaos, { type: 'effect', answer: { no: true } }).ok, 'первый отказ');
        eq([!!st.combat.damageRepeated, st.pending?.seat, pending(st)?.options],
            [true, chaos, ['Совращённый Хаосом']], 'второе окно наступило после первого');
        st = JSON.parse(JSON.stringify(st));
        ok(FS_RULES.apply(st, chaos, { type: 'effect', answer: { no: true } }).ok, 'второй отказ');
        eq([st.pending, st.combat.round, st.players[chaos].schemes.length], [null, 2, 1], 'следующий раунд и сохранённый план');
    }
});
check('Отрава Нургла', 'план заменяет раскрытие приказа, не сбрасывая жетон', () => {
    const st = FS_RULES.newReadyGame({ seed: 5, players: players(CHAOS, CHAOS_FOE) });
    const sys = st.systems[0];
    for (const s of st.systems) s.tokens = [];
    st.units = []; st.structures = []; st.objectives = []; st.storms = [];
    const pos = worldOf(st, sys.id);
    FS_RULES.addUnit(st, 0, 'культисты', sys.id, pos);
    const foe = FS_RULES.addUnit(st, 1, 'гвардейцы', sys.id, pos);
    sys.tokens.push({ seat: 1, order: 'advance', faceUp: false });
    sys.tokens.push({ seat: 0, order: 'advance', faceUp: false });
    // The next player needs an exposed order of his own; the token below the
    // current player's order is still blocked when the plan leaves it intact.
    st.systems[1].tokens.push({ seat: 1, order: 'deploy', faceUp: false });
    st.phase = 'operations'; st.turn = 0; st.order = null; FS_RULES.trimQueue(st).clear();
    st.players[0].placedTokens = 1; st.players[1].placedTokens = 2;
    st.players[0].schemes = [chaosScheme('Отрава Нургла')];
    const res = FS_RULES.apply(st, 0, { type: 'resolveOrder', system: sys.id });
    ok(res.ok, 'приказ не предложен: ' + res.error);
    const q = pending(st);
    ok(!!q && q.kind === 'scheme', 'план «вместо раскрытия» не предложен');
    chaosEffectAnswer(st, (s, qq) => (qq.op === 'route'
        ? { units: [foe.id] } : firstOption(s, qq)));
    eq(stateUnit(st, foe.id).routed, true, 'вражеский отряд в системе деморализован');
    eq(sys.tokens.length, 2, 'ни один жетон приказа не раскрыт и не сброшен');
    eq(st.order, null, 'приказ не начат');
    return eq(st.turn, 1, 'ход переходит следующему игроку');
});
check('Отрава Нургла', 'после отказа план снова предлагается вместо другого приказа', () => {
    const st = FS_RULES.newReadyGame({ seed: 5, players: players(CHAOS, CHAOS_FOE) });
    for (const sys of st.systems) sys.tokens = [];
    st.units = []; st.structures = []; st.objectives = []; st.storms = [];
    const sys0 = st.systems[0], sys1 = st.systems[1];
    const pos = worldOf(st, sys0.id);
    FS_RULES.addUnit(st, 0, 'культисты', sys0.id, pos);
    sys0.tokens.push({ seat: 0, order: 'advance', faceUp: false });
    sys1.tokens.push({ seat: 0, order: 'deploy', faceUp: false });
    st.phase = 'operations'; st.turn = 0; st.order = null; FS_RULES.trimQueue(st).clear();
    st.players[0].placedTokens = 2;
    st.players[0].schemes = [chaosScheme('Отрава Нургла')];
    const first = FS_RULES.apply(st, 0, { type: 'resolveOrder', system: sys0.id });
    ok(first.ok, 'первый приказ не предложен: ' + first.error);
    ok(pending(st) && pending(st).kind === 'scheme', 'план не предложен');
    const refused = FS_RULES.apply(st, 0, { type: 'effect', answer: { no: true } });
    ok(refused.ok, 'отказ не принят: ' + refused.error);
    eq(st.players[0].schemes.length, 1, 'план остался в игре');
    eq(sys0.tokens.length, 1, 'первый жетон не раскрыт');
    const second = FS_RULES.apply(st, 0, { type: 'resolveOrder', system: sys1.id });
    ok(second.ok, 'второй приказ не предложен: ' + second.error);
    ok(pending(st) && pending(st).kind === 'scheme', 'план не предложен вместо второго приказа');
    return eq(st.players[0].schemes.length, 1, 'план всё ещё ждёт своего момента');
});
check('Отрава Нургла', 'план не предлагается как обычный план начала фазы действий', () => {
    const st = chaosEvent('Отрава Нургла', {});
    const res = playEvent(st);
    ok(res.ok, 'событие не разыграно: ' + res.error);
    const scheme = st.players[0].schemes[0];
    eq([scheme.trigger, scheme.insteadOfOrder], ['operations', true], 'особый триггер');
    return eq(FS_RULES.maybeScheme(st, 0, 'operations', { kind: 'event', ctx: null }), false,
        'начало фазы не тратит этот план');
});
check('Молящийся тёмным богам', 'план отменяет движение шторма и выбирает новое направление', () => {
    const st = chaosEvent('Военные трофеи', {});
    const sys = st.systems[0];
    st.event = { seat: 0, drawn: [], chosen: null, card: { name: 'X', storm: ['any'] },
        top: null, stormMoved: false };
    st.phase = 'refresh'; st.turn = 0;
    st.players[0].schemes = [];
    st.players[1].schemes = [chaosScheme('Молящийся тёмным богам')];
    let storm = null, move = null;
    for (const side of ['N', 'E', 'S', 'W']) {
        st.storms = [{ id: 'storm-chaos', system: sys.id, side, moved: false }];
        const options = FS_RULES.stormOptions(st, 0);
        if (options.length) { storm = st.storms[0]; move = options[0]; break; }
    }
    ok(!!move, 'нет законного движения шторма');
    const before = { system: storm.system, side: storm.side };
    const originalTarget = FS_RULES.stormTarget(st, storm, move.dir);
    const originalKey = FS_RULES.gridKey(FS_RULES.stormEdge(st, originalTarget));
    const res = FS_RULES.apply(st, 0, { type: 'moveStorm', storm: move.storm, dir: move.dir });
    ok(res.ok, 'шторм не предложен: ' + res.error);
    let chosenDir = null;
    chaosEffectAnswer(st, (s, q) => {
        if (q.kind === 'scheme') return { choice: 0 };
        if (q.op === 'stormReaction') {
            const dirs = q.options || [];
            let i = dirs.findIndex(d => d !== move.dir);
            if (i < 0) i = 0;
            chosenDir = dirs[i];
            return { choice: i };
        }
        return firstOption(s, q);
    });
    ok(!!chosenDir && chosenDir !== move.dir, 'направление не выбрано');
    const chosenTarget = FS_RULES.stormTarget(st, before, chosenDir);
    const chosenKey = FS_RULES.gridKey(FS_RULES.stormEdge(st, chosenTarget));
    const finalKey = FS_RULES.gridKey(FS_RULES.stormEdge(st, storm));
    eq(finalKey, chosenKey, 'шторм ушёл в выбранном направлении');
    ok(finalKey !== originalKey, 'исходное перемещение отменено');
    eq(st.event.stormMoved, true, 'шторм считается сдвинутым в эту фазу');
    return eq(st.players[1].schemes.length, 0, 'план сброшен');
});
check('Молящийся тёмным богам', 'отказ от плана оставляет исходное движение шторма', () => {
    const st = chaosEvent('Военные трофеи', {});
    const sys = st.systems[0];
    st.event = { seat: 0, drawn: [], chosen: null, card: { name: 'X', storm: ['any'] },
        top: null, stormMoved: false };
    st.phase = 'refresh'; st.turn = 0;
    st.players[0].schemes = [];
    st.players[1].schemes = [chaosScheme('Молящийся тёмным богам')];
    let storm = null, move = null;
    for (const side of ['N', 'E', 'S', 'W']) {
        st.storms = [{ id: 'storm-chaos', system: sys.id, side, moved: false }];
        const options = FS_RULES.stormOptions(st, 0);
        if (options.length) { storm = st.storms[0]; move = options[0]; break; }
    }
    ok(!!move, 'нет законного движения шторма');
    const target = FS_RULES.stormTarget(st, storm, move.dir);
    const key = FS_RULES.gridKey(FS_RULES.stormEdge(st, target));
    const res = FS_RULES.apply(st, 0, { type: 'moveStorm', storm: move.storm, dir: move.dir });
    ok(res.ok, 'шторм не предложен: ' + res.error);
    chaosEffectAnswer(st, (s, q) => (q.kind === 'scheme' ? { no: true } : firstOption(s, q)));
    eq(FS_RULES.gridKey(FS_RULES.stormEdge(st, storm)), key, 'шторм сдвинут по исходной карте');
    eq(st.players[1].schemes.length, 1, 'план остался в игре');
    return eq(st.event.stormMoved, true, 'движение засчитано');
});
head('Планы Хаоса — точные триггеры', CHAOS);
check('Четыре плана', 'все хранят настоящие шаги и не имеют ручных заглушек', () => {
    for (const name of ['Прикосновение варпа', 'Совращённый Хаосом', 'Отрава Нургла', 'Молящийся тёмным богам']) {
        const st = chaosEvent(name, {});
        const res = playEvent(st);
        ok(res.ok, name + ': событие не разыграно: ' + res.error);
        const scheme = st.players[0].schemes[0];
        ok(!!scheme, name + ': план не остался в игре');
        ok(scheme.steps.length > 0, name + ': у плана нет шагов');
        ok(!scheme.note && !scheme.defer, name + ': план помечен как ручной/отложенный');
        const ops = flattenOps(scheme.steps);
        ok(!ops.includes('note') && !ops.includes('manual'), name + ': осталась заглушка');
    }
    return true;
});


// ============================================================================
//  Покупка боевого улучшения событием: замена пары, а не добавление карт
// ============================================================================

/** Answer the two questions of a combat-upgrade event, remembering the picks. */
function answerUpgradeReplacement(st) {
    const picked = { card: null, remove: null, asked: false };
    effectAnswer(st, (s, q) => {
        if (q.op === 'buyUpgrade') {
            picked.card = (q.options || [])[0];
            return { card: picked.card };
        }
        if (q.op === 'buyUpgradeReplace') {
            picked.asked = true;
            picked.remove = (q.options || [])[0];
            return { remove: picked.remove };
        }
        return firstOption(s, q);
    }, 10);
    return picked;
}

head('Замена боевых карт', 'имперская-гвардия');
check('Приказ верховного командования', 'спрашивает пару, заменяет её и сохраняет 10 карт', () => {
    const st = eventState('Приказ верховного командования', {
        faction: 'имперская-гвардия', materiel: 20, structures: ['factory'],
    });
    const before = st.players[0].decks.combat.slice();
    ok(playEvent(st).ok, 'событие не разыграно');
    const picked = answerUpgradeReplacement(st);
    ok(picked.asked, 'вопрос о конкретной паре не задан');
    const deck = st.players[0].decks.combat;
    eq(deck.length, before.length, 'колода осталась из десяти карт');
    eq(deck.filter(n => n === picked.card).length, 2, 'ровно две копии улучшения');
    eq(deck.filter(n => n === picked.remove).length, before.filter(n => n === picked.remove).length - 2,
        'выбранная пара удалена');
    ok(st.players[0].decks.upgradeCombat.includes(picked.remove), 'снятая карта вернулась в колоду улучшений');
    const detail = FS_CARDS.detail(picked.card, 'имперская-гвардия', 'combat');
    ok(!!(detail.text || detail.general || detail.unit), 'полная информация о карте улучшения доступна');
    const event = FS_CARDS.detail('Приказ верховного командования', 'имперская-гвардия', 'event');
    return ok(!!event.text && Array.isArray(event.storm), 'полная информация о карте события доступна');
});

head('Замена боевых карт', 'некроны');
check('Архивы мира-гробницы', 'спрашивает, какую именно карту боевой колоды заменить', () => {
    const st = eventState('Архивы мира-гробницы', { faction: 'некроны', materiel: 20 });
    const before = st.players[0].decks.combat.slice();
    ok(playEvent(st).ok, 'событие не разыграно');
    const picked = answerUpgradeReplacement(st);
    ok(picked.asked, 'вопрос о конкретной паре не задан');
    const deck = st.players[0].decks.combat;
    eq(deck.length, before.length, 'колода осталась из десяти карт');
    eq(deck.filter(n => n === picked.card).length, 2, 'ровно две копии улучшения');
    return eq(deck.filter(n => n === picked.remove).length,
        before.filter(n => n === picked.remove).length - 2, 'выбранная пара удалена');
});

// --- инквизиция -------------------------------------------------------------
// ============================================================================
//  Имперская гвардия: боевая колода (docs/forbidden-stars/04-combat-cards.md)
// ============================================================================
const IG = 'имперская-гвардия';

/** The battle of the guard: a state of its own units against the necrons. */
const guardBattle = o => battle(Object.assign({ faction: IG, foeFaction: 'некроны' }, o));

/** The card of the guard deck by its name. */
const guardCard = name => FS_DATA.combat.find(c => c.faction === IG && c.name === name);

// Both sides reinforce before an actual Guard card effect is evaluated.
function guardTokenBattle(guard, space = false) {
    const foe = 1 - guard;
    const factions = guard === 0 ? [IG, 'некроны'] : ['некроны', IG];
    const mine = space ? { 'крейсеры': 1, 'линкоры': 2 } : { 'гвардейцы': 1, 'огрины': 2 };
    const theirs = space ? { 'крейсеры-жнец': 1, 'корабли-гробницы': 1 } : { 'воины': 1, 'бессмертные': 1 };
    const st = battle({ faction: factions[0], foeFaction: factions[1], kind: space ? 'space' : 'ground',
        units: guard === 0 ? mine : theirs, foeUnits: guard === 1 ? mine : theirs, roundEnd: true });
    for (const seat of [0, 1]) st.players[seat].assets.reinforcement = 1;
    for (const seat of [0, 1]) ok(FS_RULES.apply(st, seat, { type: 'combat', action: 'reinforce', count: 1 }).ok, 'подкрепление призвано');
    return st;
}
function setTokenStatus(st, side, status) {
    if (status !== 'standing') ok(FS_RULES.routeReinforcementToken(st, side, 0), 'жетон деморализован');
    if (status === 'destroyed') ok(FS_RULES.destroyReinforcementToken(st, side, 0, true), 'жетон уничтожен');
}

/**
 * The combat is driven to the step of the damage of the first side, its
 * questions answered by the policy: the moment «в начале шага нанесения
 * повреждений» of the cards is exactly there.
 */
function toDamageStep(st, policy) {
    const c = st.combat;
    for (let i = 0; i < 40 && st.combat; i++) {
        if (st.pending) { answerAll(st, policy, undefined); continue; }
        const step = c.step;
        if (step === 'damage-attacker' || step === 'damage-defender') return step;
        if (step === 'reinforce-attacker' || step === 'reinforce-defender') {
            const seat = step === 'reinforce-attacker' ? c.attacker : c.defender;
            FS_RULES.apply(st, seat, { type: 'combat', action: 'reinforce', count: 0 });
            continue;
        }
        if (step === 'choose-attacker' || step === 'choose-defender') {
            const side = step === 'choose-attacker' ? 'attacker' : 'defender';
            const seat = side === 'attacker' ? c.attacker : c.defender;
            if (!(c.cards[side].hand || []).length) { FS_RULES.advanceCombatSteps(st); continue; }
            FS_RULES.apply(st, seat, { type: 'combat', action: 'playCard', index: 0 });
            continue;
        }
        FS_RULES.advanceCombatSteps(st);
    }
    return st.combat ? st.combat.step : null;
}

/** The units of a seat of the battle by the name of their card. */
const namedUnits = (st, seat) => st.units.filter(u => u.seat === seat)
    .map(u => (FS_RULES.unitOf(st, u) || {}).name);

// ============================================================================
//  Имперская гвардия: карты событий (docs/forbidden-stars/06-events.md)
// ============================================================================
head('Карты событий', IG);

/** A refresh-phase state of the guard with the chosen event card of its deck. */
function guardEvent(name, o = {}) {
    const st = FS_RULES.newReadyGame({ seed: 5, players: players(IG, 'некроны') });
    st.units = [];
    st.structures = [];
    st.objectives = [];
    st.storms = [];
    for (const sys of st.systems) sys.tokens = [];
    const sys = st.systems[0];
    const pos = worldOf(st, sys.id);
    for (const [id, n] of Object.entries(o.units || {})) {
        for (let i = 0; i < n; i++) FS_RULES.addUnit(st, 0, id, sys.id, pos);
    }
    for (const [id, n] of Object.entries(o.foeUnits || {})) {
        for (let i = 0; i < n; i++) FS_RULES.addUnit(st, 1, id, sys.id, pos);
    }
    for (const type of o.structures || []) {
        st.structures.push({ id: 'str' + st.structures.length, seat: 0, type, system: sys.id, area: pos });
    }
    if (o.materiel !== undefined) st.players[0].materiel = o.materiel;
    if (o.assets) Object.assign(st.players[0].assets, o.assets);
    st.phase = 'refresh';
    st.eventsLeft = 2;
    st.event = { seat: 0, drawn: [name], chosen: name, stormMoved: true };
    st.event.card = FS_DATA.events.find(e => e.faction === IG && e.name === name);
    ok(!!st.event.card, 'нет карты события «' + name + '»');
    st.sys = sys.id;
    st.pos = pos;
    return st;
}

/** The unit of a seat of the given type, or null. */
const guardUnit = (st, id, seat) => st.units
    .find(u => (u.seat || 0) === (seat || 0) && (FS_RULES.unitOf(st, u) || {}).id === id) || null;

// --- Отбрыски Темпестус -------------------------------------------------------
// «Деморализуйте 1 вражеский отряд с командным уровнем 0 или 1, который
//  находится в системе, содержащей хотя бы 1 из ваших отрядов, либо находящийся
//  в соседней с ней системе.»
check('Отбрыски Темпестус', 'рядом со своим отрядом враг КЛ 0 деморализован', () => {
    const st = guardEvent('Отбрыски Темпестус', { units: { 'гвардейцы': 1 }, foeUnits: { 'воины': 2 } });
    const res = playEvent(st);
    ok(res.ok, 'карта не сыграна: ' + res.error);
    const q = pending(st);
    ok(!!q && q.op === 'route', 'вопроса о деморализации нет');
    effectAnswer(st, effectPolicy);
    return eq(foeUnits(st).filter(u => u.routed).length, 1, 'один отряд врага деморализован');
});

check('Отбрыски Темпестус', 'отряд 2 уровня не выбирается', () => {
    const st = guardEvent('Отбрыски Темпестус', { units: { 'гвардейцы': 1 }, foeUnits: { 'монолиты': 1 } });
    playEvent(st);
    // Свой отряд уровня 0 в системе есть, но у врага только КЛ 2 — цели нет.
    return eq(foeUnits(st).filter(u => u.routed).length, 0, 'деморализованных нет');
});

check('Отбрыски Темпестус', 'без своих отрядов карта ничего не делает', () => {
    const st = guardEvent('Отбрыски Темпестус', { foeUnits: { 'воины': 2 } });
    playEvent(st);
    return eq(foeUnits(st).filter(u => u.routed).length, 0, 'деморализованных нет');
});

// --- Смена военного производства ---------------------------------------------
// «Выберите дружественный мир. Получите ценные ресурсы и материалы этого мира.»
check('Смена военного производства', 'материя и ресурсы мира достаются игроку', () => {
    const st = guardEvent('Смена военного производства', {
        units: { 'гвардейцы': 1 }, structures: ['city', 'factory'], materiel: 6,
        assets: { forge: 0, cache: 0 },
    });
    playEvent(st);
    const q = pending(st);
    ok(!!q && q.kind === 'areas', 'выбора мира нет');
    const before = st.players[0].materiel;
    effectAnswer(st, effectPolicy);
    // Город и фабрика мира дают по жетону, материя — за них же.
    ok(st.players[0].materiel > before, 'материя не пришла');
    return ok(st.players[0].assets.forge + st.players[0].assets.cache > 0, 'ресурсы мира не пришли');
});

// «Выберите дружественный мир» — выбор обязан дойти до шага, который берёт
// ресурсы. Города и фабрики стоят на ДВУХ разных мирах, и выбран не первый:
// иначе «дошло» и «не дошло» дают один и тот же ответ.
check('Смена военного производства', 'ресурсы берутся с ВЫБРАННОГО мира, а не с первого', () => {
    const st = guardEvent('Смена военного производства', { units: { 'гвардейцы': 1 }, materiel: 0 });
    const sys = st.systems.find(x => x.id === st.sys);
    // У мира своя ПЕЧАТНАЯ материя и свои печатные жетоны: город и фабрика на
    // них не влияют. Берём два дружественных мира с РАЗНЫМИ печатными
    // ресурсами (у одного кузня, у другого кеш) и выбираем не первый.
    const withForge = sys.areas.filter(a => a.world && (a.world.assets || []).includes('forge'))[0];
    const withCache = sys.areas.filter(a => a.world && (a.world.assets || []).includes('cache'))[0];
    ok(!!withForge && !!withCache, 'в системе нет двух миров с разными печатными ресурсами');
    ok(withCache.pos !== withForge.pos, 'миры совпали');
    FS_RULES.addUnit(st, 0, 'гвардейцы', sys.id, withCache.pos);
    st.players[0].materiel = 0;
    st.players[0].assets.forge = 0;
    st.players[0].assets.cache = 0;
    playEvent(st);
    const q = pending(st);
    ok(!!q && q.kind === 'areas', 'выбора мира нет');
    const target = (q.options || []).find(o => o.pos === withCache.pos);
    ok(!!target, 'мир с кешем не предложен');
    // Мир выбирается ОДИН раз: если движок спросит второй раз, ответ на второй
    // вопрос — другой мир, и тогда видно, что выбор первого потерялся.
    let asked = 0;
    const other = (q.options || []).find(o => o.pos === withForge.pos);
    effectAnswer(st, (s2, q2) => {
        if (q2.kind !== 'areas') return firstOption(s2, q2);
        asked++;
        return { area: asked === 1 ? target : other };
    });
    eq(asked, 1, 'мир спрошен один раз, а не дважды');
    eq(st.players[0].assets.cache, 1, 'пришёл жетон ВЫБРАННОГО мира');
    eq(st.players[0].assets.forge, 0, 'жетон другого мира не пришёл');
    return eq(st.players[0].materiel, withCache.world.materiel || 0,
        'материя — печатная материя выбранного мира (' + (withCache.world.materiel || 0) + ')');
});

// --- Имперская десятина -------------------------------------------------------
// «Либо разместите 2 бесплатных Гвардейца в одном дружественном мире, содержащем
//  фабрику, либо разместите 1 бесплатного Гвардейца в любом дружественном мире.»
check('Имперская десятина', 'два бесплатных Гвардейца в мире с фабрикой', () => {
    const st = guardEvent('Имперская десятина', { units: { 'огрины': 1 }, structures: ['factory'] });
    playEvent(st);
    const q = pending(st);
    ok(!!q && q.kind === 'choice', 'выбора ветки нет');
    eq((q.options || []).length, 2, 'две ветки');
    // Ветка с фабрикой требует мира с фабрикой: без неё предлагается только вторая.
    effectAnswer(st, effectPick(0));
    eq(namedUnits(st, 0).filter(n => n === 'Гвардейцы').length, 2, 'два Гвардейца размещены');
    return eq(st.players[0].materiel, st.players[0].materiel, 'размещение бесплатное');
});

check('Имперская десятина', 'один Гвардеец в любом дружественном мире', () => {
    const st = guardEvent('Имперская десятина', { units: { 'огрины': 1 } });
    playEvent(st);
    effectAnswer(st, effectPick(1));
    return eq(namedUnits(st, 0).filter(n => n === 'Гвардейцы').length, 1, 'один Гвардеец размещён');
});

// --- Приказ верховного командования ------------------------------------------
// «Приобретите 1 боевое улучшение, уменьшите его стоимость на 1 за каждый
//  дружественный мир, в котором есть фабрика.»
check('Приказ верховного командования', 'скидка по числу миров с фабрикой', () => {
    const st = guardEvent('Приказ верховного командования', { materiel: 10 });
    // Два мира с фабрикой: скидка 2.
    const worlds = st.systems.map(sys => ({ system: sys.id, pos: worldOf(st, sys.id) })).filter(w => w.pos);
    for (const w of worlds.slice(0, 2)) {
        st.structures.push({ id: 'f' + st.structures.length, seat: 0, type: 'factory', system: w.system, area: w.pos });
    }
    playEvent(st);
    const q = pending(st);
    ok(!!q && q.op === 'buyUpgrade', 'выбора улучшения нет');
    const name = (q.options || []).find(n => n === 'Молот Императора') || (q.options || [])[0];
    const card = guardCard(name);
    const before = st.players[0].materiel;
    effectAnswer(st, (s, question) => (question.op === 'buyUpgradeReplace'
        ? { remove: (question.options || [])[0] } : { card: name }), 8);
    // Цена карты 6 минус две фабрики: заплачено 4.
    return eq(before - st.players[0].materiel, Math.max(0, (card.cost || 0) - 2), 'цена со скидкой 2');
});

// --- Планы ИГ -----------------------------------------------------------------
// Планы кладутся в игровую зону: `schemeInPlay` берёт их шаги из того же
// разбора текста, а проверки ждут момента, который называет карта.
/** A scheme of the guard in the zone of the given seat (the defender may plunder it too). */
function guardScheme(st, name, seat) {
    const card = FS_DATA.events.find(e => e.faction === IG && e.name === name);
    ok(!!card, 'нет карты «' + name + '»');
    const trig = FS_EFFECTS.parse(card.text || '', { kind: 'event', faction: IG }).find(s => s.op === 'trigger');
    const at = seat === undefined ? 0 : seat;
    st.players[at].schemes = st.players[at].schemes || [];
    st.players[at].schemes.push({
        name: card.name, text: card.text || '',
        trigger: trig ? trig.trigger : null, steps: trig ? trig.steps : [],
        note: trig ? !!trig.note : true, defer: trig ? !!trig.defer : false,
    });
    return st.players[at].schemes[st.players[at].schemes.length - 1];
}

/** Ход боя до конца шага призыва подкреплений указанной стороны. */
function toReinforceEnd(st, side) {
    const c = st.combat;
    for (let i = 0; i < 24 && st.combat && !st.pending; i++) {
        const step = c.step;
        if (step.startsWith('reinforce-')) {
            const s2 = step.slice('reinforce-'.length);
            const seat = s2 === 'attacker' ? c.attacker : c.defender;
            const res = FS_RULES.apply(st, seat, { type: 'combat', action: 'reinforce', count: 0 });
            if (!res.ok) throw new Error('призыв не прошёл: ' + res.error);
            if (s2 === side) return st.pending ? st : (toReinforceEnd(st, side), st);
            continue;
        }
        if (step.startsWith('choose-')) {
            const s2 = step.slice('choose-'.length);
            if ((c.cards[s2].hand || []).length) {
                FS_RULES.apply(st, s2 === 'attacker' ? c.attacker : c.defender,
                    { type: 'combat', action: 'playCard', index: 0 });
            } else FS_RULES.apply(st, c.attacker, { type: 'combat', action: 'advance' });
            continue;
        }
        FS_RULES.combatAdvance ? FS_RULES.combatAdvance(st) : FS_RULES.advanceCombatSteps(st);
    }
    return st;
}

// --- Зов астропатов -----------------------------------------------------------
// «Во время боя, в конце шага призыва подкреплений, если вы защищаетесь, вы
//  можете сбросить эту карту, чтобы разместить 2 бесплатных жетона подкрепления
//  в спорной области.»
check('Зов астропатов', 'защитник получает 2 бесплатных жетона подкрепления', () => {
    // ИГ — защитник: атакуют некроны.
    const st = battle({ faction: 'некроны', foeFaction: IG, units: { 'воины': 2 }, foeUnits: { 'огрины': 2 }, foeDice: ['att'], foeCard: 'Ложись!' });
    eq(st.combat.defender, 1, 'ИГ обороняется');
    guardScheme(st, 'Зов астропатов', 1);
    toReinforceEnd(st, 'defender');
    const q = pending(st);
    ok(!!q && q.kind === 'scheme', 'план не предложен');
    const before = CombatTokens.of(st.combat).units('defender').used;
    effectAnswer(st, { choice: 0 });
    eq(CombatTokens.of(st.combat).units('defender').used, before + 2, 'два жетона в спорной области');
    return eq((st.players[1].schemes || []).length, 0, 'план сброшен');
});

check('Зов астропатов', 'пустой шаг подкреплений автоматически проходит через окно плана', () => {
    let st = battle({ faction: 'некроны', foeFaction: IG, units: { 'воины': 2 },
        foeUnits: { 'огрины': 2 }, foeCard: 'Ложись!', roundEnd: true });
    guardScheme(st, 'Зов астропатов', 1);
    st.players[1].assets.reinforcement = 0;
    ok(FS_RULES.apply(st, 0, { type: 'combat', action: 'reinforce', count: 0 }).ok, 'атакующий пропустил жетоны');
    FS_RULES.advanceCombatSteps(st);
    eq([st.pending?.seat, pending(st)?.options], [1, ['Зов астропатов']], 'защитник может сыграть план даже без своих жетонов');
    st = JSON.parse(JSON.stringify(st));
    ok(FS_RULES.apply(st, 1, { type: 'effect', answer: { choice: 0 } }).ok, 'план принят после JSON');
    eq(CombatTokens.of(st.combat).used('defender'), 2, 'два бесплатных подкрепления размещены');
    eq(st.combat.step, 'choose-attacker', 'шаг подкреплений завершён');
});

check('Зов астропатов', 'атакующему план не предлагается', () => {
    // Условие карты — «если вы защищаетесь».
    const st = battle({ faction: IG, foeFaction: 'некроны', units: { 'огрины': 2 }, foeUnits: { 'воины': 2 }, foeDice: ['att'], dice: ['att'], card: 'Ложись!' });
    const plan = guardScheme(st, 'Зов астропатов', 0);
    eq(plan.trigger, 'reinforce-end', 'план ждёт конца шага призыва');
    // В бою, где ИГ атакует, условие не выполнено: план остаётся в зоне.
    toReinforceEnd(st, 'defender');
    return eq((st.players[0].schemes || []).length, 1, 'план не сброшен');
});

// --- Тактический гений --------------------------------------------------------
// «Вместо того, чтобы играть боевую карту из руки, вы можете сбросить эту карту,
//  чтобы сыграть любую карту из своей боевой колоды или колоды улучшений, кроме
//  карты, которая уже была разыграна.»
check('Тактический гений', 'вместо карты из руки берётся карта из колоды', () => {
    const st = battle({ faction: IG, foeFaction: 'некроны', units: { 'огрины': 2 }, foeUnits: { 'воины': 2 }, dice: ['att'], foeDice: ['att'], foeCard: 'Ложись!' });
    st.combat.cards.attacker.hand = ['Ложись!', 'За Императора!', 'Огневая поддержка'];
    // Колода боя — только те карты, которых нет на руке: иначе «пришла в руку»
    // выполнялось бы и без карты (эта карта уже лежит в руке).
    const deck = st.players[0].decks.combat;
    deck.splice(0, deck.length, 'Железная дисциплина', 'Ратлинг стрелок');
    guardScheme(st, 'Тактический гений', 0);
    const played = st.combat.cards.attacker.played.map(p => p.name || p);
    const q0 = (() => {
        // Вопрос плана приходит на шаге выбора боевой карты.
        FS_RULES.advanceCombatSteps(st);
        return pending(st);
    })();
    ok(!q0 || q0.kind !== 'scheme', 'план не предложен сразу');
    // Шаг выбора карты: план спрашивается здесь.
    let asked = null;
    for (let i = 0; i < 8 && st.combat && !asked; i++) {
        if (st.pending) { asked = pending(st); break; }
        const step = st.combat.step;
        if (step === 'choose-attacker' || step === 'choose-defender') {
            FS_RULES.advanceCombatSteps(st);
            asked = pending(st);
            break;
        }
        if (step.startsWith('reinforce-')) {
            const s2 = step.slice('reinforce-'.length);
            FS_RULES.apply(st, s2 === 'attacker' ? st.combat.attacker : st.combat.defender,
                { type: 'combat', action: 'reinforce', count: 0 });
            continue;
        }
        FS_RULES.advanceCombatSteps(st);
    }
    ok(!!asked && asked.kind === 'scheme', 'план не предложен у выбора карты');
    let chosen = null;
    effectAnswer(st, (s, q) => {
        if (q.kind === 'scheme') return { choice: 0 };
        if (q.op === 'playAnyCard') { chosen = q; return { card: (q.options || [])[0] }; }
        return effectPolicy(s, q);
    }, 6);
    ok(!!chosen, 'выбора карты из колоды нет');
    const options = chosen.options || [];
    ok(options.length > 0, 'в колоде нет карт');
    // «кроме карты, которая уже была разыграна»: сыгранная карта не предлагается.
    eq(options.some(n => played.includes(n)), false, 'разыгранная карта не в списке');
    // «из своей боевой колоды»: карта уходит из колоды и приходит в руку —
    // обе половины, иначе карта лежала бы в двух местах сразу.
    eq(deck.includes(options[0]), false, 'карта ушла из колоды');
    eq(st.combat.cards.attacker.hand.includes(options[0]), true, 'карта пришла в руку');
    return eq((st.players[0].schemes || []).length, 0, 'план сброшен');
});

// --- Точечный удар ------------------------------------------------------------
// «Перед тем, как нанести орбитальный удар, вы можете сбросить эту карту, чтобы
//  добавить 2 к общей сумме урона.»
check('Точечный удар', 'сумма удара растёт на 2', () => {
    const strike = withCard => {
        const st = strikeState({ faction: IG, foeFaction: 'некроны', ships: { 'крейсеры': 2 }, foeUnits: { 'воины': 1 }, upgrades: [] });
        if (withCard) schemeInPlay(st, 'Точечный удар', IG);
        const roll = FS_RULES.rollDice;
        FS_RULES.rollDice = () => ['att', 'att'];
        const cmd = { type: 'orbitalStrike', system: st.systems[0].id, pos: st.strikeWorld };
        FS_RULES.apply(st, 0, cmd);
        effectAnswer(st, (s, q) => (q.kind === 'scheme' ? { choice: 0 } : effectPolicy(s, q)), 6);
        if (!st.strike) FS_RULES.apply(st, 0, cmd);
        FS_RULES.rollDice = roll;
        return st;
    };
    const plain = strike(false);
    eq(plain.strike.hits, 2, 'без карты — два попадания');
    const card = strike(true);
    eq(card.strike.hits, 4, 'с картой — четыре попадания');
    return eq((card.players[0].schemes || []).length, 0, 'план сброшен');
});

// --- Ракета «Death Strike» ----------------------------------------------------
// «Вы можете сбросить эту карту в начале боя в любом мире. Если вы это сделаете,
//  то в конце первого шага нанесения повреждений либо уничтожьте 1 отряд
//  противника с командным уровнем 0 или 1 в этом мире, либо деморализуйте 1 отряд
//  с командным уровнем 2 в этом мире.»
check('Ракета «Death Strike»', 'предлагается только в мире и только участнику боя, в атаке и защите', () => {
    for (const kind of ['ground', 'space']) for (const guardSeat of [0, 1]) {
        const factions = guardSeat === 0 ? [IG, 'империя-тау'] : ['империя-тау', IG];
        let st = FS_RULES.newReadyGame({ seed: 33, players: players(...factions) });
        st.units = []; st.structures = []; st.storms = [];
        for (const sys of st.systems) sys.tokens = [];
        const sys = st.systems[0], area = sys.areas.find(a => kind === 'ground' ? !!a.world : !a.world);
        ok(area, 'найдена область нужного типа');
        for (const seat of [0, 1]) {
            const guard = seat === guardSeat;
            const id = kind === 'ground' ? (guard ? 'гвардейцы' : 'воины-огня')
                : (guard ? 'крейсеры' : 'крейсеры-защитник');
            FS_RULES.addUnit(st, seat, id, sys.id, area.pos);
        }
        st.phase = 'operations'; st.turn = 0;
        st.order = { seat: 0, order: 'advance', system: sys.id, phase: 'combat' };
        const card = FS_DATA.events.find(e => e.faction === IG && e.name === 'Ракета «Death Strike»');
        FS_RULES.keepEventScheme(st, guardSeat, card);
        FS_RULES.startCombat(st, 0, 1, sys.id, area.pos);
        if (kind === 'ground') {
            eq([st.pending?.seat, pending(st)?.options], [guardSeat, ['Ракета «Death Strike»']], 'ракета доступна в мире её владельцу');
            st = JSON.parse(JSON.stringify(st));
            ok(FS_RULES.apply(st, guardSeat, { type: 'effect', answer: { no: true } }).ok, 'отказ после JSON');
            eq(st.pending, null, 'отказ не мешает подготовке');
            ok(st.players[guardSeat].schemes.some(x => x.name === card.name), 'отказанный план сохранён');
        } else {
            eq(!!st.pending, false, 'в пустоте ракету не предлагают');
            ok(st.players[guardSeat].schemes.some(x => x.name === card.name), 'план остаётся для боя в мире');
        }
        eq(st.combat.cards.attacker.hand.length, 5, 'после окна карты розданы');
    }
});

check('Ракета «Death Strike»', 'третий игрок не вмешивается в бой в мире или пустоте', () => {
    for (const kind of ['ground', 'space']) {
        const st = FS_RULES.newReadyGame({ seed: 35, players: [
            { faction: TAU, name: 'Атакующий Тау', id: 'p0' },
            { faction: 'эльдары', name: 'Защитник', id: 'p1' },
            { faction: IG, name: 'Гвардия не в бою', id: 'p2' },
        ] });
        st.units = []; st.structures = []; st.storms = [];
        for (const s2 of st.systems) s2.tokens = [];
        const sys = st.systems[0], area = sys.areas.find(a => kind === 'ground' ? !!a.world : !a.world);
        FS_RULES.addUnit(st, 0, kind === 'ground' ? 'воины-огня' : 'крейсеры-защитник', sys.id, area.pos);
        FS_RULES.addUnit(st, 1, kind === 'ground' ? 'аспектные-воины' : 'фрегаты-класса-хелебор', sys.id, area.pos);
        st.phase = 'operations'; st.turn = 0;
        st.order = { seat: 0, order: 'advance', system: sys.id, phase: 'combat' };
        const rocket = FS_DATA.events.find(e => e.faction === IG && e.name === 'Ракета «Death Strike»');
        FS_RULES.keepEventScheme(st, 2, rocket);
        keepTauPlan(st, 0, 'Философия войны');
        FS_RULES.startCombat(st, 0, 1, sys.id, area.pos);
        eq([st.pending?.seat, pending(st)?.options], [0, ['Философия войны']], 'предложен только план участника');
        eq(FS_RULES.apply(st, 2, { type: 'effect', answer: { choice: 0 } }).ok, false, 'третье место не отвечает за участника');
        ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { no: true } }).ok, 'участник отказался');
        eq(!!st.pending, false, 'третьему игроку вопрос не задан');
        ok(st.players[2].schemes.some(x => x.name === rocket.name), 'ракета наблюдателя сохранена');
    }
});

check('Ракета «Death Strike»', 'срабатывает до повторного шага Некронов только один раз, с обеих сторон', () => {
    for (const guard of [0, 1]) for (const branch of [0, 1]) for (const accept of [false, true]) {
        const necron = 1 - guard;
        const factions = guard === 0 ? [IG, 'некроны'] : ['некроны', IG];
        let st = FS_RULES.newReadyGame({ seed: 33, players: players(...factions) });
        st.units = []; st.structures = []; st.storms = [];
        for (const sys of st.systems) sys.tokens = [];
        const sys = st.systems[0], area = sys.areas.find(a => a.world);
        for (const seat of [0, 1]) {
            const type = seat === guard ? 'гвардейцы' : 'воины';
            for (let i = 0; i < 3; i++) FS_RULES.addUnit(st, seat, type, sys.id, area.pos);
            st.players[seat].assets.reinforcement = 1;
        }
        const mono = FS_RULES.addUnit(st, necron, 'монолиты', sys.id, area.pos).id;
        st.phase = 'operations'; st.turn = 0;
        st.order = { seat: 0, order: 'advance', system: sys.id, phase: 'combat' };
        FS_RULES.keepEventScheme(st, guard, FS_DATA.events.find(c => c.faction === IG && c.name === 'Ракета «Death Strike»'));
        FS_RULES.keepEventScheme(st, necron, FS_DATA.events.find(c => c.faction === 'некроны' && c.name === 'Безжалостное наступление'));
        FS_RULES.startCombat(st, 0, 1, sys.id, area.pos);
        eq([st.pending?.seat, pending(st)?.options], [guard, ['Ракета «Death Strike»']], 'ракета в начале боя');
        st = JSON.parse(JSON.stringify(st));
        ok(FS_RULES.apply(st, guard, { type: 'effect', answer: accept ? { choice: 0 } : { no: true } }).ok, 'ответ на ракету');
        for (const seat of [0, 1]) ok(FS_RULES.apply(st, seat,
            { type: 'combat', action: 'reinforce', count: 0 }).ok, 'подготовка');
        eq([st.pending?.seat, pending(st)?.options], [necron, ['Безжалостное наступление']], 'план повтора в начале раунда');
        ok(FS_RULES.apply(st, necron, { type: 'effect', answer: { choice: 0 } }).ok, 'повтор принят');
        CombatTurn.of(st.combat).setDice('attacker', ['def']).setDice('defender', ['def']).setStep('damage-attacker');
        FS_RULES.advanceCombatSteps(st);
        if (accept) {
            eq([!!st.combat.damageRepeated, st.pending?.seat, pending(st)?.kind], [false, guard, 'choice'], 'выбор ракеты до повтора даже при нулевом уроне');
            st = JSON.parse(JSON.stringify(st));
            ok(FS_RULES.apply(st, guard, { type: 'effect', answer: { choice: branch } }).ok, 'ветка ракеты после JSON');
            const q = pending(st);
            eq([st.pending?.seat, q?.kind, q?.op], [guard, 'units', branch ? 'route' : 'destroy'], 'цель ракеты');
            const target = branch ? mono : q.options.find(id => st.units.find(u => u.id === id && u.seat === necron && u.unit === 'воины'));
            ok(q.options.includes(target), 'подходящая цель предложена');
            // The first step is over. Give the repeated step nonzero damage so
            // its start remains observable after the target answer.
            CombatTurn.of(st.combat).setDice('attacker', ['att']).setDice('defender', ['att']);
            st = JSON.parse(JSON.stringify(st));
            ok(FS_RULES.apply(st, guard, { type: 'effect', answer: { units: [target] } }).ok, 'цель после JSON');
            eq(branch ? !!st.units.find(u => u.id === target)?.routed : !!st.units.find(u => u.id === target),
                branch ? true : false, 'эффект применён перед повтором');
            eq([!!st.combat.damageRepeated, st.combat.step, st.pending], [true, 'damage-attacker', null], 'затем начинается повтор');
            for (const [side, seat] of [['attacker', 0], ['defender', 1]]) {
                const target2 = FS_RULES.damageCandidates(st, side)[0];
                ok(FS_RULES.apply(st, seat, { type: 'combat', action: 'damage', targets: [target2.id] }).ok, 'повторный урон');
                ok(pending(st)?.op !== 'destroy' && pending(st)?.op !== 'route', 'ракета не срабатывает второй раз');
            }
            eq(st.players[guard].schemes.length, 0, 'ракета сброшена один раз');
        } else {
            eq([st.pending, st.combat.round, st.combat.step],
                [null, 2, 'choose-attacker'], 'отказ не создаёт отложенный эффект ни в одном шаге');
            eq(st.players[guard].schemes.length, 1, 'отказанный план остался');
        }
    }
});

check('Ракета «Death Strike»', 'не теряется, когда «Рой потрошителей» тоже ждёт конца урона', () => {
    for (const guard of [0, 1]) {
        const tyr = 1 - guard, guardSide = guard === 0 ? 'attacker' : 'defender', tyrSide = tyr === 0 ? 'attacker' : 'defender';
        const factions = guard === 0 ? [IG, TYR] : [TYR, IG];
        let st = FS_RULES.newReadyGame({ seed: 34, players: players(...factions) });
        st.units = []; st.structures = []; st.storms = [];
        for (const sys of st.systems) sys.tokens = [];
        const sys = st.systems[0], area = sys.areas.find(a => a.world);
        for (let i = 0; i < 3; i++) {
            FS_RULES.addUnit(st, guard, 'гвардейцы', sys.id, area.pos);
            FS_RULES.addUnit(st, tyr, 'гаунты', sys.id, area.pos);
        }
        const heavy = FS_RULES.addUnit(st, tyr, 'карнифексы', sys.id, area.pos).id;
        for (const p of st.players) p.assets.reinforcement = 1;
        st.players[tyr].materiel = 0;
        st.phase = 'operations'; st.turn = 0;
        st.order = { seat: 0, order: 'advance', system: sys.id, phase: 'combat' };
        FS_RULES.keepEventScheme(st, guard, FS_DATA.events.find(c => c.faction === IG && c.name === 'Ракета «Death Strike»'));
        FS_RULES.startCombat(st, 0, 1, sys.id, area.pos);
        ok(FS_RULES.apply(st, guard, { type: 'effect', answer: { choice: 0 } }).ok, 'ракета принята');
        for (const seat of [0, 1]) ok(FS_RULES.apply(st, seat,
            { type: 'combat', action: 'reinforce', count: 0 }).ok, 'подготовка');
        st.combat.cards[guardSide].hand = ['Ложись!', 'Ложись!'];
        st.combat.cards[tyrSide].hand = ['Рой потрошителей', 'Рой потрошителей'];
        CombatTurn.of(st.combat).setDice(tyrSide, Array(8).fill('def'))
            .setDice(guardSide, [...Array(8).fill('def'), ...Array(12).fill('att')]);
        play(st, tyr, 0);
        answerAll(st, firstOption);
        eq(st.combat.step, 'damage-' + tyrSide, 'урон Тиранидам');
        CombatTurn.of(st.combat).setDice(tyrSide, Array(8).fill('def')).setDice(guardSide, Array(8).fill('def'));
        const attack = FS_RULES.combatValues(st, guardSide).att, defence = FS_RULES.combatValues(st, tyrSide).def;
        CombatTurn.of(st.combat).setDice(guardSide, [...Array(8).fill('def'), ...Array(defence + 1 - attack).fill('att')]);
        eq([FS_RULES.combatDamageFor(st, tyrSide), FS_RULES.combatDamageFor(st, guardSide)], [1, 0], 'только один Гаунт получит урон');
        const victim = st.units.find(u => u.seat === tyr && u.unit === 'гаунты');
        ok(FS_RULES.apply(st, tyr, { type: 'combat', action: 'damage', targets: [victim.id] }).ok, 'урон');
        eq([st.pending?.seat, pending(st)?.kind], [guard, 'choice'], 'ракета не потерялась за боевой картой');
        st = JSON.parse(JSON.stringify(st));
        ok(FS_RULES.apply(st, guard, { type: 'effect', answer: { choice: 1 } }).ok, 'ветка деморализации');
        eq(pending(st)?.op, 'route', 'выбор цели ракеты');
        ok(FS_RULES.apply(st, guard, { type: 'effect', answer: { units: [heavy] } }).ok, 'цель ракеты');
        eq(st.units.find(u => u.id === heavy)?.routed, true, 'ракета деморализовала Карнифекса');
        eq(st.players[tyr].materiel, 1, 'Рой тоже начислил материю за погибшего Гаунта');
        eq(st.pending, null, 'оба отложенных эффекта завершены');
    }
});

check('Ракета «Death Strike»', 'может уничтожить подкрепление или модель КЛ 0, в том числе деморализованные', () => {
    for (const guard of [0, 1]) for (const routed of [false, true]) for (const kind of ['token', 'model']) {
        const marine = 1 - guard, guardSide = guard === 0 ? 'attacker' : 'defender', marineSide = marine === 0 ? 'attacker' : 'defender';
        const factions = guard === 0 ? [IG, 'космодесант'] : ['космодесант', IG];
        let st = FS_RULES.newReadyGame({ seed: 34, players: players(...factions) });
        st.units = []; st.structures = []; st.storms = [];
        for (const sys of st.systems) sys.tokens = [];
        const sys = st.systems[0], area = sys.areas.find(a => a.world);
        for (let i = 0; i < 2; i++) FS_RULES.addUnit(st, guard, 'гвардейцы', sys.id, area.pos);
        const scout = FS_RULES.addUnit(st, marine, 'скауты', sys.id, area.pos).id;
        const other = kind === 'model' ? FS_RULES.addUnit(st, marine, 'скауты', sys.id, area.pos).id : null;
        st.players[marine].assets.reinforcement = 1;
        st.players[guard].assets.reinforcement = 1;
        st.phase = 'operations'; st.turn = 0;
        st.order = { seat: 0, order: 'advance', system: sys.id, phase: 'combat' };
        FS_RULES.keepEventScheme(st, guard, FS_DATA.events.find(c => c.faction === IG && c.name === 'Ракета «Death Strike»'));
        FS_RULES.startCombat(st, 0, 1, sys.id, area.pos);
        ok(FS_RULES.apply(st, guard, { type: 'effect', answer: { choice: 0 } }).ok, 'ракета принята');
        for (const seat of [0, 1]) ok(FS_RULES.apply(st, seat, { type: 'combat', action: 'reinforce',
            count: seat === marine ? 1 : 0 }).ok, 'подкрепление призвано');
        st.combat.cards[guardSide].hand = ['Ложись!', 'Ложись!'];
        st.combat.cards[marineSide].hand = ['Благословленная броня', 'Благословленная броня'];
        CombatTurn.of(st.combat).setDice(marineSide, Array(8).fill('def'))
            .setDice(guardSide, [...Array(8).fill('def'), ...Array(12).fill('att')]);
        play(st, guard, 0);
        answerAll(st, firstOption);
        if (routed) {
            if (kind === 'token') ok(FS_RULES.routeReinforcementToken(st, marineSide, 0), 'жетон уже деморализован');
            else ok(FS_RULES.routeUnit(st, st.units.find(u => u.id === other)), 'модель уже деморализована');
        }
        CombatTurn.of(st.combat).setDice(marineSide, Array(8).fill('def')).setDice(guardSide, Array(8).fill('def'));
        const attack = FS_RULES.combatValues(st, guardSide).att, defence = FS_RULES.combatValues(st, marineSide).def;
        CombatTurn.of(st.combat).setDice(guardSide, [...Array(8).fill('def'), ...Array(defence + 2 - attack).fill('att')]);
        eq([FS_RULES.combatDamageFor(st, marineSide), FS_RULES.combatDamageFor(st, guardSide)], [2, 0], 'урон уничтожает только Скаута');
        ok(FS_RULES.apply(st, marine, { type: 'combat', action: 'damage', targets: [scout] }).ok, 'урон распределён');
        eq([st.pending?.seat, pending(st)?.kind], [guard, 'choice'], 'ракета не пропущена, когда остался один жетон');
        st = JSON.parse(JSON.stringify(st));
        ok(FS_RULES.apply(st, guard, { type: 'effect', answer: { choice: 0 } }).ok, 'ветка уничтожения');
        const token = 'reinforce-' + marineSide + '-0';
        eq([pending(st)?.op, pending(st)?.options], ['destroy', other ? [other, token] : [token]],
            'предложены оставшиеся подходящие модель и жетон');
        for (const forged of [['reinforce-' + guardSide + '-0'], [], [token, token]]) {
            const before = JSON.stringify(st);
            eq(FS_RULES.apply(st, guard, { type: 'effect', answer: { units: forged } }).ok,
                false, 'поддельная, пустая или повторённая цель отклонена');
            eq(JSON.stringify(st), before, 'неверный ответ не закрывает вопрос');
        }
        st = JSON.parse(JSON.stringify(st));
        const combat = st.combat;
        ok(FS_RULES.apply(st, guard, { type: 'effect', answer: { units: [other || token] } }).ok, 'цель выбрана после JSON');
        if (other) eq(!!st.units.find(u => u.id === other), false, 'модель уничтожена');
        else eq(CombatTokens.of(combat).alive(marineSide, 0), false, 'жетон уничтожен');
        eq(st.players[marine].assets.reinforcement, 0, 'жетон не вернулся в ресурсы');
    }
});

check('Ракета «Death Strike»', 'в конце первого шага повреждений гибнет отряд КЛ 0–1', () => {
    const st = guardBattle({ units: { 'гвардейцы': 2 }, foeUnits: { 'воины': 2, 'монолиты': 1 }, card: 'Ложись!', foeCard: 'Ложись!', dice: ['att'], foeDice: ['att'] });
    schemeInPlay(st, 'Ракета «Death Strike»', IG);
    // Момент карты — начало боя.
    FS_RULES.maybeScheme(st, 0, 'combat-start', { kind: 'combat', ctx: { side: 'attacker' } });
    const q = pending(st);
    ok(!!q && q.kind === 'scheme', 'план не предложен в начале боя');
    effectAnswer(st, { choice: 0 });
    eq((st.players[0].schemes || []).length, 0, 'план сброшен');
    st.combat.dice.attacker = Array(8).fill('def');
    st.combat.dice.defender = Array(8).fill('def');
    // До конца шага повреждений вопрос не задаётся.
    let asked = false;
    for (let i = 0; i < 24 && st.combat; i++) {
        if (st.pending) {
            const q2 = st.pending.question;
            if (q2.kind === 'choice' || q2.op === 'destroy' || q2.op === 'route') asked = true;
            effectAnswer(st, (s, question) => (question.kind === 'choice' ? { choice: 0 } : effectPolicy(s, question)));
            if (asked) break;
            continue;
        }
        const step = st.combat.step;
        if (step === 'damage-attacker' || step === 'damage-defender') {
            const side = step === 'damage-attacker' ? 'attacker' : 'defender';
            const seat = ctx.CombatHooks.of(st.combat).assignSeat(st.combat[side]);
            const result = FS_RULES.apply(st, seat, { type: 'combat', action: 'damage', targets: FS_RULES.damageCandidates(st, side).map(x => x.id) });
            ok(result.ok, 'урон распределён: ' + result.error);
            continue;
        }
        if (step.startsWith('reinforce-')) {
            const s2 = step.slice('reinforce-'.length);
            FS_RULES.apply(st, s2 === 'attacker' ? st.combat.attacker : st.combat.defender,
                { type: 'combat', action: 'reinforce', count: 0 });
            continue;
        }
        if (step.startsWith('choose-')) {
            const s2 = step.slice('choose-'.length);
            if ((st.combat.cards[s2].hand || []).length) {
                FS_RULES.apply(st, s2 === 'attacker' ? st.combat.attacker : st.combat.defender,
                    { type: 'combat', action: 'playCard', index: 0 });
            } else FS_RULES.apply(st, st.combat.attacker, { type: 'combat', action: 'advance' });
            continue;
        }
        FS_RULES.advanceCombatSteps(st);
    }
    ok(asked, 'вопрос ракеты не задан');
    return eq(foeUnits(st).filter(u => (FS_RULES.unitOf(st, u) || {}).id === 'воины').length, 1, 'один отряд КЛ 0 уничтожен');
});

check('Ракета «Death Strike»', 'вторая ветка деморализует отряд КЛ 2', () => {
    const st = guardBattle({ units: { 'гвардейцы': 2 }, foeUnits: { 'воины': 2, 'монолиты': 1 }, card: 'Ложись!', foeCard: 'Ложись!', dice: ['att'], foeDice: ['att'] });
    guardScheme(st, 'Ракета «Death Strike»', 0);
    FS_RULES.maybeScheme(st, 0, 'combat-start', { kind: 'combat', ctx: { side: 'attacker' } });
    effectAnswer(st, { choice: 0 });
    st.combat.dice.attacker = Array(8).fill('def');
    st.combat.dice.defender = Array(8).fill('def');
    // До конца первого шага повреждений бой идёт своим чередом; на вопрос карты
    // отвечаем второй веткой — «деморализуйте 1 отряд с командным уровнем 2».
    for (let i = 0; i < 24 && st.combat; i++) {
        if (st.pending) {
            effectAnswer(st, (s, q) => (q.kind === 'choice' ? { choice: 1 } : effectPolicy(s, q)));
            const mono = foeUnits(st).find(u => (FS_RULES.unitOf(st, u) || {}).id === 'монолиты');
            if (mono && mono.routed) break;
            continue;
        }
        const step = st.combat.step;
        if (step === 'damage-attacker' || step === 'damage-defender') {
            const side = step === 'damage-attacker' ? 'attacker' : 'defender';
            const seat = ctx.CombatHooks.of(st.combat).assignSeat(st.combat[side]);
            const result = FS_RULES.apply(st, seat, { type: 'combat', action: 'damage', targets: FS_RULES.damageCandidates(st, side).map(x => x.id) });
            ok(result.ok, 'урон распределён: ' + result.error);
            continue;
        }
        if (step.startsWith('reinforce-')) {
            const s2 = step.slice('reinforce-'.length);
            FS_RULES.apply(st, s2 === 'attacker' ? st.combat.attacker : st.combat.defender,
                { type: 'combat', action: 'reinforce', count: 0 });
            continue;
        }
        if (step.startsWith('choose-')) {
            const s2 = step.slice('choose-'.length);
            if ((st.combat.cards[s2].hand || []).length) {
                FS_RULES.apply(st, s2 === 'attacker' ? st.combat.attacker : st.combat.defender,
                    { type: 'combat', action: 'playCard', index: 0 });
            } else FS_RULES.apply(st, st.combat.attacker, { type: 'combat', action: 'advance' });
            continue;
        }
        FS_RULES.advanceCombatSteps(st);
    }
    const mono = foeUnits(st).find(u => (FS_RULES.unitOf(st, u) || {}).id === 'монолиты');
    eq(!!(mono && mono.routed), true, 'Монолит КЛ 2 деморализован');
    // Огрины и Гвардейцы КЛ 0–1 в эту ветку не попадают: все Воины целы.
    return eq(foeUnits(st).filter(u => u.routed).length, 1, 'деморализован только КЛ 2');
});

// ============================================================================
//  Имперская гвардия: улучшения приказов (docs/forbidden-stars/05-order-upgrades.md)
// ============================================================================
head('Улучшения приказов', IG);

/**
 * The capacity of a place for a unit of the guard: the engine asks for the def
 * of the unit that is being placed (the extra capacity of «Принудительной
 * вербовки» is for the Гвардейцы only).
 */
function capacityAt(st, system, pos, unitId) {
    const faction = FS_CATALOG.faction(IG);
    const def = ((faction && faction.units) || []).find(u => u.id === unitId) || null;
    return FS_RULES.capacity(st, system, pos, def);
}

/** The smallest world of the board: the capacity of a city world is raised there. */
function smallestWorld(st) {
    let best = null;
    for (const sys of st.systems) {
        for (const a of sys.areas) {
            if (!a.world) continue;
            const cap = a.world.capacity || 0;
            if (!best || cap < best.capacity) best = { system: sys.id, pos: a.pos, capacity: cap };
        }
    }
    return best;
}

check('Подготовка боя', 'отряд чужой фракции движок не ставит', () => {
    // Общий страж: пока его не было, проверки одной фракции молча играли
    // отрядами другой, и урона/здоровья у них не было вовсе.
    const st = orderState('deploy', {
        faction: IG, foeFaction: 'некроны', units: { 'гвардейцы': 1 }, materiel: 10,
    });
    let error = null;
    try {
        FS_RULES.addUnit(st, 0, 'воины', st.systems[0].id, worldOf(st, st.systems[0].id));
    } catch (e) { error = e.message; }
    ok(!!error, 'чужая модель поставлена без отказа');
    ok(/нет отряда/.test(error), 'отказ называет причину: ' + error);
    // Контроль: свой отряд ставится тем же вызовом.
    const own = FS_RULES.addUnit(st, 0, 'огрины', st.systems[0].id, worldOf(st, st.systems[0].id));
    return eq(own.unit, 'огрины', 'свой отряд поставлен');
});

// --- Принудительная вербовка --------------------------------------------------
// «При выполнении этого приказа вы можете рассматривать все свои города в
//  активной системе как фабрики, на которых могут производиться только
//  Гвардейцы. Вместимость дружественных миров, содержащих город, увеличена на 2,
//  максимум до 4. Дополнительная вместимость распространяется только на
//  Гвардейцев.»
check('Принудительная вербовка', 'город считается фабрикой и вместимость растёт на 2', () => {
    const probe = FS_RULES.newReadyGame({ seed: 5, players: players(IG, 'некроны') });
    const small = smallestWorld(probe);
    ok(!!small, 'нет мира с малой вместимостью');
    const st = orderState('deploy', {
        faction: IG, foeFaction: 'некроны', system: small.system,
        units: { 'гвардейцы': 1 }, structures: ['city'], pos: small.pos, materiel: 10,
        upgrades: ['Принудительная вербовка'],
    });
    const before = capacityAt(st, small.system, small.pos, 'гвардейцы');
    eq(before, small.capacity, 'вместимость до карты');
    const res = burn(st, 'Принудительная вербовка');
    ok(res.ok, 'карта не сгорела: ' + res.error);
    eq(capacityAt(st, small.system, small.pos, 'гвардейцы'), Math.min(4, before + 2), 'вместимость для Гвардейцев выросла на 2');
    // «Дополнительная вместимость распространяется только на Гвардейцев».
    return eq(capacityAt(st, small.system, small.pos, 'огрины'), before, 'для Огринов вместимость прежняя');
});

check('Принудительная вербовка', 'с города покупаются только Гвардейцы', () => {
    const probe = FS_RULES.newReadyGame({ seed: 5, players: players(IG, 'некроны') });
    const small = smallestWorld(probe);
    const st = orderState('deploy', {
        faction: IG, foeFaction: 'некроны', system: small.system, pos: small.pos,
        structures: ['city'], materiel: 10, upgrades: ['Принудительная вербовка'],
    });
    burn(st, 'Принудительная вербовка');
    const ogryn = FS_RULES.apply(st, 0, { type: 'buyUnit', unit: 'огрины', system: small.system, pos: small.pos });
    eq(ogryn.ok, false, 'Огрин с города не производится');
    const guard = FS_RULES.apply(st, 0, { type: 'buyUnit', unit: 'гвардейцы', system: small.system, pos: small.pos });
    return ok(guard.ok, 'Гвардеец не куплен: ' + guard.error);
});

// --- Маскированная бомбардировка ----------------------------------------------
// «Во время этого орбитального удара получите 1 `any cube`. Вы можете перевернуть
//  1 из своих `morale cube` на `att. cube`.»
check('Маскированная бомбардировка', 'кубик из текста приходит игроку', () => {
    const st = strikeState({ faction: IG, foeFaction: 'некроны', ships: { 'крейсеры': 2 }, foeUnits: { 'воины': 1 }, upgrades: ['Маскированная бомбардировка'] });
    st.order.strikeDice = ['morale', 'att'];
    burn(st, 'Маскированная бомбардировка');
    effectAnswer(st, (s, q) => (q.op === 'flipDie' ? { dice: [] } : effectPolicy(s, q)));
    // «получите 1 `any cube`» — кубик удара появился.
    return eq((st.order.strikeDice || []).length, 3, 'третий кубик удара');
});

check('Маскированная бомбардировка', 'morale-кубик переворачивается в att', () => {
    const st = strikeState({ faction: IG, foeFaction: 'некроны', ships: { 'крейсеры': 2 }, foeUnits: { 'воины': 1 }, upgrades: ['Маскированная бомбардировка'] });
    // Кубики орбитального удара — свои, на приказе.
    st.order.phase = 'strike';
    st.order.strikeDice = ['morale', 'att'];
    const roll = FS_RULES.rollDice;
    // Третий кубик (подарок карты) бросается отдельно: пусть он будет def, чтобы
    // «мор» не мог исчезнуть случайно.
    FS_RULES.rollDice = (s2, n) => (n === 1 ? ['def'] : ['morale', 'att']);
    burn(st, 'Маскированная бомбардировка');
    FS_RULES.rollDice = roll;
    // «получите 1 `any cube`» приходит кубиком удара, его лицо бросается.
    eq((st.order.strikeDice || []).length, 3, 'третий кубик удара');
    // «перевернуть 1 из своих `morale cube` на `att. cube`»: morale не осталось,
    // а att стало на один больше — переворот, а не выбрасывание кубика.
    eq(st.order.strikeDice.filter(d => d === 'morale').length, 0, 'ни одного morale не осталось');
    return eq(st.order.strikeDice.filter(d => d === 'att').length, 2, 'morale стал att');
});

check('Маскированная бомбардировка', 'без morale-кубика переворачивать нечего', () => {
    const st = strikeState({ faction: IG, foeFaction: 'некроны', ships: { 'крейсеры': 2 }, foeUnits: { 'воины': 1 }, upgrades: ['Маскированная бомбардировка'] });
    st.order.phase = 'strike';
    // Кубик из текста ещё не пришёл: в ударе только att-кубики.
    const roll = FS_RULES.rollDice;
    FS_RULES.rollDice = () => ['att'];
    burn(st, 'Маскированная бомбардировка');
    FS_RULES.rollDice = roll;
    return ok(st.log.some(l => /нечего обращать в атаку/.test(l.text || '')), 'движок отметил, что переворачивать нечего');
});

// --- Вирусные бомбы -----------------------------------------------------------
// «Бастионы противника не могут предотвратить этот орбитальный удар. Во время
//  этого орбитального удара здоровье отрядов вашего противника уменьшается до 3.»
check('Вирусные бомбы', 'здоровье отрядов врага становится 3, бастионы не помогают', () => {
    const st = strikeState({ faction: IG, foeFaction: 'некроны', ships: { 'крейсеры': 2 }, foeUnits: { 'монолиты': 1 }, upgrades: ['Вирусные бомбы'] });
    burn(st, 'Вирусные бомбы');
    eq(st.order.enemyHealth, 3, 'предел здоровья удара');
    eq(st.order.ignoreBastion, true, 'бастион удар не отменяет');
    // «Бастион не может предотвратить удар» — это не флажок, а мир, по
    // которому удар РАЗРЕШЁН. Проверяем на бастионе в мире удара.
    const shoots = withCard => {
        const st2 = strikeState({
            faction: IG, foeFaction: 'некроны', ships: { 'крейсеры': 2 },
            foeUnits: { 'монолиты': 1 }, foeStructures: ['bastion'],
            upgrades: withCard ? ['Вирусные бомбы'] : [],
        });
        if (withCard) burn(st2, 'Вирусные бомбы');
        const targets = FS_RULES.orbitalStrikeTargets(st2, 0).filter(t => t.pos === st2.strikeWorld);
        return targets.length;
    };
    eq(shoots(false), 0, 'бастион закрывает мир от удара без карты');
    return eq(shoots(true), 1, 'карта открывает мир под бастионом для удара');
});

check('Вирусные бомбы', 'предел здоровья 3 снимается без карты', () => {
    // Монолит КЛ 2: здоровье 5. Механикус стреляет так же — но без карты
    // предела нет, и трёх попаданий Монолиту не хватает.
    const strike = withCard => {
        const st = strikeState({ faction: IG, foeFaction: 'некроны', ships: { 'крейсеры': 2 }, foeUnits: { 'монолиты': 1 }, foeStructures: [], upgrades: withCard ? ['Вирусные бомбы'] : [] });
        if (withCard) burn(st, 'Вирусные бомбы');
        const roll = FS_RULES.rollDice;
        FS_RULES.rollDice = () => ['att', 'att', 'att'];
        const cmd = { type: 'orbitalStrike', system: st.systems[0].id, pos: st.strikeWorld };
        FS_RULES.apply(st, 0, cmd);
        effectAnswer(st, effectPolicy, 6);
        if (!st.strike) FS_RULES.apply(st, 0, cmd);
        FS_RULES.rollDice = roll;
        for (let i = 0; i < 6 && st.strike && st.strike.left > 0; i++) {
            const victim = st.units.find(u => u.seat === 1 && u.system === st.strike.system && u.area === st.strike.pos);
            if (!victim) break;
            FS_RULES.apply(st, 1, { type: 'strikeDamage', unit: victim.id });
        }
        return foeUnits(st).filter(u => (FS_RULES.unitOf(st, u) || {}).id === 'монолиты').length;
    };
    eq(strike(false), 1, 'без карты Монолит выжил (здоровье 5)');
    return eq(strike(true), 0, 'с картой Монолит уничтожен (здоровье 3)');
});

// --- Адептус Астрономика ------------------------------------------------------
// «При выполнении этого приказа вы можете переместить в этот мир до 6 отрядов,
//  если хотя бы один из этих отрядов — Гвардеец. После выполнения этого приказа
//  можете отступить любым числом Гвардейцев, превышающим вместимость этого мира.»
check('Адептус Астрономика', 'предел перемещения — 6 отрядов и обязательный Гвардеец', () => {
    const st = orderState('advance', {
        faction: IG, foeFaction: 'некроны', units: { 'гвардейцы': 1, 'огрины': 1 }, materiel: 10,
        upgrades: ['Адептус Астрономика'],
    });
    burn(st, 'Адептус Астрономика');
    eq(st.order.moveLimit, 6, 'предел перемещения');
    return eq(st.order.mustInclude, 'Гвардеец', 'обязательный Гвардеец');
});

check('Адептус Астрономика', 'без Гвардейца отряды не двигаются', () => {
    const st = orderState('advance', {
        faction: IG, foeFaction: 'некроны', units: { 'огрины': 2 }, materiel: 10,
        upgrades: ['Адептус Астрономика'],
    });
    burn(st, 'Адептус Астрономика');
    // «переместить в этот мир»: ход наступления — в активную систему, свой мир
    // у отрядов уже есть; берём свободный мир в той же системе.
    const from = st.order.system;
    const sys = st.systems.find(x => x.id === from);
    const home = worldOf(st, from);
    const target = sys.areas.find(a => a.world && a.pos !== home);
    ok(!!target, 'в активной системе есть второй мир');
    const moves = st.units.filter(u => u.seat === 0)
        .map(u => ({ unit: u.id, system: from, pos: target.pos }));
    // The Guardsman stands before the ground step begins: the roads of the
    // step are frozen by the units on the board when the step starts.
    const guard = FS_RULES.addUnit(st, 0, 'гвардейцы', from, home);
    // «Сначала двигаются корабли, затем наземные войска»: отряды идут шагом
    // наземных войск, который начинает сама команда конца шага кораблей.
    ok(FS_RULES.apply(st, 0, { type: 'endAdvance' }).ok, 'начался шаг наземных войск');
    const res = FS_RULES.apply(st, 0, { type: 'moveUnits', moves });
    eq(res.ok, false, 'без Гвардейца движение запрещено');
    ok(/должен быть Гвардеец/i.test(res.error || ''), 'отказ называет требование карты: ' + res.error);
    // Один Гвардеец среди движущихся снимает запрет.
    const passed = FS_RULES.apply(st, 0, {
        type: 'moveUnits',
        moves: moves.concat([{ unit: guard.id, system: from, pos: target.pos }]),
    });
    return ok(passed.ok, 'с Гвардейцем движение прошло: ' + passed.error);
});

check('Адептус Астрономика', 'излишек Гвардейцев отступает сверх вместимости', () => {
    const st = orderState('advance', {
        faction: IG, foeFaction: 'некроны', units: { 'гвардейцы': 1 }, materiel: 10,
        upgrades: ['Адептус Астрономика'],
    });
    burn(st, 'Адептус Астрономика');
    // Поле живёт в «FSOrderFight»: `retreatExcessUnits`.
    return eq(st.order.retreatExcessUnits, 'Гвардейцы', 'приказ помнит отступление излишка');
});

// --- Департаменто муниторум ---------------------------------------------------
// «При выполнении этого приказа вы можете приобрести только 1 улучшение. Затем
//  разыграйте ограниченное Развертывание (развертывание в 1 области),
//  Продвижение (перемещение из 1 области) или Доминирование (сбор активов из
//  1 мира и/или розыгрыш вашего свойства фракции в том же мире).»
check('Департаменто муниторум', 'сыгранная карта сгорает и второй раз не играется', () => {
    // «Один раз за раунд» — это не подпись на карте: движок помечает карту
    // использованной, и второй розыгрыш обязан получить отказ.
    const st = orderState('strategize', {
        faction: IG, foeFaction: 'некроны', materiel: 10,
        upgrades: ['Департаменто муниторум'],
    });
    const first = burn(st, 'Департаменто муниторум');
    ok(first.ok, 'первый розыгрыш не прошёл: ' + first.error);
    eq(st.players[0].upgrades[0].used, true, 'карта сгорела');
    effectAnswer(st, { choice: 0 });
    const second = burn(st, 'Департаменто муниторум');
    eq(second.ok, false, 'второй розыгрыш разрешён');
    return ok(/уже использовано/.test(second.error || ''), 'второй розыгрыш отклонён по своей причине: ' + second.error);
});

check('Департаменто муниторум', 'одно улучшение за приказ', () => {
    const st = orderState('strategize', {
        faction: IG, foeFaction: 'некроны', materiel: 10,
        upgrades: ['Департаменто муниторум'],
    });
    burn(st, 'Департаменто муниторум');
    eq(st.order.upgradeLimit, 1, 'предел улучшений');
    return eq(pending(st) && pending(st).kind, 'choice', 'выбор ограниченного приказа');
});

check('Департаменто муниторум', 'разыгрывается ограниченное развёртывание', () => {
    const st = orderState('strategize', {
        faction: IG, foeFaction: 'некроны', units: { 'гвардейцы': 1 }, materiel: 10,
        upgrades: ['Департаменто муниторум'],
    });
    burn(st, 'Департаменто муниторум');
    const q = pending(st);
    ok(!!q && q.kind === 'choice', 'выбора приказа нет');
    eq((q.options || []).length, 3, 'три вида приказа');
    effectAnswer(st, { choice: 0 });
    eq(st.order.nestedKind, 'deploy', 'выбор запомнен');
    // «Затем разыграйте ограниченное Развертывание» — это не запись выбора, а
    // ВТОРОЙ приказ: стратагема заканчивается, и вместо неё идёт развёртывание
    // в 1 области. Проверка доводит приказ до конца и смотрит на движок.
    const fin = FS_RULES.apply(st, 0, { type: 'finishStrategize' });
    ok(fin.ok, 'стратагема не закончилась: ' + fin.error);
    eq(fin.nested, true, 'приказ не превратился в ограниченный');
    eq([st.order.order, st.order.nested], ['deploy', true], 'идёт ограниченное развёртывание');
    eq([st.order.system, st.order.pos], [st.sys || st.order.system, st.order.pos], 'в активной системе');
    // «развертывание в 1 области»: предел области выставлен самим приказом.
    return eq(DeployScope.of(st.order).areaLimit, 1, 'предел развёртывания — одна область');
});

check('Департаменто муниторум', 'ограниченное продвижение и доминирование тоже начинаются', () => {
    // Три ветки текста, три разных приказа: каждую доводим до движка.
    const play = choice => {
        const st = orderState('strategize', {
            faction: IG, foeFaction: 'некроны', units: { 'гвардейцы': 1 }, materiel: 10,
            upgrades: ['Департаменто муниторум'],
        });
        burn(st, 'Департаменто муниторум');
        effectAnswer(st, (s, q) => (q.kind === 'choice' ? { choice } : firstOption(s, q)));
        const fin = FS_RULES.apply(st, 0, { type: 'finishStrategize' });
        return { st, fin };
    };
    const adv = play(1);
    ok(adv.fin.ok, 'продвижение не началось: ' + adv.fin.error);
    eq([adv.st.order.order, adv.st.order.nested], ['advance', true], 'идёт ограниченное продвижение');
    eq(OrderMove.of(adv.st.order).areaLimit, 1, 'перемещение из одной области');
    const dom = play(2);
    ok(dom.fin.ok, 'доминирование не началось: ' + dom.fin.error);
    return eq([dom.st.order.order, dom.st.order.nested], ['dominate', true], 'идёт ограниченное доминирование');
});

head('Боевая колода', IG);

// --- Ратлинг стрелок ---------------------------------------------------------
// «В начале шага нанесения повреждений ваш противник теряет 2 `att. token`.»
// «*Гвардеец/Крейсер:* ваш противник должен выбрать и деморализовать 1 свой
//  отряд. Он может избежать этого, если потратит 1 `any cube`.»
check('Ратлинг стрелок', 'к началу шага повреждений противник теряет 2 att-жетона', () => {
    const st = guardBattle({ units: { 'гвардейцы': 2 }, foeUnits: { 'воины': 2 }, card: 'Ратлинг стрелок', foeCard: 'Свежеватели', dice: ['att'], foeDice: ['att', 'att'] });
    const c = st.combat;
    c.tokens.defender = { att: 2, def: 0, morale: 0 };
    // Hold at the defender's real card question: play() otherwise continues
    // automatically through both cards and into the damage step.
    play(st, 0, 0, (s, q) => (q.op === 'avoid' ? { dice: [] } : null));
    eq([st.pending && st.pending.seat, st.combat.step], [1, 'effect'], 'защитник ещё решает способность');
    eq(c.tokens.defender.att, 2, 'при вскрытии карты жетоны ещё на месте');
    toDamageStep(st, (s, q) => q.kind === 'ability' ? { no: true } : null);
    return eq(c.tokens.defender.att, 0, 'в начале шага повреждений жетоны потеряны');
});

check('Ратлинг стрелок', 'Гвардеец заставляет врага деморализовать отряд или потратить кубик', () => {
    const free = guardBattle({ units: { 'гвардейцы': 2 }, foeUnits: { 'воины': 2 }, card: 'Ратлинг стрелок', dice: ['att'], foeDice: ['att'] });
    let asked = null;
    play(free, 0, 0, (s, q) => { if (q.op === 'avoid') { asked = q; return {}; } return null; });
    // Вопрос о том, кого деморализовать, задан противнику: его ответы идут
    // отдельно, владельцу карты они не принадлежат.
    answerAll(free, null, undefined);
    ok(!!asked, 'вопрос о плате не задан');
    eq(asked.who, 1, 'платит противник');
    eq(foeUnits(free).filter(u => u.routed).length, 1, 'отряд противника деморализован');
    // «Он может избежать этого, если потратит 1 `any cube`»: заплатил — отряд цел.
    const paid = guardBattle({ units: { 'гвардейцы': 2 }, foeUnits: { 'воины': 2 }, card: 'Ратлинг стрелок', dice: ['att'], foeDice: ['att'] });
    play(paid, 0, 0, (s, q) => (q.op === 'avoid' ? { dice: [(q.options || [])[0]] } : null));
    eq(foeUnits(paid).filter(u => u.routed).length, 0, 'заплативший противник сохранил отряд');
    return eq(count(paid, 'defender', 'att'), 0, 'потраченный кубик ушёл со стола');
});

check('Ратлинг стрелок', 'способность единицы не срабатывает без Гвардейца или Крейсера в бою', () => {
    const st = guardBattle({ units: { 'огрины': 1 }, foeUnits: { 'воины': 2 }, card: 'Ратлинг стрелок', dice: ['att'], foeDice: ['att'] });
    play(st, 0, 0, null);
    return eq(foeUnits(st).filter(u => u.routed).length, 0, 'огрин не даёт способности');
});

// --- Железная дисциплина -----------------------------------------------------
// «Получите 1 `any cube` за каждый ваш недеморализованный отряд с разным
//  командным уровнем.» «*Гвардеец/Крейсер:* восстановите 1 свой
//  деморализованный отряд.»
check('Железная дисциплина', 'кубик за каждый разный командный уровень, а не за отряд', () => {
    const st = guardBattle({ units: { 'гвардейцы': 2, 'огрины': 1 }, foeUnits: { 'воины': 2 }, card: 'Железная дисциплина', dice: ['def'], foeDice: ['att'] });
    const before = dice(st, 'attacker').length;
    play(st, 0, 0, null);
    // Два уровня (Гвардейцы КЛ 0 и Огрины КЛ 1) — два кубика, хотя отрядов три.
    return eq(dice(st, 'attacker').length, before + 2, 'два кубика за два уровня');
});

check('Железная дисциплина', 'один командный уровень даёт один кубик', () => {
    const st = guardBattle({ units: { 'гвардейцы': 3 }, foeUnits: { 'воины': 2 }, card: 'Железная дисциплина', dice: ['def'], foeDice: ['att'] });
    const before = dice(st, 'attacker').length;
    play(st, 0, 0, null);
    return eq(dice(st, 'attacker').length, before + 1, 'три Гвардейца одного уровня — один кубик');
});

check('Железная дисциплина', 'жетон даёт КЛ 0 только один раз и только пока стоит', () => withFixedDice(['att'], () => {
    for (const guard of [0, 1]) for (const space of [false, true])
        for (const status of ['standing', 'routed', 'destroyed']) for (const baseRouted of [false, true]) {
        let st = guardTokenBattle(guard, space);
        const side = guard === 0 ? 'attacker' : 'defender', base = space ? 'крейсеры' : 'гвардейцы';
        st.units.find(u => u.seat === guard && u.unit === base).routed = baseRouted;
        setTokenStatus(st, side, status);
        CombatTurn.of(st.combat).setDice(side, []);
        const steps = FS_EFFECTS.parse(guardCard('Железная дисциплина').general, { kind: 'combat', faction: IG });
        st = JSON.parse(JSON.stringify(st));
        FS_RULES.runEffects(st, guard, steps, { kind: 'combat', ctx: { side } });
        const levels = 1 + Number(!baseRouted || status === 'standing'); // the high KL is represented twice, but counts once
        eq(dice(st, side).length, levels, 'считаются только разные недеморализованные КЛ в бою');
    }
}));
check('Железная дисциплина', 'Гвардеец восстанавливает свой деморализованный отряд', () => {
    const st = guardBattle({ units: { 'гвардейцы': 2, 'огрины': 1 }, foeUnits: { 'воины': 2 }, card: 'Железная дисциплина', dice: ['def'], foeDice: ['att'] });
    routeMine(st, 0);
    eq(myUnits(st).filter(u => u.routed).length, 1, 'один свой отряд деморализован');
    play(st, 0, 0, null);
    return eq(myUnits(st).filter(u => u.routed).length, 0, 'отряд восстановлен');
});

// --- Ложись! -----------------------------------------------------------------
// «Получите 1 `any cube`.» «*Гвардеец/Крейсер:* получите 1 `def. token` за
//  каждого недеморализованного Гвардейца или Крейсера, максимум 3.»
check('Ложись!', 'кубик и def-жетоны за Гвардейцев с пределом 3', () => {
    const st = guardBattle({ units: { 'гвардейцы': 4, 'огрины': 1 }, foeUnits: { 'воины': 2 }, card: 'Ложись!', dice: ['att'], foeDice: ['att'] });
    const before = dice(st, 'attacker').length;
    play(st, 0, 0, null);
    eq(dice(st, 'attacker').length, before + 1, 'один любой кубик');
    // Гвардейцев четыре, но «максимум 3»; огрин в список не входит.
    return eq(tokens(st, 'attacker').def, 3, 'три жетона защиты, не больше');
});

check('Ложись!', 'фильтр по имени учитывает только живые местные подкрепления и действует до предела', () => {
    for (const guard of [0, 1]) for (const space of [false, true])
        for (const status of ['standing', 'routed', 'destroyed']) for (const models of [0, 1, 2, 3]) {
        let st = guardTokenBattle(guard, space);
        const side = guard === 0 ? 'attacker' : 'defender', base = space ? 'крейсеры' : 'гвардейцы';
        const field = st.combat;
        // The fixture starts with one matching model; build up to three, or route it.
        const first = st.units.find(u => u.seat === guard && u.unit === base);
        if (!models) first.routed = true;
        for (let i = 1; i < models; i++) FS_RULES.addUnit(st, guard, base, field.system, field.pos);
        setTokenStatus(st, side, status);
        const remote = st.systems.find(sys => sys.id !== field.system && sys.areas.some(a => !!a.world !== space));
        FS_RULES.addUnit(st, guard, base, remote.id, remote.areas.find(a => !!a.world !== space).pos);
        const step = FS_EFFECTS.parse(guardCard('Ложись!').unit, { kind: 'combat', faction: IG })[0];
        st = JSON.parse(JSON.stringify(st));
        FS_RULES.runEffects(st, guard, [step], { kind: 'combat', ctx: { side } });
        eq(tokens(st, side).def, Math.min(3, models + Number(status === 'standing')), 'только названные стоящие модели и жетоны в бою, максимум три');
    }
});
check('Ложись!', 'деморализованный Гвардеец жетона не приносит', () => {
    const st = guardBattle({ units: { 'гвардейцы': 2 }, foeUnits: { 'воины': 2 }, card: 'Ложись!', dice: ['att'], foeDice: ['att'] });
    routeMine(st, 0);
    play(st, 0, 0, null);
    return eq(tokens(st, 'attacker').def, 1, 'один недеморализованный Гвардеец — один жетон');
});

// --- За Императора! ----------------------------------------------------------
// «Перебросьте 1 `any cube`.» «*Гвардеец/Крейсер:* получите 1 `att. token` за
//  каждого недеморализованного Гвардейца или Крейсера, максимум 3.»
check('За Императора!', 'переброс кубика и att-жетоны с пределом 3', () => {
    const st = guardBattle({ units: { 'гвардейцы': 4 }, foeUnits: { 'воины': 2 }, card: 'За Императора!', dice: ['att', 'def'], foeDice: ['att'] });
    let reroll = null;
    let chosen = null;
    // Переброс — не только вопрос: кубик обязан СМЕНИТЬСЯ. Иначе «Перебросьте
    // 1 `any cube`» не исполняется, а вопрос задан.
    const roll = FS_RULES.rollDice;
    FS_RULES.rollDice = () => ['morale'];
    play(st, 0, 0, (s, q) => { if (q.kind === 'dice') { reroll = q; chosen = (q.options || [])[0]; return { dice: [chosen] }; } return null; });
    FS_RULES.rollDice = roll;
    ok(!!reroll, 'вопрос о перебросе не задан');
    eq(reroll.n, 1, 'перебрасывается один кубик');
    eq(dice(st, 'attacker')[chosen], 'morale', 'выбранный кубик переброшен');
    return eq(tokens(st, 'attacker').att, 3, 'три жетона атаки, не больше');
});

// --- Огневая поддержка -------------------------------------------------------
// «В этом раунде боя, в начале шага нанесения повреждений, ваш противник
//  теряет 2 `def. token`.» «*Гвардеец/Крейсер:* перебросьте 1 `def. cube`.»
check('Огневая поддержка', '2 def-жетона противник теряет в начале шага повреждений', () => {
    const st = guardBattle({ units: { 'гвардейцы': 2 }, foeUnits: { 'воины': 2 }, card: 'Огневая поддержка', foeCard: 'Свежеватели', dice: ['def'], foeDice: ['att'] });
    st.combat.tokens.defender = { att: 0, def: 2, morale: 0 };
    play(st, 0, 0, null);
    eq([st.pending && st.pending.seat, st.combat.step], [1, 'effect'], 'защитник ещё решает способность');
    eq(st.combat.tokens.defender.def, 2, 'при вскрытии карты жетоны на месте');
    toDamageStep(st, (s, q) => q.kind === 'ability' ? { no: true } : null);
    return eq(st.combat.tokens.defender.def, 0, 'в начале шага повреждений жетоны потеряны');
});

check('Огневая поддержка', 'Гвардеец перебрасывает def-кубик', () => {
    const st = guardBattle({ units: { 'гвардейцы': 2 }, foeUnits: { 'воины': 2 }, card: 'Огневая поддержка', dice: ['def', 'att'], foeDice: ['att'] });
    let reroll = null;
    play(st, 0, 0, (s, q) => { if (q.kind === 'dice') reroll = q; return null; });
    ok(!!reroll, 'вопрос о перебросе не задан');
    eq(reroll.kind2, 'def', 'перебрасывается кубик защиты');
    // Переброс обязан менять грань: вопрос без нового броска — не переброс.
    const again = guardBattle({ units: { 'гвардейцы': 2 }, foeUnits: { 'воины': 2 }, card: 'Огневая поддержка', dice: ['def', 'att'], foeDice: ['att'] });
    const roll = FS_RULES.rollDice;
    FS_RULES.rollDice = () => ['morale'];
    let at = null;
    play(again, 0, 0, (s, q) => {
        if (q.kind === 'dice') { at = (q.options || [])[0]; return { dice: [at] }; }
        return null;
    });
    FS_RULES.rollDice = roll;
    ok(at !== null, 'вопрос о перебросе не задан');
    return eq(dice(again, 'attacker')[at], 'morale', 'кубик лёг новой гранью');
});

// --- Подавляющий огонь виверн ------------------------------------------------
// «Если у вас больше недеморализованных отрядов с командным уровнем 0, чем у
//  противника, ваш противник выбирает и деморализует 1 свой отряд.»
// «*Леман Русс/Линкор:* ваш противник выбирает и уничтожает 1 свой
//  деморализованный отряд с командным уровнем 0 или 1.»
check('Подавляющий огонь виверн', 'при перевесе отрядов КЛ 0 враг деморализует отряд', () => {
    const more = guardBattle({ units: { 'гвардейцы': 3 }, foeUnits: { 'воины': 2 }, card: 'Подавляющий огонь виверн', dice: ['att'], foeDice: ['att'] });
    play(more, 0, 0, null);
    eq(foeUnits(more).filter(u => u.routed).length, 1, 'враг деморализован');
    // Перевеса нет — нет и деморализации.
    const less = guardBattle({ units: { 'гвардейцы': 1 }, foeUnits: { 'воины': 3 }, card: 'Подавляющий огонь виверн', dice: ['att'], foeDice: ['att'] });
    play(less, 0, 0, null);
    return eq(foeUnits(less).filter(u => u.routed).length, 0, 'без перевеса отрядов КЛ 0 ничего');
});

check('Подавляющий огонь виверн', 'перевес КЛ 0 и всех отрядов учитывает только стоящие модели и жетоны', () => {
    for (const guard of [0, 1]) for (const space of [false, true])
        for (const ownToken of ['standing', 'routed', 'destroyed']) for (const foeToken of ['standing', 'routed', 'destroyed'])
        for (const ownBaseRouted of [false, true]) for (const foeBaseRouted of [false, true]) for (const highRouted of [false, true]) {
        const foe = 1 - guard, side = guard === 0 ? 'attacker' : 'defender', foeSide = foe === 0 ? 'attacker' : 'defender';
        let st = guardTokenBattle(guard, space);
        setTokenStatus(st, side, ownToken); setTokenStatus(st, foeSide, foeToken);
        const mine = st.units.filter(u => u.seat === guard), theirs = st.units.filter(u => u.seat === foe);
        mine.find(u => (FS_RULES.unitOf(st, u).kl || 0) === 0).routed = ownBaseRouted;
        theirs.find(u => (FS_RULES.unitOf(st, u).kl || 0) === 0).routed = foeBaseRouted;
        for (const u of mine.filter(u => FS_RULES.unitOf(st, u).kl > 0)) u.routed = highRouted;
        for (const u of theirs.filter(u => FS_RULES.unitOf(st, u).kl > 0)) u.routed = !highRouted;
        st = JSON.parse(JSON.stringify(st));
        const model0 = Number(!ownBaseRouted) + Number(ownToken === 'standing');
        const foe0 = Number(!foeBaseRouted) + Number(foeToken === 'standing');
        const klStep = FS_EFFECTS.parse(guardCard('Подавляющий огонь виверн').general, { kind: 'combat', faction: IG })[0];
        const allStep = FS_EFFECTS.parse(guardCard('Часовой разведчик').general, { kind: 'combat', faction: IG })[0];
        eq(FS_EFFECTS.condSatisfied(FS_RULES, st, guard, klStep, { kind: 'combat' }), model0 > foe0,
            'перевес КЛ 0 без отрядов старшего уровня');
        eq(FS_EFFECTS.condSatisfied(FS_RULES, st, guard, allStep, { kind: 'combat' }),
            model0 + (highRouted ? 0 : 2) > foe0 + (highRouted ? 1 : 0), 'перевес всех недеморализованных');
    }
});
check('Подавляющий огонь виверн', 'Леман Русс уничтожает деморализованный отряд КЛ 0–1', () => {
    const st = guardBattle({ units: { 'танки-леман-русс': 1 }, foeUnits: { 'воины': 2, 'огрины': 1 }, card: 'Подавляющий огонь виверн', dice: ['att'], foeDice: ['att'] });
    // Деморализован Гвардеец? Нет: у врага Гвардейцев нет — берём отряд КЛ 0.
    routeFoe(st, 0);
    const before = foeUnits(st).length;
    play(st, 0, 0, (s, q) => (q.kind === 'units' ? { units: (q.options || []).slice(0, 1) } : null));
    eq(foeUnits(st).length, before - 1, 'один деморализованный отряд уничтожен');
    // Огрин (КЛ 1) в списке выбора тоже есть, Монолит (КЛ 2) — нет.
    const st2 = guardBattle({ units: { 'танки-леман-русс': 1 }, foeUnits: { 'воины': 2, 'монолиты': 1 }, card: 'Подавляющий огонь виверн', dice: ['att'], foeDice: ['att'] });
    routeFoe(st2, 0);
    routeFoe(st2, 1);
    let seen = null;
    play(st2, 0, 0, (s, q) => { if (q.kind === 'units') { seen = q.options || []; return { units: seen.slice(0, 1) }; } return null; });
    ok(!!seen, 'вопроса о цели нет');
    return eq(seen.length, 2, 'предложены воины и монолит? нет — только деморализованные 0–1');
});

// --- Поддержка титана --------------------------------------------------------
// «Ваш противник обязан перебросить 1 `att. cube` за каждый ваш
//  недеморализованный отряд с разным командным уровнем.»
// «*Титан «Гончая»/Линкор:* во время шага нанесения урона ваши отряды с
//  командным уровнем 2 или ниже не могут быть деморализованы.»
check('Поддержка титана', 'враг перебрасывает кубики за каждый разный уровень', () => {
    const st = guardBattle({ units: { 'титаны': 1, 'гвардейцы': 2 }, foeUnits: { 'воины': 2 }, card: 'Поддержка титана', dice: ['att'], foeDice: ['att', 'att', 'def'] });
    let q = null;
    play(st, 0, 0, (s, ask) => { if (ask.kind === 'dice') q = ask; return null; });
    ok(!!q, 'вопрос о перебросе не задан');
    // Титаны КЛ 3 и Гвардейцы КЛ 0 — два разных уровня.
    eq(q.n, 2, 'два кубика за два уровня');
    return eq(q.who, 1, 'перебрасывает противник');
});

check('Поддержка титана', 'противник обязан выбрать все доступные кубики за разные уровни, включая подкрепление', () => {
    for (const guard of [0, 1]) for (const space of [false, true])
        for (const status of ['standing', 'routed', 'destroyed']) for (const baseRouted of [false, true])
        for (const attacks of [1, 2, 3]) {
        let st = guardTokenBattle(guard, space);
        const side = guard === 0 ? 'attacker' : 'defender', foeSide = guard === 0 ? 'defender' : 'attacker';
        const base = space ? 'крейсеры' : 'гвардейцы';
        st.units.find(u => u.seat === guard && u.unit === base).routed = baseRouted;
        setTokenStatus(st, side, status);
        CombatTurn.of(st.combat).setDice(foeSide, ['def', ...Array(attacks).fill('att')]);
        const steps = FS_EFFECTS.parse(guardCard('Поддержка титана').general, { kind: 'combat', faction: IG });
        st = JSON.parse(JSON.stringify(st));
        FS_RULES.runEffects(st, guard, steps, { kind: 'combat', ctx: { side } });
        const q = pending(st), n = Math.min(attacks, 1 + Number(!baseRouted || status === 'standing'));
        eq([q?.op, q?.who, q?.n], ['rerollDie', 1 - guard, n], 'число разных КЛ ограничено доступными атаками');
        eq(q.required, true, 'переброс после обязательной способности нельзя сократить');
        const invalid = [[], [0], Array(n).fill(q.options[0]), '1'];
        if (n > 1) invalid.push(q.options.slice(0, n - 1));
        for (const selection of invalid) {
            // The repeated-index case is only invalid for two or more dice.
            if (Array.isArray(selection) && selection.length === 1 && selection[0] === q.options[0] && n === 1) continue;
            const before = JSON.stringify(st);
            eq(FS_RULES.apply(st, 1 - guard, { type: 'effect', answer: { dice: selection } }).ok, false, 'пустой, частичный, чужой или повторённый выбор отклонён');
            eq(JSON.stringify(st), before, 'неверный выбор ничего не изменил');
        }
        eq(FS_RULES.apply(st, guard, { type: 'effect', answer: { dice: q.options.slice(0, n) } }).ok, false, 'владелец карты не отвечает за противника');
        st = JSON.parse(JSON.stringify(st));
        withFixedDice(['morale'], () => ok(FS_RULES.apply(st, 1 - guard, { type: 'effect', answer: { dice: q.options.slice(0, n) } }).ok, 'полный переброс после JSON'));
        eq(dice(st, foeSide).filter(d => d === 'morale').length, n, 'переброшено ровно столько кубиков');
        eq(dice(st, foeSide)[0], 'def', 'неподходящий кубик не затронут');
    }
});
check('Поддержка титана', 'свои отряды КЛ 2 и ниже не деморализуются, титан — может', () => {
    const st = guardBattle({ units: { 'титаны': 1, 'гвардейцы': 1, 'огрины': 1 }, foeUnits: { 'воины': 2 }, card: 'Поддержка титана', dice: ['att'], foeDice: ['att'] });
    play(st, 0, 0, null);
    const rules = CombatDamage.of(st.combat);
    eq(rules.forbidsRoute(0, 0, 1), true, 'Гвардеец КЛ 0 не деморализуется');
    eq(rules.forbidsRoute(0, 2, 1), true, 'КЛ 2 тоже');
    return eq(rules.forbidsRoute(0, 3, 1), false, 'титан КЛ 3 — может');
});

// --- Часовой разведчик -------------------------------------------------------
// «Если у вас больше недеморализованных отрядов, чем у противника, ваш
//  противник выбирает и деморализует 1 свой отряд; он может избежать этого,
//  если потратит 1 `morale cube`.»
// «*Огрин/Крейсер:* если вы атакуете, посмотрите выложенную лицом вниз боевую
//  карту противника. Получите 2 `att. cube` или 2 `def. cube`.»
check('Часовой разведчик', 'при перевесе отрядов враг деморализует отряд за morale cube', () => {
    const st = guardBattle({ units: { 'гвардейцы': 2, 'огрины': 1 }, foeUnits: { 'воины': 2 }, card: 'Часовой разведчик', dice: ['att'], foeDice: ['att', 'morale'] });
    let avoid = null;
    play(st, 0, 0, (s, q) => { if (q.op === 'avoid') { avoid = q; return {}; } return null; });
    answerAll(st, null, undefined);
    ok(!!avoid, 'вопроса о плате нет');
    eq(avoid.kind2, 'morale', 'плата — кубик морали');
    eq(foeUnits(st).filter(u => u.routed).length, 1, 'враг деморализован');
    // Условие карты — перевес в отрядах: при перевесе противника деморализации
    // не предлагается вовсе.
    const weaker = guardBattle({ units: { 'гвардейцы': 1 }, foeUnits: { 'воины': 2 }, card: 'Часовой разведчик', dice: ['att'], foeDice: ['att', 'morale'] });
    let offered = false;
    play(weaker, 0, 0, (s, q) => { if (q.op === 'avoid') offered = true; return null; });
    answerAll(weaker, null, undefined);
    return eq(offered, false, 'при перевесе противника карта молчит');
});

check('Часовой разведчик', 'Огрин атакующего получает 2 кубика на выбор', () => {
    const st = guardBattle({ units: { 'гвардейцы': 2, 'огрины': 1 }, foeUnits: { 'воины': 2 }, card: 'Часовой разведчик', dice: ['att'], foeDice: ['def'] });
    const before = dice(st, 'attacker').length;
    let choice = null;
    play(st, 0, 0, (s, q) => { if (q.kind === 'choice') { choice = q; return { choice: 0 }; } return null; });
    ok(!!choice, 'выбора кубиков нет');
    eq((choice.options || []).length, 2, 'атака или защита');
    return eq(dice(st, 'attacker').length, before + 2, 'два кубика получены');
});

check('Часовой разведчик', 'защитник второго предложения не получает', () => {
    const st = guardBattle({ units: { 'гвардейцы': 2, 'огрины': 1 }, foeUnits: { 'воины': 2 }, card: 'Часовой разведчик', dice: ['att'], foeDice: ['def'] });
    // Атакующий — некроны: защитник ИГ эту карту не получает.
    const text = guardCard('Часовой разведчик').unit.split(':').slice(1).join(':').trim();
    const steps = FS_EFFECTS.parse(text, { kind: 'combat', faction: IG });
    const give = steps.filter(s => s.op === 'choice');
    eq(give.length, 1, 'выбор кубиков в разборе есть');
    eq(give[0].cond && give[0].cond.side, 'attack', 'и он под условием «если вы атакуете»');
    // В бою, где ИГ защищается, условие не выполнено — кубиков нет.
    const def = guardBattle({ units: { 'огрины': 1 }, foeUnits: { 'воины': 2 }, card: 'Ложись!', dice: ['att'], foeDice: ['def'] });
    const before = dice(def, 'defender').length;
    FS_RULES.runEffects(def, 1, steps, { kind: 'combat', ctx: { side: 'defender' } });
    return eq(dice(def, 'defender').length, before, 'защитнику кубики не достались');
});

// --- Огринские ударные войска -------------------------------------------------
// «Вы обязаны перебросить 2 `def. cube` и/или `morale cube`.»
// «*Огрин/Крейсер:* получите 1 `def. token` за каждого недеморализованного
//  Гвардейца или Крейсера, максимум 3.»
check('Огринские ударные войска', 'обязательный переброс берёт только def и morale', () => {
    const st = guardBattle({ units: { 'гвардейцы': 2, 'огрины': 1 }, foeUnits: { 'воины': 2 }, card: 'Огринские ударные войска', dice: ['def', 'att', 'morale'], foeDice: ['att'] });
    let q = null;
    play(st, 0, 0, (s, question) => { if (question.op === 'rerollDie') { q = question; return { dice: question.options.slice(0, question.n) }; } return null; });
    ok(!!q, 'вопроса о перебросе нет');
    eq(q.n, 2, 'перебросить нужно два кубика');
    // att-кубик в переброс не попадает: «2 `def. cube` и/или `morale cube`».
    return eq(q.options, [0, 2], 'на выбор только def и morale');
});

check('Огринские ударные войска', '1 def-жетон за Гвардейца или Крейсера, максимум 3', () => {
    const st = guardBattle({ units: { 'гвардейцы': 4, 'огрины': 1 }, foeUnits: { 'воины': 2 }, card: 'Огринские ударные войска', dice: ['def', 'def'], foeDice: ['att'] });
    play(st, 0, 0, null);
    // Четыре Гвардейца — три жетона: предел карты.
    return eq(tokens(st, 'attacker').def, 3, 'def-жетоны с пределом 3');
});

check('Огринские ударные войска', 'без Огрина способности нет', () => {
    const st = guardBattle({ units: { 'гвардейцы': 2 }, foeUnits: { 'воины': 2 }, card: 'Огринские ударные войска', dice: ['def', 'def'], foeDice: ['att'] });
    play(st, 0, 0, null);
    return eq(tokens(st, 'attacker').def, 0, 'Огрин обязателен для способности');
});

// --- Быкогрин здоровья --------------------------------------------------------
// «Вы обязаны перебросить 2 `att. cube` или `morale cube`.»
// «*Огрин/Крейсер:* получите 1 `att. token` за каждого недеморализованного
//  Гвардейца или Крейсера, максимум 3.»
check('Быкогрин здоровья', 'обязательный переброс берёт только att и morale', () => {
    const st = guardBattle({ units: { 'гвардейцы': 2, 'огрины': 1 }, foeUnits: { 'воины': 2 }, card: 'Быкогрин здоровья', dice: ['att', 'def', 'morale'], foeDice: ['att'] });
    let q = null;
    play(st, 0, 0, (s, question) => { if (question.op === 'rerollDie') { q = question; return { dice: question.options.slice(0, question.n) }; } return null; });
    ok(!!q, 'вопроса о перебросе нет');
    eq(q.n, 2, 'перебросить нужно два кубика');
    return eq(q.options, [0, 2], 'на выбор только att и morale');
});

check('Быкогрин здоровья', 'жетоны атаки за Гвардейцев даёт только Огрин', () => {
    const withOgryn = guardBattle({ units: { 'гвардейцы': 3, 'огрины': 1 }, foeUnits: { 'воины': 2 }, card: 'Быкогрин здоровья', dice: ['att', 'att'], foeDice: ['att'] });
    play(withOgryn, 0, 0, null);
    eq(tokens(withOgryn, 'attacker').att, 3, 'три Гвардейца — три жетона');
    const without = guardBattle({ units: { 'гвардейцы': 3 }, foeUnits: { 'воины': 2 }, card: 'Быкогрин здоровья', dice: ['att', 'att'], foeDice: ['att'] });
    play(without, 0, 0, null);
    return eq(tokens(without, 'attacker').att, 0, 'без Огрина жетонов нет');
});

// Both mandatory Ogryn cards must reroll as many eligible dice as possible,
// including the single-die shortage and the zero-eligible case. An opponent or
// a forged partial answer cannot turn «must» into an optional ability.
for (const [name, eligible, other] of [
    ['Огринские ударные войска', 'def', 'att'],
    ['Быкогрин здоровья', 'att', 'def'],
]) check(name, 'обязательный переброс при нехватке кубиков, отказах и поддельных ответах', () => {
    for (const guard of [0, 1]) for (const space of [false, true]) for (const available of [0, 1, 2, 3]) {
        const side = guard === 0 ? 'attacker' : 'defender';
        let st = guardTokenBattle(guard, space);
        CombatTurn.of(st.combat).setDice(side, [other, ...Array.from({ length: available }, (_, i) => i % 2 ? 'morale' : eligible)]);
        const steps = FS_EFFECTS.parse(guardCard(name).general, { kind: 'combat', faction: IG });
        FS_RULES.runEffects(st, guard, steps, { kind: 'combat', optional: true, ctx: { side } });
        if (!available) {
            eq(st.pending, null, 'без подходящих кубиков нет неразрешимого вопроса');
            eq(dice(st, side), [other], 'неподходящий кубик не переброшен');
            continue;
        }
        const q = pending(st), want = Math.min(2, available);
        eq([q?.op, q?.n, q?.required, st.pending?.answerSeat], ['rerollDie', want, true, guard], 'переброс обязателен и ограничен доступным');
        eq(q.options, Array.from({ length: available }, (_, i) => i + 1), 'предложены только подходящие грани');
        const invalid = [{ no: true }, { dice: [] }, { dice: [0] }, { dice: [q.options[0], q.options[0]] },
            { dice: [999] }, { dice: '1' }, { dice: q.options.slice(0, 2).concat(999) }];
        if (want > 1) invalid.push({ dice: [q.options[0]] });
        for (const answer of invalid) {
            const before = JSON.stringify(st);
            eq(FS_RULES.apply(st, guard, { type: 'effect', answer }).ok, false, 'нельзя отказаться, указать мало, много или чужие кубики');
            eq(JSON.stringify(st), before, 'неверный ответ не меняет состояние');
        }
        const chosen = q.options.slice(0, want);
        eq(FS_RULES.apply(st, 1 - guard, { type: 'effect', answer: { dice: chosen } }).ok, false, 'за владельца не может отвечать противник');
        st = JSON.parse(JSON.stringify(st));
        withFixedDice([other], () => ok(FS_RULES.apply(st, guard, { type: 'effect', answer: { dice: chosen } }).ok, 'точный переброс после JSON'));
        eq(dice(st, side).filter(d => d === other).length, want + 1, 'переброшены именно выбранные кубики');
        eq(st.pending, null, 'способность завершена');
    }
});

// Exercise the same shortages through actual face-down choices and reveal,
// not just by invoking the parsed effect on a prepared combat.
for (const [name, eligible, other] of [
    ['Огринские ударные войска', 'def', 'att'],
    ['Быкогрин здоровья', 'att', 'def'],
]) check(name, 'настоящее вскрытие: обязательный переброс обеих сторон при 0–3 подходящих кубиках', () => withFixedDice([other], () => {
    for (const guard of [0, 1]) for (const space of [false, true]) for (const available of [0, 1, 2, 3]) {
        let st = guardTokenBattle(guard, space);
        const side = guard === 0 ? 'attacker' : 'defender', foeSide = guard === 0 ? 'defender' : 'attacker';
        st.combat.cards[side].hand = [name, 'Ложись!'];
        st.combat.cards[foeSide].hand = ['Воин фланги', 'Воин фланги'];
        CombatTurn.of(st.combat).setDice(side, [other, ...Array.from({ length: available }, (_, i) => i % 2 ? 'morale' : eligible)]);
        ok(FS_RULES.apply(st, 0, { type: 'combat', action: 'playCard', index: 0 }).ok, 'атакующий положил карту');
        ok(FS_RULES.apply(st, 1, { type: 'combat', action: 'playCard', index: 0 }).ok, 'защитник положил карту, карты вскрыты');
        for (let i = 0; i < 12 && st.pending && pending(st).op !== 'rerollDie'; i++) {
            const q = pending(st), owner = st.pending.answerSeat ?? st.pending.seat;
            ok(FS_RULES.apply(st, owner, { type: 'effect', answer: q.kind === 'ability' ? { no: true } : firstOption(st, q) }).ok,
                'предыдущее предложение разрешено');
        }
        ok(CombatCards.of(st.combat).has(side, name), 'реальная карта на столе');
        if (!available) {
            ok(!st.pending || pending(st).op !== 'rerollDie', 'без подходящих кубиков вопрос переброса не задан');
            continue;
        }
        const q = pending(st), want = Math.min(2, available);
        eq([q?.op, q?.n, q?.required, st.pending.answerSeat], ['rerollDie', want, true, guard], 'обязательный вопрос нужной стороне');
        eq(q.options, Array.from({ length: available }, (_, i) => i + 1), 'только подходящие грани');
        const snapshot = JSON.stringify(st);
        for (const answer of [{ no: true }, { dice: [] }, { dice: [0] }, { dice: [q.options[0], q.options[0]] }]) {
            eq(FS_RULES.apply(st, guard, { type: 'effect', answer }).ok, false, 'неполный или поддельный ответ отклонён');
            eq(JSON.stringify(st), snapshot, 'неверный ответ не меняет состояние');
        }
        eq(FS_RULES.apply(st, 1 - guard, { type: 'effect', answer: { dice: q.options.slice(0, want) } }).ok, false, 'чужое место не отвечает');
        st = JSON.parse(snapshot);
        ok(FS_RULES.apply(st, guard, { type: 'effect', answer: { dice: q.options.slice(0, want) } }).ok, 'переброс после JSON');
        eq(dice(st, side).filter(d => d === other).length, want + 1, 'ровно выбранные кубики переброшены');
    }
}));

// --- Механизированная боевая группа -------------------------------------------
// «В этом раунде боя, в начале шага нанесения повреждений, ваш противник теряет
//  3 `att. token` или 3 `def. cube` за каждую пару недеморализованных Гвардейцев
//  и Огринов либо Крейсеров и Линкоров.»
check('Механизированная боевая группа', '3 att-жетона за каждую пару Гвардеец–Огрин', () => {
    const st = guardBattle({ units: { 'гвардейцы': 4, 'огрины': 2 }, foeUnits: { 'воины': 2 }, card: 'Механизированная боевая группа', foeCard: 'Свежеватели', dice: ['att'], foeDice: ['att', 'att', 'att', 'att', 'att', 'att', 'att'] });
    st.combat.tokens.defender = { att: 9, def: 0, morale: 0 };
    play(st, 0, 0, null);
    eq([st.pending && st.pending.seat, st.combat.step], [1, 'effect'], 'защитник ещё решает способность');
    // «В начале шага»: к вскрытию карты жетоны ещё на месте.
    eq(tokens(st, 'defender').att, 9, 'до шага повреждений жетоны целы');
    toDamageStep(st, (s, q) => q.kind === 'ability' ? { no: true } : null);
    // Две пары — шесть жетонов.
    return eq(tokens(st, 'defender').att, 3, 'две пары — шесть жетонов');
});

check('Механизированная боевая группа', 'подкрепление составляет пару только в бою и только пока стоит', () => {
    for (const guard of [0, 1]) for (const space of [false, true])
        for (const status of ['standing', 'routed', 'destroyed']) for (const baseRouted of [false, true])
        for (const highRouted of [false, true]) for (const branch of [0, 1]) {
        let st = guardTokenBattle(guard, space);
        const side = guard === 0 ? 'attacker' : 'defender', foeSide = guard === 0 ? 'defender' : 'attacker';
        const base = space ? 'крейсеры' : 'гвардейцы', high = space ? 'линкоры' : 'огрины';
        st.units.find(u => u.seat === guard && u.unit === base).routed = baseRouted;
        for (const u of st.units.filter(u => u.seat === guard && u.unit === high)) u.routed = highRouted;
        setTokenStatus(st, side, status);
        // Matching units elsewhere on the map are not part of this combat.
        const remote = st.systems.find(sys => sys.id !== st.combat.system && sys.areas.some(a => !!a.world !== space));
        const pos = remote.areas.find(a => !!a.world !== space).pos;
        FS_RULES.addUnit(st, guard, base, remote.id, pos);
        FS_RULES.addUnit(st, guard, high, remote.id, pos);
        const steps = FS_EFFECTS.parse(guardCard('Механизированная боевая группа').general, { kind: 'combat', faction: IG });
        st = JSON.parse(JSON.stringify(st));
        FS_RULES.runEffects(st, guard, steps, { kind: 'combat', ctx: { side } });
        eq(pending(st)?.kind, 'choice', 'ветвь потери выбрана владельцем карты');
        ok(FS_RULES.apply(st, guard, { type: 'effect', answer: { choice: branch } }).ok, 'вариант принят');
        const expected = 3 * Math.min(Number(!baseRouted) + Number(status === 'standing'), highRouted ? 0 : 2);
        const entries = st.combat.damageStartTokens || [];
        eq(entries.length, expected ? 1 : 0, 'без пары отложенной потери нет');
        if (expected) eq([entries[0].side, entries[0].n, entries[0].what],
            [foeSide, expected, branch ? 'die' : 'token'], 'каждая локальная пара даёт три единицы');
    }
});
check('Механизированная боевая группа', 'деморализованный отряд пары не составляет', () => {
    const st = guardBattle({ units: { 'гвардейцы': 2, 'огрины': 2 }, foeUnits: { 'воины': 2 }, card: 'Механизированная боевая группа', dice: ['att'], foeDice: ['att', 'att', 'att', 'att'] });
    st.combat.tokens.defender = { att: 9, def: 0, morale: 0 };
    st.units.filter(u => u.seat === 0).find(u => (FS_RULES.unitOf(st, u) || {}).id === 'огрины').routed = true;
    play(st, 0, 0, null);
    toDamageStep(st);
    // Осталась одна пара: 2 Гвардейца и 1 Огрин.
    return eq(tokens(st, 'defender').att, 6, 'одна пара — три жетона');
});

check('Механизированная боевая группа', 'ветка `def. cube` забирает кубики защиты', () => {
    const st = guardBattle({ units: { 'гвардейцы': 2, 'огрины': 2 }, foeUnits: { 'воины': 2 }, card: 'Механизированная боевая группа', foeCard: 'Свежеватели', dice: ['att'], foeDice: ['att', 'def', 'def', 'def', 'def', 'def', 'def', 'def'] });
    play(st, 0, 0, (s, q) => (q.kind === 'choice' ? { choice: 1 } : null));
    eq([st.pending && st.pending.seat, st.combat.step], [1, 'effect'], 'защитник ещё решает способность');
    eq(count(st, 'defender', 'def'), 7, 'до шага повреждений кубики целы');
    toDamageStep(st, (s, q) => q.kind === 'ability' ? { no: true } : null);
    // Две пары по три кубика: шесть кубиков защиты ушли, остался один.
    return eq(count(st, 'defender', 'def'), 1, 'две пары — шесть кубиков, ушло сколько было');
});

// --- Боевое содружество -------------------------------------------------------
// «За каждый ваш недеморализованный наземный отряд разного командного уровня
//  получите 1 `att. token` либо 1 `def. token`. За каждый ваш недеморализованный
//  корабль разного командного уровня получите 2 `att. token` или 2 `def. token`.
//  Получите 1 `any cube`. Восстановите 1 ваш деморализованный отряд.»
check('Боевое содружество', 'жетоны за разные уровни наземных отрядов, корабль — по два', () => {
    const st = guardBattle({ units: { 'гвардейцы': 2, 'огрины': 1 }, foeUnits: { 'воины': 2 }, card: 'Боевое содружество', dice: ['att'], foeDice: ['att'] });
    play(st, 0, 0, null);
    // Гвардейцы КЛ 0 и Огрины КЛ 1 — два жетона, хотя отрядов три.
    eq(tokens(st, 'attacker').att, 2, 'два уровня — два жетона');
    // «Получите 1 `any cube`»: кубик пришёл на стол.
    return eq(dice(st, 'attacker').length, 2, 'кубик получен');
});

check('Боевое содружество', 'разные КЛ считают жетон и не считают отряды в других областях', () => {
    for (const guard of [0, 1]) for (const space of [false, true])
        for (const status of ['standing', 'routed', 'destroyed']) for (const baseRouted of [false, true])
        for (const highRouted of [false, true]) for (const branch of [0, 1]) {
        let st = guardTokenBattle(guard, space);
        const side = guard === 0 ? 'attacker' : 'defender', base = space ? 'крейсеры' : 'гвардейцы';
        const high = space ? 'линкоры' : 'огрины';
        st.units.find(u => u.seat === guard && u.unit === base).routed = baseRouted;
        for (const u of st.units.filter(u => u.seat === guard && u.unit === high)) u.routed = highRouted;
        setTokenStatus(st, side, status);
        const remote = st.systems.find(sys => sys.id !== st.combat.system && sys.areas.some(a => !!a.world !== space));
        FS_RULES.addUnit(st, guard, high, remote.id, remote.areas.find(a => !!a.world !== space).pos);
        const steps = FS_EFFECTS.parse(guardCard('Боевое содружество').general, { kind: 'combat', faction: IG });
        st = JSON.parse(JSON.stringify(st));
        FS_RULES.runEffects(st, guard, [steps[space ? 1 : 0]], { kind: 'combat', ctx: { side } });
        eq(pending(st)?.kind, 'choice', 'выбор типа жетонов');
        ok(FS_RULES.apply(st, guard, { type: 'effect', answer: { choice: branch } }).ok, 'вариант выбран');
        const levels = Number(!baseRouted || status === 'standing') + Number(!highRouted);
        eq(tokens(st, side)[branch ? 'def' : 'att'], levels * (space ? 2 : 1), 'только локальные уровни, КЛ 0 без двойного счёта');
    }
});
check('Боевое содружество', 'корабль другого уровня даёт 2 жетона', () => {
    const st = guardBattle({ units: { 'крейсеры': 2, 'линкоры': 2 }, foeUnits: { 'крейсеры-жнец': 2 }, kind: 'space', card: 'Боевое содружество', dice: ['att'], foeDice: ['att'] });
    play(st, 0, 0, null);
    // Крейсеры КЛ 0 и Линкоры КЛ 2 — два уровня по два жетона.
    return eq(tokens(st, 'attacker').att, 4, 'два уровня кораблей — четыре жетона');
});

check('Боевое содружество', 'деморализованный отряд не считается и восстанавливается', () => {
    const st = guardBattle({ units: { 'гвардейцы': 1, 'огрины': 1 }, foeUnits: { 'воины': 2 }, card: 'Боевое содружество', dice: ['att'], foeDice: ['att'] });
    const guard = st.units.filter(u => u.seat === 0).find(u => (FS_RULES.unitOf(st, u) || {}).id === 'гвардейцы');
    guard.routed = true;
    play(st, 0, 0, null);
    // Деморализованный Гвардеец уровня не даёт — остаётся один уровень.
    eq(tokens(st, 'attacker').att, 1, 'один недеморализованный уровень');
    return eq(guard.routed, false, 'отряд восстановлен');
});

// --- Молот Императора ---------------------------------------------------------
// «Ваш противник теряет 1 `def. cube`.»
// «*Титан «Гончая»:* получите 2 `att. token` за каждый ваш недеморализованный
//  отряд разного командного уровня, максимум 6. *Линкор:* получите 3 `att.
//  token` за каждый ваш недеморализованный отряд разного командного уровня.»
check('Молот Императора', 'противник теряет 1 def-кубик', () => {
    const st = guardBattle({ units: { 'гвардейцы': 2, 'титаны': 1 }, foeUnits: { 'воины': 2 }, card: 'Молот Императора', dice: ['att'], foeDice: ['def', 'att'] });
    play(st, 0, 0, null);
    return eq(count(st, 'defender', 'def'), 0, 'def-кубик противника потерян');
});

check('Молот Императора', 'Титан «Гончая»: 2 жетона за уровень, предел 6', () => {
    const two = guardBattle({ units: { 'гвардейцы': 2, 'титаны': 1 }, foeUnits: { 'воины': 2 }, card: 'Молот Императора', dice: ['att'], foeDice: ['att'] });
    play(two, 0, 0, null);
    // Гвардейцы КЛ 0 и Титан КЛ 3 — два уровня по два жетона.
    eq(tokens(two, 'attacker').att, 4, 'два уровня — четыре жетона');
    const capped = guardBattle({ units: { 'гвардейцы': 2, 'огрины': 1, 'титаны': 1 }, foeUnits: { 'воины': 2 }, card: 'Молот Императора', dice: ['att'], foeDice: ['att'] });
    play(capped, 0, 0, null);
    // Три уровня дали бы шесть — ровно предел карты.
    return eq(tokens(capped, 'attacker').att, 6, 'три уровня — предел 6');
});

check('Молот Императора', 'КЛ подкрепления считается один раз, вне боя не считается, наземный абзац ограничен шестью', () => {
    for (const guard of [0, 1]) for (const space of [false, true])
        for (const status of ['standing', 'routed', 'destroyed']) for (const baseRouted of [false, true])
        for (const highRouted of (space ? [false] : [false, true])) for (const extra of (space ? [false] : [false, true])) {
        let st = guardTokenBattle(guard, space);
        const side = guard === 0 ? 'attacker' : 'defender', base = space ? 'крейсеры' : 'гвардейцы';
        const high = space ? 'линкоры' : 'огрины', field = st.combat;
        st.units.find(u => u.seat === guard && u.unit === base).routed = baseRouted;
        for (const u of st.units.filter(u => u.seat === guard && u.unit === high)) u.routed = highRouted;
        if (!space) FS_RULES.addUnit(st, guard, 'титаны', field.system, field.pos);
        if (extra) FS_RULES.addUnit(st, guard, 'танки-леман-русс', field.system, field.pos);
        setTokenStatus(st, side, status);
        const remote = st.systems.find(sys => sys.id !== field.system && sys.areas.some(a => !!a.world !== space));
        FS_RULES.addUnit(st, guard, base, remote.id, remote.areas.find(a => !!a.world !== space).pos);
        const step = FS_EFFECTS.parse(guardCard('Молот Императора').unit, { kind: 'combat', faction: IG })[space ? 1 : 0];
        st = JSON.parse(JSON.stringify(st));
        FS_RULES.runEffects(st, guard, [step], { kind: 'combat', ctx: { side } });
        const levels = Number(!baseRouted || status === 'standing') + Number(!highRouted) + Number(!space) + Number(extra);
        eq(tokens(st, side).att, space ? 3 * levels : Math.min(6, 2 * levels), 'количество за разные местные КЛ и соответствующий предел');
    }
});
check('Молот Императора', 'Линкорный абзац читается, когда Титана нет', () => {
    // «*Линкор:*» — свой реквизит абзаца: Линкор в бою, Титана нет.
    const st = guardBattle({ units: { 'линкоры': 1 }, foeUnits: { 'крейсеры-жнец': 2 }, kind: 'space', card: 'Молот Императора', dice: ['att'], foeDice: ['def'] });
    play(st, 0, 0, null);
    // Один уровень (Линкоры КЛ 2) по три жетона.
    eq(tokens(st, 'attacker').att, 3, 'Линкор даёт 3 жетона за уровень');
    const both = guardBattle({ units: { 'крейсеры': 1, 'линкоры': 1 }, foeUnits: { 'крейсеры-жнец': 2 }, kind: 'space', card: 'Молот Императора', dice: ['att'], foeDice: ['def'] });
    play(both, 0, 0, null);
    return eq(tokens(both, 'attacker').att, 6, 'два уровня кораблей — шесть жетонов');
});

check('Молот Императора', 'без Титана и Линкора способности нет', () => {
    const st = guardBattle({ units: { 'гвардейцы': 2 }, foeUnits: { 'воины': 2 }, card: 'Молот Императора', dice: ['att'], foeDice: ['def'] });
    play(st, 0, 0, null);
    return eq(tokens(st, 'attacker').att, 0, 'абзацы чужих отрядов не читаются');
});

// --- Бронетанковый клин -------------------------------------------------------
// «Уничтожьте до 2 недеморализованных Гвардейцев, чтобы ваш противник потерял
//  2 кубика по своему выбору за каждого уничтоженного Гвардейца, либо уничтожьте
//  1 недеморализованный Крейсер, чтобы ваш противник потерял 3 кубика на свой
//  выбор.»
// «*Леман Русс/Линкор:* выберите один из бастионов или отрядов противника 2 или
//  3 командного уровня. Этот отряд или бастион получает урон первым.»
check('Бронетанковый клин', 'два Гвардейца — четыре кубика противника', () => {
    const st = guardBattle({ units: { 'гвардейцы': 2, 'титаны': 1 }, foeUnits: { 'воины': 2 }, card: 'Бронетанковый клин', dice: ['att'], foeDice: ['att', 'morale', 'def', 'def', 'def', 'def'] });
    play(st, 0, 0, null);
    eq(myUnits(st).filter(u => (FS_RULES.unitOf(st, u) || {}).id === 'гвардейцы').length, 0, 'оба Гвардейца уничтожены');
    return eq(dice(st, 'defender').length, 2, 'противник потерял четыре кубика');
});

check('Бронетанковый клин', '«до 2» — можно уничтожить одного и заплатить за одного', () => {
    const st = guardBattle({ units: { 'гвардейцы': 2, 'титаны': 1 }, foeUnits: { 'воины': 2 }, card: 'Бронетанковый клин', dice: ['att'], foeDice: ['att', 'def', 'def', 'def'] });
    play(st, 0, 0, (s, q) => (q.kind === 'units' ? { units: (q.options || []).slice(0, 1) } : null));
    eq(myUnits(st).filter(u => (FS_RULES.unitOf(st, u) || {}).id === 'гвардейцы').length, 1, 'один Гвардеец уцелел');
    return eq(dice(st, 'defender').length, 2, 'за одного уничтоженного — два кубика');
});

check('Бронетанковый клин', 'настоящие «до 2» допускают нулевую жертву без награды', () => {
    const st = guardBattle({ units: { 'гвардейцы': 2 }, foeUnits: { 'воины': 2 }, card: 'Бронетанковый клин',
        dice: ['att'], foeDice: ['att', 'def', 'def', 'def'] });
    const before = { units: myUnits(st).length, dice: dice(st, 'defender').length };
    let offered = false;
    play(st, 0, 0, (s, q) => {
        if (q.op === 'destroy') { offered = true; return { units: [] }; }
        return q.kind === 'choice' ? { choice: 0 } : null;
    });
    ok(offered, 'выбор жертвы предложен');
    eq(myUnits(st).length, before.units, 'ничего не уничтожено');
    eq(dice(st, 'defender').length, before.dice, 'награды без жертвы нет');
});
check('Бронетанковый клин', 'ветка Крейсера: три кубика за один корабль', () => {
    const st = guardBattle({ units: { 'крейсеры': 1, 'линкоры': 1 }, foeUnits: { 'крейсеры-жнец': 2 }, kind: 'space', card: 'Бронетанковый клин', dice: ['att'], foeDice: ['att', 'def', 'def', 'def', 'def'] });
    play(st, 0, 0, (s, q) => (q.kind === 'choice' ? { choice: 1 } : null));
    eq(myUnits(st).filter(u => (FS_RULES.unitOf(st, u) || {}).id === 'крейсеры').length, 0, 'Крейсер уничтожен');
    return eq(dice(st, 'defender').length, 2, 'три кубика потеряны');
});

check('Бронетанковый клин', 'уничтожать некого — противник кубиков не теряет', () => {
    // Ни Гвардейцев, ни Крейсеров: обе ветки пусты, но карта всё равно
    // разыграна — и противник не платит за несуществующую жертву.
    const st = guardBattle({ units: { 'огрины': 2 }, foeUnits: { 'воины': 2 }, card: 'Бронетанковый клин', dice: ['att'], foeDice: ['att', 'def', 'def'] });
    const before = dice(st, 'defender').length;
    play(st, 0, 0, (s, q) => (q.kind === 'choice' ? { choice: 0 } : null));
    return eq(dice(st, 'defender').length, before, 'кубики противника на месте');
});

check('Бронетанковый клин', 'Леман Русс выбирает отряд 2–3 уровня, он получает урон первым', () => {
    // В бою у врага есть и отряд КЛ 0: он в выбор «2 или 3 уровня» не попадает.
    const st = guardBattle({ units: { 'танки-леман-русс': 1, 'гвардейцы': 2 }, foeUnits: { 'монолиты': 2, 'воины': 1 }, card: 'Бронетанковый клин', dice: ['att'], foeDice: ['att', 'def', 'def', 'def', 'def'] });
    let offered = null;
    play(st, 0, 0, (s, q) => {
        if (q.op === 'damageFirst') offered = (q.options || []).slice();
        return q.kind === 'choice' ? { choice: 0 } : null;
    });
    const first = st.combat.damageFirst || [];
    eq(first.length, 1, 'цель первого урона выбрана');
    const def = FS_RULES.unitOf(st, stateUnit(st, first[0].id));
    eq((def || {}).kl, 2, 'выбран отряд 2 уровня — единственный в бою');
    // В выборе только отряды 2–3 уровня: КЛ 0 и 1 туда не попадают.
    ok(Array.isArray(offered), 'вопроса о цели не было');
    return eq(offered.every(id => {
        const d = FS_RULES.unitOf(st, st.units.find(u => u.id === id));
        return d && [2, 3].includes(d.kl || 0);
    }), true, 'предложены только отряды 2–3 уровня');
});

check('Бронетанковый клин', 'без Лемана и Линкора отряда-абзаца нет', () => {
    const st = guardBattle({ units: { 'гвардейцы': 2 }, foeUnits: { 'монолиты': 2 }, card: 'Бронетанковый клин', dice: ['att'], foeDice: ['att'] });
    play(st, 0, 0, null);
    return eq(st.combat.damageFirst || [], [], 'урон первым никто не получает');
});

head('Боевая колода', 'инквизиция');
check('Серебряная броня', 'надбавка «на 1 здоровье во время этой битвы» живёт до конца боя, а не раунда', () => {
    // Общая способность — выбор кубика или двух жетонов; способность единицы
    // («Рыцарь Немезиды/Чёрный Корабль») поднимает здоровье своих отрядов на 1
    // на всю битву. Правка движка: такое «во время этой битвы» не снимается
    // концом раунда, иначе надбавка жила бы один раунд.
    const card = FS_DATA.combat.find(x => x.faction === 'инквизиция' && x.name === 'Серебряная броня');
    const step = FS_EFFECTS.parse(card.unit.split(':').slice(1).join(':').trim(), { kind: 'combat', faction: 'инквизиция' })
        .find(x => x.op === 'healthBonus');
    ok(!!step, 'парсер не читает «во время этой битвы»');
    eq(step.combat, true, 'шаг помечен как действующий всю битву');
    // Первый раунд: карта вскрыта, надбавка выдана.
    const st = battle({ faction: 'инквизиция', foeFaction: 'имперская-гвардия', card: 'Серебряная броня', units: { 'рыцари-немезиды': 1 }, foeUnits: { 'гвардейцы': 3 }, dice: [], foeDice: ['att', 'att'], noFoeCard: true });
    const c = st.combat;
    playThrough(st);
    eq(CombatDamage.of(c).healthBonusFor(0), 1, 'в первом раунде надбавка есть');
    eq(CombatDamage.of(c).health(0, 6), 7, 'здоровье своего отряда поднято');
    eq(CombatDamage.of(c).health(1, 6), 6, 'чужой отряд надбавки не получает');
    // Конец раунда снимает эффекты раунда, но не битвы.
    FS_RULES.endCombatRound(st);
    // Бой может закончиться вместе с раундом — тогда судим по той же записи боя.
    const after = st.combat || c;
    return eq(CombatDamage.of(after).health(0, 6), 7, 'надбавка пережила конец раунда');
});

// ============================================================================
//  Инквизиция — фанатская колода (02/04/05/06): боевые карты, приказы, события.
//  Проверяются ветки движка, которых не было до аудита фракции: запрет общих
//  способностей следующей карты, переброс кубиков противника с наградой за
//  выпавшее, ход Штурмовика через всю карту, награда орбитального удара
//  ценным ресурсом мира, пятый жетон приказа, сбор маркера цели приказом.
// ============================================================================
/** The world next to an area: the first one the board names. */
const adjacentWorld = (st, system, pos) => {
    const found = FS_RULES.areasAround(st, system, pos)
        .map(a => ({ system: a.system, pos: a.pos, area: FS_RULES.area(FS_RULES.system(st, a.system), a.pos) }))
        .find(x => x.area && x.area.world);
    ok(!!found, 'есть соседний мир');
    return { system: found.system, pos: found.pos };
};
/** The seat that answers the pending question. */
const answerSeat = st => (st.pending.answerSeat === undefined ? st.pending.seat : st.pending.answerSeat);
/** Answer the questions of an effect: the policy first, the default answer when it is silent. */
const deAnswer = (st, policy, limit) => effectAnswer(st, (s2, q) => (policy && policy(s2, q)) || effectPolicy(s2, q), limit);
const INQ = 'инквизиция';
const inqBattle = (o = {}) => battle(Object.assign({ faction: INQ, foeFaction: FOE,
    units: { 'караул-смерти': 1, 'инквизиторские-штурмовики': 1 },
    foeUnits: { 'гвардейцы': 2 }, dice: ['att', 'def'], foeDice: ['att', 'def', 'morale'] }, o));
const inqPlay = (st, policy, index) => play(st, 0, index || 0, policy);
const inqEvent = (name, o = {}) => eventState(name, Object.assign({ faction: INQ, foeFaction: FOE }, o));
const inqOrder = (kind, o = {}) => orderState(kind, Object.assign({ faction: INQ, foeFaction: FOE }, o));
const inqStrike = (o = {}) => strikeState(Object.assign({ faction: INQ, foeFaction: FOE, ships: { 'инквизиторские-крейсеры': 2 }, foeUnits: { 'гвардейцы': 1 } }, o));
/** The Inquisition defends: the Guard attacks with the card of the check in HIS hand. */
const inqDefends = (o = {}) => battle(Object.assign({ faction: FOE, foeFaction: INQ,
    units: { 'гвардейцы': 2 }, foeUnits: { 'караул-смерти': 1, 'инквизиторские-штурмовики': 1 },
    card: 'Ложись!', dice: ['att', 'def', 'morale'], foeDice: ['att', 'def'] }, o));
/** A way out of the battle world for the Guard: his ship in the void next to it. */
const guardWayOut = st => {
    const field = BattleField.of(st.combat);
    const voidNear = FS_RULES.areasAround(st, field.system, field.pos)
        .find(a => a.system === field.system && !FS_RULES.area(FS_RULES.system(st, a.system), a.pos).world);
    ok(!!voidNear, 'рядом с миром боя есть пустота той же системы');
    FS_RULES.addUnit(st, 0, 'крейсеры', voidNear.system, voidNear.pos);
    // The Guard came by an Advance order: the retreat is not tied to the area it came from.
    st.combat.viaAdvance = true;
};
/** A way out of the battle world for the Inquisition that defends: its cruiser in a void of the system. */
const inqWayOut = st => {
    const field = BattleField.of(st.combat);
    const voidNear = FS_RULES.areasAround(st, field.system, field.pos)
        .find(a => a.system === field.system && !FS_RULES.area(FS_RULES.system(st, a.system), a.pos).world);
    FS_RULES.addUnit(st, 1, 'инквизиторские-крейсеры', voidNear.system, voidNear.pos);
    const targets = FS_RULES.retreatTargets(st, 1);
    ok(targets.length > 0, 'через пустоту с крейсером есть куда отступить');
    return targets[0];
};
const inqUnit = (st, id, seat) => st.units.find(u => u.seat === (seat || 0) && FS_RULES.unitOf(st, u).id === id);
const inqIcons = name => FS_DATA.combat.find(x => x.faction === INQ && x.name === name).icons;

head('Боевая колода', INQ);

check('Руководство по вере', 'в атаке противник теряет общие способности следующей открытой карты, но не способности отряда', () => {
    const st = inqBattle({ card: 'Руководство по вере', foeCard: 'За Императора!', dice: ['att'], foeDice: ['def', 'morale'] });
    inqPlay(st);
    answerAll(st, null, 1);
    ok(st.log.some(l => /общие способности этой карты не разыгрываются/.test(l.text || l)), 'общая способность карты противника снята');
    eq(dice(st, 'defender'), ['def', 'morale'], 'переброс «За Императора!» не состоялся');
    eq(tokens(st, 'defender').att, 2, 'способность отряда противника (жетон за Гвардейца) осталась');
    eq(inqIcons('Руководство по вере').morale, 3, 'три значка морали на карте');
});

check('Руководство по вере', 'в защите: любой кубик — или отступление одним отрядом', () => {
    let st = inqDefends({ foeCard: 'Руководство по вере', foeDice: ['att'] });
    play(st, 1, 0, (s2, q) => (q.kind === 'choice' ? { choice: 0 } : null));
    eq(dice(st, 'defender').length, 2, 'кубик получен');
    ok(!st.log.some(l => /теряет общие способности/.test(l.text || l)), 'в защите запрета нет');
    st = inqDefends({ foeCard: 'Руководство по вере', foeDice: ['att'] });
    const field = BattleField.of(st.combat);
    // A world reachable through a void with its cruiser: the retreat of the Inquisition.
    const near = inqWayOut(st);
    const trace = play(st, 1, 0, (s2, q) => {
        if (q.kind === 'choice') return { choice: 1 };
        if (q.op === 'retreat' && q.kind === 'units') return { units: [inqUnit(s2, 'караул-смерти', 1).id] };
        if (q.op === 'retreat' && q.kind === 'areas') return { area: q.options.find(a => a.system === near.system && a.pos === near.pos) || q.options[0] };
        return null;
    });
    eq(trace.filter(t => t.op === 'retreat').map(t => t.seat), [1, 1], 'Инквизиция выбирает отряд и область сама');
    const dw = inqUnit(st, 'караул-смерти', 1);
    eq([dw.system, dw.area, dw.routed], [near.system, near.pos, true], 'Караул Смерти отступил в соседний мир и деморализован');
    eq(foeUnits(st).filter(u => u.system === field.system && u.area === field.pos).length, 1, 'Штурмовик остался в бою');
});

check('Ослепляющий залп', 'атакуя — противник лишается общих способностей следующей карты; защищаясь — `any cube`', () => {
    let st = inqBattle({ card: 'Ослепляющий залп', foeCard: 'За Императора!', dice: ['att'], foeDice: ['def', 'morale'] });
    inqPlay(st);
    answerAll(st, null, 1);
    ok(st.log.some(l => /общие способности этой карты не разыгрываются/.test(l.text || l)), 'общая способность карты противника снята');
    eq(dice(st, 'defender'), ['def', 'morale'], 'переброс «За Императора!» не состоялся');
    eq(tokens(st, 'defender').att, 2, 'способность отряда противника осталась');
    eq(dice(st, 'attacker'), ['att'], 'в атаке кубика нет');
    st = inqDefends({ foeCard: 'Ослепляющий залп', foeDice: ['att'] });
    play(st, 1, 0);
    ok(!st.log.some(l => /не разыгрываются/.test(l.text || l)), 'в защите запрета нет');
    const me = st.players[1].name;
    ok(st.log.some(l => (l.text || l) === me + ' получает 1 кубик(ов).'), 'в защите Инквизиция получает кубик');
});

check('Одобренный псайкер', 'противник платит `att. cube` за жетон атаки — или теряет `def. cube`', () => {
    let st = inqBattle({ card: 'Одобренный псайкер', units: { 'караул-смерти': 1 }, dice: ['att'], foeDice: ['att', 'def', 'morale'] });
    let trace = inqPlay(st, (s2, q) => (q.op === 'foeAllow' ? { no: true } : null));
    eq(trace.find(t => t.op === 'foeAllow').seat, 1, 'решает противник');
    eq(dice(st, 'defender'), ['att', 'morale'], 'отказ — противник потерял `def. cube`');
    eq(tokens(st, 'defender').att, 0, 'жетона атаки нет');
    st = inqBattle({ card: 'Одобренный псайкер', units: { 'караул-смерти': 1 }, dice: ['att'], foeDice: ['att', 'def', 'morale'] });
    trace = inqPlay(st, (s2, q) => (q.op === 'foeAllow' ? {} : null));
    ok(trace.some(t => t.op === 'spendDie' && t.seat === 1), 'противник выбирает кубик атаки');
    eq(dice(st, 'defender'), ['def', 'morale'], 'согласие — `att. cube` потрачен');
    eq(tokens(st, 'defender').att, 1, 'жетон атаки получен');
});

check('Одобренный псайкер', 'Штурмовик/Крейсер: противник перебрасывает 2 кубика, выпавшие дают жетоны владельцу карты', () => {
    const run = face => withFixedDice([face], () => {
        const st = inqBattle({ card: 'Одобренный псайкер', units: { 'инквизиторские-штурмовики': 1 }, dice: ['att'], foeDice: ['att', 'def', 'morale'] });
        const trace = inqPlay(st, (s2, q) => {
            if (q.op === 'foeAllow') return { no: true };
            if (q.op === 'rerollDie') return { dice: q.options.slice(0, 2) };
            return null;
        });
        const reroll = trace.find(t => t.op === 'rerollDie');
        eq([reroll && reroll.seat, reroll && reroll.answer.dice.length], [1, 2], 'противник сам выбирает два кубика');
        return st;
    });
    let st = run('att');
    eq([tokens(st, 'attacker').att, tokens(st, 'attacker').def], [2, 2], 'два `att. cube` — 2 жетона атаки и 2 обороны');
    st = run('def');
    eq([tokens(st, 'attacker').att, tokens(st, 'attacker').def], [0, 2], 'два `def. cube` — только 2 жетона обороны');
    st = run('morale');
    eq([tokens(st, 'attacker').att, tokens(st, 'attacker').def], [0, 0], 'мораль не даёт ничего');
});

check('Теневая миссия', 'восстановление и `morale cube`; при перевесе морали противник деморализует отряд или теряет кубик', () => {
    let st = inqBattle({ card: 'Теневая миссия', units: { 'инквизиторские-штурмовики': 2 }, dice: ['morale'], foeDice: ['att', 'def'], routed: [0] });
    let trace = inqPlay(st, (s2, q) => (q.kind === 'choice' ? { choice: 0 } : null));
    eq(myUnits(st).filter(u => u.routed).length, 0, 'свой отряд восстановлен');
    eq(count(st, 'attacker', 'morale'), 2, '`morale cube` получен');
    const fork = trace.find(t => t.kind === 'choice');
    eq(fork && fork.seat, 1, 'выбирает противник');
    eq(foeUnits(st).filter(u => u.routed).length, 1, 'противник деморализовал свой отряд');
    st = inqBattle({ card: 'Теневая миссия', units: { 'инквизиторские-штурмовики': 2 }, dice: ['morale'], foeDice: ['att', 'def'] });
    inqPlay(st, (s2, q) => (q.kind === 'choice' ? { choice: 1 } : null));
    eq(dice(st, 'defender').length, 1, 'противник потерял кубик');
    eq(foeUnits(st).filter(u => u.routed).length, 0, 'никто не деморализован');
    // No edge in morale: the unit ability asks nothing.
    st = inqBattle({ card: 'Теневая миссия', units: { 'инквизиторские-штурмовики': 2 }, dice: [], foeDice: ['morale', 'def'] });
    trace = inqPlay(st);
    ok(!trace.some(t => t.kind === 'choice'), 'без перевеса морали выбора нет');
    eq(dice(st, 'defender').length, 2, 'кубики противника целы');
});

check('Непреклонные крестоносцы', '2 жетона атаки; владелец решает: противник теряет `def. cube` или 2 жетона атаки', () => {
    let st = inqBattle({ card: 'Непреклонные крестоносцы', units: { 'караул-смерти': 1 }, dice: ['att'], foeDice: ['att', 'def'] });
    let trace = inqPlay(st, (s2, q) => (q.kind === 'choice' ? { choice: 0 } : null));
    eq(tokens(st, 'attacker').att, 2, 'два жетона атаки');
    eq(trace.find(t => t.kind === 'choice').seat, 0, 'выбирает владелец карты');
    eq(dice(st, 'defender'), ['att'], 'противник потерял `def. cube`');
    st = inqBattle({ card: 'Непреклонные крестоносцы', units: { 'караул-смерти': 1 }, dice: ['att'], foeDice: ['att', 'def'] });
    st.combat.tokens.defender.att = 3;
    inqPlay(st, (s2, q) => (q.kind === 'choice' ? { choice: 1 } : null));
    eq(tokens(st, 'defender').att, 1, 'противник потерял 2 жетона атаки');
    eq(dice(st, 'defender').length, 2, 'кубики противника целы');
    // In attack there is nothing to restore.
    st = inqBattle({ card: 'Непреклонные крестоносцы', units: { 'караул-смерти': 2 }, dice: ['att'], foeDice: ['att', 'def'], routed: [1] });
    inqPlay(st, (s2, q) => (q.kind === 'choice' ? { choice: 0 } : null));
    eq(myUnits(st).filter(u => u.routed).length, 1, 'в атаке восстановления нет');
});

check('Непреклонные крестоносцы', 'в защите Караул Смерти восстанавливает отряд', () => {
    const st = inqDefends({ foeCard: 'Непреклонные крестоносцы', foeUnits: { 'караул-смерти': 2 }, foeDice: ['att'], roundEnd: true });
    routeFoe(st, 1);
    let seen = null;
    play(st, 1, 0, (s2, q) => {
        // The tokens are counted while the card still asks: the round of the
        // defender runs to its end once the card is resolved.
        if (q.kind === 'choice') { seen = s2.combat.tokens.defender.att; return { choice: 0 }; }
        return null;
    });
    eq(foeUnits(st).filter(u => u.routed).length, 0, 'отряд восстановлен');
    eq(seen, 2, 'два жетона атаки получены до выбора');
    ok(st.log.some(l => /Противник теряет 1 кубик\(ов\) обороны/.test(l.text || l)), 'Гвардия потеряла `def. cube`');
});

check('Беспощадная атака', '2 жетона обороны; в атаке восстановление; `def. cube` за 2 жетона атаки', () => {
    let st = inqBattle({ card: 'Беспощадная атака', units: { 'караул-смерти': 2 }, dice: ['def', 'att'], foeDice: ['att'], routed: [1] });
    const trace = inqPlay(st);
    eq(tokens(st, 'attacker').def, 2, 'два жетона обороны');
    eq(myUnits(st).filter(u => u.routed).length, 0, 'отряд восстановлен в атаке');
    eq(trace.find(t => t.op === 'spendDie').answer, { dice: [0] }, 'тратится `def. cube`');
    eq(dice(st, 'attacker'), ['att'], '`def. cube` ушёл');
    eq(tokens(st, 'attacker').att, 2, 'два жетона атаки получены');
    st = inqBattle({ card: 'Беспощадная атака', units: { 'караул-смерти': 1 }, dice: ['att'], foeDice: ['att'] });
    inqPlay(st);
    eq(tokens(st, 'attacker').att, 0, 'без `def. cube` жетонов атаки нет');
});

check('Френзоновые импланты', 'Штурмовик/Крейсер: 2 жетона атаки переворачивают все `morale cube` на атаку', () => {
    const st = inqBattle({ card: 'Френзоновые импланты', units: { 'инквизиторские-штурмовики': 1 }, dice: ['morale', 'morale', 'def'], foeDice: ['att'] });
    inqPlay(st);
    eq(dice(st, 'attacker'), ['att', 'att', 'def'], 'оба `morale cube` стали атакой');
    eq(tokens(st, 'attacker').att, 0, 'жетоны потрачены');
    const other = inqBattle({ card: 'Френзоновые импланты', units: { 'караул-смерти': 1 }, dice: ['morale'], foeDice: ['att'] });
    inqPlay(other);
    eq([dice(other, 'attacker'), tokens(other, 'attacker').att], [['morale'], 2], 'без Штурмовика жетоны остаются, кубики не трогаются');
});

check('Щит псайкера', 'Караул Смерти/Крейсер: 2 жетона обороны — бесплатный жетон подкрепления в этой области', () => {
    const st = inqBattle({ card: 'Щит псайкера', units: { 'караул-смерти': 1 }, dice: ['att'], foeDice: ['att'] });
    const before = st.players[0].assets.reinforcement;
    inqPlay(st);
    eq(tokens(st, 'attacker').def, 0, 'жетоны обороны потрачены');
    eq(CombatTokens.of(st.combat).used('attacker'), 1, 'жетон подкрепления стоит в области боя');
    eq(st.players[0].assets.reinforcement, before, 'свой жетон подкрепления не потрачен');
});

check('Бесспорная мудрость', 'кубик на выбор; карта с руки даёт значки только до конца раунда', () => {
    const st = inqBattle({ hand: ['Бесспорная мудрость', 'Ракеты Хеллстрайк'], units: { 'инквизиторские-штурмовики': 1 }, dice: ['att'], foeDice: ['att'], roundEnd: true });
    const c = st.combat;
    const trace = inqPlay(st, (s2, q) => {
        if (q.kind === 'choice') return { choice: 1 };
        if (q.op === 'playCard') return { card: 'Ракеты Хеллстрайк' };
        return null;
    });
    eq(dice(st, 'attacker'), ['att', 'def'], '`def. cube` получен');
    ok(trace.some(t => t.op === 'playCard'), 'карта с руки разыграна');
    const own = inqIcons('Бесспорная мудрость');
    const extra = inqIcons('Ракеты Хеллстрайк');
    const icons = CombatCards.of(c).icons('attacker');
    eq([icons.att, icons.def, icons.morale], [own.att + extra.att, own.def + extra.def, own.morale + extra.morale], 'значки второй карты прибавлены');
    eq(dice(st, 'defender').length, 1, 'способности второй карты не применены — противник кубика не терял');
    FS_RULES.endCombatRound(st);
    const after = st.combat || c;
    const icons2 = CombatCards.of(after).icons('attacker');
    eq([icons2.att, icons2.def], [own.att, own.def], 'в следующем раунде значков второй карты уже нет');
});

check('Защитный барьер', 'переброс `att.`/`morale cube` отнимает у противника `att. cube`; Валькирия приводит Штурмовика из любого мира', () => withFixedDice(['def'], () => {
    const st = inqBattle({ card: 'Защитный барьер', units: { 'вилькирии': 1 }, dice: ['att', 'morale'], foeDice: ['att', 'def'] });
    const field = BattleField.of(st.combat);
    const far = st.systems.find(s => s.id !== field.system);
    FS_RULES.addUnit(st, 0, 'инквизиторские-штурмовики', far.id, worldOf(st, far.id));
    const trace = inqPlay(st, (s2, q) => (q.op === 'rerollDie' ? { dice: [1] } : null));
    eq(dice(st, 'attacker'), ['att', 'def'], '`morale cube` переброшен');
    eq(dice(st, 'defender'), ['def'], 'противник потерял `att. cube`');
    const move = trace.filter(t => t.op === 'moveUnit');
    eq(move.map(t => t.kind), ['units', 'areas'], 'выбирается Штурмовик и мир');
    eq(move[1].options, [{ system: field.system, pos: field.pos }], 'только мир этой битвы');
    eq(myUnits(st).filter(u => u.system === field.system && u.area === field.pos).length, 2, 'Штурмовик пришёл в бой из другой системы');
}));

check('Защитный барьер', 'Чёрный Корабль: Штурмовик встаёт в дружественный или неконтролируемый мир системы боя', () => withFixedDice(['def'], () => {
    const st = inqBattle({ kind: 'space', card: 'Защитный барьер', units: { 'черные-корабли': 1 }, foeUnits: { 'крейсеры': 1 }, dice: ['att'], foeDice: ['att'] });
    const field = BattleField.of(st.combat);
    const sys = FS_RULES.system(st, field.system);
    const worlds = sys.areas.filter(a => a.world).map(a => a.pos);
    ok(worlds.length >= 2, 'в системе боя не меньше двух миров');
    FS_RULES.addUnit(st, 1, 'гвардейцы', sys.id, worlds[0]);
    const far = st.systems.find(s => s.id !== field.system);
    FS_RULES.addUnit(st, 0, 'инквизиторские-штурмовики', far.id, worldOf(st, far.id));
    const trace = inqPlay(st, (s2, q) => (q.op === 'rerollDie' ? { dice: [0] } : null));
    const areas = trace.find(t => t.op === 'moveUnit' && t.kind === 'areas');
    ok(!!areas, 'мир предложен');
    eq(areas.options.map(a => a.pos).sort(), worlds.slice(1).sort(), 'мир с войсками противника не предлагается');
    eq(myUnits(st).filter(u => u.system === sys.id && u.area === worlds[1]).length, 1, 'Штурмовик встал в мир системы боя');
}));

check('Ракеты Хеллстрайк', 'переброс `def.`/`morale cube` отнимает `def. cube`; Валькирия уничтожает деморализованный отряд противника', () => withFixedDice(['att'], () => {
    const st = inqBattle({ card: 'Ракеты Хеллстрайк', units: { 'вилькирии': 1 }, foeUnits: { 'гвардейцы': 1, 'огрины': 1 }, dice: ['def'], foeDice: ['att', 'def'], foeRouted: [1] });
    const trace = inqPlay(st, (s2, q) => (q.op === 'destroy' ? { units: [inqUnit(s2, 'огрины', 1).id] } : null));
    eq(dice(st, 'attacker'), ['att'], '`def. cube` переброшен');
    eq(dice(st, 'defender'), ['att'], 'противник потерял `def. cube`');
    const destroy = trace.find(t => t.op === 'destroy');
    eq([destroy && destroy.seat, destroy && destroy.options.length], [0, 1], 'владелец карты выбирает из деморализованных');
    eq(unitsByType(st, 1), { 'Гвардейцы': 1 }, 'деморализованный Огрин уничтожен');
    const calm = inqBattle({ card: 'Ракеты Хеллстрайк', units: { 'вилькирии': 1 }, dice: ['def'], foeDice: ['att', 'def'] });
    const trace2 = inqPlay(calm);
    ok(!trace2.some(t => t.op === 'destroy'), 'без деморализованных отрядов уничтожать некого');
}));

check('Взгляд без глаз', 'противник теряет 3 кубика по своему выбору, затем владелец теряет 3 своих', () => {
    const st = inqBattle({ card: 'Взгляд без глаз', units: { 'караул-смерти': 1 }, dice: ['att', 'att', 'def', 'morale'], foeDice: ['att', 'def', 'morale', 'def'] });
    const trace = inqPlay(st, (s2, q) => (q.op === 'loseDie' ? { dice: q.options.slice(0, 3) } : null));
    const lose = trace.filter(t => t.op === 'loseDie');
    eq(lose.map(t => t.seat), [1, 0], 'сначала противник, затем владелец');
    eq(dice(st, 'defender').length, 1, 'у противника остался 1 кубик');
    eq(dice(st, 'attacker').length, 2, 'у владельца 2: четыре кубика, `any cube` карты и минус три');
});

check('Передовая высадка', 'выбранный отряд противника получает урон первым; противнику +3 урона, если он его получает', () => {
    const st = inqBattle({ card: 'Передовая высадка', units: { 'рыцари-немезиды': 1 }, foeUnits: { 'гвардейцы': 2, 'огрины': 1 }, dice: ['att', 'att'], foeDice: ['att'] });
    const ogryn = inqUnit(st, 'огрины', 1);
    inqPlay(st, (s2, q) => (q.op === 'damageFirst' ? { units: [ogryn.id] } : null));
    eq((st.combat.damageFirst || []).map(x => [x.side, x.id]), [['defender', ogryn.id]], 'Огрин получает урон первым');
    eq(CombatDamage.of(st.combat).extra('defender', 1), 4, 'урон противнику растёт на 3');
    eq(CombatDamage.of(st.combat).extra('defender', 0), 0, 'без урона надбавки нет');
    eq(CombatDamage.of(st.combat).extra('attacker', 1), 1, 'урон владельцу не меняется');
});

head('Улучшения приказов', INQ);

check('Ужасный удар', 'бастион не защищает мир; торг с противником — вручную', () => {
    const st = inqStrike({ upgrades: ['Ужасный удар'], foeStructures: ['bastion'] });
    eq(FS_RULES.orbitalStrikeTargets(st, 0).length, 0, 'бастион закрывает мир');
    ok(burn(st, 'Ужасный удар').ok, 'карта сгорела');
    eq(!!st.order.ignoreBastion, true, 'приказ игнорирует бастионы');
    ok(FS_RULES.orbitalStrikeTargets(st, 0).some(t => t.pos === st.strikeWorld), 'мир снова под ударом');
    ok(st.log.some(l => /потратить 1 `def\. cube`/.test(l.text || l)), 'текст торга показан игроку');
    fire(st, ['att', 'att']);
    eq(pending(st), null, 'вопросов удар не задаёт');
    eq(ctx.StrikeDamage.of(st).hits, 2, 'урон удара обычный');
});

check('Пси-мастерство', 'три верхние карты событий: выбранная наверху, две другие замешаны в колоду', () => {
    const st = inqOrder('strategize', { upgrades: ['Пси-мастерство'], units: { 'инквизиторские-штурмовики': 1 }, structures: ['city'] });
    FS_RULES.initializeEventDeck(st, 0);
    const deck = st.players[0].decks.event.slice();
    ok(burn(st, 'Пси-мастерство').ok, 'карта сгорела');
    const q = pending(st);
    eq([q && q.op, q && q.kind], ['lookEvents', 'cards'], 'предложены карты');
    eq(q.options, deck.slice(0, 3), 'три верхние карты');
    effectAnswer(st, { card: deck[2] });
    const after = st.players[0].decks.event;
    eq(after[0], deck[2], 'выбранная карта наверху');
    eq(after.length, deck.length, 'колода не выросла и не уменьшилась');
    eq(after.slice().sort(), deck.slice().sort(), 'ни одна карта не пропала');
});

check('Адептус Арбитрес', 'бесплатный Штурмовик — только в дружественный мир с городом активной системы', () => {
    const st = inqOrder('deploy', { upgrades: ['Адептус Арбитрес'], units: { 'инквизиторские-штурмовики': 1 }, structures: ['city'], materiel: 2 });
    const sys = st.systems[0];
    st.pos = st.structures.find(s => s.seat === 0 && s.type === 'city').area;
    const other = sys.areas.find(a => a.world && a.pos !== st.pos);
    FS_RULES.addUnit(st, 0, 'инквизиторские-штурмовики', sys.id, other.pos);
    ok(burn(st, 'Адептус Арбитрес').ok, 'карта сгорела');
    const asked = [];
    effectAnswer(st, (s2, q) => {
        asked.push([q.op, q.kind, q.options]);
        if (q.kind === 'types') return { type: q.options[0] };
        if (q.kind === 'areas') return { area: q.options[0] };
        return null;
    });
    eq(asked[0] && asked[0][2], ['инквизиторские-штурмовики'], 'размещается Штурмовик');
    eq(asked[1] && asked[1][2], [{ system: sys.id, pos: st.pos }], 'только мир с городом');
    eq(myUnits(st).filter(u => u.area === st.pos).length, 2, 'Штурмовик размещён');
    eq(st.players[0].materiel, 2, 'бесплатно');
});

check('Неотвратимые раскопки', 'удар получает `any cube`; `morale cube` покупает ценный ресурс мира', () => {
    const run = faces => {
        const st = inqStrike({ upgrades: ['Неотвратимые раскопки'], assets: { cache: 0, forge: 0 } });
        const sys = st.systems[0];
        const world = FS_RULES.area(sys, st.strikeWorld).world;
        world.assets = ['cache'];
        const materiel = st.players[0].materiel;
        withFixedDice([faces[0]], () => ok(burn(st, 'Неотвратимые раскопки').ok, 'карта сгорела'));
        eq(ctx.StrikePlan.of(st.order).dice, [faces[0]], 'кубик карты ждёт удара');
        fire(st, faces.slice(1));
        return { st, materiel };
    };
    let { st, materiel } = run(['morale', 'att', 'att']);
    eq(ctx.StrikePlan.of(st.order).planned.pool, ['att', 'att', 'morale'], 'кубик карты в броске');
    let q = pending(st);
    eq([q && q.op, q && q.options], ['strikePayPick', ['0 кубиков', '1 кубик']], 'предложено потратить `morale cube`');
    effectAnswer(st, { choice: 1 });
    eq(st.players[0].assets.cache, 1, 'ценный ресурс мира получен');
    eq(st.players[0].materiel, materiel, 'материя мира не берётся');
    eq(ctx.StrikeDamage.of(st).hits, 2, 'урон удара не тронут');
    ({ st } = run(['att', 'att', 'def']));
    eq(pending(st), null, 'без `morale cube` платить нечем');
    eq(st.players[0].assets.cache, 0, 'ресурса нет');
    eq(ctx.StrikeDamage.of(st).hits, 2, 'кубик карты выпал на атаку — урон 2');
});

check('Страшный приговор', 'победитель боя этого приказа: противник уничтожает 1 деморализованный отряд до отступления', () => {
    const st = inqBattle({ card: 'Ослепляющий залп', units: { 'рыцари-немезиды': 2 }, foeUnits: { 'гвардейцы': 2, 'огрины': 1 }, dice: [], foeDice: [], roundEnd: true });
    st.players[0].upgrades = [{ name: 'Страшный приговор', used: false }];
    ok(burn(st, 'Страшный приговор').ok, 'карта сгорела во время боя приказа');
    eq(ctx.OrderFight.of(st.order).winnerDestroysRouted, true, 'приказ помнит обещание');
    routeFoe(st, 2);
    const guard = inqUnit(st, 'гвардейцы', 1);
    guard.routed = true;
    // The rounds go by: the Knights win on morale.
    let asked = null;
    for (let i = 0; i < 60 && st.combat && !asked; i++) {
        if (st.pending) {
            if (st.pending.question.op === 'destroy') { asked = st.pending; break; }
            answerAll(st, null, undefined, 1);
            continue;
        }
        const c = st.combat;
        const step = c.step;
        if (/^reinforce-/.test(step)) refuseReinforce(st);
        else if (step === 'choose-attacker') FS_RULES.apply(st, c.attacker, { type: 'combat', action: 'playCard', index: 0 });
        else if (step === 'choose-defender') FS_RULES.apply(st, c.defender, { type: 'combat', action: 'playCard', index: 0 });
        else if (/^damage-/.test(step)) {
            const side = step === 'damage-attacker' ? 'attacker' : 'defender';
            const seat = ctx.CombatHooks.of(c).assignSeat(c[side]);
            const targets = FS_RULES.damageCandidates(st, side).map(x => x.id);
            FS_RULES.apply(st, seat, { type: 'combat', action: 'damage', targets });
        } else if (step === 'round-end') FS_RULES.endCombatRound(st);
        else break;
    }
    ok(!!asked, 'после победы противника спросили об уничтожении');
    eq(asked.answerSeat === undefined ? asked.seat : asked.answerSeat, 1, 'выбирает противник');
    eq(asked.question.options.length, 2, 'на выбор только деморализованные отряды');
    effectAnswer(st, { units: [guard.id] });
    eq(foeUnits(st).length, 2, 'один отряд уничтожен');
    ok(!foeUnits(st).some(u => u.id === guard.id), 'уничтожен выбранный Гвардеец');
    ok(!st.combat || st.combat.step === 'retreat', 'затем — отступление');
});

head('Карты событий', INQ);

check('Наёмные головорезы', 'в конце шага подкреплений: атакуя — противник деморализует свой отряд, защищаясь — отступает одним', () => {
    let st = inqBattle({ card: 'Ослепляющий залп', units: { 'караул-смерти': 1 }, dice: ['att'], foeDice: ['def'], roundEnd: true });
    let card = FS_DATA.events.find(e => e.faction === INQ && e.name === 'Наёмные головорезы');
    FS_RULES.keepEventScheme(st, 0, card);
    eq(st.players[0].schemes[0].trigger, 'reinforce-end', 'план ждёт конца шага подкреплений');
    refuseReinforce(st);
    let q = pending(st);
    ok(!!q && q.kind === 'scheme', 'план предложен');
    let asked = [];
    effectAnswer(st, (s2, q2) => {
        asked.push([q2.op, answerSeat(s2)]);
        if (q2.kind === 'scheme') return { choice: 0 };
        if (q2.op === 'route') return { units: [q2.options[0]] };
        return null;
    });
    eq(asked, [[undefined, 0], ['route', 1]], 'противник сам выбирает, кого деморализовать');
    eq(foeUnits(st).filter(u => u.routed).length, 1, 'отряд противника деморализован');
    ok(!st.players[0].schemes.length, 'план сброшен');
    // In defence: the Guard attacks, one of his units leaves the battle.
    st = inqDefends({ foeCard: 'Ослепляющий залп' });
    guardWayOut(st);
    FS_RULES.keepEventScheme(st, 1, card);
    refuseReinforce(st);
    q = pending(st);
    ok(!!q && q.kind === 'scheme' && st.pending.seat === 1, 'план предложен защищающейся Инквизиции');
    asked = [];
    effectAnswer(st, (s2, q2) => {
        asked.push([q2.op, q2.kind, answerSeat(s2)]);
        if (q2.kind === 'scheme') return { choice: 0 };
        if (q2.op === 'retreat' && q2.kind === 'units') return { units: [q2.options[0]] };
        if (q2.op === 'retreat' && q2.kind === 'areas') return { area: q2.options[0] };
        return null;
    });
    eq(asked.slice(1), [['retreat', 'units', 0], ['retreat', 'areas', 0]], 'Гвардия сама выбирает отряд и область');
    const field = BattleField.of(st.combat);
    eq(myUnits(st).filter(u => u.system === field.system && u.area === field.pos && FS_RULES.unitOf(st, u).type === 'ground').length, 1, 'один Гвардеец ушёл из боя');
    eq(myUnits(st).filter(u => u.routed).length, 1, 'отступивший деморализован');
});

check('Элизианские войска', 'бесплатный Штурмовик: в неконтролируемый мир системы со своим кораблём — или в любой дружественный мир', () => {
    const run = branch => {
        const st = inqEvent('Элизианские войска', { units: { 'инквизиторские-штурмовики': 1 }, ships: { 'инквизиторские-крейсеры': 1 }, materiel: 2 });
        const far = st.systems[1];
        FS_RULES.addUnit(st, 0, 'инквизиторские-штурмовики', far.id, worldOf(st, far.id));
        ok(playEvent(st).ok, 'событие сыграно');
        let areas = null;
        let states = null;
        effectAnswer(st, (s2, q) => {
            if (q.kind === 'choice') return { choice: branch };
            if (q.kind === 'types') return { type: q.options[0] };
            if (q.kind === 'areas') {
                areas = q.options;
                // The state of the worlds is read while they are offered: the
                // placement makes the chosen one friendly.
                states = q.options.map(a => FS_RULES.areaState(s2, 0, a.system, a.pos));
                return { area: q.options[q.options.length - 1] };
            }
            return null;
        });
        eq(st.players[0].materiel, 2, 'бесплатно');
        eq(myUnits(st).filter(u => FS_RULES.unitOf(st, u).id === 'инквизиторские-штурмовики').length, 3, 'Штурмовик размещён');
        return { st, areas, states };
    };
    let { st, areas, states } = run(0);
    ok(areas.length > 0 && areas.every(a => a.system === st.sys), 'только миры системы с кораблём');
    ok(states.every(x => x === 'uncontrolled'), 'предложены неконтролируемые миры');
    ok(!areas.some(a => a.pos === st.pos), 'свой мир не предлагается');
    ({ st, areas, states } = run(1));
    eq(areas.map(a => a.system).sort(), [st.systems[0].id, st.systems[1].id].sort(), 'оба дружественных мира, в том числе другой системы');
    ok(states.every(x => x === 'friendly'), 'предложены только дружественные миры');
});

check('Догма Министорума', 'скидка на боевое улучшение — по системе без вражеских войск', () => {
    const st = inqEvent('Догма Министорума', { units: { 'инквизиторские-штурмовики': 1 }, structures: ['city'], materiel: 1 });
    const foeSystems = st.systems.slice(1, 4);
    for (const sys of foeSystems) FS_RULES.addUnit(st, 1, 'гвардейцы', sys.id, worldOf(st, sys.id));
    ok(playEvent(st).ok, 'событие сыграно');
    const q = pending(st);
    eq([q && q.op, q && q.kind], ['buyUpgrade', 'cards'], 'предложена покупка');
    eq(q.discount, st.systems.length - foeSystems.length, 'скидка за каждую систему без врага');
    ok(q.options.includes('Руководство по вере'), 'улучшение за 2 доступно с 1 материей');
    effectAnswer(st, (s2, q2) => (q2.op === 'buyUpgrade' ? { card: 'Руководство по вере' } : firstOption(s2, q2)));
    eq(st.players[0].materiel, 1, 'скидка покрыла цену');
    ok(FS_RULES.player(st, 0).combatDeck.cards().includes('Руководство по вере'), 'карта куплена');
});

check('Псионическая война', 'план раскрытия приказа: переворот улучшения противника — вручную', () => {
    const st = inqEvent('Псионическая война', { units: { 'инквизиторские-штурмовики': 1 } });
    ok(playEvent(st).ok, 'план взят');
    const plan = st.players[0].schemes.find(x => x.name === 'Псионическая война');
    ok(!!plan && plan.trigger === 'operations' && plan.note === true, 'план ждёт фазы действий и выполняется вручную');
    st.phase = 'operations';
    st.turn = 0;
    ok(FS_RULES.maybeScheme(st, 0, 'operations', { kind: 'order', ctx: null }), 'план предложен при раскрытии приказа');
    ok(/вручную/.test(pending(st).text), 'игроку сказано выполнить эффект вручную');
    effectAnswer(st, { choice: 0 });
    ok(!st.players[0].schemes.length, 'план сброшен');
});

check('Радикалы и пуритане', 'постройка со скидкой 1 — или своя постройка в материю со стоимостью плюс 1', () => {
    const factory = FS_RULES.structureStats('factory').cost;
    let st = inqEvent('Радикалы и пуритане', { units: { 'инквизиторские-штурмовики': 1 }, materiel: factory });
    const sys = st.systems[0];
    ok(playEvent(st).ok, 'событие сыграно');
    let asked = [];
    effectAnswer(st, (s2, q) => {
        asked.push(q.kind);
        if (q.kind === 'choice') return { choice: 0 };
        if (q.kind === 'structureTypes') return { type: 'factory' };
        if (q.kind === 'areas') return { area: q.options.find(a => a.system === sys.id && a.pos === st.pos) || q.options[0] };
        return null;
    });
    ok(asked.includes('structureTypes'), 'тип постройки на выбор');
    eq(st.structures.filter(s => s.seat === 0 && s.type === 'factory').length, 1, 'фабрика построена');
    eq(st.players[0].materiel, 1, 'цена фабрики минус 1');
    st = inqEvent('Радикалы и пуритане', { units: { 'инквизиторские-штурмовики': 1 }, structures: ['factory'], materiel: 0 });
    ok(playEvent(st).ok, 'событие сыграно');
    effectAnswer(st, (s2, q) => (q.kind === 'choice' ? { choice: 1 } : (q.kind === 'structures' ? { structure: q.options[0] } : null)));
    eq(st.structures.length, 0, 'фабрика уничтожена');
    eq(st.players[0].materiel, factory + 1, 'материя: стоимость плюс 1');
});

check('Теософия', 'карта просто сбрасывается', () => {
    const st = inqEvent('Теософия', { units: { 'инквизиторские-штурмовики': 1 }, materiel: 3 });
    const before = JSON.stringify([st.units, st.structures, st.players[0].assets]);
    ok(playEvent(st).ok, 'событие сыграно');
    eq(pending(st), null, 'вопросов нет');
    eq(st.players[0].materiel, 3, 'материя не изменилась');
    eq(JSON.stringify([st.units, st.structures, st.players[0].assets]), before, 'на карте ничего не изменилось');
    ok(st.players[0].decks.event.includes('Теософия'), 'карта замешана обратно в колоду');
    ok(!st.players[0].schemes.length, 'планом не стала');
});

check('Абсолютные полномочия', 'перед первым жетоном приказа: пятый жетон в этой фазе планирования', () => {
    const st = inqEvent('Абсолютные полномочия', { units: { 'инквизиторские-штурмовики': 1 } });
    ok(playEvent(st).ok, 'план взят');
    eq(st.players[0].schemes[0].trigger, 'planning', 'план ждёт планирования');
    FS_RULES.addUnit(st, 1, 'гвардейцы', st.systems[1].id, worldOf(st, st.systems[1].id));
    st.phase = 'planning';
    st.turn = 0;
    for (const p of st.players) { p.placedTokens = 0; p.placedOf = {}; }
    FS_RULES.offerPlanningSchemes(st, 0);
    ok(!!pending(st) && pending(st).kind === 'scheme', 'план предложен перед первым жетоном');
    effectAnswer(st, { choice: 0 });
    eq(FS_RULES.player(st, 0).ordersLeft(), 5, 'пять жетонов приказов');
    eq(FS_RULES.player(st, 1).ordersLeft(), 4, 'у противника четыре');
    const sys = st.systems[0];
    const results = ['advance', 'advance', 'deploy', 'deploy', 'strategize', 'strategize'].map(order => {
        st.turn = 0;
        return FS_RULES.apply(st, 0, { type: 'placeOrder', system: sys.id, order }).ok;
    });
    eq(results, [true, true, true, true, true, false], 'пятый жетон лёг, шестой — нет');
    FS_RULES.endRound(st);
    eq(FS_RULES.player(st, 0).ordersLeft(), 4, 'в следующем раунде снова четыре');
});

check('Триумфальный отход', 'после приказа продвижения: маркер цели Инквизиции в дружественном мире активной системы', () => {
    const st = inqEvent('Триумфальный отход', { units: { 'инквизиторские-штурмовики': 1 } });
    ok(playEvent(st).ok, 'план взят');
    const plan = st.players[0].schemes.find(x => x.name === 'Триумфальный отход');
    eq([plan && plan.trigger, plan && plan.orderType], ['order-end', 'advance'], 'план ждёт конца продвижения');
    const sys = st.systems[0];
    const far = st.systems[1];
    st.objectives = [
        { id: 'obj1', faction: INQ, system: sys.id, area: st.pos },
        { id: 'obj2', faction: INQ, system: far.id, area: worldOf(st, far.id) },
    ];
    FS_RULES.addUnit(st, 0, 'инквизиторские-штурмовики', far.id, worldOf(st, far.id));
    FS_RULES.addUnit(st, 1, 'гвардейцы', st.systems[2].id, worldOf(st, st.systems[2].id));
    st.phase = 'operations';
    st.turn = 0;
    st.order = null;
    sys.tokens.push({ seat: 0, order: 'advance', faceUp: false });
    // The Guard still has an order of his own: the round does not end here.
    st.systems[2].tokens.push({ seat: 1, order: 'deploy', faceUp: false });
    st.players[0].placedTokens = 1;
    st.players[1].placedTokens = 1;
    ok(FS_RULES.apply(st, 0, { type: 'resolveOrder', system: sys.id }).ok, 'продвижение раскрыто');
    FS_RULES.apply(st, 0, { type: 'endAdvance' });
    FS_RULES.apply(st, 0, { type: 'endAdvance' });
    const q = pending(st);
    ok(!!q && q.kind === 'scheme', 'план предложен после приказа');
    effectAnswer(st, { choice: 0 });
    eq(st.phase, 'operations', 'раунд не закончился — фаза обновления маркеров не трогала');
    eq(st.objectives.map(o => o.id), ['obj2'], 'взят маркер активной системы, маркер другой системы остался');
    eq(st.players[0].objectives, 1, 'маркер на планшете');
    ok(!st.players[0].schemes.length, 'план сброшен');
});

// ============================================================================
//  Космодесант (02/04/05/06): боевые карты, приказы, события, особенность.
//  Проверяются ветки движка, появившиеся в аудите фракции: отступление за
//  потраченные кубики, уничтожение деморализованного отряда противника с
//  откупом, перевод кубиков в мораль, размещение отряда наградой орбитального
//  удара с последующим боем, замена постройки, бастионы как фабрики, жетон за
//  битву в системе без дружественных миров, планы «вместо приказа» и «перед
//  орбитальным ударом», покупка улучшения со скидкой за бастионы.
// ============================================================================
const SM = 'космодесант';
const smBattle = (o = {}) => battle(Object.assign({ faction: SM, foeFaction: FOE,
    units: { 'космодесант': 2 }, foeUnits: { 'гвардейцы': 2 }, dice: ['att'], foeDice: ['def'] }, o));
const smPlay = (st, policy, index) => play(st, 0, index || 0, policy);
const smEvent = (name, o = {}) => eventState(name, Object.assign({ faction: SM, foeFaction: FOE }, o));
const smOrder = (kind, o = {}) => orderState(kind, Object.assign({ faction: SM, foeFaction: FOE }, o));
const smStrike = (o = {}) => strikeState(Object.assign({ faction: SM, foeFaction: FOE,
    ships: { 'ударные-крейсера': 1 }, upgrades: [] }, o));
/** The Marines defend: the Guard attacks with «Ложись!», the card of the check is in the hand of the defender. */
const smDefends = (o = {}) => battle(Object.assign({ faction: FOE, foeFaction: SM,
    units: { 'гвардейцы': 2 }, foeUnits: { 'космодесант': 2 },
    card: 'Ложись!', dice: ['att'], foeDice: ['def'], roundEnd: true }, o));
const smUnit = (st, id, seat) => st.units.find(u => u.seat === (seat || 0) && FS_RULES.unitOf(st, u).id === id) || null;
const smCard = name => FS_DATA.combat.find(x => x.faction === SM && x.name === name);
const smScheme = (st, name) => FS_RULES.keepEventScheme(st, 0, FS_DATA.events.find(c => c.faction === SM && c.name === name));
/** The log of the state as plain strings. */
const smLog = st => st.log.map(l => l.text || l);
/**
 * A way out of the battle world: a Strike Cruiser of the seat in a void of the
 * system. The attacker came by an Advance order, so his retreat is not tied to
 * the area he came from.
 */
const smWayOut = (st, seat) => {
    const who = seat || 0;
    const field = BattleField.of(st.combat);
    const voidNear = FS_RULES.areasAround(st, field.system, field.pos)
        .find(a => a.system === field.system && !FS_RULES.area(FS_RULES.system(st, a.system), a.pos).world);
    ok(!!voidNear, 'рядом с миром боя есть пустота той же системы');
    FS_RULES.addUnit(st, who, 'ударные-крейсера', voidNear.system, voidNear.pos);
    if (who === st.combat.attacker) st.combat.viaAdvance = true;
    const targets = FS_RULES.retreatTargets(st, who);
    ok(targets.length > 0, 'через пустоту с крейсером есть куда отступить');
    return targets[0];
};
/** The retreat of one unit: the policy names the unit and takes the first area. */
const smRetreat = (unitId, rest) => (st, q, trace) => {
    if (q.op === 'retreat' && q.kind === 'units') return { units: [unitId] };
    if (q.op === 'retreat' && q.kind === 'areas') return { area: q.options[0] };
    return rest ? rest(st, q, trace) : null;
};
/**
 * The battle is driven to the start of the damage step: the reinforcements
 * are refused, the cards are laid and turned over, their questions answered
 * by the policy. Stops at a question the policy leaves (a plan).
 */
function smToDamage(st, policy) {
    const c = st.combat;
    for (let i = 0; i < 40 && st.combat; i++) {
        if (st.pending) {
            const q = pending(st);
            if (q.kind === 'scheme') return 'scheme';
            answerAll(st, policy, undefined, 1);
            continue;
        }
        const step = c.step;
        if (step === 'damage-attacker' || step === 'damage-defender') return step;
        if (step === 'reinforce-attacker' || step === 'reinforce-defender') {
            const seat = step === 'reinforce-attacker' ? c.attacker : c.defender;
            FS_RULES.apply(st, seat, { type: 'combat', action: 'reinforce', count: 0 });
            continue;
        }
        if (step === 'choose-attacker' || step === 'choose-defender') {
            const side = step === 'choose-attacker' ? 'attacker' : 'defender';
            const seat = side === 'attacker' ? c.attacker : c.defender;
            if (!(c.cards[side].hand || []).length) { FS_RULES.advanceCombatSteps(st); continue; }
            FS_RULES.apply(st, seat, { type: 'combat', action: 'playCard', index: 0 });
            continue;
        }
        FS_RULES.advanceCombatSteps(st);
    }
    return st.combat ? st.combat.step : null;
}
/** The damage of the current step is assigned to the named units (or to the first candidate). */
function smDeal(st, ids) {
    const c = st.combat;
    const side = c.step === 'damage-attacker' ? 'attacker' : 'defender';
    const seat = ctx.CombatHooks.of(c).assignSeat(c[side]);
    const targets = ids || FS_RULES.damageCandidates(st, side).map(x => x.id).slice(0, 1);
    const r = FS_RULES.apply(st, seat, { type: 'combat', action: 'damage', targets });
    ok(r.ok, 'урон не назначен: ' + r.error);
    return r;
}
/**
 * The orbital strike of the tested player with fixed dice. A plan offered
 * before the roll («Экстерминатус») is answered by the policy, and the strike
 * is ordered again — the plan takes the place of the first command.
 */
function smFire(st, dice, policy) {
    const roll = FS_RULES.rollDice;
    FS_RULES.rollDice = (s, n) => (n === 1 ? [dice[0]] : dice.slice());
    try {
        const targets = FS_RULES.orbitalStrikeTargets(st, 0);
        const t = targets.find(x => x.pos === st.strikeWorld) || targets[0];
        let res = FS_RULES.apply(st, 0, { type: 'orbitalStrike', system: t.system, pos: t.pos });
        ok(res.ok, 'удар не нанесён: ' + res.error);
        if (pending(st) && pending(st).kind === 'scheme') {
            deAnswer(st, policy, 1);
            if (!st.pending) {
                res = FS_RULES.apply(st, 0, { type: 'orbitalStrike', system: t.system, pos: t.pos });
                ok(res.ok, 'удар после плана не нанесён: ' + res.error);
            }
        }
        if (st.pending) deAnswer(st, policy, 12);
        return t;
    } finally { FS_RULES.rollDice = roll; }
}

head('Разбор текстов', SM);
check('Все карты', '14 боевых, 5 приказов, 8 событий и способность; ни один текст не остался пояснением', () => {
    eq(FS_DATA.combat.filter(c => c.faction === SM).length, 14, 'боевых карт');
    eq(FS_DATA.orders.filter(c => c.faction === SM).length, 5, 'улучшений приказов');
    eq(FS_DATA.events.filter(c => c.faction === SM).length, 8, 'событий');
    const f = FS_DATA.factions.find(x => x.id === SM);
    const texts = [['ability', 'ability', FS_EFFECTS.abilityFor(f)]];
    for (const c of FS_DATA.combat.filter(x => x.faction === SM)) {
        texts.push(['combat:' + c.name + ':general', 'combat', c.general]);
        if (c.unit) texts.push(['combat:' + c.name + ':unit', 'combat', c.unit]);
    }
    for (const c of FS_DATA.orders.filter(x => x.faction === SM)) texts.push(['order:' + c.name, 'order', c.text]);
    for (const c of FS_DATA.events.filter(x => x.faction === SM)) texts.push(['event:' + c.name, 'event', c.text]);
    const bad = [];
    for (const [key, kind, raw] of texts) {
        const steps = Array.isArray(raw) ? raw : FS_EFFECTS.parse(raw || '', { kind, faction: SM });
        if (!steps.length) bad.push(key + ':пусто');
        for (const s of steps) {
            if (s && (s.op === 'note' || s.op === 'manual' || s.manual === true || s.note === true)) {
                bad.push(key + ':' + (s.op || '?'));
            }
        }
    }
    return eq(bad, [], 'неразобранные тексты');
});

head('Боевая колода', SM);

check('Вера в Императора', '1 `any cube`; отряд: либо восстановить 1 свой отряд, либо `morale cube`', () => {
    let st = smBattle({ card: 'Вера в Императора', routed: [1] });
    smPlay(st, branch(0));
    eq(dice(st, 'attacker').length, 2, 'кубик получен');
    eq(myUnits(st).filter(u => u.routed).length, 0, 'деморализованный Космодесантник восстановлен');
    st = smBattle({ card: 'Вера в Императора', routed: [1] });
    withFixedDice(['def'], () => smPlay(st, branch(1)));
    eq(count(st, 'attacker', 'morale'), 1, 'кубик морали получен');
    eq(myUnits(st).filter(u => u.routed).length, 1, 'отряд не восстановлен');
    // The requisite of the line is an unrouted unit: two routed Marines have no ability.
    st = smBattle({ card: 'Вера в Императора', routed: [0, 1] });
    const trace = smPlay(st, branch(0));
    eq(trace.filter(t => t.kind === 'choice').length, 0, 'без недеморализованного отряда ветка не предлагается');
    return eq(myUnits(st).filter(u => u.routed).length, 2, 'оба отряда остались деморализованными');
});

check('Благословленная броня', '2 `def. token`; отряд: до 2 своих кубиков переворачиваются на `def. cube`', () => {
    const st = smBattle({ card: 'Благословленная броня', units: { 'космодесант': 1 }, dice: ['att', 'morale', 'att'] });
    const trace = smPlay(st, (s, q) => (q.op === 'flipDie' && q.kind === 'dice' ? { dice: [0, 1] } : null));
    eq(tokens(st, 'attacker').def, 2, 'два жетона обороны');
    const q = trace.find(t => t.op === 'flipDie');
    eq([q.kind, q.options.length], ['dice', 3], 'предложены все три кубика');
    return eq(dice(st, 'attacker'), ['def', 'def', 'att'], 'два кубика стали обороной');
});

check('Благословленная броня', 'переворот — право, не обязанность: пустой ответ оставляет кубики', () => {
    const st = smBattle({ card: 'Благословленная броня', units: { 'космодесант': 1 }, dice: ['att', 'morale'] });
    smPlay(st, (s, q) => (q.op === 'flipDie' && q.kind === 'dice' ? { dice: [] } : null));
    return eq(dice(st, 'attacker'), ['att', 'morale'], 'кубики не тронуты');
});

check('Ярость Ультрамара', 'противник перебрасывает 1 `def. cube`, затем свой `def. cube` можно перебросить; отряд: противник теряет 2 `def. token`', () => {
    const st = smBattle({ card: 'Ярость Ультрамара', units: { 'космодесант': 1 }, dice: ['def', 'att'], foeDice: ['def', 'def', 'att'] });
    st.combat.tokens.defender.def = 3;
    const trace = withFixedDice(['morale'], () => smPlay(st, branch(1)));
    const rerolls = trace.filter(t => t.op === 'rerollDie');
    eq(rerolls.map(t => t.seat), [1, 0], 'сначала перебрасывает противник, затем игрок');
    eq(rerolls[0].options, [0, 1], 'противнику предложены только его кубики обороны');
    eq(dice(st, 'defender'), ['morale', 'def', 'att'], 'противник перебросил один кубик обороны');
    eq(dice(st, 'attacker'), ['morale', 'att'], 'свой кубик обороны перeброшен');
    return eq(tokens(st, 'defender').def, 1, 'противник потерял два жетона обороны');
});

check('Ярость Ультрамара', 'отряд: по выбору игрока противник теряет 1 `def. cube`', () => {
    const st = smBattle({ card: 'Ярость Ультрамара', units: { 'космодесант': 1 }, dice: ['att'], foeDice: ['def', 'def', 'att'] });
    const trace = withFixedDice(['morale'], () => smPlay(st, branch(0)));
    eq(trace.filter(t => t.op === 'rerollDie' && t.seat === 0).length, 0, 'без своего `def. cube` переброса не предложено');
    return eq(dice(st, 'defender'), ['morale', 'att'], 'противник потерял один кубик обороны после переброса');
});

// The Guard answers with «Ложись!» (the filler of `roundEnd`): its `any cube`
// is pinned to morale, its printed `def icon` is one shield. Two Scouts with
// «Засада»: 1 `att. cube` + 2 `att. token` + 1 `att icon` = 4 against 2
// shields — two damage to an Ogryn of 4 health rout him.
const smAmbush = () => {
    const st = smBattle({ card: 'Засада', units: { 'скауты': 2 }, foeUnits: { 'огрины': 1 },
        dice: ['att'], foeDice: ['morale', 'def'], roundEnd: true });
    eq(withFixedDice(['morale'], () => smToDamage(st, null)), 'damage-defender', 'шаг урона Огрина');
    return st;
};
check('Засада', '2 `att. token`; отряд: деморализованный в этом раунде отряд противника гибнет, если владелец не платит `morale cube`', () => {
    const st = smAmbush();
    eq(tokens(st, 'attacker').att, 2, 'два жетона атаки');
    eq(FS_RULES.combatDamageFor(st, 'defender'), 2, 'два урона Огрину');
    smDeal(st, [foeUnits(st)[0].id]);
    const q = pending(st);
    eq([q.op, q.kind, answerSeat(st)], ['avoid', 'yesno', 1], 'владельцу предложено откупиться кубиком морали');
    eq(q.options, [0, 2], 'предложены именно `morale cube`');
    ok(FS_RULES.apply(st, 1, { type: 'effect', answer: { no: true } }).ok, 'отказ принят');
    ok(smLog(st).some(l => /деморализованный отряд уничтожен/.test(l)), 'уничтожение записано в журнал');
    return eq(foeUnits(st).length, 0, 'деморализованный Огрин уничтожен');
});

check('Засада', 'откуп `morale cube` оставляет отряд деморализованным', () => {
    const st = smAmbush();
    smDeal(st, [foeUnits(st)[0].id]);
    eq(count(st, 'defender', 'morale'), 2, 'у противника два кубика морали');
    ok(FS_RULES.apply(st, 1, { type: 'effect', answer: { dice: [0] } }).ok, 'откуп принят');
    eq(count(st, 'defender', 'morale'), 1, 'кубик морали потрачен');
    return eq(foeUnits(st).map(u => !!u.routed), [true], 'Огрин жив и деморализован');
});

check('Разведка', 'в атаке: закрытая карта противника подсмотрена, 2 `att. token` или 2 `def. token`', () => {
    let st = smBattle({ card: 'Разведка', units: { 'скауты': 2 } });
    smPlay(st, branch(0));
    ok(smLog(st).some(l => /подсмотрел закрытую карту противника/.test(l)), 'карта противника подсмотрена');
    eq(tokens(st, 'attacker').att, 2, 'два жетона атаки');
    st = smBattle({ card: 'Разведка', units: { 'скауты': 2 } });
    smPlay(st, branch(1));
    return eq(tokens(st, 'attacker').def, 2, 'два жетона обороны');
});

check('Разведка', 'в защите: карта не подсматривается, жетоны — всё равно', () => {
    const st = smDefends({ foeCard: 'Разведка', foeUnits: { 'скауты': 2 } });
    const trace = play(st, 1, 0, branch(1));
    ok(!smLog(st).some(l => /подсмотрел/.test(l)), 'в защите подсмотра нет');
    eq(trace.filter(t => t.kind === 'choice' && t.seat === 1).length, 1, 'выбор жетонов предложен защитнику');
    const me = st.players[1].name;
    return ok(smLog(st).some(l => l === me + ' получает 2 жетонов обороны.'), 'жетоны получены и защитником');
});

check('Разведка', 'отряд: `morale cube` покупает отступление одним своим отрядом', () => {
    const st = smBattle({ card: 'Разведка', units: { 'скауты': 2 }, dice: ['morale', 'att'] });
    const near = smWayOut(st, 0);
    const scout = myUnits(st)[0];
    const trace = smPlay(st, smRetreat(scout.id, branch(0)));
    eq(trace.filter(t => t.op === 'retreat').map(t => t.kind), ['units', 'areas'], 'выбраны отряд и область');
    eq(count(st, 'attacker', 'morale'), 0, 'кубик морали потрачен');
    const moved = stateUnit(st, scout.id);
    eq([moved.system, moved.area, moved.routed], [near.system, near.pos, true], 'Скаут отступил и деморализован');
    return eq(BattleField.of(st.combat).units(st, 0).length, 1, 'второй Скаут остался в бою');
});

check('Разведка', 'без `morale cube` отступление не предлагается', () => {
    const st = smBattle({ card: 'Разведка', units: { 'скауты': 2 }, dice: ['att'] });
    smWayOut(st, 0);
    const trace = smPlay(st, branch(0));
    eq(trace.filter(t => t.op === 'retreat').length, 0, 'вопроса об отступлении нет');
    return eq(BattleField.of(st.combat).units(st, 0).length, 2, 'оба Скаута в бою');
});

check('Скауты ветераны', 'за каждый `morale cube` — `att. token` или `def. token`, выбор для каждого кубика свой', () => {
    let st = smBattle({ card: 'Скауты ветераны', units: { 'скауты': 2 }, dice: ['morale', 'morale', 'att'] });
    let n = 0;
    const keep = (s, q) => (q.op === 'spendDie' ? { dice: [] } : null);
    const trace = smPlay(st, (s, q) => (q.kind === 'choice' ? { choice: (n++) % 2 } : keep(s, q)));
    eq(trace.filter(t => t.kind === 'choice').length, 2, 'два вопроса — по одному на кубик');
    eq([tokens(st, 'attacker').att, tokens(st, 'attacker').def], [1, 1], 'жетон атаки и жетон обороны');
    eq(count(st, 'attacker', 'morale'), 2, 'кубики морали не тратятся');
    st = smBattle({ card: 'Скауты ветераны', units: { 'скауты': 2 }, dice: ['att'] });
    const none = smPlay(st, branch(0, keep));
    eq(none.filter(t => t.kind === 'choice').length, 0, 'без кубиков морали вопроса нет');
    return eq([tokens(st, 'attacker').att, tokens(st, 'attacker').def], [0, 0], 'жетонов нет');
});

check('Скауты ветераны', 'отряд: за каждый потраченный `morale cube` отступает 1 свой отряд', () => {
    const st = smBattle({ card: 'Скауты ветераны', units: { 'скауты': 3 }, dice: ['morale', 'morale', 'att'] });
    const near = smWayOut(st, 0);
    const [a, b] = myUnits(st);
    let turn = 0;
    const trace = smPlay(st, (s, q) => {
        if (q.op === 'spendDie') return { dice: [0, 1] };
        if (q.op === 'retreat' && q.kind === 'units') return { units: [(turn++ === 0 ? a : b).id] };
        if (q.op === 'retreat' && q.kind === 'areas') return { area: q.options.find(x => x.system === near.system && x.pos === near.pos) || q.options[0] };
        return null;
    });
    eq(trace.filter(t => t.op === 'retreat' && t.kind === 'units').length, 2, 'два отступления за два кубика');
    eq(count(st, 'attacker', 'morale'), 0, 'оба кубика морали потрачены');
    eq([stateUnit(st, a.id).routed, stateUnit(st, b.id).routed], [true, true], 'оба отступивших деморализованы');
    return eq(BattleField.of(st.combat).units(st, 0).length, 1, 'третий Скаут остался в бою');
});

check('Слава Императора', '2 `any cube`; отряд: все свои деморализованные отряды восстановлены, любые кубики — в `morale cube`', () => {
    const st = smBattle({ card: 'Слава Императора', units: { 'титаны-класса-варлорд': 1, 'космодесант': 2 },
        dice: ['att', 'def', 'att'], routed: [1, 2] });
    const trace = withFixedDice(['def', 'def'], () => smPlay(st, (s, q) => (q.op === 'flipDie' && q.kind === 'dice' ? { dice: [0, 1] } : null)));
    eq(dice(st, 'attacker').length, 5, 'два кубика получены');
    eq(myUnits(st).filter(u => u.routed).length, 0, 'оба деморализованных отряда восстановлены');
    const q = trace.find(t => t.op === 'flipDie');
    eq(q.options.length, 5, 'предложены все кубики, включая полученные');
    return eq(dice(st, 'attacker').slice(0, 3), ['morale', 'morale', 'att'], 'выбранные кубики стали моралью');
});

check('Мощь Императора', 'отряд: любое число `att. cube` — по 2 `att. token` за каждый', () => {
    const st = smBattle({ card: 'Мощь Императора', units: { 'титаны-класса-варлорд': 1 }, dice: ['att', 'att', 'def'] });
    const trace = withFixedDice(['def', 'def'], () => smPlay(st, (s, q) => (q.op === 'spendDie' ? { dice: [0, 1] } : null)));
    const q = trace.find(t => t.op === 'spendDie');
    ok(!q.options.includes(2), 'кубик обороны потратить нельзя');
    eq(tokens(st, 'attacker').att, 4, 'четыре жетона атаки за два кубика');
    return eq(count(st, 'attacker', 'att'), 0, 'кубики атаки потрачены');
});

check('Держать строй', '2 `def. token`; в обороне восстанавливается 1 отряд; отряд: `def. cube` или `morale cube`', () => {
    let st = smDefends({ foeCard: 'Держать строй', foeDice: ['att'] });
    foeUnits(st)[1].routed = true;
    play(st, 1, 0, branch(0));
    const me = st.players[1].name;
    ok(smLog(st).some(l => l === me + ' получает 2 жетонов обороны.'), 'два жетона обороны');
    eq(foeUnits(st).filter(u => u.routed).length, 0, 'защитник восстановил отряд');
    eq(count(st, 'defender', 'def'), 1, 'кубик обороны получен');
    st = smBattle({ card: 'Держать строй', routed: [1] });
    play(st, 0, 0, branch(1));
    eq(myUnits(st).filter(u => u.routed).length, 1, 'в атаке восстановления нет');
    return eq(count(st, 'attacker', 'morale'), 1, 'кубик морали получен');
});

check('Слава и смерть', '2 `att. token`; в атаке восстанавливается 1 отряд; отряд: противник теряет `def. cube` или `morale cube` по выбору игрока', () => {
    let st = smBattle({ card: 'Слава и смерть', routed: [1], foeDice: ['def', 'morale'] });
    smPlay(st, branch(1));
    eq(tokens(st, 'attacker').att, 2, 'два жетона атаки');
    eq(myUnits(st).filter(u => u.routed).length, 0, 'атакующий восстановил отряд');
    eq(dice(st, 'defender'), ['def'], 'противник потерял кубик морали');
    st = smDefends({ foeCard: 'Слава и смерть', dice: ['def', 'morale'], foeDice: ['att'] });
    foeUnits(st)[1].routed = true;
    withFixedDice(['att'], () => play(st, 1, 0, branch(0)));
    eq(foeUnits(st).filter(u => u.routed).length, 1, 'в обороне восстановления нет');
    return eq(dice(st, 'attacker'), ['morale', 'att'], 'противник потерял кубик обороны, кубик «Ложись!» остался');
});

/**
 * The first round of the battle is played to its end: the damage of each step
 * goes to the first candidate. Returns the sides whose damage was assigned.
 */
function smFirstRound(st) {
    const dealt = [];
    for (let i = 0; i < 40 && st.combat && st.combat.round === 1; i++) {
        if (st.pending) { answerAll(st, null, undefined, 1); continue; }
        const step = st.combat.step;
        if (/^damage-/.test(step)) {
            const side = step === 'damage-attacker' ? 'attacker' : 'defender';
            const able = FS_RULES.damageCandidates(st, side).map(x => x.id);
            if (!able.length || FS_RULES.combatDamageFor(st, side) <= 0) { FS_RULES.advanceCombatSteps(st); continue; }
            dealt.push(side);
            smDeal(st, able.slice(0, 1));
            continue;
        }
        if (step === 'round-end') { FS_RULES.endCombatRound(st); continue; }
        if (smToDamage(st, null) === null) break;
    }
    return dealt;
}
// One Marine (3 health) against an Ogryn with four `att. cube` and «Ложись!»
// (its `any cube` pinned to morale): the hit is nonlethal with either card of
// the Marine — «Не ведать страха» shields two, «Благословленная броня» three.
const smFearless = card => smBattle({ card, units: { 'космодесант': 1 }, foeUnits: { 'огрины': 1 },
    dice: [], foeDice: ['att', 'att', 'att', 'att'], roundEnd: true });
check('Не ведать страха', 'в этом раунде свои отряды не становятся деморализованными от урона', () => {
    const st = smFearless('Не ведать страха');
    const dealt = withFixedDice(['morale'], () => smFirstRound(st));
    eq(dealt, ['attacker'], 'урон Космодесантнику назначен');
    eq(st.combat.round, 2, 'раунд окончен');
    return eq(myUnits(st).map(u => !!u.routed), [false], 'Космодесантник не деморализован');
});

check('Не ведать страха', 'без карты тот же удар деморализует отряд', () => {
    const st = smFearless('Благословленная броня');
    const dealt = withFixedDice(['morale'], () => smFirstRound(st));
    eq(dealt, ['attacker'], 'урон назначен Космодесантнику');
    return eq(myUnits(st).map(u => !!u.routed), [true], 'Космодесантник деморализован');
});

check('Не ведать страха', 'отряд: `morale cube` восстанавливает все свои отряды', () => {
    const st = smBattle({ card: 'Не ведать страха', units: { 'космодесант': 2, 'скауты': 1 }, dice: ['morale', 'att'], routed: [0, 2] });
    smPlay(st);
    eq(count(st, 'attacker', 'morale'), 0, 'кубик морали потрачен');
    return eq(myUnits(st).filter(u => u.routed).length, 0, 'все отряды восстановлены');
});

check('Бронекулак', '1 `any cube`; отряд: шаг урона повторяется, урон наносят обе стороны', () => {
    // Land Raider: 2 `att. cube` + 1 `any cube` (pinned to attack) + 2 `att icon`
    // against the `def icon` of «Ложись!» — four damage: an Ogryn of 4 health
    // falls in each step. The Ogryns: 1 `att. cube` + `any cube` (attack) against
    // the `def icon` of the card — one damage to the Land Raider in each step.
    const st = smBattle({ card: 'Бронекулак', units: { 'ленд-рейдеры': 1 }, foeUnits: { 'огрины': 2 },
        dice: ['att', 'att'], foeDice: ['att'], roundEnd: true });
    eq(withFixedDice(['att'], () => smToDamage(st, null)), 'damage-attacker', 'шаг урона');
    eq(dice(st, 'attacker').length, 3, 'кубик получен');
    const dealt = withFixedDice(['att'], () => smFirstRound(st));
    ok(smLog(st).some(l => /Шаг нанесения повреждений повторяется/.test(l)), 'повтор шага объявлен');
    eq(dealt, ['attacker', 'defender', 'attacker', 'defender'], 'обе стороны получают урон дважды');
    eq(foeUnits(st).length, 0, 'за два шага уничтожены оба Огрина');
    return eq(myUnits(st).map(u => !!u.routed), [true], 'Ленд Рейдер деморализован вторым ударом');
});

check('Десантный модуль', 'отряд: `morale cube` переносит Скаута или Космодесантника из любого мира в мир боя', () => {
    const st = smBattle({ card: 'Десантный модуль', units: { 'космодесант': 1 }, dice: ['morale', 'att'] });
    const far = st.systems.find(s => s.id !== st.combat.system && s.areas.some(a => a.world));
    const scout = FS_RULES.addUnit(st, 0, 'скауты', far.id, worldOf(st, far.id));
    FS_RULES.addUnit(st, 0, 'ленд-рейдеры', far.id, worldOf(st, far.id));
    const trace = withFixedDice(['def'], () => smPlay(st));
    const q = trace.find(t => t.op === 'moveUnit' && t.kind === 'units');
    eq(q.options, [scout.id], 'предложен только Скаут — Ленд Рейдер не переносится');
    const field = BattleField.of(st.combat);
    const moved = stateUnit(st, scout.id);
    eq([moved.system, moved.area], [field.system, field.pos], 'Скаут в мире боя');
    eq(field.units(st, 0).length, 2, 'Скаут участвует в бою');
    return eq(count(st, 'attacker', 'morale'), 0, 'кубик морали потрачен');
});

check('Прорвать фронт', 'до 3 `morale cube` — за каждый `att. cube` или `def. cube` на выбор; отряд: противник сбрасывает свою открытую карту', () => {
    const st = smBattle({ card: 'Прорвать фронт', units: { 'ленд-рейдеры': 1 }, foeCard: 'За Императора!',
        dice: ['morale', 'morale', 'morale', 'morale'], roundEnd: true });
    let n = 0;
    const trace = smPlay(st, (s, q) => {
        if (q.op === 'spendDie') return { dice: [0, 1, 2] };
        if (q.kind === 'choice') return { choice: (n++) % 2 };
        return null;
    });
    eq(trace.find(t => t.op === 'spendDie').options.length, 4, 'предложены все кубики морали');
    eq(trace.filter(t => t.kind === 'choice').length, 3, 'три выбора — по одному на потраченный кубик');
    eq(dice(st, 'attacker'), ['morale', 'att', 'def', 'att'], 'один кубик морали остался, три новых — по выбору');
    const discard = trace.find(t => t.op === 'discardFoeCard');
    eq([discard.seat, discard.options], [1, ['За Императора!']], 'противник сам выбирает свою открытую карту');
    ok(smLog(st).some(l => /«За Императора!» сброшена/.test(l)), 'карта противника сброшена');
    return eq(tokens(st, 'defender').def, 0, 'сброшенная карта не сработала');
});

head('Улучшения приказов', SM);

check('Десантный модуль', 'бастион не спасает от удара; 2 `def. cube` размещают Космодесантника в мире удара, затем бой', () => {
    const st = smStrike({ upgrades: ['Десантный модуль'], foeStructures: ['bastion'], foeUnits: { 'гвардейцы': 2 } });
    ok(burn(st, 'Десантный модуль').ok, 'карта сожжена');
    eq(st.order.ignoreBastion, true, 'бастион противника не предотвращает удар');
    const supply = st.players[0].supply.units['космодесант'];
    smFire(st, ['def', 'def'], (s, q) => (q.op === 'strikePayPick' ? { choice: 1 } : null));
    const landed = myUnits(st).find(u => FS_RULES.unitOf(st, u).id === 'космодесант');
    ok(!!landed && landed.area === st.strikeWorld, 'Космодесантник стоит в мире удара');
    eq(st.players[0].supply.units['космодесант'], supply - 1, 'взят из запаса');
    eq(st.players[0].materiel, FS_RULES.newReadyGame({ seed: 5, players: players(SM, FOE) }).players[0].materiel, 'размещение бесплатно');
    // The strike dealt no damage: the order is over and the battle for the world begins at once.
    ok(!!st.combat, 'бой начался');
    const field = BattleField.of(st.combat);
    eq([field.system, field.pos, st.combat.attacker], [st.systems[0].id, st.strikeWorld, 0], 'бой в мире удара, атакует Космодесант');
    eq(field.units(st, 0).map(u => u.id), [landed.id], 'в бою — высадившийся Космодесантник');
    return eq(st.players[0].upgrades[0].used, true, 'улучшение потрачено');
});

check('Десантный модуль', 'без 2 `def. cube` размещения нет; отказ от оплаты оставляет кубики удару', () => {
    let st = smStrike({ upgrades: ['Десантный модуль'], foeUnits: { 'гвардейцы': 1 } });
    burn(st, 'Десантный модуль');
    smFire(st, ['def', 'att'], null);
    eq(myUnits(st).filter(u => FS_RULES.unitOf(st, u).id === 'космодесант').length, 0, 'один `def. cube` ничего не покупает');
    st = smStrike({ upgrades: ['Десантный модуль'], foeUnits: { 'гвардейцы': 1 } });
    burn(st, 'Десантный модуль');
    smFire(st, ['def', 'def'], (s, q) => (q.op === 'strikePayPick' ? { choice: 0 } : null));
    eq(myUnits(st).filter(u => FS_RULES.unitOf(st, u).id === 'космодесант').length, 0, 'отказ — Космодесантник не размещён');
    return eq(!!st.combat, false, 'боя нет');
});

check('Огненный дождь', 'во время удара: +1 `any cube`, 1 `morale cube` переворачивается на `att. cube`', () => {
    const st = smStrike({ upgrades: ['Огненный дождь'], foeUnits: { 'огрины': 1 } });
    st.order.strikeDice = ['morale', 'att'];
    const res = withFixedDice(['def'], () => burn(st, 'Огненный дождь'));
    ok(res.ok, 'карта не сожжена: ' + res.error);
    if (st.pending) deAnswer(st, null, 4);
    eq(st.order.strikeDice, ['att', 'att', 'def'], 'кубик добавлен, мораль стала атакой');
    return eq(st.players[0].upgrades[0].used, true, 'улучшение потрачено');
});

check('Направлять верующих', 'при раскрытии приказа 1 постройка системы заменяется на любую другую', () => {
    const st = smOrder('strategize', { upgrades: ['Направлять верующих'], units: { 'скауты': 1 }, structures: ['city'] });
    const bastions = FS_RULES.structurePoolLeft(st, 'bastion');
    ok(burn(st, 'Направлять верующих').ok, 'карта сожжена');
    let q = pending(st);
    eq([q.op, q.kind, q.options], ['replaceStructure', 'structures', ['str0']], 'спрашивает постройку системы');
    effectAnswer(st, { structure: 'str0' }, 1);
    q = pending(st);
    eq([q.op, q.kind], ['replaceStructureType', 'structureTypes'], 'затем — новый тип постройки');
    ok(!q.options.includes('city'), 'тот же тип не предлагается');
    effectAnswer(st, { type: 'bastion' });
    eq(st.structures.map(s => s.type), ['bastion'], 'город стал бастионом');
    eq(FS_RULES.structurePoolLeft(st, 'bastion'), bastions - 1, 'бастион взят из коробки');
    return eq(FS_RULES.structurePoolLeft(st, 'city'), 15, 'город вернулся в коробку');
});

check('Направлять верующих', 'без построек в системе карта молчит; закончившийся тип не предлагается', () => {
    let st = smOrder('strategize', { upgrades: ['Направлять верующих'], units: { 'скауты': 1 } });
    ok(burn(st, 'Направлять верующих').ok, 'карта сожжена');
    eq(st.pending, null, 'заменять нечего — вопроса нет');
    st = smOrder('strategize', { upgrades: ['Направлять верующих'], units: { 'скауты': 1 }, structures: ['city'] });
    // The box is empty of bastions: every bastion of the pool stands on the table.
    const far = st.systems[2];
    for (let i = FS_RULES.structurePoolLeft(st, 'bastion'); i > 0; i--) {
        st.structures.push({ id: 'b' + i, seat: 1, type: 'bastion', system: far.id, area: worldOf(st, far.id) });
    }
    eq(FS_RULES.structurePoolLeft(st, 'bastion'), 0, 'бастионов в коробке нет');
    burn(st, 'Направлять верующих');
    effectAnswer(st, { structure: 'str0' }, 1);
    return eq(pending(st).options, ['factory'], 'бастионов в коробке нет — остаётся фабрика');
});

check('Миры призыва', 'бастионы активной системы считаются фабриками, лимит развёртывания −1 за каждый', () => {
    let st = smOrder('deploy', { upgrades: ['Миры призыва'], units: { 'скауты': 1 }, structures: ['bastion'] });
    eq(FS_RULES.hasFactory(st, 0, st.systems[0].id), false, 'фабрики в системе нет');
    const limit = FS_RULES.deployLimit(st, 0, st.systems[0].id);
    ok(burn(st, 'Миры призыва').ok, 'карта сожжена');
    eq(FS_RULES.hasFactory(st, 0, st.systems[0].id), true, 'бастион считается фабрикой');
    eq(FS_RULES.deployLimit(st, 0, st.systems[0].id), Math.max(0, limit) + 4 - 1 - Math.max(0, limit), 'лимит мира за вычетом одного бастиона');
    st = smOrder('deploy', { upgrades: ['Миры призыва'], units: { 'скауты': 1 }, structures: ['bastion', 'factory'],
        before: (s, sys) => {
            const other = sys.areas.find(a => a.world && a.pos !== worldOf(s, sys.id));
            s.structures.push({ id: 'str9', seat: 0, type: 'bastion', system: sys.id, area: other.pos });
        } });
    const before = FS_RULES.deployLimit(st, 0, st.systems[0].id);
    const other = st.structures.find(s => s.id === 'str9');
    const otherCapacity = FS_RULES.capacity(st, other.system, other.area);
    burn(st, 'Миры призыва');
    ok(smLog(st).some(l => /лимит развертывания -2 \(бастионов в активной системе: 2\)/.test(l)), 'минус два записано в журнал');
    return eq(FS_RULES.deployLimit(st, 0, st.systems[0].id), before + otherCapacity - 2,
        'второй бастион тоже стал фабрикой своего мира, затем минус два');
});

check('Миры призыва', 'без бастионов лимит не меняется', () => {
    const st = smOrder('deploy', { upgrades: ['Миры призыва'], units: { 'скауты': 1 }, structures: ['factory'] });
    const before = FS_RULES.deployLimit(st, 0, st.systems[0].id);
    burn(st, 'Миры призыва');
    return eq(FS_RULES.deployLimit(st, 0, st.systems[0].id), before, 'лимит прежний');
});

check('Крестовый поход', 'жетон подкрепления за битву приказа в системе без дружественных миров', () => {
    const st = smOrder('advance', { upgrades: ['Крестовый поход'], units: { 'космодесант': 2 }, foeUnits: { 'гвардейцы': 1 } });
    ok(burn(st, 'Крестовый поход').ok, 'карта сожжена');
    eq(st.players[0].assets.reinforcement, 0, 'жетон ждёт битвы');
    const sys = st.systems[0];
    FS_RULES.startCombat(st, 0, 1, sys.id, worldOf(st, sys.id));
    eq(st.players[0].assets.reinforcement, 1, 'жетон получен с началом битвы');
    return ok(smLog(st).some(l => /reinforcement × 1 за битву этого приказа/.test(l)), 'выдача записана в журнал');
});

check('Крестовый поход', 'в системе с дружественным миром жетона нет', () => {
    const st = smOrder('advance', { upgrades: ['Крестовый поход'], units: { 'космодесант': 2 }, foeUnits: { 'гвардейцы': 1 } });
    const sys = st.systems[0];
    const other = sys.areas.find(a => a.world && a.pos !== worldOf(st, sys.id));
    FS_RULES.addUnit(st, 0, 'скауты', sys.id, other.pos);
    eq(FS_RULES.control(st, 0, sys.id, other.pos), 'friendly', 'второй мир системы дружественный');
    burn(st, 'Крестовый поход');
    FS_RULES.startCombat(st, 0, 1, sys.id, worldOf(st, sys.id));
    eq(st.players[0].assets.reinforcement, 0, 'жетона нет');
    return ok(smLog(st).some(l => /есть дружественный мир — жетон не получен/.test(l)), 'причина записана в журнал');
});

head('Карты событий', SM);

check('Экстерминатус', 'план; перед орбитальным ударом все брошенные кубики становятся `att. cube`', () => {
    let st = smEvent('Экстерминатус', { units: { 'скауты': 1 } });
    ok(playEvent(st).ok, 'план взят');
    eq(st.players[0].schemes.map(s => [s.name, s.trigger]), [['Экстерминатус', 'strike']], 'план ждёт орбитального удара');
    st = smStrike({ foeUnits: { 'огрины': 1 } });
    smScheme(st, 'Экстерминатус');
    smFire(st, ['def', 'morale'], (s, q) => (q.kind === 'scheme' ? { choice: 0 } : null));
    ok(smLog(st).some(l => /все кубики удара будут атакой/.test(l)), 'план объявлен');
    ok(smLog(st).some(l => /орбитальный удар: 2 урона/.test(l)), 'оба кубика — атака: 2 урона');
    eq(st.players[0].schemes.length, 0, 'план сброшен');
    st = smStrike({ foeUnits: { 'огрины': 1 } });
    smScheme(st, 'Экстерминатус');
    smFire(st, ['def', 'morale'], (s, q) => (q.kind === 'scheme' ? { no: true } : null));
    ok(smLog(st).some(l => /орбитальный удар: 0 урона/.test(l)), 'без плана те же кубики — 0 урона');
    return eq(st.players[0].schemes.length, 1, 'после отказа план остаётся');
});

check('Героическая атака', 'Космодесантник — в дружественный мир со своей постройкой, Скаут — в любой дружественный мир', () => {
    const twoWorlds = s => {
        const far = s.systems.find(x => x.id !== s.sys);
        FS_RULES.addUnit(s, 0, 'скауты', far.id, worldOf(s, far.id));
        return far;
    };
    let st = smEvent('Героическая атака', { units: { 'скауты': 1 }, structures: ['city'] });
    twoWorlds(st);
    const materiel = st.players[0].materiel;
    ok(playEvent(st).ok, 'карта сыграна');
    let trace = [];
    effectAnswer(st, (s, q) => { trace.push(q); return q.kind === 'choice' ? { choice: 0 } : effectPolicy(s, q); });
    const marine = myUnits(st).find(u => FS_RULES.unitOf(st, u).id === 'космодесант');
    ok(!!marine, 'Космодесантник размещён');
    eq([marine.system, marine.area], [st.sys, st.pos], 'в единственном мире с постройкой');
    eq(trace.filter(q => q.kind === 'areas').map(q => q.options), [[{ system: st.sys, pos: st.pos }]], 'предложен только мир с постройкой');
    eq(st.players[0].materiel, materiel, 'бесплатно');
    st = smEvent('Героическая атака', { units: { 'скауты': 1 }, structures: ['city'] });
    const far = twoWorlds(st);
    playEvent(st);
    trace = [];
    effectAnswer(st, (s, q) => {
        trace.push(q);
        if (q.kind === 'choice') return { choice: 1 };
        if (q.kind === 'areas') return { area: q.options.find(a => a.system === far.id) };
        return effectPolicy(s, q);
    });
    const areas = trace.find(q => q.kind === 'areas');
    eq(areas.options.length, 2, 'Скауту предложены оба дружественных мира');
    return eq(myUnits(st).filter(u => u.system === far.id).length, 2, 'Скаут размещён в дальнем мире');
});

check('Героическая атака', 'ветка без места или без отрядов не предлагается', () => {
    let st = smEvent('Героическая атака', { units: { 'скауты': 1 } });
    playEvent(st);
    const trace = [];
    effectAnswer(st, (s, q) => { trace.push(q); return effectPolicy(s, q); });
    eq(trace.filter(q => q.kind === 'choice').length, 0, 'без построек выбора нет — остаётся ветка Скаута');
    eq(myUnits(st).length, 2, 'Скаут размещён');
    st = smEvent('Героическая атака', { units: { 'скауты': 1 } });
    st.players[0].supply.units['скауты'] = 0;
    playEvent(st);
    eq(st.pending, null, 'вопросов нет');
    eq(myUnits(st).length, 1, 'разместить нечего');
    return ok(smLog(st).some(l => /ни одну из ветвей карты выполнить нельзя/.test(l)), 'карта объяснила отказ');
});

check('Чемпион Императора', 'план; в начале шага урона 1 свой деморализованный отряд восстанавливается', () => {
    let st = smEvent('Чемпион Императора', { units: { 'космодесант': 1 } });
    ok(playEvent(st).ok, 'план взят');
    eq(st.players[0].schemes.map(s => s.trigger), ['damage-start'], 'план ждёт начала урона');
    st = smBattle({ card: 'Засада', units: { 'космодесант': 2 }, foeUnits: { 'огрины': 1 }, dice: ['att'], foeDice: ['def'], roundEnd: true, noFoeCard: true });
    myUnits(st)[0].routed = true;
    smScheme(st, 'Чемпион Императора');
    eq(smToDamage(st, null), 'scheme', 'план предложен в начале шага урона');
    eq([st.pending.seat, pending(st).options], [0, ['Чемпион Императора']], 'предложен владельцу');
    st = JSON.parse(JSON.stringify(st));
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { choice: 0 } }).ok, 'план принят после JSON');
    eq(pending(st).op, 'restore', 'выбор отряда');
    effectAnswer(st, effectPolicy);
    eq(myUnits(st).filter(u => u.routed).length, 0, 'отряд восстановлен');
    eq(st.players[0].schemes.length, 0, 'план сброшен');
    return ok(!!st.combat && /^damage-/.test(st.combat.step), 'шаг урона продолжается');
});

check('Чемпион Императора', 'отказ оставляет план и не задерживает урон', () => {
    const st = smBattle({ card: 'Засада', units: { 'космодесант': 2 }, foeUnits: { 'огрины': 1 }, dice: ['att'], foeDice: ['def'], roundEnd: true, noFoeCard: true });
    myUnits(st)[0].routed = true;
    smScheme(st, 'Чемпион Императора');
    smToDamage(st, null);
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { no: true } }).ok, 'отказ принят');
    eq(myUnits(st).filter(u => u.routed).length, 1, 'отряд остался деморализованным');
    eq(st.players[0].schemes.length, 1, 'план на месте');
    return eq(st.pending, null, 'вопросов больше нет');
});

check('Защита Императора', 'бесплатный бастион в мире без построек — или за 2 материи в мире без бастиона сверх лимита', () => {
    let st = smEvent('Защита Императора', { units: { 'скауты': 1 }, materiel: 5 });
    ok(playEvent(st).ok, 'карта сыграна');
    effectAnswer(st, effectPick(0));
    eq(st.structures.map(s => s.type), ['bastion'], 'бастион построен');
    eq(st.players[0].materiel, 5, 'бесплатно');
    st = smEvent('Защита Императора', { units: { 'скауты': 1 }, structures: ['city', 'factory'], materiel: 5 });
    playEvent(st);
    effectAnswer(st, effectPick(1));
    eq(st.structures.map(s => s.type), ['city', 'factory', 'bastion'], 'третья постройка в мире — лимит проигнорирован');
    return eq(st.players[0].materiel, 3, 'две материи уплачены');
});

check('Защита Императора', 'в мире с бастионом или без двух материй ветки не предлагаются', () => {
    let st = smEvent('Защита Императора', { units: { 'скауты': 1 }, structures: ['city', 'bastion'], materiel: 5 });
    playEvent(st);
    eq(st.structures.length, 2, 'ничего не построено');
    ok(smLog(st).some(l => /ни одну из ветвей карты выполнить нельзя/.test(l)), 'карта объяснила отказ');
    st = smEvent('Защита Императора', { units: { 'скауты': 1 }, structures: ['city'], materiel: 1 });
    playEvent(st);
    eq(st.structures.length, 1, 'материи на платную ветку нет, бесплатная — только в мире без построек');
    return eq(st.players[0].materiel, 1, 'материя не тронута');
});

check('Церемония перед боем', 'покупается 1 улучшение приказа, цена меньше на число дружественных миров с бастионом', () => {
    const st = smEvent('Церемония перед боем', { units: { 'скауты': 1 }, structures: ['bastion', 'city', 'city'], materiel: 1 });
    const far = st.systems.find(x => x.id !== st.sys);
    FS_RULES.addUnit(st, 0, 'скауты', far.id, worldOf(st, far.id));
    st.structures.push({ id: 'strX', seat: 0, type: 'bastion', system: far.id, area: worldOf(st, far.id) });
    eq(FS_RULES.countFor(st, 0, 'friendlyBastion'), 2, 'два дружественных мира с бастионом');
    eq(FS_RULES.commandLevel(st, 0), 2, 'командный уровень 2 — два города');
    ok(playEvent(st).ok, 'карта сыграна');
    const q = pending(st);
    eq([q.op, q.kind], ['buyUpgrade', 'cards'], 'предложена покупка');
    ok(q.options.includes('Десантный модуль'), 'карта за 3 доступна при 1 материи со скидкой 2');
    ok(!q.options.includes('Слава Императора'), 'карта 3 уровня недоступна при уровне 2');
    effectAnswer(st, { card: 'Десантный модуль' });
    eq(st.players[0].upgrades.map(u => u.name), ['Десантный модуль'], 'улучшение куплено');
    return eq(st.players[0].materiel, 0, 'уплачена одна материя');
});

check('Церемония перед боем', 'без бастионов скидки нет', () => {
    const st = smEvent('Церемония перед боем', { units: { 'скауты': 1 }, structures: ['city'], materiel: 1 });
    playEvent(st);
    const q = pending(st);
    return eq(q && q.options, ['Огненный дождь'], 'при 1 материи без скидки доступна только карта за 1');
});

check('Работа праведных', 'дружественный мир: либо его ценные ресурсы, либо материя по производству', () => {
    let st = smEvent('Работа праведных', { units: { 'скауты': 1 } });
    const world = FS_RULES.area(FS_RULES.system(st, st.sys), st.pos).world;
    eq(world.assets, ['reinforcement', 'reinforcement'], 'у мира проверки два жетона подкреплений');
    const materiel = st.players[0].materiel;
    ok(playEvent(st).ok, 'карта сыграна');
    effectAnswer(st, effectPick(0));
    eq(st.players[0].assets.reinforcement, 2, 'жетоны мира получены');
    eq(st.players[0].materiel, materiel, 'материя не менялась');
    // The second branch: a friendly world that produces materiel is chosen.
    st = smEvent('Работа праведных', { units: { 'скауты': 1 } });
    const rich = st.systems.map(s => ({ system: s.id, area: s.areas.find(a => a.world && a.world.materiel > 0) }))
        .find(x => x.area && x.system !== st.sys);
    ok(!!rich, 'есть мир с производством');
    FS_RULES.addUnit(st, 0, 'скауты', rich.system, rich.area.pos);
    playEvent(st);
    const trace = [];
    effectAnswer(st, (s, q) => {
        trace.push(q);
        if (q.kind === 'areas') return { area: q.options.find(a => a.system === rich.system) };
        return effectPick(1)(s, q);
    });
    eq(trace.find(q => q.kind === 'areas').options.length, 2, 'предложены оба дружественных мира');
    eq(st.players[0].assets.reinforcement, 0, 'жетонов нет');
    return eq(st.players[0].materiel, materiel + rich.area.world.materiel, 'материя по производству выбранного мира');
});

check('Непоколебимость', 'план вместо раскрытия приказа восстанавливает все отряды одной системы, ход переходит', () => {
    let st = smEvent('Непоколебимость', { units: { 'космодесант': 2 } });
    ok(playEvent(st).ok, 'план взят');
    const plan = st.players[0].schemes[0];
    eq([plan.trigger, plan.insteadOfOrder], ['operations', true], 'план ждёт фазы действий вместо приказа');
    for (const sys of st.systems) sys.tokens = [];
    const sys0 = st.systems[0], sys1 = st.systems[1];
    for (const u of myUnits(st)) u.routed = true;
    const farScout = FS_RULES.addUnit(st, 0, 'скауты', sys1.id, worldOf(st, sys1.id));
    farScout.routed = true;
    sys0.tokens.push({ seat: 0, order: 'advance', faceUp: false });
    sys1.tokens.push({ seat: 0, order: 'deploy', faceUp: false });
    st.systems[2].tokens.push({ seat: 1, order: 'deploy', faceUp: false });
    st.phase = 'operations'; st.turn = 0; st.order = null; st.event = null; FS_RULES.trimQueue(st).clear();
    st.players[0].placedTokens = 2; st.players[1].placedTokens = 1;
    ok(FS_RULES.apply(st, 0, { type: 'resolveOrder', system: sys0.id }).ok, 'приказ предложен');
    eq(pending(st).kind, 'scheme', 'план предложен вместо раскрытия');
    st = JSON.parse(JSON.stringify(st));
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { choice: 0 } }).ok, 'план принят после JSON');
    eq([pending(st).op, pending(st).options], ['restoreOneSystem', [sys0.id, sys1.id]], 'предложены системы с деморализованными отрядами');
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { system: sys0.id } }).ok, 'система выбрана');
    eq(myUnits(st).filter(u => u.system === sys0.id && u.routed).length, 0, 'все отряды системы восстановлены');
    eq(stateUnit(st, farScout.id).routed, true, 'отряд другой системы остался деморализованным');
    eq([sys0.tokens.length, sys1.tokens.length], [1, 1], 'жетоны приказов не раскрыты и не сброшены');
    eq([st.order, st.players[0].schemes.length], [null, 0], 'приказ не начат, план сброшен');
    return eq([st.phase, st.turn], ['operations', 1], 'ход перешёл сопернику');
});

check('Непоколебимость', 'после отказа приказ раскрывается как обычно, план остаётся', () => {
    const st = smEvent('Непоколебимость', { units: { 'космодесант': 2 } });
    playEvent(st);
    for (const sys of st.systems) sys.tokens = [];
    const sys0 = st.systems[0];
    for (const u of myUnits(st)) u.routed = true;
    sys0.tokens.push({ seat: 0, order: 'advance', faceUp: false });
    st.phase = 'operations'; st.turn = 0; st.order = null; st.event = null; FS_RULES.trimQueue(st).clear();
    st.players[0].placedTokens = 1;
    ok(FS_RULES.apply(st, 0, { type: 'resolveOrder', system: sys0.id }).ok, 'приказ предложен');
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { no: true } }).ok, 'отказ принят');
    eq(st.players[0].schemes.length, 1, 'план остался');
    ok(FS_RULES.apply(st, 0, { type: 'resolveOrder', system: sys0.id }).ok, 'приказ раскрыт повторной командой');
    eq(st.order && st.order.order, 'advance', 'наступление началось');
    return eq(myUnits(st).filter(u => u.routed).length, 2, 'отряды не восстановлены');
});

check('Адептус Механикус', 'план; в начале шага урона 2 `def. token` и ещё по 1 за каждый жетон кузницы', () => {
    let st = smEvent('Адептус Механикус', { units: { 'космодесант': 1 } });
    ok(playEvent(st).ok, 'план взят');
    eq(st.players[0].schemes.map(s => s.trigger), ['damage-start'], 'план ждёт начала урона');
    st = smBattle({ card: 'Засада', units: { 'скауты': 2 }, foeUnits: { 'огрины': 1 }, dice: ['att'], foeDice: ['def'], roundEnd: true, noFoeCard: true });
    st.players[0].assets.forge = 2;
    smScheme(st, 'Адептус Механикус');
    eq(smToDamage(st, null), 'scheme', 'план предложен в начале шага урона');
    const before = tokens(st, 'attacker').def;
    st = JSON.parse(JSON.stringify(st));
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { choice: 0 } }).ok, 'план принят после JSON');
    eq(tokens(st, 'attacker').def, before + 4, 'четыре жетона обороны: два и по одному за две кузницы');
    eq(st.players[0].assets.forge, 2, 'жетоны кузницы не тратятся');
    return eq(st.players[0].schemes.length, 0, 'план сброшен');
});

head('Особенность фракции', SM);

check('За Императора', 'второй шаг доминирования: 1 материя меняет Скаута на Космодесантника или Космодесантника на Ленд Рейдер', () => {
    let st = smOrder('dominate', { units: { 'скауты': 2, 'космодесант': 1 }, materiel: 3 });
    st.systems[1].tokens.push({ seat: 1, order: 'deploy', faceUp: false });
    ok(FS_RULES.apply(st, 0, { type: 'finishDominate' }).ok, 'способность начата');
    eq([pending(st).kind, pending(st).options.length], ['choice', 2], 'две ветки замены');
    effectAnswer(st, (s, q) => (q.kind === 'choice' ? { choice: 0 } : { units: [smUnit(s, 'скауты').id] }));
    eq([unitsByType(st, 0)['Скауты'], unitsByType(st, 0)['Космодесант']], [1, 2], 'Скаут стал Космодесантником');
    eq(st.players[0].materiel, 2, 'уплачена одна материя');
    eq([st.order, st.turn], [null, 1], 'приказ закрыт, ход передан');
    st = smOrder('dominate', { units: { 'скауты': 1, 'космодесант': 1 }, materiel: 3 });
    st.systems[1].tokens.push({ seat: 1, order: 'deploy', faceUp: false });
    const supply = Object.assign({}, st.players[0].supply.units);
    FS_RULES.apply(st, 0, { type: 'finishDominate' });
    effectAnswer(st, effectPick(1));
    eq([unitsByType(st, 0)['Скауты'], unitsByType(st, 0)['Космодесант'], unitsByType(st, 0)['Ленд Рейдеры']], [1, undefined, 1], 'Космодесантник стал Ленд Рейдером');
    return eq([st.players[0].supply.units['космодесант'], st.players[0].supply.units['ленд-рейдеры']],
        [supply['космодесант'] + 1, supply['ленд-рейдеры'] - 1], 'замена идёт через запас');
});

check('За Императора', 'без материи способность молчит; от неё можно отказаться', () => {
    let st = smOrder('dominate', { units: { 'скауты': 1 }, materiel: 0 });
    st.systems[1].tokens.push({ seat: 1, order: 'deploy', faceUp: false });
    ok(FS_RULES.apply(st, 0, { type: 'finishDominate' }).ok, 'приказ закончен');
    eq([st.pending, st.order, st.turn], [null, null, 1], 'вопросов нет, ход передан');
    st = smOrder('dominate', { units: { 'скауты': 1 }, materiel: 3 });
    st.systems[1].tokens.push({ seat: 1, order: 'deploy', faceUp: false });
    ok(FS_RULES.apply(st, 0, { type: 'finishDominate', skip: true }).ok, 'способность пропущена');
    return eq([st.players[0].materiel, unitsByType(st, 0), st.turn], [3, { 'Скауты': 1 }, 1], 'материя и отряды на месте');
});

// ============================================================================
//  Орки (02/04/05/06): боевые карты, приказы, события, особенность.
//  Проверяются ветки движка, появившиеся в аудите фракции: карта противника,
//  сброшенная с верха его колоды, чьи значки считаются до конца раунда и
//  которая возвращается владельцу; корабль «Натиск» как цена чужого отряда;
//  зеркальные жетоны на весь бой; бесплатный жетон подкреплений «в эту
//  область» без вопроса; откуп противника кубиком боевого духа вместо
//  деморализации; орбитальный удар с платой кубиком (материя у противника,
//  жетон ценного ресурса); приказ планирования, выполняемый как другой;
//  план «вместо раскрытия приказа»; план при покупке отряда со скидкой за
//  жетоны подкреплений; размещение в мире с отрядом нобзов и переход отряда
//  в любой неконтролируемый мир.
// ============================================================================
const ORK = 'орки';
const orkBattle = (o = {}) => battle(Object.assign({ faction: ORK, foeFaction: FOE,
    units: { 'бойзы': 2 }, foeUnits: { 'гвардейцы': 2 }, dice: ['att'], foeDice: ['def'] }, o));
const orkPlay = (st, policy, index) => play(st, 0, index || 0, policy);
const orkEvent = (name, o = {}) => eventState(name, Object.assign({ faction: ORK, foeFaction: FOE }, o));
const orkOrder = (kind, o = {}) => {
    const st = orderState(kind, Object.assign({ faction: ORK, foeFaction: FOE }, o));
    st.sys = st.systems[0].id;
    st.pos = o.pos || worldOf(st, st.sys);
    return st;
};
const orkStrike = (o = {}) => strikeState(Object.assign({ faction: ORK, foeFaction: FOE,
    ships: { 'атакующие-корабли-класса-натиск': 1 }, upgrades: [] }, o));
const orkUnit = (st, id, seat) => st.units.find(u => u.seat === (seat || 0) && FS_RULES.unitOf(st, u).id === id) || null;
const orkLog = st => st.log.map(l => l.text || l);
const orkDeck = (st, seat) => FS_RULES.player(st, seat).combatDeck;
/** The orbital strike of the Orks with fixed dice; the policy answers the questions of the strike. */
function orkFire(st, dice, policy) {
    const roll = FS_RULES.rollDice;
    FS_RULES.rollDice = (s, n) => (n === 1 ? [dice[0]] : dice.slice());
    try {
        const targets = FS_RULES.orbitalStrikeTargets(st, 0);
        const t = targets.find(x => x.pos === st.strikeWorld) || targets[0];
        const res = FS_RULES.apply(st, 0, { type: 'orbitalStrike', system: t.system, pos: t.pos });
        ok(res.ok, 'удар не нанесён: ' + res.error);
        if (st.pending) deAnswer(st, policy, 12);
        return t;
    } finally { FS_RULES.rollDice = roll; }
}
/** The battle is played to the first question the policy leaves to the check, or to the end of the round. */
function orkRound(st, policy) {
    const c = st.combat;
    for (let i = 0; i < 40 && st.combat; i++) {
        if (st.pending) { answerAll(st, policy, undefined, 1); continue; }
        const s = CombatTurn.of(c).step;
        if (s === 'reinforce-attacker') FS_RULES.apply(st, c.attacker, { type: 'combat', action: 'reinforce', count: 0 });
        else if (s === 'reinforce-defender') FS_RULES.apply(st, c.defender, { type: 'combat', action: 'reinforce', count: 0 });
        else if (s === 'choose-attacker') { if (!(c.cards.attacker.hand || []).length) FS_RULES.advanceCombatSteps(st); else FS_RULES.apply(st, c.attacker, { type: 'combat', action: 'playCard', index: 0 }); }
        else if (s === 'choose-defender') { if (!(c.cards.defender.hand || []).length) FS_RULES.advanceCombatSteps(st); else FS_RULES.apply(st, c.defender, { type: 'combat', action: 'playCard', index: 0 }); }
        else if (s === 'damage-attacker' || s === 'damage-defender') {
            const side = s === 'damage-attacker' ? 'attacker' : 'defender';
            const seat = CombatHooks.of(c).assignSeat(c[side]);
            const targets = FS_RULES.damageCandidates(st, side).map(x => x.id);
            const r = FS_RULES.apply(st, seat, { type: 'combat', action: 'damage', targets });
            if (!r.ok) throw new Error('урон не назначен: ' + r.error);
        } else if (s === 'round-end') { FS_RULES.endCombatRound(st); return 'round-end'; }
        else return s;
    }
    return st.combat ? CombatTurn.of(st.combat).step : null;
}

head('Разбор текстов', ORK);
check('Все карты', '14 боевых, 5 приказов, 8 событий и способность; ни один текст не остался пояснением', () => {
    eq(FS_DATA.combat.filter(c => c.faction === ORK).length, 14, 'боевых карт');
    eq(FS_DATA.orders.filter(c => c.faction === ORK).length, 5, 'карт приказов');
    eq(FS_DATA.events.filter(c => c.faction === ORK).length, 8, 'карт событий');
    const notes = [];
    const scan = (steps, where) => {
        for (const s of steps || []) {
            if (s.op === 'note' && !s.avoid) notes.push(where);
            if (s.op === 'trigger') scan(s.steps, where);
            if (s.op === 'choice') for (const o of s.options || []) scan(Array.isArray(o) ? o : [o], where);
            if (Array.isArray(s.then)) scan(s.then, where);
        }
    };
    for (const c of FS_DATA.combat.filter(c => c.faction === ORK)) {
        if (c.general && !/^\s*[—-]\s*$/.test(c.general)) scan(FS_EFFECTS.parse(c.general, { faction: ORK, kind: 'combat' }), c.name + ' (G)');
        if (c.unit) scan(FS_EFFECTS.parse(c.unit, { faction: ORK, kind: 'combat-unit' }), c.name + ' (U)');
    }
    for (const c of FS_DATA.orders.filter(c => c.faction === ORK)) scan(FS_EFFECTS.parse(c.text, { faction: ORK, kind: 'order' }), c.name);
    for (const c of FS_DATA.events.filter(c => c.faction === ORK)) scan(FS_EFFECTS.parse(c.text, { faction: ORK, kind: 'event' }), c.name);
    // «выберите 1 отряд противника» of «Сокрушающего гарганта» is the first
    // half of one rule: the second sentence asks for the victim itself.
    return eq(notes, ['Сокрушающий гаргант (U)'], 'тексты без правила движка');
});

check('Мек бойз', 'разбор: карта с верха колоды противника, значки до конца раунда', () => {
    const c = FS_DATA.combat.find(x => x.faction === ORK && x.name === 'Мек бойз');
    return eq(FS_EFFECTS.parse(c.unit, { faction: ORK, kind: 'combat-unit' }).map(s => [s.op, s.gainIcons, s.thisRound]),
        [['discardFoeTop', true, true]], 'шаг сброса с приобретением значков');
});

check('Гретчины', 'разбор: уничтожить «Натиск» — противник сам выбирает и уничтожает свой отряд', () => {
    const c = FS_DATA.combat.find(x => x.faction === ORK && x.name === 'Гретчины');
    const steps = FS_EFFECTS.parse(c.unit, { faction: ORK, kind: 'combat-unit' });
    eq(steps.map(s => s.op), ['destroy'], 'одна цена');
    eq(steps[0].filter, { types: ['Атакующие корабли класса «Натиск»'] }, 'цена — корабль «Натиск»');
    return eq(steps[0].then.map(s => [s.op, s.who, s.chooser]), [['destroy', 'foe', 'foe']], 'затем — отряд противника по его выбору');
});

check('Море зелёных', 'разбор: бесплатный жетон в эту область; откуп кубиком боевого духа вместо деморализации', () => {
    const c = FS_DATA.combat.find(x => x.faction === ORK && x.name === 'Море зелёных');
    const steps = FS_EFFECTS.parse(c.general, { faction: ORK, kind: 'combat' });
    eq(steps.map(s => s.op), ['placeReinforcement', 'foePayFork'], 'два шага');
    eq([steps[0].free, steps[0].here], [true, true], 'жетон бесплатный и в области боя');
    eq([steps[1].kinds, steps[1].who, steps[1].cond], [['morale'], 'foe', { unitMore: true }], 'откуп противника кубиком боевого духа, если отрядов больше');
    return eq(steps[1].then.map(s => [s.op, s.who, s.chooser]), [['route', 'foe', 'foe']], 'без откупа противник сам выбирает деморализуемый отряд');
});

check('Приказы и события', 'разбор: «Грабь!», «Воруй!», «Зеленая волна», «Вперёд!», «Варбосс», «В бой!», «Как мы сюда попадем?»', () => {
    const order = name => FS_EFFECTS.parse(FS_DATA.orders.find(x => x.faction === ORK && x.name === name).text, { faction: ORK, kind: 'order' });
    const event = name => FS_EFFECTS.parse(FS_DATA.events.find(x => x.faction === ORK && x.name === name).text, { faction: ORK, kind: 'event' });
    eq(order('Грабь!').map(s => [s.op, s.kind, s.reward]), [['gainDie', 'any', undefined], ['strikePay', 'any', { materiel: 1, foeLoses: 1 }], ['once', undefined, undefined]], '«Грабь!»');
    eq(order('Воруй!').map(s => [s.op, s.kind, s.reward]), [['ignoreBastion', undefined, undefined], ['strikePay', 'morale', { stealAsset: true }], ['once', undefined, undefined]], '«Воруй!»');
    eq(order('Зеленая волна').map(s => [s.op, s.kinds]), [['resolveAsOrder', ['deploy', 'dominate', 'advance']], ['once', undefined]], '«Зеленая волна»');
    const fwd = event('Вперёд!');
    eq([fwd[1].trigger, fwd[1].insteadOfOrder, fwd[1].steps.map(s => s.op)], ['operations', true, ['advanceFromPlan']], '«Вперёд!» — вместо раскрытия приказа');
    const boss = event('Варбосс');
    eq([boss[1].trigger, boss[1].steps.map(s => [s.op, s.n, s.per])], ['buy-unit', [['unitDiscount', 1, 'reinforcement']]], '«Варбосс» — при покупке отряда');
    const fight = event('В бой!');
    eq(fight[0].options.map(o => [o.op, o.n, o.dest]), [['placeUnit', 2, { kind: 'friendlyWorldWithUnit', unit: 'Нобзы' }], ['placeUnit', 1, 'friendlyWorldsAny']], '«В бой!» — две ветки');
    return eq(event('Как мы сюда попадем?').map(s => [s.op, s.dest]), [['moveUnit', 'uncontrolledWorldAny']], '«Как мы сюда попадем?»');
});

head('Боевые карты (04)', ORK);
check('Мек бойз', 'противник сбрасывает верхнюю карту колоды; её значки — ваши до конца раунда; карта возвращается владельцу', () => {
    const st = orkBattle({ card: 'Мек бойз', units: { 'бойзы': 1, 'нобзы': 1 }, roundEnd: true });
    const deckB = orkDeck(st, 1);
    const sizeB = deckB.size();
    const top = deckB.cards()[0];
    orkPlay(st, (s, q) => (q.op === 'gainDie' ? { choice: 0 } : null));
    const cards = CombatCards.of(st.combat);
    eq(deckB.size(), sizeB - 1, 'колода противника стала на карту меньше');
    eq(cards.discarded('defender').length, 1, 'сброшенная карта помнится за боем');
    const borrowed = cards.played('attacker').find(x => x.borrowed);
    ok(!!borrowed, 'значки карты противника учтены у орков');
    eq([borrowed.valuesOnly, borrowed.untilRound], [true, 1], 'только значки, только до конца раунда');
    const data = FS_DATA.combat.find(x => x.name === borrowed.name && x.faction === FOE);
    eq(cards.icons('attacker').morale, 1 + (data.icons.morale || 0), 'боевой дух: карта «Мек бойз» плюс значки сброшенной');
    eq(borrowed.name, top, 'сброшена верхняя карта колоды');
    // The battle ends: the card is in the deck of its owner, not of the Orks.
    const deckA = orkDeck(st, 0);
    const sizeA0 = deckA.size() + (st.combat.cards.attacker.hand || []).length + cards.played('attacker').filter(x => !x.borrowed).length;
    while (st.combat && orkRound(st) === 'round-end') { /* next round */ }
    if (st.combat && CombatTurn.of(st.combat).step === 'retreat') {
        const loser = CombatOutcome.of(st.combat).loserSeat;
        ok(FS_RULES.apply(st, loser, { type: 'combat', action: 'retreat' }).ok, 'проигравший отступил');
        if (st.pending) deAnswer(st, null, 6);
    }
    eq(st.combat, null, 'бой окончен');
    eq(deckB.size(), sizeB + 3, 'карты противника все вернулись в его колоду — и сброшенная тоже');
    return eq(deckA.size(), sizeA0, 'в колоде орков чужой карты нет');
});

check('Гретчины', 'в космосе: уничтожив «Натиск», вынуждает противника выбрать и уничтожить свой отряд', () => {
    const st = orkBattle({ card: 'Гретчины', kind: 'space', units: { 'атакующие-корабли-класса-натиск': 2 },
        foeUnits: { 'линкоры': 1 }, dice: ['att'], foeDice: ['def'], roundEnd: true });
    const trace = orkPlay(st, (s, q) => {
        if (q.op === 'rerollDie') return { dice: [q.options[0]] };
        if (q.op === 'destroy' && q.kind === 'units' && answerSeat(s) === 0) return { units: [q.options[1]] };
        return null;
    });
    const foeAsk = trace.find(t => t.op === 'destroy' && t.seat === 1);
    ok(!!foeAsk, 'противника спросили, какой свой отряд уничтожить');
    eq(myUnits(st).length, 1, 'один «Натиск» уничтожен как цена');
    return eq(st.units.filter(u => u.seat === 1).length, 0, 'линкор противника уничтожен по его же выбору');
});

check('Гретчины', 'на земле без «Натиска» в бою цена недоступна — способность молчит', () => {
    const st = orkBattle({ card: 'Гретчины', units: { 'бойзы': 1 }, roundEnd: true });
    const trace = orkPlay(st, (s, q) => (q.op === 'rerollDie' ? { dice: [q.options[0]] } : null));
    ok(!trace.some(t => t.op === 'destroy'), 'уничтожать нечего — вопроса нет');
    return eq(st.units.filter(u => u.seat === 1).length, 2, 'отряды противника целы');
});

check('Рокобойз', 'до конца боя получает столько же жетонов, сколько получает противник', () => {
    const st = orkBattle({ card: 'Рокобойз', units: { 'бойзы': 1 }, foeUnits: { 'гвардейцы': 2 }, roundEnd: true });
    orkPlay(st, null);
    const cubes = CombatCubes.of(st.combat);
    cubes.add('defender', 'att', 2);
    cubes.add('defender', 'def', 1);
    eq([cubes.get('attacker', 'att'), cubes.get('attacker', 'def')], [2, 1], 'жетоны противника отражены');
    cubes.add('attacker', 'att', 1);
    eq(cubes.get('defender', 'att'), 2, 'в обратную сторону жетоны не идут');
    const copy = JSON.parse(JSON.stringify(st));
    CombatCubes.of(copy.combat).add('defender', 'def', 2);
    return eq(CombatCubes.of(copy.combat).get('attacker', 'def'), 3, 'зеркало переживает сохранение');
});

check('Море зелёных', 'бесплатный жетон подкрепления без вопроса; противник откупается кубиком боевого духа', () => {
    const st = orkBattle({ card: 'Море зелёных', units: { 'бойзы': 2 }, foeUnits: { 'гвардейцы': 1 },
        foeDice: ['morale', 'def'], roundEnd: true });
    st.players[0].assets.reinforcement = 1;
    const trace = orkPlay(st, (s, q) => (q.op === 'foePayFork' ? { dice: [0] } : null));
    ok(!trace.some(t => t.op === 'placeReinforcement'), 'область жетона не спрашивается');
    eq(st.players[0].assets.reinforcement, 1, 'жетон размещён бесплатно — резерв не тронут');
    eq([CombatTokens.of(st.combat).used('attacker'), CombatTokens.of(st.combat).free.attacker], [1, 1], 'жетон подкрепления лежит в области боя, он бесплатный');
    eq(st.combat.dice.defender[0], null, 'кубик боевого духа противника потрачен');
    return eq(st.units.filter(u => u.seat === 1 && u.routed).length, 0, 'деморализации нет');
});

check('Море зелёных', 'без откупа противник сам выбирает деморализуемый отряд; при равенстве отрядов не спрашивает', () => {
    let st = orkBattle({ card: 'Море зелёных', units: { 'бойзы': 2 }, foeUnits: { 'гвардейцы': 1 },
        foeDice: ['morale', 'def'], roundEnd: true });
    let trace = orkPlay(st, (s, q) => (q.op === 'foePayFork' ? { no: true } : null));
    const routeAsk = trace.find(t => t.op === 'route');
    eq(routeAsk && routeAsk.seat, 1, 'деморализуемый отряд выбирает противник');
    eq(st.units.filter(u => u.seat === 1 && u.routed).length, 1, 'отряд противника деморализован');
    // The token just placed counts as a unit of the Orks: two Boyz and the
    // token against three Guardsmen is not «more».
    st = orkBattle({ card: 'Море зелёных', units: { 'бойзы': 2 }, foeUnits: { 'гвардейцы': 3 },
        foeDice: ['morale', 'def'], roundEnd: true });
    trace = orkPlay(st, null);
    return ok(!trace.some(t => t.op === 'foePayFork' || t.op === 'route'), 'при равном числе отрядов (с жетоном) второй половины нет');
});

check('«Пати вагон»', 'бесплатный жетон подкрепления в область боя; жетоны боя лишь при перевесе в отрядах', () => {
    let st = orkBattle({ card: '«Пати вагон»', units: { 'батлвагоны': 1 }, foeUnits: { 'гвардейцы': 2 }, roundEnd: true });
    st.players[0].assets.reinforcement = 0;
    orkPlay(st, null);
    eq(CombatTokens.of(st.combat).used('attacker'), 1, 'жетон размещён даже с пустым резервом — он бесплатный');
    eq(st.combat.tokens.attacker, { att: 0, def: 0 }, 'отрядов не больше — жетонов боя нет');
    st = orkBattle({ card: '«Пати вагон»', units: { 'батлвагоны': 1, 'бойзы': 1 }, foeUnits: { 'гвардейцы': 1 }, roundEnd: true });
    st.players[0].assets.reinforcement = 0;
    orkPlay(st, null);
    return eq(st.combat.tokens.attacker, { att: 2, def: 2 }, 'при перевесе: 2 жетона атаки и 2 обороны');
});

check('Сокрушающий гаргант', 'выбранный отряд противника уничтожен, если тот не потратит кубики по его командному уровню', () => {
    let st = orkBattle({ card: 'Сокрушающий гаргант', units: { 'гарганты': 1 }, foeUnits: { 'огрины': 1, 'гвардейцы': 1 },
        dice: ['att'], foeDice: ['def', 'morale'], roundEnd: true });
    const ogryn = orkUnit(st, 'огрины', 1);
    let trace = orkPlay(st, (s, q) => {
        if (q.op === 'destroyFoeUnlessPays' && q.kind === 'units') return { units: [ogryn.id] };
        if (q.op === 'destroyFoeUnlessPays' && q.kind === 'dice') return { dice: [] };
        return null;
    });
    eq(trace.find(t => t.op === 'destroyFoeUnlessPays' && t.kind === 'dice').seat, 1, 'кубики спрашивают у противника');
    eq(orkUnit(st, 'огрины', 1), null, 'огрин уничтожен: противник не заплатил');
    st = orkBattle({ card: 'Сокрушающий гаргант', units: { 'гарганты': 1 }, foeUnits: { 'огрины': 1, 'гвардейцы': 1 },
        dice: ['att'], foeDice: ['def', 'morale'], roundEnd: true });
    const ogryn2 = orkUnit(st, 'огрины', 1);
    trace = orkPlay(st, (s, q) => {
        if (q.op === 'destroyFoeUnlessPays' && q.kind === 'units') return { units: [ogryn2.id] };
        if (q.op === 'destroyFoeUnlessPays' && q.kind === 'dice') return { dice: [0] };
        return null;
    });
    ok(!!orkUnit(st, 'огрины', 1), 'огрин цел: противник потратил 1 кубик (КУ 1)');
    return eq(st.combat.dice.defender.filter(d => d).length, 1, 'у противника остался один кубик');
});

check('Дночерпатель', 'сбрасывает открытую боевую карту противника на ваш выбор', () => {
    const st = orkBattle({ card: 'Дночерпатель', units: { 'гарганты': 1 }, foeUnits: { 'гвардейцы': 2 }, roundEnd: true });
    const trace = orkPlay(st, null);
    const ask = trace.find(t => t.op === 'discardFoeCard');
    ok(!!ask, 'карта противника предложена к сбросу');
    return eq(CombatCards.of(st.combat).played('defender').length, 0, 'открытая карта противника сброшена');
});

check('«Роккит вагон»', '3 жетона атаки; противник может отступить одним отрядом', () => {
    const st = orkBattle({ card: '«Роккит вагон»', units: { 'батлвагоны': 1 }, foeUnits: { 'гвардейцы': 2 }, roundEnd: true });
    const trace = orkPlay(st, (s, q) => (q.op === 'foeRetreatOffer' ? { no: true } : null));
    eq(st.combat.tokens.attacker.att, 3, '3 жетона атаки');
    const offer = trace.find(t => t.op === 'foeRetreatOffer');
    return eq(offer && offer.seat, 1, 'отступление предложено противнику');
});

check('ВАААГХ!', 'восстановление одного отряда; жетон атаки за каждого бойза и «Натиск»', () => {
    const st = orkBattle({ card: 'ВАААГХ!', units: { 'бойзы': 3 }, foeUnits: { 'гвардейцы': 2 }, roundEnd: true, routed: [0] });
    orkPlay(st, null);
    eq(myUnits(st).filter(u => u.routed).length, 0, 'деморализованный бойз восстановлен');
    return eq(st.combat.tokens.attacker.att, 3, 'по жетону атаки за каждого из трёх бойзов');
});

check('Шута бойз', 'все свои кубики обороны перебрасываются; противник перебрасывает по кубику обороны за каждого бойза', () => {
    const st = orkBattle({ card: 'Шута бойз', units: { 'бойзы': 2 }, foeUnits: { 'гвардейцы': 2 },
        dice: ['att', 'def'], foeDice: ['def', 'def', 'def'], roundEnd: true });
    const trace = withFixedDice(['morale'], () => orkPlay(st, null));
    eq(st.combat.dice.attacker, ['att', 'morale'], 'свой кубик обороны переброшен без вопроса');
    const theirs = trace.filter(t => t.op === 'rerollDie' && t.seat === 1);
    eq(theirs.length, 1, 'противника спросили, какие кубики перебросить');
    eq(theirs[0].options.length, 3, 'на выбор — три кубика обороны');
    return eq(st.combat.dice.defender.filter(d => d === 'morale').length, 2, 'два кубика противника (по бойзу) переброшены');
});

head('Приказы (05)', ORK);
check('Грабь!', 'во время удара: +1 кубик; за кубик на ваш выбор — +1 материя вам, −1 противнику', () => {
    const st = orkStrike({ upgrades: ['Грабь!'], foeUnits: { 'гвардейцы': 1 }, materiel: 3 });
    st.players[1].materiel = 4;
    // The round goes on after the order: no refresh income in the way.
    st.systems[1].tokens.push({ seat: 1, order: 'deploy', faceUp: false });
    ok(burn(st, 'Грабь!').ok, 'карта сожжена');
    if (st.pending) deAnswer(st, null, 4);
    const trace = [];
    orkFire(st, ['att', 'def'], (s, q) => {
        trace.push(q.op + ':' + q.kind);
        if (q.op === 'strikePayPick') return q.kind === 'dice' ? { dice: [q.options[0]] } : { choice: 1 };
        return null;
    });
    ok(trace.some(t => t.startsWith('strikePayPick')), 'предложено потратить кубик удара');
    eq(st.players[0].materiel, 4, 'орки получили 1 материю');
    return eq(st.players[1].materiel, 3, 'противник потерял 1 материю');
});

check('Грабь!', 'отказ от траты ничего не меняет; без материи у противника терять нечего', () => {
    let st = orkStrike({ upgrades: ['Грабь!'], foeUnits: { 'гвардейцы': 1 }, materiel: 3 });
    st.players[1].materiel = 4;
    st.systems[1].tokens.push({ seat: 1, order: 'deploy', faceUp: false });
    burn(st, 'Грабь!');
    if (st.pending) deAnswer(st, null, 4);
    orkFire(st, ['att', 'def'], (s, q) => (q.op === 'strikePayPick' ? { choice: 0 } : null));
    eq([st.players[0].materiel, st.players[1].materiel], [3, 4], 'материя не изменилась');
    st = orkStrike({ upgrades: ['Грабь!'], foeUnits: { 'гвардейцы': 1 }, materiel: 3 });
    st.players[1].materiel = 0;
    st.systems[1].tokens.push({ seat: 1, order: 'deploy', faceUp: false });
    burn(st, 'Грабь!');
    if (st.pending) deAnswer(st, null, 4);
    orkFire(st, ['att', 'def'], (s, q) => (q.op === 'strikePayPick' ? (q.kind === 'dice' ? { dice: [q.options[0]] } : { choice: 1 }) : null));
    return eq([st.players[0].materiel, st.players[1].materiel], [4, 0], 'орки получили материю, противник остался при нуле');
});

check('Воруй!', 'бастионы не защищают; за `morale cube` жетон ценного ресурса противника становится вашим', () => {
    const st = orkStrike({ upgrades: ['Воруй!'], foeUnits: { 'гвардейцы': 1 }, foeStructures: ['bastion'], assets: { forge: 0 } });
    st.players[1].assets.forge = 1;
    st.players[1].assets.cache = 0;
    st.systems[1].tokens.push({ seat: 1, order: 'deploy', faceUp: false });
    ok(burn(st, 'Воруй!').ok, 'карта сожжена');
    eq(!!st.order.ignoreBastion, true, 'удар не знает бастионов');
    const trace = [];
    orkFire(st, ['morale', 'att'], (s, q) => {
        trace.push([q.op, q.kind, answerSeat(s)]);
        if (q.op === 'strikePayPick') return { choice: 1 };
        if (q.op === 'takeFoeAsset') return { asset: 'forge' };
        return null;
    });
    ok(trace.some(t => t[0] === 'takeFoeAsset'), 'спрошен жетон противника');
    eq(st.players[1].assets.forge, 0, 'жетон кузницы у противника сброшен');
    return eq(st.players[0].assets.forge, 1, 'такой же жетон получили орки');
});

check('Воруй!', 'без кубика боевого духа в броске платить нечем', () => {
    const st = orkStrike({ upgrades: ['Воруй!'], foeUnits: { 'гвардейцы': 1 } });
    st.players[1].assets.forge = 1;
    burn(st, 'Воруй!');
    const trace = [];
    orkFire(st, ['att', 'def'], (s, q) => { trace.push(q.op); return null; });
    ok(!trace.includes('strikePayPick') && !trace.includes('takeFoeAsset'), 'траты не предложено');
    return eq(st.players[1].assets.forge, 1, 'жетон остался у противника');
});

check('Зеленая волна', 'приказ планирования выполняется как развертывание', () => {
    const st = orkOrder('strategize', { upgrades: ['Зеленая волна'], units: { 'бойзы': 1 }, structures: ['factory'], materiel: 6 });
    ok(burn(st, 'Зеленая волна').ok, 'карта сожжена');
    const q = pending(st);
    eq([q.op, q.kind, q.kinds], ['resolveAsOrder', 'choice', ['deploy', 'dominate', 'advance']], 'спрошен вид приказа');
    effectAnswer(st, { choice: 0 });
    eq(st.order && st.order.order, 'deploy', 'приказ стал развертыванием');
    const res = FS_RULES.apply(st, 0, { type: 'buyUnit', unit: 'бойзы', system: st.sys, pos: st.pos });
    ok(res.ok, 'отряд куплен по приказу развертывания: ' + res.error);
    return eq(myUnits(st).length, 2, 'бойз на месте');
});

check('Зеленая волна', 'как продвижение и как доминирование; после покупки улучшения приказ уже не меняется', () => {
    let st = orkOrder('strategize', { upgrades: ['Зеленая волна'], units: { 'бойзы': 2 } });
    burn(st, 'Зеленая волна');
    effectAnswer(st, { choice: 2 });
    eq([st.order && st.order.order, st.order && st.order.phase], ['advance', 'move'], 'продвижение: шаг движения');
    st = orkOrder('strategize', { upgrades: ['Зеленая волна'], units: { 'бойзы': 2 } });
    burn(st, 'Зеленая волна');
    effectAnswer(st, { choice: 1 });
    eq(st.order && st.order.order, 'dominate', 'доминирование');
    st = orkOrder('strategize', { upgrades: ['Зеленая волна'], units: { 'бойзы': 2 }, materiel: 8 });
    const bought = FS_RULES.apply(st, 0, { type: 'buyUpgrade', kind: 'combat', card: 'Мега нобз' });
    ok(bought.ok, 'боевое улучшение куплено: ' + bought.error);
    if (st.pending) deAnswer(st, (s, q) => (q.op === 'buyUpgradeReplace' ? { remove: q.options[0] } : null), 4);
    const r = burn(st, 'Зеленая волна');
    ok(!r.ok, 'после покупки карта не применяется');
    return eq(st.players[0].upgrades[0].used, false, 'карта не потрачена впустую');
});

check('Строй быстрее!', 'с картой в руке постройка покупается до отрядов; покупка тратит карту на раунд', () => {
    let st = orkOrder('deploy', { units: { 'бойзы': 1 }, structures: ['factory'], materiel: 8 });
    const free = FS_RULES.system(st, st.sys).areas.find(a => a.world && a.pos !== st.pos);
    ok(!!free, 'в системе есть второй мир');
    FS_RULES.addUnit(st, 0, 'бойзы', st.sys, free.pos);
    let res = FS_RULES.apply(st, 0, { type: 'buyStructure', kind: 'city', system: st.sys, pos: free.pos });
    ok(!res.ok, 'без карты постройка ждёт конца приказа');
    st = orkOrder('deploy', { upgrades: ['Строй быстрее!'], units: { 'бойзы': 1 }, structures: ['factory'], materiel: 8 });
    FS_RULES.addUnit(st, 0, 'бойзы', st.sys, free.pos);
    eq(OrderDeal.of(st.order).structureFirst, true, 'с картой приказ разрешает постройку первой');
    res = FS_RULES.apply(st, 0, { type: 'buyStructure', kind: 'city', system: st.sys, pos: free.pos });
    ok(res.ok, 'город куплен первым: ' + res.error);
    eq(st.structures.filter(s => s.seat === 0).map(s => s.type).sort(), ['city', 'factory'], 'город стоит');
    eq(st.players[0].upgrades[0].used, true, 'карта потрачена покупкой');
    res = FS_RULES.apply(st, 0, { type: 'buyUnit', unit: 'бойзы', system: st.sys, pos: st.pos });
    ok(res.ok, 'отряд куплен после постройки: ' + res.error);
    // The second deploy order of the round: the card is spent.
    const again = orkOrder('deploy', { units: { 'бойзы': 1 }, structures: ['factory'], materiel: 8,
        before: s2 => { s2.players[0].upgrades = [{ name: 'Строй быстрее!', used: true }]; } });
    return eq(OrderDeal.of(again.order).structureFirst, false, 'потраченная карта второй приказ не ускоряет');
});

check('Орочьи корабли', 'корабли проходят через 2 пустоты', () => {
    const st = orkOrder('advance', { upgrades: ['Орочьи корабли'], ships: { 'атакующие-корабли-класса-натиск': 1 }, units: { 'бойзы': 1 } });
    ok(burn(st, 'Орочьи корабли').ok, 'карта сожжена');
    return eq(OrderMove.of(st.order).passVoid, 2, 'приказ знает о двух пустотах');
});

head('События (06)', ORK);
check('Моар бойз!', 'два жетона подкреплений', () => {
    const st = orkEvent('Моар бойз!', { units: { 'бойзы': 1 }, assets: { reinforcement: 1 } });
    ok(playEvent(st).ok, 'событие разыграно');
    return eq(st.players[0].assets.reinforcement, 3, '+2 жетона подкреплений');
});

check('Как мы сюда попадем?', 'отряд из любого мира переходит в любой никем не контролируемый мир', () => {
    const st = orkEvent('Как мы сюда попадем?', { units: { 'бойзы': 1 } });
    const far = st.systems[2];
    const target = { system: far.id, pos: worldOf(st, far.id) };
    ok(playEvent(st).ok, 'событие разыграно');
    let q = pending(st);
    eq([q.op, q.kind], ['moveUnit', 'units'], 'спрошен отряд');
    effectAnswer(st, { units: [q.options[0]] }, 1);
    q = pending(st);
    eq([q.op, q.kind], ['moveUnit', 'areas'], 'затем — мир');
    ok(q.options.some(a => a.system === target.system && a.pos === target.pos), 'неконтролируемый мир другой системы предложен');
    ok(!q.options.some(a => a.system === st.sys && a.pos === st.pos), 'свой мир не предложен');
    effectAnswer(st, { area: target });
    return eq([myUnits(st)[0].system, myUnits(st)[0].area], [target.system, target.pos], 'бойз переехал');
});

check('В бой!', 'с нобзами: 2 бойза в их мир; без нобзов — только 1 бойз в любом дружественном мире', () => {
    let st = orkEvent('В бой!', { units: { 'нобзы': 1 } });
    const other = st.systems[1];
    FS_RULES.addUnit(st, 0, 'бойзы', other.id, worldOf(st, other.id));
    ok(playEvent(st).ok, 'событие разыграно');
    let q = pending(st);
    eq([q.op, q.kind, q.options.length], ['choice', 'choice', 2], 'предложены обе ветки');
    effectAnswer(st, { choice: 0 }, 1);
    q = pending(st);
    if (q.kind === 'types') { effectAnswer(st, { type: q.options[0] }, 1); q = pending(st); }
    eq([q.op, q.kind, q.options.length], ['placeUnit', 'areas', 1], 'только мир с нобзами');
    eq(q.options[0], { system: st.sys, pos: st.pos }, 'это мир нобзов');
    deAnswer(st, (s, q2) => (q2.kind === 'areas' ? { area: q2.options[0] } : null), 6);
    eq(myUnits(st).filter(u => FS_RULES.unitOf(st, u).id === 'бойзы' && u.system === st.sys).length, 2, 'два бойза у нобзов');
    st = orkEvent('В бой!', { units: { 'бойзы': 1 } });
    ok(playEvent(st).ok, 'событие разыграно');
    q = pending(st);
    ok(q.op !== 'choice' || q.options.length === 1, 'без нобзов первой ветки нет');
    deAnswer(st, null, 4);
    return eq(myUnits(st).length, 2, 'один бойз размещён');
});

check('Сокруши это!', 'план: в начале шага урона уничтожается постройка мира боя', () => {
    const st = orkEvent('Сокруши это!', { units: { 'бойзы': 2 } });
    ok(playEvent(st).ok, 'план взят');
    eq(st.players[0].schemes.map(s => s.trigger), ['damage'], 'план ждёт шага урона');
    const b = orkBattle({ card: 'Шута бойз', units: { 'бойзы': 2 }, foeUnits: { 'гвардейцы': 2 }, roundEnd: true });
    b.players[0].schemes = st.players[0].schemes;
    const field = BattleField.of(b.combat);
    b.structures.push({ id: 'foeCity', seat: 1, type: 'city', system: field.system, area: field.pos });
    const r = orkRound(b, (s, q) => {
        if (q.kind === 'scheme') return { choice: 0 };
        if (q.op === 'rerollDie') return { dice: [q.options[0]] };
        return null;
    });
    void r;
    return eq(b.structures.filter(s => s.id === 'foeCity').length, 0, 'город противника уничтожен планом');
});

check('Добить их!', 'план: в начале шага урона уничтожается деморализованный отряд противника', () => {
    const st = orkEvent('Добить их!', { units: { 'бойзы': 2 } });
    ok(playEvent(st).ok, 'план взят');
    const b = orkBattle({ card: 'Шута бойз', units: { 'бойзы': 2 }, foeUnits: { 'гвардейцы': 2 }, roundEnd: true, foeRouted: [0] });
    void orkLog;
    b.players[0].schemes = st.players[0].schemes;
    const routed = b.units.find(u => u.seat === 1 && u.routed).id;
    const trace = [];
    orkRound(b, (s, q) => {
        trace.push([q.kind, q.op, q.options]);
        if (q.kind === 'scheme') return { choice: 0 };
        if (q.op === 'rerollDie') return { dice: [q.options[0]] };
        return null;
    });
    const ask = trace.find(t => t[1] === 'destroyDamagedFoe');
    eq(ask && ask[2], [routed], 'на выбор — только деморализованный отряд противника');
    ok(orkLog(b).some(l => /уничтожен отряд противника, ставший добычей/.test(l)), 'отряд уничтожен планом');
    return eq(b.players[0].schemes.length, 0, 'план сброшен');
});

check('Вперёд!', 'план вместо раскрытия приказа: продвижение в системе с двумя отрядами, жетон приказа не тронут', () => {
    let st = orkEvent('Вперёд!', { units: { 'бойзы': 2 } });
    ok(playEvent(st).ok, 'план взят');
    const plan = st.players[0].schemes[0];
    eq([plan.trigger, plan.insteadOfOrder], ['operations', true], 'план ждёт фазы действий вместо приказа');
    for (const sys of st.systems) sys.tokens = [];
    const sys0 = st.systems[0], sys1 = st.systems[1];
    FS_RULES.addUnit(st, 0, 'бойзы', sys1.id, worldOf(st, sys1.id));
    sys0.tokens.push({ seat: 0, order: 'deploy', faceUp: false });
    st.systems[2].tokens.push({ seat: 1, order: 'deploy', faceUp: false });
    st.phase = 'operations'; st.turn = 0; st.order = null; st.event = null; FS_RULES.trimQueue(st).clear();
    st.players[0].placedTokens = 1; st.players[1].placedTokens = 1;
    ok(FS_RULES.apply(st, 0, { type: 'resolveOrder', system: sys0.id }).ok, 'приказ предложен');
    eq(pending(st).kind, 'scheme', 'план предложен вместо раскрытия');
    st = JSON.parse(JSON.stringify(st));
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { choice: 0 } }).ok, 'план принят после JSON');
    eq([pending(st).op, pending(st).options], ['advanceFromPlan', [sys0.id]], 'предложена система с двумя отрядами');
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { system: sys0.id } }).ok, 'система выбрана');
    eq([st.order && st.order.order, st.order && st.order.system, st.order && st.order.phase], ['advance', sys0.id, 'move'], 'приказ продвижения начат');
    eq([sys0.tokens.length, sys0.tokens[0].faceUp], [1, false], 'жетон приказа не раскрыт');
    eq(st.players[0].schemes.length, 0, 'план сброшен');
    const r = FS_RULES.apply(st, 0, { type: 'finishAdvance' });
    ok(r.ok, 'продвижение завершено: ' + r.error);
    if (st.pending) deAnswer(st, null, 6);
    eq(st.order, null, 'приказ завершён');
    eq(sys0.tokens.length, 1, 'жетон приказа остался в системе');
    return eq([st.phase, st.turn], ['operations', 1], 'ход перешёл сопернику');
});

check('Варбосс', 'при покупке отряда план предлагается; принятый — скидка по жетонам подкреплений только на этот отряд', () => {
    let st = orkEvent('Варбосс', { units: { 'бойзы': 1 }, assets: { reinforcement: 2 } });
    ok(playEvent(st).ok, 'план взят');
    eq(st.players[0].schemes.map(s => s.trigger), ['buy-unit'], 'план ждёт покупки отряда');
    const schemes = st.players[0].schemes;
    st = orkOrder('deploy', { units: { 'бойзы': 1 }, structures: ['factory'], materiel: 8, assets: { reinforcement: 2 } });
    st.players[0].schemes = schemes;
    let res = FS_RULES.apply(st, 0, { type: 'buyUnit', unit: 'бойзы', system: st.sys, pos: st.pos });
    ok(res.ok && res.pending, 'покупка ждёт ответа: ' + res.error);
    eq(pending(st).kind, 'scheme', 'план предложен при покупке');
    eq(myUnits(st).length, 1, 'до ответа отряд не куплен');
    st = JSON.parse(JSON.stringify(st));
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { choice: 0 } }).ok, 'план принят после JSON');
    eq(myUnits(st).filter(u => FS_RULES.unitOf(st, u).id === 'бойзы').length, 2, 'бойз куплен');
    eq(Purchases.of(st.order).spent, 0, 'бойз за 2 стоил 0: по 1 за каждый из двух жетонов подкреплений');
    eq(st.players[0].schemes.length, 0, 'план сброшен');
    res = FS_RULES.apply(st, 0, { type: 'buyUnit', unit: 'бойзы', system: st.sys, pos: st.pos });
    ok(res.ok, 'второй отряд куплен: ' + res.error);
    return eq(Purchases.of(st.order).spent, 2, 'второй бойз за 2 — уже без скидки');
});

check('Варбосс', 'отказ от плана — покупка идёт по полной цене, план остаётся', () => {
    let st = orkEvent('Варбосс', { units: { 'бойзы': 1 }, assets: { reinforcement: 2 } });
    playEvent(st);
    const schemes = st.players[0].schemes;
    st = orkOrder('deploy', { units: { 'бойзы': 1 }, structures: ['factory'], materiel: 8, assets: { reinforcement: 2 } });
    st.players[0].schemes = schemes;
    const res = FS_RULES.apply(st, 0, { type: 'buyUnit', unit: 'бойзы', system: st.sys, pos: st.pos });
    ok(res.ok && res.pending, 'покупка ждёт ответа');
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { no: true } }).ok, 'отказ принят');
    eq(myUnits(st).filter(u => FS_RULES.unitOf(st, u).id === 'бойзы').length, 2, 'бойз куплен');
    eq(Purchases.of(st.order).spent, 2, 'полная цена');
    return eq(st.players[0].schemes.length, 1, 'план остался');
});

check('Воруй тихо', '+2 материи; противник теряет жетон ценного ресурса на ваш выбор', () => {
    const st = orkEvent('Воруй тихо', { units: { 'бойзы': 1 }, materiel: 2 });
    st.players[1].assets.forge = 1;
    st.players[1].assets.cache = 1;
    ok(playEvent(st).ok, 'событие разыграно');
    deAnswer(st, (s, q) => (q.kind === 'assetType' || q.kind === 'assets' ? { asset: 'cache' } : null), 6);
    eq(st.players[0].materiel, 4, '+2 материи');
    return eq([st.players[1].assets.forge, st.players[1].assets.cache], [1, 0], 'противник потерял выбранный жетон');
});

head('Особенность фракции', ORK);
check('Споры орков', 'на втором шаге доминирования покупается 1 отряд в дружественный мир активной системы', () => {
    const st = orkOrder('dominate', { units: { 'бойзы': 1 }, materiel: 6 });
    ok(!!st.order, 'приказ доминирования раскрыт');
    const before = myUnits(st).length;
    for (let i = 0; i < 6 && st.pending; i++) deAnswer(st, null, 1);
    let r = FS_RULES.apply(st, 0, { type: 'finishDominate' });
    ok(r.ok, 'первый шаг завершён: ' + r.error);
    if (st.pending) {
        const q = pending(st);
        ok(['ability', 'choice', 'types'].includes(q.kind), 'способность предложена: ' + q.op + '/' + q.kind);
        deAnswer(st, (s, q2) => (q2.kind === 'types' ? { type: 'бойзы' } : null), 6);
    }
    return ok(myUnits(st).length === before + 1 || st.order === null, 'бойз куплен способностью (или приказ закрыт без фабрики)');
});

// ============================================================================
//  Сёстры Битвы — фанатская колода (02/04/05/06): боевые карты, приказы, события.
//  Проверяются ветки движка, которых не было до аудита фракции: «если эта
//  карта была сброшена», кубики «выброшенные этой картой», запреты раунда,
//  обещания приказа битве, планы с точным моментом.
// ============================================================================
const SB = 'сестры-битвы';
const sbBattle = (o = {}) => battle(Object.assign({ faction: SB, foeFaction: FOE,
    units: { 'сестры-битвы': 1, 'сестры-ренетентии': 1 },
    foeUnits: { 'гвардейцы': 2 }, dice: ['att', 'def'], foeDice: ['att', 'def', 'morale'] }, o));
const sbPlay = (st, policy, index) => play(st, 0, index || 0, policy);
const sbEvent = (name, o = {}) => eventState(name, Object.assign({ faction: SB, foeFaction: FOE }, o));
const sbOrder = (kind, o = {}) => orderState(kind, Object.assign({ faction: SB, foeFaction: FOE }, o));
const sbScheme = (st, name, seat) => {
    const card = FS_DATA.events.find(e => e.faction === SB && e.name === name);
    ok(!!card, 'нет карты «' + name + '»');
    FS_RULES.keepEventScheme(st, seat === undefined ? 0 : seat, card);
    const list = st.players[seat === undefined ? 0 : seat].schemes;
    return list[list.length - 1];
};
head('Боевая колода', SB);

check('Святая троица', 'сыгранная карта даёт 2 att. cube, а не жетоны «если была сброшена»', () => {
    const st = sbBattle({ card: 'Святая троица', units: { 'сестры-ренетентии': 1 }, dice: [] });
    sbPlay(st);
    eq(count(st, 'attacker', 'att'), 2, 'два кубика атаки получены');
    eq(tokens(st, 'attacker').att, 0, 'жетонов «за сброс» у сыгранной карты нет');
});

check('Святая троица', 'сброшенная из руки другой картой — 2 att. token', () => {
    // «Фанатичное рвение»: «получите 1 att. token или сбросьте 1 карту из
    // вашей руки» — сброс «Святой троицы» выполняет её строку о сбросе.
    const st = sbBattle({ hand: ['Фанатичное рвение', 'Святая троица'], units: { 'сестры-битвы': 1 } });
    const before = tokens(st, 'attacker').att;
    sbPlay(st, (s2, q) => {
        if (q.kind === 'choice') return { choice: 1 };
        if (q.op === 'discardHand') return { card: 'Святая троица' };
        return null;
    });
    eq(count(st, 'defender', 'morale'), 0, 'противник потерял кубик морали');
    eq(tokens(st, 'attacker').att - before, 2, 'сброшенная «Святая троица» дала два жетона атаки');
    ok(!st.combat.cards.attacker.hand.includes('Святая троица'), 'карта ушла из руки');
});

check('Благословленное наступление', 'жетоны за выпавшие при розыгрыше карты грани', () => {
    const st = sbBattle({ card: 'Благословленное наступление', units: { 'сестры-ренетентии': 1 }, dice: ['att'] });
    const c = st.combat;
    let seen = -1;
    sbPlay(st, (s2, q) => {
        // At the reroll the two new dice are already on the record of the card.
        if (q.op === 'rerollDie') { seen = ctx.CombatHooks.of(c).rolledOf('attacker'); return { dice: [0] }; }
        return null;
    });
    eq(seen, 2, 'два новых кубика записаны за картой до переброса');
    // Three dice were rolled by the general abilities (two new, one reroll):
    // each gave a token of its face or — for morale — a die of the unit line.
    const t = tokens(st, 'attacker');
    const extra = dice(st, 'attacker').length - 3;
    eq(t.att + t.def + extra, 3, 'каждый из трёх бросков дал жетон своей грани или кубик за morale');
    // The next card starts its own record.
    eq(ctx.CombatHooks.of(c).rolledOf('attacker'), 0, 'запись бросков обнулена картой противника');
});

check('Стойкость духа', 'атакуя — противник теряет только кубик атаки или морали на свой выбор', () => {
    const st = sbBattle({ card: 'Стойкость духа', foeDice: ['def', 'att', 'morale'] });
    tokens(st, 'defender').att = 2;
    const trace = sbPlay(st, (s2, q) => (q.op === 'loseDie' ? { dice: [2] } : null));
    const lose = trace.find(t => t.op === 'loseDie');
    ok(!!lose, 'вопрос о потере кубика задан');
    eq(lose.seat, 1, 'выбирает противник');
    eq(lose.options, [1, 2], 'предложены только att. и morale');
    eq(dice(st, 'defender'), ['def', 'att'], 'потерян выбранный кубик морали');
    eq(tokens(st, 'defender').att, 2, 'жетоны атаки в нападении не теряются');
});

check('Божественное благословение', 'за каждый потраченный def./morale куб противник теряет att. cube', () => {
    const st = sbBattle({ card: 'Божественное благословение', units: { 'живая-святая': 1 },
        dice: ['def', 'morale', 'att'], foeDice: ['att', 'att', 'att', 'def'] });
    const trace = sbPlay(st, (s2, q) => (q.op === 'spendDie' ? { dice: [0, 1] } : null));
    const spend = trace.find(x => x.op === 'spendDie');
    ok(!!spend && spend.options.length === 2, 'на оплату предложены только def. и morale');
    ok(dice(st, 'attacker').includes('att'), 'кубик атаки остался');
    eq(count(st, 'defender', 'att'), 1, 'противник потерял два кубика атаки');
    eq(count(st, 'defender', 'def'), 1, 'кубик обороны противника цел');
    // Four «any» dice of the unit line came after the payment.
    eq(dice(st, 'attacker').length, 5, 'четыре кубика способности отряда добавлены');
});

check('Фанатичное рвение', 'атакуя — противнику запрещены подкрепления и восстановление в этом раунде', () => {
    const st = sbBattle({ card: 'Фанатичное рвение', units: { 'сестры-битвы': 1 } });
    const c = st.combat;
    sbPlay(st, branch(0));
    const bans = ctx.CombatBans.of(c);
    eq(bans.forbidsRestore('defender'), true, 'восстановление защитника запрещено');
    eq(bans.forbidsRestore('attacker'), false, 'свои восстанавливаются');
    eq(tokens(st, 'attacker').att, 1, 'выбран жетон атаки');
});

check('Вера защитит нас', 'ветка Экзорциста: при большем числе morale cube противник деморализует отряд', () => {
    const st = sbBattle({ card: 'Вера защитит нас', units: { 'танки-экзорцист': 1 },
        dice: ['morale', 'morale'], foeDice: ['morale'] });
    sbPlay(st, (s2, q) => (q.kind === 'choice' ? { choice: 1 } : null));
    eq(count(st, 'attacker', 'morale'), 3, 'общая способность дала кубик морали');
    eq(foeUnits(st).filter(u => u.routed).length, 1, 'противник деморализовал один отряд');
});

check('Вера защитит нас', 'без перевеса по morale cube ветка Экзорциста пуста', () => {
    const st = sbBattle({ card: 'Вера защитит нас', units: { 'танки-экзорцист': 1 },
        dice: ['morale'], foeDice: ['morale', 'morale'] });
    sbPlay(st, (s2, q) => (q.kind === 'choice' ? { choice: 1 } : null));
    eq(foeUnits(st).filter(u => u.routed).length, 0, 'никто не деморализован');
});

check('Геройское самосожжение', 'противник откупается кубиком — жетонов нет, но есть morale cube', () => {
    const st = sbBattle({ card: 'Геройское самосожжение', units: { 'сестры-битвы': 1 }, dice: ['att'] });
    sbPlay(st, (s2, q) => {
        if (q.op === 'avoid') return { dice: [q.options[0]] };
        if (q.kind === 'choice') return { choice: 1 };
        return null;
    });
    eq(tokens(st, 'attacker').def, 0, 'три жетона обороны не получены');
    eq(dice(st, 'defender').length, 2, 'противник потерял кубик');
    eq(count(st, 'attacker', 'morale'), 1, '«если он это сделал» — кубик морали получен');
});

check('Геройское самосожжение', 'противник не платит — три жетона обороны', () => {
    const st = sbBattle({ card: 'Геройское самосожжение', units: { 'сестры-битвы': 1 }, dice: ['att'] });
    sbPlay(st, (s2, q) => {
        if (q.op === 'avoid') return { dice: [] };
        if (q.kind === 'choice') return { choice: 1 };
        return null;
    });
    eq(tokens(st, 'attacker').def, 3, 'три жетона обороны получены');
    eq(count(st, 'attacker', 'morale'), 0, 'кубика морали без платы нет');
});

check('Кара Божья', 'способность отряда: жетон атаки за каждый morale cube и игнорирование вражеских att. cube', () => {
    const st = sbBattle({ card: 'Кара Божья', units: { 'живая-святая': 1 }, dice: ['morale', 'morale'] });
    const c = st.combat;
    sbPlay(st, branch(0));
    eq(count(st, 'attacker', 'morale'), 3, 'общая способность: ещё один кубик морали');
    eq(tokens(st, 'attacker').att, 3, 'жетон атаки за каждый кубик морали');
    eq(ctx.CombatBans.of(c).ignoresFoeAttack('defender'), true, 'вражеские кубики атаки игнорируются');
    eq(ctx.CombatBans.of(c).ignoresFoeAttack('attacker'), false, 'свои — нет');
    eq(FS_RULES.combatValues(st, 'defender').att, 0, 'атака противника без кубиков');
});

check('Снисхождение ангела', 'общая способность: жетон обороны за каждый недеморализованный отряд, не более 3', () => {
    const st = sbBattle({ card: 'Снисхождение ангела', units: { 'сестры-битвы': 3, 'сестры-ренетентии': 2 }, routed: [4] });
    sbPlay(st);
    eq(tokens(st, 'attacker').def, 3, 'четыре недеморализованных — но не более трёх жетонов');
});

/** The battle is taken to the damage step of the named side; the other side's
 *  damage, if it comes first, is dealt to every candidate. */
function toOwnDamage(st, side, policy) {
    for (let i = 0; i < 4; i++) {
        const step = toDamageStep(st, policy);
        if (step === 'damage-' + side) return step;
        if (!step) return null;
        const other = step === 'damage-attacker' ? 'attacker' : 'defender';
        const seat = ctx.CombatHooks.of(st.combat).assignSeat(st.combat[other]);
        const targets = FS_RULES.damageCandidates(st, other).map(x => x.id);
        const r = FS_RULES.apply(st, seat, { type: 'combat', action: 'damage', targets });
        if (!r.ok) throw new Error('урон не назначен: ' + r.error);
    }
    return st.combat ? st.combat.step : null;
}

check('Мученичество', 'урон сверх здоровья погибшего отряда теряется, за гибель — def. cube', () => {
    // Two Sisters of Battle (health 3) under six hits: the first dies, the
    // rest of the damage is lost, the second stands — and the death gives a die.
    const st = sbBattle({ card: 'Мученичество', units: { 'сестры-битвы': 2 }, dice: [],
        foeDice: Array(6).fill('att'), roundEnd: true });
    const c = st.combat;
    sbPlay(st);
    eq(CombatDamage.of(c).excessOf(1) && CombatDamage.of(c).excessOf(1).id, 'fallen', 'избыток урона после гибели теряется');
    answerAll(st, null, 1);
    const step = toOwnDamage(st, 'attacker');
    eq(step, 'damage-attacker', 'дошли до урона атакующего');
    const ids = myUnits(st).map(u => u.id);
    const preview = FS_RULES.damagePreview(st, 'attacker', ids);
    eq(preview.damage, 6, 'шесть единиц урона');
    eq(preview.rows.map(r => [r.take, r.destroyed]), [[3, true]], 'первая Сестра гибнет, вторая не тронута');
    eq(preview.discarded, 3, 'три единицы потеряны');
    const before = dice(st, 'attacker').length;
    ok(FS_RULES.apply(st, 0, { type: 'combat', action: 'damage', targets: ids }).ok, 'урон принят');
    eq(myUnits(st).length, 1, 'одна Сестра осталась');
    answerAll(st, null, undefined);
    eq(dice(st, 'attacker').length - before, 1, 'за гибель отряда получен кубик');
    eq(dice(st, 'attacker').at(-1), 'def', 'это def. cube');
});

check('Мученичество', 'без погибших отрядов кубика нет', () => {
    const st = sbBattle({ card: 'Мученичество', units: { 'сестры-битвы': 2 }, dice: [],
        foeDice: ['att', 'att'], roundEnd: true });
    sbPlay(st);
    answerAll(st, null, 1);
    eq(toOwnDamage(st, 'attacker'), 'damage-attacker', 'дошли до урона атакующего');
    const ids = myUnits(st).map(u => u.id);
    const before = dice(st, 'attacker').length;
    ok(FS_RULES.apply(st, 0, { type: 'combat', action: 'damage', targets: ids.slice(0, 1) }).ok, 'урон принят');
    answerAll(st, null, undefined);
    eq(myUnits(st).length, 2, 'обе Сестры живы (одна деморализована)');
    eq(dice(st, 'attacker').length - before, 0, 'кубика без гибели нет');
});

check('Светоч веры', 'ветка Репентии: замена на Сестру Битвы и два кубика', () => {
    const st = sbBattle({ card: 'Светоч веры', units: { 'сестры-ренетентии': 1 }, dice: [] });
    const trace = sbPlay(st, branch(0));
    // Only the Repentia line is met: the choice is made by the table itself.
    ok(!trace.some(t => t.kind === 'choice'), 'ветка без бастиона не предлагается');
    ok(trace.some(t => t.op === 'replaceUnit'), 'спрошено, кого заменить');
    eq(myUnits(st).map(u => FS_RULES.unitOf(st, u).id), ['сестры-битвы'], 'Репентия заменена Сестрой Битвы');
    eq(dice(st, 'attacker').length, 2, 'два кубика получены');
});

check('Светоч веры', 'ветка Бастиона: без Репентии и без бастиона карта молчит, с бастионом — кубик морали и два жетона', () => {
    let st = sbBattle({ card: 'Светоч веры', units: { 'сестры-битвы': 1 }, dice: [] });
    sbPlay(st, branch(1));
    eq(dice(st, 'attacker').length, 0, 'без бастиона кубика нет');
    eq(tokens(st, 'attacker').def, 0, 'без бастиона жетонов нет');
    st = sbBattle({ card: 'Светоч веры', units: { 'сестры-битвы': 1 }, dice: [] });
    const field = BattleField.of(st.combat);
    st.structures.push({ id: 'b1', seat: 0, type: 'bastion', system: field.system, area: field.pos });
    sbPlay(st, branch(1));
    eq(dice(st, 'attacker'), ['morale'], 'с бастионом — кубик морали');
    eq(tokens(st, 'attacker').def, 2, 'и два жетона обороны');
});

check('Продвижение вперёд', 'противник перебрасывает два кубика на свой выбор; жетон обороны за каждый выпавший att', () => {
    const st = sbBattle({ card: 'Продвижение вперёд', units: { 'сестры-ренетентии': 1 }, dice: [], foeDice: ['def', 'def', 'def'] });
    const trace = sbPlay(st, (s2, q) => (q.op === 'rerollDie' ? { dice: [0, 1] } : null));
    const q = trace.find(t => t.op === 'rerollDie');
    ok(!!q, 'вопрос о перебросе задан');
    eq(q.seat, 1, 'кубики выбирает противник');
    eq(count(st, 'defender', 'def') >= 1, true, 'третий кубик не трогали');
    eq(tokens(st, 'attacker').def, count(st, 'defender', 'att'), 'жетон обороны за каждый att. cube, выпавший у противника');
});

check('Лицеприятная кара', 'способность отряда: жетон на выбор и розыгрыш карты из руки', () => {
    const st = sbBattle({ hand: ['Лицеприятная кара', 'Святая троица'], units: { 'сестры-ренетентии': 1 }, dice: [] });
    const trace = sbPlay(st, (s2, q) => {
        if (q.kind === 'choice') return { choice: 1 };
        if (q.op === 'playCard') return { card: 'Святая троица' };
        return null;
    });
    ok(trace.some(t => t.op === 'playCard'), 'предложено сыграть карту из руки');
    eq(tokens(st, 'attacker').def, 1, 'выбран жетон обороны');
    eq(count(st, 'attacker', 'att'), 2, '«Святая троица» сыграна: два кубика атаки');
    eq(st.combat.cards.attacker.hand, [], 'рука пуста');
});

check('Разрушительный рефрен', 'жетон атаки за каждого вражеского юнита; ветка Сестёр — кубик', () => {
    const st = sbBattle({ card: 'Разрушительный рефрен', units: { 'сестры-битвы': 1 }, foeUnits: { 'гвардейцы': 3 }, dice: [] });
    sbPlay(st, branch(1));
    eq(tokens(st, 'attacker').att, 3, 'три жетона за трёх юнитов');
    eq(dice(st, 'attacker').length, 1, 'один кубик по ветке Сестёр');
});

check('Снисхождение ангела', 'в конце шага урона противник уничтожает деморализованный отряд или платит att. cube', () => {
    const run = pay => {
        // Three hits against one defence token: the Sister is routed, and the
        // end of the damage step brings the deferred line of the card.
        const st = sbBattle({ card: 'Снисхождение ангела', units: { 'сестры-битвы': 1 }, foeUnits: { 'гвардейцы': 2 },
            dice: [], foeDice: ['att', 'att', 'att'], foeRouted: [0], roundEnd: true });
        sbPlay(st);
        eq(tokens(st, 'attacker').def, 1, 'жетон за единственный недеморализованный отряд');
        answerAll(st, null, 1);
        const asked = [];
        const policy = (s2, q) => { asked.push(q.op + '@' + (s2.pending.answerSeat === undefined ? s2.pending.seat : s2.pending.answerSeat)); return q.op === 'avoid' ? { dice: pay ? [q.options[0]] : [] } : null; };
        eq(toOwnDamage(st, 'attacker', policy), 'damage-attacker', 'дошли до урона атакующего');
        ok(!asked.length, 'до конца шага урона карта молчит');
        const ids = myUnits(st).map(u => u.id);
        ok(FS_RULES.apply(st, 0, { type: 'combat', action: 'damage', targets: ids }).ok, 'урон принят');
        answerAll(st, policy, undefined);
        ok(asked.includes('avoid@1'), 'противнику предложено откупиться кубиком');
        return st;
    };
    let st = run(false);
    eq(foeUnits(st).length, 1, 'деморализованный отряд уничтожен');
    ok(!foeUnits(st)[0].routed, 'остался недеморализованный');
    st = run(true);
    eq(foeUnits(st).length, 2, 'откупившийся противник отрядов не терял');
    eq(count(st, 'defender', 'att'), 2, 'заплачен один att. cube');
});

head('Улучшения приказов', SB);

check('Направить праведников', 'восстанавливает все отряды в одной системе: активной или соседней', () => {
    const st = sbOrder('strategize', { upgrades: ['Направить праведников'], units: { 'сестры-битвы': 2 }, materiel: 5 });
    const sys = st.systems[0];
    const near = FS_RULES.neighbors(st, sys.id)[0];
    ok(!!near, 'у системы есть сосед');
    const w2 = worldOf(st, near);
    FS_RULES.addUnit(st, 0, 'сестры-ренетентии', near, w2);
    FS_RULES.addUnit(st, 0, 'сестры-ренетентии', near, w2);
    for (const u of myUnits(st)) u.routed = true;
    const res = burn(st, 'Направить праведников');
    ok(res.ok, 'карта не сгорела: ' + res.error);
    const q = pending(st);
    ok(!!q && q.kind === 'systems', 'спрашивается система');
    ok(q.options.includes(near) && q.options.includes(sys.id), 'предложены активная и соседняя');
    effectAnswer(st, { system: near });
    eq(myUnits(st).filter(u => u.system === near && !u.routed).length, 2, 'в соседней системе все восстановлены');
    eq(myUnits(st).filter(u => u.system === sys.id && u.routed).length, 2, 'в активной — остались деморализованными');
});

check('Божественное избавление', 'кубик за каждую недеморализованную Сестру Репентию — в шаге подкреплений битвы в мире', () => {
    const fight = withCard => {
        const st = sbOrder('advance', { upgrades: ['Божественное избавление'],
            units: { 'сестры-ренетентии': 2, 'сестры-битвы': 1 }, foeUnits: { 'гвардейцы': 1 }, materiel: 5 });
        routeMine(st, 0);
        if (withCard) {
            ok(burn(st, 'Божественное избавление').ok, 'карта сгорела');
            const promise = ctx.OrderTally.of(st.order).combatStartDice;
            eq(promise.length, 1, 'приказ запомнил кубики для битвы');
            eq([promise[0].per, promise[0].worldOnly, promise[0].filter], ['unit', true, { types: ['Сестра Репентия'] }],
                'по кубику за Репентию, только в мире');
        }
        ok(FS_RULES.apply(st, 0, { type: 'endAdvance' }).ok, 'корабли встали');
        ok(FS_RULES.apply(st, 0, { type: 'endAdvance' }).ok, 'бой начат');
        ok(!!st.combat, 'бой идёт');
        // Nobody has reinforcement tokens: the step of the call is passed and
        // the dice of the promise are given before the cards are chosen.
        if (/^reinforce-/.test(st.combat.step)) refuseReinforce(st);
        eq(st.combat.step, 'choose-attacker', 'карты выбираются');
        return dice(st, 'attacker').length;
    };
    const plain = fight(false);
    eq(fight(true) - plain, 1, 'один кубик: одна Репентия недеморализована, Сестра Битвы не считается');
});

check('Крестный ход', 'неконтролируемые миры считаются дружественными для двух отрядов', () => {
    const st = sbOrder('advance', { upgrades: ['Крестный ход'], units: { 'сестры-битвы': 1 } });
    ok(burn(st, 'Крестный ход').ok, 'карта сгорела');
    eq(ctx.MarchPlan.of(st.order).uncontrolledLimit, 2, 'бюджет — два отряда');
});

/**
 * An orbital strike of the Sisters: the fleet in the void of the first system,
 * two guardsmen with a factory on the world next to it, a guardsman on the
 * other world of the system (the place of a retreat), the holding Repentia far
 * away so that no world of the system is contested by her.
 */
function sbStrike(o = {}) {
    const st = FS_RULES.newReadyGame({ seed: 5, players: players(SB, FOE) });
    st.units = [];
    st.structures = [];
    st.objectives = [];
    st.storms = [];
    for (const sys of st.systems) sys.tokens = [];
    st.phase = 'operations';
    st.turn = 0;
    st.order = null;
    const sys = st.systems[0];
    const voidArea = sys.areas.find(a => !a.world);
    const world = FS_RULES.areasAround(st, sys.id, voidArea.pos)
        .map(a => FS_RULES.area(sys, a.pos)).filter(a => a && a.world)[0];
    st.structures.push({ id: 'foe0', seat: 1, type: 'factory', system: sys.id, area: world.pos });
    for (const [id, n] of Object.entries(o.foeUnits || { 'гвардейцы': 2 })) {
        for (let i = 0; i < n; i++) FS_RULES.addUnit(st, 1, id, sys.id, world.pos);
    }
    for (const [id, n] of Object.entries(o.ships || { 'гранд-крейсеры-месть': 3 })) {
        for (let i = 0; i < n; i++) FS_RULES.addUnit(st, 0, id, sys.id, voidArea.pos);
    }
    const haven = FS_RULES.areasAround(st, sys.id, world.pos)
        .map(a => a.system === sys.id ? FS_RULES.area(sys, a.pos) : null).filter(a => a && a.world)[0];
    if (haven) FS_RULES.addUnit(st, 1, 'гвардейцы', sys.id, haven.pos);
    const far = st.systems[3];
    FS_RULES.addUnit(st, 0, 'сестры-ренетентии', far.id, worldOf(st, far.id));
    st.players[0].upgrades = (o.upgrades || ['Боевые гимны']).map(name => ({ name, used: false }));
    sys.tokens.push({ seat: 0, order: 'advance', faceUp: false });
    const res = FS_RULES.apply(st, 0, { type: 'resolveOrder', system: sys.id });
    if (!res || res.ok === false) throw new Error('приказ не раскрыт: ' + (res && res.error));
    st.order.phase = 'strike';
    st.strikeWorld = world.pos;
    st.haven = haven ? haven.pos : null;
    return st;
}

/** The strike with a fixed roll; the questions of its cards are answered by the policy. */
function sbStrikeRoll(st, faces, policy) {
    const roll = FS_RULES.rollDice;
    FS_RULES.rollDice = () => faces.slice();
    const sys = st.systems[0];
    const targets = FS_RULES.orbitalStrikeTargets(st, 0);
    const target = targets.find(t => t.system === sys.id && t.pos === st.strikeWorld) || targets[0];
    let res;
    try { res = FS_RULES.apply(st, 0, { type: 'orbitalStrike', system: target.system, pos: target.pos }); }
    finally { FS_RULES.rollDice = roll; }
    ok(res.ok, 'удар не нанесён: ' + res.error);
    const asked = [];
    effectAnswer(st, (s2, q) => {
        asked.push(q.op + '@' + (s2.pending.answerSeat === undefined ? s2.pending.seat : s2.pending.answerSeat));
        const a = policy ? policy(s2, q) : null;
        return a || effectPolicy(s2, q);
    }, 12);
    return asked;
}

check('Боевые гимны', 'карта ждёт удара: сравнение боевого духа идёт по выбранному миру и его флоту', () => {
    const st = sbStrike();
    ok(burn(st, 'Боевые гимны').ok, 'карта сгорела');
    eq(pending(st), null, 'до удара вопросов нет и никто не деморализован');
    eq(foeUnits(st).filter(u => u.routed).length, 0, 'до удара никто не деморализован');
    ok(!!ctx.StrikePlan.of(st.order).takeMoraleReward, 'план удара хранит условие');
    // Three grand cruisers (morale 2 each) against two guardsmen (morale 2 each).
    const asked = sbStrikeRoll(st, ['def', 'att', 'def'], (s2, q) => {
        if (q.op === 'route') return { units: [q.options[0]] };
        if (q.op === 'strikeRetreatOffer' && q.kind === 'yesno') return {};
        return null;
    });
    eq(asked.slice(0, 3), ['route@1', 'strikeRetreatOffer@0', 'strikeRetreatOffer@1'], 'противник выбирает отряд, хозяин платит, противник выбирает область');
    const gone = foeUnits(st).find(u => u.routed);
    ok(!!gone && gone.area === st.haven, 'деморализованный отряд отступил на соседний мир');
    eq(foeUnits(st).filter(u => u.area === st.strikeWorld).length, 1, 'на мире удара остался один отряд');
    eq(st.order.phase, 'strike-damage', 'удар продолжается нанесением урона');
    eq(ctx.StrikeDamage.of(st).hits, 1, 'урон удара — один att. cube, кубик обороны потрачен на отступление');
});

// The only unit of the world retreats by the card: there is nobody left to
// take the hits, and the strike must not wait for the defender forever.
check('Боевые гимны', 'если отступил последний отряд мира, удар заканчивается сам — урон пропадает', () => {
    const st = sbStrike({ foeUnits: { 'гвардейцы': 1 } });
    ok(burn(st, 'Боевые гимны').ok, 'карта сгорела');
    const asked = sbStrikeRoll(st, ['def', 'att', 'def'], (s2, q) => {
        if (q.op === 'route') return { units: [q.options[0]] };
        if (q.op === 'strikeRetreatOffer' && q.kind === 'yesno') return {};
        return null;
    });
    eq(asked.slice(0, 3), ['route@1', 'strikeRetreatOffer@0', 'strikeRetreatOffer@1'], 'деморализация, оплата, выбор области');
    eq(foeUnits(st).filter(u => u.area === st.strikeWorld).length, 0, 'на мире удара никого не осталось');
    eq(ctx.StrikeDamage.of(st).pending, false, 'удар не ждёт урона');
    eq(st.order, null, 'приказ наступления завершён');
    ok(st.log.some(l => /урон удара пропадает/.test(l.text || l)), 'в журнале сказано, что урон пропал');
    return eq(FS_RULES.apply(st, 1, { type: 'strikeDamage', unit: 'none' }).error, 'Сейчас нет орбитального удара.', 'команды урона больше нет');
});

check('Боевые гимны', 'при равном или меньшем боевом духе флота эффекта нет', () => {
    const st = sbStrike({ ships: { 'гранд-крейсеры-месть': 2 } });
    ok(burn(st, 'Боевые гимны').ok, 'карта сгорела');
    const asked = sbStrikeRoll(st, ['def', 'att', 'def']);
    eq(asked.filter(a => /route|strikeRetreat/.test(a)), [], 'ни деморализации, ни отступления');
    eq(foeUnits(st).filter(u => u.routed).length, 0, 'никто не деморализован');
    ok(st.log.some(l => /не превышает боевой дух мира/.test(l.text || l)), 'причина записана в журнал');
});

check('Боевые гимны', 'без def. cube в броске отступление не покупается; отказ от оплаты оставляет отряд на месте', () => {
    let st = sbStrike();
    ok(burn(st, 'Боевые гимны').ok, 'карта сгорела');
    let asked = sbStrikeRoll(st, ['att', 'att', 'morale'], (s2, q) => (q.op === 'route' ? { units: [q.options[0]] } : null));
    eq(asked, ['route@1'], 'после деморализации вопроса об оплате нет');
    eq(foeUnits(st).filter(u => u.routed && u.area === st.strikeWorld).length, 1, 'деморализованный отряд остался на мире');
    eq(ctx.StrikeDamage.of(st).hits, 2, 'два попадания целы');
    st = sbStrike();
    burn(st, 'Боевые гимны');
    asked = sbStrikeRoll(st, ['def', 'att', 'def'], (s2, q) => {
        if (q.op === 'route') return { units: [q.options[0]] };
        if (q.op === 'strikeRetreatOffer') return { no: true };
        return null;
    });
    eq(asked, ['route@1', 'strikeRetreatOffer@0'], 'хозяин отказался платить');
    eq(foeUnits(st).filter(u => u.routed && u.area === st.strikeWorld).length, 1, 'отряд остался деморализованным на мире');
});

check('Священное пламя', 'бастионы не защищают от удара; деморализация кораблей — вручную', () => {
    const st = sbStrike({ upgrades: ['Священное пламя'] });
    st.structures.push({ id: 'bast', seat: 1, type: 'bastion', system: st.systems[0].id, area: st.strikeWorld });
    const before = FS_RULES.orbitalStrikeTargets(st, 0).length;
    eq(before, 0, 'бастион закрывает мир от удара');
    ok(burn(st, 'Священное пламя').ok, 'карта сгорела');
    eq(!!st.order.ignoreBastion, true, 'приказ игнорирует бастионы');
    ok(FS_RULES.orbitalStrikeTargets(st, 0).length > 0, 'мир снова доступен для удара');
    const steps = FS_EFFECTS.parse(FS_CATALOG.card('orders', SB, 'Священное пламя').text, { kind: 'order', faction: SB });
    ok(steps.some(s => s.op === 'note' && s.manual), 'вторая половина карты помечена как ручная');
});

head('Карты событий', SB);

check('Вдохновляющий оратор', 'жетон подкрепления за каждый дружественный мир с городом', () => {
    const st = sbEvent('Вдохновляющий оратор', { units: { 'сестры-битвы': 1 }, structures: ['city'], assets: { reinforcement: 0 } });
    const other = st.systems[1];
    const w2 = worldOf(st, other.id);
    FS_RULES.addUnit(st, 0, 'сестры-ренетентии', other.id, w2);
    st.structures.push({ id: 'c2', seat: 0, type: 'city', system: other.id, area: w2 });
    // A city of the player in a world he does not hold does not count.
    const third = st.systems[2];
    st.structures.push({ id: 'c3', seat: 0, type: 'city', system: third.id, area: worldOf(st, third.id) });
    FS_RULES.addUnit(st, 1, 'гвардейцы', third.id, worldOf(st, third.id));
    ok(playEvent(st).ok, 'событие сыграно');
    eq(st.players[0].assets.reinforcement, 2, 'два дружественных мира с городом — два жетона');
});

check('Абсолютная покорность', 'Сестра Битвы — только в дружественный мир с дружественным отрядом', () => {
    const st = sbEvent('Абсолютная покорность', { units: { 'сестры-ренетентии': 1 } });
    const materiel = st.players[0].materiel;
    const other = st.systems[1];
    st.structures.push({ id: 'c2', seat: 0, type: 'city', system: other.id, area: worldOf(st, other.id) });
    ok(playEvent(st).ok, 'событие сыграно');
    effectAnswer(st, (s2, q) => (q.kind === 'choice' ? { choice: 0 } : null), 1);
    const t = pending(st);
    ok(!!t && t.kind === 'types', 'спрашивается отряд');
    eq(t.options, ['сестры-битвы'], 'предложена только Сестра Битвы');
    effectAnswer(st, { type: 'сестры-битвы' }, 1);
    const q = pending(st);
    ok(!!q && q.kind === 'areas', 'спрашивается мир');
    eq(q.options.length, 1, 'только мир с отрядом (мир с одним городом не подходит)');
    eq(q.options[0].system, st.sys, 'это мир с Репентией');
    effectAnswer(st, { area: q.options[0] });
    eq(myUnits(st).filter(u => FS_RULES.unitOf(st, u).id === 'сестры-битвы').length, 1, 'Сестра Битвы размещена');
    eq(st.players[0].materiel, materiel, 'бесплатно');
});

check('Размещение десантного собора', 'бесплатный город в дружественном мире без построек', () => {
    const st = sbEvent('Размещение десантного собора', { units: { 'сестры-битвы': 1 }, materiel: 4 });
    ok(playEvent(st).ok, 'событие сыграно');
    effectAnswer(st, (s2, q) => (q.kind === 'choice' ? { choice: 0 } : null), 1);
    const q = pending(st);
    ok(!!q && q.kind === 'areas', 'спрашивается мир');
    effectAnswer(st, { area: q.options[0] });
    eq(st.structures.filter(s => s.seat === 0 && s.type === 'city').length, 1, 'город построен');
    eq(st.players[0].materiel, 4, 'бесплатно');
});

check('Рассечение тьмы', 'скидка за смешанные системы входит в цену покупки, но не более 3', () => {
    const mixed = n => {
        const st = sbEvent('Рассечение тьмы', { units: { 'сестры-битвы': 1 }, foeUnits: { 'гвардейцы': 1 }, materiel: 0 });
        for (const sys of st.systems.slice(1, n)) {
            const w = worldOf(st, sys.id);
            FS_RULES.addUnit(st, 0, 'сестры-ренетентии', sys.id, w);
            FS_RULES.addUnit(st, 1, 'гвардейцы', sys.id, w);
        }
        eq(FS_RULES.countFor(st, 0, 'mixedSystem'), n, n + ' смешанных систем');
        ok(playEvent(st).ok, 'событие сыграно');
        return st;
    };
    // Four mixed systems: the discount stops at three.
    let st = mixed(4);
    let q = pending(st);
    ok(!!q && q.op === 'buyUpgrade', 'предложена покупка');
    eq(q.discount, 3, 'скидка — три, не четыре');
    // The KL0 upgrades cost 2: with no materiel at all they are bought by the discount.
    const pick = q.options.map(n => FS_CATALOG.card('combat', SB, n)).find(c => c && c.cost === 2);
    ok(!!pick, 'улучшение за 2 материи доступно без материи');
    effectAnswer(st, (s2, qq) => (qq.op === 'buyUpgrade' ? { card: pick.name } : firstOption(s2, qq)));
    eq(st.players[0].materiel, 0, 'материя не ушла в минус');
    ok(FS_RULES.player(st, 0).combatDeck.cards().includes(pick.name), 'карта куплена');
    // One mixed system: the discount is one, the card of two is out of reach.
    st = mixed(1);
    q = pending(st);
    eq(q, null, 'со скидкой 1 и без материи купить нечего');
    st = mixed(2);
    q = pending(st);
    ok(!!q && q.discount === 2, 'две смешанные системы — скидка два');
});

check('Свершившийся факт', 'вместо раскрытия приказа: Сестра переносится в любой дружественный мир', () => {
    const st = sbEvent('Свершившийся факт', { units: { 'сестры-ренетентии': 1 } });
    ok(playEvent(st).ok, 'план взят');
    const plan = st.players[0].schemes.find(x => x.name === 'Свершившийся факт');
    ok(!!plan && plan.trigger === 'operations' && plan.insteadOfOrder, 'план ждёт раскрытия приказа');
    const other = st.systems[1];
    FS_RULES.addUnit(st, 0, 'сестры-битвы', other.id, worldOf(st, other.id));
    st.phase = 'operations';
    st.turn = 0;
    st.order = null;
    FS_RULES.trimQueue(st).clear();
    const sys = st.systems[0];
    sys.tokens.push({ seat: 0, order: 'advance', faceUp: false });
    // The next player needs an order of his own to take the turn.
    st.systems[2].tokens.push({ seat: 1, order: 'deploy', faceUp: false });
    st.players[0].placedTokens = 1;
    st.players[1].placedTokens = 1;
    const res = FS_RULES.apply(st, 0, { type: 'resolveOrder', system: sys.id });
    ok(res.ok && res.pending, 'план предложен вместо раскрытия');
    effectAnswer(st, (s2, q) => {
        if (q.kind === 'scheme') return { choice: 0 };
        if (q.op === 'teleport' && q.kind === 'units') return { units: [myUnits(st).find(u => u.system === other.id).id] };
        if (q.op === 'teleport' && q.kind === 'areas') return { area: q.options.find(a => a.system === sys.id) };
        return null;
    });
    eq(myUnits(st).filter(u => u.system === sys.id).length, 2, 'Сестра Битвы перенесена в первый мир');
    eq(sys.tokens.length, 1, 'жетон приказа остался закрытым');
    eq(sys.tokens[0].faceUp, false, 'приказ не раскрыт');
    eq(st.turn, 1, 'ход перешёл к противнику');
});

check('Несгибаемая вера', 'в начале раунда: свои отряды нельзя деморализовать в этом раунде', () => {
    const st = sbBattle({ card: 'Святая троица', units: { 'сестры-ренетентии': 1 }, roundEnd: true });
    sbScheme(st, 'Несгибаемая вера');
    const c = st.combat;
    refuseReinforce(st);
    const q = pending(st);
    ok(!!q && q.kind === 'scheme', 'план предложен в начале раунда');
    effectAnswer(st, { choice: 0 }, 2);
    eq(CombatDamage.of(c).forbidsRoute(0, 1, 1), true, 'деморализация запрещена в первом раунде');
    eq(CombatDamage.of(c).forbidsRoute(0, 1, 2), false, 'во втором раунде — нет');
    eq(CombatDamage.of(c).forbidsRoute(1, 0, 1), false, 'противник деморализуется как обычно');
    ok(!st.players[0].schemes.some(x => x.name === 'Несгибаемая вера'), 'план сброшен');
});

check('Несокрушимая вера', 'только в последнем раунде: половина морали деморализованных идёт в счёт', () => {
    const st = sbBattle({ card: 'Святая троица', units: { 'сестры-битвы': 2 }, foeUnits: { 'гвардейцы': 1 }, roundEnd: true });
    sbScheme(st, 'Несокрушимая вера');
    const c = st.combat;
    refuseReinforce(st);
    ok(!pending(st) || pending(st).kind !== 'scheme', 'в первом раунде план не предлагается');
    // The last round of the battle.
    c.round = CombatTurn.of(c).maxRounds;
    FS_RULES.maybeScheme(st, 0, 'round', { kind: 'combat', ctx: { side: 'attacker' } });
    const q = pending(st);
    ok(!!q && q.kind === 'scheme', 'в последнем раунде план предложен');
    effectAnswer(st, { choice: 0 }, 2);
    routeMine(st, 0);
    const unit = FS_CATALOG.unit(SB, 'сестры-битвы');
    const m = unit.morale;
    const half = Math.ceil(m / 2);
    const without = FS_RULES.combatValues(st, 'attacker').morale;
    eq(ctx.CombatPlans.of(c).countsRoutedMoraleHalf(0), true, 'план записан за хозяином');
    eq(ctx.CombatPlans.of(c).countsRoutedMoraleHalf(1), false, 'противник половины не получает');
    eq(FS_RULES.routedMoraleHalf(st, 'attacker'), half, 'деморализованная Сестра добавила половину морали с округлением вверх');
    ok(without >= m + half, 'сумма морали учитывает и целую, и половинную Сестру');
});

// ============================================================================
//  Тёмные эльдары — фанатская колода (02/04/05/06).
// ============================================================================
const DE = 'темные-эльдары';
const deBattle = (o = {}) => battle(Object.assign({ faction: DE, foeFaction: FOE,
    units: { 'каббалиты-воины': 2, 'ведьмы': 1 },
    foeUnits: { 'гвардейцы': 2 }, dice: ['att', 'def'], foeDice: ['att', 'def', 'morale'] }, o));
const dePlay = (st, policy, index) => play(st, 0, index || 0, policy);
const deEvent = (name, o = {}) => eventState(name, Object.assign({ faction: DE, foeFaction: FOE }, o));
const deOrder = (kind, o = {}) => orderState(kind, Object.assign({ faction: DE, foeFaction: FOE }, o));
const deScheme = (st, name, seat) => {
    const card = FS_DATA.events.find(e => e.faction === DE && e.name === name);
    ok(!!card, 'нет карты «' + name + '»');
    FS_RULES.keepEventScheme(st, seat === undefined ? 0 : seat, card);
    const list = st.players[seat === undefined ? 0 : seat].schemes;
    return list[list.length - 1];
};
/** A world next to the area (in the same system or a neighbouring one). */
head('Боевая колода', DE);

check('Посланники Векта', 'жетон подкрепления и потеря противника — только при своём недеморализованном корабле в системе боя', () => {
    const run = withShip => {
        const st = deBattle({ card: 'Посланники Векта', units: { 'ведьмы': 1 }, dice: [] });
        const field = BattleField.of(st.combat);
        if (withShip) FS_RULES.addUnit(st, 0, 'крейсеры-пыток', field.system, voidOf(st, field.system));
        st.players[0].assets.reinforcement = 1;
        st.players[1].assets.reinforcement = 2;
        dePlay(st);
        return st;
    };
    let st = run(false);
    eq(dice(st, 'attacker'), ['def'], 'кубик обороны получен');
    eq([st.players[0].assets.reinforcement, st.players[1].assets.reinforcement], [1, 2], 'без корабля жетоны не меняются');
    st = run(true);
    eq([st.players[0].assets.reinforcement, st.players[1].assets.reinforcement], [2, 1], 'с кораблём: свой жетон получен, чужой сброшен');
});

check('Посланники Векта', 'способность Кабалита: свой жетон подкрепления встаёт в область боя', () => {
    const st = deBattle({ card: 'Посланники Векта', units: { 'каббалиты-воины': 1 }, dice: [] });
    st.players[0].assets.reinforcement = 2;
    const c = st.combat;
    const before = CombatTokens.of(c).used('attacker');
    dePlay(st);
    eq(CombatTokens.of(c).used('attacker') - before, 1, 'жетон подкрепления размещён в области');
    eq(st.players[0].assets.reinforcement, 1, 'жетон взят из запаса');
});

check('Скрытное убийство', 'способность отряда: жетон обороны и переброс одного кубика противника по выбору хозяина', () => {
    const st = deBattle({ card: 'Скрытное убийство', units: { 'ведьмы': 1 }, dice: ['morale'], foeDice: ['att', 'def', 'morale'] });
    const trace = dePlay(st, (s2, q) => {
        if (q.op === 'flipDie') return { dice: [0] };
        if (q.op === 'rerollDie') return { dice: [1] };
        return null;
    });
    eq(tokens(st, 'attacker').att, 1, 'жетон атаки общей способности');
    eq(dice(st, 'attacker'), ['att'], 'кубик морали перевёрнут на атаку');
    eq(tokens(st, 'attacker').def, 1, 'жетон обороны способности отряда');
    const reroll = trace.find(t => t.op === 'rerollDie');
    ok(!!reroll, 'переброс предложен');
    eq(reroll.seat, 0, 'кубик противника выбирает хозяин карты');
    eq(reroll.options, [0, 1, 2], 'любой из трёх кубиков противника');
    eq(dice(st, 'defender').length, 3, 'у противника по-прежнему три кубика');
});

check('Охота на слабых', 'вторая ветка: потратить куб, чтобы восстановить отряд', () => {
    const st = deBattle({ card: 'Охота на слабых', units: { 'каббалиты-воины': 2 }, dice: ['att', 'def'], routed: [1] });
    dePlay(st, branch(1));
    eq(dice(st, 'attacker').length, 2, 'куб потрачен, кубик способности отряда получен');
    eq(myUnits(st).filter(u => u.routed).length, 0, 'отряд восстановлен');
});

check('Крылатый удар', 'вторая ветка способности: карта с руки даёт значки до конца битвы, но не способности', () => {
    const st = deBattle({ hand: ['Крылатый удар', 'Движимые ненавистью'], units: { 'ведьмы': 1 }, dice: [], roundEnd: true });
    const c = st.combat;
    const trace = dePlay(st, (s2, q) => {
        if (q.kind === 'choice' && (q.options || []).some(o => o.op === 'playCard' || /карт/i.test(String(o.text || o.ability || '')))) return { choice: 1 };
        if (q.kind === 'choice') return { choice: 1 };
        if (q.op === 'playCard') return { card: 'Движимые ненавистью' };
        return null;
    });
    ok(trace.some(t => t.op === 'playCard'), 'предложено разыграть карту с руки');
    const extra = FS_DATA.combat.find(x => x.faction === DE && x.name === 'Движимые ненавистью').icons;
    const own = FS_DATA.combat.find(x => x.faction === DE && x.name === 'Крылатый удар').icons;
    const icons = CombatCards.of(c).icons('attacker');
    eq([icons.att, icons.def, icons.morale], [own.att + extra.att, own.def + extra.def, own.morale + extra.morale], 'значки второй карты прибавлены к своим');
    eq(tokens(st, 'attacker').att + tokens(st, 'attacker').def, 0, 'способности второй карты не применены');
    eq(dice(st, 'defender').length, 3, 'противник кубиков не терял');
    FS_RULES.endCombatRound(st);
    const after = st.combat || c;
    const icons2 = CombatCards.of(after).icons('attacker');
    eq(icons2.att, own.att + extra.att, 'значки пережили конец раунда — до конца битвы');
});

check('Луизианское гостеприимство', 'противник отступает — наказания нет; отказ — жетон атаки за каждого Крейсера или Кабалита', () => {
    const run = retreat => {
        const st = deBattle({ card: 'Луизианское гостеприимство', units: { 'каббалиты-воины': 2 }, dice: [] });
        const trace = dePlay(st, (s2, q) => {
            if (q.op === 'foeRetreatOffer') return retreat ? {} : { no: true };
            if (q.op === 'discardHand') return { card: q.options[0] };
            return null;
        });
        return { st, trace };
    };
    let { st, trace } = run(false);
    eq(trace.find(t => t.op === 'foeRetreatOffer').seat, 1, 'отступать решает противник');
    eq(tokens(st, 'attacker').att, 2, 'отказ: жетон за каждого недеморализованного Кабалита');
    eq(foeUnits(st).filter(u => u.routed).length, 0, 'никто не отступил');
    ({ st, trace } = run(true));
    eq(tokens(st, 'attacker').att, 0, 'отступление: жетонов нет');
    eq(foeUnits(st).filter(u => u.routed).length, 1, 'один отряд противника отступил');
    eq(trace.filter(t => t.op === 'retreat').map(t => [t.kind, t.seat]), [['units', 1], ['areas', 1]], 'отряд и область отступления выбирает противник');
});

check('Луизианское гостеприимство', 'сброс карты с руки — ради отступления своим отрядом', () => {
    const st = deBattle({ hand: ['Луизианское гостеприимство', 'Охота на слабых'], units: { 'каббалиты-воины': 2 }, dice: [] });
    const field = BattleField.of(st.combat);
    // The attackers came with an Advance: they may retreat to any friendly
    // world they can reach — a Kabalite next door keeps one.
    st.combat.viaAdvance = true;
    const near = adjacentWorld(st, field.system, field.pos);
    FS_RULES.addUnit(st, 0, 'каббалиты-воины', near.system, near.pos);
    const trace = dePlay(st, (s2, q) => {
        if (q.op === 'foeRetreatOffer') return { no: true };
        if (q.op === 'discardHand') return { card: 'Охота на слабых' };
        if (q.op === 'retreat' && q.kind === 'units') return { units: [q.options[0]] };
        if (q.op === 'retreat' && q.kind === 'areas') return { area: q.options.find(a => a.system === near.system && a.pos === near.pos) || q.options[0] };
        return null;
    });
    ok(trace.some(t => t.op === 'discardHand'), 'сброс предложен');
    eq(st.combat.cards.attacker.hand, [], 'карта сброшена');
    eq(myUnits(st).length, 3, 'никто не погиб');
    eq(myUnits(st).filter(u => u.system === field.system && u.area === field.pos).length, 1, 'один отряд ушёл из области боя');
    eq(myUnits(st).filter(u => u.system === near.system && u.area === near.pos).length, 2, 'он отступил на соседний дружественный мир');
});

check('Упоение резней', 'в атаке противник не получает жетонов атаки в этом раунде', () => {
    const st = deBattle({ card: 'Упоение резней', foeCard: 'За Императора!', units: { 'ведьмы': 1 }, foeUnits: { 'гвардейцы': 3 }, dice: [] });
    dePlay(st);
    answerAll(st, null, 1);
    eq(tokens(st, 'defender').att, 0, '«За Императора!» не дала противнику жетонов атаки');
    eq(tokens(st, 'defender').def, 0, 'и обороны она не даёт');
});

check('Упоение резней', 'в защите: кубик обороны и потеря противником двух жетонов атаки', () => {
    const st = battle({ faction: FOE, foeFaction: DE, units: { 'гвардейцы': 2 }, foeUnits: { 'ведьмы': 1 },
        card: 'Ложись!', foeCard: 'Упоение резней', dice: ['att'], foeDice: [], roundEnd: true });
    tokens(st, 'attacker').att = 3;
    // The round runs through to its end on its own: the table is read while
    // the second ability of the card (the one of the Witch) is being asked.
    let seen = null;
    play(st, 1, 0, (s2, q) => {
        if (answerSeat(s2) === 1 && !seen) seen = { foeAtt: tokens(s2, 'attacker').att, dice: dice(s2, 'defender').slice() };
        return null;
    });
    ok(!!seen, 'способность Ведьмы спрошена');
    eq(seen.dice, ['def'], 'кубик обороны получен');
    eq(seen.foeAtt, 1, 'противник потерял два жетона атаки');
});

check('Выстрелить и исчезнуть', 'после предложения отступить — свой отряд уходит в соседнюю область и даёт выбор награды', () => {
    const st = deBattle({ card: 'Выстрелить и исчезнуть', units: { 'каббалиты-воины': 2 }, dice: [] });
    const field = BattleField.of(st.combat);
    // A friendly world next door for the move.
    const near = FS_RULES.areasAround(st, field.system, field.pos)
        .map(a => ({ a, sys: FS_RULES.system(st, a.system) })).map(x => ({ ref: x.a, area: FS_RULES.area(x.sys, x.a.pos) }))
        .filter(x => x.area && x.area.world)[0];
    ok(!!near, 'есть соседний мир');
    FS_RULES.addUnit(st, 0, 'каббалиты-воины', near.ref.system, near.ref.pos);
    const trace = dePlay(st, (s2, q) => {
        if (q.op === 'foeRetreatOffer') return { no: true };
        if (q.op === 'moveUnits' && q.kind === 'units') return { units: [q.options[0]] };
        if (q.op === 'moveUnits' && q.kind === 'areas') return { area: q.options.find(a => a.system === near.ref.system && a.pos === near.ref.pos) || q.options[0] };
        if (q.kind === 'choice') return { choice: 1 };
        return null;
    });
    ok(trace.some(t => t.op === 'moveUnits'), 'перемещение предложено');
    eq(myUnits(st).filter(u => u.system === field.system && u.area === field.pos).length, 1, 'один отряд ушёл из области боя');
    eq(tokens(st, 'attacker').att, 2, '«если вы это сделали» — два жетона атаки');
});

check('Всегда в движении', 'два жетона атаки, если противник не потратит def. cube', () => {
    let st = deBattle({ card: 'Всегда в движении', units: { 'каббалиты-воины': 1 }, dice: [] });
    let trace = dePlay(st, (s2, q) => (q.op === 'avoid' ? { dice: [] } : null));
    eq(trace.find(t => t.op === 'avoid').options, [1], 'на оплату предложен только def. cube');
    eq(tokens(st, 'attacker').att, 2, 'без оплаты — два жетона');
    st = deBattle({ card: 'Всегда в движении', units: { 'каббалиты-воины': 1 }, dice: [] });
    dePlay(st, (s2, q) => (q.op === 'avoid' ? { dice: [q.options[0]] } : null));
    eq(tokens(st, 'attacker').att, 0, 'оплата — жетонов нет');
    eq(dice(st, 'defender'), ['att', 'morale'], 'def. cube противника потрачен');
});

check('Всегда в движении', 'способность отряда: куб любого вида — за кубик и жетон противоположных видов', () => {
    const st = deBattle({ card: 'Всегда в движении', units: { 'ведьмы': 1 }, dice: ['morale'] });
    const trace = dePlay(st, (s2, q) => {
        if (q.op === 'avoid') return { dice: [] };
        if (q.op === 'spendDie') return { dice: [0] };
        if (q.kind === 'choice') return { choice: 1 };
        return null;
    });
    ok(trace.some(t => t.op === 'spendDie'), 'оплата спрошена');
    eq(dice(st, 'attacker'), ['def'], 'кубик морали потрачен, получен кубик обороны');
    eq(tokens(st, 'attacker').att, 3, 'два жетона общей способности и жетон атаки ветки');
});

check('Тактика рейдеров', 'в защите: два жетона обороны; деморализованный в этом раунде отряд противника гибнет, если тот не платит morale cube', () => {
    // The Imperial Guard attacks with two Ogryns (health 4) and a morale cube;
    // three attack dice of the Dark Eldar rout one of them in the damage step.
    const run = pay => {
        const st = battle({ faction: FOE, foeFaction: DE, units: { 'огрины': 2 }, foeUnits: { 'каббалиты-воины': 2, 'ведьмы': 1 },
            card: 'Ложись!', foeCard: 'Тактика рейдеров', dice: ['morale'], foeDice: ['att', 'att', 'att'], roundEnd: true });
        const c = st.combat;
        play(st, 1, 0);
        eq(tokens(st, 'defender').def, 2, 'два жетона обороны');
        ok(!!ctx.CombatPlans.of(c).routedFoe, 'план уничтожения деморализованных записан');
        const asked = [];
        const policy = (s2, q) => {
            asked.push(q.op + '@' + answerSeat(s2));
            if (q.op === 'avoid') return pay ? { dice: [q.options[0]] } : { dice: [] };
            return null;
        };
        answerAll(st, policy, undefined);
        for (let i = 0; i < 10 && st.combat && st.combat.round === 1 && st.combat.step !== 'round-end'; i++) {
            if (st.pending) { answerAll(st, policy, undefined); continue; }
            const step = st.combat.step;
            if (step === 'damage-attacker' || step === 'damage-defender') {
                const side = step.slice(7);
                const seat = ctx.CombatHooks.of(st.combat).assignSeat(st.combat[side]);
                const targets = FS_RULES.damageCandidates(st, side).map(x => x.id);
                const r = FS_RULES.apply(st, seat, { type: 'combat', action: 'damage', targets });
                ok(r.ok, 'урон назначен: ' + (r.error || ''));
                continue;
            }
            FS_RULES.advanceCombatSteps(st);
        }
        return { st, asked };
    };
    let { st, asked } = run(false);
    eq(asked.filter(x => x === 'avoid@0').length, 1, 'противнику предложено откупиться за деморализованного Огрина');
    eq(myUnits(st).length, 1, 'без оплаты деморализованный Огрин уничтожен');
    eq(myUnits(st).filter(u => u.routed).length, 0, 'остался только недеморализованный');
    ({ st, asked } = run(true));
    eq(myUnits(st).length, 2, 'оплата — оба Огрина живы');
    eq(myUnits(st).filter(u => u.routed).length, 1, 'спасённый остаётся деморализованным');
    ok(!dice(st, 'attacker').includes('morale'), 'кубик морали потрачен');
});

check('Познание агонии', 'в следующем раунде карта противника выбирается случайно', () => {
    const st = deBattle({ card: 'Познание агонии', units: { 'опустошители': 1 }, dice: [], roundEnd: true });
    const c = st.combat;
    dePlay(st);
    eq(ctx.CombatBans.of(c).randomCardFor('defender'), false, 'в текущем раунде выбор свободный');
    eq((c.randomCardRounds || []).map(x => [x.side, x.round]), [['defender', 2]], 'запрет записан на второй раунд противнику');
    nextRound(st);
    eq(ctx.CombatBans.of(st.combat).randomCardFor('defender'), true, 'во втором раунде карта противника случайна');
    eq(ctx.CombatBans.of(st.combat).randomCardFor('attacker'), false, 'своя — нет');
});

check('Движимые ненавистью', 'способность отряда: противник теряет по кубику каждого вида', () => {
    const st = deBattle({ card: 'Движимые ненавистью', units: { 'опустошители': 1 }, dice: [], foeDice: ['att', 'att', 'def', 'morale'] });
    dePlay(st, branch(0));
    eq(tokens(st, 'attacker').att, 2, 'первая ветка — два жетона атаки');
    eq(dice(st, 'defender'), ['att'], 'потеряны att, def и morale');
});

check('Коварная одержимость', 'если противник не получил урона — он деморализует отряд в конце шага урона', () => {
    const run = hurt => {
        // Three attack tokens against two guardsmen: with `hurt` the dice add
        // real damage, without it the defence of the foe swallows the tokens.
        const st = deBattle({ card: 'Коварная одержимость', units: { 'опустошители': 1 }, foeUnits: { 'гвардейцы': 2 },
            dice: hurt ? ['att', 'att'] : [], foeDice: ['def', 'def', 'def'], roundEnd: true });
        const c = st.combat;
        dePlay(st);
        eq(tokens(st, 'attacker').att, 3, 'три жетона атаки');
        answerAll(st, null, 1);
        const asked = [];
        const policy = (s2, q) => { asked.push(q.op + '@' + answerSeat(s2)); return null; };
        for (let i = 0; i < 8 && st.combat && st.combat.round === 1 && !asked.length; i++) {
            if (st.pending) { answerAll(st, policy, undefined); continue; }
            const step = c.step;
            if (step === 'damage-attacker' || step === 'damage-defender') {
                const side = step.slice(7);
                const seat = side === 'attacker' ? c.attacker : c.defender;
                const targets = FS_RULES.damageCandidates(st, side).map(x => x.id);
                FS_RULES.apply(st, seat, { type: 'combat', action: 'damage', targets });
                continue;
            }
            if (step === 'round-end') break;
            FS_RULES.advanceCombatSteps(st);
        }
        return { st, asked };
    };
    let { st, asked } = run(false);
    eq(asked, ['route@1'], 'без урона противник выбирает, кого деморализовать');
    eq(foeUnits(st).filter(u => u.routed).length, 1, 'отряд противника деморализован');
    ({ st, asked } = run(true));
    eq(asked, [], 'получив урон, противник ничего не выбирает');
});

check('Наслаждение пытками', 'противник отступает отрядом, если не потратит att. или morale cube', () => {
    let st = deBattle({ card: 'Наслаждение пытками', units: { 'каббалиты-воины': 1 }, dice: [], foeDice: ['def', 'att', 'morale'] });
    let trace = dePlay(st, (s2, q) => (q.op === 'foePayFork' ? { dice: [] } : null));
    const fork = trace.find(t => t.op === 'foePayFork');
    ok(!!fork && fork.seat === 1, 'вопрос задан противнику');
    eq(fork.options, [1, 2], 'оплата — att. или morale');
    eq(foeUnits(st).filter(u => u.routed).length, 1, 'без оплаты отряд противника отступил');
    st = deBattle({ card: 'Наслаждение пытками', units: { 'каббалиты-воины': 1 }, dice: [], foeDice: ['def', 'att', 'morale'] });
    dePlay(st, (s2, q) => (q.op === 'foePayFork' ? { dice: [2] } : null));
    eq(dice(st, 'defender'), ['def', 'att'], 'кубик морали потрачен');
    eq(foeUnits(st).filter(u => u.routed).length, 0, 'оплата — никто не отступает');
});

check('Наслаждение пытками', 'способность отряда: при перевесе противника по morale он теряет кубик, иначе — жетоны хозяину', () => {
    let st = deBattle({ card: 'Наслаждение пытками', units: { 'опустошители': 1 }, dice: [], foeDice: ['morale', 'morale'] });
    dePlay(st, (s2, q) => (q.op === 'foePayFork' ? { dice: [0] } : null));
    eq(dice(st, 'defender'), [], 'противник заплатил одним и потерял второй кубик морали');
    eq(tokens(st, 'attacker').att + tokens(st, 'attacker').def, 0, 'жетонов при перевесе противника нет');
    st = deBattle({ card: 'Наслаждение пытками', units: { 'опустошители': 1 }, dice: ['morale'], foeDice: ['def', 'def'] });
    dePlay(st, (s2, q) => (q.op === 'foePayFork' ? { dice: [] } : null));
    eq([tokens(st, 'attacker').att, tokens(st, 'attacker').def], [2, 1], 'без перевеса противника — два жетона атаки и жетон обороны');
});

check('Добейте выживших', 'отказ отступить стоит кубика морали или обороны; отступление — бесплатно', () => {
    let st = deBattle({ card: 'Добейте выживших', units: { 'опустошители': 1 }, dice: [], foeDice: ['att', 'def', 'morale'] });
    let trace = dePlay(st, (s2, q) => {
        if (q.op === 'foeRetreatOffer') return { no: true };
        if (q.op === 'loseDie') return { dice: [2] };
        if (q.op === 'foeAllow') return { no: true };
        return null;
    });
    const lose = trace.find(t => t.op === 'loseDie');
    ok(!!lose && lose.seat === 1, 'кубик выбирает противник');
    eq(lose.options, [1, 2], 'на выбор — def. или morale');
    eq(dice(st, 'defender'), ['att', 'def'], 'потерян выбранный кубик морали');
    st = deBattle({ card: 'Добейте выживших', units: { 'опустошители': 1 }, dice: [], foeDice: ['att', 'def', 'morale'] });
    trace = dePlay(st, (s2, q) => {
        if (q.op === 'foeRetreatOffer') return {};
        if (q.op === 'foeAllow') return { no: true };
        return null;
    });
    ok(!trace.some(t => t.op === 'loseDie'), 'отступивший кубиков не теряет');
    eq(dice(st, 'defender').length, 3, 'все кубики противника целы');
    eq(foeUnits(st).filter(u => u.routed).length, 1, 'отряд отступил');
});

check('Добейте выживших', 'способность отряда: жетоны хозяину, если противник не уничтожит свой отряд', () => {
    let st = deBattle({ card: 'Добейте выживших', units: { 'опустошители': 1 }, dice: [] });
    dePlay(st, (s2, q) => {
        if (q.op === 'foeRetreatOffer') return {};
        if (q.op === 'foeAllow') return { no: true };
        return null;
    });
    eq([tokens(st, 'attacker').att, tokens(st, 'attacker').def], [1, 2], 'противник не жертвует — жетоны получены');
    eq(foeUnits(st).length, 2, 'отряды противника целы');
    st = deBattle({ card: 'Добейте выживших', units: { 'опустошители': 1 }, dice: [] });
    const trace = dePlay(st, (s2, q) => {
        if (q.op === 'foeRetreatOffer') return {};
        if (q.op === 'foeAllow') return {};
        if (q.op === 'destroy') return { units: [q.options[0]] };
        return null;
    });
    eq(trace.find(t => t.op === 'destroy').seat, 1, 'жертву выбирает противник');
    eq(foeUnits(st).length, 1, 'отряд противника уничтожен');
    eq(tokens(st, 'attacker').att + tokens(st, 'attacker').def, 0, 'жетонов нет');
});

head('Улучшения приказов', DE);

check('Воплощённая злоба', 'жетон подкрепления — за бесплатного Кабалита в любом дружественном мире', () => {
    const st = deOrder('deploy', { upgrades: ['Воплощённая злоба'], units: { 'каббалиты-воины': 1 }, structures: ['city'], materiel: 3, assets: { reinforcement: 1 } });
    const other = st.systems[1];
    FS_RULES.addUnit(st, 0, 'каббалиты-воины', other.id, worldOf(st, other.id));
    ok(burn(st, 'Воплощённая злоба').ok, 'карта сгорела');
    const asked = [];
    deAnswer(st, (s2, q) => {
        asked.push(q.op);
        if (q.kind === 'choice') return { choice: 0 };
        if (q.op === 'placeUnit' && q.kind === 'areas') return { area: q.options.find(a => a.system === other.id) || q.options[0] };
        return null;
    });
    ok(asked.includes('placeUnit'), 'размещение предложено');
    eq(st.players[0].assets.reinforcement, 0, 'жетон подкрепления потрачен');
    eq(myUnits(st).filter(u => u.system === other.id).length, 2, 'Кабалит встал в дружественный мир другой системы');
    eq(st.players[0].materiel, 3, 'бесплатно');
});

check('Воплощённая злоба', 'без жетона подкрепления остаётся только замена Кабалита на Ведьму в активной системе', () => {
    const st = deOrder('deploy', { upgrades: ['Воплощённая злоба'], units: { 'каббалиты-воины': 1 }, structures: ['city'], materiel: 3, assets: { reinforcement: 0 } });
    const other = st.systems[1];
    FS_RULES.addUnit(st, 0, 'каббалиты-воины', other.id, worldOf(st, other.id));
    ok(burn(st, 'Воплощённая злоба').ok, 'карта сгорела');
    const q = pending(st);
    ok(!!q && q.op === 'replaceUnit', 'без жетона выбора нет — сразу замена');
    eq(q.options.length, 1, 'предложен только Кабалит активной системы');
    effectAnswer(st, { units: [q.options[0]] });
    eq(unitsByType(st, 0), { 'Ведьмы': 1, 'Каббалиты-воины': 1 }, 'Кабалит активной системы стал Ведьмой');
    eq(st.players[0].materiel, 3, 'замена бесплатна');
});

check('Сила в боли', 'командный уровень на 1 выше, пока выполняется приказ', () => {
    const st = deOrder('strategize', { upgrades: ['Сила в боли'], units: { 'каббалиты-воины': 1 }, structures: ['city'], materiel: 5 });
    eq(FS_RULES.commandLevel(st, 0), 1, 'один город — уровень 1');
    ok(burn(st, 'Сила в боли').ok, 'карта сгорела');
    eq(FS_RULES.commandLevel(st, 0), 2, 'во время приказа — уровень 2');
    eq(FS_RULES.commandLevel(st, 1), 0, 'у противника ничего не изменилось');
    const order = st.order;
    st.order = null;
    eq(FS_RULES.commandLevel(st, 0), 1, 'без приказа бонуса нет');
    st.order = order;
});

check('Генератор теневого поля', 'отряды приходят в активную систему из двух соседних систем', () => {
    const run = withCard => {
        const st = deOrder('advance', { upgrades: ['Генератор теневого поля'], units: { 'каббалиты-воины': 1 }, structures: ['city'], materiel: 5,
            before: (s, sys0) => {
                const near = FS_RULES.neighbors(s, sys0.id);
                ok(near.length >= 2, 'у системы два соседа');
                FS_RULES.addUnit(s, 0, 'крейсеры-пыток', near[0], voidOf(s, near[0]));
                FS_RULES.addUnit(s, 0, 'крейсеры-пыток', near[1], voidOf(s, near[1]));
            } });
        const sys = st.systems[0];
        if (withCard) {
            ok(burn(st, 'Генератор теневого поля').ok, 'карта сгорела');
            eq(ctx.OrderMove.of(st.order).extraWays, 1, 'приказ помнит дополнительную систему');
        }
        const ships = myUnits(st).filter(u => u.system !== sys.id);
        const to = voidOf(st, sys.id);
        const first = FS_RULES.apply(st, 0, { type: 'moveUnits', moves: [{ unit: ships[0].id, system: sys.id, pos: to }] });
        ok(first.ok, 'первый корабль пришёл: ' + (first.error || ''));
        return FS_RULES.apply(st, 0, { type: 'moveUnits', moves: [{ unit: ships[1].id, system: sys.id, pos: to }] });
    };
    eq(run(false).ok, false, 'без карты вторая соседняя система закрыта');
    eq(run(true).ok, true, 'с картой второй корабль пришёл из другой системы');
});

const deStrike = (o = {}) => strikeState(Object.assign({ faction: DE, foeFaction: FOE, ships: { 'крейсеры-пыток': 2 }, foeUnits: { 'гвардейцы': 1 } }, o));

check('Охота за рабами', 'жетон подкрепления только при двух att. cube в броске удара', () => {
    const run = faces => {
        const st = deStrike({ upgrades: ['Охота за рабами'], assets: { reinforcement: 0 } });
        ok(burn(st, 'Охота за рабами').ok, 'карта сгорела');
        eq(st.players[0].assets.reinforcement, 0, 'до броска награды нет');
        fire(st, faces);
        effectAnswer(st, null, 4);
        return st;
    };
    let st = run(['att', 'att', 'def']);
    eq(st.players[0].assets.reinforcement, 1, 'два att. cube — жетон получен');
    eq(ctx.StrikeDamage.of(st).hits, 2, 'урон удара не тронут');
    st = run(['att', 'def', 'def']);
    eq(st.players[0].assets.reinforcement, 0, 'один att. cube — награды нет');
    ok(st.log.some(l => /недостаточно кубиков/.test(l.text || l)), 'причина записана');
});

check('Затмевающий спуск', 'бастион не защищает; за att. cube корабль уходит в другую пустоту системы — и бьётся там после удара', () => {
    const st = deStrike({ upgrades: ['Затмевающий спуск'], foeStructures: ['bastion'], foeUnits: { 'гвардейцы': 2 } });
    const sys = st.systems[0];
    // The command level of the card: two cities of the player.
    const own = myUnits(st).find(u => FS_RULES.unitOf(st, u).type === 'ground');
    st.structures.push({ id: 'c1', seat: 0, type: 'city', system: own.system, area: own.area });
    st.structures.push({ id: 'c2', seat: 0, type: 'city', system: own.system, area: own.area });
    // An enemy cruiser in the other void of the system.
    const from = myUnits(st).find(u => FS_RULES.unitOf(st, u).type === 'ship');
    const otherVoid = sys.areas.find(a => !a.world && a.pos !== from.area);
    ok(!!otherVoid, 'в системе две пустоты');
    FS_RULES.addUnit(st, 1, 'крейсеры', sys.id, otherVoid.pos);
    eq(FS_RULES.orbitalStrikeTargets(st, 0).length, 0, 'бастион закрывает мир');
    ok(burn(st, 'Затмевающий спуск').ok, 'карта сгорела');
    eq(!!st.order.ignoreBastion, true, 'бастион не защищает');
    ok(FS_RULES.orbitalStrikeTargets(st, 0).some(t => t.pos === st.strikeWorld), 'мир снова под ударом');
    fire(st, ['att', 'att', 'def']);
    let q = pending(st);
    eq([q && q.kind, q && q.op], ['choice', 'strikePayPick'], 'предложено потратить кубик');
    effectAnswer(st, { choice: 1 }, 1);
    q = pending(st);
    eq([q && q.op, q && q.kind], ['moveUnits', 'units'], 'выбирается корабль');
    effectAnswer(st, { units: [from.id] }, 1);
    q = pending(st);
    eq([q && q.op, q && q.kind], ['moveUnits', 'areas'], 'выбирается пустота');
    eq(q.options, [{ system: sys.id, pos: otherVoid.pos }], 'только другая пустота активной системы');
    effectAnswer(st, { area: q.options[0] });
    eq(myUnits(st).filter(u => u.area === otherVoid.pos).length, 1, 'корабль перешёл');
    eq(ctx.StrikeDamage.of(st).hits, 1, 'att. cube потрачен — один урон');
    ok((st.effectCombatQueue || []).some(e => e.system === sys.id && e.pos === otherVoid.pos), 'битва за пустоту ждёт конца удара');
    const victim = foeUnits(st).find(u => u.area === st.strikeWorld);
    ok(FS_RULES.apply(st, 1, { type: 'strikeDamage', unit: victim.id }).ok, 'урон удара назначен');
    ok(!!st.combat && st.combat.pos === otherVoid.pos, 'после удара началась битва в другой пустоте');
});

head('Карты событий', DE);

check('Поддержка чёрного сердца', 'бесплатный Крейсер в дружественной пустоте', () => {
    const st = deEvent('Поддержка чёрного сердца', { units: { 'каббалиты-воины': 1 }, ships: { 'крейсеры-пыток': 1 }, materiel: 3, assets: { forge: 1 } });
    ok(playEvent(st).ok, 'событие сыграно');
    deAnswer(st, (s2, q) => {
        if (q.kind === 'choice') return { choice: 0 };
        if (q.op === 'placeUnit' && q.kind === 'types') return { type: q.options[0] };
        return null;
    });
    eq(unitsByType(st, 0)['Крейсеры пыток'], 2, 'второй Крейсер размещён');
    eq([st.players[0].materiel, st.players[0].assets.forge], [3, 1], 'ни материи, ни кузницы не потрачено');
});

check('Поддержка чёрного сердца', 'за 2 материи и жетон кузницы Крейсер становится Гаснущим Солнцем', () => {
    const st = deEvent('Поддержка чёрного сердца', { units: { 'каббалиты-воины': 1 }, ships: { 'крейсеры-пыток': 1 }, materiel: 3, assets: { forge: 1 } });
    ok(playEvent(st).ok, 'событие сыграно');
    deAnswer(st, (s2, q) => (q.kind === 'choice' ? { choice: 1 } : null));
    eq(unitsByType(st, 0)['Гаснущие Солнца'], 1, 'Крейсер заменён');
    eq([st.players[0].materiel, st.players[0].assets.forge], [1, 0], 'две материи и жетон кузницы ушли');
    // Without the forge token the second branch is out of reach.
    const poor = deEvent('Поддержка чёрного сердца', { units: { 'каббалиты-воины': 1 }, ships: { 'крейсеры-пыток': 1 }, materiel: 3, assets: { forge: 0 } });
    ok(playEvent(poor).ok, 'событие сыграно');
    const q = pending(poor);
    ok(!!q && q.kind !== 'choice', 'без кузницы ветки замены нет');
});

check('Жуткие трофеи', 'свой отряд в мире гибнет ради материи по стоимости и жетонов подкрепления по боевому духу', () => {
    const st = deEvent('Жуткие трофеи', { units: { 'опустошители': 1, 'каббалиты-воины': 1 }, ships: { 'крейсеры-пыток': 1 }, materiel: 2, assets: { reinforcement: 0 } });
    ok(playEvent(st).ok, 'событие сыграно');
    const q = pending(st);
    ok(!!q && q.op === 'destroy', 'выбирается отряд');
    const ship = myUnits(st).find(u => FS_RULES.unitOf(st, u).type === 'ship');
    ok(!q.options.includes(ship.id), 'корабль в пустоте не предлагается');
    const victim = myUnits(st).find(u => FS_RULES.unitOf(st, u).id === 'опустошители');
    effectAnswer(st, { units: [victim.id] });
    const def = FS_CATALOG.unit(DE, 'опустошители');
    eq(st.players[0].materiel, 2 + def.cost, 'материя по стоимости Опустошителя');
    eq(st.players[0].assets.reinforcement, def.morale, 'жетоны подкрепления по его боевому духу');
    eq(myUnits(st).length, 2, 'отряд уничтожен');
});

check('Убийственная ловкость', 'в конце шага подкреплений противник деморализует отряд или платит кубики по его боевой мощи', () => {
    const run = pay => {
        const st = deBattle({ card: 'Охота на слабых', units: { 'каббалиты-воины': 2 }, foeUnits: { 'гвардейцы': 1, 'огрины': 1 }, dice: [], foeDice: ['att', 'def', 'morale'], roundEnd: true });
        const plan = deScheme(st, 'Убийственная ловкость');
        eq(plan.trigger, 'reinforce-end', 'план ждёт конца шага подкреплений');
        refuseReinforce(st);
        const q = pending(st);
        ok(!!q && q.kind === 'scheme', 'план предложен');
        const asked = [];
        deAnswer(st, (s2, q2) => {
            asked.push(q2.op + '@' + answerSeat(s2));
            if (q2.kind === 'scheme') return { choice: 0 };
            if (q2.op === 'destroyFoeUnlessPays' && q2.kind === 'units') return { units: [foeUnits(s2).find(u => FS_RULES.unitOf(s2, u).id === 'огрины').id] };
            if (q2.op === 'destroyFoeUnlessPays' && q2.kind === 'dice') return { dice: pay ? q2.options.slice(0, 2) : [] };
            return null;
        });
        eq(asked.slice(1), ['destroyFoeUnlessPays@1', 'destroyFoeUnlessPays@1'], 'противник выбирает отряд и решает, платить ли');
        return st;
    };
    let st = run(false);
    const ogryn = foeUnits(st).find(u => FS_RULES.unitOf(st, u).id === 'огрины');
    eq(ogryn.routed, true, 'Огрин деморализован');
    eq(dice(st, 'defender').length, 3, 'кубики целы');
    st = run(true);
    eq(foeUnits(st).filter(u => u.routed).length, 0, 'за два кубика (боевая мощь Огрина) никто не деморализован');
    eq(dice(st, 'defender').length, 1, 'два кубика потрачены');
    ok(!st.players[0].schemes.some(x => x.name === 'Убийственная ловкость'), 'план сброшен');
});

check('Рейд из Паутины', 'вместо раскрытия приказа: ресурсы и материя неконтролируемого мира', () => {
    const st = deEvent('Рейд из Паутины', { units: { 'каббалиты-воины': 1 }, materiel: 0, assets: { forge: 0, cache: 0, reinforcement: 0, prosperity: 0 } });
    ok(playEvent(st).ok, 'план взят');
    const plan = st.players[0].schemes.find(x => x.name === 'Рейд из Паутины');
    ok(!!plan && plan.trigger === 'operations' && plan.insteadOfOrder, 'план ждёт раскрытия приказа');
    st.phase = 'operations';
    st.turn = 0;
    st.order = null;
    FS_RULES.trimQueue(st).clear();
    const sys = st.systems[0];
    sys.tokens.push({ seat: 0, order: 'advance', faceUp: false });
    st.systems[2].tokens.push({ seat: 1, order: 'deploy', faceUp: false });
    st.players[0].placedTokens = 1;
    st.players[1].placedTokens = 1;
    const res = FS_RULES.apply(st, 0, { type: 'resolveOrder', system: sys.id });
    ok(res.ok && res.pending, 'план предложен вместо раскрытия');
    effectAnswer(st, { choice: 0 }, 1);
    const q = pending(st);
    ok(!!q && q.op === 'gainWorldAssets' && q.kind === 'areas', 'выбирается мир');
    ok(!q.options.some(a => a.system === st.sys && a.pos === st.pos), 'свой мир не предлагается');
    // A world with a production value and an asset of its own.
    const worldOfPick = a => (FS_RULES.area(FS_RULES.system(st, a.system), a.pos) || {}).world || {};
    const pick = q.options.find(a => worldOfPick(a).materiel && (worldOfPick(a).assets || []).length) || q.options[0];
    const world = worldOfPick(pick);
    effectAnswer(st, { area: pick });
    const p = st.players[0];
    eq(p.materiel, world.materiel || 0, 'материя по производству мира');
    const total = Object.values(p.assets).reduce((n, x) => n + x, 0);
    eq(total, (world.assets || []).length, 'ценные ресурсы мира получены');
    eq(sys.tokens[0].faceUp, false, 'приказ не раскрыт');
    eq(st.turn, 1, 'ход перешёл к противнику');
});

check('Праздник кровопролития', 'в начале раунда: отряд КЛ 1–2 гибнет, остальные уходят в соседнюю область', () => {
    const st = deBattle({ card: 'Охота на слабых', units: { 'каббалиты-воины': 2, 'ведьмы': 1, 'опустошители': 1 }, foeUnits: { 'гвардейцы': 2 }, dice: [], roundEnd: true });
    deScheme(st, 'Праздник кровопролития');
    const field = BattleField.of(st.combat);
    refuseReinforce(st);
    let q = pending(st);
    ok(!!q && q.kind === 'scheme', 'план предложен в начале раунда');
    effectAnswer(st, { choice: 0 }, 1);
    q = pending(st);
    ok(!!q && q.op === 'destroy', 'выбирается жертва');
    const kls = q.options.map(id => FS_RULES.unitOf(st, myUnits(st).find(u => u.id === id)).kl).sort();
    eq(kls, [1, 2], 'на выбор Ведьма (КЛ 1) и Опустошитель (КЛ 2), Кабалиты не годятся');
    const witch = myUnits(st).find(u => FS_RULES.unitOf(st, u).id === 'ведьмы');
    effectAnswer(st, { units: [witch.id] }, 1);
    q = pending(st);
    ok(!!q && q.op === 'moveUnits' && q.kind === 'units', 'выбираются уходящие');
    const kabalites = myUnits(st).filter(u => FS_RULES.unitOf(st, u).id === 'каббалиты-воины').map(u => u.id);
    effectAnswer(st, { units: kabalites }, 1);
    q = pending(st);
    ok(!!q && q.op === 'moveUnits' && q.kind === 'areas', 'выбирается область');
    const around = FS_RULES.areasAround(st, field.system, field.pos);
    ok(q.options.every(a => around.some(b => b.system === a.system && b.pos === a.pos)), 'предложены только соседние области');
    const dest = q.options.find(a => a.system === field.system) || q.options[0];
    effectAnswer(st, { area: dest });
    eq(myUnits(st).length, 3, 'Ведьма уничтожена');
    eq(myUnits(st).filter(u => u.system === dest.system && u.area === dest.pos).length, 2, 'Кабалиты ушли в соседнюю область');
    eq(myUnits(st).filter(u => u.area === field.pos).length, 1, 'Опустошитель остался в бою');
});

check('Праздник кровопролития', 'уход в область противника — новая битва после текущей', () => {
    const st = deBattle({ card: 'Охота на слабых', units: { 'каббалиты-воины': 2, 'ведьмы': 1 }, foeUnits: { 'гвардейцы': 1 }, dice: [], roundEnd: true });
    deScheme(st, 'Праздник кровопролития');
    const field = BattleField.of(st.combat);
    const near = adjacentWorld(st, field.system, field.pos);
    FS_RULES.addUnit(st, 1, 'гвардейцы', near.system, near.pos);
    refuseReinforce(st);
    deAnswer(st, (s2, q) => {
        if (q.kind === 'scheme') return { choice: 0 };
        if (q.op === 'destroy') return { units: [q.options[0]] };
        if (q.op === 'moveUnits' && q.kind === 'units') return { units: q.options };
        if (q.op === 'moveUnits' && q.kind === 'areas') return { area: q.options.find(a => a.system === near.system && a.pos === near.pos) };
        return null;
    });
    eq(myUnits(st).filter(u => u.system === near.system && u.area === near.pos).length, 2, 'Кабалиты вошли в мир противника');
    ok((st.effectCombatQueue || []).some(e => e.system === near.system && e.pos === near.pos && e.attacker === 0), 'битва за этот мир ждёт конца текущей');
});

check('Торговля рабами', 'материя в ценные ресурсы и обратно', () => {
    let st = deEvent('Торговля рабами', { units: { 'каббалиты-воины': 1 }, materiel: 3, assets: { forge: 0, cache: 0, reinforcement: 0 } });
    ok(playEvent(st).ok, 'событие сыграно');
    deAnswer(st, (s2, q) => {
        if (q.kind === 'choice') return { choice: 0 };
        if (q.op === 'exchangeMateriel') return { asset: 'cache' };
        return null;
    });
    eq([st.players[0].materiel, st.players[0].assets.cache, st.players[0].assets.forge], [1, 2, 0], 'две материи — два жетона тайника');
    st = deEvent('Торговля рабами', { units: { 'каббалиты-воины': 1 }, materiel: 0, assets: { forge: 2, cache: 1, reinforcement: 0 } });
    ok(playEvent(st).ok, 'событие сыграно');
    deAnswer(st, (s2, q) => {
        if (q.kind === 'choice') return { choice: 1 };
        if (q.op === 'exchangeAsset') return { asset: 'cache' };
        return null;
    });
    eq([st.players[0].materiel, st.players[0].assets.forge, st.players[0].assets.cache], [2, 2, 0], 'жетон тайника — две материи');
});

check('Убийственное представление', 'жетоны подкрепления снижают цену боевого улучшения на 2 каждый', () => {
    const st = deEvent('Убийственное представление', { units: { 'каббалиты-воины': 1 }, materiel: 0, assets: { reinforcement: 2 } });
    ok(playEvent(st).ok, 'событие сыграно');
    let q = pending(st);
    eq([q && q.op, q && q.stage], ['buyUpgrade', 'spend'], 'сначала — сколько жетонов потратить');
    eq(q.options, ['0', '1', '2'], 'до двух жетонов');
    effectAnswer(st, { choice: 1 }, 1);
    q = pending(st);
    eq([q && q.op, q && q.kind], ['buyUpgrade', 'cards'], 'затем — какую карту');
    eq(q.discount, 2, 'скидка за один жетон — 2');
    ok(q.options.includes('Тактика рейдеров'), 'улучшение за 2 материи доступно без материи');
    ok(!q.options.includes('Познание агонии'), 'улучшение за 4 — нет');
    effectAnswer(st, (s2, q2) => (q2.op === 'buyUpgrade' ? { card: 'Тактика рейдеров' } : firstOption(s2, q2)));
    eq(st.players[0].assets.reinforcement, 1, 'один жетон потрачен');
    eq(st.players[0].materiel, 0, 'материя не ушла в минус');
    ok(FS_RULES.player(st, 0).combatDeck.cards().includes('Тактика рейдеров'), 'карта куплена');
});

check('Видения Комморры', 'в начале фазы планирования: пропуск ближайшего размещения жетона приказа', () => {
    const st = deEvent('Видения Комморры', { units: { 'каббалиты-воины': 1 } });
    ok(playEvent(st).ok, 'план взят');
    const plan = st.players[0].schemes.find(x => x.name === 'Видения Комморры');
    ok(!!plan && plan.trigger === 'planning', 'план ждёт планирования');
    FS_RULES.addUnit(st, 1, 'гвардейцы', st.systems[1].id, worldOf(st, st.systems[1].id));
    st.phase = 'planning';
    st.turn = 0;
    for (const p of st.players) { p.placedTokens = 0; p.placedOf = {}; }
    FS_RULES.offerPlanningSchemes(st, 0);
    const q = pending(st);
    ok(!!q && q.kind === 'scheme', 'план предложен');
    effectAnswer(st, { choice: 0 });
    eq(st.turn, 1, 'очередь размещения перешла к противнику');
    ok(!st.players[0].schemes.some(x => x.name === 'Видения Комморры'), 'план сброшен');
});

// ============================================================================
//  Эльдары — real combat-card commands against 04-combat-cards.md.
//  This is deliberately not a claim that orders and schemes are covered yet.
// ============================================================================
const ELDAR = 'эльдары';
const eldarBattle = (o = {}) => battle(Object.assign({ faction: ELDAR,
    units: { 'аспектные-воины': 2, 'призрачные-стражи': 1 },
    foeUnits: { 'гвардейцы': 2 }, dice: ['morale'], foeDice: ['att', 'def'] }, o));
const eldarPlay = (st, policy) => { refuseReinforce(st); return play(st, 0, 0, policy); };
head('Боевая колода', ELDAR);

check('Воющие баньши', 'за morale противник сам выбирает свой отряд', () => {
    const st = eldarBattle({ card: 'Воющие баньши', dice: ['morale'] });
    const trace = eldarPlay(st, (s, q) => q.op === 'route' ? { units: [q.options.at(-1)] } : null);
    const pick = trace.find(x => x.op === 'route');
    ok(pick && pick.seat === 1, 'выбор должен принадлежать противнику');
    eq(foeUnits(st).filter(u => u.routed).map(u => u.id), [pick.answer.units[0]], 'выбранный противником отряд');
    eq(count(st, 'attacker', 'morale'), 0, 'цена уплачена');
});
check('Воющие баньши', 'без морали или носителя цена не списывается и враг не деморализован', () => {
    for (const opts of [{ dice: ['def'], units: { 'аспектные-воины': 1 } },
        { dice: ['morale'], units: { 'призрачные-стражи': 1 } }]) {
        const st = eldarBattle({ card: 'Воющие баньши', ...opts });
        eldarPlay(st);
        eq(foeUnits(st).filter(u => u.routed).length, 0, 'противник стоит');
    }
});
check('Воющие баньши', 'противник после оплаты обязан выбрать подкрепление, если это его единственный отряд', () => {
    for (const eldar of [0, 1]) for (const space of [false, true]) {
        const foe = 1 - eldar, ownSide = eldar === 0 ? 'attacker' : 'defender', foeSide = foe === 0 ? 'attacker' : 'defender';
        const factions = eldar === 0 ? [ELDAR, 'имперская-гвардия'] : ['имперская-гвардия', ELDAR];
        const mine = { [space ? 'фрегаты-класса-хелебор' : 'аспектные-воины']: 1 };
        const theirs = { [space ? 'крейсеры' : 'гвардейцы']: 1 };
        let st = battle({ faction: factions[0], foeFaction: factions[1], kind: space ? 'space' : 'ground',
            units: eldar === 0 ? mine : theirs, foeUnits: eldar === 1 ? mine : theirs, roundEnd: true });
        st.players[foe].assets.reinforcement = 1;
        for (const seat of [0, 1]) ok(FS_RULES.apply(st, seat, { type: 'combat', action: 'reinforce', count: seat === foe ? 1 : 0 }).ok, 'призыв');
        for (const u of st.units.filter(u => u.seat === foe).slice()) FS_RULES.destroyUnit(st, u);
        CombatTurn.of(st.combat).setDice(ownSide, ['morale']).setDice(foeSide, ['att']);
        const card = FS_DATA.combat.find(c => c.faction === ELDAR && c.name === 'Воющие баньши');
        FS_RULES.runEffects(st, eldar, FS_EFFECTS.parse(card.unit, { kind: 'combat', faction: ELDAR }),
            { kind: 'combat', ctx: { side: ownSide } });
        eq(pending(st)?.op, 'spendDie', 'предложена плата Эльдар');
        ok(FS_RULES.apply(st, eldar, { type: 'effect', answer: { dice: [0] } }).ok, 'мораль потрачена');
        const token = 'reinforce-' + foeSide + '-0';
        eq([pending(st)?.op, st.pending?.answerSeat, pending(st)?.options], ['route', foe, [token]], 'противник выбирает свой жетон');
        const before = JSON.stringify(st);
        eq(FS_RULES.apply(st, foe, { type: 'effect', answer: { units: [] } }).ok, false, 'противник не может пропустить оплаченный эффект');
        eq(JSON.stringify(st), before, 'пустой ответ не изменил бой');
        st = JSON.parse(JSON.stringify(st));
        ok(FS_RULES.apply(st, foe, { type: 'effect', answer: { units: [token] } }).ok, 'выбор после JSON');
        ok(CombatTokens.of(st.combat).flipped(foeSide).includes(0), 'жетон деморализован');
    }
});
check('Бей и беги', 'после оплаты движется один отряд в соседний подходящий мир', () => {
    const st = eldarBattle({ card: 'Бей и беги', dice: ['morale'] });
    const start = { system: st.combat.system, pos: st.combat.pos };
    const tr = eldarPlay(st);
    const pick = tr.find(x => x.op === 'moveUnits' && x.kind === 'units');
    const where = tr.find(x => x.op === 'moveUnits' && x.kind === 'areas');
    ok(pick && where, 'нужны выбор отряда и места: ' + JSON.stringify(tr));
    const target = where.answer.area;
    ok(FS_RULES.areasAround(st, start.system, start.pos).some(a => a.system === target.system && a.pos === target.pos), 'область соседняя');
    eq(myUnits(st).filter(u => u.system === target.system && u.area === target.pos).length, 1, 'переместился один');
    eq(tokens(st, 'attacker').att, 2, 'два жетона атаки');
});
check('Бей и беги', 'без оплаты перемещения нет', () => {
    const st = eldarBattle({ card: 'Бей и беги', dice: ['def'] });
    const tr = eldarPlay(st);
    eq(tr.some(x => x.op === 'moveUnits'), false, 'нет выбора движения');
});
check('Прикрытие призрачных стражей', 'оплата даёт восстановление отряда', () => {
    const st = eldarBattle({ card: 'Прикрытие призрачных стражей', dice: ['morale', 'att'], routed: [0] });
    eldarPlay(st, (s, q) => q.kind === 'choice' ? { choice: 1 } : null);
    eq(myUnits(st).filter(u => u.routed).length, 0, 'отряд восстановлен');
    eq(count(st, 'attacker', 'def'), 1, 'атака перевёрнута на оборону');
});
check('Парящие ястребы', 'за morale носитель даёт два жетона', () => {
    const st = eldarBattle({ card: 'Парящие ястребы', dice: ['morale'] });
    eldarPlay(st);
    eq(tokens(st, 'attacker').att, 2, 'получены жетоны');
    eq(count(st, 'attacker', 'morale'), 0, 'кубик потрачен');
});
check('Месть огненных драконов', 'атака блокирует новые жетоны обороны противника только на раунд', () => {
    const st = eldarBattle({ card: 'Месть огненных драконов', dice: ['att'], foeDice: ['att', 'att', 'att', 'att'], roundEnd: true });
    st.combat.tokens.defender.def = 1;
    eldarPlay(st);
    eq(tokens(st, 'attacker').def, 2, 'носитель получает собственные жетоны');
    answerAll(st, null, 1); // «Ложись!» tries to grant defence tokens.
    eq(tokens(st, 'defender').def, 1, 'существующий жетон остался, новые запрещены; trace=' + JSON.stringify(st.trace) + ' step=' + st.combat.step + ' round=' + st.combat.round);
    ctx.CombatCubes.of(st.combat).add('defender', 'att', 1);
    eq(tokens(st, 'defender').att, 1, 'жетоны другого типа разрешены');
    const copy = JSON.parse(JSON.stringify(st));
    ctx.CombatCubes.of(copy.combat).add('defender', 'def', 2);
    eq(copy.combat.tokens.defender.def, 1, 'запрет переживает JSON');
    copy.combat.round = 2;
    ctx.CombatCubes.of(copy.combat).add('defender', 'def', 2);
    eq(copy.combat.tokens.defender.def, 3, 'следующий раунд не запрещён');
});
check('Направление видящим', 'добровольная деморализация защищает отряды обеих сторон, но не бастион', () => {
    const st = eldarBattle({ card: 'Направление видящим', dice: ['att'], foeDice: ['att', 'att'] });
    st.structures.push({ id: 'eldar-bastion', seat: 0, type: 'bastion', system: st.combat.system, area: st.combat.pos });
    eldarPlay(st);
    eq(myUnits(st).filter(u => u.routed).length, 1, 'свой отряд деморализован');
    eq(FS_RULES.canTakeDamage(st, st.combat, 'attacker').map(x => x.id), ['eldar-bastion'], 'бастион остаётся целью');
    eq(FS_RULES.canTakeDamage(st, st.combat, 'defender').length, 0, 'отряды врага тоже защищены');
    const restored = JSON.parse(JSON.stringify(st));
    eq(FS_RULES.canTakeDamage(restored, restored.combat, 'defender').length, 0, 'защита сохраняется после JSON');
    restored.combat.round = 2;
    ok(FS_RULES.canTakeDamage(restored, restored.combat, 'defender').length > 0, 'защита закончилась');
});
check('Направление видящим', 'отказ или отсутствие стоящего отряда не включает защиту', () => {
    const st = eldarBattle({ card: 'Направление видящим', dice: ['att'] });
    eldarPlay(st, (s, q) => q.kind === 'ability' && /добровольно/.test(q.text) ? { no: true } : null);
    eq(myUnits(st).filter(u => u.routed).length, 0, 'отряд не деморализован');
    ok(FS_RULES.canTakeDamage(st, st.combat, 'defender').length > 0, 'противник не защищён');
});
check('Голограмма поля боя', 'карта берётся из колоды, а не разыгрывается и не сбрасывается', () => {
    const st = eldarBattle({ card: 'Голограмма поля боя', units: { 'аспектные-воины': 1 } });
    st.players[0].decks.combat = ['Бей и беги'];
    const trace = eldarPlay(st);
    eq(st.combat.cards.attacker.hand, ['Бей и беги'], 'карта в руке');
    eq(st.players[0].decks.combat.length, 0, 'карта ушла из колоды');
    eq(st.combat.cards.attacker.played.map(x => x.name), ['Голограмма поля боя'], 'на столе лишь разыгранная карта');
    eq(trace.some(x => x.op === 'discardHand' || x.op === 'playCard'), false, 'нет сброса или розыгрыша');
});
check('Голограмма поля боя', 'титан может разыграть карту из руки только ради значков', () => {
    const st = eldarBattle({ card: 'Голограмма поля боя', hand: ['Голограмма поля боя', 'Бей и беги'], units: { 'боевые-титаны-класса-варлок': 1 } });
    st.players[0].decks.combat = [];
    const trace = eldarPlay(st);
    ok(trace.some(x => x.op === 'playCard'), 'запрошена карта с руки: ' + JSON.stringify(trace) + ' reqs=' + JSON.stringify(FS_DATA.combat.find(x => x.name === 'Голограмма поля боя')));
    const laid = st.combat.cards.attacker.played.find(x => x.name === 'Бей и беги');
    ok(laid && laid.valuesOnly, 'карта кладётся только значками');
    eq(tokens(st, 'attacker').att, 0, 'способности второй карты не сработали');
});
check('Психокопьё', 'противник отказывает — четыре жетона, случайный сброс из руки обязателен', () => {
    const st = eldarBattle({ card: 'Психокопьё', units: { 'боевые-титаны-класса-варлок': 1 }, foeHand: ['Ложись!', 'За Императора!'] });
    playedBefore(st, 'defender', 'Огневая поддержка');
    const tr = eldarPlay(st, (s, q) => q.op === 'foeAllow' ? { no: true } : null);
    ok(tr.some(x => x.op === 'foeAllow' && x.seat === 1), 'противник решает: ' + JSON.stringify(tr));
    eq(tokens(st, 'attacker').att, 4, 'четыре жетона за отказ');
    eq(st.combat.cards.defender.hand.length, 0, 'после выбора карты и случайного сброса рука пуста; trace=' + JSON.stringify(tr) + ' log=' + JSON.stringify(st.log));
    ok(CombatCards.of(st.combat).has('defender', 'Огневая поддержка'), 'открытая карта осталась');
});
check('Психокопьё', 'противник разрешает — владелец карты сам выбирает открытую, жетонов нет', () => {
    const st = eldarBattle({ card: 'Психокопьё', units: { 'боевые-титаны-класса-варлок': 1 }, foeHand: ['Ложись!', 'За Императора!'] });
    playedBefore(st, 'defender', 'Огневая поддержка');
    playedBefore(st, 'defender', 'Железная дисциплина');
    const tr = eldarPlay(st, (s, q) => q.op === 'discardFoeCard' ? { card: 'Железная дисциплина' } : null);
    const pick = tr.find(x => x.op === 'discardFoeCard');
    ok(pick && pick.seat === 0, 'цель выбирает владелец Психокопья: ' + JSON.stringify(tr));
    eq(tokens(st, 'attacker').att, 0, 'жетонов за разрешение нет');
    eq(CombatCards.of(st.combat).has('defender', 'Железная дисциплина'), false, 'выбранная карта сброшена');
    ok(CombatCards.of(st.combat).has('defender', 'Огневая поддержка'), 'другая открытая карта на месте');
});

check('Месть огненных драконов', 'сброс именно открытой карты прекращает её запрет, включая после JSON', () => {
    const st = eldarBattle({ card: 'Месть огненных драконов', dice: ['att'], foeDice: ['att', 'att', 'att'] });
    eldarPlay(st);
    const clone = JSON.parse(JSON.stringify(st));
    ctx.CombatCubes.of(clone.combat).add('defender', 'def', 1);
    eq(clone.combat.tokens.defender.def, 0, 'до сброса получение запрещено');
    CombatCards.of(clone.combat).take('attacker', 'Месть огненных драконов');
    ctx.CombatCubes.of(clone.combat).add('defender', 'def', 1);
    eq(clone.combat.tokens.defender.def, 1, 'после сброса карты запрет снят');
});
check('Направление видящим', 'сброс открытой карты снимает защиту даже после JSON', () => {
    const st = eldarBattle({ card: 'Направление видящим', dice: ['att'], foeDice: ['att', 'att', 'att'] });
    eldarPlay(st);
    const clone = JSON.parse(JSON.stringify(st));
    eq(FS_RULES.canTakeDamage(clone, clone.combat, 'defender').length, 0, 'до сброса отряды защищены');
    CombatCards.of(clone.combat).take('attacker', 'Направление видящим');
    ok(FS_RULES.canTakeDamage(clone, clone.combat, 'defender').length > 0, 'сброс снимает защиту');
});
check('Направление видящим', 'действительный урон нельзя назначить отряду; без целей кнопка завершает шаг', () => {
    const st = eldarBattle({ card: 'Направление видящим', dice: ['att', 'att', 'att', 'att'], foeDice: ['att', 'att', 'att', 'att'], roundEnd: true });
    eldarPlay(st);
    answerAll(st, null, 1);
    st.combat.step = 'damage-defender';
    ok(FS_RULES.combatDamageFor(st, 'defender') > 0, 'врагу причиняется урон');
    const victim = foeUnits(st)[0];
    const attempted = FS_RULES.apply(st, 1, { type: 'combat', action: 'damage', targets: [victim.id] });
    eq(attempted.ok, false, 'защищённый отряд выбрать нельзя: ' + JSON.stringify({attempted, round: st.combat && st.combat.round, plan: st.combat && st.combat.unitProtection, played: st.combat && st.combat.cards.attacker.played, trace: st.trace}));
    const game = Object.create(FSGame.prototype);
    game.damageTargets = []; game.fillHand = () => {}; game.canPlayCard = () => false;
    let sent = null; game.net = { cmd: cmd => { sent = cmd; } };
    const view = { actions: [] };
    game.panelCombat(Object.assign({}, st, { seat: 1 }), view);
    const accept = view.actions.find(x => x.kind === 'primary');
    ok(accept && accept.enabled, 'при отсутствии целей кнопка не заблокирована');
    accept.onClick();
    eq(sent && sent.targets, [], 'панель отправила пустое распределение');
    const res = FS_RULES.apply(st, 1, sent);
    ok(res.ok, 'движок завершил шаг без урона отряду: ' + JSON.stringify(res));
    ok(st.units.some(u => u.id === victim.id), 'отряд остался жив');
});
check('Руководство Аутарха', 'выбор морали и дополнительная карта только значками', () => {
    const st = eldarBattle({ card: 'Руководство Аутарха', hand: ['Руководство Аутарха', 'Бей и беги'], dice: [] });
    const tr = eldarPlay(st, (s, q) => q.kind === 'choice' ? { choice: 1 } : null);
    ok(tr.some(x => x.op === 'playCard'), 'выбор карты с руки');
    eq(count(st, 'attacker', 'morale'), 1, 'мораль получена');
    ok(st.combat.cards.attacker.played.some(c => c.name === 'Бей и беги' && c.valuesOnly), 'карта только значками');
    eq(tokens(st, 'attacker').att, 0, 'способность второй карты не сработала');
});
check('Атакующие скорпионы', 'противник выбирает и теряет один свой кубик', () => {
    const st = eldarBattle({ card: 'Атакующие скорпионы', foeDice: ['att', 'def', 'morale'] });
    const tr = eldarPlay(st, (s, q) => q.op === 'loseDie' ? { dice: [q.options.at(-1)] } : null);
    const loss = tr.find(x => x.op === 'loseDie');
    ok(loss && loss.seat === 1, 'выбор кубика за противником');
    eq(dice(st, 'defender'), ['att', 'def'], 'потерян выбранный кубик морали');
});
check('Наступление призрачных стражей', 'противник платит morale или сам выбирает отряд для деморализации', () => {
    for (const pay of [true, false]) {
        const st = eldarBattle({ card: 'Наступление призрачных стражей', foeDice: ['morale', 'def'], dice: ['def'] });
        const tr = eldarPlay(st, (s, q) => q.op === 'foePayFork' ? { dice: pay ? [q.options[0]] : [] }
            : q.kind === 'choice' ? { choice: 1 } : null);
        eq(foeUnits(st).filter(u => u.routed).length, pay ? 0 : 1, 'ветка деморализации');
        if (!pay) ok(tr.some(x => x.op === 'route' && x.seat === 1), 'противник сам выбирает');
        eq(count(st, 'attacker', 'att'), 1, 'перевёрнут кубик обороны');
    }
});
check('Наследие Ваула', 'два жетона кузницы соблюдают общий предел', () => {
    for (const [before, expected] of [[0, 2], [2, 3], [3, 3]]) {
        const st = eventState('Наследие Ваула', { faction: ELDAR, assets: { forge: before } });
        ok(playEvent(st).ok, 'событие сыграно');
        answerAll(st);
        eq(st.players[0].assets.forge, expected, 'жетоны после события');
    }
});

check('Волновой змей', 'носитель за morale перемещает только КЛ 0–1 и только в соседнюю область', () => {
    const st = eldarBattle({ card: 'Волновой змей', units: { 'гравитанки-сокол': 1,
        'аспектные-воины': 2, 'призрачные-стражи': 1, 'боевые-титаны-класса-варлок': 1 },
        dice: ['morale'], foeDice: ['att'] });
    const before = { system: st.combat.system, pos: st.combat.pos };
    const tr = eldarPlay(st, (s, q) => q.op === 'moveUnits' && q.kind === 'units'
        ? { units: q.options.slice(0, 2) } : null);
    const pick = tr.find(x => x.op === 'moveUnits' && x.kind === 'units');
    const target = tr.find(x => x.op === 'moveUnits' && x.kind === 'areas');
    ok(pick && target, 'должны быть вопросы об отрядах и области');
    ok(pick.options.every(id => (FS_RULES.unitOf(st, st.units.find(u => u.id === id)) || {}).kl <= 1), 'только КЛ 0–1');
    ok(FS_RULES.areasAround(st, before.system, before.pos).some(a => a.system === target.answer.area.system && a.pos === target.answer.area.pos), 'область соседняя');
    eq(myUnits(st).filter(u => u.system === target.answer.area.system && u.area === target.answer.area.pos).length, 2, 'перемещены выбранные отряды');
    eq(tokens(st, 'attacker').def, 3, 'противник без морали не отменяет три жетона обороны: ' + JSON.stringify({tr, log:st.log, round:st.combat.round}));
});
// An ordinary three-player advance, rather than a battle-only test fixture:
// the Eldar can play the card as attacker OR defender, and its target belongs
// to a third player.  The first battle must finish before the second one starts.
function waveAdvance(eldarAttacks, opts = {}) {
    const eldar = eldarAttacks ? 0 : 1;
    const factions = eldarAttacks ? [ELDAR, FOE, 'космодесант-хаоса'] : [FOE, ELDAR, 'космодесант-хаоса'];
    const st = FS_RULES.newReadyGame({ seed: 5, players: factions.map((faction, i) => ({ faction, name: 'P' + i, id: 'p' + i })) });
    st.units = []; st.structures = []; st.objectives = []; st.storms = [];
    for (const sys of st.systems) sys.tokens = [];
    st.phase = 'operations'; st.turn = 0; st.order = null;
    for (const p of st.players) p.assets.reinforcement = 0;
    if (opts.reinforcements) st.players[eldar].assets.reinforcement = opts.reinforcements;
    const fits = (s, a) => {
        if (!a.world) return false;
        const worlds = FS_RULES.areasAround(st, s.id, a.pos)
            .filter(n => FS_RULES.area(FS_RULES.system(st, n.system), n.pos).world);
        const local = worlds.filter(n => n.system === s.id);
        return opts.cross ? local.length >= 1 && worlds.some(n => n.system !== s.id) : local.length >= 2;
    };
    const sys = st.systems.find(s => s.areas.some(a => fits(s, a)));
    ok(sys, 'нужны соседние миры для исходного боя и цели');
    const field = sys.areas.find(a => fits(sys, a)).pos;
    const worlds = FS_RULES.areasAround(st, sys.id, field)
        .filter(n => FS_RULES.area(FS_RULES.system(st, n.system), n.pos).world);
    const local = worlds.filter(n => n.system === sys.id);
    const source = local[0].pos;
    const destination = opts.cross ? worlds.find(n => n.system !== sys.id) : local[1];
    const target = destination.pos;
    const eldarAt = eldarAttacks ? source : field;
    const guardAt = eldarAttacks ? field : source;
    const falcon = FS_RULES.addUnit(st, eldar, 'гравитанки-сокол', sys.id, eldarAt);
    const aspect = FS_RULES.addUnit(st, eldar, 'аспектные-воины', sys.id, eldarAt);
    const guard = FS_RULES.addUnit(st, 1 - eldar, 'гвардейцы', sys.id, guardAt);
    if (opts.holdSource && !eldarAttacks) FS_RULES.addUnit(st, 0, 'гвардейцы', sys.id, source);
    FS_RULES.addUnit(st, 2, 'культисты', destination.system, target);
    sys.tokens.push({ seat: 0, order: 'advance', faceUp: false });
    st.systems.find(s => s.id !== sys.id).tokens.push({ seat: 1, order: 'advance', faceUp: false });
    ok(FS_RULES.apply(st, 0, { type: 'resolveOrder', system: sys.id }).ok, 'раскрыт реальный приказ');
    ok(FS_RULES.apply(st, 0, { type: 'endAdvance' }).ok, 'закончен шаг кораблей');
    const ids = eldarAttacks ? [falcon.id, aspect.id] : [guard.id];
    ok(FS_RULES.apply(st, 0, { type: 'moveUnits', moves: ids.map(unit => ({ unit, system: sys.id, pos: field })) }).ok,
        'первоначальные атакующие вошли');
    ok(FS_RULES.apply(st, 0, { type: 'endAdvance' }).ok, 'первоначальный бой начат');
    eq([st.combat.attacker, st.combat.defender], [0, 1], 'стороны первоначального боя');
    const side = eldarAttacks ? 'attacker' : 'defender';
    if (opts.reinforcements) {
        eq(st.combat.step, 'reinforce-' + side, 'подкрепления выбираются на настоящем шаге');
        ok(FS_RULES.apply(st, eldar, { type: 'combat', action: 'reinforce', count: opts.reinforcements }).ok,
            'подкрепления введены настоящей командой');
    }
    st.combat.cards[side].hand = ['Волновой змей', 'Атакующие скорпионы', 'Атакующие скорпионы'];
    st.combat.cards[eldarAttacks ? 'defender' : 'attacker'].hand = ['Ложись!', 'Ложись!', 'Ложись!'];
    st.combat.dice[side] = ['morale', 'def'];
    st.combat.dice[eldarAttacks ? 'defender' : 'attacker'] = ['def', 'def'];
    return { st, eldar, field, source, target, targetSystem: destination.system, sys: sys.id, aspect: aspect.id };
}

/** Play real commands until the battle reaches the retreat step. */
function waveToRetreat(st) {
    for (let i = 0; i < 80 && st.combat && st.combat.step !== 'retreat'; i++) {
        const c = st.combat;
        let res;
        if (st.pending) {
            const q = pending(st), seat = st.pending.answerSeat ?? st.pending.seat;
            res = FS_RULES.apply(st, seat, { type: 'effect', answer: q.kind === 'ability' ? { no: true } : firstOption(st, q) });
        } else if (c.step.startsWith('choose-')) {
            const side = c.step.slice('choose-'.length);
            res = FS_RULES.apply(st, c[side], { type: 'combat', action: 'playCard', index: 0 });
        } else if (c.step.startsWith('reinforce-')) {
            const side = c.step.slice('reinforce-'.length);
            res = FS_RULES.apply(st, c[side], { type: 'combat', action: 'reinforce', count: 0 });
        } else if (c.step.startsWith('damage-')) {
            const side = c.step.slice('damage-'.length), seat = ctx.CombatHooks.of(c).assignSeat(c[side]);
            res = FS_RULES.apply(st, seat, { type: 'combat', action: 'damage', targets: FS_RULES.damageCandidates(st, side).map(x => x.id) });
        } else { FS_RULES.advanceCombatSteps(st); continue; }
        ok(res.ok, 'команда продолжения боя: ' + (res.error || ''));
    }
    ok(st.combat && st.combat.step === 'retreat', 'бой дошёл до отступления');
}

function reachWaveUnits(st) {
    for (const side of ['attacker', 'defender'])
        ok(FS_RULES.apply(st, st.combat[side], { type: 'combat', action: 'playCard', index: 0 }).ok, 'карта выложена');
    for (let i = 0; i < 30 && st.pending; i++) {
        const q = pending(st), seat = st.pending.answerSeat ?? st.pending.seat;
        if (q.op === 'moveUnits' && q.kind === 'units') return q;
        const answer = q.kind === 'ability' ? (/переместить любое количество/i.test(q.text) ? { yes: true } : { no: true })
            : firstOption(st, q);
        const res = FS_RULES.apply(st, seat, { type: 'effect', answer });
        ok(res.ok, 'ответ при вскрытии: ' + (res.error || '') + ' · ' + q.kind + '/' + q.op);
    }
    throw new Error('нет выбора отрядов «Волнового змея»: ' + JSON.stringify({
        step: st.combat?.step, pending: st.pending?.question, log: st.log.slice(-10), dice: st.combat?.dice,
    }));
}

function revealWave(st, a) {
    const q = reachWaveUnits(st);
    ok(q.options.includes(a.aspect), 'отряд предложен');
    ok(FS_RULES.apply(st, a.eldar, { type: 'effect', answer: { units: [a.aspect] } }).ok, 'выбран отряд');
    eq([pending(st)?.kind, pending(st)?.op], ['areas', 'moveUnits'], 'предложено направление');
    ok(FS_RULES.apply(st, a.eldar, { type: 'effect', answer: { area: { system: a.targetSystem || a.sys, pos: a.target } } }).ok,
        'способность настоящей карты переместила отряд');
}

check('Волновой змей', 'после настоящего боя запускается новый: атакующий, происхождение, undo и JSON', () => withFixedDice(['def'], () => {
    for (const eldarAttacks of [true, false]) {
        const a = waveAdvance(eldarAttacks);
        let { st } = a;
        revealWave(st, a);
        eq([st.combat.system, st.combat.pos], [a.sys, a.field], 'первый бой ещё продолжается');
        st = JSON.parse(JSON.stringify(st));
        waveToRetreat(st);
        const firstLoser = st.combat.loser, firstTargets = FS_RULES.retreatTargets(st, firstLoser);
        const firstRetreat = FS_RULES.apply(st, firstLoser, { type: 'combat', action: 'retreat',
            ...(firstTargets.length ? { target: firstTargets[0] } : {}) });
        ok(firstRetreat.ok, 'первый бой разрешён');
        ok(st.combat, 'после первого боя начался отложенный');
        eq([st.combat.system, st.combat.pos, st.combat.attacker, st.combat.defender],
            [a.sys, a.target, a.eldar, 2], 'инициатор карты атакует третьего игрока');
        eq([st.combat.viaAdvance, st.combat.attackerFrom], [false, [{ system: a.sys, pos: a.field }]],
            'источник — мир первоначального боя, не старый приказ');
        eq(st.order?.seat, 0, 'исходный приказ ещё не завершён');
        eq(FS_RULES.apply(st, 0, { type: 'undoMove' }).ok, false, 'нельзя отменить исходный марш после сыгранного боя');
        st.combat.cards.attacker.hand = ['Атакующие скорпионы', 'Атакующие скорпионы', 'Атакующие скорпионы'];
        st.combat.cards.defender.hand = ['Отвратное поколение', 'Отвратное поколение', 'Отвратное поколение'];
        st.combat.dice = { attacker: ['def', 'def'], defender: ['def', 'def'] };
        st = JSON.parse(JSON.stringify(st));
        waveToRetreat(st);
        eq(st.combat.loser, a.eldar, 'в ничьей атакующий проигрывает');
        eq(FS_RULES.retreatTargets(st, a.eldar), [{ system: a.sys, pos: a.field }], 'отряд отступает только в исходную область');
        ok(FS_RULES.apply(st, a.eldar, { type: 'combat', action: 'retreat', target: { system: a.sys, pos: a.field } }).ok,
            'второй бой разрешён');
        eq([st.combat, st.order, st.turn], [null, null, 1], 'завершён исходный приказ и ход передан следующему месту');
        const survivor = st.units.find(u => u.id === a.aspect);
        eq([survivor?.system, survivor?.area, survivor?.routed], [a.sys, a.field, true], 'атакующий вернулся деморализованным');
    }
}));

check('Волновой змей', 'соседний мир за границей: шторм, источник и отступление без пути', () => withFixedDice(['def'], () => {
    for (const when of ['before-move', 'after-combat', 'no-storm']) {
        const a = waveAdvance(false, { cross: true, holdSource: true });
        let { st } = a;
        const target = { system: a.targetSystem, pos: a.target };
        const side = ['N', 'E', 'S', 'W'].find(d => FS_RULES.across(st, a.sys, d) === a.targetSystem);
        ok(side, 'цель и поле боя разделяют грань систем');
        const storm = { id: 'wave-border', system: a.sys, side, moved: false };
        if (when === 'before-move') st.storms = [storm];
        const q = reachWaveUnits(st);
        ok(q.options.includes(a.aspect), 'наземный отряд предложен');
        ok(FS_RULES.apply(st, a.eldar, { type: 'effect', answer: { units: [a.aspect] } }).ok, 'отряд выбран');
        const options = pending(st).options;
        eq(options.some(x => x.system === target.system && x.pos === target.pos), when !== 'before-move',
            'шторм закрывает только переход через его грань');
        ok(options.every(x => FS_RULES.area(FS_RULES.system(st, x.system), x.pos).world), 'наземным предлагаются только миры');
        if (when === 'before-move') {
            const before = JSON.stringify(st);
            eq(FS_RULES.apply(st, a.eldar, { type: 'effect', answer: { area: target } }).ok, false, 'ответ за штормом отклонён');
            eq(JSON.stringify(st), before, 'ошибка сохраняет вопрос и выбор отряда');
            ok(options.some(x => x.system === a.sys && x.pos === a.source), 'другая соседняя область доступна');
            ok(FS_RULES.apply(st, a.eldar, { type: 'effect', answer: { area: { system: a.sys, pos: a.source } } }).ok,
                'после отказа можно выбрать допустимую область');
            continue;
        }
        st = JSON.parse(JSON.stringify(st));
        ok(FS_RULES.apply(st, a.eldar, { type: 'effect', answer: { area: target } }).ok, 'переход без шторма после JSON');
        waveToRetreat(st);
        const loser = st.combat.loser, firstTargets = FS_RULES.retreatTargets(st, loser);
        ok(FS_RULES.apply(st, loser, { type: 'combat', action: 'retreat',
            ...(firstTargets.length ? { target: firstTargets[0] } : {}) }).ok, 'первый бой завершён');
        eq([st.combat?.system, st.combat?.pos, st.combat?.attackerFrom],
            [target.system, target.pos, [{ system: a.sys, pos: a.field }]], 'новый бой помнит трансграничный источник');
        ok(FS_RULES.retreatTargets(st, 2).every(x => x.system !== a.sys),
            'защитник не может отступить в соседнюю систему происхождения атакующих');
        st.combat.cards.attacker.hand = ['Атакующие скорпионы', 'Атакующие скорпионы', 'Атакующие скорпионы'];
        st.combat.cards.defender.hand = ['Отвратное поколение', 'Отвратное поколение', 'Отвратное поколение'];
        st.combat.dice = { attacker: ['def', 'def'], defender: ['def', 'def'] };
        st = JSON.parse(JSON.stringify(st));
        waveToRetreat(st);
        eq(st.combat.loser, a.eldar, 'атакующий проиграл новый бой');
        if (when === 'after-combat') st.storms = [storm]; // synthetic intervening storm at retreat
        const allowed = FS_RULES.retreatTargets(st, a.eldar);
        eq(allowed, when === 'after-combat' ? [] : [{ system: a.sys, pos: a.field }],
            'источник единственный; при шторме путь закрыт');
        ok(FS_RULES.apply(st, a.eldar, { type: 'combat', action: 'retreat',
            ...(allowed.length ? { target: allowed[0] } : {}) }).ok, 'отступление или уничтожение');
        const unit = st.units.find(u => u.id === a.aspect);
        if (when === 'after-combat') ok(!unit, 'при отсутствии пути отряд уничтожен');
        else eq([unit?.system, unit?.area, unit?.routed], [a.sys, a.field, true], 'отступил в источник деморализованным');
        eq([st.combat, st.order, st.turn], [null, null, 1], 'исходный ход завершён');
    }
}));

check('Волновой змей', 'устаревшие цели и отряды повторно проверяются, ошибка сохраняет вопрос', () => withFixedDice(['def'], () => {
    for (const stale of ['destination', 'unit']) {
        const a = waveAdvance(false, { holdSource: true });
        let { st } = a;
        reachWaveUnits(st);
        ok(FS_RULES.apply(st, a.eldar, { type: 'effect', answer: { units: [a.aspect] } }).ok, 'выбран отряд');
        ok(pending(st).options.some(x => x.system === a.sys && x.pos === a.target), 'первоначальная цель предложена');
        // Artificially change the saved board between two questions, to model a
        // stale client/snapshot. A third owner invalidates the destination; a
        // routed unit cannot be moved even if its id was previously offered.
        if (stale === 'destination') FS_RULES.addStructure(st, 0, 'city', a.sys, a.target);
        else FS_RULES.routeUnit(st, st.units.find(u => u.id === a.aspect));
        st = JSON.parse(JSON.stringify(st));
        const before = JSON.stringify(st);
        const res = FS_RULES.apply(st, a.eldar, { type: 'effect', answer: { area: { system: a.sys, pos: a.target } } });
        eq(res.ok, false, 'устаревший ответ отклонён');
        eq(JSON.stringify(st), before, 'ошибка не меняет состояние и оставляет прежний вопрос');
        eq([pending(st)?.kind, pending(st)?.op], ['areas', 'moveUnits'], 'вопрос направления сохранён');
        if (stale === 'destination') {
            ok(FS_RULES.apply(st, a.eldar, { type: 'effect', answer: { area: { system: a.sys, pos: a.source } } }).ok,
                'после отказа можно выбрать другое по-прежнему законное направление');
        }
    }
}));

check('Волновой змей', 'дополнительное продвижение Тау ждёт второй бой и возвращает основной приказ', () => withFixedDice(['def'], () => {
    let st = FS_RULES.newReadyGame({ seed: 5, players: [TAU, ELDAR, CHAOS]
        .map((faction, seat) => ({ faction, name: 'P' + seat, id: 'p' + seat })) });
    st.units = []; st.structures = []; st.objectives = []; st.storms = [];
    for (const sys of st.systems) sys.tokens = [];
    for (const p of st.players) p.assets.reinforcement = 0;
    st.phase = 'operations'; st.turn = 0; st.order = null;
    const sys = st.systems.find(s => s.areas.some(a => a.world
        && FS_RULES.areasAround(st, s.id, a.pos).filter(n => n.system === s.id && FS_RULES.area(s, n.pos).world).length >= 2));
    ok(sys, 'есть три соседних мира');
    const field = sys.areas.find(a => a.world && FS_RULES.areasAround(st, sys.id, a.pos)
        .filter(n => n.system === sys.id && FS_RULES.area(sys, n.pos).world).length >= 2).pos;
    const [source, target] = FS_RULES.areasAround(st, sys.id, field)
        .filter(n => n.system === sys.id && FS_RULES.area(sys, n.pos).world).map(n => n.pos);
    const actor = FS_RULES.addUnit(st, 0, 'воины-огня', sys.id, source);
    const other = FS_RULES.addUnit(st, 0, 'воины-огня', sys.id, source);
    FS_RULES.addUnit(st, 1, 'гравитанки-сокол', sys.id, field);
    const aspect = FS_RULES.addUnit(st, 1, 'аспектные-воины', sys.id, field);
    FS_RULES.addUnit(st, 2, 'культисты', sys.id, target);
    st.players[0].upgrades = [{ name: 'Мобилизированные охотники', used: false }];
    sys.tokens.push({ seat: 0, order: 'advance', faceUp: false });
    st.systems.find(s => s.id !== sys.id).tokens.push({ seat: 1, order: 'advance', faceUp: false });
    ok(FS_RULES.apply(st, 0, { type: 'resolveOrder', system: sys.id }).ok, 'раскрыт основной приказ');
    ok(burn(st, 'Мобилизированные охотники').ok, 'разыграно улучшение Тау');
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { yes: true } }).ok, 'дополнительное продвижение принято');
    ok(FS_RULES.apply(st, 0, { type: 'endAdvance' }).ok, 'шаг кораблей');
    ok(FS_RULES.apply(st, 0, { type: 'moveUnits', moves: [{ unit: actor.id, system: sys.id, pos: field }] }).ok,
        'один воин огня вошёл к Эльдарам');
    ok(FS_RULES.apply(st, 0, { type: 'endAdvance' }).ok, 'начался первый бой');
    eq([st.combat?.maxRounds, st.order?.preAdvance, !!st.preAdvanceMain], [1, true, true], 'основной приказ приостановлен');
    st.combat.cards.attacker.hand = ['Перекрестный огонь', 'Перекрестный огонь'];
    st.combat.cards.defender.hand = ['Волновой змей', 'Атакующие скорпионы'];
    st.combat.dice = { attacker: ['def'], defender: ['morale', 'def'] };
    revealWave(st, { eldar: 1, aspect: aspect.id, sys: sys.id, target });
    st = JSON.parse(JSON.stringify(st));
    waveToRetreat(st);
    eq(st.combat.round, 1, 'первый бой действительно ограничен одним раундом');
    const loser = st.combat.loser, firstTargets = FS_RULES.retreatTargets(st, loser);
    ok(FS_RULES.apply(st, loser, { type: 'combat', action: 'retreat',
        ...(firstTargets.length ? { target: firstTargets[0] } : {}) }).ok, 'первый бой завершён');
    eq([st.combat?.pos, st.combat?.attacker, st.combat?.defender, st.combat?.effectInitiated], [target, 1, 2, true],
        'сначала начинается бой карты между Эльдарами и Хаосом');
    eq([st.order?.preAdvance, !!st.preAdvanceMain, st.order?.seat], [true, true, 0], 'основной приказ по-прежнему ждёт');
    eq(ctx.CombatTurn.of(st.combat).maxRounds, 3, 'ограничение первого боя не переносится в новый');
    st.combat.cards.attacker.hand = ['Атакующие скорпионы', 'Атакующие скорпионы', 'Атакующие скорпионы'];
    st.combat.cards.defender.hand = ['Отвратное поколение', 'Отвратное поколение', 'Отвратное поколение'];
    st.combat.dice = { attacker: ['def', 'def'], defender: ['def', 'def'] };
    st = JSON.parse(JSON.stringify(st));
    waveToRetreat(st);
    const secondLoser = st.combat.loser, secondTargets = FS_RULES.retreatTargets(st, secondLoser);
    ok(FS_RULES.apply(st, secondLoser, { type: 'combat', action: 'retreat',
        ...(secondTargets.length ? { target: secondTargets[0] } : {}) }).ok, 'второй бой завершён');
    eq([st.combat, st.preAdvanceMain, st.order?.seat, st.order?.preAdvanceDone, st.order?.excludedUnit],
        [null, undefined, 0, true, actor.id], 'возобновлён именно основной приказ Тау');
    ok(FS_RULES.apply(st, 0, { type: 'endAdvance' }).ok, 'основной приказ дошёл до наземных');
    ok(!FS_RULES.movableUnits(st, 0).some(u => u.id === actor.id), 'использованный охотник исключён');
    ok(FS_RULES.movableUnits(st, 0).some(u => u.id === other.id), 'второй отряд доступен основному приказу');
    ok(FS_RULES.apply(st, 0, { type: 'endAdvance' }).ok, 'основное движение завершено');
    if (st.order) ok(FS_RULES.apply(st, 0, { type: 'finishAdvance' }).ok, 'основной приказ закрыт');
    eq([st.combat, st.order, st.turn], [null, null, 1], 'ход передан после полного завершения');
}));

check('Волновой змей', 'жетоны подкрепления как КЛ 0: выбор, уход из старого боя и очистка', () => withFixedDice(['def'], () => {
    for (const eldarAttacks of [true, false]) for (const withModel of [true, false]) {
        const a = waveAdvance(eldarAttacks, { reinforcements: 2 });
        let { st } = a;
        const side = eldarAttacks ? 'attacker' : 'defender';
        const token = 'reinforce-' + side + '-0', routed = 'reinforce-' + side + '-1';
        const supply = st.players[a.eldar].supply.units['аспектные-воины'];
        // The second token was routed by an earlier effect in this synthetic
        // combat state: it must not move, but the standing token is a KL0 unit.
        ok(FS_RULES.routeReinforcementToken(st, side, 1), 'второй жетон деморализован');
        for (const s of ['attacker', 'defender'])
            ok(FS_RULES.apply(st, st.combat[s], { type: 'combat', action: 'playCard', index: 0 }).ok, 'обе карты выбраны');
        for (let i = 0; i < 20 && pending(st)?.op !== 'moveUnits'; i++) {
            const q = pending(st), seat = st.pending.answerSeat ?? st.pending.seat;
            const answer = q.kind === 'ability' ? (/переместить любое количество/i.test(q.text) ? { yes: true } : { no: true })
                : firstOption(st, q);
            ok(FS_RULES.apply(st, seat, { type: 'effect', answer }).ok, 'раскрытие до выбора');
        }
        const q = pending(st);
        eq([q?.kind, q?.op], ['units', 'moveUnits'], 'карта выбирает отряды');
        ok(q.options.includes(token), 'стоящий жетон подкрепления предлагается как КЛ 0');
        ok(!q.options.includes(routed), 'деморализованный жетон не перемещается эффектом');
        const selected = withModel ? [a.aspect, token] : [token];
        const before = JSON.stringify(st);
        eq(FS_RULES.apply(st, a.eldar, { type: 'effect', answer: { units: [routed] } }).ok, false,
            'поддельный выбор деморализованного жетона отклонён');
        eq(JSON.stringify(st), before, 'отказ сохраняет выбор и состояние');
        ok(FS_RULES.apply(st, a.eldar, { type: 'effect', answer: { units: selected } }).ok, 'отряды выбраны');
        st = JSON.parse(JSON.stringify(st));
        ok(FS_RULES.apply(st, a.eldar, { type: 'effect', answer: { area: { system: a.sys, pos: a.target } } }).ok,
            'жетон переместился к противнику после JSON');
        const represented = st.units.find(u => u.id === token);
        eq([represented?.system, represented?.area, represented?.reinforcementCombat?.index], [a.sys, a.target, 0],
            'за пределами старого боя жетон существует как отряд, а не пластик');
        eq(ctx.CombatTokens.of(st.combat).alive(side, 0), false, 'жетон не участвует в старом бою');
        eq(ctx.CombatTokens.of(st.combat).alive(side, 1), true, 'деморализованный жетон остался в бою');
        eq(st.players[a.eldar].supply.units['аспектные-воины'], supply, 'запас пластика не изменился');
        waveToRetreat(st);
        const loser = st.combat.loser, targets = FS_RULES.retreatTargets(st, loser);
        ok(FS_RULES.apply(st, loser, { type: 'combat', action: 'retreat',
            ...(targets.length ? { target: targets[0] } : {}) }).ok, 'первый бой завершён');
        ok(!st.units.some(u => u.id === token), 'использованный жетон возвращён в общий запас после старого боя');
        eq(st.players[a.eldar].supply.units['аспектные-воины'], supply, 'пластик в запас не добавлен');
        if (withModel) {
            eq([st.combat?.pos, st.combat?.attacker, st.combat?.defender], [a.target, a.eldar, 2],
                'пластиковый отряд начинает следующий бой');
            eq(st.units.filter(u => u.seat === a.eldar && u.system === a.sys && u.area === a.target).map(u => u.id),
                [a.aspect], 'жетон не участвует в новом бою');
        } else {
            eq([st.combat, st.order, st.effectCombatQueue], [null, null, undefined],
                'без оставшихся атакующих фиктивный бой не начинается');
        }
    }
}));

check('Волновой змей', 'космический бой: фрегат и подкрепление идут только в соседнюю пустоту без шторма', () => withFixedDice(['def'], () => {
    for (const blocked of [false, true]) {
        let st = FS_RULES.newReadyGame({ seed: 5, players: [FOE, ELDAR, CHAOS]
            .map((faction, seat) => ({ faction, name: 'P' + seat, id: 'p' + seat })) });
        st.units = []; st.structures = []; st.objectives = []; st.storms = [];
        for (const sys of st.systems) sys.tokens = [];
        for (const p of st.players) p.assets.reinforcement = 0;
        st.players[1].assets.reinforcement = 1;
        st.phase = 'operations'; st.turn = 0; st.order = null;
        const fits = (s, a) => !a.world && s.areas.some(b => !b.world && b.pos !== a.pos)
            && FS_RULES.areasAround(st, s.id, a.pos).some(n => n.system !== s.id
                && !FS_RULES.area(FS_RULES.system(st, n.system), n.pos).world);
        const sys = st.systems.find(s => s.areas.some(a => fits(s, a)));
        ok(sys, 'найдена пустота с соседней пустотой за границей');
        const field = sys.areas.find(a => fits(sys, a)).pos;
        const source = sys.areas.find(a => !a.world && a.pos !== field).pos;
        const target = FS_RULES.areasAround(st, sys.id, field).find(n => n.system !== sys.id
            && !FS_RULES.area(FS_RULES.system(st, n.system), n.pos).world);
        const guard = FS_RULES.addUnit(st, 0, 'крейсеры', sys.id, source);
        FS_RULES.addUnit(st, 0, 'крейсеры', sys.id, source); // keeps an alternative enemy void
        FS_RULES.addUnit(st, 1, 'исследователи-пустоты', sys.id, field);
        const frigate = FS_RULES.addUnit(st, 1, 'фрегаты-класса-хелебор', sys.id, field);
        FS_RULES.addUnit(st, 2, 'эсминцы-класса-иконоборец', target.system, target.pos);
        const side = ['N', 'E', 'S', 'W'].find(d => FS_RULES.across(st, sys.id, d) === target.system);
        if (blocked) st.storms = [{ id: 'ship-wave-border', system: sys.id, side, moved: false }];
        sys.tokens.push({ seat: 0, order: 'advance', faceUp: false });
        st.systems.find(s => s.id !== sys.id).tokens.push({ seat: 1, order: 'advance', faceUp: false });
        ok(FS_RULES.apply(st, 0, { type: 'resolveOrder', system: sys.id }).ok, 'раскрыто продвижение');
        ok(FS_RULES.apply(st, 0, { type: 'moveUnits', moves: [{ unit: guard.id, system: sys.id, pos: field }] }).ok,
            'корабль вошёл в первый бой');
        ok(FS_RULES.apply(st, 0, { type: 'endAdvance' }).ok, 'закончены корабли');
        ok(FS_RULES.apply(st, 0, { type: 'endAdvance' }).ok, 'первый бой начался');
        eq(st.combat.step, 'reinforce-defender', 'Эльдары выбирают подкрепление');
        ok(FS_RULES.apply(st, 1, { type: 'combat', action: 'reinforce', count: 1 }).ok, 'жетон выставлен');
        st.combat.cards.attacker.hand = ['Ложись!', 'Ложись!', 'Ложись!'];
        st.combat.cards.defender.hand = ['Волновой змей', 'Атакующие скорпионы', 'Атакующие скорпионы'];
        st.combat.dice = { attacker: ['def'], defender: ['morale', 'def'] };
        const token = 'reinforce-defender-0';
        const q = reachWaveUnits(st);
        ok(q.options.includes(frigate.id) && q.options.includes(token), 'фрегат и жетон КЛ 0 предложены');
        ok(FS_RULES.apply(st, 1, { type: 'effect', answer: { units: [frigate.id, token] } }).ok, 'корабли выбраны');
        const options = pending(st).options;
        ok(options.every(x => !FS_RULES.area(FS_RULES.system(st, x.system), x.pos).world), 'кораблям предлагается только пустота');
        eq(options.some(x => x.system === target.system && x.pos === target.pos), !blocked, 'шторм закрывает трансграничную пустоту');
        const world = sys.areas.find(x => x.world);
        const before = JSON.stringify(st);
        eq(FS_RULES.apply(st, 1, { type: 'effect', answer: { area: { system: sys.id, pos: world.pos } } }).ok, false,
            'поддельный мир отклонён');
        eq(JSON.stringify(st), before, 'ошибка не теряет вопрос');
        st = JSON.parse(JSON.stringify(st));
        if (blocked) {
            eq(FS_RULES.apply(st, 1, { type: 'effect', answer: { area: target } }).ok, false, 'за штормом пройти нельзя');
            ok(options.some(x => x.system === sys.id && x.pos === source), 'другое направление осталось доступным');
            ok(FS_RULES.apply(st, 1, { type: 'effect', answer: { area: { system: sys.id, pos: source } } }).ok,
                'можно выбрать другую пустоту после ошибки');
            continue;
        }
        ok(FS_RULES.apply(st, 1, { type: 'effect', answer: { area: target } }).ok, 'фрегат и жетон перемещены после JSON');
        eq([st.units.find(u => u.id === token)?.system, st.units.find(u => u.id === frigate.id)?.system],
            [target.system, target.system], 'оба корабля находятся у противника');
        waveToRetreat(st);
        const loser = st.combat.loser, targets = FS_RULES.retreatTargets(st, loser);
        ok(FS_RULES.apply(st, loser, { type: 'combat', action: 'retreat',
            ...(targets.length ? { target: targets[0] } : {}) }).ok, 'первый бой завершён');
        eq([st.combat?.system, st.combat?.pos, st.combat?.attacker, st.combat?.defender],
            [target.system, target.pos, 1, 2], 'в соседней пустоте начался новый бой');
        eq(st.combat.attackerFrom, [{ system: sys.id, pos: field }], 'источник космического боя сохранён');
        ok(!st.units.some(u => u.id === token), 'подкрепление очищено до нового боя');
        ok(st.units.some(u => u.id === frigate.id && u.system === target.system), 'пластиковый фрегат остался атаковать');
    }
}));

check('Волновой змей', 'предел пяти учитывает тех, кто останется к началу боя, а не уходящие жетоны', () => withFixedDice(['def'], () => {
    const a = waveAdvance(false, { holdSource: true, reinforcements: 2 });
    let { st } = a;
    // Synthetic stress roster: five eligible plastics plus the KL2 carrier.
    const ids = [a.aspect];
    for (let i = 0; i < 4; i++) ids.push(FS_RULES.addUnit(st, a.eldar, 'аспектные-воины', a.sys, a.field).id);
    const tokens = ['reinforce-defender-0', 'reinforce-defender-1'];
    const q = reachWaveUnits(st);
    ok(ids.concat(tokens).every(id => q.options.includes(id)), 'предложены модели и два живых жетона');
    ok(FS_RULES.apply(st, a.eldar, { type: 'effect', answer: { units: ids.concat(tokens) } }).ok,
        'семь отрядов допускаются, когда два исчезнут при очистке первого боя');
    ok(pending(st).options.some(x => x.system === a.sys && x.pos === a.target), 'мир противника предложен');
    ok(FS_RULES.apply(st, a.eldar, { type: 'effect', answer: { area: { system: a.sys, pos: a.target } } }).ok,
        'все выбранные перемещены');
    eq(st.units.filter(u => u.seat === a.eldar && u.system === a.sys && u.area === a.target).length, 7,
        'до очистки видны пять моделей и два жетона');
    st = JSON.parse(JSON.stringify(st));
    waveToRetreat(st);
    const loser = st.combat.loser, targets = FS_RULES.retreatTargets(st, loser);
    ok(FS_RULES.apply(st, loser, { type: 'combat', action: 'retreat',
        ...(targets.length ? { target: targets[0] } : {}) }).ok, 'первый бой завершён');
    eq([st.combat?.attacker, st.combat?.pos], [a.eldar, a.target], 'новый бой начался');
    eq(st.units.filter(u => u.seat === a.eldar && u.system === a.sys && u.area === a.target).map(u => u.id), ids,
        'в начале боя осталось ровно пять выбранных моделей');
    ok(tokens.every(id => !st.units.some(u => u.id === id)), 'старые подкрепления возвращены в общий запас');
}));

check('Волновой змей', 'первый бой с уничтоженным проигравшим автоматически передаёт управление новому', () => withFixedDice(['def'], () => {
    const a = waveAdvance(true);
    let { st } = a;
    const guard = st.units.find(u => u.seat === 1 && u.system === a.sys && u.area === a.field);
    st.combat.cards.attacker.hand = ['Волновой змей', 'Бей и беги', 'Бей и беги'];
    st.combat.cards.defender.hand = ['Железная дисциплина', 'Железная дисциплина', 'Железная дисциплина'];
    st.combat.dice.defender = [];
    revealWave(st, a);
    st = JSON.parse(JSON.stringify(st));
    for (let i = 0; i < 80 && st.combat && st.combat.pos === a.field; i++) {
        const c = st.combat, q = pending(st);
        let res;
        if (q) {
            const seat = st.pending.answerSeat ?? st.pending.seat;
            res = FS_RULES.apply(st, seat, { type: 'effect', answer: q.kind === 'ability' ? { no: true } : firstOption(st, q) });
        } else if (c.step.startsWith('choose-')) {
            const side = c.step.slice('choose-'.length);
            res = FS_RULES.apply(st, c[side], { type: 'combat', action: 'playCard', index: 0 });
        } else if (c.step.startsWith('damage-')) {
            const side = c.step.slice('damage-'.length), seat = ctx.CombatHooks.of(c).assignSeat(c[side]);
            res = FS_RULES.apply(st, seat, { type: 'combat', action: 'damage', targets: FS_RULES.damageCandidates(st, side).map(x => x.id) });
        } else { FS_RULES.advanceCombatSteps(st); continue; }
        ok(res.ok, 'первый бой: ' + (res.error || ''));
    }
    eq(st.units.some(u => u.id === guard.id), false, 'последний защитник уничтожен');
    eq([st.combat?.pos, st.combat?.round, st.combat?.step, st.pending], [a.target, 1, 'choose-attacker', null],
        'новый бой готов к собственному выбору карт');
    eq(st.combat.cards.attacker.played, [], 'карты первого боя не раскрываются во втором');
    eq(st.combat.attackerFrom, [{ system: a.sys, pos: a.field }], 'источник отложенного боя сохранён');
}));

check('Волновой змей', 'искусственный план конца боя разрешается до перехода при уничтоженном проигравшем', () => withFixedDice(['def'], () => {
    for (const accept of [false, true]) {
        const a = waveAdvance(true);
        let { st } = a;
        st.players[0].schemes.push({ name: 'Проба конца боя', trigger: 'combat-end',
            text: 'В конце боя вы можете получить жетон.', steps: [{ op: 'gainToken', n: 1, kind: 'att', who: 'me' }] });
        st.combat.cards.attacker.hand = ['Волновой змей', 'Бей и беги', 'Бей и беги'];
        st.combat.cards.defender.hand = ['Железная дисциплина', 'Железная дисциплина', 'Железная дисциплина'];
        st.combat.dice.defender = [];
        revealWave(st, a);
        for (let i = 0; i < 80 && st.combat && st.combat.pos === a.field && pending(st)?.kind !== 'scheme'; i++) {
            const c = st.combat, q = pending(st);
            let res;
            if (q) {
                const seat = st.pending.answerSeat ?? st.pending.seat;
                res = FS_RULES.apply(st, seat, { type: 'effect', answer: q.kind === 'ability' ? { no: true } : firstOption(st, q) });
            } else if (c.step.startsWith('choose-')) {
                const side = c.step.slice('choose-'.length);
                res = FS_RULES.apply(st, c[side], { type: 'combat', action: 'playCard', index: 0 });
            } else if (c.step.startsWith('damage-')) {
                const side = c.step.slice('damage-'.length), seat = ctx.CombatHooks.of(c).assignSeat(c[side]);
                res = FS_RULES.apply(st, seat, { type: 'combat', action: 'damage', targets: FS_RULES.damageCandidates(st, side).map(x => x.id) });
            } else { FS_RULES.advanceCombatSteps(st); continue; }
            ok(res.ok, 'путь к плану конца боя: ' + (res.error || ''));
        }
        eq([st.combat?.pos, st.combat?.step, pending(st)?.kind], [a.field, 'retreat', 'scheme'],
            'сначала отвечают на план первоначального боя');
        st = JSON.parse(JSON.stringify(st));
        ok(FS_RULES.apply(st, 0, { type: 'effect', answer: accept ? { choice: 0 } : { no: true } }).ok,
            'план принят или отклонён после JSON');
        eq([st.combat?.pos, st.combat?.round, st.pending], [a.target, 1, null], 'только теперь начался следующий бой');
        eq(st.combat.tokens.attacker.att, 0, 'жетон первого боя не перенесён в следующий');
    }
}));

check('Волновой змей', 'устаревшая очередь пропускается, если спорной области больше нет', () => withFixedDice(['def'], () => {
    for (const removeSeat of [0, 2]) {
        const a = waveAdvance(true);
        let { st } = a;
        revealWave(st, a);
        const leaving = st.units.find(u => u.seat === removeSeat && u.system === a.sys && u.area === a.target);
        FS_RULES.destroyUnit(st, leaving); // an intervening effect removes one side
        st = JSON.parse(JSON.stringify(st));
        waveToRetreat(st);
        const loser = st.combat.loser, options = FS_RULES.retreatTargets(st, loser);
        ok(FS_RULES.apply(st, loser, { type: 'combat', action: 'retreat',
            ...(options.length ? { target: options[0] } : {}) }).ok, 'первый бой завершён');
        eq([st.combat, st.order, st.effectCombatQueue, st.turn], [null, null, undefined, 1],
            'пустая очередь не запускает фиктивный бой и не задерживает ход');
    }
}));

check('Волновой змей', 'мгновенная победа в новом бою: отступление деморализованного и пустая фабрика', () => withFixedDice(['def'], () => {
    for (const routed of [true, false]) {
        const a = waveAdvance(false);
        let { st } = a;
        const defender = st.units.find(u => u.seat === 2 && u.system === a.sys && u.area === a.target);
        let friendly = null, factory = null;
        if (routed) {
            defender.routed = true;
            friendly = FS_RULES.areasAround(st, a.sys, a.target).find(n => n.system !== a.sys
                && FS_RULES.area(FS_RULES.system(st, n.system), n.pos).world);
            ok(friendly, 'соседний мир для обычного отступления');
            FS_RULES.addUnit(st, 2, 'культисты', friendly.system, friendly.pos);
        } else {
            st.units = st.units.filter(u => u.id !== defender.id);
            factory = FS_RULES.addStructure(st, 2, 'factory', a.sys, a.target);
        }
        revealWave(st, a);
        waveToRetreat(st);
        const loser = st.combat.loser, firstTargets = FS_RULES.retreatTargets(st, loser);
        ok(FS_RULES.apply(st, loser, { type: 'combat', action: 'retreat',
            ...(firstTargets.length ? { target: firstTargets[0] } : {}) }).ok, 'первый бой закончен');
        if (routed) {
            eq([st.combat?.step, st.combat?.attacker, st.combat?.defender], ['retreat', a.eldar, 2],
                'после мгновенной победы проигравший выбирает отступление');
            eq(st.combat.dice, { attacker: [], defender: [] }, 'подготовка пропущена');
            eq(FS_RULES.retreatTargets(st, 2), [friendly], 'дружественный мир доступен для отступления');
            st = JSON.parse(JSON.stringify(st));
            eq(FS_RULES.apply(st, a.eldar, { type: 'combat', action: 'retreat', target: friendly }).ok, false, 'победитель не отвечает за проигравшего');
            ok(FS_RULES.apply(st, 2, { type: 'combat', action: 'retreat', target: friendly }).ok, 'деморализованный защитник отступил');
            eq([st.units.find(u => u.id === defender.id)?.system, st.units.find(u => u.id === defender.id)?.area],
                [friendly.system, friendly.pos], 'отряд сохранён в выбранной области');
        } else {
            eq(st.structures.find(x => x.id === factory.id)?.seat, a.eldar, 'пустая фабрика захвачена');
        }
        eq([st.combat, st.order, st.turn], [null, null, 1], 'исходный приказ передал ход своему следующему игроку');
    }
}));

check('Волновой змей', 'бастион защищает, а деморализованный без направления гибнет при мгновенной победе', () => withFixedDice(['def'], () => {
    for (const bastion of [false, true]) {
        const a = waveAdvance(false, { holdSource: true });
        let { st } = a;
        const defender = st.units.find(u => u.seat === 2 && u.system === a.sys && u.area === a.target);
        defender.routed = true;
        const structure = bastion ? FS_RULES.addStructure(st, 2, 'bastion', a.sys, a.target) : null;
        revealWave(st, a);
        // The field (the attacker's origin) is forbidden to the defender, and
        // storms block every border. No legal ground path remains for it.
        for (const side of ['N', 'E', 'S', 'W']) if (FS_RULES.across(st, a.sys, side))
            st.storms.push({ id: 'no-retreat-' + side, system: a.sys, side, moved: false });
        st = JSON.parse(JSON.stringify(st));
        waveToRetreat(st);
        const loser = st.combat.loser, targets = FS_RULES.retreatTargets(st, loser);
        ok(FS_RULES.apply(st, loser, { type: 'combat', action: 'retreat',
            ...(targets.length ? { target: targets[0] } : {}) }).ok, 'первый бой завершён');
        if (!bastion) {
            ok(!st.units.some(u => u.id === defender.id), 'защитник без пути уничтожен автоматически');
            eq([st.combat, st.effectCombatQueue, st.order, st.turn], [null, undefined, null, 1],
                'мгновенная победа завершилась без повторной передачи хода');
        } else {
            eq([st.combat?.pos, st.combat?.attacker, st.combat?.defender], [a.target, a.eldar, 2],
                'бастион начинает настоящий бой, несмотря на деморализованный отряд');
            ok(st.combat.dice.defender.length > 0, 'бастион бросил боевые кубики');
            eq(st.structures.find(x => x.id === structure.id)?.seat, 2, 'бастион ещё не захвачен');
            st.combat.cards.attacker.hand = ['Атакующие скорпионы', 'Атакующие скорпионы', 'Атакующие скорпионы'];
            st.combat.cards.defender.hand = ['Отвратное поколение', 'Отвратное поколение', 'Отвратное поколение'];
            st.combat.dice = { attacker: ['def', 'def'], defender: ['def', 'def'] };
            st = JSON.parse(JSON.stringify(st));
            waveToRetreat(st);
            const last = st.combat.loser, places = FS_RULES.retreatTargets(st, last);
            ok(FS_RULES.apply(st, last, { type: 'combat', action: 'retreat',
                ...(places.length ? { target: places[0] } : {}) }).ok, 'бой с бастионом завершён');
            eq([st.combat, st.order, st.turn], [null, null, 1], 'ход передан только после второго боя');
        }
    }
}));

check('Волновой змей', 'избыток после отступления выбирается до нового боя и сохраняется через JSON', () => withFixedDice(['def'], () => {
    const a = waveAdvance(true);
    let { st } = a;
    revealWave(st, a);
    waveToRetreat(st);
    const loser = st.combat.loser, choices = FS_RULES.retreatTargets(st, loser);
    ok(choices.length, 'есть место для отступления первого боя');
    const target = choices[0], cap = FS_RULES.capacity(st, target.system, target.pos);
    const existing = st.units.filter(u => u.seat === loser && u.system === target.system && u.area === target.pos).length;
    for (let i = existing; i < cap; i++) FS_RULES.addUnit(st, loser, 'гвардейцы', target.system, target.pos);
    ok(FS_RULES.apply(st, loser, { type: 'combat', action: 'retreat', target }).ok, 'первый бой завершён переполненным отступлением');
    eq([st.combat, st.order?.seat, st.effectCombatTrimOwner], [null, 0, 0], 'новый бой ждёт выбор избытка');
    const excess = st.units.filter(u => u.seat === loser && u.system === target.system && u.area === target.pos);
    eq(excess.length, cap + 1, 'есть один лишний отряд');
    eq(FS_RULES.apply(st, 0, { type: 'endAdvance' }).ok, false, 'исходный приказ нельзя закончить раньше выбора');
    eq(FS_RULES.apply(st, 0, { type: 'trimUnit', unit: excess[0].id, system: target.system, pos: target.pos }).ok,
        false, 'чужой игрок не убирает избыток');
    st = JSON.parse(JSON.stringify(st));
    ok(FS_RULES.apply(st, loser, { type: 'trimUnit', unit: excess[0].id, system: target.system, pos: target.pos }).ok,
        'владелец убрал избыток после JSON');
    eq([st.effectCombatTrimOwner, st.combat?.system, st.combat?.pos, st.combat?.attacker],
        [undefined, a.sys, a.target, a.eldar], 'отложенный бой начался после выбора');
}));

check('Волновой змей', 'две карты: одна спорная область и не более пяти атакующих в новом бою', () => withFixedDice(['def'], () => {
    for (const firstCount of [4, 5]) {
        const a = waveAdvance(false, { holdSource: true });
        let { st } = a;
        // Extra models appear AFTER combat starts, so this synthetic stress
        // state does not pretend that six attackers entered the first combat.
        const ids = [a.aspect];
        for (let i = 0; i < 5; i++) ids.push(FS_RULES.addUnit(st, a.eldar, 'аспектные-воины', a.sys, a.field).id);
        for (const area of FS_RULES.areasAround(st, a.sys, a.field)) {
            if (!FS_RULES.area(FS_RULES.system(st, area.system), area.pos).world) continue;
            if (!st.units.some(u => u.system === area.system && u.area === area.pos))
                FS_RULES.addUnit(st, 0, 'гвардейцы', area.system, area.pos);
        }
        st.combat.cards.defender.hand = ['Волновой змей', 'Волновой змей', 'Атакующие скорпионы'];
        st.combat.cards.attacker.hand = ['Ложись!', 'Ложись!', 'Ложись!'];
        st.combat.dice.defender = ['morale', 'morale', 'def', 'def'];
        st.combat.dice.attacker = ['def', 'def'];
        const reachUnits = round => {
            for (let i = 0; i < 80; i++) {
                ok(st.combat && st.combat.round <= round, 'бой не завершился до карты');
                const q = pending(st);
                if (q && q.op === 'moveUnits' && q.kind === 'units' && st.combat.round === round) return q;
                let res;
                if (q) {
                    const seat = st.pending.answerSeat ?? st.pending.seat;
                    const answer = q.kind === 'ability'
                        ? (/переместить любое количество/i.test(q.text) ? { yes: true } : { no: true }) : firstOption(st, q);
                    res = FS_RULES.apply(st, seat, { type: 'effect', answer });
                } else if (st.combat.step.startsWith('choose-')) {
                    const side = st.combat.step.slice('choose-'.length);
                    res = FS_RULES.apply(st, st.combat[side], { type: 'combat', action: 'playCard', index: 0 });
                } else if (st.combat.step.startsWith('damage-')) {
                    const side = st.combat.step.slice('damage-'.length);
                    const seat = ctx.CombatHooks.of(st.combat).assignSeat(st.combat[side]);
                    res = FS_RULES.apply(st, seat, { type: 'combat', action: 'damage', targets: FS_RULES.damageCandidates(st, side).map(x => x.id) });
                } else { FS_RULES.advanceCombatSteps(st); continue; }
                ok(res.ok, 'путь ко второй карте: ' + (res.error || ''));
            }
            throw new Error('нет вопроса о перемещении в раунде ' + round);
        };
        let q = reachUnits(1);
        ok(ids.every(id => q.options.includes(id)), 'все проверочные отряды предложены');
        const before = JSON.stringify(st);
        eq(FS_RULES.apply(st, a.eldar, { type: 'effect', answer: { units: ids } }).ok, false,
            'шесть атакующих не могут выбрать вражескую область');
        eq(JSON.stringify(st), before, 'отказ не теряет вопрос выбора отрядов');
        ok(FS_RULES.apply(st, a.eldar, { type: 'effect', answer: { units: ids.slice(0, firstCount) } }).ok,
            'можно выбрать допустимую группу');
        q = pending(st);
        ok(q.options.some(x => x.system === a.sys && x.pos === a.target), 'вражеский мир предложен');
        ok(FS_RULES.apply(st, a.eldar, { type: 'effect', answer: { area: { system: a.sys, pos: a.target } } }).ok,
            'первая карта создала спорную область');
        st = JSON.parse(JSON.stringify(st));
        q = reachUnits(2);
        const remaining = ids[firstCount];
        ok(q.options.includes(remaining), 'вторая карта видит оставшийся отряд');
        const res = FS_RULES.apply(st, a.eldar, { type: 'effect', answer: { units: [remaining] } });
        if (firstCount === 5) {
            eq(res.ok, false, 'шестой не входит, другой спорный мир не предлагается');
            eq(pending(st).kind, 'units', 'выбор остаётся доступен');
            ok(FS_RULES.apply(st, a.eldar, { type: 'effect', answer: { units: [] } }).ok, 'можно отказаться от перемещения');
        } else {
            ok(res.ok, 'пятый отряд может войти');
            q = pending(st);
            eq(q.options.filter(x => x.system === a.sys).map(x => x.pos), [a.target],
                'другая спорная область запрещена, прежняя доступна');
            const blocked = FS_RULES.areasAround(st, a.sys, a.field).find(x => x.system === a.sys
                && x.pos !== a.target && FS_RULES.area(FS_RULES.system(st, a.sys), x.pos).world);
            const snap = JSON.stringify(st);
            eq(FS_RULES.apply(st, a.eldar, { type: 'effect', answer: { area: blocked } }).ok, false, 'поддельная другая область отклонена');
            eq(JSON.stringify(st), snap, 'поддельный ответ не меняет бой');
            ok(FS_RULES.apply(st, a.eldar, { type: 'effect', answer: { area: { system: a.sys, pos: a.target } } }).ok,
                'пятый входит в ту же спорную область');
            eq(st.units.filter(u => u.seat === a.eldar && u.system === a.sys && u.area === a.target).length, 5,
                'в новом бою ровно пять атакующих');
        }
    }
}));

check('Портал в паутину', 'приказ доминирования предлагает стоящие отряды активного мира и дружественные миры', () => {
    let st = orderState('dominate', { faction: ELDAR, units: { 'аспектные-воины': 1 } });
    const active = st.order.system;
    const remote = st.systems.find(s => s.id !== active && s.areas.some(a => a.world));
    const pos = remote.areas.find(a => a.world).pos;
    FS_RULES.addUnit(st, 0, 'аспектные-воины', remote.id, pos);
    const other = myUnits(st).find(u => u.system === remote.id);
    ok(FS_RULES.apply(st, 0, { type: 'finishDominate' }).ok, 'разрешение способности');
    const first = st.pending && st.pending.question;
    ok(first && first.op === 'moveUnits', 'выбирается отряд');
    eq(first.options.includes(other.id), false, 'отряд другой системы не предлагается');
    const id = first.options[0];
    eq(FS_RULES.apply(st, 0, { type: 'effect', answer: { units: [other.id] } }).ok, false, 'подмена источника отклонена');
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { units: [id] } }).ok, 'источник выбран');
    st = JSON.parse(JSON.stringify(st));
    const choices = st.pending.question.options;
    ok(choices.some(a => a.system === remote.id && a.pos === pos), 'дальний дружественный мир предложен после JSON');
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { area: { system: remote.id, pos } } }).ok, 'дружественный мир выбран');
    const moved = st.units.find(u => u.id === id);
    eq([moved.system, moved.area], [remote.id, pos], 'отряд перенесён в выбранный мир');
});

head('События', ELDAR);
check('Путь воина', 'скидка по числу миров со своими городами применяется до покупки и оплаты', () => {
    let st = eventState('Путь воина', { faction: ELDAR, materiel: 1 });
    const city = { id: 'city-discount', seat: 0, type: 'city', system: st.sys, area: st.pos };
    st.structures.push(city);
    ok(playEvent(st).ok, 'событие разыграно');
    let q = st.pending && st.pending.question;
    ok(q && q.op === 'buyUpgrade' && q.options.includes('Парящие ястребы'), 'доступно улучшение за 2 со скидкой 1');
    eq(q.discount, 1, 'объявлена скидка за город');
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { card: 'Парящие ястребы' } }).ok, 'выбрано улучшение');
    st = JSON.parse(JSON.stringify(st));
    q = st.pending.question;
    ok(q && q.op === 'buyUpgradeReplace', 'после JSON выбирается заменяемая пара');
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { remove: q.options[0] } }).ok, 'заменена пара');
    eq(st.players[0].materiel, 0, 'уплачен 1 материал, не 2');
    eq(st.players[0].decks.combat.filter(n => n === 'Парящие ястребы').length, 2, 'получена пара боевых карт');
    const without = eventState('Путь воина', { faction: ELDAR, materiel: 1 });
    ok(playEvent(without).ok, 'событие без города');
    ok(!without.pending || !(without.pending.question.options || []).includes('Парящие ястребы'), 'без города не хватает материалов');
});
check('Колония экзодитов', '1 материал и бесплатный город: цель, чужие силы и постройки исключены', () => {
    let st = eventState('Колония экзодитов', { faction: ELDAR, materiel: 1 });
    const worlds = st.systems.flatMap(sys => sys.areas.filter(a => a.world).map(a => ({ system: sys.id, pos: a.pos })));
    ok(worlds.length >= 5, 'нужны миры разных видов');
    const [valid, own, occupied, enemy, otherObj] = worlds;
    st.objectives.push({ id: 'own-obj', faction: ELDAR, system: own.system, area: own.pos });
    st.objectives.push({ id: 'other-obj', faction: FOE, system: otherObj.system, area: otherObj.pos });
    FS_RULES.addStructure(st, 0, 'factory', occupied.system, occupied.pos);
    FS_RULES.addUnit(st, 1, 'гвардейцы', enemy.system, enemy.pos);
    ok(playEvent(st).ok, 'событие разыграно');
    const q = st.pending && st.pending.question;
    ok(q && q.op === 'placeStructure', 'спрашивается мир');
    const includes = a => q.options.some(x => x.system === a.system && x.pos === a.pos);
    ok(includes(valid) && includes(otherObj), 'свободный мир и чужая цель допустимы');
    ok(!includes(own) && !includes(occupied) && !includes(enemy), 'своя цель, постройка и враг исключены');
    eq(st.players[0].materiel, 1, 'до выбора плата не списана');
    eq(FS_RULES.apply(st, 0, { type: 'effect', answer: { area: own } }).ok, false, 'подмена запрещённой цели отклонена');
    st = JSON.parse(JSON.stringify(st));
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { area: valid } }).ok, 'свободный мир выбран');
    eq(st.players[0].materiel, 0, 'списан ровно 1 материал');
    ok(st.structures.some(x => x.seat === 0 && x.type === 'city' && x.system === valid.system && x.area === valid.pos), 'город поставлен');
    const poor = eventState('Колония экзодитов', { faction: ELDAR, materiel: 0 });
    ok(playEvent(poor).ok, 'событие при нуле материалов');
    ok(!poor.pending && !poor.structures.some(x => x.type === 'city'), 'бесплатный город не выдаётся без оплаты');
});

check('Возвращение изгоев', 'бесплатный фрегат ставится из резерва в неконтролируемую пустоту', () => {
    let st = eventState('Возвращение изгоев', { faction: ELDAR });
    const before = st.players[0].supply.units['фрегаты-класса-хелебор'];
    ok(playEvent(st).ok, 'событие разыграно');
    ok(st.pending && st.pending.question.kind === 'choice', 'предложены обе ветки');
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { choice: 0 } }).ok, 'выбрано бесплатное размещение');
    const q = st.pending && st.pending.question;
    ok(q && q.op === 'placeFree' && q.options.length, 'предложены пустоты');
    ok(q.options.every(a => !FS_RULES.area(FS_RULES.system(st, a.system), a.pos).world && FS_RULES.control(st, 0, a.system, a.pos) === 'none'), 'только никем не контролируемые пустоты');
    const target = q.options[0];
    st = JSON.parse(JSON.stringify(st));
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { area: target } }).ok, 'выбрана пустота');
    eq(st.players[0].supply.units['фрегаты-класса-хелебор'], before - 1, 'фрегат взят из резерва');
    ok(st.units.some(u => u.seat === 0 && u.unit === 'фрегаты-класса-хелебор' && u.system === target.system && u.area === target.pos), 'фрегат размещён');
});
check('Возвращение изгоев', 'вторая ветка перемещает именно фрегат, не берёт модель из резерва', () => {
    let st = eventState('Возвращение изгоев', { faction: ELDAR, ships: { 'фрегаты-класса-хелебор': 1, 'исследователи-пустоты': 1 } });
    const frigate = st.units.find(u => u.unit === 'фрегаты-класса-хелебор');
    const origin = { system: frigate.system, pos: frigate.area };
    const before = st.players[0].supply.units[frigate.unit];
    ok(playEvent(st).ok, 'событие разыграно');
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { choice: 1 } }).ok, 'выбрано перемещение');
    let q = st.pending && st.pending.question;
    ok(q && q.op === 'moveUnit' && q.options.length === 1 && q.options[0] === frigate.id, 'предложен только фрегат');
    eq(FS_RULES.apply(st, 0, { type: 'effect', answer: { units: [st.units.find(u => u.unit === 'исследователи-пустоты').id] } }).ok, false, 'чужой тип нельзя подменить');
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { units: [frigate.id] } }).ok, 'фрегат выбран');
    st = JSON.parse(JSON.stringify(st));
    q = st.pending.question;
    ok(q.options.every(a => a.system !== origin.system || a.pos !== origin.pos), 'начальная пустота не предлагается');
    const target = q.options[0];
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { area: target } }).ok, 'другая пустота выбрана');
    const moved = st.units.find(u => u.id === frigate.id);
    eq([moved.system, moved.area], [target.system, target.pos], 'перемещён тот же фрегат');
    eq(st.players[0].supply.units[frigate.unit], before, 'резерв не изменился');
});

head('Улучшения приказов', ELDAR);
check('Видящие', 'стратегия в пустой системе разрешена лишь после применения карты; панель и JSON согласованы', () => {
    let st = orderState('strategize', { faction: ELDAR, upgrades: ['Видящие'], materiel: 10 });
    const cmd = { type: 'buyUpgrade', kind: 'combat', card: 'Парящие ястребы', remove: 'Воющие баньши' };
    eq(FS_RULES.apply(st, 0, cmd).ok, false, 'без карты покупка в пустой системе запрещена');
    const game = Object.create(FSGame.prototype);
    game.upgradeSel = null;
    const panelBefore = { actions: [] };
    game.panelStrategize(Object.assign({}, st, { seat: 0 }), panelBefore);
    ok(panelBefore.upgrades.combat.find(x => x.name === cmd.card).locked, 'до карты панель запрещает покупку');
    ok(burn(st, 'Видящие').ok, 'карта применена');
    st = JSON.parse(JSON.stringify(st));
    const panelAfter = { actions: [] };
    game.panelStrategize(Object.assign({}, st, { seat: 0 }), panelAfter);
    ok(!panelAfter.upgrades.combat.find(x => x.name === cmd.card).locked, 'после карты панель разрешает покупку');
    ok(FS_RULES.apply(st, 0, cmd).ok, 'покупка разрешена после JSON');
    eq(burn(st, 'Видящие').ok, false, 'повторное использование в раунде запрещено');
    const wrong = orderState('deploy', { faction: ELDAR, upgrades: ['Видящие'] });
    eq(burn(wrong, 'Видящие').ok, false, 'в другом приказе нельзя применить');
});
check('Певцы психокости', 'покупка в мире с одной своей постройкой другого типа, но не повторного типа', () => {
    let st = orderState('deploy', { faction: ELDAR, upgrades: ['Певцы психокости'],
        units: { 'аспектные-воины': 1 }, structures: ['factory'], materiel: 10 });
    const sys = st.order.system, pos = worldOf(st, sys);
    ok(FS_RULES.apply(st, 0, { type: 'deployStructures' }).ok, 'шаг построек');
    const city = { type: 'buyStructure', structure: 'city', system: sys, pos };
    eq(FS_RULES.apply(st, 0, city).ok, false, 'без карты второй постройки быть не может');
    ok(burn(st, 'Певцы психокости').ok, 'карта применена');
    st = JSON.parse(JSON.stringify(st));
    eq(FS_RULES.apply(st, 0, { ...city, structure: 'factory' }).ok, false, 'одинаковый тип запрещён');
    ok(FS_RULES.apply(st, 0, city).ok, 'другая постройка разрешена после JSON');
    eq(st.structures.filter(x => x.system === sys && x.area === pos).map(x => x.type).sort(), ['city', 'factory'], 'две разные постройки');
    eq(burn(st, 'Певцы психокости').ok, false, 'карта используется лишь раз за раунд');
});

head('Боевая колода · дополнительные границы', ELDAR);
function eldarDefender(card, units, opts = {}) {
    const st = battle({ faction: FOE, foeFaction: ELDAR, units: { 'гвардейцы': 2 },
        foeUnits: units, card: 'Ложись!', foeCard: card,
        dice: opts.dice || ['att'], foeDice: opts.foeDice || ['morale', 'morale', 'def'], roundEnd: true });
    return st;
}
function playEldarDefender(st, policy) {
    refuseReinforce(st);
    ok(FS_RULES.apply(st, 0, { type: 'combat', action: 'playCard', index: 0 }).ok, 'атакующий выбрал карту');
    ok(FS_RULES.apply(st, 1, { type: 'combat', action: 'playCard', index: 0 }).ok, 'защитник выбрал карту');
    answerAll(st, (s, q) => q.kind === 'ability' ? { no: true } : firstOption(s, q), 0);
    return answerAll(st, policy, 1);
}
check('Прикрытие рейнджеров', 'атакующий получает жетоны, защищающийся отступает одним отрядом', () => {
    const atk = eldarBattle({ card: 'Прикрытие рейнджеров', units: { 'призрачные-стражи': 1 }, roundEnd: true });
    const at = eldarPlay(atk);
    eq([tokens(atk, 'attacker').att, tokens(atk, 'attacker').def], [1, 1], 'атакующий получает оба жетона');
    ok(!at.some(x => x.op === 'retreat'), 'атакующий не отступает по условию защиты');
    const def = eldarDefender('Прикрытие рейнджеров', { 'аспектные-воины': 2 });
    const field = [def.combat.system, def.combat.pos];
    const tr = playEldarDefender(def);
    const out = foeUnits(def).filter(u => u.system !== field[0] || u.area !== field[1]);
    ok(tr.some(x => x.op === 'retreat' && x.seat === 1), 'защитник выбирает отряд для отступления');
    eq(out.length, 1, 'отступает один отряд');
    ok(out[0].routed, 'отступивший деморализован');
    eq([tokens(def, 'defender').att, tokens(def, 'defender').def], [0, 0], 'защитнику не выданы жетоны атакующего');
});
check('Парящие ястребы', 'нет морали — нет двух жетонов; защита отнимает до трёх атакующих жетонов', () => {
    const atk = eldarBattle({ card: 'Парящие ястребы', dice: ['def'], roundEnd: true });
    eldarPlay(atk);
    eq(tokens(atk, 'attacker').att, 0, 'без оплаты жетоны не получаются');
    const def = eldarDefender('Парящие ястребы', { 'аспектные-воины': 1 },
        { dice: ['att', 'att', 'att', 'att', 'att'], foeDice: ['def'] });
    def.combat.tokens.attacker.att = 5;
    playEldarDefender(def);
    eq(tokens(def, 'attacker').att, 2, 'противник теряет ровно три жетона');
    eq(tokens(def, 'defender').att, 0, 'защитник тоже не получает жетоны без оплаты');
});
check('Огненная призма', 'можно перевернуть часть кубиков, а подменить грань нельзя', () => {
    const st = eldarBattle({ card: 'Огненная призма', units: { 'гравитанки-сокол': 1 },
        dice: ['morale', 'morale', 'def'], roundEnd: true });
    let saw = false;
    const trace = eldarPlay(st, (s, q) => {
        if (q.op === 'flipDie') {
            saw = true;
            eq(FS_RULES.apply(s, 0, { type: 'effect', answer: { dice: [2] } }).ok, false, 'нельзя перевернуть не предложенный кубик обороны');
            return { dice: [q.options[0]] };
        }
        return null;
    });
    ok(saw, 'можно выбрать количество кубиков');
    eq([count(st, 'attacker', 'morale'), count(st, 'attacker', 'att'), count(st, 'attacker', 'def')], [1, 1, 1], 'перевёрнут только выбранный кубик');
    eq(tokens(st, 'attacker').att, 2, 'носитель в атаке даёт два жетона');
    ok(trace.some(x => x.op === 'flipDie'), 'выбор виден');
    const def = eldarDefender('Огненная призма', { 'гравитанки-сокол': 1 },
        { dice: ['att', 'att', 'att', 'att', 'att'], foeDice: ['morale'] });
    def.combat.tokens.attacker.def = 6;
    playEldarDefender(def, (s, q) => q.op === 'flipDie' ? { dice: [] } : null);
    eq(tokens(def, 'attacker').def, 1, 'в обороне противник теряет пять жетонов обороны');
    eq(count(def, 'defender', 'morale'), 1, 'можно не переворачивать кубики');
});

head('Улучшения приказов · орбитальный удар', ELDAR);
check('Точный удар', 'дополнительный кубик и оплата именно morale дают выбранному врагу первый урон', () => withFixedDice(['morale', 'att', 'att'], () => {
    let st = strikeState({ faction: ELDAR, ships: { 'фрегаты-класса-хелебор': 1 },
        foeUnits: { 'гвардейцы': 1, 'огрины': 1 }, upgrades: ['Точный удар'] });
    ok(burn(st, 'Точный удар').ok, 'карта применена');
    eq(st.order.strikeDice, ['morale'], 'получен дополнительный кубик');
    eq(st.order.strikePays[0].kind, 'morale', 'платёж требует мораль');
    fire(st, ['morale', 'att', 'att']);
    ok(st.pending && st.pending.question.op === 'strikePayPick', 'предложена оплата');
    st = JSON.parse(JSON.stringify(st));
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { choice: 1 } }).ok, 'мораль оплачена после JSON');
    const q = st.pending && st.pending.question;
    ok(q && q.op === 'strikeFirstPick' && q.options.length === 2, 'выбирается любой вражеский отряд мира');
    const chosen = q.options.at(-1), other = q.options[0];
    eq(FS_RULES.apply(st, 0, { type: 'effect', answer: { units: [myUnits(st)[0].id] } }).ok, false, 'своего отряда выбрать нельзя');
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { units: [chosen] } }).ok, 'первый отряд выбран');
    eq(st.strike.first, chosen, 'выбор передан распределению урона');
    eq(FS_RULES.apply(st, 1, { type: 'strikeDamage', unit: other }).ok, false, 'сначала нельзя нанести другому');
    ok(FS_RULES.apply(st, 1, { type: 'strikeDamage', unit: chosen }).ok, 'выбранный получает урон первым');
}));
check('Точный удар', 'отказ или отсутствие morale не выбирают первую цель', () => withFixedDice(['att', 'att', 'att'], () => {
    for (const refuse of [true, false]) {
        const st = strikeState({ faction: ELDAR, ships: { 'фрегаты-класса-хелебор': 1 },
            foeUnits: { 'гвардейцы': 1 }, upgrades: ['Точный удар'] });
        ok(burn(st, 'Точный удар').ok, 'карта применена');
        fire(st, refuse ? ['morale', 'att', 'att'] : ['att', 'att', 'att']);
        if (refuse) {
            ok(st.pending && st.pending.question.op === 'strikePayPick', 'есть выбор отказа');
            ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { choice: 0 } }).ok, 'отказ');
        }
        ok(!st.order.strikeFirstWanted && !st.order.strikeFirst, 'цель не назначена бесплатно');
    }
}));

check('Обстрел', 'бастион открывает окно удара; за два def перемещаются выбранные корабли активной системы', () => {
    let st = strikeState({ faction: ELDAR, ships: { 'фрегаты-класса-хелебор': 2 },
        foeStructures: ['bastion'], foeUnits: { 'гвардейцы': 1 }, upgrades: ['Обстрел'] });
    const active = st.order.system;
    const distant = st.systems.find(s => s.id !== active && !FS_RULES.neighbors(st, active).includes(s.id) && s.areas.some(a => !a.world));
    if (distant) FS_RULES.addUnit(st, 0, 'фрегаты-класса-хелебор', distant.id, distant.areas.find(a => !a.world).pos);
    // Use the ordinary advance transition, not an invented strike phase.
    st.order.phase = 'move';
    ok(FS_RULES.apply(st, 0, { type: 'endAdvance' }).ok, 'корабли завершили движение');
    ok(FS_RULES.apply(st, 0, { type: 'endAdvance' }).ok, 'наземные войска завершили движение');
    eq(st.order && st.order.phase, 'strike', 'бастион не закрывает окно карты');
    eq(FS_RULES.orbitalStrikeTargets(st, 0).length, 0, 'без карты бастион защищает');
    ok(burn(st, 'Обстрел').ok, 'карта применена');
    ok(FS_RULES.orbitalStrikeTargets(st, 0).length > 0, 'бастион больше не защищает');
    eq(st.order.strikePays[0].kind, 'def', 'оплата требует оборону');
    fire(st, ['def', 'def', 'att', 'att']);
    ok(st.pending && st.pending.question.op === 'strikePayPick', 'предложена оплата');
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { choice: 1 } }).ok, 'уплачены два кубика обороны');
    let q = st.pending && st.pending.question;
    ok(q && q.op === 'moveUnits' && q.kind === 'units', 'выбираются корабли');
    const ids = q.options.slice();
    eq(ids.length, 2, 'только два корабля активной системы');
    eq(FS_RULES.apply(st, 0, { type: 'effect', answer: { units: [myUnits(st).find(u => u.unit === 'аспектные-воины').id] } }).ok, false, 'наземный отряд не подменяет корабль');
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { units: ids } }).ok, 'два корабля выбраны');
    st = JSON.parse(JSON.stringify(st));
    q = st.pending.question;
    ok(q && q.kind === 'areas' && q.options.length, 'выбирается пустота');
    ok(q.options.every(a => FS_RULES.neighbors(st, active).includes(a.system)
        && !FS_RULES.area(FS_RULES.system(st, a.system), a.pos).world
        && ['friendly', 'none'].includes(FS_RULES.control(st, 0, a.system, a.pos))), 'только дружественные или свободные пустоты соседних систем');
    const target = q.options[0];
    eq(FS_RULES.apply(st, 0, { type: 'effect', answer: { area: { system: active, pos: st.strikeWorld } } }).ok, false, 'мир в активной системе запрещён');
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { area: target } }).ok, 'корабли перемещены');
    eq(ids.filter(id => { const u = st.units.find(x => x.id === id); return u.system === target.system && u.area === target.pos; }).length, 2, 'переместились выбранные корабли');
    ok(st.strike && st.strike.hits === 2, 'после движения распределяется уже нанесённый урон');
});
check('Обстрел', 'отказ от оплаты или меньше двух def не перемещает корабли', () => {
    for (const dice0 of [['def', 'def', 'att'], ['def', 'att', 'att']]) {
        const st = strikeState({ faction: ELDAR, ships: { 'фрегаты-класса-хелебор': 1 },
            foeUnits: { 'гвардейцы': 1 }, upgrades: ['Обстрел'] });
        const before = myUnits(st).find(u => u.unit === 'фрегаты-класса-хелебор');
        const origin = [before.system, before.area];
        ok(burn(st, 'Обстрел').ok, 'карта применена');
        fire(st, dice0);
        if (st.pending && st.pending.question.op === 'strikePayPick')
            ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { choice: 0 } }).ok, 'отказ от оплаты');
        ok(!st.pending || st.pending.question.op !== 'moveUnits', 'нет бесплатного движения');
        eq([before.system, before.area], origin, 'корабль остался на месте');
    }
});

function eldarCorsairBattle() {
    const st = strikeState({ faction: ELDAR, ships: { 'фрегаты-класса-хелебор': 1 },
        foeUnits: { 'гвардейцы': 1 }, upgrades: ['Рейд корсаров'] });
    const active = st.order.system;
    const fighter = myUnits(st).find(u => u.unit === 'аспектные-воины');
    FS_RULES.addUnit(st, 1, 'гвардейцы', active, fighter.area);
    st.order.phase = 'move';
    eq(burn(st, 'Рейд корсаров').ok, false, 'до боя карта неприменима');
    ok(FS_RULES.apply(st, 0, { type: 'endAdvance' }).ok, 'закончены корабли');
    ok(FS_RULES.apply(st, 0, { type: 'endAdvance' }).ok, 'начат бой');
    ok(st.combat, 'идёт настоящий бой');
    eq(burn(st, 'Рейд корсаров').ok, false, 'во время боя карта неприменима');
    st.combat.cards.attacker.hand = ['Бей и беги'];
    st.combat.cards.defender.hand = ['Ложись!'];
    st.combat.dice.attacker = Array(8).fill('att');
    st.combat.dice.defender = [];
    refuseReinforce(st);
    ok(FS_RULES.apply(st, 0, { type: 'combat', action: 'playCard', index: 0 }).ok, 'карта атакующего');
    ok(FS_RULES.apply(st, 1, { type: 'combat', action: 'playCard', index: 0 }).ok, 'карта защитника');
    answerAll(st, (s, q) => q.kind === 'ability' && /потратьте/i.test(q.text) ? { no: true } : firstOption(s, q), 0);
    answerAll(st, (s, q) => q.kind === 'ability' ? { no: true } : firstOption(s, q), 1);
    const victim = foeUnits(st).find(u => u.system === active && u.area === fighter.area);
    ok(st.combat && st.combat.step === 'damage-defender', 'урон защитнику после розыгрыша');
    ok(FS_RULES.apply(st, 1, { type: 'combat', action: 'damage', targets: [victim.id] }).ok, 'защитник распределил урон');
    ok(!st.combat, 'бой завершён');
    return st;
}
check('Рейд корсаров', 'после настоящего боя открывает дополнительный удар и не действует раньше', () => {
    let st = eldarCorsairBattle();
    eq(st.order && st.order.phase, 'corsair', 'после боя предложен выбор');
    const game = Object.create(FSGame.prototype);
    let sent = null; game.net = { cmd: cmd => { sent = cmd; } }; game.overflow = null;
    const view = { actions: [] };
    game.panelAdvance(Object.assign({}, st, { seat: 0 }), view);
    const use = view.actions.find(a => /Рейд корсаров/.test(a.label || ''));
    ok(use, 'панель предлагает карту после боя');
    use.onClick();
    eq(sent, { type: 'useUpgrade', card: 'Рейд корсаров' }, 'панель отправляет применение карты');
    st = JSON.parse(JSON.stringify(st));
    ok(FS_RULES.apply(st, 0, sent).ok, 'карта применена после JSON');
    eq(st.order.phase, 'strike', 'открыт удар в активной системе');
    const target = FS_RULES.orbitalStrikeTargets(st, 0).find(x => x.pos === st.strikeWorld);
    ok(target, 'есть вражеский мир в активной системе');
    fire(st, ['att', 'att', 'att']);
    ok(st.strike && st.strike.hits === 3, 'дополнительный удар действительно нанесён');
    eq(burn(st, 'Рейд корсаров').ok, false, 'второй раз карту использовать нельзя');
});
check('Рейд корсаров', 'отказ заканчивает приказ и не тратит карту', () => {
    const st = eldarCorsairBattle();
    eq(st.order.phase, 'corsair', 'момент после боя');
    const game = Object.create(FSGame.prototype);
    let sent = null; game.net = { cmd: cmd => { sent = cmd; } }; game.overflow = null;
    const view = { actions: [] }; game.panelAdvance(Object.assign({}, st, { seat: 0 }), view);
    const skip = view.actions.find(a => /Без.*удара|Не.*удар/i.test(a.label || ''));
    ok(skip, 'в панели есть отказ');
    skip.onClick();
    ok(FS_RULES.apply(st, 0, sent).ok, 'отказ принят');
    ok(!st.order, 'приказ завершился');
    eq(st.players[0].upgrades.find(x => x.name === 'Рейд корсаров').used, false, 'карта не потрачена');
});

head('События · планы', ELDAR);
function eldarLastPlanning() {
    const st = FS_RULES.newReadyGame({ seed: 5, players: players(ELDAR, FOE) });
    st.phase = 'planning'; st.turn = 0; st.firstPlayer = 0; st.order = null; st.pending = null;
    for (const sys of st.systems) sys.tokens = [];
    const sys = st.systems.find(s => FS_RULES.canPlaceOrder(st, 0, s.id));
    ok(sys, 'система последнего приказа');
    sys.tokens.push({ seat: 1, order: 'advance', faceUp: false },
        { seat: 0, order: 'deploy', faceUp: false },
        { seat: 1, order: 'dominate', faceUp: false });
    st.players[0].placedTokens = 3; st.players[0].placedOf = { advance: 1, deploy: 1, dominate: 1 };
    st.players[1].placedTokens = 4; st.players[1].placedOf = { advance: 2, dominate: 2 };
    const card = FS_DATA.events.find(c => c.faction === ELDAR && c.name === 'Обход');
    FS_RULES.keepEventScheme(st, 0, card);
    ok(FS_RULES.apply(st, 0, { type: 'placeOrder', system: sys.id, order: 'strategize' }).ok, 'последний приказ выложен');
    return { st, system: sys.id };
}
check('Обход', 'после последнего приказа выбирает свой жетон в середине стека и перемещает наверх или вниз', () => {
    for (const top of [true, false]) {
        let { st, system } = eldarLastPlanning();
        eq(st.phase, 'planning', 'фаза не закрыта до ответа на план');
        ok(st.pending && st.pending.question.kind === 'scheme', 'план предложен автоматически');
        ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { choice: 0 } }).ok, 'план сброшен');
        let q = st.pending && st.pending.question;
        ok(q && q.op === 'reorderOwnOrder' && q.kind === 'choice', 'выбор жетона в стеке');
        const idx = q.options.findIndex(x => x.system === system && x.index === 1);
        ok(idx >= 0, 'свой жетон в середине предложен');
        ok(q.options.every(x => FS_RULES.system(st, x.system).tokens[x.index].seat === 0), 'чужие жетоны не предложены');
        eq(FS_RULES.apply(st, 0, { type: 'effect', answer: { choice: 999 } }).ok, false, 'подмена выбора запрещена');
        ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { choice: idx } }).ok, 'свой жетон выбран');
        st = JSON.parse(JSON.stringify(st)); q = st.pending.question;
        ok(/развёртыван/i.test(q.privateText), 'показан тип выбранного жетона');
        ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { choice: top ? 0 : 1 } }).ok, 'выбрана позиция после JSON');
        const tokens = FS_RULES.system(st, system).tokens;
        eq(tokens.map(t => [t.seat, t.order]), top
            ? [[1, 'advance'], [1, 'dominate'], [0, 'strategize'], [0, 'deploy']]
            : [[0, 'deploy'], [1, 'advance'], [1, 'dominate'], [0, 'strategize']], 'остальные жетоны сохранили порядок');
        ok(tokens.every(t => !t.faceUp), 'жетон не раскрыт противникам');
        eq(st.phase, 'operations', 'после вопроса начинается фаза действий');
        ok(!st.players[0].schemes.some(s => s.name === 'Обход'), 'план сброшен');
    }
});
check('Обход', 'отказ сохраняет план и без перестановки запускает действия', () => {
    const { st, system } = eldarLastPlanning();
    const before = JSON.stringify(FS_RULES.system(st, system).tokens);
    ok(st.pending && st.pending.question.kind === 'scheme', 'план предложен');
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { no: true } }).ok, 'отказ принят');
    eq(st.phase, 'operations', 'действия начались');
    eq(JSON.stringify(FS_RULES.system(st, system).tokens), before, 'стек не изменился');
    ok(st.players[0].schemes.some(s => s.name === 'Обход'), 'карта осталась на столе');
});

function eldarGateState() {
    const st = FS_RULES.newReadyGame({ seed: 5, players: players(ELDAR, FOE) });
    st.units = []; st.structures = []; st.objectives = []; st.storms = [];
    for (const sys of st.systems) sys.tokens = [];
    st.phase = 'operations'; st.turn = 0; st.firstPlayer = 0; st.order = null; st.pending = null;
    const sys = st.systems[0], src = sys.areas.find(a => a.world), other = sys.areas.find(a => a.world && a.pos !== src.pos);
    FS_RULES.addUnit(st, 0, 'аспектные-воины', sys.id, src.pos);
    FS_RULES.addUnit(st, 0, 'аспектные-воины', sys.id, src.pos);
    FS_RULES.addUnit(st, 0, 'аспектные-воины', sys.id, src.pos);
    st.units.at(-1).routed = true;
    FS_RULES.addUnit(st, 0, 'призрачные-стражи', sys.id, other.pos);
    const foe = st.systems.find(s => s.id !== sys.id && s.areas.some(a => a.world));
    FS_RULES.addUnit(st, 1, 'гвардейцы', foe.id, foe.areas.find(a => a.world).pos);
    sys.tokens.push({ seat: 0, order: 'advance', faceUp: false });
    foe.tokens.push({ seat: 1, order: 'deploy', faceUp: false });
    FS_RULES.keepEventScheme(st, 0, FS_DATA.events.find(c => c.faction === ELDAR && c.name === 'Врата варпа'));
    return { st, src: { system: sys.id, pos: src.pos }, foe: foe.id };
}
check('Врата варпа', 'вместо раскрытия приказа перемещает выбранные отряды одной области и передаёт ход', () => {
    let { st, src, foe } = eldarGateState();
    eq(FS_RULES.apply(st, 0, { type: 'resolveOrder', system: foe }).ok, false, 'нельзя вызвать план чужим жетоном');
    eq(st.pending, null, 'чужой жетон не открывает план');
    ok(FS_RULES.apply(st, 0, { type: 'resolveOrder', system: src.system }).ok, 'попытка раскрыть свой приказ');
    ok(st.pending && st.pending.question.kind === 'scheme', 'план предложен вместо приказа');
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { choice: 0 } }).ok, 'план принят');
    let q = st.pending.question;
    ok(q.op === 'warpGateMove' && q.kind === 'areas', 'источник выбирается отдельно');
    eq(FS_RULES.apply(st, 0, { type: 'effect', answer: { source: { system: foe, pos: st.units.find(u => u.seat === 1).area } } }).ok, false, 'чужая область не источник');
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { source: src } }).ok, 'выбран источник');
    q = st.pending.question;
    eq(q.kind, 'units', 'выбор отрядов');
    eq(q.options.length, 2, 'только недеморализованные в одной области');
    const ids = q.options.slice(), outsider = st.units.find(u => u.seat === 0 && u.area !== src.pos).id;
    eq(FS_RULES.apply(st, 0, { type: 'effect', answer: { units: [ids[0], outsider] } }).ok, false, 'нельзя смешивать области');
    eq(FS_RULES.apply(st, 0, { type: 'effect', answer: { units: [ids[0], ids[0]] } }).ok, false, 'нельзя повторять модели');
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { units: ids } }).ok, 'выбраны оба');
    st = JSON.parse(JSON.stringify(st)); q = st.pending.question;
    ok(q.kind === 'areas' && q.options.length, 'предложены допустимые миры после JSON');
    ok(q.options.every(a => FS_RULES.area(FS_RULES.system(st, a.system), a.pos).world
        && ['friendly', 'none'].includes(FS_RULES.control(st, 0, a.system, a.pos))
        && (a.system !== src.system || a.pos !== src.pos)), 'только другой дружественный или свободный мир');
    const dest = q.options[0];
    eq(FS_RULES.apply(st, 0, { type: 'effect', answer: { area: { system: foe, pos: st.units.find(u => u.seat === 1).area } } }).ok, false, 'вражеская область запрещена');
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { area: dest } }).ok, 'место выбрано');
    ok(ids.every(id => { const u = st.units.find(x => x.id === id); return u.system === dest.system && u.area === dest.pos; }), 'оба выбранных отряда перемещены');
    ok(st.units.some(u => u.routed && u.system === src.system && u.area === src.pos), 'деморализованный не двигался');
    eq(FS_RULES.system(st, src.system).tokens.length, 1, 'приказ не раскрыт');
    eq(st.turn, 1, 'вместо приказа потрачен ход');
    ok(!st.players[0].schemes.some(s => s.name === 'Врата варпа'), 'план сброшен');
});
check('Врата варпа', 'отказ оставляет план и позволяет раскрыть тот же приказ', () => {
    const { st, src } = eldarGateState();
    ok(FS_RULES.apply(st, 0, { type: 'resolveOrder', system: src.system }).ok, 'момент плана');
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { no: true } }).ok, 'план отклонён');
    ok(st.players[0].schemes.some(s => s.name === 'Врата варпа'), 'план остался');
    ok(FS_RULES.apply(st, 0, { type: 'resolveOrder', system: src.system }).ok, 'приказ раскрыт');
    ok(st.order && st.order.order === 'advance', 'действительно идёт наступление');
});

check('Агрессивный налёт', 'после броска перебрасывает выбранные кубики и добавляет выбранную грань, затем продолжается тот же удар', () => {
    let st = strikeState({ faction: ELDAR, ships: { 'фрегаты-класса-хелебор': 1 },
        foeUnits: { 'гвардейцы': 1 }, upgrades: [] });
    FS_RULES.keepEventScheme(st, 0, FS_DATA.events.find(c => c.faction === ELDAR && c.name === 'Агрессивный налёт'));
    fire(st, ['def', 'morale', 'att']);
    ok(st.pending && st.pending.question.kind === 'scheme', 'план предложен во время удара');
    const plan = st.order.strikePlanned;
    eq(plan.pool, ['def', 'morale', 'att'], 'кубики удара уже брошены');
    const target = [plan.system, plan.pos];
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { choice: 0 } }).ok, 'план сброшен');
    let q = st.pending && st.pending.question;
    ok(q && q.op === 'rerollStrikeDice' && q.diceSource === 'strike', 'выбираются именно кубики удара');
    eq(FS_RULES.apply(st, 0, { type: 'effect', answer: { dice: [99] } }).ok, false, 'чужой индекс отклонён');
    st = JSON.parse(JSON.stringify(st));
    withFixedDice(['att'], () => ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { dice: [0] } }).ok, 'один кубик переброшен'));
    eq(st.order.strikePlanned.pool, ['att', 'morale', 'att'], 'прочие кубики не менялись');
    q = st.pending && st.pending.question;
    ok(q && q.op === 'gainStrikeDie' && q.kind === 'choice', 'выбор грани дополнительного кубика');
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { choice: 2 } }).ok, 'получен morale');
    ok(st.strike && st.strike.hits === 2, 'удар продолжен с двумя атаками');
    eq([st.strike.system, st.strike.pos], target, 'цель не изменилась');
    ok(!st.players[0].schemes.some(s => s.name === 'Агрессивный налёт'), 'план сброшен');
});
check('Агрессивный налёт', 'отказ не заставляет бросать удар повторно; при восьми кубиках дополнительного нет', () => {
    const st = strikeState({ faction: ELDAR, ships: { 'фрегаты-класса-хелебор': 1 }, foeUnits: { 'гвардейцы': 1 }, upgrades: [] });
    FS_RULES.keepEventScheme(st, 0, FS_DATA.events.find(c => c.faction === ELDAR && c.name === 'Агрессивный налёт'));
    fire(st, ['att', 'def', 'def']);
    ok(st.pending && st.pending.question.kind === 'scheme', 'план предложен');
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { no: true } }).ok, 'отказ');
    ok(st.strike && st.strike.hits === 1, 'оригинальный бросок немедленно продолжается');
    ok(st.players[0].schemes.some(s => s.name === 'Агрессивный налёт'), 'карта сохранена');
    const full = strikeState({ faction: ELDAR, ships: { 'фрегаты-класса-хелебор': 2 }, foeUnits: { 'гвардейцы': 1 }, upgrades: [] });
    full.order.strikeDice = ['def', 'morale']; full.order.strikeBonus = 0;
    FS_RULES.keepEventScheme(full, 0, FS_DATA.events.find(c => c.faction === ELDAR && c.name === 'Агрессивный налёт'));
    fire(full, ['att', 'att', 'def', 'def', 'morale', 'morale']);
    ok(FS_RULES.apply(full, 0, { type: 'effect', answer: { choice: 0 } }).ok, 'план принят');
    eq(full.order.strikePlanned.pool.length, 8, 'восемь кубиков');
    ok(FS_RULES.apply(full, 0, { type: 'effect', answer: { dice: [] } }).ok, 'можно не перебрасывать');
    ok(!full.pending || full.pending.question.op !== 'gainStrikeDie', 'девятый кубик не предлагается');
    ok(full.strike && full.strike.hits === 2, 'удар продолжается');
});

check('Обстрел', 'нельзя проскочить выбор места или подменить корабль во втором ответе', () => {
    const st = strikeState({ faction: ELDAR, ships: { 'фрегаты-класса-хелебор': 2 },
        foeUnits: { 'гвардейцы': 1 }, upgrades: ['Обстрел'] });
    ok(burn(st, 'Обстрел').ok, 'карта'); fire(st, ['def', 'def', 'att']);
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { choice: 1 } }).ok, 'оплата');
    const ids = st.pending.question.options.slice();
    const forbidden = { system: st.order.system, pos: st.strikeWorld };
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { units: [ids[0]], area: forbidden } }).ok, 'корабль выбран');
    let q = st.pending.question;
    ok(q.kind === 'areas' && q.op === 'moveUnits', 'чужое место не пропустило вопрос');
    const target = q.options[0];
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { area: target, units: [ids[1]] } }).ok, 'место выбрано');
    const moved = st.units.filter(u => ids.includes(u.id) && u.system === target.system && u.area === target.pos).map(u => u.id);
    eq(moved, [ids[0]], 'движется ранее выбранный, а не подменённый корабль');
});
check('Врата варпа', 'корабли не выходят за штормы; переполнение ждёт выбора до передачи хода', () => {
    for (const blocked of [true, false]) {
        const { st, src, foe } = eldarGateState();
        const sys = FS_RULES.system(st, src.system), start = sys.areas.find(a => !a.world);
        FS_RULES.addUnit(st, 0, 'фрегаты-класса-хелебор', sys.id, start.pos);
        FS_RULES.addUnit(st, 0, 'фрегаты-класса-хелебор', sys.id, start.pos);
        const shipIds = st.units.filter(u => u.seat === 0 && u.area === start.pos && u.system === sys.id).map(u => u.id);
        const destSys = FS_RULES.system(st, foe), dest = destSys.areas.find(a => !a.world);
        for (let i = 0; i < 3; i++) FS_RULES.addUnit(st, 0, 'фрегаты-класса-хелебор', foe, dest.pos);
        if (blocked) {
            for (const side of ['N', 'E', 'S', 'W']) if (FS_RULES.across(st, sys.id, side))
                st.storms.push({ id: 'gate-storm-' + side, system: sys.id, side, moved: false });
        }
        ok(FS_RULES.apply(st, 0, { type: 'resolveOrder', system: sys.id }).ok, 'момент плана');
        ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { choice: 0 } }).ok, 'план принят');
        ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { source: { system: sys.id, pos: start.pos } } }).ok, 'выбран источник');
        ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { units: shipIds } }).ok, 'выбраны корабли');
        const q = st.pending && st.pending.question;
        if (blocked) {
            ok(!q || q.options.every(a => a.system === sys.id), 'из окружённой штормами системы не выйти');
            continue;
        }
        ok(q && q.options.some(a => a.system === foe && a.pos === dest.pos), 'дружественная пустота предложена');
        ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { area: { system: foe, pos: dest.pos } } }).ok, 'флот прибыл');
        ok(FS_RULES.trimQueue(st).blocked(0), 'требуется убрать лишних');
        eq(st.turn, 0, 'ход не передан до исправления вместимости');
        eq(FS_RULES.apply(st, 1, { type: 'resolveOrder', system: foe }).ok, false, 'противник не действует до выбора');
        for (const id of shipIds) ok(FS_RULES.apply(st, 0, { type: 'trimUnit', unit: id }).ok, 'лишний корабль убран');
        eq(st.turn, 1, 'теперь ход передан');
    }
});

check('Врата варпа', 'пустой выбор расходует ход без движения, как разрешает любое количество', () => {
    const { st, src } = eldarGateState();
    const before = JSON.parse(JSON.stringify(st.units));
    ok(FS_RULES.apply(st, 0, { type: 'resolveOrder', system: src.system }).ok, 'окно плана');
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { choice: 0 } }).ok, 'сброс плана');
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { source: src } }).ok, 'область');
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { units: [] } }).ok, 'можно не перемещать никого');
    eq(st.units, before, 'ни один отряд не переместился');
    eq([st.pending, st.turn, FS_RULES.system(st, src.system).tokens.length], [null, 1, 1], 'ход ушёл, приказ не раскрыт');
});
check('Врата варпа', 'все источники без законной цели не оставляют пустой вопрос', () => {
    const { st, src } = eldarGateState();
    st.systems = [FS_RULES.system(st, src.system)];
    const sys = st.systems[0];
    for (const area of sys.areas) if (area.world && area.pos !== src.pos)
        FS_RULES.addUnit(st, 1, 'гвардейцы', sys.id, area.pos);
    st.units = st.units.filter(u => u.system === src.system && (u.seat === 1 || u.area === src.pos));
    ok(FS_RULES.apply(st, 0, { type: 'resolveOrder', system: src.system }).ok, 'окно плана');
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { choice: 0 } }).ok, 'сброс плана');
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { source: src } }).ok, 'источник');
    const id = st.pending.question.options[0];
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { units: [id] } }).ok, 'выбран отряд');
    ok(!st.pending, 'нет вопроса с пустым списком целей');
    eq(st.units.find(u => u.id === id).area, src.pos, 'отряд остался на месте');
});
check('Обстрел', 'штормы и чужая пустота запрещены, переполнение разрешается после удара', () => {
    const st = strikeState({ faction: ELDAR, ships: { 'фрегаты-класса-хелебор': 2 },
        foeUnits: { 'гвардейцы': 1 }, upgrades: ['Обстрел'] });
    const active = st.order.system, neighbor = FS_RULES.neighbors(st, active)[0];
    const dest = FS_RULES.system(st, neighbor).areas.find(a => !a.world);
    const blockedSystem = FS_RULES.neighbors(st, active)[1], blocked = FS_RULES.system(st, blockedSystem);
    const side = ['N', 'E', 'S', 'W'].find(side => FS_RULES.across(st, active, side) === blockedSystem);
    ok(side, 'граница второго соседа найдена');
    st.storms.push({ id: 'barrage-storm', system: active, side, moved: false });
    const enemy = FS_RULES.system(st, neighbor).areas.find(a => !a.world && a.pos !== dest.pos);
    if (enemy) FS_RULES.addUnit(st, 1, 'крейсеры', neighbor, enemy.pos);
    for (let i = 0; i < 3; i++) FS_RULES.addUnit(st, 0, 'фрегаты-класса-хелебор', neighbor, dest.pos);
    ok(burn(st, 'Обстрел').ok, 'улучшение');
    fire(st, ['def', 'def', 'att']);
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { choice: 1 } }).ok, 'оплачено двумя оборонами');
    const ids = st.pending.question.options.slice();
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { units: ids } }).ok, 'выбраны корабли');
    const q = st.pending.question;
    ok(q.options.some(a => a.system === neighbor && a.pos === dest.pos), 'дружественная пустота доступна');
    ok(q.options.every(a => a.system !== blockedSystem), 'шторм закрывает соседнюю систему');
    if (enemy) ok(!q.options.some(a => a.system === neighbor && a.pos === enemy.pos), 'вражеская пустота не доступна');
    eq(FS_RULES.apply(st, 0, { type: 'effect', answer: { area: { system: blockedSystem, pos: blocked.areas.find(a => !a.world).pos } } }).ok, false, 'нельзя подделать цель за штормом');
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { area: { system: neighbor, pos: dest.pos } } }).ok, 'флот прибыл');
    ok(st.strike && st.strike.hits === 1, 'попадание ждёт распределения');
    const victim = st.units.find(u => u.seat === 1 && u.system === active && u.area === st.strikeWorld);
    ok(FS_RULES.apply(st, 1, { type: 'strikeDamage', unit: victim.id }).ok, 'защитник получил урон');
    ok(FS_RULES.trimQueue(st).blocked(0), 'сверх вместимости выбирается после окончания удара');
    eq(st.turn, 0, 'ход ждёт устранения переполнения');
    for (const id of ids) ok(FS_RULES.apply(st, 0, { type: 'trimUnit', unit: id }).ok, 'лишний корабль уничтожен');
    eq(st.turn, 1, 'ход передан');
});
check('Агрессивный налёт', 'добавленная оборона оплачивает «Обстрел», а мораль — «Точный удар» без повторного броска', () => {
    for (const card of ['Обстрел', 'Точный удар']) {
        let st = strikeState({ faction: ELDAR, ships: { 'фрегаты-класса-хелебор': 2 },
            foeUnits: { 'гвардейцы': 2 }, upgrades: [card] });
        FS_RULES.keepEventScheme(st, 0, FS_DATA.events.find(c => c.faction === ELDAR && c.name === 'Агрессивный налёт'));
        ok(burn(st, card).ok, 'использовано ' + card);
        // The selected bonus die of Precise Strike is fixed as an attack.
        if (st.pending && st.pending.question.op === 'gainStrikeDie') {
            ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { choice: 0 } }).ok, 'выбран кубик улучшения');
        }
        fire(st, ['def', 'att', 'att', 'att']);
        eq(st.pending.question.kind, 'scheme', 'план предлагается после броска');
        ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { choice: 0 } }).ok, 'план принят');
        ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { dice: [] } }).ok, 'без переброса');
        st = JSON.parse(JSON.stringify(st));
        eq(st.pending.question.op, 'gainStrikeDie', 'выбор добавочного кубика пережил JSON');
        ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { choice: card === 'Обстрел' ? 1 : 2 } }).ok, 'кубик выбран');
        eq(st.pending.question.op, 'strikePayPick', 'после плана доступна оплата ' + card);
        ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { choice: 1 } }).ok, 'оплата произведена');
        if (card === 'Обстрел') {
            eq(st.pending.question.kind, 'units', 'обстрел спрашивает корабли');
            ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { units: [] } }).ok, 'можно не двигать корабли');
            ok(st.strike && st.strike.hits === 3, 'удар сохранил все атаки');
        } else {
            eq(st.pending.question.op, 'strikeFirstPick', 'точный удар выбирает первую цель');
            const first = st.pending.question.options[0];
            ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { units: [first] } }).ok, 'первая цель');
            ok(st.strike && st.strike.first === first, 'отмечена нужная цель');
        }
    }
});

check('Агрессивный налёт', 'искусственный предбросковый план и оба улучшения: бонус, переброс, последовательные оплаты и завершение удара', () => {
    for (const accept of [true, false]) {
        let st = strikeState({ faction: ELDAR, foeFaction: IG, ships: { 'фрегаты-класса-хелебор': 1 },
            foeUnits: { 'гвардейцы': 1, 'огрины': 1 }, upgrades: ['Обстрел', 'Точный удар'] });
        st.systems[1].tokens.push({ seat: 1, order: 'deploy', faceUp: false });
        ok(burn(st, 'Обстрел').ok, 'подготовлен обстрел');
        withFixedDice(['morale'], () => ok(burn(st, 'Точный удар').ok, 'подготовлен точный удар'));
        eq(st.order.strikePays.map(p => p.kind), ['def', 'morale'], 'оба улучшения хранят собственные цены');
        eq(st.order.strikeDice, ['morale'], 'дополнительный кубик точного удара');
        FS_RULES.keepEventScheme(st, 0, FS_DATA.events.find(c => c.faction === ELDAR && c.name === 'Агрессивный налёт'));
        // A Guard plan on an Eldar player is impossible in an ordinary game;
        // injecting it explicitly exercises the shared before/after-roll windows.
        schemeInPlay(st, 'Точечный удар', IG);
        const target = FS_RULES.orbitalStrikeTargets(st, 0).find(t => t.pos === st.strikeWorld);
        const cmd = { type: 'orbitalStrike', system: target.system, pos: target.pos };
        ok(FS_RULES.apply(st, 0, cmd).ok, 'открыто предбросковое окно');
        eq(pending(st).options, ['Точечный удар'], 'налёт не предлагается до броска');
        eq(st.order.strikePlanned || null, null, 'броска ещё нет');
        st = JSON.parse(JSON.stringify(st));
        ok(FS_RULES.apply(st, 0, { type: 'effect', answer: accept ? { choice: 0 } : { no: true } }).ok, 'предбросковый план разрешён');
        eq(st.order.strikeBonus || 0, accept ? 2 : 0, 'бонус принят или сохранён отказом');
        withFixedDice(['def', 'att', 'att'], () => ok(FS_RULES.apply(st, 0, cmd).ok, 'единственный бросок'));
        eq(pending(st).options, ['Агрессивный налёт'], 'после броска предложен только налёт');
        eq(st.order.strikePlanned.pool, ['def', 'att', 'att', 'morale'], 'исходные кубики и кубик улучшения');
        eq(st.order.strikePlanned.hits, accept ? 4 : 2, 'предбросковый бонус учтён');
        st = JSON.parse(JSON.stringify(st));
        ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { choice: 0 } }).ok, 'налёт принят');
        withFixedDice(['def'], () => ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { dice: [1] } }).ok, 'атака переброшена в оборону'));
        eq(st.order.strikePlanned.hits, accept ? 3 : 1, 'переброс изменил только попадание кубика, не бонус');
        st = JSON.parse(JSON.stringify(st));
        ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { choice: 0 } }).ok, 'налёт добавил атаку');
        eq([pending(st).op, pending(st).index, st.order.strikePlanned.hits], ['strikePayPick', 0, accept ? 4 : 2], 'первый платёж после налёта');
        ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { choice: 1 } }).ok, 'обстрел оплачен двумя оборонами');
        eq([pending(st).op, pending(st).kind], ['moveUnits', 'units'], 'награда обстрела выбирает корабли');
        st = JSON.parse(JSON.stringify(st));
        ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { units: [] } }).ok, 'корабли можно оставить');
        eq([pending(st).op, pending(st).index, st.order.strikePlanned.pool], ['strikePayPick', 1, ['att', 'morale', 'att']], 'вторая цена видит остаток кубиков');
        ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { choice: 1 } }).ok, 'точный удар оплачен моралью');
        eq(pending(st).op, 'strikeFirstPick', 'после обеих оплат выбирается первая цель');
        const guard = st.units.find(u => u.seat === 1 && u.unit === 'гвардейцы').id;
        const ogryn = st.units.find(u => u.seat === 1 && u.unit === 'огрины').id;
        st = JSON.parse(JSON.stringify(st));
        ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { units: [guard] } }).ok, 'первая цель выбрана');
        eq([st.strike.first, st.strike.hits], [guard, accept ? 4 : 2], 'удар сохраняет бонус и выбор');
        eq(FS_RULES.apply(st, 1, { type: 'strikeDamage', unit: ogryn }).ok, false, 'защитник обязан сначала назначить выбранной цели');
        ok(FS_RULES.apply(st, 1, { type: 'strikeDamage', unit: guard }).ok, 'первая цель получила урон');
        st = JSON.parse(JSON.stringify(st));
        ok(FS_RULES.apply(st, 1, { type: 'strikeDamage', unit: ogryn }).ok, 'остаток урона распределён после JSON');
        eq([st.strike, st.order, st.turn], [null, null, 1], 'удар и приказ завершены ровно один раз');
        eq(st.players[0].schemes.some(s => s.name === 'Точечный удар'), !accept, 'отказанный предбросковый план сохранён');
        ok(!st.players[0].schemes.some(s => s.name === 'Агрессивный налёт'), 'сыгранный налёт сброшен');
    }
});

head('Улучшения приказов · границы', ELDAR);
check('Певцы психокости', 'подсветка соответствует выбранному типу, цена оплачивается, использование сбрасывается в новом раунде', () => {
    const st = orderState('deploy', { faction: ELDAR, upgrades: ['Певцы психокости'],
        units: { 'аспектные-воины': 1 }, structures: ['factory'], materiel: 10 });
    const system = st.order.system, pos = worldOf(st, system);
    const foeSys = st.systems.find(s => s.id !== system && s.areas.some(a => a.world));
    FS_RULES.addUnit(st, 1, 'гвардейцы', foeSys.id, foeSys.areas.find(a => a.world).pos);
    foeSys.tokens.push({ seat: 1, order: 'advance', faceUp: false });
    ok(FS_RULES.apply(st, 0, { type: 'deployStructures' }).ok, 'шаг построек');
    const game = Object.create(FSGame.prototype); game.state = Object.assign({}, st, { seat: 0 });
    game.pending = { structure: 'city' }; game.view = { metrics: {} };
    game.app = { location: { terrain: { heightAt: () => 0 } } };
    const view = ctx.FSView, oldArea = view.areaPos, oldHighlight = view.highlight;
    let rings = [];
    try {
        view.areaPos = (app, sys, at) => ({ x: sys.areas.findIndex(a => a.pos === at), y: 0 });
        view.highlight = (v, list) => { rings = list; };
        game.highlightPlace(null);
        const marker = FS_RULES.system(st, system).areas.findIndex(a => a.pos === pos);
        ok(!rings.some(r => r.x === marker), 'до применения занятый мир не подсвечен');
        ok(burn(st, 'Певцы психокости').ok, 'карта применена');
        game.highlightPlace(null);
        ok(rings.some(r => r.x === marker), 'для города мир с фабрикой подсвечен');
        game.pending.structure = 'factory'; game.highlightPlace(null);
        ok(!rings.some(r => r.x === marker), 'для второй фабрики тот же мир не подсвечен');
    } finally { view.areaPos = oldArea; view.highlight = oldHighlight; }
    const price = FS_RULES.structureStats('city').cost, before = st.players[0].materiel;
    ok(FS_RULES.apply(st, 0, { type: 'buyStructure', structure: 'city', system, pos }).ok, 'город куплен');
    eq(st.players[0].materiel, before, 'оплата отложена до конца приказа');
    eq(FS_RULES.apply(st, 0, { type: 'buyStructure', structure: 'bastion', system, pos }).ok, false, 'вторая покупка запрещена');
    ok(FS_RULES.apply(st, 0, { type: 'finishDeploy' }).ok, 'приказ закончен');
    eq(st.players[0].materiel, before - price, 'город оплачен по цене');
    ok(st.players[0].upgrades[0].used, 'карта использована в этом раунде');
    FS_RULES.endRound(st);
    eq(st.players[0].upgrades[0].used, false, 'в новом раунде использование сброшено');
});
check('Певцы психокости', 'нельзя строить на двух постройках, чужой постройке или вне активной системы', () => {
    const st = orderState('deploy', { faction: ELDAR, upgrades: ['Певцы психокости'],
        units: { 'аспектные-воины': 1 }, structures: ['factory'], materiel: 10 });
    const system = st.order.system, pos = worldOf(st, system);
    ok(FS_RULES.apply(st, 0, { type: 'deployStructures' }).ok, 'шаг построек');
    ok(burn(st, 'Певцы психокости').ok, 'карта применена');
    FS_RULES.addStructure(st, 0, 'city', system, pos);
    eq(FS_RULES.apply(st, 0, { type: 'buyStructure', structure: 'bastion', system, pos }).ok, false, 'третья постройка запрещена');
    const other = st.systems.find(s => s.id !== system && s.areas.some(a => a.world));
    const otherPos = other.areas.find(a => a.world).pos;
    FS_RULES.addStructure(st, 0, 'factory', other.id, otherPos);
    eq(FS_RULES.apply(st, 0, { type: 'buyStructure', structure: 'city', system: other.id, pos: otherPos }).ok, false, 'другая система запрещена');
    st.structures = st.structures.filter(x => !(x.system === system && x.area === pos));
    FS_RULES.addStructure(st, 1, 'factory', system, pos);
    eq(FS_RULES.apply(st, 0, { type: 'buyStructure', structure: 'city', system, pos }).ok, false, 'чужая фабрика не подходит');
});

head('События · Предвидение', ELDAR);

function foresightScheme(st, seat) {
    const card = FS_DATA.events.find(e => e.faction === ELDAR && e.name === 'Предвидение');
    const trigger = FS_EFFECTS.parse(card.text, { kind: 'event', faction: ELDAR }).find(s => s.op === 'trigger');
    st.players[seat].schemes = [{ name: card.name, text: card.text, trigger: trigger.trigger,
        steps: trigger.steps, defer: !!trigger.defer, note: !!trigger.note }];
}

function foresightBattle(owner = 0) {
    const ownAttacker = owner === 0;
    const st = battle({ faction: ownAttacker ? ELDAR : 'имперская-гвардия',
        foeFaction: ownAttacker ? 'имперская-гвардия' : ELDAR,
        units: ownAttacker ? { 'аспектные-воины': 2 } : { 'гвардейцы': 2 },
        foeUnits: ownAttacker ? { 'гвардейцы': 2 } : { 'аспектные-воины': 2 },
        dice: ['def'], foeDice: ['def'], roundEnd: true });
    foresightScheme(st, owner);
    const c = st.combat, source = { system: c.system, pos: c.pos };
    const sys = FS_RULES.system(st, source.system);
    const target = FS_RULES.areasAround(st, source.system, source.pos)
        .find(a => a.system === source.system && !!sys.areas.find(x => x.pos === a.pos).world);
    ok(!!target, 'для фикстуры нужен соседний мир');
    FS_RULES.addStructure(st, owner, 'city', target.system, target.pos);
    return { st, source, target };
}

check('Предвидение', 'начало шага предлагается обеим сторонам даже при нулевом уроне; отказ и JSON не теряют ход', () => {
    let { st } = foresightBattle(0);
    st.players[1].faction = ELDAR;
    foresightScheme(st, 1);
    st.combat.dice.attacker = ['def']; st.combat.dice.defender = ['def'];
    st.combat.step = 'damage-attacker';
    FS_RULES.advanceCombatSteps(st);
    eq([st.pending && st.pending.seat, st.pending && st.pending.question.kind], [0, 'scheme'], 'сначала атакующий');
    st = JSON.parse(JSON.stringify(st));
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { no: true } }).ok, 'атакующий отказался');
    eq([st.pending && st.pending.seat, st.pending && st.pending.question.kind], [1, 'scheme'], 'затем защищающийся, до урона');
    st = JSON.parse(JSON.stringify(st));
    ok(FS_RULES.apply(st, 1, { type: 'effect', answer: { no: true } }).ok, 'защищающийся отказался');
    eq([st.players[0].schemes.length, st.players[1].schemes.length], [1, 1], 'оба плана сохранены');
    eq([st.combat.round, st.combat.step, st.pending], [2, 'choose-attacker', null], 'нулевой урон и конец раунда разрешены');
});

check('Предвидение', 'защищающийся выводит все недеморализованные отряды и подкрепления в один подходящий мир; бой завершается', () => {
    let { st, source, target } = foresightBattle(1);
    ok(FS_RULES.apply(st, 0, { type: 'combat', action: 'reinforce', count: 0 }).ok, 'атака без подкреплений');
    ok(FS_RULES.apply(st, 1, { type: 'combat', action: 'reinforce', count: 2 }).ok, 'защита использует два подкрепления');
    ok(CombatTokens.of(st.combat).route('defender', 1), 'одно подкрепление деморализовано');
    const myBattle = st.units.filter(u => u.seat === 1 && u.system === source.system && u.area === source.pos);
    myBattle[0].routed = true;
    const routed = myBattle[0].id, standing = myBattle[1].id;
    const supplyBefore = st.players[1].supply.units['аспектные-воины'];
    st.combat.dice.attacker = Array(8).fill('att'); st.combat.dice.defender = ['def'];
    st.combat.step = 'damage-attacker';
    FS_RULES.advanceCombatSteps(st);
    eq([st.pending && st.pending.seat, st.pending && st.pending.question.kind], [1, 'scheme'], 'план защиты предложен до любого урона');
    st = JSON.parse(JSON.stringify(st));
    ok(FS_RULES.apply(st, 1, { type: 'effect', answer: { choice: 0 } }).ok, 'план принят');
    const q = st.pending && st.pending.question;
    eq([q && q.kind, q && q.op], ['areas', 'evacuate'], 'выбирается область, не отдельные отряды');
    ok(q.options.some(a => a.system === target.system && a.pos === target.pos), 'дружественный соседний мир предложен');
    ok(q.options.every(a => FS_RULES.area(FS_RULES.system(st, a.system), a.pos).world), 'пустоты наземным отрядам не предлагаются');
    const forbidden = { system: source.system, pos: source.pos };
    eq(FS_RULES.apply(st, 1, { type: 'effect', answer: { area: forbidden } }).ok, false, 'спорная область не цель');
    st = JSON.parse(JSON.stringify(st));
    ok(FS_RULES.apply(st, 1, { type: 'effect', answer: { area: target, units: [] } }).ok, 'цель принята после JSON');
    const moved = st.units.find(u => u.id === standing);
    eq([moved.system, moved.area, moved.routed], [target.system, target.pos, false], 'все стоящие модели ушли');
    const left = st.units.find(u => u.id === routed);
    eq([left.system, left.area, left.routed], [source.system, source.pos, true], 'деморализованная модель не перемещается эффектом');
    const token = st.units.find(u => u.id === 'reinforce-defender-0');
    ok(token && token.system === target.system && token.area === target.pos, 'стоящее подкрепление также вышло из боя');
    eq(FS_RULES.pieces(st, st.combat, 'defender').some(u => u.id === token.id), false, 'ушедшее подкрепление не остаётся целью боя');
    ok(FS_RULES.pieces(st, st.combat, 'defender').some(u => u.id === 'reinforce-defender-1'), 'деморализованное подкрепление осталось');
    st = JSON.parse(JSON.stringify(st));
    const hurt = FS_RULES.apply(st, 1, { type: 'combat', action: 'damage',
        targets: [routed, 'reinforce-defender-1'] });
    ok(hurt.ok, 'урон остальным отрядам: ' + hurt.error);
    eq(st.combat, null, 'бой завершён после нанесения урона');
    ok(!st.units.some(u => u.id === 'reinforce-defender-0'), 'подкрепление возвращено при завершении боя');
    eq(st.players[1].supply.units['аспектные-воины'], supplyBefore + 1, 'только погибшая модель возвращена в запас пластика');
});

check('Предвидение', 'отсутствие целей урона после ухода атакующего не задерживает бой', () => {
    let { st, source, target } = foresightBattle(0);
    refuseReinforce(st);
    st.combat.dice.attacker = ['att']; st.combat.dice.defender = ['att', 'att'];
    st.combat.step = 'damage-attacker';
    FS_RULES.advanceCombatSteps(st);
    eq(st.pending && st.pending.seat, 0, 'план атакующего предложен до урона');
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { choice: 0 } }).ok, 'план принят');
    st = JSON.parse(JSON.stringify(st));
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { area: target } }).ok, 'все отряды ушли');
    const remaining = st.units.filter(u => u.seat === 0 && u.system === source.system && u.area === source.pos);
    eq(remaining.length, 0, 'в бою нет войск атакующего');
    if (st.combat && st.combat.step === 'damage-defender') {
        const candidate = FS_RULES.damageCandidates(st, 'defender')[0];
        ok(FS_RULES.apply(st, 1, { type: 'combat', action: 'damage', targets: [candidate.id] }).ok, 'защитник получает свой урон');
    }
    eq(st.combat, null, 'после распределения урона бой заканчивается');
});

head('События · дополнительные проверки', ELDAR);
check('Предвидение', 'настоящий розыгрыш двух боевых карт доходит до начала нулевого урона', () => {
    let { st, target } = foresightBattle(0);
    st.combat.cards.attacker.hand = ['Прикрытие рейнджеров'];
    st.combat.cards.defender.hand = ['Ложись!'];
    refuseReinforce(st);
    ok(FS_RULES.apply(st, 0, { type: 'combat', action: 'playCard', index: 0 }).ok, 'карта атакующего выбрана');
    ok(FS_RULES.apply(st, 1, { type: 'combat', action: 'playCard', index: 0 }).ok, 'карта защитника выбрана');
    for (let i = 0; i < 20 && st.pending && st.pending.question.kind !== 'scheme'; i++) {
        const who = st.pending.answerSeat === undefined ? st.pending.seat : st.pending.answerSeat;
        const q = st.pending.question;
        const answer = q.kind === 'ability' ? { no: true } : firstOption(st, q);
        ok(FS_RULES.apply(st, who, { type: 'effect', answer }).ok, 'разрешена боевая карта');
    }
    eq([st.pending && st.pending.seat, st.pending && st.pending.question.kind], [0, 'scheme'], 'начало урона действительно предложено');
    eq([st.combat.cards.attacker.played.length, st.combat.cards.defender.played.length], [1, 1], 'обе карты уже раскрыты');
    st = JSON.parse(JSON.stringify(st));
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { choice: 0 } }).ok, 'план применён');
    eq(st.pending && st.pending.question.op, 'evacuate', 'предлагается место');
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { area: target } }).ok, 'войска ушли');
    eq(st.combat, null, 'бой разрешился после нулевого урона');
});

function foresightMovedTokens() {
    let { st, source, target } = foresightBattle(1);
    st.players[1].assets.reinforcement = 3;
    ok(FS_RULES.apply(st, 0, { type: 'combat', action: 'reinforce', count: 0 }).ok, 'атакующий без подкреплений');
    ok(FS_RULES.apply(st, 1, { type: 'combat', action: 'reinforce', count: 2 }).ok, 'защита тратит два жетона');
    const routed = st.units.find(u => u.seat === 1 && u.system === source.system && u.area === source.pos);
    routed.routed = true;
    st.combat.dice.attacker = Array(8).fill('att'); st.combat.dice.defender = ['def'];
    st.combat.step = 'damage-attacker';
    FS_RULES.advanceCombatSteps(st);
    ok(st.pending && st.pending.seat === 1 && st.pending.question.kind === 'scheme', 'начало урона');
    ok(FS_RULES.apply(st, 1, { type: 'effect', answer: { choice: 0 } }).ok, 'план принят');
    ok(FS_RULES.apply(st, 1, { type: 'effect', answer: { area: target } }).ok, 'войска и жетоны ушли');
    ok(st.combat && st.combat.step === 'damage-defender', 'урон ожидает защитника');
    return { st, source, target, routed: routed.id };
}

check('Предвидение', 'перемещённый жетон применяется ровно один раз в общих шагах', () => {
    // Synthetic follow-up effects deliberately address units outside the
    // battlefield; the token itself was moved by the real Foresight plan.
    for (const op of ['route', 'restore', 'destroy']) {
        let { st } = foresightMovedTokens();
        const id = 'reinforce-defender-0', unit = st.units.find(u => u.id === id);
        ok(unit, 'жетон представлен отрядом за пределами боя');
        if (op === 'restore') unit.routed = true;
        const supply = st.players[1].supply.units['аспектные-воины'];
        const step = { op, n: 1, who: 'me', pick: true, allBoard: true,
            ...(op === 'restore' ? { scope: 'activeAllOthersGround' } : {}) };
        FS_RULES.runEffects(st, 1, [step], { kind: 'combat', ctx: { side: 'defender' } });
        ok(pending(st)?.options.includes(id), 'перемещённый жетон предложен обычным отрядом');
        st = JSON.parse(JSON.stringify(st));
        ok(FS_RULES.apply(st, 1, { type: 'effect', answer: { units: [id] } }).ok, op + ': выбран после JSON');
        const after = st.units.find(u => u.id === id), slots = CombatTokens.of(st.combat);
        if (op === 'destroy') ok(!after, 'жетон уничтожен один раз');
        else eq(after?.routed, op === 'route', 'только состояние перемещённого отряда изменилось');
        ok(slots.moved('defender').includes(0) && !slots.alive('defender', 0), 'слот не появился в исходном бою');
        eq(st.players[1].supply.units['аспектные-воины'], supply, 'ни один пластиковый отряд не создан');
    }
});
check('Предвидение', 'уничтоженный вне боя жетон не добавляет пластик, вернувшийся снова становится целью; жетоны уходят в общий запас', () => {
    let { st, source, target, routed } = foresightMovedTokens();
    const p = st.players[1], supply = p.supply.units['аспектные-воины'];
    eq(p.assets.reinforcement, 1, 'два жетона выбыли из запаса игрока');
    const dead = st.units.find(u => u.id === 'reinforce-defender-0');
    const returning = st.units.find(u => u.id === 'reinforce-defender-1');
    ok(dead && returning, 'оба жетона представлены за пределами боя');
    FS_RULES.destroyUnit(st, dead);
    eq(p.supply.units['аспектные-воины'], supply, 'уничтожение жетона не создало пластиковый отряд');
    eq(CombatTokens.of(st.combat).alive('defender', 0), false, 'уничтоженный вдали жетон не вернулся в бой');
    FS_RULES.board(st).moveUnit(returning, source, { seat: 1 });
    ok(!st.units.some(u => u.id === returning.id), 'после возвращения нет дубликата на доске');
    ok(CombatTokens.of(st.combat).alive('defender', 1), 'исходный слот снова на поле боя');
    eq(FS_RULES.pieces(st, st.combat, 'defender').filter(u => u.id === returning.id).length, 1, 'ровно одна боевая цель');
    st = JSON.parse(JSON.stringify(st));
    ok(FS_RULES.apply(st, 1, { type: 'combat', action: 'damage', targets: [returning.id] }).ok, 'возвращённое подкрепление получает урон');
    // If the routed model survives this execution round, finish the battle by the normal round resolver.
    for (let i = 0; i < 4 && st.combat && st.combat.step !== 'retreat'; i++) FS_RULES.endCombatRound(st);
    if (st.combat && st.combat.step === 'retreat') {
        const loser = st.combat.loser, destination = FS_RULES.retreatTargets(st, loser)[0];
        const result = FS_RULES.apply(st, loser, { type: 'combat', action: 'retreat', ...(destination ? { target: destination } : {}) });
        ok(result.ok, 'завершено отступление: ' + (result.error || ''));
    }
    eq(st.combat, null, 'бой завершён');
    ok(!st.units.some(u => u.reinforcementCombat), 'все временные жетоны убраны');
    eq(st.players[1].assets.reinforcement, 1, 'потраченные жетоны возвращаются в общий запас, а не игроку');
});

check('Предвидение', 'реактивный «Критический удар» Тау не предлагается до выбора получающего урон отряда', () => {
    let st = battle({ faction: ELDAR, foeFaction: TAU,
        units: { 'призрачные-стражи': 2 }, foeUnits: { 'воины-огня': 2 },
        dice: ['def'], foeDice: ['att', 'att'], roundEnd: true });
    foresightScheme(st, 0);
    const critical = FS_DATA.events.find(c => c.faction === TAU && c.name === 'Критический удар');
    FS_RULES.keepEventScheme(st, 1, critical);
    refuseReinforce(st);
    st.combat.dice.attacker = ['def']; st.combat.dice.defender = ['att', 'att'];
    st.combat.step = 'damage-attacker';
    FS_RULES.advanceCombatSteps(st);
    eq([st.pending.seat, st.pending.question.options], [0, ['Предвидение']], 'сначала открывается только окно начала урона');
    st = JSON.parse(JSON.stringify(st));
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { no: true } }).ok, 'эльдарский план отклонён');
    eq(st.pending, null, 'Критический удар не предложен до назначения урона');
    eq(st.combat.step, 'damage-attacker', 'атакующий назначает урон');
    const victim = FS_RULES.damageCandidates(st, 'attacker')[0].id;
    ok(FS_RULES.apply(st, 0, { type: 'combat', action: 'damage', targets: [victim] }).ok, 'назначена цель');
    eq([st.pending.seat, st.pending.question.options], [1, ['Критический удар']], 'реактивный план предложен только теперь');
    st = JSON.parse(JSON.stringify(st));
    ok(FS_RULES.apply(st, 1, { type: 'effect', answer: { no: true } }).ok, 'Тау отказался от плана');
    ok(st.players[1].schemes.some(s => s.name === 'Критический удар'), 'отказанный план сохранён');
    ok(st.units.find(u => u.id === victim)?.routed, 'раненный отряд деморализован; урон не применяется повторно');
});

check('Предвидение', 'наземные отряды не проходят сквозь шторм, вражескую или пустую цепочку', () => {
    for (const blocked of [false, true]) {
        let { st, source, target } = foresightBattle(0);
        const cross = FS_RULES.areasAround(st, source.system, source.pos).find(a => a.system !== source.system
            && FS_RULES.area(FS_RULES.system(st, a.system), a.pos).world);
        ok(cross, 'есть соседний мир в другой системе');
        FS_RULES.addStructure(st, 0, 'city', cross.system, cross.pos);
        if (blocked) for (const side of ['N', 'E', 'S', 'W']) if (FS_RULES.across(st, source.system, side))
            st.storms.push({ id: 'foresight-storm-' + side, system: source.system, side, moved: false });
        refuseReinforce(st);
        st.combat.step = 'damage-attacker'; FS_RULES.advanceCombatSteps(st);
        ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { choice: 0 } }).ok, 'план принят');
        const opts = st.pending.question.options;
        ok(opts.some(a => a.system === target.system && a.pos === target.pos), 'дружественный мир той же системы доступен');
        eq(opts.some(a => a.system === cross.system && a.pos === cross.pos), !blocked, 'шторм блокирует переход между системами');
        ok(opts.every(a => FS_RULES.area(FS_RULES.system(st, a.system), a.pos).world
            && FS_RULES.control(st, 0, a.system, a.pos) === 'friendly'
            && FS_RULES.pathExists(st, 0, source.system, source.pos, a.system, a.pos, { uncontrolled: false, storms: false })),
        'только дружественные миры с законным путём');
        if (blocked) eq(FS_RULES.apply(st, 0, { type: 'effect', answer: { area: cross } }).ok, false, 'нельзя подделать цель за штормом');
    }
});

check('Предвидение', 'корабли и подкрепления уходят только в дружественную пустоту, штормы не пересекаются', () => {
    for (const blocked of [false, true]) {
        let st = battle({ faction: ELDAR, foeFaction: TAU, kind: 'space',
            units: { 'фрегаты-класса-хелебор': 2 }, foeUnits: { 'крейсеры-защитник': 2 },
            dice: ['def'], foeDice: ['def'], roundEnd: true });
        const source = { system: st.combat.system, pos: st.combat.pos };
        const destSystem = FS_RULES.neighbors(st, source.system)[0], targetSys = FS_RULES.system(st, destSystem);
        const dest = { system: destSystem, pos: targetSys.areas.find(a => !a.world).pos };
        FS_RULES.addUnit(st, 0, 'фрегаты-класса-хелебор', dest.system, dest.pos);
        FS_RULES.addStructure(st, 0, 'city', dest.system, targetSys.areas.find(a => a.world).pos);
        if (blocked) for (const side of ['N', 'E', 'S', 'W']) if (FS_RULES.across(st, source.system, side))
            st.storms.push({ id: 'foresight-void-storm-' + side, system: source.system, side, moved: false });
        foresightScheme(st, 0);
        ok(FS_RULES.apply(st, 0, { type: 'combat', action: 'reinforce', count: 1 }).ok, 'атакующий берёт подкрепление');
        ok(FS_RULES.apply(st, 1, { type: 'combat', action: 'reinforce', count: 0 }).ok, 'противник без подкреплений');
        st.combat.step = 'damage-attacker'; FS_RULES.advanceCombatSteps(st);
        eq(st.pending.question.kind, 'scheme', 'окно начала урона');
        ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { choice: 0 } }).ok, 'план принят');
        if (blocked) {
            ok(!st.pending || st.pending.question.op !== 'evacuate', 'за окружение штормами ничего не предлагается');
        } else {
            const q = st.pending.question;
            ok(q.options.some(a => a.system === dest.system && a.pos === dest.pos), 'дружественная пустота доступна');
            ok(q.options.every(a => !FS_RULES.area(FS_RULES.system(st, a.system), a.pos).world), 'кораблям не предлагают миры');
            st = JSON.parse(JSON.stringify(st));
            ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { area: dest } }).ok, 'флот ушёл после JSON');
            // A fully evacuated side can end the combat immediately; either way
            // no token becomes permanent plastic or returns to player assets.
            eq(st.players[0].assets.reinforcement, 1, 'потраченный жетон не возвращается игроку');
            if (!st.combat) ok(!st.units.some(u => u.reinforcementCombat), 'временный жетон удалён после боя');
        }
    }
});

check('Предвидение', 'далёкий дружественный мир доступен наземным силам только через свою цепочку областей', () => {
    const { st, source } = foresightBattle(0);
    const bridge = FS_RULES.areasAround(st, source.system, source.pos).find(a => a.system !== source.system
        && !FS_RULES.area(FS_RULES.system(st, a.system), a.pos).world);
    ok(bridge, 'есть пустота соседней системы');
    const dest = FS_RULES.areasAround(st, bridge.system, bridge.pos).find(a => a.system === bridge.system
        && !!FS_RULES.area(FS_RULES.system(st, a.system), a.pos).world);
    ok(dest, 'есть мир за соседней пустотой');
    FS_RULES.addStructure(st, 0, 'city', dest.system, dest.pos);
    const offered = () => FS_EFFECTS.combatEvacuationAreas(FS_RULES, st, 0, st.combat)
        .some(a => a.system === dest.system && a.pos === dest.pos);
    eq(offered(), false, 'через никем не занятую пустоту путь отсутствует');
    const ferry = FS_RULES.addUnit(st, 0, 'фрегаты-класса-хелебор', bridge.system, bridge.pos);
    eq(offered(), true, 'свой корабль делает пустоту дружественной');
    FS_RULES.destroyUnit(st, ferry);
    FS_RULES.addUnit(st, 1, 'крейсеры', bridge.system, bridge.pos);
    eq(offered(), false, 'через вражескую пустоту путь отсутствует');
});

check('Обход', 'сетевые представления скрывают лицо закрытого приказа и privateText от противника', () => {
    const { st, system } = eldarLastPlanning();
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { choice: 0 } }).ok, 'план принят');
    const pick = st.pending.question.options.findIndex(o => o.system === system && o.index === 1);
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { choice: pick } }).ok, 'выбран свой закрытый жетон');
    const owner = FS_RULES.view(st, 0), foe = FS_RULES.view(st, 1);
    const ownerStack = FS_RULES.system(owner, system).tokens, foeStack = FS_RULES.system(foe, system).tokens;
    eq(ownerStack[1].order == null, true, 'свой скрытый в стеке приказ доступен только в privateText');
    ok(/развёртыван/i.test(owner.pending.question.privateText || ''), 'владелец видит свой выбранный приказ');
    eq(foe.pending.question.privateText, undefined, 'противнику не отправляется privateText');
    eq(foeStack[1].order == null, true, 'лицо жетона не отправлено противнику');
    eq(foeStack.at(-1).order == null, true, 'закрытый верхний чужой жетон тоже скрыт');
    ok(ownerStack.at(-1).order === 'strategize', 'владелец может посмотреть свой верхний жетон');
    ok(!JSON.stringify(foe.log).includes('приказ «стратегия»'), 'публичный журнал не раскрывает поставленный приказ');
    eq(Object.keys(foe.players[0].placedOf || {}).length, 0, 'типы чужих закрытых жетонов не выдаёт счётчик');
    eq(st.pending.question.privateText.includes('развёртыван'), true, 'серверное состояние и право ответа не изменены');
});

check('Обход', 'два игрока отвечают на планы в порядке хода, включая отказ и сохранение', () => {
    let { st, system } = eldarLastPlanning();
    st.players[1].faction = ELDAR;
    FS_RULES.keepEventScheme(st, 1, FS_DATA.events.find(c => c.faction === ELDAR && c.name === 'Обход'));
    eq(st.pending.seat, 0, 'первый игрок отвечает первым');
    st = JSON.parse(JSON.stringify(st));
    ok(FS_RULES.apply(st, 0, { type: 'effect', answer: { no: true } }).ok, 'первый отказался');
    eq([st.phase, st.pending && st.pending.seat], ['planning', 1], 'фаза ждёт второго');
    ok(FS_RULES.apply(st, 1, { type: 'effect', answer: { choice: 0 } }).ok, 'второй принял');
    const q = st.pending.question, index = q.options.findIndex(o => o.system === system && o.index === 2);
    ok(index >= 0, 'предложен его жетон');
    ok(FS_RULES.apply(st, 1, { type: 'effect', answer: { choice: index } }).ok, 'жетон выбран');
    st = JSON.parse(JSON.stringify(st));
    ok(FS_RULES.apply(st, 1, { type: 'effect', answer: { choice: 0 } }).ok, 'жетон положен наверх');
    eq(st.phase, 'operations', 'после обоих ответов началась фаза действий');
    ok(st.players[0].schemes.some(s => s.name === 'Обход'), 'отказанный план сохранён');
    ok(!st.players[1].schemes.some(s => s.name === 'Обход'), 'сыгранный план сброшен');
    eq(FS_RULES.system(st, system).tokens.at(-1).seat, 1, 'сверху жетон второго игрока');
});

// ============================================================================
if (!done) {
    console.error('\n' + C.red + '  Нет проверок для выбранной фракции или фильтра.' + C.r);
    process.exit(1);
}
console.log('\n' + (failed.length
    ? C.red + '  Не прошло: ' + failed.length + ' из ' + done + C.r
    : C.grn + '  Все проверки прошли: ' + done + C.r));
for (const f of failed) console.log('   — ' + f.id + ': ' + f.what + '\n     ' + f.why);
process.exit(failed.length ? 1 : 0);
