// Bombs («По следу монстра», p. 4): whenever you would take an elixir you may instead discard
// 1 elixir and 1 gold to take the top bomb (up to 4 bombs, kept apart from the elixirs). House
// rule «Выбор бомбы и восстановление»: the bomb type is chosen, and after a fight each used
// bomb can be restored for 2 gold. Using bombs in a fight lives in fight.mjs.
import { STEPS, push, ask } from './flow.mjs';
import { log, fx, removeFrom, shuffle, potionOf } from './util.mjs';
import { BOMBS_IN_PLAY, BOMB_COPIES, BOMB_LIMIT, bombOf, BOMB } from '../data/bombs-data.mjs';
import { trailOn } from '../data/rules-data.mjs';

export const bombsOn = (state) => trailOn(state, 'bombs');
/** Older saves and sandboxes switched to «По следу монстра» get their bomb deck on first use. */
export function ensureBombs(state) {
    if (!bombsOn(state)) return;
    if (!Array.isArray(state.bombDeck)) state.bombDeck = [];
    if (!Array.isArray(state.bombDiscard)) state.bombDiscard = [];
    for (const p of state.players) if (!Array.isArray(p.bombs)) p.bombs = [];
    const held = state.players.reduce((n, p) => n + p.bombs.length, 0) + (state.fight && state.fight.usedBombs ? state.fight.usedBombs.length : 0);
    if (!state.bombDeck.length && !state.bombDiscard.length && !held) {
        state.bombDeck = shuffle(state, BOMBS_IN_PLAY.flatMap(b => Array.from({ length: BOMB_COPIES }, (_, k) => b.id + '#' + (k + 1))));
    }
}
const bombsLeft = (state) => (state.bombDeck || []).length + (state.bombDiscard || []).length;
/** Why `p` can't take a bomb instead of an elixir right now (null if it can). */
export function bombOfferError(state, p) {
    if (!bombsOn(state)) return 'Бомбы — дополнение «По следу монстра»';
    ensureBombs(state);
    if (!p.elixirs.length) return 'Нужен хотя бы 1 эликсир, чтобы сбросить';
    if (p.gold < 1) return 'Нужно 1 золото';
    if (p.bombs.length >= BOMB_LIMIT) return `Бомб уже ${BOMB_LIMIT}`;
    if (!bombsLeft(state)) return 'Бомбы закончились';
    return null;
}
/** The elixir-or-bomb question for one elixir of a gain step (`step` = the gainElixir step). */
export function askElixirOrBomb(state, p, step) {
    const { op, ...args } = step;
    if (p.bot) {
        // Bots: a bomb when rich in elixirs and gold (keeping gold for moves and training).
        const bomb = p.elixirs.length >= 2 && p.gold >= 3 && p.bombs.length < 2;
        push(state, { ...args, op: 'elixirOrBomb', choice: bomb ? 'bomb' : 'elixir' });
        return;
    }
    ask(state, {
        seat: p.seat, kind: 'choice', ui: 'bombOffer', title: 'Эликсир или бомба',
        text: `Вы берёте эликсир${step.why ? ' (' + step.why + ')' : ''}. Вместо него можно получить бомбу: сбросьте 1 эликсир и 1 золото (у вас ${p.gold}). Бомб может быть до ${BOMB_LIMIT}, сейчас ${p.bombs.length}.`,
        options: [{ id: 'elixir', label: 'Взять эликсир' }, { id: 'bomb', label: 'Получить бомбу (−1 эликсир, −1 золото)' }],
        op: 'elixirOrBomb', args,
    });
}
STEPS.elixirOrBomb = (state, step) => {
    const p = state.players[step.seat];
    const { op, choice, ...rest } = step;
    if (choice !== 'bomb' || bombOfferError(state, p)) { push(state, { ...rest, op: 'gainElixir', asked: true }); return; }
    if (p.elixirs.length === 1 || p.bot) { push(state, { ...rest, op: 'bombPay', ids: [p.elixirs[0]] }); return; }
    ask(state, { seat: p.seat, kind: 'cards', from: 'elixirs', ids: p.elixirs.slice(), min: 1, max: 1, title: 'Бомба', text: 'Какой эликсир сбросить, чтобы получить бомбу?', op: 'bombPay', args: rest });
};
STEPS.bombPay = (state, step) => {
    const p = state.players[step.seat];
    const { op, ids, ...rest } = step;
    const e = ids && ids[0];
    if (!e || !p.elixirs.includes(e) || p.gold < 1) { push(state, { ...rest, op: 'gainElixir', asked: true }); return; }
    removeFrom(p.elixirs, e); state.elixirDiscard.push(e);
    p.gold -= 1;
    log(state, `${p.name} сбрасывает эликсир «${potionOf(e).name}» и 1 золото ради бомбы`);
    if (state.rules && state.rules.bombs) {
        const pool = [...state.bombDeck, ...state.bombDiscard];
        const types = BOMBS_IN_PLAY.filter(b => pool.some(x => x.startsWith(b.id + '#')));
        if (p.bot) { push(state, { ...rest, op: 'bombTake', choice: types[0].id }); return; }
        ask(state, {
            seat: p.seat, kind: 'choice', ui: 'bombType', title: 'Выбор бомбы', text: 'Правило стола: выберите, какую бомбу получить.',
            options: types.map(b => ({ id: b.id, label: b.name, hint: b.text })), op: 'bombTake', args: rest,
        });
        return;
    }
    push(state, { ...rest, op: 'bombTake' });
};
STEPS.bombTake = (state, step) => {
    const p = state.players[step.seat];
    if (!state.bombDeck.length && state.bombDiscard.length) state.bombDeck = shuffle(state, state.bombDiscard.splice(0));
    let inst = null;
    if (step.choice) {
        inst = state.bombDeck.find(x => x.startsWith(step.choice + '#')) || null;
        if (!inst) { inst = state.bombDiscard.find(x => x.startsWith(step.choice + '#')) || null; if (inst) removeFrom(state.bombDiscard, inst); }
        else removeFrom(state.bombDeck, inst);
    } else inst = state.bombDeck.shift() || null;
    if (inst) {
        p.bombs.push(inst);
        log(state, `${p.name} получает бомбу «${bombOf(inst).name}»`, { kind: 'elixir' });
        fx(state, { k: 'bomb', seat: p.seat, id: inst });
    }
    const { op, choice, ...rest } = step;
    push(state, { ...rest, op: 'gainElixir', n: (step.n == null ? 1 : step.n) - 1, asked: false });
};

