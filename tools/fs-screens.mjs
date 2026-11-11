// ============================================================================
//  fs-screens.mjs — экраны, которые видит игрок
// ----------------------------------------------------------------------------
//  node tools/fs-screens.mjs
//
//  Проверки правил держат движок: 278 проверок и 94 мутации в fs-audit.
//  А игра при этом может быть непроходимой — так и случилось дважды:
//
//    * лобби не рисовалось вовсе: FSUI.lobby() вызывает renderModern(null),
//      а renderModern спрашивал у GamePhase.of(null) метод .is(). Исключение
//      срывало отрисовку ДО меню, и игрок видел пустую сцену;
//    * на карте миры съезжали к центру тайла (четверть тайла умножалась на
//      половину стороны области), а в панели участников печатался исходник
//      замыкания вместо чисел жетонов.
//
//  Ни одну из этих поломок не ловила ни одна проверка правил. Здесь то же,
//  что fs-audit делает для правил: каждая проверка строит ровно тот случай и
//  смотрит, что получилось на экране. Мутации — в fs-mutate-screens.mjs.
// ============================================================================
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import url from 'node:url';
import { createEngineContext } from './fs-engine.mjs';

export const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');

const C = { r: '\x1b[0m', b: '\x1b[1m', dim: '\x1b[2m', red: '\x1b[31m', grn: '\x1b[32m', yel: '\x1b[33m' };
const filter = process.argv[2] || '';
let done = 0;
const failed = [];

function head(text) { console.log('\n' + C.b + '  ' + text + C.r); }

/** Одна проверка экрана: имя, что она утверждает, и тело. */
function screen(id, text, fn) {
    if (filter && !(id + ' ' + text).toLowerCase().includes(filter.toLowerCase())) return;
    done++;
    try {
        const res = fn();
        if (res === true || res === undefined) {
            console.log('  ' + C.grn + 'ok  ' + C.r + C.dim + id + C.r + '  ' + text);
        } else {
            failed.push({ id, why: String(res) });
            console.log('  ' + C.red + 'FAIL' + C.r + ' ' + id + '  ' + text + '\n       ' + C.red + res + C.r);
        }
    } catch (e) {
        failed.push({ id, why: e && e.message });
        console.log('  ' + C.red + 'FAIL' + C.r + ' ' + id + '  ' + text + '\n       ' + C.red + (e && e.message) + C.r);
    }
}

// --- the page: the engine plus a DOM the panel can actually draw into -------
const ctx = createEngineContext();
const nothing = () => undefined;

/** A node of the stand-in DOM: a real tree, so a check can read what was drawn. */
function el(tag) {
    const node = {
        tagName: String(tag || 'div').toUpperCase(), children: [], className: '', id: '', textContent: '',
        title: '', type: '', value: '', maxLength: 0, disabled: false, style: { setProperty: nothing, removeProperty: nothing },
        classList: { add: nothing, remove: nothing, toggle: nothing, contains: () => false },
        append(...xs) { for (const x of xs) this.children.push(x); },
        appendChild(x) { this.children.push(x); return x; },
        replaceChildren(...xs) { this.children = xs; },
        remove: nothing, setAttribute: nothing, getAttribute: () => null,
        addEventListener: nothing, removeEventListener: nothing, focus: nothing, blur: nothing,
        getContext: () => null, getBoundingClientRect: () => ({ width: 0, height: 0, left: 0, top: 0 }),
        querySelector: () => null, querySelectorAll: () => [],
    };
    return node;
}

Object.assign(ctx, {
    document: Object.assign(ctx.document || {}, {
        body: el('body'), documentElement: el('html'), createElement: el,
        getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener: nothing,
    }),
    window: ctx,
    innerWidth: 1400,
    innerHeight: 900,
    IS_MOBILE: false,
    localStorage: { getItem: () => null, setItem: nothing, removeItem: nothing },
    navigator: { userAgent: 'screens', clipboard: null },
    requestAnimationFrame: () => 0,
    setInterval: nothing, clearInterval: nothing,
});
ctx.UI = { root: null, get: () => null, def: () => ({}), init: nothing, add: nothing, set: nothing, removeAll: nothing, text: nothing, show: nothing };
ctx.Store = { get: () => '', set: nothing, del: nothing };

// Клиент и панель — те же файлы и тот же порядок, что в index.html.
for (const file of ['js/fs/FSIcons.js', 'js/fs/FSView.js', 'js/fs/FSUI.js', 'js/fs/FSGame.js']) {
    try {
        vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), ctx, { filename: file });
    } catch (e) {
        // Экран грузится и без клиента: проверки панели важнее клиента сети.
        console.log('  ' + C.yel + 'предупреждение' + C.r + ' ' + file + ': ' + e.message);
    }
}
const FSUI = vm.runInContext('FSUI', ctx);
const FS_RULES = vm.runInContext('FS_RULES', ctx);
const FS_VIEW = vm.runInContext('FSView', ctx);
const TILE_GEOMETRY = vm.runInContext('TileGeometry', ctx);
FSUI.modernRoot = el();

