// «По следу монстра» mini-expansions other than the bombs (Книги правил/По следу монстра.md):
//  - мастерские действия: 40 cards, 10 sets × 4 (Ведьмаки/Мастерские действия.md, atlas 10 × 4);
//  - уникальные действия: one per hero, shuffled into the starting deck (Ведьмаки/Уникальные карты.md,
//    atlas «Трофеи и стартовые карты.jpg», column 1);
//  - мутагены: 15 cards (Доп колоды/Мутагены.md, atlas 5 × 3).
// The cards are shown as printed (the whole scan — their rules text is on the card); the engine
// reads the fields below. Extra fields on action cards:
//   printed: 'M' | 'U' — whole-card scan from that atlas; burn: cost «убрать из игры 1 карту из руки»;
//   prev: colour — +1 damage if the card right before it in the combo has that colour (Пируэт);
//   fx.fixedDraw: 0 — end-of-turn draw is 0 and cannot be changed (Решающий удар);
//   fx.dice: 'aard' | 'ambush' — a d6 roll (on a link for Сметающий Аард, on the card for Засада);
//   fx.river — Река гнева; link.cond: { n, fx } — the second field of Обман's double link;
//   any — a card of every colour (Боевой транс); endurance — two moves for one card (Выносливость);
//   onDiscard — effect when discarded from deck/hand by an opponent's attack; special — unique text.

const mk = (o) => ({ cost: 1, links: [], fx: {}, ...o });
const d1 = { dmg: 1 }, s1 = { shield: 1 }, dr2 = { draw: 2 }, dice = { dice: 'aard' };

const PIROUETTE_TEXT = 'Стоимость получения: уберите из игры 1 карту из руки. Если сразу перед этой картой в комбинации находится карта ';
const prevName = { yellow: 'защитного Знака (жёлтая)', purple: 'атакующего Знака (фиолетовая)', green: 'защитного приёма (зелёная)' };

export const MASTERS = [
    ...[['forest', 'red', 'yellow'], ['water', 'purple', 'yellow'], ['water', 'green', 'purple'], ['mountain', 'yellow', 'green']].map(([terrain, link, prev], i) => mk({
        name: 'Пируэт', color: 'blue', terrain, burn: true, cost: 99, fx: { dmg: 3 }, links: [{ color: link, fx: d1 }], prev,
        text: PIROUETTE_TEXT + prevName[prev] + ', нанесите ещё 1 урон.',
    })),
    ...['mountain', 'mountain', 'water', 'forest'].map(terrain => mk({
        name: 'Решающий удар', color: 'red', terrain, burn: true, cost: 99, fx: { dmg: 4, fixedDraw: 0 },
        text: 'Стоимость получения: уберите из игры 1 карту из руки. В конце вашего хода битвы возьмите 0 карт. Это значение не может быть изменено другими эффектами.',
    })),
    ...[['forest', 'purple'], ['forest', 'red'], ['mountain', 'blue'], ['water', 'yellow']].map(([terrain, link]) => mk({
        name: 'Уворот', color: 'green', terrain, cost: 0, fx: { shield: 1 }, links: [{ color: link, fx: dr2 }], onDiscard: { shield: 2 },
        text: 'Когда эта карта сбрасывается из вашей колоды или руки из-за атаки противника, повысьте свой уровень щита на 2.',
    })),
    ...[
        ['forest', [s1, dice, d1, dr2]], ['water', [dr2, s1, dice, d1]], ['water', [d1, dr2, s1, dice]], ['mountain', [dice, d1, dr2, s1]],
    ].map(([terrain, fxs]) => mk({
        name: 'Сметающий Аард', color: 'purple', terrain, fx: { dmg: 1, draw: 1 },
        links: ['green', 'yellow', 'blue', 'red'].map((color, k) => ({ color, fx: fxs[k] })),
        text: 'Выполняя эффект кубика, бросьте кубик: 1–3 — ничего не происходит; 4–6 — нанесите 2 урона.',
    })),
    ...[['mountain', 'green'], ['mountain', 'green'], ['water', 'blue'], ['forest', 'purple']].map(([terrain, link]) => mk({
        name: 'Обман', color: 'yellow', terrain, fx: { draw: 3 }, links: [{ color: link, fx: d1, cond: { n: 2, fx: { dmg: 3 } } }],
        text: `Второй эффект связи (3 урона) применяется, если где угодно после этой карты в комбинации есть 2 карты цвета связи.`,
    })),
    ...[0, 1, 2, 3].map(() => mk({
        name: 'Контратака', color: 'grey', terrain: 'joker', cost: 0, fx: { shield: 1, draw: 2 }, onDiscard: { dmg: 2 },
        text: 'Когда эта карта сбрасывается из вашей колоды или руки из-за атаки противника, нанесите 2 урона.',
    })),
    ...[0, 1, 2, 3].map(() => mk({
        name: 'Выносливость', color: 'grey', terrain: 'joker', cost: 0, fx: { dmg: 1, draw: 2 }, endurance: true,
        text: 'Перемещение: в фазу I, используя эту карту для перемещения, вы можете переместиться 2 раза (игнорируйте действие первой локации).',
    })),
    ...['purple', 'red', 'blue', 'yellow'].map(hot => mk({
        name: 'Боевой транс', color: 'grey', terrain: 'joker', fx: { dmg: 1, draw: -2 }, any: true,
        links: ['green', 'yellow', 'purple', 'blue', 'red'].map(color => ({ color, fx: color === hot ? d1 : {} })),
        text: 'Эта карта является картой любого типа (цвета).',
    })),
    ...[0, 1, 2, 3].map(() => mk({
        name: 'Засада', color: 'grey', terrain: 'joker', fx: { dice: 'ambush' },
        text: 'Бросьте кубик: 1–3 — нанесите 2 урона; 4–5 — нанесите 3 урона; 6 — нанесите 4 урона.',
    })),
    ...[0, 1, 2, 3].map(() => mk({
        name: 'Река гнева', color: 'grey', terrain: 'joker', cost: 2, fx: { river: true },
        text: 'Если ваш уровень щита равен 0 и в вашей колоде не осталось карт, эта карта наносит 3 урона. В противном случае она наносит 1 урон. Повысьте свой уровень щита до вашего максимума.',
    })),
].map((c, i) => ({ id: 'MASTER-' + String(i + 1).padStart(2, '0'), cell: `r${Math.floor(i / 10) + 1}c${i % 10 + 1}`, printed: 'M', ...c }));

