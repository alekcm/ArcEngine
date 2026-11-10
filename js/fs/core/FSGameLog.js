// FSGameLog.js — the chronicle of a game, as one object.
//
// Every command says what happened (`«Тираниды разместил систему s3.»`), and the
// record is what the panel shows, what the last message of the status line says
// and what a player rereads after a battle. The rules kept the record in one
// array of the state (`state.log`) and each reader walked it himself: the
// rules pushed and cut it at two hundred entries, the panel sliced the last
// eight and glued the name of the seat to each line, the status line took the
// last one. The bound and the shape of a line lived in the rules, the reading
// of a line — everywhere else.
//
// One question now: `GameLog.of(state).add(seat, text)`, `.last(8)`, `.text` —
// a line is `{ seat, text }`, `seat` is -1 for the game itself, and the log
// keeps the last two hundred entries, as the rules say.

class GameLog {
    /** @param {any} state the game state (the record lives on it) */
    constructor(state) {
        this.state = state || {};
    }

    /** The log of a game; null when there is no state at all. */
    static of(state) {
        if (!state) return null;
        let log = GameLog.cache.get(state);
        if (!log) {
            log = new GameLog(state);
            GameLog.cache.set(state, log);
        }
        return log;
    }

    /** How many entries are kept: the oldest ones fall out of the window. */
    static LIMIT = 200;

    /** The seat of the game itself: nobody spoke, the rule did. */
    static GAME = -1;

    /** The entries, oldest first. */
    get entries() {
        const log = this.state.log;
        if (!log) this.state.log = [];
        return this.state.log;
    }

    /** How many entries are in the record. */
    get length() {
        return this.entries.length;
    }

    /** A command says what it did. */
    add(seat, text) {
        const entries = this.entries;
        entries.push({ seat, text });
        if (entries.length > GameLog.LIMIT) entries.splice(0, entries.length - GameLog.LIMIT);
        return this;
    }

    /** The game itself speaks: a phase began, a round ended. */
    note(text) {
        return this.add(GameLog.GAME, text);
    }

    /** The last entries, oldest first: what the panel and the status line show. */
    last(count) {
        if (count === undefined) return this.entries.slice();
        if (!count) return [];
        return this.entries.slice(-count);
    }

    /** The last thing that happened, or an empty string. */
    get text() {
        const entries = this.entries;
        const entry = entries.length ? entries[entries.length - 1] : null;
        return entry ? entry.text : '';
    }

    /** The last entry as it reads with the name of the speaker. */
    line(entry, nameOf) {
        if (!entry) return '';
        const name = entry.seat >= 0 && nameOf ? nameOf(entry.seat) : '';
        return name ? name + ': ' + entry.text : entry.text;
    }

    /** The last entries as lines, each with the name of its seat. */
    lines(count, nameOf) {
        return this.last(count).map(entry => this.line(entry, nameOf));
    }

    /** The chronicle starts from nothing. */
    clear() {
        this.state.log = [];
        return this;
    }
}

/** One log per state, like one chronicle per game. */
GameLog.cache = new WeakMap();
