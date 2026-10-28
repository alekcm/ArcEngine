// cards.mjs — card data in Russian. Texts are what the player sees; effects are keys that the
// rules engine interprets. Keep the two in sync when editing.

// ---------------------------------------------------------------------------------------------
// Intruder Attack deck (15 + 5 extra Bite = 20)
// Effect ops: dmg n | wound n | contam | dieIf heavy|injured | followIfMoving | furyRoom | larva | miss
// ---------------------------------------------------------------------------------------------
const dmg = n => ({ op: 'dmg', n });
const wound = (n = 1) => ({ op: 'wound', n });
const contam = () => ({ op: 'contam' });
const clawsDrone = [{ op: 'dieIf', state: 'heavy' }, { op: 'if', state: 'injured', then: [wound(1)], else: [wound(2)] }];
const tailDrone = [{ op: 'dieIf', state: 'injuredOrWorse' }, wound(1)];

export const ATTACK_CARDS = [
    { id: 'bite', name: 'Укус', count: 6, text: 'Если вы тяжело ранены — вы погибаете. Иначе получите 1 тяжёлую травму.',
      adult: [{ op: 'dieIf', state: 'heavy' }, wound(1)], drone: 'adult', queen: 'adult' },
    { id: 'bloodSense', name: 'Чутьё крови', count: 1, text: 'Взрослый: потеряйте 2 здоровья. Дрон/Королева: потеряйте 2 здоровья; если вы перемещались, чужой следует за вами.',
      adult: [dmg(2)], drone: [dmg(2), { op: 'followIfMoving' }], queen: 'drone' },
    { id: 'claws1', name: 'Смертоносные когти', count: 1, text: 'Взрослый: −1 здоровье. Дрон: тяжело ранен — гибель; ранен — 1 травма; иначе 2 травмы. Королева: −2 здоровья.',
      adult: [dmg(1)], drone: clawsDrone, queen: [dmg(2)] },
    { id: 'claws2', name: 'Смертоносные когти', count: 1, text: 'Взрослый: −2 здоровья. Дрон: тяжело ранен — гибель; ранен — 1 травма; иначе 2 травмы. Королева: −3 здоровья.',
      adult: [dmg(2)], drone: clawsDrone, queen: [dmg(3)] },
    { id: 'claws3', name: 'Смертоносные когти', count: 1, text: 'Взрослый: −1 здоровье и заражение. Дрон: тяжело ранен — гибель; ранен — 1 травма; иначе 2 травмы. Королева: −2 здоровья и заражение.',
      adult: [dmg(1), contam()], drone: clawsDrone, queen: [dmg(2), contam()] },
    { id: 'fury1', name: 'Ярость', count: 1, text: 'Взрослый: −2 здоровья и заражение. Дрон/Королева: все тяжело раненные в комнате гибнут, остальные получают по 1 травме.',
      adult: [dmg(2), contam()], drone: [{ op: 'furyRoom' }], queen: 'drone' },
    { id: 'fury2', name: 'Ярость', count: 1, text: 'Взрослый: −1 здоровье и заражение. Дрон/Королева: все тяжело раненные в комнате гибнут, остальные получают по 1 травме.',
      adult: [dmg(1), contam()], drone: [{ op: 'furyRoom' }], queen: 'drone' },
    { id: 'infecting', name: 'Заражение', count: 1, text: 'Взрослый/Дрон: −2 здоровья. Королева: заражение; если нет личинки — получите личинку.',
      adult: [dmg(2)], drone: 'adult', queen: [contam(), { op: 'larva' }] },
    { id: 'miss', name: 'Промах', count: 1, text: 'Ничего не происходит. Перемешайте колоду атак.', adult: [{ op: 'miss' }], drone: 'adult', queen: 'adult' },
    { id: 'scratch1', name: 'Царапина', count: 1, text: '−1 здоровье.', adult: [dmg(1)], drone: 'adult', queen: 'adult' },
    { id: 'scratch2', name: 'Царапина', count: 1, text: '−1 здоровье и заражение.', adult: [dmg(1), contam()], drone: 'adult', queen: 'adult' },
    { id: 'scratch3', name: 'Царапина', count: 1, text: '−2 здоровья.', adult: [dmg(2)], drone: 'adult', queen: 'adult' },
    { id: 'scratch4', name: 'Царапина', count: 1, text: 'Заражение.', adult: [contam()], drone: 'adult', queen: 'adult' },
    { id: 'tail1', name: 'Удар хвостом', count: 1, text: 'Взрослый: −1 здоровье и заражение. Дрон/Королева: ранен или хуже — гибель; иначе 1 травма.',
      adult: [dmg(1), contam()], drone: tailDrone, queen: 'drone' },
    { id: 'tail2', name: 'Удар хвостом', count: 1, text: 'Взрослый: заражение. Дрон/Королева: ранен или хуже — гибель; иначе 1 травма.',
      adult: [contam()], drone: tailDrone, queen: 'drone' },
];

// ---------------------------------------------------------------------------------------------
// Event deck (20). move: corridor N | closest | none. noise: all | noCards | fireMalf | none
// ---------------------------------------------------------------------------------------------
export const EVENT_CARDS = [
    { id: 'breakingIn', name: 'Прорыв', move: { type: 'corridor', num: 1 }, noise: 'all',
      text: 'Все чужие движутся по коридору 1. Шум в тех. коридорах (если его там нет). Каждый персонаж в комнате с входом в тех. коридоры ставит шум в каждый соседний коридор без шума. Каждый персонаж делает бросок шума по порядку хода.' },
    { id: 'bulkheadsOpen', name: 'Переборки открыты', move: { type: 'closest' }, noise: 'noCards',
      text: 'Откройте все двери (кроме уничтоженных). Все чужие движутся к ближайшему персонажу. Каждый персонаж без карт действий в руке разрешает встречу по порядку хода.' },
    { id: 'damage', name: 'Повреждение', move: { type: 'none' }, noise: 'fireMalf',
      text: 'Чужие не движутся. Поломка в каждой комнате с чужим. Каждый персонаж в комнате с поломкой или огнём разрешает встречу по порядку хода.' },
    { id: 'damagingFire', name: 'Разрушительный огонь', move: { type: 'corridor', num: 2 }, noise: 'noCards',
      text: 'Чужие движутся по коридору 2. Поломка в каждой комнате с огнём; огонь в каждой комнате, соседней с горящей (не через закрытые двери и тех. коридоры). Каждый персонаж без карт действий в руке разрешает встречу по порядку хода.' },
    { id: 'eggProtection', name: 'Защита яиц', move: { type: 'closest' }, noise: 'all',
      text: 'Все чужие движутся к ближайшему персонажу. Дрон появляется в Гнезде и в каждой комнате с персонажем, несущим яйцо; они сразу атакуют. Каждый персонаж делает бросок шума по порядку хода.' },
    { id: 'podEjection', name: 'Отстрел капсулы', move: { type: 'corridor', num: 3 }, noise: 'all',
      text: 'Все чужие движутся по коридору 3. Уберите капсулу №1 из игры; если её уже нет — поломка в обоих эвакуационных отсеках. Каждый персонаж делает бросок шума по порядку хода.' },
    { id: 'fireWave', name: 'Волна огня', move: { type: 'closest' }, noise: 'all',
      text: 'Все чужие движутся к ближайшему персонажу. Найдите горящую комнату с наименьшим номером и подожгите все соседние (не через закрытые двери и тех. коридоры). Каждый персонаж делает бросок шума по порядку хода.' },
    { id: 'flammable', name: 'Горючие смеси', move: { type: 'corridor', num: 4 }, noise: 'all',
      text: 'Все чужие движутся по коридору 4. Огонь в Гибернатории; если он уже горит — огонь во всех соседних с ним комнатах. Каждый персонаж делает бросок шума по порядку хода.' },
    { id: 'generatorOverheats', name: 'Перегрев генератора', move: { type: 'none' }, noise: 'none', reshuffle: true,
      text: 'Чужие не движутся. Если в Генераторе поломка — запускается самоуничтожение, иначе поломка в Генераторе. Перемешайте колоду событий.' },
    { id: 'hatching', name: 'Вылупление', move: { type: 'corridor', num: 1 }, noise: 'all',
      text: 'Все чужие движутся по коридору 1. Уничтожьте 1 яйцо в Гнезде. Персонаж в Гнезде или рядом без карт в руке получает личинку; иначе жетон личинки в мешок. Каждый персонаж делает бросок шума по порядку хода.' },
    { id: 'leavingShell', name: 'Выход из оболочки', move: { type: 'none' }, noise: 'none', reshuffle: true,
      text: 'Чужие не движутся. Персонаж с личинкой: заражение, сброс руки, перемешать колоду, процедура вылупления. Остальные: взять 4 карты, процедура инфекции, сбросить руку. Перемешайте колоду событий.' },
    { id: 'lifeSupport', name: 'Отказ жизнеобеспечения', move: { type: 'corridor', num: 2 }, noise: 'all',
      text: 'Все чужие движутся по коридору 2. Поломка в каждой комнате с тремя зелёными значками предметов. Каждый персонаж делает бросок шума по порядку хода.' },
    { id: 'lurking', name: 'В засаде', move: { type: 'closest' }, noise: 'all',
      text: 'Все чужие движутся к ближайшему персонажу. Чужие не в комнате с персонажем убираются с поля, их жетоны возвращаются в мешок. Каждый персонаж делает бросок шума по порядку хода.' },
    { id: 'malfunction', name: 'Поломка', move: { type: 'corridor', num: 3 }, noise: 'all',
      text: 'Все чужие движутся по коридору 3. Поломка в комнате с наименьшим номером без поломки. Каждый персонаж делает бросок шума по порядку хода.' },
    { id: 'onTheHunt', name: 'На охоте', move: { type: 'closest' }, noise: 'noCards',
      text: 'Все чужие дважды движутся к ближайшему персонажу. Каждый персонаж без карт действий в руке разрешает встречу по порядку хода.' },
    { id: 'protectAndServe', name: 'Защищать и служить', move: { type: 'closest' }, noise: 'all',
      text: 'Все чужие движутся к ближайшему персонажу. Дрон появляется в комнате Королевы (без атаки); если Королевы нет на поле — 2 жетона дронов в мешок. Каждый персонаж делает бросок шума по порядку хода.' },
    { id: 'scentOfPrey', name: 'Запах добычи', move: { type: 'closest' }, noise: 'all',
      text: 'Все чужие движутся к ближайшему персонажу. Персонаж с тяжёлой травмой ставит шум в каждый соседний коридор без шума. Каждый персонаж делает бросок шума по порядку хода.' },
    { id: 'shortCircuit', name: 'Короткое замыкание', move: { type: 'corridor', num: 4 }, noise: 'fireMalf',
      text: 'Все чужие движутся по коридору 4. Поломка в каждой комнате с тремя жёлтыми значками. Каждый персонаж в комнате с поломкой или огнём разрешает встречу по порядку хода.' },
    { id: 'systemFailure', name: 'Отказ систем', move: { type: 'closest' }, noise: 'noCards',
      text: 'Все чужие движутся к ближайшему персонажу. Поломка в каждой комнате с тремя красными значками. Каждый персонаж без карт действий в руке разрешает встречу по порядку хода.' },
    { id: 'queenAwakens', name: 'Пробуждение Королевы', move: { type: 'closest' }, noise: 'all',
      text: 'Все чужие движутся к ближайшему персонажу. Королева жива — до 3 жетонов Королевы в мешок; мертва — 2 жетона дронов. Каждый персонаж делает бросок шума по порядку хода.' },
];

// ---------------------------------------------------------------------------------------------
// Serious wounds (8 kinds × 3)
// ---------------------------------------------------------------------------------------------
export const WOUNDS = {
    arm:      { name: 'Рука',        text: 'Только 1 слот рук. Если заняты оба — сразу сбросьте предмет из одного.' },
    bleeding: { name: 'Кровотечение',text: 'Каждый раз, когда вы пасуете: потеряйте 1 здоровье.' },
    body:     { name: 'Тело',        text: 'При доборе карт добирайте до 4 вместо 5.' },
    eyes:     { name: 'Глаза',       text: '+1 ко всем результатам стрельбы.' },
    guts:     { name: 'Живот',       text: 'Каждый раз, когда вы пасуете: получите заражение.' },
    hand:     { name: 'Кисть',       text: 'Использование предмета стоит на 1 карту больше.' },
    knee:     { name: 'Колено',      text: 'Первое действие перемещения в раунде стоит на 1 карту больше.' },
    leg:      { name: 'Нога',        text: 'Любое действие, уводящее вас из комнаты с чужим, стоит на 1 карту больше.' },
};

