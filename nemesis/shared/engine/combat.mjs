import { isAdultEquivalent } from './core.mjs';
// combat.mjs — intruder attacks, shooting, melee, hits and the Queen's health deck.

import { OPS, ask, next, log, player, pname, intrudersIn, playersInRoom, room, roomName, healthState, loseHealth, gainWound,
    gainContamination, killPlayer, discardCard, COMBAT_DIE, roll, fmtRoll, needDice, fx, removeIntruder, intruderLabel, INTRUDER_RANK,
    drawCards, placeFire, placeNoise, cardDef, orderIndex, hasAdapt, hasWeak, placeMalfunction, removeCardFromGame, infectLarva, heavyCount, handLimit,
    handSlots, dropHeavy, BLUE_DIE, dieId, breakWeapon, isContam } from './core.mjs';
import { repelIntruder, moveOneToward, hyperAttackStep } from './intruders.mjs';
import { countAvailable } from './movement.mjs';
import { ATTACK_CARDS, ITEMS, dropLocked, hasOpenQuest, connectedTo, QUEEN_CARDS, INTRUDER_NAMES } from '../data/cards.mjs';
import { CARNOMORPH_ATTACK_CARDS } from '../data/carnomorphs.mjs';
import { carnomorphAttackEffects, spawnCarnomorph, killCarnomorph, hasCarnomorphAdaptation, carnPowerCheck } from './carnomorphs.mjs';
import { shuffle } from '../rng.mjs';
import { voidPowerCheck, voidAttackEffects, spawnVoid, killVoid, hasVoidWeakness } from './voidseeders.mjs';
import { VOID_ATTACK_CARDS } from '../data/voidseeders.mjs';
import { CHYTRID_ATTACK_CARDS } from '../data/chytrids.mjs';
import { hasChyWeakness, giveChySpore, placeGerminator, placeMycelium, spawnChytrid, killChytrid, damageGerminator } from './chytrids.mjs';

const ATTACK_BY_ID = Object.fromEntries([...ATTACK_CARDS, ...CARNOMORPH_ATTACK_CARDS, ...VOID_ATTACK_CARDS, ...CHYTRID_ATTACK_CARDS].map(c => [c.id, c]));
/** Printed rank names used inside the attack card texts. */
const ATTACK_RANK = { adult: 'Взрослый', drone: 'Дрон', queen: 'Королева' };
/** The part of an attack card that applies to this intruder: «−1 здоровье.» out of a card that
 *  lists all three ranks ("Взрослый: … Дрон/Королева: …"). Only the line that is being resolved now
 *  belongs on the table — the card that hits you must not read like a table of contents for the
 *  other two monsters. Cards printed without a rank split are returned whole, since every rank
 *  suffers the same thing. */
