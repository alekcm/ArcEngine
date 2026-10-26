// scene3d.js — the 3D board: ship rooms as open low-poly locations, corridors, doors, markers,
// intruders and characters. Reads a per-player view (shared/view.mjs) and renders it.

import { buildCharacter, buildIntruder, flatMat } from './characters.js';

const B = () => window.BABYLON;
const SCALE = 0.1;                 // board units -> world units
const ROOM_R = 4.6;                // hex platform radius
const KIND_COLORS = {
    slot1: '#28343f', slot2: '#2c3b36', cockpit: '#2a3a52', hibernatorium: '#3a2f4e', engine: '#4a3222',
};
const TILE_ACCENT = {
    archives: '#4aa3df', comms: '#4aa3df', emergency: '#4fcf7a', evacA: '#e05252', evacB: '#e05252', fireControl: '#f1c40f', generator: '#f1c40f',
    laboratory: '#4fcf7a', nest: '#b26bd6', surgery: '#4fcf7a', repository: '#e05252', airlock: '#e05252', armory: '#e05252', cafeteria: '#4fcf7a',
    commandCenter: '#f1c40f', containment: '#4fcf7a', contaminated: '#9cff3b', decon: '#4fcf7a', engineRoom: '#f1c40f', hatchControl: '#e05252',
    server: '#f1c40f', storage: '#f1c40f', cockpit: '#4aa3df', hibernatorium: '#b26bd6', engine: '#ffb347',
};

export class Scene3D {
    constructor(canvas, callbacks) {
        this.canvas = canvas; this.cb = callbacks || {};
        this.engine = new (B().Engine)(canvas, true, { antialias: true, stencil: false, preserveDrawingBuffer: false });
        this.scene = new (B().Scene)(this.engine);
        this.scene.clearColor = new (B().Color4)(0.025, 0.035, 0.055, 1);
        this.scene.fogMode = B().Scene.FOGMODE_EXP2; this.scene.fogDensity = 0.0035; this.scene.fogColor = new (B().Color3)(0.03, 0.04, 0.07);
        this.scene.ambientColor = new (B().Color3)(0.25, 0.28, 0.33);
        const cam = new (B().ArcRotateCamera)('cam', -Math.PI / 4, 0.95, 90, new (B().Vector3)(0, 0, 0), this.scene);
        cam.lowerBetaLimit = 0.45; cam.upperBetaLimit = 1.25; cam.lowerRadiusLimit = 18; cam.upperRadiusLimit = 160;
        cam.panningSensibility = 40; cam.wheelPrecision = 6; cam.angularSensibilityX = 1500; cam.angularSensibilityY = 1500;
        cam.attachControl(canvas, true);
        cam.panningAxis = new (B().Vector3)(1, 0, 1);
        cam.inputs.attached.pointers.buttons = [0, 1, 2];
        this.camera = cam;
        const hemi = new (B().HemisphericLight)('h', new (B().Vector3)(0.2, 1, 0.1), this.scene);
        hemi.intensity = 0.65; hemi.groundColor = new (B().Color3)(0.15, 0.13, 0.2);
        const sun = new (B().DirectionalLight)('sun', new (B().Vector3)(-0.6, -1, 0.4), this.scene);
        sun.intensity = 0.9; sun.position = new (B().Vector3)(40, 80, -30);
        this.shadows = new (B().ShadowGenerator)(2048, sun);
        this.shadows.usePercentageCloserFiltering = true; this.shadows.darkness = 0.45;
        this.roomNodes = {}; this.corridorNodes = {}; this.dynamic = []; this.chars = {}; this.intr = {};
        this.glow = new (B().GlowLayer)('glow', this.scene, { blurKernelSize: 48 }); this.glow.intensity = 0.55;
        this.shipKey = null; this.selectable = new Set(); this.hover = null; this.t = 0;
        this.stars();
        this.scene.onPointerObservable.add(pi => this.onPointer(pi));
        this.engine.runRenderLoop(() => { this.t += this.engine.getDeltaTime() / 1000; this.animate(); this.scene.render(); });
        window.addEventListener('resize', () => this.engine.resize());
    }

    stars() {
        const pts = [];
        for (let i = 0; i < 700; i++) pts.push(new (B().Vector3)((Math.random() - 0.5) * 600, -60 - Math.random() * 200, (Math.random() - 0.5) * 600));
        const pcs = new (B().PointsCloudSystem)('stars', 1, this.scene);
        pcs.addPoints(pts.length, (p, i) => { p.position = pts[i]; p.color = new (B().Color4)(0.8, 0.85, 1, 0.8); });
        pcs.buildMeshAsync().then(m => { m.isPickable = false; });
        const deck = B().MeshBuilder.CreateGround('deck', { width: 400, height: 400 }, this.scene);
        deck.position.y = -0.6; deck.material = flatMat(this.scene, '#0a0e14'); deck.receiveShadows = true; deck.isPickable = false;
    }

    // ---------------------------------------------------------------------------------------
    // Static ship
    // ---------------------------------------------------------------------------------------
    buildShip(ship) {
        const key = ship.mode + ':' + Object.keys(ship.rooms).join(',') + ':' + Object.values(ship.rooms).map(r => r.x + '/' + r.y).join(',');
        if (key === this.shipKey) return;
        this.shipKey = key;
        for (const n of Object.values(this.roomNodes)) n.root.dispose();
        for (const n of Object.values(this.corridorNodes)) n.root.dispose();
        this.roomNodes = {}; this.corridorNodes = {};
        const b = ship.bounds; this.cx = (b.minX + b.maxX) / 2; this.cy = (b.minY + b.maxY) / 2;
        this.camera.target.set(0, 0, 0);
        this.camera.radius = Math.max(60, (b.maxX - b.minX) * SCALE * 0.8);
        this.shipRooms = ship.rooms;
        for (const r of Object.values(ship.rooms)) this.buildRoom(r);
        for (const c of Object.values(ship.corridors)) this.buildCorridor(ship, c);
    }
    pos(r) { return new (B().Vector3)((r.x - this.cx) * SCALE, 0, -(r.y - this.cy) * SCALE); }


    // Perimeter ring radius (inside the hex platform) and wall height.
    static get WALL_R() { return 3.95; }
    static get WALL_H() { return 1.35; }

    /** Merge a list of static meshes (grouped by material) into few draw calls. */
    mergeStatic(meshes, parent) {
        const groups = new Map();
        for (const m of meshes) { const k = m.material ? m.material.uniqueId : 0; (groups.get(k) || groups.set(k, []).get(k)).push(m); }
        const out = [];
        for (const arr of groups.values()) {
            if (arr.length === 1) { arr[0].parent = parent; out.push(arr[0]); continue; }
            const mat = arr[0].material;
            const merged = B().Mesh.MergeMeshes(arr, true, true, undefined, false, false);
            if (merged) { merged.material = mat; merged.parent = parent; merged.isPickable = false; merged.receiveShadows = true; this.shadows.addShadowCaster(merged); out.push(merged); }
        }
        return out;
    }

