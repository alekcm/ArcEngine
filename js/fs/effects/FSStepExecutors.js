// FSStepExecutors.js — кто исполняет шаг карты.
//
// FS_EFFECTS.apply больше не держит switch: он спрашивает у этой таблицы
// исполнителя по имени шага (step.op) и отдаёт ему рамку шага. Новая ветка —
// метод в своей группе и строка в её списке ops; регистрация здесь одна.

const STEP_GROUPS = [DiceSteps, GainSteps, PurchaseSteps, PlaceSteps, MoveSteps, DestroySteps, PlaySteps, ChooseSteps];

/** @type {Map<string, (effects: any, frame: any) => any>} */
const STEP_EXECUTORS = new Map();
for (const group of STEP_GROUPS) {
    for (const op of group.ops) STEP_EXECUTORS.set(op, group[op].bind(group));
}
