// combat.mjs — intruder attacks, shooting, melee, hits and the Queen's health deck.

import { OPS, ask, next, log, player, pname, intrudersIn, playersInRoom, room, roomName, healthState, loseHealth, gainWound,
    gainContamination, killPlayer, discardCard, COMBAT_DIE, roll, fmtRoll, needDice, fx, removeIntruder, intruderLabel, INTRUDER_RANK,
    drawCards, placeFire, placeNoise, cardDef, orderIndex, hasAdapt, placeMalfunction, heavyCount, handLimit, HEAVY_NAMES, spendUPS, removeCardFromGame } from './core.mjs';
import { repelIntruder, moveOneToward, hyperAttackStep } from './intruders.mjs';
import { countAvailable } from './movement.mjs';
import { ATTACK_CARDS, ITEMS, QUEEN_CARDS, INTRUDER_NAMES } from '../data/cards.mjs';
import { shuffle } from '../rng.mjs';

const ATTACK_BY_ID = Object.fromEntries(ATTACK_CARDS.map(c => [c.id, c]));

/** Target choice: fewest cards in hand, ties by turn order. */
export function pickTarget(state, roomId) {
    const ps = playersInRoom(state, roomId);
    if (!ps.length) return null;
    ps.sort((a, b) => a.hand.length - b.hand.length || orderIndex(state, a) - orderIndex(state, b));
    return ps[0];
}

