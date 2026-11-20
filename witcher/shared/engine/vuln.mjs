// «По следу монстра» — «Уязвимости и особые атаки» (Книги правил/По следу монстра.md pp. 6–7):
// the special combat deck (12 base + 4 special cards; the 4 set-aside base cards join when the
// first level III monster appears), special attacks I–IV and discard abilities of the large
// monster cards, the Двимеритовая бомба. Operations are encoded in data/vuln-data.mjs.
import { STEPS, push, ask } from './flow.mjs';
import { CARDS, MONSTER, log, fx, removeFrom, shuffle, randInt, d6, clampShield, potionOf, drawCards, skillVal } from './util.mjs';
import { trailOn, SKILLS, SKILL_NAME } from '../data/rules-data.mjs';
import { ATTACKS, DISCARD, BIG, SPECIALS, SPECIAL, isSpecial, ROMAN } from '../data/vuln-data.mjs';
import { bombOf } from '../data/bombs-data.mjs';
import { LEGEND, LEG_SPECIAL, legTableDamage } from '../data/legend-data.mjs';
import { F, fp, alive, hitMonster, gainShield, loseShield, onAttackDiscard, linkIndex } from './fight.mjs';
import { vtM1, vtIgnoredSpecial, vtIgnoreDiscard } from './vtoken.mjs';

export { isSpecial };
export const vulnOn = (state) => trailOn(state, 'vuln');
const BASE_ATTACKS = Array.from({ length: 20 }, (_, i) => 'MON-ATK-' + String(i + 1).padStart(2, '0'));
const isColor = (c, col) => c.color === col || !!c.any;
const hasColor = (ids, cols) => (ids || []).some(id => CARDS[id] && cols.some(col => isColor(CARDS[id], col)));

// ---------------------------------------------------------------------------------------------
// The monster combat deck
// ---------------------------------------------------------------------------------------------
/** Setup (p. 6): 4 random base cards to the box, 4 set aside, the 4 special cards shuffled into
 *  the remaining 12. `state.atkSet` — every card of the deck now; it is rebuilt after each fight. */
export function setupAttackDeck(state) {
    const base = shuffle(state, BASE_ATTACKS.slice());
    if (!vulnOn(state)) { state.atkSet = null; state.attackDeck = base; return; }
    state.atkBox = base.splice(0, 4);
    state.atkAside = base.splice(0, 4);
    state.atkSet = [...base, ...SPECIALS.map(s => s.id)];
    state.attackDeck = shuffle(state, state.atkSet.slice());
}
/** A fresh shuffled combat deck for the next fight. */
export function freshAttackDeck(state) {
    const set = Array.isArray(state.atkSet) && state.atkSet.length ? state.atkSet : BASE_ATTACKS;
    return shuffle(state, set.slice());
}
/** «Когда на поле появится любой монстр III уровня»: the 4 set-aside cards join for good. */
export function onMonsterAppears(state, id) {
    if (!vulnOn(state) || !id || !MONSTER[id] || MONSTER[id].level !== 3) return;
    if (!state.atkAside || !state.atkAside.length || !Array.isArray(state.atkSet)) return;
    state.atkSet.push(...state.atkAside.splice(0));
    if (!state.fight) state.attackDeck = freshAttackDeck(state);
    log(state, `На поле монстр III уровня: 4 отложенные боевые карты замешаны в колоду монстров (${state.atkSet.length} карт)`);
}

// ---------------------------------------------------------------------------------------------
// Rule merging (restrictions of the next witcher turn, the next monster turn, the whole fight)
// ---------------------------------------------------------------------------------------------
const MIN = ['maxCombo', 'drawCap', 'dmgCap', 'shieldCap'];
const SUM = ['drawLess', 'ignoreDmg', 'needYellow', 'combatLess', 'defLess', 'plus', 'dmgLess', 'needBlue', 'armorPlus'];
export function mergeRules(a, b) {
    const o = { ...(a || {}) };
    for (const [k, v] of Object.entries(b || {})) {
        if (MIN.includes(k)) o[k] = o[k] == null ? v : Math.min(o[k], v);
        else if (SUM.includes(k)) o[k] = (o[k] || 0) + v;
        else if (k === 'ban' || k === 'colorLess') o[k] = [...new Set([...(o[k] || []), ...v])];
        else if (k === 'only' || k === 'firstColor') o[k] = o[k] ? o[k].filter(x => v.includes(x)) : v.slice();
        else o[k] = v;
    }
    return o;
}

/** Special-attack restrictions of the current combo (shared with the client and the bots). */
export function restrictError(f, p, ids) {
    const r = f && f.cur && f.cur.r;
    if (!r || !ids.length) return null;
    const cs = ids.map(id => CARDS[id]);
    if (r.maxCombo != null && ids.length > r.maxCombo) return r.maxCombo === 1 ? 'Особая атака: комбинация только из 1 карты' : `Особая атака: комбинация не больше чем из ${r.maxCombo} карт`;
    if (r.ban) { const c = cs.find(c => r.ban.some(col => isColor(c, col))); if (c) return `Особая атака: «${c.name}» — этот цвет сейчас разыгрывать нельзя`; }
    if (r.only) { const c = cs.find(c => !r.only.some(col => isColor(c, col))); if (c) return `Особая атака: «${c.name}» — сейчас можно разыгрывать только карты разрешённых цветов`; }
    if (r.firstMin2 && !((cs[0].fx.dmg || 0) >= 2 || (cs[0].fx.dice && cs[0].fx.dice !== 'aard'))) return 'Особая атака: первая карта должна сама (без связей) наносить хотя бы 2 урона';
    if (r.firstColor && !(r.orOne && ids.length === 1) && !r.firstColor.some(col => isColor(cs[0], col))) return `Особая атака: первая карта — ${r.firstColor.map(c => ({ blue: 'синяя', purple: 'фиолетовая' })[c] || c).join(' или ')}${r.orOne ? ' (или комбинация из 1 карты)' : ''}`;
    return null;
}

