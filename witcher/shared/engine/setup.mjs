// Game setup (База.md pp. 6–8, solo p. 33).
import { STARTER, COMMON, POTIONS, SKILLTROPHIES } from '../data/gen-data.mjs';
import { bombDeckIds } from '../data/bombs-data.mjs';
import { setupAttackDeck, onMonsterAppears, vulnOn } from './vuln.mjs';
import './vtoken.mjs';
import { setupLegend } from './legend.mjs';
import { setupSkellige } from './skellige.mjs';
import { SCHOOLS, START_RES, BASE_MONSTERS, TERRAINS, SKILL_NAME, skillName, normalizeRules, normalizeExp, trailOn } from '../data/rules-data.mjs';
import { MASTERS, MUTAGENS, UNIQUE_OF } from '../data/trail-data.mjs';
import { MONSTER, LOC, CARDS, shuffle, randInt, log, drawCards } from './util.mjs';
import { MAGE_COMMON, MAGE_START, MAGE_UNIQUES } from '../data/mages-data.mjs';
import { LOC_ACTIONS } from '../data/rules-data.mjs';
import { push, run, ask } from './flow.mjs';

/**
 * @param {{ players: { name: string, school: string, bot?: number }[], seed?: number, randomFirst?: boolean, sandbox?: string }} opts
 */
