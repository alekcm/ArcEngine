// ============================================================================
//  fs-single-source.mjs — «одно правило — одна реализация».
// ----------------------------------------------------------------------------
//  Зачем. Правило, записанное дважды (цена жетона запасов в отряде и в
//  постройке, скидка карты в покупке, возврате и панели), расходится при
//  первой же правке: меняешь одно место — второе молча остаётся старым. Тесты
//  этого не видят: каждый путь по отдельности работает.
//
//  Как. Для каждого правила записано, где ему ЖИТЬ (`home`) и сколько копий
//  формулы допустимо вне дома (`max`). Упоминания имени правила (геттеры,
//  разбор текста) не считаются реализацией — считается только сама формула.
//
//    node tools/fs-single-source.mjs          — отчёт и код возврата
//    node tools/fs-single-source.mjs --list   — все найденные места
//
//  Когда скрипт упал — не расширяйте список, а уберите копию: у правила
//  должен быть один метод, все вызовы идут через него (cardPrice, unitPrice,
//  CACHE_VALUE). Если строка — совпадение, а не правило, допишите файл в
//  `except` с причиной.
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const FS_DIR = path.join(ROOT, 'js', 'fs');
const cfg = 'js/fs/core/FSRulesConfig.js';

/**
 * `copy` — формула правила: сколько строк с ней допустимо вне `home`.
 * `definition` — единственное место, где правило записано числом или методом.
 */
const RULES = [
    {
        name: 'ценность жетона запасов',
        home: cfg,
        copy: [
            // «кеш даёт два материала», записанное голой двойкой.
            { re: /o\.cache\s*\)\s*cost\s*=\s*Math\.max\(0,\s*cost\s*-\s*2\)/, max: 0 },
            { re: /o\.cache\s*\?\s*2\s*:\s*0/, max: 0 },
        ],
        // Определение — объявление числа в конфиге; использования (
        // `FS_RULES_CONFIG.CACHE_VALUE`) копиями не считаются.
        definition: [{ re: /^\s{4}CACHE_VALUE\s*:\s*\d+\s*,?$/, max: 1 }],
    },
    {
        name: 'скидка на карты улучшений',
        home: 'js/fs/rules/StrategizeRules.js',
        copy: [
            // Сама формула цены карты: «стоимость минус скидка».
            // Любое «<что-то>.cost - (p.cardDiscount || 0)» вне дома.
            { re: /[\w$]+\.cost\s*-\s*\(p\.cardDiscount\s*\|\|\s*0\)/, max: 0 },
        ],
        // Само объявление метода, а не его вызовы.
        definition: [{ re: /^\s{4}cardPrice\(state, seat, card\)\s*\{$/, max: 1 }],
    },
    {
        name: 'цена отряда и постройки приказа',
        home: 'js/fs/rules/DeployRules.js',
        copy: [
            // Вне DeployRules цену приказа никто не считает: клиент спрашивает
            // у правила (unitPrice / structurePrice). Внутри дома скидки
            // применяются трижды (скидка отряда, общая скидка, постройка) — это
            // разные покупки одного правила, а не копии.
            { re: /cost\s*=\s*Math\.max\(0,\s*cost\s*-\s*deal\./, max: 3, homeOnly: true },
        ],
        definition: [{ re: /^\s{4}(unitPrice|structurePrice)\(state, seat,/, max: 2 }],
    },
];

/** Все .js файлы движка (js/fs), без сборки build/. */
function files(dir) {
    const out = [];
    for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
        const at = path.join(dir, name.name);
        if (name.isDirectory()) out.push(...files(at));
        else if (name.name.endsWith('.js')) out.push(at);
    }
    return out;
}

/** Строки кода без комментариев (построчно: // и /* … *\/ блоками). */
function codeLines(src) {
    const out = [];
    let block = false;
    for (const line of src.split('\n')) {
        let text = line;
        if (block) {
            const end = text.indexOf('*/');
            if (end < 0) continue;
            text = text.slice(end + 2);
            block = false;
        }
        const start = text.indexOf('/*');
        if (start >= 0 && text.indexOf('*/', start) < 0) {
            text = text.slice(0, start);
            block = true;
        }
        out.push(text.replace(/\/\/.*$/, ''));
    }
    return out;
}

const SOURCES = files(FS_DIR).map(file => ({
    rel: path.relative(ROOT, file).replace(/\\/g, '/'),
    lines: codeLines(fs.readFileSync(file, 'utf8')),
}));

const hits = [];
for (const rule of RULES) {
    for (const kind of ['copy', 'definition']) {
        for (const item of rule[kind] || []) {
            for (const src of SOURCES) {
                for (let i = 0; i < src.lines.length; i++) {
                    item.re.lastIndex = 0;
                    if (!item.re.test(src.lines[i])) continue;
                    hits.push({
                        rule: rule.name, kind, home: rule.home, max: item.max,
                        file: src.rel, line: i + 1, text: src.lines[i].trim(),
                    });
                }
            }
        }
    }
}

if (process.argv.includes('--list')) {
    for (const h of hits) console.log(`${h.file}:${h.line}  [${h.rule} / ${h.kind}]  ${h.text}`);
}

const failed = [];
for (const rule of RULES) {
    const mine = hits.filter(h => h.rule === rule.name);
    for (const kind of ['copy', 'definition']) {
        for (const item of rule[kind] || []) {
            let found = mine.filter(h => h.kind === kind && item.re.test(h.text));
            // `homeOnly` считает копии вне дома: внутри дома их сколько угодно.
            if (item.homeOnly) found = found.filter(h => h.file !== rule.home);
            if (found.length <= item.max) continue;
            failed.push({ rule, kind, found, max: item.max });
        }
    }
}

if (!failed.length) {
    console.log(`  Единственность правил: ${RULES.length} правил, по одной реализации.`);
    process.exit(0);
}
for (const { rule, kind, found, max } of failed) {
    const what = kind === 'copy' ? 'копий' : 'определений';
    console.log(`FAIL  «${rule.name}»: ${what} ${found.length}, допустимо ${max}. Дом — ${rule.home}`);
    for (const h of found) console.log(`        ${h.file}:${h.line}  ${h.text}`);
}
process.exit(1);