/** attack { intruder, player?, context, moving?, dest? } */
OPS['attack'] = (state, step) => {
    const it = state.intruders[step.intruder];
    if (!it) return;
    let p = step.player !== undefined ? player(state, step.player) : pickTarget(state, it.room);
    if (!p || p.status !== 'active') return;
    if (p.noAttacks) { log(state, pname(p) + ' деактивирован(а) до конца раунда — атака не происходит.', 'minor'); return; }
    // "Don't Panic" held by ANOTHER character in the room: that player decides first.
    if (!step.noReaction) {
        const asked = step.askedPanic || [];
        const holder = playersInRoom(state, it.room).find(o => o.id !== p.id && o.status === 'active' && !asked.includes(o.id) && o.hand.some(c => (cardDef(state, c) || {}).effect === 'dontPanic'));
        if (holder) {
            const card = holder.hand.find(c => (cardDef(state, c) || {}).effect === 'dontPanic');
            ask(state, { kind: 'choice', player: holder.id, title: intruderLabel(state, it) + ' атакует ' + pname(p) + '. Сыграть «Без паники», чтобы предотвратить атаку?', options: [{ id: 'yes', label: 'Да' }, { id: 'no', label: 'Нет' }] },
                { ...step, op: 'attack.panic', holder: holder.id, card, target: p.id, askedPanic: [...asked, holder.id] });
            return;
        }
    }
    // Reactions of the target that prevent or redirect the attack
    const find = eff => p.hand.find(c => (cardDef(state, c) || {}).effect === eff);
    const findR = eff => p.hand.find(c => (cardDef(state, c) || {}).reactionToo === eff);
    const nerves = find('preventAttack'), strafe = find('fdCircleStrafe'), panic = find('dontPanic'), sentinel = find('sentinel');
    const pher = findR('pheromonesReaction'), duck = findR('duckReaction');
    const opts = [];
    if (nerves) opts.push({ id: 'card', label: 'Сыграть «Стальные нервы»' });
    if (strafe) opts.push({ id: 'strafe', label: 'Сыграть «Стрейф по кругу» (предотвратить и выстрелить)' });
    if (panic) opts.push({ id: 'panic', label: 'Сыграть «Без паники» (предотвратить атаку)' });
    if (sentinel && step.context === 'surprise' && p.laika === 'board') opts.push({ id: 'sentinel', label: 'Сыграть «Страж»: Лайка предотвращает внезапную атаку' });
    if (pher && step.context === 'surprise' && p.tissue > 0) opts.push({ id: 'pher', label: 'Сыграть «Феромоны»: сбросить 1 образец ткани — предотвратить атаку' });
    const othersHere = playersInRoom(state, it.room).filter(o => o.id !== p.id && o.status === 'active');
    if (duck && othersHere.length && !step.redirected) opts.push({ id: 'duck', label: 'Сыграть «Пригнуться»: чужой атакует другого персонажа' });
    for (const i of p.items) {
        const d = ITEMS[i.item];
        if (d.preventAttack === 'allAmmo' && i.ammo > 0 && !i.broken) opts.push({ id: 'item:' + i.uid, label: '«' + d.name + '»: сбросить все патроны (' + i.ammo + ') — 1 ранение чужому' });
        if (d.preventAttack === 'marker' && !i.charge && !i.broken) opts.push({ id: 'item:' + i.uid, label: '«' + d.name + '»: положить жетон' });
    }
    if (opts.length && !step.noReaction) {
        opts.push({ id: 'no', label: 'Принять атаку' });
        ask(state, { kind: 'choice', player: p.id, title: intruderLabel(state, it) + ' атакует вас. Предотвратить?', options: opts },
            { ...step, op: 'attack.reaction', player: p.id, card: nerves, strafe, panic, sentinel, pher, duck });
        return;
    }
    if (it.type === 'larva') { resolveLarva(state, it, p); return; }
    resolveAttack(state, step, it, p);
};
function resolveLarva(state, it, p) {
    log(state, 'Личинка атакует ' + pname(p) + '.', 'combat');
    if (p.charId === 'android') {
        log(state, pname(p) + ': Синтетик — личинка не может заразить андроида.', 'good');
    } else {
        gainContamination(state, p, 1);
        if (!p.larva) { p.larva = true; log(state, pname(p) + ' заражён личинкой!', 'bad'); }
    }
    removeIntruder(state, it.uid, false);
}
OPS['attack.panic'] = (state, step) => {
    const h = player(state, step.holder);
    if (step.answer === 'yes' && h.hand.includes(step.card)) {
        discardCard(state, h, step.card);
        log(state, pname(h) + ' играет «Без паники»: атака на ' + pname(player(state, step.target)) + ' предотвращена.', 'good');
        return;
    }
    next(state, { ...step, op: 'attack', answer: undefined, holder: undefined, card: undefined });
};
OPS['attack.reaction'] = (state, step) => {
    const p = player(state, step.player);
    const it = state.intruders[step.intruder];
    const play = (c, msg) => { discardCard(state, p, c); log(state, pname(p) + ' играет ' + msg, 'good'); };
    if (step.answer === 'card' && step.card) { play(step.card, '«Стальные нервы»: атака предотвращена.'); return; }
    if (step.answer === 'panic' && step.panic) { play(step.panic, '«Без паники»: атака предотвращена.'); return; }
    if (step.answer === 'sentinel' && step.sentinel) { play(step.sentinel, '«Страж»: Лайка предотвращает внезапную атаку.'); return; }
    if (step.answer === 'pher' && step.pher) { p.tissue--; play(step.pher, '«Феромоны» (−1 образец ткани): внезапная атака предотвращена.'); return; }
    if (step.answer === 'duck' && step.duck) {
        play(step.duck, '«Пригнуться»: чужой атакует другого персонажа.');
        const others = playersInRoom(state, it ? it.room : p.room).filter(o => o.id !== p.id && o.status === 'active');
        if (others.length === 1) { next(state, { ...step, op: 'attack', player: others[0].id, redirected: true, answer: undefined }); return; }
        ask(state, { kind: 'choice', player: p.id, title: 'Кого атакует чужой вместо вас?', options: others.map(o => ({ id: String(o.id), label: pname(o) })) }, { ...step, op: 'attack.duckPick' });
        return;
    }
    if (step.answer === 'strafe' && step.strafe) {
        play(step.strafe, '«Стрейф по кругу»: атака предотвращена.');
        if (state.intruders[step.intruder] && p.items.some(i => canFire(p, i))) {
            ask(state, { kind: 'choice', player: p.id, title: 'Стрейф по кругу: выстрелить в атакующего?', options: [{ id: 'yes', label: 'Да' }, { id: 'no', label: 'Нет' }] },
                { op: 'attack.strafeShoot', player: p.id, intruder: step.intruder });
        }
        return;
    }
    if (String(step.answer).startsWith('item:')) {
        const i = p.items.find(x => x.uid === step.answer.slice(5));
        if (i && ITEMS[i.item].preventAttack === 'allAmmo') { i.ammo = 0; if (it) applyHitsNoRoll(state, it, 1); }
        else if (i) i.charge = 1;
        log(state, pname(p) + ': «' + ITEMS[i.item].name + '» — атака предотвращена.', 'good');
        return;
    }
    next(state, { ...step, op: 'attack', noReaction: true, answer: undefined });
};
OPS['attack.deactShown'] = (state, step) => {
    const p = player(state, step.player);
    if (!p || p.status !== 'active' || !ATTACK_BY_ID[step.cardId]) { next(state, { op: 'noop' }); return; }
    if (step.answer === 'deact') {
        const card = p.hand.find(c => (cardDef(state, c) || {}).effect === 'deactivation');
        if (card) { discardCard(state, p, card); log(state, pname(p) + ' играет «Деактивацию»: атака «' + ATTACK_BY_ID[step.cardId].name + '» проигнорирована.', 'good'); }
        if (state.phase === 'player') { ask(state, { kind: 'choice', player: p.id, title: 'Деактивация: спасовать? (до конца раунда вас больше не атакуют)', options: [{ id: 'yes', label: 'Да, спасовать' }, { id: 'no', label: 'Нет' }] }, { op: 'attack.deactPass', player: p.id }); return; }
        return;
    }
    next(state, { ...step, op: 'attack.armor', revealed: true, answer: 'no' });
};
OPS['shoot.rerollAsk'] = (state, step) => {
    const p = player(state, step.player);
    const it = state.intruders[step.intruder];
    const w = p.items.find(i => i.uid === step.weapon);
    const then = step.then || { op: 'turn.choose' };
    if (!it || !w) { next(state, then); return; }
    if (step.answer === 'reroll' || step.answer === 'yes') {
        const r = adaptRoll(state, roll(state, COMBAT_DIE));
        const val = r === 'crit' ? 'crit' : (typeof r === 'number' ? r + step.mod : 'crit');
        log(state, '🎲 ' + ITEMS[w.item].name + ' — переброс: ' + fmtRoll(r) + (step.mod ? ' +' + step.mod + ' = ' + val : '') + '.', 'combat');
        if (val === 'crit' || val <= it.hits) {
            log(state, '✔ ' + INTRUDER_NAMES[it.type] + ' убит!', 'good');
            removeIntruder(state, it.uid, true);
            next(state, { op: 'turn.choose' });
            return;
        }
        log(state, INTRUDER_NAMES[it.type] + ' выживает (ранений ' + it.hits + ').', 'combat');
    } else {
        if (step.first === 'crit' || step.first <= it.hits) {
            log(state, '✔ ' + INTRUDER_NAMES[it.type] + ' убит!', 'good');
            removeIntruder(state, it.uid, true);
        } else log(state, INTRUDER_NAMES[it.type] + ' выживает (ранений ' + it.hits + ').', 'combat');
    }
    next(state, { op: 'turn.choose' });
};
OPS['attack.stopIt'] = (state, step) => {
    const p = player(state, step.player);
    if (!p || p.status !== 'active' || !ATTACK_BY_ID[step.cardId]) { next(state, { op: 'noop' }); return; }
    const card = p.hand.find(c => (cardDef(state, c) || {}).effect === 'stopIt');
    if (step.answer === 'stopit' && card) {
        removeCardFromGame(state, p, card);
        log(state, pname(p) + ' играет «Прекратите это!»: эффекты атаки «' + ATTACK_BY_ID[step.cardId].name + '» отменены.', 'good');
        next(state, step.then || { op: 'turn.choose' });
        return;
    }
    next(state, { ...step, op: 'attack.armor', revealed: true, answer: 'no', stopAsked: true });
};
OPS['attack.duckPick'] = (state, step) => next(state, { ...step, op: 'attack', player: Number(step.answer), redirected: true, answer: undefined });
OPS['attack.deactPass'] = (state, step) => {
    const p = player(state, step.player);
    if (step.answer === 'yes') { p.passed = true; p.noAttacks = true; log(state, pname(p) + ' пасует: до конца раунда атак не получает.', 'good'); }
};

