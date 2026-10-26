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
      text: 'Все чужие движутся по коридору 1. Шум в тех. коридорах (если его там нет). Каждый персонаж в комнате с входом в тех. коридоры ставит шум в каждый соседний коридор без шума.' },
    { id: 'bulkheadsOpen', name: 'Переборки открыты', move: { type: 'closest' }, noise: 'noCards',
      text: 'Откройте все двери (кроме уничтоженных). Все чужие движутся к ближайшему персонажу. Персонажи без карт в руке делают бросок шума.' },
    { id: 'damage', name: 'Повреждение', move: { type: 'none' }, noise: 'fireMalf',
      text: 'Чужие не движутся. Поломка в каждой комнате с чужим. Персонажи в комнате с поломкой или огнём делают бросок шума.' },
    { id: 'damagingFire', name: 'Разрушительный огонь', move: { type: 'corridor', num: 2 }, noise: 'noCards',
      text: 'Чужие движутся по коридору 2. Поломка в каждой комнате с огнём; огонь в каждой комнате, соседней с горящей (не через закрытые двери и тех. коридоры). Персонажи без карт делают бросок шума.' },
    { id: 'eggProtection', name: 'Защита яиц', move: { type: 'closest' }, noise: 'all',
      text: 'Все чужие движутся к ближайшему персонажу. Дрон появляется в Гнезде и в каждой комнате с персонажем, несущим яйцо; они сразу атакуют.' },
    { id: 'podEjection', name: 'Отстрел капсулы', move: { type: 'corridor', num: 3 }, noise: 'all',
      text: 'Все чужие движутся по коридору 3. Уберите капсулу №1 из игры; если её уже нет — поломка в обоих эвакуационных отсеках.' },
    { id: 'fireWave', name: 'Волна огня', move: { type: 'closest' }, noise: 'all',
      text: 'Все чужие движутся к ближайшему персонажу. Найдите горящую комнату с наименьшим номером и подожгите все соседние (не через закрытые двери и тех. коридоры).' },
    { id: 'flammable', name: 'Горючие смеси', move: { type: 'corridor', num: 4 }, noise: 'all',
      text: 'Все чужие движутся по коридору 4. Огонь в Гибернатории; если он уже горит — огонь во всех соседних с ним комнатах.' },
    { id: 'generatorOverheats', name: 'Перегрев генератора', move: { type: 'none' }, noise: 'none', reshuffle: true,
      text: 'Чужие не движутся. Если в Генераторе поломка — запускается самоуничтожение, иначе поломка в Генераторе. Перемешайте колоду событий.' },
    { id: 'hatching', name: 'Вылупление', move: { type: 'corridor', num: 1 }, noise: 'all',
      text: 'Все чужие движутся по коридору 1. Уничтожьте 1 яйцо в Гнезде. Персонаж в Гнезде или рядом без карт в руке получает личинку; иначе жетон личинки в мешок.' },
    { id: 'leavingShell', name: 'Выход из оболочки', move: { type: 'none' }, noise: 'none', reshuffle: true,
      text: 'Чужие не движутся. Персонаж с личинкой: заражение, сброс руки, перемешать колоду, процедура вылупления. Остальные: взять 4 карты, процедура инфекции, сбросить руку. Перемешайте колоду событий.' },
    { id: 'lifeSupport', name: 'Отказ жизнеобеспечения', move: { type: 'corridor', num: 2 }, noise: 'all',
      text: 'Все чужие движутся по коридору 2. Поломка в каждой комнате с тремя зелёными значками предметов.' },
    { id: 'lurking', name: 'В засаде', move: { type: 'closest' }, noise: 'all',
      text: 'Все чужие движутся к ближайшему персонажу. Чужие не в комнате с персонажем убираются с поля, их жетоны возвращаются в мешок.' },
    { id: 'malfunction', name: 'Поломка', move: { type: 'corridor', num: 3 }, noise: 'all',
      text: 'Все чужие движутся по коридору 3. Поломка в комнате с наименьшим номером без поломки.' },
    { id: 'onTheHunt', name: 'На охоте', move: { type: 'closest' }, noise: 'noCards',
      text: 'Все чужие дважды движутся к ближайшему персонажу. Персонажи без карт делают бросок шума.' },
    { id: 'protectAndServe', name: 'Защищать и служить', move: { type: 'closest' }, noise: 'all',
      text: 'Все чужие движутся к ближайшему персонажу. Дрон появляется в комнате Королевы (без атаки); если Королевы нет на поле — 2 жетона дронов в мешок.' },
    { id: 'scentOfPrey', name: 'Запах добычи', move: { type: 'closest' }, noise: 'all',
      text: 'Все чужие движутся к ближайшему персонажу. Персонаж с тяжёлой травмой ставит шум в каждый соседний коридор без шума.' },
    { id: 'shortCircuit', name: 'Короткое замыкание', move: { type: 'corridor', num: 4 }, noise: 'fireMalf',
      text: 'Все чужие движутся по коридору 4. Поломка в каждой комнате с тремя жёлтыми значками. Персонажи в комнате с поломкой или огнём делают бросок шума.' },
    { id: 'systemFailure', name: 'Отказ систем', move: { type: 'closest' }, noise: 'noCards',
      text: 'Все чужие движутся к ближайшему персонажу. Поломка в каждой комнате с тремя красными значками. Персонажи без карт делают бросок шума.' },
    { id: 'queenAwakens', name: 'Пробуждение Королевы', move: { type: 'closest' }, noise: 'all',
      text: 'Все чужие движутся к ближайшему персонажу. Королева жива — до 3 жетонов Королевы в мешок; мертва — 2 жетона дронов.' },
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
    medkit:      { deck: 'green', count: 5, name: 'Аптечка', oneUse: true, kind: 'heavy', use: 'medkit', text: 'Сбросьте 1 тяжёлую травму и/или восстановите 3 здоровья.' },
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
    // --- support (heavy) ---
    plasmaRifle: { deck: 'support', count: 2, name: 'Плазменная винтовка', kind: 'heavy', weapon: { max: 4, bonusHit: 1 }, use: null,
                   text: 'Дальнобойное оружие, 4 патрона. Каждый выстрел наносит 1 дополнительное ранение.' },
    flamethrower:{ deck: 'support', count: 2, name: 'Огнемёт', kind: 'heavy', weapon: { max: 3, fire: true }, use: null,
                   text: 'Дальнобойное оружие, 3 патрона. После выстрела в комнате начинается пожар.' },
    heavyArmor:  { deck: 'support', count: 2, name: 'Тяжёлая броня', kind: 'armor', use: null, heavyArmor: true,
                   text: 'Броня. Пока она на вас, каждая атака чужого наносит на 1 ранение меньше (минимум 0).' },
    shotgun:     { deck: 'support', count: 2, name: 'Дробовик', kind: 'heavy', weapon: { max: 3, spread: true }, use: null,
                   text: 'Дальнобойное оружие, 3 патрона. После выстрела все остальные чужие в комнате получают по 1 ранению без броска.' },
    exoLegs:     { deck: 'support', count: 2, name: 'Экзо-ноги', kind: 'heavy', use: 'exoMove',
                   text: 'Перемещение на 2 комнаты за одно действие (шум бросается только в конечной).' },
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
};

