// scene3d.js — the 3D board: ship rooms as open low-poly locations, corridors, doors, markers,
// intruders and characters. Reads a per-player view (shared/view.mjs) and renders it.
//
// Room anatomy:
//   base  — hex platform, floor plates, tech-corridor stub, label (always visible);
//   shell — walls, portals, props, wall dressing (built once the tile is known);
//   zone  — the "standing zone": a marked circle where characters/intruders are placed, props keep out.
// Corridors are polylines (bends like on the printed board); ribs/LEDs are split into two halves so
// only the half next to an explored room is shown, LEDs turn yellow when the corridor has noise.

import { buildCharacter, buildIntruder, flatMat } from './characters.js';
import * as Snd from './sound.js';

const B = () => window.BABYLON;
const SCALE = 0.1;                 // board units -> world units
const ROOM_R = 7.0;                // hex platform radius
const WALL_R = 6.3;                // wall ring radius
const WALL_H = 1.35;
const FLIP_S = 0.9, POP_S = 0.55;
const LIFT_H = 1.1;   // how high a grabbed figure is lifted above the floor  // room token flip / props pop-up durations (s)
const ZONE_C = { x: 2.1, z: -2.1 }; // standing zone centre (toward the camera)
const ZONE_R = 2.5;
const PROP_SPREAD = 1.55;          // props were authored for a ~4-unit room
const KIND_COLORS = { slot1: '#28343f', slot2: '#2c3b36', cockpit: '#2a3a52', hibernatorium: '#3a2f4e', engine: '#4a3222' };
const TILE_ACCENT = {
    archives: '#4aa3df', comms: '#4aa3df', emergency: '#4fcf7a', evacA: '#e05252', evacB: '#e05252', fireControl: '#f1c40f', generator: '#f1c40f',
    laboratory: '#4fcf7a', nest: '#b26bd6', surgery: '#4fcf7a', repository: '#e05252', airlock: '#e05252', armory: '#e05252', cafeteria: '#4fcf7a',
    commandCenter: '#f1c40f', containment: '#4fcf7a', contaminated: '#9cff3b', decon: '#4fcf7a', engineRoom: '#f1c40f', hatchControl: '#e05252',
    server: '#f1c40f', storage: '#f1c40f', cockpit: '#4aa3df', hibernatorium: '#b26bd6', engine: '#ffb347',
};
// Wall palettes per tile family: [wall, darkPanel, trim, strip]
const WALL_STYLES = {
    steel: ['#59697b', '#3e4b59', '#aab6c2', '#7fd8ff'],
    medical: ['#c9d3da', '#9aa8b4', '#eef3f6', '#8ef0b0'],
    military: ['#4a515a', '#30363d', '#8c96a0', '#ff6b6b'],
    tech: ['#5a5f52', '#3a3e36', '#b7b08a', '#ffd23b'],
    engine: ['#6a4f3a', '#4a3627', '#9c8468', '#ffb347'],
    nest: ['#3a2535', '#241620', '#5a3a55', '#c86bff'],
    bridge: ['#4a5a78', '#33405a', '#b5c6e6', '#7fb8ff'],
    toxic: ['#45503c', '#2c3327', '#8aa070', '#9cff3b'],
    cold: ['#56687a', '#3a4756', '#c7dbe9', '#9fe6ff'],
};
const TILE_STYLE = {
    emergency: 'medical', surgery: 'medical', laboratory: 'medical', decon: 'medical', cafeteria: 'medical',
    armory: 'military', airlock: 'military', hatchControl: 'military', repository: 'military', evacA: 'military', evacB: 'military',
    generator: 'tech', fireControl: 'tech', engineRoom: 'tech', storage: 'tech', server: 'tech',
    engine: 'engine', nest: 'nest', cockpit: 'bridge', commandCenter: 'bridge', archives: 'bridge', comms: 'bridge',
    contaminated: 'toxic', containment: 'cold', hibernatorium: 'cold',
};

const RUN_SPEED = 9;   // world units per second for character runs between rooms

export class Scene3D {
    constructor(canvas, callbacks) {
        this.canvas = canvas; this.cb = callbacks || {};
        this.engine = new (B().Engine)(canvas, true, { antialias: true, stencil: false, preserveDrawingBuffer: false });
        this.scene = new (B().Scene)(this.engine);
        this.scene.clearColor = new (B().Color4)(0.025, 0.035, 0.055, 1);
        this.scene.fogMode = B().Scene.FOGMODE_EXP2; this.scene.fogDensity = 0.0028; this.scene.fogColor = new (B().Color3)(0.03, 0.04, 0.07);
        this.scene.ambientColor = new (B().Color3)(0.1, 0.11, 0.14);
        const cam = new (B().ArcRotateCamera)('cam', -Math.PI / 4, 0.95, 110, new (B().Vector3)(0, 0, 0), this.scene);
        cam.lowerBetaLimit = 0.4; cam.upperBetaLimit = 1.3; cam.lowerRadiusLimit = 14; cam.upperRadiusLimit = 220;
        cam.panningSensibility = 30; cam.wheelPrecision = 4; cam.angularSensibilityX = 1500; cam.angularSensibilityY = 1500;
        cam.attachControl(canvas, true);
        cam.panningAxis = new (B().Vector3)(1, 0, 1);
        cam.inputs.attached.pointers.buttons = [0, 1, 2];
        this.camera = cam;
        const hemi = new (B().HemisphericLight)('h', new (B().Vector3)(0.2, 1, 0.1), this.scene);
        hemi.intensity = 0.28; hemi.groundColor = new (B().Color3)(0.15, 0.13, 0.2);
        const sun = new (B().DirectionalLight)('sun', new (B().Vector3)(-0.6, -1, 0.4), this.scene);
        sun.intensity = 0.42; sun.position = new (B().Vector3)(60, 120, -40);
        this.shadows = new (B().ShadowGenerator)(2048, sun);
        this.shadows.usePercentageCloserFiltering = true; this.shadows.darkness = 0.45;
        this.roomNodes = {}; this.corridorNodes = {}; this.dynamic = []; this.chars = {}; this.intr = {}; this.hull = [];
        this.glow = new (B().GlowLayer)('glow', this.scene, { blurKernelSize: 48 }); this.glow.intensity = 0.5;
        this.shipKey = null; this.selectable = new Set(); this.hover = null; this.t = 0; this.lastShotSeen = null;
        this.me = null; this.poses = {}; this.drag = null; this.cursors = {}; this.pings = []; this.canvas = canvas;
        this.stars();
        this.scene.onPointerObservable.add(pi => this.onPointer(pi));
        this.engine.runRenderLoop(() => { this.t += this.engine.getDeltaTime() / 1000; this.animate(); this.scene.render(); });
        window.addEventListener('resize', () => this.engine.resize());
    }

    stars() {
        const pts = [];
        for (let i = 0; i < 700; i++) pts.push(new (B().Vector3)((Math.random() - 0.5) * 800, -60 - Math.random() * 200, (Math.random() - 0.5) * 800));
        const pcs = new (B().PointsCloudSystem)('stars', 1, this.scene);
        pcs.addPoints(pts.length, (p, i) => { p.position = pts[i]; p.color = new (B().Color4)(0.8, 0.85, 1, 0.8); });
        pcs.buildMeshAsync().then(m => { m.isPickable = false; });
        const deck = B().MeshBuilder.CreateGround('deck', { width: 600, height: 600 }, this.scene);
        deck.position.y = -0.7; deck.material = flatMat(this.scene, '#0a0e14'); deck.receiveShadows = true; deck.isPickable = false;
    }

    M(hex, e, extra) { return flatMat(this.scene, hex, Object.assign(e ? { emissive: e } : {}, extra || {})); }

    /** Merge a list of static meshes (grouped by material) into few draw calls. */
    mergeStatic(meshes, parent) {
        const groups = new Map();
        for (const m of meshes) { const k = m.material ? m.material.uniqueId : 0; (groups.get(k) || groups.set(k, []).get(k)).push(m); }
        const out = [];
        for (const arr of groups.values()) {
            let mesh = arr[0];
            if (arr.length > 1) { const mat = arr[0].material; mesh = B().Mesh.MergeMeshes(arr, true, true, undefined, false, false); if (!mesh) continue; mesh.material = mat; }
            mesh.parent = parent; mesh.isPickable = false; mesh.receiveShadows = true; this.shadows.addShadowCaster(mesh); out.push(mesh);
        }
        return out;
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
        for (const h of this.hull) h.dispose();
        this.roomNodes = {}; this.corridorNodes = {}; this.hull = [];
        const b = ship.bounds; this.cx = (b.minX + b.maxX) / 2; this.cy = (b.minY + b.maxY) / 2;
        this.camera.target.set(0, 0, 0);
        this.camera.radius = Math.max(70, (b.maxX - b.minX) * SCALE * 0.9);
        this.shipRooms = ship.rooms;
        for (const r of Object.values(ship.rooms)) this.buildRoomBase(r);
        for (const c of Object.values(ship.corridors)) this.buildCorridor(ship, c);
        this.buildHull(ship);
    }
    pos(r) { return new (B().Vector3)((r.x - this.cx) * SCALE, 0, -(r.y - this.cy) * SCALE); }
    posXY(x, y) { return new (B().Vector3)((x - this.cx) * SCALE, 0, -(y - this.cy) * SCALE); }

    /** Faint hull plating between the rooms so the deck is not an empty sheet. */
    buildHull(ship) {
        const S = this.scene; const b = ship.bounds;
        const statics = [];
        const w = (b.maxX - b.minX) * SCALE + 60, h = (b.maxY - b.minY) * SCALE + 50;
        const cols = ['#0d131a', '#101820', '#0b1016', '#121a23'];
        let seed = 7; const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
        for (let i = 0; i < 90; i++) {
            const pw = 6 + rnd() * 22, ph = 6 + rnd() * 22;
            const m = B().MeshBuilder.CreateBox('hp', { width: pw, height: 0.12, depth: ph }, S);
            // each plate sits a hair higher than the previous one, so overlaps never z-fight
            const y = -0.78 + i * 0.0025;
            m.position.set((rnd() - 0.5) * w, y, (rnd() - 0.5) * h); m.material = this.M(cols[i % 4]); statics.push(m);
            if (i % 3 === 0) { const g = B().MeshBuilder.CreateBox('hg', { width: pw * 0.9, height: 0.05, depth: 0.25 }, S); g.position.set(m.position.x, y + 0.08, m.position.z + (rnd() - 0.5) * ph * 0.6); g.material = this.M('#1a2430'); statics.push(g); }
        }
        // structural spines under the corridors
        for (const c of Object.values(ship.corridors)) {
            const pts = this.corridorPoints(ship, c);
            for (let i = 0; i < pts.length - 1; i++) {
                const a = pts[i], d = pts[i + 1]; const dir = d.subtract(a); const len = dir.length(); const mid = a.add(d).scale(0.5);
                const m = B().MeshBuilder.CreateBox('sp', { width: 5.5, height: 0.1, depth: len + 4 }, S);
                m.position.set(mid.x, -0.49 + (i % 3) * 0.004, mid.z); m.rotation.y = Math.atan2(dir.x, dir.z); m.material = this.M('#111920'); statics.push(m);
            }
        }
        // ring rims under rooms
        for (const r of Object.values(ship.rooms)) { const p = this.pos(r); const m = B().MeshBuilder.CreateCylinder('rr', { diameter: ROOM_R * 2 + 5, height: 0.1, tessellation: 6 }, S); m.position.set(p.x, -0.47, p.z); m.material = this.M('#121b24'); statics.push(m); }
        this.hull = this.mergeStatic(statics, null);
        for (const m of this.hull) m.receiveShadows = true;
    }

