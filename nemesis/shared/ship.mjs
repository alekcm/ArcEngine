// ship.mjs — the Nemesis ship: room tiles, the original board graph and a random ship generator.
// Coordinates are abstract board units (the original board is ~1400 x 950); the client scales them.

import { shuffle, randInt, rand, pick } from './rng.mjs';

// ---------------------------------------------------------------------------------------------
// Room tiles. `slot` — which stack the tile belongs to ('1' basic, '2' additional).
// `items` — item icons for the Search action, `computer` — has a Computer.
// ---------------------------------------------------------------------------------------------
export const ROOM_TILES = {
    archives:     { name: 'Архив',                     slot: '1', items: ['yellow'],         computer: true,
                    action: 'Только при неактивном жетоне знаний: получите 2 знания и активируйте жетон.' },
    comms:        { name: 'Пункт связи',               slot: '1', items: ['yellow'],         computer: true,
                    action: 'Отправить сигнал — отметьте «Сигнал» на планшете персонажа.' },
    emergency:    { name: 'Медпункт',                  slot: '1', items: ['green', 'green'], computer: false,
                    action: 'Сбросьте 1 тяжёлую травму ИЛИ восстановите 3 здоровья.' },
    evacA:        { name: 'Эвакуационный отсек A',     slot: '1', items: ['red'],            computer: false,
                    action: 'Если есть разблокированная капсула секции A со свободным местом: бросок шума, затем войти в капсулу.' },
    evacB:        { name: 'Эвакуационный отсек B',     slot: '1', items: ['red'],            computer: false,
                    action: 'Если есть разблокированная капсула секции B со свободным местом: бросок шума, затем войти в капсулу.' },
    fireControl:  { name: 'Пожарный пост',             slot: '1', items: ['yellow'],         computer: true,
                    action: 'Выберите комнату: уберите оттуда огонь; все чужие в ней уходят в соседние комнаты.' },
    generator:    { name: 'Генератор',                 slot: '1', items: ['yellow', 'red'],  computer: true,
                    action: 'Запустить самоуничтожение (жетон на 3 деления впереди времени) ИЛИ остановить жёлтый отсчёт.' },
    laboratory:   { name: 'Лаборатория',               slot: '1', items: ['green', 'green'], computer: true,
                    action: 'Проанализировать тяжёлый объект (труп, тушу или яйцо): +2 знания; снять 1 адаптацию, если этот тип объекта ещё не использовался.' },
    nest:         { name: 'Гнездо',                    slot: '1', items: [],                 computer: false,
                    action: 'Взять или уничтожить 1 яйцо, затем бросок шума. Первооткрыватель получает +1 знание.' },
    surgery:      { name: 'Операционная',              slot: '1', items: ['green', 'green'], computer: true,
                    action: 'Сбросьте колоду и руку, уберите все заражения из сброса без проверки, уберите личинку. Потеряйте 1 здоровье и спасуйте.' },
    repository:   { name: 'Хранилище снаряжения',      slot: '1', items: ['red'],            computer: false,
                    action: 'Раз за игру: возьмите 3 карты из колоды поддержки, оставьте 1.' },

    airlock:      { name: 'Шлюзовой контроль',         slot: '2', items: ['red'],            computer: true,
                    action: 'Выберите комнату с входом в тех. коридоры и чужим: закрыть все двери и начать процедуру шлюзования (в этой версии — упрощено: сразу всё в комнате гибнет).' },
    armory:       { name: 'Оружейная',                 slot: '2', items: ['red', 'red'],     computer: false,
                    action: 'Зарядите до 2 патронов в одно дальнобойное оружие.' },
    cafeteria:    { name: 'Столовая',                  slot: '2', items: ['green', 'green'], computer: false,
                    action: 'Восстановите 2 здоровья и/или уберите 1 заражение из руки без проверки. Пассивно: +1 карта при доборе.' },
    commandCenter:{ name: 'Командный центр',           slot: '2', items: ['yellow', 'red'],  computer: true,
                    action: 'Выберите комнату: откройте и/или закройте любые двери в её коридорах.' },
    containment:  { name: 'Изолятор',                  slot: '2', items: ['yellow', 'green'],computer: false,
                    action: 'Поместите взрослого чужого в комнату с входом в тех. коридоры без чужих. Затем поломка в Изоляторе.' },
    contaminated: { name: 'Заражённая комната',        slot: '2', items: ['yellow', 'green'],computer: false,
                    action: 'Нет действия. Пассивно: получив предмет здесь, получаете заражение.' },
    decon:        { name: 'Дезинфекция',               slot: '2', items: ['green', 'yellow'],computer: false,
                    action: 'Уберите все заражения из руки без проверки. Уберите личинку.' },
    engineRoom:   { name: 'Машинное отделение',        slot: '2', items: ['yellow', 'yellow'],computer: true,
                    action: 'Тайно посмотрите верхний жетон каждого двигателя.' },
    hatchControl: { name: 'Контроль шлюзов капсул',    slot: '2', items: ['red', 'yellow'],  computer: true,
                    action: 'Переверните 1 жетон спасательной капсулы (заблокировать/разблокировать).' },
    server:       { name: 'Серверная',                 slot: '2', items: ['yellow'],         computer: true,
                    action: 'Используйте действие любой другой разведанной комнаты с компьютером.' },
    storage:      { name: 'Склад',                     slot: '2', items: ['yellow', 'yellow'],computer: false,
                    action: 'Возьмите по 1 предмету каждого цвета, оставьте 1. Затем бросок шума.' },

    cockpit:      { name: 'Рубка',                     slot: 'special', items: [], computer: true,
                    action: 'Проверить координаты ИЛИ изменить пункт назначения.' },
    hibernatorium:{ name: 'Гибернаторий',              slot: 'special', items: [], computer: false,
                    action: 'Только когда время в синей зоне: бросок шума; если чужой не появился — уйти в гибернацию.' },
    engine:       { name: 'Двигатель',                 slot: 'special', items: [], computer: false,
                    action: 'Проверить состояние двигателя. Починить/сломать — картой «Ремонт» или инструментами.' },
};

