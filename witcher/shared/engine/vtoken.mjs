// «По следу монстра» — «Уязвимости и особые атаки»: vulnerability tokens (Книги правил/По следу
// монстра.md pp. 6–7; effects — Монстры/Уязвимости.md, encoded in data/vuln-data.mjs VULNS).
//   * 18 tokens: 3 terrains × numbers I–VI. Per monster on the board 1 face-down token lies in a
//     location of its terrain (a random location token is revealed; occupied → another; none left →
//     the player to the right of the active player picks any location of that terrain).
//   * Moving there: the player takes it face up and a new one is placed. All 6 with players → none.
//   * In a fight with the monster of that terrain every token gives vulnerability N of this monster
//     (optional, the token stays). The monster defeated or chased: all its tokens are discarded,
//     the 6 reshuffled, the new monster gets a token.
import { STEPS, push, ask } from './flow.mjs';
import { CARDS, MONSTER, LOC, log, fx, removeFrom, shuffle, randInt, d6, drawCards, potionOf, skillVal, maxShield, rowOf, clearRowCard } from './util.mjs';
import { TERRAINS, TERRAIN_NAME, SKILLS, SKILL_NAME, skillName, isMage } from '../data/rules-data.mjs';
import { VULNS, BIG, ROMAN, vulnWindow, vulnText, isSpecial } from '../data/vuln-data.mjs';
import { bombOf } from '../data/bombs-data.mjs';
import { F, fp, alive, gainShield, gainBarrier, loseShield } from './fight.mjs';
import { vulnOn } from './vuln.mjs';
import { refillRow } from './turn.mjs';

const isColor = (c, col) => c.color === col || !!c.any;
const COLOR_ACC = { blue: 'синюю', red: 'красную', green: 'зелёную', purple: 'фиолетовую', yellow: 'жёлтую' };
const terrainLow = (t) => TERRAIN_NAME[t].toLowerCase();
const cardScore = (id) => { const c = CARDS[id]; return (c.fx.dmg || 0) * 2 + (c.fx.shield || 0) + (c.fx.draw || 0) + c.links.length; };
const weakest = (ids) => ids.slice().sort((a, b) => cardScore(a) - cardScore(b))[0];
const strongest = (ids) => ids.slice().sort((a, b) => cardScore(b) - cardScore(a))[0];
const names = (ids) => ids.map(id => '«' + CARDS[id].name + '»').join(', ');

// ---------------------------------------------------------------------------------------------
// Tokens on the board
// ---------------------------------------------------------------------------------------------
/** Lazily creates the token piles (new games and older saves alike); false when the part is off. */
export function ensureVulnState(state) {
    if (!vulnOn(state)) return false;
    if (!state.vulnPiles) {
        state.vulnPiles = {};
        for (const t of TERRAINS) state.vulnPiles[t] = shuffle(state, [1, 2, 3, 4, 5, 6]);
        state.vulnBoard = [];
    }
    for (const p of state.players) if (!p.vulns) p.vulns = [];
    return true;
}
STEPS.vtPlace = (state, step) => { placeVuln(state, step.terrain); };
function placeVuln(state, terrain) {
    if (!ensureVulnState(state)) return;
    const slot = state.slots.find(s => s.terrain === terrain && s.mon);
    if (!slot || !BIG[slot.mon]) return;
    if (state.vulnBoard.some(x => x.terrain === terrain)) return;
    if (!state.vulnPiles[terrain].length) { log(state, `Все жетоны уязвимостей (${terrainLow(terrain)}) у игроков — новый не размещается`); return; }
    const busy = new Set(state.players.map(p => p.loc));
    // Reveal random location tokens of this terrain until one shows a location without players.
    const loc = shuffle(state, state.locPiles[terrain].slice()).find(l => !busy.has(l));
    if (loc != null) { putVuln(state, terrain, loc); return; }
    // No location token fits: the player to the right of the active player picks the location.
    const all = Object.values(LOC).filter(l => l.n >= 1 && l.n <= 18 && l.terrain === terrain).map(l => l.n);
    const free = all.filter(l => !busy.has(l));
    const cand = free.length ? free : all;
    const n = state.players.length;
    const nb = state.players[((state.turn ? state.turn.seat : 0) - 1 + n) % n];
    if (nb.bot || nb.away || cand.length === 1) { putVuln(state, terrain, cand[randInt(state, cand.length)]); return; }
    ask(state, {
        seat: nb.seat, kind: 'choice', title: 'Жетон уязвимости',
        text: `Жетоны локаций (${terrainLow(terrain)}) не подходят: выберите любую локацию этого типа местности для нового жетона уязвимости.`,
        options: cand.map(l => ({ id: String(l), label: LOC[l].name })), op: 'vtPlaceAt', args: { terrain },
    });
}
STEPS.vtPlaceAt = (state, step) => { if (state.vulnBoard.some(x => x.terrain === step.terrain)) return; putVuln(state, step.terrain, Number(step.choice)); };
function putVuln(state, terrain, loc) {
    const n = state.vulnPiles[terrain].pop();
    state.vulnBoard.push({ terrain, loc, n });
    log(state, `Жетон уязвимости (${terrainLow(terrain)}) лежит в локации ${LOC[loc].name}`);
    fx(state, { k: 'vulnPlaced', loc, terrain });
}
/** Arriving at a location: take every token there face up, then a new one is placed. */
export function vulnPickup(state, p) {
    if (!ensureVulnState(state)) return;
    for (const tok of state.vulnBoard.filter(x => x.loc === p.loc)) {
        removeFrom(state.vulnBoard, tok);
        p.vulns.push({ terrain: tok.terrain, n: tok.n });
        const slot = state.slots.find(s => s.terrain === tok.terrain && s.mon);
        log(state, `${p.name} берёт жетон уязвимости ${ROMAN[tok.n - 1]} (${terrainLow(tok.terrain)})${slot && BIG[slot.mon] ? `: ${MONSTER[slot.mon].name} — ${vulnText(slot.mon, tok.n)}` : ''}`, { kind: 'trophy' });
        fx(state, { k: 'vulnTaken', seat: p.seat, terrain: tok.terrain, n: tok.n });
        push(state, { op: 'vtPlace', terrain: tok.terrain });
    }
}
/** The monster of this terrain defeated or chased: every token of the terrain is discarded, the 6
 *  are reshuffled into a new pile (the new monster's token is placed by spawnMonster). */
