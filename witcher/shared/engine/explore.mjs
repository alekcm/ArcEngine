// Exploration, quests and event cards (База.md pp. 16–17, 19). The decks hold every card of
// «Городские события 1» / «События мира 1» whose printed effects are supported (events-data.mjs,
// generated from Witcher/События/*.md). Rules implemented in full:
//   * the top card of the chosen deck shows its intro and options А/Б; an option whose printed
//     cost cannot be paid in full is disabled;
//   * the consequences are shown, then applied «as far as possible»;
//   * every exploration card and numbered event card exists in ONE copy: once resolved it goes
//     back to the box (state.eventsUsed) — nobody can get that encounter again; an empty deck
//     disables that exploration with the reason;
//   * «Задание»: the card stays with the player, a random location token of the terrain is put on
//     it (another terrain if that pile is empty; none left — the card is discarded), or a named
//     location / the player's school; in phase I, at that location (paying the printed cost) the
//     player takes the numbered event card;
//   * equipment / companions are kept for the rest of the game (Кастет is a fight action).
import { STEPS, push, ask, later } from './flow.mjs';
import { LOC, ADJ, CARDS, MONSTER, log, fx, d6, shuffle, clampShield, drawCards, removeFrom, potionOf } from './util.mjs';
import { keepOf } from './effects.mjs';
import { comboTotals, linkIndex } from './fight.mjs';
import { TERRAIN_NAME, SKILL_NAME, SCHOOLS, COLOR_NAME } from '../data/rules-data.mjs';
import { EXPLORE_DECKS, EXP_DECKS, EVENTS, questLabel } from '../data/events-data.mjs';
import { canEnter, refillRow, SKILL_GEN } from './turn.mjs';

export const EXPLORE_READY = true;
const DECK_NAME = { city: 'город', wild: 'окрестности' };
const SKILLS = ['combat', 'defense', 'alchemy', 'spec'];
const COLOR_ADJ = { blue: 'синяя', red: 'красная', green: 'зелёная', purple: 'фиолетовая', yellow: 'жёлтая' };

/** Decks live in the state (hidden: the view shows only counts). Old saves get them lazily. */
export function ensureExplore(state) {
    if (!state.eventsUsed) state.eventsUsed = [];
    if (!state.explore) {
        state.explore = {};
        for (const d of Object.keys(EXPLORE_DECKS)) state.explore[d] = shuffle(state, EXPLORE_DECKS[d].slice());
    }
    // Expansions shuffle their exploration cards in (also into a running game, e.g. a sandbox
    // loaded with the expansion switched on in the lobby).
    for (const x of state.exp || []) {
        if ((state.expDecks || []).includes(x) || !EXP_DECKS[x]) continue;
        for (const d of Object.keys(EXP_DECKS[x])) {
            const add = EXP_DECKS[x][d].filter(id => !state.eventsUsed.includes(id) && !state.explore[d].includes(id));
            state.explore[d] = shuffle(state, [...state.explore[d], ...add]);
        }
        (state.expDecks || (state.expDecks = [])).push(x);
    }
    return state.explore;
}

export function exploreError(state, p, deck) {
    if (deck !== 'city' && deck !== 'wild') return 'Выберите город или окрестности';
    const t = state.turn;
    if (!t || t.seat !== p.seat || t.phase !== 1) return 'Только в свой ход вместо битвы/медитации';
    if (t.afterExplore) return 'Исследование уже было в этот ход';
    if (t.noExplore) return 'Событие запретило исследовать в этот ход';
    const decks = state.explore || EXPLORE_DECKS;
    // A kept card replaces the next exploration (CONT79-29Б, CITY1-33А, CONT79-22Б): no deck card is drawn.
    if (keepOf(p, 'nextExplore')) return null;
    if (!decks[deck].length) return `Колода исследования (${DECK_NAME[deck]}) закончилась: все её карты уже разыграны`;
    return null;
}

/** Why an option cannot be picked (its printed cost), or null. */
export function optionCostError(p, opt) {
    const c = opt.cost;
    if (!c) return null;
    if (c.gold && p.gold < c.gold) return `Нужно ${c.gold} золота`;
    if (c.elixir && p.elixirs.length < c.elixir) return `Нужно эликсиров: ${c.elixir}`;
    if (c.color && !p.hand.some(id => CARDS[id].color === c.color)) return `Нужна ${COLOR_ADJ[c.color]} карта в руке (${COLOR_NAME[c.color].toLowerCase()})`;
    return null;
}

/** «Прочитать» a card with options А/Б: shared by exploration and numbered event cards. */
function askChoose(state, p, id, title, extra) {
    const ev = EVENTS[id];
    ask(state, {
        seat: p.seat, kind: 'choice', ui: 'event', stage: 'choose', card: id, title,
        options: ['a', 'b'].map(k => {
            const e = optionCostError(p, ev[k]);
            return { id: k, label: `${k === 'a' ? 'А' : 'Б'}. ${ev[k].label}`, disabled: !!e, hint: e || undefined };
        }),
        op: 'exploreChoice', args: { seat: p.seat, id, ...extra },
    });
}

STEPS.exploreStart = (state, step) => {
    const p = state.players[step.seat];
    const decks = ensureExplore(state);
    const k = keepOf(p, 'nextExplore');
    if (k) {
        removeFrom(p.keeps, k);
        log(state, `${p.name} сбрасывает карту «${k.name}»: это происходит вместо обычного исследования`, { kind: 'explore' });
        fx(state, { k: 'explore', seat: p.seat, deck: step.deck, id: k.card });
        push(state,
            ...(k.gold ? [{ op: 'eventFx', seat: p.seat, e: { gold: k.gold }, card: k.card }] : []),
            ...(k.event ? [{ op: 'takeEvent', seat: p.seat, id: k.event }] : []),
            { op: 'exploreDone', seat: p.seat, id: k.card, explore: true });
        return;
    }
    const id = decks[step.deck].shift();
    log(state, `${p.name} исследует ${DECK_NAME[step.deck]} (${LOC[p.loc].name})`, { kind: 'explore' });
    fx(state, { k: 'explore', seat: p.seat, deck: step.deck, id });
    // A few expansion cards have no choice at all (CITY2-47, CITY2-50): read, then resolve.
    if (!EVENTS[id].a) {
        ask(state, { seat: p.seat, kind: 'choice', ui: 'event', stage: 'event', card: id, title: `Исследование: ${DECK_NAME[step.deck]}`, options: [{ id: 'ok', label: 'Продолжить' }], op: 'explorePlain', args: { seat: p.seat, id, deck: step.deck } });
        return;
    }
    askChoose(state, p, id, `Исследование: ${DECK_NAME[step.deck]}`, { deck: step.deck, explore: true });
};
STEPS.explorePlain = (state, step) => {
    push(state, ...effectSteps(step.seat, EVENTS[step.id].fx, { card: step.id }), { op: 'exploreDone', seat: step.seat, id: step.id, explore: true });
};

