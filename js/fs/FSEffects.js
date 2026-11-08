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

    // The name of a die kind for the log.
    kindName(kind) {
        return kind === 'att' ? 'атаки' : kind === 'def' ? 'обороны' : 'морали';
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
            .replace(/(?<!(?:класс[а-яё]*|корабл[а-яё]*)\s*)«[^»]*»/g, ' ')
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
        // The abbreviations do not end the sentence: "2 att. token".
        const ABBR = /\b(att|def|any|morale|KL)\.\s/gi;
        const marked = whole.replace(ABBR, (m, w) => w + '\u0002 ');
        const parts = marked.split(/(?<=[.;])\s+|\s*;\s*/).map(s => s.trim()).filter(Boolean);
        return parts.map(part => part
            .replace(/\u0001(\d+)\u0001/g, (m, i) => '`' + icons[Number(i)] + '`')
            .replace(/\u0002/g, '.'));
    },

    // «*Титан «Гончая»:* … *Линкор:* …» — the paragraphs of one text, each with
    // the unit that must stand in the battle for it to be read. The markers are
    // requisites only when they name units of the faction: any other italics is
    // simply dropped from the text.
    paragraphs(text, ctx) {
        const src = String(text || '');
        const re = /\*([^*]{1,90}?):\*/g;
        const out = [];
        let last = 0;
        let m;
        const faction = this.factionOf(ctx);
        while ((m = re.exec(src))) {
            const before = src.slice(last, m.index);
            if (before.trim()) out.push({ names: null, text: before });
            const names = this.unitNames(m[1].replace(/\//g, ' или '), faction);
            out.push({ names: names.length ? names : null, text: '' });
            last = m.index + m[0].length;
            // The paragraph itself ends at the next marker.
            const next = re.lastIndex;
            const mNext = /\*([^*]{1,90}?):\*/g;
            mNext.lastIndex = next;
            const found = mNext.exec(src);
            const end = found ? found.index : src.length;
            out[out.length - 1].text = src.slice(next, end);
            m.lastIndex = end;
            re.lastIndex = end;
            last = end;
        }
        const tail = src.slice(last);
        if (tail.trim()) out.push({ names: null, text: tail });
        return out;
    },

    // The text of a card -> the steps of the game.
    // ctx: {faction, kind: 'combat'|'event'|'order'|'ability'}
    parse(text, ctx) {
        // The paragraphs with their own requisites: only the one whose unit is
        // in the battle is read (the requisites of the card are checked before).
        const paras = this.paragraphs(text, ctx);
        // «Выберите одну из способностей: *Бастион:* … — или — *Сестра Битвы:*
        // …» — the markers list the alternatives of ONE choice, not separate
        // paragraphs: the sentence keeps its own row.
        const lead = paras.length && !paras[0].names ? paras[0].text.trim() : '';
        const eitherList = /—\s*или\s*—/i.test(String(text || '')) && /:\s*$/.test(lead);
        if (paras.some(x => x.names) && !eitherList) {
            const out = [];
            const present = ctx && Array.isArray(ctx.present) ? ctx.present : null;
            for (const para of paras) {
                if (para.names && present && present.length) {
                    const fits = para.names.some(n => present.some(pres => this.sameName(pres, n)));
                    if (!fits) continue;
                }
                const inner = Object.assign({}, ctx || {});
                delete inner.present;
                out.push(...this.parse(para.text, inner));
            }
            return out;
        }
        const built = this.parseText(text, ctx);
        // «Дополнительная вместимость распространяется только на Гвардейцев» —
        // the clarification of the order belongs to the step it explains.
        const only = /дополнительная вместимость распространяется только на\s+([А-ЯЁа-яёa-z]+)/i.exec(String(text || ''));
        if (only) {
            for (const one of built) if (one && one.op === 'capacityBonus') one.only = only[1];
        }
        return built;
    },

    // The sentences of one text, one after another.
    parseText(text, ctx) {
        const steps = [];
        let prev = null;
        let prevCond = null;
        for (const sentence of this.sentences(text)) {
            // «Если вы это сделаете, то …» — the effect of the scheme the card
            // said it is waiting for: the steps join the trigger, not the card.
            const mThen = /^если вы это сдела[а-яёa-z]*,?\s*(?:то\s+)?/i.exec(sentence);
            if (mThen && prev && prev.op === 'trigger') {
                const body = sentence.slice(mThen[0].length).trim();
                const inner = this.parse(body.replace(/\.+$/, '') + '.', ctx || {});
                // 「… в конце первого шага нанесения повреждений …」 («Ракета Death
                // Strike»): the effect waits for that moment of the fight.
                if (/в конце первого шага нанесения (?:повреждений|урона)/i.test(sentence) && inner.length) {
                    prev.steps = [{ op: 'deferDamage', steps: inner }];
                    continue;
                }
                prev.steps = (Array.isArray(prev.steps) ? prev.steps : []).concat(inner);
                continue;
            }
            // The same words after an ordinary step of the card: the second
            // sentence happens only when the first one did its work
            // («Лич гвардия»: the opponent routes a unit only if we routed one).
            if (mThen && prev && prev.op !== 'trigger') {
                const body = sentence.slice(mThen[0].length).trim();
                const inner = this.parse(body.replace(/\.+$/, '') + '.', ctx || {});
                if (inner.length) {
                    prev.then = (Array.isArray(prev.then) ? prev.then : []).concat(inner);
                    continue;
                }
            }
            // «Не применяйте её способности, но получите её боевые значения …» —
            // the restriction refines the play before it: one card, values only.
            if (/^не применяйте её способности/i.test(sentence) && prev && prev.op === 'playCard' && !prev.values) {
                prev.values = true;
                prev.ability = sentence;
                continue;
            }
            // The leading condition of the sentence is cut off here: the rest is
            // parsed as usual and every produced step carries it — the ability
            // is not offered, and in a non-optional context does not fire.
            const mOther = /^иначе\s*/i.exec(sentence);
            if (mOther) {
                // «Иначе …» — the opposite branch of the condition of the
                // ability sentence before it (the same card): the steps are
                // the same body with the condition inverted.
                const body = sentence.slice(mOther[0].length).trim();
                const parsed = this.parse(body.replace(/\.+$/, '') + '.', ctx || {});
                for (const one of parsed) if (one) one.cond = Object.assign({ not: prevCond }, one.cond || {});
                if (!parsed.length) {
                    steps.push({ op: 'note', text: sentence });
                    prevCond = null;
                    continue;
                }
                for (const one of parsed) if (one && !one.ability) one.ability = sentence;
                steps.push(...parsed);
                prev = parsed[parsed.length - 1];
                prevCond = null;
                continue;
            }
            // The condition may also sit in the middle or at the end of the
            // sentence: «В конце этого раунда, если вы обороняетесь, …» —
            // the tail is classified, the head and the tail-remainder are
            // rejoined as one body.
            const peeled = this.peelCond(sentence) || this.peelCondMid(sentence) || this.peelImplicitCond(sentence);
            if (peeled) {
                const parsed = this.parse(peeled.rest.replace(/\.+$/, '') + '.', ctx || {});
                for (const one of parsed) if (one) one.cond = Object.assign(one.cond || {}, peeled.cond);
                const avoidPeeled = this.avoidOf(sentence);
                if (avoidPeeled && parsed.length) { parsed[parsed.length - 1].avoid = avoidPeeled; }
                if (!parsed.length) {
                    steps.push({ op: 'note', text: sentence });
                    prevCond = null;
                    continue;
                }
                for (const one of parsed) if (one && !one.ability) one.ability = sentence;
                steps.push(...parsed);
                prev = parsed[parsed.length - 1];
                prevCond = peeled.cond;
                continue;
            }
            const perCube = this.peelPerCube(sentence);
            if (perCube) {
                prevCond = null;
                const parsed = this.parse(perCube.rest.replace(/\.+$/, '') + '.', ctx || {});
                for (const one of parsed) {
                    if (!one) continue;
                    one.per = 'cube';
                    one.perKind = perCube.perKind;
                }
                if (!parsed.length) {
                    steps.push({ op: 'note', text: sentence });
                    prevCond = null;
                    continue;
                }
                for (const one of parsed) if (one && !one.ability) one.ability = sentence;
                steps.push(...parsed);
                prev = parsed[parsed.length - 1];
                continue;
            }
            const multiGain = this.multiGain(sentence);
            if (multiGain) {
                for (const one of multiGain) one.ability = sentence;
                steps.push(...multiGain);
                prev = multiGain[multiGain.length - 1];
                prevCond = null;
                continue;
            }
            prevCond = null;
            const dieEnum = this.dieEnum(sentence, ctx || {});
            if (dieEnum) {
                steps.push(...dieEnum);
                prev = dieEnum[dieEnum.length - 1];
                continue;
            }
            prevCond = null;
            const parsed = this.parseSentence(sentence, ctx || {});
            const avoid = this.avoidOf(sentence);
            if (avoid && prev) {
                // "He may avoid this by spending 1 `any cube`." — the sentence
                // belongs to the step before it.
                prev.avoid = avoid;
                continue;
            }
            if (avoid) {
                // The payment stands alone: the engine shows it.
                steps.push({ op: 'note', text: sentence, avoid });
                continue;
            }
            if (!parsed.length) {
                steps.push({ op: 'note', text: sentence });
                prevCond = null;
                continue;
            }
            // «Each paragraph is a separate ability.» The transcription gives
            // the text sentence by sentence, so a sentence is one ability:
            // the step keeps it, the player may refuse the whole ability.
            for (const one of parsed) if (one && !one.ability) one.ability = sentence;
            steps.push(...parsed);
            prev = parsed[parsed.length - 1];
        }
        return steps;
    },

    // The sentence of the payment that avoids the effect.
    avoidOf(sentence) {
        let m = /может избежать (?:этого|уничтожения|эффекта|его)[^,]*,\s*если (?:потрат[а-яёa-z]*|потеря[а-яёa-z]*)\s+(?:(\d+)\s*)?(?:`([^`]+)`|куб[а-яёa-z]*|количество куб[а-яёa-z]*)/i.exec(sentence);
        if (!m) {
            // "Destroy it, unless the opponent spends a number of cubes."
            m = /уничтожьте его, если противник не потрат[а-яёa-z]*\s+(?:(\d+)\s*)?(?:куб[а-яёa-z]*|количество куб[а-яёa-z]*)/i.exec(sentence);
            // «количество кубиков, равное командному уровню ставки» — the price
            // is not a fixed number: no avoid to offer.
        if (/равное командному уровню/i.test(sentence)) return null;
        }
        if (!m) return null;
        return { n: m[1] ? Number(m[1]) : 1, kind: m[2] ? this.icon(m[2]) : 'any' };
    },

    // The nested deploy of «Массовое Производство»: the order of the ability is
    // not a card — it is a production, and it ends with finishGuardDeploy.
    startGuardDeploy(R, state, seat, factory) {
        const order = state.order;
        if (!order) return null;
        const p = state.players[seat];
        order.phase = 'guardDeploy';
        order.guardFactory = { system: factory.system, pos: factory.pos };
        // «Купите минимум 2 отряда одного типа по цене на 1 меньше обычного»
        order.discount = (order.discount || 0) + 1;
        // «2 Гвардейца могут быть куплены за 1 жетон запасов»
        order.supplyDeal = { n: 2, unit: 'Гвардейца' };
        // «Они должны быть развернуты в мире, который их произвёл»
        order.deployInFactoryWorld = true;
        // «минимум 2 одного типа» — the first purchase locks the type.
        order.unitsLocked = null;
        // The ability is not over: the factory is still producing.
        order.finishAfterEffect = false;
        R.log(state, seat, p.name + ' отдаёт приказ развёртывания: фабрика выпускает отряды в свой мир.');
        return null;
    },

    // --- the abilities of the factions ----------------------------------------
    // The twelve faction abilities are fixed texts: their steps are written once,
    // by hand, instead of being chopped out of the sentence by the text rules.
    // Whatever the text parser cannot say in the words of the card (a second
    // route step, a destination by hand, the presence condition) lives here.
    abilitySteps(factionId) {
        const T = {
            'адептус-механикус': [
                { op: 'moveStructure', n: 1, kind: 'factory', ofSystem: 'active',
                  dest: 'worldActiveOrAdjacentNeutralOrFriendly', pick: true,
                  ability: 'передвинуть 1 из ваших фабрик на нейтральный или дружественный мир в этой или соседней системе по правилам передвижения наземных юнитов' },
            ],
            'имперская-гвардия': [
                { op: 'guardDeploy',
                  ability: 'выполнить приказ развертывания, используя 1 фабрику в активной системе: минимум 2 отряда одного типа, цена на 1 меньше, производство в мире-производителе, 2 Гвардейца за 1 жетон запасов' },
            ],
            'империя-тау': [
                { op: 'require', what: 'unitsOrStructures', system: 'active' },
                { op: 'drawEvents', n: 4, who: 'me' },
                { op: 'playEvent' },
            ],
            'инквизиция': [
                { op: 'choice', ability: 'способность «Глубочайший Ужас» — выберите ветку',
                  options: [
                    { op: 'sequence', steps: [
                        { op: 'route', n: 1, who: 'me', ofSystem: 'active', filter: { contains: ['крейсер'] },
                          ability: 'деморализовать 1 Инквизиторский Крейсер в активной системе' },
                        { op: 'route', n: 1, who: 'foe', ofSystem: 'adjacent', unitType: 'ship',
                          ability: 'деморализовать вражеский корабль в соседней системе' } ] },
                    { op: 'sequence', steps: [
                        { op: 'route', n: 1, who: 'me', ofSystem: 'active', filter: { contains: ['штурмовик'] },
                          ability: 'деморализовать 1 Штурмовика в активной системе' },
                        { op: 'route', n: 1, who: 'foe', ofSystem: 'adjacent', unitType: 'ground', maxKl: 2,
                          ability: 'деморализовать вражеский наземный отряд с командным уровнем 2 или ниже в соседней системе' } ] },
                  ] },
            ],
            'космодесант': [
                { op: 'require', what: 'materiel', n: 1 },
                { op: 'payMateriel', n: 1 },
                { op: 'choice', ability: 'способность «За Императора» — выберите ветку',
                  options: [
                    { op: 'replaceUnit', n: 1, pick: true, ofSystem: 'active', filter: { contains: ['скаут'] },
                      to: 'космодесант',
                      ability: 'заменить 1 отряд скаутов в активной системе на 1 отряд космодесанта из запаса' },
                    { op: 'replaceUnit', n: 1, pick: true, ofSystem: 'active', filter: { contains: ['космодесант'] },
                      to: 'ленд рейдер',
                      ability: 'заменить 1 отряд космодесанта в активной системе на ленд рейдер из запаса' },
                  ] },
            ],
            'космодесант-хаоса': [
                { op: 'moveUnits', n: 1, pick: true, ofSystem: 'active', filter: { contains: ['культист'] },
                  dest: 'friendlyOrUncontrolledWorldAdjacent',
                  ability: 'забрать 1 культиста из активной системы и переместить его в любой дружественный или никем не контролируемый мир в соседней системе' },
            ],
            'орки': [
                { op: 'placeUnit', n: 1, pick: true, buy: true, dest: 'friendlyWorldActive', unitType: 'ground',
                  ability: 'купить 1 отряд и разместить его в дружественном мире в активной системе' },
            ],
            'темные-эльдары': [
                { op: 'require', what: 'unroutedShip', system: 'active' },
                { op: 'gainAsset', kind: 'reinforcement', who: 'me', nFromWorlds: 'enemyOrUncontrolled', system: 'active' },
                { op: 'choice', ability: 'способность «Неутолимая Жажда» — переместить корабль?',
                  options: [
                    { op: 'moveUnit', n: 1, pick: true, unitType: 'ship', areaType: 'void', dest: 'friendlyVoidActive',
                      ability: 'взять один из ваших кораблей из любой пустоты и разместить его в дружественной пустоте в активной системе' },
                    { op: 'note', text: 'Корабль остаётся на месте.', ability: 'не перемещать корабль' },
                  ] },
            ],
            'эльдары': [
                { op: 'moveUnits', n: 1, pick: true, ofSystem: 'active', areaType: 'world', dest: 'friendlyWorldsAny',
                  ability: 'забрать 1 отряд из любого мира в активной системе и переместить его в любой дружественный мир' },
            ],
            'некроны': [
                { op: 'moveUnits', n: 99, pick: true, sourceWorld: true, dest: 'friendlyWorldWithStructureActive',
                  ability: 'забрать любое количество ваших отрядов из одного мира и разместить их в любом дружественном мире активной системы, который содержит постройку' },
            ],
        };
        return T[factionId] || null;
    },

    abilityFor(faction) {
        const id = faction && faction.id;
        const steps = id ? this.abilitySteps(id) : null;
        if (steps) {
            return typeof structuredClone === 'function'
                ? structuredClone(steps)
                : JSON.parse(JSON.stringify(steps));
        }
        const ability = faction && faction.ability ? faction.ability.text : '';
        return this.parse(ability, { kind: 'ability', faction: id });
    },

    // The leading condition of the sentence, if any: it is cut off, the rest is
    // parsed as usual, and every step of the sentence gets it — an ability the
    // condition does not allow is not offered to the player at all (all the
    // other «not this side of the table» cases simply press «Пропустить»).
    peelCond(sentence) {
        const s = sentence.replace(/^\s+/, '');
        const R = /** @type {{re: RegExp, cond: any, kl?: number, n?: number}[]} */ ([
            { re: /^если вы (?:—\s*)?атак[а-яёa-z]*[\s,]*(?:то[\s,]*)?/i, cond: { side: 'attack' } },
            { re: /^если (?:вы|Вы) (?:защищ|оборон)[а-яёa-z]*[\s,]*(?:то[\s,]*)?/i, cond: { side: 'defense' } },
            { re: /^если у вас больше недеморализованн[а-яёa-z]+ отрядов(?: с командным уровнем (\d+))?\s*,?\s*чем у (?:вашего )?противника[а-яёa-z]*[\s,]*(?:то[\s,]*)?/i, cond: { unitMore: true }, kl: 1 },
            { re: /^если у вас больше отрядов с командным уровнем (\d+)[а-яёa-z]*\s*,?\s*чем у (?:вашего )?противника[а-яёa-z]*[\s,]*(?:то[\s,]*)?/i, cond: { unitMore: true }, kl: 1 },
            { re: /^если (?:число )?у вас больше `morale cube`[^,.;]*,?\s*чем у (?:вашего )?(?:противник[а-яёa-z]*|него|неё|нее)[\s,]*(?:то[\s,]*)?/i, cond: { cubeMore: 'morale' } },
            { re: /^если у вас больше `morale cube`, чем у (?:вашего )?(?:противник[а-яёa-z]*|него|неё|нее)[\s,]*(?:то[\s,]*)?/i, cond: { cubeMore: 'morale' } },
            { re: /^если число ваших `morale cube` больше,? чем у (?:вашего )?(?:противник[а-яёa-z]*|него|неё|нее)[\s,]*(?:то[\s,]*)?/i, cond: { cubeMore: 'morale' } },
            { re: /^если у (?:вашего )?противника есть хотя бы (\d+) деморализованн[а-яёa-z]+ отряд[а-яёa-z]*[\s,]*(?:то[\s,]*)?/i, cond: { foeRouted: 1 }, n: 1 },
        ]);
        for (const one of R) {
            const m = one.re.exec(s);
            if (!m) continue;
            const cond = Object.assign({}, one.cond || {});
            if (one.kl && m[1]) cond.kl = Number(m[1]);
            if (one.n && m[1]) cond.foeRouted = Number(m[1]);
            const rest = s.slice(m[0].length);
            if (!rest) return null;
            return { cond, rest };
        }
        return null;
    },

    // «per cube I own» scaling: «за каждый имеющийся у вас `morale cube`».
    // The condition inside the sentence: «бесплатно разместите 1 отряд, если …»,
    // «В конце этого раунда, если вы обороняетесь, …». The clause between
    // «, если» and the next comma (or the end of the sentence) is the
    // condition; the rest is rejoined as the body.
    peelCondMid(sentence) {
        const s = String(sentence || '').replace(/^\s+/, '').trim();
        const m = /,\s*если\s+/i.exec(s);
        if (!m) return null;
        const head = s.slice(0, m.index).trim();
        const tail = s.slice(m.index + m[0].length);
        const sep = tail.search(/,\s|\s*;\s/);
        let condText, rest;
        if (sep < 0) {
            condText = tail;
            rest = head;
        } else {
            condText = tail.slice(0, sep);
            rest = (head + ' ' + tail.slice(sep).trim()).trim();
        }
        condText = condText.replace(/[.,\s]+$/, '').trim();
        rest = rest.replace(/^[,\s]+/, '').replace(/[,\s]+$/, '').trim();
        rest = rest.replace(/^чем у (?:вашего )?(?:противник[а-яёa-z]*|него|неё|нее)\s*,\s*/i, '');
        if (!condText || !rest) return null;
        const cond = this.classifyCond(condText);
        if (!cond) return null;
        return { cond, rest };
    },

    // The condition of the trailing/mid clause, classified strictly.
    classifyCond(text) {
        const t = String(text || '').toLowerCase().trim().replace(/[.,]+\s*$/, '').trim();
        if (/^вы атаку/.test(t)) return { side: 'attack' };
        if (/^вы (защищ|оборон)/.test(t)) return { side: 'defense' };
        if (/меньше[^`]*`?morale cube`?/.test(t) || /`?morale cube`?[^`]*меньше/.test(t)) return { cubeLess: 'morale' };
        if (/больше[^`]*`?morale cube`?/.test(t) || /`?morale cube`?[^`]*больше/.test(t)) return { cubeMore: 'morale' };
        const foe = /противник[а-яёa-z]* есть хотя бы (\d+) деморализованн/.exec(t);
        if (foe) return { foeRouted: Number(foe[1]) };
        if (/больше/.test(t) && /недеморализованн|(отрядов с командным уровнем)/.test(t)) {
            const kl = /командным уровнем (\d+)/.exec(t);
            return { unitMore: true, kl: kl ? Number(kl[1]) : null };
        }
        return null;
    },

    // «у вас больше `morale cube`, чем у него, …» — the leader started with
    // the predicate: the leading-if form written without «если».
    peelImplicitCond(sentence) {
        const s = String(sentence || '').replace(/^\s+/, '');
        const R = [
            { re: /^(?:число )?у вас (больше|меньше) [^.;]{0,40}?`morale cube`[^.;]{0,40}?,\s*чем у (?:вашего )?(?:противник[а-яёa-z]*|него|неё|нее)[^.;,]*,\s*/i,
              cond: m => (m[1] === 'меньше' ? { cubeLess: 'morale' } : { cubeMore: 'morale' }) },
            { re: /^у вас больше [^.;]{0,30}?недеморализованн[а-яёa-z]* отрядов(?: с командным уровнем (\d+))?[^.;]{0,40}?,\s*чем у (?:вашего )?(?:противник[а-яёa-z]*|него|неё|нее)[^.;,]*,\s*/i,
              cond: m => ({ unitMore: true, kl: m[1] ? Number(m[1]) : null }) },
            { re: /^у (?:вашего )?противника есть хотя бы (\d+) деморализованн[а-яёa-z]+ отряд[а-яёa-z]*,\s*/i,
              cond: m => ({ foeRouted: Number(m[1]) }) },
        ];
        for (const one of R) {
            const m = one.re.exec(s);
            if (!m) continue;
            const rest = s.slice(m[0].length);
            if (!rest.trim()) return null;
            return { cond: one.cond(m), rest };
        }
        return null;
    },

    peelPerCube(sentence) {
        const m = /^за каждый имеющийся у вас\s+`([^`]+cube)`([^]*)$/i.exec(sentence.replace(/^\s+/, ''));
        if (!m) return null;
        return { perKind: this.icon(m[1]), rest: m[2].replace(/^[\s,:]+/, '') };
    },

    // «За каждый ... получите 1 `att. token` либо 1 `def. token`» — the
    // either is inside the ability, not between abilities: one choice.
    perUnitEither(s) {
        const m = /^за кажд[а-яёa-z]*\s+(?:ваш[а-яёa-z]*\s+)?недеморализованн[а-яёa-z]*\s+([^.;:]{2,80}?)получ[а-яёa-z]*\s+(\d+)?\s*`([^`]+)`\s+(?:либо|или)\s+(\d+)?\s*`([^`]+)`(?:[^.;]*?максимум\s+(\d+))?/i.exec(String(s || ''));
        if (!m) return null;
        const k1 = this.iconKind(m[3]), k2 = this.iconKind(m[5]);
        if (k1 !== 'token' || k2 !== 'token') return null;
        const filter = unitFilter(m[1]) || typeFilter(m[1]);
        const max = m[6] ? Number(m[6]) : null;
        const distinctLevel = /разн[а-яёa-z]*\s+(?:командн[а-яёa-z]*\s+)?уровн/i.test(s);
        const t = { op: 'gainToken', per: 'unit', distinctLevel, filter, max, who: 'me' };
        return [{
            op: 'choice', text: s,
            options: [Object.assign({ n: num(m[2]), kind: this.icon(m[3]) }, t),
                      Object.assign({ n: num(m[4]), kind: this.icon(m[5]) }, t)],
        }];
    },

    // «уничтожить N <кто>, чтобы <эффект>» — the destroy is the price, the
    // part after «чтобы» is the reward: both happen together, or nothing.
    destroyToReward(s, ctx) {
        const m = /^уничтож(?!енн)[а-яёa-z]*\s+(?:(\d+)\s+)?(?:(?:оди?[а-яёa-z]*н[а-яёa-z]*|1)\s+)?([^.`,]{3,80}?)\s*,?\s*чтобы\s+(.*)$/i.exec(String(s || ''));
        if (!m) return null;
        const tail = String(m[3] || '');
        const parts = tail.split(/\s+,?\s*и\s+затем\s+/i);
        const pieces = [];
        for (const p of parts) pieces.push(...this.parse(String(p).trim().replace(/\.+$/, '') + '.', ctx || {}));
        if (!pieces.length) return null;
        const what = String(m[2] || '').trim();
        const clean = stripQualifier(what)
            .replace(/\s+для\s+того\s*$/i, '')
            .replace(/в \S+(?: \S+){0,3}$/u, '')
            .trim();
        const faction = this.factionOf(ctx);
        const units = this.unitNames(clean, faction);
        const filter = units.length ? { types: units } : (unitFilter(clean) || typeFilter(clean));
        const steps = [{ op: 'destroy', n: num(m[1]), who: 'me', pick: true, filter, text: 'уничтожьте: ' + clean }];
        return steps.concat(pieces);
    },

    // «Уничтожьте до 2 X, чтобы … за каждого уничтоженного X, либо уничтожьте
    // 1 Y, чтобы …» («Бронетанковый клин»): two prices, each with its reward.
    // The destroy asks for at most N units; the reward steps repeat as many
    // times as units were destroyed.
    destroyFork(s, ctx) {
        const re = /^уничтожьте до\s+(\d+)\s+([^,]{3,70}?),\s*чтобы\s+(.*?),?\s+либо\s+уничтожьте\s+(?:(\d+)\s+)?([^,]{3,70}?)(?:,\s*чтобы|\s+чтобы)\s+(.*)$/i;
        const m = re.exec(String(s || ''));
        if (!m) return null;
        const faction = this.factionOf(ctx);
        const price = (n, what, tail, upTo) => {
            const clean = stripQualifier(what)
                .replace(/^(?:\d+\s+)?(?:недеморализованн[а-яёa-z]*|недеморализованн[а-яёa-z]*)\s+/gi, '')
                .trim();
            const units = this.unitNames(clean, faction);
            const filter = units.length ? { types: units } : (unitFilter(clean) || typeFilter(clean));
            const steps = [{
                op: 'destroy', n: num(n), who: 'me', pick: true, filter, upTo,
                text: (upTo ? 'уничтожьте до ' + n : 'уничтожьте ' + num(n)) + ' ' + clean,
            }];
            const tailSteps = this.parse(String(tail || '').replace(/[.,\s]+$/, '') + '.', ctx || {});
            for (const one of tailSteps) if (one && !one.per) one.per = 'destroyed';
            // The reward is paid only for the units that really fell: a price that
            // cannot be paid gives nothing.
            if (tailSteps.length) {
                steps[steps.length - 1].then = tailSteps;
                return steps.length === 1 ? steps[0] : { op: 'sequence', steps };
            }
            return steps.length === 1 ? steps[0] : { op: 'sequence', steps };
        };
        const a = price(m[1], m[2], m[3], true);
        const b = price(m[4] || 1, m[5], m[6], false);
        return [{ op: 'choice', text: s, options: [a, b] }];
    },

    // «… за каждую пару недеморализованных Гвардейцев и Огринов либо Крейсеров
    // и Линкоров» — the pairs of the player count, not the units.
    pairScale(s) {
        const m = /за каждую пару\s+([^.;]+)/i.exec(String(s || ''));
        if (!m) return null;
        const pairs = [];
        for (const group of m[1].split(/\s+либо\s+|\s+или\s+/i)) {
            const parts = stripQualifier(group).split(/\s+и\s+/i);
            if (parts.length < 2) continue;
            const a = unitFilter(parts[0].replace(/^\s*в\s+/i, '')) || typeFilter(parts[0]);
            const b = unitFilter(parts[1]) || typeFilter(parts[1]);
            if (a && b) pairs.push([a, b]);
        }
        return pairs.length ? pairs : null;
    },

    // The count of the steps is written on them (the choice hands it to the
    // branches as well): every step that takes a number is «per pair».
    withPer(list, fields) {
        for (const one of list || []) {
            if (!one) continue;
            Object.assign(one, fields);
            if (Array.isArray(one.options)) this.withPer(one.options, fields);
            if (Array.isArray(one.steps)) this.withPer(one.steps, fields);
        }
        return list;
    },

    // One sentence -> the steps.
    parseSentence(sentence, ctx) {
        const s = sentence.trim();
        if (!s || s === '—') return [];
        // «Ваш противник должен выбрать и деморализовать 1 свой отряд» — the
        // foe chooses one of his own units and routs it («Ратлинг стрелок»).
        const mFoeRoute = /^(?:ваш\s+)?противник\s+должен\s+выбрать\s+и\s+деморализовать\s+(?:(\d+)\s+)?(?:один\s+)?сво[а-яёa-z]*\s+отряд[а-яёa-z]*(?:\s+с командным уровнем\s+(\d+))?/i.exec(s);
        if (mFoeRoute) {
            const step = { op: 'route', n: num(mFoeRoute[1]), who: 'foe', pick: true };
            if (mFoeRoute[2] !== undefined) step.maxKl = Number(mFoeRoute[2]);
            return [step];
        }
        // «… противник должен потратить 3 N / … не потратит 1 …, то … деморализовать
        // 1 свой отряд / … если противник не потратит …» — the payment fork of
        // the OPPONENT: the engine cannot ask the other player, so the card is
        // resolved by hand together (no cube is spent, no unit routed by us).
        if (/противник[а-яёa-z]*[^.;]{0,90}?(?:не\s+потрат[а-яёa-z]*|должен\s+потрат[а-яёa-z]*|может\s+избежать|может\s+отступить|должен\s+отступить|не\s+позволит|станет\s+уничтожен|должен\s+выбрать\s+и\s+деморализ)/i.test(s)
            || /(?:если\s+)?(?:владелец|противник[а-яёa-z]*)\s+не\s+потрат[а-яёa-z]*/i.test(s)) {
            return [{ op: 'note', text: s, manual: 'foe-fork' }];
        }
        if (/который\s+(?:он|она|они|владелец)\s+не\s+может\s+потрат[а-яёa-z]*/i.test(s)) {
            return [{ op: 'note', text: s, manual: 'foe-fork' }];
        }
        // «если вы атакуете, то ваш противник не может получать `def. token` …» —
        // a restriction on the FOE the engine cannot enforce: a note, never a grant.
        if (/(?:противник[а-яёa-z]*|он(?![а-яёa-z]))[^.;]{0,80}?не\s+(?:может|сможет)\s+(?:получа|разыгрыв|разыгра)/i.test(s)
            && /`(?:att|def|morale)\.\s*(?:token|cube)`/i.test(s)) {
            return [{ op: 'note', text: s, manual: 'foe-ban' }];
        }
        // «каждый раз, когда противник получает …» — the effect follows the FOE
        // across the whole battle: the engine cannot see those events.
        if (/каждый раз[^.;]{0,120}?когда\s+(?:противник[а-яёa-z]*|он)(?![а-яёa-z])/i.test(s)) {
            return [{ op: 'note', text: s, manual: 'foe-trigger-gain' }];
        }
        // «Вы и ваш противник обязаны перебросить все ваши `morale cube`.» —
        // both sides reroll the same kind of die, not the rerollAll default.
        const mBoth = /вы\s+и\s+ваш\s+противник\s+обязаны\s+перебросить\s+все\s+(?:ваши\s+|свои\s+)?`([^`]+)`/i.exec(s);
        if (mBoth) {
            const kind = FS_EFFECTS.icon(mBoth[1]);
            return [
                { op: 'rerollDie', n: 99, kind, all: true, pick: true, who: 'me', ability: s },
                { op: 'rerollDie', n: 99, kind, all: true, pick: true, who: 'foe', ability: s },
            ];
        }
        // «уничтожить N <кто>, чтобы <эффект>» — the price before the reward.
        // «Уничтожьте … постройку» — the engine destroys units, not buildings:
        // a visible note, never a unit loss. The either/либо sentence is left
        // to its branch parser (each branch re-enters here without «либо»).
        if (/уничтож[а-яёa-z]*[^.;]{0,140}?постройк[а-яёa-z]*/i.test(s)
            && !/сброс[а-яёa-z]*\s+эт[ау]\s+карт[ау]/i.test(s)
            && !/(?:^|\s)либо\s/i.test(s)) {
            return [{ op: 'note', text: s, manual: 'destroy-structure' }];
        }
        // «Уничтожьте до 2 … либо уничтожьте 1 …» — the two prices of the card.
        const fork = this.destroyFork(s, ctx);
        if (fork) return fork;
        const dr = this.destroyToReward(s, ctx);
        if (dr) return dr;
        // «… за каждую пару …» — the count of every effect of the sentence is
        // the number of the pairs of the player.
        const pairs = this.pairScale(s);
        if (pairs) {
            const cut = s.search(/за каждую пару/i);
            const body = s.slice(0, cut).replace(/[,\s]+$/, '');
            const inner = this.parseSentence(body + '.', ctx);
            if (inner.length) return this.withPer(inner, { per: 'pair', pairs });
        }
        // The «за каждый ... получите 1 X либо 1 Y» ability: one choice.
        const perUnit = this.perUnitEither(s);
        if (perUnit) return perUnit;
        // "either ... or ..." — the player chooses. A sentence that starts with
        // «потратьте» pays for one effect: the rules read it as one piece.
        let either = /^потрат/i.test(s) ? [s] : s.replace(/^\s*либо\s+/i, '').split(/\s+либо\s+/i);
        const splitAt = s.search(/\s+либо\s+/i);
        if (either.length >= 2 && splitAt > 0 && !/^потрат/i.test(s)) {
            // The head of the shared prefix is reattached to every branch only
            // when the head is an open verb phrase («Удалите 1 `morale cube`,
            // чтобы получить » / «получите »). When the head is a complete
            // clause already («… в дружественном мире, где есть отряд нобзов, »),
            // the branches are complete sentences: nothing to reattach.
            const headText = s.slice(0, splitAt).trim();
            const tail = (headText.match(/([а-яёa-z]+)\s*,?\s*$/i) || [null, ''])[1] || '';
            const needsHead = /(?:ть|сте|ете|ите|йте)$/i.test(tail);
            if (needsHead) {
                either = either.map((part, i) => (i === 0 ? part : headText + ' ' + part));
            }
        }
        if (either.length >= 2) {
            // Every option keeps the sentence it came from — the buttons of the
            // choice name what each branch actually does.
            const options = [];
            for (const part of either) {
                const branch = part.replace(/^\s*или\s+/i, '').trim();
                // «Удалите 1 `morale cube`, чтобы получить» — an open verb at the
                // end of the shared prefix: the sentence is not complete, the
                // branch belongs to the alternatives, not to the choice list.
                if (/(?:чтобы|для того, чтобы)\s+[а-яёa-z]+(?:\s+[а-яёa-z]+){0,2}[.!,]?\s*$/i.test(branch)) continue;
                const steps = this.parseSentence(branch, ctx);
                // A branch that yields nothing (the dangling head of the shared
                // prefix) is not an option either.
                if (!steps.length) continue;
                for (const step of steps) {
                    if (step && !step.ability) step.ability = branch;
                    options.push(step);
                }
            }
            if (options.length > 1) {
                const scope = this.scope(s);
                return [{ op: 'choice', options: options.map(o => this.withScope(o, scope)), text: s }];
            }
        }
        // The scope: me, the opponent or both.
        const scope = this.scope(s);
        // The rules. The first that matches wins.
        for (const rule of RULES) {
            if (rule.noWhen && /когда/i.test(s)) continue;
            const m = rule.re.exec(s);
            if (!m) continue;
            const built = rule.build(m, ctx || {}, s);
            if (!built) continue;
            const steps = Array.isArray(built) ? built : [built];
            // «… в этом мире» scopes the steps to the world of the combat: the
            // engine takes that literally when it asks for a piece.
            const here = /в этот мир|в этом мире|этого мира|этой области|этой области боя/i.test(s);
            return steps.map(x => {
                const s2 = this.withScope(x, scope);
                // «… на ваш выбор» — the resolving player chooses the foe's
                // dice, not the foe.
                if (s2.who === 'foe' && /на ваш выбор|по вашему выбору/i.test(s)
                    && ['rerollDie', 'spendDie', 'flipDie', 'setDie', 'loseDie'].includes(s2.op)) s2.picker = 'me';
                if (here && s2 && !s2.dest && ['destroy', 'moveUnit', 'placeUnit', 'placeReinforcement'].includes(s2.op)) s2.dest = 'combatWorld';
                return s2;
            });
        }
        // The payment that avoids the effect stands alone.
        const avoid = this.avoidOf(s);
        if (avoid) return [{ op: 'note', text: s, avoid }];
        // «Только наземные отряды и только в тот самый мир фабрики…» — a
        // clarification of the rules: it explains, it does not act.
        if (/^только\s/i.test(s)) return [{ op: 'note', text: s }];
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
        // «деморализовать один вражеский отряд» — the enemy is named inside the
        // sentence, not as its subject. The card speaks about the foe unless it
        // also names the player's own pieces.
        if (/вражеск[а-яёa-z]*/.test(s) && !/ваш|сво[а-яёa-z]*|вы(?![а-яёa-z])/i.test(s)) return 'foe';
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
            // The abilities of a combat card are optional: the owner of the card
            // is asked about each of them before the engine performs it.
            if (c.optional && !step.asked) {
                if (!this.condSatisfied(R, state, seat, step, c)) {
                    const group = step.ability;
                    for (const one of list) if (one && one.ability === group) one.asked = true;
                    index++;
                    continue;
                }
                const ask = this.abilityQuestion(step, c);
                if (ask && !this.emptyQuestion(ask.question)) {
                    // One sentence is one ability: the steps it produced share
                    // the text, so they share the single permission — the gain
                    // half of «потратьте…, чтобы получить…» is not a second
                    // optional ability.
                    const group = step.ability;
                    for (const one of list) if (one && one.ability === group) one.asked = true;
                    state.pending = {
                        seat, answerSeat: c.owner === undefined ? seat : c.owner,
                        kind: c.kind || 'card', steps: list, index,
                        question: ask.question, ctx: c,
                    };
                    return { ok: true, pending: true };
                }
            }
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
            this.spreadCount(list, index, step);
            this.thenSteps(list, index, step);
            index++;
        }
        state.pending = null;
        // The combat goes on with the step that waited for the effect. The step
        // machine then passes the steps that have nothing to do (a closed card of
        // the other side, a damage of zero).
        if (c.kind === 'combat' && state.combat && state.combat.nextStep) {
            state.combat.step = state.combat.nextStep;
            state.combat.nextStep = null;
            if (typeof R.advanceCombatSteps === 'function') R.advanceCombatSteps(state);
        }
        // The order of the ability is over when the effect is done.
        if (c.kind === 'ability' && state.order && state.order.finishAfterEffect) {
            state.order.finishAfterEffect = false;
            R.finishOrder(state, seat);
        }
        // The reinforce step waited for the scheme of its end («Зов астропатов»):
        // the step is closed now.
        if (c.kind === 'combat' && state.combat && state.combat.reinforcePending
            && typeof R.finishReinforce === 'function') {
            const pend = state.combat.reinforcePending;
            state.combat.reinforcePending = null;
            R.finishReinforce(state, pend);
        }
        // The scheme of «the start of a round of combat» waited for the question
        // of the start of the combat: it is asked now.
        if (c.kind === 'combat' && state.combat && state.combat.roundSchemeQueued) {
            state.combat.roundSchemeQueued = false;
            if (typeof R.maybeScheme === 'function' && !state.pending) {
                R.maybeScheme(state, state.combat.attacker, 'round', { kind: 'combat', ctx: { side: 'attacker' } });
            }
        }
        // The orbital strike waited for the choice of «Набега жнецов»: the strike
        // goes on with the chosen unit first.
        if (c.kind === 'order' && state.order && state.order.strikePlanned
            && typeof R.resumeStrike === 'function') {
            R.resumeStrike(state, seat);
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
        // A step that asks twice keeps the choice already made on the question
        // object itself: the second question of the same step is answered with
        // both answers merged (the unit that is being moved, the place it goes).
        const stash = pending.stash || null;
        const merged = stash ? Object.assign({}, stash, answer) : answer;
        // The question may carry what was already chosen — the unit that is being
        // placed. The next question (the place) is answered without it, so the
        // choice is put back before the step reads the answer.
        if (merged.type === undefined && (question.op === 'placeUnit' || question.op === 'placeFree')
            && question.kind2 !== undefined) {
            merged.type = question.kind2;
        }
        // A staged question (the world a stack of units comes from, the factory of
        // the nested deploy) may be answered with the generic «area»: the value is
        // remembered under the name the step reads.
        if (question.stage === 'source' && merged.area && !merged.source) { merged.source = merged.area; delete merged.area; }
        if (question.stage === 'factory' && merged.area && !merged.factory) { merged.factory = merged.area; delete merged.area; }
        // A branch of a choice keeps its own question: while that question waits,
        // the answer belongs to the branch, not to the choice again.
        const step = pending.choice || pending.steps[pending.index];
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
        // The permission of the owner of the card: an ability he refuses does
        // not happen, and the rest of the card goes on.
        if (question.op === 'ability') {
            if (answer.no) {
                R.log(state, owner, state.players[owner].name + ' отказывается от способности: «'
                    + String(step.ability || '').slice(0, 60) + '».');
                // Refusing the permission discards the whole sentence — every
                // step it produced — not only the step that asked.
                const group = step.ability;
                let i = pending.index + 1;
                while (i < pending.steps.length && pending.steps[i] && pending.steps[i].ability === group) i++;
                state.pending = null;
                return this.run(R, state, pending.seat, pending.steps, pending.ctx || {}, i);
            }
            const q = this.step(R, state, owner, step, ctx);
            if (q && q.stop) {
                // «Нечем оплатить»: the cost is not paid, so the whole sentence
                // — its gain half included — does not happen; the next ability
                // of the card goes on.
                const group = step.ability;
                let i = pending.index + 1;
                while (i < pending.steps.length && pending.steps[i] && pending.steps[i].ability === group) i++;
                state.pending = null;
                return this.run(R, state, pending.seat, pending.steps, pending.ctx || {}, i);
            }
            if (q && q.question && !this.emptyQuestion(q.question)) {
                pending.question = q.question;
                return { ok: true, pending: true };
            }
            return this.next(R, state, pending);
        }
        // The payment that avoids the effect.
        if (question.op === 'avoid') {
            const paid = (answer.dice || []).length > 0;
            if (paid) {
                const combat = state.combat;
                const s2 = seat === combat.attacker ? 'attacker' : 'defender';
                for (const i of (answer.dice || [])) {
                    if (Number.isInteger(i) && combat.dice[s2][i] !== null
                        && combat.dice[s2][i] !== undefined) combat.dice[s2][i] = null;
                }
                R.log(state, seat, state.players[seat].name + ' тратит кубик и избегает эффекта.');
            } else {
                // The effect happens: the question of the step itself.
                if (step && step.op === 'avoidDestroy') {
                    this.apply(R, state, seat, step, {}, ctx);
                    return this.next(R, state, pending);
                }
                const q = this.step(R, state, owner, step, ctx);
                if (q && q.question) {
                    pending.question = q.question;
                    return { ok: true, pending: true };
                }
            }
            return this.next(R, state, pending);
        }
        const res = this.apply(R, state, seat, step, merged, ctx);
        if (res && res.replace) {
            // The step has other steps of its own: they take its place in the
            // list. The steps that follow the choice are NOT lost — the branch
            // of a choice is inlined, the rest of the card goes on after it.
            const list = pending.steps;
            const at = pending.index;
            list.splice(at, 1, ...(res.replace || []));
            state.pending = null;
            return this.run(R, state, pending.seat, list, pending.ctx, at);
        }
        if (res && res.question && this.emptyQuestion(res.question)) {
            // There is nothing to choose: the effect is skipped.
            return this.next(R, state, pending);
        }
        if (res && res.question) {
            // The branch of a choice that asks its own question: the answer goes
            // to the branch, not into the choice again.
            if (!pending.choice && pending.steps[pending.index] && pending.steps[pending.index].op === 'choice') {
                const i = Number((merged || {}).choice);
                const branch = Number.isFinite(i) && Array.isArray(step && step.options) ? step.options[i] : null;
                if (branch) pending.choice = branch;
            }
            pending.stash = merged;
            pending.question = res.question;
            return { ok: true, pending: true };
        }
        // The step is done — the rest of the steps go on.
        this.spreadCount(pending.steps, pending.index, step);
        this.thenSteps(pending.steps, pending.index, step);
        return this.next(R, state, pending);
    },

    // The question without options: there is nothing to choose. A yes-or-no
    // question always has something to answer, and so does the permission of
    // an ability — the choice there is written on the buttons, not in options.
    emptyQuestion(question) {
        if (!question) return true;
        if (question.kind === 'yesno' || question.kind === 'ability') return false;
        return !question.options || !question.options.length;
    },

    // The chain goes on with the next step.
    next(R, state, pending, replace) {
        const list = replace || pending.steps;
        const saved = { seat: pending.seat, kind: pending.kind, steps: list, index: replace ? 0 : pending.index + 1, ctx: pending.ctx, choice: null };
        state.pending = null;
        return this.run(R, state, saved.seat, list, saved.ctx, saved.index);
    },

    // «… 1 жетон подкрепления … за каждый отряд, который вы деморализовали» —
    // the count of the previous step is written into the next step that asks
    // for it («за каждый» = per: 'routed').
    spreadCount(list, index, step) {
        if (!step) return;
        if (step.routedCount !== undefined) {
            for (let i = index + 1; i < list.length; i++) {
                const one = list[i];
                if (!one) continue;
                if (one.per === 'routed') { one.n = step.routedCount; return; }
                if (one.op === 'trigger' || one.op === 'scheme') return;
            }
        }
        // «за каждого уничтоженного Гвардейца» — the price follows the count.
        if (step.destroyedCount !== undefined) {
            for (let i = index + 1; i < list.length; i++) {
                const one = list[i];
                if (!one) continue;
                if (one.per === 'destroyed') {
                    const base = one.perN === undefined ? (one.perN = one.n || 1) : one.perN;
                    one.n = base * step.destroyedCount;
                    continue;
                }
                if (one.op === 'trigger' || one.op === 'scheme') return;
            }
        }
    },

    // «Если вы это сделаете, …» — the steps of the second sentence wait for the
    // step they belong to: they are performed right after it, and only when it
    // did its work (a route with nothing to route is not «doing it»).
    thenSteps(list, index, step) {
        if (!step || !Array.isArray(step.then) || !step.then.length || !step.done) return false;
        const add = step.then.filter(Boolean);
        step.then = [];
        if (!add.length) return false;
        list.splice(index + 1, 0, ...add);
        return true;
    },

    // The player of the side of the combat.
    seatOf(combat, side) {
        if (!combat) return null;
        return side === 'attacker' ? combat.attacker : combat.defender;
    },

    // Which side's dice a step points at: the resolving player's own by
    // default, the opponent's for an effect text that says so.
    diceSideOf(combat, side, step) {
        if (!combat) return side;
        if (step && step.who === 'foe') return side === 'attacker' ? 'defender' : 'attacker';
        return side;
    },

    // Who answers a question about dice: the affected player chooses his own
    // dice, unless the card leaves the choice to the resolving player
    // («на ваш выбор» / «по вашему выбору»).
    diceAsker(combat, side, step) {
        if (step && step.picker === 'me') return this.seatOf(combat, side);
        return this.seatOf(combat, this.diceSideOf(combat, side, step));
    },

    // «Если вы атакуете...» — the condition of the ability: false ⇒ the ability
    // is not offered at all (and in a non-optional context does not happen).
    condSatisfied(R, state, seat, step, ctx) {
        const cond = step && step.cond;
        if (!cond) return true;
        const combat = state.combat;
        if (cond.not) return !this.condSatisfied(R, state, seat, { cond: cond.not }, ctx);
        const inCombat = !!(ctx && ctx.kind === 'combat' && combat);
        if (cond.side) {
            if (!inCombat) return false;
            const mine = seat === combat.attacker ? 'attack' : 'defense';
            return mine === cond.side;
        }
        if (cond.cubeLess) {
            if (!inCombat) return false;
            const s2 = seat === combat.attacker ? 'attacker' : 'defender';
            const o2 = seat === combat.attacker ? 'defender' : 'attacker';
            const mine = (combat.dice[s2] || []).filter(Boolean).filter(d => d === cond.cubeLess).length;
            const theirs = (combat.dice[o2] || []).filter(Boolean).filter(d => d === cond.cubeLess).length;
            return mine < theirs;
        }
        if (cond.cubeMore) {
            if (!inCombat) return false;
            const s2 = seat === combat.attacker ? 'attacker' : 'defender';
            const o2 = seat === combat.attacker ? 'defender' : 'attacker';
            const mine = (combat.dice[s2] || []).filter(Boolean).filter(d => d === cond.cubeMore).length;
            const theirs = (combat.dice[o2] || []).filter(Boolean).filter(d => d === cond.cubeMore).length;
            return mine > theirs;
        }
        if (cond.foeRouted) {
            const n = cond.foeRouted;
            const foeSide = inCombat ? (seat === combat.attacker ? combat.defender : combat.attacker) : null;
            const list = inCombat
                ? state.units.filter(u => u.routed && u.seat === foeSide && u.system === combat.system && u.area === combat.pos)
                : state.units.filter(u => u.routed && u.seat !== seat);
            return list.length >= n;
        }
        if (cond.unitMore) {
            if (!inCombat) return false;
            // The command level may be 0: «отрядов с командным уровнем 0» is a
            // filter, not the absence of one.
            const kl = cond.kl === null || cond.kl === undefined ? null : cond.kl;
            const fit = u => kl === null || (R.unitOf(state, u) && (R.unitOf(state, u).kl || 0) === kl);
            const here = u => u.system === combat.system && u.area === combat.pos;
            const mine = state.units.filter(u => u.seat === seat && !u.routed && here(u) && fit(u)).length;
            const theirs = state.units.filter(u => u.seat !== seat && !u.routed && here(u) && fit(u)).length;
            return mine > theirs;
        }
        return true;
    },

    // «A player can choose not to resolve one of his abilities, unless that
    // ability uses the word must.» The Russian card says должен / обязан.
    abilityIsMust(text) {
        // \b is a boundary of [A-Za-z0-9_] only: with the Cyrillic letters it
        // never matches, so the edges are written by hand.
        return /(^|[^а-яёa-z])(должен|должна|должно|должны|обязан|обязана|обязано|обязаны|обязательно)([^а-яёa-z]|$)/i
            .test(String(text || ''));
    },

    // The question of the permission: the owner of the card decides whether the
    // ability happens at all. A clarification (op 'note') decides nothing, and
    // an ability that says «must» is not offered for refusal.
    // «Получите 1 `att. cube`, 1 `def. cube` или 1 `morale cube`.» — the choice of a single die.
    dieEnum(sentence, ctx) {
        const s = sentence.replace(/^\s+/, '');
        // Every icon keeps its own number: «Получите 2 `att. cube` или 2 `def. cube`»
        // is two dice of the chosen kind, not one.
        const list = [...s.matchAll(/(\d+|два|две|одно|один)?\s*`([^`]+cube)`/g)]
            .map(m => ({ n: m[1] ? num(m[1]) : 1, kind: this.icon(m[2]) }));
        if (!/^получ[а-яёa-z]+/i.test(s) || list.length < 2 || !/(или|либо)/i.test(s)) return null;
        return [{ op: 'choice', text: s, options: list.map(x => ({ op: 'gainDie', n: x.n, kind: x.kind, who: 'me', ability: s })) }];
    },

    // «получаете 2 `att. token` и 1 `def. token`» — several gains in one
    // sentence: one step per icon.
    multiGain(sentence) {
        const s = String(sentence || '').trim();
        const m = /^(?:вы\s+|также\s+)*получ[а-яёa-z]*\s+([^;]{0,160})$/i.exec(s);
        if (!m) return null;
        const parts = m[1].split(/\s+и\s+/);
        const steps = [];
        for (const p of parts) {
            const pair = /^(\d+|один|одно|два|две)?\s*`([^`]+)`\s*\.*$/.exec(p.trim());
            if (!pair) return null;
            const k = this.iconKind(pair[2]);
            if (k !== 'token' && k !== 'cube') return null;
            steps.push({ op: k === 'token' ? 'gainToken' : 'gainDie', n: num(pair[1]), kind: this.icon(pair[2]), who: 'me' });
        }
        return steps.length >= 2 ? steps : null;
    },

    abilityQuestion(step, ctx) {
        if (!step || !step.ability || step.op === 'note') return null;
        if (this.abilityIsMust(step.ability)) return null;
        const owner = ctx && ctx.owner !== undefined ? ctx.owner : null;
        return {
            question: {
                kind: 'ability', op: 'ability', who: owner,
                text: step.ability,
                yes: 'Применить', no: 'Пропустить',
            },
        };
    },

    // One step of the game.
    step(R, state, seat, step, ctx) {
        // The condition of the ability is checked before anything else — it is
        // the very first gate of the step.
        if (step && step.cond && !this.condSatisfied(R, state, seat, step, ctx)) return null;
        const combat = state.combat;
        // The card of the combat may be played when the fight is already over.
        const inCombat = !!(ctx && ctx.kind === 'combat' && combat);
        const side = inCombat ? (seat === combat.attacker ? 'attacker' : 'defender') : null;
        const foe = inCombat ? (seat === combat.attacker ? combat.defender : combat.attacker) : null;
        const p = state.players[seat];
        // The player of the step: the card's player or his opponent — the other side
        // of the combat, the foe chosen by the card, or any other player at the table.
        const chosenFoe = ctx && ctx.foe !== undefined ? ctx.foe : null;
        const target = step.who === 'foe'
            ? (foe !== null ? foe : (chosenFoe !== null ? chosenFoe : (state.players.find(x => x.seat !== seat) || {}).seat))
            : seat;
        switch (step.op) {
            case 'gainToken': {
                const n = this.count(R, state, seat, step, ctx);
                if (!inCombat) return null;
                const s2 = side;
                combat.tokens[s2][step.kind] += n;
                R.log(state, seat, state.players[seat].name + ' получает ' + n + ' ' + (step.kind === 'att' ? 'жетонов атаки' : 'жетонов обороны') + '.');
                return null;
            }
            case 'loseToken': {
                const n = this.count(R, state, seat, step, ctx);
                if (!inCombat) return null;
                const s2 = target === seat ? side : (side === 'attacker' ? 'defender' : 'attacker');
                combat.tokens[s2][step.kind] = Math.max(0, combat.tokens[s2][step.kind] - n);
                R.log(state, target, state.players[target].name + ' теряет ' + n + ' ' + (step.kind === 'att' ? 'жетонов атаки' : 'жетонов обороны') + '.');
                return null;
            }
            case 'gainDie': {
                let n = this.count(R, state, seat, step, ctx);
                if (step.inBattle && combat && step.per === 'unit') {
                    // "in the reinforce step" — the units of this battle, not the board.
                    const here = state.units.filter(u => u.seat === seat && !u.routed
                        && u.system === combat.system && u.area === combat.pos
                        && this.unitFits(R.unitOf(state, u), step.filter));
                    n = (step.n || 1) * (here.length
                        + (step.filter ? 0 : R.tokenUnits(state, side).alive));
                }
                if (!inCombat) {
                    // «Во время этого орбитального удара получите 1 `any cube`»
                    // («Набег жнецов»): the cube of the strike is rolled, and only
                    // its `att` face adds a hit to the strike.
                    if (state.order && state.order.phase === 'strike' && state.order.seat === seat) {
                        let bonus = 0;
                        for (let i = 0; i < n; i++) {
                            const face = step.kind === 'any' ? R.rollDice(state, 1)[0] : step.kind;
                            if (face === 'att') bonus += 1;
                        }
                        state.order.strikeBonus = (state.order.strikeBonus || 0) + bonus;
                        R.log(state, seat, state.players[seat].name + ' получает кубик для удара с орбиты'
                            + (bonus ? ': он выпал на атаку.' : ': он не выпал на атаку.'));
                    }
                    return null;
                }
                // The condition of the text: "if the opponent has a die of this kind".
                if (step.onlyIfFoeHas) {
                    const s2 = side === 'attacker' ? 'defender' : 'attacker';
                    if (!(combat.dice[s2] || []).includes(step.onlyIfFoeHas)) return null;
                }
                // No more than DICE_MAX dice in a combat: a card that gives a
                // die past the limit simply adds nothing.
                const room = Math.max(0, R.DICE_MAX - combat.dice[side].filter(Boolean).length);
                const got = Math.min(n, room);
                for (let i = 0; i < got; i++) {
                    combat.dice[side].push(step.kind === 'any' ? R.rollDice(state, 1)[0] : step.kind);
                }
                R.log(state, seat, state.players[seat].name + ' получает ' + got + ' кубик(ов)'
                    + (step.kind !== 'any' ? ' ' + this.kindName(step.kind) : '') + '.'
                    + (got < n ? ' Больше восьми кубиков быть не может.' : ''));
                return null;
            }
            case 'loseDie': {
                if (!inCombat) return null;
                const s2 = side === 'attacker' ? 'defender' : 'attacker';
                const live = d => d !== null && d !== undefined;
                const options = combat.dice[s2].map((d, i) => i)
                    .filter(i => live(combat.dice[s2][i])
                        && (step.kind === 'any' || combat.dice[s2][i] === step.kind));
                if (!options.length) return null;
                const n = Math.min(step.n, options.length);
                // The dice of one kind are alike and a loss of all that is possible is
                // not a choice either: the engine takes them itself, without a question.
                if (step.kind !== 'any' || n >= options.length) {
                    const gone = options.slice(0, n);
                    for (const i of gone) combat.dice[s2][i] = null;
                    R.log(state, seat, (s2 === side ? 'Вы теряете ' : 'Противник теряет ') + n
                        + ' кубик(ов)' + (step.kind !== 'any' ? ' ' + this.kindName(step.kind) : '') + '.');
                    return null;
                }
                return { question: { kind: 'dice', who: this.seatOf(combat, s2), diceSide: s2, op: 'loseDie', n, options, kind2: step.kind, text: 'Какие кубики теряются?' } };
            }
            case 'rerollDie': {
                if (!inCombat) return null;
                const s2 = this.diceSideOf(combat, side, step);
                // The text may name a union of kinds: «перебросьте 2 `def. cube`
                // и/или `morale cube`» — the dice of any listed kind are offered.
                const kinds = Array.isArray(step.kinds) && step.kinds.length ? step.kinds : [step.kind];
                const fits = d => kinds.includes('any') || kinds.includes(d);
                const options = combat.dice[s2].map((d, i) => i)
                    .filter(i => combat.dice[s2][i] !== null && combat.dice[s2][i] !== undefined && fits(combat.dice[s2][i]));
                if (!options.length) return null;
                if (step.all) {
                    // All the dice of the kind are rerolled.
                    for (const i of options) combat.dice[s2][i] = R.rollDice(state, 1)[0];
                    R.log(state, seat, state.players[seat].name + ' перебрасывает кубики.');
                    return null;
                }
                const want = this.count(R, state, seat, step, ctx);
                const q = { question: { kind: 'dice', who: this.diceAsker(combat, side, step), diceSide: s2, op: 'rerollDie', n: Math.min(want, options.length), options, kind2: step.kind, kinds, text: 'Какие кубики перебросить?' } };
                // «вы обязаны перебросить 2 `def. cube` и/или `morale cube`» —
                // fewer dice than asked for is all that can be done.
                return q;
            }
            case 'spendDie': {
                if (!inCombat) return null;
                const s2 = this.diceSideOf(combat, side, step);
                // A step may cover a union of cube kinds («тратится def. или morale»):
                // one spend of one die of ANY listed kind resolves the card.
                const kinds = Array.isArray(step.kinds) && step.kinds.length ? step.kinds : [step.kind];
                const match = d => d !== null && d !== undefined && (kinds.includes('any') || kinds.includes(d));
                const options = combat.dice[s2].map((d, i) => i).filter(i => match(combat.dice[s2][i]));
                if (!options.length) {
                    // «Потратьте … чтобы …» — a payment that cannot be made
                    // buys nothing: the rest of the ability does not happen.
                    R.log(state, seat, state.players[seat].name + ' нечем оплатить: «'
                        + String(step.ability || '').slice(0, 60) + '» не выполняется.');
                    return step.pick ? { stop: true } : null;
                }
                if (step.all) {
                    // All the dice of the kind are spent: they lie on the
                    // ground, spent in place — never spliced out, so the
                    // remaining dice keep their identity.
                    for (const i of options) combat.dice[s2][i] = null;
                    R.log(state, seat, state.players[seat].name + ' тратит кубики.');
                    return null;
                }
                return { question: { kind: 'dice', who: this.diceAsker(combat, side, step), diceSide: s2, op: 'spendDie', n: Math.min(step.n, options.length), options, kind2: step.kind, kinds, text: 'Какие кубики потратить?' } };
            }
            case 'flipDie': {
                if (!inCombat) {
                    // «Вы можете перевернуть 1 из своих `morale cube` на `att.
                    // cube`» во время орбитального удара («Маскированная
                    // бомбардировка»): the cube of the strike is a hit.
                    if (state.order && state.order.phase === 'strike' && state.order.seat === seat) {
                        state.order.strikeBonus = (state.order.strikeBonus || 0) + (step.n || 1);
                        R.log(state, seat, state.players[seat].name + ' обращает кубик удара в атаку.');
                    }
                    return null;
                }
                const s2 = this.diceSideOf(combat, side, step);
                const options = combat.dice[s2].map((d, i) => i).filter(i => combat.dice[s2][i] !== null && combat.dice[s2][i] !== undefined && (step.kind === 'any' || combat.dice[s2][i] === step.kind));
                if (!options.length) return null;
                if (step.all) {
                    for (const i of options) combat.dice[s2][i] = step.to;
                    return null;
                }
                return { question: { kind: 'dice', who: this.diceAsker(combat, side, step), diceSide: s2, op: 'flipDie', n: Math.min(step.n, options.length), options, kind2: step.kind, text: 'Какие кубики перевернуть на ' + (step.to === 'att' ? 'атаку' : step.to === 'def' ? 'оборону' : 'мораль') + '?' } };
            }
            case 'rerollValue': {
                if (!inCombat) return null;
                const s2 = this.diceSideOf(combat, side, step);
                const options = combat.dice[s2].map((d, i) => i)
                    .filter(i => combat.dice[s2][i] !== null && combat.dice[s2][i] !== undefined);
                if (!options.length) return null;
                return { question: { kind: 'face', who: this.diceAsker(combat, side, step), diceSide: s2, op: 'rerollValue', options, text: 'Какое значение кубиков перебросить?' } };
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
                // «за каждый неконтролируемый или вражеский мир в активной системе» —
                // counted before any question is asked.
                if (step.nFromWorlds === 'enemyOrUncontrolled') {
                    const active = state.order ? state.order.system : null;
                    let count = 0;
                    if (active) {
                        const sys = state.systems.find(x => x.id === active);
                        for (const area of (sys ? sys.areas : [])) {
                            if (!area.world) continue;
                            if (this.areaStanding(state, seat, active, area.pos) !== 'friendly') count++;
                        }
                    }
                    if (count > 0) {
                        const base = p.faction === 'тираниды' && step.kind === 'reinforcement' ? 4 : 3;
                        const limit = Math.max(base, p.assetLimit || 0);
                        p.assets[step.kind] = Math.min(limit, (p.assets[step.kind] || 0) + count);
                        R.log(state, seat, p.name + ' получает жетоны подкрепления: ' + count + ' (за неконтролируемые или вражеские миры).');
                    } else {
                        R.log(state, seat, 'В активной системе нет неконтролируемых или вражеских миров — жетон подкрепления не получен.');
                    }
                    return null;
                }
                if (step.kind === 'any') {
                    return { question: { kind: 'assetType', who: seat, op: 'gainAsset', n: step.n || 1, options: ['forge', 'cache', 'reinforcement'], text: 'Какой жетон ресурса получить?' } };
                }
                // The printed limit is three; the Tyranids keep four reinforcement
                // tokens and a card may raise the limit for the whole game.
                const base = p.faction === 'тираниды' && step.kind === 'reinforcement' ? 4 : 3;
                const limit = Math.max(base, p.assetLimit || 0);
                p.assets[step.kind] = Math.min(limit, (p.assets[step.kind] || 0) + (step.n || 1));
                R.log(state, seat, state.players[seat].name + ' получает жетон(ы): ' + step.kind + '.');
                return null;
            }
            // «При выполнении приказа доминирования…» — the condition of the ability.
            case 'require': {
                const active = state.order ? state.order.system : null;
                let ok = true;
                if (step.what === 'materiel') {
                    ok = (p.materiel || 0) >= (step.n || 1);
                } else if (step.what === 'unitsOrStructures') {
                    ok = !!(active && R.hasUnitsOrStructures(state, seat, active));
                } else if (step.what === 'unroutedShip') {
                    ok = !!active && state.units.some(u => u.seat === seat && !u.routed && u.system === active
                        && (R.unitOf(state, u) || {}).type === 'ship');
                }
                if (ok) return null;
                R.log(state, seat, 'Способность не может быть применена: не хватает условий.');
                if (state.order && state.order.finishAfterEffect) state.order.finishAfterEffect = false;
                if (state.order && state.order.seat === seat) R.finishOrder(state, seat);
                return { stop: true };
            }
            case 'payMateriel': {
                const n = step.n || 1;
                if ((p.materiel || 0) < n) {
                    R.log(state, seat, 'Способность не может быть применена: не хватает материи.');
                    if (state.order && state.order.finishAfterEffect) state.order.finishAfterEffect = false;
                    if (state.order && state.order.seat === seat) R.finishOrder(state, seat);
                    return { stop: true };
                }
                p.materiel -= n;
                R.log(state, seat, p.name + ' тратит ' + n + ' материи.');
                return null;
            }
            case 'sequence': {
                // The steps of the step: the answer flow replaces the list with it.
                return { replace: step.steps || [] };
            }
            case 'guardDeploy': {
                const active = state.order ? state.order.system : null;
                const factories = active
                    ? state.structures.filter(st => st.seat === seat && st.type === 'factory' && st.system === active)
                    : [];
                if (!factories.length) {
                    R.log(state, seat, 'Способность «Массовое Производство» не применена: в активной системе нет вашей фабрики.');
                    return null;
                }
                const areas = factories.map(st => ({ system: st.system, pos: st.area }));
                if (areas.length > 1) {
                    return { question: { kind: 'areas', answerKey: 'factory', stage: 'factory', who: seat, op: 'guardDeploy', options: areas, text: 'Какая фабрика производит отряды?' } };
                }
                return this.startGuardDeploy(R, state, seat, areas[0]);
            }
            case 'moveUnits': {
                if (step.sourceWorld) {
                    const worlds = this.sourceWorlds(R, state, seat);
                    if (!worlds.length) return null;
                    return { question: { kind: 'areas', answerKey: 'source', stage: 'source', who: seat, op: 'moveUnits', options: worlds, text: 'С какого мира забрать отряды?' } };
                }
                const units = this.unitsOf(R, state, seat, combat, step);
                if (!units.length) return null;
                return { question: { kind: 'units', who: seat, op: 'moveUnits', n: Math.min(step.n || 1, units.length), options: units.map(u => u.id), text: step.questionText || 'Какие отряды переместить?' } };
            }
            case 'moveStructure': {
                const active = state.order ? state.order.system : null;
                const structures = state.structures.filter(s =>
                    s.seat === seat && (!step.kind || s.type === step.kind)
                    && (!step.ofSystem || !active || s.system === active));
                if (!structures.length) return null;
                return { question: { kind: 'structures', who: seat, op: 'moveStructure', options: structures.map(s => s.id), text: 'Что переместить?' } };
            }
            case 'setDie': {
                if (!inCombat) return null;
                const s2 = this.diceSideOf(combat, side, step);
                const options = combat.dice[s2].map((d, i) => i).filter(i => combat.dice[s2][i] !== null && combat.dice[s2][i] !== undefined);
                if (!options.length) return null;
                // «за каждого недеморализованного воина или крейсер переверните
                // 1 ваш кубик» — one flip per unit, each to any side.
                if (step.left === undefined) {
                    const total = step.per ? this.count(R, state, seat, step, ctx) : (step.n || 1);
                    step.left = Math.max(0, total);
                }
                if (!step.left) return null;
                return { question: { kind: 'diceFace', who: this.diceAsker(combat, side, step), diceSide: s2, op: 'setDie', n: 1, left: step.left, options, text: 'Какой кубик перевернуть и на какую грань? (' + step.left + ')' } };
            }
            case 'route': {
                let units = this.unitsOf(R, state, target, combat, step);
                // «… который находится в системе, содержащей хотя бы 1 из ваших
                // отрядов, либо находящийся в соседней с ней системе»
                // («Отбрыски Темпестус»).
                if (step.nearMine) {
                    const mine = new Set(state.units.filter(u => u.seat === seat && !u.routed).map(u => u.system));
                    const near = new Set(mine);
                    for (const sysId of mine) {
                        for (const nb of (R.neighbors ? R.neighbors(state, sysId) : [])) near.add(nb);
                    }
                    units = units.filter(u => near.has(u.system));
                }
                if (!units.length) return null;
                const asker0 = this.askerOf(step, target, seat);
                // The opponent may avoid the effect by spending a die.
                const avoid = step.avoidAsked ? null : this.avoidQuestion(R, state, target, step, combat, side);
                if (avoid) {
                    step.avoidAsked = true;
                    return avoid;
                }
                return { question: { kind: 'units', who: asker0, op: 'route', n: Math.min(step.n || 1, units.length), options: units.map(u => u.id), text: 'Какие отряды деморализовать?' } };
            }
            case 'restore': {
                let units = this.unitsOf(R, state, seat, combat, { routed: true });
                if (step.scope === 'activeAllOthersGround') {
                    const active = state.order ? state.order.system : null;
                    units = state.units.filter(u => {
                        if (u.seat !== seat || !u.routed) return false;
                        if (active && u.system === active) return true;
                        const def = R.unitOf(state, u);
                        return !!def && def.type === 'ground';
                    });
                }
                if (!units.length) return null;
                const n = step.all ? units.length : Math.min(step.n || 1, units.length);
                return { question: { kind: 'units', who: seat, op: 'restore', n, options: units.map(u => u.id), text: 'Какие отряды восстановить?' } };
            }
            case 'destroy': {
                // «Уничтожьте 1 юнита 0-го командного уровня» — the card names no
                // owner: any unit of the contested area qualifies, and the owner
                // of the card picks it (the rules, «Combat Card Resolution»).
                if (step.who === 'any' && combat) {
                    let any = state.units.filter(u => u.system === combat.system && u.area === combat.pos && !u.routed);
                    if (step.maxKl !== undefined) {
                        any = any.filter(u => {
                            const def = R.unitOf(state, u);
                            return def && (def.kl || 0) <= step.maxKl;
                        });
                    }
                    if (step.filter) any = any.filter(u => this.unitFits(R.unitOf(state, u), step.filter));
                    if (!any.length) return null;
                    return { question: { kind: 'units', who: seat, op: 'destroy', n: Math.min(step.n || 1, any.length), options: any.map(u => u.id), text: 'Какой отряд уничтожить?' } };
                }
                const units = this.unitsOf(R, state, target, combat, step);
                if (!units.length) return null;
                const avoid = step.avoidAsked ? null : this.avoidQuestion(R, state, target, step, combat, side);
                if (avoid) {
                    step.avoidAsked = true;
                    return avoid;
                }
                return { question: { kind: 'units', who: this.askerOf(step, target, seat), op: 'destroy', n: Math.min(step.n || 1, units.length), options: units.map(u => u.id), text: 'Какие отряды уничтожить?' } };
            }
            case 'retreat': {
                const units = this.unitsOf(R, state, target, combat, {});
                if (!units.length) return null;
                return { question: { kind: 'units', who: this.askerOf(step, target, seat), op: 'retreat', n: 1, options: units.map(u => u.id), text: 'Какой отряд отступает?' } };
            }
            // «Разместите 2 бесплатных Гвардейца в одном дружественном мире,
            // содержащем фабрику» («Имперская десятина»): one world, all the units.
            case 'placeFree': {
                const faction = R.faction(state, seat);
                const names = this.unitNames(step.what, faction);
                const types = (faction ? faction.units : []).filter(u =>
                    (names.length ? names.some(n => this.sameName(u.name, n)) : true)
                    && (p.supply.units[u.id] || 0) > 0);
                if (!types.length) return null;
                const count = Math.min(step.n || 1, p.supply.units[types[0].id] || 0);
                const areas = this.areasForAbility(R, state, seat, step.dest);
                if (!areas.length) {
                    R.log(state, seat, p.name + ' не может разместить отряды: нет подходящего мира.');
                    return null;
                }
                return { question: { kind: 'areas', who: seat, op: 'placeFree', n: count, kind2: types[0].id, options: areas, text: 'Где разместить отряды?' } };
            }
            case 'placeUnit': {
                const faction = R.faction(state, seat);
                const names = this.unitNames(step.what, faction);
                let types = (faction ? faction.units : []).filter(u => !names.length || names.some(n => this.sameName(u.name, n)));
                // «разместить его в дружественном мире» — a ship has nowhere to
                // stand there, so the ability covers ground units («1 отряд»).
                if (step.unitType) types = types.filter(u => u.type === step.unitType);
                // A free unit also comes from the supply: without a model there is
                // nothing to place (the rules, "Free Units").
                let free = types.filter(u => (p.supply.units[u.id] || 0) > 0);
                if (step.buy) {
                    // «купить 1 отряд» — the price and the command level are paid.
                    const cl = R.commandLevel(state, seat);
                    free = free.filter(u => (u.cost || 0) <= (p.materiel || 0) && (u.kl || 0) <= cl);
                }
                if (!free.length) return null;
                return { question: { kind: 'types', who: seat, op: 'placeUnit', n: step.n || 1, options: free.map(u => u.id), text: 'Какой отряд разместить?' } };
            }
            case 'placeStructure': {
                // «Купите 1 постройку» — the player chooses which one: only the
                // structures he can afford and actually take from the box are
                // offered; an empty offer ends the ability honestly in the log.
                const offer = ['factory', 'city', 'bastion'].filter(t => {
                    if (!step.free && p.materiel < R.structureStats(t).cost) return false;
                    const can = R.canTakeStructure(state, seat, t);
                    return can && can.ok;
                });
                if (step.kind === 'any') {
                    if (!offer.length) {
                        R.log(state, seat, p.name + ' не может купить постройку: нет денег или жетонов контроля.');
                        return null;
                    }
                    return { question: { kind: 'structureTypes', who: seat, op: 'placeStructure', options: offer, text: 'Какую постройку построить?' } };
                }
                if (offer.indexOf(step.kind) < 0) {
                    R.log(state, seat, p.name + ' не может построить постройку.');
                    return null;
                }
                const areas = this.areasFor(R, state, seat, 'structure');
                if (!areas.length) {
                    R.log(state, seat, p.name + ' некуда ставить постройку: нет дружественного мира без построек.');
                    return null;
                }
                return { question: { kind: 'areas', who: seat, op: 'placeStructure', kind2: step.kind, options: areas, text: 'Где построить?' } };
            }
            case 'placeReinforcement': {
                // «… в спорной области» — the area of the battle is the only one.
                if (step.here && combat) {
                    this.placeReinforcementAt(R, state, seat, step, { system: combat.system, pos: combat.pos }, side, ctx);
                    return null;
                }
                const areas = this.areasFor(R, state, seat, 'reinforcement');
                if (!areas.length) return null;
                return { question: { kind: 'areas', who: seat, op: 'placeReinforcement', n: step.n || 1, options: areas, text: 'Где разместить жетон подкрепления?' } };
            }
            // «Этот отряд или бастион получает урон первым» («Бронетанковый
            // клин»): the piece of the opponent that the damage must reach first.
            case 'damageFirst': {
                if (!inCombat) return null;
                const foeSeat = foe;
                const list = state.units.filter(u => {
                    if (u.seat !== foeSeat || u.system !== combat.system || u.area !== combat.pos) return false;
                    const def = R.unitOf(state, u);
                    return !!def && [2, 3].includes(def.kl || 0);
                }).map(u => u.id);
                for (const st of state.structures) {
                    if (st.seat !== foeSeat || st.type !== 'bastion') continue;
                    if (st.system !== combat.system || st.area !== combat.pos) continue;
                    list.push(st.id);
                }
                if (!list.length) return null;
                return { question: { kind: 'units', who: seat, op: 'damageFirst', n: 1, options: list, text: 'Какой отряд или бастион противника получает урон первым?' } };
            }
            case 'moveUnit': {
                let units = this.unitsOf(R, state, seat, combat, step);
                // «из дружественного мира, в котором есть постройка» («Врата
                // вечности»): the source world of the card.
                if (step.fromStructureWorld) {
                    units = units.filter(u => {
                        const sys = R.system(state, u.system);
                        const area = R.area(sys, u.area);
                        if (!area || !area.world) return false;
                        return R.structuresAt(state, u.system, u.area).length > 0;
                    });
                }
                if (!units.length) return null;
                return { question: { kind: 'units', who: seat, op: 'moveUnit', n: 1, options: units.map(u => u.id), text: step.questionText || 'Какой отряд переместить?' } };
            }
            case 'buyUpgrade': {
                const kind = step.kind || 'combat';
                // «уменьшите его стоимость на 1 за каждый дружественный мир, в
                // котором есть фабрика» («Приказ верховного командования»).
                const discount = this.upgradeDiscount(R, state, seat, step);
                const list = kind === 'combat'
                    ? FS_DATA.combat.filter(c => c.faction === p.faction && c.upgrade).map(c => c.name)
                    : FS_DATA.orders.filter(c => c.faction === p.faction).map(c => c.name);
                if (!list.length) return null;
                return { question: { kind: 'cards', who: seat, op: 'buyUpgrade', kind2: kind, options: list, discount, text: 'Какое улучшение купить?' } };
            }
            // «…сыграть любую карту из своей боевой колоды или колоды улучшений,
            // кроме карты, которая уже была разыграна» («Тактический гений»).
            case 'playAnyCard': {
                if (!inCombat) return null;
                const played = (combat.cards[side].played || []).map(x => x.name);
                const seen = [];
                const list = [];
                for (const n of (p.decks.combat || [])) {
                    if (played.includes(n) || seen.includes(n)) continue;
                    seen.push(n);
                    list.push(n);
                }
                if (!list.length) return null;
                return { question: { kind: 'cards', who: seat, op: 'playAnyCard', options: list, text: 'Какую карту сыграть из колоды?' } };
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
                // «этого мира» — the world chosen by the previous step is the world.
                if (ctx && ctx.world) return this.gainWorldAssetsBody(R, state, seat, step, ctx.world);
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
                // The extra damage goes to one side or to both. The «foe» of a
                // card that offers «the opponent takes 3 more damage» is the side
                // other than the card's player: the role is fixed for this combat.
                if (step.who === 'both') combat.extraDamageBoth = (combat.extraDamageBoth || 0) + (step.n || 0);
                else if (step.who === 'foe') {
                    combat.extraDamageFoe = (combat.extraDamageFoe || 0) + (step.n || 0);
                    combat.extraDamageFoeSide = (seat === combat.attacker) ? 'defender' : 'attacker';
                }
                else combat.extraDamage = (combat.extraDamage || 0) + (step.n || 0);
                return null;
            }
            // «… добавить 2 к общей сумме урона» («Точечный удар»).
            case 'strikeBonus': {
                if (state.order && state.order.phase === 'strike' && state.order.seat === seat) {
                    state.order.strikeBonus = (state.order.strikeBonus || 0) + (step.n || 0);
                    R.log(state, seat, state.players[seat].name + ' добавляет ' + (step.n || 0) + ' к урону удара.');
                    return null;
                }
                return null;
            }
            case 'ignoreBastion': {
                if (state.order) state.order.ignoreBastion = true;
                return null;
            }
            case 'noRoute': {
                if (!inCombat) return null;
                combat.noRoute = combat.noRoute || [];
                // «в этом раунде боя» — the immunity of the card lives while the
                // round does.
                combat.noRoute.push({
                    seat: step.who === 'foe' ? foe : seat,
                    round: combat.round,
                    kl: step.kl,
                });
                return null;
            }
            case 'replaceUnit': {
                const units = this.unitsOf(R, state, seat, combat, step);
                if (!units.length) return null;
                return { question: { kind: 'units', who: seat, op: 'replaceUnit', n: Math.min(step.n || 1, units.length), options: units.map(u => u.id), text: 'Какой отряд заменить?' } };
            }
            case 'extraFactory': {
                if (state.order) state.order.extraFactories = (state.order.extraFactories || 0) + (step.n || 0);
                return null;
            }
            case 'orderDiscount': {
                if (state.order) {
                    // The discount may be counted: "1 for every cultist".
                    const count = step.per && R.countFor ? R.countFor(state, seat, step.per) : 1;
                    state.order.discount = (state.order.discount || 0) + (step.n || 0) * count;
                }
                return null;
            }
            case 'assetLimit': {
                p.assetLimit = Math.max(p.assetLimit || 3, step.n || 3);
                return null;
            }
            case 'healthBonus': {
                if (combat) combat.healthBonus = (combat.healthBonus || 0) + (step.n || 0);
                return null;
            }
            case 'enemyHealth': {
                if (combat) combat.enemyHealth = step.n || 3;
                // «Во время этого орбитального удара здоровье отрядов вашего
                // противника уменьшается до 3» («Вирусные бомбы»).
                else if (state.order && state.order.seat === seat) state.order.enemyHealth = step.n || 3;
                return null;
            }
            case 'rerollAll': {
                if (!inCombat) return null;
                // Both sides roll all of their unspent dice again: the spent
                // stay spent, where they lie.
                for (const s2 of ['attacker', 'defender']) {
                    combat.dice[s2] = combat.dice[s2].map(d => d === null || d === undefined ? null : R.rollDice(state, 1)[0]);
                }
                R.log(state, seat, 'Все кубики перебрасываются.');
                return null;
            }
            case 'loseDieIfMore': {
                if (!inCombat) return null;
                const s2 = side === 'attacker' ? 'defender' : 'attacker';
                const mine = this.countCubes(R, state, seat, combat, 'morale');
                const theirs = this.countCubes(R, state, this.seatOf(combat, s2), combat, 'morale');
                if (theirs <= mine) return null;
                const at = combat.dice[s2].indexOf(step.kind || 'morale');
                if (at < 0) return null;
                combat.dice[s2][at] = null;
                R.log(state, seat, 'Противник теряет кубик морали.');
                return null;
            }
            case 'ignoreFoeAtt': {
                if (combat) combat.ignoreFoeAtt = true;
                return null;
            }
            case 'destroyRouted': {
                if (combat) combat.destroyRouted = true;
                return null;
            }
            case 'repeatDamage': {
                if (combat) combat.repeatDamage = true;
                return null;
            }
            case 'ignoreExcess': {
                // The engine always applies the damage unit by unit.
                return null;
            }
            case 'keepTokens': {
                // «do not discard your def. tokens at the end of this round of
                // combat» — the side that played the card keeps them.
                if (combat) {
                    combat.keepTokens = combat.keepTokens || {};
                    combat.keepTokens[side] = true;
                }
                return null;
            }
            case 'noReinforce': {
                if (combat) combat.noReinforce = true;
                return null;
            }
            case 'damageOneByOne': {
                if (combat) combat.damageOneByOne = true;
                return null;
            }
            case 'stealDie': {
                if (!inCombat) return null;
                const s2 = side === 'attacker' ? 'defender' : 'attacker';
                const options = combat.dice[s2].map((d, i) => i).filter(i => combat.dice[s2][i] !== null && combat.dice[s2][i] !== undefined);
                if (!options.length) return null;
                return { question: { kind: 'dice', who: this.seatOf(combat, s2), diceSide: s2, op: 'stealDie', options, text: 'Какой кубик сбросить?' } };
            }
            case 'convertFoeDice': {
                if (!inCombat) return null;
                const s2 = side === 'attacker' ? 'defender' : 'attacker';
                const faces = [...new Set(combat.dice[s2])].filter(d => d !== null && d !== undefined);
                if (!faces.length) return null;
                return { question: { kind: 'face', who: this.seatOf(combat, s2), diceSide: s2, op: 'convertFoeDice', options: faces, n: step.n || 2, text: 'Какие кубики сконвертировать?' } };
            }
            case 'discardFoeCard': {
                if (!inCombat) return null;
                const s2 = side === 'attacker' ? 'defender' : 'attacker';
                const played = (combat.cards[s2] && combat.cards[s2].played) || [];
                const options = played.map(c2 => c2.card && c2.card.name).filter(Boolean);
                if (!options.length) return null;
                return { question: { kind: 'cards', who: this.seatOf(combat, s2), op: 'discardFoeCard', options, text: 'Какую карту сбросить?' } };
            }
            case 'discardFoeTop': {
                if (!inCombat) return null;
                const s2 = side === 'attacker' ? 'defender' : 'attacker';
                const seat2 = this.seatOf(combat, s2);
                const deck = state.players[seat2].decks.combat;
                if (!deck.length) return null;
                R.log(state, seat, state.players[seat].name + ': противник сбрасывает верхнюю карту боевой колоды.');
                deck.shift();
                return null;
            }
            case 'citiesAsFactories': {
                if (state.order) {
                    state.order.citiesAsFactories = true;
                    if (step.only) state.order.factoryOnly = step.only;
                }
                return null;
            }
            case 'exchangeMateriel': {
                const kinds = ['forge', 'cache', 'reinforcement', 'prosperity'];
                return { question: { kind: 'assetType', who: seat, op: 'exchangeMateriel', options: kinds, n: step.n || 1, gain: step.gain || 1, text: 'Какой жетон ресурса получить?' } };
            }
            case 'exchangeAsset': {
                const p2 = state.players[seat];
                const kinds = ['forge', 'cache', 'reinforcement', 'prosperity'].filter(k => (p2.assets[k] || 0) > 0);
                if (!kinds.length) return null;
                return { question: { kind: 'assetType', who: seat, op: 'exchangeAsset', options: kinds, n: step.n || 1, gain: step.gain || 1, text: 'Какой жетон ресурса потратить?' } };
            }
            case 'extraOrderTokens': {
                p.extraOrderTokens = (p.extraOrderTokens || 0) + (step.n || 0);
                R.log(state, seat, state.players[seat].name + ' получает дополнительные жетоны приказов.');
                return null;
            }
            case 'replaceStructure': {
                const list = state.structures.filter(s => s.seat === seat && (!state.order || s.system === state.order.system));
                if (!list.length) return null;
                return { question: { kind: 'structures', who: seat, op: 'replaceStructure', options: list.map(s => s.id), text: 'Какую постройку заменить?' } };
            }
            case 'replaceStructureType': {
                const s = state.structures.find(x => x.id === step.structure);
                if (!s) return null;
                return { question: { kind: 'structureTypes', who: seat, op: 'replaceStructureType', options: ['city', 'factory', 'bastion'], text: 'На что заменить постройку?' } };
            }
            case 'lookEvents': {
                const names = p.decks.event.slice(0, step.n || 3);
                if (!names.length) return null;
                return { question: { kind: 'cards', who: seat, op: 'lookEvents', options: names, text: 'Какую карту оставить наверху?' } };
            }
            case 'extraCombatCards': {
                if (state.order) state.order.extraCombatCards = (state.order.extraCombatCards || 0) + (step.n || 0);
                return null;
            }
            case 'moveLimit': {
                if (state.order) state.order.moveLimit = step.n || 0;
                return null;
            }
            // «если хотя бы один из этих отрядов — Гвардеец» («Адептус Астрономика»).
            case 'mustInclude': {
                if (state.order) state.order.mustInclude = step.what;
                return null;
            }
            // The units over the capacity may retreat instead of going back into
            // the supply: the engines marks them, the player moves them.
            case 'retreatExcess': {
                const faction = R.faction(state, seat);
                const names = this.unitNames(step.what, faction);
                if (state.order && names.length) {
                    state.order.retreatExcessUnits = names[0];
                    R.log(state, seat, 'После приказа отряды «' + names[0] + '» сверх вместимости могут отступить.');
                }
                return null;
            }
            case 'uncontrolledMarch': {
                // "treat the uncontrolled worlds as friendly for moving up to 2
                // of your units": the budget is spent per unit, not per area.
                if (state.order) {
                    state.order.uncontrolled = step.n || 0;
                    state.order.uncontrolledUsed = 0;
                }
                return null;
            }
            case 'passVoid': {
                if (state.order) state.order.passVoid = step.n || 0;
                return null;
            }
            case 'freeStructure': {
                if (state.order) {
                    state.order.freeStructure = (state.order.freeStructure || 0) + (step.n || 0);
                    state.order.freeStructureKind = step.kind || 'bastion';
                }
                return null;
            }
            case 'structureFirst': {
                if (state.order) state.order.structureFirst = true;
                return null;
            }
            case 'bastionsAsFactories': {
                if (state.order) state.order.bastionsAsFactories = true;
                return null;
            }
            case 'capacityBonus': {
                if (state.order) {
                    state.order.capacityBonus = (state.order.capacityBonus || 0) + (step.n || 0);
                    if (step.max) state.order.capacityMax = step.max;
                    // «Дополнительная вместимость распространяется только на
                    // Гвардейцев» — the bonus counts for them alone.
                    if (step.only) state.order.capacityBonusOnly = step.only;
                }
                return null;
            }
            case 'cheapUnit': {
                if (state.order) state.order.cheapUnit = step.n || 1;
                return null;
            }
            case 'upgradeLimit': {
                if (state.order) state.order.upgradeLimit = step.n || 1;
                return null;
            }
            case 'combatLength': {
                if (combat) combat.maxRounds = step.n || 1;
                return null;
            }
            case 'costDiscount': {
                const kind = step.per;
                const count = kind && R.countFor ? R.countFor(state, seat, kind) : 0;
                p.cardDiscount = (p.cardDiscount || 0) + (step.n || 0) * count;
                if (count) R.log(state, seat, state.players[seat].name + ': скидка ' + (step.n * count) + ' за счёт карты.');
                return null;
            }
            case 'drawEvents': {
                for (let i = 0; i < (step.n || 1); i++) {
                    const name = R.drawEventCard(state, seat);
                    p.eventHand = p.eventHand || [];
                    p.eventHand.push(name);
                }
                R.log(state, seat, state.players[seat].name + ' берёт карты событий: ' + p.eventHand.join(', ') + '.');
                return null;
            }
            case 'playEvent': {
                const hand = p.eventHand || [];
                if (!hand.length) return null;
                return { question: { kind: 'cards', who: seat, op: 'playEvent', options: hand.slice(), text: 'Какую карту события разыграть?' } };
            }
            case 'supplyDeal': {
                if (state.order) state.order.supplyDeal = { n: step.n || 2, unit: step.unit || '' };
                return null;
            }
            case 'deployInFactoryWorld': {
                if (state.order) state.order.deployInFactoryWorld = true;
                return null;
            }
            case 'chooseSystem': {
                const list = state.systems.map(sys => sys.id);
                if (!list.length) return null;
                return { question: { kind: 'systems', who: seat, op: 'chooseSystem', options: list, text: 'Выберите систему.' } };
            }
            case 'destroyUnit': {
                const list = this.unitsOf(R, state, seat, combat, {});
                if (!list.length) return null;
                return { question: { kind: 'units', who: seat, op: 'destroyUnit', options: list.map(u => u.id), text: 'Какой отряд уничтожить?' } };
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
                // The sentence says no rule of its own: the engine shows it to
                // the player as a clarification of the rules.
                if (step.text) R.log(state, seat, step.text);
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
            // «Затем разыграйте ограниченное …» («Департаменто муниторум»): the
            // strategize order turns into the limited one when it is finished.
            case 'limitedOrder': {
                if (!state.order) return null;
                state.order.nestedKind = step.kind;
                R.log(state, seat, p.name + ' готовит ограниченный приказ: '
                    + (step.text || step.kind) + '.');
                step.done = true;
                return null;
            }
            // «Потратьте 1 `morale cube`, чтобы взять 1 ваш отряд и разместить
            // его … либо взять 1 из ваших отрядов … и поместить его в этот мир»
            // («Предвидение криптека»): the unit leaves one place and appears in
            // another — two questions of one step.
            case 'teleport': {
                const list = this.teleportSources(R, state, seat, step);
                if (!list.length) return null;
                return { question: { kind: 'units', who: seat, op: 'teleport', n: 1, options: list.map(u => u.id), text: 'Какой отряд перенести?' } };
            }
            // «Достаньте верхнюю карту из своей колоды и получите её боевые
            // значения» («Осколок обманщика») — the card is taken at once.
            case 'playTopCard': {
                if (!inCombat) return null;
                const deck = p.decks.combat;
                if (!deck.length) return null;
                const name = deck.shift();
                const card = FS_DATA.combat.find(x => x.faction === p.faction && x.name === name) || null;
                combat.cards[side].played.push({ name, card, side, round: combat.round, valuesOnly: true });
                R.log(state, seat, p.name + ' достаёт верхнюю карту колоды: «' + name + '» — только её боевые значения.');
                step.done = true;
                return null;
            }
            // «Вы можете выбрать 1 отряд с командным уровнем 0 в этом мире. Этот
            // отряд получит урон первым во время этого орбитального удара»
            // («Набег жнецов»): the choice waits for the world of the strike.
            case 'strikeFirst': {
                if (state.order) {
                    state.order.strikeFirstWanted = true;
                    state.order.strikeFirstKl = step.maxKl === undefined ? 0 : step.maxKl;
                }
                step.done = true;
                return null;
            }
            // «если в этом раунде боя отряд противника становится
            // деморализованным, он уничтожается» («Фаланга судного дня»).
            case 'destroyRoutedFoe': {
                if (!inCombat) return null;
                combat.destroyRoutedFoe = {
                    seat, round: combat.round,
                    avoid: step.avoid || { kind: 'def', n: 1 },
                };
                R.log(state, seat, p.name + ': деморализованные отряды противника будут уничтожены до конца раунда.');
                step.done = true;
                return null;
            }
            // «Если ваши отряды или бастионы не получат урона в конце этого
            // раунда, ваш противник отступает одним из своих отрядов»
            // («Фаланга монолита»): the effect waits for the end of the round.
            // «… в конце первого шага нанесения повреждений либо уничтожьте 1
            // отряд …, либо деморализуйте 1 отряд …» («Ракета Death Strike»).
            case 'deferDamage': {
                if (!inCombat) return null;
                combat.deferDamage = { seat, round: combat.round, steps: step.steps || [] };
                step.done = true;
                R.log(state, seat, p.name + ': эффект карты сработает в конце шага повреждений.');
                return null;
            }
            case 'noDamageRetreat': {
                if (!inCombat) return null;
                combat.noDamageRetreat = combat.noDamageRetreat || [];
                combat.noDamageRetreat.push({ seat, round: combat.round, steps: step.steps || [] });
                step.done = true;
                return null;
            }
            // «он уничтожается. Противник может избежать уничтожения, если
            // потратит 1 `def. cube`» («Фаланга судного дня»).
            case 'avoidDestroy': {
                const victim = state.units.find(u => u.id === step.unit);
                if (!victim) return null;
                if (!step.avoidAsked) {
                    const avoid = this.avoidQuestion(R, state, victim.seat, step, combat, side);
                    if (avoid) {
                        step.avoidAsked = true;
                        return avoid;
                    }
                }
                // Nothing to pay with: the unit is destroyed at once.
                R.destroyUnit(state, victim);
                R.log(state, victim.seat, state.players[victim.seat].name + ': деморализованный отряд уничтожен.');
                step.done = true;
                return null;
            }
            // «Вы можете выбрать 1 отряд с командным уровнем 0 в этом мире» —
            // the unit of «Набега жнецов» that takes the damage first.
            case 'strikeFirstPick': {
                const order = state.order;
                const planned = order && order.strikePlanned;
                if (!planned) return null;
                const list = (planned.victims || [])
                    .map(id => state.units.find(u => u.id === id))
                    .filter(Boolean)
                    .filter(u => {
                        const def = R.unitOf(state, u);
                        return def && (def.kl || 0) <= (step.maxKl === undefined ? 0 : step.maxKl);
                    });
                if (!list.length) return null;
                return { question: { kind: 'units', who: seat, op: 'strikeFirstPick', n: 1, options: list.map(u => u.id), text: 'Какой отряд получит урон первым?' } };
            }
            // «ваш противник уничтожит 1 жетон подкрепления в этой области за
            // каждый отряд, который вы деморализовали» («Гибельные косы»).
            case 'loseReinforcement': {
                if (!inCombat) return null;
                const s2 = target === seat ? side : (side === 'attacker' ? 'defender' : 'attacker');
                const n = step.n === undefined ? 1 : step.n;
                R.loseReinforcementTokens(state, s2, n);
                step.done = n > 0;
                return null;
            }
            // «взять 2 дополнительные боевые карты из колоды, затем выбрать и
            // сбросить столько же карт с руки» («Хрономантия»).
            case 'drawCombatCards': {
                if (!inCombat) return null;
                const hand = combat.cards[side].hand;
                const deck = p.decks.combat;
                let drawn = 0;
                for (let i = 0; i < (step.n || 1); i++) {
                    const name = deck.shift();
                    if (!name) break;
                    hand.push(name);
                    drawn++;
                }
                if (!drawn) return null;
                R.log(state, seat, p.name + ' берёт дополнительные боевые карты: ' + drawn + '.');
                step.done = true;
                const drop = Math.min(step.discard || drawn, hand.length);
                if (!drop) return null;
                step.discardLeft = drop;
                return { question: { kind: 'cards', who: seat, op: 'discardHand', n: 1, options: hand.slice(), text: 'Какую карту сбросить (осталось ' + drop + ')?' } };
            }
            // «вернуть этого юнита недеморализованным обратно после этапа
            // получения урона» («Сфера воскрешения»): the promise is kept by the
            // combat when the damage is over.
            case 'resurrect': {
                if (!inCombat) return null;
                // The card stays in play until a unit of the command level falls:
                // the combat asks about it after the damage step.
                combat.resurrectPlan = combat.resurrectPlan || [];
                combat.resurrectPlan.push({ seat, round: combat.round, maxKl: step.maxKl === undefined ? 1 : step.maxKl });
                step.done = true;
                return null;
            }
            // «Когда 1 из ваших отрядов … деморализован или уничтожен, вы можете
            // сбросить эту карту, чтобы вернуть этого юнита недеморализованным»
            // («Сфера воскрешения») — the very moment of the reaction.
            case 'resurrectOffer': {
                if (!inCombat) return null;
                return { question: { kind: 'yesno', who: seat, op: 'resurrectOffer', options: [], text: 'Сбросить план «Сфера воскрешения» и вернуть отряд?' } };
            }
            // «можете вдобавок купить 1 бастион и разместить его в дружественном
            // или нейтральном мире в активной или соседней системе»
            // («Миры-гробницы»).
            case 'buyBastionNearby': {
                const order = state.order;
                if (order && !(order.purchases || []).length && !order.bought) {
                    R.log(state, seat, p.name + ': бастион покупается вдобавок к покупке приказа — сначала купите отряд или постройку.');
                    return null;
                }
                const cost = step.cost === undefined ? R.structureStats('bastion').cost : step.cost;
                if ((p.materiel || 0) < cost) {
                    R.log(state, seat, p.name + ' не хватает материи на бастион.');
                    return null;
                }
                const can = R.canTakeStructure(state, seat, 'bastion');
                if (!can.ok) {
                    R.log(state, seat, can.error);
                    return null;
                }
                const areas = this.bastionAreasNearby(R, state, seat);
                if (!areas.length) {
                    R.log(state, seat, p.name + ': рядом нет мира без постройки.');
                    return null;
                }
                return { question: { kind: 'areas', who: seat, op: 'buyBastionNearby', options: areas, text: 'Где разместить бастион?' } };
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
                        if (step.who === 'foe') { const at = combat.dice[s2].map(Boolean).lastIndexOf(true); if (at >= 0) combat.dice[s2][at] = null; }
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
        const inCombat = !!(ctx && ctx.kind === 'combat' && combat);
        const owner = ctx && ctx.owner !== undefined ? ctx.owner : seat;
        const side = inCombat ? (owner === combat.attacker ? 'attacker' : 'defender') : null;
        // The opponent of the effect: the other side of the combat, the foe that was
        // chosen by the card, or simply another player at the table.
        const other = ctx && ctx.foe !== undefined ? ctx.foe : null;
        const target = step.who === 'foe'
            ? (inCombat
                ? (owner === combat.attacker ? combat.defender : combat.attacker)
                : (other !== null ? other : (state.players.find(x => x.seat !== owner) || {}).seat))
            : owner;
        const units = ids => (answer.units || ids || []).map(id => state.units.find(u => u.id === id)).filter(Boolean);
        // The dice the step points at and the faces they may have: the answer
        // cannot reach a die that is spent, of a wrong face, or on the wrong
        // side of the combat.
        const diceSide = s2 => (inCombat ? (step && step.who === 'foe' ? s2 : side) : side);
        const diceTarget = () => diceSide(side === 'attacker' ? 'defender' : 'attacker');
        const diceAllowed = (face) => {
            if (!inCombat) return true;
            const kinds = Array.isArray(step && step.kinds) && step.kinds.length ? step.kinds : [step && step.kind];
            if (!kinds.length || kinds.includes('any')) return true;
            return kinds.includes(face);
        };
        const liveIndex = (s2, i) => {
            const dice = combat.dice[s2] || [];
            return Number.isInteger(i) && i >= 0 && i < dice.length
                && dice[i] !== null && dice[i] !== undefined && diceAllowed(dice[i]);
        };
        switch (step.op) {
            case 'loseDie': {
                const s2 = side === 'attacker' ? 'defender' : 'attacker';
                for (const i of (answer.dice || []).slice().sort((a, b) => b - a)) {
                    if (liveIndex(s2, i)) combat.dice[s2][i] = null;
                }
                return null;
            }
            case 'rerollDie': {
                const s2 = diceTarget();
                for (const i of (answer.dice || [])) {
                    if (liveIndex(s2, i)) combat.dice[s2][i] = R.rollDice(state, 1)[0];
                }
                return null;
            }
            case 'spendDie': {
                const s2 = diceTarget();
                for (const i of (answer.dice || [])) {
                    if (liveIndex(s2, i)) combat.dice[s2][i] = null;
                }
                return null;
            }
            case 'flipDie': {
                const s2 = diceTarget();
                for (const i of (answer.dice || [])) {
                    if (liveIndex(s2, i)) combat.dice[s2][i] = step.to;
                }
                return null;
            }
            case 'rerollValue': {
                // All the dice of the chosen value are rerolled.
                const s2 = diceTarget();
                const face = answer.face || 'att';
                for (let i = 0; i < combat.dice[s2].length; i++) {
                    if (combat.dice[s2][i] === face) combat.dice[s2][i] = R.rollDice(state, 1)[0];
                }
                return null;
            }
            case 'gainAsset': {
                const kind = answer.asset || 'forge';
                const base = p.faction === 'тираниды' && kind === 'reinforcement' ? 4 : 3;
                const limit = Math.max(base, p.assetLimit || 0);
                p.assets[kind] = Math.min(limit, (p.assets[kind] || 0) + (step.n || 1));
                R.log(state, seat, state.players[seat].name + ' получает жетон(ы): ' + kind + '.');
                return null;
            }
            case 'destroyUnit': {
                const list = units(answer.units);
                for (const u of list) {
                    R.destroyUnit(state, u);
                    R.log(state, seat, state.players[seat].name + ' уничтожает отряд.');
                }
                return null;
            }
            case 'chooseSystem': {
                return null;
            }
            case 'exchangeMateriel': {
                const kind = answer.asset || answer.assetType || 'forge';
                const n = Math.min(step.n || 1, p.materiel);
                if (n <= 0) return null;
                p.materiel -= n;
                // The Tyranids keep four reinforcement tokens: the faction sheet
                // takes precedence over the printed limit of three.
                const assetLimit = p.faction === 'тираниды' && kind === 'reinforcement' ? 4 : 3;
                p.assets[kind] = Math.min(assetLimit, (p.assets[kind] || 0) + n * (step.gain || 1));
                R.log(state, seat, state.players[seat].name + ' меняет материю на жетон ресурса.');
                return null;
            }
            case 'exchangeAsset': {
                const kind = answer.asset || answer.assetType || 'forge';
                const n = Math.min(step.n || 1, p.assets[kind] || 0);
                if (n <= 0) return null;
                p.assets[kind] -= n;
                p.materiel = Math.min(this.MATERIEL_MAX, p.materiel + n * (step.gain || 1));
                R.log(state, seat, state.players[seat].name + ' меняет жетон ресурса на материю.');
                return null;
            }
            case 'replaceStructure': {
                const s = state.structures.find(x => x.id === answer.structure);
                if (!s) return null;
                // The new kind of the structure is asked next.
                return { replace: [{ op: 'replaceStructureType', structure: s.id }] };
            }
            case 'replaceStructureType': {
                const s = state.structures.find(x => x.id === step.structure);
                const type = answer.type;
                if (!s || !type) return null;
                if (!['city', 'factory', 'bastion'].includes(type)) return null;
                s.type = type;
                R.log(state, seat, state.players[seat].name + ' заменяет постройку.');
                return null;
            }
            case 'lookEvents': {
                const name = answer.card;
                const deck = p.decks.event;
                if (!name || !deck.includes(name)) return null;
                // The chosen card stays on top, the others go to the bottom.
                const rest = deck.filter(x => x !== name);
                const top = deck.filter(x => x === name);
                p.decks.event = top.concat(rest);
                R.log(state, seat, state.players[seat].name + ' смотрит карты событий.');
                return null;
            }
            case 'stealDie': {
                const s2 = side === 'attacker' ? 'defender' : 'attacker';
                const dice = combat.dice[s2];
                for (const i of (answer.dice || [])) {
                    if (i >= 0 && i < dice.length && dice[i] !== null && dice[i] !== undefined) {
                        const value = dice[i];
                        dice[i] = null;
                        combat.dice[side].push(value);
                    }
                }
                R.log(state, seat, state.players[seat].name + ' забирает кубик противника.');
                return null;
            }
            case 'convertFoeDice': {
                const s2 = side === 'attacker' ? 'defender' : 'attacker';
                const dice = combat.dice[s2];
                const face = answer.face;
                const n = Math.min(step.n || 2, dice.filter(d => d === face).length);
                for (let i = 0; i < n; i++) {
                    const at = dice.indexOf(face);
                    if (at < 0) break;
                    const value = R.rollDice(state, 1)[0];
                    dice[at] = value === face ? (value === 'att' ? 'def' : 'att') : value;
                }
                R.log(state, seat, state.players[seat].name + ' конвертирует кубики противника.');
                return null;
            }
            case 'discardFoeCard': {
                const s2 = side === 'attacker' ? 'defender' : 'attacker';
                const played = combat.cards[s2].played;
                const name = answer.card;
                const at = played.findIndex(c2 => c2.card && c2.card.name === name);
                if (at < 0) return null;
                const card = played.splice(at, 1)[0];
                state.players[this.seatOf(combat, s2)].decks.combat.push(card.card.name);
                R.log(state, seat, state.players[seat].name + ': карта противника «' + name + '» сброшена.');
                return null;
            }
            case 'playEvent': {
                const name = answer.card;
                const hand = p.eventHand || [];
                if (!name || !hand.includes(name)) return null;
                // The other cards go back to the deck.
                for (const other of hand) if (other !== name) p.decks.event.push(other);
                p.eventHand = [];
                const card = FS_DATA.events.find(e => e.name === name);
                if (!card) return null;
                R.log(state, seat, state.players[seat].name + ' разыграл карту события «' + name + '».');
                const steps = FS_EFFECTS.parse(card.text || '', { kind: 'event', faction: p.faction });
                return { replace: steps };
            }
            case 'replaceUnit': {
                const list = units(answer.units);
                if (!list.length) return null;
                const faction = FS_EFFECTS.factionOf({ faction: state.players[seat].faction });
                const names = FS_EFFECTS.unitNames(step.to, faction);
                const def = names.length ? faction.units.find(u => this.sameName(u.name, names[0])) : null;
                if (!def) return null;
                const p = state.players[seat];
                for (const u of list) {
                    // Both models come from the supply: the new one stands up
                    // unrouted, the old one goes back to the reserve.
                    if ((p.supply.units[def.id] || 0) <= 0) break;
                    p.supply.units[def.id]--;
                    if (u.unit) p.supply.units[u.unit] = (p.supply.units[u.unit] || 0) + 1;
                    u.unit = def.id;
                    u.routed = false;
                    R.log(state, seat, state.players[seat].name + ' заменяет отряд на «' + def.name + '».');
                }
                return null;
            }
            case 'moveUnits': {
                if (step.sourceWorld) {
                    // The first question: the world the units are taken from.
                    if (!answer.source) {
                        const worlds = this.sourceWorlds(R, state, seat);
                        if (!worlds.length) return null;
                        return { question: { kind: 'areas', answerKey: 'source', stage: 'source', who: seat, op: 'moveUnits', options: worlds, text: 'С какого мира забрать отряды?' } };
                    }
                    // The second question: any number of my unrouted units from it.
                    if (answer.units === undefined) {
                        const all = state.units.filter(u => u.seat === seat && !u.routed
                            && u.system === answer.source.system && u.area === answer.source.pos);
                        if (!all.length) return null;
                        return { question: { kind: 'units', who: seat, op: 'moveUnits', n: all.length, options: all.map(u => u.id), text: 'Какие отряды забрать? (любое количество)' } };
                    }
                    if (!answer.units.length) return null;
                } else {
                    const list0 = units(answer.units);
                    if (!list0.length) return null;
                }
                const list = units(answer.units);
                if (!list.length) return null;
                const area = answer.area;
                if (!area) {
                    const areas = this.areasForAbility(R, state, seat, step.dest);
                    if (!areas.length) return null;
                    return { question: { kind: 'areas', who: seat, op: 'moveUnits', options: areas, text: 'Куда переместить отряды?' } };
                }
                for (const u of list) {
                    R.noteMove(state, seat, u, area);
                    u.system = area.system;
                    u.area = area.pos;
                }
                R.log(state, seat, state.players[seat].name + ' перемещает отряды.');
                return null;
            }
            case 'moveStructure': {
                const s = state.structures.find(x => x.id === (answer.structure || answer.id));
                const area = answer.area;
                if (!s) return null;
                if (!area) {
                    // «в ДРУГОЙ мир» — the world the factory stands in is not a
                    // destination.
                    const areas = this.areasForAbility(R, state, seat, step.dest || 'worldActiveOrAdjacentNeutralOrFriendly')
                        .filter(a => a.system !== s.system || a.pos !== s.area);
                    if (!areas.length) return null;
                    return { question: { kind: 'areas', who: seat, op: 'moveStructure', options: areas, text: 'Куда передвинуть фабрику?' } };
                }
                s.system = area.system;
                s.area = area.pos;
                R.log(state, seat, state.players[seat].name + ' перемещает фабрику.');
                return null;
            }
            case 'setDie': {
                const s2 = inCombat ? diceTarget() : side;
                const i = answer.dice && answer.dice.length ? answer.dice[0] : -1;
                if (inCombat ? liveIndex(s2, i) : (i >= 0 && i < combat.dice[s2].length)) combat.dice[s2][i] = answer.face || 'att';
                step.done = true;
                // «за каждого … переверните 1 ваш кубик» — the next flip is asked
                // until the count of the units is spent.
                if (step.left !== undefined) {
                    step.left = Math.max(0, step.left - 1);
                    if (step.left > 0) {
                        const dice = combat.dice[s2] || [];
                        const options = dice.map((d, at) => at).filter(at => dice[at] !== null && dice[at] !== undefined);
                        if (options.length) {
                            return { question: { kind: 'diceFace', who: this.diceAsker(combat, side, step), diceSide: s2, op: 'setDie', n: 1, left: step.left, options, text: 'Какой кубик перевернуть и на какую грань? (' + step.left + ')' } };
                        }
                    }
                }
                return null;
            }
            case 'route': {
                const routed = units(answer.units);
                for (const u of routed) {
                    u.routed = true;
                    // The round the unit was routed in: the cards that last
                    // «в этом раунде боя» count only these («Фаланга судного дня»).
                    if (inCombat && combat) u.routedRound = combat.round;
                    R.log(state, u.seat, state.players[u.seat].name + ': отряд деморализован.');
                }
                step.done = routed.length > 0;
                step.routedCount = routed.length;
                // «…за каждый отряд, который вы деморализовали» — the steps of
                // «Если вы это сделаете» count what this step did.
                for (const one of (Array.isArray(step.then) ? step.then : [])) {
                    if (one && one.per === 'routed') one.n = routed.length;
                }
                if (inCombat && combat && combat.destroyRoutedFoe && routed.some(u => u.seat !== seat)) {
                    combat.destroyRoutedFoe.touched = true;
                }
                return null;
            }
            case 'restore': {
                const back = units(answer.units);
                for (const u of back) {
                    u.routed = false;
                    R.log(state, u.seat, state.players[u.seat].name + ': отряд восстановлен.');
                }
                step.done = back.length > 0;
                return null;
            }
            case 'destroy': {
                const dead = units(answer.units);
                for (const u of dead) R.destroyUnit(state, u);
                step.done = dead.length > 0;
                // «… чтобы противник потерял 2 кубика за каждого уничтоженного
                // Гвардейца» — the next steps count what this one destroyed.
                step.destroyedCount = dead.length;
                return null;
            }
            case 'retreat': {
                const u = units(answer.units)[0];
                if (!u) return null;
                // A retreat during a round of combat follows the retreat rules:
                // the unit leaves the contested area (and is routed). Without an
                // area to retreat to the unit is destroyed (the rules, «Retreats»).
                if (inCombat && combat) {
                    if (!answer.area) {
                        // The area of the retreat fits the unit that leaves: a
                        // ground unit goes to a world, a ship to a void.
                        const def = R.unitOf(state, u);
                        const wantWorld = def ? def.type === 'ground' : true;
                        let targets = typeof R.retreatTargets === 'function' ? R.retreatTargets(state, u.seat) : [];
                        targets = targets.filter(t => {
                            const sys = R.system(state, t.system);
                            const a = sys ? R.area(sys, t.pos) : null;
                            return !!a && !!a.world === wantWorld;
                        });
                        if (targets.length) {
                            return { question: { kind: 'areas', who: u.seat, op: 'retreat', options: targets, text: 'Куда отступить?' } };
                        }
                        R.log(state, u.seat, state.players[u.seat].name + ': отступать некуда, отряд гибнет.');
                        R.destroyUnit(state, u);
                        step.done = true;
                        return null;
                    }
                    R.noteMove(state, u.seat, u, answer.area);
                    u.system = answer.area.system;
                    u.area = answer.area.pos;
                    if (typeof R.trimArea === 'function') R.trimArea(state, u.seat, u.system, u.area);
                }
                u.routed = true;
                R.log(state, u.seat, state.players[u.seat].name + ': отряд отступает.');
                step.done = true;
                return null;
            }
            case 'placeFree': {
                const area = answer.area;
                const def = R.unitDef(state, seat, answer.type || step.kind2 || step.what);
                if (!area || !def) return null;
                let n = Math.min(step.n || 1, p.supply.units[def.id] || 0);
                if (!n) return null;
                while (n > 0) {
                    p.supply.units[def.id]--;
                    R.addUnit(state, seat, def.id, area.system, area.pos);
                    n--;
                }
                R.log(state, seat, state.players[seat].name + ' размещает «' + def.name + '» бесплатно.');
                return null;
            }
            case 'placeUnit': {
                const def = R.unitDef(state, seat, answer.type);
                if (!def) return null;
                const area = answer.area;
                if (!area) {
                    // The place of the unit is the next question.
                    const areas = step.dest
                        ? this.areasForAbility(R, state, seat, step.dest)
                        : this.areasFor(R, state, seat, def.type === 'ship' ? 'void' : 'world');
                    return { question: { kind: 'areas', who: seat, op: 'placeUnit', kind2: def.id, options: areas, text: 'Где разместить отряд?' } };
                }
                const sys = R.system(state, area.system);
                const a = R.area(sys, area.pos);
                if (!a) return null;
                if ((p.supply.units[def.id] || 0) <= 0) return null;
                // «купить 1 отряд» — the ability buys at the printed price.
                if (step.buy) {
                    if ((p.materiel || 0) < def.cost) {
                        R.log(state, seat, state.players[seat].name + ' не хватает материи, чтобы купить «' + def.name + '».');
                        return null;
                    }
                    p.materiel -= def.cost;
                    R.log(state, seat, state.players[seat].name + ' тратит ' + def.cost + ' материи.');
                }
                p.supply.units[def.id]--;
                R.addUnit(state, seat, def.id, area.system, area.pos);
                R.log(state, seat, state.players[seat].name + ' размещает «' + def.name + '».');
                return null;
            }
            case 'placeStructure': {
                // The first answer of a «buy a structure» step: which kind was
                // bought. The choice stays on the step; the question about the
                // world follows.
                if (answer.type !== undefined && !answer.area) {
                    const t = answer.type;
                    if (['factory', 'city', 'bastion'].indexOf(t) < 0) return { ok: false, error: 'Такой постройки нет.' };
                    const stats = R.structureStats(t);
                    if (!step.free && p.materiel < stats.cost) return { ok: false, error: 'Не хватает материи.' };
                    const can = R.canTakeStructure(state, seat, t);
                    if (!can.ok) return { ok: false, error: can.error };
                    step.kind = t;
                    const areas = this.areasFor(R, state, seat, 'structure');
                    if (!areas.length) {
                        R.log(state, seat, p.name + ' некуда ставить постройку: нет дружественного мира без построек.');
                        return null;
                    }
                    return { question: { kind: 'areas', who: seat, op: 'placeStructure', kind2: t, options: areas, text: 'Где построить?' } };
                }
                const area = answer.area;
                if (!area) return null;
                const stats = R.structureStats(step.kind);
                // The plastic of the structures is shared and counted on the board.
                const can = R.canTakeStructure(state, seat, step.kind);
                if (!can.ok) return { ok: false, error: can.error };
                if (!step.free && p.materiel < stats.cost) return { ok: false, error: 'Не хватает материи.' };
                // The structure may be free, but it always comes from the reserve.
                if (!step.free) p.materiel -= stats.cost;
                R.addStructure(state, seat, step.kind, area.system, area.pos);
                R.log(state, seat, state.players[seat].name + ' строит: ' + R.structureName(step.kind) + '.');
                return null;
            }
            case 'placeReinforcement': {
                const area = answer.area;
                if (!area) return null;
                if (!combat) return null;
                this.placeReinforcementAt(R, state, seat, step, area, side, ctx);
                return null;
            }
            case 'damageFirst': {
                const id = (answer.units || [])[0];
                if (!id) return null;
                const foeSide = side === 'attacker' ? 'defender' : 'attacker';
                combat.damageFirst = combat.damageFirst || [];
                combat.damageFirst.push({ side: foeSide, id, round: combat.round });
                R.log(state, seat, 'Выбранный отряд противника получает урон первым.');
                return null;
            }
            case 'moveUnit': {
                const u = units(answer.units)[0];
                const area = answer.area;
                if (!u) return null;
                if (!area) {
                    const areas = this.areasForAbility(R, state, seat, step.dest);
                    if (!areas.length) return null;
                    return { question: { kind: 'areas', who: seat, op: 'moveUnit', options: areas, text: 'Куда переместить отряд?' } };
                }
                R.noteMove(state, seat, u, area);
                u.system = area.system;
                u.area = area.pos;
                return null;
            }
            case 'buyUpgrade': {
                const card = answer.card;
                if (!card) return null;
                const off = this.upgradeDiscount(R, state, seat, step);
                if (step.kind === 'combat') {
                    const c = FS_DATA.combat.find(x => x.faction === p.faction && x.upgrade && x.name === card);
                    if (!c) return null;
                    const price = Math.max(0, (c.cost || 0) - off);
                    if (p.materiel < price) return null;
                    p.materiel -= price;
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
            // «Затем разыграйте ограниченное …» («Департаменто муниторум»): the
            // strategize order turns into the limited one when it is finished.
            case 'limitedOrder': {
                if (!state.order) return null;
                state.order.nestedKind = step.kind;
                R.log(state, seat, p.name + ' готовит ограниченный приказ: '
                    + (step.text || step.kind) + '.');
                return null;
            }
            case 'playAnyCard': {
                const name = answer.card;
                if (!name || !inCombat) return null;
                const deck = p.decks.combat || [];
                const i = deck.indexOf(name);
                if (i < 0) return null;
                // «сыграть любую карту из своей боевой колоды или колоды
                // улучшений, кроме карты, которая уже была разыграна»
                // («Тактический гений»): the card comes to the hand and is played
                // in this round like any other card of it.
                deck.splice(i, 1);
                combat.cards[side].hand.push(name);
                R.log(state, seat, p.name + ' берёт из колоды карту «' + name + '».');
                step.done = true;
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
                const p2 = state.players[target] || state.players[seat];
                const kind = answer.asset || (answer.assets || [])[0];
                if (!kind || !p2) return null;
                p2.assets[kind] = Math.max(0, (p2.assets[kind] || 0) - (step.n || 1));
                R.log(state, p2.seat, p2.name + ' теряет жетон: ' + kind + '.');
                return null;
            }
            case 'gainWorldAssets': {
                const area = answer.area || ctx.world;
                // The second leg of the step: the token the player chose for the
                // world's prosperity icon.
                if (answer.asset) {
                    const kind = answer.asset;
                    const base = p.faction === 'тираниды' && kind === 'reinforcement' ? 4 : 3;
                    const limit = Math.max(base, p.assetLimit || 0);
                    p.assets[kind] = Math.min(limit, (p.assets[kind] || 0) + (step.prosperity || 1));
                    R.log(state, seat, state.players[seat].name + ' берёт жетон процветания: ' + kind + '.');
                    return null;
                }
                if (!area) return null;
                return this.gainWorldAssetsBody(R, state, seat, step, area);
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
            case 'sequence': {
                // The steps of the sequence are executed in the place of it.
                return { replace: step.steps || [] };
            }
            case 'guardDeploy': {
                const factory = answer.factory || answer.area;
                if (factory) return this.startGuardDeploy(R, state, seat, factory);
                return null;
            }
            case 'choice': {
                const i = Number(answer.choice);
                const option = step.options && step.options[i];
                if (!option) return null;
                // «за каждый имеющийся у вас `morale cube` получите 1 … либо 1 …»
                // — the count belongs to the branch that was chosen.
                if (step.per) {
                    const total = this.count(R, state, seat,
                        { n: 1, per: step.per, perKind: step.perKind, max: step.max, filter: step.filter }, ctx);
                    if (total > 1) option.n = (option.n || 1) * total;
                }
                return this.step(R, state, seat, option, ctx);
            }
            case 'teleport': {
                const u = units(answer.units)[0];
                if (!u) return null;
                if (!answer.area) {
                    const areas = this.teleportTargets(R, state, seat, step);
                    if (!areas.length) {
                        R.log(state, seat, state.players[seat].name + ': нет мира, куда перенести отряд.');
                        return null;
                    }
                    return { question: { kind: 'areas', who: seat, op: 'teleport', options: areas, text: 'Куда перенести отряд?' } };
                }
                R.noteMove(state, seat, u, answer.area);
                u.system = answer.area.system;
                u.area = answer.area.pos;
                R.log(state, seat, state.players[seat].name + ' переносит отряд: «' + (R.unitOf(state, u) || {}).name + '».');
                step.done = true;
                return null;
            }
            // The cards drawn by «Хрономантии» are chosen on the same step: the
            // panel shows them one by one and the step collects the answers.
            case 'drawCombatCards': {
                const hand = combat ? combat.cards[side].hand : null;
                if (!hand) return null;
                const names = answer.cards && answer.cards.length ? answer.cards
                    : (answer.card ? [answer.card] : []);
                for (const name of names) {
                    const at = hand.indexOf(name);
                    if (at < 0) continue;
                    hand.splice(at, 1);
                    p.decks.combat.push(name);
                    if (step.discardLeft !== undefined) step.discardLeft -= 1;
                    R.log(state, seat, state.players[seat].name + ' сбрасывает боевую карту «' + name + '».');
                    break;
                }
                if (step.discardLeft > 0 && hand.length) {
                    return { question: { kind: 'cards', who: seat, op: 'discardHand', n: 1, options: hand.slice(), text: 'Какую карту сбросить (осталось ' + step.discardLeft + ')?' } };
                }
                step.discardLeft = 0;
                return null;
            }
            case 'discardHand': {
                const hand = combat ? combat.cards[side].hand : null;
                if (!hand) return null;
                const names = answer.cards && answer.cards.length ? answer.cards
                    : (answer.card ? [answer.card] : []);
                for (const name of names) {
                    const at = hand.indexOf(name);
                    if (at < 0) continue;
                    hand.splice(at, 1);
                    p.decks.combat.push(name);
                    R.log(state, seat, state.players[seat].name + ' сбрасывает боевую карту «' + name + '».');
                }
                return null;
            }
            case 'avoidDestroy': {
                const victim = state.units.find(u => u.id === step.unit);
                if (victim) {
                    R.destroyUnit(state, victim);
                    R.log(state, victim.seat, state.players[victim.seat].name + ': деморализованный отряд уничтожен.');
                }
                step.done = true;
                return null;
            }
            case 'strikeFirstPick': {
                const id = (answer.units || [])[0];
                if (state.order && id) state.order.strikeFirst = id;
                return null;
            }
            case 'resurrectOffer': {
                const asked = answer.yes !== undefined ? !!answer.yes : !(answer.no);
                if (!asked) return null;
                const seat0 = ctx && ctx.owner !== undefined ? ctx.owner : seat;
                const player = state.players[seat0];
                const at = (player.schemes || []).findIndex(x => (x.steps || []).some(y => y && y.op === 'resurrect'));
                if (at < 0) return null;
                const scheme = player.schemes[at];
                player.schemes.splice(at, 1);
                R.log(state, seat0, player.name + ' сбрасывает план «' + scheme.name + '».');
                R.applyResurrect(state);
                step.done = true;
                return null;
            }
            case 'buyBastionNearby': {
                const area = answer.area;
                if (!area) return null;
                const cost = step.cost === undefined ? R.structureStats('bastion').cost : step.cost;
                const buyer = state.players[ctx && ctx.owner !== undefined ? ctx.owner : seat];
                if ((buyer.materiel || 0) < cost) return null;
                const can = R.canTakeStructure(state, buyer.seat, 'bastion');
                if (!can.ok) return null;
                buyer.materiel -= cost;
                R.addStructure(state, buyer.seat, 'bastion', area.system, area.pos);
                R.log(state, buyer.seat, buyer.name + ' покупает бастион за ' + cost + ' материи.');
                step.done = true;
                return null;
            }
            default:
                return null;
        }
    },

    // The number of the effect: "for every unit" is counted here. In a combat
    // the reinforcement tokens count as units too — a routed token does not.
    // The tokens a card places in the battle: free ones come from the supply and
    // are never counted among the assets the player brings home.
    placeReinforcementAt(R, state, seat, step, area, side, ctx) {
        const combat = state.combat;
        if (!combat || !area) return 0;
        const p = state.players[seat];
        const want = step.n || 1;
        const n = step.free ? want : Math.min(want, p.assets.reinforcement || 0);
        if (!n) return 0;
        if (!step.free) p.assets.reinforcement -= n;
        combat.reinforce = combat.reinforce || { attacker: 0, defender: 0 };
        combat.reinforce[side] = (combat.reinforce[side] || 0) + n;
        if (step.free) {
            combat.reinforceFree = combat.reinforceFree || { attacker: 0, defender: 0 };
            combat.reinforceFree[side] = (combat.reinforceFree[side] || 0) + n;
        }
        R.log(state, seat, p.name + ' размещает ' + n + ' жетон(ов) подкрепления'
            + (step.free ? ' бесплатно.' : '.'));
        return n;
    },

    // The price of an upgrade less the discount of the card: «на 1 за каждый
    // дружественный мир, в котором есть фабрика».
    upgradeDiscount(R, state, seat, step) {
        if (!step || !step.discount) return 0;
        if (step.discount !== 'factories') return Number(step.discount) || 0;
        let n = 0;
        for (const sys of state.systems) {
            for (const a of sys.areas) {
                if (!a.world) continue;
                if (R.control(state, seat, sys.id, a.pos) !== 'friendly') continue;
                if (R.structuresAt(state, sys.id, a.pos).some(st => st.seat === seat && st.type === 'factory')) n += 1;
            }
        }
        return n;
    },

    count(R, state, seat, step, ctx) {
        let n = step.n || 1;
        if (step.per === 'cube') {
            const combat = state.combat;
            if (combat) {
                const s2 = seat === combat.attacker ? 'attacker' : 'defender';
                n = (step.n || 1) * (combat.dice[s2] || []).filter(d => d === (step.perKind || 'morale')).length;
                if (step.max) n = Math.min(n, step.max);
            } else {
                n = step.n || 1;
            }
            return Math.max(0, n);
        }
        if (step.per === 'pair' && Array.isArray(step.pairs)) {
            // «за каждую пару недеморализованных Гвардейцев и Огринов либо
            // Крейсеров и Линкоров» — the smaller side of every pair counts.
            const alive = u => !u.routed;
            const n2 = filter => state.units.filter(u => u.seat === seat && alive(u)
                && (!filter || this.unitFits(R.unitOf(state, u), filter))).length;
            let pairs = 0;
            for (const [a, b] of step.pairs) pairs += Math.min(n2(a), n2(b));
            n = (step.n || 1) * pairs;
            if (step.max) n = Math.min(n, step.max);
            return Math.max(0, n);
        }
        if (step.per === 'unit') {
            const combat = state.combat;
            const inBattle = !!(ctx && ctx.kind === 'combat' && combat && step.inBattle);
            const units = state.units.filter(u => u.seat === seat && !u.routed
                && (!inBattle || (u.system === combat.system && u.area === combat.pos)));
            const matching = step.filter
                ? units.filter(u => this.unitFits(R.unitOf(state, u), step.filter))
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
            if (inBattle && !step.filter) {
                const side = seat === combat.attacker ? 'attacker' : 'defender';
                n += (step.n || 1) * R.tokenUnits(state, side).alive;
            }
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

    // The number of the cubes of a kind on the table of the player.
    countCubes(R, state, seat, combat, kind) {
        if (!combat) return 0;
        const side = seat === combat.attacker ? 'attacker' : 'defender';
        const dice = combat.dice[side] || [];
        let n = dice.filter(d => d === kind).length;
        const tokens = combat.tokens[side] || {};
        if (kind === 'att') n += tokens.att || 0;
        if (kind === 'def') n += tokens.def || 0;
        return n;
    },

    // The units of the area of the combat (or the whole board).
    // Does a unit definition fit the filter of the card? "types" are the names,
    // "contains" are the stems of the printed names (see UNIT_STEMS).
    unitFits(def, filter) {
        if (!def || !filter) return true;
        if (filter.type) return def.type === filter.type;
        // The broad classes are written as words of the text: «наземный отряд»,
        // «корабль», «отряд». The transcription glues them together
        // («наземныйотряд»), so the class is read from the beginning of the word.
        const classOf = t => String(t || '').toLowerCase().replace(/[^а-яёa-z]/g, '');
        const fitsOne = t => {
            if (this.sameName(def.name, t)) return true;
            const w = classOf(t);
            if (!w) return false;
            if (/^(отряд|юнит)/.test(w)) return true;
            if (w.startsWith('наземн')) return def.type === 'ground';
            if (w.startsWith('корабл')) return def.type === 'ship';
            return false;
        };
        if (filter.types && filter.types.some(fitsOne)) return true;
        if (filter.contains) {
            const name = String(def.name || '').toLowerCase();
            if (filter.contains.some(c => name.includes(c))) return true;
        }
        return !filter.types && !filter.contains;
    },

    unitsOf(R, state, seat, combat, step) {
        let units;
        if (combat) {
            units = state.units.filter(u => u.seat === seat && u.system === combat.system && u.area === combat.pos);
        } else {
            units = state.units.filter(u => u.seat === seat);
        }
        if (step.routed) units = units.filter(u => u.routed);
        else units = units.filter(u => !u.routed);
        if (step.filter) units = units.filter(u => this.unitFits(R.unitOf(state, u), step.filter));
        // The unit named by the card: «возьмите К'тана» — the very unit.
        if (step.what) {
            const names = Array.isArray(step.what) ? step.what : [step.what];
            units = units.filter(u => {
                const def = R.unitOf(state, u);
                return !!def && names.some(n => this.sameName(def.name, n));
            });
        }
        // The scope of the ability: the active system, the systems next to it,
        // worlds only, voids only, ships only, ground only, a command level cap.
        if (step.ofSystem) units = units.filter(u => this.inScope(R, state, u.system, step.ofSystem));
        if (step.areaType) {
            units = units.filter(u => this.areaWorld(state, u.system, u.area) === (step.areaType === 'world'));
        }
        if (step.unitType) {
            units = units.filter(u => {
                const d = R.unitOf(state, u);
                return d && d.type === step.unitType;
            });
        }
        if (step.maxKl !== undefined) {
            units = units.filter(u => {
                const d = R.unitOf(state, u);
                return d && (d.kl || 0) <= step.maxKl;
            });
        }
        if (step.minKl !== undefined) {
            units = units.filter(u => {
                const d = R.unitOf(state, u);
                return d && (d.kl || 0) >= step.minKl;
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


    // «Получите ценные ресурсы и материалы этого мира» — the shared body of the
    // step: the materials, the tokens, and the question of the prosperity token.
    gainWorldAssetsBody(R, state, seat, step, area) {
        const p = state.players[seat];
        const sys = R.system(state, area.system);
        const a = R.area(sys, area.pos);
        if (!a || !a.world) return null;
        p.materiel = Math.min(R.MATERIEL_MAX, p.materiel + (a.world.materiel || 0));
        let prosperity = 0;
        for (const asset of a.world.assets || []) {
            if (asset === 'prosperity') { prosperity++; continue; }
            const limit = p.faction === 'тираниды' && asset === 'reinforcement' ? 4 : 3;
            if ((p.assets[asset] || 0) < limit) p.assets[asset] = (p.assets[asset] || 0) + 1;
        }
        R.log(state, seat, p.name + ' берёт ресурсы мира ' + a.world.name + '.');
        if (prosperity) {
            // «ценные ресурсы» включают процветание: игрок решает, на какой жетон он похож.
            step.prosperity = prosperity;
            return { question: { kind: 'assetType', who: seat, op: 'gainWorldAssets', n: prosperity, options: ['forge', 'cache', 'reinforcement'], text: 'Мир даёт жетон процветания. Какой жетон взять?' } };
        }
        return null;
    },

    // --- the printed areas of the faction abilities -------------------------
    // The tile keeps the areas of a system: worlds and voids. A world is a
    // world; anything else is a void.
    areaWorld(state, systemId, pos) {
        const sys = state.systems.find(x => x.id === systemId);
        const area = sys && sys.areas.find(a => a.pos === pos);
        return area ? !!area.world : false;
    },

    // Who stands in the area, from the point of view of one player: 'friendly'
    // (only this player), 'enemy' (only the opponent), 'contested' (both),
    // 'uncontrolled' (nobody). Control cannot say it: an area with the foe
    // alone and a neutral empty world are both 'none' to control().
    areaStanding(state, seat, systemId, pos) {
        const mine = state.units.some(u => u.seat === seat && u.system === systemId && u.area === pos)
            || state.structures.some(st => st.seat === seat && st.system === systemId && st.area === pos);
        const foe = state.units.some(u => u.seat !== seat && u.system === systemId && u.area === pos)
            || state.structures.some(st => st.seat !== seat && st.system === systemId && st.area === pos);
        if (mine && foe) return 'contested';
        if (mine) return 'friendly';
        if (foe) return 'enemy';
        return 'uncontrolled';
    },

    // Is the system in the scope of the ability: the active system itself or a
    // system next to it? No order in flight — everything is in scope.
    inScope(R, state, systemId, ofSystem) {
        const active = state.order ? state.order.system : null;
        if (!ofSystem || !active) return true;
        if (ofSystem === 'active') return systemId === active;
        if (ofSystem === 'adjacent') return R.neighbors(state, active).includes(systemId);
        return true;
    },

    // The worlds with at least one unrouted unit of the player — the source of
    // «забрать любое количество отрядов из одного мира».
    sourceWorlds(R, state, seat) {
        const seen = new Map();
        for (const u of state.units) {
            if (u.seat !== seat || u.routed) continue;
            if (!this.areaWorld(state, u.system, u.area)) continue;
            const key = u.system + '|' + u.area;
            if (!seen.has(key)) seen.set(key, { system: u.system, pos: u.area });
        }
        return [...seen.values()];
    },

    // The destinations of the ability steps: the exact list of worlds and voids
    // printed on the faction sheet.
    areasForAbility(R, state, seat, dest) {
        const active = state.order ? state.order.system : null;
        const neighbors = active ? R.neighbors(state, active) : [];
        const out = [];
        for (const sys of state.systems) {
            for (const area of sys.areas) {
                const world = !!area.world;
                const standing = this.areaStanding(state, seat, sys.id, area.pos);
                const mine = R.control(state, seat, sys.id, area.pos) === 'friendly';
                let ok = false;
                switch (dest) {
                    // Any friendly world, any system («в любой дружественный мир»).
                    case 'friendlyWorldsAny':
                        ok = world && mine;
                        break;
                    // A friendly world of the active system («в активной системе»).
                    case 'friendlyWorldActive':
                        ok = world && sys.id === active && mine;
                        break;
                    // A friendly world of the active system with a structure on it.
                    case 'friendlyWorldWithStructureActive':
                        ok = world && sys.id === active && mine
                            && R.structuresAt(state, sys.id, area.pos).length > 0;
                        break;
                    // A friendly world with a factory on it, any system
                    // («в одном дружественном мире, содержащем фабрику»).
                    case 'friendlyWorldWithFactory':
                        ok = world && mine && R.structuresAt(state, sys.id, area.pos)
                            .some(st => st.seat === seat && st.type === 'factory');
                        break;
                    // A friendly world with a structure on it, any system
                    // («разместить его в дружественном мире, содержащем постройку»).
                    case 'friendlyWorldWithStructure':
                        ok = world && mine && R.structuresAt(state, sys.id, area.pos).length > 0;
                        break;
                    // A world of the active system where an unrouted Monolith stands
                    // («Врата вечности»).
                    case 'monolithWorldActive': {
                        if (!world || sys.id !== active) break;
                        const monolith = state.units.some(u => {
                            if (u.seat !== seat || u.routed) return false;
                            if (u.system !== sys.id || u.area !== area.pos) return false;
                            const def = R.unitOf(state, u);
                            return !!def && /монолит/i.test(def.name);
                        });
                        ok = monolith;
                        break;
                    }
                    // A friendly void of the active system.
                    case 'combatWorld': {
                        const combat = state.combat;
                        ok = world && combat && sys.id === combat.system && area.pos === combat.pos;
                        break;
                    }
                    case 'friendlyVoidActive':
                        ok = !world && sys.id === active && mine;
                        break;
                    // A friendly or uncontrolled world of a neighbouring system.
                    case 'friendlyOrUncontrolledWorldAdjacent':
                        ok = world && neighbors.includes(sys.id)
                            && (standing === 'friendly' || standing === 'uncontrolled');
                        break;
                    // A neutral or friendly world of this or a neighbouring system.
                    case 'worldActiveOrAdjacentNeutralOrFriendly':
                        ok = world && (sys.id === active || neighbors.includes(sys.id))
                            && (standing === 'friendly' || standing === 'uncontrolled');
                        break;
                    default:
                        // The destination of an ordinary move: a friendly world of
                        // the active system.
                        ok = world && sys.id === active && mine;
                }
                if (ok) out.push({ system: sys.id, pos: area.pos });
            }
        }
        return out;
    },

    // «When a combat card ability presents a choice, the owner of the combat
    // card makes all decisions presented unless otherwise specified» — the
    // units of the opponent are picked by the owner of the card, unless the
    // text hands the choice to the opponent («ваш противник выбирает»).
    askerOf(step, target, seat) {
        if (target === seat) return seat;
        if (step.chooser === 'foe') return target;
        if (step.chooser === 'me') return seat;
        const text = String(step.ability || step.text || '');
        if (/противник[а-яёa-z]*\s+(?:должен\s+|обязан[а-яёa-z]*\s+)?(?:выбирает|выберет|выбрать|деморализует|деморализовать|уничтожает|уничтожить|выполняет|теряет|потеряет|потерял|отступает|отступить|сбрасывает|сбросить|решает|решить)/i.test(text)) {
            return target;
        }
        // «ваш противник выбирает и деморализует 1 свой отряд» — the foe chooses
        // among his own units.
        if (/противник[а-яёa-z]*\s+(?:должен\s+)?выбрать\s+и\s+деморализовать/i.test(text)) return target;
        return seat;
    },

    // The units a teleport may take («Предвидение криптека»): any unit of the
    // player, or — for the second variant — a unit of a world with a structure
    // and no higher than the printed command level.
    teleportSources(R, state, seat, step) {
        let units = state.units.filter(u => u.seat === seat && !u.routed);
        if (step.from === 'structureWorld') {
            units = units.filter(u => {
                const sys = R.system(state, u.system);
                const area = R.area(sys, u.area);
                if (!area || !area.world) return false;
                return R.structuresAt(state, u.system, u.area).length > 0;
            });
        }
        if (step.unitType) {
            units = units.filter(u => {
                const def = R.unitOf(state, u);
                return def && def.type === step.unitType;
            });
        }
        if (step.maxKl !== undefined) {
            units = units.filter(u => {
                const def = R.unitOf(state, u);
                return def && (def.kl || 0) <= step.maxKl;
            });
        }
        return units;
    },

    // Where the teleported unit may appear: a friendly world with a structure
    // («разместить его в дружественном мире, содержащем постройку») or the
    // contested area of the combat («поместить его в этот мир»).
    teleportTargets(R, state, seat, step) {
        if (step.to === 'combatWorld') return this.areasForAbility(R, state, seat, 'combatWorld');
        return this.areasForAbility(R, state, seat, 'friendlyWorldWithStructure');
    },

    // The worlds a bastion of «Миры-гробницы» may stand on: a friendly or a
    // neutral world of the active system or of a system next to it, without a
    // structure («A player cannot build a structure on a world that already
    // contains a structure»).
    bastionAreasNearby(R, state, seat) {
        const active = state.order ? state.order.system : null;
        if (!active) return [];
        const systems = [active].concat(R.neighbors(state, active));
        const out = [];
        for (const sys of state.systems) {
            if (!systems.includes(sys.id)) continue;
            for (const area of sys.areas) {
                if (!area.world) continue;
                if (R.structuresAt(state, sys.id, area.pos).length) continue;
                const standing = this.areaStanding(state, seat, sys.id, area.pos);
                if (standing !== 'friendly' && standing !== 'uncontrolled') continue;
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
        // The end of the reinforce step of the combat.
        if (/конц[а-яёa-z]*\s+шага\s+призыва\s+подкреплений/.test(s)) return 'reinforce-end';
        // The damage of the combat.
        if (/шаг[а-яёa-z]*\s+нанесения (?:урон|поврежд)/.test(s)) return 'damage';
        if (/становится деморализован/.test(s)) return 'damage';
        if (/деморализован или уничтожен|уничтожен или деморализован/.test(s)) return 'damage';
        if (/получа[а-яёa-z]*\s+урон/.test(s)) return 'damage';
        // The rounds and the combats.
        if (/начал[а-яёa-z]*\s+раунда (?:боя|битвы)/.test(s)) return 'round';
        if (/начал[а-яёa-z]*\s+(?:боя|битвы)/.test(s)) return 'combat-start';
        if (/начн[а-яёa-z]*\s+(?:бо[йя]|битв)/.test(s)) return 'combat-start';
        if (/конц[а-яёa-z]*\s+(?:боя|битвы)/.test(s)) return 'combat-end';
        if (/орбитальн[а-яёa-z]*\s+удар/.test(s)) return 'strike';
        // The phases of the round.
        if (/конц[а-яёa-z]*\s+фазы планирования/.test(s)) return 'planning-end';
        if (/фаз[а-яёa-z]*\s+планирования/.test(s)) return 'planning';
        if (/фаз[а-яёa-z]*\s+действи/.test(s)) return 'operations';
        if (/перемеща[а-яёa-z]*\s+варп-шторм/.test(s)) return 'storm';
        if (/покупк[а-яёa-z]*\s+отряда/.test(s)) return 'buy-unit';
        if (/выполнени[а-яёa-z]*\s+(?:любого\s+)?приказа/.test(s)) return 'order';
        if (/активаци[а-яёa-z]*\s+(?:любого\s+)?вашего приказа/.test(s)) return 'order';
        if (/вынужден[а-яёa-z]*\s+пропустить ход/.test(s)) return 'skip';
        if (/(?:игра[а-яёa-z]*|разыгра[а-яёa-z]*)\s+боевую карту/.test(s)) return 'combat-play';
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
        const resolveOne = (seg) => {
            const text = String(seg || '').toLowerCase();
            const words = text.split(/[^а-яёa-z']+/).filter(Boolean);
            const last = words.length ? words[words.length - 1] : text;
            const names = [];
            for (const u of faction.units) {
                if (this.sameName(u.name, text) || this.sameName(u.name, last)) names.push(u.name);
            }
            return names;
        };
        const base = resolveOne(what);
        // «Карнифекс или Корабль-Улей» — each part names a unit: the union.
        if (!/или|либо/i.test(String(what))) return base;
        const seen = new Set(base);
        const out = [...base];
        for (const piece of String(what).split(/\s+или\s+|\s+либо\s+/i)) {
            for (const u of resolveOne(piece)) if (!seen.has(u)) { seen.add(u); out.push(u); }
        }
        return out;
    },

    // The names of the units are written in different cases: "Гвардейца" and
    // "Гвардейцы" are the same unit.
    sameName(a, b) {
        const clean = t => String(t || '').toLowerCase().replace(/['\u2019]/g, '').replace(/[^а-яёa-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
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
        if (sx.slice(0, n) === sy.slice(0, n)) return true;
        // The short names: "Ктан" and "К'тана" are the same unit.
        const n3 = Math.min(3, sx.length, sy.length);
        return sx.slice(0, n3) === sy.slice(0, n3);
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
/** @type {{re: RegExp, build: (m: RegExpExecArray, ctx: any, s: string) => any, noWhen?: boolean}[]} */
const RULES = [
    // "Place this card in your play area and discard all your other schemes."
    {
        re: /размест[а-яёa-z]*\s+эту карту в (?:своей|вашей) игровой зоне/i,
        build: () => ({ op: 'scheme' }),
    },
    // «Затем разыграйте ограниченное Развертывание …, Продвижение … или
    // Доминирование …» («Департаменто муниторум»).
    {
        re: /разыграйте ограниченн[а-яё]*\s+(?:Развертывание|развертывание)/i,
        build: (m, ctx, s) => [{
            op: 'choice', text: s,
            options: [
                { op: 'limitedOrder', kind: 'deploy', text: 'Развертывание (в 1 области)' },
                { op: 'limitedOrder', kind: 'advance', text: 'Продвижение (перемещение из 1 области)' },
                { op: 'limitedOrder', kind: 'dominate', text: 'Доминирование (сбор активов из 1 мира)' },
            ],
        }],
    },
    // «…сыграть любую карту из своей боевой колоды или колоды улучшений, кроме
    // карты, которая уже была разыграна» («Тактический гений»).
    {
        re: /сыграть любую карту из (?:своей )?боевой колоды/i,
        build: (m, ctx, s) => [{ op: 'playAnyCard', text: s }],
    },
    // "You may discard this card <when>, to <the effect>." — the scheme waits
    // for its moment.
    {
        re: /сбросить эту карту[\s\S]*$/i,
        build: (m, ctx, s) => {
            const trigger = FS_EFFECTS.triggerOf(s);
            // The effect of the card: the part after "to".
            const at = s.search(/сбросить эту карту/i);
            let tail = s.slice(at + 'сбросить эту карту'.length);
            const by = tail.search(/чтобы\s+/i);
            if (by >= 0) {
                tail = tail.slice(by + 'чтобы'.length);
            } else {
                // «…сбросить эту карту и деморализовать до 2 ваших отрядов» — the
                // effect is joined to the card by «и», not by «чтобы».
                tail = tail.replace(/^[\s,]*и\s+/i, '').replace(/^[\s,]+/, '');
                if (!/[а-яёa-z]{3}/i.test(tail)) tail = '';
            }
            const steps = tail ? FS_EFFECTS.parse(tail.replace(/^[\s,]+/, ''), ctx || {}) : [];
            // «Когда 1 из ваших отрядов … деморализован или уничтожен, вы можете
            // сбросить эту карту» — a reaction of the combat: the card is not
            // offered before the damage, only when the unit falls.
            const reaction = /^\s*когда\s+1\s+из\s+ваших\s+отрядов/i.test(s)
                && /деморализован\s+или\s+уничтожен/i.test(s);
            // «… в конце первого шага нанесения повреждений …» («Ракета Death
            // Strike»): the effect of the card waits for that moment of the fight,
            // not for the moment the card is discarded.
            const late = /в конце первого шага нанесения (?:повреждений|урона)/i.test(s);
            const body = late && steps.length ? [{ op: 'deferDamage', steps }] : steps;
            return { op: 'trigger', trigger, steps: body, text: s, note: !body.length, defer: reaction };
        },
    },
    // "the opponent loses 1 die of their choice"
    {
        re: /(?:противник[а-яёa-z]*|он(?![а-яёa-z]))[^.`]{0,40}?теря[а-яёa-z]*\s+(\d+)?\s*кубик/i,
        build: m => ({ op: 'loseDie', n: num(m[1]), kind: 'any', pick: true }),
    },
    // "the opponent must reroll 1 cube for every unrouted X" — the count is per unit.
    // «…за каждый ваш недеморализованный отряд с разным командным уровнем» — the
    // sentence may end right after the words, so a full stop is allowed.
    {
        re: /противник[а-яёa-z]*\s+(?:обязана?|вынужден[а-яёa-z]*)\s*перебросить\s+(\d+)?\s*`([^`]+)`[^.;]{0,140}?за кажд[а-яёa-z]+[^.;]{0,140}?(?:ваш[а-яёa-z]*\s+)?недеморализованн[а-яёa-z]*\s+([^.;:]{2,90}?)(?:\.?\s*$|\s+в\s+этом\s+бою|\s+в\s+этой\s+области)/i,
        build: m => {
            const kind = FS_EFFECTS.icon(m[2]);
            if (!['att', 'def', 'morale', 'any'].includes(kind)) return null;
            const filter = unitFilter(m[3]) || typeFilter(m[3]);
            const distinctLevel = /разн[а-яёa-z]*\s+(?:командн[а-яёa-z]*\s+)?уровн/i.test(m[0]);
            return { op: 'rerollDie', n: num(m[1]), kind, who: 'foe', pick: true,
                     per: 'unit', inBattle: true, distinctLevel, filter, text: m[0] };
        },
    },
    // «Вы обязаны перебросить 2 `def. cube` и/или `morale cube`» — the dice of
    // any of the named kinds: one question, the two kinds together.
    {
        re: /переброс[а-яёa-z]*\s+(?:до\s+)?(\d+|два|две|одно|один)?\s*(?:своих\s+|ваших\s+)?`([^`]+)`\s*(?:и\/или|или|либо|и)\s*`([^`]+)`/i,
        build: m => {
            if (FS_EFFECTS.iconKind(m[2]) !== 'cube' || FS_EFFECTS.iconKind(m[3]) !== 'cube') return null;
            const k1 = FS_EFFECTS.icon(m[2]);
            const k2 = FS_EFFECTS.icon(m[3]);
            const kinds = k1 === k2 ? [k1] : [k1, k2];
            return { op: 'rerollDie', n: num(m[1]), kinds, kind: kinds[0], all: false, pick: true };
        },
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
    // "reroll up to 2 of your dice" / "reroll 1 of your dice"
    {
        re: /переброс[а-яёa-z]*\s+(?:до\s+)?(всех|все|(\d+))?\s*(?:ваш[а-яёa-z]*|свои|своих)\s+куб[а-яёa-z]*/i,
        build: m => ({ op: 'rerollDie', n: /все/.test(m[1] || '') ? 99 : num(m[2]), kind: 'any', all: /все/.test(m[1] || ''), pick: true }),
    },
    // "reroll all the dice of one value"
    {
        re: /переброс[а-яёa-z]*\s+все[а-яёa-z]*\s+(?:ваш[а-яёa-z]*|свои)\s+кубик[а-яёa-z]*\s+одного(?:\s+конкретного)?\s+(?:значения|типа)/i,
        build: () => ({ op: 'rerollValue' }),
    },
    // "for every unrouted warrior or cruiser flip 1 of your dice to any side"
    // — the flip is counted per unit («Триархи преторианцы»).
    {
        re: /за кажд[а-яёa-z]*\s+(?:ваш[а-яёa-z]*\s+|недеморализованн[а-яёa-z]*\s+)*недеморализованн[а-яёa-z]*\s+([^.;:]{2,80}?)\s+переверн[а-яёa-z]*\s+(?:до\s+)?(\d+)?\s*(?:ваш[а-яёa-z]*|из своих|свои)\s+(?:`([^`]+)`\s*)?кубик[а-яёa-z]*\s+на любую сторону/i,
        build: m => ({
            op: 'setDie', n: num(m[2]), kind: 'any', pick: true,
            per: 'unit', inBattle: true,
            filter: unitFilter(m[1]) || typeFilter(m[1]),
        }),
    },
    // "flip 1 of your dice to any side"
    {
        re: /переверн[а-яёa-z]*\s+(?:до\s+)?(\d+)?\s*(?:ваш[а-яёa-z]*|из своих|свои)\s+(?:`([^`]+)`\s*)?кубик[а-яёa-z]*\s+на любую сторону/i,
        build: m => ({ op: 'setDie', n: num(m[1]), kind: 'any', pick: true }),
    },
    // "flip up to 2 of your `att. cube` to `def. cube`"
    {
        re: /(?:переверн[а-яёa-z]*|сконвертиру[а-яёa-z]*|конвертиру[а-яёa-z]*)\s+(?:до\s+)?(всех|все|любые|(\d+))?\s*(?:ваш[а-яёa-z]*|из ваших|из своих|своих|свои)?\s*(?:`([^`]+)`\s*)?(?:куб[а-яёa-z]*\s*)?(?:на|в)\s*`([^`]+)`/i,
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
    // «Потратьте 1 `morale cube`, чтобы взять 1 ваш отряд и разместить его в
    // дружественном мире, содержащем постройку, либо взять 1 из ваших отрядов с
    // командным уровнем 0 или 1 из мира, содержащего постройку, и поместить его
    // в этот мир» («Предвидение криптека»).
    {
        re: /потрат[а-яёa-z]*\s+(?:1|один)?\s*`morale cube`\s*,?\s*чтобы\s+взять 1 ваш отряд и разместить его в дружественном мире, содержащем постройку,\s*либо взять 1 из ваших отрядов с командным уровнем (\d+)(?:\s+или\s+(\d+))? из мира, содержащего постройку, и поместить его в этот мир/i,
        build: m => ([
            { op: 'spendDie', n: 1, kind: 'morale', pick: true, who: 'me' },
            { op: 'choice', text: 'Взять 1 ваш отряд и разместить его в дружественном мире с постройкой — или взять отряд из мира с постройкой и поместить его в этот мир?',
              options: [
                  { op: 'teleport', pick: true, from: 'any', to: 'structureWorld', unitType: 'ground',
                    ability: 'взять 1 ваш отряд и разместить его в дружественном мире, содержащем постройку' },
                  { op: 'teleport', pick: true, from: 'structureWorld', to: 'combatWorld', unitType: 'ground',
                    maxKl: m[3] ? Number(m[3]) : Number(m[2]),
                    ability: 'взять 1 из ваших отрядов с командным уровнем 0 или 1 из мира, содержащего постройку, и поместить его в этот мир' },
              ] },
        ]),
    },
    // "you must spend 1 `def. cube`" / "spend up to 3 `morale cube`" /
    // "Потратьте 1 `def. cube` или 1 `morale cube`" — either cube answers the
    // card: ONE spend of ONE die of ANY of the kinds listed, never a pair of
    // sequential demands.
    {
        re: /потрат[а-яёa-z]*\s+(?:(?:либо|или)\s+)?(?:любое количество\s+)?(?:до\s+)?(всех|(\d+))?\s*(?:ваш[а-яёa-z]*|своих|свои)?\s*`([^`]+)`([^;]{0,40})/i,
        build: (m, ctx, s) => {
            // The «тратится всё перечисленное» half of the sentence ends at
            // «чтобы» — the gain half is not part of the payment.
            const src = String(s || m[0]).split(/\s+чтобы\s+/i)[0];
            const spots = [];
            const re2 = /`([^`]+)`/g;
            let mm;
            while ((mm = re2.exec(src))) {
                if (FS_EFFECTS.iconKind(mm[1]) !== 'cube') continue;
                spots.push({ end: mm.index + mm[0].length, start: mm.index, kind: FS_EFFECTS.icon(mm[1]) });
            }
            const all = /все|любое количество/i.test(m[0] || '');
            const n = all ? 99 : num(m[2]);
            const union = spots.length > 1
                && spots.every((q, i) => i === 0 || /или|либо/i.test(src.slice(spots[i - 1].end, q.start)));
            if (union) {
                const kinds = spots.map(q => q.kind);
                return [{ op: 'spendDie', n, kind: kinds[0], kinds, all, pick: true, who: 'me' }]
                    .concat(/** @type {any[]} */ (gainStep(s)))
                    .concat(/** @type {any[]} */ (foeLoseSteps(s)));
            }
            const steps = spots.map(q => ({ op: 'spendDie', n, kind: q.kind, all, pick: true, who: 'me' }));
            if (!steps.length) return null;
            // The «…чтобы получить 2 `att. token`» half of the same sentence is
            // its own step: the tokens a payment buys are given to the payer.
            return steps.concat(/** @type {any[]} */ (gainStep(s)))
                .concat(/** @type {any[]} */ (foeLoseSteps(s)));
        },
    },
    {
        re: /(?:противник[а-яёa-z]*|вражеск[а-яёa-z]*|он(?![а-яёa-z]))[^.`]{0,40}?(?:теряет|терять|потеряет|потерять|теряют|потеряют|потерял|потеряли)\s+([^;]{0,80})/i,
        // The «Ваш противник потерял …» half of a payment is resolved by the
        // spend rule itself (foeLoseSteps): this rule serves sentences without
        // «потратьте».
        build: (m, ctx, sentence) => {
            const steps = foeLoseSteps(sentence);
            return steps.length ? steps : null;
        },
    },
    // "spend any number of dice" / "spend up to 2 dice"
    {
        re: /потрат[а-яёa-z]*\s+(?:любое количество|до\s+(\d+))?\s*кубик/i,
        build: m => ({ op: 'spendDie', n: m[1] ? num(m[1]) : 99, kind: 'any', all: !m[1], pick: true }),
    },
    // "the opponent must reroll 1 die of your choice"
    {
        re: /(?:противник[а-яёa-z]*|он(?![а-яёa-z]))\s*[^.`]{0,40}?(?:переброс[а-яёa-z]*|перебрас[а-яёa-z]*)\s+(\d+)?\s*(?:своих\s+)?куб[а-яёa-z]*/i,
        build: m => ({ op: 'rerollDie', n: num(m[1]), kind: 'any', who: 'foe', pick: true }),
    },
    // "for every unrouted Sister Repentia in the reinforce step"
    {
        re: /получите (\d+) `([^`]+)` за каждую недеморализованную ([^.]{3,60}?) в шаге/i,
        build: m => ({
            op: 'gainDie', n: Number(m[1]), kind: FS_EFFECTS.icon(m[2]),
            per: 'unit', inBattle: true, filter: unitFilter(m[3]), text: m[0],
        }),
    },
    // "за каждый ваш недеморализованный отряд … получите 1 att. token либо 1 def. token"
    {
        re: /^за кажд[а-яёa-z]*\s+(?:ваш[а-яёa-z]*\s+)?недеморализованн[а-яёa-z]*\s+([^.;:]{2,80}?)получ[а-яёa-z]*\s+(\d+)?\s*`([^`]+)`\s+(?:либо|или)\s+(\d+)?\s*`([^`]+)`(?:[^.;]*?максимум\s+(\d+))?/i,
        build: (m, ctx, s) => {
            const k1 = FS_EFFECTS.iconKind(m[3]), k2 = FS_EFFECTS.iconKind(m[5]);
            if (k1 !== 'token' || k2 !== 'token') return null;
            const filter = unitFilter(m[1]) || typeFilter(m[1]);
            const n = num(m[2]);
            const max = m[6] ? Number(m[6]) : null;
            const t = { op: 'gainToken', per: 'unit', filter, max, who: 'me' };
            return {
                op: 'choice', text: s || m[0],
                options: [Object.assign({ n, kind: FS_EFFECTS.icon(m[3]) }, t),
                          Object.assign({ n: num(m[4]), kind: FS_EFFECTS.icon(m[5]) }, t)],
            };
        },
    },
    // "за каждый ваш недеморализованный отряд … получите N icon"
    {
        re: /^за кажд[а-яёa-z]*\s+(?:ваш[а-яёa-z]*\s+)?недеморализованн[а-яёa-z]*\s+([^.;:]{2,80}?)получ[а-яёa-z]*\s+(\d+)?\s*`([^`]+)`(?:[^.;]*?максимум\s+(\d+))?/i,
        build: m => {
            const kind = FS_EFFECTS.iconKind(m[3]);
            if (kind !== 'token' && kind !== 'cube') return null;
            const filter = unitFilter(m[1]) || typeFilter(m[1]);
            return { op: kind === 'token' ? 'gainToken' : 'gainDie', n: num(m[2]), kind: FS_EFFECTS.icon(m[3]), per: 'unit', filter, max: m[4] ? Number(m[4]) : null, text: m[0] };
        },
    },
    // "get 1 `att. token` for every unrouted Guardsman or Cruiser, maximum 3"
    {
        re: /(?:получ[а-яёa-z]*|взять|возьм[а-яёa-z]*|достаньте)\s+(\d+)?\s*`([^`]+)`[^.`]{0,90}?за кажд[а-яёa-z]+\s+(?:ваш[а-яёa-z]*\s+)?недеморализованн[а-яёa-z]*\s+([^,.]{2,70}?)(?:,\s*максимум\s+(\d+))?\s*[.!]?\s*$/i,
        build: m => {
            const kind = FS_EFFECTS.iconKind(m[2]);
            if (kind !== 'token' && kind !== 'cube') return null;
            const filter = unitFilter(m[3]) || typeFilter(m[3]);
            return {
                op: kind === 'token' ? 'gainToken' : 'gainDie',
                n: num(m[1]), kind: FS_EFFECTS.icon(m[2]), per: 'unit',
                filter, max: m[4] ? Number(m[4]) : null, text: m[0],
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
    // «Строй быстрее!» (орки): «Вы можете купить постройку до того, как будете
    // покупать отряды». Приказ развёртывания из-за этой карты меняет порядок шагов.
    {
        re: /купить постройку до того, как будете покупать отряды/i,
        build: (m, ctx, s) => ({ op: 'structureFirst', text: s }),
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
    // "demoralise any number of your ships — for each flip up to 2 dice":
    // the choice of the ships and the flips is the player's, the engine only
    // counts the budget, so the card is played by hand (see 09-rules-audit.md).
    {
        re: /деморализовать любое количество кораблей, участвующих в этом орбитальном ударе/i,
        build: (m, ctx, s) => ({ op: 'note', text: s, manual: 'священное-пламя' }),
    },
    {
        re: /^за каждый деморализованный корабль переверните до 2 ваших/i,
        build: (m, ctx, s) => ({ op: 'note', text: s, manual: 'священное-пламя' }),
    },
    // «ваш противник уничтожит 1 жетон подкрепления в этой области за каждый
    // отряд, который вы деморализовали» («Гибельные косы»): the tokens of the
    // foe that stand in this battle are destroyed, one per routed unit.
    {
        re: /уничтожит (\d+)?\s*жетон[а-яёa-z]*\s+подкрепления[^.]*?за каждый отряд, который вы деморализовали/i,
        build: m => ({ op: 'loseReinforcement', n: num(m[1]), who: 'foe', per: 'routed' }),
    },
    // «Уничтожьте 1 отряд противника с командным уровнем 0 или 1 в этом мире»
    // («Ракета Death Strike»): the level is the filter of the target.
    {
        noWhen: true,
        re: /уничтож[а-яёa-z]*\s+(?:до\s+)?(?:(\d+)\s+)?(?:одного|одну|1)?\s*(?:юнит[а-яёa-z]*|отряд[а-яёa-z]*)\s+(?:противник[а-яёa-z]*|вражеск[а-яёa-z]*)\s+с командным уровнем\s+(\d+)(?:\s+или\s+(\d+))?/i,
        build: m => {
            const a = Number(m[2]);
            const b = m[3] !== undefined ? Number(m[3]) : a;
            return { op: 'destroy', n: num(m[1]), pick: true, who: 'foe',
                     maxKl: Math.max(a, b), minKl: Math.min(a, b) };
        },
    },
    // "destroy 1 routed unit of the opponent" (the word order of the
    // attacked card: «уничтожьте 1 деморализованный отряд противника»)
    {
        re: /уничтож[а-яёa-z]*\s+(?:(\d+)\s*)?(?:деморализованн[а-яёa-z]*\s+)?(?:отряд[а-яёa-z]*|юнит[а-яёa-z]*)\s*противник[а-яёa-z]*/i,
        build: m => ({ op: 'destroy', n: num(m[1]), pick: true, who: 'foe' }),
    },
    // "the opponent chooses and destroys 1 of his routed units"
    // The routed state and the command level are the filter of the card:
    // «1 свой деморализованный отряд с командным уровнем 0 или 1».
    {
        re: /(?:противник[а-яёa-z]*|он(?![а-яёa-z]))[^.`]{0,50}?уничтож[а-яёa-z]*\s+(?:(\d+)\s+)?(?:свой[а-яёa-z]*\s+)?(деморализованн[а-яёa-z]*\s+)?(?:отряд[а-яёa-z]*|юнит[а-яёa-z]*)(?:\s+с командным уровнем\s+(\d+)(?:\s+или\s+(\d+))?)?/i,
        build: m => {
            const step = { op: 'destroy', n: num(m[1]), pick: true, who: 'foe' };
            if (m[2]) step.routed = true;
            if (m[3] !== undefined) step.maxKl = Math.max(Number(m[3]), m[4] !== undefined ? Number(m[4]) : 0);
            return step;
        },
    },
    // «Восстановите …» — the restoring ability comes first: the words
    // «деморализованный отряд» inside it must not fire the route rules.
    // «восстановите всех ваших юнитов в активной системе и всю пехоту во всех
    // других системах» («Протоколы реанимации»): the scope is the system of the
    // order for every unit, and only the ground units elsewhere.
    {
        re: /восстанов[а-яёa-z]*\s+всех?\s+ваш[а-яёa-z]*\s+(?:юнит[а-яёa-z]*|отряд[а-яёa-z]*)\s+в активной системе\s+и\s+всю\s+пехот[а-яёa-z]*/i,
        build: () => ({ op: 'restore', n: 99, all: true, pick: true, scope: 'activeAllOthersGround' }),
    },
    // "restore 1 of your routed units" / "restore all your units"
    {
        re: /восстанов[а-яёa-z]*\s+(всех?\s*)?(?:(\d+|оди?[а-яёa-z]*н[а-яёa-z]*|одной?)\s+)?(?:ваш[а-яёa-z]*|сво[а-яёa-z]*)?\s*(?:деморализованн[а-яёa-z]*\s+)?(?:отряд[а-яёa-z]*|юнит[а-яёa-z]*|пехот[а-яёa-z]*)/i,
        build: m => ({ op: 'restore', n: m[2] ? num(m[2]) : 1, all: !!m[1], pick: true }),
    },
    // "деморализуйте 1 отряд с командным уровнем N в этом мире" — the card
    // ведёт бой в этом мире: целью является отряд противника уровня N.
    {
        noWhen: true,
        re: /деморализ[а-яёa-z]*\s+(?:(\d+)\s+)?(?:отряд[а-яёa-z]*|юнит[а-яёa-z]*)\s+с командным уровнем\s+(\d+)(?:\s+или\s+(\d+))?\s+в этом мире/i,
        build: m => {
            // «с командным уровнем 2» — the very level; «0 или 1» — a range.
            const a = Number(m[2]);
            const b = m[3] !== undefined ? Number(m[3]) : a;
            return { op: 'route', n: num(m[1]), pick: true, who: 'foe',
                     maxKl: Math.max(a, b), minKl: Math.min(a, b), kl: a };
        },
    },
    // "the opponent must choose and route 1 of his units"
    {
        noWhen: true,
        re: /(?:противник[а-яёa-z]*|он(?![а-яёa-z]))[^.`]{0,40}?(?<!не)деморализ(?!ованн)[а-яёa-z]*\s+(?:и\s+)?(?:(\d+)\s*)?(?:свой|ваш|одного|одну|1)?\s*(?:отряд[а-яёa-z]*|юнит[а-яёa-z]*)?/i,
        build: m => ({ op: 'route', n: num(m[1]), pick: true, who: 'foe' }),
    },
    // "you must route 1 of your units" / "demoralise 1 enemy unit"
    // «деморализовать один вражеский отряд с командным уровнем 0 или 1»
    // («Смертоукасатели»): the foe is named inside the sentence and the level
    // is a limit, not an exact value.
    {
        noWhen: true,
        re: /(?<!не)деморализ(?!ованн)[а-яёa-z]*\s+(?:до\s+)?(?:([\d]+)\s*)?(?:одного|одну|один|1)?\s*(?:ваш[а-яёa-z]*|сво[а-яёa-z]*|вражеск[а-яёa-z]*|противник[а-яёa-z]*)?\s*(?:отряд[а-яёa-z]*|юнит[а-яёa-z]*)?(?:\s+с командным уровнем\s+(\d+)(?:\s+или\s+(\d+))?)?/i,
        build: (m, ctx, s) => {
            const foe = /вражеск|противник/i.test(m[0]);
            const kl = m[3] ? Number(m[3]) : null;
            const klMax = m[4] ? Number(m[4]) : kl;
            return {
                op: 'route', n: num(m[1]), pick: true,
                who: foe ? 'foe' : 'me',
                maxKl: klMax === null ? undefined : klMax,
                max: /до\s+/i.test(m[0]),
                // «в системе, содержащей хотя бы 1 из ваших отрядов, либо
                // находящийся в соседней с ней системе» («Отбрыски Темпестус»).
                nearMine: /в системе, содержащей хотя бы/i.test(String(s || '')),
            };
        },
    },
    // «Уничтожьте 1 юнита 0-го командного уровня» («Осколок несущего ночь»):
    // the card names no owner — the unit is any unit of the battle with the
    // level written, and the owner of the card chooses (the rules, «Combat Card
    // Resolution»: «the owner of the combat card makes all decisions»).
    {
        noWhen: true,
        re: /уничтож(?!енн)[а-яёa-z]*\s+(?:до\s+)?(?:(\d+)\s+)?(?:одного|одну|1)?\s*(?:юнит[а-яёa-z]*|отряд[а-яёa-z]*)\s+(\d+)-?го(?:\s+или\s+(\d+)-?го)?\s+командного уровня/i,
        build: m => ({ op: 'destroy', n: num(m[1]), pick: true, who: 'any', maxKl: Number(m[3] || m[2]) }),
    },
    // "destroy 1 of your unrouted units" / "destroy a cultist unit"
    {
        re: /уничтож(?!енн)[а-яёa-z]*\s+(?:(\d+)\s+)?(?:одного|одну|1|ваш[а-яёa-z]*\s+недеморализованн[а-яёa-z]*\s+(?:отряд[а-яёa-z]*|юнит[а-яёa-z]*)|отряд[а-яёa-z]*|юнит[а-яёa-z]*)/i,
        build: m => ({ op: 'destroy', n: m[1] ? num(m[1]) : 1, max: /до\s/.test(m[0]), pick: true }),
    },
    // «разместите К'тана в любом дружественном мире» («Осколок обманщика») — the
    // C'tan of the battle moves out of it, he is not placed anew.
    {
        re: /размест[а-яёa-z]*\s+К'?тана\s+в\s+любом\s+дружественном\s+мире/i,
        build: () => ({ op: 'moveUnit', n: 1, pick: true, what: 'Ктан', dest: 'friendlyWorldsAny' }),
    },
    // "place 1 free Guardsman in a friendly world" / "place 2 free reinforcement tokens"
    // «Разместите 2 бесплатных Гвардейца в одном дружественном мире, содержащем
    // фабрику» / «1 бесплатного Гвардейца в любом дружественном мире».
    {
        re: /размест[а-яёa-z]*\s+(\d+)\s+(?:бесплатн[а-яёa-z]+\s+)?([А-ЯЁ][а-яёa-z]+)\s+в\s+(одном\s+дружественном\s+мире,?\s+содержащем\s+фабрику|любом\s+дружественном\s+мире)/i,
        build: (m, ctx) => {
            const faction = FS_EFFECTS.factionOf(ctx);
            const names = FS_EFFECTS.unitNames(m[2], faction);
            if (!names.length) return null;
            return {
                op: 'placeFree', n: num(m[1]), what: names[0], free: true, who: 'me',
                dest: /фабрик/i.test(m[3]) ? 'friendlyWorldWithFactory' : 'friendlyWorldsAny',
            };
        },
    },
    {
        re: /(?:размест[а-яёa-z]*|помест[а-яёa-z]*)\s+(?:(\d+|оди?[а-яёa-z]*н[а-яёa-z]*)\s+)?(?:бесплатн[а-яёa-z]+\s+)?([^,.;]{2,60}?)(?:\s+в\s+|\s+на\s+|\.?\s*$)/i,
        build: (m, ctx, s) => {
            const what = (m[2] || '').trim();
            const n = num(m[1]) || 1;
            if (/подкреплен/.test(what)) {
                return { op: 'placeReinforcement', n, pick: true,
                         free: /бесплатн/.test(String(s || '') + ' ' + what),
                         // «в спорной области» — the area of the battle is fixed.
                         here: /в спорной области|в этой области боя/i.test(String(s || '')) };
            }
            if (/бастион/.test(what)) return { op: 'placeStructure', kind: 'bastion', n: 1, free: true, pick: true };
            if (/город/.test(what)) return { op: 'placeStructure', kind: 'city', n: 1, free: true, pick: true };
            if (/фабрик/.test(what)) return { op: 'placeStructure', kind: 'factory', n: 1, free: true, pick: true };
            const faction = FS_EFFECTS.factionOf(ctx);
            const names = FS_EFFECTS.unitNames(what, faction);
            if (names.length) {
                const step = { op: 'placeUnit', n, what: names[0], pick: true, free: true };
                if (/в этот мир|в этом мире|этого мира|эту область|эти области|спорную область|спорной области/i.test(s || '')) step.dest = 'combatWorld';
                return step;
            }
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
    // "buy 1 unit and place it in the world with this factory"
    {
        re: /можете купить одного юнита и разместить его в мире с этой фабрикой/i,
        build: (m, ctx) => {
            const faction = FS_EFFECTS.factionOf(ctx);
            const names = faction ? faction.units.map(u => u.name) : [];
            return { op: 'placeUnit', n: 1, what: names, pick: true, buy: true };
        },
    },
    // "buy 1 structure and place it"
    {
        re: /куп[а-яёa-z]*\s+(\d+)?\s*(?:одну\s+)?постройк[а-яёa-z]*/i,
        build: m => ({ op: 'placeStructure', kind: 'any', n: num(m[1]) || 1, buy: true, pick: true }),
    },
    // "replace 1 scout from the supply with a space marine"
    {
        re: /замени[а-яёa-z]*\s+(\d+)?\s*отряд[а-яёa-z]*\s+([^,.;]{2,40}?)\s+на\s+(\d+)?\s*отряд[а-яёa-z]*\s+([^,.;]{2,40}?)\s+из запаса/i,
        build: (m, ctx) => ({
            op: 'replaceUnit', n: num(m[1]), from: m[2], to: m[4],
            filter: unitFilter(m[2]), pick: true, text: m[0],
        }),
    },
    // "you may perform the deploy order using one factory"
    {
        re: /выполнить приказ развертывания, используя (\d+) фабрик/i,
        build: m => ({ op: 'extraFactory', n: Number(m[1]) }),
    },
    // "buy the units one materiel cheaper"
    {
        re: /по цене на (\d+) меньше обычного/i,
        build: m => ({ op: 'orderDiscount', n: Number(m[1]) }),
    },
    // "the number of the asset tokens you may have grows to 4"
    {
        re: /количество жетонов ресурсов[^.]*увеличивается до (\d+)/i,
        build: m => ({ op: 'assetLimit', n: Number(m[1]) }),
    },
    // "move 1 of your units to a neighbouring friendly area"
    {
        re: /перемест[а-яёa-z]*\s+(\d+)?\s*(?:одним из своих|одного|ваш[а-яёa-z]*|свои|любые)?\s*(?:отряд[а-яёa-z]*|юнит[а-яёa-z]*|отряда)/i,
        build: m => ({ op: 'moveUnit', n: num(m[1]) || 1, pick: true }),
    },
    // "take any number of your units from one world and place them in a friendly world"
    {
        re: /забра[а-яёa-z]*\s+(?:любое количество\s+)?(?:(\d+)\s+)?([^,.;]{2,50}?)\s+из\s+([^,.;]{2,70}?)\s+и\s+(?:размест|перемест)[а-яёa-z]*\s+(?:их|его|её)?/i,
        build: (m, ctx) => ({
            op: 'moveUnits', n: m[1] ? num(m[1]) : 99,
            filter: unitFilter(m[2]), pick: true, text: m[0],
        }),
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
    // «Если ваши отряды или бастионы не получат урона в конце этого раунда, ваш
    // противник выбирает и отступает одним из своих отрядов» («Фаланга
    // монолита»): the effect waits for the end of the round of combat.
    {
        re: /если ваши отряды или бастионы не получат урона в конце этого раунда/i,
        build: () => ({
            op: 'noDamageRetreat',
            steps: [{ op: 'retreat', n: 1, who: 'foe', pick: true,
                      ability: 'ваш противник выбирает и отступает одним из своих отрядов' }],
        }),
    },
    // "the opponent retreats with one of his units"
    {
        re: /(?:противник[а-яёa-z]*|он(?![а-яёa-z]))[^.`]{0,40}?отступ[а-яёa-z]*\s+(?:одним из своих|одного|1)?\s*(?:отряд[а-яёa-z]*|юнит[а-яёa-z]*)/i,
        build: () => ({ op: 'retreat', who: 'foe', pick: true }),
    },
    // «После выполнения этого приказа можете отступить любым числом Гвардейцев,
    // превышающим вместимость этого мира» («Адептус Астрономика»): the retreat of
    // the units over the capacity is not a step of the order — it happens after.
    {
        re: /можете отступить любым числом\s+([А-ЯЁ][а-яёa-z]+),?\s*превышающим вместимость/i,
        build: m => ({ op: 'retreatExcess', what: m[1] }),
    },
    // «… переместить в этот мир до 6 отрядов, если хотя бы один из этих отрядов —
    // Гвардеец» — the limit and the condition of the move together.
    {
        re: /перемест[а-яёa-z]*[^.]{0,60}?до\s+(\d+)\s+отряд[а-яёa-z]*,\s*если хотя бы один из этих отрядов\s*[-—]?\s*([А-ЯЁ][а-яёa-z]+)/i,
        build: m => [{ op: 'moveLimit', n: Number(m[1]) }, { op: 'mustInclude', what: m[2] }],
    },
    // "you may retreat with one of your units" / "retreat with one of your units"
    {
        re: /отступ[а-яёa-z]*\s+(?:одним из своих|одного|1|любым числом)?\s*(?:отряд[а-яёa-z]*|юнит[а-яёa-z]*|гвардеец[а-яёa-z]*)?/i,
        build: () => ({ op: 'retreat', who: 'me', pick: true }),
    },
    // "buy 1 combat upgrade" — the price may be lowered: «уменьшите его стоимость
    // на 1 за каждый дружественный мир, в котором есть фабрика».
    {
        re: /(?:куп[а-яёa-z]*|приобрет[а-яёa-z]*)\s+1\s+(?:боевое улучшение|улучшение)/i,
        build: (m, ctx, s) => {
            const step = { op: 'buyUpgrade', kind: /боевое/.test(m[0]) ? 'combat' : 'order', pick: true };
            const off = /уменьшите\s+(?:его\s+)?стоимость\s+на\s+(\d+)\s+за\s+каждый\s+([^.;]+)/i.exec(String(s || ''));
            if (off) {
                step.discount = /фабрик/i.test(off[2]) ? 'factories' : Number(off[1]) || 1;
            }
            return step;
        },
    },
    // «Этот отряд или бастион получает урон первым» («Бронетанковый клин»).
    {
        re: /получает урон первым/i,
        build: () => ({ op: 'damageFirst', who: 'foe' }),
    },
    // «… добавить 2 к общей сумме урона» орбитального удара («Точечный удар»).
    {
        re: /добавить\s+(\d+)\s+к\s+общей\s+сумме\s+урона/i,
        build: m => ({ op: 'strikeBonus', n: Number(m[1]) }),
    },
    // «Достаньте верхнюю карту из своей колоды и получите её боевые значения до
    // конца боя, не применяя текстовую способность» («Осколок обманщика»): the
    // card is the top of the deck — there is nothing to choose.
    {
        re: /достаньте верхнюю карту из своей колоды[^.]*?получите е[её] боевые значения/i,
        build: () => ({ op: 'playTopCard', values: true }),
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
    // "the opponent has to distribute 3 more damage"
    {
        re: /если ваш противник будет распределять какой-либо урон, то он должен распределить дополнительно (\d+) урона/i,
        build: m => ({ op: 'extraDamage', n: Number(m[1]), who: 'foe' }),
    },
    // "you and your opponent take 3 more damage"
    {
        re: /вы и ваш противник получ[а-яёa-z]*\s+(\d+)\s+дополнительн[а-яёa-z]*\s+урона/i,
        build: m => ({ op: 'extraDamage', n: Number(m[1]), who: 'both' }),
    },
    // "the health of all your units grows by 1 during this combat"
    {
        re: /значение здоровья всех ваших отрядов повышается на (\d+)/i,
        build: m => ({ op: 'healthBonus', n: Number(m[1]) }),
    },
    // "the health of the opponent's units drops to 3 this round"
    {
        re: /здоровье отрядов (?:вашего |ваших )?противника уменьша[а-яёa-z]* до (\d+)/i,
        build: m => ({ op: 'enemyHealth', n: Number(m[1]) }),
    },
    // "in this round ignore all the enemy's `att. cube`"
    {
        re: /игнорируйте все вражеские `att\. cube`/i,
        build: () => ({ op: 'ignoreFoeAtt' }),
    },
    // «взять из дружественного мира, в котором есть постройка, один ваш отряд с
    // командным уровнем 0 или 1 и поместить его в любой мир в активной системе,
    // где находится недеморализованный Монолит» («Врата вечности»).
    {
        re: /взять из дружественного мира[^.]*?один ваш отряд[^.]*?и поместить его/i,
        build: (m, ctx, s) => {
            const kl = /командным уровнем\s+(\d+)(?:\s+или\s+(\d+))?/i.exec(s || '');
            const step = {
                op: 'moveUnit', n: 1, pick: true,
                fromStructureWorld: true,
                unitType: 'ground',
            };
            if (kl) step.maxKl = kl[2] ? Number(kl[2]) : Number(kl[1]);
            if (/монолит/i.test(s || '')) step.dest = 'monolithWorldActive';
            return step;
        },
    },
    // "take 1 stormtrooper from any world and place it in this world"
    {
        re: /заберите (\d+) ([^,.;]{2,40}?) из любого мира и (?:размест|перемест)[а-яёa-z]*\s+его/i,
        build: (m, ctx) => ({
            op: 'moveUnit', n: num(m[1]), what: m[2],
            filter: unitFilter(m[2]), pick: true, text: m[0],
        }),
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
        build: m => ({ op: 'extraDamage', n: Number(m[1]), when: 'damage', who: 'foe' }),
    },
    // "once per round" — the limit of the upgrade.
    {
        re: /^\s*(?:\([^)]*\)\s*)?один раз за раунд\s*\.?\s*$/i,
        build: () => ({ op: 'once' }),
    },
    // "The battle lasts 1 round."
    {
        re: /(?:битва|бой)\s+длится\s+(\d+)\s+раунд/i,
        build: m => ({ op: 'combatLength', n: Number(m[1]) }),
    },
    {
        re: /разыграйте только\s+(?:ОДИН|один|1)\s+раунд/i,
        build: () => ({ op: 'combatLength', n: 1 }),
    },
    // "The capacity of the friendly worlds with a city grows by 2, up to 4."
    {
        re: /вместимость\s+дружественных миров[^.]*увелич[а-яёa-z]* на (\d+)(?:,\s*максимум до (\d+))?/i,
        build: m => ({ op: 'capacityBonus', n: Number(m[1]), max: m[2] ? Number(m[2]) : 0 }),
    },
    // "you may treat all the bastions as factories"
    {
        re: /считать все бастионы[^.]*фабриками/i,
        build: () => ({ op: 'bastionsAsFactories' }),
    },
    // "The cost in materiel is lowered by 1 for every cultist in this system."
    {
        re: /стоимость в материалах\s+(?:снижается|уменьшается) на (\d+)\s+за каждого культиста/i,
        build: m => ({ op: 'orderDiscount', n: Number(m[1]), per: 'cultist' }),
    },
    // The sentences the engine already follows: the player is asked the
    // question in the usual way.
    {
        re: /^(?:если вы атакуете,?\s+(?:то\s+)?)?(?:посмотрите выложенную лицом вниз|подсмотрите)\s+(?:в игровую зону )?боевую карту противника\.?$/i,
        build: (m, ctx, s) => ({ op: 'note', text: s }),
    },
    {
        re: /^(?:если вы — атакующий,?\s+)?подсмотрите карту оппонента\.?$/i,
        build: (m, ctx, s) => ({ op: 'note', text: s }),
    },
    {
        re: /^(?:выберите|выбери)\s+(?:1|один|один из)\s+(?:из\s+)?(?:отряд[а-яёa-z]*|бастион[а-яёa-z]*|отрядов или бастион[а-яёa-z]*)[^.]*противника[^.]*\.?$/i,
        build: (m, ctx, s) => ({ op: 'note', text: s }),
    },
    {
        re: /^во время шага нанесения повреждений вы назначаете урон отрядам и бастионам противника\.?$/i,
        build: (m, ctx, s) => ({ op: 'note', text: s }),
    },
    {
        re: /^урон, превышающий значение здоровья выбранного отряда или бастиона, теряется\.?$/i,
        build: () => ({ op: 'ignoreExcess' }),
    },
    {
        re: /^командный уровень этого отряда не может превышать числа отрядов культистов[^.]*\.?$/i,
        build: (m, ctx, s) => ({ op: 'note', text: s }),
    },
    {
        re: /^вы получаете боевые значки с этой карты[^.]*\.?$/i,
        build: (m, ctx, s) => ({ op: 'note', text: s }),
    },
    {
        re: /^в конце этого раунда, если вы обороняетесь[^.]*\.?$/i,
        build: (m, ctx, s) => ({ op: 'note', text: s }),
    },
    {
        re: /^получите количество `any cube`, равное значению боевой силы[^.]*\.?$/i,
        build: (m, ctx, s) => ({ op: 'note', text: s }),
    },
    {
        re: /^если вы атакуете,? то ваш противник не может разыграть общие способности[^.]*\.?$/i,
        build: (m, ctx, s) => ({ op: 'note', text: s }),
    },
    {
        re: /^в следующем раунде (?:боя|битвы) каждый раз, когда ваш противник должен выбрать боевую карту.*$/i,
        build: (m, ctx, s) => ({ op: 'note', text: s }),
    },
    {
        re: /^повторите основную способность карты[^.]*\.?$/i,
        build: (m, ctx, s) => ({ op: 'note', text: s }),
    },
    {
        re: /^если в этом раунде будет уничтожен ваш юнит.*$/i,
        build: (m, ctx, s) => ({ op: 'note', text: s }),
    },
    {
        re: /^вы можете удалить 1 `morale cube`.*$/i,
        build: (m, ctx, s) => ({ op: 'note', text: s }),
    },
    {
        re: /^перед тем как выполнить этот приказ[^.]*\.?$/i,
        build: (m, ctx, s) => ({ op: 'note', text: s }),
    },
    {
        re: /^если у вас больше `morale cube`, чем у противника, то бесплатно замените[^.]*\.?$/i,
        build: (m, ctx, s) => ({ op: 'note', text: s }),
    },
    {
        re: /^вы можете выбрать 1 отряд с командным уровнем 0 в этом мире\.?$/i,
        build: () => ({ op: 'strikeFirst', maxKl: 0 }),
    },
    {
        re: /^вы можете разместить их на дружественных и неконтролируемых пустотах[^.]*\.?$/i,
        build: (m, ctx, s) => ({ op: 'note', text: s }),
    },
    {
        re: /^дополнительная вместимость распространяется только на [^.]*\.?$/i,
        build: (m, ctx, s) => ({ op: 'note', text: s }),
    },
    {
        re: /^затем разыграйте ограниченное развертывание[^.]*\.?$/i,
        build: (m, ctx, s) => ({ op: 'note', text: s }),
    },
    {
        re: /^после вытягивания карт на этапе подготовки[^.]*\.?$/i,
        build: (m, ctx, s) => ({ op: 'note', text: s }),
    },
    {
        re: /^этот отряд выставляется в дружественную область активной системы\.?$/i,
        build: (m, ctx, s) => ({ op: 'note', text: s }),
    },
    {
        re: /^этот отряд не может участвовать в основном приказе продвижения\.?$/i,
        build: (m, ctx, s) => ({ op: 'note', text: s }),
    },
    {
        re: /^вы можете выполнить этот приказ, даже если у вас нет отрядов в активной системе\.?$/i,
        build: (m, ctx, s) => ({ op: 'note', text: s }),
    },
    {
        re: /^при выполнении этого приказа, после того как закончится битва[^.]*\.?$/i,
        build: (m, ctx, s) => ({ op: 'note', text: s }),
    },
    {
        re: /^вы можете выполнить этот приказ, как если бы он был любым другим[^.]*\.?$/i,
        build: (m, ctx, s) => ({ op: 'note', text: s }),
    },
    {
        re: /^затем получите такой же жетон\.?$/i,
        build: (m, ctx, s) => ({ op: 'note', text: s }),
    },
    {
        re: /^за каждый потраченный вами `(?:(?:att|def)\. cube|morale cube)`[^.]*\.?$/i,
        build: (m, ctx, s) => ({ op: 'note', text: s }),
    },
    {
        re: /^после того, как вы выполните этот приказ, можете приобрести до 2 отрядов[^.]*\.?$/i,
        build: (m, ctx, s) => ({ op: 'note', text: s }),
    },
    {
        re: /^выполните ограниченный приказ продвижение[^.]*\.?$/i,
        build: (m, ctx, s) => ({ op: 'note', text: s }),
    },
    {
        re: /^если вы это сделаете, замените любое количество карт[^.]*\.?$/i,
        build: (m, ctx, s) => ({ op: 'note', text: s }),
    },
    {
        re: /^используйте способность одной из них[^.]*\.?$/i,
        build: (m, ctx, s) => ({ op: 'note', text: s }),
    },
    {
        re: /^затем переместите этот варп-шторм[^.]*\.?$/i,
        build: (m, ctx, s) => ({ op: 'note', text: s }),
    },
    {
        re: /^затем положите его либо поверх стека, либо под него\.?$/i,
        build: (m, ctx, s) => ({ op: 'note', text: s }),
    },
    {
        re: /^таким образом можно опустить здоровье до 0[^.]*\.?$/i,
        build: (m, ctx, s) => ({ op: 'note', text: s }),
    },
    // "you and your opponent must reroll all the dice"
    {
        re: /вы и ваш противник обязаны перебросить все кубики/i,
        build: () => ({ op: 'rerollAll' }),
    },
    // "the opponent has more morale cubes, he loses 1"
    {
        re: /если у противника больше morale cube, то он теряет 1 morale cube/i,
        build: () => ({ op: 'loseDieIfMore', n: 1, kind: 'morale', who: 'foe' }),
    },
    // "buy 1 order upgrade card, its cost is lowered"
    {
        re: /купите одну карту улучшения приказа, уменьшив её стоимость в материалах на (\d+) за каждый ([^.;]+)/i,
        build: m => ({ op: 'buyUpgrade', kind: 'order', discount: Number(m[1]), per: countKind(m[2]) }),
    },
    // "pay 1 materiel to take 1 city from the reserve and place it for free"
    {
        re: /взять из резерва 1 город и бесплатно разместить его/i,
        build: () => ({ op: 'placeStructure', kind: 'city', n: 1, free: true, pick: true }),
    },
    // "you may spend 1 materiel to place 1 unit of command level 0"
    {
        re: /потратить (\d+) матери[а-яёa-z]*, чтобы разместить 1 отряд с командным уровнем 0/i,
        build: m => ({ op: 'cheapUnit', n: Number(m[1]) }),
    },
    // "this unit or bastion takes the damage first" — the engine asks the order.
    {
        re: /^этот отряд(?: или бастион)? (?:должен получить урон|получит урон|получает повреждения|получает урон) первым/i,
        // The step before it («вы можете выбрать 1 отряд с командным уровнем 0»)
        // already carries the rule: the sentence explains it.
        build: (m, ctx, s) => ({ op: 'note', text: s }),
    },
    // "you may buy only 1 upgrade"
    {
        re: /можете приобрести только (\d+) улучшен/i,
        build: m => ({ op: 'upgradeLimit', n: Number(m[1]) }),
    },
    // "Its cost in materiel is lowered by 1 for every <X>."
    {
        re: /(?:стоимость в материалах\s+(?:уменьшается|снижается)|уменьши[а-яёa-z]*\s+его\s+стоимость)\s+на\s+(\d+)\s+за\s+кажд[а-яёa-z]+\s+([^.;]+)/i,
        build: (m, ctx, s) => {
            const limit = /не более чем на (\d+)/i.exec(s);
            return { op: 'costDiscount', n: Number(m[1]), per: countKind(m[2]), max: limit ? Number(limit[1]) : 0 };
        },
    },
    // "spend up to 2 materiel to get 1 asset"
    {
        re: /потратьте до (\d+) материалов, чтобы получить (\d+) ценн[а-яёa-z]* ресурс/i,
        build: m => ({ op: 'exchangeMateriel', n: Number(m[1]), gain: Number(m[2]) }),
    },
    // "spend up to 2 assets to get 2 materiel each"
    {
        re: /потратьте до (\d+) ценн[а-яёa-z]* ресурс[а-яёa-z]*, чтобы получить по (\d+) материала/i,
        build: m => ({ op: 'exchangeAsset', n: Number(m[1]), gain: Number(m[2]) }),
    },
    // "replace 1 Skirmisher with 1 Warp Runner"
    {
        re: /замени[а-яёa-z]*\s+(\d+)?\s*([А-ЯЁ][а-яёa-z'’]+)\s+на\s+(\d+)?\s*([А-ЯЁ][а-яёa-z'’]+)/i,
        build: (m, ctx) => {
            const faction = FS_EFFECTS.factionOf(ctx);
            const from = FS_EFFECTS.unitNames(m[2], faction);
            const to = FS_EFFECTS.unitNames(m[4], faction);
            if (!from.length || !to.length) return null;
            return {
                op: 'replaceUnit', n: num(m[1]), from: from[0], to: to[0],
                filter: unitFilter(from[0]), pick: true, free: true, text: m[0],
            };
        },
    },
    // "Take the top 3 cards of your event deck."
    {
        re: /возьмите (\d+) верхни[ех] карт[ы] вашей колоды событий/i,
        build: m => ({ op: 'drawEvents', n: Number(m[1]) }),
    },
    // "your units of command level 2 or less cannot be routed"
    {
        re: /ваши отряды с командным уровнем (\d+) или ниже не могут быть деморализован/i,
        build: m => ({ op: 'noRoute', kl: Number(m[1]) }),
    },
    // «если в этом раунде боя отряд противника становится деморализованным, он
    // уничтожается» («Фаланга судного дня»); the opponent may pay a `def. cube`.
    {
        re: /(?:если )?в этом раунде боя отряд противника становится деморализованным,? он уничтожается/i,
        build: () => ({ op: 'destroyRoutedFoe', who: 'foe', pick: true }),
    },
    // "repeat the damage step of this combat round"
    {
        re: /повторите шаг нанесения (?:повреждений|урона)/i,
        build: () => ({ op: 'repeatDamage' }),
    },
    // «выполнить 1 дополнительный шаг нанесения повреждений для обоих игроков»
    // («Безжалостное наступление»).
    {
        re: /выполнить (?:1|один) дополнительн[а-яёa-z]* шаг нанесения (?:повреждений|урона)/i,
        build: () => ({ op: 'repeatDamage' }),
    },
    // "ignore all the damage that exceeds the health of this unit"
    {
        re: /игнорируйте весь урон, который превышает здоровье/i,
        build: () => ({ op: 'ignoreExcess' }),
    },
    // "do not discard your `def. token` at the end of this round"
    {
        re: /не сбрасывайте ваши `def\. token`/i,
        build: () => ({ op: 'keepTokens' }),
    },
    // "the opponent cannot place reinforcement tokens"
    {
        re: /противник[а-яёa-z]* не (?:может|сможет) (?:размещать|использовать|разыгрывать) жетоны подкрепления/i,
        build: () => ({ op: 'noReinforce' }),
    },
    // "make the opponent discard any die and take it for yourself"
    {
        re: /заставьте оппонента сбросить один любой кубик/i,
        build: () => ({ op: 'stealDie' }),
    },
    // "make the opponent convert up to 2 of his dice of a certain value"
    {
        re: /заставьте оппонента сконвертировать до (\d+) его куб/i,
        build: m => ({ op: 'convertFoeDice', n: Number(m[1]) }),
    },
    // "discard one of the open combat cards of the opponent"
    {
        re: /сбросьте одну открытую боевую карту противника/i,
        build: () => ({ op: 'discardFoeCard' }),
    },
    {
        re: /ваш противник выбирает и сбрасывает 1 свою открытую боевую карту/i,
        build: () => ({ op: 'discardFoeCard', who: 'foe' }),
    },
    // "the opponent discards the top card of his combat deck"
    {
        re: /противник[а-яёa-z]* сбрасывает верхнюю карту своей боевой колоды/i,
        build: () => ({ op: 'discardFoeTop' }),
    },
    // "make the opponent distribute the damage 1 point at a time"
    {
        re: /вынудите вашего противника распределять урон своим войскам по 1 единице за раз/i,
        build: () => ({ op: 'damageOneByOne' }),
    },
    // "in this planning phase you will place 5 order tokens"
    {
        re: /в этой фазе планирования вы положите (\d+) жетонов приказов/i,
        build: m => ({ op: 'extraOrderTokens', n: Math.max(0, Number(m[1]) - 4) }),
    },
    // "you may put 3 of your order tokens on top of your event deck"
    {
        re: /поместить (\d+) своих жетон[а-яёa-z]* приказ[а-яёa-z]*[^.]*колод[а-яёa-z]* событий/i,
        build: m => ({ op: 'extraOrderTokens', n: Number(m[1]) }),
    },
    // "you may put 2 more order tokens on your event deck"
    {
        re: /бесплатно положить на свою колоду событий еще (\d+) жетон[а-яёa-z]* приказов/i,
        build: m => ({ op: 'extraOrderTokens', n: Number(m[1]) }),
    },
    // "you may replace 1 structure in this system with any other"
    {
        re: /заменить (\d+) постройк[а-яёa-z]* в этой системе на любую другую/i,
        build: m => ({ op: 'replaceStructure', n: Number(m[1]) }),
    },
    // "look at the top three event cards: keep one on top, discard the others"
    {
        re: /посмотрите три верхние карты событий/i,
        build: () => ({ op: 'lookEvents', n: 3 }),
    },
    // "draw 2 extra cards and discard 2 of your cards"
    {
        re: /вытяните (\d+) дополнительных карт[а-яёa-z]* и сбросьте затем (\d+)/i,
        build: m => ({ op: 'extraCombatCards', n: Number(m[1]), discard: Number(m[2]) }),
    },
    // «взять 2 дополнительные боевые карты из колоды, затем выбрать и сбросить
    // столько же карт с руки» («Хрономантия»).
    {
        re: /взять (\d+) дополнительн[а-яёa-z]* боев[а-яёa-z]* карт[а-яёa-z]* из колоды[^.]*?сбросить столько же/i,
        build: m => ({ op: 'drawCombatCards', n: Number(m[1]), discard: Number(m[1]) }),
    },
    // "you may move up to 6 units to this world"
    {
        re: /переместить в этот мир до (\d+) отрядов/i,
        build: m => ({ op: 'moveLimit', n: Number(m[1]) }),
    },
    // "you may lead up to 2 of your units through one uncontrolled void"
    {
        re: /провести до (\d+) ваших отрядов через одну никем не контролируемую пустую область/i,
        build: m => ({ op: 'passVoid', n: Number(m[1]) }),
    },
    // "treat the uncontrolled worlds as friendly for moving up to 2 of your units"
    {
        re: /считать неконтролируемые миры дружественными для перемещения не более (\d+) ваших отрядов/i,
        build: m => ({ op: 'uncontrolledMarch', n: Number(m[1]) }),
    },
    // «можете вдобавок купить 1 бастион и разместить его в дружественном или
    // нейтральном мире в активной или соседней системе» («Миры-гробницы»).
    {
        re: /вдобавок купить (\d+) бастион/i,
        build: m => ({ op: 'buyBastionNearby', n: Number(m[1]), kind: 'bastion', cost: 2, pick: true }),
    },
    // "the cities may be treated as factories that make only Guardsmen"
    {
        re: /рассматривать все свои города[^.]*как фабрики, на которых могут производиться только ([^.,;]+)/i,
        build: m => ({ op: 'citiesAsFactories', only: m[1] }),
    },
    // "2 Guardsmen may be bought for 1 supply token."
    {
        re: /(\d+)\s+([А-ЯЁ][а-яёa-z]+) могут быть куплены за 1 жетон/i,
        build: m => ({ op: 'supplyDeal', n: Number(m[1]), unit: m[2] }),
    },
    // "They must be deployed in the world that produced them."
    {
        re: /должны быть развернуты в мире, который их произв[её]л/i,
        build: () => ({ op: 'deployInFactoryWorld' }),
    },
    // "Draw 4 event cards and play the effect of one of them."
    {
        re: /вытянуть (\d+) карты событий и разыграть эффект одной из них/i,
        build: m => ([
            { op: 'drawEvents', n: Number(m[1]) },
            { op: 'playEvent' },
        ]),
    },
    // "Take one of your ships from any void and place it in a friendly void."
    {
        re: /взять\s+(?:один|1|\d+)?\s*из ваших кораблей[^.]{0,80}?разместить/i,
        build: () => ({ op: 'moveUnit', n: 1, pick: true }),
    },
    // "Choose a system."
    {
        re: /^\s*выберите систему\s*\.?\s*$/i,
        build: () => ({ op: 'chooseSystem' }),
    },
    // "Discard this card."
    {
        re: /^\s*сбросьте эту карту\s*\.?\s*$/i,
        build: () => ({ op: 'discardCard' }),
    },
    // "Destroy this unit after the combat is resolved."
    {
        re: /уничтожьте этот отряд/i,
        build: () => ({ op: 'destroyUnit' }),
    },
    // «вернуть этого юнита недеморализованным обратно после этапа получения
    // урона» («Сфера воскрешения»): the unit comes back whole after the damage.
    {
        re: /вернуть этого юнита недеморализованным/i,
        build: () => ({ op: 'resurrect', maxKl: 1 }),
    },
    // The sentences the engine cannot act on by itself yet — the player
    // performs them by hand at the end of the damage step; the card is never
    // silent and never fires the wrong thing:
    {
        re: /получ[а-яёa-z]*\s+по\s+(\d+)\s+материал[а-яёa-z]*\s+за\s+кажд[а-яёa-z]*\s+[^,.;]{0,80}?уничтож[а-яёa-z]*/i,
        build: (m, ctx, s) => ({ op: 'note', text: s, manual: 'materiel-per-destroyed' }),
    },
    {
        re: /любой\s+отряд[а-яёa-z]*[^.;]{0,80}?уничтожается[.!]?$/i,
        build: (m, ctx, s) => ({ op: 'note', text: s, manual: 'destroy-routed-foe' }),
    },
    {
        re: /нанести\s+(?:его\s+)?ваш[а-яёa-z]*\s+деморализованн[а-яёa-z]*\s+отряд[а-яёa-z]*/i,
        build: (m, ctx, s) => ({ op: 'note', text: s, manual: 'damage-own-routed' }),
    },
    {
        re: /половину\s+значения\s+боевого\s+духа/i,
        build: (m, ctx, s) => ({ op: 'note', text: s, manual: 'morale-from-routed' }),
    },
    // The sentences that say no rule of their own: the engine keeps them.
    {
        re: /кажд[а-яёa-z]*\s+пару\s+недеморализованн[а-яёa-z]*[^.;]{0,90}?(?:либо|или)/i,
        build: (m, ctx, s) => ({ op: 'note', text: s, manual: 'per-pair' }),
    },
    {
        re: /^(?:—\s*\([^)]*\)|если одинаково, выбираете вы\.?|это может привести к нов[а-яёa-z]+ (?:сражению|битве)[^.]*\.?|не нарушая базовых правил размещения\.?|неиспользованный остаток материалов пропадает\.?|нужно быть главным по машинам\.?|требуются\s*\.?|пассивно|используйте эти материалы только для покупки любого количества кораблей\.?|уничтоженный город засчитывается[^.]*\.?|командный уровень этой карты не может превышать[^.]*\.?|неиспользованный остаток[^.]*\.?)$/i,
        build: (m, ctx, s) => ({ op: 'note', text: s }),
    },
];

// What is counted for the discount: "for every friendly world with a bastion".
function countKind(text) {
    const s = String(text || '').toLowerCase().trim();
    if (/бастион/.test(s)) return 'friendlyBastion';
    if (/город/.test(s)) return 'yourCity';
    if (/культист/.test(s)) return 'cultist';
    if (/жетон/.test(s)) return 'reinforcement';
    if (/фабрик/.test(s)) return 'yourFactory';
    if (/систем[а-яёa-z]*/.test(s) && /противник/.test(s)) return 'mixedSystem';
    if (/систем[а-яёa-z]*/.test(s) && /не содержит/.test(s)) return 'noFoeSystem';
    return null;
}

// The number of the text: "2" or "up to 2" or "one".
// The loss of the opponent in the words of the same sentence:
// «… Ваш противник потерял 2 `def. cube`.»
function foeLoseSteps(sentence) {
    const m = /(?:противник[а-яёa-z]*|вражеск[а-яёa-z]*|он(?![а-яёa-z]))[^.`]{0,40}?(?:теряет|терять|потеряет|потерять|теряют|потеряют|потерял|потеряли)\s+([^;]{0,80})/i.exec(String(sentence || ''));
    if (!m) return [];
    const icons = [...m[1].matchAll(/`([^`]+)`/g)].map(x => x[1]);
    if (!icons.length) return [];
    const n = num((m[1].match(/\d+/) || [])[0]);
    const steps = [];
    // The gain of the same sentence, before the loss.
    const gain = /получ(?:ите|ает|ают)\s+(?:(\d+|один|одно|два)\s*)?(?:`([^`]+)`|куб[а-яёa-z]*)/i.exec(String(sentence || ''));
    if (gain && gain[2]) {
        const kind = FS_EFFECTS.iconKind(gain[2]);
        if (kind === 'cube' || kind === 'token') {
            steps.push({
                op: kind === 'cube' ? 'gainDie' : 'gainToken',
                n: num(gain[1]),
                kind: FS_EFFECTS.icon(gain[2]),
                onlyIfFoeHas: kind === 'cube' ? FS_EFFECTS.icon(gain[2]) : undefined,
                who: 'me',
            });
        }
    }
    const loss = [];
    for (const ic of icons) {
        const kind = FS_EFFECTS.iconKind(ic);
        if (kind === 'token') loss.push({ op: 'loseToken', n, kind: FS_EFFECTS.icon(ic), who: 'foe' });
        else if (kind === 'cube') loss.push({ op: 'loseDie', n, kind: FS_EFFECTS.icon(ic), pick: true, who: 'foe' });
    }
    // «Ваш противник теряет 3 `att. token` или 3 `def. cube`» — the opponent
    // loses one of the two, and the resolving player chooses which.
    if (loss.length > 1 && /(или|либо)/i.test(m[1])) {
        steps.push({ op: 'choice', options: loss, text: sentence });
        return steps;
    }
    return steps.concat(loss);
}

function gainStep(src) {
    // The «…чтобы получить 2 `att. token`» half of a payment: the tokens the
    // payment buys. Nothing when the clause is absent.
    const m = /(?:чтобы\s+)?получ[а-яёa-z]*\s+(\d+|два|одно|один)?\s*`([^`]+)`/i.exec(String(src || ''));
    if (!m) return [];
    const kind = FS_EFFECTS.icon(m[2]);
    const k = FS_EFFECTS.iconKind(m[2]);
    const n = num(m[1]);
    if (k === 'token') return [{ op: 'gainToken', n, kind, who: 'me' }];
    if (k === 'cube') return [{ op: 'gainDie', n, kind, who: 'me' }];
    return [];
}

function num(text) {
    if (!text) return 1;
    const t = String(text).toLowerCase().replace(/^\s*до\s*/, '').trim();
    if (/два/.test(t)) return 2;
    if (/оди?[а-яёa-z]*н[а-яёa-z]*/i.test(t)) return 1;
    const n = parseInt(t, 10);
    return isNaN(n) ? 1 : n;
}

// The filter of the units: "Guardsman or Cruiser" -> the stems of the names.
// The names printed on the cards against the names of the unit list: the card
// says "сестру Ренентию", the faction sheet "Сестры ренетентии".
// The name of one unit is printed in four ways in the sources
// ("Сестра Репентия", "Сестра Ренентиля", "сестру Ренентию", "Сестры ренетентии").
/** @type {[RegExp, string[]][]} */
const UNIT_STEMS = [
    [/ре[пн]е[нт]/i, ['репен', 'ренент', 'ренетент']],
    [/бойз/i, ['бойз']],
    [/натиск/i, ['натиск']],
];
// The «разного командного уровня» is a counting rule, not a name.
function stripQualifier(text) {
    return String(text || '')
        // «разного командного уровня», «разным командным уровнем», «разного типа»
        .replace(/\s*разн[а-яёa-z]*(?:\s+командн[а-яёa-z]*)?\s+(?:уровн|тип)[а-яёa-z]*\s*/gi, ' ')
        .replace(/\s*разн[а-яёa-z]*\s+(?:уровн|тип)[а-яёa-z]*\s*/gi, ' ')
        .replace(/\s*(?:недеморализованн|недеморализован)[а-яёa-z]*\s*/gi, ' ')
        .trim();
}
// The broad classes: «наземный отряд» / «корабль».
function typeFilter(text) {
    const s = String(text || '').toLowerCase();
    if (/наземн/.test(s)) return { type: 'ground' };
    if (/корабл/.test(s)) return { type: 'ship' };
    return null;
}
function unitFilter(text) {
    if (!text) return null;
    text = stripQualifier(text);
    // The printed names win over the classes: «отряд бойзов или атакующий
    // корабль класса «Натиск»» names two units, not «ships».
    const contains = [];
    for (const [re, stems] of UNIT_STEMS) if (re.test(text)) contains.push(...stems);
    if (contains.length) return { contains };
    // «наземный отряд» / «корабль» — the class of the units, not a name.
    const type = typeFilter(text);
    if (type) return type;
    // The names keep their spaces: «Танки Леман Русс» is read by its last word.
    const names = text.split(/\s+или\s+|\s+и\s+/)
        .map(s => s.trim().replace(/[^А-Яа-яЁё' ]/g, '').replace(/\s+/g, ' ').trim())
        // A preposition that came with the words of the text is not a name.
        .map(s => s.replace(/^(?:в|во|с|со|из|на|от|к)\s+/i, '').replace(/\s+(?:в|во|с|со|из|на|от|к)$/i, '').trim())
        .filter(s => s.length >= 3);
    return names.length ? { types: names } : null;
}
