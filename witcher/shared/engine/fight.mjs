// Fight with a monster (База.md pp. 20–27), monster abilities (Монстры/Карты монстров.md),
// elixirs (Доп колоды/Зелья.md), specializations (Ведьмаки/Планшеты.md) and the fight-time
// trophies. Every fight step is tagged { fight: 1 } so the end of a fight can drop the rest.
import { STEPS, push, ask } from './flow.mjs';
import {
    CARDS, MONSTER, ATTACK, LOC, card, log, fx, drawCards, removeFrom, shuffle, randInt, d6, skillVal, maxShield, clampShield, potionOf,
} from './util.mjs';
import { SPEC_TABLE, HAND_LIMIT, ELIXIR_LIMIT, TERRAIN_NAME, COLOR_SHORT } from '../data/rules-data.mjs';
import { hasTrophy, hasWitcherTrophy, hasSkillTrophy, ACTIVE_EFFECTS, hasGear, keepOf } from './effects.mjs';
import { SKILL_GEN } from './turn.mjs';
import { bombsOn } from './bombs.mjs';
import { bombOf } from '../data/bombs-data.mjs';
import { MUTAGEN } from '../data/trail-data.mjs';
import { BIG } from '../data/vuln-data.mjs';
import { SKILL_VALUE } from '../data/rules-data.mjs';
import { isSpecial, freshAttackDeck, onMonsterAppears, restrictError, endOfTurnDiscards, afterCombo25, vulnOn, specialName } from './vuln.mjs';

const F = (op, args) => ({ op, fight: 1, ...(args || {}) });
const fp = (state) => state.players[state.fight.seat];
const alive = (state) => state.fight && !state.fight.over;

// ---------------------------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------------------------
export function monsterFightError(state, p) {
    const slot = state.slots.findIndex(s => s.mon && s.token === p.loc);
    if (slot < 0) return 'В этой локации нет монстра';
    if (state.slots[slot].mon === 'MON-06' && !p.elixirs.length) return 'Архиспора: чтобы начать битву, нужно сбросить 1 эликсир';
    if (state.solo && state.solo && soloLastMonsterLocked(state, p, slot)) return 'Одиночная игра: последнего монстра можно атаковать только с трофеем за навык';
    return null;
}
function soloLastMonsterLocked(state, p, slot) {
    const left = state.slots.filter(s => s.mon).length;
    return left === 1 && p.monstersDefeated === 2 && !p.trophies.some(t => t.kind === 'skill');
}

/** The monster whose special ability is in force: null once «Чёртов гриб» switched it off. */
export const ab = (f) => (f && !f.noAbility ? f.mon : null);

STEPS.fightStart = (state, step) => {
    const p = state.players[step.seat];
    const slotIdx = state.slots.findIndex(s => s.mon && s.token === p.loc);
    const slot = state.slots[slotIdx];
    const mon = MONSTER[slot.mon];
    const n = state.players.length;
    const controller = n === 1 ? null : (p.seat - 1 + n) % n;
    state.turn.phase = 2;
    state.fight = {
        kind: 'monster', seat: p.seat, slot: slotIdx, mon: mon.id, level: mon.level, terrain: slot.terrain,
        controller, chooser: controller, life: [], monDiscard: [], turn: null, wTurns: 0, mTurns: 0,
        elixirsUsed: 0, usedElixirs: [], usedBombs: [], once: {}, cur: null, lastCombo: null, lastAttack: null, stage: 'busy', over: null,
        track: !!p.trackTokens[slot.terrain], pendingHarpy: false,
        // «Уязвимости и особые атаки»: dice on the monster card, restrictions of the next witcher /
        // monster turn left by special attacks and discard abilities, whole-fight effects.
        vuln: vulnOn(state) && !!BIG[mon.id], dice: 0, nextW: null, nextM: null, mCur: null, whole: {},
    };
    log(state, `${p.name} вступает в битву: ${mon.name} (уровень ${mon.level}, жизнь ${mon.life})`, { kind: 'fight' });
    fx(state, { k: 'fightStart', seat: p.seat, mon: mon.id });
    push(state,
        ...(mon.id === 'MON-06' ? [F('archesporeAsk')] : []),
        { op: 'trapCheck', seat: p.seat, on: 'fightStart' },
        F('mushroomAsk'), F('preLife'), F('formLife'), F('postLife'), F('firstTurn'));
};

STEPS.archesporeAsk = (state) => {
    const p = fp(state);
    if (p.elixirs.length === 1 || p.bot) { push(state, F('archesporeDo', { ids: [p.elixirs[0]] })); return; }
    ask(state, { seat: p.seat, kind: 'cards', from: 'elixirs', ids: p.elixirs.slice(), min: 1, max: 1, title: 'Архиспора', text: 'Чтобы начать битву, сбросьте 1 эликсир.', op: 'archesporeDo', args: { fight: 1 } });
};
STEPS.archesporeDo = (state, step) => {
    const p = fp(state);
    removeFrom(p.elixirs, step.ids[0]);
    state.elixirDiscard.push(step.ids[0]);
    log(state, `${p.name} сбрасывает эликсир «${potionOf(step.ids[0]).name}» (Архиспора)`);
};

/** "Before life pools are formed": monster abilities, then the player's trophies. */
STEPS.preLife = (state) => {
    const f = state.fight, p = fp(state);
    switch (ab(f)) {
        case 'MON-01': if (p.hand.length) push(state, F('discardFromHandAsk', { n: 1, why: 'Главоглаз: сбросьте 1 карту из руки' })); break;
        case 'MON-07': loseShield(state, p, 1, 'Баргест'); break;
        case 'MON-12': loseShield(state, p, 2, 'Волколак'); break;
        case 'MON-13': loseShield(state, p, p.hand.length, 'Стрыга'); break;
        case 'MON-23': push(state, { op: 'lowerSkill', seat: p.seat, skill: 'defense', fight: 1 }); break;
    }
    // Trophies (auto when purely beneficial).
    const after = [];
    if (hasTrophy(p, 'MON-01') && p.hand.length <= 1) { const g = drawCards(state, p, 2); log(state, `${p.name}: трофей «Главоглаз» — взято ${g} карт(ы)`); }
    if (hasTrophy(p, 'MON-05') && !p.elixirs.length) after.push({ op: 'gainElixir', seat: p.seat, n: 2, why: 'трофей «Гнездо накеров»', fight: 1 });
    if (hasTrophy(p, 'MON-16')) { p.shield = Math.min(maxShield(state, p), p.shield + 2); log(state, `${p.name}: трофей «Гнездо утопцев» — щит ${p.shield}`); }
    if (hasTrophy(p, 'MON-17')) after.push({ op: 'gainElixir', seat: p.seat, n: 1, why: 'трофей «Экимма»', fight: 1 });
    if (hasTrophy(p, 'MON-02') && p.hand.length) after.push(F('harpyAsk'));
    if (hasTrophy(p, 'MON-23') && p.hand.length && p.deck.length) after.push(F('spinnerAsk'));
    push(state, ...after);
};
function loseShield(state, p, n, why) {
    const before = p.shield;
    p.shield = Math.max(0, p.shield - n);
    if (before !== p.shield) log(state, `${p.name}: щит ${before} → ${p.shield} (${why})`);
}
STEPS.harpyAsk = (state) => {
    const p = fp(state);
    ask(state, { seat: p.seat, kind: 'cards', from: 'hand', ui: 'hand', ids: p.hand.slice(), min: 0, max: 1, title: 'Трофей «Гарпия»', text: 'Можно сбросить 1 карту из руки, чтобы после формирования запасов жизней нанести 2 урона.', op: 'harpyDo', args: { fight: 1 } });
};
STEPS.harpyDo = (state, step) => {
    if (!step.ids.length) return;
    const p = fp(state);
    removeFrom(p.hand, step.ids[0]); p.discard.push(step.ids[0]);
    state.fight.pendingHarpy = true;
    log(state, `${p.name}: трофей «Гарпия» — сброшена карта, 2 урона после формирования запасов`);
};
STEPS.spinnerAsk = (state) => {
    const p = fp(state);
    ask(state, { seat: p.seat, kind: 'cards', from: 'hand', ui: 'hand', ids: p.hand.slice(), min: 0, max: 1, title: 'Трофей «Пряха»', text: 'Можно поменять 1 карту из руки на любую карту из колоды. Выберите карту руки (или пропустите).', op: 'spinnerPick', args: { fight: 1 } });
};
STEPS.spinnerPick = (state, step) => {
    if (!step.ids.length) return;
    const p = fp(state);
    ask(state, { seat: p.seat, kind: 'cards', from: 'deck', ids: p.deck.slice(), min: 1, max: 1, title: 'Трофей «Пряха»', text: 'Выберите карту из колоды, которую возьмёте в руку.', op: 'spinnerDo', args: { fight: 1, give: step.ids[0] } });
};
STEPS.spinnerDo = (state, step) => {
    const p = fp(state);
    removeFrom(p.hand, step.give); removeFrom(p.deck, step.ids[0]);
    p.hand.push(step.ids[0]); p.deck.push(step.give); shuffle(state, p.deck);
    log(state, `${p.name}: трофей «Пряха» — обмен карты с колодой`);
};

STEPS.formLife = (state) => {
    const f = state.fight, p = fp(state);
    p.deck.push(...p.discard.splice(0));
    shuffle(state, p.deck);
    const mon = MONSTER[f.mon];
    shuffle(state, state.attackDeck);
    f.life = state.attackDeck.splice(0, mon.life);
    log(state, `Запасы жизней: ${p.name} — ${p.deck.length + p.hand.length} карт, ${mon.name} — ${f.life.length}`);
    fx(state, { k: 'lifeFormed', seat: p.seat });
};

STEPS.postLife = (state) => {
    const f = state.fight, p = fp(state);
    switch (ab(f)) {
        case 'MON-16': if (p.deck.length) push(state, F('drownerAsk')); break;
        case 'MON-17': if (!f.track && p.hand.length) push(state, F('discardFromHandAsk', { n: 1, why: 'Экимма: нет жетона следа — сбросьте 1 карту из руки' })); break;
        case 'MON-31': if (p.hand.length > 3) push(state, F('discardFromHandAsk', { n: p.hand.length - 3, why: 'Сирена: в руке не больше 3 карт' })); break;
    }
    if (f.pendingHarpy) push(state, F('dealDamage', { n: 2, src: 'трофей «Гарпия»' }));
    // Гроббо (CONT80-37): once per fight, after the life pools are formed — draw 1 card.
    if (hasGear(p, 'CONT80-37') && !f.once.g37) { f.once.g37 = true; const n = drawCards(state, p, 1); if (n) log(state, `${p.name}: Гроббо — +1 карта`); }
};
STEPS.drownerAsk = (state) => {
    const p = fp(state);
    ask(state, { seat: p.seat, kind: 'cards', from: 'deck', ids: p.deck.slice(), min: 1, max: 1, title: 'Гнездо утопцев', text: 'Выберите и сбросьте 1 любую карту из своей колоды (колода перемешивается).', op: 'drownerDo', args: { fight: 1 } });
};
STEPS.drownerDo = (state, step) => {
    const p = fp(state);
    removeFrom(p.deck, step.ids[0]); p.discard.push(step.ids[0]); shuffle(state, p.deck);
    log(state, `${p.name} сбрасывает «${CARDS[step.ids[0]].name}» из колоды (Гнездо утопцев)`);
};

STEPS.discardFromHandAsk = (state, step) => {
    const p = fp(state);
    const n = Math.min(step.n, p.hand.length);
    if (!n) return;
    if (n === p.hand.length && !step.choice) { push(state, F('discardFromHandDo', { ids: p.hand.slice(), why: step.why, attack: step.attack })); return; }
    ask(state, { seat: p.seat, kind: 'cards', from: 'hand', ui: 'hand', ids: p.hand.slice(), min: n, max: n, title: 'Сброс', text: step.why, op: 'discardFromHandDo', args: { fight: 1, why: step.why, attack: step.attack } });
};
STEPS.discardFromHandDo = (state, step) => {
    const p = fp(state);
    for (const id of step.ids) { removeFrom(p.hand, id); p.discard.push(id); }
    fx(state, { k: 'discard', seat: p.seat, ids: step.ids });
    log(state, `${p.name} сбрасывает из руки: ${step.ids.map(id => '«' + CARDS[id].name + '»').join(', ')}`);
    if (step.attack) onAttackDiscard(state, p, step.ids, false);
};

