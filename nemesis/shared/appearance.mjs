// appearance.mjs — network-safe character mesh presets. Each slot starts with the original model;
// colours remain independent. The workshop, server validation and table figure share these choices.
// The Lab Rat keeps her gown, blindfold, bare feet and implants; the Sentry keeps his sealed helmet,
// optics, respirator, armour, cloak and weapon.
export const LABRAT_PARTS = [
    { id: 'hair', label: 'Волосы', hint: 'Длинные пряди', options: [
        { id: 'loose', label: 'Распущенные', detail: 'Оригинал' },
        { id: 'messy', label: 'Спутанные', detail: 'Неровные пряди' },
        { id: 'ponytail', label: 'Собранные', detail: 'Небрежный хвост' },
    ] },
    { id: 'eyes', label: 'Повязка', hint: 'Закрывает глаза', options: [
        { id: 'bandage', label: 'Обычная', detail: 'Оригинал' },
        { id: 'wide', label: 'Широкая', detail: 'Плотная ткань' },
        { id: 'layered', label: 'Слоями', detail: 'Полосы бинта' },
        { id: 'tails', label: 'С концами', detail: 'Длинные завязки' },
    ] },
    { id: 'outfit', label: 'Больничная роба', hint: 'Форма подола', options: [
        { id: 'gown', label: 'Обычная', detail: 'Оригинал' },
        { id: 'torn', label: 'Надорванная', detail: 'Неровный край' },
        { id: 'long', label: 'Длинная', detail: 'Удлинённый подол' },
    ] },
    { id: 'implants', label: 'Импланты', hint: 'Следы эксперимента', options: [
        { id: 'classic', label: 'Обычные', detail: 'Оригинал' },
        { id: 'temples', label: 'Виски', detail: 'Небольшие гнёзда' },
        { id: 'neck', label: 'На шее', detail: 'Соединения' },
        { id: 'wrapped', label: 'Под бинтами', detail: 'Частично скрыты' },
    ] },
];

export const SENTRY_PARTS = [
    { id: 'optics', label: 'Ночная оптика', hint: 'Линзы на шлеме', options: [
        { id: 'classic', label: 'Три линзы', detail: 'Оригинал' },
        { id: 'binocular', label: 'Парные', detail: 'Крупные линзы' },
        { id: 'cluster', label: 'Блок линз', detail: 'Четыре датчика' },
    ] },
    { id: 'respirator', label: 'Респиратор', hint: 'Фильтры по бокам', options: [
        { id: 'classic', label: 'Обычный', detail: 'Оригинал' },
        { id: 'reinforced', label: 'Усиленный', detail: 'Крупные фильтры' },
        { id: 'ribbed', label: 'Ребристый', detail: 'Защитные пластины' },
    ] },
    { id: 'shoulders', label: 'Наплечники', hint: 'Тяжёлая броня', options: [
        { id: 'classic', label: 'Обычные', detail: 'Оригинал' },
        { id: 'segmented', label: 'Сегментные', detail: 'Раздельные плиты' },
        { id: 'heavy', label: 'Массивные', detail: 'Усиленная защита' },
    ] },
    { id: 'cloak', label: 'Плащ', hint: 'Силуэт на спине', options: [
        { id: 'classic', label: 'Цельный', detail: 'Оригинал' },
        { id: 'split', label: 'С разрезом', detail: 'Два полотнища' },
        { id: 'torn', label: 'Потрёпанный', detail: 'Неровный край' },
    ] },
];

const PARTS_BY_CHARACTER = { labrat: LABRAT_PARTS, sentry: SENTRY_PARTS };
/** The slots offered for this character, or an empty list for characters without a workshop. */
export function characterPartSlots(charId) { return typeof charId === 'string' && Object.hasOwn(PARTS_BY_CHARACTER, charId) ? PARTS_BY_CHARACTER[charId] : []; }

/** Return a complete, canonical set of allowed ids. Unknown characters have no mesh presets.
 * Removed experimental choices (e.g. the Lab Rat's coat, visor or crown) fall back to the original. */
export function characterParts(charId, value) {
    const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return Object.fromEntries(characterPartSlots(charId).map(slot => [slot.id,
        slot.options.some(option => option.id === input[slot.id]) ? input[slot.id] : slot.options[0].id]));
}
