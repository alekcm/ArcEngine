// Exploration (База.md pp. 16–17). The city/outskirts decks and the numbered event deck are the
// next milestone (see docs/witcher/02-status.md): their 72 + 56 cards are parsed from
// Witcher/События/*.md. Until then exploring is legal and ends phase II without an effect,
// so a player who can neither fight nor meditate is never stuck.
import { STEPS, push } from './flow.mjs';
import { log } from './util.mjs';

export const EXPLORE_READY = false;

export function exploreError(state, p, deck) {
    if (deck !== 'city' && deck !== 'wild') return 'Выберите город или окрестности';
    const t = state.turn;
    if (!t || t.seat !== p.seat || t.phase !== 1) return 'Только в свой ход вместо битвы/медитации';
    return null;
}

STEPS.exploreStart = (state, step) => {
    const p = state.players[step.seat];
    log(state, `${p.name} исследует ${step.deck === 'city' ? 'город' : 'окрестности'} (колоды исследований подключаются на следующем этапе — без эффекта)`, { kind: 'explore' });
    push(state, { op: 'phase3' });
};
