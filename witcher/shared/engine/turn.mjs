// Player turn: phase I (movement, location actions, poker), phase II choice, phase III
// (discard, draw, mandatory purchase). База.md pp. 12–19, 35–36.
import { STEPS, push, ask } from './flow.mjs';
import { vulnPickup } from './vtoken.mjs';
import {
    CARDS, LOC, ADJ, MONSTER, card, log, fx, drawCards, removeFrom, shuffle, skillVal, maxShield, clampShield, potionOf, pname,
} from './util.mjs';
import {
    SCHOOLS, ROW_MODS, LOC_ACTIONS, SKILL_NAME, LEVEL_DRAW, ELIXIR_LIMIT, PHASE3_HAND, TERRAIN_NAME, EXHAUST, TRACK_GOLD, TROPHIES_TO_WIN, trailOn,
} from '../data/rules-data.mjs';
import { MUTAGEN, MUTAGEN_GAIN } from '../data/trail-data.mjs';
import { SKILLTROPHIES } from '../data/gen-data.mjs';
import { hasTrophy, hasGear, keepOf, elixirCap, trainCost, GEAR_MOVES } from './effects.mjs';
import { bombOfferError, askElixirOrBomb } from './bombs.mjs';
import { skCanEnter, skArrived, gift04Pending } from './skellige.mjs';

export const SKILL_GEN = { combat: 'сражения', defense: 'защиты', alchemy: 'алхимии', spec: 'специализации' };

// ---------------------------------------------------------------------------------------------
// Turn start / end
// ---------------------------------------------------------------------------------------------
STEPS.startTurn = (state, step) => {
    const p = state.players[step.seat];
    state.turn = { seat: p.seat, phase: 1, moved: false, startLoc: p.loc, usedLoc: [], pokered: [], drawDelta: 0, p3fixed: null, doubleMoveUsed: false };
    if (p.drawLater) { state.turn.drawDelta += p.drawLater; p.drawLater = 0; }
    p.turns++;
    log(state, `Ход: ${p.name}`, { kind: 'turn', seat: p.seat });
    fx(state, { k: 'turn', seat: p.seat });
};

STEPS.endTurn = (state) => {
    const t = state.turn;
    const p = state.players[t.seat];
    // «Скеллиге», gift 04: once per turn after phase III.
    if (gift04Pending(state, p)) { push(state, { op: 'skGift04Ask', seat: p.seat }, { op: 'endTurn' }); return; }
    // Trophies that trigger at the end of the turn.
    if (hasTrophy(p, 'MON-03') && LOC[p.loc].terrain === 'water') push(state, { op: 'gainElixir', seat: p.seat, n: 1, why: 'трофей «Гнездо гулей»' });
    if (hasTrophy(p, 'MON-20')) { p.gold += 1; log(state, `${p.name}: +1 золото (трофей «Водная баба»)`); }
    state.queue.push({ op: 'nextPlayer' });
    push(state, { op: 'trapCheck', seat: p.seat, on: 'end' });
};
STEPS.nextPlayer = (state) => {
    const n = state.players.length;
    const next = (state.turn.seat + 1) % n;
    if (next === 0) state.round++;
    push(state, { op: 'startTurn', seat: next });
    // «Легендарная охота»: the last player ends the turn — the legendary monster moves.
    if (next === 0 && state.legend) push(state, { op: 'legendMove' });
};