/** House rule: after the fight each bomb used in it can be restored for 2 gold. */
STEPS.bombReturnAsk = (state, step) => {
    const p = state.players[step.seat];
    const ids = step.ids.filter(id => state.bombDiscard.includes(id)).slice(0, BOMB_LIMIT - p.bombs.length);
    const max = Math.min(ids.length, Math.floor(p.gold / 2));
    if (!max) return;
    ask(state, { seat: p.seat, kind: 'cards', from: 'bombs', ui: 'bombReturn', ids, min: 0, max, title: 'Восстановление бомб', text: `Правило стола: каждую использованную в этой битве бомбу можно восстановить за 2 золота (у вас ${p.gold}).`, op: 'bombReturnDo', args: { seat: p.seat } });
};
STEPS.bombReturnDo = (state, step) => {
    const p = state.players[step.seat];
    const ids = (step.ids || []).filter(id => state.bombDiscard.includes(id)).slice(0, Math.floor(p.gold / 2));
    if (!ids.length) return;
    for (const id of ids) { removeFrom(state.bombDiscard, id); p.bombs.push(id); }
    p.gold -= ids.length * 2;
    log(state, `${p.name} восстанавливает бомбы за ${ids.length * 2} золота: ${ids.map(id => bombOf(id).name).join(', ')}`, { kind: 'elixir' });
};
export { BOMB };
