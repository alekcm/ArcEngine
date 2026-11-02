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
        morale: '#7d5a9e',
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

    // The battle table: a raised cloth above the contested sector, tipped toward
    // the camera so the cards on it can be read.
    ARENA: {
        lift: 76,           // world px above the ground
        tilt: 0.46,         // how far the table leans toward the viewer
        w: 280,             // the width of the cloth
        d: 142,             // its depth: the hand, the dice, the cards, the miniatures
        cardW: 34,          // the cardboard of a card
        cardH: 48,
        die: 11,            // the edge of a die
    },

    // A world is a flat, round piece of the planet laid into its sector — not a
    // sphere. The units and the structures stand ON that circle, so it carries
    // the whole visual identity of the world (the same map on every client).
    PLANET_D: 96,          // world px: the diameter of the round face of a world
    PLANET_H: 7,           // world px: how thick the piece of the planet is
    PLANET_SHIFT: -8,      // world px: the circle is lifted toward the far edge, clear of the printed name
    ON_WORLD: 0.72,        // the miniatures on a world are smaller than the ones in the void
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
            inspectionRing: null,
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
        view.inspectionRing = BABYLON.MeshBuilder.CreateTorus('fs-inspection-ring', { diameter: 82, thickness: 1.6, tessellation: 48 }, view.scene);
        view.inspectionRing.material = view.material('inspection', '#6bd5e8', { emissive: true });
        view.inspectionRing.isPickable = false;
        view.inspectionRing.setEnabled(false);
        World3D.addObject(app.location.view, view.inspectionRing, 'prop', { castShadow: false, ink: false, outline: false });
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
                // Objective worlds receive a fine orbital marker, distinct from the nameplate.
                if (area.world.objective) {
                    ctx.strokeStyle = 'rgba(236,190,91,.86)'; ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.arc(r.x + r.w / 2, r.y + r.h / 2 - 7, r.w / 2 - 22, 0, Math.PI * 2);
                    ctx.stroke();
                }
                // Compact resource readout with recognizable, localized glyphs.
                ctx.textAlign = 'left'; ctx.font = 'bold 15px system-ui, sans-serif';
                ctx.fillStyle = '#a8d08a'; ctx.fillText('◈ ' + area.world.materiel, r.x + 16, r.y + 31);
                ctx.fillStyle = '#d8c9a8'; ctx.fillText('⌂ ' + area.world.capacity, r.x + 16, r.y + 54);
                const assetGlyph = { forge: 'asset.forge', cache: 'asset.cache', reinforcement: 'ui.reinforce', prosperity: 'asset.prosperity' };
                const assets = area.world.assets.map(asset => assetGlyph[asset] || asset).join('  ');
                if (assets) {
                    ctx.fillStyle = '#8fd5f2'; ctx.font = 'bold 14px system-ui, sans-serif';
                    ctx.fillText(assets, r.x + 16, r.y + 77);
                }
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

    // The round map of a world seen from above: continents, bands, caps and a
    // lit rim. Only the inscribed circle of the texture is sampled by the disc.
    planetTexture(view, name) {
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

    planetMaterial(view, name) {
        if (view.planetMaterials.has(name)) return view.planetMaterials.get(name);
        const surface = new BABYLON.StandardMaterial('fs-planet-surface-' + name, view.scene);
        surface.diffuseTexture = this.planetTexture(view, name);
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
                const mats = this.planetMaterial(view, name);
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
            for (const layer of [planet.mesh, planet.clouds, planet.atmosphere, planet.rim]) layer.setEnabled(false);
        }
        for (const key of active) {
            const p = view.planets.get(key);
            for (const layer of [p.mesh, p.clouds, p.atmosphere, p.rim]) layer.setEnabled(true);
        }
    },

    // Where a piece stands on a world: the ring of minimap places keeps the
    // structure at the far edge and the troops in front of it, inside the circle.
    discSpread(count, index, hasStructure) {
        const r = this.PLANET_D * 0.31;
        const step = Math.PI * 2 / Math.max(1, count);
        // North (0, -1) belongs to the structure; the troops start half a step away from it.
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
        for (const planet of preview.ghost.planets.values()) for (const mesh of [planet.mesh, planet.clouds, planet.atmosphere, planet.rim]) World3D.removeObject(locationView, mesh);
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

    // A reusable, subtle armor pattern keeps UV-mapped OBJ miniatures from reading as flat solid-color plastic.
    factionModelMaterial(view, faction) {
        if (view.modelMaterials.has(faction)) return view.modelMaterials.get(faction);
        const base = this.factionColor(faction);
        const texture = new BABYLON.DynamicTexture('fs-armor-map-' + faction, { width: 256, height: 256 }, view.scene, true);
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
        const material = new BABYLON.StandardMaterial('fs-mini-' + faction, view.scene);
        material.diffuseTexture = texture;
        material.diffuseColor = new BABYLON.Color3(1, 1, 1);
        material.specularColor = new BABYLON.Color3(.34, .31, .25);
        material.specularPower = 36;
        view.modelMaterials.set(faction, material);
        return material;
    },

    // The repository contains faction OBJ miniatures. Babylon's bundled loader imports them
    // directly; normalize their arbitrary source scale once, cache them, then clone for units.
    factionModel(view, faction, unitType) {
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
        const key = faction + ':' + unitType;
        if (view.modelCache.has(key)) return view.modelCache.get(key);
        if (view.modelLoads.has(key)) return null;
        const spec = specs[faction] && specs[faction][unitType];
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
            const material = this.factionModelMaterial(view, faction);
            for (const mesh of parts) {
                mesh.parent = root;
                mesh.material = material;
                mesh.isPickable = false;
                mesh.computeWorldMatrix(true);
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
            const model = { root, parts, material };
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

    addFactionUnit(view, unit, pos, offset, color, unitType, scale) {
        const model = this.factionModel(view, unit.faction, unitType);
        if (!model) return null;
        const k = scale || 1;
        const metadata = { fs: 'unit', unit: unit.id, system: unit.system, pos: unit.area };
        if (unitType === 'ground') {
            const diameter = 30 * k;
            const base = BABYLON.MeshBuilder.CreateCylinder('fs-unit-base-' + unit.id, { diameter, height: 3.5 * k, tessellation: 32 }, view.scene);
            base.position.set(pos.x + offset.x, pos.y - 1.75 * k, pos.z + offset.y);
            base.material = view.material('mini-base', '#121a22'); base.isPickable = true; base.metadata = metadata;
            this.addMarker(view, base, 'prop');
            const rim = BABYLON.MeshBuilder.CreateTorus('fs-unit-rim-' + unit.id, { diameter, thickness: 1.2, tessellation: 32 }, view.scene);
            rim.position.set(pos.x + offset.x, pos.y + .35, pos.z + offset.y);
            rim.material = view.material('mini-rim-' + unit.seat, color, { emissive: true });
            rim.isPickable = false; this.addMarker(view, rim, 'prop');
        }
        const holder = new BABYLON.TransformNode('fs-unit-model-' + unit.id, view.scene);
        holder.position.set(pos.x + offset.x + model.root.position.x * k, pos.y + model.root.position.y * k, pos.z + offset.y + model.root.position.z * k);
        holder.scaling.copyFrom(model.root.scaling);
        holder.scaling.scaleInPlace(k);
        holder.metadata = { fs: 'unit', unit: unit.id, system: unit.system, pos: unit.area };
        for (let i = 0; i < model.parts.length; i++) {
            const source = model.parts[i];
            const clone = source.clone('fs-unit-part-' + unit.id + '-' + i, holder, false);
            if (!clone) continue;
            clone.material = model.material;
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
                if (def && !u.routed && this.addFactionUnit(view, u, base, off, color, def.type, onWorld)) return;
                // Until a faction OBJ loads (or for ships), use sculpted silhouettes rather than
                // identical flat counters: ships read as long hulls, ground units as raised pieces.
                const ship = def && def.type === 'ship';
                const unitMeta = { fs: 'unit', unit: u.id, system: sysId, pos };
                const unitMaterial = view.material('unit' + u.seat, color, u.routed ? { alpha: 0.55 } : { emissive: true });
                if (ship) {
                    // Distinct fallback silhouette: a tapered hull, broad swept wings and a lit cockpit.
                    const craft = new BABYLON.TransformNode('fs-u' + u.id, view.scene);
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
                    mesh.material = unitMaterial;
                    if (u.routed) mesh.rotation.z = Math.PI / 2;
                    mesh.isPickable = true; mesh.metadata = unitMeta;
                    this.addMarker(view, mesh, 'actor');
                }
            });
        }
        // Structures are small tabletop miniatures standing on the round world
        // itself, at its far edge — never beside the planet.
        for (const s of state.structures) {
            const sys = state.systems.find(x => x.id === s.system);
            if (!sys) continue;
            const disc = this.discAt(app, sys, s.area, view.metrics);
            const owner = state.players.find(p2 => p2.seat === s.seat);
            const color = (owner && owner.color) || this.factionColor(owner ? owner.faction : '');
            const root = new BABYLON.TransformNode('fs-structure-' + s.id, view.scene);
            const k = .62;
            root.scaling.setAll(k);
            root.position.set(disc.x, disc.y, disc.z - this.PLANET_D * 0.27);
            const meta = { fs: 'structure', structure: s.id, system: s.system, pos: s.area };
            root.metadata = meta;
            const main = view.material('struct-' + s.type, color);
            const dark = view.material('struct-metal', '#26313c');
            const trim = view.material('struct-trim-' + s.seat, color, { emissive: true });
            const light = view.material('struct-lights', '#8bdcf4', { emissive: true });
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
            const d = this.TILE / 2 - 14;
            const off = { N: [0, -d], S: [0, d], E: [d, 0], W: [-d, 0] }[storm.side] || [0, 0];
            const root = new BABYLON.TransformNode('fs-storm-' + storm.id, view.scene);
            root.position.set(p.x + off[0], h(p.x, p.y) + 6.5, p.y + off[1]);
            root.metadata = { fs: 'storm', system: storm.system, side: storm.side };
            const barrier = BABYLON.MeshBuilder.CreateBox('fs-storm-barrier-' + storm.id, {
                width: horizontal ? this.TILE - 20 : 6,
                depth: horizontal ? 6 : this.TILE - 20,
                height: 4,
            }, view.scene);
            barrier.parent = root; barrier.position.y = 2; barrier.material = view.material('storm-barrier', '#8b376f', { emissive: true });
            const core = BABYLON.MeshBuilder.CreateSphere('fs-storm-core-' + storm.id, { diameter: 17, segments: 12 }, view.scene);
            core.parent = root; core.position.y = 12; core.material = view.material('storm-core', '#57205f', { emissive: true });
            const ringA = BABYLON.MeshBuilder.CreateTorus('fs-storm-ring-a-' + storm.id, { diameter: 24, thickness: 1.6, tessellation: 24 }, view.scene);
            ringA.parent = root; ringA.position.y = 12; ringA.rotation.x = .78; ringA.material = view.material('storm-ring-a', '#eb6dc6', { emissive: true });
            const ringB = BABYLON.MeshBuilder.CreateTorus('fs-storm-ring-b-' + storm.id, { diameter: 29, thickness: 1, tessellation: 24 }, view.scene);
            ringB.parent = root; ringB.position.y = 12; ringB.rotation.z = .72; ringB.material = view.material('storm-ring-b', '#8aa5ff', { emissive: true });
            for (const mesh of [barrier, core, ringA, ringB]) { mesh.isPickable = false; mesh.metadata = root.metadata; }
            this.addMarker(view, root, 'prop');
            this.addAnimated(view, ringA, 'y', .8 + view.animated.length * .01);
            this.addAnimated(view, ringB, 'x', -.55 - view.animated.length * .01);
        }
        this.drawCombat(app, view, state);
    },

    // --- the battle table ------------------------------------------------------
    //
    // A fight is a different place: the board goes on under the camera and a table
    // rises above the contested sector. The miniatures that fight stand on it as
    // themselves — one stand per model, never one per side — the dice fly in from
    // over the map and stay where they landed, and the cards of the battle lie on
    // the table: the hand, the closed card in the middle and the cards that were
    // turned over. Nothing of it is written in a panel.
    drawCombat(app, view, state) {
        const c = state.combat;
        if (!view.flights) view.flights = new Map();
        if (!view.combatSeen) view.combatSeen = new Set();
        if (!c) { view.combatSeen.clear(); view.flights.clear(); view.arena = null; return; }
        const sys = state.systems.find(x => x.id === c.system);
        if (!sys) return;
        const A = this.ARENA;
        const h = (x, y) => app.location.terrain.heightAt(x, y);
        const tile = this.tilePos(app, sys, view.metrics);
        const area = sys.areas.find(a => a.pos === c.pos);
        const disc = area && area.world ? this.discAt(app, sys, c.pos, view.metrics) : null;
        const cx = disc ? disc.x : tile.x;
        const cz = disc ? disc.z : tile.y;
        const ground = h(cx, cz);
        const arena = { x: cx, y: ground + A.lift, z: cz, tilt: A.tilt, system: sys.id, pos: c.pos };
        view.arena = arena;
        const root = new BABYLON.TransformNode('fs-arena', view.scene);
        root.position.set(arena.x, arena.y, arena.z);
        root.rotation.x = arena.tilt;
        root.metadata = { fs: 'arena', system: sys.id, pos: c.pos };
        view.arenaRoot = root;
        this.addMarker(view, root, 'prop');
        // The column that holds the table over the sector.
        const column = BABYLON.MeshBuilder.CreateCylinder('fs-arena-column', {
            diameter: 16, height: A.lift + 4, tessellation: 12,
        }, view.scene);
        column.parent = root;
        column.position.set(0, -(A.lift + 4) / 2 + 1, 0);
        column.material = view.material('arena-column', '#1c2431', { emissive: true });
        column.isPickable = false;
        column.metadata = root.metadata;
        // The table itself, with a rim in the colour of each side.
        const top = BABYLON.MeshBuilder.CreateBox('fs-arena-top', { width: A.w, depth: A.d, height: 3 }, view.scene);
        top.parent = root;
        top.position.y = -1.6;
        top.material = view.material('arena-top', '#20293a', { emissive: true });
        top.isPickable = false;
        top.metadata = { fs: 'arena', system: sys.id, pos: c.pos };
        for (const side of [{ id: 'attacker', sign: 1 }, { id: 'defender', sign: -1 }]) {
            const seat = side.id === 'attacker' ? c.attacker : c.defender;
            const p = state.players[seat] || {};
            const color = p.color || this.factionColor(p.faction);
            const rim = BABYLON.MeshBuilder.CreateBox('fs-arena-rim-' + side.id, {
                width: A.w, depth: 4, height: 6,
            }, view.scene);
            rim.parent = root;
            rim.position.set(0, 0.4, side.sign * (A.d / 2));
            rim.material = view.material('arena-rim-' + side.id, color, { emissive: true });
            rim.isPickable = false;
            rim.metadata = { fs: 'arena', system: sys.id, pos: c.pos };
            // The name plate of the side: a strip of its colour, not a word in a panel.
            const plate = BABYLON.MeshBuilder.CreateBox('fs-arena-plate-' + side.id, {
                width: A.w * 0.42, depth: 2.4, height: 2.4,
            }, view.scene);
            plate.parent = root;
            plate.position.set(0, 2.2, side.sign * (A.d / 2 + 5));
            plate.material = view.material('arena-plate-' + side.id, color, { emissive: true });
            plate.isPickable = false;
            plate.metadata = rim.metadata;
        }
        const me = state.seat;
        const mySide = me === c.attacker ? 'attacker' : me === c.defender ? 'defender' : null;
        // The sides of the table: the attacker near the camera.
        for (const side of [{ id: 'attacker', sign: 1, seat: c.attacker }, { id: 'defender', sign: -1, seat: c.defender }]) {
            const p = state.players[side.seat] || {};
            const color = p.color || this.factionColor(p.faction);
            const zAt = k => side.sign * k;
            // The miniatures that really fight: one stand per model.
            const units = state.units.filter(u => u.system === c.system && u.area === c.pos && u.seat === side.seat);
            const n = Math.max(1, units.length);
            units.forEach((u, i) => {
                const def = typeof FS_RULES !== 'undefined' ? FS_RULES.unitOf(state, u) : null;
                const x = (i - (n - 1) / 2) * 22;
                const stand = new BABYLON.TransformNode('fs-arena-unit-' + side.id + '-' + i, view.scene);
                stand.parent = root;
                stand.position.set(x, 3.2, zAt(34));
                stand.metadata = { fs: 'unit', unit: u.id, system: c.system, pos: c.pos };
                const body = BABYLON.MeshBuilder.CreateCylinder('fs-arena-unit-body-' + side.id + '-' + i, {
                    diameter: 16, height: 4.6, tessellation: 20,
                }, view.scene);
                body.parent = stand;
                body.material = view.material('arena-unit-' + side.id, color, { emissive: true });
                body.isPickable = true;
                body.metadata = stand.metadata;
                const icon = BABYLON.MeshBuilder.CreatePlane('fs-arena-unit-icon-' + side.id + '-' + i, { size: 11 }, view.scene);
                icon.parent = stand;
                icon.position.y = 2.5;
                icon.rotation.x = -Math.PI / 2;
                const mat = new BABYLON.StandardMaterial('fs-arena-unit-mat-' + side.id + '-' + i, view.scene);
                const face = def && def.type === 'ship' ? 'mark.ship' : 'mark.ground';
                mat.diffuseTexture = this.iconTexture(view, face, '#f2ead8');
                mat.emissiveColor = BABYLON.Color3.FromHexString('#ffffff').scale(0.7);
                mat.diffuseTexture.hasAlpha = true;
                mat.opacityTexture = mat.diffuseTexture;
                mat.useAlphaFromDiffuseTexture = true;
                mat.backFaceCulling = false;
                icon.material = mat;
                icon.isPickable = true;
                icon.metadata = stand.metadata;
                // A routed model lies on its side: it still stands on the table.
                if (u.routed) stand.rotation.z = Math.PI / 2.6;
                this.addMarker(view, stand, 'actor');
            });
            // The dice of the side, thrown from over the map.
            const dice = c.dice[side.id] || [];
            const dn = Math.max(1, dice.length);
            dice.forEach((face, i) => {
                const x = (i - (dn - 1) / 2) * Math.min(24, A.w / (dn + 2));
                const root2 = new BABYLON.TransformNode('fs-die-' + side.id + '-' + i, view.scene);
                root2.parent = root;
                root2.position.set(x, A.die / 2 + 3.4, zAt(18));
                root2.rotation.y = (i * 1.7) % (Math.PI / 2);
                root2.metadata = { fs: 'die', system: c.system, pos: c.pos, side: side.id, face, index: i };
                const cube = BABYLON.MeshBuilder.CreateBox('fs-die-body-' + side.id + '-' + i, { size: A.die }, view.scene);
                cube.parent = root2;
                cube.material = view.material('die-body-' + (face || 'blank'), fsDieColor(face), { emissive: true });
                const faceMesh = BABYLON.MeshBuilder.CreateDisc('fs-die-face-' + side.id + '-' + i, {
                    radius: A.die * 0.46, tessellation: 18,
                }, view.scene);
                faceMesh.parent = root2;
                faceMesh.rotation.x = Math.PI / 2;
                faceMesh.position.y = A.die / 2 + 0.06;
                const mat = view.material('die-face-' + (face || 'blank'), '#f4ecd9');
                mat.diffuseTexture = this.dieTexture(view, face || 'blank');
                mat.opacityTexture = mat.diffuseTexture;
                mat.useAlphaFromDiffuseTexture = true;
                mat.backFaceCulling = false;
                faceMesh.material = mat;
                for (const mesh of [cube, faceMesh]) {
                    mesh.isPickable = true;
                    mesh.metadata = root2.metadata;
                }
                this.addMarker(view, root2, 'actor');
                const key = 'die:' + c.round + ':' + side.id + ':' + i + ':' + (face || 'blank');
                if (!view.combatSeen.has(key)) {
                    view.combatSeen.add(key);
                    // The die lands where it was put: the flight takes it there from
                    // over the map.
                    this.throwDie(view, root2, key, i, side.id, { x, y: A.die / 2 + 3.4, z: zAt(18) });
                } else {
                    const f = view.flights.get(key);
                    if (f) { f.node = root2; if (!f.done) this.placeFlight(root2, f); }
                }
            });
            // The cubes of the side: the attack and defence tokens of its cards and
            // the reinforcement tokens it spent.
            const tokens = (c.tokens && c.tokens[side.id]) || { att: 0, def: 0 };
            const cubes = [];
            for (let i = 0; i < (tokens.att || 0); i++) cubes.push('cube.att');
            for (let i = 0; i < (tokens.def || 0); i++) cubes.push('cube.def');
            const reinforce = Number((c.reinforce && c.reinforce[side.id]) || 0);
            for (let i = 0; i < reinforce; i++) cubes.push('token.morale');
            cubes.forEach((icon, i) => {
                const x = (i % 10 - 4.5) * 11;
                const z = zAt(9) + Math.floor(i / 10) * 9 * side.sign;
                const node = new BABYLON.TransformNode('fs-ctok-' + side.id + '-' + i, view.scene);
                node.parent = root;
                node.position.set(x, 3, z);
                node.metadata = { fs: 'token', system: c.system, pos: c.pos, side: side.id };
                const cube = BABYLON.MeshBuilder.CreateBox('fs-ctok-body-' + side.id + '-' + i, { size: 7.6 }, view.scene);
                cube.parent = node;
                cube.material = view.material('ctok-' + icon, icon.indexOf('att') > 0 ? '#c85a3f'
                    : icon.indexOf('def') > 0 ? '#4173ba' : '#c3a03c', { emissive: true });
                cube.isPickable = true;
                cube.metadata = node.metadata;
                this.addMarker(view, node, 'prop');
            });
            // The cards that were turned over in this battle lie open in a row.
            const played = (c.cards[side.id].played || []).slice(-6);
            played.forEach((entry, i) => {
                const x = (i - (played.length - 1) / 2) * (A.cardW + 5);
                const key = 'play:' + c.round + ':' + side.id + ':' + i + ':' + (entry.name || '');
                this.arenaCard(view, root, 'fs-card-played-' + side.id + '-' + i, x, zAt(48), entry.card, {
                    up: true, key, flipDelay: side.id === 'defender' ? 0.5 : 0, faction: p.faction,
                });
            });
            // The hand: the cards of the player who sits at this client are open,
            // the cards of the other side are closed.
            const hand = (c.cards[side.id].hand || []);
            const mine = side.id === mySide;
            const hw = Math.min(A.cardW, (A.w - 20) / Math.max(1, hand.length) - 4);
            hand.forEach((name, i) => {
                const x = (i - (hand.length - 1) / 2) * (hw + 5);
                const data = cardData(state, side.seat, name);
                this.arenaCard(view, root, 'fs-card-hand-' + side.id + '-' + i, x, zAt(60), data, {
                    up: mine, faction: p.faction, index: mine ? i : -1, side: side.id,
                });
            });
        }
        // The closed cards of both sides wait in the middle of the table.
        for (const side of [{ id: 'attacker', sign: -1 }, { id: 'defender', sign: 1 }]) {
            if (!(c.chosen && c.chosen[side.id])) continue;
            const p = state.players[side.id === 'attacker' ? c.attacker : c.defender] || {};
            const node = this.arenaCard(view, root, 'fs-card-staged-' + side.id, side.sign * 26, 0, null, {
                up: false, faction: p.faction,
            });
            if (node) node.metadata = { fs: 'gate', system: c.system, pos: c.pos };
        }
    },

    // One card of the table: the cardboard of a card, the printed face on one side
    // and the closed back on the other. A card that is turned over is animated: the
    // attacker's first, the defender's a moment later.
    arenaCard(view, root, name, x, z, card, opts) {
        const o = opts || {};
        const A = this.ARENA;
        const node = new BABYLON.TransformNode(name, view.scene);
        node.parent = root;
        node.position.set(x, 3.2, z);
        node.rotation.x = o.up ? 0 : Math.PI;
        const w = o.up ? A.cardW : A.cardW;
        const body = BABYLON.MeshBuilder.CreateBox(name + '-body', { width: w, depth: A.cardH, height: 1.2 }, view.scene);
        body.parent = node;
        body.material = view.material('card-edge', '#3a3226');
        body.isPickable = true;
        const face = BABYLON.MeshBuilder.CreatePlane(name + '-face', { width: w, height: A.cardH }, view.scene);
        face.parent = node;
        face.position.y = 0.66;
        face.rotation.x = -Math.PI / 2;
        face.material = this.cardMaterial(view, name + '-face', card && card.name
            ? this.cardTexture(view, card, { faction: o.faction })
            : this.cardBackTexture(view, this.factionColor(o.faction)));
        face.isPickable = true;
        const back = BABYLON.MeshBuilder.CreatePlane(name + '-back', { width: w, height: A.cardH }, view.scene);
        back.parent = node;
        back.position.y = -0.66;
        back.rotation.x = Math.PI / 2;
        back.material = this.cardMaterial(view, name + '-back', this.cardBackTexture(view, this.factionColor(o.faction)));
        back.isPickable = true;
        const meta = { fs: 'card', index: o.index == null ? -1 : o.index, side: o.side || null, name: o.up && card ? card.name : '' };
        for (const mesh of [body, face, back]) {
            mesh.metadata = meta;
            mesh.isPickable = meta.index >= 0;
        }
        node.metadata = meta;
        if (o.key) this.trackFlip(view, node, o.key, o.flipDelay);
        this.addMarker(view, node, 'prop');
        return node;
    },

    // The card that is turned over: it starts closed and opens on the table.
    trackFlip(view, node, key, delay) {
        if (!view.flights || !node) return;
        const running = view.flights.get(key);
        if (view.combatSeen.has(key)) {
            // The card was already turned over: a redraw keeps it open.
            if (running && !running.done) { running.node = node; node.rotation.x = running.from + (running.to - running.from) * Math.max(0, running.t); }
            else node.rotation.x = 0;
            return;
        }
        view.combatSeen.add(key);
        view.flights.set(key, { kind: 'flip', t: -(delay || 0), dur: 0.45, done: false, node, to: 0, from: Math.PI });
        node.rotation.x = Math.PI;
    },

    // A die is thrown across the map: it starts high over the board, far from the
    // table, turns in the air and lands on the cloth where it stays.
    throwDie(view, node, key, index, side, rest) {
        const A = this.ARENA;
        const back = side === 'defender' ? -1 : 1;
        const from = {
            x: -A.w * 1.5 - index * 26,
            y: 220 + (index % 4) * 18,
            z: back * (A.d * 1.4 + 120) + index * 14,
        };
        const to = rest || { x: 0, y: A.die / 2, z: 0 };
        const ctrl = { x: (from.x + to.x) * 0.5, y: 330 + index * 10, z: (from.z + to.z) * 0.5 };
        view.flights.set(key, {
            kind: 'die', t: 0, dur: 1.1, done: false, node, from, ctrl, to,
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
        // The last part of the flight is a small bounce on the cloth.
        const hop = t > 0.74 ? Math.sin((t - 0.74) / 0.26 * Math.PI) * 16 : 0;
        node.position.set(p.x, p.y + hop, p.z);
        const spin = f.spin * u;
        node.rotation.x = spin * 0.8;
        node.rotation.z = spin * 0.55;
        node.rotation.y = spin * 0.4;
    },

    // The flights and the flips of the battle, advanced once per frame.
    tweenTick(view) {
        if (!view.flights || !view.flights.size) return;
        let dt = 0.016;
        try { dt = Math.min(0.05, view.scene.getEngine().getDeltaTime() / 1000) || 0.016; } catch (e) { dt = 0.016; }
        for (const f of view.flights.values()) {
            if (f.done) continue;
            f.t = Math.min(1, f.t + dt / f.dur);
            if (f.t < 0) continue;
            const node = f.node;
            if (f.kind === 'flip') {
                if (node && node.rotation) node.rotation.x = f.from + (f.to - f.from) * f.t;
            } else if (node) {
                this.placeFlight(node, f);
            }
            if (f.t >= 1) {
                f.done = true;
                if (node && node.rotation) {
                    if (f.kind === 'flip') node.rotation.x = f.to;
                    else { node.rotation.x = 0; node.rotation.y = 0; node.rotation.z = 0; node.position.y = f.to.y; }
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

    // A material for a printed plane: one per texture, so a redraw of the table
    // does not leave a new material behind.
    cardMaterial(view, key, texture) {
        if (!view.cardMats) view.cardMats = new Map();
        const texName = texture && typeof texture.name === 'string' ? texture.name : 'plain';
        const tag = key + '|' + texName;
        if (view.cardMats.has(tag)) return view.cardMats.get(tag);
        const mat = new BABYLON.StandardMaterial('fs-card-mat-' + String(texName).replace(/[^a-z0-9-]/gi, '-'), view.scene);
        mat.diffuseTexture = texture;
        mat.specularColor = BABYLON.Color3.Black();
        mat.backFaceCulling = false;
        if (texture) {
            texture.hasAlpha = true;
            mat.opacityTexture = texture;
            if ('useAlphaFromDiffuseTexture' in mat) mat.useAlphaFromDiffuseTexture = true;
        }
        view.cardMats.set(tag, mat);
        return mat;
    },

    // The face of a die, drawn as the game draws it: a blazon, not a number.
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
            if (typeof FSIcons !== 'undefined') FSIcons.canvas(ctx, name, S / 2, S / 2, S * 0.8);
        }
        tex.update();
        view.dieTex.set(face, tex);
        return tex;
    },

    // The printed face of a combat card: its name, its cubes and its rules — on the
    // card itself, with real italics and real bold.
    cardTexture(view, card, opts) {
        if (!view.cardTex) view.cardTex = new Map();
        const o = opts || {};
        const color = this.factionColor(o.faction);
        const key = (card && card.name ? card.name : '?') + '|' + color;
        if (view.cardTex.has(key)) return view.cardTex.get(key);
        const W = 384, H = 538;
        const tex = new BABYLON.DynamicTexture('fs-card-' + key.replace(/[^a-z0-9а-яё]/gi, '-'), { width: W, height: H }, view.scene, true);
        tex.hasAlpha = true;
        const ctx = tex.getContext();
        if (ctx && card && typeof FSIcons !== 'undefined') FSIcons.cardFace(ctx, W, H, card, { color, faction: o.faction });
        tex.update();
        view.cardTex.set(key, tex);
        return tex;
    },

    cardBackTexture(view, color) {
        if (!view.cardBackTex) view.cardBackTex = new Map();
        if (view.cardBackTex.has(color)) return view.cardBackTex.get(color);
        const W = 384, H = 538;
        const tex = new BABYLON.DynamicTexture('fs-card-back-' + String(color).replace('#', ''), { width: W, height: H }, view.scene, true);
        tex.hasAlpha = true;
        const ctx = tex.getContext();
        if (ctx && typeof FSIcons !== 'undefined') FSIcons.cardBack(ctx, W, H, color);
        tex.update();
        view.cardBackTex.set(color, tex);
        return tex;
    },

    // Where the battle table stands, in the world: the camera flies here when the
    // fight begins and the panel has nothing to say about the place.
    arenaFocus(app, state) {
        const c = state.combat;
        if (!c) return null;
        const sys = state.systems.find(x => x.id === c.system);
        if (!sys) return null;
        const tile = this.tilePos(app, sys, null);
        const area = sys.areas.find(a => a.pos === c.pos);
        const disc = area && area.world ? this.discAt(app, sys, c.pos, null) : null;
        const x = disc ? disc.x : tile.x;
        const z = disc ? disc.z : tile.y;
        return { x, z, y: app.location.terrain.heightAt(x, z) + this.ARENA.lift };
    },

    // The markers of a void sector around each other.
    spread(count, index) {
        const a = count <= 1 ? Math.PI / 4 : index / count * Math.PI * 2;
        const r = 34;
        return { x: Math.cos(a) * r, y: Math.sin(a) * r };
    },

    // A cool-toned locator tracks the sector shown in the inspection card.
    showInspection(app, view, state, selected) {
        const ring = view.inspectionRing;
        if (!ring) return;
        if (!selected || !selected.system) { ring.setEnabled(false); return; }
        const system = state.systems.find(s => s.id === selected.system);
        if (!system) { ring.setEnabled(false); return; }
        const p = selected.pos
            ? this.areaPos(app, system, selected.pos, view.metrics)
            : this.tilePos(app, system, view.metrics);
        const y = app.location.terrain.heightAt(p.x, p.y) + 7.6;
        ring.position.set(p.x, y, p.y);
        ring.setEnabled(true);
    },

    clearInspection(view) {
        if (view && view.inspectionRing) view.inspectionRing.setEnabled(false);
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
