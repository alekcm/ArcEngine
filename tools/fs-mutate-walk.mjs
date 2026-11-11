// ============================================================================
//  fs-mutate-walk.mjs — мутационная таблица прохода партии
// ----------------------------------------------------------------------------
//  node tools/fs-mutate-walk.mjs              все мутации
//  node tools/fs-mutate-walk.mjs ответ        только мутации со словом
//  node tools/fs-mutate-walk.mjs --list       напечатать таблицу
//
//  fs-mutate-rules.mjs и fs-mutate-screens.mjs делают это для правил и
//  экранов. Проход (fs-walk.mjs) проверяет стык — сериализацию состояния,
//  протокол ответов, кнопки панелей, — и его мутации ломают именно стык:
//  «положить в покупку объект вместо флага», «ответить номером вместо
//  области», «взять чужих отрядов вместо своих», «опечататься в имени
//  команды». Правило то же: ломать смысл, а не форматирование.
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');

/**
 * `old` обязан встречаться в `file` ровно один раз; `check` — фильтр
 * tools/fs-walk.mjs (подстрока имени проверки).
 */
const TABLE = [
    {
        check: 'Массовое',
        file: 'js/fs/rules/DeployRules.js',
        old: 'forge: !!def.forge, forgeKl, cache, deal: !!supplyDeal,',
        new: 'forge: !!def.forge, forgeKl, cache, deal: OrderDeal.of(order),',
        why: 'в запись покупки снова попадает объект-вид приказа: состояние не пересылается через JSON',
    },
    {
        check: 'ИГ против некронов',
        file: 'js/fs/FSGame.js',
        old: "onClick: () => send({ [q.answerKey || 'area']: area }),",
        new: 'onClick: () => send({ choice: 0 }),',
        why: 'кнопка-строка области отвечает номером вместо области: движок переспрашивает, партия встаёт',
    },
    {
        check: 'переполнение',
        file: 'js/fs/FSGame.js',
        old: 'const mine = entry ? s.units.filter(u => u.seat === me && u.system === entry.system && u.area === entry.pos) : [];',
        new: 'const mine = entry ? s.units.filter(u => u.seat !== me && u.system === entry.system && u.area === entry.pos) : [];',
        why: 'панель переполнения показывает чужих отрядов вместо своих: убирать нечего, кнопок нет',
    },
    {
        check: 'ИГ против некронов',
        file: 'js/fs/FSGame.js',
        old: 'Object.keys(FS_RULES_CONFIG.ORDER_NAMES)',
        new: 'Object.keys(FS_RULES_CONFIG.ORDER_NAME)',
        why: 'опечатка в имени поля конфига: панель планирования падает на ходу игрока',
    },
    {
        check: 'каждая кнопка',
        file: 'js/fs/FSGame.js',
        old: "onClick: () => this.net.cmd({ type: 'finishStrategize' }),",
        new: "onClick: () => this.net.cmd({ type: 'finishStrategiz' }),",
        why: 'опечатка в типе команды: кнопка «Закончить приказ» не делает ничего и никогда',
    },
];

const args = process.argv.slice(2);
const filter = args.find(a => !a.startsWith('--')) || '';
const LIST = args.includes('--list');
const paint = (code, text) => code + text + '\x1b[0m';

const rows = filter ? TABLE.filter(m => (m.check + ' ' + m.why).toLowerCase().includes(filter.toLowerCase())) : TABLE;
if (LIST) {
    for (const m of rows) console.log([m.check, m.file, m.why].join(' | '));
    process.exit(0);
}

/** Прогон одной проверки прохода: сколько строк FAIL и что именно упало. */
function run(check) {
    let out = '';
    try {
        out = execFileSync('node', ['tools/fs-walk.mjs', '--seed=1', check], { cwd: ROOT, encoding: 'utf8', timeout: 120000 });
    } catch (e) {
        out = (e.stdout || '') + (e.stderr || '');
    }
    const plain = out.replace(/\x1b\[[0-9;]*m/g, '');
    const failed = plain.split('\n').filter(l => /^\s+FAIL/.test(l)).map(l => l.trim().replace(/^FAIL\s*/, ''));
    if (!failed.length && /: 0 проверок/.test(plain)) return { failed: ['ни одна проверка не выбрана фильтром'] };
    return { failed };
}

console.log('\x1b[1m  Мутации прохода: сломанный стык обязан покраснеть\x1b[0m');

const survivors = [];
let killed = 0;
for (const m of rows) {
    const file = path.join(ROOT, m.file);
    const original = fs.readFileSync(file, 'utf8');
    const at = original.split(m.old).length - 1;
    if (at !== 1) {
        console.log('  ' + paint('\x1b[31m', 'якорь') + '  ' + m.check + ' — строка встречается ' + at + ' раз(а), нужна ровно одна');
        survivors.push({ ...m, why2: 'якорь' });
        continue;
    }
    fs.writeFileSync(file, original.replace(m.old, m.new));
    let res;
    try {
        res = run(m.check);
    } finally {
        fs.writeFileSync(file, original);
    }
    if (res.failed.length) {
        killed++;
        console.log('  ' + paint('\x1b[32m', 'ловит') + '  ' + m.check + ' — ' + res.failed[0].slice(0, 100));
    } else {
        console.log('  ' + paint('\x1b[31m', 'выжила') + ' ' + m.check + ' — ' + m.why);
        survivors.push(m);
    }
}

// Чистый прогон обязан быть зелёным, иначе «поймано» ничего не значит.
let clean = { failed: [] };
try {
    const out = execFileSync('node', ['tools/fs-walk.mjs'], { cwd: ROOT, encoding: 'utf8', timeout: 300000 });
    if (!/0 провалов/.test(out.replace(/\x1b\[[0-9;]*m/g, ''))) clean = { failed: ['чистый прогон не сказал «0 провалов»'] };
} catch (e) {
    clean = { failed: ['чистый прогон красный'] };
}
console.log('  ' + (clean.failed.length ? paint('\x1b[31m', 'красно') : paint('\x1b[32m', 'зелено')) + ' проход без мутаций');
if (clean.failed.length) survivors.push({ check: '—', why: clean.failed[0] });

console.log('\n  Мутаций: ' + rows.length + ', поймано: ' + killed + ', выжило: ' + survivors.length);
if (survivors.length) {
    for (const s of survivors) console.log('    — ' + s.check + ': ' + s.why);
    process.exit(1);
}