    buildRoom(r) {
        const S = this.scene;
        const root = new (B().TransformNode)('room_' + r.id, S);
        root.position = this.pos(r);
        const WR = Scene3D.WALL_R, WH = Scene3D.WALL_H;
        const M = (hex, e, extra) => flatMat(S, hex, Object.assign(e ? { emissive: e } : {}, extra || {}));
        const plat = B().MeshBuilder.CreateCylinder('plat_' + r.id, { diameter: ROOM_R * 2, height: 0.5, tessellation: 6 }, S);
        plat.parent = root; plat.position.y = -0.25; plat.material = M(KIND_COLORS[r.kind] || '#2a3440');
        plat.convertToFlatShadedMesh(); plat.receiveShadows = true;
        plat.metadata = { roomId: r.id }; plat.isPickable = true;
        const sel = B().MeshBuilder.CreateTorus('sel_' + r.id, { diameter: ROOM_R * 2 + 0.6, thickness: 0.35, tessellation: 6 }, S);
        sel.parent = root; sel.position.y = 0.05; sel.material = M('#ffb347', 1); sel.isPickable = false; sel.setEnabled(false);

        // --- floor plates (grid clipped to the wall circle) ---
        const statics = [];
        const tileMatA = M('#36414d'), tileMatB = M('#3c4855'), gapMat = M('#161b21');
        const floorBase = B().MeshBuilder.CreateCylinder('fb', { diameter: WR * 2 + 0.3, height: 0.08, tessellation: 24 }, S);
        floorBase.position.y = 0.0; floorBase.material = gapMat; statics.push(floorBase);
        const T = 1.0;
        for (let gx = -4; gx <= 4; gx++) for (let gz = -4; gz <= 4; gz++) {
            const x = gx * T, z = gz * T;
            if (Math.hypot(x, z) > WR - 0.55) continue;
            const t = B().MeshBuilder.CreateBox('ft', { width: T - 0.08, height: 0.06, depth: T - 0.08 }, S);
            t.position.set(x, 0.07, z); t.material = (gx + gz) % 2 ? tileMatA : tileMatB; statics.push(t);
        }
        // --- walls: ring of segments with gaps at the exits; door portals in the gaps ---
        const exitAngles = r.exits.map(e => { const o = this.pos(this.shipRooms[e.to]).subtract(root.position); return Math.atan2(o.x, o.z); });
        const GAP = 0.34; // half-angle of a door gap
        const N = 42;
        const wallMat = M('#59697b'), wallDark = M('#3e4b59'), trimMat = M('#aab6c2');
        const stripMat = M('#7fd8ff', 0.9);
        const inGap = a => exitAngles.some(ea => Math.abs(Math.atan2(Math.sin(a - ea), Math.cos(a - ea))) < GAP);
        for (let i = 0; i < N; i++) {
            const a = (i + 0.5) / N * Math.PI * 2;
            if (inGap(a)) continue;
            const segLen = 2 * Math.PI * WR / N + 0.02;
            const x = Math.sin(a) * WR, z = Math.cos(a) * WR;
            const w = B().MeshBuilder.CreateBox('w', { width: segLen, height: WH, depth: 0.22 }, S);
            w.position.set(x, WH / 2, z); w.rotation.y = a; w.material = i % 3 === 0 ? wallDark : wallMat; statics.push(w);
            // inset panel line + top trim + light strip
            const p = B().MeshBuilder.CreateBox('wp', { width: segLen * 0.7, height: WH * 0.45, depth: 0.05 }, S);
            p.position.set(Math.sin(a) * (WR - 0.12), WH * 0.5, Math.cos(a) * (WR - 0.12)); p.rotation.y = a; p.material = wallDark; statics.push(p);
            const tr = B().MeshBuilder.CreateBox('wt', { width: segLen, height: 0.1, depth: 0.3 }, S);
            tr.position.set(x, WH + 0.03, z); tr.rotation.y = a; tr.material = trimMat; statics.push(tr);
            const st = B().MeshBuilder.CreateBox('ws', { width: segLen, height: 0.06, depth: 0.04 }, S);
            st.position.set(Math.sin(a) * (WR - 0.14), WH - 0.2, Math.cos(a) * (WR - 0.14)); st.rotation.y = a; st.material = stripMat; statics.push(st);
            // pillars every 7th segment
            if (i % 7 === 0) {
                const pl = B().MeshBuilder.CreateBox('pl', { width: 0.42, height: WH + 0.5, depth: 0.42 }, S);
                pl.position.set(x, (WH + 0.5) / 2, z); pl.rotation.y = a; pl.material = trimMat; statics.push(pl);
                const cap = B().MeshBuilder.CreateBox('cap', { width: 0.3, height: 0.08, depth: 0.3 }, S);
                cap.position.set(x, WH + 0.55, z); cap.rotation.y = a; cap.material = stripMat; statics.push(cap);
            }
        }
        // door portals
        for (const ea of exitAngles) {
            const px = Math.sin(ea) * WR, pz = Math.cos(ea) * WR;
            for (const sd of [-1, 1]) {
                const post = B().MeshBuilder.CreateBox('dp', { width: 0.36, height: WH + 0.9, depth: 0.5 }, S);
                post.position.set(px + Math.cos(ea) * sd * 1.25, (WH + 0.9) / 2, pz - Math.sin(ea) * sd * 1.25); post.rotation.y = ea; post.material = trimMat; statics.push(post);
            }
            const lintel = B().MeshBuilder.CreateBox('dl', { width: 2.9, height: 0.36, depth: 0.5 }, S);
            lintel.position.set(px, WH + 0.75, pz); lintel.rotation.y = ea; lintel.material = trimMat; statics.push(lintel);
            const lamp = B().MeshBuilder.CreateBox('dlamp', { width: 1.2, height: 0.08, depth: 0.1 }, S);
            lamp.position.set(px - Math.sin(ea) * 0.28, WH + 0.5, pz - Math.cos(ea) * 0.28); lamp.rotation.y = ea; lamp.material = M('#ffd27f', 0.9); statics.push(lamp);
            // threshold plate with hazard stripes
            const th = B().MeshBuilder.CreateBox('th', { width: 2.2, height: 0.05, depth: 0.7 }, S);
            th.position.set(px - Math.sin(ea) * 0.4, 0.1, pz - Math.cos(ea) * 0.4); th.rotation.y = ea; th.material = M('#c9a227'); statics.push(th);
        }
        this.mergeStatic(statics, root);
        // tech hatch (separate: its material changes with tech noise)
        let hatch = null;
        if (r.tech) {
            hatch = B().MeshBuilder.CreateCylinder('hatch_' + r.id, { diameter: 1.3, height: 0.1, tessellation: 8 }, S);
            hatch.parent = root; hatch.position.set(-1.9, 0.11, -1.9); hatch.material = M('#6d7f8f'); hatch.isPickable = false;
            const ring = B().MeshBuilder.CreateTorus('hr', { diameter: 1.3, thickness: 0.12, tessellation: 8 }, S);
            ring.parent = root; ring.position.set(-1.9, 0.16, -1.9); ring.material = M('#aab6c2'); ring.isPickable = false;
            for (let i = 0; i < 3; i++) { const g = B().MeshBuilder.CreateBox('g', { width: 0.9, height: 0.04, depth: 0.1 }, S); g.parent = root; g.position.set(-1.9, 0.17, -2.2 + i * 0.3); g.material = M('#2a3038'); g.isPickable = false; }
        }
        const label = this.makeLabel('lbl_' + r.id, r.id, '', root, 0, 2.9, 0, 2.8);
        this.roomNodes[r.id] = { root, plat, sel, hatch, label, props: null, propsKey: null, data: r, light: null };
    }

