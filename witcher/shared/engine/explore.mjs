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
import { TERRAIN_NAME, SKILL_NAME, SCHOOLS } from '../data/rules-data.mjs';
import { EXPLORE_DECKS, EVENTS, questLabel } from '../data/events-data.mjs';
import { canEnter, refillRow, SKILL_GEN } from './turn.mjs';

export const EXPLORE_READY = true;
const DECK_NAME = { city: 'город', wild: 'окрестности' };
const SKILLS = ['combat', 'defense', 'alchemy', 'spec'];

/** Decks live in the state (hidden: the view shows only counts). Old saves get them lazily. */
export function ensureExplore(state) {
    if (!state.explore) {
        state.explore = {};
        for (const d of Object.keys(EXPLORE_DECKS)) state.explore[d] = shuffle(state, EXPLORE_DECKS[d].slice());
    }
    if (!state.eventsUsed) state.eventsUsed = [];
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
    if (opt.cost && opt.cost.gold && p.gold < opt.cost.gold) return `Нужно ${opt.cost.gold} золота`;
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
    askChoose(state, p, id, `Исследование: ${DECK_NAME[step.deck]}`, { deck: step.deck, explore: true });
};

STEPS.exploreChoice = (state, step) => {
    const p = state.players[step.seat];
    const ev = EVENTS[step.id];
    const opt = ev[step.choice];
    if (opt.cost && opt.cost.gold) p.gold -= opt.cost.gold;
    log(state, `${p.name} выбирает ${step.choice === 'a' ? 'А' : 'Б'}: «${opt.label}»`, { kind: 'explore' });
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
    if (e.draw && t) {
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
        const opts = (ADJ[p.loc] || []).filter(n => canEnter(state, n)).map(n => ({ id: String(n), label: LOC[n].name, hint: TERRAIN_NAME[LOC[n].terrain] }));
        if (opts.length) ask(state, { seat: p.seat, kind: 'choice', ui: 'move', title: 'Перемещение', text: 'Переместитесь в соседнюю локацию, не сбрасывая карты. Затем можете выполнить её действие.', options: opts, op: 'exploreMove', args: { seat: p.seat } });
    }
    if (e.if) {
        const c = e.if;
        const okc = (c.goldMax == null || p.gold <= c.goldMax) && (c.elixirMax == null || p.elixirs.length <= c.elixirMax)
            && (c.shieldMax == null || p.shield <= c.shieldMax) && (c.trophiesMax == null || p.trophies.length <= c.trophiesMax);
        log(state, `${p.name}: условие ${okc ? 'выполнено' : 'не выполнено'}`);
        push(state, ...effectSteps(p.seat, okc ? e.fx : e.else, { card: step.card }));
    }
    if (e.freeBuy && t) { t.freeBuy = true; log(state, `${p.name}: в фазе III этого хода карта из ряда — бесплатно`); }
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
    const title = step.by === 'combo' ? `Урон комбинации: ${step.r}` : step.x2 != null ? `${SKILL_NAME[step.by]} ${step.x2} × 2 + кубик ${step.die} = ${step.r}` : !step.by ? `Бросок кубика: ${step.r}` : step.by === 'level' ? `Уровень ведьмака: ${step.r}` : `Навык ${SKILL_GEN[step.by]}: ${step.r}`;
    ask(state, { seat: step.seat, kind: 'choice', ui: 'event', stage: 'roll', card: step.card, title, dice: step.x2 != null ? step.die : step.r, sum: step.x2 != null ? step.r : undefined, rollKind: step.by === 'combo' ? 'combo' : undefined, options: [{ id: 'ok', label: 'Продолжить' }], op: 'noop', args: {} });
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
    // Back to a phase-I-like window: only the new location's action, then phase III.
    t.phase = 1; t.moved = true; t.afterExplore = true;
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
    p.quests.push({ id: step.id, terrain, loc, event: q.event, gold: q.gold || 0 });
    log(state, `${p.name} получает задание «${questLabel({ id: step.id })}»: ${LOC[loc].name}${terrain ? ' (' + TERRAIN_NAME[terrain].toLowerCase() + ')' : ''}`, { kind: 'explore' });
    fx(state, { k: 'quest', seat: p.seat, loc });
};

/** Why quest #i cannot be completed now, or null. */
export function questError(state, p, i) {
    const q = p.quests[i];
    const t = state.turn;
    if (!q) return 'Нет такого задания';
    if (!t || t.seat !== p.seat || t.phase !== 1 || t.afterExplore) return 'Только в фазе I своего хода';
    if (p.loc !== q.loc) return `Нужно быть в локации ${LOC[q.loc].name}`;
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
