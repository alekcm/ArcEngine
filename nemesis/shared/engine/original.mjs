// original.mjs — the ORIGINAL ruleset (Nemesis, 2018). Everything that differs from Redux lives
// here so the Redux engine keeps its own shape: the two games differ in their dice, their bestiary,
// their attack/event decks, their bag development and what they do NOT have (Feats, Field Data and
// Adaptations are Redux additions — the original game plays Weakness cards instead).
//
// Printed sources: p.6 (initial bag), p.10–11 (round structure, Hive Development), p.18–19 (Contact,
// Shooting, Melee, Battle die), p.20 (Intruder wounds, death, retreat, attacks).

import { NOISE_DIE, COMBAT_DIE, BLUE_DIE, intruderLabel, log, next, roll, removeIntruder, OPS,
    turnOrder, inCombat, playersInRoom, intrudersIn, drawCards, drawLimit, room, roomName, tileOf,
    gainWound, gainContamination, hasWeak, pname, spawnIntruder, canDestroyDoor, orderIndex,
    ORIGINAL_COMBAT_DIE, ORIGINAL_FACE_TEXT, ORIGINAL_BAG_MEANING, isOriginal, combatDieFor,
    noiseDieFor, ORIGINAL_INTRUDERS, HIBERNATION_TIME, SELF_DESTRUCT_LENGTH, destroyShip, recordTurretEntry } from './core.mjs';
import { INTRUDER_NAMES, ITEMS, EVENT_CARDS } from '../data/cards.mjs';
import { ORIGINAL_ATTACK_BY_ID, ORIGINAL_EVENT_BY_ID } from '../data/original-cards.mjs';
import { shuffle } from '../rng.mjs';

export { ORIGINAL_COMBAT_DIE, ORIGINAL_FACE_TEXT, isOriginal, combatDieFor, noiseDieFor, ORIGINAL_INTRUDERS };

// -------------------------------------------------------------------------------------------
// Dice
// -------------------------------------------------------------------------------------------
export function describeCombatFace(state, face) {
    if (!isOriginal(state)) return face === 'crit' ? 'КРИТ' : String(face);
    return ORIGINAL_FACE_TEXT[face] || String(face);
}

/** Numeric value of a Battle die face: the original die shows Wounds, Redux shows numbers. */
export function faceValue(face) {
    if (typeof face === 'number') return face;
    if (face === 'crit') return 1;
    if (face === 'two') return 2;
    if (face === 'one' || face === 'small' || face === 'adult') return 1;
    return 0;
}

/** Token Surprise-Attack threshold of an intruder under the current ruleset. */
export function intruderToughness(state, type) {
    if (!isOriginal(state)) return null;
    const d = ORIGINAL_INTRUDERS[type];
    return d ? d.wounds : null;
}

/** How many Wounds one Battle die face deals to this target when Shooting (original rules, p. 18). */
export function originalShootWounds(target, face) {
    const type = target && target.type;
    const small = type === 'larva' || type === 'crawler';
    const adult = small || type === 'adult';
    if (face === 'two') return 2;
    if (face === 'one') return 1;
    if (face === 'adult') return adult ? 1 : 0;
    if (face === 'small') return small ? 1 : 0;
    return 0;
}

/** How many Wounds one Battle die face deals in Melee (p. 19: double-crosshair counts as 1 Wound). */
export function originalMeleeWounds(target, face) {
    return Math.min(1, originalShootWounds(target, face));
}

// -------------------------------------------------------------------------------------------
// Wounds, Death & Retreat (p. 20)
// -------------------------------------------------------------------------------------------
let ATTACK_CARDS_BY_ID = null;
export function bindAttackCards(list) { ATTACK_CARDS_BY_ID = Object.fromEntries(list.map(c => [c.id, c])); }

function lookupAttackCard(id) {
    return ORIGINAL_ATTACK_BY_ID[id] || (ATTACK_CARDS_BY_ID && ATTACK_CARDS_BY_ID[id]) || null;
}

function drawAttackCard(state) {
    if (!state.attackDeck.length) {
        if (!state.attackDiscard.length) return null;
        state.attackDeck = shuffle(state, state.attackDiscard.splice(0));
        log(state, 'Колода атак перемешана.', 'minor');
    }
    const id = state.attackDeck.shift();
    state.attackDiscard.push(id);
    return id;
}

