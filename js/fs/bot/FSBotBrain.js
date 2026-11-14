// FSBotBrain.js — the second layer of the bot: the measure of a position and
// the choice among candidates.
//
// The first layer (FSBot.js) lists the legal moves of a seat; this one says
// how good each of them is for THIS character, and picks one of them with a
// controlled randomness. Everything here works on the view of one seat — the
// same object the client gets — so the bot never reads a hidden hand or a
// facedown order of somebody else.
//
// The choice is a weighted roulette with two guards (the design the player
// asked for): the scores go through a softmax with the temperature of the
// level (a novice is almost random among the sensible moves, a veteran almost
// always takes the best), and the tail of improbable moves is cut by a
// cumulative share (top-p): a move of 95 % is never lost to a move of 1 %,
// while two moves of 48 % and 47 % stay a coin toss. The temperature is in
// materiel, not in ranks: a move clearly worse than the best is cut whatever
// the number of candidates, a move almost as good stays in the game.
//
// The numbers of the scores are in «materiel»: one unit of score is worth
// about one materiel of position. An objective token is worth a lot of
// materiel — the game is won by tokens, not by armies. The scoring of the
// moves themselves lives in FSBot.js next to the moves; this file holds the
// yardsticks they share: the worth of a unit, the odds of a battle, the
// distances of the map, the state of the tokens, the worth of a combat card.

/* global FS_RULES, FS_CATALOG, FS_EFFECTS, CombatSides, CombatTurn */