export function vulnReset(state, terrain) {
    if (!ensureVulnState(state)) return;
    let had = 0;
    for (const p of state.players) { const before = p.vulns.length; p.vulns = p.vulns.filter(x => x.terrain !== terrain); had += before - p.vulns.length; }
    state.vulnBoard = state.vulnBoard.filter(x => x.terrain !== terrain);
    state.vulnPiles[terrain] = shuffle(state, [1, 2, 3, 4, 5, 6]);
    log(state, `Жетоны уязвимостей (${terrainLow(terrain)}) сброшены${had ? ` (${had} у игроков)` : ''} и перемешаны`);
}
/** «…и сбросьте этот жетон уязвимости»: out of play until the terrain's tokens are reshuffled. */
function discardToken(state, p, n) {
    const f = state.fight;
    const i = p.vulns.findIndex(x => x.terrain === f.terrain && x.n === n);
    if (i >= 0) p.vulns.splice(i, 1);
    log(state, `${p.name} сбрасывает жетон уязвимости ${ROMAN[n - 1]}`);
}

// ---------------------------------------------------------------------------------------------
// In the fight
// ---------------------------------------------------------------------------------------------
const say = (state, n, extra) => {
    const f = state.fight;
    log(state, `Уязвимость ${ROMAN[n - 1]}: ${extra || vulnText(f.mon, n)}`, { kind: 'fight' });
    fx(state, { k: 'vuln', n });
};
/** Operations of the given window from the player's tokens of this monster. */
function opsOf(state, w) {
    const f = state.fight;
    if (!f || !f.vt) return [];
    const out = [];
    for (const n of f.vt.ns) for (const o of VULNS[f.mon][n - 1]) if (vulnWindow(o) === w) out.push({ n, o });
    return out;
}
const vtSteps = (state, w) => opsOf(state, w).map(({ n, o }) => F('vtOp', { n, o }));

/** Fight start (before «перед формированием запасов жизней»): whole-fight effects. */
STEPS.vtStart = (state) => {
    const f = state.fight, p = fp(state);
    if (!f.vuln || !ensureVulnState(state)) return;
    const ns = [...new Set(p.vulns.filter(x => x.terrain === f.terrain).map(x => x.n))].sort((a, b) => a - b);
    f.vt = { ns, ign: [], life: 0, gold: 0, perColor: [], comboSize: [], drawPlus: 0, drawPerYellow: 0, dmgLess: 0, capUsed: 0, acts: [] };
    if (!ns.length) return;
    log(state, `${p.name}: жетоны уязвимостей этого монстра — ${ns.map(n => ROMAN[n - 1]).join(', ')}`, { kind: 'fight' });
    const vt = f.vt;
    for (const { n, o } of opsOf(state, 'fight')) {
        switch (o.k) {
            case 'first': vt.first = n; break;
            case 'life': vt.life += o.n; say(state, n); break;
            case 'lifeTrophy': {
                const other = (p.trophies || []).some(t => t.kind === 'witcher' && t.seat !== p.seat && t.id !== p.school);
                const k = state.solo ? 1 : other ? 3 : 0;
                if (k) { vt.life += k; say(state, n, `значение жизни монстра снижено на ${k}`); }
                break;
            }
            case 'noAbility': f.noAbility = true; say(state, n, 'особая способность монстра игнорируется всю битву'); break;
            case 'ignSp': { const i = BIG[f.mon].attacks.findIndex(a => a.name === o.name); if (i >= 0) { vt.ign.push(i + 1); say(state, n, `особая атака «${o.name}» игнорируется всю битву`); } break; }
            case 'ignDisc': vt.ignDisc = n; break;
            case 'goldWin': vt.gold += o.n; break;
            case 'cheapWin': vt.cheap = n; break;
            case 'chaseWin': vt.chaseWin = n; break;
            case 'elixirTop': vt.elixirTop = n; break;
            case 'perColor': vt.perColor.push(o.color); break;
            case 'comboSize': vt.comboSize.push(o); break;
            case 'drawPlus': vt.drawPlus += o.n; break;
            case 'drawPerYellow': vt.drawPerYellow += o.n; break;
            case 'addCard': vt.addCard = { ...o, n }; break;
            case 'returnOne': vt.returnOne = n; break;
            case 'redRepeat': vt.redRepeat = n; break;
            case 'dmgLess': vt.dmgLess += o.n; break;
            case 'ignFx': vt.ignFx = n; break;
            case 'chooseType': vt.choose = { ...o, n }; break;
            // Кащей I / V: separate effects for mages and witchers (Доп монстра.md p. 2).
            case 'kVuln1': if (isMage(p)) vt.acts.push({ n, k: 'kDie' }); else vt.kYellow = n; break;
            case 'kVuln5': if (isMage(p)) vt.acts.push({ n, k: 'payShield', cost: 1, dmg: 1 }); else vt.kOne = n; break;
            case 'payShield': vt.acts.push({ n, k: 'payShield', cost: o.n, dmg: o.dmg }); break;
        }
    }
};
STEPS.vtPre = (state) => { if (alive(state)) push(state, ...vtSteps(state, 'pre')); };
STEPS.vtPost = (state) => { if (alive(state)) push(state, ...vtSteps(state, 'post')); };
/** The witcher's first fight turn (from witcherTurn, before the player acts). */
export function vtFirstWitcherTurn(state) {
    const f = state.fight;
    if (!f.vt || !f.vt.ns.length) return [];
    if (f.vt.addCard) { f.cur.blizzard = true; f.cur.freeRule = f.vt.addCard; say(state, f.vt.addCard.n); }
    return vtSteps(state, 'w1');
}
/** Before the monster's first turn (look at its top cards, pay to ignore effects). */
export function vtBeforeMonster(state) {
    const f = state.fight;
    if (!f.vt || f.vt.m1done || !f.vt.ns.length) return [];
    f.vt.m1done = true;
    return opsOf(state, 'm1').filter(({ o }) => o.k !== 'elixirShield').map(({ n, o }) => F('vtOp', { n, o }));
}
/** End of the monster's first turn. */
export function vtAfterMonster(state) {
    const f = state.fight;
    if (!f.vt || f.vt.m1end || f.mTurns !== 1 || !f.vt.ns.length) return [];
    f.vt.m1end = true;
    return opsOf(state, 'm1').filter(({ o }) => o.k === 'elixirShield').map(({ n, o }) => F('vtOp', { n, o }));
}
/** The monster's first fight turn: is this vulnerability in force now? */
export function vtM1(f, key) {
    if (!f || !f.vt || f.turn !== 'monster' || f.mTurns !== 1) return 0;
    if (key === 'ignFx') return f.vt.ignFx || f.vt.ignFx1 || 0;
    if (key === 'choose') return f.vt.choose && (!f.vt.choose.ifMonsterFirst || f.wTurns === 0) && !f.vt.chooseUsed ? f.vt.choose.n : 0;
    return f.vt[key] || 0;
}
/** The witcher's first fight turn: bonus damage of the combo (perColor, comboSize) for comboTotals. */
export function vtComboBonus(f, ids) {
    if (!f || !f.vt || f.turn !== 'witcher' || f.wTurns !== 1 || !ids.length) return 0;
    let d = 0;
    for (const col of f.vt.perColor) d += ids.filter(id => isColor(CARDS[id], col)).length;
    for (const cs of f.vt.comboSize) d += ids.length === 2 ? cs.two : ids.length > 2 ? cs.more : 0;
    return d;
}
/** Extra cards at the end of the first fight turn. */
export function vtDrawBonus(state, ids) {
    const f = state.fight;
    if (!f.vt || f.wTurns !== 1) return 0;
    let n = f.vt.drawPlus;
    const y = ids.filter(id => isColor(CARDS[id], 'yellow')).length;
    n += y * f.vt.drawPerYellow;
    if (n) log(state, `Уязвимость: в конце первого хода битвы +${n} карт(ы)`);
    return n;
}
/** Life pool size after the vulnerabilities (at least 1 card). */
export function vtLife(state, life) {
    const f = state.fight;
    if (!f.vt || !f.vt.life) return life;
    const n = Math.max(1, life - f.vt.life);
    log(state, `Уязвимости: значение жизни монстра ${life} → ${n}`);
    return n;
}
/** A discard ability triggers: the «ignore the first time (and the rest of that turn)» token. */
export function vtIgnoreDiscard(state) {
    const f = state.fight, p = fp(state);
    if (!f.vt || !f.vt.ignDisc) return false;
    const key = f.turn + (f.turn === 'witcher' ? f.wTurns : f.mTurns);
    if (f.vt.ignDiscKey === key) { log(state, 'Уязвимость: способность сброса снова игнорируется в этом ходу'); return true; }
    if (f.vt.ignDiscKey) return false;
    f.vt.ignDiscKey = key;
    say(state, f.vt.ignDisc, `способность сброса «${BIG[f.mon].discard.name}» игнорируется (до конца хода)`);
    discardToken(state, p, f.vt.ignDisc);
    return true;
}
/** Special attack N ignored for the whole fight? */
export const vtIgnoredSpecial = (f, n) => !!(f && f.vt && f.vt.ign.includes(n));

