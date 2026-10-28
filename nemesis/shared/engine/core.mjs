// core.mjs — the rules interpreter. The whole game is a plain JSON object; every procedure is a
// list of steps in state.queue, executed by run(). A step that needs a decision calls ask():
// the prompt is stored in the state and execution stops until answer() is called with the
// player's choice. Because nothing lives outside the state, the server can snapshot it before
// every action and roll back (undo) by restoring a snapshot.

import { rand, randInt, shuffle } from '../rng.mjs';
import { CHARACTERS, FIELD_DATA, ITEMS, WOUNDS, INTRUDER_NAMES } from '../data/cards.mjs';
import { ROOM_TILES } from '../ship.mjs';

/** @type {Record<string, (state: any, step: any) => void>} */
export const OPS = {};

export function run(state) {
    let guard = 0;
    while (!state.prompt && state.queue.length && !state.result) {
        const step = state.queue.shift();
        const h = OPS[step.op];
        if (!h) throw new Error('unknown op ' + step.op);
        h(state, step);
        checkLaika(state);
        if (step.op !== 'dice.rolled') { state.pendingRoll = null; state.pendingRollPlayer = null; }
        if (++guard > 20000) throw new Error('runaway queue at ' + step.op);
        // Safety net: a chain can be cut short (e.g. the acting character died mid-action).
        // Fall back to the natural continuation of the current phase.
        if (!state.prompt && !state.queue.length && !state.result) {
            const cont = { player: 'turn.end', intruder: 'phase.event', event: 'event.finish', cleanup: 'phase.player' }[state.phase];
            if (cont && step.op !== cont) state.queue.push({ op: cont });
        }
    }
}

/** Laika is automatically called back when she shares a room with the Bounty Hunter or with an intruder. */
export function checkLaika(state) {
    for (const p of state.players) {
        if (!p.laika || p.laika === 'board') continue;
        if (p.status !== 'active') { p.laika = 'board'; continue; }
        if (p.laika === p.room || intrudersIn(state, p.laika).length) { p.laika = 'board'; log(state, '🐕 Лайка автоматически возвращается к охотнику.', 'minor'); }
    }
}
/** Do these steps next (before anything already queued). */
export function next(state, ...steps) { state.queue.unshift(...steps.filter(Boolean)); }
/** Do these steps after everything already queued. */
export function later(state, ...steps) { state.queue.push(...steps.filter(Boolean)); }

export function ask(state, prompt, resume) {
    state.promptSeq = (state.promptSeq || 0) + 1;
    state.prompt = Object.assign({ id: state.promptSeq }, prompt);
    state.resume = resume || null;
}

/** Every player still on board (dead and escaped seats cannot press "Ready"). */
export function ackPlayers(state) { return state.players.filter(p => p.status === 'active' || p.status === 'hibernating').map(p => p.id); }

/** Table-wide prompt: shown to every listed player until each of them answers `ok`.
 *  Used for the Event card: it stays on the table until the whole crew has read it. */
export function askAck(state, prompt, resume) {
    const players = prompt.players && prompt.players.length ? prompt.players.slice() : ackPlayers(state);
    if (!players.length) { next(state, resume); return false; }
    state.promptSeq = (state.promptSeq || 0) + 1;
    state.prompt = Object.assign({ id: state.promptSeq, kind: 'ack', player: 'all', acked: [] }, prompt, { players });
    state.resume = resume || null;
    return true;
}

/** Called by the server with the player's choice. Returns false if the answer is not valid. */
export function answer(state, playerId, promptId, choice) {
    const p = state.prompt;
    if (!p || p.id !== promptId) return false;
    // A table-wide confirmation ("everyone press Ready") is answered by each player in turn,
    // not by the owner of a normal prompt.
    if (p.kind === 'ack') return answerAck(state, p, playerId, choice);
    // "host" is the table host stepping in for an away player: allowed for the bag pull only
    // (a bag prompt has no answer of its own, the token is drawn by whoever clicked).
    const hostHelpsBag = playerId === 'host' && p.kind === 'bag';
    if (p.player !== playerId && p.player !== 'host' && !hostHelpsBag) return false;
    if (!validateAnswer(state, p, choice)) return false;
    const resume = state.resume;
    state.prompt = null; state.resume = null;
    if (resume) { resume.answer = choice; next(state, resume); }
    run(state);
    return true;
}

/** Collect one "Ready" from a player; the resume step runs when everybody has pressed it.
 *  The host may answer `all` once for the whole table (someone is away from the keyboard). */