export const BASIC_TILES = Object.keys(ROOM_TILES).filter(k => ROOM_TILES[k].slot === '1');
export const ADDITIONAL_TILES = Object.keys(ROOM_TILES).filter(k => ROOM_TILES[k].slot === '2');
export const ADDITIONAL_IN_PLAY = 5;

export const EXPLORATION_TOKENS = [
    ...Array(8).fill('malfunction'), 'fire', 'fire', 'corpse', 'corpse', 'door', 'door', 'door', 'door',
];

// ---------------------------------------------------------------------------------------------
// Original board. Positions were read off the game board; corridor numbers follow the rule
// "exits numbered 1..4 clockwise from the top" (the printed board uses the same scheme in most
// rooms — verify against your copy if you need a 1:1 match).
// ---------------------------------------------------------------------------------------------
const ORIGINAL_ROOMS = [
    ['001', 'cockpit',       95, 460],
    ['002', 'slot1',        330, 240],
    ['003', 'slot1',        300, 470],
    ['004', 'slot1',        330, 730],
    ['005', 'slot1',        590, 110],
    ['006', 'slot2',        600, 290],
    ['007', 'slot2',        465, 470],
    ['008', 'slot2',        600, 640],
    ['009', 'slot1',        590, 820],
    ['010', 'slot1',        790, 170],
    ['011', 'hibernatorium',745, 470],
    ['012', 'slot1',        790, 780],
    ['013', 'slot1',       1030, 180],
    ['014', 'slot2',        930, 330],
    ['015', 'slot2',        930, 590],
    ['016', 'slot1',       1030, 760],
    ['017', 'slot1',       1120, 330],
    ['018', 'slot1',       1120, 600],
    ['019', 'engine',      1270, 180],
    ['020', 'engine',      1270, 470],
    ['021', 'engine',      1270, 760],
];
const ORIGINAL_EDGES = [
    ['001', '002'], ['001', '003'], ['001', '004'],
    ['002', '006'],
    ['003', '007'],
    ['004', '008'],
    ['005', '006'], ['005', '010'],
    ['006', '007'], ['006', '011'],
    ['007', '008'],
    ['008', '009'], ['008', '011'],
    ['009', '012'],
    ['010', '013'],
    ['011', '014'], ['011', '015'],
    ['012', '016'],
    ['013', '014'], ['013', '019'],
    ['014', '017'],
    ['015', '016'], ['015', '018'],
    ['016', '021'],
    ['017', '019'], ['017', '020'],
    ['018', '020'], ['018', '021'],
];
// Intermediate waypoints (board units) for corridors that bend on the original board.
const ORIGINAL_PATHS = {
    '001-002': [[150, 330]], '001-004': [[150, 600]],
    '002-006': [[430, 230], [520, 300]], '004-008': [[470, 735]],
    '006-011': [[690, 330]], '008-011': [[690, 610]],
    '011-014': [[850, 380]], '011-015': [[850, 560]],
    '012-016': [[900, 800]], '013-014': [[1010, 270]],
    '003-007': [[380, 520]],
};
const ORIGINAL_TECH = ['002', '004', '007', '011', '013', '016', '020'];
const ORIGINAL_ENGINE_NUMBERS = { '021': 1, '020': 2, '019': 3 };