// ---- consequences ----------------------------------------------------------------------------
STEPS.vtCheapAsk = (state, step) => {
    const p = state.players[step.seat];
    const ids = rowOf(state, p).filter(id => id && CARDS[id].cost === 1 && !CARDS[id].burn);
    if (!ids.length) { log(state, 'Уязвимость: в ряду нет карт со стоимостью 1'); return; }
    if (p.bot || ids.length === 1) { push(state, { op: 'vtCheapDo', seat: p.seat, ids: [strongest(ids)] }); return; }
    ask(state, { seat: p.seat, kind: 'cards', from: 'row', ids, min: 1, max: 1, title: 'Уязвимость', text: 'Победив монстра: возьмите 1 карту со стоимостью 1 из ряда и положите её в свой сброс.', op: 'vtCheapDo', args: { seat: p.seat } });
};
STEPS.vtCheapDo = (state, step) => {
    const p = state.players[step.seat];
    const id = step.ids && step.ids[0];
    if (!rowOf(state, p).includes(id)) return;
    clearRowCard(state, id); p.discard.push(id); refillRow(state);
    log(state, `${p.name}: уязвимость — «${CARDS[id].name}» из ряда в сброс`);
    fx(state, { k: 'gain', seat: p.seat, id, to: 'discard' });
};

// ---- the operations ----------------------------------------------------------------------------
const askCards = (state, p, n, o, stage, ids, min, max, text, extra = {}) => ask(state, {
    seat: p.seat, kind: 'cards', from: extra.from || 'hand', ui: extra.ui, ids, min, max, title: `Уязвимость ${ROMAN[n - 1]}`, text, op: 'vtDo', args: { fight: 1, n, o, stage, ...(extra.args || {}) }, ordered: extra.ordered, vt: stage,
});
const askYes = (state, p, n, o, stage, text, yes, extraOpts = []) => ask(state, {
    seat: p.seat, kind: 'choice', title: `Уязвимость ${ROMAN[n - 1]}`, text, options: [{ id: 'yes', label: yes }, ...extraOpts, { id: 'no', label: 'Не использовать' }], op: 'vtDo', args: { fight: 1, n, o, stage },
});
const hasName = (id, list) => list.some(s => CARDS[id].name.includes(s));
const matchBombs = (p, o) => (p.bombs || []).filter(b => !o.names || o.names.includes(bombOf(b).name));
function payEffect(state, p, n, o) {
    if (o.life) { state.fight.vt.life += o.life; log(state, `Уязвимость ${ROMAN[n - 1]}: значение жизни монстра −${o.life}`); }
    if (o.dmg) push(state, F('dealDamage', { n: o.dmg, src: `уязвимость ${ROMAN[n - 1]}` }));
    if (o.draw) { const g = drawCards(state, p, o.draw); log(state, `${p.name}: уязвимость ${ROMAN[n - 1]} — +${g} карт(ы)`); }
}
function discardElixirs(state, p, ids) {
    for (const id of ids) { removeFrom(p.elixirs, id); state.elixirDiscard.push(id); }
    if (ids.length) log(state, `${p.name} сбрасывает эликсир(ы): ${ids.map(id => potionOf(id).name).join(', ')}`);
}
function discardBomb(state, p, id) {
    removeFrom(p.bombs, id);
    if (!state.bombDiscard) state.bombDiscard = [];
    state.bombDiscard.push(id);
    log(state, `${p.name} сбрасывает бомбу «${bombOf(id).name}»`);
}
/** Hand (and optionally deck) cards → discard. */
function payCards(state, p, ids) {
    let fromDeck = false;
    for (const id of ids) {
        if (removeFrom(p.hand, id)) p.discard.push(id);
        else if (removeFrom(p.deck, id)) { p.discard.push(id); fromDeck = true; }
    }
    if (fromDeck) shuffle(state, p.deck);
    if (ids.length) log(state, `${p.name} сбрасывает ${names(ids)}${fromDeck ? ' (колода перемешана)' : ''}`);
}

