// Fuzz the rules engine: play random valid answers until the game ends.
import { CHARACTERS } from '../shared/data/cards.mjs';
import { createGame } from '../shared/engine/setup.mjs';
import { answer } from '../shared/engine/core.mjs';

function rnd(n) { return Math.floor(Math.random() * n); }
function pickAnswer(p) {
    switch (p.kind) {
        case 'choice': { const ok = p.options.filter(o => !o.disabled); if (!ok.length) return p.cancel ? 'cancel' : null; return ok[rnd(ok.length)].id; }
        case 'room': return p.rooms[rnd(p.rooms.length)];
        case 'cards': { const n = p.min + rnd(p.max - p.min + 1); const c = [...p.cards].sort(() => Math.random() - 0.5); return c.slice(0, n); }
        case 'info': return 'ok';
        case 'dice': return 'roll';
        case 'turn': {
            const all = [];
            for (const a of p.actions || []) if (a.enabled) all.push({ action: a.id });
            for (const c of p.cards || []) if (c.enabled) all.push({ action: 'card', cardId: c.id });
            for (const i of p.items || []) if (i.enabled) all.push({ action: 'item', itemId: i.uid });
            if (!all.length) return { action: 'pass' };
            // bias away from passing
            const nonPass = all.filter(a => a.action !== 'pass');
            return nonPass.length && Math.random() < 0.85 ? nonPass[rnd(nonPass.length)] : all[rnd(all.length)];
        }
    }
    return null;
}
const seeds = Number(process.argv[2] || 20);
let fails = 0;
for (let s = 0; s < seeds; s++) {
    const seed = 'fuzz' + s;
    const mode = s % 2 ? 'random' : 'original';
    const ALL = Object.keys(CHARACTERS);
    const n = 2 + (s % 3);
    const chars = Array.from({ length: n }, (_, i) => ALL[(s * 5 + i * 7) % ALL.length]);
    let state;
    try {
        state = createGame({ seed, mode, players: chars.map((c, i) => ({ name: 'P' + i, charId: c })) });
        let steps = 0;
        while (!state.result && steps < 5000) {
            if (!state.prompt) throw new Error('no prompt and no result; queue=' + JSON.stringify(state.queue.slice(0, 3)));
            const a = pickAnswer(state.prompt);
            const pr = state.prompt;
            const ok = answer(state, pr.player, pr.id, a);
            if (!ok) throw new Error('answer rejected: ' + JSON.stringify(pr).slice(0, 300) + ' -> ' + JSON.stringify(a));
            steps++;
            JSON.stringify(state); // must be serialisable
        }
        if (!state.result) throw new Error('did not finish in 5000 steps; round=' + state.round + ' time=' + state.time + ' phase=' + state.phase + ' prompt=' + JSON.stringify(state.prompt).slice(0, 200));
        console.log(seed, mode, chars.length + 'p', 'rounds=' + state.round, 'steps=' + steps, state.result.results.map(r => (r.win ? 'W' : 'L')).join(''), state.result.results.map(r => r.why).join(' | '));
    } catch (e) {
        fails++;
        console.log('FAIL', seed, mode, e.stack.split('\n').slice(0, 4).join('\n'));
        if (state) console.log('  last log:', state.log.slice(-6).map(l => l.text).join(' / '));
    }
}
console.log('fails:', fails);