export const DECK_ORDER = ['green', 'red', 'yellow'];
export const DECK_NAMES = { green: 'Зелёные (медицина)', red: 'Красные (военные)', yellow: 'Жёлтые (техника)', support: 'Поддержка' };

// ---------------------------------------------------------------------------------------------
// Characters & action decks. Zones are paint regions on the 3D model (first preset is default).
// ---------------------------------------------------------------------------------------------
const SKIN = ['#e8b89a', '#d29b7c', '#b5805f', '#8d5a3c', '#5e3b26', '#f2d2bd'];
const HAIR = ['#2a1b12', '#5a3a22', '#a56b3c', '#d9b36c', '#c4c4c4', '#8a1f1f', '#1c1c1c', '#e8e2d0'];

const COMMON_CARDS = {
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
            duckAndCover: { name: 'Пригнуться', cost: 1, effect: 'duckAndCover', text: 'Сбросьте ещё 1 карту: переместитесь, предотвратив 1 атаку чужого. (Реакция-часть не автоматизирована.)' },
            fastRepairs: { name: 'Быстрый ремонт', cost: 1, noCombat: true, effect: 'fastRepairs', text: 'Уберите поломку ИЛИ откройте/закройте дверь ИЛИ почините/сломайте двигатель в его комнате.' },
            fightFire: { name: 'Клин клином', cost: 1, noCombat: true, effect: 'fightFire', text: 'Уберите огонь ИЛИ сбросьте 1 предмет, чтобы поставить огонь.' },
            ingenuity: { name: 'Смекалка', cost: 1, noCombat: true, effect: 'ingenuity', text: 'Уберите поломку ИЛИ почините/сломайте двигатель ИЛИ (ещё 2 карты и набор механика) возьмите 3 карты поддержки, оставьте 1.' },
            interruption: COMMON_CARDS.interruption,
            rest: COMMON_CARDS.rest, search: COMMON_CARDS.search,
            technicalCorridors: { name: 'Технические коридоры', cost: 1, noCombat: true, effect: 'techCorridors', text: 'В комнате с входом в тех. коридоры, сбросьте ещё 1 карту: переместитесь в любую другую комнату с таким входом и спасуйте.' },
        },
    },
};