// ---------------------------------------------------------------------------------------------
// Skills, level, elixirs, trophies
// ---------------------------------------------------------------------------------------------
STEPS.raiseSkill = (state, step) => {
    const p = state.players[step.seat];
    if (p.skills[step.skill] >= 5) return;
    p.skills[step.skill]++;
    log(state, `${p.name}: навык ${SKILL_GEN[step.skill]} → ${p.skills[step.skill]}${step.why ? ' (' + step.why + ')' : ''}`);
    fx(state, { k: 'skill', seat: p.seat, skill: step.skill, v: p.skills[step.skill] });
    const after = [];
    if (step.skill === 'defense') { p.shield = Math.min(maxShield(state, p), p.shield + 1); }
    if (step.skill === 'alchemy') after.push({ op: 'gainElixir', seat: p.seat, n: 1, why: 'навык алхимии' }, { op: 'trapCheck', seat: p.seat, on: 'skillUp', skill: 'alchemy' });
    after.push({ op: 'levelCheck', seat: p.seat, ...(step.noLevelCards ? { noCards: true } : {}) });
    push(state, ...after);
};
STEPS.lowerSkill = (state, step) => {
    const p = state.players[step.seat];
    const v = p.skills[step.skill];
    if (v >= 5 || v <= 1) { log(state, `${p.name}: навык ${SKILL_GEN[step.skill]} не понижается`); return; }
    p.skills[step.skill]--;
    log(state, `${p.name}: навык ${SKILL_GEN[step.skill]} ↓ ${p.skills[step.skill]}`);
    fx(state, { k: 'skill', seat: p.seat, skill: step.skill, v: p.skills[step.skill] });
    clampShield(state, p);
};
STEPS.levelCheck = (state, step) => {
    const p = state.players[step.seat];
    while (p.level < 5 && Object.values(p.skills).every(v => v > p.level)) {
        p.level++;
        // Ruin tokens («Легендарная охота»): «не берите карты за это» (no mutagens instead either).
        if (step.noCards) {
            log(state, `${p.name} достигает ${p.level}-го уровня ведьмака (без карт — бонус руин)`, { kind: 'level' });
            fx(state, { k: 'level', seat: p.seat, v: p.level });
            continue;
        }
        // «По следу монстра», мутагены: mutagens instead of the cards for the new level.
        if (trailOn(state, 'mutagens')) {
            const m = MUTAGEN_GAIN[p.level] || 0;
            log(state, `${p.name} достигает ${p.level}-го уровня ведьмака и получает мутаген${m > 1 ? 'ы' : ''} (${m})`, { kind: 'level' });
            fx(state, { k: 'level', seat: p.seat, v: p.level });
            for (let i = 0; i < m; i++) push(state, { op: 'mutagenGain', seat: p.seat });
            continue;
        }
        const n = LEVEL_DRAW[p.level] || 0;
        log(state, `${p.name} достигает ${p.level}-го уровня ведьмака${n ? ` и берёт ${n} карт${n === 1 ? 'у' : 'ы'}` : ''}`, { kind: 'level' });
        fx(state, { k: 'level', seat: p.seat, v: p.level });
        drawCards(state, p, n);
    }
};
/** Mutagen: reveal 3, keep 1, shuffle the other 2 back (По следу монстра.md p. 3). */
STEPS.mutagenGain = (state, step) => {
    const p = state.players[step.seat];
    const deck = state.mutagenDeck || [];
    const top = deck.splice(0, 3);
    if (!top.length) { log(state, 'Колода мутагенов пуста'); return; }
    if (top.length === 1 || p.bot) { push(state, { op: 'mutagenTake', seat: p.seat, ids: [top[0]], rest: top.slice(1) }); return; }
    ask(state, { seat: p.seat, kind: 'cards', from: 'mutagens', ids: top, min: 1, max: 1, big: true, title: 'Мутаген', text: 'Выберите 1 мутаген. Его эффект можно применять раз в каждой битве; остальные вернутся в колоду.', op: 'mutagenTake', args: { seat: p.seat, rest: top } });
};
STEPS.mutagenTake = (state, step) => {
    const p = state.players[step.seat];
    const id = step.ids[0];
    p.mutagens = p.mutagens || [];
    p.mutagens.push(id);
    state.mutagenDeck.push(...step.rest.filter(x => x !== id));
    shuffle(state, state.mutagenDeck);
    log(state, `${p.name} получает мутаген: ${MUTAGEN[id].name} — ${MUTAGEN[id].cond.replace(/:$/, '')}`);
    fx(state, { k: 'mutagenGain', seat: p.seat, id });
};