OPS['attack.strafeShoot'] = (state, step) => {
    if (step.answer === 'yes' && state.intruders[step.intruder]) next(state, { op: 'shoot.start', player: step.player, forcedTarget: step.intruder, then: { op: 'noop' } });
};
function resolveAttack(state, step, it, p) {
    if (!state.attackDeck.length) { state.attackDeck = shuffle(state, state.attackDiscard.splice(0)); log(state, 'Колода атак перемешана.', 'minor'); }
    const cardId = state.attackDeck.shift();
    state.attackDiscard.push(cardId);
    const card = ATTACK_BY_ID[cardId];
    fx(state, { type: 'attack', card: cardId, name: card.name, intruder: it.type, player: p.id });
    let effects = card[it.type];
    if (typeof effects === 'string') effects = card[effects];
    log(state, '⚔ ' + intruderLabel(state, it) + ' атакует ' + pname(p) + ': «' + card.name + '».', 'combat');
    // Stop It! is printed "After revealing an Attack card".
    const stopIt = p.hand.find(c => (cardDef(state, c) || {}).effect === 'stopIt');
    if (stopIt && !step.stopAsked) {
        ask(state, { kind: 'choice', player: p.id, title: 'Раскрыта карта атаки «' + card.name + '». Сыграть «Прекратите это!» и проигнорировать эффекты?',
            options: [{ id: 'stopit', label: 'Да, «Прекратите это!»' }, { id: 'no', label: 'Нет' }] },
            { ...step, op: 'attack.stopIt', cardId, stopAsked: true });
        return;
    }
    // Deactivation is printed "after revealing an Attack card".
    if (!step.revealed) {
        const deact = p.hand.find(c => (cardDef(state, c) || {}).effect === 'deactivation');
        if (deact) {
            ask(state, { kind: 'choice', player: p.id, title: 'Раскрыта карта атаки «' + card.name + '». Сыграть «Деактивацию» (проигнорировать атаку' + (state.phase === 'player' ? ', можно спасовать' : '') + ')?',
                options: [{ id: 'deact', label: 'Да' }, { id: 'no', label: 'Нет' }] },
                { ...step, op: 'attack.deactShown', cardId, revealed: true });
            return;
        }
    }
    if (it.type === 'adult' && p.armor && ITEMS[p.armor.item].deck !== 'support' && !effects.some(e => e.op === 'miss')) {
        ask(state, { kind: 'choice', player: p.id, title: 'Атака взрослого: «' + card.name + '». Сбросить броню и проигнорировать атаку?',
            options: [{ id: 'yes', label: 'Да, сбросить броню' }, { id: 'no', label: 'Нет, принять атаку' }] },
            { op: 'attack.armor', player: p.id, intruder: it.uid, phantom: it.uid === '_phantom' ? it : undefined, cardId, moving: step.moving, dest: step.dest, context: step.context, ravenous: step.ravenous });
        return;
    }
    applyAttackEffects(state, effects, it, p, step);
}
OPS['attack.armor'] = (state, step) => {
    const p = player(state, step.player), it = step.phantom || state.intruders[step.intruder];
    if (!it || !ATTACK_BY_ID[step.cardId]) { next(state, { op: 'noop' }); return; }
    if (step.answer === 'yes') { p.armor = null; log(state, pname(p) + ' сбрасывает броню: атака проигнорирована.', 'good'); return; }
    const card = ATTACK_BY_ID[step.cardId];
    let effects = card[it.type]; if (typeof effects === 'string') effects = card[effects];
    applyAttackEffects(state, effects, it, p, step);
};

