// FSQuestion.js — the question a step asks, and where the effect will go on.
//
// An effect runs step by step; a step that needs a choice stops the run and
// leaves `state.pending` behind: who is asked (`seat`, `answerSeat`), which list
// of steps is interrupted and at what index (`steps`, `index`), the question
// itself and the context of its owner. The interpreter wrote that record in four
// places with slightly different options (`ctx: { kind, ctx, schemes }` for a
// scheme, `stash` for the second half of a two-part question) and the rest of
// the game read it field by field — the panel, the answer of a command and the
// tail of the run.
//
// One question now: `Question.of(state)` — `ask(...)` to leave a question,
// `answerSeat` to know who must answer, `close()` to go on. The record stays in
// `state.pending` and keeps its exact shape: a saved game, a test and the
// network protocol read it as they did.

class Question {
    /** @param {any} state the game state (the record lives on it) */
    constructor(state) {
        this.state = state || {};
    }

    /** The question of a game; null when there is no state at all. */
    static of(state) {
        if (!state) return null;
        let question = Question.cache.get(state);
        if (!question) {
            question = new Question(state);
            Question.cache.set(state, question);
        }
        return question;
    }

    /** The record of the question, or null when nothing is asked. */
    get record() {
        return this.state.pending || null;
    }

    /** Is the game waiting for an answer? */
    get waiting() {
        return !!this.state.pending;
    }

    /** The question itself: `{ kind, who, options, text, … }`. */
    get question() {
        const pending = this.record;
        return (pending && pending.question) || null;
    }

    /** The player the question belongs to. */
    get seat() {
        const pending = this.record;
        return pending ? pending.seat : null;
    }

    /** The player who must answer — the card may ask somebody else. */
    get answerSeat() {
        const pending = this.record;
        if (!pending) return null;
        return pending.answerSeat === undefined ? pending.seat : pending.answerSeat;
    }

    /** May this player answer now? */
    answers(seat) {
        return this.waiting && this.answerSeat === seat;
    }

    /** The steps the question interrupted and the step it stands at. */
    get steps() {
        const pending = this.record;
        return (pending && pending.steps) || [];
    }

    get index() {
        const pending = this.record;
        return pending && pending.index !== undefined ? pending.index : 0;
    }

    /** The context of the effect that asked (owner, kind, ctx, schemes, stash). */
    get ctx() {
        const pending = this.record;
        return (pending && pending.ctx) || null;
    }

    /**
     * A step needs an answer: the run stops here and the record says where to go
     * on. `answerSeat` is the player who must answer — by default the seat of the
     * effect, but a card may ask the opponent.
     */
    ask(record) {
        const one = record || {};
        this.state.pending = {
            seat: one.seat,
            answerSeat: one.answerSeat === undefined ? one.seat : one.answerSeat,
            kind: one.kind || 'card',
            steps: one.steps || [],
            index: one.index || 0,
            question: one.question || null,
            ctx: one.ctx || {},
        };
        if (one.stash) this.state.pending.stash = one.stash;
        return this.state.pending;
    }

    /** The run goes on: nothing is asked any more. */
    close() {
        this.state.pending = null;
        return this;
    }
}

/** One question per state, like one effect interpreter per state. */
Question.cache = new WeakMap();
