// turrets.mjs — optional Aftermath turrets used with the Original rules.
// Aftermath rulebook, p. 5. Redux and the other DLC sets do not use these rules.

import { OPS, ask, next, log, roomName, tileOf, loseHealth, intrudersIn, recordTurretEntry } from './core.mjs';
import { INTRUDER_NAMES } from '../data/cards.mjs';
import { originalApplyWounds } from './original.mjs';

const STATUS_LABELS = { inactive: 'Неактивна', all: 'Цель: все', intruders: 'Цель: пришельцы' };
export const turretStatusLabel = status => STATUS_LABELS[status] || 'Статус скрыт';
const originalBase = state => state.rules === 'original' && state.enemySet === 'redux';

export function placeTurret(state, roomId) {
    const roomState = state.roomState[roomId];
    if (!originalBase(state) || !roomState || tileOf(state, roomId) === 'nest' || roomState.slimeCovered) return null;
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
    if (!turret) return null;
    const hidden = state.secret && state.secret.turretStatuses;
    return turret.status || (Array.isArray(hidden) ? hidden[turret.id - 1] : hidden && hidden[turret.id]) || 'inactive';
}
function reveal(state, turret) {
    if (!turret || turret.status) return turret;
    turret.status = actualStatus(state, turret);
    log(state, 'Статус турели в отсеке ' + roomName(state, turret.room) + ': ' + STATUS_LABELS[turret.status] + '.', 'event');
    return turret;
}

/** A Character entering reveals the current face-down Status and records a Fire-Damage-step entrant. */
export function turretOnCharacterEntry(state, p, roomId = p && p.room) {
    if (!originalBase(state) || !p) return;
    recordTurretEntry(state, 'character', p.id, roomId);
    if (p.status === 'active') reveal(state, turretAt(state, roomId));
}

/** Intruders that spawn or move into a Room are recorded; fire is deferred to the Fire Damage step. */
export function turretOnIntruderEntry(state, it) {
    if (!originalBase(state) || !it || !state.intruders[it.uid]) return;
    recordTurretEntry(state, 'intruder', it.uid, it.room);
}
OPS['turret.intruderEntry'] = (state, step) => turretOnIntruderEntry(state, state.intruders[step.intruder]);

function destroyTurret(state, turret) {
    if (!turret || turret.destroyed) return false;
    turret.destroyed = true;
    if (state.roomState[turret.room]) delete state.roomState[turret.room].turretId;
    log(state, 'Турель уничтожена и убрана из игры.', 'event');
    return true;
}

/** Fire Damage step: Turrets shoot entrants from this turn; an Intruder in the Room destroys any active Turret. */
OPS['turret.eventPhase'] = state => {
    if (!originalBase(state)) return;
    const entries = (state.turretEntries || []).slice();
    for (const turret of state.turrets || []) {
        if (turret.destroyed) continue;
        const status = actualStatus(state, turret);
        if (status === 'inactive') continue;
        const intrudersAtStart = intrudersIn(state, turret.room).slice();
        const entered = entries.filter(e => e.room === turret.room);
        if (status === 'all') {
            for (const e of entered) {
                if (e.kind !== 'character') continue;
                const p = state.players[e.id];
                if (!p || p.status !== 'active' || p.pod) continue;
                log(state, 'Турель стреляет по ' + p.name + ' в фазе урона от огня.', 'combat');
                loseHealth(state, p, 1, 'выстрел турели');
            }
        }
        for (const e of entered) {
            if (e.kind !== 'intruder' || (status !== 'all' && status !== 'intruders')) continue;
            const it = state.intruders[e.id];
            if (!it) continue;
            log(state, 'Турель стреляет по ' + (INTRUDER_NAMES[it.type] || it.type) + ' в фазе урона от огня.', 'combat');
            originalApplyWounds(state, it, 1);
        }
        // The Intruder destruction and Turret shot are simultaneous: use the room occupancy captured
        // before firing, so even a Turret-killed Intruder still destroys the active Turret this step.
        if (intrudersAtStart.length) destroyTurret(state, turret);
    }
    state.turretEntries = [];
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
    if (Array.isArray(state.secret.turretStatuses)) state.secret.turretStatuses[turret.id - 1] = step.answer;
    else {
        state.secret.turretStatuses ||= {};
        state.secret.turretStatuses[turret.id] = step.answer;
    }
    turret.status = null; // the new Status token is placed facedown; it is revealed on room entry
    log(state, 'Новый статус турели в отсеке ' + roomName(state, turret.room) + ' помещён лицом вниз.', 'event');
    next(state, step.then);
};

OPS['turret.destroy'] = (state, step) => {
    if (!originalBase(state)) return next(state, step.then);
    const turret = (state.turrets || []).find(t => t.id === Number(step.turretId) && !t.destroyed);
    if (turret && actualStatus(state, turret) !== 'inactive') destroyTurret(state, turret);
    else if (turret) log(state, 'Неактивную турель нельзя уничтожить.', 'minor');
    next(state, step.then);
};
