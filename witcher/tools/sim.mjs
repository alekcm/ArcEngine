// Bot-vs-bot games: a rules smoke test. node witcher/tools/sim.mjs [games] [players]
import { createGame, apply, options, actingSeat } from '../shared/engine/core.mjs';
import { viewFor } from '../shared/view.mjs';
import { botCommand } from '../shared/bots.mjs';
import { SCHOOL_ORDER } from '../shared/data/rules-data.mjs';

export function playGame({ players = 3, seed = 1, maxSteps = 20000, verbose = false } = {}) {
    const state = createGame({ seed, players: Array.from({ length: players }, (_, i) => ({ name: 'Бот ' + (i + 1), school: SCHOOL_ORDER[(i + seed) % 5], bot: 1 })), mode: process.env.MODE || 'custom' });
    let steps = 0;
    let r = seed * 7919 + 13;
    const rand = () => { r = (r * 1103515245 + 12345) % 2147483648; return r / 2147483648; };
    while (state.stage !== 'over' && steps < maxSteps) {
        const seat = actingSeat(state);
        if (seat == null) throw new Error('nobody acts: ' + JSON.stringify({ turn: state.turn, fight: state.fight && state.fight.stage, q: state.queue }));
        const view = viewFor(state, seat);
        const cmd = botCommand(view, { options: options(state, seat), rand });
        if (!cmd) throw new Error('bot has no command at seat ' + seat + ' ' + JSON.stringify(view.prompt));
        const r = apply(state, seat, cmd);
        if (!r.ok) {
            throw new Error(`illegal bot command ${JSON.stringify(cmd)}: ${r.err}\nprompt=${JSON.stringify(state.prompt)}`);
        }
        steps++;
        if (state.round > 80) break;
    }
    if (verbose) for (const l of state.log.slice(-30)) console.log(l.t);
    return { state, steps };
}

if (process.argv[1] && process.argv[1].endsWith('sim.mjs')) {
    const games = Number(process.argv[2] || 5), players = Number(process.argv[3] || 3);
    for (let g = 0; g < games; g++) {
        const { state, steps } = playGame({ players, seed: g + 1, verbose: games === 1 });
        const w = state.winner != null ? state.players[state.winner].name : '—';
        console.log(`game ${g + 1}: rounds ${state.round}, steps ${steps}, winner ${w}, trophies ${state.players.map(p => p.track).join('/')}`);
    }
}