export const UNIQUES = [
    { name: 'Проворство', school: 'wolf', color: 'grey', terrain: 'forest', fx: { draw: 2 }, links: [{ color: 'yellow', fx: s1 }, { color: 'purple', fx: d1 }], special: 'lastLink', text: 'Примените эффект 1 любой связи последней карты в комбинации.' },
    { name: 'Острые когти', school: 'cat', color: 'blue', terrain: 'mountain', fx: { dmg: 2 }, links: [{ color: 'yellow', fx: dr2 }, { color: 'purple', fx: d1 }], special: 'blue2', text: 'Если в вашей комбинации есть хотя бы 2 карты быстрых атак (синих), увеличьте свой уровень щита на 1.' },
    { name: 'Искры из глаз', school: 'bear', color: 'yellow', terrain: 'forest', fx: {}, links: [{ color: 'blue', fx: d1 }], special: 'sparks', text: 'Перед выполнением эффектов комбинации: если ваш уровень щита равен 0, выберите и возьмите 1 любую карту из своей колоды (перемешайте колоду после этого).' },
    { name: 'Потайный клинок', school: 'viper', color: 'red', terrain: 'mountain', fx: { dmg: 2 }, links: [], special: 'emptyDeck', text: 'Если в вашей колоде не осталось карт, эта карта дополнительно наносит 1 урон.' },
    { name: 'Чары паралича', school: 'griffin', color: 'purple', terrain: 'mountain', fx: { dmg: 1, draw: 1 }, links: [{ color: 'green', fx: {} }, { color: 'yellow', fx: {} }, { color: 'blue', fx: {} }], onDiscard: { fromDiscard: true, deckOnly: true }, text: 'Когда эта карта сбрасывается из вашей колоды (не руки) из-за атаки противника, возьмите 1 любую карту из своего сброса (кроме этой карты).' },
    { name: 'Цикл дыхания', school: 'manticore', color: 'grey', terrain: 'water', fx: { top: 1 }, links: [{ color: 'green', fx: s1 }, { color: 'yellow', fx: {} }, { color: 'purple', fx: {} }, { color: 'blue', fx: {} }, { color: 'red', fx: {} }], special: 'breath', text: 'Переверните обратно свой 1 использованный эликсир (его можно использовать снова). Его предыдущее использование не считается в ваш максимум использований эликсиров за битву.' },
    { name: 'Танец мечей', school: 'ciri', color: 'green', terrain: 'water', fx: { shield: 1 }, links: [{ color: 'yellow', fx: {} }, { color: 'purple', fx: d1 }], special: 'combo3', text: 'Если в вашей комбинации есть хотя бы 3 карты, нанесите 1 урон.' },
].map((c, i) => ({ id: 'WITCHER-UNIQUE-0' + (i + 1), cell: `r${i + 1}c1`, cost: 1, printed: 'U', unique: true, ...c }));
export const UNIQUE_OF = Object.fromEntries(UNIQUES.map(u => [u.school, u.id]));

