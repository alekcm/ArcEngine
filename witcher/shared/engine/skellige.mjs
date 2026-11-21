// Expansion «Скеллиге» (Книги правил/Скеллиге.md; Сирена — Доп монстра.md p. 2). Implemented:
//   * setup (p. 4): location tokens 19–21 join the piles (setup.mjs), the shuffled Skellige
//     exploration deck, the gifts of Dagon, 3 ships at random ports, Dagon on the track division
//     marked with the player count;
//   * ships (pp. 6–7): one ship per port / island; port → island or the Dagon location, island /
//     Dagon location → a free port; to an island once per turn (normal move cost by the island's
//     terrain), a die against the track division: calm — Dagon +1 and the upper half of a Skellige
//     exploration card, danger — the lower half (the player on the right reads it); then the ship
//     arrives; back to the Continent without a card; after a Skellige card no exploring in phase II;
//   * Dagon's emergence (p. 9): the sailing player sets the shield to 0 and takes the Dagon token;
//     an emergence when nobody sails affects nobody; while Dagon is up the ocean is always dangerous;
//   * the Dagon location: from a port with a ship, 1 card of any terrain (joker), the fight starts
//     at once in phase II; several ships may stand there; Dagon's fight, ability, special attacks
//     and discard ability, his consequences (driven away — start division, 2 gold, a cost-0 card,
//     a random gift; defeat — the token, a cost-0 card, −1 card in phase III);
//   * the five gifts and their common effect (Dagon +1 after every battle of the holder, not the
//     battle where it was gained);
//   * island actions 19–21 and the event islands (SK-EV-01..05), the Skellige gear;
//   * Сирена (option 'skellige:siren'): in the Dagon location while Dagon is not up.
import { STEPS, push, ask, later } from './flow.mjs';
import { LOC, CARDS, MONSTER, log, fx, d6, shuffle, randInt, removeFrom, drawCards, rowOf } from './util.mjs';
import { PORTS, ISLANDS, DAGON_LOC, TRACK, TRACK_TOP, trackStart, GIFTS, GIFT, calmRange, dangerRange } from '../data/skellige-data.mjs';
import { EVENTS, EXP_DECKS } from '../data/events-data.mjs';
import { TERRAIN_NAME, SKILL_NAME } from '../data/rules-data.mjs';
import { hasGear } from './effects.mjs';
import { askChoose } from './explore.mjs';
import { F, fp } from './fight.mjs';
import { vulnOn } from './vuln.mjs';
import { BIG } from '../data/vuln-data.mjs';
import { refillRow } from './turn.mjs';

export const skOn = (s) => !!(s && s.sk);
const ROMAN_TRACK = ['1', '2', '3', '4', 'локация Дагона'];

/** Setup steps 3–8 (after the base setup and «Легендарная охота», so their RNG is unchanged). */
export function setupSkellige(state, n) {
    if (!state.exp.includes('skellige')) return;
    const start = trackStart(n);
    state.skellige = true;
    state.sk = {
        track: start, start,
        deck: shuffle(state, EXP_DECKS.skellige.explore.slice()),
        gifts: shuffle(state, GIFTS.map(g => g.id)),
        ships: shuffle(state, PORTS.slice()).slice(0, 3),
        islands: [], siren: state.exp.includes('skellige:siren'), voyage: null, lastIsland: null,
    };
    log(state, `Скеллиге: корабли — ${state.sk.ships.map(x => LOC[x].name).join(', ')}; Дагон на делении ${start + 1}`);
}

export const dagonUp = (state) => !!state.sk && state.sk.track >= TRACK_TOP;
/** Сирена waits in the Dagon location; while Dagon is up her figure is off the board. */
export const sirenHere = (state) => !!state.sk && state.sk.siren && !dagonUp(state);
export const dagonLocOpen = (state) => dagonUp(state) || sirenHere(state);
export const skIslands = (state) => (state.sk ? [...ISLANDS, ...state.sk.islands] : []);
export const isPort = (n) => PORTS.includes(n);
const onSea = (n) => !!LOC[n] && (!!LOC[n].island || !!LOC[n].dagon);
export const giftsOf = (p) => p.gifts || [];
export const hasGift = (p, id) => giftsOf(p).includes(id);

/** Can a location of this expansion be entered at all (canEnter)? */
export function skCanEnter(state, n) {
    const l = LOC[n];
    if (!state.sk) return false;
    if (l.dagon) return dagonLocOpen(state);
    if (l.event) return state.sk.islands.includes(n);
    return true;
}

/** Moves by ship from the player's location (pp. 6–7, 9). `free` — SK-EX-08C. */
export function sailMoves(state, p) {
    const sk = state.sk, t = state.turn;
    if (!sk || !t || !sk.ships.includes(p.loc)) return [];
    const out = [];
    if (isPort(p.loc)) {
        if (!t.sailed && !t.skNoSail) for (const i of skIslands(state)) if (!sk.ships.includes(i)) out.push({ to: i, sail: 'island', terrain: LOC[i].terrain });
        if (dagonLocOpen(state)) out.push({ to: DAGON_LOC, sail: 'dagon', terrain: 'joker' });
    } else if (onSea(p.loc)) {
        const free = !!(t.skFreeReturn && LOC[p.loc].island && t.usedLoc.includes(p.loc));
        for (const port of PORTS) if (!sk.ships.includes(port)) out.push({ to: port, sail: 'return', terrain: LOC[port].terrain, ...(free ? { free: true } : {}) });
    }
    return out;
}
/** Sea edges for the bots' route planning (ignoring once-per-turn): forward — where a ship can
 *  take the witcher from `n`; `rev` — the locations a ship can bring the witcher to `n` from. */