STEPS.exploreChoice = (state, step) => {
    const p = state.players[step.seat];
    const ev = EVENTS[step.id];
    const opt = ev[step.choice];
    const c = opt.cost || {};
    if (c.gold) p.gold -= c.gold;
    log(state, `${p.name} выбирает ${step.choice === 'a' ? 'А' : 'Б'}: «${opt.label}»`, { kind: 'explore' });
    // Costs paid with a chosen elixir / card of the hand (printed in the option line).
    const args = { seat: p.seat, id: step.id, deck: step.deck, explore: step.explore, choice2: step.choice };
    if (c.elixir) {
        if (p.elixirs.length <= c.elixir) { push(state, { op: 'explorePay', ...args, from: 'elixirs', ids: p.elixirs.slice(0, c.elixir) }); return; }
        ask(state, { seat: p.seat, kind: 'cards', from: 'elixirs', ids: p.elixirs.slice(), min: c.elixir, max: c.elixir, title: 'Оплата', text: `Сбросьте ${c.elixir} эликсир(а).`, op: 'explorePay', args: { ...args, from: 'elixirs' } });
        return;
    }
    if (c.color || c.card) {
        const ids = p.hand.filter(id => !c.color || CARDS[id].color === c.color);
        if (!ids.length) { push(state, { op: 'exploreOutcome', ...args }); return; }
        if (ids.length === 1) { push(state, { op: 'explorePay', ...args, from: 'hand', ids }); return; }
        ask(state, { seat: p.seat, kind: 'cards', from: 'hand', ui: 'hand', ids, min: 1, max: 1, title: 'Оплата', text: c.color ? `Сбросьте 1 ${COLOR_ADJ[c.color].replace(/ая$/, 'ую')} карту из руки (${COLOR_NAME[c.color].toLowerCase()}).` : 'Сбросьте 1 карту из руки.', op: 'explorePay', args: { ...args, from: 'hand' } });
        return;
    }
    push(state, { op: 'exploreOutcome', ...args });
};
STEPS.explorePay = (state, step) => {
    const p = state.players[step.seat];
    for (const id of step.ids || []) {
        if (step.from === 'elixirs') { if (removeFrom(p.elixirs, id)) state.elixirDiscard.push(id); }
        else if (removeFrom(p.hand, id)) p.discard.push(id);
    }
    if ((step.ids || []).length) log(state, step.from === 'elixirs' ? `${p.name} сбрасывает эликсир: ${step.ids.map(id => potionOf(id).name).join(', ')}` : `${p.name} сбрасывает «${step.ids.map(id => CARDS[id].name).join('», «')}»`);
    push(state, { op: 'exploreOutcome', seat: step.seat, id: step.id, deck: step.deck, explore: step.explore, choice2: step.choice2 });
};
STEPS.exploreOutcome = (state, step) => {
    const p = state.players[step.seat];
    const opt = EVENTS[step.id][step.choice2];
    step = { ...step, choice: step.choice2 };
    ask(state, {
        seat: p.seat, kind: 'choice', ui: 'event', stage: 'outcome', pick: step.choice, card: step.id, title: 'Последствия', effect: opt.effect,
        options: [{ id: 'ok', label: 'Продолжить' }], op: 'exploreApply', args: { seat: p.seat, id: step.id, deck: step.deck, explore: step.explore, pick: step.choice },
    });
};

STEPS.exploreApply = (state, step) => {
    const p = state.players[step.seat];
    const opt = EVENTS[step.id][step.pick];
    push(state, ...effectSteps(p.seat, opt.fx, { card: step.id }), { op: 'exploreDone', seat: p.seat, id: step.id, explore: step.explore });
};

STEPS.exploreDone = (state, step) => {
    const p = state.players[step.seat];
    ensureExplore(state);
    // One copy of every card: it leaves the game, unless it stays with the player as a quest.
    if (!p.quests.some(q => q.id === step.id)) used(state, step.id);
    if (step.explore && state.turn && state.turn.phase === 2 && !state.turn.afterExplore && !state.turn.p3queued) { state.turn.p3queued = true; push(state, { op: 'phase3' }); }
};
function used(state, id) {
    if (!state.eventsUsed) state.eventsUsed = [];
    if (!state.eventsUsed.includes(id)) state.eventsUsed.push(id);
}

/** Effect list → steps (applied in order, each «as far as possible»). */
export function effectSteps(seat, list, ctx = {}) {
    return (list || []).map(e => ({ op: 'eventFx', seat, e, card: ctx.card }));
}