function buildShip(roomsSpec, edges, techRooms, engineNumbers, mode, paths = {}) {
    const rooms = {};
    for (const [id, kind, x, y] of roomsSpec) {
        rooms[id] = { id, kind, x, y, tech: techRooms.includes(id), exits: [] };
        if (kind === 'engine') rooms[id].engineNo = engineNumbers[id];
    }
    const corridors = {};
    for (const [a, b] of edges) {
        const id = a < b ? a + '-' + b : b + '-' + a;
        corridors[id] = { id, a, b, door: 'open', noise: false, path: paths[id] || [] };
        rooms[a].exits.push({ to: b, corridor: id, num: 0 });
        rooms[b].exits.push({ to: a, corridor: id, num: 0 });
    }
    numberExits(rooms);
    const ship = { mode, rooms, corridors, techNoise: false };
    computeBounds(ship);
    return ship;
}

/** Exits get numbers 1..n clockwise starting from "up" (screen -Y). */
function numberExits(rooms) {
    for (const r of Object.values(rooms)) {
        r.exits.sort((e1, e2) => angleOf(r, rooms[e1.to]) - angleOf(r, rooms[e2.to]));
        r.exits.forEach((e, i) => { e.num = i + 1; });
    }
}
function angleOf(from, to) {
    // clockwise angle from "up"; screen Y grows downward
    let a = Math.atan2(to.x - from.x, -(to.y - from.y));
    if (a < 0) a += Math.PI * 2;
    return a;
}