STEPS.firstTurn = (state) => {
    const f = state.fight;
    if (f.track) { log(state, 'Есть жетон следа — ведьмак ходит первым'); push(state, F('witcherTurn')); }
    else if (hasGear(fp(state), 'CONT79-23')) { log(state, 'Кая: в битве с монстром ведьмак всегда ходит первым'); push(state, F('witcherTurn')); }
    else { log(state, 'Жетона следа нет — первым ходит монстр'); push(state, F('monsterTurn')); }
};

// ---------------------------------------------------------------------------------------------
// Damage to the monster
// ---------------------------------------------------------------------------------------------
/** Deal damage to the monster: discard that many cards from the top of its life pool. */
STEPS.dealDamage = (state, step) => {
    if (!alive(state)) return;
    hitMonster(state, step.n, step.src);
};
function hitMonster(state, n, src, opts = {}) {
    const f = state.fight, p = fp(state);
    if (n <= 0) return 0;
    const cur = f.cur;
    if (cur && f.wTurns === 1 && f.turn === 'witcher') {
        if (ab(f) === 'MON-19' && !f.track) { log(state, `Покаянник: в первый ход без жетона следа урон игнорируется (${n})`); return 0; }
        if (ab(f) === 'MON-27') { const room = Math.max(0, 1 - cur.dmgDealt); if (n > room) { log(state, `Жагница: в первый ход можно нанести только 1 урон`); n = room; } }
        if (ab(f) === 'MON-03') { const room = Math.max(0, 2 - cur.dmgDealt); if (n > room) { log(state, `Гнездо гулей: в первый ход сбрасывается не больше 2 карт`); n = room; } }
    }
    // Card by card: damage the monster ignores this turn (discard abilities, special attacks), and a
    // special combat card leaving the pool stops the damage until its discard ability is resolved.
    const mine = cur && f.turn === 'witcher';
    let k = 0, ignored = 0, special = null;
    while (n > 0 && f.life.length) {
        n--;
        if (mine && cur.ign && ignorePoint(cur.ign)) { ignored++; continue; }
        const id = f.life.shift();
        f.monDiscard.push(id);
        k++;
        if (f.vuln && mine && isSpecial(id)) { special = id; break; }
    }
    if (cur) cur.dmgDealt += k;
    if (ignored) log(state, `Монстр игнорирует ${ignored} урона`);
    if (k) {
        log(state, `${p.name} наносит ${k} урона${src ? ' (' + src + ')' : ''}: у монстра осталось ${f.life.length}`);
        fx(state, { k: 'monsterHit', n: k, left: f.life.length });
    }
    if (f.life.length === 0) { endFight(state, 'win'); return k; }
    if (k > 0 && !opts.noTrigger) onOpponentDiscarded(state, p);
    if (special) push(state, F('discAbility', { id: special }), ...(n > 0 ? [F('dealDamage', { n, src })] : []));
    return k;
}
/** One point of damage ignored? `ign` = { all, n, half, hc } of the current witcher turn. */
function ignorePoint(ign) {
    if (ign.all) return true;
    if (ign.n > 0) { ign.n--; return true; }
    if (ign.half) { ign.hc = (ign.hc || 0) + 1; return ign.hc % 2 === 1; }
    return false;
}
/** "When your opponent discards at least 1 card because of your attack" — Viper. */
function onOpponentDiscarded(state, p) {
    const f = state.fight;
    if (p.school === 'viper' && !f.once.spec && f.life.length) {
        f.once.spec = true;
        const [look, send] = SPEC_TABLE.viper[p.skills.spec - 1];
        const top = f.life.slice(0, look);
        log(state, `${p.name}: «Отравленный клинок» — смотрит ${top.length} верхних карт монстра`);
        if (send > 0 && top.length) {
            push(state, F('viperAsk', { n: Math.min(send, top.length), ids: top }));
        }
    }
    if (hasWitcherTrophy(p, 'viper') && !f.once.wViper) {
        f.once.wViper = true;
        if (f.cur) f.cur.drawMod -= 1;
        push(state, F('dealDamage', { n: 1, src: 'трофей Змеи (−1 карта в конце хода)' }));
    }
}
STEPS.viperAsk = (state, step) => {
    const p = fp(state);
    const f = state.fight;
    const ids = step.ids.filter(id => f.life.includes(id));
    if (!ids.length) return;
    ask(state, { seat: p.seat, kind: 'cards', from: 'monsterTop', ids, min: Math.min(step.n, ids.length), max: Math.min(step.n, ids.length), title: 'Отравленный клинок', text: `Отправьте ${step.n} из просмотренных карт монстра в его сброс. Остальные вернутся на верх в прежнем порядке.`, op: 'viperDo', args: { fight: 1 } });
};
STEPS.viperDo = (state, step) => {
    const f = state.fight;
    for (const id of step.ids) { removeFrom(f.life, id); f.monDiscard.push(id); }
    log(state, `Отравленный клинок: в сброс монстра отправлено ${step.ids.length}, осталось ${f.life.length}`);
    fx(state, { k: 'monsterHit', n: step.ids.length, left: f.life.length });
    if (!f.life.length) endFight(state, 'win');
};

// ---------------------------------------------------------------------------------------------
// Witcher's fight turn
// ---------------------------------------------------------------------------------------------
STEPS.witcherTurn = (state) => {
    if (!alive(state)) return;
    const f = state.fight, p = fp(state);
    f.turn = 'witcher';
    f.wTurns++;
    const r = f.nextW || {};
    f.nextW = null;
    f.cur = {
        drawMod: 0, shieldGain: 0, dmgDealt: 0, onlyOne: false, blizzard: false, forcedFirst: null, combatZero: false, combo: null,
        // «Уязвимости и особые атаки»: restrictions of this turn and the discard-ability bookkeeping.
        r, ign: { all: false, n: r.ignoreDmg || 0, half: false, hc: 0 }, harpy: [], takenBack: [], comboDone: false, after25: 0, mistTop: 0, noDrawFx: false,
    };
    fx(state, { k: 'fightTurn', who: 'witcher', n: f.wTurns });
    if (r.skip) {
        log(state, `${p.name} пропускает свой ход битвы (особая атака)`);
        push(state, F('afterWitcherTurn'));
        return;
    }
    if (r.drawLess) f.cur.drawMod -= r.drawLess;
    const first = f.wTurns === 1;
    if (first) {
        if (ab(f) === 'MON-02') f.cur.combatZero = true;
        if (hasWitcherTrophy(p, 'cat') && !f.once.wCat) { f.once.wCat = true; drawCards(state, p, 1); log(state, `${p.name}: трофей Кота — +1 карта`); }
        if (hasSkillTrophy(p, 'alchemy') && !f.once.sAlch) { f.once.sAlch = true; push(state, { op: 'gainElixir', seat: p.seat, n: 2, why: 'трофей алхимии', fight: 1 }); }
        if (hasTrophy(p, 'MON-27') && !f.once.t27) { f.once.t27 = true; drawCards(state, p, 1); push(state, F('dealDamage', { n: 1, src: 'трофей «Жагница»' })); }
        if (hasTrophy(p, 'MON-09') && !f.once.t09) {
            f.once.t09 = true; const r = d6(state); fx(state, { k: 'd6', v: r, seat: p.seat });
            const dmg = r >= 6 ? 3 : r >= 3 ? 2 : 0;
            log(state, `${p.name}: трофей «Грифон» — бросок ${r}${dmg ? `, ${dmg} урона` : ', нет эффекта'}`);
            if (dmg) push(state, F('dealDamage', { n: dmg, src: 'трофей «Грифон»' }));
        }
        if (hasTrophy(p, 'MON-22') && !f.once.t22) {
            f.once.t22 = true; const r = d6(state); fx(state, { k: 'd6', v: r, seat: p.seat });
            const n = r >= 6 ? 3 : r >= 4 ? 2 : r >= 2 ? 1 : 0;
            if (n) drawCards(state, p, n);
            log(state, `${p.name}: трофей «Полуночница» — бросок ${r}${n ? `, +${n} карт(ы)` : ', нет эффекта'}`);
        }
        if (ab(f) === 'MON-22' && p.hand.length) {
            f.cur.forcedFirst = p.hand[randInt(state, p.hand.length)];
            log(state, `Полуночница: первой картой комбинации будет случайная карта — «${CARDS[f.cur.forcedFirst].name}»`);
        }
    }
    if (r.deckFirst && p.deck.length) {
        const id = p.deck.shift(); p.hand.push(id); f.cur.forcedFirst = id;
        log(state, `Особая атака: первой картой комбинации будет верхняя карта колоды — «${CARDS[id].name}»`);
    } else if ((r.randomFirst || r.deckFirst) && p.hand.length) {
        f.cur.forcedFirst = p.hand[randInt(state, p.hand.length)];
        log(state, `Особая атака: первой картой комбинации будет случайная карта из руки — «${CARDS[f.cur.forcedFirst].name}»`);
    }
    if (hasSkillTrophy(p, 'combat') && !p.deck.length) push(state, F('dealDamage', { n: 1, src: 'трофей сражения: колода пуста' }));
    push(state, F('awaitWitcher'));
};
STEPS.awaitWitcher = (state) => {
    if (!alive(state)) return;
    bearCheck(state);
    state.fight.stage = 'witcher';
};
/** Bear specialization and the Bear witcher trophy trigger by themselves at shield 0 on your fight turn. */
function bearCheck(state) {
    const f = state.fight, p = fp(state);
    if (!f || f.turn !== 'witcher' || p.shield !== 0) return;
    if (p.school === 'bear' && !f.once.spec) {
        f.once.spec = true;
        const [sh, dr] = SPEC_TABLE.bear[p.skills.spec - 1];
        p.shield = Math.min(maxShield(state, p), p.shield + sh);
        const g = drawCards(state, p, dr);
        log(state, `${p.name}: «Доспехи» — щит +${sh}, +${g} карт(ы)`);
        fx(state, { k: 'spec', seat: p.seat });
        afterSpec(state, p);
    }
    if (p.shield === 0 && hasWitcherTrophy(p, 'bear') && !f.once.wBear) {
        f.once.wBear = true;
        p.shield = Math.min(maxShield(state, p), 1);
        log(state, `${p.name}: трофей Медведя — щит +1`);
    }
}
function afterSpec(state, p) {
    const f = state.fight;
    if (hasSkillTrophy(p, 'spec') && !f.once.sSpec) {
        f.once.sSpec = true;
        if (p.bot) { push(state, F('specTrophyDo', { choice: 'draw' })); return; }
        ask(state, { seat: p.seat, kind: 'choice', title: 'Трофей специализации', text: 'Вы использовали специализацию: выберите бонус.', options: [{ id: 'dmg', label: 'Нанести 1 урон' }, { id: 'draw', label: 'Взять 2 карты' }], op: 'specTrophyDo', args: { fight: 1 } });
    }
}
STEPS.specTrophyDo = (state, step) => {
    const p = fp(state);
    if (step.choice === 'dmg') push(state, F('dealDamage', { n: 1, src: 'трофей специализации' }));
    else { const g = drawCards(state, p, 2); log(state, `${p.name}: трофей специализации — +${g} карт(ы)`); }
};

/** Shield gain respecting the max and Полуденница (MON-11: at most +1 per fight turn). */
function gainShield(state, p, n, why) {
    const f = state.fight;
    if (n <= 0) return;
    if (f && ab(f) === 'MON-11' && f.cur) {
        const room = Math.max(0, 1 - f.cur.shieldGain);
        if (n > room) { log(state, 'Полуденница: щит растёт не больше чем на 1 за ход'); n = room; }
    }
    if (f && f.whole && f.whole.shieldCap != null && f.cur) {
        const room = Math.max(0, f.whole.shieldCap - f.cur.shieldGain);
        if (n > room) { log(state, `Особая атака: щит растёт не больше чем на ${f.whole.shieldCap} за ход`); n = room; }
    }
    const before = p.shield;
    p.shield = Math.min(maxShield(state, p), p.shield + n);
    if (f && f.cur) f.cur.shieldGain += p.shield - before;
    if (p.shield !== before) log(state, `${p.name}: щит ${before} → ${p.shield}${why ? ' (' + why + ')' : ''}`);
}

