// Presentation uses only the already filtered view, never state.secret.
import { CARNOMORPH_ADAPTATIONS } from '../shared/data/carnomorphs.mjs';
import { INTRUDER_NAMES } from '../shared/data/cards.mjs';

export function adaptationSlots(view) {
    return ['shambler', 'breeder', 'butcher'].map(type => {
        const removed = (view.carnomorphRemoved || []).includes(type);
        const id = !removed && (view.carnomorphAdaptations || {})[type];
        const card = id && CARNOMORPH_ADAPTATIONS[id];
        return { type, label: INTRUDER_NAMES[type], status: removed ? 'removed' : card ? 'open' : 'hidden',
            name: card ? card.name : null, text: card ? card.text : null };
    });
}

export function toughnessText(card) {
    const value = n => n === 'retreat' ? 'отступление' : String(n);
    return 'Стойкость — глодатель: ' + value(card.metagorger) + '; остальные: ' + value(card.other) + '.';
}