STEPS.vtOp = (state, step) => {
    if (!alive(state)) return;
    const f = state.fight, p = fp(state);
    const { n, o } = step;
    const T = vulnText(f.mon, n);
    const bot = p.bot || p.away;
    switch (o.k) {
        // ---- before the life pools
        case 'trackElixir':
            if (f.track) { say(state, n, 'есть жетон следа — +1 эликсир'); push(state, { op: 'gainElixir', seat: p.seat, n: 1, why: 'уязвимость', fight: 1 }); }
            return;
        case 'gold': p.gold += o.n; say(state, n, `+${o.n} золото`); fx(state, { k: 'gold', seat: p.seat, n: o.n }); return;
        case 'elixir': say(state, n, `+${o.n} эликсир(а)`); push(state, { op: 'gainElixir', seat: p.seat, n: o.n, why: 'уязвимость', fight: 1 }); return;
        case 'shield': { const b = p.shield; p.shield += o.n; say(state, n, `щит ${b} → ${p.shield} (может превысить максимум)`); return; }
        case 'shieldMax': { const m = maxShield(state, p); if (p.shield < m) { const b = p.shield; p.shield = m; say(state, n, `щит ${b} → ${m}`); } return; }
        case 'fetch': {
            const ids = [...p.deck, ...p.discard].filter(id => isColor(CARDS[id], o.color));
            if (!ids.length) { say(state, n, `в колоде и сбросе нет ${COLOR_ACC[o.color].replace(/ую$/, 'ой')} карты`); return; }
            if (bot || ids.length === 1) { push(state, F('vtDo', { n, o, stage: 'fetch', ids: [strongest(ids)] })); return; }
            askCards(state, p, n, o, 'fetch', ids, 1, 1, `${T} Выберите карту (из колоды или сброса).`, { from: 'deck' });
            return;
        }
        case 'elixirPick': {
            const top = state.elixirDeck.slice(0, 3);
            if (!top.length) return;
            if (bot || top.length === 1) { push(state, F('vtDo', { n, o, stage: 'elixirPick', ids: [top[0]] })); return; }
            askCards(state, p, n, o, 'elixirPick', top, 1, 1, `${T}`, { from: 'elixirs' });
            return;
        }
        case 'payGold':
            if (p.gold < o.n) return;
            if (bot) { push(state, F('vtDo', { n, o, stage: 'payGold', choice: 'yes' })); return; }
            askYes(state, p, n, o, 'payGold', `${T} (у вас ${p.gold} золота)`, `Сбросить ${o.n} золото: жизнь монстра −${o.life}`);
            return;
        case 'payName': case 'payColor': {
            const pool = o.deck ? [...p.hand, ...p.deck] : p.hand;
            const ids = pool.filter(id => o.k === 'payName' ? hasName(id, o.names) : isColor(CARDS[id], o.color));
            if (!ids.length) { say(state, n, `нет подходящей карты ${o.deck ? 'в руке и колоде' : 'в руке'} — не используется`); return; }
            if (bot) { push(state, F('vtDo', { n, o, stage: 'pay', ids: [weakest(ids)] })); return; }
            askCards(state, p, n, o, 'pay', ids, 0, 1, `${T} Выберите карту, чтобы сбросить её, или пропустите.`, { from: o.deck ? 'deck' : 'hand', ui: o.deck ? undefined : 'hand' });
            return;
        }
        case 'redraw': {
            const max = Math.min(p.hand.length, p.deck.length);
            if (!max || bot) return;
            askCards(state, p, n, o, 'redraw', p.hand.slice(), 0, max, `${T} Выберите карты для сброса (столько же возьмёте из колоды) или пропустите.`, { ui: 'hand' });
            return;
        }
        case 'tutor':
            if (!p.hand.length || bot || !(p.deck.length || (o.discard && p.discard.length))) return;
            askCards(state, p, n, o, 'tutor1', p.hand.slice(), 0, 1, `${T} Выберите карту руки для сброса или пропустите.`, { ui: 'hand' });
            return;
        case 'rowSwap':
            if (!p.hand.length || bot) return;
            askCards(state, p, n, o, 'row1', p.hand.slice(), 0, 1, `${T} Выберите карту руки, которую уберёте из игры, или пропустите.`, { ui: 'hand' });
            return;
        case 'skill': {
            let cand = o.which === 'spec' ? ['spec'] : (() => { const min = Math.min(...SKILLS.map(s => p.skills[s])); return SKILLS.filter(s => p.skills[s] === min); })();
            cand = cand.filter(s => p.skills[s] < 5);
            if (!cand.length) return;
            if (bot) { push(state, F('vtDo', { n, o, stage: 'skill', choice: cand[0] })); return; }
            ask(state, {
                seat: p.seat, kind: 'choice', title: `Уязвимость ${ROMAN[n - 1]}`, text: `${T} Жетон после этого сбрасывается.`,
                options: [...cand.map(s => ({ id: s, label: `Навык «${skillName(p, s)}» ${p.skills[s]} → ${p.skills[s] + 1}` })), { id: 'no', label: 'Не использовать (жетон остаётся)' }], op: 'vtDo', args: { fight: 1, n, o, stage: 'skill' },
            });
            return;
        }
        case 'elixirName': {
            // Кащей II: the named elixir from the deck; if it is not there — any elixir of the deck.
            const named = state.elixirDeck.find(id => potionOf(id).name === o.name);
            if (named) { push(state, F('vtDo', { n, o, stage: 'elixirName', ids: [named] })); return; }
            if (!state.elixirDeck.length) { say(state, n, 'колода эликсиров пуста'); return; }
            const kinds = [...new Map(state.elixirDeck.map(id => [potionOf(id).name, id])).values()];
            if (bot || kinds.length === 1) { push(state, F('vtDo', { n, o, stage: 'elixirName', ids: [kinds[0]] })); return; }
            askCards(state, p, n, o, 'elixirName', kinds, 1, 1, `${T} «${o.name}» в колоде нет — выберите другой эликсир.`, { from: 'elixirs' });
            return;
        }
        case 'bbDef': case 'bbLife': {
            const ids = p.elixirs.filter(id => potionOf(id).name === 'Чёрная кровь');
            if (!ids.length || (o.k === 'bbDef' && p.skills.defense >= 5)) return;
            if (bot) { push(state, F('vtDo', { n, o, stage: 'bb', choice: 'yes', id: ids[0] })); return; }
            askYes(state, p, n, o, 'bb', T, o.k === 'bbDef' ? 'Сбросить «Чёрную кровь»: навык защиты +1' : `Сбросить «Чёрную кровь»: жизнь монстра −${o.n}`);
            return;
        }
        // ---- after the life pools
        case 'dropSpecial': {
            const sp = f.life.filter(isSpecial);
            if (!sp.length) { say(state, n, 'в запасе жизни монстра нет особых карт'); return; }
            const id = sp[randInt(state, sp.length)];
            removeFrom(f.life, id); state.attackDeck.push(id);
            let extra = '';
            if (o.swap && state.atkBox && state.atkBox.length) {
                const add = state.atkBox.splice(randInt(state, state.atkBox.length), 1)[0];
                f.life.splice(randInt(state, f.life.length + 1), 0, add);
                if (Array.isArray(state.atkSet)) state.atkSet.push(add);
                f.vt.swapBack = true;
                extra = '; вместо неё — обычная карта из коробки';
            }
            say(state, n, `из запаса жизни монстра убрана случайная особая карта${extra}`);
            return;
        }
        case 'draw': {
            const k = o.n + (f.track ? o.track : 0);
            const g = drawCards(state, p, k);
            say(state, n, `+${g} карт(ы)${o.track && f.track ? ' (есть жетон следа)' : ''}`);
            return;
        }
        case 'look3': case 'look3take': {
            const top = p.deck.slice(0, 3);
            if (!top.length) return;
            if (o.k === 'look3take') {
                if (bot || top.length === 1) { push(state, F('vtDo', { n, o, stage: 'take', ids: [strongest(top)] })); return; }
                askCards(state, p, n, o, 'take', top, 1, 1, `${T} Выберите карту, которую возьмёте в руку.`, { from: 'deck' });
                return;
            }
            if (bot || top.length === 1) return;
            askCards(state, p, n, o, 'order', top, top.length, top.length, `${T} Щёлкайте по порядку: первая выбранная карта окажется на верху колоды.`, { from: 'deck', ordered: true });
            return;
        }
        case 'kLook': {
            // Кащей IV: a mage draws 2; a witcher looks at the top 4 and puts them back in any order.
            if (isMage(p)) { const g = drawCards(state, p, 2); say(state, n, `+${g} карт(ы)`); return; }
            const top = p.deck.slice(0, 4);
            if (top.length < 2 || bot) { if (top.length) say(state, n, `${p.name} смотрит верхние карты колоды`); return; }
            askCards(state, p, n, o, 'order', top, top.length, top.length, `${T} Щёлкайте по порядку: первая выбранная карта окажется на верху колоды.`, { from: 'deck', ordered: true });
            return;
        }
        case 'payElixir': {
            const canE = p.elixirs.length >= o.n;
            const bombs = o.bomb ? matchBombs(p, o.bomb) : [];
            if (!canE && !bombs.length) { say(state, n, `нужно ${o.n} эликсир(а)${o.bomb ? ' или бомба' : ''} — не используется`); return; }
            const eff = (x) => x.dmg ? `${x.dmg} урона` : `+${x.draw} карт(ы)`;
            if (bot) { push(state, F('vtDo', { n, o, stage: 'payE', choice: canE ? 'yes' : 'bomb' })); return; }
            askYes(state, p, n, o, 'payE', T, canE ? `Сбросить ${o.n} эликсир(а): ${eff(o)}` : '—', bombs.length ? [{ id: 'bomb', label: `Сбросить бомбу: ${eff(o.bomb)}` }] : []);
            if (!canE) state.prompt.options[0].disabled = true;
            return;
        }
        case 'elixirsDraw': case 'elixirShield': {
            if (!p.elixirs.length || bot) return;
            const max = o.k === 'elixirsDraw' ? Math.min(p.elixirs.length, Math.max(0, 7 - p.hand.length), p.deck.length) : p.elixirs.length;
            if (!max) return;
            askCards(state, p, n, o, o.k, p.elixirs.slice(), 0, max, `${T} Выберите эликсиры или пропустите.`, { from: 'elixirs' });
            return;
        }
        case 'cap1': case 'w1Elixir': case 'payElixirIgnFx':
            if (!p.elixirs.length) return;
            if (bot) { if (o.k === 'w1Elixir' || p.elixirs.length >= 2) push(state, F('vtDo', { n, o, stage: o.k, ids: [p.elixirs[0]] })); return; }
            askCards(state, p, n, o, o.k, p.elixirs.slice(), 0, 1, `${T} Выберите эликсир или пропустите.`, { from: 'elixirs' });
            return;
        case 'playOne':
            if (!p.hand.length) return;
            if (bot) { const best = strongest(p.hand); if ((CARDS[best].fx.dmg || 0) >= 2) push(state, F('vtDo', { n, o, stage: 'playOne', ids: [best] })); return; }
            askCards(state, p, n, o, 'playOne', p.hand.slice(), 0, 1, `${T} Выберите карту или пропустите.`, { ui: 'hand' });
            return;
        // ---- the witcher's first turn
        case 'drawOrBomb': {
            const bombs = matchBombs(p, o);
            if (!bombs.length) { const g = drawCards(state, p, 1); say(state, n, `+${g} карта`); return; }
            if (bot) { push(state, F('vtDo', { n, o, stage: 'dob', choice: 'bomb' })); return; }
            ask(state, { seat: p.seat, kind: 'choice', title: `Уязвимость ${ROMAN[n - 1]}`, text: T, options: [{ id: 'draw', label: 'Взять 1 карту' }, { id: 'bomb', label: `Сбросить бомбу: ${o.dmg} урона` }], op: 'vtDo', args: { fight: 1, n, o, stage: 'dob' } });
            return;
        }
        case 'w1Color': {
            const ids = p.hand.filter(id => isColor(CARDS[id], o.color));
            if (!ids.length) return;
            if (bot) { push(state, F('vtDo', { n, o, stage: 'pay', ids: [weakest(ids)] })); return; }
            askCards(state, p, n, o, 'pay', ids, 0, 1, `${T} Выберите карту или пропустите.`, { ui: 'hand' });
            return;
        }
        case 'w1Petri': {
            const ids = p.elixirs.filter(id => potionOf(id).name === 'Зелье Петри');
            if (!ids.length) return;
            if (bot) { push(state, F('vtDo', { n, o, stage: 'petri', choice: 'yes', id: ids[0] })); return; }
            askYes(state, p, n, o, 'petri', T, `Сбросить «Зелье Петри»: +${o.draw} карты`);
            return;
        }
        // ---- the monster's first turn
        case 'barrier': say(state, n); gainBarrier(state, p, o.n, `уязвимость ${ROMAN[n - 1]}`); return;
        case 'look2': {
            const top = f.life.slice(0, 2);
            if (top.length < 2 || bot) { if (top.length) say(state, n, `${p.name} смотрит верхние карты запаса жизни монстра`); return; }
            askCards(state, p, n, o, 'order2', top, 2, 2, `${T} Щёлкайте по порядку: первая выбранная карта окажется на верху запаса жизни монстра.`, { from: 'monsterTop', ordered: true });
            return;
        }
    }
};

