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

// The remaining crew each have their own role-specific geometry. The first option is deliberately
// the existing miniature, not a new interpretation. Colours are still controlled by paint zones.
// Reworked characters retain their original option IDs so previously saved appearances still load;
// their visible labels now describe complete replacements instead of small add-on details.
const crewSlot = (id, label, hint, a, b) => ({ id, label, hint, options: [
    { id: 'classic', label: 'Оригинал', detail: 'Исходная модель' },
    { id: a[0], label: a[1], detail: a[2] },
    { id: b[0], label: b[1], detail: b[2] },
] });
export const CREW_PARTS = {
    soldier: [
        crewSlot('helmet', 'Шлем', 'Защита для выхода в космос', ['braced', 'Штурмовой', 'Закрытый, с визором'], ['caged', 'Панорамный', 'Лицо за стеклом']),
        crewSlot('suit', 'Костюм', 'Корпус, руки и ноги', ['recon', 'Лёгкий', 'Гибкая броня'], ['heavy', 'Штурмовой', 'Тяжёлые секции']),
        crewSlot('shoulders', 'Наплечники', 'Независимая защита', ['layered', 'Сегментные', 'Раздельные щитки'], ['extended', 'Обтекаемые', 'Округлый панцирь']),
        crewSlot('pack', 'Ранец', 'Система жизнеобеспечения', ['ribbed', 'Реактор', 'Компактный блок'], ['valves', 'Баллон', 'Крупный резервуар']),
        crewSlot('rifle', 'Винтовка', 'Штурмовое оружие', ['compact', 'Карабин', 'Компактная компоновка'], ['modular', 'Модульная', 'Дисковый магазин']),
    ],
    scout: [
        crewSlot('hair', 'Волосы', 'Длинные пряди', ['braid', 'Коса', 'Собрана сзади'], ['tied', 'Хвост', 'Длинный хвост']),
        crewSlot('bracer', 'Наруч', 'Прибор на левой руке', ['display', 'Терминал', 'Широкий экран'], ['cells', 'Модульный', 'Сегменты и датчик']),
        crewSlot('vest', 'Жилет', 'Лёгкая полевая защита', ['plated', 'Пластинчатый', 'Раздельная броня'], ['pouches', 'Разгрузка', 'Ремни и подсумки']),
        crewSlot('shoulders', 'Наплечники', 'Защита разведчицы', ['compact', 'Обтекаемые', 'Лёгкие щитки'], ['segmented', 'Сегментные', 'Гибкая броня']),
        crewSlot('rifle', 'Винтовка', 'На ремне за спиной', ['carbine', 'Карабин', 'Короткая винтовка'], ['long', 'Дальняя', 'Прицел и ствол']),
    ],
    mechanic: [
        crewSlot('shield', 'Защита лица', 'Для сварочных работ', ['framed', 'Цельный шлем', 'Закрывает всю голову'], ['twinlamp', 'Сварочные очки', 'Открытое лицо']),
        crewSlot('outfit', 'Рабочий костюм', 'Жилет и защита ног', ['apron', 'Фартук', 'Сварочная защита'], ['armored', 'Бронежилет', 'Раздельные пластины']),
        crewSlot('belt', 'Рабочий пояс', 'Инструменты и сумки', ['tools', 'С ключами', 'Ключи на поясе'], ['pouches', 'С подсумками', 'Крупные карманы']),
        crewSlot('pack', 'Сварочный ранец', 'Питание горелки', ['ribbed', 'Газовый баллон', 'Один большой бак'], ['gauges', 'Генератор', 'Корпус и катушка']),
        crewSlot('welder', 'Горелка', 'Инструмент в руке', ['torch', 'Компактная', 'Пистолетная форма'], ['cutter', 'Резак', 'Защитная рамка']),
    ],
    pilot: [
        crewSlot('hair', 'Волосы', 'Короткая причёска', ['spiky', 'Небрежные', 'Короткие пряди'], ['side', 'С зачёсом', 'Боковая чёлка']),
        crewSlot('optics', 'Монокль', 'Прибор над глазом', ['round', 'Навигационный', 'Круглый окуляр'], ['wide', 'Проекционный', 'Широкий экран']),
        crewSlot('coat', 'Куртка', 'Меховой воротник', ['lapels', 'Бомбер', 'Короткая куртка'], ['long', 'Удлинённая', 'Длинные полы']),
        crewSlot('headset', 'Гарнитура', 'Лётные наушники', ['single', 'Одно ухо', 'Радио с микрофоном'], ['padded', 'Закрытая', 'Мягкие наушники']),
        crewSlot('sidearm', 'Пистолет', 'Штатное оружие', ['compact', 'Компактный', 'Короткий корпус'], ['long', 'Сигнальный', 'Длинный ствол']),
    ],
    hacker: [
        crewSlot('hood', 'Капюшон', 'Ткань вокруг маски', ['rimmed', 'Каркасный', 'Усиленный край'], ['long', 'Длинный', 'Накидка на спине']),
        crewSlot('mask', 'Маска', 'Закрывает лицо', ['seams', 'Интерфейс', 'Контуры и дисплей'], ['vented', 'Респиратор', 'Фильтры и визор']),
        crewSlot('arms', 'Киберруки', 'Импланты и перчатки', ['ribbed', 'Сегментные', 'Гибкие секции'], ['terminal', 'С терминалом', 'Прибор на руке']),
        crewSlot('vest', 'Киберброня', 'Поверх комбинезона', ['harness', 'Разгрузка', 'Ремни и модули'], ['armored', 'Корпус', 'Защитный панцирь']),
        crewSlot('smartgun', 'Умный пистолет', 'Оружие в руке', ['compact', 'Компактный', 'Короткий корпус'], ['rail', 'Импульсный', 'Удлинённый ствол']),
    ],
    scientist: [
        crewSlot('goggles', 'Очки на голове', 'Поверх обычных очков', ['round', 'Оптические', 'Парные окуляры'], ['visor', 'С щитком', 'Откидной экран']),
        crewSlot('chair', 'Кресло', 'Мобильная платформа', ['spoked', 'Облегчённое', 'Открытая рама'], ['guards', 'Экспедиционное', 'Защищённый корпус']),
        crewSlot('tablet', 'Планшет', 'Прибор на левой руке', ['panel', 'Терминал', 'Широкий экран'], ['scanner', 'Анализатор', 'Полевой прибор']),
        crewSlot('coat', 'Куртка', 'Рабочая одежда', ['field', 'Полевая', 'Утеплённая куртка'], ['lab', 'Лабораторная', 'Раздельные полы']),
        crewSlot('scanner', 'Ручной сканер', 'Прибор в правой руке', ['probe', 'Датчик', 'Удлинённый щуп'], ['spectrometer', 'Спектрометр', 'Экран и сенсор']),
    ],
    medic: [
        crewSlot('hair', 'Волосы', 'Под медицинской кепкой', ['tied', 'Собранные', 'Хвост на затылке'], ['wavy', 'Волнистые', 'Свободные пряди']),
        crewSlot('mask', 'Респиратор', 'Защита носа и рта', ['filters', 'С фильтрами', 'Парные патроны'], ['valve', 'С клапаном', 'Центральный фильтр']),
        crewSlot('kit', 'Аптечка', 'Медицинское снаряжение', ['pouch', 'Подсумок', 'Полевой комплект'], ['canisters', 'С ампулами', 'Набор препаратов']),
        crewSlot('coat', 'Халат', 'Рабочая одежда', ['field', 'Полевой', 'Короткая куртка'], ['surgical', 'Удлинённый', 'С раздельными полами']),
        crewSlot('injector', 'Инъектор', 'Прибор в руке', ['compact', 'Компактный', 'Короткая ампула'], ['infuser', 'Инфузор', 'Длинный резервуар']),
    ],
    janitor: [
        crewSlot('beard', 'Борода', 'Седые волосы и усы', ['long', 'Длинная', 'Густая борода'], ['forked', 'Раздвоенная', 'Две пряди']),
        crewSlot('cap', 'Кепка', 'Рабочий головной убор', ['banded', 'Рабочая', 'Плотный околыш'], ['lamp', 'С фонарём', 'Встроенная лампа']),
        crewSlot('vacuum', 'Пылесос', 'Ранец и шланг', ['ribbed', 'Усиленный', 'Ребристый бак'], ['twin', 'Двойной', 'Два резервуара']),
        crewSlot('outfit', 'Комбинезон', 'Рабочая одежда', ['utility', 'Сервисный', 'Карманы и наколенники'], ['protective', 'Защитный', 'Плотный рабочий костюм']),
        crewSlot('wand', 'Насадка', 'Штанга пылесоса', ['brush', 'Щётка', 'Широкая насадка'], ['nozzle', 'Струйная', 'Узкая форсунка']),
    ],
    ceo: [
        crewSlot('hair', 'Волосы', 'Короткая седая причёска', ['spiky', 'Небрежные', 'Короткие пряди'], ['side', 'С зачёсом', 'Боковой пробор']),
        crewSlot('collar', 'Воротник', 'Крой у плеч и шеи', ['trim', 'Парадный', 'Широкие лацканы'], ['high', 'Высокий', 'Поднятые края']),
        crewSlot('robot', 'Телохранитель', 'Робот-компаньон', ['sensor', 'Разведчик', 'Облегчённый корпус'], ['armored', 'Защитник', 'Усиленный корпус']),
        crewSlot('coat', 'Пальто', 'Костюм директора', ['tailcoat', 'Фрак', 'Длинные полы'], ['double', 'Двубортное', 'Строгий мундир']),
        crewSlot('sidearm', 'Пистолет', 'Личное оружие', ['compact', 'Компактный', 'Короткий корпус'], ['ceremonial', 'Парадный', 'Удлинённый ствол']),
    ],
    android: [
        crewSlot('hair', 'Волосы', 'Причёска андроида', ['tied', 'Хвост', 'Собраны сзади'], ['bob', 'Каре', 'Пряди до плеч']),
        crewSlot('implants', 'Импланты', 'Синтетические элементы лица', ['temples', 'На висках', 'Парные гнёзда'], ['jaw', 'На челюсти', 'Боковые модули']),
        crewSlot('vest', 'Жилет', 'Поверх рубашки', ['lapels', 'С лацканами', 'Открытый спереди'], ['pockets', 'Сервисный', 'Рабочие карманы']),
        crewSlot('arms', 'Рукава', 'Рубашка и руки', ['rolled', 'Засученные', 'Открытые предплечья'], ['synthetic', 'Синтетические', 'Механические кисти']),
        crewSlot('sidearm', 'Пистолет', 'Личное оружие', ['compact', 'Компактный', 'Короткий корпус'], ['pulse', 'Импульсный', 'Катушка и ствол']),
    ],
    convict: [
        crewSlot('muzzle', 'Намордник', 'Защитная решётка', ['vents', 'С клапаном', 'Круглый фильтр'], ['guard', 'Усиленный', 'Боковые скобы']),
        crewSlot('plates', 'Пластины', 'Импланты на теле', ['shoulder', 'На плечах', 'Усиленные накладки'], ['asymmetric', 'Неравномерные', 'Раздельные плиты']),
        crewSlot('chains', 'Оковы', 'Наручники и цепь', ['heavy', 'Массивные', 'Широкие манжеты'], ['links', 'С цепью', 'Крупные звенья']),
    ],
    psych: [
        crewSlot('hair', 'Волосы', 'Чёлка и тёмные пряди', ['layered', 'Слоистые', 'Пряди у лица'], ['long', 'Длинные', 'До плеч']),
        crewSlot('headset', 'Гарнитура', 'Прибор у виска', ['dual', 'Парная', 'Два модуля'], ['sensor', 'С датчиком', 'Выдвинутая линза']),
        crewSlot('drones', 'Дроны', 'Два спутника', ['rotors', 'С роторами', 'Боковые винты'], ['array', 'С антеннами', 'Дополнительные датчики']),
    ],
    bounty: [
        crewSlot('hair', 'Волосы', 'Борода остаётся', ['swept', 'С зачёсом', 'Короткие волосы'], ['spiky', 'Небрежные', 'Рваные пряди']),
        crewSlot('armor', 'Наплечники', 'Полевая броня', ['layered', 'Сегментные', 'Дополнительные плиты'], ['heavy', 'Усиленные', 'Крупные щитки']),
        crewSlot('dog', 'Снаряжение собаки', 'Шлейка компаньона', ['packs', 'С сумками', 'Подсумки по бокам'], ['guard', 'С защитой', 'Пластина на спине']),
    ],
    captain: [
        crewSlot('hair', 'Волосы', 'Причёска и борода', ['swept', 'С зачёсом', 'Короткие волосы'], ['spiky', 'Небрежные', 'Короткие пряди']),
        crewSlot('shoulders', 'Наплечники', 'Броня капитана', ['layered', 'Сегментные', 'Раздельные плиты'], ['heavy', 'Усиленные', 'Защитные щитки']),
        crewSlot('vest', 'Бронежилет', 'Грудные пластины', ['ribbed', 'С рёбрами', 'Усиленная пластина'], ['radio', 'С рацией', 'Прибор на груди']),
    ],
    survivor: [
        crewSlot('hair', 'Волосы', 'Неровные пряди', ['wavy', 'Растрёпанные', 'Разные пряди'], ['long', 'Длинные', 'Распущенные']),
        crewSlot('bandana', 'Бандана', 'Лицо остаётся закрытым', ['folded', 'Со складками', 'Полосы ткани'], ['tails', 'С завязками', 'Длинные концы']),
        crewSlot('radio', 'Рация', 'Ранец и антенна', ['dual', 'С антеннами', 'Два приёмника'], ['caged', 'В защите', 'Рама вокруг ранца']),
    ],
    xeno: [
        crewSlot('hair', 'Волосы', 'Кудрявые пряди', ['loosecurl', 'Распущенные', 'Короткие кудри'], ['longtail', 'Длинный хвост', 'Собранные кудри']),
        crewSlot('probe', 'Сканер', 'Манипулятор над плечом', ['twin', 'Парный', 'Дополнительная линза'], ['shield', 'С защитой', 'Рама вокруг датчика']),
        crewSlot('jacket', 'Куртка', 'Поверх рубашки', ['collar', 'С воротником', 'Приподнятые края'], ['pockets', 'С карманами', 'Рабочие карманы']),
    ],
};

const PARTS_BY_CHARACTER = { ...CREW_PARTS, labrat: LABRAT_PARTS, sentry: SENTRY_PARTS };
/** The slots offered for this character, or an empty list for characters without a workshop. */
export function characterPartSlots(charId) { return typeof charId === 'string' && Object.hasOwn(PARTS_BY_CHARACTER, charId) ? PARTS_BY_CHARACTER[charId] : []; }

/** Return a complete, canonical set of allowed ids. Unknown characters have no mesh presets.
 * Removed experimental choices (e.g. the Lab Rat's coat, visor or crown) fall back to the original. */
export function characterParts(charId, value) {
    const input = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return Object.fromEntries(characterPartSlots(charId).map(slot => [slot.id,
        slot.options.some(option => option.id === input[slot.id]) ? input[slot.id] : slot.options[0].id]));
}