    buildCorridor(ship, c) {
        const S = this.scene;
        const a = this.pos(ship.rooms[c.a]), bpos = this.pos(ship.rooms[c.b]);
        const n = bpos.subtract(a).normalize();
        const start = a.add(n.scale(Scene3D.WALL_R + 0.3)), end = bpos.subtract(n.scale(Scene3D.WALL_R + 0.3));
        const mid = start.add(end).scale(0.5);
        const l = end.subtract(start).length();
        const root = new (B().TransformNode)('cor_' + c.id, S);
        root.position = mid; root.rotation.y = Math.atan2(n.x, n.z);
        const M = (hex, e, extra) => flatMat(S, hex, Object.assign(e ? { emissive: e } : {}, extra || {}));
        const statics = [];
        const mk = (w, h, d, x, y, z, mat) => { const m = B().MeshBuilder.CreateBox('c', { width: w, height: h, depth: d }, S); m.position.set(x, y, z); m.material = mat; statics.push(m); return m; };
        mk(2.2, 0.3, l, 0, -0.2, 0, M('#1f2a36'));
        // floor plates with centre stripe
        const plates = Math.max(1, Math.round(l / 1.1));
        for (let i = 0; i < plates; i++) { const z = -l / 2 + (i + 0.5) * (l / plates); mk(1.9, 0.06, l / plates - 0.08, 0, -0.03, z, M(i % 2 ? '#3a4552' : '#404c5a')); }
        mk(0.5, 0.07, l, 0, 0.0, 0, M('#5a4a2a'));
        // side kerbs + rails
        for (const s of [-1, 1]) { mk(0.2, 0.3, l, s * 1.0, 0.1, 0, M('#3c4c60')); mk(0.08, 0.08, l, s * 1.0, 0.6, 0, M('#aab6c2')); mk(0.1, 0.03, l, s * 0.98, 0.55, 0, M('#7fd8ff', 0.8)); }
        // ribs every ~2 units: two posts + a lintel + lamp
        const ribs = Math.max(1, Math.floor(l / 2.2));
        for (let i = 0; i < ribs; i++) {
            const z = -l / 2 + (i + 0.5) * (l / ribs);
            if (Math.abs(z) < 0.9) continue; // leave the door area clear
            for (const s of [-1, 1]) { mk(0.22, 1.5, 0.3, s * 1.15, 0.75, z, M('#59697b')); mk(0.1, 0.5, 0.12, s * 1.0, 0.65, z, M('#3e4b59')); }
            mk(2.5, 0.22, 0.3, 0, 1.6, z, M('#59697b'));
            mk(0.9, 0.06, 0.12, 0, 1.47, z, M('#dff5ff', 1));
            // pipes under the lintel
            const pipe = B().MeshBuilder.CreateCylinder('pp', { diameter: 0.12, height: 2.4, tessellation: 6 }, S);
            pipe.position.set(0, 1.35, z + 0.1); pipe.rotation.z = Math.PI / 2; pipe.material = M('#8c96a0'); statics.push(pipe);
        }
        this.mergeStatic(statics, root);
        // door frame + sliding panels (dynamic)
        const frame = B().MeshBuilder.CreateBox('frame', { width: 2.6, height: 1.9, depth: 0.3 }, S);
        frame.parent = root; frame.position.y = 0.95; frame.material = M('#8c96a0'); frame.isPickable = false;
        const hole = B().MeshBuilder.CreateBox('hole', { width: 1.7, height: 1.5, depth: 0.36 }, S);
        hole.parent = root; hole.position.y = 0.75; hole.material = M('#0b1016'); hole.isPickable = false;
        const panels = [];
        for (const s of [-1, 1]) {
            const p = B().MeshBuilder.CreateBox('panel', { width: 0.86, height: 1.5, depth: 0.14 }, S);
            p.parent = root; p.position.set(s * 0.43, 0.75, 0); p.material = M('#b8c4d0'); p.isPickable = false;
            const stripe = B().MeshBuilder.CreateBox('ps', { width: 0.1, height: 1.3, depth: 0.02 }, S);
            stripe.parent = p; stripe.position.set(-s * 0.3, 0, 0.08); stripe.material = M('#e05252', 0.6); stripe.isPickable = false;
            panels.push(p);
        }
        const noise = B().MeshBuilder.CreateCylinder('noise', { diameter: 1.3, height: 0.12, tessellation: 12 }, S);
        noise.parent = root; noise.position.set(0, 0.1, -l * 0.3); noise.material = M('#f1c40f', 0.9); noise.isPickable = false; noise.setEnabled(false);
        const noiseLabel = this.makeLabel('nl_' + c.id, '🔊', '', root, 0, 1.3, -l * 0.3, 1.4);
        noiseLabel.setEnabled(false);
        const debris = [];
        for (let i = 0; i < 5; i++) {
            const d = B().MeshBuilder.CreateBox('debris', { width: 0.4, height: 0.12, depth: 0.5 }, S);
            d.parent = root; d.position.set((Math.random() - 0.5) * 1.6, 0.08, (Math.random() - 0.5) * 1.4); d.rotation.set(0, Math.random() * 3, (Math.random() - 0.5) * 0.4); d.material = M('#6b7a88'); d.isPickable = false; d.setEnabled(false);
            debris.push(d);
        }
        this.corridorNodes[c.id] = { root, panels, noise, noiseLabel, debris, state: null };
    }

    makeLabel(name, big, small, parent, x, y, z, width) {
        const S = this.scene;
        const dt = new (B().DynamicTexture)(name + '_dt', { width: 512, height: 160 }, S, true);
        dt.hasAlpha = true;
        const plane = B().MeshBuilder.CreatePlane(name, { width, height: width * 160 / 512 }, S);
        plane.parent = parent; plane.position.set(x, y, z);
        plane.billboardMode = B().Mesh.BILLBOARDMODE_ALL;
        const mat = new (B().StandardMaterial)(name + '_m', S);
        mat.diffuseTexture = dt; mat.emissiveColor = new (B().Color3)(1, 1, 1); mat.disableLighting = true; mat.backFaceCulling = false; mat.useAlphaFromDiffuseTexture = true;
        plane.material = mat; plane.isPickable = false;
        plane.metadata = { dt, text: null };
        this.setLabel(plane, big, small);
        return plane;
    }
    setLabel(plane, big, small, color = '#ffffff') {
        const key = big + '|' + small + '|' + color;
        if (plane.metadata.text === key) return;
        plane.metadata.text = key;
        const dt = plane.metadata.dt; const ctx = dt.getContext();
        ctx.clearRect(0, 0, 512, 160);
        ctx.font = 'bold 64px Segoe UI, Arial'; ctx.textAlign = 'center'; ctx.fillStyle = color;
        ctx.shadowColor = '#000'; ctx.shadowBlur = 8;
        ctx.fillText(big, 256, small ? 70 : 100);
        if (small) { ctx.font = '600 42px Segoe UI, Arial'; ctx.fillStyle = '#dfe6ee'; ctx.fillText(small, 256, 130); }
        dt.update();
    }