STEPS.vtDo = (state, step) => {
    if (!alive(state)) return;
    const f = state.fight, p = fp(state);
    const { n, o } = step;
    const ids = step.ids || [];
    const yes = step.choice === 'yes';
    switch (step.stage) {
        case 'fetch': {
            const id = ids[0];
            const fromDeck = removeFrom(p.deck, id);
            if (!fromDeck && !removeFrom(p.discard, id)) return;
            p.hand.push(id);
            if (fromDeck) shuffle(state, p.deck);
            say(state, n, `«${CARDS[id].name}» ${fromDeck ? 'из колоды' : 'из сброса'} в руку`);
            return;
        }
        case 'elixirPick': {
            const top = state.elixirDeck.splice(0, 3);
            const id = ids[0];
            if (!top.includes(id)) { state.elixirDeck.unshift(...top); return; }
            p.elixirs.push(id);
            state.elixirDeck.push(...top.filter(x => x !== id));
            say(state, n, `+ эликсир «${potionOf(id).name}», остальные под низ колоды эликсиров`);
            push(state, { op: 'elixirLimit', seat: p.seat });
            return;
        }
        case 'payGold':
            if (!yes || p.gold < o.n) return;
            p.gold -= o.n; payEffect(state, p, n, o);
            return;
        case 'elixirName': {
            const id = ids[0];
            if (!id || !removeFrom(state.elixirDeck, id)) return;
            p.elixirs.push(id);
            shuffle(state, state.elixirDeck);
            say(state, n, `+ эликсир «${potionOf(id).name}» из колоды эликсиров (колода перемешана)`);
            fx(state, { k: 'elixir', seat: p.seat, n: 1 });
            push(state, { op: 'elixirLimit', seat: p.seat });
            return;
        }
        case 'pay':
            if (!ids.length) return;
            payCards(state, p, ids); payEffect(state, p, n, o);
            return;
        case 'redraw': {
            if (!ids.length) return;
            payCards(state, p, ids);
            const g = drawCards(state, p, ids.length);
            say(state, n, `${p.name} берёт ${g} карт(ы) из колоды`);
            return;
        }
        case 'tutor1': {
            if (!ids.length) return;
            const pool = [...p.deck, ...(o.discard ? p.discard : [])];
            if (!pool.length) return;
            askCards(state, p, n, o, 'tutor2', pool, 1, 1, `Уязвимость ${ROMAN[n - 1]}: выберите карту ${o.discard ? 'из колоды или сброса' : 'из колоды'}, которую возьмёте в руку.`, { from: 'deck', args: { give: ids[0] } });
            return;
        }
        case 'tutor2': {
            const id = ids[0];
            if (!p.hand.includes(step.give)) return;
            const fromDeck = removeFrom(p.deck, id);
            if (!fromDeck && !removeFrom(p.discard, id)) return;
            removeFrom(p.hand, step.give); p.discard.push(step.give);
            p.hand.push(id);
            if (fromDeck) shuffle(state, p.deck);
            say(state, n, `«${CARDS[step.give].name}» в сброс, «${CARDS[id].name}» в руку`);
            return;
        }
        case 'row1': {
            if (!ids.length) return;
            const c = CARDS[ids[0]];
            const row = rowOf(state, p).filter(id => id && !CARDS[id].burn && CARDS[id].cost <= c.cost + 1);
            if (!row.length) { log(state, `В ряду нет карт стоимостью до ${c.cost + 1}`); return; }
            askCards(state, p, n, o, 'row2', row, 1, 1, `Уязвимость ${ROMAN[n - 1]}: «${c.name}» (стоимость ${c.cost}) уйдёт из игры. Выберите карту ряда стоимостью не больше ${c.cost + 1} — она ляжет в ваш сброс.`, { from: 'row', args: { give: ids[0] } });
            return;
        }
        case 'row2': {
            const id = ids[0];
            if (!rowOf(state, p).includes(id) || !removeFrom(p.hand, step.give)) return;
            p.removed.push(step.give);
            clearRowCard(state, id); p.discard.push(id); refillRow(state);
            say(state, n, `«${CARDS[step.give].name}» убрана из игры, «${CARDS[id].name}» из ряда в сброс`);
            return;
        }
        case 'skill':
            if (!SKILLS.includes(step.choice)) return;
            discardToken(state, p, n);
            push(state, { op: 'raiseSkill', seat: p.seat, skill: step.choice, why: `уязвимость ${ROMAN[n - 1]}`, fight: 1 });
            return;
        case 'bb': {
            if (!yes) return;
            const id = step.id || p.elixirs.find(x => potionOf(x).name === 'Чёрная кровь');
            if (!id || !p.elixirs.includes(id)) return;
            discardElixirs(state, p, [id]);
            if (o.k === 'bbDef') push(state, { op: 'raiseSkill', seat: p.seat, skill: 'defense', why: `уязвимость ${ROMAN[n - 1]}`, fight: 1 });
            else payEffect(state, p, n, { life: o.n });
            return;
        }
        case 'take': {
            const id = ids[0];
            if (!removeFrom(p.deck, id)) return;
            p.hand.push(id);
            say(state, n, `«${CARDS[id].name}» с верха колоды в руку`);
            const rest = p.deck.slice(0, 2);
            if (rest.length === 2 && !(p.bot || p.away)) askCards(state, p, n, { k: 'look3' }, 'order', rest, 2, 2, 'Щёлкайте по порядку: первая выбранная карта окажется на верху колоды.', { from: 'deck', ordered: true });
            return;
        }
        case 'order': {
            const k = ids.length;
            if (!k || !ids.every((id, i) => p.deck.slice(0, k).includes(id))) return;
            p.deck.splice(0, k, ...ids);
            log(state, `${p.name} кладёт ${k} верхние карты колоды в выбранном порядке`);
            return;
        }
        case 'order2': {
            if (ids.length !== 2 || !ids.every(id => f.life.slice(0, 2).includes(id))) return;
            f.life.splice(0, 2, ...ids);
            log(state, `${p.name} кладёт 2 верхние карты запаса жизни монстра в выбранном порядке`);
            return;
        }
        case 'payE': {
            if (step.choice === 'bomb') {
                const bombs = matchBombs(p, o.bomb);
                if (!bombs.length) return;
                discardBomb(state, p, bombs[0]);
                payEffect(state, p, n, o.bomb);
                return;
            }
            if (!yes || p.elixirs.length < o.n) return;
            if (p.elixirs.length === o.n || p.bot || p.away) { discardElixirs(state, p, p.elixirs.slice(0, o.n)); payEffect(state, p, n, o); return; }
            askCards(state, p, n, o, 'payE2', p.elixirs.slice(), o.n, o.n, `Уязвимость ${ROMAN[n - 1]}: выберите ${o.n} эликсир(а) для сброса.`, { from: 'elixirs' });
            return;
        }
        case 'payE2':
            if (ids.length !== o.n || !ids.every(id => p.elixirs.includes(id))) return;
            discardElixirs(state, p, ids); payEffect(state, p, n, o);
            return;
        case 'elixirsDraw': {
            const ok = ids.filter(id => p.elixirs.includes(id));
            if (!ok.length) return;
            discardElixirs(state, p, ok);
            const g = drawCards(state, p, ok.length);
            say(state, n, `+${g} карт(ы)`);
            return;
        }
        case 'elixirShield': {
            const ok = ids.filter(id => p.elixirs.includes(id));
            if (!ok.length) return;
            discardElixirs(state, p, ok);
            const b = p.shield;
            p.shield = o.over ? p.shield + ok.length : Math.max(p.shield, Math.min(maxShield(state, p), p.shield + ok.length));
            say(state, n, `щит ${b} → ${p.shield}`);
            return;
        }
        case 'cap1': case 'w1Elixir': case 'payElixirIgnFx': {
            const id = ids[0];
            if (!id || !p.elixirs.includes(id)) return;
            discardElixirs(state, p, [id]);
            if (step.stage === 'cap1') { f.vt.cap1 = n; say(state, n, 'в первый ход монстр нанесёт не больше 1 урона'); }
            else if (step.stage === 'payElixirIgnFx') { f.vt.ignFx1 = n; say(state, n, 'в первый ход монстра все эффекты его атаки, кроме урона, игнорируются'); }
            else payEffect(state, p, n, o);
            return;
        }
        case 'playOne': {
            const id = ids[0];
            if (!id || !removeFrom(p.hand, id)) return;
            const c = CARDS[id];
            say(state, n, `«${c.name}» разыграна (не комбинация) и уходит под низ колоды`);
            p.deck.push(id);
            if (c.fx.shield) gainShield(state, p, c.fx.shield, 'уязвимость');
            if (c.fx.draw > 0) drawCards(state, p, c.fx.draw);
            if (c.fx.dmg) push(state, F('dealDamage', { n: c.fx.dmg, src: `«${c.name}»` }));
            return;
        }
        case 'dob': {
            if (step.choice === 'bomb') { const b = matchBombs(p, o)[0]; if (b) { discardBomb(state, p, b); payEffect(state, p, n, { dmg: o.dmg }); return; } }
            const g = drawCards(state, p, 1); say(state, n, `+${g} карта`);
            return;
        }
        case 'petri': {
            if (!yes) return;
            const id = step.id || p.elixirs.find(x => potionOf(x).name === 'Зелье Петри');
            if (!id || !p.elixirs.includes(id)) return;
            discardElixirs(state, p, [id]); payEffect(state, p, n, { draw: o.draw });
            return;
        }
    }
};