export function seaEdges(view, n, rev = false) {
    const sk = view.sk;
    if (!sk) return [];
    const isl = [...ISLANDS, ...sk.islands];
    // The Dagon location: from a port with a ship while Dagon or the siren is there.
    const dagon = dagonLocOpen(view) ? [DAGON_LOC] : [];
    if (!rev) {
        if (isPort(n)) return sk.ships.includes(n) ? [...isl.filter(i => !sk.ships.includes(i)), ...dagon] : [];
        if (onSea(n)) return PORTS.filter(x => !sk.ships.includes(x));
        return [];
    }
    if (n === DAGON_LOC) return dagon.length ? PORTS.filter(x => sk.ships.includes(x)) : [];
    if (LOC[n] && LOC[n].island) return sk.ships.includes(n) ? [] : PORTS.filter(x => sk.ships.includes(x));
    if (isPort(n)) return sk.ships.includes(n) ? [] : isl;
    return [];
}

/** The `move` command when the destination is a sea route. Payment was validated by the caller. */
export function skSail(state, p, m) {
    const t = state.turn, sk = state.sk;
    const from = p.loc;
    skLeaving(state, p, m.sail === 'island');
    if (m.sail === 'island') {
        t.sailed = true; t.skRead = true;
        log(state, `${p.name} садится на корабль: ${LOC[from].name} → ${LOC[m.to].name}`, { kind: 'move' });
        push(state, { op: 'skVoyage', seat: p.seat, from, to: m.to }, { op: 'skVoyageEnd', seat: p.seat });
        return;
    }
    removeFrom(sk.ships, from); sk.ships.push(m.to);
    p.loc = m.to;
    log(state, `${p.name} плывёт на корабле: ${LOC[from].name} → ${LOC[m.to].name}${m.free ? ' (бесплатно)' : ''}`, { kind: 'move' });
    fx(state, { k: 'move', seat: p.seat, from, to: m.to, cards: [], sail: true });
    push(state, { op: 'arrive', seat: p.seat });
    // The Dagon location (p. 10): phase I ends at once, the fight is phase II.
    if (m.sail === 'dagon') push(state, { op: 'skFightStart', seat: p.seat });
}