// ---------------------------------------------------------------------------------------------
// Items. kind: light | heavy | armor. weapon: { ammo, max } for ranged weapons.
// use: effect key for the Item action. oneUse: discarded after use.
// ---------------------------------------------------------------------------------------------
export const ITEMS = {
    // --- green (medical) ---
    synthFood:   { deck: 'green', count: 3, name: 'Синтетическая еда', oneUse: true, use: 'repelAdult',
                   text: 'Отгоните 1 взрослого чужого. Затем бросок шума в комнате, куда он ушёл.' },
    stimulants:  { deck: 'green', count: 3, name: 'Стимуляторы', oneUse: true, use: 'draw2orHeal2', text: 'Возьмите 2 карты ИЛИ восстановите 2 здоровья.' },
    caffeine:    { deck: 'green', count: 3, name: 'Кофеиновые таблетки', oneUse: true, use: 'draw3', text: 'Возьмите 3 карты.' },
    autodoc:     { deck: 'green', count: 3, name: 'Автодок', oneUse: true, kind: 'heavy', use: 'autodoc',
                   text: 'Сбросьте руку и колоду, уберите все заражения из сброса без проверки. Уберите личинку. Затем спасуйте.' },
    medkit:      { deck: 'green', count: 5, name: 'Аптечка', oneUse: true, kind: 'heavy', use: 'medkit', text: 'Сбросьте 1 тяжёлую травму И/ИЛИ восстановите 3 здоровья.' },
    antiseptic:  { deck: 'green', count: 3, name: 'Антисептик', oneUse: true, use: 'removeContam1', text: 'Уберите 1 заражение из руки без проверки.' },
    stapler:     { deck: 'green', count: 7, name: 'Медицинский степлер', oneUse: true, use: 'woundOrHeal2', text: 'Сбросьте 1 тяжёлую травму ИЛИ восстановите 2 здоровья.' },
    adrenaline:  { deck: 'green', count: 3, name: 'Адреналин', oneUse: true, use: 'adrenaline',
                   text: 'Возьмите 2 карты. В этот ход можно выполнить любое число действий; последним действием спасуйте.' },
    // --- red (military) ---
    supportCrate:{ deck: 'red', count: 1, name: 'Ящик поддержки', oneUse: true, use: 'supportCrate', free: true,
                   text: 'Можно использовать бесплатно сразу при получении. Возьмите 3 карты поддержки, оставьте 1.' },
    selfDestructKey:{ deck: 'red', count: 1, name: 'Ключ самоуничтожения', oneUse: true, use: 'toggleSelfDestruct',
                   text: 'Только в комнате с компьютером без поломки: запустить или остановить самоуничтожение.' },
    armor:       { deck: 'red', count: 3, name: 'Защитная броня', kind: 'armor', use: null,
                   text: 'Броня. Когда против вас открыта карта атаки взрослого, можете сбросить броню и проигнорировать атаку.' },
    grenade:     { deck: 'red', count: 5, name: 'Граната', oneUse: true, use: 'grenade',
                   text: 'Выберите свою или соседнюю комнату с чужим или яйцом. Все чужие там получают 2 ранения, до 2 яиц уничтожены, все персонажи теряют 3 здоровья.' },
    flashbang:   { deck: 'red', count: 3, name: 'Светошумовая граната', oneUse: true, use: 'flashbangMove', text: 'Переместитесь, не вызывая атак.' },
    energyCharge:{ deck: 'red', count: 10, name: 'Энергозаряд', oneUse: true, use: 'energyCharge', text: 'Откройте или закройте 1 дверь ИЛИ зарядите до 3 патронов в оружие.' },
    evacKey:     { deck: 'red', count: 1, name: 'Ключ эвакуации', oneUse: true, use: 'evacKey',
                   text: 'В эвакуационном отсеке: заблокируйте или разблокируйте 1 капсулу этой секции.' },
    taser:       { deck: 'red', count: 3, name: 'Военный шокер', oneUse: true, kind: 'heavy', use: 'taser',
                   text: 'Отгоните 1 чужого из комнаты ИЛИ персонаж по вашему выбору сбрасывает все карты.' },
    logCodes:    { deck: 'red', count: 1, name: 'Коды личных журналов', oneUse: true, use: 'logCodes',
                   text: 'Только в комнате с компьютером без поломки: посмотрите цели одного персонажа.' },
    detonator:   { deck: 'red', count: 2, name: 'Дистанционный детонатор', oneUse: true, kind: 'heavy', use: 'detonator',
                   text: 'Выберите любую комнату с тремя красными значками: все чужие там получают 3 ранения, все персонажи теряют 3 здоровья.' },
    // --- yellow (technical) ---
    cables:      { deck: 'yellow', count: 3, name: 'Кабели', oneUse: true, use: 'cables',
                   text: 'Полностью зарядите 1 оружие ИЛИ в комнате с компьютером и поломкой: уберите поломку и выполните компьютерное действие.' },
    ductTape:    { deck: 'yellow', count: 3, name: 'Скотч', oneUse: true, use: 'ductTape',
                   text: 'Уберите поломку ИЛИ почините/сломайте двигатель в его комнате.' },
    engineKey:   { deck: 'yellow', count: 2, name: 'Ключ двигателя', oneUse: true, use: 'engineKey',
                   text: 'В комнате с компьютером без поломки: проверьте любой двигатель ИЛИ переместитесь в комнату двигателя и спасуйте.' },
    extinguisher:{ deck: 'yellow', count: 5, name: 'Огнетушитель', oneUse: true, kind: 'heavy', use: 'extinguisher', text: 'Уберите огонь ИЛИ отгоните 1 чужого.' },
    glowstick:   { deck: 'yellow', count: 3, name: 'Химический фонарь', oneUse: true, use: 'glowstick',
                   text: 'Переместитесь в неразведанную комнату без броска шума ИЛИ ближний бой без заражения (выживший чужой не отвечает).' },
    nemesisPlans:{ deck: 'yellow', count: 2, name: 'Чертежи «Немезиды»', oneUse: true, use: 'nemesisPlans', text: 'Посмотрите 2 неразведанных тайла комнат.' },
    reagent:     { deck: 'yellow', count: 3, name: 'Реагент', oneUse: true, use: 'reagent', text: 'Огонь в вашей комнате; отгоните 1 взрослого чужого.' },
    techPlan:    { deck: 'yellow', count: 3, name: 'План тех. коридоров', oneUse: true, use: 'techPlan',
                   text: 'В комнате с входом в тех. коридоры: переместитесь в любую другую комнату с таким входом.' },
    tools:       { deck: 'yellow', count: 4, name: 'Инструменты', oneUse: true, use: 'tools', text: 'Уберите поломку ИЛИ почините/сломайте двигатель в его комнате.' },
    // --- support deck (Nemesis Redux ItemDeck_Support: 25 cards) ---
    assaultRifle:   { deck: 'support', count: 1, name: 'Штурмовая винтовка', kind: 'heavy', weapon: { max: 5, critOn2: true }, use: null,
                      text: 'Дальнобойное оружие, 5 патронов. Выстрел: результат «2» на кубике считается КРИТОМ (даже если результат изменён).' },
    assaultShotgun: { deck: 'support', count: 1, name: 'Штурмовой дробовик', kind: 'heavy', weapon: { max: 3 }, preventAttack: 'allAmmo', use: null,
                      text: 'Дальнобойное оружие, 3 патрона. Когда чужой атакует вас, можете сбросить ВСЕ патроны: он получает 1 ранение, атака предотвращена.' },
    autoloaderBelt: { deck: 'support', count: 1, name: 'Пояс автозарядки', kind: 'armor', ammoMax: 3, use: null,
                      text: 'Броня, 3 патрона. Патроны на поясе считаются патронами любого вашего оружия. Энергозаряд может заряжать пояс.' },
    automaticShotgun:{ deck: 'support', count: 1, name: 'Автоматический дробовик', kind: 'heavy', weapon: { max: 2, bonusHit: 1 }, use: null,
                      text: 'Дальнобойное оружие, 2 патрона. Выстрел: наносит 1 дополнительное ранение.' },
    bayonet:        { deck: 'support', count: 1, name: 'Штык', kind: 'heavy', melee: true, bayonet: true, preventAttack: 'marker', use: null,
                      text: 'Оружие ближнего боя. Занимает один слот вместе с дальнобойным оружием. Когда чужой атакует вас, можете положить жетон на штык: атака предотвращена (один раз).' },
    bfGun:          { deck: 'support', count: 1, name: 'BF-пушка', kind: 'heavy', weapon: { max: 5, plusOn5: true }, use: null,
                      text: 'Дальнобойное оружие, 5 патронов. При «5» на кубике цель получает 1 дополнительное ранение (без повторного броска).' },
    biohazardArmor: { deck: 'support', count: 1, name: 'Биозащитная броня', kind: 'armor', contamToHp: true, use: null,
                      text: 'Броня. Вместо получения карты заражения вы теряете 1 здоровье.' },
    drumMagRifle:   { deck: 'support', count: 1, name: 'Винтовка с барабаном', kind: 'heavy', weapon: { max: 7 }, use: null,
                      text: 'Дальнобойное оружие, 7 патронов. Без особых правил.' },
    engineeringEquipment:{ deck: 'support', count: 1, name: 'Инженерный набор', kind: 'heavy', use: 'engEquip',
                      text: 'Тяжёлый предмет. Уберите поломку или пожар в вашей комнате ИЛИ откройте/закройте 1 дверь.' },
    flamethrower:   { deck: 'support', count: 1, name: 'Огнемёт', kind: 'heavy', weapon: { max: 0, noAmmo: true, fireOn: [2, 6] }, use: null,
                      text: 'Дальнобойное оружие, патроны не нужны. При результате «2» или «6» в вашей комнате начинается пожар.' },
    gatlingGun:     { deck: 'support', count: 1, name: 'Пулемёт Гатлинга', kind: 'heavy', weapon: { max: 6, boost: { ammo: 2, hits: 2 } }, twoSlots: true, use: null,
                      text: 'Дальнобойное оружие, 6 патронов. Занимает оба слота рук. Выстрел: можете потратить 2 доп. патрона — +2 ранения.' },
    grenadeLauncher:{ deck: 'support', count: 1, name: 'Гранатомёт', kind: 'heavy', weapon: { max: 1, grenadeMode: true, grenadeOnly: true }, use: null,
                      text: 'Дальнобойное оружие, 1 патрон. Вместо обычного выстрела: выберите свою или соседнюю комнату (не через закрытую дверь) — двери уничтожены, все чужие получают 1 ранение, все персонажи — 1 тяжёлую травму. Заряжается только «Гранатой».' },
    handCannon:     { deck: 'support', count: 1, name: 'Ручная пушка', kind: 'heavy', weapon: { max: 3, minusOne: true }, use: null,
                      text: 'Дальнобойное оружие, 3 патрона. Выстрел: −1 к результату броска.' },
    hardenedArmor:  { deck: 'support', count: 1, name: 'Усиленная броня', kind: 'armor', woundToHp: 2, woundToHpOptional: true, use: null,
                      text: 'Броня. Вместо тяжёлой травмы можете потерять 2 здоровья (если здоровья хватает).' },
    perimeterDevice:{ deck: 'support', count: 1, name: 'Охранный периметр', kind: 'heavy', ammoMax: 2, perimeter: true, use: null,
                      text: 'Тяжёлый предмет, 2 заряда. Пассивно: когда в фазе событий вам нужно бросать шум, сбросьте 1 заряд — броска нет.' },
    plasmaGun:      { deck: 'support', count: 1, name: 'Плазменная пушка', kind: 'heavy', weapon: { max: 0, noAmmo: true, plasma: true }, use: null,
                      text: 'Дальнобойное оружие, патроны не нужны. При «2» или «6»: теряете 2 здоровья за каждый жетон на оружии, затем кладёте 1 жетон.' },
    riotgun:        { deck: 'support', count: 1, name: 'Штурмовое ружьё', kind: 'heavy', weapon: { max: 4, repelMode: true }, use: null,
                      text: 'Дальнобойное оружие, 4 патрона. Вместо обычного выстрела: потратьте 2 патрона — отгоните 1 взрослого из комнаты.' },
    securityControl:{ deck: 'support', count: 1, name: 'Пульт охраны', kind: 'heavy', use: 'secControl',
                      text: 'Тяжёлый предмет. Выберите любую комнату с пожаром или поломкой, где есть чужие, и выстрелите в одного из них (1 ранение). При «6» на пульт кладётся жетон — он выходит из строя.' },
    smartRifle:     { deck: 'support', count: 1, name: 'Умная винтовка', kind: 'heavy', weapon: { max: 4, reroll: true }, use: null,
                      text: 'Дальнобойное оружие, 4 патрона. Выстрел: неудачный бросок перебрасывается один раз, второй результат окончателен.' },
    sniperRifle:    { deck: 'support', count: 1, name: 'Снайперская винтовка', kind: 'heavy', weapon: { max: 4, sniper: true }, use: null,
                      text: 'Дальнобойное оружие, 4 патрона. Можно стрелять в соседнюю комнату (не через закрытую дверь) — тогда +1 ранение.' },
    sonicGun:       { deck: 'support', count: 1, name: 'Звуковая пушка', kind: 'heavy', weapon: { max: 0, noAmmo: true, plusOne: true, malfOn: [2, 6] }, use: null,
                      text: 'Дальнобойное оружие, патроны не нужны. +1 к результату броска. При «2» или «6» положите поломку в вашей комнате.' },
    smg:            { deck: 'support', count: 1, name: 'Пистолет-пулемёт', kind: 'heavy', weapon: { max: 5, boost: { ammo: 1, hits: 1 } }, use: null,
                      text: 'Дальнобойное оружие, 5 патронов. Выстрел: можете потратить 1 доп. патрон — +1 ранение.' },
    tacticalArmor:  { deck: 'support', count: 1, name: 'Тактическая броня', kind: 'armor', heavyArmor: true, use: null,
                      text: 'Броня. Каждая атака чужого наносит на 1 ранение меньше.' },
    tacticalHatchet:{ deck: 'support', count: 1, name: 'Тактический топорик', kind: 'heavy', melee: true, hatchet: true, use: null,
                      text: 'Оружие ближнего боя. Один раз: атака в ближнем бою наносит 2 ранения без ответной атаки; затем на топорик кладётся жетон.' },
    utilityVest:    { deck: 'support', count: 1, name: 'Разгрузочный жилет', kind: 'armor', vest: true, use: null,
                      text: 'Броня. При обыске можно оставить 2 предмета вместо 1. Действие «предмет» позволяет использовать 2 предмета.' },
    // --- starting weapons ---
    soldierGun:  { deck: 'start', count: 0, name: 'Винтовка солдата', kind: 'heavy', weapon: { max: 6, firstShotBonus: true }, use: null,
                   text: 'Дальнобойное оружие, 6 патронов. Первый выстрел в ходу наносит 1 дополнительное ранение.' },
    handgun:     { deck: 'start', count: 0, name: 'Пистолет', kind: 'heavy', weapon: { max: 3, plusOne: true }, use: null,
                   text: 'Дальнобойное оружие, 3 патрона. +1 к результату стрельбы.' },
    scoutRifle:  { deck: 'start', count: 0, name: 'Винтовка разведчика', kind: 'heavy', weapon: { max: 4, drawOnKill: true }, use: null,
                   text: 'Дальнобойное оружие, 4 патрона. Убив чужого, возьмите 1 карту (раз в ход).' },
    sawedOff:    { deck: 'start', count: 0, name: 'Обрез механика', kind: 'heavy', weapon: { max: 2, firstShotBonus: true }, use: null,
                   text: 'Дальнобойное оружие, 2 патрона. Первый выстрел в ходу наносит 1 дополнительное ранение.' },
    mechTools:   { deck: 'start', count: 0, name: 'Набор механика', quest: true, use: 'mechTools',
                   text: 'Квестовый предмет. Почините/сломайте двигатель в его комнате ИЛИ уберите поломку в вашей комнате.' },
    smartGun:    { deck: 'start', count: 0, name: 'Умный пистолет', kind: 'heavy', weapon: { max: 4, reroll: true }, use: null,
                   text: 'Дальнобойное оружие, 4 заряда. Неудачный бросок перебрасывается один раз. Заряжается картой «Подзарядка».' },
    riotShotgun: { deck: 'start', count: 0, name: 'Штурмовой дробовик', kind: 'heavy', weapon: { max: 3, spread: true }, use: null,
                   text: 'Дальнобойное оружие, 3 патрона. После выстрела все остальные чужие в комнате получают по 1 ранению.' },
    energyPistol:{ deck: 'start', count: 0, name: 'Энергопистолет', kind: 'heavy', weapon: { max: 0, noAmmo: true }, use: null,
                   text: 'Дальнобойное оружие, патроны не нужны. Особых правил нет.' },
    bountyRifle: { deck: 'start', count: 0, name: 'Карабин охотника', kind: 'heavy', weapon: { max: 5, plusOne: true }, use: null,
                   text: 'Дальнобойное оружие, 5 патронов. +1 к результату стрельбы.' },
    sixShooter:  { deck: 'start', count: 0, name: 'Старый шестизарядник', kind: 'heavy', weapon: { max: 6, firstShotBonus: true }, use: null,
                   text: 'Дальнобойное оружие, 6 патронов. Первый выстрел в ходу наносит 1 дополнительное ранение. Карты «Веер» и «Перезарядка» работают с ним.' },
    probeArm:    { deck: 'start', count: 0, name: 'Манипулятор-зонд', kind: 'armor', quest: true, use: 'probeArm', free: true, markers: 3,
                   text: 'Броня. В комнате с чужим: положите 1 жетон на предмет (всего 3), чтобы нанести чужому 1 ранение и получить 1 образец ткани. Жетоны снимаются картами «Сверхразум» и «Вивисекция».' },
    xenoGun:     { deck: 'start', count: 0, name: 'Пистолет ксенобиолога', kind: 'heavy', weapon: { max: 3, plusOne: true, critDiscard: true }, use: null,
                   text: 'Дальнобойное оружие, 3 патрона. +1 к результату стрельбы. При КРИТе сбросьте 1 карту, если возможно.' },
    survivorFavorite: { deck: 'start', count: 0, name: 'Любимица выжившей', kind: 'heavy', weapon: { max: 5, minusOne: true }, use: null,
                   text: 'Дальнобойное оружие, 5 патронов. −1 к результату стрельбы.' },
    pipe:        { deck: 'start', count: 0, name: 'Труба', kind: 'heavy', quest: true, use: 'pipeMelee',
                   text: 'Оружие ближнего боя. Используйте: ближний бой без получения заражения.' },
    cuffs:       { deck: 'start', count: 0, name: 'Наручники', quest: true, use: null, markers: 6,
                   text: 'На наручниках 6 жетонов. Карты заключённого сбрасывают их; когда жетонов нет, наручники сняты и карты усиливаются.' },
    robot:       { deck: 'start', count: 0, name: 'Робот-телохранитель', quest: true, use: null, markers: 5,
                   text: 'На роботе 5 жетонов энергии. «Удар робота» тратит их на дополнительные ранения, «Запасная батарея» восстанавливает.' },
    ups:         { deck: 'start', count: 0, name: 'ИБП андроида', quest: true, use: null, markers: 3,
                   text: 'Источник питания с 3 жетонами. «Подзарядка» добавляет жетоны, «Обход протокола» тратит их.' },
    laika:       { deck: 'start', count: 0, name: 'Лайка', quest: true, use: null,
                   text: 'Нельзя передать или сбросить. Пассивно: перед первым действием в каждой фазе игроков можете переместить Лайку в соседнюю комнату или отозвать её (на свой планшет с любого расстояния). Если Лайка оказалась в одной комнате с охотником или с чужим — она автоматически возвращается. На поле она делает броски шума как персонаж (в фазе событий — как игрок слева от охотника). Персонаж, входящий в комнату Лайки, не бросает шум. Лайка игнорирует огонь, чужие её не атакуют.' },
    wrench:      { deck: 'start', count: 0, name: 'Разводной ключ', quest: true, use: 'wrench',
                   text: 'Квестовый предмет. Уберите поломку в вашей комнате ИЛИ уберите огонь в вашей комнате.' },
    fieldKit:    { deck: 'start', count: 0, name: 'Полевая аптечка', quest: true, use: 'fieldKit',
                   text: 'Квестовый предмет. Восстановите 1 здоровье себе или персонажу в вашей комнате.' },
    sampleJar:   { deck: 'start', count: 0, name: 'Контейнер для образцов', quest: true, use: 'sampleJar',
                   text: 'Квестовый предмет. Сбросьте 1 заражение из руки (без проверки).' },
    oculobe:     { deck: 'start', count: 0, name: 'Дрон «Окулоб»', quest: true, use: null,
                   text: 'Летающий помощник. «Сканер эмоций» и «Помощь» можно применять к персонажам в соседних комнатах.' },
    navTablet:   { deck: 'start', count: 0, name: 'Планшет навигатора', quest: true, use: 'navTablet',
                   text: 'Квестовый предмет. Тайно проверьте состояние одного двигателя (раз за игру).' , oneUse: true },
};