// ---------------------------------------------------------------------------------------------
// Special attacks (a special card revealed during the monster's attack)
// ---------------------------------------------------------------------------------------------
/** The large card with the special attacks: «По следу монстра» or a legendary monster. */
const bigOf = (monId) => BIG[monId] || LEGEND[monId];
/** Whose large card the fight uses: «Скеллиге» — Сирена fights with Dagon's special side. */
const bigId = (f) => f.bigAs || f.mon;
export function specialName(monId, n) { const b = bigOf(monId); return b ? b.attacks[n - 1].name : ''; }
STEPS.spAttack = (state, step) => {
    if (!alive(state)) return;
    const f = state.fight;
    const ops = (ATTACKS[bigId(f)] || LEG_SPECIAL[f.mon] || [])[step.n - 1] || [];
    const b = bigOf(bigId(f));
    if (vtIgnoredSpecial(f, step.n)) {
        log(state, `${MONSTER[f.mon].name}: особая атака ${ROMAN[step.n - 1]} «${b.attacks[step.n - 1].name}» игнорируется (уязвимость)`, { kind: 'attack' });
        push(state, F('afterMonsterTurn'));
        return;
    }
    log(state, `${MONSTER[f.mon].name}: особая атака ${ROMAN[step.n - 1]} «${b ? b.attacks[step.n - 1].name : ''}» — ${b ? b.attacks[step.n - 1].text : ''}`, { kind: 'attack' });
    f.sp = { dmgDone: false };
    push(state, ...ops.map(op => F('spOp', { o: op })), F('spEnd'), F('afterMonsterTurn'));
};
/** Extra damage of the monster's attack this turn (abilities, Кухарка's discard ability). */
function attackExtra(state) {
    const f = state.fight, p = fp(state);
    let extra = 0;
    const why = [];
    if (f.mCur && f.mCur.plus) { extra += f.mCur.plus; why.push(`Кухарка +${f.mCur.plus}`); }
    if (f.mon === 'MON-14' && !f.noAbility && f.poolAtStart <= 2) { extra += 2; why.push('Брукса +2'); }
    if (f.mon === 'MON-30' && !f.noAbility && f.mTurns === 1) { extra += 3; why.push('Тролль +3'); }
    if (f.mon === 'LEG-UNSEEN' && !f.noAbility && f.mTurns === 1 && (p.ruins || []).length) { extra += p.ruins.length; why.push(`Скрытый +${p.ruins.length} (руины)`); }
    return { extra, why, p };
}
/** Damage of a special attack: the first damage of the attack carries the monster's modifiers. */
STEPS.vHurt = (state, step) => {
    if (!alive(state)) return;
    const f = state.fight, p = fp(state);
    let n = step.n;
    let manticore = false;
    if (f.sp && !f.sp.dmgDone && f.turn === 'monster') {
        f.sp.dmgDone = true;
        const { extra, why } = attackExtra(state);
        if (extra) { n += extra; log(state, `Атака дополнительно наносит ${extra} урона (${why.join(', ')})`); }
        if (f.mTurns === 1 && p.gear && p.gear.includes('CONT79-05') && !f.once.g05 && n > 0) { f.once.g05 = true; const was = n; n = Math.max(0, n - 2); log(state, `Ярдель: урон первой атаки снижен на 2 (${was} → ${n})`); }
        const less = vtM1(f, 'dmgLess');
        if (less && n > 0) { const was = n; n = Math.max(0, n - less); log(state, `Уязвимость: урон первой атаки снижен на ${less} (${was} → ${n})`); }
        if (f.mon === 'MON-21' && !f.noAbility && n > 0) { n -= 1; manticore = true; log(state, 'Мантикора: урон −1, но случайная карта из руки сбрасывается'); }
    }
    const seq = [];
    if (n > 0) seq.push(F('hurtWitcher', { n, handFirst: f.turn === 'monster' && f.mon === 'MON-25' && !f.noAbility && f.mTurns === 1, notAttack: step.notAttack }));
    if (manticore) seq.push(F('randomDiscard', { n: 1, why: 'Мантикора', noDeck: true }));
    push(state, ...seq);
};
STEPS.spEnd = (state) => {
    if (!alive(state)) return;
    const f = state.fight;
    const seq = [];
    if (f.sp && !f.sp.dmgDone) {
        const { extra, why } = attackExtra(state);
        if (extra) { log(state, `Атака дополнительно наносит ${extra} урона (${why.join(', ')})`); seq.push(F('hurtWitcher', { n: extra })); }
    }
    if (f.mon === 'MON-10' && !f.noAbility && f.mTurns === 1) seq.push(F('randomDiscard', { n: 1, why: 'Виверна', noDeck: true }));
    f.sp = null;
    push(state, ...seq);
};
const vulnCount = (state, p) => (p.vulns || []).filter(v => v.terrain === state.fight.terrain).length;

