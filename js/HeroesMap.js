// HeroesMap.js — 32x32 isometric adventure map of the Valley of Ashan: grid coordinates,
// procedural forests/mountains/roads, interactive sites & neutral guards, A* pathfinder with
// road bonus and monster Zone of Control, rival AI hero logic, and 3D map overlays/flags.

/** @satisfies {Record<string, any>} */
const HeroesMap = {
    CELL_SOLID: 1,
    TERRAIN_GRASS: 0,
    TERRAIN_ROAD: 1,
    TERRAIN_ROCK: 2,
    TERRAIN_FOREST: 3,

    // Interactive map sites matching tags in js/Objects.js.
    SITES: [
        {
            id: 'castle_haven', tag: 'castle_haven', kind: 'town_haven',
            name: 'Замок «Когорта Света»', gx: 5, gy: 26, entryGx: 6, entryGy: 25,
            footprint: [[4, 26], [5, 26], [4, 27], [5, 27]],
            owner: 'player', flagOffsetH: 215,
        },
        {
            id: 'castle_inferno', tag: 'castle_inferno', kind: 'town_inferno',
            name: 'Цитадель Инферно «Ургаш-Твердыня»', gx: 26, gy: 5, entryGx: 25, entryGy: 6,
            footprint: [[26, 4], [27, 4], [26, 5], [27, 5]],
            owner: 'enemy', flagOffsetH: 225,
            garrison: [
                { id: 'demon', count: 5 },
                { id: 'hellhound', count: 18 },
                { id: 'skeleton', count: 28 },
                { id: 'imp', count: 36 },
            ],
            siegeHero: { name: 'Архидьявол Кха-Белех', level: 5, atk: 5, def: 5, sp: 4, know: 4 },
        },
        {
            id: 'windmill', tag: 'windmill', kind: 'windmill',
            name: 'Ветряная мельница (+500 зол., +3 дерева/нед.)', gx: 9, gy: 21, entryGx: 9, entryGy: 22,
            footprint: [[9, 21]],
        },
        {
            id: 'mine_wood', tag: 'mine_wood', kind: 'mine', resource: 'wood', amount: 2,
            name: 'Лесопилка (+2 дерева/день)', gx: 3, gy: 20, entryGx: 4, entryGy: 20,
            footprint: [[3, 20]], owner: 'none', flagOffsetH: 120,
        },
        {
            id: 'mine_ore', tag: 'mine_ore', kind: 'mine', resource: 'ore', amount: 2,
            name: 'Рудная шахта (+2 руды/день)', gx: 11, gy: 27, entryGx: 11, entryGy: 26,
            footprint: [[11, 27]], owner: 'none', flagOffsetH: 115,
        },
        {
            id: 'mine_gold_1', tag: 'mine_gold_1', kind: 'mine', resource: 'gold', amount: 1000,
            name: 'Южная золотая шахта (+1000 зол./день)', gx: 9, gy: 14, entryGx: 10, entryGy: 14,
            footprint: [[9, 14]], owner: 'none', flagOffsetH: 125,
        },
        {
            id: 'mine_crystal', tag: 'mine_crystal', kind: 'mine', resource: 'crystal', amount: 1,
            name: 'Кристальная пещера (+1 кристалл/день)', gx: 16, gy: 23, entryGx: 16, entryGy: 22,
            footprint: [[16, 23]], owner: 'none', flagOffsetH: 125,
        },
        {
            id: 'mine_gold_2', tag: 'mine_gold_2', kind: 'mine', resource: 'gold', amount: 1000,
            name: 'Восточная золотая шахта (+1000 зол./день)', gx: 22, gy: 18, entryGx: 22, entryGy: 17,
            footprint: [[22, 18]], owner: 'none', flagOffsetH: 125,
        },
        {
            id: 'shrine_1', tag: 'shrine_1', kind: 'shrine', spell: 'stoneskin', bonusSp: 1,
            name: 'Святилище Света (Щит Света, +1 Колд.)', gx: 12, gy: 22, entryGx: 12, entryGy: 22,
            footprint: [],
        },
        {
            id: 'shrine_2', tag: 'shrine_2', kind: 'shrine', spell: 'fireball', bonusSp: 2,
            name: 'Святилище Огня (Огненный Шар, +2 Колд.)', gx: 19, gy: 9, entryGx: 19, entryGy: 9,
            footprint: [],
        },
        {
            id: 'obelisk_1', tag: 'obelisk_1', kind: 'obelisk', xp: 1100, bonusAtk: 0, bonusDef: 0, bonusKnow: 1,
            name: 'Обелиск Знания (+1100 опыта, +1 Знание)', gx: 14, gy: 18, entryGx: 14, entryGy: 18,
            footprint: [],
        },
        {
            id: 'obelisk_2', tag: 'obelisk_2', kind: 'obelisk', xp: 1500, bonusAtk: 1, bonusDef: 1, bonusKnow: 0,
            name: 'Древний Обелиск (+1500 опыта, +1 АТК, +1 ЗАЩ)', gx: 19, gy: 14, entryGx: 19, entryGy: 14,
            footprint: [],
        },
        {
            id: 'chest_1', tag: 'chest_1', kind: 'chest', gold: 1000, xp: 650,
            name: 'Сундук сокровищ (1000 зол. и 650 опыта)', gx: 4, gy: 24, entryGx: 4, entryGy: 24,
            footprint: [],
        },
        {
            id: 'chest_2', tag: 'chest_2', kind: 'chest', gold: 1800, xp: 1000,
            name: 'Королевский сундук (1800 зол. и 1000 опыта)', gx: 15, gy: 15, entryGx: 15, entryGy: 15,
            footprint: [],
        },
        {
            id: 'chest_3', tag: 'chest_3', kind: 'chest', gold: 2500, xp: 1400,
            name: 'Сундук Древних (2500 зол. и 1400 опыта)', gx: 25, gy: 14, entryGx: 25, entryGy: 14,
            footprint: [],
        },
        {
            id: 'pickup_1', tag: 'pickup_1', kind: 'pickup', gold: 450, wood: 0, ore: 0, crystal: 2,
            name: 'Россыпь кристаллов (+2 крист., +450 зол.)', gx: 8, gy: 28, entryGx: 8, entryGy: 28,
            footprint: [],
        },
        {
            id: 'pickup_2', tag: 'pickup_2', kind: 'pickup', gold: 400, wood: 4, ore: 4, crystal: 2,
            name: 'Караван припасов (+4 дер., +4 руды, +2 крист.)', gx: 13, gy: 12, entryGx: 13, entryGy: 12,
            footprint: [],
        },
        {
            id: 'pickup_3', tag: 'pickup_3', kind: 'pickup', gold: 900, wood: 0, ore: 0, crystal: 4,
            name: 'Жила магии (+4 крист., +900 зол.)', gx: 22, gy: 6, entryGx: 22, entryGy: 6,
            footprint: [],
        },
    ],

    // Neutral monster stacks guarding mines, passes and chests.
    GUARDS: [
        {
            id: 'guard_wood', tag: 'guard_wood', name: 'Стая бесов', gx: 4, gy: 21,
            xpReward: 480, goldReward: 350,
            army: [{ id: 'imp', count: 14 }],
        },
        {
            id: 'guard_ore', tag: 'guard_ore', name: 'Мятежники', gx: 10, gy: 26,
            xpReward: 520, goldReward: 400,
            army: [{ id: 'peasant', count: 22 }],
        },
        {
            id: 'guard_gold_1', tag: 'guard_gold_1', name: 'Нежить кургана', gx: 9, gy: 15,
            xpReward: 820, goldReward: 650,
            army: [{ id: 'skeleton', count: 22 }, { id: 'imp', count: 10 }],
        },
        {
            id: 'guard_crystal', tag: 'guard_crystal', name: 'Адские гончие', gx: 15, gy: 23,
            xpReward: 960, goldReward: 700,
            army: [{ id: 'hellhound', count: 10 }],
        },
        {
            id: 'guard_pass', tag: 'guard_pass', name: 'Горные грифоны', gx: 15, gy: 16,
            xpReward: 1250, goldReward: 900, joinUnit: 'griffin', joinCount: 3,
            army: [{ id: 'griffin', count: 8 }],
        },
        {
            id: 'guard_gold_2', tag: 'guard_gold_2', name: 'Легион склепа', gx: 21, gy: 18,
            xpReward: 1300, goldReward: 950,
            army: [{ id: 'skeleton', count: 28 }, { id: 'hellhound', count: 8 }],
        },
        {
            id: 'guard_gate', tag: 'guard_gate', name: 'Стража Врат Хаоса', gx: 21, gy: 11,
            xpReward: 1900, goldReward: 1400,
            army: [{ id: 'demon', count: 3 }, { id: 'hellhound', count: 12 }, { id: 'imp', count: 24 }],
        },
    ],

    // Road polylines connecting landmarks across the valley.
    ROAD_CHAINS: [
        [[6, 25], [7, 24], [8, 23], [9, 22], [9, 20], [9, 18], [9, 16], [10, 14], [12, 14], [14, 15], [15, 16], [17, 15], [19, 14], [20, 12], [21, 11], [23, 9], [24, 7], [25, 6]],
        [[7, 24], [8, 25], [10, 26], [11, 26], [13, 25], [15, 23], [16, 22], [18, 20], [20, 19], [21, 18], [22, 17]],
        [[7, 24], [5, 23], [4, 21], [4, 20]],
    ],

    // Build pure map model for `worldW` x `worldH` and `gridN` cells.
    createMap(worldW, worldH, gridN) {
        const w = worldW || (typeof LOCATION_WIDTH !== 'undefined' ? LOCATION_WIDTH : 3072);
        const h = worldH || (typeof LOCATION_HEIGHT !== 'undefined' ? LOCATION_HEIGHT : 3072);
        const n = gridN || (typeof HEROES_GRID_SIZE !== 'undefined' ? HEROES_GRID_SIZE : 32);
        const cellW = w / n;
        const cellH = h / n;

        const solid = new Uint8Array(n * n);
        const terrain = new Uint8Array(n * n);
        const idx = (gx, gy) => gy * n + gx;
        const inBounds = (gx, gy) => gx >= 0 && gy >= 0 && gx < n && gy < n;

        // 1. Carve roads first so scenery never blocks them.
        const roadSet = new Set();
        const markRoadLine = (x0, y0, x1, y1) => {
            const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1) * 2;
            for (let i = 0; i <= steps; i++) {
                const gx = Math.round(x0 + (x1 - x0) * (i / steps));
                const gy = Math.round(y0 + (y1 - y0) * (i / steps));
                if (inBounds(gx, gy)) {
                    terrain[idx(gx, gy)] = this.TERRAIN_ROAD;
                    roadSet.add(idx(gx, gy));
                }
            }
        };
        for (const chain of this.ROAD_CHAINS) {
            for (let i = 0; i < chain.length - 1; i++) {
                markRoadLine(chain[i][0], chain[i][1], chain[i + 1][0], chain[i + 1][1]);
            }
        }

        // 2. Keep clearance around all sites, entries, hero spawns, and guards.
        const clearZone = new Set();
        const reserve = (cx, cy, rad) => {
            for (let dy = -rad; dy <= rad; dy++) {
                for (let dx = -rad; dx <= rad; dx++) {
                    const x = cx + dx, y = cy + dy;
                    if (inBounds(x, y)) clearZone.add(idx(x, y));
                }
            }
        };
        reserve(7, 24, 2);
        reserve(24, 7, 2);
        for (const s of this.SITES) {
            reserve(s.gx, s.gy, 1);
            reserve(s.entryGx, s.entryGy, 1);
        }
        for (const g of this.GUARDS) reserve(g.gx, g.gy, 1);
        for (const r of roadSet) clearZone.add(r);
        // Reserve scenic bush positions from Objects.js too.
        for (const [bx, by] of [[6, 22], [10, 22], [13, 19], [18, 15]]) reserve(bx, by, 0);

        // 3. Border mountains & evergreen woods + central diagonal mountain ridges.
        const rockCells = [];
        const pineCells = [];
        const addRock = (gx, gy) => {
            if (!inBounds(gx, gy)) return;
            const k = idx(gx, gy);
            if (clearZone.has(k) || solid[k]) return;
            solid[k] = this.CELL_SOLID;
            terrain[k] = this.TERRAIN_ROCK;
            rockCells.push([gx, gy]);
        };
        const addPine = (gx, gy) => {
            if (!inBounds(gx, gy)) return;
            const k = idx(gx, gy);
            if (clearZone.has(k) || solid[k]) return;
            solid[k] = this.CELL_SOLID;
            terrain[k] = this.TERRAIN_FOREST;
            pineCells.push([gx, gy]);
        };

        // Map perimeter.
        for (let i = 0; i < n; i++) {
            if ((i % 3) === 0) {
                addRock(i, 0); addRock(i, n - 1); addRock(0, i); addRock(n - 1, i);
            } else {
                addPine(i, 0); addPine(i, n - 1); addPine(0, i); addPine(n - 1, i);
            }
        }

        // Strategic mountain ridges framing the central passes of Ashan.
        const mountainClusters = [
            // North-west ridge
            [6, 6], [7, 6], [8, 7], [9, 8], [10, 9], [11, 10],
            // Central-north ridge (separating West Gold Mine from Inferno highlands)
            [15, 7], [16, 8], [16, 9], [17, 10], [17, 11],
            // Central-east ridge (between Central Pass and Crystal Valley)
            [17, 18], [18, 18], [19, 17], [24, 21], [25, 20], [26, 19],
            // Volcanic crags around Inferno NE
            [23, 3], [24, 3], [28, 7], [28, 8], [27, 9],
        ];
        for (const [mx, my] of mountainClusters) addRock(mx, my);

        // Lush low-poly pine groves around Haven, Shrines, and valleys.
        const forestPockets = [
            [2, 17], [3, 17], [2, 18], [2, 23], [2, 25], [2, 28], [3, 29],
            [6, 18], [7, 18], [6, 19], [12, 19], [12, 20],
            [6, 11], [7, 11], [7, 12], [5, 13], [5, 14],
            [13, 28], [14, 28], [14, 27], [18, 26], [19, 26], [20, 25],
            [25, 24], [26, 24], [26, 25], [27, 23],
            [11, 5], [12, 5], [11, 6], [27, 13], [28, 13], [28, 14],
            [23, 15], [23, 16], [17, 21], [18, 22],
        ];
        for (const [fx, fy] of forestPockets) addPine(fx, fy);

        // 4. Mark solid structure footprints (castles, mines, windmill).
        for (const s of this.SITES) {
            for (const [fx, fy] of (s.footprint || [])) {
                if (inBounds(fx, fy)) solid[idx(fx, fy)] = this.CELL_SOLID;
            }
        }

        return {
            n, w, h, cellW, cellH,
            solid, terrain,
            rockCells, pineCells,
            roadCells: Array.from(roadSet).map(k => [k % n, Math.floor(k / n)]),
            cellToWorld(gx, gy) {
                return { x: (gx + 0.5) * cellW, y: (gy + 0.5) * cellH };
            },
            worldToCell(x, y) {
                const gx = Math.max(0, Math.min(n - 1, Math.floor(x / cellW)));
                const gy = Math.max(0, Math.min(n - 1, Math.floor(y / cellH)));
                return { gx, gy };
            },
            isSolid(gx, gy) {
                if (!inBounds(gx, gy)) return true;
                return solid[idx(gx, gy)] === 1;
            },
            stepCost(fromGx, fromGy, toGx, toGy) {
                const diag = (fromGx !== toGx && fromGy !== toGy) ? 1.35 : 1.0;
                const isRoad = terrain[idx(fromGx, fromGy)] === 1 && terrain[idx(toGx, toGy)] === 1;
                return +(diag * (isRoad ? 0.75 : 1.0)).toFixed(3);
            },
        };
    },

    // Resolve clicking on a castle/mine footprint cell to its walkable gate/entry cell.
    resolveTargetCell(map, sitesState, gx, gy) {
        for (const s of this.SITES) {
            const st = sitesState ? sitesState[s.id] : null;
            if (st && st.collected) continue;
            const onFoot = (s.footprint || []).some(([fx, fy]) => fx === gx && fy === gy);
            if (onFoot || (s.gx === gx && s.gy === gy)) {
                return { gx: s.entryGx, gy: s.entryGy, site: s };
            }
            if (s.entryGx === gx && s.entryGy === gy) {
                return { gx, gy, site: s };
            }
        }
        return { gx, gy, site: null };
    },

    // Find a living guard adjacent to (or standing on) `(gx, gy)` — HoMM5 Zone of Control.
    findTriggerGuard(guardsState, gx, gy) {
        let best = null;
        let bestDist = 99;
        for (const g of this.GUARDS) {
            const st = guardsState ? guardsState[g.id] : null;
            if (st && st.defeated) continue;
            const d = Math.max(Math.abs(g.gx - gx), Math.abs(g.gy - gy));
            if (d === 0) return g;
            if (d <= 1 && d < bestDist) {
                best = g;
                bestDist = d;
            }
        }
        return best;
    },

    // A* pathfinder on the 32x32 grid.
    // opts: { guardsState, enemyHero, ignoreZoC?: boolean }
    // Returns array of steps `[{ gx, gy, cost, totalCost }]` (excluding start cell), or null.
    findPath(map, startGx, startGy, goalGx, goalGy, opts) {
        const o = opts || {};
        const n = map.n;
        if (goalGx < 0 || goalGy < 0 || goalGx >= n || goalGy >= n) return null;
        if (startGx === goalGx && startGy === goalGy) return [];

        const resolved = this.resolveTargetCell(map, o.sitesState, goalGx, goalGy);
        const tx = resolved.gx;
        const ty = resolved.gy;
        if (startGx === tx && startGy === ty) return [];
        if (map.isSolid(tx, ty)) return null;

        const key = (x, y) => y * n + x;
        const startK = key(startGx, startGy);
        const goalK = key(tx, ty);

        // Living guards block pass-through and exert 1-cell ZoC (can step IN to fight, cannot walk PAST).
        const guardExact = new Set();
        const guardZoC = new Set();
        if (!o.ignoreZoC) {
            for (const g of this.GUARDS) {
                const st = o.guardsState ? o.guardsState[g.id] : null;
                if (st && st.defeated) continue;
                guardExact.add(key(g.gx, g.gy));
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        const nx = g.gx + dx, ny = g.gy + dy;
                        if (nx >= 0 && ny >= 0 && nx < n && ny < n) guardZoC.add(key(nx, ny));
                    }
                }
            }
        }
        const enemyHeroK = (o.enemyHero && o.enemyHero.alive) ? key(o.enemyHero.gx, o.enemyHero.gy) : -1;

        const gScore = new Float64Array(n * n).fill(Infinity);
        const fScore = new Float64Array(n * n).fill(Infinity);
        const cameFrom = new Int32Array(n * n).fill(-1);
        const closed = new Uint8Array(n * n);
        const open = [startK];

        const heur = (x, y) => {
            const dx = Math.abs(x - tx), dy = Math.abs(y - ty);
            return (Math.min(dx, dy) * 1.35 + Math.abs(dx - dy)) * 0.74;
        };

        gScore[startK] = 0;
        fScore[startK] = heur(startGx, startGy);

        const dirs = [
            [1, 0], [-1, 0], [0, 1], [0, -1],
            [1, 1], [1, -1], [-1, 1], [-1, -1],
        ];

        while (open.length > 0) {
            let bestIdx = 0;
            for (let i = 1; i < open.length; i++) {
                if (fScore[open[i]] < fScore[open[bestIdx]]) bestIdx = i;
            }
            const cur = open[bestIdx];
            open.splice(bestIdx, 1);
            if (cur === goalK) break;
            if (closed[cur]) continue;
            closed[cur] = 1;

            const cx = cur % n, cy = Math.floor(cur / n);
            // If `cur` (not start) is inside a monster ZoC, movement stops here unless stepping onto the targeted guard itself.
            const inZoCStop = cur !== startK && (guardZoC.has(cur) || cur === enemyHeroK);

            for (const [dx, dy] of dirs) {
                const nx = cx + dx, ny = cy + dy;
                if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
                const nk = key(nx, ny);
                if (inZoCStop && !(nk === goalK && (guardExact.has(goalK) || goalK === enemyHeroK))) continue;
                if (closed[nk] || map.isSolid(nx, ny)) continue;
                // Prevent cutting diagonal corners right across solid mountain/castle corners.
                if (dx !== 0 && dy !== 0) {
                    if (map.isSolid(cx + dx, cy) && map.isSolid(cx, cy + dy)) continue;
                }
                // Guard cell itself can only be stepped onto if it is the goal (or triggers fight).
                if (guardExact.has(nk) && nk !== goalK) continue;

                const step = map.stepCost(cx, cy, nx, ny);
                const tent = gScore[cur] + step;
                if (tent < gScore[nk]) {
                    cameFrom[nk] = cur;
                    gScore[nk] = tent;
                    fScore[nk] = tent + heur(nx, ny);
                    if (!open.includes(nk)) open.push(nk);
                }
            }
        }

        if (cameFrom[goalK] === -1) return null;
        const rev = [];
        let cur = goalK;
        while (cur !== startK && cur !== -1) {
            rev.push(cur);
            cur = cameFrom[cur];
        }
        rev.reverse();

        const path = [];
        let prevX = startGx, prevY = startGy;
        let acc = 0;
        for (const k of rev) {
            const x = k % n, y = Math.floor(k / n);
            const c = map.stepCost(prevX, prevY, x, y);
            acc = +(acc + c).toFixed(3);
            path.push({ gx: x, gy: y, cost: c, totalCost: acc });
            prevX = x;
            prevY = y;
        }
        return path;
    },

    // Compute AI Rival Hero (Lord Agrael) daily decision: capture nearby unowned mines or march toward player.
    planEnemyTurn(map, state) {
        const ai = state.enemyHero;
        if (!ai || !ai.alive) return [];
        const budget = 11;
        // Look for nearest unowned / player-owned unguarded mine, else patrol / advance toward player if day >= 4.
        let target = null;
        let bestDist = Infinity;

        for (const s of this.SITES) {
            if (s.kind !== 'mine') continue;
            const st = state.sites[s.id];
            if (st && st.owner === 'enemy') continue;
            const g = this.findTriggerGuard(state.guards, s.entryGx, s.entryGy);
            if (g) continue; // AI avoids neutral stacks until cleared or targets open mines
            const d = Math.hypot(s.entryGx - ai.gx, s.entryGy - ai.gy);
            if (d < bestDist && d <= 16) {
                bestDist = d;
                target = { gx: s.entryGx, gy: s.entryGy };
            }
        }

        if (!target) {
            if (state.day >= 5) {
                target = { gx: state.hero.gx, gy: state.hero.gy };
            } else {
                // Patrol Inferno highlands around (22, 9) <-> (25, 7)
                target = (state.day % 2 === 0) ? { gx: 22, gy: 9 } : { gx: 24, gy: 7 };
            }
        }

        const path = this.findPath(map, ai.gx, ai.gy, target.gx, target.gy, {
            guardsState: state.guards,
            sitesState: state.sites,
        });
        if (!path || !path.length) return [];

        const steps = [];
        for (const p of path) {
            if (p.totalCost <= budget + 0.01) steps.push(p);
            else break;
        }
        return steps;
    },

    // --- 3D Scenery, Ownership Flags & Path/Hover Overlays (Browser only) ---
    async createSceneDecor(view, loc, map) {
        const scene = view.scene;
        const terrain = loc.terrain;
        const hAt = (x, y) => terrain ? terrain.heightAt(x, y) : 0;

        // 1. Load low-poly pine tree and rock spire models for thin-instanced valley forests & ridges.
        const [pineModel, rockModel] = await Promise.all([
            Model3D.load('assets/models/pine_tree.glb', scene),
            Model3D.load('assets/models/rock_spire.glb', scene),
        ]);

        // Deterministic hash for natural sub-tile variation while staying <= 180 instances per batch.
        const hash = (a, b) => {
            const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
            return s - Math.floor(s);
        };

        const pineSpots = [];
        for (const [gx, gy] of map.pineCells) {
            if (pineSpots.length >= 175) break;
            const c = map.cellToWorld(gx, gy);
            const count = (pineSpots.length < 130 && hash(gx, gy) > 0.42) ? 2 : 1;
            for (let k = 0; k < count && pineSpots.length < 175; k++) {
                const ox = (hash(gx + k * 7, gy) - 0.5) * 38;
                const oy = (hash(gx, gy + k * 13) - 0.5) * 38;
                const x = c.x + ox, y = c.y + oy;
                const sc = 0.52 + hash(gx * 3 + k, gy * 5) * 0.28;
                pineSpots.push({
                    x, y, h: hAt(x, y) - 2,
                    heading: hash(gy + k, gx) * Math.PI * 2,
                    scale: sc,
                });
            }
        }

        const rockSpots = [];
        for (const [gx, gy] of map.rockCells) {
            if (rockSpots.length >= 150) break;
            const c = map.cellToWorld(gx, gy);
            const ox = (hash(gx * 2, gy) - 0.5) * 26;
            const oy = (hash(gx, gy * 2) - 0.5) * 26;
            const x = c.x + ox, y = c.y + oy;
            const sc = 0.58 + hash(gx + 5, gy + 9) * 0.36;
            rockSpots.push({
                x, y, h: hAt(x, y) - 4,
                heading: hash(gx * 11, gy * 3) * Math.PI * 2,
                scale: [sc, sc * (0.85 + hash(gy, gx) * 0.45), sc],
            });
        }

        const pineRoot = Model3D.build(pineModel, scene, { name: 'valley_pines' });
        const rockRoot = Model3D.build(rockModel, scene, { name: 'valley_rocks' });
        const pineInst = World3D.addInstances(view, pineRoot, 'prop', pineSpots);
        const rockInst = World3D.addInstances(view, rockRoot, 'prop', rockSpots);

        // 2. Cobblestone royal road slabs (thin-instanced low-poly stone tiles, <= 180).
        const roadSlab = BABYLON.MeshBuilder.CreateCylinder('road_slab', {
            diameterTop: 58, diameterBottom: 64, height: 6, tessellation: 6,
        }, scene);
        const roadMat = new BABYLON.StandardMaterial('road_slab_mat', scene);
        roadMat.diffuseColor = new BABYLON.Color3(0.73, 0.67, 0.55);
        roadSlab.material = roadMat;

        const roadSpots = [];
        for (const [gx, gy] of map.roadCells) {
            if (roadSpots.length >= 180) break;
            const c = map.cellToWorld(gx, gy);
            roadSpots.push({
                x: c.x, y: c.y,
                h: hAt(c.x, c.y) - 0.5,
                heading: hash(gx, gy) * Math.PI,
                scale: [1.05, 1, 0.92],
            });
        }
        const roadInst = World3D.addInstances(view, roadSlab, 'prop', roadSpots, {
            castShadow: false, receiveShadows: true, outline: false, ink: false,
        });

        // 3. Faction Ownership Flags floating above Castles & Mines.
        const flagMap = new Map();
        const flagColors = {
            player: new BABYLON.Color3(0.18, 0.48, 0.96),
            enemy: new BABYLON.Color3(0.88, 0.18, 0.18),
            none: new BABYLON.Color3(0.66, 0.72, 0.80),
        };
        const flagMats = {};
        for (const k of Object.keys(flagColors)) {
            const m = new BABYLON.StandardMaterial('flag_mat_' + k, scene);
            m.diffuseColor = flagColors[k];
            m.emissiveColor = flagColors[k].scale(0.28);
            flagMats[k] = m;
        }
        const poleMat = new BABYLON.StandardMaterial('flag_pole_mat', scene);
        poleMat.diffuseColor = new BABYLON.Color3(0.85, 0.72, 0.32);

        const flagRoots = [];
        for (const s of this.SITES) {
            if (!s.flagOffsetH) continue;
            const c = map.cellToWorld(s.gx, s.gy);
            const root = new BABYLON.Mesh('site_flag_' + s.id, scene);
            const pole = BABYLON.MeshBuilder.CreateCylinder('pole_' + s.id, {
                diameter: 3.5, height: 34, tessellation: 6,
            }, scene);
            pole.position.y = 17;
            pole.material = poleMat;
            pole.parent = root;

            const cloth = BABYLON.MeshBuilder.CreateBox('cloth_' + s.id, {
                width: 24, height: 14, depth: 3,
            }, scene);
            cloth.position.set(12, 26, 0);
            cloth.material = flagMats[s.owner || 'none'];
            cloth.parent = root;

            root.position.set(c.x, hAt(c.x, c.y) + s.flagOffsetH, c.y);
            World3D.addObject(view, root, 'prop', { castShadow: false, receiveShadows: false });
            flagMap.set(s.id, { root, cloth, baseY: hAt(c.x, c.y) + s.flagOffsetH });
            flagRoots.push(root);
        }

        // 4. Tactical Ground Hover Ring & A* Path Step Gems (World3D.LAYER.OVERLAY).
        const hoverRing = BABYLON.MeshBuilder.CreateTorus('adv_hover_ring', {
            diameter: 76, thickness: 5.5, tessellation: 24,
        }, scene);
        const hoverMat = new BABYLON.StandardMaterial('adv_hover_mat', scene);
        hoverMat.diffuseColor = new BABYLON.Color3(0.25, 0.92, 0.52);
        hoverMat.emissiveColor = new BABYLON.Color3(0.15, 0.55, 0.30);
        hoverRing.material = hoverMat;
        World3D.addObject(view, hoverRing, 'prop', {
            layer: World3D.LAYER.OVERLAY, castShadow: false, receiveShadows: false, outline: false, ink: false,
        });
        hoverRing.setEnabled(false);

        const pathDots = [];
        const dotMatNow = new BABYLON.StandardMaterial('path_dot_now', scene);
        dotMatNow.diffuseColor = new BABYLON.Color3(0.24, 0.95, 0.54);
        dotMatNow.emissiveColor = new BABYLON.Color3(0.14, 0.52, 0.28);

        const dotMatLater = new BABYLON.StandardMaterial('path_dot_later', scene);
        dotMatLater.diffuseColor = new BABYLON.Color3(0.96, 0.72, 0.20);
        dotMatLater.emissiveColor = new BABYLON.Color3(0.48, 0.34, 0.08);

        const dotMatFight = new BABYLON.StandardMaterial('path_dot_fight', scene);
        dotMatFight.diffuseColor = new BABYLON.Color3(0.96, 0.26, 0.26);
        dotMatFight.emissiveColor = new BABYLON.Color3(0.54, 0.12, 0.12);

        for (let i = 0; i < 28; i++) {
            const d = BABYLON.MeshBuilder.CreateSphere('path_dot_' + i, { segments: 4, diameter: 16 }, scene);
            d.scaling.y = 0.45;
            d.material = dotMatNow;
            World3D.addObject(view, d, 'prop', {
                layer: World3D.LAYER.OVERLAY, castShadow: false, receiveShadows: false, outline: false, ink: false,
            });
            d.setEnabled(false);
            pathDots.push(d);
        }

        return {
            setVisible(vis) {
                for (const inst of [pineInst, rockInst, roadInst]) {
                    for (const p of inst.parts) p.setEnabled(vis);
                }
                for (const r of flagRoots) r.setEnabled(vis);
                if (!vis) {
                    hoverRing.setEnabled(false);
                    for (const d of pathDots) d.setEnabled(false);
                }
            },
            updateFlags(sitesState, timeSec) {
                for (const [id, entry] of flagMap.entries()) {
                    const owner = (sitesState[id] && sitesState[id].owner) || 'none';
                    entry.cloth.material = flagMats[owner] || flagMats.none;
                    entry.root.rotation.y = Math.sin(timeSec * 2.2 + entry.baseY * 0.05) * 0.22;
                }
            },
            showHover(gx, gy, mode) {
                if (gx < 0 || gy < 0) {
                    hoverRing.setEnabled(false);
                    return;
                }
                const c = map.cellToWorld(gx, gy);
                hoverRing.position.set(c.x, hAt(c.x, c.y) + 4.5, c.y);
                if (mode === 'fight') {
                    hoverMat.diffuseColor.set(0.98, 0.28, 0.28);
                    hoverMat.emissiveColor.set(0.55, 0.12, 0.12);
                } else if (mode === 'Blocked') {
                    hoverMat.diffuseColor.set(0.55, 0.58, 0.64);
                    hoverMat.emissiveColor.set(0.18, 0.18, 0.22);
                } else if (mode === 'later') {
                    hoverMat.diffuseColor.set(0.98, 0.76, 0.22);
                    hoverMat.emissiveColor.set(0.45, 0.34, 0.08);
                } else {
                    hoverMat.diffuseColor.set(0.25, 0.94, 0.54);
                    hoverMat.emissiveColor.set(0.14, 0.52, 0.28);
                }
                hoverRing.setEnabled(true);
            },
            showPath(steps, movePts, isFightEnd) {
                for (let i = 0; i < pathDots.length; i++) {
                    const step = steps && steps[i];
                    if (!step) {
                        pathDots[i].setEnabled(false);
                        continue;
                    }
                    const c = map.cellToWorld(step.gx, step.gy);
                    pathDots[i].position.set(c.x, hAt(c.x, c.y) + 6, c.y);
                    const isLast = i === steps.length - 1;
                    if (isLast && isFightEnd) pathDots[i].material = dotMatFight;
                    else if (step.totalCost <= movePts + 0.01) pathDots[i].material = dotMatNow;
                    else pathDots[i].material = dotMatLater;
                    pathDots[i].scaling.set(isLast ? 1.35 : 0.9, 0.48, isLast ? 1.35 : 0.9);
                    pathDots[i].setEnabled(true);
                }
            },
        };
    },
};