STEPS.gainElixir = (state, step) => {
    const p = state.players[step.seat];
    const n = step.n == null ? 1 : step.n;
    // «Возьмите до 5 эликсиров (игнорируя лимит)»: no limit check for this gain.
    if (n <= 0) { if (!step.noLimit) push(state, { op: 'elixirLimit', seat: p.seat, ...(step.fight ? { fight: 1 } : {}) }); return; }
    const next = { ...step, n: n - 1, asked: false };
    // «По следу монстра»: each elixir may be taken as a bomb instead (one question per elixir).
    if (!step.asked && !bombOfferError(state, p)) { askElixirOrBomb(state, p, step); return; }
    if (hasTrophy(p, 'MON-25')) { push(state, { op: 'elixirLook3', seat: p.seat, ...(step.fight ? { fight: 1 } : {}) }, next); return; }
    const e = drawElixir(state);
    if (!e) { push(state, { ...next, n: 0 }); return; }
    p.elixirs.push(e);
    log(state, `${p.name} берёт эликсир «${potionOf(e).name}»${step.why ? ' (' + step.why + ')' : ''}`);
    fx(state, { k: 'elixir', seat: p.seat, id: e });
    push(state, next);
};
export function drawElixir(state) {
    if (!state.elixirDeck.length) {
        if (!state.elixirDiscard.length) return null;
        state.elixirDeck = shuffle(state, state.elixirDiscard.splice(0));
    }
    return state.elixirDeck.shift();
}
STEPS.elixirLook3 = (state, step) => {
    const p = state.players[step.seat];
    const look = [];
    for (let i = 0; i < 3; i++) { const e = drawElixir(state); if (e) look.push(e); }
    if (!look.length) return;
    state.elixirLook = look;
    ask(state, { seat: p.seat, kind: 'cards', from: 'elixirs', ids: look, min: 1, max: 1, title: 'Трофей «Кладбищенская баба»', text: 'Выберите 1 эликсир из 3 верхних. Остальные уходят под низ колоды.', op: 'elixirLook3Done', args: { seat: p.seat } });
};
STEPS.elixirLook3Done = (state, step) => {
    const p = state.players[step.seat];
    const take = step.ids[0];
    p.elixirs.push(take);
    state.elixirDeck.push(...state.elixirLook.filter(e => e !== take));
    delete state.elixirLook;
    log(state, `${p.name} берёт эликсир «${potionOf(take).name}»`);
    push(state, { op: 'elixirLimit', seat: p.seat });
};
STEPS.elixirLimit = (state, step) => {
    const p = state.players[step.seat];
    const cap = elixirCap(p);
    if (p.elixirs.length <= cap) return;
    const over = p.elixirs.length - cap;
    ask(state, { seat: p.seat, kind: 'cards', from: 'elixirs', ids: p.elixirs.slice(), min: over, max: over, title: 'Лимит эликсиров', text: `Не больше ${cap} эликсиров: сбросьте ${over}.`, op: 'elixirDiscard', args: { seat: p.seat } });
};
STEPS.elixirDiscard = (state, step) => {
    const p = state.players[step.seat];
    for (const id of step.ids) { removeFrom(p.elixirs, id); state.elixirDiscard.push(id); }
};

/** A trophy moves the marker up and causes exhaustion (База.md p. 29). */
STEPS.gainTrophy = (state, step) => {
    const p = state.players[step.seat];
    p.trophies.push({ kind: step.kind, id: step.id, ...(step.card ? { card: step.card } : {}) });
    // «Скеллиге»: «получите трофей … (не перемещайте свой жетон трофеев)» — no track, no exhaustion.
    if (step.noTrack) { fx(state, { k: 'trophy', seat: p.seat, kind: step.kind, id: step.id, track: p.track }); return; }
    const meditation = step.kind === 'skill';
    if (state.legend) {
        // «Легендарная охота»: the top division does not end the game; the token stops there.
        if (p.track >= TROPHIES_TO_WIN) { log(state, `${p.name}: жетон трофеев уже на верхнем делении`); return; }
        p.track++;
        fx(state, { k: 'trophy', seat: p.seat, kind: step.kind, id: step.id, track: p.track });
        const ex = EXHAUST[p.track] || 0;
        if (ex > 0) push(state, { op: 'exhaustAsk', seat: p.seat, n: ex });
        return;
    }
    if (meditation && p.track + 1 >= TROPHIES_TO_WIN && !state.solo) {
        log(state, `${p.name} получает трофей за медитацию, но победить медитацией нельзя: жетон трофеев не двигается`);
        return;
    }
    p.track++;
    fx(state, { k: 'trophy', seat: p.seat, kind: step.kind, id: step.id, track: p.track });
    if (state.solo) {
        const won = p.monstersDefeated >= 3 && p.trophies.some(t => t.kind === 'skill');
        if (won) { push(state, { op: 'gameOver', seat: p.seat }); return; }
    } else if (p.track >= TROPHIES_TO_WIN) { push(state, { op: 'gameOver', seat: p.seat }); return; }
    const ex = EXHAUST[Math.min(p.track, EXHAUST.length - 1)];
    if (ex > 0) push(state, { op: 'exhaustAsk', seat: p.seat, n: ex });
};
STEPS.exhaustAsk = (state, step) => {
    const p = state.players[step.seat];
    const all = [...p.hand, ...p.deck, ...p.discard];
    const n = Math.min(step.n, all.length);
    if (!n) return;
    ask(state, { seat: p.seat, kind: 'cards', from: 'own', ids: all, min: n, max: n, title: 'Истощение', text: `Уберите из игры ${n} сво${n === 1 ? 'ю карту' : 'и карты'} действий (рука, колода, сброс).`, op: 'exhaustDo', args: { seat: p.seat } });
};
STEPS.exhaustDo = (state, step) => {
    const p = state.players[step.seat];
    for (const id of step.ids) {
        removeFrom(p.hand, id) || removeFrom(p.deck, id) || removeFrom(p.discard, id);
        p.removed.push(id);
    }
    log(state, `${p.name}: истощение — убрано из игры ${step.ids.map(id => '«' + CARDS[id].name + '»').join(', ')}`);
};
STEPS.gameOver = (state, step) => {
    state.winner = step.seat;
    state.stage = 'over';
    state.prompt = null;
    const p = state.players[step.seat];
    log(state, step.legend ? `${p.name} побеждает легендарного монстра и выигрывает партию!${state.solo ? ` (ходов: ${p.turns})` : ''}` : state.solo ? `Победа! ${p.name} справился за ${p.turns} ход(ов)` : `${p.name} собирает ${TROPHIES_TO_WIN} трофея и побеждает!`, { kind: 'win' });
    fx(state, { k: 'win', seat: step.seat });
};