// ---------------------------------------------------------------------------------------------
// The voyage to an island
// ---------------------------------------------------------------------------------------------
const isCalm = (state, r) => r >= TRACK[state.sk.track].calm;
STEPS.skVoyage = (state, step) => {
    const p = state.players[step.seat], sk = state.sk;
    sk.voyage = { seat: p.seat, from: step.from, to: step.to, half: null, emerged: false, stay: false, toP3: false };
    fx(state, { k: 'sail', seat: p.seat, from: step.from, to: step.to });
    if (dagonUp(state)) {
        sk.voyage.half = 'danger';
        log(state, 'Дагон в своей локации — в океане опасно, кубик не бросается', { kind: 'explore' });
        push(state, { op: 'skVoyageRead', seat: p.seat });
        return;
    }
    const dice = [d6(state)];
    fx(state, { k: 'd6', v: dice[0], seat: p.seat });
    // Подзорная труба (SK-EV-14): a second die, either result.
    if (hasGear(p, 'SK-EV-14')) { dice.push(d6(state)); fx(state, { k: 'd6', v: dice[1], seat: p.seat }); log(state, `${p.name}: подзорная труба — второй кубик (${dice.join(' и ')})`); }
    const plus = hasGear(p, 'SK-EV-06') ? 1 : 0;
    if (dice.length === 2 && isCalm(state, dice[0] + plus) !== isCalm(state, dice[1] + plus) && !p.bot && !p.away) {
        ask(state, {
            seat: p.seat, kind: 'choice', title: 'Подзорная труба', text: `Выберите результат броска (спокойно: ${calmRange(sk.track)}, опасно: ${dangerRange(sk.track)}${plus ? '; ожерелье +1' : ''}).`,
            options: dice.map(d => ({ id: String(d), label: `${d}${plus ? ' + 1' : ''} — ${isCalm(state, d + plus) ? 'спокойно' : 'опасно'}` })),
            op: 'skVoyageRoll', args: { seat: p.seat },
        });
        return;
    }
    // Bots / no real choice: the calm result (the upper half is the friendlier one).
    const r = dice.slice().sort((a, b) => b - a)[0];
    push(state, { op: 'skVoyageRoll', seat: p.seat, r });
};
STEPS.skVoyageRoll = (state, step) => {
    const p = state.players[step.seat], sk = state.sk;
    const r = step.r != null ? step.r : Number(step.choice);
    const plus = hasGear(p, 'SK-EV-06') ? 1 : 0;
    const calm = isCalm(state, r + plus);
    sk.voyage.half = calm ? 'calm' : 'danger';
    log(state, `${p.name} бросает кубик: ${r}${plus ? ' + 1 (ожерелье)' : ''} — в океане ${calm ? 'спокойно' : 'опасно'} (деление ${sk.track + 1}: спокойно ${calmRange(sk.track)})`, { kind: 'explore' });
    push(state,
        { op: 'skRollShow', seat: p.seat, r, plus, calm },
        ...(calm ? [{ op: 'skDagonMove', n: 1, why: 'в океане спокойно' }] : []),
        { op: 'skVoyageRead', seat: p.seat });
};
STEPS.skRollShow = (state, step) => {
    ask(state, {
        seat: step.seat, kind: 'choice', ui: 'event', stage: 'roll', title: `Бросок кубика: ${step.r}${step.plus ? ' + 1' : ''} — в океане ${step.calm ? 'спокойно' : 'опасно'}`,
        dice: step.r, rollKind: 'sea', options: [{ id: 'ok', label: 'Продолжить' }], op: 'noop', args: {},
    });
};
STEPS.skVoyageRead = (state, step) => {
    const p = state.players[step.seat], sk = state.sk;
    if (!sk.deck.length) { log(state, 'Колода исследования Скеллиге закончилась — карта не зачитывается'); return; }
    const id = sk.deck.shift();
    const calm = sk.voyage.half === 'calm';
    const half = EVENTS[id].halves[calm ? 0 : 1];
    const n = state.players.length;
    const reader = state.players[(p.seat - 1 + n) % n];
    log(state, `${n > 1 ? reader.name + ' зачитывает карту' : 'Зачитывается карта'} исследования Скеллиге (${calm ? 'спокойно — верхняя часть' : 'опасно — нижняя часть'})`, { kind: 'explore' });
    fx(state, { k: 'explore', seat: p.seat, deck: 'skellige', id: half });
    const title = `Скеллиге: в океане ${calm ? 'спокойно' : 'опасно'}`;
    if (EVENTS[half].a) { askChoose(state, p, half, title, {}); return; }
    ask(state, { seat: p.seat, kind: 'choice', ui: 'event', stage: 'event', card: half, title, options: [{ id: 'ok', label: 'Продолжить' }], op: 'eventApply', args: { seat: p.seat, id: half } });
};
STEPS.skVoyageEnd = (state, step) => {
    const sk = state.sk, v = sk && sk.voyage;
    if (!v) return;
    sk.voyage = null;
    const p = state.players[v.seat], t = state.turn;
    if (v.emerged) {
        p.shield = 0;
        log(state, `${p.name} становится свидетелем появления Дагона: щит 0${p.skToken ? '' : ', жетон следа Дагона'}`, { kind: 'explore' });
        p.skToken = true;
        fx(state, { k: 'track', seat: p.seat, terrain: 'dagon' });
    }
    if (v.stay) { log(state, `${p.name} остаётся в локации ${LOC[v.from].name}`); return; }
    const to = v.to;
    removeFrom(sk.ships, v.from); sk.ships.push(to);
    p.loc = to;
    log(state, `Корабль с ${p.name} приплывает: ${LOC[to].name}`, { kind: 'move' });
    fx(state, { k: 'move', seat: p.seat, from: v.from, to, cards: [], sail: true });
    push(state, { op: 'arrive', seat: p.seat });
    // SK-EX-03D: «Выполните действие локации. Затем немедленно перейдите к фазе III».
    if (v.toP3 && t && t.phase === 1) { t.afterExplore = true; log(state, `${p.name}: действие локации, затем сразу фаза III`); }
};

/** Dagon goes up the track; reaching the top he emerges (p. 9). */
STEPS.skDagonMove = (state, step) => {
    const sk = state.sk;
    if (!sk || sk.track >= TRACK_TOP) return;
    sk.track = Math.min(TRACK_TOP, sk.track + (step.n ?? 1));
    log(state, `Дагон поднимается по шкале: деление ${ROMAN_TRACK[sk.track]}${step.why ? ' (' + step.why + ')' : ''}`);
    fx(state, { k: 'dagon', track: sk.track });
    if (sk.track === TRACK_TOP) {
        log(state, 'Дагон появляется из пучины! В океане теперь всегда опасно', { kind: 'spawn' });
        fx(state, { k: 'spawn', mon: 'DAGON', loc: DAGON_LOC });
        if (sk.voyage) sk.voyage.emerged = true;
        else log(state, 'Никто не плывёт на остров — щит и жетон следа Дагона никто не получает');
    }
};

