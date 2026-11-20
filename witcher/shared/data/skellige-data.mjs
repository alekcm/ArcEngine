// Expansion «Скеллиге» (Witcher/Книги правил/Скеллиге.md; Witcher/Скелиге/Дагон.md, Дары Дагона.md;
// Сирена — Witcher/Книги правил/Доп монстра.md p. 2). Hand-written from those sources: the board
// layout, the Dagon threat track, Dagon's two-sided card and the five gifts. The exploration cards
// (SK-EX-01..50, a calm and a dangerous half each) and the event cards SK-EV-01..30 are generated
// with the other events (tools/events-gen.mjs → events-gen.mjs).

/** Continent ports (p. 4, step 7): ships lie next to 3 random ones at setup. */
export const PORTS = [1, 5, 6, 9, 12, 13];
/** The three islands of the Skellige board (location tokens 19–21). */
export const ISLANDS = [19, 20, 21];
/** The top division of the Dagon track counts as a separate location (p. 9): not an island, not
 *  the Continent; reachable only from a Continent port with a ship while Dagon (or Сирена) is there. */
export const DAGON_LOC = 30;
/** Islands from the event cards SK-EV-01..05 (p. 11): they join the game when an exploration card
 *  places them next to the board. Location numbers 31–35 are this game's own (no printed number). */
export const EVENT_ISLANDS = { 31: 'SK-EV-01', 32: 'SK-EV-02', 33: 'SK-EV-03', 34: 'SK-EV-04', 35: 'SK-EV-05' };
export const ISLAND_OF_EVENT = Object.fromEntries(Object.entries(EVENT_ISLANDS).map(([n, id]) => [id, Number(n)]));
/** Extra locations for the shared LOC table (the event islands carry the joker terrain symbol). */
export const SK_LOCS = [
    { n: DAGON_LOC, name: 'Локация Дагона', terrain: 'joker', school: null, port: false, island: false, dagon: true, actionText: 'Битва с Дагоном (или с сиреной)' },
    { n: 31, name: 'Хен Инис', terrain: 'joker', school: null, port: false, island: true, event: 'SK-EV-01', actionText: 'Не больше 1 трофея монстра I уровня: трофей случайного монстра I уровня' },
    { n: 32, name: 'Лок Гвен', terrain: 'joker', school: null, port: false, island: true, event: 'SK-EV-02', actionText: '+3 золота' },
    { n: 33, name: 'Энье Ард', terrain: 'joker', school: null, port: false, island: true, event: 'SK-EV-03', actionText: '4 эликсира (лишние сверх 4 сбросить)' },
    { n: 34, name: 'Павен-и-Креван', terrain: 'joker', school: null, port: false, island: true, event: 'SK-EV-04', actionText: 'По 1 жетону следа каждого типа, которого ещё нет' },
    { n: 35, name: 'Хвандр Хеванги', terrain: 'joker', school: null, port: false, island: true, event: 'SK-EV-05', actionText: 'Битва со случайным монстром I, II или III уровня' },
];
/** Location actions of the islands (p. 5 and p. 11). */
export const SK_LOC_ACTIONS = {
    19: { kind: 'skAnySkill' }, 20: { kind: 'skMist' }, 21: { kind: 'skEyna' },
    31: { kind: 'skHenInis' }, 32: { kind: 'skGold3' }, 33: { kind: 'skElixir4' }, 34: { kind: 'skTracks' }, 35: { kind: 'skHunt' },
};
export const SK_LOC_ACTION_TEXT = {
    skAnySkill: 'Увеличьте любой свой навык на 1',
    skMist: 'Карта стоимости 0 из ряда в сброс, или 1 золото → карта стоимости 1 из ряда в сброс',
    skEyna: 'Нет трофеев I/II → трофей I; трофей I → трофей II; трофей II → трофей III (случайные монстры)',
    skHenInis: 'Не больше 1 трофея монстра I уровня: трофей случайного монстра I уровня',
    skGold3: 'Возьмите 3 золота',
    skElixir4: 'Возьмите 4 эликсира; лишние сверх 4 сбросьте',
    skTracks: 'По 1 жетону следа каждого типа, которого у вас ещё нет',
    skHunt: 'Стопка монстров I, II или III уровня: битва со случайным монстром',
};

/**
 * Dagon threat track (pp. 5–6, 9), bottom to top. `calm` — the lowest die result of the calm
 * (upper) range; lower results are dangerous. Division 4 is the Dagon location: always dangerous,
 * no roll. Start: 4/5 players — 0, 2/3 players — 1, solo — 2.
 */
