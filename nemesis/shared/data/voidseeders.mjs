// Physical Voidseeder cards with stable IDs mapped to the supplied sheets.
// Adapted to Redux; see docs/NEMESIS_DLC_STATUS.md for known differences.
export const VOID_TYPES = Object.freeze(['lurker', 'whisperer', 'creeper', 'despoiler']);
export const VOID_LIMITS = Object.freeze({ lurker: 6, whisperer: 4, creeper: 1, despoiler: 1, lair: 3 });
export const VOID_LEVEL_TYPES = Object.freeze([null, 'lurker', 'whisperer', 'whisperer', 'creeper', 'despoiler']);
const all = VOID_TYPES, larger = ['whisperer', 'creeper', 'despoiler'];
const attackDesigns = {
    frenzy: { name: 'Бешенство', targets: ['creeper', 'despoiler'], text: 'Все персонажи в отсеке с 2 тяжёлыми травмами погибают, остальные получают по 1 тяжёлой травме.' },
    intimidation: { name: 'Устрашение', targets: all, text: 'Персонаж получает карту инфекции и разыгрывает карту паники.' },
    division: { name: 'Разделение', targets: ['lurker', 'whisperer'], text: 'В отсек помещается кошмар того же типа; он не атакует до конца текущего действия.' },
    devourMind: { name: 'Поглощение разума', targets: ['despoiler'], text: 'Персонаж с тяжёлой травмой погибает, иначе получает 2 тяжёлые травмы.' },
    cut: { name: 'Порез', targets: all, text: 'Персонаж получает 1 лёгкую рану и карту инфекции.' },
    horror: { name: 'Ужас', targets: ['creeper', 'despoiler'], text: 'Персонаж получает 1 тяжёлую травму и разыгрывает карту паники.' },
    bite: { name: 'Укус', targets: larger, text: 'Персонаж с 2 тяжёлыми травмами погибает, иначе получает 1 тяжёлую травму.' },
};
const attackRows = [
    ['frenzy', 6], ['frenzy', 2], ['intimidation', 2], ['intimidation', 2], ['intimidation', 4],
    ['intimidation', 5], ['division', 3], ['division', 3], ['devourMind', 5], ['devourMind', 4],
    ['cut', 4], ['cut', 'retreat'], ['cut', 5], ['cut', 6], ['horror', 4],
    ['horror', 'retreat'], ['bite', 'retreat'], ['bite', 2], ['bite', 3], ['bite', 4],
];
const attackSheetOrder = [0,1,3,4,2,8,7,9,6,10,5,11,12,13,16,15,14,17,19,18];
export const VOID_ATTACK_CARDS = attackRows.map(([effect, toughness], index) => Object.freeze({
    id: 'voidAttack' + (index + 1), effect, toughness, ...attackDesigns[effect], sheetIndex: attackSheetOrder[index],
}));
export const VOID_ATTACK_BY_ID = Object.fromEntries(VOID_ATTACK_CARDS.map(card => [card.id, card]));