STEPS.eventFx = (state, step) => {
    const p = state.players[step.seat];
    const e = step.e;
    const t = state.turn;
    if (e.gold) {
        const before = p.gold;
        p.gold = Math.max(0, p.gold + e.gold);
        const d = p.gold - before;
        if (d) { log(state, `${p.name}: ${d > 0 ? '+' : '−'}${Math.abs(d)} золота`); fx(state, { k: 'gold', seat: p.seat, n: d }); }
        else if (e.gold < 0) log(state, `${p.name}: золота нет — сбрасывать нечего`);
    }
    if (e.skill) {
        // CONT79-43: «если этот навык уже на максимальном уровне — увеличьте любой».
        if (e.orAny && SKILLS.includes(e.skill) && p.skills[e.skill] >= 5) { log(state, `${p.name}: навык ${SKILL_GEN[e.skill]} уже 5 — вместо него любой навык`); push(state, { op: 'eventSkillPick', seat: p.seat, mode: 'any', left: 1, done: [] }); }
        else if (SKILLS.includes(e.skill)) push(state, { op: 'raiseSkill', seat: p.seat, skill: e.skill, why: 'событие' });
        else push(state, { op: 'eventSkillPick', seat: p.seat, mode: e.skill === 'any' ? 'any' : 'lowest', left: e.skill === 'lowest2' ? 2 : 1, done: [] });
    }
    if (e.skillDown) push(state, { op: 'lowerSkill', seat: p.seat, skill: e.skillDown });
    if (e.draw && t && t.seat !== p.seat) {
        // Not this player's turn (event 133 read to the opponent after witcher poker): its next phase III.
        p.drawLater = (p.drawLater || 0) + e.draw;
        log(state, `${p.name}: в свою следующую фазу III ${e.draw > 0 ? 'на ' + e.draw + ' карт(у) больше' : 'на ' + -e.draw + ' карт(у) меньше'}`);
    } else if (e.draw && t) {
        t.drawDelta += e.draw;
        log(state, `${p.name}: в фазе III ${e.draw > 0 ? 'на ' + e.draw + ' карт(у) больше' : 'на ' + -e.draw + ' карт(у) меньше'}`);
    }
    if (e.drawNow) { const n = drawCards(state, p, e.drawNow); log(state, `${p.name} берёт ${n} карт(ы) из колоды`); }
    if (e.discardHand) push(state, { op: 'eventDiscardHand', seat: p.seat, n: e.discardHand });
    if (e.shield) {
        const before = p.shield;
        p.shield = Math.max(0, p.shield + e.shield);
        clampShield(state, p);
        log(state, `${p.name}: щит ${before} → ${p.shield}`);
    }
    if (e.elixir) push(state, { op: 'gainElixir', seat: p.seat, n: e.elixir, why: 'событие', noLimit: !!e.noLimit });
    if (e.elixirLoss) push(state, { op: 'eventElixirLoss', seat: p.seat, n: e.elixirLoss });
    if (e.track) push(state, { op: e.track === 'all' ? 'eventTrackAll' : 'eventTrackAsk', seat: p.seat });
    if (e.removeCard) push(state, { op: 'eventRemoveAsk', seat: p.seat });
    if (e.rowCard) push(state, { op: 'eventRowCard', seat: p.seat, cost: e.rowCard.cost, leftmost: !!e.rowCard.leftmost });
    if (e.noExplore && t) { t.noExplore = true; log(state, `${p.name}: в этот ход исследовать нельзя`); }
    if (e.toPhase3 && t && t.phase === 1 && !t.p3queued) {
        // From a quest in phase I: the rest of the turn is skipped.
        t.phase = 2; t.afterExplore = false; t.p3queued = true;
        log(state, `${p.name} сразу переходит к фазе III`);
        later(state, { op: 'phase3' });
    }
    if (e.gear) {
        const holder = state.players.find(x => x.gear.includes(e.gear));
        if (holder) log(state, `Карта «${EVENTS[e.gear].name}» уже у игрока ${holder.name} — взять её нельзя`);
        else {
            p.gear.push(e.gear);
            used(state, e.gear);
            log(state, `${p.name} получает ${(EVENTS[e.gear].kind || 'снаряжение').toLowerCase()} «${EVENTS[e.gear].name}»`, { kind: 'explore' });
            fx(state, { k: 'gear', seat: p.seat, id: e.gear });
        }
    }
    if (e.gear === 'CONT79-16' && p.gear.includes('CONT79-16') && t && t.phase === 1 && !t.p3queued) push(state, { op: 'eventFx', seat: p.seat, e: { toPhase3: true } });
    if (e.keep) {
        if (!p.keeps) p.keeps = [];
        p.keeps.push({ ...e.keep });
        log(state, `${p.name} кладёт перед собой карту «${e.keep.name}»: ${e.keep.text}`, { kind: 'explore' });
        fx(state, { k: 'keep', seat: p.seat, id: e.keep.card, name: e.keep.name });
    }
    if (e.dropGear) {
        const i = p.gear.indexOf(e.dropGear);
        if (i >= 0) { p.gear.splice(i, 1); log(state, `${p.name} сбрасывает карту «${EVENTS[e.dropGear].name}»`, { kind: 'explore' }); }
    }
    if (e.event) push(state, { op: 'takeEvent', seat: p.seat, id: e.event });
    if (e.quest) push(state, { op: 'questStart', seat: p.seat, id: step.card, q: e.quest });
    if (e.freeMove) {
        const range = e.freeMove === true ? 1 : e.freeMove;
        const opts = within(state, p.loc, range).map(n => ({ id: String(n), label: LOC[n].name, hint: TERRAIN_NAME[LOC[n].terrain] }));
        const text = range === 1 ? 'Переместитесь в соседнюю локацию, не сбрасывая карты. Затем можете выполнить её действие.' : `Переместитесь на расстояние до ${range} локаций, не сбрасывая карты. Затем можете выполнить действие локации.`;
        if (opts.length) ask(state, { seat: p.seat, kind: 'choice', ui: 'move', title: 'Перемещение', text, options: opts, op: 'exploreMove', args: { seat: p.seat } });
    }
    if (e.buyDiscount && t) { t.buyDiscount = (t.buyDiscount || 0) + e.buyDiscount; log(state, `${p.name}: в фазе III этого хода карта из ряда дешевле на ${e.buyDiscount}`); }
    if (e.elixirTo) {
        const n = e.elixirTo - p.elixirs.length;
        if (n > 0) push(state, { op: 'gainElixir', seat: p.seat, n, why: 'событие', noLimit: !!e.noLimit });
        else log(state, `${p.name}: эликсиров уже ${p.elixirs.length}`);
    }
    if (e.trap) push(state, { op: 'trapPlace', seat: p.seat, trap: e.trap, card: step.card });
    if (e.trapStay) { const c = (state.trapCtx || []).at(-1); if (c) c.stay = true; }
    if (e.poker) push(state, { op: 'pokerStart', seat: p.seat, vs: e.poker.dice ? 'fixed' : 'town', card: step.card, ...e.poker });
    if (e.pokerStake && t) { t.pokerStake = e.pokerStake; log(state, `${p.name}: ставка в этой игре — ${e.pokerStake} золота`); }
    if (e.noShieldRestore && state.lastFight && state.lastFight.seat === p.seat && state.lastFight.shield != null) {
        p.shield = Math.min(p.shield, state.lastFight.shield);
        log(state, `${p.name}: щит не восстанавливается — ${p.shield}`);
    }
    if (e.fightGold && state.fight) { state.fight.bonusGold = (state.fight.bonusGold || 0) + e.fightGold; }
    if (e.secret) {
        if (state.eventsUsed.includes(e.secret)) log(state, `Событие ${EVENTS[e.secret].num} уже в игре — взять его нельзя`);
        else {
            used(state, e.secret);
            (p.secrets || (p.secrets = [])).push(e.secret);
            log(state, `${p.name} берёт событие ${EVENTS[e.secret].num} в закрытую`, { kind: 'explore' });
            fx(state, { k: 'secret', seat: p.seat });
        }
    }
    if (e.if) {
        const c = e.if;
        const okc = (c.goldMax == null || p.gold <= c.goldMax) && (c.elixirMax == null || p.elixirs.length <= c.elixirMax)
            && (c.shieldMax == null || p.shield <= c.shieldMax) && (c.trophiesMax == null || p.trophies.length <= c.trophiesMax)
            && (c.ownSchool == null || (p.loc === SCHOOLS[p.school].home) === c.ownSchool)
            && (c.pokerVs == null || ((state.lastPoker && state.lastPoker.seat === p.seat ? state.lastPoker.vs : state.lastPokerB && state.lastPokerB.seat === p.seat ? state.lastPokerB.vs : 'town') === c.pokerVs));
        log(state, `${p.name}: условие ${okc ? 'выполнено' : 'не выполнено'}`);
        push(state, ...effectSteps(p.seat, okc ? e.fx : e.else, { card: step.card }));
    }
    if (e.freeBuy && t) { t.freeBuy = true; log(state, `${p.name}: в фазе III этого хода карта из ряда — бесплатно`); }
    if (e.roll && e.by === 'elixirs') { push(state, { op: 'eventElixirTableAsk', seat: p.seat, card: step.card, e }); return; }
    if (e.roll && e.by === 'combo') {
        // «Возьмите N карт из своей колоды и немедленно разыграйте комбинацию» — then the table by damage.
        const n = drawCards(state, p, e.comboDraw);
        log(state, `${p.name} берёт ${n} карт(ы) и разыгрывает комбинацию`, { kind: 'explore' });
        push(state, { op: 'eventComboAsk', seat: p.seat, card: step.card, e });
        return;
    }
    if (e.roll) {
        let r, show;
        if (e.x2) {
            // «Умножьте уровень навыка на 2, затем бросьте кубик и прибавьте» (CONT79-36/48/55).
            const die = d6(state); fx(state, { k: 'd6', v: die, seat: p.seat });
            r = p.skills[e.by] * 2 + die;
            log(state, `${p.name}: навык ${SKILL_GEN[e.by]} ${p.skills[e.by]} × 2 + кубик ${die} = ${r}`, { kind: 'explore' });
            show = { op: 'eventRollShow', seat: p.seat, r, card: step.card, by: e.by, x2: p.skills[e.by], die };
        } else {
            if (!e.by) { r = d6(state); fx(state, { k: 'd6', v: r, seat: p.seat }); log(state, `${p.name} бросает кубик: ${r}`, { kind: 'explore' }); }
            else { r = e.by === 'level' ? p.level : p.skills[e.by]; log(state, `${p.name}: ${e.by === 'level' ? 'уровень ведьмака' : 'навык ' + SKILL_GEN[e.by]} ${r}`, { kind: 'explore' }); }
            show = { op: 'eventRollShow', seat: p.seat, r, card: step.card, by: e.by || null };
        }
        const br = e.roll.find(b => r >= b.from && r <= b.to) || (r < e.roll[0].from ? e.roll[0] : e.roll[e.roll.length - 1]);
        push(state, show, ...effectSteps(p.seat, br.fx, { card: step.card }));
    }
};
/** Locations reachable within `range` steps (not stopping on the way), the start excluded. */
function within(state, from, range) {
    const seen = new Set([from]);
    let front = [from];
    for (let i = 0; i < range; i++) {
        const next = [];
        for (const a of front) for (const n of ADJ[a] || []) if (!seen.has(n) && canEnter(state, n)) { seen.add(n); next.push(n); }
        front = next;
    }
    seen.delete(from);
    return [...seen].sort((a, b) => a - b);
}
// «Сбросьте любое количество эликсиров (но не менее 1, если можете). Затем — по количеству» (CONT80-34).
STEPS.eventElixirTableAsk = (state, step) => {
    const p = state.players[step.seat];
    if (!p.elixirs.length) { push(state, { op: 'eventElixirTableDo', seat: p.seat, card: step.card, e: step.e, ids: [] }); return; }
    ask(state, { seat: p.seat, kind: 'cards', from: 'elixirs', ids: p.elixirs.slice(), min: 1, max: p.elixirs.length, card: step.card, title: 'Сброс эликсиров', text: 'Сбросьте любое количество эликсиров (не менее 1). Эффект — по числу сброшенных.', op: 'eventElixirTableDo', args: { seat: p.seat, card: step.card, e: step.e } });
};
STEPS.eventElixirTableDo = (state, step) => {
    const p = state.players[step.seat];
    for (const id of step.ids) if (removeFrom(p.elixirs, id)) state.elixirDiscard.push(id);
    const r = step.ids.length;
    log(state, `${p.name} сбрасывает эликсиров: ${r}`, { kind: 'explore' });
    const br = step.e.roll.find(b => r >= b.from && r <= b.to) || step.e.roll[step.e.roll.length - 1];
    push(state, { op: 'eventRollShow', seat: p.seat, r, card: step.card, by: 'elixirs' }, ...effectSteps(p.seat, br.fx, { card: step.card }));
};
STEPS.eventComboAsk = (state, step) => {
    const p = state.players[step.seat];
    if (!p.hand.length) { push(state, { op: 'eventComboDo', seat: p.seat, card: step.card, e: step.e, ids: [] }); return; }
    ask(state, {
        seat: p.seat, kind: 'cards', from: 'hand', ui: 'combo', ids: p.hand.slice(), min: 1, max: p.hand.length, card: step.card,
        title: 'Комбинация', text: 'Разыграйте комбинацию из руки: выбирайте карты по порядку, каждая следующая — по цвету связи предыдущей. Применяются только щиты и урон.',
        op: 'eventComboDo', args: { seat: p.seat, card: step.card, e: step.e },
    });
};
STEPS.eventComboDo = (state, step) => {
    const p = state.players[step.seat];
    const ids = step.ids || [];
    const t = comboTotals(state, p, ids);
    for (const id of ids) removeFrom(p.hand, id);
    p.discard.push(...ids);
    if (ids.length) log(state, `${p.name} разыгрывает комбинацию: ${ids.map(id => '«' + CARDS[id].name + '»').join(' → ')} — урон ${t.dmg}, щит +${t.shield}`, { kind: 'combo' });
    fx(state, { k: 'combo', seat: p.seat, ids });
    if (t.shield) { p.shield += t.shield; clampShield(state, p); }
    const r = t.dmg, e = step.e;
    const br = e.roll.find(b => r >= b.from && r <= b.to) || e.roll[e.roll.length - 1];
    push(state, { op: 'eventRollShow', seat: p.seat, r, card: step.card, by: 'combo' }, ...effectSteps(p.seat, br.fx, { card: step.card }));
};
/** Why `ids` (in order) is not a chain of links, or null (event combos outside a fight). */
export function eventComboError(ids) {
    for (let i = 1; i < ids.length; i++) {
        const prev = CARDS[ids[i - 1]], next = CARDS[ids[i]];
        if (linkIndex(prev, next) < 0) return `«${next.name}» не соединяется с «${prev.name}»`;
    }
    return null;
}
STEPS.eventRollShow = (state, step) => {
    const title = step.by === 'combo' ? `Урон комбинации: ${step.r}` : step.by === 'elixirs' ? `Сброшено эликсиров: ${step.r}` : step.x2 != null ? `${SKILL_NAME[step.by]} ${step.x2} × 2 + кубик ${step.die} = ${step.r}` : !step.by ? `Бросок кубика: ${step.r}` : step.by === 'level' ? `Уровень ведьмака: ${step.r}` : `Навык ${SKILL_GEN[step.by]}: ${step.r}`;
    ask(state, { seat: step.seat, kind: 'choice', ui: 'event', stage: 'roll', card: step.card, title, dice: step.x2 != null ? step.die : step.r, sum: step.x2 != null ? step.r : undefined, rollKind: step.by === 'combo' || step.by === 'elixirs' ? step.by : undefined, options: [{ id: 'ok', label: 'Продолжить' }], op: 'noop', args: {} });
};
STEPS.noop = () => {};

