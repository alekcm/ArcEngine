// Ownership checks for trophies and the catalogue of "once per fight" effects that the
// player triggers by hand during step 1 of a fight turn (База.md p. 22).
import { MONSTER } from './util.mjs';

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
};

export function trophyName(t) {
    if (t.kind === 'monster') return MONSTER[t.id]?.name || t.id;
    return t.id;
}