/** Effects of the Skellige cards (explore.mjs eventFx → here). Returns true when handled. */
export function skEventFx(state, p, e, step) {
    const sk = state.sk;
    const t = state.turn;
    const v = sk && sk.voyage && sk.voyage.seat === p.seat ? sk.voyage : null;
    if (e.dagon) push(state, { op: 'skDagonMove', n: e.dagon, why: 'событие' });
    if (e.skIsland && sk) {
        const n = Number(Object.entries(LOC).find(([, l]) => l.event === e.skIsland)?.[0]);
        if (n && !sk.islands.includes(n)) { sk.islands.push(n); log(state, `Новый остров рядом с полем Скеллиге: ${LOC[n].name}`, { kind: 'explore' }); fx(state, { k: 'island', loc: n }); }
        sk.lastIsland = n || null;
    }
    if (e.skRedirect && v && sk.lastIsland) {
        const n = sk.lastIsland;
        if (sk.ships.includes(n)) log(state, `${LOC[n].name}: там уже стоит корабль — плывём, как собирались`);
        else if (e.skRedirect === 'may') push(state, { op: 'skRedirectAsk', seat: p.seat, to: n });
        else { v.to0 = v.to; v.to = n; log(state, `${p.name} плывёт на ${LOC[n].name} вместо ${LOC[v.to0].name}`); }
    }
    if (e.skStay && v) v.stay = true;
    if (e.skNoSail && t) { t.skNoSail = true; log(state, `${p.name}: до конца хода на остров плыть нельзя`); }
    if (e.skFreeReturn && t) { t.skFreeReturn = true; log(state, `${p.name}: после действия локации на острове можно бесплатно вернуться на Континент`); }
    if (e.skP3AfterAction && t) { t.skP3After = true; log(state, `${p.name}: после действия локации на острове — сразу фаза III`); }
    if (e.toPhase3 && v) { v.toP3 = true; return true; }
    if (e.randomTrophy) push(state, { op: 'skRandomTrophy', seat: p.seat, level: e.randomTrophy });
    return false;
}
STEPS.skRedirectAsk = (state, step) => {
    const v = state.sk.voyage;
    if (!v) return;
    ask(state, {
        seat: step.seat, kind: 'choice', title: 'Новый остров', text: `Можно переместиться на ${LOC[step.to].name} вместо изначально выбранной локации.`,
        options: [{ id: 'new', label: `Плыть: ${LOC[step.to].name}` }, { id: 'old', label: `Плыть, как собирались: ${LOC[v.to].name}` }],
        op: 'skRedirectDo', args: { seat: step.seat, to: step.to },
    });
};
STEPS.skRedirectDo = (state, step) => {
    const v = state.sk.voyage;
    if (!v || step.choice !== 'new') return;
    v.to0 = v.to; v.to = step.to;
    log(state, `${state.players[step.seat].name} плывёт на ${LOC[step.to].name}`);
};

/** «Получите трофей случайного монстра N уровня (не перемещайте жетон трофеев)». */
STEPS.skRandomTrophy = (state, step) => {
    const p = state.players[step.seat];
    const stack = state.monsterStacks[step.level] || [];
    if (!stack.length) { log(state, `${p.name}: в стопке монстров ${'I'.repeat(step.level)} уровня нет жетонов — трофея нет`); return; }
    const id = stack.splice(randInt(state, stack.length), 1)[0];
    log(state, `${p.name} получает трофей случайного монстра ${'I'.repeat(step.level)} уровня: ${MONSTER[id].name} (жетон убран из игры)`, { kind: 'victory' });
    push(state, { op: 'gainTrophy', seat: p.seat, kind: 'monster', id, noTrack: true });
};

