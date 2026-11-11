// ============================================================================
//  fs-mutate-screens.mjs — мутационная таблица проверок экрана
// ----------------------------------------------------------------------------
//  node tools/fs-mutate-screens.mjs              все мутации
//  node tools/fs-mutate-screens.mjs lobby        только проверки со словом
//  node tools/fs-mutate-screens.mjs --list       напечатать таблицу
//
//  fs-mutate-rules.mjs делает это для правил. Экраны оставались без такой
//  таблицы — и дважды ломались незамеченными: лобби не рисовалось вовсе, а
//  миры съезжали к центру тайла и наезжали друг на друга. Обе поломки были в
//  коде, который ни одна проверка правил не трогает.
//
//  Правило таблицы то же: ломать смысл, а не форматирование. Мутация обязана
//  быть такой, какою её мог бы сделать человек: «взять функцию вместо её
//  значения», «взять половину вместо целого», «спросить .is() у ничего».
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');

/**
 * `old` обязан встречаться в `file` ровно один раз; `check` — фильтр
 * tools/fs-screens.mjs (подстрока имени проверки или её текста).
 */
const TABLE = [
    // --- лобби ---------------------------------------------------------------
    {
        check: 'lobby-1',
        file: 'js/fs/FSUI.js',
        old: "        root.classList.toggle('is-planning', !!game && game.is(GamePhase.PLANNING));",
        new: "        root.classList.toggle('is-planning', game.is(GamePhase.PLANNING));",
        why: 'лобби без состояния: GamePhase.of(null).is() роняет отрисовку ДО меню — на экране пустая сцена',
    },
    {
        check: 'lobby-2',
        file: 'js/fs/FSUI.js',
        old: '        this.currentLobby = null;\n        this.renderModern(state, ctx);',
        new: '        this.renderModern(state, ctx);',
        why: 'отрисовка не выходит из режима лобби: меню остаётся поверх партии, доски не видно',
    },
    // --- панель участников ---------------------------------------------------
    {
        check: 'panel-1',
        file: 'js/fs/FSUI.js',
        old: "[['asset.forge', count('forge'), 'Кузницы'], ['asset.cache', count('cache'), 'Запасы'], ['order.event', count('reinforcement'), 'Подкрепления']]",
        new: "[['asset.forge', count, 'Кузницы'], ['asset.cache', count, 'Запасы'], ['order.event', count, 'Подкрепления']]",
        why: 'в панели участников печатается исходник замыкания вместо чисел жетонов',
    },
    {
        check: 'panel-2',
        file: 'js/fs/FSUI.js',
        old: "            [['asset.forge', count('forge'), 'Кузницы'], ['asset.cache', count('cache'), 'Запасы'], ['order.event', count('reinforcement'), 'Подкрепления']].forEach(([icon, amount, title]) => {",
        new: "            [['asset.forge', count('forge'), 'Кузницы'], ['asset.cache', count('forge'), 'Запасы'], ['order.event', count('forge'), 'Подкрепления']].forEach(([icon, amount, title]) => {",
        why: 'все три значка показывают одно число — тайники и подкрепления врут',
    },
    {
        check: 'panel-3',
        file: 'js/fs/FSUI.js',
        old: "        header.append(this.el('span', 'fs-brand', 'FORBIDDEN STARS'), this.el('i', 'fs-divider'));",
        new: "        header.append(this.el('span', 'fs-brand', ''), this.el('i', 'fs-divider'));",
        why: 'верхняя плашка партии пустая — не видно, что игра началась',
    },
    // --- стол: четверть тайла ------------------------------------------------
    {
        check: 'table-1',
        file: 'js/fs/core/FSGeometry.js',
        old: '        return { cx: r.x + r.w / 2, cy: r.y + r.h / 2, size: r.w };',
        new: '        return { cx: r.x + r.w / 4, cy: r.y + r.h / 4, size: r.w / 2 };',
        why: 'четверть тайла сжата вдвое: миры съезжают к центру и наезжают друг на друга',
    },
    {
        check: 'table-2',
        file: 'js/fs/FSView.js',
        old: '        return { x: p.x + (q.cx - 0.5) * this.TILE, y: p.y + (q.cy - 0.5) * this.TILE };',
        new: '        return { x: p.x + (q.cx - 0.5) * this.TILE / 2, y: p.y + (q.cy - 0.5) * this.TILE / 2 };',
        why: 'раскладка берёт половину тайла: миры стоят вдвое ближе, чем четверть',
    },
    {
        check: 'table-3',
        file: 'js/fs/FSView.js',
        old: '    PLANET_D: 96,          // world px: the diameter of the round face of a world',
        new: '    PLANET_D: 260,         // world px: the diameter of the round face of a world',
        why: 'мир больше своего тайла и свисает на соседние',
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

/** Прогон одной проверки экрана: сколько строк FAIL и что именно упало. */
function run(check) {
    let out = '';
    try {
        out = execFileSync('node', ['tools/fs-screens.mjs', check], { cwd: ROOT, encoding: 'utf8', timeout: 600000 });
    } catch (e) {
        out = (e.stdout || '') + (e.stderr || '');
    }
    const plain = out.replace(/\x1b\[[0-9;]*m/g, '');
    const failed = plain.split('\n').filter(l => /^\s+FAIL/.test(l)).map(l => l.trim().replace(/^FAIL\s*/, ''));
    if (!failed.length && /0 проверок/.test(plain)) return { failed: ['ни одна проверка не выбрана фильтром'] };
    return { failed };
}

console.log('\x1b[1m  Мутации экранов: сломанный экран обязан покраснеть\x1b[0m');

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
    const out = execFileSync('node', ['tools/fs-screens.mjs'], { cwd: ROOT, encoding: 'utf8', timeout: 600000 });
    if (!/0 провалов/.test(out.replace(/\x1b\[[0-9;]*m/g, ''))) clean = { failed: ['чистый прогон не сказал «0 провалов»'] };
} catch (e) {
    clean = { failed: ['чистый прогон красный'] };
}
console.log('  ' + (clean.failed.length ? paint('\x1b[31m', 'красно') : paint('\x1b[32m', 'зелено')) + ' экраны без мутаций');
if (clean.failed.length) survivors.push({ check: '—', why: clean.failed[0] });

console.log('\n  Мутаций: ' + rows.length + ', поймано: ' + killed + ', выжило: ' + survivors.length);
if (survivors.length) {
    for (const s of survivors) console.log('    — ' + s.check + ': ' + s.why);
    process.exit(1);
}