// ---- elixirs -------------------------------------------------------------------------------
export function elixirLimit(state, p) {
    const f = state.fight;
    let lim = skillVal(p, 'alchemy');
    if (f && ab(f) === 'MON-20') lim = Math.min(lim, 1);
    return lim;
}
const alchemyLimitText = (state, p) => `Лимит алхимии: ${skillVal(p, 'alchemy')} ${bombsOn(state) ? 'эликсира(ов) и бомб' : 'эликсира(ов)'} за битву`;
/** Why an elixir can't be used now (null if it can). */
export function elixirError(state, p, inst) {
    const f = state.fight;
    if (!f || f.stage !== 'witcher' || f.seat !== p.seat) return 'Только на этапе 1 своего хода битвы';
    if (!p.elixirs.includes(inst)) return 'Нет такого эликсира';
    if (f.elixirsUsed >= skillVal(p, 'alchemy')) return alchemyLimitText(state, p);
    if (ab(f) === 'MON-20' && f.usedElixirs.length >= 1) return 'Водная баба: не больше 1 эликсира за битву';
    const id = inst.split('#')[0];
    if (id === 'POTION-02' && !p.hand.length) return 'Нужна карта в руке, чтобы сбросить';
    if (id === 'POTION-04' && p.shield < 1) return 'Щит уже 0';
    if (id === 'POTION-06' && p.hand.length > 1) return 'Только если в руке 1 карта или меньше';
    if (id === 'POTION-07' && p.hand.length > 2) return 'Только если в руке 2 карты или меньше';
    if (id === 'POTION-07' && !p.discard.length) return 'Сброс пуст';
    return null;
}
STEPS.useElixir = (state, step) => {
    const f = state.fight, p = fp(state);
    const inst = step.id;
    removeFrom(p.elixirs, inst);
    f.usedElixirs.push(inst);
    f.elixirsUsed++;
    const e = potionOf(inst);
    log(state, `${p.name} пьёт эликсир «${e.name}»`, { kind: 'elixir' });
    fx(state, { k: 'useElixir', seat: p.seat, id: inst });
    switch (e.id) {
        case 'POTION-01': gainShield(state, p, 1, 'Ласточка'); f.cur.drawMod -= 1; break;
        case 'POTION-02': push(state, F('petriAsk')); break;
        case 'POTION-03': f.cur.onlyOne = true; push(state, F('dealDamage', { n: 1, src: 'Чёрная кровь' })); break;
        case 'POTION-04': p.shield -= 1; drawCards(state, p, 2); log(state, `${p.name}: Гром — щит −1, +2 карты`); break;
        case 'POTION-05': f.cur.blizzard = true; break;
        case 'POTION-06': drawCards(state, p, 2); break;
        case 'POTION-07': p.hand.push(p.discard.pop()); log(state, `${p.name}: Лес Марибора — верхняя карта сброса в руку`); break;
    }
    push(state, F('awaitWitcher'));
};
STEPS.petriAsk = (state) => {
    const p = fp(state);
    ask(state, { seat: p.seat, kind: 'cards', from: 'hand', ui: 'hand', ids: p.hand.slice(), min: 1, max: 1, title: 'Зелье Петри', text: 'Сбросьте 1 карту из руки, чтобы нанести 2 урона.', op: 'petriDo', args: { fight: 1 } });
};
STEPS.petriDo = (state, step) => {
    const p = fp(state);
    removeFrom(p.hand, step.ids[0]); p.discard.push(step.ids[0]);
    push(state, F('dealDamage', { n: 2, src: 'Зелье Петри' }));
};

// ---- bombs («По следу монстра», p. 4): stage 1 of your fight turn, like elixirs; elixirs and
// bombs share the alchemy limit; bombs are not elixirs. ---------------------------------------
export function bombError(state, p, inst) {
    const f = state.fight;
    if (!f || f.stage !== 'witcher' || f.seat !== p.seat) return 'Только на этапе 1 своего хода битвы';
    if (!(p.bombs || []).includes(inst)) return 'Нет такой бомбы';
    const id = String(inst).split('#')[0];
    if (id === 'BOMB-06') return 'Только перед формированием запасов жизней (предлагается в начале битвы)';
    if (id === 'BOMB-07') return vulnOn(state) ? 'Только когда срабатывает способность сброса монстра (предлагается сама)' : 'Нужно дополнение «Уязвимости и особые атаки»';
    if (f.elixirsUsed >= skillVal(p, 'alchemy')) return alchemyLimitText(state, p);
    if (id === 'BOMB-01' && !p.discard.length) return 'Сброс пуст';
    if (id === 'BOMB-04' && !f.life.length) return 'Запас жизни монстра пуст';
    if (id === 'BOMB-05' && f.moonDust) return 'Лунная пыль уже действует';
    return null;
}
STEPS.useBomb = (state, step) => {
    const f = state.fight, p = fp(state);
    const inst = step.id;
    removeFrom(p.bombs, inst);
    f.usedBombs.push(inst);
    f.elixirsUsed++;
    const b = bombOf(inst);
    log(state, `${p.name} бросает бомбу «${b.name}»`, { kind: 'elixir' });
    fx(state, { k: 'useBomb', seat: p.seat, id: inst });
    const seq = [];
    switch (b.id) {
        case 'BOMB-01': {
            const top = p.discard.slice(-2).reverse();
            if (top.length === 1) seq.push(F('samumDo', { ids: top }));
            else seq.push(F('samumAsk', { ids: top }));
            break;
        }
        case 'BOMB-02': f.cur.dragon = true; seq.push(F('dealDamage', { n: 1, src: 'Сон дракона' })); break;
        case 'BOMB-03': {
            const nest = /Гнездо/.test(MONSTER[f.mon].name);
            const n = nest ? 2 : 1;
            const g = drawCards(state, p, n);
            log(state, `${p.name}: Танцующая звезда — +${g} карт(ы)${nest ? ' (гнездо: 2 урона и 2 карты)' : ''}`);
            seq.push(F('dealDamage', { n, src: 'Танцующая звезда' }));
            break;
        }
        case 'BOMB-04': seq.push(F('northWindAsk')); break;
        case 'BOMB-05': f.moonDust = true; log(state, `${p.name}: Лунная пыль — в следующий ход монстра можно сменить тип атаки`); break;
    }
    push(state, ...seq, F('awaitWitcher'));
};
STEPS.samumAsk = (state, step) => {
    const p = fp(state);
    ask(state, { seat: p.seat, kind: 'cards', from: 'discard', ids: step.ids, min: 1, max: 1, title: 'Самум', text: 'Возьмите в руку 1 из 2 верхних карт своего сброса.', op: 'samumDo', args: { fight: 1 } });
};
STEPS.samumDo = (state, step) => {
    const p = fp(state);
    const id = step.ids[0];
    if (!p.discard.includes(id)) return;
    removeFrom(p.discard, id); p.hand.push(id);
    log(state, `${p.name}: Самум — «${CARDS[id].name}» из сброса в руку`);
};
STEPS.northWindAsk = (state) => {
    const f = state.fight, p = fp(state);
    const top = f.life.slice(0, 3);
    if (!top.length) return;
    log(state, `${p.name}: Северный ветер — смотрит ${top.length} верхние карты монстра`);
    if (top.length === 1 || p.bot) { push(state, F('northWindDo', { ids: [top.length === 1 ? top[0] : worstAttack(state, top)], top })); return; }
    ask(state, { seat: p.seat, kind: 'cards', from: 'monsterTop', ids: top, min: 1, max: 1, title: 'Северный ветер', text: 'Отправьте 1 карту в сброс монстра. Остальные вернутся на верх его запаса жизни — порядок выберете следующим шагом.', op: 'northWindDo', args: { fight: 1, top } });
};
STEPS.northWindDo = (state, step) => {
    const f = state.fight;
    const id = step.ids[0];
    if (!f.life.includes(id)) return;
    removeFrom(f.life, id); f.monDiscard.push(id);
    log(state, `Северный ветер: карта монстра отправлена в сброс, осталось ${f.life.length}`);
    fx(state, { k: 'monsterHit', n: 1, left: f.life.length });
    if (!f.life.length) { endFight(state, 'win'); return; }
    // «…а остальные верните назад в любом порядке»: with 2 left, the player picks the top one.
    const rest = (step.top || []).filter(x => x !== id && f.life.indexOf(x) >= 0 && f.life.indexOf(x) < 2);
    if (rest.length === 2) {
        const p = fp(state);
        if (p.bot) { const keep = worstAttack(state, rest); push(state, F('northWindOrder', { ids: [rest.find(x => x !== keep)] })); return; }
        ask(state, { seat: p.seat, kind: 'cards', from: 'monsterTop', ids: rest, min: 1, max: 1, title: 'Северный ветер', text: 'Какая из оставшихся карт ляжет сверху (её атака будет следующей)?', op: 'northWindOrder', args: { fight: 1 } });
    }
};
STEPS.northWindOrder = (state, step) => {
    const f = state.fight;
    const id = step.ids[0];
    const i = f.life.indexOf(id);
    if (i === 1) { f.life.splice(1, 1); f.life.unshift(id); }
};
/** «Чёртов гриб»: only before the life pools are formed — offered at the start of the fight. */
STEPS.mushroomAsk = (state) => {
    const f = state.fight, p = fp(state);
    const inst = (p.bombs || []).find(x => x.startsWith('BOMB-06#'));
    if (!inst || f.elixirsUsed >= skillVal(p, 'alchemy')) return;
    if (p.bot) { push(state, F('mushroomDo', { choice: 'use', id: inst })); return; }
    ask(state, {
        seat: p.seat, kind: 'choice', ui: 'bomb', title: 'Чёртов гриб', card: inst,
        text: `До формирования запасов жизней можно бросить «Чёртов гриб»: возьмите 2 карты из колоды, особая способность монстра (${MONSTER[f.mon].name}) не действует до конца битвы. Бомба займёт 1 место в лимите алхимии.`,
        options: [{ id: 'use', label: 'Бросить «Чёртов гриб»' }, { id: 'skip', label: 'Не сейчас' }], op: 'mushroomDo', args: { fight: 1, id: inst },
    });
};
STEPS.mushroomDo = (state, step) => {
    if (step.choice !== 'use') return;
    const f = state.fight, p = fp(state);
    if (!p.bombs.includes(step.id)) return;
    removeFrom(p.bombs, step.id);
    f.usedBombs.push(step.id);
    f.elixirsUsed++;
    f.noAbility = true;
    const g = drawCards(state, p, 2);
    log(state, `${p.name} бросает бомбу «Чёртов гриб»: +${g} карт(ы), особая способность монстра не действует до конца битвы`, { kind: 'elixir' });
    fx(state, { k: 'useBomb', seat: p.seat, id: step.id });
};