// ---------------------------------------------------------------------------------------------
// Island actions (pp. 5, 11) — `loc` command → here, after the action is marked used
// ---------------------------------------------------------------------------------------------
const trophiesOf = (p, lvl) => p.trophies.filter(t => t.kind === 'monster' && MONSTER[t.id] && MONSTER[t.id].level === lvl && !MONSTER[t.id].legend);
export function skLocError(state, p, kind) {
    switch (kind) {
        case 'skAnySkill': return ['combat', 'defense', 'alchemy', 'spec'].some(s => p.skills[s] < 5) ? null : 'Все навыки уже 5';
        case 'skMist': return mistChoices(state, p).some(c => !c.err) ? null : 'В ряду нет карт стоимости 0 (или 1 и золота)';
        case 'skEyna': return eynaChoices(state, p).some(c => !c.err) ? null : 'Нет подходящего трофея (или стопки монстров пусты)';
        case 'skHenInis': return trophiesOf(p, 1).length > 1 ? 'У вас больше 1 трофея монстра I уровня' : !state.monsterStacks[1].length ? 'Стопка монстров I уровня пуста' : null;
        case 'skHunt': return [1, 2, 3].some(l => state.monsterStacks[l].length) ? null : 'Стопки монстров пусты';
    }
    return null;
}
function mistChoices(state, p) {
    const has = (c) => rowOf(state, p).some(id => id && CARDS[id].cost === c);
    return [
        { id: 'zero', label: 'Карта стоимости 0 из ряда → в сброс', err: has(0) ? null : 'В ряду нет карты стоимости 0' },
        { id: 'one', label: '1 золото → карта стоимости 1 из ряда в сброс', err: !has(1) ? 'В ряду нет карты стоимости 1' : p.gold < 1 ? 'Нужно 1 золото' : null },
    ];
}
function eynaChoices(state, p) {
    const t1 = trophiesOf(p, 1), t2 = trophiesOf(p, 2);
    return [
        { id: 'none', label: 'Нет трофеев I/II уровня → трофей случайного монстра I уровня', err: t1.length || t2.length ? 'У вас есть трофей I или II уровня' : !state.monsterStacks[1].length ? 'Стопка I уровня пуста' : null },
        { id: 'up1', label: 'Убрать трофей I уровня → трофей случайного монстра II уровня', err: !t1.length ? 'Нет трофея I уровня' : !state.monsterStacks[2].length ? 'Стопка II уровня пуста' : null },
        { id: 'up2', label: 'Убрать трофей II уровня → трофей случайного монстра III уровня', err: !t2.length ? 'Нет трофея II уровня' : !state.monsterStacks[3].length ? 'Стопка III уровня пуста' : null },
    ];
}
/** Pick among options, or take the only possible one (bots: the first). */
function choose(state, p, title, text, opts, op, args) {
    const okk = opts.filter(o => !o.err);
    if (!okk.length) return;
    if (okk.length === 1 || p.bot || p.away) { push(state, { op, ...args, choice: okk[okk.length - 1].id }); return; }
    ask(state, { seat: p.seat, kind: 'choice', title, text, options: opts.map(o => ({ id: o.id, label: o.label, disabled: !!o.err, hint: o.err || undefined })), op, args });
}
STEPS.skLocAction = (state, step) => {
    const p = state.players[step.seat];
    const name = LOC[p.loc].name;
    switch (step.kind) {
        case 'skAnySkill': push(state, { op: 'eventSkillPick', seat: p.seat, mode: 'any', left: 1, done: [] }); return;
        case 'skMist': choose(state, p, name, 'Выполните 1 из действий на выбор.', mistChoices(state, p), 'skMistDo', { seat: p.seat }); return;
        case 'skEyna': choose(state, p, name, 'Выполните 1 из действий на выбор. Жетон трофеев не перемещается, истощения нет.', eynaChoices(state, p), 'skEynaDo', { seat: p.seat }); return;
        case 'skHenInis': push(state, { op: 'skRandomTrophy', seat: p.seat, level: 1 }); return;
        case 'skGold3': p.gold += 3; log(state, `${p.name}: +3 золота (${name})`); fx(state, { k: 'gold', seat: p.seat, n: 3 }); return;
        case 'skElixir4': push(state, { op: 'gainElixir', seat: p.seat, n: 4, why: name, noLimit: true }, { op: 'skElixirCap', seat: p.seat }); return;
        case 'skTracks': push(state, { op: 'eventTrackAll', seat: p.seat }); return;
        case 'skHunt': {
            const opts = [1, 2, 3].map(l => ({ id: String(l), label: `Стопка монстров ${'I'.repeat(l)} уровня (${state.monsterStacks[l].length})`, err: state.monsterStacks[l].length ? null : 'Стопка пуста' }));
            if (p.bot || p.away) { const l = opts.filter(o => !o.err).map(o => Number(o.id)).sort((a, b) => a - b)[0]; if (l) push(state, { op: 'skHuntStart', seat: p.seat, choice: String(l) }); return; }
            choose(state, p, name, 'Выберите стопку монстров: случайный жетон из неё — битва в фазу II.', opts, 'skHuntStart', { seat: p.seat });
            return;
        }
    }
};
STEPS.skMistDo = (state, step) => {
    const p = state.players[step.seat];
    if (step.choice === 'one') { p.gold -= 1; log(state, `${p.name}: −1 золото`); }
    push(state, { op: 'eventRowCard', seat: p.seat, cost: step.choice === 'one' ? 1 : 0 });
};
STEPS.skEynaDo = (state, step) => {
    const p = state.players[step.seat];
    if (step.choice === 'none') { push(state, { op: 'skRandomTrophy', seat: p.seat, level: 1 }); return; }
    const lvl = step.choice === 'up1' ? 1 : 2;
    const list = trophiesOf(p, lvl);
    if (!list.length) return;
    if (list.length === 1 || p.bot || p.away) { push(state, { op: 'skEynaSwap', seat: p.seat, choice: list[0].id, level: lvl }); return; }
    ask(state, { seat: p.seat, kind: 'choice', title: 'Эйна', text: `Какой трофей ${'I'.repeat(lvl)} уровня убрать из игры?`, options: [...new Set(list.map(t => t.id))].map(id => ({ id, label: MONSTER[id].name })), op: 'skEynaSwap', args: { seat: p.seat, level: lvl } });
};
STEPS.skEynaSwap = (state, step) => {
    const p = state.players[step.seat];
    const i = p.trophies.findIndex(t => t.kind === 'monster' && t.id === step.choice);
    if (i < 0) return;
    p.trophies.splice(i, 1);
    log(state, `${p.name} убирает из игры трофей «${MONSTER[step.choice].name}»`);
    push(state, { op: 'skRandomTrophy', seat: p.seat, level: step.level + 1 });
};
STEPS.skElixirCap = (state, step) => {
    const p = state.players[step.seat];
    if (p.elixirs.length > 4) push(state, { op: 'eventElixirLoss', seat: p.seat, n: p.elixirs.length - 4 });
};