/** Would this attack card kill `p` outright? Used for the Sentinel "Laika dies instead" reaction. */
function lethalEffect(state, effects, p) {
    const hs = healthState(p);
    let hp = p.health;
    for (const e of effects) {
        switch (e.op) {
            case 'dmg': hp -= e.n + (hasAdapt(state, 'razorAppendages') ? 1 : 0); if (hp < 0) return true; break;
            case 'dieIf': if (e.state === 'heavy' ? hs === 'heavy' : (hs === 'injured' || hs === 'heavy')) return true; break;
            case 'if': if (lethalEffect(state, (e.state === 'injured' ? hs === 'injured' : hs === e.state) ? e.then : e.else, p)) return true; break;
            case 'furyRoom': if (hs === 'heavy') return true; break;
            case 'wound': if (p.wounds.length + e.n > 3) return true; break;
        }
    }
    return false;
}
function applyAttackEffects(state, effects, it, p, step, nested) {
    if (!nested) {
        // Sentinel (Bounty Hunter): when the revealed attack card would kill you, Laika dies instead.
        const sentinel = p.hand.find(c => (cardDef(state, c) || {}).effect === 'sentinel');
        if (sentinel && p.laika && !step.noSentinel && lethalEffect(state, effects, p)) {
            ask(state, { kind: 'choice', player: p.id, title: 'Эта атака убьёт вас. Сыграть «Страж» — пожертвовать Лайкой, чтобы проигнорировать атаку?', options: [{ id: 'yes', label: 'Да, Лайка спасает меня' }, { id: 'no', label: 'Нет' }] },
                { op: 'attack.sentinelLethal', player: p.id, card: sentinel, intruder: it.uid, phantom: it.uid === '_phantom' ? it : undefined, effects, moving: step.moving, dest: step.dest, context: step.context });
            return;
        }
        step._hp = p.health; step._w = p.wounds.length; step._contam = state.contamSeq;
    }
    for (const e of effects) {
        if (p.status !== 'active') return;
        const hs = healthState(p);
        switch (e.op) {
            case 'dmg': loseHealth(state, p, e.n + (hasAdapt(state, 'razorAppendages') ? 1 : 0), 'атака'); break;
            case 'wound': gainWound(state, p, e.n); break;
            case 'contam': gainContamination(state, p, 1); break;
            case 'dieIf': {
                const cond = e.state === 'heavy' ? hs === 'heavy' : (hs === 'injured' || hs === 'heavy');
                if (cond) { killPlayer(state, p, 'смертельная атака'); return; }
                break;
            }
            case 'if': {
                const cond = e.state === 'injured' ? hs === 'injured' : hs === e.state;
                applyAttackEffects(state, cond ? e.then : e.else, it, p, step, true);
                break;
            }
            case 'followIfMoving':
                if (step.moving && step.dest) next(state, { op: 'attack.follow', intruder: it.uid, player: p.id, dest: step.dest });
                break;
            case 'furyRoom':
                for (const o of playersInRoom(state, it.room)) {
                    if (healthState(o) === 'heavy') killPlayer(state, o, 'ярость чужого');
                    else if (o.id !== p.id) gainWound(state, o, 1);
                }
                if (p.status === 'active') gainWound(state, p, 1);
                break;
            case 'larva':
                if (!p.larva) { p.larva = true; log(state, pname(p) + ' заражён личинкой!', 'bad'); }
                break;
            case 'miss':
                log(state, 'Промах! Колода атак перемешивается.', 'good');
                state.attackDeck.push(...state.attackDiscard.splice(0));
                shuffle(state, state.attackDeck);
                break;
        }
    }
    if (nested) return;
    const miss = effects.some(e => e.op === 'miss');
    // Venomous: every non-miss attack contaminates if it did not already
    if (!miss && hasAdapt(state, 'venomous') && p.status === 'active' && state.contamSeq === step._contam) {
        log(state, '🧬 Ядовитость: атака даёт заражение.', 'bad');
        gainContamination(state, p, 1);
    }
    // Ravenous: in the Intruder-phase attack step an adult/drone that drew blood attacks again
    if (hasAdapt(state, 'ravenous') && step.context === 'phase' && !step.ravenous && (it.type === 'adult' || it.type === 'drone') && p.status === 'active'
        && (p.health < step._hp || p.wounds.length > step._w) && state.intruders[it.uid]) {
        log(state, '🧬 Ненасытность: ' + INTRUDER_NAMES[it.type] + ' атакует ещё раз!', 'combat');
        next(state, { op: 'attack', intruder: it.uid, player: p.id, context: 'phase', ravenous: true });
    }
}
OPS['attack.sentinelLethal'] = (state, step) => {
    const p = player(state, step.player), it = step.phantom || state.intruders[step.intruder];
    if (step.answer === 'yes' && p.hand.includes(step.card)) {
        discardCard(state, p, step.card);
        p.items = p.items.filter(i => i.item !== 'laika'); p.laika = null;
        log(state, '🐕 ' + pname(p) + ' играет «Страж»: Лайка погибает, спасая хозяина — атака проигнорирована.', 'good');
        return;
    }
    if (!it) return;
    applyAttackEffects(state, step.effects, it, p, { ...step, noSentinel: true });
};
/** Attack from an intruder that is not on the board (Survivor's Vents): draws and applies an attack card of the given type. */
export function phantomAttack(state, p, type) {
    resolveAttack(state, { noReaction: true }, { uid: '_phantom', type, room: p.room, hits: 0 }, p);
}
OPS['shoot.critDiscard'] = (state, step) => { const p = player(state, step.player); if (!p.hand.length) { next(state, step.then); return; } ask(state, { kind: 'cards', player: p.id, title: 'Пистолет ксенобиолога: КРИТ — сбросьте 1 карту', cards: [...p.hand], min: 1, max: 1 }, { op: 'card.discardPicked', player: p.id, then: step.then }); };
OPS['attack.follow'] = (state, step) => {
    const it = state.intruders[step.intruder], p = player(state, step.player);
    if (!it || p.status !== 'active') return;
    // The move itself resolves later in the queue; follow once the character is really there.
    (state.followers = state.followers || []).push({ uid: step.intruder, player: p.id, dest: step.dest });
};

