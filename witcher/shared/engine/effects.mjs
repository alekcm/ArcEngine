// Ownership checks for trophies and the catalogue of "once per fight" effects that the
// player triggers by hand during step 1 of a fight turn (База.md p. 22).
import { MONSTER } from './util.mjs';
import { ELIXIR_LIMIT } from '../data/rules-data.mjs';

/** Monster trophy: the trophy side of the defeated monster card (MON-NN). */
export const hasTrophy = (p, monId) => p.trophies.some(t => t.kind === 'monster' && t.id === monId);
/** Witcher trophy of a school (taken from a defeated witcher). */
export const hasWitcherTrophy = (p, school) => p.trophies.some(t => t.kind === 'witcher' && t.id === school);
/** Skill trophy (SKILL-COMBAT#1 ...). */
export const hasSkillTrophy = (p, skill) => p.trophies.some(t => t.kind === 'skill' && t.id.startsWith('SKILL-' + skill.toUpperCase()));

/**
 * Manually activated fight effects. `need` is checked by the engine to list the effect as
 * available, `label` is shown on the button. Every entry is "once per fight" unless noted.
 */
export const ACTIVE_EFFECTS = {
    'MON-06': { label: 'Архиспора: щит +1, если колода пуста', src: 'monster' },
    'MON-07': { label: 'Баргест: сбросить 2 эликсира → 1 урон и 1 карта', src: 'monster' },
    'MON-10': { label: 'Виверна: сбросить 1 карту → любая карта из сброса', src: 'monster' },
    'MON-11': { label: 'Полуденница: сбросить 1 эликсир → 2 карты', src: 'monster' },
    'MON-14': { label: 'Брукса: сбросить 1 карту → 5 карт', src: 'monster' },
    'MON-18': { label: 'Гнилец: бросить кубик (4–6: 1 урон)', src: 'monster' },
    'MON-21': { label: 'Мантикора: 2 золота → любая карта из сброса', src: 'monster' },
    'MON-26': { label: 'Кухарка: щит +3, если колода пуста', src: 'monster' },
    'MON-28': { label: 'Сколопендроморф: любая карта из сброса', src: 'monster' },
    'MON-30': { label: 'Тролль: 2 урона, если колода пуста', src: 'monster' },
    'W-griffin': { label: 'Трофей Грифона: верх сброса, затем сбросить 1', src: 'witcher' },
    'W-manticore': { label: 'Трофей Мантикоры: сбросить эликсир → 1 урон', src: 'witcher' },
    // «Чародеи»: trophies for defeating a mage (Маги/Трофеи.md). Филиппа's one is passive.
    'W-alzur': { label: 'Трофей Альзура: бросить кубик (1–3: 1 урон, −2 карты; 4–5: 1; 6: 2 урона)', src: 'witcher' },
    'W-ardea': { label: 'Трофей Ардеи: при щите 0 — 2 карты (в конце хода на 1 меньше)', src: 'witcher' },
    'W-gehira': { label: 'Трофей Гехиры: сбросить 1 карту → 2 урона (в конце хода на 1 карту меньше)', src: 'witcher' },
    'W-otar': { label: 'Трофей Отара: щит −1 → барьер 2', src: 'witcher' },
    'CONT79-15': { label: 'Кастет: сбросить 1 карту → 2 урона', src: 'gear' },
    'CONT79-01': { label: 'Арбалет: сбросить 1 карту → 2 урона (первый ход)', src: 'gear' },
    'CONT79-14': { label: 'Арбалет: 2 урона (первый ход)', src: 'gear' },
    'CONT79-20': { label: 'Адья: бросить кубик (первый ход)', src: 'gear' },
    'CONT79-56': { label: 'Лекарство: карта из сброса → в колоду', src: 'gear' },
};

/** Equipment / companion card (event card kept in front of the player, База.md p. 17). */
export const hasGear = (p, id) => !!(p.gear && p.gear.includes(id));
/** Event option kept in front of the player («Положите эту карту перед собой»): by kind. */
export const keepOf = (p, kind) => (p.keeps || []).find(k => k.kind === kind) || null;
/** Elixir limit: 4, or 5 with «Сумка для зелий». */
export const elixirCap = (p) => keepOf(p, 'elixirLimit') ? keepOf(p, 'elixirLimit').n : ELIXIR_LIMIT;
/** School training cost of `skill` (the printed level + 1, «Вырванная страница»: −3, at least 1). */
export function trainCost(p, skill) {
    const base = p.skills[skill] + 1;
    const k = keepOf(p, 'train');
    return k ? Math.max(1, base - k.n) : base;
}
/** Free movement granted by kept cards: Лошадь (forest, free), «Услуга гильдии купцов» (water, 1 card). */
export const GEAR_MOVES = {
    'CONT79-16': { terrain: 'forest', cost: 0, label: 'Лошадь: в соседнюю лесную локацию' },
    'CONT79-32B': { terrain: 'water', cost: 1, label: 'Гильдия купцов: сбросить 1 карту → соседняя водная локация' },
};

export function trophyName(t) {
    if (t.kind === 'monster') return MONSTER[t.id]?.name || t.id;
    return t.id;
}
