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
            tiles: new Map(),      // system id -> { base, top, tex }
            markers: [],
            highlights: [],
            materials: new Map(),
            built: false,
        };

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
            World3D.addObject(app.location.view, ring, 'prop', { castShadow: false });
            view.highlights.push(ring);
        }

        return view;
    },

    // The world position of the centre of a system tile.
    tilePos(app, sys, metrics) {
        const m = metrics || view_metrics_fallback(app);
        return {
            x: m.originX + sys.col * this.TILE + (sys.row % 2 === 1 ? this.TILE / 2 : 0),
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
        World3D.addObject(app.location.view, base, 'prop');
        base.isPickable = true;
        base.metadata = { fs: 'system', system: sys.id };

        const tex = new BABYLON.DynamicTexture('fs-tex-' + sys.id, { width: 512, height: 512 }, view.scene, true);
        tex.hasAlpha = false;
        const mat = new BABYLON.StandardMaterial('fs-tile-mat-' + sys.id, view.scene);
        mat.diffuseTexture = tex;
        mat.specularColor = new BABYLON.Color3(0, 0, 0);
        const top = BABYLON.MeshBuilder.CreateGround('fs-top-' + sys.id, { width: this.TILE - 6, height: this.TILE - 6 }, view.scene);
        top.position.set(p.x, h + 6.5, p.y);
        top.material = mat;
        World3D.addObject(app.location.view, top, 'prop');
        top.isPickable = true;
        top.metadata = { fs: 'system', system: sys.id };

        const rec = { base, top, tex, mat, drawn: '' };
        view.tiles.set(sys.id, rec);
        return rec;
    },

    // The texture of a tile: the areas, the worlds and their values.
    drawTile(view, sys, tile) {
        const rec = view.tiles.get(sys.id);
        const ctx = rec.tex.getContext();
        const S = 512;
        ctx.clearRect(0, 0, S, S);
        // The background of the tile.
        ctx.fillStyle = '#0d1620';
        ctx.fillRect(0, 0, S, S);
        // The four areas.
        for (const area of sys.areas) {
            const r = this.areaRect(area.pos);
            if (area.world) {
                const g = ctx.createRadialGradient(r.x + r.w / 2, r.y + r.h / 2, 10, r.x + r.w / 2, r.y + r.h / 2, r.w / 2);
                g.addColorStop(0, this.worldColor(area.world.name));
                g.addColorStop(1, '#101820');
                ctx.fillStyle = g;
                ctx.beginPath();
                ctx.arc(r.x + r.w / 2, r.y + r.h / 2, r.w / 2 - 14, 0, Math.PI * 2);
                ctx.fill();
                // The name of the world.
                ctx.fillStyle = '#e8f1f7';
                ctx.font = 'bold 22px system-ui, sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(area.world.name, r.x + r.w / 2, r.y + r.h - 26);
                // The space of an objective token is marked with a gold ring.
                if (area.world.objective) {
                    ctx.strokeStyle = '#c9a227';
                    ctx.lineWidth = 5;
                    ctx.beginPath();
                    ctx.arc(r.x + r.w / 2, r.y + r.h / 2, r.w / 2 - 20, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.lineWidth = 4;
                }
                // The values: materiel, capacity and the asset icons.
                ctx.font = '18px system-ui, sans-serif';
                ctx.fillStyle = '#a8d08a';
                ctx.textAlign = 'left';
                ctx.fillText('M' + area.world.materiel, r.x + 16, r.y + 30);
                ctx.fillStyle = '#d8c9a8';
                ctx.fillText('V' + area.world.capacity, r.x + 16, r.y + 56);
                ctx.fillStyle = '#7fc7ff';
                ctx.font = '15px system-ui, sans-serif';
                ctx.fillText(area.world.assets.join(','), r.x + 16, r.y + 80);
            } else {
                // A void: a star field.
                ctx.fillStyle = '#080d14';
                ctx.fillRect(r.x, r.y, r.w, r.h);
                ctx.fillStyle = '#8fa8bd';
                let seed = sys.id.charCodeAt(3) * 31 + this.areaRect(area.pos).x;
                for (let i = 0; i < 26; i++) {
                    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
                    const x = r.x + 8 + (seed % (r.w - 16));
                    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
                    const y = r.y + 8 + (seed % (r.h - 16));
                    ctx.fillRect(x, y, 2, 2);
                }
            }
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
        return 'hsl(' + hue + ', 42%, 42%)';
    },

    // --- the markers --------------------------------------------------------

    clearMarkers(view) {
        for (const m of view.markers) {
            // removeObject disposes the mesh with its children.
            World3D.removeObject(view.app.location.view, m.mesh);
        }
        view.markers = [];
    },

    addMarker(view, mesh, kind) {
        World3D.addObject(view.app.location.view, mesh, kind || 'actor');
        view.markers.push({ mesh });
        return mesh;
    },

    // The metrics of the board: where the tiles stand and where the middle is.
    measure(app, view, state) {
        const raw = sys => ({
            x: sys.col * this.TILE + (sys.row % 2 === 1 ? this.TILE / 2 : 0),
            y: sys.row * this.TILE,
        });
        const pts = state.systems.map(raw);
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const p of pts) {
            minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x + this.TILE);
            minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y + this.TILE);
        }
        if (!pts.length) { view.metrics = null; return; }
        const originX = (app.location.width - (maxX - minX)) / 2 - minX;
        const originY = (app.location.height - (maxY - minY)) / 2 - minY;
        view.metrics = {
            originX, originY,
            cx: originX + (minX + maxX) / 2,
            cy: originY + (minY + maxY) / 2,
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
            const key = sys.areas.map(a => (a.world ? a.world.name + a.world.materiel + a.world.capacity + a.world.assets.join('') : '-')).join('|');
            if (rec.drawn !== key) {
                rec.drawn = key;
                this.drawTile(view, sys, rec);
            }
        }
        // The markers.
        this.clearMarkers(view);
        const h = app.location.terrain.heightAt;
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
                const mesh = BABYLON.MeshBuilder.CreateCylinder('fs-u' + u.id, { diameter: 26, height: 12, tessellation: 12 }, view.scene);
                const off = this.spread(list.length, i);
                mesh.position.set(p.x + off.x, h(p.x, p.y) + 8 + this.MARKER_Y, p.y + off.y);
                mesh.material = view.material('unit' + u.seat, color, u.routed ? { alpha: 0.55 } : null);
                if (u.routed) mesh.rotation.z = Math.PI / 2;   // a routed unit lies on its side
                mesh.isPickable = true;
                mesh.metadata = { fs: 'unit', unit: u.id, system: sysId, pos };
                this.addMarker(view, mesh, 'actor');
            });
        }
        // The structures.
        for (const s of state.structures) {
            const sys = state.systems.find(x => x.id === s.system);
            if (!sys) continue;
            const p = this.areaPos(app, sys, s.area, view.metrics);
            const owner = state.players.find(p2 => p2.seat === s.seat);
            const color = (owner && owner.color) || this.factionColor(owner ? owner.faction : '');
            // The kind of the structure is the shape, the colour is the owner.
            const mesh = s.type === 'factory'
                ? BABYLON.MeshBuilder.CreateCylinder('fs-s' + s.id, { diameter: 22, height: 26, tessellation: 8 }, view.scene)
                : BABYLON.MeshBuilder.CreateBox('fs-s' + s.id, { width: 26, depth: 26, height: s.type === 'bastion' ? 30 : 14 }, view.scene);
            mesh.position.set(p.x - 34, h(p.x, p.y) + 10 + this.MARKER_Y + (s.type === 'bastion' ? 8 : 0), p.y - 34);
            mesh.material = view.material('struct' + s.seat + s.type, color);
            mesh.isPickable = true;
            mesh.metadata = { fs: 'structure', structure: s.id, system: s.system, pos: s.area };
            this.addMarker(view, mesh, 'actor');
        }
        // The objective tokens.
        for (const o of state.objectives) {
            if (o.taken) continue;                  // the token is already in the play area
            const sys = state.systems.find(x => x.id === o.system);
            if (!sys) continue;
            const p = this.areaPos(app, sys, o.area, view.metrics);
            const mesh = BABYLON.MeshBuilder.CreateCylinder('fs-o' + o.id, { diameter: 16, height: 5, tessellation: 10 }, view.scene);
            mesh.position.set(p.x + 34, h(p.x, p.y) + 8 + this.MARKER_Y, p.y + 34);
            mesh.material = view.material('obj' + o.faction, this.factionColor(o.faction));
            mesh.isPickable = false;
            this.addMarker(view, mesh, 'prop');
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
        // The warp storms on the edges.
        for (const storm of state.storms) {
            const sys = state.systems.find(x => x.id === storm.system);
            if (!sys) continue;
            const p = this.tilePos(app, sys, view.metrics);
            const vertical = storm.side === 'N' || storm.side === 'S';
            const mesh = BABYLON.MeshBuilder.CreateBox('fs-storm' + storm.id, {
                width: vertical ? 8 : this.TILE - 20,
                depth: vertical ? this.TILE - 20 : 8,
                height: 6,
            }, view.scene);
            const d = this.TILE / 2 - 14;
            const off = { N: [0, -d], S: [0, d], E: [d, 0], W: [-d, 0] }[storm.side] || [0, 0];
            mesh.position.set(p.x + off[0], h(p.x, p.y) + 10 + this.MARKER_Y, p.y + off[1]);
            mesh.material = view.material('storm', '#e05fa8', { emissive: true });
            mesh.isPickable = false;
            this.addMarker(view, mesh, 'prop');
        }
    },

    // The markers of one area around each other.
    spread(count, index) {
        if (count <= 1) return { x: 0, y: 0 };
        const a = index / count * Math.PI * 2;
        const r = 30;
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

    // What is under the pointer.
    pickAt(app, view, px, py) {
        const scene = view.scene;
        const pick = scene.pick(px, py, mesh => !!mesh.metadata && mesh.metadata.fs);
        if (!pick || !pick.hit || !pick.pickedMesh) return null;
        return pick.pickedMesh.metadata;
    },
};
