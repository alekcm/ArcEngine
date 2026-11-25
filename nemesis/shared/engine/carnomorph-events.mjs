// Event execution uses the same serializable queue as Redux.
import { shuffle } from '../rng.mjs';
import { CARNOMORPH_EVENT_CARDS, CARNOMORPH_EVENT_BY_ID } from '../data/carnomorph-events.mjs';
import { RX_CARNOMORPH_EVENT_CARDS, RX_CARNOMORPH_EVENT_BY_ID } from '../data/carnomorphs-redux.mjs';
import { isReduxCarnomorphs } from '../dlc.mjs';
import { OPS, next, log, pname, room, roomName, playersInRoom, intrudersIn, removeIntruder,
    placeFire, removeFire, placeMalfunction, placeNoise, corridorsOf, findRoomsByTile, tileOf, turnOrder,
    drawCards, discardCard, isContam, isInfected, canDestroyDoor, loseHealth, gainContamination,
    removeMalfunction } from './core.mjs';
import { INTRUDER_NAMES } from '../data/cards.mjs';
import { hasCarnomorphAdaptation, spawnCarnomorph, addCarnomorphToken } from './carnomorphs.mjs';
import { startSelfDestruct } from './events.mjs';
import { hyperAttackStep, moveOneToward } from './intruders.mjs';
import { infectionProcedure } from './actions.mjs';
import { ROOM_TILES } from '../ship.mjs';

const ranks = new Set(['metagorger', 'shambler', 'breeder', 'fleshbeast', 'butcher']);
const heavy = new Set(['egg', 'carcass', 'charCorpse', 'corpse']);

export function initCarnomorphEventDeck(state) {
    const deck = isReduxCarnomorphs(state) ? RX_CARNOMORPH_EVENT_CARDS : CARNOMORPH_EVENT_CARDS;
    state.eventDeck = shuffle(state, deck.map(c => c.id));
    state.eventDiscard = [];
    state.carnomorphEventRemoved = [];
}
const eventById = state => isReduxCarnomorphs(state) ? RX_CARNOMORPH_EVENT_BY_ID : CARNOMORPH_EVENT_BY_ID;

// Forced event movement still encounters closed doors; substitution bypasses them.
function moveTo(state, it, exit) {
    const c = state.ship.corridors[exit.corridor];
    if (c.door === 'closed' && !hasCarnomorphAdaptation(state, 'substitution')) {
        if (canDestroyDoor(state, it)) {
            c.door = 'destroyed';
            log(state, INTRUDER_NAMES[it.type] + ' ломает дверь ' + c.id + '.', 'event');
        }
        return null;
    }
    it.room = exit.to;
    log(state, INTRUDER_NAMES[it.type] + ' перемещается в ' + roomName(state, exit.to) + '.', 'event');
    return hyperAttackStep(state, it);
}
function hasHeavy(state, id) {
    return room(state, id).objects.some(o => heavy.has(o.type)) ||
        playersInRoom(state, id).some(p => p.heavy.some(o => heavy.has(o.type)));
}

const rxRooms = state => Object.keys(state.ship.rooms).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
const rxActionCards = p => p.hand.filter(c => !String(c).startsWith('contam#'));
function rxHeavyIn(state, id) {
    return room(state, id).objects.some(o => heavy.has(o.type)) ||
        playersInRoom(state, id).some(p => p.heavy.some(o => heavy.has(o.type)));
}
/** Printed sub-effect on several Redux cards: place one Metagorger in the lowest and highest
 *  numbered rooms holding a Carcass or Egg, including ones carried by characters. */
