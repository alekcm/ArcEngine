//  fs-mutate.mjs — the mutation table of the card checks
//
//  node tools/fs-mutate.mjs                 run every mutation of both factions
//  node tools/fs-mutate.mjs --faction=IG    one faction
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

/**
 * `old` must occur exactly once in `file`: a mutation with two anchors would
 * change a line nobody can find again.
 */
const TABLE = [
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
        old: 'if (!StrikePlan.of(order).ignoresBastion',
        new: 'if (StrikePlan.of(order).ignoresBastion',
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
        old: 'if (damage.first && damage.untouched && unit.id !== damage.first) {',
        new: 'if (false) {',
        why: 'другому отряду удар не отдают, пока выбранный цел',
    },
    {
        card: 'Сфера воскрешения', faction: NEC,
        file: 'js/fs/rules/CombatRules.js',
        old: 'if ((p.supply.units[pending.def] || 0) > 0) p.supply.units[pending.def] -= 1;',
        new: '/*мутация: отряд возвращается из воздуха, запас не тратится*/',
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
        old: 'CombatCubes.of(combat).add(s2, step.kind, n);',
        new: '/*мутация: жетоны боя не выдаются*/',
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
        old: 'n = (step.n || 1) * amount;',
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
        file: 'js/fs/effects/ask/FSStrikeAsks.js',
        old: '            n = (step.n || 1) * pairs;',
        new: '            n = step.n || 1;',
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
        file: 'js/fs/effects/ask/FSDiceAsks.js',
        old: '                amount = levels.size;',
        new: '                amount = here.length;',
        why: '«за каждый отряд РАЗНОГО командного уровня»',
    },
    {
        card: 'Железная дисциплина', faction: IG,
        file: 'js/fs/effects/FSChooseSteps.js',
        old: '            R.restoreUnit(state, u);\n            R.log(state, u.seat, state.players[u.seat].name + \': отряд восстановлен.\');',
        new: "            /*мутация: отряд остаётся деморализованным*/",
        why: '«восстановите 1 свой деморализованный отряд»',
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
