// ============================================================================
//  Witcher: Old World — rule tables that are not cards.
//  Every table carries the source it was read from; tools/audit.test.mjs re-reads
//  those sources and fails if a number here drifts from the Markdown.
// ============================================================================

/** Schools: hero name (Начальные колоды.md), home location (Игровой стол.md), colour of the board art. */
export const SCHOOLS = {
    wolf: { name: 'Волк', school: 'Школа Волка', hero: 'Эрим', home: 3, color: '#8a6a4a', spec: 'Владение мечом', model: 'Witcher/Ведьмаки/Волк.obj', base: true },
    cat: { name: 'Кот', school: 'Школа Кота', hero: 'Кайлар', home: 17, color: '#4b4f8f', spec: 'Прыть', model: 'Witcher/Ведьмаки/Кошка.obj', base: true },
    bear: { name: 'Медведь', school: 'Школа Медведя', hero: 'Ауфар', home: 10, color: '#a8382f', spec: 'Доспехи', model: 'Witcher/Ведьмаки/Медведь.obj', base: true },
    viper: { name: 'Змея', school: 'Школа Змеи', hero: 'Джаспер', home: 15, color: '#3f7f4a', spec: 'Отравленный клинок', model: 'Witcher/Ведьмаки/Змея.obj', base: true },
    griffin: { name: 'Грифон', school: 'Школа Грифона', hero: 'Годрик', home: 1, color: '#c9a640', spec: 'Магия', model: 'Witcher/Ведьмаки/Грифон.obj', base: true },
    // «Цири и доп. события», p. 4: home school is Каэр Морхен (3), shared with the Wolf.
    ciri: { name: 'Цири', school: 'Дитя Старшей Крови', hero: 'Цири', home: 3, color: '#d9dde6', spec: 'Старшая Кровь', model: 'Witcher/Ведьмаки/Цири.obj', exp: 'ciri' },
};
export const SCHOOL_ORDER = ['wolf', 'cat', 'bear', 'viper', 'griffin'];

/** Specialization tables, levels I..V (Ведьмаки/Планшеты.md). */
export const SPEC_TABLE = {
    wolf: [[1, 0], [1, 1], [1, 2], [2, 2], [2, 2]],      // damage, draw — after a combo of 3+ cards
    viper: [[3, 0], [2, 1], [4, 1], [4, 2], [4, 2]],     // look, send to discard
    cat: [[1, 1], [3, 1], [3, 2], [3, 3], [3, 3]],       // look, take — first fight turn
    bear: [[0, 1], [1, 1], [1, 2], [2, 2], [2, 2]],      // shield+, draw — automatic at shield 0
    griffin: [['top', 2], ['top', 1], ['top', 0], ['any', 0], ['any', 0]], // take from discard, then discard
    ciri: [[0, -1], [0, 1], [1, 1], [2, 1], [2, 1]],     // «Старшая Кровь» link: damage, draw at the end of the fight turn
};

/** Skill value -> effect (Планшеты.md «Общие значения навыков»): combat draw, defence max shield, alchemy elixirs per fight. */
export const SKILL_VALUE = [0, 1, 2, 3, 4, 4];
/** Witcher level reached -> cards drawn at once (Планшеты.md). */
export const LEVEL_DRAW = { 2: 1, 3: 1, 4: 2, 5: 2 };
export const SKILLS = ['combat', 'defense', 'alchemy', 'spec'];
export const SKILL_NAME = { combat: 'Сражение', defense: 'Защита', alchemy: 'Алхимия', spec: 'Специализация' };

/** Starting cards and gold by turn order (База.md p. 8). */
export const START_RES = {
    1: [[5, 3]],
    2: [[3, 2], [5, 4]],
    3: [[3, 2], [4, 4], [5, 6]],
    4: [[2, 4], [3, 5], [4, 6], [5, 7]],
    5: [[2, 5], [3, 5], [4, 5], [4, 7], [5, 7]],
};

/** Row cost modifiers, slot 1 (left) .. 6 (right) (Игровой стол.md). */
export const ROW_MODS = [1, 1, 0, 0, 0, -1];

/** Trophy track: gold for defeating a player at this position, exhaustion on reaching it (Игровой стол.md). */
export const TRACK_GOLD = [1, 2, 3, 3];
export const EXHAUST = [0, 1, 2, 3];
export const TROPHIES_TO_WIN = 4;