const FSBotBrain = {
    // --- the roulette --------------------------------------------------------

    /** One point of the temperature is this many materiel of difference. */
    TEMPERATURE_SCALE: 2,

    /**
     * One candidate out of many. `candidates` carry `score` (in materiel); the
     * level gives the temperature (the softness of the roulette) and topP (the
     * share of the probability mass that stays in the game). Returns the
     * candidate. A move that is `temperature × 2` materiel worse than the best
     * one is e times less likely; a move ten materiel worse is never taken.
     */
    choose(rnd, candidates, level) {
        const list = (candidates || []).filter(c => c && Number.isFinite(c.score));
        if (!list.length) return null;
        if (list.length === 1) return list[0];
        const T = Math.max(0.05, level && level.temperature || 0.5) * this.TEMPERATURE_SCALE;
        const topP = Math.min(1, Math.max(0.05, level && level.topP || 0.9));
        let max = -Infinity;
        for (const c of list) if (c.score > max) max = c.score;
        const weighted = list.map(c => ({ c, w: Math.exp((c.score - max) / T) }));
        weighted.sort((a, b) => b.w - a.w);
        const total = weighted.reduce((s, x) => s + x.w, 0);
        // top-p: the smallest head of the list whose mass reaches the share.
        const kept = [];
        let mass = 0;
        for (const x of weighted) {
            kept.push(x);
            mass += x.w / total;
            if (mass >= topP) break;
        }
        const keptTotal = kept.reduce((s, x) => s + x.w, 0);
        let r = rnd() * keptTotal;
        for (const x of kept) {
            r -= x.w;
            if (r <= 0) return x.c;
        }
        return kept[kept.length - 1].c;
    },

    // --- the pieces ----------------------------------------------------------

    /** The worth of a unit in materiel: what it costs, and what it does. */
    unitValue(def) {
        if (!def) return 0;
        return (def.cost || 0) + (def.forge ? 2 : 0) + 0.5 * (def.combat || 0) + 0.25 * (def.health || 0) + 0.25 * (def.morale || 0);
    },

    /** The weight of a unit in a battle: dice, health, morale — in «dice». */
    unitPower(def) {
        if (!def) return 0;
        return (def.combat || 0) + 0.5 * (def.health || 0) + 0.4 * (def.morale || 0);
    },

    /** The battle weight of a side in one area: the unrouted units and the bastions. */
    powerAt(view, seat, system, pos, opts) {
        const R = FS_RULES;
        let power = 0;
        for (const u of view.units) {
            if (u.seat !== seat || u.system !== system || u.area !== pos) continue;
            if (u.routed && !(opts && opts.routedCount)) continue;
            power += this.unitPower(R.unitOf(view, u));
        }
        for (const s of view.structures) {
            if (s.seat !== seat || s.system !== system || s.area !== pos || s.type !== 'bastion') continue;
            // A bastion rolls 2 dice, has 3 health and 2 morale.
            power += 2 + 1.5 + 0.8;
        }
        return power;
    },

    /** The battle weight of a list of units (by their definitions). */
    powerOf(view, units) {
        let power = 0;
        for (const u of units) if (!u.routed) power += this.unitPower(FS_RULES.unitOf(view, u));
        return power;
    },

    /** The armies of a seat in a system: units, structures, power, by area. */
    presence(view, seat, system) {
        const units = view.units.filter(u => u.seat === seat && u.system === system);
        const structures = view.structures.filter(s => s.seat === seat && s.system === system);
        return { units, structures, power: this.powerOf(view, units) };
    },

    /**
     * The odds of winning a battle: my power against theirs, the defender a
     * little ahead (a tie of the morale goes to him). 0.5 is an even fight.
     */
    odds(myPower, theirPower, iAttack) {
        const edge = iAttack ? -0.8 : 0.8;
        const d = myPower - theirPower + edge;
        return 1 / (1 + Math.exp(-d / 2.5));
    },

    // --- the map -------------------------------------------------------------

    /**
     * The distance between systems in marches (a storm closes a border). A
     * map of system → steps from the start; unreachable systems are absent.
     */
    distances(view, from) {
        const R = FS_RULES;
        const out = new Map([[from, 0]]);
        const queue = [from];
        while (queue.length) {
            const here = queue.shift();
            const d = out.get(here);
            for (const next of R.neighbors(view, here)) {
                if (out.has(next)) continue;
                if (R.stormOn(view, here, next)) continue;
                out.set(next, d + 1);
                queue.push(next);
            }
        }
        return out;
    },

    /** The systems where a seat stands (units or structures). */
    systemsOf(view, seat) {
        const set = new Set();
        for (const u of view.units) if (u.seat === seat) set.add(u.system);
        for (const s of view.structures) if (s.seat === seat) set.add(s.system);
        return set;
    },

    /** The nearest army of a seat to a system: steps and the power that can come. */
    reach(view, seat, system) {
        const R = FS_RULES;
        const dist = this.distances(view, system);
        let steps = Infinity, power = 0, near = 0;
        for (const sys of view.systems) {
            const d = dist.get(sys.id);
            if (d === undefined) continue;
            const p = this.presence(view, seat, sys.id).power;
            if (!p) continue;
            if (d < steps) steps = d;
            if (d <= 1) near += p;
            power += p / (1 + d);
        }
        return { steps, near, power };
    },

    // --- the objectives ------------------------------------------------------

    /**
     * The objective tokens of a seat still on the board, each with the state
     * of its world: who holds it, how strong, how far my nearest army is.
     */
    targets(view, seat) {
        const R = FS_RULES;
        const out = [];
        for (const obj of view.objectives || []) {
            if (R.objectiveOwnerSeat(view, obj) !== seat) continue;
            const sys = R.system(view, obj.system);
            if (!sys) continue;
            const area = R.area(sys, obj.area);
            const holders = [...R.warSeatsAt(view, obj.system, obj.area)];
            const enemy = holders.filter(s => s !== seat);
            let defence = 0;
            for (const s of enemy) defence += this.powerAt(view, s, obj.system, obj.area);
            const mine = this.powerAt(view, seat, obj.system, obj.area);
            const control = R.control(view, seat, obj.system, obj.area);
            const reach = this.reach(view, seat, obj.system);
            out.push({
                id: obj.id, system: obj.system, pos: obj.area, world: area && area.world ? area.world.name : '',
                defence, mine, enemy, control, steps: reach.steps, near: reach.near,
            });
        }
        return out;
    },

    /** The tokens of the other players that lie on the worlds this seat holds. */
    exposed(view, seat) {
        const R = FS_RULES;
        const out = [];
        for (const obj of view.objectives || []) {
            const owner = R.objectiveOwnerSeat(view, obj);
            if (owner === seat) continue;
            const control = R.control(view, seat, obj.system, obj.area);
            const theirs = R.control(view, owner, obj.system, obj.area);
            out.push({ id: obj.id, owner, system: obj.system, pos: obj.area, mine: control === 'friendly', theirs: theirs === 'friendly',
                defence: this.powerAt(view, seat, obj.system, obj.area), threat: this.reach(view, owner, obj.system) });
        }
        return out;
    },

    /** The seat with the most collected objectives, and whether he leads alone. */
    leader(view) {
        let best = null, tie = false;
        for (const p of view.players) {
            if (p.eliminated) continue;
            if (!best || (p.objectives || 0) > (best.objectives || 0)) { best = p; tie = false; }
            else if ((p.objectives || 0) === (best.objectives || 0)) tie = true;
        }
        return best && !tie && (best.objectives || 0) > 0 ? best.seat : null;
    },

    // --- the battle ---------------------------------------------------------

    /** The average icons of a combat deck (the deck is public): what a card of it brings. */
    deckAverage(faction, names) {
        let att = 0, def = 0, morale = 0, n = 0;
        for (const name of names || []) {
            const card = FS_CATALOG.card('combat', faction, name);
            if (!card) continue;
            att += card.icons.att || 0; def += card.icons.def || 0; morale += card.icons.morale || 0; n++;
        }
        return n ? { att: att / n, def: def / n, morale: morale / n } : { att: 0.8, def: 0.8, morale: 0.5 };
    },

    /**
     * The worth of a combat card in the hand now: the icons against the
     * expected card of the enemy, the unit ability when its unit stands in
     * the battle, the morale when the battle is about to be decided.
     */
    cardScore(view, seat, side, card, w) {
        const R = FS_RULES;
        const c = view.combat;
        const foe = CombatSides.foe(side);
        const foeSeat = CombatSides.seatOf(c, foe);
        const me = R.combatValues(view, side);
        const them = R.combatValues(view, foe);
        const turn = CombatTurn.of(c);
        const round = turn.round || 1;
        const theirDeck = this.deckAverage(view.players[foeSeat].faction, view.players[foeSeat].decksCombatKnown);
        const icons = card.icons || {};
        // What the enemy adds this round, on average.
        const themAtt = them.att + theirDeck.att, themDef = them.def + theirDeck.def;
        const myAtt = me.att + (icons.att || 0), myDef = me.def + (icons.def || 0);
        const dealt = Math.max(0, myAtt - themDef) - Math.max(0, me.att - themDef);
        const saved = Math.max(0, themAtt - me.def) - Math.max(0, themAtt - myDef);
        // The last round decides by morale: the icons of morale weigh more then.
        const moraleWeight = round >= 3 ? 1.6 : (round === 2 ? 0.9 : 0.5);
        const moraleGap = (me.morale + (icons.morale || 0)) - (them.morale + theirDeck.morale);
        let score = dealt * 1.5 + saved * 1.2 + (icons.morale || 0) * moraleWeight;
        if (round >= 3 && moraleGap > 0 && moraleGap - (icons.morale || 0) <= 0) score += 3;
        // The unit ability: only with its unit in the battle.
        if (card.unit) {
            const present = R.presentNames(view, seat);
            const faction = view.players[seat].faction;
            if (FS_EFFECTS.meetsRequisite(card, present, { kind: 'combat', faction })) score += 1.5 + this.textWorth(card.unit) * 0.5;
            else score -= 0.3;
        }
        score += this.textWorth(card.general) * 0.5;
        // The tastes of the character: the cards it likes get a little more.
        if (w && w.likesCombat && w.likesCombat.includes(card.name)) score += 1;
        return score;
    },

    /** A rough worth of the text of a card: what it gives and what it costs. */
    textWorth(text) {
        if (!text || /^—/.test(text)) return 0;
        let worth = 0;
        const t = String(text);
        const tokens = /(\d+)\s*`(?:att|def)\. token`/g;
        let m;
        while ((m = tokens.exec(t))) worth += Number(m[1]) * 0.7;
        if (/`any cube`|`att\. cube`|`def\. cube`|`morale cube`/.test(t)) worth += 0.8;
        if (/уничтож/i.test(t) && /противник/i.test(t)) worth += 1.5;
        if (/восстанов/i.test(t)) worth += 0.8;
        if (/подкреплен/i.test(t)) worth += 0.8;
        if (/переброс/i.test(t) && /противник/i.test(t)) worth += 0.6;
        if (/обязаны перебросить все свои/i.test(t) && !/противник/i.test(t)) worth -= 0.6;
        if (/деморализуйте 1 ваш/i.test(t)) worth -= 0.5;
        return worth;
    },

    /**
     * The order in which the hits fall on my pieces: a piece that can swallow
     * the whole damage and only rout is taken first (the cheapest of those),
     * otherwise the cheapest piece dies and the rest goes on.
     */
    damageOrder(view, seat, side, candidates, damage) {
        const R = FS_RULES;
        const worth = x => {
            if (x.kind === 'token') return 1;
            if (x.kind === 'structure') return 2.5;
            const unit = view.units.find(u => u.id === x.id);
            const def = unit ? R.unitOf(view, unit) : null;
            return def ? this.unitValue(def) : 2;
        };
        const standing = candidates.filter(x => !x.routed);
        const routed = candidates.filter(x => x.routed);
        const order = [];
        let left = Math.max(0, damage || 0);
        const pool = standing.slice();
        while (pool.length) {
            let pick;
            if (left > 0) {
                const absorb = pool.filter(x => x.health > left);
                if (absorb.length) pick = absorb.sort((a, b) => worth(a) - worth(b) || a.health - b.health)[0];
                else pick = pool.sort((a, b) => worth(a) - worth(b) || b.health - a.health)[0];
            } else {
                // The rest of the list is a formality: the dearest pieces last.
                pick = pool.sort((a, b) => worth(a) - worth(b))[0];
            }
            order.push(pick);
            left -= Math.min(left, pick.health);
            pool.splice(pool.indexOf(pick), 1);
        }
        return order.concat(routed);
    },
};