    // ---------------------------------------------------------------------------------------
    // Room base: platform + floor plates + tech stub + standing zone + label
    // ---------------------------------------------------------------------------------------
    buildRoomBase(r) {
        const S = this.scene;
        const root = new (B().TransformNode)('room_' + r.id, S);
        root.position = this.pos(r);
        const plat = B().MeshBuilder.CreateCylinder('plat_' + r.id, { diameter: ROOM_R * 2, height: 0.5, tessellation: 6 }, S);
        plat.parent = root; plat.position.y = -0.25; plat.material = this.M(KIND_COLORS[r.kind] || '#2a3440');
        plat.convertToFlatShadedMesh(); plat.receiveShadows = true;
        plat.metadata = { roomId: r.id }; plat.isPickable = true;
        const sel = B().MeshBuilder.CreateTorus('sel_' + r.id, { diameter: ROOM_R * 2 + 0.6, thickness: 0.4, tessellation: 6 }, S);
        sel.parent = root; sel.position.y = 0.05; sel.material = this.M('#ffb347', 1); sel.isPickable = false; sel.setEnabled(false);

        const statics = [];
        const tileA = this.M('#36414d'), tileB = this.M('#3c4855'), gapMat = this.M('#161b21');
        const fb = B().MeshBuilder.CreateCylinder('fb', { diameter: WALL_R * 2 + 0.4, height: 0.08, tessellation: 24 }, S);
        fb.material = gapMat; statics.push(fb);
        const T = 1.0;
        for (let gx = -7; gx <= 7; gx++) for (let gz = -7; gz <= 7; gz++) {
            const x = gx * T, z = gz * T;
            if (Math.hypot(x, z) > WALL_R - 0.5) continue;
            const t = B().MeshBuilder.CreateBox('ft', { width: T - 0.08, height: 0.06, depth: T - 0.08 }, S);
            t.position.set(x, 0.07, z); t.material = (gx + gz) % 2 ? tileA : tileB; statics.push(t);
        }
        // (the standing zone is not drawn: figures are placed there by code but the floor stays uniform)
        this.mergeStatic(statics, root);

        // exit angles (world) — used by walls, tech stub and props
        const exitAngles = r.exits.map(e => { const o = this.pos(this.shipRooms[e.to]).subtract(root.position); return Math.atan2(o.x, o.z); });
        let techAngle = null, techLeds = [];
        if (r.tech) {
            // pick the direction farthest from every exit (and away from the standing zone)
            let best = -1;
            for (let i = 0; i < 36; i++) {
                const a = i / 36 * Math.PI * 2;
                let d = Math.min(...exitAngles.map(ea => Math.abs(Math.atan2(Math.sin(a - ea), Math.cos(a - ea)))), 9);
                const zd = Math.abs(Math.atan2(Math.sin(a - Math.atan2(ZONE_C.x, ZONE_C.z)), Math.cos(a - Math.atan2(ZONE_C.x, ZONE_C.z))));
                d = Math.min(d, zd * 0.8);
                if (d > best) { best = d; techAngle = a; }
            }
            techLeds = this.buildTechStub(root, techAngle);
        }
        const label = this.makeLabel('lbl_' + r.id, r.id, '', root, 0, 3.2, 0, 3.0);
        // face-down room token: a big "?" printed on the unexplored floor
        const qm = this.makeLabel('qm_' + r.id, '?', '', root, 0, 0.13, 0, 7.5);
        qm.rotation.set(Math.PI / 2, 0, 0); qm.billboardMode = 0; qm.isPickable = false;
        { const ctx = qm.metadata.dt.getContext(); ctx.clearRect(0, 0, 512, 160); ctx.font = 'bold 150px Segoe UI, Arial'; ctx.textAlign = 'center'; ctx.fillStyle = '#56687c'; ctx.fillText('?', 256, 138); qm.metadata.dt.update(); qm.metadata.text = 'qm'; }
        this.roomNodes[r.id] = { root, plat, sel, label, qm, data: r, exitAngles, techAngle, techLeds, shell: null, shellKey: null, strips: null, emergency: [], malfunction: false, flicker: Math.random() * 10, flip: null, pop: null };
    }

    /** Technical-corridor entrance: a short tunnel through the wall line, ringed with blue LEDs. */
    buildTechStub(root, a) {
        const S = this.scene;
        const statics = [];
        const sx = Math.sin(a), cz = Math.cos(a);
        const px = sx * (WALL_R + 0.4), pz = cz * (WALL_R + 0.4);
        const mk = (w, h, d, ox, y, oz, mat) => { const m = B().MeshBuilder.CreateBox('ts', { width: w, height: h, depth: d }, S); m.position.set(px + Math.cos(a) * ox - Math.sin(a) * oz, y, pz - Math.sin(a) * ox - Math.cos(a) * oz); m.rotation.y = a; m.material = mat; statics.push(m); return m; };
        const steel = this.M('#6d7f8f'), dark = this.M('#0b1016'), trim = this.M('#aab6c2');
        mk(2.4, 0.3, 2.4, 0, -0.1, 0.4, steel);                       // tunnel floor
        mk(2.4, 1.7, 0.3, 0, 0.85, 1.5, steel);                       // back wall of the stub
        for (const s of [-1, 1]) mk(0.3, 1.7, 2.4, s * 1.2, 0.85, 0.4, steel);  // side walls
        mk(2.4, 0.25, 2.4, 0, 1.75, 0.4, trim);                       // roof
        // roof: two thin blue light rails (same muted blue as the floor runner) and steel conduit pipes with cross-bars
        for (const s of [-1, 1]) mk(0.08, 0.06, 2.0, s * 0.95, 1.9, 0.3, this.M('#2f6fa8', 0.6));
        for (const ox of [-0.55, 0, 0.55]) { const pipe = B().MeshBuilder.CreateCylinder('tp', { diameter: 0.16, height: 2.0, tessellation: 6 }, S); pipe.position.set(px + Math.cos(a) * ox - Math.sin(a) * 0.3, 1.96, pz - Math.sin(a) * ox - Math.cos(a) * 0.3); pipe.rotation.set(Math.PI / 2, a, 0); pipe.material = this.M('#55636f'); statics.push(pipe); }
        for (let i = 0; i < 3; i++) mk(2.3, 0.1, 0.12, 0, 1.94, -0.4 + i * 0.7, this.M('#3a4652'));
        mk(1.6, 1.3, 0.2, 0, 0.75, 1.3, dark);                        // dark opening
        mk(1.5, 0.06, 2.0, 0, 0.09, 0.3, this.M('#2f6fa8', 0.5));      // blue floor runner
        for (let i = 0; i < 3; i++) mk(0.1, 0.05, 1.6, -0.6 + i * 0.6, 0.22, 0.5, this.M('#2a3038'));  // grating
        this.mergeStatic(statics, root);
        // LED ring around the opening (separate meshes: colour changes with tech noise)
        const leds = [];
        const ledMat = this.M('#3fa9ff', 1);
        const ring = [[-1.0, 0.3], [-1.0, 0.9], [-1.0, 1.5], [-0.5, 1.9], [0.5, 1.9], [1.0, 1.5], [1.0, 0.9], [1.0, 0.3]];
        for (const [ox, y] of ring) { const m = B().MeshBuilder.CreateBox('led', { width: 0.14, height: 0.14, depth: 0.08 }, S); m.position.set(px + Math.cos(a) * ox + Math.sin(a) * 0.95, y, pz - Math.sin(a) * ox + Math.cos(a) * 0.95); m.rotation.y = a; m.material = ledMat; m.parent = root; m.isPickable = false; leds.push(m); }
        return leds;
    }

    // ---------------------------------------------------------------------------------------
    // Room shell: walls + portals + props + dressing (once the tile is known)
    // ---------------------------------------------------------------------------------------
    buildShell(node, tile) {
        const S = this.scene; const root = new (B().TransformNode)('shell', S); root.parent = node.root;
        const style = WALL_STYLES[TILE_STYLE[tile] || 'steel'];
        const wallMat = this.M(style[0]), wallDark = this.M(style[1]), trimMat = this.M(style[2]);
        const accentHex = TILE_ACCENT[tile] || '#8a99ab';
        const statics = [];
        // per-room strip material (unfrozen: switches to red emergency light on malfunction)
        const strips = new (B().StandardMaterial)('strips_' + node.data.id, S);
        strips.diffuseColor = B().Color3.FromHexString(style[3]); strips.emissiveColor = B().Color3.FromHexString(style[3]).scale(0.9); strips.specularColor = B().Color3.Black();
        const stripMeshes = [];
        const GAP = 0.24, TGAP = 0.22, N = 60;
        const nearAngle = (a, list, g) => list.some(ea => Math.abs(Math.atan2(Math.sin(a - ea), Math.cos(a - ea))) < g);
        const blocked = a => nearAngle(a, node.exitAngles, GAP) || (node.techAngle !== null && nearAngle(a, [node.techAngle], TGAP));
        const segLen = 2 * Math.PI * WALL_R / N + 0.02;
        let run = 0;
        for (let i = 0; i < N; i++) {
            const a = (i + 0.5) / N * Math.PI * 2;
            if (blocked(a)) { run = 0; continue; }
            run++;
            const x = Math.sin(a) * WALL_R, z = Math.cos(a) * WALL_R;
            const w = B().MeshBuilder.CreateBox('w', { width: segLen, height: WALL_H, depth: 0.24 }, S);
            w.position.set(x, WALL_H / 2, z); w.rotation.y = a; w.material = (i % 4 === 0) ? wallDark : wallMat; statics.push(w);
            const p = B().MeshBuilder.CreateBox('wp', { width: segLen * 0.7, height: WALL_H * 0.42, depth: 0.05 }, S);
            p.position.set(Math.sin(a) * (WALL_R - 0.13), WALL_H * 0.48, Math.cos(a) * (WALL_R - 0.13)); p.rotation.y = a; p.material = wallDark; statics.push(p);
            const tr = B().MeshBuilder.CreateBox('wt', { width: segLen, height: 0.1, depth: 0.32 }, S);
            tr.position.set(x, WALL_H + 0.03, z); tr.rotation.y = a; tr.material = trimMat; statics.push(tr);
            const st = B().MeshBuilder.CreateBox('ws', { width: segLen, height: 0.06, depth: 0.04 }, S);
            st.position.set(Math.sin(a) * (WALL_R - 0.15), WALL_H - 0.2, Math.cos(a) * (WALL_R - 0.15)); st.rotation.y = a; stripMeshes.push(st);
            if (run % 8 === 4) {
                const pl = B().MeshBuilder.CreateBox('pl', { width: 0.46, height: WALL_H + 0.55, depth: 0.46 }, S);
                pl.position.set(x, (WALL_H + 0.55) / 2, z); pl.rotation.y = a; pl.material = trimMat; statics.push(pl);
                const cap = B().MeshBuilder.CreateBox('cap', { width: 0.32, height: 0.08, depth: 0.32 }, S);
                cap.position.set(x, WALL_H + 0.6, z); cap.rotation.y = a; stripMeshes.push(cap);
                // wall-mounted industrial lamp between pillars
                const lamp = B().MeshBuilder.CreateBox('lamp', { width: 0.5, height: 0.16, depth: 0.2 }, S);
                lamp.position.set(Math.sin(a) * (WALL_R - 0.25), WALL_H - 0.55, Math.cos(a) * (WALL_R - 0.25)); lamp.rotation.y = a; lamp.material = this.M('#2a3038'); statics.push(lamp);
                const lg = B().MeshBuilder.CreateBox('lg', { width: 0.4, height: 0.06, depth: 0.1 }, S);
                lg.position.set(Math.sin(a) * (WALL_R - 0.34), WALL_H - 0.62, Math.cos(a) * (WALL_R - 0.34)); lg.rotation.y = a; stripMeshes.push(lg);
            }
        }
        // door portals
        for (const ea of node.exitAngles) {
            const px = Math.sin(ea) * WALL_R, pz = Math.cos(ea) * WALL_R;
            for (const sd of [-1, 1]) {
                const post = B().MeshBuilder.CreateBox('dp', { width: 0.4, height: WALL_H + 0.95, depth: 0.55 }, S);
                post.position.set(px + Math.cos(ea) * sd * 1.3, (WALL_H + 0.95) / 2, pz - Math.sin(ea) * sd * 1.3); post.rotation.y = ea; post.material = trimMat; statics.push(post);
                const pl = B().MeshBuilder.CreateBox('dpl', { width: 0.12, height: 0.9, depth: 0.1 }, S);
                pl.position.set(px + Math.cos(ea) * sd * 1.3 - Math.sin(ea) * 0.3, 1.0, pz - Math.sin(ea) * sd * 1.3 - Math.cos(ea) * 0.3); pl.rotation.y = ea; pl.material = this.M(accentHex, 0.8); statics.push(pl);
            }
            const lintel = B().MeshBuilder.CreateBox('dl', { width: 3.0, height: 0.4, depth: 0.55 }, S);
            lintel.position.set(px, WALL_H + 0.8, pz); lintel.rotation.y = ea; lintel.material = trimMat; statics.push(lintel);
            const lamp = B().MeshBuilder.CreateBox('dlamp', { width: 1.3, height: 0.08, depth: 0.1 }, S);
            lamp.position.set(px - Math.sin(ea) * 0.3, WALL_H + 0.55, pz - Math.cos(ea) * 0.3); lamp.rotation.y = ea; stripMeshes.push(lamp);
            const th = B().MeshBuilder.CreateBox('th', { width: 2.3, height: 0.05, depth: 0.8 }, S);
            th.position.set(px - Math.sin(ea) * 0.5, 0.11, pz - Math.cos(ea) * 0.5); th.rotation.y = ea; th.material = this.M('#c9a227'); statics.push(th);
            for (let k = 0; k < 4; k++) { const hz = B().MeshBuilder.CreateBox('hz', { width: 0.25, height: 0.06, depth: 0.8 }, S); hz.position.set(px - Math.sin(ea) * 0.5 + Math.cos(ea) * (-0.9 + k * 0.6), 0.12, pz - Math.cos(ea) * 0.5 - Math.sin(ea) * (-0.9 + k * 0.6)); hz.rotation.y = ea; hz.material = this.M('#1a1a1a'); statics.push(hz); }
        }
        // emergency lamps (red, only on malfunction)
        const emergency = [];
        for (let k = 0; k < 3; k++) {
            const a = k / 3 * Math.PI * 2 + 0.5;
            if (blocked(a)) continue;
            const e = B().MeshBuilder.CreateBox('em', { width: 0.42, height: 0.26, depth: 0.26 }, S);
            e.position.set(Math.sin(a) * (WALL_R - 0.3), WALL_H + 0.25, Math.cos(a) * (WALL_R - 0.3)); e.rotation.y = a; e.parent = root; e.isPickable = false;
            e.material = this.M('#ff3a3a', 1.6); e.setEnabled(false); emergency.push(e);
        }
        this.mergeStatic(statics, root);
        const stripMesh = this.mergeStatic(stripMeshes, root)[0];
        if (stripMesh) stripMesh.material = strips;
        // floor finish + props
        this.buildFloor(tile, root);
        this.buildProps(tile, root, node);
        return { root, strips, emergency, stripMesh };
    }

