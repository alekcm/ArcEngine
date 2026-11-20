// Command entry point: apply(state, seat, cmd) validates a player's command against the rules
// and runs the step machine; options(state, seat) lists what that seat may do right now, with
// the reason for everything that is not allowed (the UI shows those reasons on disabled buttons).
import { STEPS, push, run, ask } from './flow.mjs';
import { CARDS, LOC, ADJ, MONSTER, log, fx, removeFrom, potionOf, d6 } from './util.mjs';
import { LOC_ACTIONS, LOC_ACTION_TEXT, SKILL_NAME, SCHOOLS, TERRAIN_NAME } from '../data/rules-data.mjs';
import { movePaymentError, canEnter, meditationOptions, SKILL_GEN, autoReroll, comparePoker, pokerValue, POKER_NAMES, SOLO_POKER } from './turn.mjs';
import { monsterFightError, elixirError, specError, activeEffectError, comboError } from './fight.mjs';
import { ACTIVE_EFFECTS, hasTrophy, hasWitcherTrophy } from './effects.mjs';
import { exploreError, questError } from './explore.mjs';
import { questLabel } from '../data/events-data.mjs';
import './setup.mjs';

export { createGame } from './setup.mjs';

const ok = () => ({ ok: true });
const err = (e) => ({ ok: false, err: e });

/** Who must act now (prompt owner, fighting witcher or active player). */
export function actingSeat(state) {
    if (state.stage === 'over') return null;
    if (state.prompt) return state.prompt.seat;
    if (state.fight && state.fight.stage === 'witcher') return state.fight.seat;
    if (state.turn && state.turn.phase === 1) return state.turn.seat;
    return null;
}

// ---------------------------------------------------------------------------------------------
// Location action availability
// ---------------------------------------------------------------------------------------------
export function locActionInfo(state, p) {
    const t = state.turn;
    const act = LOC_ACTIONS[p.loc];
    if (!act) return { kind: null, err: 'В этой локации нет действия' };
    const info = { kind: act.kind, text: LOC_ACTION_TEXT[act.kind], skill: act.skill, err: null, choices: [] };
    if (!t || t.seat !== p.seat || t.phase !== 1) { info.err = 'Только в фазе I своего хода'; return info; }
    if (!t.moved) { info.err = 'Сначала нужно переместиться хотя бы раз'; return info; }
    if (t.usedLoc.includes(p.loc)) { info.err = 'Действие этой локации уже выполнено в этот ход'; return info; }
    switch (act.kind) {
        case 'raise': {
            const v = p.skills[act.skill];
            if (v >= 5) info.err = `Навык ${SKILL_GEN[act.skill]} уже 5`;
            else if (v > p.level) info.err = `Навык ${SKILL_GEN[act.skill]} (${v}) выше уровня ведьмака (${p.level})`;
            break;
        }
        case 'school': {
            const home = LOC[p.loc].school === p.school;
            for (const s of ['combat', 'defense', 'alchemy', 'spec']) {
                const cost = p.skills[s] + 1;
                let e = null;
                if (s === 'spec' && !home) e = 'Специализацию — только в своей школе';
                else if (p.skills[s] >= 5) e = 'Уже 5';
                else if (p.gold < cost) e = `Нужно ${cost} золота`;
                info.choices.push({ id: s, label: `${SKILL_NAME[s]} ${p.skills[s]} → ${p.skills[s] + 1}`, cost, err: e });
            }
            if (!info.choices.some(c => !c.err)) info.err = 'Нечего тренировать (золото или уровень навыков)';
            break;
        }
        case 'hunt': {
            for (let i = 0; i < state.slots.length; i++) {
                const s = state.slots[i];
                if (!s.mon) continue;
                let e = null;
                if (p.trackTokens[s.terrain] != null) e = 'Уже есть жетон следа этого монстра';
                else if (p.hunts.some(h => h.terrain === s.terrain)) e = 'Уже есть задание на этого монстра';
                else if (!state.locPiles[s.terrain].length) e = 'Жетоны локаций этого типа закончились';
                info.choices.push({ id: String(i), label: `${MONSTER[s.mon].name} (${TERRAIN_NAME[s.terrain].toLowerCase()})`, err: e });
            }
            break;
        }
        case 'poker': if (p.gold < 1) info.err = 'Нужно хотя бы 1 золото'; break;
        case 'swap': {
            const okCards = p.hand.filter(h => state.row.some(r => r && CARDS[r].cost <= CARDS[h].cost + 1));
            if (!okCards.length) info.err = p.hand.length ? 'В ряду нет подходящей карты' : 'Рука пуста';
            break;
        }
    }
    return info;
}