const REDUX_EVENT_BY_ID = Object.fromEntries(EVENT_CARDS.map(e => [e.id, e]));
function drawEventCorridor(state) {
    if (!state.eventDeck.length) {
        if (!state.eventDiscard.length) return null;
        state.eventDeck = shuffle(state, state.eventDiscard.splice(0));
    }
    const id = state.eventDeck.shift();
    if (!id) return null;
    state.eventDiscard.push(id);
    const ev = ORIGINAL_EVENT_BY_ID[id] || REDUX_EVENT_BY_ID[id];
    return ev && ev.move && ev.move.num ? { id, name: ev.name, num: ev.move.num } : { id, name: ev ? ev.name : id, num: 1 };
}

/** Retreat arrow on an Attack card drawn for toughness (p. 20): draw 1 Event card and move the
 *  intruder along that corridor number, then discard the Event card. */
export function originalRetreatIntruder(state, it) {
    if (!it || !state.intruders[it.uid]) return false;
    const drawn = drawEventCorridor(state);
    if (!drawn) { log(state, INTRUDER_NAMES[it.type] + ' пытается отступить, но колода событий пуста.', 'combat'); return false; }
    const r = state.ship.rooms[it.room];
    const exit = r.exits.find(e => (e.nums || [e.num]).includes(drawn.num));
    if (!exit) {
        if (r.tech && (r.techNums || []).includes(drawn.num)) {
            log(state, '↩ Отступление («' + drawn.name + '», коридор ' + drawn.num + '): ' + INTRUDER_NAMES[it.type] + ' уходит в тех. коридоры (в мешок).', 'good');
            removeIntruder(state, it.uid, false);
            state.bag.push(it.type);
            return true;
        }
        log(state, '↩ Отступление («' + drawn.name + '»): коридора ' + drawn.num + ' нет — ' + INTRUDER_NAMES[it.type] + ' остаётся на месте.', 'combat');
        return false;
    }
    const c = state.ship.corridors[exit.corridor];
    if (c.door === 'closed') {
        if (canDestroyDoor(state, it)) {
            c.door = 'destroyed';
            log(state, '↩ Отступление («' + drawn.name + '», коридор ' + drawn.num + '): ' + INTRUDER_NAMES[it.type] + ' ломает закрытую дверь ' + c.id + '.', 'event');
        } else {
            log(state, '↩ Отступление («' + drawn.name + '», коридор ' + drawn.num + '): закрытая дверь ' + c.id + ' останавливает чужого (повадки движения).', 'event');
        }
        return false;
    }
    it.room = exit.to;
    recordTurretEntry(state, 'intruder', it.uid, exit.to);
    log(state, '↩ Отступление («' + drawn.name + '», коридор ' + drawn.num + '): ' + INTRUDER_NAMES[it.type] + ' сбегает в ' + roomName(state, exit.to) + '.', 'good');
    return true;
}

/**
 * The original death check (p. 20):
 *  - Larva dies to 1 Wound (no Attack card, no Carcass).
 *  - Crawler or Adult draws 1 Attack card.
 *  - Drone (Breeder) or Queen draws 2 Attack cards and sums their Wound values.
 *  - If ANY drawn card shows the Retreat arrow, the intruder retreats instead of dying.
 *  - Revealed «Вид на грани вымирания» (`endangered`) lowers Toughness by 1 (min 1).
 */
export function originalDeathCheck(state, it) {
    const def = ORIGINAL_INTRUDERS[it.type];
    if (!def) return { killed: false, retreated: false, cards: [], total: 0 };
    if (def.diesOnOneWound) return { killed: (it.hits || 0) >= 1, retreated: false, cards: [], total: 1 };
    const two = it.type === 'drone' || it.type === 'queen';
    const ids = [];
    for (let k = 0; k < (two ? 2 : 1); k++) { const id = drawAttackCard(state); if (id) ids.push(id); }
    const cards = ids.map(lookupAttackCard);
    if (cards.some(c => c && c.wound === 'retreat')) {
        return { killed: false, retreated: true, cards: ids, total: null };
    }
    const raw = cards.reduce((s, c) => s + (c && typeof c.wound === 'number' ? c.wound : 1), 0);
    const frail = hasWeak(state, 'endangered') ? 1 : 0;
    const total = Math.max(1, raw - frail);
    return { killed: (it.hits || 0) >= total, retreated: false, cards: ids, total };
}

export function originalIntruderDies(state, it) { return originalDeathCheck(state, it).killed; }