// ---- effect helpers ------------------------------------------------------------------------------
/** «Увеличьте навык наименьшего уровня / любой навык»: a choice only when there is a real tie. */
STEPS.eventSkillPick = (state, step) => {
    const p = state.players[step.seat];
    const open = SKILLS.filter(s => p.skills[s] < 5 && !step.done.includes(s));
    if (!open.length || step.left <= 0) return;
    let cand = open;
    if (step.mode === 'lowest') { const lo = Math.min(...open.map(s => p.skills[s])); cand = open.filter(s => p.skills[s] === lo); }
    if (cand.length === 1) { push(state, { op: 'eventSkillDo', seat: p.seat, choice: cand[0], mode: step.mode, left: step.left, done: step.done }); return; }
    ask(state, {
        seat: p.seat, kind: 'choice', title: step.mode === 'lowest' ? 'Навык наименьшего уровня' : 'Любой навык',
        text: 'Выберите навык, который повышается на 1.',
        options: cand.map(s => ({ id: s, label: `${SKILL_NAME[s]} ${p.skills[s]} → ${p.skills[s] + 1}` })),
        op: 'eventSkillDo', args: { seat: p.seat, mode: step.mode, left: step.left, done: step.done },
    });
};
STEPS.eventSkillDo = (state, step) => {
    push(state, { op: 'raiseSkill', seat: step.seat, skill: step.choice, why: 'событие' },
        { op: 'eventSkillPick', seat: step.seat, mode: step.mode, left: step.left - 1, done: [...step.done, step.choice] });
};

