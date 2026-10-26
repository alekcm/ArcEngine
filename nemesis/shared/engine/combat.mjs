// combat.mjs — intruder attacks, shooting, melee, hits and the Queen's health deck.

import { OPS, ask, next, log, player, pname, intrudersIn, playersInRoom, room, roomName, healthState, loseHealth, gainWound,
    gainContamination, killPlayer, discardCard, COMBAT_DIE, roll, fmtRoll, needDice, fx, removeIntruder, intruderLabel, INTRUDER_RANK,
    drawCards, placeFire, cardDef, orderIndex } from './core.mjs';
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
    if (it.type === 'larva') {
        log(state, 'Личинка атакует ' + pname(p) + '.', 'combat');
        gainContamination(state, p, 1);
        if (!p.larva) { p.larva = true; log(state, pname(p) + ' заражён личинкой!', 'bad'); }
        removeIntruder(state, it.uid, false);
        return;
    }
    // Reaction: Nerves of Steel (prevent) — offered automatically
    const nerves = p.hand.find(c => (cardDef(state, c) || {}).effect === 'preventAttack');
    if (nerves && !step.noReaction) {
        ask(state, { kind: 'choice', player: p.id, title: intruderLabel(state, it) + ' атакует вас. Сыграть «Стальные нервы»?',
            options: [{ id: 'yes', label: 'Да — предотвратить атаку' }, { id: 'no', label: 'Нет' }] },
            { ...step, op: 'attack.reaction', player: p.id, card: nerves });
        return;
    }
    resolveAttack(state, step, it, p);
};
OPS['attack.reaction'] = (state, step) => {
    const p = player(state, step.player);
    if (step.answer === 'yes') {
        discardCard(state, p, step.card);
        log(state, pname(p) + ' играет «Стальные нервы»: атака предотвращена.', 'good');
        return;
    }
    next(state, { ...step, op: 'attack', noReaction: true, answer: undefined });
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
    if (it.type === 'adult' && p.armor && !ITEMS[p.armor.item].heavyArmor && !effects.some(e => e.op === 'miss')) {
        ask(state, { kind: 'choice', player: p.id, title: 'Атака взрослого: «' + card.name + '». Сбросить броню и проигнорировать атаку?',
            options: [{ id: 'yes', label: 'Да, сбросить броню' }, { id: 'no', label: 'Нет, принять атаку' }] },
            { op: 'attack.armor', player: p.id, intruder: it.uid, cardId, moving: step.moving, dest: step.dest });
        return;
    }
    applyAttackEffects(state, effects, it, p, step);
}
OPS['attack.armor'] = (state, step) => {
    const p = player(state, step.player), it = state.intruders[step.intruder];
    if (step.answer === 'yes') { p.armor = null; log(state, pname(p) + ' сбрасывает броню: атака проигнорирована.', 'good'); return; }
    const card = ATTACK_BY_ID[step.cardId];
    let effects = card[it.type]; if (typeof effects === 'string') effects = card[effects];
    applyAttackEffects(state, effects, it, p, step);
};

