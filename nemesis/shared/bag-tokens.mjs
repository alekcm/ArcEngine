// Public display helpers. A token's value is shown only after that token is drawn.
const LABELS = { blank: 'Пустой жетон', larva: 'Личинка', adult: 'Взрослый', drone: 'Дрон', queen: 'Королева', redMetagorger: 'Красный глодатель', blueMetagorger: 'Синий глодатель', shambler: 'Падальщик', breeder: 'Свежеватель', butcher: 'Мясник', nightmare: 'Кошмар', madness: 'Безумие', stinkhorn: 'Отросток', deathcap: 'Шляпка', chyQueen: 'Королева хитридов' };
const ICONS = { blank: '○', larva: '🐛', adult: '👾', drone: '🦂', queen: '👑', redMetagorger: '🔴', blueMetagorger: '🔵', shambler: '👾', breeder: '👾', butcher: '👾', nightmare: '🌑', madness: '🧠', stinkhorn: '🍄', deathcap: '🍄', chyQueen: '👑' };
export function bagTokenType(token) {
    if (typeof token === 'string') return token;
    if (!token || typeof token !== 'object') return '';
    return token.type || (token.madness !== undefined ? 'madness' : token.value !== undefined ? 'nightmare' : '');
}
export function bagTokenLabel(token) {
    const type = bagTokenType(token);
    const name = LABELS[type] || type || 'Жетон';
    return token && typeof token === 'object' && token.value !== undefined ? name + ' · ' + token.value : name;
}
export function bagTokenIcon(token) { return ICONS[bagTokenType(token)] || '🎒'; }
export function bagTokenCounts(bag) {
    const counts = {};
    for (const token of bag) { const type = bagTokenType(token); if (type) counts[type] = (counts[type] || 0) + 1; }
    return counts;
}