// ---------------------------------------------------------------------------------------------
// Fights: Dagon, Сирена, the monster of Хвандр Хеванги
// ---------------------------------------------------------------------------------------------
function newFight(state, p, mon, extra) {
    const n = state.players.length;
    const controller = n === 1 ? null : (p.seat - 1 + n) % n;
    state.turn.phase = 2;
    state.fight = {
        kind: 'monster', seat: p.seat, slot: null, mon: mon.id, level: mon.level, terrain: 'joker', loc: p.loc,
        controller, chooser: controller, life: [], monDiscard: [], turn: null, wTurns: 0, mTurns: 0,
        elixirsUsed: 0, usedElixirs: [], usedBombs: [], once: {}, cur: null, lastCombo: null, lastAttack: null, stage: 'busy', over: null,
        track: false, pendingHarpy: false, vuln: false, dice: 0, nextW: null, nextM: null, mCur: null, whole: {},
        ...extra,
    };
}
export function skFightError(state, p) {
    if (!state.sk || p.loc !== DAGON_LOC) return 'Нужно быть в локации Дагона';
    if (!dagonLocOpen(state)) return 'Дагона (и сирены) здесь нет';
    return null;
}
STEPS.skFightStart = (state, step) => {
    const p = state.players[step.seat];
    if (skFightError(state, p)) return;
    const dagon = dagonUp(state);
    const mon = MONSTER[dagon ? 'DAGON' : 'MON-31'];
    // «По следу монстра»: Dagon (and Сирена) use the special side of Dagon's card, no vulnerabilities.
    newFight(state, p, mon, { sk: dagon ? 'dagon' : 'siren', track: dagon && !!p.skToken, vuln: vulnOn(state), bigAs: 'DAGON' });
    log(state, `${p.name} вступает в битву: ${mon.name} (уровень ${mon.level}, жизнь ${mon.life})`, { kind: 'fight' });
    fx(state, { k: 'fightStart', seat: p.seat, mon: mon.id });
    push(state, { op: 'trapCheck', seat: p.seat, on: 'fightStart' }, F('mushroomAsk'), F('preLife'), F('formLife'), F('postLife'), F('firstTurn'));
};
STEPS.skHuntStart = (state, step) => {
    const p = state.players[step.seat];
    const lvl = Number(step.choice);
    const stack = state.monsterStacks[lvl];
    if (!stack || !stack.length) return;
    const id = stack.splice(randInt(state, stack.length), 1)[0];
    // Phase I ends at once (as for the usual fight): secret cards, ruin tokens — then the fight.
    push(state, { op: 'trapCheck', seat: p.seat, on: 'endPhase1' }, ...(state.legend ? [{ op: 'ruinPickup', seat: p.seat }] : []), { op: 'skHuntFight', seat: p.seat, id, level: lvl });
};
STEPS.skHuntFight = (state, step) => {
    const p = state.players[step.seat];
    const mon = MONSTER[step.id];
    newFight(state, p, mon, { sk: 'hunt', huntLevel: step.level, vuln: vulnOn(state) && !!BIG[mon.id] });
    log(state, `${p.name}: ${LOC[p.loc].name} — битва со случайным монстром ${'I'.repeat(step.level)} уровня: ${mon.name}`, { kind: 'fight' });
    fx(state, { k: 'fightStart', seat: p.seat, mon: mon.id });
    push(state, { op: 'trapCheck', seat: p.seat, on: 'fightStart' }, F('mushroomAsk'), F('preLife'), F('formLife'), F('postLife'), F('firstTurn'));
};
/** Dagon's ability (Дагон.md): at the start of his first turn — a random hand card, then shield −1 per trophy. */
export function dagonFirstTurn(state) {
    const f = state.fight;
    if (f.mTurns !== 0 || f.mon !== 'DAGON' || f.noAbility || f.once.dagon) return false;
    f.once.dagon = true; f.stage = 'busy';
    log(state, 'Дагон: в начале первого хода — случайная карта из руки и −1 щит за каждый трофей', { kind: 'attack' });
    push(state, F('randomDiscard', { n: 1, why: 'Дагон', noDeck: true }), F('skDagonShield'), F('monsterTurn'));
    return true;
}
STEPS.skDagonShield = (state) => {
    const p = fp(state);
    const n = p.trophies.length;
    const before = p.shield;
    p.shield = Math.max(0, p.shield - n);
    log(state, `${p.name}: трофеев ${n} — щит ${before} → ${p.shield} (Дагон)`);
};

