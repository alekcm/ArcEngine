// Carnomorph mutation actions. All prompts and continuations are plain serializable steps.
import { CARNOMORPH_MUTATIONS } from '../data/carnomorphs.mjs';
import { INTRUDER_NAMES, WOUNDS } from '../data/cards.mjs';
import { OPS, ask, next, log, player, pname, room, roomName, playersInRoom, intrudersIn, inCombat,
    isContam, isInfected, discardCard, removeCardFromGame, gainContamination, drawCards,
    removeWound, restoreHealth, loseHealth, gainWound, maxAllowedHealth, needDice, fmtRoll } from './core.mjs';
import { removeCarnomorphMutation } from './carnomorphs.mjs';
import { dealHits, applyHitsNoRoll } from './combat.mjs';
import { repelIntruder } from './intruders.mjs';

const activeCards = new Set(['adaptation', 'regeneration', 'gastric', 'boilingBlood', 'claw', 'scream', 'escapeArtist', 'genomeError', 'shapeChange', 'trickster']);
const peaceful = new Set(['adaptation', 'regeneration', 'gastric', 'genomeError', 'shapeChange', 'trickster']);
const types = new Set(['metagorger', 'shambler', 'breeder', 'butcher']);
const localTargets = (state, p) => intrudersIn(state, p.room).filter(i => types.has(i.type));
const foodObjects = (state, p) => room(state, p.room).objects.map((o, i) => ({ ...o, i })).filter(o => o.type === 'egg' || o.type === 'carcass');

/** Only the owner's menu sees an unrevealed card's identity. Reactive cards have no turn action. */
export function mutationActionAvailability(state, p) {
    const id = p.mutationCard, card = CARNOMORPH_MUTATIONS[id];
    if (!card || !activeCards.has(id)) return null;
    let reason = '';
    if (!p.hand.some(isContam)) reason = 'Нужна карта заражения в руке';
    else if (peaceful.has(id) && inCombat(state, p)) reason = 'Нельзя в бою';
    else if (id === 'gastric' && !foodObjects(state, p).length) reason = 'В комнате нет яйца или останков';
    else if (id === 'claw' && !localTargets(state, p).length) reason = 'В комнате нет карноморфов';
    else if (id === 'scream' && !localTargets(state, p).some(it => it.type !== 'metagorger')) reason = 'Нужен карноморф, кроме глодателя';
    else if (id === 'escapeArtist' && !inCombat(state, p)) reason = 'Нужен бой с карноморфом';
    else if (id === 'shapeChange' && (!state.ship.rooms[p.room].tech || !Object.values(state.ship.rooms).some(r => r.tech && r.id !== p.room))) reason = 'Нет подходящего входа в техкоридоры';
    return { label: 'Мутация: «' + card.name + '»', ok: !reason, reason };
}