export const DECK_ORDER = ['green', 'red', 'yellow'];
export const DECK_NAMES = { green: 'Зелёные (медицина)', red: 'Красные (военные)', yellow: 'Жёлтые (техника)', support: 'Поддержка' };

// ---------------------------------------------------------------------------------------------
// Characters & action decks. Zones are paint regions on the 3D model (first preset is default).
// ---------------------------------------------------------------------------------------------
const SKIN = ['#e8b89a', '#d29b7c', '#b5805f', '#8d5a3c', '#5e3b26', '#f2d2bd'];
const HAIR = ['#2a1b12', '#5a3a22', '#a56b3c', '#d9b36c', '#c4c4c4', '#8a1f1f', '#1c1c1c', '#e8e2d0'];

export const COMMON_CARDS = {
    demolition:  { name: 'Подрыв', cost: 1, effect: 'demolition', text: 'Поставьте поломку ИЛИ уничтожьте 1 закрытую дверь.' },
    interruption:{ name: 'Вмешательство', cost: 1, reaction: true, effect: 'interruption',
                   text: 'Реакция (пока не автоматизирована — можно сбросить как оплату). Когда персонаж в вашей комнате играет карту: отмените её эффект.' },
    repairs:     { name: 'Ремонт', cost: 1, effect: 'repairs', text: 'Сбросьте ещё 1 карту: уберите поломку ИЛИ откройте/закройте дверь ИЛИ (ещё 1 карта) почините/сломайте двигатель в его комнате.' },
    rest:        { name: 'Отдых', cost: 1, noCombat: true, effect: 'rest', text: 'Процедура инфекции: проверьте все заражения в руке; незаражённые уходят из игры.' },
    search:      { name: 'Поиск', cost: 1, noCombat: true, effect: 'search', text: 'За каждый значок предмета в комнате возьмите 1 предмет соответствующего цвета. Оставьте 1.' },
    weakSpot:    { name: 'Уязвимое место', cost: 1, effect: 'weakSpot', text: 'Выстрелите или атакуйте в ближнем бою и нанесите на 1 ранение больше.' },
};

