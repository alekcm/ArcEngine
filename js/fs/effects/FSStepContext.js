// FSStepContext.js — рамка одного шага эффекта.
//
// Ветки шага раньше были телом одного apply(), и всё нужное им лежало в
// локальных переменных: игрок, бой, сторона, ответ, помощники для кубиков.
// Теперь эти значения живут в объекте-рамке, который создаётся один раз на шаг
// и передаётся исполнителю. Ни одно поле не копирует состояние: p, combat,
// side указывают на те же объекты, что и раньше, поэтому запись через рамку
// по-прежнему меняет state.

class StepContext {
    /**
     * @param {any} R фасад правил
     * @param {any} state состояние партии
     * @param {number} seat чей это шаг
     * @param {any} step сам шаг
     * @param {any} answer ответ игрока (может быть пустым)
     * @param {any} ctx контекст эффекта (вид, владелец, противник)
     * @param {any} effects FS_EFFECTS — помощники вроде count, kindName, sameName
     * @param {number} [sideSeat] whose side the frame speaks for; the seat itself
     *   unless the caller says otherwise (the action of a step looks at the side
     *   of the owner of the card, the question — at the side of the answering seat)
     */
    constructor(R, state, seat, step, answer, ctx, effects, sideSeat) {
        const combat = state.combat;
        const inCombat = !!(ctx && ctx.kind === 'combat' && combat);
        const owner = ctx && ctx.owner !== undefined ? ctx.owner : seat;
        const view = sideSeat === undefined || sideSeat === null ? seat : sideSeat;
        const side = inCombat ? CombatSides.sideOf(combat, view) : null;
        // The other seat of the battle, from the same point of view.
        const foe = inCombat ? CombatSides.foeSeat(combat, view) : null;
        // The opponent of the effect: the other side of the combat, the foe that was
        // chosen by the card, or simply another player at the table.
        const other = ctx && ctx.foe !== undefined ? ctx.foe : null;
        this.R = R;
        this.state = state;
        this.seat = seat;
        this.step = step;
        this.answer = answer || {};
        this.ctx = ctx || {};
        this.effects = effects;
        this.p = state.players[seat];
        this.combat = combat;
        this.inCombat = inCombat;
        this.owner = owner;
        this.side = side;
        this.foe = foe;
        this.other = other;
        this.target = step.who === 'foe'
            ? (inCombat
                ? (owner === combat.attacker ? combat.defender : combat.attacker)
                : (other !== null ? other : (state.players.find(x => x.seat !== owner) || {}).seat))
            : owner;
        this.units = ids => (this.answer.units || ids || [])
            .map(id => state.units.find(u => u.id === id)).filter(Boolean);
        // The dice the step points at and the faces they may have: the answer
        // cannot reach a die that is spent, of a wrong face, or on the wrong
        // side of the combat.
        this.diceSide = s2 => (inCombat ? (step && step.who === 'foe' ? s2 : side) : side);
        this.diceTarget = () => this.diceSide(CombatSides.foe(side));
        this.diceAllowed = (face) => {
            if (!inCombat) return true;
            const kinds = Array.isArray(step && step.kinds) && step.kinds.length ? step.kinds : [step && step.kind];
            if (!kinds.length || kinds.includes('any')) return true;
            return kinds.includes(face);
        };
        // The turn of the battle answers about the dice: which one is still
        // rolled, whether the answer may reach it, how many are left.
        this.turn = combat ? CombatTurn.of(combat) : null;
        this.liveIndex = (s2, i) => !!this.turn && this.turn.has(s2, i)
            && this.diceAllowed(this.turn.dice(s2)[i]);
    }
}
