// ship.mjs — the Nemesis ship: room tiles, the original board graph and a random ship generator.
// Coordinates are abstract board units (the original board is ~1400 x 950); the client scales them.

import { shuffle, randInt, rand, pick } from './rng.mjs';

// ---------------------------------------------------------------------------------------------
// Room tiles. `slot` — which stack the tile belongs to ('1' basic, '2' additional).
// `items` — item icons for the Search action, `computer` — has a Computer.
// ---------------------------------------------------------------------------------------------
export const ROOM_TILES = {
    archives:     { name: 'Архив',                     slot: '1', items: ['red', 'red', 'red'],         computer: true,
                    action: 'Только при неактивном жетоне знаний: получите 2 знания и переверните жетон знаний на активную сторону.' },
    comms:        { name: 'Пункт связи',               slot: '1', items: ['red', 'yellow'],         computer: true,
                    action: 'Отправить сигнал — отметьте «Сигнал» на планшете персонажа.' },
    emergency:    { name: 'Медпункт',                  slot: '1', items: ['green', 'green'], computer: false,
                    action: 'Сбросьте 1 тяжёлую травму ИЛИ восстановите 3 здоровья.' },
    evacA:        { name: 'Эвакуационный отсек A',     slot: '1', items: ['green', 'red'],            computer: false,
                    action: 'Если есть разблокированная капсула секции A со свободным местом: бросок шума, затем войти в капсулу.' },
    evacB:        { name: 'Эвакуационный отсек B',     slot: '1', items: ['green', 'yellow'],            computer: false,
                    action: 'Если есть разблокированная капсула секции B со свободным местом: бросок шума, затем войти в капсулу.' },
    fireControl:  { name: 'Пожарный пост',             slot: '1', items: ['yellow', 'yellow', 'yellow'],         computer: true,
                    action: 'Выберите комнату: уберите оттуда огонь; все чужие в ней уходят в соседние комнаты.' },
    generator:    { name: 'Генератор',                 slot: '1', items: ['yellow', 'yellow', 'yellow'],  computer: true,
                    action: 'Запустить самоуничтожение (жетон на 3 деления впереди времени) ИЛИ остановить жёлтый отсчёт.' },
    laboratory:   { name: 'Лаборатория',               slot: '1', items: ['green', 'green', 'green'], computer: true,
                    action: 'Проанализируйте тяжёлый объект в комнате или у себя: +2 знания. Если тип объекта ещё не анализировали — положите его над выбранной адаптацией и сбросьте её, иначе сбросьте объект.' },
    nest:         { name: 'Гнездо',                    slot: '1', items: [],                 computer: false,
                    action: 'Взять или уничтожить 1 яйцо, затем бросок шума. Первооткрыватель получает +1 знание.' },
    surgery:      { name: 'Операционная',              slot: '1', items: ['green', 'green', 'green'], computer: false,
                    action: 'Сбросьте все карты действий из колоды и руки. Уберите все заражения из сброса без проверки. Уберите личинку. Потеряйте 1 здоровье и спасуйте.' },
    repository:   { name: 'Хранилище снаряжения',      slot: '1', items: ['red', 'red', 'red'],            computer: false,
                    action: 'Раз за игру: возьмите 3 карты из колоды поддержки, оставьте 1.' },

    airlock:      { name: 'Шлюзовой контроль',         slot: '2', items: ['green', 'red'],            computer: false,
                    action: 'Выберите комнату с входом в тех. коридоры, чужим и без уничтоженных дверей рядом: закройте все соседние двери и начните процедуру шлюзования. Персонажи там считаются пасующими до конца хода.' },
    armory:       { name: 'Оружейная',                 slot: '2', items: ['red', 'red', 'red'],     computer: false,
                    action: 'Зарядите до 2 патронов в одно дальнобойное оружие, которое несёте.' },
    cafeteria:    { name: 'Столовая',                  slot: '2', items: ['green', 'green', 'green'], computer: false,
                    action: 'Восстановите 2 здоровья и/или уберите 1 заражение из руки без проверки. Пассивно: в начале раунда берите 1 дополнительную карту.' },
    commandCenter:{ name: 'Командный центр',           slot: '2', items: ['red', 'yellow'],  computer: true,
                    action: 'Выберите комнату: откройте и/или закройте любые двери в коридорах, соединённых с ней.' },
    containment:  { name: 'Изолятор',                  slot: '2', items: ['green', 'yellow'],computer: true,
                    action: 'Поместите взрослого чужого в любую комнату с входом в тех. коридоры и без чужого. Затем положите поломку в Изоляторе.' },
    contaminated: { name: 'Заражённая комната',        slot: '2', items: ['green', 'red', 'yellow'],computer: false,
                    action: 'Нет действия. Пассивно: получив предмет здесь, получаете заражение.' },
    decon:        { name: 'Дезинфекция',               slot: '2', items: ['green', 'green', 'green'],computer: false,
                    action: 'Уберите все заражения из руки без проверки. Уберите личинку.' },
    engineRoom:   { name: 'Машинное отделение',        slot: '2', items: ['yellow', 'yellow', 'yellow'],computer: true,
                    action: 'Тайно посмотрите верхний жетон каждого двигателя.' },
    hatchControl: { name: 'Контроль шлюзов капсул',    slot: '2', items: ['green', 'red', 'yellow'],  computer: false,
                    action: 'Переверните 1 жетон спасательной капсулы на сторону «заблокирована» или «разблокирована».' },
    server:       { name: 'Серверная',                 slot: '2', items: ['yellow', 'yellow', 'yellow'],         computer: true,
                    action: 'Используйте действие комнаты любой 1 другой разведанной комнаты с компьютером (даже с поломкой). Откройте новую карту компьютера; «Блокировку» разыграйте в этой комнате.' },
    storage:      { name: 'Склад',                     slot: '2', items: ['red', 'red', 'red'],computer: false,
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
const ORIGINAL_TECH = ['002', '004', '005', '009', '014', '015', '019', '021'];
const ORIGINAL_ENGINE_NUMBERS = { '021': 1, '020': 2, '019': 3 };

function buildShip(roomsSpec, edges, techRooms, engineNumbers, mode, paths = {}, pinned = {}) {
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
    // Printed door numbers, where they are known, then one agreed set per corridor for every other
    // door (see agreeNumbers): the same digits on both sides of a passage.
    for (const r of Object.values(rooms)) for (const e of r.exits) { const p = pinned[e.corridor]; if (p) { e.nums = p.slice(); e.num = p[0]; } }
    for (const r of Object.values(rooms)) { const p = pinned['t:' + r.id]; if (p) r.techNums = p.slice(); }
    agreeNumbers(rooms, pinned);
    const ship = { mode, rooms, corridors, techNoise: false };
    computeBounds(ship);
    return ship;
}

/**
 * Noise-die numbers 1..4 for every room. As on the printed board, the four numbers go clockwise from
 * "up" and are all used: a room with fewer than four corridors has corridors that carry two numbers
 * (printed "1 2", "3 4" on the board). Each number goes to the corridor closest to its ideal direction
 * (1 = up, 2 = right, 3 = down, 4 = left). In a room with a technical-corridor hatch the hatch takes
 * the direction farthest from all real corridors (`room.techNums`).
 */
function numberExits(rooms) {
    for (const r of Object.values(rooms)) {
        r.exits.sort((e1, e2) => angleOf(r, rooms[e1.to]) - angleOf(r, rooms[e2.to]));
        const slots = r.exits.map(e => ({ e, a: angleOf(r, rooms[e.to]), nums: [] }));
        const dist = (a, b) => { const d = Math.abs(a - b) % (Math.PI * 2); return Math.min(d, Math.PI * 2 - d); };
        let tech = null;
        if (r.tech && slots.length < 4) {
            let best = -1, ba = 0;
            for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; const d = Math.min(...slots.map(s => dist(s.a, a)), 9); if (d > best) { best = d; ba = a; } }
            tech = { e: null, a: ba, nums: [] }; slots.push(tech);
        }
        // clockwise from the slot nearest to "up"; the four numbers are dealt out consecutively, slots that
        // span the widest angular gap take two numbers (so pairs read "1 2" / "3 4" like the printed board)
        slots.sort((x, y) => x.a - y.a);
        if (slots.length) {
            let startIdx = 0, bd = 1e9; slots.forEach((sl, i) => { const d = dist(sl.a, 0); if (d < bd) { bd = d; startIdx = i; } });
            const ordered = slots.slice(startIdx).concat(slots.slice(0, startIdx));
            const n = ordered.length, counts = ordered.map(() => (n >= 4 ? 1 : Math.floor(4 / n)));
            let extra = n >= 4 ? 0 : 4 - counts.reduce((x, y) => x + y, 0);
            const span = ordered.map((sl, i) => { const nx = ordered[(i + 1) % n]; let g = nx.a - sl.a; if (g <= 0) g += Math.PI * 2; const pv = ordered[(i + n - 1) % n]; let gp = sl.a - pv.a; if (gp <= 0) gp += Math.PI * 2; return g + gp; });
            while (extra-- > 0) { let bi = 0; for (let i = 1; i < n; i++) if (span[i] > span[bi]) bi = i; counts[bi]++; span[bi] = -1; }
            let num = 1;
            ordered.forEach((sl, i) => { for (let k = 0; k < counts[i]; k++) sl.nums.push(num <= 4 ? num : 4), num++; });
        }
        for (const s of slots) if (s.e) { s.e.nums = s.nums; s.e.num = s.nums[0]; }
        r.techNums = tech ? tech.nums : [];
    }
}
/**
 * One set of numbers per corridor. Noise is rolled in a room and the corridor it points to is the one
 * printed with that number; on the board the same passage carries the same digits on both of its ends.
 * The two ends used to be numbered independently, so a corridor could read "1 2" from one room and
 * "4" from the other — a roll of 4 in the second room then lit a different corridor, and the board
 * disagreed with itself. Here the doors are agreed globally: every room still deals out 1..4 exactly
 * once, but each corridor carries a single set, the same set for both rooms it joins.
 * `pinned` fixes the corridors whose printed numbers are known (see ORIGINAL_DOOR_NUMBERS).
 */
function agreeNumbers(rooms, pinned = {}) {
    const roomList = Object.values(rooms);
    const doorKeys = new Set();
    for (const r of roomList) { for (const e of r.exits) doorKeys.add(e.corridor); if (r.tech) doorKeys.add('t:' + r.id); }
    const before = new Map();
    for (const r of roomList) {
        for (const e of r.exits) { if (!before.has(e.corridor)) before.set(e.corridor, []); before.get(e.corridor).push((e.nums || [e.num]).slice()); }
        if (r.tech) before.set('t:' + r.id, [r.techNums.slice()]);
    }
    const sets = [[1], [2], [3], [4], [1, 2], [1, 3], [1, 4], [2, 3], [2, 4], [3, 4]];
    const wide = sets.concat([[1, 2, 3], [1, 2, 4], [1, 3, 4], [2, 3, 4], [1, 2, 3, 4]]);
    const cost = (k, v) => {
        const o = before.get(k) || [];
        let best = 9;
        for (const c of o) best = Math.min(best, c.length + v.length - 2 * c.filter(n => v.includes(n)).length);
        return best;
    };
    const doors = roomList.map(r => ({ id: r.id, list: r.exits.map(e => e.corridor).concat(r.tech ? ['t:' + r.id] : []) }));
    const solve = (domain, allowEmpty) => {
        const dom = new Map([...doorKeys].map(k => {
            const pin = pinned[k];
            if (pin) return [k, [pin]];
            const base = domain.slice().sort((x, y) => cost(k, x) - cost(k, y));
            return [k, allowEmpty ? [[]].concat(base) : base];
        }));
        const assign = new Map();
        let nodes = 0;
        const combos = (rd, un) => {
            const used = new Set();
            for (const k of rd.list) if (assign.has(k)) for (const n of assign.get(k)) used.add(n);
            const rest = [1, 2, 3, 4].filter(n => !used.has(n));
            const out = [];
            const walk = (i, left, cur) => {
                if (i === un.length) { if (!left.length) out.push([...cur.entries()]); return; }
                const k = un[i];
                for (const v of dom.get(k)) if (v.every(n => left.includes(n))) { cur.set(k, v); walk(i + 1, left.filter(n => !v.includes(n)), cur); cur.delete(k); }
            };
            walk(0, rest, new Map());
            return out;
        };
        const go = () => {
            if (++nodes > 200000) return false;
            for (const rd of doors) {
                const seen = new Set();
                for (const k of rd.list) if (assign.has(k)) for (const n of assign.get(k)) { if (seen.has(n)) return false; seen.add(n); }
            }
            let pick = null, opts = null;
            for (const rd of doors) {
                const un = rd.list.filter(k => !assign.has(k));
                if (!un.length) { if (new Set(rd.list.flatMap(k => assign.get(k))).size !== 4) return false; continue; }
                const c = combos(rd, un);
                if (!c.length) return false;
                if (!opts || c.length < opts.length) { pick = rd; opts = c; }
            }
            if (!pick) return true;
            for (const opt of opts) {
                for (const [k, v] of opt) assign.set(k, v);
                if (go()) return true;
                for (const [k] of opt) assign.delete(k);
            }
            return false;
        };
        return go() ? assign : null;
    };
    const done = solve(sets, false) || solve(wide, false) || solve(wide, true);
    if (!done) return;
    for (const r of roomList) {
        for (const e of r.exits) {
            const v = done.get(e.corridor);
            if (v === undefined) continue;
            e.nums = v.slice(); e.num = v[0];
        }
        if (r.tech) { const v = done.get('t:' + r.id); if (v !== undefined) r.techNums = v.slice(); }
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

/**
 * Numbers printed on the board for doors that were read off the scan (the rest are derived). Keyed by
 * corridor id, plus `t:<room>` for a technical-corridor hatch. Both rooms of a corridor share the set.
 */
const ORIGINAL_DOOR_NUMBERS = {
    '001-002': [3], '001-003': [1, 2], '001-004': [4],   // cockpit: 3 / "1 2" / 4
    '002-006': [4], 't:002': [1, 2],                      // 002: hatch "1 2", 001 "3", 006 "4"
    '003-007': [3, 4],                                    // 003: 001 "1 2", 007 "3 4"
    '005-010': [1, 2],                                    // 005: door to 010 carries "1 2"
    '012-016': [3, 4],                                    // 012 and 016 both read "3 4" on the door
};

export function originalShip() {
    return buildShip(ORIGINAL_ROOMS, ORIGINAL_EDGES, ORIGINAL_TECH, ORIGINAL_ENGINE_NUMBERS, 'original', ORIGINAL_PATHS, ORIGINAL_DOOR_NUMBERS);
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
// Test ship for the room gallery. A normal game lays out only 11 basic + 5 additional tiles, so
// many rooms never appear on the table. This board holds *every* tile of the game at once — a 5x5
// grid (specials first, then basic, then additional) with straight corridors between neighbours.
// The rules never build it: the client opens it from the lobby to inspect every room model.
// ---------------------------------------------------------------------------------------------
const SPECIAL_TILES = ['cockpit', 'hibernatorium', 'engine'];
const GALLERY_ALL = [...SPECIAL_TILES, ...BASIC_TILES, ...ADDITIONAL_TILES];
export const GALLERY_TILES = GALLERY_ALL.slice();
const GALLERY_COLS = 5;
const GALLERY_GAP_X = 230, GALLERY_GAP_Y = 210;

export function galleryShip() {
    const roomsSpec = [], tiles = {}, tech = [], engineNumbers = {}, at = {};
    GALLERY_ALL.forEach((tile, i) => {
        const ry = Math.floor(i / GALLERY_COLS), rx = i % GALLERY_COLS;
        const id = String(i + 1).padStart(3, '0');
        const kind = SPECIAL_TILES.includes(tile) ? tile : BASIC_TILES.includes(tile) ? 'slot1' : 'slot2';
        roomsSpec.push([id, kind, rx * GALLERY_GAP_X, ry * GALLERY_GAP_Y]);
        tiles[id] = tile;
        at[ry + ',' + rx] = id;
        if (kind === 'engine') engineNumbers[id] = 1;
        else if (i % 3 === 2) tech.push(id);           // a few technical-corridor hatches to look at
    });
    const edges = [];
    for (const [key, id] of Object.entries(at)) {
        const [ry, rx] = key.split(',').map(Number);
        if (at[ry + ',' + (rx + 1)]) edges.push([id, at[ry + ',' + (rx + 1)]]);   // left → right
        if (at[(ry + 1) + ',' + rx]) edges.push([id, at[(ry + 1) + ',' + rx]]);   // top → bottom
    }
    const ship = buildShip(roomsSpec, edges, tech, engineNumbers, 'gallery');
    ship.galleryTiles = tiles;                        // room id → tile key (the ids are layout order)
    return ship;
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
