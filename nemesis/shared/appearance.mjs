// appearance.mjs — the network-safe mesh presets for the Lab Rat.
// Every option keeps her patient gown, blindfold, bare feet and lab implants. The first option in
// each slot is the original model; colours remain a separate customization. These definitions are
// shared by the workshop, server validation and the figure on the table.
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

/** Return a complete, canonical set of allowed ids. Unknown characters have no mesh presets.
 * Removed experimental choices (e.g. coat, visor or crown) safely fall back to the original. */
export function characterParts(charId, value) {
    if (charId !== 'labrat') return {};
    const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return Object.fromEntries(LABRAT_PARTS.map(slot => [slot.id,
        slot.options.some(option => option.id === input[slot.id]) ? input[slot.id] : slot.options[0].id]));
}