STEPS.eventDiscardHand = (state, step) => {
    const p = state.players[step.seat];
    const n = Math.min(step.n, p.hand.length);
    if (!n) { log(state, `${p.name}: рука пуста — сбрасывать нечего`); return; }
    if (n === p.hand.length) { push(state, { op: 'eventDiscardDo', seat: p.seat, ids: p.hand.slice() }); return; }
    ask(state, { seat: p.seat, kind: 'cards', from: 'hand', ui: 'hand', ids: p.hand.slice(), min: n, max: n, title: 'Сброс', text: `Сбросьте ${n} карт(у) из руки.`, op: 'eventDiscardDo', args: { seat: p.seat } });
};
STEPS.eventDiscardDo = (state, step) => {
    const p = state.players[step.seat];
    for (const id of step.ids) if (removeFrom(p.hand, id)) p.discard.push(id);
    log(state, `${p.name} сбрасывает ${step.ids.length} карт(у) из руки`);
};

STEPS.eventElixirLoss = (state, step) => {
    const p = state.players[step.seat];
    if (!p.elixirs.length) { log(state, `${p.name}: эликсиров нет — сбрасывать нечего`); return; }
    if (step.n >= p.elixirs.length) { push(state, { op: 'eventElixirDo', seat: p.seat, ids: p.elixirs.slice() }); return; }
    ask(state, { seat: p.seat, kind: 'cards', from: 'elixirs', ids: p.elixirs.slice(), min: step.n, max: step.n, title: 'Сброс эликсиров', text: `Сбросьте ${step.n} эликсир(а).`, op: 'eventElixirDo', args: { seat: p.seat } });
};
STEPS.eventElixirDo = (state, step) => {
    const p = state.players[step.seat];
    for (const id of step.ids) if (removeFrom(p.elixirs, id)) state.elixirDiscard.push(id);
    log(state, `${p.name} сбрасывает эликсиры: ${step.ids.map(id => potionOf(id).name).join(', ')}`);
};

