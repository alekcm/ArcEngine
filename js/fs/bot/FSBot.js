// FSBot.js — the bot: a player of one seat who sees only what that seat sees.
//
// The bot gets `FS_RULES.view(state, seat)` — the same picture the client of
// that seat gets (closed orders of the others have no face, the decks are
// numbers, the hand of tiles is its own) — and answers with a command for
// `FS_RULES.apply`. It never touches the state and never reads anything the
// player at that seat could not read: honesty by construction, not by promise.
//
// The three layers of the plan (docs/forbidden-stars/16-bots-plan.md):
//   1. the legal moves — this file lists what the seat may do now;
//   2. the measure — FSBotBrain.js scores the candidates (the tokens, the
//      odds of a battle, the map) and picks one of them with a controlled
//      randomness (softmax by the level, the tail cut by a cumulative share);
//   3. the character — FSBotPersona.js: the weights, the tastes, the tempo,
//      the triggers and the lines; the plan of the round comes from there.
//
// The shape of an answer of `next(view)`:
//   { cmd, label, must, say? }      — one command; `must` — a refusal is a bug
//   { tries: [cmd, …], label }      — commands to try in this order
//   { advance: true }               — a combat step without a decision (empty hand)
//   null                            — nothing to do (not this seat's turn, or the game is over)
// `say` is a line of the character: the caller writes it in the log after the
// command succeeds (the bot cannot write there itself).
// `answers(view, question)`: the answers to try, the first one preferred.
//
// Nothing here depends on the number of a round: the stage of the party is
// `GamePhase.of(view).progress` / `roundsLeft` — a «блиц» of five rounds and
// the classic eight are the same game to the bot.

/* global FS_RULES, FS_CATALOG, FS_REQUISITIONS, FS_BOT_PERSONAS, FS_EFFECTS, FSBotBrain, PhasePlan, MarchPlan, OrderContext, OrderMove, OrderTally, OrderDeal, CombatTurn,
   CombatSides, CombatHooks, CombatCards, CombatOutcome, BattleField, Question, StrikeDamage, GameOutcome, GamePhase, EventPhase,
   EventRound, BoardSetup, Purchases, DeployScope, UpgradeOrder, TileGeometry */