// ---- specializations (manual ones: Cat, Griffin) -------------------------------------------
export function specError(state, p) {
    const f = state.fight;
    if (!f || f.stage !== 'witcher' || f.seat !== p.seat) return 'Только на этапе 1 своего хода битвы';
    if (f.once.spec) return 'Специализация уже использована в этой битве';
    if (p.school === 'cat') { if (f.wTurns !== 1) return 'Прыть — только в первый ход битвы'; if (!p.deck.length) return 'Колода пуста'; return null; }
    if (p.school === 'griffin') { if (!p.discard.length) return 'Сброс пуст'; return null; }
    if (p.school === 'wolf') return 'Владение мечом срабатывает само после комбинации из 3+ карт';
    if (p.school === 'bear') return 'Доспехи срабатывают сами при щите 0';
    if (p.school === 'viper') return 'Отравленный клинок срабатывает сам, когда монстр теряет карты от вашей атаки';
    if (p.school === 'ciri') return 'Старшая Кровь включается при сборке комбинации';
    if (p.school === 'manticore') {
        const [need] = SPEC_TABLE.manticore[p.skills.spec - 1];
        return p.elixirs.length >= need ? null : (need === 1 ? 'Нужен 1 неиспользованный эликсир' : `Нужно ${need} неиспользованных эликсира`);
    }
    return 'Нет ручной специализации';
}
STEPS.useSpec = (state) => {
    const f = state.fight, p = fp(state);
    f.once.spec = true;
    fx(state, { k: 'spec', seat: p.seat });
    const lvl = p.skills.spec - 1;
    if (p.school === 'cat') {
        const [look, take] = SPEC_TABLE.cat[lvl];
        const top = p.deck.slice(0, look);
        log(state, `${p.name}: «Прыть» — смотрит ${top.length} верхних карт колоды`);
        ask(state, { seat: p.seat, kind: 'cards', from: 'deckTop', ids: top, min: Math.min(take, top.length), max: Math.min(take, top.length), title: 'Прыть', text: `Заберите в руку ${take} из ${top.length} карт. Остальные вернутся на верх колоды.`, op: 'catDo', args: { fight: 1 } });
        return;
    }
    if (p.school === 'manticore') {
        const [need, mdmg, mdraw] = SPEC_TABLE.manticore[lvl];
        if (p.elixirs.length > need && !p.bot) {
            const gain = `${mdmg} урон${mdmg > 1 ? 'а' : ''}${mdraw ? ` и ${mdraw} карты из колоды` : ''}`;
            ask(state, { seat: p.seat, kind: 'cards', from: 'elixirs', ids: p.elixirs.slice(), min: need, max: need, title: 'Быстрый метаболизм', text: (need === 1 ? 'Сбросьте 1 неиспользованный эликсир' : `Сбросьте ${need} неиспользованных эликсира`) + ` — ${gain}.`, op: 'manticoreDo', args: { fight: 1 } });
            return;
        }
        push(state, F('manticoreDo', { ids: p.elixirs.slice(-need) }));
        return;
    }
    if (p.school === 'griffin') {
        const [mode, disc] = SPEC_TABLE.griffin[lvl];
        if (mode === 'any' && p.discard.length > 1) {
            ask(state, { seat: p.seat, kind: 'cards', from: 'discard', ids: p.discard.slice(), min: 1, max: 1, title: 'Магия', text: 'Возьмите 1 любую карту из своего сброса.', op: 'griffinTake', args: { fight: 1, disc } });
            return;
        }
        push(state, F('griffinTake', { ids: [p.discard[p.discard.length - 1]], disc }));
    }
};
/** «Быстрый метаболизм» (Школа Мантикоры): discard unused elixirs → damage and cards from the deck. */
STEPS.manticoreDo = (state, step) => {
    const p = fp(state);
    const [, dmg, draw] = SPEC_TABLE.manticore[p.skills.spec - 1];
    for (const id of step.ids) if (removeFrom(p.elixirs, id)) state.elixirDiscard.push(id);
    log(state, `${p.name}: «Быстрый метаболизм» — сброшено эликсиров: ${step.ids.length}, ${dmg} урона${draw ? `, +${draw} карт(ы)` : ''}`);
    if (draw) drawCards(state, p, draw);
    afterSpec(state, p);
    push(state, F('dealDamage', { n: dmg, src: 'Быстрый метаболизм' }), F('awaitWitcher'));
};
STEPS.catDo = (state, step) => {
    const p = fp(state);
    for (const id of step.ids) { removeFrom(p.deck, id); p.hand.push(id); }
    log(state, `${p.name}: «Прыть» — взято ${step.ids.length} карт(ы)`);
    afterSpec(state, p);
    push(state, F('awaitWitcher'));
};
STEPS.griffinTake = (state, step) => {
    const p = fp(state);
    const id = step.ids[0];
    removeFrom(p.discard, id); p.hand.push(id);
    log(state, `${p.name}: «Магия» — «${CARDS[id].name}» из сброса в руку`);
    const n = Math.min(step.disc, p.hand.length);
    if (n) push(state, F('discardFromHandAsk', { n, why: `Магия: сбросьте ${n} карт(ы) из руки`, choice: true }));
    afterSpec(state, p);
    push(state, F('awaitWitcher'));
};

// ---- active trophies -------------------------------------------------------------------------
export function activeEffectError(state, p, key) {
    const f = state.fight;
    if (!f || f.stage !== 'witcher' || f.seat !== p.seat) return 'Только на этапе 1 своего хода битвы';
    if (f.once['a' + key]) return 'Уже использовано в этой битве';
    const own = key === 'W-griffin' ? hasWitcherTrophy(p, 'griffin') : ACTIVE_EFFECTS[key]?.src === 'gear' ? p.gear.includes(key) : hasTrophy(p, key);
    if (!own) return 'Нет такого трофея';
    switch (key) {
        case 'MON-06': case 'MON-26': return p.deck.length ? 'Только если колода пуста' : null;
        case 'MON-30': return p.deck.length ? 'Только если колода пуста' : null;
        case 'MON-07': return p.elixirs.length >= 2 ? null : 'Нужно 2 неиспользованных эликсира';
        case 'MON-11': return p.elixirs.length >= 1 ? null : 'Нужен 1 неиспользованный эликсир';
        case 'MON-10': return p.hand.length && p.discard.length ? null : 'Нужны карта в руке и карта в сбросе';
        case 'MON-14': return p.hand.length ? null : 'Нужна карта в руке';
        case 'CONT79-15': return p.hand.length ? null : 'Нужна карта в руке';
        case 'CONT79-01': return f.wTurns !== 1 ? 'Только в первый ход битвы' : p.hand.length ? null : 'Нужна карта в руке';
        case 'CONT79-14': case 'CONT79-20': return f.wTurns !== 1 ? 'Только в первый ход битвы' : null;
        case 'CONT79-56': return p.discard.length ? null : 'Сброс пуст';
        case 'MON-21': return p.gold >= 2 && p.discard.length ? null : 'Нужно 2 золота и карта в сбросе';
        case 'MON-28': return p.discard.length ? null : 'Сброс пуст';
        case 'W-griffin': return p.discard.length ? null : 'Сброс пуст';
        case 'MON-18': return null;
    }
    return 'Неизвестный эффект';
}
STEPS.useActive = (state, step) => {
    const f = state.fight, p = fp(state);
    const key = step.key;
    f.once['a' + key] = true;
    fx(state, { k: 'trophyUse', seat: p.seat, key });
    const askDiscardPick = (why, op, extra) => ask(state, { seat: p.seat, kind: 'cards', from: 'discard', ids: p.discard.slice(), min: 1, max: 1, title: why, text: 'Возьмите 1 любую карту из своего сброса.', op, args: { fight: 1, ...(extra || {}) } });
    switch (key) {
        case 'MON-06': gainShield(state, p, 1, 'трофей «Архиспора»'); break;
        case 'MON-26': gainShield(state, p, 3, 'трофей «Кухарка»'); break;
        case 'MON-30': push(state, F('dealDamage', { n: 2, src: 'трофей «Тролль»' })); break;
        case 'MON-07': ask(state, { seat: p.seat, kind: 'cards', from: 'elixirs', ids: p.elixirs.slice(), min: 2, max: 2, title: 'Трофей «Баргест»', text: 'Сбросьте 2 эликсира: 1 урон и 1 карта.', op: 'trBarghest', args: { fight: 1 } }); break;
        case 'MON-11': ask(state, { seat: p.seat, kind: 'cards', from: 'elixirs', ids: p.elixirs.slice(), min: 1, max: 1, title: 'Трофей «Полуденница»', text: 'Сбросьте 1 эликсир: +2 карты.', op: 'trNoonwraith', args: { fight: 1 } }); break;
        case 'MON-10': ask(state, { seat: p.seat, kind: 'cards', from: 'hand', ui: 'hand', ids: p.hand.slice(), min: 1, max: 1, title: 'Трофей «Виверна»', text: 'Сбросьте 1 карту из руки…', op: 'trWyvern', args: { fight: 1 } }); break;
        case 'MON-14': ask(state, { seat: p.seat, kind: 'cards', from: 'hand', ui: 'hand', ids: p.hand.slice(), min: 1, max: 1, title: 'Трофей «Брукса»', text: 'Сбросьте 1 карту из руки, чтобы взять 5 карт.', op: 'trBruxa', args: { fight: 1 } }); break;
        case 'CONT79-15': ask(state, { seat: p.seat, kind: 'cards', from: 'hand', ui: 'hand', ids: p.hand.slice(), min: 1, max: 1, title: 'Кастет', text: 'Сбросьте 1 карту из руки, чтобы нанести 2 урона.', op: 'gearKnuckle', args: { fight: 1 } }); break;
        case 'CONT79-01': ask(state, { seat: p.seat, kind: 'cards', from: 'hand', ui: 'hand', ids: p.hand.slice(), min: 1, max: 1, title: 'Арбалет', text: 'Сбросьте 1 карту из руки, чтобы нанести 2 урона.', op: 'gearKnuckle', args: { fight: 1, src: 'арбалет' } }); break;
        case 'CONT79-14': push(state, F('dealDamage', { n: 2, src: 'арбалет' })); break;
        case 'CONT79-20': {
            // Адья: 1 — 1 урон себе; 2–4 — 1 урон себе и 2 монстру; 5–6 — 2 монстру.
            const r = d6(state); fx(state, { k: 'd6', v: r, seat: p.seat });
            log(state, `${p.name}: Адья — бросок ${r}`);
            if (r >= 2) push(state, F('dealDamage', { n: 2, src: 'Адья' }));
            if (r <= 4) push(state, F('hurtWitcher', { n: 1 }));
            break;
        }
        case 'CONT79-56': ask(state, { seat: p.seat, kind: 'cards', from: 'discard', ids: p.discard.slice(), min: 1, max: 1, title: 'Лекарство', text: 'Возьмите 1 любую карту из своего сброса и замешайте её в свою колоду.', op: 'gearMedicine', args: { fight: 1 } }); break;
        case 'MON-21': p.gold -= 2; askDiscardPick('Трофей «Мантикора»', 'trTakeDiscard'); break;
        case 'MON-28': askDiscardPick('Трофей «Сколопендроморф»', 'trTakeDiscard'); break;
        case 'W-griffin': {
            const id = p.discard.pop(); p.hand.push(id);
            log(state, `${p.name}: трофей Грифона — «${CARDS[id].name}» из сброса`);
            push(state, F('discardFromHandAsk', { n: 1, why: 'Трофей Грифона: сбросьте 1 карту из руки', choice: true }));
            break;
        }
        case 'MON-18': {
            const r = d6(state); fx(state, { k: 'd6', v: r, seat: p.seat });
            log(state, `${p.name}: трофей «Гнилец» — бросок ${r}`);
            if (r >= 4) push(state, F('dealDamage', { n: 1, src: 'трофей «Гнилец»' }));
            break;
        }
    }
    push(state, F('awaitWitcher'));
};
STEPS.trBarghest = (state, step) => {
    const p = fp(state);
    for (const id of step.ids) { removeFrom(p.elixirs, id); state.elixirDiscard.push(id); }
    drawCards(state, p, 1);
    push(state, F('dealDamage', { n: 1, src: 'трофей «Баргест»' }));
};
STEPS.trNoonwraith = (state, step) => {
    const p = fp(state);
    removeFrom(p.elixirs, step.ids[0]); state.elixirDiscard.push(step.ids[0]);
    const g = drawCards(state, p, 2); log(state, `${p.name}: трофей «Полуденница» — +${g} карт(ы)`);
};
STEPS.trWyvern = (state, step) => {
    const p = fp(state);
    removeFrom(p.hand, step.ids[0]); p.discard.push(step.ids[0]);
    ask(state, { seat: p.seat, kind: 'cards', from: 'discard', ids: p.discard.filter(x => x !== step.ids[0]).length ? p.discard.filter(x => x !== step.ids[0]) : p.discard.slice(), min: 1, max: 1, title: 'Трофей «Виверна»', text: 'Возьмите 1 любую карту из своего сброса.', op: 'trTakeDiscard', args: { fight: 1 } });
};
STEPS.trBruxa = (state, step) => {
    const p = fp(state);
    removeFrom(p.hand, step.ids[0]); p.discard.push(step.ids[0]);
    const g = drawCards(state, p, 5); log(state, `${p.name}: трофей «Брукса» — +${g} карт(ы)`);
};
STEPS.gearKnuckle = (state, step) => {
    const p = fp(state);
    removeFrom(p.hand, step.ids[0]); p.discard.push(step.ids[0]);
    const src = step.src || 'кастет';
    log(state, `${p.name}: ${src} — сбрасывает «${CARDS[step.ids[0]].name}»`);
    push(state, F('dealDamage', { n: 2, src }));
};
STEPS.gearMedicine = (state, step) => {
    const p = fp(state);
    removeFrom(p.discard, step.ids[0]);
    p.deck.push(step.ids[0]);
    shuffle(state, p.deck);
    log(state, `${p.name}: лекарство — «${CARDS[step.ids[0]].name}» замешана в колоду`);
};
STEPS.trTakeDiscard = (state, step) => {
    const p = fp(state);
    removeFrom(p.discard, step.ids[0]); p.hand.push(step.ids[0]);
    log(state, `${p.name} берёт «${CARDS[step.ids[0]].name}» из сброса`);
};