/** Track token (База.md p. 19): a monster on the board you have no token for; a random location token of its terrain. */
function trackChoices(state, p) {
    return state.slots.map((s, i) => ({ s, i })).filter(({ s }) => s.mon && p.trackTokens[s.terrain] == null && state.locPiles[s.terrain].length);
}
function giveTrack(state, p, terrain) {
    p.trackTokens[terrain] = state.locPiles[terrain].pop();
    const h = p.hunts.findIndex(x => x.terrain === terrain);
    if (h >= 0) { const hunt = p.hunts.splice(h, 1)[0]; state.locPiles[terrain].push(hunt.loc); shuffle(state, state.locPiles[terrain]); }
    log(state, `${p.name} получает жетон следа (${TERRAIN_NAME[terrain].toLowerCase()})`, { kind: 'explore' });
    fx(state, { k: 'track', seat: p.seat, terrain });
}
STEPS.eventTrackAsk = (state, step) => {
    const p = state.players[step.seat];
    const ch = trackChoices(state, p);
    if (!ch.length) { log(state, `${p.name}: жетон следа взять не для кого`); return; }
    if (ch.length === 1) { giveTrack(state, p, ch[0].s.terrain); return; }
    ask(state, {
        seat: p.seat, kind: 'choice', title: 'Жетон следа', text: 'Выберите монстра, для которого берёте жетон следа: в битве с ним вы ходите первым.',
        options: ch.map(({ s, i }) => ({ id: String(i), label: `${MONSTER[s.mon].name} (${TERRAIN_NAME[s.terrain].toLowerCase()}, ${LOC[s.token].name})` })),
        op: 'eventTrackDo', args: { seat: p.seat },
    });
};
STEPS.eventTrackDo = (state, step) => { const p = state.players[step.seat]; giveTrack(state, p, state.slots[Number(step.choice)].terrain); };
STEPS.eventTrackAll = (state, step) => {
    const p = state.players[step.seat];
    const ch = trackChoices(state, p);
    if (!ch.length) log(state, `${p.name}: новых жетонов следа нет`);
    for (const { s } of ch) if (p.trackTokens[s.terrain] == null) giveTrack(state, p, s.terrain);
};

/** «Уберите 1 свою карту из игры» — from hand, deck (then shuffled) or discard (База.md p. 19). */
STEPS.eventRemoveAsk = (state, step) => {
    const p = state.players[step.seat];
    const all = [...p.hand, ...p.deck, ...p.discard];
    if (!all.length) return;
    ask(state, { seat: p.seat, kind: 'cards', from: 'own', ids: all, min: 1, max: 1, title: 'Убрать карту из игры', text: 'Уберите из игры 1 свою карту (из руки, колоды или сброса).', op: 'eventRemoveDo', args: { seat: p.seat } });
};
STEPS.eventRemoveDo = (state, step) => {
    const p = state.players[step.seat];
    const id = step.ids[0];
    if (removeFrom(p.hand, id) || removeFrom(p.discard, id)) { /* removed */ } else if (removeFrom(p.deck, id)) shuffle(state, p.deck);
    p.removed.push(id);
    log(state, `${p.name} убирает из игры «${CARDS[id].name}»`);
    fx(state, { k: 'remove', seat: p.seat, id });
};

/** A row card of the printed cost (without slot modifiers) into the discard, free (База.md p. 19). */
STEPS.eventRowCard = (state, step) => {
    const p = state.players[step.seat];
    const fit = (id) => id && (step.cost == null || CARDS[id].cost === step.cost);
    let cand = state.row.filter(fit);
    if (step.leftmost && cand.length) cand = [cand[0]];
    if (!cand.length) {
        const revealed = [];
        let got = null;
        while (state.actionDeck.length) { const id = state.actionDeck.shift(); if (fit(id)) { got = id; break; } revealed.push(id); }
        state.actionDeck.push(...revealed);
        shuffle(state, state.actionDeck);
        if (got) { p.discard.push(got); log(state, `${p.name} берёт «${CARDS[got].name}» из колоды карт действий в сброс`); fx(state, { k: 'gain', seat: p.seat, id: got, to: 'discard' }); }
        else log(state, `${p.name}: подходящей карты нет`);
        return;
    }
    if (cand.length === 1 || p.bot) { push(state, { op: 'eventRowDo', seat: p.seat, ids: [cand[0]] }); return; }
    ask(state, { seat: p.seat, kind: 'cards', from: 'row', ids: cand, min: 1, max: 1, title: step.cost == null ? 'Карта из ряда' : `Карта стоимости ${step.cost}`, text: 'Возьмите карту из ряда в свой сброс (бесплатно).', op: 'eventRowDo', args: { seat: p.seat } });
};
STEPS.eventRowDo = (state, step) => {
    const p = state.players[step.seat];
    const id = step.ids[0];
    const i = state.row.indexOf(id);
    if (i >= 0) state.row[i] = null;
    p.discard.push(id);
    fx(state, { k: 'gain', seat: p.seat, id, to: 'discard' });
    log(state, `${p.name} берёт «${CARDS[id].name}» из ряда в сброс`);
    refillRow(state);
};