export const CHARACTERS = {
    soldier: {
        name: 'Солдат', color: '#c0392b', health: 10, zones: [
            { id: 'skin',   label: 'Кожа',          presets: SKIN },
            { id: 'hair',   label: 'Волосы',        presets: HAIR },
            { id: 'armor',  label: 'Броня',         presets: ['#5a6b5c', '#3a3f44', '#6b4f3a', '#2c3e50', '#7a1f1f', '#8c8c8c'] },
            { id: 'accent', label: 'Вставки брони', presets: ['#c0392b', '#e67e22', '#f1c40f', '#2ecc71', '#3498db', '#ecf0f1'] },
            { id: 'pants',  label: 'Штаны',         presets: ['#2d3436', '#4b3d2a', '#1e3d2b', '#3b2f4a', '#555'] },
            { id: 'visor',  label: 'Свечение визора', presets: ['#ff3b3b', '#3bff7a', '#3bb8ff', '#ffd23b', '#ff3bd1'] },
        ],
        startItems: [{ item: 'soldierGun', ammo: 6 }, { item: 'handgun', ammo: 3 }],
        cards: {
            coveringFire: { name: 'Прикрывающий огонь', cost: 1, effect: 'coveringFire', text: 'Сбросьте ещё 1 карту и 2 патрона из дальнобойного оружия: переместитесь (можно с согласным персонажем), атаки чужих при этом не происходят.' },
            demolition: COMMON_CARDS.demolition,
            forcingFire: { name: 'Подавляющий огонь', cost: 1, effect: 'forcingFire', text: 'Сбросьте ещё 1 карту и 1 патрон: отгоните 1 взрослого чужого.' },
            interruption: COMMON_CARDS.interruption,
            myLittleFriend: { name: 'Моя крошка', cost: 1, effect: 'myLittleFriend', text: 'Зарядите 1 патрон в винтовку солдата ИЛИ стреляйте из неё, пока не кончатся патроны или чужие в комнате.' },
            nervesOfSteel: { name: 'Стальные нервы', cost: 1, reaction: true, effect: 'preventAttack', text: 'Реакция: когда вас атакует чужой — предотвратите атаку.' },
            repairs: COMMON_CARDS.repairs, rest: COMMON_CARDS.rest, search: COMMON_CARDS.search, weakSpot: COMMON_CARDS.weakSpot,
        },
    },
    scout: {
        name: 'Разведчица', color: '#8e44ad', health: 10, zones: [
            { id: 'skin',   label: 'Кожа',          presets: SKIN },
            { id: 'hair',   label: 'Волосы',        presets: ['#8a1f3a', '#2a1b12', '#5a3a22', '#d9b36c', '#3b2f6a', '#e8e2d0'] },
            { id: 'suit',   label: 'Комбинезон',    presets: ['#3b2f4a', '#1f2a44', '#2d3436', '#4a1f2f', '#3a4a3a'] },
            { id: 'jacket', label: 'Куртка',        presets: ['#8e44ad', '#2c3e50', '#7f8c8d', '#a04000', '#1abc9c'] },
            { id: 'boots',  label: 'Ботинки',       presets: ['#1c1c1c', '#4b3d2a', '#5c5c5c', '#2e1f14'] },
            { id: 'visor',  label: 'Свечение визора', presets: ['#d13bff', '#3bb8ff', '#3bff7a', '#ffd23b'] },
        ],
        startItems: [{ item: 'scoutRifle', ammo: 4 }],
        cards: {
            adrenaline: { name: 'Адреналин', cost: 1, effect: 'scoutAdrenaline', text: 'Только в комнате с чужим: возьмите 2 карты, затем сбросьте 1 (можно заражение).' },
            demolition: COMMON_CARDS.demolition,
            distraction: { name: 'Отвлечение', cost: 1, effect: 'distraction', text: 'Сбросьте 1 предмет: переместитесь, атаки чужих при этом не происходят.' },
            interruption: COMMON_CARDS.interruption,
            reconnaissance: { name: 'Разведка', cost: 1, effect: 'reconnaissance', text: 'Посмотрите соседнюю неразведанную комнату и её жетон; можно сбросить ещё 1 карту и переместиться туда без броска шума. ИЛИ сбросьте ещё 1 карту: переместитесь в разведанную комнату без шума.' },
            repairs: COMMON_CARDS.repairs, rest: COMMON_CARDS.rest,
            scavenging: { name: 'Мародёрство', cost: 1, noCombat: true, effect: 'scavenging', text: 'В комнате без поломки, сбросьте ещё 1 карту: поиск (как карта «Поиск»).' },
            search: COMMON_CARDS.search, weakSpot: COMMON_CARDS.weakSpot,
        },
    },
    mechanic: {
        name: 'Механик', color: '#d68910', health: 10, zones: [
            { id: 'skin',    label: 'Кожа',          presets: SKIN },
            { id: 'hair',    label: 'Волосы',        presets: HAIR },
            { id: 'overall', label: 'Комбинезон',    presets: ['#d68910', '#6b4f3a', '#3a3f44', '#1e5a3a', '#7a1f1f'] },
            { id: 'helmet',  label: 'Шлем',          presets: ['#ecf0f1', '#f1c40f', '#3a3f44', '#c0392b', '#2980b9'] },
            { id: 'gloves',  label: 'Перчатки',      presets: ['#2d3436', '#f39c12', '#7f8c8d', '#8e44ad'] },
            { id: 'lights',  label: 'Подсветка',     presets: ['#ffd23b', '#3bb8ff', '#3bff7a', '#ff3b3b'] },
        ],
        startItems: [{ item: 'sawedOff', ammo: 2 }, { item: 'mechTools' }],
        cards: {
            computerSkills: { name: 'Компьютерные навыки', cost: 1, effect: 'computerSkills', text: 'В комнате с компьютером без поломки: используйте комнату. ИЛИ откройте/закройте дверь в любом коридоре корабля.' },
            demolition: COMMON_CARDS.demolition,
            duckAndCover: { name: 'Пригнуться', cost: 1, effect: 'duckAndCover', reactionToo: 'duckReaction', text: 'Сбросьте ещё 1 карту: переместитесь, предотвратив 1 атаку чужого. ИЛИ Реакция: когда вас атакует чужой в комнате с другим персонажем — чужой атакует его вместо вас.' },
            fastRepairs: { name: 'Быстрый ремонт', cost: 1, noCombat: true, effect: 'fastRepairs', text: 'Уберите поломку ИЛИ откройте/закройте дверь ИЛИ почините/сломайте двигатель в его комнате.' },
            fightFire: { name: 'Клин клином', cost: 1, noCombat: true, effect: 'fightFire', text: 'Уберите огонь ИЛИ сбросьте 1 предмет, чтобы поставить огонь.' },
            ingenuity: { name: 'Смекалка', cost: 1, noCombat: true, effect: 'ingenuity', text: 'Уберите поломку ИЛИ почините/сломайте двигатель ИЛИ (ещё 2 карты и набор механика) возьмите 3 карты поддержки, оставьте 1.' },
            interruption: COMMON_CARDS.interruption,
            rest: COMMON_CARDS.rest, search: COMMON_CARDS.search,
            technicalCorridors: { name: 'Технические коридоры', cost: 1, noCombat: true, effect: 'techCorridors', text: 'В комнате с входом в тех. коридоры, сбросьте ещё 1 карту: переместитесь в любую другую комнату с таким входом и спасуйте.' },
        },
    },
    pilot: {
        name: 'Пилот', color: '#27ae60', health: 10, zones: [
            { id: 'skin',   label: 'Кожа',          presets: SKIN },
            { id: 'hair',   label: 'Волосы',        presets: ['#e8e2d0', '#d9b36c', '#2a1b12', '#c4c4c4', '#8a1f1f'] },
            { id: 'suit',   label: 'Лётный костюм', presets: ['#6b7a3c', '#2d3436', '#2c3e50', '#7a5a2a', '#4a1f2f'] },
            { id: 'armor',  label: 'Наплечники',    presets: ['#c9c38a', '#8c8c8c', '#5a6b5c', '#f1c40f', '#3a3f44'] },
            { id: 'gloves', label: 'Перчатки',      presets: ['#2d3436', '#6b4f3a', '#7f8c8d', '#1c1c1c'] },
            { id: 'visor',  label: 'Монокль',       presets: ['#3bff7a', '#3bb8ff', '#ffd23b', '#ff3b3b'] },
        ],
        startItems: [{ item: 'handgun', ammo: 3 }, { item: 'navTablet' }],
        cards: {
            computerSkills: { name: 'Компьютерные навыки', cost: 1, effect: 'computerSkills', text: 'В комнате с компьютером без поломки: используйте комнату. ИЛИ откройте/закройте дверь в любом коридоре корабля.' },
            demolition: COMMON_CARDS.demolition,
            determination: { name: 'Решимость', cost: 1, effect: 'determination', text: 'В комнате без поломки и огня: возьмите 2 карты, затем сбросьте 1 (можно заражение).' },
            interruption: COMMON_CARDS.interruption,
            knowledgeOfShip: { name: 'Знание корабля', cost: 1, effect: 'knowledgeOfShip', text: 'В комнате без компьютера: используйте комнату. ИЛИ откройте/закройте 1 дверь. ИЛИ посмотрите тайл любой неразведанной комнаты (без жетона).' },
            piloting: { name: 'Пилотирование', cost: 1, effect: 'piloting', text: 'В кабине или комнате с компьютером (без поломки): используйте комнату. ИЛИ в комнате с компьютером (без поломки): тайно посмотрите координаты.' },
            repairs: COMMON_CARDS.repairs, rest: COMMON_CARDS.rest, search: COMMON_CARDS.search, weakSpot: COMMON_CARDS.weakSpot,
        },
    },
    hacker: {
        name: 'Хакер', color: '#16a085', health: 10, zones: [
            { id: 'skin',   label: 'Кожа',          presets: SKIN },
            { id: 'hood',   label: 'Капюшон',       presets: ['#3a4a3a', '#2d3436', '#1f2a44', '#4a1f2f', '#5a5a5a'] },
            { id: 'jacket', label: 'Куртка',        presets: ['#4a5a3a', '#3a3f44', '#2c3e50', '#6b4f3a'] },
            { id: 'pants',  label: 'Штаны',         presets: ['#2d3436', '#4b3d2a', '#1e3d2b', '#3b2f4a'] },
            { id: 'gear',   label: 'Снаряжение',    presets: ['#8c96a0', '#c9a227', '#7f8c8d', '#2d3436'] },
            { id: 'lights', label: 'Подсветка',     presets: ['#3bff7a', '#3bb8ff', '#ffd23b', '#ff3bd1'] },
        ],
        startItems: [{ item: 'smartGun', ammo: 2 }],
        cards: {
            computerSkills: { name: 'Компьютерные навыки', cost: 1, effect: 'computerSkills', text: 'В комнате с компьютером без поломки: используйте комнату. ИЛИ откройте/закройте дверь в любом коридоре корабля.' },
            demolition: COMMON_CARDS.demolition, interruption: COMMON_CARDS.interruption,
            masterPlan: { name: 'Генеральный план', cost: 1, effect: 'masterPlan', text: 'В комнате с компьютером (без поломки): выполните 2 действия компьютера (поломки от «Блокировки» не ставятся). ИЛИ посмотрите тайл любой неразведанной комнаты.' },
            neuralink: { name: 'Нейроинтерфейс', cost: 1, effect: 'neuralink', text: 'Выполните действие компьютера, даже в комнате без компьютера.' },
            override: { name: 'Переопределение', cost: 1, effect: 'override', text: 'В комнате с компьютером (без поломки): выберите любую карту компьютера текущей, остальные перемешайте. ИЛИ в комнате с компьютером: уберите поломку.' },
            recharge: { name: 'Подзарядка', cost: 1, effect: 'recharge', text: 'Зарядите до 2 зарядов в Умный пистолет.' },
            repairs: COMMON_CARDS.repairs, rest: COMMON_CARDS.rest, search: COMMON_CARDS.search,
        },
    },
    scientist: {
        name: 'Учёный', color: '#2980b9', health: 10, zones: [
            { id: 'skin',   label: 'Кожа',          presets: SKIN },
            { id: 'hair',   label: 'Волосы',        presets: ['#c4c4c4', '#e8e2d0', '#5a3a22', '#2a1b12'] },
            { id: 'coat',   label: 'Куртка',        presets: ['#b9c6cf', '#dfe6ee', '#5a6b7c', '#3a3f44'] },
            { id: 'shirt',  label: 'Рубашка',       presets: ['#2c3e50', '#7a1f1f', '#1e5a3a', '#2d3436'] },
            { id: 'pants',  label: 'Брюки',         presets: ['#2d3436', '#4b3d2a', '#3b2f4a', '#555'] },
            { id: 'lights', label: 'Очки/приборы',  presets: ['#3bb8ff', '#ff3b3b', '#3bff7a', '#ffd23b'] },
        ],
        startItems: [{ item: 'handgun', ammo: 3 }],
        cards: {
            computerSkills: { name: 'Компьютерные навыки', cost: 1, effect: 'computerSkills', text: 'В комнате с компьютером без поломки: используйте комнату. ИЛИ откройте/закройте дверь в любом коридоре корабля.' },
            connection: { name: 'Соединение', cost: 1, effect: 'connection', text: 'В комнате с компьютером: используйте комнату (даже с поломкой). ИЛИ в комнате с компьютером (без поломки): поставьте или уберите поломку в любой другой комнате с компьютером.' },
            demolition: COMMON_CARDS.demolition,
            duckAndCover: { name: 'Пригнуться', cost: 1, effect: 'duckAndCover', text: 'Сбросьте ещё 1 карту: переместитесь, предотвратив 1 атаку чужого.' },
            interruption: COMMON_CARDS.interruption,
            intranet: { name: 'Интранет', cost: 1, effect: 'intranet', text: 'В комнате с компьютером (без поломки): используйте любую другую разведанную комнату с компьютером (без поломки).' },
            repairs: COMMON_CARDS.repairs, rest: COMMON_CARDS.rest,
            riskAssessment: { name: 'Оценка рисков', cost: 1, effect: 'riskAssessment', text: 'В комнате с компьютером (без поломки): посмотрите верхнюю карту колоды событий и верните её наверх или вниз.' },
            search: COMMON_CARDS.search,
        },
    },
    medic: {
        name: 'Медик', color: '#c2185b', health: 10, zones: [
            { id: 'skin',   label: 'Кожа',          presets: SKIN },
            { id: 'hair',   label: 'Волосы',        presets: ['#c0552a', '#8a1f3a', '#2a1b12', '#d9b36c', '#e8e2d0'] },
            { id: 'coat',   label: 'Халат',         presets: ['#dfe6ee', '#b9c6cf', '#c9d8c0', '#3a3f44'] },
            { id: 'cap',    label: 'Кепка',         presets: ['#7f8c8d', '#c2185b', '#2c3e50', '#1c1c1c'] },
            { id: 'pants',  label: 'Брюки',         presets: ['#2d3436', '#4b3d2a', '#3b2f4a', '#555'] },
            { id: 'lights', label: 'Индикаторы',    presets: ['#ff3b3b', '#3bff7a', '#3bb8ff', '#ff3bd1'] },
        ],
        startItems: [{ item: 'handgun', ammo: 2 }, { item: 'fieldKit' }],
        cards: {
            computerSkills: { name: 'Компьютерные навыки', cost: 1, effect: 'computerSkills', text: 'В комнате с компьютером без поломки: используйте комнату. ИЛИ откройте/закройте дверь в любом коридоре корабля.' },
            demolition: COMMON_CARDS.demolition,
            fieldSurgery: { name: 'Полевая хирургия', cost: 1, effect: 'fieldSurgery', text: 'Уберите 1 тяжёлую травму у персонажа в вашей комнате. Он сбрасывает 1 карту или получает заражение.' },
            firstAid: { name: 'Первая помощь', cost: 1, effect: 'firstAid', text: 'Восстановите 2 здоровья. ИЛИ в комнате с зелёным значком (без поломки): возьмите 1 зелёный предмет, можно оставить.' },
            interruption: COMMON_CARDS.interruption,
            neurotoxicGas: { name: 'Нейротоксин', cost: 1, effect: 'neurotoxicGas', text: 'Сбросьте ещё 1 карту и 1 зелёный предмет: переместитесь (можно с другим персонажем), атаки чужих не происходят. Оставшиеся в комнате персонажи сбрасывают 1 карту.' },
            repairs: COMMON_CARDS.repairs, rest: COMMON_CARDS.rest, search: COMMON_CARDS.search,
            synthesizedDrugs: { name: 'Стимуляторы', cost: 1, noCombat: true, effect: 'synthesizedDrugs', text: 'В комнате с зелёным значком без поломки и огня: выбранный персонаж добирает до 2 карт (не более 3 в руке). Если он спасовал — снова в игре.' },
        },
    },
    janitor: {
        name: 'Уборщик', color: '#e67e22', health: 10, zones: [
            { id: 'skin',   label: 'Кожа',          presets: SKIN },
            { id: 'hair',   label: 'Борода/волосы', presets: ['#c4c4c4', '#e8e2d0', '#5a3a22', '#2a1b12'] },
            { id: 'overall',label: 'Комбинезон',    presets: ['#e67e22', '#c0392b', '#6b7a3c', '#3a3f44', '#2c3e50'] },
            { id: 'cap',    label: 'Кепка',         presets: ['#c0392b', '#2d3436', '#f1c40f', '#2c3e50'] },
            { id: 'gloves', label: 'Перчатки',      presets: ['#f1c40f', '#2d3436', '#7f8c8d'] },
            { id: 'lights', label: 'Индикаторы',    presets: ['#ffd23b', '#3bff7a', '#3bb8ff', '#ff3b3b'] },
        ],
        startItems: [{ item: 'handgun', ammo: 2 }, { item: 'wrench' }],
        cards: {
            cleanUp: { name: 'Уборка', cost: 1, noCombat: true, effect: 'cleanUp', text: 'Уберите поломку в вашей комнате. ИЛИ уберите огонь в вашей комнате.' },
            demolition: COMMON_CARDS.demolition,
            duckAndCover: { name: 'Пригнуться', cost: 1, effect: 'duckAndCover', text: 'Сбросьте ещё 1 карту: переместитесь, предотвратив 1 атаку чужого.' },
            emergencyKey: { name: 'Аварийный ключ', cost: 1, noCombat: true, effect: 'emergencyKey', text: 'В комнате с входом в тех. коридоры: переместитесь в другую комнату с таким входом. ИЛИ откройте/закройте 1 дверь.' },
            interruption: COMMON_CARDS.interruption,
            itShouldWork: { name: 'Должно работать', cost: 1, effect: 'itShouldWork', text: 'Зарядите 1 патрон в дальнобойное оружие. ИЛИ почините сломанный предмет. ИЛИ сбросьте ещё 1 карту: используйте комнату (даже с поломкой).' },
            maintenancePlan: { name: 'План обслуживания', cost: 1, effect: 'maintenancePlan', text: 'В комнате с компьютером (без поломки), сбросьте ещё 1 карту: уберите поломку в любой комнате с жёлтым значком. ИЛИ посмотрите тайл любой неразведанной комнаты.' },
            repairs: COMMON_CARDS.repairs, rest: COMMON_CARDS.rest, search: COMMON_CARDS.search,
        },
    },
    ceo: {
        name: 'Директор', color: '#1abc9c', health: 10, zones: [
            { id: 'skin',   label: 'Кожа',          presets: SKIN },
            { id: 'hair',   label: 'Волосы',        presets: ['#e8e2d0', '#c4c4c4', '#5a3a22', '#2a1b12'] },
            { id: 'coat',   label: 'Пальто',        presets: ['#7f8c8d', '#3a3f44', '#2c3e50', '#4b3d2a'] },
            { id: 'shirt',  label: 'Рубашка',       presets: ['#dfe6ee', '#2d3436', '#7a1f1f', '#1e5a3a'] },
            { id: 'robot',  label: 'Робот',         presets: ['#2d3436', '#8c96a0', '#1abc9c', '#5a3a3a'] },
            { id: 'lights', label: 'Визор робота',  presets: ['#ff3b3b', '#3bb8ff', '#3bff7a', '#ffd23b'] },
        ],
        startItems: [{ item: 'handgun', ammo: 3 }, { item: 'robot' }],
        cards: {
            backupBattery: { name: 'Запасная батарея', cost: 1, removeAfter: true, effect: 'backupBattery', text: 'Уберите карту из игры: восстановите все жетоны энергии робота.' },
            command: { name: 'Приказ', cost: 1, effect: 'command', text: 'Выберите другого персонажа в вашей или соседней комнате: он перемещается или стреляет (выбираете вы), затем он берёт 1 карту. Нельзя заставить уйти из комнаты с чужим. Нельзя прервать «Вмешательством».' },
            computerSkills: { name: 'Компьютерные навыки', cost: 1, effect: 'computerSkills', text: 'В комнате с компьютером без поломки: используйте комнату. ИЛИ откройте/закройте дверь в любом коридоре корабля.' },
            demolition: COMMON_CARDS.demolition,
            fastRepairs: { name: 'Быстрый ремонт', cost: 1, noCombat: true, effect: 'fastRepairs', text: 'Уберите поломку ИЛИ откройте/закройте дверь ИЛИ почините/сломайте двигатель в его комнате.' },
            interruption: COMMON_CARDS.interruption,
            justOneMoreThing: { name: 'Ещё одну вещь', cost: 0, reaction: true, removeAfter: true, effect: 'justOneMoreThing', text: 'Реакция (после вашего паса): возьмите 1 карту. Выполните дополнительный ход; после него вы обязаны спасовать.' },
            protect: { name: 'Защита', cost: 1, removeAfter: true, effect: 'protect', text: 'Уберите карту из игры: переместитесь, атаки чужих при этом не происходят.' },
            rest: COMMON_CARDS.rest,
            roboticPunch: { name: 'Удар робота', cost: 1, effect: 'roboticPunch', text: 'Нанесите 1 ранение выбранному чужому. За каждый сброшенный жетон энергии робота — ещё 1 ранение.' },
            search: COMMON_CARDS.search,
            stopIt: { name: 'Stop It!', cost: 0, reaction: true, removeAfter: true, effect: 'stopIt', text: 'Реакция (после вскрытия карты атаки): уберите карту из игры, чтобы проигнорировать эффекты атаки.' },
        },
    },
    labrat: {
        name: 'Подопытная', color: '#7d3c98', health: 10, zones: [
            { id: 'skin',   label: 'Кожа',          presets: SKIN },
            { id: 'hair',   label: 'Волосы',        presets: ['#1c1c1c', '#2a1b12', '#5a3a22', '#8a1f3a'] },
            { id: 'gown',   label: 'Больничная роба', presets: ['#9fd0c6', '#c9d8c0', '#dfe6ee', '#b8a8c8'] },
            { id: 'pants',  label: 'Штаны',         presets: ['#7f8c8d', '#2d3436', '#4b3d2a'] },
            { id: 'bandage',label: 'Повязка',       presets: ['#dfe6ee', '#c9a227', '#7f8c8d'] },
            { id: 'lights', label: 'Импланты',      presets: ['#ff3bd1', '#3bb8ff', '#3bff7a', '#ff3b3b'] },
        ],
        startItems: [{ item: 'sampleJar' }],
        cards: {
            demolition: COMMON_CARDS.demolition,
            feelOfDark: { name: 'Чувство темноты', cost: 1, effect: 'feelOfDark', text: 'Сбросьте ещё 1 карту: переместитесь без броска шума, предотвратив 1 атаку чужого.' },
            inconspicuous: { name: 'Незаметность', cost: 1, reaction: true, effect: 'inconspicuous', text: 'Реакция: если в фазе событий вам нужно бросать шум или разыгрывать встречу — не делайте этого.' },
            interruption: COMMON_CARDS.interruption,
            repairs: COMMON_CARDS.repairs, rest: COMMON_CARDS.rest, search: COMMON_CARDS.search,
            sensitiveHearing: { name: 'Острый слух', cost: 1, effect: 'sensitiveHearing', text: 'Уберите жетон шума из любого коридора корабля. ИЛИ положите жетон шума в любой коридор без шума.' },
            shriek: { name: 'Визг', cost: 1, effect: 'shriek', text: 'Получите заражение: отгоните 1 взрослого чужого из вашей комнаты.' },
            weirdMetabolism: { name: 'Странный метаболизм', cost: 1, effect: 'weirdMetabolism', text: 'Сбросьте 1 заражение, чтобы взять 2 карты. ИЛИ в комнате с тяжёлым объектом (не в руках): уничтожьте его, чтобы восстановить 2 здоровья и/или убрать 1 тяжёлую травму.' },
        },
    },
    sentry: {
        name: 'Охранник', color: '#5d6d7e', health: 10, zones: [
            { id: 'skin',   label: 'Кожа',          presets: SKIN },
            { id: 'armor',  label: 'Броня',         presets: ['#3a4a5a', '#2d3436', '#5a6b5c', '#4b3d2a', '#7a1f1f'] },
            { id: 'accent', label: 'Вставки',       presets: ['#8c96a0', '#c9a227', '#c0392b', '#3498db'] },
            { id: 'pants',  label: 'Штаны',         presets: ['#2d3436', '#1e3d2b', '#3b2f4a'] },
            { id: 'helmet', label: 'Шлем',          presets: ['#2d3436', '#5a6b5c', '#8c96a0', '#7a1f1f'] },
            { id: 'visor',  label: 'Ночные линзы',  presets: ['#3bff7a', '#3bb8ff', '#ff3b3b', '#ffd23b'] },
        ],
        startItems: [{ item: 'smg', ammo: 5 }],
        cards: {
            defensePlan: { name: 'План обороны', cost: 1, effect: 'defensePlan', text: 'Уберите жетон шума из коридора у вашей комнаты; можно закрыть 1 дверь у вашей комнаты. ИЛИ посмотрите тайл любой неразведанной комнаты.' },
            demolition: COMMON_CARDS.demolition,
            facilityTour: { name: 'Обход объекта', cost: 1, effect: 'facilityTour', text: 'Сбросьте ещё 1 карту: вы или другой персонаж из вашей комнаты перемещаетесь без атак чужих; жетон исследования можно проигнорировать.' },
            interruption: COMMON_CARDS.interruption,
            repairs: COMMON_CARDS.repairs, rest: COMMON_CARDS.rest, search: COMMON_CARDS.search,
            securityControl: { name: 'Пульт охраны', cost: 1, effect: 'securityControl', text: 'В комнате с компьютером (без поломки): нанесите 2 ранения любому чужому на корабле. ИЛИ откройте/закройте дверь в любом коридоре.' },
            stun: { name: 'Оглушение', cost: 1, effect: 'stun', text: 'Выберите персонажа с 3 картами или меньше: он сбрасывает все карты и пасует. ИЛИ сломайте своё оружие, чтобы отогнать 1 взрослого чужого.' },
            weakSpot: COMMON_CARDS.weakSpot,
        },
    },
    android: {
        name: 'Андроид', color: '#2ecc71', health: 10, zones: [
            { id: 'skin',   label: 'Кожа',          presets: SKIN },
            { id: 'hair',   label: 'Волосы',        presets: ['#2a1b12', '#1c1c1c', '#5a3a22', '#e8e2d0'] },
            { id: 'vest',   label: 'Жилет',         presets: ['#4a6b5c', '#2c3e50', '#3a3f44', '#7a1f1f'] },
            { id: 'shirt',  label: 'Рубашка',       presets: ['#dfe6ee', '#b9c6cf', '#2d3436'] },
            { id: 'pants',  label: 'Брюки',         presets: ['#2d3436', '#4b3d2a', '#3b2f4a'] },
            { id: 'lights', label: 'Импланты',      presets: ['#ff3b3b', '#3bb8ff', '#3bff7a', '#ffd23b'] },
        ],
        startItems: [{ item: 'energyPistol', ammo: 3 }, { item: 'ups' }],
        cards: {
            alwaysPrepared: { name: 'Всегда готов', cost: 1, effect: 'alwaysPrepared', text: 'Используйте комнату, затем все чужие в комнате атакуют вас. ИЛИ в комнате без чужих, сбросьте ещё 1 карту: возьмите 1 предмет из любой колоды, можно оставить.' },
            computerSkills: { name: 'Компьютерные навыки', cost: 1, effect: 'computerSkills', text: 'В комнате с компьютером без поломки: используйте комнату. ИЛИ откройте/закройте дверь в любом коридоре корабля.' },
            deactivation: { name: 'Деактивация', cost: 1, reaction: true, effect: 'deactivation', text: 'Реакция: после вскрытия карты атаки проигнорируйте её эффект. Если сейчас фаза игроков, можете спасовать — тогда до конца раунда вы больше не получаете атак.' },
            demolition: COMMON_CARDS.demolition,
            fastRepairs: { name: 'Быстрый ремонт', cost: 1, noCombat: true, effect: 'fastRepairs', text: 'Уберите поломку ИЛИ откройте/закройте дверь ИЛИ почините/сломайте двигатель в его комнате.' },
            interruption: COMMON_CARDS.interruption,
            powerUp: { name: 'Подзарядка', cost: 1, effect: 'powerUp', text: 'Поставьте поломку в вашей комнате: +1 жетон ИБП. ИЛИ сбросьте предмет «Энергозаряд»: +2 жетона ИБП.' },
            protocolOverride: { name: 'Обход протокола', cost: 1, removeAfter: true, effect: 'protocolOverride', text: 'Сбросьте 1 жетон ИБП: выбранный персонаж получает тяжёлую травму. ИЛИ в комнате с компьютером (без поломки): сбросьте жетон ИБП, чтобы сменить карту координат (пока время не на синем). Карта уходит из игры.' },
            search: COMMON_CARDS.search,
            selfRepair: { name: 'Самопочинка', cost: 1, effect: 'selfRepair', text: 'Сбросьте скотч, инструменты или кабели: уберите 1 тяжёлую травму и/или восстановите 2 здоровья. ИЛИ уберите поломку в комнате.' },
        },
    },
    convict: {
        name: 'Заключённый', color: '#95a5a6', health: 10, zones: [
            { id: 'skin',   label: 'Кожа',          presets: SKIN },
            { id: 'pants',  label: 'Штаны',         presets: ['#5a5a5a', '#e67e22', '#2d3436', '#4b3d2a'] },
            { id: 'mask',   label: 'Маска',         presets: ['#2d3436', '#8c96a0', '#7a1f1f', '#1c1c1c'] },
            { id: 'tattoo', label: 'Татуировки',    presets: ['#3a4a5a', '#1c1c1c', '#7a1f1f', '#2e6b4a'] },
            { id: 'chains', label: 'Цепи',          presets: ['#8c96a0', '#c9a227', '#3a3f44'] },
            { id: 'lights', label: 'Индикаторы',    presets: ['#ff3b3b', '#3bb8ff', '#3bff7a'] },
        ],
        startItems: [{ item: 'pipe' }, { item: 'cuffs' }],
        cards: {
            bash: { name: 'Удар!', cost: 1, effect: 'bash', text: 'Ближний бой с +1 ранением. Если наручники надеты — сбросьте с них 1 жетон; если сняты — ещё +1 ранение.' },
            catchThis: { name: 'Лови!', cost: 1, effect: 'catchThis', text: 'Сбросьте 1 тяжёлый предмет: переместитесь без атак чужих. Если наручники сняты — без броска шума.' },
            demolition: COMMON_CARDS.demolition,
            duckAndCover: { name: 'Пригнуться', cost: 1, effect: 'duckAndCover', reactionToo: 'duckReaction', text: 'Сбросьте ещё 1 карту: переместитесь, предотвратив 1 атаку чужого. ИЛИ Реакция: когда вас атакует чужой в комнате с другим персонажем — чужой атакует его вместо вас.' },
            interruption: COMMON_CARDS.interruption,
            intimidate: { name: 'Запугивание', cost: 1, effect: 'intimidate', text: 'Выберите другого персонажа в комнате: он снимает 1 жетон с ваших наручников, теряет 2 здоровья или сбрасывает 2 карты.' },
            repairs: COMMON_CARDS.repairs, rest: COMMON_CARDS.rest, search: COMMON_CARDS.search,
            shortTemper: { name: 'Вспыльчивость', cost: 1, effect: 'shortTemper', text: 'Используйте комнату (даже с поломкой) ИЛИ снимите 1 жетон с наручников. Затем бросок шума в комнате (если наручники сняты — может бросить другой персонаж в комнате).' },
        },
    },
    psych: {
        name: 'Психолог', color: '#d4ac0d', health: 10, zones: [
            { id: 'skin',   label: 'Кожа',          presets: SKIN },
            { id: 'hair',   label: 'Волосы',        presets: ['#1c1c1c', '#2a1b12', '#5a3a22', '#8a1f3a'] },
            { id: 'coat',   label: 'Халат',         presets: ['#dfe6ee', '#b9c6cf', '#c9d8c0'] },
            { id: 'shirt',  label: 'Блузка',        presets: ['#2c3e50', '#d4ac0d', '#7a1f1f', '#2d3436'] },
            { id: 'drone',  label: 'Дрон',          presets: ['#3a3f44', '#8c96a0', '#d4ac0d', '#2c3e50'] },
            { id: 'lights', label: 'Подсветка',     presets: ['#3bb8ff', '#ffd23b', '#3bff7a', '#ff3bd1'] },
        ],
        startItems: [{ item: 'handgun', ammo: 3 }, { item: 'oculobe' }],
        cards: {
            computerSkills: { name: 'Компьютерные навыки', cost: 1, effect: 'computerSkills', text: 'В комнате с компьютером без поломки: используйте комнату. ИЛИ откройте/закройте дверь в любом коридоре корабля.' },
            demolition: COMMON_CARDS.demolition,
            dontPanic: { name: 'Без паники', cost: 1, reaction: true, effect: 'dontPanic', text: 'Реакция: когда вас или другого персонажа в вашей комнате атакует чужой — этот персонаж может предотвратить атаку.' },
            emotionScanner: { name: 'Сканер эмоций', cost: 1, effect: 'emotionScanner', text: 'Выберите другого персонажа в вашей или соседней комнате: посмотрите верхнюю карту его колоды и сбросьте её или отдайте ему в руку.' },
            interruption: COMMON_CARDS.interruption,
            lendAHand: { name: 'Помощь', cost: 1, effect: 'lendAHand', text: 'Выберите персонажа в вашей комнате: он берёт 2 карты, остальные в комнате — по 1. Затем все в комнате сбрасывают по 1.' },
            repairs: COMMON_CARDS.repairs, rest: COMMON_CARDS.rest, search: COMMON_CARDS.search,
            wouldYouKindly: { name: 'Будьте любезны', cost: 1, effect: 'wouldYouKindly', text: 'Выберите другого персонажа в вашей комнате: он перемещается (вы выбираете куда) или стреляет. Нельзя заставить уйти из комнаты с чужим.' },
        },
    },
    bounty: {
        name: 'Охотник за головами', color: '#a04000', health: 10, zones: [
            { id: 'skin',   label: 'Кожа',          presets: SKIN },
            { id: 'hair',   label: 'Борода/волосы', presets: ['#5a3a22', '#2a1b12', '#c4c4c4', '#a56b3c'] },
            { id: 'armor',  label: 'Броня',         presets: ['#4b4f55', '#5a6b5c', '#3a3f44', '#6b4f3a'] },
            { id: 'shirt',  label: 'Одежда',        presets: ['#2d3436', '#4b3d2a', '#7a1f1f', '#2c3e50'] },
            { id: 'dog',    label: 'Лайка',         presets: ['#8a5a2a', '#5a3a22', '#c4a070', '#3a3f44'] },
            { id: 'lights', label: 'Прицел',        presets: ['#ff3b3b', '#3bb8ff', '#3bff7a', '#ffd23b'] },
        ],
        startItems: [{ item: 'bountyRifle', ammo: 5 }, { item: 'laika' }],
        cards: {
            demolition: COMMON_CARDS.demolition,
            determination: { name: 'Решимость', cost: 1, effect: 'determination', text: 'В комнате без поломки и огня: возьмите 2 карты, затем сбросьте 1 (можно заражение).' },
            goGirl: { name: 'Вперёд, девочка!', cost: 1, effect: 'goGirl', text: 'Отправьте Лайку в соседнюю комнату или верните её к себе.' },
            interruption: COMMON_CARDS.interruption,
            repairs: COMMON_CARDS.repairs, rest: COMMON_CARDS.rest, search: COMMON_CARDS.search,
            sentinel: { name: 'Страж', cost: 1, reaction: true, effect: 'sentinel', text: 'Реакция: когда вас внезапно атакует чужой, а Лайка на вашем планшете — предотвратите атаку. ИЛИ когда вскрытая карта атаки убила бы вас — уберите Лайку (карту и миниатюру), чтобы проигнорировать атаку.' },
            tacticalMove: { name: 'Тактический манёвр', cost: 1, effect: 'tacticalMove', text: 'Потратьте 1 патрон: переместитесь вместе с 1 чужим в соседнюю комнату без броска шума и без атак.' },
            weakSpot: COMMON_CARDS.weakSpot,
        },
    },
    captain: {
        name: 'Капитан', color: '#1f3a93', health: 10, zones: [
            { id: 'skin',   label: 'Кожа',          presets: SKIN },
            { id: 'hair',   label: 'Волосы/борода', presets: ['#2a1b12', '#5a3a22', '#c4c4c4', '#1c1c1c'] },
            { id: 'armor',  label: 'Броня',         presets: ['#2c3e50', '#1f3a93', '#3a3f44', '#5a6b5c'] },
            { id: 'shirt',  label: 'Одежда',        presets: ['#4b3d2a', '#2d3436', '#7a1f1f', '#dfe6ee'] },
            { id: 'gloves', label: 'Перчатки',      presets: ['#2d3436', '#6b4f3a', '#7f8c8d'] },
            { id: 'lights', label: 'Подсветка',     presets: ['#3bb8ff', '#ff3b3b', '#3bff7a', '#ffd23b'] },
        ],
        startItems: [{ item: 'sixShooter', ammo: 6 }],
        cards: {
            authority: { name: 'Полномочия', cost: 1, effect: 'command', text: 'Выберите другого персонажа в вашей или соседней комнате: он берёт 1 карту и перемещается (вы выбираете куда) или стреляет. Нельзя заставить уйти из комнаты с чужим.' },
            coveringFire: { name: 'Прикрывающий огонь', cost: 1, effect: 'coveringFire', text: 'Сбросьте ещё 1 карту и 2 патрона из дальнобойного оружия: переместитесь (можно с согласным персонажем), атаки чужих при этом не происходят.' },
            demolition: COMMON_CARDS.demolition,
            fanning: { name: 'Веер', cost: 1, effect: 'fanning', text: 'Потратьте любое число патронов из Шестизарядника: за каждый — 1 ранение чужому в вашей комнате.' },
            interruption: COMMON_CARDS.interruption,
            motivation: { name: 'Мотивация', cost: 1, effect: 'motivation', text: 'Все персонажи в вашей и соседних комнатах берут по 1 карте (не более 7 в руке).' },
            reload: { name: 'Перезарядка', cost: 1, effect: 'reload', text: 'Зарядите 1 патрон в Шестизарядник. Можно сбросить ещё 1 карту, чтобы зарядить ещё 1.' },
            repairs: COMMON_CARDS.repairs, rest: COMMON_CARDS.rest, search: COMMON_CARDS.search,
        },
    },
    survivor: {
        name: 'Выжившая', color: '#b9770e', health: 10, zones: [
            { id: 'skin',   label: 'Кожа',          presets: SKIN },
            { id: 'hair',   label: 'Волосы',        presets: ['#c9a86a', '#e8e2d0', '#2a1b12', '#8a1f3a', '#c4c4c4'] },
            { id: 'armor',  label: 'Жилет и бандана', presets: ['#3b3a36', '#2d3436', '#1f2a44', '#4a1f2f', '#5a6b5c'] },
            { id: 'shirt',  label: 'Одежда',        presets: ['#6b5a44', '#7f8c8d', '#2c3e50', '#4a5560'] },
            { id: 'pants',  label: 'Штаны',         presets: ['#3a3530', '#2d3436', '#4b3d2a', '#1e3d2b'] },
            { id: 'lights', label: 'Подсветка',     presets: ['#ff8c3b', '#ff3b3b', '#3bb8ff', '#ffd23b'] },
        ],
        startItems: [{ item: 'handgun', ammo: 3 }],
        cards: {
            alwaysPrepared: { name: 'Всегда готова', cost: 1, effect: 'alwaysPrepared', text: 'Используйте комнату, затем все чужие в комнате атакуют вас. ИЛИ в комнате без чужих: сбросьте 1 карту и возьмите 1 предмет из колоды на выбор (оставить или сбросить).' },
            demolition: COMMON_CARDS.demolition,
            desperateAttack: { name: 'Отчаянная атака', cost: 1, effect: 'desperateAttack', text: 'Ближний бой с +2 ранениями. Если чужой отвечает атакой, можно сбросить 1 предмет, чтобы её предотвратить.' },
            distraction: { name: 'Отвлечение', cost: 1, effect: 'distraction', text: 'Сбросьте 1 предмет и переместитесь. Во время этого перемещения чужие не атакуют.' },
            interruption: COMMON_CARDS.interruption,
            obstinate: { name: 'Упрямство', cost: 1, noCombat: true, effect: 'obstinate', text: 'Возьмите 1 карту и ещё по 1 за каждое серьёзное ранение (не больше 7 карт в руке). Затем можно сбросить 1 предмет, чтобы снять 1 серьёзное ранение.' },
            repairs: COMMON_CARDS.repairs, rest: COMMON_CARDS.rest, search: COMMON_CARDS.search,
            vents: { name: 'Вентиляция', cost: 1, effect: 'vents', text: 'В комнате с входом в тех. коридоры сбросьте ещё 1 карту: выберите другую разведанную комнату с таким входом. Перенесите атаку чужого (как взрослого), затем переместитесь туда.' },
        },
    },
    xeno: {
        name: 'Ксенобиолог', color: '#7d6608', health: 10, zones: [
            { id: 'skin',   label: 'Кожа',          presets: SKIN },
            { id: 'hair',   label: 'Волосы',        presets: ['#cfd3d6', '#2a1b12', '#1c1c1c', '#8a1f3a', '#e8e2d0'] },
            { id: 'coat',   label: 'Плащ',          presets: ['#2c3034', '#1f2a44', '#4a1f2f', '#3a3f44', '#2d3436'] },
            { id: 'shirt',  label: 'Кант и одежда', presets: ['#e8e8e8', '#c9a227', '#7f8c8d', '#3bb8ff'] },
            { id: 'gear',   label: 'Манипулятор',   presets: ['#7a8694', '#8c96a0', '#c9a227', '#2d3436'] },
            { id: 'lights', label: 'Подсветка',     presets: ['#ffb347', '#3bff7a', '#3bb8ff', '#ff3bd1'] },
        ],
        startItems: [{ item: 'xenoGun', ammo: 3 }, { item: 'probeArm' }],
        cards: {
            demolition: COMMON_CARDS.demolition,
            fieldExperience: { name: 'Полевой опыт', cost: 1, effect: 'fieldExperience', reactionToo: 'fieldExpReaction', text: 'Положите 1 образец ткани на свой планшет. Если в комнате есть чужой, выбранный чужой получает 1 ранение. ИЛИ Реакция: после вытягивания жетона чужого из мешка сбросьте 1 образец ткани — верните жетон в мешок и вытяните другой.' },
            interruption: COMMON_CARDS.interruption,
            overmind: { name: 'Сверхразум', cost: 1, effect: 'overmind', text: 'Сбросьте 1 карту и 1 образец ткани: переместите любого чужого с корабля в соседнюю комнату. ИЛИ снимите 1 жетон с Манипулятора-зонда.' },
            pheromones: { name: 'Феромоны', cost: 1, effect: 'pheromones', reactionToo: 'pheromonesReaction', text: 'Сбросьте 1 образец ткани и переместитесь; во время этого перемещения чужие не атакуют. ИЛИ Реакция: когда вас внезапно атакует чужой — сбросьте 1 образец ткани, чтобы предотвратить атаку.' },
            repairs: COMMON_CARDS.repairs, rest: COMMON_CARDS.rest, search: COMMON_CARDS.search,
            vivisection: { name: 'Вивисекция', cost: 1, effect: 'vivisection', text: 'Нанесите чужому в комнате по 1 ранению за каждый ваш образец ткани, затем сбросьте 1 образец. ИЛИ снимите 1 жетон с Манипулятора-зонда.' },
            workspacePlan: { name: 'План работ', cost: 1, effect: 'workspacePlan', text: 'В комнате с зелёным значком предмета (без поломки): получите 1 знание. ИЛИ посмотрите тайл любой неразведанной комнаты (без жетона).' },
        },
    },
};

