// event-text.mjs — one printed description for an event card of any pack.
//
// All four decks read the same way: movement band, effect band, noise band. DLC event cards keep
// their own movement icons in the data, but the table sees the Redux wording («все чужие», «каждый
// персонаж делает бросок шума»), so the text is produced here instead of in each client branch.
import { carnomorphEventText } from './carnomorph-events.mjs';
import { chytridEventText } from './chytrids.mjs';
import { INTRUDER_NAMES } from './cards.mjs';

/** The Redux noise band, identical on every card that rolls for the whole table. */
export const EVENT_NOISE_TEXT = 'Бросок кубика: каждый персонаж делает бросок шума.';

export function voidEventText(card) {
    return 'Движение: все кошмары — коридор ' + card.move.num + '. ' + card.text + ' ' + EVENT_NOISE_TEXT;
}

export function originalEventText(card) {
    const types = ((card.move && card.move.types) || []).map(t => INTRUDER_NAMES[t] || t).join(', ');
    return 'Движение (' + types + '): коридор ' + card.move.num + '. ' + card.text;
}

export function eventTextFor(ev) {
    if (!ev) return '';
    if (String(ev.id).startsWith('origEv')) return originalEventText(ev);
    if (String(ev.id).startsWith('carnoEvent')) return carnomorphEventText(ev);
    if (String(ev.id).startsWith('voidEvent')) return voidEventText(ev);
    if (String(ev.id).startsWith('chyEvent')) return chytridEventText(ev);
    return ev.text;
}

export { INTRUDER_NAMES };