    /**
     * Floor finish per tile family, laid over the neutral deck plates once the room is explored:
     * medical — pale large tiles; military — olive diamond plate; tech — steel grating (storage: concrete
     * with yellow zone lines); engine — grating + hazard ring; nest — organic resin and slime; bridge —
     * dark glossy panels with light seams; toxic — stained deck with puddles; cold — frosted hex plates.
     */
    buildFloor(tile, root) {
        const S = this.scene; const fam = TILE_STYLE[tile] || 'steel';
        const statics = [];
        const R = WALL_R - 0.35, Y = 0.115;
        const inR = (x, z, m = 0) => Math.hypot(x, z) < R - m;
        const box = (w, h, d, x, y, z, mat, ry = 0) => { const m = B().MeshBuilder.CreateBox('fl', { width: w, height: h, depth: d }, S); m.position.set(x, y, z); m.rotation.y = ry; m.material = mat; statics.push(m); return m; };
        const disc = (dia, h, x, y, z, mat, tess = 24) => { const m = B().MeshBuilder.CreateCylinder('fd', { diameter: dia, height: h, tessellation: tess }, S); m.position.set(x, y, z); m.material = mat; statics.push(m); return m; };
        const base = (hex) => disc(R * 2, 0.04, 0, Y, 0, this.M(hex), 32);
        let seed = tile.length * 31; const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
        switch (tile === 'storage' ? 'storage' : fam) {
            case 'medical': {
                base('#8f9ba3');
                const a = this.M('#c3ccd3'), b = this.M('#b2bcc4');
                for (let gx = -4; gx <= 4; gx++) for (let gz = -4; gz <= 4; gz++) { const x = gx * 1.45, z = gz * 1.45; if (!inR(x, z, 0.7)) continue; box(1.32, 0.04, 1.32, x, Y + 0.03, z, (gx + gz) % 2 ? a : b); }
                box(1.2, 0.02, 0.3, 0, Y + 0.06, 0, this.M('#c0392b')); box(0.3, 0.02, 1.2, 0, Y + 0.06, 0, this.M('#c0392b'));
                break;
            }
            case 'military': {
                base('#3b4136');
                const stud = this.M('#4d5547');
                for (let gx = -9; gx <= 9; gx++) for (let gz = -9; gz <= 9; gz++) { const x = gx * 0.62 + (gz % 2) * 0.31, z = gz * 0.62; if (!inR(x, z, 0.5)) continue; box(0.22, 0.03, 0.1, x, Y + 0.03, z, stud, Math.PI / 4); }
                for (const s of [-1, 1]) box(0.25, 0.02, R * 1.2, s * 2.6, Y + 0.035, 0, this.M('#9c8a2a'));
                break;
            }
            case 'storage': {
                base('#4a4f55');
                const yel = this.M('#d4b02a', 0.15);
                for (const [x, z, w, d] of [[-3.2, 2.4, 2.6, 2.2], [0.4, 3.0, 2.8, 1.8], [3.4, 0.6, 2.0, 2.6], [-3.6, -1.6, 2.2, 2.0], [-0.8, -3.6, 2.4, 1.6]]) {
                    box(w, 0.02, 0.12, x, Y + 0.035, z - d / 2, yel); box(w, 0.02, 0.12, x, Y + 0.035, z + d / 2, yel);
                    box(0.12, 0.02, d, x - w / 2, Y + 0.035, z, yel); box(0.12, 0.02, d, x + w / 2, Y + 0.035, z, yel);
                }
                for (let i = 0; i < 14; i++) box(0.5, 0.02, 0.12, -3.5 + i * 0.55, Y + 0.035, 0.1, yel, Math.PI / 4);   // hatched walkway edge
                break;
            }
            case 'tech': {
                base('#242b33');
                const bar = this.M('#39434e');
                for (let i = -8; i <= 8; i++) { const x = i * 0.7; const len = Math.sqrt(Math.max(0, R * R - x * x)) * 2 - 0.6; if (len > 0.4) box(0.12, 0.03, len, x, Y + 0.03, 0, bar); }
                for (let i = -3; i <= 3; i++) box(R * 2 - 1.2, 0.03, 0.16, 0, Y + 0.032, i * 1.7, this.M('#4a5663'));
                break;
            }
            case 'engine': {
                base('#1f252b');
                const bar = this.M('#343d47');
                for (let i = -8; i <= 8; i++) { const x = i * 0.7; const len = Math.sqrt(Math.max(0, R * R - x * x)) * 2 - 0.6; if (len > 0.4) box(0.1, 0.03, len, x, Y + 0.03, 0, bar); }
                const hz = this.M('#e0a020', 0.1), hzD = this.M('#1a1a1a');
                for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; box(0.6, 0.03, 0.35, Math.cos(a) * 3.6, Y + 0.035, Math.sin(a) * 3.6, i % 2 ? hz : hzD, -a); }
                disc(1.6, 0.05, 0, Y + 0.03, 0, this.M('#2b333c'), 12);
                break;
            }
            case 'nest': {
                base('#2a1d28');
                const resin = this.M('#4a2f48'), slime = this.M('#6fa02a', 0.5), dark = this.M('#1a1016');
                for (let i = 0; i < 26; i++) { const a = rnd() * Math.PI * 2, d = rnd() * (R - 1); const x = Math.cos(a) * d, z = Math.sin(a) * d; const m = disc(0.6 + rnd() * 1.6, 0.05 + rnd() * 0.08, x, Y + 0.03, z, i % 4 ? resin : dark, 7); m.scaling.z = 0.6 + rnd() * 0.6; m.rotation.y = rnd() * 3; }
                for (let i = 0; i < 8; i++) { const a = rnd() * Math.PI * 2, d = rnd() * (R - 1.2); disc(0.4 + rnd() * 0.8, 0.03, Math.cos(a) * d, Y + 0.09, Math.sin(a) * d, slime, 8); }
                for (let i = 0; i < 10; i++) { const a = rnd() * Math.PI * 2; box(0.14, 0.03, 1.2 + rnd() * 2, Math.cos(a) * (R - 1.4), Y + 0.1, Math.sin(a) * (R - 1.4), resin, -a + Math.PI / 2); }   // tendrils creeping in from the walls
                break;
            }
            case 'bridge': {
                base('#1c2736');
                const seam = this.M('#4aa3df', 0.45), panel = this.M('#223044');
                for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; box(0.08, 0.02, R - 0.8, Math.cos(a) * (R / 2 + 0.2), Y + 0.04, Math.sin(a) * (R / 2 + 0.2), seam, -a + Math.PI / 2); }
                for (let i = 0; i < 16; i++) { const a = (i + 0.5) / 16 * Math.PI * 2; box(1.4, 0.03, 1.6, Math.cos(a) * 3.9, Y + 0.03, Math.sin(a) * 3.9, panel, -a + Math.PI / 2); }
                for (const d of [2.2, 4.4]) { const ring = B().MeshBuilder.CreateTorus('fr', { diameter: d * 2, thickness: 0.08, tessellation: 32 }, S); ring.position.y = Y + 0.04; ring.scaling.y = 0.3; ring.material = seam; statics.push(ring); }
                disc(1.6, 0.05, 0, Y + 0.03, 0, this.M('#2a3b55'), 16);
                break;
            }
            case 'toxic': {
                base('#2d3a2a');
                const pud = this.M('#8fd13a', 0.35), stain = this.M('#3f4a2a');
                for (let i = 0; i < 9; i++) { const a = rnd() * Math.PI * 2, d = rnd() * (R - 1.2); const m = disc(0.8 + rnd() * 1.8, 0.03, Math.cos(a) * d, Y + 0.03, Math.sin(a) * d, i % 3 ? stain : pud, 9); m.scaling.z = 0.5 + rnd() * 0.7; }
                for (let gx = -5; gx <= 5; gx++) for (let gz = -5; gz <= 5; gz++) { const x = gx * 1.1, z = gz * 1.1; if (!inR(x, z, 0.6) || (gx + gz) % 2) continue; box(1.0, 0.02, 1.0, x, Y + 0.025, z, this.M('#34422f')); }
                break;
            }
            case 'cold': {
                base('#566b7c');
                const hexA = this.M('#6d8699'), hexB = this.M('#7f98ab'), frost = this.M('#cfe6f5', 0.2);
                let k = 0;
                for (let gx = -5; gx <= 5; gx++) for (let gz = -6; gz <= 6; gz++) { const x = gx * 1.5 + (gz % 2) * 0.75, z = gz * 0.87; if (!inR(x, z, 0.8)) continue; const m = disc(1.4, 0.03, x, Y + 0.03, z, (k++) % 3 ? hexA : hexB, 6); m.rotation.y = Math.PI / 6; }
                const ring = B().MeshBuilder.CreateTorus('fr', { diameter: 7.2, thickness: 0.18, tessellation: 32 }, S); ring.position.y = Y + 0.04; ring.scaling.y = 0.3; ring.material = frost; statics.push(ring);
                break;
            }
            default: {
                // steel: slightly darker plates with riveted seams
                base('#333d48');
                const seam = this.M('#1c232b');
                for (let i = -3; i <= 3; i++) { box(0.08, 0.03, R * 2 - 1, i * 1.8, Y + 0.03, 0, seam); box(R * 2 - 1, 0.03, 0.08, 0, Y + 0.03, i * 1.8, seam); }
            }
        }
        for (const m of statics) m.receiveShadows = true;
        this.mergeStatic(statics, root);
    }

    // ---------------------------------------------------------------------------------------
    // Props. Authored around the origin for a ~4-unit room, then spread and pushed out of the
    // standing zone. Perimeter dressing is added automatically per tile family.
    // ---------------------------------------------------------------------------------------
    buildProps(tile, parent, node) {
        const S = this.scene;
        const root = new (B().TransformNode)('props', S); root.parent = parent;
        const M = (hex, e, extra) => this.M(hex, e, extra);
        const statics = [];
        const bx = (w, h, d, x, y, z, mat, ry = 0, rx = 0) => { const m = B().MeshBuilder.CreateBox('p', { width: w, height: h, depth: d }, S); m.position.set(x, y, z); m.rotation.y = ry; m.rotation.x = rx; m.material = mat; statics.push(m); return m; };
        const cy = (dt, db, h, x, y, z, mat, tess = 8, rz = 0) => { const m = B().MeshBuilder.CreateCylinder('p', { diameterTop: dt, diameterBottom: db, height: h, tessellation: tess }, S); m.position.set(x, y, z); m.rotation.z = rz; m.material = mat; m.convertToFlatShadedMesh(); statics.push(m); return m; };
        const accentHex = TILE_ACCENT[tile] || '#8a99ab';
        const accent = M(accentHex, 0.6), metal = M('#8c96a0'), dark = M('#2b333d'), panel = M('#4a5a6e'), white = M('#dfe6ee');
        const screen = M('#4aa3df', 0.9), crateMat = M('#6b5a3c'), crateMat2 = M('#52607a'), hazard = M('#c9a227'), olive = M('#5a6a3a');
        const console_ = (x, z, ry) => { bx(1.4, 0.9, 0.6, x, 0.45, z, panel, ry); bx(1.2, 0.7, 0.08, x - Math.sin(ry) * 0.2, 1.15, z - Math.cos(ry) * 0.2, screen, ry, -0.3); bx(1.1, 0.05, 0.4, x + Math.sin(ry) * 0.1, 0.92, z + Math.cos(ry) * 0.1, dark, ry); bx(0.3, 0.04, 0.2, x, 0.95, z, accent, ry); };
        const crate = (x, z, s = 1, ry = 0, mat = crateMat) => { bx(s, s, s, x, s / 2, z, mat, ry); bx(s * 1.02, 0.08, 0.12, x, s * 0.5, z, dark, ry); bx(0.12, 0.08, s * 1.02, x, s * 0.5, z, dark, ry); };
        const ammoBox = (x, z, ry, open) => { bx(0.7, 0.35, 0.45, x, 0.18, z, olive, ry); bx(0.72, 0.04, 0.47, x, 0.37, z, dark, ry); if (open) { bx(0.7, 0.04, 0.45, x - Math.sin(ry) * 0.35, 0.55, z - Math.cos(ry) * 0.35, olive, ry, 1.2); for (let k = 0; k < 4; k++) cy(0.06, 0.06, 0.2, x + Math.cos(ry) * (-0.2 + k * 0.13), 0.42, z - Math.sin(ry) * (-0.2 + k * 0.13), M('#c9a227'), 6); } else bx(0.7, 0.06, 0.45, x, 0.39, z, olive, ry); };
        const vest = (x, z, ry) => { bx(0.5, 0.06, 0.6, x, 0.1, z, M('#6b7a3c'), ry); bx(0.3, 0.05, 0.2, x, 0.14, z + 0.15, dark, ry); bx(0.1, 0.05, 0.5, x - 0.3, 0.1, z, M('#6b7a3c'), ry); };
        const locker = (x, z, ry) => { bx(0.9, 1.6, 0.5, x, 0.8, z, panel, ry); bx(0.04, 1.4, 0.04, x, 0.8, z + 0.26, metal, ry); bx(0.3, 0.06, 0.03, x, 1.2, z + 0.26, accent, ry); };
        const plant = (x, z) => { cy(0.5, 0.4, 0.4, x, 0.2, z, dark, 6); for (let i = 0; i < 4; i++) { const m = B().MeshBuilder.CreatePolyhedron('cr', { type: 1, size: 0.14 + (i % 2) * 0.08 }, S); m.position.set(x + (i - 1.5) * 0.14, 0.6 + (i % 3) * 0.18, z + ((i * 7) % 3 - 1) * 0.12); m.material = M('#ff5ad6', 0.7); m.convertToFlatShadedMesh(); statics.push(m); } };
        const bench = (x, z, ry) => { bx(1.3, 0.08, 0.4, x, 0.45, z, M('#b07a3c'), ry); for (const s of [-1, 1]) bx(0.08, 0.45, 0.4, x + Math.cos(ry) * s * 0.55, 0.22, z - Math.sin(ry) * s * 0.55, dark, ry); };
        const pipes = (x, z, ry, n = 3) => { for (let i = 0; i < n; i++) cy(0.14, 0.14, 2.6, x + Math.sin(ry + Math.PI / 2) * i * 0.2, 0.2 + i * 0.2, z + Math.cos(ry + Math.PI / 2) * i * 0.2, i % 2 ? metal : hazard, 6, Math.PI / 2); };
        const bed = (x, z, ry) => { bx(0.9, 0.3, 2.0, x, 0.3, z, metal, ry); bx(0.84, 0.12, 1.9, x, 0.5, z, white, ry); bx(0.6, 0.1, 0.4, x, 0.58, z + 0.7, M('#c0392b'), ry); };
        const floorZone = (x, z, w, d, ry, mat) => { bx(w, 0.03, 0.12, x, 0.11, z - d / 2, mat, ry); bx(w, 0.03, 0.12, x, 0.11, z + d / 2, mat, ry); bx(0.12, 0.03, d, x - w / 2, 0.11, z, mat, ry); bx(0.12, 0.03, d, x + w / 2, 0.11, z, mat, ry); };
        const barrel = (x, z, mat) => { cy(0.55, 0.55, 0.8, x, 0.4, z, mat, 10); cy(0.57, 0.57, 0.06, x, 0.25, z, dark, 10); cy(0.57, 0.57, 0.06, x, 0.6, z, dark, 10); };

        switch (tile) {
            case 'cockpit':
                bx(3.2, 0.5, 1.2, 0, 0.25, 2.2, panel); bx(3.0, 1.3, 0.1, 0, 1.2, 2.75, screen, 0, -0.15); bx(0.6, 0.8, 0.1, -1.9, 1.0, 2.4, screen, 0.5); bx(0.6, 0.8, 0.1, 1.9, 1.0, 2.4, screen, -0.5);
                for (const s of [-1, 1]) { cy(0.7, 0.7, 0.3, s * 1.0, 0.15, 0.8, dark, 6); bx(0.6, 0.6, 0.5, s * 1.0, 0.6, 0.8, M('#5a3a3a')); bx(0.6, 0.7, 0.15, s * 1.0, 1.1, 0.5, M('#5a3a3a')); }
                console_(-2.2, -1.5, 1.0); console_(2.2, -1.5, -1.0); plant(0, -2.6); bx(1.2, 0.06, 0.8, 0, 1.0, -0.6, M('#7fb8ff', 0.6)); bx(1.3, 0.9, 0.9, 0, 0.45, -0.6, panel);
                break;
            case 'hibernatorium':
                for (let i = 0; i < 5; i++) { const a = -1.0 + i * 0.5; const x = Math.sin(a) * 2.4, z = Math.cos(a) * 2.4; bx(1.0, 0.5, 2.2, x, 0.25, z, metal, a); bx(0.9, 0.6, 2.0, x, 0.8, z, M('#7fc7ff', 0.25, { alpha: 0.55 }), a); bx(0.9, 0.1, 0.4, x, 1.15, z, M('#3a4a5a'), a); bx(0.2, 0.05, 0.05, x, 1.2, z, M('#4fcf7a', 1), a); }
                console_(0, -2.4, Math.PI); plant(-2.6, -1.4); plant(2.6, -1.4); pipes(0, 2.9, Math.PI / 2, 2);
                break;
            case 'engine':
                cy(3.0, 3.4, 1.8, 0, 0.9, -0.6, metal, 10); cy(1.8, 2.2, 0.8, 0, 1.1, 1.0, accent, 10); cy(1.1, 1.1, 0.5, 0, 1.2, 1.6, M('#ffb347', 1), 10);
                for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; bx(0.3, 0.7, 0.3, Math.cos(a) * 1.9, 2.1, Math.sin(a) * 1.9 - 0.6, dark); }
                pipes(0, 2.9, Math.PI / 2, 2); pipes(-2.9, 0, 0, 2); console_(2.4, 2.0, -2.3); barrel(-2.6, 2.2, hazard); floorZone(0, -0.3, 4.2, 3.6, 0, hazard);
                break;
            case 'archives':
                for (let i = 0; i < 3; i++) { bx(0.6, 2.0, 2.4, -2.5 + i * 1.1, 1.0, -0.6, panel); for (let k = 0; k < 4; k++) bx(0.62, 0.06, 2.2, -2.5 + i * 1.1, 0.4 + k * 0.45, -0.6, metal); for (let k = 0; k < 6; k++) bx(0.1, 0.3, 0.25, -2.5 + i * 1.1 + 0.28, 0.6 + (k % 4) * 0.45, -1.5 + k * 0.35, k % 2 ? accent : screen); }
                console_(2.2, -1.8, -0.7); bench(1.6, 1.8, 0.2); plant(2.8, 1.0); bx(1.0, 0.8, 0.6, -0.5, 0.4, 2.2, panel); bx(0.8, 0.05, 0.5, -0.5, 0.82, 2.2, screen);
                break;
            case 'comms':
                cy(0.3, 0.6, 3.4, -1.4, 1.7, 0.6, metal, 6); cy(2.4, 0.2, 0.7, -1.4, 3.5, 0.6, accent, 12); cy(0.1, 0.1, 1.0, -1.4, 4.2, 0.6, metal, 6); bx(0.2, 0.2, 0.2, -1.4, 4.7, 0.6, M('#e05252', 1));
                console_(1.8, -1.6, -0.8); console_(2.4, 0.6, -1.6); crate(0.8, 2.2, 0.8); for (let k = 0; k < 3; k++) bx(0.5, 1.4, 0.3, -2.6 + k * 0.55, 0.7, -2.0, dark); for (let k = 0; k < 3; k++) bx(0.3, 0.06, 0.04, -2.6 + k * 0.55, 1.1, -1.83, M('#4fcf7a', 0.9));
                break;
            case 'emergency':
                bed(-1.0, 0.8, 0); bed(1.4, 0.8, 0); bx(0.6, 1.6, 0.6, -2.6, 0.8, -1.2, M('#4fcf7a', 0.3)); bx(0.5, 0.5, 0.1, -2.6, 1.0, -0.88, M('#e05252', 0.8));
                bx(0.8, 0.9, 0.5, 2.6, 0.45, -1.4, white); bx(0.7, 0.04, 0.4, 2.6, 0.92, -1.4, M('#e05252')); locker(0.4, -2.6, Math.PI); cy(0.1, 0.1, 1.6, 0.2, 0.8, 0.8, metal, 6); bx(0.3, 0.4, 0.1, 0.2, 1.5, 0.8, M('#7fc7ff', 0.5, { alpha: 0.7 }));
                break;
            case 'evacA': case 'evacB':
                for (const s of [-1, 1]) { cy(1.5, 1.9, 2.2, s * 1.9, 1.1, -1.0, metal, 8); cy(0.6, 1.5, 0.9, s * 1.9, 2.65, -1.0, accent, 8); bx(0.6, 0.8, 0.1, s * 1.9, 1.0, -0.05, M('#7fc7ff', 0.5)); for (let i = 0; i < 4; i++) bx(0.08, 1.0, 0.08, s * 1.9 + Math.cos(i * 1.57) * 0.95, 0.5, -1.0 + Math.sin(i * 1.57) * 0.95, dark); }
                bx(2.6, 0.08, 1.0, 0, 0.1, 1.9, M('#e05252', 0.5)); for (let i = 0; i < 5; i++) bx(0.3, 0.09, 1.0, -1.1 + i * 0.55, 0.11, 1.9, M('#f1c40f', 0.6)); console_(0, -2.6, Math.PI); floorZone(0, -1.0, 6.0, 3.0, 0, hazard);
                break;
            case 'fireControl':
                for (let i = 0; i < 3; i++) { cy(0.5, 0.5, 1.2, -1.6 + i * 1.0, 0.6, 1.4, M('#e05252'), 8); cy(0.2, 0.2, 0.3, -1.6 + i * 1.0, 1.35, 1.4, metal, 6); }
                bx(2.2, 1.5, 0.4, 0, 0.75, -2.2, panel); bx(1.8, 0.6, 0.06, 0, 1.0, -1.97, M('#e05252', 0.5)); console_(2.3, 0.4, -1.4); pipes(-2.9, -0.4, 0, 3); barrel(2.4, 2.2, M('#e05252')); barrel(2.0, 2.8, M('#e05252'));
                break;
            case 'generator':
                cy(2.4, 2.6, 2.4, 0, 1.2, 0, metal, 8); cy(0.9, 0.9, 1.0, 0, 2.9, 0, accent, 8); cy(1.4, 1.4, 0.3, 0, 1.2, 0, M('#f1c40f', 1), 8);
                for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; bx(0.4, 0.4, 2.2, Math.cos(a) * 1.9, 0.2, Math.sin(a) * 1.9, dark, -a); }
                console_(2.6, -2.0, -2.4); barrel(-2.6, 2.0, hazard); barrel(-2.0, 2.6, hazard); floorZone(0, 0, 4.4, 4.4, 0, hazard);
                break;
            case 'laboratory':
                bx(3.2, 0.9, 1.0, 0, 0.45, 1.4, white); bx(3.2, 0.06, 1.0, 0, 0.93, 1.4, M('#9fb4c8')); cy(0.4, 0.4, 1.0, -1, 1.45, 1.4, M('#4fcf7a', 0.7, { alpha: 0.7 }), 8); cy(0.4, 0.4, 0.7, 0.2, 1.3, 1.4, M('#b26bd6', 0.7, { alpha: 0.7 }), 8); bx(0.5, 0.4, 0.3, 1.1, 1.15, 1.4, metal);
                bx(2.0, 2.2, 1.0, 0, 1.1, -2.2, M('#7fc7ff', 0.2, { alpha: 0.5 })); bx(2.1, 0.15, 1.1, 0, 0.08, -2.2, metal); bx(2.1, 0.15, 1.1, 0, 2.2, -2.2, metal); console_(2.6, -0.6, -1.5); locker(-2.7, -0.4, 1.3);
                break;
            case 'nest':
                cy(3.2, 3.9, 0.3, 0, 0.15, 0, M('#4a2c4a'), 9);
                for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; cy(0.1, 0.9, 1.4 + (i % 3) * 0.5, Math.cos(a) * 3.1, 0.7, Math.sin(a) * 3.1, M('#3a2a3a'), 5); cy(0.05, 0.4, 1.2, Math.cos(a) * 2.2, 0.6, Math.sin(a) * 2.2, M('#5a3a5a'), 4); }
                for (let i = 0; i < 5; i++) bx(0.6, 0.1, 1.6, Math.cos(i * 1.3) * 1.5, 0.33, Math.sin(i * 1.3) * 1.5, M('#5a3a5a'), i * 1.3);
                for (let i = 0; i < 6; i++) { const m = B().MeshBuilder.CreatePolyhedron('cr', { type: 1, size: 0.2 }, S); m.position.set(Math.cos(i * 1.1) * 2.6, 0.5, Math.sin(i * 1.1) * 2.6); m.material = M('#c86bff', 0.6); m.convertToFlatShadedMesh(); statics.push(m); }
                break;
            case 'surgery':
                bx(2.4, 0.8, 1.0, 0, 0.4, 0.6, white); bx(2.5, 0.06, 1.1, 0, 0.83, 0.6, M('#9fb4c8')); cy(1.4, 1.4, 0.2, 0, 2.7, 0.6, M('#ffffff', 1), 8); cy(0.15, 0.15, 1.5, 0, 1.95, 0.6, metal, 6); cy(0.9, 1.1, 0.2, 0, 2.55, 0.6, metal, 8);
                bx(0.8, 1.2, 0.5, -2.4, 0.6, -1.4, white); bx(0.6, 0.4, 0.06, -2.4, 1.0, -1.12, screen); console_(2.3, -1.6, -0.9); bx(0.6, 0.7, 0.4, 1.6, 0.35, 1.8, metal); bx(0.5, 0.04, 0.3, 1.6, 0.73, 1.8, white);
                break;
            case 'repository':
                for (let i = 0; i < 5; i++) crate(-2.2 + (i % 3) * 1.3, 0.8 + Math.floor(i / 3) * 1.2, 0.9 + (i % 2) * 0.3, i * 0.2, i % 2 ? crateMat : crateMat2);
                bx(3.0, 1.7, 0.4, 0, 0.85, -2.4, panel); for (let k = 0; k < 3; k++) bx(2.8, 0.05, 0.5, 0, 0.5 + k * 0.5, -2.35, metal); for (let k = 0; k < 6; k++) bx(0.3, 0.3, 0.3, -1.2 + k * 0.5, 0.68 + (k % 3) * 0.5, -2.35, k % 2 ? M('#e05252') : crateMat);
                ammoBox(2.2, 0.4, 0.4, true); ammoBox(2.6, -0.6, -0.3, false); vest(1.4, 2.0, 0.6); floorZone(-1.5, 1.3, 3.6, 2.6, 0, hazard);
                break;
            case 'airlock':
                cy(3.0, 3.0, 0.15, 0, 0.1, 0.4, M('#e05252', 0.4), 8); cy(2.4, 2.4, 0.16, 0, 0.11, 0.4, M('#aab6c2'), 8); for (let i = 0; i < 6; i++) bx(0.3, 0.6, 0.3, Math.cos(i * 1.05) * 1.5, 0.3, 0.4 + Math.sin(i * 1.05) * 1.5, M('#f1c40f', 0.4));
                bx(2.0, 2.2, 0.3, 0, 1.1, -2.6, metal); bx(1.2, 0.3, 0.1, 0, 2.0, -2.43, M('#e05252', 1)); console_(2.6, -1.0, -1.3); cy(0.5, 0.5, 1.6, -2.6, 0.8, -1.0, metal, 8); cy(0.5, 0.5, 1.6, -2.6, 0.8, 0.0, metal, 8);
                break;
            case 'armory':
                for (let i = 0; i < 2; i++) { const x = -1.6 + i * 3.2; bx(2.2, 1.7, 0.4, x, 0.85, -2.0, panel); for (let k = 0; k < 5; k++) { bx(0.1, 1.1, 0.1, x - 0.8 + k * 0.4, 1.0, -1.75, dark); bx(0.25, 0.14, 0.12, x - 0.8 + k * 0.4, 0.8, -1.75, M('#4a525c')); } bx(2.2, 0.06, 0.04, x, 1.55, -1.78, M('#e05252', 0.8)); }
                bx(1.6, 0.6, 0.8, 0.5, 0.3, 1.2, crateMat); for (let k = 0; k < 6; k++) cy(0.1, 0.1, 0.3, 0.0 + k * 0.2, 0.75, 1.2, hazard, 6); locker(-2.6, 0.6, 1.2); locker(2.7, 0.6, -1.2);
                ammoBox(-1.2, 2.0, 0.2, true); ammoBox(-1.9, 2.2, 0.9, false); ammoBox(2.0, 2.2, -0.4, true); vest(1.6, -0.4, 1.1); floorZone(0.5, 1.4, 3.0, 2.0, 0, hazard);
                break;
            case 'cafeteria':
                for (const s of [-1, 1]) { bx(2.4, 0.1, 0.9, 0, 0.75, s * 1.4, M('#8b6b4a')); bx(0.2, 0.7, 0.2, 0, 0.35, s * 1.4, dark); for (let i = 0; i < 3; i++) { cy(0.45, 0.45, 0.1, -0.8 + i * 0.8, 0.45, s * 2.15, M('#b07a3c'), 6); cy(0.08, 0.08, 0.4, -0.8 + i * 0.8, 0.2, s * 2.15, dark, 6); } bx(0.3, 0.05, 0.3, -0.6, 0.82, s * 1.4, white); bx(0.3, 0.05, 0.3, 0.7, 0.82, s * 1.4, white); }
                bx(1.2, 1.8, 0.6, -2.7, 0.9, 0, M('#e05252')); bx(0.8, 0.8, 0.06, -2.7, 1.1, 0.31, M('#7fd8ff', 0.6)); plant(2.8, 0); plant(2.6, -2.0); bx(1.6, 0.9, 0.6, 2.4, 0.45, 2.2, white); bx(1.4, 0.05, 0.4, 2.4, 0.92, 2.2, metal);
                break;
            case 'commandCenter':
                bx(2.8, 0.9, 1.4, 0, 0.45, 0, panel); bx(2.4, 0.4, 1.0, 0, 1.0, 0, M('#4aa3df', 0.6, { alpha: 0.6 })); for (let i = 0; i < 3; i++) bx(1.1, 1.4, 0.1, -1.3 + i * 1.3, 1.3, -2.7, screen, (1 - i) * 0.4); console_(-2.6, 1.0, 1.4); console_(2.6, 1.0, -1.4); bench(0, 2.4, 0);
                break;
            case 'containment':
                bx(2.4, 2.4, 2.4, 0, 1.3, 0.2, M('#7fc7ff', 0.15, { alpha: 0.35 })); bx(2.6, 0.2, 2.6, 0, 0.1, 0.2, metal); bx(2.6, 0.2, 2.6, 0, 2.5, 0.2, metal); for (const [x, z] of [[-1.3, -1.1], [1.3, -1.1], [-1.3, 1.5], [1.3, 1.5]]) bx(0.2, 2.6, 0.2, x, 1.3, z, metal);
                bx(0.3, 0.3, 0.3, 0, 2.7, 0.2, M('#e05252', 1)); console_(2.6, -2.0, -2.2); pipes(-2.8, 0.6, 0, 2); barrel(2.6, 1.6, M('#4fcf7a'));
                break;
            case 'contaminated':
                for (let i = 0; i < 8; i++) { const a = i * 0.8; cy(0.3, 0.7, 0.7 + (i % 3) * 0.4, Math.cos(a) * (1 + (i % 3)), 0.35, Math.sin(a) * (1 + (i % 2)), M('#5a8a2a', 0.5), 5); }
                bx(1.6, 0.7, 0.8, 1.8, 0.35, -1.6, M('#3a4a2a'), 0.6); cy(0.9, 0.9, 0.1, -1.6, 0.06, 1.6, M('#9cff3b', 0.8), 8); crate(-2.4, -1.4, 0.8, 0.4, M('#3f4a3a')); barrel(2.4, 1.4, M('#5a8a2a')); barrel(2.9, 0.8, M('#3f4a3a'));
                break;
            case 'decon':
                for (let i = 0; i < 3; i++) { cy(0.2, 0.2, 2.6, -1.6 + i * 1.6, 1.3, 1.0, metal, 6); cy(0.9, 0.2, 0.4, -1.6 + i * 1.6, 2.7, 1.0, M('#4fcf7a', 0.8), 8); cy(0.8, 0.8, 0.05, -1.6 + i * 1.6, 0.1, 1.0, M('#4fcf7a', 0.5), 8); }
                bx(3.0, 0.1, 0.6, 0, 1.0, -1.8, metal); bx(2.8, 1.2, 0.4, 0, 0.5, -2.2, panel); for (let k = 0; k < 4; k++) bx(0.4, 0.5, 0.1, -1.2 + k * 0.8, 0.7, -1.95, M('#7fd8ff', 0.5)); locker(2.7, 0.6, -1.2); locker(-2.7, 0.6, 1.2);
                break;
            case 'engineRoom':
                for (let i = 0; i < 3; i++) { cy(1.0, 1.1, 1.6, -2 + i * 2, 0.8, 0.6, metal, 8); cy(0.5, 0.5, 0.4, -2 + i * 2, 1.8, 0.6, dark, 8); bx(0.3, 0.1, 0.1, -2 + i * 2, 1.2, 1.16, i === 1 ? M('#e05252', 1) : M('#4fcf7a', 1)); }
                bx(5.2, 0.3, 0.3, 0, 2.1, 0.6, dark); pipes(0, -2.2, Math.PI / 2, 3); console_(2.6, -1.4, -1.6); barrel(-2.6, -1.6, hazard); crate(2.4, 2.2, 0.8, 0.3, crateMat2);
                break;
            case 'hatchControl':
                for (let i = 0; i < 4; i++) { bx(0.7, 0.7, 0.2, -1.5 + i * 1.0, 1.1, 1.6, i % 2 ? M('#4fcf7a', 0.7) : M('#e05252', 0.7)); bx(0.76, 0.76, 0.1, -1.5 + i * 1.0, 1.1, 1.72, metal); }
                bx(4.2, 0.7, 0.5, 0, 0.35, 1.6, panel); console_(0, -2.2, Math.PI); console_(-2.6, -0.2, 1.4); pipes(2.8, 0, 0, 2);
                break;
            case 'server':
                for (let i = 0; i < 4; i++) { const x = -2.4 + i * 1.6; bx(0.8, 2.2, 1.6, x, 1.1, 0.4, dark); for (let k = 0; k < 6; k++) bx(0.06, 0.18, 1.3, x + 0.42, 0.4 + k * 0.32, 0.4, k % 2 ? M('#4fcf7a', 0.8) : M('#4aa3df', 0.8)); bx(0.82, 0.06, 1.62, x, 2.22, 0.4, metal); }
                console_(0, -2.4, Math.PI); pipes(0, 1.9, Math.PI / 2, 2); bx(1.0, 0.5, 0.6, 2.6, 0.25, -2.0, panel);
                break;
            case 'storage':
                // zoned floor, stacked crates (some open), ammo boxes, dropped vests, barrels, shelving
                floorZone(-1.6, -1.2, 3.4, 2.8, 0, hazard); floorZone(1.9, 1.2, 2.6, 2.6, 0, hazard); bx(0.14, 0.03, 5.6, 0.2, 0.11, 0, hazard); bx(5.6, 0.03, 0.14, 0, 0.11, 0.0, hazard);
                for (let i = 0; i < 6; i++) crate(-2.4 + (i % 3) * 1.1, -1.8 + Math.floor(i / 3) * 1.2, 0.85 + (i % 2) * 0.15, i * 0.25, i % 2 ? crateMat : crateMat2);
                crate(-1.9, -1.8, 0.75, 0.2); crate(-1.3, -0.6, 0.6, 0.5); crate(2.2, 1.0, 1.0, 0.2, crateMat2); crate(2.2, 1.0, 0.7, 0.4);
                bx(1.0, 0.06, 1.0, 1.0, 1.03, 2.0, crateMat, 0.3, 0.9); crate(1.0, 2.0, 1.0, 0.3); // open lid
                ammoBox(0.9, -1.6, 0.3, true); ammoBox(1.7, -1.9, -0.4, false); ammoBox(1.6, -1.0, 0.9, true); vest(-0.6, 1.6, 0.4); vest(-1.6, 2.2, -0.8);
                barrel(2.8, -0.6, hazard); barrel(2.5, -1.4, M('#52607a')); barrel(-2.9, 1.0, M('#52607a'));
                bx(2.6, 0.08, 0.08, -1.4, 1.3, 2.6, M('#f1c40f', 0.7)); bx(0.08, 1.3, 0.08, -2.6, 0.65, 2.6, metal); bx(0.08, 1.3, 0.08, -0.2, 0.65, 2.6, metal); bx(2.6, 0.06, 0.5, -1.4, 0.7, 2.6, metal);
                for (let k = 0; k < 4; k++) bx(0.4, 0.3, 0.3, -2.3 + k * 0.55, 0.88, 2.6, k % 2 ? olive : crateMat);
                break;
        }
        // automatic perimeter dressing between the exits
        const famil = TILE_STYLE[tile] || 'steel';
        const dressAngles = [];
        for (let i = 0; i < 12; i++) { const a = (i + 0.5) / 12 * Math.PI * 2; const dz = Math.hypot(Math.sin(a) * (WALL_R - 0.9) - ZONE_C.x, Math.cos(a) * (WALL_R - 0.9) - ZONE_C.z); const nearExit = node.exitAngles.some(ea => Math.abs(Math.atan2(Math.sin(a - ea), Math.cos(a - ea))) < 0.5) || (node.techAngle !== null && Math.abs(Math.atan2(Math.sin(a - node.techAngle), Math.cos(a - node.techAngle))) < 0.5); if (!nearExit && dz > ZONE_R + 1.2) dressAngles.push(a); }
        const dressing = [];
        dressAngles.forEach((a, i) => {
            const rr = WALL_R - 0.75; const x = Math.sin(a) * rr, z = Math.cos(a) * rr; const ry = a;
            const kind = (i + tile.length) % 5;
            const m = []; const push = (f) => { const before = statics.length; f(); m.push(...statics.splice(before)); };
            if (kind === 0) push(() => { pipes(x, z, ry + Math.PI / 2, 2); });
            else if (kind === 1) push(() => { if (famil === 'medical') locker(x, z, ry + Math.PI); else if (famil === 'nest') { cy(0.1, 0.6, 1.3, x, 0.6, z, M('#3a2a3a'), 5); } else crate(x, z, 0.8, ry, famil === 'military' ? olive : crateMat2); });
            else if (kind === 2) push(() => { bx(1.2, 0.6, 0.3, x, 0.3, z, M('#2a3038'), ry); for (let k = 0; k < 3; k++) bx(0.25, 0.25, 0.1, x + Math.cos(ry) * (-0.4 + k * 0.4), 0.3, z - Math.sin(ry) * (-0.4 + k * 0.4), k === 1 ? M(accentHex, 0.8) : M('#4a525c'), ry); });
            else if (kind === 3) push(() => { if (famil === 'nest' || famil === 'toxic') { const p = B().MeshBuilder.CreatePolyhedron('cr', { type: 1, size: 0.25 }, S); p.position.set(x, 0.3, z); p.material = M(famil === 'nest' ? '#c86bff' : '#9cff3b', 0.6); p.convertToFlatShadedMesh(); statics.push(p); } else barrel(x, z, famil === 'tech' || famil === 'engine' ? hazard : M('#52607a')); });
            else push(() => { bx(0.8, 1.1, 0.25, x, 0.55, z, panel, ry); bx(0.5, 0.3, 0.05, x - Math.sin(ry) * 0.15, 0.8, z - Math.cos(ry) * 0.15, screen, ry); });
            dressing.push(...m);
        });
        // spread authored props and push them out of the standing zone
        for (const m of statics) {
            m.position.x *= PROP_SPREAD; m.position.z *= PROP_SPREAD;
            const dx = m.position.x - ZONE_C.x, dz = m.position.z - ZONE_C.z; const d = Math.hypot(dx, dz);
            const need = ZONE_R + 0.6;
            if (d < need) { const nx = d < 0.01 ? -0.7 : dx / d, nz = d < 0.01 ? 0.7 : dz / d; m.position.x = ZONE_C.x + nx * need; m.position.z = ZONE_C.z + nz * need; }
            const rr = Math.hypot(m.position.x, m.position.z);
            if (rr > WALL_R - 0.7) { const k = (WALL_R - 0.7) / rr; m.position.x *= k; m.position.z *= k; }
        }
        statics.push(...dressing);
        this.mergeStatic(statics, root);
        return root;
    }

    // ---------------------------------------------------------------------------------------
    // Corridors (polylines)
    // ---------------------------------------------------------------------------------------
    corridorPoints(ship, c) {
        const a = this.pos(ship.rooms[c.a]), b = this.pos(ship.rooms[c.b]);
        const mids = (c.path || []).map(([x, y]) => this.posXY(x, y));
        const pts = [a, ...mids, b];
        // trim the ends to the wall rings
        const d0 = pts[1].subtract(pts[0]).normalize(); pts[0] = pts[0].add(d0.scale(WALL_R + 0.45));
        const dn = pts[pts.length - 2].subtract(pts[pts.length - 1]).normalize(); pts[pts.length - 1] = pts[pts.length - 1].add(dn.scale(WALL_R + 0.45));
        return pts;
    }

    buildCorridor(ship, c) {
        const S = this.scene;
        const pts = this.corridorPoints(ship, c);
        const root = new (B().TransformNode)('cor_' + c.id, S);
        const M = (hex, e, extra) => this.M(hex, e, extra);
        const statics = [], ribsA = [], ribsB = [], ledA = [], ledB = [];
        const total = pts.reduce((s, p, i) => i ? s + p.subtract(pts[i - 1]).length() : 0, 0);
        let acc = 0, doorPlaced = null;
        for (let i = 0; i < pts.length - 1; i++) {
            const s0 = pts[i], s1 = pts[i + 1]; const dir = s1.subtract(s0); const l = dir.length(); const n = dir.normalize();
            const mid = s0.add(s1).scale(0.5); const ry = Math.atan2(n.x, n.z);
            const seg = new (B().TransformNode)('seg', S); seg.position = mid; seg.rotation.y = ry; seg.parent = root;
            const mk = (w, h, d, x, y, z, mat, list = statics) => { const m = B().MeshBuilder.CreateBox('c', { width: w, height: h, depth: d }, S); m.position.set(x, y, z); m.material = mat; m.parent = seg; list.push(m); return m; };
            mk(2.4, 0.3, l + 0.6, 0, -0.2, 0, M('#1f2a36'));
            const plates = Math.max(1, Math.round(l / 1.1));
            for (let k = 0; k < plates; k++) { const z = -l / 2 + (k + 0.5) * (l / plates); mk(2.0, 0.06, l / plates - 0.08, 0, -0.03, z, M(k % 2 ? '#3a4552' : '#404c5a')); }
            mk(0.5, 0.07, l, 0, 0.0, 0, M('#5a4a2a'));
            for (const s of [-1, 1]) { mk(0.2, 0.3, l, s * 1.05, 0.1, 0, M('#3c4c60')); mk(0.08, 0.08, l, s * 1.05, 0.6, 0, M('#aab6c2')); }
            // ribs
            const ribs = Math.max(1, Math.floor(l / 2.2));
            for (let k = 0; k < ribs; k++) {
                const z = -l / 2 + (k + 0.5) * (l / ribs);
                const along = acc + (z + l / 2);
                const half = along < total / 2 ? 'A' : 'B';
                if (Math.abs(along - total / 2) < 1.4) continue;   // leave the door area clear
                const list = half === 'A' ? ribsA : ribsB, leds = half === 'A' ? ledA : ledB;
                for (const s of [-1, 1]) { mk(0.24, 1.6, 0.32, s * 1.2, 0.8, z, M('#59697b'), list); mk(0.1, 0.5, 0.12, s * 1.05, 0.65, z, M('#3e4b59'), list); }
                mk(2.6, 0.24, 0.32, 0, 1.7, z, M('#59697b'), list);
                mk(0.9, 0.06, 0.12, 0, 1.56, z, M('#dff5ff', 1), list);
                // glowing band wrapping the whole arch (both faces): side posts + lintel
                for (const f of [-1, 1]) {
                    for (const s of [-1, 1]) mk(0.16, 1.5, 0.04, s * 1.2, 0.78, z + f * 0.18, null, leds);
                    mk(2.56, 0.14, 0.04, 0, 1.7, z + f * 0.18, null, leds);
                }
                const pipe = B().MeshBuilder.CreateCylinder('pp', { diameter: 0.12, height: 2.5, tessellation: 6 }, S);
                pipe.position.set(0, 1.42, z + 0.12); pipe.rotation.z = Math.PI / 2; pipe.material = M('#8c96a0'); pipe.parent = seg; list.push(pipe);
            }
            // joint pad at the far end of every inner segment
            if (i < pts.length - 2) { const pad = B().MeshBuilder.CreateCylinder('pad', { diameter: 3.2, height: 0.32, tessellation: 8 }, S); pad.position = s1.clone(); pad.position.y = -0.19; pad.material = M('#243040'); pad.parent = root; statics.push(pad); const post = B().MeshBuilder.CreateBox('jp', { width: 0.4, height: 1.9, depth: 0.4 }, S); post.position = s1.clone(); post.position.y = 0.95; post.position.addInPlace(new (B().Vector3)(Math.cos(ry) * 1.4, 0, -Math.sin(ry) * 1.4)); post.material = M('#59697b'); post.parent = root; statics.push(post); }
            // door at the middle of the whole path
            if (!doorPlaced && acc + l >= total / 2) { doorPlaced = { seg, z: total / 2 - acc - l / 2, l }; }
            acc += l;
        }
        // Static merges: per segment nodes have rotations, so bake world matrices before merging.
        const bake = list => list.map(m => { m.computeWorldMatrix(true); m.bakeCurrentTransformIntoVertices(); m.parent = null; return m; });
        this.mergeStatic(bake(statics), root);
        const mA = this.mergeStatic(bake(ribsA), root), mB = this.mergeStatic(bake(ribsB), root);
        const ledMat = (list) => { const mat = new (B().StandardMaterial)('led', S); mat.diffuseColor = B().Color3.FromHexString('#3fd0ff'); mat.emissiveColor = B().Color3.FromHexString('#3fd0ff'); mat.specularColor = B().Color3.Black(); for (const m of list) m.material = mat; return mat; };
        const matA = ledMat(ledA), matB = ledMat(ledB);
        const lA = this.mergeStatic(bake(ledA), root), lB = this.mergeStatic(bake(ledB), root);
        for (const m of lA) m.material = matA; for (const m of lB) m.material = matB;
        // door frame + sliding panels in the middle segment
        const d = doorPlaced; const dz = d.z;
        const door = new (B().TransformNode)('door', S); door.parent = d.seg; door.position.set(0, 0, dz);
        // a real open frame (two posts + lintel + sill) so you can see through an open door
        for (const s of [-1, 1]) { const post = B().MeshBuilder.CreateBox('post', { width: 0.8, height: 1.95, depth: 0.32 }, S); post.parent = door; post.position.set(s * 1.3, 0.97, 0); post.material = M('#8c96a0'); post.isPickable = false; }
        const lintel = B().MeshBuilder.CreateBox('lintel', { width: 3.4, height: 0.4, depth: 0.32 }, S); lintel.parent = door; lintel.position.y = 1.75; lintel.material = M('#8c96a0'); lintel.isPickable = false;
        const sill = B().MeshBuilder.CreateBox('sill', { width: 1.8, height: 0.06, depth: 0.36 }, S); sill.parent = door; sill.position.y = 0.0; sill.material = M('#5a6673'); sill.isPickable = false;
        // light trim around the door opening (shares the arch-band material: dim steel, orange on noise)
        for (const f of [-1, 1]) { for (const s of [-1, 1]) { const t = B().MeshBuilder.CreateBox('dt', { width: 0.1, height: 1.6, depth: 0.04 }, S); t.parent = door; t.position.set(s * 0.95, 0.8, f * 0.18); t.material = matA; t.isPickable = false; } const t = B().MeshBuilder.CreateBox('dt', { width: 2.0, height: 0.1, depth: 0.04 }, S); t.parent = door; t.position.set(0, 1.6, f * 0.18); t.material = matA; t.isPickable = false; }
        const panels = [];
        for (const s of [-1, 1]) {
            const p = B().MeshBuilder.CreateBox('panel', { width: 0.9, height: 1.55, depth: 0.14 }, S);
            p.parent = door; p.position.set(s * 0.45, 0.77, 0); p.material = M('#b8c4d0'); p.isPickable = false;
            const stripe = B().MeshBuilder.CreateBox('ps', { width: 0.1, height: 1.3, depth: 0.02 }, S);
            stripe.parent = p; stripe.position.set(-s * 0.3, 0, 0.08); stripe.material = M('#e05252', 0.6); stripe.isPickable = false;
            panels.push(p);
        }
        const noise = B().MeshBuilder.CreateCylinder('noise', { diameter: 1.4, height: 0.12, tessellation: 12 }, S);
        noise.parent = door; noise.position.set(0, 0.1, -2.2); noise.material = M('#f1c40f', 0.9); noise.isPickable = false; noise.setEnabled(false); noise.visibility = 0;   // kept for layout; the arch bands show noise
        const noiseLabel = this.makeLabel('nl_' + c.id, '🔊', '', door, 0, 1.4, -2.2, 1.4);
        noiseLabel.setEnabled(false);
        const debris = [];
        for (let i = 0; i < 5; i++) {
            const db = B().MeshBuilder.CreateBox('debris', { width: 0.4, height: 0.12, depth: 0.5 }, S);
            db.parent = door; db.position.set((Math.random() - 0.5) * 1.6, 0.08, (Math.random() - 0.5) * 1.4); db.rotation.set(0, Math.random() * 3, (Math.random() - 0.5) * 0.4); db.material = M('#6b7a88'); db.isPickable = false; db.setEnabled(false);
            debris.push(db);
        }
        this.corridorNodes[c.id] = { root, panels, noise, noiseLabel, debris, ribsA: mA.concat(lA), ribsB: mB.concat(lB), matA, matB, a: c.a, b: c.b, state: null };
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
        // room-token flip: triggered by fresh 'explore' fx entries (not on reconnect)
        const fx = view.fx || [];
        if (this.fxSeen == null) this.fxSeen = fx.length ? fx[fx.length - 1].n : 0;
        else for (const f of fx) if (f.n > this.fxSeen) { this.fxSeen = f.n; if (f.type === 'explore' && this.roomNodes[f.room] && !this.roomNodes[f.room].shell) this.roomNodes[f.room].flip = { phase: 1, t0: this.t }; }
        for (const r of Object.values(view.ship.rooms)) this.updateRoom(view, r);
        for (const c of Object.values(view.ship.corridors)) this.updateCorridor(view, c);
        const techMat = this.M(view.ship.techNoise ? '#f1c40f' : '#3fa9ff', 1);
        for (const n of Object.values(this.roomNodes)) for (const l of n.techLeds) l.material = techMat;
        this.updateIntruders(view, intruderNames);
        this.updateCharacters(view);
    }

    tileFor(view, r) {
        const rs = view.roomState[r.id];
        return rs.tile || (r.kind === 'cockpit' ? 'cockpit' : r.kind === 'hibernatorium' ? 'hibernatorium' : r.kind === 'engine' ? 'engine' : null);
    }

    updateRoom(view, r) {
        const node = this.roomNodes[r.id]; const rs = view.roomState[r.id];
        const tile = this.tileFor(view, r);
        const def = tile ? this.roomTiles[tile] : null;
        const name = def ? def.name + (r.kind === 'engine' ? ' №' + r.engineNo : '') : (r.kind === 'slot1' ? 'Комната «1»' : 'Комната «2»');
        this.setLabel(node.label, def ? r.id : '? ' + r.id, name, def ? '#ffffff' : '#8a99ab');
        node.sel.setEnabled(this.selectable.has(r.id));
        if (node.flip && node.flip.phase === 1) return;   // first half of the token flip: keep showing the face-down side
        node.qm.setEnabled(!tile);
        // shell appears once the tile is known
        const sk = tile || '';
        if (node.shellKey !== sk) {
            if (node.shell) node.shell.root.dispose();
            node.shell = tile ? this.buildShell(node, tile) : null;
            node.shellKey = sk; node.lightsOn = undefined;
        }
        node.malfunction = !!rs.malfunction;
        if (node.shell) {
            const st = node.shell.strips; const style = WALL_STYLES[TILE_STYLE[tile] || 'steel'];
            if (!node.malfunction) { st.diffuseColor = B().Color3.FromHexString(style[3]); st.emissiveColor = B().Color3.FromHexString(style[3]).scale(0.9); }
            for (const e of node.shell.emergency) e.setEnabled(node.malfunction);
            this.setRoomLights(node, !node.malfunction);
        }
        if (rs.fire) this.addFire(node.root);
        let k = 0;
        for (const o of rs.objects) this.addObject(o.type, node.root, k++);
        if (tile === 'nest' && rs.explored) for (let i = 0; i < view.nestEggs; i++) this.addObject('egg', node.root, 10 + i);
    }

    /** Main lighting of a room: every glowing material inside the shell is swapped for a dead (non-emissive) copy on malfunction. */
    setRoomLights(node, on) {
        if (node.lightsOn === on) return; node.lightsOn = on;
        this.deadMats = this.deadMats || new Map();
        for (const m of node.shell.root.getChildMeshes()) {
            if (node.shell.emergency.includes(m) || m === node.shell.stripMesh) continue;
            if (!on) {
                const mat = m.material; if (!mat || !mat.emissiveColor || Math.max(mat.emissiveColor.r, mat.emissiveColor.g, mat.emissiveColor.b) < 0.05) continue;
                let dead = this.deadMats.get(mat);
                if (!dead) { dead = mat.clone(mat.name + '_dead'); dead.unfreeze(); dead.emissiveColor = mat.emissiveColor.scale(0.04); dead.diffuseColor = mat.diffuseColor.scale(0.35); dead.freeze(); this.deadMats.set(mat, dead); }
                m._litMat = mat; m.material = dead;
            } else if (m._litMat) { m.material = m._litMat; m._litMat = null; }
        }
    }

    addFire(parent) {
        const S = this.scene;
        for (let i = 0; i < 7; i++) {
            const c = B().MeshBuilder.CreateCylinder('fire', { diameterTop: 0, diameterBottom: 0.9 + Math.random() * 0.6, height: 1.6 + Math.random() * 1.2, tessellation: 5 }, S);
            c.parent = parent; c.position.set(-3.2 + Math.random() * 2.2, 0.8, 2.4 + Math.random() * 2.2);
            c.material = this.M(i % 2 ? '#ff7a1a' : '#ffc23b', 1, { alpha: 0.85 }); c.isPickable = false;
            c.metadata = { flame: true, phase: Math.random() * 6 };
            this.dynamic.push(c);
        }
        const glow = new (B().PointLight)('fl', parent.position.add(new (B().Vector3)(-2.2, 1.8, 3.4)), S);
        glow.diffuse = new (B().Color3)(1, 0.5, 0.15); glow.intensity = 0.9; glow.range = 16;
        this.dynamic.push(glow);
    }
    addObject(type, parent, k) {
        const S = this.scene;
        // objects lie inside the standing zone's outer rim so they are visible next to the figures
        const a = 2.4 + k * 0.7, rad = ZONE_R - 0.4;
        const x = ZONE_C.x + Math.cos(a) * rad, z = ZONE_C.z + Math.sin(a) * rad;
        let m;
        if (type === 'egg') { m = B().MeshBuilder.CreateSphere('egg', { diameter: 0.7, segments: 5 }, S); m.scaling.y = 1.3; m.position.set(x, 0.45, z); m.material = this.M('#b8a8c8'); }
        else if (type === 'carcass') { m = B().MeshBuilder.CreateBox('carc', { width: 1.6, height: 0.4, depth: 0.8 }, S); m.position.set(x, 0.3, z); m.rotation.y = a; m.material = this.M('#263036'); }
        else { m = B().MeshBuilder.CreateBox('corpse', { width: 1.5, height: 0.35, depth: 0.6 }, S); m.position.set(x, 0.28, z); m.rotation.y = a; m.material = this.M(type === 'charCorpse' ? '#8a6b5a' : '#4a7ab8'); }
        m.parent = parent; m.isPickable = false; m.convertToFlatShadedMesh();
        this.dynamic.push(m);
    }

    updateCorridor(view, c) {
        const n = this.corridorNodes[c.id];
        const exA = !!view.roomState[c.a].explored || this.shipRooms[c.a].kind !== 'slot1' && this.shipRooms[c.a].kind !== 'slot2';
        const exB = !!view.roomState[c.b].explored || this.shipRooms[c.b].kind !== 'slot1' && this.shipRooms[c.b].kind !== 'slot2';
        const key = c.door + '|' + c.noise + '|' + exA + '|' + exB;
        if (n.state === key) return;
        n.state = key;
        const closed = c.door === 'closed', destroyed = c.door === 'destroyed';
        n.panels[0].position.x = closed ? -0.45 : -1.3; n.panels[1].position.x = closed ? 0.45 : 1.3;
        n.panels[0].setEnabled(!destroyed); n.panels[1].setEnabled(!destroyed);
        for (const d of n.debris) d.setEnabled(destroyed);
        n.noiseLabel.setEnabled(!!c.noise);
        for (const m of n.ribsA) m.setEnabled(exA); for (const m of n.ribsB) m.setEnabled(exB);
        // arch bands: unlit steel normally, orange glow only while a noise marker sits in the corridor
        const col = c.noise ? '#ffb347' : '#4a5563';
        for (const mat of [n.matA, n.matB]) { mat.diffuseColor = B().Color3.FromHexString(col); mat.emissiveColor = B().Color3.FromHexString(col).scale(c.noise ? 1 : 0.08); }
    }

    /** Slot position plus the player's own offset (figure dragged inside the room), clamped to the platform. */
    posed(n, pid) {
        const pose = this.poses[pid];
        if (!pose) return n.slot.clone();
        const roomPos = this.roomNodes[n.room].root.position;
        const p = n.slot.add(new (B().Vector3)(pose.dx, 0, pose.dz));
        const d = p.subtract(roomPos); d.y = 0;
        const lim = ROOM_R - 1.2;
        if (d.length() > lim) { d.scaleInPlace(lim / d.length()); p.copyFrom(roomPos.add(d)); }
        return p;
    }
    setMe(pid) { this.me = pid; }
    /** Apply a (remote or local) figure pose; `instant` snaps instead of running. */
    setPose(pid, pose, instant) {
        this.poses[pid] = pose || null;
        const n = this.chars[pid]; if (!n || !n.slot) return;
        n.target = this.posed(n, pid);
        n.faceY = (n.baseFace || 0) + ((pose && pose.rot) || 0);
        if (instant) { n.ch.root.position.x = n.target.x; n.ch.root.position.z = n.target.z; n.ch.root.rotation.y = n.faceY; }
    }
    /** Rotate own figure by `da` radians (Q/E). */
    rotateMe(da) {
        if (this.me == null || !this.chars[this.me]) return;
        const pose = Object.assign({ dx: 0, dz: 0, rot: 0 }, this.poses[this.me]); pose.rot += da;
        this.setPose(this.me, pose, true);
        if (this.cb.onPose) this.cb.onPose(pose);
    }
    /** World point on the floor plane under screen coords (null when pointing at the sky). */
    floorPoint(sx, sy) {
        const ray = this.scene.createPickingRay(sx, sy, B().Matrix.Identity(), this.camera);
        const d = ray.intersectsPlane(new (B().Plane)(0, 1, 0, 0));
        if (d == null || d < 0) return null;
        return ray.origin.add(ray.direction.scale(d));
    }
    /** Room whose platform contains the floor point (or null). */
    roomAt(pt) {
        if (!pt) return null;
        let best = null, bd = ROOM_R * ROOM_R;
        for (const [id, n] of Object.entries(this.roomNodes)) { const dx = n.root.position.x - pt.x, dz = n.root.position.z - pt.z; const q = dx * dx + dz * dz; if (q < bd) { bd = q; best = id; } }
        return best;
    }
    /** Remote cursor: a small coloured arrow hovering above the table. */
    setCursor(pid, x, z, color, name, off) {
        let c = this.cursors[pid];
        if (off) { if (c) { c.root.dispose(); delete this.cursors[pid]; } return; }
        if (!c) {
            const S = this.scene;
            const root = new (B().TransformNode)('cur' + pid, S);
            const arrow = B().MeshBuilder.CreateCylinder('cura', { diameterTop: 0, diameterBottom: 0.7, height: 1.1, tessellation: 3 }, S);
            arrow.parent = root; arrow.rotation.z = Math.PI; arrow.rotation.y = Math.PI / 6; arrow.position.y = 0.55; arrow.scaling.z = 0.35; arrow.isPickable = false;
            arrow.material = flatMat(S, color, { emissive: 0.55 });
            const ring = B().MeshBuilder.CreateTorus('curr', { diameter: 0.9, thickness: 0.06, tessellation: 16 }, S);
            ring.parent = root; ring.position.y = 0.04; ring.isPickable = false; ring.material = flatMat(S, color, { emissive: 0.8 });
            const label = this.makeLabel('curl', name, '', root, 0, 1.5, 0, 2.6);
            c = this.cursors[pid] = { root, target: new (B().Vector3)(x, 0, z), label, last: this.t };
            root.position.set(x, 0, z);
        }
        c.target.set(x, 0, z); c.last = this.t;
    }
    /** Camera shake (damage); k = strength 0..1. */
    shake(k) { this.shakeT = { t0: this.t, k }; }
    applyShake() {
        if (!this.shakeT) return;
        const age = this.t - this.shakeT.t0, dur = 0.5;
        if (!this.shakeBase) this.shakeBase = this.camera.target.clone();
        if (age > dur) { this.camera.target.copyFrom(this.shakeBase); this.shakeBase = null; this.shakeT = null; return; }
        const a = (1 - age / dur) * this.shakeT.k * 1.2;
        this.camera.target.set(this.shakeBase.x + (Math.random() - 0.5) * a, this.shakeBase.y + (Math.random() - 0.5) * a * 0.6, this.shakeBase.z + (Math.random() - 0.5) * a);
    }

    /** Expanding ring pulse at a table point (Tab ping). */
    ping(x, z, color) {
        const S = this.scene;
        const root = new (B().TransformNode)('ping', S); root.position.set(x, 0.1, z);
        const rings = [];
        for (let i = 0; i < 3; i++) {
            const r = B().MeshBuilder.CreateTorus('pr', { diameter: 1, thickness: 0.12, tessellation: 24 }, S);
            r.parent = root; r.isPickable = false; r.material = flatMat(S, color, { emissive: 1.0 }); rings.push(r);
        }
        const pin = B().MeshBuilder.CreateCylinder('pp', { diameterTop: 0.5, diameterBottom: 0, height: 1.6, tessellation: 6 }, S);
        pin.parent = root; pin.position.y = 1.4; pin.isPickable = false; pin.material = flatMat(S, color, { emissive: 0.9 });
        this.pings.push({ root, rings, pin, t0: this.t });
    }

    /** Slot positions inside the standing zone: characters on the near half, intruders on the far half. */
    slotPos(roomPos, index, who) {
        const base = who === 'char' ? -Math.PI / 4 : Math.PI * 0.75;      // toward / away from the camera
        const a = base + (index - 1) * 0.55;
        const rad = who === 'char' ? 1.35 : 1.55;
        return roomPos.add(new (B().Vector3)(ZONE_C.x + Math.cos(a) * rad, 0, ZONE_C.z + Math.sin(a) * rad));
    }

    updateIntruders(view, names) {
        const S = this.scene;
        const seen = new Set();
        const perRoom = {};
        for (const it of Object.values(view.intruders)) {
            seen.add(it.uid);
            let n = this.intr[it.uid];
            if (!n) { n = { root: buildIntruder(S, it.type), label: null }; n.label = this.makeLabel('il', '', '', n.root, 0, 3.0, 0, 2.6); this.intr[it.uid] = n; for (const m of n.root.getChildMeshes()) this.shadows.addShadowCaster(m); }
            const k = perRoom[it.room] = (perRoom[it.room] || 0) + 1;
            const roomPos = this.roomNodes[it.room].root.position;
            n.target = this.slotPos(roomPos, k - 1, 'intr');
            if (!n.placed) { n.root.position.copyFrom(n.target); n.placed = true; }
            n.root.rotation.y = Math.PI * 0.75 + Math.PI;  // face the characters
            this.setLabel(n.label, names[it.type] + (it.hits ? ' ✚' + it.hits : ''), '', '#9cff3b');
        }
        for (const uid of Object.keys(this.intr)) if (!seen.has(uid)) { this.intr[uid].root.dispose(); delete this.intr[uid]; }
    }

    updateCharacters(view) {
        const S = this.scene;
        const perRoom = {};
        for (const p of view.players) {
            if (!p.charId) continue;   // character draft still in progress
            let n = this.chars[p.id];
            if (n && n.charId !== p.charId) { n.ch.root.dispose(); delete this.chars[p.id]; n = null; }
            if (!n) {
                const ch = buildCharacter(S, p.charId, p.colors);
                n = { ch, charId: p.charId, label: this.makeLabel('cl', p.name, '', ch.root, 0, 3.6, 0, 3.8), placed: false, colorsKey: null };
                // invisible grab handle so the owner can drag the figure around the room
                const grab = B().MeshBuilder.CreateCylinder('grab', { diameter: 1.4, height: 2.9 }, S);
                grab.parent = ch.root; grab.position.y = 1.45; grab.visibility = 0; grab.isPickable = true; grab.metadata = { grab: p.id };
                n.grab = grab;
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
            n.slot = this.slotPos(roomPos, k - 1, 'char'); n.room = p.room;
            n.target = this.posed(n, p.id);
            const firstPlace = !n.placed;
            if (!n.placed) { n.ch.root.position.copyFrom(n.target); n.placed = true; }
            const hasIntr = Object.values(view.intruders).some(i => i.room === p.room);
            n.baseFace = hasIntr ? Math.PI * 0.75 : -Math.PI / 4 + Math.PI;   // face intruders, else the camera (applied once the run ends)
            n.faceY = n.baseFace + ((this.poses[p.id] || {}).rot || 0);
            if (firstPlace) n.ch.root.rotation.y = n.faceY;
            const current = view.current === p.id && view.phase === 'player';
            this.setLabel(n.label, p.name + (p.passed ? ' (пас)' : ''), p.charName, current ? '#ffb347' : '#ffffff');
            n.ch.root.scaling.setAll(p.status === 'hibernating' ? 0.001 : 0.66);
        }
        // shot animation (everyone sees it): triggered once per new lastShot
        if (this.lastShotSeen === null) this.lastShotSeen = view.lastShot ? view.lastShot.n : 0;   // ignore shots already in the state on (re)connect
        else if (view.lastShot && view.lastShot.n !== this.lastShotSeen) {
            this.lastShotSeen = view.lastShot.n;
            const n = this.chars[view.lastShot.player];
            if (n && n.ch.shoot && n.placed) { const it = this.intr[view.lastShot.target]; if (it) { const d = it.root.position.subtract(n.ch.root.position); n.faceY = Math.atan2(d.x, d.z); n.ch.root.rotation.y = n.faceY; } n.ch.shoot(); Snd.play('shot'); }
        }
    }

    animate() {
        const t = this.t;
        this.applyShake();
        for (const d of this.dynamic) {
            if (!d.metadata) continue;
            if (d.metadata.flame) { const s = 0.85 + 0.25 * Math.sin(t * 9 + d.metadata.phase); d.scaling.set(s, 1.3 - s * 0.3, s); d.rotation.y += 0.05; }
        }
        for (const n of Object.values(this.roomNodes)) {
            if (n.flip) {
                // the whole tile lifts and turns over; content swaps at the vertical edge (classic card flip)
                const p = Math.min(1, (t - n.flip.t0) / FLIP_S), ang = p * Math.PI;
                n.root.position.y = Math.sin(p * Math.PI) * 2.2;
                if (ang < Math.PI / 2) n.root.rotation.z = ang;
                else {
                    if (n.flip.phase === 1) { n.flip.phase = 2; if (this.view) this.updateRoom(this.view, n.data); if (n.shell) { n.shell.root.scaling.y = 0.02; n.pop = { t0: t + (1 - p) * FLIP_S }; } }
                    n.root.rotation.z = ang - Math.PI;
                }
                if (p >= 1) { n.root.rotation.z = 0; n.root.position.y = 0; n.flip = null; }
            }
            if (n.pop && n.shell) {
                // walls and props spring up out of the freshly revealed floor
                const q = Math.min(1, Math.max(0, (t - n.pop.t0) / POP_S)), c1 = 1.5, s = 1 + (c1 + 1) * Math.pow(q - 1, 3) + c1 * Math.pow(q - 1, 2);
                n.shell.root.scaling.y = Math.max(0.02, s);
                if (q >= 1) { n.shell.root.scaling.y = 1; n.pop = null; }
            }
            if (n.sel.isEnabled()) n.sel.scaling.setAll(1 + 0.04 * Math.sin(t * 5));
            if (n.malfunction && n.shell) {
                // main lights dead, red emergency lamps flicker
                const f = Math.max(0, Math.sin(t * 6 + n.flicker)) * (Math.sin(t * 23 + n.flicker * 3) > -0.6 ? 1 : 0.2);
                n.shell.strips.diffuseColor.set(0.2, 0.03, 0.03); n.shell.strips.emissiveColor.set(0.95 * f + 0.12, 0.03, 0.03);
                for (const e of n.shell.emergency) e.scaling.setAll(0.9 + 0.6 * f);
            }
        }
        const lerp = Math.min(1, this.engine.getDeltaTime() / 400);
        const dt = this.engine.getDeltaTime() / 1000;
        for (const [pidKey, n] of Object.entries(this.chars)) {
            if (!n.target || !n.ch.root.isEnabled()) continue;
            const pos = n.ch.root.position, d = n.target.subtract(pos); d.y = 0;
            const dist = d.length(), stepLen = RUN_SPEED * dt;
            const moving = dist > 0.05;
            if (moving) {
                Snd.footstep(performance.now());
                if (dist <= stepLen) { pos.x = n.target.x; pos.z = n.target.z; }
                else { pos.x += d.x / dist * stepLen; pos.z += d.z / dist * stepLen; }
                n.ch.root.rotation.y = Math.atan2(d.x, d.z);          // face the running direction
            } else if (n.faceY != null) n.ch.root.rotation.y += (n.faceY - n.ch.root.rotation.y) * Math.min(1, dt * 6);
            if (n.ch.animate) n.ch.animate(t, moving);
            // picked-up figure floats above the table while dragged, then settles back down
            const lifting = !!this.drag && this.drag.pid === Number(pidKey);
            n.lift = (n.lift || 0) + ((lifting ? LIFT_H : 0) - (n.lift || 0)) * Math.min(1, dt * 9);
            if (n.lift > 0.005) { pos.y += n.lift; n.ch.root.rotation.x = -0.12 * n.lift / LIFT_H; }   // slight forward tilt as if held
            else n.ch.root.rotation.x = 0;
            if (lifting && moving) { pos.x = n.target.x; pos.z = n.target.z; }   // follows the hand directly, no run cycle
        }
        // name labels grow as the camera zooms out, so figures are easy to find on the whole ship
        // name labels grow quickly with distance so a figure can be found on the whole-ship view
        const lk = Math.min(10, Math.max(1, this.camera.radius / 21));
        for (const n of Object.values(this.chars)) { n.label.scaling.setAll(lk); n.label.position.y = 3.6 + (lk - 1) * 1.0; }
        for (const n of Object.values(this.intr)) if (n.label) { n.label.scaling.setAll(lk); n.label.position.y = 3.0 + (lk - 1) * 1.0; }
        for (const c of Object.values(this.cursors)) {
            B().Vector3.LerpToRef(c.root.position, c.target, Math.min(1, dt * 12), c.root.position);
            c.root.position.y = 0.25 + Math.sin(t * 3) * 0.05;
        }
        for (let i = this.pings.length - 1; i >= 0; i--) {
            const p = this.pings[i], age = t - p.t0;
            if (age > 2.2) { p.root.dispose(); this.pings.splice(i, 1); continue; }
            p.rings.forEach((r, k) => { const a = Math.max(0, (age - k * 0.3) % 1.1); r.scaling.setAll(0.4 + a * 5); r.visibility = Math.max(0, 1 - a); });
            p.pin.position.y = 1.4 + Math.abs(Math.sin(age * 6)) * 0.5;
            p.root.rotation.y = age * 2;
        }
        for (const n of Object.values(this.intr)) if (n.target) { B().Vector3.LerpToRef(n.root.position, n.target, lerp, n.root.position); n.root.position.y = Math.abs(Math.sin(t * 3 + n.root.position.x)) * 0.05; }
        const ls = this.camera.radius > 60 ? this.camera.radius / 60 : 1;
        for (const n of Object.values(this.roomNodes)) n.label.scaling.setAll(ls);
    }

    onPointer(pi) {
        const T = B().PointerEventTypes;
        if (pi.type === T.POINTERMOVE) {
            const fp = this.floorPoint(this.scene.pointerX, this.scene.pointerY);
            if (this.drag) {   // own figure follows the pointer on the floor
                if (fp) {
                    const n = this.chars[this.drag.pid];
                    const pose = { dx: fp.x - this.drag.off.x - n.slot.x, dz: fp.z - this.drag.off.z - n.slot.z, rot: (this.poses[this.drag.pid] || {}).rot || 0 };
                    this.setPose(this.drag.pid, pose, true);
                    const now = performance.now();
                    if (this.cb.onPose && now - (this.drag.sent || 0) > 60) { this.drag.sent = now; this.cb.onPose(pose); }
                }
                return;
            }
            if (this.cb.onCursor && fp) this.cb.onCursor(fp.x, fp.z, this.roomAt(fp));
            if (this.me != null) { const g = this.scene.pick(this.scene.pointerX, this.scene.pointerY, m => m.metadata && m.metadata.grab === this.me); this.canvas.style.cursor = g && g.hit ? 'grab' : ''; }
            const pick = this.scene.pick(this.scene.pointerX, this.scene.pointerY, m => m.metadata && m.metadata.roomId);
            const id = pick && pick.hit ? pick.pickedMesh.metadata.roomId : null;
            if (id !== this.hover) { this.hover = id; }
            if (this.cb.onHover) this.cb.onHover(id, this.scene.pointerX, this.scene.pointerY);
        } else if (pi.type === T.POINTERDOWN) {
            this.downX = this.scene.pointerX; this.downY = this.scene.pointerY;
            if (this.me != null && pi.event && pi.event.button === 0) {
                const g = this.scene.pick(this.scene.pointerX, this.scene.pointerY, m => m.metadata && m.metadata.grab === this.me);
                const fp = this.floorPoint(this.scene.pointerX, this.scene.pointerY);
                if (g && g.hit && fp) {
                    const n = this.chars[this.me];
                    this.drag = { pid: this.me, off: new (B().Vector3)(fp.x - n.ch.root.position.x, 0, fp.z - n.ch.root.position.z) };
                    this.camera.detachControl(); this.canvas.style.cursor = 'grabbing';
                }
            }
        } else if (pi.type === T.POINTERUP) {
            if (this.drag) {
                const pose = this.poses[this.drag.pid];
                if (this.cb.onPose && pose) this.cb.onPose(pose);
                this.drag = null; this.camera.attachControl(this.canvas, true); this.canvas.style.cursor = '';
                return;
            }
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

/** Standalone character preview for the lobby (rotate with the mouse). */
export class Preview3D {
    constructor(canvas) {
        this.engine = new (B().Engine)(canvas, true);
        this.scene = new (B().Scene)(this.engine);
        this.scene.clearColor = new (B().Color4)(0, 0, 0, 0);
        const cam = new (B().ArcRotateCamera)('pc', -Math.PI / 2 + 0.4, 1.25, 4.4, new (B().Vector3)(0, 0.95, 0), this.scene);
        cam.attachControl(canvas, true); cam.lowerRadiusLimit = 2.5; cam.upperRadiusLimit = 7; cam.wheelPrecision = 50;
        canvas.addEventListener('wheel', e => e.preventDefault(), { passive: false });   // zooming the figure must not scroll the lobby
        const h = new (B().HemisphericLight)('h', new (B().Vector3)(0.3, 1, 0.2), this.scene); h.intensity = 0.8;
        const d = new (B().DirectionalLight)('d', new (B().Vector3)(-0.5, -1, 0.6), this.scene); d.intensity = 0.7;
        const disc = B().MeshBuilder.CreateCylinder('disc', { diameter: 1.6, height: 0.1, tessellation: 8 }, this.scene);
        disc.position.y = -0.05; disc.material = flatMat(this.scene, '#243040');
        this.char = null; this.charId = null;
        this.engine.runRenderLoop(() => this.scene.render());
        new ResizeObserver(() => this.engine.resize()).observe(canvas);
    }
    show(charId, colors) {
        if (this.charId !== charId) { if (this.char) this.char.root.dispose(); this.char = buildCharacter(this.scene, charId, colors); this.charId = charId; }
        else this.char.setColors(colors);
    }
}