function answerAck(state, p, playerId, choice) {
    // The event card is dealt face down: nobody confirms a card that has not been turned over yet.
    // The table flips it with the 'flip' message, which sets prompt.flipped for every screen.
    const faceDown = !!p.event && !p.flipped;
    if (faceDown) return false;
    if (choice === 'all' && playerId === 'host') p.acked = p.players.slice();
    else if (choice === 'ok' && p.players.includes(playerId) && !p.acked.includes(playerId)) p.acked.push(playerId);
    else return false;
    if (!p.players.every(id => p.acked.includes(id))) return true;
    const resume = state.resume;
    state.prompt = null; state.resume = null;
    if (resume) next(state, resume);
    run(state);
    return true;
}

function validateAnswer(state, p, choice) {
    switch (p.kind) {
        case 'choice':
            if (p.cancel && choice === 'cancel') return true;
            return p.options.some(o => o.id === choice && !o.disabled);
        case 'room':
            if (p.cancel && choice === 'cancel') return true;
            return p.rooms.includes(choice);
        case 'cards': {
            if (p.cancel && choice === 'cancel') return true;
            if (!Array.isArray(choice)) return false;
            if (choice.length < p.min || choice.length > p.max) return false;
            const set = new Set(choice);
            if (set.size !== choice.length) return false;
            return choice.every(c => p.cards.includes(c));
        }
        case 'info': return true;
        case 'dice': return true;
        case 'bag': return choice === 'draw';
        case 'ack': return choice === 'ok' || choice === 'all';
        case 'turn': return choice && typeof choice === 'object' && typeof choice.action === 'string';
        default: return true;
    }
}

// ---------------------------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------------------------
export function log(state, text, kind = 'info') {
    state.logSeq = (state.logSeq || 0) + 1;
    state.log.push({ n: state.logSeq, text, kind, round: state.round });
    if (state.log.length > 400) state.log.splice(0, state.log.length - 400);
}

// ---------------------------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------------------------
export const NOISE_DIE = [1, 1, 2, 2, 3, 3, 4, 4, 'silence', 'danger', 'encounter', 'encounter'];
export const COMBAT_DIE = ['crit', 2, 3, 3, 4, 4, 5, 5, 5, 6];
export const HIBERNATION_TIME = 8;
export const SELF_DESTRUCT_LENGTH = 6;  // 1-3 stoppable, 4-5 yellow (pods unlock), 6 red = boom

export function player(state, id) { return state.players[id]; }
export function pname(p) { return p.name + (p.charId ? ' (' + CHARACTERS[p.charId].name + ')' : ''); }
export function room(state, id) { return state.roomState[id]; }
export function tileOf(state, roomId) {
    const r = state.ship.rooms[roomId];
    if (r.kind === 'cockpit') return 'cockpit';
    if (r.kind === 'hibernatorium') return 'hibernatorium';
    if (r.kind === 'engine') return 'engine';
    return state.roomState[roomId].tile;              // null until explored
}
export function secretTile(state, roomId) { return tileOf(state, roomId) || state.secret.tiles[roomId]; }
export function roomName(state, roomId) {
    const t = tileOf(state, roomId);
    const r = state.ship.rooms[roomId];
    // The name is only spoken once the tile lies face up on the table. A room that has just been
    // flipped stays "???" here as well: the log and the die prompt must never name a room before
    // the players have seen it (the engine-room trio is face up from setup, so it is explored).
    if (!t || !state.roomState[roomId].explored) return '??? [' + roomId + ']';
    let name = ROOM_TILES[t].name;
    if (r.kind === 'engine') name += ' №' + r.engineNo;
    return name + ' [' + roomId + ']';
}
export function roomHasTile(state, roomId, tile) { return tileOf(state, roomId) === tile; }
export function findRoomsByTile(state, tile) {
    return Object.keys(state.ship.rooms).filter(id => tileOf(state, id) === tile);
}

export function cardDef(state, cardId) {
    if (cardId.startsWith('contam#')) return { name: 'Заражение', text: 'Не может оплачивать действия. Считается картой в руке.', contamination: true, cost: 0 };
    const [key] = cardId.split('#');
    const [owner, k] = key.split('.');
    if (owner === 'field') return FIELD_DATA[k];
    const ch = CHARACTERS[owner];
    return ch ? ch.cards[k] : null;
}
export function isContam(cardId) { return cardId.startsWith('contam#'); }
export function isInfected(state, cardId) { return !!state.secret.contamInfected[cardId]; }

export function itemDef(uid, p) {
    const it = p.items.find(i => i.uid === uid) || (p.armor && p.armor.uid === uid ? p.armor : null);
    return it ? ITEMS[it.item] : null;
}