// ---- combo ------------------------------------------------------------------------------------
/** Which link of `prev` would connect `next` (index), or -1. */
export function linkIndex(prev, next, prefer) {
    // Боевой транс («По следу монстра») is a card of every colour: any link of `prev` takes it.
    const cands = prev.links.map((l, i) => ({ l, i })).filter(x => next.any || x.l.color === next.color);
    if (!cands.length) return -1;
    if (prefer != null && cands.some(c => c.i === prefer)) return prefer;
    return cands.sort((a, b) => fxScore(b.l.fx) - fxScore(a.l.fx))[0].i;
}
const fxScore = (fx) => (fx.dmg || 0) * 3 + (fx.shield || 0) * 2 + (fx.draw || 0) + (fx.top ? 2 : 0) + (fx.ret ? 2 : 0) + (fx.dice ? 2 : 0) + (fx.cond ? 1 : 0);
/** Does card `c` count as colour `col` for a condition (Боевой транс counts as every colour)? */
const isColor = (c, col) => c.color === col || !!c.any;
/** Cards of the player's deck — the engine state has `deck`, a view only `deckCount`. */
const deckLen = (p) => p.deck ? p.deck.length : (p.deckCount || 0);
/** Цири, «Старшая Кровь» (once per fight): one card of the combo gets a link of any colour. */
export function bloodError(state, p) {
    const f = state.fight;
    if (!p || p.school !== 'ciri') return 'Только у Цири';
    if (!f || f.stage !== 'witcher' || f.seat !== p.seat) return 'Только в свой ход битвы';
    if (f.once.spec) return 'Старшая Кровь уже использована в этой битве';
    if (f.cur && f.cur.onlyOne) return 'Чёрная кровь: комбинация только из 1 карты';
    return null;
}
/** The «Старшая Кровь» link effect for the current specialization level: { dmg, draw }. */
export function bloodFx(p) {
    const [dmg, draw] = SPEC_TABLE.ciri[Math.max(0, Math.min(4, (p.skills.spec || 1) - 1))];
    return { dmg, draw };
}
/** Validate a combo. Returns an error string or null. `free` marks the Пурга extra card,
 *  `blood` = index i of the card joined to card i-1 by Цири's «Старшая Кровь» link. */
export function comboError(state, p, ids, opts = {}) {
    const f = state.fight;
    if (!f || f.stage !== 'witcher' || f.seat !== p.seat) return 'Сейчас не ваш ход битвы';
    if (!ids.length) {
        if (!p.hand.length) return null;
        // Special-attack restrictions may forbid every card: then no combo is played.
        if (f.cur && f.cur.r && Object.keys(f.cur.r).length && !p.hand.some(id => !comboError(state, p, [id]))) return null;
        return 'Если в руке есть карты, нужно разыграть хотя бы одну';
    }
    if (new Set(ids).size !== ids.length || !ids.every(id => p.hand.includes(id))) return 'Карты должны быть из руки';
    if (f.cur.forcedFirst && p.hand.includes(f.cur.forcedFirst) && ids[0] !== f.cur.forcedFirst) return `Полуночница: первой должна быть «${CARDS[f.cur.forcedFirst].name}»`;
    const chain = opts.free ? ids.slice(0, -1) : ids;
    if (opts.free && !f.cur.blizzard) return 'Дополнительная карта — только с Пургой';
    if (f.cur.onlyOne && chain.length > 1) return 'Чёрная кровь: комбинация только из 1 карты';
    const re = restrictError(f, p, ids);
    if (re) return re;
    const blood = opts.blood == null ? null : opts.blood;
    if (blood != null) {
        const be = bloodError(state, p);
        if (be) return be;
        if (!Number.isInteger(blood) || blood < 1 || blood >= chain.length) return 'Связь Старшей Крови должна соединять две карты комбинации';
    }
    for (let i = 1; i < chain.length; i++) {
        if (i === blood) continue;
        const prev = CARDS[chain[i - 1]], next = CARDS[chain[i]];
        if (linkIndex(prev, next) < 0) return `«${next.name}» (${COLOR_SHORT[next.color]}) не соединяется с «${prev.name}»`;
    }
    return null;
}
/** Sum of a combo with all monster/trophy modifiers — also used by the UI preview. */
export function comboTotals(state, p, ids, opts = {}) {
    const f = state.fight;
    const t = { dmg: 0, shield: 0, draw: 0, top: 0, ret: [], colors: new Set(), parts: [], dice: [], drawPlus: false, dmgAny: false, byCard: {} };
    // Special attacks («Уязвимости и особые атаки») may switch off printed symbols this turn.
    const R = (f && f.cur && f.cur.r) || {};
    const filt = (fxo) => (R.noDmg || R.noShield || R.noDrawFx) ? { ...fxo, ...(R.noDmg ? { dmg: 0, dice: null } : {}), ...(R.noShield ? { shield: 0 } : {}), ...(R.noDrawFx ? { draw: 0 } : {}) } : fxo;
    const corner = (fxo, id) => { if (!R.onlyLinks) addFx(t, filt(fxo), id); };
    const linkFx = (fxo, id) => { if (!R.noLinks) addFx(t, filt(fxo), id); };
    const cardDmg = (n, id) => { if (R.onlyLinks || R.noDmg) return; t.dmg += n; t.dmgAny = true; if (id) t.byCard[id] = (t.byCard[id] || 0) + n; };
    const purpleBlocked = f && (ab(f) === 'MON-08' || ab(f) === 'MON-29');
    const chainLen = opts.free ? ids.length - 1 : ids.length;
    ids.forEach((id, i) => {
        const c = CARDS[id];
        t.colors.add(c.color);
        if (c.any) for (const col of ['blue', 'red', 'green', 'purple', 'yellow']) t.colors.add(col);
        const cornerOff = purpleBlocked && c.color === 'purple';
        if (!cornerOff) corner(c.fx, id);
        if (i > 0 && i < chainLen && i === opts.blood && p && p.school === 'ciri') {
            // «Старшая Кровь»: a link of the next card's colour, its effect set by the spec level.
            const prev = CARDS[ids[i - 1]];
            const off = (f && ab(f) === 'MON-08' && prev.color === 'purple') || (f && ab(f) === 'MON-29' && c.color === 'purple');
            const bf = bloodFx(p);
            if (!off) linkFx(bf, ids[i - 1]);
            t.blood = { at: i, color: c.color, ...bf, off };
        } else if (i > 0 && i < chainLen) {
            const prev = CARDS[ids[i - 1]];
            const li = linkIndex(prev, c, opts.links ? opts.links[i] : null);
            if (li >= 0) {
                const link = prev.links[li];
                const off = (f && ab(f) === 'MON-08' && prev.color === 'purple') || (f && ab(f) === 'MON-29' && link.color === 'purple');
                if (!off) linkFx(link.fx, ids[i - 1]);
                // Обман: the second field of the double link — 2 cards of the link's colour anywhere after.
                if (!off && link.cond && ids.slice(i, chainLen).filter(x => isColor(CARDS[x], link.color)).length >= link.cond.n && !R.noLinks) { linkFx(link.cond.fx, ids[i - 1]); t.deception = true; }
            }
        }
        // Пируэт: +1 damage if the card right before it has the printed colour.
        if (c.prev && i > 0 && i < chainLen && isColor(CARDS[ids[i - 1]], c.prev)) cardDmg(1, id);
        if (c.fx.river && !cornerOff && !R.onlyLinks) { const big = p && p.shield === 0 && deckLen(p) === 0; cardDmg(big ? 3 : 1, id); if (!R.noShield) t.shieldMax = true; }
        if (c.fx.fixedDraw != null && !R.onlyLinks && !R.noDrawFx) t.fixedDraw = c.fx.fixedDraw;
        if (c.color === 'red' && hasTrophy(p, 'MON-13')) t.dmg += 1;
        if (f && c.color === 'blue' && keepOf(p, 'blueDmg')) t.dmg += 1;          // меч школы Журавля
        if (f && c.color === 'green' && hasGear(p, 'CONT79-13')) t.shield += 1;   // доспех
    });
    // Unique actions («По следу монстра»).
    const chain = ids.slice(0, chainLen);
    for (const id of R.onlyLinks ? [] : chain) {
        const sp = CARDS[id].special;
        if (sp === 'blue2' && chain.filter(x => isColor(CARDS[x], 'blue')).length >= 2 && !R.noShield) t.shield += 1;
        if (sp === 'emptyDeck' && p && deckLen(p) === 0) cardDmg(1, id);
        if (sp === 'combo3' && chain.length >= 3) cardDmg(1, id);
        if (sp === 'sparks') t.sparks = true;
        if (sp === 'breath') t.breath = true;
        if (sp === 'lastLink') {
            const last = CARDS[chain[chain.length - 1]];
            const best = last.links.slice().sort((a, b) => fxScore(b.fx) - fxScore(a.fx))[0];
            if (best) { addFx(t, filt(best.fx), id); t.lastLink = { from: last.id, color: best.color }; }
        }
    }
    // Mutagens: each once per fight, when the combo meets its condition (opts.mutOff — switched
    // off by the player; opts.mut8 — 'draw' for the second effect of MUT-08).
    t.muts = [];
    if (f && p && chain.length && (p.mutagens || []).length) {
        const max = maxShield(state, p);
        const cnt = (col) => chain.filter(x => isColor(CARDS[x], col)).length;
        const first = CARDS[chain[0]], last = CARDS[chain[chain.length - 1]];
        const base = { ...t };
        const test = (m) => {
            switch (m.test) {
                case 'noDraw': return !base.drawPlus;
                case 'noDmg': return !base.dmgAny;
                case 'firstLast': return chain.length >= 2 && isColor(first, m.a) && isColor(last, m.b);
                case 'both': return chain.some(x => isColor(CARDS[x], m.a)) && chain.some(x => isColor(CARDS[x], m.b)) && chain.length >= 2;
                case 'two': return cnt(m.a) >= 2;
                case 'exactly2': return chain.length === 2;
                case 'toMax': return base.shield > 0 && p.shield < max && (p.shield + base.shield >= max || base.shieldMax);
                case 'atMax': return (base.shield > 0 || base.shieldMax) && p.shield >= max;
            }
            return false;
        };
        for (const mid of p.mutagens) {
            const m = MUTAGEN[mid];
            if (!m || m.when === 'end') continue;
            const used = !!f.once['m' + mid];
            const ok = !used && test(m);
            const on = ok && !(opts.mutOff || []).includes(mid);
            const fxm = mid === 'MUT-08' && opts.mut8 === 'draw' ? m.alt : m.fx;
            if (on) addFx(t, fxm, null);
            t.muts.push({ id: mid, ok, used, on });
        }
    }
    if (f && ids.length) {
        // Наручи: once per fight, a combo with a green card: shield +1.
        if (hasGear(p, 'CONT79-28') && !f.once.g28 && t.colors.has('green')) { t.shield += 1; t.bracers = true; }
        // Эдгар де Спота: the first combo of a monster fight deals 3 more damage.
        if (hasGear(p, 'CONT79-50') && !f.once.g50 && f.kind === 'monster') { t.dmg += 3; t.edgar = true; }
    }
    if (f) {
        if (f.cur && f.cur.dragon && t.colors.has('purple')) { t.dmg += 1; t.dragon = true; }   // Сон дракона
        if (ab(f) === 'MON-26' && (t.colors.has('green') || t.colors.has('yellow')) && t.dmg > 0) t.dmg -= 1;
        if (ab(f) === 'MON-28' && t.colors.has('blue') && t.dmg > 0) t.dmg -= 1;
        if (R.colorLess) for (const id of chain) if (R.colorLess.some(col => isColor(CARDS[id], col)) && t.byCard[id] > 0) t.dmg = Math.max(0, t.dmg - 1);
        if (R.needYellow && !t.colors.has('yellow')) t.dmg = Math.max(0, t.dmg - R.needYellow);
        if (R.dmgCap != null) t.dmg = Math.min(t.dmg, R.dmgCap);
    }
    return t;
}
function addFx(t, fxo, id) {
    if (fxo.dmg) { t.dmg += fxo.dmg; t.dmgAny = true; if (id && t.byCard) t.byCard[id] = (t.byCard[id] || 0) + fxo.dmg; }
    if (fxo.shield) t.shield += fxo.shield;
    if (fxo.draw) { t.draw += fxo.draw; if (fxo.draw > 0) t.drawPlus = true; }
    if (fxo.dice) { t.dice.push({ kind: fxo.dice, id }); t.dmgAny = true; }
    if (fxo.top) t.top += fxo.top;
    if (fxo.ret) t.ret.push(id);
}

