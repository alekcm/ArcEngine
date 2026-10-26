// HeroesCombat.js — Heroes V 3D tactical arena (10x8 grid), Active Time Battle (ATB) initiative
// queue, melee/ranged/flying rules, retaliation, Hero sideline strikes & spellcasting, tactical AI,
// and 3D battlefield rendering with world-space stack count plaques and spell VFX.

/** @satisfies {Record<string, any>} */
const HeroesCombat = {
    // --- Pure Tactical & ATB Rules (Node-testable) ---

    createStack(side, slotIdx, unitId, count, col, row) {
        const u = HeroesData.UNITS[unitId];
        if (!u) throw new Error('Unknown unit: ' + unitId);
        return {
            uid: side + '_' + slotIdx + '_' + unitId,
            side,              // 'player' | 'enemy'
            id: unitId,
            name: u.name,
            short: u.short,
            count,
            startCount: count,
            topHp: u.hp,
            maxHp: u.hp,
            init: u.init,
            speed: u.speed,
            shots: u.shots || 0,
            col,
            row,
            atb: 0.12 + ((slotIdx * 0.13 + (side === 'player' ? 0.05 : 0.01)) % 0.45),
            defending: false,
            retaliated: false,
            buffBless: 0,
            buffShield: 0,
        };
    },

    // Advance ATB bars until at least one living stack reaches >= 1.0, and return the acting stack.
    advanceATB(stacks) {
        const alive = stacks.filter(s => s.count > 0);
        if (!alive.length) return null;

        let minTime = Infinity;
        for (const s of alive) {
            const rem = Math.max(0, 1 - s.atb);
            const t = rem / Math.max(1, s.init);
            if (t < minTime) minTime = t;
        }
        if (minTime > 0 && Number.isFinite(minTime)) {
            for (const s of alive) s.atb += minTime * Math.max(1, s.init);
        }
        alive.sort((a, b) => (b.atb - a.atb) || (b.init - a.init));
        return alive[0];
    },

    // Non-destructive forecast of the next `limit` turns for the HoMM5 ATB HUD bar.
    predictATBQueue(stacks, limit) {
        const n = limit || 6;
        const sim = stacks
            .filter(s => s.count > 0)
            .map(s => ({ uid: s.uid, side: s.side, short: s.short, count: s.count, init: s.init, atb: s.atb }));
        if (!sim.length) return [];

        const order = [];
        for (let step = 0; step < n; step++) {
            let minT = Infinity;
            for (const s of sim) {
                const t = Math.max(0, 1 - s.atb) / Math.max(1, s.init);
                if (t < minT) minT = t;
            }
            if (minT > 0 && Number.isFinite(minT)) {
                for (const s of sim) s.atb += minT * Math.max(1, s.init);
            }
            sim.sort((a, b) => (b.atb - a.atb) || (b.init - a.init));
            const pick = sim[0];
            order.push({ uid: pick.uid, side: pick.side, short: pick.short, count: pick.count });
            pick.atb = Math.max(0, pick.atb - 1);
        }
        return order;
    },

    isAdjacent(c1, r1, c2, r2) {
        return Math.max(Math.abs(c1 - c2), Math.abs(r1 - r2)) === 1;
    },

    hasAdjacentEnemy(stacks, unit) {
        for (const s of stacks) {
            if (s.count <= 0 || s.side === unit.side) continue;
            if (this.isAdjacent(unit.col, unit.row, s.col, s.row)) return true;
        }
        return false;
    },

    canShoot(stacks, unit) {
        return HeroesData.hasTrait(unit.id, 'ranged') && unit.shots > 0 && !this.hasAdjacentEnemy(stacks, unit);
    },

    // Compute reachable cells `{ key: { col, row, dist, prev } }` within `unit.speed`.
    computeReachable(cols, rows, obstacles, stacks, unit) {
        const blocked = new Set();
        for (const ob of (obstacles || [])) blocked.add(ob.col + ',' + ob.row);
        for (const s of stacks) {
            if (s.count > 0 && s.uid !== unit.uid) blocked.add(s.col + ',' + s.row);
        }

        const reach = new Map();
        const startK = unit.col + ',' + unit.row;
        reach.set(startK, { col: unit.col, row: unit.row, dist: 0, prev: null });

        const flies = HeroesData.hasTrait(unit.id, 'fly');
        if (flies) {
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    const k = c + ',' + r;
                    if (k === startK || blocked.has(k)) continue;
                    const d = Math.hypot(c - unit.col, r - unit.row);
                    if (d <= unit.speed + 0.35) {
                        reach.set(k, { col: c, row: r, dist: d, prev: startK });
                    }
                }
            }
            return reach;
        }

        // Ground BFS (8-neighbor Chebyshev / octagonal tactical distance).
        const queue = [{ col: unit.col, row: unit.row, dist: 0 }];
        const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
        while (queue.length > 0) {
            queue.sort((a, b) => a.dist - b.dist);
            const cur = queue.shift();
            if (!cur) break;
            for (const [dc, dr] of dirs) {
                const nc = cur.col + dc, nr = cur.row + dr;
                if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
                const nk = nc + ',' + nr;
                if (blocked.has(nk)) continue;
                const step = (dc !== 0 && dr !== 0) ? 1.35 : 1.0;
                const nd = +(cur.dist + step).toFixed(3);
                if (nd > unit.speed + 0.05) continue;
                const prevEntry = reach.get(nk);
                if (!prevEntry || nd < prevEntry.dist) {
                    reach.set(nk, { col: nc, row: nr, dist: nd, prev: cur.col + ',' + cur.row });
                    queue.push({ col: nc, row: nr, dist: nd });
                }
            }
        }
        return reach;
    },

    reconstructMovePath(reach, targetCol, targetRow) {
        const out = [];
        let k = targetCol + ',' + targetRow;
        while (k && reach.has(k)) {
            const node = reach.get(k);
            out.push({ col: node.col, row: node.row });
            k = node.prev;
        }
        out.reverse();
        return out;
    },

    // Pick best reachable cell adjacent to `enemy` from which `unit` can perform a melee strike.
    pickMeleeStandCell(reach, unit, enemy, hintX, hintY) {
        if (this.isAdjacent(unit.col, unit.row, enemy.col, enemy.row)) {
            return { col: unit.col, row: unit.row, dist: 0 };
        }
        let best = null;
        let bestScore = Infinity;
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dc === 0 && dr === 0) continue;
                const c = enemy.col + dc, r = enemy.row + dr;
                const entry = reach.get(c + ',' + r);
                if (!entry) continue;
                const hintBias = (hintX != null && hintY != null) ? Math.hypot(c - hintX, r - hintY) * 0.4 : 0;
                const score = entry.dist + hintBias;
                if (score < bestScore) {
                    bestScore = score;
                    best = entry;
                }
            }
        }
        return best;
    },

    // Choose tactical AI action for `unit`.
    chooseAIAction(cols, rows, obstacles, stacks, unit, atkHero, defHero) {
        const enemies = stacks.filter(s => s.count > 0 && s.side !== unit.side);
        if (!enemies.length) return { type: 'defend' };

        // 1. Ranged unit with clear shot: shoot highest-value target!
        if (this.canShoot(stacks, unit)) {
            let bestTarget = enemies[0];
            let bestVal = -1;
            for (const e of enemies) {
                const res = HeroesData.calcStackDamage(unit, e, atkHero, defHero, { rangedShot: true, roll: 0.5 });
                const val = res.kills * HeroesData.UNITS[e.id].power + res.damage * 2 +
                    (HeroesData.hasTrait(e.id, 'ranged') ? 80 : 0);
                if (val > bestVal) { bestVal = val; bestTarget = e; }
            }
            return { type: 'shoot', target: bestTarget };
        }

        // 2. Melee reach check: attack best reachable target.
        const reach = this.computeReachable(cols, rows, obstacles, stacks, unit);
        let bestAttack = null;
        let bestScore = -Infinity;
        for (const e of enemies) {
            const stand = this.pickMeleeStandCell(reach, unit, e);
            if (!stand) continue;
            const res = HeroesData.calcStackDamage(unit, e, atkHero, defHero, { roll: 0.5 });
            const score = res.kills * HeroesData.UNITS[e.id].power + res.damage * 2 +
                (HeroesData.hasTrait(e.id, 'ranged') ? 120 : 0) - stand.dist * 3;
            if (score > bestScore) {
                bestScore = score;
                bestAttack = { type: 'melee', target: e, standCol: stand.col, standRow: stand.row, reach };
            }
        }
        if (bestAttack) return bestAttack;

        // 3. Advance toward closest enemy.
        let nearest = enemies[0];
        let nearD = Infinity;
        for (const e of enemies) {
            const d = Math.hypot(e.col - unit.col, e.row - unit.row);
            if (d < nearD) { nearD = d; nearest = e; }
        }

        let bestMove = null;
        let bestRem = Math.hypot(nearest.col - unit.col, nearest.row - unit.row);
        for (const entry of reach.values()) {
            if (entry.col === unit.col && entry.row === unit.row) continue;
            const rem = Math.hypot(nearest.col - entry.col, nearest.row - entry.row);
            if (rem < bestRem - 0.1) {
                bestRem = rem;
                bestMove = entry;
            }
        }
        if (bestMove) return { type: 'move', col: bestMove.col, row: bestMove.row, reach };
        return { type: 'defend' };
    },

    // --- Interactive 3D Tactical Battle Session (Browser) ---
    async startSession(opts) {
        const {
            view, loc, sound,
            playerHero, playerArmy,
            enemyHero, enemyArmy,
            isSiege, onFinish, onHudSync, onToast,
        } = opts;

        const scene = view.scene;
        const cols = typeof HEROES_ARENA_COLS !== 'undefined' ? HEROES_ARENA_COLS : 10;
        const rows = typeof HEROES_ARENA_ROWS !== 'undefined' ? HEROES_ARENA_ROWS : 8;
        const cellPx = typeof HEROES_ARENA_CELL !== 'undefined' ? HEROES_ARENA_CELL : 86;
        const speedMult = typeof HEROES_COMBAT_SPEED !== 'undefined' ? HEROES_COMBAT_SPEED : 1;

        const centerX = loc.width * 0.5;
        const centerY = loc.height * 0.5;

        // Sample center terrain height so the flat stone battle dais sits cleanly above any slope.
        let maxGround = 0;
        const halfW = (cols * cellPx) * 0.58;
        const halfH = (rows * cellPx) * 0.58;
        for (let sy = -halfH; sy <= halfH; sy += 96) {
            for (let sx = -halfW; sx <= halfW; sx += 96) {
                const gh = loc.terrain ? loc.terrain.heightAt(centerX + sx, centerY + sy) : 0;
                if (gh > maxGround) maxGround = gh;
            }
        }
        const arenaY = maxGround + 18;
        const originX = centerX - (cols * cellPx) * 0.5;
        const originY = centerY - (rows * cellPx) * 0.5;
        const cellToWorld = (c, r) => ({
            x: originX + (c + 0.5) * cellPx,
            y: originY + (r + 0.5) * cellPx,
        });
        const worldToCell = (wx, wy) => {
            const c = Math.floor((wx - originX) / cellPx);
            const r = Math.floor((wy - originY) / cellPx);
            if (c < 0 || r < 0 || c >= cols || r >= rows) return null;
            return { col: c, row: r };
        };

        // Track every disposable resource created during this battle.
        const ownedMeshes = [];
        const ownedMats = [];
        const ownedTex = [];
        const builtModels = [];

        const makeMat = (name, r, g, b, emScale) => {
            const m = new BABYLON.StandardMaterial(name, scene);
            m.diffuseColor = new BABYLON.Color3(r, g, b);
            if (emScale) m.emissiveColor = new BABYLON.Color3(r * emScale, g * emScale, b * emScale);
            ownedMats.push(m);
            return m;
        };

        // 1. Royal Stone Battle Dais & Corner Pillars.
        const daisW = cols * cellPx + 220;
        const daisD = rows * cellPx + 140;
        const dais = BABYLON.MeshBuilder.CreateBox('battle_dais', {
            width: daisW, height: 34, depth: daisD,
        }, scene);
        dais.position.set(centerX, arenaY - 17.5, centerY);
        dais.material = isSiege
            ? makeMat('dais_mat_siege', 0.30, 0.22, 0.22, 0)
            : makeMat('dais_mat_meadow', 0.56, 0.53, 0.45, 0);
        World3D.addObject(view, dais, 'prop', { castShadow: false, receiveShadows: true });
        ownedMeshes.push(dais);

        // 4 decorative corner obelisks framing the arena.
        const pillarMat = isSiege
            ? makeMat('pillar_siege', 0.85, 0.25, 0.14, 0.25)
            : makeMat('pillar_gold', 0.88, 0.72, 0.30, 0.12);
        for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
            const pil = BABYLON.MeshBuilder.CreateCylinder('arena_corner', {
                diameterTop: 18, diameterBottom: 28, height: 56, tessellation: 6,
            }, scene);
            pil.position.set(centerX + sx * (daisW * 0.47), arenaY + 28, centerY + sy * (daisD * 0.45));
            pil.material = pillarMat;
            World3D.addObject(view, pil, 'prop', { castShadow: true, receiveShadows: true });
            ownedMeshes.push(pil);
        }

        // 2. 10x8 Checkerboard Tactical Turf Slabs (2 instanced draw calls for all 80 tiles).
        const slabA = BABYLON.MeshBuilder.CreateBox('arena_slab_a', { width: cellPx - 4, height: 4, depth: cellPx - 4 }, scene);
        const slabB = BABYLON.MeshBuilder.CreateBox('arena_slab_b', { width: cellPx - 4, height: 4, depth: cellPx - 4 }, scene);
        slabA.material = isSiege
            ? makeMat('slab_a_s', 0.40, 0.28, 0.26, 0)
            : makeMat('slab_a_m', 0.36, 0.58, 0.30, 0);
        slabB.material = isSiege
            ? makeMat('slab_b_s', 0.34, 0.23, 0.22, 0)
            : makeMat('slab_b_m', 0.31, 0.51, 0.26, 0);

        const spotsA = [], spotsB = [];
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const p = cellToWorld(c, r);
                const item = { x: p.x, y: p.y, h: arenaY - 1.5, heading: 0, scale: 1 };
                if ((c + r) % 2 === 0) spotsA.push(item);
                else spotsB.push(item);
            }
        }
        const instSlabA = World3D.addInstances(view, slabA, 'prop', spotsA, { castShadow: false, receiveShadows: true, outline: false, ink: false });
        const instSlabB = World3D.addInstances(view, slabB, 'prop', spotsB, { castShadow: false, receiveShadows: true, outline: false, ink: false });

        // 3. Tactical Highlight Overlay Tiles (World3D.LAYER.OVERLAY).
        const hlMats = {
            active: makeMat('hl_active', 0.98, 0.82, 0.20, 0.48),
            move: makeMat('hl_move', 0.20, 0.85, 0.58, 0.34),
            hoverMove: makeMat('hl_hover_move', 0.38, 0.98, 0.72, 0.55),
            attack: makeMat('hl_attack', 0.96, 0.24, 0.24, 0.46),
            spellAlly: makeMat('hl_ally', 0.26, 0.62, 0.98, 0.48),
            aoe: makeMat('hl_aoe', 0.98, 0.46, 0.14, 0.55),
        };
        const hlTiles = new Map();
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const p = cellToWorld(c, r);
                const tile = BABYLON.MeshBuilder.CreateBox('hl_' + c + '_' + r, {
                    width: cellPx - 10, height: 2.2, depth: cellPx - 10,
                }, scene);
                tile.position.set(p.x, arenaY + 1.4, p.y);
                tile.material = hlMats.move;
                tile.visibility = 0.72;
                World3D.addObject(view, tile, 'prop', {
                    layer: World3D.LAYER.OVERLAY, castShadow: false, receiveShadows: false, outline: false, ink: false,
                });
                tile.setEnabled(false);
                hlTiles.set(c + ',' + r, tile);
                ownedMeshes.push(tile);
            }
        }

        // 4. Tactical Arena Obstacles (3 scenic low-poly boulders in center columns).
        const obstacles = [
            { col: 4, row: 2 },
            { col: 5, row: 5 },
            { col: 4, row: 6 },
        ];
        const rockModel = await Model3D.load('assets/models/rock_spire.glb', scene);
        for (let i = 0; i < obstacles.length; i++) {
            const ob = obstacles[i];
            const p = cellToWorld(ob.col, ob.row);
            const rMesh = Model3D.build(rockModel, scene, { name: 'arena_ob_' + i });
            rMesh.position.set(p.x, arenaY, p.y);
            rMesh.scaling.setAll(0.28);
            rMesh.rotation.y = i * 1.9;
            World3D.addObject(view, rMesh, 'prop');
            builtModels.push(rMesh);
        }

        // 5. Sideline Hero Commanders (Lord Godric on West flank, Enemy Commander on East flank).
        const knightModel = await Model3D.load('assets/models/hero_knight.glb', scene);
        const heroWestRoot = Model3D.build(knightModel, scene, { name: 'combat_hero_player' });
        const westPos = cellToWorld(-0.85, (rows - 1) * 0.5);
        heroWestRoot.position.set(westPos.x, arenaY, westPos.y);
        heroWestRoot.scaling.setAll(0.48);
        heroWestRoot.rotation.y = 0; // faces +X across the arena!
        World3D.addObject(view, heroWestRoot, 'actor');
        const heroWestClips = Model3D.clips(heroWestRoot);
        if (heroWestClips) heroWestClips.play('idle');
        builtModels.push(heroWestRoot);

        let heroEastClips = null;
        if (enemyHero) {
            const demonModel = await Model3D.load('assets/models/hero_demon.glb', scene);
            const heroEastRoot = Model3D.build(demonModel, scene, { name: 'combat_hero_enemy' });
            const eastPos = cellToWorld(cols - 0.15, (rows - 1) * 0.5);
            heroEastRoot.position.set(eastPos.x, arenaY, eastPos.y);
            heroEastRoot.scaling.setAll(0.50);
            heroEastRoot.rotation.y = Math.PI; // faces -X toward player!
            World3D.addObject(view, heroEastRoot, 'actor');
            heroEastClips = Model3D.clips(heroEastRoot);
            if (heroEastClips) heroEastClips.play('idle');
            builtModels.push(heroEastRoot);
        }

        // 6. Spawn Creature Stacks & World-Space Stack Count Shield Plaques.
        const rowSlots = [1, 3, 4, 6, 0];
        /** @type {any[]} */
        const stacks = [];

        const spawnSide = async (side, armyList, colIdx) => {
            const valid = (armyList || []).filter(s => s && s.count > 0).slice(0, 5);
            for (let i = 0; i < valid.length; i++) {
                const entry = valid[i];
                const u = HeroesData.UNITS[entry.id];
                if (!u) continue;
                const r = rowSlots[i % rowSlots.length];
                const st = this.createStack(side, i, entry.id, entry.count, colIdx, r);

                const mData = await Model3D.load(u.model, scene);
                const root = Model3D.build(mData, scene, { name: 'stack_' + st.uid });
                const wp = cellToWorld(st.col, st.row);
                root.position.set(wp.x, arenaY, wp.y);
                root.scaling.setAll(u.scale * 1.18);
                // Note: Gltf3D.build fits models so root.rotation.y = 0 faces +X and PI faces -X!
                // Wait: character.glb faces +Z at rotY=0 or +X? Wait: Gltf3D.build adds fit.rotation.y = Math.PI / 2,
                // so a +Z glTF model faces +X at root.rotation.y = 0 and -X at root.rotation.y = Math.PI!
                root.rotation.y = side === 'player' ? 0 : Math.PI;
                World3D.addObject(view, root, 'actor');
                builtModels.push(root);

                const clips = Model3D.clips(root);
                if (clips) clips.play('idle');

                // Billboarding 3D Stack Count Plaque (HoMM5 blue/crimson shield badge).
                const badge = BABYLON.MeshBuilder.CreatePlane('badge_' + st.uid, { width: 34, height: 18 }, scene);
                badge.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
                const tex = new BABYLON.DynamicTexture('badge_tex_' + st.uid, { width: 128, height: 64 }, scene, false);
                tex.hasAlpha = true;
                const bMat = new BABYLON.StandardMaterial('badge_mat_' + st.uid, scene);
                bMat.diffuseTexture = tex;
                bMat.emissiveColor = new BABYLON.Color3(0.85, 0.85, 0.85);
                bMat.specularColor = BABYLON.Color3.Black();
                bMat.backFaceCulling = false;
                badge.material = bMat;
                World3D.addObject(view, badge, 'actor', {
                    layer: World3D.LAYER.ACTOR, castShadow: false, receiveShadows: false, outline: false, ink: false,
                });
                ownedMeshes.push(badge);
                ownedMats.push(bMat);
                ownedTex.push(tex);

                st.root = root;
                st.clips = clips;
                st.badge = badge;
                st.badgeTex = tex;
                st.wx = wp.x;
                st.wy = wp.y;
                st.lift = 0;
                stacks.push(st);
            }
        };

        await spawnSide('player', playerArmy, 0);
        await spawnSide('enemy', enemyArmy, cols - 1);

        const drawStackBadge = (st) => {
            if (!st.badgeTex) return;
            const ctx = st.badgeTex.getContext();
            ctx.clearRect(0, 0, 128, 64);
            ctx.fillStyle = st.side === 'player' ? '#17387a' : '#7f181b';
            ctx.strokeStyle = st.buffBless ? '#fde047' : (st.buffShield ? '#38bdf8' : '#e2b749');
            ctx.lineWidth = 6;
            ctx.beginPath();
            ctx.roundRect(6, 6, 116, 52, 12);
            ctx.fill();
            ctx.stroke();
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 34px system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(String(st.count), 64, 34);
            st.badgeTex.update();
            st.badge.position.set(st.wx + (st.side === 'player' ? -18 : 18), arenaY + 18, st.wy + 20);
        };
        for (const st of stacks) drawStackBadge(st);

        // 7. Reusable Projectile & Spell VFX Meshes.
        const boltMesh = BABYLON.MeshBuilder.CreateBox('vfx_bolt', { width: 22, height: 3.5, depth: 3.5 }, scene);
        boltMesh.material = makeMat('vfx_bolt_mat', 0.98, 0.86, 0.35, 0.65);
        World3D.addObject(view, boltMesh, 'prop', { castShadow: false, receiveShadows: false, outline: false, ink: false });
        boltMesh.setEnabled(false);
        ownedMeshes.push(boltMesh);

        const beamMesh = BABYLON.MeshBuilder.CreateCylinder('vfx_beam', {
            diameterTop: 28, diameterBottom: 44, height: 180, tessellation: 12,
        }, scene);
        const beamMat = makeMat('vfx_beam_mat', 0.98, 0.90, 0.42, 0.72);
        beamMesh.material = beamMat;
        beamMesh.visibility = 0.72;
        World3D.addObject(view, beamMesh, 'prop', {
            layer: World3D.LAYER.ACTOR, castShadow: false, receiveShadows: false, outline: false, ink: false,
        });
        beamMesh.setEnabled(false);
        ownedMeshes.push(beamMesh);

        const fireballMesh = BABYLON.MeshBuilder.CreateSphere('vfx_fire', { segments: 8, diameter: 90 }, scene);
        const fireballMat = makeMat('vfx_fire_mat', 0.98, 0.36, 0.08, 0.75);
        fireballMesh.material = fireballMat;
        fireballMesh.visibility = 0.76;
        World3D.addObject(view, fireballMesh, 'prop', {
            layer: World3D.LAYER.ACTOR, castShadow: false, receiveShadows: false, outline: false, ink: false,
        });
        fireballMesh.setEnabled(false);
        ownedMeshes.push(fireballMesh);

        // --- Combat State Machine ---
        const logLines = ['Тактический бой начался!'];
        const pushLog = (msg) => {
            logLines.push(msg);
            while (logLines.length > 3) logLines.shift();
        };

        /** @type {any} */
        let activeUnit = null;
        /** @type {Map<string, any>} */
        let reachable = new Map();
        let phase = 'idle'; // 'await_input' | 'anim' | 'ended'
        let autoCombat = false;
        let heroActedThisTurn = false;
        /** @type {any} */
        let pendingSpell = null; // { id: 'smite'|'bless'|'stoneskin'|'fireball'|'resurrect'|'hero_strike' }
        let hoverCol = -1, hoverRow = -1;
        /** @type {((dt: number) => void) | null} */
        let animTick = null;

        const playClipOnce = (clips, name, fallbackSec) => new Promise((resolve) => {
            if (!clips || !clips.has || !clips.has(name)) {
                setTimeout(() => resolve(undefined), (fallbackSec || 0.4) * 1000 / speedMult);
                return;
            }
            let done = false;
            const finish = () => {
                if (done) return;
                done = true;
                clips.play('idle', { loop: true });
                resolve(undefined);
            };
            clips.play(name, { loop: false, speed: speedMult * 1.15, then: finish });
            setTimeout(finish, ((fallbackSec || 0.65) * 1000) / speedMult);
        });

        const animateWait = (sec) => new Promise((resolve) => {
            let rem = sec / speedMult;
            animTick = (dt) => {
                rem -= dt;
                if (rem <= 0) { animTick = null; resolve(undefined); }
            };
        });

        const animateMoveStack = (st, pathCells) => new Promise((resolve) => {
            if (!pathCells || pathCells.length <= 1) { resolve(undefined); return; }
            const flies = HeroesData.hasTrait(st.id, 'fly');
            if (st.clips) st.clips.play(st.clips.has('run') ? 'run' : 'walk', { loop: true, speed: speedMult * 1.3 });

            const pts = pathCells.map(p => cellToWorld(p.col, p.row));
            let seg = 0;
            let t = 0;
            const stepDur = (flies ? 0.16 : 0.18) / speedMult;
            let stepSndTimer = 0;

            animTick = (dt) => {
                stepSndTimer -= dt;
                if (stepSndTimer <= 0 && !flies) {
                    sound.play('assets/sounds/step.wav', { volume: 0.25 });
                    stepSndTimer = 0.22;
                }
                t += dt / stepDur;
                while (t >= 1 && seg < pts.length - 2) {
                    t -= 1;
                    seg++;
                }
                const a = pts[seg], b = pts[Math.min(pts.length - 1, seg + 1)];
                const u = Math.min(1, t);
                st.wx = a.x + (b.x - a.x) * u;
                st.wy = a.y + (b.y - a.y) * u;
                const totalProgress = (seg + u) / (pts.length - 1);
                const lift = flies ? Math.sin(totalProgress * Math.PI) * 58 : 0;
                st.root.position.set(st.wx, arenaY + lift, st.wy);
                const dx = b.x - a.x, dy = b.y - a.y;
                if (Math.hypot(dx, dy) > 1) st.root.rotation.y = Math.atan2(-dy, dx);
                st.badge.position.set(st.wx + (st.side === 'player' ? -18 : 18), arenaY + 18 + lift, st.wy + 20);

                if (seg >= pts.length - 2 && t >= 1) {
                    animTick = null;
                    const last = pathCells[pathCells.length - 1];
                    st.col = last.col;
                    st.row = last.row;
                    st.root.position.set(st.wx, arenaY, st.wy);
                    st.root.rotation.y = st.side === 'player' ? 0 : Math.PI;
                    if (st.clips) st.clips.play('idle');
                    drawStackBadge(st);
                    resolve(undefined);
                }
            };
        });

        const animateBolt = (fromSt, toSt) => new Promise((resolve) => {
            const p0 = { x: fromSt.wx, y: fromSt.wy };
            const p1 = { x: toSt.wx, y: toSt.wy };
            boltMesh.rotation.y = Math.atan2(-(p1.y - p0.y), p1.x - p0.x);
            boltMesh.setEnabled(true);
            sound.play('assets/sounds/arrow.wav', { volume: 0.65 });
            let t = 0;
            const dur = 0.26 / speedMult;
            animTick = (dt) => {
                t += dt / dur;
                const u = Math.min(1, t);
                const x = p0.x + (p1.x - p0.x) * u;
                const y = p0.y + (p1.y - p0.y) * u;
                const arc = Math.sin(u * Math.PI) * 26;
                boltMesh.position.set(x, arenaY + 34 + arc, y);
                if (u >= 1) {
                    animTick = null;
                    boltMesh.setEnabled(false);
                    resolve(undefined);
                }
            };
        });

        const animateBeam = (wx, wy, r, g, b) => new Promise((resolve) => {
            beamMat.diffuseColor.set(r, g, b);
            beamMat.emissiveColor.set(r * 0.7, g * 0.7, b * 0.7);
            beamMesh.position.set(wx, arenaY + 88, wy);
            beamMesh.scaling.set(1, 1, 1);
            beamMesh.setEnabled(true);
            let t = 0;
            const dur = 0.42 / speedMult;
            animTick = (dt) => {
                t += dt / dur;
                const s = 1.25 - 0.8 * Math.min(1, t);
                beamMesh.scaling.set(s, 1, s);
                if (t >= 1) {
                    animTick = null;
                    beamMesh.setEnabled(false);
                    resolve(undefined);
                }
            };
        });

        const animateFireball = (wx, wy) => new Promise((resolve) => {
            fireballMesh.position.set(wx, arenaY + 28, wy);
            fireballMesh.scaling.setAll(0.25);
            fireballMesh.setEnabled(true);
            let t = 0;
            const dur = 0.46 / speedMult;
            animTick = (dt) => {
                t += dt / dur;
                const s = 0.25 + Math.sin(Math.min(1, t) * Math.PI * 0.85) * 2.5;
                fireballMesh.scaling.setAll(s);
                if (t >= 1) {
                    animTick = null;
                    fireballMesh.setEnabled(false);
                    resolve(undefined);
                }
            };
        });

        const handleStackDeathIfZero = (st) => {
            if (st.count > 0) {
                drawStackBadge(st);
                return;
            }
            st.root.setEnabled(false);
            st.badge.setEnabled(false);
        };

        const checkBattleOutcome = () => {
            const pAlive = stacks.some(s => s.side === 'player' && s.count > 0);
            const eAlive = stacks.some(s => s.side === 'enemy' && s.count > 0);
            if (!eAlive) return 'victory';
            if (!pAlive) return 'defeat';
            return null;
        };

        const refreshOverlayTiles = () => {
            for (const tile of hlTiles.values()) tile.setEnabled(false);
            if (phase !== 'await_input' || !activeUnit || activeUnit.side !== 'player') return;

            const actTile = hlTiles.get(activeUnit.col + ',' + activeUnit.row);
            if (actTile) { actTile.material = hlMats.active; actTile.setEnabled(true); }

            if (pendingSpell) {
                if (pendingSpell.id === 'fireball') {
                    if (hoverCol >= 0 && hoverRow >= 0) {
                        for (let dr = -1; dr <= 1; dr++) {
                            for (let dc = -1; dc <= 1; dc++) {
                                const t = hlTiles.get((hoverCol + dc) + ',' + (hoverRow + dr));
                                if (t) { t.material = hlMats.aoe; t.setEnabled(true); }
                            }
                        }
                    }
                } else if (pendingSpell.target === 'ally') {
                    for (const s of stacks) {
                        if (s.side !== 'player') continue;
                        if (s.count <= 0 && pendingSpell.id !== 'resurrect') continue;
                        const t = hlTiles.get(s.col + ',' + s.row);
                        if (t) { t.material = hlMats.spellAlly; t.setEnabled(true); }
                    }
                } else {
                    for (const s of stacks) {
                        if (s.side === 'enemy' && s.count > 0) {
                            const t = hlTiles.get(s.col + ',' + s.row);
                            if (t) { t.material = hlMats.attack; t.setEnabled(true); }
                        }
                    }
                }
                return;
            }

            for (const entry of reachable.values()) {
                if (entry.col === activeUnit.col && entry.row === activeUnit.row) continue;
                const t = hlTiles.get(entry.col + ',' + entry.row);
                if (t) {
                    t.material = (entry.col === hoverCol && entry.row === hoverRow) ? hlMats.hoverMove : hlMats.move;
                    t.setEnabled(true);
                }
            }

            const shoots = this.canShoot(stacks, activeUnit);
            for (const e of stacks) {
                if (e.side !== 'enemy' || e.count <= 0) continue;
                const canHit = shoots || !!this.pickMeleeStandCell(reachable, activeUnit, e);
                if (canHit) {
                    const t = hlTiles.get(e.col + ',' + e.row);
                    if (t) { t.material = hlMats.attack; t.setEnabled(true); }
                }
            }
        };

        const executeStrike = async (attacker, defender, optsStrike) => {
            const isRanged = !!(optsStrike && optsStrike.ranged);
            const atkHero = attacker.side === 'player' ? playerHero : enemyHero;
            const defHero = defender.side === 'player' ? playerHero : enemyHero;

            // Face target.
            attacker.root.rotation.y = Math.atan2(-(defender.wy - attacker.wy), defender.wx - attacker.wx);

            if (isRanged) {
                attacker.shots = Math.max(0, attacker.shots - 1);
                if (attacker.clips) attacker.clips.play('attack', { loop: false, speed: speedMult * 1.25 });
                await animateBolt(attacker, defender);
                if (attacker.clips) attacker.clips.play('idle');
            } else {
                sound.play('assets/sounds/sword.wav', { volume: 0.65 });
                await playClipOnce(attacker.clips, 'attack', 0.45);
            }

            const luckChance = Math.min(0.35, Math.max(0, ((atkHero && atkHero.luck) || 0) * 0.08));
            const isLucky = Math.random() < luckChance;
            const meleePen = !isRanged && HeroesData.hasTrait(attacker.id, 'ranged');
            const calc = HeroesData.calcStackDamage(attacker, defender, atkHero, defHero, {
                rangedShot: isRanged,
                meleePenalty: meleePen,
                luck: isLucky,
                roll: Math.random(),
            });
            const applied = HeroesData.applyDamageToStack(defender, calc.damage);
            if (defender.count > 0 && defender.clips && defender.clips.has('hit')) {
                defender.clips.play('hit', { loop: false, speed: 1.4, then: () => defender.clips.play('idle') });
            }
            handleStackDeathIfZero(defender);

            // Imp mana steal trait.
            if (HeroesData.hasTrait(attacker.id, 'manaSteal') && defender.side === 'player' && playerHero.mana > 0) {
                playerHero.mana = Math.max(0, playerHero.mana - 1);
            }

            const luckStr = isLucky ? ' (УДАЧА!)' : '';
            pushLog(`${attacker.short} -> ${defender.short}: -${applied.damage} ур. (пало ${applied.kills})${luckStr}`);
            onHudSync();

            // Retaliation check (melee only).
            const canRetal = !isRanged &&
                defender.count > 0 &&
                !HeroesData.hasTrait(attacker.id, 'noRetal') &&
                (!defender.retaliated || HeroesData.hasTrait(defender.id, 'unlimitedRetal'));

            if (canRetal) {
                defender.retaliated = true;
                await animateWait(0.14);
                defender.root.rotation.y = Math.atan2(-(attacker.wy - defender.wy), attacker.wx - defender.wx);
                sound.play('assets/sounds/sword.wav', { volume: 0.55 });
                await playClipOnce(defender.clips, 'attack', 0.42);
                const retCalc = HeroesData.calcStackDamage(defender, attacker, defHero, atkHero, {
                    meleePenalty: HeroesData.hasTrait(defender.id, 'ranged'),
                    roll: Math.random(),
                });
                const retApp = HeroesData.applyDamageToStack(attacker, retCalc.damage);
                handleStackDeathIfZero(attacker);
                pushLog(`Отпор ${defender.short}: -${retApp.damage} ур. (пало ${retApp.kills})`);
                defender.root.rotation.y = defender.side === 'player' ? 0 : Math.PI;
            }
            attacker.root.rotation.y = attacker.side === 'player' ? 0 : Math.PI;
        };

        const endActiveTurn = async (waitHalf) => {
            if (!activeUnit) return;
            activeUnit.atb = waitHalf ? 0.5 : 0;
            pendingSpell = null;
            refreshOverlayTiles();
            onHudSync();
            await nextTurn();
        };

        const finishBattle = (outcome) => {
            if (phase === 'ended') return;
            phase = 'ended';
            pendingSpell = null;
            for (const tile of hlTiles.values()) tile.setEnabled(false);

            // Summarize surviving player army.
            const survivors = stacks
                .filter(s => s.side === 'player' && s.count > 0)
                .map(s => ({ id: s.id, count: s.count }));
            const casualties = [];
            for (const s of stacks) {
                if (s.side !== 'player') continue;
                const lost = Math.max(0, s.startCount - s.count);
                if (lost > 0) casualties.push({ name: s.name, lost });
            }
            onFinish({ outcome, survivors, casualties });
        };

        const nextTurn = async () => {
            const res = checkBattleOutcome();
            if (res) { finishBattle(res); return; }

            phase = 'anim';
            activeUnit = this.advanceATB(stacks);
            if (!activeUnit) { finishBattle('defeat'); return; }

            // Start-of-turn status resets & buff tick.
            activeUnit.defending = false;
            activeUnit.retaliated = false;
            if (activeUnit.buffBless > 0) activeUnit.buffBless--;
            if (activeUnit.buffShield > 0) activeUnit.buffShield--;
            drawStackBadge(activeUnit);

            if (activeUnit.side === 'player') {
                heroActedThisTurn = false;
            }

            reachable = this.computeReachable(cols, rows, obstacles, stacks, activeUnit);
            onHudSync();

            if (activeUnit.side === 'enemy' || autoCombat) {
                await animateWait(0.22);
                if (phase === 'ended') return;
                const atkH = activeUnit.side === 'player' ? playerHero : enemyHero;
                const defH = activeUnit.side === 'player' ? enemyHero : playerHero;

                // Enemy commander occasionally hurls dark fire if present!
                if (activeUnit.side === 'enemy' && enemyHero && Math.random() < 0.25) {
                    const pTargets = stacks.filter(s => s.side === 'player' && s.count > 0);
                    if (pTargets.length) {
                        const victim = pTargets[Math.floor(Math.random() * pTargets.length)];
                        if (heroEastClips) heroEastClips.play('attack', { loop: false, then: () => heroEastClips.play('idle') });
                        sound.play('assets/sounds/magic.wav', { volume: 0.55 });
                        await animateBeam(victim.wx, victim.wy, 0.95, 0.22, 0.18);
                        const hDmg = 12 + (enemyHero.sp || 2) * 6;
                        const app = HeroesData.applyDamageToStack(victim, hDmg);
                        handleStackDeathIfZero(victim);
                        pushLog(`${enemyHero.name}: Тёмное пламя по ${victim.short} (-${app.damage} ур.)`);
                        const midOut = checkBattleOutcome();
                        if (midOut) { finishBattle(midOut); return; }
                    }
                }

                const act = this.chooseAIAction(cols, rows, obstacles, stacks, activeUnit, atkH, defH);
                if (act.type === 'shoot' && act.target) {
                    await executeStrike(activeUnit, act.target, { ranged: true });
                } else if (act.type === 'melee' && act.target) {
                    if (act.standCol !== activeUnit.col || act.standRow !== activeUnit.row) {
                        const mPath = this.reconstructMovePath(act.reach, act.standCol, act.standRow);
                        await animateMoveStack(activeUnit, mPath);
                    }
                    await executeStrike(activeUnit, act.target, { ranged: false });
                } else if (act.type === 'move') {
                    const mPath = this.reconstructMovePath(act.reach, act.col, act.row);
                    await animateMoveStack(activeUnit, mPath);
                    pushLog(`${activeUnit.short} занимает позицию.`);
                } else {
                    activeUnit.defending = true;
                    pushLog(`${activeUnit.short} встаёт в глухую защиту.`);
                }
                await endActiveTurn(false);
                return;
            }

            // Player controlled turn!
            phase = 'await_input';
            refreshOverlayTiles();
            onHudSync();
        };

        // --- Player Input Commands ---
        const session = {
            arenaY,
            cols,
            rows,
            centerX,
            centerY,
            getActiveUnit: () => activeUnit,
            getStacks: () => stacks,
            getLogText: () => logLines.join('\n'),
            isPlayerInput: () => phase === 'await_input' && activeUnit && activeUnit.side === 'player',
            isAutoCombat: () => autoCombat,
            canHeroAct: () => phase === 'await_input' && activeUnit && activeUnit.side === 'player' && !heroActedThisTurn,
            getPendingSpell: () => pendingSpell,

            toggleAuto() {
                autoCombat = !autoCombat;
                onHudSync();
                if (autoCombat && phase === 'await_input' && activeUnit && activeUnit.side === 'player') {
                    pendingSpell = null;
                    refreshOverlayTiles();
                    // Trigger AI execution for current friendly unit.
                    (async () => {
                        phase = 'anim';
                        const act = HeroesCombat.chooseAIAction(cols, rows, obstacles, stacks, activeUnit, playerHero, enemyHero);
                        if (act.type === 'shoot' && act.target) {
                            await executeStrike(activeUnit, act.target, { ranged: true });
                        } else if (act.type === 'melee' && act.target) {
                            if (act.standCol !== activeUnit.col || act.standRow !== activeUnit.row) {
                                const mPath = HeroesCombat.reconstructMovePath(act.reach, act.standCol, act.standRow);
                                await animateMoveStack(activeUnit, mPath);
                            }
                            await executeStrike(activeUnit, act.target, { ranged: false });
                        } else if (act.type === 'move') {
                            const mPath = HeroesCombat.reconstructMovePath(act.reach, act.col, act.row);
                            await animateMoveStack(activeUnit, mPath);
                        } else {
                            activeUnit.defending = true;
                        }
                        await endActiveTurn(false);
                    })();
                }
            },

            cmdWait() {
                if (!this.isPlayerInput()) return;
                sound.play('assets/sounds/click.wav', { volume: 0.45 });
                pushLog(`${activeUnit.short} выжидает удобного момента.`);
                phase = 'anim';
                endActiveTurn(true);
            },

            cmdDefend() {
                if (!this.isPlayerInput()) return;
                sound.play('assets/sounds/click.wav', { volume: 0.45 });
                activeUnit.defending = true;
                pushLog(`${activeUnit.short} уходит в защиту (+30% ЗАЩ).`);
                phase = 'anim';
                endActiveTurn(false);
            },

            cmdRetreat() {
                if (phase === 'ended') return;
                sound.play('assets/sounds/horn.wav', { volume: 0.5 });
                finishBattle('retreat');
            },

            selectSpellMode(spellOrHeroStrike) {
                if (!this.canHeroAct()) {
                    onToast('Герой уже действовал в ход этого отряда!');
                    return false;
                }
                pendingSpell = spellOrHeroStrike;
                refreshOverlayTiles();
                onHudSync();
                return true;
            },

            cancelSpellMode() {
                if (!pendingSpell) return;
                pendingSpell = null;
                refreshOverlayTiles();
                onHudSync();
            },

            onPointerMove(wx, wy) {
                const cell = worldToCell(wx, wy);
                const nc = cell ? cell.col : -1;
                const nr = cell ? cell.row : -1;
                if (nc !== hoverCol || nr !== hoverRow) {
                    hoverCol = nc;
                    hoverRow = nr;
                    refreshOverlayTiles();
                }
                if (!cell || !activeUnit) return 'Арена тактического боя · ПКМ — вращение камеры · Колесо — зум';

                if (pendingSpell) {
                    return `Выберите цель для «${pendingSpell.name}» (ПКМ или Esc — отмена)`;
                }

                const occ = stacks.find(s => s.col === cell.col && s.row === cell.row && (s.count > 0));
                if (occ) {
                    if (occ.side === 'enemy' && this.isPlayerInput()) {
                        const shoots = HeroesCombat.canShoot(stacks, activeUnit);
                        const stand = shoots ? true : HeroesCombat.pickMeleeStandCell(reachable, activeUnit, occ);
                        if (stand) {
                            const est = HeroesData.calcStackDamage(activeUnit, occ, playerHero, enemyHero, {
                                rangedShot: shoots,
                                meleePenalty: !shoots && HeroesData.hasTrait(activeUnit.id, 'ranged'),
                            });
                            return `${shoots ? '🏹 Выстрел' : '⚔ Удар'} по «${occ.name}» (×${occ.count}): урон ${est.minDamage}–${est.maxDamage} (~${est.kills} падёт)`;
                        }
                    }
                    return `${occ.name} (×${occ.count}) · Здор: ${occ.topHp}/${occ.maxHp} · АТК ${HeroesData.UNITS[occ.id].atk} · ЗАЩ ${HeroesData.UNITS[occ.id].def}`;
                }
                if (reachable.has(cell.col + ',' + cell.row) && this.isPlayerInput()) {
                    return `ЛКМ — переместить «${activeUnit.name}» на клетку (${cell.col + 1}, ${cell.row + 1})`;
                }
                return 'Клетка арены боя';
            },

            async onPointerClick(wx, wy) {
                if (!this.isPlayerInput()) return;
                const cell = worldToCell(wx, wy);
                if (!cell) return;

                // 1. Casting a Hero Spell or Hero Direct Strike!
                if (pendingSpell) {
                    const sp = pendingSpell;
                    if (sp.id === 'fireball') {
                        const targets = stacks.filter(s => s.count > 0 &&
                            Math.abs(s.col - cell.col) <= 1 && Math.abs(s.row - cell.row) <= 1);
                        if (!targets.length) {
                            onToast('В зоне взрыва нет целей!');
                            return;
                        }
                        phase = 'anim';
                        pendingSpell = null;
                        heroActedThisTurn = true;
                        playerHero.mana = Math.max(0, playerHero.mana - sp.mana);
                        refreshOverlayTiles();
                        if (heroWestClips) heroWestClips.play('attack', { loop: false, then: () => heroWestClips.play('idle') });
                        sound.play('assets/sounds/magic.wav', { volume: 0.75 });
                        const wp = cellToWorld(cell.col, cell.row);
                        await animateFireball(wp.x, wp.y);
                        const baseDmg = sp.calcPower(playerHero.sp);
                        let totalKills = 0;
                        for (const t of targets) {
                            const app = HeroesData.applyDamageToStack(t, baseDmg);
                            totalKills += app.kills;
                            handleStackDeathIfZero(t);
                        }
                        pushLog(`Огненный Шар: ${baseDmg} ур. по площади (пало ${totalKills})!`);
                        const out = checkBattleOutcome();
                        if (out) { finishBattle(out); return; }
                        phase = 'await_input';
                        refreshOverlayTiles();
                        onHudSync();
                        return;
                    }

                    if (sp.target === 'ally') {
                        const ally = stacks.find(s => s.side === 'player' && s.col === cell.col && s.row === cell.row &&
                            (s.count > 0 || sp.id === 'resurrect'));
                        if (!ally) {
                            onToast('Выберите дружественный отряд!');
                            return;
                        }
                        phase = 'anim';
                        pendingSpell = null;
                        heroActedThisTurn = true;
                        playerHero.mana = Math.max(0, playerHero.mana - sp.mana);
                        refreshOverlayTiles();
                        if (heroWestClips) heroWestClips.play('attack', { loop: false, then: () => heroWestClips.play('idle') });
                        sound.play('assets/sounds/magic.wav', { volume: 0.72 });

                        if (sp.id === 'resurrect') {
                            ally.root.setEnabled(true);
                            ally.badge.setEnabled(true);
                            await animateBeam(ally.wx, ally.wy, 0.98, 0.92, 0.42);
                            const healHp = sp.calcPower(playerHero.sp);
                            const rev = HeroesData.applyResurrectToStack(ally, healHp);
                            drawStackBadge(ally);
                            pushLog(`Воскрешение «${ally.short}»: +${rev.healed} ОЗ (воскресло ${rev.revived})!`);
                        } else if (sp.id === 'bless') {
                            await animateBeam(ally.wx, ally.wy, 0.98, 0.85, 0.25);
                            ally.buffBless = sp.calcPower(playerHero.sp);
                            drawStackBadge(ally);
                            pushLog(`«${ally.short}» получает Божественную Силу!`);
                        } else if (sp.id === 'stoneskin') {
                            await animateBeam(ally.wx, ally.wy, 0.28, 0.76, 0.98);
                            ally.buffShield = sp.calcPower(playerHero.sp);
                            drawStackBadge(ally);
                            pushLog(`«${ally.short}» укрыт Щитом Света (+6 ЗАЩ)!`);
                        }
                        phase = 'await_input';
                        refreshOverlayTiles();
                        onHudSync();
                        return;
                    }

                    // Enemy target ('smite' or 'hero_strike')
                    const foe = stacks.find(s => s.side === 'enemy' && s.count > 0 && s.col === cell.col && s.row === cell.row);
                    if (!foe) {
                        onToast('Выберите вражеский отряд!');
                        return;
                    }
                    phase = 'anim';
                    pendingSpell = null;
                    heroActedThisTurn = true;
                    playerHero.mana = Math.max(0, playerHero.mana - (sp.mana || 0));
                    refreshOverlayTiles();
                    if (heroWestClips) heroWestClips.play('attack', { loop: false, then: () => heroWestClips.play('idle') });
                    sound.play(sp.id === 'hero_strike' ? 'assets/sounds/sword.wav' : 'assets/sounds/magic.wav', { volume: 0.72 });
                    await animateBeam(foe.wx, foe.wy, 0.98, 0.86, 0.30);

                    let dmg = sp.id === 'hero_strike'
                        ? HeroesData.calcHeroStrikeDamage(playerHero)
                        : sp.calcPower(playerHero.sp);
                    if (sp.id === 'smite' && (HeroesData.hasTrait(foe.id, 'demon') || HeroesData.hasTrait(foe.id, 'undead'))) {
                        dmg = Math.round(dmg * 1.35);
                    }
                    const app = HeroesData.applyDamageToStack(foe, dmg);
                    handleStackDeathIfZero(foe);
                    pushLog(`${sp.name} по ${foe.short}: -${app.damage} ур. (пало ${app.kills})!`);
                    const out = checkBattleOutcome();
                    if (out) { finishBattle(out); return; }
                    phase = 'await_input';
                    refreshOverlayTiles();
                    onHudSync();
                    return;
                }

                // 2. Clicking an enemy stack -> Ranged shot OR move-and-melee!
                const enemy = stacks.find(s => s.side === 'enemy' && s.count > 0 && s.col === cell.col && s.row === cell.row);
                if (enemy) {
                    if (HeroesCombat.canShoot(stacks, activeUnit)) {
                        phase = 'anim';
                        refreshOverlayTiles();
                        await executeStrike(activeUnit, enemy, { ranged: true });
                        await endActiveTurn(false);
                        return;
                    }
                    const hintX = (wx - originX) / cellPx - 0.5;
                    const hintY = (wy - originY) / cellPx - 0.5;
                    const stand = HeroesCombat.pickMeleeStandCell(reachable, activeUnit, enemy, hintX, hintY);
                    if (!stand) {
                        onToast('Враг слишком далеко для атаки в этот ход!');
                        return;
                    }
                    phase = 'anim';
                    refreshOverlayTiles();
                    if (stand.col !== activeUnit.col || stand.row !== activeUnit.row) {
                        const mPath = HeroesCombat.reconstructMovePath(reachable, stand.col, stand.row);
                        await animateMoveStack(activeUnit, mPath);
                    }
                    await executeStrike(activeUnit, enemy, { ranged: false });
                    await endActiveTurn(false);
                    return;
                }

                // 3. Clicking a reachable empty cell -> Move!
                const dest = reachable.get(cell.col + ',' + cell.row);
                if (dest && (dest.col !== activeUnit.col || dest.row !== activeUnit.row)) {
                    phase = 'anim';
                    refreshOverlayTiles();
                    const mPath = HeroesCombat.reconstructMovePath(reachable, dest.col, dest.row);
                    await animateMoveStack(activeUnit, mPath);
                    pushLog(`${activeUnit.short} перемещается.`);
                    await endActiveTurn(false);
                }
            },

            update(dt) {
                if (animTick) animTick(dt);
            },

            dispose() {
                phase = 'ended';
                animTick = null;
                try { instSlabA.dispose(); slabA.dispose(); } catch (e) { /* disposed */ }
                try { instSlabB.dispose(); slabB.dispose(); } catch (e) { /* disposed */ }
                for (const m of builtModels) {
                    try { Model3D.dispose(view, m); } catch (e) { /* disposed */ }
                }
                for (const m of ownedMeshes) {
                    try {
                        World3D.removeObject(view, m);
                        m.dispose();
                    } catch (e) { /* disposed */ }
                }
                for (const t of ownedTex) {
                    try { t.dispose(); } catch (e) { /* disposed */ }
                }
                for (const mat of ownedMats) {
                    try { mat.dispose(); } catch (e) { /* disposed */ }
                }
            },
        };

        // Kick off first ATB turn!
        nextTurn();
        return session;
    },
};