// ---------------------------------------------------------------------------------------------
// Row helpers
// ---------------------------------------------------------------------------------------------
export const rowCost = (state, slot) => {
    const id = state.row[slot];
    return id ? (CARDS[id].burn ? -1 : Math.max(0, CARDS[id].cost + ROW_MODS[slot])) : null;
};
/** What `p` pays for row cell `slot` this turn: free / discounted by an event, Гертруда ignores
 *  the +1 cell modifier (CONT80-39). */
export function buyCost(state, p, slot) {
    const id = state.row[slot];
    if (!id) return null;
    const t = state.turn;
    if (t && t.freeBuy) return 0;
    // «Убрать из игры 1 карту из руки» — not a number, the cell does not change it (shown as -1).
    if (CARDS[id].burn) return -1;
    const mod = ROW_MODS[slot] > 0 && hasGear(p, 'CONT80-39') ? 0 : ROW_MODS[slot];
    return Math.max(0, CARDS[id].cost + mod - ((t && t.buyDiscount) || 0));
}
/** Shift right so that the empty cells are on the left, then reveal into them (База.md p. 19). */
export function refillRow(state) {
    const cards = state.row.filter(Boolean);
    const empty = state.row.length - cards.length;
    const fresh = [];
    for (let i = 0; i < empty; i++) fresh.push(state.actionDeck.shift() || null);
    state.row = [...fresh, ...cards];
    fx(state, { k: 'row' });
}
STEPS.takeZeroCard = (state, step) => {
    const p = state.players[step.seat];
    const zero = state.row.map((id, i) => ({ id, i })).filter(x => x.id && CARDS[x.id].cost === 0);
    if (zero.length === 0) {
        const revealed = [];
        let got = null;
        while (state.actionDeck.length) {
            const id = state.actionDeck.shift();
            if (CARDS[id].cost === 0) { got = id; break; }
            revealed.push(id);
        }
        state.actionDeck.push(...revealed);
        shuffle(state, state.actionDeck);
        if (got) { p.discard.push(got); log(state, `${p.name} берёт карту стоимости 0 «${CARDS[got].name}» из колоды в сброс`); }
        return;
    }
    if (zero.length === 1 || p.bot) { push(state, { op: 'takeZeroDone', seat: p.seat, ids: [zero[0].id] }); return; }
    ask(state, { seat: p.seat, kind: 'cards', from: 'row', ids: zero.map(z => z.id), min: 1, max: 1, title: 'Карта стоимости 0', text: 'Возьмите карту стоимости 0 из ряда в свой сброс.', op: 'takeZeroDone', args: { seat: p.seat } });
};
STEPS.takeZeroDone = (state, step) => {
    const p = state.players[step.seat];
    const id = step.ids[0];
    const i = state.row.indexOf(id);
    if (i >= 0) state.row[i] = null;
    p.discard.push(id);
    fx(state, { k: 'gain', seat: p.seat, id, to: 'discard' });
    log(state, `${p.name} берёт «${CARDS[id].name}» (стоимость 0) в сброс`);
    refillRow(state);
};