    // ---------------------------------------------------------------------------------------
    // Per-state update
    // ---------------------------------------------------------------------------------------
    update(view, roomTiles, intruderNames, selectableRooms) {
        this.view = view;
        this.buildShip(view.ship);
        this.roomTiles = roomTiles;
        for (const d of this.dynamic) d.dispose();
        this.dynamic = [];
        this.selectable = new Set(selectableRooms || []);
        for (const r of Object.values(view.ship.rooms)) this.updateRoom(view, r);
        for (const c of Object.values(view.ship.corridors)) this.updateCorridor(c);
        for (const n of Object.values(this.roomNodes)) if (n.hatch) n.hatch.material = flatMat(this.scene, view.ship.techNoise ? '#f1c40f' : '#6d7f8f', view.ship.techNoise ? { emissive: 0.8 } : {});
        this.updateIntruders(view, intruderNames);
        this.updateCharacters(view);
    }

    updateRoom(view, r) {
        const node = this.roomNodes[r.id]; const rs = view.roomState[r.id]; const S = this.scene;
        const tile = rs.tile || (r.kind === 'cockpit' ? 'cockpit' : r.kind === 'hibernatorium' ? 'hibernatorium' : r.kind === 'engine' ? 'engine' : null);
        const def = tile ? this.roomTiles[tile] : null;
        const name = def ? def.name + (r.kind === 'engine' ? ' №' + r.engineNo : '') : (r.kind === 'slot1' ? 'Комната «1»' : 'Комната «2»');
        this.setLabel(node.label, r.id, name, rs.explored || def ? '#ffffff' : '#8a99ab');
        node.sel.setEnabled(this.selectable.has(r.id));
        // props (rebuilt only when the tile/explored state changes)
        const pk = (tile || 'unknown') + '|' + rs.explored;
        if (node.propsKey !== pk) {
            if (node.props) node.props.dispose();
            node.props = this.buildProps(tile, rs.explored, node.root, r);
            node.propsKey = pk;
        }
        // dynamic markers
        if (rs.fire) this.addFire(node.root);
        if (rs.malfunction) this.addMalfunction(node.root);
        let k = 0;
        for (const o of rs.objects) { this.addObject(o.type, node.root, k++); }
        if (tile === 'nest' && rs.explored) for (let i = 0; i < view.nestEggs; i++) this.addObject('egg', node.root, 10 + i);
    }

