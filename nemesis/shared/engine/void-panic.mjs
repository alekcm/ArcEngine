// Panic interpreter; effect continuations are serializable and private where appropriate.
import { shuffle } from '../rng.mjs';
import { VOID_PANIC_BY_ID, VOID_EVENT_BY_ID } from '../data/voidseeders.mjs';
import { ITEMS, dropLocked } from '../data/cards.mjs';
import { OPS, ask, next, log, player, pname, room, tileOf, playersInRoom, turnOrder, intrudersIn, isContam,
    discardCard, drawCards, removeCardFromGame, cardDef, fx, loseHealth, gainWound, killPlayer, placeFire, placeMalfunction, handSlots, dropHeavy } from './core.mjs';
import { alterMadness } from './voidseeders.mjs';

const supported = new Set(['apathy', 'rage', 'hallucinations', 'bloodlust', 'pyromania', 'defeatism', 'selfHarm', 'heartAttack', 'destruction', 'hopelessness', 'madness', 'bandages', 'sabotage', 'blindFlee']);
export function panicSupported(card) { return !!card && supported.has(card.effect); }
function discardableHeavy(state, p) {
    const ids = new Set(handSlots(state, p).filter(s => s.kind === 'item').map(s => s.ref.slice(5)));
    return p.items.filter(it => ids.has(it.uid) && !dropLocked(it.item));
}
function canApply(state, p, card) {
    const rs = room(state, p.room), t = tileOf(state, p.room);
    switch (card.effect) {
        case 'rage': return !rs.malfunction && t !== 'nest' && t !== 'contaminated';
        case 'pyromania': return !rs.fire;
        case 'hallucinations': return p.items.some(i => ITEMS[i.item]?.weapon && (i.ammo || 0) > 0);
        case 'destruction': return discardableHeavy(state, p).length > 0;
        case 'hopelessness': return !!(p.deck.length || p.discard.length);
        case 'madness': return !intrudersIn(state, p.room).length && state.ship.rooms[p.room].exits.some(e => intrudersIn(state, e.to).length);
        case 'blindFlee': return !!(state.eventDeck.length || state.eventDiscard.length);
        default: return true;
    }
}
function finish(step) { return step.then || { op: 'noop' }; }

/** Draw is table-visible. Only the effect (not an increase for an inapplicable card) may be interrupted. */
OPS['void.panic'] = (state, step) => {
    const p = player(state, step.player), then = finish(step);
    if (!p || p.status !== 'active' || p.pod) { next(state, then); return; }
    if (!state.voidPanicDeck.length) state.voidPanicDeck = shuffle(state, state.voidPanicDiscard.splice(0));
    const id = state.voidPanicDeck[0], card = VOID_PANIC_BY_ID[id];
    if (!card) throw new Error('Missing Voidseeder panic card: ' + id);
    if (!panicSupported(card)) throw new Error('Voidseeder panic effect not yet integrated: ' + card.effect);
    state.voidPanicDeck.shift(); state.voidPanicDiscard.push(id);
    fx(state, { type: 'panic', card: id, name: card.name, text: card.text, player: p.id, level: card.level });
    log(state, '🧠 ' + pname(p) + ' разыгрывает панику «' + card.name + '» (' + card.level + '+).', 'event');
    if (p.madness < card.level || !canApply(state, p, card)) {
        alterMadness(state, p, 1); next(state, then); return;
    }
    next(state, { op: 'react.interrupt', player: p.id, label: 'применяет эффект паники «' + card.name + '»',
        then: { op: 'void.panicApply', player: p.id, card: id, then }, cancelTo: then });
};