export function activePlayers(state) { return state.players.filter(p => p.status === 'active'); }
export function playersInRoom(state, roomId) { return state.players.filter(p => p.status === 'active' && p.room === roomId && !p.pod); }
export function intrudersIn(state, roomId) { return Object.values(state.intruders).filter(i => i.room === roomId); }
export function inCombat(state, p) { return intrudersIn(state, p.room).length > 0; }
/** Players in turn order starting from the first player. */
/** Clockwise order (by player number) starting from the First Player. */
export function turnOrder(state) {
    const seat = state.seating || state.players.map(p => p.id);
    const n = seat.length, start = Math.max(0, seat.indexOf(state.firstPlayer)), out = [];
    for (let i = 0; i < n; i++) out.push(state.players[seat[(start + i) % n]]);
    return out;
}
export function orderIndex(state, p) { return turnOrder(state).indexOf(p); }

// ---------------------------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------------------------
// Health track: 10 cells — 3 green (10-8), 3 orange (7-5), 3 red (4-2) and 1 near-death (1).
// The skull follows the last cell: reaching 0 health means the marker is on the skull and the
// character dies immediately (13.1, Dashboard).
export function healthSections() { return [[10, 9, 8], [7, 6, 5], [4, 3, 2], [1]]; }
export function healthState(p) {
    if (p.health >= 8) return 'healthy';
    if (p.health >= 5) return 'injured';
    return 'heavy';
}
export const HEALTH_STATE_NAMES = { healthy: 'здоров', injured: 'ранен', heavy: 'тяжело ранен' };
/** Highest HP the marker may stand on given covered sections. */
export function maxAllowedHealth(p) {
    const s = healthSections(p);
    const covered = Math.min(p.wounds.length, 3);
    for (let i = covered; i < 4; i++) return s[i][0];
    return 0;
}
export function handLimit(p) { return p.wounds.includes('arm') ? 1 : 2; }
export function heavyCount(p) {
    let n = p.heavy.length;
    const hasRanged = p.items.some(i => ITEMS[i.item].weapon);
    for (const i of p.items) {
        const d = ITEMS[i.item];
        if (d.kind !== 'heavy') continue;
        if (d.bayonet && hasRanged) continue;        // Bayonet shares the slot of a ranged weapon
        n += d.twoSlots ? 2 : 1;                      // Gatling Gun blocks the other hand slot
    }
    return n;
}
export function drawLimit(p) { return p.wounds.includes('body') ? 4 : 5; }

// ---------------------------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------------------------
/** Visual effects feed for the clients (card moves etc.). Only the last few are kept. */
export function fx(state, obj) {
    state.fxSeq = (state.fxSeq || 0) + 1;
    (state.fx = state.fx || []).push(Object.assign({ n: state.fxSeq }, obj));
    if (state.fx.length > 24) state.fx.splice(0, state.fx.length - 24);
}
export function drawCards(state, p, n, silent) {
    let drawn = 0, guard = 0;
    while (drawn < n && guard++ < n * 4 + 8) {
        if (!p.deck.length) {
            if (!p.discard.length) break;
            // Android UPS: every reshuffle spends one marker; with no markers left the Android dies.
            const ups = p.charId === 'android' ? p.items.find(x => x.item === 'ups') : null;
            if (ups) {
                const left = (ups.charge ?? ITEMS.ups.markers) - 1;
                ups.charge = Math.max(0, left);
                if (left < 0) { killPlayer(state, p, 'ИБП разряжен при перемешивании колоды'); break; }
                log(state, pname(p) + ': ИБП расходует жетон при перемешивании (осталось ' + ups.charge + ').', 'minor');
            }
            p.deck = shuffle(state, p.discard.splice(0));
            log(state, pname(p) + ': колода перемешана заново.', 'minor');
        }
        const card = p.deck.shift();
        if (card === undefined) break;
        // Synthetic (Android): Contamination is scanned as it is drawn, never kept in hand.
        // An infected card leaves the game, costs 1 HP and the Android draws a replacement.
        if (p.charId === 'android' && isContam(card)) {
            const inf = isInfected(state, card);
            removeCardFromGame(state, p, card);
            log(state, pname(p) + ': «Синтетик» сканирует заражение при доборе — ' + (inf ? 'заражено, −1 здоровье' : 'чистое, убрано из игры') + '.', inf ? 'bad' : 'minor');
            if (inf) loseHealth(state, p, 1, 'заражение (Синтетик)');
            if (p.status !== 'active') break;
            n++;
            continue;
        }
        p.hand.push(card);
        drawn++;
    }
    if (drawn) fx(state, { type: 'draw', player: p.id, n: drawn });
    if (!silent && drawn) log(state, pname(p) + ' берёт ' + drawn + ' карт.', 'minor');
    return drawn;
}
export function discardCard(state, p, cardId) {
    const i = p.hand.indexOf(cardId);
    if (i >= 0) p.hand.splice(i, 1);
    p.discard.push(cardId);
    fx(state, { type: 'discard', player: p.id, card: cardId, fromHand: i >= 0 });
}
export function removeCardFromGame(state, p, cardId) {
    const i = p.hand.indexOf(cardId);
    if (i >= 0) p.hand.splice(i, 1);
    const j = p.discard.indexOf(cardId); if (j >= 0) p.discard.splice(j, 1);
    const k = p.deck.indexOf(cardId); if (k >= 0) p.deck.splice(k, 1);
    fx(state, { type: 'remove', player: p.id, card: cardId, fromHand: i >= 0 });
}
export function payableCards(p) { return p.hand.filter(c => !isContam(c)); }
/** Give a Larva to a character. The Android is Synthetic and cannot host one. */
export function infectLarva(state, p, quiet) {
    if (p.charId === 'android') {
        if (!quiet) log(state, pname(p) + ': «Синтетик» — личинка не может заразить Андроида.', 'minor');
        return false;
    }
    if (p.larva) { if (!quiet) log(state, pname(p) + ' уже носит личинку — вторая не добавляется.', 'minor'); return false; }
    p.larva = true;
    log(state, pname(p) + ' заражён личинкой!', 'bad');
    return true;
}
export function gainContamination(state, p, n = 1) {
    if (p.armor && ITEMS[p.armor.item].contamToHp) {
        log(state, pname(p) + ': биозащитная броня — вместо заражения теряет здоровье.', 'minor');
        loseHealth(state, p, n, 'биозащита');
        return;
    }
    for (let i = 0; i < n; i++) {
        const id = 'contam#' + (++state.contamSeq);
        state.secret.contamInfected[id] = rand(state) < 0.3;
        p.discard.push(id);
    }
    fx(state, { type: 'contam', player: p.id, n });
    log(state, pname(p) + ' получает ' + (n === 1 ? 'карту заражения.' : n + ' карты заражения.'), 'bad');
}

