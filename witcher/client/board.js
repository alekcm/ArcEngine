// 3D table: the Continent board, location pins, witcher and monster miniatures (OBJ, coloured
// by the game), camera control, move highlights. Pure presentation — it never decides rules.
/* global BABYLON */
import { SCHOOLS } from '/shared/data/rules-data.mjs';
import { MONSTER, LOC } from '/shared/engine/util.mjs';
import { toonMaterial, inkMini } from './toon.js';

// Board pins: pixel coordinates of the location number badges on Игровой стол.jpg.
const PINS = {
    0: [5090, 1758], 1: [3223, 744], 2: [4226, 700], 3: [5170, 575], 4: [5255, 880], 5: [3100, 1312], 6: [3453, 1105],
    7: [4102, 1152], 8: [5059, 1264], 9: [3223, 1735], 10: [4142, 1899], 11: [4958, 1942], 12: [3347, 2212], 13: [3442, 2628],
    14: [4361, 2500], 15: [5347, 2382], 16: [3898, 2919], 17: [4674, 2857], 18: [5293, 2937], 19: [2659, 1873], 20: [2487, 2220], 21: [2706, 2777],
    // «Скеллиге»: the Dagon location (the top circle of his track) and the islands of the event
    // cards, laid on the table to the left of the Skellige strip.
    30: [2232, 430], 31: [1840, 1250], 32: [1840, 1650], 33: [1840, 2050], 34: [1840, 2450], 35: [1840, 2850],
};
/** «Скеллиге»: the divisions of the Dagon track under his location (index 0 = the bottom one). */
const DAGON_TRACK = [[2178, 1300], [2178, 1100], [2178, 905], [2178, 715]];
const pxWorld = ([x, y]) => new BABYLON.Vector3(((x - 2050) / 3375 - 0.5) * MAP_W, 0, (0.5 - (y - 270) / 2725) * MAP_H);
const MAP_W = 16, MAP_H = 16 * 2725 / 3375;
const LOC_NAMES = new Proxy({}, { get: (_, n) => LOC[n] && LOC[n].name });
export const TERRAIN_HEX = { forest: '#3f9a3a', mountain: '#9aa0a8', water: '#2f86cf', joker: '#c49a3a' };

export function pinWorld(n) {
    return pxWorld(PINS[n]);
}

const meshCache = new Map();
async function fetchMesh(key) {
    if (!meshCache.has(key)) meshCache.set(key, fetch('/models/' + key + '.json').then(r => r.ok ? r.json() : null).catch(() => null));
    return meshCache.get(key);
}
function buildMesh(scene, data, name) {
    const m = new BABYLON.Mesh(name, scene);
    const vd = new BABYLON.VertexData();
    // OBJ is right-handed with counter-clockwise front faces; Babylon is left-handed and takes
    // clockwise ones. Mirroring z converts the handedness (the model is not mirrored on screen),
    // and the winding check below covers the rare OBJ exported clockwise.
    const p = data.p.slice();
    for (let k = 2; k < p.length; k += 3) p[k] = -p[k];
    const idx = data.i.slice();
    let vol = 0;
    for (let t = 0; t < idx.length; t += 3) {
        const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
        vol += p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) - p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) + p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c]);
    }
    if (vol > 0) for (let t = 0; t < idx.length; t += 3) { const x = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = x; }
    vd.positions = p;
    vd.indices = idx;
    const normals = [];
    BABYLON.VertexData.ComputeNormals(p, idx, normals);
    vd.normals = normals;
    vd.applyToMesh(m);
    return m;
}