/** Consequences instead of the usual ones (p. 10; Сирена; Хвандр Хеванги). */
export function skConsequences(state, f, p, mon) {
    const sk = state.sk, t = state.turn;
    const steps = [];
    let result;
    const chased = f.over === 'win' || f.life.length <= 1;
    if (f.sk === 'dagon') {
        if (chased) {
            result = f.over === 'win' ? 'win' : 'chase';
            sk.track = sk.start;
            p.gold += 2;
            log(state, `${p.name} прогоняет Дагона! Дагон — на начальное деление, +2 золота, карта стоимости 0 и дар Дагона`, { kind: 'victory' });
            fx(state, { k: 'dagon', track: sk.track });
            if (sk.siren) log(state, 'Сирена возвращается в локацию Дагона');
            steps.push({ op: 'takeZeroCard', seat: p.seat }, { op: 'skGift', seat: p.seat });
        } else {
            result = 'lose';
            log(state, `${p.name} терпит поражение от Дагона: ${p.skToken ? '' : 'жетон следа Дагона, '}карта стоимости 0, в фазу III −1 карта`, { kind: 'defeat' });
            p.skToken = true;
            t.drawDelta -= 1;
            steps.push({ op: 'takeZeroCard', seat: p.seat });
        }
    } else if (f.sk === 'siren') {
        if (f.over === 'win') {
            result = 'win';
            p.gold += 2;
            sk.siren = false;
            log(state, `${p.name} побеждает сирену: +2 золота и трофей (жетон трофеев не двигается). Сирена убрана из игры`, { kind: 'victory' });
            steps.push({ op: 'gainTrophy', seat: p.seat, kind: 'monster', id: mon.id, noTrack: true });
        } else if (chased) {
            result = 'chase';
            p.gold += 2;
            sk.siren = false;
            log(state, `${p.name} теряет сознание, но прогоняет сирену: +2 золота и карта стоимости 0. Сирена убрана из игры`, { kind: 'chase' });
            steps.push({ op: 'takeZeroCard', seat: p.seat });
        } else {
            result = 'lose';
            log(state, `${p.name} терпит поражение от сирены: карта стоимости 0, в фазу III −1 карта (жетона следа у сирены нет)`, { kind: 'defeat' });
            t.drawDelta -= 1;
            steps.push({ op: 'takeZeroCard', seat: p.seat });
        }
    } else {
        // Хвандр Хеванги: the usual fight; no new monster; not won — back into its stack.
        if (f.over === 'win') {
            result = 'win';
            p.gold += 2;
            p.monstersDefeated++;
            log(state, `${p.name} побеждает: ${mon.name}! +2 золота и трофей`, { kind: 'victory' });
            steps.push({ op: 'gainTrophy', seat: p.seat, kind: 'monster', id: mon.id });
        } else {
            result = chased ? 'chase' : 'lose';
            const stack = state.monsterStacks[mon.level];
            stack.push(mon.id); shuffle(state, stack);
            if (chased) { p.gold += 2; log(state, `${p.name} теряет сознание, но прогоняет монстра (${mon.name}): +2 золота и карта стоимости 0; жетон — обратно в стопку`, { kind: 'chase' }); }
            else { t.drawDelta -= 1; log(state, `${p.name} терпит поражение (${mon.name}): карта стоимости 0, в фазу III −1 карта; жетон — обратно в стопку`, { kind: 'defeat' }); }
            steps.push({ op: 'takeZeroCard', seat: p.seat });
        }
    }
    f.result = result;
    if (f.bonusGold && result !== 'lose') { p.gold += f.bonusGold; log(state, `${p.name}: +${f.bonusGold} золото (событие)`); }
    fx(state, { k: 'fightEnd', seat: p.seat, result, mon: mon.id });
    steps.push({ op: 'fightCleanup' });
    if (result === 'win' && f.sk === 'hunt') steps.push({ op: 'trapCheck', seat: p.seat, on: 'defeat' });
    if (f.elixirsUsed) steps.push({ op: 'trapCheck', seat: p.seat, on: 'fightEnd' });
    steps.push({ op: 'phase3' });
    push(state, ...steps);
}
STEPS.skGift = (state, step) => {
    const p = state.players[step.seat], sk = state.sk;
    if (!sk.gifts.length) { log(state, 'Дары Дагона закончились'); return; }
    const id = sk.gifts.pop();
    (p.gifts || (p.gifts = [])).push(id);
    if (state.fight) state.fight.newGift = id;
    log(state, `${p.name} получает дар Дагона: ${GIFT[id].text}`, { kind: 'victory' });
    fx(state, { k: 'gift', seat: p.seat, id });
};
/** Common effect of every gift: after any battle of its holder Dagon goes up (not the battle where it was gained). */
export function skAfterBattle(state, seats, newGift) {
    if (!state.sk) return;
    let n = 0;
    for (const s of seats) n += giftsOf(state.players[s]).filter(g => g !== newGift).length;
    if (n) push(state, { op: 'skDagonMove', n, why: `дары Дагона (${n})` });
}

// ---------------------------------------------------------------------------------------------
// Gifts 02 (water travel), 04 (swap after phase III), 05 (ship locations)
// ---------------------------------------------------------------------------------------------
const CONT_WATER = () => Object.values(LOC).filter(l => l.n >= 0 && l.n <= 18 && l.terrain === 'water').map(l => l.n);
export function gift02Error(state, p) {
    if (!hasGift(p, 'DAGON-GIFT-02')) return 'Нет этого дара';
    const t = state.turn;
    if (!t || t.seat !== p.seat || t.phase !== 1 || t.afterExplore) return 'Только в фазе I своего хода';
    if (t.g02) return 'Уже использовано в этот ход';
    if (!CONT_WATER().includes(p.loc)) return 'Нужно быть в водной локации Континента';
    if (!p.hand.length) return 'Нужна карта в руке';
    return null;
}
STEPS.skGift02Ask = (state, step) => {
    const p = state.players[step.seat];
    ask(state, { seat: p.seat, kind: 'cards', from: 'hand', ui: 'hand', ids: p.hand.slice(), min: 1, max: 1, title: 'Дар Дагона', text: 'Сбросьте 1 карту из руки, чтобы переместиться в другую водную локацию Континента.', op: 'skGift02Pay', args: { seat: p.seat } });
};
STEPS.skGift02Pay = (state, step) => {
    const p = state.players[step.seat];
    const id = step.ids[0];
    removeFrom(p.hand, id); p.discard.push(id);
    log(state, `${p.name} сбрасывает «${CARDS[id].name}» (дар Дагона)`);
    const opts = CONT_WATER().filter(n => n !== p.loc).map(n => ({ id: String(n), label: LOC[n].name, hint: TERRAIN_NAME.water }));
    ask(state, { seat: p.seat, kind: 'choice', ui: 'move', title: 'Дар Дагона', text: 'Переместитесь в любую другую водную локацию Континента. Затем можете выполнить её действие.', options: opts, op: 'skGift02Move', args: { seat: p.seat } });
};
STEPS.skGift02Move = (state, step) => {
    const p = state.players[step.seat], t = state.turn;
    const from = p.loc, to = Number(step.choice);
    skLeaving(state, p, false);
    p.loc = to; t.moved = true;
    log(state, `${p.name}: ${LOC[from].name} → ${LOC[to].name} (дар Дагона)`, { kind: 'move' });
    fx(state, { k: 'move', seat: p.seat, from, to, cards: [] });
    push(state, { op: 'arrive', seat: p.seat });
};