// ---------------------------------------------------------------------------------------------
// Options for the UI
// ---------------------------------------------------------------------------------------------
export function options(state, seat) {
    const p = state.players[seat];
    const o = { acting: actingSeat(state) === seat, moves: [], loc: null, phase2: [], fight: null };
    if (state.stage === 'over' || !p) return o;
    if (state.prompt) return o;
    const t = state.turn;
    if (state.fight && state.fight.seat === seat && state.fight.stage === 'witcher') {
        o.fight = {
            elixirs: p.elixirs.map(id => ({ id, err: elixirError(state, p, id) })),
            spec: specError(state, p),
            active: Object.keys(ACTIVE_EFFECTS).filter(k => k === 'W-griffin' ? hasWitcherTrophy(p, 'griffin') : ACTIVE_EFFECTS[k].src === 'gear' ? p.gear.includes(k) : hasTrophy(p, k)).map(k => ({ key: k, label: ACTIVE_EFFECTS[k].label, err: activeEffectError(state, p, k) })),
            mustPlay: p.hand.length > 0,
        };
        return o;
    }
    if (!t || t.seat !== seat || t.phase !== 1) return o;
    o.quests = p.quests.map((q, i) => ({ i, label: questLabel(q), loc: q.loc, err: questError(state, p, i) }));
    if (t.afterExplore) {
        // The event moved the witcher: only the new location's action, then phase III.
        o.loc = locActionInfo(state, p);
        o.phase2.push({ id: 'endExplore', label: 'Завершить → фаза III', err: null });
        return o;
    }
    for (const n of ADJ[p.loc] || []) {
        if (!canEnter(state, n)) continue;
        o.moves.push({ to: n, terrain: LOC[n].terrain });
    }
    o.loc = locActionInfo(state, p);
    const fe = monsterFightError(state, p);
    const slot = state.slots.find(s => s.mon && s.token === p.loc);
    o.phase2.push({ id: 'fight', label: slot ? `Битва: ${MONSTER[slot.mon].name}` : 'Битва с монстром', err: fe });
    const med = meditationOptions(state, p);
    o.phase2.push({ id: 'meditate', label: 'Медитация', err: med.length ? null : 'Нужен навык 5 и свободный трофей за него', trophies: med.map(m => m.id) });
    for (const d of ['city', 'wild']) o.phase2.push({ id: 'explore-' + d, label: d === 'city' ? 'Исследовать город' : 'Исследовать окрестности', err: exploreError(state, p, d) });
    return o;
}

// ---------------------------------------------------------------------------------------------
// apply
// ---------------------------------------------------------------------------------------------
export function apply(state, seat, cmd) {
    if (!cmd || typeof cmd.t !== 'string') return err('Пустая команда');
    if (state.stage === 'over') return err('Игра окончена');
    state.events = [];
    const p = state.players[seat];
    if (!p) return err('Нет такого места');
    let r;
    if (cmd.t === 'answer') r = answer(state, seat, cmd);
    else if (state.prompt) return err('Сначала нужно ответить на запрос: ' + (state.prompt.title || ''));
    else if (state.fight) r = fightCmd(state, p, cmd);
    else r = turnCmd(state, p, cmd);
    if (!r.ok) return r;
    run(state);
    return r;
}

function answer(state, seat, cmd) {
    const pr = state.prompt;
    if (!pr) return err('Нет запроса');
    if (pr.seat !== seat) return err('Сейчас решает другой игрок');
    const step = { op: pr.op, ...(pr.args || {}) };
    if (pr.kind === 'cards' || pr.kind === 'dice') {
        const ids = Array.isArray(cmd.ids) ? cmd.ids : [];
        if (new Set(ids).size !== ids.length) return err('Повтор в выборе');
        if (!ids.every(id => pr.ids.includes(id))) return err('Такой вариант выбрать нельзя');
        if (ids.length < pr.min || ids.length > pr.max) return err(pr.min === pr.max ? `Нужно выбрать ${pr.min}` : `Выберите от ${pr.min} до ${pr.max}`);
        if (pr.op === 'p3buyPay' && pr.args.waterAlt) {
            const cost = pr.max;
            const okWater = ids.length === 1 && CARDS[ids[0]].terrain === 'water';
            if (ids.length !== cost && !okWater) return err(`Нужно ${cost} карт(ы) или 1 карта воды`);
        }
        step.ids = ids;
    } else if (pr.kind === 'choice') {
        const opt = pr.options.find(x => x.id === cmd.choice);
        if (!opt) return err('Нет такого варианта');
        if (opt.disabled) return err(opt.hint || 'Этот вариант недоступен');
        step.choice = cmd.choice;
    }
    state.prompt = null;
    push(state, step);
    return ok();
}