// ---- the first witcher turn: after the combo -----------------------------------------------------
/** MON-28 II: during the combo's effects — discard a hand card to apply a red card's corner again. */
STEPS.vtRedAsk = (state, step) => {
    if (!alive(state)) return;
    const p = fp(state), f = state.fight;
    const reds = step.ids.filter(id => isColor(CARDS[id], 'red'));
    if (!reds.length || !p.hand.length) return;
    const red = strongest(reds);
    if (p.bot || p.away) { if ((CARDS[red].fx.dmg || 0) >= 2) push(state, F('vtRedDo', { ids: [weakest(p.hand)], red })); return; }
    ask(state, { seat: p.seat, kind: 'cards', from: 'hand', ui: 'hand', ids: p.hand.slice(), min: 0, max: 1, title: `Уязвимость ${ROMAN[f.vt.redRepeat - 1]}`, text: `${vulnText(f.mon, f.vt.redRepeat)} Красная карта: «${CARDS[red].name}». Выберите карту руки для сброса или пропустите.`, op: 'vtRedDo', args: { fight: 1, red } });
};
STEPS.vtRedDo = (state, step) => {
    if (!alive(state) || !(step.ids || []).length) return;
    const p = fp(state), f = state.fight;
    payCards(state, p, step.ids);
    const c = CARDS[step.red];
    say(state, f.vt.redRepeat, `эффекты из угла «${c.name}» применяются повторно`);
    if (c.fx.shield) gainShield(state, p, c.fx.shield, 'уязвимость');
    if (c.fx.draw) f.cur.drawMod += c.fx.draw;
    if (c.fx.dmg) push(state, F('dealDamage', { n: c.fx.dmg, src: `«${c.name}» ещё раз` }));
};
/** MON-21 VI: a combo of 3+ cards — after its effects, 1 card of it back to the hand. */
STEPS.vtReturnAsk = (state, step) => {
    if (!alive(state)) return;
    const p = fp(state), f = state.fight;
    const ids = step.ids.filter(id => p.discard.includes(id));
    if (!ids.length) return;
    if (p.bot || p.away || ids.length === 1) { push(state, F('vtReturnDo', { ids: [strongest(ids)] })); return; }
    ask(state, { seat: p.seat, kind: 'cards', from: 'discard', ids, min: 1, max: 1, title: `Уязвимость ${ROMAN[f.vt.returnOne - 1]}`, text: vulnText(f.mon, f.vt.returnOne) + ' Выберите карту.', op: 'vtReturnDo', args: { fight: 1 } });
};
STEPS.vtReturnDo = (state, step) => {
    const p = fp(state), f = state.fight;
    const id = (step.ids || [])[0];
    if (!id || !removeFrom(p.discard, id)) return;
    p.hand.push(id);
    say(state, f.vt.returnOne, `«${CARDS[id].name}» возвращается в руку`);
};

