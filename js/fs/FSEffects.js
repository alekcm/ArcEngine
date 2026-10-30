// FSEffects.js — the texts of the cards are the rules of the cards.
//
// The game reads the text of a card and breaks it into the steps of the game:
// the tokens and the dice, the units that are routed or destroyed, the cards
// that are played. The player answers only the questions of the text ("choose
// a unit", "choose one of the two") — everything else the engine does itself.
//
// Two parts:
//   parse() — the text of a card -> the steps (the data);
//   run()   — the steps are performed by the rules engine (FSRules).
//
// The steps are plain data: {op, ...}. The engine performs them and asks the
// player when a step needs a choice: the question waits in state.pending.

/** @satisfies {Record<string, any>} */
const FS_EFFECTS = {
    // --- the icons of the text ------------------------------------------------
    // "att. token" — a combat token, "any cube" — a die from the supply.
    icon(text) {
        const t = (text || '').toLowerCase().replace(/\s+/g, ' ').trim();
        if (/^(att|атака)/.test(t)) return 'att';
        if (/^(def|оборон)/.test(t)) return 'def';
        if (/morale|морал/.test(t)) return 'morale';
        return 'any';
    },

    // The kind of the icon: a token, a cube (a die) or an icon (a value).
    iconKind(text) {
        const t = (text || '').toLowerCase();
        if (/token/.test(t)) return 'token';
        if (/cube|кубик/.test(t)) return 'cube';
        if (/icon/.test(t)) return 'icon';
        return 'other';
    },

    // The sentences of the text: the parts that are read one by one.
    sentences(text) {
        if (!text) return [];
        const clean = String(text)
            .replace(/\*[^*]*\*/g, ' ')          // the unit ability in italics
            .replace(/«[^»]*»/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        if (!clean || clean === '—') return [];
        // The icons in the backticks are kept whole: the dot in "att. token"
        // is not the end of a sentence.
        const icons = [];
        const whole = clean.replace(/`([^`]+)`/g, (m, icon) => {
            icons.push(icon);
            return '\u0001' + (icons.length - 1) + '\u0001';
        });
        const parts = whole.split(/(?<=[.;])\s+|\s*;\s*/).map(s => s.trim()).filter(Boolean);
        return parts.map(part => part.replace(/\u0001(\d+)\u0001/g, (m, i) => '`' + icons[Number(i)] + '`'));
    },

    // The text of a card -> the steps of the game.
    // ctx: {faction, kind: 'combat'|'event'|'order'|'ability'}
    parse(text, ctx) {
        const steps = [];
        let prev = null;
        for (const sentence of this.sentences(text)) {
            const parsed = this.parseSentence(sentence, ctx || {});
            const avoid = this.avoidOf(sentence);
            if (avoid && prev) {
                // "He may avoid this by spending 1 `any cube`." — the sentence
                // belongs to the step before it.
                prev.avoid = avoid;
                continue;
            }
            if (!parsed.length) continue;
            steps.push(...parsed);
            prev = parsed[parsed.length - 1];
        }
        return steps;
    },

    // The sentence of the payment that avoids the effect.
    avoidOf(sentence) {
        const m = /может избежать этого[^,]*,\s*если потрат[а-яёa-z]*\s+(?:(\d+)|любое количество)?\s*`([^`]+)`/i.exec(sentence);
        if (!m) return null;
        return { n: m[1] ? Number(m[1]) : 1, kind: this.icon(m[2]) };
    },

    // One sentence -> the steps.
    parseSentence(sentence, ctx) {
        const s = sentence.trim();
        if (!s || s === '—') return [];
        // "either ... or ..." — the player chooses.
        const either = s.replace(/^\s*либо\s+/i, '').split(/\s+либо\s+/i);
        if (either.length >= 2) {
            const options = either.flatMap(part => this.parseSentence(part.replace(/^\s*или\s+/i, ''), ctx));
            if (options.length > 1) {
                const scope = this.scope(s);
                return [{ op: 'choice', options: options.map(o => this.withScope(o, scope)), text: s }];
            }
        }
        // The scope: me, the opponent or both.
        const scope = this.scope(s);
        // The rules. The first that matches wins.
        for (const rule of RULES) {
            const m = rule.re.exec(s);
            if (!m) continue;
            const built = rule.build(m, ctx || {}, s);
            if (!built) continue;
            const steps = Array.isArray(built) ? built : [built];
            return steps.map(x => this.withScope(x, scope));
        }
        // Nothing matched: the icon phrases are taken as a simple effect.
        const fallback = this.fallback(s);
        return fallback ? [fallback] : [];
    },

    // Who the sentence is about.
    scope(sentence) {
        const s = sentence.toLowerCase().trim();
        // The subject of the sentence: the opponent.
        if (/^(?:ваш\s+)?противник/.test(s)) return 'foe';
        if (/^(?:он|его|вражеск[а-яёa-z]*)\b/.test(s)) return 'foe';
        if (/противник[а-яёa-z]*\s+(?:должен|должна|выбирает|теряет|терпит|сбрасывает|обязан)/.test(s)) return 'foe';
        if (/ваш[а-яёa-z]*\s+противник/.test(s)) return 'foe';
        if (/ваш|вы(?![а-яёa-z])|свои|себя|игрок/i.test(s)) return 'me';
        return 'me';
    },

    // The scope of the sentence is added to the step.
    withScope(step, scope) {
        if (!step || step.who) return step;
        const s = Object.assign({}, step);
        if (scope === 'both' && step.op !== 'choice') s.who = 'both';
        else s.who = scope;
        return s;
    },

    // The phrases that are not read by the rules: the icons are taken as they are.
    fallback(sentence) {
        const icons = [];
        const re = /`([^`]+)`/g;
        let m;
        while ((m = re.exec(sentence))) {
            const kind = this.iconKind(m[1]);
            if (kind === 'token' || kind === 'cube') icons.push({ kind, icon: this.icon(m[1]) });
        }
        if (!icons.length) return null;
        const who = /противник|вражеск/.test(sentence.toLowerCase()) ? 'foe' : 'me';
        return { op: 'icons', icons, who, text: sentence, note: true };
    },

    // ======================================================================
    //  The steps are performed
    // ======================================================================

    // The steps are performed one by one. A step that needs a choice asks the
    // player: the question waits in state.pending.
    run(R, state, seat, steps, ctx, startIndex) {
        const pending = state.pending;
        const list = pending ? pending.steps : steps;
        const c = Object.assign({}, ctx || {}, { owner: seat });
        let index = startIndex !== undefined ? startIndex : (pending ? pending.index : 0);
        while (index < list.length) {
            const step = list[index];
            const res = this.step(R, state, seat, step, c);
            if (res && res.question && this.emptyQuestion(res.question)) {
                // There is nothing to choose: the effect is skipped.
                index++;
                continue;
            }
            if (res && res.question) {
                state.pending = {
                    seat, answerSeat: res.question.who === undefined ? seat : res.question.who,
                    kind: c.kind || 'card', steps: list, index,
                    question: res.question, ctx: c,
                };
                return { ok: true, pending: true };
            }
            if (res && res.stop) {
                state.pending = null;
                return { ok: true, done: true };
            }
            index++;
        }
        state.pending = null;
        // The combat goes on with the step that waited for the effect.
        if (c.kind === 'combat' && state.combat && state.combat.nextStep) {
            state.combat.step = state.combat.nextStep;
            state.combat.nextStep = null;
        }
        // The order of the ability is over when the effect is done.
        if (c.kind === 'ability' && state.order && state.order.finishAfterEffect) {
            state.order.finishAfterEffect = false;
            R.finishOrder(state, seat);
        }
        return { ok: true, done: true };
    },

    // The answer of the player to the question.
    answer(R, state, seat, cmd) {
        const pending = state.pending;
        if (!pending) return { ok: false, error: 'Нет вопроса.' };
        const must = pending.answerSeat === undefined ? pending.seat : pending.answerSeat;
        if (must !== seat) return { ok: false, error: 'Сейчас не ваш ход.' };
        const question = pending.question;
        const answer = cmd.answer || {};
        const step = pending.steps[pending.index];
        const ctx = pending.ctx || {};
        const owner = ctx.owner === undefined ? pending.seat : ctx.owner;
        // The scheme: the player discards the card and the effect happens.
        if (question.kind === 'scheme') {
            const idx = Number(answer.choice);
            const schemes = (pending.ctx && pending.ctx.schemes) || [];
            const scheme = schemes[idx];
            if (!scheme) return this.next(R, state, pending);
            const p = state.players[pending.seat];
            p.schemes = (p.schemes || []).filter(s => s !== scheme);
            R.log(state, pending.seat, p.name + ' сбрасывает план «' + scheme.name + '».');
            const list = scheme.steps || [];
            const kind = (pending.ctx && pending.ctx.kind) || 'event';
            const cctx = (pending.ctx && pending.ctx.ctx) || null;
            state.pending = null;
            if (!list.length) return { ok: true, done: true };
            return this.run(R, state, pending.seat, list, { kind, ctx: cctx }, 0);
        }
        // The payment that avoids the effect.
        if (question.op === 'avoid') {
            const paid = (answer.dice || []).length > 0;
            if (paid) {
                const combat = state.combat;
                const s2 = seat === combat.attacker ? 'attacker' : 'defender';
                for (const i of (answer.dice || []).slice().sort((a, b) => b - a)) {
                    if (i >= 0 && i < combat.dice[s2].length) combat.dice[s2].splice(i, 1);
                }
                R.log(state, seat, state.players[seat].name + ' тратит кубик и избегает эффекта.');
            } else {
                // The effect happens: the question of the step itself.
                const q = this.step(R, state, owner, step, ctx);
                if (q && q.question) {
                    pending.question = q.question;
                    return { ok: true, pending: true };
                }
            }
            return this.next(R, state, pending);
        }
        const res = this.apply(R, state, seat, step, answer, ctx);
        if (res && res.question && this.emptyQuestion(res.question)) {
            // There is nothing to choose: the effect is skipped.
            return this.next(R, state, pending);
        }
        if (res && res.question) {
            pending.question = res.question;
            return { ok: true, pending: true };
        }
        // The step is done — the rest of the steps go on.
        return this.next(R, state, pending);
    },

    // The question without options: there is nothing to choose.
    emptyQuestion(question) {
        if (!question) return true;
        if (question.kind === 'yesno') return false;
        return !question.options || !question.options.length;
    },

    // The chain goes on with the next step.
    next(R, state, pending) {
        const list = pending.steps;
        const saved = { seat: pending.seat, kind: pending.kind, steps: list, index: pending.index + 1, ctx: pending.ctx };
        state.pending = null;
        return this.run(R, state, saved.seat, list, saved.ctx, saved.index);
    },

    // The player of the side of the combat.
    seatOf(combat, side) {
        if (!combat) return null;
        return side === 'attacker' ? combat.attacker : combat.defender;
    },

    // One step of the game.
    step(R, state, seat, step, ctx) {
        const combat = state.combat;
        const inCombat = ctx && ctx.kind === 'combat';
        const side = inCombat ? (seat === combat.attacker ? 'attacker' : 'defender') : null;
        const foe = inCombat ? (seat === combat.attacker ? combat.defender : combat.attacker) : null;
        const p = state.players[seat];
        // The player of the step: the card's player or his opponent.
        const target = step.who === 'foe' ? foe : seat;
        switch (step.op) {
            case 'gainToken': {
                const n = this.count(R, state, seat, step);
                if (!inCombat) return null;
                const s2 = side;
                combat.tokens[s2][step.kind] += n;
                R.log(state, seat, state.players[seat].name + ' получает ' + n + ' ' + (step.kind === 'att' ? 'жетонов атаки' : 'жетонов обороны') + '.');
                return null;
            }
            case 'loseToken': {
                const n = this.count(R, state, seat, step);
                if (!inCombat) return null;
                const s2 = target === seat ? side : (side === 'attacker' ? 'defender' : 'attacker');
                combat.tokens[s2][step.kind] = Math.max(0, combat.tokens[s2][step.kind] - n);
                R.log(state, target, state.players[target].name + ' теряет ' + n + ' ' + (step.kind === 'att' ? 'жетонов атаки' : 'жетонов обороны') + '.');
                return null;
            }
            case 'gainDie': {
                const n = this.count(R, state, seat, step);
                if (!inCombat) return null;
                for (let i = 0; i < n; i++) {
                    combat.dice[side].push(step.kind === 'any' ? R.rollDice(state, 1)[0] : step.kind);
                }
                R.log(state, seat, state.players[seat].name + ' получает ' + n + ' кубик(ов).');
                return null;
            }
            case 'loseDie': {
                if (!inCombat) return null;
                const s2 = side === 'attacker' ? 'defender' : 'attacker';
                const options = combat.dice[s2].map((d, i) => i).filter(i => step.kind === 'any' || combat.dice[s2][i] === step.kind);
                if (!options.length) return null;
                return { question: { kind: 'dice', who: this.seatOf(combat, s2), op: 'loseDie', n: Math.min(step.n, options.length), options, kind2: step.kind, text: 'Какие кубики теряются?' } };
            }
            case 'rerollDie': {
                if (!inCombat) return null;
                const options = combat.dice[side].map((d, i) => i).filter(i => step.kind === 'any' || combat.dice[side][i] === step.kind);
                if (!options.length) return null;
                if (step.all) {
                    // All the dice of the kind are rerolled.
                    for (const i of options) combat.dice[side][i] = R.rollDice(state, 1)[0];
                    R.log(state, seat, state.players[seat].name + ' перебрасывает кубики.');
                    return null;
                }
                return { question: { kind: 'dice', who: this.seatOf(combat, side), op: 'rerollDie', n: Math.min(step.n, options.length), options, kind2: step.kind, text: 'Какие кубики перебросить?' } };
            }
            case 'spendDie': {
                if (!inCombat) return null;
                const options = combat.dice[side].map((d, i) => i).filter(i => step.kind === 'any' || combat.dice[side][i] === step.kind);
                if (!options.length) return null;
                if (step.all) {
                    // All the dice of the kind are spent.
                    for (const i of options) {
                        if (combat.dice[side][i] === step.kind || step.kind === 'any') combat.dice[side][i] = null;
                    }
                    combat.dice[side] = combat.dice[side].filter(d => d !== null);
                    R.log(state, seat, state.players[seat].name + ' тратит кубики.');
                    return null;
                }
                return { question: { kind: 'dice', who: this.seatOf(combat, side), op: 'spendDie', n: Math.min(step.n, options.length), options, kind2: step.kind, text: 'Какие кубики потратить?' } };
            }
            case 'flipDie': {
                if (!inCombat) return null;
                const options = combat.dice[side].map((d, i) => i).filter(i => step.kind === 'any' || combat.dice[side][i] === step.kind);
                if (!options.length) return null;
                if (step.all) {
                    for (const i of options) combat.dice[side][i] = step.to;
                    return null;
                }
                return { question: { kind: 'dice', who: this.seatOf(combat, side), op: 'flipDie', n: Math.min(step.n, options.length), options, kind2: step.kind, text: 'Какие кубики перевернуть на ' + (step.to === 'att' ? 'атаку' : step.to === 'def' ? 'оборону' : 'мораль') + '?' } };
            }
            case 'rerollValue': {
                if (!inCombat) return null;
                const options = combat.dice[side].map((d, i) => i);
                if (!options.length) return null;
                return { question: { kind: 'face', who: this.seatOf(combat, side), op: 'rerollValue', options, text: 'Какое значение кубиков перебросить?' } };
            }
            case 'discardCard': {
                if (!inCombat) return null;
                const s2 = target === seat ? side : (side === 'attacker' ? 'defender' : 'attacker');
                const hand = combat.cards[s2].hand;
                if (!hand.length) return null;
                const i = Math.floor(R.rand(state) * hand.length);
                const name = hand.splice(i, 1)[0];
                R.log(state, s2 === 'attacker' ? combat.attacker : combat.defender, 'Сброшена боевая карта «' + name + '».');
                return null;
            }
            case 'gainMateriel': {
                p.materiel = Math.min(R.MATERIEL_MAX, p.materiel + (step.n || 1));
                R.log(state, seat, state.players[seat].name + ' получает материю: ' + (step.n || 1) + '.');
                return null;
            }
            case 'gainAsset': {
                if (step.kind === 'any') {
                    return { question: { kind: 'assetType', who: seat, op: 'gainAsset', n: step.n || 1, options: ['forge', 'cache', 'reinforcement'], text: 'Какой жетон ресурса получить?' } };
                }
                const limit = p.faction === 'тираниды' && step.kind === 'reinforcement' ? 4 : 3;
                p.assets[step.kind] = Math.min(limit, (p.assets[step.kind] || 0) + (step.n || 1));
                R.log(state, seat, state.players[seat].name + ' получает жетон(ы): ' + step.kind + '.');
                return null;
            }
            case 'moveUnits': {
                const units = this.unitsOf(R, state, seat, combat, {});
                if (!units.length) return null;
                return { question: { kind: 'units', who: seat, op: 'moveUnits', n: Math.min(step.n || 1, units.length), options: units.map(u => u.id), text: 'Какие отряды переместить?' } };
            }
            case 'moveStructure': {
                const structures = state.structures.filter(s => s.seat === seat && (!step.kind || s.type === step.kind));
                if (!structures.length) return null;
                return { question: { kind: 'structures', who: seat, op: 'moveStructure', options: structures.map(s => s.id), text: 'Что переместить?' } };
            }
            case 'setDie': {
                if (!inCombat) return null;
                const options = combat.dice[side].map((d, i) => i);
                if (!options.length) return null;
                return { question: { kind: 'diceFace', who: side, op: 'setDie', n: 1, options, text: 'Какой кубик перевернуть и на какую грань?' } };
            }
            case 'route': {
                const units = this.unitsOf(R, state, target, combat, step);
                if (!units.length) return null;
                // The opponent may avoid the effect by spending a die.
                const avoid = step.avoidAsked ? null : this.avoidQuestion(R, state, target, step, combat, side);
                if (avoid) {
                    step.avoidAsked = true;
                    return avoid;
                }
                return { question: { kind: 'units', who: target, op: 'route', n: Math.min(step.n || 1, units.length), options: units.map(u => u.id), text: 'Какие отряды деморализовать?' } };
            }
            case 'restore': {
                const units = this.unitsOf(R, state, seat, combat, { routed: true });
                if (!units.length) return null;
                const n = step.all ? units.length : Math.min(step.n || 1, units.length);
                return { question: { kind: 'units', who: seat, op: 'restore', n, options: units.map(u => u.id), text: 'Какие отряды восстановить?' } };
            }
            case 'destroy': {
                const units = this.unitsOf(R, state, target, combat, step);
                if (!units.length) return null;
                const avoid = step.avoidAsked ? null : this.avoidQuestion(R, state, target, step, combat, side);
                if (avoid) {
                    step.avoidAsked = true;
                    return avoid;
                }
                return { question: { kind: 'units', who: target, op: 'destroy', n: Math.min(step.n || 1, units.length), options: units.map(u => u.id), text: 'Какие отряды уничтожить?' } };
            }
            case 'retreat': {
                const units = this.unitsOf(R, state, target, combat, {});
                if (!units.length) return null;
                return { question: { kind: 'units', who: target, op: 'retreat', n: 1, options: units.map(u => u.id), text: 'Какой отряд отступает?' } };
            }
            case 'placeUnit': {
                const faction = R.faction(state, seat);
                const names = this.unitNames(step.what, faction);
                const types = (faction ? faction.units : []).filter(u => !names.length || names.some(n => this.sameName(u.name, n)));
                const free = types.filter(u => (p.supply.units[u.id] || 0) > 0 || step.free);
                if (!free.length) return null;
                return { question: { kind: 'types', who: seat, op: 'placeUnit', n: step.n || 1, options: free.map(u => u.id), text: 'Какой отряд разместить?' } };
            }
            case 'placeStructure': {
                const areas = this.areasFor(R, state, seat, 'structure');
                if (!areas.length) return null;
                return { question: { kind: 'areas', who: seat, op: 'placeStructure', kind2: step.kind, options: areas, text: 'Где построить?' } };
            }
            case 'placeReinforcement': {
                const areas = this.areasFor(R, state, seat, 'reinforcement');
                if (!areas.length) return null;
                return { question: { kind: 'areas', who: seat, op: 'placeReinforcement', n: step.n || 1, options: areas, text: 'Где разместить жетон подкрепления?' } };
            }
            case 'moveUnit': {
                const units = this.unitsOf(R, state, seat, combat, {});
                if (!units.length) return null;
                return { question: { kind: 'units', who: seat, op: 'moveUnit', n: 1, options: units.map(u => u.id), text: 'Какой отряд переместить?' } };
            }
            case 'buyUpgrade': {
                const kind = step.kind || 'combat';
                const list = kind === 'combat'
                    ? FS_DATA.combat.filter(c => c.faction === p.faction && c.upgrade).map(c => c.name)
                    : FS_DATA.orders.filter(c => c.faction === p.faction).map(c => c.name);
                if (!list.length) return null;
                return { question: { kind: 'cards', who: seat, op: 'buyUpgrade', kind2: kind, options: list, text: 'Какое улучшение купить?' } };
            }
            case 'playCard': {
                const hand = inCombat ? combat.cards[side].hand : [];
                if (!hand.length) return null;
                return { question: { kind: 'cards', who: seat, op: 'playCard', options: hand.slice(), text: 'Какую карту разыграть?' } };
            }
            case 'chooseFoe': {
                const foes = state.players.filter(p => p.seat !== seat).map(p => p.seat);
                if (!foes.length) return null;
                return { question: { kind: 'foes', who: seat, op: 'chooseFoe', options: foes, text: 'Выберите противника.' } };
            }
            case 'chooseWorld': {
                const worlds = this.friendlyWorlds(R, state, seat);
                if (!worlds.length) return null;
                return { question: { kind: 'areas', who: seat, op: 'chooseWorld', options: worlds, text: 'Выберите дружественный мир.' } };
            }
            case 'loseAsset': {
                const p2 = state.players[target];
                const kinds = ['forge', 'cache', 'reinforcement'].filter(k => (p2.assets[k] || 0) > 0);
                if (!kinds.length) return null;
                return { question: { kind: 'assets', who: target, op: 'loseAsset', n: Math.min(step.n || 1, kinds.length), options: kinds, text: 'Какой жетон ресурса теряется?' } };
            }
            case 'gainWorldAssets': {
                const worlds = this.friendlyWorlds(R, state, seat);
                if (!worlds.length) return null;
                return { question: { kind: 'areas', who: seat, op: 'gainWorldAssets', options: worlds, text: 'С какого мира взять ресурсы?' } };
            }
            case 'gainSystemMateriel': {
                const systems = R.state ? [] : [];
                const list = state.systems.filter(sys => sys.areas.some(a => R.control(state, seat, sys.id, a.pos) === 'friendly'));
                if (!list.length) return null;
                return { question: { kind: 'systems', who: seat, op: 'gainSystemMateriel', options: list.map(x => x.id), text: 'Из какой системы взять материю?' } };
            }
            case 'extraDamage': {
                if (!inCombat) return null;
                combat.extraDamage = (combat.extraDamage || 0) + (step.n || 0);
                return null;
            }
            case 'ignoreBastion': {
                if (state.order) state.order.ignoreBastion = true;
                return null;
            }
            case 'noRoute': {
                if (!inCombat) return null;
                combat.noRoute = combat.noRoute || [];
                combat.noRoute.push(step.who === 'foe' ? foe : seat);
                return null;
            }
            case 'citiesAsFactories': {
                if (state.order) state.order.citiesAsFactories = true;
                return null;
            }
            case 'shipsThroughStorms': {
                if (state.order) state.order.shipsThroughStorms = true;
                return null;
            }
            case 'deployLimit': {
                if (state.order) state.order.deployLimitBonus = (state.order.deployLimitBonus || 0) + (step.n || 0);
                return null;
            }
            case 'orderKl': {
                // The command level of the player is higher while the order runs.
                if (state.order) state.order.klBonus = (state.order.klBonus || 0) + (step.n || 0);
                return null;
            }
            case 'citiesAsFactories': {
                if (state.order) state.order.citiesAsFactories = true;
                return null;
            }
            case 'shipsThroughStorms': {
                if (state.order) state.order.shipsThroughStorms = true;
                return null;
            }
            case 'deployLimit': {
                if (state.order) state.order.deployLimitBonus = (state.order.deployLimitBonus || 0) + (step.n || 0);
                return null;
            }
            case 'orderKl': {
                // The command level of the player is higher while the order runs.
                if (state.order) state.order.klBonus = (state.order.klBonus || 0) + (step.n || 0);
                return null;
            }
            case 'once':
            case 'note': {
                // The sentence says no rule of its own.
                return null;
            }
            case 'scheme': {
                // The card stays in play: the scheme waits for its moment.
                const schemes = state.players[seat].schemes || [];
                for (const s of schemes) {
                    if (s && s.name && s.trigger) return null;
                }
                return null;
            }
            case 'trigger': {
                // The scheme waits: it is used when its moment comes.
                return null;
            }
            case 'choice': {
                return { question: { kind: 'choice', who: seat, op: 'choice', options: step.options, text: step.text } };
            }
            case 'icons': {
                // The icons of a phrase that the rules did not read: the tokens
                // and the dice are taken as they are.
                for (const ic of step.icons || []) {
                    const s2 = step.who === 'foe' ? (side === 'attacker' ? 'defender' : 'attacker') : side;
                    if (!s2) continue;
                    if (ic.kind === 'token') {
                        if (step.who === 'foe') combat.tokens[s2][ic.icon] = Math.max(0, combat.tokens[s2][ic.icon] - 1);
                        else combat.tokens[s2][ic.icon] += 1;
                    } else if (ic.kind === 'cube') {
                        if (step.who === 'foe') combat.dice[s2].pop();
                        else combat.dice[s2].push(ic.icon === 'any' ? R.rollDice(state, 1)[0] : ic.icon);
                    }
                }
                return null;
            }
            default:
                return null;
        }
    },

    // The answer of the player is applied to the step.
    apply(R, state, seat, step, answer, ctx) {
        const p = state.players[seat];
        const combat = state.combat;
        const inCombat = ctx && ctx.kind === 'combat';
        const owner = ctx && ctx.owner !== undefined ? ctx.owner : seat;
        const side = inCombat ? (owner === combat.attacker ? 'attacker' : 'defender') : null;
        const target = step.who === 'foe' && inCombat ? (owner === combat.attacker ? combat.defender : combat.attacker) : owner;
        const units = ids => (answer.units || ids || []).map(id => state.units.find(u => u.id === id)).filter(Boolean);
        switch (step.op) {
            case 'loseDie': {
                const s2 = side === 'attacker' ? 'defender' : 'attacker';
                for (const i of (answer.dice || [])) {
                    if (i >= 0 && i < combat.dice[s2].length) combat.dice[s2].splice(i, 1);
                }
                return null;
            }
            case 'rerollDie': {
                for (const i of (answer.dice || [])) {
                    if (i >= 0 && i < combat.dice[side].length) combat.dice[side][i] = R.rollDice(state, 1)[0];
                }
                return null;
            }
            case 'spendDie': {
                for (const i of (answer.dice || []).slice().sort((a, b) => b - a)) {
                    if (i >= 0 && i < combat.dice[side].length) combat.dice[side].splice(i, 1);
                }
                return null;
            }
            case 'flipDie': {
                for (const i of (answer.dice || [])) {
                    if (i >= 0 && i < combat.dice[side].length) combat.dice[side][i] = step.to;
                }
                return null;
            }
            case 'rerollValue': {
                // All the dice of the chosen value are rerolled.
                const face = answer.face || 'att';
                for (let i = 0; i < combat.dice[side].length; i++) {
                    if (combat.dice[side][i] === face) combat.dice[side][i] = R.rollDice(state, 1)[0];
                }
                return null;
            }
            case 'gainAsset': {
                const kind = answer.asset || 'forge';
                const limit = p.faction === 'тираниды' && kind === 'reinforcement' ? 4 : 3;
                p.assets[kind] = Math.min(limit, (p.assets[kind] || 0) + (step.n || 1));
                R.log(state, seat, state.players[seat].name + ' получает жетон(ы): ' + kind + '.');
                return null;
            }
            case 'moveUnits': {
                const list = units(answer.units);
                if (!list.length) return null;
                const area = answer.area;
                if (!area) {
                    const areas = this.friendlyAreas(R, state, seat);
                    return { question: { kind: 'areas', who: seat, op: 'moveUnits', options: areas, text: 'Куда переместить отряды?' } };
                }
                for (const u of list) {
                    u.system = area.system;
                    u.area = area.pos;
                }
                R.log(state, seat, state.players[seat].name + ' перемещает отряды.');
                return null;
            }
            case 'moveStructure': {
                const s = state.structures.find(x => x.id === (answer.structure || answer.id));
                const area = answer.area;
                if (!s || !area) return null;
                s.system = area.system;
                s.area = area.pos;
                R.log(state, seat, state.players[seat].name + ' перемещает постройку.');
                return null;
            }
            case 'setDie': {
                const i = answer.dice && answer.dice.length ? answer.dice[0] : -1;
                if (i >= 0 && i < combat.dice[side].length) combat.dice[side][i] = answer.face || 'att';
                return null;
            }
            case 'route': {
                for (const u of units(answer.units)) {
                    u.routed = true;
                    R.log(state, u.seat, state.players[u.seat].name + ': отряд деморализован.');
                }
                return null;
            }
            case 'restore': {
                for (const u of units(answer.units)) {
                    u.routed = false;
                    R.log(state, u.seat, state.players[u.seat].name + ': отряд восстановлен.');
                }
                return null;
            }
            case 'destroy': {
                for (const u of units(answer.units)) R.destroyUnit(state, u);
                return null;
            }
            case 'retreat': {
                const u = units(answer.units)[0];
                if (!u) return null;
                u.routed = true;
                R.log(state, u.seat, state.players[u.seat].name + ': отряд отступает.');
                return null;
            }
            case 'placeUnit': {
                const def = R.unitDef(state, seat, answer.type);
                if (!def) return null;
                const area = answer.area;
                if (!area) {
                    // The place of the unit is the next question.
                    const areas = this.areasFor(R, state, seat, def.type === 'ship' ? 'void' : 'world');
                    return { question: { kind: 'areas', who: seat, op: 'placeUnit', kind2: def.id, options: areas, text: 'Где разместить отряд?' } };
                }
                const sys = R.system(state, area.system);
                const a = R.area(sys, area.pos);
                if (!a) return null;
                if (!step.free) p.supply.units[def.id]--;
                R.addUnit(state, seat, def.id, area.system, area.pos);
                R.log(state, seat, state.players[seat].name + ' размещает «' + def.name + '».');
                return null;
            }
            case 'placeStructure': {
                const area = answer.area;
                if (!area) return null;
                const stats = R.structureStats(step.kind);
                if (!step.free) {
                    if ((p.supply.structures[step.kind] || 0) <= 0) return null;
                    p.supply.structures[step.kind]--;
                    p.materiel -= stats.cost;
                }
                R.addStructure(state, seat, step.kind, area.system, area.pos);
                R.log(state, seat, state.players[seat].name + ' строит: ' + R.structureName(step.kind) + '.');
                return null;
            }
            case 'placeReinforcement': {
                const area = answer.area;
                if (!area) return null;
                if (!combat) return null;
                const n = Math.min(step.n || 1, p.assets.reinforcement || 0);
                p.assets.reinforcement -= n;
                combat.reinforce = combat.reinforce || { attacker: 0, defender: 0 };
                combat.reinforce[side] = (combat.reinforce[side] || 0) + n;
                R.log(state, seat, state.players[seat].name + ' размещает ' + n + ' жетон(ов) подкрепления.');
                return null;
            }
            case 'moveUnit': {
                const u = units(answer.units)[0];
                const area = answer.area;
                if (!u) return null;
                if (!area) {
                    const areas = this.friendlyAreas(R, state, seat);
                    return { question: { kind: 'areas', who: seat, op: 'moveUnit', options: areas, text: 'Куда переместить отряд?' } };
                }
                u.system = area.system;
                u.area = area.pos;
                return null;
            }
            case 'buyUpgrade': {
                const card = answer.card;
                if (!card) return null;
                if (step.kind === 'combat') {
                    const c = FS_DATA.combat.find(x => x.faction === p.faction && x.upgrade && x.name === card);
                    if (!c) return null;
                    if (p.materiel < c.cost) return null;
                    p.materiel -= c.cost;
                    const deck = p.decks.combat;
                    deck.splice(0, 2);
                    deck.push(c.name, c.name);
                } else {
                    const c = FS_DATA.orders.find(x => x.faction === p.faction && x.name === card);
                    if (!c) return null;
                    if (p.materiel < c.cost) return null;
                    p.materiel -= c.cost;
                    p.upgrades.push({ name: c.name, used: false, order: c.order });
                }
                R.log(state, seat, state.players[seat].name + ' покупает улучшение «' + card + '».');
                return null;
            }
            case 'playCard': {
                const name = answer.card;
                if (!name || !inCombat) return null;
                const hand = combat.cards[side].hand;
                const i = hand.indexOf(name);
                if (i < 0) return null;
                hand.splice(i, 1);
                const card = FS_DATA.combat.find(x => x.faction === p.faction && x.name === name);
                combat.cards[side].played.push({ name, card, valuesOnly: true });
                return null;
            }
            case 'chooseFoe': {
                const foes = state.players.filter(p => p.seat !== seat).map(p => p.seat);
                if (!foes.length) return null;
                return { question: { kind: 'foes', who: seat, op: 'chooseFoe', options: foes, text: 'Выберите противника.' } };
            }
            case 'chooseWorld': {
                const worlds = this.friendlyWorlds(R, state, seat);
                if (!worlds.length) return null;
                return { question: { kind: 'areas', who: seat, op: 'chooseWorld', options: worlds, text: 'Выберите дружественный мир.' } };
            }
            case 'loseAsset': {
                const p2 = state.players[target];
                const kinds = ['forge', 'cache', 'reinforcement'].filter(k => (p2.assets[k] || 0) > 0);
                if (!kinds.length) return null;
                return { question: { kind: 'assets', who: target, op: 'loseAsset', n: Math.min(step.n || 1, kinds.length), options: kinds, text: 'Какой жетон ресурса теряется?' } };
            }
            case 'chooseFoe': {
                const foes = state.players.filter(p => p.seat !== seat).map(p => p.seat);
                if (!foes.length) return null;
                return { question: { kind: 'foes', who: seat, op: 'chooseFoe', options: foes, text: 'Выберите противника.' } };
            }
            case 'chooseFoe': {
                // The opponent of the effect.
                if (answer.foe !== undefined) ctx.foe = answer.foe;
                return null;
            }
            case 'chooseWorld': {
                // The world of the effect: the next steps work with it.
                if (answer.area) ctx.world = answer.area;
                return null;
            }
            case 'loseAsset': {
                const p2 = state.players[target];
                const kind = answer.asset || (answer.assets || [])[0];
                if (!kind) return null;
                p2.assets[kind] = Math.max(0, (p2.assets[kind] || 0) - (step.n || 1));
                R.log(state, target, state.players[target].name + ' теряет жетон: ' + kind + '.');
                return null;
            }
            case 'gainWorldAssets': {
                const area = answer.area || ctx.world;
                if (!area) return null;
                const sys = R.system(state, area.system);
                const a = R.area(sys, area.pos);
                if (!a || !a.world) return null;
                p.materiel = Math.min(R.MATERIEL_MAX, p.materiel + (a.world.materiel || 0));
                for (const asset of a.world.assets || []) {
                    if (asset === 'prosperity') continue;
                    const limit = p.faction === 'тираниды' && asset === 'reinforcement' ? 4 : 3;
                    if ((p.assets[asset] || 0) < limit) p.assets[asset] = (p.assets[asset] || 0) + 1;
                }
                R.log(state, seat, state.players[seat].name + ' берёт ресурсы мира ' + a.world.name + '.');
                return null;
            }
            case 'gainSystemMateriel': {
                const sys = state.systems.find(x => x.id === answer.system);
                if (!sys) return null;
                let sum = 0;
                for (const a of sys.areas) {
                    if (!a.world) continue;
                    if (R.control(state, seat, sys.id, a.pos) !== 'friendly') continue;
                    sum += a.world.materiel || 0;
                }
                p.materiel = Math.min(R.MATERIEL_MAX, p.materiel + sum);
                R.log(state, seat, state.players[seat].name + ' получает материю: ' + sum + '.');
                return null;
            }
            case 'choice': {
                const i = Number(answer.choice);
                const option = step.options && step.options[i];
                if (!option) return null;
                return this.step(R, state, seat, option, ctx);
            }
            default:
                return null;
        }
    },

    // The number of the effect: "for every unit" is counted here.
    count(R, state, seat, step) {
        let n = step.n || 1;
        if (step.per === 'unit') {
            const units = state.units.filter(u => u.seat === seat && !u.routed);
            const matching = step.filter && step.filter.types
                ? units.filter(u => {
                    const def = R.unitOf(state, u);
                    return def && step.filter.types.some(t => this.sameName(def.name, t));
                })
                : units;
            // "for every unit of a different command level" — one for each level.
            const byLevel = step.distinctLevel || (step.text && /разным командным уровнем/i.test(step.text));
            const amount = byLevel
                ? new Set(matching.map(u => {
                    const def = R.unitOf(state, u);
                    return def ? def.kl : 0;
                })).size
                : matching.length;
            n = (step.n || 1) * amount;
            if (step.max) n = Math.min(n, step.max);
        }
        return Math.max(0, n);
    },

    // "He may avoid this by spending 1 `any cube`." — the question of the
    // payment: the affected player may pay the die.
    avoidQuestion(R, state, seat, step, combat, side) {
        if (!step.avoid || !combat) return null;
        const s2 = seat === combat.attacker ? 'attacker' : 'defender';
        const dice = combat.dice[s2] || [];
        const fit = dice.map((d, i) => i).filter(i => step.avoid.kind === 'any' || dice[i] === step.avoid.kind);
        if (!fit.length) return null;
        return {
            question: {
                kind: 'yesno', who: seat, op: 'avoid', n: step.avoid.n, options: fit,
                kind2: step.avoid.kind, text: 'Избежать эффекта, потратив кубик?',
            },
        };
    },

    // The units of the area of the combat (or the whole board).
    unitsOf(R, state, seat, combat, step) {
        let units;
        if (combat) {
            units = state.units.filter(u => u.seat === seat && u.system === combat.system && u.area === combat.pos);
        } else {
            units = state.units.filter(u => u.seat === seat);
        }
        if (step.routed) units = units.filter(u => u.routed);
        else units = units.filter(u => !u.routed);
        if (step.filter && step.filter.types) {
            units = units.filter(u => {
                const def = R.unitOf(state, u);
                return def && step.filter.types.some(t => this.sameName(def.name, t));
            });
        }
        return units;
    },

    // The areas where a piece may stand.
    areasFor(R, state, seat, what) {
        const out = [];
        for (const sys of state.systems) {
            for (const area of sys.areas) {
                if (what === 'structure') {
                    if (!area.world) continue;
                    if (R.control(state, seat, sys.id, area.pos) !== 'friendly') continue;
                    if (R.structuresAt(state, sys.id, area.pos).length) continue;
                } else if (what === 'reinforcement') {
                    if (!combatArea(state, sys.id, area.pos)) continue;
                } else if (what === 'void') {
                    if (area.world) continue;
                } else {
                    if (!area.world) continue;
                    const theirs = state.units.some(u => u.system === sys.id && u.area === area.pos && u.seat !== seat);
                    if (theirs) continue;
                }
                out.push({ system: sys.id, pos: area.pos });
            }
        }
        return out;
    },

    // The friendly worlds of the active system: the destination of the units.
    friendlyAreas(R, state, seat) {
        const out = [];
        const active = state.order ? state.order.system : null;
        for (const sys of state.systems) {
            if (active && sys.id !== active) continue;
            for (const area of sys.areas) {
                if (!area.world) continue;
                if (R.control(state, seat, sys.id, area.pos) !== 'friendly') continue;
                out.push({ system: sys.id, pos: area.pos });
            }
        }
        return out;
    },

    // The friendly worlds of the player.
    friendlyWorlds(R, state, seat) {
        const out = [];
        for (const sys of state.systems) {
            for (const area of sys.areas) {
                if (!area.world) continue;
                if (R.control(state, seat, sys.id, area.pos) !== 'friendly') continue;
                out.push({ system: sys.id, pos: area.pos });
            }
        }
        return out;
    },

    // The moment of the scheme: when the card may be discarded.
    triggerOf(text) {
        const s = String(text || '').toLowerCase();
        if (/начал[а-яёa-z]*\s+шага нанесения повреждений/.test(s)) return 'damage';
        if (/начал[а-яёa-z]*\s+раунда боя/.test(s)) return 'round';
        if (/начал[а-яёa-z]*\s+боя/.test(s)) return 'combat-start';
        if (/конц[а-яёa-z]*\s+боя/.test(s)) return 'combat-end';
        if (/орбитальн[а-яёa-z]*\s+удар/.test(s)) return 'strike';
        if (/начал[а-яёa-z]*\s+фазы планирования/.test(s)) return 'planning';
        if (/конц[а-яёa-z]*\s+фазы планирования/.test(s)) return 'planning-end';
        if (/начал[а-яёa-z]*\s+фазы действий/.test(s)) return 'operations';
        if (/перемеща[а-яёa-z]*\s+варп-шторм/.test(s)) return 'storm';
        if (/покупк[а-яёa-z]*\s+отряда/.test(s)) return 'buy-unit';
        if (/активаци[а-яёa-z]*\s+(?:любого\s+)?вашего приказа/.test(s)) return 'order';
        if (/вынужден[а-яёa-z]*\s+пропустить ход/.test(s)) return 'skip';
        return null;
    },

    // The faction of the context: the units of the text belong to it.
    factionOf(ctx) {
        if (!ctx || !ctx.faction) return null;
        const list = (typeof FS_DATA !== 'undefined' && FS_DATA.factions) ? FS_DATA.factions : [];
        return list.find(f => f.id === ctx.faction) || null;
    },

    // The names of the units of the text: "a Guardsman" -> the guardsmen.
    unitNames(what, faction) {
        if (!what || !faction) return [];
        const text = String(what).toLowerCase();
        const words = text.split(/[^а-яёa-z']+/).filter(Boolean);
        const last = words.length ? words[words.length - 1] : text;
        const names = [];
        for (const u of faction.units) {
            if (this.sameName(u.name, text) || this.sameName(u.name, last)) names.push(u.name);
        }
        return names;
    },

    // The names of the units are written in different cases: "Гвардейца" and
    // "Гвардейцы" are the same unit.
    sameName(a, b) {
        const clean = t => String(t || '').toLowerCase().replace(/[^а-яёa-z'\s]/g, ' ').replace(/\s+/g, ' ').trim();
        const x = clean(a);
        const y = clean(b);
        if (!x || !y) return false;
        if (x === y) return true;
        // The last word of the name: "Инквизиторские штурмовики" and
        // "штурмовика" are the same unit.
        const words = s => s.split(/\s+/).filter(Boolean);
        const wx = words(x);
        const wy = words(y);
        const last = wx[wx.length - 1];
        const last2 = wy[wy.length - 1];
        if (last && last2 && this.stem(last) === this.stem(last2)) return true;
        // The whole name without the spaces: "Гвардейцы" and "Гвардеец".
        const sx = x.replace(/\s+/g, '');
        const sy = y.replace(/\s+/g, '');
        const n = Math.min(4, sx.length, sy.length);
        return sx.slice(0, n) === sy.slice(0, n);
    },

    // The stem of the name: the first letters of the word. The endings of the
    // Russian plural differ: "бойзов", "бойзы" and "Бойзы" are the same unit.
    stem(word) {
        const w = String(word || '').toLowerCase();
        return w.slice(0, Math.min(4, w.length));
    },
};

// The area of the combat (the reinforcement goes there).
function combatArea(state, systemId, pos) {
    const c = state.combat;
    return !!(c && c.system === systemId && c.pos === pos);
}

// The rules of the sentences. The first that matches wins.
/** @type {{re: RegExp, build: (m: RegExpExecArray, ctx: any, s: string) => any}[]} */
const RULES = [
    // "Place this card in your play area and discard all your other schemes."
    {
        re: /размест[а-яёa-z]*\s+эту карту в (?:своей|вашей) игровой зоне/i,
        build: () => ({ op: 'scheme' }),
    },
    // "You may discard this card <when>, to <the effect>." — the scheme waits
    // for its moment.
    {
        re: /сбросить эту карту\s*(.*?)(?:,\s*(?:для того,)?\s*чтобы\s+(.*))?$/i,
        build: (m, ctx, s) => {
            const trigger = FS_EFFECTS.triggerOf(s);
            if (!trigger) return null;
            const steps = m[2] ? FS_EFFECTS.parse(m[2], ctx || {}) : [];
            return { op: 'trigger', trigger, steps, text: s, note: !steps.length };
        },
    },
    // "your opponent loses 2 `att. token`" / "the opponent loses 1 `def. cube`"
    {
        re: /(?:противник|вражеск[а-яёa-z]*|он)(?![а-яёa-z])[^.`]{0,40}?(?:теряет|терять|потеряет|потерять|теряют|потеряют)\s+([^;]{0,80})/i,
        build: m => {
            const icons = [...m[1].matchAll(/`([^`]+)`/g)].map(x => x[1]);
            if (!icons.length) return null;
            const n = num((m[1].match(/\d+/) || [])[0]);
            const steps = [];
            for (const ic of icons) {
                const kind = FS_EFFECTS.iconKind(ic);
                if (kind === 'token') steps.push({ op: 'loseToken', n, kind: FS_EFFECTS.icon(ic), who: 'foe' });
                else if (kind === 'cube') steps.push({ op: 'loseDie', n, kind: FS_EFFECTS.icon(ic), pick: true, who: 'foe' });
            }
            return steps.length ? steps : null;
        },
    },
    // "the opponent loses 1 die of their choice"
    {
        re: /(?:противник[а-яёa-z]*|он(?![а-яёa-z]))[^.`]{0,40}?теря[а-яёa-z]*\s+(\d+)?\s*кубик/i,
        build: m => ({ op: 'loseDie', n: num(m[1]), kind: 'any', pick: true }),
    },
    // "you must reroll 1 `any cube`" / "reroll all your `def. cube`"
    {
        re: /(?:переброс[а-яёa-z]*|перебрас[а-яёa-z]*)\s+(?:до\s+)?(всех|все|(\d+))?\s*(?:ваш[а-яёa-z]*|свои|своих|из своих)?\s*`([^`]+)`/i,
        build: m => {
            if (FS_EFFECTS.iconKind(m[3]) !== 'cube') return null;
            const all = /все/.test(m[1] || '');
            return { op: 'rerollDie', n: all ? 99 : num(m[2]), kind: FS_EFFECTS.icon(m[3]), all, pick: true };
        },
    },
    // "reroll up to 2 of your dice"
    {
        re: /переброс[а-яёa-z]*\s+(?:до\s+)?(всех|(\d+))?\s*(?:ваш[а-яёa-z]*|свои|своих)\s+кубик/i,
        build: m => ({ op: 'rerollDie', n: /все/.test(m[1] || '') ? 99 : num(m[2]), kind: 'any', all: /все/.test(m[1] || ''), pick: true }),
    },
    // "reroll all the dice of one value"
    {
        re: /переброс[а-яёa-z]*\s+все[а-яёa-z]*\s+(?:ваш[а-яёa-z]*|свои)\s+кубик[а-яёa-z]*\s+одного\s+конкретного\s+значения/i,
        build: () => ({ op: 'rerollValue' }),
    },
    // "flip 1 of your dice to any side"
    {
        re: /переверн[а-яёa-z]*\s+(?:до\s+)?(\d+)?\s*(?:ваш[а-яёa-z]*|из своих|свои)\s+(?:`([^`]+)`\s*)?кубик[а-яёa-z]*\s+на любую сторону/i,
        build: m => ({ op: 'setDie', n: num(m[1]), kind: 'any', pick: true }),
    },
    // "flip up to 2 of your `att. cube` to `def. cube`"
    {
        re: /переверн[а-яёa-z]*\s+(?:до\s+)?(всех|все|любые|(\d+))?\s*(?:ваш[а-яёa-z]*|из своих|своих|свои)?\s*(?:`([^`]+)`\s*)?(?:кубик[а-яёa-z]*\s*)?(?:на|в)\s*`([^`]+)`/i,
        build: m => ({
            op: 'flipDie', n: /все|любые/.test(m[1] || '') ? 99 : num(m[2]),
            kind: m[3] ? FS_EFFECTS.icon(m[3]) : 'any', to: FS_EFFECTS.icon(m[4]),
            all: /все|любые/.test(m[1] || ''), pick: true,
        }),
    },
    // "flip any number of `morale cube` to `att. cube`"
    {
        re: /переверн[а-яёa-z]*\s+любое количество\s*`([^`]+)`\s*на\s*`([^`]+)`/i,
        build: m => ({ op: 'flipDie', n: 99, kind: FS_EFFECTS.icon(m[1]), to: FS_EFFECTS.icon(m[2]), all: true, pick: true }),
    },
    // "you must spend 1 `def. cube`" / "spend up to 3 `morale cube`"
    {
        re: /потрат[а-яёa-z]*\s+(?:любое количество\s+)?(?:до\s+)?(всех|(\d+))?\s*`([^`]+)`/i,
        build: m => {
            if (FS_EFFECTS.iconKind(m[3]) !== 'cube') return null;
            const all = /все/.test(m[1] || '');
            return { op: 'spendDie', n: all ? 99 : num(m[2]), kind: FS_EFFECTS.icon(m[3]), all, pick: true };
        },
    },
    // "spend any number of dice" / "spend up to 2 dice"
    {
        re: /потрат[а-яёa-z]*\s+(?:любое количество|до\s+(\d+))?\s*кубик/i,
        build: m => ({ op: 'spendDie', n: m[1] ? num(m[1]) : 99, kind: 'any', all: !m[1], pick: true }),
    },
    // "the opponent must reroll 1 die of your choice"
    {
        re: /(?:противник[а-яёa-z]*|он(?![а-яёa-z]))[^.`]{0,40}?(?:переброс[а-яёa-z]*|перебрас[а-яёa-z]*)\s+(\d+)?\s*кубик/i,
        build: m => ({ op: 'rerollDie', n: num(m[1]), kind: 'any', who: 'foe', pick: true }),
    },
    // "get 1 `att. token` for every unrouted Guardsman or Cruiser, maximum 3"
    {
        re: /(?:получ[а-яёa-z]*|взять|возьм[а-яёa-z]*|достаньте)\s+(\d+)?\s*`([^`]+)`[^.`]{0,90}?за кажд[а-яёa-z]+\s+(?:ваш[а-яёa-z]*\s+)?недеморализованн[а-яёa-z]*\s+([^,.]{2,70}?)(?:,\s*максимум\s+(\d+))?/i,
        build: m => {
            const kind = FS_EFFECTS.iconKind(m[2]);
            if (kind !== 'token' && kind !== 'cube') return null;
            return {
                op: kind === 'token' ? 'gainToken' : 'gainDie',
                n: num(m[1]), kind: FS_EFFECTS.icon(m[2]), per: 'unit',
                filter: unitFilter(m[3]), max: m[4] ? Number(m[4]) : null, text: m[0],
            };
        },
    },
    // "you get 2 att. token and 1 def. token" (the icons without the backticks)
    {
        re: /получ[а-яёa-z]*\s+(\d+)?\s*(att|def|morale)\.\s*token/i,
        build: m => ({ op: 'gainToken', n: num(m[1]), kind: FS_EFFECTS.icon(m[2]) }),
    },
    // "do not use its ability, but take its combat values"
    {
        re: /не применяйте[а-яёa-z]*\s+е[её]\s+способности[^.]*,\s*но получите[а-яёa-z]*\s+е[её]\s+боев/i,
        build: () => ({ op: 'playCard', values: true, pick: true }),
    },
    // "get 1 `any cube`" / "get 2 `att. token`"
    {
        re: /(?:получ[а-яёa-z]*|взять|возьм[а-яёa-z]*|достаньте)\s+(\d+|два|одно)?\s*`([^`]+)`/i,
        build: m => {
            const kind = FS_EFFECTS.iconKind(m[2]);
            if (kind === 'token') return { op: 'gainToken', n: num(m[1]), kind: FS_EFFECTS.icon(m[2]) };
            if (kind === 'cube') return { op: 'gainDie', n: num(m[1]), kind: FS_EFFECTS.icon(m[2]) };
            return null;
        },
    },
    // "get 2 materiel" / "get 1 materiel token"
    {
        re: /получ[а-яёa-z]*\s+(\d+)?\s*(?:жетон[а-яёa-z]*\s+)?(?:материал[а-яёa-z]*|материи)/i,
        build: m => ({ op: 'gainMateriel', n: num(m[1]) }),
    },
    // "the opponent must choose and route 1 of his units"
    {
        re: /(?:противник[а-яёa-z]*|он(?![а-яёa-z]))[^.`]{0,40}?(?<!не)деморализ[а-яёa-z]*\s+(?:и\s+)?(?:(\d+)\s*)?(?:свой|ваш|одного|одну|1)?\s*(?:отряд[а-яёa-z]*|юнит[а-яёa-z]*)?/i,
        build: m => ({ op: 'route', n: num(m[1]), pick: true, who: 'foe' }),
    },
    // "you must route 1 of your units" / "demoralise 1 enemy unit"
    {
        re: /(?<!не)деморализ[а-яёa-z]*\s+(?:(\d+)\s*)?(?:ваш|вражеск|противник[а-яёa-z]*|1|одного|одну)?\s*(?:отряд[а-яёa-z]*|юнит[а-яёa-z]*)?/i,
        build: m => ({ op: 'route', n: num(m[1]), pick: true }),
    },
    // "restore 1 of your routed units" / "restore all your units"
    {
        re: /восстанов[а-яёa-z]*\s+(всех?\s*)?(?:(\d+)\s+)?(?:ваш[а-яёa-z]*|сво[еи][а-яёa-z]*)?\s*(?:деморализованн[а-яёa-z]*\s+)?(?:отряд[а-яёa-z]*|юнит[а-яёa-z]*|пехот[а-яёa-z]*)/i,
        build: m => ({ op: 'restore', n: m[2] ? num(m[2]) : 1, all: !!m[1], pick: true }),
    },
    // "the opponent chooses and destroys 1 of his routed units"
    {
        re: /(?:противник[а-яёa-z]*|он(?![а-яёa-z]))[^.`]{0,50}?уничтож[а-яёa-z]*\s+(?:(\d+)\s+)?(?:свой[а-яёa-z]*\s+)?(?:деморализованн[а-яёa-z]*\s+)?(?:отряд[а-яёa-z]*|юнит[а-яёa-z]*)/i,
        build: m => ({ op: 'destroy', n: num(m[1]), pick: true, who: 'foe' }),
    },
    // "destroy 1 of your unrouted units" / "destroy a cultist unit"
    {
        re: /уничтож[а-яёa-z]*\s+(?:(\d+)\s+)?(?:одного|одну|1|ваш[а-яёa-z]*\s+недеморализованн[а-яёa-z]*\s+(?:отряд[а-яёa-z]*|юнит[а-яёa-z]*)|отряд[а-яёa-z]*|юнит[а-яёa-z]*)/i,
        build: m => ({ op: 'destroy', n: m[1] ? num(m[1]) : 1, max: /до\s/.test(m[0]), pick: true }),
    },
    // "place 1 free Guardsman in a friendly world" / "place 2 free reinforcement tokens"
    {
        re: /(?:размест[а-яёa-z]*|помест[а-яёa-z]*)\s+(?:(\d+)\s+)?(?:бесплатн[а-яёa-z]+\s+)?([^,.;]{2,60}?)(?:\s+в\s+|\s+на\s+|\.?\s*$)/i,
        build: (m, ctx) => {
            const what = (m[2] || '').trim();
            const n = num(m[1]) || 1;
            if (/подкреплен/.test(what)) return { op: 'placeReinforcement', n, pick: true };
            if (/бастион/.test(what)) return { op: 'placeStructure', kind: 'bastion', n: 1, free: true, pick: true };
            if (/город/.test(what)) return { op: 'placeStructure', kind: 'city', n: 1, free: true, pick: true };
            if (/фабрик/.test(what)) return { op: 'placeStructure', kind: 'factory', n: 1, free: true, pick: true };
            const faction = FS_EFFECTS.factionOf(ctx);
            const names = FS_EFFECTS.unitNames(what, faction);
            if (names.length) return { op: 'placeUnit', n, what: names[0], pick: true, free: true };
            return null;
        },
    },
    // "buy 1 unit" (the ability of the faction: the unit is bought)
    {
        re: /куп[а-яёa-z]*\s+(\d+)?\s*(?:отряд[а-яёa-z]*|юнит[а-яёa-z]*)/i,
        build: (m, ctx) => {
            const faction = FS_EFFECTS.factionOf(ctx);
            const names = faction ? faction.units.map(u => u.name) : [];
            return { op: 'placeUnit', n: num(m[1]) || 1, what: names, pick: true, buy: true };
        },
    },
    // "buy 1 structure and place it"
    {
        re: /куп[а-яёa-z]*\s+(\d+)?\s*(?:одну\s+)?постройк[а-яёa-z]*/i,
        build: m => ({ op: 'placeStructure', kind: 'any', n: num(m[1]) || 1, buy: true, pick: true }),
    },
    // "move 1 of your units to a neighbouring friendly area"
    {
        re: /перемест[а-яёa-z]*\s+(\d+)?\s*(?:одним из своих|одного|ваш[а-яёa-z]*|свои|любые)?\s*(?:отряд[а-яёa-z]*|юнит[а-яёa-z]*|отряда)/i,
        build: m => ({ op: 'moveUnit', n: num(m[1]) || 1, pick: true }),
    },
    // "take any number of your units from one world and place them in a friendly world"
    {
        re: /забра[а-яёa-z]*\s+(?:любое количество\s+)?(?:(\d+)\s+)?ваш[а-яёa-z]*\s+(?:отряд[а-яёa-z]*|юнит[а-яёa-z]*|корабл[а-яёa-z]*)[^`]{0,80}?и размест[а-яёa-z]*\s+их?/i,
        build: m => ({ op: 'moveUnits', n: m[1] ? num(m[1]) : 99, pick: true }),
    },
    // "take 1 of your units from any world and place it in this world"
    {
        re: /заберите 1 ваш отряд[^.]{0,60}?разместите его/i,
        build: () => ({ op: 'moveUnit', n: 1, pick: true }),
    },
    // "move 1 of your factories"
    {
        re: /передвин[а-яёa-z]*\s+(\d+)?\s*(?:из ваших|одну из ваших|1 из ваших)?\s*фабрик/i,
        build: m => ({ op: 'moveStructure', n: num(m[1]) || 1, kind: 'factory', pick: true }),
    },
    // "the opponent retreats with one of his units"
    {
        re: /(?:противник[а-яёa-z]*|он(?![а-яёa-z]))[^.`]{0,40}?отступ[а-яёa-z]*\s+(?:одним из своих|одного|1)?\s*(?:отряд[а-яёa-z]*|юнит[а-яёa-z]*)/i,
        build: () => ({ op: 'retreat', who: 'foe', pick: true }),
    },
    // "you may retreat with one of your units" / "retreat with one of your units"
    {
        re: /отступ[а-яёa-z]*\s+(?:одним из своих|одного|1|любым числом)?\s*(?:отряд[а-яёa-z]*|юнит[а-яёa-z]*|гвардеец[а-яёa-z]*)?/i,
        build: () => ({ op: 'retreat', who: 'me', pick: true }),
    },
    // "buy 1 combat upgrade"
    {
        re: /(?:куп[а-яёa-z]*|приобрет[а-яёa-z]*)\s+1\s+(?:боевое улучшение|улучшение)/i,
        build: m => ({ op: 'buyUpgrade', kind: /боевое/.test(m[0]) ? 'combat' : 'order', pick: true }),
    },
    // "play 1 card from your hand" / "take the top card of your deck"
    {
        re: /(?:разыгра[а-яёa-z]*|сыгра[а-яёa-z]*|достаньте|возьм[а-яёa-z]*)\s+(?:1\s+)?(?:верхнюю\s+)?(?:боевую\s+)?карту[а-яёa-z]*/i,
        build: m => ({ op: 'playCard', values: /верхнюю/.test(m[0]), pick: true }),
    },
    // "your opponent must discard 1 random combat card from their hand"
    {
        re: /(?:противник[а-яёa-z]*|он(?![а-яёa-z]))[^.`]{0,50}?сброс[а-яёa-z]*\s+(?:с\s+руки\s+)?(?:1\s+)?(?:случайную\s+)?боевую карту/i,
        build: () => ({ op: 'discardCard', who: 'foe' }),
    },
    // "get 2 forge tokens"
    {
        re: /получ[а-яёa-z]*\s+(\d+)?\s*(?:жетон[а-яёa-z]*\s+)?(кузниц[а-яёa-z]*|тайник[а-яёa-z]*|подкреплен[а-яёa-z]*|жетон[а-яёa-z]*\s+ресурс[а-яёa-z]*)/i,
        build: m => ({
            op: 'gainAsset', n: num(m[1]) || 1,
            kind: /кузниц/.test(m[2]) ? 'forge' : /тайник/.test(m[2]) ? 'cache' : /подкреплен/.test(m[2]) ? 'reinforcement' : 'any',
        }),
    },
    // "then choose an opponent"
    {
        re: /выберите противника/i,
        build: () => ({ op: 'chooseFoe', pick: true }),
    },
    // "choose a friendly world"
    {
        re: /выберите дружественный мир/i,
        build: () => ({ op: 'chooseWorld', pick: true }),
    },
    // "the opponent loses 1 asset token of their choice"
    {
        re: /(?:противник[а-яёa-z]*|он(?![а-яёa-z]))[^.`]{0,40}?теря[а-яёa-z]*\s+(\d+)?\s*ценный ресурс/i,
        build: m => ({ op: 'loseAsset', n: num(m[1]), who: 'foe', pick: true }),
    },
    // "get the assets and the materiel of the world"
    {
        re: /получ[а-яёa-z]*\s+(?:ценные ресурсы и материалы|ценные ресурсы|материал[а-яёa-z]*)\s+этого мира/i,
        build: () => ({ op: 'gainWorldAssets', pick: true }),
    },
    // "get the materiel of all the friendly worlds of the system"
    {
        re: /получ[а-яёa-z]*\s+материал[а-яёa-z]*\s+со всех дружественных миров/i,
        build: () => ({ op: 'gainSystemMateriel', pick: true }),
    },
    // "increase the damage by 2"
    {
        re: /добавьте\s+(\d+)\s+к\s+(?:общей сумме\s+)?урона/i,
        build: m => ({ op: 'extraDamage', n: Number(m[1]) }),
    },
    // "you may treat your cities as factories while this order is executed"
    {
        re: /рассматривать\s+все\s+ваши города[^.]*как фабрики/i,
        build: () => ({ op: 'citiesAsFactories' }),
    },
    // "your ships may pass through the warp storms"
    {
        re: /корабли могут проходить через варп-штормы/i,
        build: () => ({ op: 'shipsThroughStorms' }),
    },
    // "your deploy limit is lowered by 1 for every bastion"
    {
        re: /лимит развертывания[^.]*уменьшается на (\d+)/i,
        build: m => ({ op: 'deployLimit', n: -Number(m[1]) }),
    },
    // "your command level increases by 1 while this order is executed"
    {
        re: /командный уровень\s+(?:увеличивается|повышается)\s+на\s+(\d+)\s+во время выполнения этого приказа/i,
        build: m => ({ op: 'orderKl', n: Number(m[1]) }),
    },
    // "the bastions of the opponent cannot prevent this orbital strike"
    {
        re: /бастион[а-яёa-z]*\s+(?:противник[а-яёa-z]*\s+)?(?:не могут предотвратить|не защищают от этого орбитального удара)/i,
        build: () => ({ op: 'ignoreBastion' }),
    },
    // "your units cannot become routed this round"
    {
        re: /ваш[а-яёa-z]*\s+(?:отряды|юниты)\s+(?:не могут стать деморализованными|не могут быть деморализованы)/i,
        build: () => ({ op: 'noRoute', who: 'me' }),
    },
    // "if the opponent takes damage, he takes 3 more damage"
    {
        re: /если\s+(?:противник[а-яёa-z]*|он)(?![а-яёa-z])[^.`]{0,40}?получ[а-яёa-z]*\s+урон[^.`]{0,40}?получ[а-яёa-z]*\s+ещё\s+(\d+)\s+урона/i,
        build: m => ({ op: 'extraDamage', n: Number(m[1]), when: 'damage' }),
    },
    // "once per round" — the limit of the upgrade.
    {
        re: /^\s*один раз за раунд\s*\.?\s*$/i,
        build: () => ({ op: 'once' }),
    },
    // The sentences that say no rule of their own: the engine keeps them.
    {
        re: /^(?:—\s*\([^)]*\)|если одинаково, выбираете вы\.?|это может привести к новому сражению[^.]*\.?|не нарушая базовых правил размещения\.?|неиспользованный остаток материалов пропадает\.?|нужно быть главным по машинам\.?|требуются\s*\.?|пассивно|используйте эти материалы только для покупки любого количества кораблей\.?|уничтоженный город засчитывается[^.]*\.?|командный уровень этой карты не может превышать[^.]*\.?|неиспользованный остаток[^.]*\.?)$/i,
        build: (m, ctx, s) => ({ op: 'note', text: s }),
    },
];

// The number of the text: "2" or "up to 2" or "one".
function num(text) {
    if (!text) return 1;
    const t = String(text).toLowerCase().replace(/^\s*до\s*/, '').trim();
    if (/два/.test(t)) return 2;
    if (/одно|один/.test(t)) return 1;
    const n = parseInt(t, 10);
    return isNaN(n) ? 1 : n;
}

// The filter of the units: "Guardsman or Cruiser" -> the stems of the names.
function unitFilter(text) {
    if (!text) return null;
    const names = text.split(/\s+или\s+|\s+и\s+/)
        .map(s => s.trim().replace(/[^А-Яа-яЁё']/g, ''))
        .filter(s => s.length >= 3);
    return names.length ? { types: names } : null;
}