export function addWounds(state, it, n) {
    if (!state.intruders[it.uid] || n <= 0) return 0;
    it.hits = (it.hits || 0) + n;
    return it.hits;
}

function finishDeathOrRetreat(state, it, check, p, opts) {
    if (check.retreated) {
        log(state, '🃏 Проверка результата атаки (' + check.cards.join(', ') + '): символ Отступления!', 'combat');
        originalRetreatIntruder(state, it);
        return false;
    }
    if (check.cards.length) {
        log(state, '🃏 Проверка стойкости: ' + INTRUDER_NAMES[it.type] + ' — ' + it.hits + ' ран. против ' + check.total + ' (' + check.cards.join(', ') + ').', 'combat');
    }
    if (check.killed) {
        if (it.type === 'queen') { state.queenDead = true; log(state, '👑 КОРОЛЕВА МЕРТВА!', 'good'); }
        log(state, '✔ ' + INTRUDER_NAMES[it.type] + ' убит!', 'good');
        removeIntruder(state, it.uid, it.type !== 'larva');
        if (opts && opts.onKill) opts.onKill(state, p, opts);
        return true;
    }
    log(state, INTRUDER_NAMES[it.type] + ' выживает (ранений ' + it.hits + ').', 'combat');
    return false;
}

/**
 * Resolve a Character's Shooting or Melee attack under the original rules (p. 18–20).
 *  - Shooting rolls the d6 Battle die; weapon/weakness riders add to hits when >= 1 Wound lands.
 *  - Melee ALSO rolls the d6 Battle die (double-crosshair counts as 1 Wound); on a MISS the
 *    character suffers 1 Serious Wound (p. 19) and no wounds are placed; on a HIT no retaliation
 *    happens even if the intruder survives its toughness check.
 */
export function originalDealHits(state, p, it, hits, mod, opts = {}) {
    const shooting = !!opts.weapon;
    const die = opts.die || combatDieFor(state, p);
    let natural = opts.forcedRoll !== undefined ? opts.forcedRoll : roll(state, die);
    if (opts.bestOfTwo) {
        const second = roll(state, die);
        const s1 = shooting ? originalShootWounds(it, natural) : originalMeleeWounds(it, natural);
        const s2 = shooting ? originalShootWounds(it, second) : originalMeleeWounds(it, second);
        log(state, '🎲 Два броска — ' + (ORIGINAL_FACE_TEXT[natural] || natural) + ' и ' + (ORIGINAL_FACE_TEXT[second] || second) + '.', 'combat');
        if (s2 > s1) natural = second;
    }
    state.lastCombatNatural = natural;
    let face = natural;
    // Scientist's Pistol (p. 19 example): rolled 2 Wounds counts as 1 Wound.
    if (shooting && opts.weapon.item === 'scientistPistol' && face === 'two') {
        face = 'one';
        log(state, 'Пистолет учёного: 2 раны считаются 1 раной.', 'combat');
    }
    // Weak Spots («Уязвимые места»): against Adults («Трутни») a blank face counts as 1 Wound.
    if (face === 'miss' && it.type === 'adult' && hasWeak(state, 'weakSpots')) {
        face = 'one';
        log(state, '🎯 Уязвимые места: промах по Взрослому считается 1 раной.', 'good');
    }
    state.lastCombatFace = face;
    if (opts.contamFaces && opts.contamFaces.includes(natural) && p) gainContamination(state, p, 1);

    let wounds = shooting ? originalShootWounds(it, face) : originalMeleeWounds(it, face);
    const bonus = Math.max(0, (hits || 1) - 1);
    if (wounds > 0) wounds += bonus;
    if (shooting && wounds >= 1 && ITEMS[opts.weapon.item] && ITEMS[opts.weapon.item].weapon && ITEMS[opts.weapon.item].weapon.energy && hasWeak(state, 'energyVuln')) {
        wounds++;
        log(state, '⚡ Уязвимость к энергии: +1 рана.', 'good');
    }

    if (shooting) {
        log(state, '🎲 Бросок боя: ' + (ORIGINAL_FACE_TEXT[natural] || String(natural)) + ' → ' + wounds + ' ран.', 'combat');
        if (wounds <= 0) return false;
    } else {
        if (wounds <= 0) {
            log(state, '🎲 Ближний бой: ' + (ORIGINAL_FACE_TEXT[natural] || String(natural)) + ' — промах!', 'bad');
            if (p && !opts.noMissWound) gainWound(state, p, 1);
            return false;
        }
        log(state, '🎲 Ближний бой: ' + (ORIGINAL_FACE_TEXT[natural] || String(natural)) + ' → ' + wounds + ' ран.', 'combat');
    }

    addWounds(state, it, wounds);
    if (!state.intruders[it.uid]) return true;
    const check = originalDeathCheck(state, it);
    return finishDeathOrRetreat(state, it, check, p, opts);
}

