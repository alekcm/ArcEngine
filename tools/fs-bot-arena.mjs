#!/usr/bin/env node
// fs-bot-arena.mjs — the arena of the bots: two presets play each other over
// many parties, the seats alternate, and the tool counts who wins.
//
//   node tools/fs-bot-arena.mjs                       # Обычный против Новичка, 24 партии
//   node tools/fs-bot-arena.mjs --a=veteran --b=normal --games=40
//   node tools/fs-bot-arena.mjs --vs=орки,некроны --games=10 --rounds=6
//   node tools/fs-bot-arena.mjs --personas=orks-waaagh,necrons-harvest --vs=орки,некроны
//   node tools/fs-bot-arena.mjs --expect=0.6          # exit 1 when A wins less than 60 % of the decided parties
//   node tools/fs-bot-arena.mjs --trace=0 --labels=placeOrder,moveUnits --games=1  # watch seat 0 think
//
// A party is decided by the game itself (GameOutcome); a shared victory
// counts to nobody. The factions rotate with the seed unless --vs fixes them;
// the preset A sits at seat 0 in the even parties and at seat 1 in the odd
// ones, so the first player's advantage cancels out.

import { createEngineContext } from './fs-engine.mjs';

const args = Object.fromEntries(process.argv.slice(2).filter(a => a.startsWith('--')).map(a => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v === undefined ? true : v];
}));
const GAMES = Number(args.games) || 24;
const ROUNDS = Number(args.rounds) || 8;
const A = args.a || 'normal', B = args.b || 'novice';
const PLAYERS = Math.min(4, Math.max(2, Number(args.players) || 2));
const EXPECT = args.expect === undefined ? null : Number(args.expect);
const VS = args.vs ? String(args.vs).split(',').map(x => x.trim()).filter(Boolean) : null;
const PERSONAS = args.personas ? String(args.personas).split(',') : [];
const TRACE = args.trace === undefined ? null : Number(args.trace);
const LABELS = args.labels ? String(args.labels).split(',') : ['placeOrder', 'moveUnits', 'buyUnit', 'buyStructure', 'plan'];
const QUIET = !!args.quiet;

const ctx = createEngineContext();
const { FS_RULES: R, FS_BOT, GameOutcome, GameLog, GamePhase, FS_CATALOG } = ctx;
const FACTIONS = FS_CATALOG.factions.map(f => f.id);

function rotation(seed) {
    if (VS) {
        for (const f of VS) if (!FACTIONS.includes(f)) throw new Error('нет фракции «' + f + '»; есть: ' + FACTIONS.join(', '));
        return VS.slice(0, PLAYERS).concat(FACTIONS.filter(f => !VS.includes(f))).slice(0, PLAYERS);
    }
    // A small hash walk over the list: every seed its own table.
    const list = FACTIONS.slice();
    const out = [];
    let x = (seed * 2654435761) % 4294967296;
    while (out.length < PLAYERS && list.length) {
        x = (x ^ (x >>> 13)) >>> 0;
        x = (Math.imul(x, 1597334677) >>> 0);
        x = (x ^ (x >>> 16)) >>> 0;
        out.push(list.splice(x % list.length, 1)[0]);
    }
    return out;
}

/** One party: the presets by seat, the seed; returns the outcome and the counters. */
function play(seed, levelsBySeat, personasBySeat, trace) {
    const factions = rotation(seed);
    const players = factions.map((faction, i) => ({ faction, name: 'P' + i }));
    let st = R.newGame({ seed, rounds: ROUNDS, players, interactiveSetup: seed % 2 === 1 });
    const bots = st.players.map(p => FS_BOT.create({ seat: p.seat, seed: 'arena|' + seed, level: levelsBySeat[p.seat], persona: personasBySeat[p.seat] || null }));
    const counters = { steps: 0, battles: 0, refusals: 0, lines: 0, marches: 0 };
    let view = null;
    if (trace !== null && bots[trace]) {
        bots[trace].trace = (label, candidates, pick) => {
            if (!LABELS.includes(label)) return;
            const fmt = c => {
                const o = Object.assign({}, c);
                for (const k of ['t', 'o', 'opt', 'u']) delete o[k];
                if (o.moves) o.moves = o.moves.length + '→' + c.moves[0].system + ':' + c.moves[0].pos;
                o.score = Math.round(o.score * 10) / 10;
                return JSON.stringify(o);
            };
            console.log('[раунд ' + GamePhase.of(view).round + ' · ' + label + '] материя ' + view.players[trace].materiel
                + ' · план ' + JSON.stringify(bots[trace].memory.plan && { kind: bots[trace].memory.plan.kind, foe: bots[trace].memory.plan.foe }));
            for (const c of candidates.slice().sort((a, b) => b.score - a.score).slice(0, 8)) console.log('    ' + (c === pick ? '* ' : '  ') + fmt(c));
        };
    }
    let inCombat = false;
    while (counters.steps++ < 40000 && !GameOutcome.of(st).over) {
        if (st.combat && !inCombat) counters.battles++;
        inCombat = !!st.combat;
        const seat = R.activeSeat(st);
        view = R.view(st, seat);
        const step = bots[seat].next(view);
        if (!step) throw new Error('боту ' + seat + ' нечего делать (сид ' + seed + ')');
        if (step.advance) { R.advanceCombatSteps(st); continue; }
        let ok = false, last = '';
        for (const cmd of (step.tries || [step.cmd])) {
            const res = R.apply(st, seat, cmd);
            if (res && res.ok !== false) { ok = true; if (cmd.type === 'moveUnits') counters.marches++; break; }
            last = res && res.error || '';
        }
        if (!ok) {
            counters.refusals++;
            if (step.must) throw new Error('команда «' + step.label + '» отвергнута: ' + last + ' (сид ' + seed + ')');
        } else if (step.say) { counters.lines++; GameLog.of(st).add(seat, step.say); }
    }
    const out = GameOutcome.of(st);
    return { st, out, counters, factions, bots };
}