// ---------------------------------------------------------------------------------------------
// Movement
// ---------------------------------------------------------------------------------------------
/** Can these cards/gold pay for entering `to`? (База.md p. 12) */
export function movePaymentError(state, p, to, cards, gold, via) {
    const dest = LOC[to];
    if (!cards.every(id => p.hand.includes(id)) || new Set(cards).size !== cards.length) return 'Этих карт нет в руке';
    if (gold > p.gold) return 'Не хватает золота';
    // Выносливость («По следу монстра»): one card pays for two moves through `via`.
    if (via != null) return cards.length === 1 && !gold && CARDS[cards[0]].endurance ? null : `Два перемещения (через ${LOC[via].name}) — только картой «Выносливость»`;
    const matches = (id) => { const c = CARDS[id]; return c.terrain === 'joker' || dest.terrain === 'joker' || c.terrain === dest.terrain; };
    if (cards.length === 1 && gold === 0 && matches(cards[0])) return null;
    if (cards.length === 2 && gold === 0) return null;
    if (cards.length === 1 && gold === 1) return null;
    return 'Оплата: 1 карта местности ' + TERRAIN_NAME[dest.terrain].toLowerCase() + ' (или джокер), 2 любые карты или 1 карта и 1 золото';
}
export function canEnter(state, to) {
    const l = LOC[to];
    if (!l) return false;
    // «Скеллиге»: the islands, the event islands once placed, the Dagon location while open.
    if (l.island || l.dagon) return skCanEnter(state, to);
    return true;
}
STEPS.arrive = (state, step) => {
    const p = state.players[step.seat];
    // Мартин (companion): +1 gold on entering Хенфорс (2) or Лок Ихор (14).
    if (hasGear(p, 'CONT79-11') && (p.loc === 2 || p.loc === 14)) { p.gold += 1; log(state, `${p.name}: +1 золото (Мартин поёт в ${LOC[p.loc].name})`); fx(state, { k: 'gold', seat: p.seat, n: 1 }); }
    // Hunting quests: arriving at the token's location turns it into a track token (База.md p. 36).
    for (const h of p.hunts.slice()) {
        if (h.loc === p.loc) {
            p.gold += h.gold;
            removeFrom(p.hunts, h);
            if (!p.trackTokens[h.terrain]) p.trackTokens[h.terrain] = h.loc;
            else state.locPiles[h.terrain].push(h.loc);
            log(state, `${p.name} выполняет задание на выслеживание: +${h.gold} золото и жетон следа (${TERRAIN_NAME[h.terrain].toLowerCase()})`);
            fx(state, { k: 'track', seat: p.seat, terrain: h.terrain });
        }
    }
    // Quest tokens of other players / secret cards («Цири и доп. события», explore.mjs).
    push(state, { op: 'trapCheck', seat: p.seat, on: 'move' });
    // «Уязвимости и особые атаки»: a vulnerability token in this location is taken face up.
    vulnPickup(state, p);
    // «Скеллиге»: gift 05 (a Continent location with a ship).
    skArrived(state, p);
};

/** Destinations of a kept-card move (Лошадь / гильдия купцов): adjacent locations of its terrain. */
export function gearMoveDests(state, p, key) {
    const g = GEAR_MOVES[key];
    return (ADJ[p.loc] || []).filter(n => canEnter(state, n) && LOC[n].terrain === g.terrain);
}
/** Why the kept card `key` cannot move the witcher now, or null. Once per turn, in phase I. */
export function gearMoveError(state, p, key) {
    const g = GEAR_MOVES[key];
    if (!g) return 'Нет такого эффекта';
    const own = key === 'CONT79-16' ? hasGear(p, key) : (p.keeps || []).some(k => k.id === key);
    if (!own) return 'Этой карты у вас нет';
    const t = state.turn;
    if (!t || t.seat !== p.seat || t.phase !== 1 || t.afterExplore) return 'Только в фазе I своего хода';
    if ((t.gearMoved || []).includes(key)) return 'Уже использовано в этот ход';
    if (g.cost && p.hand.length < g.cost) return 'Нужна карта в руке';
    if (!gearMoveDests(state, p, key).length) return g.terrain === 'forest' ? 'Рядом нет лесной локации' : 'Рядом нет водной локации';
    return null;
}
STEPS.gearMoveAsk = (state, step) => {
    const p = state.players[step.seat];
    const g = GEAR_MOVES[step.key];
    const opts = gearMoveDests(state, p, step.key).map(n => ({ id: String(n), label: LOC[n].name, hint: TERRAIN_NAME[LOC[n].terrain] }));
    ask(state, {
        seat: p.seat, kind: 'choice', ui: 'move', title: g.label.split(':')[0],
        text: g.cost ? 'Куда переместиться? Затем сбросьте 1 карту из руки.' : 'Куда переместиться (без сброса карт)?',
        options: [...opts, { id: 'cancel', label: 'Отмена' }], op: 'gearMoveTo', args: { seat: p.seat, key: step.key },
    });
};
STEPS.gearMoveTo = (state, step) => {
    const p = state.players[step.seat];
    if (step.choice === 'cancel') return;
    const g = GEAR_MOVES[step.key];
    if (g.cost) {
        ask(state, { seat: p.seat, kind: 'cards', from: 'hand', ui: 'hand', ids: p.hand.slice(), min: 1, max: 1, title: 'Гильдия купцов', text: `Сбросьте 1 карту из руки, чтобы переместиться в ${LOC[Number(step.choice)].name}.`, op: 'gearMoveDo', args: { seat: p.seat, key: step.key, to: Number(step.choice) } });
        return;
    }
    push(state, { op: 'gearMoveDo', seat: p.seat, key: step.key, to: Number(step.choice), ids: [] });
};
STEPS.gearMoveDo = (state, step) => {
    const p = state.players[step.seat];
    const t = state.turn;
    for (const id of step.ids || []) { removeFrom(p.hand, id); p.discard.push(id); }
    (t.gearMoved || (t.gearMoved = [])).push(step.key);
    const from = p.loc;
    p.loc = step.to;
    t.moved = true;
    log(state, `${p.name}: ${LOC[from].name} → ${LOC[step.to].name} (${GEAR_MOVES[step.key].label.split(':')[0]})`, { kind: 'move' });
    fx(state, { k: 'move', seat: p.seat, from, to: step.to, cards: step.ids || [] });
    push(state, { op: 'arrive', seat: p.seat });
};

