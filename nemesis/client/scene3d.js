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
        this.scene.clearColor = new (B().Color4)(0.03, 0.045, 0.07, 1);
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
        for (const r of Object.values(ship.rooms)) this.buildRoom(r);
        for (const c of Object.values(ship.corridors)) this.buildCorridor(ship, c);
    }
    pos(r) { return new (B().Vector3)((r.x - this.cx) * SCALE, 0, -(r.y - this.cy) * SCALE); }

    buildRoom(r) {
        const S = this.scene;
        const root = new (B().TransformNode)('room_' + r.id, S);
        root.position = this.pos(r);
        const plat = B().MeshBuilder.CreateCylinder('plat_' + r.id, { diameter: ROOM_R * 2, height: 0.5, tessellation: 6 }, S);
        plat.parent = root; plat.position.y = -0.25; plat.material = flatMat(S, KIND_COLORS[r.kind] || '#2a3440');
        plat.convertToFlatShadedMesh(); plat.receiveShadows = true;
        plat.metadata = { roomId: r.id }; plat.isPickable = true;
        const rim = B().MeshBuilder.CreateTorus('rim_' + r.id, { diameter: ROOM_R * 2 - 0.3, thickness: 0.25, tessellation: 6 }, S);
        rim.parent = root; rim.position.y = 0.02; rim.material = flatMat(S, '#4a5a6e'); rim.isPickable = false;
        const sel = B().MeshBuilder.CreateTorus('sel_' + r.id, { diameter: ROOM_R * 2 + 0.6, thickness: 0.35, tessellation: 6 }, S);
        sel.parent = root; sel.position.y = 0.05; sel.material = flatMat(S, '#ffb347', { emissive: 1 }); sel.isPickable = false; sel.setEnabled(false);
        // tech hatch
        let hatch = null;
        if (r.tech) {
            hatch = B().MeshBuilder.CreateCylinder('hatch_' + r.id, { diameter: 1.4, height: 0.12, tessellation: 8 }, S);
            hatch.parent = root; hatch.position.set(-ROOM_R * 0.45, 0.06, -ROOM_R * 0.45); hatch.material = flatMat(S, '#6d7f8f'); hatch.isPickable = false;
            const grill = B().MeshBuilder.CreateBox('grill', { width: 1.0, height: 0.06, depth: 0.15 }, S);
            grill.parent = hatch; grill.position.y = 0.08; grill.material = flatMat(S, '#2a3038'); grill.isPickable = false;
        }
        const label = this.makeLabel('lbl_' + r.id, r.id, '', root, 0, 0.3, ROOM_R * 0.62, 2.6);
        this.roomNodes[r.id] = { root, plat, sel, hatch, label, props: null, propsKey: null, data: r };
    }

    buildCorridor(ship, c) {
        const S = this.scene;
        const a = this.pos(ship.rooms[c.a]), bpos = this.pos(ship.rooms[c.b]);
        const dir = bpos.subtract(a); const len = dir.length(); const n = dir.normalize();
        const start = a.add(n.scale(ROOM_R * 0.86)), end = bpos.subtract(n.scale(ROOM_R * 0.86));
        const mid = start.add(end).scale(0.5);
        const l = end.subtract(start).length();
        const root = new (B().TransformNode)('cor_' + c.id, S);
        root.position = mid; root.rotation.y = Math.atan2(n.x, n.z);
        const floor = B().MeshBuilder.CreateBox('corf', { width: 1.6, height: 0.3, depth: l }, S);
        floor.parent = root; floor.position.y = -0.2; floor.material = flatMat(S, '#1f2a36'); floor.isPickable = false; floor.receiveShadows = true;
        for (const s of [-1, 1]) {
            const rail = B().MeshBuilder.CreateBox('rail', { width: 0.18, height: 0.35, depth: l }, S);
            rail.parent = root; rail.position.set(s * 0.85, 0.1, 0); rail.material = flatMat(S, '#3c4c60'); rail.isPickable = false;
        }
        // door frame + panels
        const frame = B().MeshBuilder.CreateBox('frame', { width: 2.2, height: 1.6, depth: 0.25 }, S);
        frame.parent = root; frame.position.y = 0.8; frame.material = flatMat(S, '#55687c'); frame.isPickable = false;
        const hole = B().MeshBuilder.CreateBox('hole', { width: 1.5, height: 1.3, depth: 0.3 }, S);
        hole.parent = root; hole.position.y = 0.65; hole.material = flatMat(S, '#0b1016'); hole.isPickable = false;
        const panels = [];
        for (const s of [-1, 1]) {
            const p = B().MeshBuilder.CreateBox('panel', { width: 0.78, height: 1.3, depth: 0.12 }, S);
            p.parent = root; p.position.set(s * 0.39, 0.65, 0); p.material = flatMat(S, '#8c9aa8'); p.isPickable = false;
            panels.push(p);
        }
        const noise = B().MeshBuilder.CreateCylinder('noise', { diameter: 1.2, height: 0.15, tessellation: 12 }, S);
        noise.parent = root; noise.position.set(0, 0.1, -l * 0.3); noise.material = flatMat(S, '#f1c40f', { emissive: 0.9 }); noise.isPickable = false; noise.setEnabled(false);
        const noiseLabel = this.makeLabel('nl_' + c.id, '!', '', root, 0, 0.9, -l * 0.3, 1.2);
        noiseLabel.setEnabled(false);
        const debris = [];
        for (let i = 0; i < 4; i++) {
            const d = B().MeshBuilder.CreateBox('debris', { width: 0.3, height: 0.1, depth: 0.4 }, S);
            d.parent = root; d.position.set((Math.random() - 0.5) * 1.4, 0.05, (Math.random() - 0.5) * 1.2); d.rotation.y = Math.random() * 3; d.material = flatMat(S, '#6b7a88'); d.isPickable = false; d.setEnabled(false);
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
        const M = (hex, e) => flatMat(S, hex, e ? { emissive: e } : {});
        const bx = (w, h, d, x, y, z, mat, ry = 0) => { const m = B().MeshBuilder.CreateBox('p', { width: w, height: h, depth: d }, S); m.parent = root; m.position.set(x, y, z); m.rotation.y = ry; m.material = mat; m.isPickable = false; this.shadows.addShadowCaster(m); return m; };
        const cy = (dt, db, h, x, y, z, mat, tess = 8) => { const m = B().MeshBuilder.CreateCylinder('p', { diameterTop: dt, diameterBottom: db, height: h, tessellation: tess }, S); m.parent = root; m.position.set(x, y, z); m.material = mat; m.isPickable = false; m.convertToFlatShadedMesh(); this.shadows.addShadowCaster(m); return m; };
        const accent = M(TILE_ACCENT[tile] || '#8a99ab', 0.5);
        const metal = M('#6a7a8a'), dark = M('#2b333d'), panel = M('#3f4f63'), screen = M('#4aa3df', 0.8);
        const computer = () => { bx(1.2, 0.9, 0.5, 2.6, 0.45, -2.2, panel, -0.6); bx(1.0, 0.6, 0.08, 2.6, 1.1, -2.2, screen, -0.6); bx(0.3, 0.5, 0.3, 2.6, 0.25, -2.2, dark, -0.6); };
        if (!explored && !tile) {
            // unexplored: fog-crates + sealed look
            bx(1.2, 1.0, 1.2, 1.2, 0.5, 0.8, dark, 0.3); bx(0.9, 0.8, 0.9, -1.4, 0.4, -0.6, dark, 0.7);
            this.makeLabel('q', '?', '', root, 0, 1.2, 0, 2.0);
            return root;
        }
        switch (tile) {
            case 'cockpit': bx(3.2, 0.5, 1.2, 0, 0.25, 2.2, panel); bx(3.0, 1.2, 0.1, 0, 1.1, 2.7, screen); cy(0.7, 0.7, 0.9, -1, 0.45, 0.6, dark, 6); cy(0.7, 0.7, 0.9, 1, 0.45, 0.6, dark, 6); break;
            case 'hibernatorium': for (let i = 0; i < 4; i++) { const x = -2.4 + i * 1.6; bx(1.0, 0.5, 2.4, x, 0.25, 0, metal); bx(0.9, 0.5, 2.2, x, 0.65, 0, M('#7fc7ff', 0.3)); } break;
            case 'engine': cy(3.0, 3.4, 1.8, 0, 0.9, -0.5, metal, 10); cy(1.6, 2.0, 0.6, 0, 1.0, 1.4, accent, 10); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; bx(0.3, 0.6, 0.3, Math.cos(a) * 2.0, 2.0, Math.sin(a) * 2.0 - 0.5, dark); } break;
            case 'archives': for (let i = 0; i < 3; i++) bx(0.6, 2.0, 2.4, -2.5 + i * 1.3, 1.0, -0.5, panel); computer(); break;
            case 'comms': cy(0.3, 0.6, 3.2, -1.5, 1.6, 0.5, metal, 6); cy(2.2, 0.2, 0.6, -1.5, 3.3, 0.5, accent, 10); computer(); break;
            case 'emergency': bx(2.2, 0.6, 1.0, -0.8, 0.3, 0.8, M('#e8eef3')); bx(0.6, 1.6, 0.6, 1.8, 0.8, 0.8, M('#4fcf7a', 0.3)); bx(0.8, 0.2, 0.8, -0.8, 0.7, 0.8, M('#e05252')); break;
            case 'evacA': case 'evacB': for (const s of [-1, 1]) { cy(1.4, 1.8, 2.0, s * 1.8, 1.0, -1.0, metal, 8); cy(0.6, 1.4, 0.8, s * 1.8, 2.4, -1.0, accent, 8); } bx(2.6, 0.2, 1.0, 0, 0.1, 2.0, M('#e05252', 0.4)); break;
            case 'fireControl': for (let i = 0; i < 3; i++) cy(0.5, 0.5, 1.2, -1.5 + i * 1.0, 0.6, 1.2, M('#e05252'), 8); bx(2.0, 1.4, 0.4, 0, 0.7, -2.0, panel); computer(); break;
            case 'generator': cy(2.4, 2.4, 2.4, 0, 1.2, 0, metal, 8); cy(0.8, 0.8, 0.8, 0, 2.8, 0, accent, 8); for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; bx(0.4, 0.4, 2.0, Math.cos(a) * 1.8, 0.2, Math.sin(a) * 1.8, dark, -a); } computer(); break;
            case 'laboratory': bx(3.2, 0.9, 1.0, 0, 0.45, 1.2, M('#dfe6ee')); cy(0.4, 0.4, 1.0, -1, 1.4, 1.2, M('#4fcf7a', 0.6), 8); cy(0.4, 0.4, 0.7, 0.2, 1.25, 1.2, M('#b26bd6', 0.6), 8); computer(); break;
            case 'nest': for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; cy(0.1, 0.8, 1.2 + (i % 3) * 0.4, Math.cos(a) * 3.3, 0.6, Math.sin(a) * 3.3, M('#3a2a3a'), 5); } cy(3.0, 3.8, 0.3, 0, 0.15, 0, M('#4a2c4a'), 9); break;
            case 'surgery': bx(2.4, 0.8, 1.0, 0, 0.4, 0.6, M('#dfe6ee')); cy(1.2, 1.2, 0.2, 0, 2.6, 0.6, M('#ffffff', 0.9), 8); cy(0.15, 0.15, 1.4, 0, 1.9, 0.6, metal, 6); computer(); break;
            case 'repository': for (let i = 0; i < 4; i++) bx(0.9, 0.9 + (i % 2) * 0.4, 0.9, -2.2 + i * 1.2, 0.45 + (i % 2) * 0.2, 0.8, M('#5a4a30'), i * 0.2); bx(3.0, 1.6, 0.4, 0, 0.8, -2.2, panel); break;
            case 'airlock': cy(3.0, 3.0, 0.2, 0, 0.1, 0.5, M('#e05252', 0.4), 8); bx(2.0, 2.2, 0.3, 0, 1.1, -2.4, metal); computer(); break;
            case 'armory': for (let i = 0; i < 2; i++) bx(2.4, 1.6, 0.4, -1.5 + i * 3.0, 0.8, -1.8, panel); for (let i = 0; i < 5; i++) bx(0.1, 1.0, 0.1, -2.4 + i * 0.45, 1.0, -1.5, dark); bx(1.6, 0.5, 0.8, 0.5, 0.25, 1.2, M('#5a4a30')); break;
            case 'cafeteria': for (const s of [-1, 1]) { bx(2.2, 0.15, 0.9, 0, 0.75, s * 1.4, M('#8b6b4a')); for (let i = 0; i < 3; i++) cy(0.4, 0.4, 0.6, -0.8 + i * 0.8, 0.3, s * 2.2, dark, 6); } break;
            case 'commandCenter': bx(2.6, 0.9, 1.2, 0, 0.45, 0, panel); bx(2.4, 0.3, 1.0, 0, 1.0, 0, screen); bx(1.2, 2.0, 0.2, 0, 1.0, -2.6, screen); computer(); break;
            case 'containment': bx(2.4, 2.4, 2.4, 0, 1.2, 0.2, M('#7fc7ff', 0.2)); bx(2.6, 0.2, 2.6, 0, 0.1, 0.2, metal); bx(2.6, 0.2, 2.6, 0, 2.5, 0.2, metal); break;
            case 'contaminated': for (let i = 0; i < 6; i++) cy(0.3, 0.6, 0.6 + (i % 3) * 0.3, -2 + i * 0.8, 0.3, (i % 2) * 1.6 - 0.8, M('#5a8a2a', 0.4), 5); break;
            case 'decon': for (let i = 0; i < 3; i++) { cy(0.2, 0.2, 2.6, -1.6 + i * 1.6, 1.3, 1.0, metal, 6); cy(0.8, 0.2, 0.4, -1.6 + i * 1.6, 2.6, 1.0, M('#4fcf7a', 0.6), 8); } break;
            case 'engineRoom': for (let i = 0; i < 3; i++) cy(1.0, 1.0, 1.6, -2 + i * 2, 0.8, 0.5, metal, 8); bx(5.0, 0.3, 0.3, 0, 1.8, 0.5, dark); computer(); break;
            case 'hatchControl': for (let i = 0; i < 4; i++) bx(0.6, 0.6, 0.2, -1.5 + i * 1.0, 1.0, 1.5, i % 2 ? M('#4fcf7a', 0.6) : M('#e05252', 0.6)); bx(4.0, 0.6, 0.4, 0, 0.3, 1.5, panel); computer(); break;
            case 'server': for (let i = 0; i < 4; i++) { bx(0.8, 2.2, 1.6, -2.4 + i * 1.6, 1.1, 0.4, dark); bx(0.1, 1.6, 1.2, -1.95 + i * 1.6, 1.1, 0.4, M('#4fcf7a', 0.7)); } computer(); break;
            case 'storage': for (let i = 0; i < 6; i++) bx(1.0, 1.0, 1.0, -2.2 + (i % 3) * 1.4, 0.5 + Math.floor(i / 3) * 0.0, -1.4 + Math.floor(i / 3) * 2.4, M(i % 2 ? '#5a4a30' : '#6a5a40'), i * 0.3); bx(1.0, 1.0, 1.0, -0.8, 1.5, -1.4, M('#5a4a30'), 0.2); break;
        }
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
                n = { ch, label: this.makeLabel('cl', p.name, '', ch.root, 0, 2.4, 0, 2.6), placed: false, colorsKey: null };
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