/** Ask the player to discard `n` payable cards (not the ones in `exclude`), then continue. */
export function payCost(state, p, n, resume, title) {
    if (n <= 0) { next(state, resume); return; }
    const cards = payableCards(p);
    if (cards.length < n) { log(state, pname(p) + ': недостаточно карт для оплаты.', 'bad'); return; }
    ask(state, { kind: 'cards', player: p.id, title: title || ('Оплатите ' + n + ' карт' + (n === 1 ? 'ой' : 'ами')), cards, min: n, max: n },
        { op: 'pay.done', player: p.id, then: resume });
}
OPS['pay.done'] = (state, step) => {
    const p = player(state, step.player);
    for (const c of step.answer) discardCard(state, p, c);
    log(state, pname(p) + ' сбрасывает ' + step.answer.length + ' карт(ы) для оплаты.', 'minor');
    next(state, step.then);
};

// ---------------------------------------------------------------------------------------------
// Damage, wounds, contamination, death
// ---------------------------------------------------------------------------------------------
export function loseHealth(state, p, n, reason) {
    if (p.status !== 'active') return;
    if (p.armor && ITEMS[p.armor.item].heavyArmor && n > 0 && reason === 'атака') n = Math.max(0, n - 1);
    for (let i = 0; i < n; i++) {
        p.health--;
        if (p.health < 0) break;
        // armor sits in the heavily injured section: entering it discards the armor
        if (p.armor && healthState(p) === 'heavy') {
            log(state, pname(p) + ': броня «' + ITEMS[p.armor.item].name + '» разрушена.', 'bad');
            p.armor = null;
        }
    }
    if (n > 0) fx(state, { type: 'damage', player: p.id, n });
    log(state, pname(p) + ' теряет ' + n + ' здоровья' + (reason ? ' (' + reason + ')' : '') + ' — ' + HEALTH_STATE_NAMES[healthState(p)] + ', ' + Math.max(0, p.health) + ' HP.', 'bad');
    if (p.health <= 0) killPlayer(state, p, reason || 'ранения');
}
export function restoreHealth(state, p, n) {
    const cap = maxAllowedHealth(p);
    const before = p.health;
    p.health = Math.min(cap, p.health + n);
    log(state, pname(p) + ' восстанавливает ' + (p.health - before) + ' здоровья (' + p.health + ' HP).', 'good');
}
export function gainWound(state, p, n = 1) {
    for (let i = 0; i < n; i++) {
        if (p.status !== 'active') return;
        if (p.armor && ITEMS[p.armor.item].woundToHp && !ITEMS[p.armor.item].woundToHpOptional && p.health > ITEMS[p.armor.item].woundToHp) {
            log(state, pname(p) + ': усиленная броня — вместо травмы теряет ' + ITEMS[p.armor.item].woundToHp + ' здоровья.', 'minor');
            loseHealth(state, p, ITEMS[p.armor.item].woundToHp, 'усиленная броня');
            continue;
        }
        if (p.wounds.length >= 3) { killPlayer(state, p, 'четвёртая тяжёлая травма'); return; }
        if (!state.woundDeck.length) state.woundDeck = shuffle(state, state.woundDiscard.splice(0));
        const w = state.woundDeck.shift();
        // The Wheelchair (printed): a Leg or Knee Serious Wound is discarded, but its Health cost stays.
        if (p.armor && ITEMS[p.armor.item].legWoundFree && (w === 'leg' || w === 'knee')) {
            state.woundDiscard.push(w);
            log(state, pname(p) + ': инвалидное кресло — травма «' + WOUNDS[w].name + '» сброшена, но здоровье за неё теряется.', 'minor');
            loseHealth(state, p, 1, 'травма (сброшена креслом)');
            if (p.status !== 'active') return;
            continue;
        }
        const dup = p.wounds.includes(w);   // 13.2: identical effects do not stack, but the card still covers a section
        p.wounds.push(w);
        log(state, pname(p) + ' получает тяжёлую травму: ' + WOUNDS[w].name + (dup ? ' (повторно — эффект не суммируется)' : '') + '.', 'bad');
        if (w === 'arm') next(state, { op: 'wound.armCheck', player: p.id });
        const cap = maxAllowedHealth(p);
        if (p.health > cap) {
            p.health = cap;
            log(state, pname(p) + ': маркер здоровья сдвинут на ' + p.health + ' HP.', 'bad');
            if (p.armor && healthState(p) === 'heavy') { log(state, pname(p) + ': броня разрушена.', 'bad'); p.armor = null; }
        }
        if (p.health <= 0) { killPlayer(state, p, 'травмы'); return; }
    }
}
export function removeWound(state, p, w) {
    const i = p.wounds.indexOf(w);
    if (i >= 0) { p.wounds.splice(i, 1); state.woundDiscard.push(w); log(state, pname(p) + ': травма «' + WOUNDS[w].name + '» вылечена.', 'good'); }
}
OPS['wound.armCheck'] = (state, step) => {
    const p = player(state, step.player);
    if (heavyCount(p) <= handLimit(p)) return;
    const opts = heavyOptions(p);
    ask(state, { kind: 'choice', player: p.id, title: 'Травма руки: только 1 слот. Что выбросить?', options: opts }, { op: 'drop.heavy', player: p.id });
};
export function heavyOptions(p) {
    const opts = p.items.filter(i => ITEMS[i.item].kind === 'heavy').map(i => ({ id: 'item:' + i.uid, item: i.item, label: ITEMS[i.item].name }));
    p.heavy.forEach((h, idx) => opts.push({ id: 'heavy:' + idx, label: HEAVY_NAMES[h.type] }));
    return opts;
}
export const HEAVY_NAMES = { corpse: 'Человеческий труп', charCorpse: 'Труп персонажа', carcass: 'Туша чужого', egg: 'Яйцо чужого' };
OPS['drop.heavy'] = (state, step) => {
    const p = player(state, step.player);
    dropHeavy(state, p, step.answer);
    if (heavyCount(p) > handLimit(p)) next(state, { op: 'wound.armCheck', player: p.id });
};
/** The two hands of a character: what occupies each slot right now.
 *  Heavy objects (corpse, egg…) hold one slot; a two-handed item holds both.
 *  Used by the pickup prompt, the character sheet and the "hands" popup on the board. */