export class Board {
    constructor(canvas, handlers) {
        this.h = handlers;
        this.engine = new BABYLON.Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true, antialias: true });
        const scene = this.scene = new BABYLON.Scene(this.engine);
        scene.clearColor = new BABYLON.Color4(0.05, 0.04, 0.035, 1);
        scene.ambientColor = new BABYLON.Color3(0.3, 0.3, 0.3);
        const cam = this.cam = new BABYLON.ArcRotateCamera('cam', -Math.PI / 2, 0.72, 15.5, new BABYLON.Vector3(0.3, 0, -0.4), scene);
        cam.lowerRadiusLimit = 3.5; cam.upperRadiusLimit = 22;
        cam.lowerBetaLimit = 0.12; cam.upperBetaLimit = 1.25;
        cam.wheelDeltaPercentage = 0.012; cam.panningSensibility = 140; cam.inertia = 0.82; cam.panningInertia = 0.82;
        cam.minZ = 0.1;
        cam.attachControl(canvas, true);
        cam.panningAxis = new BABYLON.Vector3(1, 0, 1);
        cam._panningMouseButton = 2;
        this.camHome = { alpha: cam.alpha, beta: cam.beta, radius: cam.radius, target: cam.target.clone() };

        const hemi = new BABYLON.HemisphericLight('h', new BABYLON.Vector3(0.2, 1, -0.3), scene);
        hemi.intensity = 0.72; hemi.groundColor = new BABYLON.Color3(0.25, 0.2, 0.16);
        hemi.specular = new BABYLON.Color3(0, 0, 0);   // as in the kit (View3D): the glint comes from the sun only
        const sun = this.sun = new BABYLON.DirectionalLight('sun', new BABYLON.Vector3(-0.45, -1, 0.55), scene);
        sun.position = new BABYLON.Vector3(8, 16, -8); sun.intensity = 0.95;
        sun.diffuse = new BABYLON.Color3(1, 0.94, 0.84); sun.specular = new BABYLON.Color3(0.25, 0.25, 0.25);
        this.shadows = new BABYLON.ShadowGenerator(2048, sun);
        this.shadows.useBlurExponentialShadowMap = true; this.shadows.blurKernel = 16; this.shadows.darkness = 0.35;

        this.buildTable();
        this.pins = {};
        this.rings = {};
        for (const n of Object.keys(PINS)) this.buildPin(Number(n));
        this.witchers = {};   // seat -> { root, school }
        this.monsters = {};   // slot -> { root, mon, loc }
        this.markers = {};    // track/hunt markers
        this.moveTargets = new Set();
        this.hover = null;

        scene.onPointerObservable.add((pi) => this.onPointer(pi));
        let t = 0;
        scene.onBeforeRenderObservable.add(() => {
            t += this.engine.getDeltaTime() / 1000;
            for (const n of this.moveTargets) { const r = this.rings[n]; if (r) { const s = 1 + Math.sin(t * 4 + n) * 0.08; r.scaling.set(s, 1, s); } }
            if (this.activeRing && this.activeRing.isEnabled()) this.activeRing.rotation.y = t * 0.8;
        });
        this.initKeyPan();
        this.engine.runRenderLoop(() => scene.render());
        window.addEventListener('resize', () => this.engine.resize());
        canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    buildTable() {
        const scene = this.scene;
        // Wooden table: procedural planks.
        const tex = new BABYLON.DynamicTexture('wood', { width: 1024, height: 1024 }, scene, true);
        const g = tex.getContext();
        for (let i = 0; i < 8; i++) {
            const y = i * 128;
            const hue = 22 + (i % 3) * 3;
            g.fillStyle = `hsl(${hue},35%,${13 + (i % 2) * 3}%)`; g.fillRect(0, y, 1024, 128);
            for (let k = 0; k < 60; k++) {
                g.strokeStyle = `hsla(${hue},40%,${8 + Math.random() * 10}%,.35)`; g.lineWidth = 1 + Math.random() * 2;
                g.beginPath(); const yy = y + Math.random() * 128; g.moveTo(0, yy);
                for (let x = 0; x <= 1024; x += 64) g.lineTo(x, yy + Math.sin(x / 90 + k) * 4);
                g.stroke();
            }
            g.fillStyle = '#0008'; g.fillRect(0, y, 1024, 3);
        }
        tex.update();
        tex.uScale = 4; tex.vScale = 4;
        const table = BABYLON.MeshBuilder.CreateGround('table', { width: 70, height: 70 }, scene);
        table.position.y = -0.12;
        const tm = new BABYLON.StandardMaterial('tm', scene);
        tm.diffuseTexture = tex; tm.specularColor = new BABYLON.Color3(0.05, 0.04, 0.03);
        table.material = tm; table.receiveShadows = true; table.isPickable = false;

        // Board slab with the Continent image.
        const slab = BABYLON.MeshBuilder.CreateBox('slab', { width: MAP_W + 0.5, depth: MAP_H + 0.5, height: 0.12 }, scene);
        slab.position.y = -0.065;
        const sm = new BABYLON.StandardMaterial('sm', scene);
        sm.diffuseColor = new BABYLON.Color3(0.13, 0.11, 0.09); sm.specularColor = new BABYLON.Color3(0, 0, 0);
        slab.material = sm; slab.receiveShadows = true; slab.isPickable = false;
        const map = this.map = BABYLON.MeshBuilder.CreateGround('map', { width: MAP_W, height: MAP_H }, scene);
        map.position.y = 0.0;
        const mm = new BABYLON.StandardMaterial('mm', scene);
        const mt = new BABYLON.Texture('assets/continent.jpg', scene, false, true, BABYLON.Texture.TRILINEAR_SAMPLINGMODE);
        mt.anisotropicFilteringLevel = 8;
        mm.diffuseTexture = mt; mm.specularColor = new BABYLON.Color3(0.06, 0.06, 0.06);
        map.material = mm; map.receiveShadows = true; map.isPickable = true;
        this.shadows.getShadowMap().refreshRate = 1;
    }

    buildPin(n) {
        const scene = this.scene;
        const p = pinWorld(n);
        const disc = BABYLON.MeshBuilder.CreateCylinder('pin' + n, { diameter: 0.95, height: 0.02, tessellation: 24 }, scene);
        disc.position = p.add(new BABYLON.Vector3(0, 0.01, 0.25));
        disc.visibility = 0.0001; disc.isPickable = true; disc.metadata = { loc: n };
        this.pins[n] = disc;
        const ring = BABYLON.MeshBuilder.CreateTorus('ring' + n, { diameter: 0.62, thickness: 0.05, tessellation: 40 }, scene);
        ring.position = p.add(new BABYLON.Vector3(0, 0.03, 0));
        const rm = new BABYLON.StandardMaterial('rm' + n, scene);
        rm.emissiveColor = new BABYLON.Color3(0.55, 0.95, 0.4); rm.diffuseColor = new BABYLON.Color3(0, 0, 0); rm.disableLighting = true; rm.alpha = 0.9;
        ring.material = rm; ring.isPickable = false; ring.setEnabled(false);
        this.rings[n] = ring;
    }

    onPointer(pi) {
        if (pi.type === BABYLON.PointerEventTypes.POINTERMOVE) {
            const pick = this.scene.pick(this.scene.pointerX, this.scene.pointerY, m => !!(m.metadata && m.metadata.loc != null));
            const loc = pick && pick.hit ? pick.pickedMesh.metadata.loc : null;
            if (loc !== this.hover) {
                this.hover = loc;
                this.scene.getEngine().getRenderingCanvas().style.cursor = loc != null && this.moveTargets.has(loc) ? 'pointer' : '';
            }
            this.h.onHover && this.h.onHover(loc, pi.event.clientX, pi.event.clientY);
        } else if (pi.type === BABYLON.PointerEventTypes.POINTERTAP && pi.event.button === 0) {
            const pick = this.scene.pick(this.scene.pointerX, this.scene.pointerY, m => !!(m.metadata && m.metadata.loc != null));
            if (pick && pick.hit) this.h.onClick && this.h.onClick(pick.pickedMesh.metadata.loc);
        }
    }

    setMoveTargets(list, activeLoc) {
        for (const n of this.moveTargets) this.rings[n].setEnabled(false);
        this.moveTargets = new Set(list);
        for (const n of list) this.rings[n].setEnabled(true);
        if (!this.activeRing) {
            const r = this.activeRing = BABYLON.MeshBuilder.CreateTorus('active', { diameter: 0.86, thickness: 0.035, tessellation: 6 }, this.scene);
            const m = new BABYLON.StandardMaterial('am', this.scene);
            m.emissiveColor = new BABYLON.Color3(1, 0.78, 0.3); m.disableLighting = true; r.material = m; r.isPickable = false;
        }
        if (activeLoc == null) this.activeRing.setEnabled(false);
        else { this.activeRing.setEnabled(true); this.activeRing.position = pinWorld(activeLoc).add(new BABYLON.Vector3(0, 0.03, 0.45)); }
    }

    /** Spots around a location: witchers on a small arc north of the badge, the monster to the east. */
    spot(loc, idx, count) {
        const base = pinWorld(loc).add(new BABYLON.Vector3(0, 0, 0.45));
        if (count <= 1) return base;
        const a = (idx - (count - 1) / 2) * 0.55;
        return base.add(new BABYLON.Vector3(a, 0, Math.abs(a) * -0.25));
    }

    async makeModel(key, color, height, name) {
        const data = await fetchMesh(key);
        const root = new BABYLON.TransformNode(name, this.scene);
        // Wide monsters (dogs, griffins) are fitted by their largest dimension, not height.
        const scale = data ? height / Math.max(1, data.w || 1, data.d || 1) : height;
        const foot = data ? Math.max(data.w || 0.6, data.d || 0.6) * scale : height * 0.6;
        // Coloured rim under the miniature's own base; the model sits slightly above it to avoid
        // z-fighting between the two discs.
        const base = BABYLON.MeshBuilder.CreateCylinder(name + 'base', { diameter: foot * 1.05 + 0.08, height: 0.03, tessellation: 40 }, this.scene);
        base.position.y = 0.015; base.parent = root; base.isPickable = false;
        const bm = new BABYLON.StandardMaterial(name + 'bm', this.scene);
        bm.diffuseColor = BABYLON.Color3.FromHexString(color).scale(0.8); bm.specularColor = new BABYLON.Color3(0.2, 0.2, 0.2);
        base.material = bm;
        this.shadows.addShadowCaster(base);
        let model = null;
        if (data) {
            model = buildMesh(this.scene, data, name + 'm');
            model.parent = root; model.position.y = 0.034;
            model.scaling.setAll(scale);
            model.isPickable = false;
            model.material = toonMaterial(this.scene, name + 'mm', color);
            inkMini(model, height);
            this.shadows.addShadowCaster(model);
            model.receiveShadows = true;
        }
        return { root, model, base };
    }

    async syncWitchers(players) {
        const byLoc = {};
        for (const p of players) (byLoc[p.loc] = byLoc[p.loc] || []).push(p.seat);
        for (const p of players) {
            let w = this.witchers[p.seat];
            if (!w) {
                w = this.witchers[p.seat] = { loading: true, loc: p.loc };
                const school = SCHOOLS[p.school];
                const made = await this.makeModel('w-' + p.school, school.color, 0.95, 'w' + p.seat);
                Object.assign(w, made, { loading: false });
                w.root.position = this.spot(p.loc, byLoc[p.loc].indexOf(p.seat), byLoc[p.loc].length);
            }
        }
        for (const p of players) {
            const w = this.witchers[p.seat];
            if (!w || w.loading) continue;
            const target = this.spot(p.loc, byLoc[p.loc].indexOf(p.seat), byLoc[p.loc].length);
            if (w.loc !== p.loc) { this.hop(w.root, target); w.loc = p.loc; }
            else if (BABYLON.Vector3.Distance(w.root.position, target) > 0.01) this.slide(w.root, target);
        }
    }

    hop(node, to) {
        const from = node.position.clone();
        const dur = 0.75;
        let t = 0;
        const obs = this.scene.onBeforeRenderObservable.add(() => {
            t += this.engine.getDeltaTime() / 1000 / dur;
            const k = Math.min(1, t), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
            node.position = BABYLON.Vector3.Lerp(from, to, e);
            node.position.y = Math.sin(k * Math.PI) * 0.8;
            if (k >= 1) { node.position = to.clone(); this.scene.onBeforeRenderObservable.remove(obs); }
        });
    }
    slide(node, to) {
        const from = node.position.clone(); let t = 0;
        const obs = this.scene.onBeforeRenderObservable.add(() => {
            t += this.engine.getDeltaTime() / 300;
            node.position = BABYLON.Vector3.Lerp(from, to, Math.min(1, t));
            if (t >= 1) this.scene.onBeforeRenderObservable.remove(obs);
        });
    }

    async syncMonsters(slots) {
        for (let i = 0; i < slots.length; i++) {
            const s = slots[i];
            const cur = this.monsters[i];
            const loc = s.mon ? s.token : null;
            if (cur && (cur.mon !== s.mon || cur.loc !== loc)) {
                if (cur.root) this.vanish(cur.root);
                delete this.monsters[i];
            }
            if (s.mon && loc != null && !this.monsters[i]) {
                const m = this.monsters[i] = { mon: s.mon, loc, loading: true };
                const made = await this.makeModel(s.mon, '#8a7a6a', 0.85 + 0.12 * MONSTER[s.mon].level, 'm' + i);
                if (this.monsters[i] !== m) { made.root.dispose(); continue; }
                Object.assign(m, made, { loading: false, baseRot: Math.PI * 0.85 });
                made.base.material.diffuseColor = BABYLON.Color3.FromHexString(TERRAIN_HEX[s.terrain]);
                if (made.model) made.model.material.diffuseColor = new BABYLON.Color3(0.36, 0.3, 0.27);
                const p = pinWorld(loc).add(new BABYLON.Vector3(0.75, 0, 0.3));
                made.root.position = p;
                this.appear(made.root);
            }
        }
    }
    /** «Легендарная охота»: the legendary monster's figure (larger, a golden base); slides when it moves. */
    async syncLegend(L) {
        const cur = this.legend;
        if (!L) { if (cur && cur.root) this.vanish(cur.root); this.legend = null; return; }
        const at = () => pinWorld(L.loc).add(new BABYLON.Vector3(-0.55, 0, 0.3));
        if (cur && cur.mon === L.mon) {
            if (cur.loc !== L.loc && cur.root) { cur.loc = L.loc; this.slide(cur.root, at()); }
            cur.loc = L.loc;
            return;
        }
        if (cur && cur.loading) return;
        const m = this.legend = { mon: L.mon, loc: L.loc, loading: true };
        const made = await this.makeModel(L.mon, '#8a6a3a', 0.8, 'legend');
        if (this.legend !== m) { made.root.dispose(); return; }
        Object.assign(m, made, { loading: false, baseRot: Math.PI * 0.85 });
        made.base.material.diffuseColor = BABYLON.Color3.FromHexString('#8c6a2a');
        if (made.model) made.model.material.diffuseColor = new BABYLON.Color3(0.62, 0.5, 0.38);
        made.root.position = pinWorld(m.loc).add(new BABYLON.Vector3(-0.55, 0, 0.3));
        this.appear(made.root);
    }
    appear(node) {
        let t = 0; node.scaling.setAll(0.01);
        const obs = this.scene.onBeforeRenderObservable.add(() => {
            t += this.engine.getDeltaTime() / 500;
            const k = Math.min(1, t); const e = 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2);
            node.scaling.setAll(Math.max(0.01, e));
            if (k >= 1) { node.scaling.setAll(1); this.scene.onBeforeRenderObservable.remove(obs); }
        });
    }
    vanish(node) {
        let t = 0;
        const obs = this.scene.onBeforeRenderObservable.add(() => {
            t += this.engine.getDeltaTime() / 400;
            node.scaling.setAll(Math.max(0.01, 1 - t)); node.position.y = t * 0.6;
            if (t >= 1) { this.scene.onBeforeRenderObservable.remove(obs); node.dispose(); }
        });
    }

    /** «Скеллиге»: ships, Dagon on his track or in his location, Сирена, the event islands. */
    async syncSkellige(sk) {
        const st = this.sk || (this.sk = { ships: [], tiles: {}, mini: null, marker: null });
        for (const n of [30, 31, 32, 33, 34, 35]) if (this.pins[n]) this.pins[n].isPickable = !!sk && (n === 30 || sk.islands.includes(n));
        if (!sk) return;
        // Ships: a little longship next to the badge; slides from port to island.
        while (st.ships.length < sk.ships.length) st.ships.push({ node: this.makeShip('ship' + st.ships.length), loc: null });
        const at = (loc) => pinWorld(loc).add(new BABYLON.Vector3(-0.62, 0, -0.32));
        const left = sk.ships.slice(), free = [];
        for (const s of st.ships) { const i = left.indexOf(s.loc); if (i >= 0) left.splice(i, 1); else free.push(s); }
        for (const s of free) {
            const to = left.shift();
            if (s.loc == null) s.node.position = at(to); else this.slide(s.node, at(to));
            s.loc = to;
        }
        // The event islands: a parchment tile with the island's name.
        for (const n of sk.islands) if (!st.tiles[n]) { st.tiles[n] = this.makeIslandTile(n); this.appear(st.tiles[n]); }
        // Dagon: a token on the track, the miniature when he is up; otherwise Сирена (if in play).
        const up = sk.track >= DAGON_TRACK.length;
        if (!st.marker) {
            const c = st.marker = BABYLON.MeshBuilder.CreateCylinder('dagonTok', { diameter: 0.34, height: 0.07, tessellation: 24 }, this.scene);
            const m = new BABYLON.StandardMaterial('dagonTokM', this.scene);
            m.diffuseColor = BABYLON.Color3.FromHexString('#2a7f86'); m.emissiveColor = BABYLON.Color3.FromHexString('#2a7f86').scale(0.3);
            c.material = m; c.isPickable = false; this.shadows.addShadowCaster(c);
        }
        st.marker.setEnabled(!up);
        if (!up) { const p = pxWorld(DAGON_TRACK[sk.track]).add(new BABYLON.Vector3(0, 0.04, 0)); if (st.track == null) st.marker.position = p; else if (st.track !== sk.track) this.slide(st.marker, p); }
        st.track = sk.track;
        const want = up ? 'DAGON' : sk.siren ? 'MON-31' : null;
        if (st.mini && st.mini.mon !== want) { if (st.mini.root) this.vanish(st.mini.root); st.mini = null; }
        if (want && !st.mini) {
            const m = st.mini = { mon: want, loading: true };
            const made = await this.makeModel(want, '#3a6a6a', want === 'DAGON' ? 1.2 : 0.85, 'skmini');
            if (st.mini !== m) { made.root.dispose(); return; }
            Object.assign(m, made, { loading: false });
            made.base.material.diffuseColor = BABYLON.Color3.FromHexString('#2a6f86');
            if (made.model) made.model.material.diffuseColor = new BABYLON.Color3(0.3, 0.42, 0.44);
            made.root.position = pinWorld(30).add(new BABYLON.Vector3(0.55, 0, 0.1));
            this.appear(made.root);
        }
    }
    makeShip(name) {
        const root = new BABYLON.TransformNode(name, this.scene);
        const wood = new BABYLON.StandardMaterial(name + 'w', this.scene);
        wood.diffuseColor = new BABYLON.Color3(0.42, 0.27, 0.14); wood.specularColor = new BABYLON.Color3(0.05, 0.05, 0.05);
        const sail = new BABYLON.StandardMaterial(name + 's', this.scene);
        sail.diffuseColor = new BABYLON.Color3(0.78, 0.2, 0.16); sail.specularColor = new BABYLON.Color3(0, 0, 0); sail.backFaceCulling = false;
        const hull = BABYLON.MeshBuilder.CreateCylinder(name + 'h', { diameterTop: 0.2, diameterBottom: 0.1, height: 0.62, tessellation: 12 }, this.scene);
        hull.rotation.z = Math.PI / 2; hull.scaling.z = 0.75; hull.position.y = 0.07; hull.parent = root; hull.material = wood;
        for (const s of [-1, 1]) {
            const prow = BABYLON.MeshBuilder.CreateCylinder(name + 'p' + s, { diameterTop: 0, diameterBottom: 0.07, height: 0.16, tessellation: 8 }, this.scene);
            prow.position = new BABYLON.Vector3(s * 0.33, 0.14, 0); prow.rotation.z = -s * 0.5; prow.parent = root; prow.material = wood;
        }
        const mast = BABYLON.MeshBuilder.CreateCylinder(name + 'm', { diameter: 0.025, height: 0.5, tessellation: 6 }, this.scene);
        mast.position.y = 0.36; mast.parent = root; mast.material = wood;
        const cloth = BABYLON.MeshBuilder.CreatePlane(name + 'c', { width: 0.34, height: 0.26 }, this.scene);
        cloth.position = new BABYLON.Vector3(0, 0.42, 0.02); cloth.rotation.y = Math.PI / 2; cloth.parent = root; cloth.material = sail;
        for (const m of [hull, mast, cloth]) { m.isPickable = false; this.shadows.addShadowCaster(m); }
        root.rotation.y = -0.3;
        root.scaling.setAll(1.7);
        return root;
    }
    makeIslandTile(n) {
        const tex = new BABYLON.DynamicTexture('isl' + n, { width: 512, height: 256 }, this.scene, true);
        const g = tex.getContext();
        g.fillStyle = '#1d3440'; g.fillRect(0, 0, 512, 256);
        g.strokeStyle = '#c8b27a'; g.lineWidth = 10; g.strokeRect(6, 6, 500, 244);
        g.fillStyle = '#4f6a3a'; g.beginPath(); g.ellipse(150, 140, 110, 60, -0.2, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#e8dcc0'; g.font = 'bold 44px serif'; g.textAlign = 'center';
        g.fillText(LOC_NAMES[n] || '', 330, 120);
        g.font = '34px serif'; g.fillText(String(n), 330, 180);
        tex.update();
        const tile = BABYLON.MeshBuilder.CreateGround('tile' + n, { width: 1.9, height: 0.95 }, this.scene);
        const m = new BABYLON.StandardMaterial('tilem' + n, this.scene);
        m.diffuseTexture = tex; m.specularColor = new BABYLON.Color3(0, 0, 0);
        tile.material = m; tile.isPickable = false; tile.receiveShadows = true;
        tile.position = pinWorld(n).add(new BABYLON.Vector3(-0.35, 0.005, 0.1));
        return tile;
    }

    /** Hunt markers: a small coin-like token on each location with gold from a hunt. */
    syncMarkers(list) {
        const keep = new Set();
        for (const mk of list) {
            const key = mk.key; keep.add(key);
            if (this.markers[key]) continue;
            // Hunting quests: a round token; event quests: a square token (like the cardboard ones).
            // Vulnerability tokens: a thicker hexagon on the other side of the location pin.
            const c = BABYLON.MeshBuilder.CreateCylinder('mk' + key, { diameter: mk.ruin ? 0.36 : mk.vuln ? 0.34 : mk.quest ? 0.3 : 0.26, height: mk.ruin ? 0.09 : mk.vuln ? 0.08 : 0.05, tessellation: mk.ruin ? 9 : mk.vuln ? 6 : mk.quest ? 4 : 24 }, this.scene);
            const m = new BABYLON.StandardMaterial('mkm' + key, this.scene);
            m.diffuseColor = BABYLON.Color3.FromHexString(mk.color); m.emissiveColor = BABYLON.Color3.FromHexString(mk.color).scale(0.25);
            c.material = m; c.isPickable = false;
            c.position = pinWorld(mk.loc).add(mk.ruin ? new BABYLON.Vector3(0.05, 0.045, 0.45) : mk.vuln ? new BABYLON.Vector3(0.42, 0.04, -0.05) : new BABYLON.Vector3(-0.42 + (mk.i || 0) * 0.14, 0.03 + (mk.i || 0) * 0.05, -0.05));
            this.shadows.addShadowCaster(c);
            this.markers[key] = c;
        }
        for (const k of Object.keys(this.markers)) if (!keep.has(k)) { this.markers[k].dispose(); delete this.markers[k]; }
    }

    /** WASD (any keyboard layout: physical keys) pans the camera over the table, RTS style. */
    initKeyPan() {
        const held = new Set();
        const PAN = { KeyW: [0, 1], KeyS: [0, -1], KeyA: [-1, 0], KeyD: [1, 0] };
        const typing = (e) => e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');
        window.addEventListener('keydown', (e) => { if (PAN[e.code] && !typing(e) && !e.ctrlKey && !e.metaKey && !e.altKey) held.add(e.code); });
        window.addEventListener('keyup', (e) => held.delete(e.code));
        window.addEventListener('blur', () => held.clear());
        this.panHeld = held;
        let vx = 0, vz = 0;
        this.scene.onBeforeRenderObservable.add(() => {
            const cam = this.cam, dt = Math.min(0.1, this.engine.getDeltaTime() / 1000);
            let f = 0, r = 0;
            for (const k of held) { f += PAN[k][1]; r += PAN[k][0]; }
            const speed = 0.55 * cam.radius;             // world units per second, faster when zoomed out
            const fx = -Math.cos(cam.alpha), fz = -Math.sin(cam.alpha);
            const rx = -Math.sin(cam.alpha), rz = Math.cos(cam.alpha);
            const tx = (f * fx + r * rx) * speed, tz = (f * fz + r * rz) * speed;
            const a = 1 - Math.exp(-dt * 14);           // short ease in/out
            vx += (tx - vx) * a; vz += (tz - vz) * a;
            if (Math.abs(vx) + Math.abs(vz) < 1e-3) { vx = vz = 0; return; }
            if ((f || r) && this.focusObs) { this.scene.onBeforeRenderObservable.remove(this.focusObs); this.focusObs = null; }
            cam.target.x = Math.max(-10, Math.min(10, cam.target.x + vx * dt));
            cam.target.z = Math.max(-7.5, Math.min(7.5, cam.target.z + vz * dt));
        });
    }

    focus(loc, radius = 7.5) {
        // Own tween: assigning cam.target would recompute alpha/beta/radius from the position.
        const cam = this.cam;
        const to = {
            target: loc == null ? this.camHome.target.clone() : pinWorld(loc).add(new BABYLON.Vector3(0, 0, 0.3)),
            radius: loc == null ? this.camHome.radius : radius,
            alpha: loc == null ? this.camHome.alpha : cam.alpha,
            beta: loc == null ? this.camHome.beta : Math.min(cam.beta, 0.95),
        };
        const from = { target: cam.target.clone(), radius: cam.radius, alpha: cam.alpha, beta: cam.beta };
        if (this.focusObs) this.scene.onBeforeRenderObservable.remove(this.focusObs);
        let t = 0;
        this.focusObs = this.scene.onBeforeRenderObservable.add(() => {
            t = Math.min(1, t + this.engine.getDeltaTime() / 650);
            const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
            cam.target.copyFrom(BABYLON.Vector3.Lerp(from.target, to.target, e));
            cam.radius = from.radius + (to.radius - from.radius) * e;
            cam.alpha = from.alpha + (to.alpha - from.alpha) * e;
            cam.beta = from.beta + (to.beta - from.beta) * e;
            if (t >= 1) { this.scene.onBeforeRenderObservable.remove(this.focusObs); this.focusObs = null; }
        });
    }

    toScreen(loc) {
        const p = pinWorld(loc);
        const v = BABYLON.Vector3.Project(p, BABYLON.Matrix.Identity(), this.scene.getTransformMatrix(), this.cam.viewport.toGlobal(this.engine.getRenderWidth(), this.engine.getRenderHeight()));
        const k = this.engine.getHardwareScalingLevel();
        return { x: v.x * k, y: v.y * k };
    }
}