export function createGame(opts) {
    const n = opts.players.length;
    if (n < 1 || n > 5) throw new Error('1–5 players');
    const state = {
        v: 1, rng: (opts.seed ?? Date.now()) | 0, seed: opts.seed ?? null,
        stage: 'setup', round: 1, solo: n === 1, sandbox: opts.sandbox || null,
        players: [], turn: null, fight: null, prompt: null, queue: [], log: [], events: [],
        row: [], actionDeck: [], elixirDeck: [], elixirDiscard: [], bombDeck: [], bombDiscard: [],
        skillTrophies: [], locPiles: {}, slots: [], monsterStacks: { 1: [], 2: [], 3: [] }, chased: { 1: [], 2: [], 3: [] },
        extraStack: [], attackDeck: [], closedTavern: null, winner: null, removedRow: [],
        ...normalizeRules(opts.mode, opts.rules), exp: normalizeExp(opts.exp), eventsUsed: [],
    };
    let order = opts.players.map((p, i) => i);
    if (opts.randomFirst) shuffle(state, order);
    const lobby = order.map(i => opts.players[i]);

    // 2. Action deck and row: three cost-0 cards to the right, three random to the left.
    // «По следу монстра»: the master action sets are shuffled into the action deck.
    state.actionDeck = shuffle(state, [...COMMON.map(c => c.id), ...(trailOn(state, 'masters') ? MASTERS.map(c => c.id) : [])]);
    const zeros = [], others = [];
    while (zeros.length < 3) {
        const id = state.actionDeck.shift();
        (CARDS[id].cost === 0 ? zeros : others).push(id);
    }
    state.actionDeck.push(...others);
    shuffle(state, state.actionDeck);
    shuffle(state, zeros);
    state.row = [state.actionDeck.shift(), state.actionDeck.shift(), state.actionDeck.shift(), ...zeros];

    // 3. Elixirs: 4 copies of each of 7.
    state.elixirDeck = shuffle(state, POTIONS.flatMap(p => [1, 2, 3, 4].map(k => p.id + '#' + k)));
    // «По следу монстра»: the bomb deck lies next to the elixirs (4 copies of each bomb in play).
    if (trailOn(state, 'bombs')) state.bombDeck = shuffle(state, bombDeckIds(trailOn(state, 'vuln')));

    // 4. Skill trophies.
    if (n === 1) {
        const one = SKILLTROPHIES[randInt(state, SKILLTROPHIES.length)];
        state.skillTrophies = [one.id + '#1'];
    } else if (n <= 3) state.skillTrophies = SKILLTROPHIES.map(t => t.id + '#1');
    else state.skillTrophies = SKILLTROPHIES.flatMap(t => [t.id + '#1', t.id + '#2']);

    // 7. Location tokens: 6 per terrain, Continent locations 1–18 («Скеллиге»: + the islands 19–21).
    const lastLoc = state.exp.includes('skellige') ? 21 : 18;
    for (const t of TERRAINS) {
        state.locPiles[t] = shuffle(state, Object.values(LOC).filter(l => l.n >= 1 && l.n <= lastLoc && l.terrain === t).map(l => l.n));
    }

    // 8. Monsters.
    for (const id of [...BASE_MONSTERS, ...(trailOn(state, 'troll') ? ['MON-30'] : []), ...(state.exp.includes('mages:koshchei') ? ['MON-29'] : [])]) state.monsterStacks[MONSTER[id].level].push(id);
    // Mutagens: a face-down deck next to the board.
    state.mutagenDeck = trailOn(state, 'mutagens') ? shuffle(state, MUTAGENS.map(m => m.id)) : [];
    for (const l of [1, 2, 3]) shuffle(state, state.monsterStacks[l]);
    let levels = [1, 1, 1];
    if (n === 1) levels = [1, 2, 3];
    else if (n === 2) levels = [1, 1, 2];
    const slotTerrains = TERRAINS.slice();
    state.slots = slotTerrains.map(t => ({ terrain: t, token: state.locPiles[t].pop(), mon: null }));
    if (n === 2) {
        // The first player chooses where the level II monster goes — resolved by a prompt below.
        state.pendingMons = [state.monsterStacks[1].pop(), state.monsterStacks[1].pop()];
    } else {
        state.slots.forEach((s, i) => { s.mon = state.monsterStacks[levels[i]].pop(); });
    }
    if (n === 4) state.extraStack = [state.monsterStacks[1].pop()];
    if (n === 5) state.extraStack = [state.monsterStacks[1].pop(), state.monsterStacks[1].pop()];

    // Monster combat deck («Уязвимости и особые атаки»: 12 base + 4 special cards, see vuln.mjs).
    setupAttackDeck(state);
    for (const s of state.slots) if (s.mon) onMonsterAppears(state, s.mon);

    // «Легендарная охота»: the legendary monster, its movement deck, the ruin supply (after the
    // base setup so the base RNG sequence is unchanged without the expansion).
    setupLegend(state);
    // «Скеллиге»: the Skellige decks, ships and the Dagon track (after the base setup as well).
    setupSkellige(state, n);

    // «Чародеи» (p. 4): the mage action deck and its row above the normal one (after the base
    // setup so the base RNG sequence is unchanged). If every player is a mage, the mage cards take
    // the places of the normal row and deck.
    const mageSeats = lobby.map((lp, i) => (SCHOOLS[lp.school] && SCHOOLS[lp.school].mage ? i : -1)).filter(i => i >= 0);
    if (mageSeats.length) {
        if (!state.exp.includes('mages')) state.exp.push('mages');
        const deck = shuffle(state, MAGE_COMMON.map(c => c.id));
        const z = [], o = [];
        while (z.length < 3) { const id = deck.shift(); (CARDS[id].cost === 0 ? z : o).push(id); }
        deck.push(...o);
        shuffle(state, deck);
        shuffle(state, z);
        const row = [deck.shift(), deck.shift(), deck.shift(), ...z];
        if (mageSeats.length === n) { state.removedRow.push(...state.row); state.row = row; state.actionDeck = deck; state.normalRowBoxed = true; }
        else { state.mrow = row; state.mactionDeck = deck; }
    }

    // 10. Players.
    lobby.forEach((lp, seat) => {
        const school = SCHOOLS[lp.school] ? lp.school : 'wolf';
        const mage = !!SCHOOLS[school].mage;
        // Unique actions: the hero's own card goes into the starting deck (11 cards).
        // «Чародеи»: the mage's personal card (Маги/Уникальные карты.md) — the same rule.
        const deck = mage ? shuffle(state, [...MAGE_START.filter(c => c.mage === school).map(c => c.id), ...(trailOn(state, 'unique') ? MAGE_UNIQUES.filter(c => c.mage === school).map(c => c.id) : [])])
            : shuffle(state, [...STARTER.filter(c => c.school === school).map(c => c.id), ...(trailOn(state, 'unique') && UNIQUE_OF[school] ? [UNIQUE_OF[school]] : [])]);
        const [cards, gold] = n === 1 ? [5, 3] : START_RES[n][seat];
        const p = {
            seat, name: lp.name || SCHOOLS[school].hero, school, bot: lp.bot || 0, loc: SCHOOLS[school].home,
            ...(mage ? { mage: true, home: null, barrier: 0 } : {}),
            gold, hand: [], deck, discard: [], removed: [], elixirs: [], bombs: [],
            skills: { combat: 1, defense: 1, alchemy: 1, spec: 1 }, level: 1, shield: 1,
            trophies: [], track: 0, witcherTrophies: n - 1, trackTokens: { forest: null, mountain: null, water: null },
            hunts: [], quests: [], gear: [], keeps: [], mutagens: [], monstersDefeated: 0, turns: 0,
            ...(state.exp.includes('legendary') ? { ruins: [] } : {}),
        };
        state.players.push(p);
        drawCards(state, p, cards);
    });
    log(state, 'Партия началась: ' + state.players.map(p => `${p.name} (${SCHOOLS[p.school].school})`).join(', '));

    if (n === 2) {
        ask(state, {
            seat: 0, kind: 'choice', title: 'Монстр II уровня', ui: 'map',
            text: 'Первый игрок выбирает, рядом с каким жетоном локации появится монстр II уровня.',
            options: state.slots.map((s, i) => ({ id: String(i), label: `${LOC[s.token].name} (${s.terrain === 'forest' ? 'лес' : s.terrain === 'mountain' ? 'горы' : 'вода'})`, loc: s.token })),
            op: 'setupLevel2',
        });
    }
    // «Чародеи» (p. 4, step 5): after the witchers, each mage — from the last player backwards —
    // picks a free school location and starts there.
    for (const seat of mageSeats.slice().reverse()) state.queue.push({ op: 'mageStartAsk', seat });
    if (n >= 4) for (const p of state.players) state.queue.push({ op: 'setupSkillAsk', seat: p.seat });
    state.queue.push({ op: 'beginGame' });
    run(state);
    return state;
}