export function handSlots(state, p) {
    const slots = [];
    const put = (ref, name, kind, two) => {
        slots.push({ ref, name, kind, two: !!two });
        if (two) slots.push({ ref: null, name, kind: 'filler', two: true });
        return slots.length;
    };
    for (const i of p.items) {
        const d = ITEMS[i.item];
        if (d.kind !== 'heavy') continue;
        if (d.bayonet && p.items.some(o => ITEMS[o.item].weapon)) continue;   // shares the ranged weapon slot
        put('item:' + i.uid, d.name, 'item', d.twoSlots);
    }
    p.heavy.forEach((h, idx) => put('heavy:' + idx, HEAVY_NAMES[h.type] || h.type, 'object', false));
    const limit = handLimit(p);
    const out = [];
    for (let k = 0; k < limit; k++) out.push(slots[k] || { ref: null, name: '', kind: 'empty' });
    return out;
}

export function dropHeavy(state, p, id) {
    const rs = room(state, p.room);
    if (id.startsWith('item:')) {
        const uid = id.slice(5);
        const i = p.items.findIndex(x => x.uid === uid);
        if (i >= 0) { const it = p.items.splice(i, 1)[0]; log(state, pname(p) + ' выбрасывает ' + ITEMS[it.item].name + '.', 'minor'); state.itemDiscard[ITEMS[it.item].deck] = state.itemDiscard[ITEMS[it.item].deck] || []; state.itemDiscard[ITEMS[it.item].deck].push(it.item); }
    } else {
        const idx = Number(id.slice(6));
        const h = p.heavy.splice(idx, 1)[0];
        if (h) { rs.objects.push(h); log(state, pname(p) + ' оставляет объект «' + HEAVY_NAMES[h.type] + '» в комнате.', 'minor'); }
    }
}