// ---------------------------------------------------------------------------------------------
// Location actions
// ---------------------------------------------------------------------------------------------
STEPS.locSchool = (state, step) => {
    const p = state.players[step.seat];
    const cost = trainCost(p, step.skill);
    p.gold -= cost;
    log(state, `${p.name} тренируется в школе (${SKILL_NAME[step.skill]}) за ${cost} золота`);
    const page = keepOf(p, 'train');
    if (page) { removeFrom(p.keeps, page); log(state, `${p.name} сбрасывает карту «${page.name}» (скидка 3 золота)`); }
    push(state, { op: 'raiseSkill', seat: p.seat, skill: step.skill, why: 'тренировка' });
};
STEPS.locHunt = (state, step) => {
    const p = state.players[step.seat];
    const slot = state.slots[step.slot];
    const pile = state.locPiles[slot.terrain];
    let tok = pile.pop();
    if (tok === p.loc && pile.length) { const other = pile.pop(); pile.push(tok); shuffle(state, pile); tok = other; }
    p.hunts.push({ terrain: slot.terrain, loc: tok, gold: 1 });
    log(state, `${p.name} берёт задание на выслеживание (${MONSTER[slot.mon].name}): идти в ${LOC[tok].name}`);
    fx(state, { k: 'hunt', seat: p.seat, loc: tok });
};
STEPS.locSwapPick = (state, step) => {
    const p = state.players[step.seat];
    const removed = step.ids[0];
    removeFrom(p.hand, removed);
    p.removed.push(removed);
    const lim = CARDS[removed].burn ? -1 : CARDS[removed].cost + 1;
    const ok = state.row.filter(id => id && !CARDS[id].burn && CARDS[id].cost <= lim);
    log(state, `${p.name} убирает из игры «${CARDS[removed].name}»`);
    if (!ok.length) return;
    ask(state, { seat: p.seat, kind: 'cards', from: 'row', ids: ok, min: 1, max: 1, title: 'Обмен карты', text: `Возьмите в руку карту из ряда с напечатанной стоимостью не больше ${lim}.`, op: 'locSwapTake', args: { seat: p.seat } });
};
STEPS.locSwapTake = (state, step) => {
    const p = state.players[step.seat];
    const id = step.ids[0];
    state.row[state.row.indexOf(id)] = null;
    p.hand.push(id);
    fx(state, { k: 'gain', seat: p.seat, id, to: 'hand' });
    log(state, `${p.name} берёт «${CARDS[id].name}» из ряда`);
    refillRow(state);
};
STEPS.locPoorRemove = (state, step) => {
    if (!step.ids.length) return;
    for (const id of step.ids) { const i = state.row.indexOf(id); if (i >= 0) { state.row[i] = null; state.removedRow.push(id); } }
    log(state, `Из ряда убраны: ${step.ids.map(id => '«' + CARDS[id].name + '»').join(', ')}`);
    refillRow(state);
};

// ---------------------------------------------------------------------------------------------
// Meditation (База.md p. 15)
// ---------------------------------------------------------------------------------------------
export function meditationOptions(state, p) {
    const out = [];
    for (const t of SKILLTROPHIES) {
        if (p.skills[t.skill] < 5) continue;
        if (!state.skillTrophies.some(x => x.startsWith(t.id + '#'))) continue;
        if (p.trophies.some(x => x.kind === 'skill' && x.id.startsWith(t.id))) continue;
        out.push(t);
    }
    return out;
}
STEPS.meditate = (state, step) => {
    const p = state.players[step.seat];
    const inst = state.skillTrophies.find(x => x.startsWith(step.trophy + '#'));
    removeFrom(state.skillTrophies, inst);
    log(state, `${p.name} медитирует и получает трофей за навык`, { kind: 'trophy' });
    push(state, { op: 'gainTrophy', seat: p.seat, kind: 'skill', id: inst }, { op: 'phase3' });
};