/** Gift 04 (once per turn, after phase III): remove a hand card → a row card of that cost or +1. */
export function gift04Pending(state, p) {
    const t = state.turn;
    if (!hasGift(p, 'DAGON-GIFT-04') || !t || t.g04 || !p.hand.length) return false;
    return p.hand.some(h => rowOf(state, p).some(r => r && (CARDS[r].cost === CARDS[h].cost || CARDS[r].cost === CARDS[h].cost + 1)));
}
STEPS.skGift04Ask = (state, step) => {
    const p = state.players[step.seat];
    state.turn.g04 = true;
    const ids = p.hand.filter(h => rowOf(state, p).some(r => r && (CARDS[r].cost === CARDS[h].cost || CARDS[r].cost === CARDS[h].cost + 1)));
    if (p.bot || p.away) return;
    ask(state, { seat: p.seat, kind: 'cards', from: 'hand', ui: 'hand', ids, min: 0, max: 1, title: 'Дар Дагона', text: 'Можно убрать из игры 1 карту из руки и взять в руку карту из ряда той же напечатанной стоимости или на 1 выше.', op: 'skGift04Pick', args: { seat: p.seat } });
};
STEPS.skGift04Pick = (state, step) => {
    const p = state.players[step.seat];
    const h = (step.ids || [])[0];
    if (!h) return;
    const c = CARDS[h].cost;
    const cand = rowOf(state, p).filter(r => r && (CARDS[r].cost === c || CARDS[r].cost === c + 1));
    if (!cand.length) return;
    removeFrom(p.hand, h); p.removed.push(h);
    log(state, `${p.name} убирает из игры «${CARDS[h].name}» (дар Дагона)`);
    fx(state, { k: 'removed', seat: p.seat, id: h });
    ask(state, { seat: p.seat, kind: 'cards', from: 'row', ids: cand, min: 1, max: 1, title: 'Дар Дагона', text: 'Возьмите в руку карту из ряда.', op: 'skGift04Take', args: { seat: p.seat } });
};
STEPS.skGift04Take = (state, step) => {
    const p = state.players[step.seat];
    const id = step.ids[0];
    const i = rowOf(state, p).indexOf(id);
    if (i < 0) return;
    rowOf(state, p)[i] = null;
    p.hand.push(id);
    log(state, `${p.name} берёт в руку «${CARDS[id].name}» из ряда (дар Дагона)`);
    fx(state, { k: 'gain', seat: p.seat, id, to: 'hand', slot: i });
    refillRow(state);
};

/** Gift 05: entering a Continent location with a ship and not sailing to an island from it. */
export function skArrived(state, p) {
    const t = state.turn;
    if (!state.sk || !t || t.seat !== p.seat || !hasGift(p, 'DAGON-GIFT-05')) return;
    if (onSea(p.loc) || !state.sk.ships.includes(p.loc) || (t.g05done || []).includes(p.loc)) { t.g05 = null; return; }
    t.g05 = p.loc;
}
/** The witcher leaves its location (or ends phase I there): gift 05 pays unless it sails to an island. */
export function skLeaving(state, p, toIsland) {
    const t = state.turn;
    if (!t || t.g05 == null || t.g05 !== p.loc) return;
    const loc = t.g05;
    t.g05 = null;
    if (toIsland) return;
    (t.g05done || (t.g05done = [])).push(loc);
    p.gold += 1;
    const n = drawCards(state, p, 1);
    log(state, `${p.name}: дар Дагона (${LOC[loc].name}) — эликсир, +1 золото${n ? ', +1 карта' : ''}`);
    fx(state, { k: 'gold', seat: p.seat, n: 1 });
    push(state, { op: 'gainElixir', seat: p.seat, n: 1, why: 'дар Дагона' });
}
/** SK-EX-12C / SK-EX-32D: after the island's action — straight to phase III. */
STEPS.skP3Now = (state, step) => {
    const t = state.turn;
    if (!t || t.phase !== 1 || t.p3queued || state.fight) return;
    t.phase = 2; t.afterExplore = false; t.p3queued = true;
    log(state, `${state.players[step.seat].name} сразу переходит к фазе III`);
    push(state, { op: 'trapCheck', seat: step.seat, on: 'endPhase1' }, { op: 'phase3' });
};