STEPS.exploreMove = (state, step) => {
    const p = state.players[step.seat];
    const to = Number(step.choice);
    const from = p.loc;
    p.loc = to;
    const t = state.turn;
    // In phase I (a quest, a sprung quest token) the turn just goes on from the new location;
    // after an exploration — back to a phase-I-like window: only the location action, then phase III.
    if (t.phase === 1 && !t.afterExplore) t.moved = true;
    else { t.phase = 1; t.moved = true; t.afterExplore = true; }
    log(state, `${p.name}: ${LOC[from].name} → ${LOC[to].name} (событие, без сброса карт)`, { kind: 'move' });
    fx(state, { k: 'move', seat: p.seat, from, to, cards: [] });
    push(state, { op: 'arrive', seat: p.seat });
};

// ---- numbered event cards ---------------------------------------------------------------------------
/** Take numbered event card `id` (from a quest or «Возьмите событие N»): story, choice or equipment. */
STEPS.takeEvent = (state, step) => {
    const p = state.players[step.seat];
    const ev = EVENTS[step.id];
    ensureExplore(state);
    if (!ev) return;
    if (state.eventsUsed.includes(step.id) && !ev.gear) { log(state, `Событие ${ev.num} уже разыграно — его больше нет в игре`); return; }
    fx(state, { k: 'questDone', seat: p.seat, id: step.id });
    if (ev.gear) { push(state, { op: 'eventFx', seat: p.seat, e: { gear: step.id } }); return; }
    log(state, `${p.name} берёт событие ${ev.num}`, { kind: 'explore' });
    if (ev.a) { askChoose(state, p, step.id, `Событие ${ev.num}`, {}); return; }
    ask(state, { seat: p.seat, kind: 'choice', ui: 'event', stage: 'event', card: step.id, title: `Событие ${ev.num}`, options: [{ id: 'ok', label: 'Продолжить' }], op: 'eventApply', args: { seat: p.seat, id: step.id } });
};
STEPS.eventApply = (state, step) => {
    used(state, step.id);
    push(state, ...effectSteps(step.seat, EVENTS[step.id].fx, { card: step.id }));
};

// ---- quests ------------------------------------------------------------------------------------
STEPS.questStart = (state, step) => {
    const p = state.players[step.seat];
    const q = step.q;
    let loc, terrain = null;
    if (q.loc) loc = q.loc;
    else if (q.school) loc = SCHOOLS[p.school].home;
    else {
        terrain = q.terrain;
        if (!state.locPiles[terrain].length) terrain = Object.keys(state.locPiles).find(k => state.locPiles[k].length);
        if (!terrain) { log(state, `${p.name}: жетоны локаций закончились — задание не может быть начато`); return; }
        loc = state.locPiles[terrain].pop();
    }
    // «Локация вашей школы или школы другого игрока»: any school of the table.
    const locs = q.school === 'any' ? [...new Set(state.players.map(x => SCHOOLS[x.school].home))] : null;
    p.quests.push({ id: step.id, terrain, loc, event: q.event, gold: q.gold || 0, ...(locs && locs.length > 1 ? { locs } : {}) });
    log(state, `${p.name} получает задание «${questLabel({ id: step.id })}»: ${LOC[loc].name}${terrain ? ' (' + TERRAIN_NAME[terrain].toLowerCase() + ')' : ''}`, { kind: 'explore' });
    fx(state, { k: 'quest', seat: p.seat, loc });
};

/** Why quest #i cannot be completed now, or null. */
export function questError(state, p, i) {
    const q = p.quests[i];
    const t = state.turn;
    if (!q) return 'Нет такого задания';
    if (!t || t.seat !== p.seat || t.phase !== 1 || t.afterExplore) return 'Только в фазе I своего хода';
    if (q.locs ? !q.locs.includes(p.loc) : p.loc !== q.loc) return q.locs ? `Нужно быть в локации школы: ${q.locs.map(n => LOC[n].name).join(', ')}` : `Нужно быть в локации ${LOC[q.loc].name}`;
    if (q.gold && p.gold < q.gold) return `Нужно ${q.gold} золота`;
    return null;
}

STEPS.questDone = (state, step) => {
    const p = state.players[step.seat];
    const q = p.quests.splice(step.i, 1)[0];
    if (q.terrain) { state.locPiles[q.terrain].push(q.loc); shuffle(state, state.locPiles[q.terrain]); }
    if (q.gold) { p.gold -= q.gold; log(state, `${p.name}: −${q.gold} золота (задание)`); }
    // The quest card itself goes back to the box.
    used(state, q.id);
    log(state, `${p.name} выполняет задание «${questLabel(q)}»`, { kind: 'explore' });
    push(state, { op: 'takeEvent', seat: p.seat, id: q.event });
};

// ---- quest tokens that spring on others, secret cards («Цири и доп. события») ----------------
// «Поместите жетон задания в … Когда любой игрок, кроме вас, переместится туда (закончит там ход),
// возьмите событие N и зачитайте ему»: the token lies on the board (state.traps, public; the
// event number is known to its owner only). The other player who arrives / ends the turn there
// resolves event N; the token is discarded unless the event says it stays (then not for that
// player again this turn). «Возьмите событие N, но не показывайте её другим игрокам»: a secret
// card (p.secrets, hidden) that is read to the first other player who meets its condition
// (moving, ending phase I in a forest, raising alchemy, defeating a monster) — automatically:
// the owner does not have to watch every move of the table.
const turnKey = (state) => `${state.round}:${state.turn ? state.turn.seat : -1}`;

