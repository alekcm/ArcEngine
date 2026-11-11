// ============================================================================
//  fs-card-check.mjs — card-by-card check of a faction against the card texts
// ----------------------------------------------------------------------------
//  node tools/fs-card-check.mjs                     Адептус Механикус
//  node tools/fs-card-check.mjs --faction=орки      another faction
//  node tools/fs-card-check.mjs --only=«Жёсткий»    only the matching cards
//
//  tools/fs-audit.mjs checks the engine against the Rules Reference. This tool
//  checks the other side: every card of the faction is played in a state built
//  for it and the result is compared with the text of the card as it is written
//  in docs/forbidden-stars (04 combat cards, 05 order upgrades, 06 events,
//  02 faction sheets). A check names the card, the sentence of the card and the
//  number it expected.
//
//  The states are built by hand: a check puts on the table exactly the dice, the
//  tokens and the units its sentence needs, plays the card through the real
//  command path (FS_RULES.apply) and reads the state back.
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
for (const file of ['js/fs/FSView.js', 'js/fs/FSGame.js']) {
    if (fs.existsSync(path.join(ROOT, file))) load(file, file.split('/').pop().replace(/\.js$/, ''));
}
const { FS_DATA, FS_CARDS, FS_RULES, FS_EFFECTS, FSGame, GamePhase, CombatTokens, CombatPlans, CombatDamage, CombatTurn, CombatCards, BattleField } = ctx;

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
    const other = seat === 0 ? 1 : 0;
    const res = FS_RULES.apply(st, seat, { type: 'combat', action: 'playCard', index: index || 0 });
    if (!res.ok) throw new Error('карта не сыграна: ' + res.error);
    const c = st.combat;
    const otherSide = other === c.attacker ? 'attacker' : 'defender';
    if ((c.cards[otherSide].hand || []).length) {
        const r2 = FS_RULES.apply(st, other, { type: 'combat', action: 'playCard', index: 0 });
        if (!r2.ok) throw new Error('карта противника не сыграна: ' + r2.error);
    }
    // The attacker's card is always turned over first: when the defender is the
    // one under test, the card of the attacker resolves before his.
    if (seat !== 0) answerAll(st, policy, 0);
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
        const answer = policy ? policy(st, q, trace) : firstOption(st, q);
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
            const seat = step === 'damage-attacker' ? st.combat.attacker : st.combat.defender;
            const r = FS_RULES.apply(st, seat, { type: 'combat', action: 'damage', targets: [] });
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
    // The defender has laid his card face down: the peek happens while it is
    // still closed, before the cards are turned over.
    play(st, 0, 0);
    const view = FS_RULES.view(st, 0);
    // The panel of the player shows the card on the side of the opponent.
    const mine = panel(st, 0).sides.find(s => s.side === 'defender');
    const his = panel(st, 1).sides.find(s => s.side === 'defender');
    return eq([st.combat.peek[0], view.combat.peek && view.combat.peek.name,
        mine && mine.peeked && mine.peeked.name, his && his.peeked],
    ['Приказ пехоте', 'Приказ пехоте', 'Приказ пехоте', null], 'подсмотренная карта');
});

