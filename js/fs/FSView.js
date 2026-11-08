// FSView.js — the board of Forbidden Stars in 3D.
//
// The systems are square tiles on the ground of the location: every tile is
// drawn (DynamicTexture) with its four areas, the worlds and their values,
// the gold borders and the hex of the order tokens. The pieces are markers:
// the units of the players, the structures, the objective tokens, the order
// tokens and the warp storms.
//
// The view only draws the state it is given — it decides nothing (the rules
// engine and the server do that).

// The metrics of the board before the first state arrives.
function view_metrics_fallback(app) {
    return {
        originX: (app.location.width - FSView.TILE * 3) / 2,
        originY: (app.location.height - FSView.TILE * 4) / 2,
        cx: app.location.width / 2,
        cy: app.location.height / 2,
    };
}

// The colour of the body of a die: the face is drawn on top of it.
function fsDieColor(face) {
    return ({
        att: '#b8513a',
        def: '#3f6fb2',
        morale: '#d8b23c',
        blank: '#5c6470',
    })[face] || '#5c6470';
}

// The card of a faction by its name — the same lookup the rules do.
function cardData(state, seat, name) {
    const p = state && state.players ? state.players[seat] : null;
    if (!p || typeof FS_DATA === 'undefined') return null;
    return FS_DATA.combat.find(x => x.faction === p.faction && x.name === name) || null;
}

