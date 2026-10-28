// scene3d.js — the 3D board: ship rooms as open low-poly locations, corridors, doors, markers,
// intruders and characters. Reads a per-player view (shared/view.mjs) and renders it.
//
// Room anatomy:
//   base  — hex platform, floor plates, tech-corridor stub, label (always visible);
//   shell — walls, portals, props, wall dressing (built once the tile is known);
//   zone  — the "standing zone": a marked circle where characters/intruders are placed, props keep out.
// Corridors are polylines (bends like on the printed board); ribs/LEDs are split into two halves so
// only the half next to an explored room is shown, LEDs turn yellow when the corridor has noise.

import { buildCharacter, buildIntruder, buildBody, flatMat } from './characters.js';
import { TUNE, doorSpec } from './tuning.js';
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
// The floor of a room is two layers: the deck plates (top at 0.10) and the tile finish laid over
// them, whose surface is 0.165. Figures, furniture and the corridor deck all stand on the finish —
// the plates alone are 6.5 cm lower, which is why everything used to look sunk into the floor.
export const FLOOR_Y = 0.165;      // the surface a figure stands on (top of the floor finish)
// The tech-corridor entrance is authored around a deck 12 cm above its own root, so the root is
// dropped by this much and the deck lands exactly on the room floor.
const TECH_STUB_DROP = 0.12;
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
        // Rendering group 1 is the Alt overlay (the Search colours of a room). Its depth buffer is
        // cleared before it draws, so a colour chip is never hidden behind a prop, a wall or a
        // figure: the chip belongs to the room, not to whatever happens to stand in it.
        this.scene.setRenderingAutoClearDepthStencil(1, true);
        this.shipKey = null; this.selectable = new Set(); this.hover = null; this.t = 0; this.lastShotSeen = null;
        this.alt = false;
        this.gallery = false;   // room-gallery mode: labels show the room name instead of its id
        this.me = null; this.poses = {}; this.drag = null; this.cursors = {}; this.pings = []; this.canvas = canvas;
        // --- the board editor (nemesis/client/editor-panel.js) -------------------------------
        // Every mesh gets a stable id: "<owner>#<n>", numbered in creation order inside the build
        // step that made it. The board is procedural, so the order is the identity: the same id comes
        // back on the next build, which is what lets an edit (move, rotate, colour, delete) be saved
        // and applied inside the real game. Edit mode turns merging off so every part stays a part.
        this.edits = {};             // id -> { pos, rot, scale, color, hidden, deleted }
        this.editMode = false;
        this.editOwner = 'scene';
        this.editCount = 0;
        this.editMeshes = {};        // id -> mesh of the current build
        this.editPick = null;        // (sx, sy) -> mesh | null, set by the editor panel
        this.merging = false;        // MergeMeshes creates meshes: they must not take ids
        // Babylon 9 fires onNewMeshAddedObservable from a SetImmediate — i.e. after the whole build,
        // when the owner scope is already closed and every part would end up under the outer owner.
        // Editing needs the id at creation time, so the scene's own addMesh is wrapped instead: the
        // merge path is still skipped because MergeMeshes runs with `merging` set.
        const addMesh = this.scene.addMesh.bind(this.scene);
        this.scene.addMesh = (mesh, ...rest) => { const out = addMesh(mesh, ...rest); if (!this.merging) this.registerMesh(mesh); return out; };
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
    /** Give a mesh its stable editor id. Called for every mesh the scene creates. */
    registerMesh(mesh) {
        if (this.merging || !mesh) return mesh;
        if (mesh.metadata && mesh.metadata.editId) return mesh;
        const id = this.editOwner + '#' + (this.editCount++);
        mesh.metadata = Object.assign({}, mesh.metadata, { editId: id });
        this.editMeshes[id] = mesh;
        return mesh;
    }

    /** Forget the parts that a rebuild or a merge has already disposed: the registry lists live meshes only. */
    pruneEditMeshes() {
        for (const [id, m] of Object.entries(this.editMeshes)) if (!m || (m.isDisposed && m.isDisposed())) delete this.editMeshes[id];
        return this;
    }

    /** Run a build step with its own id space: ids it creates are stable from build to build. */
    owner(name, fn) {
        const prev = this.editOwner, count = this.editCount;
        this.editOwner = name; this.editCount = 0;
        try { return fn(); } finally { this.editOwner = prev; this.editCount = count; }
    }

    /** What the editor knows about a mesh id: its name, its owner and the edit on it. */
    editInfo(id) {
        const mesh = this.editMeshes[id];
        return {
            id, name: mesh ? mesh.name : '', owner: String(id).split('#')[0],
            hasEdit: !!this.edits[id], edit: this.edits[id] ? Object.assign({}, this.edits[id]) : null,
        };
    }

    /** Editing on/off: no merging, everything pickable, the game's own pointer logic paused. */
    setEditMode(on) {
        this.editMode = !!on;
        for (const m of Object.values(this.editMeshes)) if (m && m.setEnabled && !m.isDisposed()) m.isPickable = this.editMode;
        return this;
    }

    /** The mesh under a screen point while editing (null on empty space).
     *  `sx, sy` are CSS pixels inside the canvas — the point a pointer event gives — and a thin wire
     *  is given a second chance in a ring around the click: at the board's scale a cable is well
     *  under a pixel wide, and asking the user to hit it exactly is not editing. */
    pickMesh(sx, sy) {
        if (!this.scene || !this.scene.pick) return null;
        const eng = this.engine;
        const canvas = eng && eng.getRenderingCanvas ? eng.getRenderingCanvas() : null;
        const rect = canvas && canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : null;
        // CSS pixels -> render pixels: a canvas scaled by the layout (or by devicePixelRatio) is
        // bigger than the box the pointer is measured in, and an unscaled pick misses everything.
        const cw = rect && rect.width > 0 ? rect.width : eng.getRenderWidth();
        const ch = rect && rect.height > 0 ? rect.height : eng.getRenderHeight();
        const kx = eng.getRenderWidth() / (cw || 1), ky = eng.getRenderHeight() / (ch || 1);
        const pred = m => !!(m.metadata && m.metadata.editId);
        const tryAt = (x, y) => {
            const r = this.scene.pick(x, y, pred, false, this.camera);
            return r && r.hit ? r.pickedMesh : null;
        };
        const x = sx * kx, y = sy * ky;
        const exact = tryAt(x, y);
        if (exact) return exact;
        for (const rad of [4, 10, 18]) {
            for (let i = 0; i < 8; i++) {
                const a = (i / 8) * Math.PI * 2;
                const hit = tryAt(x + Math.cos(a) * rad * kx, y + Math.sin(a) * rad * ky);
                if (hit) return hit;
            }
        }
        return null;
    }

    /** Take the saved edits (nemesis/client/board-edits.json) and apply them to the next build. */
    setEdits(edits) { this.edits = Object.assign({}, edits || {}); return this; }

    /** Record one edit. `patch` fields win; a null removes the field; an empty patch drops the entry. */
    setEdit(id, patch) {
        const e = Object.assign({}, this.edits[id] || {}, patch || {});
        for (const k of Object.keys(e)) if (e[k] === null || e[k] === undefined) delete e[k];
        if (Object.keys(e).length) this.edits[id] = e; else delete this.edits[id];
        this.editMeshes[id] && this.applyEdit(this.editMeshes[id]);
        return this.edits[id] || null;
    }

    /** Apply a saved edit to one freshly built mesh (before it is merged, so it bakes in). */
    applyEdit(mesh) {
        const id = mesh && mesh.metadata && mesh.metadata.editId;
        if (!id) return mesh;
        const e = this.edits[id];
        if (!e) return mesh;
        if (e.pos) mesh.position.set(e.pos[0], e.pos[1], e.pos[2]);
        if (e.rot) mesh.rotation.set(e.rot[0], e.rot[1], e.rot[2]);
        if (e.scale) mesh.scaling.set(e.scale[0], e.scale[1], e.scale[2]);
        if (e.color) mesh.material = this.M(String(e.color), e.glow ? 1 : 0);
        if (e.hidden) mesh.setEnabled(false);
        if (e.deleted) mesh.metadata = Object.assign({}, mesh.metadata, { deleted: true });
        return mesh;
    }

    mergeStatic(meshes, parent) {
        // The editor first: saved edits are applied to the parts, then deleted ones are dropped, and
        // while editing nothing is merged — every wire and bolt has to stay clickable.
        const live = [];
        for (const m of meshes) {
            this.applyEdit(m);
            // A deleted part is not dropped silently: it is switched off here, so it disappears from the
            // board in the game and in the editor alike, and only Reset (drop the edit) brings it back.
            if (m.metadata && m.metadata.deleted) { if (m.setEnabled && m.isEnabled()) m.setEnabled(false); continue; }
            live.push(m);
        }
        if (this.editMode) {
            for (const m of live) { m.parent = parent; m.isPickable = true; m.receiveShadows = true; }
            return live;
        }
        const groups = new Map();
        for (const m of live) { const k = m.material ? m.material.uniqueId : 0; (groups.get(k) || groups.set(k, []).get(k)).push(m); }
        const out = [];
        this.merging = true;
        try {
            for (const arr of groups.values()) {
                let mesh = arr[0];
                if (arr.length > 1) {
                    const mat = arr[0].material; mesh = B().Mesh.MergeMeshes(arr, true, true, undefined, false, false);
                    if (!mesh) continue;
                    mesh.material = mat;
                    for (const src of arr) { const id = src.metadata && src.metadata.editId; if (id) delete this.editMeshes[id]; }
                }
                mesh.parent = parent; mesh.isPickable = false; mesh.receiveShadows = true; this.shadows.addShadowCaster(mesh); out.push(mesh);
            }
        } finally { this.merging = false; }
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
        // Size the camera once: a rebuild (the tuning editor moves a slider) must not yank the view.
        if (!this.camSized) { this.camera.radius = Math.max(70, (b.maxX - b.minX) * SCALE * 0.9); this.camSized = true; }
        this.shipRooms = ship.rooms; this.ship = ship;
        // Keep the ids of the meshes that survive this build (the deck, the stars — they are made once,
        // in the constructor) and drop the ones the disposal just above killed.
        this.pruneEditMeshes();
        for (const r of Object.values(ship.rooms)) this.owner('room:' + r.id, () => this.buildRoomBase(r));
        for (const c of Object.values(ship.corridors)) this.owner('cor:' + c.id, () => this.buildCorridor(ship, c));
        this.owner('hull', () => this.buildHull(ship));
        // a part that is not merged (a label, a plat) still gets its edit right here
        for (const m of Object.values(this.editMeshes)) if (m && !m.isDisposed() && !(m.metadata && m.metadata.deleted)) this.applyEdit(m);
        // while editing, everything the player could point at must be clickable for the designer
        if (this.editMode) for (const m of Object.values(this.editMeshes)) if (m && m.setEnabled && m.isEnabled()) m.isPickable = true;
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
        let techAngle = null, techLeds = [], techDecal = null;
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
            // The stub is authored for a 0.12 deck: lift it so its runner is level with the room floor.
            const stubRoot = new (B().TransformNode)('stub_' + r.id, S);
            stubRoot.parent = root; stubRoot.position.y = FLOOR_Y - TECH_STUB_DROP;
            const stub = this.buildTechStub(stubRoot, techAngle, (r.techNums && r.techNums.length) ? r.techNums : [4]);
            techLeds = stub.leds; techDecal = stub.decal;
        }
        const label = this.makeLabel('lbl_' + r.id, r.id, '', root, 0, 3.2, 0, 3.0);
        // Alt overlay: the room name alone (no number), bigger, so the board reads by names while Alt is held
        // Alt names a room in words instead of its number: half again the size of the id plate
        // (3.0) so the board reads by names from the far zoom level.
        const altLabel = this.makeLabel('altlbl_' + r.id, '', '', root, 0, 3.5, 0, 6.0);
        altLabel.setEnabled(false);
        // face-down room token: a big "?" printed on the unexplored floor
        const qm = this.makeLabel('qm_' + r.id, '?', '', root, 0, 0.13, 0, 7.5);
        qm.rotation.set(Math.PI / 2, 0, 0); qm.billboardMode = 0; qm.isPickable = false;
        { const ctx = qm.metadata.dt.getContext(); ctx.clearRect(0, 0, 512, 160); ctx.font = 'bold 150px Segoe UI, Arial'; ctx.textAlign = 'center'; ctx.fillStyle = '#56687c'; ctx.fillText('?', 256, 138); qm.metadata.dt.update(); qm.metadata.text = 'qm'; }
        this.roomNodes[r.id] = { root, plat, sel, label, altLabel, qm, data: r, exitAngles, techAngle, techLeds, techDecal, shell: null, shellKey: null, strips: null, emergency: [], malfunction: false, flicker: Math.random() * 10, flip: null, pop: null, podsRoot: null, podKey: null, fireRoot: null, fireOn: null, fireParts: [], cpu: null, cpuBoxes: [], cpuKey: null, cpuSpots: null };
    }

    /** Technical-corridor entrance: a short tunnel through the wall line, ringed with blue LEDs.
     *  Its roof carries the noise numbers of this entrance, stenciled flat like the "?" on a room
     *  floor (Alt paints the same stencil neon), so the number the die needs is read on the hatch. */
    buildTechStub(root, a, nums = []) {
        const S = this.scene;
        const statics = [];
        const sx = Math.sin(a), cz = Math.cos(a);
        const px = sx * (WALL_R + 0.4), pz = cz * (WALL_R + 0.4);
        const mk = (w, h, d, ox, y, oz, mat) => { const m = B().MeshBuilder.CreateBox('ts', { width: w, height: h, depth: d }, S); m.position.set(px + Math.cos(a) * ox - Math.sin(a) * oz, y, pz - Math.sin(a) * ox - Math.cos(a) * oz); m.rotation.y = a; m.material = mat; statics.push(m); return m; };
        const steel = this.M('#6d7f8f'), dark = this.M('#0b1016'), trim = this.M('#aab6c2');
        // Everything that glows blue on the hatch is its own mesh and shares the LED material: with a
        // noise token in the tech corridor the whole entrance turns yellow, not just the ring of lamps.
        const leds = [];
        const mkLed = (w, h, d, ox, y, oz) => {
            const m = B().MeshBuilder.CreateBox('ts', { width: w, height: h, depth: d }, S);
            m.position.set(px + Math.cos(a) * ox - Math.sin(a) * oz, y, pz - Math.sin(a) * ox - Math.cos(a) * oz);
            m.rotation.y = a; m.parent = root; m.isPickable = false; leds.push(m); return m;
        };
        mk(2.4, 0.3, 2.4, 0, -0.1, 0.4, steel);                       // tunnel floor
        mk(2.4, 1.7, 0.3, 0, 0.85, 1.5, steel);                       // back wall of the stub
        for (const s of [-1, 1]) mk(0.3, 1.7, 2.4, s * 1.2, 0.85, 0.4, steel);  // side walls
        mk(2.4, 0.25, 2.4, 0, 1.75, 0.4, trim);                       // roof
        // Roof: the centre stays clear for the stenciled number — the conduits moved to the two
        // edges and the cross-bars to the ends, where they frame the digits instead of running over
        // them. Two thin blue light rails still mark the sides.
        for (const s of [-1, 1]) mkLed(0.08, 0.06, 2.0, s * 0.95, 1.9, 0.3);
        for (const ox of [-1.06, 1.06]) { const pipe = B().MeshBuilder.CreateCylinder('tp', { diameter: 0.16, height: 2.0, tessellation: 6 }, S); pipe.position.set(px + Math.cos(a) * ox - Math.sin(a) * 0.3, 1.94, pz - Math.sin(a) * ox - Math.cos(a) * 0.3); pipe.rotation.set(Math.PI / 2, a, 0); pipe.material = this.M('#55636f'); statics.push(pipe); }
        for (const oz of [-0.62, 1.42]) mk(2.3, 0.1, 0.12, 0, 1.94, oz, this.M('#3a4652'));
        mk(1.6, 1.3, 0.2, 0, 0.75, 1.3, dark);                        // dark opening
        mkLed(1.5, 0.06, 2.0, 0, 0.09, 0.3);                           // floor runner (blue, yellow on noise)
        for (let i = 0; i < 3; i++) mk(0.1, 0.05, 1.6, -0.6 + i * 0.6, 0.22, 0.5, this.M('#2a3038'));  // grating
        this.mergeStatic(statics, root);
        // The entrance number, painted flat on the roof: plane faces are single-sided, so it has to
        // be turned face up and its text laid toward the room (rotation.z = PI) or it reads mirrored.
        // Positioned on the hatch's own roof (the stub sits WALL_R + 0.4 out from the room centre),
        // turned with the stub (rotation.y = a) and laid face up with the digits' tops pointing out
        // of the ship, so a player reading it from inside the room sees a normal number.
        const decal = nums.length
            ? this.makeDecal('tn_' + root.name, root, px - Math.sin(a) * 0.4, 1.89, pz - Math.cos(a) * 0.4, 1.55, 0.78)
            : null;
        if (decal) {
            // A Babylon plane's painted face points along its local -Z: rotation.x = +pi/2 turns that
            // face up (the same pose as the corridor numbers), so the digits are never seen through
            // the back of the plane. rotation.z = 0 stands the digits' tops outwards, which reads
            // correctly from inside the room.
            decal.rotation.set(Math.PI / 2, a, 0);
            this.setDecal(decal, nums.join(' / '), false);
        }
        // LED ring around the opening (separate meshes: colour changes with tech noise)
        const ledMat = this.M('#3fa9ff', 1);
        const ring = [[-1.0, 0.3], [-1.0, 0.9], [-1.0, 1.5], [-0.5, 1.9], [0.5, 1.9], [1.0, 1.5], [1.0, 0.9], [1.0, 0.3]];
        for (const [ox, y] of ring) { const m = B().MeshBuilder.CreateBox('led', { width: 0.14, height: 0.14, depth: 0.08 }, S); m.position.set(px + Math.cos(a) * ox + Math.sin(a) * 0.95, y, pz - Math.sin(a) * ox + Math.cos(a) * 0.95); m.rotation.y = a; m.material = ledMat; m.parent = root; m.isPickable = false; leds.push(m); }
        return { leds, decal };
    }

    // ---------------------------------------------------------------------------------------
    // Room shell: walls + portals + props + dressing (once the tile is known)
    // ---------------------------------------------------------------------------------------
    buildShell(node, tile) {
        const S = this.scene; const root = new (B().TransformNode)('shell', S); root.parent = node.root;
        // The floor plates are 0.10 thick, so the walls, portals and furniture stand on their top face
        // instead of being sunk into them.
        root.position.y = FLOOR_Y;
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
            th.position.set(px - Math.sin(ea) * 0.5, 0.025, pz - Math.cos(ea) * 0.5); th.rotation.y = ea; th.material = this.M('#c9a227'); statics.push(th);
            for (let k = 0; k < 4; k++) { const hz = B().MeshBuilder.CreateBox('hz', { width: 0.25, height: 0.06, depth: 0.8 }, S); hz.position.set(px - Math.sin(ea) * 0.5 + Math.cos(ea) * (-0.9 + k * 0.6), 0.038, pz - Math.cos(ea) * 0.5 - Math.sin(ea) * (-0.9 + k * 0.6)); hz.rotation.y = ea; hz.material = this.M('#1a1a1a'); statics.push(hz); }
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
        // The finish is a child of the room base (not of this shell): its surface is the floor the shell
        // stands on, so walls, furniture and figures all share the same height instead of sinking into it.
        this.buildFloor(tile, node.root);
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
        const R = WALL_R - 0.35, Y = 0.115;   // local to the room base: the finish tops out at FLOOR_Y
        const inR = (x, z, m = 0) => Math.hypot(x, z) < R - m;
        const box = (w, h, d, x, y, z, mat, ry = 0) => { const m = B().MeshBuilder.CreateBox('fl', { width: w, height: h, depth: d }, S); m.position.set(x, y, z); m.rotation.y = ry; m.material = mat; statics.push(m); return m; };
        const disc = (dia, h, x, y, z, mat, tess = 24) => { const m = B().MeshBuilder.CreateCylinder('fd', { diameter: dia, height: h, tessellation: tess }, S); m.position.set(x, y, z); m.material = mat; statics.push(m); return m; };
        // the neutral disc runs under the wall ring too, so no groove shows between the finish and the walls
        const base = (hex) => disc(WALL_R * 2 + 0.2, 0.04, 0, Y, 0, this.M(hex), 40);
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
        // Consoles are collected so that a room with a Computer can hand them a pick box afterwards:
        // the furniture itself is merged into the room's static mesh and loses its identity there.
        const consoles = [];
        // Rooms whose Computer is not a desk console (a wall panel, a control station) name their own spot.
        const cpuSpots = [];
        const cpu_ = (x, z, ry) => cpuSpots.push({ x, z, ry });
        const console_ = (x, z, ry) => {
            const desk = bx(1.4, 0.9, 0.6, x, 0.45, z, panel, ry);
            bx(1.5, 0.06, 0.7, x, 0.93, z, metal, ry);                                                   // desktop
            bx(0.24, 0.12, 0.16, LX(x, z, ry, 0, -0.14), 1.02, LZ(x, z, ry, 0, -0.14), dark, ry);        // screen foot
            bx(1.26, 0.78, 0.07, LX(x, z, ry, 0, -0.1), 1.4, LZ(x, z, ry, 0, -0.1), metal, ry, -0.3);    // bezel
            bx(1.12, 0.64, 0.03, LX(x, z, ry, 0, -0.06), 1.4, LZ(x, z, ry, 0, -0.06), screen, ry, -0.3); // display
            bx(1.06, 0.05, 0.38, LX(x, z, ry, 0, 0.12), 0.98, LZ(x, z, ry, 0, 0.12), dark, ry);          // keyboard
            bx(0.3, 0.04, 0.2, LX(x, z, ry, 0.42, 0.12), 0.99, LZ(x, z, ry, 0.42, 0.12), accent, ry);    // control pad
            consoles.push({ desk, ry });
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
        const pipes = (x, z, ry, n = 3, len = 2.6) => { for (let i = 0; i < n; i++) cy(0.14, 0.14, len, x + Math.sin(ry + Math.PI / 2) * i * 0.2, 0.2 + i * 0.2, z + Math.cos(ry + Math.PI / 2) * i * 0.2, i % 2 ? metal : hazard, 6, Math.PI / 2); };
        const bed = (x, z, ry) => { bx(0.9, 0.3, 2.0, x, 0.3, z, metal, ry); bx(0.84, 0.12, 1.9, x, 0.5, z, white, ry); bx(0.6, 0.1, 0.4, LX(x, z, ry, 0, 0.7), 0.58, LZ(x, z, ry, 0, 0.7), M('#c0392b'), ry); };
        // Painted floor outline: laid on top of the floor finish — this root stands on the finish, so a
        // strip a centimetre above y = 0 reads as paint on the deck.
        const floorZone = (x, z, w, d, ry, mat) => { bx(w, 0.02, 0.1, x, 0.012, z - d / 2, mat, ry); bx(w, 0.02, 0.1, x, 0.012, z + d / 2, mat, ry); bx(0.1, 0.02, d, x - w / 2, 0.012, z, mat, ry); bx(0.1, 0.02, d, x + w / 2, 0.012, z, mat, ry); };
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
        // --- the wall ring: where a piece of wall furniture may actually stand ----------------------
        // A room's wall is not solid. The board generator puts corridor mouths (3.0 wide, the wall is
        // cut open for them) and the technical-corridor hatch at whatever angles the ship needs, so a
        // cabinet "against the wall" at a fixed angle can hang in the middle of a doorway — which is
        // what used to happen to the wall pieces of the rooms. Every wall piece is therefore placed by
        // its WIDTH: `wall()` looks for a clear stretch of the ring, snaps the angle out of a doorway,
        // and builds NOTHING when the ring has no room left for the piece (an absent cabinet is better
        // than a cabinet in the passage: a player reads the second one as a broken room).
        const wrap = (x) => Math.atan2(Math.sin(x), Math.cos(x));
        const DOOR_HALF = 1.62;    // half of the 3.0-wide doorway, plus the portal posts
        const HATCH_HALF = 1.42;   // half of the technical-corridor hatch
        /** Is a stretch of wall `half` metres each side of `a` free of every passage? */
        const wallClear = (a, half = 0.6, gap = 0.14) => {
            for (const ea of (node.exitAngles || [])) {
                if (Math.abs(wrap(a - ea)) * WALL_R < DOOR_HALF + half + gap) return false;
            }
            if (node.techAngle != null && Math.abs(wrap(a - node.techAngle)) * WALL_R < HATCH_HALF + half + gap) return false;
            return true;
        };
        const nearExit = (a, g = 0.5) => !wallClear(a, Math.max(0, g * WALL_R - DOOR_HALF - 0.14));
        // Wall furniture must also stay clear of the standing zone (figures stand front-right).
        const zoneSafe = (a) => Math.hypot(Math.sin(a) * 5.1 - ZONE_C.x, Math.cos(a) * 5.1 - ZONE_C.z) > 4.0;
        /** The nearest angle to `pref` where a piece `width` wide fits, ignoring the figures' zone. */
        const fitAngle = (pref, width = 1.2, gap = 0.14) => {
            const half = width / 2;
            if (wallClear(pref, half, gap)) return pref;
            for (let i = 1; i <= 64; i++) for (const sgn of [1, -1]) {
                const a = pref + sgn * i * 0.05;
                if (wallClear(a, half, gap)) return a;
            }
            return null;
        };
        const freeAngle = (pref, gap = 0.75, width = 1.2) => {
            for (let i = 1; i <= 36; i++) for (const sgn of [1, -1]) {
                const a = pref + sgn * i * 0.09;
                if (wallClear(a, width / 2, gap) && zoneSafe(a)) return a;
            }
            return fitAngle(pref, width) ?? pref;
        };
        // Angles taken by wall furniture: the automatic perimeter dressing keeps out of them.
        const usedAngles = [];
        /** A spot against the wall: `r` from the centre, front (+z) looking into the room. The default
         *  radius puts the back of a ~0.8-deep unit right against the wall ring (WALL_R = 6.3).
         *  `width` is the piece's own width: the spot is snapped out of a doorway, and when the whole
         *  ring is taken by passages the spot is `null` — nothing is built there. */
        const wallSpot = (a, r = 5.75, width = 1.2) => {
            const aa = a == null ? null : fitAngle(a, width);
            if (aa == null) { node.wallSkips = (node.wallSkips || 0) + 1; return null; }
            usedAngles.push(aa);
            (node.wallSpots || (node.wallSpots = [])).push({ a: aa, width, r });
            return { a: aa, x: Math.sin(aa) * r, z: Math.cos(aa) * r, ry: aa + Math.PI };
        };
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
        /** Office chair: a five-foot base, gas post, seat, backrest and armrests, on the deck. */
        const chair = (x, z, ry = 0, seat = M('#3a4450')) => {
            cy(0.62, 0.62, 0.06, x, 0.14, z, dark, 8);                                     // foot cross
            for (let k = 0; k < 5; k++) { const a = ry + k / 5 * Math.PI * 2; bx(0.3, 0.06, 0.1, x + Math.cos(a) * 0.22, 0.1, z + Math.sin(a) * 0.22, dark, -a); }
            cy(0.1, 0.1, 0.38, x, 0.34, z, metal, 6);                                      // gas post
            bx(0.58, 0.1, 0.56, x, 0.55, z, seat, ry);                                     // seat
            bx(0.56, 0.62, 0.1, LX(x, z, ry, 0, -0.26), 0.9, LZ(x, z, ry, 0, -0.26), seat, ry, -0.12);   // backrest
            bx(0.6, 0.08, 0.1, LX(x, z, ry, 0, -0.28), 1.22, LZ(x, z, ry, 0, -0.28), metal, ry);          // headrail
            for (const sd of [-1, 1]) bx(0.08, 0.08, 0.34, LX(x, z, ry, sd * 0.32, 0), 0.72, LZ(x, z, ry, sd * 0.32, 0), dark, ry);   // armrests
        };
        /** A bank of monitors on a slim frame, standing on the deck and facing the room. `n` screens
         *  in a row, each with a lit display and a bezel; used as a station wall inside a room. */
        const screenBank = (x, z, ry, n = 3, w = 3.4, h = 1.5) => {
            const step = w / n;
            bx(w + 0.14, 0.1, 0.3, x, h + 0.34, z, metal, ry);                             // top rail
            bx(w + 0.14, 0.1, 0.3, x, 0.06, z, dark, ry);                                  // foot rail
            for (const sd of [-1, 1]) bx(0.12, h + 0.4, 0.24, LX(x, z, ry, sd * w / 2, 0), (h + 0.4) / 2, LZ(x, z, ry, sd * w / 2, 0), metal, ry);
            for (let k = 0; k < n; k++) {
                const u = -w / 2 + step * (k + 0.5);
                bx(step - 0.12, h, 0.1, LX(x, z, ry, u, 0.04), h / 2 + 0.24, LZ(x, z, ry, u, 0.04), M('#1e252c'), ry);
                bx(step - 0.24, h - 0.16, 0.03, LX(x, z, ry, u, 0.1), h / 2 + 0.24, LZ(x, z, ry, u, 0.1), k % 3 === 1 ? M('#e05252', 0.6) : k % 3 === 2 ? M('#4fcf7a', 0.6) : screen, ry);
                for (let r2 = 0; r2 < 4; r2++) bx(step - 0.4, 0.04, 0.02, LX(x, z, ry, u, 0.12), h / 2 + 0.44 - r2 * 0.22, LZ(x, z, ry, u, 0.12), M('#dff0ff', 0.55), ry);
            }
        };
        /** A coil of cable lying on the deck: a fat matte ring with a darker hub. */
        const coil = (x, z, dia = 0.9, mat = M('#20262c')) => {
            cy(dia, dia, 0.16, x, 0.2, z, mat, 12);
            cy(dia * 0.55, dia * 0.55, 0.18, x, 0.21, z, M('#12171c'), 12);
            cy(dia * 0.9, dia * 0.9, 0.05, x, 0.3, z, M('#39424e'), 12);
        };
        /** Holo plinth: a pedestal with a projector ring and a floating, glowing disc above it. */
        const holoTable = (x, z, dia = 1.6, h = 1.0, hex = '#4aa3df') => {
            cy(dia * 0.7, dia * 0.9, 0.14, x, 0.07, z, dark, 10);                          // base
            cy(dia * 0.4, dia * 0.4, h * 0.7, x, 0.16 + h * 0.35, z, M('#39424e'), 10);    // column
            cy(dia, dia, 0.12, x, 0.16 + h * 0.7, z, metal, 10);                           // table top
            cy(dia * 0.86, dia * 0.86, 0.04, x, 0.24 + h * 0.7, z, M(hex, 0.5), 10);       // lit inlay
            for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; bx(0.1, 0.1, 0.1, x + Math.cos(a) * dia * 0.46, 0.1 + h * 0.7, z + Math.sin(a) * dia * 0.46, M(hex, 0.9)); }
            cy(dia * 0.9, dia * 0.9, 0.03, x, 0.8 + h * 0.7, z, M(hex, 0.35, { alpha: 0.35 }), 14);   // floating holo disc
            cy(dia * 0.5, dia * 0.5, 0.02, x, 0.98 + h * 0.7, z, M(hex, 0.45, { alpha: 0.3 }), 12);    // inner ring
            for (let k = 0; k < 4; k++) bx(dia * 0.5, 0.02, 0.03, x, 0.86 + h * 0.7 + k * 0.12, z, M(hex, 0.35, { alpha: 0.4 }), k * 0.4);
        };
        /** First candidate wall angle where a piece `width` wide fits and keeps clear of the standing
         *  zone; then any free angle; then the nearest free angle to the candidates. Never a doorway. */
        const pickAngle = (cands, gap = 0.5, width = 1.2) => {
            const half = width / 2;
            return cands.find(a => wallClear(a, half, gap) && zoneSafe(a))
                ?? cands.find(a => wallClear(a, half, gap))
                ?? fitAngle(cands[0], width);
        };
        /** Build a piece of wall furniture, or nothing at all when the wall has no room for it.
         *  `cands` is one angle or a list of preferred ones; `width` is the piece's own width. */
        const wall = (cands, width, draw, r = 5.78) => {
            const list = Array.isArray(cands) ? cands : [cands];
            const spot = wallSpot(pickAngle(list, 0.2, width), r, width);
            if (!spot) return false;
            draw(spot, frameOf(spot));
            return true;
        };

        switch (tile) {
            case 'cockpit': {
                // The bridge: a windshield of lit panes across the front, one continuous helm desk under
                // it, two pilot seats, the navigation plinth behind them and the ship's status board on
                // the clearest wall. The bridge is fixed furniture, so all of it is built inside fix().
                fix(() => {
                    const glass = M('#7fb8ff', 0.25, { alpha: 0.3 });
                    // --- windshield: sill, head rail, posts, mullions and lit panes -------------------
                    const fz = 4.4;
                    bx(6.2, 0.28, 0.36, 0, 0.17, fz, metal);
                    bx(6.2, 0.26, 0.36, 0, 2.36, fz, metal);
                    for (const sd of [-1, 1]) bx(0.3, 2.48, 0.36, sd * 2.9, 1.26, fz, metal);
                    for (const mx of [-1.45, 0, 1.45]) bx(0.16, 2.22, 0.28, mx, 1.26, fz, metal);
                    for (const mx of [-2.17, -0.72, 0.72, 2.17]) bx(1.34, 2.04, 0.05, mx, 1.26, fz + 0.02, glass);
                    for (let k = 0; k < 8; k++) bx(0.9, 0.04, 0.03, -2.45 + k * 0.7, 2.14, fz - 0.17, M('#9fe4ff', 0.5));
                    // --- one helm desk in three blocks, the display shelf running over all of them ----
                    for (const [cx, cz, ry] of [[-2.0, 2.9, 0.22], [0, 3.15, 0], [2.0, 2.9, -0.22]]) {
                        bx(2.0, 0.88, 0.72, cx, 0.44, cz, panel, ry);                              // desk body
                        bx(2.06, 0.07, 0.78, cx, 0.91, cz, metal, ry);                             // desk top
                        for (let k = 0; k < 3; k++) bx(0.5, 0.04, 0.34, LX(cx, cz, ry, -0.6 + k * 0.6, 0.12), 0.95, LZ(cx, cz, ry, -0.6 + k * 0.6, 0.12), dark, ry);   // keyboards
                        for (let k = 0; k < 4; k++) cy(0.1, 0.1, 0.05, LX(cx, cz, ry, -0.72 + k * 0.48, 0.3), 0.96, LZ(cx, cz, ry, -0.72 + k * 0.48, 0.3), [M('#4fcf7a', 0.8), M('#4aa3df', 0.85), M('#ffb347', 0.75), M('#e05252', 0.7)][k], 8);
                        bx(0.16, 0.5, 0.16, LX(cx, cz, ry, -0.86, -0.16), 1.16, LZ(cx, cz, ry, -0.86, -0.16), metal, ry);   // shelf post
                        bx(1.9, 0.08, 0.5, LX(cx, cz, ry, 0, -0.2), 1.44, LZ(cx, cz, ry, 0, -0.2), metal, ry);              // screen shelf
                    }
                    bx(5.4, 0.6, 0.06, 0, 1.44, 2.78, M('#1e252c'), 0, -0.22);                     // display wall
                    for (let k = 0; k < 5; k++) bx(0.96, 0.44, 0.03, -2.2 + k * 1.1, 1.46, 2.74, k === 3 ? M('#e05252', 0.6) : screen, 0, -0.22);
                    for (let k = 0; k < 6; k++) bx(4.9, 0.03, 0.02, 0, 1.66 - k * 0.09, 2.7, M('#dff0ff', 0.6), 0, -0.22);
                    // --- two pilot seats facing the windshield --------------------------------------
                    for (const sx of [-1.05, 1.05]) {
                        cy(0.9, 0.98, 0.16, sx, 0.08, 1.5, dark, 10);                              // pedestal foot
                        cy(0.32, 0.34, 0.34, sx, 0.33, 1.5, metal, 8);                             // column
                        chair(sx, 1.5, 0, M('#3a4450'));
                        for (const sd of [-1, 1]) bx(0.1, 0.7, 0.1, sx + sd * 0.34, 1.06, 1.3, M('#c9a227'), 0);   // harness rails
                        bx(0.66, 0.09, 0.12, sx, 1.36, 1.24, M('#c9a227'), 0);                     // shoulder strap
                        bx(0.34, 0.12, 0.24, sx, 0.82, 1.74, M('#2b333d'), 0);                     // knee pad
                    }
                    // --- navigation plinth between the seats and the door ---------------------------
                    holoTable(0, -1.3, 1.7, 0.95, '#7fb8ff');
                    for (let k = 0; k < 5; k++) bx(0.9, 0.02, 0.06, 0, 0.178, -0.15 + k * 0.16, M('#4aa3df', 0.25));
                    // --- deck: the helm lane and the painted outline of the bridge ------------------
                    bx(2.4, 0.02, 3.6, 0, 0.172, 2.7, M('#22303f'));
                    for (let k = 0; k < 7; k++) bx(1.8, 0.02, 0.12, 0, 0.18, 1.2 + k * 0.46, k % 2 ? M('#39485a') : M('#2b3746'));
                    for (const sd of [-1, 1]) bx(0.12, 0.02, 3.6, sd * 1.18, 0.18, 2.7, M('#4aa3df', 0.3));
                });
                // the ship's status board on a free wall
                wall([Math.PI, Math.PI - 0.55, Math.PI + 0.55, 2.4, -2.4], 2.8, (p, fr) => fix(() => {
                    bx(2.7, 1.6, 0.2, p.x, 1.3, p.z, M('#232b33'), p.ry);                       // board body
                    for (let r2 = 0; r2 < 3; r2++) for (let c = 0; c < 4; c++)
                        bx(0.5, 0.3, 0.04, fr.at(-0.75 + c * 0.5, 0.14)[0], 1.85 - r2 * 0.42, fr.at(-0.75 + c * 0.5, 0.14)[1], [screen, M('#4fcf7a', 0.6), M('#ffb347', 0.55), M('#e05252', 0.55)][(r2 * 4 + c) % 4], p.ry);
                    bx(2.5, 0.1, 0.26, p.x, 2.16, p.z, metal, p.ry);
                    bx(1.2, 0.2, 0.05, fr.at(0, 0.16)[0], 2.42, fr.at(0, 0.16)[1], M('#ffd27f', 0.7), p.ry);
                    for (const sd of [-1, 1]) bx(0.34, 1.0, 0.3, fr.at(sd * 1.5, -0.02)[0], 0.5, fr.at(sd * 1.5, -0.02)[1], M('#39424e'), p.ry);
                }));
                break;
            }
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
                // The stacks: six open wall cabinets with half-pulled books, two reading desks in the
                // free middle, a catalogue console with its card drawers, a trolley of returns and a
                // rolling ladder hooked on the first shelf. A shelf is placed by its own width, so a
                // doorway or a technical hatch simply leaves a gap in the row instead of a cabinet
                // hanging over the passage.
                const shelf = (a) => {
                    const p = wallSpot(a, 5.75, 2.1);
                    if (!p) return false;                       // no clear wall left: skip this shelf
                    const fr = frameOf(p), ry = p.ry;
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
                            bx(0.24, 0.3, 0.16, fr.at(u, v)[0], y + 0.19, fr.at(u, v)[1], b % 3 ? (k % 2 ? accent : screen) : M('#7d8b9c'), ry + (b % 2 ? 0.09 : -0.07), 0);
                        }
                    }
                    bx(0.55, 0.07, 0.03, fr.at(0.4, 0.3)[0], 1.86, fr.at(0.4, 0.3)[1], M('#ffd27f', 0.8), ry);   // shelf label
                    return true;
                };
                // Walking the ring clockwise from the left wall, so the two halves of the room never
                // fight over the same stretch of wall. The standing zone is skipped outright.
                const ARC = [-2.85, -2.4, -1.95, -1.05, -0.35, 0.15, 3.55, 3.1, 2.65];
                let firstShelf = null, shelves = 0;
                for (const a of ARC) {
                    if (shelves >= 6) break;
                    if (!zoneSafe(a) || nearExit(a, 0.45)) continue;
                    let built = false;
                    fix(() => { built = shelf(a); });
                    if (built) { shelves++; if (firstShelf == null) firstShelf = a; }
                }
                // reading desks between the rows, in the free middle of the room
                fix(() => {
                    for (const [x, z] of [[0.3, 3.3], [-2.5, 1.7]]) {
                        bx(1.7, 0.08, 0.9, x, 0.78, z, M('#8b6b4a'));
                        for (const sx of [-0.7, 0.7]) for (const sz of [-0.32, 0.32]) bx(0.08, 0.74, 0.08, x + sx, 0.4, z + sz, dark);
                        bx(0.26, 0.32, 0.5, x, 0.82, z, dark);                          // stack of books
                        bx(0.22, 0.06, 0.4, x + 0.3, 0.6, z - 0.1, M('#4fcf7a', 0.5));  // open volume
                        cy(0.1, 0.1, 0.5, x - 0.6, 1.05, z - 0.2, metal, 6); cy(0.3, 0.22, 0.16, x - 0.6, 1.33, z - 0.2, M('#ffd27f', 0.6), 8);
                    }
                    // the reader's chair at the far desk
                    chair(0.3, 4.2, Math.PI, M('#4a3b2c'));
                });
                plant(2.8, 1.0);
                // catalogue console on a free wall, with the card drawers beside it
                wall(freeAngle(2.5, 0.7), 2.4, (p, fr) => {
                    fix(() => console_(p.x, p.z, p.ry));
                    fix(() => {
                        bx(0.72, 1.15, 0.5, fr.at(0.95, 0.1)[0], 0.58, fr.at(0.95, 0.1)[1], M('#5a4632'), p.ry);   // cabinet
                        for (let r2 = 0; r2 < 5; r2++) for (let c = 0; c < 2; c++)
                            bx(0.3, 0.1, 0.04, fr.at(0.75 + c * 0.4, 0.38)[0], 0.98 - r2 * 0.19, fr.at(0.75 + c * 0.4, 0.38)[1], M('#8b6b4a'), p.ry);
                        bx(0.5, 0.04, 0.03, fr.at(0.95, 0.4)[0], 1.19, fr.at(0.95, 0.4)[1], M('#ffd27f', 0.55), p.ry);   // drawer label
                    });
                });
                // trolley of returned volumes in the aisle, and the ladder hooked on the first shelf
                fix(() => {
                    const cx = -1.1, cz = -3.5, cr = -0.5;
                    bx(0.9, 0.06, 0.06, cx, 0.06, cz, metal, cr);                              // cart deck
                    for (const [ox, oz] of [[-0.36, -0.22], [0.36, -0.22], [-0.36, 0.22], [0.36, 0.22]])
                        cy(0.08, 0.08, 0.14, LX(cx, cz, cr, ox, oz), 0.09, LZ(cx, cz, cr, ox, oz), dark, 6);
                    for (let k = 0; k < 6; k++) {
                        const ox = -0.34 + (k % 3) * 0.26, oz = -0.06 + Math.floor(k / 3) * 0.18;
                        bx(0.26, 0.3, 0.2, LX(cx, cz, cr, ox, oz), 0.21, LZ(cx, cz, cr, ox, oz), k % 3 ? (k % 2 ? accent : screen) : M('#7d8b9c'), cr + (k % 2 ? 0.1 : -0.08));
                    }
                    for (const sd of [-1, 1]) bx(0.05, 0.34, 0.05, LX(cx, cz, cr, sd * 0.44, 0), 0.26, LZ(cx, cz, cr, sd * 0.44, 0), metal, cr);
                    if (firstShelf != null) {
                        const la = firstShelf + 0.24, lx = Math.sin(la) * 5.35, lz = Math.cos(la) * 5.35;
                        for (const sd of [-1, 1]) bx(0.06, 2.0, 0.06, LX(lx, lz, la, sd * 0.26, 0), 1.0, LZ(lx, lz, la, sd * 0.26, 0), metal, la, 0.16);
                        for (let k = 0; k < 6; k++) bx(0.52, 0.05, 0.05, LX(lx, lz, la, 0, 0.1 + k * 0.045), 0.3 + k * 0.29, LZ(lx, lz, la, 0, 0.1 + k * 0.045), metal, la);
                        bx(0.1, 0.1, 0.1, lx - Math.sin(la) * 0.12, 2.02, lz - Math.cos(la) * 0.12, dark, la);   // hook block
                    }
                });
                break;
            }
            case 'comms': {
                // The radio shack: a wide operator station on the clearest wall, a dish on a pedestal
                // off to one side, a relay rack beside the desk, cable bundles running overhead and a
                // status board opposite. The station reserves 4.6 m of wall, so its racks and pipe run
                // can never end up in a doorway.
                let stationA = null;
                wall([1.05, 0.7, 1.4, 2.2, -0.6], 4.6, (p, fr) => fix(() => {
                    stationA = p.a;
                    // monitor bank against the wall, the desk standing in front of it: the bank's posts
                    // reach the deck behind the desk instead of punching through its top
                    screenBank(fr.at(0, 0)[0], fr.at(0, 0)[1], p.ry, 3, 2.6, 1.15);
                    const d1 = fr.at(0, 0.5);
                    bx(2.6, 0.95, 0.8, d1[0], 0.48, d1[1], panel, p.ry);                        // main desk
                    bx(2.66, 0.07, 0.86, d1[0], 0.99, d1[1], metal, p.ry);                      // desk top
                    bx(2.2, 0.06, 0.42, fr.at(0, 0.72)[0], 1.03, fr.at(0, 0.72)[1], dark, p.ry);   // keyboard shelf
                    for (let k = 0; k < 4; k++) {
                        cy(0.13, 0.13, 0.05, fr.at(-0.9 + k * 0.6, 0.74)[0], 1.04, fr.at(-0.9 + k * 0.6, 0.74)[1],
                            [M('#4fcf7a', 0.85), M('#4aa3df', 0.85), M('#ffb347', 0.8), M('#e05252', 0.8)][k], 8);
                    }
                    for (const sd of [-1, 1]) {                                                 // desk drawers
                        bx(0.8, 0.66, 0.06, fr.at(sd * 0.85, 0.92)[0], 0.5, fr.at(sd * 0.85, 0.92)[1], M('#39424e'), p.ry);
                        bx(0.5, 0.05, 0.05, fr.at(sd * 0.85, 0.96)[0], 0.62, fr.at(sd * 0.85, 0.96)[1], metal, p.ry);
                    }
                    pipes(fr.at(-1.75, 0.26)[0], fr.at(-1.75, 0.26)[1], p.ry, 1, 1.1);           // conduit beside the station
                    chair(fr.at(0.15, 1.5)[0], fr.at(0.15, 1.5)[1], p.ry + Math.PI, M('#39424e'));
                    bx(0.3, 0.22, 0.05, fr.at(-0.35, -0.2)[0], 2.28, fr.at(-0.35, -0.2)[1], M('#4fcf7a', 0.55), p.ry);   // lit "on air" plate
                }));
                // two relay racks flanking the station, each placed on its own stretch of wall so the
                // rack body stays inside the ring even when the desk sits on a curve
                const rack = (q, qf) => fix(() => {
                    bx(0.72, 2.1, 0.62, q.x, 1.05, q.z, dark, q.ry);
                    bx(0.76, 0.08, 0.66, q.x, 2.14, q.z, metal, q.ry);
                    for (let r2 = 0; r2 < 4; r2++) {
                        bx(0.6, 0.26, 0.04, qf.at(0, 0.33)[0], 1.76 - r2 * 0.42, qf.at(0, 0.33)[1], M('#2b333d'), q.ry);
                        for (let c = 0; c < 6; c++) bx(0.05, 0.1, 0.02, qf.at(-0.24 + c * 0.095, 0.36)[0], 1.8 - r2 * 0.42, qf.at(-0.24 + c * 0.095, 0.36)[1], c % 3 === 0 ? M('#ffb347', 0.85) : M('#4fcf7a', 0.85), q.ry);
                    }
                    cy(0.1, 0.1, 1.5, qf.at(-0.42, 0.2)[0], 1.1, qf.at(-0.42, 0.2)[1], M('#20262c'), 6);   // cable bundle
                    bx(0.5, 0.3, 0.03, qf.at(0, 0.34)[0], 1.5, qf.at(0, 0.34)[1], M('#4aa3df', 0.5), q.ry);   // patch label
                });
                if (stationA != null) for (const off of [-0.32, 0.32]) wall(stationA + off, 0.9, rack, 5.7);
                // the dish on its pedestal: base, mast, yoke and a tilted dish with feed horn
                fix(() => {
                    // the pedestal goes on a ray that points away from every doorway, so the bowl never
                    // stands in front of a corridor mouth
                    const dA = [-2.5, 2.5, -1.1, 1.1, Math.PI].find(a => wallClear(a, 1.6)) ?? -2.5;
                    const dx = Math.sin(dA) * 4.3, dz = Math.cos(dA) * 4.3, da = dA;
                    if (!wallClear(dA, 1.6)) return;
                    cy(1.1, 1.2, 0.18, dx, 0.09, dz, dark, 10);
                    cy(0.4, 0.46, 0.5, dx, 0.35, dz, metal, 8);
                    cy(0.2, 0.24, 1.1, dx, 0.95, dz, metal, 6);
                    for (const sd of [-1, 1]) bx(0.14, 0.6, 0.16, LX(dx, dz, da, sd * 0.35, 0), 1.6, LZ(dx, dz, da, sd * 0.35, 0), metal, da);   // yoke arms
                    // the bowl is a shallow frustum laid face-up and tipped towards the room
                    const dish = cy(1.5, 0.55, 0.34, dx, 1.78, dz, M('#c9d3da'), 16);
                    dish.rotation.set(Math.PI / 2 - 0.5, 0, 0);
                    for (let k = 0; k < 3; k++) {                                               // feed struts across the bowl
                        const a = k / 3 * Math.PI;
                        bx(1.55, 0.05, 0.05, dx, 1.9, dz, M('#8c96a0'), a, -0.5);
                    }
                    cy(0.07, 0.07, 0.7, dx, 2.05, dz, metal, 6);                                 // feed arm
                    bx(0.22, 0.22, 0.22, dx, 2.35, dz, M('#4aa3df', 0.7));                       // feed horn
                    coil(dx - 1.5, dz + 0.9, 0.95, M('#20262c'));                                // drum of cable at its foot
                    bx(0.1, 0.1, 1.7, dx - 0.7, 0.16, dz + 0.5, M('#20262c'), -0.9);             // cable across the deck
                });
                // the status board opposite the station
                wall([-2.9, -2.4, 3.0, 2.4], 2.8, (p, fr) => fix(() => {
                    bx(2.6, 1.0, 0.14, p.x, 1.6, p.z, M('#232b33'), p.ry);
                    bx(2.7, 0.1, 0.2, p.x, 2.16, p.z, metal, p.ry);
                    bx(0.16, 0.9, 0.12, fr.at(-1.32, 0)[0], 1.6, fr.at(-1.32, 0)[1], metal, p.ry);
                    bx(0.16, 0.9, 0.12, fr.at(1.32, 0)[0], 1.6, fr.at(1.32, 0)[1], metal, p.ry);
                    for (let k = 0; k < 5; k++) bx(0.36, 0.5, 0.03, fr.at(-0.9 + k * 0.46, 0.09)[0], 1.62, fr.at(-0.9 + k * 0.46, 0.09)[1], k === 4 ? M('#e05252', 0.5) : M('#4aa3df', 0.45), p.ry);
                    bx(1.0, 0.2, 0.04, fr.at(0.6, 0.1)[0], 1.16, fr.at(0.6, 0.1)[1], M('#ffd27f', 0.6), p.ry);
                }));
                // signal-analysis bench out in the room: a tilted scope table with its own stool, so the
                // middle of the shack is not an empty circle
                fix(() => {
                    const bx0 = -1.4, bz0 = 1.5, br = 0.6;
                    bx(1.6, 0.08, 0.9, bx0, 0.78, bz0, M('#39424e'), br);
                    for (const [ox, oz] of [[-0.65, -0.32], [0.65, -0.32], [-0.65, 0.32], [0.65, 0.32]])
                        bx(0.08, 0.76, 0.08, LX(bx0, bz0, br, ox, oz), 0.38, LZ(bx0, bz0, br, ox, oz), dark, br);
                    bx(0.9, 0.6, 0.07, LX(bx0, bz0, br, 0, -0.1), 1.2, LZ(bx0, bz0, br, 0, -0.1), M('#1e252c'), br, 0.22);
                    bx(0.78, 0.5, 0.03, LX(bx0, bz0, br, 0, -0.05), 1.2, LZ(bx0, bz0, br, 0, -0.05), M('#4aa3df', 0.7), br, 0.22);
                    for (let k = 0; k < 4; k++) bx(0.62, 0.03, 0.02, LX(bx0, bz0, br, 0, 0), 1.34 - k * 0.1, LZ(bx0, bz0, br, 0, 0), M('#dff0ff', 0.6), br, 0.22);
                    chair(LX(bx0, bz0, br, 0, 0.78), LZ(bx0, bz0, br, 0, 0.78), br + Math.PI, M('#39424e'));
                    bx(0.4, 0.2, 0.3, LX(bx0, bz0, br, 0.15, 0.1), 0.84, LZ(bx0, bz0, br, 0.15, 0.1), M('#2b333d'), br);   // logbook stack
                    bx(0.1, 0.1, 2.4, 1.0, 0.16, 0.4, M('#20262c'), 0.3);           // cable along the deck
                });
                crateLid(0.4, -3.0, 0.8, 0.3, crateMat);
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
                    // supply cabinet with the trolley and the IV pole, reserved as one stretch of wall
                    wall([-2.35, -2.0, 2.35, 2.0], 3.0, (p, fr) => {
                        cabinet(p, 1.25, 1.8, 0.5, M('#3f8f5a'), M('#4fcf7a'), null);
                        bx(0.36, 0.1, 0.03, fr.at(0, 0.29)[0], 1.36, fr.at(0, 0.29)[1], M('#eaffea', 0.35), p.ry);   // green cross on the doors
                        bx(0.1, 0.36, 0.03, fr.at(0, 0.29)[0], 1.36, fr.at(0, 0.29)[1], M('#eaffea', 0.35), p.ry);
                        // instrument trolley beside the cabinet
                        bx(0.8, 0.08, 0.5, fr.at(1.05, 0.6)[0], 0.8, fr.at(1.05, 0.6)[1], metal, p.ry);
                        for (const sx of [-0.32, 0.32]) bx(0.06, 0.78, 0.06, fr.at(1.05 + sx, 0.6)[0], 0.4, fr.at(1.05 + sx, 0.6)[1], metal, p.ry);
                        bx(0.34, 0.22, 0.26, fr.at(0.9, 0.6)[0], 0.95, fr.at(0.9, 0.6)[1], white, p.ry);
                        cy(0.12, 0.12, 0.16, fr.at(1.2, 0.6)[0], 0.92, fr.at(1.2, 0.6)[1], M('#4fcf7a', 0.5), 8);
                        // IV pole on the other side, with a pump clamped to the mast
                        cy(0.07, 0.07, 1.6, fr.at(-0.95, 0.55)[0], 0.8, fr.at(-0.95, 0.55)[1], metal, 6);
                        bx(0.3, 0.36, 0.08, fr.at(-0.95, 0.55)[0], 1.45, fr.at(-0.95, 0.55)[1], M('#7fc7ff', 0.4, { alpha: 0.8 }), p.ry);
                        bx(0.34, 0.24, 0.2, fr.at(-0.95, 0.55)[0], 1.02, fr.at(-0.95, 0.55)[1], white, p.ry);
                        bx(0.24, 0.1, 0.03, fr.at(-0.95, 0.66)[0], 1.06, fr.at(-0.95, 0.66)[1], M('#4fcf7a', 0.7), p.ry);
                    });
                    // monitor arms over two of the beds: post at the head, boom and a lit screen
                    for (const [ma, mr] of [[-0.39, 3.35], [2.36, 3.35]]) {
                        const mx = Math.sin(ma) * mr, mz = Math.cos(ma) * mr;
                        cy(0.09, 0.11, 1.5, mx, 0.75, mz, metal, 6);
                        bx(0.06, 0.06, 0.9, LX(mx, mz, ma, 0, 0.42), 1.5, LZ(mx, mz, ma, 0, 0.42), metal, ma);
                        bx(0.56, 0.42, 0.06, LX(mx, mz, ma, 0, 0.82), 1.32, LZ(mx, mz, ma, 0, 0.82), M('#232b33'), ma, 0.2);
                        bx(0.46, 0.32, 0.03, LX(mx, mz, ma, 0, 0.86), 1.32, LZ(mx, mz, ma, 0, 0.86), M('#4fcf7a', 0.75), ma, 0.2);
                    }
                    // oxygen bottles racked by the wall, a waste bin and a linen trolley
                    const ox = [-1.35, -1.35], oz = [-3.05, -3.55];
                    bx(0.5, 0.9, 0.06, ox[0], 0.45, oz[0] + 0.2, metal);
                    for (const oz2 of oz) { cy(0.26, 0.26, 1.1, ox[1], 0.55, oz2, M('#2f6b8a'), 8); cy(0.1, 0.1, 0.18, ox[1], 1.18, oz2, metal, 6); }
                    cy(0.5, 0.42, 0.8, 2.35, 0.4, -2.55, M('#39424e'), 8);                     // clinical waste bin
                    bx(0.7, 0.06, 0.5, 3.05, 0.7, 1.45, metal, 0.3);                            // linen trolley shelf
                    bx(0.66, 0.22, 0.46, 3.05, 0.84, 1.45, white, 0.3);
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
                // Fire post, rebuilt after the board art: a hazard pad in the middle of the room carries a
                // double-sided rack of bottles, a second rank stands behind it, and the walls take the
                // fire panel, the hose reel, two blanket cabinets, the sand bucket and the sprinkler
                // riser. The ship's fire station has to read as one: bottles racked, clipped or boxed,
                // one extinguisher per mount, nothing floating and nothing standing in the walking lane.
                fix(() => {
                    /** One extinguisher: stand plate, bottle, foot ring, valve, lever, clipped hose and a
                     *  label plate on the front. `y0` is the deck it stands on, `s` its scale. */
                    const bottle = (x, z, ry = 0, y0 = 0, s = 1, hex = '#b5372c') => {
                        bx(0.46 * s, 0.06 * s, 0.46 * s, x, y0 + 0.03 * s, z, dark, ry);                    // stand plate
                        cy(0.36 * s, 0.34 * s, 0.82 * s, x, y0 + 0.47 * s, z, M(hex), 10);                 // bottle
                        cy(0.42 * s, 0.42 * s, 0.06 * s, x, y0 + 0.09 * s, z, M('#8e2a22'), 10);           // foot ring
                        cy(0.2 * s, 0.26 * s, 0.16 * s, x, y0 + 0.96 * s, z, metal, 8);                    // valve block
                        bx(0.1 * s, 0.05 * s, 0.26 * s, LX(x, z, ry, 0, -0.03 * s), y0 + 1.07 * s, LZ(x, z, ry, 0, -0.03 * s), dark, ry);   // lever
                        bx(0.09 * s, 0.24 * s, 0.09 * s, x, y0 + 1.16 * s, z, dark, ry);                   // carry handle
                        bx(0.24 * s, 0.36 * s, 0.07 * s, LX(x, z, ry, 0.23 * s, 0.02 * s), y0 + 0.62 * s, LZ(x, z, ry, 0.23 * s, 0.02 * s), M('#20262c'), ry);   // hose on the side
                        bx(0.12 * s, 0.2 * s, 0.03 * s, LX(x, z, ry, 0, 0.18 * s), y0 + 0.62 * s, LZ(x, z, ry, 0, 0.18 * s), M('#e8eef4'), ry);                  // label
                        cy(0.1 * s, 0.1 * s, 0.05 * s, LX(x, z, ry, -0.16 * s, 0), y0 + 0.98 * s, LZ(x, z, ry, -0.16 * s, 0), M('#dfe6ee'), 8);                // gauge
                    };
                    // --- the rack in the middle: a long steel plinth, two ranks of bottles, rail above ---
                    bx(4.5, 0.14, 1.5, 0, 0.07, 1.0, M('#2b333d'));
                    bx(4.56, 0.05, 1.56, 0, 0.145, 1.0, M('#3a4552'));
                    for (const s of [-1, 1]) {
                        bx(0.1, 1.62, 0.1, s * 2.22, 0.81, 1.0, metal);                                     // end post
                        bx(0.26, 0.06, 0.26, s * 2.22, 0.03, 1.0, dark);                                    // its foot
                    }
                    bx(4.56, 0.1, 0.14, 0, 1.66, 1.0, metal);                                               // top rail
                    bx(4.2, 0.05, 0.05, 0, 1.58, 0.94, M('#ffd0d0', 0.7));                                  // lit strip under the rail
                    for (const x of [-1.62, -0.54, 0.54, 1.62]) { bottle(x, 0.72, 0, 0.17); bottle(x, 1.3, 0, 0.17); }
                    // a rank of spare bottles behind the rack, on a low rail
                    for (const x of [-1.62, -0.54, 0.54, 1.62]) bottle(x, 2.42, 0, 0, 1.05);
                    bx(4.1, 0.06, 0.08, 0, 0.52, 2.76, metal);                                              // rail that they lean on
                    for (const s of [-1, 1]) bx(0.08, 0.52, 0.08, s * 2.05, 0.26, 2.76, metal);
                    bx(3.6, 0.02, 0.3, 0, 0.012, 1.9, M('#c9a227'));                                         // painted hazard strip in front
                    for (let k = 0; k < 8; k++) bx(0.2, 0.02, 0.3, -1.54 + k * 0.44, 0.016, 1.9, M('#1a1a1a'), Math.PI / 4);
                    // fire-blanket box on a floor stand beside the rack, lid on top
                    bx(0.5, 0.9, 0.42, -2.35, 0.45, 1.2, M('#b5372c'));
                    bx(0.56, 0.08, 0.48, -2.35, 0.94, 1.2, M('#8e2a22'));
                    bx(0.3, 0.3, 0.03, -2.35, 0.55, 1.42, M('#e8eef4'));                                      // white cross on the lid
                    bx(0.3, 0.08, 0.04, -2.35, 0.55, 1.43, M('#b5372c'));
                    bx(0.08, 0.3, 0.04, -2.35, 0.55, 1.43, M('#b5372c'));
                    // --- the wall: fire panel, blankets, hose reel, alarm, sand, riser ---
                    const pp = wallSpot(pickAngle([0, 0.45, -0.45, 0.9, -0.9], 0.55)), pf = frameOf(pp);
                    cabinet(pp, 1.6, 1.5, 0.45, panel, M('#3a4149'), null);
                    bx(1.24, 0.62, 0.03, pf.at(0, 0.26)[0], 0.92, pf.at(0, 0.26)[1], M('#e05252', 0.5), pp.ry);   // red display, on the doors
                    bx(1.1, 0.07, 0.03, pf.at(0, 0.29)[0], 1.03, pf.at(0, 0.29)[1], M('#ffd0d0', 0.6), pp.ry);
                    bx(1.1, 0.05, 0.03, pf.at(0, 0.29)[0], 0.83, pf.at(0, 0.29)[1], M('#ffd0d0', 0.6), pp.ry);
                    cpu_(pp.x, pp.z, pp.ry);   // the fire panel is this room's Computer
                    // two blanket cabinets on the wall, doors facing the room, white cross on each door
                    for (const side of [-1, 1]) {
                        const bp = wallSpot(pickAngle([pp.a + side * 0.62, pp.a + side * 0.9, pp.a + side * 0.34], 0.42), 5.82);
                        if (!bp || bp === pp) continue;
                        const bf = frameOf(bp);
                        bx(0.92, 1.1, 0.34, bp.x, 0.66, bp.z, M('#b5372c'), bp.ry);
                        bx(0.96, 0.07, 0.38, bp.x, 1.24, bp.z, M('#8e2a22'), bp.ry);
                        bx(0.04, 0.9, 0.36, bf.at(0, 0)[0], 0.66, bf.at(0, 0)[1], M('#8e2a22'), bp.ry);        // door seam
                        bx(0.22, 0.06, 0.03, bf.at(0, 0.19)[0], 0.72, bf.at(0, 0.19)[1], M('#e8eef4'), bp.ry);  // white cross
                        bx(0.06, 0.22, 0.03, bf.at(0, 0.19)[0], 0.72, bf.at(0, 0.19)[1], M('#e8eef4'), bp.ry);
                        for (const sd of [-1, 1]) bx(0.04, 0.14, 0.03, bf.at(sd * 0.09, 0.19)[0], 0.5, bf.at(sd * 0.09, 0.19)[1], metal, bp.ry);
                    }
                    // hose reel on a wall bracket, its drum facing the room
                    const hp = wallSpot(pickAngle([pp.a - 1.25, pp.a + 1.25, pp.a - 1.5, pp.a + 1.5], 0.5), 5.85), hf = frameOf(hp);
                    bx(0.5, 0.7, 0.16, hp.x, 0.85, hp.z, M('#2b333d'), hp.ry);                                  // bracket plate
                    discZ(0.92, 0.24, hf.at(0, 0.2)[0], 1.02, hf.at(0, 0.2)[1], M('#b5372c'), hp.ry, 12);       // drum
                    discZ(0.56, 0.26, hf.at(0, 0.26)[0], 1.02, hf.at(0, 0.26)[1], metal, hp.ry, 10);            // hub
                    bx(0.5, 0.06, 0.09, hf.at(0.24, 0.34)[0], 0.72, hf.at(0.24, 0.34)[1], M('#20262c'), hp.ry);  // trailing hose
                    // alarm box with its red lamp, on the same wall
                    const ap = wallSpot(pickAngle([pp.a + 2.0, pp.a - 2.0, pp.a + 2.4], 0.45), 5.85), af = frameOf(ap);
                    bx(0.44, 0.54, 0.24, ap.x, 1.2, ap.z, M('#8a929c'), ap.ry);
                    bx(0.18, 0.18, 0.06, af.at(0, 0.14)[0], 1.31, af.at(0, 0.14)[1], M('#e05252', 0.9), ap.ry);
                    bx(0.4, 0.08, 0.06, af.at(0, 0.14)[0], 1.05, af.at(0, 0.14)[1], M('#2b333d'), ap.ry);
                    // wall rack of spare bottles and a foam tank, next to the panel
                    const sp = wallSpot(pickAngle([pp.a + 1.62, pp.a - 1.62, pp.a + 1.9], 0.42), 5.86), sf = frameOf(sp);
                    bx(1.7, 1.9, 0.12, sp.x, 0.98, sp.z, M('#2b333d'), sp.ry);                                 // backboard
                    for (const y of [0.24, 1.02]) {
                        bx(1.76, 0.09, 0.34, sp.x, y, sp.z, metal, sp.ry);                                     // shelf
                        bx(1.7, 0.05, 0.06, sf.at(0, 0.14)[0], y + 0.07, sf.at(0, 0.14)[1], M('#ffd0d0', 0.55), sp.ry);   // its lit lip
                        for (const u of [-0.5, 0, 0.5]) bottle(sf.at(u, -0.02)[0], sf.at(u, -0.02)[1], sp.ry, y + 0.05, 0.72);
                    }
                    bx(1.7, 0.1, 0.3, sp.x, 2.04, sp.z, metal, sp.ry);                                         // top cap
                    cy(0.9, 0.9, 0.72, 2.95, 0.36, 2.2, M('#b5372c'), 10);                                     // foam tank on the deck
                    cy(0.24, 0.24, 0.12, 2.95, 0.78, 2.2, metal, 8);
                    cy(0.06, 0.06, 0.5, 3.3, 0.6, 2.2, dark, 6, 0.6);                                          // its hose
                    // sand bucket, and the fire axe on its board hung over it
                    cy(0.56, 0.44, 0.52, 2.55, 0.26, 1.35, M('#c9a227'), 10);
                    cy(0.6, 0.6, 0.06, 2.55, 0.55, 1.35, M('#8e2a22'), 10);
                    bx(0.3, 0.04, 0.3, 2.55, 0.58, 1.35, M('#2b333d'));
                    cy(0.24, 0.24, 0.62, 1.95, 0.31, 3.55, M('#c9a227'), 10);                 // second bucket by the wall
                    bx(0.9, 1.0, 0.1, 2.55, 1.62, 1.6, M('#39424e'));                         // axe board
                    bx(0.07, 0.86, 0.07, 2.55, 1.6, 1.68, M('#8a5a2a'));                      // haft
                    bx(0.34, 0.2, 0.05, 2.55, 1.92, 1.68, M('#aab6c2'));                      // head
                    bx(0.12, 0.3, 0.05, 2.68, 1.92, 1.68, M('#aab6c2'));                      // its blade
                    // sprinkler riser: a floor-to-rail pipe with a hand wheel and a branch along the wall
                    const rp = wallSpot(pickAngle([pp.a + 0.95, pp.a - 0.95], 0.4), 5.9);
                    cy(0.18, 0.18, 2.6, rp.x, 1.3, rp.z, metal, 8);
                    cy(0.3, 0.3, 0.06, rp.x, 1.7, rp.z, M('#c9a227'), 10);
                    cy(0.38, 0.38, 0.05, rp.x, 2.05, rp.z, M('#b5372c'), 10);
                    cy(0.1, 0.1, 0.3, rp.x, 2.5, rp.z, metal, 6);                                              // riser up to the ceiling
                    cy(0.24, 0.16, 0.1, rp.x, 2.66, rp.z, M('#aab6c2'), 6);                                   // sprinkler head
                    bx(0.1, 0.1, 0.1, rp.x, 2.72, rp.z, M('#e05252', 0.8));                                   // its red bulb
                });
                // two drum feeders against a clear stretch of wall — placed by width, so the pair can
                // never end up standing in a doorway
                wall([-2.6, 2.6, -2.2, 2.2, Math.PI], 1.5, (p, fr) => fix(() => {
                    barrel(fr.at(-0.42, 0.02)[0], fr.at(-0.42, 0.02)[1], M('#e05252'));
                    barrel(fr.at(0.38, 0.06)[0], fr.at(0.38, 0.06)[1], M('#e05252'));
                }));
                break;
            }
            case 'generator': {
                // The reactor hall: a bare glowing core inside a hazard cage, a coolant skid with its
                // coils and standpipe, a cable trunk running off the base to the wall, and a control
                // station on a stretch of wall wide enough to hold it. All of it is fixed furniture.
                fix(() => {
                    cy(2.7, 2.9, 0.5, 0, 0.36, 0, metal, 8);                       // floor rim
                    cy(2.92, 2.92, 0.07, 0, 0.6, 0, dark, 8);                      // rim lip
                    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; bx(0.16, 0.1, 0.16, Math.cos(a) * 1.36, 0.64, Math.sin(a) * 1.36, panel, -a); }
                    cy(1.5, 1.72, 2.1, 0, 1.62, 0, M('#f1c40f', 0.85), 8);         // bare glowing core
                    cy(1.52, 1.52, 0.1, 0, 1.28, 0, M('#ffe066', 1), 8);           // bright seam
                    cy(1.52, 1.52, 0.1, 0, 1.98, 0, M('#ffe066', 1), 8);
                    // six dark ribs down the core, so the glow reads as light behind structure
                    for (let i = 0; i < 6; i++) {
                        const a = i / 6 * Math.PI * 2 + Math.PI / 6;
                        bx(0.12, 2.1, 0.18, Math.sin(a) * 1.5, 1.62, Math.cos(a) * 1.5, M('#4a3d10'), a);
                    }
                    cy(2.58, 2.4, 0.34, 0, 2.82, 0, metal, 8);                     // high rim, resting on the core
                    cy(1.9, 1.9, 0.2, 0, 3.08, 0, accent, 8);                      // cap
                    cy(0.5, 0.5, 0.26, 0, 3.28, 0, accent, 6);
                    // four containment struts from the high rim down to the floor rim, hazard-banded
                    for (let i = 0; i < 4; i++) {
                        const a = i / 4 * Math.PI * 2 + Math.PI / 4, x = Math.sin(a) * 2.05, z = Math.cos(a) * 2.05;
                        bx(0.16, 2.3, 0.16, x, 1.75, z, metal, -a);
                        bx(0.2, 0.24, 0.2, x, 0.9, z, hazard, -a);
                        bx(0.2, 0.24, 0.2, x, 2.5, z, hazard, -a);
                    }
                    // service rail around the rim with the gate left open on the front (+z). A bar laid
                    // along the wall is turned by the angle itself: local +x maps to (cos a, -sin a).
                    const RR = 3.55, POSTS = 12, SEG = 2 * RR * Math.sin(Math.PI / POSTS) + 0.08;
                    for (let i = 0; i < POSTS; i++) {
                        const a0 = i / POSTS * Math.PI * 2, a1 = (i + 1) / POSTS * Math.PI * 2, am = (a0 + a1) / 2;
                        if (Math.abs(wrap(am)) < 0.6) continue;                       // the gate
                        bx(0.1, 0.9, 0.1, Math.sin(a0) * RR, 0.45, Math.cos(a0) * RR, metal, am);
                        for (const [y, mat] of [[0.86, metal], [0.5, hazard]]) bx(SEG, 0.07, 0.06, Math.sin(am) * RR, y, Math.cos(am) * RR, mat, am);
                    }
                    for (const sd of [-1, 1]) {                                       // gate posts, tipped hazard
                        bx(0.16, 1.0, 0.16, sd * 1.9, 0.5, 3.4, metal);
                        bx(0.2, 0.2, 0.2, sd * 1.9, 0.96, 3.4, hazard);
                    }
                    floorZone(0, 0, 4.2, 4.2, 0, M('#c9a227', 0.12));
                    // coolant skid: skid plate, pump body, coil on the deck, standpipe and feed line
                    const sx = -3.4, sz = -1.7, sa = Math.atan2(sx, sz);
                    bx(1.8, 0.14, 1.5, sx, 0.2, sz, dark, sa);
                    cy(0.9, 0.9, 0.94, sx, 0.75, sz, panel, 10);                   // pump body
                    cy(0.96, 0.96, 0.08, sx, 1.22, sz, metal, 10);                 // pump cap
                    cy(0.3, 0.4, 0.2, sx, 1.34, sz, metal, 8);                     // motor housing
                    for (let k = 0; k < 4; k++) bx(0.66, 0.05, 0.05, sx, 0.42 + k * 0.2, sz, M('#5f6d7a'), sa);
                    coil(sx + 0.95, sz + 0.75, 0.8, M('#26303a'));
                    cy(0.16, 0.16, 1.7, sx + 0.95, 1.05, sz + 0.75, M('#6f7d8a'), 8);       // standpipe
                    bx(0.16, 0.16, 1.5, sx + 0.42, 1.6, sz + 0.4, hazard, sa);              // feed line to the rim
                    cy(0.34, 0.34, 0.1, sx + 0.95, 1.6, sz + 0.75, M('#e05252', 0.35), 10); // red valve wheel
                    for (const [ox, oz] of [[-0.7, -0.55], [0.7, -0.55]]) cy(0.1, 0.1, 0.2, sx + ox, 0.3, sz + oz, dark, 6);
                    // heavy cable trunk: one continuous tray from the base out to the wall, three cables
                    // lying in it and a clamp bar every metre
                    const ca = Math.PI * 0.62, ct = 3.45;
                    const tpx = Math.sin(ca) * ct, tpz = Math.cos(ca) * ct;
                    bx(0.9, 0.08, 2.4, tpx, 0.16, tpz, dark, ca);                      // tray pan
                    for (const off of [-0.28, 0, 0.28]) bx(0.16, 0.14, 2.3, tpx + Math.cos(ca) * off, 0.25, tpz - Math.sin(ca) * off, off ? M('#20262c') : M('#2f3a44'), ca);
                    for (let k = 0; k < 3; k++) { const t = 2.5 + k * 0.95; bx(1.02, 0.06, 0.1, Math.sin(ca) * t, 0.34, Math.cos(ca) * t, metal, ca); }   // clamp bars
                    coil(3.7, -2.5, 1.15, M('#20262c'));
                });
                // control station: desk, monitor bank above it, placards, and a short pipe run that stays
                // inside the width the station reserved.
                wall([-2.4, -2.8, 2.4, 2.8, Math.PI, 0], 4.2, (p, fr) => fix(() => {
                    bx(1.9, 0.92, 0.72, p.x, 0.46, p.z, panel, p.ry);                  // desk
                    bx(1.96, 0.07, 0.78, p.x, 0.95, p.z, metal, p.ry);
                    bx(1.7, 0.06, 0.4, fr.at(0, 0.22)[0], 0.99, fr.at(0, 0.22)[1], dark, p.ry);   // keyboard tray
                    for (let k = 0; k < 3; k++) cy(0.14, 0.14, 0.05, fr.at(-0.6 + k * 0.6, 0.28)[0], 1.0, fr.at(-0.6 + k * 0.6, 0.28)[1], k === 1 ? M('#e05252', 0.8) : k === 0 ? M('#4fcf7a', 0.8) : M('#f1c40f', 0.8), 8);
                    screenBank(fr.at(0, 0.02)[0], fr.at(0, 0.02)[1], p.ry, 3, 2.5, 1.2);   // monitor bank
                    pipes(fr.at(-1.6, 0.26)[0], fr.at(-1.6, 0.26)[1], p.ry, 1, 1.1);       // service pipes beside it
                    bx(0.9, 0.5, 0.05, fr.at(1.35, 0.2)[0], 2.12, fr.at(1.35, 0.2)[1], M('#f1c40f', 0.45), p.ry);   // yellow placard
                    bx(0.5, 0.5, 0.06, fr.at(1.9, 0.2)[0], 2.12, fr.at(1.9, 0.2)[1], M('#e05252', 0.4), p.ry);      // red placard
                    chair(fr.at(0.4, 1.15)[0], fr.at(0.4, 1.15)[1], p.ry + Math.PI, M('#39424e'));   // operator's chair
                }));
                // service cart: toolbox, spare coil, drip tray — parked off the walkway by the wall
                fix(() => {
                    const cx = 3.3, cz = 2.5, cr = -0.42;
                    bx(1.2, 0.1, 0.7, cx, 0.75, cz, metal, cr);
                    for (const [ox, oz] of [[-0.5, -0.28], [0.5, -0.28], [-0.5, 0.28], [0.5, 0.28]]) cy(0.08, 0.08, 0.68, LX(cx, cz, cr, ox, oz), 0.4, LZ(cx, cz, cr, ox, oz), dark, 6);
                    bx(0.55, 0.34, 0.36, LX(cx, cz, cr, -0.2, -0.1), 0.95, LZ(cx, cz, cr, -0.2, -0.1), M('#b93a2e'), cr);   // toolbox
                    bx(0.57, 0.06, 0.38, LX(cx, cz, cr, -0.2, -0.1), 1.12, LZ(cx, cz, cr, -0.2, -0.1), dark, cr);
                    bx(0.9, 0.02, 0.5, cx, 0.18, cz, M('#1a1f24'), cr);               // drip tray
                    cy(0.4, 0.4, 0.14, LX(cx, cz, cr, 0.32, 0.08), 0.88, LZ(cx, cz, cr, 0.32, 0.08), M('#26303a'), 10);   // spare coil
                });
                barrel(-2.9, 2.8, hazard); barrel(-3.5, 2.3, hazard);
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
                    // two 2.4-wide shelves of jars: one reservation for the whole piece
                    const p = wallSpot(pickAngle([Math.PI, Math.PI - 0.5, Math.PI + 0.5], 0.6, 2.6), 5.78, 2.6);
                    if (p) {
                        const fr = frameOf(p);
                        for (const y of [1.3, 1.9]) bx(2.4, 0.07, 0.34, p.x, y, p.z, M('#c8d3db'), p.ry);
                        for (const y of [1.3, 1.9]) for (let k = 0; k < 5; k++) cy(0.18, 0.2, 0.26, fr.at(-0.9 + k * 0.45, 0.05)[0], y + 0.16, fr.at(-0.9 + k * 0.45, 0.05)[1], [M('#4fcf7a', 0.45, { alpha: 0.8 }), M('#e05252', 0.4, { alpha: 0.8 }), M('#4aa3df', 0.45, { alpha: 0.8 })][k % 3], p.ry);
                    }
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
                    // the working half of the bench: a stool, a sample tray and a bio-waste bin
                    bx(0.66, 0.06, 0.44, -0.2, 1.0, 2.1, metal);                    // sample tray
                    for (let k = 0; k < 4; k++) cy(0.1, 0.1, 0.16, -0.44 + k * 0.16, 1.1, 2.1, [M('#4fcf7a', 0.5), M('#b26bd6', 0.5), M('#4aa3df', 0.5), M('#e05252', 0.45)][k], 6);
                    chair(-0.2, 2.85, Math.PI, M('#4a5a6e'));
                    cy(0.52, 0.44, 0.7, 1.15, 0.35, 3.15, M('#c9d3da'), 8);        // bio-waste bin
                    cy(0.58, 0.58, 0.06, 1.15, 0.72, 3.15, M('#e05252', 0.35), 8);
                    bx(0.3, 0.16, 0.03, 1.15, 0.5, 3.4, M('#e05252', 0.6));
                    // trolley of sample racks, standing free of the bench
                    bx(1.0, 0.07, 0.6, 2.35, 0.72, -1.5, metal, 0.25);
                    for (const [ox, oz] of [[-0.4, -0.24], [0.4, -0.24], [-0.4, 0.24], [0.4, 0.24]])
                        cy(0.08, 0.08, 0.68, LX(2.35, -1.5, 0.25, ox, oz), 0.38, LZ(2.35, -1.5, 0.25, ox, oz), dark, 6);
                    for (let k = 0; k < 3; k++) bx(0.24, 0.2, 0.3, LX(2.35, -1.5, 0.25, -0.3 + k * 0.3, 0), 0.86, LZ(2.35, -1.5, 0.25, -0.3 + k * 0.3, 0), M('#39424e'), 0.25);
                    for (let k = 0; k < 5; k++) cy(0.09, 0.09, 0.22, LX(2.35, -1.5, 0.25, -0.34 + k * 0.17, 0.02), 1.05, LZ(2.35, -1.5, 0.25, -0.34 + k * 0.17, 0.02), M('#dff0ff', 0.4, { alpha: 0.85 }), 6);
                });
                // fume hood on a free wall: a cabinet with a glass sash, its light and the duct above it
                wall([0.45, -0.45, 1.5, -1.5, Math.PI], 1.9, (p, fr) => fix(() => {
                    bx(1.6, 1.5, 0.8, p.x, 0.75, p.z, M('#c8d3db'), p.ry);                       // hood body
                    bx(1.66, 0.08, 0.86, p.x, 1.53, p.z, metal, p.ry);
                    bx(1.4, 0.9, 0.04, fr.at(0, 0.4)[0], 0.95, fr.at(0, 0.4)[1], M('#7fc7ff', 0.12, { alpha: 0.28 }), p.ry);   // sash glass
                    bx(1.5, 0.1, 0.06, fr.at(0, 0.42)[0], 1.46, fr.at(0, 0.42)[1], metal, p.ry);   // sash handle rail
                    bx(1.3, 0.05, 0.04, fr.at(0, 0.42)[0], 1.36, fr.at(0, 0.42)[1], M('#9fe4ff', 0.6), p.ry);   // hood light
                    bx(1.2, 0.06, 0.6, fr.at(0, 0.05)[0], 0.78, fr.at(0, 0.05)[1], dark, p.ry);    // working tray
                    for (let k = 0; k < 3; k++) cy(0.16, 0.18, 0.2, fr.at(-0.4 + k * 0.4, 0.05)[0], 0.9, fr.at(-0.4 + k * 0.4, 0.05)[1], [M('#4fcf7a', 0.4, { alpha: 0.8 }), M('#b26bd6', 0.4, { alpha: 0.8 }), M('#4aa3df', 0.4, { alpha: 0.8 })][k], p.ry);
                    cy(0.34, 0.34, 0.9, fr.at(0, -0.1)[0], 2.0, fr.at(0, -0.1)[1], metal, 8);     // exhaust duct
                    bx(0.6, 0.3, 0.06, fr.at(-0.5, 0.44)[0], 1.2, fr.at(-0.5, 0.44)[1], M('#c9a227', 0.3), p.ry);   // caution label
                }));
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
                // Equipment store after the board art: one long double-sided shelf island down the middle
                // of the hall, packed with bin boxes, folded vests, ammo tins and tool boards on every
                // level, its ends capped and lit red; two aisles with floor stacks, pallets and barrels;
                // a wall anchor with gloves and harnesses. Nothing is spread by PROP_SPREAD — the island
                // has to keep its shape — so the whole room is built inside fix().
                const binMat = M('#52607a'), binMat2 = M('#6b7a3c'), tray = M('#4a525c'), redLit = M('#e05252', 0.55);
                /** One bin box: body, lid, a strap across the lid, a stencil plate on the front. */
                const bin = (x, z, w, h, d, ry, mat = crateMat) => {
                    bx(w, h, d, x, h / 2 + 0.02, z, mat, ry);
                    bx(w * 1.02, 0.05, d * 1.02, x, h + 0.04, z, dark, ry);
                    bx(0.08, 0.06, d * 1.04, x, h + 0.07, z, metal, ry);
                    bx(w * 0.34, h * 0.34, 0.03, LX(x, z, ry, 0, d / 2 + 0.01), h * 0.5, LZ(x, z, ry, 0, d / 2 + 0.01), M('#c9d3da'), ry);
                };
                fix(() => {
                    // --- the island: frame, four shelf levels, cargo on every level --------------
                    const IX = -0.4, IZ = 0.35, IW = 1.5, IL = 5.0;
                    bx(IW, 0.12, IL, IX, 0.06, IZ, dark);                                         // plinth
                    // open frame, not panels: four corner uprights and a slim one every shelf bay, so the
                    // cargo on every level is seen from either aisle (the art shows open shelving)
                    for (const sd of [-1, 1]) for (const ez of [-1, 1]) {
                        const ez2 = ez * (IL / 2 - 0.06);
                        bx(0.12, 2.32, 0.12, IX + sd * IW / 2, 1.16, IZ + ez2, metal);
                        bx(0.42, 0.1, 0.42, IX + sd * IW / 2, 0.05, IZ + ez2, dark);
                    }
                    for (const sd of [-1, 1]) for (const bz of [-1.25, 0, 1.25]) {
                        bx(0.09, 2.26, 0.09, IX + sd * IW / 2, 1.13, IZ + bz, metal);
                    }
                    bx(IW + 0.12, 0.12, IL + 0.1, IX, 2.36, IZ, metal);                           // top cap
                    bx(IW + 0.2, 0.06, IL + 0.16, IX, 2.29, IZ, redLit);                          // red strip under the cap
                    for (const y of [0.42, 1.02, 1.62, 2.18]) {
                        bx(IW + 0.08, 0.07, IL + 0.06, IX, y, IZ, metal);                         // shelf
                        bx(IW + 0.02, 0.05, IL + 0.02, IX, y + 0.06, IZ, M('#333d48'));           // its deck line
                        // cargo on the shelf, loaded from both aisles: bins, vests, tins
                        for (let k = 0; k < 4; k++) {
                            const z = IZ - 2.05 + k * 1.32;
                            for (const sd of [-1, 1]) {
                                const x = IX + sd * 0.34;
                                if ((k + (sd > 0 ? 1 : 0)) % 3 === 0) {
                                    bx(0.52, 0.3, 0.66, x, y + 0.2, z, M('#6b7a3c'), Math.PI / 2);            // folded vest stack
                                    bx(0.42, 0.05, 0.56, x, y + 0.37, z, dark, Math.PI / 2);
                                } else if ((k + (sd > 0 ? 2 : 0)) % 3 === 1) {
                                    bin(x, z, 0.56, 0.34, 0.62, Math.PI / 2, (k + sd) % 2 ? crateMat : crateMat2);
                                } else {
                                    bx(0.46, 0.22, 0.5, x, y + 0.15, z, tray, Math.PI / 2);                // ammo tin
                                    bx(0.5, 0.04, 0.54, x, y + 0.28, z, metal, Math.PI / 2);
                                    bx(0.2, 0.05, 0.1, x, y + 0.32, z, M('#c9a227'), Math.PI / 2);
                                }
                            }
                        }
                    }
                    // end caps: a tool board on one end, a lit inventory panel on the other
                    bx(1.3, 1.2, 0.08, IX, 1.5, IZ - IL / 2 - 0.06, M('#39424e'));
                    for (let k = 0; k < 5; k++) bx(0.06, 0.42, 0.05, IX - 0.5 + k * 0.25, 1.62, IZ - IL / 2 - 0.12, metal);
                    for (let k = 0; k < 3; k++) bx(0.16, 0.08, 0.05, IX - 0.5 + k * 0.5, 1.32, IZ - IL / 2 - 0.12, M('#b06a3c'));
                    bx(1.1, 0.62, 0.06, IX, 1.45, IZ + IL / 2 + 0.05, dark);
                    bx(0.98, 0.5, 0.03, IX, 1.45, IZ + IL / 2 + 0.09, redLit);
                    for (let k = 0; k < 3; k++) bx(0.8, 0.04, 0.02, IX, 1.58 - k * 0.14, IZ + IL / 2 + 0.12, M('#ffd0d0', 0.6));
                    // read light over each aisle, hung off the top cap
                    for (const sd of [-1, 1]) {
                        bx(0.1, 0.1, IL * 0.8, IX + sd * (IW / 2 + 0.36), 2.62, IZ, metal);
                        for (let k = 0; k < 4; k++) bx(0.16, 0.05, 0.34, IX + sd * (IW / 2 + 0.36), 2.55, IZ - 1.6 + k * 1.06, M('#ffd7d2', 0.7));
                        for (const ez of [-1, 1]) bx(0.08, 0.42, 0.08, IX + sd * (IW / 2 + 0.36), 2.44, IZ + ez * IL * 0.38, metal);
                    }
                    // --- the aisles: pallets, loose crates, barrels, a trolley -------------------
                    const pallet = (x, z, ry) => {
                        bx(1.1, 0.12, 0.9, x, 0.1, z, M('#8a703c'), ry);
                        for (const sd of [-1, 1]) bx(1.14, 0.08, 0.12, x, 0.04, z + sd * 0.36, M('#6b5630'), ry);
                        for (let k = 0; k < 3; k++) bx(0.12, 0.08, 0.9, LX(x, z, ry, -0.4 + k * 0.4, 0), 0.06, LZ(x, z, ry, -0.4 + k * 0.4, 0), M('#6b5630'), ry);
                    };
                    pallet(-3.35, 2.15, 0.15); crateLid(-3.35, 2.15, 0.9, 0.15, crateMat, false, 0.16);
                    pallet(-3.3, 0.95, -0.1); bin(-3.3, 0.95, 0.82, 0.66, 0.72, -0.1, crateMat2);
                    pallet(-2.9, -2.65, 0.3); crateLid(-2.9, -2.65, 0.85, 0.3, crateMat2, true, 0.16);
                    crateLid(-2.9, -2.65, 0.6, 0.3, crateMat, false, 1.01);
                    crateLid(1.9, 3.15, 0.8, 0.2, crateMat);
                    crateLid(-2.3, -3.3, 0.75, 0.4, crateMat2, true);
                    ammoBox(2.25, 2.3, 0.25, true); ammoBox(2.8, 1.85, -0.2, false);
                    vest(-2.65, 1.55, 0.5); vest(0.65, -1.95, -0.4);
                    barrel(3.4, 3.0, hazard); barrel(3.1, 3.5, M('#52607a'));
                    // service trolley in the aisle, its shelf loaded with tins
                    bx(0.8, 0.07, 0.5, -2.6, 0.72, -1.9, metal); bx(0.8, 0.07, 0.5, -2.6, 0.3, -1.9, metal);
                    for (const [sx, sz] of [[-0.34, -0.2], [0.34, -0.2], [-0.34, 0.2], [0.34, 0.2]]) cy(0.1, 0.1, 0.3, -2.6 + sx, 0.15, -1.9 + sz, dark, 6, Math.PI / 2);
                    for (let k = 0; k < 3; k++) bx(0.2, 0.16, 0.3, -2.78 + k * 0.22, 0.84, -1.9, k % 2 ? crateMat : olive);
                    // --- the wall anchor: gloves, harnesses, a locker and a fire point -------------
                    const p = wallSpot(pickAngle([2.9, -2.9, 2.5, -2.5], 0.6)), fr = frameOf(p);
                    bx(1.9, 1.9, 0.14, p.x, 1.0, p.z, M('#2b333d'), p.ry);                                  // backboard
                    for (const y of [0.55, 1.15, 1.72]) bx(1.96, 0.07, 0.4, p.x, y, p.z, metal, p.ry);      // shelves with pegs
                    for (const y of [0.55, 1.15, 1.72]) for (let k = 0; k < 4; k++) {
                        bx(0.14, 0.42, 0.06, fr.at(-0.72 + k * 0.48, 0.2)[0], y + 0.28, fr.at(-0.72 + k * 0.48, 0.2)[1], (k + y) % 2 ? M('#52607a') : M('#6b7a3c'), p.ry);   // hanging harness / glove
                    }
                    bx(1.96, 0.1, 0.44, p.x, 2.0, p.z, metal, p.ry);
                    bx(1.2, 0.32, 0.03, fr.at(0, 0.24)[0], 2.16, fr.at(0, 0.24)[1], redLit, p.ry);             // EQUIPMENT sign, lit red
                    // the locker gets its own spot beside the board instead of being hung 1.5 m off its
                    // edge — an offset that long used to walk straight into the next doorway
                    const lk = wallSpot(fitAngle(p.a + 0.42, 1.1), 5.72, 1.1);
                    if (lk) locker(lk.x, lk.z, lk.ry);
                    // safety point by the aisle: extinguisher on a stand and a first-aid box
                    for (const sd of [-1, 1]) bx(0.1, 1.9, 0.1, 1.55, 0.95, -3.55 + sd * 0.3, metal);
                    cy(0.34, 0.34, 0.8, 1.55, 0.58, -3.55, M('#b5372c'), 10);
                    cy(0.2, 0.24, 0.14, 1.55, 1.02, -3.55, metal, 8);
                    bx(0.5, 0.4, 0.22, 2.25, 1.4, -3.6, M('#dfe6ee'));
                    bx(0.2, 0.06, 0.03, 2.25, 1.42, -3.48, M('#c0392b'));
                    bx(0.06, 0.2, 0.03, 2.25, 1.42, -3.48, M('#c0392b'));
                });
                break;
            }
            case 'airlock': {
                // Airlock control, rebuilt after the board art: the pressure door wall with its wheel lock
                // and "SAFETY FIRST" band, a chevron-painted hazard bay on the deck in front of it, two
                // lit control podiums facing the door, a floor vent grille, grated gutters along the
                // walls, pressure suits in the corner lockers and a pipe manifold with hand wheels.
                const hzY = M('#c9a227'), hzB = M('#1a1a1a'), paint = 0.176;
                fix(() => {
                    // --- the hazard bay: two chevrons of striped arms on the deck, tips at the door --------
                    // Each arm is a ladder of short bars laid ACROSS the arm, so the chevron reads as the
                    // yellow-and-black V of the board art instead of a scatter of diamonds.
                    for (const z0 of [-0.35, 0.75]) {
                        for (const sd of [-1, 1]) {
                            for (let k = 0; k < 4; k++) {
                                const u = 0.16 + k * 0.42;
                                bx(0.19, 0.02, 0.5, sd * u, paint, z0 + u, (k % 2) ? hzY : hzB, sd * Math.PI / 4);
                            }
                        }
                        bx(0.6, 0.02, 0.22, 0, paint, z0 - 0.14, hzY);                                     // the tip plate of the V
                        for (const sd of [-1, 1]) bx(0.3, 0.02, 0.22, sd * 0.34, paint, z0 + 0.16, hzB, sd * Math.PI / 4);
                    }
                    bx(5.4, 0.02, 0.14, 0, paint, 2.28, M('#8a7a44'));                                  // painted edge of the bay
                    for (const sd of [-1, 1]) bx(0.14, 0.02, 2.9, sd * 2.72, paint, 0.75, M('#8a7a44'));
                    // --- the floor vent grille, right under the door --------------------------------
                    bx(3.0, 0.03, 1.0, 0, 0.172, -2.55, M('#2b333d'));
                    for (let k = 0; k < 15; k++) bx(2.9, 0.03, 0.05, 0, 0.19, -2.99 + k * 0.063, M('#59697b'));
                    bx(3.0, 0.03, 0.08, 0, 0.19, -3.05, metal); bx(3.0, 0.03, 0.08, 0, 0.19, -2.05, metal);
                    // --- the pressure door on the free wall -----------------------------------------
                    // The whole frame is 3.9 wide, so it reserves that much wall; if no stretch is free
                    // the bay is left without a door rather than with a door across a corridor mouth.
                    const da = pickAngle([Math.PI, Math.PI - 0.35, Math.PI + 0.35, 0, 0.35], 0.75, 4.2);
                    const dp = da == null ? null : wallSpot(da, 5.72, 4.2);
                    if (!dp) return;
                    const df = frameOf(dp);
                    bx(3.9, 3.1, 0.22, dp.x, 1.55, dp.z, M('#39424e'), dp.ry);                             // surround
                    bx(3.5, 2.8, 0.16, df.at(0, 0.2)[0], 1.4, df.at(0, 0.2)[1], M('#59697b'), dp.ry);       // frame plate
                    for (const sd of [-1, 1]) {
                        bx(1.62, 2.6, 0.14, df.at(sd * 0.86, 0.3)[0], 1.3, df.at(sd * 0.86, 0.3)[1], M('#6d7b8c'), dp.ry);   // leaf
                        bx(0.1, 2.5, 0.05, df.at(sd * 1.6, 0.38)[0], 1.3, df.at(sd * 1.6, 0.38)[1], M('#39424e'), dp.ry);
                        for (let k = 0; k < 3; k++) bx(1.4, 0.07, 0.05, df.at(sd * 0.86, 0.38)[0], 0.55 + k * 0.95, df.at(sd * 0.86, 0.38)[1], M('#4a5563'), dp.ry);   // stiffeners
                    }
                    bx(0.1, 2.6, 0.08, df.at(0, 0.38)[0], 1.3, df.at(0, 0.38)[1], M('#2b333d'), dp.ry);      // centre seam
                    // the wheel lock: hub, four spokes, rim
                    discZ(0.9, 0.14, df.at(0, 0.46)[0], 1.42, df.at(0, 0.46)[1], M('#39424e'), dp.ry, 8);
                    discZ(0.34, 0.2, df.at(0, 0.54)[0], 1.42, df.at(0, 0.54)[1], metal, dp.ry, 8);
                    for (let k = 0; k < 4; k++) {
                        const a = dp.ry + k * Math.PI / 2;
                        bx(0.66, 0.1, 0.1, df.at(0, 0.52)[0] + Math.cos(a) * 0.3, 1.42 + Math.sin(a) * 0.3, df.at(0, 0.52)[1] - Math.sin(a) * 0.3, metal, dp.ry, a);
                    }
                    // the "SAFETY FIRST" band over the door, stencilled on the beam, and its red status lamp
                    bx(2.6, 0.34, 0.06, df.at(0, 0.3)[0], 2.68, df.at(0, 0.3)[1], M('#1e252c'), dp.ry);
                    bx(2.3, 0.16, 0.03, df.at(0, 0.34)[0], 2.68, df.at(0, 0.34)[1], M('#e05252', 0.45), dp.ry);
                    for (const sd of [-1, 1]) bx(0.16, 0.16, 0.1, df.at(sd * 1.5, 0.34)[0], 2.68, df.at(sd * 1.5, 0.34)[1], M('#e05252', 0.9), dp.ry);
                    for (let k = 0; k < 3; k++) bx(2.2, 0.05, 0.18, df.at(0, 0.44 + k * 0.18)[0], 0.19, df.at(0, 0.44 + k * 0.18)[1], metal, dp.ry);   // threshold ribs
                    // hazard chevrons on the deck right in front of the door
                    for (let k = 0; k < 8; k++) bx(0.28, 0.02, 0.7, df.at(-1.15 + k * 0.33, 0.62)[0], paint, df.at(-1.15 + k * 0.33, 0.62)[1], k % 2 ? hzY : hzB, dp.ry, Math.PI / 4);
                    // --- the two control podiums at the far edge of the bay, screens facing the door ---
                    // They stand clear of the standing zone (ZONE_C), where the figures of the room are
                    // placed: a fixed prop is not pushed out of it the way the spread props are.
                    for (const sd of [-1, 1]) {
                        const px = sd * 1.95, pz = 2.05, ry2 = Math.PI - sd * 0.18;
                        bx(1.1, 0.16, 0.8, px, 0.08, pz, dark, ry2);                                       // foot
                        bx(0.9, 0.9, 0.6, px, 0.5, pz, M('#1e252c'), ry2);                                 // pedestal
                        bx(1.16, 0.1, 0.86, px, 0.98, pz, M('#39424e'), ry2);                              // desk top
                        bx(1.0, 0.05, 0.7, px, 1.03, pz, M('#4aa3df', 0.35), ry2);                         // lit inlay
                        for (let k = 0; k < 4; k++) bx(0.14, 0.04, 0.12, LX(px, pz, ry2, -0.33 + k * 0.22, 0.2), 1.06, LZ(px, pz, ry2, -0.33 + k * 0.22, 0.2), k === 1 ? M('#ff6b6b', 0.8) : M('#9fe4ff', 0.7), ry2);   // buttons
                        bx(0.86, 0.62, 0.06, LX(px, pz, ry2, 0, -0.16), 1.38, LZ(px, pz, ry2, 0, -0.16), M('#1e252c'), ry2, -0.32);        // screen bezel
                        bx(0.76, 0.52, 0.03, LX(px, pz, ry2, 0, -0.13), 1.38, LZ(px, pz, ry2, 0, -0.13), M('#4aa3df', 0.75), ry2, -0.32);   // display
                        for (let k = 0; k < 3; k++) bx(0.56, 0.04, 0.02, LX(px, pz, ry2, 0, -0.1), 1.52 - k * 0.12, LZ(px, pz, ry2, 0, -0.1), M('#dff0ff', 0.85), ry2, -0.32);   // readout lines
                        bx(0.16, 0.4, 0.16, LX(px, pz, ry2, 0.36, -0.3), 1.7, LZ(px, pz, ry2, 0.36, -0.3), M('#e05252'), ry2);   // status beacon
                    }
                    // --- the walls: pressure suits, a pipe manifold, grated gutters ------------------
                    const sp = wallSpot(pickAngle([dp.a + 1.15, dp.a - 1.15, dp.a + 1.5], 0.5, 2.2), 5.85, 2.2);
                    const sf = sp ? frameOf(sp) : null;
                    if (sp) bx(2.0, 2.3, 0.16, sp.x, 1.15, sp.z, M('#232b33'), sp.ry);                         // locker back
                    for (const sd of (sp ? [-1, 1] : [])) {
                        // a hanging pressure suit: shoulders, torso, helmet, boots
                        bx(0.5, 0.72, 0.3, sf.at(sd * 0.5, 0.2)[0], 1.28, sf.at(sd * 0.5, 0.2)[1], M('#8a929c'), sp.ry);
                        bx(0.62, 0.14, 0.32, sf.at(sd * 0.5, 0.2)[0], 1.68, sf.at(sd * 0.5, 0.2)[1], M('#a5adb6'), sp.ry);
                        cy(0.4, 0.4, 0.36, sf.at(sd * 0.5, 0.2)[0], 1.9, sf.at(sd * 0.5, 0.2)[1], M('#9fd7ff', 0.25), 8);
                        bx(0.24, 0.5, 0.24, sf.at(sd * 0.5, 0.2)[0], 0.62, sf.at(sd * 0.5, 0.2)[1], M('#59697b'), sp.ry);
                        bx(0.3, 0.16, 0.3, sf.at(sd * 0.5, 0.24)[0], 0.3, sf.at(sd * 0.5, 0.24)[1], dark, sp.ry);
                    }
                    if (sp) {
                        bx(2.0, 0.1, 0.24, sp.x, 2.36, sp.z, metal, sp.ry);
                        bx(0.9, 0.05, 0.04, sf.at(0, 0.16)[0], 2.2, sf.at(0, 0.16)[1], M('#4fcf7a', 0.6), sp.ry);
                    }
                    // pipe manifold on the wall opposite, with hand wheels
                    // the manifold is a 3.2 m run of pipe plus its wheels: it reserves 3.6 m
                    const mBase = sp ? sp.a : dp.a + 1.1;
                    const mp = wallSpot(pickAngle([mBase + Math.PI, mBase + Math.PI - 0.4], 0.4, 3.6), 5.9, 3.6);
                    if (mp) {
                        const mf = frameOf(mp);
                        for (const y of [0.75, 1.15]) bx(3.2, 0.2, 0.2, mp.x, y, mp.z, metal, mp.ry);
                        for (let k = 0; k < 4; k++) {
                            cy(0.5, 0.5, 0.07, mf.at(-1.1 + k * 0.72, 0.16)[0], 1.15, mf.at(-1.1 + k * 0.72, 0.16)[1], hazard, 10);
                            cy(0.16, 0.16, 0.3, mf.at(-1.1 + k * 0.72, 0.16)[0], 0.98, mf.at(-1.1 + k * 0.72, 0.16)[1], dark, 6);
                        }
                        for (const sd of [-1, 1]) bx(0.24, 1.4, 0.24, mf.at(sd * 1.5, 0.06)[0], 0.7, mf.at(sd * 1.5, 0.06)[1], dark, mp.ry);
                    }
                    // grated gutters along the two side walls, with their drain boxes
                    for (const a of [dp.a + Math.PI / 2, dp.a - Math.PI / 2]) {
                        const gp2 = wallSpot(a, 5.55, 3.2);     // a 3.0 m grate needs a 3.2 m gap
                        if (!gp2) continue;
                        const gf = frameOf(gp2);
                        bx(1.0, 0.02, 3.0, gp2.x, 0.172, gp2.z, M('#2b333d'), gp2.ry);                        // channel
                        for (let k = 0; k < 24; k++) {                                                         // cross bars of the grate
                            bx(0.92, 0.02, 0.05, gf.at(-1.4 + k * 0.12, 0)[0], 0.186, gf.at(-1.4 + k * 0.12, 0)[1], M('#59697b'), gp2.ry);
                        }
                        bx(0.6, 0.02, 0.3, gf.at(0.95, 0.05)[0], 0.19, gf.at(0.95, 0.05)[1], M('#3a4048'), gp2.ry);   // drain box
                    }
                    // corner hazard posts and red warning lamps over the bay
                    for (const sd of [-1, 1]) {
                        cy(0.16, 0.16, 1.9, sd * 2.85, 0.95, 1.2, M('#39424e'), 8);
                        for (let k = 0; k < 4; k++) cy(0.2, 0.2, 0.16, sd * 2.85, 0.4 + k * 0.4, 1.2, k % 2 ? hzY : hzB, 8);
                        bx(0.26, 0.2, 0.26, sd * 2.85, 2.0, 1.2, M('#e05252', 0.9));
                    }
                });
                break;
            }
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
                // The mess: two tables with chairs in the middle, a serving counter with a lit display
                // case on one wall, the snack machine and the water fountain on another, a noticeboard
                // between the doors and the usual clutter of a room people actually eat in.
                fix(() => {
                    for (const [x, z, ry] of [[0.9, 2.7, 0.12], [-2.6, 0.7, -0.18]]) {
                        bx(2.2, 0.1, 0.95, x, 0.75, z, M('#8b6b4a'), ry);
                        for (const sx of [-0.8, 0.8]) bx(0.16, 0.72, 0.16, LX(x, z, ry, sx, 0), 0.36, LZ(x, z, ry, sx, 0), dark, ry);
                        for (const s of [-1, 1]) for (let i = 0; i < 2; i++) {
                            const ox = -0.55 + i * 1.1;
                            chair(LX(x, z, ry, ox, s * 0.86), LZ(x, z, ry, ox, s * 0.86), ry + (s > 0 ? Math.PI : 0), M('#b07a3c'));
                        }
                        for (const ox of [-0.55, 0.45]) bx(0.3, 0.05, 0.3, LX(x, z, ry, ox, -0.15), 0.82, LZ(x, z, ry, ox, -0.15), white, ry);   // trays
                        cy(0.14, 0.14, 0.22, LX(x, z, ry, 0.72, 0.22), 0.9, LZ(x, z, ry, 0.72, 0.22), M('#4fcf7a', 0.5), 8);   // cup
                        bx(0.34, 0.14, 0.2, LX(x, z, ry, 0.1, 0.18), 0.87, LZ(x, z, ry, 0.1, 0.18), M('#c9d3da'), ry);   // condiment caddy
                        for (let k = 0; k < 3; k++) cy(0.05, 0.05, 0.16, LX(x, z, ry, 0.02 + k * 0.08, 0.18), 1.0, LZ(x, z, ry, 0.02 + k * 0.08, 0.18), [M('#e05252'), M('#f1c40f'), M('#dfe6ee')][k], 6);
                    }
                    // stack of trays and a bin by the wall
                    for (let k = 0; k < 5; k++) bx(0.5, 0.04, 0.4, -1.9, 0.2 + k * 0.05, -2.9, M('#6b7a88'), 0.3);
                    cy(0.5, 0.44, 0.8, 2.5, 0.4, -2.9, M('#39424e'), 8);
                    cy(0.54, 0.54, 0.06, 2.5, 0.82, 2.5 - 0.15, metal, 8);
                });
                // snack machine and drinking fountain on one wall, reserved together
                wall(freeAngle(-1.6, 0.7), 2.8, (p, fr) => fix(() => {
                    bx(1.1, 1.9, 0.62, p.x, 0.95, p.z, M('#b93a2e'), p.ry);
                    bx(0.94, 1.3, 0.03, fr.at(-0.12, 0.315)[0], 1.14, fr.at(-0.12, 0.315)[1], M('#141a20'), p.ry);   // dark window
                    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++)
                        bx(0.17, 0.16, 0.07, fr.at(-0.4 + c * 0.28, 0.36)[0], 0.7 + r * 0.28, fr.at(-0.4 + c * 0.28, 0.36)[1], [M('#f1c40f', 0.35), M('#4fcf7a', 0.35), M('#e05252', 0.35)][(r + c) % 3], p.ry);
                    bx(0.95, 1.32, 0.015, fr.at(-0.12, 0.4)[0], 1.14, fr.at(-0.12, 0.4)[1], M('#9fd7ff', 0.12, { alpha: 0.2 }), p.ry);   // glass
                    bx(0.24, 0.5, 0.08, fr.at(0.22, 0.33)[0], 0.42, fr.at(0.22, 0.33)[1], dark, p.ry);      // dispenser slot
                    bx(0.92, 0.07, 0.08, fr.at(-0.12, 0.34)[0], 1.79, fr.at(-0.12, 0.34)[1], M('#ffd27f', 0.9), p.ry);   // lit sign
                    // drinking fountain on the same wall
                    bx(0.52, 0.86, 0.42, fr.at(0.8, 0)[0], 0.43, fr.at(0.8, 0)[1], metal, p.ry);
                    bx(0.44, 0.18, 0.34, fr.at(0.8, 0.07)[0], 0.9, fr.at(0.8, 0.07)[1], M('#c9d3da'), p.ry);   // basin
                    cy(0.12, 0.14, 0.05, fr.at(0.8, 0.1)[0], 0.98, fr.at(0.8, 0.1)[1], dark, 8);              // drain
                    bx(0.16, 0.2, 0.1, fr.at(0.8, -0.1)[0], 1.2, fr.at(0.8, -0.1)[1], dark, p.ry);            // nozzle head
                    cy(0.045, 0.045, 0.28, fr.at(0.8, 0.04)[0], 1.05, fr.at(0.8, 0.04)[1], M('#7fc7ff', 0.7, { alpha: 0.65 }), 6);   // water jet
                    bx(0.5, 0.05, 0.16, fr.at(0.8, 0.12)[0], 1.36, fr.at(0.8, 0.12)[1], M('#4fcf7a', 0.9), p.ry);   // "drink" sign
                }));
                // serving counter with a lit display case, tray rail and a menu board above it
                wall(freeAngle(2.7, 0.7), 3.4, (p, fr) => fix(() => {
                    bx(3.1, 0.95, 0.7, p.x, 0.48, p.z, panel, p.ry);
                    bx(3.15, 0.07, 0.76, p.x, 0.99, p.z, metal, p.ry);
                    bx(2.9, 0.55, 0.5, fr.at(0, -0.05)[0], 1.32, fr.at(0, -0.05)[1], M('#7fc7ff', 0.2, { alpha: 0.35 }), p.ry);   // display glass
                    bx(2.9, 0.05, 0.5, fr.at(0, -0.05)[0], 1.6, fr.at(0, -0.05)[1], metal, p.ry);
                    for (let k = 0; k < 4; k++) cy(0.24, 0.24, 0.06, fr.at(-1.05 + k * 0.7, 0.06)[0], 1.03, fr.at(-1.05 + k * 0.7, 0.06)[1], M('#dfe6ee'), 10);
                    for (let k = 0; k < 3; k++) bx(0.2, 0.18, 0.2, fr.at(-0.9 + k * 0.9, -0.02)[0], 1.16, fr.at(-0.9 + k * 0.9, -0.02)[1], [M('#f1c40f', 0.3), M('#4fcf7a', 0.3), M('#e05252', 0.3)][k], p.ry);
                    bx(2.9, 0.05, 0.06, fr.at(0, 0.44)[0], 1.08, fr.at(0, 0.44)[1], metal, p.ry);          // tray rail
                    for (const sd of [-1, 1]) bx(0.06, 0.1, 0.3, fr.at(sd * 1.42, 0.36)[0], 1.0, fr.at(sd * 1.42, 0.36)[1], metal, p.ry);
                    bx(2.4, 0.5, 0.06, fr.at(0, -0.28)[0], 2.28, fr.at(0, -0.28)[1], M('#232b33'), p.ry);   // menu board
                    for (let k = 0; k < 3; k++) bx(2.1, 0.05, 0.02, fr.at(0, -0.24)[0], 2.4 - k * 0.13, fr.at(0, -0.24)[1], M('#ffd27f', 0.5), p.ry);
                    bx(0.7, 0.2, 0.04, fr.at(0.8, -0.25)[0], 2.12, fr.at(0.8, -0.25)[1], M('#4fcf7a', 0.45), p.ry);   // "open" plate
                }));
                // noticeboard next to a door, where people actually stop to read it
                wall([0.15, -0.3, 1.1, 2.0], 1.9, (p, fr) => fix(() => {
                    bx(1.7, 1.1, 0.1, p.x, 1.55, p.z, M('#5a4632'), p.ry);
                    bx(1.56, 0.96, 0.03, fr.at(0, 0.08)[0], 1.55, fr.at(0, 0.08)[1], M('#8b6b4a'), p.ry);
                    for (let k = 0; k < 5; k++) {
                        const u = -0.6 + (k % 3) * 0.55, y = 1.78 - Math.floor(k / 3) * 0.4;
                        bx(0.34, 0.28, 0.02, fr.at(u, 0.11)[0], y, fr.at(u, 0.11)[1], k % 2 ? M('#dfe6ee') : M('#ffd27f', 0.3), p.ry + (k % 2 ? 0.06 : -0.05));
                    }
                }));
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
                // monitoring station: the whole footprint (desk + screen arm + the pipe run beside it)
                // is reserved as one stretch of wall, so no part of it can reach a doorway
                wall([-2.5, -2.9, 2.5, 2.9], 3.4, (p, fr) => fix(() => {
                    bx(1.3, 0.9, 0.55, fr.at(0, 0.2)[0], 0.45, fr.at(0, 0.2)[1], panel, p.ry);         // monitoring desk
                    bx(1.36, 0.06, 0.62, fr.at(0, 0.2)[0], 0.93, fr.at(0, 0.2)[1], metal, p.ry);
                    bx(0.28, 0.12, 0.18, fr.at(0, 0.12)[0], 1.02, fr.at(0, 0.12)[1], dark, p.ry);
                    bx(1.1, 0.66, 0.07, fr.at(0, 0.14)[0], 1.36, fr.at(0, 0.14)[1], metal, p.ry, -0.3);
                    bx(1.0, 0.56, 0.03, fr.at(0, 0.18)[0], 1.36, fr.at(0, 0.18)[1], screen, p.ry, -0.3);
                    pipes(fr.at(1.15, 0.26)[0], fr.at(1.15, 0.26)[1], p.ry, 2, 1.2);                    // short pipe run, inside the reservation
                }));
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
                // grilled walk lane down the middle with a lit seam, drains under every booth — and, over
                // that lane, three decontamination arches with spray heads, a ceiling duct feeding them
                // and a puddle on the grating where each one washes the deck. The arches span the lane
                // across the room, so a figure walking the bay passes under every one of them.
                const chrome = M('#aab6c2'), pipeM = M('#8c96a0'), sprayM = M('#9fd7ff', 0.85), seamM = M('#dff0ff', 0.45);
                fix(() => {
                    bx(1.8, 0.03, 7.4, 0, 0.172, 0, M('#5a6068'));                                        // central walk lane
                    for (let i = -3; i <= 3; i++) bx(1.8, 0.02, 0.14, 0, 0.182, i * 1.05, M('#3f454c'));   // lane seams
                    for (const sx of [-0.86, 0.86]) bx(0.14, 0.02, 7.0, sx, 0.178, 0, seamM);             // lit strips at the lane edges
                    for (let i = -3; i <= 3; i++) bx(1.6, 0.016, 0.08, 0, 0.19, i * 1.05, M('#4a525c'));   // grating slats
                    // --- the three decontamination arches over the lane -----------------------------
                    // A riser on each side of the lane, a cross beam over it at head height, a spray bar
                    // slung under the beam with its nozzles, and a lit band that marks the wash zone.
                    const ARCH = [-2.55, 0, 2.55];
                    for (const z of ARCH) {
                        for (const sd of [-1, 1]) {
                            bx(0.2, 2.5, 0.2, sd * 1.02, 1.25, z, M('#464b52'));                          // riser
                            bx(0.3, 0.08, 0.3, sd * 1.02, 0.04, z, dark);                                 // foot plate
                            for (let k = 0; k < 5; k++) bx(0.24, 0.06, 0.24, sd * 1.02, 0.3 + k * 0.46, z, chrome);   // collar rings
                            cy(0.3, 0.3, 0.1, sd * 1.02, 1.62, z, M('#b5372c'), 10);                      // red shut-off wheel
                            bx(0.24, 0.16, 0.1, sd * 1.02, 1.95, z, M('#39424e'));                        // valve body
                        }
                        bx(2.44, 0.26, 0.2, 0, 2.5, z, M('#464b52'));                                      // cross beam
                        bx(2.6, 0.08, 0.26, 0, 2.66, z, chrome);                                           // beam cap
                        bx(1.9, 0.06, 0.06, 0, 2.36, z, sprayM);                                           // lit band under the beam
                        bx(1.9, 0.12, 0.14, 0, 2.2, z, pipeM);                                             // spray bar
                        for (let k = -2; k <= 2; k++) {
                            cy(0.1, 0.16, 0.14, k * 0.44, 2.09, z, pipeM, 6);                               // nozzle body
                            cy(0.16, 0.06, 0.06, k * 0.44, 2.0, z, sprayM, 6);                              // nozzle tip, lit
                        }
                        // mist: a flat, very transparent disc hanging under the bar and a puddle on the lane
                        const mist = B().MeshBuilder.CreateCylinder('mist', { diameter: 2.0, height: 0.3, tessellation: 12 }, S);
                        mist.position.set(0, 1.7, z); mist.material = M('#bfe6ff', 0.3, { alpha: 0.14 }); mist.isPickable = false; statics.push(mist);
                        const pud = B().MeshBuilder.CreateCylinder('pud', { diameter: 2.1, height: 0.01, tessellation: 12 }, S);
                        pud.position.set(0, 0.2, z - 0.55); pud.scaling.z = 0.55; pud.material = M('#9fd7ff', 0.25, { alpha: 0.5 }); statics.push(pud);
                    }
                    // ceiling duct down the lane, feeding every arch, hung on short brackets
                    bx(0.34, 0.16, 6.4, 0, 2.9, 0, pipeM);
                    for (const z of ARCH) bx(0.26, 0.34, 0.26, 0, 2.74, z, M('#39424e'));
                    for (const z of [-3.1, -1.3, 1.3, 3.1]) bx(0.1, 0.5, 0.1, 0, 2.68, z, chrome);
                    // --- the booths along both walls ------------------------------------------------
                    for (const side of [-1, 1]) {
                        const base = pickAngle([side * Math.PI / 2, side * (Math.PI / 2 - 0.45), side * (Math.PI / 2 + 0.45)], 0.45);
                        for (let k = 0; k < 4; k++) {
                            const a = base + (k - 1.5) * 0.24;
                            if (nearExit(a, 0.36)) continue;
                            booth(wallSpot(a, 5.78));
                        }
                    }
                    // control post BESIDE the lane, not on it: the walk under the arches has to stay free
                    const cp = -3.35, cz = -3.35, cr = Math.PI / 4;
                    bx(1.2, 0.9, 0.5, cp, 0.45, cz, panel, cr);
                    bx(1.26, 0.06, 0.56, cp, 0.93, cz, metal, cr);
                    bx(0.26, 0.12, 0.16, LX(cp, cz, cr, 0, -0.12), 1.02, LZ(cp, cz, cr, 0, -0.12), dark, cr);
                    bx(0.94, 0.58, 0.06, LX(cp, cz, cr, 0, -0.1), 1.34, LZ(cp, cz, cr, 0, -0.1), metal, cr, -0.3);
                    bx(0.84, 0.48, 0.03, LX(cp, cz, cr, 0, -0.06), 1.34, LZ(cp, cz, cr, 0, -0.06), M('#4fcf7a', 0.55), cr, -0.3);
                    bx(1.1, 0.05, 0.36, LX(cp, cz, cr, 0, 0.12), 0.98, LZ(cp, cz, cr, 0, 0.12), dark, cr);
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
                // The machinery hall: three generator sets standing on the rays that no corridor uses,
                // each with its gauge panel facing the middle; a ring main of pipe above them that is
                // cut wherever the wall is cut, a floor main on saddle feet, valve stations, and the
                // control cabinet on a free stretch of wall. Nothing here is pinned to a fixed angle,
                // so a hatch or a corridor mouth simply takes out the section that would cross it.
                fix(() => {
                    /** Angles free enough for a whole set (1.5 wide, so 0.9 to each side). */
                    const ray = (pref) => fitAngle(pref, 1.9);
                    const units = [];
                    for (const p of [-2.35, 0.35, 2.5, -0.95, 1.45]) {
                        if (units.length >= 3) break;
                        const a = ray(p);
                        if (a == null || units.some(u => Math.abs(wrap(u - a)) < 1.0)) continue;
                        units.push(a);
                    }
                    /** One generator set: housing, flanges, mount block with its gauge panel, stack. */
                    const unit = (a) => {
                        const r0 = 4.5, ry = a + Math.PI / 2;
                        const at = (u, v) => [Math.sin(a) * (r0 - u) + Math.cos(a) * v, Math.cos(a) * (r0 - u) - Math.sin(a) * v];
                        const [cx, cz] = at(0, 0);
                        cy(1.3, 1.4, 1.7, cx, 0.87, cz, metal, 8);                        // housing
                        cy(1.46, 1.46, 0.14, cx, 0.09, cz, dark, 8);                      // base flange
                        cy(1.36, 1.36, 0.12, cx, 1.76, cz, dark, 8);                      // top flange
                        for (let k = 0; k < 4; k++) {                                     // feet
                            const [fx, fz] = at(0, -0.5 + k * 0.34);
                            bx(0.16, 0.2, 0.3, fx, 0.1, fz, dark, ry);
                        }
                        cy(0.4, 0.52, 0.5, cx, 1.99, cz, M('#4a5a6e'), 8);                // exhaust stack
                        cy(0.72, 0.72, 0.06, cx, 2.24, cz, dark, 8);                      // stack collar
                        const [bx0, bz0] = at(0.66, 0);
                        bx(0.2, 0.94, 0.88, bx0, 0.98, bz0, dark, ry);                    // mount block
                        const [px, pz] = at(0.79, 0);
                        bx(0.06, 0.9, 0.86, px, 0.98, pz, panel, ry);                     // gauge panel
                        const [qx, qz] = at(0.82, 0);
                        bx(0.03, 0.8, 0.76, qx, 0.98, qz, M('#39424e'), ry);
                        for (let k = 0; k < 3; k++) {                                     // dials
                            const [gx, gz] = at(0.85, -0.26 + k * 0.26);
                            discZ(0.2, 0.05, gx, 1.2, gz, k === 1 ? M('#e05252', 0.9) : M('#4fcf7a', 0.9), a + Math.PI, 8);
                        }
                        const [mx, mz] = at(0.85, 0);
                        discZ(0.24, 0.06, mx, 0.72, mz, M('#c8d3db'), a + Math.PI, 10);
                        const [jx, jz] = at(-0.7, 0.62);
                        bx(0.14, 0.32, 0.5, jx, 0.9, jz, dark, ry);                       // junction box
                        // riser from the stack up into the ring main
                        cy(0.2, 0.24, 0.72, cx, 2.62, cz, metal, 8);                        // riser to the main
                        const [rx, rz] = at(-1.05, 0);
                        bx(1.1, 0.2, 0.2, (cx + rx) / 2, 2.95, (cz + rz) / 2, metal, a);     // branch into it
                    };
                    units.forEach(unit);
                    // --- ring main: a pipe round the room, in sections, cut at every passage ----------
                    const RM = 5.55, NSEG = 24, CH = 2 * RM * Math.sin(Math.PI / NSEG) + 0.06;
                    let lastSeg = null;
                    for (let i = 0; i < NSEG; i++) {
                        const a = (i + 0.5) / NSEG * Math.PI * 2, half = CH / 2;
                        if (!wallClear(a, half)) continue;
                        bx(CH, 0.17, 0.17, Math.sin(a) * RM, 2.95, Math.cos(a) * RM, metal, a);
                        // a coupling collar now and then, not on every section: a band of blocks round
                        // the room reads as a wall, not as a pipe
                        if (i % 4 === 0) bx(0.2, 0.26, 0.26, Math.sin(a) * RM, 2.95, Math.cos(a) * RM, dark, a);
                        // a hanger from the ring down to the wall band, every third section
                        if (i % 3 === 0) bx(0.08, 0.08, 0.7, Math.sin(a) * (RM + 0.3), 2.95, Math.cos(a) * (RM + 0.3), metal, a);
                        lastSeg = a;
                    }
                    // --- floor main on saddle feet, also cut at the passages --------------------------
                    const FM = 5.95, FN = 24, FC = 2 * FM * Math.sin(Math.PI / FN) + 0.06;
                    for (let i = 0; i < FN; i++) {
                        const a = (i + 0.5) / FN * Math.PI * 2;
                        if (!wallClear(a, FC / 2)) continue;
                        bx(FC, 0.22, 0.22, Math.sin(a) * FM, 0.42, Math.cos(a) * FM, metal, a);
                        if (i % 2) continue;                                                         // a saddle every other section
                        bx(0.3, 0.28, 0.34, Math.sin(a) * (FM - 0.02), 0.2, Math.cos(a) * (FM - 0.02), dark, a);
                        bx(0.44, 0.05, 0.44, Math.sin(a) * (FM - 0.02), 0.06, Math.cos(a) * (FM - 0.02), dark, a);
                    }
                    // valve station on the ring main: a stem and a hand wheel, on the clearest section
                    if (lastSeg != null) for (const off of [-0.12, 0.16]) {
                        const a = lastSeg + off;
                        if (!wallClear(a, 0.5)) continue;
                        cy(0.16, 0.16, 0.5, Math.sin(a) * RM, 3.2, Math.cos(a) * RM, dark, 6);
                        cy(0.46, 0.46, 0.07, Math.sin(a) * RM, 3.46, Math.cos(a) * RM, hazard, 10);
                        cy(0.12, 0.12, 0.12, Math.sin(a) * RM, 3.46, Math.cos(a) * RM, metal, 8);
                    }
                    // elbow down from the floor main into the room, where there is deck to walk on
                    const elbow = fitAngle(-1.2, 1.0);
                    if (elbow != null) {
                        const ex = Math.sin(elbow) * FM, ez = Math.cos(elbow) * FM;
                        cy(0.22, 0.22, 1.1, ex - Math.sin(elbow) * 0.55, 0.42, ez - Math.cos(elbow) * 0.55, metal, 8, Math.PI / 2);
                        cy(0.3, 0.3, 0.12, ex - Math.sin(elbow) * 1.05, 0.42, ez - Math.cos(elbow) * 1.05, dark, 8, Math.PI / 2);
                    }
                    // clutter: drums and a crate between the sets, left to the spread to keep clear
                    barrel(3.4, 2.6, hazard); crateLid(3.0, 3.3, 0.85, 0.25, crateMat2);
                });
                // control cabinet on a free stretch of wall, screen facing the room
                wall([0.55, -0.55, 2.4, Math.PI], 1.2, (p, fr) => fix(() => {
                    bx(1.0, 1.5, 0.6, p.x, 0.75, p.z, panel, p.ry);
                    bx(0.03, 0.56, 0.5, fr.at(0, 0.31)[0], 1.1, fr.at(0, 0.31)[1], screen, p.ry);
                    bx(1.06, 0.07, 0.66, p.x, 1.53, p.z, metal, p.ry);
                    for (let k = 0; k < 3; k++) cy(0.1, 0.1, 0.05, fr.at(-0.3 + k * 0.3, 0.33)[0], 0.62, fr.at(-0.3 + k * 0.3, 0.33)[1], k === 1 ? M('#e05252', 0.8) : M('#4fcf7a', 0.8), 8);
                }));
                break;
            }
            case 'hatchControl': {
                // Rebuilt from the board art: the escape-hatch door with its big lock hub and ribbed
                // threshold, two tilted LOCKED consoles flanking it, pod banks on both side walls and
                // the glowing control table standing in the middle of the room.
                fix(() => {
                    // The hatch frame is 3.1 wide, so it reserves 3.3 of wall; the two consoles and the
                    // pod banks then take their own stretches beside it, and any piece that no longer
                    // fits on the ring is simply not built.
                    const ha = pickAngle([Math.PI, Math.PI - 0.4, Math.PI + 0.4, 0, 0.4], 0.75, 3.3);
                    const hp = ha == null ? null : wallSpot(ha, 5.78, 3.3);
                    if (!hp) return;
                    const hf = frameOf(hp);
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
                    // the pod-status board above the frame: six lamps, four green, two spent
                    bx(1.5, 0.42, 0.08, hf.at(0, 0.36)[0], 2.72, hf.at(0, 0.36)[1], M('#1e252c'), hp.ry);
                    for (let k = 0; k < 6; k++) bx(0.16, 0.16, 0.04, hf.at(-0.6 + k * 0.24, 0.4)[0], 2.72, hf.at(-0.6 + k * 0.24, 0.4)[1], k < 4 ? M('#4fcf7a', 0.85) : M('#e05252', 0.7), hp.ry);
                    bx(1.2, 0.06, 0.03, hf.at(0, 0.42)[0], 2.96, hf.at(0, 0.42)[1], M('#ffd27f', 0.6), hp.ry);
                    for (const sd of [-1, 1]) {
                        // tilted LOCKED console on a wedge pedestal, screen bolted to its top
                        const sp2 = wallSpot(fitAngle(ha + sd * 0.42, 1.2), 5.7, 1.2);
                        if (!sp2) continue;
                        const sf = frameOf(sp2);
                        bx(1.0, 1.15, 0.5, sp2.x, 0.58, sp2.z, M('#1e252c'), sp2.ry);
                        bx(1.06, 0.1, 0.56, sp2.x, 1.18, sp2.z, dark, sp2.ry);
                        bx(0.9, 0.62, 0.06, sf.at(0, 0.1)[0], 1.44, sf.at(0, 0.1)[1], M('#1e252c'), sp2.ry, -0.34);
                        bx(0.8, 0.52, 0.03, sf.at(0, 0.14)[0], 1.44, sf.at(0, 0.14)[1], M('#2f7ad6', 0.7), sp2.ry, -0.34);
                        for (let k = 0; k < 3; k++) bx(0.56, 0.05, 0.02, sf.at(0, 0.17)[0], 1.56 - k * 0.12, sf.at(0, 0.17)[1], M('#dff0ff', 0.9), sp2.ry, -0.34);
                    }
                    // pod banks against both side walls: racks of dark pods with red status windows
                    for (const sd of [-1, 1]) {
                        const bp = wallSpot(pickAngle([ha + sd * 1.15, ha + sd * 1.45, ha + sd * 0.85], 0.5, 2.4), 5.8, 2.4);
                        if (!bp) continue;
                        const bf = frameOf(bp);
                        bx(2.2, 2.35, 0.28, bp.x, 1.2, bp.z, M('#232a31'), bp.ry);
                        bx(2.3, 0.12, 0.34, bp.x, 2.42, bp.z, metal, bp.ry);
                        bx(2.3, 0.12, 0.34, bp.x, 0.08, bp.z, dark, bp.ry);
                        for (let r2 = 0; r2 < 2; r2++) for (let c = 0; c < 2; c++) {
                            const u = (c - 0.5) * 0.98, y = 0.72 + r2 * 1.02;
                            ball(0.78, bf.at(u, 0.34)[0], y, bf.at(u, 0.34)[1], M('#1e242a'), 0.92, 1.05, 0.92);
                            discZ(0.24, 0.12, bf.at(u, 0.66)[0], y, bf.at(u, 0.66)[1], M('#e05252', 0.9), bp.ry, 8);
                        }
                    }
                    // holo control table in the middle of the room, with the operator's chair
                    cy(0.64, 0.92, 0.14, 0, 0.07, -0.4, dark, 8);
                    cy(0.44, 0.44, 0.78, 0, 0.5, -0.4, panel, 8);
                    bx(1.5, 0.1, 0.86, 0, 0.94, -0.4, M('#2a3b55'));
                    bx(1.36, 0.04, 0.72, 0, 1.0, -0.4, M('#4aa3df', 0.55));
                    for (let k = 0; k < 4; k++) bx(0.1, 0.02, 0.42, -0.5 + k * 0.33, 1.02, -0.4, M('#9fe4ff', 0.8));
                    chair(0, 0.65, Math.PI, M('#39424e'));
                    // a floating launch plot over the table, and the countdown pips on the deck
                    bx(1.0, 0.02, 0.05, 0, 1.32, -0.4, M('#9fe4ff', 0.55));
                    bx(0.05, 0.02, 0.5, 0, 1.32, -0.4, M('#9fe4ff', 0.55));
                    for (let k = 0; k < 6; k++) bx(0.2, 0.02, 0.1, -0.88 + (k % 3) * 0.28, 0.178, 1.3 + Math.floor(k / 3) * 0.2, k < 4 ? M('#4fcf7a', 0.35) : M('#e05252', 0.4));
                    // waiting benches: three seats on a rail, on each side of the approach lane
                    for (const [ba, br] of [[-1.05, 4.35], [1.15, 4.35]]) {
                        const wx = Math.sin(ba) * br, wz = Math.cos(ba) * br, wa = ba + Math.PI / 2;
                        bx(2.0, 0.08, 0.5, wx, 0.44, wz, M('#4a5a6e'), wa);                        // bench seat
                        bx(2.0, 0.6, 0.08, LX(wx, wz, wa, 0, -0.24), 0.72, LZ(wx, wz, wa, 0, -0.24), M('#3d4a52'), wa);   // back rail
                        for (const sd of [-0.8, 0, 0.8]) {                                        // legs and seat pads
                            bx(0.08, 0.44, 0.44, LX(wx, wz, wa, sd, -0.02), 0.22, LZ(wx, wz, wa, sd, -0.02), dark, wa);
                            bx(0.5, 0.06, 0.42, LX(wx, wz, wa, sd, 0.02), 0.5, LZ(wx, wz, wa, sd, 0.02), M('#3a4450'), wa);
                        }
                        bx(2.0, 0.05, 0.06, LX(wx, wz, wa, 0, -0.26), 1.02, LZ(wx, wz, wa, 0, -0.26), metal, wa);   // head rail
                    }
                    // escape supply: two stacked hard cases by the benches
                    for (const [sx2, sz2, sa2] of [[-2.7, -2.1, 0.5], [2.9, -1.6, -0.7]]) {
                        bx(1.0, 0.42, 0.62, sx2, 0.26, sz2, M('#6b7a3c'), sa2);
                        bx(1.04, 0.08, 0.66, sx2, 0.5, sz2, dark, sa2);
                        bx(0.5, 0.1, 0.06, LX(sx2, sz2, sa2, 0, 0.33), 0.42, LZ(sx2, sz2, sa2, 0, 0.33), M('#e8eef4', 0.4), sa2);
                        bx(0.8, 0.34, 0.5, LX(sx2, sz2, sa2, 0.05, 0), 0.72, LZ(sx2, sz2, sa2, 0.05, 0), M('#52607a'), sa2 + 0.12);
                    }
                });
                break;
            }
            case 'server': {
                // The rack room: four racks on a raised, slotted floor with a cable tray running above
                // them, a ladder tray climbing to the wall, a cooling unit on the clear wall, the admin
                // console and a crash cart. The tray above the racks ends at the ring, not over a door.
                fix(() => {
                    // raised floor: a slotted panel grid under and in front of the racks
                    for (let ix = -4; ix <= 4; ix++) for (let iz = -1; iz <= 2; iz++) {
                        bx(0.86, 0.06, 0.86, ix * 0.92, 0.12, iz * 0.92 - 0.5, (ix + iz) % 2 ? M('#2a333d') : M('#333d48'));
                    }
                    for (let i = 0; i < 4; i++) {
                        const x = -2.4 + i * 1.6, z = 0.4;
                        bx(0.84, 2.2, 1.6, x, 1.16, z, dark);                          // rack body
                        bx(0.88, 0.08, 1.64, x, 2.32, z, metal);                       // top cap
                        bx(0.9, 0.1, 1.66, x, 0.11, z, M('#1a1f24'));                  // plinth
                        bx(0.03, 1.9, 1.34, x + 0.43, 1.18, z, M('#333d48'));          // door panel
                        for (let k = 0; k < 6; k++) bx(0.05, 0.14, 1.2, x + 0.45, 0.48 + k * 0.3, z, k % 2 ? M('#4fcf7a', 0.85) : M('#4aa3df', 0.85));
                        bx(0.06, 0.24, 0.12, x - 0.4, 1.56, z + 0.62, M('#9fd7ff', 0.4));   // handle light
                        bx(0.1, 0.24, 0.32, x - 0.42, 0.96, z - 0.5, M('#39424e'));        // side port
                        bx(0.5, 0.3, 0.03, x + 0.46, 2.02, z, M('#4aa3df', 0.45));         // unit label
                    }
                    // overhead cable tray with drop leads into each rack
                    bx(6.9, 0.08, 0.42, 0, 2.68, 0.4, dark);
                    for (let i = 0; i <= 8; i++) for (const sz of [-0.15, 0.15]) bx(0.08, 0.12, 0.06, -3.2 + i * 0.8, 2.6, 0.4 + sz, metal);
                    for (let i = 0; i < 4; i++) {
                        const x = -2.4 + i * 1.6;
                        cy(0.09, 0.09, 0.28, x + 0.25, 2.5, 0.55, M('#4aa3df', 0.35), 6);
                        bx(0.06, 0.5, 0.06, x - 0.3, 2.36, 0.5, M('#20262c'));         // drop lead
                    }
                    // the admin console at the back: screen on a foot bolted to the desk
                    bx(1.5, 0.9, 0.6, 0, 0.45, -2.6, panel);
                    bx(1.56, 0.06, 0.7, 0, 0.93, -2.6, metal);
                    bx(0.26, 0.12, 0.16, 0, 1.02, -2.54, dark);
                    bx(1.1, 0.7, 0.06, 0, 1.4, -2.5, metal, 0, -0.3);
                    bx(1.0, 0.6, 0.03, 0, 1.4, -2.46, screen, 0, -0.3);
                    bx(1.36, 0.05, 0.36, 0, 0.98, -2.45, dark);
                    for (let k = 0; k < 3; k++) bx(0.14, 0.03, 0.14, -0.4 + k * 0.16, 1.0, -2.3, k === 1 ? M('#e05252', 0.7) : M('#4fcf7a', 0.7));
                    chair(0, -1.75, 0, M('#39424e'));
                    // crash cart beside the console: shelves, a monitor and a coiled patch lead
                    bx(0.8, 0.06, 0.55, 1.9, 0.72, -2.4, metal, 0.2);
                    bx(0.8, 0.06, 0.55, 1.9, 0.36, -2.4, metal, 0.2);
                    for (const [ox, oz] of [[-0.34, -0.22], [0.34, -0.22], [-0.34, 0.22], [0.34, 0.22]]) cy(0.08, 0.08, 0.3, LX(1.9, -2.4, 0.2, ox, oz), 0.16, LZ(1.9, -2.4, 0.2, ox, oz), dark, 6);
                    bx(0.6, 0.44, 0.08, LX(1.9, -2.4, 0.2, 0, -0.1), 1.06, LZ(1.9, -2.4, 0.2, 0, -0.1), M('#1e252c'), 0.2, -0.1);
                    bx(0.5, 0.34, 0.03, LX(1.9, -2.4, 0.2, 0, -0.06), 1.06, LZ(1.9, -2.4, 0.2, 0, -0.06), M('#4aa3df', 0.7), 0.2, -0.1);
                    coil(2.6, -1.6, 0.62, M('#20262c'));
                    bx(0.1, 0.1, 1.3, 1.6, 0.15, -1.35, M('#20262c'), 0.4);               // lead across the deck
                });
                // cooling unit on the clear wall, with its vents, coil and drip tray
                wall([-1.0, -0.6, 3.1, 2.7, Math.PI], 2.0, (p, fr) => fix(() => {
                    bx(1.4, 2.0, 0.7, p.x, 1.0, p.z, M('#39424e'), p.ry);
                    bx(1.46, 0.1, 0.76, p.x, 2.05, p.z, metal, p.ry);
                    bx(1.2, 1.2, 0.03, fr.at(0, 0.37)[0], 1.3, fr.at(0, 0.37)[1], M('#1a1f24'), p.ry);   // grille recess
                    for (let k = 0; k < 8; k++) bx(1.1, 0.06, 0.04, fr.at(0, 0.4)[0], 0.8 + k * 0.14, fr.at(0, 0.4)[1], M('#5f6d7a'), p.ry);
                    bx(0.4, 0.28, 0.05, fr.at(-0.4, 0.39)[0], 1.86, fr.at(-0.4, 0.39)[1], M('#4fcf7a', 0.55), p.ry);   // status lamp panel
                    cy(0.1, 0.1, 0.06, fr.at(0.34, 0.4)[0], 1.86, fr.at(0.34, 0.4)[1], M('#e05252', 0.8), 8);
                    bx(1.3, 0.04, 0.5, fr.at(0, 0.24)[0], 0.16, fr.at(0, 0.24)[1], M('#1a1f24'), p.ry);   // drip tray
                    pipes(fr.at(0.95, 0.3)[0], fr.at(0.95, 0.3)[1], p.ry, 1, 0.9);       // refrigerant line
                }));
                // wall cabinet of spare parts, out of the standing zone
                wall([-2.6, -3.0, 2.6], 1.4, (p, fr) => fix(() => {
                    bx(1.0, 1.4, 0.4, p.x, 0.7, p.z, panel, p.ry);
                    bx(0.86, 0.9, 0.03, fr.at(0, 0.21)[0], 0.72, fr.at(0, 0.21)[1], M('#39424e'), p.ry);
                    for (let k = 0; k < 4; k++) bx(0.74, 0.06, 0.02, fr.at(0, 0.24)[0], 1.0 - k * 0.18, fr.at(0, 0.24)[1], k % 2 ? M('#4fcf7a', 0.7) : M('#4aa3df', 0.7), p.ry);
                }));
                break;
            }
            case 'storage': {
                // Cargo hold after the board art: long cargo modules with strapped lids lying on the
                // painted deck rectangles (the same coordinates buildFloor paints), green pallet boxes
                // between them, a run of bulkhead teeth along one wall, a leaning grating panel, straps
                // on the deck — plus shelving and a pallet jack against the free wall. The painted
                // squares stay readable: every module sits INSIDE its rectangle, nothing straddles it.
                const strap = M('#c9a227'), tooth = M('#4a5563'), green = M('#6b7a3c');
                /** Cargo module: a long low container with a strapped lid, ribs and corner brackets. */
                const module_ = (x, z, w, l, ry, mat = crateMat) => {
                    bx(w, 0.72, l, x, 0.36, z, mat, ry);                                     // body
                    bx(w * 1.06, 0.12, l * 1.06, x, 0.78, z, dark, ry);                       // lid flange
                    bx(w * 0.92, 0.1, l * 0.94, x, 0.86, z, mat, ry);                         // lid
                    for (let k = 0; k < 3; k++) bx(w * 1.02, 0.1, 0.1, x, 0.5, z, dark, ry); // (straps below, ribs here)
                    for (const fz of [-0.34, 0.34]) bx(w * 1.1, 0.09, 0.1, LX(x, z, ry, 0, fz * l), 0.62, LZ(x, z, ry, 0, fz * l), strap, ry);   // strap over the lid
                    for (const fz of [-0.42, 0.42]) for (const sx of [-1, 1]) bx(0.12, 0.5, 0.12, LX(x, z, ry, sx * w / 2, fz * l), 0.25, LZ(x, z, ry, sx * w / 2, fz * l), metal, ry);   // corner brackets
                    bx(w * 0.3, 0.05, l * 0.2, LX(x, z, ry, 0, -0.28 * l), 0.92, LZ(x, z, ry, 0, -0.28 * l), M('#d4b02a', 0.2), ry);   // stencil on the lid
                    for (const sx of [-1, 1]) bx(0.06, 0.24, l * 0.5, LX(x, z, ry, sx * w / 2, 0), 0.5, LZ(x, z, ry, sx * w / 2, 0), dark, ry);
                };
                fix(() => {
                    // --- the painted rectangles: one module or a stack inside each of them ---------
                    module_(-3.2, 2.4, 1.5, 1.9, 0, crateMat);                       // zone A
                    module_(0.4, 3.0, 1.9, 1.35, 0, crateMat2);                      // zone B
                    module_(3.4, 0.6, 1.4, 2.2, Math.PI / 2, M('#5a6a3a'));          // zone C — long, along the wall
                    module_(-3.6, -1.6, 1.6, 1.5, 0, crateMat2);                     // zone D, with tins stacked on top
                    for (let k = 0; k < 3; k++) bx(0.26, 0.2, 0.34, -4.0 + k * 0.36, 1.01, -1.6, k % 2 ? olive : crateMat);
                    module_(-0.8, -3.6, 1.8, 1.2, 0, crateMat);                      // zone E
                    // --- between them: green pallet boxes, open crates, a leaning grating panel -----
                    crateLid(-1.9, 2.3, 0.8, 0.3, green, false);
                    crateLid(-1.9, 2.3, 0.55, 0.3, crateMat2, false, 0.82);
                    crateLid(1.9, 2.35, 0.85, -0.2, crateMat, true);
                    crateLid(2.35, 1.35, 0.7, 0.15, green, false);
                    crateLid(-1.6, -2.55, 0.8, 0.45, crateMat2, true);
                    crateLid(1.15, -3.2, 0.75, -0.35, green, false);
                    ammoBox(-2.55, 0.55, 0.3, true); ammoBox(-1.95, 1.15, -0.25, false);
                    vest(-2.9, 1.1, 0.5); vest(0.9, -2.5, -0.4);
                    barrel(-2.75, -0.4, hazard); barrel(3.35, 2.6, M('#52607a'));
                    // grating panel leaning on the wall: frame + bars, tilted back
                    // 1.5 wide, so it reserves 1.7: a panel that does not fit is left leaning nowhere
                    const gp = wallSpot(pickAngle([-1.55, -1.2], 0.55, 1.7), 5.7, 1.7);
                    if (gp) {
                        const gf = frameOf(gp);
                        bx(1.5, 0.08, 0.1, gp.x, 0.06, gp.z, metal, gp.ry);
                        bx(1.5, 0.08, 0.1, gp.x, 1.5, gp.z, metal, gp.ry);
                        for (const sd of [-1, 1]) bx(0.08, 1.5, 0.1, gf.at(sd * 0.71, 0)[0], 0.78, gf.at(sd * 0.71, 0)[1], metal, gp.ry);
                        for (let k = 0; k < 9; k++) bx(0.06, 1.42, 0.06, gf.at(-0.63 + k * 0.157, 0)[0], 0.78, gf.at(-0.63 + k * 0.157, 0)[1], tooth, gp.ry);
                    }
                    // --- the bulkhead teeth: a run of prongs along the free wall -------------------
                    const tp = wallSpot(pickAngle([-0.95, 0.95, -0.6], 0.5, 3.2), 5.95, 3.2);
                    if (tp) {
                        const tf = frameOf(tp);
                        bx(3.0, 0.4, 0.24, tp.x, 1.5, tp.z, dark, tp.ry);
                        for (let k = 0; k < 7; k++) {
                            const u = -1.3 + k * 0.43;
                            for (const sd of [-1, 1]) bx(0.3, 0.3, 0.22, tf.at(u, 0.02)[0], 1.5 + sd * 0.22, tf.at(u, 0.02)[1], tooth, tp.ry).rotation.z = Math.PI / 4 * sd;
                        }
                    }
                    // --- shelving and a pallet jack against the other wall (kept from the old hold) --
                    // The rack is 2.6 wide and the pallet jack another 0.8; each piece reserves only its
                    // own stretch, so a doorway between them just leaves the pair further apart.
                    const p = wallSpot(pickAngle([2.9, -2.9, 2.5, -2.5], 0.6, 2.8), 5.78, 2.8);
                    if (p) {
                        const fr = frameOf(p);
                        for (const sx of [-1.25, 1.25]) bx(0.1, 1.5, 0.5, fr.at(sx, 0.08)[0], 0.75, fr.at(sx, 0.08)[1], metal, p.ry);
                        for (const y of [0.9, 1.35]) bx(2.6, 0.07, 0.55, fr.at(0, 0.08)[0], y, fr.at(0, 0.08)[1], metal, p.ry);
                        for (let k = 0; k < 4; k++) bx(0.45, 0.34, 0.4, fr.at(-0.95 + k * 0.62, 0.28)[0], 1.1, fr.at(-0.95 + k * 0.62, 0.28)[1], k % 2 ? crateMat : olive, p.ry);
                        for (let k = 0; k < 3; k++) bx(0.5, 0.3, 0.42, fr.at(-0.7 + k * 0.7, 0.28)[0], 1.54, fr.at(-0.7 + k * 0.7, 0.28)[1], crateMat2, p.ry);
                        const jp2 = wallSpot(fitAngle(p.a + 0.62, 1.1), 5.72, 1.1);
                        const jf = jp2 ? frameOf(jp2) : null;
                        if (jp2) {
                            bx(0.7, 0.12, 0.3, jp2.x, 0.12, jp2.z, dark, jp2.ry);
                            bx(0.7, 0.1, 0.2, jf.at(0, 0.12)[0], 0.1, jf.at(0, 0.12)[1], metal, jp2.ry);
                            bx(0.12, 0.9, 0.12, jf.at(-0.3, 0.05)[0], 0.55, jf.at(-0.3, 0.05)[1], dark, jp2.ry);   // tiller
                        }
                    }
                    // straps coiled on the deck near the modules
                    for (const [x, z] of [[-2.3, 3.2], [1.4, 0.6], [-0.4, -2.6]]) {
                        cy(0.5, 0.5, 0.06, x, 0.19, z, strap, 10);
                        cy(0.34, 0.34, 0.07, x, 0.21, z, dark, 10);
                    }
                });
                break;
            }
        }
        // automatic perimeter dressing between the exits
        const famil = TILE_STYLE[tile] || 'steel';
        const dressAngles = [];
        const nearUsed = a => usedAngles.some(u => Math.abs(Math.atan2(Math.sin(a - u), Math.cos(a - u))) < 0.32);
        for (let i = 0; i < 12; i++) {
            const a = (i + 0.5) / 12 * Math.PI * 2;
            const dz = Math.hypot(Math.sin(a) * (WALL_R - 0.9) - ZONE_C.x, Math.cos(a) * (WALL_R - 0.9) - ZONE_C.z);
            // The automatic dressing keeps to the same rule as the hand-placed wall furniture: a
            // stretch of ring wide enough for the piece, clear of every doorway and of the hatch.
            if (!wallClear(a, 0.55) || dz < ZONE_R + 1.2 || nearUsed(a)) continue;
            dressAngles.push(a);
            usedAngles.push(a);
        }
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
            // A spread prop pushed out to the wall can land in a doorway: the clamp above only knows
            // about the ring, not about the openings cut into it. Anything standing this close to the
            // wall is swung onto the nearest clear stretch, so a drum never blocks a corridor mouth.
            const r2 = Math.hypot(m.position.x, m.position.z);
            if (r2 > 4.4 && !wallClear(Math.atan2(m.position.x, m.position.z), 0.38)) {
                const na = fitAngle(Math.atan2(m.position.x, m.position.z), 0.8);
                if (na != null) { m.position.x = Math.sin(na) * r2; m.position.z = Math.cos(na) * r2; }
            }
        }
        statics.push(...fixed, ...dressing);
        // Where the Computer of this room is, in the room's own coordinates. The desks are merged into
        // the static shell and lose their identity there; a room with a Computer turns these spots
        // into click boxes (syncComputer) on the room base, which survives a shell rebuild.
        if (node) {
            const roomId = node.data ? node.data.id : null;
            const isComputer = roomId && this.roomTiles && this.roomTiles[tile] && this.roomTiles[tile].computer;
            // the desks are read after the spread, so the box lands exactly on the console the merge keeps
            const spots = cpuSpots.concat(consoles.map(c => ({ x: c.desk.position.x, z: c.desk.position.z, ry: c.ry })));
            // A room whose model has no desk console still has its Computer: use the free wall station,
            // which is where those rooms put their control panel.
            if (isComputer && !spots.length) { const p = wallSpot(freeAngle(1.05, 0.7)); spots.push({ x: p.x, z: p.z, ry: p.ry }); }
            node.cpuSpots = isComputer ? spots : null;
        }
        this.mergeStatic(statics, root);
        return root;
    }

    // ---------------------------------------------------------------------------------------
    // Corridors (polylines)
    // ---------------------------------------------------------------------------------------
    corridorPoints(ship, c) {
        const a = this.pos(ship.rooms[c.a]), b = this.pos(ship.rooms[c.b]);
        const span = b.subtract(a); const dist = span.length();
        const dir = span.scale(1 / Math.max(1e-6, dist));
        // A doorway faces the neighbouring room (the wall opening and the door portal are built on
        // that axis), so the tube leaves and enters along it. The board's bend points are kept but
        // clamped to the free span between the two walls and to a sane sideways offset: a hand-placed
        // point may sit behind a wall or far to the side of a short passage, and a polyline that
        // doubles back folds the tube into a knot — that is what tore 013-014 and the 011 corridors
        // apart (a 10-unit path between two 6.3-unit wall rings came out as a zigzag).
        // The tube runs THROUGH the wall ring and a little into the room: the wall is cut open for
        // the doorway (3.0 wide, the tube is 2.4), so ending it outside the wall left a notch of
        // hull between the corridor and the room — the "entrance does not join the corridor".
        const through = WALL_R - 0.25;
        const gap = Math.max(0.6, dist - 2 * WALL_R);   // the free span between the wall faces
        const stub = Math.min(0.9, gap * 0.25);         // straight run right in front of the door
        const lat = new (B().Vector3)(-dir.z, 0, dir.x);
        let maxLat = Math.max(0.25, gap * 0.34);        // how far the tube may bulge to the side
        // Bend points are kept clear of the door stubs: a point clamped right onto a stub folds the
        // line back on itself. When the two wall rings leave no room for a bend at all (the
        // 013-014 passage is 5.4 units long), the corridor is simply straight.
        const margin = Math.max(0.5, gap * 0.2);
        const lo = through + stub + margin, hi = dist - through - stub - margin;
        const windowLen = hi - lo;
        // A sideways offset has to be spread over the run that is left between the doors: pushed into
        // a 1.8-unit slot it would still read as an elbow, so the bulge is scaled to the room there is.
        maxLat = Math.min(maxLat, Math.max(0, windowLen) * 0.45);
        const ctrl = [a.add(dir.scale(through)), a.add(dir.scale(through + stub))];
        const push = (p) => { if (p.subtract(ctrl[ctrl.length - 1]).length() > 0.4) ctrl.push(p); };
        if (windowLen > 1.2 && maxLat > 0.3) {
            for (const [x, y] of (c.path || [])) {
                const m = this.posXY(x, y).subtract(a);
                const along = Math.min(hi, Math.max(lo, B().Vector3.Dot(m, dir)));
                const side = Math.min(maxLat, Math.max(-maxLat, B().Vector3.Dot(m, lat)));
                push(a.add(dir.scale(along)).add(lat.scale(side)));
            }
        }
        ctrl.push(b.subtract(dir.scale(through + stub)), b.subtract(dir.scale(through)));
        // drop points that sit on a straight line: a straight corridor needs no extra seams
        const keep = [];
        for (let i = 0; i < ctrl.length; i++) {
            if (i > 0 && i < ctrl.length - 1) {
                const u = ctrl[i].subtract(ctrl[i - 1]), v = ctrl[i + 1].subtract(ctrl[i]);
                if (u.length() < 1e-4 || v.length() < 1e-4) continue;
                if (B().Vector3.Dot(u.normalize(), v.normalize()) > 0.9995) continue;
            }
            keep.push(ctrl[i]);
        }
        return this.roundPath(keep, Math.max(0.45, Math.min(0.85, dist / 16)));
    }

    /** Round the corners of a corridor polyline and resample it at a fixed step.
     *
     *  The tube is built from straight box sections, so a 70-degree elbow in the control points left
     *  the corridor looking torn: floor slabs crossed each other, a rib arch stood at an odd angle and
     *  the door frame straddled the kink instead of standing on the passage. Chaikin corner cutting
     *  keeps the line inside the control polygon — a rounded bend can never push the tube through a
     *  room wall — and the resample keeps every section short enough for the bend to read as a curve
     *  (plating, ribs and joint pads are spaced along the whole path, not per section). */
    roundPath(ctrl, step) {
        const V3 = B().Vector3;
        if (ctrl.length < 3) return ctrl.map(p => p.clone());
        let line = ctrl.map(p => p.clone());
        for (let pass = 0; pass < 2; pass++) {
            const next = [line[0].clone()];
            for (let i = 0; i < line.length - 1; i++) {
                next.push(V3.Lerp(line[i], line[i + 1], 0.25), V3.Lerp(line[i], line[i + 1], 0.75));
            }
            next.push(line[line.length - 1].clone());
            line = next;
        }
        const out = [line[0].clone()];
        let acc = 0;
        for (let i = 0; i < line.length - 1; i++) {
            const p = line[i], q = line[i + 1];
            const l = q.subtract(p).length();
            if (l < 1e-5) continue;
            let t = 0;
            while (acc + (l - t) >= step) {
                t += step - acc;
                out.push(V3.Lerp(p, q, t / l));
                acc = 0;
            }
            acc += l - t;
        }
        const end = line[line.length - 1];
        const tail = end.subtract(out[out.length - 1]).length();
        if (tail > 1e-4) { if (tail < step * 0.5 && out.length > 1) out[out.length - 1] = end.clone(); else out.push(end.clone()); }
        // a straight run does not need a seam every 60 cm
        const flat = [];
        for (let i = 0; i < out.length; i++) {
            if (i > 0 && i < out.length - 1) {
                const u = out[i].subtract(out[i - 1]), v = out[i + 1].subtract(out[i]);
                if (u.length() < 1e-4 || v.length() < 1e-4) continue;
                if (V3.Dot(u.normalize(), v.normalize()) > 0.99985) continue;
            }
            flat.push(out[i]);
        }
        return flat;
    }

    /** The polyline a figure walks when it moves from one room to the next: exactly the corridor
     *  tube it disappears into, so nobody crosses the hull walls. One move is one corridor, so a
     *  route exists only between neighbours; pod launches and hibernation return null and the
     *  figure is simply placed. */
    routeTo(fromId, toId) {
        const ship = this.ship;
        if (!ship || fromId === toId) return null;
        const from = ship.rooms[fromId];
        if (!from) return null;
        const exit = (from.exits || []).find(e => e.to === toId);
        const c = exit && ship.corridors[exit.corridor];
        if (!c) return null;
        const pts = this.corridorPoints(ship, c);
        if (c.a !== fromId) pts.reverse();
        return pts;
    }

    buildCorridor(ship, c) {
        const S = this.scene;
        const pts = this.corridorPoints(ship, c);
        const root = new (B().TransformNode)('cor_' + c.id, S);
        // The floor plates of a room are FLOOR_Y thick: the corridor deck has to sit on the same
        // level, or the doorway shows a step and walking figures float over the tube.
        root.position.y = FLOOR_Y;
        const M = (hex, e, extra) => this.M(hex, e, extra);
        const statics = [], ribsA = [], ribsB = [], ledA = [], ledB = [];
        const total = pts.reduce((s, p, i) => i ? s + p.subtract(pts[i - 1]).length() : 0, 0);
        const stations = (step, phase) => { const out = []; for (let v = phase; v < total; v += step) out.push(v); return out; };
        const plateAt = stations(1.1, 0.55), ribAt = stations(2.2, 1.1);
        let acc = 0, doorPlaced = null, lastPad = -99;
        for (let i = 0; i < pts.length - 1; i++) {
            const s0 = pts[i], s1 = pts[i + 1]; const dir = s1.subtract(s0); const l = dir.length(); const n = dir.normalize();
            const mid = s0.add(s1).scale(0.5); const ry = Math.atan2(n.x, n.z);
            const seg = new (B().TransformNode)('seg', S); seg.position = mid; seg.rotation.y = ry; seg.parent = root;
            const mk = (w, h, d, x, y, z, mat, list = statics) => { const m = B().MeshBuilder.CreateBox('c', { width: w, height: h, depth: d }, S); m.position.set(x, y, z); m.material = mat; m.parent = seg; list.push(m); return m; };
            mk(2.4, 0.3, l + 0.8, 0, -0.2, 0, M('#1f2a36'));
            // Deck plating, ribs and joint pads are spaced along the WHOLE path: the tube is made of
            // short sections so a bend reads as a curve, and a per-section count would give every
            // 40-cm piece its own arch and a plate seam every hand's width.
            for (const st of plateAt) {
                if (st < acc + 0.02 || st > acc + l - 0.02) continue;
                mk(2.0, 0.06, 0.98, 0, -0.03, st - acc - l / 2, M(plateAt.indexOf(st) % 2 ? '#3a4552' : '#404c5a'));
            }
            mk(0.5, 0.07, l + 0.5, 0, 0.0, 0, M('#5a4a2a'));
            for (const s of [-1, 1]) { mk(0.2, 0.3, l + 0.5, s * 1.05, 0.1, 0, M('#3c4c60')); mk(0.08, 0.08, l + 0.5, s * 1.05, 0.6, 0, M('#aab6c2')); }
            // ribs: one arch every 2.2 units of the path
            for (const st of ribAt) {
                if (st < acc || st > acc + l) continue;
                const z = st - acc - l / 2;
                const along = st;
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
            // Joint pad where the path really turns (a smooth bend needs no collar at every sample).
            // The collar and its post belong to the bend, and a bend belongs to one half of the tube —
            // the same halves the ribs are split into. The post used to be pushed into the ALWAYS-VISIBLE
            // statics, so a corridor whose room at that end was still face down showed a single 1.9-tall
            // bar standing on the deck with no arch around it (the "lone beams" on the board). It goes
            // into the half's own list, so it appears and disappears with the arch it belongs to.
            if (i < pts.length - 2) {
                const turn = Math.acos(Math.max(-1, Math.min(1, B().Vector3.Dot(n, pts[i + 2].subtract(s1).normalize()))));
                if (turn > 0.25 && acc + l - lastPad > 1.2 && Math.abs(acc + l - total / 2) > 1.6) {
                    lastPad = acc + l;
                    const pad = B().MeshBuilder.CreateCylinder('pad', { diameter: 3.2, height: 0.32, tessellation: 8 }, S); pad.position = s1.clone(); pad.position.y = -0.19; pad.material = M('#243040'); pad.parent = root; statics.push(pad);
                    const postHalf = (acc + l) < total / 2 ? ribsA : ribsB;
                    const post = B().MeshBuilder.CreateBox('jp', { width: 0.4, height: 1.9, depth: 0.4 }, S); post.position = s1.clone(); post.position.y = 0.95; post.position.addInPlace(new (B().Vector3)(Math.cos(ry) * 1.4, 0, -Math.sin(ry) * 1.4)); post.material = M('#59697b'); post.parent = root; postHalf.push(post);
                }
            }
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
        // --- the door: two ordinary corridor arches with a plate between them -------------------
        // The doorway is not a bulkhead of its own: it is built from the very same recipe as the ribs
        // of the tube (posts, brackets, lintel, lamp, conduit, a glowing band), so walking up to it
        // reads as the corridor narrowing into a door, not as a shed standing in the passage. Between
        // the two arches a flat plate of the same steel bridges them: exactly the lintels' width and
        // height, flush with their tops and sides, so nothing sticks out over the sides. The corridor
        // number is stencilled on that plate.
        // Every size comes from client/tuning.js (doorSpec).
        const D = doorSpec();
        const d = doorPlaced; const dz = d.z;
        const door = new (B().TransformNode)('door', S); door.parent = d.seg; door.position.set(0, 0, dz);
        const steel = M(D.steel), bracketM = M('#3e4b59'), conduitM = M('#8c96a0');
        const add = (name, w, h, dp, x, y, z, material) => {
            const m = B().MeshBuilder.CreateBox(name, { width: w, height: h, depth: dp }, S);
            m.parent = door; m.position.set(x, y, z); m.material = material; m.isPickable = false;
            return m;
        };
        // The two arches, one on each side of the plate. Nothing is bolted to their sides: the door
        // is exactly the two arches and the plate between them (no side strips, no side plates).
        const archZ = [-D.archGap / 2, D.archGap / 2];
        for (const az of archZ) {
            for (const s of [-1, 1]) {
                add('apost', D.postW, D.postH, D.postD, s * D.postX, D.postH / 2, az, steel);
                add('abrk', 0.1, D.postH * 0.31, 0.12, s * (D.postX - D.postW / 2 - 0.02), D.postH * 0.4, az, bracketM);
            }
            add('alintel', D.beamW, D.beamH, D.postD, 0, D.beamY, az, steel);
            add('alamp', D.beamW * 0.35, 0.06, 0.12, 0, D.beamY - D.beamH / 2 - 0.02, az, M('#dff5ff', 1));
            const pipe = B().MeshBuilder.CreateCylinder('apipe', { diameter: 0.12, height: D.beamW - 0.06, tessellation: 6 }, S);
            pipe.parent = door; pipe.position.set(0, D.postH - 0.18, az); pipe.rotation.z = Math.PI / 2;
            pipe.material = conduitM; pipe.isPickable = false;
        }
        // the plate between the arches: the lintels' own steel, flush with them on every side
        add('aplate', D.beamW, D.beamH, D.plateD, 0, D.beamY, 0, steel);
        // No leaves and no side plates: the doorway is exactly the two arches and the plate between
        // them. The grey leaves that used to hang on pivots outside the posts read as two extra
        // plates bolted to the sides of the door — they are gone, not merely swung open. A sealed
        // door is shown by its emergency lamps (updateCorridor), an open one by nothing at all.
        const noise = B().MeshBuilder.CreateCylinder('noise', { diameter: 1.4, height: 0.12, tessellation: 12 }, S);
        noise.parent = door; noise.position.set(0, 0.1, -2.2); noise.material = M('#f1c40f', 0.9); noise.isPickable = false; noise.setEnabled(false); noise.visibility = 0;   // kept for layout; the ribs of the corridor show noise
        const noiseLabel = this.makeLabel('nl_' + c.id, '🔊', '', door, 0, 1.4, -2.2, 1.4);
        noiseLabel.setEnabled(false);
        // --- the corridor number, stenciled flat on the plate -------------------------------------
        // Not a board and not a billboard: paint on the plate's own steel, the way the "?" is printed
        // on the floor of an unexplored room — no glow, always in the same place, no screen on top.
        // Alt repaints the same stencil as neon (setAlt -> setDecal).
        // Numbers belong to the ROOM, not to the corridor: on the printed board every room numbers
        // its own exits 1..4 (a room with fewer than four corridors gives one corridor two digits,
        // printed "3 4"). A door is seen from both ends, so it carries two stencils — one on each
        // half of the beam, painted with the number of the room on that side. One shared stencil
        // showed room `a`'s numbers to room `b` as well, and a room ended up with several "2"s.
        const numsOfRoom = (roomId) => {
            const exit = ship.rooms[roomId].exits.find(e => e.corridor === c.id) || {};
            return (exit.nums && exit.nums.length ? exit.nums : [exit.num]).filter(n => n);
        };
        const sideNums = { a: numsOfRoom(c.a), b: numsOfRoom(c.b) };
        const nums = sideNums.a.length ? sideNums.a : sideNums.b;
        // ONE stencil, centred on the plate, painted the way the "?" lies on a room floor: the same
        // paint, the same way up, no glow. A second copy on the far half only repeated the digits
        // turned round — they were literally upside down from above and read as mirrored — while
        // agreeNumbers already makes both ends of a passage carry the same number.
        const decal = nums.length ? this.makeDecal('cn_' + c.id, door, 0, D.decalY, 0, D.decalW, D.decalH) : null;
        if (decal) {
            decal.rotation.set(Math.PI / 2, 0, (Math.cos(d.ry) - Math.sin(d.ry) < 0) ? Math.PI : 0);
            this.setDecal(decal, nums.join(' / '), false);
        }
        // Emergency lamps in the doorway: dark fixtures on the arch posts, dead until the bulkhead
        // seals. The lenses are switched off, not merely dimmed, so an open door shows no red at all;
        // once it closes the opening is lit like a room on malfunction (updateCorridor).
        const lamps = [];
        for (const az of archZ) {
            const f = az < 0 ? -1 : 1, lz = az + f * (D.postD / 2 + 0.14);
            for (const s of [-1, 1]) {
                const body = B().MeshBuilder.CreateBox('lem', { width: 0.16, height: 0.26, depth: 0.24 }, S);
                body.parent = door; body.position.set(s * (D.postX - D.postW / 2 - 0.06), D.lampY, lz); body.material = M('#2a3038'); body.isPickable = false;
                const lens = B().MeshBuilder.CreateBox('lel', { width: 0.1, height: 0.16, depth: 0.16 }, S);
                lens.parent = door; lens.position.set(s * (D.postX - D.postW / 2 - 0.06), D.lampY, lz + f * 0.13); lens.material = M(D.lamp, 1.6); lens.isPickable = false; lens.setEnabled(false);
                lamps.push(lens);
            }
        }
        const debris = [];
        for (let i = 0; i < 5; i++) {
            const db = B().MeshBuilder.CreateBox('debris', { width: 0.4, height: 0.12, depth: 0.5 }, S);
            db.parent = door; db.position.set((Math.random() - 0.5) * 1.6, 0.08, (Math.random() - 0.5) * 1.4); db.rotation.set(0, Math.random() * 3, (Math.random() - 0.5) * 0.4); db.material = M('#6b7a88'); db.isPickable = false; db.setEnabled(false);
            debris.push(db);
        }
        this.corridorNodes[c.id] = { root, door, noise, noiseLabel, decal, nums, sideNums, lamps, debris, ribsA: mA.concat(lA), ribsB: mB.concat(lB), matA, matB,
            ry: d.ry, a: c.a, b: c.b, state: null };
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
        // A stencil is printed paint, not a lamp. The glow layer blurs in screen space, so at the
        // far zoom level a small number bloomed into an unreadable smear; the neon look is painted
        // into the texture by setDecal and survives on its own, at any distance.
        if (this.glow) this.glow.addExcludedMesh(plane);
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
        let size = TUNE.get('door.numFont');
        ctx.font = font(size);
        while (size > 60 && ctx.measureText(text).width > W - 24) { size -= 6; ctx.font = font(size); }
        // A dark edge first: the paint sits on the beam's own light steel, not on a dark panel.
        ctx.lineJoin = 'round';
        ctx.lineWidth = Math.max(3, size * 0.07);
        ctx.strokeStyle = TUNE.color(neon ? 'door.neonGlow' : 'door.outline');
        if (neon) { ctx.shadowColor = TUNE.color('door.neonGlow'); ctx.shadowBlur = 30; }
        ctx.strokeText(text, W / 2, H / 2 + 6);
        ctx.fillStyle = TUNE.color(neon ? 'door.neon' : 'door.paint');
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
        // The tile map goes first: the props of an explored room are built during buildShip, and a
        // room with a Computer has to know it while its furniture is made.
        this.roomTiles = roomTiles || this.roomTiles;
        this.buildShip(view.ship);
        for (const d of this.dynamic) d.dispose();
        this.dynamic = [];
        // the parts that came and went keep their ids: drop the dead ones so the registry does not grow
        this.pruneEditMeshes();
        this.guardLights();
        this.selectable = new Set(selectableRooms || []);
        // room-token flip: triggered by fresh 'explore' fx entries (not on reconnect)
        const fx = view.fx || [];
        if (this.fxSeen == null) this.fxSeen = fx.length ? fx[fx.length - 1].n : 0;
        else for (const f of fx) if (f.n > this.fxSeen) { this.fxSeen = f.n; if (f.type === 'explore' && this.roomNodes[f.room] && !this.roomNodes[f.room].shell) this.roomNodes[f.room].flip = { phase: 1, t0: this.t }; }
        // every room builds in its own id space: floors and walls under 'room:<id>', the shell and
        // the things that come and go (pods, objects) under their own names, so an edit cannot slip
        // from a floor tile onto a pod that happens to have the same number
        for (const r of Object.values(view.ship.rooms)) this.owner('room:' + r.id + ':dyn', () => this.updateRoom(view, r));
        for (const c of Object.values(view.ship.corridors)) this.owner('cor:' + c.id + ':dyn', () => this.updateCorridor(view, c));
        const techMat = this.M(view.ship.techNoise ? '#f1c40f' : '#3fa9ff', 1);
        for (const n of Object.values(this.roomNodes)) for (const l of n.techLeds) l.material = techMat;
        this.owner('intruders', () => this.updateIntruders(view, intruderNames));
        this.owner('chars', () => this.updateCharacters(view));
        // a build in the game merges its parts away; the editor keeps them all, so this is a no-op there
        this.pruneEditMeshes();
        if (this.alt) this.setAlt(true);
    }

    /** Rebuild the whole board in place — the editor's Nemesis tab (nemesis/client/editor-panel.js)
     *  moves the sizes live. */
    rebuild(view, roomTiles, intruderNames, selectableRooms) {
        this.shipKey = null;
        this.camSized = true;
        this.update(view || this.view, roomTiles || this.roomTiles, intruderNames || [], selectableRooms || []);
        return this;
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
            node.shell = tile ? this.owner('room:' + r.id + ':shell', () => this.buildShell(node, tile)) : null;
            node.shellKey = sk; node.lightsOn = undefined;
            this.syncComputer(node, tile);
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
        this.owner('room:' + r.id + ':obj', () => { for (const o of rs.objects) this.addObject(o.type, node.root, k++, r.id, k - 1); });
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
        root.parent = node.root; root.position.y = FLOOR_Y;   // the cradle stands on the floor plates
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

    /** The Computer of a room is used by clicking its console on the board. The pick box is invisible
     *  (the scene's picks always pass a predicate, and a predicate pick ignores isVisible) and lives
     *  on the room base: a shell is rebuilt whenever its tile changes and would take it along. */
    syncComputer(node, tile) {
        const spots = node.cpuSpots && this.roomTiles && this.roomTiles[tile] && this.roomTiles[tile].computer ? node.cpuSpots : null;
        const key = spots ? spots.map(s => s.x.toFixed(2) + '/' + s.z.toFixed(2) + '/' + s.ry.toFixed(2)).join(',') : '';
        if (node.cpuKey === key) return;
        node.cpuKey = key;
        for (const b of node.cpuBoxes || []) b.dispose();
        node.cpuBoxes = []; node.cpu = null;
        if (!spots) return;
        for (const s of spots) {
            const hit = B().MeshBuilder.CreateBox('cpu', { width: 1.7, height: 2.2, depth: 1.0 }, this.scene);
            hit.parent = node.root; hit.position.set(s.x, 1.12, s.z); hit.rotation.y = s.ry;
            hit.material = this.M('#0b1016', 0, { alpha: 0 });
            hit.isVisible = false; hit.isPickable = true;
            hit.metadata = { roomId: node.data.id, computer: true };
            node.cpuBoxes.push(hit);
            if (!node.cpu) node.cpu = hit;
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
            disc.position.x = x; disc.parent = root; disc.isPickable = false; disc.renderingGroupId = 1;
            disc.material = this.M(ITEM_COLORS[c] || '#9aa7b5', 1);
            const ring = B().MeshBuilder.CreateTorus('ring', { diameter: 0.96, thickness: 0.08, tessellation: 18 }, this.scene);
            ring.position.x = x; ring.parent = root; ring.isPickable = false; ring.renderingGroupId = 1;
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
        // Corridor numbers and the tech-entrance numbers: plain paint by default, neon while Alt is held.
        for (const n of Object.values(this.corridorNodes)) {
            if (n.decal) this.setDecal(n.decal, n.nums.join(' / '), this.alt);
        }
        for (const n of Object.values(this.roomNodes)) {
            if (n.techDecal) this.setDecal(n.techDecal, ((n.data.techNums && n.data.techNums.length) ? n.data.techNums : [4]).join(' / '), this.alt);
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
        // Scorching: a few overlapping angular patches instead of one perfect disc. The old bright
        // orange "light pool" was a flat glowing circle under the flames — from the board camera it
        // read as a painted ring lying on the deck, and it was the ugliest thing in a burning room.
        for (const [dx, dz, d, tess, rot] of [[0, 0, 3.4, 7, 0.2], [0.95, -0.55, 2.1, 6, 1.1], [-1.05, 0.8, 1.7, 6, 2.3]]) {
            const b = cyl(d, d, 0.02, tess, this.M('#171210'));
            b.position.set(FX + dx, FLOOR_Y + 0.005, FZ + dz); b.rotation.y = rot;
        }
        // flames: a tall cluster around the fire with a hotter core, each on its own flicker phase
        for (let i = 0; i < 13; i++) {
            const a = (i / 13) * Math.PI * 2 + Math.random() * 0.4, rad = 0.25 + Math.random() * 1.45;
            const h = 1.5 + Math.random() * 1.5;
            const f = cyl(0, 0.55 + Math.random() * 0.55, h, 6, this.M(i % 3 === 2 ? '#ffc23b' : '#ff7a1a', 1, { alpha: 0.9 }));
            f.position.set(FX + Math.cos(a) * rad, FLOOR_Y + h * 0.42, FZ + Math.sin(a) * rad);
            f.metadata = { fire: 'flame', phase: Math.random() * 6.28 };
        }
        for (let i = 0; i < 5; i++) {
            const h = 1.1 + Math.random() * 0.9;
            const c = cyl(0, 0.4 + Math.random() * 0.3, h, 6, this.M('#fff1b8', 1, { alpha: 0.95 }));
            c.position.set(FX + (Math.random() - 0.5) * 1.0, FLOOR_Y + h * 0.5, FZ + (Math.random() - 0.5) * 1.0);
            c.metadata = { fire: 'flame', phase: Math.random() * 6.28 };
        }
        // embers rising out of the fire, and the smoke that hangs above it
        for (let i = 0; i < 6; i++) {
            const e = add(B().MeshBuilder.CreateSphere('ember', { diameter: 0.12, segments: 3 }, S), this.M('#ffd27a', 1));
            e.position.set(FX + (Math.random() - 0.5) * 2.2, FLOOR_Y + 0.6, FZ + (Math.random() - 0.5) * 2.2);
            e.metadata = { fire: 'ember', phase: Math.random(), y0: FLOOR_Y + 0.6 };
        }
        for (let i = 0; i < 4; i++) {
            const sm = cyl(2.2, 1.0, 1.6, 7, this.M('#2b2320', 0.06, { alpha: 0.22 }));
            sm.position.set(FX + (Math.random() - 0.5) * 1.6, FLOOR_Y + 2.2, FZ + (Math.random() - 0.5) * 1.6);
            sm.metadata = { fire: 'smoke', phase: Math.random(), y0: FLOOR_Y + 2.2 };
        }
        node.fireRoot = root; node.fireParts = parts;
    }
    addObject(type, parent, k, roomId, objIndex) {
        const S = this.scene;
        // objects lie inside the standing zone's outer rim so they are visible next to the figures
        const a = 2.4 + k * 0.7, rad = ZONE_R - 0.4;
        const x = ZONE_C.x + Math.cos(a) * rad, z = ZONE_C.z + Math.sin(a) * rad;
        // The whole object lives in one node standing on the floor plates (FLOOR_Y), so a body lies on
        // the deck instead of sinking half a plate into it.
        const node = new (B().TransformNode)('obj_' + type, S);
        node.parent = parent; node.position.set(x, FLOOR_Y, z); node.rotation.y = a;
        if (type === 'egg') {
            const m = B().MeshBuilder.CreateSphere('egg', { diameter: 0.7, segments: 5 }, S);
            m.parent = node; m.scaling.y = 1.3; m.position.set(0, 0.45, 0); m.material = this.M('#b8a8c8'); m.convertToFlatShadedMesh();
        } else {
            // A real body instead of the coloured slab it used to be: the human corpse, the character's
            // corpse and the intruder carcass have their own lying models (client/characters.js).
            buildBody(S, type === 'carcass' ? 'carcass' : type === 'charCorpse' ? 'charCorpse' : 'corpse', node);
        }
        // Room objects can be clicked to pick them up (nest eggs at k >= 10 are decoration only).
        // The click hits a mesh, not the empty parent, so every part carries the object's metadata.
        const meta = { roomId: roomId || (parent && parent.metadata && parent.metadata.room) || null, objectIndex: objIndex };
        for (const m of node.getChildMeshes()) { m.isPickable = objIndex !== undefined; m.metadata = Object.assign({}, meta); this.dynamic.push(m); }
        node.metadata = Object.assign({}, meta);
        node.isPickable = false;
        this.dynamic.push(node);
    }

    /** Where a room / an intruder sits on screen, for popups anchored above it. */
    screenOf(kind, id) {
        const Bx = B();
        let pos = null;
        if (kind === 'room' && this.roomNodes[id]) pos = this.roomNodes[id].root.position.clone().add(new (Bx.Vector3)(0, 3.6, 0));
        else if (kind === 'intr' && this.intr[id]) pos = this.intr[id].root.position.clone().add(new (Bx.Vector3)(0, 2.3, 0));
        else if (kind === 'cpu' && this.roomNodes[id] && this.roomNodes[id].cpu) pos = this.roomNodes[id].cpu.getAbsolutePosition().clone().add(new (Bx.Vector3)(0, 1.3, 0));
        else if (kind === 'char' && this.chars[id]) pos = this.chars[id].ch.root.getAbsolutePosition().clone().add(new (Bx.Vector3)(0, 2.3, 0));
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
        // The door has no leaves: a sealed doorway is lit by its emergency lamps, a wrecked one is
        // strewn with debris, an open one is simply the arch.
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
            const wasRoom = n.room;
            n.target = this.slotPos(roomPos, k - 1, 'intr'); n.target.y = FLOOR_Y; n.room = it.room;
            if (!n.placed) { n.root.position.copyFrom(n.target); n.placed = true; }
            else if (wasRoom && wasRoom !== it.room) n.route = this.routeTo(wasRoom, it.room);   // crawl the corridor
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
                grab.parent = ch.root; grab.position.y = 1.45; grab.visibility = 0; grab.isPickable = true;
                // the same cylinder is the figure's click target: `grab` only matches my own seat (dragging),
                // `player` matches any seat, so a click on someone else can open his action list.
                grab.metadata = { grab: p.id, player: p.id };
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
            const wasRoom = n.room;
            n.slot = this.slotPos(roomPos, k - 1, 'char'); n.room = p.room;
            n.target = this.posed(n, p.id);
            if (n.target) n.target.y = FLOOR_Y;                 // stand on the floor plates, not inside them
            const firstPlace = !n.placed;
            if (!n.placed) { n.ch.root.position.copyFrom(n.target); n.placed = true; }
            // A move to another room goes through the corridor, not through the hull: the route is the
            // very polyline the tube is built from, from doorway to doorway.
            if (!firstPlace && wasRoom && wasRoom !== p.room) n.route = this.routeTo(wasRoom, p.room);
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
            const pos = n.ch.root.position, stepLen = RUN_SPEED * dt;
            // The route through the corridors first (doorway, bends, doorway), the room slot last.
            let goal = n.target;
            while (n.route && n.route.length) {
                const wp = n.route[0];
                if (Math.hypot(wp.x - pos.x, wp.z - pos.z) <= Math.max(0.25, stepLen)) { n.route.shift(); continue; }
                goal = wp; break;
            }
            const d = goal.subtract(pos); d.y = 0;
            const dist = d.length();
            const moving = dist > 0.05;
            if (moving) {
                Snd.footstep(performance.now());
                if (dist <= stepLen) { pos.x = goal.x; pos.z = goal.z; }
                else { pos.x += d.x / dist * stepLen; pos.z += d.z / dist * stepLen; }
                n.ch.root.rotation.y = Math.atan2(d.x, d.z);          // face the running direction
            } else if (n.faceY != null) n.ch.root.rotation.y += (n.faceY - n.ch.root.rotation.y) * Math.min(1, dt * 6);
            if (n.ch.animate) n.ch.animate(t, moving);
            // picked-up figure floats above the table while dragged, then settles back down
            const lifting = !!this.drag && this.drag.pid === Number(pidKey);
            if (lifting) n.route = null;                                  // the hand carries it straight
            n.lift = (n.lift || 0) + ((lifting ? LIFT_H : 0) - (n.lift || 0)) * Math.min(1, dt * 9);
            pos.y = FLOOR_Y + n.lift;                                      // feet on the floor plates
            if (n.lift > 0.005) n.ch.root.rotation.x = -0.12 * n.lift / LIFT_H;   // slight forward tilt as if held
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
        for (const n of Object.values(this.intr)) if (n.target) {
            let goal = n.target;
            const ip = n.root.position;
            while (n.route && n.route.length) {
                const wp = n.route[0];
                if (Math.hypot(wp.x - ip.x, wp.z - ip.z) <= 0.35) { n.route.shift(); continue; }
                goal = wp; break;
            }
            B().Vector3.LerpToRef(ip, goal, lerp, ip);
            ip.y = FLOOR_Y + Math.abs(Math.sin(t * 3 + ip.x)) * 0.05;   // on the floor, a slight crawl bob
        }
        // Floating labels grow with distance so the board stays readable when zoomed out: room numbers
        // and the Alt overlay names. The corridor numbers are painted on the beams, so they stay put.
        const ls = this.camera.radius > 60 ? this.camera.radius / 60 : 1;
        for (const n of Object.values(this.roomNodes)) {
            n.label.scaling.setAll(ls);
            if (n.altLabel) n.altLabel.scaling.setAll(ls);
        }
    }

    onPointer(pi) {
        if (this.editMode) return;      // the editor picks, drags and turns meshes itself
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
                const c = this.scene.pick(this.scene.pointerX, this.scene.pointerY, m => m.metadata && (m.metadata.intruder || m.metadata.player !== undefined || m.metadata.objectIndex !== undefined || m.metadata.roomId));
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
                // A press on my own figure that never moved is not a drag: it is a click on me, and the
                // list behind it is the confirmation that the figure was picked on purpose.
                const moved = Math.abs(this.scene.pointerX - this.downX) > 4 || Math.abs(this.scene.pointerY - this.downY) > 4;
                const pid = this.drag.pid, pose = this.poses[pid];
                if (moved && this.cb.onPose && pose) this.cb.onPose(pose);
                if (!moved && this.cb.onPlayer) this.cb.onPlayer(pid);
                this.drag = null; this.camera.attachControl(this.canvas, true); this.canvas.style.cursor = '';
                return;
            }
            if (Math.abs(this.scene.pointerX - this.downX) > 4 || Math.abs(this.scene.pointerY - this.downY) > 4) return;
            const px = this.scene.pointerX, py = this.scene.pointerY;
            const pick = this.scene.pick(px, py, m => m.metadata && (m.metadata.intruder || m.metadata.player !== undefined || m.metadata.objectIndex !== undefined || m.metadata.roomId));
            if (!pick || !pick.hit) return;
            const md = pick.pickedMesh.metadata;
            if (md.player !== undefined && this.cb.onPlayer) this.cb.onPlayer(md.player, px, py);
            else if (md.computer && this.cb.onComputer) this.cb.onComputer(md.roomId, px, py);
            else if (md.intruder && this.cb.onIntruder) this.cb.onIntruder(md.intruder, md.roomId, px, py);
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
