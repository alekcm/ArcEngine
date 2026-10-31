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

/** @satisfies {Record<string, any>} */
const FSView = {
    TILE: typeof FS_TILE_PX !== 'undefined' ? FS_TILE_PX : 220,   // world px of one system tile
    AREA: 0.46,            // the share of the tile an area takes
    MARKER_Y: 6,           // the height of the markers over the tile

    /** @param {{location: Location3D, camera: CameraController}} app */
    create(app) {
        const view = {
            app,
            scene: app.location.view.scene,
            tiles: new Map(),
            setupSlots: new Map(),      // system id -> { base, top, tex }
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
                for (const planet of view.planets.values()) {
                    planet.mesh.rotation.y += dt * 0.035;
                    planet.clouds.rotation.y -= dt * 0.022;
                }
                for (const item of view.animated) item.mesh.rotation[item.axis] += dt * item.speed;
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
        World3D.addObject(app.location.view, base, 'prop', { outline: false });
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
        World3D.addObject(app.location.view, top, 'prop', { outline: false });
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
        // The background of the tile.
        ctx.fillStyle = '#0d1620';
        ctx.fillRect(0, 0, S, S);
        // Four inset data panels give each area a printed, machined surface rather than a flat quadrant.
        for (const area of sys.areas) {
            const r = this.areaRect(area.pos);
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
                const assetGlyph = { forge: '⚒', cache: '▦', reinforcement: '✚', prosperity: '✧' };
                const assets = area.world.assets.map(asset => assetGlyph[asset] || asset).join('  ');
                if (assets) {
                    ctx.fillStyle = '#8fd5f2'; ctx.font = 'bold 14px system-ui, sans-serif';
                    ctx.fillText(assets, r.x + 16, r.y + 77);
                }
            } else {
                // A void: layered starfield with a few brighter navigational stars.
                ctx.fillStyle = '#080d14'; ctx.fillRect(r.x + 4, r.y + 4, r.w - 8, r.h - 8);
                let seed = sys.id.charCodeAt(3) * 31 + r.x + r.y * 3;
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
            const r = this.areaRect(area.pos);
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
        rec.tex.update();
    },

    // The metrics before the board is known — the middle of the location.
    areaRect(pos) {
        const S = 512, half = S / 2;
        const r = { TL: { x: 0, y: 0 }, TR: { x: half, y: 0 }, BL: { x: 0, y: half }, BR: { x: half, y: half } }[pos];
        return { x: r.x, y: r.y, w: half, h: half };
    },

    // The texture of an order token: the letter of the order (the colour is the owner).
    orderTexture(view, order) {
        if (!view.orderTex) view.orderTex = new Map();
        if (view.orderTex.has(order)) return view.orderTex.get(order);
        const tex = new BABYLON.DynamicTexture('fs-order-' + order, { width: 64, height: 64 }, view.scene, true);
        tex.hasAlpha = true;
        const ctx = tex.getContext();
        ctx.clearRect(0, 0, 64, 64);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 44px system-ui, sans-serif';
        // The letter is drawn by hand: the centre of the square is (32, 32).
        ctx.fillText({ advance: 'Н', deploy: 'Р', strategize: 'С', dominate: 'Д' }[order] || '?', 19, 47);
        tex.update();
        view.orderTex.set(order, tex);
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

    // A printed orbital cradle remains on the tile; the world itself is rendered as a lit 3D globe.
    drawPlanet(ctx, r, name) {
        const cx = r.x + r.w / 2, cy = r.y + r.h / 2 - 7;
        const radius = Math.min(r.w, r.h) * .30;
        ctx.save();
        ctx.strokeStyle = 'rgba(94,174,207,.55)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(cx, cy + 11, radius + 12, radius * .31, -.14, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = 'rgba(212,177,104,.42)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(cx, cy + 11, radius + 18, radius * .40, -.14, Math.PI * .96, Math.PI * 2.05); ctx.stroke();
        ctx.fillStyle = 'rgba(2,8,16,.62)'; ctx.beginPath(); ctx.ellipse(cx, cy + 12, radius * .78, radius * .22, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    },

    planetMaterial(view, name) {
        if (view.planetMaterials.has(name)) return view.planetMaterials.get(name);
        let seed = 0;
        for (let i = 0; i < name.length; i++) seed = (seed * 31 + name.charCodeAt(i)) >>> 0;
        const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
        const gas = /gas|jupiter|saturn|tempest|vigilus|shroud/i.test(name);
        const ice = /fenris|ice|frost|crucible|cadia/i.test(name);
        const ocean = /macragge|ultramar|aurelia|mundo|prandium|caliban|terra|earth/i.test(name);
        const texture = new BABYLON.DynamicTexture('fs-planet-map-' + name, { width: 512, height: 256 }, view.scene, true);
        texture.hasAlpha = false;
        const ctx = /** @type {any} */ (texture.getContext());
        const gradient = ctx.createLinearGradient(0, 0, 0, 256);
        gradient.addColorStop(0, '#152d42'); gradient.addColorStop(.18, this.worldColor(name));
        gradient.addColorStop(.72, this.worldColor(name)); gradient.addColorStop(1, '#07101b');
        ctx.fillStyle = gradient; ctx.fillRect(0, 0, 512, 256);
        // Deterministic continents / cloud bands in equirectangular projection. No remote assets,
        // and each named world gets its own persistent map and atmosphere tint.
        for (let i = 0; i < 28; i++) {
            const x = rand() * 512, y = 26 + rand() * 204;
            const rx = 9 + rand() * (gas ? 90 : 54), ry = 4 + rand() * (gas ? 16 : 26);
            ctx.globalAlpha = gas ? .16 + rand() * .18 : .24 + rand() * .34;
            ctx.fillStyle = gas ? (rand() > .5 ? '#e9b77c' : '#6d4c6e')
                : ice ? (rand() > .5 ? '#e9f3f3' : '#8ba9b9')
                    : ocean ? (rand() > .46 ? '#70a577' : '#c7ae78')
                        : (rand() > .48 ? '#b68b60' : '#464953');
            ctx.beginPath(); ctx.ellipse(x, y, rx, ry, (rand() - .5) * .8, 0, Math.PI * 2); ctx.fill();
        }
        for (let i = 0; i < 48; i++) {
            const y = 18 + rand() * 220;
            ctx.globalAlpha = .06 + rand() * .13;
            ctx.strokeStyle = gas ? '#ffe0aa' : '#e2f1f4';
            ctx.lineWidth = 1 + rand() * 5;
            ctx.beginPath(); ctx.moveTo(0, y); ctx.bezierCurveTo(140, y - 16, 360, y + 18, 512, y - 4); ctx.stroke();
        }
        ctx.globalAlpha = 1;
        texture.update(false);
        const surface = new BABYLON.StandardMaterial('fs-planet-surface-' + name, view.scene);
        surface.diffuseTexture = texture;
        surface.specularColor = new BABYLON.Color3(.52, .58, .68);
        surface.specularPower = 52;
        const cloudsTex = new BABYLON.DynamicTexture('fs-planet-clouds-' + name, { width: 512, height: 256 }, view.scene, true);
        cloudsTex.hasAlpha = true;
        const cc = /** @type {any} */ (cloudsTex.getContext()); cc.clearRect(0, 0, 512, 256);
        for (let i = 0; i < 36; i++) {
            cc.globalAlpha = .06 + rand() * .17; cc.strokeStyle = '#d7f3ff'; cc.lineWidth = 1 + rand() * 4;
            const y = 22 + rand() * 212;
            cc.beginPath(); cc.moveTo(0, y); cc.bezierCurveTo(110, y - 12, 330, y + 12, 512, y - 3); cc.stroke();
        }
        cc.globalAlpha = 1; cloudsTex.update(false);
        const cloudsMat = new BABYLON.StandardMaterial('fs-planet-cloud-mat-' + name, view.scene);
        cloudsMat.diffuseTexture = cloudsTex; cloudsMat.opacityTexture = cloudsTex;
        cloudsMat.useAlphaFromDiffuseTexture = true; cloudsMat.alpha = .58;
        cloudsMat.backFaceCulling = false; cloudsMat.disableLighting = true;
        const atmosphereMat = new BABYLON.StandardMaterial('fs-planet-atmosphere-' + name, view.scene);
        atmosphereMat.diffuseColor = new BABYLON.Color3(.12, .48, .72);
        atmosphereMat.emissiveColor = new BABYLON.Color3(.045, .19, .31);
        atmosphereMat.alpha = .14; atmosphereMat.backFaceCulling = false; atmosphereMat.disableLighting = true;
        const orbitMat = new BABYLON.StandardMaterial('fs-planet-orbit-' + name, view.scene);
        orbitMat.diffuseColor = new BABYLON.Color3(.24, .61, .78); orbitMat.emissiveColor = new BABYLON.Color3(.04, .16, .22);
        view.planetMaterials.set(name, { surface, clouds: cloudsMat, atmosphere: atmosphereMat, orbit: orbitMat });
        return view.planetMaterials.get(name);
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
                const diameter = 40;
                const mesh = BABYLON.MeshBuilder.CreateSphere('fs-world-' + key, { diameter, segments: 32 }, view.scene);
                mesh.material = mats.surface; mesh.isPickable = true;
                const metadata = { fs: 'area', system: sys.id, pos: area.pos, world: name };
                mesh.metadata = metadata;
                World3D.addObject(app.location.view, mesh, 'prop', { castShadow: true, ink: false, outline: false });
                mesh.metadata = Object.assign({}, mesh.metadata, metadata);
                const clouds = BABYLON.MeshBuilder.CreateSphere('fs-world-clouds-' + key, { diameter: diameter * 1.025, segments: 24 }, view.scene);
                clouds.material = mats.clouds; clouds.isPickable = false;
                World3D.addObject(app.location.view, clouds, 'prop', { castShadow: false, ink: false, outline: false });
                const atmosphere = BABYLON.MeshBuilder.CreateSphere('fs-world-halo-' + key, { diameter: diameter * 1.09, segments: 20 }, view.scene);
                atmosphere.material = mats.atmosphere; atmosphere.isPickable = false;
                World3D.addObject(app.location.view, atmosphere, 'prop', { castShadow: false, ink: false, outline: false });
                const orbit = BABYLON.MeshBuilder.CreateTorus('fs-world-orbit-' + key, { diameter: diameter * 1.48, thickness: .8, tessellation: 48 }, view.scene);
                orbit.material = mats.orbit; orbit.isPickable = false;
                World3D.addObject(app.location.view, orbit, 'prop', { castShadow: false, ink: false, outline: false });
                planet = { mesh, clouds, atmosphere, orbit };
                view.planets.set(key, planet);
            }
            const p = this.areaPos(app, sys, area.pos, view.metrics);
            const y = ground(p.x, p.y) + 6.5 + 18;
            for (const layer of [planet.mesh, planet.clouds, planet.atmosphere, planet.orbit]) layer.position.set(p.x, y, p.y);
            planet.mesh.metadata = Object.assign({}, planet.mesh.metadata, { fs: 'area', system: sys.id, pos: area.pos, world: name });
            planet.mesh.isPickable = true;
        }
        for (const [key, planet] of view.planets) if (!active.has(key)) {
            planet.mesh.setEnabled(false); planet.clouds.setEnabled(false); planet.atmosphere.setEnabled(false); planet.orbit.setEnabled(false);
        }
        for (const key of active) {
            const p = view.planets.get(key);
            p.mesh.setEnabled(true); p.clouds.setEnabled(true); p.atmosphere.setEnabled(true); p.orbit.setEnabled(true);
        }
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

    // --- the markers --------------------------------------------------------

    clearMarkers(view) {
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

    addFactionUnit(view, unit, pos, offset, color, unitType) {
        const model = this.factionModel(view, unit.faction, unitType);
        if (!model) return null;
        const metadata = { fs: 'unit', unit: unit.id, system: unit.system, pos: unit.area };
        if (unitType === 'ground') {
            const base = BABYLON.MeshBuilder.CreateCylinder('fs-unit-base-' + unit.id, { diameter: 30, height: 3.5, tessellation: 32 }, view.scene);
            base.position.set(pos.x + offset.x, pos.y - 1.75, pos.z + offset.y);
            base.material = view.material('mini-base', '#121a22'); base.isPickable = true; base.metadata = metadata;
            this.addMarker(view, base, 'prop');
            const rim = BABYLON.MeshBuilder.CreateTorus('fs-unit-rim-' + unit.id, { diameter: 30, thickness: 1.2, tessellation: 32 }, view.scene);
            rim.position.set(pos.x + offset.x, pos.y + .35, pos.z + offset.y);
            rim.material = view.material('mini-rim-' + unit.seat, color, { emissive: true });
            rim.isPickable = false; this.addMarker(view, rim, 'prop');
        }
        const holder = new BABYLON.TransformNode('fs-unit-model-' + unit.id, view.scene);
        holder.position.set(pos.x + offset.x + model.root.position.x, pos.y + model.root.position.y, pos.z + offset.y + model.root.position.z);
        holder.scaling.copyFrom(model.root.scaling);
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
            const p = this.areaPos(app, sys, pos, view.metrics);
            list.forEach((u, i) => {
                const owner = state.players.find(p2 => p2.seat === u.seat);
                const color = (owner && owner.color) || this.factionColor(owner ? owner.faction : '');
                const off = this.spread(list.length, i);
                const base = { x: p.x, y: h(p.x, p.y) + 4 + this.MARKER_Y, z: p.y };
                const def = FS_RULES.unitOf(state, u);
                if (def && !u.routed && this.addFactionUnit(view, u, base, off, color, def.type)) return;
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
        // Structures are small tabletop miniatures rather than single placeholder primitives.
        for (const s of state.structures) {
            const sys = state.systems.find(x => x.id === s.system);
            if (!sys) continue;
            const p = this.areaPos(app, sys, s.area, view.metrics);
            const owner = state.players.find(p2 => p2.seat === s.seat);
            const color = (owner && owner.color) || this.factionColor(owner ? owner.faction : '');
            const root = new BABYLON.TransformNode('fs-structure-' + s.id, view.scene);
            root.position.set(p.x - 34, h(p.x, p.y) + 6.5, p.y - 34);
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
            root.position.set(p.x + 34, h(p.x, p.y) + 6.5, p.y + 34);
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
        // The order tokens in the hexes of the tiles.
        for (const sys of state.systems) {
            if (!sys.tokens.length) continue;
            const p = this.tilePos(app, sys, view.metrics);
            sys.tokens.forEach((tok, i) => {
                const mesh = BABYLON.MeshBuilder.CreateBox('fs-tok' + sys.id + i, { width: 30, depth: 30, height: 5 }, view.scene);
                mesh.position.set(p.x + (i % 3 - 1) * 24, h(p.x, p.y) + 9 + this.MARKER_Y + Math.floor(i / 3) * 6, p.y);
                const owner = state.players.find(p2 => p2.seat === tok.seat);
                const color = (owner && owner.color) || this.factionColor(owner ? owner.faction : '');
                // The letter of the order on the colour of the player.
                const mat = view.material('tok' + tok.order + tok.seat, color);
                mat.diffuseTexture = this.orderTexture(view, tok.order);
                mat.opacityTexture = mat.diffuseTexture;
                mat.useAlphaFromDiffuseTexture = true;
                mesh.material = mat;
                mesh.isPickable = false;
                this.addMarker(view, mesh, 'actor');
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
    },

    // The markers of one area around each other.
    spread(count, index) {
        // Keep miniatures on the orbital landing ring, clear of the 3D world in the area's centre.
        const a = count <= 1 ? Math.PI / 4 : index / count * Math.PI * 2;
        const r = 38;
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

    // What is under the pointer.
    pickAt(app, view, px, py) {
        const scene = view.scene;
        const pick = scene.pick(px, py, mesh => !!mesh.metadata && mesh.metadata.fs);
        if (!pick || !pick.hit || !pick.pickedMesh) return null;
        return pick.pickedMesh.metadata;
    },
};