export function killPlayer(state, p, reason) {
    if (p.status === 'dead') return;
    p.status = 'dead';
    p.health = 0;
    log(state, '☠ ' + pname(p) + ' погибает (' + reason + ').', 'death');
    const rs = room(state, p.room);
    if (rs) {
        rs.objects.push({ type: 'charCorpse', who: p.id });
        for (const h of p.heavy.splice(0)) rs.objects.push(h);
    }
    p.items = []; p.armor = null; p.pod = null;
    if (!state.podsUnlocked) { state.podsUnlocked = true; for (const pod of state.pods) pod.locked = false; log(state, 'Первая смерть: все спасательные капсулы разблокированы.', 'event'); }
    if (state.prompt && state.prompt.player === p.id) { state.prompt = null; state.resume = null; }
}

// ---------------------------------------------------------------------------------------------
// Knowledge
// ---------------------------------------------------------------------------------------------
export function gainKnowledge(state, p, n) {
    const before = p.knowledge;
    p.knowledge = Math.min(8, p.knowledge + n);
    log(state, pname(p) + ': знания ' + before + ' → ' + p.knowledge + '.', 'good');
    // Resolve the thresholds in ascending order: next() unshifts, so queue the later ones first.
    for (const t of [8, 5, 3]) if (before < t && p.knowledge >= t) next(state, { op: 'knowledge.threshold', player: p.id, t });
}
OPS['knowledge.threshold'] = (state, step) => {
    const p = player(state, step.player);
    if (p.status !== 'active') return;
    if (!state.fieldDataDeck.length) return;
    const three = state.fieldDataDeck.splice(0, 3);
    ask(state, { kind: 'choice', player: p.id, title: 'Порог знаний ' + step.t + ': выберите карту полевых данных (ляжет на верх колоды)',
        wide: true,
        options: three.map(c => ({ id: c, label: FIELD_DATA[c.split('#')[0].split('.')[1]].name, desc: FIELD_DATA[c.split('#')[0].split('.')[1]].text,
            art: 'field/' + c.split('#')[0].split('.')[1] })) },
        { op: 'knowledge.pick', player: p.id, three });
};
OPS['knowledge.pick'] = (state, step) => {
    const p = player(state, step.player);
    p.deck.unshift(step.answer);
    for (const c of step.three) if (c !== step.answer) state.fieldDataDeck.push(c);
    shuffle(state, state.fieldDataDeck);
    log(state, pname(p) + ' добавляет в колоду карту полевых данных.', 'good');
};