// ---------------------------------------------------------------------------------------------
// Shooting
// ---------------------------------------------------------------------------------------------
OPS['shoot.start'] = (state, step) => {
    const p = player(state, step.player);
    const weapons = p.items.filter(i => canFire(p, i) && (!step.onlyItem || i.item === step.onlyItem));
    if (!weapons.length) { log(state, 'Нет заряженного оружия.', 'bad'); next(state, step.then || { op: 'turn.choose' }); return; }
    if (weapons.length === 1) { next(state, { ...step, op: 'shoot.mode', weapon: weapons[0].uid }); return; }
    ask(state, { kind: 'choice', player: p.id, title: 'Каким оружием стрелять?', options: weapons.map(w => ({ id: w.uid, label: ITEMS[w.item].name + (ITEMS[w.item].weapon.noAmmo ? '' : ' (патронов ' + w.ammo + ')') })) },
        { ...step, op: 'shoot.weaponChosen' });
};
OPS['shoot.weaponChosen'] = (state, step) => next(state, { ...step, op: 'shoot.mode', weapon: step.answer, answer: undefined });
/** Belt ammo (Autoloader Belt) counts for every weapon. */
export function beltAmmo(p) { return p.armor && ITEMS[p.armor.item].ammoMax ? p.armor.ammo : 0; }
export function canFire(p, i) {
    const d = ITEMS[i.item];
    if (d.quest && !i.active) return false;
    return !!d.weapon && !i.broken && (d.weapon.noAmmo || i.ammo > 0 || beltAmmo(p) > 0);
}
function spendAmmo(p, w, n = 1) {
    for (let k = 0; k < n; k++) { if (w.ammo > 0) w.ammo--; else if (beltAmmo(p) > 0) p.armor.ammo--; }
}
/** Weapon-specific firing modes (Gatling/SMG boost, Riotgun repel, Grenade Launcher blast). */
OPS['shoot.mode'] = (state, step) => {
    const p = player(state, step.player);
    const w = p.items.find(i => i.uid === step.weapon);
    const wd = w ? ITEMS[w.item].weapon : null;
    if (!wd || step.mode) { next(state, { ...step, op: 'shoot.target' }); return; }
    const ammo = w.ammo + beltAmmo(p);
    const opts = wd.grenadeOnly ? [] : [{ id: 'normal', label: 'Обычный выстрел' }];
    if (wd.boost && ammo >= 1 + wd.boost.ammo) opts.push({ id: 'boost', label: 'Усиленный: +' + wd.boost.hits + ' ранения (ещё ' + wd.boost.ammo + ' патр.)' });
    if (wd.repelMode && ammo >= 2 && intrudersIn(state, p.room).some(i => i.type === 'adult')) opts.push({ id: 'repel', label: 'Отогнать взрослого (2 патрона)' });
    if (wd.grenadeMode) opts.push({ id: 'grenade', label: 'Гранатный выстрел по комнате' });
    if (opts.length === 1) { next(state, { ...step, op: 'shoot.target', mode: 'normal' }); return; }
    ask(state, { kind: 'choice', player: p.id, title: '«' + ITEMS[w.item].name + '»: режим стрельбы', options: opts }, { ...step, op: 'shoot.modeChosen' });
};
OPS['shoot.modeChosen'] = (state, step) => {
    const p = player(state, step.player);
    const w = p.items.find(i => i.uid === step.weapon);
    const then = step.then || { op: 'turn.choose' };
    const mode = step.answer;
    if (mode === 'repel') {
        const it = intrudersIn(state, p.room).find(i => i.type === 'adult');
        spendAmmo(p, w, 2);
        log(state, pname(p) + ' отгоняет взрослого выстрелом из «' + ITEMS[w.item].name + '».', 'combat');
        if (it && repelIntruder(state, it)) next(state, { op: 'noise.roll', player: p.id, room: it.room }, then); else next(state, then);
        return;
    }
    if (mode === 'grenade') {
        const rooms = [p.room, ...state.ship.rooms[p.room].exits.filter(e => state.ship.corridors[e.corridor].door !== 'closed').map(e => e.to)];
        ask(state, { kind: 'room', player: p.id, title: 'Гранатомёт: по какой комнате?', rooms }, { op: 'shoot.grenade', player: p.id, weapon: w.uid, then });
        return;
    }
    const extra = mode === 'boost' ? ITEMS[w.item].weapon.boost : null;
    if (extra) spendAmmo(p, w, extra.ammo);
    next(state, { ...step, op: 'shoot.target', mode, bonusHits: (step.bonusHits || 0) + (extra ? extra.hits : 0), answer: undefined });
};
OPS['shoot.grenade'] = (state, step) => {
    const p = player(state, step.player);
    const w = p.items.find(i => i.uid === step.weapon);
    const r = step.answer;
    spendAmmo(p, w, 1);
    log(state, '💥 ' + pname(p) + ' стреляет из гранатомёта по ' + roomName(state, r) + '!', 'combat');
    for (const e of state.ship.rooms[r].exits) { const c = state.ship.corridors[e.corridor]; if (c.door !== 'destroyed') c.door = 'destroyed'; }
    for (const it of intrudersIn(state, r)) if (state.intruders[it.uid]) {
        if (it.type === 'queen') next(state, { op: 'queen.card', player: p.id });
        else removeIntruder(state, it.uid, true);
        log(state, INTRUDER_NAMES[it.type] + ': КРИТ от гранатомёта.', 'combat');
    }
    for (const o of playersInRoom(state, r)) gainWound(state, o, 1);
    next(state, step.then);
};
OPS['shoot.target'] = (state, step) => {
    const p = player(state, step.player);
    const w = p.items.find(i => i.uid === step.weapon);
    const sniper = w && ITEMS[w.item].weapon.sniper;
    let targets = intrudersIn(state, p.room);
    if (sniper) for (const e of state.ship.rooms[p.room].exits) if (state.ship.corridors[e.corridor].door !== 'closed') targets = targets.concat(intrudersIn(state, e.to));
    if (step.forcedTarget) targets = targets.filter(t => t.uid === step.forcedTarget);
    if (!targets.length) { log(state, 'Чужих в комнате нет.', 'bad'); next(state, step.then || { op: 'turn.choose' }); return; }
    if (targets.length === 1) { next(state, { ...step, op: 'shoot.fire', target: targets[0].uid }); return; }
    ask(state, { kind: 'choice', player: p.id, title: 'В кого стрелять?', options: targets.map(t => ({ id: t.uid, label: intruderLabel(state, t) + (t.room !== p.room ? ' (' + roomName(state, t.room) + ', +1 ранение)' : '') })) },
        { ...step, op: 'shoot.targetChosen' });
};
OPS['shoot.targetChosen'] = (state, step) => next(state, { ...step, op: 'shoot.fire', target: step.answer, answer: undefined });
OPS['shoot.fire'] = (state, step) => {
    const p = player(state, step.player);
    const w = p.items.find(i => i.uid === step.weapon);
    const it = state.intruders[step.target];
    const then = step.then || { op: 'turn.choose' };
    if (!w || !it || !canFire(p, w)) { next(state, then); return; }
    if (it.type !== 'larva' && needDice(state, step, 'combat', p.id, 'Бросок боя — выстрел')) return;
    state.shotSeq = (state.shotSeq || 0) + 1;
    state.lastShot = { n: state.shotSeq, player: p.id, target: it.uid, room: it.room };
    const def = ITEMS[w.item], wd = def.weapon;
    if (!wd.noAmmo) spendAmmo(p, w, 1);
    let hits = 1 + (step.bonusHits || 0) + (wd.bonusHit || 0) + (it.room !== p.room ? 1 : 0);
    if (wd.firstShotBonus && !p.firstShotUsed) { hits++; p.firstShotUsed = true; }
    let mod = (wd.plusOne ? 1 : 0) - (wd.minusOne ? 1 : 0) + (p.wounds.includes('eyes') ? 1 : 0) + (step.rollBonus || 0);
    log(state, '🔫 ' + pname(p) + ' стреляет из «' + def.name + '» в ' + intruderLabel(state, it) + ' (патронов осталось ' + w.ammo + ').', 'combat');
    dealHits(state, p, it, hits, mod, { weapon: w, retaliate: false, bestOfTwo: step.bestOfTwo, then });
    if (state.prompt) return;   // the reroll decision owns the continuation
    const rolled = state.lastRoll && state.lastRoll.die === 'combat' ? state.lastRoll.value : null;
    const natural = state.lastNatural;
    if (wd.fire) placeFire(state, p.room, 'огнемёт');
    if (wd.fireOn && wd.fireOn.includes(rolled)) placeFire(state, p.room, 'огнемёт');
    if (wd.malfOn && wd.malfOn.includes(natural)) placeMalfunction(state, p.room, 'звуковая пушка');
    if (w.item === 'energyPistol' && (natural === 'crit' || natural === 2 || natural === 6)) spendUPS(state, p);
    if (wd.plasma && [2, 6].includes(rolled)) { const m = w.charge || 0; if (m) loseHealth(state, p, 2 * m, 'перегрев плазмы'); w.charge = m + 1; log(state, 'Плазменная пушка перегревается: жетонов ' + w.charge + '.', 'bad'); }
    if (wd.spread) for (const o of intrudersIn(state, p.room)) if (o.uid !== it.uid && state.intruders[o.uid]) applyHitsNoRoll(state, o, 1);
    if (step.repeat && state.intruders[it.uid] === undefined && w.ammo > 0 && intrudersIn(state, p.room).length) { next(state, { ...step, op: 'shoot.target', answer: undefined }); return; }
    if (step.repeat && state.intruders[it.uid] !== undefined && w.ammo > 0) { next(state, { ...step, op: 'shoot.fire' }); return; }
    if (wd.critDiscard && state.lastRoll && state.lastRoll.value === 'crit' && p.hand.length) { next(state, { op: 'shoot.critDiscard', player: p.id, then }); return; }
    next(state, then);
};

