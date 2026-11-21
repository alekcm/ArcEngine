// Bot matchup table: 1-on-1 bot games for every pair of heroes (each pair N games, seats
// alternate), then a Bradley–Terry fit ("strength" = win chance vs an average opponent) and the
// pairs that deviate from it most (a real counter-matchup would show a large |z|).
// Pairs are split across processes: node witcher/tools/matchups.mjs [N=160] [parts=2]
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { playGame } from './sim.mjs';

const HEROES = ['wolf', 'cat', 'bear', 'viper', 'griffin', 'ciri', 'manticore', 'alzur', 'ardea', 'gehira', 'otar', 'philippa'];
const EXP = { ciri: ['ciri'], manticore: ['trail:manticore'] };
const PAIRS = HEROES.flatMap((a, i) => HEROES.slice(i + 1).map(b => [a, b]));

function runPart(part, parts, N) {
    const out = {};
    PAIRS.forEach(([a, b], k) => {
        if (k % parts !== part) return;
        let wa = 0, wb = 0;
        for (let s = 1; s <= N; s++) {
            const { state } = playGame({ players: 2, seed: 5000 + s, exp: [...(EXP[a] || []), ...(EXP[b] || [])], schools: s % 2 ? [a, b] : [b, a] });
            if (state.winner == null) continue;
            if (state.players[state.winner].school === a) wa++; else wb++;
        }
        out[a + ':' + b] = [wa, wb];
    });
    return out;
}

function report(res) {
    const g = Object.entries(res).map(([k, [wa, wb]]) => [...k.split(':'), wa, wb]);
    const pct = (a, b) => { const r = res[a + ':' + b] || [...(res[b + ':' + a] || [0, 0])].reverse(); return Math.round(100 * r[0] / Math.max(1, r[0] + r[1])); };
    console.log('Победы строки против столбца, %:');
    console.log(['', ...HEROES.map(h => h.slice(0, 5))].join('\t'));
    for (const a of HEROES) console.log([a.slice(0, 5), ...HEROES.map(b => (a === b ? '-' : pct(a, b)))].join('\t'));
    let s = Object.fromEntries(HEROES.map(h => [h, 1]));
    for (let it = 0; it < 500; it++) {
        const n = {};
        for (const x of HEROES) {
            let w = 0, d = 0;
            for (const [a, b, wa, wb] of g) if (a === x || b === x) { w += a === x ? wa : wb; d += (wa + wb) / (s[a] + s[b]); }
            n[x] = w / d;
        }
        const gm = Math.exp(HEROES.reduce((t, x) => t + Math.log(n[x]), 0) / HEROES.length);
        for (const x of HEROES) s[x] = n[x] / gm;
    }
    console.log('\nСила (шанс против среднего соперника), %:');
    for (const x of [...HEROES].sort((a, b) => s[b] - s[a])) console.log(`  ${x}\t${Math.round(100 * s[x] / (s[x] + 1))}`);
    let chi = 0;
    const dev = g.map(([a, b, wa, wb]) => {
        const n = wa + wb, p = s[a] / (s[a] + s[b]), z = (wa - n * p) / Math.sqrt(n * p * (1 - p));
        chi += z * z;
        return { pair: a + ':' + b, real: Math.round(100 * wa / n), model: Math.round(100 * p), z };
    }).sort((x, y) => Math.abs(y.z) - Math.abs(x.z));
    console.log(`\nСильнее всего отклоняются от модели силы (χ² = ${chi.toFixed(1)} при ~${g.length - HEROES.length + 1} степенях свободы):`);
    for (const d of dev.slice(0, 6)) console.log(`  ${d.pair}\tфакт ${d.real}%, модель ${d.model}%, z = ${d.z.toFixed(1)}`);
}

if (process.argv[2] === '--part') {
    const [part, parts, N] = process.argv.slice(3).map(Number);
    process.send(runPart(part, parts, N));
} else if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const N = Number(process.argv[2] || 160), parts = Number(process.argv[3] || 2);
    const res = {};
    await Promise.all(Array.from({ length: parts }, (_, i) => new Promise((ok, fail) => {
        const c = fork(fileURLToPath(import.meta.url), ['--part', i, parts, N]);
        c.on('message', m => { Object.assign(res, m); ok(); });
        c.on('error', fail);
    })));
    report(res);
}