// ---------------------------------------------------------------------------------------------
// Field data (knowledge rewards) — permanent additions to the Action deck
// ---------------------------------------------------------------------------------------------
export const FIELD_DATA = {
    fdAim:    { name: 'Данные: баллистика', cost: 1, effect: 'fdAim', text: 'Выстрелите с +2 к результату броска.' },
    fdSprint: { name: 'Данные: маршруты', cost: 1, effect: 'fdSprint', text: 'Переместитесь без броска шума.' },
    fdPatch:  { name: 'Данные: первая помощь', cost: 1, effect: 'fdPatch', text: 'Восстановите 2 здоровья.' },
    fdScan:   { name: 'Данные: сканер', cost: 1, effect: 'fdScan', text: 'Проверьте заражения в руке; заражённые сбросьте (личинка не появляется), незаражённые уходят из игры.' },
    fdHush:   { name: 'Данные: маскировка', cost: 1, effect: 'fdHush', text: 'Уберите все жетоны шума из коридоров вокруг вашей комнаты.' },
    fdTrap:   { name: 'Данные: слабые места', cost: 1, effect: 'fdTrap', text: 'Нанесите 1 ранение чужому в вашей комнате без броска (без ответной атаки).' },
};

// ---------------------------------------------------------------------------------------------
// Computer actions (face-up card). Each resolved Computer Action gives +1 Knowledge.
// ---------------------------------------------------------------------------------------------
export const COMPUTER_CARDS = {
    lockdown:    { name: 'Блокировка', text: 'Поломка в вашей комнате. Колода компьютера перемешивается, открывается новая карта.' },
    openDoors:   { name: 'Открыть переборки', text: 'Откройте все закрытые двери на корабле.' },
    closeDoor:   { name: 'Закрыть переборку', text: 'Закройте 1 дверь в любом коридоре.' },
    engineDiag:  { name: 'Диагностика двигателя', text: 'Тайно проверьте состояние любого двигателя.' },
    coordinates: { name: 'Навигация', text: 'Тайно посмотрите карту координат.' },
    scanner:     { name: 'Сканер палуб', text: 'Посмотрите тайл любой неразведанной комнаты (без жетона).' },
    cargo:       { name: 'Инвентаризация', text: 'Возьмите 1 жёлтый предмет.' },
    motionTracker:{ name: 'Датчик движения', text: 'Уберите шум из всех коридоров вокруг любой одной комнаты.' },
};