/** Intruder Adaptations that alter the natural combat roll: Agile (2 / icon → 6), Hardened Carapace (2–6 → +1). */
function adaptRoll(state, r) {
    if (hasAdapt(state, 'agile') && (r === 'crit' || r === 2)) { log(state, '🧬 Проворство: результат «' + fmtRoll(r) + '» считается «6».', 'combat'); r = 6; }
    if (hasAdapt(state, 'hardenedCarapace') && typeof r === 'number') { log(state, '🧬 Прочный панцирь: ' + r + ' → ' + (r + 1) + '.', 'combat'); r = r + 1; }
    return r;
}
/** Deal `hits` to an intruder, then the kill-check roll. */
export function dealHits(state, p, it, hits, mod, opts = {}) {
    const wd0 = opts.weapon ? ITEMS[opts.weapon.item].weapon : null;
    if (it.type === 'larva') {
        if (!(wd0 && wd0.instantVs && wd0.instantVs.includes('larva'))) {
            log(state, 'Личинка погибает.', 'good'); removeIntruder(state, it.uid, false); return true;
        }
        log(state, 'Медицинский пистолет: личинка уничтожена выстрелом.', 'good'); removeIntruder(state, it.uid, false); return true;
    }
    if (it.type === 'queen') return queenHits(state, p, it, hits, mod, opts);
    it.hits += hits;
    const wd = opts.weapon ? ITEMS[opts.weapon.item].weapon : {};
    let r = roll(state, COMBAT_DIE);
    const natural = r;
    if (opts.bestOfTwo) {
        const r2 = roll(state, COMBAT_DIE);
        const score = v => v === 'crit' ? -100 : v;
        log(state, '🎲 Точный выстрел: два броска — ' + fmtRoll(r) + ' и ' + fmtRoll(r2) + '.', 'combat');
        if (score(r2) < score(r)) r = r2;
    }
    const naturalCrit = (!!wd.critOn2 && natural === 2) || (!!wd.critOn6 && natural === 6);
    r = adaptRoll(state, r);
    if (naturalCrit) { r = 'crit'; log(state, 'Штурмовая винтовка: естественная «2» — КРИТ (даже если результат изменён).', 'combat'); }
    if (wd.plusOn5 && natural === 5) { it.hits++; log(state, 'BF-пушка: естественная «5» — дополнительное ранение.', 'combat'); }
    let val = r === 'crit' ? 'crit' : r + mod;
    log(state, '🎲 Бой: ' + fmtRoll(r) + (mod ? ' +' + mod + ' = ' + val : '') + ' против ранений ' + it.hits + '.', 'combat');
    if (wd.rerollChoice && !opts.rerolled && p.status === 'active' && opts.weapon) {
        ask(state, { kind: 'choice', player: p.id, title: 'Перебросить кубик? Второй результат окончателен.', options: [{ id: 'reroll', label: 'Перебросить' }, { id: 'keep', label: 'Оставить' }] },
            { op: 'shoot.rerollAsk', player: p.id, intruder: it.uid, weapon: opts.weapon.uid, hits, mod, first: val, then: opts.then });
        return false;
    }
    if (val === 'crit' || val <= it.hits) {
        log(state, '✔ ' + INTRUDER_NAMES[it.type] + ' убит!', 'good');
        removeIntruder(state, it.uid, true);
        onKill(state, p, opts);
        return true;
    }
    log(state, INTRUDER_NAMES[it.type] + ' выживает (ранений ' + it.hits + ').', 'combat');
    if (opts.retaliate) next(state, { op: 'attack', intruder: it.uid, player: p.id, context: 'retaliation' });
    return false;
}
export function applyHitsNoRoll(state, it, n) {
    if (it.type === 'larva') { removeIntruder(state, it.uid, false); log(state, 'Личинка погибает.', 'good'); return; }
    if (it.type === 'queen') { state.queenHits += n; log(state, 'Королева получает ' + n + ' ранений (всего ' + state.queenHits + ').', 'combat'); if (state.queenHits >= 6) next(state, { op: 'queen.card', player: null }); return; }
    it.hits += n;
    log(state, INTRUDER_NAMES[it.type] + ' получает ' + n + ' ранений (всего ' + it.hits + ').', 'combat');
}
function onKill(state, p, opts) {
    if (opts.weapon && ITEMS[opts.weapon.item].weapon.drawOnKill && !p.rifleDrawUsed) { p.rifleDrawUsed = true; drawCards(state, p, 1); }
}

