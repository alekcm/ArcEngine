// FSAskExecutors.js — кто решает, ЧТО шаг спросит у игрока.
//
// FS_EFFECTS.step больше не держит switch: он собирает рамку шага и спрашивает
// у этой таблицы, какой вопрос задать. Новая ветка — метод в своей группе
// (js/fs/effects/ask/*) и её имя в списке ops группы.

const ASK_GROUPS = [PlaceAsks, DiceAsks, TokenAsks, EarnAsks, BuyAsks, CardAsks, StrikeAsks, OrderAsks];

/** @type {Map<string, (effects: any, frame: any) => any>} */
const ASK_EXECUTORS = new Map();
for (const group of ASK_GROUPS) {
    for (const op of group.ops) ASK_EXECUTORS.set(op, group[op].bind(group));
}
