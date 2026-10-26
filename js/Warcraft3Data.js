// Warcraft3Data.js — pure Warcraft III-inspired RTS balance data and grid pathfinding.
// Everything is original low-poly content rendered by Warcraft3RTS.js; no external assets.

const Warcraft3Data = {
    GRID_SIZE: 48,
    CELL_SIZE: 64,
    TEAMS: { ALLIANCE: 'alliance', HORDE: 'horde', NEUTRAL: 'neutral' },

    UNITS: {
        peasant: {
            name: 'Крестьянин', team: 'alliance', role: 'worker', hp: 260, damage: 7,
            cooldown: 1.4, speed: 112, range: 70, food: 1, gold: 75, lumber: 0, trainTime: 12,
        },
        footman: {
            name: 'Пехотинец', team: 'alliance', role: 'melee', hp: 430, damage: 22,
            cooldown: 1.35, speed: 105, range: 76, food: 2, gold: 135, lumber: 0, trainTime: 17,
        },
        archer: {
            name: 'Лучник', team: 'alliance', role: 'ranged', hp: 280, damage: 18,
            cooldown: 1.55, speed: 112, range: 370, food: 2, gold: 130, lumber: 30, trainTime: 19,
        },
        paladin: {
            name: 'Паладин', team: 'alliance', role: 'hero', hp: 980, damage: 48,
            cooldown: 1.25, speed: 118, range: 92, food: 5, gold: 0, lumber: 0, trainTime: 0,
        },
        grunt: {
            name: 'Орк-воин', team: 'horde', role: 'melee', hp: 560, damage: 30,
            cooldown: 1.35, speed: 108, range: 82, food: 3, gold: 200, lumber: 0, trainTime: 21,
        },
        headhunter: {
            name: 'Охотник за головами', team: 'horde', role: 'ranged', hp: 350, damage: 23,
            cooldown: 1.6, speed: 116, range: 340, food: 2, gold: 140, lumber: 30, trainTime: 20,
        },
        blademaster: {
            name: 'Мастер клинка', team: 'horde', role: 'hero', hp: 1120, damage: 58,
            cooldown: 1.15, speed: 132, range: 94, food: 5, gold: 0, lumber: 0, trainTime: 0,
        },
    },

    BUILDINGS: {
        townhall: {
            name: 'Ратуша', team: 'alliance', footprint: [4, 4], hp: 2100,
            gold: 385, lumber: 0, buildTime: 0, supply: 10, trains: ['peasant'],
        },
        barracks: {
            name: 'Казармы', team: 'alliance', footprint: [3, 3], hp: 1450,
            gold: 240, lumber: 160, buildTime: 28, trains: ['footman', 'archer'],
        },
        farm: {
            name: 'Ферма', team: 'alliance', footprint: [2, 2], hp: 780,
            gold: 95, lumber: 70, buildTime: 18, supply: 6,
        },
        tower: {
            name: 'Сторожевая башня', team: 'alliance', footprint: [2, 2], hp: 900,
            gold: 150, lumber: 110, buildTime: 22, attack: 26, range: 360, cooldown: 1.8,
        },
        altar: {
            name: 'Алтарь королей', team: 'alliance', footprint: [3, 3], hp: 1050,
            gold: 210, lumber: 120, buildTime: 25,
        },
        greatHall: {
            name: 'Большой зал', team: 'horde', footprint: [4, 4], hp: 2300,
            gold: 385, lumber: 0, buildTime: 0, supply: 10, trains: [],
        },
        orcBarracks: {
            name: 'Орчьи казармы', team: 'horde', footprint: [3, 3], hp: 1550,
            gold: 240, lumber: 160, buildTime: 0, trains: ['grunt', 'headhunter'],
        },
        goldMine: {
            name: 'Золотая шахта', team: 'neutral', footprint: [3, 3], hp: Infinity,
            gold: 0, lumber: 0, buildTime: 0, resource: 'gold',
        },
    },

    // A* over an 8-connected grid. `blocked` is a Set of numeric cell indices (y * n + x).
    // Returns cell coordinates from the first step through the goal, or null if unreachable.
    findPath(n, blocked, startX, startY, goalX, goalY) {
        if (!Number.isInteger(n) || n < 1 || !blocked ||
            startX < 0 || startY < 0 || goalX < 0 || goalY < 0 ||
            startX >= n || startY >= n || goalX >= n || goalY >= n) return null;
        const start = startY * n + startX, goal = goalY * n + goalX;
        if (start === goal) return [];
        if (blocked.has(goal)) return null;

        const size = n * n;
        const scores = new Float64Array(size);
        scores.fill(Infinity);
        const parent = new Int32Array(size);
        parent.fill(-1);
        const closed = new Uint8Array(size);
        const heap = [];
        const octile = (idx) => {
            const x = idx % n, y = Math.floor(idx / n);
            const dx = Math.abs(goalX - x), dy = Math.abs(goalY - y);
            return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
        };
        const push = (idx, f) => {
            const entry = { idx, f };
            heap.push(entry);
            let i = heap.length - 1;
            while (i > 0) {
                const p = (i - 1) >> 1;
                if (heap[p].f <= f) break;
                heap[i] = heap[p]; i = p;
            }
            heap[i] = entry;
        };
        const pop = () => {
            const first = heap[0], last = heap.pop();
            if (heap.length && last) {
                let i = 0;
                while (true) {
                    const l = i * 2 + 1, r = l + 1;
                    if (l >= heap.length) break;
                    const c = r < heap.length && heap[r].f < heap[l].f ? r : l;
                    if (heap[c].f >= last.f) break;
                    heap[i] = heap[c]; i = c;
                }
                heap[i] = last;
            }
            return first;
        };

        scores[start] = 0;
        push(start, octile(start));
        const dirs = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
            [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
        while (heap.length) {
            const current = pop();
            if (!current || closed[current.idx]) continue;
            if (current.idx === goal) {
                const path = [];
                let at = goal;
                while (at !== start && at >= 0) {
                    path.push({ x: at % n, y: Math.floor(at / n) });
                    at = parent[at];
                }
                path.reverse();
                return path;
            }
            closed[current.idx] = 1;
            const x = current.idx % n, y = Math.floor(current.idx / n);
            for (const [dx, dy, cost] of dirs) {
                const nx = x + dx, ny = y + dy;
                if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
                const next = ny * n + nx;
                if (closed[next] || (blocked.has(next) && next !== start)) continue;
                if (dx && dy && (blocked.has(y * n + nx) || blocked.has(ny * n + x))) continue;
                const candidate = scores[current.idx] + cost;
                if (candidate >= scores[next]) continue;
                scores[next] = candidate;
                parent[next] = current.idx;
                push(next, candidate + octile(next));
            }
        }
        return null;
    },

    worldToCell(x, y) {
        const n = this.GRID_SIZE, s = this.CELL_SIZE;
        return {
            x: Math.max(0, Math.min(n - 1, Math.floor(x / s))),
            y: Math.max(0, Math.min(n - 1, Math.floor(y / s))),
        };
    },

    cellToWorld(x, y) {
        const s = this.CELL_SIZE;
        return { x: (x + 0.5) * s, y: (y + 0.5) * s };
    },

    canAfford(resources, cost) {
        return Number(resources.gold) >= Number(cost.gold || 0) &&
            Number(resources.lumber) >= Number(cost.lumber || 0);
    },

    pay(resources, cost) {
        if (!this.canAfford(resources, cost)) return false;
        resources.gold -= Number(cost.gold || 0);
        resources.lumber -= Number(cost.lumber || 0);
        return true;
    },
};