const logs_crit6 = (state, wd, natural) => { if (wd && wd.critOn6 && natural === 6) log(state, 'Результат «6» — КРИТ.', 'combat'); };
function queenHits(state, p, it, hits, mod, opts = {}) {
    state.queenHits += hits;
    const wd = opts.weapon ? ITEMS[opts.weapon.item].weapon : {};
    const natural = roll(state, COMBAT_DIE);
    logs_crit6(state, wd, natural);
    const naturalCrit = !!wd.critOn2 && natural === 2;
    const r = adaptRoll(state, natural);
    const val = r === 'crit' ? 'crit' : r + mod;
    log(state, '🎲 Бой с Королевой: ' + fmtRoll(r) + (mod ? ' +' + mod : '') + ', ранений на треке ' + state.queenHits + '.', 'combat');
    if (naturalCrit || val === 'crit' || val <= state.queenHits || state.queenHits >= 6) next(state, { op: 'queen.card', player: p.id, natural2: naturalCrit });
    else log(state, 'Королева держится.', 'combat');
    return false;
}
OPS['queen.card'] = (state, step) => {
    if (!state.queenDeck.length) return;
    const idx = state.queenDeck.shift();
    const card = QUEEN_CARDS[idx];
    const byChar = step.player != null;
    fx(state, { type: 'queen', card: card.id, name: card.name, text: card.text });
    log(state, '👑 Карта здоровья Королевы: «' + card.name + '» — ' + card.text, 'combat');
    if (card.extra) state.queenDeck.splice(0, card.extra);
    state.queenHits = 0;
    const q = Object.values(state.intruders).find(i => i.type === 'queen');
    const dead = !state.queenDeck.length;
    if (dead) { state.queenDead = true; log(state, '👑 КОРОЛЕВА МЕРТВА!', 'good'); }
    else log(state, 'Карт здоровья Королевы осталось: ' + state.queenDeck.length + '.', 'combat');
    // 11.3: the card's effect is resolved even if discarding the extra cards kills the Queen.
    if (q && (byChar || !card.byChar)) {
        const ps = playersInRoom(state, q.room);
        switch (card.effect) {
            case 'pool': removeIntruder(state, q.uid, false); log(state, 'Королева возвращается в запас.', 'good'); break;
            case 'draw2': for (const x of ps) drawCards(state, x, 2); break;
            case 'repel': repelIntruder(state, q, null, true); break;
            case 'noise': next(state, ...ps.map(x => ({ op: 'noise.roll', player: x.id, room: x.room }))); break;
            case 'malf': placeMalfunction(state, q.room, 'Королева'); break;
            case 'bag': { let k = 0; for (let i = 0; i < 3; i++) if (countAvailable(state, 'queen') > 0) { state.bag.push('queen'); k++; } log(state, 'В мешок добавлено жетонов Королевы: ' + k + '.', 'event'); break; }
            case 'activate':
                if (ps.length) next(state, { op: 'attack', intruder: q.uid, player: byChar && ps.some(x => x.id === step.player) ? step.player : undefined, context: 'queen' });
                else if (moveOneToward(state, q, state.players.filter(x => x.status === 'active' && !x.pod))) { const h = hyperAttackStep(state, q); if (h) next(state, h); }
                break;
        }
    }
    if (dead && state.intruders[q && q.uid]) removeIntruder(state, q.uid, true);
};