// ---------------------------------------------------------------------------------------------
// Phase III (База.md pp. 18–19)
// ---------------------------------------------------------------------------------------------
STEPS.phase3 = (state) => {
    const t = state.turn;
    const p = state.players[t.seat];
    t.phase = 3;
    // Monster trophies that grant an extra draw for ending phase II in a terrain.
    if (hasTrophy(p, 'MON-12') && LOC[p.loc].terrain === 'mountain') t.drawDelta++;
    if (hasTrophy(p, 'MON-19') && LOC[p.loc].terrain === 'water') t.drawDelta++;
    // Медвежьи меха (SK-EV-07): phase II ended on an island.
    if (hasGear(p, 'SK-EV-07') && LOC[p.loc].island) { t.drawDelta++; log(state, `${p.name}: медвежьи меха — +1 карта в фазу III`); }
    push(state, { op: 'p3discardAsk' });
};
STEPS.p3discardAsk = (state) => {
    const p = state.players[state.turn.seat];
    const min = Math.max(0, p.hand.length - PHASE3_HAND);
    if (!p.hand.length) { push(state, { op: 'p3draw' }); return; }
    ask(state, {
        seat: p.seat, kind: 'cards', from: 'hand', ids: p.hand.slice(), min, max: p.hand.length, ui: 'hand', big: true,
        title: 'Фаза III: сброс', text: min ? `Сбросьте карты, чтобы в руке осталось не больше 3 (минимум ${min}).` : 'Можно сбросить любые карты (необязательно).',
        op: 'p3discard', args: {},
    });
};
STEPS.p3discard = (state, step) => {
    const p = state.players[state.turn.seat];
    for (const id of step.ids) { removeFrom(p.hand, id); p.discard.push(id); }
    if (step.ids.length) { log(state, `${p.name} сбрасывает ${step.ids.length} карт(ы)`); fx(state, { k: 'discard', seat: p.seat, ids: step.ids }); }
    push(state, { op: 'p3draw' });
};
STEPS.p3draw = (state) => {
    const t = state.turn;
    const p = state.players[t.seat];
    let n = Math.max(0, PHASE3_HAND - p.hand.length) + t.drawDelta;
    if (t.p3fixed != null) n = t.p3fixed;
    n = Math.max(0, n);
    const got = drawCards(state, p, n);
    if (got) log(state, `${p.name} берёт ${got} карт(ы)`);
    push(state, { op: 'p3buyAsk' });
};
export function buyOptions(state, p) {
    return state.row.map((id, slot) => {
        if (!id) return null;
        const cost = buyCost(state, p, slot);
        if (cost < 0) return { slot, id, cost, burn: true, ok: p.hand.length >= 1 };
        const water = hasTrophy(p, 'MON-31') && p.hand.some(h => CARDS[h].terrain === 'water');
        return { slot, id, cost, ok: p.hand.length >= cost || water };
    }).filter(Boolean);
}
STEPS.p3buyAsk = (state) => {
    const p = state.players[state.turn.seat];
    const opts = buyOptions(state, p);
    if (!opts.some(o => o.ok)) { log(state, `${p.name} не может оплатить ни одну карту ряда`); push(state, { op: 'endTurn' }); return; }
    ask(state, {
        seat: p.seat, kind: 'choice', ui: 'row', title: 'Фаза III: новая карта',
        text: 'Обязательно возьмите 1 карту из ряда, сбросив из руки карты по её стоимости (с учётом ячейки).',
        options: opts.map(o => ({ id: String(o.slot), label: `${CARDS[o.id].name} — ${o.burn ? 'убрать 1 карту' : o.cost}`, cost: o.cost, burn: !!o.burn, disabled: !o.ok, hint: o.ok ? '' : o.burn ? 'Нужна карта в руке, чтобы убрать её из игры' : 'Мало карт в руке' })),
        op: 'p3buyPick', args: {},
    });
};
STEPS.p3buyPick = (state, step) => {
    const p = state.players[state.turn.seat];
    const slot = Number(step.choice);
    const cost = buyCost(state, p, slot);
    const waterOk = hasTrophy(p, 'MON-31') && p.hand.some(h => CARDS[h].terrain === 'water');
    if (cost < 0) {
        ask(state, {
            seat: p.seat, kind: 'cards', from: 'hand', ui: 'hand', ids: p.hand.slice(), min: 1, max: 1, big: true,
            title: 'Оплата: убрать карту из игры', text: `Чтобы взять «${CARDS[state.row[slot]].name}», уберите из игры 1 карту из руки.`,
            op: 'p3buyPay', args: { slot, burn: true },
        });
        return;
    }
    if (cost === 0) { push(state, { op: 'p3buyPay', slot, ids: [] }); return; }
    if (waterOk) {
        ask(state, {
            seat: p.seat, kind: 'cards', from: 'hand', ui: 'hand', ids: p.hand.slice(), min: 1, max: cost,
            title: `Оплата: ${cost}`, text: `Сбросьте ${cost} карт(ы) — или 1 карту с символом воды (трофей «Сирена»).`, waterAlt: true,
            op: 'p3buyPay', args: { slot, waterAlt: true },
        });
        return;
    }
    ask(state, {
        seat: p.seat, kind: 'cards', from: 'hand', ui: 'hand', ids: p.hand.slice(), min: cost, max: cost,
        title: `Оплата: ${cost}`, text: `Сбросьте из руки ${cost} карт(ы), чтобы взять «${CARDS[state.row[slot]].name}».`,
        op: 'p3buyPay', args: { slot },
    });
};
STEPS.p3buyPay = (state, step) => {
    const p = state.players[state.turn.seat];
    const id = state.row[step.slot];
    if (step.burn) for (const c of step.ids) { removeFrom(p.hand, c); p.removed.push(c); log(state, `${p.name} убирает из игры «${CARDS[c].name}»`); }
    else for (const c of step.ids) { removeFrom(p.hand, c); p.discard.push(c); }
    state.row[step.slot] = null;
    p.hand.push(id);
    fx(state, { k: 'gain', seat: p.seat, id, to: 'hand', slot: step.slot });
    log(state, `${p.name} получает «${CARDS[id].name}»${step.burn ? '' : step.ids.length ? `, сбросив ${step.ids.length}` : ''}`);
    // Solo: if the card was not taken from the rightmost cell, that cell's card leaves the game.
    if (state.solo && step.slot !== 5 && state.row[5]) {
        const gone = state.row[5];
        state.row[5] = null;
        state.removedRow.push(gone);
        log(state, `Одиночная игра: «${CARDS[gone].name}» из правой ячейки убрана из игры`);
    }
    refillRow(state);
    push(state, { op: 'endTurn' });
};

