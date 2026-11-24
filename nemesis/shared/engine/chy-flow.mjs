// Queue adapters for Chytrids; the public playability guard remains closed.
import { OPS, ask, next, log, player, pname, playersInRoom, intrudersIn, corridorsOf, placeNoise, cardDef, turnOrder } from './core.mjs';
import { INTRUDER_NAMES } from '../data/cards.mjs';
import { spawnChytrid, placeGerminator, hasChyWeakness, developChyBag } from './chytrids.mjs';
import { surpriseAttack, encounterLine } from './surprise.mjs';

function noiseAround(state, id) { for (const c of corridorsOf(state, id)) placeNoise(state, c.id); }
OPS['chy.encounter'] = (state, step) => {
    const token = step.token, p = player(state, step.player);
    if (!token) return;
    if (token === 'blank') {
        state.bag.push(token); noiseAround(state, step.room);
        if (state.bagLast) state.bagLast.effect = 'Пустой жетон: шум во всех коридорах; жетон возвращён.';
        return;
    }
    if (!['stinkhorn','deathcap','chyQueen'].includes(token.type) || !token.id) throw new Error('Invalid Chytrid token');
    state.chytridAside.push(token);
    if (!p || p.status !== 'active' || p.room !== step.room) return;
    if (token.type === 'chyQueen' && state.chyQueenDead) {
        // The dead Queen's tokens grow the leftmost available laboratory die instead.
        const slot = state.chyGermSlots.find(s => s.cube && s.cube.level < 3);
        if (slot) slot.cube.level++;
        return;
    }
    if ((token.type === 'deathcap' || token.type === 'chyQueen') && !state.roomState[step.room].chyGerm && !state.roomState[step.room].chyMycelium) {
        placeGerminator(state, step.room);
        if (state.shipDestroyed) return;
        noiseAround(state, step.room);
        if (state.bagLast) state.bagLast.effect = 'Вместо хитрида помещается нарост и шум во всех коридорах.';
        return;
    }
    const it = spawnChytrid(state, token.type, step.room);
    if (!it) return;
<<<<<<< HEAD
    if (state.bagLast) state.bagLast.effect = 'Появляется ' + INTRUDER_NAMES[it.type] + ' (значение жетона ' + token.value + '); жетон уходит в запас. Если в руке меньше ' + token.value + ' карт (с учётом слабости/эффектов хитридов), чужой сразу атакует.';
=======
    if (state.bagLast) state.bagLast.effect = encounterLine(INTRUDER_NAMES[it.type], chySurpriseValue(state, token.value),
        hasChyWeakness(state, 'heightenedReadiness') ? '«Повышенная готовность»: порог −1.' : '');
>>>>>>> 1dfc922873aae94caa38cab68cb564432e9d3209
    const then = { ...step, op: 'chy.encounterSurprise', intruder: it.uid };
    const holder = playersInRoom(state, step.room).find(o => o.hand.some(c => (cardDef(state, c) || {}).effect === 'fdPredictable'));
    if (holder && !step.noPredict) {
        const card = holder.hand.find(c => (cardDef(state, c) || {}).effect === 'fdPredictable');
        ask(state, { kind: 'choice', player: holder.id, title: 'Сыграть «Предсказуемые движения»: ' + INTRUDER_NAMES[it.type] + ' получает 1 ранение?',
            options: [{ id: 'yes', label: 'Да' }, { id: 'no', label: 'Нет' }] },
            { op: 'predict.spawn', player: holder.id, card, intruder: it.uid, then });
    } else next(state, then);
};
/** Printed value of a Chytrid token, tuned by the pack's vulnerability. */
export function chySurpriseValue(state, value) {
    return Math.max(1, value - (hasChyWeakness(state, 'heightenedReadiness') ? 1 : 0));
}
OPS['chy.encounterSurprise'] = (state, step) => {
    const p = player(state, step.player), it = state.intruders[step.intruder];
    if (!p || p.status !== 'active' || p.room !== step.room || !it || it.room !== step.room || step.noSurprise) return;
    surpriseAttack(state, it, p, chySurpriseValue(state, step.token.value));
};
OPS['chy.bagDevelop'] = (state, step) => {
    if (!step.token) return;
    const result = developChyBag(state, step.token);
    if (result.noise) {
        if (state.bagLast) state.bagLast.effect = 'Жетон возвращён; персонажи вне боя бросают шум.';
        next(state, ...turnOrder(state).filter(p => p.status === 'active' && !p.pod && !intrudersIn(state, p.room).length)
            .map(p => ({ op: 'noise.roll', player: p.id, room: p.room })));
    } else if (state.bagLast) state.bagLast.effect = 'Жетон возвращён; применён эффект хитридов.';
};
