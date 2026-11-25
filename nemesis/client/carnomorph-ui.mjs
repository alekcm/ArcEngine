// Presentation uses only the already filtered view, never state.secret.
import { CARNOMORPH_ADAPTATIONS } from '../shared/data/carnomorphs.mjs';
import { RX_CARNOMORPH_ADAPTATIONS } from '../shared/data/carnomorphs-redux.mjs';
import { INTRUDER_NAMES } from '../shared/data/cards.mjs';

const redux = view => !!(view && view.carnomorphRedux);
const defs = view => redux(view) ? RX_CARNOMORPH_ADAPTATIONS : CARNOMORPH_ADAPTATIONS;

/** Redux uses "Мясной зверь" in the third slot; the classic pack uses "Свежеватель". */
export function adaptationSlots(view) {
    const third = redux(view) ? 'fleshbeast' : 'breeder';
    return ['shambler', third, 'butcher'].map(type => {
        const removed = (view.carnomorphRemoved || []).includes(type);
        const id = !removed && (view.carnomorphAdaptations || {})[type];
        const card = id && defs(view)[id];
        return { type, label: INTRUDER_NAMES[type], status: removed ? 'removed' : card ? 'open' : 'hidden',
            name: card ? card.name : null, text: card ? card.text : null };
    });
}

export function toughnessText(card) {
    const value = n => n === 'retreat' ? 'отступление' : String(n);
    return 'Стойкость — глодатель: ' + value(card.metagorger) + '; остальные: ' + value(card.other) + '.';
}

/** Redux attack cards have three printed target lines instead of a shared toughness number. */
export function attackDisplayText(card) {
    if (!card) return '';
    if (card.lines) return Object.values(card.lines).map(line => line.text).join(' ');
    return card.text || '';
}

