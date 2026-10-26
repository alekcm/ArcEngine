// view.mjs — builds the per-player view of the game state (hidden information removed).
// The server sends only views to clients; the full state never leaves the host process.

import { buildMenu } from './engine/turn.mjs';
import { CHARACTERS, FIELD_DATA } from './data/cards.mjs';

const PUBLIC_KEYS = ['version', 'seedStr', 'mode', 'round', 'phase', 'firstPlayer', 'current', 'actionsLeft', 'ship', 'roomState',
    'intruders', 'fireLeft', 'malfLeft', 'time', 'selfDestruct', 'destination', 'shipDestroyed', 'podsUnlocked', 'pods',
    'computerCard', 'queenHits', 'queenDead', 'nestEggs', 'nestDestroyed', 'nestDiscovered', 'analyzed', 'result', 'lastEvent'];

/**
 * @param {object} state full game state
 * @param {number|null} viewer player id (null = spectator)
 * @param {number} logFrom only log entries with seq > logFrom are included
 */
export function viewFor(state, viewer, logFrom = 0) {
    const v = {};
    for (const k of PUBLIC_KEYS) v[k] = state[k];
    v.bagCount = state.bag.length;
    v.bagKnown = countTokens(state.bag);
    v.decks = {
        event: state.eventDeck.length, attack: state.attackDeck.length,
        green: state.itemDecks.green.length, red: state.itemDecks.red.length, yellow: state.itemDecks.yellow.length, support: state.itemDecks.support.length,
        queen: state.queenDeck.length,
    };
    v.players = state.players.map(p => playerView(state, p, viewer === p.id));
    v.log = state.log.filter(l => l.n > logFrom);
    v.prompt = promptView(state, viewer);
    return v;
}

function countTokens(bag) {
    const c = {};
    for (const t of bag) c[t] = (c[t] || 0) + 1;
    return c;
}

function playerView(state, p, mine) {
    const pub = {
        id: p.id, name: p.name, charId: p.charId, charName: CHARACTERS[p.charId].name, colors: p.colors,
        room: p.room, status: p.status, health: p.health, maxHealth: CHARACTERS[p.charId].health, wounds: p.wounds, armor: p.armor,
        items: p.items, heavy: p.heavy, knowledge: p.knowledge, knowledgeActive: p.knowledgeActive, signal: p.signal,
        passed: p.passed, pod: p.pod, larva: p.larva, laika: p.laika || null,
        handCount: p.hand.length, deckCount: p.deck.length, discardCount: p.discard.length,
        contamInDiscard: p.discard.filter(c => c.startsWith('contam#')).length,
    };
    if (mine) {
        pub.hand = p.hand; pub.discard = p.discard;
        pub.objectives = p.objectives; pub.objective = p.objective;
        pub.knownTiles = p.knownTiles || {}; pub.knownEngines = p.knownEngines || {}; pub.knownCoords = p.knownCoords || null;
        pub.analyzedEgg = p.analyzedEgg;
    }
    return pub;
}

function promptView(state, viewer) {
    const pr = state.prompt;
    if (!pr) return null;
    const mine = pr.player === viewer || (pr.player === 'host' && viewer === 0);
    if (mine) return pr;
    // Other players see who is thinking and about what, but not secret option lists.
    const out = { id: pr.id, kind: pr.kind, player: pr.player, title: pr.title, waiting: true };
    if (!pr.secret && pr.kind !== 'info' && pr.kind !== 'cards') { out.options = pr.options; out.rooms = pr.rooms; }
    return out;
}

/** Human-readable card description for hand cards (used by the client, but kept here so bots/tests can share it). */
export function describeCard(cardId) {
    if (cardId.startsWith('contam#')) return { name: 'Заражение', text: 'Эту карту нельзя разыграть или сбросить для оплаты. Проверьте её в Хирургии, Автодоком или картой «Отдых».', contam: true };
    const base = cardId.split('#')[0];
    const [owner, key] = base.split('.');
    if (owner === 'field') return FIELD_DATA[key];
    const ch = CHARACTERS[owner];
    return ch ? ch.cards[key] : { name: cardId, text: '' };
}
