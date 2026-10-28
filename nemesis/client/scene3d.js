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
    cafe: ['#5c4a3a', '#3e3126', '#c8b49a', '#ffd9a0'],
    lab: ['#4d6470', '#35474f', '#cfe2ea', '#7fe0c8'],
    toxic: ['#45503c', '#2c3327', '#8aa070', '#9cff3b'],
    cold: ['#56687a', '#3a4756', '#c7dbe9', '#9fe6ff'],
};
const TILE_STYLE = {
    emergency: 'medical', surgery: 'medical', decon: 'medical', laboratory: 'lab', cafeteria: 'cafe',
    armory: 'military', airlock: 'military', hatchControl: 'military', repository: 'military', evacA: 'military', evacB: 'military',
    generator: 'tech', fireControl: 'tech', engineRoom: 'tech', storage: 'tech', server: 'tech',
    engine: 'engine', nest: 'nest', cockpit: 'bridge', commandCenter: 'bridge', archives: 'bridge', comms: 'bridge',
    contaminated: 'toxic', containment: 'cold', hibernatorium: 'cold',
};

const RUN_SPEED = 9;   // world units per second for character runs between rooms
// Item colours printed on the room tiles (Search icons) — shown above a room while Alt is held.
const ITEM_COLORS = { green: '#4fcf7a', red: '#e05252', yellow: '#f1c40f' };

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
        this.alt = false;
        this.gallery = false;   // room-gallery mode: labels show the room name instead of its id
        this.me = null; this.poses = {}; this.drag = null; this.cursors = {}; this.pings = []; this.canvas = canvas;
        this.stars();
        this.scene.onPointerObservable.add(pi => this.onPointer(pi));
        this.paused = false;
        this.loop = () => { if (this.paused) return; this.t += this.engine.getDeltaTime() / 1000; this.animate(); this.scene.render(); };
        this.engine.runRenderLoop(this.loop);
        this.onResize = () => this.engine.resize();
        window.addEventListener('resize', this.onResize);
    }

    /** Stop/start rendering (the lobby gallery keeps its scene alive but frozen while it is closed). */
    setActive(on) {
        this.paused = !on;
        if (on) this.engine.resize();
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
        // Alt overlay: the room name alone (no number), bigger, so the board reads by names while Alt is held
        const altLabel = this.makeLabel('altlbl_' + r.id, '', '', root, 0, 3.5, 0, 4.0);
        altLabel.setEnabled(false);
        // face-down room token: a big "?" printed on the unexplored floor
        const qm = this.makeLabel('qm_' + r.id, '?', '', root, 0, 0.13, 0, 7.5);
        qm.rotation.set(Math.PI / 2, 0, 0); qm.billboardMode = 0; qm.isPickable = false;
        { const ctx = qm.metadata.dt.getContext(); ctx.clearRect(0, 0, 512, 160); ctx.font = 'bold 150px Segoe UI, Arial'; ctx.textAlign = 'center'; ctx.fillStyle = '#56687c'; ctx.fillText('?', 256, 138); qm.metadata.dt.update(); qm.metadata.text = 'qm'; }
        this.roomNodes[r.id] = { root, plat, sel, label, altLabel, qm, data: r, exitAngles, techAngle, techLeds, shell: null, shellKey: null, strips: null, emergency: [], malfunction: false, flicker: Math.random() * 10, flip: null, pop: null, podsRoot: null, podKey: null, fireRoot: null, fireOn: null, fireParts: [] };
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
            case 'lab': {
                // clean laboratory deck: pale tiles, teal seams and a ring around the central analyser
                base('#3c4b52');
                const a = this.M('#c6d6dc'), b = this.M('#b4c7cf'), seam = this.M('#5f8f92', 0.15);
                for (let gx = -3; gx <= 3; gx++) for (let gz = -3; gz <= 3; gz++) {
                    const x = gx * 1.9, z = gz * 1.9; if (!inR(x, z, 0.8)) continue;
                    box(1.78, 0.04, 1.78, x, Y + 0.03, z, (gx + gz) % 2 ? a : b);
                }
                const ring = B().MeshBuilder.CreateTorus('fr', { diameter: 5.2, thickness: 0.16, tessellation: 32 }, S);
                ring.position.y = Y + 0.05; ring.scaling.y = 0.3; ring.material = seam; statics.push(ring);
                for (const [x, z] of [[-4.2, 2.6], [4.2, 2.6], [-4.2, -2.6], [4.2, -2.6]]) disc(0.9, 0.03, x, Y + 0.045, z, this.M('#2c3a40'), 10);
                break;
            }
            case 'military': {
                base('#3b4136');
                const stud = this.M('#4d5547');
                for (let gx = -9; gx <= 9; gx++) for (let gz = -9; gz <= 9; gz++) { const x = gx * 0.62 + (gz % 2) * 0.31, z = gz * 0.62; if (!inR(x, z, 0.5)) continue; box(0.22, 0.03, 0.1, x, Y + 0.03, z, stud, Math.PI / 4); }
                for (const s of [-1, 1]) box(0.25, 0.02, R * 1.2, s * 2.6, Y + 0.035, 0, this.M('#9c8a2a'));
                break;
            }
            case 'cafe': {
                // warm stone tiles with a hatched service lane in front of the counter
                base('#3a332b');
                const a = this.M('#4e453a'), b = this.M('#585044');
                for (let gx = -3; gx <= 3; gx++) for (let gz = -3; gz <= 3; gz++) {
                    const x = gx * 1.75, z = gz * 1.75; if (!inR(x, z, 0.9)) continue;
                    box(1.62, 0.04, 1.62, x, Y + 0.03, z, (gx + gz) % 2 ? a : b);
                }
                for (let i = -3; i <= 3; i++) box(0.06, 0.03, R * 2 - 1.6, i * 1.75, Y + 0.036, 0, this.M('#2a241d'));
                const stripe = this.M('#c9a227', 0.12), darkStripe = this.M('#2a241d');
                for (let i = 0; i < 10; i++) box(0.32, 0.03, 0.9, -3.1 + i * 0.68, Y + 0.04, 3.1, i % 2 ? stripe : darkStripe, Math.PI / 4);
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
        // Console desk: the screen stands on a foot bolted to the desktop, so no slab hovers over the desk.
        const console_ = (x, z, ry) => {
            bx(1.4, 0.9, 0.6, x, 0.45, z, panel, ry);
            bx(1.5, 0.06, 0.7, x, 0.93, z, metal, ry);                                                   // desktop
            bx(0.24, 0.12, 0.16, LX(x, z, ry, 0, -0.14), 1.02, LZ(x, z, ry, 0, -0.14), dark, ry);        // screen foot
            bx(1.26, 0.78, 0.07, LX(x, z, ry, 0, -0.1), 1.4, LZ(x, z, ry, 0, -0.1), metal, ry, -0.3);    // bezel
            bx(1.12, 0.64, 0.03, LX(x, z, ry, 0, -0.06), 1.4, LZ(x, z, ry, 0, -0.06), screen, ry, -0.3); // display
            bx(1.06, 0.05, 0.38, LX(x, z, ry, 0, 0.12), 0.98, LZ(x, z, ry, 0, 0.12), dark, ry);          // keyboard
            bx(0.3, 0.04, 0.2, LX(x, z, ry, 0.42, 0.12), 0.99, LZ(x, z, ry, 0.42, 0.12), accent, ry);    // control pad
        };
        const crate = (x, z, s = 1, ry = 0, mat = crateMat) => { bx(s, s, s, x, s / 2, z, mat, ry); bx(s * 1.02, 0.08, 0.12, x, s * 0.5, z, dark, ry); bx(0.12, 0.08, s * 1.02, x, s * 0.5, z, dark, ry); };
        // Ammo crate: the lid is hinged to the back rim (open: standing on the hinge, closed: on top).
        const ammoBox = (x, z, ry, open) => {
            bx(0.7, 0.35, 0.45, x, 0.18, z, olive, ry); bx(0.72, 0.04, 0.47, x, 0.37, z, metal, ry);
            if (open) {
                bx(0.66, 0.03, 0.41, x, 0.35, z, dark, ry);
                bx(0.7, 0.42, 0.05, LX(x, z, ry, 0, -0.235), 0.56, LZ(x, z, ry, 0, -0.235), olive, ry);
                for (let k = 0; k < 4; k++) cy(0.06, 0.06, 0.2, LX(x, z, ry, -0.21 + k * 0.14, 0.02), 0.44, LZ(x, z, ry, -0.21 + k * 0.14, 0.02), M('#c9a227'), 6);
            } else bx(0.72, 0.05, 0.47, x, 0.42, z, olive, ry);
        };
        const vest = (x, z, ry) => { bx(0.5, 0.06, 0.6, x, 0.1, z, M('#6b7a3c'), ry); bx(0.3, 0.05, 0.2, LX(x, z, ry, 0, 0.15), 0.14, LZ(x, z, ry, 0, 0.15), dark, ry); bx(0.1, 0.05, 0.5, LX(x, z, ry, -0.3, 0), 0.1, LZ(x, z, ry, -0.3, 0), M('#6b7a3c'), ry); };
        const locker = (x, z, ry) => { bx(0.9, 1.6, 0.5, x, 0.8, z, panel, ry); bx(0.05, 1.4, 0.05, LX(x, z, ry, 0, 0.27), 0.8, LZ(x, z, ry, 0, 0.27), metal, ry); bx(0.3, 0.06, 0.04, LX(x, z, ry, 0, 0.29), 1.2, LZ(x, z, ry, 0, 0.29), accent, ry); };
        const plant = (x, z) => { cy(0.5, 0.4, 0.4, x, 0.2, z, dark, 6); for (let i = 0; i < 4; i++) { const m = B().MeshBuilder.CreatePolyhedron('cr', { type: 1, size: 0.14 + (i % 2) * 0.08 }, S); m.position.set(x + (i - 1.5) * 0.14, 0.6 + (i % 3) * 0.18, z + ((i * 7) % 3 - 1) * 0.12); m.material = M('#ff5ad6', 0.7); m.convertToFlatShadedMesh(); statics.push(m); } };
        const bench = (x, z, ry) => { bx(1.3, 0.08, 0.4, x, 0.45, z, M('#b07a3c'), ry); for (const s of [-1, 1]) bx(0.08, 0.45, 0.4, x + Math.cos(ry) * s * 0.55, 0.22, z - Math.sin(ry) * s * 0.55, dark, ry); };
        const pipes = (x, z, ry, n = 3) => { for (let i = 0; i < n; i++) cy(0.14, 0.14, 2.6, x + Math.sin(ry + Math.PI / 2) * i * 0.2, 0.2 + i * 0.2, z + Math.cos(ry + Math.PI / 2) * i * 0.2, i % 2 ? metal : hazard, 6, Math.PI / 2); };
        const bed = (x, z, ry) => { bx(0.9, 0.3, 2.0, x, 0.3, z, metal, ry); bx(0.84, 0.12, 1.9, x, 0.5, z, white, ry); bx(0.6, 0.1, 0.4, LX(x, z, ry, 0, 0.7), 0.58, LZ(x, z, ry, 0, 0.7), M('#c0392b'), ry); };
        // Painted floor outline: laid on top of the floor finish (which tops out at ~0.165), otherwise invisible.
        const floorZone = (x, z, w, d, ry, mat) => { bx(w, 0.02, 0.1, x, 0.175, z - d / 2, mat, ry); bx(w, 0.02, 0.1, x, 0.175, z + d / 2, mat, ry); bx(0.1, 0.02, d, x - w / 2, 0.175, z, mat, ry); bx(0.1, 0.02, d, x + w / 2, 0.175, z, mat, ry); };
        const barrel = (x, z, mat) => { cy(0.55, 0.55, 0.8, x, 0.4, z, mat, 10); cy(0.57, 0.57, 0.06, x, 0.25, z, dark, 10); cy(0.57, 0.57, 0.06, x, 0.6, z, dark, 10); };
        // Local offsets inside a unit rotated by `ry`: let composite furniture be authored once and keep
        // every part (screen, lid, light, LED) attached to the body it belongs to.
        const LX = (x, z, ry, dx, dz) => x + dx * Math.cos(ry) + dz * Math.sin(ry);
        const LZ = (x, z, ry, dx, dz) => z - dx * Math.sin(ry) + dz * Math.cos(ry);
        const pat = (w, h, d, x, z, ry, dx, dz, y, mat, rx = 0) => bx(w, h, d, LX(x, z, ry, dx, dz), y, LZ(x, z, ry, dx, dz), mat, ry, rx);
        /** Crate with its lid: closed (strapped) or hinged open and leaning on the back of the box. */
        const crateLid = (x, z, s = 1, ry = 0, mat = crateMat, open = false, y0 = 0) => {
            bx(s, s, s, x, y0 + s / 2, z, mat, ry);
            for (const [w, d] of [[s * 1.04, 0.12], [0.12, s * 1.04]]) bx(w, 0.1, d, x, y0 + s * 0.5, z, dark, ry);   // straps around the box
            if (open) {
                bx(s * 0.86, 0.05, s * 0.86, x, y0 + s * 0.36, z, dark, ry);                       // dark interior
                pat(s * 1.02, s * 0.92, 0.07, x, z, ry, 0, -s * 0.52, y0 + s * 0.5, mat);          // lid resting against the back
                pat(s * 0.5, s * 0.24, s * 0.5, x, z, ry, 0.12, 0.06, y0 + s * 0.47, crateMat2);   // loose cargo inside
            } else {
                pat(s * 1.04, 0.07, 0.12, x, z, ry, 0, 0, y0 + s + 0.03, dark);                    // straps over the lid
                pat(0.12, 0.07, s * 1.04, x, z, ry, 0, 0, y0 + s + 0.03, dark);
                bx(s * 0.46, 0.04, s * 0.46, x, y0 + s + 0.03, z, M('#d4b02a', 0.2), ry);          // hazard label on top
            }
        };
        /** Green slime poured over a crate: a flat puddle on the lid and runs down the outside faces. */
        const slimeOn = (x, z, s = 1, ry = 0) => {
            const sl = M('#9cff3b', 0.55);
            const m = B().MeshBuilder.CreateSphere('sl', { diameter: s * 0.92, segments: 7 }, S);
            m.position.set(x, s + 0.03, z); m.scaling.set(1, 0.22, 0.92); m.rotation.y = ry; m.material = sl; m.convertToFlatShadedMesh(); statics.push(m);
            pat(0.06, s * 0.55, 0.22, x, z, ry, s * 0.53, 0.12, s * 0.62, sl);    // drip down the right face
            pat(0.5, s * 0.4, 0.06, x, z, ry, -0.08, -s * 0.53, s * 0.6, sl);     // drip down the back face
            const q = B().MeshBuilder.CreateCylinder('slp', { diameter: s * 0.8, height: 0.03, tessellation: 8 }, S);
            q.position.set(LX(x, z, ry, 0.2, s * 0.75), 0.13, LZ(x, z, ry, 0.2, s * 0.75)); q.scaling.z = 0.7; q.material = sl; statics.push(q);
        };
        // Wall furniture is authored where it stands (world units, no PROP_SPREAD and no push out of the
        // standing zone) so a long shelf keeps its shape; `fix` parks those meshes until after the spread.
        const fixed = [];
        const fix = (f) => { const before = statics.length; f(); fixed.push(...statics.splice(before)); };
        const nearExit = (a, g = 0.5) => (node.exitAngles || []).some(ea => Math.abs(Math.atan2(Math.sin(a - ea), Math.cos(a - ea))) < g)
            || (node.techAngle != null && Math.abs(Math.atan2(Math.sin(a - node.techAngle), Math.cos(a - node.techAngle))) < g);
        // Wall furniture must also stay clear of the standing zone (figures stand front-right).
        const zoneSafe = (a) => Math.hypot(Math.sin(a) * 5.1 - ZONE_C.x, Math.cos(a) * 5.1 - ZONE_C.z) > 4.0;
        const freeAngle = (pref, gap = 0.75) => {
            for (let i = 1; i <= 36; i++) for (const sgn of [1, -1]) {
                const a = pref + sgn * i * 0.09;
                if (!nearExit(a, gap) && zoneSafe(a)) return a;
            }
            return pref;
        };
        // Angles taken by wall furniture: the automatic perimeter dressing keeps out of them.
        const usedAngles = [];
        /** A spot against the wall: `r` from the centre, front (+z) looking into the room. The default
         *  radius puts the back of a ~0.8-deep unit right against the wall ring (WALL_R = 6.3). */
        const wallSpot = (a, r = 5.75) => { usedAngles.push(a); return { a, x: Math.sin(a) * r, z: Math.cos(a) * r, ry: a + Math.PI }; };
        /** Local frame of a wall spot: `u` runs along the wall, `v` into the room. */
        const frameOf = (p) => {
            const nx = -Math.sin(p.a), nz = -Math.cos(p.a), tx = Math.cos(p.a), tz = -Math.sin(p.a);
            return { nx, nz, tx, tz, at: (u, v) => [p.x + tx * u + nx * v, p.z + tz * u + nz * v] };
        };

        /** Flat-shaded ellipsoid: pods, eggs, curled limbs. */
        const ball = (dia, x, y, z, mat, sx = 1, sy = 1, sz = 1) => {
            const m = B().MeshBuilder.CreateSphere('bl', { diameter: dia, segments: 7 }, S);
            m.position.set(x, y, z); m.scaling.set(sx, sy, sz); m.material = mat; m.convertToFlatShadedMesh(); statics.push(m); return m;
        };
        /** A disc facing the local +z of a unit rotated by `ry` — lock hubs, pod windows, gauges. */
        const discZ = (dia, thick, x, y, z, mat, ry = 0, tess = 12) => {
            const m = B().MeshBuilder.CreateCylinder('dz', { diameter: dia, height: thick, tessellation: tess }, S);
            m.position.set(x, y, z); m.rotation.set(Math.PI / 2, ry, 0); m.material = mat; m.convertToFlatShadedMesh(); statics.push(m); return m;
        };
        /** Upright wall cabinet: body against the wall, both doors flush on the front face so they
         *  always face the room centre, handles on the doors and an optional lit label. */
        const cabinet = (p, w = 1.2, h = 1.8, d = 0.5, body = panel, door = null, label = null) => {
            const fr = frameOf(p), fz = d / 2;
            bx(w, h, d, p.x, h / 2, p.z, body, p.ry);
            bx(w + 0.06, 0.07, d + 0.05, p.x, h + 0.02, p.z, metal, p.ry);
            bx(w + 0.06, 0.06, d + 0.05, p.x, 0.03, p.z, dark, p.ry);
            for (const sd of [-1, 1]) {
                bx(w / 2 - 0.04, h - 0.24, 0.05, fr.at(sd * w / 4, fz + 0.02)[0], h / 2 + 0.01, fr.at(sd * w / 4, fz + 0.02)[1], door || body, p.ry);
                bx(0.03, 0.24, 0.035, fr.at(sd * 0.07, fz + 0.06)[0], h * 0.52, fr.at(sd * 0.07, fz + 0.06)[1], metal, p.ry);
            }
            bx(0.05, h - 0.24, 0.04, fr.at(0, fz + 0.03)[0], h / 2 + 0.01, fr.at(0, fz + 0.03)[1], dark, p.ry);
            if (label) bx(Math.min(0.66, w * 0.52), 0.32, 0.03, fr.at(0, fz + 0.07)[0], h * 0.78, fr.at(0, fz + 0.07)[1], label, p.ry);
        };
        /** Hospital bed lying along a radial ray: `a` is its direction from the room centre, `r` the
         *  distance to the bed centre. Pillow points at the centre, rails and legs stay attached. */
        const bedRay = (a, r) => {
            const x = Math.sin(a) * r, z = Math.cos(a) * r;
            bx(0.92, 0.34, 2.0, x, 0.3, z, metal, a);
            bx(0.86, 0.14, 1.9, x, 0.53, z, white, a);
            pat(0.62, 0.12, 0.42, x, z, a, 0, -0.7, 0.65, M('#c0392b'));
            pat(0.9, 0.1, 0.52, x, z, a, 0, 0.62, 0.65, M('#9fb4c8'));
            for (const sd of [-1, 1]) {
                pat(0.06, 0.08, 1.5, x, z, a, sd * 0.48, 0, 0.5, metal);
                pat(0.07, 0.5, 0.07, x, z, a, sd * 0.42, -0.72, 0.25, metal);
                pat(0.07, 0.5, 0.07, x, z, a, sd * 0.42, 0.72, 0.25, metal);
            }
            pat(0.92, 0.34, 0.08, x, z, a, 0, -0.98, 0.55, metal);   // headboard, on the pillow side
        };
        /** Decontamination booth against the wall: shell, lit interior, jambs and lintel in front of
         *  the opening, a shower head inside and a drain plate on the floor outside. */
        const booth = (p, w = 1.14, h = 1.42) => {
            const fr = frameOf(p);
            bx(w, h, 0.34, p.x, h / 2 + 0.12, p.z, M('#464b52'), p.ry);                                     // shell
            bx(w - 0.14, h - 0.22, 0.05, fr.at(0, 0.19)[0], h / 2 + 0.12, fr.at(0, 0.19)[1], M('#dff0ff', 0.5), p.ry);   // lit interior
            bx(0.1, h, 0.12, fr.at(-w / 2, 0.28)[0], h / 2 + 0.12, fr.at(-w / 2, 0.28)[1], metal, p.ry);    // jambs
            bx(0.1, h, 0.12, fr.at(w / 2, 0.28)[0], h / 2 + 0.12, fr.at(w / 2, 0.28)[1], metal, p.ry);
            bx(w + 0.1, 0.1, 0.12, fr.at(0, 0.28)[0], h + 0.17, fr.at(0, 0.28)[1], metal, p.ry);            // lintel
            bx(w, 0.14, 0.32, fr.at(0, 0.24)[0], 0.09, fr.at(0, 0.24)[1], M('#59697b'), p.ry);              // sill
            bx(0.24, 0.07, 0.16, fr.at(0, 0.13)[0], h - 0.12, fr.at(0, 0.13)[1], dark, p.ry);               // shower head
            bx(0.08, 0.06, 0.2, fr.at(0, 0.2)[0], h - 0.2, fr.at(0, 0.2)[1], M('#9fd7ff', 0.7), p.ry);       // spray
            bx(0.34, 0.03, 0.24, fr.at(0, 0.42)[0], 0.17, fr.at(0, 0.42)[1], M('#3a4048'), p.ry);           // drain grate
            bx(0.16, 0.03, 0.05, fr.at(-0.06, 0.42)[0], 0.18, fr.at(-0.06, 0.42)[1], dark, p.ry);
            bx(0.16, 0.03, 0.05, fr.at(0.06, 0.42)[0], 0.18, fr.at(0.06, 0.42)[1], dark, p.ry);
        };
        /** First candidate wall angle that keeps clear of the exits (and, when possible, of the
         *  standing zone) — rooms are laid out randomly, so fixed angles alone would cover doors. */
        const pickAngle = (cands, gap = 0.5) => cands.find(a => !nearExit(a, gap) && zoneSafe(a))
            ?? cands.find(a => !nearExit(a, gap)) ?? cands[0];

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
            case 'archives': {
                // Two rows of four wall cabinets (left and right), books left half pulled out of the shelves.
                // An open cabinet: back panel, sides, top and plinth only, so the shelves and books
                // are visible from the room (a solid block would hide everything inside it).
                const shelf = (a) => {
                    const p = wallSpot(a), fr = frameOf(p), ry = p.ry;
                    bx(2.0, 2.4, 0.12, fr.at(0, -0.34)[0], 1.26, fr.at(0, -0.34)[1], panel, ry);   // back panel
                    for (const sd of [-1, 1]) bx(0.09, 2.4, 0.8, fr.at(sd * 0.955, 0)[0], 1.26, fr.at(sd * 0.955, 0)[1], metal, ry);
                    bx(2.0, 0.12, 0.8, p.x, 2.44, p.z, metal, ry);                       // top
                    bx(1.9, 0.24, 0.8, p.x, 0.13, p.z, dark, ry);                        // plinth
                    for (let k = 0; k < 5; k++) {
                        const y = 0.42 + k * 0.46;
                        bx(1.83, 0.05, 0.68, fr.at(0, -0.06)[0], y, fr.at(0, -0.06)[1], metal, ry);   // shelf board
                        for (let b = 0; b < 5; b++) {
                            // books sit on the board and poke out past its front edge — half pulled out
                            const u = -0.7 + b * 0.35, v = 0.16 + ((b + k) % 3) * 0.06;
                            const x = fr.at(u, v)[0], z = fr.at(u, v)[1];
                            bx(0.24, 0.3, 0.16, x, y + 0.19, z, b % 3 ? (k % 2 ? accent : screen) : M('#7d8b9c'), ry + (b % 2 ? 0.09 : -0.07), 0);
                        }
                    }
                    bx(0.55, 0.07, 0.03, fr.at(0.4, 0.3)[0], 1.86, fr.at(0.4, 0.3)[1], M('#ffd27f', 0.8), ry);   // shelf label
                };
                // explicit arcs, so the two rows never drift into each other even when a door eats a spot
                const row = (list) => { let n = 0; for (const a of list) { if (n >= 4) break; if (nearExit(a, 0.5) || !zoneSafe(a)) continue; fix(() => shelf(a)); n++; } };
                row([-2.85, -2.4, -1.95, -1.5, -1.05]);   // left wall
                row([1.05, 1.5, 1.95, 2.4, 2.85]);        // right wall
                // reading desks between the rows, in the free middle of the room
                fix(() => {
                    for (const [x, z] of [[0.3, 3.3], [-2.5, 1.7]]) {
                        bx(1.7, 0.08, 0.9, x, 0.78, z, M('#8b6b4a'));
                        for (const sx of [-0.7, 0.7]) for (const sz of [-0.32, 0.32]) bx(0.08, 0.74, 0.08, x + sx, 0.4, z + sz, dark);
                        bx(0.26, 0.32, 0.5, x, 0.82, z, dark);                          // stack of books
                        bx(0.22, 0.06, 0.4, x + 0.3, 0.6, z - 0.1, M('#4fcf7a', 0.5));  // open volume
                        cy(0.1, 0.1, 0.5, x - 0.6, 1.05, z - 0.2, metal, 6); cy(0.3, 0.22, 0.16, x - 0.6, 1.33, z - 0.2, M('#ffd27f', 0.6), 8);
                    }
                });
                plant(2.8, 1.0);
                const ca = wallSpot(freeAngle(2.5, 0.7));   // catalogue console on a free wall
                fix(() => console_(ca.x, ca.z, ca.ry));
                break;
            }
            case 'comms': {
                // One communications station against a free wall: antenna, main console and terminals side by side.
                const a = freeAngle(1.05, 0.7), p = wallSpot(a), fr = frameOf(p), ry = p.ry;
                fix(() => {
                    bx(2.5, 0.9, 0.75, p.x, 0.45, p.z, panel, ry);                                      // main desk
                    bx(2.3, 0.06, 0.65, p.x, 0.92, p.z, metal, ry);
                    bx(1.8, 0.78, 0.08, fr.at(0, -0.12)[0], 1.35, fr.at(0, -0.12)[1], screen, ry, -0.22);  // big screen on the desk
                    bx(0.62, 0.42, 0.06, fr.at(-0.66, 0.05)[0], 1.06, fr.at(-0.66, 0.05)[1], M('#4fcf7a', 0.7), ry, -0.35);
                    bx(0.62, 0.42, 0.06, fr.at(0.62, 0.05)[0], 1.06, fr.at(0.62, 0.05)[1], M('#7fd8ff', 0.7), ry, -0.35);
                    bx(1.6, 0.05, 0.34, fr.at(0, 0.16)[0], 0.97, fr.at(0, 0.16)[1], dark, ry);            // keyboard shelf
                    // terminal rack left of the desk
                    bx(0.55, 1.6, 0.6, fr.at(-1.55, -0.05)[0], 0.8, fr.at(-1.55, -0.05)[1], dark, ry);
                    for (let k = 0; k < 5; k++) bx(0.34, 0.06, 0.04, fr.at(-1.55, 0.27)[0], 0.35 + k * 0.27, fr.at(-1.55, 0.27)[1], k % 2 ? M('#4fcf7a', 0.9) : M('#4aa3df', 0.9), ry);
                    // antenna right of the desk: base, mast, dish and beacon
                    bx(0.5, 0.5, 0.5, fr.at(1.62, -0.1)[0], 0.25, fr.at(1.62, -0.1)[1], metal, ry);
                    cy(0.16, 0.26, 3.2, fr.at(1.62, -0.1)[0], 2.1, fr.at(1.62, -0.1)[1], metal, 6);
                    cy(1.4, 0.5, 0.35, fr.at(1.62, -0.1)[0], 3.0, fr.at(1.62, -0.1)[1], accent, 12);
                    cy(0.07, 0.07, 0.9, fr.at(1.62, -0.1)[0], 3.9, fr.at(1.62, -0.1)[1], metal, 6);
                    bx(0.18, 0.18, 0.18, fr.at(1.62, -0.1)[0], 4.4, fr.at(1.62, -0.1)[1], M('#e05252', 1));
                    // operator stool
                    cy(0.42, 0.42, 0.08, fr.at(0, 0.85)[0], 0.5, fr.at(0, 0.85)[1], dark, 8);
                    cy(0.08, 0.08, 0.5, fr.at(0, 0.85)[0], 0.25, fr.at(0, 0.85)[1], metal, 6);
                });
                crateLid(0.8, 2.4, 0.8, 0, crateMat);
                break;
            }
            case 'emergency': {
                // Med bay laid out like a daisy: eight beds on radial rays around a clear middle, each
                // pointing away from the centre. The green supply cabinet faces the room centre and its
                // doors sit flush on the body, with a trolley and an IV pole beside it.
                fix(() => {
                    for (let i = 0; i < 8; i++) bedRay(i / 8 * Math.PI * 2 + Math.PI / 8, 4.15);
                    for (let i = 0; i < 4; i++) {
                        const a = i / 4 * Math.PI * 2 + Math.PI / 4, x = Math.sin(a) * 4.95, z = Math.cos(a) * 4.95;
                        bx(0.46, 0.46, 0.46, x, 0.23, z, white, a);
                        bx(0.52, 0.05, 0.52, x, 0.48, z, metal, a);
                        cy(0.16, 0.16, 0.2, x, 0.57, z, M('#7fc7ff', 0.4), 8);
                    }
                    const p = wallSpot(pickAngle([-2.35, -2.0, 2.35, 2.0], 0.6)), fr = frameOf(p);
                    cabinet(p, 1.25, 1.8, 0.5, M('#3f8f5a'), M('#4fcf7a'), null);
                    bx(0.36, 0.1, 0.03, fr.at(0, 0.29)[0], 1.36, fr.at(0, 0.29)[1], M('#eaffea', 0.35), p.ry);   // green cross on the doors
                    bx(0.1, 0.36, 0.03, fr.at(0, 0.29)[0], 1.36, fr.at(0, 0.29)[1], M('#eaffea', 0.35), p.ry);
                    // instrument trolley beside the cabinet
                    bx(0.8, 0.08, 0.5, fr.at(1.05, 0.6)[0], 0.8, fr.at(1.05, 0.6)[1], metal, p.ry);
                    for (const sx of [-0.32, 0.32]) bx(0.06, 0.78, 0.06, fr.at(1.05 + sx, 0.6)[0], 0.4, fr.at(1.05 + sx, 0.6)[1], metal, p.ry);
                    bx(0.34, 0.22, 0.26, fr.at(0.9, 0.6)[0], 0.95, fr.at(0.9, 0.6)[1], white, p.ry);
                    cy(0.12, 0.12, 0.16, fr.at(1.2, 0.6)[0], 0.92, fr.at(1.2, 0.6)[1], M('#4fcf7a', 0.5), 8);
                    // IV pole on the other side
                    cy(0.07, 0.07, 1.6, fr.at(-0.95, 0.55)[0], 0.8, fr.at(-0.95, 0.55)[1], metal, 6);
                    bx(0.3, 0.36, 0.08, fr.at(-0.95, 0.55)[0], 1.45, fr.at(-0.95, 0.55)[1], M('#7fc7ff', 0.4, { alpha: 0.8 }), p.ry);
                });
                break;
            }
            case 'evacA': case 'evacB': {
                // Two docking cradles per section room: a plate with rails, clamps and stops that the
                // pods (drawn by syncPods at the same ±2.5 / 1.05 spots) actually stand on.
                fix(() => {
                    for (const sd of [-1, 1]) {
                        const px = sd * 2.5, pz = 1.05;
                        floorZone(px, pz, 3.1, 3.4, 0, hazard);
                        bx(2.6, 0.14, 3.0, px, 0.09, pz, metal);                                  // cradle plate
                        bx(2.4, 0.05, 2.8, px, 0.17, pz, dark);                                   // grip deck under the pod
                        for (const r of [-1, 1]) {                                                // side rails + clamps
                            bx(0.13, 0.2, 2.86, px + r * 1.21, 0.26, pz, hazard);
                            for (const fz of [-1.28, 0, 1.28]) bx(0.24, 0.3, 0.24, px + r * 1.21, 0.24, pz + fz, dark);
                        }
                        bx(2.5, 0.1, 0.24, px, 0.23, pz - 1.4, hazard);                            // launch stops
                        bx(2.5, 0.1, 0.24, px, 0.23, pz + 1.4, hazard);
                        bx(0.42, 0.24, 0.3, px - 1.02, 0.32, pz - 1.34, dark);                     // service box on the deck
                        cy(0.13, 0.13, 0.62, px + 1.21, 0.55, pz - 1.1, dark, 6);                  // umbilical mast on the rail
                        bx(0.3, 0.12, 0.18, px + 1.21, 0.9, pz - 1.1, metal, 0, 0.3);
                        cy(0.11, 0.11, 0.4, px + 1.21, 0.78, pz - 0.78, M('#4aa3df', 0.6), 6, Math.PI / 3);
                    }
                    // painted chevrons and a walk lane — matte paint like the rest of the deck, no glow
                    for (let i = 0; i < 5; i++) bx(0.52, 0.02, 0.2, -1.2 + i * 0.6, 0.177, -2.5, hazard);
                    floorZone(0, -1.05, 4.6, 1.1, 0, M('#8a7a44'));
                    console_(0, -3.15, Math.PI);
                });
                break;
            }
            case 'fireControl': {
                // Fire post: three single extinguishers standing in the middle of the room, each on its
                // own stand, with the red-screen cabinet and the hose reel on the wall next to them.
                fix(() => {
                    for (const x of [-1.7, 0, 1.7]) {
                        const z = 0.9;
                        bx(0.44, 0.06, 0.44, x, 0.19, z, dark);                     // stand plate
                        cy(0.34, 0.36, 0.86, x, 0.64, z, M('#b5372c'), 10);         // bottle
                        cy(0.4, 0.4, 0.06, x, 0.28, z, M('#8e2a22'), 10);           // foot ring
                        cy(0.2, 0.24, 0.14, x, 1.14, z, metal, 8);                  // valve block
                        bx(0.12, 0.05, 0.24, x, 1.2, z, dark);                      // lever
                        cy(0.05, 0.05, 0.46, x + 0.24, 0.96, z, dark, 6, 0.5);      // hose clipped to the body
                        bx(0.1, 0.16, 0.08, x - 0.14, 0.9, z + 0.16, M('#e8eef4')); // label plate
                    }
                    const p = wallSpot(pickAngle([0, 0.45, -0.45, 0.9, -0.9], 0.55)), fr = frameOf(p);
                    cabinet(p, 1.6, 1.5, 0.45, panel, M('#3a4149'), null);
                    bx(1.24, 0.62, 0.03, fr.at(0, 0.26)[0], 0.92, fr.at(0, 0.26)[1], M('#e05252', 0.5), p.ry);   // red display, centred on the doors
                    bx(1.1, 0.07, 0.03, fr.at(0, 0.29)[0], 1.03, fr.at(0, 0.29)[1], M('#ffd0d0', 0.6), p.ry);
                    bx(1.1, 0.05, 0.03, fr.at(0, 0.29)[0], 0.83, fr.at(0, 0.29)[1], M('#ffd0d0', 0.6), p.ry);
                    discZ(0.8, 0.2, fr.at(-1.2, -0.05)[0], 0.75, fr.at(-1.2, -0.05)[1], M('#b5372c'), p.ry, 12);   // hose reel, on the wall
                    discZ(0.5, 0.22, fr.at(-1.2, -0.05)[0], 0.75, fr.at(-1.2, -0.05)[1], metal, p.ry, 10);
                    bx(0.4, 0.5, 0.24, fr.at(1.2, -0.04)[0], 0.9, fr.at(1.2, -0.04)[1], M('#8a929c'), p.ry);         // alarm box
                    bx(0.16, 0.16, 0.06, fr.at(1.2, 0.1)[0], 1.0, fr.at(1.2, 0.1)[1], M('#e05252', 0.8), p.ry);
                });
                barrel(-2.8, 2.3, M('#e05252')); barrel(-2.2, 3.0, M('#e05252'));
                break;
            }
            case 'generator': {
                // The yellow core is bare between a metal rim at floor level and a matching rim high up,
                // with the cap on top — the metal no longer wraps the core in the middle.
                fix(() => {
                    cy(2.7, 2.9, 0.5, 0, 0.36, 0, metal, 8);                       // floor rim
                    cy(2.92, 2.92, 0.07, 0, 0.6, 0, dark, 8);                      // rim lip
                    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; bx(0.16, 0.1, 0.16, Math.cos(a) * 1.36, 0.64, Math.sin(a) * 1.36, panel, -a); }
                    cy(1.5, 1.72, 2.1, 0, 1.62, 0, M('#f1c40f', 0.85), 8);         // bare glowing core
                    cy(1.52, 1.52, 0.1, 0, 1.28, 0, M('#ffe066', 1), 8);           // bright seam
                    cy(1.52, 1.52, 0.1, 0, 1.98, 0, M('#ffe066', 1), 8);
                    cy(2.58, 2.4, 0.34, 0, 2.82, 0, metal, 8);                     // high rim, resting on the core
                    cy(1.9, 1.9, 0.2, 0, 3.08, 0, accent, 8);                      // cap
                    cy(0.5, 0.5, 0.26, 0, 3.28, 0, accent, 6);
                    floorZone(0, 0, 4.6, 4.6, 0, hazard);
                    for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + Math.PI / 4; bx(0.7, 0.02, 0.34, Math.cos(a) * 3.0, 0.177, Math.sin(a) * 3.0, hazard, -a + Math.PI / 2); }
                    const p = wallSpot(pickAngle([-2.4, -2.8, 2.4, 2.8], 0.6)), fr = frameOf(p);
                    // control console next to the generator, screen on the desk
                    bx(1.5, 0.9, 0.7, fr.at(0, 0.2)[0], 0.45, fr.at(0, 0.2)[1], panel, p.ry);
                    bx(1.56, 0.06, 0.76, fr.at(0, 0.2)[0], 0.93, fr.at(0, 0.2)[1], metal, p.ry);
                    bx(0.3, 0.12, 0.2, fr.at(0, 0.1)[0], 1.02, fr.at(0, 0.1)[1], dark, p.ry);
                    bx(1.1, 0.7, 0.07, fr.at(0, 0.12)[0], 1.38, fr.at(0, 0.12)[1], metal, p.ry, -0.3);
                    bx(0.98, 0.58, 0.03, fr.at(0, 0.16)[0], 1.38, fr.at(0, 0.16)[1], screen, p.ry, -0.3);
                    cy(0.3, 0.3, 0.5, fr.at(1.1, 0.3)[0], 0.25, fr.at(1.1, 0.3)[1], hazard, 8);   // coolant canister
                });
                barrel(-2.9, 2.6, hazard); barrel(-3.5, 2.0, hazard);
                break;
            }
            case 'laboratory': {
                // Wider workbench so every instrument stands on it, plus a rack wall, an analyser on a
                // cart, a specimen cell at the back — and no painted cross on the floor anymore.
                fix(() => {
                    bx(4.8, 0.9, 1.7, 0, 0.45, 1.45, white);                       // bench body
                    bx(4.92, 0.07, 1.82, 0, 0.93, 1.45, M('#9fb4c8'));             // bench top
                    bx(4.8, 0.14, 1.7, 0, 0.21, 1.45, M('#7d8b99'));               // plinth
                    for (const dx of [-1.6, -0.3, 1.0, 2.0]) bx(0.05, 0.66, 0.04, dx, 0.6, 2.31, M('#c8d3db'));   // drawer seams on the front
                    for (const dx of [-1.6, 1.0]) bx(0.24, 0.05, 0.05, dx + 0.3, 0.78, 2.33, metal);              // handles
                    // glassware, all standing on the bench top (y = 0.965)
                    for (const [dx, dz, h, mat] of [[-1.95, 1.15, 0.5, M('#4fcf7a', 0.6, { alpha: 0.75 })], [-1.6, 1.6, 0.36, M('#b26bd6', 0.6, { alpha: 0.75 })], [0.5, 1.2, 0.56, M('#4aa3df', 0.6, { alpha: 0.75 })]]) {
                        cy(0.3, 0.34, h, dx, 0.965 + h / 2, dz, mat, 8);
                        cy(0.18, 0.18, 0.04, dx, 0.985 + h, dz, metal, 8);
                    }
                    for (let k = 0; k < 5; k++) cy(0.09, 0.09, 0.3, -0.7 + k * 0.13, 1.12, 1.62, M('#dff0ff', 0.4, { alpha: 0.8 }), 6);   // test tube rack
                    bx(0.72, 0.08, 0.34, -0.44, 0.99, 1.62, metal);
                    // microscope
                    bx(0.4, 0.07, 0.34, 1.55, 1.0, 1.2, M('#2b333d'));
                    bx(0.1, 0.46, 0.12, 1.55, 1.25, 1.08, M('#2b333d'));
                    bx(0.34, 0.08, 0.2, 1.55, 1.46, 1.16, M('#2b333d'));
                    cy(0.12, 0.12, 0.3, 1.55, 1.34, 1.3, metal, 8, Math.PI / 3);
                    // centrifuge
                    cy(0.62, 0.62, 0.3, 2.0, 1.13, 1.75, M('#c8d3db'), 10);
                    cy(0.66, 0.56, 0.1, 2.0, 1.33, 1.75, metal, 10);
                    cy(0.12, 0.12, 0.1, 2.0, 1.42, 1.75, accent, 8);
                    // monitor on a foot at the back edge of the bench
                    bx(0.26, 0.1, 0.16, -1.0, 0.99, 0.82, dark);
                    bx(0.9, 0.62, 0.06, -1.0, 1.36, 0.78, metal);
                    bx(0.8, 0.52, 0.03, -1.0, 1.36, 0.74, screen);
                    // burner with a standing flame
                    cy(0.24, 0.3, 0.16, 0.9, 1.03, 2.02, metal, 8);
                    cy(0.1, 0.16, 0.2, 0.9, 1.2, 2.02, M('#7fd8ff', 0.9), 6);
                    // wall shelf with jars, on the back wall
                    const p = wallSpot(pickAngle([Math.PI, Math.PI - 0.5, Math.PI + 0.5], 0.6)), fr = frameOf(p);
                    for (const y of [1.3, 1.9]) bx(2.4, 0.07, 0.34, p.x, y, p.z, M('#c8d3db'), p.ry);
                    for (const y of [1.3, 1.9]) for (let k = 0; k < 5; k++) cy(0.18, 0.2, 0.26, fr.at(-0.9 + k * 0.45, 0.05)[0], y + 0.16, fr.at(-0.9 + k * 0.45, 0.05)[1], [M('#4fcf7a', 0.45, { alpha: 0.8 }), M('#e05252', 0.4, { alpha: 0.8 }), M('#4aa3df', 0.45, { alpha: 0.8 })][k % 3], p.ry);
                    // specimen cell at the back: glass box on a plinth, sample rack inside
                    bx(1.7, 0.2, 1.1, 0.5, 0.1, -4.0, metal);
                    bx(1.6, 1.9, 1.0, 0.5, 1.15, -4.0, M('#7fc7ff', 0.15, { alpha: 0.3 }));
                    bx(1.6, 0.1, 1.0, 0.5, 2.15, -4.0, metal);
                    for (const sx of [-0.75, 0.75]) bx(0.08, 1.9, 0.08, 0.5 + sx, 1.15, -3.52, metal);
                    bx(1.3, 0.1, 0.5, 0.5, 0.28, -4.0, dark);                      // inner shelf
                    for (let k = 0; k < 4; k++) cy(0.14, 0.14, 0.3, 0.15 + k * 0.24, 0.47, -4.0, M('#b26bd6', 0.5), 6);
                    // analyser cart
                    bx(0.8, 0.8, 0.5, -2.6, 0.4, -2.4, M('#4a5a6e'));
                    for (const sx of [-0.3, 0.3]) for (const sz of [-0.16, 0.16]) cy(0.12, 0.12, 0.16, -2.6 + sx, 0.08, -2.4 + sz, dark, 6, Math.PI / 2);
                    bx(0.6, 0.5, 0.05, -2.6, 1.04, -2.15, metal, 0, -0.22);       // monitor bolted to the cart
                    bx(0.52, 0.42, 0.06, -2.6, 1.04, -2.12, screen, 0, -0.22);
                    bx(0.22, 0.22, 0.22, -2.6, 0.9, -2.42, metal);
                });
                break;
            }
            case 'nest':
                cy(3.2, 3.9, 0.3, 0, 0.15, 0, M('#4a2c4a'), 9);
                for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; cy(0.1, 0.9, 1.4 + (i % 3) * 0.5, Math.cos(a) * 3.1, 0.7, Math.sin(a) * 3.1, M('#3a2a3a'), 5); cy(0.05, 0.4, 1.2, Math.cos(a) * 2.2, 0.6, Math.sin(a) * 2.2, M('#5a3a5a'), 4); }
                for (let i = 0; i < 5; i++) bx(0.6, 0.1, 1.6, Math.cos(i * 1.3) * 1.5, 0.33, Math.sin(i * 1.3) * 1.5, M('#5a3a5a'), i * 1.3);
                for (let i = 0; i < 6; i++) { const m = B().MeshBuilder.CreatePolyhedron('cr', { type: 1, size: 0.2 }, S); m.position.set(Math.cos(i * 1.1) * 2.6, 0.5, Math.sin(i * 1.1) * 2.6); m.material = M('#c86bff', 0.6); m.convertToFlatShadedMesh(); statics.push(m); }
                break;
            case 'surgery': {
                // Operating table with its lamp on a separate floor stand (nothing pierces the mattress),
                // two instrument trolleys beside it and a supply cabinet on the wall.
                fix(() => {
                    // table
                    bx(0.9, 0.55, 1.7, -1.6, 0.42, 0.6, dark);
                    bx(1.16, 0.12, 2.1, -1.6, 0.62, 0.6, metal);
                    bx(1.1, 0.16, 2.0, -1.6, 0.76, 0.6, white);
                    bx(0.7, 0.1, 0.5, -1.6, 0.85, 1.3, M('#c0392b'));
                    for (const sz of [-0.75, 0, 0.75]) bx(0.5, 0.06, 0.5, -1.6, 0.75, 0.6 + sz, M('#9fb4c8'));
                    // lamp on its own stand, head hanging over the table
                    cy(0.9, 0.9, 0.12, -3.15, 0.07, 0.6, metal, 12);
                    cy(0.16, 0.16, 2.5, -3.15, 1.3, 0.6, metal, 8);
                    bx(1.25, 0.12, 0.12, -2.55, 2.55, 0.6, metal);
                    cy(0.2, 0.2, 0.2, -1.95, 2.5, 0.6, dark, 8);
                    cy(0.95, 0.95, 0.22, -1.95, 2.32, 0.6, M('#ffffff', 0.9), 12);
                    cy(0.75, 0.75, 0.05, -1.95, 2.18, 0.6, M('#eaf6ff', 1.6), 12);
                    // two instrument trolleys
                    for (const [x, z, ry] of [[-2.5, 2.5, 0.3], [-0.5, 2.7, -0.2]]) {
                        bx(0.9, 0.06, 0.6, x, 0.92, z, M('#c9d3da'), ry);
                        bx(0.86, 0.05, 0.56, x, 0.7, z, metal, ry);
                        for (const sx of [-0.35, 0.35]) for (const sz of [-0.22, 0.22]) bx(0.06, 0.9, 0.06, x + sx, 0.45, z + sz, metal);
                        bx(0.5, 0.03, 0.32, x, 0.96, z, M('#9fb4c8'), ry);                 // tray
                        for (let k = 0; k < 4; k++) bx(0.03, 0.02, 0.2, x - 0.18 + k * 0.12, 0.99, z, k % 2 ? M('#dfe6ee') : M('#aab6c2'), ry);
                        bx(0.16, 0.1, 0.3, x + 0.25, 0.98, z + 0.1, M('#4fcf7a', 0.4), ry);   // swabs / bottle
                        cy(0.1, 0.1, 0.2, x - 0.32, 1.05, z - 0.12, M('#7fc7ff', 0.5, { alpha: 0.8 }), 8);
                    }
                    // supply cabinet: open shell with glass doors, the boxes stand on its own shelves
                    const p = wallSpot(freeAngle(-2.2, 0.7)), fr = frameOf(p);
                    bx(1.6, 1.9, 0.1, fr.at(0, -0.22)[0], 0.98, fr.at(0, -0.22)[1], white, p.ry);      // back
                    for (const sd of [-1, 1]) bx(0.08, 1.9, 0.55, fr.at(sd * 0.76, 0)[0], 0.98, fr.at(sd * 0.76, 0)[1], white, p.ry);
                    bx(1.6, 0.08, 0.55, p.x, 1.93, p.z, white, p.ry);                                // top
                    bx(1.6, 0.08, 0.55, p.x, 0.06, p.z, white, p.ry);                                // bottom
                    bx(1.34, 0.05, 0.5, fr.at(0, 0)[0], 0.76, fr.at(0, 0)[1], metal, p.ry);          // middle shelf
                    bx(1.44, 1.7, 0.03, fr.at(0, 0.25)[0], 1.0, fr.at(0, 0.25)[1], M('#7fc7ff', 0.25, { alpha: 0.4 }), p.ry);
                    bx(0.04, 1.7, 0.04, p.x, 1.0, fr.at(0, 0.27)[1], metal, p.ry);                   // doors' gap
                    for (const sd of [-1, 1]) bx(0.06, 0.3, 0.03, fr.at(sd * 0.16, 0.28)[0], 1.0, fr.at(sd * 0.16, 0.28)[1], metal, p.ry);
                    for (let k = 0; k < 4; k++) bx(0.3, 0.22, 0.22, fr.at(-0.5 + k * 0.34, 0.02)[0], 0.46 + (k % 2) * 0.5, fr.at(-0.5 + k * 0.34, 0.02)[1], k % 2 ? M('#4fcf7a', 0.3) : M('#c0392b', 0.3), p.ry);
                    // medical boxes stacked at the head of the table
                    for (const [x, z, ry] of [[-3.7, -1.0, 0.2], [-3.2, -1.6, -0.3]]) {
                        bx(0.52, 0.36, 0.42, x, 0.18, z, white, ry);
                        bx(0.54, 0.05, 0.44, x, 0.37, z, M('#c0392b'), ry);
                        bx(0.2, 0.07, 0.02, x, 0.2, z + 0.22, M('#c0392b', 0.6), ry);   // red cross
                        bx(0.07, 0.2, 0.02, x, 0.2, z + 0.22, M('#c0392b', 0.6), ry);
                    }
                    // drip stand at the head of the table
                    cy(0.42, 0.34, 0.06, -0.55, 0.03, -0.45, metal, 10);
                    cy(0.06, 0.06, 1.75, -0.55, 0.9, -0.45, metal, 6);
                    bx(0.26, 0.34, 0.12, -0.55, 1.6, -0.45, M('#7fc7ff', 0.35, { alpha: 0.55 }));
                    cy(0.03, 0.03, 0.44, -0.74, 1.42, -0.45, M('#7fc7ff', 0.4, { alpha: 0.7 }), 6, Math.PI / 2);
                });
                console_(2.3, -1.6, -0.9); bx(0.8, 1.2, 0.5, 2.4, 0.6, 0.4, white); bx(0.6, 0.4, 0.06, 2.4, 1.0, 0.68, screen);
                break;
            }
            case 'repository': {
                // Equipment store: wall racks packed with crates, floor stacks, barrels and loose gear.
                const rack = (a) => {
                    const p = wallSpot(a), fr = frameOf(p), ry = p.ry;
                    bx(2.3, 0.1, 0.8, p.x, 0.05, p.z, dark, ry);
                    for (const sd of [-1, 1]) bx(0.09, 2.35, 0.8, fr.at(sd * 1.1, 0)[0], 1.18, fr.at(sd * 1.1, 0)[1], metal, ry);
                    bx(2.3, 0.1, 0.8, p.x, 2.36, p.z, metal, ry);
                    for (let k = 0; k < 4; k++) {
                        const y = 0.32 + k * 0.63;
                        bx(2.14, 0.06, 0.76, p.x, y, p.z, metal, ry);
                        for (let b = 0; b < 4; b++) {
                            const u = -0.74 + b * 0.5, v = (b + k) % 2 ? 0.02 : -0.04;
                            const w = 0.34 + ((b * 7 + k) % 3) * 0.05, h = 0.3 + ((b + k) % 2) * 0.16, d = 0.36 + ((b + 2 * k) % 3) * 0.05;
                            const x = fr.at(u, v)[0], z = fr.at(u, v)[1];
                            bx(w, h, d, x, y + h / 2 + 0.03, z, (b + k) % 3 ? crateMat : crateMat2, ry);
                            if ((b + k) % 4 === 0) bx(w * 0.8, 0.05, 0.12, x, y + h + 0.06, z, M('#d4b02a', 0.2), ry);
                        }
                    }
                    bx(0.42, 0.5, 0.07, fr.at(-0.55, 0.42)[0], 1.9, fr.at(-0.55, 0.42)[1], M('#6b7a3c'), ry);   // hanging vest
                    bx(0.42, 0.5, 0.07, fr.at(0.55, 0.42)[0], 1.9, fr.at(0.55, 0.42)[1], M('#6b7a3c'), ry);
                    bx(0.06, 0.5, 0.3, fr.at(0, 0.4)[0], 1.5, fr.at(0, 0.4)[1], metal, ry);                        // tool board
                };
                const row = (list) => { let n = 0; for (const a of list) { if (n >= 3) break; if (nearExit(a, 0.5) || !zoneSafe(a)) continue; fix(() => rack(a)); n++; } };
                row([-2.35, -1.75, -1.15, -0.55]);   // left wall
                row([2.35, 1.75, 1.15, 0.55]);       // right wall
                // floor stacks and loose gear in the middle, clear of the standing spot and the racks
                fix(() => {
                    floorZone(-1.9, 1.5, 4.4, 3.6, 0, hazard);
                    for (let i = 0; i < 6; i++) crate(-3.0 + (i % 3) * 1.2, 0.8 + Math.floor(i / 3) * 1.2, 0.8 + (i % 2) * 0.18, i * 0.25, i % 2 ? crateMat : crateMat2);
                    bx(0.78, 0.78, 0.78, -3.0, 1.22, 0.8, crateMat2, 0.35);         // crate stacked on top
                    bx(0.7, 0.05, 0.7, -3.0, 1.64, 0.8, dark, 0.35);                // its open lid
                    crate(0.9, 2.6, 0.7, 0.5, crateMat2); crate(-1.6, 3.4, 0.75, 0.2);
                    ammoBox(-0.2, 1.0, 0.4, true); ammoBox(0.6, 1.8, -0.3, false); ammoBox(-1.2, 2.7, 0.8, true);
                    vest(-2.0, -0.7, 0.6); vest(-2.9, 2.4, -0.8);
                    barrel(2.9, 1.9, hazard); barrel(3.3, 1.1, M('#52607a'));
                });
                break;
            }
            case 'airlock':
                cy(3.0, 3.0, 0.15, 0, 0.1, 0.4, M('#e05252', 0.4), 8); cy(2.4, 2.4, 0.16, 0, 0.11, 0.4, M('#aab6c2'), 8); for (let i = 0; i < 6; i++) bx(0.3, 0.6, 0.3, Math.cos(i * 1.05) * 1.5, 0.3, 0.4 + Math.sin(i * 1.05) * 1.5, M('#f1c40f', 0.4));
                bx(2.0, 2.2, 0.3, 0, 1.1, -2.6, metal); bx(1.2, 0.3, 0.1, 0, 2.0, -2.43, M('#e05252', 1)); console_(2.6, -1.0, -1.3); cy(0.5, 0.5, 1.6, -2.6, 0.8, -1.0, metal, 8); cy(0.5, 0.5, 1.6, -2.6, 0.8, 0.0, metal, 8);
                break;
            case 'armory': {
                // Weapon racks down to the backboard, an open crate with rounds inside, lockers and ammo
                // boxes — every gun is clipped to its rail, every lid sits on its box.
                fix(() => {
                    for (const sd of [-1, 1]) {
                        const x = sd * 1.95, z = -2.75;
                        bx(2.5, 1.9, 0.4, x, 0.95, z, panel);                              // rack body
                        bx(2.4, 1.6, 0.06, x, 1.0, z + 0.21, M('#39424e'));                // backboard
                        bx(2.56, 0.08, 0.48, x, 1.92, z, metal);                           // top rail
                        bx(2.56, 0.08, 0.48, x, 0.05, z, dark);                            // plinth
                        for (let k = 0; k < 5; k++) {
                            const wx = x - 0.92 + k * 0.46;
                            bx(0.1, 1.05, 0.1, wx, 1.0, z + 0.28, dark);                   // barrel
                            bx(0.28, 0.16, 0.16, wx, 0.82, z + 0.28, M('#4a525c'));        // receiver
                            bx(0.22, 0.34, 0.12, wx, 0.55, z + 0.28, k % 2 ? crateMat : olive);   // stock
                            bx(0.14, 0.06, 0.2, wx, 1.56, z + 0.28, M('#c9a227'));         // muzzle clamp on the rail
                        }
                        bx(2.4, 0.06, 0.05, x, 1.62, z + 0.25, M('#e05252', 0.45));        // status strip on the backboard
                    }
                    floorZone(0.4, 1.6, 3.2, 2.2, 0, hazard);
                    crateLid(0.3, 1.6, 1.15, 0.12, crateMat, true);                        // open crate in the zone
                    for (let k = 0; k < 3; k++) cy(0.11, 0.11, 0.32, -0.02 + k * 0.17, 0.82, 1.5, hazard, 6);
                    ammoBox(1.45, 2.0, 0.3, true); ammoBox(1.15, 1.1, -0.2, false);
                    locker(-3.55, 1.1, 1.55); locker(3.55, 1.1, -1.55);
                    vest(-1.35, 1.95, 0.4); vest(-1.95, 2.25, -0.6);
                });
                break;
            }
            case 'cafeteria': {
                // two mess tables with stools in the free middle of the room
                fix(() => {
                    for (const [x, z, ry] of [[0.9, 2.6, 0.12], [-2.6, 0.6, -0.18]]) {
                        bx(2.2, 0.1, 0.95, x, 0.75, z, M('#8b6b4a'), ry);
                        for (const sx of [-0.8, 0.8]) bx(0.16, 0.72, 0.16, x + sx, 0.36, z, dark, ry);
                        for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
                            const ox = -0.75 + i * 0.75;
                            cy(0.42, 0.42, 0.09, x + Math.cos(ry) * ox - Math.sin(ry) * s * 0.85, 0.46, z - Math.sin(ry) * ox - Math.cos(ry) * s * 0.85, M('#b07a3c'), 6);
                            cy(0.08, 0.08, 0.42, x + Math.cos(ry) * ox - Math.sin(ry) * s * 0.85, 0.22, z - Math.sin(ry) * ox - Math.cos(ry) * s * 0.85, dark, 6);
                        }
                        for (const ox of [-0.55, 0.45]) bx(0.3, 0.05, 0.3, x + ox, 0.82, z, white, ry);
                        cy(0.14, 0.14, 0.22, x + 0.7, 0.9, z + 0.2, M('#4fcf7a', 0.5), 8);   // cup
                    }
                });
                // snack machine against the wall + drinking fountain next to it
                const p = wallSpot(freeAngle(-1.6, 0.7)), fr = frameOf(p);
                fix(() => {
                    bx(1.1, 1.9, 0.62, p.x, 0.95, p.z, M('#b93a2e'), p.ry);
                    bx(0.94, 1.3, 0.03, fr.at(0, 0.315)[0], 1.14, fr.at(0, 0.315)[1], M('#141a20'), p.ry);   // dark window
                    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++)
                        bx(0.17, 0.16, 0.07, fr.at(-0.28 + c * 0.28, 0.36)[0], 0.7 + r * 0.28, fr.at(-0.28 + c * 0.28, 0.36)[1], [M('#f1c40f', 0.35), M('#4fcf7a', 0.35), M('#e05252', 0.35)][(r + c) % 3], p.ry);
                    bx(0.95, 1.32, 0.015, fr.at(0, 0.4)[0], 1.14, fr.at(0, 0.4)[1], M('#9fd7ff', 0.12, { alpha: 0.2 }), p.ry);   // glass over the shelves
                    bx(0.24, 0.5, 0.08, fr.at(0.34, 0.33)[0], 0.42, fr.at(0.34, 0.33)[1], dark, p.ry);     // dispenser slot
                    bx(0.92, 0.07, 0.08, fr.at(0, 0.34)[0], 1.79, fr.at(0, 0.34)[1], M('#ffd27f', 0.9), p.ry);  // lit sign
                    // drinking fountain on the same wall
                    bx(0.52, 0.86, 0.42, fr.at(1.05, -0.02)[0], 0.43, fr.at(1.05, -0.02)[1], metal, p.ry);
                    bx(0.44, 0.18, 0.34, fr.at(1.05, 0.05)[0], 0.9, fr.at(1.05, 0.05)[1], M('#c9d3da'), p.ry);   // basin
                    cy(0.12, 0.14, 0.05, fr.at(1.05, 0.08)[0], 0.98, fr.at(1.05, 0.08)[1], dark, 8);            // drain
                    bx(0.16, 0.2, 0.1, fr.at(1.05, -0.12)[0], 1.2, fr.at(1.05, -0.12)[1], dark, p.ry);          // nozzle head
                    cy(0.045, 0.045, 0.28, fr.at(1.05, 0.02)[0], 1.05, fr.at(1.05, 0.02)[1], M('#7fc7ff', 0.7, { alpha: 0.65 }), 6);   // water jet
                    bx(0.5, 0.05, 0.16, fr.at(1.05, 0.1)[0], 1.36, fr.at(1.05, 0.1)[1], M('#4fcf7a', 0.9), p.ry);  // "drink" sign
                });
                // serving counter with a lit display case
                const p2 = wallSpot(freeAngle(2.7, 0.7)), f2 = frameOf(p2);
                fix(() => {
                    bx(3.1, 0.95, 0.7, p2.x, 0.48, p2.z, panel, p2.ry);
                    bx(3.15, 0.07, 0.76, p2.x, 0.99, p2.z, metal, p2.ry);
                    bx(2.9, 0.55, 0.5, p2.x, 1.32, p2.z, M('#7fc7ff', 0.2, { alpha: 0.35 }), p2.ry);
                    bx(2.9, 0.05, 0.5, p2.x, 1.6, p2.z, metal, p2.ry);
                    for (let k = 0; k < 4; k++) cy(0.24, 0.24, 0.06, f2.at(-1.05 + k * 0.7, 0.06)[0], 1.03, f2.at(-1.05 + k * 0.7, 0.06)[1], M('#dfe6ee'), 10);
                    for (let k = 0; k < 3; k++) bx(0.2, 0.18, 0.2, f2.at(-0.9 + k * 0.9, 0.02)[0], 1.16, f2.at(-0.9 + k * 0.9, 0.02)[1], [M('#f1c40f', 0.3), M('#4fcf7a', 0.3), M('#e05252', 0.3)][k], p2.ry);
                });
                plant(2.8, -2.6);
                break;
            }
            case 'commandCenter':
                bx(2.8, 0.9, 1.4, 0, 0.45, 0, panel); bx(2.4, 0.4, 1.0, 0, 1.0, 0, M('#4aa3df', 0.6, { alpha: 0.6 })); for (let i = 0; i < 3; i++) bx(1.1, 1.4, 0.1, -1.3 + i * 1.3, 1.3, -2.7, screen, (1 - i) * 0.4); console_(-2.6, 1.0, 1.4); console_(2.6, 1.0, -1.4); bench(0, 2.4, 0);
                break;
            case 'containment': {
                // The rig is centred on the room's floor ring: base plate, four posts flush with it and
                // the glass cell between them, with the intruder asleep on the pad inside.
                fix(() => {
                    bx(2.5, 0.2, 2.5, 0, 0.11, 0, metal);                              // base plate
                    bx(2.32, 0.05, 2.32, 0, 0.23, 0, M('#3d4a52'));                    // pad inside the cell
                    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
                        bx(0.18, 2.5, 0.18, sx * 1.15, 1.36, sz * 1.15, metal);        // corner posts
                        bx(0.26, 0.16, 0.26, sx * 1.15, 0.3, sz * 1.15, dark);         // post feet
                    }
                    for (const sz of [-1, 1]) bx(2.4, 0.12, 0.16, 0, 2.55, sz * 1.15, metal);   // top rails
                    for (const sx of [-1, 1]) bx(0.16, 0.12, 2.4, sx * 1.15, 2.55, 0, metal);
                    bx(2.5, 0.16, 2.5, 0, 2.68, 0, panel);                             // lid frame
                    bx(2.28, 1.86, 2.28, 0, 1.2, 0, M('#7fc7ff', 0.15, { alpha: 0.26 }));   // glass walls
                    bx(2.3, 0.03, 2.3, 0, 2.145, 0, M('#7fc7ff', 0.2, { alpha: 0.32 }));    // glass roof on the walls
                    cy(0.32, 0.32, 0.12, 0, 2.82, 0, dark, 8);                          // beacon socket
                    cy(0.22, 0.22, 0.2, 0, 2.94, 0, M('#e05252', 1), 8);                // red status lamp
                    bx(0.08, 0.56, 0.44, 1.26, 1.5, 1.05, panel);                       // readout bolted to the front post
                    bx(0.05, 0.4, 0.32, 1.31, 1.5, 1.05, screen);
                    // sleeping intruder: curled body, tail wrapped round, head tucked under the chest
                    const hide = M('#2a3330'), hideD = M('#1b211f'), sheen = M('#3f4a42'), acid = M('#9cff3b', 0.7);
                    ball(1.0, 0, 0.62, 0.05, hide, 1.25, 0.78, 1.0);                    // torso
                    ball(0.78, 0.55, 0.56, 0.42, hide, 1.0, 0.72, 1.15);                // abdomen
                    ball(0.6, 0.86, 0.5, 0.86, hideD, 0.95, 0.68, 1.0);
                    ball(0.46, 0.92, 0.44, 1.22, hideD, 0.9, 0.62, 1.0);
                    ball(0.46, -0.5, 0.6, 0.3, sheen, 1.0, 0.85, 0.8);                  // tucked head
                    bx(0.2, 0.14, 0.66, -0.62, 0.73, 0.16, hideD, 0.35, -0.25);        // crest along the skull
                    bx(0.16, 0.1, 0.34, -0.72, 0.56, 0.32, hide, 0.3, 0.2);            // jaw
                    ball(0.12, -0.64, 0.52, 0.48, acid, 1, 1, 1);                       // faint inner-jaw glow
                    for (let k = 0; k < 6; k++) {                                       // tail curled around the body
                        const a2 = 0.5 + k * 0.42, r2 = 1.02 - k * 0.05;
                        ball(0.28 - k * 0.03, Math.cos(a2) * r2, 0.4 - k * 0.015, Math.sin(a2) * r2, k % 2 ? hide : hideD, 1, 0.8, 1);
                    }
                    for (const sd of [-1, 1]) {                                         // three clawed limbs tucked in
                        ball(0.3, 0.15, 0.44, 0.1 + sd * 0.42, hide, 1.5, 0.55, 0.7);
                        bx(0.3, 0.07, 0.07, 0.55, 0.38, 0.34 + sd * 0.44, hideD, 0.6);
                        bx(0.24, 0.05, 0.05, 0.76, 0.35, 0.5 + sd * 0.42, M('#e3dccb'), 0.9);
                    }
                    bx(1.0, 0.03, 0.5, 0.15, 0.27, 0.05, M('#4a5a42', 0.1));            // slime under the sleeper
                });
                const cp = wallSpot(pickAngle([-2.5, -2.9, 2.5, 2.9], 0.6)), cf = frameOf(cp);
                fix(() => {
                    bx(1.3, 0.9, 0.55, cf.at(0, 0.2)[0], 0.45, cf.at(0, 0.2)[1], panel, cp.ry);      // monitoring desk
                    bx(1.36, 0.06, 0.62, cf.at(0, 0.2)[0], 0.93, cf.at(0, 0.2)[1], metal, cp.ry);
                    bx(0.28, 0.12, 0.18, cf.at(0, 0.12)[0], 1.02, cf.at(0, 0.12)[1], dark, cp.ry);
                    bx(1.1, 0.66, 0.07, cf.at(0, 0.14)[0], 1.36, cf.at(0, 0.14)[1], metal, cp.ry, -0.3);
                    bx(1.0, 0.56, 0.03, cf.at(0, 0.18)[0], 1.36, cf.at(0, 0.18)[1], screen, cp.ry, -0.3);
                    pipes(cf.at(-1.1, 0.25)[0], cf.at(-1.1, 0.25)[1], cp.ry, 2);                     // pipes on the wall
                });
                barrel(3.0, 2.6, M('#4fcf7a'));
                break;
            }
            case 'contaminated': {
                // No glowing cones: ordinary crates, boxes and furniture smeared with the green goo.
                fix(() => {
                    for (const [x, z, sz, ry, mat, open] of [
                        [-2.7, -1.7, 1.0, 0.35, M('#4a4436'), true],
                        [-3.45, -0.4, 0.82, -0.2, M('#524a3a'), false],
                        [-2.2, 1.5, 0.9, 0.6, M('#3f4a3a'), false],
                        [-1.4, -3.5, 0.86, 0.15, M('#4a4436'), true],
                        [0.7, 3.3, 0.9, -0.3, M('#524a3a'), false],
                    ]) { crateLid(x, z, sz, ry, mat, open); slimeOn(x, z, sz, ry); }
                    // goo-smeared work table, its legs on the deck
                    bx(1.6, 0.08, 0.8, -3.1, 0.72, 2.6, M('#6b5a3c'), 0.4);
                    for (const sx of [-0.62, 0.62]) for (const sz of [-0.28, 0.28]) bx(0.1, 0.7, 0.1, LX(-3.1, 2.6, 0.4, sx, sz), 0.36, LZ(-3.1, 2.6, 0.4, sx, sz), dark);
                    bx(0.5, 0.06, 0.4, -3.35, 0.79, 2.5, M('#9cff3b', 0.45), 0.4);      // goo pool on the table
                    cy(0.1, 0.1, 0.4, -2.9, 0.95, 2.7, M('#3f4a3a'), 6, 0.9);           // spilled canister on the table
                    // toppled barrel, still on the deck
                    const t = B().MeshBuilder.CreateCylinder('tb', { diameter: 0.55, height: 0.8, tessellation: 10 }, S);
                    t.position.set(1.7, 0.44, 2.9); t.rotation.z = Math.PI / 2; t.rotation.y = 0.7; t.material = M('#5a8a2a'); t.convertToFlatShadedMesh(); statics.push(t);
                    bx(0.5, 0.05, 0.5, 1.7, 0.2, 2.9, M('#9cff3b', 0.4));               // goo leaking out of it
                    // slime trails on the deck, thin and matte
                    for (const [x, z, w, d] of [[-1.6, 0.9, 2.4, 0.3], [-2.9, -2.6, 1.8, 0.26], [0.2, 1.8, 1.6, 0.22]]) {
                        const m = B().MeshBuilder.CreateCylinder('sl', { diameter: 1, height: 0.02, tessellation: 10 }, S);
                        m.position.set(x, 0.176, z); m.scaling.set(w, 1, d); m.material = M('#6a9c2a', 0.2); statics.push(m);
                    }
                    barrel(3.0, 1.3, M('#5a8a2a')); barrel(3.4, 0.6, M('#3f4a3a'));     // upright drums by the right wall
                });
                break;
            }
            case 'decon': {
                // Decontamination bay after the board art: two ranks of lit booths along the walls, a
                // grilled walk lane down the middle with light strips, drains and a control post.
                fix(() => {
                    bx(1.5, 0.03, 7.4, 0, 0.172, 0, M('#5a6068'));                       // central walk lane
                    for (let i = -3; i <= 3; i++) bx(1.5, 0.02, 0.14, 0, 0.182, i * 1.05, M('#3f454c'));   // lane seams
                    for (const sx of [-0.66, 0.66]) bx(0.14, 0.02, 7.0, sx, 0.178, 0, M('#dff0ff', 0.35));  // lit strips between the lanes
                    for (const side of [-1, 1]) {
                        const base = pickAngle([side * Math.PI / 2, side * (Math.PI / 2 - 0.45), side * (Math.PI / 2 + 0.45)], 0.45);
                        for (let k = 0; k < 4; k++) {
                            const a = base + (k - 1.5) * 0.24;
                            if (nearExit(a, 0.36)) continue;
                            booth(wallSpot(a, 5.78));
                        }
                    }
                    // control post by the entrance lane, screen on the desk
                    bx(1.2, 0.9, 0.5, 0, 0.45, -3.9, panel);
                    bx(1.26, 0.06, 0.56, 0, 0.93, -3.9, metal);
                    bx(0.26, 0.12, 0.16, 0, 1.02, -3.96, dark);
                    bx(0.94, 0.58, 0.06, 0, 1.34, -3.94, metal, 0, -0.3);
                    bx(0.84, 0.48, 0.03, 0, 1.34, -3.9, M('#4fcf7a', 0.55), 0, -0.3);
                    // supply lockers in the corners
                    locker(-3.9, 3.1, 0.9); locker(3.9, 3.1, -0.9);
                    // floor drains under the booths
                    for (const [x, z] of [[-4.6, -1.2], [-4.6, 1.2], [4.6, -1.2], [4.6, 1.2]]) {
                        bx(0.5, 0.02, 0.34, x, 0.18, z, M('#3a4048'));
                        for (let k = 0; k < 3; k++) bx(0.44, 0.02, 0.04, x, 0.19, z - 0.09 + k * 0.09, dark);
                    }
                });
                break;
            }
            case 'engineRoom': {
                // Machinery along the left wall with the gauge panels facing into the room; a manifold
                // above it that each unit's stack plugs into, and a bracketed floor pipe run.
                fix(() => {
                    const unit = (x, z) => {
                        cy(1.3, 1.4, 1.7, x, 0.87, z, metal, 8);                        // housing
                        cy(1.46, 1.46, 0.14, x, 0.09, z, dark, 8);                      // base flange
                        cy(1.36, 1.36, 0.12, x, 1.76, z, dark, 8);                      // top flange
                        cy(0.4, 0.52, 0.5, x, 1.99, z, M('#4a5a6e'), 8);                // exhaust stack
                        cy(0.72, 0.72, 0.06, x, 2.2, z, dark, 8);                       // collar under the manifold
                        bx(0.2, 0.94, 0.88, x + 0.66, 0.98, z, dark);                   // mount block, half sunk in the housing
                        bx(0.06, 0.9, 0.86, x + 0.79, 0.98, z, panel);                  // gauge panel on the mount
                        bx(0.03, 0.8, 0.76, x + 0.82, 0.98, z, M('#39424e'));
                        for (let k = 0; k < 3; k++) discZ(0.2, 0.05, x + 0.85, 1.2, z - 0.26 + k * 0.26, k === 1 ? M('#e05252', 0.9) : M('#4fcf7a', 0.9), Math.PI / 2, 8);
                        discZ(0.24, 0.06, x + 0.85, 0.72, z, M('#c8d3db'), Math.PI / 2, 10);
                        bx(0.14, 0.32, 0.5, x - 0.7, 0.9, z, dark);                     // junction box on the back
                    };
                    for (const z of [-2.5, 0, 2.5]) unit(-4.35, z);
                    discZ(0.3, 7.6, -4.35, 2.34, 0, metal, 0, 8);                        // manifold main over the row
                    discZ(0.44, 0.12, -4.35, 2.34, 0, dark, 0, 10);                      // centre coupling
                    discZ(0.44, 0.1, -4.35, 2.62, 2.5, dark, 0, 10);                     // valve fittings
                    discZ(0.44, 0.1, -4.35, 2.62, -2.5, dark, 0, 10);
                    cy(0.2, 0.2, 0.5, -4.35, 2.68, 2.5, dark, 6);                        // valve stems on the fittings
                    cy(0.2, 0.2, 0.5, -4.35, 2.68, -2.5, dark, 6);
                    cy(0.5, 0.5, 0.06, -4.35, 2.95, 2.5, hazard, 10);                    // hand wheels
                    cy(0.5, 0.5, 0.06, -4.35, 2.95, -2.5, hazard, 10);
                    // floor-level pipe run on saddle brackets, feet on the deck
                    discZ(0.26, 4.6, -5.35, 0.42, 0, metal, 0, 8);
                    for (const z of [-1.9, -0.6, 0.7, 2.0]) {
                        bx(0.42, 0.34, 0.16, -5.35, 0.21, z, dark);                      // saddle
                        bx(0.56, 0.06, 0.28, -5.35, 0.06, z, metal);                     // foot plate
                    }
                    discZ(0.26, 0.9, -4.9, 0.42, 0.4, metal, Math.PI / 2, 8);            // elbow into the room
                    cy(0.34, 0.34, 0.1, -4.45, 0.42, 0.4, dark, 8, Math.PI / 2);
                    // control cabinet and clutter on the right
                    bx(1.0, 1.5, 0.6, 4.3, 0.75, -2.2, panel);
                    bx(0.03, 0.56, 0.5, 3.78, 1.1, -2.2, screen);
                    bx(1.06, 0.07, 0.66, 4.3, 1.53, -2.2, metal);
                    barrel(4.0, 1.9, hazard); crateLid(3.5, 3.0, 0.85, 0.25, crateMat2);
                });
                break;
            }
            case 'hatchControl': {
                // Rebuilt from the board art: the escape-hatch door with its big lock hub and ribbed
                // threshold, two tilted LOCKED consoles flanking it, pod banks on both side walls and
                // the glowing control table standing in the middle of the room.
                fix(() => {
                    const ha = pickAngle([Math.PI, Math.PI - 0.4, Math.PI + 0.4, 0, 0.4], 0.75);
                    const hp = wallSpot(ha, 5.78), hf = frameOf(hp);
                    bx(3.1, 2.5, 0.34, hp.x, 1.25, hp.z, M('#2b333d'), hp.ry);                     // jamb on the wall
                    bx(2.7, 2.3, 0.1, hf.at(0, 0.2)[0], 1.15, hf.at(0, 0.2)[1], metal, hp.ry);     // frame plate
                    for (const sd of [-1, 1]) {
                        bx(1.16, 2.1, 0.12, hf.at(sd * 0.6, 0.28)[0], 1.05, hf.at(sd * 0.6, 0.28)[1], M('#59697b'), hp.ry);   // leaf
                        bx(0.1, 0.34, 0.06, hf.at(sd * 1.02, 0.36)[0], 1.05, hf.at(sd * 1.02, 0.36)[1], dark, hp.ry);       // pull bar
                    }
                    bx(0.12, 2.1, 0.14, hf.at(0, 0.3)[0], 1.05, hf.at(0, 0.3)[1], dark, hp.ry);     // centre seam
                    discZ(0.66, 0.12, hf.at(0, 0.35)[0], 1.35, hf.at(0, 0.35)[1], metal, hp.ry, 6);        // lock hub
                    discZ(0.46, 0.16, hf.at(0, 0.41)[0], 1.35, hf.at(0, 0.41)[1], M('#39424e'), hp.ry, 6);
                    bx(0.16, 0.1, 0.1, hf.at(0, 0.47)[0], 1.35, hf.at(0, 0.47)[1], M('#c9a227'), hp.ry);  // keyhole
                    for (let k = 0; k < 3; k++) bx(2.2, 0.06, 0.2, hf.at(0, 0.52 + k * 0.26)[0], 0.19, hf.at(0, 0.52 + k * 0.26)[1], metal, hp.ry);   // threshold ribs
                    bx(2.6, 0.02, 0.9, hf.at(0, 0.8)[0], 0.176, hf.at(0, 0.8)[1], hazard, hp.ry);   // painted approach
                    for (const sd of [-1, 1]) {
                        // tilted LOCKED console on a wedge pedestal, screen bolted to its top
                        const sa = ha + sd * 0.33, sp2 = wallSpot(sa, 5.7), sf = frameOf(sp2);
                        bx(1.0, 1.15, 0.5, sp2.x, 0.58, sp2.z, M('#1e252c'), sp2.ry);
                        bx(1.06, 0.1, 0.56, sp2.x, 1.18, sp2.z, dark, sp2.ry);
                        bx(0.9, 0.62, 0.06, sf.at(0, 0.1)[0], 1.44, sf.at(0, 0.1)[1], M('#1e252c'), sp2.ry, -0.34);
                        bx(0.8, 0.52, 0.03, sf.at(0, 0.14)[0], 1.44, sf.at(0, 0.14)[1], M('#2f7ad6', 0.7), sp2.ry, -0.34);
                        for (let k = 0; k < 3; k++) bx(0.56, 0.05, 0.02, sf.at(0, 0.17)[0], 1.56 - k * 0.12, sf.at(0, 0.17)[1], M('#dff0ff', 0.9), sp2.ry, -0.34);
                    }
                    // pod banks against both side walls: racks of dark pods with red status windows
                    for (const sd of [-1, 1]) {
                        const ba = pickAngle([ha + sd * 1.15, ha + sd * 1.45, ha + sd * 0.85], 0.5), bp = wallSpot(ba, 5.8), bf = frameOf(bp);
                        bx(2.2, 2.35, 0.28, bp.x, 1.2, bp.z, M('#232a31'), bp.ry);
                        bx(2.3, 0.12, 0.34, bp.x, 2.42, bp.z, metal, bp.ry);
                        bx(2.3, 0.12, 0.34, bp.x, 0.08, bp.z, dark, bp.ry);
                        for (let r2 = 0; r2 < 2; r2++) for (let c = 0; c < 2; c++) {
                            const u = (c - 0.5) * 0.98, y = 0.72 + r2 * 1.02;
                            ball(0.78, bf.at(u, 0.34)[0], y, bf.at(u, 0.34)[1], M('#1e242a'), 0.92, 1.05, 0.92);
                            discZ(0.24, 0.12, bf.at(u, 0.66)[0], y, bf.at(u, 0.66)[1], M('#e05252', 0.9), bp.ry, 8);
                        }
                    }
                    // holo control table in the middle of the room
                    cy(0.64, 0.92, 0.14, 0, 0.07, -0.4, dark, 8);
                    cy(0.44, 0.44, 0.78, 0, 0.5, -0.4, panel, 8);
                    bx(1.5, 0.1, 0.86, 0, 0.94, -0.4, M('#2a3b55'));
                    bx(1.36, 0.04, 0.72, 0, 1.0, -0.4, M('#4aa3df', 0.55));
                    for (let k = 0; k < 4; k++) bx(0.1, 0.02, 0.42, -0.5 + k * 0.33, 1.02, -0.4, M('#9fe4ff', 0.8));
                    cy(0.5, 0.5, 0.06, 0, 0.06, 1.5, metal, 8);   // operator stool, on the deck
                    cy(0.1, 0.1, 0.44, 0, 0.28, 1.5, metal, 6);
                });
                break;
            }
            case 'server': {
                // Rack row with the LED strips flush on each door, a cable tray that runs the length of
                // the row above it, and the console at the back — no loose strips on the deck.
                fix(() => {
                    for (let i = 0; i < 4; i++) {
                        const x = -2.4 + i * 1.6, z = 0.4;
                        bx(0.84, 2.2, 1.6, x, 1.1, z, dark);
                        bx(0.88, 0.08, 1.64, x, 2.24, z, metal);                       // top cap
                        bx(0.9, 0.1, 1.66, x, 0.05, z, M('#1a1f24'));                  // plinth
                        bx(0.03, 1.9, 1.34, x + 0.43, 1.12, z, M('#333d48'));          // door panel
                        for (let k = 0; k < 6; k++) bx(0.05, 0.14, 1.2, x + 0.45, 0.42 + k * 0.3, z, k % 2 ? M('#4fcf7a', 0.85) : M('#4aa3df', 0.85));
                        bx(0.06, 0.24, 0.12, x - 0.4, 1.5, z + 0.62, M('#9fd7ff', 0.4));   // handle light
                        bx(0.1, 0.24, 0.32, x - 0.42, 0.9, z - 0.5, M('#39424e'));        // side port
                    }
                    bx(6.7, 0.08, 0.42, 0, 2.58, 0.4, dark);                            // cable tray
                    for (let i = 0; i < 4; i++) {
                        const x = -2.4 + i * 1.6;
                        for (const sz of [-0.15, 0.15]) bx(0.08, 0.3, 0.06, x + sz, 2.42, 0.4, metal);
                        cy(0.1, 0.1, 0.26, x + 0.25, 2.4, 0.55, M('#4aa3df', 0.35), 6);
                    }
                    // console at the back: screen on a foot bolted to the desk
                    bx(1.5, 0.9, 0.6, 0, 0.45, -2.6, panel);
                    bx(1.56, 0.06, 0.7, 0, 0.93, -2.6, metal);
                    bx(0.26, 0.12, 0.16, 0, 1.02, -2.54, dark);
                    bx(0.9, 0.62, 0.06, 0, 1.38, -2.5, metal, 0, -0.3);
                    bx(0.8, 0.52, 0.03, 0, 1.38, -2.46, screen, 0, -0.3);
                    bx(1.36, 0.05, 0.36, 0, 0.98, -2.45, dark);
                    // wall cabinet on the left, out of the standing zone
                    bx(1.0, 1.4, 0.4, -3.6, 0.7, -3.5, panel);
                    bx(0.86, 0.9, 0.03, -3.6, 0.72, -3.29, M('#39424e'));
                    for (let k = 0; k < 4; k++) bx(0.74, 0.06, 0.02, -3.6, 1.0 - k * 0.18, -3.28, k % 2 ? M('#4fcf7a', 0.7) : M('#4aa3df', 0.7));
                });
                break;
            }
            case 'storage': {
                // Cargo stands on the painted deck squares: part of the crates sit exactly inside the
                // marked zones (the same coordinates buildFloor paints), the rest are out in the open.
                fix(() => {
                    crateLid(-3.7, 2.5, 0.95, 0.1, crateMat);                       // zone A
                    crateLid(-2.62, 2.3, 0.88, 0.45, crateMat2, true);
                    crateLid(0.15, 3.0, 1.05, 0.08, crateMat);                      // zone B — stacked
                    crateLid(0.15, 3.0, 0.66, 0.42, crateMat2, false, 1.05);
                    crateLid(3.35, 0.2, 1.0, 0.2, crateMat2, true);                 // zone C
                    crateLid(4.0, 1.35, 0.75, -0.3, crateMat);
                    crateLid(-1.25, -3.65, 0.85, 0.1, crateMat);                    // zone E
                    crateLid(-0.4, -3.5, 0.8, -0.4, crateMat2);
                    ammoBox(-3.7, -1.75, 0.4, true); ammoBox(-3.15, -1.15, -0.3, false);   // zone D — boxes and a vest
                    vest(-2.05, -1.9, 0.5);
                    crateLid(-1.9, 0.8, 0.85, 0.6, crateMat2);                      // outside the zones
                    crateLid(2.5, 3.4, 0.8, -0.15, crateMat);
                    crateLid(-0.9, -1.9, 0.7, 0.35, crateMat2, true);
                    vest(1.4, 2.4, -0.5);
                    barrel(3.0, -1.6, hazard); barrel(3.5, -2.1, M('#52607a')); barrel(-2.9, 0.4, M('#52607a'));
                    // shelving against the wall, boxes seated on both shelves
                    const p = wallSpot(pickAngle([2.9, -2.9, 2.5, -2.5], 0.6)), fr = frameOf(p);
                    for (const sx of [-1.25, 1.25]) bx(0.1, 1.5, 0.5, fr.at(sx, 0.08)[0], 0.75, fr.at(sx, 0.08)[1], metal, p.ry);
                    for (const y of [0.9, 1.35]) bx(2.6, 0.07, 0.55, fr.at(0, 0.08)[0], y, fr.at(0, 0.08)[1], metal, p.ry);
                    for (let k = 0; k < 4; k++) bx(0.45, 0.34, 0.4, fr.at(-0.95 + k * 0.62, 0.28)[0], 1.1, fr.at(-0.95 + k * 0.62, 0.28)[1], k % 2 ? crateMat : olive, p.ry);
                    for (let k = 0; k < 3; k++) bx(0.5, 0.3, 0.42, fr.at(-0.7 + k * 0.7, 0.28)[0], 1.54, fr.at(-0.7 + k * 0.7, 0.28)[1], crateMat2, p.ry);
                    // pallet jack parked by the shelving
                    bx(0.7, 0.12, 0.3, fr.at(1.75, 0.5)[0], 0.12, fr.at(1.75, 0.5)[1], dark, p.ry);
                    bx(0.7, 0.1, 0.2, fr.at(1.75, 0.62)[0], 0.1, fr.at(1.75, 0.62)[1], metal, p.ry);
                });
                break;
            }
        }
        // automatic perimeter dressing between the exits
        const famil = TILE_STYLE[tile] || 'steel';
        const dressAngles = [];
        const nearUsed = a => usedAngles.some(u => Math.abs(Math.atan2(Math.sin(a - u), Math.cos(a - u))) < 0.32);
        for (let i = 0; i < 12; i++) { const a = (i + 0.5) / 12 * Math.PI * 2; const dz = Math.hypot(Math.sin(a) * (WALL_R - 0.9) - ZONE_C.x, Math.cos(a) * (WALL_R - 0.9) - ZONE_C.z); const nearExit = node.exitAngles.some(ea => Math.abs(Math.atan2(Math.sin(a - ea), Math.cos(a - ea))) < 0.5) || (node.techAngle !== null && Math.abs(Math.atan2(Math.sin(a - node.techAngle), Math.cos(a - node.techAngle))) < 0.5); if (!nearExit && dz > ZONE_R + 1.2 && !nearUsed(a)) dressAngles.push(a); }
        const dressing = [];
        dressAngles.forEach((a, i) => {
            const rr = WALL_R - 0.75; const x = Math.sin(a) * rr, z = Math.cos(a) * rr; const ry = a;
            const kind = (i + tile.length) % 5;
            const m = []; const push = (f) => { const before = statics.length; f(); m.push(...statics.splice(before)); };
            if (kind === 0) push(() => { pipes(x, z, ry + Math.PI / 2, 2); });
            else if (kind === 1) push(() => { if (famil === 'medical' || famil === 'lab') locker(x, z, ry + Math.PI); else if (famil === 'nest') { cy(0.1, 0.6, 1.3, x, 0.6, z, M('#3a2a3a'), 5); } else crateLid(x, z, 0.8, ry, famil === 'military' ? olive : crateMat2); });
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
        statics.push(...fixed, ...dressing);
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
            if (!doorPlaced && acc + l >= total / 2) { doorPlaced = { seg, z: total / 2 - acc - l / 2, l, ry }; }
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
        // --- the door: a wide bulkhead portal standing on its own slab, with the number on the beam ---
        const d = doorPlaced; const dz = d.z;
        const door = new (B().TransformNode)('door', S); door.parent = d.seg; door.position.set(0, 0, dz);
        // The frame is wider than the corridor, so it stands on a bulkhead slab instead of hanging in
        // the air: the stepped deck under it reads as a reinforced section of the corridor at the door.
        const slab = B().MeshBuilder.CreateBox('dslab', { width: 5.4, height: 0.36, depth: 2.2 }, S);
        slab.parent = door; slab.position.y = -0.15; slab.material = M('#26313d'); slab.isPickable = false;
        const step = B().MeshBuilder.CreateBox('dstep', { width: 5.8, height: 0.14, depth: 2.6 }, S);
        step.parent = door; step.position.y = -0.36; step.material = M('#1b242e'); step.isPickable = false;
        // a real open frame (two posts + a wide header + sill) so you can see through an open door
        for (const s of [-1, 1]) { const post = B().MeshBuilder.CreateBox('post', { width: 1.2, height: 2.35, depth: 1.0 }, S); post.parent = door; post.position.set(s * 1.7, 1.175, 0); post.material = M('#8c96a0'); post.isPickable = false; }
        // The header is the sign: it is wide enough to hold the number and deep enough to read it from
        // the table's camera without zooming onto the door.
        const lintel = B().MeshBuilder.CreateBox('lintel', { width: 5.2, height: 0.5, depth: 2.1 }, S); lintel.parent = door; lintel.position.y = 2.6; lintel.material = M('#8c96a0'); lintel.isPickable = false;
        const sill = B().MeshBuilder.CreateBox('sill', { width: 2.24, height: 0.07, depth: 0.5 }, S); sill.parent = door; sill.position.y = 0.02; sill.material = M('#5a6673'); sill.isPickable = false;
        // light trim around the door opening (shares the arch-band material: dim steel, orange on noise)
        for (const f of [-1, 1]) { for (const s of [-1, 1]) { const t = B().MeshBuilder.CreateBox('dt', { width: 0.1, height: 1.72, depth: 0.04 }, S); t.parent = door; t.position.set(s * 1.1, 0.86, f * 0.5); t.material = matA; t.isPickable = false; } const t = B().MeshBuilder.CreateBox('dt', { width: 2.3, height: 0.1, depth: 0.04 }, S); t.parent = door; t.position.set(0, 1.72, f * 0.5); t.material = matA; t.isPickable = false; }
        const panels = [];
        const PANEL_CLOSED = 0.55, PANEL_OPEN = 1.7;
        for (const s of [-1, 1]) {
            const p = B().MeshBuilder.CreateBox('panel', { width: 1.1, height: 1.72, depth: 0.16 }, S);
            p.parent = door; p.position.set(s * PANEL_CLOSED, 0.86, 0); p.material = M('#b8c4d0'); p.isPickable = false;
            const stripe = B().MeshBuilder.CreateBox('ps', { width: 0.1, height: 1.4, depth: 0.02 }, S);
            stripe.parent = p; stripe.position.set(-s * 0.3, 0, 0.09); stripe.material = M('#e05252', 0.6); stripe.isPickable = false;
            panels.push(p);
        }
        const noise = B().MeshBuilder.CreateCylinder('noise', { diameter: 1.4, height: 0.12, tessellation: 12 }, S);
        noise.parent = door; noise.position.set(0, 0.1, -2.2); noise.material = M('#f1c40f', 0.9); noise.isPickable = false; noise.setEnabled(false); noise.visibility = 0;   // kept for layout; the arch bands show noise
        const noiseLabel = this.makeLabel('nl_' + c.id, '🔊', '', door, 0, 1.4, -2.2, 1.4);
        noiseLabel.setEnabled(false);
        // --- the corridor number, stenciled flat on the beam -------------------------------------
        // Not a board and not a billboard: the number is painted on the top face of the header the way
        // the "?" is printed on the floor of an unexplored room — plain paint, no glow, always in the
        // same place. Alt repaints the same stencil as neon (setAlt -> setDecal).
        const exitA = ship.rooms[c.a].exits.find(e => e.corridor === c.id) || {};
        const nums = (exitA.nums && exitA.nums.length ? exitA.nums : [exitA.num]).filter(n => n);
        const plate = B().MeshBuilder.CreateBox('dplate', { width: 4.9, height: 0.06, depth: 1.9 }, S);
        plate.parent = door; plate.position.y = 2.88; plate.material = M('#33404e'); plate.isPickable = false;
        let decal = null;
        if (nums.length) {
            decal = this.makeDecal('cn_' + c.id, door, 0, 2.93, 0, 3.7, 1.85);
            // Lying flat, the stencil reads along the corridor. Both ways round are equally true, so
            // take the one that points up-screen for the table's default camera; the paint itself is
            // fixed on the beam (the "?" tokens behave the same way).
            decal.rotation.set(Math.PI / 2, 0, Math.cos(d.ry) - Math.sin(d.ry) < 0 ? Math.PI : 0);
            this.setDecal(decal, nums.join(' / '), false);
        }
        // Emergency lamps in the doorway: dark fixtures that are dead until the bulkhead seals. The
        // lenses are switched off, not merely dimmed, so an open door shows no red at all; once it
        // closes the opening is lit like a room on malfunction (updateCorridor).
        const lamps = [];
        for (const s of [-1, 1]) {
            const body = B().MeshBuilder.CreateBox('lem', { width: 0.22, height: 0.3, depth: 0.34 }, S);
            body.parent = door; body.position.set(s * 1.12, 2.08, 0); body.material = M('#2a3038'); body.isPickable = false;
            const lens = B().MeshBuilder.CreateBox('lel', { width: 0.1, height: 0.2, depth: 0.24 }, S);
            lens.parent = door; lens.position.set(s * 0.98, 2.08, 0); lens.material = M('#ff3a3a', 1.6); lens.isPickable = false; lens.setEnabled(false);
            lamps.push(lens);
        }
        const debris = [];
        for (let i = 0; i < 5; i++) {
            const db = B().MeshBuilder.CreateBox('debris', { width: 0.4, height: 0.12, depth: 0.5 }, S);
            db.parent = door; db.position.set((Math.random() - 0.5) * 1.6, 0.08, (Math.random() - 0.5) * 1.4); db.rotation.set(0, Math.random() * 3, (Math.random() - 0.5) * 0.4); db.material = M('#6b7a88'); db.isPickable = false; db.setEnabled(false);
            debris.push(db);
        }
        this.corridorNodes[c.id] = { root, panels, noise, noiseLabel, decal, nums, lamps, debris, ribsA: mA.concat(lA), ribsB: mB.concat(lB), matA, matB,
            panelClosed: PANEL_CLOSED, panelOpen: PANEL_OPEN, a: c.a, b: c.b, state: null };
    }

    /** A flat stencil decal: same paint as `makeLabel`, but it stays where it is painted instead of
     *  facing the camera, so it can lie on a beam or a floor. */
    makeDecal(name, parent, x, y, z, width, height) {
        const S = this.scene;
        const dt = new (B().DynamicTexture)(name + '_dt', { width: 512, height: 256 }, S, true);
        dt.hasAlpha = true;
        const plane = B().MeshBuilder.CreatePlane(name, { width, height }, S);
        plane.parent = parent; plane.position.set(x, y, z); plane.billboardMode = 0;
        const mat = new (B().StandardMaterial)(name + '_m', S);
        mat.diffuseTexture = dt; mat.emissiveColor = new (B().Color3)(1, 1, 1); mat.disableLighting = true; mat.backFaceCulling = false; mat.useAlphaFromDiffuseTexture = true;
        plane.material = mat; plane.isPickable = false;
        plane.metadata = { dt, decal: null };
        return plane;
    }

    /** The corridor number stenciled on the door beam. Printed state: the same pale slate paint as the
     *  "?" on an unexplored room's floor, no glow, no shadow. Alt turns the very same stencil neon, so
     *  the number only lights up while the key is held. */
    setDecal(plane, text, neon) {
        const key = text + '|' + (neon ? 'n' : 'p');
        if (plane.metadata.decal === key) return;
        plane.metadata.decal = key;
        const dt = plane.metadata.dt, ctx = dt.getContext();
        const W = 512, H = 256;
        ctx.clearRect(0, 0, W, H);
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const font = px => 'bold ' + px + 'px Segoe UI, Arial';
        let size = 248;
        ctx.font = font(size);
        while (size > 60 && ctx.measureText(text).width > W - 24) { size -= 6; ctx.font = font(size); }
        ctx.fillStyle = neon ? '#ddfbff' : '#56687c';
        if (neon) { ctx.shadowColor = '#3fd0ff'; ctx.shadowBlur = 30; }
        ctx.fillText(text, W / 2, H / 2 + 6);
        if (neon) { ctx.shadowBlur = 8; ctx.fillStyle = '#ffffff'; ctx.fillText(text, W / 2, H / 2 + 6); }
        dt.update();
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
        ctx.textAlign = 'center'; ctx.shadowColor = '#000'; ctx.shadowBlur = 8;
        // long room names (the gallery prints them in full) shrink to fit instead of being clipped
        let size = 64;
        const font = px => 'bold ' + px + 'px Segoe UI, Arial';
        ctx.font = font(size);
        while (size > 26 && ctx.measureText(big).width > 496) { size -= 4; ctx.font = font(size); }
        ctx.fillStyle = color;
        ctx.fillText(big, 256, small ? 70 + (64 - size) * 0.25 : 100);
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
        this.guardLights();
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
        if (this.alt) this.setAlt(true);
    }

    tileFor(view, r) {
        const rs = view.roomState[r.id];
        return rs.tile || (r.kind === 'cockpit' ? 'cockpit' : r.kind === 'hibernatorium' ? 'hibernatorium' : r.kind === 'engine' ? 'engine' : null);
    }

    updateRoom(view, r) {
        const node = this.roomNodes[r.id]; const rs = view.roomState[r.id];
        const tile = this.tileFor(view, r);
        const def = tile ? this.roomTiles[tile] : null;
        // An unexplored slot has no name yet: nobody at the table knows which tile it is.
        const name = def ? def.name + (r.kind === 'engine' ? ' №' + r.engineNo : '') : '???';
        // The gallery is for looking at models, so the room name goes big and the number small;
        // in a game the big line is the room number, which is what players say out loud.
        const slot = def && def.slot === '1' ? 'базовый' : def && def.slot === '2' ? 'дополнительный' : 'особый';
        this.setLabel(node.label,
            def ? (this.gallery ? name : r.id) : (this.gallery ? '?' : '? ' + r.id),
            def ? (this.gallery ? '№' + r.id + ' · ' + slot : name) : name,
            def ? '#ffffff' : '#8a99ab');
        if (node.altLabel) {
            this.setLabel(node.altLabel, def ? def.name : '???', '', def ? '#ffd27f' : '#8a99ab');
            node.altLabel.setEnabled(!!this.alt);
            node.label.setEnabled(!this.alt);
        }
        node.sel.setEnabled(this.selectable.has(r.id));
        this.syncItemDots(node, tile);
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
        this.syncFire(node, !!rs.fire);
        let k = 0;
        for (const o of rs.objects) this.addObject(o.type, node.root, k++, r.id, k - 1);
        if (tile === 'nest' && rs.explored) for (let i = 0; i < view.nestEggs; i++) this.addObject('egg', node.root, 10 + i);
        // Escape pods in their section (rules p. 2 step 7: 2 pods for 1-2 players, 3 for 3-4, 4 for 5,
        // alternating A/B). The tiles are hidden until explored, so the pods appear with the room.
        this.syncPods(node, view, tile === 'evacA' ? 'A' : tile === 'evacB' ? 'B' : null);
    }

    /** Escape pods of one section, rebuilt only when their state (lock/occupants/launch) changes. */
    syncPods(node, view, section) {
        const pods = section ? (view.pods || []).filter(p => p.section === section).sort((a, b) => a.num - b.num) : [];
        const key = section ? pods.map(p => [p.num, p.locked ? 'L' : 'o', (p.occupants || []).length, p.launched ? 'up' : p.removed ? 'rm' : ''].join('')).join('|') : '';
        if (node.podsRoot && node.podKey === key) return;
        if (node.podsRoot) {
            node.podsRoot.dispose();                       // meshes only: the cached materials are shared
            for (const m of node.podMats || []) m.dispose(true, true);   // materials owned by the pods
            node.podsRoot = null;
        }
        node.podMats = [];
        node.podKey = key;
        if (!pods.length) return;
        const root = new (B().TransformNode)('pods_' + node.data.id, this.scene);
        root.parent = node.root;
        pods.forEach((p, i) => {
            const x = (i === 0 ? -1 : 1) * 2.5, z = 1.05;
            const pose = new (B().TransformNode)('podpose_' + p.num, this.scene);
            pose.parent = root; pose.position.set(x, 0, z); pose.scaling.setAll(0.62);   // about a character tall
            pose.rotation.y = Math.atan2(-x, -z);   // the hatch faces the middle of the room
            if (p.launched || p.removed) this.buildEmptyCradle(pose, p, node.podMats);
            else this.buildPodModel(pose, p, node.podMats);
        });
        node.podsRoot = root;
    }

    /** Escape pod: a squat white capsule on a cradle, with a hatched porthole, hazard stripes,
     *  the pod number on the nose and a lamp that shows Locked (red) / Open (green) / Occupied (amber). */
    buildPodModel(parent, st, owned) {
        const S = this.scene;
        const shell = this.M('#d5dbe2'), shellDark = this.M('#a9b3bf'), seam = this.M('#69737e');
        const red = this.M('#b93a2e', 0.12), yellow = this.M('#e3bd3a', 0.18), dark = this.M('#1e262e');
        const glassM = new (B().StandardMaterial)('podGlass_' + st.num, S);
        glassM.diffuseColor = B().Color3.FromHexString('#17324b');
        glassM.emissiveColor = B().Color3.FromHexString('#2b6797').scale(0.6);
        glassM.specularColor = B().Color3.FromHexString('#bfe4ff');
        glassM.alpha = 0.9;
        owned.push(glassM);
        const add = m => { m.parent = parent; m.isPickable = false; m.convertToFlatShadedMesh && m.convertToFlatShadedMesh(); return m; };
        const cyl = (dt, db, h, y, mat, tess = 14) => { const m = B().MeshBuilder.CreateCylinder('podc', { diameterTop: dt, diameterBottom: db, height: h, tessellation: tess }, S); m.position.y = y; m.material = mat; return add(m); };
        const box = (w, h, d, x, y, z, mat, rx = 0) => { const m = B().MeshBuilder.CreateBox('podb', { width: w, height: h, depth: d }, S); m.position.set(x, y, z); m.rotation.x = rx; m.material = mat; return add(m); };
        // hull: skirt, faceted body, shoulder, nose cone, red tip
        cyl(1.66, 1.9, 0.28, 0.3, shellDark);
        cyl(1.58, 1.7, 1.45, 1.15, shell, 10);
        cyl(1.16, 1.58, 0.32, 2.02, shellDark, 10);
        cyl(0.52, 1.16, 0.4, 2.38, shell, 10);
        cyl(0.22, 0.54, 0.24, 2.7, red, 5);
        // four landing legs tucked under the skirt
        for (let i = 0; i < 4; i++) {
            const a = Math.PI / 4 + i * Math.PI / 2;
            const leg = B().MeshBuilder.CreateBox('podleg', { width: 0.18, height: 0.62, depth: 0.18 }, S);
            leg.parent = parent; leg.position.set(Math.sin(a) * 0.82, 0.42, Math.cos(a) * 0.82);
            leg.rotation.z = -Math.sin(a) * 0.32; leg.rotation.x = Math.cos(a) * 0.32; leg.material = shellDark; leg.isPickable = false;
            const foot = B().MeshBuilder.CreateCylinder('podfoot', { diameter: 0.34, height: 0.12, tessellation: 8 }, S);
            foot.parent = parent; foot.position.set(Math.sin(a) * 0.98, 0.2, Math.cos(a) * 0.98); foot.material = dark; foot.isPickable = false;
        }
        // yellow chevrons on the nose (the pod reads as "this way out" from above)
        for (const sgn of [-1, 1]) {
            const ch = B().MeshBuilder.CreateBox('podchev', { width: 0.1, height: 0.34, depth: 0.34 }, S);
            ch.parent = parent; ch.position.set(sgn * 0.3, 2.28, 0.3); ch.rotation.z = sgn * 0.6; ch.rotation.x = -0.5; ch.material = yellow; ch.isPickable = false;
        }
        // seams and the red identification band
        cyl(1.68, 1.7, 0.05, 0.6, seam, 16);
        cyl(1.5, 1.56, 0.05, 1.78, seam, 16);
        cyl(1.72, 1.76, 0.16, 1.52, red, 16);
        // yellow/black hazard strip around the skirt
        for (let i = 0; i < 10; i++) {
            const a = i / 10 * Math.PI * 2;
            const m = B().MeshBuilder.CreateBox('podh', { width: 0.34, height: 0.14, depth: 0.08 }, S);
            m.position.set(Math.sin(a) * 0.92, 0.62, Math.cos(a) * 0.92); m.rotation.y = a; m.material = i % 2 ? yellow : dark; add(m);
        }
        // hatch: raised door with a porthole and a handle
        box(1.06, 1.24, 0.16, 0, 1.04, 0.86, shellDark);
        box(0.86, 1.04, 0.07, 0, 1.04, 0.95, shell);
        { const m = B().MeshBuilder.CreateCylinder('podwin', { diameter: 0.46, height: 0.09, tessellation: 16 }, S); m.position.set(0, 1.26, 1.0); m.rotation.x = Math.PI / 2; m.material = glassM; add(m); }
        { const m = B().MeshBuilder.CreateTorus('podrim', { diameter: 0.55, thickness: 0.08, tessellation: 18 }, S); m.position.set(0, 1.26, 1.0); m.rotation.x = Math.PI / 2; m.material = seam; add(m); }
        box(0.11, 0.36, 0.11, 0.42, 0.86, 1.0, dark);
        if (st.locked) {   // a red locking bar: the pod cannot be entered yet
            box(1.34, 0.18, 0.18, 0, 1.04, 1.0, red);
            box(0.18, 0.66, 0.18, 0, 1.04, 1.02, red);
        }
        // yellow grab rails
        for (const s of [-1, 1]) { box(0.1, 0.62, 0.1, s * 0.72, 1.2, 0.66, yellow); box(0.1, 0.1, 0.34, s * 0.72, 0.9, 0.8, yellow); box(0.1, 0.1, 0.34, s * 0.72, 1.5, 0.8, yellow); }
        // number plate on the shoulder + status lamp
        const dt = new (B().DynamicTexture)('podnum_' + st.num, { width: 256, height: 256 }, S, true);
        dt.hasAlpha = true;
        const ctx = dt.getContext();
        ctx.clearRect(0, 0, 256, 256);
        ctx.fillStyle = '#2a323b'; ctx.beginPath(); ctx.arc(128, 128, 112, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#8e9aa6'; ctx.lineWidth = 9; ctx.beginPath(); ctx.arc(128, 128, 108, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#eef4f8'; ctx.font = 'bold 150px Segoe UI, Arial'; ctx.textAlign = 'center'; ctx.fillText(String(st.num), 128, 176);
        dt.update();
        const plateMat = new (B().StandardMaterial)('podplate_' + st.num, S);
        plateMat.diffuseTexture = dt; plateMat.emissiveColor = new (B().Color3)(1, 1, 1); plateMat.disableLighting = true;
        plateMat.useAlphaFromDiffuseTexture = true; plateMat.backFaceCulling = false;
        owned.push(plateMat);
        const plate = B().MeshBuilder.CreatePlane('podplate', { width: 0.34, height: 0.34 }, S);
        plate.parent = parent; plate.position.set(0, 0.78, 1.02); plate.material = plateMat; plate.isPickable = false;
        const lampHex = st.occupants && st.occupants.length ? '#ffb347' : st.locked ? '#e05252' : '#4fcf7a';
        // beacon on the nose (the board is seen from above) and a status ring on the cradle floor
        const lamp = B().MeshBuilder.CreateSphere('podlamp', { diameter: 0.28, segments: 8 }, S);
        lamp.parent = parent; lamp.position.set(0, 2.9, 0); lamp.material = this.M(lampHex, 1.7); lamp.isPickable = false;
        const halo = B().MeshBuilder.CreateTorus('podhalo', { diameter: 0.5, thickness: 0.05, tessellation: 16 }, S);
        halo.parent = parent; halo.position.set(0, 2.9, 0); halo.rotation.x = Math.PI / 2; halo.material = this.M(lampHex, 1); halo.isPickable = false;
        const ring = B().MeshBuilder.CreateTorus('podring', { diameter: 2.2, thickness: 0.09, tessellation: 26 }, S);
        ring.parent = parent; ring.position.set(0, 0.22, 0); ring.scaling.y = 0.6; ring.material = this.M(lampHex, 1.1); ring.isPickable = false;
        // section letter + pod number on the floor plate, readable from above
        const dtS = new (B().DynamicTexture)('podsec_' + st.num, { width: 256, height: 256 }, S, true);
        dtS.hasAlpha = true;
        const cs = dtS.getContext();
        cs.clearRect(0, 0, 256, 256);
        cs.fillStyle = st.locked ? '#d05a5a' : '#7fe0a0'; cs.font = 'bold 190px Segoe UI, Arial'; cs.textAlign = 'center';
        cs.fillText((st.section || 'A') + String(st.num), 128, 196);
        dtS.update();
        const secMat = new (B().StandardMaterial)('podsecm_' + st.num, S);
        secMat.diffuseTexture = dtS; secMat.emissiveColor = new (B().Color3)(1, 1, 1); secMat.disableLighting = true;
        secMat.useAlphaFromDiffuseTexture = true; secMat.backFaceCulling = false; secMat.alpha = 0.85;
        owned.push(secMat);
        const sec = B().MeshBuilder.CreatePlane('podsec', { width: 1.5, height: 1.5 }, S);
        sec.parent = parent; sec.position.set(0, 0.235, 0); sec.rotation.x = Math.PI / 2; sec.material = secMat; sec.isPickable = false;
        // umbilical cable to the cradle
        { const m = B().MeshBuilder.CreateCylinder('podcable', { diameterTop: 0.08, diameterBottom: 0.08, height: 0.9, tessellation: 6 }, S); m.parent = parent; m.position.set(1.02, 0.55, -0.2); m.rotation.z = 0.9; m.material = dark; m.isPickable = false; }
    }

    /** An empty cradle with a scorch mark: the pod was launched (or blown away) already. */
    buildEmptyCradle(parent, st, owned) {
        const S = this.scene;
        const plate = B().MeshBuilder.CreateCylinder('cradle', { diameter: 1.7, height: 0.1, tessellation: 18 }, S);
        plate.parent = parent; plate.position.y = 0.2; plate.material = this.M('#2a3239'); plate.isPickable = false; plate.convertToFlatShadedMesh();
        const scorch = B().MeshBuilder.CreateCylinder('scorch', { diameter: 1.5, height: 0.02, tessellation: 14 }, S);
        scorch.parent = parent; scorch.position.y = 0.26; scorch.material = this.M('#120f10'); scorch.isPickable = false;
        for (let i = 0; i < 5; i++) {
            const m = B().MeshBuilder.CreateBox('deb', { width: 0.3, height: 0.06, depth: 0.12 }, S);
            const a = i * 1.3; m.position.set(Math.cos(a) * 1.05, 0.24, Math.sin(a) * 1.05); m.rotation.y = a; m.material = this.M('#3a4148'); m.parent = parent; m.isPickable = false;
        }
        const tag = this.makeLabel('pode_' + st.num, '№' + st.num + ' ✕', '', parent, 0, 1.1, 0, 1.6);
        tag.parent = parent;
        owned.push(tag.material);
    }

    /** Main lighting of a room: every glowing material inside the shell is swapped for a dead (non-emissive) copy on malfunction. */
    /** Safety net for the shared materials.
     *
     *  Every material here is cached and frozen (flatMat). Freezing also switches off the readiness
     *  check, so a material keeps drawing with the shader it was compiled with. Babylon rebuilds all
     *  shaders when the number of lights in the scene changes: a frozen material then draws with a
     *  light list it was never compiled for and the board washes out white. Nothing in the game adds
     *  or removes lights any more, but if anything ever does, unfreeze the materials once so they are
     *  rebuilt instead of drawn wrong. */
    guardLights() {
        const n = this.scene.lights ? this.scene.lights.length : 0;
        if (this.lightCount === undefined) { this.lightCount = n; return; }
        if (this.lightCount === n) return;
        this.lightCount = n;
        const mats = (this.scene.materials || []).filter(m => m && m.unfreeze && m.freeze);
        for (const m of mats) m.unfreeze();
        setTimeout(() => { for (const m of mats) m.freeze(); }, 300);
    }

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

    /** Search item colours of a known room, floating above it while Alt is held. */
    syncItemDots(node, tile) {
        const key = tile || '';
        if (node.dotKey === key) { if (node.itemDots) node.itemDots.root.setEnabled(!!this.alt); return; }
        node.dotKey = key;
        if (node.itemDots) { node.itemDots.root.dispose(); node.itemDots = null; }
        const def = tile ? this.roomTiles[tile] : null;
        const items = (def && def.items) || [];
        if (!items.length) return;
        const root = new (B().TransformNode)('dots_' + (node.data ? node.data.id : 'r'), this.scene);
        root.parent = node.root; root.position.y = 2.35;
        items.forEach((c, i) => {
            const x = (i - (items.length - 1) / 2) * 1.15;
            const disc = B().MeshBuilder.CreateCylinder('dot', { diameter: 0.86, height: 0.12, tessellation: 18 }, this.scene);
            disc.position.x = x; disc.parent = root; disc.isPickable = false;
            disc.material = this.M(ITEM_COLORS[c] || '#9aa7b5', 1);
            const ring = B().MeshBuilder.CreateTorus('ring', { diameter: 0.96, thickness: 0.08, tessellation: 18 }, this.scene);
            ring.position.x = x; ring.parent = root; ring.isPickable = false;
            ring.material = this.M('#0b1016');
        });
        root.setEnabled(!!this.alt);
        node.itemDots = { root, count: items.length };
    }

    /** Alt overlay: corridor numbers, the Search colours and the room names (without numbers) above the rooms. */
    setAlt(on) {
        this.alt = !!on;
        for (const n of Object.values(this.roomNodes)) {
            if (n.itemDots) n.itemDots.root.setEnabled(this.alt);
            if (n.altLabel) n.altLabel.setEnabled(this.alt);
            n.label.setEnabled(!this.alt);
        }
        // Corridor numbers: plain paint stenciled on the beam by default, neon while Alt is held.
        for (const n of Object.values(this.corridorNodes)) {
            if (n.decal && n.nums && n.nums.length) this.setDecal(n.decal, n.nums.join(' / '), this.alt);
        }
    }

    /** Fire in a room: rebuilt only when the room catches fire or the fire goes out.
     *
     *  Deliberately no lights here. Every material in the scene is shared and frozen (see flatMat),
     *  and adding or disposing a light invalidates all of them at once: Babylon then redraws the
     *  frozen shaders with a light list they were never compiled for, and the whole board washed out
     *  white the moment a fire appeared or was put out (the fire post put it out and everything
     *  around vanished). The glow layer plus emissive flames give the same warm light and keep the
     *  light count constant at two for the whole game. */
    syncFire(node, on) {
        if (node.fireOn === on) return;
        node.fireOn = on;
        if (node.fireRoot) { node.fireRoot.dispose(); node.fireRoot = null; }
        node.fireParts = [];
        if (!on) return;
        const S = this.scene;
        const root = new (B().TransformNode)('fire_' + (node.data ? node.data.id : 'x'), S);
        root.parent = node.root;
        const parts = [];
        const add = (m, mat) => { m.parent = root; m.material = mat; m.isPickable = false; m.convertToFlatShadedMesh && m.convertToFlatShadedMesh(); parts.push(m); return m; };
        const cyl = (dt, db, h, tess, mat) => add(B().MeshBuilder.CreateCylinder('fire', { diameterTop: dt, diameterBottom: db, height: h, tessellation: tess }, S), mat);
        // The fire sits away from the standing zone (figures) but well inside the walls.
        const FX = -2.3, FZ = 2.0;
        const burn = cyl(4.6, 4.6, 0.02, 16, this.M('#171210')); burn.position.set(FX, 0.19, FZ);           // scorched deck
        const pool = cyl(4.0, 4.0, 0.02, 16, this.M('#ff7a1a', 0.75, { alpha: 0.3 })); pool.position.set(FX, 0.215, FZ);   // light pool
        // flames: a tall cluster around the fire with a hotter core, each on its own flicker phase
        for (let i = 0; i < 13; i++) {
            const a = (i / 13) * Math.PI * 2 + Math.random() * 0.4, rad = 0.25 + Math.random() * 1.45;
            const h = 1.5 + Math.random() * 1.5;
            const f = cyl(0, 0.55 + Math.random() * 0.55, h, 6, this.M(i % 3 === 2 ? '#ffc23b' : '#ff7a1a', 1, { alpha: 0.9 }));
            f.position.set(FX + Math.cos(a) * rad, h * 0.42, FZ + Math.sin(a) * rad);
            f.metadata = { fire: 'flame', phase: Math.random() * 6.28 };
        }
        for (let i = 0; i < 5; i++) {
            const h = 1.1 + Math.random() * 0.9;
            const c = cyl(0, 0.4 + Math.random() * 0.3, h, 6, this.M('#fff1b8', 1, { alpha: 0.95 }));
            c.position.set(FX + (Math.random() - 0.5) * 1.0, h * 0.5, FZ + (Math.random() - 0.5) * 1.0);
            c.metadata = { fire: 'flame', phase: Math.random() * 6.28 };
        }
        // embers rising out of the fire, and the smoke that hangs above it
        for (let i = 0; i < 6; i++) {
            const e = add(B().MeshBuilder.CreateSphere('ember', { diameter: 0.12, segments: 3 }, S), this.M('#ffd27a', 1));
            e.position.set(FX + (Math.random() - 0.5) * 2.2, 0.6, FZ + (Math.random() - 0.5) * 2.2);
            e.metadata = { fire: 'ember', phase: Math.random(), y0: 0.6 };
        }
        for (let i = 0; i < 4; i++) {
            const sm = cyl(2.2, 1.0, 1.6, 7, this.M('#2b2320', 0.06, { alpha: 0.22 }));
            sm.position.set(FX + (Math.random() - 0.5) * 1.6, 2.2, FZ + (Math.random() - 0.5) * 1.6);
            sm.metadata = { fire: 'smoke', phase: Math.random(), y0: 2.2 };
        }
        node.fireRoot = root; node.fireParts = parts;
    }
    addObject(type, parent, k, roomId, objIndex) {
        const S = this.scene;
        // objects lie inside the standing zone's outer rim so they are visible next to the figures
        const a = 2.4 + k * 0.7, rad = ZONE_R - 0.4;
        const x = ZONE_C.x + Math.cos(a) * rad, z = ZONE_C.z + Math.sin(a) * rad;
        let m;
        if (type === 'egg') { m = B().MeshBuilder.CreateSphere('egg', { diameter: 0.7, segments: 5 }, S); m.scaling.y = 1.3; m.position.set(x, 0.45, z); m.material = this.M('#b8a8c8'); }
        else if (type === 'carcass') { m = B().MeshBuilder.CreateBox('carc', { width: 1.6, height: 0.4, depth: 0.8 }, S); m.position.set(x, 0.3, z); m.rotation.y = a; m.material = this.M('#263036'); }
        else { m = B().MeshBuilder.CreateBox('corpse', { width: 1.5, height: 0.35, depth: 0.6 }, S); m.position.set(x, 0.28, z); m.rotation.y = a; m.material = this.M(type === 'charCorpse' ? '#8a6b5a' : '#4a7ab8'); }
        m.parent = parent; m.convertToFlatShadedMesh();
        // Room objects can be clicked to pick them up (nest eggs at k >= 10 are decoration only).
        m.isPickable = objIndex !== undefined;
        m.metadata = { roomId: roomId || (parent && parent.metadata && parent.metadata.room) || null, objectIndex: objIndex };
        this.dynamic.push(m);
    }

    /** Where a room / an intruder sits on screen, for popups anchored above it. */
    screenOf(kind, id) {
        const Bx = B();
        let pos = null;
        if (kind === 'room' && this.roomNodes[id]) pos = this.roomNodes[id].root.position.clone().add(new (Bx.Vector3)(0, 3.6, 0));
        else if (kind === 'intr' && this.intr[id]) pos = this.intr[id].root.position.clone().add(new (Bx.Vector3)(0, 2.3, 0));
        if (!pos) return null;
        const w = this.engine.getRenderWidth(), h = this.engine.getRenderHeight();
        const p = Bx.Vector3.Project(pos, Bx.Matrix.Identity(), this.scene.getTransformMatrix(), this.camera.viewport.toGlobal(w, h));
        if (!(p.z > 0 && p.z < 1)) return null;
        return { x: p.x, y: p.y };
    }

    /** Q/E in the gallery: turn the camera around the board. */
    rotateCam(da) { this.camera.alpha += da; }

    /** WASD panning of the board: move the camera target over the floor. */
    panCam(dx, dz) {
        const Bx = B(), cam = this.camera;
        const right = cam.getDirection(new (Bx.Vector3)(1, 0, 0)); right.y = 0; right.normalize();
        const fwd = cam.getDirection(new (Bx.Vector3)(0, 0, 1)); fwd.y = 0; fwd.normalize();
        const speed = Math.max(2.5, cam.radius * 0.055);
        cam.target.addInPlace(right.scale(dx * speed)).addInPlace(fwd.scale(dz * speed));
    }

    updateCorridor(view, c) {
        const n = this.corridorNodes[c.id];
        const exA = !!view.roomState[c.a].explored || this.shipRooms[c.a].kind !== 'slot1' && this.shipRooms[c.a].kind !== 'slot2';
        const exB = !!view.roomState[c.b].explored || this.shipRooms[c.b].kind !== 'slot1' && this.shipRooms[c.b].kind !== 'slot2';
        const key = c.door + '|' + c.noise + '|' + exA + '|' + exB;
        if (n.state === key) return;
        n.state = key;
        const closed = c.door === 'closed', destroyed = c.door === 'destroyed';
        n.panels[0].position.x = closed ? -n.panelClosed : -n.panelOpen;
        n.panels[1].position.x = closed ? n.panelClosed : n.panelOpen;
        n.panels[0].setEnabled(!destroyed); n.panels[1].setEnabled(!destroyed);
        for (const d of n.debris) d.setEnabled(destroyed);
        n.noiseLabel.setEnabled(!!c.noise);
        for (const l of n.lamps) l.setEnabled(closed);          // emergency light only while sealed
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
        if (off) { if (c) { c.root.dispose(); if (c.shadow) c.shadow.dispose(); delete this.cursors[pid]; } return; }
        if (!c) {
            const S = this.scene;
            const root = new (B().TransformNode)('cur' + pid, S);
            // A soft shadow marks the exact point on the floor: the arrow itself floats a bit higher.
            const shadow = B().MeshBuilder.CreateDisc('curs' + pid, { radius: 0.55, tessellation: 20 }, S);
            shadow.rotation.x = Math.PI / 2; shadow.position.set(x, 0.115, z); shadow.isPickable = false;
            shadow.material = flatMat(S, '#000000', { alpha: 0.3, spec: 0 });
            const arrow = B().MeshBuilder.CreateCylinder('cura', { diameterTop: 0, diameterBottom: 0.7, height: 1.1, tessellation: 3 }, S);
            arrow.parent = root; arrow.rotation.z = Math.PI; arrow.rotation.y = Math.PI / 6; arrow.position.y = 0.55; arrow.scaling.z = 0.35; arrow.isPickable = false;
            arrow.material = flatMat(S, color, { emissive: 0.55 });
            const ring = B().MeshBuilder.CreateTorus('curr', { diameter: 0.9, thickness: 0.06, tessellation: 16 }, S);
            ring.parent = root; ring.position.y = 0.04; ring.isPickable = false; ring.material = flatMat(S, color, { emissive: 0.8 });
            const label = this.makeLabel('curl', name, '', root, 0, 1.5, 0, 2.6);
            c = this.cursors[pid] = { root, shadow, target: new (B().Vector3)(x, 0, z), label, last: this.t };
            root.position.set(x, 0.32, z);
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
            if (!n) {
                n = { root: buildIntruder(S, it.type), label: null, uid: it.uid };
                n.label = this.makeLabel('il', '', '', n.root, 0, 3.0, 0, 2.6);
                this.intr[it.uid] = n;
                for (const m of n.root.getChildMeshes()) {
                    this.shadows.addShadowCaster(m);
                    m.isPickable = true; m.metadata = Object.assign({}, m.metadata, { intruder: it.uid, roomId: it.room });
                }
            }
            for (const m of n.root.getChildMeshes()) if (m.metadata) m.metadata.roomId = it.room;
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
        // Fire: flames flicker in place, embers climb out of them and the smoke drifts up and spreads.
        for (const n of Object.values(this.roomNodes)) {
            if (!n.fireParts || !n.fireParts.length) continue;
            for (const p of n.fireParts) {
                const md = p.metadata; if (!md) continue;
                if (md.fire === 'flame') {
                    const s = 0.88 + 0.22 * Math.sin(t * 9 + md.phase);
                    p.scaling.set(s, 1.18 - 0.22 * Math.sin(t * 6.5 + md.phase * 1.7), s);
                    p.rotation.y += 0.05;
                } else if (md.fire === 'ember') {
                    const q = (t * 0.42 + md.phase) % 1;
                    p.position.y = md.y0 + q * 2.8; p.visibility = Math.max(0, 1 - q * 1.15);
                } else if (md.fire === 'smoke') {
                    const q = (t * 0.2 + md.phase) % 1, s = 0.7 + q * 1.4;
                    p.position.y = md.y0 + q * 3.0; p.scaling.set(s, 1, s); p.visibility = 0.32 * (1 - q);
                }
            }
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
            c.root.position.y = 0.32 + Math.sin(t * 3) * 0.05;      // floats a little above the floor
            if (c.shadow) { c.shadow.position.x = c.root.position.x; c.shadow.position.z = c.root.position.z; }
        }
        for (let i = this.pings.length - 1; i >= 0; i--) {
            const p = this.pings[i], age = t - p.t0;
            if (age > 2.2) { p.root.dispose(); this.pings.splice(i, 1); continue; }
            p.rings.forEach((r, k) => { const a = Math.max(0, (age - k * 0.3) % 1.1); r.scaling.setAll(0.4 + a * 5); r.visibility = Math.max(0, 1 - a); });
            p.pin.position.y = 1.4 + Math.abs(Math.sin(age * 6)) * 0.5;
            p.root.rotation.y = age * 2;
        }
        for (const n of Object.values(this.intr)) if (n.target) { B().Vector3.LerpToRef(n.root.position, n.target, lerp, n.root.position); n.root.position.y = Math.abs(Math.sin(t * 3 + n.root.position.x)) * 0.05; }
        // Floating labels grow with distance so the board stays readable when zoomed out: room numbers
        // and the Alt overlay names. The corridor numbers are painted on the beams, so they stay put.
        const ls = this.camera.radius > 60 ? this.camera.radius / 60 : 1;
        for (const n of Object.values(this.roomNodes)) {
            n.label.scaling.setAll(ls);
            if (n.altLabel) n.altLabel.scaling.setAll(ls);
        }
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
            if (this.me != null) {
                const g = this.scene.pick(this.scene.pointerX, this.scene.pointerY, m => m.metadata && m.metadata.grab === this.me);
                const c = this.scene.pick(this.scene.pointerX, this.scene.pointerY, m => m.metadata && (m.metadata.intruder || m.metadata.objectIndex !== undefined || m.metadata.roomId));
                this.canvas.style.cursor = g && g.hit ? 'grab' : c && c.hit ? 'pointer' : '';
            }
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
            const px = this.scene.pointerX, py = this.scene.pointerY;
            const pick = this.scene.pick(px, py, m => m.metadata && (m.metadata.intruder || m.metadata.objectIndex !== undefined || m.metadata.roomId));
            if (!pick || !pick.hit) return;
            const md = pick.pickedMesh.metadata;
            if (md.intruder && this.cb.onIntruder) this.cb.onIntruder(md.intruder, md.roomId, px, py);
            else if (md.objectIndex !== undefined && md.objectIndex !== null && this.cb.onObject) this.cb.onObject(md.roomId, md.objectIndex, px, py);
            else if (md.roomId && this.cb.onClick) this.cb.onClick(md.roomId);
        }
    }

    focusRoom(roomId, radius) {
        const n = this.roomNodes[roomId]; if (!n) return;
        this.flyTo(n.root.position, radius);
    }

    /** Fly the camera to a point on the board, optionally changing the distance (the gallery uses it). */
    flyTo(target, radius) {
        const ease = new (B().CubicEase)(); ease.setEasingMode(B().EasingFunction.EASINGMODE_EASEINOUT);
        const anim = new (B().Animation)('focus', 'target', 60, B().Animation.ANIMATIONTYPE_VECTOR3, B().Animation.ANIMATIONLOOPMODE_CONSTANT);
        anim.setKeys([{ frame: 0, value: this.camera.target.clone() }, { frame: 30, value: target.clone() }]);
        anim.setEasingFunction(ease);
        this.camera.animations = [anim];
        if (radius) {
            const ra = new (B().Animation)('focusR', 'radius', 60, B().Animation.ANIMATIONTYPE_FLOAT, B().Animation.ANIMATIONLOOPMODE_CONSTANT);
            ra.setKeys([{ frame: 0, value: this.camera.radius }, { frame: 30, value: radius }]);
            ra.setEasingFunction(ease);
            this.camera.animations.push(ra);
        }
        this.scene.beginAnimation(this.camera, 0, 30, false);
    }

    /** Highlight one room with the orange selection ring (null clears it). */
    markRoom(roomId) {
        this.selectable = new Set(roomId ? [roomId] : []);
        for (const [id, n] of Object.entries(this.roomNodes)) n.sel.setEnabled(this.selectable.has(id));
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
