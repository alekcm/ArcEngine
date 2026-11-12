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
    // --- камера: поворот правой кнопкой и клавиши ----------------------
    {
        check: 'cam-1',
        file: 'js/CameraControl.js',
        old: '        if (!this.azimuthLocked) this.azimuth += dAzimuth;',
        new: '        void dAzimuth;',
        why: 'поворот по горизонтали не применяется: камера не крутится правой кнопкой',
    },
    {
        check: 'cam-1b',
        file: 'js/CameraControl.js',
        old: "        else if (e.button === 2 && this.azimuthLocked) mode = 'pan';\n        else if (e.button === 2 && (this.free || this.c.orbit > 0)) mode = this.followObj ? 'orbit' : 'look';",
        new: "        else if (e.button === 2) mode = 'pan';",
        why: 'правая кнопка только панорамирует: камеру не повернуть никогда',
    },
    {
        check: 'cam-2',
        file: 'js/CameraControl.js',
        old: '        this.pitch = this._clampPitch(this.pitch + dPitch);',
        new: '        this.pitch = this.pitch;',
        why: 'наклон камеры не применяется',
    },
    {
        check: 'cam-2b',
        file: 'js/CameraControl.js',
        old: '        const tx = e.x + Math.cos(this.azimuth) * cp * d;\n        const ty = e.y + Math.sin(this.azimuth) * cp * d;',
        new: '        const tx = e.x;\n        const ty = e.y;',
        why: 'вид не поворачивается: точка взгляда остаётся в глазу, камера «переезжает»',
    },
    {
        check: 'cam-3',
        file: 'js/CameraControl.js',
        old: "    KeyA: [0, -1, 0], ArrowLeft: [0, -1, 0], KeyD: [0, 1, 0], ArrowRight: [0, 1, 0]\n};",
        new: "    KeyA: [0, -1, 0], ArrowLeft: [0, -1, 0], KeyD: [0, 1, 0], ArrowRight: [0, 1, 0],\n    KeyQ: [0, 0, -1], KeyE: [0, 0, 1]\n};",
        why: 'старое поведение вернулось: Q/E снова двигают камеру',
    },
    {
        check: 'cam-4',
        file: 'js/CameraControl.js',
        old: '        if (CameraController.FLY_KEYS[e.code]) {',
        new: "        if (e.code === 'KeyQ' || e.code === 'KeyE') { e.preventDefault(); return; }\n        if (CameraController.FLY_KEYS[e.code]) {",
        why: 'камера перехватывает Q/E: игра не получает поворот тайла',
    },
    {
        check: 'cam-5',
        file: 'js/fs/FSGame.js',
        old: "            const action = { KeyQ: 'left', KeyE: 'right', KeyF: 'flip' }[e.code];",
        new: "            const action = { KeyF: 'flip' }[e.code];",
        why: 'сборка карты потеряла поворот тайла',
    },
    {
        check: 'cam-6',
        file: 'js/fs/FSGame.js',
        old: '        cam.azimuth = -Math.PI / 2;                       // north up',
        new: '        cam.azimuth = -Math.PI / 2; cam.lockAzimuth(true); // north up',
        why: 'игра запирает азимут при настройке камеры',
    },
    {
        check: 'cam-7',
        file: 'js/fs/FSGame.js',
        old: '        const deg = -cam.azimuth * 180 / Math.PI - 90;',
        new: '        const deg = cam.azimuth * 180 / Math.PI - 90;',
        why: 'компас врёт в другую сторону: знак угла перепутан',
    },
    // --- панель приказа и правая кнопка --------------------------------
    {
        check: 'panel-4',
        file: 'js/fs/FSGame.js',
        old: '        // одного и того же только мешали читать панель.\n        ctx.tokens = [];',
        new: "        // одного и того же только мешали читать панель.\n        ctx.tokens = (faction ? faction.units : []).filter(d => d.type !== 'ship')\n            .map(d => ({ icon: 'mark.ground', label: d.name, count: supply[d.id] || 0 }));",
        why: 'полоса «Ваши жетоны» вернулась в панель производства',
    },
    {
        check: 'panel-5',
        file: 'js/fs/FSGame.js',
        // Тот же счёт есть и в обычном развёртывании: мутация адресуется
        // подсказкой производства, иначе якорь не один.
        // Якорь тянется до конца подсказки: тот же счёт есть и в обычном
        // развёртывании, и без хвоста строка встречается дважды.
        old: "label: def.name, count: n,\n                    hint: cost + ' материи · КЛ ' + Math.max(0, kl) + ' · бой ' + def.combat\n                        + (def.forge",
        new: "label: def.name,\n                    hint: cost + ' материи · КЛ ' + Math.max(0, kl) + ' · бой ' + def.combat\n                        + (def.forge",
        why: 'счёт отрядов снят с самих войск: теперь его нет нигде',
    },
    {
        check: 'right-1',
        file: 'js/fs/FSGame.js',
        old: '                right = { x: e.clientX, y: e.clientY, id: e.pointerId };',
        new: "                right = { x: e.clientX, y: e.clientY, id: e.pointerId };\n                this.onRightClick(e.clientX, e.clientY);",
        why: 'отмена снова срабатывает на нажатии ПКМ, до протяжки',
    },
    {
        check: 'right-1',
        file: 'js/fs/FSGame.js',
        old: '                if (travelled > 6) return;     // a drag — the camera, not a cancel',
        new: '                void travelled;                 // a drag — the camera, not a cancel',
        why: 'протяжка ПКМ снова считается щелчком и отменяет действие',
    },
    // --- правый низ: один размер ----------------------------------------
    {
        check: 'layout-1',
        file: 'js/fs/FSUI.css',
        old: '--fs-panel-w:min(356px,calc(100vw - 36px));--fs-panel-h:69vh;',
        new: '--fs-panel-w:min(534px,calc(100vw - 36px));--fs-panel-h:69vh;',
        why: 'ширина панели снова как у широкой доработки: 534px вместо 356px',
    },
    {
        check: 'layout-1b',
        file: 'js/fs/FSUI.css',
        old: '.fs-main-panel{position:absolute;top:auto;right:0;bottom:0;height:var(--fs-panel-h);max-height:var(--fs-panel-h);width:var(--fs-panel-w);',
        new: '.fs-main-panel{position:absolute;top:auto;right:0;bottom:0;height:69vh;max-height:69vh;width:min(534px,calc(100vw - 36px));',
        why: 'панель снова задаёт себе размер сама, в обход переменных',
    },
    {
        check: 'layout-2',
        file: 'js/fs/FSUI.css',
        old: '.fs-shell.is-battle .fs-main-panel{width:var(--fs-panel-w)}',
        new: '.fs-shell.is-battle .fs-main-panel{width:min(330px,calc(100vw - 36px))}',
        why: 'бой снова сужает панель',
    },
    {
        check: 'layout-2b',
        file: 'js/fs/FSUI.css',
        old: '@media(max-width:700px){.fs-shell:not(.is-mobile) .fs-left-rail{width:300px}',
        new: '@media(max-width:700px){.fs-shell.is-planning .fs-main-panel{width:min(420px,calc(100vw - 36px))}.fs-shell:not(.is-mobile) .fs-left-rail{width:300px}',
        why: 'этап планирования снова меняет ширину панели',
    },
    {
        check: 'layout-3',
        file: 'js/fs/FSUI.js',
        old: '        const battle = this.renderBattle(ctx.battle);\n        if (battle) panel.append(battle);',
        new: '        const battle = this.renderBattle(ctx.battle);\n        if (battle) root.append(battle);',
        why: 'счёт боя снова отдельной плашкой в том же углу',
    },
    {
        check: 'layout-3b',
        file: 'js/fs/FSUI.css',
        old: '.fs-battle-panel{position:static;flex:1 1 auto;min-height:0;',
        new: '.fs-battle-panel{position:absolute;left:10px;bottom:10px;height:33vh;flex:1 1 auto;min-height:0;',
        why: 'у счёта боя снова своё место и свой размер',
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
    // --- сдвиг шторма: призрак, его геометрия и клик -------------------------
    {
        check: 'storm-ghost-1',
        file: 'js/fs/FSGame.js',
        old: '                this.view.stormGhosts = FS_RULES.stormOptions(view, viewSeat)',
        new: '                this.view.stormGhosts = []',
        why: 'кликом выбрали шторм, но направления на доске не показаны',
    },
    {
        check: 'storm-ghost-1',
        file: 'js/fs/FSWarpStorms.js',
        old: '            : { x: ox + (this.col - 0.5) * T, y: oy + this.row * T, horizontal: false };',
        new: '            : { x: ox + this.col * T, y: oy + this.row * T, horizontal: false };',
        why: 'вертикальная полоса сдвинута с грани на середину тайла',
    },
    {
        check: 'storm-ghost-1',
        file: 'js/fs/FSView.js',
        old: '                width: horizontal ? this.TILE - 20 : 6,\n                depth: horizontal ? 6 : this.TILE - 20,\n                height: 5,',
        new: '                width: horizontal ? 6 : this.TILE - 20,\n                depth: horizontal ? this.TILE - 20 : 6,\n                height: 5,',
        why: 'призрачная полоса нарисована поперёк отмеченной грани',
    },
    {
        check: 'storm-ghost-1',
        file: 'js/fs/FSView.js',
        old: "            root.metadata = { fs: 'storm-ghost', storm: ghost.storm, dir: ghost.dir,",
        new: "            root.metadata = { fs: 'storm-ghost', storm: ghost.storm, dir: 'N',",
        why: 'у обеих нарисованных полос одно направление клика',
    },
    {
        check: 'storm-ghost-1',
        file: 'js/fs/FSGame.js',
        old: "            this.net.cmd({ type: 'moveStorm', storm: this.pending.storm, dir });",
        new: "            this.net.cmd({ type: 'moveStorm', storm: this.pending.storm, dir: 'N' });",
        why: 'клик по полосе отправляет другую стрелку вместо выбранной',
    },
    // --- плашки боя ----------------------------------------------------------
    {
        check: 'combat-chip-1',
        file: 'js/fs/FSView.js',
        old: '            const hp = CombatDamage.of(c).health(u.seat, def.health || 1);',
        new: '            const hp = CombatDamage.of(c).health(u.seat, CombatSides.seatOf(c, CombatSides.sideOf(c, u.seat)), def.health || 1);',
        why: 'в базу здоровья попадает номер места: каждая плашка показывает одно сердце',
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