const totals = { a: 0, b: 0, shared: 0, none: 0, games: 0, ms: 0, battles: 0, lines: 0, marches: 0, refusals: 0, rounds: 0 };
const objectives = { a: 0, b: 0 };
const rows = [];
for (let i = 0; i < GAMES; i++) {
    const seed = i + 1;
    const aSeat = i % PLAYERS;
    const levels = [], personas = [];
    for (let s = 0; s < PLAYERS; s++) { levels.push(s === aSeat ? A : B); personas.push(PERSONAS[s] || null); }
    const t0 = Date.now();
    const game = play(seed, levels, personas, TRACE);
    const ms = Date.now() - t0;
    totals.games++; totals.ms += ms; totals.battles += game.counters.battles; totals.lines += game.counters.lines;
    totals.marches += game.counters.marches; totals.refusals += game.counters.refusals; totals.rounds += Math.min(ROUNDS, GamePhase.of(game.st).round);
    const winner = game.out.winner;
    let result;
    if (game.out.tied) { totals.shared++; result = 'ничья'; }
    else if (winner === aSeat) { totals.a++; result = 'A'; }
    else if (winner === null || winner === undefined) { totals.none++; result = '—'; }
    else { totals.b++; result = 'B'; }
    for (const p of game.st.players) {
        if (p.seat === aSeat) objectives.a += p.objectives || 0;
        else objectives.b += (p.objectives || 0) / (PLAYERS - 1);
    }
    const line = game.st.players.map(p => (p.seat === aSeat ? 'A ' : 'B ') + p.faction + ' [' + game.bots[p.seat].resolved.id + '] ' + (p.objectives || 0) + '★ ' + game.st.units.filter(u => u.seat === p.seat).length + 'ю').join(' · ');
    rows.push('  сид ' + String(seed).padStart(3) + ' · ' + result.padEnd(5) + ' · раунд ' + String(Math.min(ROUNDS, GamePhase.of(game.st).round)).padStart(2)
        + ' · боёв ' + String(game.counters.battles).padStart(2) + ' · ' + line + ' · ' + ms + ' мс');
}

if (!QUIET) for (const r of rows) console.log(r);
const decided = totals.a + totals.b;
const share = decided ? totals.a / decided : 0;
console.log('');
console.log('Арена: A = «' + FS_BOT.level(A).name + '», B = «' + FS_BOT.level(B).name + '», партий ' + totals.games + (VS ? ' (' + VS.join(' против ') + ')' : '') + ', игроков ' + PLAYERS + ', раундов ' + ROUNDS + '.');
console.log('  A побед ' + totals.a + ', B побед ' + totals.b + ', ничьих ' + totals.shared + ', без победителя ' + totals.none
    + ' → доля A среди решённых ' + Math.round(share * 100) + ' %.');
console.log('  Целей за партию: A ' + (objectives.a / totals.games).toFixed(2) + ', B ' + (objectives.b / totals.games).toFixed(2)
    + '; боёв за партию ' + (totals.battles / totals.games).toFixed(1) + ', маршей ' + (totals.marches / totals.games).toFixed(1)
    + ', реплик ' + (totals.lines / totals.games).toFixed(1) + ', отказов ' + (totals.refusals / totals.games).toFixed(1)
    + ', раундов ' + (totals.rounds / totals.games).toFixed(1) + ', ' + Math.round(totals.ms / totals.games) + ' мс на партию.');
if (EXPECT !== null) {
    if (share < EXPECT) {
        console.log('  Ожидалось, что A берёт не меньше ' + Math.round(EXPECT * 100) + ' % решённых партий — не вышло.');
        process.exit(1);
    }
    console.log('  Порог ' + Math.round(EXPECT * 100) + ' % выдержан.');
}
