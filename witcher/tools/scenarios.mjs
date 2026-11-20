// Sandbox saves («песочница»): ready-made positions loadable from the lobby — a fight test,
// a poker test, exploration (events, a quest, gear) and a mid-game table played by bots. node witcher/tools/scenarios.mjs
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { ensureExplore } from '../shared/engine/explore.mjs';
import { createGame, apply, options, actingSeat } from '../shared/engine/core.mjs';
import { viewFor } from '../shared/view.mjs';
import { botCommand } from '../shared/bots.mjs';
import { COMMON } from '../shared/data/gen-data.mjs';
import { LOC, ADJ, CARDS } from '../shared/engine/util.mjs';
import { canEnter } from '../shared/engine/turn.mjs';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const SAVES = path.join(HERE, '..', 'saves');

export function fightScenario(seed = 7) {
    const st = createGame({ seed, players: [{ name: 'Игрок', school: 'wolf' }, { name: 'Ламберт', school: 'cat', bot: 1 }] });
    if (st.prompt) apply(st, 0, { t: 'answer', choice: st.prompt.options[0].id });
    const p = st.players[0];
    const slot = st.slots.find(s => s.mon);
    p.loc = slot.token;
    st.turn.moved = true;
    // A stronger hand so every fight mechanic shows up: links of several colours.
    // Build a linked chain: each next card has the colour of one of the previous card's links.
    // Slice of fight cards: «Мощный Аард» (У1, связь З → Щ1) → «Блок» (Щ2, связи Ж/К → вернуть эту)
    // → a red card (Блок's red link returns it to the hand) + two more damage cards.
    const free = Object.values(CARDS).filter(x => !x.id.startsWith('W-START') && !st.row.includes(x.id));
    const byId = (id) => CARDS[id];
    const pick = [byId('W-B-11'), byId('W-B-01'), free.find(x => x.color === 'red' && x.fx.dmg)];
    while (pick.length < 5) {
        const prev = pick[pick.length - 1];
        const next = free.find(x => !pick.includes(x) && prev.links.some(l => l.color === x.color));
        if (!next) break;
        pick.push(next);
    }
    while (pick.length < 5) pick.push(free.find(x => !pick.includes(x) && x.fx.dmg));
    for (const c of pick) { const i = st.actionDeck.indexOf(c.id); if (i >= 0) st.actionDeck.splice(i, 1); }
    pick.splice(0, pick.length, ...pick.map(c => c.id));
    p.discard.push(...p.hand.splice(0));
    p.hand.push(...pick);
    p.skills.alchemy = 2; p.skills.defense = 2; p.shield = 2;
    p.elixirs.push('POTION-01#9', 'POTION-02#9');
    // A track token of this monster: the witcher strikes first, so the combo slice is playable at once.
    if (state_locPop(st, slot.terrain) != null) p.trackTokens[slot.terrain] = state_locPop(st, slot.terrain, true);
    p.gear.push('CONT79-15'); // «Кастет» (событие 15) — a fight action from exploration
    return st;
}
/** Exploration: gold for every option, an open quest one step away (a water location). */
export function exploreScenario(seed = 9) {
    const st = createGame({ seed, players: [{ name: 'Игрок', school: 'viper' }, { name: 'Цири', school: 'griffin', bot: 1 }] });
    if (st.prompt) apply(st, 0, { t: 'answer', choice: st.prompt.options[0].id });
    const p = st.players[0];
    p.gold = 4;
    const loc = Object.keys(LOC).map(Number).find(n => LOC[n].terrain === 'water' && st.locPiles.water.includes(n) && ADJ[n].some(m => m !== n && canEnter(st, m)));
    st.locPiles.water.splice(st.locPiles.water.indexOf(loc), 1);
    p.quests.push({ id: 'CONT81-15', terrain: 'water', loc, event: 'CONT79-41' });
    // The quest card is with the player — not in the deck (every card exists once).
    const decks = ensureExplore(st);
    decks.wild = decks.wild.filter(id => id !== 'CONT81-15');
    p.loc = ADJ[loc].find(m => canEnter(st, m));
    return st;
}
export function pokerScenario(seed = 8) {
    const st = createGame({ seed, players: [{ name: 'Игрок', school: 'griffin' }, { name: 'Эскель', school: 'bear', bot: 1 }] });
    if (st.prompt) apply(st, 0, { t: 'answer', choice: st.prompt.options[0].id });
    const p = st.players[0];
    p.loc = 6; p.gold = 6; st.turn.moved = true;
    return st;
}
export function midGameScenario(seed = 11, steps = 260) {
    const st = createGame({ seed, players: [{ name: 'Игрок', school: 'viper' }, { name: 'Весемир', school: 'wolf', bot: 1 }, { name: 'Койон', school: 'cat', bot: 1 }] });
    let n = 0;
    while (n < steps * 3 && st.stage !== 'over') {
        const seat = actingSeat(st);
        if (seat === 0 && n >= steps && !st.prompt && !st.fight && st.turn.phase === 1 && !st.turn.moved) break;
        const c = botCommand(viewFor(st, seat), { options: options(st, seat) });
        if (!c || !apply(st, seat, c).ok) break;
        n++;
    }
    st.players[0].bot = 0;
    return st;
}

function state_locPop(st, terrain, take = false) {
    const pile = st.locPiles[terrain];
    if (!pile.length) return null;
    return take ? pile.pop() : pile[pile.length - 1];
}
function save(name, st) {
    fs.mkdirSync(SAVES, { recursive: true });
    st.events = [];
    const seats = st.players.map(p => ({ name: p.name, school: p.school, bot: p.bot }));
    fs.writeFileSync(path.join(SAVES, name + '.json'), JSON.stringify({ v: 1, seats, state: st }));
    return name;
}
export function writeScenarios() {
    return [save('Песочница — битва', fightScenario()), save('Песочница — покер', pokerScenario()), save('Песочница — исследование', exploreScenario()), save('Песочница — середина партии', midGameScenario())];
}
if (process.argv[1] && process.argv[1].endsWith('scenarios.mjs')) console.log(writeScenarios().join('\n'));