function applyAttackEffects(state, effects, it, p, step) {
    for (const e of effects) {
        if (p.status !== 'active') return;
        const hs = healthState(p);
        switch (e.op) {
            case 'dmg': loseHealth(state, p, e.n, 'атака'); break;
            case 'wound': gainWound(state, p, e.n); break;
            case 'contam': gainContamination(state, p, 1); break;
            case 'dieIf': {
                const cond = e.state === 'heavy' ? hs === 'heavy' : (hs === 'injured' || hs === 'heavy');
                if (cond) { killPlayer(state, p, 'смертельная атака'); return; }
                break;
            }
            case 'if': {
                const cond = e.state === 'injured' ? hs === 'injured' : hs === e.state;
                applyAttackEffects(state, cond ? e.then : e.else, it, p, step);
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
}
OPS['attack.follow'] = (state, step) => {
    const it = state.intruders[step.intruder], p = player(state, step.player);
    if (!it || p.status !== 'active' || p.room !== step.dest) return;
    it.room = step.dest;
    log(state, INTRUDER_NAMES[it.type] + ' следует за ' + pname(p) + ' в ' + roomName(state, step.dest) + '.', 'combat');
};

// ---------------------------------------------------------------------------------------------
// Shooting
// ---------------------------------------------------------------------------------------------
OPS['shoot.start'] = (state, step) => {
    const p = player(state, step.player);
    const weapons = p.items.filter(i => ITEMS[i.item].weapon && i.ammo > 0 && !i.broken && (!step.onlyItem || i.item === step.onlyItem));
    if (!weapons.length) { log(state, 'Нет заряженного оружия.', 'bad'); next(state, step.then || { op: 'turn.choose' }); return; }
    if (weapons.length === 1) { next(state, { ...step, op: 'shoot.target', weapon: weapons[0].uid }); return; }
    ask(state, { kind: 'choice', player: p.id, title: 'Каким оружием стрелять?', options: weapons.map(w => ({ id: w.uid, label: ITEMS[w.item].name + ' (патронов ' + w.ammo + ')' })) },
        { ...step, op: 'shoot.weaponChosen' });
};
OPS['shoot.weaponChosen'] = (state, step) => next(state, { ...step, op: 'shoot.target', weapon: step.answer, answer: undefined });
OPS['shoot.target'] = (state, step) => {
    const p = player(state, step.player);
    const targets = intrudersIn(state, p.room);
    if (!targets.length) { log(state, 'Чужих в комнате нет.', 'bad'); next(state, step.then || { op: 'turn.choose' }); return; }
    if (targets.length === 1) { next(state, { ...step, op: 'shoot.fire', target: targets[0].uid }); return; }
    ask(state, { kind: 'choice', player: p.id, title: 'В кого стрелять?', options: targets.map(t => ({ id: t.uid, label: intruderLabel(state, t) })) },
        { ...step, op: 'shoot.targetChosen' });
};
OPS['shoot.targetChosen'] = (state, step) => next(state, { ...step, op: 'shoot.fire', target: step.answer, answer: undefined });
OPS['shoot.fire'] = (state, step) => {
    const p = player(state, step.player);
    const w = p.items.find(i => i.uid === step.weapon);
    const it = state.intruders[step.target];
    const then = step.then || { op: 'turn.choose' };
    if (!w || !it || w.ammo <= 0) { next(state, then); return; }
    if (it.type !== 'larva' && needDice(state, step, 'combat', p.id, 'Бросок боя — выстрел')) return;
    state.shotSeq = (state.shotSeq || 0) + 1;
    state.lastShot = { n: state.shotSeq, player: p.id, target: it.uid, room: p.room };
    const def = ITEMS[w.item], wd = def.weapon;
    w.ammo--;
    let hits = 1 + (step.bonusHits || 0) + (wd.bonusHit || 0);
    if (wd.firstShotBonus && !p.firstShotUsed) { hits++; p.firstShotUsed = true; }
    let mod = (wd.plusOne ? 1 : 0) + (p.wounds.includes('eyes') ? 1 : 0) + (step.rollBonus || 0);
    log(state, '🔫 ' + pname(p) + ' стреляет из «' + def.name + '» в ' + intruderLabel(state, it) + ' (патронов осталось ' + w.ammo + ').', 'combat');
    dealHits(state, p, it, hits, mod, { weapon: w, retaliate: false });
    if (wd.fire) placeFire(state, p.room, 'огнемёт');
    if (wd.spread) for (const o of intrudersIn(state, p.room)) if (o.uid !== it.uid && state.intruders[o.uid]) applyHitsNoRoll(state, o, 1);
    if (step.repeat && state.intruders[it.uid] === undefined && w.ammo > 0 && intrudersIn(state, p.room).length) { next(state, { ...step, op: 'shoot.target', answer: undefined }); return; }
    if (step.repeat && state.intruders[it.uid] !== undefined && w.ammo > 0) { next(state, { ...step, op: 'shoot.fire' }); return; }
    next(state, then);
};

/** Deal `hits` to an intruder, then the kill-check roll. */
export function dealHits(state, p, it, hits, mod, opts = {}) {
    if (it.type === 'larva') { log(state, 'Личинка погибает.', 'good'); removeIntruder(state, it.uid, false); return true; }
    if (it.type === 'queen') return queenHits(state, p, it, hits, mod);
    it.hits += hits;
    const r = roll(state, COMBAT_DIE);
    const val = r === 'crit' ? 'crit' : r + mod;
    log(state, '🎲 Бой: ' + fmtRoll(r) + (mod ? ' +' + mod + ' = ' + val : '') + ' против ранений ' + it.hits + '.', 'combat');
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
function applyHitsNoRoll(state, it, n) {
    if (it.type === 'larva') { removeIntruder(state, it.uid, false); log(state, 'Личинка погибает.', 'good'); return; }
    if (it.type === 'queen') { state.queenHits += n; log(state, 'Королева получает ' + n + ' ранений (всего ' + state.queenHits + ').', 'combat'); if (state.queenHits >= 6) next(state, { op: 'queen.card', player: null }); return; }
    it.hits += n;
    log(state, INTRUDER_NAMES[it.type] + ' получает ' + n + ' ранений (всего ' + it.hits + ').', 'combat');
}
function onKill(state, p, opts) {
    if (opts.weapon && ITEMS[opts.weapon.item].weapon.drawOnKill && !p.rifleDrawUsed) { p.rifleDrawUsed = true; drawCards(state, p, 1); }
}

function queenHits(state, p, it, hits, mod) {
    state.queenHits += hits;
    const r = roll(state, COMBAT_DIE);
    const val = r === 'crit' ? 'crit' : r + mod;
    log(state, '🎲 Бой с Королевой: ' + fmtRoll(r) + (mod ? ' +' + mod : '') + ', ранений на треке ' + state.queenHits + '.', 'combat');
    if (val === 'crit' || val <= state.queenHits || state.queenHits >= 6) next(state, { op: 'queen.card', player: p.id });
    else log(state, 'Королева держится.', 'combat');
    return false;
}
OPS['queen.card'] = (state, step) => {
    if (!state.queenDeck.length) return;
    const idx = state.queenDeck.shift();
    const card = QUEEN_CARDS[idx];
    fx(state, { type: 'queen', name: card.name, text: card.text });
    log(state, '👑 Карта здоровья Королевы: «' + card.name + '» — ' + card.text, 'combat');
    if (card.extra) state.queenDeck.splice(0, card.extra);
    state.queenHits = 0;
    const q = Object.values(state.intruders).find(i => i.type === 'queen');
    if (!state.queenDeck.length) {
        state.queenDead = true;
        if (q) removeIntruder(state, q.uid, true);
        log(state, '👑 КОРОЛЕВА МЕРТВА!', 'good');
        return;
    }
    log(state, 'Карт здоровья Королевы осталось: ' + state.queenDeck.length + '.', 'combat');
    if (q && card.repel) {
        const exits = state.ship.rooms[q.room].exits;
        if (exits.length) { const e = exits[0]; q.room = e.to; log(state, 'Королева отступает в ' + roomName(state, e.to) + '.', 'combat'); }
    }
    if (q && card.rage) next(state, { op: 'attack', intruder: q.uid });
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
    if (it.type !== 'larva' && needDice(state, step, 'combat', p.id, 'Бросок боя — ближний бой')) return;
    if (!step.noContam) gainContamination(state, p, 1);
    log(state, '🗡 ' + pname(p) + ' атакует ' + intruderLabel(state, it) + ' в ближнем бою.', 'combat');
    const survived = !dealHits(state, p, it, 1 + (step.bonusHits || 0), 0, { retaliate: false });
    if (survived && state.intruders[it.uid] && !step.noRetaliation) {
        const weapons = p.items.filter(i => ITEMS[i.item].weapon && !i.broken);
        if (weapons.length) {
            ask(state, { kind: 'choice', player: p.id, title: 'Чужой выжил и отвечает атакой. Подставить оружие (оранжевая поломка), чтобы избежать атаки?',
                options: [{ id: 'none', label: 'Принять атаку' }, ...weapons.map(w => ({ id: w.uid, label: 'Сломать «' + ITEMS[w.item].name + '»' }))] },
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
    const [to, kind, key] = step.answer.split(':');
    const o = player(state, Number(to));
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
    next(state, { op: 'turn.choose' });
};