const FS_BOT = {
    /** The default difficulty for a newly added bot. */
    DEFAULT_LEVEL: 'veteran',

    /** The levels: presets of temperature, top-p and search depth for one bot. */
    LEVELS: [
        { id: 'novice', name: 'Новичок', temperature: 1.0, topP: 0.97, depth: 0 },
        { id: 'normal', name: 'Обычный', temperature: 0.45, topP: 0.9, depth: 1 },
        { id: 'veteran', name: 'Ветеран', temperature: 0.2, topP: 0.8, depth: 2 },
    ],

    /** The name the faction suggests for its bot (the lobby may change it). */
    NAMES: {
        'орки': 'Варбосс', 'космодесант-хаоса': 'Тёмный апостол', 'темные-эльдары': 'Архонт', 'эльдары': 'Провидец',
        'империя-тау': 'Этериал', 'адептус-механикус': 'Магос', 'некроны': 'Фаэрон', 'имперская-гвардия': 'Лорд-генерал',
        'космодесант': 'Магистр', 'тираниды': 'Разум улья', 'сестры-битвы': 'Канонисса', 'инквизиция': 'Инквизитор',
    },

    /** Every faction-specific character the lobby may offer. */
    get PERSONAS() {
        return FS_BOT_PERSONAS.all().map(p => this.personaRecord(p));
    },

    personaRecord(p) {
        return { id: p.id, name: p.name, text: p.text, faction: p.faction || null };
    },

    persona(id) {
        const p = FS_BOT_PERSONAS.get(id);
        return p ? this.personaRecord(p) : null;
    },

    /** The selectable characters of this faction; no generic characters are shared. */
    personasFor(factionId) {
        return FS_BOT_PERSONAS.for(factionId).map(p => this.personaRecord(p));
    },

    /** Does this faction-specific character belong to the bot's faction? */
    fits(personaId, factionId) {
        return FS_BOT_PERSONAS.fits(personaId, factionId);
    },

    level(id) {
        return this.LEVELS.find(l => l.id === id)
            || this.LEVELS.find(l => l.id === this.DEFAULT_LEVEL) || this.LEVELS[1];
    },

    /** What the lobby shows for a bot of this faction: the character, the name and the hint line. */
    defaults(factionId) {
        const persona = FS_BOT_PERSONAS.defaultFor(factionId);
        return { persona, name: this.NAMES[factionId] || 'Бот', line: FS_BOT_PERSONAS.hint(factionId, persona) || 'играет как умеет' };
    },

    /** The tactical hint for an explicitly selected bot persona, if it is public. */
    line(factionId, persona) {
        const d = this.defaults(factionId);
        const id = persona && FS_BOT_PERSONAS.fits(persona, factionId) ? persona : d.persona;
        return d.name + ': ' + (FS_BOT_PERSONAS.hint(factionId, id) || d.line);
    },

    /** A bot for one seat. */
    create(opts) {
        return new FSBot(opts || {});
    },

    // --- the randomness of the bot ------------------------------------------------
    // A small generator seeded by a string: the same seed, the same decisions.
    rngOf(seed) {
        let a = 0;
        for (const ch of String(seed)) a = (a * 31 + ch.charCodeAt(0)) >>> 0;
        a = (a || 1) >>> 0;
        return () => {
            a |= 0; a = (a + 0x6D2B79F5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    },
};

const botPick = (rnd, list) => (list && list.length ? list[Math.floor(rnd() * list.length)] : undefined);
const botShuffled = (rnd, list) => {
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
    return out;
};
const botChance = (rnd, p) => rnd() < p;

class FSBot {
    /**
     * @param {{seat:number, seed?:any, level?:string, persona?:string}} opts
     *   seat — the chair the bot plays; seed — the randomness of its decisions
     *   (the seed of the party and the seat together repeat a game exactly);
     *   level — the preset of the roulette; persona — one of the faction's
     *   exclusive doctrines (a mismatched choice falls back to that faction's default).
     */
    constructor(opts) {
        this.seat = opts.seat | 0;
        this.seed = opts.seed === undefined ? 1 : opts.seed;
        this.level = FS_BOT.level(opts.level);
        this.levelId = this.level.id;
        this.persona = opts.persona || null;
        // The attempts already made in a position: a refused command is not
        // repeated in the same place — the bot moves on to the ending command.
        this.tried = new Set();
        this.attempts = {};
        // What the bot remembers of its own party: the plan of the round, the
        // grudges, the orders it laid face down, the tokens it has collected.
        this.memory = { plan: null, grudges: {}, placed: {}, objectives: 0, battles: new Set(), lines: 0 };
        /** @type {any} the character once resolved against the faction of the seat */
        this.resolved = null;
        /** @type {((label: string, candidates: any[], pick: any) => void) | null} a hook of the tools that watch the bot think */
        this.trace = null;
    }

    get R() { return FS_RULES; }
    get brain() { return FSBotBrain; }

    /** The character, resolved against the faction of the seat (once per party). */
    character(view) {
        if (this.resolved) return this.resolved;
        const faction = view.players[this.seat].faction;
        const id = this.persona && FS_BOT_PERSONAS.fits(this.persona, faction) ? this.persona : FS_BOT_PERSONAS.defaultFor(faction);
        const persona = FS_BOT_PERSONAS.get(id);
        this.resolved = { persona, id, faction, w: FS_BOT_PERSONAS.weightsOf(persona), likes: persona.likes || { units: {}, combat: [], orders: [] },
            build: persona.build || { cities: 2 }, triggers: persona.triggers || { grudge: 1, leader: 1, exposed: 1, endgame: 1 } };
        return this.resolved;
    }

    /**
     * The roulette of the level over the candidates (each with `score`).
     * `label` names the decision for `this.trace` — a hook of the tools that
     * want to watch the bot think (the arena prints the candidates with it).
     */
    choose(rnd, candidates, label) {
        const pick = this.brain.choose(rnd, candidates, this.level);
        if (this.trace) this.trace(label || '?', candidates, pick);
        return pick;
    }

    /**
     * The randomness of one decision, seeded by the position: the same view
     * gives the same decision. «Отменить ход» by a human restores the state,
     * and the bot repeats its move instead of trying another — an honest
     * «передумал» of the human, not a reroll of the bot.
     */
    rng(view) {
        const c = view.combat;
        const key = [this.seed, this.seat, view.rng, view.uid, GamePhase.of(view).round, GamePhase.of(view).phase, (view.log || []).length,
            Question.of(view).waiting ? 'q' : '', c ? CombatTurn.of(c).step + ':' + CombatTurn.of(c).round : ''].join('|');
        return FS_BOT.rngOf(key);
    }

    /** Whose decision the game waits for — the same rule the server uses. */
    static activeSeat(view) {
        return FS_RULES.activeSeat(view);
    }

    /** Is it this bot's turn to act? */
    acts(view) {
        if (!view || view.over || GameOutcome.of(view).over) return false;
        return FSBot.activeSeat(view) === this.seat;
    }

    /** The next command of this seat, or null when it is not this seat's turn. */
    next(view) {
        if (!this.acts(view)) return null;
        this.character(view);
        const step = this.decide(view);
        if (step && !step.advance) {
            // The line reads like the chronicle of the game: «Варбосс идёт за
            // блестяшкой.» — the name of the seat is the subject of a predicate;
            // direct speech («WAAAGH!») stands as it is.
            const say = this.lineFor(view, step);
            const name = (view.players[this.seat] || {}).name;
            if (say) step.say = name && !say.startsWith('«') ? name + ' ' + say : say;
        }
        return step;
    }

    decide(view) {
        const R = this.R, seat = this.seat, rnd = this.rng(view);
        const trim = R.trimQueue(view);
        if (trim.blocked(seat)) {
            const entry = trim.entries().find(e => e.seat === seat);
            const units = entry ? view.units.filter(u => u.seat === seat && u.system === entry.system && u.area === entry.pos) : [];
            if (!units.length) return null;
            // The cheapest piece leaves; the routed ones first.
            const unit = units.map(u => ({ u, score: -this.brain.unitValue(R.unitOf(view, u)) + (u.routed ? 3 : 0) })).sort((a, b) => b.score - a.score)[0].u;
            return { cmd: { type: 'trimUnit', unit: unit.id }, must: true, label: 'trimUnit' };
        }
        const question = Question.of(view);
        if (question.waiting) {
            const answers = this.answers(view, question.question || {});
            return { tries: answers.map(answer => ({ type: 'effect', answer })), must: true, label: 'effect', question: true };
        }
        if (StrikeDamage.of(view).pending && StrikeDamage.of(view).waiting(seat)) return this.strikeDamage(view, rnd);
        if (view.combat) return this.combat(view, rnd);
        const phase = GamePhase.of(view);
        if (phase.is(GamePhase.SETUP) && BoardSetup.of(view).active) return this.setup(view, rnd);
        if (phase.is(GamePhase.PLANNING)) return this.planning(view, rnd);
        if (phase.is(GamePhase.OPERATIONS)) return this.operations(view, rnd);
        if (phase.is(GamePhase.REFRESH)) return this.refresh(view, rnd);
        return null;
    }

    // --- the plan of the round and the lines -----------------------------------------

    /**
     * The plan of the round: what the character wants this round — to grab a
     * token, to hit a player, to hold the line, to build. Chosen once per
     * round from the weights, the tempo and the triggers; it biases every
     * decision of the round. The triggers: a grudge (he attacked me), the
     * leader (he is about to win), an exposed token (nobody guards it), the
     * endgame (the party is in its last third).
     */
    plan(view) {
        const m = this.memory;
        const round = GamePhase.of(view).round;
        if (m.plan && m.plan.round === round) return m.plan;
        if (m.plan) for (const k of Object.keys(m.grudges)) m.grudges[k] *= 0.5;
        const rnd = FS_BOT.rngOf([this.seed, this.seat, 'plan', round, view.uid].join('|'));
        const candidates = this.planCandidates(view);
        const pick = this.choose(rnd, candidates, 'plan') || candidates[0];
        const changed = !m.plan || m.plan.kind !== pick.kind || m.plan.foe !== pick.foe;
        const me = view.players[this.seat];
        const captured = (me.objectives || 0) > m.objectives;
        m.objectives = me.objectives || 0;
        const lineKind = captured && botChance(rnd, 0.8) ? 'capture' : (changed ? (pick.trigger || pick.kind) : (botChance(rnd, 0.35) ? pick.kind : ''));
        m.plan = { round, kind: pick.kind, foe: pick.foe === undefined ? null : pick.foe, target: pick.target || null, trigger: pick.trigger || null,
            changed, line: lineKind ? FS_BOT_PERSONAS.line(this.character(view).faction, this.character(view).id, lineKind, rnd) : '', said: false };
        return m.plan;
    }

    planCandidates(view) {
        const R = this.R, seat = this.seat, B = this.brain;
        const ch = this.character(view), w = ch.w, trig = ch.triggers;
        const phase = GamePhase.of(view);
        const progress = phase.progress || 0;
        const roundsLeft = phase.roundsLeft === undefined ? 3 : phase.roundsLeft;
        const tempo = FS_BOT_PERSONAS.tempoFactor(ch.persona, progress);
        const me = view.players[seat];
        const targets = B.targets(view, seat);
        const exposed = B.exposed(view, seat);
        const leader = B.leader(view);
        const endgame = roundsLeft <= 2 || progress >= 0.65;
        const out = [];
        // Grab: the cheapest of my tokens that are not mine yet — the steps to
        // it and the army on it, against my own army.
        const myPower = B.powerOf(view, view.units.filter(u => u.seat === seat));
        const cost = t => (Number.isFinite(t.steps) ? t.steps : 6) * 1.5 + (t.defence > 0 ? 2 + t.defence / Math.max(1, myPower) * 6 : 0);
        const open = targets.filter(t => t.control !== 'friendly').sort((a, b) => cost(a) - cost(b));
        const nearest = open[0] || null;
        let grab = 8 * w.objective * (0.7 + progress);
        let grabTrigger = null;
        if (nearest) {
            grab += Math.max(0, 6 - cost(nearest));
            if (nearest.defence <= 0 && nearest.steps <= 1) { grab += 3 * (trig.exposed || 1); grabTrigger = 'exposed'; }
        }
        if (endgame) { grab += 6 * (trig.endgame || 1); grabTrigger = 'endgame'; }
        const target = nearest ? nearest.id : null;
        out.push({ kind: 'grab', target, score: grab, trigger: grabTrigger });
        // Attack: one of the others.
        for (const p of view.players) {
            if (p.seat === seat || p.eliminated) continue;
            let s = 5 * w.aggression * tempo;
            let trigger = null;
            const grudge = this.memory.grudges[p.seat] || 0;
            if (grudge > 0.4) { s += grudge * 3 * (trig.grudge || 1); trigger = 'grudge'; }
            if (leader === p.seat) { s += 4 * (trig.leader || 1) * (1 + progress); trigger = 'leader'; }
            let steps = Infinity;
            for (const sys of B.systemsOf(view, p.seat)) steps = Math.min(steps, B.reach(view, seat, sys).steps);
            if (Number.isFinite(steps)) s += Math.max(0, 3 - steps);
            else s -= 4;
            const theirPower = B.powerOf(view, view.units.filter(u => u.seat === p.seat));
            s += (myPower - theirPower) * 0.3 * w.risk;
            out.push({ kind: 'attack', foe: p.seat, target, score: s, trigger });
        }
        // Defend: the tokens of the others on my worlds, under a threat.
        let threat = 0;
        for (const x of exposed) if (x.mine && x.threat.near > x.defence) threat += x.threat.near - x.defence;
        let d = 3 * w.turtle + threat * 1.2 * w.turtle;
        if (endgame && exposed.some(x => x.mine)) d += 3 * (trig.endgame || 1);
        out.push({ kind: 'defend', target, score: d });
        // Build: the economy, while the party is young.
        const cities = R.player(view, seat).cities();
        let b = 4 * w.greed * (1.2 - progress) + ((me.materiel || 0) >= 8 ? 2 : 0) + (cities < (ch.build.cities || 2) ? 2 * w.tech : 0);
        if (endgame) b -= 4;
        out.push({ kind: 'build', target, score: b });
        return out;
    }

    /** A line of the character for this step, or '': the plan line once a round, a battle line once a battle. */
    lineFor(view, step) {
        const plan = this.memory.plan;
        const phase = GamePhase.of(view);
        if (plan && plan.round === phase.round && plan.line && !plan.said && !view.combat && !Question.of(view).waiting) {
            plan.said = true;
            return plan.line;
        }
        if (view.combat && step.label === 'reinforce') {
            const c = view.combat;
            const key = view.uid + ':' + BattleField.of(c).system + ':' + BattleField.of(c).pos + ':' + phase.round;
            if (!this.memory.battles.has(key)) {
                this.memory.battles.add(key);
                const ch = this.character(view);
                const rnd = FS_BOT.rngOf([this.seed, this.seat, key].join('|'));
                if (CombatSides.sideOf(c, this.seat) === 'attacker' && botChance(rnd, 0.7)) return FS_BOT_PERSONAS.line(ch.faction, ch.id, 'battle', rnd);
            }
        }
        return '';
    }

    // --- the questions of the cards ------------------------------------------------

    /** The answers to try: the first is the bot's choice, the rest are fallbacks. */
    answers(view, q) {
        const rnd = this.rng(view);
        const opts = Array.isArray(q.options) ? q.options : [];
        const n = Math.max(1, Number(q.n) || 1);
        const first = opts[0];
        const some = k => botShuffled(rnd, opts).slice(0, Math.min(k, opts.length));
        const out = [];
        switch (q.kind) {
            case 'ability':
                out.push(this.abilityAnswer(view, q, rnd), { yes: true }, {}, { no: true });
                break;
            case 'yesno':
                if (q.op === 'avoid') out.push(botChance(rnd, 0.5) ? { dice: opts.slice(0, n) } : { dice: [] }, { dice: [] }, { dice: opts.slice(0, n) }, { no: true });
                else out.push(botChance(rnd, 0.7) ? { yes: true } : { no: true }, { yes: true }, { no: true }, {});
                break;
            case 'scheme':
                out.push(botChance(rnd, 0.7) ? { choice: Math.floor(rnd() * Math.max(1, opts.length)) } : { no: true }, { choice: 0 }, { no: true }, {});
                break;
            case 'choice':
                out.push({ choice: Math.floor(rnd() * Math.max(1, opts.length)) }, { choice: 0 }, { no: true }, {});
                break;
            case 'units':
                out.push({ units: this.unitsAnswer(view, q, rnd, n) }, { units: some(n) }, { units: opts.slice(0, n) }, { units: first === undefined ? [] : [first] }, { units: [] }, { no: true });
                break;
            case 'dice':
                out.push({ dice: some(n) }, { dice: opts.slice(0, n) }, { dice: opts.slice() }, { dice: first === undefined ? [] : [first] }, { dice: [] }, { no: true });
                break;
            case 'diceFace':
                out.push({ dice: [botPick(rnd, opts)], face: this.faceAnswer(view, rnd) }, { dice: [first], face: 'att' }, { dice: [] }, { no: true });
                break;
            case 'face':
                out.push({ face: opts.length && !opts.includes(this.faceAnswer(view, rnd)) ? botPick(rnd, opts) : this.faceAnswer(view, rnd) }, { face: 'att' }, { no: true });
                break;
            case 'foes':
                out.push({ foe: this.foeAnswer(view, opts, rnd) }, { foe: first }, { no: true });
                break;
            case 'types': case 'structureTypes':
                out.push({ type: botPick(rnd, opts) }, { type: first }, { no: true });
                break;
            case 'areas': {
                const key = q.answerKey || 'area';
                out.push({ [key]: botPick(rnd, opts) }, { [key]: first }, { area: first }, { no: true });
                break;
            }
            case 'systems':
                out.push({ system: botPick(rnd, opts) }, { system: first }, { no: true });
                break;
            case 'cards':
                if (q.op === 'buyUpgradeReplace' || q.op === 'buyAnyUpgradeReplace') {
                    const weakest = this.weakestCard(view, opts);
                    out.push({ card: q.card, remove: weakest }, { card: q.card, remove: first }, { remove: first }, { no: true });
                } else if (q.op === 'swapCombatCards') out.push({ cards: botChance(rnd, 0.5) ? some(1) : [] }, { cards: [] }, { no: true });
                else out.push({ card: botPick(rnd, opts) }, { card: first }, { cards: [first] }, { no: true });
                break;
            case 'structures':
                out.push({ structure: botPick(rnd, opts) }, { structure: first }, { no: true });
                break;
            case 'assets': case 'assetType':
                out.push({ asset: this.assetAnswer(view, opts, rnd) }, { asset: first }, { asset: 'forge' }, { asset: 'cache' }, { asset: 'reinforcement' }, { no: true });
                break;
            default:
                out.push({ choice: 0 }, { yes: true }, {}, { no: true }, { units: opts.slice(0, n) }, { dice: opts.slice(0, n) });
        }
        return out;
    }

    /** The ability of the faction: yes, unless the character has a reason to save. */
    abilityAnswer(view, q, rnd) {
        const w = this.character(view).w;
        // The orks buy a unit at every domination; the greedy ones save sometimes.
        const p = botChance(rnd, Math.min(0.95, 0.6 + 0.2 * w.aggression)) ? { yes: true } : { no: true };
        return p;
    }

    /** The units a card asks for: ours — the dearest; theirs — also the dearest. */
    unitsAnswer(view, q, rnd, n) {
        const R = this.R;
        const opts = Array.isArray(q.options) ? q.options : [];
        const scored = opts.map(id => {
            const u = view.units.find(x => x.id === id);
            const def = u ? R.unitOf(view, u) : null;
            return { id, score: (def ? this.brain.unitValue(def) : 1) + rnd() * 0.5 };
        }).sort((a, b) => b.score - a.score);
        return scored.slice(0, Math.min(n, scored.length)).map(x => x.id);
    }

    /** The face of a die to set: attack in the early rounds, morale at the end. */
    faceAnswer(view, rnd) {
        const c = view.combat;
        if (!c) return botPick(rnd, ['att', 'def', 'morale']);
        const round = CombatTurn.of(c).round || 1;
        if (round >= 3) return botChance(rnd, 0.6) ? 'morale' : 'att';
        return botChance(rnd, 0.65) ? 'att' : 'def';
    }

    /** The player a card asks to name: the one of the plan, else the leader, else anyone. */
    foeAnswer(view, opts, rnd) {
        const plan = this.memory.plan;
        if (plan && plan.foe !== null && opts.includes(plan.foe)) return plan.foe;
        const leader = this.brain.leader(view);
        if (leader !== null && leader !== this.seat && opts.includes(leader)) return leader;
        return botPick(rnd, opts);
    }

    /** The asset a card gives: what the character lacks. */
    assetAnswer(view, opts, rnd) {
        const scored = opts.map(kind => ({ kind, score: this.assetWorth(view, kind) + rnd() * 0.3 })).sort((a, b) => b.score - a.score);
        return scored.length ? scored[0].kind : botPick(rnd, opts);
    }

    /** The worth of one more asset token to this character. */
    assetWorth(view, kind) {
        const R = this.R, seat = this.seat, ch = this.character(view), w = ch.w;
        const player = R.player(view, seat);
        if (!player.hasRoomFor(kind)) return -1;
        const have = player.assetCount(kind);
        if (kind === 'forge') {
            const heavy = Object.keys(ch.likes.units).some(id => { const d = R.unitDef(view, seat, id); return d && d.forge && ch.likes.units[id] >= 1.2; });
            return (ch.build.forge || heavy ? 3 : 1.5) - have * 1.2;
        }
        if (kind === 'cache') return 2 * w.greed - have * 0.6;
        if (kind === 'reinforcement') return 1.5 + 0.8 * w.turtle + (ch.persona.horde ? 0.5 : 0) - have * 0.5;
        return 1;
    }

    /** The card of the deck a new one replaces: the weakest of the offered. */
    weakestCard(view, names) {
        const faction = view.players[this.seat].faction;
        let worst = null, worstScore = Infinity;
        for (const name of names || []) {
            const card = FS_CATALOG.card('combat', faction, name);
            const icons = card && card.icons || {};
            const score = (icons.att || 0) + (icons.def || 0) + 0.7 * (icons.morale || 0) + this.brain.textWorth(card && card.general) + 0.5 * this.brain.textWorth(card && card.unit);
            if (score < worstScore) { worstScore = score; worst = name; }
        }
        return worst;
    }

    // --- the orbital strike: the defender takes the hits -----------------------------

    strikeDamage(view, rnd) {
        const R = this.R, seat = this.seat;
        const damage = StrikeDamage.of(view);
        const sys = damage.system, pos = damage.pos;
        const units = view.units.filter(u => u.seat === seat && u.system === sys && u.area === pos);
        const bastions = view.structures.filter(s => s.seat === seat && s.type === 'bastion' && s.system === sys && s.area === pos);
        const order = [];
        const first = damage.first ? units.find(u => u.id === damage.first) : null;
        if (first) order.push(first);
        // The cheapest standing piece takes the hit; the bastion before the dear ones.
        const standing = units.filter(u => !u.routed && u !== first)
            .map(u => ({ u, score: -this.brain.unitValue(R.unitOf(view, u)) + rnd() * 0.3 })).sort((a, b) => b.score - a.score).map(x => x.u);
        const cheap = standing.filter(u => this.brain.unitValue(R.unitOf(view, u)) <= 3);
        for (const u of cheap) order.push(u);
        for (const b of bastions) order.push(b);
        for (const u of standing) if (!cheap.includes(u)) order.push(u);
        for (const u of botShuffled(rnd, units.filter(u => u.routed && u !== first))) order.push(u);
        if (!order.length) return null;
        return { tries: order.map(x => ({ type: 'strikeDamage', unit: x.id, structure: x.id })), must: true, label: 'strikeDamage' };
    }

    // --- the galaxy is built ---------------------------------------------------------

    requisitionSuitScore(view, suit) {
        const p = view.players[this.seat];
        const available = suit.cards.map(id => FS_REQUISITIONS.card(id)).filter(Boolean);
        const average = available.reduce((sum, card) => sum + this.requisitionCardScore(view, card), 0)
            / Math.max(1, available.length);
        return average + (suit.id === 'authority' && (p.materiel || 0) < 5 ? 1 : 0);
    }

    requisitionCardScore(view, card) {
        const p = view.players[this.seat];
        const assets = p.assets || {};
        const room = kind => Math.max(0, this.R.player(view, this.seat).assetLimit(kind) - (assets[kind] || 0));
        switch (card.effect) {
            case 'materiel': return Math.max(0, 12 - (p.materiel || 0)) * 0.35;
            case 'asset': return Math.min(card.amount || 1, room(card.asset)) * (card.asset === 'forge' ? 1.1 : 0.9);
            case 'structure': return card.structure === 'city' ? 3.2 : card.structure === 'factory' ? 2.8 : 2.2;
            case 'efficient': return 2.7;
            case 'rout': return 1.4;
            case 'swap': return 1.5;
            case 'unit': return card.kl === 2 ? 2.7 : card.kl === 1 ? 2.1 : 1.6;
            case 'unit-pair': return 3.2;
            case 'combat-upgrade': return 2.4;
            case 'holdfields': return 1.7;
            case 'prepare': return (p.eventHand || []).length ? 2 : 0.4;
            default: return 1;
        }
    }

    requisitionOptionScore(view, card, option) {
        const R = this.R;
        if (option.kind === 'structure') {
            const system = R.system(view, option.system);
            const area = system && R.area(system, option.pos);
            const world = area && area.world;
            return (card && card.structure === 'city' ? 2.8 : card && card.structure === 'factory' ? 2.4 : 1.8)
                + (world ? (world.materiel || 0) * 0.25 + (world.objective ? 0.5 : 0) : 0);
        }
        if (option.kind === 'unit') {
            const def = R.unitDef(view, this.seat, option.unit);
            return 1.5 + (def ? this.brain.unitValue(def) * 0.3 : 0);
        }
        if (option.kind === 'unit-pair') {
            return 3 + (option.placements || []).reduce((sum, place) => {
                const def = R.unitDef(view, this.seat, place.unit);
                return sum + (def ? this.brain.unitValue(def) * 0.15 : 0);
            }, 0);
        }
        if (option.kind === 'rout') {
            return 1 + R.unitsAt(view, option.system, option.pos).filter(unit => unit.seat !== this.seat && !unit.routed)
                .reduce((sum, unit) => sum + this.brain.unitValue(R.unitOf(view, unit)) * 0.25, 0);
        }
        if (option.kind === 'order-upgrade') {
            const upgrade = FS_CATALOG.card('orders', view.players[this.seat].faction, option.card);
            return 2 + (upgrade && upgrade.text ? this.brain.textWorth(upgrade.text) * 0.2 : 0);
        }
        if (option.kind === 'combat-upgrade') {
            const upgrade = FS_CATALOG.card('combat', view.players[this.seat].faction, option.card);
            const icons = upgrade && upgrade.icons || {};
            return 2 + (icons.att || 0) + (icons.def || 0) + (icons.morale || 0) * 0.7;
        }
        if (option.kind === 'prepare') return 1.5;
        if (option.kind === 'swap') return 1.2;
        return 1;
    }

    setup(view, rnd) {
        const R = this.R, seat = this.seat;
        const board = BoardSetup.of(view);
        const stage = board.stage;
        // The start tokens of a choice («Инквизиция»): taken during the setup.
        const me = view.players[seat];
        if ((me.startChoice || 0) > 0) {
            const kinds = ['forge', 'cache', 'reinforcement'].filter(k => R.player(view, seat).hasRoomFor(k));
            if (kinds.length) return { cmd: { type: 'startAsset', asset: this.assetAnswer(view, kinds, rnd) }, must: true, label: 'startAsset' };
        }
        if (stage === BoardSetup.DRAFT_SUIT) {
            const draft = view.setup.blitzDraft || {};
            const suits = (draft.availableSuits || []).map(id => FS_REQUISITIONS.suit(id)).filter(Boolean);
            const candidates = suits.map(suit => ({ suit, score: this.requisitionSuitScore(view, suit) + rnd() * 0.25 }));
            const pick = this.choose(rnd, candidates, 'requisitionSuit');
            if (pick) return { cmd: { type: 'chooseRequisitionSuit', suit: pick.suit.id }, must: true, label: 'chooseRequisitionSuit' };
            return null;
        }
        if (stage === BoardSetup.DRAFT_CARD) {
            const draft = view.setup.blitzDraft || {};
            const candidates = (draft.cardHand || []).map((id, index) => {
                const card = FS_REQUISITIONS.card(id);
                return card ? { card, index, score: this.requisitionCardScore(view, card) + rnd() * 0.25 } : null;
            }).filter(Boolean);
            const pick = this.choose(rnd, candidates, 'requisitionDraftCard');
            if (pick) return { cmd: { type: 'chooseRequisitionCard', index: pick.index }, must: true, label: 'chooseRequisitionCard' };
            return null;
        }
        if (stage === BoardSetup.REQUISITION) {
            const cards = (me.requisitions || []).map(id => FS_REQUISITIONS.card(id)).filter(Boolean);
            const candidates = cards.map(card => {
                const options = R.requisitionOptions(view, seat, card.id);
                const unavailable = options.length ? 0 : -10;
                return { card, options, score: unavailable + this.requisitionCardScore(view, card) + options.length * 0.15 + rnd() * 0.25 };
            });
            const pick = this.choose(rnd, candidates, 'requisitionChoice');
            if (pick) return { cmd: { type: 'selectRequisition', card: pick.card.id }, must: true, label: 'selectRequisition' };
            return null;
        }
        if (stage === BoardSetup.REQUISITION_EFFECT) {
            const pending = view.setup.pendingRequisition;
            const card = pending && FS_REQUISITIONS.card(pending.card);
            const options = view.setup.requisitionOptions || (card ? R.requisitionOptions(view, seat, card.id) : []);
            const candidates = options.map((option, index) => ({ option, index, score: this.requisitionOptionScore(view, card, option) + rnd() * 0.25 }));
            const pick = this.choose(rnd, candidates, 'requisitionEffect');
            if (pick) return { cmd: { type: 'resolveRequisition', choice: pick.index }, must: true, label: 'resolveRequisition' };
            return { cmd: { type: 'resolveRequisition', choice: 0 }, must: true, label: 'resolveRequisition' };
        }
        if (stage === BoardSetup.TILES) return this.setupTile(view, rnd);
        if (stage === BoardSetup.FORCES) return this.setupForces(view, rnd);
        if (stage === BoardSetup.OBJECTIVES) return this.setupObjective(view, rnd);
        if (stage === BoardSetup.STORMS) {
            const faction = view.players[seat].faction;
            const options = [];
            for (const sys of view.systems) for (const side of R.setupStormSides(view, sys.id)) {
                const across = R.across(view, sys.id, side);
                const other = across && R.system(view, across);
                const tile = FS_CATALOG.tile(sys.tile);
                const otherTile = other && FS_CATALOG.tile(other.tile);
                const homeBorderToFoe = (tile && tile.home === faction && other && other.owner !== seat)
                    || (otherTile && otherTile.home === faction && sys.owner !== seat);
                const score = this.borderWorth(view, sys.id, across) + (homeBorderToFoe ? 1.5 : 0);
                options.push({ system: sys.id, side, score: score + rnd() * 0.5 });
            }
            const o = this.choose(rnd, options, 'setupStorm');
            if (o) return { cmd: { type: 'setupStorm', system: o.system, side: o.side }, must: true, label: 'setupStorm' };
            return null;
        }
        return null;
    }

    /** The worth of one world to its builder: income, assets and objective space. */
    setupWorldWorth(world) {
        if (!world) return 0;
        return (world.materiel || 0) * 1.5 + (world.assets || []).length * 1.2 + (world.objective ? 1 : 0);
    }

    /** The printed worth of a tile: income, assets and objective spaces. */
    tileWorth(tile) {
        return (tile.areas || []).reduce((sum, area) => sum + this.setupWorldWorth(area.world), 0);
    }

    /**
     * Value the world-to-world links made by a tile at this cell. A rich world
     * on a gold edge to the player's home is especially useful: ground forces
     * can move between those areas without having to cross a void.
     */
    setupEdgeWorth(view, tile, cell, rotation, seat, faction) {
        const edges = [
            { side: 'N', dr: -1, dc: 0 }, { side: 'E', dr: 0, dc: 1 },
            { side: 'S', dr: 1, dc: 0 }, { side: 'W', dr: 0, dc: -1 },
        ];
        const areas = (tile.areas || []).map(a => ({ pos: this.R.rotateArea(a.pos, rotation), world: a.world }));
        let worth = 0;
        for (const edge of edges) {
            const neighbor = view.systems.find(s => Number(s.row) === Number(cell.row) + edge.dr
                && Number(s.col) === Number(cell.col) + edge.dc);
            if (!neighbor) continue;
            const neighborTile = FS_CATALOG.tile(neighbor.tile);
            const neighborHome = neighborTile && neighborTile.home === faction;
            const ownNeighbor = neighbor.owner === seat;
            const candidateHome = tile.home === faction;
            for (const area of areas) {
                if (!area.world) continue;
                for (const other of neighbor.areas || []) {
                    if (!other.world || !TileGeometry.areasTouch(edge.side, area.pos, other.pos)) continue;
                    const value = Math.min(4, this.setupWorldWorth(area.world));
                    worth += 0.8 + value * 0.15; // a continuous world-to-world route
                    if ((neighborHome && !candidateHome) || (candidateHome && ownNeighbor)) {
                        worth += 2 + value * 0.5; // orient valuable worlds toward my home
                    } else if (ownNeighbor) {
                        worth += 0.8 + value * 0.2; // keep my own systems connected
                    }
                }
            }
        }
        return worth;
    }

    /**
     * Capacity the face can contribute toward the starting forces. The rules
     * reject faces that make the whole hand impossible; this bonus prefers
     * those with useful room on this particular tile.
     */
    setupCapacityWorth(view, tile, seat) {
        const R = this.R;
        const initial = view.players[seat].initialForces || { units: {}, structures: {} };
        let groundNeed = 0, shipNeed = 0;
        for (const [id, n] of Object.entries(initial.units || {})) {
            const def = R.unitDef(view, seat, id);
            if (def && def.type === 'ship') shipNeed += n;
            else groundNeed += n;
        }
        const structureNeed = Object.values(initial.structures || {}).reduce((sum, n) => sum + n, 0);
        let groundRoom = 0, shipRoom = 0, worlds = 0;
        for (const area of tile.areas || []) {
            if (area.world) {
                worlds++;
                groundRoom += Math.min(area.world.capacity || R.AREA_CAP, R.AREA_MAX_UNITS);
            } else shipRoom += R.AREA_CAP;
        }
        return Math.min(groundNeed, groundRoom) * 0.3 + Math.min(shipNeed, shipRoom) * 0.3
            + Math.min(structureNeed, worlds) * 0.6;
    }

    /**
     * The home goes first and far from other homes; rich systems are placed by
     * my home, with their richest worlds facing it across a gold border. Poor
     * systems are pushed outward. Every face and quarter-turn is scored, while
     * the rule's force-fit check keeps the remaining hand deployable.
     */
    setupTile(view, rnd) {
        const R = this.R, seat = this.seat;
        const board = BoardSetup.of(view);
        const cells = view.setup.legalCells && view.setup.legalCells.length ? view.setup.legalCells : R.setupLegalCells(view);
        const hand = view.setup.hand || board.hand(seat);
        if (!cells.length || !hand.length) return null;
        const me = view.players[seat];
        const faction = me.faction;
        const mine = view.systems.filter(s => s.owner === seat);
        const theirs = view.systems.filter(s => s.owner !== seat && s.owner !== undefined && s.owner !== null);
        const homeSystem = mine.find(s => {
            const placed = FS_CATALOG.tile(s.tile);
            return placed && placed.home === faction;
        });
        const dist = (c, s) => Math.abs(Number(c.row) - Number(s.row)) + Math.abs(Number(c.col) - Number(s.col));
        const near = (c, list) => (list.length ? Math.min(...list.map(s => dist(c, s))) : null);
        const candidates = [];
        for (let handIndex = 0; handIndex < hand.length; handIndex++) {
            const faces = FS_CATALOG.tileFaces(hand[handIndex]);
            for (const tile of faces) {
                if (!tile || !R.setupForcesFit(view, seat, tile, handIndex, hand)) continue;
                const home = tile.home === faction;
                const rich = this.tileWorth(tile) >= 5;
                const capacityWorth = this.setupCapacityWorth(view, tile, seat);
                for (const cell of cells) for (let rotation = 0; rotation < 4; rotation++) {
                    let score = capacityWorth;
                    const dm = near(cell, mine), dt = near(cell, theirs);
                    if (home) {
                        score += 4;                                    // the home first: the forces land on it
                        if (dt !== null) score += Math.min(4, dt) * 1.5; // far from the others
                        if (dm !== null) score += dm === 1 ? 2 : 0;      // next to my own tiles
                    } else {
                        // A rich tile close to the home; a poor one far from it and close to the others.
                        if (dm !== null) score += rich ? (dm === 1 ? 3 : -dm) : (dm === 1 ? -1 : 1);
                        if (homeSystem) {
                            const dh = dist(cell, homeSystem);
                            score += rich ? (dh === 1 ? 2 : -dh * 0.5) : (dh === 1 ? -0.5 : Math.min(3, dh) * 0.2);
                        }
                        if (dt !== null) score += rich ? Math.min(3, dt) * 0.5 : (dt === 1 ? 2 : 0);
                        if (!mine.length) score -= 2;                     // without a home the rich tile waits
                    }
                    score += this.setupEdgeWorth(view, tile, cell, rotation, seat, faction);
                    candidates.push({ tile: tile.id, cell, rotation, score: score + rnd() * 0.3 });
                }
            }
        }
        const pick = this.choose(rnd, candidates, 'placeSystemTile');
        if (!pick) return null;
        return { cmd: { type: 'placeSystemTile', tile: pick.tile, rotation: pick.rotation,
            row: pick.cell.row, col: pick.cell.col }, must: true, label: 'placeSystemTile' };
    }

    /** The initial forces: the ground units on the worlds with tokens and income, the ships in the void. */
    setupForces(view, rnd) {
        const R = this.R, seat = this.seat;
        const board = BoardSetup.of(view);
        const me = view.players[seat];
        const initial = me.initialForces || { units: {}, structures: {} };
        const sys = R.system(view, board.currentSystem);
        const finish = { type: 'finishSetupForces' };
        if (!sys) return { cmd: finish, must: true, label: 'finishSetupForces' };
        const tile = FS_CATALOG.tile(sys.tile);
        const isHome = !!tile && tile.home === me.faction;
        const placed = (view.setup.placedBySeat || [])[seat] || 0;
        const last = placed >= 3;
        const worldScore = a => (a.world ? (a.world.objective ? 3 : 0) + (a.world.materiel || 0) + (a.world.assets || []).length * 0.5 : 0);
        const placements = [];
        const structId = Object.keys(initial.structures).find(id => initial.structures[id] > 0);
        if (structId) {
            const areas = sys.areas.filter(a => a.world && R.canPlaceStructure(view, seat, sys.id, a.pos, { ignoreControl: true }).ok)
                .map(a => ({ a, score: worldScore(a) + (structId === 'factory' ? (a.world.capacity || 0) : 0) + rnd() * 0.3 })).sort((x, y) => y.score - x.score);
            if (areas.length) placements.push({ type: 'setupStructure', structure: structId, pos: areas[0].a.pos });
        }
        const unitId = Object.keys(initial.units).find(id => initial.units[id] > 0);
        if (unitId) {
            const def = R.unitDef(view, seat, unitId);
            const ground = def.type !== 'ship';
            const areas = sys.areas.filter(a => !!a.world === ground && R.unitsAt(view, sys.id, a.pos).length < R.capacity(view, sys.id, a.pos))
                .map(a => {
                    const here = R.unitsAt(view, sys.id, a.pos).length;
                    // The ground units spread over the worlds (every world of the
                    // home is a world to hold), the ships stay together.
                    const score = ground ? worldScore(a) - here * 2.5 : 1 + here * 0.5;
                    return { a, score: score + rnd() * 0.3 };
                }).sort((x, y) => y.score - x.score);
            if (areas.length) placements.push({ type: 'setupUnit', unit: unitId, pos: areas[0].a.pos });
        }
        // Everything lands on the home (and on the last tile, by the rules); on
        // another tile the forces wait — unless the rules say they would not fit later.
        if (isHome || last) {
            if (placements.length) return { cmd: placements[0], must: true, label: placements[0].type };
            return { cmd: finish, must: true, label: 'finishSetupForces' };
        }
        return { tries: [finish].concat(placements), must: true, label: 'finishSetupForces' };
    }

    /** Whose token goes where: the token of the farthest player, on the world I hold or the poorest one. */
    setupObjective(view, rnd) {
        const R = this.R, seat = this.seat;
        const board = BoardSetup.of(view);
        const options = view.setup.objectiveOptions || [];
        if (!options.length) return null;
        const sys = R.system(view, board.currentSystem);
        const dist = (a, b) => Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
        const candidates = [];
        for (const opt of options) {
            const theirs = view.systems.filter(s => s.owner === opt.seat);
            const far = sys && theirs.length ? Math.min(...theirs.map(s => dist(s, sys))) : 2;
            for (const pos of opt.areas) {
                const area = sys ? R.area(sys, pos) : null;
                const held = sys && view.units.some(u => u.seat === seat && u.system === sys.id && u.area === pos);
                const guarded = sys && view.structures.some(s => s.seat === seat && s.system === sys.id && s.area === pos);
                let score = far * 1.5 + (held ? 2 : 0) + (guarded ? 1 : 0) - (area && area.world ? (area.world.materiel || 0) * 0.3 : 0);
                candidates.push({ opt, pos, score: score + rnd() * 0.3 });
            }
        }
        const pick = this.choose(rnd, candidates, 'setupObjective');
        if (!pick) return null;
        return { cmd: { type: 'setupObjective', seat: pick.opt.seat, faction: pick.opt.faction, pos: pick.pos }, must: true, label: 'setupObjective' };
    }

    /**
     * The worth of a storm on the border between two systems (one may be
     * absent at the edge of the board): good when it stands between an army of
     * another player and my worlds, bad when it cuts my own way to my targets.
     */
    borderWorth(view, aId, bId) {
        if (!aId || !bId) return -0.5;
        const B = this.brain, seat = this.seat;
        const pair = [[aId, bId], [bId, aId]];
        let worth = 0;
        for (const [from, to] of pair) {
            const foes = view.players.filter(p => p.seat !== seat && !p.eliminated);
            let foePower = 0;
            for (const p of foes) foePower += B.presence(view, p.seat, from).power;
            const myStake = this.stakeAt(view, to);
            worth += Math.min(6, foePower * 0.4) * Math.min(3, myStake) * 0.3;
            const myPower = B.presence(view, seat, from).power;
            const interest = this.interestAt(view, to);
            worth -= Math.min(6, myPower * 0.4) * Math.min(3, interest) * 0.35;
        }
        return worth;
    }

    /** What I hold in a system: structures, units, tokens of the others on my worlds. */
    stakeAt(view, systemId) {
        const R = this.R, seat = this.seat;
        let stake = 0;
        for (const s of view.structures) if (s.seat === seat && s.system === systemId) stake += s.type === 'city' ? 1.5 : 1;
        for (const u of view.units) if (u.seat === seat && u.system === systemId) stake += 0.3;
        for (const o of view.objectives || []) if (o.system === systemId && R.objectiveOwnerSeat(view, o) !== seat && R.control(view, seat, o.system, o.area) === 'friendly') stake += 2;
        return stake;
    }

    /** What I want in a system: my tokens there, the enemies there. */
    interestAt(view, systemId) {
        const R = this.R, seat = this.seat;
        let interest = 0;
        for (const o of view.objectives || []) if (o.system === systemId && R.objectiveOwnerSeat(view, o) === seat && R.control(view, seat, o.system, o.area) !== 'friendly') interest += 2;
        for (const u of view.units) if (u.seat !== seat && u.system === systemId) interest += 0.3;
        return interest;
    }

    // --- the planning: where the order tokens go -------------------------------------

    planning(view, rnd) {
        const R = this.R, seat = this.seat;
        const plan = this.plan(view);
        const kinds = ['advance', 'deploy', 'strategize', 'dominate'].filter(k => R.orderLeft(view, seat, k) > 0);
        if (!kinds.length) return null;
        const systems = view.systems.filter(s => R.canPlaceOrder(view, seat, s.id));
        if (!systems.length) return null;
        const round = GamePhase.of(view).round;
        const placed = this.memory.placed[round] || [];
        // The budget of the round: what the orders already laid will spend.
        const me = view.players[seat];
        const budget = { left: (me.materiel || 0) - placed.reduce((s, x) => s + (x.spend || 0), 0),
            deploys: placed.filter(x => x.kind === 'deploy').length, strategizes: placed.filter(x => x.kind === 'strategize').length,
            factories: view.structures.some(s => s.seat === seat && s.type === 'factory') };
        const candidates = [];
        const facts = new Map();
        for (const sys of systems) {
            const f = this.systemFacts(view, sys.id);
            facts.set(sys.id, f);
            for (const kind of kinds) {
                let score = this.orderScore(view, kind, sys, f, plan, budget);
                // The same order twice in one system is worth less; the second
                // advance in the same place is a reserve, not a plan.
                const same = placed.filter(x => x.system === sys.id && x.kind === kind).length;
                if (same) score -= 4 * same;
                candidates.push({ kind, system: sys.id, score });
            }
        }
        const pick = this.choose(rnd, candidates, 'placeOrder');
        if (!pick) return null;
        const f = facts.get(pick.system);
        const spend = pick.kind === 'deploy' ? Math.max(2, Math.min(budget.left, (f.deployLimit || 1) * 3 + 3))
            : pick.kind === 'strategize' ? Math.min(4, Math.max(0, budget.left)) : 0;
        placed.push({ system: pick.system, kind: pick.kind, spend });
        this.memory.placed[round] = placed;
        return { cmd: { type: 'placeOrder', system: pick.system, order: pick.kind }, must: true, label: 'placeOrder' };
    }

    /** The facts of a system the orders are weighed by. */
    systemFacts(view, systemId) {
        const R = this.R, B = this.brain, seat = this.seat;
        const sys = R.system(view, systemId);
        const mine = B.presence(view, seat, systemId);
        const neighbours = R.neighbors(view, systemId).filter(n => !R.stormOn(view, systemId, n));
        const worlds = sys.areas.filter(a => a.world), voids = sys.areas.filter(a => !a.world);
        let foeGround = 0, foeShips = 0, foeValueGround = 0, foeValueShips = 0, foeStructures = 0, foeNear = 0;
        const foeSeats = new Set();
        for (const u of view.units) {
            if (u.seat === seat) continue;
            const def = R.unitOf(view, u);
            if (u.system === systemId) {
                if (def && def.type === 'ship') { foeShips += B.unitPower(def); foeValueShips += B.unitValue(def); }
                else { foeGround += B.unitPower(def); foeValueGround += B.unitValue(def); }
                foeSeats.add(u.seat);
            } else if (neighbours.includes(u.system)) foeNear += B.unitPower(def);
        }
        for (const s of view.structures) {
            if (s.seat === seat) continue;
            if (s.system === systemId) { foeStructures++; foeSeats.add(s.seat); }
        }
        // Who of mine may arrive by an advance here: the ships from the system
        // and its neighbours, the ground units only along a friendly path.
        const arrive = { ground: 0, ships: 0, groundUnits: 0 };
        for (const u of view.units) {
            if (u.seat !== seat || u.routed) continue;
            if (u.system !== systemId && !neighbours.includes(u.system)) continue;
            const def = R.unitOf(view, u);
            if (!def) continue;
            if (def.type === 'ship') { if (voids.length) arrive.ships += B.unitPower(def); }
            else if (worlds.some(a => R.pathExists(view, seat, u.system, u.area, systemId, a.pos))) { arrive.ground += B.unitPower(def); arrive.groundUnits++; }
        }
        const myTargets = [], theirTokens = [];
        for (const o of view.objectives || []) {
            if (o.system !== systemId) continue;
            const owner = R.objectiveOwnerSeat(view, o);
            const control = R.control(view, seat, o.system, o.area);
            if (owner === seat) { if (control !== 'friendly') myTargets.push({ pos: o.area, defence: 0 }); }
            else theirTokens.push({ pos: o.area, owner, mine: control === 'friendly' });
        }
        for (const t of myTargets) for (const s of foeSeats) t.defence += B.powerAt(view, s, systemId, t.pos);
        let income = 0, assets = 0, worldsFree = 0, worldsMine = 0;
        for (const a of worlds) {
            const state = R.areaState(view, seat, systemId, a.pos);
            if (state === 'friendly') { worldsMine++; income += a.world.materiel || 0; assets += (a.world.assets || []).length; }
            else if (state === 'empty' || state === 'uncontrolled') worldsFree += 1 + (a.world.materiel || 0) * 0.5;
        }
        const factory = R.hasFactory(view, seat, systemId);
        const deployLimit = factory ? R.deployLimit(view, seat, systemId) : 0;
        const top = sys.tokens.length ? sys.tokens[sys.tokens.length - 1] : null;
        return { sys, mine, foePower: foeGround + foeShips, foeGround, foeShips, foeValueGround, foeValueShips, foeStructures, foeNear, foeSeats, arrive,
            myTargets, theirTokens, income, assets, worldsFree, worldsMine, factory, deployLimit, neighbours, topFoe: top && top.seat !== seat ? top.seat : null };
    }

    /** The worth of one order in one system for this character and this plan, in materiel. */
    orderScore(view, kind, sys, f, plan, budget) {
        const R = this.R, B = this.brain, seat = this.seat;
        const ch = this.character(view), w = ch.w;
        const phase = GamePhase.of(view);
        const progress = phase.progress || 0;
        const tempo = FS_BOT_PERSONAS.tempoFactor(ch.persona, progress);
        const materiel = Math.max(0, budget.left);
        let score = 0;
        if (kind === 'advance') {
            const land = f.arrive.ground, fleet = f.arrive.ships;
            if (land <= 0 && fleet <= 0) return -6;
            // My tokens here: the main road to the victory (a world is taken by the ground units).
            for (const t of f.myTargets) {
                if (land <= 0) { score += fleet > 0 ? 1.5 : 0; continue; }  // the fleet comes first, the troops after it
                const odds = t.defence > 0 ? B.odds(land, t.defence, true) : 1;
                score += (t.defence > 0 ? 4 + 10 * odds : 10) * w.objective;
                if (plan.kind === 'grab') score += 4;
            }
            // The enemies here: a battle the character may want.
            if (land > 0 && (f.foeGround > 0 || f.foeStructures > 0)) {
                const odds = B.odds(land, f.foeGround, true);
                let battle = (odds - 0.5) * (f.foeValueGround + 4) * 0.8 + f.foeStructures * 1.5 * odds;
                battle *= w.aggression * tempo;
                if (plan.kind === 'attack' && f.foeSeats.has(plan.foe)) battle += 4;
                if (f.theirTokens.some(t => !t.mine)) battle += 2;  // their world with their token: a denial
                if (odds < 0.35) battle -= 4 / w.risk;
                score += battle;
            }
            if (fleet > 0 && f.foeShips > 0) {
                const odds = B.odds(fleet, f.foeShips, true);
                score += ((odds - 0.5) * (f.foeValueShips + 2) * 0.6) * w.aggression * tempo;
            }
            // A free world to take, a token to move towards.
            if (land > 0) score += Math.min(4, f.worldsFree) * 0.8;
            if (!f.myTargets.length && !f.foePower && plan.target) {
                const target = (view.objectives || []).find(o => o.id === plan.target);
                if (target) {
                    const d = B.distances(view, sys.id).get(target.system);
                    if (d !== undefined && land > 0) score += Math.max(0, 3 - d) * w.objective;
                    if (d !== undefined && d <= 1 && fleet > 0 && land <= 0) score += 1.5;  // a bridge of ships towards the token
                }
            }
            // Ships here and enemy worlds next to the void: an orbital strike comes free.
            if (fleet > 0 && f.foeStructures) score += 1.5 + (ch.persona.strikes ? 1.5 : 0);
            // A defence: my world with their token, their army next door.
            if (f.theirTokens.some(t => t.mine) && f.foeNear > f.mine.power) score += 3 * w.turtle + (plan.kind === 'defend' ? 3 : 0);
            // Covering a token of another player delays his order: the cunning like it.
            if (f.topFoe !== null && ch.persona.cover) score += 2;
            return score + 1;
        }
        if (kind === 'deploy') {
            const cities = R.player(view, seat).cities();
            if (!f.factory || f.deployLimit <= 0) {
                // No factory: only a structure may be bought — on a world of mine.
                if (!f.worldsMine || materiel < 2) return -6;
                return 2 + (cities < (ch.build.cities || 2) && materiel >= 3 ? 2 * w.tech : 0) + (!budget.factories ? 3 : 0);
            }
            if (materiel < 2) return -4;
            const spend = Math.min(materiel, f.deployLimit * 3);
            score += spend * 0.6 * (0.6 + 0.4 * w.greed) * (plan.kind === 'build' ? 1.3 : 1);
            if (cities < (ch.build.cities || 2) && materiel >= 3) score += 2 * w.tech;
            if (f.theirTokens.some(t => t.mine) && f.foeNear > 0) score += 2 * w.turtle;
            if (f.myTargets.length || f.foeNear > 0 || f.foePower > 0) score += 1.5;  // the troops are needed here
            // The dial stops at its limit: the materiel above it is lost at the refresh.
            if (materiel + R.materielIncome(view, seat) > 12) score += 4;
            if (!budget.deploys && materiel >= 6) score += 3;
            if (ch.persona.horde) score += 1.5;
            return score;
        }
        if (kind === 'strategize') {
            if (!f.mine.units.length && !f.mine.structures.length) return -6;
            if (budget.strategizes) return -4;
            const cl = R.commandLevel(view, seat);
            const wanted = this.wantedUpgrades(view, cl).filter(u => u.price <= materiel);
            if (!wanted.length) return -3;
            score += 2 + wanted[0].score * 0.5 * w.tech;
            if (plan.kind === 'build') score += 1;
            if (f.topFoe !== null && ch.persona.cover) score += 1.5;
            return score;
        }
        if (kind === 'dominate') {
            if (!f.worldsMine) return -6;
            score += f.assets * 2.2 * w.greed;
            const player = R.player(view, seat);
            if (!['forge', 'cache', 'reinforcement'].some(k => player.hasRoomFor(k))) score -= f.assets * 1.5;
            // «Споры орков»: a unit for free of the order; «Тёмный Портал»: a regrouping.
            if (ch.persona.horde && materiel >= 2) score += 3;
            if (ch.persona.stack) score += 1;
            if (f.foePower > 0) score -= 1;
            return score + 0.5;
        }
        return 0;
    }

    // --- the operations: the orders are resolved ----------------------------------------

    operations(view, rnd) {
        const R = this.R, seat = this.seat;
        if (!view.order) {
            const systems = view.systems.filter(s => s.tokens.length && s.tokens[s.tokens.length - 1].seat === seat);
            if (!systems.length) return null;
            // The order whose kind I know (the top one shows its face to me): the
            // deploy before the advance, the dominate last.
            const rank = { deploy: 3, strategize: 2, advance: 1, dominate: 0 };
            const candidates = systems.map(s => {
                const top = s.tokens[s.tokens.length - 1];
                const f = this.systemFacts(view, s.id);
                let score = (rank[top.order] === undefined ? 1 : rank[top.order]) * 2;
                if (top.order === 'advance' && f.foeNear > f.mine.power) score += 2; // strike before they come
                return { system: s.id, score };
            });
            const pick = this.choose(rnd, candidates, 'resolveOrder');
            return { cmd: { type: 'resolveOrder', system: pick.system, toEventDeck: false }, must: true, label: 'resolveOrder' };
        }
        const order = view.order;
        const context = OrderContext.of(order);
        if (!context.isSeat(seat)) return null;
        const kind = context.kind;
        const plan = PhasePlan.of(order);
        if (plan.is('guardDeploy')) return this.guardDeploy(view, rnd);
        // An upgrade of this kind of order — while the order runs.
        const burn = this.useUpgrade(view, rnd, kind);
        if (burn) return burn;
        if (kind === 'advance') return this.advance(view, rnd, order);
        if (kind === 'deploy') return this.deploy(view, rnd, order);
        if (kind === 'strategize') return this.strategize(view, rnd, order);
        if (kind === 'dominate') return this.dominate(view, rnd, order);
        return null;
    }

    /** The upgrades of the orders of this player that were not spent this round. */
    unusedUpgrades(view) {
        const p = view.players[this.seat];
        return (p.upgrades || []).filter(u => !u.used).map(u => ({ name: u.name, card: FS_CATALOG.card('orders', p.faction, u.name) }));
    }

    useUpgrade(view, rnd, kind) {
        const R = this.R;
        const phasePlan = PhasePlan.of(view.order);
        const upgradeOrder = UpgradeOrder.of(view.order);
        const strike = kind === 'advance' && phasePlan.is('strike');
        const wanted = kind === 'advance' ? (strike ? ['orbital'] : ['advance']) : [kind];
        const cards = this.unusedUpgrades(view).filter(u => u.card && wanted.includes(u.card.order))
            // «Миры-гробницы» come after a purchase of the order.
            .filter(u => !/миры-гробницы/i.test(u.name) || !Purchases.of(view.order).empty)
            // These cards have narrower windows than their printed order icon.
            .filter(u => u.name !== 'Рейд корсаров' || phasePlan.is('corsair'))
            .filter(u => u.name !== 'Святой трубопровод' || R.pipelineReady(view, this.seat))
            .filter(u => u.name !== 'Зеленая волна' || !(upgradeOrder.combat || upgradeOrder.orderCard));
        if (!cards.length) return null;
        // One attempt per step: a refusal of the rules is not a failure.
        const key = 'upgrade:' + GamePhase.of(view).round + ':' + kind + ':' + OrderContext.of(view.order).system;
        const fresh = cards.filter(u => !this.tried.has(key + ':' + u.name));
        if (!fresh.length) return null;
        // An upgrade is a card bought to be used: the only reason to keep it is
        // an order where it does nothing (an advance without an enemy in reach).
        const f = this.systemFacts(view, OrderContext.of(view.order).system);
        const useful = kind !== 'advance' || strike || f.foePower > 0 || f.foeStructures > 0 || f.foeNear > 0 || f.myTargets.length > 0;
        if (!useful && !botChance(rnd, 0.3)) return null;
        const u = botPick(rnd, fresh);
        this.tried.add(key + ':' + u.name);
        return { cmd: { type: 'useUpgrade', card: u.name }, must: false, label: 'useUpgrade' };
    }

    enemyAt(view, system, pos) {
        const seat = this.seat;
        return view.units.some(u => u.seat !== seat && u.system === system && u.area === pos)
            || view.structures.some(s => s.seat !== seat && s.system === system && s.area === pos);
    }

    advance(view, rnd, order) {
        const R = this.R, seat = this.seat;
        const plan = PhasePlan.of(order);
        const march = MarchPlan.of(order);
        const active = OrderContext.of(order).system;
        if (plan.is('move')) {
            const key = 'move:' + GamePhase.of(view).round + ':' + active + ':' + march.step + ':' + march.moved.length;
            this.attempts[key] = (this.attempts[key] || 0) + 1;
            if (this.attempts[key] <= 3) {
                const pick = this.marchChoice(view, rnd, order);
                if (pick) return { cmd: { type: 'moveUnits', moves: pick.moves }, must: false, label: 'moveUnits', hostile: pick.hostile };
            }
            return { cmd: { type: 'endAdvance' }, must: true, label: 'endAdvance' };
        }
        if (plan.is('strike')) {
            const targets = R.orbitalStrikeTargets(view, seat);
            if (targets.length) {
                const candidates = targets.map(t => ({ t, score: this.strikeWorth(view, t) }));
                const pick = this.choose(rnd, candidates, 'orbitalStrike');
                return { tries: [{ type: 'orbitalStrike', system: pick.t.system, pos: pick.t.pos }, { type: 'finishAdvance' }], must: true, label: 'orbitalStrike' };
            }
            return { cmd: { type: 'finishAdvance' }, must: true, label: 'finishAdvance' };
        }
        if (plan.is('corsair')) return { cmd: { type: 'finishAdvance' }, must: true, label: 'finishAdvance' };
        return { tries: [{ type: 'finishAdvance' }, { type: 'endAdvance' }], must: true, label: 'finishAdvance' };
    }

    /** The worth of an orbital strike on a world: the pieces of the others standing there. */
    strikeWorth(view, t) {
        const R = this.R, B = this.brain, seat = this.seat;
        let worth = 1;
        for (const u of view.units) if (u.seat !== seat && u.system === t.system && u.area === t.pos) worth += B.unitValue(R.unitOf(view, u)) * 0.5;
        for (const s of view.structures) if (s.seat !== seat && s.system === t.system && s.area === t.pos) worth += s.type === 'city' ? 2 : 1.5;
        const myToken = (view.objectives || []).some(o => o.system === t.system && o.area === t.pos && R.objectiveOwnerSeat(view, o) === seat);
        if (myToken) worth += 3;
        return worth;
    }

    /**
     * May this unit still come into the active system under the rule of the
     * single neighbouring system? The ground troops and the ships of an order
     * come from one neighbour, and the way of the first command binds the rest.
     */
    wayOpen(order, active, unit) {
        if (unit.system === active) return true;
        const move = OrderMove.of(order);
        if (move.extraWays) return true;
        return move.wayAllows('ground', unit.system) && move.wayAllows('ship', unit.system);
    }

    /**
     * One march of the active order: the areas of the system a unit may enter,
     * the groups of units that may go there, each scored for the character;
     * `null` when staying is the best.
     */
    marchChoice(view, rnd, order) {
        const R = this.R, B = this.brain, seat = this.seat;
        const march = MarchPlan.of(order);
        const active = OrderContext.of(order).system;
        const sys = R.system(view, active);
        const units = R.movableUnits(view, seat);
        if (!units.length || !sys) return null;
        const ch = this.character(view), w = ch.w;
        const plan = this.plan(view);
        const phase = GamePhase.of(view);
        const tempo = FS_BOT_PERSONAS.tempoFactor(ch.persona, phase.progress || 0);
        const contestedKey = march.contested;
        const candidates = [{ moves: null, score: 1 }];  // staying is always on the table
        const targetSystem = plan.target ? ((view.objectives || []).find(o => o.id === plan.target) || {}).system : null;
        const distToTarget = targetSystem ? B.distances(view, targetSystem) : null;
        for (const area of sys.areas) {
            const hostile = this.enemyAt(view, sys.id, area.pos);
            if (hostile && contestedKey && contestedKey !== sys.id + ':' + area.pos) continue;
            const can = units.filter(u => R.canMove(view, seat, u, { system: sys.id, pos: area.pos }).ok && this.wayOpen(order, active, u));
            if (!can.length) continue;
            const capacity = R.capacity(view, sys.id, area.pos);
            const already = R.unitsAt(view, sys.id, area.pos).filter(u => u.seat === seat);
            // A march may exceed the capacity (the extra is trimmed after the
            // order), never the five-unit limit: into a battle the limit rules,
            // into a free world the capacity does.
            const limit = R.unitLimit(view, sys.id, area.pos, seat);
            const room = Math.max(0, hostile ? limit : Math.min(capacity - already.length, limit));
            if (!room) continue;
            // The groups: the dearest first, so that the strongest go into a
            // battle; from one area — everything, everything but a guard, one
            // unit; from all the areas at once — everything that fits.
            const byPower = list => list.slice().sort((a, b) => B.unitPower(R.unitOf(view, b)) - B.unitPower(R.unitOf(view, a)));
            const groups = [];
            const sources = new Map();
            for (const u of can) {
                const key = u.system + ':' + u.area;
                if (!sources.has(key)) sources.set(key, []);
                sources.get(key).push(u);
            }
            for (const list of sources.values()) {
                const sorted = byPower(list);
                const sizes = new Set([Math.min(room, sorted.length), 1]);
                if (sorted.length >= 2) sizes.add(Math.min(room, sorted.length - 1));
                for (const size of sizes) if (size > 0) groups.push(sorted.slice(0, size));
            }
            if (sources.size > 1) {
                // All the areas at once — of the active system and of one
                // neighbour (the rule of the single neighbouring system).
                const ways = new Set(can.filter(u => u.system !== active).map(u => u.system));
                for (const way of ways.size ? ways : [null]) {
                    const group = byPower(can.filter(u => u.system === active || u.system === way)).slice(0, room);
                    if (group.length) groups.push(group);
                }
            }
            if (hostile) {
                // Enough to win with a margin, not a unit more than the world holds after the battle.
                let theirPower = 0;
                for (const s of R.warSeatsAt(view, sys.id, area.pos)) if (s !== seat) theirPower += B.powerAt(view, s, sys.id, area.pos);
                const ways = new Set(can.filter(u => u.system !== active).map(u => u.system));
                const way = [...ways].sort((a, b) => B.powerOf(view, can.filter(u => u.system === b)) - B.powerOf(view, can.filter(u => u.system === a)))[0] || null;
                const sorted = byPower(can.filter(u => u.system === active || u.system === way));
                let power = B.powerOf(view, already);
                const enough = [];
                for (const u of sorted) {
                    if (enough.length >= room) break;
                    if (B.odds(power, theirPower, true) >= 0.8 && enough.length >= Math.max(1, capacity - already.length)) break;
                    enough.push(u);
                    power += B.unitPower(R.unitOf(view, u));
                }
                if (enough.length) groups.push(enough);
            }
            const seen = new Set();
            for (const group of groups) {
                if (march.mustInclude && !group.some(u => {
                    const def = R.unitOf(view, u);
                    return !!def && FS_EFFECTS.sameName(def.name, march.mustInclude);
                })) continue;
                const key = group.map(u => u.id).sort().join(',');
                if (seen.has(key)) continue;
                seen.add(key);
                const score = this.marchWorth(view, sys, area, group, already, hostile, { w, ch, plan, tempo, distToTarget });
                candidates.push({ moves: group.map(u => ({ unit: u.id, system: sys.id, pos: area.pos })), hostile, score });
            }
        }
        const pick = this.choose(rnd, candidates, 'moveUnits');
        return pick && pick.moves ? pick : null;
    }

    /** The worth of one group entering one area, in materiel. */
    marchWorth(view, sys, area, group, already, hostile, ctx) {
        const R = this.R, B = this.brain, seat = this.seat;
        const { w, ch, plan, tempo, distToTarget } = ctx;
        const defs = group.map(u => R.unitOf(view, u));
        const groupPower = defs.reduce((s, d) => s + B.unitPower(d), 0);
        const groupValue = defs.reduce((s, d) => s + B.unitValue(d), 0);
        const ground = defs.some(d => d && d.type !== 'ship');
        const myToken = (view.objectives || []).find(o => o.system === sys.id && o.area === area.pos && R.objectiveOwnerSeat(view, o) === seat);
        const theirToken = (view.objectives || []).find(o => o.system === sys.id && o.area === area.pos && R.objectiveOwnerSeat(view, o) !== seat);
        const objW = w.objective * (1 + (GamePhase.of(view).progress || 0));
        let score = 0;
        if (hostile) {
            const foes = [...R.warSeatsAt(view, sys.id, area.pos)].filter(s => s !== seat);
            let theirPower = 0, theirValue = 0;
            for (const s of foes) {
                theirPower += B.powerAt(view, s, sys.id, area.pos);
                for (const u of view.units) if (u.seat === s && u.system === sys.id && u.area === area.pos) theirValue += B.unitValue(R.unitOf(view, u));
                for (const st of view.structures) if (st.seat === s && st.system === sys.id && st.area === area.pos) theirValue += st.type === 'city' ? 3 : 2;
            }
            const myPower = groupPower + B.powerOf(view, already);
            const odds = B.odds(myPower, theirPower, true);
            let prize = theirValue * 0.8 + (area.world ? (area.world.materiel || 0) * 1.5 : 0);
            if (myToken && area.world) prize += 20 * objW;
            if (theirToken && area.world) prize += 6;
            const risk = (groupValue + B.powerOf(view, already)) * 0.8;
            score += odds * prize - (1 - odds) * risk / Math.max(0.5, w.risk);
            score += (w.aggression - 1) * 3 * tempo;
            if (odds < 0.35) score -= 6 / Math.max(0.5, w.risk);
            if (plan.kind === 'attack' && foes.includes(plan.foe)) score += 3;
            if (plan.kind === 'grab' && myToken) score += 3;
            // The void: a battle of ships has no world to win — only when they block the way.
            if (!area.world) score -= 2;
        } else {
            if (area.world) {
                const control = R.control(view, seat, sys.id, area.pos);
                if (myToken && ground && control !== 'friendly') score += 18 * objW + (plan.kind === 'grab' ? 3 : 0);
                if (control !== 'friendly' && ground) score += 1 + (area.world.materiel || 0) * 1.5 + (area.world.assets || []).length;
                if (theirToken && control === 'friendly' && ground) score += 2 * w.turtle; // a guard for their token
                if (!ground) score -= 3;  // a ship cannot enter a world; the rules refuse anyway
            } else {
                score += 0.3;
                // Ships over an enemy world: the strike and the blockade.
                const around = R.areasAround(view, sys.id, area.pos);
                const inside = around.filter(a => a.system === sys.id);
                if (inside.some(a => R.areaState(view, seat, a.system, a.pos) === 'enemy')) score += 1.5 + (ch.persona.strikes ? 1.5 : 0);
                // The bridge: a friendly void joins my ground troops across the
                // border with the worlds next to it — the way the army marches.
                const troopsTouch = around.some(a => a.system !== sys.id && view.units.some(u => u.seat === seat && !u.routed
                    && u.system === a.system && u.area === a.pos && (R.unitOf(view, u) || {}).type !== 'ship'));
                let interest = 0;
                for (const a of inside) {
                    const world = R.area(sys, a.pos);
                    if (!world || !world.world) continue;
                    const state = R.areaState(view, seat, sys.id, a.pos);
                    if ((view.objectives || []).some(o => o.system === sys.id && o.area === a.pos && R.objectiveOwnerSeat(view, o) === seat) && state !== 'friendly') interest += 6 * objW;
                    else if (state === 'enemy') interest += 2;
                    else if (state !== 'friendly') interest += 1;
                }
                score += troopsTouch ? interest : interest * 0.2;
            }
            // Closer to the target of the plan.
            if (distToTarget) {
                const from = group[0];
                const before = distToTarget.get(from.system), after = distToTarget.get(sys.id);
                if (before !== undefined && after !== undefined && after < before) score += (before - after) * 2 * objW;
            }
        }
        // What the group leaves behind: a world that nobody of mine holds any
        // more loses its income; a world with their token loses its guard.
        const sources = new Map();
        for (const u of group) sources.set(u.system + ':' + u.area, u);
        for (const u of sources.values()) {
            const left = view.units.some(x => x.seat === seat && x.system === u.system && x.area === u.area && !group.includes(x));
            const structures = view.structures.some(s => s.seat === seat && s.system === u.system && s.area === u.area);
            if (left || structures) continue;
            const from = R.area(R.system(view, u.system), u.area);
            if (from && from.world) {
                score -= 1 + (from.world.materiel || 0) * 1.5 + (from.world.assets || []).length;
                const theirs = (view.objectives || []).find(o => o.system === u.system && o.area === u.area && R.objectiveOwnerSeat(view, o) !== seat);
                if (theirs) {
                    const threat = B.reach(view, R.objectiveOwnerSeat(view, theirs), u.system).near;
                    score -= (threat > 0 ? 6 : 2) * w.turtle;
                }
                const mine = (view.objectives || []).some(o => o.system === u.system && o.area === u.area && R.objectiveOwnerSeat(view, o) === seat);
                if (mine) score -= 18 * objW;  // my own token, held until the refresh collects it
            }
        }
        // A bigger group breaks the ties of a free march; the phalanx moves as
        // one; the horde pours everything forward.
        if (!hostile) score += group.length * 0.1;
        if (ch.persona.stack) score += group.length >= 3 ? 1.5 : (group.length === 1 ? -1.5 : 0);
        if (ch.persona.horde && hostile) score += group.length * 0.4;
        return score;
    }

    deploy(view, rnd, order) {
        const R = this.R, seat = this.seat;
        const active = OrderContext.of(order).system;
        const sys = R.system(view, active);
        const p = view.players[seat];
        const step = R.deployStep(order);
        const bought = Purchases.of(order).list.length;
        if (step === 'units') {
            const key = 'buy:' + GamePhase.of(view).round + ':' + active + ':' + bought;
            this.attempts[key] = (this.attempts[key] || 0) + 1;
            const limitLeft = R.deployLimit(view, seat, sys.id) - R.unitsBought(order);
            if (this.attempts[key] <= 4 && R.hasFactory(view, seat, sys.id) && limitLeft > 0) {
                const pick = this.purchaseChoice(view, rnd, order, sys);
                if (pick && pick.unit) return { cmd: { type: 'buyUnit', unit: pick.unit, system: sys.id, pos: pick.pos, cache: pick.cache }, must: false, label: 'buyUnit' };
                if (pick && pick.structure) return { cmd: { type: 'buyStructure', kind: pick.structure, system: sys.id, pos: pick.pos, cache: pick.cache }, must: false, label: 'buyStructure' };
            }
            return { cmd: { type: 'deployStructures' }, must: true, label: 'deployStructures' };
        }
        const key = 'struct:' + GamePhase.of(view).round + ':' + active + ':' + bought;
        this.attempts[key] = (this.attempts[key] || 0) + 1;
        if (this.attempts[key] <= 3 && !Purchases.of(order).hasStructure) {
            const pick = this.structureChoice(view, rnd, sys, p.materiel - R.spentOf(order));
            if (pick) return { cmd: { type: 'buyStructure', kind: pick.structure, system: sys.id, pos: pick.pos, cache: pick.cache }, must: false, label: 'buyStructure' };
        }
        return { cmd: { type: 'finishDeploy' }, must: true, label: 'finishDeploy' };
    }

    /** The worth of one more unit of this kind to the character, before its price. */
    unitWant(view, def, sys, pos) {
        const R = this.R, B = this.brain, seat = this.seat;
        const ch = this.character(view), w = ch.w;
        const plan = this.plan(view);
        const like = ch.likes.units[def.id] === undefined ? 1 : ch.likes.units[def.id];
        let want = B.unitValue(def) * like;
        const ground = def.type !== 'ship';
        const ships = view.units.filter(u => u.seat === seat && (R.unitOf(view, u) || {}).type === 'ship').length;
        if (!ground && ships < 2) want += ships ? 1.5 : 3;   // the fleet is the bridge of the ground troops across the void
        if (!ground && ch.persona.strikes) want += 1;
        if (ground && (plan.kind === 'grab' || plan.kind === 'defend')) want += 1;
        if (!ground && plan.kind === 'build') want -= 1;
        // The big ones late, the small ones early: a greedy character waits for the titan.
        if ((def.kl || 0) >= 2) want += (GamePhase.of(view).progress || 0) * 2 * w.tech;
        // A world with their token: a guard; a world with my units already: a stack.
        const theirToken = (view.objectives || []).some(o => o.system === sys.id && o.area === pos && R.objectiveOwnerSeat(view, o) !== seat);
        if (ground && theirToken) want += 1.5 * w.turtle;
        return want;
    }

    /** What to buy now: a unit (where) or a structure (where), or nothing. */
    purchaseChoice(view, rnd, order, sys) {
        const R = this.R, seat = this.seat;
        const ch = this.character(view), w = ch.w;
        const p = view.players[seat];
        const left = p.materiel - R.spentOf(order);
        const cl = R.commandLevel(view, seat);
        const player = R.player(view, seat);
        const caches = player.assetCount('cache');
        const forge = player.assetCount('forge');
        const price = 0.45 + 0.25 * w.greed;
        const candidates = [{ score: 0.5 + (left < 4 ? 1 : 0) }];
        const defs = R.faction(view, seat).units.filter(d => (p.supply.units[d.id] || 0) > 0
            && (d.kl || 0) <= cl && (!d.forge || forge > 0));
        for (const def of defs) {
            for (const cache of caches > 0 ? [false, true] : [false]) {
                const cost = R.unitPrice(view, seat, def, { cache });
                if (cost > left) continue;
                for (const area of sys.areas) {
                    if (!!area.world !== (def.type !== 'ship')) continue;
                    if (!R.canPlaceUnit(view, seat, sys.id, area.pos, def).ok) continue;
                    let score = this.unitWant(view, def, sys, area.pos) - cost * price;
                    if (cache) score -= 2.2 - (def.cost >= 4 ? 0.8 : 0);  // the cache is worth two materiel; spend it on the dear ones
                    candidates.push({ unit: def.id, pos: area.pos, cache, score });
                }
            }
        }
        // A structure wanted more than any unit: with the card it is bought now,
        // otherwise the materiel is kept for the step of the structures.
        const structures = Purchases.of(order).hasStructure ? [] : this.structureCandidates(view, sys, left);
        if (OrderDeal.of(order).structureFirst) for (const c of structures) candidates.push(c);
        else if (structures.length) {
            const best = structures.slice().sort((a, b) => b.score - a.score)[0];
            candidates.push({ reserve: true, score: best.score });
        }
        const pick = this.choose(rnd, candidates, 'buyUnit');
        return pick && (pick.unit || pick.structure) ? pick : null;
    }

    /** The structures worth buying in this system now, each with its place. */
    structureCandidates(view, sys, left) {
        const R = this.R, B = this.brain, seat = this.seat;
        const ch = this.character(view), w = ch.w;
        const progress = GamePhase.of(view).progress || 0;
        const cities = R.player(view, seat).cities();
        const factories = view.structures.filter(s => s.seat === seat && s.type === 'factory');
        const caches = R.player(view, seat).assetCount('cache');
        const out = [];
        for (const type of ['city', 'factory', 'bastion']) {
            for (const cache of caches > 0 ? [false, true] : [false]) {
                const cost = R.structurePrice(view, seat, type, { cache });
                if (cost > left) continue;
                for (const area of sys.areas) {
                    if (!area.world || !R.canPlaceStructure(view, seat, sys.id, area.pos).ok) continue;
                    let want = 0;
                    const theirToken = (view.objectives || []).find(o => o.system === sys.id && o.area === area.pos && R.objectiveOwnerSeat(view, o) !== seat);
                    if (type === 'city') {
                        if (cities >= 3) want = -2;
                        else want = (4 + (3 - cities)) * w.tech * (1.3 - progress) * (cities >= (ch.build.cities || 2) ? 0.5 : 1);
                        if (!cities) want += 3;  // the first city is the first command level
                    } else if (type === 'factory') {
                        // A factory on a new world adds its capacity to the deploy limit; a second one on the same world doubles it.
                        const onWorld = factories.some(f => f.system === sys.id && f.area === area.pos);
                        want = !factories.length ? 7 : (onWorld ? 1 : 2 * w.greed + (area.world.capacity || 0) * 0.5);
                        if (ch.persona.horde && factories.length < 3) want += 1.5;
                        if (factories.length >= 4) want -= 3;
                    } else {
                        if (theirToken) {
                            const threat = B.reach(view, R.objectiveOwnerSeat(view, theirToken), sys.id).near;
                            want = 3 * w.turtle + (threat > 0 ? 2 : 0) + ((ch.build.bastions || 0) > 0 ? 1.5 : 0);
                        } else want = 0.5 * w.turtle;
                    }
                    let score = want - cost * (0.45 + 0.25 * w.greed);
                    if (cache) score -= 2.2;
                    out.push({ structure: type, pos: area.pos, cache, score });
                }
            }
        }
        return out;
    }

    structureChoice(view, rnd, sys, left) {
        const candidates = this.structureCandidates(view, sys, left);
        candidates.push({ score: 1 });
        const pick = this.choose(rnd, candidates, 'buyStructure');
        return pick && pick.structure ? pick : null;
    }

    guardDeploy(view, rnd) {
        const R = this.R, seat = this.seat;
        const order = view.order;
        const bought = Purchases.of(order).units.length;
        const key = 'guard:' + GamePhase.of(view).round + ':' + bought;
        if (!this.tried.has(key) && bought < 2) {
            this.tried.add(key);
            const sys = R.system(view, OrderContext.of(order).system);
            const p = view.players[seat];
            const left = p.materiel - R.spentOf(order);
            const cl = R.commandLevel(view, seat);
            const scope = DeployScope.of(order);
            const forge = R.player(view, seat).assetCount('forge');
            const defs = R.faction(view, seat).units.filter(d => d.type !== 'ship'
                && (p.supply.units[d.id] || 0) > 0 && (d.kl || 0) <= cl
                && (!d.forge || forge > 0) && (!scope.lockedType || d.id === scope.lockedType));
            // «Массовое Производство»: the one factory produces into its own world.
            const factory = scope.factory;
            const worlds = factory && factory.system === sys.id ? sys.areas.filter(a => a.pos === factory.pos) : sys.areas.filter(a => a.world);
            const candidates = [{ score: 1 }];
            for (const def of defs) {
                const cost = R.unitPrice(view, seat, def, {});
                if (cost > left) continue;
                for (const area of worlds) candidates.push({ unit: def.id, pos: area.pos, score: this.unitWant(view, def, sys, area.pos) - cost * 0.6 });
            }
            const pick = this.choose(rnd, candidates, 'guardDeploy');
            if (pick && pick.unit) return { cmd: { type: 'buyUnit', unit: pick.unit, system: sys.id, pos: pick.pos }, must: false, label: 'buyUnit' };
        }
        if (bought === 1) return { tries: [{ type: 'finishGuardDeploy' }, { type: 'undoPurchase' }], must: true, label: 'finishGuardDeploy' };
        return { cmd: { type: 'finishGuardDeploy' }, must: true, label: 'finishGuardDeploy' };
    }

    /** The upgrades the character wants now, best first: `{kind, name, score, price}`. */
    wantedUpgrades(view, cl) {
        const R = this.R, B = this.brain, seat = this.seat;
        const ch = this.character(view), w = ch.w;
        const p = view.players[seat];
        const out = [];
        const have = {};
        for (const name of p.decksCombatKnown || []) have[name] = (have[name] || 0) + 1;
        for (const card of FS_CATALOG.upgradeCombatCards(p.faction)) {
            if ((have[card.name] || 0) >= 2 || card.kl > cl) continue;
            const icons = card.icons || {};
            let score = (icons.att || 0) * 1.2 + (icons.def || 0) + (icons.morale || 0) * 0.8 + B.textWorth(card.general) + 0.6 * B.textWorth(card.unit);
            if (ch.likes.combat.includes(card.name)) score += 2.5;
            // The unit ability wants its unit on the board.
            if (card.unit && card.reqs && card.reqs.length) {
                const owns = view.units.some(u => u.seat === seat && card.reqs.includes((R.unitOf(view, u) || {}).name));
                score += owns ? 0.8 : -0.8;
            }
            if ((have[card.name] || 0) === 1) score -= 1;
            const price = R.cardPrice(view, seat, card);
            out.push({ kind: 'combat', name: card.name, score: score * w.tech - price * 0.4, price });
        }
        const owned = new Set((p.upgrades || []).map(u => u.name));
        for (const card of FS_CATALOG.orderCards(p.faction)) {
            if (owned.has(card.name) || card.kl > cl) continue;
            let score = 2.5 + B.textWorth(card.text) * 0.5;
            if (ch.likes.orders.includes(card.name)) score += 3;
            if (card.order === 'orbital' && !ch.persona.strikes) score -= 1;
            const price = R.cardPrice(view, seat, card);
            out.push({ kind: 'order', name: card.name, score: score * w.tech - price * 0.4, price });
        }
        return out.sort((a, b) => b.score - a.score);
    }

    strategize(view, rnd, order) {
        const R = this.R, seat = this.seat;
        const p = view.players[seat];
        const key = 'strat:' + GamePhase.of(view).round + ':' + OrderContext.of(order).system;
        this.attempts[key] = (this.attempts[key] || 0) + 1;
        const present = R.board(view).hasUnitsOrStructures(seat, OrderContext.of(order).system);
        const upgrades = UpgradeOrder.of(order);
        if (present && this.attempts[key] <= 4 && !upgrades.full) {
            const cl = R.commandLevel(view, seat);
            const wanted = this.wantedUpgrades(view, cl).filter(u => u.price <= p.materiel && !this.tried.has(key + ':' + u.kind + ':' + u.name)
                && (u.kind === 'combat' ? !upgrades.combat : !upgrades.orderCard));
            const candidates = wanted.map(u => ({ u, score: u.score }));
            // Keeping the materiel for the troops is a move too.
            candidates.push({ u: null, score: p.materiel < 5 ? 2.5 : 1 });
            const pick = this.choose(rnd, candidates, 'buyUpgrade');
            if (pick && pick.u) {
                this.tried.add(key + ':' + pick.u.kind + ':' + pick.u.name);
                return { cmd: { type: 'buyUpgrade', kind: pick.u.kind, card: pick.u.name }, must: false, label: 'buyUpgrade' };
            }
        }
        return { cmd: { type: 'finishStrategize' }, must: true, label: 'finishStrategize' };
    }

    dominate(view, rnd, order) {
        const R = this.R, seat = this.seat;
        const tally = OrderTally.of(order);
        if (tally.prosperity > 0) {
            const player = R.player(view, seat);
            const kinds = ['forge', 'cache', 'reinforcement'].filter(k => player.hasRoomFor(k));
            if (kinds.length) return { cmd: { type: 'takeProsperity', asset: this.assetAnswer(view, kinds, rnd) }, must: false, label: 'takeProsperity' };
        }
        return { cmd: { type: 'finishDominate', skip: false }, must: true, label: 'finishDominate' };
    }

    // --- the refresh: the storms and the events -----------------------------------------

    refresh(view, rnd) {
        const R = this.R, seat = this.seat;
        const event = EventPhase.of(view);
        if (!event.current) return { cmd: { type: 'nextPhase' }, must: true, label: 'nextPhase' };
        if (!event.isSeat(seat)) return null;
        if (EventRound.of(view).left <= 0) return { cmd: { type: 'nextPhase' }, must: true, label: 'nextPhase' };
        if (!event.stormMoved) {
            const opts = R.stormOptions(view, seat);
            if (opts.length) {
                const candidates = opts.map(o => {
                    const from = (view.storms || []).find(s => s.id === o.storm);
                    const was = from && from.tiles ? this.borderWorth(view, from.tiles[0], from.tiles[1]) : 0;
                    const now = o.target && o.target.tiles ? this.borderWorth(view, o.target.tiles[0], o.target.tiles[1]) : 0;
                    return { o, score: now - was + rnd() * 0.2 };
                });
                const pick = this.choose(rnd, candidates, 'moveStorm');
                return { cmd: { type: 'moveStorm', storm: pick.o.storm, dir: pick.o.dir }, must: true, label: 'moveStorm' };
            }
        }
        if ((event.drawn || []).length && !event.chosen) {
            return { cmd: { type: 'drawEvent', card: botPick(rnd, event.drawn) }, must: true, label: 'drawEvent' };
        }
        return { cmd: { type: 'resolveEvent' }, must: true, label: 'resolveEvent' };
    }

    // --- the battle --------------------------------------------------------------------

    combat(view, rnd) {
        const R = this.R, B = this.brain, seat = this.seat;
        const c = view.combat;
        const turn = CombatTurn.of(c);
        const step = turn.step;
        const sideOf = s => (s.endsWith('attacker') ? 'attacker' : 'defender');
        const ch = this.character(view), w = ch.w;
        if (step === 'reinforce-attacker' || step === 'reinforce-defender') {
            const side = sideOf(step);
            if (CombatSides.seatOf(c, side) !== seat) return null;
            // The one who attacked me is remembered.
            if (side === 'defender') {
                const foe = CombatSides.seatOf(c, 'attacker');
                this.memory.grudges[foe] = (this.memory.grudges[foe] || 0) + 1;
            }
            const max = R.maxReinforce(view, seat, side);
            let count = 0;
            if (max > 0) {
                const field = BattleField.of(c);
                const foeSeat = CombatSides.seatOf(c, CombatSides.foe(side));
                const mine = B.powerAt(view, seat, field.system, field.pos);
                const theirs = B.powerAt(view, foeSeat, field.system, field.pos);
                const odds = B.odds(mine, theirs, side === 'attacker');
                const closeness = 1 - Math.min(1, Math.abs(odds - 0.5) * 2.2);
                const myToken = (view.objectives || []).some(o => o.system === field.system && o.area === field.pos && R.objectiveOwnerSeat(view, o) === seat);
                const stake = 1 + (myToken ? 1 : 0) + (side === 'defender' ? 0.5 : 0);
                const candidates = [];
                for (let k = 0; k <= max; k++) candidates.push({ count: k, score: k * 1.4 * closeness * stake - k * (0.8 + 0.4 * w.turtle) * 0.6 });
                count = (this.choose(rnd, candidates, 'reinforce') || { count: 0 }).count;
            }
            return { tries: [{ type: 'combat', action: 'reinforce', count }, { type: 'combat', action: 'reinforce', count: 0 }], must: true, label: 'reinforce', count };
        }
        if (step === 'choose-attacker' || step === 'choose-defender') {
            const side = sideOf(step);
            if (CombatSides.seatOf(c, side) !== seat) return null;
            const hand = CombatCards.of(c).hand(side) || [];
            if (!hand.length) return { advance: true, label: 'playCard' };
            const faction = view.players[seat].faction;
            const candidates = hand.map((name, index) => {
                const card = FS_CATALOG.card('combat', faction, name);
                return { index, score: card ? B.cardScore(view, seat, side, card, w) : 0 };
            });
            const pick = this.choose(rnd, candidates, 'playCard') || candidates[0];
            return { cmd: { type: 'combat', action: 'playCard', index: pick.index }, must: true, label: 'playCard' };
        }
        if (step === 'damage-attacker' || step === 'damage-defender') {
            const side = sideOf(step);
            if (CombatHooks.of(c).assignSeat(CombatSides.seatOf(c, side)) !== seat) return null;
            const candidates = R.damageCandidates(view, side);
            const all = candidates.map(x => x.id);
            const damage = R.combatDamageFor(view, side);
            const ordered = B.damageOrder(view, seat, side, candidates, damage).map(x => x.id);
            return { tries: [{ type: 'combat', action: 'damage', targets: ordered }, { type: 'combat', action: 'damage', targets: all },
                { type: 'combat', action: 'damage', targets: botShuffled(rnd, all) }], must: true, label: 'damage' };
        }
        if (step === 'retreat') {
            if (CombatOutcome.of(c).loserSeat !== seat) return null;
            const targets = R.retreatTargets(view, seat);
            const candidates = targets.map(t => {
                const state = R.areaState(view, seat, t.system, t.pos);
                let foes = 0;
                for (const p of view.players) if (p.seat !== seat) foes += B.presence(view, p.seat, t.system).power;
                return { t, score: (state === 'friendly' ? 3 : 1) - foes * 0.3 + rnd() * 0.3 };
            });
            const pick = this.choose(rnd, candidates, 'retreat');
            return { cmd: { type: 'combat', action: 'retreat', target: pick ? pick.t : botPick(rnd, targets) }, must: true, label: 'retreat' };
        }
        return { advance: true, label: step };
    }
}
