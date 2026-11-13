//  fs-mutate.mjs — the mutation table of the card checks
//
//  node tools/fs-mutate.mjs                 run every card mutation
//  node tools/fs-mutate.mjs --faction=имперская-гвардия    one faction
//  node tools/fs-mutate.mjs --list          print the table, change nothing
//
//  A check that passes proves nothing on its own: the rule behind it may be
//  switched off. So every entry of this table breaks ONE line of the engine and
//  then plays the cards of the faction — the check that owns the rule must go
//  red. A mutation that survives is a check held up by something else, and it
//  is listed at the end.
//
//  The rule of the table: keep it semantic. `damageFirst.push` is a rule of
//  «Бронетанковый клин», `return null` inside a formatter is not — a mutation
//  that no card can notice teaches nothing.

import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const IG = 'имперская-гвардия';
const NEC = 'некроны';
const MECH = 'адептус-механикус';
const TAU = 'империя-тау';
const TYR = 'тираниды';
const CHAOS = 'космодесант-хаоса';
const ELDAR = 'эльдары';

/**
 * `old` must occur exactly once in `file`: a mutation with two anchors would
 * change a line nobody can find again.
 */
const TABLE = [
    {
        card: 'Багровая стража', faction: MECH, file: 'js/fs/FSEffects.js',
        old: "        return !!step && step.op === 'placeUnit' && (step.requireFullSupply",
        new: "        return false && step.op === 'placeUnit' && (step.requireFullSupply",
        why: 'платная ветка требует весь запас, а бесплатная остаётся доступной',
    },
    {
        card: 'Багровая стража', faction: MECH, file: 'js/fs/effects/FSPlaceSteps.js',
        old: '        if (effects.fullSupplyPlacement(step)) {\n            const need = Math.max(1, step.left !== undefined ? step.left : (step.n || 1));',
        new: '        if (false) {\n            const need = Math.max(1, step.left !== undefined ? step.left : (step.n || 1));',
        why: 'потеря второй модели во время выбора не списывает цену',
    },
    // --- «Волновой змей»: the move, the tokens and the follow-up battle -----
    {
        card: 'Волновой змей', faction: ELDAR, file: 'js/fs/FSEffects.js',
        old: "                includeReinforcements: true, dest: 'eldarWaveAdjacent', strict: true, who: 'me' });",
        new: "                includeReinforcements: false, dest: 'eldarWaveAdjacent', strict: true, who: 'me' });",
        why: 'стоящий жетон подкрепления — отряд КЛ 0, он предлагается к перемещению',
    },
    {
        card: 'Волновой змей', faction: ELDAR, file: 'js/fs/effects/FSMoveSteps.js',
        old: '            const stays = u => !u.reinforcementCombat && u.tokenSide === undefined;',
        new: '            const stays = u => true;',
        why: 'уходящие при очистке жетоны не считаются в пределе пяти атакующих',
    },
    {
        card: 'Волновой змей', faction: ELDAR, file: 'js/fs/effects/FSMoveSteps.js',
        old: '            if (prior && (prior.system !== area.system || prior.pos !== area.pos)) return false;',
        new: '            if (false) return false;',
        why: 'все карты одного боя создают не больше одной новой спорной области',
    },
    {
        card: 'Волновой змей', faction: ELDAR, file: 'js/fs/effects/FSMoveSteps.js',
        old: '        if (defender !== null) R.queueEffectCombat(state, seat, defender, area, arrivals);',
        new: '        /* mutation: no follow-up battle */',
        why: 'после текущего боя начинается новый бой в занятой области',
    },
    {
        card: 'Волновой змей', faction: ELDAR, file: 'js/fs/effects/FSMoveSteps.js',
        old: '                CombatTokens.of(f.combat).moveAway(u.tokenSide, u.tokenIndex);',
        new: '                /* mutation: the slot stays in the old combat */',
        why: 'перемещённый жетон покидает старый бой',
    },
    // --- independent end-of-damage promises and repeated steps --------------
    {
        card: 'Ракета «Death Strike» и Рой', faction: IG, file: 'js/fs/core/FSCombatPlans.js',
        old: '        list.push(one);\n        this.combat.deferDamage = list;',
        new: '        list.length = 0; list.push(one);\n        this.combat.deferDamage = list;',
        why: 'отложенный эффект не перезаписывает другой',
    },
    {
        card: 'Рой потрошителей', faction: TYR, file: 'js/fs/rules/CombatRules.js',
        old: 'resetDestroyed().resetFallenStep().resetResurrectStep().resetDeferredStep()',
        new: 'resetDestroyed().resetFallenStep().resetResurrectStep()',
        why: 'награда за уничтоженных срабатывает в каждом шаге',
    },
    {
        card: 'Рой потрошителей', faction: TYR, file: 'js/fs/rules/CombatRules.js',
        old: 'resetDestroyed().resetFallenStep().resetResurrectStep().resetDeferredStep()',
        new: 'resetFallenStep().resetResurrectStep().resetDeferredStep()',
        why: 'второй шаг не считает потери первого',
    },
    {
        card: 'Уклонение', faction: TAU, file: 'js/fs/rules/CombatRules.js',
        old: 'resetDestroyed().resetFallenStep().resetResurrectStep().resetDeferredStep()',
        new: 'resetDestroyed().resetResurrectStep().resetDeferredStep()',
        why: 'во втором шаге предлагаются новые павшие',
    },
    {
        card: 'Уклонение', faction: TAU, file: 'js/fs/effects/FSPlaceSteps.js',
        old: '                if (!CombatTokens.of(combat).restoreFallen(rec.tokenSide, rec.tokenIndex)) continue;',
        new: '                continue; // mutation: never return a reinforcement',
        why: 'жетон возвращается как жетон, а не как пластиковая модель',
    },
    {
        card: 'Совращённый Хаосом', faction: CHAOS, file: 'js/fs/rules/CombatRules.js',
        old: "            if (this.engine.maybeScheme(state, seat, 'damage-end', { kind: 'combat', ctx: { side } })) {",
        new: "            if (rules.repeated && this.engine.maybeScheme(state, seat, 'damage-end', { kind: 'combat', ctx: { side } })) {",
        why: 'первый конец урона не пропускается перед повтором',
    },
    {
        card: 'Сфера воскрешения', faction: NEC, file: 'js/fs/rules/CombatRules.js',
        old: 'resetDestroyed().resetFallenStep().resetResurrectStep().resetDeferredStep()',
        new: 'resetDestroyed().resetFallenStep().resetDeferredStep()',
        why: 'после отказа новый павший предлагается в повторном шаге',
    },
    {
        card: 'Сфера воскрешения', faction: NEC, file: 'js/fs/rules/CombatRules.js',
        old: '        if (sphere) plans.noteCandidate(Object.assign({}, entry));',
        new: '        /* mutation: a reinforcement is not a sphere candidate */',
        why: 'павшее подкрепление тоже отряд КЛ 0',
    },
    {
        card: 'Сфера воскрешения', faction: NEC, file: 'js/fs/rules/CombatRules.js',
        old: '            if (!CombatTokens.of(c).restoreFallen(pending.tokenSide, pending.tokenIndex)) return;',
        new: '            return; // mutation: the token never comes back',
        why: 'сфера возвращает исходный жетон',
    },
    {
        card: 'Фаланга судного дня', faction: NEC, file: 'js/fs/core/FSCombatPlans.js',
        old: '        plan.done = false;\n        plan.handled = (plan.handled || []).filter(x => x !== id);',
        new: '        /* mutation: never re-arm the plan */',
        why: 'второе падение в раунде требует своего решения',
    },
    {
        card: 'Фаланга судного дня', faction: NEC, file: 'js/fs/rules/CombatRules.js',
        old: '        d.handled = (d.handled || []).concat(units.map(u => u.id));',
        new: '        d.handled = [];',
        why: 'за уже спасённый отряд не требуют плату заново',
    },
    {
        card: 'Фаланга судного дня', faction: NEC, file: 'js/fs/rules/CombatRules.js',
        old: '        for (const index of tokens.flipped(foeSide)) {',
        new: '        for (const index of []) {',
        why: 'деморализованные жетоны тоже попадают под способность',
    },
    {
        card: 'Фаланга судного дня', faction: NEC, file: 'js/fs/core/FSCombatTokens.js',
        old: '        return rounds[index] === undefined || rounds[index] === round;',
        new: '        return true;',
        why: 'жетон, деморализованный в прошлом раунде, не становится новой жертвой',
    },
    {
        card: 'Фаланга судного дня', faction: NEC, file: 'js/fs/FSEffects.js',
        old: "                return { ok: false, error: 'Выберите предложенные кубики для оплаты.' };",
        new: '                /* mutation: accept a forged payment */',
        why: 'нельзя оплатить отсутствующим или повторённым кубиком',
    },
    {
        card: 'Ракета «Death Strike»', faction: IG, file: 'js/fs/rules/CombatRules.js',
        old: '            if (needsTarget && !targets.length && !hasToken) continue;',
        new: '            if (needsTarget && !targets.length) continue;',
        why: 'ракета не пропускает оставшееся подкрепление',
    },
    {
        card: 'Ракета «Death Strike»', faction: IG, file: 'js/fs/FSEffects.js',
        old: "            if (tokens.alive(side, i)) ids.push('reinforce-' + side + '-' + i);",
        new: '            /* mutation: omit reinforcement targets */',
        why: 'живой жетон предлагается как цель ракеты',
    },
    {
        card: 'Ракета «Death Strike»', faction: IG, file: 'js/fs/FSEffects.js',
        old: "        if (question.kind === 'units' && unitMode) {",
        new: '        if (false) {',
        why: 'ответ с чужим жетоном отклоняется',
    },
    // --- selection cardinality after a combat ability is accepted -----------
    {
        card: 'Огринские ударные войска', faction: IG, file: 'js/fs/FSEffects.js',
        old: "            const exact = diceMode === true || question.op === 'strikePayPick';",
        new: "            const exact = question.op === 'strikePayPick';",
        why: 'обязательный переброс нельзя сократить до нуля или одного кубика',
    },
    {
        card: 'Быкогрин здоровья', faction: IG, file: 'js/fs/effects/ask/FSDiceAsks.js',
        old: "            op: 'rerollDie', n: Math.min(want, options.length), options, kind2: step.kind, kinds,",
        new: "            op: 'rerollDie', n: want, options, kind2: step.kind, kinds,",
        why: 'если подходящий кубик один, его всё равно надо перебросить',
    },
    {
        card: 'Воля повелителя', faction: NEC, file: 'js/fs/FSEffects.js',
        old: "        if (/(?:переброс[а-яёa-z]*|перебрас[а-яёa-z]*)\\s+(?:до\\s+\\d+|любое\\s+количество)/i.test(text)) return 'atMost';",
        new: '        /* mutation: a printed up-to reroll requires the full amount */',
        why: '«до двух» позволяет выбрать меньше двух',
    },
    {
        card: 'Нечеловеческая сила', faction: CHAOS, file: 'js/fs/FSEffects.js',
        old: 'if (!Array.isArray(ids) || (unitMode === true && ids.length !== limit)',
        new: 'if (!Array.isArray(ids) || (false && ids.length !== limit)',
        why: 'принятая жертва требует выбрать действительный отряд',
    },
    // --- Tau: staged event choices, unavailable targets and supply ----------
    {
        card: 'Саботаж', faction: TAU, file: 'js/fs/effects/ask/FSPlaceAsks.js',
        old: 'u.seat === seat && !u.routed && targets.has(u.system)).map(u => u.id);',
        new: 'u.seat === seat && !u.routed).map(u => u.id);',
        why: 'жертву без вражеской постройки в системе нельзя предложить',
    },
    {
        card: 'Саботаж', faction: TAU, file: 'js/fs/FSEffects.js',
        old: "'replaceUnit', 'sabotage', 'evacuate'].includes(question.op)",
        new: "'replaceUnit', 'evacuate'].includes(question.op)",
        why: 'сервер проверяет оба последовательных выбора саботажа',
    },
    {
        card: 'Эвакуация', faction: TAU, file: 'js/fs/FSEffects.js',
        old: "'replaceUnit', 'sabotage', 'evacuate'].includes(question.op)",
        new: "'replaceUnit', 'sabotage'].includes(question.op)",
        why: 'сервер проверяет постройку, тип и место эвакуации',
    },
    {
        card: 'Эвакуация', faction: TAU, file: 'js/fs/effects/FSMoveSteps.js',
        old: "const types = ['factory', 'city', 'bastion'].filter(type => R.canTakeStructure(state, seat, type).ok);",
        new: "const types = ['factory', 'city', 'bastion'];",
        why: 'исчерпанный в коробке тип не предлагается',
    },
    {
        card: 'Эвакуация', faction: TAU, file: 'js/fs/effects/FSMoveSteps.js',
        old: "        if (!area || !legal.some(a => a.system === area.system && a.pos === area.pos)) {\n            return { ok: false, error: 'Этот мир выбрать нельзя.' };",
        new: "        if (!area) {\n            return { ok: false, error: 'Этот мир выбрать нельзя.' };",
        why: 'место повторно проверяется при устаревшем состоянии',
    },
    {
        card: 'Саботаж', faction: TAU, file: 'js/fs/FSEffects.js',
        old: '        if (res && res.ok === false) return res;',
        new: '        /* mutation: a stale target silently closes the effect */',
        why: 'ошибка исполнителя не закрывает ожидающий вопрос',
    },
    // --- Адептус Механикус: отдельные предложения, тайна карты и реальные приказы --
    {
        card: 'Благословение Бога-Машины', faction: MECH,
        file: 'js/fs/FSEffects.js',
        old: "            { op: 'gainAsset', n: 1, who: 'me', kind: 'cache' },\n            { op: 'gainAsset', n: 1, who: 'me', kind: 'forge' },",
        new: "            { op: 'gainMateriel', n: 1, who: 'me' },\n            { op: 'gainAsset', n: 1, who: 'me', kind: 'forge' },",
        why: 'жетон запасов — не единица на счётчике материи',
    },
    {
        card: 'Благословение Бога-Машины', faction: MECH,
        file: 'js/fs/FSEffects.js',
        old: "            { op: 'gainAsset', n: 1, who: 'me', kind: 'cache' },\n            { op: 'gainAsset', n: 1, who: 'me', kind: 'forge' },",
        new: "            { op: 'gainAsset', n: 1, who: 'me', kind: 'any' },\n            { op: 'gainAsset', n: 1, who: 'me', kind: 'forge' },",
        why: 'уточнённый жетон материалов — существующий тайник, не произвольный ресурс',
    },
    {
        card: 'Благословение Бога-Машины', faction: MECH,
        file: 'js/fs/FSEffects.js',
        old: "            { op: 'gainAsset', n: 1, who: 'me', kind: 'cache' },\n            { op: 'gainAsset', n: 1, who: 'me', kind: 'forge' },",
        new: "            { op: 'gainAsset', n: 1, who: 'me', kind: 'cache' },",
        why: 'кузница положена отдельно от запаса, даже когда запас на пределе',
    },
    {
        card: 'Благословение Бога-Машины', faction: MECH,
        file: 'js/fs/rules/DeployRules.js',
        old: 'if (o.cache) cost = Math.max(0, cost - FS_RULES_CONFIG.CACHE_VALUE);',
        new: 'if (o.cache) cost = Math.max(0, cost - 1);',
        why: 'полученный жетон запасов уменьшает цену отряда на 2, а не на 1',
    },
    {
        card: 'Благословение Бога-Машины', faction: MECH,
        file: 'js/fs/rules/DeployRules.js',
        old: 'const cost = Math.max(0, (stats.cost || 0) - (o.cache ? FS_RULES_CONFIG.CACHE_VALUE : 0));',
        new: 'const cost = Math.max(0, (stats.cost || 0) - (o.cache ? 1 : 0));',
        why: 'полученный жетон запасов уменьшает цену постройки на 2, а не на 1',
    },
    {
        card: 'Скитарии-инфильтраторы', faction: MECH,
        file: 'js/fs/FSEffects.js',
        old: '        if (mechInfiltrators) return this.sentences(text).flatMap(sentence => this.parse(sentence, ctx));',
        new: '        if (false) return this.sentences(text).flatMap(sentence => this.parse(sentence, ctx));',
        why: 'выбор кубика защитника не зависит от условия подсматривания',
    },
    {
        card: 'Скитарии-инфильтраторы', faction: MECH,
        file: 'js/fs/effects/ask/FSCardAsks.js',
        old: "        R.log(state, seat, state.players[seat].name + ' подсмотрел закрытую карту противника.');",
        new: "        R.log(state, seat, state.players[seat].name + ' подсмотрел «' + name + '».');",
        why: 'название закрытой карты не должно попадать в общий журнал',
    },
    {
        card: 'Скитарии-инфильтраторы', faction: MECH,
        file: 'js/fs/core/FSCombatCards.js',
        old: '        const name = peek && (peek[seat] || peek.name);',
        new: '        const name = peek && peek[seat];',
        why: 'панель должна читать очищенное представление, которое сервер присылает игроку',
    },
    {
        card: 'Скитарии-инфильтраторы', faction: MECH,
        file: 'js/fs/rules/CombatRules.js',
        old: '        CombatCards.of(c).clearStaged().clearPeek();',
        new: '        CombatCards.of(c).clearStaged();',
        why: 'подсмотренная карта прошлого раунда не выдаётся за новую',
    },
    {
        card: 'Багровая стража', faction: MECH,
        file: 'js/fs/FSEffects.js',
        old: "                    case 'worldWithYourFactory':\n                        ok = world && R.structuresAt(state, sys.id, area.pos)",
        new: "                    case 'worldWithYourFactory':\n                        ok = world && mine && R.structuresAt(state, sys.id, area.pos)",
        why: 'текущая редакция требует вашу фабрику, но не говорит о контроле мира',
    },
    {
        card: 'Мехаморфоз', faction: MECH,
        file: 'js/fs/FSEffects.js',
        old: "        else if (step.op !== 'replaceUnit' && !step.includeRouted) units = units.filter(u => !u.routed);",
        new: '        else if (!step.includeRouted) units = units.filter(u => !u.routed);',
        why: 'деморализованный отряд тоже может быть заменён',
    },
    {
        card: 'Мехаморфоз', faction: MECH,
        file: 'js/fs/effects/FSPlaceSteps.js',
        old: '            u.unit = def.id;\n            R.restoreUnit(state, u);',
        new: '            u.unit = def.id;',
        why: 'новая свободная модель выходит недеморализованной',
    },
    {
        card: 'Мехаморфоз', faction: MECH,
        file: 'js/fs/effects/ask/FSPlaceAsks.js',
        old: '        if (!def || (p.supply.units[def.id] || 0) <= 0) return null;',
        new: '        if (!def) return null;',
        why: 'замена недоступна, когда новой модели нет в запасе',
    },
    {
        card: 'Мехаморфоз', faction: MECH,
        file: 'js/fs/effects/FSPlaceSteps.js',
        old: '        // Never spend a token for a replacement that cannot be made.\n        if ((p.supply.units[def.id] || 0) <= 0) return null;',
        new: '        // Mutation: do not recheck the replacement model before paying.',
        why: 'устаревший выбор без модели не должен списывать жетон',
    },
    {
        card: 'Мехаморфоз', faction: MECH,
        file: 'js/fs/FSEffects.js',
        old: "['warpGateMove', 'moveStructure', 'placeUnit', 'placeFree', 'placeStructure', 'replaceUnit', 'sabotage', 'evacuate'].includes(question.op)",
        new: "['warpGateMove', 'moveStructure', 'placeUnit', 'placeFree', 'placeStructure', 'sabotage', 'evacuate'].includes(question.op)",
        why: 'ответ не может заменить отряд, которого не было в списке',
    },
    {
        card: 'Сервочерепа-стражи', faction: MECH,
        file: 'js/fs/FSEffects.js',
        old: '            return (step.n || 1) * (units + markers);',
        new: '            return (step.n || 1) * units;',
        why: 'жетоны подкрепления в спорной области считаются отрядами',
    },
    {
        card: 'Сервочерепа-стражи', faction: MECH,
        file: 'js/fs/FSEffects.js',
        old: '                return n + t.alive + t.routed;',
        new: '                return n + t.alive + t.routed + t.destroyed;',
        why: 'уничтоженные жетоны больше не находятся в спорной области',
    },
    {
        card: 'Святой трубопровод', faction: MECH,
        file: 'js/fs/rules/OperationsRules.js',
        old: "            && p.upgrades.some(u => u.name === 'Главный по машинам')",
        new: '            && true',
        why: 'для трубопровода требуется улучшение «Главный по машинам»',
    },
    {
        card: 'Святой трубопровод', faction: MECH,
        file: 'js/fs/core/FSOrderTally.js',
        old: '        this.order.movedFactory = { id: structure.id, system: structure.system, pos: structure.area };',
        new: '        this.order.movedFactory = null;',
        why: 'после движения сохраняется именно перемещённая фабрика',
    },
    {
        card: 'Главный по машинам', faction: MECH,
        file: 'js/fs/core/FSDeal.js',
        old: '        return Math.max(0, (subtotal || 0) - this.purchaseDiscount);',
        new: '        return Math.max(0, subtotal || 0);',
        why: 'скидка один раз применяется к общей стоимости отрядов и построек',
    },
    {
        card: 'Изъяны плоти', faction: MECH,
        file: 'js/fs/rules/AdvanceRules.js',
        old: "        return !enemies && list.length > 0 && !list.some(s => s.type === 'bastion');",
        new: "        return list.length > 0 && !list.some(s => s.type === 'bastion');",
        why: 'живой вражеский отряд запрещает захват при оплате до урона',
    },
    {
        card: 'Заряд радиации', faction: MECH,
        file: 'js/fs/rules/AdvanceRules.js',
        old: '                if (health <= strike.healthDown) {',
        new: '                if (false) {',
        why: 'отряд с нулевым здоровьем погибает до броска орбитального удара',
    },
    // --- боевая колода: урон и здоровье ------------------------------------
    {
        card: 'Бронетанковый клин', faction: IG,
        file: 'js/fs/core/FSCombatDamage.js',
        old: 'this.combat.damageFirst.push({ side, id, round });',
        new: '/*мутация: выбранный отряд не попадает в очередь первого урона*/',
        why: '«Леман Русс выбирает отряд 2–3 уровня, он получает урон первым»',
    },
    {
        card: 'Вирусные бомбы', faction: IG,
        file: 'js/fs/core/FSStrike.js',
        old: 'return !!this.order.ignoreBastion;',
        new: 'return false;',
        why: '«Бастионы противника не могут предотвратить этот орбитальный удар»',
    },
    {
        card: 'Вирусные бомбы', faction: IG,
        file: 'js/fs/rules/AdvanceRules.js',
        old: 'if (!opts.ignoreBastion && !StrikePlan.of(order).ignoresBastion',
        new: 'if (!opts.ignoreBastion && StrikePlan.of(order).ignoresBastion',
        why: 'мир под бастионом становится целью удара только с картой',
    },
    {
        card: 'Гнев дракона пустоты', faction: NEC,
        file: 'js/fs/effects/ask/FSStrikeAsks.js',
        old: 'CombatDamage.of(combat).addExtra(step.who, step.n || 0, seat);',
        new: '/*мутация: дополнительный урон не начисляется*/',
        why: '«вы и ваш противник получает 3 дополнительных урона»',
    },
    {
        card: 'Гнев дракона пустоты', faction: NEC,
        file: 'js/fs/FSEffects.js',
        old: "build: m => ({ op: 'extraDamage', n: Number(m[1]), who: 'both' }),",
        new: 'build: (m, c, s) => ({ op: \'note\', text: s }),',
        why: 'предложение «вы и ваш противник…» разбирается в урон, а не в пояснение',
    },
    // --- шаги карт: выбор и его последствия --------------------------------
    {
        // «Один раз за раунд» is not a caption: the card is spent, and the
        // second play of the same card in the same round has to be refused.
        card: 'Департаменто муниторум', faction: IG,
        file: 'js/fs/rules/OperationsRules.js',
        old: 'up.used = true;',
        new: '/*мутация: карта не сгорает — играется сколько угодно раз*/',
        why: '«Один раз за раунд»',
    },
    {
        card: 'Департаменто муниторум', faction: IG,
        file: 'js/fs/effects/ask/FSCardAsks.js',
        old: 'OrderContext.of(state.order).setNestedKind(step.kind);',
        new: '/*мутация: выбор ограниченного приказа не запоминается*/',
        why: '«Затем разыграйте ограниченное Развертывание…»',
    },
    {
        card: 'Департаменто муниторум', faction: IG,
        file: 'js/fs/rules/StrategizeRules.js',
        old: 'if (context.nestedKind) {',
        new: 'if (false) {',
        why: 'стратагема превращается во второй, ограниченный приказ',
    },
    {
        card: 'Департаменто муниторум', faction: IG,
        file: 'js/fs/rules/StrategizeRules.js',
        old: "if (kind === 'deploy') DeployScope.of(order).setAreaLimit(1);",
        new: '/*мутация: развёртывание не ограничено одной областью*/',
        why: '«развертывание в 1 области»',
    },
    {
        card: 'Смена военного производства', faction: IG,
        file: 'js/fs/effects/FSChooseSteps.js',
        old: 'if (answer.area) ctx.world = answer.area;',
        new: '/*мутация: выбранный мир не запоминается*/',
        why: '«ресурсы и материалы ЭТОГО мира»',
    },
    {
        card: 'Смена военного производства', faction: IG,
        file: 'js/fs/FSEffects.js',
        old: 'R.player(state, seat).gainMateriel(a.world.materiel || 0);',
        new: '/*мутация: материя мира не приходит*/',
        why: '«материалы этого мира»',
    },
    {
        card: 'Тактический гений', faction: IG,
        file: 'js/fs/effects/FSPlaySteps.js',
        old: 'R.player(state, seat).combatHand.put(name);',
        new: '/*мутация: карта не приходит в руку*/',
        why: '«сыграть любую карту из своей боевой колоды»',
    },
    {
        card: 'Тактический гений', faction: IG,
        file: 'js/fs/effects/FSPlaySteps.js',
        old: 'deck.splice(i, 1);',
        new: '/*мутация: карта остаётся в колоде*/',
        why: 'карта уходит из колоды, а не копируется',
    },
    {
        card: 'Маскированная бомбардировка', faction: IG,
        file: 'js/fs/effects/ask/FSDiceAsks.js',
        old: "faces[at] = step.to || 'att';",
        new: 'faces[at] = faces[at];',
        why: '«перевернуть 1 из своих `morale cube` на `att. cube`»',
    },
    {
        card: 'Маскированная бомбардировка', faction: IG,
        file: 'js/fs/effects/ask/FSDiceAsks.js',
        old: 'const at = plan.dice.findIndex(f => !kind || f === kind);',
        new: 'const at = -1;',
        why: 'переворачивается кубик морали, а не любой',
    },
    // --- удар: порядок урона и возврат отрядов ------------------------------
    {
        card: 'Набег жнецов', faction: NEC,
        file: 'js/fs/core/FSStrike.js',
        old: 'return this.order.strikeFirst || null;',
        new: 'return null;',
        why: '«Этот отряд получит урон первым во время этого орбитального удара»',
    },
    {
        card: 'Набег жнецов', faction: NEC,
        file: 'js/fs/rules/AdvanceRules.js',
        old: 'if (damage.first && damage.untouched && victim.id !== damage.first) {',
        new: 'if (false) {',
        why: 'другому отряду удар не отдают, пока выбранный цел',
    },
    {
        card: 'Сфера воскрешения', faction: NEC,
        file: 'js/fs/rules/CombatRules.js',
        old: '            p.supply.units[pending.def] -= 1;',
        new: '            /*мутация: отряд возвращается из воздуха, запас не тратится*/',
        why: '«вернуть этого юнита» — модель приходит из запаса',
    },
    {
        card: 'Сфера воскрешения', faction: NEC,
        file: 'js/fs/rules/CombatRules.js',
        old: 'const kl = stepR && stepR.maxKl !== undefined ? stepR.maxKl : 1;',
        new: 'const kl = 99;',
        why: '«отряд с командным уровнем 0 или 1» — предел плана',
    },
    // --- боевая колода: жетоны, кубики и «за каждого» ----------------------
    {
        card: 'Ложись!', faction: IG,
        file: 'js/fs/effects/ask/FSTokenAsks.js',
        old: '        const gained = cubes.add(s2, step.kind, n) - before;',
        new: '        const gained = 0; // mutation: no combat tokens',
        why: '«получите 1 `def. token` за каждого недеморализованного Гвардейца»',
    },
    {
        card: 'За Императора!', faction: IG,
        file: 'js/fs/effects/FSDiceSteps.js',
        old: 'if (liveIndex(s2, i)) turn.put(s2, i, R.rollDice(state, 1)[0]);',
        new: '/*мутация: переброс кубика ничего не меняет*/',
        why: '«Перебросьте 1 `any cube`»',
    },
    {
        card: 'Ложись!', faction: IG,
        file: 'js/fs/FSEffects.js',
        old: 'n = (step.n || 1) * (byLevel ? levels.size : amount);',
        new: 'n = 1;',
        why: '«за КАЖДОГО Гвардейца или Крейсера» — счёт по отрядам',
    },
    {
        card: 'Железная дисциплина', faction: IG,
        file: 'js/fs/FSEffects.js',
        old: "const distinctLevel = /разн[а-яёa-z]*\\s+командн[а-яёa-z]*\\s+уровн/i.test(s);",
        new: 'const distinctLevel = false;',
        why: '«за каждый отряд с РАЗНЫМ командным уровнем»',
    },
    {
        card: 'Гибельные косы', faction: NEC,
        file: 'js/fs/effects/ask/FSTokenAsks.js',
        old: 'R.loseReinforcementTokens(state, s2, n);',
        new: '/*мутация: жетон подкрепления не теряется*/',
        why: '«потеряйте 1 жетон подкрепления»',
    },
    {
        card: 'Ложись!', faction: IG,
        file: 'js/fs/FSEffects.js',
        old: "            if (step.max) n = Math.min(n, step.max);\n        }",
        new: "            /*мутация: предел жетонов снят*/\n        }",
        why: '«максимум 3» — предел жетонов за отряды',
    },
    {
        card: 'Подавляющий огонь виверн', faction: IG,
        file: 'js/fs/effects/FSMoveSteps.js',
        old: 'R.routeUnit(state, u, inCombat && combat ? CombatTurn.of(combat).round : null);',
        new: '/*мутация: отряд не деморализуется*/',
        why: '«деморализуйте 1 отряд противника»',
    },
    {
        card: 'Принудительная вербовка', faction: IG,
        file: 'js/fs/effects/ask/FSOrderAsks.js',
        old: '        if (limits) limits.setCitiesAsFactories(step.only);',
        new: '        /*мутация: города не считаются фабриками*/',
        why: '«рассматривать все свои города как фабрики»',
    },
    // --- некроны: кубики, возврат, перенос ---------------------------------
    {
        card: 'Осколок обманщика', faction: NEC,
        file: 'js/fs/effects/ask/FSCardAsks.js',
        old: 'CombatCards.of(combat).put(side, { name, card, side, valuesOnly: true }, CombatTurn.of(combat).round);',
        new: '/*мутация: верхняя карта колоды не даёт значений*/',
        why: '«верхняя карта колоды отдаёт только свои боевые значения»',
    },
    {
        card: 'Триархи преторианцы', faction: NEC,
        file: 'js/fs/effects/FSDiceSteps.js',
        old: "if (inCombat ? liveIndex(s2, i) : turn.has(s2, i)) turn.put(s2, i, answer.face || 'att');",
        new: '/*мутация: грань кубика не меняется*/',
        why: '«переверните кубик на любую грань»',
    },
    {
        card: 'Предвидение криптека', faction: NEC,
        file: 'js/fs/effects/FSPlaceSteps.js',
        old: "        R.board(state).moveUnit(u, answer.area, { seat });\n        R.log(state, seat, state.players[seat].name + ' переносит отряд: «' + (R.unitOf(state, u) || {}).name + '».');",
        new: "        /*мутация: отряд остаётся на месте*/",
        why: '«перенесите 1 ваш отряд в дружественный мир»',
    },
    {
        card: 'Фаланга монолита', faction: NEC,
        file: 'js/fs/effects/ask/FSStrikeAsks.js',
        old: 'CombatPlans.of(combat).addNoDamagePlan({ seat, steps: step.steps || [] });',
        new: '/*мутация: деморализация после урона не ждёт урона*/',
        why: '«урон в конце раунда решает, отступит ли отряд»',
    },
    {
        card: 'Механизированная боевая группа', faction: IG,
        file: 'js/fs/FSEffects.js',
        old: '            for (const [a, b] of step.pairs) pairs += Math.min(n2(a), n2(b));\n            n = (step.n || 1) * pairs;',
        new: '            for (const [a, b] of step.pairs) pairs += Math.min(n2(a), n2(b));\n            n = step.n || 1;',
        why: '«за каждую пару Гвардейцев и Огринов» — счёт по парам',
    },
    {
        card: 'Ратлинг стрелок', faction: IG,
        file: 'js/fs/core/FSCombatDamage.js',
        old: '        this.combat.damageStartTokens = [];\n        return all.filter(x => !x || x.round === undefined || x.round === round);',
        new: '        return [];',
        why: '«в начале шага нанесения повреждений противник теряет 2 `att. token`»',
    },
    {
        card: 'Поддержка титана', faction: IG,
        file: 'js/fs/FSEffects.js',
        old: '            n = (step.n || 1) * (byLevel ? levels.size : amount);',
        new: '            n = (step.n || 1) * amount;',
        why: '«за каждый отряд РАЗНОГО командного уровня»',
    },
    {
        card: 'Железная дисциплина', faction: IG,
        file: 'js/fs/effects/FSChooseSteps.js',
        old: '            R.restoreUnit(state, u);\n            R.log(state, u.seat, state.players[u.seat].name + \': отряд восстановлен.\');',
        new: "            /*мутация: отряд остаётся деморализованным*/",
        why: '«восстановите 1 свой деморализованный отряд»',
    },
    // --- оставшиеся боевые карты ИГ: реквизиты и жетоны --------------------
    {
        card: 'Молот Императора', faction: IG,
        file: 'js/fs/FSEffects.js',
        old: '                if (para.names && present && present.length) {',
        new: '                if (false) {',
        why: 'абзацы под реквизитом («*Титан «Гончая»:*», «*Линкор:*») читаются только при своём отряде',
    },
    {
        card: 'Огринские ударные войска', faction: IG,
        file: 'js/fs/FSEffects.js',
        old: '            if (this.sameName(def.name, t)) return true;',
        new: '            /*мутация: реквизит по имени отряда не срабатывает*/',
        why: '«*Огрин/Крейсер:*» — способность по названному отряду',
    },
    {
        card: 'Адептус Астрономика', faction: IG,
        file: 'js/fs/effects/ask/FSOrderAsks.js',
        old: '        if (march) march.setMoveLimit(step.n || 0);',
        new: '        /*мутация: предел перемещения не ставится*/',
        why: '«переместить в этот мир до 6 отрядов»',
    },
    {
        card: 'Адептус Астрономика', faction: IG,
        file: 'js/fs/effects/ask/FSOrderAsks.js',
        old: "        if (march) march.setMustInclude(step.what);",
        new: '        /*мутация: обязательный Гвардеец не требуется*/',
        why: '«если хотя бы один из этих отрядов — Гвардеец»',
    },
    {
        card: 'Адептус Астрономика', faction: IG,
        file: 'js/fs/effects/ask/FSOrderAsks.js',
        old: '            OrderFight.of(state.order).setRetreatExcess(names[0]);',
        new: '            /*мутация: излишек не отступает*/',
        why: '«отступить любым числом Гвардейцев, превышающим вместимость»',
    },
    // --- события ИГ --------------------------------------------------------
    {
        card: 'Отбрыски Темпестус', faction: IG,
        file: 'js/fs/effects/FSMoveSteps.js',
        old: '            R.routeUnit(state, u, inCombat && combat ? CombatTurn.of(combat).round : null);',
        new: '            /*мутация: отряд не деморализуется*/',
        why: '«деморализуйте 1 вражеский отряд КЛ 0 или 1»',
    },
    {
        card: 'Точечный удар', faction: IG,
        file: 'js/fs/effects/ask/FSStrikeAsks.js',
        old: "            StrikePlan.of(state.order).addBonus(step.n || 0);",
        new: '            /*мутация: удар не усиливается*/',
        why: '«добавить 2 к общей сумме урона»',
    },
    {
        card: 'Ракета «Death Strike»', faction: IG,
        file: 'js/fs/effects/ask/FSStrikeAsks.js',
        old: '        CombatPlans.of(combat).setDeferred({ seat, steps: step.steps || [], eachStep: step.eachStep });',
        new: '        /*мутация: обещание конца шага не регистрируется*/',
        why: '«в конце первого шага нанесения повреждений»',
    },
    {
        card: 'Зов астропатов', faction: IG,
        file: 'js/fs/effects/ask/FSPlaceAsks.js',
        old: '            effects.placeReinforcementAt(R, state, seat, step, BattleField.of(combat).area, side, ctx);',
        new: '            /*мутация: жетон подкрепления не размещается*/',
        why: '«разместить 2 бесплатных жетона подкрепления в спорной области»',
    },
    {
        card: 'Приказ верховного командования', faction: IG,
        file: 'js/fs/FSEffects.js',
        old: "                if (R.structuresAt(state, sys.id, a.pos)\n                    .some(st => st.type === 'factory' && (!ownFactory || st.seat === seat))) n += 1;",
        new: "                if (R.structuresAt(state, sys.id, a.pos)\n                    .some(st => st.type === 'factory' && (!ownFactory || st.seat === seat))) n += 0;",
        why: '«уменьшите его стоимость на 1 за каждый мир с фабрикой»',
    },
    {
        card: 'Имперская десятина', faction: IG,
        file: 'js/fs/effects/ask/FSPlaceAsks.js',
        old: "        return { question: { kind: 'areas', who: seat, op: 'placeFree', n: count, kind2: types[0].id, options: areas, text: 'Где разместить отряды?' } };",
        new: '        return null;',
        why: '«разместите 2 бесплатных Гвардейца» — вопрос о мире',
    },
    // --- боевые карты некронов ---------------------------------------------
    {
        card: 'Воин фланги', faction: NEC,
        file: 'js/fs/effects/ask/FSDiceAsks.js',
        old: '            turn.add(dSide, step.kind === \'any\' ? R.rollDice(state, 1)[0] : step.kind);',
        new: '            /*мутация: кубик не добавляется*/\n            turn.add(dSide, \'att\');',
        why: '«получите 1 `morale cube`»',
    },
    {
        card: 'Свежеватели', faction: NEC,
        file: 'js/fs/effects/ask/FSDiceAsks.js',
        old: '            if (!(CombatTurn.of(combat).indexOf(s2, step.onlyIfFoeHas) >= 0)) return null;',
        new: '            /*мутация: условие «у противника есть кубик» не проверяется*/',
        why: '«если у вашего противника есть `morale cube`»',
    },
    {
        card: 'Разрушители', faction: NEC,
        file: 'js/fs/effects/ask/FSDiceAsks.js',
        old: '            return step.pick ? { stop: true } : null;',
        new: '            return null;',
        why: '«Заплатите кубиком `def.` или `morale` — получите 2 `att. token`»: плата открывает вторую половину',
    },
    {
        card: 'Фаланга судного дня', faction: NEC,
        file: 'js/fs/effects/ask/FSStrikeAsks.js',
        old: '        CombatPlans.of(combat).setRoutedFoe({\n            seat,\n            avoid: step.avoid || { kind: \'def\', n: 1 },\n        });',
        new: '        /*мутация: деморализованный враг не уничтожается*/',
        why: '«деморализованный в этом раунде отряд противника уничтожается»',
    },
    {
        card: 'Рой каноптепов', faction: NEC,
        file: 'js/fs/FSEffects.js',
        old: '        CombatTokens.of(combat).add(tokenSide, n, step.free);',
        new: '        /*мутация: жетон подкрепления не попадает на стол*/',
        why: '«разместите 1 бесплатный жетон подкрепления в этой области»',
    },
    // --- оставшиеся карты ИГ ------------------------------------------------
    {
        card: 'Огневая поддержка', faction: IG,
        file: 'js/fs/effects/FSDiceSteps.js',
        old: '        for (const i of (answer.dice || [])) {\n            if (liveIndex(s2, i)) turn.put(s2, i, R.rollDice(state, 1)[0]);',
        new: '        for (const i of []) {\n            if (liveIndex(s2, i)) turn.put(s2, i, R.rollDice(state, 1)[0]);',
        why: '«перебросьте 1 `def. cube`» — грань кубика меняется',
    },
    {
        card: 'Часовой разведчик', faction: IG,
        file: 'js/fs/FSEffects.js',
        old: "            const mine = field.units(state, seat).filter(u => !u.routed && fit(u)).length\n                + (includeTokens ? tokens.units(side).alive : 0);",
        new: "            const mine = 99;",
        why: '«если у вас больше недеморализованных отрядов, чем у противника»',
    },
    {
        card: 'Боевое содружество', faction: IG,
        file: 'js/fs/FSEffects.js',
        old: '        if (filter.type) return def.type === filter.type;',
        new: '        if (filter.type) return true;',
        why: '«наземный отряд» и «корабль» — разные половины карты',
    },
    {
        card: 'Быкогрин здоровья', faction: IG,
        file: 'js/fs/FSEffects.js',
        old: '                    const fits = para.names.some(n => present.some(pres => this.sameName(pres, n)));',
        new: '                    const fits = true;',
        why: '«*Огрин/Крейсер:*» — абзац читается только при своём отряде',
    },
    // --- некроны: восстановление, деморализация, уничтожение ----------------
    {
        card: 'Воля повелителя', faction: NEC,
        file: 'js/fs/effects/FSChooseSteps.js',
        old: '            R.restoreUnit(state, u);\n            R.log(state, u.seat, state.players[u.seat].name + \': отряд восстановлен.\');',
        new: "            /*мутация: отряд остаётся деморализованным*/",
        why: '«Восстановите 1 свой деморализованный отряд»',
    },
    {
        card: 'Вечное завоевание', faction: NEC,
        file: 'js/fs/FSEffects.js',
        old: "                n = (step.n || 1) * CombatTurn.of(combat).count(s2, step.perKind || 'morale');",
        new: '                n = step.n || 1;',
        why: '«за каждый имеющийся у вас `morale cube` получите 1 `att. cube`»',
    },
    {
        card: 'Лич гвардия', faction: NEC,
        file: 'js/fs/effects/FSMoveSteps.js',
        old: '            R.routeUnit(state, u, inCombat && combat ? CombatTurn.of(combat).round : null);',
        new: '            /*мутация: отряд не деморализуется*/',
        why: '«Деморализуйте 1 ваш отряд» — обмен деморализациями',
    },
    {
        card: 'Осколок несущего ночь', faction: NEC,
        file: 'js/fs/FSEffects.js',
        old: '                return d && (d.kl || 0) <= step.maxKl;',
        new: '                return !!d;',
        why: '«Уничтожьте 1 юнита 0-го командного уровня»',
    },
    // --- приказы и события некронов ----------------------------------------
    {
        card: 'Миры-гробницы', faction: NEC,
        file: 'js/fs/effects/FSPurchaseSteps.js',
        old: "        R.addStructure(state, buyer.seat, 'bastion', area.system, area.pos);",
        new: '        /*мутация: бастион не ставится на поле*/',
        why: '«купить 1 бастион и разместить его в дружественном или нейтральном мире»',
    },
    {
        card: 'Врата вечности', faction: NEC,
        file: 'js/fs/effects/FSMoveSteps.js',
        old: "        R.board(state).moveUnit(u, area, { seat });\n        return null;\n    }\n\n    static route(effects, f) {",
        new: "        /*мутация: отряд остаётся на месте*/\n        return null;\n    }\n\n    static route(effects, f) {",
        why: '«взять … отряд … и поместить его в любой мир … с Монолитом»',
    },
    {
        card: 'Безжалостное наступление', faction: NEC,
        file: 'js/fs/effects/ask/FSStrikeAsks.js',
        old: '        if (combat) CombatDamage.of(combat).setRepeat();',
        new: '        /*мутация: дополнительного шага повреждений нет*/',
        why: '«выполнить 1 дополнительный шаг нанесения повреждений»',
    },
    {
        card: 'Хрономантия', faction: NEC,
        file: 'js/fs/effects/ask/FSCardAsks.js',
        old: '            hand.put(name);\n            drawn++;',
        new: '            /*мутация: карта не попадает в руку*/\n            drawn++;',
        why: '«взять 2 дополнительные боевые карты из колоды»',
    },
    {
        card: 'Смертоукасатели', faction: NEC,
        file: 'js/fs/effects/FSMoveSteps.js',
        old: '            R.routeUnit(state, u, inCombat && combat ? CombatTurn.of(combat).round : null);',
        new: '            /*мутация: отряд не деморализуется*/',
        why: '«деморализовать один вражеский отряд с командным уровнем 0 или 1»',
    },
    {
        card: 'Атакующие протоколы', faction: NEC,
        file: 'js/fs/effects/ask/FSDiceAsks.js',
        old: '            turn.add(dSide, step.kind === \'any\' ? R.rollDice(state, 1)[0] : step.kind);',
        new: '            /*мутация: кубик не добавляется*/\n            turn.add(dSide, \'att\');',
        why: '«2 `att.` на карте и 1 кубик боевого духа от Воина»',
    },
    {
        card: 'Транслокационные крипты', faction: NEC,
        file: 'js/fs/effects/ask/FSOrderAsks.js',
        old: '        if (limits) limits.setCitiesAsFactories(step.only);',
        new: '        /*мутация: города не считаются фабриками*/',
        why: '«рассматривать все ваши города в активной системе как фабрики»',
    },
    {
        card: 'Архивы мира-гробницы', faction: NEC,
        file: 'js/fs/effects/ask/FSBuyAsks.js',
        old: '        return { question: { kind: \'cards\', who: seat, op: \'buyUpgrade\', kind2: kind, options: list, discount, text: \'Какое улучшение купить?\' } };',
        new: '        return null;',
        why: '«Приобретите 1 боевое улучшение» — выбор карты',
    },
    {
        card: 'Пробуждение мира-гробницы', faction: NEC,
        file: 'js/fs/effects/ask/FSPlaceAsks.js',
        old: '            if (!step.free && p.materiel < effects.structureCost(R, step, t)) return false;',
        new: '            if (false) return false;',
        why: '«Купите 1 постройку» — цена берётся из материи',
    },
    {
        card: 'Бронетанковый клин', faction: IG,
        file: 'js/fs/effects/ask/FSStrikeAsks.js',
        old: '            return !!def && [2, 3].includes(def.kl || 0);',
        new: '            return !!def;',
        why: '«выберите один из бастионов или отрядов противника 2 или 3 командного уровня»',
    },
    {
        card: 'Принудительная вербовка', faction: IG,
        file: 'js/fs/effects/ask/FSOrderAsks.js',
        old: '        if (limits) limits.addCapacityBonus(step.n || 0, step.max, step.only);',
        new: '        /*мутация: дополнительной вместимости нет*/',
        why: '«дополнительная вместимость распространяется только на Гвардейцев»',
    },
    // --- общий страж подготовки --------------------------------------------
    {
        // `addUnit` refusing a foreign id is what uncovered the fixtures of
        // another faction; without a check the guard itself is dead weight.
        card: 'Подготовка боя', faction: IG,
        file: 'js/fs/rules/SetupRules.js',
        old: 'if (!FS_CATALOG.unit(faction, unitId)) {',
        new: 'if (false) {',
        why: 'движок отказывает отряду чужой фракции',
    },
    // --- бой: значения и мораль -------------------------------------------
    {
        // The write side of the extra damage (`addExtra`) and the read side
        // (`extra`) are two different lines: a card may be parsed and recorded
        // and still never reach the damage of the step.
        card: 'Гнев дракона пустоты', faction: NEC,
        file: 'js/fs/core/FSCombatDamage.js',
        old: "if (side === 'attacker') return damage + extraFoe + (c.extraDamageBoth || 0);",
        new: "if (side === 'attacker') return damage + extraFoe;",
        why: 'записанный картой урон обязан дойти до шага урона',
    },
    {
        card: 'Протоколы реанимации', faction: NEC,
        file: 'js/fs/rules/CombatRules.js',
        old: 'restoreUnit(state, unit) {\n        if (!unit) return false;\n        unit.routed = false;',
        new: 'restoreUnit(state, unit) {\n        if (!unit) return false;\n        unit.routed = true;',
        why: '«восстановите всех ваших юнитов» — восстановление снимает деморализацию',
    },
];