/** Preview of one witcher miniature (lobby); turned by dragging, never by itself. */
export class Preview {
    constructor(canvas) {
        this.engine = new BABYLON.Engine(canvas, true, { antialias: true });
        const s = this.scene = new BABYLON.Scene(this.engine);
        s.clearColor = new BABYLON.Color4(0, 0, 0, 0);
        const cam = new BABYLON.ArcRotateCamera('pc', -Math.PI / 2, 1.25, 2.2, new BABYLON.Vector3(0, 0.45, 0), s);
        cam.attachControl(canvas, true); cam.lowerRadiusLimit = 1.2; cam.upperRadiusLimit = 4; cam.wheelDeltaPercentage = 0.02;
        const h = new BABYLON.HemisphericLight('h', new BABYLON.Vector3(0, 1, 0), s); h.intensity = 0.6; h.specular = new BABYLON.Color3(0, 0, 0);
        const d = new BABYLON.DirectionalLight('d', new BABYLON.Vector3(-0.5, -0.8, 0.6), s); d.intensity = 1.6;
        const d2 = new BABYLON.DirectionalLight('d2', new BABYLON.Vector3(0.7, -0.2, -0.6), s); d2.intensity = 0.5; d2.diffuse = new BABYLON.Color3(1, 0.8, 0.55);
        this.node = null; this.key = null; this.pm = null;
        this.engine.runRenderLoop(() => s.render());
        window.addEventListener('resize', () => this.engine.resize());
    }
    async show(school) {
        if (this.key === school) return;
        this.key = school;
        const data = await fetchMesh('w-' + school);
        if (this.key !== school) return;
        if (this.node) this.node.dispose();
        const root = new BABYLON.TransformNode('pv', this.scene);
        if (data) {
            const m = buildMesh(this.scene, data, 'pvm');
            m.parent = root;
            m.material = toonMaterial(this.scene, 'pvmat', SCHOOLS[school].color);
            inkMini(m, 1);
            this.pm = m;
        }
        this.node = root;
    }
}