export const HAND_LIMIT = 7;
export const ELIXIR_LIMIT = 4;
export const PHASE3_HAND = 3;

/** Location action kinds keyed by board number (Игровой стол.md, База.md pp. 35–36). */
export const LOC_ACTIONS = {
    0: { kind: 'school' }, 1: { kind: 'school' }, 3: { kind: 'school' }, 10: { kind: 'school' }, 15: { kind: 'school' }, 17: { kind: 'school' },
    2: { kind: 'hunt' }, 13: { kind: 'hunt' },
    4: { kind: 'raise', skill: 'alchemy' }, 5: { kind: 'raise', skill: 'defense' }, 12: { kind: 'raise', skill: 'spec' }, 18: { kind: 'raise', skill: 'combat' },
    6: { kind: 'poker' }, 14: { kind: 'poker' },
    7: { kind: 'poor' },
    8: { kind: 'swap' },
    9: { kind: 'elixir' }, 11: { kind: 'elixir' }, 16: { kind: 'elixir' },
};
export const LOC_ACTION_TEXT = {
    school: 'Тренировка в школе: навык +1 за (навык + 1) золота',
    hunt: '+1 золото и задание на выслеживание',
    raise: 'Повысить навык, если он не выше уровня ведьмака',
    poker: 'Покер с горожанами: ставка 1 золото, выигрыш 3',
    poor: 'Если 0 золота: +1 золото; убрать до 2 карт ряда',
    swap: 'Убрать карту из руки и взять из ряда карту дороже не более чем на 1',
    elixir: '+1 эликсир',
};

export const TERRAINS = ['forest', 'mountain', 'water'];
export const TERRAIN_NAME = { forest: 'Лес', mountain: 'Горы', water: 'Вода', joker: 'Джокер' };
export const COLOR_NAME = { blue: 'Быстрая атака', red: 'Мощная атака', green: 'Защитный приём', purple: 'Атакующий Знак', yellow: 'Защитный Знак' };
export const COLOR_SHORT = { blue: 'синяя', red: 'красная', green: 'зелёная', purple: 'фиолетовая', yellow: 'жёлтая' };

/** Seat colours for player bases/UI, in school order — the school colour is the base of the miniature. */
export const BOT_NAMES = ['Весемир', 'Ламберт', 'Эскель', 'Койон', 'Лето'];

/** Base game monster pool: MON-01..28 (28 cards, База.md p. 4). 29 Кащей, 30 Тролль, 31 Сирена are expansions. */
export const BASE_MONSTERS = Array.from({ length: 28 }, (_, i) => 'MON-' + String(i + 1).padStart(2, '0'));

// ---------------------------------------------------------------------------------------------
// Game modes and house rules (lobby). «Кастомная игра»: the host toggles each rule freely.
// «Игра на MMR»: every rule is forced on, so rated games are always played the same way.
// ---------------------------------------------------------------------------------------------
export const GAME_MODES = {
    custom: { name: 'Кастомная игра', text: 'Правила стола выбираются свободно.' },
    mmr: { name: 'Игра на MMR', text: 'Рейтинговая партия: все правила стола включены и не меняются.' },
};
export const HOUSE_RULES = [
    { id: 'elixirReturn', name: 'Возврат эликсиров', text: 'После битвы каждый выпитый в ней эликсир можно вернуть за 1 золото.' },
    { id: 'bombs', name: 'Выбор бомбы и восстановление', text: 'Бомбу выбираете при получении; после битвы использованную бомбу можно восстановить за 2 золота.', needs: 'trail', needsText: 'Бомбы — из дополнения «По следу монстра»: правило заработает вместе с ним.' },
    { id: 'openEvents', name: 'Открытые последствия', text: 'Последствия обоих вариантов карты события видны до выбора.' },
];
/** Lobby settings → { mode, rules } with MMR forcing every rule on. */
/** Expansions that can already be switched on in the lobby. */
export const EXPANSIONS_READY = ['ciri'];
export const normalizeExp = (exp) => Array.isArray(exp) ? EXPANSIONS_READY.filter(x => exp.includes(x)) : [];

export function normalizeRules(mode, rules = {}) {
    const m = GAME_MODES[mode] ? mode : 'custom';
    const out = {};
    for (const r of HOUSE_RULES) out[r.id] = m === 'mmr' ? true : !!rules[r.id];
    return { mode: m, rules: out };
}