OPS['mutation.start'] = (state, step) => {
    const p = player(state, step.player);
    if (!p || p.status !== 'active' || state.enemySet !== 'carnomorphs') { next(state, step.then); return; }
    const avail = step.trigger ? (p.mutationCard === step.trigger && p.hand.some(isContam) ? { ok: true } : null) : mutationActionAvailability(state, p);
    if (!avail || !avail.ok) { next(state, step.then); return; }
    ask(state, { kind: 'cards', secret: true, player: p.id, title: 'Мутация: выберите карту заражения для сканирования',
        cards: p.hand.filter(isContam), min: 1, max: 1 },
        { op: 'mutation.scan', player: p.id, card: p.mutationCard, payload: step.payload, then: step.then });
};
OPS['mutation.scan'] = (state, step) => {
    const p = player(state, step.player), selected = step.answer[0];
    if (p.status !== 'active' || p.mutationCard !== step.card || !p.hand.includes(selected) || !isContam(selected)) { next(state, step.then); return; }
    const infected = isInfected(state, selected);
    p.mutationRevealed = true;
    if (infected) discardCard(state, p, selected);
    else { removeCardFromGame(state, p, selected); gainContamination(state, p, 1); }
    log(state, pname(p) + ' раскрывает мутацию «' + CARNOMORPH_MUTATIONS[step.card].name + '»: ' + (infected ? 'заражён.' : 'не заражён.'), 'action');
    if (p.status !== 'active') { next(state, step.then); return; }
    next(state, { op: 'carnomorph.gainMarker', player: p.id },
        { op: 'mutation.effect', player: p.id, card: step.card, infected, payload: step.payload, then: step.then });
};
OPS['mutation.effect'] = (state, step) => {
    const p = player(state, step.player), then = step.then;
    if (!p || p.status !== 'active' || p.mutationCard !== step.card) { next(state, then); return; }
    switch (step.card) {
        case 'adaptation': {
            removeCarnomorphMutation(state, p);
            const cards = state.mutationDeck.splice(0, step.infected ? 3 : 1);
            if (!cards.length) { log(state, 'Колода мутаций пуста.', 'minor'); next(state, then); return; }
            if (cards.length === 1) { p.mutationCard = cards[0]; p.mutationRevealed = false; next(state, then); return; }
            ask(state, { kind: 'choice', secret: true, player: p.id, title: 'Адаптация: выберите новую карту мутации',
                options: cards.map(id => ({ id, label: CARNOMORPH_MUTATIONS[id].name, desc: 'Заражён: ' + CARNOMORPH_MUTATIONS[id].infected + ' Не заражён: ' + CARNOMORPH_MUTATIONS[id].clean })) },
                { op: 'mutation.adaptationPick', player: p.id, cards, then });
            return;
        }
        case 'regeneration': {
            const wounds = [...new Set(p.wounds)];
            if (!wounds.length) { next(state, then); return; }
            ask(state, { kind: 'choice', player: p.id, title: 'Регенерация тканей: какую травму вылечить?',
                options: wounds.map(w => ({ id: w, label: WOUNDS[w].name })) }, { op: 'mutation.healWound', player: p.id, then });
            return;
        }
        case 'gastric': {
            const objects = foodObjects(state, p);
            if (!objects.length) { next(state, then); return; }
            ask(state, { kind: 'choice', player: p.id, title: 'Гастрономическая революция: что поглотить?',
                options: objects.map(o => ({ id: String(o.i), label: o.type === 'egg' ? 'Яйцо пришельца' : 'Останки пришельца' })) },
                { op: 'mutation.eat', player: p.id, infected: step.infected, then });
            return;
        }
        case 'boilingBlood': {
            const victims = step.infected ? playersInRoom(state, p.room).filter(o => o.id !== p.id).map(o => o.id) : [];
            const targets = localTargets(state, p).map(it => it.uid);
            next(state, ...victims.map(id => ({ op: 'mutation.bloodVictim', player: id })),
                ...targets.map(uid => ({ op: 'mutation.bloodIntruder', intruder: uid })), then);
            return;
        }
        case 'claw': case 'scream': {
            const targets = localTargets(state, p).filter(it => step.card !== 'scream' || it.type !== 'metagorger');
            if (!targets.length) { next(state, then); return; }
            ask(state, { kind: 'choice', player: p.id, title: step.card === 'claw' ? 'Клешня: выберите цель' : 'Крик: выберите цель',
                options: targets.map(it => ({ id: it.uid, label: INTRUDER_NAMES[it.type] })) },
                { op: step.card === 'claw' ? 'mutation.clawTarget' : 'mutation.screamTarget', player: p.id, infected: step.infected, then });
            return;
        }
        case 'escapeArtist':
            next(state, { op: 'move.start', player: p.id, noAttacks: step.infected, noNoise: true, then }); return;
        case 'genomeError':
            drawCards(state, p, step.infected ? 2 : 1);
            if (p.status !== 'active') { next(state, then); return; }
            if (!p.hand.some(isContam)) { next(state, then); return; }
            if (step.infected) {
                ask(state, { kind: 'choice', secret: true, player: p.id, title: 'Ошибка генома: убрать все заражения с руки?',
                    options: [{ id: 'yes', label: 'Убрать все' }, { id: 'no', label: 'Оставить' }] },
                    { op: 'mutation.genomeAll', player: p.id, then });
            } else {
                ask(state, { kind: 'cards', secret: true, player: p.id, title: 'Ошибка генома: можете убрать одну карту заражения',
                    cards: p.hand.filter(isContam), min: 0, max: 1 }, { op: 'mutation.genomeOne', player: p.id, then });
            }
            return;
        case 'mimicry': {
            const attack = step.payload && step.payload.attack;
            if (!attack) { next(state, then); return; }
            const others = playersInRoom(state, p.room).filter(o => o.id !== p.id);
            if (!others.length) {
                if (step.infected) { log(state, pname(p) + ': мимикрия игнорирует атаку.', 'good'); next(state, then); }
                else next(state, attack, then);
                return;
            }
            ask(state, { kind: 'choice', player: p.id, title: 'Мимикрия: кто станет целью атаки?',
                options: others.map(o => ({ id: String(o.id), label: pname(o) })) },
                { op: 'mutation.mimicryTarget', player: p.id, attack, then });
            return;
        }
        case 'senses': {
            const noise = step.payload && step.payload.noise;
            const first = step.payload && step.payload.first;
            if (!noise) { next(state, then); return; }
            if (!step.infected) {
                next(state, { ...noise, forced: undefined, mutationForced: undefined, mutationOffered: true, rerolled: true }, then);
                return;
            }
            const values = [1, 2, 3, 4, 'encounter'].filter(value => value !== first);
            ask(state, { kind: 'choice', player: p.id, title: 'Острые чувства: выберите новый результат шума',
                options: values.map(value => ({ id: String(value), label: value === 'encounter' ? 'Встреча' : 'Коридор ' + value })) },
                { op: 'mutation.sensesResult', player: p.id, noise, then });
            return;
        }
        case 'shapeChange': {
            const rooms = Object.keys(state.ship.rooms).filter(r => state.ship.rooms[r].tech && r !== p.room);
            if (!state.ship.rooms[p.room].tech || !rooms.length) { next(state, then); return; }
            ask(state, { kind: 'room', player: p.id, title: 'Смена формы: куда через техкоридоры?', rooms },
                { op: 'mutation.shapeDestination', player: p.id, infected: step.infected, then });
            return;
        }
        case 'trickster':
            next(state, { op: 'move.start', player: p.id, preserveDoor: true, noNoise: step.infected, then }); return;
        default: throw new Error('Unsupported mutation action: ' + step.card);
    }
};
OPS['mutation.adaptationPick'] = (state, step) => {
    const p = player(state, step.player);
    p.mutationCard = step.answer; p.mutationRevealed = false;
    state.mutationDiscard.push(...step.cards.filter(id => id !== step.answer));
    next(state, step.then);
};
OPS['mutation.healWound'] = (state, step) => { removeWound(state, player(state, step.player), step.answer); next(state, step.then); };
OPS['mutation.eat'] = (state, step) => {
    const p = player(state, step.player), objects = room(state, p.room).objects, i = Number(step.answer);
    if (!objects[i] || !['egg', 'carcass'].includes(objects[i].type)) { next(state, step.then); return; }
    objects.splice(i, 1);
    if (!step.infected) { drawCards(state, p, 2); next(state, step.then); return; }
    const opts = [{ id: 'health', label: 'Вылечить все лёгкие ранения' }, ...[...new Set(p.wounds)].map(w => ({ id: w, label: 'Вылечить травму: ' + WOUNDS[w].name }))];
    ask(state, { kind: 'choice', player: p.id, title: 'Гастрономическая революция: что вылечить?', options: opts },
        { op: 'mutation.eatHeal', player: p.id, then: step.then });
};
OPS['mutation.eatHeal'] = (state, step) => {
    const p = player(state, step.player);
    if (step.answer === 'health') restoreHealth(state, p, Math.max(0, maxAllowedHealth(p) - p.health));
    else removeWound(state, p, step.answer);
    drawCards(state, p, 2); next(state, step.then);
};
OPS['mutation.bloodVictim'] = (state, step) => {
    const p = player(state, step.player);
    if (!p || p.status !== 'active') return;
    loseHealth(state, p, 1, 'кипящая кровь');
    if (p.status === 'active') gainWound(state, p, 1);
};
OPS['mutation.bloodIntruder'] = (state, step) => { const it = state.intruders[step.intruder]; if (it) applyHitsNoRoll(state, it, 1); };
OPS['mutation.clawTarget'] = (state, step) => {
    const it = state.intruders[step.answer], p = player(state, step.player);
    if (!it || it.room !== p.room) { next(state, step.then); return; }
    if (!step.infected) { applyHitsNoRoll(state, it, 1); next(state, step.then); return; }
    next(state, { op: 'mutation.clawAttack', player: p.id, intruder: it.uid, then: step.then });
};
OPS['mutation.clawAttack'] = (state, step) => {
    const p = player(state, step.player), it = state.intruders[step.intruder];
    if (!it || p.status !== 'active' || it.room !== p.room) { next(state, step.then); return; }
    if (needDice(state, step, 'combat', p.id, 'Бросок боя — мутация «Клешня»')) return;
    dealHits(state, p, it, 2, 0);
    next(state, step.then);
};
OPS['mutation.screamTarget'] = (state, step) => {
    const p = player(state, step.player), it = state.intruders[step.answer];
    if (!it || it.type === 'metagorger' || it.room !== p.room) { next(state, step.then); return; }
    if (!step.infected) { repelIntruder(state, it); next(state, step.then); return; }
    const rooms = state.ship.rooms[it.room].exits.map(e => e.to);
    if (!rooms.length) { next(state, step.then); return; }
    ask(state, { kind: 'room', player: p.id, title: 'Крик: куда отступит карноморф?', rooms },
        { op: 'mutation.screamDestination', player: p.id, intruder: it.uid, then: step.then });
};
OPS['mutation.screamDestination'] = (state, step) => {
    const it = state.intruders[step.intruder]; if (it) repelIntruder(state, it, step.answer);
    next(state, step.then);
};
OPS['mutation.genomeAll'] = (state, step) => {
    const p = player(state, step.player);
    if (step.answer === 'yes') for (const c of [...p.hand].filter(isContam)) removeCardFromGame(state, p, c);
    next(state, step.then);
};
OPS['mutation.genomeOne'] = (state, step) => {
    const p = player(state, step.player), card = step.answer[0];
    if (card && p.hand.includes(card) && isContam(card)) removeCardFromGame(state, p, card);
    next(state, step.then);
};
OPS['mutation.shapeDestination'] = (state, step) => next(state, { op: 'move.direct', player: step.player, dest: step.answer, noNoise: step.infected, then: step.then });