// ---------------------------------------------------------------------------------------------
// Field data (knowledge rewards) — permanent additions to the Action deck
// ---------------------------------------------------------------------------------------------
export const FIELD_DATA = {
    advanceTactics:      { name: 'Передовая тактика', cost: 1, effect: 'fdAdvance', text: 'Выполните действие «Стрелять», «Ближний бой» или «Перемещение». Затем можете выполнить второе такое действие.' },
    asymptomatic:        { name: 'Бессимптомно', cost: 1, effect: 'fdAsymptomatic', noCombat: true, text: 'Уберите 1 карту заражения из руки без проверки (в сброс заражений).' },
    behavioralInsight:   { name: 'Понимание поведения', cost: 1, effect: 'fdInsight', text: 'Сбросьте 1 карту: отгоните 1 взрослого из вашей комнаты. ИЛИ в Гнезде: используйте комнату (даже в бою), без броска шума.' },
    circleStrafe:        { name: 'Стрейф по кругу', cost: 1, reaction: true, effect: 'fdCircleStrafe', text: 'Реакция: когда вас атакует чужой — предотвратите атаку. Можете выстрелить в этого чужого.' },
    containment:         { name: 'Изоляция', cost: 1, effect: 'fdContainment', reactionToo: 'containmentReaction', text: 'Откройте и/или закройте любое число дверей в коридорах вашей комнаты. ИЛИ Реакция: выполняя действие с требованием «не в бою» в комнате с чужим — проигнорируйте это требование (карта сбрасывается автоматически).' },
    criticalAnalysis:    { name: 'Критический анализ', cost: 1, effect: 'fdAnalysis', text: 'Посмотрите 2 верхние карты колоды событий и верните каждую наверх или вниз. ИЛИ то же с 3 верхними картами колоды атак.' },
    damageExpertise:     { name: 'Опыт ремонта', cost: 1, effect: 'fdDamage', noCombat: true, text: 'Уберите поломку. ИЛИ почините/сломайте двигатель в его комнате. ИЛИ откройте/закройте 1 дверь (уничтоженную можно закрыть).' },
    evasiveManeuvering:  { name: 'Манёвр уклонения', cost: 1, effect: 'fdEvasive', text: 'Сбросьте 1 карту: переместитесь без броска шума; при этом перемещении предотвратите 1 атаку чужого.' },
    hunkerDown:          { name: 'Затаиться', cost: 1, effect: 'fdHunker', noCombat: true, text: 'Сбросьте 1 карту. Уберите шум из всех коридоров вашей комнаты; можете закрыть любое число дверей вокруг. После этого вы обязаны спасовать.' },
    precisionShot:       { name: 'Точный выстрел', cost: 1, effect: 'fdPrecision', text: 'Выстрелите с +1 ранением; бросьте кубик боя дважды и выберите результат.' },
    predictableMovements:{ name: 'Предсказуемые движения', cost: 1, reaction: true, effect: 'fdPredictable', text: 'Реакция: когда чужие входят в вашу комнату или появляются в ней при встрече — они не входят, и каждый получает 1 ранение.' },
    quickHands:          { name: 'Ловкие руки', cost: 1, effect: 'fdQuickHands', text: 'Сбросьте 1 карту: возьмите 1 предмет по значку предметов вашей комнаты — оставьте, сбросьте или сразу используйте.' },
    rapidResponse:       { name: 'Быстрый ответ', cost: 1, effect: 'fdRapid', text: 'Выполните базовое действие стоимостью 1 карту. Затем возьмите 1 карту.' },
    reposition:          { name: 'Перестроение', cost: 1, effect: 'fdReposition', text: 'Сбросьте 1 карту: выберите чужого в соседней комнате (не через закрытую дверь) и поменяйтесь с ним комнатами. Без атак и броска шума.' },
    resourceful:         { name: 'Находчивость', cost: 1, effect: 'fdResourceful', text: 'Возьмите 2 карты. Затем сбросьте 1 карту или 1 карту заражения.' },
    restoration:         { name: 'Восстановление', cost: 1, effect: 'fdRestoration', noCombat: true, text: 'Восстановите 2 здоровья себе или другому персонажу в комнате. ИЛИ сбросьте 1 карту: персонаж в комнате (или вы) сбрасывает тяжёлую травму.' },
    riskPrevention:      { name: 'Предотвращение риска', cost: 1, reaction: true, effect: 'fdRisk', text: 'Реакция: если в фазе событий вам нужно бросать шум или разыгрывать встречу — не делайте этого.' },
    safetyInNumbers:     { name: 'Безопасность в числе', cost: 1, effect: 'fdSafety', text: 'Если в комнате есть другой персонаж: все персонажи в комнате (включая вас) берут 1 карту (не более 7 в руке). Затем все, кто может стрелять, стреляют в порядке хода.' },
};