STEPS.playCombo = (state, step) => {
    const f = state.fight, p = fp(state);
    f.stage = 'busy';
    const ids = step.ids;
    for (const id of ids) removeFrom(p.hand, id);
    f.cur.combo = ids.slice();
    const t = comboTotals(state, p, ids, { free: step.free, links: step.links, blood: step.blood, mutOff: step.mutOff, mut8: step.mut8 });
    // Dice of the master actions (Сметающий Аард on a link, Засада on the card).
    for (const d of t.dice) {
        const r = d6(state);
        fx(state, { k: 'd6', v: r, seat: p.seat });
        const n = d.kind === 'aard' ? (r >= 4 ? 2 : 0) : r === 6 ? 4 : r >= 4 ? 3 : 2;
        t.dmg += n;
        log(state, `${CARDS[d.id].name}: бросок ${r} — ${n ? `${n} урона` : 'ничего не происходит'}`);
    }
    if (t.deception) log(state, 'Обман: второй эффект связи — ещё 3 урона');
    if (t.lastLink) log(state, `Проворство: эффект связи карты «${CARDS[t.lastLink.from].name}»`);
    f.lastCombo = { ids: ids.slice(), dmg: t.dmg, shield: t.shield, draw: t.draw, free: !!step.free };
    if (t.bracers) { f.once.g28 = true; log(state, `${p.name}: наручи — щит +1`); }
    if (t.edgar) { f.once.g50 = true; log(state, `${p.name}: Эдгар де Спота — первая комбинация +3 урона`); }
    if (ids.length) log(state, `${p.name} разыгрывает комбинацию: ${ids.map(id => '«' + CARDS[id].name + '»').join(' → ')}`, { kind: 'combo' });
    else log(state, `${p.name}: в руке нет карт — комбинации нет`);
    fx(state, { k: 'combo', seat: p.seat, ids });
    for (const m of t.muts) if (m.on) { f.once['m' + m.id] = true; log(state, `${p.name}: ${MUTAGEN[m.id].name} — ${MUTAGEN[m.id].cond.replace(/^Если /, 'условие выполнено: ').replace(/:$/, '')}`); fx(state, { k: 'mutagen', seat: p.seat, id: m.id }); }
    if (t.blood) {
        f.once.spec = true;
        const b = t.blood;
        log(state, `${p.name}: «Старшая Кровь» — «${CARDS[ids[b.at - 1]].name}» получает ${COLOR_SHORT[b.color]} связь${b.off ? ' (эффект подавлен монстром)' : `: ${b.dmg ? `урон ${b.dmg}, ` : ''}${b.draw >= 0 ? '+' : ''}${b.draw} карт(а) в конце хода`}`);
        fx(state, { k: 'spec', seat: p.seat });
    }
    let dmg = t.dmg;
    const chainLen = step.free ? ids.length - 1 : ids.length;
    const wolf3 = chainLen >= 3;
    let wolfDraw = 0;
    if (wolf3 && p.school === 'wolf' && !f.once.spec) {
        f.once.spec = true;
        const [d, dr] = SPEC_TABLE.wolf[p.skills.spec - 1];
        dmg += d; wolfDraw = dr;
        log(state, `${p.name}: «Владение мечом» — +${d} урона${dr ? `, +${dr} карт(ы)` : ''}`);
        fx(state, { k: 'spec', seat: p.seat });
    }
    if (wolf3 && hasWitcherTrophy(p, 'wolf') && !f.once.wWolf) { f.once.wWolf = true; dmg += 1; log(state, `${p.name}: трофей Волка — +1 урон`); }
    if (f.cur.r && f.cur.r.dmgCap != null && dmg > f.cur.r.dmgCap) { dmg = f.cur.r.dmgCap; log(state, `Особая атака: комбинация наносит не больше ${dmg} урона`); }
    push(state,
        // Искры из глаз: before the combo's effects, at shield 0 — any card of the deck to the hand.
        ...(t.sparks && p.shield === 0 && p.deck.length ? [F('sparksAsk')] : []),
        F('comboDamage', { n: dmg }),
        F('comboAfterDamage', { wolfDraw, shield: t.shield, top: t.top, ret: t.ret, draw: t.draw, ids, wasSpec: wolfDraw > 0 || (wolf3 && p.school === 'wolf') || !!t.blood, fixedDraw: t.fixedDraw, shieldMax: !!t.shieldMax, breath: !!t.breath }),
    );
};
STEPS.comboDamage = (state, step) => {
    if (!alive(state)) return;
    if (step.n > 0) hitMonster(state, step.n, 'комбинация');
};
STEPS.comboAfterDamage = (state, step) => {
    if (!alive(state)) return;
    const f = state.fight, p = fp(state);
    if (step.wolfDraw) drawCards(state, p, step.wolfDraw);
    // b) shield
    gainShield(state, p, step.shield, 'комбинация');
    if (step.shieldMax) gainShield(state, p, maxShield(state, p) - p.shield, 'Река гнева');
    const r = f.cur.r || {};
    if (r.shieldPerCard && step.ids.length) loseShield(state, p, step.ids.length, 'особая атака: −1 щит за карту комбинации');
    // c) other effects: top of the discard (combo cards are not in the discard yet), return this card
    for (let i = 0; i < step.top; i++) {
        if (!p.discard.length) break;
        const id = p.discard.pop(); p.hand.push(id);
        log(state, `${p.name} берёт «${CARDS[id].name}» с верха сброса`);
    }
    const returned = [...f.cur.takenBack];
    for (const id of step.ret) { if (!returned.includes(id)) { p.hand.push(id); returned.push(id); log(state, `«${CARDS[id].name}» возвращается в руку`); } }
    // MON-24: after the combo's effects, a yellow card costs 2 shield.
    const colors = new Set(step.ids.map(id => CARDS[id].color));
    if (ab(f) === 'MON-24' && colors.has('yellow')) loseShield(state, p, 2, 'Шептуха');
    // Кладбищенская баба (discard ability): after the combo's effects.
    while (f.cur.after25 > 0) { f.cur.after25--; afterCombo25(state, p); }
    f.cur.comboDone = true;
    // 4. draw (Покаянник's discard ability: the combo's draw effects are ignored this turn)
    const combat = f.cur.combatZero ? 0 : r.combatLess ? SKILL_VALUE[Math.max(0, p.skills.combat - r.combatLess)] : skillVal(p, 'combat');
    if (f.cur.noDrawFx && (step.draw || step.fixedDraw != null)) log(state, 'Покаянник: эффекты комбинации на добор карт игнорируются');
    const comboDraw = f.cur.noDrawFx ? 0 : step.draw;
    let n = combat + comboDraw + f.cur.drawMod;
    if (hasTrophy(p, 'MON-08') && colors.has('yellow')) n += 2;
    if (ab(f) === 'MON-05' && !colors.has('green')) n -= 1;
    if (ab(f) === 'MON-09' && n > 1) n -= 1;
    if (hasGear(p, 'CONT79-31') && f.wTurns === 1 && !f.once.g31) { f.once.g31 = true; n += 2; log(state, `${p.name}: кожаные сапоги — +2 карты`); }
    // Решающий удар: «возьмите 0 карт», no effect can change it.
    if (step.fixedDraw != null && !f.cur.noDrawFx) { n = step.fixedDraw; log(state, 'Решающий удар: в конце хода — 0 карт'); }
    // Special attacks: «не более N карт» / «берёт 0 карт» — not changeable by other effects.
    if (r.drawCap != null && n > r.drawCap) n = r.drawCap;
    if (r.drawFixed != null) n = r.drawFixed;
    const g = drawCards(state, p, Math.max(0, n));
    log(state, `${p.name} берёт ${g} карт(ы) в конце хода битвы`);
    // combo to the discard in order (last card on top)
    for (const id of step.ids) if (!returned.includes(id)) p.discard.push(id);
    // MUT-15: had to draw, but the hand already holds 7 — 1 damage.
    let mut15 = false;
    if (n > g && p.hand.length >= HAND_LIMIT && (p.mutagens || []).includes('MUT-15') && !f.once['mMUT-15']) {
        f.once['mMUT-15'] = true;
        log(state, `${p.name}: Зелёный мутаген — в руке уже 7 карт`);
        fx(state, { k: 'mutagen', seat: p.seat, id: 'MUT-15' });
        mut15 = true;
    }
    if (step.wasSpec) afterSpec(state, p);
    // Цикл дыхания resolves within this turn, before the monster acts.
    push(state, ...(mut15 ? [F('dealDamage', { n: 1, src: 'мутаген' })] : []), ...(step.breath && f.usedElixirs.length ? [F('breathAsk')] : []), F('afterWitcherTurn'));
};
STEPS.sparksAsk = (state) => {
    const p = fp(state);
    if (!p.deck.length) return;
    if (p.bot) { push(state, F('sparksDo', { ids: [p.deck.slice().sort((a, b) => cardScore(b) - cardScore(a))[0]] })); return; }
    ask(state, { seat: p.seat, kind: 'cards', from: 'deck', ids: p.deck.slice(), min: 1, max: 1, title: 'Искры из глаз', text: 'Ваш щит равен 0: выберите 1 любую карту из колоды и возьмите её в руку (колода перемешается).', op: 'sparksDo', args: { fight: 1 } });
};
STEPS.sparksDo = (state, step) => {
    const p = fp(state);
    if (!removeFrom(p.deck, step.ids[0])) return;
    p.hand.push(step.ids[0]); shuffle(state, p.deck);
    log(state, `${p.name}: «Искры из глаз» — «${CARDS[step.ids[0]].name}» из колоды в руку`);
};
const cardScore = (id) => { const c = CARDS[id]; return fxScore(c.fx) + c.links.length; };
/** Цикл дыхания: one used elixir back, its use no longer counts toward the alchemy limit. */
STEPS.breathAsk = (state) => {
    const f = state.fight, p = fp(state);
    if (!f.usedElixirs.length) return;
    if (f.usedElixirs.length === 1 || p.bot) { push(state, F('breathDo', { ids: [f.usedElixirs[f.usedElixirs.length - 1]] })); return; }
    ask(state, { seat: p.seat, kind: 'cards', from: 'usedElixirs', ids: f.usedElixirs.slice(), min: 1, max: 1, title: 'Цикл дыхания', text: 'Переверните обратно 1 использованный эликсир — его можно использовать снова.', op: 'breathDo', args: { fight: 1 } });
};
STEPS.breathDo = (state, step) => {
    const f = state.fight, p = fp(state);
    const id = step.ids[0];
    if (!removeFrom(f.usedElixirs, id)) return;
    p.elixirs.push(id);
    f.elixirsUsed = Math.max(0, f.elixirsUsed - 1);
    log(state, `${p.name}: «Цикл дыхания» — эликсир «${potionOf(id).name}» снова можно использовать`);
    fx(state, { k: 'elixir', seat: p.seat, id });
};
STEPS.afterWitcherTurn = (state) => {
    if (!alive(state)) return;
    const p = fp(state);
    // Discard abilities resolved at the end of the turn (Гарпия, Туманник, Кладбищенская баба).
    const endSeq = endOfTurnDiscards(state);
    if (endSeq.length) { push(state, ...endSeq, F('afterWitcherTurn')); return; }
    if (!p.hand.length && !p.deck.length) { endFight(state, 'ko'); return; }
    push(state, F('monsterTurn'));
};

// ---------------------------------------------------------------------------------------------
// Monster turn (База.md p. 25)
// ---------------------------------------------------------------------------------------------
STEPS.monsterTurn = (state) => {
    if (!alive(state)) return;
    const f = state.fight, p = fp(state);
    // Оскар: before the monster's first turn, look at its top 2 cards: one to its discard.
    if (f.mTurns === 0 && hasGear(p, 'CONT79-18') && !f.once.g18 && f.life.length) {
        f.once.g18 = true;
        f.stage = 'busy';
        push(state, F('oscarAsk'), F('monsterTurn'));
        return;
    }
    f.turn = 'monster';
    f.mTurns++;
    f.cur = null;
    f.mCur = f.nextM || {};
    f.nextM = null;
    f.stage = 'busy';
    f.poolAtStart = f.life.length;
    fx(state, { k: 'fightTurn', who: 'monster', n: f.mTurns });
    if (!f.life.length) { endFight(state, 'win'); return; }
    if (f.mTurns === 1 && ab(f) === 'MON-04') { push(state, F('monsterAttack', { type: 'auto' })); return; }
    // Discard abilities / special attacks: the type is chosen after the card is revealed.
    if (f.mCur.chooseType) { push(state, F('monsterAttack', { type: 'late' })); return; }
    if (state.solo) {
        const r = d6(state);
        fx(state, { k: 'd6', v: r, seat: p.seat });
        log(state, `Бросок за монстра: ${r} — ${r <= 3 ? 'удар' : 'укус'}`);
        push(state, F('monsterAttack', { type: r <= 3 ? 'strike' : 'bite' }));
        return;
    }
    const chooser = f.chooser;
    const cp = state.players[chooser];
    if (cp.bot || cp.away) { push(state, F('monsterAttack', { type: botAttackType(state) })); return; }
    ask(state, {
        seat: chooser, kind: 'choice', ui: 'attack', title: 'Атака монстра',
        text: `Вы выбираете, как ${MONSTER[f.mon].name} атакует ${p.name}: удар или укус. Затем откроется верхняя карта запаса жизни монстра.`,
        options: [{ id: 'strike', label: 'Удар' }, { id: 'bite', label: 'Укус' }], op: 'monsterAttackChosen', args: { fight: 1 },
    });
};
STEPS.oscarAsk = (state) => {
    const f = state.fight, p = fp(state);
    const top = f.life.slice(0, 2);
    log(state, `${p.name}: Оскар смотрит ${top.length} верхние карты монстра`);
    if (top.length === 1 || p.bot) { push(state, F('oscarDo', { ids: [top.length === 1 ? top[0] : worstAttack(state, top)] })); return; }
    ask(state, { seat: p.seat, kind: 'cards', from: 'monsterTop', ids: top, min: 1, max: 1, title: 'Оскар', text: 'Положите одну из карт в сброс монстра — другая останется на верху его колоды (её атака будет следующей).', op: 'oscarDo', args: { fight: 1 } });
};
STEPS.oscarDo = (state, step) => {
    const f = state.fight;
    const id = step.ids[0];
    removeFrom(f.life, id); f.monDiscard.push(id);
    log(state, `Оскар: карта монстра отправлена в сброс, осталось ${f.life.length}`);
    fx(state, { k: 'monsterHit', n: 1, left: f.life.length });
    if (!f.life.length) endFight(state, 'win');
};
/** The more dangerous of the monster's top cards (for bots): the larger worst-case card loss. */
function worstAttack(state, ids) {
    const f = state.fight, p = fp(state);
    const loss = (id) => !ATTACK[id] ? 6 : Math.max(cardLoss(state, p, ATTACK[id].strike, f.level), cardLoss(state, p, ATTACK[id].bite, f.level));
    return ids.slice().sort((a, b) => loss(b) - loss(a))[0];
}
STEPS.monsterAttackChosen = (state, step) => { push(state, F('monsterAttack', { type: step.choice })); };
function botAttackType(state) { return randInt(state, 2) ? 'strike' : 'bite'; }

