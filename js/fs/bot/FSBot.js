// FSBot.js — the bot: a player of one seat who sees only what that seat sees.
//
// The bot gets `FS_RULES.view(state, seat)` — the same picture the client of
// that seat gets (closed orders of the others have no face, the decks are
// numbers, the hand of tiles is its own) — and answers with a command for
// `FS_RULES.apply`. It never touches the state and never reads anything the
// player at that seat could not read: honesty by construction, not by promise.
//
// This file is the first layer of the plan (docs/forbidden-stars/16-bots-plan.md):
// the legal moves. The bot of this layer plays like a random but sane player —
// it attacks where an enemy is reachable, buys what it can afford, answers the
// questions of the cards. The evaluation (layer 2) and the character (layer 3)
// are built on top of `next()`: they rank the candidates this layer produces.
//
// The shape of an answer of `next(view)`:
//   { cmd, label, must }            — one command; `must` — a refusal is a bug
//   { tries: [cmd, …], label }      — commands to try in this order
//   { advance: true }               — a combat step without a decision (empty hand)
//   null                            — nothing to do (not this seat's turn, or the game is over)
// and of `answers(view, question)`: the answers to try, the first one preferred.
//
// Nothing here depends on the number of a round: the stage of the party is
// `GamePhase.of(view).progress` / `roundsLeft` — a «блиц» of five rounds and
// the classic eight are the same game to the bot.

/* global FS_RULES, FS_CATALOG, PhasePlan, MarchPlan, OrderContext, OrderTally, OrderDeal, CombatTurn, CombatSides,
   CombatHooks, CombatCards, CombatOutcome, Question, StrikeDamage, GameOutcome, GamePhase, EventPhase, EventRound, BoardSetup,
   Purchases, DeployScope, UpgradeOrder */