// ---------------------------------------------------------------------------------------------
// Computer actions (face-up card). Each resolved Computer Action gives +1 Knowledge.
// ---------------------------------------------------------------------------------------------
export const COMPUTER_CARDS = {
    lockdown: { name: 'Блокировка', text: 'Если открыта после действия «Компьютер»: персонаж кладёт поломку в свою комнату, колода компьютера перемешивается и открывается новая карта. Если открыта при подготовке или после перемешивания — кладётся под низ колоды.' },
    actionA: { name: 'Действие A', text: 'Выберите одно из трёх.', options: {
        draw:   'Любой 1 персонаж берёт 1 карту.',
        scan:   'Посмотрите любую 1 неразведанную комнату и её жетон исследования.',
        noise:  'Выберите комнату без персонажей и сделайте в ней бросок шума.' } },
    actionB: { name: 'Действие B', text: 'Выберите одно из трёх.', options: {
        know:   'Сбросьте 1 карту: получите 1 знание.',
        heal:   'Восстановите 1 здоровье.',
        fixComp:'Уберите поломку из комнаты с компьютером.' } },
    actionC: { name: 'Действие C', text: 'Выберите одно из трёх.', options: {
        purge:  'Выберите комнату: уберите оттуда огонь (если есть) и отгоните всех чужих.',
        ammo:   'Зарядите 1 патрон в ваше дальнобойное оружие.',
        door:   'Откройте или закройте дверь в любом 1 коридоре.' } },
    actionD: { name: 'Действие D', text: 'Выберите одно из трёх.', options: {
        know:   'Сбросьте 1 карту: получите 1 знание.',
        hit2:   'Нанесите 2 ранения любому 1 чужому на корабле.',
        item:   'Сбросьте 1 карту: возьмите 1 предмет из зелёной, красной или жёлтой колоды — оставьте или сбросьте его.' } },
    actionE: { name: 'Действие E', text: 'Выберите одно из трёх.', options: {
        quiet:  'Выберите коридор не рядом с вами и уберите из него шум.',
        malf:   'Положите поломку в комнату с компьютером.',
        event:  'Посмотрите верхнюю карту событий и положите её сверху или под низ колоды.' } },
};