function rxPlaceMetagorgers(state) {
    const candidates = rxRooms(state).filter(id => rxHeavyIn(state, id) &&
        !intrudersIn(state, id).some(x => ranks.has(x.type)) &&
        (room(state, id).objects.some(o => o.type === 'carcass' || o.type === 'egg') ||
            playersInRoom(state, id).some(p => p.heavy.some(o => o.type === 'carcass' || o.type === 'egg'))));
    for (const id of [candidates[0], candidates.at(-1)]) if (id) spawnCarnomorph(state, 'metagorger', id);
}
/** The Redux cards either wake and move the Butcher twice, or make characters with no Action
 *  cards resolve an Encounter in turn order. */
function rxButcherOrAttacks(state, attacks) {
    const targets = state.players.filter(p => p.status === 'active' && !p.pod);
    const butcher = Object.values(state.intruders).find(it => it.type === 'butcher');
    if (butcher) {
        for (let i = 0; i < 2; i++) moveOneToward(state, butcher, targets);
        if (playersInRoom(state, butcher.room).length) attacks.push({ op: 'attack', intruder: butcher.uid, context: 'event' });
        return;
    }
    for (const p of targets) {
        if (rxActionCards(p).length) continue;
        // Printed yellow alien head: resolve an Encounter (draw from the bag), not an attack
        // from whichever Carnomorph happens to share the room.
        attacks.push({ op: 'encounter', room: p.room, player: p.id,
            reason: 'Событие: нет карт действий в руке — встреча' });
    }
}
function rxIconRooms(state, color, count) {
    return rxRooms(state).filter(id => {
        const tile = tileOf(state, id);
        return tile && ROOM_TILES[tile] && ROOM_TILES[tile].items.filter(x => x === color).length >= count;
    });
}
/** Printed Airlock Procedure: close the room's doors, place the token (resolved at the end
 *  of the Player Phase) and unpass everyone inside. */