// ---------------------------------------------------------------------------------------------
// Dice poker (База.md p. 14, p. 35; solo table p. 33)
// ---------------------------------------------------------------------------------------------
export const POKER_NAMES = ['Ничего', 'Пара', 'Две пары', 'Тройка', 'Малый стрит', 'Большой стрит', 'Фул-хаус', 'Каре', 'Покер'];
export const SOLO_POKER = [0, 0, 1, 2, 3, 3, 4, 5, 6];
/** Hand value as a comparable array: [rank, ...tie-breakers]. */
export function pokerValue(dice) {
    const cnt = {};
    for (const d of dice) cnt[d] = (cnt[d] || 0) + 1;
    const groups = Object.entries(cnt).map(([v, c]) => ({ v: Number(v), c })).sort((a, b) => b.c - a.c || b.v - a.v);
    const sorted = dice.slice().sort((a, b) => b - a);
    const kick = (used) => sorted.filter(d => !used.includes(d));
    const sig = groups.map(g => g.c).join('');
    if (sig === '5') return [8, groups[0].v];
    if (sig === '41') return [7, groups[0].v, groups[1].v];
    if (sig === '32') return [6, groups[0].v, groups[1].v];
    if (groups.length === 5 && sorted[0] === 6 && sorted[4] === 2) return [5];
    if (groups.length === 5 && sorted[0] === 5 && sorted[4] === 1) return [4];
    if (sig === '311') return [3, groups[0].v, ...kick([groups[0].v])];
    if (sig === '221') return [2, Math.max(groups[0].v, groups[1].v), Math.min(groups[0].v, groups[1].v), groups[2].v];
    if (sig === '2111') return [1, groups[0].v, ...kick([groups[0].v])];
    return [0, ...sorted];
}
export function comparePoker(a, b) {
    const va = pokerValue(a), vb = pokerValue(b);
    for (let i = 0; i < Math.max(va.length, vb.length); i++) {
        const x = va[i] ?? 0, y = vb[i] ?? 0;
        if (x !== y) return x - y;
    }
    return 0;
}
/** Which dice an automatic opponent rerolls: keep groups (or a near straight), reroll the rest. */
export function autoReroll(dice) {
    const v = pokerValue(dice);
    if (v[0] >= 4) return [];
    const cnt = {};
    dice.forEach(d => { cnt[d] = (cnt[d] || 0) + 1; });
    const keepVals = Object.keys(cnt).map(Number).filter(k => cnt[k] >= 2);
    if (keepVals.length) return dice.map((d, i) => keepVals.includes(d) ? -1 : i).filter(i => i >= 0);
    // No pair: keep the 2..6 or 1..5 run if four distinct dice already fit it.
    for (const run of [[2, 3, 4, 5, 6], [1, 2, 3, 4, 5]]) {
        const fit = dice.filter(d => run.includes(d));
        if (new Set(fit).size >= 4) {
            const seen = new Set();
            return dice.map((d, i) => { if (run.includes(d) && !seen.has(d)) { seen.add(d); return -1; } return i; }).filter(i => i >= 0);
        }
    }
    const hi = Math.max(...dice);
    return dice.map((d, i) => d === hi ? -1 : i).filter(i => i >= 0).slice(0, 4);
}
