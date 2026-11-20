// The engine is an explicit step machine: every pending piece of work is a serialisable step
// in state.queue ({ op, ...args }). A step that needs a decision sets state.prompt and the
// queue stops until the prompted seat answers. Because the queue is plain JSON, saves, undo
// and reconnects work at any moment — even in the middle of a fight.

/** @type {Record<string, (state: any, step: any) => void>} */
export const STEPS = {};

/** Run next, before anything already queued (keeps the given order). */
export function push(state, ...steps) { state.queue.unshift(...steps); }
/** Run after everything already queued. */
export function later(state, ...steps) { state.queue.push(...steps); }

export function run(state) {
    let guard = 0;
    while (!state.prompt && state.queue.length && state.stage !== 'over') {
        if (++guard > 20000) throw new Error('engine loop');
        const step = state.queue.shift();
        const h = STEPS[step.op];
        if (!h) throw new Error('unknown step ' + step.op);
        h(state, step);
    }
}

/**
 * Ask a seat to decide. Two generic shapes cover every decision in the game:
 *   kind 'cards'  — pick between min and max of `ids` (with `from` telling the UI where they lie)
 *   kind 'choice' — pick one of `options` [{ id, label, hint?, disabled? }]
 * The answer is turned into the step { op, ...args, ids | choice }.
 */
export function ask(state, prompt) {
    state.prompt = { min: 0, max: 0, ...prompt };
}