function rxStartAirlock(state, id) {
    for (const c of corridorsOf(state, id)) {
        if (c.id !== 'tech' && state.ship.corridors[c.id].door === 'open') state.ship.corridors[c.id].door = 'closed';
    }
    room(state, id).airlock = true;
    for (const p of playersInRoom(state, id)) if (p.passed) p.passed = false;
    log(state, '🌀 Жетон шлюзования: ' + roomName(state, id) + '. Комната будет продута в конце фазы игроков.', 'event');
}
function rxEventEffect(state, ev) {
    const rooms = rxRooms(state);
    const attacks = [];
    switch (ev.effect) {
        case 'airlockGlitch': {
            const last = rxIconRooms(state, 'yellow', 3).filter(id => room(state, id).malfunction).at(-1);
            if (last) {
                removeMalfunction(state, last);
                rxStartAirlock(state, last);
            } else log(state, 'Процедура шлюзования: подходящего отсека уже нет.', 'minor');
            rxPlaceMetagorgers(state);
            break;
        }
        case 'ammoMeltdown': {
            const target = rxIconRooms(state, 'red', 3).filter(id => !room(state, id).fire).at(-1);
            if (target) placeFire(state, target, 'детонация амуниции');
            else log(state, 'Детонация амуниции: подходящего отсека нет.', 'minor');
            rxButcherOrAttacks(state, attacks);
            break;
        }
        case 'beastOnProwl': {
            const alive = Object.values(state.intruders).some(it => it.type === 'butcher');
            for (let i = 0; i < (alive ? 3 : 2); i++) addCarnomorphToken(state, alive ? 'butcher' : 'shambler');
            if (alive) log(state, 'Зверь на охоте: в мешок добавлены жетоны мясника.', 'event');
            else log(state, 'Зверь на охоте: в мешок добавлены 2 жетона падальщика.', 'event');
            break;
        }
        case 'bulkheadsOpen':
            for (const c of Object.values(state.ship.corridors)) if (c.door !== 'destroyed') c.door = 'open';
            rxPlaceMetagorgers(state);
            break;
        case 'chemicalFire': {
            const target = rooms.filter(id => room(state, id).fire).at(-1);
            if (!target) { log(state, 'Химический пожар: подходящего отсека нет.', 'minor'); break; }
            placeMalfunction(state, target, 'химический пожар');
            removeFire(state, target);
            for (const e of state.ship.rooms[target].exits) {
                if (state.shipDestroyed) break;
                if (state.ship.corridors[e.corridor].door === 'closed' || e.corridor === 'tech') continue;
                placeFire(state, e.to, 'химический пожар');
            }
            break;
        }
        case 'damagingFire': {
            const before = new Set(rooms.filter(id => room(state, id).fire));
            for (const id of before) placeMalfunction(state, id, 'огненная волна');
            for (const id of before) for (const e of state.ship.rooms[id].exits) {
                if (state.shipDestroyed) break;
                if (state.ship.corridors[e.corridor].door === 'closed' || e.corridor === 'tech') continue;
                if (!before.has(e.to)) placeFire(state, e.to, 'огненная волна');
            }
            break;
        }
        case 'podEjection': {
            const pod = state.pods.find(p => p.num === 4 && !p.launched && !p.removed);
            if (pod) {
                pod.removed = true;
                for (const pid of pod.occupants) { const p = state.players[pid]; if (p) p.pod = null; }
                pod.occupants = [];
                log(state, 'Капсула №4 удалена из игры.', 'event');
            } else {
                for (const t of ['evacA', 'evacB']) for (const id of findRoomsByTile(state, t)) placeMalfunction(state, id, 'событие');
            }
            rxPlaceMetagorgers(state);
            break;
        }
        case 'generatorOverheats': {
            const gen = findRoomsByTile(state, 'generator');
            if (gen.some(id => room(state, id).malfunction)) startSelfDestruct(state);
            else if (gen.length) placeMalfunction(state, gen[0], 'перегрев генератора');
            break;
        }
        case 'malfunction': {
            const target = rooms.find(id => !room(state, id).malfunction);
            if (target) placeMalfunction(state, target, 'событие');
            break;
        }
        case 'markedPrey':
            for (const p of state.players.filter(o => o.status === 'active' && !o.pod)) {
                if (rxHeavyIn(state, p.room) || p.heavy.some(o => heavy.has(o.type))) gainContamination(state, p, 1);
            }
            rxButcherOrAttacks(state, attacks);
            break;
        case 'quarantine':
            for (const c of Object.values(state.ship.corridors)) {
                if (c.door === 'destroyed') continue;
                if ([c.a, c.b].some(id => playersInRoom(state, id).some(p => p.mutationCard))) c.door = 'closed';
            }
            break;
        case 'rampantMutation':
            for (const p of state.players.filter(o => o.status === 'active' && !o.pod)) {
                const before = p.hand.length;
                drawCards(state, p, 4, true);
                const drawn = p.hand.slice(before);
                if (!p.mutationCard) {
                    // Printed: characters without a Mutation card still resolve the Infection
                    // Procedure on everything they drew.
                    infectionProcedure(state, p, false, 'rest');
                } else {
                    for (const card of drawn) if (isContam(card) && p.status === 'active') loseHealth(state, p, 1, 'бушующая мутация');
                }
                for (const card of drawn) if (p.hand.includes(card)) discardCard(state, p, card);
            }
            break;
        case 'reawakening': case 'reawakeningB': {
            for (const id of rooms) {
                const objects = room(state, id).objects;
                for (let i = 0; i < objects.length;) {
                    if (objects[i].type !== 'carcass') { i++; continue; }
                    const it = spawnCarnomorph(state, 'shambler', id);
                    if (!it) break;
                    objects.splice(i, 1);
                    if (playersInRoom(state, id).length) attacks.push({ op: 'attack', intruder: it.uid, context: 'event' });
                }
            }
            if (ev.effect === 'reawakening') rxPlaceMetagorgers(state);
            break;
        }
        case 'scavengingBiomatter':
            for (const it of Object.values(state.intruders)) {
                if (!ranks.has(it.type)) continue;
                const exits = state.ship.rooms[it.room].exits.filter(e => rxHeavyIn(state, e.to))
                    .sort((a, b) => a.to.localeCompare(b.to, undefined, { numeric: true }));
                if (!exits.length) continue;
                const c = state.ship.corridors[exits[0].corridor];
                if (c.door === 'closed' && !canDestroyDoor(state, it)) continue;
                if (c.door === 'closed') c.door = 'destroyed';
                it.room = exits[0].to;
                log(state, INTRUDER_NAMES[it.type] + ' перемещается к биомассе в ' + roomName(state, it.room) + '.', 'event');
                const h = hyperAttackStep(state, it); if (h) attacks.push(h);
            }
            rxPlaceMetagorgers(state);
            break;
        case 'shortCircuit':
            for (const id of rxIconRooms(state, 'yellow', 3)) placeMalfunction(state, id, 'короткое замыкание');
            break;
        case 'stalking':
            rxButcherOrAttacks(state, attacks);
            break;
        case 'structuralWeakness':
            for (const id of rooms.filter(x => playersInRoom(state, x).length)) placeMalfunction(state, id, 'структурная уязвимость');
            rxPlaceMetagorgers(state);
            break;
        case 'systemFailure':
            for (const id of rxIconRooms(state, 'red', 3)) placeMalfunction(state, id, 'сбой системы');
            rxButcherOrAttacks(state, attacks);
            break;
        default: throw new Error('Unknown Redux Carnomorph event effect: ' + ev.effect);
    }
    next(state, ...attacks);
}