// ---------------------------------------------------------------------------------------------
// Objectives. check(ctx) is evaluated by the engine at game end; ctx = { player, state, helpers }
// ---------------------------------------------------------------------------------------------
export const OBJECTIVES = {
    personal: {
        pSignal:   { name: 'Сигнал бедствия', text: 'Отправьте сигнал (Пункт связи) и выживите.', check: 'signal' },
        pNest:     { name: 'Стерилизация', text: 'Гнездо должно быть уничтожено (все яйца), и вы выживаете.', check: 'nestDestroyed' },
        pEarth:    { name: 'Домой', text: 'Корабль должен долететь до Земли, и вы выживаете (на борту или в капсуле).', check: 'earth' },
        pQueen:    { name: 'Охота', text: 'Королева должна быть убита, и вы выживаете.', check: 'queenDead' },
        pKnow:     { name: 'Исследователь', text: 'Иметь не менее 5 знаний к концу игры и выжить.', check: 'knowledge5' },
        pPod:      { name: 'Спасение любой ценой', text: 'Покиньте корабль в спасательной капсуле.', check: 'escaped' },
    },
    corporate: {
        cMars:     { name: 'Красная планета', text: 'Корабль должен долететь до Марса, и вы выживаете.', check: 'mars' },
        cEgg:      { name: 'Образец', text: 'Проанализируйте яйцо в Лаборатории и выживите.', check: 'eggAnalyzed' },
        cCarcass:  { name: 'Трофей', text: 'Закончите игру с тушей чужого в руках и выживите.', check: 'carcassCarried' },
        cSignalKnow:{ name: 'Отчёт', text: 'Отправьте сигнал и имейте не менее 4 знаний.', check: 'signalKnowledge4' },
        cNoEarth:  { name: 'Карантин', text: 'Корабль не должен долететь до Земли (или должен быть уничтожен), а вы выживаете.', check: 'notEarth' },
        cRival:    { name: 'Зачистка', text: 'Персонаж «{target}» не должен выжить. Вы выживаете.', check: 'rivalDead' },
    },
};

export const COORDINATE_CARDS = [
    { id: 'coordA', A: 'earth', B: 'mars', C: 'venus', D: 'space' },
    { id: 'coordB', A: 'mars', B: 'earth', C: 'space', D: 'venus' },
    { id: 'coordC', A: 'venus', B: 'space', C: 'earth', D: 'mars' },
    { id: 'coordD', A: 'space', B: 'venus', C: 'mars', D: 'earth' },
];
export const DESTINATION_NAMES = { earth: 'Земля', mars: 'Марс', venus: 'Венера', space: 'Открытый космос' };

// Queen health deck (12)
export const QUEEN_CARDS = [
    ...Array(3).fill({ id: 'qDiscard2', name: 'Глубокая рана', text: 'Сбросьте ещё 2 карты здоровья Королевы.', extra: 2 }),
    ...Array(2).fill({ id: 'qDiscard1', name: 'Рана', text: 'Сбросьте ещё 1 карту здоровья Королевы.', extra: 1 }),
    ...Array(2).fill({ id: 'qRepel', name: 'Отступление', text: 'Королева отгоняется в соседнюю комнату.', repel: true }),
    ...Array(5).fill({ id: 'qRage', name: 'Ярость Королевы', text: 'Королева немедленно атакует персонажа в её комнате.', rage: true }),
];

export const INTRUDER_NAMES = { larva: 'Личинка', adult: 'Взрослый', drone: 'Дрон', queen: 'Королева', blank: 'Пусто' };
export const INTRUDER_SUPPLY = { larva: 8, adult: 12, drone: 12, queen: 1 };