// Cards are kept separate even when their designs match: all 20 are physical cards.
const panicDesigns = {
    apathy: { name: 'Апатия', text: 'Каждый персонаж в отсеке сбрасывает 1 карту действия с руки. Увеличьте своё безумие на 1.' },
    hopelessness: { name: 'Безнадёжность', text: 'Возьмите 3 карты действий, уберите одну из игры, кроме инфекции; остальные сбросьте.' },
    madness: { name: 'Безумство', text: 'Если вы не в бою, переместитесь в соседний отсек с кошмаром с наименьшим номером.' },
    rage: { name: 'Вспышка ярости', text: 'Положите неисправность в ваш отсек, если её там нет.' },
    hallucinations: { name: 'Галлюцинации', text: 'Сбросьте все боеприпасы с одной вашей карты оружия.' },
    bloodlust: { name: 'Жажда крови', text: 'Нанесите 1 тяжёлую рану каждому персонажу в отсеке, включая себя.' },
    pyromania: { name: 'Пироман', text: 'Положите огонь в ваш отсек, если его там нет.' },
    defeatism: { name: 'Пораженчество', text: 'Каждый персонаж в отсеке увеличивает свой уровень безумия на 1.' },
    bandages: { name: 'Разрывая повязки', text: 'Нанесите себе 1 лёгкую рану и откройте 1 перевязанную тяжёлую рану.' },
    sabotage: { name: 'Саботаж', text: 'Установите счётчик предметов в отсеке на 0.' },
    selfHarm: { name: 'Самоистязание', text: 'Нанесите себе 2 лёгкие раны.' },
    heartAttack: { name: 'Сердечный приступ', text: 'Ваш персонаж погибает.' },
    blindFlee: { name: 'Слепое бегство', text: 'Откройте карту события, переместитесь по указанному коридору и сбросьте карту.' },
    destruction: { name: 'Уничтожение', text: 'Сбросьте 1 тяжёлый предмет (не тяжёлый объект) с руки, если возможно.' },
};
const panicRows = [
    ['apathy', 2], ['hopelessness', 3], ['madness', 2], ['rage', 2], ['hallucinations', 3],
    ['hallucinations', 3], ['bloodlust', 3], ['bloodlust', 3], ['pyromania', 3], ['defeatism', 3],
    ['bandages', 2], ['bandages', 2], ['sabotage', 2], ['sabotage', 2], ['selfHarm', 3],
    ['selfHarm', 3], ['heartAttack', 5], ['heartAttack', 5], ['blindFlee', 2], ['destruction', 4],
];
// IDs predate the art extraction; keep them stable while mapping to the physical sheet.
const panicSheetOrder = [0,1,2,3,5,6,4,7,8,11,9,10,13,14,12,15,16,17,19,18];
export const VOID_PANIC_CARDS = panicRows.map(([effect, level], index) => Object.freeze({
    id: 'voidPanic' + (index + 1), effect, level, ...panicDesigns[effect], sheetIndex: panicSheetOrder[index],
}));
export const VOID_PANIC_BY_ID = Object.fromEntries(VOID_PANIC_CARDS.map(card => [card.id, card]));

export const VOID_WEAKNESSES = Object.freeze({
    calmWave: { name: 'Волна спокойствия', text: 'Уровень безумия всех персонажей немедленно снижается на 1, даже с уровня 3.' },
    solidBulkheads: { name: 'Плотные перегородки', text: 'Кошмары не проходят сквозь закрытые двери, вместо этого уничтожают их.' },
    mentalResilience: { name: 'Психическая устойчивость', text: 'При финальной проверке персонажи берут 3 карты вместо 4.' },
    blurredVisions: { name: 'Расплывчатые видения', text: 'При столкновении персонажа с безумием 2 шепчущий заменяется таящимся.' },
    rationalThinking: { name: 'Рациональное мышление', text: 'Внезапная атака кошмара не даёт инфекцию, но по-прежнему вызывает панику.' },
    dangerReaction: { name: 'Реакция на опасность', text: 'Значение жетона при внезапной атаке уменьшается на 1, но не ниже 1.' },
    determination: { name: 'Решительность', text: 'При атаке гнезда или логова можно перебросить первый боевой кубик.' },
    strongBeliefs: { name: 'Сильные убеждения', text: 'При атаке кошмаров особая пустая грань считается попаданием.' },
});