const DMG_OPS = ['dmg', 'dmgHand', 'dmgElixirs', 'dmgShield0', 'dmgDie', 'dmgDice', 'dmgTrack', 'dmgVuln', 'dmgVulnLess', 'dmgTrophies', 'dmgKit', 'dmgRuinsBoard', 'dmgTable', 'dmgWater'];
/** Vulnerability: after the special card is revealed the witcher may pick the special attack. */
STEPS.vtSpChoose = (state, step) => {
    const f = state.fight, p = fp(state);
    const b = BIG[f.mon];
    if (p.bot || p.away) {
        const n = f.vt.ign.length ? f.vt.ign[0] : step.n;
        if (n !== step.n) log(state, `Уязвимость: ${p.name} выбирает особую атаку ${ROMAN[n - 1]}`);
        f.lastAttack.n = n; f.lastAttack.name = b.attacks[n - 1].name;
        push(state, F('spAttack', { n }));
        return;
    }
    ask(state, {
        seat: p.seat, kind: 'choice', title: 'Уязвимость', text: `Открыта особая боевая карта ${ROMAN[step.n - 1]}. Вы можете выбрать, какая особая атака будет применена.`,
        options: b.attacks.map((a, i) => ({ id: String(i + 1), label: `${ROMAN[i]} «${a.name}»${i + 1 === step.n ? ' (открыта)' : ''}${vtIgnoredSpecial(f, i + 1) ? ' — игнорируется' : ''}`, hint: a.text })),
        op: 'vtSpChosen', args: { fight: 1 },
    });
};
STEPS.vtSpChosen = (state, step) => {
    const f = state.fight;
    const n = Math.max(1, Math.min(4, Number(step.choice) || 1));
    f.lastAttack.n = n; f.lastAttack.name = BIG[f.mon].attacks[n - 1].name;
    log(state, `Уязвимость: выбрана особая атака ${ROMAN[n - 1]}`);
    push(state, F('spAttack', { n }));
};
STEPS.spOp = (state, step) => {
    if (!alive(state)) return;
    const f = state.fight, p = fp(state);
    const op = step.o;
    const hurt = (n) => push(state, F('vHurt', { n }));
    // Vulnerability: «в первый ход монстра игнорируйте все эффекты его атаки, кроме урона».
    if (vtM1(f, 'ignFx') && !DMG_OPS.includes(op.k)) { if (!f.sp.ignLogged) { f.sp.ignLogged = true; log(state, 'Уязвимость: эффекты особой атаки, кроме урона, игнорируются'); } return; }
    switch (op.k) {
        case 'dmg': return hurt(op.n + (op.ifDice && f.dice ? op.ifDice : 0));
        case 'dmgHand': return hurt(p.hand.length + (op.plus || 0));
        case 'dmgElixirs': return hurt(p.elixirs.length + (op.plus || 0));
        case 'dmgShield0': return hurt(p.shield === 0 ? op.v[0] : op.v[1]);
        case 'dmgDie': {
            const r = d6(state); fx(state, { k: 'd6', v: r, seat: p.seat });
            log(state, `Бросок кубика: ${r} — ${op.v[r - 1]} урона`);
            return hurt(op.v[r - 1]);
        }
        case 'dmgDice': return hurt(Math.max(op.min || 0, f.dice || 0));
        case 'dmgTrack': {
            const own = !!p.trackTokens[f.terrain];
            const other = Object.entries(p.trackTokens).some(([t, v]) => t !== f.terrain && v != null);
            return hurt(own && other ? 1 : 4);
        }
        case 'dmgVuln': return hurt(vulnCount(state, p) + (op.plus || 0));
        // «Легендарная охота» (legend-data.mjs).
        case 'dmgTrophies': return hurt(Math.max(op.min || 0, p.trophies.length * op.mult));
        case 'dmgKit': return hurt(Math.max(op.min || 0, (p.elixirs.length + (p.bombs || []).length) * op.mult));
        case 'dmgRuinsBoard': { const n = state.legend ? Object.keys(state.legend.ruins).length : 0; log(state, `Жетонов руин на поле: ${n}`); return hurt(n); }
        case 'dmgTable': {
            const loc = state.legend ? state.legend.loc : f.loc;
            const n = legTableDamage(f.mon, loc, f.terrain);
            log(state, op.by === 'loc' ? `Монстр в локации ${loc}: ${n} урона` : `Местность локации монстра: ${n} урона`);
            return hurt(n);
        }
        case 'reshuffleTop': {
            const id = f.lastAttack && f.lastAttack.id;
            if (!id || !removeFrom(f.monDiscard, id)) return;
            f.life.splice(randInt(state, f.life.length + 1), 0, id);
            log(state, `Только что открытая боевая карта замешана обратно в запас жизни монстра (${f.life.length})`);
            fx(state, { k: 'monsterHeal', n: 1, left: f.life.length });
            return;
        }
        case 'dmgVulnLess': return hurt(Math.max(0, op.base - vulnCount(state, p)));
        // «Скеллиге» (Дагон): water cards in the hand.
        case 'dmgWater': { const w = p.hand.filter(id => CARDS[id].terrain === 'water').length; log(state, `Карт с символом воды в руке: ${w}`); return hurt(Math.max(0, op.base - w)); }
        case 'ifWater': return push(state, ...(p.hand.some(id => CARDS[id].terrain === 'water') ? op.then : op.else).map(o => F('spOp', { o })));
        case 'randCorner': {
            let id = null, fromDeck = false;
            if (p.hand.length) { id = p.hand[randInt(state, p.hand.length)]; removeFrom(p.hand, id); }
            else if (p.deck.length) { id = p.deck.shift(); fromDeck = true; }
            if (!id) return;
            p.discard.push(id);
            const n = CARDS[id].fx.dmg || 0;
            log(state, `${p.name} сбрасывает ${fromDeck ? 'верхнюю карту колоды' : 'случайную карту'} «${CARDS[id].name}»: урон по символам в углу — ${n}`);
            fx(state, { k: 'discard', seat: p.seat, ids: [id] });
            onAttackDiscard(state, p, [id], fromDeck);
            return hurt(n);
        }
        case 'shield0': return loseShield(state, p, p.shield, 'особая атака');
        case 'shieldDown': return loseShield(state, p, op.n, 'особая атака');
        case 'color': {
            const ids = p.hand.filter(id => op.colors.some(col => isColor(CARDS[id], col)));
            if (ids.length) return push(state, F('vHandAsk', { ids, n: 1, mode: 'discard', attack: true, why: `Особая атака: сбросьте 1 карту (${op.colors.map(c => COLOR_ACC[c]).join(' или ')}) из руки` }));
            log(state, `${p.name}: нет нужной карты в руке`);
            return push(state, ...op.else.map(o => F('spOp', { o })));
        }
        case 'allColors': {
            const ids = p.hand.filter(id => op.colors.some(col => isColor(CARDS[id], col)));
            if (ids.length) return discardIds(state, p, ids, 'особая атака', true);
            if (op.elseDmg) { log(state, `${p.name}: нечего сбросить`); return hurt(op.elseDmg); }
            return;
        }
        case 'randHand': {
            const n = op.byElixirs ? Math.max(1, p.elixirs.length) : op.n;
            return push(state, F('randomDiscard', { n, why: 'особая атака', noDeck: !op.orDeck }));
        }
        case 'handDisc': {
            const n = op.n + (op.ifDice && f.dice ? op.ifDice : 0);
            const fromHand = Math.min(n, p.hand.length);
            if (op.orDeck && n > fromHand) discardDeckTop(state, p, n - fromHand);
            if (fromHand) push(state, F('vHandAsk', { ids: p.hand.slice(), n: fromHand, mode: 'discard', attack: true, why: `Особая атака: сбросьте ${fromHand} карт(ы) из руки` }));
            return;
        }
        case 'deckTop': {
            const k = Math.min(op.n, p.deck.length);
            if (k) discardDeckTop(state, p, k);
            const rest = op.n - k;
            if (rest > 0 && p.hand.length) {
                if (op.orHand === 'random') return push(state, F('randomDiscard', { n: rest, why: 'особая атака: колода пуста', noDeck: true }));
                return push(state, F('vHandAsk', { ids: p.hand.slice(), n: Math.min(rest, p.hand.length), mode: 'discard', attack: true, why: `Колода пуста: сбросьте ${Math.min(rest, p.hand.length)} карт(ы) из руки` }));
            }
            return;
        }
        case 'deckBottom': {
            const ids = [];
            for (let i = 0; i < op.n && p.deck.length; i++) { const id = p.deck.pop(); p.discard.push(id); ids.push(id); }
            if (ids.length) { log(state, `${p.name} сбрасывает ${ids.length} карт(ы) из-под низа колоды`); fx(state, { k: 'deckLoss', seat: p.seat, n: ids.length }); onAttackDiscard(state, p, ids, true); }
            return;
        }
        case 'elixir': {
            if (!p.elixirs.length) { if (op.elseDmg) { log(state, `${p.name}: нет эликсира`); return hurt(op.elseDmg); } return; }
            return push(state, F('vElixirAsk', { n: Math.min(op.n, p.elixirs.length) }));
        }
        case 'gold': {
            const g = Math.min(op.n, p.gold);
            p.gold -= g;
            if (g) log(state, `${p.name} сбрасывает ${g} золота`);
            return;
        }
        case 'removeTop': {
            let id = null;
            if (p.deck.length) id = p.deck.shift();
            else if (p.hand.length) { id = p.hand[randInt(state, p.hand.length)]; removeFrom(p.hand, id); }
            if (!id) return;
            p.removed.push(id);
            log(state, `${p.name}: «${CARDS[id].name}» убрана из игры`);
            fx(state, { k: 'removed', seat: p.seat, id });
            return;
        }
        case 'removeHand':
            if (p.hand.length) push(state, F('vHandAsk', { ids: p.hand.slice(), n: 1, mode: 'remove', why: 'Особая атака: уберите из игры 1 карту из руки' }));
            return;
        case 'handToTop': {
            const n = op.n === 'all' ? p.hand.length : Math.min(op.n, p.hand.length);
            if (!n) return;
            shuffle(state, p.hand);
            const ids = p.hand.splice(p.hand.length - n, n);
            shuffle(state, ids);
            p.deck.unshift(...ids);
            log(state, `${p.name}: ${n} карт(ы) из руки — на верх колоды в случайном порядке`);
            return;
        }
        case 'handToTopPick': {
            const n = Math.min(op.n, p.hand.length);
            if (n) push(state, F('vHandAsk', { ids: p.hand.slice(), n, mode: 'top', why: `Особая атака: положите ${n} карт(ы) из руки на верх колоды (первая выбранная окажется сверху)` }));
            return;
        }
        case 'halfHand': {
            const n = op.round === 'up' ? Math.ceil(p.hand.length / 2) : Math.floor(p.hand.length / 2);
            if (n) push(state, F('vHandAsk', { ids: p.hand.slice(), n, mode: 'discard', attack: true, why: `Особая атака: сбросьте половину руки — ${n} карт(ы)` }));
            return;
        }
        case 'highCost': {
            if (!p.hand.length) return;
            const max = Math.max(...p.hand.map(id => CARDS[id].cost || 0));
            const ids = p.hand.filter(id => (CARDS[id].cost || 0) === max);
            return push(state, F('vHandAsk', { ids, n: 1, mode: 'discard', attack: true, why: 'Особая атака: сбросьте карту с наибольшей стоимостью' }));
        }
        case 'lookRemove': {
            if (!p.deck.length) { if (p.hand.length) push(state, F('vHandAsk', { ids: p.hand.slice(), n: 1, mode: 'remove', why: 'Колода пуста: уберите из игры 1 карту из руки' })); return; }
            const top = p.deck.slice(0, 3);
            if (p.bot || top.length === 1) return push(state, F('vLookDo', { ids: [top.slice().sort((a, b) => cardWorth(a) - cardWorth(b))[0]], top }));
            return ask(state, { seat: p.seat, kind: 'cards', from: 'deckTop', ids: top, min: 1, max: 1, title: 'Особая атака', text: 'Уберите из игры 1 из верхних карт своей колоды; остальные вернутся назад в случайном порядке.', op: 'vLookDo', args: { fight: 1, top } });
        }
        case 'combo3': {
            const chain = findChain(p.hand, 3);
            if (!chain) { log(state, `${p.name} не может разыграть комбинацию из 3 карт`); return hurt(op.elseDmg); }
            if (p.bot) return push(state, F('vCombo3Do', { ids: chain }));
            return ask(state, { seat: p.seat, kind: 'cards', from: 'hand', ui: 'combo', ids: p.hand.slice(), min: 3, max: 3, title: 'Особая атака: «Манящий шёпот»', text: 'Немедленно разыграйте комбинацию ровно из 3 карт: её эффекты применяются, все символы урона игнорируются.', op: 'vCombo3Do', args: { fight: 1 } });
        }
        case 'monDmg': return hitMonster(state, op.n, 'особая атака', { noTrigger: true });
        case 'dice': f.dice = (f.dice || 0) + op.n; log(state, `На карту монстра кладётся кубиков: ${op.n} (всего ${f.dice})`); return;
        case 'diceIfNone': if (!f.dice) { f.dice = 1; log(state, 'На карту монстра кладётся 1 кубик'); } return;
        case 'poolDiscard': {
            const n = op.n === 'shield' ? p.shield : op.n;
            const ids = takeRandom(state, f.monDiscard, n);
            if (ids.length) { f.life.unshift(...ids); log(state, `${ids.length} карт(ы) из сброса монстра — на верх его запаса жизни (${f.life.length})`); fx(state, { k: 'monsterHeal', n: ids.length, left: f.life.length }); }
            return;
        }
        case 'poolDeck': {
            const ids = takeRandom(state, state.attackDeck, op.n);
            if (ids.length) { f.life.unshift(...ids); log(state, `${ids.length} карт(ы) из колоды монстров — на верх запаса жизни (${f.life.length})`); fx(state, { k: 'monsterHeal', n: ids.length, left: f.life.length }); }
            return;
        }
        case 'elixirCut': {
            const e = p.elixirs.length;
            if (!e) return hurt(7);
            if (p.bot) return push(state, F('vCutDo', { choice: e >= 2 ? '2' : '1' }));
            const options = [{ id: '0', label: 'Получить 7 урона' }, { id: '1', label: 'Сбросить 1 эликсир: 6 урона' }];
            if (e >= 2) options.push({ id: '2', label: 'Сбросить 2 эликсира: 4 урона' });
            return ask(state, { seat: p.seat, kind: 'choice', title: 'Особая атака', text: 'Вы получаете 7 урона, но можете сбросить 1 эликсир (урон −1) или 2 эликсира (урон −3).', options, op: 'vCutDo', args: { fight: 1 } });
        }
        case 'skip': f.nextW = mergeRules(f.nextW, { skip: true }); log(state, `${p.name} пропустит свой следующий ход битвы`); return;
        case 'next': { const { k, ...r } = op; f.nextW = mergeRules(f.nextW, r); return; }
        case 'nextM': { const { k, ...r } = op; f.nextM = mergeRules(f.nextM, r); return; }
        case 'whole': {
            const { k, ...r } = op;
            f.whole = mergeRules(f.whole, r);
            if (r.defLess) { clampShield(state, p); log(state, `${p.name}: до конца битвы навык защиты снижен на ${r.defLess}, щит ${p.shield}`); }
            return;
        }
    }
};
const COLOR_ACC = { blue: 'синюю', red: 'красную', green: 'зелёную', purple: 'фиолетовую', yellow: 'жёлтую' };
const cardWorth = (id) => { const c = CARDS[id]; return (c.fx.dmg || 0) * 3 + (c.fx.shield || 0) * 2 + (c.fx.draw || 0) + c.links.length * 1.5 + (c.cost || 0); };
function takeRandom(state, arr, n) {
    const out = [];
    for (let i = 0; i < n && arr.length; i++) out.push(arr.splice(randInt(state, arr.length), 1)[0]);
    return out;
}
function discardIds(state, p, ids, why, attack) {
    for (const id of ids) { removeFrom(p.hand, id); p.discard.push(id); }
    fx(state, { k: 'discard', seat: p.seat, ids });
    log(state, `${p.name} сбрасывает из руки (${why}): ${ids.map(id => '«' + CARDS[id].name + '»').join(', ')}`);
    if (attack) onAttackDiscard(state, p, ids, false);
}
function discardDeckTop(state, p, n) {
    const ids = [];
    while (ids.length < n && p.deck.length) { const id = p.deck.shift(); p.discard.push(id); ids.push(id); }
    if (!ids.length) return;
    log(state, `${p.name} сбрасывает ${ids.length} карт(ы) с верха колоды`);
    fx(state, { k: 'deckLoss', seat: p.seat, n: ids.length });
    state.fight.deckLossThisTurn = (state.fight.deckLossThisTurn || 0) + ids.length;
    onAttackDiscard(state, p, ids, true);
}
/** A chain of exactly `n` linked hand cards (or null). */
export function findChain(hand, n) {
    const dfs = (chain, rest) => {
        if (chain.length === n) return chain;
        for (const id of rest) {
            if (chain.length && linkIndex(CARDS[chain[chain.length - 1]], CARDS[id]) < 0) continue;
            const r = dfs([...chain, id], rest.filter(x => x !== id));
            if (r) return r;
        }
        return null;
    };
    return dfs([], hand);
}