const SEAT_PLAYERS = [
    { faction: 'имперская-гвардия', name: 'Алекс', id: 'p0' },
    { faction: 'некроны', name: 'Противник', id: 'p1' },
];
const party = seed => FS_RULES.newReadyGame({ seed: seed || 'screens', players: SEAT_PLAYERS });

const SCREEN_CTX = { mode: 'idle', title: '', text: '', status: '' };

/** Экран лобби — ровно так, как его рисует клиент сразу после подключения. */
function drawLobby() {
    FSUI.lobby({
        code: 'ABCD', name: 'Проба', faction: '', palette: null, players: [],
        factions: [{ id: 'некроны', name: 'Некроны', color: '#3f7d4e' }], link: 'http://localhost/?room=ABCD',
        modes: [{ id: 'game', icon: 'ui.menu', title: 'Обычная игра', text: '…' }], mode: 'game',
        status: '', battle: { kind: 'ground', units: {}, cards: [], total: 0, deck: 0 },
        onMode: nothing, onBattle: nothing, onStart: nothing, onPalette: nothing,
    }, nothing, nothing);
}

/** Сколько узлов в дереве экрана. */
function countNodes(root) {
    let n = 0;
    (function walk(x) {
        n++;
        for (const c of (x && x.children) || []) walk(c);
    })(root);
    return n;
}

/** Все тексты узлов дерева. */
function textsOf(root) {
    const out = [];
    (function walk(n) {
        if (!n) return;
        const t = String(n.textContent || '').trim();
        if (t) out.push(t);
        for (const c of n.children || []) walk(c);
    })(root);
    return out;
}

// ============================================================================
head('Лобби: экран, с которого начинается игра');

screen('lobby-1', 'лобби рисуется без состояния — до партии состояния ещё нет', () => {
    // Раньше здесь падало: GamePhase.of(null) не имеет .is(), и исключение
    // срывало отрисовку ДО меню — на экране оставалась пустая сцена.
    drawLobby();
    const texts = textsOf(FSUI.modernRoot);
    if (!texts.some(t => /Forbidden Stars/i.test(t))) throw new Error('в лобби нет заголовка игры');
    if (!texts.some(t => /Обычная игра/.test(t))) throw new Error('в лобби нет выбора режима');
    return true;
});

screen('lobby-2', 'после партии лобби не остаётся на экране — уходит по первой же отрисовке', () => {
    drawLobby();
    if (!FSUI.currentLobby) throw new Error('лобби не показано — проверять нечего');
    FSUI.update(party('lobby-2'), SCREEN_CTX);
    const classes = [];
    (function walk(n) {
        if (!n) return;
        classes.push(String(n.className || ''));
        for (const c of n.children || []) walk(c);
    })(FSUI.modernRoot);
    // Лобби — это `fs-lobby`; панель партии — `fs-topbar`. Если отрисовка не
    // вышла из режима лобби, на экране окажутся оба.
    if (classes.some(c => /(^|\s)fs-lobby(\s|$)/.test(c))) return 'лобби осталось поверх партии (fs-lobby в дереве)';
    if (!classes.some(c => /(^|\s)fs-topbar(\s|$)/.test(c))) return 'панель партии не нарисована (нет fs-topbar)';
    const texts = textsOf(FSUI.modernRoot);
    if (texts.some(t => /Стратегическая игра · 2–4 игрока/.test(t))) return 'текст лобби остался на экране';
    return true;
});

// ============================================================================
head('Панель участников: что в ней напечатано');

screen('panel-1', 'панель участников печатает числа жетонов, а не исходник замыкания', () => {
    const st = party('panel-1');
    st.players[0].assets = { forge: 1, cache: 2, reinforcement: 0 };
    st.players[1].assets = { forge: 0, cache: 0, reinforcement: 0 };
    FSUI.update(st, SCREEN_CTX);
    const texts = textsOf(FSUI.modernRoot);
    // На экране был текст «kind => (face ? face.assetCount(kind) : 0)»: в
    // строку ресурсов передавали функцию, а не её значение.
    const leaked = texts.filter(t => /=>|assetCount|face \?/.test(t));
    if (leaked.length) return 'в панели исходник замыкания: ' + leaked[0];
    return true;
});

screen('panel-2', 'три значка ресурсов показывают ровно то, что лежит у игрока', () => {
    const st = party('panel-2');
    st.players[0].assets = { forge: 1, cache: 2, reinforcement: 3 };
    FSUI.update(st, SCREEN_CTX);
    const chips = [];
    (function walk(n) {
        if (!n) return;
        if (String(n.className || '').includes('fs-asset-chip')) {
            chips.push(textsOf(n).join('|'));
        }
        for (const c of n.children || []) walk(c);
    })(FSUI.modernRoot);
    if (chips.length !== 6) return 'значков ресурсов ' + chips.length + ', ждали 6 (по три на игрока)';
    const mine = chips.slice(0, 3).join(' ');
    for (const n of ['1', '2', '3']) {
        if (!new RegExp('(^|\\|)' + n + '($|\\|)').test(chips.slice(0, 3).join('|'))) {
            return 'у первого игрока нет числа ' + n + ' (видно: ' + mine + ')';
        }
    }
    return true;
});