const L = 'lurker', W = 'whisperer', C = 'creeper', D = 'despoiler';
const eventRows = [
    ['agoraphobia', 'Агорафобия', 4, [W,C], 'Поместите гнетущего в отсек с более чем одним персонажем, при равенстве — с наименьшим номером, без внезапной атаки. Уберите карту и замешайте сброс.', 'remove'],
    ['autophobia', 'Аутофобия', 1, [L,C,D], 'Каждый одинокий персонаж вне боя разыгрывает карту паники.'],
    ['autophobia', 'Аутофобия', 4, [L,C,D], 'Каждый одинокий персонаж вне боя разыгрывает карту паники.'],
    ['fuelExplosion', 'Взрыв топлива', 1, [W,C,D], 'Положите огонь в каждый отсек с двигателем. Уберите карту и замешайте сброс.', 'remove'],
    ['neurosis', 'Невроз', 4, [L,W], 'Каждый персонаж в отсеке с логовом или в соседнем разыгрывает карту паники.'],
    ['systemError', 'Системная ошибка', 2, [W,C,D], 'Если хотя бы в одном отсеке с терминалом есть неисправность, положите неисправность в каждый отсек с терминалом. Уберите карту и замешайте сброс.', 'remove'],
    ['hunt', 'Охота', 1, [C,D], 'Переместите каждого кошмара вне боя в соседний отсек с персонажем, при равенстве — с наименьшим номером.'],
    ['hunt', 'Охота', 3, [C,D], 'Переместите каждого кошмара вне боя в соседний отсек с персонажем, при равенстве — с наименьшим номером.'],
    ['hunt', 'Охота', 1, [W,C], 'Переместите каждого кошмара вне боя в соседний отсек с персонажем, при равенстве — с наименьшим номером.'],
    ['aiFailure', 'Сбой искусственного интеллекта', 1, [L,W], 'Если неисправны два отсека с терминалом, запустите самоуничтожение, иначе положите неисправность в исследованный отсек с терминалом и наименьшим номером.'],
    ['generatorOverheat', 'Перегрев генератора', 4, [W,C,D], 'Если генераторный отсек исследован, положите в него неисправность; если неисправность уже была, положите огонь. Если огонь уже был, распространите его в соседние отсеки через открытые двери. Замешайте сброс.', 'shuffleDiscard'],
    ['podEjection', 'Сброс спасательной капсулы', 3, [W,C,D], 'Запустите спасательную капсулу с наивысшим номером. Уберите карту и замешайте сброс.', 'remove'],
    ['fireWall', 'Стена огня', 4, [L,C], 'Найдите горящий отсек с наименьшим номером и положите огонь во все соседние отсеки через открытые двери.'],
    ['fear', 'Страх', 3, [W,C], 'Каждый персонаж, чей уровень безумия больше количества карт в руке, получает карту инфекции.'],
    ['fear', 'Страх', 3, [L,W], 'Каждый персонаж, чей уровень безумия больше количества карт в руке, получает карту инфекции.'],
    ['panicAttack', 'Паническая атака', 1, [L,C,D], 'Каждый персонаж берёт и сканирует 5 карт, заражённый результат устанавливает безумие на 5. Взятые карты сбрасываются; персонажи с безумием 5 сбрасывают все карты с руки.'],
    ['panicAttack', 'Паническая атака', 2, [L,C,D], 'Каждый персонаж берёт и сканирует 5 карт, заражённый результат устанавливает безумие на 5. Взятые карты сбрасываются; персонажи с безумием 5 сбрасывают все карты с руки.'],
    ['panicAttack', 'Паническая атака', 2, [C,D], 'Каждый персонаж берёт и сканирует 5 карт, заражённый результат устанавливает безумие на 5. Взятые карты сбрасываются; персонажи с безумием 5 сбрасывают все карты с руки.'],
    ['whisper', 'Шёпот', 2, [L,W], 'Откройте следующую карту и положите шум в коридоры указанного номера, ведущие в отсеки с персонажами; если там уже шум, разыграйте столкновение. Открытая карта сбрасывается.'],
    ['whisper', 'Шёпот', 3, [W,C], 'Откройте следующую карту и положите шум в коридоры указанного номера, ведущие в отсеки с персонажами; если там уже шум, разыграйте столкновение. Открытая карта сбрасывается.'],
];
const eventSheetOrder = [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,16,17,18,19,15];
export const VOID_EVENT_CARDS = eventRows.map(([effect, name, num, types, text, finish], index) => Object.freeze({
    id: 'voidEvent' + (index + 1), effect, name, move: { type: 'corridor', num, types }, text,
    finish: finish || 'discard', sheetIndex: eventSheetOrder[index],
}));
export const VOID_EVENT_BY_ID = Object.fromEntries(VOID_EVENT_CARDS.map(card => [card.id, card]));
