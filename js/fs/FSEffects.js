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
    // How many resource tokens of a kind a player may hold. The printed limit
    // is three of each kind; the Tyranids hold four («Количество жетонов
    // ресурсов, которые вы можете иметь, увеличивается до 4» — «Пожиратели
    // Миров»; 07-tokens.md: «у игрока не может быть больше 3 жетонов каждого
    // типа (у Тиранидов — до 4)»), and a card may raise the limit for the game.
    assetCap(player, kind) {
        return FS_CATALOG.assetLimitFor(player, kind);
    },

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
            .replace(/(?<!(?:класс[а-яё]*|корабл[а-яё]*|[Тт]ребуются)\s*)«[^»]*»/g, ' ')
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
        // The semicolon before «либо» joins the alternatives of ONE sentence
        // («…в мире с вашей фабрикой; либо разместите …» — «Багровая стража»):
        // it is not the end of the sentence, so it survives the split as a comma
        // and the choice of the card is built.
        const joined = marked.replace(/;\s*(?=(?:либо|или)\s)/gi, '\u0003 ');
        const parts = joined.split(/(?<=[.;])\s+|\s*;\s*/).map(s => s.trim()).filter(Boolean);
        return parts.map(part => part
            .replace(/\u0001(\d+)\u0001/g, (m, i) => '`' + icons[Number(i)] + '`')
            .replace(/\u0003/g, ',')
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

    // The Tau cards are transcribed from the faction sheet and the three card
    // sheets in docs/forbidden-stars (02, 04, 05, 06). Their sentences are read
    // as one ability each: a wide rule of another faction must never claim a
    // Tau sentence and turn it into a note. Every branch, payment and reward
    // below is performed by step()/apply(), not left for the player to do by
    // hand. The text of an ability is kept on the step: the engine asks the
    // owner of a combat card for permission once per sentence.
    tauCard(text, ctx) {
        const s = String(text || '').replace(/\s+/g, ' ').trim();
        if (!s) return null;
        // The printed green box of «Команды следопытов» is empty: the dash in
        // the transcription is a placeholder, not an ability to park as a note.
        if (s === '— (только способность отряда)') return [];
        /** @param {string} op @param {any} extra @param {string} ability */
        const mk = (op, extra, ability) => {
            /** @type {any} */
            const one = { op };
            Object.assign(one, extra || {});
            if (ability) one.ability = ability;
            return one;
        };
        /** @type {any[]} */
        let out = null;
        const has = re => re.test(s);

        // --- 04-combat-cards.md: the general abilities ----------------------
        if (/^Отступите одним из ваших отрядов\./i.test(s) && /восстановить этот деморализованный отряд/i.test(s)) {
            out = [mk('retreat', { who: 'me', pick: true, record: true },
                'Отступите одним из ваших отрядов.')];
            out[0].then = [
                mk('spendDie', { n: 1, kind: 'morale', pick: true, any: false, all: false, who: 'me' },
                   'Если вы это сделаете, можете потратить 1 `morale cube`, чтобы восстановить этот деморализованный отряд.'),
                mk('restoreRetreated', { who: 'me' },
                   'Если вы это сделаете, можете потратить 1 `morale cube`, чтобы восстановить этот деморализованный отряд.'),
            ];
        } else if (/^Если у вас меньше отрядов, чем у противника/i.test(s) && /В противном случае получите 1 `att\. token`/i.test(s)) {
            const a = 'Если у вас меньше отрядов, чем у противника, получите 1 `def. token`, а ваш противник теряет 1 `att. cube`.';
            const b = 'В противном случае получите 1 `att. token`.';
            out = [
                mk('gainToken', { n: 1, kind: 'def', who: 'me', cond: { unitLess: true } }, a),
                mk('loseDie', { n: 1, kind: 'att', pick: true, who: 'foe', cond: { unitLess: true } }, a),
                mk('gainToken', { n: 1, kind: 'att', who: 'me', cond: { not: { unitLess: true } } }, b),
            ];
        } else if (s === 'В этом раунде боя, в начале шага нанесения повреждений, ваш противник теряет 3 `att. token`.') {
            out = [mk('damageStartTokens', { n: 3, kind: 'att', who: 'foe' }, s)];
        } else if (/^Получите 2 `att\. token`\. Потратьте до 2 `morale cube`/i.test(s)) {
            const a = 'Получите 2 `att. token`.';
            const b = 'Потратьте до 2 `morale cube`.';
            const c = 'За каждый потраченный `morale cube` вы получаете либо 1 `att. cube`, либо 1 `def. cube`.';
            out = [
                mk('gainToken', { n: 2, kind: 'att', who: 'me' }, a),
                mk('spendDie', { n: 2, kind: 'morale', pick: true, any: true, all: false, who: 'me' }, b),
                mk('choice', {
                    per: 'spent', perKind: 'morale', text: c, who: 'me',
                    options: [
                        mk('gainDie', { n: 1, kind: 'att', who: 'me' }, c),
                        mk('gainDie', { n: 1, kind: 'def', who: 'me' }, c),
                    ],
                }, c),
            ];
        } else if (/^Потратьте любое количество кубиков\./i.test(s) && /За каждые 2 кубика/i.test(s)) {
            const a = 'Потратьте любое количество кубиков.';
            const b = 'За каждые 2 кубика, которые вы потратили, восстановите 1 свой деморализованный отряд.';
            out = [
                mk('spendDie', { n: 99, kind: 'any', pick: true, any: true, all: false, who: 'me' }, a),
                mk('restore', { n: 1, per: 'spentPairs', perN: 2, pick: true, all: false, who: 'me' }, b),
            ];
        } else if (/^Получите 2 `att\. token`\. Выберите 1 из отрядов или бастион противника\./i.test(s)) {
            const a = 'Получите 2 `att. token`.';
            const b = 'Выберите 1 из отрядов или бастион противника.';
            const c = 'Этот отряд или бастион получает урон первым.';
            const d = 'Урон, превышающий значение здоровья выбранного отряда или бастиона, теряется.';
            const all = b + ' ' + c + ' ' + d;
            out = [
                mk('gainToken', { n: 2, kind: 'att', who: 'me' }, a),
                mk('damageFirst', { anyFoe: true, who: 'foe' }, all),
                mk('ignoreExcess', { who: 'me' }, all),
            ];
        } else if (/^Получите 1 `def\. token`\. В конце этого раунда, если вы обороняетесь/i.test(s)) {
            const a = 'Получите 1 `def. token`.';
            const b = 'В конце этого раунда, если вы обороняетесь, вы можете переместить 1 из ваших отрядов из соседней области в эту. Получите количество `any cube`, равное значению боевой силы перемещённого отряда.';
            out = [
                mk('gainToken', { n: 1, kind: 'def', who: 'me' }, a),
                mk('endRoundReinforce', { cond: { side: 'defense' }, who: 'me' }, b),
            ];
        } else if (/^Ваш противник обязан перебросить все `def\. cube`\. Вы обязаны/i.test(s)) {
            const a = 'Ваш противник обязан перебросить все `def. cube`.';
            const b = 'Вы обязаны либо перебросить 2 `def. cube`, либо отступить 1 из ваших отрядов.';
            out = [
                mk('rerollDie', { n: 99, kind: 'def', all: true, pick: true, who: 'foe' }, a),
                mk('choice', {
                    text: b, who: 'me',
                    options: [
                        mk('rerollDie', { n: 2, kind: 'def', pick: true, who: 'me' }, b),
                        mk('retreat', { n: 1, pick: true, who: 'me' }, b),
                    ],
                }, b),
            ];

        // --- 04-combat-cards.md: the unit abilities ------------------------
        } else if (/^ваш противник деморализует один свой отряд\./i.test(s) && /Если он этого не сделает/i.test(s)) {
            const a = 'ваш противник деморализует один свой отряд. Если он этого не сделает, то теряет 1 `any cube`.';
            out = [mk('choice', {
                text: a, who: 'foe', noAbilityQuestion: true,
                options: [
                    mk('route', { n: 1, who: 'foe', pick: true, chooser: 'foe' }, a),
                    mk('loseDie', { n: 1, kind: 'any', who: 'foe', pick: true }, a),
                ],
            }, a)];
        } else if (/^если вы атакуете, посмотрите выложенную лицом вниз боевую карту противника\./i.test(s)
            && /Сбросьте эту карту и сыграйте 1 боевую карту из вашей руки\./i.test(s)) {
            const a = 'если вы атакуете, посмотрите выложенную лицом вниз боевую карту противника.';
            const b = 'Сбросьте эту карту и сыграйте 1 боевую карту из вашей руки.';
            out = [
                mk('peekFoeCard', { cond: { side: 'attack' }, who: 'me' }, a),
                mk('discardFoeStaged', { cond: { side: 'attack' }, who: 'me' }, b),
                mk('playCard', { staged: true, pick: true, cond: { side: 'attack' }, who: 'me' }, b),
            ];
        } else if (/^потратьте до 2 кубиков\./i.test(s) && /За каждый потраченный кубик вы получаете 2 `att\. token`/i.test(s)) {
            const a = 'потратьте до 2 кубиков.';
            const b = 'За каждый потраченный кубик вы получаете 2 `att. token`.';
            out = [
                mk('spendDie', { n: 2, kind: 'any', pick: true, any: true, all: false, who: 'me' }, a),
                mk('gainToken', { n: 2, kind: 'att', per: 'spent', who: 'me' }, b),
            ];
        } else if (/^ваш противник (должен|может) потратить 3 `morale cube`\./i.test(s)) {
            const optional = /^ваш противник может потратить/i.test(s);
            out = [mk('foeSpendOrPay', {
                n: 3, kind: 'morale', per: 2, optional, who: 'foe', noAbilityQuestion: true,
            }, s)];
        } else if (/^получите 1 `def\. token`\. Противник теряет 1 `att\. cube` либо 1 `morale cube`\./i.test(s)) {
            const a = 'получите 1 `def. token`.';
            const b = 'Противник теряет 1 `att. cube` либо 1 `morale cube`.';
            out = [
                mk('gainToken', { n: 1, kind: 'def', who: 'me' }, a),
                mk('choice', {
                    text: b, who: 'me',
                    options: [
                        mk('loseDie', { n: 1, kind: 'att', who: 'foe', pick: true }, b),
                        mk('loseDie', { n: 1, kind: 'morale', who: 'foe', pick: true }, b),
                    ],
                }, b),
            ];
        } else if (/^во время этого раунда боя, когда 1 из ваших отрядов должен быть уничтожен/i.test(s)) {
            out = [mk('retreatInstead', { who: 'me', noAbilityQuestion: true }, s)];
        } else if (/^если ни один из ваших отрядов не отступил во время этого раунда/i.test(s)) {
            out = [mk('gainToken', { n: 2, kind: 'att', who: 'me', cond: { noRetreat: true } }, s)];
        } else if (/^во время этого раунда, если какие-либо из ваших недеморализованных отрядов с командным уровнем 0/i.test(s)) {
            out = [mk('restoreFallen', { maxKl: 0, who: 'me' }, s)];

        // --- 05-order-upgrades.md ------------------------------------------
        } else if (/^Когда Вы раскрываете этот приказ в системе, где есть 1 ваш отряд или постройка/i.test(s)) {
            out = [
                mk('require', { what: 'unitsOrStructures', system: 'active', orderOnly: true, who: 'me' }, s),
                mk('require', { what: 'friendlyOrUncontrolledWorld', system: 'active', orderOnly: true, who: 'me' }, s),
                mk('cheapUnit', { n: 1, onlyActive: true, who: 'me' }, s),
                mk('once', {}, 'Один раз за раунд.'),
            ];
        } else if (/^Когда Вы разыгрываете этот жетон приказа, Вы можете поместить 3 своих жетона приказа/i.test(s)) {
            out = [
                mk('putOrderTokensOnDeck', { n: 3, who: 'me' }, s),
                mk('once', {}, 'Один раз за раунд.'),
            ];
        } else if (s === 'Бастионы противника не могут предотвратить этот орбитальный удар. Во время этого орбитального удара получите 1 `any cube`. Один раз за раунд.') {
            out = [
                mk('ignoreBastion', { who: 'me' }, 'Бастионы противника не могут предотвратить этот орбитальный удар.'),
                mk('gainDie', { n: 1, kind: 'any', who: 'me' }, 'Во время этого орбитального удара получите 1 `any cube`.'),
                mk('once', {}, 'Один раз за раунд.'),
            ];
        } else if (/^Во время этого орбитального удара получите 1 `any cube`, Вы можете потратить 1 `any cube`/i.test(s)) {
            out = [
                mk('gainDie', { n: 1, kind: 'any', who: 'me' }, 'Во время этого орбитального удара получите 1 `any cube`.'),
                mk('strikePay', { n: 1, kind: 'any', who: 'me' }, 'Вы можете потратить 1 `any cube`, чтобы выбрать 1 вражеский отряд в этом мире.'),
                mk('strikeReward', { first: true, maxKl: null, who: 'me' }, 'Этот отряд получает повреждения первым, во время этого орбитального удара.'),
                mk('once', {}, 'Один раз за раунд.'),
            ];
        } else if (/^Перед тем как выполнить этот приказ, Вы можете выполнить дополнительный приказ продвижения/i.test(s)) {
            out = [
                mk('preAdvance', { who: 'me', noAbilityQuestion: true }, s),
                mk('once', {}, 'Один раз за раунд.'),
            ];

        // --- 06-events.md ---------------------------------------------------
        } else if (/^Деморализуйте 1 вражеский отряд с командным уровнем 2 или ниже/i.test(s)) {
            out = [mk('route', {
                n: 1, who: 'foe', pick: true, maxKl: 2, sameSystemMine: true, chooser: 'me',
            }, s)];
        } else if (/^Разместите эту карту в своей игровой зоне/i.test(s) && /восстановить все свои деморализованные отряды в одной системе/i.test(s)) {
            out = [
                mk('scheme', { who: 'me' }, 'Разместите эту карту в своей игровой зоне и сбросьте все Ваши прочие планы, чтобы осталось не больше 2.'),
                mk('trigger', {
                    trigger: 'operations', who: 'me', note: false, defer: false,
                    text: 'Перед тем как раскрыть приказ во время фазы действий, Вы можете сбросить эту карту, чтобы восстановить все свои деморализованные отряды в одной системе.',
                    steps: [mk('restoreOneSystem', { who: 'me' }, 'восстановить все свои деморализованные отряды в одной системе.')],
                }, 'Перед тем как раскрыть приказ во время фазы действий, Вы можете сбросить эту карту, чтобы восстановить все свои деморализованные отряды в одной системе.'),
            ];
        } else if (/^Уничтожьте один из Ваших недеморализованных отрядов в любой системе/i.test(s)) {
            out = [mk('sabotage', { who: 'me' }, s)];
        } else if (/^Выберите систему\. Выполните ограниченный приказ Продвижение/i.test(s)) {
            out = [mk('chooseSystem', { quickResponse: true, who: 'me' }, s)];
        } else if (/^Разместите эту карту в своей игровой зоне/i.test(s) && /замените любое количество карт из своей боевой колоды/i.test(s)) {
            out = [
                mk('scheme', { who: 'me' }, 'Разместите эту карту в своей игровой зоне и сбросьте все Ваши прочие планы, чтобы осталось не больше 2.'),
                mk('trigger', {
                    trigger: 'combat-start', who: 'me', note: false, defer: false,
                    text: 'Вы можете сбросить эту карту в начале боя.',
                    steps: [mk('swapCombatCards', { who: 'me' }, 'замените любое количество карт из своей боевой колоды на пары боевых карт того же или более низкого командного уровня из Вашей колоды улучшений.')],
                }, 'Вы можете сбросить эту карту в начале боя.'),
            ];
        } else if (/^Уничтожьте 1 из Ваших построек в любой системе/i.test(s)) {
            out = [mk('evacuate', { who: 'me' }, s)];
        } else if (/^Разместите эту карту в своей игровой зоне/i.test(s) && /Ваш противник не сможет разыгрывать жетоны подкрепления/i.test(s)) {
            out = [
                mk('scheme', { who: 'me' }, 'Разместите эту карту в своей игровой зоне и сбросьте все Ваши прочие планы, чтобы осталось не больше 2.'),
                mk('trigger', {
                    trigger: 'combat-start', who: 'me', note: false, defer: false,
                    text: 'Вы можете сбросить эту карту в начале боя.',
                    steps: [mk('noReinforce', { who: 'foe' }, 'Ваш противник не сможет разыгрывать жетоны подкрепления на этапе подготовки битвы.')],
                }, 'Вы можете сбросить эту карту в начале боя.'),
            ];
        } else if (/^Разместите эту карту в своей игровой зоне/i.test(s) && /уничтожить тот отряд/i.test(s)) {
            out = [
                mk('scheme', { who: 'me' }, 'Разместите эту карту в своей игровой зоне и сбросьте все Ваши прочие планы, чтобы осталось не больше 2.'),
                mk('trigger', {
                    trigger: 'damage', who: 'me', note: false, defer: true,
                    text: 'Во время шага нанесения повреждений, когда вражеский отряд получает урон, Вы можете сбросить эту карту, чтобы уничтожить тот отряд.',
                    steps: [mk('destroyDamagedFoe', { who: 'me' }, 'уничтожить тот отряд.')],
                }, 'Во время шага нанесения повреждений, когда вражеский отряд получает урон, Вы можете сбросить эту карту, чтобы уничтожить тот отряд.'),
            ];
        }
        void has;
        return out;
    },

    // The Chaos cards are transcribed from the faction sheet and the three card
    // sheets in docs/forbidden-stars (02, 04, 05, 06). A wide rule of another
    // faction must never claim one of their sentences: every payment, branch,
    // replacement and reaction below is performed by step()/apply(), never
    // parked as a note. The keys are the printed texts of FSData, so a typo in a
    // card name cannot silently turn a card back into the generic parser.
    chaosCard(text, ctx) {
        const s = String(text || '').replace(/\s+/g, ' ').trim();
        if (!s || !ctx || ctx.faction !== 'космодесант-хаоса') return null;
        const id = 'космодесант-хаоса';
        const norm = t => String(t || '').replace(/\s+/g, ' ').trim();
        const combat = name => FS_CATALOG.card('combat', id, name);
        const order = name => FS_CATALOG.card('orders', id, name);
        const event = name => FS_CATALOG.card('events', id, name);
        const cg = name => { const c = combat(name); return c ? norm(c.general) : ''; };
        const cu = name => { const c = combat(name); return c ? norm(c.unit) : ''; };
        const ot = name => { const c = order(name); return c ? norm(c.text) : ''; };
        const et = name => { const c = event(name); return c ? norm(c.text) : ''; };
        const ab = s;
        /** @param {string} op @param {any} extra @param {string} ability */
        const mk = (op, extra, ability) => {
            /** @type {any} */
            const one = { op };
            Object.assign(one, extra || {});
            if (ability) one.ability = ability;
            return one;
        };
        // A nested step is not a second optional ability of the same card: the
        // permission was already taken for the sentence it belongs to.
        const sub = (op, extra, ability) => mk(op,
            Object.assign({ noAbilityQuestion: true }, extra || {}), ability);
        /** @type {Record<string, any[]>} */
        const T = {};
        const put = (key, steps) => { if (key) T[key] = steps; };
        const cultists = { contains: ['культист', 'иконоборец'] };
        const iconoclast = 'Эсминцы класса «Иконоборец»';

        // 02-factions.md: the second step of the Dominate order.
        const faction = FS_CATALOG.faction(id);
        put(norm(faction && faction.ability ? faction.ability.text : ''), [
            mk('moveUnits', { n: 1, pick: true, ofSystem: 'active', filter: { contains: ['культист'] },
                dest: 'friendlyOrUncontrolledWorldAdjacent', who: 'me' }, ab),
        ]);

        // --- 04-combat-cards.md: the five base cards ------------------------
        put(cg('Ярость Кхорна (на листе — «Арость Кхорна»)'), [
            mk('spendDie', { n: 1, kind: 'att', pick: true, any: false, all: false, who: 'me' }, ab),
            mk('gainToken', { n: 3, kind: 'att', who: 'me' }, ab),
        ]);
        put(cu('Ярость Кхорна (на листе — «Арость Кхорна»)'), [
            mk('route', { n: 1, pick: true, who: 'foe', chooser: 'foe',
                avoid: { n: 1, kind: 'def' } }, ab),
        ]);
        put(cg('Отвратное поколение'), [mk('gainDie', { n: 1, kind: 'any', who: 'me' }, ab)]);
        put(cu('Отвратное поколение'), [
            mk('gainToken', { n: 1, kind: 'def', per: 'unit', inBattle: true, filter: cultists,
                cond: { foeRouted: 1 }, who: 'me' }, ab),
        ]);
        put(cg('Тёмная вера'), [mk('gainDie', { n: 1, kind: 'morale', who: 'me' }, ab)]);
        put(cu('Тёмная вера'), [
            mk('placeUnit', { n: 1, what: 'Культисты', pick: true, free: true,
                dest: 'friendlyOrUncontrolledOtherWorldCombatSystem',
                cond: { cubeMore: 'morale' }, who: 'me' }, ab),
        ]);
        put(cg('Соблазны Хаоса'), [
            mk('choice', { who: 'foe', text: ab, options: [
                sub('sequence', { steps: [
                    sub('route', { n: 1, pick: true, who: 'foe', chooser: 'foe' }, ab),
                    sub('gainDie', { n: 1, kind: 'any', who: 'foe' }, ab),
                ] }, ab),
                sub('sequence', { steps: [
                    sub('choice', { who: 'me', text: ab, options: [
                        sub('placeUnit', { n: 1, what: 'Культисты', pick: true, free: true,
                            dest: 'combatArea', who: 'me' }, ab),
                        sub('placeUnit', { n: 1, what: iconoclast, pick: true, free: true,
                            dest: 'combatArea', who: 'me' }, ab),
                    ] }, ab),
                ] }, ab),
            ] }, ab),
        ]);
        put(cu('Соблазны Хаоса'), [
            mk('choice', { text: ab, who: 'me', options: [
                sub('gainToken', { n: 2, kind: 'att', who: 'me' }, ab),
                sub('gainToken', { n: 2, kind: 'def', who: 'me' }, ab),
            ] }, ab),
        ]);
        put(cg('Нечистые намерения'), [
            mk('restore', { n: 1, pick: true, cond: { cubeMore: 'morale' }, who: 'me' }, ab),
        ]);
        put(cu('Нечистые намерения'), [
            mk('foeAllow', { text: 'выбрать и деморализовать 1 свой отряд', who: 'foe',
                yes: [sub('route', { n: 1, pick: true, who: 'foe', chooser: 'foe' }, ab)],
                no: [sub('gainToken', { n: 1, kind: 'att', per: 'unit', inBattle: true,
                    filter: cultists, who: 'me' }, ab)] }, ab),
        ]);

        // --- 04-combat-cards.md: the nine upgrades --------------------------
        put(cg('Отметка Кхорна'), [
            mk('spendDie', { n: 1, kind: 'att', kinds: ['att', 'morale'],
                pick: true, any: false, all: false, who: 'me' }, ab),
            mk('gainToken', { n: 3, kind: 'att', who: 'me' }, ab),
        ]);
        put(cu('Отметка Кхорна'), [
            mk('destroy', { n: 1, pick: true, who: 'foe', routed: true, chooser: 'foe',
                avoid: { n: 1, kind: 'def' } }, ab),
        ]);
        put(cg('Отметка Слаанеш'), [
            mk('gainDie', { n: 1, kind: 'any', who: 'me' }, ab),
            mk('route', { n: 1, pick: true, who: 'foe', chooser: 'foe',
                cond: { cubeMore: 'morale' } }, ab),
        ]);
        put(cu('Отметка Слаанеш'), [
            mk('placeUnit', { n: 1, what: 'Культисты', pick: true, free: true,
                dest: 'combatWorld', cond: { foeRouted: 1 }, who: 'me' }, ab),
        ]);
        put(cg('Отметка Тзинча'), [
            mk('gainDie', { n: 1, kind: 'morale', who: 'me' }, ab),
            mk('replaceUnit', { n: 1, pick: true, filter: { contains: ['культист'] },
                to: 'Космодесант Хаоса', cond: { cubeMore: 'morale' }, who: 'me' }, ab),
        ]);
        put(cu('Отметка Тзинча'), [
            mk('spendDie', { n: 2, kind: 'morale', pick: true, any: true, all: false, who: 'me' }, ab),
            mk('choice', { text: ab, per: 'spent', perKind: 'morale', who: 'me', options: [
                sub('gainDie', { n: 1, kind: 'att', who: 'me' }, ab),
                sub('gainDie', { n: 1, kind: 'def', who: 'me' }, ab),
            ] }, ab),
        ]);
        put(cg('Отметка Нургла'), [
            mk('spendDie', { n: 1, kind: 'def', kinds: ['def', 'morale'],
                pick: true, any: false, all: false, who: 'me' }, ab),
            mk('gainToken', { n: 3, kind: 'def', who: 'me' }, ab),
        ]);
        put(cu('Отметка Нургла'), [
            mk('foeAllow', {
                text: 'выбрать и уничтожить один свой деморализованный отряд', who: 'foe',
                yes: [sub('destroy', { n: 1, pick: true, who: 'foe', routed: true,
                    chooser: 'foe' }, ab)],
                no: [sub('gainToken', { n: 2, kind: 'def', who: 'me' }, ab)],
            }, ab),
        ]);
        put(cg('Объединённый Хаос'), [
            mk('foeAllow', {
                text: 'выбрать и деморализовать любой 1 свой отряд', who: 'foe',
                yes: [sub('route', { n: 1, pick: true, who: 'foe', chooser: 'foe' }, ab)],
                no: [sub('sequence', { steps: [
                    sub('choice', { who: 'me', text: ab, options: [
                        sub('gainDie', { n: 1, kind: 'att', who: 'me' }, ab),
                        sub('gainDie', { n: 1, kind: 'def', who: 'me' }, ab),
                        sub('gainDie', { n: 1, kind: 'morale', who: 'me' }, ab),
                    ] }, ab),
                ] }, ab)],
            }, ab),
        ]);
        put(cu('Объединённый Хаос'), [
            mk('moveUnit', { n: 1, pick: true, who: 'me', allBoard: true, areaType: 'world',
                maxKlFromCultists: true, dest: 'combatWorld' }, ab),
        ]);
        put(cg('Нечеловеческая сила'), [
            mk('choice', { text: ab, who: 'me', options: [
                sub('gainDie', { n: 1, kind: 'att', who: 'me' }, ab),
                sub('gainDie', { n: 1, kind: 'def', who: 'me' }, ab),
            ] }, ab),
        ]);
        put(cu('Нечеловеческая сила'), [
            mk('destroy', { n: 1, pick: true, who: 'me', chooser: 'me',
                then: [sub('gainToken', { n: 4, kind: 'att', who: 'me' }, ab)] }, ab),
        ]);
        put(cg('Демоническая гибкость'), [
            mk('choice', { text: ab, who: 'me', options: [
                sub('gainDie', { n: 1, kind: 'def', who: 'me' }, ab),
                sub('gainDie', { n: 1, kind: 'morale', who: 'me' }, ab),
            ] }, ab),
        ]);
        put(cu('Демоническая гибкость'), [
            mk('foeAllow', {
                text: 'выбрать и уничтожить 1 из своих отрядов', who: 'foe',
                yes: [sub('destroy', { n: 1, pick: true, who: 'foe', chooser: 'foe' }, ab)],
                no: [sub('gainToken', { n: 4, kind: 'def', who: 'me' }, ab)],
            }, ab),
        ]);
        put(cg('Смерть и отчаяние'), [
            mk('choice', { text: ab, who: 'me', options: [
                sub('gainDie', { n: 2, kind: 'att', who: 'me' }, ab),
                sub('gainDie', { n: 2, kind: 'def', who: 'me' }, ab),
            ] }, ab),
            mk('spendDie', { n: 99, kind: 'morale', pick: true, any: true, all: false, who: 'me' }, ab),
            mk('destroy', { n: 1, per: 'spent', perKind: 'morale', maxKl: 0,
                pick: true, who: 'any' }, ab),
        ]);
        put(cu('Смерть и отчаяние'), [
            mk('destroy', { n: 1, pick: true, who: 'foe', routed: true,
                cond: { cubeMore: 'morale' }, chooser: 'me' }, ab),
        ]);
        put(cg('Хаос всепобеждающий'), [
            mk('gainDie', { n: 2, kind: 'any', who: 'me' }, ab),
            mk('route', { n: 1, all: true, pick: true, who: 'foe', maxKl: 0,
                chooser: 'me', cond: { cubeMore: 'morale' } }, ab),
        ]);
        put(cu('Хаос всепобеждающий'), [
            mk('route', { n: 1, pick: true, who: 'foe', chooser: 'me' }, ab),
        ]);

        // --- 05-order-upgrades.md -------------------------------------------
        put(ot('Расположение темных богов'), [
            mk('strategizeDeckBonus', { n: 2, who: 'me' }, ab),
            mk('once', {}, ab),
        ]);
        put(ot('Сквозь варп'), [
            mk('shipsThroughStorms', { who: 'me' }, ab),
            mk('once', {}, ab),
        ]);
        put(ot('Полное разрушение'), [
            mk('ignoreBastion', { who: 'me' }, ab),
            mk('strikePay', { n: 2, kind: 'def', who: 'me' }, ab),
            mk('strikeReward', { destroyOne: true, who: 'me' }, ab),
            mk('once', {}, ab),
        ]);
        put(ot('Страх с небес'), [
            mk('gainDie', { n: 1, kind: 'any', who: 'me' }, ab),
            mk('strikePay', { n: 1, kind: 'morale', who: 'me' }, ab),
            mk('strikeReward', { routeDamaged: true, who: 'me' }, ab),
            mk('once', {}, ab),
        ]);
        put(ot('Ужасный ритуал'), [
            mk('orderDiscount', { n: 1, per: 'cultist', who: 'me' }, ab),
            mk('placeUnit', { n: 1, pick: true, buy: true, maxKl: 2,
                bypassCommandLevel: true, discount: true,
                dest: 'friendlyAreaActive', who: 'me' }, ab),
            mk('once', {}, ab),
        ]);

        // --- 06-events.md ---------------------------------------------------
        put(et('Задетый варпом'), [
            mk('destroy', { n: 1, pick: true, who: 'me', chooser: 'me', allBoard: true,
                filter: { contains: ['культист'] }, recordSystem: true,
                then: [sub('buyAnyUpgrade', { systemFrom: 'destroy',
                    maxKlFromStorms: true, who: 'me' }, ab)] }, ab),
        ]);
        put(et('Пророчества и знамения'), [
            mk('choice', { text: ab, who: 'me', options: [
                sub('sequence', { steps: [
                    sub('placeUnit', { n: 2, what: 'Культисты', pick: true, free: true,
                        dest: 'friendlyWorldNoCultistsSystem', who: 'me' }, ab),
                ] }, ab),
                sub('sequence', { steps: [
                    sub('placeUnit', { n: 1, what: 'Культисты', pick: true, free: true,
                        dest: 'friendlyWorldsAny', who: 'me' }, ab),
                ] }, ab),
            ] }, ab),
        ]);
        put(et('Инкарнация Тзинча'), [
            mk('drawEvents', { n: 3, who: 'me' }, ab),
            mk('chooseEventAbility', { who: 'me' }, ab),
        ]);
        put(et('Прикосновение варпа'), [
            mk('scheme', { who: 'me' }, ab),
            mk('trigger', {
                trigger: 'order', orderType: 'advance', who: 'me', note: false, defer: false,
                text: ab, steps: [
                    sub('choice', { text: ab, who: 'me', options: [
                        sub('unitsThroughStorms', { who: 'me' }, ab),
                        sub('combatStartMorale', { n: 1, who: 'me' }, ab),
                        sub('sequence', { steps: [
                            sub('unitsThroughStorms', { who: 'me' }, ab),
                            sub('combatStartMorale', { n: 1, who: 'me' }, ab),
                        ] }, ab),
                    ] }, ab),
                ],
            }, ab),
        ]);
        put(et('Совращённый Хаосом'), [
            mk('scheme', { who: 'me' }, ab),
            mk('trigger', {
                trigger: 'damage-end', who: 'me', note: false, defer: false, text: ab,
                steps: [sub('route', { n: 1, pick: true, who: 'foe', chooser: 'me' }, ab)],
            }, ab),
        ]);
        put(et('Отрава Нургла'), [
            mk('scheme', { who: 'me' }, ab),
            mk('trigger', {
                trigger: 'operations', insteadOfOrder: true, who: 'me',
                note: false, defer: false, text: ab,
                steps: [sub('route', { n: 1, pick: true, who: 'foe', chooser: 'me',
                    sameSystemMine: true }, ab)],
            }, ab),
        ]);
        put(et('Молящийся тёмным богам'), [
            mk('scheme', { who: 'me' }, ab),
            mk('trigger', {
                trigger: 'storm', who: 'me', note: false, defer: false, text: ab,
                steps: [sub('stormReaction', { who: 'me' }, ab)],
            }, ab),
        ]);
        put(et('Военные трофеи'), [
            mk('gainAsset', { n: 1, kind: 'forge', who: 'me' }, ab),
            mk('gainAsset', { n: 1, kind: 'reinforcement', who: 'me' }, ab),
        ]);

        void combat; void order; void event;
        return T[s] || null;
    },

    // The text of a card -> the steps of the game.
    // ctx: {faction, kind: 'combat'|'event'|'order'|'ability'}
    parse(text, ctx) {
        // The Chaos cards are keyed by their printed text as well: a broad rule
        // of another faction must not claim one of their sentences.
        const chaos = this.chaosCard(text, ctx || {});
        if (chaos) return chaos;
        // The Tau cards have their own exact reading: no wide rule of another
        // faction may turn one of their sentences into a parked note.
        const tau = this.tauCard(text, ctx || {});
        if (tau) return tau;
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
        // «Требуются «Камери размножения»» («Мицетические споры»): the name in
        // quotes is ANOTHER order upgrade the player must have bought, just
        // like «Нужно быть главным по машинам» («Святой трубопровод»). The
        // requisite stands at the end of the card text, but it must forbid
        // the WHOLE card, so its step is moved in front of all the abilities.
        if (/требуются\s*«/i.test(String(text || ''))) {
            const at = built.findIndex(x => x && x.op === 'require' && x.what === 'upgrade'
                && /требую/i.test(String(x.ability || '')));
            if (at > 0) built.unshift(built.splice(at, 1)[0]);
        }
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
            // «если противник позволяет, то получите 2 `def. token`. Если нет,
            // то получите 2 `att. token` в следующем раунде боя.» («Крылатый
            // ужас»): the second sentence is the branch of his refusal.
            const mElse = /^если нет,?\s*(?:то\s+)?/i.exec(sentence);
            if (mElse && prev && prev.op === 'foeAllow') {
                const inner = this.parse(sentence.slice(mElse[0].length).trim().replace(/\.+$/, '') + '.', ctx || {});
                prev.no = (prev.no || []).concat(inner);
                continue;
            }
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
                    one.per = perCube.per || 'cube';
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
            // «… чтобы получить 2 `def. token` в этом и следующем раундах»
            // («Выводок воинов»): the tokens of this round survive its end, so
            // the next round is played with them as well.
            if (/в\s+этом\s+и\s+следующем\s+раунд/i.test(sentence)) {
                for (const one of parsed) {
                    if (one && one.op === 'gainToken' && (one.kind === 'att' || one.kind === 'def')
                        && !parsed.some(x => x && x.op === 'keepTokens' && x.kind === one.kind)) {
                        steps.push({ op: 'keepTokens', kind: one.kind, ability: sentence });
                    }
                }
            }
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
        PhasePlan.of(order).set('guardDeploy');
        const scope = DeployScope.of(order);
        scope.setFactory(factory.system, factory.pos);
        // «Купите минимум 2 отряда одного типа по цене на 1 меньше обычного»
        OrderDeal.of(order).addUnitDiscount(1);
        // «2 Гвардейца могут быть куплены за 1 жетон запасов»
        OrderDeal.of(order).setSupplyDeal(2, 'Гвардейца');
        // «Они должны быть развернуты в мире, который их произвёл»
        DeployLimits.of(order).setInFactoryWorld();
        // «минимум 2 одного типа» — the first purchase locks the type.
        scope.unlock();
        // The ability is not over: the factory is still producing.
        OrderTally.of(order).setFinishesAfterEffect(false);
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
            'тираниды': [
                { op: 'gainAsset', kind: 'any', n: 1, who: 'me',
                  ability: 'получить 1 жетон ресурса любого типа в дополнение к жетонам, полученным этим приказом доминирования' },
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
        const s = String(sentence || '').replace(/^\s+/, '');
        const m = /^за каждый имеющийся у вас\s+`([^`]+cube)`([^]*)$/i.exec(s);
        if (m) return { per: 'cube', perKind: this.icon(m[1]), rest: m[2].replace(/^[\s,:]+/, '') };
        // «За каждый потраченный `morale cube` Вы получаете либо 1 `att. cube`,
        // либо 1 `def. cube`» («Величие роя»), «За каждый `morale cube`,
        // который вы потратили, получите …» («Прорвать фронт»): the count is
        // the payment the sentence before has just made.
        const sp = /^за кажд[а-яёa-z]*\s+(?:потраченн[а-яёa-z]*|израсходованн[а-яёa-z]*)\s+`([^`]+cube)`([^]*)$/i.exec(s)
            || /^за кажд[а-яёa-z]*\s+`([^`]+cube)`,?\s+котор[а-яёa-z]*\s+вы\s+потрат[а-яёa-z]*,?([^]*)$/i.exec(s);
        if (sp) return { per: 'spent', perKind: this.icon(sp[1]), rest: sp[2].replace(/^[\s,:]+/, '') };
        return null;
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
    // «Удалите 1 `morale cube`, чтобы получить 3 `def. token`» («Шустрое
    // судно»), «удалите 1 `def. cube`, чтобы получить 2 `att. token`»
    // («Геройское самосожжение») — the cube is the price of the effect that
    // follows «чтобы». The payment comes first: a step that cannot be paid
    // stops the sentence, so the reward is not given for free.
    removeToReward(s, ctx) {
        const m = /^(?:вы\s+можете\s+)?удал[а-яёa-z]*\s+(\d+|один|одно|одну)?\s*`([^`]+cube)`,?\s*(?:чтобы|для того, чтобы)\s+([\s\S]+)$/i.exec(String(s || '').trim());
        if (!m) return null;
        const body = String(m[3] || '').trim();
        const rest = this.parseSentence(body, ctx || {});
        const spend = { op: 'spendDie', n: num(m[1]), kind: this.icon(m[2]), all: false, pick: true, who: 'me' };
        return [spend].concat(rest);
    },

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
        // «Уничтожьте одного недеморализованного Пожирателя в этой системе»
        // («Дождь из спор»): the victim may stand in any area of the system of
        // the battle, not only in the contested one.
        if (/\sв этой системе/i.test(what)) steps[0].systemWide = true;
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
        // «получите 2 `def. token`, если оппонент не удалит 1 `def. cube`»
        // («Лютая бионика») — the gain happens unless the opponent removes the
        // cube: the payment is offered to him first, and only his refusal gives
        // the tokens to the owner of the card.
        const mUnless = /получ[а-яёa-z]*\s+(\d+|два|две|один|одно)?\s*`([^`]+token)`,?\s*если\s+(?:ваш\s+)?(?:оппонент|противник)\s+не\s+удал[а-яёa-z]*\s+(\d+|один|одно)?\s*`([^`]+cube)`/i.exec(s);
        if (mUnless) {
            return [{
                op: 'gainToken', n: num(mUnless[1]), kind: this.icon(mUnless[2]), who: 'me',
                avoid: { n: num(mUnless[3]), kind: this.icon(mUnless[4]), by: 'foe' },
            }];
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
        // «за каждого недеморализованного Воина или Корабля-Улья потратьте
        // 1 кубик, чтобы получить 1 `att. cube`, 1 `morale cube` либо 1 `def.
        // cube`» («Выводок воинов», другая редакция): the payment and the gain
        // are counted by the units, and the либо below would tear the
        // enumeration of the three cubes apart — so the sentence is read here.
        const mPerSpend = /^за кажд[а-яёa-z]*\s+(?:ваш[а-яёa-z]*\s+)?недеморализованн[а-яёa-z]*\s+([^.;]{2,70}?)\s+потрат[а-яёa-z]*\s+(?:(\d+)|один|1)\s+куб[а-яёa-z]*,?\s*чтобы\s+получ[а-яёa-z]*\s+([\s\S]+)$/i.exec(s);
        if (mPerSpend) {
            const gains = [];
            const reGain = /(\d+|один|одно)?\s*`([^`]+cube)`/g;
            let g;
            while ((g = reGain.exec(mPerSpend[3]))) gains.push({ n: num(g[1]), kind: this.icon(g[2]) });
            if (gains.length >= 2) {
                const faction = this.factionOf(ctx);
                const names = this.unitNames(mPerSpend[1], faction);
                const filter = names.length ? { types: names } : (unitFilter(mPerSpend[1]) || typeFilter(mPerSpend[1]));
                return [
                    {
                        op: 'spendDie', n: num(mPerSpend[2]), kind: 'any', per: 'unit',
                        filter: filter, inBattle: true, pick: true, who: 'me',
                    },
                    {
                        op: 'choice', per: 'unit', filter: filter, inBattle: true, text: mPerSpend[3].trim(),
                        options: gains.map(x => ({ op: 'gainDie', n: x.n, kind: x.kind, who: 'me' })),
                    },
                ];
            }
        }
        // «Ваш противник выполняет 3 раза: либо деморализует отряд, либо теряет
        // 1 `any cube` на свой выбор» («Подавляющее присутствие»): the opponent
        // makes the same choice N times and the engine asks him every time. The
        // либо below would read the sentence as ONE choice of three, so it is
        // taken apart here first.
        const mTimes = /^(?:ваш\s+)?противник\s+выполняет\s+(\d+|два|три)\s+раза?\s*:\s*(?:либо\s+)?([\s\S]+?)\s*,?\s+либо\s+([\s\S]+)$/i.exec(s);
        if (mTimes) {
            const branch = text => {
                const t = String(text || '').trim().replace(/[.,;\s]+$/, '');
                if (/деморализ[а-яёa-z]*\s+(?:отряд|юнит|корабл)/i.test(t)) {
                    return [{ op: 'route', n: 1, pick: true, who: 'foe' }];
                }
                const lose = /теряет\s+(\d+|один|одно|одну)?\s*`([^`]+cube)`/i.exec(t);
                if (lose) {
                    return [{ op: 'loseDie', n: num(lose[1]), kind: this.icon(lose[2]), pick: true, who: 'foe' }];
                }
                const inner = this.parseSentence(t + '.', ctx);
                for (const one of inner) if (one && one.who === 'me') one.who = 'foe';
                return inner;
            };
            const a = branch(mTimes[2]);
            const b = branch(mTimes[3]);
            if (a.length && b.length) {
                const times = /два/.test(mTimes[1]) ? 2 : (/три/.test(mTimes[1]) ? 3 : (Number(mTimes[1]) || 1));
                const pick = () => ({
                    op: 'choice', who: 'foe', text: s,
                    options: [a.length === 1 ? a[0] : { op: 'sequence', steps: a },
                              b.length === 1 ? b[0] : { op: 'sequence', steps: b }],
                });
                const out = [];
                for (let i = 0; i < times; i++) out.push(JSON.parse(JSON.stringify(pick())));
                return out;
            }
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
        // «вы можете уничтожить любые ваши отряды или постройки в одном мире
        // активной системы, чтобы временно получить материалы, равные их
        // стоимости» («Капиллярные башни»): the engine destroys both and counts
        // their price.
        if (/уничтож[а-яёa-z]*\s+люб[а-яёa-z]*\s+ваш[а-яёa-z]*\s+отряд[а-яёa-z]*\s+или\s+постройк[а-яёa-z]*/i.test(s)
            && /временно\s+получ[а-яёa-z]*\s+материал[а-яёa-z]*/i.test(s)) {
            return [{ op: 'destroyForMateriel', ofSystem: 'active', who: 'me' }];
        }
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
        // «Удалите 1 `morale cube`, чтобы …» — the cube pays for the effect.
        const rm = this.removeToReward(s, ctx);
        if (rm) return rm;
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
            // «… в эту область, либо …» — a noun that happens to end in «-ть»
            // («область», «мощность») is not an open verb: the branches of such
            // a sentence are complete and the head is not repeated.
            const needsHead = /(?:ть|сте|ете|ите|йте)$/i.test(tail) && !/(?:ость|сть)$/i.test(tail);
            if (needsHead) {
                // The head is the shared prefix of every branch («За каждый
                // потраченный `morale cube` Вы получаете либо …»), so it is not
                // an alternative on its own: it is glued to the branches and
                // disappears from the list («Величие роя»).
                either = either.slice(1).map(part => headText + ' ' + part);
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
                // The branch is a sentence of its own. The enumeration of the
                // icons is read first: «…либо получите 1 `def. token` или
                // 1 `att. token`» («Техножрецы») is the choice of the two icons,
                // not one of them.
                let steps = this.dieEnum(branch, ctx);
                if (!steps) steps = this.parseSentence(branch, ctx);
                // A branch that yields nothing (the dangling head of the shared
                // prefix) is not an option either.
                if (!steps.length) continue;
                // A branch that is itself a choice opens into the choice of the
                // sentence: the card offers its alternatives as one list.
                if (steps.length === 1 && steps[0] && steps[0].op === 'choice') steps = steps[0].options || [];
                for (const step of steps) if (step && !step.ability) step.ability = branch;
                // A branch that pays for its own effect is one alternative:
                // «уничтожьте 2 Гаунта, чтобы разместить бастион» («Роящие
                // организмы») is the price and its reward together. A branch
                // that only lists effects («заменить 1 Скитария на 1 Катафрона,
                // 1 Катафрона на 1 Онагра», «Мехаморфоз») stays a list of them.
                if (steps.length > 1 && /(?:чтобы|для того, чтобы)\s/i.test(branch)) {
                    options.push({ op: 'sequence', steps, ability: branch });
                } else {
                    for (const step of steps) options.push(step);
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
            if (res && res.replace) {
                // The step opens into steps of its own («Некромеханика» activates
                // the cards it has just taken): they take its place in the list.
                list.splice(index, 1, ...(res.replace || []));
                continue;
            }
            this.spreadCount(list, index, step);
            this.thenSteps(list, index, step);
            index++;
        }
        state.pending = null;
        // The combat goes on with the step that waited for the effect. The step
        // machine then passes the steps that have nothing to do (a closed card of
        // the other side, a damage of zero).
        const turn = CombatTurn.of(state.combat);
        if (c.kind === 'combat' && turn && turn.release()) {
            if (typeof R.advanceCombatSteps === 'function') R.advanceCombatSteps(state);
        }
        // The moments a battle waits for: «Критический удар» resumes the step it
        // interrupted, «Совращённый Хаосом» runs the tail of the damage step again.
        const hooks = CombatHooks.of(state.combat);
        if (c.kind === 'combat' && hooks && hooks.damageResume
            && typeof R.resumeDamage === 'function') {
            R.resumeDamage(state);
        }
        if (c.kind === 'combat' && hooks && hooks.endResume && !state.pending) {
            hooks.takeEndResume();
            if (typeof R.endDamageStep === 'function') R.endDamageStep(state);
        }
        // «Страх с небес» routes one damaged unit after the strike: the order
        // finishes only when that last question has been answered.
        if (c.kind === 'order' && state.order && StrikePlan.of(state.order).finishesAfterQuestion
            && !state.pending) {
            StrikePlan.of(state.order).finishAfterQuestion(false);
            R.finishOrder(state, seat);
        }
        // The order of the ability is over when the effect is done.
        const tally = OrderTally.of(state.order);
        if (c.kind === 'ability' && tally && tally.finishesAfterEffect) {
            tally.finishAfterEffect();
            R.finishOrder(state, seat);
        }
        // The reinforce step waited for the scheme of its end («Зов астропатов»):
        // the step is closed now.
        if (c.kind === 'combat' && state.combat && CombatTokens.of(state.combat).pending
            && typeof R.finishReinforce === 'function') {
            const pend = CombatTokens.of(state.combat).takePending();
            R.finishReinforce(state, pend);
        }
        // The upgrade of the preparation step waited for the scheme of the start
        // of the combat («Сервочерепа-стражи»): its question is asked now.
        if (c.kind === 'combat' && hooks && hooks.prepQueued
            && typeof R.prepEffects === 'function' && !state.pending) {
            hooks.takePrepQueued();
            R.prepEffects(state, CombatSides.seatOf(state.combat, 'attacker'));
        }
        // The scheme of «the start of a round of combat» waited for the question
        // of the start of the combat: it is asked now.
        if (c.kind === 'combat' && hooks && hooks.roundQueued) {
            hooks.takeRoundQueued();
            if (typeof R.maybeScheme === 'function' && !state.pending) {
                R.maybeScheme(state, CombatSides.seatOf(state.combat, 'attacker'), 'round', { kind: 'combat', ctx: { side: 'attacker' } });
            }
        }
        // The orbital strike waited for the choice of «Набега жнецов»: the strike
        // goes on with the chosen unit first.
        if (c.kind === 'order' && state.order && StrikePlan.of(state.order).planned
            && typeof R.resumeStrike === 'function') {
            R.resumeStrike(state, seat);
        }
        // A Quick Response whose system was refused (or whose question had no
        // systems) never became a limited advance: the event phase goes on.
        if (c.kind === 'event' && state.quickResponsePending
            && !(state.order && OrderMove.of(state.order).fromEvent)
            && typeof R.nextEventPlayer === 'function') {
            state.quickResponsePending = false;
            delete state.quickResponseSnapshot;
            R.nextEventPlayer(state);
        }
        // «Отрава Нургла» takes the place of revealing an order (01-rules-
        // reference.md, «instead of revealing an order»): no token is revealed
        // or discarded, and the next player takes his turn. A refusal of the
        // scheme leaves the current player's turn untouched.
        if (c.ctx && c.ctx.operationScheme && state.operationSchemeAccepted
            && !state.pending) {
            delete state.operationSchemeAccepted;
            if (typeof R.nextTurn === 'function') R.nextTurn(state);
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
            const cctx0 = (pending.ctx && pending.ctx.ctx) || null;
            if (!scheme) {
                // «Молящийся тёмным богам»: when the reaction is refused the
                // opponent's original Warp Storm movement still happens.
                if (cctx0 && cctx0.stormReaction
                    && typeof R.finishStormReaction === 'function') {
                    R.finishStormReaction(state, cctx0.stormReaction, null);
                }
                return this.next(R, state, pending);
            }
            const p = state.players[pending.seat];
            p.schemes = (p.schemes || []).filter(s => s !== scheme);
            R.log(state, pending.seat, p.name + ' сбрасывает план «' + scheme.name + '».');
            const list = scheme.steps || [];
            const kind = (pending.ctx && pending.ctx.kind) || 'event';
            if (cctx0 && cctx0.operationScheme) state.operationSchemeAccepted = true;
            state.pending = null;
            if (!list.length) {
                // A scheme whose effect is only its printed text still takes
                // the turn when it replaces the reveal of an order.
                if (cctx0 && cctx0.operationScheme && state.operationSchemeAccepted) {
                    delete state.operationSchemeAccepted;
                    if (typeof R.nextTurn === 'function') R.nextTurn(state);
                }
                return { ok: true, done: true };
            }
            return this.run(R, state, pending.seat, list, { kind, ctx: cctx0 }, 0);
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
                return this.retarget(pending, q.question);
            }
            // The step ran from here, not from the chain: the steps it added
            // (the repeated ability of a card, «Почитание духа машины») are
            // spliced in before the chain goes on.
            this.spreadCount(pending.steps, pending.index, step);
            this.thenSteps(pending.steps, pending.index, step);
            return this.next(R, state, pending);
        }
        // The payment that avoids the effect.
        if (question.op === 'avoid') {
            const paid = (answer.dice || []).length > 0;
            if (paid) {
                const combat = state.combat;
                const s2 = CombatSides.sideOf(combat, seat);
                const turn = CombatTurn.of(combat);
                for (const i of (answer.dice || [])) {
                    if (turn.has(s2, i)) turn.take(s2, i);
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
                    return this.retarget(pending, q.question);
                }
            }
            return this.next(R, state, pending);
        }
        // The effect belongs to the owner of the card even when the question was
        // asked of the opponent («Ваш противник выполняет 3 раза: либо
        // деморализует отряд, либо теряет 1 `any cube`», «Подавляющее
        // присутствие»): the answerer only answers, «me» stays the owner.
        const res = this.apply(R, state, pending.seat, step, merged, ctx);
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
            return this.retarget(pending, res.question);
        }
        // The step is done — the rest of the steps go on.
        this.spreadCount(pending.steps, pending.index, step);
        this.thenSteps(pending.steps, pending.index, step);
        return this.next(R, state, pending);
    },

    // A step may hand its question to another player — the opponent who decides
    // whether to pay for the effect («… если оппонент не удалит 1 `def. cube`»)
    // or who chooses his own dice. The seat that answers follows the question,
    // otherwise the owner of the card would answer for his opponent.
    retarget(pending, question) {
        pending.question = question;
        if (question && question.who !== undefined) pending.answerSeat = question.who;
        return { ok: true, pending: true };
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
        return CombatSides.seatOf(combat, side);
    },

    // Which side's dice a step points at: the resolving player's own by
    // default, the opponent's for an effect text that says so.
    diceSideOf(combat, side, step) {
        if (!combat) return side;
        if (step && step.who === 'foe') return CombatSides.foe(side);
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
        if (cond.unitLess) {
            if (!inCombat) return false;
            const field = BattleField.of(combat);
            const mine = field.units(state, seat).filter(u => !u.routed).length;
            const theirs = field.unitsHere(state).filter(u => u.seat !== seat && !u.routed).length;
            return mine < theirs;
        }
        if (cond.noRetreat) {
            if (!inCombat) return true;
            return !CombatPlans.of(combat).retreatedThisRound(seat, CombatTurn.of(combat).round);
        }
        if (cond.side) {
            if (!inCombat) return false;
            const mine = CombatSides.sideOf(combat, seat) === 'attacker' ? 'attack' : 'defense';
            return mine === cond.side;
        }
        if (cond.cubeLess) {
            if (!inCombat) return false;
            const s2 = CombatSides.sideOf(combat, seat);
            const o2 = CombatSides.foe(CombatSides.sideOf(combat, seat));
            const mine = CombatTurn.of(combat).count(s2, cond.cubeLess);
            const theirs = CombatTurn.of(combat).count(o2, cond.cubeLess);
            return mine < theirs;
        }
        if (cond.cubeMore) {
            if (!inCombat) return false;
            const s2 = CombatSides.sideOf(combat, seat);
            const o2 = CombatSides.foe(CombatSides.sideOf(combat, seat));
            const mine = CombatTurn.of(combat).count(s2, cond.cubeMore);
            const theirs = CombatTurn.of(combat).count(o2, cond.cubeMore);
            return mine > theirs;
        }
        if (cond.foeRouted) {
            const n = cond.foeRouted;
            const foeSide = inCombat ? CombatSides.foeSeat(combat, seat) : null;
            const list = inCombat
                ? BattleField.of(combat).routed(state, foeSide)
                : state.units.filter(u => u.routed && u.seat !== seat);
            return list.length >= n;
        }
        if (cond.unitMore) {
            if (!inCombat) return false;
            // The command level may be 0: «отрядов с командным уровнем 0» is a
            // filter, not the absence of one.
            const kl = cond.kl === null || cond.kl === undefined ? null : cond.kl;
            const fit = u => kl === null || (R.unitOf(state, u) && (R.unitOf(state, u).kl || 0) === kl);
            const field = BattleField.of(combat);
            const mine = field.units(state, seat).filter(u => !u.routed && fit(u)).length;
            const theirs = field.unitsHere(state).filter(u => u.seat !== seat && !u.routed && fit(u)).length;
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
    // «Получите 1 `att. cube`, 1 `def. cube` или 1 `morale cube`.» — the choice
    // of a single die. The list may hold the combat tokens as well («получите
    // 1 `morale cube`, 2 `att. token` или 2 `def. token`», «Скитарии-
    // инфильтраторы»): every icon of the list is one alternative of the choice,
    // each with its own number and its own kind of piece.
    dieEnum(sentence, ctx) {
        const s = sentence.replace(/^\s+/, '');
        if (!/^получ[а-яёa-z]+/i.test(s) || !/(или|либо)/i.test(s)) return null;
        // «… за каждый потраченный `morale cube`» — the tail names what the gain
        // is counted by, not one more alternative of the choice.
        const cut = s.search(/\s+за кажд/i);
        const head = cut > 0 ? s.slice(0, cut) : s;
        // Every icon keeps its own number: «Получите 2 `att. cube` или 2 `def. cube`»
        // is two dice of the chosen kind, not one.
        const list = [...head.matchAll(/(\d+|два|две|одно|один)?\s*`([^`]+)`/g)]
            .map(m => ({ n: m[1] ? num(m[1]) : 1, kind: this.icon(m[2]), type: this.iconKind(m[2]) }))
            .filter(x => x.type === 'cube' || x.type === 'token');
        if (list.length < 2) return null;
        return [{
            op: 'choice', text: s,
            options: list.map(x => ({
                op: x.type === 'token' ? 'gainToken' : 'gainDie',
                n: x.n, kind: x.kind, who: 'me', ability: s,
            })),
        }];
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

    // The worlds where the structure of the step may stand. A card that names
    // its world («в этом мире») is not bound to the Deploy Order rule that a
    // structure is bought onto a friendly world: «A structure can only be
    // placed on a world. A player cannot build a structure on a world that
    // already contains a structure unless an ability specifically allows it.»
    structureAreas(R, state, seat, step) {
        // «…в дружественном мире, где уже есть 1 ваша постройка другого типа»
        // («Певцы психокости»): the card is the permission to build on an
        // occupied world — the rule is asked once, with that permission.
        const permission = step && step.onOccupied === 'otherType' ? 'otherType' : null;
        const raw = permission
            ? this.areasFor(R, state, seat, 'structureAny')
            : (step && step.dest
                ? this.areasForAbility(R, state, seat, step.dest)
                : this.areasFor(R, state, seat, 'structure'));
        return (raw || []).filter(a => {
            // «если там ещё нет построек» — no structure of anybody stands there.
            if (step && step.noStructures) {
                return !R.hasStructure(state, a.system, a.pos);
            }
            return !R.canPlaceStructure
                || R.canPlaceStructure(state, seat, a.system, a.pos,
                    { allowOccupied: permission, kind: step && step.kind }).ok;
        });
    },

    abilityQuestion(step, ctx) {
        if (!step || !step.ability || step.op === 'note' || step.op === 'once'
            || step.op === 'scheme' || step.op === 'trigger' || step.noAbilityQuestion) return null;
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
        // the very first gate of the step. Everything else the questions need is
        // computed once in the frame (FSStepContext).
        if (step && step.cond && !this.condSatisfied(R, state, seat, step, ctx)) return null;
        // The question of the step belongs to its group (js/fs/effects/ask/*):
        // the frame is built once and handed over. A step with no question
        // changes nothing.
        const frame = new StepContext(R, state, seat, step, {}, ctx, this);
        const ask = ASK_EXECUTORS.get(step && step.op);
        if (!ask) return null;
        return ask(this, frame);
    },

    // The answer of the player is applied to the step.
    apply(R, state, seat, step, answer, ctx) {
        // Every step of a card is one method of one group (js/fs/effects/*): this
        // function only builds the frame of the step and hands it to the group
        // that owns the step. A step with no executor changes nothing.
        // The action looks at the side of the owner of the card: a card played
        // for the opponent acts from the owner's point of view.
        const owner = ctx && ctx.owner !== undefined ? ctx.owner : seat;
        const frame = new StepContext(R, state, seat, step, answer, ctx, this, owner);
        const exec = STEP_EXECUTORS.get(step && step.op);
        if (!exec) return null;
        return exec(this, frame);
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
        const n = step.free ? want : Math.min(want, R.player(state, seat).assetCount('reinforcement'));
        if (!n) return 0;
        if (!step.free) R.player(state, seat).payAsset('reinforcement', n);
        CombatTokens.of(combat).add(side, n, step.free);
        R.log(state, seat, p.name + ' размещает ' + n + ' жетон(ов) подкрепления'
            + (step.free ? ' бесплатно.' : '.'));
        return n;
    },

    // The price of an upgrade less the discount of the card: «на 1 за каждый
    // дружественный мир, в котором есть фабрика».
    upgradeDiscount(R, state, seat, step) {
        if (!step || !step.discount) return 0;
        // «уменьшив её стоимость … на 1 за каждый мир с вашей фабрикой» («Лингва
        // Технис»): the discount is counted by the worlds with a factory of the
        // player, not a flat number.
        // «уменьшив его стоимость на 1 за каждый Корабль-Улей» («Разведывательные
        // организмы»): the discount is counted by the units the card names.
        if (step.per === 'unit') {
            const one = Number(step.discount) || 1;
            return this.count(R, state, seat, Object.assign({}, step, { n: one }), null);
        }
        const byFactory = step.discount === 'factories' || step.per === 'yourFactory';
        if (!byFactory) return Number(step.discount) || 0;
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
        if (step.per === 'excess') {
            // «за каждый ваш `def. cube`, по счёту превышающий количество
            // вражеских `att. cube`, получите 1 `att. token` (вплоть до 4)»
            // («Месть духа машины»): only the cubes above the opponent's count
            // are paid out.
            const combat = state.combat;
            if (!combat) return 0;
            const mine = CombatSides.sideOf(combat, seat);
            const theirs = CombatSides.foe(mine);
            const turn = CombatTurn.of(combat);
            const my = turn.count(mine, step.myKind);
            const his = turn.count(theirs, step.foeKind);
            n = (step.n || 1) * Math.max(0, my - his);
            if (step.max) n = Math.min(n, step.max);
            return Math.max(0, n);
        }
        if (step.per === 'cube') {
            const combat = state.combat;
            if (combat) {
                const s2 = CombatSides.sideOf(combat, seat);
                n = (step.n || 1) * CombatTurn.of(combat).count(s2, step.perKind || 'morale');
                if (step.max) n = Math.min(n, step.max);
            } else {
                n = step.n || 1;
            }
            return Math.max(0, n);
        }
        if (step.per === 'excessUnits') {
            // «отнимите от их числа число недеморализованных отрядов противника»
            // («Синаптический контроль»): only the surplus is paid out.
            const combat = state.combat;
            if (!combat) return 0;
            const field = BattleField.of(combat);
            const mine = field.units(state, seat).filter(u => !u.routed).length;
            const his = field.unitsHere(state).filter(u => u.seat !== seat && !u.routed).length;
            n = (step.n || 1) * Math.max(0, mine - his);
            if (step.max) n = Math.min(n, step.max);
            return Math.max(0, n);
        }
        if (step.per === 'destroyedStep') {
            // «за каждый уничтоженный отряд» в конце шага нанесения повреждений
            // («Рой потрошителей»): the units that fell in this very step.
            const combat = state.combat;
            n = (step.n || 1) * (combat ? CombatPlans.of(combat).destroyedNow : 0);
            if (step.max) n = Math.min(n, step.max);
            return Math.max(0, n);
        }
        if (step.per === 'spentPairs') {
            // «За каждые 2 кубика, которые вы потратили, восстановите 1 …»
            // («Перегруппировка»): the restores are paid by whole pairs.
            const combat = state.combat;
            const pairs = combat ? CombatHooks.of(combat).spentPairs(step.perN) : 0;
            n = (step.n || 1) * pairs;
            if (step.max) n = Math.min(n, step.max);
            return Math.max(0, n);
        }
        if (step.per === 'spent') {
            // The cubes the payment of the same ability has just taken.
            const combat = state.combat;
            const spent = combat ? CombatHooks.of(combat).spentOf(step.perKind) : 0;
            n = (step.n || 1) * spent;
            if (step.max) n = Math.min(n, step.max);
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
            const field = inBattle ? BattleField.of(combat) : null;
            const units = state.units.filter(u => u.seat === seat && !u.routed
                && (!field || field.holds(u)));
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
                const side = CombatSides.sideOf(combat, seat);
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
        const s2 = CombatSides.sideOf(combat, seat);
        const dice = CombatTurn.of(combat).dice(s2);
        const fit = dice.map((d, i) => i).filter(i => step.avoid.kind === 'any' || dice[i] === step.avoid.kind);
        if (!fit.length) return null;
        return {
            question: {
                kind: 'yesno', who: seat, op: 'avoid', n: step.avoid.n, options: fit,
                kind2: step.avoid.kind, text: 'Избежать эффекта, потратив кубик?',
            },
        };
    },

    // «Командный уровень этой карты не может превышать числа варп-штормов,
    // которые находятся на границах этой системы» («Задетый варпом»). Two
    // records may name the same edge, so the canonical grid key is counted once.
    stormCapFor(R, state, systemId) {
        if (!systemId || !R.system || !R.system(state, systemId)) return 0;
        const borders = new Set(['N', 'E', 'S', 'W'].map(side =>
            R.gridKey(R.stormEdge(state, { system: systemId, side }))));
        const seen = new Set();
        for (const storm of state.storms || []) {
            const key = R.gridKey(R.stormEdge(state, storm));
            if (borders.has(key)) seen.add(key);
        }
        return seen.size;
    },

    // The number of the cubes of a kind on the table of the player.
    countCubes(R, state, seat, combat, kind) {
        if (!combat) return 0;
        const side = CombatSides.sideOf(combat, seat);
        let n = CombatTurn.of(combat).count(side, kind);
        if (kind === 'att' || kind === 'def') n += CombatCubes.of(combat).get(side, kind);
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
        if (step.allBoard) {
            // «Уничтожьте отряд культистов в любой системе»: the tactic is not
            // limited by the system of a battle that happens to be in progress.
            units = state.units.filter(u => u.seat === seat);
        } else if (combat) {
            // «Уничтожьте одного недеморализованного Пожирателя в этой системе»
            // («Дождь из спор»): the card names the system of the battle, so the
            // units of its other areas count too.
            const field = BattleField.of(combat);
            units = state.units.filter(u => u.seat === seat && u.system === field.system
                && (step.systemWide || u.area === field.pos));
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
                if (what === 'structure' || what === 'structureAny') {
                    if (!area.world) continue;
                    if (R.control(state, seat, sys.id, area.pos) !== 'friendly') continue;
                    // The occupied worlds are a question for canPlaceStructure,
                    // with the permission of the card in its hand.
                    if (what === 'structure' && R.hasStructure(state, sys.id, area.pos)) continue;
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
        // The friendly worlds of the ACTIVE system: the cards that say «in the
        // active system». The list itself is the board's (R.friendlyWorlds).
        const active = state.order ? OrderContext.of(state.order).system : null;
        return Board.of(state).friendlyWorlds(seat)
            .filter(a => !active || a.system === active)
            .map(a => ({ system: a.system, pos: a.pos }));
    },


    // «Получите ценные ресурсы и материалы этого мира» — the shared body of the
    // step: the materials, the tokens, and the question of the prosperity token.
    gainWorldAssetsBody(R, state, seat, step, area) {
        const p = state.players[seat];
        const sys = R.system(state, area.system);
        const a = R.area(sys, area.pos);
        if (!a || !a.world) return null;
        R.player(state, seat).gainMateriel(a.world.materiel || 0);
        let prosperity = 0;
        for (const asset of a.world.assets || []) {
            if (asset === 'prosperity') { prosperity++; continue; }
            // Всё, что даёт жетон, идёт через один счётчик игрока: предел
            // считается в одном месте (PlayerEntity.addAsset), а не здесь.
            R.player(state, seat).addAsset(asset, 1);
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
        return !!Board.of(state).area(systemId, pos)?.world;
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
        const active = state.order ? OrderContext.of(state.order).system : null;
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
        const active = state.order ? OrderContext.of(state.order).system : null;
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
                    // «в другом дружественном или никем не контролируемом мире
                    // в этой системе» («Тёмная вера»): not the contested area.
                    case 'friendlyOrUncontrolledOtherWorldCombatSystem': {
                        const c2 = state.combat;
                        ok = world && c2 && sys.id === c2.system && area.pos !== c2.pos
                            && (standing === 'friendly' || standing === 'uncontrolled');
                        break;
                    }
                    // «в этой области» («Соблазны Хаоса»): ground or void, the
                    // area of the battle decides which model can stand there.
                    case 'combatArea': {
                        const c2 = state.combat;
                        ok = !!c2 && sys.id === c2.system && area.pos === c2.pos;
                        break;
                    }
                    // «в дружественную область активной системы» («Ужасный
                    // ритуал»): controlled by this player, of any terrain.
                    case 'friendlyAreaActive':
                        ok = sys.id === active && standing === 'friendly';
                        break;
                    // «в 1 дружественном мире, в системе где ещё нет отрядов
                    // культистов» («Пророчества и знамения»).
                    case 'friendlyWorldNoCultistsSystem': {
                        const has = state.units.some(u => u.system === sys.id
                            && /культист/i.test((R.unitOf(state, u) || {}).name || ''));
                        ok = world && mine && !has;
                        break;
                    }
                    // A friendly world of the active system («в активной системе»).
                    case 'friendlyWorldActive':
                        ok = world && sys.id === active && mine;
                        break;
                    // A friendly or uncontrolled world of the active system
                    // («на любых дружественных или никем не контролируемых мирах
                    // в активной системе» — «Камери размножения»).
                    case 'friendlyOrUncontrolledWorldActive':
                        ok = world && sys.id === active
                            && (standing === 'friendly' || standing === 'uncontrolled');
                        break;
                    // The world the order acts on — the world the orbital strike
                    // is aimed at («разместите его в этом мире» — «Мицетические
                    // споры»), or the world of the battle.
                    case 'orderWorld': {
                        const w = state.order && StrikePlan.of(state.order).world;
                        const c2 = state.combat;
                        const sysId = w ? w.system : (c2 ? c2.system : null);
                        const pos = w ? w.pos : (c2 ? c2.pos : null);
                        ok = world && sysId !== null && sys.id === sysId && area.pos === pos;
                        break;
                    }
                    // A friendly world of the active system with a structure on it.
                    case 'friendlyWorldWithStructureActive':
                        ok = world && sys.id === active && mine
                            && R.hasStructure(state, sys.id, area.pos);
                        break;
                    // A friendly world with a factory on it, any system
                    // («в одном дружественном мире, содержащем фабрику»).
                    case 'friendlyWorldWithFactory':
                        ok = world && mine && R.structuresAt(state, sys.id, area.pos)
                            .some(st => st.seat === seat && st.type === 'factory');
                        break;
                    // The world with the factory of the order («в мире с этой
                    // фабрикой» — «Святой трубопровод»): the Dominate order is
                    // executed in the system of the factory, so the world is the
                    // friendly one of the active system that holds it.
                    case 'friendlyWorldWithFactoryActive':
                        ok = world && mine && sys.id === active && R.structuresAt(state, sys.id, area.pos)
                            .some(st => st.seat === seat && st.type === 'factory');
                        break;
                    // A friendly world with a structure on it, any system
                    // («разместить его в дружественном мире, содержащем постройку»).
                    case 'friendlyWorldWithStructure':
                        ok = world && mine && R.hasStructure(state, sys.id, area.pos);
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
                        ok = world && combat && BattleField.of(combat).is(sys.id, area.pos);
                        break;
                    }
                    case 'friendlyVoidActive':
                        ok = !world && sys.id === active && mine;
                        break;
                    // Any friendly void («Разместите 1 Пожирателя в любую
                    // дружественную пустоту» — «Флот-осколок»).
                    case 'friendlyVoidAny':
                        ok = !world && mine;
                        break;
                    // The friendly and the uncontrolled voids of the active
                    // system («Вы можете разместить их на дружественных и
                    // неконтролируемых пустотах в активной системе» —
                    // «Капиллярные башни»).
                    case 'friendlyOrUncontrolledVoidActive':
                        ok = !world && sys.id === active
                            && (standing === 'friendly' || standing === 'uncontrolled');
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
                return R.hasStructure(state, u.system, u.area);
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
        const active = state.order ? OrderContext.of(state.order).system : null;
        if (!active) return [];
        const systems = [active].concat(R.neighbors(state, active));
        const out = [];
        for (const sys of state.systems) {
            if (!systems.includes(sys.id)) continue;
            for (const area of sys.areas) {
                if (!area.world) continue;
                const standing = this.areaStanding(state, seat, sys.id, area.pos);
                if (standing !== 'friendly' && standing !== 'uncontrolled') continue;
                // The world without a structure, asked by the rule of the
                // structure, not counted here for the third time.
                const free = !R.canPlaceStructure
                    || R.canPlaceStructure(state, seat, sys.id, area.pos, { ignoreControl: true }).ok;
                if (!free) continue;
                out.push({ system: sys.id, pos: area.pos });
            }
        }
        return out;
    },

    // The friendly worlds of the player.
    friendlyWorlds(R, state, seat) {
        return Board.of(state).friendlyWorlds(seat).map(a => ({ system: a.system, pos: a.pos }));
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
        return ctx && ctx.faction ? FS_CATALOG.faction(ctx.faction) : null;
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
        return FS_CATALOG.sameName(a, b);
    },

    // The ceiling of ONE payment of an orbital strike: the cubes of the rolled
    // dice plus the cubes the cards gave, minus whatever earlier payments of
    // the same strike have already spent, and never more than the card allows
    // (2 per ship for «Мицетические споры», a flat 2 for «Разведка генокрадов»).
    // «… в той же или соседней системе, в другом дружественном мире, не
    // содержащим построек» («Эвакуация»): the worlds that may take the free
    // structure. The world the destroyed structure stood on is not «another».
    evacuateAreas(R, state, seat, systemId, sourceArea) {
        /** @type {any[]} */
        const out = [];
        const systems = [systemId].concat(R.neighbors ? R.neighbors(state, systemId) : []);
        for (const sid of systems) {
            const sys = R.system(state, sid);
            if (!sys) continue;
            for (const a of sys.areas) {
                if (!a.world || (sid === systemId && a.pos === sourceArea)) continue;
                if (R.control(state, seat, sid, a.pos) !== 'friendly') continue;
                // «…в другом дружественном мире, не содержащим построек».
                if (R.canPlaceStructure && !R.canPlaceStructure(state, seat, sid, a.pos).ok) continue;
                out.push({ system: sid, pos: a.pos });
            }
        }
        return out;
    },

    strikePayCap(plan, pay) {
        const pool = (plan && plan.pool) || [];
        const kind = (pay && pay.kind) || 'att';
        const have = kind === 'any'
            ? pool.filter(d => d !== null && d !== undefined).length
            : pool.filter(d => d === kind).length;
        const ceiling = ((pay && pay.n) || 1) * ((pay && pay.per) === 'ship' ? (plan.ships || 1) : 1);
        return Math.min(have, ceiling);
    },

    // The stem of the name: the first letters of the word. The endings of the
    // Russian plural differ: "бойзов", "бойзы" and "Бойзы" are the same unit.
    stem(word) {
        return FS_CATALOG.stem(word);
    },
};

// The area of the combat (the reinforcement goes there).
function combatArea(state, systemId, pos) {
    const field = BattleField.of(state.combat);
    return !!field && field.is(systemId, pos);
}

// The rules of the sentences. The first that matches wins.
/** @type {{re: RegExp, build: (m: RegExpExecArray, ctx: any, s: string) => any, noWhen?: boolean}[]} */
const RULES = [
    // «отнимите от их числа число недеморализованных отрядов противника и
    // получите 1 `att. token` или 1 `def. token` за каждую оставшуюся единицу»
    // («Синаптический контроль»): only the units above the opponent's count pay.
    {
        re: /отнимите от их числа число недеморализованных отрядов противника и получ[а-яёa-z]*\s+(\d+|один|одно)?\s*`([^`]+token)`\s+или\s+(\d+|один|одно)?\s*`([^`]+token)`\s+за каждую оставшуюся единицу/i,
        build: m => ({
            op: 'choice', text: m[0], per: 'excessUnits',
            options: [
                { op: 'gainToken', n: num(m[1]), kind: FS_EFFECTS.icon(m[2]), who: 'me' },
                { op: 'gainToken', n: num(m[3]), kind: FS_EFFECTS.icon(m[4]), who: 'me' },
            ],
        }),
    },
    // «Во время шага нанесения повреждений Вы назначаете урон отрядам и
    // бастионам противника» («Величие роя»): the damage the opponent suffers is
    // placed by the owner of the card, not by him.
    {
        re: /во время шага нанесения (?:повреждений|урона)[^.]*?(?:вы|владелец)[^.]*?назначает[а-яёa-z]*\s+урон[^.]*?противник[а-яёa-z]*/i,
        build: () => ({ op: 'assignDamage', who: 'me' }),
    },
    // «если противник позволяет, то получите 2 `def. token`» («Крылатый ужас»):
    // the opponent is asked first and his answer picks the branch. The branch of
    // the refusal is the sentence «Если нет, то …» that follows it.
    {
        re: /^если (?:противник|он|ваш противник) позволя[а-яёa-z]*,?\s*(?:то\s+)?([\s\S]+)$/i,
        build: (m, ctx) => {
            const yes = FS_EFFECTS.parseSentence(String(m[1]).trim().replace(/\.+$/, '') + '.', ctx || {});
            if (!yes.length) return null;
            return [{ op: 'foeAllow', yes, no: [], text: String(m[1]).trim() }];
        },
    },
    // «получите 2 `att. token` в следующем раунде боя» («Крылатый ужас»): the
    // tokens are taken from the supply when the next execution round begins.
    {
        re: /получ[а-яёa-z]*\s+(\d+|два|две|один|одно)?\s*`([^`]+token)`\s+в следующем раунде/i,
        // «За каждого вашего уничтоженного или деморализованного в этом раунде
        // юнита получите 1 `def. token` в следующем раунде боя» («Выводок
        // термаганов»): one token per lost unit of the round, not one token.
        build: (m, ctx, s) => {
            const step = { op: 'gainTokensLater', n: num(m[1]), kind: FS_EFFECTS.icon(m[2]) };
            if (/за кажд[а-яёa-z]*\s+(?:ваш[а-яёa-z]*\s+)?(?:уничтоженн|деморализован)/i.test(s || '')) step.per = 'lostRound';
            return step;
        },
    },
    // «в конце шага нанесения повреждений получите по 1 материалу за каждый
    // уничтоженный отряд, максимум 2» («Рой потрошителей»): the materiel comes
    // when the damage step is over, and only for the units that really fell.
    {
        re: /в конце шага нанесения (?:повреждений|урона)[^.]*?получ[а-яёa-z]*\s+(?:по\s+)?(\d+)?\s*(?:материал|материи)[^.]*?за каждый(?:ого)?\s+уничтоженн[а-яёa-z]*\s+(?:отряд|юнит)[а-яёa-z]*(?:,?\s*максимум\s+(\d+))?/i,
        build: m => ({
            op: 'deferDamage',
            steps: [{ op: 'gainMateriel', n: num(m[1]), per: 'destroyedStep', max: m[2] ? Number(m[2]) : null, who: 'me' }],
        }),
    },
    // «противник теряет 1 `att. cube`, 1 `def. cube` или 1 `morale cube` — в
    // зависимости от того, чего больше всего» («Аколыты-гибриды»): the kind is
    // counted, not chosen — and the cube the owner gains is the same one.
    {
        re: /теряет 1 `att\. cube`, 1 `def\. cube` или 1 `morale cube` — в зависимости от того, чего больше всего/i,
        build: () => ({ op: 'stealMostDie', n: 1, kinds: ['att', 'def', 'morale'], gain: true, who: 'foe' }),
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
    // «…либо заплатить 1 жетон кузни и заменить 1 Онагр на 1 Титана»
    // («Мехаморфоз»): the alternative that names a price pays the token before
    // the model is exchanged. The rule stands first — the plain «заменить 1 X на
    // 1 Y» would take the sentence and drop the price.
    {
        re: /(?:заплатить|потратить|заплатите|потратьте)\s+(\d+|один)\s+жетон[а-яёa-z]*\s+(кузн|тайник|подкреплен)[а-яёa-z]*\s+и\s+замен[а-яёa-z]*\s+(\d+)?\s*([А-ЯЁ][а-яёa-z'’]+)\s+на\s+(\d+)?\s*([А-ЯЁ][а-яёa-z'’]+)/i,
        build: m => ({
            op: 'replaceUnit', n: num(m[3]) || 1, from: m[4], to: m[6],
            filter: unitFilter(m[4]), pick: true,
            pay: {
                kind: /кузн/.test(m[2]) ? 'forge' : /тайник/.test(m[2]) ? 'cache' : 'reinforcement',
                n: num(m[1]) || 1,
            },
            text: m[0], who: 'me',
        }),
    },
    // «Либо потратьте 2 материала, чтобы разместить 2 бесплатных Скитария в мире
    // с вашей фабрикой» («Багровая стража»): the materiel is paid for the units,
    // and the world is the one that holds the factory of the player.
    {
        re: /потрат[а-яёa-z]*\s+(\d+|два|три|один)\s+материал[а-яёa-z]*,\s*чтобы\s+размест[а-яёa-z]*\s+(\d+|два|три|один)?\s*(?:бесплатн[а-яёa-z]+\s+)?([^,.;]{2,40}?)(?:\s+в мире с вашей фабрикой|\s+в мире, содержащем вашу фабрику)[.,;]?\s*$/i,
        build: (m, ctx) => ({
            op: 'sequence',
            steps: [
                { op: 'payMateriel', n: num(m[1]) || 1, who: 'me' },
                {
                    op: 'placeUnit', n: num(m[2]) || 1, what: m[3], pick: true, free: true,
                    dest: 'friendlyWorldWithFactory', who: 'me',
                },
            ],
            text: m[0], who: 'me',
        }),
    },
    // «купить фабрику и разместить её на дружественном мире в активной системе»
    // («Боевая кузня»): the factory is paid for and stands in the system of the
    // order that is being executed.
    {
        re: /купить фабрику и разместить её на дружественном мире в активной системе/i,
        build: () => ({ op: 'placeStructure', kind: 'factory', n: 1, buy: true, pick: true, dest: 'friendlyWorldActive', who: 'me' }),
    },
    // «взять две верхних карты из колоды событий и активировать их способности»
    // («Некромеханика»): both cards are taken and both abilities happen.
    {
        re: /взять (две|\d+) верхни[ех] карт[ыу]? из колоды событий и активировать их способности/i,
        build: m => ({ op: 'activateEvents', n: /две/i.test(m[1]) ? 2 : (Number(m[1]) || 1), who: 'me' }),
    },
    // «временно убавить здоровье всех юнитов в атакуемом мире на 1» («Заряд
    // радиации»): the strike that follows kills the units of the world easier.
    {
        re: /убавить здоровье всех юнитов в атакуемом мире на (\d+)/i,
        build: m => ({ op: 'strikeHealthDown', n: Number(m[1]) || 1, who: 'me' }),
    },
    // «взять 1 ваш приказ с вершины любой стопки и разместить его в смежной
    // системе» («Научная экспедиция»).
    {
        re: /взять (\d+|один) ваш приказ с вершины любой стопки и разместить его/i,
        build: () => ({ op: 'placeOrderAny', n: 1, who: 'me' }),
    },
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
    // "reroll all the dice of one value"
    {
        re: /переброс[а-яёa-z]*\s+все[а-яёa-z]*\s+(?:ваш[а-яёa-z]*|свои)\s+кубик[а-яёa-z]*\s+одного(?:\s+конкретного)?\s+(?:значения|типа)/i,
        build: () => ({ op: 'rerollValue' }),
    },
    // "reroll up to 2 of your dice" / "reroll 1 of your dice"
    {
        re: /переброс[а-яёa-z]*\s+(?:до\s+)?(всех|все|(\d+))?\s*(?:ваш[а-яёa-z]*|свои|своих)\s+куб[а-яёa-z]*/i,
        build: m => ({ op: 'rerollDie', n: /все/.test(m[1] || '') ? 99 : num(m[2]), kind: 'any', all: /все/.test(m[1] || ''), pick: true }),
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
    // «Вы можете потратить 2 `def. cube`, чтобы взять под контроль постройки
    // этого мира, если в нём нет вражеских юнитов и бастионов» («Изъяны плоти»):
    // the cubes are the ones the orbital strike has rolled, so the price and the
    // control of the structures are paid together, after the strike.
    {
        re: /потрат[а-яёa-z]*\s+(\d+)\s*`([^`]+)`,\s*чтобы\s+взять под контроль постройки/i,
        build: m => ({
            op: 'strikeTakeStructures', n: num(m[1]) || 1, kind: FS_EFFECTS.icon(m[2]),
            cond: { noEnemyPieces: true }, who: 'me',
        }),
    },
    // «вы можете потратить до 2 `att. cube` за каждый корабль» («Мицетические
    // споры»): the ceiling of the payment is the number of the ships of the
    // strike, and the cubes come from the ones the strike has rolled.
    {
        re: /потратить до (\d+)\s*`([^`]+)`([^.]*)/i,
        build: (m, ctx, s) => {
            const src2 = String(s || m[0]);
            const perShip = /за кажд[а-яёa-z]*\s+(?:ваш[а-яёa-z]*\s+)?корабл/i.test(src2);
            const mAsset = /получ[а-яёa-z]*\s+(\d+)?\s*жетон[а-яё]*\s+(подкрепления|кузни|снабжения|разведки)/i.exec(m[3] || '');
            // Only the payments of a strike: the cubes of a strike are the ones
            // it has rolled. The ceiling per ship («Мицетические споры») and the
            // tokens per cube paid («Разведка генокрадов») are both of them;
            // any other payment is an ordinary one.
            if (!perShip && !mAsset) return null;
            /** @type {any[]} */
            const steps = [{
                op: 'strikePay', n: Number(m[1]), kind: FS_EFFECTS.icon(m[2]),
                per: perShip ? 'ship' : null,
            }];
            if (mAsset) {
                steps.push({
                    op: 'strikeReward', n: num(mAsset[1]),
                    asset: /подкрепл/i.test(mAsset[2]) ? 'reinforcement'
                        : (/кузн/i.test(mAsset[2]) ? 'forge' : (/снабж/i.test(mAsset[2]) ? 'supply' : 'cache')),
                });
            }
            return steps;
        },
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
            // «Потратьте всех …» spends every cube of the kind; «Потратьте
            // любое количество …» («Величие роя») leaves the count to the
            // player — up to all of them, and zero is a legal answer.
            const all = /(?:^|[^а-яёa-z])все[х]?([^а-яёa-z]|$)/i.test(m[0] || '');
            const any = /любое количество/i.test(m[0] || '');
            const n = all || any ? 99 : num(m[2]);
            const union = spots.length > 1
                && spots.every((q, i) => i === 0 || /или|либо/i.test(src.slice(spots[i - 1].end, q.start)));
            if (union) {
                const kinds = spots.map(q => q.kind);
                return [{ op: 'spendDie', n, kind: kinds[0], kinds, all, any, pick: true, who: 'me' }]
                    .concat(/** @type {any[]} */ (gainStep(s)))
                    .concat(/** @type {any[]} */ (foeLoseSteps(s)));
            }
            const steps = spots.map(q => ({ op: 'spendDie', n, kind: q.kind, all, any, pick: true, who: 'me' }));
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
        // The tail may end in a comma — the branch of a «либо» keeps it
        // («получите 1 `att. token` за каждый недеморализованный отряд Гаунтов
        // и Пожирателей,» — «Выводок термаганов»), and the cap is written either
        // as «максимум 3» or as «но не более 3» («Снисхождение ангела»).
        re: /(?:получ[а-яёa-z]*|взять|возьм[а-яёa-z]*|достаньте)\s+(\d+)?\s*`([^`]+)`[^.`]{0,90}?за кажд[а-яёa-z]+\s+(?:ваш[а-яёa-z]*\s+)?недеморализованн[а-яёa-z]*\s+(?:отряд[а-яёa-z]*\s+)?([^,.]{2,70}?)(?:,?\s*(?:максимум|но не более)\s+(\d+))?,?\s*[.!]?\s*$/i,
        build: m => {
            const kind = FS_EFFECTS.iconKind(m[2]);
            if (kind !== 'token' && kind !== 'cube') return null;
            const filter = unitFilter(m[3]) || typeFilter(m[3]);
            return {
                op: kind === 'token' ? 'gainToken' : 'gainDie',
                n: num(m[1]), kind: FS_EFFECTS.icon(m[2]), per: 'unit',
                // A combat card counts the units of the contested area.
                inBattle: true,
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
    // «за каждый ваш `def. cube`, по счёту превышающий количество вражеских
    // `att. cube`, получите 1 `att. token` (вплоть до 4)» («Месть духа
    // машины»): the payout is the difference of the two counts, capped.
    {
        re: /за каждый ваш `([^`]+cube)`,?\s*по счёту превышающий количество вражеских `([^`]+cube)`,?\s*получ[а-яёa-z]*\s+(\d+|один|одно)?\s*`([^`]+)`(?:[^.;]*?вплоть до\s+(\d+))?/i,
        build: m => ({
            op: 'gainToken', n: num(m[3]), kind: FS_EFFECTS.icon(m[4]),
            per: 'excess', myKind: FS_EFFECTS.icon(m[1]), foeKind: FS_EFFECTS.icon(m[2]),
            max: m[5] ? Number(m[5]) : null, who: 'me',
        }),
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
    // «Разместите 1 Пожирателя в любую дружественную пустоту» («Флот-осколок»):
    // the ship stands in a friendly void, in any system.
    {
        re: /размест[а-яёa-z]*\s+(\d+|оди?[а-яёa-z]*н[а-яёa-z]*)\s+([А-ЯЁ][а-яёa-z]+)[а-яёa-z]*\s+в\s+любую\s+дружественную\s+пустоту/i,
        build: (m, ctx) => {
            const faction = FS_EFFECTS.factionOf(ctx);
            const names = FS_EFFECTS.unitNames(m[2], faction);
            if (!names.length) return null;
            return {
                op: 'placeUnit', n: num(m[1]) || 1, what: names[0], pick: true,
                free: true, dest: 'friendlyVoidAny', who: 'me',
            };
        },
    },
    // «разместить бесплатно по 1 Гаунту в двух разных дружественных мирах»
    // («Гнездо выводка»): one model in each of two different friendly worlds —
    // two steps that share the list of the worlds they have used.
    {
        re: /размест[а-яёa-z]*\s+бесплатно\s+по\s+(\d+)\s+([А-ЯЁ][а-яёa-z]+)[а-яёa-z]*\s+в\s+двух\s+разных\s+дружественных\s+мирах/i,
        build: (m, ctx) => {
            const faction = FS_EFFECTS.factionOf(ctx);
            const names = FS_EFFECTS.unitNames(m[2], faction);
            if (!names.length) return null;
            const used = [];
            const one = () => ({
                op: 'placeUnit', n: num(m[1]) || 1, what: names[0], pick: true,
                free: true, dest: 'friendlyWorldsAny', who: 'me', used: used,
            });
            return [one(), one()];
        },
    },
    // «повысить свой командный уровень на 1 за каждый Корабль-Улей»
    // («Разум улья»).
    {
        re: /повысить\s+свой\s+командный\s+уровень\s+на\s+(\d+)\s+за\s+кажд[а-яёa-z]*\s+([^.;]+)/i,
        build: (m, ctx) => {
            const faction = FS_EFFECTS.factionOf(ctx);
            const names = FS_EFFECTS.unitNames(m[2], faction);
            const filter = names.length ? { types: names } : (unitFilter(m[2]) || typeFilter(m[2]));
            const step = { op: 'klBonus', n: Number(m[1]) || 1, who: 'me' };
            if (filter) { step.per = 'unit'; step.filter = filter; }
            return step;
        },
    },
    // «Используйте эти материалы только для покупки любого количества кораблей»
    // («Капиллярные башни»).
    {
        re: /используйте\s+эти\s+материал[а-яёa-z]*\s+только\s+для\s+покупк[а-яёa-z]*\s+любого\s+количества\s+корабл/i,
        build: () => ({
            op: 'spendTempMateriel', unitType: 'ship',
            dest: 'friendlyOrUncontrolledVoidActive', who: 'me',
        }),
    },
    // «Получите материалы со всех дружественных миров этой системы»
    // («Пожиратель миров»).
    {
        re: /получ[а-яёa-z]*\s+материал[а-яёa-z]*\s+со\s+всех\s+дружественных\s+миров\s+этой\s+системы/i,
        build: () => ({ op: 'gainMateriel', nFromWorlds: 'chosenSystem', who: 'me' }),
    },
    // «Получите 1 жетон материалов и 1 жетон кузни» («Благословение
    // Бога-Машины»): the sentence names two tokens, both of them are gained.
    {
        re: /получ[а-яёa-z]*\s+(\d+|один|одно|два|две)?\s*жетон[а-яёa-z]*\s+материал[а-яёa-z]*\s+и\s+(\d+|один|одно|два|две)?\s*жетон[а-яёa-z]*\s+(кузн[а-яёa-z]*|тайник[а-яёa-z]*|подкреплен[а-яёa-z]*)/i,
        build: m => ([
            { op: 'gainMateriel', n: num(m[1]) || 1, who: 'me' },
            {
                op: 'gainAsset', n: num(m[2]) || 1, who: 'me',
                kind: /кузн/.test(m[3]) ? 'forge' : /тайник/.test(m[3]) ? 'cache' : 'reinforcement',
            },
        ]),
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
                // «командный уровень которого не превышает командный уровень
                // вашего сильнейшего недеморализованного юнита» («Жёсткий залп»).
                maxKlFromMine: /не\s+превышает\s+командн[а-яёa-z]*\s+уровень\s+ваш[а-яёa-z]*\s+сильнейш/i.test(String(s || '')),
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
            // «в этом мире», «в этот мир», «в эту область» — the world of the
            // battle itself, whoever holds it at the moment.
            const here = /в этот мир|в этом мире|этого мира|эту область|эти области|спорную область|спорной области/i.test(s || '');
            if (/подкреплен/.test(what)) {
                return { op: 'placeReinforcement', n, pick: true,
                         free: /бесплатн/.test(String(s || '') + ' ' + what),
                         // «в спорной области» — the area of the battle is fixed.
                         here: /в спорной области|в этой области боя/i.test(String(s || '')) };
            }
            if (/бастион|город|фабрик/.test(what)) {
                const kind = /бастион/.test(what) ? 'bastion' : (/город/.test(what) ? 'city' : 'factory');
                const step = { op: 'placeStructure', kind: kind, n: 1, free: true, pick: true };
                // «разместить 1 бесплатный бастион в этом мире, если там ещё нет
                // построек» («Роящие организмы»): the world of the battle is the
                // only one, and the words after it are a condition on that world
                // — not a search for some other world without structures.
                if (here) step.dest = 'combatWorld';
                if (/если\s+там\s+(?:ещё\s+)?нет\s+построек/i.test(s || '')) step.noStructures = true;
                return step;
            }
            const faction = FS_EFFECTS.factionOf(ctx);
            const names = FS_EFFECTS.unitNames(what, faction);
            if (names.length) {
                const step = { op: 'placeUnit', n, what: names[0], pick: true, free: true };
                if (here) step.dest = 'combatWorld';
                return step;
            }
            return null;
        },
    },
    // «увеличить лимит закупки юнитов на 1» («Главный по машинам»): the deploy
    // order buys one unit more than the command level allows. The rule stands
    // before «купить N юнитов» — «закупки юнитов» would be read as a purchase.
    {
        re: /увеличить лимит закупки (?:юнитов|отрядов) на (\d+)/i,
        build: m => ({ op: 'deployLimit', n: Number(m[1]) }),
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
            // «После перемещения своей фракции … в мире с этой фабрикой»
            // («Святой трубопровод»): the unit stands in the world of the
            // factory of the order, not in any world of the system.
            return { op: 'placeUnit', n: 1, what: names, pick: true, buy: true, dest: 'friendlyWorldWithFactoryActive' };
        },
    },
    // «Требуются «Камери размножения»» («Мицетические споры»): the quoted
    // name is another order upgrade the player must have bought. parse() puts
    // this step in front of the abilities of the card.
    {
        re: /^требуются\s*«([^»]+)»\s*\.?$/i,
        build: m => ({ op: 'require', what: 'upgrade', name: m[1].trim() }),
    },
    // «Нужно быть главным по машинам» («Святой трубопровод»): the prerequisite of
    // the card — the player must own the upgrade it names.
    {
        re: /^нужно быть ([а-яёa-z ]{3,40})\.?$/i,
        build: m => ({ op: 'require', what: 'upgrade', name: m[1].trim() }),
    },
    // "buy 1 structure and place it"
    {
        re: /куп[а-яёa-z]*\s+(\d+)?\s*(?:одну\s+)?постройк[а-яёa-z]*/i,
        build: (m, ctx, s) => {
            const step = { op: 'placeStructure', kind: 'any', n: num(m[1]) || 1, buy: true, pick: true };
            // «…разместить её в дружественном мире, где уже есть 1 ваша
            // постройка другого типа» («Певцы психокости»): the permission.
            if (/где уже есть\s+1\s+(?:ваша|Ваша)\s+постройк[а-яёa-z]*\s+другого типа/i.test(s)) {
                step.onOccupied = 'otherType';
            }
            return step;
        },
    },
    // "replace 1 scout from the supply with a space marine"
    {
        re: /замени[а-яёa-z]*\s+(\d+)?\s*отряд[а-яёa-z]*\s+([^,.;]{2,40}?)\s+на\s+(\d+)?\s*отряд[а-яёa-z]*\s+([^,.;]{2,40}?)\s+из запаса/i,
        build: (m, ctx) => ({
            op: 'replaceUnit', n: num(m[1]), from: m[2], to: m[4],
            filter: unitFilter(m[2]), pick: true, text: m[0],
        }),
    },
    // «Вы можете бесплатно заменить 1 Скитария на 1 Катафрона, 1 Катафрона на
    // 1 Онагра, либо заплатить 1 жетон кузни и заменить 1 Онагр на 1 Титана»
    // («Мехаморфоз»): the sentence lists several exchanges — each of them is an
    // alternative of its own, and the one that names a price pays it.
    {
        re: /замен[а-яёa-z]*\s+\d+\s+[А-ЯЁа-яёa-z]+\s+на\s+\d+\s+[А-ЯЁа-яёa-z]+\s*,\s*\d+\s+[А-ЯЁа-яёa-z]+\s+на\s+\d+\s+[А-ЯЁа-яёa-z]+/i,
        build: (m, ctx, s) => {
            const options = [];
            const re = /(\d+)\s+([А-ЯЁа-яёa-z]+)\s+на\s+(\d+)\s+([А-ЯЁа-яёa-z]+)/g;
            let pair;
            while ((pair = re.exec(s)) !== null) {
                // The price stands right before the exchange it belongs to.
                const before = s.slice(Math.max(0, pair.index - 46), pair.index);
                const pay = /(?:заплатить|потратить)\s+(\d+|один)\s+жетон[а-яёa-z]*\s+(кузн|тайник|подкреплен)[а-яёa-z]*\s+и\s*$/i.exec(before);
                options.push({
                    op: 'replaceUnit', n: Number(pair[1]) || 1, from: pair[2], to: pair[4],
                    filter: unitFilter(pair[2]), pick: true, free: !pay,
                    pay: pay ? {
                        kind: /кузн/.test(pay[2]) ? 'forge' : /тайник/.test(pay[2]) ? 'cache' : 'reinforcement',
                        n: num(pay[1]) || 1,
                    } : null,
                    text: (pay ? pay[0] : '') + pair[0], who: 'me', ability: s,
                });
            }
            return options.length >= 2 ? { op: 'choice', options, text: s } : null;
        },
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
            const off = /уменьш[а-яёa-z]*\s+(?:его\s+)?стоимость\s+на\s+(\d+)\s+за\s+кажд[а-яёa-z]*\s+([^.;]+)/i.exec(String(s || ''));
            if (off) {
                step.discount = /фабрик/i.test(off[2]) ? 'factories' : Number(off[1]) || 1;
                // «уменьшив его стоимость на 1 за каждый Корабль-Улей»
                // («Разведывательные организмы»): the discount is counted by the
                // units the card names.
                if (step.discount !== 'factories') {
                    const faction = FS_EFFECTS.factionOf(ctx);
                    const names = FS_EFFECTS.unitNames(off[2], faction);
                    const filter = names.length ? { types: names }
                        : (unitFilter(off[2]) || typeFilter(off[2]));
                    if (filter) { step.per = 'unit'; step.filter = filter; }
                }
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
        re: /получ[а-яёa-z]*\s+(\d+)?\s*(?:жетон[а-яёa-z]*\s+)?(кузн[а-яёa-z]*|тайник[а-яёa-z]*|подкреплен[а-яёa-z]*|жетон[а-яёa-z]*\s+ресурс[а-яёa-z]*)/i,
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
    // «уменьшить общую цену всех покупок (включая здания) на 1» («Главный по
    // машинам»): every purchase of the order is cheaper — the units and the
    // structures alike.
    {
        re: /уменьшить общую цену всех покупок[^.]*?на (\d+)/i,
        build: m => ({ op: 'purchaseDiscount', n: Number(m[1]) }),
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
    // «посмотрите выложенную лицом вниз боевую карту противника»,
    // «Если вы — атакующий, подсмотрите карту оппонента» («Скитарии-
    // инфильтраторы»): the card the opponent laid for this round is shown.
    {
        re: /^(?:если вы атакуете,?\s+(?:то\s+)?)?(?:посмотрите выложенную лицом вниз|подсмотрите)\s+(?:в игровую зону )?боевую карту противника\.?$/i,
        build: () => ({ op: 'peekFoeCard' }),
    },
    {
        re: /^(?:если вы — атакующий,?\s+)?подсмотрите карту оппонента\.?$/i,
        build: (m, ctx, s) => ({ op: 'peekFoeCard', onlyAttacker: /^если вы — атакующий/i.test(String(s || '')) }),
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
    // «Повторите основную способность карты, разыгранной в предыдущем раунде
    // боя» («Почитание духа машины»): the general ability box of the card the
    // player resolved in the round before this one is resolved again.
    {
        re: /^повторите основную способность карты[^.]*\.?$/i,
        build: (m, ctx, s) => ({ op: 'repeatCard', box: 'general', text: s }),
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
        build: (m, ctx, s) => {
            // «…перебросьте 1 кубик за каждого юнита в оспариваемой области»
            // («Сервочерепа-стражи»): the reroll is counted by the units that
            // stand in the contested area of the battle the order has started.
            const reroll = /перебросьте\s+(\d+|один)\s+кубик[а-яёa-z]*\s+за каждого юнита в оспариваемой области/i.exec(s);
            if (reroll) {
                return {
                    op: 'prepReroll', n: num(reroll[1]) || 1, per: 'unit', inBattle: true,
                    kind: 'any', who: 'me', ability: s,
                };
            }
            return { op: 'note', text: s };
        },
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
        build: (m, ctx, s) => {
            // «За каждый потраченный вами `att. cube` купите один отряд с
            // командным уровнем 2 или меньше и разместите его в этом мире»
            // («Мицетические споры»): one unit bought and placed per cube paid.
            // The cubes of a strike are the ones it has just rolled, so the
            // payment is read by the strike itself (like «Изъяны плоти»).
            const mm = /куп[а-яёa-z]*\s+один\s+отряд\s+с командным уровнем\s+(\d+)\s+или меньше/i.exec(String(s || ''));
            if (mm) {
                return { op: 'strikeReward', units: { maxKl: Number(mm[1]), dest: 'orderWorld' } };
            }
            return { op: 'note', text: s };
        },
    },
    {
        re: /^после того, как вы выполните этот приказ, можете приобрести до (\d+) отрядов за кажд[а-яёa-z]*\s+недеморализованн[а-яёa-z]*\s+([^.;]+?)\s+в активной системе[^.]*\.?$/i,
        build: (m, ctx) => {
            // «можете приобрести до 2 отрядов за каждый недеморализованный
            // Корабль Улей в активной системе и разместить их на любых
            // дружественных или никем не контролируемых мирах в активной
            // системе» («Камери размножения»).
            const faction = FS_EFFECTS.factionOf(ctx);
            const names = FS_EFFECTS.unitNames(m[2], faction);
            const filter = names.length ? { types: names }
                : (unitFilter(m[2]) || typeFilter(m[2]));
            return {
                op: 'placeUnit', n: Number(m[1]), buy: true, pick: true, who: 'me',
                per: 'unit', filter: filter, ofSystem: 'active',
                dest: 'friendlyOrUncontrolledWorldActive',
            };
        },
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
    // "do not discard your `def. token` at the end of this round" /
    // «… чтобы не терять свои `att. token` в конце текущего раунда битвы»
    // («Гнев машины») — the tokens of the named kind stay with the player when
    // the execution round ends.
    {
        re: /не\s+(?:сбрасывайте|сбрасывать|терять)\s+(?:ваши|свои|сво[а-яёa-z]*)\s*`([^`]+token)`/i,
        build: m => ({ op: 'keepTokens', kind: FS_EFFECTS.icon(m[1]) }),
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
    // «выберите 1 ваш недеморализованный отряд и получите количество `att.
    // token`, равное его боевому уровню» («Ржавые сталкеры»): the unit is
    // chosen first, the number of the tokens is its printed combat value.
    {
        re: /выбер[а-яёa-z]*\s+(?:1|один)\s+ваш[а-яёa-z]*\s+недеморализованн[а-яёa-z]*\s+отряд[а-яёa-z]*\s+и получ[а-яёa-z]*\s+количество\s+`([^`]+)`,?\s*равное его боевому (?:уровню|значению)/i,
        build: m => ({ op: 'gainByUnit', kind: FS_EFFECTS.icon(m[1]), stat: 'combat', n: 1, who: 'me' }),
    },
    // «активируйте способность подразделения с карты, разыгранной в предыдущем
    // раунде боя» («Жизнеотсос»): the unit ability box of that card, requisites
    // included.
    {
        re: /активиру[а-яёa-z]*\s+способность\s+подразделения\s+с карт[а-яёa-z]*,?\s+разыгранн[а-яёa-z]*\s+в предыдущем раунде боя/i,
        build: (m, ctx, s) => ({ op: 'repeatCard', box: 'unit', text: s }),
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
    // «на этапе нанесения урона в этом раунде вы можете нанести его вашим
    // деморализованным отрядам» («Авангард скитариев»): for this execution round
    // the routed units of the player join the pieces he may assign the damage to.
    {
        re: /нанести\s+(?:его\s+)?ваш[а-яёa-z]*\s+деморализованн[а-яёa-z]*\s+отряд[а-яёa-z]*/i,
        build: () => ({ op: 'damageOwnRouted' }),
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
    // «Уничтожьте 1 из Ваших недеморализованных отрядов» («Крушащие клешни»),
    // «Уничтожьте 1 Ваш недеморализованный отряд» («Подавляющее присутствие»):
    // the words name the owner and the piece, not a unit of the faction list —
    // such a filter would match nothing at all, so there is no filter.
    const generic = /^(?:ваш[а-яё]*|сво[а-яё]*|любы[а-яё]*|эт[а-яё]*|один|одного|одну|одной|1)\s+(?:отряд[а-яё]*|юнит[а-яё]*|модел[а-яё]*|боев[а-яё]*|недеморализованн[а-яё]*)$/i;
    // «за каждый ваш недеморализованный отряд» («Снисхождение ангела») counts
    // every unit: the word alone is not a name either.
    const piece = /^(?:отряд|юнит|модел)[а-яё]*$/i;
    const real = names.filter(s => !generic.test(s.trim()) && !piece.test(s.trim()));
    return real.length ? { types: real } : null;
}