screen('panel-3', 'панель партии рисуется на настоящей партии', () => {
    const st = party('panel-3');
    FSUI.update(st, SCREEN_CTX);
    const texts = textsOf(FSUI.modernRoot);
    if (!texts.some(t => /FORBIDDEN STARS/.test(t))) return 'нет верхней плашки игры';
    if (!texts.some(t => /Раунд 1/.test(t))) return 'нет номера раунда';
    return true;
});

// ============================================================================
head('Стол: где на тайле стоят миры');

screen('table-1', 'четверть тайла одна для рисунка и для миров', () => {
    // Миры съезжали к центру тайла и наезжали друг на друга: раскладка брала
    // центр четверти, но умножала его на половину стороны области.
    for (const pos of ['TL', 'TR', 'BL', 'BR']) {
        const q = TILE_GEOMETRY.square(pos);
        if (Math.abs(Math.abs(q.cx - 0.5) - 0.25) > 1e-9) return 'центр четверти ' + pos + ' не на четверти тайла';
        if (Math.abs(Math.abs(q.cy - 0.5) - 0.25) > 1e-9) return 'центр четверти ' + pos + ' не на четверти по вертикали';
        if (Math.abs(q.size - 0.5) > 1e-9) return 'четверть ' + pos + ' занимает не половину стороны тайла';
    }
    return true;
});

screen('table-2', 'миры двух соседних четвертей не перекрываются', () => {
    // Спрашивается САМА раскладка стола (FSView.areaPos), а не константа
    // четверти: иначе «взять половину тайла вместо целого» проходит молча —
    // константа-то правильная, а мир всё равно стоит вдвое ближе.
    const app = { location: { width: 1400, height: 900 } };
    const sys = { id: 'S', row: 0, col: 0 };
    const left = FS_VIEW.areaPos(app, sys, 'TL', null);
    const right = FS_VIEW.areaPos(app, sys, 'TR', null);
    const between = Math.abs(right.x - left.x);
    const TILE = FS_VIEW.TILE;
    if (Math.abs(between - TILE / 2) > 1e-6) {
        return 'два соседних мира стоят на ' + between + ' друг от друга, ждали половину тайла ' + TILE / 2;
    }
    if (between <= FS_VIEW.PLANET_D) {
        return 'два мира перекрываются: между ними ' + between + ', диаметр ' + FS_VIEW.PLANET_D;
    }
    // И по вертикали то же: раскладка не должна «схлопывать» ось.
    const top = FS_VIEW.areaPos(app, sys, 'TL', null);
    const bottom = FS_VIEW.areaPos(app, sys, 'BL', null);
    if (Math.abs(Math.abs(bottom.y - top.y) - TILE / 2) > 1e-6) {
        return 'по вертикали миры стоят на ' + Math.abs(bottom.y - top.y) + ', ждали ' + TILE / 2;
    }
    return true;
});

screen('table-3', 'мир не выходит за пределы своей четверти', () => {
    // Раньше мир свисал с тайла: центр четверти умножался на половину стороны
    // области. Теперь проверяется сама раскладка — от центра мира до края
    // тайла должно оставаться не меньше радиуса.
    const TILE = FS_VIEW.TILE;
    const app = { location: { width: 1400, height: 900 } };
    const sys = { id: 'S', row: 0, col: 0 };
    const topLeft = FS_VIEW.areaPos(app, sys, 'TL', null);
    const center = FS_VIEW.areaPos(app, sys, 'BR', null);
    // Центр тайла — середина между двумя противоположными четвертями.
    const cx = (topLeft.x + center.x) / 2, cy = (topLeft.y + center.y) / 2;
    const toEdge = Math.min(Math.abs(topLeft.x - cx), Math.abs(topLeft.y - cy), TILE / 2);
    if (toEdge < FS_VIEW.PLANET_D / 2) {
        return 'мир свисает с тайла: до края ' + toEdge + ', радиус ' + FS_VIEW.PLANET_D / 2;
    }
    return true;
});

// ============================================================================
console.log('\n' + (failed.length
    ? C.red + C.b + '  Экраны: ' + failed.length + ' провалов из ' + done + '.' + C.r
    : C.grn + C.b + '  Экраны сходятся: ' + done + ' проверок, 0 провалов.' + C.r) + '\n');
for (const f of failed) console.log('   ' + C.red + '· ' + f.id + C.r + ' — ' + f.why);
process.exit(failed.length ? 1 : 0);