import { STEPS } from './flow.mjs';
STEPS.setupLevel2 = (state, step) => {
    const i = Number(step.choice);
    state.slots.forEach((s, k) => { s.mon = k === i ? state.monsterStacks[2].pop() : state.pendingMons.shift(); });
    delete state.pendingMons;
    for (const s of state.slots) if (s.mon) onMonsterAppears(state, s.mon);
    log(state, `Монстр II уровня появляется: ${LOC[state.slots[i].token].name}`);
};

/** School locations a mage may start in: not occupied by a player figure (Бехельт Нар only when
 *  the Manticore school is in the game). */
export function mageStartLocs(state) {
    return Object.keys(LOC_ACTIONS).map(Number).filter(n => LOC_ACTIONS[n].kind === 'school' && LOC[n] && (n !== 0 || trailOn(state, 'manticore')))
        .filter(n => !state.players.some(p => p.loc === n));
}
STEPS.mageStartAsk = (state, step) => {
    const p = state.players[step.seat];
    const locs = mageStartLocs(state);
    if (!locs.length) { push(state, { op: 'mageStartDo', seat: p.seat, choice: String(SCHOOLS.wolf.home) }); return; }
    if (p.bot) { push(state, { op: 'mageStartDo', seat: p.seat, choice: String(locs[randInt(state, locs.length)]) }); return; }
    ask(state, {
        seat: p.seat, kind: 'choice', title: `${p.name}: начальная локация`, ui: 'map',
        text: 'Выберите свободную локацию ведьмачьей школы: вы закроете её символ своим жетоном и начнёте игру там. Для вас это «локация своей школы».',
        options: locs.map(n => ({ id: String(n), label: LOC[n].name, loc: n })),
        op: 'mageStartDo', args: { seat: p.seat },
    });
};
STEPS.mageStartDo = (state, step) => {
    const p = state.players[step.seat];
    const n = Number(step.choice);
    p.loc = n; p.home = n;
    log(state, `${p.name} начинает игру в локации ${LOC[n].name} — она становится локацией школы чародея`);
};
STEPS.setupSkillAsk = (state, step) => {
    const p = state.players[step.seat];
    ask(state, {
        seat: p.seat, kind: 'choice', title: 'Подготовка к игре вчетвером/впятером',
        text: 'Выберите навык, который повышается на 1.',
        options: ['combat', 'defense', 'alchemy', 'spec'].map(s => ({ id: s, label: skillName(p, s) })),
        op: 'setupSkill', args: { seat: p.seat },
    });
};
STEPS.setupSkill = (state, step) => {
    push(state, { op: 'raiseSkill', seat: step.seat, skill: step.choice, why: 'подготовка' });
};
STEPS.beginGame = (state) => {
    state.stage = 'turn';
    // «Уязвимости и особые атаки»: 1 vulnerability token per monster on the board (after setup).
    push(state, ...(vulnOn(state) ? TERRAINS.map(terrain => ({ op: 'vtPlace', terrain })) : []), { op: 'startTurn', seat: 0 });
};