STEPS.trapPlace = (state, step) => {
    const p = state.players[step.seat];
    const tr = step.trap;
    if (!EVENTS[tr.event] || state.eventsUsed.includes(tr.event)) { log(state, `Событие ${EVENTS[tr.event] ? EVENTS[tr.event].num : '?'} уже в игре — жетон задания не кладётся`); return; }
    const put = (loc, terrain) => push(state, { op: 'trapPut', seat: p.seat, trap: tr, loc, terrain: terrain || null });
    if (tr.where === 'here') return put(p.loc);
    if (tr.where === 'school') return put(SCHOOLS[p.school].home);
    if (tr.where === 'adj' || tr.where === 'any') {
        const locs = tr.where === 'adj' ? (ADJ[p.loc] || []).filter(n => canEnter(state, n)) : Object.keys(LOC).map(Number).filter(n => n !== p.loc && canEnter(state, n));
        ask(state, {
            seat: p.seat, kind: 'choice', ui: 'move', title: 'Жетон задания',
            text: `Куда положить жетон задания? Когда другой игрок ${tr.on === 'move' ? 'придёт туда' : 'закончит там ход'}, вы зачитаете ему событие ${EVENTS[tr.event].num}.`,
            options: locs.map(n => ({ id: String(n), label: LOC[n].name, hint: TERRAIN_NAME[LOC[n].terrain] })), op: 'trapPick', args: { seat: p.seat, trap: tr },
        });
        return;
    }
    // A random location token: of the terrain, or of any type (all piles together).
    const pool = [];
    for (const k of Object.keys(state.locPiles)) if (tr.where === 'random' || tr.where === k) state.locPiles[k].forEach((n, i) => pool.push({ k, n }));
    if (!pool.length) { log(state, `${p.name}: жетоны локаций закончились — жетон задания не кладётся`); return; }
    const pick = shuffle(state, pool)[0];
    removeFrom(state.locPiles[pick.k], pick.n);
    put(pick.n, pick.k);
};
STEPS.trapPick = (state, step) => push(state, { op: 'trapPut', seat: step.seat, trap: step.trap, loc: Number(step.choice), terrain: null });
STEPS.trapPut = (state, step) => {
    const p = state.players[step.seat];
    used(state, step.trap.event);
    if (!state.traps) state.traps = [];
    state.trapSeq = (state.trapSeq || 0) + 1;
    state.traps.push({ id: state.trapSeq, owner: p.seat, loc: step.loc, event: step.trap.event, on: step.trap.on, terrain: step.terrain });
    log(state, `${p.name} кладёт жетон задания: ${LOC[step.loc].name} — событие для того, кто ${step.trap.on === 'move' ? 'придёт туда' : 'закончит там ход'}`, { kind: 'explore' });
    fx(state, { k: 'quest', seat: p.seat, loc: step.loc });
};

/** After a move / at the end of a turn / …: sprung quest tokens and secret cards for `seat`. */
STEPS.trapCheck = (state, step) => {
    const p = state.players[step.seat];
    const steps = [];
    if (step.on === 'move' || step.on === 'end') {
        for (const tr of state.traps || []) {
            if (tr.loc !== p.loc || tr.owner === p.seat || tr.on !== step.on) continue;
            if (tr.immune && tr.immune.seat === p.seat && tr.immune.key === turnKey(state)) continue;
            steps.push({ op: 'trapSpring', seat: p.seat, id: tr.id });
        }
    }
    for (const q of state.players) {
        if (q.seat === p.seat) continue;
        for (const id of q.secrets || []) {
            const g = EVENTS[id] && EVENTS[id].trigger;
            if (!g) continue;
            const hit = step.on === 'move' ? g.move === 'any' || g.move === p.loc
                : step.on === 'endPhase1' ? g.endPhase1 && LOC[p.loc].terrain === g.endPhase1
                : step.on === 'skillUp' ? g.skillUp === step.skill
                : step.on === 'defeat' ? !!g.defeat
                : step.on === 'poker' ? !!g.poker
                : step.on === 'fightEnd' ? g.fightEnd === 'elixir'
                : step.on === 'fightStart' ? g.fightStart && LOC[p.loc].terrain === g.fightStart : false;
            if (hit) steps.push({ op: 'secretSpring', seat: p.seat, owner: q.seat, id });
        }
    }
    if (steps.length) push(state, ...steps);
};
STEPS.trapSpring = (state, step) => {
    const tr = (state.traps || []).find(x => x.id === step.id);
    const p = state.players[step.seat];
    if (!tr || p.loc !== tr.loc) return;
    (state.trapCtx || (state.trapCtx = [])).push({ id: tr.id, seat: p.seat, stay: false });
    log(state, `${p.name} — на жетоне задания игрока ${state.players[tr.owner].name}: событие ${EVENTS[tr.event].num}`, { kind: 'explore' });
    fx(state, { k: 'trap', seat: p.seat, owner: tr.owner, loc: tr.loc });
    push(state, { op: 'readEvent', seat: p.seat, id: tr.event, by: tr.owner }, { op: 'trapAfter', id: tr.id });
};
STEPS.trapAfter = (state, step) => {
    const ctx = (state.trapCtx || []).pop();
    const i = (state.traps || []).findIndex(x => x.id === step.id);
    if (i < 0) return;
    const tr = state.traps[i];
    if (ctx && ctx.stay) { tr.immune = { seat: ctx.seat, key: turnKey(state) }; log(state, `Жетон задания остаётся: ${LOC[tr.loc].name}`); return; }
    state.traps.splice(i, 1);
    if (tr.terrain) { state.locPiles[tr.terrain].push(tr.loc); shuffle(state, state.locPiles[tr.terrain]); }
    log(state, `Жетон задания сброшен: ${LOC[tr.loc].name}`);
};
STEPS.secretSpring = (state, step) => {
    const q = state.players[step.owner];
    if (!removeFrom(q.secrets || [], step.id)) return;
    push(state, { op: 'readEvent', seat: step.seat, id: step.id, by: q.seat });
};
/** Another player reads event `id` to `seat` (sprung token, secret card): `seat` resolves it. */
STEPS.readEvent = (state, step) => {
    const p = state.players[step.seat];
    const ev = EVENTS[step.id];
    if (!ev) return;
    const by = state.players[step.by];
    log(state, `${by.name} зачитывает игроку ${p.name} событие ${ev.num}`, { kind: 'explore' });
    fx(state, { k: 'read', seat: p.seat, by: by.seat, id: step.id });
    const title = `Событие ${ev.num} — зачитывает ${by.name}`;
    if (ev.a) { askChoose(state, p, step.id, title, {}); return; }
    ask(state, { seat: p.seat, kind: 'choice', ui: 'event', stage: 'event', card: step.id, title, options: [{ id: 'ok', label: 'Продолжить' }], op: 'eventApply', args: { seat: p.seat, id: step.id } });
};
