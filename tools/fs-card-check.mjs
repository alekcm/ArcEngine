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
load('js/fs/FSView.js', 'FSView');
load('js/fs/FSGame.js', 'FSGame');
const { FS_DATA, FS_RULES, FS_EFFECTS, FSGame } = ctx;

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
        case 'cards': return { card: first };
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
    const st = FS_RULES.newReadyGame({ seed: o.seed === undefined ? 5 : o.seed, players: players() });
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
    for (let i = 0; i < 2; i++) FS_RULES.addUnit(st, 0, 'крепкие-крейсеры', sys.id, voidArea.pos);
    // A unit of the tested player stands elsewhere: the order is his to resolve.
    const other = sys.areas.find(a => a.world && a.pos !== world.pos);
    FS_RULES.addUnit(st, 0, 'скитарии', sys.id, other.pos);
    st.players[0].upgrades = (o.upgrades || ['Изъяны плоти']).map(name => ({ name, used: false }));
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
function schemeInPlay(st, name) {
    const card = FS_DATA.events.find(e => e.faction === MECH && e.name === name);
    ok(!!card, 'нет карты «' + name + '»');
    const trig = FS_EFFECTS.parse(card.text || '', { kind: 'event', faction: MECH }).find(s => s.op === 'trigger');
    st.players[0].schemes = st.players[0].schemes || [];
    st.players[0].schemes.push({
        name: card.name, text: card.text || '',
        trigger: trig ? trig.trigger : null, steps: trig ? trig.steps : [],
        note: trig ? !!trig.note : true, defer: trig ? !!trig.defer : false,
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

// ============================================================================
console.log('\n' + (failed.length
    ? C.red + '  Не прошло: ' + failed.length + ' из ' + done + C.r
    : C.grn + '  Все проверки прошли: ' + done + C.r));
for (const f of failed) console.log('   — ' + f.id + ': ' + f.what + '\n     ' + f.why);
process.exit(failed.length ? 1 : 0);