/** Cards the witcher would lose to an attack (for MON-04 Туманник). */
function cardLoss(state, p, a, level) {
    const dmg = attackDamage(state, p, a, level);
    let loss = Math.max(0, dmg - p.shield);
    if (a.k === 'randDiscard') loss += a.lvl[level - 1];
    if (a.k === 'remove') loss += 1;
    return loss;
}
function attackDamage(state, p, a, level) {
    if (a.k === 'dmg') return a.n != null ? a.n : a.lvl[level - 1];
    if (a.k === 'skill') return a.lvl[level - 1];
    if (a.k === 'dmgSkill') return p.skills[a.skill];
    return 0;
}

STEPS.monsterAttack = (state, step) => {
    if (!alive(state)) return;
    const f = state.fight, p = fp(state);
    const top = f.life.shift();
    f.monDiscard.push(top);
    // A special combat card: the special attack of that number; strike/bite does not matter.
    if (isSpecial(top)) {
        const n = Number(top.slice(-1));
        f.lastAttack = { id: top, type: 'special', n, name: specialName(f.mon, n) };
        fx(state, { k: 'monsterAttack', id: top, type: 'special', left: f.life.length });
        if (f.vuln) { push(state, F('spAttack', { n })); return; }
        log(state, `${MONSTER[f.mon].name}: особая боевая карта без большой карты монстра — атаки нет`);
        push(state, F('afterMonsterTurn'));
        return;
    }
    const card = ATTACK[top];
    let type = step.type;
    if (type === 'late') {
        f.lastAttack = { id: top, type: null };
        const cp = state.solo || f.chooser == null ? null : state.players[f.chooser];
        if (!cp || cp.bot || cp.away) {
            // Solo (and bots): the attack that deals more damage.
            type = attackDamage(state, p, card.bite, f.level) > attackDamage(state, p, card.strike, f.level) ? 'bite' : 'strike';
            log(state, `Тип атаки выбирается после открытия карты: ${type === 'strike' ? 'удар' : 'укус'}`);
        } else {
            log(state, `Открыта карта монстра: удар — ${card.strikeText}; укус — ${card.biteText}`, { kind: 'attack' });
            ask(state, {
                seat: cp.seat, kind: 'choice', ui: 'attack', title: 'Атака монстра',
                text: `Карта уже открыта: удар — ${card.strikeText}; укус — ${card.biteText}. Выберите, как ${MONSTER[f.mon].name} атакует ${p.name}.`,
                options: [{ id: 'strike', label: 'Удар' }, { id: 'bite', label: 'Укус' }], op: 'lateTypeChosen', args: { fight: 1 },
            });
            return;
        }
    }
    attackTyped(state, top, type);
};
STEPS.lateTypeChosen = (state, step) => { const f = state.fight; attackTyped(state, f.lastAttack.id, step.choice === 'bite' ? 'bite' : 'strike'); };
function attackTyped(state, top, type) {
    const f = state.fight, p = fp(state);
    const card = ATTACK[top];
    if (type === 'auto') {
        type = cardLoss(state, p, card.bite, f.level) > cardLoss(state, p, card.strike, f.level) ? 'bite' : 'strike';
        log(state, `Туманник: применяется атака, после которой сбрасывается больше карт — ${type === 'strike' ? 'удар' : 'укус'}`);
    }
    f.lastAttack = { id: top, type };
    log(state, `${MONSTER[f.mon].name}: ${type === 'strike' ? 'удар' : 'укус'} — ${type === 'strike' ? card.strikeText : card.biteText}`, { kind: 'attack' });
    fx(state, { k: 'monsterAttack', id: top, type, left: f.life.length });
    // Trophy Кащей... (expansion) / Гнилец etc. not here. Trophy «Пряха»? no. Trophy MON-15: may change the type once.
    if (f.moonDust) {
        f.moonDust = false;
        const other = type === 'strike' ? 'bite' : 'strike';
        if (p.bot) {
            if (cardLoss(state, p, card[other], f.level) < cardLoss(state, p, card[type], f.level)) { type = other; f.lastAttack.type = type; log(state, 'Лунная пыль: тип атаки сменён'); }
            push(state, F('applyAttack', { type }));
            return;
        }
        ask(state, {
            seat: p.seat, kind: 'choice', title: 'Лунная пыль', text: `Открыта карта: удар — ${card.strikeText}; укус — ${card.biteText}. Можно сменить тип атаки.`,
            options: [{ id: 'keep', label: `Оставить: ${type === 'strike' ? 'удар' : 'укус'}` }, { id: 'switch', label: `Сменить на ${type === 'strike' ? 'укус' : 'удар'}` }],
            op: 'leshenSwitch', args: { fight: 1, type, moon: true },
        });
        return;
    }
    if (hasTrophy(p, 'MON-15') && !f.once.t15 && !p.bot) {
        ask(state, {
            seat: p.seat, kind: 'choice', title: 'Трофей «Леший»', text: `Открыта карта: удар — ${card.strikeText}; укус — ${card.biteText}. Один раз за битву можно сменить тип атаки.`,
            options: [{ id: 'keep', label: `Оставить: ${type === 'strike' ? 'удар' : 'укус'}` }, { id: 'switch', label: `Сменить на ${type === 'strike' ? 'укус' : 'удар'}` }],
            op: 'leshenSwitch', args: { fight: 1, type },
        });
        return;
    }
    push(state, F('applyAttack', { type }));
}
STEPS.leshenSwitch = (state, step) => {
    let type = step.type;
    if (step.choice === 'switch') { if (!step.moon) state.fight.once.t15 = true; type = type === 'strike' ? 'bite' : 'strike'; state.fight.lastAttack.type = type; log(state, step.moon ? 'Лунная пыль: тип атаки сменён' : `Трофей «Леший»: тип атаки сменён`); }
    push(state, F('applyAttack', { type }));
};
STEPS.applyAttack = (state, step) => {
    if (!alive(state)) return;
    const f = state.fight, p = fp(state);
    const a = ATTACK[f.lastAttack.id][step.type];
    let dmg = attackDamage(state, p, a, f.level);
    const seq = [];
    if (a.k === 'skill') seq.push({ op: 'lowerSkill', seat: p.seat, skill: a.skill, fight: 1 });
    let manticore = false;
    if (a.k === 'dmg' || a.k === 'dmgSkill' || a.k === 'skill') {
        if (ab(f) === 'MON-14' && f.poolAtStart <= 2) { dmg += 2; log(state, 'Брукса: в запасе 2 карты или меньше — +2 урона'); }
        if (ab(f) === 'MON-30' && f.mTurns === 1) { dmg += 3; log(state, 'Тролль: первая атака +3 урона'); }
        if (f.mTurns === 1 && hasGear(p, 'CONT79-05') && !f.once.g05 && dmg > 0) { f.once.g05 = true; const was = dmg; dmg = Math.max(0, dmg - 2); log(state, `Ярдель: урон первой атаки снижен на 2 (${was} → ${dmg})`); }
        if (ab(f) === 'MON-21' && dmg > 0) { dmg -= 1; manticore = true; log(state, 'Мантикора: урон −1, но случайная карта из руки сбрасывается'); }
    }
    // Кухарка (discard ability): «В следующий ход битвы монстра его атака дополнительно наносит 2 урона».
    if (f.mCur && f.mCur.plus) { dmg += f.mCur.plus; log(state, `Кухарка: атака дополнительно наносит ${f.mCur.plus} урона`); }
    if (dmg > 0) seq.push(F('hurtWitcher', { n: dmg, handFirst: ab(f) === 'MON-25' && f.mTurns === 1 }));
    if (manticore) seq.push(F('randomDiscard', { n: 1, why: 'Мантикора', noDeck: true }));
    if (a.k === 'remove') seq.push(F('removeAsk'));
    if (a.k === 'randDiscard') seq.push(F('randomDiscard', { n: a.lvl[f.level - 1], why: 'атака' }));
    if (ab(f) === 'MON-10' && f.mTurns === 1) seq.push(F('randomDiscard', { n: 1, why: 'Виверна', noDeck: true }));
    seq.push(F('afterMonsterTurn'));
    push(state, ...seq);
};
/** Damage to a witcher: shield, then deck, then hand of their choice (База.md p. 23). */
STEPS.hurtWitcher = (state, step) => {
    if (!alive(state)) return;
    const p = fp(state);
    let n = step.n;
    const f = state.fight;
    log(state, `${p.name} получает ${n} урона`);
    fx(state, { k: 'witcherHit', seat: p.seat, n });
    let handN = 0;
    if (step.handFirst) {
        handN = Math.min(n, p.hand.length); n -= handN;
        if (handN) log(state, 'Кладбищенская баба: урон сначала сбрасывает карты из руки');
    }
    const fromShield = Math.min(n, p.shield); p.shield -= fromShield; n -= fromShield;
    let fromDeck = 0;
    const deckIds = [];
    while (n > 0 && p.deck.length) { const id = p.deck.shift(); p.discard.push(id); deckIds.push(id); n--; fromDeck++; }
    if (fromDeck) { log(state, `${p.name} сбрасывает ${fromDeck} карт(ы) с верха колоды`); fx(state, { k: 'deckLoss', seat: p.seat, n: fromDeck }); f.deckLossThisTurn = (f.deckLossThisTurn || 0) + fromDeck; }
    handN += Math.min(n, p.hand.length);
    const attack = !step.notAttack;
    if (fromDeck && attack) onAttackDiscard(state, p, deckIds, true);
    if (handN > 0) {
        if (handN >= p.hand.length) push(state, F('discardFromHandDo', { ids: p.hand.slice(), why: 'урон', attack }));
        else push(state, F('discardFromHandAsk', { n: handN, why: `Урон: сбросьте ${handN} карт(ы) из руки на выбор`, choice: true, attack }));
    }
};
/** Cards discarded from deck/hand by the opponent's attack: `ids`, `fromDeck` — from the deck. */
function onAttackDiscard(state, p, ids, fromDeck) {
    const f = state.fight;
    const n = ids.length;
    if (n <= 0 || !f) return;
    // «По следу монстра»: discard effects of master/unique actions (Уворот, Контратака, Чары паралича).
    for (const id of ids) {
        const od = CARDS[id] && CARDS[id].onDiscard;
        if (!od || (od.deckOnly && !fromDeck)) continue;
        if (od.shield) { gainShield(state, p, od.shield, `«${CARDS[id].name}» сброшена атакой`); }
        if (od.dmg) push(state, F('dealDamage', { n: od.dmg, src: `«${CARDS[id].name}» сброшена атакой` }));
        if (od.fromDiscard) push(state, F('paralysisAsk', { id }));
    }
    if (hasSkillTrophy(p, 'defense') && !f.once.sDef) { f.once.sDef = true; p.shield = Math.min(maxShield(state, p), p.shield + 2); log(state, `${p.name}: трофей защиты — щит +2`); }
}
STEPS.randomDiscard = (state, step) => {
    if (!alive(state)) return;
    const p = fp(state);
    const ids = [];
    let n = step.n;
    shuffle(state, p.hand);
    while (n > 0 && p.hand.length) { const id = p.hand.pop(); p.discard.push(id); ids.push(id); n--; }
    let deckN = 0;
    const deckIds = [];
    if (!step.noDeck) while (n > 0 && p.deck.length) { const id = p.deck.shift(); p.discard.push(id); deckIds.push(id); n--; deckN++; }
    if (ids.length) log(state, `${p.name} сбрасывает случайные карты (${step.why}): ${ids.map(id => '«' + CARDS[id].name + '»').join(', ')}`);
    if (deckN) { log(state, `${p.name} сбрасывает ${deckN} карт(ы) с верха колоды`); state.fight.deckLossThisTurn = (state.fight.deckLossThisTurn || 0) + deckN; }
    fx(state, { k: 'discard', seat: p.seat, ids });
    onAttackDiscard(state, p, ids, false);
    onAttackDiscard(state, p, deckIds, true);
};
/** Чары паралича: discarded from the deck by an attack — any card of the discard (not itself) to the hand. */
STEPS.paralysisAsk = (state, step) => {
    if (!alive(state)) return;
    const p = fp(state);
    const ids = p.discard.filter(id => id !== step.id);
    if (!ids.length) return;
    if (p.bot) { push(state, F('paralysisDo', { ids: [ids.slice().sort((a, b) => cardScore(b) - cardScore(a))[0]] })); return; }
    ask(state, { seat: p.seat, kind: 'cards', from: 'discard', ids, min: 1, max: 1, title: 'Чары паралича', text: 'Карта сброшена из колоды атакой: возьмите 1 любую карту из своего сброса (кроме неё).', op: 'paralysisDo', args: { fight: 1 } });
};
STEPS.paralysisDo = (state, step) => {
    const p = fp(state);
    if (!removeFrom(p.discard, step.ids[0])) return;
    p.hand.push(step.ids[0]);
    log(state, `${p.name}: «Чары паралича» — «${CARDS[step.ids[0]].name}» из сброса в руку`);
};
STEPS.removeAsk = (state) => {
    if (!alive(state)) return;
    const p = fp(state);
    if (!p.hand.length) {
        if (!p.deck.length) return;
        const id = p.deck.shift(); p.removed.push(id);
        log(state, `${p.name}: верхняя карта колоды «${CARDS[id].name}» убрана из игры`);
        return;
    }
    ask(state, { seat: p.seat, kind: 'cards', from: 'hand', ui: 'hand', ids: p.hand.slice(), min: 1, max: 1, title: 'Атака монстра', text: 'Выберите и уберите из игры 1 карту из руки.', op: 'removeDo', args: { fight: 1 } });
};
STEPS.removeDo = (state, step) => {
    const p = fp(state);
    removeFrom(p.hand, step.ids[0]); p.removed.push(step.ids[0]);
    log(state, `${p.name} убирает из игры «${CARDS[step.ids[0]].name}»`);
    fx(state, { k: 'removed', seat: p.seat, id: step.ids[0] });
};
STEPS.afterMonsterTurn = (state) => {
    if (!alive(state)) return;
    const f = state.fight, p = fp(state);
    // Trophy MON-04: lost deck cards during the monster's turn → draw 1.
    if (hasTrophy(p, 'MON-04') && f.deckLossThisTurn && p.deck.length) { drawCards(state, p, 1); log(state, `${p.name}: трофей «Туманник» — +1 карта`); }
    f.deckLossThisTurn = 0;
    // Next chooser: counter-clockwise, skipping the active player.
    const n = state.players.length;
    if (n > 1) { let c = f.chooser; do { c = (c - 1 + n) % n; } while (c === f.seat); f.chooser = c; }
    if (!p.hand.length && !p.deck.length) { endFight(state, 'ko'); return; }
    if (!f.life.length) { endFight(state, 'win'); return; }
    push(state, F('witcherTurn'));
};

