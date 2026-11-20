// Game setup (База.md pp. 6–8, solo p. 33).
import { STARTER, COMMON, POTIONS, SKILLTROPHIES } from '../data/gen-data.mjs';
import { SCHOOLS, START_RES, BASE_MONSTERS, TERRAINS, SKILL_NAME } from '../data/rules-data.mjs';
import { MONSTER, LOC, shuffle, randInt, log, drawCards } from './util.mjs';
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
        row: [], actionDeck: [], elixirDeck: [], elixirDiscard: [],
        skillTrophies: [], locPiles: {}, slots: [], monsterStacks: { 1: [], 2: [], 3: [] }, chased: { 1: [], 2: [], 3: [] },
        extraStack: [], attackDeck: [], closedTavern: null, winner: null, removedRow: [],
    };
    let order = opts.players.map((p, i) => i);
    if (opts.randomFirst) shuffle(state, order);
    const lobby = order.map(i => opts.players[i]);

    // 2. Action deck and row: three cost-0 cards to the right, three random to the left.
    state.actionDeck = shuffle(state, COMMON.map(c => c.id));
    const zeros = [], others = [];
    while (zeros.length < 3) {
        const id = state.actionDeck.shift();
        (COMMON.find(c => c.id === id).cost === 0 ? zeros : others).push(id);
    }
    state.actionDeck.push(...others);
    shuffle(state, state.actionDeck);
    shuffle(state, zeros);
    state.row = [state.actionDeck.shift(), state.actionDeck.shift(), state.actionDeck.shift(), ...zeros];

    // 3. Elixirs: 4 copies of each of 7.
    state.elixirDeck = shuffle(state, POTIONS.flatMap(p => [1, 2, 3, 4].map(k => p.id + '#' + k)));

    // 4. Skill trophies.
    if (n === 1) {
        const one = SKILLTROPHIES[randInt(state, SKILLTROPHIES.length)];
        state.skillTrophies = [one.id + '#1'];
    } else if (n <= 3) state.skillTrophies = SKILLTROPHIES.map(t => t.id + '#1');
    else state.skillTrophies = SKILLTROPHIES.flatMap(t => [t.id + '#1', t.id + '#2']);

    // 7. Location tokens: 6 per terrain, Continent locations 1–18.
    for (const t of TERRAINS) {
        state.locPiles[t] = shuffle(state, Object.values(LOC).filter(l => l.n >= 1 && l.n <= 18 && l.terrain === t).map(l => l.n));
    }

    // 8. Monsters.
    for (const id of BASE_MONSTERS) state.monsterStacks[MONSTER[id].level].push(id);
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

    // Monster combat deck.
    state.attackDeck = shuffle(state, Array.from({ length: 20 }, (_, i) => 'MON-ATK-' + String(i + 1).padStart(2, '0')));

    // 10. Players.
    lobby.forEach((lp, seat) => {
        const school = SCHOOLS[lp.school] ? lp.school : 'wolf';
        const deck = shuffle(state, STARTER.filter(c => c.school === school).map(c => c.id));
        const [cards, gold] = n === 1 ? [5, 3] : START_RES[n][seat];
        const p = {
            seat, name: lp.name || SCHOOLS[school].hero, school, bot: lp.bot || 0, loc: SCHOOLS[school].home,
            gold, hand: [], deck, discard: [], removed: [], elixirs: [],
            skills: { combat: 1, defense: 1, alchemy: 1, spec: 1 }, level: 1, shield: 1,
            trophies: [], track: 0, witcherTrophies: n - 1, trackTokens: { forest: null, mountain: null, water: null },
            hunts: [], quests: [], gear: [], monstersDefeated: 0, turns: 0,
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
    if (n >= 4) {
        for (const p of state.players) push(state, { op: 'setupSkillAsk', seat: p.seat });
        state.queue.reverse(); // first player chooses first
    }
    state.queue.push({ op: 'beginGame' });
    run(state);
    return state;
}

import { STEPS } from './flow.mjs';
STEPS.setupLevel2 = (state, step) => {
    const i = Number(step.choice);
    state.slots.forEach((s, k) => { s.mon = k === i ? state.monsterStacks[2].pop() : state.pendingMons.shift(); });
    delete state.pendingMons;
    log(state, `Монстр II уровня появляется: ${LOC[state.slots[i].token].name}`);
};

STEPS.setupSkillAsk = (state, step) => {
    const p = state.players[step.seat];
    ask(state, {
        seat: p.seat, kind: 'choice', title: 'Подготовка к игре вчетвером/впятером',
        text: 'Выберите навык, который повышается на 1.',
        options: ['combat', 'defense', 'alchemy', 'spec'].map(s => ({ id: s, label: SKILL_NAME[s] })),
        op: 'setupSkill', args: { seat: p.seat },
    });
};
STEPS.setupSkill = (state, step) => {
    push(state, { op: 'raiseSkill', seat: step.seat, skill: step.choice, why: 'подготовка' });
};
STEPS.beginGame = (state) => {
    state.stage = 'turn';
    push(state, { op: 'startTurn', seat: 0 });
};