/** Choose `n` of `ids` from the hand: discard / remove from the game / top / bottom of the deck. */
STEPS.vHandAsk = (state, step) => {
    if (!alive(state)) return;
    const p = fp(state);
    const ids = step.ids.filter(id => p.hand.includes(id));
    const n = Math.min(step.n, ids.length);
    if (!n) return;
    if (n === ids.length && (n === 1 || (step.mode !== 'top' && step.mode !== 'bottom'))) return push(state, F('vHandDo', { ids, mode: step.mode, attack: step.attack, why: step.why }));
    if (p.bot) return push(state, F('vHandDo', { ids: ids.slice().sort((a, b) => cardWorth(a) - cardWorth(b)).slice(0, n), mode: step.mode, attack: step.attack, why: step.why }));
    ask(state, { seat: p.seat, kind: 'cards', from: 'hand', ui: 'hand', ids, min: n, max: n, title: step.title || 'Особая атака', text: step.why, op: 'vHandDo', args: { fight: 1, mode: step.mode, attack: step.attack, why: step.why } });
};
STEPS.vHandDo = (state, step) => {
    const p = fp(state);
    const ids = (step.ids || []).filter(id => p.hand.includes(id));
    if (!ids.length) return;
    switch (step.mode) {
        case 'discard': return discardIds(state, p, ids, step.attack ? 'особая атака' : 'способность сброса', step.attack);
        case 'remove':
            for (const id of ids) { removeFrom(p.hand, id); p.removed.push(id); fx(state, { k: 'removed', seat: p.seat, id }); }
            log(state, `${p.name} убирает из игры: ${ids.map(id => '«' + CARDS[id].name + '»').join(', ')}`);
            return;
        case 'top':
            for (const id of ids) removeFrom(p.hand, id);
            p.deck.unshift(...ids);
            log(state, `${p.name}: ${ids.length} карт(ы) из руки — на верх колоды`);
            return;
        case 'bottom':
            for (const id of ids) removeFrom(p.hand, id);
            p.deck.push(...ids);
            log(state, `${p.name}: ${ids.length} карт(ы) из руки — под низ колоды`);
            return;
    }
};
STEPS.vElixirAsk = (state, step) => {
    const p = fp(state);
    const n = Math.min(step.n, p.elixirs.length);
    if (!n) return;
    if (n === p.elixirs.length || p.bot) return push(state, F('vElixirDo', { ids: p.elixirs.slice(0, n) }));
    ask(state, { seat: p.seat, kind: 'cards', from: 'elixirs', ids: p.elixirs.slice(), min: n, max: n, title: 'Особая атака', text: `Сбросьте ${n} неиспользованный(е) эликсир(ы).`, op: 'vElixirDo', args: { fight: 1 } });
};
STEPS.vElixirDo = (state, step) => {
    const p = fp(state);
    const ids = (step.ids || []).filter(id => p.elixirs.includes(id));
    for (const id of ids) { removeFrom(p.elixirs, id); state.elixirDiscard.push(id); }
    if (ids.length) log(state, `${p.name} сбрасывает эликсир(ы): ${ids.map(id => potionOf(id).name).join(', ')}`);
    if (step.then) push(state, F('vHurt', { n: step.then }));
};
STEPS.vCutDo = (state, step) => {
    const c = Number(step.choice) || 0;
    const n = 7 - [0, 1, 3][c];
    if (!c) { push(state, F('vHurt', { n })); return; }
    const p = fp(state);
    if (p.elixirs.length === c || p.bot) { push(state, F('vElixirDo', { ids: p.elixirs.slice(0, c), then: n })); return; }
    ask(state, { seat: p.seat, kind: 'cards', from: 'elixirs', ids: p.elixirs.slice(), min: c, max: c, title: 'Особая атака', text: `Сбросьте ${c} эликсир(а): урон снизится до ${n}.`, op: 'vElixirDo', args: { fight: 1, then: n } });
};
STEPS.vLookDo = (state, step) => {
    const p = fp(state);
    const id = step.ids[0];
    if (!removeFrom(p.deck, id)) return;
    p.removed.push(id);
    const rest = (step.top || []).filter(x => x !== id && p.deck.indexOf(x) >= 0 && p.deck.indexOf(x) < 3);
    for (const x of rest) removeFrom(p.deck, x);
    p.deck.unshift(...shuffle(state, rest));
    log(state, `${p.name}: «${CARDS[id].name}» убрана из игры, остальные верхние карты возвращены в случайном порядке`);
    fx(state, { k: 'removed', seat: p.seat, id });
};
/** Шептуха II: the combo's effects without damage symbols, outside the witcher's turn: shield,
 *  cards from the discard, returned cards; its card draw is taken at once (decision in 02-decisions). */
