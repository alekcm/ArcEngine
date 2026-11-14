// ============================================================================
//  fs-bot-persona-check.mjs — every faction doctrine plays a mirrored game
// ----------------------------------------------------------------------------
//  node tools/fs-bot-persona-check.mjs
//
//  Each doctrine pilots both seats in its own faction mirror over two seeds
//  (interactive and ready setup). Any rejected command fails the check: a bot
//  may not silently skip a move just because its fallback is optional.
//  This measures command legality and end-to-end execution, not win rates.
// ============================================================================
import { createEngineContext } from './fs-engine.mjs';

const { FS_DATA, FS_BOT, FS_RULES: R, GameOutcome, GameLog } = createEngineContext();
const SEEDS = [1, 2];
const ROUNDS = 8;
let games = 0;
let commands = 0;

for (const faction of FS_DATA.factions) {
    const personas = FS_BOT.personasFor(faction.id);
    for (const persona of personas) {
        for (const seed of SEEDS) {
            const players = [0, 1].map(seat => ({ faction: faction.id, name: 'P' + seat }));
            let state = R.newGame({ seed, rounds: ROUNDS, players, interactiveSetup: seed % 2 === 1 });
            const bots = state.players.map(p => FS_BOT.create({
                seat: p.seat,
                seed: 'arena|' + seed,
                level: 'normal',
                persona: persona.id,
            }));
            let steps = 0;
            while (steps++ < 40000 && !GameOutcome.of(state).over) {
                const seat = R.activeSeat(state);
                const view = R.view(state, seat);
                const step = bots[seat].next(view);
                if (!step) throw new Error(`${persona.id}, seed ${seed}: бот ${seat} не выбрал действие`);
                if (step.advance) {
                    R.advanceCombatSteps(state);
                    continue;
                }

                let accepted = false;
                let lastError = '';
                const rejected = [];
                for (const command of (step.tries || [step.cmd])) {
                    const result = R.apply(state, seat, command);
                    if (result && result.ok !== false) {
                        accepted = true;
                        commands++;
                        break;
                    }
                    lastError = result && result.error || '';
                    rejected.push(command);
                }
                if (!accepted) {
                    throw new Error(`${persona.id}, seed ${seed}, seat ${seat}, ${step.label || 'unknown'}: `
                        + `all commands rejected (${lastError}); tried ${JSON.stringify(rejected)}`);
                }
                if (step.say) GameLog.of(state).add(seat, step.say);
            }
            if (!GameOutcome.of(state).over) throw new Error(`${persona.id}, seed ${seed}: exceeded ${steps} steps without finishing`);
            games++;
        }
    }
    console.log(`ok  ${faction.id}: ${personas.length} doctrines × ${SEEDS.length} mirror games`);
}

console.log(`\n${FS_BOT.PERSONAS.length} doctrines: ${games} complete mirror games, ${commands} accepted commands, 0 rejected commands.`);