// Reactive mutations are offered only in their printed windows, never as ordinary turn actions.
OPS['mutation.offerMimicry'] = (state, step) => {
    if (step.answer !== 'yes') { next(state, step.attack); return; }
    next(state, { op: 'mutation.start', player: step.player, trigger: 'mimicry', payload: { attack: step.attack }, then: { op: 'noop' } });
};
OPS['mutation.mimicryTarget'] = (state, step) => {
    const p = player(state, step.player), target = player(state, Number(step.answer));
    if (target && target.status === 'active' && target.room === p.room && !target.pod)
        next(state, { ...step.attack, player: target.id, redirected: true, mutationOffered: true }, step.then);
    else next(state, step.attack, step.then);
};
OPS['mutation.offerSenses'] = (state, step) => {
    if (step.answer !== 'yes') { next(state, { ...step.noise, mutationForced: step.first, mutationOffered: true }); return; }
    next(state, { op: 'mutation.start', player: step.player, trigger: 'senses', payload: { noise: step.noise, first: step.first }, then: { op: 'noop' } });
};
OPS['mutation.sensesResult'] = (state, step) => {
    const value = step.answer === 'encounter' ? 'encounter' : Number(step.answer);
    if (state.lastRoll && state.lastRoll.die === 'noise') state.lastRoll.value = value;
    log(state, '🧬 Острые чувства: результат шума изменён на «' + fmtRoll(value) + '».', 'noise');
    next(state, { ...step.noise, mutationForced: value, mutationOffered: true }, step.then);
};