// ---------------------------------------------------------------------------------------------
// Markers
// ---------------------------------------------------------------------------------------------
export function placeFire(state, roomId, why) {
    const rs = room(state, roomId);
    if (rs.fire) return;
    if (state.fireLeft <= 0) { destroyShip(state, 'девятый маркер огня — корабль сгорел'); return; }
    rs.fire = true; state.fireLeft--;
    log(state, '🔥 Пожар: ' + roomName(state, roomId) + (why ? ' (' + why + ')' : '') + '.', 'event');
}
export function removeFire(state, roomId) {
    const rs = room(state, roomId);
    if (!rs.fire) return;
    rs.fire = false; state.fireLeft++;
    log(state, 'Огонь потушен: ' + roomName(state, roomId) + '.', 'good');
}
export function placeMalfunction(state, roomId, why) {
    const rs = room(state, roomId);
    const t = tileOf(state, roomId);
    if (t === 'nest' || t === 'contaminated') return;
    if (rs.malfunction) return;
    if (state.malfLeft <= 0) { destroyShip(state, 'девятая поломка — системы корабля отказали'); return; }
    rs.malfunction = true; state.malfLeft--;
    log(state, '⚙ Поломка: ' + roomName(state, roomId) + (why ? ' (' + why + ')' : '') + '.', 'event');
}
export function removeMalfunction(state, roomId) {
    const rs = room(state, roomId);
    if (!rs.malfunction) return;
    rs.malfunction = false; state.malfLeft++;
    log(state, 'Поломка устранена: ' + roomName(state, roomId) + '.', 'good');
}
export function placeNoise(state, corridorId) {
    if (corridorId === 'tech') {
        if (state.ship.techNoise) return false;
        state.ship.techNoise = true; return true;
    }
    const c = state.ship.corridors[corridorId];
    if (c.noise) return false;
    c.noise = true; return true;
}
export function corridorsOf(state, roomId) {
    const r = state.ship.rooms[roomId];
    const list = r.exits.map(e => ({ id: e.corridor, num: e.num, nums: e.nums || [e.num], to: e.to }));
    if (r.tech) list.push({ id: 'tech', num: 0, nums: r.techNums || [], to: null });
    return list;
}
export function clearNoiseAround(state, roomId) {
    for (const c of corridorsOf(state, roomId)) {
        if (c.id === 'tech') state.ship.techNoise = false; else state.ship.corridors[c.id].noise = false;
    }
}
export function destroyShip(state, why) {
    if (state.shipDestroyed) return;
    state.shipDestroyed = true;
    // 22.2: destroying the ship also destroys the Nest for every Objective check.
    state.nestDestroyed = true;
    log(state, '💥 КОРАБЛЬ УНИЧТОЖЕН: ' + why + '.', 'death');
    for (const p of state.players) if (p.status === 'active' || p.status === 'hibernating') { p.status = 'dead'; p.health = 0; }
    state.intruders = {};
    state.queue = []; state.prompt = null; state.resume = null;
    next(state, { op: 'game.end' });
}

// ---------------------------------------------------------------------------------------------
// Intruders
// ---------------------------------------------------------------------------------------------
export function spawnIntruder(state, type, roomId) {
    const onBoard = Object.values(state.intruders).filter(i => i.type === type).length + (type === 'larva' ? state.players.filter(p => p.larva).length : 0);
    const limit = { larva: 8, adult: 12, drone: 12, queen: 1 }[type];
    if (onBoard >= limit) { log(state, 'Миниатюры «' + INTRUDER_NAMES[type] + '» закончились — чужой не появляется.', 'minor'); return null; }
    if (type === 'queen' && state.queenDead) return null;
    const uid = 'i' + (++state.intruderSeq);
    state.intruders[uid] = { uid, type, room: roomId, hits: 0 };
    fx(state, { type: 'spawn', intruder: type, room: roomId });
    log(state, '👾 ' + INTRUDER_NAMES[type] + ' появляется: ' + roomName(state, roomId) + '.', 'event');
    return state.intruders[uid];
}
export function removeIntruder(state, uid, leaveCarcass) {
    const it = state.intruders[uid];
    if (!it) return;
    if (leaveCarcass && (it.type === 'adult' || it.type === 'drone')) { room(state, it.room).objects.push({ type: 'carcass' }); state.carcassCount = (state.carcassCount || 0) + 1; }
    delete state.intruders[uid];
}
export function intruderLabel(state, it) {
    return INTRUDER_NAMES[it.type] + (it.type === 'queen' ? ' (ранений ' + state.queenHits + ')' : it.hits ? ' (ранений ' + it.hits + ')' : '');
}
export const INTRUDER_RANK = { queen: 0, drone: 1, adult: 2, larva: 3 };
/** Is the given intruder Adaptation currently active? */
export function hasAdapt(state, key) { return !!(state.adaptations && state.adaptations.includes(key)); }

/** Roll `die`. If the acting player already rolled interactively (state.pendingRoll from the
 *  'dice' prompt) that value is consumed instead. Every roll is recorded in state.lastRoll so
 *  all clients can animate it. */
export function roll(state, die) {
    const id = die === NOISE_DIE ? 'noise' : 'combat';
    let v;
    if (state.pendingRoll && state.pendingRoll.die === id) { v = state.pendingRoll.value; state.pendingRoll = null; }
    else v = die[randInt(state, die.length)];
    state.rollSeq = (state.rollSeq || 0) + 1;
    state.lastRoll = { n: state.rollSeq, die: id, value: v, player: state.pendingRollPlayer == null ? null : state.pendingRollPlayer };
    return v;
}
/** Insert an interactive dice prompt before `step` (which is re-queued afterwards).
 *  Returns true when the caller must return and wait; false when the roll is already pending. */
