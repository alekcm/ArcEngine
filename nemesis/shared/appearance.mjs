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
    { id: 'ankle', label: 'На ногах', hint: 'Идентификация на щиколотке', options: [
        { id: 'classic', label: 'Без меток', detail: 'Оригинал' },
        { id: 'tracker', label: 'Браслет', detail: 'Датчик слежения' },
        { id: 'tag', label: 'Бирка', detail: 'Метка пациентки' },
    ] },
    { id: 'wrists', label: 'На запястьях', hint: 'Следы ухода и фиксации', options: [
        { id: 'classic', label: 'Без повязок', detail: 'Оригинал' },
        { id: 'bandaged', label: 'Бинты', detail: 'Неровные обмотки' },
        { id: 'restraints', label: 'Фиксаторы', detail: 'Больничные ремешки' },
    ] },
];

export const SENTRY_PARTS = [
    { id: 'suit', label: 'Бронекостюм', hint: 'Корпус, ранец и ноги', options: [
        { id: 'classic', label: 'Обычный', detail: 'Оригинал' },
        { id: 'patrol', label: 'Патрульный', detail: 'Подвижные секции' },
        { id: 'breacher', label: 'Штурмовой', detail: 'Усиленный корпус' },
    ] },
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
        crewSlot('beard', 'Борода', 'Седые волосы и усы', ['long', 'Густая', 'Длинная борода'], ['forked', 'Раздвоенная', 'Две отдельные пряди']),
        crewSlot('cap', 'Головной убор', 'Рабочая кепка или защита', ['banded', 'Шапка', 'С широким отворотом'], ['lamp', 'Каска', 'С рабочим фонарём']),
        crewSlot('vacuum', 'Пылесос', 'Ранец и шланг', ['ribbed', 'Турбинный', 'Широкий корпус'], ['twin', 'Двухбаковый', 'Два резервуара']),
        crewSlot('outfit', 'Рабочая одежда', 'Куртка, брюки и сапоги', ['utility', 'С фартуком', 'Защита для уборки'], ['protective', 'Изолирующий', 'Герметичный костюм']),
        crewSlot('wand', 'Инструмент', 'Штанга пылесоса', ['brush', 'Щётка', 'Широкая насадка'], ['nozzle', 'Форсунка', 'Узкая струйная насадка']),
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
        crewSlot('trousers', 'Брюки', 'Крой и обувь', ['tailored', 'Прямые', 'Строгий крой'], ['utility', 'Рабочие', 'Карманы и усиления']),
        crewSlot('vest', 'Жилет', 'Поверх рубашки', ['lapels', 'С лацканами', 'Открытый спереди'], ['pockets', 'Сервисный', 'Рабочие карманы']),
        crewSlot('arms', 'Рукава', 'Рубашка и руки', ['rolled', 'Засученные', 'Открытые предплечья'], ['synthetic', 'Синтетические', 'Механические кисти']),
        crewSlot('sidearm', 'Пистолет', 'Личное оружие', ['compact', 'Компактный', 'Короткий корпус'], ['pulse', 'Импульсный', 'Катушка и ствол']),
    ],
    convict: [
        crewSlot('muzzle', 'Намордник', 'Защита лица', ['vents', 'Респиратор', 'Фильтр и крепления'], ['guard', 'Клетка', 'Усиленная решётка']),
        crewSlot('plates', 'Импланты', 'Кибернетика на теле', ['shoulder', 'Сегментные', 'Плечи и грудь'], ['asymmetric', 'Несимметричные', 'Широкий контур']),
        crewSlot('chains', 'Оковы', 'Наручники и цепь', ['heavy', 'Массивные', 'Широкие манжеты'], ['links', 'Цепные', 'Крупные звенья']),
        crewSlot('trousers', 'Брюки', 'Одежда заключённого', ['cargo', 'Рабочие', 'Карманы и стяжки'], ['reinforced', 'Усиленные', 'Защита голеней']),
        crewSlot('tattoos', 'Татуировки', 'Рисунки на коже', ['tribal', 'Орнамент', 'Узоры на груди и руках'], ['prison', 'Тюремные', 'Номер и метки']),
    ],
    psych: [
        crewSlot('hair', 'Волосы', 'Чёлка и тёмные пряди', ['layered', 'Слоистые', 'Пряди разной длины'], ['long', 'Длинные', 'Распущенные волосы']),
        crewSlot('headset', 'Гарнитура', 'Прибор у виска', ['dual', 'Парная', 'Наушники и оголовье'], ['sensor', 'Сканер', 'Выдвинутый датчик']),
        crewSlot('drones', 'Дроны', 'Два спутника', ['rotors', 'Патрульные', 'Корпус с винтами'], ['array', 'Аналитические', 'Корпус с датчиками']),
        crewSlot('vest', 'Одежда', 'Жилет и силуэт', ['clinical', 'Туника', 'Удлинённый крой'], ['harness', 'Полевой жилет', 'Панели и ремни']),
        crewSlot('sleeves', 'Рукава', 'Руки и манжеты', ['rolled', 'Засученные', 'Открытые предплечья'], ['tech', 'С манжетами', 'Защитные рукава']),
    ],
    bounty: [
        crewSlot('hair', 'Волосы', 'Борода остаётся', ['swept', 'С зачёсом', 'Короткие волосы'], ['spiky', 'Небрежные', 'Рваные пряди']),
        crewSlot('armor', 'Броня', 'Плечи и нагрудник', ['layered', 'Сегментная', 'Подвижные пластины'], ['heavy', 'Тяжёлая', 'Защитный панцирь']),
        crewSlot('dog', 'Лайка', 'Спутница охотника', ['packs', 'Следопыт', 'Сумки и шлейка'], ['guard', 'Страж', 'Защитное снаряжение']),
        crewSlot('outfit', 'Одежда', 'Полевой костюм', ['scout', 'Следопыт', 'Куртка и рабочие брюки'], ['armored', 'Рейдовый', 'Усиленные рукава и штаны']),
        crewSlot('rifle', 'Винтовка', 'Оружие охотника', ['marksman', 'Снайперская', 'Длинный ствол и оптика'], ['compact', 'Карабин', 'Короткий корпус']),
    ],
    captain: [
        crewSlot('hair', 'Волосы', 'Причёска и борода', ['swept', 'С зачёсом', 'Короткие волосы'], ['spiky', 'Небрежные', 'Короткие пряди']),
        crewSlot('shoulders', 'Наплечники', 'Броня капитана', ['layered', 'С погонами', 'Офицерские знаки'], ['heavy', 'С экраном', 'Встроенный дисплей']),
        crewSlot('vest', 'Бронежилет', 'Грудные пластины', ['ribbed', 'Сегментный', 'Составной нагрудник'], ['radio', 'Командный', 'Панель связи']),
        crewSlot('uniform', 'Форма', 'Костюм капитана', ['field', 'Полевой', 'Усиленная форма'], ['long', 'Длинная куртка', 'Удлинённые полы']),
        crewSlot('sidearm', 'Шестизарядник', 'Личное оружие', ['heavy', 'Тяжёлый', 'Крупный барабан'], ['compact', 'Компактный', 'Короткий ствол']),
    ],
    survivor: [
        crewSlot('hair', 'Волосы', 'Неровные пряди', ['wavy', 'Растрёпанные', 'Неравные пряди'], ['long', 'Длинные', 'Пряди у плеч']),
        crewSlot('bandana', 'Бандана', 'Лицо остаётся закрытым', ['folded', 'Обмотанная', 'Сложенная ткань'], ['tails', 'С завязками', 'Удлинённый шарф']),
        crewSlot('radio', 'Рация', 'Ранец и антенна', ['dual', 'Связист', 'Двойной блок и антенны'], ['caged', 'Полевой', 'Защищённый ранец']),
        crewSlot('outfit', 'Одежда', 'Броня и рабочий костюм', ['field', 'Полевой костюм', 'Лёгкий жилет и наколенники'], ['salvage', 'Собранная броня', 'Тяжёлые пластины и сапоги']),
        crewSlot('sidearm', 'Пистолет', 'Личное оружие', ['compact', 'Компактный', 'Короткий затвор'], ['burst', 'Усиленный', 'Более длинный корпус']),
    ],
    xeno: [
        crewSlot('hair', 'Волосы', 'Кудрявые пряди', ['loosecurl', 'Распущенные', 'Короткие кудри'], ['longtail', 'Длинный хвост', 'Собранные кудри']),
        crewSlot('probe', 'Манипулятор', 'Сканер над плечом', ['twin', 'Парный', 'Два сенсора'], ['shield', 'Защищённый', 'Широкий сканер']),
        crewSlot('jacket', 'Куртка', 'Поверх рубашки', ['collar', 'С воротником', 'Высокий ворот и манжеты'], ['pockets', 'Полевой жакет', 'Удлинённый жакет с карманами']),
        crewSlot('trousers', 'Брюки', 'Одежда исследовательницы', ['utility', 'Рабочие', 'Карго и сапоги'], ['field', 'Полевые', 'Наколенники и ремни']),
        crewSlot('tool', 'Образец', 'Прибор в руке', ['sampler', 'Пробоотборник', 'Колба в оправе'], ['analyzer', 'Анализатор', 'Сенсор с образцом']),
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
