// Physical Carnomorph attack cards, keyed by stable engine IDs. The two
// toughness columns belong to the Metagorger and to every other Carnomorph respectively.
// 'retreat' is the arrow symbol, not a numeric toughness value.
const all = ['shambler', 'breeder', 'butcher'];
const designs = {
    vomit: { name: 'Рвота', targets: all, text: 'Получите 1 карту заражения; положите останки пришельца в отсек. Слизь не используется в Redux.' },
    powerful: { name: 'Мощная атака', targets: ['breeder', 'butcher'], text: 'Получите 1 тяжёлую травму и 1 карту заражения.' },
    devour: { name: 'Пожирание', targets: ['butcher'], text: 'При наличии тяжёлой травмы погибните; иначе получите 1 тяжёлую травму. Мясник лечит все ранения.' },
    multiply: { name: 'Размножение', targets: ['shambler', 'breeder'], text: 'Поместите глодателя в отсек. Слизь не используется в Redux.' },
    bite: { name: 'Укус', targets: all, text: 'При наличии 2 тяжёлых травм погибните; иначе получите 1 тяжёлую травму.' },
    lash: { name: 'Хлёсткий удар', targets: all, text: 'Получите 2 лёгких ранения и 1 карту заражения.' },
    scratch: { name: 'Царапины', targets: all, text: 'Получите 1 лёгкое ранение и 1 карту заражения.' },
};
const cards = [
    ['vomit', 3, 4], ['vomit', 2, 5], ['powerful', 2, 'retreat'], ['powerful', 'retreat', 5], ['devour', 1, 5],
    ['devour', 'retreat', 3], ['multiply', 'retreat', 7], ['multiply', 1, 4], ['bite', 1, 8], ['bite', 3, 6],
    ['bite', 1, 5], ['bite', 2, 4], ['lash', 1, 4], ['lash', 1, 8], ['lash', 1, 'retreat'],
    ['lash', 3, 7], ['lash', 'retreat', 'retreat'], ['scratch', 2, 'retreat'], ['scratch', 1, 6], ['scratch', 1, 3],
];
const attackSheetOrder = [0,1,2,3,4,8,5,6,7,9,10,11,12,13,14,15,16,17,19,18];
export const CARNOMORPH_ATTACK_CARDS = cards.map(([effect, metagorger, other], index) => Object.freeze({
    id: 'carnoAttack' + (index + 1), effect, metagorger, other,
    ...designs[effect], sheetIndex: attackSheetOrder[index],
}));
export const CARNOMORPH_ATTACK_BY_ID = Object.fromEntries(CARNOMORPH_ATTACK_CARDS.map(c => [c.id, c]));

// Drawn face down and assigned to the three board spaces. Their actual identities stay in secret
// until the corresponding Carnomorph type appears.
export const CARNOMORPH_ADAPTATIONS = Object.freeze({
    genomeError: { name: 'Ошибка генома', text: 'Когда атака карноморфа не попадает, персонаж получает карту заражения.' },
    substitution: { name: 'Подмена', text: 'Карноморфы проходят сквозь закрытые двери, не уничтожая их.' },
    agility: { name: 'Проворность', text: 'При атаке карноморфа критическая грань считается промахом (адаптация Redux).' },
    ravenous: { name: 'Прожорливость', text: 'Карноморфы могут поглощать тяжёлые объекты даже в бою.' },
    regeneration: { name: 'Регенерация', text: 'Количество урона, необходимое для уничтожения карноморфа, увеличивается на 1.' },
    fireResistance: { name: 'Сопротивление огню', text: 'Карноморфы не получают урон от огня, огнемёта и коктейля Молотова.' },
    acceleration: { name: 'Ускорение', text: 'При проверке внезапной атаки значение вытянутого жетона увеличивается на 1.' },
    tentacles: { name: 'Щупальца', text: 'Когда атака карноморфа не попадает, персонаж получает 1 лёгкое ранение.' },
});

export const CARNOMORPH_MUTATIONS = Object.freeze({
    adaptation: { name: 'Адаптация', infected: 'Сбросьте эту карту, возьмите 3 карты мутаций, выберите одну, остальные сбросьте.', clean: 'Сбросьте эту карту и возьмите 1 карту мутации.' },
    regeneration: { name: 'Регенерация тканей', infected: 'Вылечите 1 тяжёлую рану, даже открытую.', clean: 'Вылечите 1 тяжёлую травму (адаптация Redux: перевязок нет).' },
    gastric: { name: 'Гастрономическая революция', infected: 'Уберите останки или яйцо из отсека, чтобы вылечить тяжёлую рану или все лёгкие раны; затем возьмите 2 карты действий.', clean: 'Уберите останки или яйцо из отсека, чтобы взять 2 карты действий.' },
    boilingBlood: { name: 'Кипящая кровь', infected: 'Нанесите 1 урон и 1 тяжёлую рану всем другим персонажам и карноморфам в отсеке.', clean: 'Нанесите 1 урон всем карноморфам в отсеке.' },
    claw: { name: 'Клешня', infected: 'Проведите обычную атаку по карноморфу в отсеке с 1 дополнительным уроном.', clean: 'Нанесите 1 урон карноморфу в отсеке.' },
    scream: { name: 'Крик', infected: 'Отступление карноморфа, кроме глодателя, в соседний отсек на ваш выбор.', clean: 'Отступление карноморфа, кроме глодателя, в вашем отсеке.' },
    escapeArtist: { name: 'Мастер побега', infected: 'Покиньте отсек с карноморфом без карты атаки и броска шума.', clean: 'Покиньте отсек с карноморфом без броска шума.' },
    mimicry: { name: 'Мимикрия', infected: 'Перед атакой в фазу чужих перенаправьте её на другого персонажа; если вы одни, проигнорируйте её.', clean: 'Перед атакой в фазу чужих перенаправьте её на другого персонажа в отсеке.' },
    senses: { name: 'Острые чувства', infected: 'После броска шума замените его результат на выбранный, кроме тишины и опасности.', clean: 'После броска шума перебросьте его.' },
    genomeError: { name: 'Ошибка генома', infected: 'Возьмите 2 карты действий и можете убрать все карты заражения с руки.', clean: 'Возьмите 1 карту действий и можете убрать 1 карту заражения с руки.' },
    shapeChange: { name: 'Смена формы', infected: 'Переместитесь через технические коридоры без броска шума.', clean: 'Переместитесь через технические коридоры.' },
    trickster: { name: 'Фокусник', infected: 'Переместитесь в любой соседний отсек, даже через закрытую дверь, без броска шума.', clean: 'Переместитесь в любой соседний отсек, даже через закрытую дверь.' },
});