    buildProps(tile, explored, parent, r) {
        const S = this.scene;
        const root = new (B().TransformNode)('props', S); root.parent = parent;
        const M = (hex, e, extra) => flatMat(S, hex, Object.assign(e ? { emissive: e } : {}, extra || {}));
        const statics = [];
        const bx = (w, h, d, x, y, z, mat, ry = 0, rx = 0) => { const m = B().MeshBuilder.CreateBox('p', { width: w, height: h, depth: d }, S); m.position.set(x, y, z); m.rotation.y = ry; m.rotation.x = rx; m.material = mat; statics.push(m); return m; };
        const cy = (dt, db, h, x, y, z, mat, tess = 8, rz = 0) => { const m = B().MeshBuilder.CreateCylinder('p', { diameterTop: dt, diameterBottom: db, height: h, tessellation: tess }, S); m.position.set(x, y, z); m.rotation.z = rz; m.material = mat; m.convertToFlatShadedMesh(); statics.push(m); return m; };
        const accentHex = TILE_ACCENT[tile] || '#8a99ab';
        const accent = M(accentHex, 0.6), metal = M('#8c96a0'), dark = M('#2b333d'), panel = M('#4a5a6e'), white = M('#dfe6ee');
        const screen = M('#4aa3df', 0.9), warm = M('#ffd27f', 0.9), crateMat = M('#6b5a3c'), crateMat2 = M('#52607a');
        // --- shared pieces ---
        const console_ = (x, z, ry) => { bx(1.4, 0.9, 0.6, x, 0.45, z, panel, ry); bx(1.2, 0.7, 0.08, x - Math.sin(ry) * 0.2, 1.15, z - Math.cos(ry) * 0.2, screen, ry, -0.3); bx(1.1, 0.05, 0.4, x + Math.sin(ry) * 0.1, 0.92, z + Math.cos(ry) * 0.1, dark, ry); bx(0.3, 0.04, 0.2, x, 0.95, z, accent, ry); };
        const crate = (x, z, s = 1, ry = 0, mat = crateMat) => { bx(s, s, s, x, s / 2, z, mat, ry); bx(s * 1.02, 0.08, 0.12, x, s * 0.5, z, dark, ry); bx(0.12, 0.08, s * 1.02, x, s * 0.5, z, dark, ry); };
        const locker = (x, z, ry) => { bx(0.9, 1.6, 0.5, x, 0.8, z, panel, ry); bx(0.04, 1.4, 0.04, x, 0.8, z + 0.26, metal, ry); bx(0.3, 0.06, 0.03, x, 1.2, z + 0.26, accent, ry); };
        const plant = (x, z) => { cy(0.5, 0.4, 0.4, x, 0.2, z, dark, 6); for (let i = 0; i < 4; i++) { const m = B().MeshBuilder.CreatePolyhedron('cr', { type: 1, size: 0.14 + (i % 2) * 0.08 }, S); m.position.set(x + (i - 1.5) * 0.14, 0.6 + (i % 3) * 0.18, z + ((i * 7) % 3 - 1) * 0.12); m.material = M('#ff5ad6', 0.7); m.convertToFlatShadedMesh(); statics.push(m); } };
        const bench = (x, z, ry) => { bx(1.3, 0.08, 0.4, x, 0.45, z, M('#b07a3c'), ry); for (const s of [-1, 1]) bx(0.08, 0.45, 0.4, x + Math.cos(ry) * s * 0.55, 0.22, z - Math.sin(ry) * s * 0.55, dark, ry); };
        const pipes = (x, z, ry, n = 3) => { for (let i = 0; i < n; i++) cy(0.14, 0.14, 2.6, x + Math.sin(ry + Math.PI / 2) * i * 0.2, 0.2 + i * 0.2, z + Math.cos(ry + Math.PI / 2) * i * 0.2, i % 2 ? metal : M('#c9a227'), 6, Math.PI / 2); };
        const bed = (x, z, ry) => { bx(0.9, 0.3, 2.0, x, 0.3, z, metal, ry); bx(0.84, 0.12, 1.9, x, 0.5, z, white, ry); bx(0.6, 0.1, 0.4, x, 0.58, z + 0.7, M('#c0392b'), ry); };

        if (!explored && !tile) {
            // unexplored: dark, sealed crates, a flickering "?"
            crate(1.4, 0.9, 1.1, 0.3, dark); crate(-1.3, -0.7, 0.9, 0.7, dark); crate(0.2, -1.6, 0.7, 0.2, dark);
            this.makeLabel('q', '?', '', root, 0, 1.6, 0, 2.0);
            this.mergeStatic(statics, root);
            return root;
        }
        switch (tile) {
            case 'cockpit':
                bx(3.2, 0.5, 1.2, 0, 0.25, 2.2, panel); bx(3.0, 1.3, 0.1, 0, 1.2, 2.75, screen, 0, -0.15); bx(0.6, 0.8, 0.1, -1.9, 1.0, 2.4, screen, 0.5); bx(0.6, 0.8, 0.1, 1.9, 1.0, 2.4, screen, -0.5);
                for (const s of [-1, 1]) { cy(0.7, 0.7, 0.3, s * 1.0, 0.15, 0.8, dark, 6); bx(0.6, 0.6, 0.5, s * 1.0, 0.6, 0.8, M('#5a3a3a')); bx(0.6, 0.7, 0.15, s * 1.0, 1.1, 0.5, M('#5a3a3a')); }
                console_(-2.2, -1.5, 1.0); console_(2.2, -1.5, -1.0); plant(0, -2.6);
                break;
            case 'hibernatorium':
                for (let i = 0; i < 5; i++) { const a = -1.0 + i * 0.5; const x = Math.sin(a) * 2.4, z = Math.cos(a) * 2.4; bx(1.0, 0.5, 2.2, x, 0.25, z, metal, a); bx(0.9, 0.6, 2.0, x, 0.8, z, M('#7fc7ff', 0.25, { alpha: 0.55 }), a); bx(0.9, 0.1, 0.4, x, 1.15, z - 0.0, M('#3a4a5a'), a); bx(0.2, 0.05, 0.05, x, 1.2, z, M('#4fcf7a', 1), a); }
                console_(0, -2.4, Math.PI); plant(-2.6, -1.4); plant(2.6, -1.4);
                break;
            case 'engine':
                cy(3.0, 3.4, 1.8, 0, 0.9, -0.6, metal, 10); cy(1.8, 2.2, 0.8, 0, 1.1, 1.0, accent, 10); cy(1.1, 1.1, 0.5, 0, 1.2, 1.6, M('#ffb347', 1), 10);
                for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; bx(0.3, 0.7, 0.3, Math.cos(a) * 1.9, 2.1, Math.sin(a) * 1.9 - 0.6, dark); }
                pipes(0, 2.9, Math.PI / 2, 2); pipes(-2.9, 0, 0, 2); console_(2.4, 2.0, -2.3);
                break;
            case 'archives':
                for (let i = 0; i < 3; i++) { bx(0.6, 2.0, 2.4, -2.5 + i * 1.1, 1.0, -0.6, panel); for (let k = 0; k < 4; k++) bx(0.62, 0.06, 2.2, -2.5 + i * 1.1, 0.4 + k * 0.45, -0.6, metal); for (let k = 0; k < 6; k++) bx(0.1, 0.3, 0.25, -2.5 + i * 1.1 + 0.28, 0.6 + (k % 4) * 0.45, -1.5 + k * 0.35, k % 2 ? accent : screen); }
                console_(2.2, -1.8, -0.7); bench(1.6, 1.8, 0.2); plant(2.8, 1.0);
                break;
            case 'comms':
                cy(0.3, 0.6, 3.4, -1.4, 1.7, 0.6, metal, 6); cy(2.4, 0.2, 0.7, -1.4, 3.5, 0.6, accent, 12); cy(0.1, 0.1, 1.0, -1.4, 4.2, 0.6, metal, 6); bx(0.2, 0.2, 0.2, -1.4, 4.7, 0.6, M('#e05252', 1));
                console_(1.8, -1.6, -0.8); console_(2.4, 0.6, -1.6); crate(0.8, 2.2, 0.8);
                break;
            case 'emergency':
                bed(-1.0, 0.8, 0); bed(1.4, 0.8, 0); bx(0.6, 1.6, 0.6, -2.6, 0.8, -1.2, M('#4fcf7a', 0.3)); bx(0.5, 0.5, 0.1, -2.6, 1.0, -0.88, M('#e05252', 0.8));
                bx(0.8, 0.9, 0.5, 2.6, 0.45, -1.4, white); bx(0.7, 0.04, 0.4, 2.6, 0.92, -1.4, M('#e05252')); locker(0.4, -2.6, Math.PI);
                break;
            case 'evacA': case 'evacB':
                for (const s of [-1, 1]) { cy(1.5, 1.9, 2.2, s * 1.9, 1.1, -1.0, metal, 8); cy(0.6, 1.5, 0.9, s * 1.9, 2.65, -1.0, accent, 8); bx(0.6, 0.8, 0.1, s * 1.9, 1.0, -0.05, M('#7fc7ff', 0.5), 0); for (let i = 0; i < 4; i++) bx(0.08, 1.0, 0.08, s * 1.9 + Math.cos(i * 1.57) * 0.95, 0.5, -1.0 + Math.sin(i * 1.57) * 0.95, dark); }
                bx(2.6, 0.08, 1.0, 0, 0.1, 1.9, M('#e05252', 0.5)); for (let i = 0; i < 5; i++) bx(0.3, 0.09, 1.0, -1.1 + i * 0.55, 0.11, 1.9, M('#f1c40f', 0.6)); console_(0, -2.6, Math.PI);
                break;
            case 'fireControl':
                for (let i = 0; i < 3; i++) { cy(0.5, 0.5, 1.2, -1.6 + i * 1.0, 0.6, 1.4, M('#e05252'), 8); cy(0.2, 0.2, 0.3, -1.6 + i * 1.0, 1.35, 1.4, metal, 6); }
                bx(2.2, 1.5, 0.4, 0, 0.75, -2.2, panel); bx(1.8, 0.6, 0.06, 0, 1.0, -1.97, M('#e05252', 0.5)); console_(2.3, 0.4, -1.4); pipes(-2.9, -0.4, 0, 3);
                break;
            case 'generator':
                cy(2.4, 2.6, 2.4, 0, 1.2, 0, metal, 8); cy(0.9, 0.9, 1.0, 0, 2.9, 0, accent, 8); cy(1.4, 1.4, 0.3, 0, 1.2, 0, M('#f1c40f', 1), 8);
                for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; bx(0.4, 0.4, 2.2, Math.cos(a) * 1.9, 0.2, Math.sin(a) * 1.9, dark, -a); }
                console_(2.6, -2.0, -2.4); bx(0.5, 0.6, 0.5, -2.6, 0.3, 2.0, M('#c9a227'));
                break;
            case 'laboratory':
                bx(3.2, 0.9, 1.0, 0, 0.45, 1.4, white); bx(3.2, 0.06, 1.0, 0, 0.93, 1.4, M('#9fb4c8')); cy(0.4, 0.4, 1.0, -1, 1.45, 1.4, M('#4fcf7a', 0.7, { alpha: 0.7 }), 8); cy(0.4, 0.4, 0.7, 0.2, 1.3, 1.4, M('#b26bd6', 0.7, { alpha: 0.7 }), 8); bx(0.5, 0.4, 0.3, 1.1, 1.15, 1.4, metal);
                bx(2.0, 2.2, 1.0, 0, 1.1, -2.2, M('#7fc7ff', 0.2, { alpha: 0.5 })); bx(2.1, 0.15, 1.1, 0, 0.08, -2.2, metal); bx(2.1, 0.15, 1.1, 0, 2.2, -2.2, metal); console_(2.6, -0.6, -1.5);
                break;
            case 'nest':
                cy(3.2, 3.9, 0.3, 0, 0.15, 0, M('#4a2c4a'), 9);
                for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; cy(0.1, 0.9, 1.4 + (i % 3) * 0.5, Math.cos(a) * 3.1, 0.7, Math.sin(a) * 3.1, M('#3a2a3a'), 5); cy(0.05, 0.4, 1.2, Math.cos(a) * 2.2, 0.6, Math.sin(a) * 2.2, M('#5a3a5a'), 4); }
                for (let i = 0; i < 5; i++) bx(0.6, 0.1, 1.6, Math.cos(i * 1.3) * 1.5, 0.33, Math.sin(i * 1.3) * 1.5, M('#5a3a5a'), i * 1.3);
                break;
            case 'surgery':
                bx(2.4, 0.8, 1.0, 0, 0.4, 0.6, white); bx(2.5, 0.06, 1.1, 0, 0.83, 0.6, M('#9fb4c8')); cy(1.4, 1.4, 0.2, 0, 2.7, 0.6, M('#ffffff', 1), 8); cy(0.15, 0.15, 1.5, 0, 1.95, 0.6, metal, 6); cy(0.9, 1.1, 0.2, 0, 2.55, 0.6, metal, 8);
                bx(0.8, 1.2, 0.5, -2.4, 0.6, -1.4, white); bx(0.6, 0.4, 0.06, -2.4, 1.0, -1.12, screen); console_(2.3, -1.6, -0.9);
                break;
            case 'repository':
                for (let i = 0; i < 5; i++) crate(-2.2 + (i % 3) * 1.3, 0.8 + Math.floor(i / 3) * 1.2, 0.9 + (i % 2) * 0.3, i * 0.2, i % 2 ? crateMat : crateMat2);
                crate(-1.6, 0.8, 0.9, 0.1); bx(3.0, 1.7, 0.4, 0, 0.85, -2.4, panel); for (let k = 0; k < 3; k++) bx(2.8, 0.05, 0.5, 0, 0.5 + k * 0.5, -2.35, metal); for (let k = 0; k < 6; k++) bx(0.3, 0.3, 0.3, -1.2 + k * 0.5, 0.68 + (k % 3) * 0.5, -2.35, k % 2 ? M('#e05252') : crateMat);
                break;
            case 'airlock':
                cy(3.0, 3.0, 0.15, 0, 0.1, 0.4, M('#e05252', 0.4), 8); cy(2.4, 2.4, 0.16, 0, 0.11, 0.4, M('#aab6c2'), 8); for (let i = 0; i < 6; i++) bx(0.3, 0.6, 0.3, Math.cos(i * 1.05) * 1.5, 0.3, 0.4 + Math.sin(i * 1.05) * 1.5, M('#f1c40f', 0.4));
                bx(2.0, 2.2, 0.3, 0, 1.1, -2.6, metal); bx(1.2, 0.3, 0.1, 0, 2.0, -2.43, M('#e05252', 1)); console_(2.6, -1.0, -1.3);
                break;
            case 'armory':
                for (let i = 0; i < 2; i++) { const x = -1.6 + i * 3.2; bx(2.2, 1.7, 0.4, x, 0.85, -2.0, panel); for (let k = 0; k < 5; k++) { bx(0.1, 1.1, 0.1, x - 0.8 + k * 0.4, 1.0, -1.75, dark); bx(0.25, 0.14, 0.12, x - 0.8 + k * 0.4, 0.8, -1.75, M('#4a525c')); } bx(2.2, 0.06, 0.04, x, 1.55, -1.78, M('#e05252', 0.8)); }
                bx(1.6, 0.6, 0.8, 0.5, 0.3, 1.2, crateMat); for (let k = 0; k < 6; k++) cy(0.1, 0.1, 0.3, 0.0 + k * 0.2, 0.75, 1.2, M('#c9a227'), 6); locker(-2.6, 0.6, 1.2); locker(2.7, 0.6, -1.2);
                break;
            case 'cafeteria':
                for (const s of [-1, 1]) { bx(2.4, 0.1, 0.9, 0, 0.75, s * 1.4, M('#8b6b4a')); bx(0.2, 0.7, 0.2, 0, 0.35, s * 1.4, dark); for (let i = 0; i < 3; i++) { cy(0.45, 0.45, 0.1, -0.8 + i * 0.8, 0.45, s * 2.15, M('#b07a3c'), 6); cy(0.08, 0.08, 0.4, -0.8 + i * 0.8, 0.2, s * 2.15, dark, 6); } bx(0.3, 0.05, 0.3, -0.6, 0.82, s * 1.4, white); bx(0.3, 0.05, 0.3, 0.7, 0.82, s * 1.4, white); }
                bx(1.2, 1.8, 0.6, -2.7, 0.9, 0, M('#e05252')); bx(0.8, 0.8, 0.06, -2.7, 1.1, 0.31, M('#7fd8ff', 0.6)); plant(2.8, 0); plant(2.6, -2.0);
                break;
            case 'commandCenter':
                bx(2.8, 0.9, 1.4, 0, 0.45, 0, panel); bx(2.4, 0.4, 1.0, 0, 1.0, 0, M('#4aa3df', 0.6, { alpha: 0.6 })); for (let i = 0; i < 3; i++) bx(1.1, 1.4, 0.1, -1.3 + i * 1.3, 1.3, -2.7, screen, (1 - i) * 0.4); console_(-2.6, 1.0, 1.4); console_(2.6, 1.0, -1.4);
                break;
            case 'containment':
                bx(2.4, 2.4, 2.4, 0, 1.3, 0.2, M('#7fc7ff', 0.15, { alpha: 0.35 })); bx(2.6, 0.2, 2.6, 0, 0.1, 0.2, metal); bx(2.6, 0.2, 2.6, 0, 2.5, 0.2, metal); for (const [x, z] of [[-1.3, -1.1], [1.3, -1.1], [-1.3, 1.5], [1.3, 1.5]]) bx(0.2, 2.6, 0.2, x, 1.3, z, metal);
                bx(0.3, 0.3, 0.3, 0, 2.7, 0.2, M('#e05252', 1)); console_(2.6, -2.0, -2.2); pipes(-2.8, 0.6, 0, 2);
                break;
            case 'contaminated':
                for (let i = 0; i < 8; i++) { const a = i * 0.8; cy(0.3, 0.7, 0.7 + (i % 3) * 0.4, Math.cos(a) * (1 + (i % 3)), 0.35, Math.sin(a) * (1 + (i % 2)) , M('#5a8a2a', 0.5), 5); }
                bx(1.6, 0.7, 0.8, 1.8, 0.35, -1.6, M('#3a4a2a'), 0.6); cy(0.9, 0.9, 0.1, -1.6, 0.06, 1.6, M('#9cff3b', 0.8), 8); crate(-2.4, -1.4, 0.8, 0.4, M('#3f4a3a'));
                break;
            case 'decon':
                for (let i = 0; i < 3; i++) { cy(0.2, 0.2, 2.6, -1.6 + i * 1.6, 1.3, 1.0, metal, 6); cy(0.9, 0.2, 0.4, -1.6 + i * 1.6, 2.7, 1.0, M('#4fcf7a', 0.8), 8); cy(0.8, 0.8, 0.05, -1.6 + i * 1.6, 0.1, 1.0, M('#4fcf7a', 0.5), 8); }
                bx(3.0, 0.1, 0.6, 0, 1.0, -1.8, metal); bx(2.8, 1.2, 0.4, 0, 0.5, -2.2, panel); for (let k = 0; k < 4; k++) bx(0.4, 0.5, 0.1, -1.2 + k * 0.8, 0.7, -1.95, M('#7fd8ff', 0.5)); locker(2.7, 0.6, -1.2);
                break;
            case 'engineRoom':
                for (let i = 0; i < 3; i++) { cy(1.0, 1.1, 1.6, -2 + i * 2, 0.8, 0.6, metal, 8); cy(0.5, 0.5, 0.4, -2 + i * 2, 1.8, 0.6, dark, 8); bx(0.3, 0.1, 0.1, -2 + i * 2, 1.2, 1.16, i === 1 ? M('#e05252', 1) : M('#4fcf7a', 1)); }
                bx(5.2, 0.3, 0.3, 0, 2.1, 0.6, dark); pipes(0, -2.2, Math.PI / 2, 3); console_(2.6, -1.4, -1.6);
                break;
            case 'hatchControl':
                for (let i = 0; i < 4; i++) { bx(0.7, 0.7, 0.2, -1.5 + i * 1.0, 1.1, 1.6, i % 2 ? M('#4fcf7a', 0.7) : M('#e05252', 0.7)); bx(0.76, 0.76, 0.1, -1.5 + i * 1.0, 1.1, 1.72, metal); }
                bx(4.2, 0.7, 0.5, 0, 0.35, 1.6, panel); console_(0, -2.2, Math.PI); console_(-2.6, -0.2, 1.4); pipes(2.8, 0, 0, 2);
                break;
            case 'server':
                for (let i = 0; i < 4; i++) { const x = -2.4 + i * 1.6; bx(0.8, 2.2, 1.6, x, 1.1, 0.4, dark); for (let k = 0; k < 6; k++) bx(0.06, 0.18, 1.3, x + 0.42, 0.4 + k * 0.32, 0.4, k % 2 ? M('#4fcf7a', 0.8) : M('#4aa3df', 0.8)); bx(0.82, 0.06, 1.62, x, 2.22, 0.4, metal); }
                console_(0, -2.4, Math.PI); pipes(0, 1.9, Math.PI / 2, 2);
                break;
            case 'storage':
                for (let i = 0; i < 7; i++) crate(-2.4 + (i % 4) * 1.3, -1.6 + Math.floor(i / 4) * 2.6, 0.9 + (i % 3) * 0.15, i * 0.3, i % 2 ? crateMat : crateMat2);
                crate(-1.1, -1.6, 0.8, 0.2); crate(0.2, -1.6, 0.7, 0.5); bx(2.4, 0.08, 0.08, 1.2, 1.2, 0.4, M('#f1c40f', 0.7)); bx(0.08, 1.2, 0.08, 1.2, 0.6, 0.4, metal); bx(0.08, 1.2, 0.08, 2.4, 0.6, 0.4, metal);
                break;
        }
        this.mergeStatic(statics, root);
        return root;
    }


    addFire(parent) {
        const S = this.scene;
        for (let i = 0; i < 5; i++) {
            const c = B().MeshBuilder.CreateCylinder('fire', { diameterTop: 0, diameterBottom: 0.8 + Math.random() * 0.5, height: 1.4 + Math.random(), tessellation: 5 }, S);
            c.parent = parent; c.position.set(-2.8 + Math.random() * 1.5, 0.7, 1.8 + Math.random() * 1.5);
            c.material = flatMat(S, i % 2 ? '#ff7a1a' : '#ffc23b', { emissive: 1, alpha: 0.85 }); c.isPickable = false;
            c.metadata = { flame: true, phase: Math.random() * 6 };
            this.dynamic.push(c);
        }
        const glow = new (B().PointLight)('fl', parent.position.add(new (B().Vector3)(-2, 1.5, 2.5)), S);
        glow.diffuse = new (B().Color3)(1, 0.5, 0.15); glow.intensity = 0.8; glow.range = 12;
        this.dynamic.push(glow);
    }
    addMalfunction(parent) {
        const S = this.scene;
        const base = B().MeshBuilder.CreateCylinder('malf', { diameter: 1.4, height: 0.2, tessellation: 3 }, S);
        base.parent = parent; base.position.set(2.8, 0.1, 2.4); base.material = flatMat(S, '#e05252', { emissive: 0.9 }); base.isPickable = false;
        const spark = B().MeshBuilder.CreateBox('spark', { size: 0.35 }, S);
        spark.parent = parent; spark.position.set(2.8, 0.8, 2.4); spark.material = flatMat(S, '#ffd23b', { emissive: 1 }); spark.isPickable = false; spark.metadata = { spin: true };
        const lbl = this.makeLabel('ml', '⚠', '', parent, 2.8, 1.6, 2.4, 1.3);
        this.dynamic.push(base, spark, lbl);
    }
    addObject(type, parent, k) {
        const S = this.scene;
        const a = 1.1 + k * 0.9, rad = 3.2;
        const x = Math.cos(a) * rad, z = Math.sin(a) * rad;
        let m;
        if (type === 'egg') { m = B().MeshBuilder.CreateSphere('egg', { diameter: 0.7, segments: 5 }, S); m.scaling.y = 1.3; m.position.set(x * 0.6, 0.4, z * 0.6); m.material = flatMat(S, '#b8a8c8'); }
        else if (type === 'carcass') { m = B().MeshBuilder.CreateBox('carc', { width: 1.6, height: 0.4, depth: 0.8 }, S); m.position.set(x, 0.2, z); m.rotation.y = a; m.material = flatMat(S, '#263036'); }
        else { m = B().MeshBuilder.CreateBox('corpse', { width: 1.5, height: 0.35, depth: 0.6 }, S); m.position.set(x, 0.18, z); m.rotation.y = a; m.material = flatMat(S, type === 'charCorpse' ? '#8a6b5a' : '#4a7ab8'); }
        m.parent = parent; m.isPickable = false; m.convertToFlatShadedMesh();
        this.dynamic.push(m);
    }

    updateCorridor(c) {
        const n = this.corridorNodes[c.id];
        const key = c.door + '|' + c.noise;
        if (n.state === key) return;
        n.state = key;
        const closed = c.door === 'closed', destroyed = c.door === 'destroyed';
        n.panels[0].position.x = closed ? -0.39 : -1.1; n.panels[1].position.x = closed ? 0.39 : 1.1;
        n.panels[0].setEnabled(!destroyed); n.panels[1].setEnabled(!destroyed);
        for (const d of n.debris) d.setEnabled(destroyed);
        n.noise.setEnabled(!!c.noise); n.noiseLabel.setEnabled(!!c.noise);
    }

    updateIntruders(view, names) {
        const S = this.scene;
        const seen = new Set();
        const perRoom = {};
        for (const it of Object.values(view.intruders)) {
            seen.add(it.uid);
            let n = this.intr[it.uid];
            if (!n) { n = { root: buildIntruder(S, it.type), label: null }; n.label = this.makeLabel('il', '', '', n.root, 0, 2.6, 0, 2.4); this.intr[it.uid] = n; for (const m of n.root.getChildMeshes()) this.shadows.addShadowCaster(m); }
            const k = perRoom[it.room] = (perRoom[it.room] || 0) + 1;
            const roomPos = this.roomNodes[it.room].root.position;
            const a = -0.6 - k * 0.9;
            n.target = roomPos.add(new (B().Vector3)(Math.cos(a) * 2.6, 0, Math.sin(a) * 2.6));
            if (!n.placed) { n.root.position.copyFrom(n.target); n.placed = true; }
            n.root.rotation.y = a + Math.PI / 2;
            this.setLabel(n.label, names[it.type] + (it.hits ? ' ✚' + it.hits : ''), '', '#9cff3b');
        }
        for (const uid of Object.keys(this.intr)) if (!seen.has(uid)) { this.intr[uid].root.dispose(); delete this.intr[uid]; }
    }

    updateCharacters(view) {
        const S = this.scene;
        const perRoom = {};
        for (const p of view.players) {
            let n = this.chars[p.id];
            if (!n) {
                const ch = buildCharacter(S, p.charId, p.colors);
                n = { ch, label: this.makeLabel('cl', p.name, '', ch.root, 0, 3.6, 0, 3.8), placed: false, colorsKey: null };
                this.chars[p.id] = n;
                for (const m of ch.root.getChildMeshes()) this.shadows.addShadowCaster(m);
            }
            const ck = JSON.stringify(p.colors);
            if (n.colorsKey !== ck) { n.ch.setColors(p.colors); n.colorsKey = ck; }
            const visible = (p.status === 'active' || p.status === 'hibernating') && !p.pod;
            n.ch.root.setEnabled(visible);
            if (!visible) continue;
            const k = perRoom[p.room] = (perRoom[p.room] || 0) + 1;
            const roomPos = this.roomNodes[p.room].root.position;
            const a = 1.2 + k * 0.8;
            n.target = roomPos.add(new (B().Vector3)(Math.cos(a) * 2.0, 0, Math.sin(a) * 2.0));
            if (!n.placed) { n.ch.root.position.copyFrom(n.target); n.placed = true; }
            n.ch.root.rotation.y = Math.PI + a;
            const current = view.current === p.id && view.phase === 'player';
            this.setLabel(n.label, p.name + (p.passed ? ' (пас)' : ''), p.charName, current ? '#ffb347' : '#ffffff');
            n.ch.root.scaling.setAll(p.status === 'hibernating' ? 0.001 : 1);
        }
    }

    animate() {
        const t = this.t;
        for (const d of this.dynamic) {
            if (!d.metadata) continue;
            if (d.metadata.flame) { const s = 0.85 + 0.25 * Math.sin(t * 9 + d.metadata.phase); d.scaling.set(s, 1.3 - s * 0.3, s); d.rotation.y += 0.05; }
            if (d.metadata.spin) { d.rotation.y += 0.08; d.rotation.x += 0.05; d.position.y = 0.8 + Math.sin(t * 4) * 0.1; }
        }
        for (const n of Object.values(this.roomNodes)) if (n.sel.isEnabled()) n.sel.scaling.setAll(1 + 0.04 * Math.sin(t * 5));
        const lerp = Math.min(1, this.engine.getDeltaTime() / 400);
        for (const n of Object.values(this.chars)) if (n.target && n.ch.root.isEnabled()) B().Vector3.LerpToRef(n.ch.root.position, n.target, lerp, n.ch.root.position);
        for (const n of Object.values(this.intr)) if (n.target) { B().Vector3.LerpToRef(n.root.position, n.target, lerp, n.root.position); n.root.position.y = Math.abs(Math.sin(t * 3 + n.root.position.x)) * 0.05; }
        if (this.camera.radius > 60) { for (const n of Object.values(this.roomNodes)) n.label.scaling.setAll(this.camera.radius / 60); }
        else for (const n of Object.values(this.roomNodes)) n.label.scaling.setAll(1);
    }

    onPointer(pi) {
        const T = B().PointerEventTypes;
        if (pi.type === T.POINTERMOVE) {
            const pick = this.scene.pick(this.scene.pointerX, this.scene.pointerY, m => m.metadata && m.metadata.roomId);
            const id = pick && pick.hit ? pick.pickedMesh.metadata.roomId : null;
            if (id !== this.hover) { this.hover = id; }
            if (this.cb.onHover) this.cb.onHover(id, this.scene.pointerX, this.scene.pointerY);
        } else if (pi.type === T.POINTERDOWN) {
            this.downX = this.scene.pointerX; this.downY = this.scene.pointerY;
        } else if (pi.type === T.POINTERUP) {
            if (Math.abs(this.scene.pointerX - this.downX) > 4 || Math.abs(this.scene.pointerY - this.downY) > 4) return;
            const pick = this.scene.pick(this.scene.pointerX, this.scene.pointerY, m => m.metadata && m.metadata.roomId);
            if (pick && pick.hit && this.cb.onClick) this.cb.onClick(pick.pickedMesh.metadata.roomId);
        }
    }

    focusRoom(roomId) {
        const n = this.roomNodes[roomId]; if (!n) return;
        const from = this.camera.target.clone(), to = n.root.position.clone();
        const anim = new (B().Animation)('focus', 'target', 60, B().Animation.ANIMATIONTYPE_VECTOR3, B().Animation.ANIMATIONLOOPMODE_CONSTANT);
        anim.setKeys([{ frame: 0, value: from }, { frame: 30, value: to }]);
        const ease = new (B().CubicEase)(); ease.setEasingMode(B().EasingFunction.EASINGMODE_EASEINOUT); anim.setEasingFunction(ease);
        this.camera.animations = [anim]; this.scene.beginAnimation(this.camera, 0, 30, false);
    }
}