/** @satisfies {Record<string, any>} */
const FSView = {
    TILE: typeof FS_TILE_PX !== 'undefined' ? FS_TILE_PX : 260,   // world px of one system tile
    AREA: 0.46,            // the share of the tile an area takes
    MARKER_Y: 6,           // the height of the markers over the tile

    // The fight is not lifted off the board: it happens on the same 3D plane,
    // in the contested sector itself. The dice land on the ground of the
    // sector next to the miniatures that already stand there; the cards are
    // not in the world at all — the hand is the bar at the bottom of the screen.
    COMBAT: {
        die: 11,            // the edge of a die on the ground
    },

    // A world is a flat, round piece of the planet laid into its sector — not a
    // sphere. The units and the structures stand ON that circle, so it carries
    // the whole visual identity of the world (the same map on every client).
    PLANET_D: 96,          // world px: the diameter of the round face of a world
    PLANET_H: 7,           // world px: how thick the piece of the planet is
    PLANET_SHIFT: -8,      // world px: the circle is lifted toward the far edge, clear of the printed name
    ON_WORLD: 0.72,        // the miniatures on a world are smaller than the ones in the void
    // world px: the bounding size a structure is normalised to — 25% smaller again
    // (the OBJ models additionally stand at 0.7 of that size; the fallback uses the same constant).
    STRUCTURE_SIZE: 39,
    SELECT_Y: 8,           // the height of the selection ring and of the direction arrow

    /** @param {{location: Location3D, camera: CameraController}} app */
    create(app) {
        const view = {
            app,
            scene: app.location.view.scene,
            tiles: new Map(),
            setupSlots: new Map(),      // free cells during board assembly
            setupPreview: null,         // local, uncommitted tile
            markers: [],
            highlights: [],
            materials: new Map(),
            planets: new Map(),
            planetMaterials: new Map(),
            animated: [],
            glow: null,
            modelCache: new Map(),
            modelLoads: new Map(),
            modelMaterials: new Map(),
            onModelReady: null,
            built: false,
            // The mouse-first interaction: what the player picked and where the
            // group is heading. The rings and the arrow are the only feedback.
            selection: [],
            arrow: null,
            ghost: null,
            clock: 0,
        };

        // The game's nebula ground is applied by FSGame after Location3D finishes loading its defaults.
        if (BABYLON.GlowLayer) {
            view.glow = new BABYLON.GlowLayer('fs-astral-glow', view.scene, { blurKernelSize: 32 });
            view.glow.intensity = .38;
        }

        // --- the materials (one per colour, shared by the markers)
        view.material = (name, hex, opts) => {
            const key = name + '|' + hex + '|' + JSON.stringify(opts || {});
            if (view.materials.has(key)) return view.materials.get(key);
            const m = new BABYLON.StandardMaterial('fs-' + name, view.scene);
            m.diffuseColor = BABYLON.Color3.FromHexString(hex);
            m.specularColor = new BABYLON.Color3(0.05, 0.05, 0.05);
            if (opts && opts.emissive) m.emissiveColor = BABYLON.Color3.FromHexString(hex).scale(0.6);
            if (opts && opts.alpha != null) m.alpha = opts.alpha;
            view.materials.set(key, m);
            return m;
        };

        // --- the highlights of the legal moves
        for (let i = 0; i < 24; i++) {
            const ring = BABYLON.MeshBuilder.CreateTorus('fs-hl' + i, { diameter: 54, thickness: 5, tessellation: 20 }, view.scene);
            ring.material = view.material('hl', '#ffd479', { emissive: true });
            ring.isPickable = false;
            ring.setEnabled(false);
            World3D.addObject(app.location.view, ring, 'prop', { castShadow: false, outline: false });
            view.highlights.push(ring);
        }
        if (view.scene.onBeforeRenderObservable && view.scene.onBeforeRenderObservable.add) {
            view.scene.onBeforeRenderObservable.add(() => {
                const dt = Math.min(0.05, view.scene.getEngine().getDeltaTime() / 1000);
                view.clock += dt;
                // The weather of a flat world drifts; the planet itself stays put so
                // the miniatures standing on it never look like they are sliding.
                for (const planet of view.planets.values()) {
                    if (planet.clouds) planet.clouds.rotation.y += dt * 0.06;
                    if (planet.glow) {
                        const s = 1 + Math.sin(view.clock * 1.1) * 0.012;
                        planet.glow.scaling.set(s, 1, s);
                    }
                }
                for (const item of view.animated) item.mesh.rotation[item.axis] += dt * item.speed;
                this.tweenTick(view);
                this.pulse(view);
            });
        }

        return view;
    },

    spaceGround(app) {
        const scene = app.location.view.scene;
        scene.clearColor = new BABYLON.Color4(0.006, 0.009, 0.018, 1);
        scene.fogColor = new BABYLON.Color3(0.012, 0.018, 0.034);
        scene.fogMode = BABYLON.Scene.FOGMODE_EXP2;
        scene.fogDensity = 0.00008;
        const canvas = document.createElement('canvas');
        if (!canvas || typeof canvas.getContext !== 'function') return;
        canvas.width = canvas.height = 512;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.fillStyle = '#050914'; ctx.fillRect(0, 0, 512, 512);
        // Layered, soft nebulae; the restrained palette leaves the system tiles as the focal point.
        const nebulae = /** @type {[number, number, number, string][]} */ ([
            [92, 118, 210, 'rgba(26,76,127,.30)'], [390, 370, 220, 'rgba(71,30,105,.25)'],
            [355, 72, 150, 'rgba(16,108,120,.19)'], [119, 422, 165, 'rgba(114,49,52,.12)'],
        ]);
        for (const [x, y, radius, color] of nebulae) {
            const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
            g.addColorStop(0, color); g.addColorStop(1, 'rgba(4,8,18,0)');
            ctx.fillStyle = g; ctx.fillRect(0, 0, 512, 512);
        }
        let seed = 417;
        const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
        for (let i = 0; i < 520; i++) {
            const x = rand() * 512, y = rand() * 512, r = 0.35 + rand() * 1.25;
            ctx.globalAlpha = 0.3 + rand() * 0.65;
            ctx.fillStyle = rand() > 0.82 ? '#9ddfff' : '#d9e7ff';
            ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
            if (r > 1.25) {
                ctx.globalAlpha *= 0.34; ctx.strokeStyle = '#b9d5ff'; ctx.lineWidth = .5;
                ctx.beginPath(); ctx.moveTo(x - 4, y); ctx.lineTo(x + 4, y); ctx.moveTo(x, y - 4); ctx.lineTo(x, y + 4); ctx.stroke();
            }
        }
        ctx.globalAlpha = 1;
        if (app.location.terrain && app.location.terrain.setGroundImage) {
            app.location.terrain.setGroundImage(canvas);
            app.location.terrain.material.diffuseColor = new BABYLON.Color3(.76, .81, 1);
            app.location.terrain.outerMaterial.diffuseColor = new BABYLON.Color3(.76, .81, 1);
        }
    },

    // The world position of the centre of a system tile.
    tilePos(app, sys, metrics) {
        const m = metrics || view_metrics_fallback(app);
        return {
            x: m.originX + sys.col * this.TILE,
            y: m.originY + sys.row * this.TILE,
        };
    },

    // The world position of the centre of an area of a tile.
    areaPos(app, sys, pos, metrics) {
        const p = this.tilePos(app, sys, metrics);
        const d = this.TILE * this.AREA / 2;
        const off = { TL: [-d, -d], TR: [d, -d], BL: [-d, d], BR: [d, d] }[pos] || [0, 0];
        return { x: p.x + off[0], y: p.y + off[1] };
    },

    // The tile of a system (drawn once).
    ensureTile(app, view, sys) {
        if (view.tiles.has(sys.id)) return view.tiles.get(sys.id);
        const p = this.tilePos(app, sys, view.metrics);
        const h = app.location.terrain.heightAt(p.x, p.y);
        const base = BABYLON.MeshBuilder.CreateBox('fs-tile-' + sys.id, { width: this.TILE - 6, depth: this.TILE - 6, height: 8 }, view.scene);
        base.position.set(p.x, h + 2, p.y);
        base.material = view.material('tileBase', '#1b2530');
        World3D.addObject(app.location.view, base, 'prop', { outline: false, castShadow: !view.preview });
        base.isPickable = true;
        base.metadata = { fs: 'system', system: sys.id };

        const tex = new BABYLON.DynamicTexture('fs-tex-' + sys.id, { width: 512, height: 512 }, view.scene, true);
        tex.hasAlpha = false;
        // DynamicTexture is vertically inverted when uploaded. Flip V so the
        // printed quadrants match the world-space areaPos and picking geometry.
        tex.vScale = -1;
        tex.vOffset = 1;
        const mat = new BABYLON.StandardMaterial('fs-tile-mat-' + sys.id, view.scene);
        mat.diffuseTexture = tex;
        mat.specularColor = new BABYLON.Color3(0, 0, 0);
        const top = BABYLON.MeshBuilder.CreateGround('fs-top-' + sys.id, { width: this.TILE - 6, height: this.TILE - 6 }, view.scene);
        top.position.set(p.x, h + 6.5, p.y);
        top.material = mat;
        World3D.addObject(app.location.view, top, 'prop', { outline: false, castShadow: !view.preview });
        top.isPickable = true;
        top.metadata = { fs: 'system', system: sys.id };

        // A layered, machined bezel gives every printed system tile a physical table-piece edge.
        // Fine brass rails and recessed corner fasteners are deliberately subtle so the scan stays legible.
        const trim = view.material('tileTrim', '#b78b45');
        const decorations = [];
        const edge = this.TILE - 14, railY = h + 7.35, half = (this.TILE - 6) / 2 - 1.5;
        const rails = [
            [p.x, p.y - half, edge, 1.5], [p.x, p.y + half, edge, 1.5],
            [p.x - half, p.y, 1.5, edge], [p.x + half, p.y, 1.5, edge],
        ];
        rails.forEach((r, i) => {
            const rail = BABYLON.MeshBuilder.CreateBox('fs-rail-' + sys.id + '-' + i,
                { width: r[2], depth: r[3], height: 1.7 }, view.scene);
            rail.position.set(r[0], railY, r[1]); rail.material = trim; rail.isPickable = false;
            World3D.addObject(app.location.view, rail, 'prop', { castShadow: false, ink: false, outline: false });
            decorations.push(rail);
        });
        const boltOffset = (this.TILE - 6) / 2 - 9;
        for (const dx of [-boltOffset, boltOffset]) for (const dz of [-boltOffset, boltOffset]) {
            const bolt = BABYLON.MeshBuilder.CreateCylinder('fs-bolt-' + sys.id + '-' + dx + '-' + dz,
                { diameter: 5, height: 1.8, tessellation: 8 }, view.scene);
            bolt.position.set(p.x + dx, railY, p.y + dz); bolt.material = trim; bolt.isPickable = false;
            World3D.addObject(app.location.view, bolt, 'prop', { castShadow: false, ink: false, outline: false });
            decorations.push(bolt);
        }

        const rec = { base, top, tex, mat, decorations, drawn: '' };
        view.tiles.set(sys.id, rec);
        return rec;
    },

    areaOccupants(state, systemId, pos) {
        return [...new Set([
            ...state.units.filter(unit => unit.system === systemId && unit.area === pos).map(unit => unit.seat),
            ...state.structures.filter(structure => structure.system === systemId && structure.area === pos).map(structure => structure.seat),
        ])].sort((a, b) => a - b);
    },

    // The texture of a tile: areas, worlds, values and the live control state.
    drawTile(view, sys, tile, state) {
        const rec = view.tiles.get(sys.id);
        const ctx = rec.tex.getContext();
        const S = 512;
        ctx.clearRect(0, 0, S, S);
        // Rotate the printed face as a physical tile; areas in state are already
        // rotated into board coordinates for picking, units and adjacency.
        ctx.save();
        if (sys.rotation) {
            ctx.translate(S / 2, S / 2);
            ctx.rotate(sys.rotation * Math.PI / 2);
            ctx.translate(-S / 2, -S / 2);
        }
        // The background of the tile.
        ctx.fillStyle = '#0d1620';
        ctx.fillRect(0, 0, S, S);
        // Four inset data panels give each area a printed, machined surface rather than a flat quadrant.
        for (const area of sys.areas) {
            const r = this.areaRect(area.sourcePos || area.pos);
            const panel = ctx.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h);
            panel.addColorStop(0, area.world ? '#142638' : '#0b1724');
            panel.addColorStop(.52, area.world ? '#101b28' : '#080f19');
            panel.addColorStop(1, '#080d15');
            ctx.fillStyle = panel;
            ctx.fillRect(r.x + 3, r.y + 3, r.w - 6, r.h - 6);
            ctx.strokeStyle = 'rgba(122,157,179,.3)'; ctx.lineWidth = 1;
            ctx.strokeRect(r.x + 8, r.y + 8, r.w - 16, r.h - 16);
            if (area.world) {
                this.drawPlanet(ctx, r, area.world.name);
                // A dark enamel nameplate keeps labels readable over every planet map.
                const plateY = r.y + r.h - 51;
                ctx.fillStyle = 'rgba(4,9,15,.82)';
                ctx.fillRect(r.x + 26, plateY, r.w - 52, 34);
                ctx.strokeStyle = 'rgba(214,177,104,.58)'; ctx.lineWidth = 1;
                ctx.strokeRect(r.x + 26, plateY, r.w - 52, 34);
                ctx.fillStyle = '#f0e4c7'; ctx.font = 'bold 20px system-ui, sans-serif';
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.shadowColor = '#000'; ctx.shadowBlur = 5;
                ctx.fillText(area.world.name, r.x + r.w / 2, plateY + 17, r.w - 66);
                ctx.shadowBlur = 0; ctx.textBaseline = 'alphabetic';
                // The victory flag stands only on the world where an objective token
                // really lies (updatePlanets) — not on every objective-able world.
            } else {
                // A void: layered starfield with a few brighter navigational stars.
                ctx.fillStyle = '#080d14'; ctx.fillRect(r.x + 4, r.y + 4, r.w - 8, r.h - 8);
                // Use the printed face, not the transient system id, so a preview
                // and its confirmed tile have identical stars.
                let seed = Array.from(sys.tile).reduce((n, ch) => n * 31 + ch.charCodeAt(0), 0) + r.x + r.y * 3;
                for (let i = 0; i < 34; i++) {
                    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
                    const x = r.x + 12 + (seed % (r.w - 24));
                    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
                    const y = r.y + 12 + (seed % (r.h - 24));
                    const bright = i % 7 === 0;
                    ctx.fillStyle = bright ? '#a9d6ed' : '#596f84';
                    ctx.globalAlpha = bright ? .9 : .48;
                    ctx.fillRect(x, y, bright ? 2.5 : 1.5, bright ? 2.5 : 1.5);
                    if (bright) {
                        ctx.globalAlpha = .28; ctx.strokeStyle = '#9bc9e5'; ctx.lineWidth = .7;
                        ctx.beginPath(); ctx.moveTo(x - 4, y + 1); ctx.lineTo(x + 6, y + 1);
                        ctx.moveTo(x + 1, y - 4); ctx.lineTo(x + 1, y + 6); ctx.stroke();
                    }
                }
                ctx.globalAlpha = 1;
                ctx.fillStyle = '#96aabd'; ctx.font = 'bold 11px system-ui, sans-serif';
                ctx.textAlign = 'center'; ctx.fillText('DEEP SPACE', r.x + r.w / 2, r.y + r.h - 18);
            }
            // A live faction badge shows control or a contested area without covering the world art.
            const seats = this.areaOccupants(state, sys.id, area.pos);
            const bx = r.x + r.w - 22, by = r.y + 43;
            if (seats.length === 1) {
                const player = state.players.find(p => p.seat === seats[0]);
                ctx.beginPath(); ctx.arc(bx, by, 9, 0, Math.PI * 2);
                ctx.fillStyle = player ? player.color : '#8295a4'; ctx.fill();
                ctx.strokeStyle = 'rgba(239,242,238,.88)'; ctx.lineWidth = 1.5; ctx.stroke();
                ctx.fillStyle = '#fff'; ctx.font = 'bold 9px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                const sigil = player && player.name ? Array.from(player.name.trim())[0] : String(seats[0] + 1);
                ctx.fillText(sigil.toUpperCase(), bx, by + .5); ctx.textBaseline = 'alphabetic';
            } else if (seats.length > 1) {
                ctx.beginPath(); ctx.arc(bx, by, 9, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(20,13,18,.9)'; ctx.fill();
                ctx.strokeStyle = '#f28470'; ctx.lineWidth = 2; ctx.stroke();
                ctx.strokeStyle = '#f6d7c7'; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.moveTo(bx - 4, by - 4); ctx.lineTo(bx + 4, by + 4); ctx.moveTo(bx + 4, by - 4); ctx.lineTo(bx - 4, by + 4); ctx.stroke();
            }
            // Tiny area coordinates and corner ticks make the four sectors easy to orient at a glance.
            ctx.strokeStyle = 'rgba(212,177,104,.52)'; ctx.lineWidth = 2;
            const inset = 11, tick = 11;
            for (const sx of [1, -1]) for (const sy of [1, -1]) {
                const x = sx > 0 ? r.x + inset : r.x + r.w - inset;
                const y = sy > 0 ? r.y + inset : r.y + r.h - inset;
                ctx.beginPath(); ctx.moveTo(x, y + sy * tick); ctx.lineTo(x, y); ctx.lineTo(x + sx * tick, y); ctx.stroke();
            }
            ctx.fillStyle = '#72899a'; ctx.font = 'bold 10px system-ui, sans-serif';
            ctx.textAlign = 'right'; ctx.fillText(area.pos, r.x + r.w - 16, r.y + 23);
        }
        // The gold borders.
        ctx.strokeStyle = '#c9a227';
        ctx.lineWidth = 4;
        for (const area of sys.areas) {
            const r = this.areaRect(area.sourcePos || area.pos);
            ctx.strokeRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4);
        }
        // The hex of the order tokens in the centre.
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const a = Math.PI / 6 + i * Math.PI / 3;
            const x = S / 2 + Math.cos(a) * 54, y = S / 2 + Math.sin(a) * 54;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.strokeStyle = '#c9a227';
        ctx.fillStyle = '#141d26';
        ctx.fill();
        ctx.stroke();
        // The code of the tile.
        ctx.fillStyle = '#6d8496';
        ctx.font = '16px system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(sys.tile, 10, S - 12);
        ctx.restore();
        // The values of a world are NOT printed on the rotating tile: they are
        // stamped on plates at the poles of the planet itself (updatePlanets) —
        // capacity on the north pole, materiel and asset tokens on the south.
        rec.tex.update();
    },

    // The metrics before the board is known — the middle of the location.
    areaRect(pos) {
        const S = 512, half = S / 2;
        const r = { TL: { x: 0, y: 0 }, TR: { x: half, y: 0 }, BL: { x: 0, y: half }, BR: { x: half, y: half } }[pos];
        return { x: r.x, y: r.y, w: half, h: half };
    },

    // The face of an order token: the mark of the order drawn as a shape, not as a
    // letter — a crossed blade, a drop pod, a star and a crown. The shapes are
    // vector paths so that no font is needed on the texture.
    orderTexture(view, order) {
        if (!view.orderTex) view.orderTex = new Map();
        if (view.orderTex.has(order)) return view.orderTex.get(order);
        const S = 128;
        const tex = new BABYLON.DynamicTexture('fs-order-' + order, { width: S, height: S }, view.scene, true);
        tex.hasAlpha = true;
        const ctx = /** @type {any} */ (tex.getContext());
        ctx.clearRect(0, 0, S, S);
        const c = S / 2;
        // The rim of the token.
        ctx.strokeStyle = 'rgba(255,236,190,.85)';
        ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(c, c, c - 7, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = 'rgba(24,18,26,.55)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(c, c, c - 13, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = '#fff6dd';
        ctx.fillStyle = '#fff6dd';
        ctx.lineWidth = 9;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        if (order === 'advance') {
            // Two blades crossed: the march and the battle.
            ctx.beginPath(); ctx.moveTo(c - 27, c + 27); ctx.lineTo(c + 27, c - 27); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(c + 27, c + 27); ctx.lineTo(c - 27, c - 27); ctx.stroke();
            ctx.lineWidth = 5;
            for (const k of [1, -1]) {
                ctx.beginPath(); ctx.moveTo(c + k * 6, c + k * 33); ctx.lineTo(c + k * 20, c + k * 33); ctx.stroke();
            }
        } else if (order === 'deploy') {
            // A drop pod: a shield with a cross of reinforcement.
            ctx.beginPath();
            ctx.moveTo(c, c - 32); ctx.lineTo(c + 26, c - 18); ctx.lineTo(c + 26, c + 12);
            ctx.quadraticCurveTo(c, c + 38, c - 26, c + 12); ctx.lineTo(c - 26, c - 18);
            ctx.closePath(); ctx.stroke();
            ctx.lineWidth = 7;
            ctx.beginPath(); ctx.moveTo(c - 13, c - 2); ctx.lineTo(c + 13, c - 2); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(c, c - 15); ctx.lineTo(c, c + 11); ctx.stroke();
        } else if (order === 'strategize') {
            // A six-pointed star: the plan.
            ctx.beginPath();
            for (let i = 0; i < 12; i++) {
                const a = -Math.PI / 2 + i * Math.PI / 6;
                const r = i % 2 ? 14 : 34;
                const x = c + Math.cos(a) * r, y = c + Math.sin(a) * r;
                if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            }
            ctx.closePath(); ctx.stroke();
            ctx.beginPath(); ctx.arc(c, c, 6, 0, Math.PI * 2); ctx.fill();
        } else {
            // A crown: domination.
            ctx.beginPath();
            ctx.moveTo(c - 30, c + 20); ctx.lineTo(c - 30, c - 16); ctx.lineTo(c - 15, c + 2);
            ctx.lineTo(c, c - 24); ctx.lineTo(c + 15, c + 2); ctx.lineTo(c + 30, c - 16);
            ctx.lineTo(c + 30, c + 20); ctx.closePath(); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(c - 30, c + 28); ctx.lineTo(c + 30, c + 28); ctx.stroke();
        }
        tex.update();
        view.orderTex.set(order, tex);
        return tex;
    },

    // The other face of the order token: the mark of the faction that laid it.
    factionTexture(view, factionId) {
        if (!view.factionTex) view.factionTex = new Map();
        if (view.factionTex.has(factionId)) return view.factionTex.get(factionId);
        const S = 128;
        const tex = new BABYLON.DynamicTexture('fs-faction-' + factionId, { width: S, height: S }, view.scene, true);
        tex.hasAlpha = true;
        const ctx = /** @type {any} */ (tex.getContext());
        const f = FS_DATA.factions.find(x => x.id === factionId);
        const color = (f && f.color) || '#8899aa';
        const c = S / 2;
        ctx.clearRect(0, 0, S, S);
        ctx.fillStyle = 'rgba(16,13,20,.92)';
        ctx.beginPath(); ctx.arc(c, c, c - 5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(c, c, c - 14, 0, Math.PI * 2); ctx.fill();
        // The initials of the faction over the field of its colour.
        const words = ((f && (f.full || f.name)) || '?').split(/\s+/).filter(Boolean);
        const letters = words.slice(0, 2).map(w => w[0].toUpperCase()).join('');
        ctx.fillStyle = 'rgba(18,14,20,.92)';
        ctx.font = 'bold ' + (letters.length > 1 ? 54 : 66) + 'px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(letters, c, c + 3);
        ctx.strokeStyle = 'rgba(255,244,214,.85)';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(c, c, c - 8, 0, Math.PI * 2); ctx.stroke();
        tex.update();
        view.factionTex.set(factionId, tex);
        return tex;
    },

    // The colour of a faction.
    factionColor(id) {
        const f = FS_DATA.factions.find(x => x.id === id);
        return f ? f.color : '#8899aa';
    },

    worldColor(name) {
        let h = 0;
        for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
        const hue = h % 360;
        return 'hsl(' + hue + ', 55%, 43%)';
    },

    // The printed cradle of a world: the sector keeps a fine landing rim around
    // the place where the round piece of the planet lies.
    drawPlanet(ctx, r, name) {
        const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
        const radius = this.PLANET_D / (this.TILE - 6) * 512 / 2 + 13;
        ctx.save();
        ctx.strokeStyle = 'rgba(94,174,207,.34)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx, cy, radius + 5, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = 'rgba(212,177,104,.30)'; ctx.lineWidth = 1.2;
        ctx.setLineDash([9, 7]);
        ctx.beginPath(); ctx.arc(cx, cy, radius + 11, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
        void name;
    },

    // The poles carry the world's dossier printed straight on the ice: the unit
    // capacity on the north cap, the materiel and the asset tokens on the south.
    // The icons keep their colours and take a small black rim so they read on
    // any cap — no plates, no backing, nothing else.
    drawPlanetPoles(ctx, size, world) {
        if (!world) return;
        const R = size / 2;
        const hasIcons = typeof FSIcons !== 'undefined';
        const icon = 46, font = 'bold 52px system-ui, sans-serif';
        // Slightly off the silhouette: the caps narrow at the rim and clip at the poles' apex.
        const northY = R * .15, southY = size - R * .15;
        const outline = '#101010';
        const print = (iconName, cx, cy, s) => {
            if (hasIcons) FSIcons.canvas(ctx, iconName, cx, cy, s, { outline });
        };
        const number = (text, x, y, fill) => {
            ctx.font = font;
            ctx.lineJoin = 'round';
            ctx.lineWidth = 8;
            ctx.strokeStyle = outline;
            ctx.strokeText(text, x, y);
            ctx.fillStyle = fill;
            ctx.fillText(text, x, y);
        };
        ctx.save();
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';
        // North — the unit capacity.
        const cap = String(world.capacity != null ? world.capacity : 0);
        ctx.font = font;
        const capW = ctx.measureText(cap).width;
        const capBlock = (hasIcons ? icon + 14 : 0) + capW;
        let x = R - capBlock / 2;
        print('mark.skull', x + icon / 2, northY, icon);
        x += hasIcons ? icon + 14 : 0;
        number(cap, x, northY + 2, '#e9dec3');
        // South — the materiel value and the asset tokens. A world that yields no
        // materiel prints nothing of it: neither the icon nor the digit.
        const materiel = world.materiel != null ? world.materiel : 0;
        const hasMateriel = materiel > 0;
        const num = String(materiel);
        ctx.font = font;
        const numW = hasMateriel ? ctx.measureText(num).width : 0;
        const assetGlyph = { forge: 'asset.forge', cache: 'asset.cache', reinforcement: 'order.event', prosperity: 'asset.prosperity' };
        const assets = world.assets || [];
        const chip = 42, gap = 12;
        const materielBlock = hasMateriel ? (hasIcons ? icon + 14 : 0) + numW : 0;
        const block = materielBlock + (assets.length ? (hasMateriel ? 16 : 0) + assets.length * chip + (assets.length - 1) * gap : 0);
        let sx = R - block / 2;
        if (hasMateriel) {
            print('asset.materiel', sx + icon / 2, southY, icon);
            sx += hasIcons ? icon + 14 : 0;
            number(num, sx, southY + 2, '#a8d08a');
            sx += numW + 16;
        }
        for (const asset of assets) {
            print(assetGlyph[asset] || 'asset.cache', sx + chip / 2, southY, chip);
            sx += chip + gap;
        }
        ctx.restore();
    },

    // The round map of a world seen from above: continents, bands, caps and a
    // lit rim. Only the inscribed circle of the texture is sampled by the disc.
    planetTexture(view, name, world) {
        const size = 512, R = size / 2;
        let seed = 0;
        for (let i = 0; i < name.length; i++) seed = (seed * 31 + name.charCodeAt(i)) >>> 0;
        const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
        const gas = /gas|jupiter|saturn|tempest|vigilus|shroud/i.test(name);
        const ice = /fenris|ice|frost|crucible|cadia/i.test(name);
        const ocean = /macragge|ultramar|aurelia|mundo|prandium|caliban|terra|earth/i.test(name);
        const base = this.worldColor(name);
        const tex = new BABYLON.DynamicTexture('fs-planet-disc-' + name, { width: size, height: size }, view.scene, true);
        tex.hasAlpha = false;
        const ctx = /** @type {any} */ (tex.getContext());
        ctx.clearRect(0, 0, size, size);
        ctx.save();
        ctx.beginPath(); ctx.arc(R, R, R - 1, 0, Math.PI * 2); ctx.clip();
        // The ground of the world.
        const ground = ctx.createRadialGradient(R * .72, R * .62, R * .12, R, R, R);
        if (gas) {
            ground.addColorStop(0, '#f3d6a6'); ground.addColorStop(.55, base); ground.addColorStop(1, '#2a2033');
        } else if (ocean) {
            ground.addColorStop(0, '#3f7fa8'); ground.addColorStop(.55, '#1d4a6d'); ground.addColorStop(1, '#081825');
        } else {
            ground.addColorStop(0, base); ground.addColorStop(.55, base); ground.addColorStop(1, '#0a1119');
        }
        ctx.fillStyle = ground; ctx.fillRect(0, 0, size, size);
        // Continents (gas worlds get long bands instead).
        for (let i = 0; i < (gas ? 16 : 30); i++) {
            const x = 24 + rand() * (size - 48), y = 24 + rand() * (size - 48);
            if (Math.hypot(x - R, y - R) > R - 18) continue;
            const rx = gas ? 46 + rand() * 120 : 14 + rand() * 62;
            const ry = gas ? 6 + rand() * 16 : 10 + rand() * 44;
            ctx.globalAlpha = gas ? .22 + rand() * .2 : .3 + rand() * .4;
            ctx.fillStyle = gas ? (rand() > .5 ? '#f6e2b8' : '#7b5d78')
                : ice ? (rand() > .45 ? '#eaf4f4' : '#96b3c1')
                    : ocean ? (rand() > .42 ? '#78ab74' : '#cbb083')
                        : (rand() > .48 ? '#b98f63' : '#4b4e58');
            ctx.beginPath(); ctx.ellipse(x, y, rx, ry, (rand() - .5) * 1.4, 0, Math.PI * 2); ctx.fill();
        }
        // The poles.
        ctx.globalAlpha = .5;
        ctx.fillStyle = '#eaf6ff';
        ctx.beginPath(); ctx.ellipse(R, R * .1, R * .78, R * .16, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(R, size - R * .1, R * .82, R * .18, 0, 0, Math.PI * 2); ctx.fill();
        // Weather.
        for (let i = 0; i < 26; i++) {
            const y = 20 + rand() * (size - 40);
            ctx.globalAlpha = .05 + rand() * .12;
            ctx.strokeStyle = '#e8f7ff'; ctx.lineWidth = 1 + rand() * 4;
            ctx.beginPath();
            ctx.moveTo(0, y); ctx.bezierCurveTo(R * .7, y - 14, R * 1.4, y + 16, size, y - 2); ctx.stroke();
        }
        // Lit from the top-left: a planet reads as a body, not as a sticker.
        ctx.globalAlpha = 1;
        const light = ctx.createLinearGradient(0, 0, size, size);
        light.addColorStop(0, 'rgba(255,247,230,.22)');
        light.addColorStop(.5, 'rgba(255,255,255,0)');
        light.addColorStop(1, 'rgba(2,6,12,.55)');
        ctx.fillStyle = light; ctx.fillRect(0, 0, size, size);
        // The dossier of the world goes on the poles, over the shading.
        this.drawPlanetPoles(ctx, size, world);
        // The rim of the piece.
        ctx.globalAlpha = .55; ctx.strokeStyle = 'rgba(226,244,255,.75)'; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(R, R, R - 5, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
        tex.update(false);
        return tex;
    },

    planetCloudTexture(view, name) {
        const size = 512, R = size / 2;
        let seed = 7;
        for (let i = 0; i < name.length; i++) seed = (seed * 53 + name.charCodeAt(i)) >>> 0;
        const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
        const tex = new BABYLON.DynamicTexture('fs-planet-clouds-' + name, { width: size, height: size }, view.scene, true);
        tex.hasAlpha = true;
        const ctx = /** @type {any} */ (tex.getContext());
        ctx.clearRect(0, 0, size, size);
        ctx.save();
        ctx.beginPath(); ctx.arc(R, R, R - 3, 0, Math.PI * 2); ctx.clip();
        for (let i = 0; i < 22; i++) {
            const y = 40 + rand() * (size - 80), h = 10 + rand() * 26;
            ctx.globalAlpha = .06 + rand() * .13;
            ctx.fillStyle = '#f2fbff';
            ctx.beginPath();
            ctx.ellipse(rand() * size, y, 60 + rand() * 130, h, (rand() - .5) * .5, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
        tex.update(false);
        return tex;
    },

    planetMaterial(view, name, world) {
        if (view.planetMaterials.has(name)) return view.planetMaterials.get(name);
        const surface = new BABYLON.StandardMaterial('fs-planet-surface-' + name, view.scene);
        surface.diffuseTexture = this.planetTexture(view, name, world);
        // The disc samples the texture vertically mirrored — flip it back, so the
        // poles print on the caps and the icons stand upright.
        const disc = /** @type {any} */ (surface.diffuseTexture);
        disc.vScale = -1;
        disc.vOffset = 1;
        surface.specularColor = new BABYLON.Color3(.16, .18, .22);
        surface.specularPower = 48;
        surface.backFaceCulling = false;
        const clouds = new BABYLON.StandardMaterial('fs-planet-cloud-mat-' + name, view.scene);
        const cloudTex = this.planetCloudTexture(view, name);
        clouds.diffuseTexture = cloudTex; clouds.opacityTexture = cloudTex;
        clouds.useAlphaFromDiffuseTexture = true; clouds.alpha = .8;
        clouds.backFaceCulling = false; clouds.disableLighting = true;
        clouds.specularColor = BABYLON.Color3.Black();
        const rim = new BABYLON.StandardMaterial('fs-planet-rim-' + name, view.scene);
        rim.diffuseColor = new BABYLON.Color3(.10, .13, .17);
        rim.emissiveColor = BABYLON.Color3.FromHexString(this.worldColor(name)).scale(.22);
        rim.specularColor = new BABYLON.Color3(.28, .30, .34);
        const glow = new BABYLON.StandardMaterial('fs-planet-glow-' + name, view.scene);
        glow.diffuseColor = BABYLON.Color3.FromHexString(this.worldColor(name));
        glow.emissiveColor = BABYLON.Color3.FromHexString(this.worldColor(name)).scale(.55);
        glow.alpha = .5; glow.disableLighting = true; glow.backFaceCulling = false;
        const mats = { surface, clouds, rim, glow };
        view.planetMaterials.set(name, mats);
        return mats;
    },

    // The centre of the round face of a world and the height the pieces stand on.
    discAt(app, sys, pos, metrics) {
        const p = this.areaPos(app, sys, pos, metrics);
        const z = p.y + this.PLANET_SHIFT;
        const base = app.location.terrain.heightAt(p.x, z) + 6.5;
        return { x: p.x, y: base + this.PLANET_H + .12, z, base };
    },

    updatePlanets(app, view, state) {
        const active = new Set(), ground = (x, y) => app.location.terrain.heightAt(x, y);
        for (const sys of state.systems) for (const area of sys.areas) {
            if (!area.world) continue;
            const key = sys.id + ':' + area.pos, name = area.world.name;
            active.add(key);
            let planet = view.planets.get(key);
            if (!planet) {
                const mats = this.planetMaterial(view, name, area.world);
                const radius = this.PLANET_D / 2;
                // The body of the piece: a thin cylinder under the face.
                const body = BABYLON.MeshBuilder.CreateCylinder('fs-world-body-' + key,
                    { diameter: this.PLANET_D, height: this.PLANET_H, tessellation: 64 }, view.scene);
                body.material = mats.rim; body.isPickable = false;
                World3D.addObject(app.location.view, body, 'prop', { castShadow: true, ink: false, outline: false });
                // The face: the planet itself, lying flat and facing up.
                const face = BABYLON.MeshBuilder.CreateDisc('fs-world-' + key,
                    { radius, tessellation: 64 }, view.scene);
                face.rotation.x = Math.PI / 2;
                face.material = mats.surface; face.isPickable = true;
                World3D.addObject(app.location.view, face, 'prop', { castShadow: false, ink: false, outline: false });
                // The weather drifts above the face without moving the ground.
                const clouds = BABYLON.MeshBuilder.CreateDisc('fs-world-clouds-' + key,
                    { radius: radius - 1, tessellation: 64 }, view.scene);
                clouds.rotation.x = Math.PI / 2;
                clouds.material = mats.clouds; clouds.isPickable = false;
                World3D.addObject(app.location.view, clouds, 'prop', { castShadow: false, ink: false, outline: false });
                // A soft halo marks the edge of the world at game zoom.
                const glow = BABYLON.MeshBuilder.CreateTorus('fs-world-halo-' + key,
                    { diameter: this.PLANET_D + 5, thickness: 1.6, tessellation: 64 }, view.scene);
                glow.material = mats.glow; glow.isPickable = false;
                World3D.addObject(app.location.view, glow, 'prop', { castShadow: false, ink: false, outline: false });
                planet = { mesh: face, clouds, atmosphere: glow, rim: body };
                view.planets.set(key, planet);
            }
            const disc = this.discAt(app, sys, area.pos, view.metrics);
            const cx = disc.x, cz = disc.z, base = disc.y - this.PLANET_H - .12;
            planet.rim.position.set(cx, base + this.PLANET_H / 2, cz);
            planet.mesh.position.set(cx, base + this.PLANET_H + .12, cz);
            planet.clouds.position.set(cx, base + this.PLANET_H + .34, cz);
            planet.atmosphere.position.set(cx, base + this.PLANET_H + .2, cz);
            planet.mesh.metadata = Object.assign({}, planet.mesh.metadata, { fs: 'area', system: sys.id, pos: area.pos, world: name });
            planet.mesh.isPickable = true;
            for (const layer of [planet.rim, planet.clouds, planet.atmosphere]) layer.metadata = planet.mesh.metadata;
        }
        for (const [key, planet] of view.planets) if (!active.has(key)) {
            for (const layer of [planet.mesh, planet.clouds, planet.atmosphere, planet.rim]) if (layer) layer.setEnabled(false);
        }
        for (const key of active) {
            const p = view.planets.get(key);
            for (const layer of [p.mesh, p.clouds, p.atmosphere, p.rim]) if (layer) layer.setEnabled(true);
        }
    },

    // Where a piece stands on a world: the ring of minimap places keeps the
    // structure at the far edge and the troops in front of it, inside the circle.
    discSpread(count, index, hasStructure) {
        const r = this.PLANET_D * 0.31;
        const step = Math.PI * 2 / Math.max(1, count);
        // Keep the half-step stagger on worlds with a structure — a legacy of
        // structures standing on the face; harmless, and avoids moving every
        // miniature for no reason.
        const start = -Math.PI / 2 + (hasStructure ? step / 2 : 0);
        const a = start + index * step;
        return { x: Math.cos(a) * r, y: Math.sin(a) * r };
    },


    // Empty, tactile slots for the live board-composition phase.
    updateSetupSlots(app, view, state) {
        const setup = state.phase === 'setup' ? state.setup : null;
        const active = setup && setup.myTurn;
        const occupied = new Set(state.systems.map(s => s.row + ':' + s.col));
        const legal = new Set((setup && setup.legalCells || []).map(c => c.row + ':' + c.col));
        if (setup) {
            for (const cell of setup.legalCells || []) {
                const key = cell.row + ':' + cell.col;
                if (occupied.has(key)) continue;
                let mesh = view.setupSlots.get(key);
                if (!mesh) {
                    const p = this.tilePos(app, cell, view.metrics);
                    mesh = BABYLON.MeshBuilder.CreateBox('fs-slot-' + key, {
                        width: this.TILE - 12, depth: this.TILE - 12, height: 2,
                    }, view.scene);
                    mesh.position.set(p.x, app.location.terrain.heightAt(p.x, p.y) + 1, p.y);
                    World3D.addObject(app.location.view, mesh, 'prop', { castShadow: false, outline: false });
                    mesh.metadata = { fs: 'setupCell', row: cell.row, col: cell.col };
                    view.setupSlots.set(key, mesh);
                }
                mesh.setEnabled(true);
                mesh.isPickable = !!active && legal.has(key);
                mesh.material = view.material(legal.has(key) ? 'setupLegal' : 'setupIdle', legal.has(key) ? '#286b86' : '#111d2a',
                    { alpha: legal.has(key) ? 0.72 : 0.42, emissive: legal.has(key) });
            }
        }
        for (const [key, mesh] of view.setupSlots) {
            if (!setup || occupied.has(key) || !legal.has(key)) mesh.setEnabled(false);
        }
    },

    // The candidate is local to this client. It uses the same artwork and 3D
    // worlds as a committed system, but does not intercept the underlying slot.
    showSetupPreview(app, view, state, tile, cell, rotation) {
        this.clearSetupPreview(view);
        if (!tile || !cell) return;
        const sys = FS_RULES.createSystemFromTile({ systems: [] }, tile, state.seat, cell.row, cell.col, rotation);
        sys.id = 'fs-preview';
        const ghost = Object.assign({}, view, { preview: true, tiles: new Map(), planets: new Map() });
        const rec = this.ensureTile(app, ghost, sys);
        rec.mat.alpha = .82;
        this.drawTile(ghost, sys, rec, state);
        this.updatePlanets(app, ghost, { systems: [sys] });
        for (const mesh of [rec.base, rec.top, ...rec.decorations]) mesh.isPickable = false;
        for (const planet of ghost.planets.values()) for (const mesh of [planet.mesh, planet.clouds, planet.atmosphere, planet.rim]) mesh.isPickable = false;
        view.setupPreview = { ghost, rec, sys };
    },

    clearSetupPreview(view) {
        const preview = view && view.setupPreview;
        if (!preview) return;
        const locationView = view.app.location.view;
        for (const mesh of [preview.rec.base, preview.rec.top, ...preview.rec.decorations]) World3D.removeObject(locationView, mesh);
        for (const planet of preview.ghost.planets.values()) for (const mesh of [planet.mesh, planet.clouds, planet.atmosphere, planet.rim]) if (mesh) World3D.removeObject(locationView, mesh);
        preview.rec.mat.dispose(false, false);
        preview.rec.tex.dispose();
        view.setupPreview = null;
    },

    // --- the markers --------------------------------------------------------

    clearMarkers(view) {
        // Where every piece stands, in world coordinates: the client draws the
        // selection rings and the arrow of the march from here.
        view.unitPositions = new Map();
        for (const m of view.markers) {
            // removeObject disposes the mesh with its children.
            World3D.removeObject(view.app.location.view, m.mesh);
        }
        view.markers = [];
        view.animated = [];
    },

    addAnimated(view, mesh, axis, speed) {
        view.animated.push({ mesh, axis: axis || 'y', speed: speed || .5 });
        return mesh;
    },

    addMarker(view, mesh, kind) {
        // HighlightLayer's stencil mask floods these overlapping tabletop meshes.
        // Keep the ink edges but don't obscure the miniatures with silhouette masks.
        World3D.addObject(view.app.location.view, mesh, kind || 'actor', { outline: false });
        view.markers.push({ mesh });
        return mesh;
    },

    // Lighten (amt > 0) or darken (amt < 0) a #rrggbb color.
    shade(hex, amt) {
        const n = parseInt(String(hex || '').replace('#', ''), 16);
        if (!Number.isFinite(n)) return '#888888';
        const f = v => Math.max(0, Math.min(255, Math.round(v + amt * 2.55)));
        const r = f((n >> 16) & 255), g = f((n >> 8) & 255), b = f(n & 255);
        return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
    },

    // The palette of one army: primary + two secondary colors painted onto
    // different parts of every model of that army.
    paletteKey(palette) {
        if (!palette) return '';
        return [palette.primary, palette.secondary1, palette.secondary2].map(c => String(c || '').toLowerCase()).join('|');
    },

    // A reusable, subtle armor pattern keeps UV-mapped OBJ miniatures from reading as flat solid-color plastic.
    factionModelMaterial(view, faction, color) {
        const base = color || this.factionColor(faction);
        const cacheKey = faction + ':' + base.toLowerCase();
        if (view.modelMaterials.has(cacheKey)) return view.modelMaterials.get(cacheKey);
        const texture = new BABYLON.DynamicTexture('fs-armor-map-' + cacheKey, { width: 256, height: 256 }, view.scene, true);
        const ctx = /** @type {any} */ (texture.getContext());
        ctx.fillStyle = base; ctx.fillRect(0, 0, 256, 256);
        const gradient = ctx.createLinearGradient(0, 0, 256, 256);
        gradient.addColorStop(0, 'rgba(255,255,255,.19)'); gradient.addColorStop(.52, 'rgba(18,25,32,.06)');
        gradient.addColorStop(1, 'rgba(2,5,9,.45)');
        ctx.fillStyle = gradient; ctx.fillRect(0, 0, 256, 256);
        // Repeating low-contrast plate seams, recessed panels and fasteners read as painted armor at game zoom.
        for (let y = 8; y < 256; y += 48) for (let x = 8; x < 256; x += 64) {
            ctx.fillStyle = 'rgba(5,9,13,.17)'; ctx.fillRect(x + 2, y + 2, 54, 34);
            ctx.strokeStyle = 'rgba(238,224,190,.20)'; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(x, y + 1); ctx.lineTo(x + 51, y + 1); ctx.lineTo(x + 57, y + 7); ctx.stroke();
            ctx.strokeStyle = 'rgba(2,5,8,.56)';
            ctx.beginPath(); ctx.moveTo(x + 2, y + 36); ctx.lineTo(x + 55, y + 36); ctx.stroke();
            ctx.fillStyle = 'rgba(225,220,199,.38)';
            for (const [dx, dy] of [[5, 6], [51, 7], [5, 30], [51, 30]]) {
                ctx.beginPath(); ctx.arc(x + dx, y + dy, 1.15, 0, Math.PI * 2); ctx.fill();
            }
        }
        // A restrained hazard stripe at the UV corner acts as a tiny faction-neutral insignia.
        ctx.save(); ctx.globalAlpha = .22; ctx.strokeStyle = '#f0d89b'; ctx.lineWidth = 3;
        for (let x = -28; x < 72; x += 12) { ctx.beginPath(); ctx.moveTo(x, 256); ctx.lineTo(x + 36, 220); ctx.stroke(); }
        ctx.restore();
        texture.update(false);
        const material = new BABYLON.StandardMaterial('fs-mini-' + cacheKey, view.scene);
        material.diffuseTexture = texture;
        material.diffuseColor = new BABYLON.Color3(1, 1, 1);
        material.specularColor = new BABYLON.Color3(.34, .31, .25);
        material.specularPower = 36;
        view.modelMaterials.set(cacheKey, material);
        return material;
    },

    // The repository contains faction OBJ miniatures. Babylon's bundled loader imports them
    // directly; normalize their arbitrary source scale once, cache them, then clone for units.
    // The model of every unit, as the faction's own smoly file lists them
    // (Warhammer/<faction>/Начальные силы.txt): unit id -> [folder, obj file].
    FACTION_UNIT_MODELS: {
        "адептус-механикус": {
            "скитарии": ["Warhammer/Адептус механикус/", "D431C9519F34BBE811FFCD0D2609BDA9735C741D_T0.obj"],
            "крепкие-крейсеры": ["Warhammer/Адептус механикус/", "3BE5D3DB99F0A3C584A3DA58B36C2CC406D931CE_AM_0.obj"],
            "катафроны": ["Warhammer/Адептус механикус/", "AFC42C2393DAD418C7B2B601224BA90079D0985A_AMT1.obj"],
            "онагры": ["Warhammer/Адептус механикус/", "C304DE083789B61E2FB865F744E148F5DF44B84E_AMT2.obj"],
            "боевые-ковчеги": ["Warhammer/Адептус механикус/", "A96F77829B8CAC97D2BCE819B2D06FBB86A9687B_AM_2.obj"],
            "тяжелые-титаны": ["Warhammer/Адептус механикус/", "994C1CD1DB5EA6A1E1FB1902141B7FA8F4494174_warlord titan MARS model.obj"],
        },
        "имперская-гвардия": {
            "гвардейцы": ["Warhammer/Имперская гвардия/", "httpcloud3steamusercontentcomugc26496097488227680129294A782921CE77B7507EBA8D7ED2A3006C7B65.obj"],
            "крейсеры": ["Warhammer/Имперская гвардия/", "ChaosValkyrie04.obj"],
            "огрины": ["Warhammer/Имперская гвардия/", "httpcloud3steamusercontentcomugc26496097488230945447A6EE60C64DC360A66F170C11DA907C59DE3A1D.obj"],
            "танки-леман-русс": ["Warhammer/Имперская гвардия/", "httpcloud3steamusercontentcomugc2649609748823623469F753CAF7D6C1BF58A61A877D82D25C238B8E10F.obj"],
            "линкоры": ["Warhammer/Имперская гвардия/", "httpswwwdropboxcomsid3nfm1xvj9s2q3Imperial20Battleshipobjdl1.obj"],
            "титаны": ["Warhammer/Имперская гвардия/", "httppastebincomrawphpi5WJEx919.obj"],
        },
        "инквизиция": {
            "инквизиторские-штурмовики": ["Warhammer/Инквизиция/", "95B7BC4021996924208CB2160EF132E56E03B730_IT0.obj"],
            "инквизиторские-крейсеры": ["Warhammer/Инквизиция/", "FFDD6945972A41BFABAADA65DA589D2F46C809DB_I_0.obj"],
            "караул-смерти": ["Warhammer/Инквизиция/", "2D71889AA08FB8BEDA139B52DFFF7D6A717C4146_HellblasterAssault.obj"],
            "вилькирии": ["Warhammer/Инквизиция/", "9D8EE79386E31D5DD2575149D33709418ADB183F_IT2.obj"],
            "черные-корабли": ["Warhammer/Инквизиция/", "6F3B44EADB288257CC4D6BAF8580B791A45A6DF6_I_2.obj"],
            "рыцари-немезиды": ["Warhammer/Инквизиция/", "957DA5F5A445692801FA5D6C27851B74533A6215_T3.obj"],
        },
        "космодесант": {
            "скауты": ["Warhammer/Космодесантники/", "SpaceScout02.obj"],
            "ударные-крейсера": ["Warhammer/Космодесантники/", "0E405721B5FD19190188F6C4C9EDBE696489835F_stormtalon_bolter.obj"],
            "космодесант": ["Warhammer/Космодесантники/", "SpaceMarine05.obj"],
            "ленд-рейдеры": ["Warhammer/Космодесантники/", "SpaceLandRaider01.obj"],
            "боевые-баржи": ["Warhammer/Космодесантники/", "httpsdrivegooglecomucexportdownloadid0BHqqb4mcF7STUJuUXZRSF8yNWc.obj"],
            "титаны-класса-варлорд": ["Warhammer/Космодесантники/", "1CC0F9F686C4C83D69BC2EB4D827FFB228BA901F_httpsdldropboxusercontentcomu14731293TTS40KKnights40kKnightErrantobj.obj"],
        },
        "некроны": {
            "воины": ["Warhammer/Некроны/", "httpsmymixtapemoejhrctrobj.obj"],
            "крейсеры-жнец": ["Warhammer/Некроны/", "4F00FB00519DBF071C1B86E18162B85CAA4622AD_necron ships long.obj"],
            "бессмертные": ["Warhammer/Некроны/", "httpcloud3steamusercontentcomugc848475996211039793137E820AA2286700A764245F86B3562BBD25ED7.obj"],
            "монолиты": ["Warhammer/Некроны/", "httpsmymixtapemoejfekczobj.obj"],
            "корабли-гробницы": ["Warhammer/Некроны/", "6BF96780487A503FF692A757FFC42B92C011D75A_necron ship big2.obj"],
            "ктан": ["Warhammer/Некроны/", "httpsmymixtapemoeibzatkobj.obj"],
        },
        "орки": {
            "бойзы": ["Warhammer/Орки/", "OrkBoyz02.obj"],
            "атакующие-корабли-класса-натиск": ["Warhammer/Орки/", "571F92A507921521517B943BB75A75BEBDA155A2_Dakkajet Wazbomm.obj"],
            "нобзы": ["Warhammer/Орки/", "OrkNobz06.obj"],
            "батлвагоны": ["Warhammer/Орки/", "OrkBattlewagon02.obj"],
            "килл-круизеры": ["Warhammer/Орки/", "OrkLanda.obj"],
            "гарганты": ["Warhammer/Орки/", "68658BD82767739E6BC307FACCADE8B4F962E9E2_httpsdldropboxusercontentcomu98218671OrksEpicGreatGargantobj.obj"],
        },
        "сестры-битвы": {
            "сестры-ренетентии": ["Warhammer/Сестры битвы/", "86471B86C1F5BA8CA41811BDB47FFAF83D277BBC_SoBT0.obj"],
            "легкие-крейсеры-непокорный": ["Warhammer/Сестры битвы/", "28E7C22A9EE990CB7DC6C1CAC67E5B2AED74AEF5_AS_0.obj"],
            "сестры-битвы": ["Warhammer/Сестры битвы/", "675403A6C99587F1EAC8A3726A43B440949B0AD5_BattleSister_model.obj"],
            "танки-экзорцист": ["Warhammer/Сестры битвы/", "DCAB1D653F0E028AEF368AF08D11CAA6126A6529_Exorcist_model.obj"],
            "гранд-крейсеры-месть": ["Warhammer/Сестры битвы/", "46F0CC7C10546B8C268635ED698A7BE4CF4560BC_AS_2.obj"],
            "живая-святая": ["Warhammer/Сестры битвы/", "B4A4AC190E83DB41970D6FF91951FDC85A68C0BD_Celestine8.obj"],
        },
        "империя-тау": {
            "воины-огня": ["Warhammer/Тау/", "httppastebincomrawphpi9HhMFJgb.obj"],
            "крейсеры-защитник": ["Warhammer/Тау/", "httpsmymixtapemoeqciqzoobj.obj"],
            "бронекостюмы": ["Warhammer/Тау/", "httpspasteeerj5tuE.obj"],
            "танки-рыба-молот": ["Warhammer/Тау/", "httpsmymixtapemoecxnotmobj.obj"],
            "линкоры-хранитель": ["Warhammer/Тау/", "httpsmymixtapemoekbloohobj.obj"],
            "бронекостюмы-превосходство": ["Warhammer/Тау/", "httpsmymixtapemoekfulghobj.obj"],
        },
        "тираниды": {
            "гаунты": ["Warhammer/Тираниды/", "httpcloud3steamusercontentcomugc84847428632403524DED796262D17635176C51507FDA4E5DB04604335.obj"],
            "пожиратели": ["Warhammer/Тираниды/", "httpswwwdropboxcomsm74w1tnhkb63zobVoid20Fiend20Cruiserobjdl1.obj"],
            "воины": ["Warhammer/Тираниды/", "httpcloud3steamusercontentcomugc8484742863241109907A85B1915B21411B8729014BADDF7EF4050349D.obj"],
            "карнифексы": ["Warhammer/Тираниды/", "httpcloud3steamusercontentcomugc84847599620931370FB6427684D91D871693916BDED5236E7A06A7743.obj"],
            "корабли-ульи": ["Warhammer/Тираниды/", "httpswwwdropboxcomsi1sn8luql1hudt7Hive20Shipobjdl1 (1).obj"],
            "био-титаны": ["Warhammer/Тираниды/", "httpcloud3steamusercontentcomugc848475996209410615F019F4B182734CA046B21935BDBA5B1D411B025.obj"],
        },
        "космодесант-хаоса": {
            "культисты": ["Warhammer/Хаос/", "ChaosCultist.obj"],
            "эсминцы-класса-иконоборец": ["Warhammer/Хаос/", "httpsdrivegooglecomucexportdownloadid0BHqqb4mcF7SekxxQWpZWVZ6NUk.obj"],
            "космодесант-хаоса": ["Warhammer/Хаос/", "ChaosMarine.obj"],
            "хелбруты": ["Warhammer/Хаос/", "ChaosHelbrute.obj"],
            "отвратительные-тяжелые-крейсеры": ["Warhammer/Хаос/", "httpsdrivegooglecomucexportdownloadid0BHqqb4mcF7SazZ1QzVUcTM5V3c.obj"],
            "титаны-хаоса-класса-налетчик": ["Warhammer/Хаос/", "ChaosTitan.obj"],
        },
        "эльдары": {
            "аспектные-воины": ["Warhammer/Эльдары/", "Аспектные воины.obj"],
            "призрачные-стражи": ["Warhammer/Эльдары/", "EldarWraithguard01.obj"],
            "гравитанки-сокол": ["Warhammer/Эльдары/", "EldarFalcon02.obj"],
            "исследователи-пустоты": ["Warhammer/Эльдары/", "EldarStalker02.obj"],
            "боевые-титаны-класса-варлок": ["Warhammer/Эльдары/", "EldarTitan.obj"],
        },
    },

    // The tabletop models of the structures, as the author put them into
    // Warhammer/ (Бастион.obj, Город.obj, фабрика.obj).
    STRUCTURE_MODELS: {
        bastion: 'Бастион.obj',
        city: 'Город.obj',
        factory: 'фабрика.obj',
    },

    // The loaded OBJ of a structure type (geometry only — the colour of the
    // owner is put on the clones). Null until it arrives; then a model.
    structureModel(view, type) {
        const file = this.STRUCTURE_MODELS[type];
        if (!file) return null;
        if (!view.structureModelCache) view.structureModelCache = new Map();
        if (!view.structureModelLoads) view.structureModelLoads = new Map();
        const key = type;
        if (view.structureModelCache.has(key)) return view.structureModelCache.get(key);
        if (view.structureModelLoads.has(key)) return null;
        const loader = typeof BABYLON !== 'undefined' && BABYLON.SceneLoader;
        if (!loader || !loader.ImportMeshAsync) { view.structureModelCache.set(key, null); return null; }
        const imported = typeof BABYLON.ImportMeshAsync === 'function'
            ? BABYLON.ImportMeshAsync(file, view.scene, { rootUrl: 'Warhammer/', pluginOptions: { obj: { skipMaterials: true } } })
            : loader.ImportMeshAsync('', 'Warhammer/', file, view.scene);
        if (!imported || typeof imported.then !== 'function') { view.structureModelCache.set(key, null); return null; }
        const promise = imported.then(result => {
            const root = new BABYLON.TransformNode('fs-structure-model-' + type, view.scene);
            const parts = (result.meshes || []).filter(m => m && m.getTotalVertices && m.getTotalVertices() > 0);
            for (const mesh of parts) { mesh.parent = root; mesh.isPickable = false; mesh.computeWorldMatrix(true); }
            let min = new BABYLON.Vector3(Infinity, Infinity, Infinity);
            let max = new BABYLON.Vector3(-Infinity, -Infinity, -Infinity);
            for (const mesh of parts) {
                const box = mesh.getBoundingInfo().boundingBox;
                min = BABYLON.Vector3.Minimize(min, box.minimumWorld);
                max = BABYLON.Vector3.Maximize(max, box.maximumWorld);
            }
            const size = max.subtract(min), largest = Math.max(size.x, size.y, size.z);
            if (!parts.length || !Number.isFinite(largest) || largest <= 0) throw new Error('OBJ не содержит видимой геометрии');
            // The structure stands on the planet's rim: it is normalised to a
            // landmark size (about ten times the raw units the models ship in)
            // so it reads on the table.
            const scale = this.STRUCTURE_SIZE / largest;
            const offX = -(min.x + max.x) * .5 * scale, offY = -min.y * scale, offZ = -(min.z + max.z) * .5 * scale;
            root.scaling.setAll(scale);
            root.position.set(offX, offY, offZ);
            root.setEnabled(false);
            const model = { root, parts, scale, offset: { x: offX, y: offY, z: offZ } };
            view.structureModelCache.set(key, model);
            view.structureModelLoads.delete(key);
            if (view.onModelReady) view.onModelReady();
            return model;
        }).catch(error => {
            console.warn('FSView: не удалось загрузить модель строения ' + type + ': ' + ((error && error.message) || error));
            view.structureModelCache.set(key, null);
            view.structureModelLoads.delete(key);
            return null;
        });
        view.structureModelLoads.set(key, promise);
        return null;
    },

    factionModel(view, faction, unitType, unitId, palette) {
        // The model of the unit itself, per the faction's smoly file; the old
        // per-type pair stays as the fallback. The army palette changes the
        // paint, so it is part of the cache key.
        const byUnit = this.FACTION_UNIT_MODELS[faction] && unitId
            ? this.FACTION_UNIT_MODELS[faction][unitId] : null;
        const pKey = this.paletteKey(palette);
        const specs = {
            'космодесант': { ground: ['Warhammer/Космодесантники/', 'SpaceMarine05.obj'], ship: ['Warhammer/Космодесантники/', '0E405721B5FD19190188F6C4C9EDBE696489835F_stormtalon_bolter.obj'] },
            'орки': { ground: ['Warhammer/Орки/', 'OrkBoyz02.obj'], ship: ['Warhammer/Орки/', 'OrkLanda.obj'] },
            'космодесант-хаоса': { ground: ['Warhammer/Хаос/', 'ChaosMarine.obj'] },
            'эльдары': { ground: ['Warhammer/Эльдары/', 'EldarWraithguard01.obj'], ship: ['Warhammer/Эльдары/', 'EldarFalcon02.obj'] },
            'темные-эльдары': { ground: ['Warhammer/Тёмные эльдары/', '06B4FC4DB30FB73D7ED273981FB315D4BCF14CA8_Wych3kabal1.obj'], ship: ['Warhammer/Тёмные эльдары/', '8D52815467AB422CB8E65D8EB87FA0C04340CEE9_DE_2.obj'] },
            'сестры-битвы': { ground: ['Warhammer/Сестры битвы/', '675403A6C99587F1EAC8A3726A43B440949B0AD5_BattleSister_model.obj'] },
            'адептус-механикус': { ground: ['Warhammer/Адептус механикус/', '3BE5D3DB99F0A3C584A3DA58B36C2CC406D931CE_AM_0.obj'] },
            'инквизиция': { ground: ['Warhammer/Инквизиция/', '2D71889AA08FB8BEDA139B52DFFF7D6A717C4146_HellblasterAssault.obj'] },
            'имперская-гвардия': { ground: ['Warhammer/Имперская гвардия/', 'httpcloud3steamusercontentcomugc26496097488230945447A6EE60C64DC360A66F170C11DA907C59DE3A1D.obj'], ship: ['Warhammer/Имперская гвардия/', 'httpswwwdropboxcomsid3nfm1xvj9s2q3Imperial20Battleshipobjdl1.obj'] },
            'некроны': { ground: ['Warhammer/Некроны/', 'httpsmymixtapemoeibzatkobj.obj'], ship: ['Warhammer/Некроны/', '4F00FB00519DBF071C1B86E18162B85CAA4622AD_necron ships long.obj'] },
            'тираниды': { ground: ['Warhammer/Тираниды/', 'httpcloud3steamusercontentcomugc84847428632403524DED796262D17635176C51507FDA4E5DB04604335.obj'], ship: ['Warhammer/Тираниды/', 'httpswwwdropboxcomsm74w1tnhkb63zobVoid20Fiend20Cruiserobjdl1.obj'] },
            'империя-тау': { ground: ['Warhammer/Тау/', 'httppastebincomrawphpi9HhMFJgb.obj'], ship: ['Warhammer/Тау/', 'httpsmymixtapemoecxnotmobj.obj'] },
        };
        const key = faction + ':' + unitType + ':' + (unitId || '') + ':' + pKey;
        if (view.modelCache.has(key)) return view.modelCache.get(key);
        if (view.modelLoads.has(key)) return null;
        const spec = byUnit || (specs[faction] && specs[faction][unitType]);
        const loader = typeof BABYLON !== 'undefined' && /** @type {any} */ (BABYLON.SceneLoader);
        if (!spec || !loader || !loader.ImportMeshAsync) { view.modelCache.set(key, null); return null; }
        // All imported meshes receive our faction material, so OBJ material files are
        // unnecessary (and several of the source models reference missing .mtl files).
        const imported = typeof BABYLON.ImportMeshAsync === 'function'
            ? BABYLON.ImportMeshAsync(spec[1], view.scene, { rootUrl: spec[0], pluginOptions: { obj: { skipMaterials: true } } })
            : loader.ImportMeshAsync('', spec[0], spec[1], view.scene);
        if (!imported || typeof imported.then !== 'function') { view.modelCache.set(key, null); return null; }
        const promise = imported.then(result => {
            const root = new BABYLON.TransformNode('fs-model-' + faction, view.scene);
            const parts = (result.meshes || []).filter(m => m && m.getTotalVertices && m.getTotalVertices() > 0);
            // The army palette: primary on the big body, secondary1 on the high
            // parts (helm, backpack, top of the hull), secondary2 on the rest.
            const pal = palette || {};
            const materials = [
                this.factionModelMaterial(view, faction, pal.primary),
                this.factionModelMaterial(view, faction, pal.secondary1 || this.shade(pal.primary || this.factionColor(faction), 45)),
                this.factionModelMaterial(view, faction, pal.secondary2 || this.shade(pal.primary || this.factionColor(faction), -35)),
            ];
            for (const mesh of parts) {
                mesh.parent = root;
                mesh.isPickable = false;
                mesh.computeWorldMatrix(true);
            }
            const partMats = parts.map(mesh => {
                const box = mesh.getBoundingInfo().boundingBox;
                const s = box.maximumWorld.subtract(box.minimumWorld);
                return { mesh, vol: s.x * s.y * s.z, cy: (box.minimumWorld.y + box.maximumWorld.y) * .5 };
            });
            const maxVol = Math.max(0, ...partMats.map(p => p.vol));
            const rest = partMats.filter(p => p.vol < maxVol * .25).sort((a, b) => b.cy - a.cy);
            const topCount = Math.max(1, Math.ceil(rest.length * .5));
            const topSet = new Set(rest.slice(0, topCount).map(p => p.mesh));
            for (const p of partMats) {
                p.mesh.material = p.vol >= maxVol * .25 ? materials[0] : (topSet.has(p.mesh) ? materials[1] : materials[2]);
            }
            let min = new BABYLON.Vector3(Infinity, Infinity, Infinity);
            let max = new BABYLON.Vector3(-Infinity, -Infinity, -Infinity);
            for (const mesh of parts) {
                const box = mesh.getBoundingInfo().boundingBox;
                min = BABYLON.Vector3.Minimize(min, box.minimumWorld);
                max = BABYLON.Vector3.Maximize(max, box.maximumWorld);
            }
            const size = max.subtract(min), largest = Math.max(size.x, size.y, size.z);
            if (!parts.length || !Number.isFinite(largest) || largest <= 0) throw new Error('OBJ не содержит видимой геометрии');
            const scale = (unitType === 'ship' ? 36 : 27) / largest;
            root.scaling.setAll(scale);
            root.position.set(-(min.x + max.x) * .5 * scale, -min.y * scale, -(min.z + max.z) * .5 * scale);
            root.setEnabled(false);
            const model = { root, parts, materials, partMats: parts.map(m => materials.indexOf(m.material)) };
            view.modelCache.set(key, model);
            view.modelLoads.delete(key);
            if (view.onModelReady) view.onModelReady();
            return model;
        }).catch(error => {
            console.warn('FSView: не удалось загрузить модель ' + faction + '/' + unitType + ': ' + ((error && error.message) || error));
            view.modelCache.set(key, null);
            view.modelLoads.delete(key);
            return null;
        });
        view.modelLoads.set(key, promise);
        return null;
    },

    addFactionUnit(view, unit, pos, offset, color, unitType, scale, palette) {
        // unit.unit is the type id ('гвардейцы'), unit.id is just the uid —
        // the per-unit model table is keyed by the type id. The owner's army
        // palette decides which color each part of the miniature gets.
        const model = this.factionModel(view, unit.faction, unitType, unit.unit, palette);
        if (!model) return null;
        const k = scale || 1;
        const metadata = { fs: 'unit', unit: unit.id, system: unit.system, pos: unit.area };
        // No extra base disc or rim under the miniature: the model itself has
        // its own stand, and a black circle around it only gets in the way.
        const holder = new BABYLON.TransformNode('fs-unit-model-' + unit.id, view.scene);
        holder.position.set(pos.x + offset.x + model.root.position.x * k, pos.y + model.root.position.y * k, pos.z + offset.y + model.root.position.z * k);
        holder.scaling.copyFrom(model.root.scaling);
        holder.scaling.scaleInPlace(k);
        holder.metadata = { fs: 'unit', unit: unit.id, system: unit.system, pos: unit.area };
        for (let i = 0; i < model.parts.length; i++) {
            const source = model.parts[i];
            const clone = source.clone('fs-unit-part-' + unit.id + '-' + i, holder, false);
            if (!clone) continue;
            clone.material = model.materials[model.partMats[i]] || model.materials[0];
            clone.isPickable = true;
            clone.metadata = { fs: 'unit', unit: unit.id, system: unit.system, pos: unit.area };
            clone.setEnabled(true);
        }
        this.addMarker(view, holder, 'actor');
        return holder;
    },

    // The metrics of the board: where the tiles stand and where the middle is.
    measure(app, view, state) {
        const raw = sys => ({
            x: sys.col * this.TILE,
            y: sys.row * this.TILE,
        });
        const pts = (state.phase === 'setup' && state.setup ? state.systems.concat(state.setup.legalCells || []) : state.systems).map(raw);
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const p of pts) {
            minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x + this.TILE);
            minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y + this.TILE);
        }
        if (!pts.length) { view.metrics = null; return; }
        const originX = app.location.width / 2;
        const originY = app.location.height / 2;
        view.metrics = {
            originX, originY,
            cx: originX + (minX + maxX - this.TILE) / 2,
            cy: originY + (minY + maxY - this.TILE) / 2,
            w: maxX - minX,
            h: maxY - minY,
        };
    },

    // The whole board from the state.
    update(app, view, state) {
        this.measure(app, view, state);
        // The tiles.
        for (const sys of state.systems) {
            const rec = this.ensureTile(app, view, sys);
            const key = sys.areas.map(a => {
                const world = a.world ? a.world.name + a.world.materiel + a.world.capacity + a.world.assets.join('') : '-';
                return world + '@' + this.areaOccupants(state, sys.id, a.pos).join(',');
            }).join('|');
            if (rec.drawn !== key) {
                rec.drawn = key;
                this.drawTile(view, sys, rec, state);
            }
        }
        this.updateSetupSlots(app, view, state);
        this.updatePlanets(app, view, state);
        // The markers.
        this.clearMarkers(view);
        const h = (x, y) => app.location.terrain.heightAt(x, y);
        // The units.
        const byArea = new Map();
        for (const u of state.units) {
            const key = u.system + ':' + u.area;
            if (!byArea.has(key)) byArea.set(key, []);
            byArea.get(key).push(u);
        }
        for (const [key, list] of byArea) {
            const [sysId, pos] = key.split(':');
            const sys = state.systems.find(s => s.id === sysId);
            if (!sys) continue;
            const area = sys.areas.find(a => a.pos === pos);
            const world = !!(area && area.world);
            // A world is a round table-piece: the troops stand on it. In the void
            // they hover over the sector itself.
            const disc = world ? this.discAt(app, sys, pos, view.metrics) : null;
            const hasStructure = world && state.structures.some(st => st.system === sysId && st.area === pos);
            const ground = list.filter(u => { const d = FS_RULES.unitOf(state, u); return !d || d.type !== 'ship'; });
            const onWorld = world ? FSView.ON_WORLD : 1;
            const placed = [];
            list.forEach(u => {
                const owner = state.players.find(p2 => p2.seat === u.seat);
                const color = (owner && owner.color) || this.factionColor(owner ? owner.faction : '');
                const def = FS_RULES.unitOf(state, u);
                const isShip = !!(def && def.type === 'ship');
                const p = this.areaPos(app, sys, pos, view.metrics);
                let base, off;
                if (world && !isShip) {
                    const index = ground.indexOf(u);
                    off = this.discSpread(ground.length, index, hasStructure);
                    base = { x: disc.x, y: disc.y, z: disc.z };
                } else {
                    off = this.spread(list.length, list.indexOf(u));
                    base = { x: p.x, y: h(p.x, p.y) + 4 + this.MARKER_Y, z: p.y };
                }
                if (view.unitPositions) view.unitPositions.set(u.id, { x: base.x + off.x, y: base.y, z: base.z + off.y });
                placed.push({ root: null, x: base.x + off.x, z: base.z + off.y, seat: u.seat, routed: !!u.routed });
                const slot = placed[placed.length - 1];
                if (def && !u.routed && this.addFactionUnit(view, u, base, off, color, def.type, onWorld, owner && owner.palette)) { slot.root = view.markers[view.markers.length - 1].mesh; return; }
                // Until a faction OBJ loads (or for ships), use sculpted silhouettes rather than
                // identical flat counters: ships read as long hulls, ground units as raised pieces.
                const ship = def && def.type === 'ship';
                const unitMeta = { fs: 'unit', unit: u.id, system: sysId, pos };
                const unitMaterial = view.material('unit' + u.seat, color, u.routed ? { alpha: 0.55 } : { emissive: true });
                if (ship) {
                    // Distinct fallback silhouette: a tapered hull, broad swept wings and a lit cockpit.
                    const craft = new BABYLON.TransformNode('fs-u' + u.id, view.scene);
                    slot.root = craft;
                    craft.position.set(base.x + off.x, base.y + 8, base.z + off.y);
                    craft.metadata = unitMeta;
                    const hull = BABYLON.MeshBuilder.CreateCylinder('fs-ship-hull-' + u.id,
                        { height: 30, diameterTop: 2.5, diameterBottom: 8, tessellation: 8 }, view.scene);
                    hull.parent = craft; hull.rotation.z = Math.PI / 2; hull.material = unitMaterial;
                    const wing = BABYLON.MeshBuilder.CreateBox('fs-ship-wing-' + u.id,
                        { width: 13, depth: 23, height: 2 }, view.scene);
                    wing.parent = craft; wing.position.x = -2; wing.material = unitMaterial;
                    const engine = BABYLON.MeshBuilder.CreateBox('fs-ship-engine-' + u.id,
                        { width: 7, depth: 4, height: 3 }, view.scene);
                    engine.parent = craft; engine.position.set(-10, 0, 0);
                    engine.material = view.material('unit-engine-' + u.seat, color, { emissive: true });
                    const cockpit = BABYLON.MeshBuilder.CreateSphere('fs-ship-cockpit-' + u.id,
                        { diameter: 4, segments: 8 }, view.scene);
                    cockpit.parent = craft; cockpit.position.set(4, 2, 0);
                    cockpit.material = view.material('unit-cockpit', '#a9e7ff', { emissive: true });
                    for (const part of [hull, wing, engine, cockpit]) {
                        part.isPickable = true; part.metadata = unitMeta;
                    }
                    if (u.routed) craft.rotation.z = Math.PI / 2;
                    this.addMarker(view, craft, 'actor');
                } else {
                    const mesh = BABYLON.MeshBuilder.CreateCylinder('fs-u' + u.id,
                        { diameterTop: 16, diameterBottom: 24, height: 18, tessellation: 8 }, view.scene);
                    mesh.position.set(base.x + off.x, base.y + 3, base.z + off.y);
                    slot.root = mesh;
                    mesh.material = unitMaterial;
                    if (u.routed) mesh.rotation.z = Math.PI / 2;
                    mesh.isPickable = true; mesh.metadata = unitMeta;
                    this.addMarker(view, mesh, 'actor');
                }
            });
            // During a battle every miniature turns to face the enemy: the front
            // of the model (the gun) is its +Z, so rotation.y = atan2(dx, dz).
            const co = state.combat;
            if (co && co.system === sysId && co.pos === pos) {
                for (const side of ['attacker', 'defender']) {
                    const seat = side === 'attacker' ? co.attacker : co.defender;
                    const foeSeat = side === 'attacker' ? co.defender : co.attacker;
                    const foes = placed.filter(q => q.seat === foeSeat);
                    if (!foes.length) continue;
                    const fx = foes.reduce((a, q) => a + q.x, 0) / foes.length;
                    const fz = foes.reduce((a, q) => a + q.z, 0) / foes.length;
                    for (const q of placed) {
                        if (q.seat !== seat || q.routed || !q.root) continue;
                        q.root.rotation.y = Math.atan2(fx - q.x, fz - q.z);
                    }
                }
            }
        }
        // Structures are small, quiet tabletop miniatures standing in the
        // far-left corner of the tile they are built on — off the planet, never
        // on its face, and without glow: printed-board furniture, not a lamp.
        for (const s of state.structures) {
            const sys = state.systems.find(x => x.id === s.system);
            if (!sys) continue;
            const tp = this.tilePos(app, sys, view.metrics);
            const corner = this.TILE / 2 - 20;   // world px from the tile centre into the far-left corner
            const tileH = h(tp.x, tp.y) + 6.5;   // the flat printed top of the tile
            const sx = tp.x - corner, sz = tp.y - corner;
            const owner = state.players.find(p2 => p2.seat === s.seat);
            const color = (owner && owner.palette && owner.palette.primary) || (owner && owner.color) || this.factionColor(owner ? owner.faction : '');
            const root = new BABYLON.TransformNode('fs-structure-' + s.id, view.scene);
            const structModel = this.structureModel(view, s.type);
            if (structModel) {
                // 30% smaller than the landmark size the models normalise to.
                root.scaling.setAll(structModel.scale * 0.7);
                root.position.set(sx + structModel.offset.x * 0.7, tileH + structModel.offset.y * 0.7, sz + structModel.offset.z * 0.7);
            } else {
                root.scaling.setAll(this.STRUCTURE_SIZE / 28 * 0.7);
                root.position.set(sx, tileH, sz);
            }
            const meta = { fs: 'structure', structure: s.id, system: s.system, pos: s.area };
            root.metadata = meta;
            const main = view.material('struct-' + s.type, color);
            const dark = view.material('struct-metal', '#26313c');
            const trim = view.material('struct-trim-' + s.seat, color);
            const light = view.material('struct-lights', '#8bdcf4');
            // The real tabletop model of the structure, in the owner's colour;
            // until it loads (or if it fails) the procedural miniature stands.
            if (structModel) {
                const mat = view.material('struct-obj-' + s.type + '-' + s.seat, color);
                for (let i = 0; i < structModel.parts.length; i++) {
                    const clone = structModel.parts[i].clone('fs-struct-part-' + s.id + '-' + i, root, false);
                    if (!clone) continue;
                    clone.material = mat;
                    clone.isPickable = true;
                    clone.metadata = meta;
                    clone.setEnabled(true);
                }
                this.addMarker(view, root, 'actor');
                continue;
            }
            const part = (name, shape, x, y, z, material) => {
                const mesh = shape.kind === 'box'
                    ? BABYLON.MeshBuilder.CreateBox(name, shape.opts, view.scene)
                    : BABYLON.MeshBuilder.CreateCylinder(name, shape.opts, view.scene);
                mesh.parent = root; mesh.position.set(x, y, z); mesh.material = material;
                mesh.isPickable = true; mesh.metadata = meta;
                return mesh;
            };
            if (s.type === 'factory') {
                part('fs-factory-pad-' + s.id, { kind: 'box', opts: { width: 28, depth: 25, height: 3 } }, 0, 1.5, 0, dark);
                part('fs-factory-hall-' + s.id, { kind: 'box', opts: { width: 14, depth: 12, height: 12 } }, -2, 9, 1, main);
                part('fs-factory-silo-' + s.id, { kind: 'cyl', opts: { diameter: 10, height: 20, tessellation: 12 } }, 7, 11.5, -5, dark);
                part('fs-factory-cap-' + s.id, { kind: 'cyl', opts: { diameter: 12, height: 2.5, tessellation: 12 } }, 7, 22, -5, trim);
                part('fs-factory-stack-' + s.id, { kind: 'cyl', opts: { diameterTop: 2.5, diameterBottom: 5, height: 17, tessellation: 10 } }, -9, 10, -6, trim);
                for (let i = 0; i < 3; i++) part('fs-factory-light-' + s.id + '-' + i, { kind: 'box', opts: { width: 2.5, height: 1.5, depth: .8 } }, -8 + i * 5, 7, 7.1, light);
            } else if (s.type === 'city') {
                part('fs-city-pad-' + s.id, { kind: 'box', opts: { width: 30, depth: 28, height: 2.5 } }, 0, 1.25, 0, dark);
                part('fs-city-tower-' + s.id, { kind: 'box', opts: { width: 11, depth: 10, height: 22 } }, 0, 13.5, 0, main);
                part('fs-city-wing-a-' + s.id, { kind: 'box', opts: { width: 8, depth: 10, height: 14 } }, -9, 9.5, 3, dark);
                part('fs-city-wing-b-' + s.id, { kind: 'box', opts: { width: 8, depth: 10, height: 17 } }, 9, 11, -3, main);
                part('fs-city-spire-' + s.id, { kind: 'cyl', opts: { diameterTop: 1, diameterBottom: 4, height: 8, tessellation: 8 } }, 0, 28.5, 0, trim);
                for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) {
                    part('fs-city-window-' + s.id + '-' + row + '-' + col, { kind: 'box', opts: { width: 1.4, height: 2.1, depth: .6 } }, -3.5 + col * 3.5, 7 + row * 5, 5.25, light);
                }
            } else {
                part('fs-bastion-pad-' + s.id, { kind: 'box', opts: { width: 31, depth: 31, height: 3 } }, 0, 1.5, 0, dark);
                part('fs-bastion-keep-' + s.id, { kind: 'box', opts: { width: 17, depth: 16, height: 19 } }, 0, 12.5, 0, main);
                for (const [i, x, z, towerH] of [[0,-10,-10,13],[1,10,-10,16],[2,-10,10,16],[3,10,10,13]]) {
                    part('fs-bastion-tower-' + s.id + '-' + i, { kind: 'box', opts: { width: 7, depth: 7, height: towerH } }, x, 1.5 + towerH / 2, z, dark);
                    part('fs-bastion-cap-' + s.id + '-' + i, { kind: 'cyl', opts: { diameter: 5, height: 2, tessellation: 8 } }, x, 2.5 + towerH, z, trim);
                }
                part('fs-bastion-beacon-' + s.id, { kind: 'cyl', opts: { diameterTop: 1, diameterBottom: 3, height: 6, tessellation: 8 } }, 0, 25, 0, light);
            }
            this.addMarker(view, root, 'actor');
        }
        // The objective tokens.
        for (const o of state.objectives) {
            if (o.taken) continue;                  // the token is already in the play area
            const sys = state.systems.find(x => x.id === o.system);
            if (!sys) continue;
            const p = this.areaPos(app, sys, o.area, view.metrics);
            const root = new BABYLON.TransformNode('fs-objective-' + o.id, view.scene);
            root.position.set(p.x + 40, h(p.x, p.y) + 6.5, p.y + 40);
            const gold = view.material('objective-bronze', '#b88a43');
            const gem = view.material('objective-' + o.faction, this.factionColor(o.faction), { emissive: true });
            const plinth = BABYLON.MeshBuilder.CreateCylinder('fs-objective-plinth-' + o.id, { diameter: 17, height: 3, tessellation: 12 }, view.scene);
            plinth.parent = root; plinth.position.y = 1.5; plinth.material = gold;
            const medallion = BABYLON.MeshBuilder.CreateCylinder('fs-objective-face-' + o.id, { diameter: 13, height: 1.5, tessellation: 12 }, view.scene);
            medallion.parent = root; medallion.position.y = 3.4; medallion.material = gem;
            const crest = BABYLON.MeshBuilder.CreatePolyhedron('fs-objective-crest-' + o.id, { type: 1, size: 4 }, view.scene);
            crest.parent = root; crest.position.y = 5.3; crest.material = gold; crest.isPickable = false;
            // The flag of the objective stands ON the token — one piece, moved
            // and collected as one, painted with the colour of the player who
            // needs to take it. It stands where the token stands.
            const owner = state.players.find(p2 => p2.faction === o.faction);
            const ownerColor = (owner && owner.color) || this.factionColor(o.faction) || '#e3b64f';
            const flag = new BABYLON.TransformNode('fs-objective-flag-' + o.id, view.scene);
            flag.parent = root;
            flag.position.y = 8.2;
            const pole = BABYLON.MeshBuilder.CreateCylinder('fs-objective-flagpole-' + o.id,
                { diameter: .9, height: 12, tessellation: 8 }, view.scene);
            pole.parent = flag; pole.position.y = 6; pole.material = view.material('flag-pole', '#8a94a0');
            const cloth = BABYLON.MeshBuilder.CreateBox('fs-objective-flagcloth-' + o.id,
                { width: 10, height: 5.6, depth: .5 }, view.scene);
            cloth.parent = flag; cloth.position.set(5.1, 10.4, 0);
            cloth.material = view.material('flag-cloth-' + ownerColor, ownerColor, { emissive: true });
            pole.isPickable = false; cloth.isPickable = false;
            const meta = { fs: 'area', system: o.system, pos: o.area };
            root.metadata = meta; plinth.metadata = meta; medallion.metadata = meta; crest.metadata = meta;
            this.addMarker(view, root, 'prop');
        }
        // The order tokens in the hexes of the tiles: a hex of the colour of the
        // owner, the mark of the order on the top face and the mark of the faction
        // on the bottom one. The tokens of one system lie on top of each other.
        for (const sys of state.systems) {
            if (!sys.tokens.length) continue;
            const p = this.tilePos(app, sys, view.metrics);
            const base = h(p.x, p.y) + 8 + this.MARKER_Y;
            sys.tokens.forEach((tok, i) => {
                const owner = state.players.find(p2 => p2.seat === tok.seat);
                const faction = owner ? owner.faction : '';
                const color = (owner && owner.color) || this.factionColor(faction);
                const root = new BABYLON.TransformNode('fs-tok-' + sys.id + '-' + i, view.scene);
                // The pile grows upwards: every new token lies on the one below.
                root.position.set(p.x, base + i * 7.4, p.y);
                root.rotation.y = i * 0.35;
                const body = BABYLON.MeshBuilder.CreateCylinder('fs-tok-body-' + sys.id + '-' + i, {
                    diameter: 30, height: 6, tessellation: 6,
                }, view.scene);
                body.parent = root;
                body.material = view.material('tok-body-' + color, color, { emissive: true });
                // The face of the token: while the order is closed the whole table
                // sees the faction of the owner and nothing else. The sign of the
                // order appears only when the player turns the token over.
                const faceName = tok.faceUp ? 'order' : 'faction';
                const top = BABYLON.MeshBuilder.CreateDisc('fs-tok-top-' + sys.id + '-' + i, {
                    radius: 13.4, tessellation: 24,
                }, view.scene);
                top.parent = root;
                top.rotation.x = Math.PI / 2;
                top.position.y = 3.15;
                const topMat = view.material('tok-face-' + faceName + '-' + tok.order + '-' + color, color);
                topMat.diffuseTexture = tok.faceUp
                    ? this.orderTexture(view, tok.order)
                    : this.factionTexture(view, faction);
                topMat.opacityTexture = topMat.diffuseTexture;
                topMat.useAlphaFromDiffuseTexture = true;
                topMat.backFaceCulling = false;
                top.material = topMat;
                // The side that lies on the table carries the other mark.
                const bottom = BABYLON.MeshBuilder.CreateDisc('fs-tok-bottom-' + sys.id + '-' + i, {
                    radius: 13.4, tessellation: 24,
                }, view.scene);
                bottom.parent = root;
                bottom.rotation.x = -Math.PI / 2;
                bottom.position.y = -3.15;
                const low = view.material('tok-under-' + faceName + '-' + faction + '-face', color);
                low.diffuseTexture = tok.faceUp
                    ? this.factionTexture(view, faction)
                    : this.orderTexture(view, tok.order);
                low.opacityTexture = low.diffuseTexture;
                low.useAlphaFromDiffuseTexture = true;
                low.backFaceCulling = false;
                bottom.material = low;
                // The token is a mouse target: clicking it opens its order.
                const meta = { fs: 'order', system: sys.id, seat: tok.seat, order: tok.order };
                root.metadata = meta;
                for (const mesh of [body, top, bottom]) { mesh.isPickable = true; mesh.metadata = meta; }
                this.addMarker(view, root, 'actor');
            });
        }
        // The warp storms are animated 3D anomalies; their barrier is aligned to the actual tile edge.
        for (const storm of state.storms) {
            const sys = state.systems.find(x => x.id === storm.system);
            if (!sys) continue;
            const p = this.tilePos(app, sys, view.metrics);
            const horizontal = storm.side === 'N' || storm.side === 'S';
            // The barrier lies exactly on the shared edge of the two tiles —
            // the storm is an anomaly of the border, not of a system.
            const d = this.TILE / 2;
            const off = { N: [0, -d], S: [0, d], E: [d, 0], W: [-d, 0] }[storm.side] || [0, 0];
            const root = new BABYLON.TransformNode('fs-storm-' + storm.id, view.scene);
            root.position.set(p.x + off[0], h(p.x, p.y) + 6.5, p.y + off[1]);
            const moved = storm.moved === true;
            const selected = view.stormPending === storm.id;
            root.metadata = { fs: 'storm', system: storm.system, side: storm.side, storm: storm.id };
            const barrier = BABYLON.MeshBuilder.CreateBox('fs-storm-barrier-' + storm.id, {
                width: horizontal ? this.TILE - 20 : 6,
                depth: horizontal ? 6 : this.TILE - 20,
                height: 4,
            }, view.scene);
            barrier.parent = root; barrier.position.y = 2;
            // A storm that already moved this phase is duller; the chosen one glows green.
            barrier.material = selected
                ? view.material('storm-barrier-sel', '#35d07f', { emissive: true, alpha: 0.95 })
                : moved
                    ? view.material('storm-barrier-moved', '#463c50', {})
                    : view.material('storm-barrier', '#8b376f', { emissive: true });
            // The barrier is the mouse target: a click on it selects the storm.
            barrier.isPickable = true;
            barrier.metadata = { fs: 'storm', system: storm.system, side: storm.side, storm: storm.id };
            this.addMarker(view, root, 'prop');
        }
        // The green ghosts: where the chosen storm may go right now.
        for (const ghost of view.stormGhosts || []) {
            const sys = state.systems.find(x => x.id === ghost.system);
            if (!sys) continue;
            const p = this.tilePos(app, sys, view.metrics);
            const horizontal = ghost.side === 'N' || ghost.side === 'S';
            const d = this.TILE / 2;
            const off = { N: [0, -d], S: [0, d], E: [d, 0], W: [-d, 0] }[ghost.side] || [0, 0];
            const root = new BABYLON.TransformNode('fs-storm-ghost-' + ghost.storm + '-' + ghost.dir, view.scene);
            root.position.set(p.x + off[0], h(p.x, p.y) + 6.5, p.y + off[1]);
            root.metadata = { fs: 'storm-ghost', system: ghost.system, side: ghost.side, storm: ghost.storm, dir: ghost.dir };
            const barrier = BABYLON.MeshBuilder.CreateBox('fs-storm-ghost-barrier-' + ghost.storm + '-' + ghost.dir, {
                width: horizontal ? this.TILE - 20 : 6,
                depth: horizontal ? 6 : this.TILE - 20,
                height: 5,
            }, view.scene);
            barrier.parent = root; barrier.position.y = 2.5;
            barrier.material = view.material('storm-ghost', '#35d07f', { emissive: true, alpha: 0.45 });
            barrier.isPickable = true;
            barrier.metadata = root.metadata;
            this.addMarker(view, root, 'prop');
        }
        this.drawCombat(app, view, state);
    },

    // --- the fight on the board ----------------------------------------------
    //
    // A battle is not a separate table: it happens right where the armies
    // stand, in the contested sector of the board, on the same 3D plane as the
    // whole game. The dice fly in from over the map and land on the ground of
    // the sector next to the fighters; the cubes of the played cards lie in
    // front of them. The cards themselves are not in the world — the hand is
    // the bar at the bottom of the screen, the played cards are in the panel.
    drawCombat(app, view, state) {
        const c = state.combat;
        if (!view.flights) view.flights = new Map();
        if (!view.combatSeen) view.combatSeen = new Set();
        if (!c) { view.combatSeen.clear(); view.flights.clear(); return; }
        const sys = state.systems.find(x => x.id === c.system);
        if (!sys) return;
        const area = sys.areas.find(a => a.pos === c.pos);
        if (!area) return;
        const C = this.COMBAT;
        const tile = this.tilePos(app, sys, view.metrics);
        const ap = this.areaPos(app, sys, c.pos, view.metrics);
        const disc = area.world ? this.discAt(app, sys, c.pos, view.metrics) : null;
        // The contested sector: its centre and the ground of the battle. On a
        // world the middle of the sector is the planet itself — the pieces on
        // it stand higher, exactly as the miniatures do.
        const ax = ap.x, az = ap.y;
        const tileTop = app.location.terrain.heightAt(tile.x, tile.y) + 6.5;
        const groundY = (x, z) => tileTop + (disc && Math.hypot(x - disc.x, z - disc.z) < this.PLANET_D / 2 ? this.PLANET_H : 0);
        const d = this.TILE * this.AREA / 2;
        for (const side of [{ id: 'attacker', seat: c.attacker }, { id: 'defender', seat: c.defender }]) {
            const sign = side.id === 'attacker' ? 1 : -1;
            // The direction from the centre of the sector to the centroid of the
            // side's fighters: the dice and the cubes of a side lie on its own
            // side of the battlefield, next to its miniatures — never across.
            const ups = state.units
                .filter(u => u.system === c.system && u.area === c.pos && u.seat === side.seat)
                .map(u => view.unitPositions && view.unitPositions.get(u.id))
                .filter(Boolean);
            let dir = { x: 0, z: sign };
            let cd = 0;   // how far the troops' centroid stands from the centre
            if (ups.length) {
                let mx = 0, mz = 0;
                for (const p of ups) { mx += p.x; mz += p.z; }
                const dx = mx / ups.length - ax, dz = mz / ups.length - az;
                const len = Math.hypot(dx, dz);
                if (len > 2) dir = { x: dx / len, z: dz / len };
                cd = len;
            }
            // On a world the dice lie on the table ring just OUTSIDE the planet,
            // clear of the miniatures that stand on it; in the void they start
            // beyond the troops' centroid. Extra rows never clamp into one heap.
            const base = disc ? this.PLANET_D / 2 + 8 : (ups.length ? Math.min(cd + 26, d - 10) : d - 10);
            // A point at `dist` from the centre along the side's direction, shifted
            // `along` across it (the rows run perpendicular to the direction),
            // clamped back into the tile.
            const rowPos = (dist, along) => ({
                x: Math.max(ax - (d + 2), Math.min(ax + (d + 2), ax + dir.x * dist - dir.z * along)),
                z: Math.max(az - (d + 2), Math.min(az + (d + 2), az + dir.z * dist + dir.x * along)),
            });
            // The dice of the side land on the ground of the sector, in rows at
            // the edge on the side of its own troops.
            const dice = c.dice[side.id] || [];
            // Spacing by the die's diagonal, not its edge: a turned die must
            // not cut into its neighbour. On a world ALL dice of the side lie
            // in one arc on the table ring OUTSIDE the planet (around the
            // planet's centre, so even the 8th die keeps its own place); in
            // the void they stand in rows of four marching inwards.
            dice.forEach((face, i) => {
                let pt;
                if (disc) {
                    const ang = Math.max(C.die * 1.45, C.die * Math.SQRT2 * 1.03) / base;
                    const a0 = Math.atan2(dir.z, dir.x);
                    const a = a0 + (i - (dice.length - 1) / 2) * ang;
                    pt = { x: disc.x + base * Math.cos(a), z: disc.z + base * Math.sin(a) };
                } else {
                    const row = Math.floor(i / 4);
                    const inRow = i % 4;
                    const nRow = Math.min(4, dice.length - row * 4);
                    const dist = Math.max(10, base - row * C.die * 1.75);
                    pt = rowPos(dist, (inRow - (nRow - 1) / 2) * C.die * 1.7);
                }
                const rest = { x: pt.x, y: groundY(pt.x, pt.z) + C.die / 2, z: pt.z };
                const node = new BABYLON.TransformNode('fs-die-' + side.id + '-' + i, view.scene);
                node.position.set(rest.x, rest.y, rest.z);
                node.rotation.y = (i * 1.7) % (Math.PI / 2);
                node.metadata = { fs: 'die', system: c.system, pos: c.pos, side: side.id, face, index: i };
                const cube = BABYLON.MeshBuilder.CreateBox('fs-die-body-' + side.id + '-' + i, { size: C.die }, view.scene);
                cube.parent = node;
                cube.material = view.material('die-body-' + (face || 'blank'), fsDieColor(face));
                const faceMesh = BABYLON.MeshBuilder.CreateDisc('fs-die-face-' + side.id + '-' + i, {
                    radius: C.die * 0.48, tessellation: 18,
                }, view.scene);
                faceMesh.parent = node;
                faceMesh.rotation.x = Math.PI / 2;
                faceMesh.position.y = C.die / 2 + 0.06;
                const mat = view.material('die-face-' + (face || 'blank'), '#f4ecd9');
                mat.diffuseTexture = this.dieTexture(view, face || 'blank');
                mat.opacityTexture = mat.diffuseTexture;
                mat.useAlphaFromDiffuseTexture = true;
                mat.backFaceCulling = false;
                faceMesh.material = mat;
                for (const mesh of [cube, faceMesh]) {
                    mesh.isPickable = true;
                    mesh.metadata = node.metadata;
                }
                this.addMarker(view, node, 'actor');
                const key = 'die:' + c.round + ':' + side.id + ':' + i + ':' + (face || 'blank');
                if (!view.combatSeen.has(key)) {
                    view.combatSeen.add(key);
                    // The die lands where it was put: the flight takes it there
                    // from over the map.
                    this.throwDie(view, node, key, i, side.id, rest);
                } else {
                    const f = view.flights.get(key);
                    if (f) {
                        f.node = node;
                        if (!f.done) this.placeFlight(node, f);
                        else node.position.set(rest.x, rest.y, rest.z);
                    }
                }
            });
            // The cubes of the side: the attack and defence tokens of its cards
            // and the reinforcement tokens it spent — on the ground in front.
            const tokens = (c.tokens && c.tokens[side.id]) || { att: 0, def: 0 };
            const cubes = [];
            for (let i = 0; i < (tokens.att || 0); i++) cubes.push('cube.att');
            for (let i = 0; i < (tokens.def || 0); i++) cubes.push('cube.def');
            cubes.forEach((icon, i) => {
                const row = Math.floor(i / 8);
                const inRow = i % 8;
                const nRow = Math.min(8, cubes.length - row * 8);
                const pt = rowPos(disc ? base - 13 : Math.max(6, base - 16 - row * 10.5), (inRow - (nRow - 1) / 2) * 12.5);
                const node = new BABYLON.TransformNode('fs-ctok-' + side.id + '-' + i, view.scene);
                node.position.set(pt.x, groundY(pt.x, pt.z) + 1.4, pt.z);
                node.metadata = { fs: 'token', system: c.system, pos: c.pos, side: side.id };
                // The one-round attack/defence tokens are tokens, not cubes:
                // flat discs with the bolter/shield blazon, exactly like the
                // reinforcement tokens.
                const isAtt = icon.indexOf('att') >= 0;
                const body = BABYLON.MeshBuilder.CreateCylinder('fs-ctok-body-' + side.id + '-' + i,
                    { diameter: 10, height: 2.8, tessellation: 24 }, view.scene);
                body.parent = node;
                body.material = view.material('ctok-' + icon, isAtt ? '#c85a3f' : '#4173ba', { emissive: true });
                const face = BABYLON.MeshBuilder.CreateDisc('fs-ctok-face-' + side.id + '-' + i,
                    { radius: 4.4, tessellation: 24 }, view.scene);
                face.parent = node;
                face.rotation.x = Math.PI / 2;
                face.position.y = 1.45;
                const fmat = view.material('ctok-face-' + icon, '#f4ecd9');
                fmat.diffuseTexture = this.iconTexture(view, icon.replace('cube.', 'token.'), '#f4ecd9');
                fmat.opacityTexture = fmat.diffuseTexture;
                fmat.useAlphaFromDiffuseTexture = true;
                fmat.backFaceCulling = false;
                face.material = fmat;
                body.isPickable = true;
                body.metadata = node.metadata;
                this.addMarker(view, node, 'prop');
            });
            // A reinforcement token IS the faction's CL0 unit (the rules,
            // "Reinforcement Tokens"): its own miniature, painted fully white.
            // Until the OBJ loads (or if it fails) a flat white disc stands in.
            const reinforce = Number((c.reinforce && c.reinforce[side.id]) || 0);
            const routed = Number((c.reinforceRouted && c.reinforceRouted[side.id]) || 0);
            const sidePlayer = state.players[side.seat] || {};
            const reinDef = typeof FS_RULES !== 'undefined'
                ? FS_RULES.reinforceUnitDef(sidePlayer.faction, area.world ? 'ground' : 'ship') : null;
            const reinModel = reinDef
                ? this.factionModel(view, sidePlayer.faction, reinDef.type, reinDef.id, null) : null;
            const whiteMat = view.material('rein-white', '#f4f1e8');
            for (let i = 0; i < reinforce; i++) {
                const row = Math.floor(i / 8);
                const inRow = i % 8;
                const nRow = Math.min(8, reinforce - row * 8);
                const pt = rowPos(disc ? base - 13 - (cubes.length ? 10.5 : 0) : Math.max(6, base - 16 - (cubes.length ? 10.5 : 0) - row * 10.5),
                    (inRow - (nRow - 1) / 2) * 12.5);
                const node = new BABYLON.TransformNode('fs-rein-' + side.id + '-' + i, view.scene);
                node.position.set(pt.x, groundY(pt.x, pt.z) + 1.4, pt.z);
                node.metadata = { fs: 'token', system: c.system, pos: c.pos, side: side.id, reinforce: true };
                const isRouted = i < routed;
                if (reinModel) {
                    // The CL0 miniature, every part plain white; a routed token
                    // lies flipped on its side, inert.
                    const k = area.world ? this.ON_WORLD : 1;
                    node.position.set(pt.x + reinModel.root.position.x * k, groundY(pt.x, pt.z) + reinModel.root.position.y * k, pt.z + reinModel.root.position.z * k);
                    node.scaling.copyFrom(reinModel.root.scaling);
                    node.scaling.scaleInPlace(k);
                    for (let p = 0; p < reinModel.parts.length; p++) {
                        const clone = reinModel.parts[p].clone('fs-rein-part-' + side.id + '-' + i + '-' + p, node, false);
                        if (!clone) continue;
                        clone.material = whiteMat;
                        clone.isPickable = true;
                        clone.metadata = node.metadata;
                        clone.setEnabled(true);
                    }
                    if (isRouted) node.rotation.z = Math.PI / 2;
                } else {
                    const tokenDisc = BABYLON.MeshBuilder.CreateCylinder('fs-rein-body-' + side.id + '-' + i,
                        { diameter: 10, height: 2.8, tessellation: 24 }, view.scene);
                    tokenDisc.parent = node;
                    tokenDisc.material = view.material('rein-' + side.id + '-' + i + (isRouted ? '-r' : ''),
                        isRouted ? '#6b6257' : '#e8e2d2', { emissive: !isRouted });
                    const face = BABYLON.MeshBuilder.CreateDisc('fs-rein-face-' + side.id + '-' + i,
                        { radius: 4.4, tessellation: 24 }, view.scene);
                    face.parent = node;
                    face.rotation.x = Math.PI / 2;
                    face.position.y = 1.45;
                    const fmat = view.material('rein-face-' + side.id + '-' + i + (isRouted ? '-r' : ''), '#f4ecd9');
                    fmat.diffuseTexture = this.iconTexture(view, 'order.event', isRouted ? '#8a8175' : '#3a3428');
                    fmat.opacityTexture = fmat.diffuseTexture;
                    fmat.useAlphaFromDiffuseTexture = true;
                    fmat.backFaceCulling = false;
                    face.material = fmat;
                    if (isRouted) node.rotation.z = Math.PI / 2;
                    tokenDisc.isPickable = true;
                    tokenDisc.metadata = node.metadata;
                }
                this.addMarker(view, node, 'prop');
            }
        }
    },

    // A die is thrown across the map: it starts high over the board, far from
    // the sector, turns in the air and lands on the ground of the sector where
    // it stays.
    throwDie(view, node, key, index, side, rest) {
        const back = side === 'defender' ? -1 : 1;
        const from = {
            x: rest.x - 420 - index * 30,
            y: 240 + (index % 4) * 20,
            z: rest.z + back * (260 + index * 16),
        };
        const ctrl = { x: (from.x + rest.x) * 0.5, y: 320 + index * 10, z: (from.z + rest.z) * 0.5 };
        view.flights.set(key, {
            kind: 'die', t: 0, dur: 1.1, done: false, node, from, ctrl, to: rest,
            spin: 6 + index * 1.3,
        });
        this.placeFlight(node, view.flights.get(key));
    },

    placeFlight(node, f) {
        const t = Math.max(0, Math.min(1, f.t));
        const u = 1 - t;
        const p = {
            x: u * u * f.from.x + 2 * u * t * f.ctrl.x + t * t * f.to.x,
            y: u * u * f.from.y + 2 * u * t * f.ctrl.y + t * t * f.to.y,
            z: u * u * f.from.z + 2 * u * t * f.ctrl.z + t * t * f.to.z,
        };
        // The last part of the flight is a small bounce on the ground.
        const hop = t > 0.74 ? Math.sin((t - 0.74) / 0.26 * Math.PI) * 16 : 0;
        node.position.set(p.x, p.y + hop, p.z);
        const spin = f.spin * u;
        node.rotation.x = spin * 0.8;
        node.rotation.z = spin * 0.55;
        node.rotation.y = spin * 0.4;
    },

    // The flights of the dice, advanced once per frame.
    tweenTick(view) {
        if (!view.flights || !view.flights.size) return;
        let dt = 0.016;
        try { dt = Math.min(0.05, view.scene.getEngine().getDeltaTime() / 1000) || 0.016; } catch (e) { dt = 0.016; }
        for (const f of view.flights.values()) {
            if (f.done) continue;
            f.t = Math.min(1, f.t + dt / f.dur);
            if (f.t < 0) continue;
            const node = f.node;
            if (node) this.placeFlight(node, f);
            if (f.t >= 1) {
                f.done = true;
                if (node && node.rotation) {
                    node.rotation.x = 0; node.rotation.y = 0; node.rotation.z = 0;
                    node.position.y = f.to.y;
                }
            }
        }
    },

    // A small painted plate: an icon of the interface standing in the world.
    iconTexture(view, name, color) {
        if (!view.iconTex) view.iconTex = new Map();
        const key = name + '|' + (color || '');
        if (view.iconTex.has(key)) return view.iconTex.get(key);
        const S = 128;
        const tex = new BABYLON.DynamicTexture('fs-icon-' + key.replace(/[^a-z0-9]/gi, '-'), { width: S, height: S }, view.scene, true);
        tex.hasAlpha = true;
        const ctx = tex.getContext();
        if (ctx) {
            ctx.clearRect(0, 0, S, S);
            if (typeof FSIcons !== 'undefined') FSIcons.canvas(ctx, name, S / 2, S / 2, S * 0.94, color ? { color } : null);
        }
        tex.update();
        view.iconTex.set(key, tex);
        return tex;
    },

    // The face of a die, drawn as the game draws it: the blazon in dark ink on
    // the paper face, large enough to read at the zoom of the board.
    dieTexture(view, face) {
        if (!view.dieTex) view.dieTex = new Map();
        if (view.dieTex.has(face)) return view.dieTex.get(face);
        const S = 96;
        const tex = new BABYLON.DynamicTexture('fs-die-' + face, { width: S, height: S }, view.scene, true);
        tex.hasAlpha = true;
        const ctx = tex.getContext();
        if (ctx) {
            ctx.clearRect(0, 0, S, S);
            const name = ({ att: 'die.att', def: 'die.def', morale: 'die.morale' })[face] || 'die.blank';
            if (typeof FSIcons !== 'undefined') FSIcons.canvas(ctx, name, S / 2, S / 2, S * 0.94, { color: FSIcons.color.ink });
        }
        tex.update();
        view.dieTex.set(face, tex);
        return tex;
    },

    // Where the fight is, in the world: the camera flies to the contested
    // sector on the board itself when the battle begins.
    combatFocus(app, state) {
        const c = state.combat;
        if (!c) return null;
        const sys = state.systems.find(x => x.id === c.system);
        if (!sys) return null;
        const area = sys.areas.find(a => a.pos === c.pos);
        if (!area) return null;
        const ap = this.areaPos(app, sys, c.pos, null);
        const disc = area.world ? this.discAt(app, sys, c.pos, null) : null;
        const x = disc ? disc.x : ap.x;
        const z = disc ? disc.z : ap.y;
        return { x, z, y: app.location.terrain.heightAt(x, z) + 30 };
    },

    // The markers of a void sector around each other.
    spread(count, index) {
        const a = count <= 1 ? Math.PI / 4 : index / count * Math.PI * 2;
        const r = 34;
        return { x: Math.cos(a) * r, y: Math.sin(a) * r };
    },

    // The legal moves are shown as rings.
    highlight(view, list) {
        for (let i = 0; i < view.highlights.length; i++) {
            const ring = view.highlights[i];
            const target = list[i];
            if (!target) { ring.setEnabled(false); continue; }
            ring.setEnabled(true);
            ring.position.set(target.x, target.y, target.z);
        }
    },

    clearHighlights(view) {
        for (const ring of view.highlights) ring.setEnabled(false);
    },

    // --- what the mouse is doing --------------------------------------------
    //
    // The player picks a group of units on the board and points at a sector.
    // The board answers with the drifting arrow of the march and with a ring
    // under every picked piece — no list of units in the panel is needed.

    ensureArrow(app, view) {
        if (view.arrow) return view.arrow;
        const scene = view.scene;
        const root = new BABYLON.TransformNode('fs-arrow', scene);
        // Dashed stripes: uScale is set per length, uOffset makes them march.
        const tex = new BABYLON.DynamicTexture('fs-arrow-tex', { width: 64, height: 16 }, scene, true);
        tex.hasAlpha = true;
        const ctx = /** @type {any} */ (tex.getContext());
        ctx.clearRect(0, 0, 64, 16);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 38, 16);
        tex.update(false);
        tex.uScale = 1; tex.vScale = 1;
        const beamMat = new BABYLON.StandardMaterial('fs-arrow-mat', scene);
        beamMat.diffuseTexture = tex;
        beamMat.opacityTexture = tex;
        beamMat.useAlphaFromDiffuseTexture = true;
        beamMat.emissiveColor = new BABYLON.Color3(.42, .95, .62);
        beamMat.diffuseColor = new BABYLON.Color3(.5, 1, .7);
        beamMat.specularColor = BABYLON.Color3.Black();
        beamMat.disableLighting = true;
        beamMat.alpha = .85;
        const headMat = new BABYLON.StandardMaterial('fs-arrow-head-mat', scene);
        headMat.diffuseColor = new BABYLON.Color3(.5, 1, .7);
        headMat.emissiveColor = new BABYLON.Color3(.4, .95, .62);
        headMat.specularColor = BABYLON.Color3.Black();
        headMat.disableLighting = true;
        const beam = BABYLON.MeshBuilder.CreateGround('fs-arrow-beam', { width: 1, height: 9 }, scene);
        beam.parent = root; beam.material = beamMat; beam.isPickable = false;
        const head = BABYLON.MeshBuilder.CreateDisc('fs-arrow-head', { radius: 7, tessellation: 3 }, scene);
        head.rotation.x = Math.PI / 2;
        head.parent = root; head.material = headMat; head.isPickable = false;
        for (const mesh of [beam, head]) {
            World3D.addObject(app.location.view, mesh, 'prop', { castShadow: false, ink: false, outline: false });
        }
        root.setEnabled(false);
        view.arrow = { root, beam, head, beamMat, headMat, tex };
        return view.arrow;
    },

    // from/to: {x, z} on the board; ok: the move is legal (green) or not (red).
    showArrow(app, view, from, to, ok) {
        const arrow = this.ensureArrow(app, view);
        const dx = to.x - from.x, dz = to.z - from.z;
        const len = Math.hypot(dx, dz);
        if (!Number.isFinite(len) || len < 6) { this.hideArrow(view); return; }
        // The callers pass board coordinates; a missing height must not turn the
        // whole arrow into NaN and make it invisible.
        const fy = Number.isFinite(from.y) ? from.y : 0;
        const ty = Number.isFinite(to.y) ? to.y : fy;
        const y = Math.max(fy, ty) + this.SELECT_Y * .6;
        arrow.root.position.set(from.x, y, from.z);
        arrow.root.rotation.y = Math.atan2(-dz, dx);
        // The strip stops short of the arrowhead so the head reads as a tip.
        const body = Math.max(2, len - 16);
        arrow.beam.scaling.x = body;
        arrow.beam.position.set(body / 2, 0, 0);
        arrow.tex.uScale = Math.max(1, body / 26);
        arrow.head.position.set(len - 7, 0, 0);
        const color = ok ? new BABYLON.Color3(.44, .98, .66) : new BABYLON.Color3(1, .38, .32);
        arrow.beamMat.emissiveColor = color; arrow.beamMat.diffuseColor = color;
        arrow.headMat.emissiveColor = color; arrow.headMat.diffuseColor = color;
        arrow.root.setEnabled(true);
    },

    hideArrow(view) {
        if (view && view.arrow) view.arrow.root.setEnabled(false);
    },

    // A ring under every picked piece.
    showSelection(app, view, list) {
        if (!view.selection) view.selection = [];
        if (!view.selectionRings) view.selectionRings = [];
        while (view.selectionRings.length < 10) {
            const ring = BABYLON.MeshBuilder.CreateTorus('fs-pick-' + view.selectionRings.length,
                { diameter: 34, thickness: 2.4, tessellation: 32 }, view.scene);
            ring.isPickable = false;
            ring.setEnabled(false);
            const material = new BABYLON.StandardMaterial('fs-pick-mat-' + view.selectionRings.length, view.scene);
            material.emissiveColor = new BABYLON.Color3(.55, .95, .62);
            material.diffuseColor = new BABYLON.Color3(.55, .95, .62);
            material.disableLighting = true;
            ring.material = material;
            World3D.addObject(app.location.view, ring, 'prop', { castShadow: false, ink: false, outline: false });
            view.selectionRings.push(ring);
        }
        for (let i = 0; i < view.selectionRings.length; i++) {
            const ring = view.selectionRings[i];
            const item = list[i];
            if (!item) { ring.setEnabled(false); continue; }
            ring.setEnabled(true);
            ring.position.set(item.x, item.y + .6, item.z);
            if (ring.material && item.color) ring.material.emissiveColor = BABYLON.Color3.FromHexString(item.color);
            if (ring.metadata == null) ring.metadata = {};
            ring.metadata.phase = i * 0.8;
        }
        view.selection = list.slice(0, view.selectionRings.length);
    },

    clearSelection(view) {
        if (!view) return;
        view.selection = [];
        for (const ring of view.selectionRings || []) ring.setEnabled(false);
    },

    // A translucent token shows where an objective would be placed.
    showGhost(app, view, pos, color) {
        this.clearGhost(view);
        const scene = view.scene;
        const root = new BABYLON.TransformNode('fs-ghost', scene);
        root.position.set(pos.x, pos.y + 8, pos.z);
        const gem = new BABYLON.StandardMaterial('fs-ghost-mat', scene);
        gem.diffuseColor = BABYLON.Color3.FromHexString(color || '#d8b873');
        gem.emissiveColor = BABYLON.Color3.FromHexString(color || '#d8b873').scale(.7);
        gem.alpha = .55; gem.disableLighting = true;
        const disc = BABYLON.MeshBuilder.CreateCylinder('fs-ghost-disc', { diameter: 20, height: 3, tessellation: 20 }, scene);
        disc.parent = root; disc.position.y = 1; disc.material = gem; disc.isPickable = false;
        const ring = BABYLON.MeshBuilder.CreateTorus('fs-ghost-ring', { diameter: 30, thickness: 1.6, tessellation: 28 }, scene);
        ring.parent = root; ring.material = gem; ring.isPickable = false;
        for (const mesh of [disc, ring]) World3D.addObject(app.location.view, mesh, 'prop', { castShadow: false, ink: false, outline: false });
        view.ghost = { root, disc, ring };
        return root;
    },

    clearGhost(view) {
        const ghost = view && view.ghost;
        if (!ghost) return;
        World3D.removeObject(view.app.location.view, ghost.disc);
        World3D.removeObject(view.app.location.view, ghost.ring);
        view.ghost = null;
    },

    // The pulse of everything that has to be alive: the arrow, the rings.
    pulse(view) {
        const t = view.clock || 0;
        const arrow = view.arrow;
        if (arrow && arrow.root && arrow.root.isEnabled()) {
            if (arrow.tex) arrow.tex.uOffset = (-t * 1.6) % 1;
            const s = .92 + Math.sin(t * 7) * .13;
            arrow.head.scaling.set(s, 1, s);
            arrow.beamMat.alpha = .62 + Math.sin(t * 5) * .18;
        }
        for (const ring of view.selectionRings || []) {
            if (ring.isEnabled && ring.isEnabled()) {
                const phase = (ring.metadata && ring.metadata.phase) || 0;
                const s = 1 + Math.sin(t * 4.2 + phase) * .07;
                ring.scaling.set(s, 1, s);
            }
        }
        if (view.ghost) {
            const s = 1 + Math.sin(t * 3.4) * .06;
            view.ghost.ring.scaling.set(s, 1, s);
        }
    },

    // Where a point of the board is on the screen, in the CSS pixels of the canvas.
    // The floating plaques of the interface sit on top of it.
    project(app, x, y, z) {
        const scene = app.location.view.scene;
        const engine = scene.getEngine ? scene.getEngine() : null;
        const camera = scene.activeCamera;
        if (!engine || !camera || !BABYLON.Vector3 || !BABYLON.Matrix) return null;
        const width = engine.getRenderWidth(), height = engine.getRenderHeight();
        if (!width || !height) return null;
        const p = BABYLON.Vector3.Project(new BABYLON.Vector3(x, y, z), BABYLON.Matrix.Identity(),
            scene.getTransformMatrix(), camera.viewport.toGlobal(width, height));
        const canvas = app.location.view.world && app.location.view.world.canvas;
        // Before the first frame the transform matrix is not ready yet.
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
        const cssWidth = (canvas && canvas.clientWidth) || width;
        const k = cssWidth / width;
        if (!Number.isFinite(k) || k <= 0) return { x: p.x, y: p.y };
        return { x: p.x * k, y: p.y * k };
    },

    // What is under the pointer.
    pickAt(app, view, px, py) {
        const scene = view.scene;
        const pick = scene.pick(px, py, mesh => !!mesh.metadata && mesh.metadata.fs);
        if (!pick || !pick.hit || !pick.pickedMesh) return null;
        return pick.pickedMesh.metadata;
    },
};