function turnCmd(state, p, cmd) {
    const t = state.turn;
    if (!t || t.seat !== p.seat) return err('Сейчас не ваш ход');
    if (t.phase !== 1) return err('Сейчас не фаза I');
    if (t.afterExplore && !['loc', 'endExplore'].includes(cmd.t)) return err('После события: только действие локации, затем фаза III');
    switch (cmd.t) {
        case 'endExplore': {
            if (!t.afterExplore) return err('Сейчас нечего завершать');
            t.phase = 2;
            push(state, { op: 'phase3' });
            return ok();
        }
        case 'quest': {
            const i = Number(cmd.i);
            const e = questError(state, p, i);
            if (e) return err(e);
            push(state, { op: 'questDone', seat: p.seat, i });
            return ok();
        }
        case 'move': {
            const to = Number(cmd.to);
            if (!(ADJ[p.loc] || []).includes(to) || !canEnter(state, to)) return err('Туда нет дороги');
            const cards = Array.isArray(cmd.cards) ? cmd.cards : [];
            const gold = Number(cmd.gold) || 0;
            const e = movePaymentError(state, p, to, cards, gold);
            if (e) return err(e);
            for (const id of cards) { removeFrom(p.hand, id); p.discard.push(id); }
            p.gold -= gold;
            const from = p.loc;
            p.loc = to;
            t.moved = true;
            log(state, `${p.name}: ${LOC[from].name} → ${LOC[to].name}${gold ? ' (1 карта + 1 золото)' : cards.length === 2 ? ' (2 карты)' : ''}`, { kind: 'move' });
            fx(state, { k: 'move', seat: p.seat, from, to, cards });
            push(state, { op: 'arrive', seat: p.seat });
            state.undoable = true;
            return ok();
        }
        case 'loc': {
            const info = locActionInfo(state, p);
            if (info.err) return err(info.err);
            const mark = () => t.usedLoc.push(p.loc);
            switch (info.kind) {
                case 'raise': mark(); push(state, { op: 'raiseSkill', seat: p.seat, skill: info.skill, why: 'действие локации' }); state.undoable = info.skill !== 'alchemy'; break;
                case 'school': {
                    const c = info.choices.find(x => x.id === cmd.skill);
                    if (!c) return err('Выберите навык');
                    if (c.err) return err(c.err);
                    mark(); push(state, { op: 'locSchool', seat: p.seat, skill: c.id }); state.undoable = c.id !== 'alchemy';
                    break;
                }
                case 'hunt': {
                    const c = info.choices.find(x => x.id === String(cmd.slot));
                    p.gold += 1; mark();
                    log(state, `${p.name}: +1 золото (${LOC[p.loc].name})`);
                    if (c && !c.err) push(state, { op: 'locHunt', seat: p.seat, slot: Number(c.id) });
                    break;
                }
                case 'elixir': mark(); push(state, { op: 'gainElixir', seat: p.seat, n: 1, why: LOC[p.loc].name }); break;
                case 'poker': mark(); push(state, { op: 'pokerStart', seat: p.seat, vs: 'town' }); break;
                case 'poor': {
                    mark();
                    if (p.gold === 0) { p.gold = 1; log(state, `${p.name}: +1 золото (${LOC[p.loc].name})`); }
                    ask(state, { seat: p.seat, kind: 'cards', from: 'row', ui: 'row', ids: state.row.filter(Boolean), min: 0, max: 2, title: LOC[p.loc].name, text: 'Можно убрать из игры до 2 карт ряда (ряд пополнится).', op: 'locPoorRemove', args: {} });
                    state.undoable = true;
                    break;
                }
                case 'swap': {
                    mark();
                    const okCards = p.hand.filter(h => state.row.some(r => r && CARDS[r].cost <= CARDS[h].cost + 1));
                    ask(state, { seat: p.seat, kind: 'cards', from: 'hand', ui: 'hand', ids: okCards, min: 1, max: 1, title: 'Обмен карты', text: 'Уберите из игры 1 карту из руки; затем возьмите из ряда карту с напечатанной стоимостью не больше чем на 1 выше.', op: 'locSwapPick', args: { seat: p.seat } });
                    break;
                }
            }
            return ok();
        }
        case 'fight': {
            const e = monsterFightError(state, p);
            if (e) return err(e);
            push(state, { op: 'fightStart', seat: p.seat });
            return ok();
        }
        case 'meditate': {
            const med = meditationOptions(state, p);
            const tr = med.find(m => m.id === cmd.trophy) || (med.length === 1 ? med[0] : null);
            if (!tr) return err(med.length ? 'Выберите трофей' : 'Медитация недоступна');
            t.phase = 2;
            push(state, { op: 'meditate', seat: p.seat, trophy: tr.id });
            return ok();
        }
        case 'explore': {
            const e = exploreError(state, p, cmd.deck);
            if (e) return err(e);
            t.phase = 2;
            push(state, { op: 'exploreStart', seat: p.seat, deck: cmd.deck });
            return ok();
        }
    }
    return err('Неизвестная команда');
}

