// Voidseeder setup and rules helpers; see the DLC status document for adaptations and test scope.
import { initialExpansionBag, changeMadness } from '../dlc.mjs';
import { shuffle } from '../rng.mjs';
import { addVoidToken } from './void-bag.mjs';
import { repelIntruder } from './intruders.mjs';
export { addVoidToken } from './void-bag.mjs';
import { VOID_TYPES, VOID_LIMITS, VOID_LEVEL_TYPES, VOID_ATTACK_CARDS, VOID_ATTACK_BY_ID,
    VOID_PANIC_CARDS, VOID_EVENT_CARDS, VOID_WEAKNESSES } from '../data/voidseeders.mjs';
import { INTRUDER_NAMES } from '../data/cards.mjs';
import { log, pname, killPlayer, spawnIntruder, removeIntruder, room, playersInRoom, corridorsOf, placeNoise, fx } from './core.mjs';

/** Initialize the pack, including the agreed replacements for three exploration tokens. */
export function initVoidseeders(state) {
    if (state.enemySet !== 'voidseeders') throw new RangeError('Voidseeder setup requires Voidseeders');
    const { bag, supply } = initialExpansionBag('voidseeders', state.players.map(p => p.id), state);
    state.bag = bag; state.voidSupply = supply;
    state.attackDeck = shuffle(state, VOID_ATTACK_CARDS.map(c => c.id)); state.attackDiscard = [];
    state.eventDeck = shuffle(state, VOID_EVENT_CARDS.map(c => c.id)); state.eventDiscard = [];
    state.voidPanicDeck = shuffle(state, VOID_PANIC_CARDS.map(c => c.id)); state.voidPanicDiscard = [];
    const selected = shuffle(state, Object.keys(VOID_WEAKNESSES)).slice(0, 3);
    state.secret.voidWeaknesses = { madness: selected[0], carcass: selected[1], egg: selected[2] };
    state.voidWeaknesses = []; state.voidAnalyzed = { madness: false, carcass: false, egg: false };
    state.voidLairsDestroyed = 0; state.voidDespoilerDead = false; state.nestEggs = 5;
    const malfunctionRooms = shuffle(state, Object.keys(state.secret.tokens).filter(id => state.secret.tokens[id] === 'malfunction'));
    const doorRooms = shuffle(state, Object.keys(state.secret.tokens).filter(id => state.secret.tokens[id] === 'door'));
    if (malfunctionRooms.length < 2 || doorRooms.length < 1) throw new Error('Not enough Redux exploration tokens for Voidseeders');
    for (const id of [...malfunctionRooms.slice(0, 2), doorRooms[0]]) state.secret.tokens[id] = 'lair';
    state.adaptations = []; state.weaknessMode = false; state.weaknesses = [];
    delete state.secret.weaknesses;
    for (const p of state.players) p.madness = 1;
}

export function returnVoidTokenToSupply(state, token) {
    if (!token || typeof token !== 'object' || !token.id || token.value === undefined) throw new RangeError('Expected a numbered Nightmare token');
    state.voidSupply.push(token);
}

/** Normal increase/decrease; the third level is an irreversible floor, unless a card overrides it. */
export function alterMadness(state, p, delta, { ignoreFloor = false } = {}) {
    if (!p || p.status === 'dead') return null;
    const before = p.madness;
    const out = ignoreFloor && delta < 0 ? { level: Math.max(1, before + delta), dead: false } : changeMadness(before, delta);
    p.madness = out.level;
    if (out.level !== before) log(state, '🧠 ' + pname(p) + ': безумие ' + before + ' → ' + out.level + '.', 'event');
    if (out.dead) killPlayer(state, p, 'безумие превысило 5');
    return out;
}
/** Infection scan sets the level to 5, even when it is already 5; this never itself kills. */
export function infectMadness(state, p) {
    if (!p || p.status === 'dead') return;
    const before = p.madness; p.madness = 5;
    if (before !== 5) log(state, '🧠 ' + pname(p) + ': заражение устанавливает безумие на 5.', 'bad');
}

/** Reveal an assigned card once, without exposing the other face-down cards. */
export function revealVoidWeakness(state, type) {
    if (!Object.hasOwn(state.voidAnalyzed, type) || state.voidAnalyzed[type]) return false;
    const id = state.secret.voidWeaknesses[type];
    if (!id || !Object.hasOwn(VOID_WEAKNESSES, id)) return false;
    state.voidAnalyzed[type] = true; state.voidWeaknesses.push(id);
    log(state, '🔬 Раскрыта уязвимость «' + VOID_WEAKNESSES[id].name + '».', 'good');
    if (id === 'calmWave') for (const p of state.players) if (p.status !== 'dead') alterMadness(state, p, -1, { ignoreFloor: true });
    return true;
}
export function hasVoidWeakness(state, id) { return (state.voidWeaknesses || []).includes(id); }

/** Same-rank spawn or, when requested, the strongest available lower nightmare. */
export function spawnVoid(state, type, roomId, fallback = false) {
    if (!Object.hasOwn(VOID_LIMITS, type)) throw new RangeError('Unknown Voidseeder type: ' + type);
    if (type === 'lair' && state.voidLairsDestroyed + Object.values(state.intruders).filter(it => it.type === 'lair').length >= VOID_LIMITS.lair) return null;
    if (!fallback || type === 'lair') return spawnIntruder(state, type, roomId);
    let i = VOID_TYPES.indexOf(type);
    while (i >= 0) {
        const candidate = VOID_TYPES[i--];
        if (candidate === 'despoiler' && state.voidDespoilerDead) continue;
        if (Object.values(state.intruders).filter(it => it.type === candidate).length >= VOID_LIMITS[candidate]) continue;
        return spawnIntruder(state, candidate, roomId);
    }
    return null;
}
export function encounterVoidType(state, p) {
    if (!Number.isInteger(p.madness) || p.madness < 1 || p.madness > 5) throw new RangeError('Invalid madness');
    return p.madness === 2 && hasVoidWeakness(state, 'blurredVisions') ? 'lurker' : VOID_LEVEL_TYPES[p.madness];
}