// ---------------------------------------------------------------------------------------------
// Intruder Adaptations (Nemesis Redux). 3 random ones are active from the start; analyzing a
// Human Corpse / Intruder Carcass / Intruder Egg in the Laboratory removes one (once per type).
// ---------------------------------------------------------------------------------------------
export const ADAPTATIONS = {
    agile:            { name: 'Проворство',        text: 'Естественный результат «2» или знак чужого на кубике боя считается «6».' },
    fearless:         { name: 'Бесстрашие',        text: 'Чужих нельзя отогнать.' },
    hardenedCarapace: { name: 'Прочный панцирь',   text: 'Естественный результат 2–6 на кубике боя увеличивается на 1.' },
    hyperAggression:  { name: 'Гиперагрессия',     text: 'Когда чужой входит в комнату с персонажем, он немедленно атакует персонажа с наименьшим числом карт в руке (при равенстве — по порядку хода).' },
    ravenous:         { name: 'Ненасытность',      text: 'Когда персонаж получает тяжёлую травму или теряет здоровье от атаки взрослого или дрона на шаге атак фазы чужих, этот чужой атакует второй раз.' },
    razorAppendages:  { name: 'Бритвенные конечности', text: 'Атаки, которые отнимают здоровье (а не дают тяжёлую травму), отнимают на 1 здоровье больше.' },
    swiftStrikes:     { name: 'Стремительные удары', text: 'Значения внезапной атаки увеличены на 1 (кроме личинок).' },
    venomous:         { name: 'Ядовитость',        text: 'Любая атака (кроме «Промаха») даёт заражение, если ещё не даёт его.' },
};

