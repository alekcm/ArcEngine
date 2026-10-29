// view.mjs — builds the per-player view of the game state (hidden information removed).
// The server sends only views to clients; the full state never leaves the host process.

import { buildMenu } from './engine/turn.mjs';
import { handSlots } from './engine/core.mjs';
import { CHARACTERS, FIELD_DATA, ITEMS } from './data/cards.mjs';

const PUBLIC_KEYS = ['lastRoll', 'lastShot', 'fx', 'version', 'mode', 'round', 'phase', 'firstPlayer', 'current', 'actionsLeft', 'ship', 'roomState',
    'intruders', 'fireLeft', 'malfLeft', 'time', 'selfDestruct', 'destination', 'shipDestroyed', 'podsUnlocked', 'pods',
    'computerCard', 'queenHits', 'queenDead', 'nestEggs', 'nestDestroyed', 'nestDiscovered', 'analyzed', 'adaptations', 'adaptationsRemoved', 'seating', 'feats', 'featsUsed', 'result', 'lastEvent'];

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
    // Face-up piles on the table (discard piles are open information in the physical game).
    v.piles = {
        event: (state.eventDiscard || []).slice(),
        attack: (state.attackDiscard || []).slice(),
        queen: (state.queenPlayed || []).slice(),
        wound: (state.woundDiscard || []).slice(),
        computer: (state.computerDiscard || []).slice(),
        items: Object.fromEntries(Object.keys(state.itemDecks).map(k => [k, (state.itemDiscard[k] || []).slice()])),
    };
    v.bagLast = state.bagLast || null;
    v.ui = { bagClick: !!(state.ui && state.ui.bagClick), eventAck: !!(state.ui && state.ui.eventAck) };
    v.lastEventN = state.lastEventN || 0;
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
    // p. 14: light items in another character's possession are secret. Only the number of cards
    // and their decks are public; armor and heavy objects stay visible on the table.
    const visibleItems = mine ? p.items : p.items.filter(i => ITEMS[i.item].kind === 'heavy' || ITEMS[i.item].kind === 'armor');
    const pub = {
        id: p.id, number: p.number, name: p.name, charId: p.charId, charName: p.charId ? CHARACTERS[p.charId].name : '—', colors: p.colors, parts: p.parts || {},
        room: p.room, status: p.status, health: p.health, maxHealth: p.charId ? CHARACTERS[p.charId].health : 0, wounds: p.wounds, armor: p.armor,
        items: visibleItems, itemCount: p.items.length, heavy: p.heavy,
        // Quest items are public: a closed card lies next to its owner's sheet from the start.
        quests: (p.quests || []).map(q => ({ uid: q.uid, item: q.item, open: !!q.open })),
        // Hand slots name what lies in each hand, so they are only sent to their owner (p. 14).
        handSlots: mine ? handSlots(state, p) : undefined,
        knowledge: p.knowledge, knowledgeActive: p.knowledgeActive, signal: p.signal,
        passed: p.passed, pod: p.pod, larva: p.larva, laika: p.laika || null,
        handCount: p.hand.length, deckCount: p.deck.length, discardCount: p.discard.length,
        contamInDiscard: p.discard.filter(c => c.startsWith('contam#')).length,
    };
    if (mine) {
        pub.hand = p.hand; pub.discard = p.discard;
        pub.objectives = p.objectives; pub.objective = p.objective;
        pub.knownTiles = p.knownTiles || {}; pub.knownEngines = p.knownEngines || {}; pub.knownCoords = p.knownCoords || null;
        pub.analyzedEgg = p.analyzedEgg; pub.analyzed = p.analyzed;
    }
    return pub;
}

function promptView(state, viewer) {
    const pr = state.prompt;
    if (!pr) return null;
    // Table-wide "Ready" prompt: each player answers for themselves; everyone sees who is ready.
    if (pr.kind === 'ack') {
        const inList = (pr.players || []).includes(viewer);
        const acked = pr.acked || [];
        return Object.assign({}, pr, { mine: inList && !acked.includes(viewer), waiting: inList && acked.includes(viewer) });
    }
    const mine = pr.player === viewer || (pr.player === 'host' && viewer === 0);
    if (mine) return pr;
    if (pr.kind === 'bag') return { id: pr.id, kind: pr.kind, player: pr.player, waiting: true, title: 'тянет жетон из мешка' };
    // Other players see who is thinking and about what, but not secret options, private texts
    // (engine/coordinates/objectives) or payment card lists.
    // `room` rides along so every screen can keep an unexplored room as "???" in the die title.
    const out = { id: pr.id, kind: pr.kind, player: pr.player, waiting: true, die: pr.die, room: pr.room,
        title: (pr.kind === 'info' || pr.secret) ? 'Персонаж изучает скрытую информацию' : pr.title };
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
