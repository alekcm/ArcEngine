// Voidseeder event effects. All prompts and continuations are plain serializable queue steps.
import { OPS, next, log, pname, room, roomName, tileOf, playersInRoom, intrudersIn, corridorsOf,
    placeFire, placeMalfunction, placeNoise, clearNoiseAround, findRoomsByTile, turnOrder, gainContamination, drawCards, discardCard, isContam, isInfected } from './core.mjs';
import { ROOM_TILES } from '../ship.mjs';
import { VOID_EVENT_BY_ID, VOID_TYPES } from '../data/voidseeders.mjs';
import { spawnVoid, infectMadness } from './voidseeders.mjs';
import { startSelfDestruct } from './events.mjs';
import { shuffle } from '../rng.mjs';

const eligible = state => turnOrder(state).filter(p => p.status === 'active' && !p.pod);
OPS['void.eventEffect'] = (state, step) => {
    const ev = VOID_EVENT_BY_ID[step.id];
    if (!ev) throw new Error('Unknown Voidseeder event: ' + step.id);
    const players = eligible(state), rooms = Object.keys(state.ship.rooms).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    switch (ev.effect) {
        case 'agoraphobia': {
            if (state.voidDespoilerDead) break;
            const id = rooms.find(id => playersInRoom(state, id).length > 1);
            if (!id) break;
            const existing = Object.values(state.intruders).find(it => it.type === 'despoiler');
            if (existing) { existing.room = id; log(state, 'Гнетущий появляется в ' + roomName(state, id) + '.', 'event'); }
            else spawnVoid(state, 'despoiler', id);
            break;
        }
        case 'autophobia': next(state, ...players.filter(p => playersInRoom(state, p.room).length === 1 && !intrudersIn(state, p.room).length).map(p => ({ op: 'void.panic', player: p.id }))); break;
        case 'fuelExplosion': for (const id of rooms.filter(id => state.ship.rooms[id].kind === 'engine')) { placeFire(state, id, 'событие'); if (state.shipDestroyed) break; } break;
        case 'neurosis': {
            const lairs = new Set(Object.values(state.intruders).filter(it => it.type === 'lair').map(it => it.room));
            next(state, ...players.filter(p => lairs.has(p.room) || state.ship.rooms[p.room].exits.some(e => lairs.has(e.to))).map(p => ({ op: 'void.panic', player: p.id })));
            break;
        }
        case 'systemError': {
            const computers = rooms.filter(id => { const t = tileOf(state, id); return t && ROOM_TILES[t]?.computer; });
            if (computers.some(id => room(state, id).malfunction)) for (const id of computers) { placeMalfunction(state, id, 'событие'); if (state.shipDestroyed) break; }
            break;
        }
        case 'hunt':
            for (const it of Object.values(state.intruders)) {
                if (!VOID_TYPES.includes(it.type) || playersInRoom(state, it.room).length) continue;
                const exits = state.ship.rooms[it.room].exits.filter(e => playersInRoom(state, e.to).length).sort((a, b) => a.to.localeCompare(b.to, undefined, { numeric: true }));
                if (exits.length) { it.room = exits[0].to; log(state, 'Кошмар движется в ' + roomName(state, it.room) + '.', 'event'); }
            }
            break;
        case 'aiFailure': {
            const computers = rooms.filter(id => { const t = tileOf(state, id); return t && ROOM_TILES[t]?.computer; });
            if (computers.filter(id => room(state, id).malfunction).length >= 2) startSelfDestruct(state);
            else if (computers.length) placeMalfunction(state, computers[0], 'событие');
            break;
        }
        case 'generatorOverheat': {
            const id = findRoomsByTile(state, 'generator')[0];
            if (id) {
                if (!room(state, id).malfunction) placeMalfunction(state, id, 'событие');
                else if (!room(state, id).fire) placeFire(state, id, 'событие');
                else for (const e of state.ship.rooms[id].exits) if (state.ship.corridors[e.corridor].door !== 'closed') { placeFire(state, e.to, 'событие'); if (state.shipDestroyed) break; }
            }
            break;
        }
        case 'podEjection': {
            const pod = state.pods.filter(p => !p.launched && !p.removed).sort((a, b) => b.num - a.num)[0];
            if (!pod) break;
            for (const id of pod.occupants) { const p = state.players[id]; p.status = 'escaped'; p.pod = null; state.finishOrder.push(p.id); }
            pod.launched = true; pod.occupants = [];
            log(state, 'Капсула №' + pod.num + ' запущена событием.', 'event');
            break;
        }
        case 'fireWall': {
            const id = rooms.find(id => room(state, id).fire);
            if (id) for (const e of state.ship.rooms[id].exits) if (state.ship.corridors[e.corridor].door !== 'closed') { placeFire(state, e.to, 'событие'); if (state.shipDestroyed) break; }
            break;
        }
        case 'fear': for (const p of players) if (p.madness > p.hand.length) gainContamination(state, p, 1); break;
        case 'panicAttack': next(state, ...players.map(p => ({ op: 'void.eventPanicAttack', player: p.id }))); break;
        case 'whisper': {
            if (!state.eventDeck.length) state.eventDeck = shuffle(state, state.eventDiscard.splice(0));
            const id = state.eventDeck.shift(), opened = VOID_EVENT_BY_ID[id];
            if (!opened) break;
            state.eventDiscard.push(id);
            log(state, 'Шёпот: открыта «' + opened.name + '», коридор ' + opened.move.num + '.', 'event');
            const seen = new Set(), steps = [];
            for (const p of players) for (const c of corridorsOf(state, p.room)) {
                if (!c.nums.includes(opened.move.num) || seen.has(c.id)) continue;
                seen.add(c.id); steps.push({ op: 'void.eventWhisper', player: p.id, corridor: c.id, room: p.room });
            }
            next(state, ...steps);
            break;
        }
        default: throw new Error('Unknown Voidseeder event effect: ' + ev.effect);
    }
};
OPS['void.eventPanicAttack'] = (state, step) => {
    const p = state.players[step.player]; if (!p || p.status !== 'active' || p.pod) return;
    const n = p.hand.length; drawCards(state, p, 5, true);
    const drawn = p.hand.slice(n), infected = drawn.some(c => isContam(c) && isInfected(state, c));
    for (const card of drawn) discardCard(state, p, card);
    if (infected && p.status === 'active') infectMadness(state, p);
    if (p.status === 'active' && p.madness === 5) for (const c of [...p.hand]) discardCard(state, p, c);
};
OPS['void.eventWhisper'] = (state, step) => {
    const p = state.players[step.player]; if (!p || p.status !== 'active' || p.pod) return;
    if (!corridorsOf(state, step.room).some(c => c.id === step.corridor)) return;
    if (placeNoise(state, step.corridor)) return;
    if (p.room !== step.room) return;
    clearNoiseAround(state, step.room);
    next(state, { op: 'encounter', player: p.id, room: step.room, reason: 'Шёпот: столкновение' });
};