const FS_BOT = {
    /** The archetypes of the character layer (the names the lobby shows). */
    PERSONAS: [
        { id: 'aggressor', name: 'Агрессор', text: 'лезет в бой с первого же плана, копит армию, а не экономику' },
        { id: 'builder', name: 'Строитель', text: 'города, фабрики, освоение; армия поздно, но большая' },
        { id: 'technologist', name: 'Технолог', text: 'улучшения раньше отрядов; бои выигрывает картами' },
        { id: 'turtle', name: 'Черепаха', text: 'бастионы, доминирование, оборона своих целей; выходит под конец партии' },
        { id: 'vulture', name: 'Стервятник', text: 'бьёт того, кто слабее всех или только что потерял армию' },
    ],

    /** The levels: presets of the temperature and the depth of one bot. */
    LEVELS: [
        { id: 'novice', name: 'Новичок', temperature: 1.0, depth: 0 },
        { id: 'normal', name: 'Обычный', temperature: 0.5, depth: 1 },
        { id: 'veteran', name: 'Ветеран', temperature: 0.2, depth: 2 },
    ],

    /** The character and the name the faction suggests (the lobby may change both). */
    DEFAULTS: {
        'орки': { persona: 'aggressor', name: 'Варбосс', line: 'WAAAGH! с первого плана' },
        'космодесант-хаоса': { persona: 'aggressor', name: 'Тёмный апостол', line: 'давит и интригует' },
        'темные-эльдары': { persona: 'vulture', name: 'Архонт', line: 'бьёт, грабит, уходит' },
        'эльдары': { persona: 'vulture', name: 'Провидец', line: 'избегает честного боя' },
        'империя-тау': { persona: 'technologist', name: 'Этериал', line: 'сначала технологии, потом война' },
        'адептус-механикус': { persona: 'technologist', name: 'Магос', line: 'кузницы и улучшения' },
        'некроны': { persona: 'builder', name: 'Фаэрон', line: 'просыпается к середине партии' },
        'имперская-гвардия': { persona: 'turtle', name: 'Лорд-генерал', line: 'бастионы, потом волна' },
        'космодесант': { persona: 'turtle', name: 'Магистр', line: 'держит рубеж, бьёт точно' },
        'тираниды': { persona: 'aggressor', name: 'Разум улья', line: 'пожирает ближайшего' },
        'сестры-битвы': { persona: 'turtle', name: 'Канонисса', line: 'не прощает' },
        'инквизиция': { persona: 'vulture', name: 'Инквизитор', line: 'ждёт ошибки' },
    },

    persona(id) {
        return this.PERSONAS.find(p => p.id === id) || null;
    },

    level(id) {
        return this.LEVELS.find(l => l.id === id) || this.LEVELS[1];
    },

    /** What the lobby shows for a bot of this faction: the name and the hint line. */
    defaults(factionId) {
        const d = this.DEFAULTS[factionId];
        if (d) return { persona: d.persona, name: d.name, line: d.line };
        return { persona: 'aggressor', name: 'Бот', line: 'играет как умеет' };
    },

    /** The hint line of a bot: «Варбосс: WAAAGH! с первого плана». */
    line(factionId, persona) {
        const d = this.defaults(factionId);
        if (!persona || persona === d.persona) return d.name + ': ' + d.line;
        const p = this.persona(persona);
        return d.name + ': ' + (p ? p.text : d.line);
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
     *   (the seed of the party and the seat together repeat a game exactly).
     */
    constructor(opts) {
        this.seat = opts.seat | 0;
        this.seed = opts.seed === undefined ? 1 : opts.seed;
        this.levelId = FS_BOT.level(opts.level).id;
        this.persona = opts.persona || null;
        // The attempts already made in a position: a refused command is not
        // repeated in the same place — the bot moves on to the ending command.
        this.tried = new Set();
        this.attempts = {};
    }

    get R() { return FS_RULES; }

    /**
     * The randomness of one decision, seeded by the position: the same view
     * gives the same decision. «Отменить ход» by a human restores the state,
     * and the bot repeats its move instead of trying another — an honest
     * «передумал» of the human, not a reroll of the bot.
     */
    rng(view) {
        const c = view.combat;
        const key = [this.seed, this.seat, view.rng, view.uid, view.round, view.phase, (view.log || []).length,
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
        const R = this.R, seat = this.seat, rnd = this.rng(view);
        const trim = R.trimQueue(view);
        if (trim.blocked(seat)) {
            const entry = trim.entries().find(e => e.seat === seat);
            const unit = entry && botPick(rnd, view.units.filter(u => u.seat === seat && u.system === entry.system && u.area === entry.pos));
            if (!unit) return null;
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
                out.push(botChance(rnd, 0.75) ? { yes: true } : { no: true }, { yes: true }, {}, { no: true });
                break;
            case 'yesno':
                if (q.op === 'avoid') out.push(botChance(rnd, 0.5) ? { dice: opts.slice(0, n) } : { dice: [] }, { dice: [] }, { dice: opts.slice(0, n) }, { no: true });
                else out.push(botChance(rnd, 0.6) ? { yes: true } : { no: true }, { yes: true }, { no: true }, {});
                break;
            case 'scheme':
                out.push(botChance(rnd, 0.7) ? { choice: Math.floor(rnd() * Math.max(1, opts.length)) } : { no: true }, { choice: 0 }, { no: true }, {});
                break;
            case 'choice':
                out.push({ choice: Math.floor(rnd() * Math.max(1, opts.length)) }, { choice: 0 }, { no: true }, {});
                break;
            case 'units':
                out.push({ units: some(n) }, { units: opts.slice(0, n) }, { units: first === undefined ? [] : [first] }, { units: [] }, { no: true });
                break;
            case 'dice':
                out.push({ dice: some(n) }, { dice: opts.slice(0, n) }, { dice: opts.slice() }, { dice: first === undefined ? [] : [first] }, { dice: [] }, { no: true });
                break;
            case 'diceFace':
                out.push({ dice: [botPick(rnd, opts)], face: botPick(rnd, ['att', 'def', 'morale']) }, { dice: [first], face: 'att' }, { dice: [] }, { no: true });
                break;
            case 'face':
                out.push({ face: botPick(rnd, opts.length ? opts : ['att', 'def', 'morale']) }, { face: 'att' }, { no: true });
                break;
            case 'foes':
                out.push({ foe: botPick(rnd, opts) }, { foe: first }, { no: true });
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
                if (q.op === 'buyUpgradeReplace' || q.op === 'buyAnyUpgradeReplace') out.push({ card: q.card, remove: botPick(rnd, opts) }, { card: q.card, remove: first }, { remove: first }, { no: true });
                else if (q.op === 'swapCombatCards') out.push({ cards: botChance(rnd, 0.5) ? some(1) : [] }, { cards: [] }, { no: true });
                else out.push({ card: botPick(rnd, opts) }, { card: first }, { cards: [first] }, { no: true });
                break;
            case 'structures':
                out.push({ structure: botPick(rnd, opts) }, { structure: first }, { no: true });
                break;
            case 'assets': case 'assetType':
                out.push({ asset: botPick(rnd, opts) }, { asset: first }, { asset: 'forge' }, { asset: 'cache' }, { asset: 'reinforcement' }, { no: true });
                break;
            default:
                out.push({ choice: 0 }, { yes: true }, {}, { no: true }, { units: opts.slice(0, n) }, { dice: opts.slice(0, n) });
        }
        return out;
    }

    // --- the orbital strike: the defender takes the hits -----------------------------

    strikeDamage(view, rnd) {
        const damage = StrikeDamage.of(view);
        const seat = this.seat;
        const sys = damage.system, pos = damage.pos;
        const units = view.units.filter(u => u.seat === seat && u.system === sys && u.area === pos);
        const bastions = view.structures.filter(s => s.seat === seat && s.type === 'bastion' && s.system === sys && s.area === pos);
        const order = [];
        const first = damage.first ? units.find(u => u.id === damage.first) : null;
        if (first) order.push(first);
        for (const u of botShuffled(rnd, units.filter(u => !u.routed && u !== first))) order.push(u);
        for (const b of bastions) order.push(b);
        for (const u of botShuffled(rnd, units.filter(u => u.routed && u !== first))) order.push(u);
        if (!order.length) return null;
        return { tries: order.map(x => ({ type: 'strikeDamage', unit: x.id, structure: x.id })), must: true, label: 'strikeDamage' };
    }

    // --- the galaxy is built ---------------------------------------------------------

    setup(view, rnd) {
        const R = this.R, seat = this.seat;
        const board = BoardSetup.of(view);
        const stage = board.stage;
        // The start tokens of a choice («Инквизиция»): taken during the setup.
        const me = view.players[seat];
        if ((me.startChoice || 0) > 0 && botChance(rnd, 0.7)) {
            const kinds = ['forge', 'cache', 'reinforcement'].filter(k => R.player(view, seat).hasRoomFor(k));
            if (kinds.length) return { cmd: { type: 'startAsset', asset: botPick(rnd, kinds) }, must: true, label: 'startAsset' };
        }
        if (stage === BoardSetup.TILES) {
            const cells = view.setup.legalCells && view.setup.legalCells.length ? view.setup.legalCells : R.setupLegalCells(view);
            const cell = botPick(rnd, cells);
            const tile = botPick(rnd, view.setup.hand || board.hand(seat));
            if (!cell || !tile) return null;
            return { cmd: { type: 'placeSystemTile', tile, row: cell.row, col: cell.col }, must: true, label: 'placeSystemTile' };
        }
        if (stage === BoardSetup.FORCES) {
            const initial = me.initialForces || { units: {}, structures: {} };
            const sys = R.system(view, board.currentSystem);
            const unitId = Object.keys(initial.units).find(id => initial.units[id] > 0);
            if (unitId && sys) {
                const def = R.unitDef(view, seat, unitId);
                const area = sys.areas.find(a => !!a.world === (def.type !== 'ship')
                    && R.unitsAt(view, sys.id, a.pos).length < R.capacity(view, sys.id, a.pos));
                if (area) return { cmd: { type: 'setupUnit', unit: unitId, pos: area.pos }, must: true, label: 'setupUnit' };
            }
            const structId = Object.keys(initial.structures).find(id => initial.structures[id] > 0);
            if (structId && sys) {
                const area = sys.areas.find(a => a.world && R.canPlaceStructure(view, seat, sys.id, a.pos, { ignoreControl: true }).ok);
                if (area) return { cmd: { type: 'setupStructure', structure: structId, pos: area.pos }, must: true, label: 'setupStructure' };
            }
            return { cmd: { type: 'finishSetupForces' }, must: true, label: 'finishSetupForces' };
        }
        if (stage === BoardSetup.OBJECTIVES) {
            // The view carries the options of the current player (the pool of
            // tokens is only a number there).
            const opt = botPick(rnd, view.setup.objectiveOptions || []);
            if (opt) return { cmd: { type: 'setupObjective', seat: opt.seat, faction: opt.faction, pos: botPick(rnd, opt.areas) }, must: true, label: 'setupObjective' };
            return null;
        }
        if (stage === BoardSetup.STORMS) {
            for (const sys of botShuffled(rnd, view.systems)) {
                const sides = R.setupStormSides(view, sys.id);
                if (sides.length) return { cmd: { type: 'setupStorm', system: sys.id, side: botPick(rnd, sides) }, must: true, label: 'setupStorm' };
            }
            return null;
        }
        return null;
    }

    // --- the planning: where the order tokens go -------------------------------------

    planning(view, rnd) {
        const R = this.R, seat = this.seat;
        const kinds = botShuffled(rnd, ['advance', 'deploy', 'strategize', 'dominate']).filter(k => R.orderLeft(view, seat, k) > 0);
        if (!kinds.length) return null;
        const systems = view.systems.filter(s => R.canPlaceOrder(view, seat, s.id));
        if (!systems.length) return null;
        // The weights: an own system — three, a neighbour of an own — two, the rest — one.
        const mine = new Set(view.units.filter(u => u.seat === seat).map(u => u.system)
            .concat(view.structures.filter(s => s.seat === seat).map(s => s.system)));
        const near = new Set();
        for (const id of mine) for (const n of R.neighbors(view, id)) near.add(n);
        const foes = new Set(view.units.filter(u => u.seat !== seat).map(u => u.system)
            .concat(view.structures.filter(s => s.seat !== seat).map(s => s.system)));
        // The advance goes where an enemy is reachable: otherwise there are no battles.
        let kind = kinds[0];
        if (R.orderLeft(view, seat, 'advance') > 0 && botChance(rnd, 0.6)) {
            const hot = systems.filter(s => foes.has(s.id) && (mine.has(s.id) || near.has(s.id)));
            if (hot.length) return { cmd: { type: 'placeOrder', system: botPick(rnd, hot).id, order: 'advance' }, must: true, label: 'placeOrder' };
            if (kind !== 'advance' && botChance(rnd, 0.5)) kind = 'advance';
        }
        const bag = [];
        for (const s of systems) {
            const w = mine.has(s.id) ? 3 : (near.has(s.id) ? (foes.has(s.id) ? 4 : 2) : 1);
            for (let i = 0; i < w; i++) bag.push(s);
        }
        const sys = botPick(rnd, bag);
        return { cmd: { type: 'placeOrder', system: sys.id, order: kind }, must: true, label: 'placeOrder' };
    }

    // --- the operations: the orders are resolved ----------------------------------------

    operations(view, rnd) {
        const R = this.R, seat = this.seat;
        if (!view.order) {
            const systems = view.systems.filter(s => s.tokens.length && s.tokens[s.tokens.length - 1].seat === seat);
            if (!systems.length) return null;
            const sys = botPick(rnd, systems);
            const toEventDeck = botChance(rnd, 0.05);
            return { cmd: { type: 'resolveOrder', system: sys.id, toEventDeck }, must: true, label: 'resolveOrder' };
        }
        const order = view.order;
        const context = OrderContext.of(order);
        if (!context.isSeat(seat)) return null;
        const kind = context.kind;
        const plan = PhasePlan.of(order);
        if (plan.is('guardDeploy')) return this.guardDeploy(view, rnd);
        // An upgrade of this kind of order — sometimes, while the order runs.
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
        if (!botChance(rnd, 0.6)) return null;
        const strike = kind === 'advance' && PhasePlan.of(view.order).is('strike');
        const wanted = kind === 'advance' ? (strike ? ['orbital'] : ['advance']) : [kind];
        const cards = this.unusedUpgrades(view).filter(u => u.card && wanted.includes(u.card.order));
        if (!cards.length) return null;
        // One attempt per step: a refusal of the rules is not a failure.
        const key = 'upgrade:' + view.round + ':' + kind + ':' + OrderContext.of(view.order).system;
        const fresh = cards.filter(u => !this.tried.has(key + ':' + u.name));
        if (!fresh.length) return null;
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
            const key = 'move:' + view.round + ':' + active + ':' + march.step + ':' + march.moved.length;
            if (!this.tried.has(key) && botChance(rnd, 0.85)) {
                this.tried.add(key);
                const units = botShuffled(rnd, R.movableUnits(view, seat));
                const sys = R.system(view, active);
                if (units.length && sys) {
                    const areas = botShuffled(rnd, sys.areas);
                    // A hostile area first: without battles there is no war.
                    areas.sort((a, b) => (this.enemyAt(view, sys.id, b.pos) ? 1 : 0) - (this.enemyAt(view, sys.id, a.pos) ? 1 : 0));
                    // Only one area may become contested in the whole order:
                    // once the march has its battlefield, the rest go elsewhere.
                    const contestedKey = march.contested;
                    for (const area of areas) {
                        const hostile = this.enemyAt(view, sys.id, area.pos);
                        if (hostile && contestedKey && contestedKey !== sys.id + ':' + area.pos) continue;
                        if (hostile && botChance(rnd, 0.1)) continue;
                        const can = units.filter(u => R.canMove(view, seat, u, { system: sys.id, pos: area.pos }).ok);
                        if (!can.length) continue;
                        const cap = R.capacity(view, sys.id, area.pos);
                        const already = view.units.filter(u => u.seat === seat && u.system === sys.id && u.area === area.pos).length;
                        const room = Math.max(1, cap - already);
                        const count = Math.max(1, Math.min(can.length, botChance(rnd, 0.3) ? room + 1 : room));
                        const moves = can.slice(0, count).map(u => ({ unit: u.id, system: sys.id, pos: area.pos }));
                        return { cmd: { type: 'moveUnits', moves }, must: false, label: 'moveUnits', hostile };
                    }
                }
            }
            if (march.moved.length && botChance(rnd, 0.05)) return { cmd: { type: 'undoMove' }, must: false, label: 'undoMove' };
            return { cmd: { type: 'endAdvance' }, must: true, label: 'endAdvance' };
        }
        if (plan.is('strike')) {
            const targets = R.orbitalStrikeTargets(view, seat);
            if (targets.length && botChance(rnd, 0.8)) {
                const t = botPick(rnd, targets);
                return { tries: [{ type: 'orbitalStrike', system: t.system, pos: t.pos }, { type: 'finishAdvance' }], must: true, label: 'orbitalStrike' };
            }
            return { cmd: { type: 'finishAdvance' }, must: true, label: 'finishAdvance' };
        }
        if (plan.is('corsair')) return { cmd: { type: 'finishAdvance' }, must: true, label: 'finishAdvance' };
        return { tries: [{ type: 'finishAdvance' }, { type: 'endAdvance' }], must: true, label: 'finishAdvance' };
    }

    deploy(view, rnd, order) {
        const R = this.R, seat = this.seat;
        const active = OrderContext.of(order).system;
        const sys = R.system(view, active);
        const p = view.players[seat];
        const step = R.deployStep(order);
        const bought = Purchases.of(order).list.length;
        if (bought && botChance(rnd, 0.04)) return { cmd: { type: 'undoPurchase' }, must: false, label: 'undoPurchase' };
        if (step === 'units') {
            const key = 'buy:' + view.round + ':' + active + ':' + bought;
            this.attempts[key] = (this.attempts[key] || 0) + 1;
            const limitLeft = R.deployLimit(view, seat, sys.id) - R.unitsBought(order);
            if (this.attempts[key] <= 4 && botChance(rnd, 0.9) && R.hasFactory(view, seat, sys.id) && limitLeft > 0) {
                const left = p.materiel - R.spentOf(order);
                const cl = R.commandLevel(view, seat);
                const defs = botShuffled(rnd, R.faction(view, seat).units.filter(d => (p.supply.units[d.id] || 0) > 0 && (d.kl || 0) <= cl));
                for (const def of defs) {
                    const cache = R.player(view, seat).assetCount('cache') > 0 && botChance(rnd, 0.5);
                    const price = R.unitPrice(view, seat, def, { cache });
                    if (price > left) continue;
                    const areas = botShuffled(rnd, sys.areas.filter(a => !!a.world === (def.type !== 'ship')));
                    for (const area of areas) {
                        if (!R.canPlaceUnit(view, seat, sys.id, area.pos, def).ok) continue;
                        return { cmd: { type: 'buyUnit', unit: def.id, system: sys.id, pos: area.pos, cache }, must: false, label: 'buyUnit' };
                    }
                }
            }
            if (OrderDeal.of(order).structureFirst && botChance(rnd, 0.5)) {
                const buy = this.structurePurchase(view, rnd, sys);
                if (buy) return buy;
            }
            return { cmd: { type: 'deployStructures' }, must: true, label: 'deployStructures' };
        }
        const key = 'struct:' + view.round + ':' + active;
        if (!this.tried.has(key)) {
            this.tried.add(key);
            const buy = this.structurePurchase(view, rnd, sys);
            if (buy) return buy;
        }
        return { cmd: { type: 'finishDeploy' }, must: true, label: 'finishDeploy' };
    }

    structurePurchase(view, rnd, sys) {
        const R = this.R, seat = this.seat;
        const p = view.players[seat];
        const left = p.materiel - R.spentOf(view.order);
        for (const type of botShuffled(rnd, ['city', 'factory', 'bastion'])) {
            const cache = R.player(view, seat).assetCount('cache') > 0 && botChance(rnd, 0.5);
            if (R.structurePrice(view, seat, type, { cache }) > left) continue;
            for (const area of botShuffled(rnd, sys.areas.filter(a => a.world))) {
                if (!R.canPlaceStructure(view, seat, sys.id, area.pos).ok) continue;
                return { cmd: { type: 'buyStructure', kind: type, system: sys.id, pos: area.pos, cache }, must: false, label: 'buyStructure' };
            }
        }
        return null;
    }

    guardDeploy(view, rnd) {
        const R = this.R, seat = this.seat;
        const order = view.order;
        const bought = Purchases.of(order).units.length;
        const key = 'guard:' + view.round + ':' + bought;
        if (!this.tried.has(key) && bought < 2 && botChance(rnd, 0.8)) {
            this.tried.add(key);
            const sys = R.system(view, OrderContext.of(order).system);
            const p = view.players[seat];
            const left = p.materiel - R.spentOf(order);
            const cl = R.commandLevel(view, seat);
            const defs = botShuffled(rnd, R.faction(view, seat).units.filter(d => d.type !== 'ship' && (p.supply.units[d.id] || 0) > 0 && (d.kl || 0) <= cl));
            // «Массовое Производство»: the one factory produces into its own world.
            const factory = DeployScope.of(order).factory;
            const worlds = factory && factory.system === sys.id ? sys.areas.filter(a => a.pos === factory.pos) : sys.areas.filter(a => a.world);
            for (const def of defs) {
                if (R.unitPrice(view, seat, def, {}) > left) continue;
                for (const area of botShuffled(rnd, worlds)) {
                    return { cmd: { type: 'buyUnit', unit: def.id, system: sys.id, pos: area.pos }, must: false, label: 'buyUnit' };
                }
            }
        }
        if (bought === 1) return { tries: [{ type: 'finishGuardDeploy' }, { type: 'undoPurchase' }], must: true, label: 'finishGuardDeploy' };
        return { cmd: { type: 'finishGuardDeploy' }, must: true, label: 'finishGuardDeploy' };
    }

    strategize(view, rnd, order) {
        const R = this.R, seat = this.seat;
        const p = view.players[seat];
        const key = 'strat:' + view.round + ':' + OrderContext.of(order).system;
        this.attempts[key] = (this.attempts[key] || 0) + 1;
        const present = R.board(view).hasUnitsOrStructures(seat, OrderContext.of(order).system);
        if (present && this.attempts[key] <= 3 && botChance(rnd, 0.85)) {
            const cl = R.commandLevel(view, seat);
            const upgrades = UpgradeOrder.of(order);
            if (upgrades.full) return { cmd: { type: 'finishStrategize' }, must: true, label: 'finishStrategize' };
            // The decks are numbers in the view; the cards one may buy are the
            // ones of the faction that are not in the deck yet — the same way
            // the panel of the player lists them. The rules check the rest.
            if (!upgrades.combat && botChance(rnd, 0.5)) {
                const have = {};
                for (const name of p.decksCombatKnown || []) have[name] = (have[name] || 0) + 1;
                const names = botShuffled(rnd, FS_CATALOG.upgradeCombatCards(p.faction).map(c => c.name).filter(name => (have[name] || 0) < 2));
                for (const name of names) {
                    const card = FS_CATALOG.card('combat', p.faction, name);
                    if (!card || card.kl > cl || R.cardPrice(view, seat, card) > p.materiel) continue;
                    if (this.tried.has(key + ':c:' + name)) continue;
                    this.tried.add(key + ':c:' + name);
                    return { cmd: { type: 'buyUpgrade', kind: 'combat', card: name }, must: false, label: 'buyUpgrade' };
                }
            }
            const owned = new Set((p.upgrades || []).map(u => u.name));
            const pile = upgrades.orderCard ? [] : botShuffled(rnd, FS_CATALOG.orderCards(p.faction).map(c => c.name).filter(name => !owned.has(name)));
            for (const name of pile) {
                const card = FS_CATALOG.card('orders', p.faction, name);
                if (!card || card.kl > cl || R.cardPrice(view, seat, card) > p.materiel) continue;
                if (this.tried.has(key + ':o:' + name)) continue;
                this.tried.add(key + ':o:' + name);
                return { cmd: { type: 'buyUpgrade', kind: 'order', card: name }, must: false, label: 'buyUpgrade' };
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
            if (kinds.length && botChance(rnd, 0.8)) return { cmd: { type: 'takeProsperity', asset: botPick(rnd, kinds) }, must: false, label: 'takeProsperity' };
        }
        return { cmd: { type: 'finishDominate', skip: botChance(rnd, 0.2) }, must: true, label: 'finishDominate' };
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
                const o = botPick(rnd, opts);
                return { cmd: { type: 'moveStorm', storm: o.storm, dir: o.dir }, must: true, label: 'moveStorm' };
            }
        }
        if ((event.drawn || []).length && !event.chosen) {
            return { cmd: { type: 'drawEvent', card: botPick(rnd, event.drawn) }, must: true, label: 'drawEvent' };
        }
        return { cmd: { type: 'resolveEvent' }, must: true, label: 'resolveEvent' };
    }

    // --- the battle --------------------------------------------------------------------

    combat(view, rnd) {
        const R = this.R, seat = this.seat;
        const c = view.combat;
        const turn = CombatTurn.of(c);
        const step = turn.step;
        const sideOf = s => (s.endsWith('attacker') ? 'attacker' : 'defender');
        if (step === 'reinforce-attacker' || step === 'reinforce-defender') {
            const side = sideOf(step);
            if (CombatSides.seatOf(c, side) !== seat) return null;
            const max = R.maxReinforce(view, seat, side);
            const count = max > 0 ? Math.floor(rnd() * (max + 1)) : 0;
            return { tries: [{ type: 'combat', action: 'reinforce', count }, { type: 'combat', action: 'reinforce', count: 0 }], must: true, label: 'reinforce', count };
        }
        if (step === 'choose-attacker' || step === 'choose-defender') {
            const side = sideOf(step);
            if (CombatSides.seatOf(c, side) !== seat) return null;
            const hand = CombatCards.of(c).hand(side) || [];
            if (!hand.length) return { advance: true, label: 'playCard' };
            const index = Math.floor(rnd() * hand.length);
            return { cmd: { type: 'combat', action: 'playCard', index }, must: true, label: 'playCard' };
        }
        if (step === 'damage-attacker' || step === 'damage-defender') {
            const side = sideOf(step);
            if (CombatHooks.of(c).assignSeat(CombatSides.seatOf(c, side)) !== seat) return null;
            const all = R.damageCandidates(view, side).map(x => x.id);
            return { tries: [{ type: 'combat', action: 'damage', targets: botShuffled(rnd, all) }, { type: 'combat', action: 'damage', targets: all }], must: true, label: 'damage' };
        }
        if (step === 'retreat') {
            if (CombatOutcome.of(c).loserSeat !== seat) return null;
            const targets = R.retreatTargets(view, seat);
            const t = botPick(rnd, targets);
            return { cmd: { type: 'combat', action: 'retreat', target: t }, must: true, label: 'retreat' };
        }
        return { advance: true, label: step };
    }
}
