// setup.mjs — createGame(): builds the initial state from the lobby configuration.

import { seedFromString, shuffle, randInt, pick } from '../rng.mjs';
import { originalShip, randomShip, BASIC_TILES, ADDITIONAL_TILES, ADDITIONAL_IN_PLAY, EXPLORATION_TOKENS, roomOfKind } from '../ship.mjs';
import { ATTACK_CARDS, EVENT_CARDS, WOUNDS, ITEMS, CHARACTERS, FIELD_DATA, COMPUTER_CARDS, OBJECTIVES, COORDINATE_CARDS, QUEEN_CARDS } from '../data/cards.mjs';
import { log, next, run, pname } from './core.mjs';
import './turn.mjs';
import './movement.mjs';
import './combat.mjs';
import './intruders.mjs';
import './events.mjs';
import './rooms.mjs';
import './items.mjs';
import './actions.mjs';
import './endgame.mjs';

export function createGame(config) {
    const seedStr = config.seed || String(Date.now());
    const state = {
        version: 1,
        seedStr, rng: seedFromString(seedStr),
        mode: config.mode === 'random' ? 'random' : 'original',
        round: 0, phase: 'setup',
        players: [], firstPlayer: 0, current: 0,
        queue: [], prompt: null, resume: null, promptSeq: 0,
        log: [], logSeq: 0,
        secret: { tiles: {}, tokens: {}, contamInfected: {}, engines: [], coordinates: null },
        roomState: {}, intruders: {}, intruderSeq: 0, contamSeq: 0, itemSeq: 0,
        bag: [], fireLeft: 8, malfLeft: 8,
        time: 15, selfDestruct: 0, destination: 'B', shipDestroyed: false,
        podsUnlocked: false, pods: [],
        attackDeck: [], attackDiscard: [], eventDeck: [], eventDiscard: [],
        woundDeck: [], woundDiscard: [],
        itemDecks: { green: [], red: [], yellow: [], support: [] }, itemDiscard: {},
        fieldDataDeck: [], computerDeck: [], computerCard: null, computerDiscard: [],
        queenDeck: [], queenHits: 0, queenDead: false,
        nestEggs: 5, nestDestroyed: false, nestDiscovered: false,
        analyzed: { corpse: false, carcass: false, egg: false },
        result: null,
    };

    state.ship = state.mode === 'random' ? randomShip(state) : originalShip();

    // Room tiles
    const basic = shuffle(state, [...BASIC_TILES]);
    const additional = shuffle(state, [...ADDITIONAL_TILES]).slice(0, ADDITIONAL_IN_PLAY);
    const tokens = shuffle(state, [...EXPLORATION_TOKENS]);
    for (const r of Object.values(state.ship.rooms)) {
        const special = r.kind === 'cockpit' || r.kind === 'hibernatorium' || r.kind === 'engine';
        state.roomState[r.id] = { tile: null, explored: special, fire: false, malfunction: false, objects: [], token: null };
        if (r.kind === 'slot1') state.secret.tiles[r.id] = basic.pop();
        else if (r.kind === 'slot2') state.secret.tiles[r.id] = additional.pop();
        if (!special) state.secret.tokens[r.id] = tokens.pop();
    }
    // Engines: each has a working/damaged token on top (random)
    state.secret.engines = [1, 2, 3].map(n => ({ no: n, working: randInt(state, 2) === 0 }));
    if (!state.secret.engines.some(e => e.working)) state.secret.engines[randInt(state, 3)].working = true;
    state.secret.coordinates = pick(state, COORDINATE_CARDS).id;

    // Decks
    for (const c of ATTACK_CARDS) for (let i = 0; i < c.count; i++) state.attackDeck.push(c.id);
    shuffle(state, state.attackDeck);
    state.eventDeck = shuffle(state, EVENT_CARDS.map(e => e.id));
    for (const w of Object.keys(WOUNDS)) for (let i = 0; i < 3; i++) state.woundDeck.push(w);
    shuffle(state, state.woundDeck);
    for (const [key, it] of Object.entries(ITEMS)) {
        if (!state.itemDecks[it.deck]) continue;
        for (let i = 0; i < it.count; i++) state.itemDecks[it.deck].push(key);
    }
    for (const d of Object.values(state.itemDecks)) shuffle(state, d);
    for (const k of Object.keys(FIELD_DATA)) for (let i = 0; i < 2; i++) state.fieldDataDeck.push('field.' + k + '#' + i);
    shuffle(state, state.fieldDataDeck);
    state.computerDeck = shuffle(state, Object.keys(COMPUTER_CARDS));
    revealComputerCard(state, true);
    state.queenDeck = shuffle(state, QUEEN_CARDS.map((c, i) => i));

    // Players
    const n = config.players.length;
    const personal = shuffle(state, Object.keys(OBJECTIVES.personal));
    const corporate = shuffle(state, Object.keys(OBJECTIVES.corporate));
    const hiber = roomOfKind(state.ship, 'hibernatorium').id;
    config.players.forEach((pc, i) => {
        const ch = CHARACTERS[pc.charId];
        const p = {
            id: i, name: pc.name, charId: pc.charId, colors: pc.colors || {},
            room: hiber, health: ch.health, hand: [], deck: [], discard: [], wounds: [], larva: false,
            items: [], heavy: [], armor: null, knowledge: 1, knowledgeActive: false, signal: false, supportUsed: false,
            objectives: [], objective: null, status: 'active', passed: false, pod: null,
            knownEngines: {}, knownCoords: null, analyzedEgg: false, movedThisRound: false,
            firstShotUsed: false, rifleDrawUsed: false, adrenalineTurn: false,
        };
        for (const key of Object.keys(ch.cards)) p.deck.push(pc.charId + '.' + key + '#0');
        shuffle(state, p.deck);
        for (const s of ch.startItems) {
            const def = ITEMS[s.item];
            p.items.push({ uid: 'it' + (++state.itemSeq), item: s.item, ammo: def.weapon ? (s.ammo ?? def.weapon.max) : undefined, broken: false });
        }
        let corp = corporate.pop();
        if (corp === 'cRival' && n < 2) corp = corporate.pop() || 'cMars';
        p.objectives = [{ id: personal.pop(), kind: 'personal' }, { id: corp, kind: 'corporate' }];
        if (corp === 'cRival') {
            const others = config.players.map((_, j) => j).filter(j => j !== i);
            p.objectives[1].target = others[randInt(state, others.length)];
        }
        state.players.push(p);
    });
    for (const p of state.players) { p.deck = shuffle(state, p.deck); for (let i = 0; i < 5; i++) p.hand.push(p.deck.shift()); }

    // Bag & pods
    state.bag = ['blank', 'larva', 'larva', 'larva', 'larva'];
    for (let i = 0; i < 5 + n; i++) state.bag.push('adult');
    const podCount = n <= 2 ? 2 : n <= 4 ? 3 : 4;
    for (let i = 0; i < podCount; i++) state.pods.push({ num: i + 1, section: i % 2 === 0 ? 'A' : 'B', locked: true, occupants: [], launched: false, removed: false });

    state.firstPlayer = randInt(state, n);
    state.round = 1;
    log(state, 'Игра началась. Корабль: ' + (state.mode === 'random' ? 'случайная компоновка' : 'оригинальный «Немезида»') + '. Первый игрок — ' + pname(state.players[state.firstPlayer]) + '.', 'event');
    log(state, 'Все персонажи просыпаются в Гибернатории.', 'info');
    next(state, { op: 'phase.player' });
    run(state);
    return state;
}

export function revealComputerCard(state, setup) {
    if (state.computerCard) state.computerDiscard.push(state.computerCard);
    if (!state.computerDeck.length) { state.computerDeck = shuffle(state, state.computerDiscard.splice(0)); }
    let card = state.computerDeck.shift();
    if (card === 'lockdown' && (setup || state.computerDeck.length === 0)) {
        state.computerDeck.push(card);
        card = state.computerDeck.shift();
    }
    state.computerCard = card || null;
}