/** `old` must be unique in `file`; when it is not, a longer anchor fixes it. */
const args = process.argv.slice(2);
const argOf = name => {
    const hit = args.find(a => a.startsWith('--' + name + '='));
    return hit ? hit.slice(name.length + 3) : null;
};
const FACTION = argOf('faction');
const LIST = args.includes('--list');
const paint = (on, code, text) => (on ? code + text + '\x1b[0m' : text);

const rows = FACTION ? TABLE.filter(m => m.faction === FACTION) : TABLE;
if (LIST) {
    for (const m of rows) console.log([m.faction, m.card, m.file, m.why].join(' | '));
    process.exit(0);
}

/** The check run of one faction, as a count of red lines and the failing names. */
function run(faction) {
    let out = '';
    try {
        out = execFileSync('node', ['tools/fs-card-check.mjs', '--faction=' + faction],
            { encoding: 'utf8', timeout: 600000 });
    } catch (e) {
        out = (e.stdout || '') + (e.stderr || '');
    }
    const plain = out.replace(/\x1b\[[0-9;]*m/g, '');
    const failed = plain.split('\n').filter(l => /^  FAIL/.test(l))
        .map(l => l.replace(/^  FAIL\s*/, ''));
    return { failed, passed: /Все проверки прошли/.test(plain) };
}

console.log('\x1b[1m  Мутационная таблица карт: сломанная строка обязана покраснеть\x1b[0m');

const survivors = [];
let killed = 0;
for (const m of rows) {
    const original = fs.readFileSync(m.file, 'utf8');
    const at = original.split(m.old).length - 1;
    if (at !== 1) {
        console.log('  ' + paint(true, '\x1b[31m', 'якорь') + '  ' + m.card
            + ' — строка встречается ' + at + ' раз(а), нужно ровно одну');
        survivors.push({ ...m, why2: 'якорь' });
        continue;
    }
    fs.writeFileSync(m.file, original.replace(m.old, m.new));
    let res;
    try {
        res = run(m.faction);
    } finally {
        fs.writeFileSync(m.file, original);
    }
    if (res.failed.length) {
        killed++;
        console.log('  ' + paint(true, '\x1b[32m', 'ловит') + '  ' + m.card
            + ' — ' + res.failed.length + ' проверк(и) красные: ' + res.failed[0].slice(0, 90));
    } else {
        console.log('  ' + paint(true, '\x1b[31m', 'выжила') + ' ' + m.card + ' — ' + m.why);
        survivors.push(m);
    }
}

// The unmutated run must be green, otherwise a "killed" row proves nothing.
for (const faction of [...new Set(rows.map(m => m.faction))]) {
    const res = run(faction);
    console.log('  ' + (res.passed ? paint(true, '\x1b[32m', 'зелено') : paint(true, '\x1b[31m', 'красно'))
        + ' ' + faction + ' без мутаций');
    if (!res.passed) survivors.push({ card: faction, why: 'чистый прогон красный' });
}

console.log('\n  Мутаций: ' + rows.length + ', поймано: ' + killed
    + ', выжило: ' + survivors.length);
if (survivors.length) {
    for (const s of survivors) console.log('    — ' + s.card + ' (' + s.faction + '): ' + s.why);
    process.exit(1);
}
