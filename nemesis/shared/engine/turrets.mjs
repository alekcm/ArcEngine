// turrets.mjs — optional Aftermath turrets used with the Original rules.
// Aftermath rulebook, pp. 4–5. Redux and the other DLC sets do not use these rules.

import { OPS, ask, next, log, roomName, tileOf, loseHealth, playersInRoom, intrudersIn } from './core.mjs';
import { INTRUDER_NAMES } from '../data/cards.mjs';
import { originalApplyWounds } from './original.mjs';

const STATUS_LABELS = { inactive: 'Неактивна', all: 'Цель: все', intruders: 'Цель: пришельцы' };
export const turretStatusLabel = status => STATUS_LABELS[status] || 'Статус скрыт';
const originalBase = state => state.rules === 'original' && state.enemySet === 'redux';

export function placeTurret(state, roomId) {
    if (!originalBase(state) || !state.roomState[roomId] || ['nest', 'contaminated'].includes(tileOf(state, roomId))) return null;
    if (state.turrets.some(t => !t.destroyed && t.room === roomId)) return null;
    if (state.turrets.length >= 3) {
        log(state, 'Нет свободной фигурки турели — турель не размещена.', 'minor');
        return null;
    }
    const id = (state.turrets.reduce((n, t) => Math.max(n, t.id), 0) || 0) + 1;
    const turret = { id, room: roomId, status: null, destroyed: false };
    state.turrets.push(turret);
    state.roomState[roomId].turretId = id;
    log(state, 'В отсеке ' + roomName(state, roomId) + ' обнаружена турель; её статус пока скрыт.', 'event');
    return turret;
}

export function turretAt(state, roomId) {
    return (state.turrets || []).find(t => !t.destroyed && t.room === roomId) || null;
}

function actualStatus(state, turret) {
    return turret && (turret.status || (state.secret && state.secret.turretStatuses && state.secret.turretStatuses[turret.id - 1]) || 'inactive');
}
function reveal(state, turret) {
    if (!turret || turret.status) return turret;
    turret.status = actualStatus(state, turret);
    log(state, 'Статус турели в отсеке ' + roomName(state, turret.room) + ': ' + STATUS_LABELS[turret.status] + '.', 'event');
    return turret;
}

/** Called when a character enters a room during the Player Phase. */
export function turretOnCharacterEntry(state, p, roomId = p && p.room) {
    if (!originalBase(state) || state.phase !== 'player' || !p || p.status !== 'active') return;
    const turret = reveal(state, turretAt(state, roomId));
    if (turret && turret.status === 'all') {
        log(state, 'Турель стреляет по ' + p.name + ' при входе в отсек.', 'combat');
        loseHealth(state, p, 1, 'выстрел турели');
    }
}

/** Called after an Intruder appears in a room during the Player Phase. */
export function turretOnIntruderEntry(state, it) {
    if (!originalBase(state) || state.phase !== 'player' || !it || !state.intruders[it.uid]) return;
    const turret = turretAt(state, it.room);
    if (!turret || !['all', 'intruders'].includes(actualStatus(state, turret))) return;
    log(state, 'Турель стреляет по ' + (INTRUDER_NAMES[it.type] || it.type) + ' при появлении в отсеке.', 'combat');
    originalApplyWounds(state, it, 1);
}
OPS['turret.intruderEntry'] = (state, step) => turretOnIntruderEntry(state, state.intruders[step.intruder]);

function destroyTurret(state, turret) {
    if (!turret || turret.destroyed) return false;
    turret.destroyed = true;
    if (state.roomState[turret.room]) delete state.roomState[turret.room].turretId;
    log(state, 'Турель уничтожена и убрана из игры.', 'event');
    return true;
}

/** Event Phase, step 6 alongside fire damage: active turrets shoot their room occupants. */
OPS['turret.eventPhase'] = state => {
    if (!originalBase(state)) return;
    for (const turret of state.turrets || []) {
        const status = actualStatus(state, turret);
        if (turret.destroyed || status === 'inactive') continue;
        // Intruders destroy an active turret at the same Event-Phase step that turrets fire.
        // Capture occupants first so a turret and its attacker can destroy each other this step.
        const intrudersAtStart = intrudersIn(state, turret.room).slice();
        if (status === 'all') {
            for (const p of playersInRoom(state, turret.room)) {
                log(state, 'Турель стреляет по ' + p.name + ' в фазе событий.', 'combat');
                loseHealth(state, p, 1, 'выстрел турели');
            }
        }
        for (const it of intrudersAtStart) {
            if (!state.intruders[it.uid]) continue;
            log(state, 'Турель стреляет по чужому в фазе событий.', 'combat');
            originalApplyWounds(state, it, 1);
        }
        if (intrudersAtStart.length) destroyTurret(state, turret);
    }
};

/** The Defense Room's Control Turrets action can select any non-destroyed turret. */
OPS['turret.control'] = (state, step) => {
    if (!originalBase(state)) return next(state, step.then);
    const turret = (state.turrets || []).find(t => t.id === Number(step.turretId) && !t.destroyed);
    if (!turret) return next(state, step.then);
    if (!step.answer) {
        ask(state, { kind: 'choice', player: step.player, title: 'Выберите новый статус турели',
            options: Object.entries(STATUS_LABELS).map(([id, label]) => ({ id, label })) },
            { op: 'turret.control', player: step.player, turretId: turret.id, then: step.then });
        return;
    }
    if (!Object.hasOwn(STATUS_LABELS, step.answer)) return next(state, step.then);
    turret.status = step.answer;
    log(state, 'Статус турели в отсеке ' + roomName(state, turret.room) + ' изменён: ' + STATUS_LABELS[turret.status] + '.', 'event');
    next(state, step.then);
};

OPS['turret.destroy'] = (state, step) => {
    if (!originalBase(state)) return next(state, step.then);
    const turret = (state.turrets || []).find(t => t.id === Number(step.turretId) && !t.destroyed);
    if (turret && turret.status !== 'inactive') destroyTurret(state, turret);
    else if (turret) log(state, 'Неактивную турель нельзя уничтожить.', 'minor');
    next(state, step.then);
};
