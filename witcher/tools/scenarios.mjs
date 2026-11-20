// Sandbox saves («песочница»): ready-made positions loadable from the lobby — a fight test,
// a poker test and a mid-game table played by bots. node witcher/tools/scenarios.mjs
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { createGame, apply, options, actingSeat } from '../shared/engine/core.mjs';
import { viewFor } from '../shared/view.mjs';
import { botCommand } from '../shared/bots.mjs';
import { COMMON } from '../shared/data/gen-data.mjs';

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
    const free = COMMON.filter(x => !st.row.includes(x.id) && !st.actionDeck.slice(0, 0).includes(x.id));
    const pick = [free.find(x => x.color === 'blue' && x.links.length)];
    while (pick.length < 4) {
        const prev = pick[pick.length - 1];
        const next = free.find(x => !pick.includes(x) && prev.links.some(l => l.color === x.color) && x.links.length);
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

function save(name, st) {
    fs.mkdirSync(SAVES, { recursive: true });
    st.events = [];
    const seats = st.players.map(p => ({ name: p.name, school: p.school, bot: p.bot }));
    fs.writeFileSync(path.join(SAVES, name + '.json'), JSON.stringify({ v: 1, seats, state: st }));
    return name;
}
export function writeScenarios() {
    return [save('Песочница — битва', fightScenario()), save('Песочница — покер', pokerScenario()), save('Песочница — середина партии', midGameScenario())];
}
if (process.argv[1] && process.argv[1].endsWith('scenarios.mjs')) console.log(writeScenarios().join('\n'));
