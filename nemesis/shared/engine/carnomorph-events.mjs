// Event execution uses the same serializable queue as Redux.
import { shuffle } from '../rng.mjs';
import { CARNOMORPH_EVENT_CARDS, CARNOMORPH_EVENT_BY_ID } from '../data/carnomorph-events.mjs';
import { OPS, next, log, pname, room, roomName, playersInRoom, intrudersIn, removeIntruder,
    placeFire, removeFire, placeMalfunction, placeNoise, corridorsOf, findRoomsByTile, turnOrder,
    drawCards, discardCard, isContam, isInfected, canDestroyDoor } from './core.mjs';
import { INTRUDER_NAMES } from '../data/cards.mjs';
import { hasCarnomorphAdaptation, spawnCarnomorph, addCarnomorphToken } from './carnomorphs.mjs';
import { startSelfDestruct } from './events.mjs';
import { hyperAttackStep } from './intruders.mjs';

const ranks = new Set(['metagorger', 'shambler', 'breeder', 'butcher']);
const heavy = new Set(['egg', 'carcass', 'charCorpse', 'corpse']);

export function initCarnomorphEventDeck(state) {
    state.eventDeck = shuffle(state, CARNOMORPH_EVENT_CARDS.map(c => c.id));
    state.eventDiscard = [];
    state.carnomorphEventRemoved = [];
}

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

OPS['carnomorph.eventEffect'] = (state, step) => {
    const ev = CARNOMORPH_EVENT_BY_ID[step.id];
    if (!ev) throw new Error('Unknown Carnomorph event: ' + step.id);
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
        case 'detonation': case 'decompression': case 'structuralWeakness':
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
