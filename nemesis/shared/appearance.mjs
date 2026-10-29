// appearance.mjs — the experimental, network-safe mesh presets for the Lab Rat.
// The first option in each slot is the original model. The same definitions drive the editor,
// server validation and the figure on the table; colours remain a separate customization.
export const LABRAT_PARTS = [
    { id: 'hair', label: 'Волосы', hint: 'Форма и длина', options: [
        { id: 'loose', label: 'Длинные', detail: 'Оригинал' },
        { id: 'bob', label: 'Каре', detail: 'С чёлкой' },
        { id: 'ponytail', label: 'Хвост', detail: 'Собранные' },
        { id: 'shaved', label: 'Без волос', detail: 'Открытая голова' },
    ] },
    { id: 'eyes', label: 'Глаза', hint: 'Повязка или визор', options: [
        { id: 'bandage', label: 'Повязка', detail: 'Оригинал' },
        { id: 'visor', label: 'Визор', detail: 'С подсветкой' },
        { id: 'none', label: 'Открыты', detail: 'Без повязки' },
    ] },
    { id: 'outfit', label: 'Одежда', hint: 'Силуэт и детали', options: [
        { id: 'gown', label: 'Роба', detail: 'Оригинал' },
        { id: 'coat', label: 'Халат', detail: 'Распахнутый' },
        { id: 'suit', label: 'Костюм', detail: 'Ремни и ботинки' },
    ] },
    { id: 'implants', label: 'Импланты', hint: 'Детали головы', options: [
        { id: 'classic', label: 'Обычные', detail: 'Оригинал' },
        { id: 'crown', label: 'Обруч', detail: 'С индикаторами' },
        { id: 'none', label: 'Без них', detail: 'Чистый силуэт' },
    ] },
];

/** Return a complete, canonical set of allowed ids. Unknown characters have no mesh presets. */
export function characterParts(charId, value) {
    if (charId !== 'labrat') return {};
    const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return Object.fromEntries(LABRAT_PARTS.map(slot => [slot.id,
        slot.options.some(option => option.id === input[slot.id]) ? input[slot.id] : slot.options[0].id]));
}