// ---------------------------------------------------------------------------------------------
// End of fight and consequences (pp. 26–27)
// ---------------------------------------------------------------------------------------------
function endFight(state, how) {
    const f = state.fight;
    if (f.over) return;
    f.over = how;
    f.stage = 'busy';
    state.queue = state.queue.filter(s => !s.fight);
    if (state.prompt && state.prompt.args && state.prompt.args.fight) state.prompt = null;
    push(state, { op: 'fightConsequences' });
}
STEPS.fightConsequences = (state) => {
    const f = state.fight, p = fp(state);
    const mon = MONSTER[f.mon];
    const slot = state.slots[f.slot];
    let result;
    const steps = [];
    if (f.over === 'win') {
        result = 'win';
        p.gold += 2;
        p.monstersDefeated++;
        log(state, `${p.name} побеждает: ${mon.name}! +2 золота и трофей`, { kind: 'victory' });
        slot.mon = null;
        if (ab(f) === 'MON-18') state.turn.p3fixed = 1;
        steps.push({ op: 'gainTrophy', seat: p.seat, kind: 'monster', id: mon.id });
        if (!state.solo) steps.push({ op: 'spawnMonster', slot: f.slot, level: Math.min(3, mon.level + 1), fromLevel: mon.level, defeated: true });
        else steps.push({ op: 'returnSlotTokens', slot: f.slot });
    } else if (f.life.length <= 1) {
        result = 'chase';
        p.gold += 2;
        log(state, `${p.name} теряет сознание, но прогоняет монстра (${mon.name}): +2 золота и карта стоимости 0`, { kind: 'chase' });
        state.chased[mon.level].push(mon.id);
        slot.mon = null;
        steps.push({ op: 'takeZeroCard', seat: p.seat }, { op: 'spawnMonster', slot: f.slot, level: mon.level, fromLevel: mon.level });
    } else {
        result = 'lose';
        log(state, `${p.name} терпит поражение (${mon.name}): жетон следа, карта стоимости 0, в фазу III −1 карта`, { kind: 'defeat' });
        if (!p.trackTokens[f.terrain] && state.locPiles[f.terrain].length) {
            p.trackTokens[f.terrain] = state.locPiles[f.terrain].pop();
            // A hunting quest for the same monster is discarded (p. 18).
            p.hunts = p.hunts.filter(h => { if (h.terrain === f.terrain) { state.locPiles[h.terrain].push(h.loc); return false; } return true; });
            fx(state, { k: 'track', seat: p.seat, terrain: f.terrain });
        }
        state.turn.drawDelta -= 1;
        steps.push({ op: 'takeZeroCard', seat: p.seat });
    }
    f.result = result;
    if (f.bonusGold && result !== 'lose') { p.gold += f.bonusGold; log(state, `${p.name}: +${f.bonusGold} золото (событие)`); }
    fx(state, { k: 'fightEnd', seat: p.seat, result, mon: mon.id });
    steps.push({ op: 'fightCleanup' });
    // Secret cards of other players («Цири и доп. события»): after the fight is over.
    if (result === 'win' && f.kind === 'monster') steps.push({ op: 'trapCheck', seat: p.seat, on: 'defeat' });
    if (f.elixirsUsed) steps.push({ op: 'trapCheck', seat: p.seat, on: 'fightEnd' });
    // Эдгар де Спота: after a won monster fight (and all its consequences) — event 51.
    if (result === 'win' && hasGear(p, 'CONT79-50') && f.kind === 'monster') steps.push({ op: 'takeEvent', seat: p.seat, id: 'CONT79-51' });
    steps.push({ op: 'phase3' });
    push(state, ...steps);
};
STEPS.fightCleanup = (state) => {
    const f = state.fight;
    if (!f) return;
    const p = fp(state);
    const shieldEnd = p.shield;
    p.shield = 0;
    state.lastFight = { mon: f.mon, result: f.result, seat: p.seat, life: f.life.length, shield: shieldEnd };
    state.fight = null;
    p.shield = maxShield(state, p);
    state.elixirDiscard.push(...f.usedElixirs);
    if (f.usedBombs && f.usedBombs.length) { if (!state.bombDiscard) state.bombDiscard = []; state.bombDiscard.push(...f.usedBombs); }
    state.attackDeck = freshAttackDeck(state);
    p.deck = shuffle(state, [...p.deck, ...p.discard.splice(0), ...p.hand.splice(0)]);
    log(state, `${p.name}: щит восстановлен до ${p.shield}, все карты перемешаны в колоду`);
    // House rule «Возврат эликсиров»: each elixir drunk in this fight may be bought back for 1 gold.
    const back = [];
    if (state.rules && state.rules.elixirReturn && f.usedElixirs.length && p.gold > 0) back.push({ op: 'elixirReturnAsk', seat: p.seat, ids: f.usedElixirs.slice() });
    // House rule «Выбор бомбы и восстановление»: used bombs back for 2 gold each (after the elixirs).
    if (state.rules && state.rules.bombs && f.usedBombs && f.usedBombs.length && p.gold >= 2) back.push({ op: 'bombReturnAsk', seat: p.seat, ids: f.usedBombs.slice() });
    if (back.length) push(state, ...back);
};
STEPS.elixirReturnAsk = (state, step) => {
    const p = state.players[step.seat];
    const ids = step.ids.filter(id => state.elixirDiscard.includes(id));
    const max = Math.min(ids.length, p.gold);
    if (!max) return;
    ask(state, { seat: p.seat, kind: 'cards', from: 'elixirs', ui: 'elixirReturn', ids, min: 0, max, title: 'Возврат эликсиров', text: `Правило стола: каждый выпитый в этой битве эликсир можно вернуть за 1 золото (у вас ${p.gold}).`, op: 'elixirReturnDo', args: { seat: p.seat } });
};
STEPS.elixirReturnDo = (state, step) => {
    const p = state.players[step.seat];
    const ids = (step.ids || []).filter(id => state.elixirDiscard.includes(id)).slice(0, p.gold);
    if (!ids.length) return;
    for (const id of ids) { removeFrom(state.elixirDiscard, id); p.elixirs.push(id); }
    p.gold -= ids.length;
    log(state, `${p.name} возвращает эликсиры за ${ids.length} золота: ${ids.map(id => potionOf(id).name).join(', ')}`, { kind: 'elixir' });
    push(state, { op: 'elixirLimit', seat: p.seat });
};

/** Return location tokens of a freed slot (track tokens, hunts, the slot's own token). */
function returnTokens(state, slotIdx) {
    const slot = state.slots[slotIdx];
    const t = slot.terrain;
    const pile = state.locPiles[t];
    for (const p of state.players) {
        if (p.trackTokens[t] != null) { pile.push(p.trackTokens[t]); p.trackTokens[t] = null; }
        p.hunts = p.hunts.filter(h => { if (h.terrain === t) { pile.push(h.loc); return false; } return true; });
    }
    if (slot.token != null) pile.push(slot.token);
    slot.token = null;
    shuffle(state, pile);
}
STEPS.returnSlotTokens = (state, step) => { returnTokens(state, step.slot); };
STEPS.spawnMonster = (state, step) => {
    const slot = state.slots[step.slot];
    returnTokens(state, step.slot);
    let id = null;
    if (step.defeated && step.fromLevel === 1 && state.extraStack.length) id = state.extraStack.pop();
    else {
        const lvl = step.level;
        if (!state.monsterStacks[lvl].length && state.chased[lvl].length) {
            state.monsterStacks[lvl] = shuffle(state, state.chased[lvl].splice(0));
        }
        id = state.monsterStacks[lvl].pop() || null;
        // Not covered by the rulebook (p. 26 only refills from chased monsters): when a level
        // is exhausted completely, take the nearest lower level, so the board never empties.
        // Decision recorded in docs/witcher/02-decisions.md.
        for (let l = lvl - 1; !id && l >= 1; l--) {
            if (!state.monsterStacks[l].length && state.chased[l].length) state.monsterStacks[l] = shuffle(state, state.chased[l].splice(0));
            id = state.monsterStacks[l].pop() || null;
        }
    }
    slot.token = state.locPiles[slot.terrain].pop() ?? null;
    slot.mon = slot.token != null ? id : null;
    if (slot.mon) {
        log(state, `Новый монстр: ${MONSTER[id].name} (уровень ${MONSTER[id].level}) — ${LOC[slot.token].name}`, { kind: 'spawn' });
        fx(state, { k: 'spawn', mon: id, loc: slot.token });
        onMonsterAppears(state, id);
    }
};

// Shared with engine/vuln.mjs («Уязвимости и особые атаки»).
export { F, fp, alive, hitMonster, gainShield, loseShield, onAttackDiscard, endFight };