// Mutagens: colour of the mutagen (not a card colour), condition, effect. `when: 'end'` — checked
// at the end of the fight turn (MUT-15), the rest when a combo is played. MUT-08 is «урон 1 / +2».
export const MUTAGENS = [
    { color: 'red', cond: 'Если в вашей комбинации нет эффектов, позволяющих взять больше карт', fx: { draw: 1 }, test: 'noDraw' },
    { color: 'red', cond: 'Если ваша комбинация начинается с карты защитного приёма (зелёной) и заканчивается картой мощной атаки (красной)', fx: { dmg: 1, shield: 1 }, test: 'firstLast', a: 'green', b: 'red' },
    { color: 'red', cond: 'Если в вашей комбинации есть хотя бы 1 карта защитного Знака (жёлтая) и 1 карта мощной атаки (красная)', fx: { dmg: 1, draw: 1 }, test: 'both', a: 'yellow', b: 'red' },
    { color: 'red', cond: 'Если в вашей комбинации есть хотя бы 2 карты быстрых атак (синих)', fx: { dmg: 1, shield: 1 }, test: 'two', a: 'blue' },
    { color: 'red', cond: 'Если ваша комбинация состоит ровно из 2 карт', fx: { shield: 1 }, test: 'exactly2' },
    { color: 'blue', cond: 'Если в вашей комбинации есть хотя бы 1 карта быстрой атаки (синяя) и 1 карта защитного приёма (зелёная)', fx: { dmg: 1, draw: 1 }, test: 'both', a: 'blue', b: 'green' },
    { color: 'blue', cond: 'Если в вашей комбинации есть хотя бы 2 карты защитных приёмов (зелёных)', fx: { dmg: 2 }, test: 'two', a: 'green' },
    { color: 'blue', cond: 'Если ваша комбинация увеличила ваш щит до вашего максимума', fx: { dmg: 1 }, alt: { draw: 2 }, test: 'toMax' },
    { color: 'blue', cond: 'Если в вашей комбинации нет эффектов, наносящих урон', fx: { dmg: 1 }, test: 'noDmg' },
    { color: 'blue', cond: 'Если ваша комбинация должна увеличить ваш уровень щита, но он уже максимальный', fx: { top: 1 }, test: 'atMax' },
    { color: 'green', cond: 'Если ваша комбинация начинается с карты атакующего Знака (фиолетовой) и заканчивается картой мощной атаки (красной)', fx: { dmg: 1, shield: 1 }, test: 'firstLast', a: 'purple', b: 'red' },
    { color: 'green', cond: 'Если в вашей комбинации есть хотя бы 2 карты защитных Знаков (жёлтых)', fx: { dmg: 1, shield: 1 }, test: 'two', a: 'yellow' },
    { color: 'green', cond: 'Если в вашей комбинации есть хотя бы 1 карта защитного Знака (жёлтая) и 1 карта атакующего Знака (фиолетовая)', fx: { dmg: 1, draw: 1 }, test: 'both', a: 'yellow', b: 'purple' },
    { color: 'green', cond: 'Если в вашей комбинации есть хотя бы 2 карты атакующих Знаков (фиолетовых)', fx: { dmg: 1, shield: 1 }, test: 'two', a: 'purple' },
    { color: 'green', cond: 'Если в конце вашего хода битвы вы должны взять карту, но у вас в руке их уже 7', fx: { dmg: 1 }, test: 'hand7', when: 'end' },
].map((m, i) => ({ id: 'MUT-' + String(i + 1).padStart(2, '0'), cell: `r${Math.floor(i / 5) + 1}c${i % 5 + 1}`, name: { red: 'Красный мутаген', blue: 'Синий мутаген', green: 'Зелёный мутаген' }[m.color], ...m }));
export const MUTAGEN = Object.fromEntries(MUTAGENS.map(m => [m.id, m]));
/** Mutagens gained on reaching a witcher level (instead of the cards of LEVEL_DRAW). */
export const MUTAGEN_GAIN = { 2: 1, 3: 1, 4: 2, 5: 2 };

/** «По следу монстра» parts that can be switched on separately in the lobby (exp ids 'trail:<id>'). */
export const TRAIL_PARTS = [
    { id: 'bombs', name: 'Бомбы', text: 'альтернатива эликсирам' },
    { id: 'manticore', name: 'Школа Мантикоры', text: 'Алувар, «Быстрый метаболизм»' },
    { id: 'troll', name: 'Тролль', text: 'новый монстр III уровня' },
    { id: 'mutagens', name: 'Мутагены', text: 'за уровни ведьмака вместо карт' },
    { id: 'unique', name: 'Уникальные действия', text: '11-я карта начальной колоды каждого героя' },
    { id: 'masters', name: 'Мастерские действия', text: '40 карт с новыми механиками в колоде действий' },
];
