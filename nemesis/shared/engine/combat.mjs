// combat.mjs — intruder attacks, shooting, melee, hits and the Queen's health deck.

import { OPS, ask, next, log, player, pname, intrudersIn, playersInRoom, room, roomName, healthState, loseHealth, gainWound,
    gainContamination, killPlayer, discardCard, COMBAT_DIE, roll, fmtRoll, needDice, fx, removeIntruder, intruderLabel, INTRUDER_RANK,
    drawCards, placeFire, placeNoise, cardDef, orderIndex } from './core.mjs';
import { repelIntruder } from './intruders.mjs';
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
    // Reactions that prevent the attack: Nerves of Steel, Assault Shotgun (all ammo), Bayonet (marker)
    const nerves = p.hand.find(c => (cardDef(state, c) || {}).effect === 'preventAttack');
    const opts = [];
    if (nerves) opts.push({ id: 'card', label: 'Сыграть «Стальные нервы»' });
    for (const i of p.items) {
        const d = ITEMS[i.item];
        if (d.preventAttack === 'allAmmo' && i.ammo > 0 && !i.broken) opts.push({ id: 'item:' + i.uid, label: '«' + d.name + '»: сбросить все патроны (' + i.ammo + ') — 1 ранение чужому' });
        if (d.preventAttack === 'marker' && !i.charge && !i.broken) opts.push({ id: 'item:' + i.uid, label: '«' + d.name + '»: положить жетон' });
    }
    if (opts.length && !step.noReaction) {
        opts.push({ id: 'no', label: 'Принять атаку' });
        ask(state, { kind: 'choice', player: p.id, title: intruderLabel(state, it) + ' атакует вас. Предотвратить?', options: opts },
            { ...step, op: 'attack.reaction', player: p.id, card: nerves });
        return;
    }
    resolveAttack(state, step, it, p);
};
OPS['attack.reaction'] = (state, step) => {
    const p = player(state, step.player);
    if (step.answer === 'card' && step.card) {
        discardCard(state, p, step.card);
        log(state, pname(p) + ' играет «Стальные нервы»: атака предотвращена.', 'good');
        return;
    }
    if (String(step.answer).startsWith('item:')) {
        const i = p.items.find(x => x.uid === step.answer.slice(5));
        const it = state.intruders[step.intruder];
        if (i && ITEMS[i.item].preventAttack === 'allAmmo') { i.ammo = 0; if (it) applyHitsNoRoll(state, it, 1); }
        else if (i) i.charge = 1;
        log(state, pname(p) + ': «' + ITEMS[i.item].name + '» — атака предотвращена.', 'good');
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
    if (it.type === 'adult' && p.armor && ITEMS[p.armor.item].deck !== 'support' && !effects.some(e => e.op === 'miss')) {
        ask(state, { kind: 'choice', player: p.id, title: 'Атака взрослого: «' + card.name + '». Сбросить броню и проигнорировать атаку?',
            options: [{ id: 'yes', label: 'Да, сбросить броню' }, { id: 'no', label: 'Нет, принять атаку' }] },
            { op: 'attack.armor', player: p.id, intruder: it.uid, phantom: it.uid === '_phantom' ? it : undefined, cardId, moving: step.moving, dest: step.dest });
        return;
    }
    applyAttackEffects(state, effects, it, p, step);
}
OPS['attack.armor'] = (state, step) => {
    const p = player(state, step.player), it = step.phantom || state.intruders[step.intruder];
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
/** Attack from an intruder that is not on the board (Survivor's Vents): draws and applies an attack card of the given type. */
export function phantomAttack(state, p, type) {
    resolveAttack(state, { noReaction: true }, { uid: '_phantom', type, room: p.room, hits: 0 }, p);
}
OPS['shoot.critDiscard'] = (state, step) => { const p = player(state, step.player); if (!p.hand.length) { next(state, step.then); return; } ask(state, { kind: 'cards', player: p.id, title: 'Пистолет ксенобиолога: КРИТ — сбросьте 1 карту', cards: [...p.hand], min: 1, max: 1 }, { op: 'card.discardPicked', player: p.id, then: step.then }); };
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
    const opts = [{ id: 'normal', label: 'Обычный выстрел' }];
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
    for (const it of intrudersIn(state, r)) if (state.intruders[it.uid]) applyHitsNoRoll(state, it, 1);
    for (const o of playersInRoom(state, r)) gainWound(state, o, 1);
    next(state, step.then);
};
OPS['shoot.target'] = (state, step) => {
    const p = player(state, step.player);
    const w = p.items.find(i => i.uid === step.weapon);
    const sniper = w && ITEMS[w.item].weapon.sniper;
    let targets = intrudersIn(state, p.room);
    if (sniper) for (const e of state.ship.rooms[p.room].exits) if (state.ship.corridors[e.corridor].door !== 'closed') targets = targets.concat(intrudersIn(state, e.to));
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
    dealHits(state, p, it, hits, mod, { weapon: w, retaliate: false });
    const rolled = state.lastRoll && state.lastRoll.die === 'combat' ? state.lastRoll.value : null;
    if (wd.fire) placeFire(state, p.room, 'огнемёт');
    if (wd.fireOn && wd.fireOn.includes(rolled)) placeFire(state, p.room, 'огнемёт');
    if (wd.noiseOn && wd.noiseOn.includes(rolled)) { const c = state.ship.rooms[p.room].exits[0]; if (c) { placeNoise(state, c.corridor); log(state, 'Звуковая пушка: шум в коридоре ' + c.corridor + '.', 'noise'); } }
    if (wd.plasma && [2, 6].includes(rolled)) { const m = w.charge || 0; if (m) loseHealth(state, p, 2 * m, 'перегрев плазмы'); w.charge = m + 1; log(state, 'Плазменная пушка перегревается: жетонов ' + w.charge + '.', 'bad'); }
    if (wd.spread) for (const o of intrudersIn(state, p.room)) if (o.uid !== it.uid && state.intruders[o.uid]) applyHitsNoRoll(state, o, 1);
    if (step.repeat && state.intruders[it.uid] === undefined && w.ammo > 0 && intrudersIn(state, p.room).length) { next(state, { ...step, op: 'shoot.target', answer: undefined }); return; }
    if (step.repeat && state.intruders[it.uid] !== undefined && w.ammo > 0) { next(state, { ...step, op: 'shoot.fire' }); return; }
    if (wd.critDiscard && state.lastRoll && state.lastRoll.value === 'crit' && p.hand.length) { next(state, { op: 'shoot.critDiscard', player: p.id, then }); return; }
    next(state, then);
};

/** Deal `hits` to an intruder, then the kill-check roll. */
export function dealHits(state, p, it, hits, mod, opts = {}) {
    if (it.type === 'larva') { log(state, 'Личинка погибает.', 'good'); removeIntruder(state, it.uid, false); return true; }
    if (it.type === 'queen') return queenHits(state, p, it, hits, mod);
    it.hits += hits;
    const wd = opts.weapon ? ITEMS[opts.weapon.item].weapon : {};
    let r = roll(state, COMBAT_DIE);
    if (wd.critOn2 && r === 2) { r = 'crit'; log(state, 'Штурмовая винтовка: «2» считается КРИТОМ.', 'combat'); }
    if (wd.plusOn5 && r === 5) { it.hits++; log(state, 'BF-пушка: «5» — дополнительное ранение.', 'combat'); }
    let val = r === 'crit' ? 'crit' : r + mod;
    log(state, '🎲 Бой: ' + fmtRoll(r) + (mod ? ' +' + mod + ' = ' + val : '') + ' против ранений ' + it.hits + '.', 'combat');
    if (wd.reroll && val !== 'crit' && val > it.hits) {
        r = roll(state, COMBAT_DIE); val = r === 'crit' ? 'crit' : r + mod;
        log(state, '🎲 Умная винтовка — переброс: ' + fmtRoll(r) + (mod ? ' +' + mod + ' = ' + val : '') + '.', 'combat');
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
    fx(state, { type: 'queen', card: card.id, name: card.name, text: card.text });
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
    const hatchet = p.items.find(i => ITEMS[i.item].hatchet && !i.charge && !i.broken);
    if (hatchet) { hatchet.charge = 1; log(state, 'Тактический топорик: 2 ранения, жетон положен на оружие.', 'combat'); }
    const survived = !dealHits(state, p, it, (hatchet ? 2 : 1) + (step.bonusHits || 0), 0, { retaliate: false });
    if (survived && state.intruders[it.uid] && !step.noRetaliation && !hatchet) {
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