export const TRACK = [{ calm: 2, label: '4/5' }, { calm: 3, label: '2/3' }, { calm: 4, label: '1' }, { calm: 5, label: '' }];
export const TRACK_TOP = 4;
export const trackStart = (n) => (n >= 4 ? 0 : n >= 2 ? 1 : 2);
export const calmRange = (i) => (i >= TRACK_TOP ? null : `${TRACK[i].calm}–6`);
export const dangerRange = (i) => (i >= TRACK_TOP ? 'всегда' : TRACK[i].calm === 2 ? '1' : `1–${TRACK[i].calm - 1}`);

/** Dagon: one two-sided monster card (Дагон.md). The special side is used with «По следу монстра»
 *  special attacks; Dagon never has vulnerabilities. */
export const DAGON = {
    id: 'DAGON', name: 'Дагон', level: 2, life: 15, model: 'Дагон.obj', sk: true,
    ability: 'В начале первого хода монстра игрок сбрасывает 1 случайную карту из руки, затем понижает свой уровень щита на 1 за каждый имеющийся у него трофей.',
    trophy: '',
};
/** The special side: discard ability and special attacks I–IV (the texts as printed). */
export const DAGON_BIG = {
    id: 'DAGON',
    discard: { name: 'Призыв водяных', text: 'Игрок сбрасывает 1 карту с символом водной местности из руки. Если он не может это сделать, то сбрасывает 2 карты с верха своей колоды.' },
    attacks: [
        { name: 'Древняя сила', text: 'Игрок получает 4 урона, но снижает его на 1 за каждую карту с символом водной местности в своей руке.' },
        { name: 'Додревняя мощь', text: 'Игрок получает 5 урона.' },
        { name: 'Колдовская буря', text: 'Если у игрока в руке есть карта с символом водной местности, он сбрасывает 2 карты с верха своей колоды. В противном случае он сбрасывает 2 случайные карты из руки.' },
        { name: 'Чародейный потоп', text: 'Игрок сбрасывает 3 карты с верха своей колоды (если в колоде нет карт — случайные карты из руки).' },
    ],
    vulns: [],
};
/** Special attacks as engine operations (see vuln-data.mjs for the vocabulary). */
export const DAGON_ATTACKS = [
    [{ k: 'dmgWater', base: 4 }],
    [{ k: 'dmg', n: 5 }],
    [{ k: 'ifWater', then: [{ k: 'deckTop', n: 2 }], else: [{ k: 'randHand', n: 2 }] }],
    [{ k: 'deckTop', n: 3, orHand: 'random' }],
];
/** «Призыв водяных»: 1 water card from the hand, otherwise 2 cards from the top of the deck. */
export const DAGON_DISCARD = { waterOrDeck: 2 };

/** Dagon's gifts (Дары Дагона.md): not trophies; the second effect is the same on all five. */
export const GIFTS = [
    { id: 'DAGON-GIFT-01', cell: 'r1c1', text: 'В течение всей битвы: 1 раз в ход снизьте урон от атаки противника на 1.' },
    { id: 'DAGON-GIFT-02', cell: 'r1c2', text: 'Один раз за ход, находясь в водной локации Континента, сбросьте 1 карту из руки, чтобы немедленно переместиться в любую другую водную локацию Континента. После этого можете выполнить действие этой локации.' },
    { id: 'DAGON-GIFT-03', cell: 'r1c3', text: 'После формирования запаса жизней ваш противник получает 3 урона.' },
    { id: 'DAGON-GIFT-04', cell: 'r2c1', text: 'Один раз за ход после фазы III можете убрать из игры 1 карту из руки и взять в руку 1 карту из ряда на поле. Напечатанная стоимость новой карты может быть равна стоимости убранной или на 1 выше.' },
    { id: 'DAGON-GIFT-05', cell: 'r2c2', text: 'Каждый ход не более одного раза в каждой локации: если вы переместились в локацию Континента с фигуркой корабля и не перемещаетесь на остров, возьмите 1 эликсир, получите 1 золото и возьмите 1 карту из своей колоды.' },
];
export const GIFT = Object.fromEntries(GIFTS.map(g => [g.id, g]));
export const GIFT_SECOND = 'После любой битвы с вашим участием: Дагон перемещается на 1 деление вверх по шкале.';

/** Lobby settings in the expansion list: 'skellige' and the optional 'skellige:siren'. */
export const SK_SUB = /^skellige:siren$/;
