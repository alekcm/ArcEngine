// setup.mjs — createGame(): builds the initial state from the lobby configuration.

import { seedFromString, shuffle, randInt, pick } from '../rng.mjs';
import { originalShip, randomShip, BASIC_TILES, ADDITIONAL_TILES, ADDITIONAL_IN_PLAY, EXPLORATION_TOKENS, roomOfKind } from '../ship.mjs';
import { ATTACK_CARDS, EVENT_CARDS, WOUNDS, ITEMS, CHARACTERS, FIELD_DATA, COMPUTER_CARDS, OBJECTIVES, COORDINATE_CARDS, QUEEN_CARDS, FEATS, ADAPTATIONS, COMMON_CARDS } from '../data/cards.mjs';
import { OPS, ask, log, next, run, pname } from './core.mjs';
import './turn.mjs';
import './movement.mjs';
import './combat.mjs';
import './intruders.mjs';
import './events.mjs';
import './rooms.mjs';
import './items.mjs';
import './actions.mjs';
import './actions2.mjs';
import './actions3.mjs';
import './feats.mjs';
import './fielddata.mjs';
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
        adaptations: [], adaptationsRemoved: 0, finishOrder: [], carcassCount: 0,
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
    for (const k of Object.keys(FIELD_DATA)) state.fieldDataDeck.push('field.' + k + '#0');
    shuffle(state, state.fieldDataDeck);
    state.computerDeck = shuffle(state, Object.keys(COMPUTER_CARDS));
    revealComputerCard(state, true);
    state.queenDeck = shuffle(state, QUEEN_CARDS.map((c, i) => i));
    state.feats = shuffle(state, Object.keys(FEATS)).slice(0, 6);
    state.adaptations = shuffle(state, Object.keys(ADAPTATIONS)).slice(0, 3);

    // Players: ids follow the lobby seats; player NUMBERS (Help cards 1..n) are random and define
    // clockwise order, the first player and the "Player N" objectives.
    const n = config.players.length;
    const numbers = shuffle(state, config.players.map((_, i) => i + 1));
    const hiber = roomOfKind(state.ship, 'hibernatorium').id;
    config.players.forEach((pc, i) => {
        state.players.push({
            id: i, number: numbers[i], name: pc.name, charId: null, colors: pc.colors || {},
            room: hiber, health: 0, hand: [], deck: [], discard: [], wounds: [], larva: false,
            items: [], heavy: [], armor: null, knowledge: 1, knowledgeActive: false, signal: false, supportUsed: false,
            objectives: [], objective: null, status: 'active', passed: false, pod: null,
            knownEngines: {}, knownCoords: null, analyzedEgg: false, analyzed: { corpse: false, carcass: false, egg: false }, movedThisRound: false,
            firstShotUsed: false, rifleDrawUsed: false, adrenalineTurn: false, tissue: 0,
        });
    });
    state.seating = [...state.players].sort((a, b) => a.number - b.number).map(p => p.id);
    state.firstPlayer = state.seating[0];
    state.setupPlayers = config.players.map(pc => ({ charId: pc.charId, colors: pc.colors || {} }));

    // Bag & pods
    state.bag = ['blank', 'larva', 'larva', 'larva', 'larva'];
    for (let i = 0; i < 5 + n; i++) state.bag.push('adult');
    const podCount = n <= 2 ? 2 : n <= 4 ? 3 : 4;
    for (let i = 0; i < podCount; i++) state.pods.push({ num: i + 1, section: i % 2 === 0 ? 'A' : 'B', locked: true, occupants: [], launched: false, removed: false });

    log(state, 'Номера игроков: ' + state.seating.map(id => state.players[id].number + ' — ' + state.players[id].name).join(', ') + '.', 'info');
    if (config.draft) {
        // 2.4 Character draft: in player-number order each player draws 3 Character cards and keeps 1.
        state.phase = 'draft';
        state.draft = { pool: shuffle(state, Object.keys(CHARACTERS)), idx: 0 };
        log(state, 'Драфт персонажей: каждый игрок по очереди получает 3 карты персонажей и выбирает 1.', 'event');
        next(state, { op: 'draft.next' });
    } else {
        state.players.forEach((p, i) => assignCharacter(state, p, config.players[i].charId));
        next(state, { op: 'setup.finish' });
    }
    run(state);
    return state;
}