export function attackEffectText(card, type) {
    const text = String((card && card.text) || '');
    if (card && card.targets) return card.targets.includes(type) ? text : 'Атака не попала по этой цели.';
    const word = ATTACK_RANK[type];
    if (!word || !text) return text;
    // Each "rank:" or "rank/rank:" label opens a segment that runs up to the next label: splitting
    // on the labels themselves (not with a lookahead) is what makes «Дрон/Королева:» one segment
    // instead of two halves of one.
    const label = /(Взрослый|Дрон|Королева)(?:\s*\/\s*(Взрослый|Дрон|Королева))?\s*:/g;
    const segs = [];
    let m, open = null;
    while ((m = label.exec(text))) {
        if (open) segs.push({ labels: open.labels, start: open.end, end: m.index });
        open = { labels: [m[1], m[2]].filter(Boolean), end: label.lastIndex };
    }
    if (!open) return text;                      // no rank split printed: one effect for everybody
    segs.push({ labels: open.labels, start: open.end, end: text.length });
    const hit = segs.find(s => s.labels.includes(word));
    return hit ? text.slice(hit.start, hit.end).trim() : text;
}
const OBJECT_NAMES = { corpse: 'Человеческий труп', charCorpse: 'Труп персонажа', carcass: 'Туша чужого', egg: 'Яйцо чужого' };
export function objectName(o) { return OBJECT_NAMES[o && o.type] || 'объект'; }

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
    if (!it || (state.enemySet === 'voidseeders' && it.type === 'lair')) return;
    let p = step.player !== undefined ? player(state, step.player) : pickTarget(state, it.room);
    if (!p || p.status !== 'active') return;
    if (p.noAttacks) { log(state, pname(p) + ' деактивирован(а) до конца раунда — атака не происходит.', 'minor'); return; }
    if (state.enemySet === 'carnomorphs' && step.context === 'phase' && !step.mutationOffered &&
        p.mutationCard === 'mimicry' && p.hand.some(isContam)) {
        ask(state, { kind: 'choice', secret: !p.mutationRevealed, reaction: true, player: p.id,
            title: 'Использовать мутацию перед атакой?', options: [{ id: 'yes', label: 'Да' }, { id: 'no', label: 'Нет' }] },
            { op: 'mutation.offerMimicry', player: p.id, attack: { ...step, player: p.id, mutationOffered: true } });
        return;
    }
    // 12.1: the Attack card is revealed FIRST; every reaction is played "after revealing an
    // Attack card", so nothing may be decided before the card is face up.
    let cardId = step.cardId || null;
    if (it.type !== 'larva' && it.type !== 'metagorger' && !(state.enemySet === 'voidseeders' && step.context === 'surprise') && !cardId) {
        if (!state.attackDeck.length) { state.attackDeck = shuffle(state, state.attackDiscard.splice(0)); log(state, 'Колода атак перемешана.', 'minor'); }
        cardId = state.attackDeck.shift();
        state.attackDiscard.push(cardId);
        const card = ATTACK_BY_ID[cardId];
        // `effect` is what this rank suffers, `text` is the whole printed card — the card face on the
        // table shows both, so the effect is readable without digging through the chat log.
        fx(state, { type: 'attack', card: cardId, name: card.name, intruder: it.type, player: p.id,
            effect: attackEffectText(card, it.type), text: card.text });
        log(state, '⚔ ' + intruderLabel(state, it) + ' атакует ' + pname(p) + ': «' + card.name + '».', 'combat');
        next(state, { ...step, cardId });
        return;
    }
    // "Don't Panic" held by ANOTHER character in the room: that player decides first.
    if (!step.noReaction) {
        const asked = step.askedPanic || [];
        const holds = o => !asked.includes(o.id) && o.hand.some(c => (cardDef(state, c) || {}).effect === 'dontPanic');
        // Oculobe Drone (printed): Don't Panic may be played on a Character anywhere on the ship if
        // they carry a Connection token from the Psychologist.
        const remote = state.players.find(o => o.id !== p.id && o.status === 'active' && holds(o)
            && hasOpenQuest(o, 'oculobe') && connectedTo(o, p));
        const holder = playersInRoom(state, it.room).find(o => o.id !== p.id && o.status === 'active' && holds(o)) || remote;
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
    const nerves = find('preventAttack'), strafe = find('fdCircleStrafe'), panic = find('dontPanic'), deact = find('deactivation'), sentinel = find('sentinel');
    const stopIt = find('stopIt');
    const pher = findR('pheromonesReaction'), duck = findR('duckReaction');
    const opts = [];
    if (nerves) opts.push({ id: 'card', label: 'Сыграть «Стальные нервы»' });
    if (strafe) opts.push({ id: 'strafe', label: 'Сыграть «Стрейф по кругу» (предотвратить и выстрелить)' });
    if (panic) opts.push({ id: 'panic', label: 'Сыграть «Без паники» (предотвратить атаку)' });
    if (deact) opts.push({ id: 'deact', label: 'Сыграть «Деактивация» (проигнорировать атаку' + (state.phase === 'player' ? ', можно спасовать' : '') + ')' });
    if (stopIt) opts.push({ id: 'stopit', label: 'Сыграть «Stop It!»: убрать карту из игры и проигнорировать атаку' });
    if (sentinel && step.context === 'surprise' && p.laika === 'board') opts.push({ id: 'sentinel', label: 'Сыграть «Страж»: Лайка предотвращает внезапную атаку' });
    if (pher && step.context === 'surprise' && p.tissue > 0) opts.push({ id: 'pher', label: 'Сыграть «Феромоны»: сбросить 1 образец ткани — предотвратить атаку' });
    const othersHere = playersInRoom(state, it.room).filter(o => o.id !== p.id && o.status === 'active');
    if (duck && othersHere.length && !step.redirected) opts.push({ id: 'duck', label: 'Сыграть «Пригнуться»: чужой атакует другого персонажа' });
    if (isAdultEquivalent(state, it)) {
        for (const i of p.items) {
            const d = ITEMS[i.item];
            if (d.preventAttack === 'allAmmo' && i.ammo > 0 && !i.broken) opts.push({ id: 'item:' + i.uid, label: '«' + d.name + '»: сбросить все патроны (' + i.ammo + ') — 1 ранение чужому' });
            if (d.preventAttack === 'marker' && !i.broken) opts.push({ id: 'item:' + i.uid, label: '«' + d.name + '»: положить поломку' });
        }
    }
    // Heavy Armor (printed): an Intruder's attack can be prevented for 1 Health.
    if (p.armor && ITEMS[p.armor.item].adultGuard)
        opts.push({ id: 'armorGuard', label: '«' + ITEMS[p.armor.item].name + '»: предотвратить атаку и потерять 1 здоровье' });
    // Bloody Camouflage (printed): the attack hits another Character in the Room instead.
    if (p.armor && ITEMS[p.armor.item].redirectAttack && othersHere.length && !step.redirected)
        opts.push({ id: 'armorRedirect', label: '«' + ITEMS[p.armor.item].name + '»: атака переходит на другого персонажа' });
    if (opts.length && !step.noReaction) {
        opts.push({ id: 'no', label: 'Принять атаку' });
        ask(state, { kind: 'choice', reaction: true, player: p.id, title: intruderLabel(state, it) + ' атакует вас. Предотвратить?', options: opts },
            { ...step, op: 'attack.reaction', player: p.id, card: nerves, strafe, panic, deact, sentinel, pher, duck, stopIt });
        return;
    }
    if (state.enemySet === 'voidseeders' && step.context === 'surprise') { next(state, { op: 'void.surprise', player: p.id }); return; }
    if (state.enemySet === 'carnomorphs' && it.type === 'metagorger') {
        next(state, { op: 'carnomorph.metagorgerAttack', player: p.id, intruder: it.uid }); return;
    }
    if (it.type === 'larva') {
        log(state, 'Личинка атакует ' + pname(p) + '.', 'combat');
        gainContamination(state, p, 1);
        infectLarva(state, p);
        removeIntruder(state, it.uid, false);
        return;
    }
    resolveAttack(state, step, it, p);
};
OPS['attack.panic'] = (state, step) => {
    const h = player(state, step.holder);
    if (step.answer === 'yes' && h.hand.includes(step.card)) {
        discardCard(state, h, step.card);
        const t = player(state, step.target);
        if (h.id !== t.id && hasOpenQuest(h, 'oculobe')) {
            t.connections = t.connections || [];
            if (!t.connections.includes(h.id)) { t.connections.push(h.id); log(state, pname(t) + ' получает жетон связи от дрона «Окулоб».', 'minor'); }
        }
        log(state, pname(h) + ' играет «Без паники»: атака на ' + pname(t) + ' предотвращена.', 'good');
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
    if (step.answer === 'stopit' && step.stopIt) {
        removeCardFromGame(state, p, step.stopIt);
        log(state, pname(p) + ' играет «Stop It!»: карта убрана из игры, атака проигнорирована.', 'good');
        return;
    }
    if (step.answer === 'pher' && step.pher) { p.tissue--; play(step.pher, '«Феромоны» (−1 образец ткани): внезапная атака предотвращена.'); return; }
    if (step.answer === 'deact' && step.deact) {
        play(step.deact, '«Деактивация»: атака проигнорирована.');
        if (state.phase === 'player') ask(state, { kind: 'choice', player: p.id, title: 'Деактивация: спасовать? (до конца раунда вас больше не атакуют)', options: [{ id: 'yes', label: 'Да, спасовать' }, { id: 'no', label: 'Нет' }] }, { op: 'attack.deactPass', player: p.id });
        return;
    }
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
    if (step.answer === 'armorGuard') {
        loseHealth(state, p, 1, 'тяжёлая броня');
        log(state, pname(p) + ': тяжёлая броня предотвратила атаку.', 'good');
        return;
    }
    if (step.answer === 'armorRedirect') {
        const others = playersInRoom(state, it ? it.room : p.room).filter(o => o.id !== p.id && o.status === 'active');
        log(state, pname(p) + ': кровавый камуфляж — чужой атакует другого персонажа.', 'minor');
        if (others.length === 1) { next(state, { ...step, op: 'attack', player: others[0].id, redirected: true, answer: undefined }); return; }
        ask(state, { kind: 'choice', player: p.id, title: 'Кого атакует чужой вместо вас?', options: others.map(o => ({ id: String(o.id), label: pname(o) })) }, { ...step, op: 'attack.duckPick' });
        return;
    }
    if (String(step.answer).startsWith('item:')) {
        const i = p.items.find(x => x.uid === step.answer.slice(5));
        if (i && ITEMS[i.item].preventAttack === 'allAmmo') { i.ammo = 0; if (it) applyHitsNoRoll(state, it, 1); }
        else if (i) i.broken = true;
        log(state, pname(p) + ': «' + ITEMS[i.item].name + '» — атака предотвращена.', 'good');
        return;
    }
    next(state, { ...step, op: 'attack', noReaction: true, answer: undefined });
};
OPS['attack.duckPick'] = (state, step) => next(state, { ...step, op: 'attack', player: Number(step.answer), redirected: true, answer: undefined });
OPS['attack.deactPass'] = (state, step) => {
    const p = player(state, step.player);
    if (step.answer === 'yes') { p.passed = true; p.noAttacks = true; log(state, pname(p) + ' пасует: до конца раунда атак не получает.', 'good'); }
};

OPS['attack.strafeShoot'] = (state, step) => {
    if (step.answer === 'yes' && state.intruders[step.intruder]) next(state, { op: 'shoot.start', player: step.player, forcedTarget: step.intruder, then: { op: 'noop' } });
};
/** Attack-card effects for this intruder's rank, with the Attack Habits weakness applied:
 *  an Adult's Bite («Трутень» on the printed card) gives a Light Injury (−1 health here)
 *  instead of a Serious Wound. */

export function chytridAttackEffects(card, it, p) {
    if (!card.targets.includes(it.type)) return [{ op: 'chyMiss' }];
    switch (card.effect) {
        case 'infection': return [{ op: 'chyInfection' }];
        case 'blow': return [p.wounds.length >= 2 ? { op: 'chyKill' } : { op: 'wound', n: 1 }];
        case 'cut': return [{ op: 'dmg', n: 1 }, { op: 'contam' }];
        case 'charge': return [{ op: 'dmg', n: 2 }];
        case 'smallGrowth': return [{ op: 'chyGrowth' }];
        case 'entangle': return [{ op: 'chyEntangle' }];
        case 'pseudopod': return [{ op: 'chyPseudopod' }];
        case 'spikes': return [{ op: 'chySpikes' }];
        default: throw new Error('Invalid Chytrid attack effect');
    }
}

function attackEffectsFor(state, card, it, p) {
    if (state.enemySet === 'carnomorphs' && card.id.startsWith('carnoAttack')) return carnomorphAttackEffects(card, it, p);
    if (state.enemySet === 'voidseeders' && card.id.startsWith('voidAttack')) return voidAttackEffects(card, it, p);
    if (state.enemySet === 'chytrids' && card.id.startsWith('chyAttack')) return chytridAttackEffects(card, it, p);
    let effects = card[it.type];
    if (typeof effects === 'string') effects = card[effects];
    if (card.id === 'bite' && it.type === 'adult' && hasWeak(state, 'attackHabits'))
        effects = (effects || []).map(e => e.op === 'wound' ? { op: 'dmg', n: e.n } : e);
    return effects;
}
function resolveAttack(state, step, it, p) {
    if (p && it && it.uid) {
        state.combatSeq = (state.combatSeq || 0) + 1;
        state.lastCombatAction = { n: state.combatSeq, type: 'intruderAttacks', player: p.id, intruder: it.uid, room: p.room };
    }
    let cardId = step.cardId;
    if (!cardId) {
        if (!state.attackDeck.length) { state.attackDeck = shuffle(state, state.attackDiscard.splice(0)); log(state, 'Колода атак перемешана.', 'minor'); }
        cardId = state.attackDeck.shift();
        state.attackDiscard.push(cardId);
    }
    const card = ATTACK_BY_ID[cardId];
    let effects = attackEffectsFor(state, card, it, p);
    if (!step.cardId) log(state, '⚔ ' + intruderLabel(state, it) + ' атакует ' + pname(p) + ': «' + card.name + '».', 'combat');
    if (card.id === 'bite' && it.type === 'adult' && hasWeak(state, 'attackHabits')) log(state, '🦷 Повадки атаки: Укус Взрослого даёт лёгкую травму вместо тяжёлой.', 'good');
    if (p.armor && ITEMS[p.armor.item].discardArmor && isAdultEquivalent(state, it) && !effects.some(e => ['miss', 'carnoMiss', 'voidMiss', 'chyMiss'].includes(e.op))) {
        ask(state, { kind: 'choice', player: p.id, title: intruderLabel(state, it) + ': «' + card.name + '». Сбросить броню и проигнорировать атаку?',
            options: [{ id: 'yes', label: 'Да, сбросить броню' }, { id: 'no', label: 'Нет, принять атаку' }] },
            { op: 'attack.armor', player: p.id, intruder: it.uid, phantom: it.uid === '_phantom' ? it : undefined, cardId, moving: step.moving, dest: step.dest, context: step.context, ravenous: step.ravenous });
        return;
    }
    // Hardened Armor: replacing the wound with 2 health is the player's call, never automatic.
    const hpPerWound = p.armor ? ITEMS[p.armor.item].woundToHp : 0;
    if (!step.armorReplaced && hpPerWound && ITEMS[p.armor.item].woundToHpOptional &&
        p.health > hpPerWound && effects.some(e => e.op === 'wound')) {
        ask(state, { kind: 'choice', player: p.id, title: 'Усиленная броня: заменить тяжёлую травму на −' + hpPerWound + ' здоровья?',
            options: [{ id: 'yes', label: 'Да, потерять ' + hpPerWound + ' здоровья' }, { id: 'no', label: 'Нет, получить травму' }] },
            { op: 'attack.armorReplace', player: p.id, intruder: it.uid, phantom: it.uid === '_phantom' ? it : undefined, cardId, moving: step.moving, dest: step.dest, context: step.context, ravenous: step.ravenous });
        return;
    }
    applyAttackEffects(state, effects, it, p, step);
}
OPS['attack.armorReplace'] = (state, step) => {
    const p = player(state, step.player), it = step.phantom || state.intruders[step.intruder];
    const card = ATTACK_BY_ID[step.cardId];
    let effects = attackEffectsFor(state, card, it, p);
    if (step.answer === 'yes' && p.armor) {
        const cost = ITEMS[p.armor.item].woundToHp;
        const at = effects.findIndex(e => e.op === 'wound');
        if (at >= 0) effects = effects.slice(0, at).concat(effects.slice(at + 1));
        applyAttackEffects(state, effects, it, p, { ...step, armorReplaced: true });
        if (p.status === 'active') loseHealth(state, p, cost, 'усиленная броня');
        return;
    }
    applyAttackEffects(state, effects, it, p, { ...step, armorReplaced: true });
};
OPS['attack.armor'] = (state, step) => {
    const p = player(state, step.player), it = step.phantom || state.intruders[step.intruder];
    if (step.answer === 'yes') {
        if (p.armor) {
            const def = ITEMS[p.armor.item];
            (state.itemDiscard[def.deck] = state.itemDiscard[def.deck] || []).push(p.armor.item);
            p.armor = null;
        }
        log(state, pname(p) + ' сбрасывает броню: атака проигнорирована.', 'good');
        return;
    }
    const card = ATTACK_BY_ID[step.cardId];
    let effects = attackEffectsFor(state, card, it, p);
    applyAttackEffects(state, effects, it, p, step);
};

/** Would this attack card kill `p` outright? Used for the Sentinel "Laika dies instead" reaction. */
function lethalEffect(state, effects, p) {
    const hs = healthState(p);
    let hp = p.health;
    for (const e of effects) {
        switch (e.op) {
            case 'dmg': hp -= e.n + (hasAdapt(state, 'razorAppendages') ? 1 : 0); if (hp <= 0) return true; break;
            case 'dieIf': if (e.state === 'heavy' ? hs === 'heavy' : (hs === 'injured' || hs === 'heavy')) return true; break;
            case 'if': if (lethalEffect(state, (e.state === 'injured' ? hs === 'injured' : hs === e.state) ? e.then : e.else, p)) return true; break;
            case 'furyRoom': if (hs === 'heavy') return true; break;
            case 'carnoKill': case 'voidKill': case 'chyKill': return true;
            case 'chyEntangle': if (p.wounds.length || p.health <= state.chyQueenSlots.filter(Boolean).length) return true; break;
            case 'chyInfection': if (p.chySpore) return true; break;
            case 'chySpikes': if (p.wounds.length >= 2) return true; break;
            case 'voidFrenzy': if (p.wounds.length >= 2) return true; break;
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
            case 'carnoKill': killPlayer(state, p, 'смертельная атака карноморфа'); break;
            case 'voidKill': killPlayer(state, p, 'смертельная атака кошмара'); break;
            case 'chyKill': killPlayer(state, p, 'смертельная атака хитрида'); break;
            case 'chyMiss': log(state, 'Атака хитрида не попала.', 'good'); break;
            case 'chyGrowth': placeGerminator(state, p.room); break;
            case 'chyInfection': {
                const others = playersInRoom(state, p.room);
                giveChySpore(state, p);
                for (const o of others) if (o.status === 'active') gainContamination(state, o, 1);
                break;
            }
            case 'chyEntangle':
                placeMycelium(state, p.room);
                if (p.status === 'active') {
                    if (p.wounds.length) killPlayer(state, p, 'опутывание');
                    else loseHealth(state, p, state.chyQueenSlots.filter(Boolean).length, 'опутывание');
                }
                break;
            case 'chyPseudopod':
                placeGerminator(state, p.room);
                spawnChytrid(state, 'chyQueen', p.room);
                break;
            case 'chySpikes':
                for (const o of playersInRoom(state, it.room)) {
                    if (o.wounds.length >= 2) killPlayer(state, o, 'шипы хитрида');
                    else gainWound(state, o, 1);
                }
                break;
            case 'voidFrenzy':
                for (const o of playersInRoom(state, it.room)) {
                    if (o.wounds.length >= 2) killPlayer(state, o, 'бешенство кошмара');
                    else gainWound(state, o, 1);
                }
                break;
            case 'voidPanic': next(state, { op: 'void.panic', player: p.id }); break;
            case 'voidSpawn': spawnVoid(state, it.type, it.room); break;
            case 'voidMiss': log(state, 'Атака кошмара не попала.', 'good'); break;
            case 'carnoHeal': it.hits = 0; break;
            case 'carnoSpawn': spawnCarnomorph(state, 'metagorger', p.room); break;
            case 'carnoCarcass':
                room(state, p.room).objects.push({ type: 'carcass' });
                state.carcassCount = (state.carcassCount || 0) + 1;
                break;
            case 'carnoMiss':
                log(state, 'Атака карноморфа не попала.', 'good');
                if (hasCarnomorphAdaptation(state, 'genomeError')) gainContamination(state, p, 1);
                if (p.status === 'active' && hasCarnomorphAdaptation(state, 'tentacles')) loseHealth(state, p, 1, 'атака');
                break;
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
                infectLarva(state, p);
                break;
            case 'miss':
                log(state, 'Промах! Колода атак перемешивается.', 'good');
                state.attackDeck.push(...state.attackDiscard.splice(0));
                shuffle(state, state.attackDeck);
                break;
        }
    }
    if (nested) return;
    const miss = effects.some(e => e.op === 'miss' || e.op === 'carnoMiss' || e.op === 'voidMiss' || e.op === 'chyMiss');
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
    // The attack happens while the character is still leaving: remember the intent, and move the
    // intruder once the character has actually arrived.
    (state.pendingFollows = state.pendingFollows || []).push({ intruder: step.intruder, player: step.player, dest: step.dest });
};
export function resolveFollows(state) {
    const list = state.pendingFollows || [];
    state.pendingFollows = [];
    for (const f of list) {
        const it = state.intruders[f.intruder], p = player(state, f.player);
        if (!it || !p || p.status !== 'active' || p.room !== f.dest || it.room === f.dest) continue;
        it.room = f.dest;
        log(state, INTRUDER_NAMES[it.type] + ' следует за ' + pname(p) + ' в ' + roomName(state, f.dest) + '.', 'combat');
    }
}

// ---------------------------------------------------------------------------------------------
// Shooting
// ---------------------------------------------------------------------------------------------
OPS['shoot.start'] = (state, step) => {
    const p = player(state, step.player);
    const weapons = p.items.filter(i => canFire(p, i) && (!step.onlyItem || i.item === step.onlyItem));
    if (!weapons.length) { log(state, 'Нет заряженного оружия.', 'bad'); next(state, step.then || { op: 'turn.choose' }); return; }
    // The weapon may already be picked (a click on the intruder asks "with what?" on the board).
    const picked = step.weapon ? weapons.find(w => w.uid === step.weapon) : null;
    if (picked) { next(state, { ...step, op: 'shoot.mode', weapon: picked.uid }); return; }
    if (weapons.length === 1) { next(state, { ...step, op: 'shoot.mode', weapon: weapons[0].uid }); return; }
    ask(state, { kind: 'choice', player: p.id, title: 'Каким оружием стрелять?', options: weapons.map(w => ({ id: w.uid, item: w.item, label: ITEMS[w.item].name + (ITEMS[w.item].weapon.noAmmo ? '' : ' (патронов ' + w.ammo + ')') })) },
        { ...step, op: 'shoot.weaponChosen' });
};
OPS['shoot.weaponChosen'] = (state, step) => next(state, { ...step, op: 'shoot.mode', weapon: step.answer, answer: undefined });
/** Belt ammo (Autoloader Belt) counts for every weapon. */
export function beltAmmo(p) { return p.armor && ITEMS[p.armor.item].ammoMax ? p.armor.ammo : 0; }
export function canFire(p, i) {
    const d = ITEMS[i.item];
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
    if (wd.grenadeMode) {
        // Printed: "Instead of a normal Shot: …" — the Grenade Launcher has no single-target mode.
        ask(state, { kind: 'choice', player: p.id, title: '«' + ITEMS[w.item].name + '»: режим стрельбы',
            options: [{ id: 'grenade', label: 'Гранатный выстрел по комнате' }] }, { ...step, op: 'shoot.modeChosen' });
        return;
    }
    const opts = [{ id: 'normal', label: 'Обычный выстрел' }];
    if (wd.boost && ammo >= 1 + wd.boost.ammo) opts.push({ id: 'boost', label: 'Усиленный: +' + wd.boost.hits + ' ранения (ещё ' + wd.boost.ammo + ' патр.)' });
    if (wd.repelMode && ammo >= 2 && intrudersIn(state, p.room).some(i => isAdultEquivalent(state, i))) opts.push({ id: 'repel', label: 'Отогнать взрослого (2 патрона)' });
    // Needle Gun (printed): "Instead of a normal Shot, Repel 1 Larva or Adult from the Room."
    if (wd.repelShot && ammo >= 1 && intrudersIn(state, p.room).some(i => isAdultEquivalent(state, i) || i.type === 'larva')) opts.push({ id: 'repelShot', label: 'Отогнать личинку или взрослого (1 патрон)' });
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
        const it = intrudersIn(state, p.room).find(i => isAdultEquivalent(state, i));
        spendAmmo(p, w, 2);
        log(state, pname(p) + ' отгоняет взрослого выстрелом из «' + ITEMS[w.item].name + '».', 'combat');
        if (it) repelIntruder(state, it);
        next(state, then);
        return;
    }
    if (mode === 'repelShot') {
        const targets = intrudersIn(state, p.room).filter(i => isAdultEquivalent(state, i) || i.type === 'larva');
        spendAmmo(p, w, 1);
        if (!targets.length) { next(state, then); return; }
        if (targets.length === 1) { next(state, { op: 'shoot.repelShot', player: p.id, target: targets[0].uid, then }); return; }
        ask(state, { kind: 'choice', player: p.id, title: 'Игольник: кого отогнать?', options: targets.map(i => ({ id: i.uid, label: intruderLabel(state, i) })) },
            { op: 'shoot.repelShot', player: p.id, then });
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
OPS['shoot.repelShot'] = (state, step) => {
    const p = player(state, step.player);
    const it = state.intruders[step.answer || step.target];
    const then = step.then || { op: 'turn.choose' };
    if (!it) { next(state, then); return; }
    log(state, pname(p) + ': игольник отгоняет ' + intruderLabel(state, it) + '.', 'combat');
    if (it) repelIntruder(state, it);
    next(state, then);
};
OPS['shoot.grenade'] = (state, step) => {
    const p = player(state, step.player);
    const w = p.items.find(i => i.uid === step.weapon);
    const r = step.answer;
    spendAmmo(p, w, 1);
    log(state, '💥 ' + pname(p) + ' стреляет из гранатомёта по ' + roomName(state, r) + '!', 'combat');
    for (const e of state.ship.rooms[r].exits) { const c = state.ship.corridors[e.corridor]; if (c.door !== 'destroyed') c.door = 'destroyed'; }
    // Printed: every Intruder there suffers a Critical result.
    for (const it of intrudersIn(state, r)) {
        if (!state.intruders[it.uid]) continue;
        if (it.type === 'queen') { next(state, { op: 'queen.card', player: p.id }); continue; }
        if (state.enemySet === 'voidseeders') {
            if (killVoid(state, it)) log(state, INTRUDER_NAMES[it.type] + ' уничтожен взрывом.', 'combat');
            else log(state, 'Гнетущий защищён логовами и не уничтожен взрывом.', 'combat');
        } else {
            log(state, INTRUDER_NAMES[it.type] + ' уничтожен взрывом (критический результат).', 'combat');
            if (state.enemySet === 'carnomorphs') killCarnomorph(state, it);
            else if (state.enemySet === 'chytrids') killChytrid(state, it);
            else removeIntruder(state, it.uid, true);
        }
    }
    // Growth is not an Intruder for the launcher's room-wide item effect.
    for (const o of playersInRoom(state, r)) gainWound(state, o, 1);
    next(state, step.then);
};
OPS['shoot.target'] = (state, step) => {
    const p = player(state, step.player), w = p.items.find(i => i.uid === step.weapon);
    const sniper = w && ITEMS[w.item].weapon.sniper;
    let targets = intrudersIn(state, p.room).map(t => ({ id: t.uid, label: intruderLabel(state, t), room: t.room }));
    const rooms = [p.room];
    if (sniper) for (const e of state.ship.rooms[p.room].exits) if (state.ship.corridors[e.corridor].door !== 'closed') {
        rooms.push(e.to); targets.push(...intrudersIn(state, e.to).map(t => ({ id: t.uid, label: intruderLabel(state, t), room: t.room })));
    }
    if (state.enemySet === 'chytrids') for (const id of rooms) if (room(state,id).chyGerm) targets.push({ id:'germ:'+id, label:'Нарост', room:id });
    if (step.forcedTarget) targets = targets.filter(t => t.id === step.forcedTarget);
    const select = target => next(state, { ...step, op: target.startsWith('germ:') ? 'chy.germShoot' : 'shoot.fire', target });
    if (step.target && targets.some(t => t.id === step.target)) { select(step.target); return; }
    if (!targets.length) { log(state, 'Целей нет.', 'bad'); next(state, step.then || { op: 'turn.choose' }); return; }
    if (targets.length === 1) { select(targets[0].id); return; }
    ask(state, { kind: 'choice', player: p.id, title: 'В кого стрелять?', options: targets.map(t => ({ id:t.id, label:t.label + (t.room !== p.room ? ' ('+roomName(state,t.room)+', +1 ранение)' : '') })) }, { ...step, op:'shoot.targetChosen' });
};
OPS['shoot.targetChosen'] = (state, step) => next(state, { ...step, op: String(step.answer).startsWith('germ:') ? 'chy.germShoot' : 'shoot.fire', target:step.answer, answer:undefined });
OPS['chy.germShoot'] = (state, step) => {
    const p=player(state,step.player), id=step.target.slice(5), w=p.items.find(i=>i.uid===step.weapon), rs=room(state,id), then=step.then || {op:'turn.choose'};
    if (!w || !rs || !rs.chyGerm || !canFire(p,w)) { next(state,then); return; }
    const die=shootDie(p), dieName=dieId(die), wd=ITEMS[w.item].weapon;
    if (!step.rerollResolved && needDice(state,step,dieName,p.id,'Бросок боя — выстрел по наросту')) return;
    if (wd.reroll && !step.rerollResolved) {
        step.blue = dieName === 'blue'; const first=forcedRollOnce(state,step);
        ask(state,{kind:'choice',player:p.id,title:'Перебросить кубик боя? Второй результат окончателен.', options:[{id:'reroll',label:'Перебросить'},{id:'keep',label:'Оставить'}]},
            {op:'shoot.rerollAns',player:p.id,first,blue:step.blue,step:{...step}}); return;
    }
    let natural=step.forcedRoll !== undefined ? step.forcedRoll : roll(state,die);
    if (step.bestOfTwo) {
        const second = roll(state, die);
        // A growth does not have a kill check; prefer bonus damage and then avoid
        // weapon penalties on otherwise equivalent faces.
        const score = face => (wd.plusOn5 && face === 5 ? 100 : 0)
            - (wd.fireOn?.includes(face) ? 1 : 0) - (wd.malfOn?.includes(face) ? 1 : 0)
            - (wd.plasma && [2,6].includes(face) ? 1 : 0) - (wd.critDiscard && face === 'crit' ? 1 : 0);
        log(state, '🎲 Два броска — ' + fmtRoll(natural) + ' и ' + fmtRoll(second) + '.', 'combat');
        if (score(second) > score(natural)) natural = second;
    }
    if (!wd.noAmmo) spendAmmo(p,w,1);
    let hits=1+(step.bonusHits||0)+(wd.bonusHit||0)+(id!==p.room?1:0);
    if(wd.firstShotBonus&&!p.firstShotUsed){hits++;p.firstShotUsed=true;}
    if(wd.plusOn5 && natural===5) hits++;
    if(w.item==='flamethrower' && hasChyWeakness(state,'fireVulnerability')) hits++;
    damageGerminator(state,id,hits);
    if(wd.fire || (wd.fireOn && wd.fireOn.includes(natural))) placeFire(state,p.room,'огнемёт');
    if(wd.malfOn && wd.malfOn.includes(natural)) placeMalfunction(state,p.room,'звуковая пушка');
    if(wd.plasma && [2,6].includes(natural)){ const m=w.charge||0;if(m)loseHealth(state,p,2*m,'перегрев плазмы');w.charge=m+1; }
    if(wd.spread) for(const other of intrudersIn(state,p.room)) if(state.intruders[other.uid]) applyHitsNoRoll(state,other,1);
    if(wd.spreadChars) for(const o of playersInRoom(state,p.room)) if(o.id!==p.id) gainWound(state,o,1);
    if(wd.upsOn && wd.upsOn.includes(natural)) {
        const ups=p.items.find(i=>i.item==='ups')||(p.quests||[]).find(i=>i.item==='ups');
        if(ups){ups.charge=Math.max(0,(ups.charge??ITEMS.ups.markers)-1);for(const i of [...p.items,...(p.quests||[])])if(i.item==='ups')i.charge=ups.charge;}
    }
    log(state, '🔫 Нарост получает '+hits+' ранений.', 'combat');
    if(step.repeat && rs.chyGerm && w.ammo>0){ const again={...step};delete again.forcedRoll;delete again.rerollResolved;delete again.blue;next(state,again);return; }
    if(wd.critDiscard && natural==='crit' && p.hand.length){next(state,{op:'shoot.critDiscard',player:p.id,then});return;}
    next(state,then);
};
OPS['shoot.fire'] = (state, step) => {
    const p = player(state, step.player);
    const w = p.items.find(i => i.uid === step.weapon);
    const it = state.intruders[step.target];
    const then = step.then || { op: 'turn.choose' };
    if (!w || !it || !canFire(p, w)) { next(state, then); return; }
    const sdie = shootDie(p), sdieId = dieId(sdie);
    if (sdieId === 'blue') step.blue = true;
    if (it.type !== 'larva' && !step.rerollResolved && needDice(state, step, sdieId, p.id, sdieId === 'blue' ? 'Бросок боя — выстрел (синий кубик)' : 'Бросок боя — выстрел')) return;
    const def = ITEMS[w.item], wd = def.weapon;
    // Weapons that allow a reroll ("may reroll the first roll, accept the second result") turn it
    // into the player's decision. The first die is rolled here, before ammo is spent.
    if ((wd.reroll || (state.enemySet === 'voidseeders' && it.type === 'lair' && hasVoidWeakness(state, 'determination'))) && !step.rerollResolved && it.type !== 'larva') {
        const first = forcedRollOnce(state, step);
        ask(state, { kind: 'choice', player: p.id, title: (wd.reroll ? '«' + def.name + '»' : 'Решительность') + ': выпало ' + fmtRoll(first) + '. Перебросить кубик боя? Второй результат окончателен.',
            options: [{ id: 'reroll', label: 'Перебросить' }, { id: 'keep', label: 'Оставить' }] },
            { op: 'shoot.rerollAns', player: p.id, first, blue: step.blue, step: { ...step, answer: undefined } });
        return;
    }
    state.shotSeq = (state.shotSeq || 0) + 1;
    state.lastShot = { n: state.shotSeq, player: p.id, target: it.uid, room: it.room };
    state.combatSeq = (state.combatSeq || 0) + 1;
    state.lastCombatAction = { n: state.combatSeq, type: 'charAttacks', player: p.id, intruder: it.uid, room: it.room };
    if (!wd.noAmmo) spendAmmo(p, w, 1);
    let hits = 1 + (step.bonusHits || 0) + (wd.bonusHit || 0) + (it.room !== p.room ? 1 : 0);
    if (wd.firstShotBonus && !p.firstShotUsed) { hits++; p.firstShotUsed = true; }
    let mod = (wd.plusOne ? 1 : 0) - (wd.minusOne ? 1 : 0) + (p.wounds.includes('eyes') ? 1 : 0) + (step.rollBonus || 0);
    log(state, '🔫 ' + pname(p) + ' стреляет из «' + def.name + '» в ' + intruderLabel(state, it) + ' (патронов осталось ' + w.ammo + ').', 'combat');
    dealHits(state, p, it, hits, mod, { weapon: w, retaliate: false, bestOfTwo: step.bestOfTwo, forcedRoll: step.forcedRoll, die: sdie });
    const rolled = state.lastCombatNatural;
    if (wd.fire) placeFire(state, p.room, 'огнемёт');
    if (wd.fireOn && wd.fireOn.includes(rolled)) placeFire(state, p.room, 'огнемёт');
    if (wd.malfOn && wd.malfOn.includes(rolled)) { placeMalfunction(state, p.room, 'звуковая пушка'); log(state, 'Звуковая пушка: поломка в вашей комнате.', 'bad'); }
    if (wd.plasma && [2, 6].includes(rolled)) { const m = w.charge || 0; if (m) loseHealth(state, p, 2 * m, 'перегрев плазмы'); w.charge = m + 1; log(state, 'Плазменная пушка перегревается: жетонов ' + w.charge + '.', 'bad'); }
    if (wd.spread) for (const o of intrudersIn(state, p.room)) if (o.uid !== it.uid && state.intruders[o.uid]) applyHitsNoRoll(state, o, 1);
    // Pilot's Shotgun (printed): "every other Character in the Room suffers 1 Hit" — Characters, not Intruders.
    if (wd.spreadChars) for (const o of playersInRoom(state, p.room)) if (o.id !== p.id && o.status === 'active') gainWound(state, o, 1);
    // Android Arm Gun (printed): on a 2 or a Critical, discard 1 marker from your UPS.
    if (wd.upsOn && wd.upsOn.includes(rolled)) {
        const ups = p.items.find(i => i.item === 'ups') || (p.quests || []).find(i => i.item === 'ups');
        if (ups) {
            ups.charge = Math.max(0, (ups.charge ?? ITEMS.ups.markers) - 1);
            const q = (p.quests || []).find(x => x.item === 'ups'); if (q) q.charge = ups.charge;
            const it = p.items.find(x => x.item === 'ups'); if (it) it.charge = ups.charge;
            log(state, 'Ручная пушка: с ИБП сброшен 1 жетон (осталось ' + ups.charge + ').', 'minor');
        }
    }
    if (step.repeat && state.intruders[it.uid] === undefined && w.ammo > 0 && intrudersIn(state, p.room).length) { next(state, { ...step, op: 'shoot.target', answer: undefined }); return; }
    if (step.repeat && state.intruders[it.uid] !== undefined && w.ammo > 0) { next(state, { ...step, op: 'shoot.fire' }); return; }
    if (wd.critDiscard && rolled === 'crit' && p.hand.length) { next(state, { op: 'shoot.critDiscard', player: p.id, then }); return; }
    next(state, then);
};

/** Intruder Adaptations that alter the natural combat roll: Agile (2 / icon → 6), Hardened Carapace (2–6 → +1). */
/**
 * The Battle Suit (printed): "Use the special Blue Combat die when Shooting." The die is the
 * shooter's, so a wearer replaces the red die for every Shot they make, including rerolls.
 */
function shootDie(p) { return p.armor && p.armor.item === 'battleSuit' ? BLUE_DIE : COMBAT_DIE; }
/** The first combat die of a shot: interactive when the player already rolled, else a normal roll. */
function forcedRollOnce(state, step) {
    return roll(state, step.blue ? BLUE_DIE : COMBAT_DIE);
}
function adaptRoll(state, r) {
    if (hasAdapt(state, 'agile') && (r === 'crit' || r === 2)) { log(state, '🧬 Проворство: результат «' + fmtRoll(r) + '» считается «6».', 'combat'); r = 6; }
    if (hasAdapt(state, 'hardenedCarapace') && typeof r === 'number') { log(state, '🧬 Прочный панцирь: ' + r + ' → ' + (r + 1) + '.', 'combat'); r = r + 1; }
    return r;
}
/**
 * Printed die-face rewrites: "2 and Critical : treat these results as 6" (Scientist's Pistol) and
 * "2 and 3 : +1 to these results" (Lab Rat's Gun). Both act on the natural face of the Combat die,
 * before any Adaptation changes it.
 */
function faceEffect(state, wd, natural, name) {
    if (!wd || natural === undefined) return natural;
    if (wd.facesTo && wd.facesTo[natural] !== undefined) {
        log(state, name + ': результат «' + fmtRoll(natural) + '» считается «' + wd.facesTo[natural] + '».', 'combat');
        return wd.facesTo[natural];
    }
    if (wd.facesPlus && wd.facesPlus.includes(natural)) {
        log(state, name + ': результат «' + fmtRoll(natural) + '» получает +1.', 'combat');
        return natural + 1;
    }
    return natural;
}
/** Rank a Chytrid weakness die after the weapon's printed face changes, not just by face value.
 * A kill is preferable to survival; among equal outcomes, additional injury is preferable.
 * This mirrors the actual resolution below without consuming a roll or mutating the state. */
function chyRollScore(state, it, natural, wd, hits, mod) {
    let face = natural;
    if (wd.facesTo && wd.facesTo[face] !== undefined) face = wd.facesTo[face];
    else if (wd.facesPlus && wd.facesPlus.includes(face)) face += 1;
    let result = wd.critOn2 && natural === 2 ? 'crit' : face;
    if (hasAdapt(state, 'agile') && (result === 'crit' || result === 2)) result = 6;
    if (hasAdapt(state, 'hardenedCarapace') && typeof result === 'number') result++;
    if (natural === 6 && it.type === 'stinkhorn' && hasChyWeakness(state, 'predictableMovements')) result = 'crit';
    const extra = wd.plusOn5 && result === 5 ? 1 : 0;
    const lethal = result === 'crit' || result + mod <= it.hits + hits + extra;
    return (lethal ? 10000 : 0) + extra * 100 - (result === 'crit' ? 0 : result + mod);
}

/** Deal `hits` to an intruder, then the kill-check roll. */
export function dealHits(state, p, it, hits, mod, opts = {}) {
    if (p && it && it.uid) {
        state.combatSeq = (state.combatSeq || 0) + 1;
        state.lastCombatAction = { n: state.combatSeq, type: 'charAttacks', player: p.id, intruder: it.uid, room: it.room };
    }
    state.lastCombatNatural = null;
    if (it.type === 'larva') { log(state, 'Личинка погибает.', 'good'); removeIntruder(state, it.uid, false); return true; }
    // Energy Vulnerability: an Energy-weapon attack that deals at least 1 Injury deals +1.
    if (hits >= 1 && opts.weapon && ITEMS[opts.weapon.item].weapon.energy && hasWeak(state, 'energyVuln')) { hits += 1; log(state, '⚡ Уязвимость к энергии: +1 ранение.', 'good'); }
    if (it.type === 'queen') return queenHits(state, p, it, hits, mod, opts);
    if (state.enemySet === 'chytrids' && hasChyWeakness(state, 'fireVulnerability') && hits > 0 && (opts.explosive || (opts.weapon && opts.weapon.item === 'flamethrower'))) { hits++; log(state, '🔥 Уязвимость к огню: +1 ранение.', 'good'); }
    it.hits += hits;
    const wd = opts.weapon ? ITEMS[opts.weapon.item].weapon : {};
    const die = opts.die || COMBAT_DIE;
    let r = opts.forcedRoll !== undefined ? opts.forcedRoll : roll(state, die);
    if (opts.bestOfTwo || (state.enemySet === 'chytrids' && it.type === 'stinkhorn' && hasChyWeakness(state, 'chitinDepletion'))) {
        const r2 = roll(state, die);
        const score = v => state.enemySet === 'chytrids'
            ? chyRollScore(state, it, v, wd, 0, mod)
            : (v === 'crit' ? 100 : -v);
        log(state, '🎲 Два броска — ' + fmtRoll(r) + ' и ' + fmtRoll(r2) + '.', 'combat');
        if (score(r2) > score(r)) r = r2;
        log(state, '🎲 Выбран результат ' + fmtRoll(r) + '.', 'combat');
    }
    state.lastCombatNatural = r;
    // "even if an effect changes the result": the weapon's natural-2 Critical is checked on the
    // natural die, before any Adaptation changes it.
    const natural = r;
    const face = faceEffect(state, wd, natural, opts.weapon ? ITEMS[opts.weapon.item].name : '');
    if (wd.critOn2 && natural === 2) { r = 'crit'; log(state, 'Штурмовая винтовка: «2» считается КРИТОМ.', 'combat'); }
    else r = adaptRoll(state, face);
    // Weak Spots: against Adults («Трутни» on the printed card) a natural 6 counts as a Critical.
    if (natural === 6 && state.enemySet === 'chytrids' && it.type === 'stinkhorn' && hasChyWeakness(state, 'predictableMovements')) { r = 'crit'; log(state, '🎯 Предсказуемость движений: натуральная 6 — крит по отростку.', 'good'); }
    if (natural === 6 && it.type === 'adult' && hasWeak(state, 'weakSpots')) { r = 'crit'; log(state, '🎯 Уязвимые места: «6» против Взрослого считается КРИТом.', 'good'); }
    // The Convict's Pipe: a Melee Attack contaminates only on the faces the card names.
    if (opts.contamFaces && opts.contamFaces.includes(natural)) gainContamination(state, p, 1);
    if (wd.plusOn5 && r === 5) { hits++; it.hits++; log(state, 'BF-пушка: «5» — дополнительное ранение.', 'combat'); }
    // In the expansion the die still supports Redux weapon effects, but its kill check is
    // replaced by the printed Carnomorph attack-card toughness check.
    if (state.enemySet === 'carnomorphs') {
        it.hits -= hits; // carnPowerCheck adds the injuries and draws exactly one card.
        if (natural === 'crit' && hasCarnomorphAdaptation(state, 'agility')) {
            log(state, '🧬 Проворность: критическая грань — промах, урон не нанесён.', 'combat');
            if (opts.retaliate && state.intruders[it.uid]) next(state, { op: 'attack', intruder: it.uid, player: p.id, context: 'retaliation' });
            return false;
        }
        if (opts.weapon && opts.weapon.item === 'flamethrower' && hasCarnomorphAdaptation(state, 'fireResistance')) {
            log(state, '🧬 Сопротивление огню: огнемёт не наносит карноморфу урон.', 'combat');
            if (opts.retaliate && state.intruders[it.uid]) next(state, { op: 'attack', intruder: it.uid, player: p.id, context: 'retaliation' });
            return false;
        }
        const result = carnPowerCheck(state, it, hits);
        if (result && result.result === 'killed') { onKill(state, p, opts); return true; }
        if (opts.retaliate && state.intruders[it.uid]) next(state, { op: 'attack', intruder: it.uid, player: p.id, context: 'retaliation' });
        return false;
    }
    if (state.enemySet === 'voidseeders') {
        it.hits -= hits; // Redux's die still resolves weapon effects; the DLC card determines toughness.
        const result = voidPowerCheck(state, it, hits);
        if (result && result.result === 'killed') { onKill(state, p, opts); return true; }
        if (opts.retaliate && state.intruders[it.uid] && it.room === p.room) next(state, { op: 'attack', intruder: it.uid, player: p.id, context: 'retaliation' });
        return false;
    }
    let val = r === 'crit' ? 'crit' : r + mod;
    const frail = hasWeak(state, 'endangered') ? 1 : 0;   // Dying Species: Toughness of all Intruders −1
    log(state, '🎲 Бой: ' + fmtRoll(r) + (mod ? ' +' + mod + ' = ' + val : '') + ' против ранений ' + it.hits + (frail ? ' (стойкость −1)' : '') + '.', 'combat');
    if (val === 'crit' || val - frail <= it.hits) {
        log(state, '✔ ' + INTRUDER_NAMES[it.type] + ' убит!', 'good');
        if (state.enemySet === 'chytrids') killChytrid(state, it);
        else removeIntruder(state, it.uid, true);
        onKill(state, p, opts);
        return true;
    }
    log(state, INTRUDER_NAMES[it.type] + ' выживает (ранений ' + it.hits + ').', 'combat');
    if (opts.retaliate) next(state, { op: 'attack', intruder: it.uid, player: p.id, context: 'retaliation' });
    return false;
}
OPS['shoot.rerollAns'] = (state, step) => {
    // "You may reroll the first roll, accept the second": the second value is final.
    const second = step.answer === 'reroll' ? roll(state, step.blue ? BLUE_DIE : COMBAT_DIE) : step.first;
    if (step.answer === 'reroll') log(state, pname(player(state, step.player)) + ' перебрасывает кубик боя.', 'combat');
    next(state, { ...step.step, rerollResolved: true, forcedRoll: second });
};
export function applyHitsNoRoll(state, it, n) {
    if (state.enemySet === 'voidseeders') { const result = voidPowerCheck(state, it, n); return !!result && result.result === 'killed'; }
    if (state.enemySet === 'carnomorphs') { const result = carnPowerCheck(state, it, n); return !!result && result.result === 'killed'; }
    if (it.type === 'larva') { removeIntruder(state, it.uid, false); log(state, 'Личинка погибает.', 'good'); return; }
    if (it.type === 'queen') { state.queenHits += n; log(state, 'Королева получает ' + n + ' ранений (всего ' + state.queenHits + ').', 'combat'); if (state.queenHits >= 6) next(state, { op: 'queen.card', player: null }); return; }
    it.hits += n;
    log(state, INTRUDER_NAMES[it.type] + ' получает ' + n + ' ранений (всего ' + it.hits + ').', 'combat');
}
/** Phosphates weakness: a Fire Extinguisher / Fire Control System also inflicts 1 Injury. */
export function phosphateWound(state, it) {
    if (!it || !state.intruders[it.uid] || !hasWeak(state, 'phosphates')) return;
    log(state, '🧪 Восприимчивость к фосфатам: ' + INTRUDER_NAMES[it.type] + ' получает 1 рану.', 'good');
    applyHitsNoRoll(state, it, 1);
}
function onKill(state, p, opts) {
    if (opts.weapon && ITEMS[opts.weapon.item].weapon.drawOnKill && !p.rifleDrawUsed) { p.rifleDrawUsed = true; drawCards(state, p, 1); }
}

function queenHits(state, p, it, hits, mod, opts = {}) {
    state.queenHits += hits;
    const wd = opts.weapon ? ITEMS[opts.weapon.item].weapon : {};
    const natural = opts.forcedRoll !== undefined ? opts.forcedRoll : roll(state, opts.die || COMBAT_DIE);
    state.lastCombatNatural = natural;
    const face = faceEffect(state, wd, natural, opts.weapon ? ITEMS[opts.weapon.item].name : '');
    let r = natural;
    if (wd.critOn2 && natural === 2) { r = 'crit'; log(state, 'Штурмовая винтовка: «2» — КРИТ по Королеве.', 'combat'); }
    else r = adaptRoll(state, face);
    const val = r === 'crit' ? 'crit' : r + mod;
    const frail = hasWeak(state, 'endangered') ? 1 : 0;   // Dying Species: Toughness of all Intruders −1
    log(state, '🎲 Бой с Королевой: ' + fmtRoll(r) + (mod ? ' +' + mod : '') + ', ранений на треке ' + state.queenHits + (frail ? ' (стойкость −1)' : '') + '.', 'combat');
    if (val === 'crit' || val - frail <= state.queenHits || state.queenHits >= 6) next(state, { op: 'queen.card', player: p.id });
    else log(state, 'Королева держится.', 'combat');
    return false;
}
OPS['queen.card'] = (state, step) => {
    if (!state.queenDeck.length) return;
    const idx = state.queenDeck.shift();
    state.queenPlayed = state.queenPlayed || [];
    state.queenPlayed.push(idx);          // drawn cards stay face up next to the board
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
    const p=player(state,step.player), targets=intrudersIn(state,p.room).map(t=>({id:t.uid,label:intruderLabel(state,t)}));
    if(state.enemySet==='chytrids' && room(state,p.room).chyGerm) targets.push({id:'germ:'+p.room,label:'Нарост'});
    const choose=target=>next(state,{...step,op:target.startsWith('germ:')?'chy.germMelee':'melee.hit',target});
    if(step.target && targets.some(t=>t.id===step.target)){choose(step.target);return;}
    if(!targets.length){next(state,step.then||{op:'turn.choose'});return;}
    if(targets.length===1){choose(targets[0].id);return;}
    ask(state,{kind:'choice',player:p.id,title:'Кого атаковать в ближнем бою?',options:targets},{...step,op:'melee.targetChosen'});
};
OPS['melee.targetChosen'] = (state, step) => next(state, { ...step, op: String(step.answer).startsWith('germ:')?'chy.germMelee':'melee.hit', target: step.answer, answer: undefined });
OPS['chy.germMelee'] = (state, step) => {
    const p=player(state,step.player), id=step.target.slice(5), rs=room(state,id), then=step.then||{op:'turn.choose'};
    if(!rs?.chyGerm || p.room!==id){next(state,then);return;}
    const hatchet=p.items.find(i=>ITEMS[i.item].hatchet && !i.charge && !i.broken);
    if(!hatchet && needDice(state,step,'combat',p.id,'Бросок боя — нарост'))return;
    if(!step.noContam && !step.contamFaces)gainContamination(state,p,1);
    if(hatchet){hatchet.broken=true;hatchet.charge=1;} else { const value=roll(state,COMBAT_DIE); if(step.contamFaces?.includes(value))gainContamination(state,p,1); }
    const hits=(hatchet?2:1)+(step.bonusHits||0);damageGerminator(state,id,hits);
    log(state,'🗡 Нарост получает '+hits+' ранений.','combat');next(state,then);
};
OPS['melee.hit'] = (state, step) => {
    const p = player(state, step.player);
    const it = state.intruders[step.target];
    const then = step.then || { op: 'turn.choose' };
    if (!it) { next(state, then); return; }
    // The Tactical Hatchet's printed effect replaces the combat roll entirely, so the die is not
    // even requested when it is used.
    const hatchet = p.items.find(i => ITEMS[i.item].hatchet && !i.charge && !i.broken);
    if (!hatchet && it.type !== 'larva' && !step.rerollResolved && needDice(state, step, 'combat', p.id, 'Бросок боя — ближний бой')) return;
    if (!hatchet && state.enemySet === 'voidseeders' && it.type === 'lair' && hasVoidWeakness(state, 'determination') && !step.rerollResolved) {
        const first = forcedRollOnce(state, step);
        ask(state, { kind: 'choice', player: p.id, title: 'Решительность: выпало ' + fmtRoll(first) + '. Перебросить кубик боя?',
            options: [{ id: 'reroll', label: 'Перебросить' }, { id: 'keep', label: 'Оставить' }] },
            { op: 'shoot.rerollAns', player: p.id, first, step: { ...step, answer: undefined } });
        return;
    }
    if (!step.noContam && !step.contamFaces) gainContamination(state, p, 1);
    log(state, '🗡 ' + pname(p) + ' атакует ' + intruderLabel(state, it) + ' в ближнем бою.', 'combat');
    if (hatchet) { hatchet.broken = true; hatchet.charge = 1; }
    // Printed: "Deal 2 Hits instead of rolling the Combat die, and place an Orange Malfunction
    // on this Weapon." — no die is rolled at all.
    const hits = (hatchet ? 2 : 1) + (step.bonusHits || 0);
    if (hatchet) log(state, 'Тактический топорик: 2 ранения без броска, оранжевая поломка на оружии.', 'combat');
    // 10.3: a Melee Attack deals 1 Hit and then makes a Combat roll, exactly like a shot — the
    // intruder dies on the same check. Only the Hatchet replaces the roll.
    const survived = hatchet ? !applyHitsNoRoll(state, it, hits)
        : !dealHits(state, p, it, hits, 0, { retaliate: false, contamFaces: step.contamFaces, forcedRoll: step.forcedRoll });
    if (survived && state.intruders[it.uid] && !step.noRetaliation && !(state.enemySet === 'voidseeders' && (it.type === 'lair' || it.room !== p.room))) {
        const weapons = p.items.filter(i => ITEMS[i.item].weapon);
        if (weapons.length) {
            ask(state, { kind: 'choice', player: p.id, title: 'Чужой выжил и отвечает атакой. Подставить оружие (первая поломка — жетон поломки; уже сломанное — уничтожается), чтобы избежать атаки?',
                options: [{ id: 'none', label: 'Принять атаку' }, ...weapons.map(w => ({ id: w.uid, label: (w.broken ? 'Уничтожить сломанное «' : 'Сломать «') + ITEMS[w.item].name + (w.broken ? '»' : '» (жетон поломки)') }))] },
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
    if (w) breakWeapon(state, p, w);
    next(state, step.then);
};

// ---------------------------------------------------------------------------------------------
// Pick up heavy objects
// ---------------------------------------------------------------------------------------------
OPS['pickup.start'] = (state, step) => {
    const p = player(state, step.player);
    const rs = room(state, p.room);
    if (!rs.objects.length) { next(state, { op: 'turn.choose' }); return; }
    // `object` comes from a click on the object itself; `free` is the slot the player picked there.
    if (step.object != null && rs.objects[Number(step.object)]) { next(state, { op: 'pickup.hand', player: p.id, object: Number(step.object), free: step.free }); return; }
    if (rs.objects.length === 1) { next(state, { op: 'pickup.hand', player: p.id, object: 0 }); return; }
    ask(state, { kind: 'choice', player: p.id, title: 'Что поднять?', options: rs.objects.map((o, i) => ({ id: String(i), label: objectName(o) })) },
        { op: 'pickup.object', player: p.id });
};
OPS['pickup.object'] = (state, step) => next(state, { op: 'pickup.hand', player: step.player, object: Number(step.answer) });
/** Ask which hand the object goes to and what already lies there (dropping it is free). */
OPS['pickup.hand'] = (state, step) => {
    const p = player(state, step.player);
    const rs = room(state, p.room);
    const o = rs.objects[step.object];
    if (!o) { next(state, { op: 'turn.choose' }); return; }
    if (step.free !== undefined) { next(state, { op: 'pickup.take', player: p.id, object: step.object, free: step.free }); return; }
    const slots = handSlots(state, p);
    const options = slots.map((s, k) => {
        const n = slots.length > 1 ? 'Слот ' + (k + 1) : 'Рука';
        if (s.kind === 'empty') return { id: 'slot:' + k, label: n + ': пусто', desc: 'Положить «' + objectName(o) + '»' };
        if (s.kind === 'filler') return { id: 'slot:' + k, label: n + ': ' + s.name + ' (двуручное)', desc: 'Выбросить «' + s.name + '» и взять объект' };
        return { id: 'slot:' + k, label: n + ': ' + s.name, desc: 'Выбросить «' + s.name + '» и взять объект (выброс бесплатный)',
            item: s.kind === 'item' ? s.ref.slice(5) : undefined };
    });
    ask(state, { kind: 'choice', player: p.id, title: 'Куда положить «' + objectName(o) + '»?', options }, { op: 'pickup.take', player: p.id, object: step.object });
};
OPS['pickup.take'] = (state, step) => {
    const p = player(state, step.player);
    const rs = room(state, p.room);
    const o = rs.objects[step.object];
    if (!o) { next(state, { op: 'turn.choose' }); return; }
    let free = step.free;
    if (free === undefined) {
        const slots = handSlots(state, p);
        const k = Number(String(step.answer || '').split(':')[1]);
        const slot = slots[k] || null;
        if (!slot || slot.kind === 'empty') free = null;
        else if (slot.kind === 'filler') { const real = slots.find(s => s.kind === 'item' && s.two); free = real ? real.ref : null; }
        else free = slot.ref;
    }
    if (free) dropHeavy(state, p, free);
    rs.objects.splice(step.object, 1);
    p.heavy.push(o);
    log(state, pname(p) + ' поднимает: ' + objectName(o) + '.', 'action');
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
        for (const i of p.items) if (!dropLocked(i.item)) opts.push({ id: o.id + ':item:' + i.uid, item: i.item, label: ITEMS[i.item].name + ' → ' + pname(o) });
        p.heavy.forEach((h, idx) => opts.push({ id: o.id + ':heavy:' + idx, label: ({ corpse: 'Труп', charCorpse: 'Труп персонажа', carcass: 'Туша', egg: 'Яйцо' })[h.type] + ' → ' + pname(o) }));
    }
    if (!opts.length) { next(state, { op: 'turn.choose' }); return; }
    ask(state, { kind: 'choice', player: p.id, title: 'Что и кому передать?', options: opts }, { op: 'trade.done', player: p.id });
};
OPS['trade.done'] = (state, step) => {
    const p = player(state, step.player);
    const [to, kind, key] = step.answer.split(':');
    const o = player(state, Number(to));
    // 14: a transfer needs the receiving character's agreement.
    if (!step.agreed) {
        ask(state, { kind: 'choice', player: o.id, title: pname(p) + ' хочет передать вам предмет. Принять?',
            options: [{ id: 'yes', label: 'Да, принять' }, { id: 'no', label: 'Нет' }] },
            { op: 'trade.consent', player: p.id, transfer: step.answer, then: step.then });
        return;
    }
    if (step.accepted === false) { log(state, pname(p) + ': передача отклонена.', 'minor'); next(state, step.then || { op: 'turn.choose' }); return; }
    if (kind === 'item') {
        const i = p.items.findIndex(x => x.uid === key);
        const it = p.items.splice(i, 1)[0];
        o.items.push(it);
        log(state, pname(p) + ' передаёт «' + ITEMS[it.item].name + '» → ' + pname(o) + '.', 'action');
    } else {
        const h = p.heavy.splice(Number(key), 1)[0];
        o.heavy.push(h);
        log(state, pname(p) + ' передаёт тяжёлый объект → ' + pname(o) + '.', 'action');
    }
    // The recipient must respect their own hand capacity immediately.
    if (heavyCount(o) > handLimit(o)) next(state, { op: 'wound.armCheck', player: o.id }, step.then || { op: 'turn.choose' });
    else next(state, step.then || { op: 'turn.choose' });
};
OPS['trade.consent'] = (state, step) => {
    if (step.answer === 'yes') next(state, { op: 'trade.done', player: step.player, answer: step.transfer, agreed: true, accepted: true, then: step.then });
    else { log(state, 'Передача отклонена.', 'minor'); next(state, step.then || { op: 'turn.choose' }); }
};