function computeBounds(ship) {
    const xs = Object.values(ship.rooms).map(r => r.x), ys = Object.values(ship.rooms).map(r => r.y);
    ship.bounds = { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

export function originalShip() {
    return buildShip(ORIGINAL_ROOMS, ORIGINAL_EDGES, ORIGINAL_TECH, ORIGINAL_ENGINE_NUMBERS, 'original', ORIGINAL_PATHS);
}

// ---------------------------------------------------------------------------------------------
// Random ship: 21 cells of a hex grid grown into a connected, ship-like blob. Cockpit is the
// leftmost cell, the three Engines are the rightmost ones, the Hibernatorium sits near the
// centre; the rest are 11 "1" slots and 5 "2" slots. Corridors are thinned to about the density
// of the original board, max 4 exits per room, Engines keep at most 2 exits.
// ---------------------------------------------------------------------------------------------
const HEX_DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
const HEX_W = 175, HEX_H = 150;

export function randomShip(holder) {
    for (let attempt = 0; attempt < 50; attempt++) {
        const ship = tryRandomShip(holder);
        if (ship) return ship;
    }
    return originalShip();
}

function tryRandomShip(holder) {
    const key = (q, r) => q + ',' + r;
    const cells = new Map();
    cells.set(key(0, 0), [0, 0]);
    // Grow: prefer cells near the horizontal axis to make the ship elongated.
    while (cells.size < 21) {
        const frontier = [];
        for (const [q, r] of cells.values()) {
            for (const [dq, dr] of HEX_DIRS) {
                const nq = q + dq, nr = r + dr;
                if (cells.has(key(nq, nr))) continue;
                const x = nq + nr / 2, y = nr;
                const w = 1 / (1 + Math.abs(y) * 0.9 + Math.abs(x) * 0.15);
                frontier.push({ q: nq, r: nr, w });
            }
        }
        let total = frontier.reduce((s, f) => s + f.w, 0), t = rand(holder) * total;
        let chosen = frontier[frontier.length - 1];
        for (const f of frontier) { t -= f.w; if (t <= 0) { chosen = f; break; } }
        cells.set(key(chosen.q, chosen.r), [chosen.q, chosen.r]);
    }
    const list = [...cells.values()].map(([q, r]) => ({ q, r, x: (q + r / 2) * HEX_W, y: r * HEX_H }));
    const minX = Math.min(...list.map(c => c.x)), minY = Math.min(...list.map(c => c.y));
    for (const c of list) { c.x = Math.round(c.x - minX + 100); c.y = Math.round(c.y - minY + 100); }

    // Roles
    const byX = [...list].sort((a, b) => a.x - b.x || a.y - b.y);
    const cockpit = byX[0];
    const engines = byX.slice(-3);
    if (new Set(engines.map(e => e.y)).size < 2) return null; // engines stacked oddly — retry
    const cx = list.reduce((s, c) => s + c.x, 0) / list.length, cy = list.reduce((s, c) => s + c.y, 0) / list.length;
    const rest = list.filter(c => c !== cockpit && !engines.includes(c));
    rest.sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy));
    const hiber = rest[0];
    const slots = rest.slice(1);
    shuffle(holder, slots);
    const kinds = new Map();
    kinds.set(cockpit, 'cockpit'); kinds.set(hiber, 'hibernatorium');
    engines.forEach(e => kinds.set(e, 'engine'));
    slots.forEach((c, i) => kinds.set(c, i < 11 ? 'slot1' : 'slot2'));

    // Ids: number rooms left to right like the original board
    const ordered = [...list].sort((a, b) => a.x - b.x || a.y - b.y);
    ordered.forEach((c, i) => { c.id = String(i + 1).padStart(3, '0'); });
    const engineNumbers = {};
    [...engines].sort((a, b) => b.y - a.y).forEach((e, i) => { engineNumbers[e.id] = i + 1; });

    // All hex adjacencies
    const byKey = new Map(list.map(c => [key(c.q, c.r), c]));
    let edges = [];
    for (const c of list) {
        for (const [dq, dr] of HEX_DIRS.slice(0, 3)) {         // each pair once
            const n = byKey.get(key(c.q + dq, c.r + dr));
            if (n) edges.push([c, n]);
        }
    }
    // Thin out: target ~33 edges, honour degree limits, keep connectivity
    const maxDeg = c => kinds.get(c) === 'engine' ? 2 : kinds.get(c) === 'cockpit' ? 3 : 4;
    const degree = () => { const d = new Map(); for (const [a, b] of edges) { d.set(a, (d.get(a) || 0) + 1); d.set(b, (d.get(b) || 0) + 1); } return d; };
    const connected = (es) => {
        const adj = new Map(list.map(c => [c, []]));
        for (const [a, b] of es) { adj.get(a).push(b); adj.get(b).push(a); }
        const seen = new Set([list[0]]), stack = [list[0]];
        while (stack.length) { const c = stack.pop(); for (const n of adj.get(c)) if (!seen.has(n)) { seen.add(n); stack.push(n); } }
        return seen.size === list.length;
    };
    shuffle(holder, edges);
    const target = 32 + randInt(holder, 3);
    // first: enforce degree limits
    let guard = 0;
    while (guard++ < 500) {
        const d = degree();
        const over = edges.filter(([a, b]) => d.get(a) > maxDeg(a) || d.get(b) > maxDeg(b));
        if (!over.length) break;
        const e = pick(holder, over);
        const rest2 = edges.filter(x => x !== e);
        if (connected(rest2)) edges = rest2; else if (guard > 400) return null;
    }
    // then: thin to the target
    guard = 0;
    while (edges.length > target && guard++ < 500) {
        const i = randInt(holder, edges.length);
        const rest2 = edges.filter((_, j) => j !== i);
        if (connected(rest2)) edges = rest2;
    }
    const d = degree();
    if ([...d.values()].some((v, i) => v > 4) || list.some(c => !d.get(c))) return null;

    // Technical corridor entrances: 6–7 rooms, not the cockpit, spread around
    const techCandidates = shuffle(holder, list.filter(c => c !== cockpit));
    const tech = techCandidates.slice(0, 6 + randInt(holder, 2)).map(c => c.id);

    const roomsSpec = list.map(c => [c.id, kinds.get(c), c.x, c.y]);
    const edgeSpec = edges.map(([a, b]) => [a.id, b.id]);
    // Some corridors bend (L or S shapes) like on the printed board.
    const paths = {};
    for (const [a, b] of edges) {
        const roll = rand(holder);
        if (roll > 0.45) continue;
        const id = a.id < b.id ? a.id + '-' + b.id : b.id + '-' + a.id;
        const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
        const nx = -dy / len, ny = dx / len, off = (rand(holder) < 0.5 ? -1 : 1) * (28 + rand(holder) * 22);
        if (roll < 0.25) paths[id] = [[a.x + dx * 0.5 + nx * off, a.y + dy * 0.5 + ny * off]];
        else paths[id] = [[a.x + dx * 0.33 + nx * off, a.y + dy * 0.33 + ny * off], [a.x + dx * 0.67 - nx * off, a.y + dy * 0.67 - ny * off]];
    }
    return buildShip(roomsSpec, edgeSpec, tech, engineNumbers, 'random', paths);
}

// ---------------------------------------------------------------------------------------------
// Graph helpers (used by the rules engine and the client)
// ---------------------------------------------------------------------------------------------
export function neighbors(ship, roomId) {
    return ship.rooms[roomId].exits.map(e => e.to);
}
export function corridorBetween(ship, a, b) {
    const id = a < b ? a + '-' + b : b + '-' + a;
    return ship.corridors[id] || null;
}
/** Shortest path lengths from `from`, ignoring doors (intruders destroy them). */
export function distances(ship, from) {
    const dist = { [from]: 0 };
    const queue = [from];
    while (queue.length) {
        const cur = queue.shift();
        for (const e of ship.rooms[cur].exits) {
            if (dist[e.to] === undefined) { dist[e.to] = dist[cur] + 1; queue.push(e.to); }
        }
    }
    return dist;
}
export function engineRooms(ship) {
    return Object.values(ship.rooms).filter(r => r.kind === 'engine').sort((a, b) => a.engineNo - b.engineNo);
}
export function roomOfKind(ship, kind) {
    return Object.values(ship.rooms).find(r => r.kind === kind) || null;
}