/** Short character summary for the draft prompt: starting gear + unique action cards. */
function draftDesc(c) {
    const ch = CHARACTERS[c];
    const gear = (ch.startItems || []).map(s => ITEMS[s.item] ? ITEMS[s.item].name : s.item).join(', ');
    const own = Object.values(ch.cards || {}).filter(d => !Object.values(COMMON_CARDS).includes(d)).map(d => d.name);
    return (gear ? 'Снаряжение: ' + gear + '. ' : '') + (own.length ? 'Карты: ' + own.join(', ') + '.' : '');
}
OPS['draft.next'] = (state) => {
    const d = state.draft;
    if (d.idx >= state.seating.length) { next(state, { op: 'setup.finish' }); return; }
    const p = state.players[state.seating[d.idx]];
    const hand = d.pool.splice(0, 3);
    ask(state, { kind: 'choice', player: p.id, title: 'Драфт персонажей (Игрок ' + p.number + '): выберите 1 из 3', options: hand.map(c => ({ id: c, label: CHARACTERS[c].name, desc: draftDesc(c) })) },
        { op: 'draft.pick', player: p.id, hand });
};
OPS['draft.pick'] = (state, step) => {
    const p = state.players[step.player];
    assignCharacter(state, p, step.answer);
    // the other 2 cards are shuffled back into the draft deck
    state.draft.pool = shuffle(state, [...state.draft.pool, ...step.hand.filter(c => c !== step.answer)]);
    log(state, 'Игрок ' + p.number + ' (' + p.name + ') выбирает персонажа: ' + CHARACTERS[p.charId].name + '.', 'event');
    state.draft.idx++;
    next(state, { op: 'draft.next' });
};
function assignCharacter(state, p, charId) {
    const ch = CHARACTERS[charId];
    const sp = state.setupPlayers[p.id];
    p.charId = charId; p.health = ch.health; p.tissue = charId === 'xeno' ? 1 : 0;
    if (charId === 'ceo') { p.wounds.push('body'); p.health = Math.min(p.health, 7); }   // the Robot starts with a Body Wound
    p.colors = sp && sp.charId === charId ? sp.colors : {};
    for (const key of Object.keys(ch.cards)) p.deck.push(charId + '.' + key + '#0');
    for (const s of ch.startItems) {
        const def = ITEMS[s.item];
        const inst = { uid: 'it' + (++state.itemSeq), item: s.item, ammo: def.weapon ? (s.ammo ?? def.weapon.max) : undefined, broken: false, charge: def.markers, start: true };
        if (def.kind === 'armor') p.armor = inst; else p.items.push(inst);
        if (s.item === 'laika') p.laika = 'board';
    }
}
OPS['setup.finish'] = (state) => {
    const n = state.players.length;
    const fits = kind => Object.keys(OBJECTIVES[kind]).filter(k => (OBJECTIVES[kind][k].minPlayers || 1) <= n);
    const personal = shuffle(state, fits('personal'));
    const corporate = shuffle(state, fits('corporate'));
    for (const p of state.players) {
        p.objectives = [{ id: personal.pop(), kind: 'personal' }, { id: corporate.pop(), kind: 'corporate' }];
        p.deck = shuffle(state, p.deck);
        for (let i = 0; i < 5; i++) p.hand.push(p.deck.shift());
    }
    delete state.draft; delete state.setupPlayers;
    state.round = 1;
    log(state, 'Игра началась. Корабль: ' + (state.mode === 'random' ? 'случайная компоновка' : 'оригинальный «Немезида»') + '. Первый игрок — ' + pname(state.players[state.firstPlayer]) + ' (Игрок 1).', 'event');
    log(state, 'Все персонажи просыпаются в Гибернатории.', 'info');
    log(state, 'Активные адаптации чужих: ' + state.adaptations.map(k => '«' + ADAPTATIONS[k].name + '»').join(', ') + '.', 'event');
    log(state, 'Доступные подвиги: ' + state.feats.map(k => '«' + FEATS[k].name + '»').join(', ') + '.', 'info');
    next(state, { op: 'phase.player' });
};

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