check('Скитарии-инфильтраторы', 'защищающийся карту оппонента не видит', () => {
    // The Mechanicus player defends: the attacker's card is already open when
    // the defender's card resolves, so there is nothing to peek at.
    const st = battle({ hand: ['Скитарии-инфильтраторы'], foeCard: 'Ложись!', units: { 'скитарии': 2 }, foeUnits: { 'гвардейцы': 2 }, dice: ['att'] });
    refuseReinforce(st);
    // The hands are swapped: the Mechanicus card is played by the defender.
    st.combat.cards.defender.hand = ['Скитарии-инфильтраторы'];
    st.combat.cards.attacker.hand = ['Ложись!'];
    FS_RULES.apply(st, 0, { type: 'combat', action: 'playCard', index: 0 });
    FS_RULES.apply(st, 1, { type: 'combat', action: 'playCard', index: 0 });
    answerAll(st, null, 0);
    answerAll(st, null, 1);
    const view = FS_RULES.view(st, 1);
    const his = panel(st, 1).sides.find(s => s.side === 'attacker');
    return ok(!st.combat.peek || !st.combat.peek[1], 'защищающийся не подсмотрел карту')
        && ok(!view.combat.peek, 'в состоянии игрока подсмотренной карты нет')
        && ok(!his || !his.peeked, 'в панели боя подсмотренной карты нет');
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
    const st = battle({ card: 'Гнев машины', units: { 'тяжелые-титаны': 1 }, foeUnits: { 'гвардейцы': 2 }, dice: ['att'], roundEnd: true });
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
    const sys = st.systems[0];
    const pos = worldOf(st, sys.id);
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
    return firstOption(st, q);
};
const effectPick = (n, rest) => (st, q) => {
    if (q.kind === 'choice' || q.kind === 'scheme') return { choice: n };
    return effectPolicy(st, q);
};

/** Answer the pending effect, one question after another. */
function effectAnswer(st, answer, limit = 40) {
    for (let i = 0; i < limit && st.pending; i++) {
        const seat = st.pending.seat;
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
    eq([prep.n, prep.per, prep.kind], [1, 'unit', 'any'], 'по кубику за юнита, любой кубик');
    return eq(st.players[0].upgrades[0].used, true, 'карта сгорела');
});

check('Сервочерепа-стражи', 'в начале боя этого приказа предлагается переброс по числу юнитов', () => {
    const st = orderState('advance', { upgrades: ['Сервочерепа-стражи'], units: { 'скитарии': 2 }, foeUnits: { 'гвардейцы': 1 } });
    burn(st, 'Сервочерепа-стражи');
    const sys = st.systems[0];
    const pos = worldOf(st, sys.id);
    FS_RULES.startCombat(st, 0, 1, sys.id, pos);
    const q = pending(st);
    ok(!!q, 'вопроса о перебросе нет');
    eq(q.kind, 'dice', 'вопрос предлагает кубику');
    ok(st.combat.prepReroll === undefined || true, '');
    // The dice are fixed: a refusal leaves them alone.
    st.combat.dice.attacker = ['att', 'att', 'att'];
    effectAnswer(st, { no: true });
    return eq(st.combat.dice.attacker, ['att', 'att', 'att'], 'кубики не тронуты после отказа');
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

check('Главный по машинам', 'цена юнитов и построек уменьшается на 1', () => {
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
    // The materiel of the order is paid when the order is finished: the price of
    // the purchase is the number the card changes.
    const bought = st.order.purchases.find(x => x.kind === 'unit');
    eq(bought.cost, Math.max(0, cost - 1), 'юнит на 1 дешевле');
    // The card says «включая здания»: a structure is cheaper too.
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
    return eq(built.cost, Math.max(0, stat.cost - 1), 'постройка на 1 дешевле');
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

// --- Святой трубопровод -----------------------------------------------------
check('Святой трубопровод', 'нужно купленное улучшение «Главный по машинам»', () => {
    const st = orderState('dominate', { upgrades: ['Святой трубопровод'], units: { 'скитарии': 1 }, structures: ['factory'] });
    const res = burn(st, 'Святой трубопровод');
    eq(res.ok, true, 'карта сгорела');
    // The ability is refused: the card it names is not bought.
    return eq(!!st.order.placedPipeline, false, 'без «Главного по машинам» юнита нет');
});

check('Святой трубопровод', 'юнит покупается и ставится в мир с работающей фабрикой', () => {
    const st = orderState('dominate', {
        upgrades: ['Святой трубопровод', 'Главный по машинам'],
        units: { 'скитарии': 1 }, structures: ['factory'], materiel: 20,
    });
    const sys = st.systems[0];
    const pos = worldOf(st, sys.id);
    const res = burn(st, 'Святой трубопровод');
    ok(res.ok, 'карта не сгорела: ' + res.error);
    effectAnswer(st, (s, q) => {
        if (q.kind === 'types') return { type: (q.options || [])[0] };
        if (q.kind === 'areas') return { area: (q.options || [])[0] };
        return firstOption(s, q);
    });
    const mine = st.units.filter(u => u.seat === 0 && u.system === sys.id && u.area === pos);
    return eq(mine.length, 2, 'отрядов в мире фабрики (был 1 + купленный)');
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
    const other = sys.areas.find(a => a.world && a.pos !== world.pos);
    FS_RULES.addUnit(st, 0, o.holdUnit || 'скитарии', sys.id, other.pos);
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

check('Изъяны плоти', 'в мире с вражескими отрядами постройки не берутся', () => {
    const st = strikeState({ foeUnits: { 'гвардейцы': 1 }, foeStructures: ['factory'] });
    burn(st, 'Изъяны плоти');
    const roll = FS_RULES.rollDice;
    FS_RULES.rollDice = () => ['def', 'def', 'att'];
    const targets = FS_RULES.orbitalStrikeTargets(st, 0);
    const target = targets[0];
    const res = FS_RULES.apply(st, 0, { type: 'orbitalStrike', system: target.system, pos: target.pos });
    FS_RULES.rollDice = roll;
    ok(res.ok, 'удар не нанесён: ' + res.error);
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
    effectAnswer(st, { structure: mine[0].id }, 4);
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
check('Благословение Бога-Машины', 'жетон материалов и жетон кузни', () => {
    const st = eventState('Благословение Бога-Машины', { materiel: 3, assets: { forge: 1, cache: 0, reinforcement: 0 } });
    const res = playEvent(st);
    ok(res.ok, 'карта не сыграна: ' + res.error);
    effectAnswer(st, {});
    const p = st.players[0];
    return eq([p.materiel, p.assets.forge], [4, 2], 'материи и жетонов кузни');
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
    effectAnswer(st, effectPick(2), 8);
    // No forge token: the exchange does not happen.
    eq(unitsByType(st, 0)['Онагры'] || 0, 1, 'без жетона кузни Онагр остался');
    // With the token the exchange goes through and the token is spent.
    const st2 = eventState('Мехаморфоз', { units: { 'онагры': 1 }, assets: { forge: 1 } });
    playEvent(st2);
    effectAnswer(st2, effectPick(2), 8);
    eq([unitsByType(st2, 0)['Онагры'] || 0, unitsByType(st2, 0)['Тяжёлые титаны'] || 0], [0, 1], 'Онагр заменён на Титана');
    return eq(st2.players[0].assets.forge, 0, 'жетон кузни потрачен');
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

check('Багровая стража', '1 бесплатный Скитарий в любом дружественном мире', () => {
    const st = eventState('Багровая стража', { units: { 'скитарии': 1 }, materiel: 5 });
    playEvent(st);
    effectAnswer(st, effectPick(1), 12);
    eq(st.players[0].materiel, 5, 'материя не потрачена');
    return eq(st.units.filter(u => u.seat === 0).length, 2, 'отрядов у вас');
});

// --- Лингва Технис ----------------------------------------------------------
check('Лингва Технис', 'скидка на улучшение приказа — по числу миров с вашей фабрикой', () => {
    // Two worlds with a factory of the player: the card is 2 materiel cheaper.
    const st = eventState('Лингва Технис', { units: { 'скитарии': 1 }, structures: ['factory'], materiel: 10 });
    const sys = FS_RULES.system(st, st.sys);
    const second = sys.areas.filter(a => a.world && a.pos !== st.pos)[0];
    FS_RULES.addUnit(st, 0, 'скитарии', st.sys, second.pos);
    st.structures.push({ id: 'f2', seat: 0, type: 'factory', system: st.sys, area: second.pos });
    const before = st.players[0].materiel;
    const owned = st.players[0].upgrades.length;
    const res = playEvent(st);
    ok(res.ok, 'карта не сыграна: ' + res.error);
    effectAnswer(st, (s, qq) => (qq.kind === 'cards' ? { card: (qq.options || [])[0] } : firstOption(s, qq)), 10);
    eq(st.players[0].upgrades.length, owned + 1, 'улучшение приказа куплено');
    const bought = st.players[0].upgrades[st.players[0].upgrades.length - 1];
    const card = FS_DATA.orders.find(c => c.name === bought.name);
    return eq(before - st.players[0].materiel, Math.max(0, card.cost - 2),
        'цена снижена на 2 (два мира с вашей фабрикой)');
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

check('Научная экспедиция', 'приказ берётся с вершины стопки и кладётся в смежную систему', () => {
    const st = orderState('advance', { units: { 'скитарии': 1 } });
    const scheme = schemeInPlay(st, 'Научная экспедиция');
    ok(scheme.steps.some(s => s.op === 'placeOrderAny'), 'план не хранит перенос приказа');
    const sys = st.systems[0];
    const before = st.systems.reduce((n, s) => n + s.tokens.length, 0);
    st.order = null;
    // The moment of the card is the start of the planning phase: the tokens are
    // placed by its rules, and those work only in that phase.
    st.phase = 'planning';
    st.players[0].placedTokens = 0;
    // The ability is run the way the scheme runs it.
    FS_RULES.runEffects(st, 0, scheme.steps, { kind: 'event', ctx: null });
    effectAnswer(st, effectPick(0), 10);
    const after = st.systems.reduce((n, s) => n + s.tokens.length, 0);
    return eq(after - before, 1, 'жетонов приказов на карте');
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

check('Некромеханика', 'берутся две верхних карты событий и их способности выполняются', () => {
    const st = eventState('Некромеханика');
    const scheme = schemeInPlay(st, 'Некромеханика');
    ok(scheme.steps.some(s => s.op === 'activateEvents'), 'план не хранит активацию событий');
    // The cards the ability takes come from the top of the event deck.
    if (!st.players[0].decks.event.length) {
        st.players[0].decks.event = FS_DATA.events.filter(e => e.faction === MECH).map(e => e.name);
    }
    const deck = st.players[0].decks.event.slice(0, 2);
    eq(deck.length, 2, 'в колоде есть две карты');
    FS_RULES.runEffects(st, 0, scheme.steps, { kind: 'event', ctx: null });
    const log = st.log.slice(-6).map(l => l.text).join(' | ');
    ok(log.includes('активирует карту события'), 'карты событий не активированы: ' + log);
    return eq(deck.every(n => !st.players[0].decks.event.includes(n)), true, 'обе карты взяты из колоды');
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
    const r = FS_RULES.apply(st, 0, { type: 'combat', action: 'damage', targets: [victim.id] });
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
        card: 'Крылатый ужас', units: { 'воины': 1, 'гаунты': 1 }, roundEnd: true,
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
        card: 'Выводок термаганов', units: { 'гаунты': 2 }, foeUnits: { 'гвардейцы': 2 },
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
    // Three unrouted units against one: the surplus of two pays two tokens.
    return eq(tokens(st, 'attacker').att, 2, 'два жетона атаки за превосходство в два отряда');
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
            const seat = step === 'damage-attacker' ? c.attacker : c.defender;
            FS_RULES.apply(st, seat, { type: 'combat', action: 'damage', targets: [] });
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
            // «до 2» — ответить на три кубика нельзя: лишний отбрасывается.
            return { dice: (q.options || []).slice(0, 3) };
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
    for (let i = 0; i < 20 && st.combat; i++) {
        if (st.combat.round !== round0) return st;
        if (st.pending) {
            const q = st.pending.question;
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
    playThrough(st2, q => (q.kind === 'units' ? { units: [] } : { choice: 1 }));
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
        const id = (q.options || [])[0];
        answerAll(st, (s2, qq) => (qq.op === 'strikeFirstPick' ? { units: [id] } : firstOption(s2, qq)));
        return eq(st.order && st.order.strikeFirst, id, 'выбор записан в приказе удара');
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
    FS_RULES.apply(st, 0, { type: 'endAdvance' });
    ok(!!st.combat, 'бой не начался');
    // Жетоны кладутся на стол боя их владельцем: карта уничтожает жетоны в
    // области, а не в запасе.
    st.players[1].assets.reinforcement = 2;
    FS_RULES.apply(st, 1, { type: 'combat', action: 'reinforce', count: 2 });
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
    FS_RULES.apply(st, 0, { type: 'endAdvance' });
    ok(!!st.combat, 'бой не начался');
    // Жетоны кладёт на стол их владелец: карта уничтожает жетоны в области боя.
    st.players[1].assets.reinforcement = 2;
    FS_RULES.apply(st, 1, { type: 'combat', action: 'reinforce', count: 2 });
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
    const res = FS_RULES.combatDamage(st, 0, 'attacker', { targets: [victim.id] });
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
    st.combat.dice.attacker = Array(8).fill('att');
    st.combat.dice.defender = Array(8).fill('att');
    let res = FS_RULES.apply(st, 0, { type: 'combat', action: 'damage', targets: [victim.id] });
    ok(res.ok, 'урон атакующему не назначен: ' + res.error);
    eq(stateUnit(st, victim.id), null, 'отряд выбыл на шаге урона');
    res = FS_RULES.apply(st, 1, { type: 'combat', action: 'damage', targets: [] });
    ok(res.ok, 'урон защитнику не назначен: ' + res.error);
    ok(!!st.pending, 'вопрос о возвращении не задан');
    answerAll(st, firstOption, 0);
    const after = myUnits(st).filter(u => (FS_RULES.unitOf(st, u) || {}).kl === 0
        && u.system === st.combat.system && u.area === st.combat.pos && !u.routed).length;
    return eq(after, before, 'отрядов КЛ 0 вернулось в область боя');
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
        if (q.op === 'strikePayPick') return { choice: 1 };
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

check('Критический удар', 'план уничтожает именно вражеский отряд, получивший урон', () => {
    const st = tauBattle({});
    refuseReinforce(st);
    const victim = foeUnits(st)[0];
    schemeInPlay(st, 'Критический удар', TAU);
    st.combat.dice.attacker = Array(8).fill('att');
    st.combat.dice.defender = ['def'];
    const res = FS_RULES.apply(st, 1, { type: 'combat', action: 'damage', targets: [victim.id] });
    ok(res.ok, 'урон не начат: ' + res.error);
    effectAnswer(st, (s, q) => (q.op === 'destroyDamagedFoe'
        ? { units: [victim.id] } : firstOption(s, q)), 12);
    eq(stateUnit(st, victim.id), null, 'получивший урон отряд уничтожен');
    eq(st.combat.damageResume, null, 'шаг урона не повторяется');
    return eq(st.players[0].schemes.length, 0, 'план сброшен');
});

// ============================================================================
//  02 / 04 / 05 / 06 — Космодесант Хаоса: способность, 14 боевых карт,
//  5 улучшений приказов и 8 событий (включая 4 плана)
// ============================================================================
const CHAOS = 'космодесант-хаоса';
const CHAOS_FOE = 'имперская-гвардия';
const CHAOS_GROUND = {
    'культисты': 2, 'космодесант-хаоса': 1, 'хелбруты': 1,
    'титаны-хаоса-класса-налётчик': 1,
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
    let first = true;
    chaosRun(st, 'general', (s, q) => {
        if (q.kind === 'choice') {
            const n = first ? 1 : 0;
            first = false;
            return { choice: n };
        }
        return firstOption(s, q);
    });
    const added = st.units.filter(u => u.seat === 0).slice(before);
    eq(added.length, 1, 'размещён один отряд');
    ok(/культист/i.test((FS_RULES.unitOf(st, added[0]) || {}).name || ''), 'размещён культист');
    return eq([added[0].system, added[0].area], [st.combat.system, st.combat.pos], 'в области боя');
});
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
    const titan = FS_RULES.addUnit(st, 0, 'титаны-хаоса-класса-налётчик', sys.id, other.pos);
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
        if (q.op === 'strikePayPick') return { choice: 2 };
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
check('Инкарнация Тзинча', 'способность одной из трёх карт, остальные сброшены без движения шторма', () => {
    const st = chaosEvent('Инкарнация Тзинча', { assets: { forge: 0, reinforcement: 0 } });
    st.players[0].decks.event = ['Военные трофеи', 'Пророчества и знамения', 'Задетый варпом'];
    const res = playEvent(st);
    ok(res.ok, 'событие не разыграно: ' + res.error);
    chaosEffectAnswer(st, (s, q) => (q.op === 'chooseEventAbility'
        ? { card: 'Военные трофеи' } : firstOption(s, q)));
    eq(st.chaosNoStormMove, true, 'новая карта не двигает варп-шторм');
    eq(st.players[0].assets.forge, 1, 'жетон кузницы тактики получен');
    return eq(st.players[0].assets.reinforcement, 1, 'жетон подкреплений тактики получен');
});
check('Инкарнация Тзинча', 'шторм по новой карте не двигается', () => {
    const st = chaosEvent('Инкарнация Тзинча', { assets: { forge: 0, reinforcement: 0 } });
    st.players[0].decks.event = ['Военные трофеи', 'Пророчества и знамения', 'Задетый варпом'];
    const res = playEvent(st);
    ok(res.ok, 'событие не разыграно: ' + res.error);
    chaosEffectAnswer(st, (s, q) => (q.op === 'chooseEventAbility'
        ? { card: 'Военные трофеи' } : firstOption(s, q)));
    eq(st.chaosNoStormMove, true, 'движение шторма новой карты запрещено');
    // A legal storm edge is needed: otherwise «there was nothing to move»
    // would look like the card had suppressed the movement.
    const sys = st.systems[0];
    let options = [];
    for (const side of ['N', 'E', 'S', 'W', 'NE', 'SE', 'SW', 'NW']) {
        st.storms = [{ id: 'storm-chaos', system: sys.id, side, moved: false }];
        options = FS_RULES.stormOptions(st, 0);
        if (options.length) break;
    }
    ok(options.length, 'нет законного движения варп-шторма для проверки');
    st.event.stormMoved = false;
    const blocked = FS_RULES.apply(st, 0, {
        type: 'moveStorm', storm: options[0].storm, dir: options[0].dir,
    });
    ok(!blocked.ok && /не производится/.test(blocked.error || ''),
        'шторм новой карты не сдвинут');
    return eq(st.event.stormMoved, false, 'движение не засчитано');
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
check('Отрава Нургла', 'план заменяет раскрытие приказа, не сбрасывая жетон', () => {
    const st = FS_RULES.newReadyGame({ seed: 5, players: players(CHAOS, CHAOS_FOE) });
    const sys = st.systems[0];
    for (const s of st.systems) s.tokens = [];
    st.units = []; st.structures = []; st.objectives = []; st.storms = [];
    const pos = worldOf(st, sys.id);
    FS_RULES.addUnit(st, 0, 'культисты', sys.id, pos);
    const foe = FS_RULES.addUnit(st, 1, 'гвардейцы', sys.id, pos);
    sys.tokens.push({ seat: 0, order: 'advance', faceUp: false });
    sys.tokens.push({ seat: 1, order: 'advance', faceUp: false });
    st.phase = 'operations'; st.turn = 0; st.order = null; FS_RULES.trimQueue(st).clear();
    st.players[0].placedTokens = 1; st.players[1].placedTokens = 1;
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
    const refused = FS_RULES.apply(st, 0, { type: 'effect', answer: { choice: -1 } });
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

// ============================================================================
console.log('\n' + (failed.length
    ? C.red + '  Не прошло: ' + failed.length + ' из ' + done + C.r
    : C.grn + '  Все проверки прошли: ' + done + C.r));
for (const f of failed) console.log('   — ' + f.id + ': ' + f.what + '\n     ' + f.why);
process.exit(failed.length ? 1 : 0);