function fightCmd(state, p, cmd) {
    const f = state.fight;
    if (f.seat !== p.seat) return err('Сейчас ход другого игрока в битве');
    if (f.stage !== 'witcher') return err('Подождите хода монстра');
    switch (cmd.t) {
        case 'elixir': { const e = elixirError(state, p, cmd.id); if (e) return err(e); f.stage = 'busy'; push(state, { op: 'useElixir', fight: 1, id: cmd.id }); return ok(); }
        case 'spec': { const e = specError(state, p); if (e) return err(e); f.stage = 'busy'; push(state, { op: 'useSpec', fight: 1 }); return ok(); }
        case 'active': { const e = activeEffectError(state, p, cmd.key); if (e) return err(e); f.stage = 'busy'; push(state, { op: 'useActive', fight: 1, key: cmd.key }); return ok(); }
        case 'combo': {
            const ids = Array.isArray(cmd.ids) ? cmd.ids : [];
            const e = comboError(state, p, ids, { free: !!cmd.free });
            if (e) return err(e);
            push(state, { op: 'playCombo', fight: 1, ids, free: !!cmd.free, links: cmd.links || null });
            return ok();
        }
    }
    return err('Неизвестная команда в битве');
}

// ---------------------------------------------------------------------------------------------
// Dice poker flow (townsfolk; witchers come with the poker milestone)
// ---------------------------------------------------------------------------------------------
const roll5 = (state) => [d6(state), d6(state), d6(state), d6(state), d6(state)];
STEPS.pokerStart = (state, step) => {
    const p = state.players[step.seat];
    p.gold -= 1;
    const poker = { seat: p.seat, vs: step.vs, a: roll5(state), b: state.solo ? null : roll5(state), pot: state.solo ? 0 : 3, done: false, winner: null, rerolledB: [], rerolledA: [] };
    state.poker = poker;
    log(state, state.solo ? `${p.name} играет в покер (1 золото)` : `${p.name} играет в покер с горожанами: ставка 1 золото + 2 из запаса`, { kind: 'poker' });
    fx(state, { k: 'pokerRoll', who: 'both' });
    if (!state.solo) {
        const rr = autoReroll(poker.b);
        for (const i of rr) poker.b[i] = d6(state);
        poker.rerolledB = rr;
        log(state, `Горожане перебрасывают ${rr.length} куб.: ${POKER_NAMES[pokerValue(poker.b)[0]]}`);
        fx(state, { k: 'pokerReroll', who: 'b', idx: rr });
    }
    ask(state, { seat: p.seat, kind: 'dice', ui: 'poker', ids: [0, 1, 2, 3, 4], min: 0, max: 5, title: 'Покер на костях', text: 'Выберите кубики для переброса (один раз) или оставьте как есть.', op: 'pokerReroll', args: {} });
};
STEPS.pokerReroll = (state, step) => {
    const poker = state.poker;
    const p = state.players[poker.seat];
    for (const i of step.ids) poker.a[i] = d6(state);
    poker.rerolledA = step.ids;
    fx(state, { k: 'pokerReroll', who: 'a', idx: step.ids });
    const va = pokerValue(poker.a)[0];
    if (state.solo) {
        const g = SOLO_POKER[va];
        p.gold += g;
        poker.winner = 'a'; poker.reward = g;
        log(state, `${p.name}: ${POKER_NAMES[va]} — +${g} золота`, { kind: 'poker' });
    } else {
        const c = comparePoker(poker.a, poker.b);
        poker.winner = c >= 0 ? 'a' : 'b';
        if (poker.winner === 'a') p.gold += poker.pot;
        log(state, `Покер: ${p.name} — ${POKER_NAMES[va]}, горожане — ${POKER_NAMES[pokerValue(poker.b)[0]]}. ${poker.winner === 'a' ? p.name + ' выигрывает 3 золота' : 'Горожане выигрывают'}`, { kind: 'poker' });
    }
    poker.done = true;
    fx(state, { k: 'pokerEnd', winner: poker.winner });
};