// Retaliation for the Queen when the player only "skipped" — handled through the generic attack op.
// ---------------------------------------------------------------------------------------------
// Melee
// ---------------------------------------------------------------------------------------------
OPS['melee.start'] = (state, step) => {
    const p = player(state, step.player);
    const targets = intrudersIn(state, p.room);
    if (!targets.length) { next(state, step.then || { op: 'turn.choose' }); return; }
    if (targets.length === 1) { next(state, { ...step, op: 'melee.hit', target: targets[0].uid }); return; }
    ask(state, { kind: 'choice', player: p.id, title: 'Кого атаковать в ближнем бою?', options: targets.map(t => ({ id: t.uid, label: intruderLabel(state, t) })) },
        { ...step, op: 'melee.targetChosen' });
};
OPS['melee.targetChosen'] = (state, step) => next(state, { ...step, op: 'melee.hit', target: step.answer, answer: undefined });
OPS['melee.hit'] = (state, step) => {
    const p = player(state, step.player);
    const it = state.intruders[step.target];
    const then = step.then || { op: 'turn.choose' };
    if (!it) { next(state, then); return; }
    const hatchet = p.items.find(i => ITEMS[i.item].hatchet && !i.broken);
    if (it.type !== 'larva' && !hatchet && needDice(state, step, 'combat', p.id, 'Бросок боя — ближний бой')) return;
    if (!step.noContam) gainContamination(state, p, 1);
    log(state, '🗡 ' + pname(p) + ' атакует ' + intruderLabel(state, it) + ' в ближнем бою.', 'combat');
    if (hatchet) {
        hatchet.charge = 1; hatchet.broken = true;
        log(state, 'Тактический топорик: 2 ранения вместо броска, оранжевая поломка на оружии.', 'combat');
        if (it.type === 'queen') { next(state, { op: 'queen.card', player: p.id }, then); return; }
        dealHits(state, p, it, 2, 0, { retaliate: false });
        if (state.intruders[it.uid] && !step.noRetaliation) { next(state, { op: 'attack', intruder: it.uid, player: p.id, context: 'retaliation' }, then); return; }
        next(state, then); return;
    }
    const survived = !dealHits(state, p, it, 1 + (step.bonusHits || 0), 0, { retaliate: false, then });
    if (survived && state.intruders[it.uid] && !state.prompt && !step.noRetaliation) {
        const weapons = p.items.filter(i => ITEMS[i.item].weapon);
        if (weapons.length) {
            ask(state, { kind: 'choice', player: p.id, title: 'Чужой выжил и отвечает атакой. Подставить оружие (оранжевая поломка; уже сломанное — сбрасывается), чтобы избежать атаки?',
                options: [{ id: 'none', label: 'Принять атаку' }, ...weapons.map(w => ({ id: w.uid, label: (w.broken ? 'Сбросить «' : 'Сломать «') + ITEMS[w.item].name + '»' }))] },
                { op: 'melee.block', player: p.id, target: it.uid, then });
            return;
        }
        next(state, { op: 'attack', intruder: it.uid, player: p.id, context: 'retaliation' }, then);
        return;
    }
    next(state, then);
};
OPS['melee.block'] = (state, step) => {
    const p = player(state, step.player);
    if (step.answer === 'none') { next(state, { op: 'attack', intruder: step.target, player: p.id, context: 'retaliation' }, step.then); return; }
    const w = p.items.find(i => i.uid === step.answer);
    if (w.broken) { p.items = p.items.filter(i => i !== w); log(state, '«' + ITEMS[w.item].name + '» уже было сломано — предмет уничтожен.', 'bad'); }
    else { w.broken = true; log(state, '«' + ITEMS[w.item].name + '» получает оранжевую поломку; ответная атака предотвращена.', 'minor'); }
    next(state, step.then);
};

// ---------------------------------------------------------------------------------------------
// Pick up heavy objects
// ---------------------------------------------------------------------------------------------
OPS['pickup.start'] = (state, step) => {
    const p = player(state, step.player);
    const rs = room(state, p.room);
    const opts = rs.objects.map((o, i) => ({ id: String(i), label: ({ corpse: 'Человеческий труп', charCorpse: 'Труп персонажа', carcass: 'Туша чужого', egg: 'Яйцо чужого' })[o.type] }));
    if (!opts.length) { next(state, { op: 'turn.choose' }); return; }
    ask(state, { kind: 'choice', player: p.id, title: 'Что поднять?', options: opts }, { op: 'pickup.done', player: p.id });
};
OPS['pickup.done'] = (state, step) => {
    const p = player(state, step.player);
    const rs = room(state, p.room);
    const o = rs.objects.splice(Number(step.answer), 1)[0];
    if (o) { p.heavy.push(o); log(state, pname(p) + ' поднимает объект.', 'action'); }
    next(state, { op: 'turn.choose' });
};

// ---------------------------------------------------------------------------------------------
// Trade (give an item / heavy object to another character in the room)
// ---------------------------------------------------------------------------------------------
OPS['trade.start'] = (state, step) => {
    const p = player(state, step.player);
    const others = playersInRoom(state, p.room).filter(o => o.id !== p.id);
    const opts = [];
    for (const o of others) {
        for (const i of p.items) if (!ITEMS[i.item].quest) opts.push({ id: o.id + ':item:' + i.uid, label: ITEMS[i.item].name + ' → ' + pname(o) });
        p.heavy.forEach((h, idx) => opts.push({ id: o.id + ':heavy:' + idx, label: ({ corpse: 'Труп', charCorpse: 'Труп персонажа', carcass: 'Туша', egg: 'Яйцо' })[h.type] + ' → ' + pname(o) }));
    }
    if (!opts.length) { next(state, { op: 'turn.choose' }); return; }
    ask(state, { kind: 'choice', player: p.id, title: 'Что и кому передать?', options: opts }, { op: 'trade.done', player: p.id });
};
OPS['trade.done'] = (state, step) => {
    const p = player(state, step.player);
    if (step.answer === 'no') { log(state, 'Передача отклонена.', 'minor'); next(state, { op: 'turn.choose' }); return; }
    const [to, kind, key] = step.answer.split(':');
    const o = player(state, Number(to));
    const srcItem = kind === 'item' ? p.items.find(x => x.uid === key) : null;
    const srcHeavy = kind !== 'item' ? p.heavy[Number(key)] : null;
    if ((kind === 'item' && !srcItem) || (kind !== 'item' && !srcHeavy)) { next(state, { op: 'turn.choose' }); return; }
    if (o.id !== p.id && !step.consent) {
        const what = kind === 'item' ? '«' + ITEMS[srcItem.item].name + '»' : '«' + HEAVY_NAMES[srcHeavy.type] + '»';
        ask(state, { kind: 'choice', player: o.id, title: pname(p) + ' передаёт вам ' + what + '. Принять?',
            options: [{ id: 'yes', label: 'Да' }, { id: 'no', label: 'Нет' }] },
            { ...step, op: 'trade.done', consent: true });
        return;
    }
    if (kind === 'item') {
        const i = p.items.findIndex(x => x.uid === key);
        const it = p.items.splice(i, 1)[0];
        o.items.push(it);
        log(state, pname(p) + ' передаёт «' + ITEMS[it.item].name + '» → ' + pname(o) + '.', 'action');
    } else {
        const h = p.heavy.splice(Number(key), 1)[0];
        o.heavy.push(h);
        log(state, pname(p) + ' передаёт тяжёлый объект → ' + pname(o) + '.', 'action');
        if (heavyCount(o) > handLimit(o)) next(state, { op: 'wound.armCheck', player: o.id });
    }
    next(state, { op: 'turn.choose' });
};