// ---------------------------------------------------------------------------------------------
// Feats (Nemesis Redux). After choosing an Objective the player picks 1 Feat, resolves it and
// removes it from the game. One pool for the whole crew.
// ---------------------------------------------------------------------------------------------
export const FEATS = {
    appropriation: { name: 'Реквизиция', text: 'Возьмите по 1 предмету из зелёной, красной и жёлтой колод. Оставьте 2, остальные сбросьте.' },
    breach:        { name: 'Взлом', text: 'Выполните до 3 компьютерных действий (даже без компьютера). Карты «Блокировка» не вызывают поломку.' },
    conviction:    { name: 'Решимость', text: 'Убейте 1 выбранного чужого в вашей комнате.' },
    damageControl: { name: 'Устранение неполадок', text: 'Уберите до 4 жетонов поломки/пожара где угодно. Можно проверить 1 двигатель; если в его комнате есть персонаж — можно изменить его состояние.' },
    immunization:  { name: 'Иммунизация', text: 'Уберите все карты заражения из вашей колоды, сброса и руки. Перемешайте колоду.' },
    overpower:     { name: 'Превосходство', text: 'Отгоните каждого чужого из вашей комнаты (можно в разные комнаты). Защиту от отгона игнорируйте.' },
    perseverance:  { name: 'Упорство', text: 'Возьмите 3 карты. За каждую взятую карту заражения — сбросьте её и возьмите ещё 1.' },
    requisition:   { name: 'Снабжение', text: 'Возьмите 3 карты снаряжения, оставьте 1, остальные — под низ колоды.' },
    respite:       { name: 'Передышка', text: 'Сбросьте 1 серьёзную травму и/или восстановите 3 здоровья (Андроид игнорирует «Синтетика»).' },
    revelation:    { name: 'Откровение', text: 'Получите до 2 знаний.' },
    rush:          { name: 'Рывок', text: 'Переместитесь 1 или 2 раза только в разведанные комнаты: без броска шума и без атак.' },
    traverse:      { name: 'Переход', text: 'Только в комнате с тех. коридором: переместитесь в другую комнату с тех. коридором без атак и шума.' },
};

// ---------------------------------------------------------------------------------------------
// Objectives. check(ctx) is evaluated by the engine at game end; ctx = { player, state, helpers }
// ---------------------------------------------------------------------------------------------
export const OBJECTIVES = {
    personal: {
        bff:            { name: 'Лучшие друзья навеки', text: 'Закончите игру в спасательной капсуле, и при этом ещё 1 персонаж на борту выживет. ИЛИ Закончите игру в гибернации вместе хотя бы с 1 другим выжившим персонажем в гибернации.', check: 'bff' },
        disclosure:     { name: 'Разоблачение', text: 'Активируйте жетон знания И закончите игру с тушей чужого в руках.', check: 'disclosure', minPlayers: 2 },
        disposing:      { name: 'Уничтожение улик', text: 'Отправьте сигнал И корабль должен быть уничтожен.', check: 'disposing', minPlayers: 2 },
        postMortem:     { name: 'Срочное вскрытие', text: 'Активируйте жетон знания И проанализируйте человеческий труп (синий).', check: 'postMortem', minPlayers: 2 },
        heroicEscape:   { name: 'Героическое спасение', text: 'Будьте последним персонажем, завершившим игру (капсула или гибернация), и при этом хотя бы 1 другой персонаж выживет. ИЛИ Закончите игру в капсуле, и 1 персонаж на борту выживет.', check: 'heroicEscape' },
        highestBidder:  { name: 'Самая высокая ставка', text: 'Корабль должен долететь до Венеры (в гибернации вы не погибнете от пункта назначения). ИЛИ Закончите игру в капсуле хотя бы с 1 предметом из колоды снабжения.', check: 'highestBidder', hiberSafe: 'venus' },
        hoarder:        { name: 'Барахольщик', text: 'Закончите игру в капсуле не менее чем с 5 предметами, среди которых есть хотя бы по 1 зелёному, красному и жёлтому (стартовые предметы не считаются).', check: 'hoarder', minPlayers: 2 },
        insuranceFraud: { name: 'Страховое мошенничество', text: 'Закончите игру в капсуле, а корабль улетит в открытый космос. ИЛИ Отправьте сигнал И корабль должен быть уничтожен.', check: 'insuranceFraud' },
        oldestFriend:   { name: 'Старый друг', text: 'Отправьте сигнал, и корабль должен долететь до Земли. ИЛИ Вы — единственный выживший.', check: 'oldestFriend' },
        pristine:       { name: 'В первозданном виде', text: 'Корабль долетает до Земли не более чем с 1 жетоном огня. ИЛИ Корабль долетает до Земли со всеми 3 исправными двигателями.', check: 'pristine' },
        pursuit:        { name: 'Во имя науки', text: 'Активируйте жетон знания И имейте наибольшее знание среди всех персонажей.', check: 'pursuit', minPlayers: 2 },
        quarantine:     { name: 'Карантин', text: 'Корабль должен долететь до Марса (в гибернации вы не погибнете от пункта назначения). ИЛИ Корабль долетает до Земли, а Гнездо уничтожено.', check: 'quarantine', hiberSafe: 'mars' },
        trophyHunter:   { name: 'Охотник за трофеями', text: 'Королева должна быть убита. ИЛИ Закончите игру с трупом персонажа (красным) в руках.', check: 'trophyHunter' },
        veniVidiVici:   { name: 'Пришёл, увидел, победил', text: 'Отправьте сигнал, и Гнездо должно быть уничтожено.', check: 'veniVidiVici', minPlayers: 2 },
    },
    corporate: {
        abOvo:          { name: 'Ab Ovo', text: 'Проанализируйте яйцо чужого в Лаборатории.', check: 'abOvo', minPlayers: 2 },
        alienCoverUp:   { name: 'Сокрытие чужих', text: 'Отправьте сигнал. Ни один другой персонаж с 7+ знаниями не должен выжить.', check: 'alienCoverUp', minPlayers: 5 },
        bugHunt:        { name: 'Охота на жуков', text: 'К концу игры все 4 туши чужих должны быть выложены на корабле, в руках персонажей или сброшены (убейте не менее 4 взрослых/дронов).', check: 'bugHunt', minPlayers: 4 },
        contract:       { name: 'Корпоративный контракт', text: 'Игрок 5 ({seat}) не должен выжить. Если вы и есть Игрок 5 — вы должны быть единственным выжившим.', check: 'seat', seat: 5, minPlayers: 5 },
        extremeBiology: { name: 'Экстремальная полевая биология', text: 'Не менее 2 адаптаций чужих должны быть удалены.', check: 'extremeBiology', minPlayers: 2 },
        fortune:        { name: 'Удача любит смелых', text: 'Корабль должен долететь до Венеры (в гибернации вы не погибнете от пункта назначения). ИЛИ Отправьте сигнал И корабль должен быть уничтожен.', check: 'fortune', hiberSafe: 'venus' },
        greener:        { name: 'Новые горизонты', text: 'Игрок 2 ({seat}) не должен выжить. Если вы и есть Игрок 2 — вы должны быть единственным выжившим.', check: 'seat', seat: 2, minPlayers: 2 },
        harsh:          { name: 'Жёсткое увольнение', text: 'Игрок 3 ({seat}) не должен выжить. Если вы и есть Игрок 3 — вы должны быть единственным выжившим.', check: 'seat', seat: 3, minPlayers: 3 },
        hostile:        { name: 'Враждебное поглощение', text: 'Игрок 4 ({seat}) не должен выжить. Если вы и есть Игрок 4 — вы должны быть единственным выжившим.', check: 'seat', seat: 4, minPlayers: 4 },
        necroscopy:     { name: 'Некроскопия', text: 'Отправьте сигнал И проанализируйте тушу чужого.', check: 'necroscopy', minPlayers: 2 },
        priceless:      { name: 'Бесценные знания', text: 'Активируйте жетон знания, И корабль не должен быть уничтожен.', check: 'priceless', minPlayers: 2 },
        priorityOne:    { name: 'Приоритет номер один', text: 'Корабль летит на Землю, Королева не убита и Гнездо не уничтожено. ИЛИ Вы — единственный выживший.', check: 'priorityOne' },
        perfectSpecimen:{ name: 'Идеальный образец', text: 'Закончите игру в капсуле с яйцом чужого в руках. ИЛИ Закончите игру с активированным жетоном знания и яйцом чужого в руках.', check: 'perfectSpecimen' },
        rightMoment:    { name: 'Удачный момент для удара', text: 'Игрок 1 ({seat}) не должен выжить. Если вы и есть Игрок 1 — вы должны быть единственным выжившим.', check: 'seat', seat: 1 },
    },
};
/** Objective text with the seat placeholder filled in ({seat} → the name of that player). */
export function objectiveTextOf(def, players) {
    if (!def.seat) return def.text;
    const t = players.find(p => p.number === def.seat) || players[def.seat - 1];
    return def.text.replace('{seat}', t ? t.name : '—');
}


// Eight printed Destination permutations (Coordinates sheet, 4 × 2 faces).
export const COORDINATE_CARDS = [
    { id: 'coordA', A: 'earth', B: 'mars', C: 'venus', D: 'space' },
    { id: 'coordB', A: 'earth', B: 'space', C: 'mars', D: 'venus' },
    { id: 'coordC', A: 'space', B: 'earth', C: 'venus', D: 'mars' },
    { id: 'coordD', A: 'venus', B: 'earth', C: 'space', D: 'mars' },
    { id: 'coordE', A: 'mars', B: 'venus', C: 'earth', D: 'space' },
    { id: 'coordF', A: 'space', B: 'mars', C: 'earth', D: 'venus' },
    { id: 'coordG', A: 'mars', B: 'venus', C: 'space', D: 'earth' },
    { id: 'coordH', A: 'venus', B: 'space', C: 'mars', D: 'earth' },
];
export const DESTINATION_NAMES = { earth: 'Земля', mars: 'Марс', venus: 'Венера', space: 'Открытый космос' };

// Queen health deck (12)
// Queen Health deck — exactly as printed (QueenDeck.png): "Discard N additional cards" + effect.
// `byChar` effects apply only when the card was drawn by a character's attack.
// Printed multiplicities (Атака.txt): both "discard 2 additional cards" cards ×3, the "discard 1
// additional cards / Repel the Queen" card ×2, every other card ×1 → 14 cards in the deck.
const QUEEN_FACES = [
    { id: 'q0pool', extra: 0, byChar: true, text: 'Если карту вытянул персонаж: Королева возвращается в запас.', effect: 'pool' },
    { id: 'q0draw', extra: 0, byChar: true, text: 'Если карту вытянул персонаж: каждый персонаж в комнате с Королевой берёт 2 карты действий.', effect: 'draw2' },
    { id: 'q0repel', extra: 0, byChar: true, text: 'Если карту вытянул персонаж: отгоните Королеву.', effect: 'repel' },
    { id: 'q1repel', extra: 1, byChar: true, text: 'Если карту вытянул персонаж: отгоните Королеву.', effect: 'repel', copies: 2 },
    { id: 'q1noise', extra: 1, byChar: true, text: 'Если карту вытянул персонаж: каждый персонаж в комнате с Королевой делает бросок шума.', effect: 'noise' },
    { id: 'q2malf', extra: 2, byChar: true, text: 'Если карту вытянул персонаж: положите жетон неисправности в комнату Королевы.', effect: 'malf', copies: 3 },
    { id: 'q2act', extra: 2, byChar: false, text: 'Активируйте Королеву. Если она уже в комнате с персонажем — она атакует (в первую очередь того, кто её активировал).', effect: 'activate', copies: 3 },
    { id: 'q3bag', extra: 3, byChar: true, text: 'Если карту вытянул персонаж: добавьте в мешок до 3 жетонов Королевы.', effect: 'bag' },
    { id: 'q3act', extra: 3, byChar: false, text: 'Активируйте Королеву. Если она уже в комнате с персонажем — она атакует (в первую очередь того, кто её активировал).', effect: 'activate' },
];
export const QUEEN_CARDS = QUEEN_FACES.flatMap(c => Array.from({ length: c.copies || 1 }, () => ({
    ...c, name: 'Сбросьте ещё ' + c.extra + (c.extra === 1 ? ' карту' : ' карт(ы)'),
})));


export const INTRUDER_NAMES = { larva: 'Личинка', adult: 'Взрослый', drone: 'Дрон', queen: 'Королева', blank: 'Пусто' };
export const INTRUDER_SUPPLY = { larva: 8, adult: 12, drone: 12, queen: 1 };
/** Intruder token pools (Queen Health card «add up to 3 Queen tokens» implies 3 Queen tokens). */
export const INTRUDER_TOKENS = { blank: 1, larva: 8, adult: 12, drone: 12, queen: 3 };