STEPS.vCombo3Do = (state, step) => {
    const p = fp(state);
    const ids = step.ids.filter(id => p.hand.includes(id));
    if (ids.length !== 3) return;
    for (const id of ids) removeFrom(p.hand, id);
    let shield = 0, draw = 0, top = 0;
    const ret = [];
    ids.forEach((id, i) => {
        const c = CARDS[id];
        shield += c.fx.shield || 0; draw += c.fx.draw || 0; top += c.fx.top || 0; if (c.fx.ret) ret.push(id);
        if (i < 2) { const li = linkIndex(c, CARDS[ids[i + 1]]); if (li >= 0) { const l = c.links[li].fx; shield += l.shield || 0; draw += l.draw || 0; top += l.top || 0; if (l.ret) ret.push(id); } }
    });
    log(state, `${p.name} разыгрывает комбинацию без урона: ${ids.map(id => '«' + CARDS[id].name + '»').join(' → ')}`, { kind: 'combo' });
    fx(state, { k: 'combo', seat: p.seat, ids });
    gainShield(state, p, shield, 'комбинация');
    for (let i = 0; i < top && p.discard.length; i++) p.hand.push(p.discard.pop());
    for (const id of ids) { if (ret.includes(id)) p.hand.push(id); else p.discard.push(id); }
    if (draw > 0) { const g = drawCards(state, p, draw); log(state, `${p.name} берёт ${g} карт(ы)`); }
};

