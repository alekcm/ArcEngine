// One setup entry point for the expansion. The public createGame guard still prevents
// unfinished packs from starting; this helper also permits isolated integration tests.
import { initCarnomorphs, initCarnomorphAttackDeck } from './carnomorphs.mjs';
import { initCarnomorphEventDeck } from './carnomorph-events.mjs';

export function initCarnomorphPack(state) {
    if (state.enemySet !== 'carnomorphs') throw new RangeError('Carnomorph setup requires the Carnomorph enemy set');
    initCarnomorphs(state);
    initCarnomorphAttackDeck(state);
    initCarnomorphEventDeck(state);
    delete state.secret.weaknesses;
}
