// Command entry point: apply(state, seat, cmd) validates a player's command against the rules
// and runs the step machine; options(state, seat) lists what that seat may do right now, with
// the reason for everything that is not allowed (the UI shows those reasons on disabled buttons).
import { STEPS, push, run, ask } from './flow.mjs';
import { vtElixirTopError } from './vtoken.mjs';
import { CARDS, LOC, ADJ, MONSTER, log, fx, removeFrom, potionOf, d6 } from './util.mjs';
import { LOC_ACTIONS, LOC_ACTION_TEXT, SKILL_NAME, SCHOOLS, TERRAIN_NAME } from '../data/rules-data.mjs';
import { movePaymentError, canEnter, meditationOptions, SKILL_GEN, autoReroll, comparePoker, pokerValue, POKER_NAMES, SOLO_POKER, gearMoveError } from './turn.mjs';
import { monsterFightError, elixirError, specError, activeEffectError, comboError, bloodError, wlinkError, bombError } from './fight.mjs';
import { duelError } from './duel.mjs';
import { ACTIVE_EFFECTS, hasTrophy, hasWitcherTrophy, hasGear, trainCost, GEAR_MOVES } from './effects.mjs';
import { exploreError, questError, eventComboError, effectSteps } from './explore.mjs';
import { questLabel } from '../data/events-data.mjs';
import './setup.mjs';
import { chaseError, legendFightError } from './legend.mjs';
import { LEGEND } from '../data/legend-data.mjs';

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
    if (state.legend && state.legend.loc === p.loc) { info.err = `${LEGEND[state.legend.mon].name} закрывает действие этой локации — прогоните его`; return info; }
    switch (act.kind) {
        case 'raise': {
            const v = p.skills[act.skill];
            if (v >= 5) info.err = `Навык ${SKILL_GEN[act.skill]} уже 5`;
            else if (v > p.level) info.err = `Навык ${SKILL_GEN[act.skill]} (${v}) выше уровня ведьмака (${p.level})`;
            break;
        }
        case 'school': {
            const home = p.loc === SCHOOLS[p.school].home;
            for (const s of ['combat', 'defense', 'alchemy', 'spec']) {
                const cost = trainCost(p, s);
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
            const okCards = p.hand.filter(h => !CARDS[h].burn && state.row.some(r => r && !CARDS[r].burn && CARDS[r].cost <= CARDS[h].cost + 1));
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
            blood: p.school === 'ciri' ? bloodError(state, p) : undefined,
            wlink: hasWitcherTrophy(p, 'ciri') ? wlinkError(state, p) : undefined,
            bombs: (p.bombs || []).map(id => ({ id, err: bombError(state, p, id) })),
            // Главоглаз II (vulnerability): an elixir for the top card of the discard.
            vulnElixir: state.fight.vt && state.fight.vt.elixirTop ? p.elixirs.map(id => ({ id, err: vtElixirTopError(state, p, id) })) : undefined,
            active: Object.keys(ACTIVE_EFFECTS).filter(k => k.startsWith('W-') ? hasWitcherTrophy(p, k.slice(2)) : ACTIVE_EFFECTS[k].src === 'gear' ? p.gear.includes(k) : hasTrophy(p, k)).map(k => ({ key: k, label: ACTIVE_EFFECTS[k].label, err: activeEffectError(state, p, k) })),
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
    // Выносливость: two moves for one card (the first location is passed through).
    if (p.hand.some(id => CARDS[id].endurance)) {
        for (const n of ADJ[p.loc] || []) {
            if (!canEnter(state, n)) continue;
            for (const m of ADJ[n] || []) {
                if (m === p.loc || !canEnter(state, m) || o.moves.some(x => x.to === m)) continue;
                o.moves.push({ to: m, via: n, terrain: LOC[m].terrain, endurance: true });
            }
        }
    }
    o.loc = locActionInfo(state, p);
    o.gearMoves = Object.keys(GEAR_MOVES).filter(k => k === 'CONT79-16' ? hasGear(p, k) : (p.keeps || []).some(x => x.id === k))
        .map(k => ({ key: k, label: GEAR_MOVES[k].label, err: gearMoveError(state, p, k) }));
    const fe = monsterFightError(state, p);
    const slot = state.slots.find(s => s.mon && s.token === p.loc);
    o.phase2.push({ id: 'fight', label: slot ? `Битва: ${MONSTER[slot.mon].name}` : 'Битва с монстром', err: fe });
    // «Легендарная охота»: the legendary fight and «Прогнать» (phase I).
    if (state.legend) {
        const L = state.legend;
        o.phase2.push({ id: 'legend', label: `Битва: ${LEGEND[L.mon].name} (легендарный)`, err: legendFightError(state, p) });
        o.chase = { err: chaseError(state, p), here: p.loc === L.loc };
    }
    // Битва ведьмаков (p. 20): every other witcher in the location is a possible target.
    if (!state.solo) for (const q of state.players) {
        if (q.seat === p.seat || q.loc !== p.loc) continue;
        o.phase2.push({ id: 'duel-' + q.seat, seat: q.seat, label: `Битва с ведьмаком: ${q.name}`, err: duelError(state, p, q.seat) });
    }
    // Покер с ведьмаком (pp. 13–14): in phase I, after moving into the location.
    o.pokers = state.solo ? [] : state.players.filter(q => q.seat !== p.seat && q.loc === p.loc).map(q => ({ seat: q.seat, label: `Покер с ведьмаком: ${q.name}`, err: witcherPokerError(state, p, q.seat) }));
    const med = meditationOptions(state, p);
    o.phase2.push({ id: 'meditate', label: 'Медитация', err: med.length ? null : 'Нужен навык 5 и свободный трофей за него', trophies: med.map(m => m.id) });
    for (const d of ['city', 'wild']) o.phase2.push({ id: 'explore-' + d, label: d === 'city' ? 'Исследовать город' : 'Исследовать окрестности', err: exploreError(state, p, d) });
    // Phase II is obligatory; when no action is possible here (empty decks, an event forbade
    // exploring, no monster), the player goes to phase III — «as far as possible».
    if (o.phase2.every(x => x.err)) o.phase2.push({ id: 'skipPhase2', label: 'Нет действий фазы II → фаза III', err: null });
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
        if (pr.ui === 'combo') { const ce = eventComboError(ids); if (ce) return err(ce); }
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

/** End of phase I: secret cards, then («Легендарная охота») the ruin token of this location. */
function endPhase1(state, p) {
    push(state, { op: 'trapCheck', seat: p.seat, on: 'endPhase1' });
    if (state.legend) push(state, { op: 'ruinPickup', seat: p.seat });
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
        case 'skipPhase2': {
            const oo = options(state, p.seat);
            if (!oo.phase2.some(x => x.id === 'skipPhase2')) return err('Есть доступное действие фазы II');
            t.phase = 2;
            log(state, `${p.name}: действий фазы II нет — сразу фаза III`);
            push(state, { op: 'phase3' });
            endPhase1(state, p);
            return ok();
        }
        case 'gearMove': {
            const e = gearMoveError(state, p, cmd.key);
            if (e) return err(e);
            push(state, { op: 'gearMoveAsk', seat: p.seat, key: cmd.key });
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
            const via = cmd.via == null ? null : Number(cmd.via);
            if (via != null) {
                if (!(ADJ[p.loc] || []).includes(via) || !(ADJ[via] || []).includes(to) || to === p.loc || !canEnter(state, via) || !canEnter(state, to)) return err('Туда нет дороги');
            } else if (!(ADJ[p.loc] || []).includes(to) || !canEnter(state, to)) return err('Туда нет дороги');
            const cards = Array.isArray(cmd.cards) ? cmd.cards : [];
            const gold = Number(cmd.gold) || 0;
            const e = movePaymentError(state, p, to, cards, gold, via);
            if (e) return err(e);
            for (const id of cards) { removeFrom(p.hand, id); p.discard.push(id); }
            p.gold -= gold;
            const from = p.loc;
            p.loc = to;
            t.moved = true;
            log(state, `${p.name}: ${LOC[from].name} → ${via != null ? LOC[via].name + ' → ' : ''}${LOC[to].name}${via != null ? ' (Выносливость)' : gold ? ' (1 карта + 1 золото)' : cards.length === 2 ? ' (2 карты)' : ''}`, { kind: 'move' });
            if (via != null) { fx(state, { k: 'move', seat: p.seat, from, to: via, cards }); fx(state, { k: 'move', seat: p.seat, from: via, to, cards: [] }); }
            else fx(state, { k: 'move', seat: p.seat, from, to, cards });
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
                case 'poker': mark(); push(state, { op: 'pokerStart', seat: p.seat, vs: 'town', loc: true }); push(state, { op: 'trapCheck', seat: p.seat, on: 'poker' }); break;
                case 'poor': {
                    mark();
                    if (p.gold === 0) { p.gold = 1; log(state, `${p.name}: +1 золото (${LOC[p.loc].name})`); }
                    ask(state, { seat: p.seat, kind: 'cards', from: 'row', ui: 'row', ids: state.row.filter(Boolean), min: 0, max: 2, title: LOC[p.loc].name, text: 'Можно убрать из игры до 2 карт ряда (ряд пополнится).', op: 'locPoorRemove', args: {} });
                    state.undoable = true;
                    break;
                }
                case 'swap': {
                    mark();
                    const okCards = p.hand.filter(h => !CARDS[h].burn && state.row.some(r => r && !CARDS[r].burn && CARDS[r].cost <= CARDS[h].cost + 1));
                    ask(state, { seat: p.seat, kind: 'cards', from: 'hand', ui: 'hand', ids: okCards, min: 1, max: 1, title: 'Обмен карты', text: 'Уберите из игры 1 карту из руки; затем возьмите из ряда карту с напечатанной стоимостью не больше чем на 1 выше.', op: 'locSwapPick', args: { seat: p.seat } });
                    break;
                }
            }
            return ok();
        }
        case 'chase': {
            const e = chaseError(state, p);
            if (e) return err(e);
            push(state, { op: 'chaseAsk', seat: p.seat });
            return ok();
        }
        case 'legend': {
            const e = legendFightError(state, p);
            if (e) return err(e);
            push(state, { op: 'legendFightStart', seat: p.seat });
            endPhase1(state, p);
            return ok();
        }
        case 'fight': {
            const e = monsterFightError(state, p);
            if (e) return err(e);
            push(state, { op: 'fightStart', seat: p.seat });
            endPhase1(state, p);
            return ok();
        }
        case 'duel': {
            const target = Number(cmd.seat);
            const e = duelError(state, p, target);
            if (e) return err(e);
            push(state, { op: 'duelStart', seat: p.seat, target });
            endPhase1(state, p);
            return ok();
        }
        case 'wpoker': {
            const target = Number(cmd.seat);
            const e = witcherPokerError(state, p, target);
            if (e) return err(e);
            (t.pokered = t.pokered || []).push(target);
            push(state, { op: 'pokerStart', seat: p.seat, vs: 'witcher', opp: target });
            return ok();
        }
        case 'meditate': {
            const med = meditationOptions(state, p);
            const tr = med.find(m => m.id === cmd.trophy) || (med.length === 1 ? med[0] : null);
            if (!tr) return err(med.length ? 'Выберите трофей' : 'Медитация недоступна');
            t.phase = 2;
            push(state, { op: 'meditate', seat: p.seat, trophy: tr.id });
            endPhase1(state, p);
            return ok();
        }
        case 'explore': {
            const e = exploreError(state, p, cmd.deck);
            if (e) return err(e);
            t.phase = 2;
            push(state, { op: 'exploreStart', seat: p.seat, deck: cmd.deck });
            endPhase1(state, p);
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
        case 'bomb': { const e = bombError(state, p, cmd.id); if (e) return err(e); f.stage = 'busy'; push(state, { op: 'useBomb', fight: 1, id: cmd.id }); return ok(); }
        case 'spec': { const e = specError(state, p); if (e) return err(e); f.stage = 'busy'; push(state, { op: 'useSpec', fight: 1 }); return ok(); }
        case 'active': { const e = activeEffectError(state, p, cmd.key); if (e) return err(e); f.stage = 'busy'; push(state, { op: 'useActive', fight: 1, key: cmd.key }); return ok(); }
        case 'vulnElixir': { const e = vtElixirTopError(state, p, cmd.id); if (e) return err(e); f.stage = 'busy'; push(state, { op: 'vtElixirTop', fight: 1, id: cmd.id }); return ok(); }
        case 'combo': {
            const ids = Array.isArray(cmd.ids) ? cmd.ids : [];
            const blood = cmd.blood == null ? null : Number(cmd.blood);
            const wlink = cmd.wlink == null ? null : Number(cmd.wlink);
            const e = comboError(state, p, ids, { free: !!cmd.free, blood, wlink });
            if (e) return err(e);
            const mutOff = Array.isArray(cmd.mutOff) ? cmd.mutOff.filter(x => typeof x === 'string') : [];
            push(state, { op: 'playCombo', fight: 1, ids, free: !!cmd.free, links: cmd.links || null, blood, wlink, mutOff, mut8: cmd.mut8 === 'draw' ? 'draw' : 'dmg' });
            return ok();
        }
    }
    return err('Неизвестная команда в битве');
}

// ---------------------------------------------------------------------------------------------
// Dice poker flow (townsfolk; witchers come with the poker milestone)
// ---------------------------------------------------------------------------------------------
const roll5 = (state) => [d6(state), d6(state), d6(state), d6(state), d6(state)];
// step: { seat, vs: 'town' | 'fixed', stake?: n | 'ifGold', bonus?, townRerolls?, soloNoReroll?,
//         dice?, opp?, win?, lose?, card? } — the location action, or an event («Цири и доп.
// события»): poker without the own stake, with an extra townsfolk reroll, against dice printed
// on the card (win only if strictly better; then the event's win/lose effects).
/** Why `p` can't play poker with the witcher at `target` now (pp. 13–14). */
export function witcherPokerError(state, p, target) {
    const q = state.players[target], t = state.turn;
    if (!q || q === p || state.solo) return 'Нет такого ведьмака';
    if (!t || t.seat !== p.seat || t.phase !== 1 || t.afterExplore) return 'Только в фазе I своего хода';
    if (q.loc !== p.loc) return `${q.name} не в вашей локации`;
    if (!t.moved) return 'Сначала переместитесь в локацию (в стартовой — уйдите и вернитесь)';
    if ((t.pokered || []).includes(target)) return `Вы уже играли с ${q.name} в этом ходу`;
    if (p.gold < 1) return 'Нужно хотя бы 1 золото';
    if (q.gold < 1) return `У ${q.name} нет золота`;
    return null;
}
/** Poker with another witcher: both put 1 gold, the bank 1; the opponent rerolls first. */
function witcherPokerStart(state, step) {
    const p = state.players[step.seat], q = state.players[step.opp];
    if (p.gold < 1 || q.gold < 1) { log(state, 'Покер: у кого-то из игроков нет золота', { kind: 'poker' }); return; }
    p.gold -= 1; q.gold -= 1;
    const magic = (x) => !!(x.keeps || []).find(k => k.kind === 'pokerDice');
    state.poker = {
        seat: p.seat, vs: 'witcher', vsSeat: q.seat, opp: q.name, a: roll5(state), b: roll5(state), pot: 3, stake: 1, bonus: 0, done: false, winner: null,
        rerolledB: [], rerolledA: [], rerolls: magic(p) ? 2 : 1, rerollsB: magic(q) ? 2 : 1, magicUsed: false, magicUsedB: false, phase: 'b', card: null, win: null, lose: null, res: '',
    };
    log(state, `${p.name} играет в покер с ведьмаком ${q.name}: по 1 золоту и 1 из запаса`, { kind: 'poker' });
    fx(state, { k: 'pokerRoll', who: 'both' });
    push(state, { op: 'pokerAsk' });
}
STEPS.pokerStart = (state, step) => {
    if (step.vs === 'witcher') { witcherPokerStart(state, step); return; }
    const p = state.players[step.seat];
    const t = state.turn;
    const fixed = step.vs === 'fixed';
    let stake = fixed ? 0 : step.stake === 'ifGold' ? (p.gold >= 1 ? 1 : 0) : step.stake ?? ((t && t.pokerStake) || 1);
    if (t) t.pokerStake = 0;
    if (p.gold < stake) {
        log(state, `${p.name}: нужно ${stake} золота на ставку — играть в покер нельзя`, { kind: 'poker' });
        if (step.loc && t) removeFrom(t.usedLoc, p.loc);
        return;
    }
    p.gold -= stake;
    const town = !fixed && !state.solo;
    const magic = !!(p.keeps || []).find(k => k.kind === 'pokerDice') && !(state.solo && step.soloNoReroll);
    const poker = {
        seat: p.seat, vs: step.vs, opp: fixed ? (step.opp || 'Соперник') : 'Горожане', a: roll5(state), b: fixed ? step.dice.slice() : town ? roll5(state) : null,
        pot: town ? stake + 2 : 0, stake, bonus: step.bonus || 0, done: false, winner: null, rerolledB: [], rerolledA: [],
        rerolls: state.solo && step.soloNoReroll ? 0 : magic ? 2 : 1, magicUsed: false, card: step.card || null, win: step.win || null, lose: step.lose || null, res: '',
    };
    state.poker = poker;
    log(state, fixed ? `${p.name} бросает кубики против ${poker.opp.toLowerCase()}: ${poker.b.join('–')}`
        : state.solo ? `${p.name} играет в покер${stake ? ` (${stake} золото)` : ' без ставки'}`
        : `${p.name} играет в покер с горожанами: ставка ${stake ? stake + ' золото + ' : ''}2 из запаса`, { kind: 'poker' });
    fx(state, { k: 'pokerRoll', who: 'both' });
    if (town) {
        for (let k = 0; k < (step.townRerolls || 1); k++) {
            const rr = autoReroll(poker.b);
            if (!rr.length) break;
            for (const i of rr) poker.b[i] = d6(state);
            poker.rerolledB = rr;
            log(state, `Горожане перебрасывают ${rr.length} куб.: ${POKER_NAMES[pokerValue(poker.b)[0]]}`);
            fx(state, { k: 'pokerReroll', who: 'b', idx: rr });
        }
    }
    push(state, { op: 'pokerAsk' });
};
STEPS.pokerAsk = (state) => {
    const poker = state.poker;
    if (poker.vs === 'witcher' && poker.phase === 'b') {
        // The opponent of the active player rerolls first (p. 14, step 4).
        const q = state.players[poker.vsSeat];
        if (!poker.rerollsB) { poker.phase = 'a'; push(state, { op: 'pokerAsk' }); return; }
        if (q.bot || q.away) {
            const rr = poker.rerolledB.length ? [] : autoReroll(poker.b);
            push(state, { op: 'pokerReroll', side: 'b', ids: rr });
            return;
        }
        const second = poker.rerollsB === 1 && poker.rerolledB.length;
        ask(state, { seat: q.seat, kind: 'dice', ui: 'poker', side: 'b', ids: [0, 1, 2, 3, 4], min: 0, max: 5, title: 'Покер на костях', text: second ? 'Магические кости: можно перебросить ещё раз.' : `Вы перебрасываете первым: выберите кубики (один раз) или оставьте как есть. Затем перебросит ${state.players[poker.seat].name}.`, op: 'pokerReroll', args: { side: 'b' } });
        return;
    }
    if (!poker.rerolls) { push(state, { op: 'pokerEnd' }); return; }
    const pa = state.players[poker.seat];
    if (poker.vs === 'witcher' && (pa.bot || pa.away)) {
        const rr = poker.rerolledA.length ? [] : autoReroll(poker.a);
        push(state, { op: 'pokerReroll', ids: rr });
        return;
    }
    const second = poker.rerolls === 1 && poker.rerolledA.length && (state.players[poker.seat].keeps || []).some(k => k.kind === 'pokerDice');
    ask(state, { seat: poker.seat, kind: 'dice', ui: 'poker', ids: [0, 1, 2, 3, 4], min: 0, max: 5, title: 'Покер на костях', text: second ? 'Магические кости: можно перебросить ещё раз.' : 'Выберите кубики для переброса (один раз) или оставьте как есть.', op: 'pokerReroll', args: {} });
};
STEPS.pokerReroll = (state, step) => {
    const poker = state.poker;
    const ids = (step.ids || []).filter(i => Number.isInteger(i) && i >= 0 && i < 5);
    if (step.side === 'b') {
        if (!ids.length) { poker.rerollsB = 0; push(state, { op: 'pokerAsk' }); return; }
        for (const i of ids) poker.b[i] = d6(state);
        fx(state, { k: 'pokerReroll', who: 'b', idx: ids });
        if (poker.rerolledB.length) poker.magicUsedB = true;
        poker.rerolledB = ids;
        poker.rerollsB -= 1;
        log(state, `${poker.opp} перебрасывает ${ids.length} куб.: ${POKER_NAMES[pokerValue(poker.b)[0]]}`, { kind: 'poker' });
        push(state, { op: 'pokerAsk' });
        return;
    }
    if (!ids.length) { poker.rerolls = 0; push(state, { op: 'pokerAsk' }); return; }
    for (const i of ids) poker.a[i] = d6(state);
    fx(state, { k: 'pokerReroll', who: 'a', idx: ids });
    if (poker.rerolledA.length) poker.magicUsed = true; // the second reroll of the magic dice
    poker.rerolledA = ids;
    poker.rerolls -= 1;
    push(state, { op: 'pokerAsk' });
};
STEPS.pokerEnd = (state) => {
    const poker = state.poker;
    const p = state.players[poker.seat];
    const va = pokerValue(poker.a)[0];
    const steps = [];
    if (poker.vs === 'fixed') {
        poker.winner = comparePoker(poker.a, poker.b) > 0 ? 'a' : 'b';
        poker.res = poker.winner === 'a' ? `${POKER_NAMES[va]} — лучше!` : `${POKER_NAMES[va]} — не лучше`;
        log(state, `Покер: ${p.name} — ${POKER_NAMES[va]}, ${poker.opp.toLowerCase()} — ${POKER_NAMES[pokerValue(poker.b)[0]]}. ${poker.winner === 'a' ? 'Победа' : 'Поражение'}`, { kind: 'poker' });
        const br = poker.winner === 'a' ? poker.win : poker.lose;
        if (br && br.length) steps.push(...effectSteps(p.seat, br, { card: poker.card }));
    } else if (poker.vs === 'witcher') {
        const q = state.players[poker.vsSeat];
        const c = comparePoker(poker.a, poker.b);
        poker.winner = c >= 0 ? 'a' : 'b';
        const w = poker.winner === 'a' ? p : q;
        w.gold += poker.pot;
        poker.res = `${w.name} выигрывает ${poker.pot} золота`;
        log(state, `Покер: ${p.name} — ${POKER_NAMES[va]}, ${q.name} — ${POKER_NAMES[pokerValue(poker.b)[0]]}. ${w.name} забирает ${poker.pot} золота${c === 0 ? ' (полная ничья — в пользу активного игрока)' : ''}`, { kind: 'poker' });
        // Магические кости of the opponent: its extra reroll used and won.
        if (poker.magicUsedB && poker.winner === 'b') {
            const k = (q.keeps || []).find(x => x.kind === 'pokerDice');
            if (k) {
                removeFrom(q.keeps, k);
                log(state, `${q.name}: «${k.name}» сброшены`, { kind: 'explore' });
                if (k.event) steps.push({ op: 'takeEvent', seat: q.seat, id: k.event });
            }
        }
    } else if (state.solo) {
        const g = SOLO_POKER[va];
        p.gold += g;
        poker.winner = g > 0 ? 'a' : 'b'; poker.reward = g;
        const bonus = poker.bonus && g > 0 ? poker.bonus : 0;
        p.gold += bonus;
        poker.res = `${POKER_NAMES[va]}: +${g + bonus} золота`;
        log(state, `${p.name}: ${POKER_NAMES[va]} — +${g} золота${bonus ? ` и +${bonus} (событие)` : ''}`, { kind: 'poker' });
    } else {
        const c = comparePoker(poker.a, poker.b);
        poker.winner = c >= 0 ? 'a' : 'b';
        const bonus = poker.winner === 'a' ? poker.bonus : 0;
        if (poker.winner === 'a') p.gold += poker.pot + bonus;
        poker.res = poker.winner === 'a' ? `${p.name} выигрывает ${poker.pot + bonus} золота` : 'Горожане забирают ставку';
        log(state, `Покер: ${p.name} — ${POKER_NAMES[va]}, горожане — ${POKER_NAMES[pokerValue(poker.b)[0]]}. ${poker.winner === 'a' ? `${p.name} выигрывает ${poker.pot + bonus} золота` : 'Горожане выигрывают'}`, { kind: 'poker' });
    }
    // Магические кости (CITY2-57): the extra reroll used and won — the card goes, event 133 comes.
    if (poker.magicUsed && poker.winner === 'a') {
        const k = (p.keeps || []).find(x => x.kind === 'pokerDice');
        if (k) {
            removeFrom(p.keeps, k);
            log(state, `${p.name}: «${k.name}» сброшены`, { kind: 'explore' });
            if (k.event) steps.push({ op: 'takeEvent', seat: p.seat, id: k.event });
        }
    }
    poker.done = true;
    state.lastPoker = { seat: p.seat, vs: poker.vs === 'fixed' ? 'event' : poker.vs === 'witcher' ? 'witcher' : 'town' };
    if (poker.vs === 'witcher') state.lastPokerB = { seat: poker.vsSeat, vs: 'witcher' };
    fx(state, { k: 'pokerEnd', winner: poker.winner });
    if (steps.length) push(state, ...steps);
};