/** Destroy a lair or a nightmare. Only lairs leave a carcass; the Despoiler dies with the third lair. */
export function killVoid(state, it, { space = false } = {}) {
    if (!it || !state.intruders[it.uid] || !Object.hasOwn(VOID_LIMITS, it.type)) return false;
    if (it.type === 'despoiler') return false; // cannot be killed by ordinary attacks
    removeIntruder(state, it.uid, false);
    if (it.type === 'lair') {
        if (!space) {
            room(state, it.room).objects.push({ type: 'carcass' });
            state.carcassCount = (state.carcassCount || 0) + 1;
        }
        state.voidLairsDestroyed++;
        if (state.voidLairsDestroyed >= VOID_LIMITS.lair) {
            state.voidDespoilerDead = true;
            const despoiler = Object.values(state.intruders).find(i => i.type === 'despoiler');
            if (despoiler) removeIntruder(state, despoiler.uid, false);
            // The rules count the Despoiler as destroyed even when its figure is not on the board.
            addVoidToken(state);
            log(state, 'Все логова уничтожены: Гнетущий погибает и больше не появляется.', 'good');
        }
    } else addVoidToken(state);
    return true;
}

/** Draw a public card for a toughness check, reshuffling the discard if required. */
function drawVoidAttack(state) {
    if (!state.attackDeck.length) state.attackDeck = shuffle(state, state.attackDiscard.splice(0));
    const id = state.attackDeck.shift(), card = VOID_ATTACK_BY_ID[id];
    if (!card) throw new Error('Missing Voidseeder attack card: ' + id);
    state.attackDiscard.push(id); return card;
}
/** Damage resolution AFTER the Redux hit roll. Lair arrows prevent destruction, never movement. */
export function voidPowerCheck(state, it, hits) {
    if (!it || !state.intruders[it.uid] || !Object.hasOwn(VOID_LIMITS, it.type)) return null;
    if (!Number.isInteger(hits) || hits < 1) throw new RangeError('Damage must be a positive integer');
    const count = ['lurker', 'creeper', 'lair'].includes(it.type) ? 2 : 1;
    const cards = Array.from({ length: count }, () => drawVoidAttack(state));
    if (it.type !== 'despoiler') it.hits += hits;
    const arrow = cards.some(c => c.toughness === 'retreat');
    const numbers = cards.map(c => c.toughness).filter(n => typeof n === 'number');
    const required = numbers.length ? (it.type === 'lurker' ? Math.min(...numbers) : Math.max(...numbers)) : null;
    let result = 'survived';
    if (arrow && it.type !== 'lair') { result = 'retreat'; repelIntruder(state, it); }
    else if (!arrow && it.type !== 'despoiler' && required !== null && it.hits >= required) { result = 'killed'; killVoid(state, it); }
    const description = INTRUDER_NAMES[it.type] + ': ' + cards.map(c => c.toughness === 'retreat' ? 'стрелка' : c.toughness).join(' / ') +
        ' → ' + (result === 'killed' ? 'уничтожен' : result === 'retreat' ? 'отступление' : 'выжил') + '.';
    for (const card of cards) fx(state, { type: 'attack', check: true, card: card.id, name: card.name, intruder: it.type, effect: description });
    log(state, 'Проверка стойкости: ' + description, 'combat');
    return { cards: cards.map(c => c.id), result, required };
}

/** Attack effects on a target (rank mismatch is a miss, not a discard reshuffle). */
export function voidAttackEffects(card, it, p) {
    if (!card.targets.includes(it.type)) return [{ op: 'voidMiss' }];
    switch (card.effect) {
        case 'frenzy': return [{ op: 'voidFrenzy' }];
        case 'intimidation': return [{ op: 'contam' }, { op: 'voidPanic' }];
        case 'division': return [{ op: 'voidSpawn' }];
        case 'devourMind': return [p.wounds.length >= 1 ? { op: 'voidKill' } : { op: 'wound', n: 2 }];
        case 'cut': return [{ op: 'dmg', n: 1 }, { op: 'contam' }];
        case 'horror': return [{ op: 'wound', n: 1 }, { op: 'voidPanic' }];
        case 'bite': return [p.wounds.length >= 2 ? { op: 'voidKill' } : { op: 'wound', n: 1 }];
        default: throw new Error('Invalid Voidseeder attack effect');
    }
}

/** The physical lair never dissipates; doors do not block the neighbouring-room test. */
export function dissipateVoid(state) {
    const rooms = Object.keys(state.ship.rooms).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const removed = [];
    for (const id of rooms) {
        if (playersInRoom(state, id).length || state.ship.rooms[id].exits.some(e => playersInRoom(state, e.to).length)) continue;
        const nightmares = Object.values(state.intruders).filter(it => it.room === id && VOID_TYPES.includes(it.type));
        if (!nightmares.length) continue;
        for (const c of corridorsOf(state, id)) placeNoise(state, c.id);
        for (const it of nightmares) { removeIntruder(state, it.uid, false); addVoidToken(state); removed.push(it.uid); }
    }
    return removed;
}