// ---------------------------------------------------------------------------------------------
// Discard abilities (a special card discarded from the life pool by the witcher's damage)
// ---------------------------------------------------------------------------------------------
STEPS.discAbility = (state, step) => {
    if (!alive(state)) return;
    const f = state.fight, p = fp(state);
    const b = BIG[bigId(f)];
    if (!b) return;
    log(state, `Сброшена особая боевая карта: способность сброса «${b.discard.name}» — ${b.discard.text}`, { kind: 'attack' });
    fx(state, { k: 'discAbility', mon: f.mon });
    if (vtIgnoreDiscard(state)) return;
    const bomb = (p.bombs || []).find(x => x.startsWith('BOMB-07#'));
    if (bomb && f.elixirsUsed < skillVal(p, 'alchemy')) {
        if (p.bot) { push(state, F('dimeritDo', { choice: 'use', id: bomb, mon: bigId(f) })); return; }
        ask(state, {
            seat: p.seat, kind: 'choice', ui: 'bomb', card: bomb, title: 'Двимеритовая бомба',
            text: `Срабатывает способность сброса «${b.discard.name}»: ${b.discard.text} Бросить двимеритовую бомбу, чтобы её эффект игнорировался? Бомба займёт 1 место в лимите алхимии.`,
            options: [{ id: 'use', label: 'Бросить двимеритовую бомбу' }, { id: 'skip', label: 'Не бросать' }], op: 'dimeritDo', args: { fight: 1, id: bomb, mon: bigId(f) },
        });
        return;
    }
    push(state, F('discApply', { mon: bigId(f) }));
};
STEPS.dimeritDo = (state, step) => {
    const f = state.fight, p = fp(state);
    if (step.choice !== 'use' || !p.bombs.includes(step.id)) { push(state, F('discApply', { mon: step.mon })); return; }
    removeFrom(p.bombs, step.id);
    f.usedBombs.push(step.id);
    f.elixirsUsed++;
    log(state, `${p.name} бросает бомбу «${bombOf(step.id).name}»: эффект способности сброса игнорируется`, { kind: 'elixir' });
    fx(state, { k: 'useBomb', seat: p.seat, id: step.id });
};
/** The large cards of level III monsters for Брукса (the ones of this game, except her own). */
function levelThreeBig(state) {
    const troll = trailOn(state, 'troll');
    return Object.keys(BIG).filter(id => MONSTER[id] && MONSTER[id].level === 3 && !MONSTER[id].sk && id !== 'MON-14' && (id !== 'MON-30' || troll));
}
STEPS.discApply = (state, step) => {
    if (!alive(state)) return;
    const f = state.fight, p = fp(state);
    const d = DISCARD[step.mon];
    const c = f.cur;
    if (!d || !c) return;
    const combo = c.combo || [];
    if (d.unless && hasColor(combo, d.unless)) { log(state, `Способность сброса не действует: в комбинации есть нужная карта`); return; }
    if (d.ignore != null) {
        if (d.ignore === 'all') c.ign.all = true;
        else if (d.ignore === 'half') c.ign.half = true;
        else c.ign.n += d.ignore;
        log(state, d.ignore === 'all' ? 'Монстр игнорирует весь последующий урон в этом ходу' : d.ignore === 'half' ? 'Монстр игнорирует половину последующего урона в этом ходу (с округлением вверх)' : `Монстр игнорирует ${d.ignore} последующего урона в этом ходу`);
    }
    if (d.takeBack && combo.length) {
        const last = combo[combo.length - 1];
        if (!c.takenBack.includes(last)) {
            const inDiscard = p.discard.lastIndexOf(last);
            if (c.comboDone && inDiscard >= 0) { p.discard.splice(inDiscard, 1); p.hand.push(last); c.takenBack.push(last); }
            else if (!c.comboDone) { p.hand.push(last); c.takenBack.push(last); }
            if (c.takenBack.includes(last)) log(state, `${p.name} берёт обратно в руку «${CARDS[last].name}»`);
        }
    }
    if (d.next) f.nextW = mergeRules(f.nextW, d.next);
    if (d.nextM) f.nextM = mergeRules(f.nextM, d.nextM);
    if (d.harpy) c.harpy.push(c.dmgDealt);
    if (d.noPurpleTop) c.mistTop = (c.mistTop || 0) + 1;
    if (d.drawLess) { c.drawMod -= d.drawLess; log(state, `${p.name} возьмёт на ${d.drawLess} карты меньше в конце хода`); }
    if (d.noDrawFx) { c.noDrawFx = true; log(state, 'Эффекты комбинации на добор карт в этом ходу игнорируются'); }
    if (d.poolBottom) { const ids = takeRandom(state, state.attackDeck, 1); if (ids.length) { f.life.push(...ids); log(state, `Карта из колоды монстров — под низ запаса жизни (${f.life.length})`); fx(state, { k: 'monsterHeal', n: 1, left: f.life.length }); } }
    if (d.mostLinks && p.hand.length) {
        const max = Math.max(...p.hand.map(id => CARDS[id].links.length));
        push(state, F('vHandAsk', { ids: p.hand.filter(id => CARDS[id].links.length === max), n: 1, mode: 'discard', why: 'Способность сброса: сбросьте карту с наибольшим количеством связей', title: 'Способность сброса' }));
    }
    if (d.color) {
        const ids = p.hand.filter(id => d.color.some(col => isColor(CARDS[id], col)));
        if (ids.length) push(state, F('vHandAsk', { ids, n: 1, mode: 'discard', why: 'Способность сброса: сбросьте 1 фиолетовую или жёлтую карту из руки', title: 'Способность сброса' }));
        else if (p.deck.length) { const id = p.deck.shift(); p.discard.push(id); log(state, `${p.name} сбрасывает верхнюю карту колоды «${CARDS[id].name}»`); }
        else if (p.hand.length) push(state, F('vHandAsk', { ids: p.hand.slice(), n: 1, mode: 'discard', why: 'Способность сброса: сбросьте 1 любую карту из руки', title: 'Способность сброса' }));
    }
    if (d.red) {
        const ids = p.hand.filter(id => isColor(CARDS[id], 'red'));
        if (ids.length) push(state, F('vHandAsk', { ids, n: 1, mode: 'discard', why: 'Способность сброса: сбросьте 1 красную карту из руки', title: 'Способность сброса' }));
        else if (p.hand.length) push(state, F('vHandAsk', { ids: p.hand.slice(), n: Math.min(2, p.hand.length), mode: 'bottom', why: 'Способность сброса: нет красной карты — положите 2 карты из руки под низ колоды', title: 'Способность сброса' }));
    }
    if (d.dmgDice) push(state, F('hurtWitcher', { n: Math.max(d.dmgDice, f.dice || 0), notAttack: true }));
    // Dagon «Призыв водяных»: 1 water card from the hand, otherwise 2 cards from the top of the deck.
    if (d.waterOrDeck) {
        const ids = p.hand.filter(id => CARDS[id].terrain === 'water');
        if (ids.length) push(state, F('vHandAsk', { ids, n: 1, mode: 'discard', why: 'Способность сброса: сбросьте 1 карту с символом водной местности из руки', title: 'Способность сброса' }));
        else if (p.deck.length) discardDeckTop(state, p, Math.min(d.waterOrDeck, p.deck.length));
    }
    if (d.elixir && p.elixirs.length) push(state, F('vElixirAsk', { n: d.elixir }));
    if (d.lowerSkill) {
        const opts = SKILLS.filter(s => p.skills[s] > 1 && p.skills[s] < 5);
        if (!f.dice) { f.dice = 1; log(state, 'На карту монстра кладётся 1 кубик'); }
        if (opts.length === 1 || (opts.length && p.bot)) push(state, { op: 'lowerSkill', seat: p.seat, skill: opts[opts.length - 1], fight: 1 });
        else if (opts.length) ask(state, { seat: p.seat, kind: 'choice', title: 'Способность сброса', text: 'Понизьте любой свой навык на 1.', options: opts.map(s => ({ id: s, label: SKILL_NAME[s] })), op: 'vLowerDo', args: { fight: 1 } });
    }
    if (d.cheapest) push(state, F('vCheapAsk'));
    if (d.afterCombo) { if (c.comboDone) afterCombo25(state, p); else c.after25 = (c.after25 || 0) + 1; }
    if (d.elixirs) push(state, { op: 'gainElixir', seat: p.seat, n: d.elixirs, why: 'способность сброса', fight: 1 });
    if (d.resetAlchemy) { f.elixirsUsed = 0; log(state, 'Использованные ранее эликсиры больше не учитываются в лимите алхимии'); }
    if (d.poolPick) push(state, F('vPoolPick'));
    if (d.bruxa) {
        const list = levelThreeBig(state);
        const id = list[randInt(state, list.length)];
        log(state, `Брукса: случайная большая карта III уровня — ${MONSTER[id].name}, способность сброса «${BIG[id].discard.name}»: ${BIG[id].discard.text}`);
        push(state, F('discApply', { mon: id }));
    }
};
STEPS.vLowerDo = (state, step) => { push(state, { op: 'lowerSkill', seat: fp(state).seat, skill: step.choice, fight: 1 }); };
/** Кладбищенская баба: after the combo's effects — shield −2, or at shield 0 a random hand card. */
export function afterCombo25(state, p) {
    if (p.shield > 0) { loseShield(state, p, 2, 'Кладбищенская баба'); return; }
    if (!p.hand.length) return;
    const id = p.hand[randInt(state, p.hand.length)];
    removeFrom(p.hand, id); p.discard.push(id);
    log(state, `${p.name} сбрасывает случайную карту «${CARDS[id].name}» (Кладбищенская баба)`);
    fx(state, { k: 'discard', seat: p.seat, ids: [id] });
}
/** Пряха: the controller discards the cheapest card of the active player's hand (solo: the player). */
STEPS.vCheapAsk = (state) => {
    if (!alive(state)) return;
    const f = state.fight, p = fp(state);
    if (!p.hand.length) {
        if (p.deck.length) { const id = p.deck.shift(); p.discard.push(id); log(state, `${p.name} сбрасывает верхнюю карту колоды «${CARDS[id].name}»`); }
        return;
    }
    const min = Math.min(...p.hand.map(id => CARDS[id].cost || 0));
    const ids = p.hand.filter(id => (CARDS[id].cost || 0) === min);
    const who = state.solo || f.chooser == null ? p : state.players[f.chooser];
    if (ids.length === 1 || who.bot || who.away) { push(state, F('vCheapDo', { ids: [ids.slice().sort((a, b) => who === p ? cardWorth(a) - cardWorth(b) : cardWorth(b) - cardWorth(a))[0]] })); return; }
    ask(state, { seat: who.seat, kind: 'cards', from: 'hand', ui: 'hand', ids, min: 1, max: 1, title: 'Способность сброса «Всевидящая»', text: `Выберите из руки ${p.name} карту с наименьшей стоимостью — она уйдёт в сброс.`, op: 'vCheapDo', args: { fight: 1 } });
};
STEPS.vCheapDo = (state, step) => {
    const p = fp(state);
    const id = step.ids[0];
    if (!removeFrom(p.hand, id)) return;
    p.discard.push(id);
    log(state, `${p.name}: «${CARDS[id].name}» уходит в сброс (Пряха)`);
    fx(state, { k: 'discard', seat: p.seat, ids: [id] });
};
/** Тролль: the controller puts 1 card of the monster discard on top of its life pool (solo: random). */
STEPS.vPoolPick = (state) => {
    if (!alive(state)) return;
    const f = state.fight;
    if (!f.monDiscard.length) return;
    const who = state.solo || f.chooser == null ? null : state.players[f.chooser];
    if (!who || who.bot || who.away) { push(state, F('vPoolDo', { ids: [f.monDiscard[randInt(state, f.monDiscard.length)]] })); return; }
    ask(state, { seat: who.seat, kind: 'cards', from: 'monsterTop', ids: [...new Set(f.monDiscard)], min: 1, max: 1, title: 'Способность сброса «Кожа как камень»', text: 'Выберите 1 карту из сброса монстра: она ляжет на верх его запаса жизни.', op: 'vPoolDo', args: { fight: 1 } });
};
STEPS.vPoolDo = (state, step) => {
    const f = state.fight;
    const id = step.ids[0];
    if (!removeFrom(f.monDiscard, id)) return;
    f.life.unshift(id);
    log(state, `Карта из сброса монстра — на верх запаса жизни (${f.life.length})`);
    fx(state, { k: 'monsterHeal', n: 1, left: f.life.length });
};

/** End of the witcher's fight turn: Гарпия (half of the later damage), Туманник (a card on top). */
export function endOfTurnDiscards(state) {
    const f = state.fight, p = fp(state), c = f.cur;
    if (!c || c.endDone) return [];
    c.endDone = true;
    const seq = [];
    while (c.after25 > 0) { c.after25--; afterCombo25(state, p); }
    if (c.harpy && c.harpy.length) {
        const n = c.harpy.reduce((a, mark) => a + Math.floor((c.dmgDealt - mark) / 2), 0);
        if (n) { log(state, `Гарпия: ${p.name} получает половину последующего урона — ${n}`); seq.push(F('hurtWitcher', { n, notAttack: true })); }
    }
    if (c.mistTop && !hasColor(c.combo, ['purple'])) {
        const ids = takeRandom(state, state.attackDeck, c.mistTop);
        if (ids.length) { f.life.unshift(...ids); log(state, `Туманник: в комбинации нет фиолетовой карты — ${ids.length} карт(ы) из колоды монстров на верх запаса жизни (${f.life.length})`); fx(state, { k: 'monsterHeal', n: ids.length, left: f.life.length }); }
    }
    return seq;
}
export { SPECIAL };
