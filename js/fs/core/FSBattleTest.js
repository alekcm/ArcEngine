// FSBattleTest.js — a battle on demand, as one object.
//
// The engine can open a table without a campaign: a ready map, or a battle of
// chosen troops and a chosen deck, so a rule can be tried in one click. That
// test lived in two fields of the state (`state.testMode` and `state.testBattle`
// with its kind, the two sides, the battlefield, the roster of troops, the two
// decks and the tokens of reinforcement) and four layers read them by hand:
// the setup built the table, the combat ended the order differently for it, the
// panel drew the rematch button, and the board suppressed the usual panels.
//
// One question now: `BattleTest.of(state)` — `mode`, `battle`, `active`,
// `side(seat)`, `participant(seat)`, `roster`, `decks` и `reinforcement`.
// The two fields stay on the state with the same shape, so a save and the
// network read them as they did.

class BattleTest {
    /** @param {any} state the game state (the fields live on it) */
    constructor(state) {
        this.state = state || {};
    }

    /** The test of a game; null when there is no state at all. */
    static of(state) {
        if (!state) return null;
        let test = BattleTest.cache.get(state);
        if (!test) {
            test = new BattleTest(state);
            BattleTest.cache.set(state, test);
        }
        return test;
    }

    /** A ready map: the board is built, the game starts with planning. */
    static MAP = 'map';
    /** A battle: the table is one system and the fight is already on. */
    static BATTLE = 'battle';

    /** What kind of table this is; null for an ordinary game. */
    get mode() {
        return this.state.testMode || null;
    }

    setMode(mode) {
        this.state.testMode = mode === undefined ? null : mode;
        return this;
    }

    /** Is this a test of a battle? */
    get active() {
        return this.mode === BattleTest.BATTLE;
    }

    /** The record of the battle, or null. */
    get battle() {
        return this.state.testBattle || null;
    }

    /** Is there a battle to replay? */
    get replayable() {
        return !!this.state.testBattle;
    }

    /** The system and the area the battle is fought in. */
    get system() {
        const battle = this.battle;
        return battle ? battle.system : null;
    }

    get pos() {
        const battle = this.battle;
        return battle ? battle.pos : null;
    }

    /** Which side of the battle this seat is on: `attacker`, `defender` or null. */
    side(seat) {
        const battle = this.battle;
        if (!battle) return null;
        if (battle.attacker === seat) return 'attacker';
        if (battle.defender === seat) return 'defender';
        return null;
    }

    /** Does this seat fight in the test battle? */
    participant(seat) {
        return this.side(seat) !== null;
    }

    /** The troops the battle began with: `{ seat, unit }` entries. */
    get roster() {
        const battle = this.battle;
        return battle && Array.isArray(battle.roster) ? battle.roster : [];
    }

    /** The deck of one side, as the cards the test chose. */
    decks(side) {
        const battle = this.battle;
        return battle && battle.decks ? battle.decks[side] || [] : [];
    }

    /** How many tokens of reinforcement a side begins with. */
    get reinforcement() {
        const battle = this.battle;
        return battle ? battle.reinforcement || 0 : 0;
    }

    /** The record of a battle begins. */
    begin(record) {
        this.state.testBattle = record;
        this.state.testMode = BattleTest.BATTLE;
        return this;
    }
}

/** One test per state, like one table per game. */
BattleTest.cache = new WeakMap();