OPS['carnomorph.eventEffect'] = (state, step) => {
    const ev = eventById(state)[step.id];
    if (!ev) throw new Error('Unknown Carnomorph event: ' + step.id);
    if (isReduxCarnomorphs(state)) { rxEventEffect(state, ev); return; }
    const rooms = Object.keys(state.ship.rooms).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    switch (ev.effect) {
        case 'chemicalExplosion': {
            const r = rooms.filter(id => room(state, id).fire).at(-1);
            if (!r) break;
            placeMalfunction(state, r, 'событие');
            if (state.shipDestroyed) break;
            removeFire(state, r);
            for (const e of state.ship.rooms[r].exits) if (state.ship.corridors[e.corridor].door !== 'closed') {
                placeFire(state, e.to, 'взрыв химикатов');
                if (state.shipDestroyed) break;
            }
            break;
        }
        case 'ambush':
            for (const it of Object.values(state.intruders)) {
                if (!ranks.has(it.type) || it.type === 'metagorger' || playersInRoom(state, it.room).length) continue;
                removeIntruder(state, it.uid, false);
                addCarnomorphToken(state, it.type);
            }
            break;
        case 'evacError': {
            const pod = state.pods.filter(p => p.section === 'B' && !p.launched && !p.removed).sort((a, b) => b.num - a.num)[0];
            if (!pod) break;
            for (const id of pod.occupants) {
                const p = state.players[id];
                p.status = 'escaped'; p.pod = null; state.finishOrder.push(p.id);
                log(state, '🚀 ' + pname(p) + ' покидает корабль в капсуле №' + pod.num + '.', 'event');
            }
            pod.launched = true; pod.occupants = [];
            log(state, 'Капсула №' + pod.num + ' запущена событием.', 'event');
            break;
        }
        case 'biomass':
        case 'pursuit': {
            const attacks = [];
            for (const it of Object.values(state.intruders)) {
                if (!ranks.has(it.type)) continue;
                if (ev.effect === 'biomass' && it.type === 'butcher') continue;
                if (ev.effect === 'pursuit' && (it.type === 'metagorger' || playersInRoom(state, it.room).length)) continue;
                const exits = state.ship.rooms[it.room].exits.filter(e => ev.effect === 'biomass' ? hasHeavy(state, e.to) : playersInRoom(state, e.to).length)
                    .sort((a, b) => a.to.localeCompare(b.to, undefined, { numeric: true }));
                if (exits.length) { const attack = moveTo(state, it, exits[0]); if (attack) attacks.push(attack); }
            }
            next(state, ...attacks);
            break;
        }
        case 'airlockFailure':
            for (const t of ['evacA', 'evacB']) for (const r of findRoomsByTile(state, t)) {
                if (state.shipDestroyed) return;
                placeMalfunction(state, r, 'событие');
            }
            break;
        case 'generatorOverload':
            if (rooms.filter(r => room(state, r).malfunction).length >= 3) startSelfDestruct(state);
            break;
        case 'awakening': {
            const attacks = [];
            for (const id of rooms) {
                const objects = room(state, id).objects;
                // Replace each physical carcass only if the miniature is actually available.
                for (let i = 0; i < objects.length;) {
                    if (objects[i].type !== 'carcass') { i++; continue; }
                    const it = spawnCarnomorph(state, 'shambler', id);
                    if (!it) break;
                    objects.splice(i, 1);
                    if (playersInRoom(state, id).length) attacks.push({ op: 'attack', intruder: it.uid, context: 'event' });
                }
            }
            next(state, ...attacks);
            break;
        }
        case 'roar':
            for (const id of rooms) if (intrudersIn(state, id).some(it => ranks.has(it.type)))
                for (const c of corridorsOf(state, id)) placeNoise(state, c.id);
            break;
        case 'threateningMutation':
            next(state, ...turnOrder(state).filter(p => p.status === 'active' && !p.pod)
                .map(p => ({ op: 'carnomorph.eventMutation', player: p.id })));
            break;
        case 'beastOnHunt': case 'markedPrey': case 'quarantine':
            log(state, 'Слизь не используется: зависящий от неё эффект события пропущен.', 'minor');
            break;
        case 'detonation': {
            // Printed (Redux wording): fire in the lowest-numbered compartment with three red item
            // symbols and in every compartment next to it. Fire does not spread through closed
            // doors or technical corridors — a technical corridor is not a room exit, so only the
            // door check matters here.
            const target = Object.keys(state.ship.rooms).sort().find(id => {
                const printed = tileOf(state, id);
                return printed && ROOM_TILES[printed] && ROOM_TILES[printed].items.filter(x => x === 'red').length >= 3;
            });
            if (!target) { log(state, 'Детонация амуниции: отсека с тремя красными значками нет — эффект пропущен.', 'minor'); break; }
            log(state, 'Детонация амуниции: огонь в ' + roomName(state, target) + ' и в соседних отсеках.', 'event');
            placeFire(state, target, 'Детонация амуниции');
            for (const exit of state.ship.rooms[target].exits) {
                if (state.shipDestroyed) break;
                if (state.ship.corridors[exit.corridor].door === 'closed') continue;
                placeFire(state, exit.to, 'Детонация амуниции');
            }
            break;
        }
        case 'decompression': case 'structuralWeakness':
            log(state, 'Цвет отсека и счётчик предметов отсутствуют в Redux: эффект события пропущен.', 'minor');
            break;
        default: throw new Error('Unknown Carnomorph event effect: ' + ev.effect);
    }
};

OPS['carnomorph.eventMutation'] = (state, step) => {
    const p = state.players[step.player];
    if (!p || p.status !== 'active' || p.pod) return;
    const oldLength = p.hand.length;
    drawCards(state, p, 4, true);
    const drawn = p.hand.slice(oldLength);
    const infected = drawn.some(card => isContam(card) && isInfected(state, card));
    for (const card of drawn) discardCard(state, p, card);
    log(state, pname(p) + ': событие проверяет ' + drawn.length + ' взятых карт' + (infected ? ', обнаружено заражение.' : ', заражения нет.'), infected ? 'bad' : 'minor');
    if (infected && p.status === 'active') next(state, { op: 'carnomorph.gainMarker', player: p.id });
};
