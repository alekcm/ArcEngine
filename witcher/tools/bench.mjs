// Bot strength benchmark: N bot games for 1–4 players (odd seeds with every «По следу монстра»
// module). Prints average rounds, finished games, seeds that hit the 80-round cap, witcher fights,
// monster victories and meditations (log lines; the log keeps only its tail, so counts are a floor).
// N=30 node witcher/tools/bench.mjs
import { playGame } from './sim.mjs';
import { TRAIL_ALL } from './scenarios.mjs';
const N = Number(process.env.N || 30);
const out = {};
for (const players of [1, 2, 3, 4]) {
    let rounds = 0, done = 0, cap = [], duels = 0, monWins = 0, med = 0;
    for (let seed = 1; seed <= N; seed++) {
        const exp = seed % 2 ? TRAIL_ALL : [];
        const { state } = playGame({ players, seed, exp });
        if (state.stage === 'over') { done++; rounds += state.round; } else cap.push(seed);
        duels += state.log.filter(l => /нападает на ведьмака/.test(l.t)).length;
        monWins += state.log.filter(l => /побеждает: /.test(l.t)).length;
        med += state.log.filter(l => /медитир/i.test(l.t)).length;
    }
    out[players] = { avgRounds: +(rounds / Math.max(1, done)).toFixed(1), done, cap: cap.join(','), duels, monWins, med };
}
console.log(JSON.stringify(out, null, 1));