export function needDice(state, step, die, playerId, title, extra) {
    if (state.pendingRoll && state.pendingRoll.die === die) return false;
    const p = state.players[playerId];
    if (!p || p.status !== 'active') return false;
    // `extra` lets a roll carry the room it happens in: the client keeps the name hidden until the
    // tile has actually been turned over on the table (see the dice gate in the client).
    ask(state, Object.assign({ kind: 'dice', player: playerId, die, title }, extra || {}), { op: 'dice.rolled', die, player: playerId, then: step });
    return true;
}
OPS['dice.rolled'] = (state, step) => {
    const die = step.die === 'noise' ? NOISE_DIE : COMBAT_DIE;
    state.pendingRoll = { die: step.die, value: die[randInt(state, die.length)] };
    state.pendingRollPlayer = step.player;
    next(state, step.then);
};
export function fmtRoll(v) { return v === 'crit' ? 'КРИТ' : v === 'silence' ? 'Тишина' : v === 'danger' ? 'Опасность' : v === 'encounter' ? 'Встреча' : String(v); }

/** Printed meaning of a bag token (p. 9). The Queen token changes once the Queen is dead. */
export const BAG_TOKEN_MEANING = {
    blank: 'Пустой жетон: добавить в мешок 2 взрослых из запаса и вернуть пустой жетон в мешок.',
    larva: 'Личинка: добавить в мешок 1 жетон дрона; жетон личинки вернуть в запас.',
    adult: 'Взрослый: добавить в мешок 1 жетон Королевы; жетон взрослого вернуть в запас.',
    drone: 'Дрон: добавить в мешок 1 жетон Королевы; жетон дрона вернуть в запас.',
    queen: 'Королева: если она на поле — активируется (в её комнате персонажи — атака, иначе шаг к ближайшему). Если Королевы нет — добавить 1 жетон личинки и выставить её в Гибернатории (это не Встреча). Жетон вернуть в запас.',
};
export const BAG_TOKEN_MEANING_DEAD_QUEEN = {
    blank: 'Пустой жетон: добавить в мешок 2 взрослых из запаса и вернуть пустой жетон в мешок.',
    larva: 'Личинка: добавить в мешок 1 жетон дрона; жетон личинки вернуть в запас.',
    adult: 'Взрослый (Королева мертва): добавить в мешок 1 жетон личинки; жетон взрослого вернуть в запас.',
    drone: 'Дрон (Королева мертва): добавить в мешок 1 жетон личинки; жетон дрона вернуть в запас.',
    queen: 'Королева мертва: добавить в мешок 1 жетон дрона и убрать жетон Королевы из игры.',
};
export function bagTokenMeaning(state, token) {
    const table = state.queenDead ? BAG_TOKEN_MEANING_DEAD_QUEEN : BAG_TOKEN_MEANING;
    return table[token] || '';
}

/** Draw one token. `meta` ({ by, reason }) is kept in state.bagLast so every client can show
 *  what was pulled, why it was pulled and what it means. */
export function drawBagToken(state, meta) {
    if (!state.bag.length) return null;
    const i = randInt(state, state.bag.length);
    const tok = state.bag.splice(i, 1)[0];
    state.bagSeq = (state.bagSeq || 0) + 1;
    state.bagLast = {
        n: state.bagSeq, token: tok, left: state.bag.length,
        by: meta && meta.by != null ? meta.by : null, reason: (meta && meta.reason) || '',
        meaning: bagTokenMeaning(state, tok), effect: '',
    };
    fx(state, { type: 'bag', token: tok, left: state.bag.length, reason: state.bagLast.reason });
    return tok;
}
/** bag.ask { player, reason, then } — let the player pull the token out of the bag themselves.
 *  `then` is re-queued with `token` (null when the bag is empty). */
OPS['bag.ask'] = (state, step) => {
    const p = step.player != null ? state.players[step.player] : null;
    const reason = step.reason || '';
    const interactive = state.ui && state.ui.bagClick && p && p.status === 'active' && state.bag.length > 0;
    if (!interactive) { next(state, Object.assign({}, step.then, { token: drawBagToken(state, { by: p ? p.id : null, reason }) })); return; }
    ask(state, { kind: 'bag', player: p.id, title: 'Вытяните жетон из мешка', text: reason, count: state.bag.length },
        { op: 'bag.drawn', player: p.id, reason, then: step.then });
};
OPS['bag.drawn'] = (state, step) => {
    const token = drawBagToken(state, { by: step.player, reason: step.reason });
    next(state, Object.assign({}, step.then, { token }));
};
export function returnToken(state, token, toBag) {
    if (token === 'blank' || toBag) state.bag.push(token);
}