/** Wounds dealt without a die (fire, explosions, items): apply, then run the death/retreat check. */
export function originalApplyWounds(state, it, n) {
    if (!state.intruders[it.uid] || !(n > 0)) return false;
    addWounds(state, it, n);
    log(state, INTRUDER_NAMES[it.type] + ' получает ' + n + ' ран. (всего ' + it.hits + ').', 'combat');
    const check = originalDeathCheck(state, it);
    return finishDeathOrRetreat(state, it, check, null, null);
}

// -------------------------------------------------------------------------------------------
// Intruder Attacks (p. 20 & Чужие - Атака.png)
// -------------------------------------------------------------------------------------------
export function originalAttackEffects(state, card, it, p) {
    if (!card.targets || !card.targets.includes(it.type)) return [{ op: 'origMiss' }];
    switch (card.effect) {
        case 'scratch': return [{ op: 'dmg', n: 1 }, { op: 'contam' }];
        case 'claws':   return [{ op: 'dmg', n: 2 }, { op: 'contam' }];
        case 'bite':
            if (it.type === 'adult' && hasWeak(state, 'attackHabits')) return [{ op: 'dmg', n: 1 }];
            return [p.wounds.length >= 2 ? { op: 'origKill' } : { op: 'wound', n: 1 }];
        case 'slime':     return [{ op: 'origSlime' }, { op: 'contam' }];
        case 'summon':    return [{ op: 'origSummon' }];
        case 'transform': return [{ op: 'origTransform' }];
        case 'frenzy':    return [{ op: 'origFrenzy' }];
        case 'tail':      return [p.wounds.length >= 1 ? { op: 'origKill' } : { op: 'wound', n: 1 }];
        default:          return [{ op: 'origMiss' }];
    }
}

// -------------------------------------------------------------------------------------------
// Hive Development (p. 10, step 8)
// -------------------------------------------------------------------------------------------
export function originalBagTokenMeaning(token) {
    if (!token || typeof token !== 'string') return '';
    return ORIGINAL_BAG_MEANING[token] || '';
}

export function originalBagDevelopment(state, token, add) {
    const notes = [];
    if (!token || typeof token !== 'string') { notes.push('Мешок пуст.'); return { steps: [], notes }; }
    switch (token) {
        case 'larva':
            add('adult', 1);
            notes.push('Жетон Личинки убран в запас; в мешок добавлен 1 Взрослый.');
            break;
        case 'crawler':
            add('drone', 1);
            notes.push('Жетон Ползуна убран в запас; в мешок добавлен 1 Дрон (Охотник).');
            break;
        case 'adult':
        case 'drone':
            state.bag.push(token);
            notes.push('Жетон возвращён в мешок; каждый персонаж вне боя бросает кубик Шума.');
            return { steps: [{ op: 'noise.all', skipInCombat: true, reason: 'Развитие Улья: ' + INTRUDER_NAMES[token] }], notes };
        case 'queen': {
            if (state.queenDead) {
                notes.push('Королева мертва — жетон уходит из игры.');
                break;
            }
            const hive = Object.keys(state.ship.rooms).find(id => state.roomState[id].tile === 'nest');
            const inside = hive ? playersInRoom(state, hive) : [];
            if (inside.length) {
                let q = Object.values(state.intruders).find(i => i.type === 'queen');
                if (q) q.room = hive;
                else q = spawnIntruder(state, 'queen', hive);
                notes.push('Королева появляется в Гнезде — Контакт!');
                if (q) {
                    const target = [...inside].sort((a, b) => a.hand.length - b.hand.length || orderIndex(state, a) - orderIndex(state, b))[0];
                    const threshold = hasWeak(state, 'dangerSense') ? 3 : 4;
                    if (target && originalSneakAttack(state, threshold, target)) {
                        return { steps: [{ op: 'attack', intruder: q.uid, player: target.id, context: 'surprise' }], notes };
                    }
                }
                break;
            }
            state.bag.push('queen');
            if (!state.nestDestroyed) {
                state.nestEggs = (state.nestEggs || 0) + 1;
                notes.push('Персонажей в Гнезде нет — добавлено 1 яйцо (всего ' + state.nestEggs + '), жетон Королевы возвращён в мешок.');
            } else {
                notes.push('Гнездо уничтожено — жетон Королевы возвращён в мешок.');
            }
            break;
        }
        case 'blank':
            add('adult', 1);
            state.bag.push('blank');
            notes.push('В мешок добавлен 1 Взрослый, пустой жетон возвращён в мешок.');
            break;
        default:
            notes.push('Эффекта нет.');
            break;
    }
    return { steps: [], notes };
}