// ---- Кащей: vulnerabilities used by a button in the own fight turn (once per fight each) ------------
export function vtActs(state, p) {
    const f = state.fight;
    if (!f || !f.vt || !f.vt.acts || !f.vt.acts.length || f.seat !== p.seat) return [];
    return f.vt.acts.map((a, i) => ({
        i, n: a.n,
        label: a.k === 'kDie' ? `Уязвимость ${ROMAN[a.n - 1]}: бросок кубика` : `Уязвимость ${ROMAN[a.n - 1]}: ${isMage(p) ? 'энергия' : 'щит'} −${a.cost} → ${a.dmg} урона`,
        text: vulnText(f.mon, a.n),
        err: vtActError(state, p, i),
    }));
}
export function vtActError(state, p, i) {
    const f = state.fight;
    const a = f && f.vt && f.vt.acts && f.vt.acts[i];
    if (!a) return 'Нет такой уязвимости';
    if (f.stage !== 'witcher' || f.seat !== p.seat) return 'Только в свой ход битвы';
    if (a.used) return 'Уже использовано в этой битве';
    if (a.k === 'payShield' && p.shield < a.cost) return isMage(p) ? 'Не хватает энергии' : 'Не хватает щита';
    return null;
}
STEPS.vtAct = (state, step) => {
    const f = state.fight, p = fp(state);
    const a = f.vt.acts[step.i];
    a.used = true;
    if (a.k === 'payShield') {
        loseShield(state, p, a.cost, `уязвимость ${ROMAN[a.n - 1]}`);
        push(state, F('dealDamage', { n: a.dmg, src: `уязвимость ${ROMAN[a.n - 1]}` }), F('awaitWitcher'));
        return;
    }
    // Кащей I (mage): 1–2 energy +2, 3–4 the top card of the discard, 5–6 2 damage.
    const r = d6(state); fx(state, { k: 'd6', v: r, seat: p.seat });
    if (r <= 2) { say(state, a.n, `бросок ${r} — энергия +2`); gainShield(state, p, 2, `уязвимость ${ROMAN[a.n - 1]}`); }
    else if (r <= 4) {
        if (p.discard.length) { const id = p.discard.pop(); p.hand.push(id); say(state, a.n, `бросок ${r} — «${CARDS[id].name}» с верха сброса в руку`); }
        else say(state, a.n, `бросок ${r} — сброс пуст`);
    } else { say(state, a.n, `бросок ${r} — 2 урона`); push(state, F('dealDamage', { n: 2, src: `уязвимость ${ROMAN[a.n - 1]}` })); }
    push(state, F('awaitWitcher'));
};
/** Кащей I / V (witcher): after the combo's effects — a yellow card: shield +2; exactly 1 card: 2 damage. */
export function vtAfterCombo(state, p, ids) {
    const f = state.fight;
    if (!f || !f.vt) return [];
    const out = [];
    if (f.vt.kYellow && !f.vt.kYellowUsed && ids.some(id => isColor(CARDS[id], 'yellow'))) {
        f.vt.kYellowUsed = true;
        say(state, f.vt.kYellow, 'в комбинации есть жёлтая карта — щит +2');
        gainShield(state, p, 2, `уязвимость ${ROMAN[f.vt.kYellow - 1]}`);
    }
    if (f.vt.kOne && !f.vt.kOneUsed && ids.length === 1) {
        f.vt.kOneUsed = true;
        say(state, f.vt.kOne, 'комбинация из 1 карты — 2 урона');
        out.push(F('dealDamage', { n: 2, src: `уязвимость ${ROMAN[f.vt.kOne - 1]}` }));
    }
    return out;
}

// ---- MON-01 II: any time in the fight — an unused elixir for the top card of the discard ----------
export function vtElixirTopError(state, p, id) {
    const f = state.fight;
    if (!f || !f.vt || !f.vt.elixirTop) return 'Нет такой уязвимости';
    if (f.stage !== 'witcher' || f.seat !== p.seat) return 'Только в свой ход битвы';
    if (!p.elixirs.includes(id)) return 'Нет такого эликсира';
    if (f.elixirsUsed >= skillVal(p, 'alchemy')) return 'Достигнут лимит алхимии на эту битву';
    if (!p.discard.length) return 'Сброс пуст';
    return null;
}
STEPS.vtElixirTop = (state, step) => {
    const f = state.fight, p = fp(state);
    discardElixirs(state, p, [step.id]);
    f.elixirsUsed++;
    const id = p.discard.pop();
    p.hand.push(id);
    say(state, f.vt.elixirTop, `«${CARDS[id].name}» с верха сброса в руку (эликсир засчитан в лимит алхимии)`);
    push(state, F('awaitWitcher'));
};