/** Standalone character preview for the lobby. */
export class Preview3D {
    constructor(canvas) {
        this.engine = new (B().Engine)(canvas, true);
        this.scene = new (B().Scene)(this.engine);
        this.scene.clearColor = new (B().Color4)(0, 0, 0, 0);
        const cam = new (B().ArcRotateCamera)('pc', -Math.PI / 2 + 0.4, 1.25, 4.2, new (B().Vector3)(0, 0.95, 0), this.scene);
        cam.attachControl(canvas, true); cam.lowerRadiusLimit = 2.5; cam.upperRadiusLimit = 7; cam.wheelPrecision = 50;
        const h = new (B().HemisphericLight)('h', new (B().Vector3)(0.3, 1, 0.2), this.scene); h.intensity = 0.8;
        const d = new (B().DirectionalLight)('d', new (B().Vector3)(-0.5, -1, 0.6), this.scene); d.intensity = 0.7;
        const disc = B().MeshBuilder.CreateCylinder('disc', { diameter: 1.6, height: 0.1, tessellation: 8 }, this.scene);
        disc.position.y = -0.05; disc.material = flatMat(this.scene, '#243040');
        this.char = null; this.charId = null;
        this.engine.runRenderLoop(() => { if (this.char) this.char.root.rotation.y += 0.004; this.scene.render(); });
        new ResizeObserver(() => this.engine.resize()).observe(canvas);
    }
    show(charId, colors) {
        if (this.charId !== charId) { if (this.char) this.char.root.dispose(); this.char = buildCharacter(this.scene, charId, colors); this.charId = charId; }
        else this.char.setColors(colors);
    }
}