OPS['void.panicApply'] = (state, step) => {
    const p = player(state, step.player), card = VOID_PANIC_BY_ID[step.card], then = finish(step);
    if (!p || p.status !== 'active' || p.pod) { next(state, then); return; }
    switch (card.effect) {
        case 'apathy': {
            const order = turnOrder(state).filter(o => o.status === 'active' && !o.pod && o.room === p.room);
            next(state, ...order.map(o => ({ op: 'void.apathy', player: o.id })), { op: 'void.madness', player: p.id, delta: 1 }, then);
            return;
        }
        case 'rage': placeMalfunction(state, p.room, 'паника'); break;
        case 'pyromania': placeFire(state, p.room, 'паника'); break;
        case 'bandages': loseHealth(state, p, 1, 'паника: разрывая повязки'); break; // Redux has no bandaged wounds
        case 'sabotage': log(state, 'Счётчик предметов отсутствует в Redux: эффект паники пропущен.', 'minor'); break;
        case 'hopelessness': {
            const n = p.hand.length; drawCards(state, p, 3, true);
            const drawn = p.hand.slice(n), choices = drawn.filter(c => !isContam(c));
            if (!choices.length || p.status !== 'active') { for (const c of drawn) discardCard(state, p, c); next(state, then); return; }
            ask(state, { kind: 'cards', secret: true, player: p.id, title: 'Безнадёжность: уберите одну взятую карту действия из игры', cards: choices, min: 1, max: 1 },
                { op: 'void.panicRemoveCard', player: p.id, drawn, then });
            return;
        }
        case 'madness': {
            const exits = state.ship.rooms[p.room].exits.filter(e => intrudersIn(state, e.to).length).sort((a, b) => a.to.localeCompare(b.to, undefined, { numeric: true }));
            if (exits.length) next(state, { op: 'move.start', player: p.id, dest: exits[0].to, then }); else next(state, then);
            return;
        }
        case 'blindFlee': {
            if (!state.eventDeck.length) state.eventDeck = shuffle(state, state.eventDiscard.splice(0));
            const id = state.eventDeck.shift(), card = VOID_EVENT_BY_ID[id];
            if (!card) throw new Error('Missing Voidseeder event card: ' + id);
            state.eventDiscard.push(id);
            const exit = state.ship.rooms[p.room].exits.find(e => (e.nums || [e.num]).includes(card.move.num));
            log(state, 'Слепое бегство: «' + card.name + '», коридор ' + card.move.num + '.', 'event');
            if (exit) next(state, { op: 'move.start', player: p.id, dest: exit.to, then });
            else { alterMadness(state, p, 1); next(state, then); }
            return;
        }
        case 'selfHarm': loseHealth(state, p, 2, 'паника: самоистязание'); break;
        case 'heartAttack': killPlayer(state, p, 'паника: сердечный приступ'); break;
        case 'bloodlust':
            for (const o of playersInRoom(state, p.room)) gainWound(state, o, 1);
            break;
        case 'defeatism':
            for (const o of playersInRoom(state, p.room)) alterMadness(state, o, 1);
            break;
        case 'hallucinations': {
            const items = p.items.filter(i => ITEMS[i.item]?.weapon && (i.ammo || 0) > 0);
            if (!items.length) { next(state, then); return; }
            ask(state, { kind: 'choice', secret: true, player: p.id, title: 'Галлюцинации: выберите оружие, чтобы сбросить боеприпасы',
                options: items.map(it => ({ id: it.uid, label: ITEMS[it.item].name + ' · патронов: ' + it.ammo })) },
                { op: 'void.panicAmmo', player: p.id, then });
            return;
        }
        case 'destruction': {
            const items = discardableHeavy(state, p);
            if (!items.length) { next(state, then); return; }
            ask(state, { kind: 'choice', secret: true, player: p.id, title: 'Уничтожение: выберите тяжёлый предмет в руках',
                options: items.map(it => ({ id: it.uid, label: ITEMS[it.item].name })) }, { op: 'void.panicDrop', player: p.id, then });
            return;
        }
        default: throw new Error('Unsupported Voidseeder panic effect: ' + card.effect);
    }
    if (!state.shipDestroyed) next(state, then);
};
OPS['void.madness'] = (state, step) => { const p = player(state, step.player); if (p) alterMadness(state, p, step.delta); };
OPS['void.apathy'] = (state, step) => {
    const p = player(state, step.player);
    if (!p || p.status !== 'active') return;
    const cards = p.hand.filter(c => !isContam(c));
    if (!cards.length) return;
    ask(state, { kind: 'cards', secret: true, player: p.id, title: 'Апатия: сбросьте 1 карту действия', cards, min: 1, max: 1 },
        { op: 'void.apathyChoice', player: p.id });
};
OPS['void.apathyChoice'] = (state, step) => {
    const p = player(state, step.player), card = step.answer[0];
    if (p && p.hand.includes(card) && !isContam(card)) { discardCard(state, p, card); log(state, pname(p) + ' сбрасывает карту действия из-за апатии.', 'event'); }
};
OPS['void.panicAmmo'] = (state, step) => {
    const p = player(state, step.player), item = p.items.find(i => i.uid === step.answer);
    if (item && ITEMS[item.item]?.weapon) { item.ammo = 0; log(state, pname(p) + ': боеприпасы «' + ITEMS[item.item].name + '» сброшены.', 'event'); }
    next(state, finish(step));
};
OPS['void.panicDrop'] = (state, step) => {
    const p = player(state, step.player);
    if (discardableHeavy(state, p).some(i => i.uid === step.answer)) dropHeavy(state, p, 'item:' + step.answer);
    next(state, finish(step));
};

OPS['void.panicRemoveCard'] = (state, step) => {
    const p = player(state, step.player), chosen = step.answer[0];
    if (p && (step.drawn || []).includes(chosen) && p.hand.includes(chosen) && !isContam(chosen)) removeCardFromGame(state, p, chosen);
    for (const c of step.drawn || []) if (p && p.hand.includes(c)) discardCard(state, p, c);
    next(state, finish(step));
};