/** Every character rolls the Noise die in turn order (Hive Development Adult / Breeder token). */
OPS['noise.all'] = (state, step) => {
    const order = turnOrder(state).filter(p => p.status === 'active' && !p.pod);
    const steps = [];
    for (const p of order) {
        if (step && step.skipInCombat && inCombat(state, p)) { log(state, pname(p) + ' в бою — броска шума нет.', 'minor'); continue; }
        steps.push({ op: 'noise.roll', player: p.id, room: p.room });
    }
    next(state, ...steps);
};

/** Step 6 of the original Event Phase (p. 10): active Turrets and fire deal damage together.
 *  Resolve Turrets first so an Intruder killed by fire still destroys the active Turret it shared
 *  the room with at the start of this step. */
OPS['original.phaseFire'] = state => next(state,
    { op: 'turret.eventPhase' },
    { op: 'original.fireDamage' });

OPS['original.fireDamage'] = state => {
    for (const [id, rs] of Object.entries(state.roomState)) {
        if (!rs.fire) continue;
        for (const it of intrudersIn(state, id)) {
            const fireHits = hasWeak(state, 'fireVuln') ? 2 : 1;
            originalApplyWounds(state, it, fireHits);
        }
        if (tileOf(state, id) === 'nest' && state.nestEggs > 0) {
            state.nestEggs--;
            log(state, 'Огонь в Гнезде уничтожает яйцо (осталось ' + state.nestEggs + ').', 'event');
            if (state.nestEggs <= 0 && !state.nestDestroyed) { state.nestDestroyed = true; log(state, '🥚 Гнездо уничтожено!', 'event'); }
        }
    }
};

/** Start of the Player Phase under the original rules (p. 10): everyone draws up to five cards
 *  (six in a working, intruder-free Quarters / Cafeteria, p. 25). */
export function originalDrawPhase(state) {
    for (const p of state.players) {
        if (p.status !== 'active') continue;
        let limit = drawLimit(p);
        if (tileOf(state, p.room) === 'cafeteria' && !room(state, p.room).malfunction && !inCombat(state, p)) limit++;
        const need = Math.max(0, limit - p.hand.length);
        if (need) drawCards(state, p, need);
    }
}

/** The time counter of the original Event Phase (p. 10, step 4). Returns true when the game ended. */
export function originalTimeStep(state) {
    state.time--;
    log(state, '⏱ Время: ' + state.time + (state.time <= HIBERNATION_TIME ? ' (гибернация доступна)' : '') + '.', 'info');
    if (state.selfDestruct > 0) {
        state.selfDestruct++;
        log(state, '☢ Самоуничтожение: ' + state.selfDestruct + '/' + SELF_DESTRUCT_LENGTH + '.', 'death');
        if (state.selfDestruct === 4 && !state.podsUnlocked) { state.podsUnlocked = true; for (const pod of state.pods) pod.locked = false; log(state, 'Жёлтая зона: капсулы разблокированы, отсчёт не остановить.', 'event'); }
        if (state.selfDestruct >= SELF_DESTRUCT_LENGTH) { destroyShip(state, 'самоуничтожение'); return true; }
    }
    if (state.time <= 0) { log(state, 'Время вышло — корабль уходит в гиперпространство.', 'event'); next(state, { op: 'game.end' }); return true; }
    return false;
}

// -------------------------------------------------------------------------------------------
// Encounter (p. 18)
// -------------------------------------------------------------------------------------------
/** p. 18 step 4: compare the token number against ALL cards in hand (Action + Contamination). */
export function originalSneakAttack(state, tokenValue, character) {
    return character.hand.length < tokenValue;
}

export function originalIntruderLabel(state, it) {
    const def = ORIGINAL_INTRUDERS[it.type];
    if (!def) return intruderLabel(state, it);
    return def.name + (it.hits ? ' (ранений ' + it.hits + ')' : '');
}
