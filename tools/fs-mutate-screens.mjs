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
        old: "            header.append(this.el('span', 'fs-brand', 'FORBIDDEN STARS'), this.el('i', 'fs-divider'));",
        new: "            header.append(this.el('span', 'fs-brand', ''), this.el('i', 'fs-divider'));",
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
    {
        check: 'cam-8',
        file: 'js/fs/FSGame.js',
        old: '        cam.altWASD = true;                               // keep flying while Alt reveals the unit chips',
        new: '        cam.altWASD = false;                              // keep flying while Alt reveals the unit chips',
        why: 'игра не разрешает движение при зажатом Alt',
    },
    {
        check: 'cam-8',
        file: 'js/CameraControl.js',
        old: '        if ((e.ctrlKey || e.metaKey || e.altKey) && !altFlight) return;',
        new: '        if (e.ctrlKey || e.metaKey || e.altKey) return;',
        why: 'Alt снова блокирует WASD',
    },
    {
        check: 'cam-8',
        file: 'js/CameraControl.js',
        old: '/^Key[WASD]$/.test(e.code)',
        new: '/^Key[WAS]$/.test(e.code)',
        why: 'Alt+D не двигает камеру вправо',
    },
    {
        check: 'cam-8',
        file: 'js/CameraControl.js',
        old: '(!e.ctrlKey || altGraph)',
        new: '!e.ctrlKey',
        why: 'правый AltGraph не работает, если система одновременно сообщает Ctrl',
    },
    {
        check: 'cam-8',
        file: 'js/CameraControl.js',
        old: "        if (CameraController.FLY_KEYS[e.code]) {\n            if (down) this._keys.add(e.code);\n            e.preventDefault();",
        new: "        if (CameraController.FLY_KEYS[e.code]) {\n            if (down) this._keys.add(e.code);\n            void e;",
        why: 'браузер перехватывает сочетание Alt+D вместо движения камеры',
    },
    {
        check: 'cam-9',
        file: 'js/CameraControl.js',
        old: '        if (!down) this._keys.delete(e.code);',
        new: '        void down;',
        why: 'отпущенные клавиши остаются в наборе и камера продолжает лететь',
    },
    {
        check: 'cam-9',
        file: 'js/CameraControl.js',
        old: '            blur: () => this._keys.clear()',
        new: '            blur: () => {}',
        why: 'потеря фокуса оставляет движение зажатым',
    },
    {
        check: 'cam-9',
        file: 'js/CameraControl.js',
        old: '            visibility: () => { if (document.hidden) this._keys.clear(); }',
        new: '            visibility: () => {}',
        why: 'на скрытой вкладке движение не сбрасывается и продолжается при возврате',
    },
    {
        check: 'cam-9',
        file: 'js/CameraControl.js',
        old: "            if (typeof document !== 'undefined' && document.removeEventListener) document.removeEventListener('visibilitychange', b.visibility);",
        new: '            void b.visibility;',
        why: 'после detach остаётся слушатель скрытия вкладки',
    },
    {
        check: 'cam-10',
        file: 'js/CameraControl.js',
        old: '        this.altWASD = false;          // game opt-in: fly while Alt shows an overlay',
        new: '        this.altWASD = true;           // game opt-in: fly while Alt shows an overlay',
        why: 'в редакторе камера неожиданно перехватывает Alt+WASD',
    },
    {
        check: 'cam-10',
        file: 'js/CameraControl.js',
        old: 'this.altWASD && e.altKey && !e.metaKey && (!e.ctrlKey || altGraph)',
        new: 'this.altWASD && e.altKey && (!e.ctrlKey || altGraph)',
        why: 'камера отнимает сочетание Meta+Alt+W у системы',
    },
    {
        check: 'cam-10',
        file: 'js/CameraControl.js',
        old: 'this.altWASD && e.altKey && !e.metaKey && (!e.ctrlKey || altGraph)',
        new: 'this.altWASD && e.altKey && !e.metaKey',
        why: 'камера отнимает обычное сочетание Ctrl+Alt+W у системы',
    },
    {
        check: 'cam-10',
        file: 'js/CameraControl.js',
        old: '/^Key[WASD]$/.test(e.code)',
        new: '/^(?:Key[WASD]|ArrowLeft|ArrowRight)$/.test(e.code)',
        why: 'камера перехватывает Alt+стрелки — навигацию браузера',
    },
    {
        check: 'cam-10',
        file: 'js/CameraControl.js',
        old: "        if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;",
        new: '        void t;',
        why: 'камера перехватывает набор текста и горячие клавиши в поле ввода',
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
        check: 'layout-1',
        file: 'js/fs/FSUI.css',
        old: '.fs-main-panel{position:absolute;top:auto;right:0;bottom:0;height:var(--fs-panel-h);max-height:var(--fs-panel-h);width:var(--fs-panel-w);',
        new: '.fs-main-panel{position:absolute;top:auto;right:0;bottom:0;height:69vh;max-height:69vh;width:min(534px,calc(100vw - 36px));',
        why: 'панель снова задаёт себе размер сама, в обход переменных',
    },
    {
        check: 'layout-2',
        file: 'js/fs/FSUI.css',
        old: '.fs-shell.is-battle .fs-main-panel{width:var(--fs-panel-w);overflow-y:auto;',
        new: '.fs-shell.is-battle .fs-main-panel{width:min(330px,calc(100vw - 36px));overflow-y:auto;',
        why: 'бой снова сужает панель',
    },
    {
        check: 'layout-2',
        file: 'js/fs/FSUI.css',
        old: '@media(max-width:700px){.fs-shell:not(.is-mobile) .fs-left-rail{width:300px}',
        new: '@media(max-width:700px){.fs-shell.is-planning .fs-main-panel{width:min(420px,calc(100vw - 36px))}.fs-shell:not(.is-mobile) .fs-left-rail{width:300px}',
        why: 'этап планирования снова меняет ширину панели',
    },
    {
        check: 'layout-3',
        file: 'js/fs/FSUI.js',
        old: '        const battle = this.renderBattle(ctx.battle);\n        if (battle) root.append(battle);',
        new: '        const battle = this.renderBattle(ctx.battle);\n        if (battle) panel.append(battle);',
        why: 'счёт боя снова внутри правой панели',
    },
    {
        check: 'layout-3',
        file: 'js/fs/FSUI.css',
        old: '.fs-battle-panel{position:absolute;left:10px;bottom:10px;',
        new: '.fs-battle-panel{position:absolute;right:10px;top:10px;',
        why: 'счёт боя переместился в правый верхний угол',
    },
    {
        check: 'layout-3',
        file: 'js/fs/FSUI.js',
        old: '            row.append(deal);',
        new: '            void deal;',
        why: 'пропало сколько урона получит и нанесёт сторона',
    },
    {
        check: 'layout-4',
        file: 'js/fs/FSUI.js',
        old: '        if (!inBattle) {\n            const header = this.el(\'div\', \'fs-topbar\');',
        new: '        if (true) {\n            const header = this.el(\'div\', \'fs-topbar\');',
        why: 'плашка раунда снова показывается во время боя',
    },
    {
        check: 'layout-5',
        file: 'js/fs/FSUI.css',
        old: '.fs-shell.is-battle .fs-left-rail{display:flex;',
        new: '.fs-shell.is-battle .fs-left-rail{display:none;',
        why: 'участники снова скрыты во время боя',
    },
    {
        check: 'layout-5',
        file: 'js/fs/FSUI.css',
        old: '.fs-shell.is-mobile.is-battle .fs-left-rail{top:55px;right:0;',
        new: '.fs-shell.is-mobile.is-battle .fs-left-rail{top:auto;right:0;',
        why: 'участники на мобильном экране больше не справа сверху',
    },
    {
        check: 'layout-5',
        file: 'js/fs/FSUI.css',
        old: 'calc(100vw - min(330px,42vw) - 20px),calc(100vw - min(280px,50vw) - 20px)',
        new: 'calc(100vw - min(330px,42vw) - 20px)',
        why: 'в альбомной ориентации счёт снова перекрывает участников',
    },
    {
        check: 'layout-5',
        file: 'js/fs/FSUI.css',
        old: '.fs-shell.is-battle .fs-faction-drawer{z-index:11}',
        new: '.fs-shell.is-battle .fs-faction-drawer{z-index:7}',
        why: 'на узком экране угловые кнопки закрывают кнопку досье',
    },
    {
        check: 'layout-6',
        file: 'js/fs/FSUI.js',
        old: " + (hand.length > 5 ? ' has-extra' : ''));",
        new: ");",
        why: 'дополнительные карты эффекта накрывают соседние панели',
    },
    {
        check: 'layout-6',
        file: 'js/fs/FSUI.js',
        old: "        bar.style.setProperty('--fs-hand-count', String(hand.length));",
        new: "        bar.style.setProperty('--fs-hand-count', '5');",
        why: 'превью рассчитывается как для пяти карт при любом размере руки',
    },
    {
        check: 'layout-6',
        file: 'js/fs/FSUI.js',
        old: "            card.style.setProperty('--fs-card-index', String(i));",
        new: "            card.style.setProperty('--fs-card-index', '0');",
        why: 'крайняя карта теряет своё положение и превью срезается',
    },
    {
        check: 'layout-6',
        file: 'js/fs/FSUI.css',
        old: '--fs-preview-shift:clamp(calc(10px - var(--fs-card-x)),0px,',
        new: '--fs-preview-shift:max(calc(10px - var(--fs-card-x)),0px,',
        why: 'превью больше не ограничено краями экрана',
    },
    {
        check: 'layout-6',
        file: 'js/fs/FSUI.css',
        old: 'justify-content:center;gap:10px;width:max-content;max-width:calc(100vw - 20px);',
        new: 'justify-content:center;gap:10px;width:calc(100vw - 20px);max-width:calc(100vw - 20px);',
        why: 'подложка карт снова растянута на всю страницу',
    },
    {
        check: 'layout-6',
        file: 'js/fs/FSUI.css',
        old: 'min-height:238px;max-height:238px;',
        new: 'min-height:238px;',
        why: 'длинные карты руки накрывают таблицу боя',
    },
    {
        check: 'layout-6',
        file: 'js/fs/FSUI.css',
        old: '.fs-battle-card:hover:not(:disabled) .fs-battle-card-text{overflow-y:auto;',
        new: '.fs-battle-card:hover:not(:disabled) .fs-battle-card-text{overflow-y:hidden;',
        why: 'полный текст длинной карты недоступен в превью',
    },
    {
        check: 'layout-6',
        file: 'js/fs/FSUI.css',
        old: '.fs-battle-hand:has(.fs-battle-card:hover:not(:disabled)){z-index:10}',
        new: '.fs-battle-hand:has(.fs-battle-card:hover:not(:disabled)){z-index:5}',
        why: 'угловые кнопки перекрывают название увеличенной карты',
    },
    {
        check: 'layout-6',
        file: 'js/fs/FSUI.css',
        old: 'transform-origin:0 100%;transform:scale(var(--fs-hand-scale));margin-right:var(--fs-hand-margin)',
        new: 'transform-origin:0 100%;transform:scale(var(--fs-hand-scale));margin-right:0',
        why: 'ширина подложки считается по нескейленным картам',
    },
    {
        check: 'layout-6',
        file: 'js/fs/FSUI.css',
        old: '.fs-shell.is-battle:not(.is-mobile) .fs-battle-hand{left:calc((100% + var(--fs-score-w) + 10px - var(--fs-panel-w)) / 2);right:auto;',
        new: '.fs-shell.is-battle:not(.is-mobile) .fs-battle-hand{left:20px;right:calc(var(--fs-panel-w) + 20px);',
        why: 'рука снова растянута между двумя краями',
    },
    {
        check: 'layout-7',
        file: 'js/fs/FSUI.css',
        old: '.fs-shell.is-mobile.is-battle .fs-main-panel>.fs-actions{display:flex;flex:0 0 auto;overflow:visible}',
        new: '.fs-shell.is-mobile.is-battle .fs-main-panel>.fs-actions{display:grid;flex:1 1 auto;overflow:auto}',
        why: 'список целей сжимается до нескольких пикселей',
    },
    {
        check: 'layout-7',
        file: 'js/fs/FSUI.css',
        old: '.fs-shell.is-mobile.is-battle .fs-pick-grid{grid-template-columns:repeat(2,minmax(0,1fr))}',
        new: '.fs-shell.is-mobile.is-battle .fs-pick-grid{grid-template-columns:repeat(6,minmax(0,1fr))}',
        why: 'кнопки целей слишком узкие для нажатия',
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
    {
        check: 'combat-chip-2',
        file: 'js/World3D.js',
        old: '        const sx = p.x / k, sy = p.y * cssHeight / hh;',
        new: '        const sx = p.x, sy = p.y;',
        why: 'координаты рендер-буфера снова принимаются за CSS-пиксели',
    },
    {
        check: 'combat-chip-2',
        file: 'js/World3D.js',
        old: '        const sx = p.x / k, sy = p.y * cssHeight / hh;',
        new: '        const sx = p.x / k, sy = p.y / k;',
        why: 'высота холста считается по коэффициенту ширины и съезжает после нестандартного resize',
    },
    {
        check: 'combat-chip-2',
        file: 'js/fs/FSView.js',
        old: "                chip.style.left = (canvasRect.left - layerRect.left + p.x * scaleX) + 'px';\n                chip.style.top = (canvasRect.top - layerRect.top + p.y * scaleY + 4) + 'px';",
        new: "                chip.style.left = p.x + 'px';\n                chip.style.top = (p.y + 4) + 'px';",
        why: 'смещение и CSS-масштаб холста относительно слоя игнорируются',
    },
    {
        check: 'combat-chip-2',
        file: 'js/fs/FSView.js',
        old: '        const fallback = worldView.projectToScreen(item.x, item.z, item.y);',
        new: '        const fallback = worldView.projectToScreen(item.x, item.y, item.z);',
        why: 'высота фигурки и координата карты перепутаны при проекции',
    },
    {
        check: 'combat-chip-2',
        file: 'js/fs/FSView.js',
        old: "                chip.style.top = (canvasRect.top - layerRect.top + p.y * scaleY + 4) + 'px';",
        new: "                chip.style.top = (canvasRect.top - layerRect.top + p.y * scaleY - 4) + 'px';",
        why: 'плашка начинается не под нижней гранью модели, а выше неё',
    },
    {
        check: 'combat-chip-3',
        file: 'js/fs/FSView.js',
        old: "        if (view.scene.onBeforeCameraRenderObservable && view.scene.onBeforeCameraRenderObservable.add) {\n            view.scene.onBeforeCameraRenderObservable.add(camera => {\n                if (camera === app.location.view.camera) this.chipTick(view);\n            });\n        }",
        new: "        if (view.scene.onBeforeRenderObservable && view.scene.onBeforeRenderObservable.add) {\n            view.scene.onBeforeRenderObservable.add(() => {\n                this.chipTick(view);\n            });\n        }",
        why: 'плашка снова проецируется до обновления матриц камеры и отстаёт на кадр',
    },
    {
        check: 'combat-chip-4',
        file: 'js/fs/FSView.js',
        old: "                if (!p || p.behind || !Number.isFinite(p.x) || !Number.isFinite(p.y)) { chip.style.display = 'none'; continue; }",
        new: "                if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) { chip.style.display = 'none'; continue; }",
        why: 'плашка фигурки за камерой остаётся на экране',
    },
    {
        check: 'combat-chip-4',
        file: 'js/fs/FSUI.css',
        old: '.fs-unit-chips{position:absolute;inset:0;overflow:hidden;pointer-events:none;',
        new: '.fs-unit-chips{position:absolute;inset:0;overflow:visible;pointer-events:none;',
        why: 'слой больше не обрезает плашки у края',
    },
    {
        check: 'combat-chip-5',
        file: 'js/fs/FSUI.css',
        old: '.fs-unit-chip{position:absolute;transform:translate(-50%,0);',
        new: '.fs-unit-chip{position:absolute;transform:translate(-50%,-100%);',
        why: 'плашка снова поднимается на фигурку вместо положения под ней',
    },
    {
        check: 'combat-chip-6',
        file: 'js/fs/FSView.js',
        old: 'x: p.x, y: p.y + 1, z: p.z, root: roots.get(u.id),',
        new: 'x: p.x, y: p.y + 1, z: p.z, root: null,',
        why: 'плашка не связана с моделью бойца и следует за координатой на столе',
    },
    {
        check: 'combat-chip-6',
        file: 'js/fs/FSView.js',
        old: "x: slot.x, y: slot.y + 1, z: slot.z, root: roots.get('reinforce-' + slot.side + '-' + slot.index),",
        new: 'x: slot.x, y: slot.y + 1, z: slot.z, root: null,',
        why: 'плашка подкрепления не связана с его белой моделью',
    },
    {
        check: 'combat-chip-6',
        file: 'js/fs/FSView.js',
        old: '            if (Number.isFinite(bottom)) center.y = bottom;',
        new: '            void bottom;',
        why: 'плашка снова покрывает основание и нижнюю часть модели',
    },
    {
        check: 'combat-chip-6',
        file: 'js/fs/FSView.js',
        old: '            if (!center || center.behind) return center || fallback;',
        new: '            if (!center || center.behind) return fallback;',
        why: 'модель ушла за камеру, но плашка осталась на старой позиции на столе',
    },
    {
        check: 'combat-chip-6',
        file: 'js/fs/FSView.js',
        old: '            const center = worldView.projectToScreen((min.x + max.x) / 2, (min.z + max.z) / 2, min.y);',
        new: '            const center = worldView.projectToScreen(item.x, item.z, item.y);',
        why: 'поворот модели смещает её из-под плашки: центр берётся от старой позиции',
    },
    {
        check: 'combat-chip-6',
        file: 'js/fs/FSView.js',
        old: '            const bounds = root.getHierarchyBoundingVectors(true), min = bounds.min, max = bounds.max;',
        new: '            const bounds = root.getHierarchyBoundingVectors(false), min = bounds.min, max = bounds.max;',
        why: 'геометрия частей модели игнорируется, берётся пустой корень',
    },
    {
        check: 'combat-chip-6',
        file: 'js/fs/FSView.js',
        old: '            const bounds = root.getHierarchyBoundingVectors(true), min = bounds.min, max = bounds.max;',
        new: '            const bounds = root._chipBounds || (root._chipBounds = root.getHierarchyBoundingVectors(true)), min = bounds.min, max = bounds.max;',
        why: 'границы модели кэшируются навсегда, плашка не следует за её движением',
    },
    {
        check: 'combat-chip-7',
        file: 'js/fs/FSUI.css',
        old: 'z-index:4;visibility:hidden}\n.fs-shell.is-alt .fs-unit-chips{visibility:visible}',
        new: 'z-index:4;visibility:visible}\n.fs-shell.is-alt .fs-unit-chips{visibility:visible}',
        why: 'плашки показываются постоянно, без Alt',
    },
    {
        check: 'combat-chip-7',
        file: 'js/fs/FSUI.css',
        old: '.fs-shell.is-alt .fs-unit-chips{visibility:visible}',
        new: '.fs-shell.is-alt .fs-unit-chips{visibility:hidden}',
        why: 'плашки остаются невидимыми при зажатом Alt',
    },
    {
        check: 'combat-chip-7',
        file: 'js/fs/FSUI.js',
        old: "        if (root && root.classList) root.classList.toggle('is-alt', this.altZoom);",
        new: '        void root;',
        why: 'Alt не меняет видимость слоя плашек',
    },
    {
        check: 'combat-chip-7',
        file: 'js/fs/FSUI.js',
        old: "            if (isAlt(e)) { this.altKeys.delete(e.code || e.key); this.setAltZoom(this.altKeys.size > 0); }",
        new: '            void e;',
        why: 'отпускание Alt не скрывает плашки',
    },
    {
        check: 'combat-chip-7',
        file: 'js/fs/FSUI.js',
        old: "        if (bar && bar.classList) bar.classList.toggle('is-alt', this.altZoom);",
        new: '        void bar;',
        why: 'Alt больше не увеличивает боевую карту под мышью',
    },
    {
        check: 'combat-chip-8',
        file: 'js/fs/FSUI.js',
        old: "        const isAlt = e => e.key === 'Alt' || e.key === 'AltGraph' || e.code === 'AltLeft' || e.code === 'AltRight';",
        new: "        const isAlt = e => e.key === 'Alt';",
        why: 'правый Alt с именем AltGraph не показывает плашки',
    },
    {
        check: 'combat-chip-8',
        file: 'js/fs/FSUI.js',
        old: 'this.altKeys.delete(e.code || e.key); this.setAltZoom(this.altKeys.size > 0);',
        new: 'this.altKeys.delete(e.code || e.key); this.setAltZoom(false);',
        why: 'отпускание одного Alt скрывает плашки, даже если второй ещё зажат',
    },
    {
        check: 'combat-chip-9',
        file: 'js/fs/FSUI.js',
        old: "        const bar = this.el('section', 'fs-battle-hand' + (this.altZoom ? ' is-alt' : '') + (hand.length > 5 ? ' has-extra' : ''));",
        new: "        const bar = this.el('section', 'fs-battle-hand' + (hand.length > 5 ? ' has-extra' : ''));",
        why: 'перерисовка забывает зажатый Alt и отменяет увеличение карты',
    },
    {
        check: 'combat-chip-9',
        file: 'js/fs/FSUI.js',
        old: "        window.addEventListener('blur', () => {\n            clearAlt();",
        new: "        window.addEventListener('blur', () => {\n            void clearAlt;",
        why: 'при потере фокуса плашки остаются на экране',
    },
    {
        check: 'combat-chip-9',
        file: 'js/fs/FSUI.js',
        old: "        document.addEventListener('visibilitychange', () => { if (document.hidden) clearAlt(); });",
        new: "        document.addEventListener('visibilitychange', () => {});",
        why: 'на скрытой вкладке состояние Alt не сбрасывается',
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
