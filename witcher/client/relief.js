// Relief of the board (the nemesis approach: the board is built, not printed). A region of the
// Continent becomes a real landscape: the painted mountains rise as a height field (relief-height.mjs
// reads it from the painting itself, so the 3D slopes stand exactly where the artist drew them),
// low-poly firs grow where the forest is painted, and a location gets its building in 3D —
// flat-shaded primitives merged per material, toon lighting and ink edges like the miniatures.
// The painted building under the 3D one is painted over (inpaint) so it does not show twice.
//
// The first region is Kaer Morhen (location 3) with the mountains around it; more regions are
// entries of REGIONS. Pure presentation: no rule reads anything from here.
/* global BABYLON */
import { heightField, sample, isForest, inpaint } from './relief-height.mjs';
import { toonMaterial, inkMini } from './toon.js';

/** Regions of continent.jpg (image pixels: 4096 × 3307) that are built in 3D. */
export const REGIONS = [{
    id: 'kaer-morhen',
    px: [2900, 0, 1196, 900],              // x, y, width, height in image pixels
    step: 3,                               // pixels per grid cell of the terrain mesh
    maxH: 0.5,                             // the highest peak, world units (a miniature is 0.95)
    open: { top: true, right: true },      // sides that are the edge of the board
    // The castle: where the painted one stands (image pixels), the terrace it is built on and
    // the ellipse of the painting that is covered by it.
    castle: { x: 3585, y: 236, r: 52, h: 0.2, hole: { x: 3606, y: 200, rx: 104, ry: 102 }, scale: 1.1, rot: 0.12 },
}];

export class Relief {
    /**
     * @param {BABYLON.Scene} scene
     * @param {BABYLON.ShadowGenerator} shadows
     * @param {{ mapW: number, mapH: number, url: string, pins: number[][] }} o  pins — image pixels
     *   of every location badge (their plates and miniature spots are kept level)
     */
    constructor(scene, shadows, o) {
        this.scene = scene; this.shadows = shadows; this.o = o;
        this.parts = [];   // { reg, field, w, h }
        this.ready = this.load().catch((e) => { console.error('relief', e); });
    }

    async load() {
        const img = new Image();
        img.src = this.o.url;
        await img.decode();
        this.imgW = img.naturalWidth; this.imgH = img.naturalHeight;
        for (const reg of REGIONS) this.buildRegion(img, reg);
    }

    /** Image pixel -> world (the map plane spans the whole image). */
    world(ix, iy, y = 0) {
        return new BABYLON.Vector3((ix / this.imgW - 0.5) * this.o.mapW, y, (0.5 - iy / this.imgH) * this.o.mapH);
    }
    /** World -> image pixel. */
    pixel(x, z) {
        return [(x / this.o.mapW + 0.5) * this.imgW, (0.5 - z / this.o.mapH) * this.imgH];
    }

    /** Terrain height at a world point (0 on the flat board). */
    heightAt(x, z) {
        if (!this.parts.length) return 0;
        const [ix, iy] = this.pixel(x, z);
        for (const p of this.parts) {
            const [x0, y0] = p.reg.px;
            const lx = ix - x0, ly = iy - y0;
            if (lx >= 0 && ly >= 0 && lx <= p.w - 1 && ly <= p.h - 1) return sample(p.field, p.w, p.h, lx, ly);
        }
        return 0;
    }

    buildRegion(img, reg) {
        const S = this.scene;
        const [x0, y0, w, h] = reg.px;
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        const g = cv.getContext('2d', { willReadFrequently: true });
        g.drawImage(img, x0, y0, w, h, 0, 0, w, h);
        const id = g.getImageData(0, 0, w, h);
        const px = id.data;
        const rgba = new Uint8ClampedArray(px);   // the untouched painting: heights and forests read it

        // Level zones: each location badge with its terrain icon and the miniatures' spot above it,
        // and its name banner to the left (grey-lilac: the rock mask would lift it otherwise).
        const flat = [];
        for (const [bx, by] of this.o.pins) {
            const lx = bx - x0, ly = by - y0;
            if (lx < -260 || ly < -260 || lx > w + 260 || ly > h + 260) continue;
            flat.push({ x: lx, y: ly - 60, rx: 110, ry: 110 }, { x: lx - 185, y: ly - 52, rx: 140, ry: 40 });
        }
        const c = reg.castle;
        const field = heightField(rgba, w, h, {
            maxH: reg.maxH, flat, open: reg.open,
            plateau: c ? { x: c.x - x0, y: c.y - y0, r: c.r, h: c.h } : null,
        });
        this.parts.push({ reg, field, w, h });

        // Paint over the painted castle: the 3D one stands there.
        if (c && c.hole) {
            const mask = new Uint8Array(w * h);
            const hx = c.hole.x - x0, hy = c.hole.y - y0;
            for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (Math.hypot((x - hx) / c.hole.rx, (y - hy) / c.hole.ry) < 1) mask[y * w + x] = 1;
            inpaint(px, w, h, mask);
            g.putImageData(id, 0, 0);
        }

        // --- the terrain mesh ---------------------------------------------------------------
        const st = reg.step, gw = Math.floor((w - 1) / st) + 1, gh = Math.floor((h - 1) / st) + 1;
        const pos = new Float32Array(gw * gh * 3), uv = new Float32Array(gw * gh * 2);
        for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
            const lx = Math.min(w - 1, i * st), ly = Math.min(h - 1, j * st), k = j * gw + i;
            const p = this.world(x0 + lx, y0 + ly, field[ly * w + lx]);
            pos[k * 3] = p.x; pos[k * 3 + 1] = p.y; pos[k * 3 + 2] = p.z;
            uv[k * 2] = lx / (w - 1); uv[k * 2 + 1] = 1 - ly / (h - 1);
        }
        const idx = new Uint32Array((gw - 1) * (gh - 1) * 6);
        let t = 0;
        for (let j = 0; j < gh - 1; j++) for (let i = 0; i < gw - 1; i++) {
            const a = j * gw + i, b = a + 1, d = a + gw, e = d + 1;
            // rows go south (−z), columns east (+x): (a, b, d) is clockwise seen from above
            idx[t++] = a; idx[t++] = b; idx[t++] = d;
            idx[t++] = b; idx[t++] = e; idx[t++] = d;
        }
        const nrm = new Float32Array(pos.length);
        BABYLON.VertexData.ComputeNormals(pos, idx, nrm);
        if (nrm[1] < 0) {   // winding check: the normals of a flat corner must look up
            for (let q = 0; q < idx.length; q += 3) { const x = idx[q + 1]; idx[q + 1] = idx[q + 2]; idx[q + 2] = x; }
            BABYLON.VertexData.ComputeNormals(pos, idx, nrm);
        }
        const vd = new BABYLON.VertexData();
        vd.positions = pos; vd.indices = idx; vd.normals = nrm; vd.uvs = uv;
        const mesh = new BABYLON.Mesh('relief_' + reg.id, S);
        vd.applyToMesh(mesh);
        const tex = new BABYLON.DynamicTexture('reliefTex_' + reg.id, cv, S, true, BABYLON.Texture.TRILINEAR_SAMPLINGMODE);
        tex.update();
        tex.anisotropicFilteringLevel = 8;
        tex.wrapU = tex.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
        const m = new BABYLON.StandardMaterial('reliefM_' + reg.id, S);
        m.diffuseTexture = tex; m.specularColor = new BABYLON.Color3(0.05, 0.05, 0.06);
        m.zOffset = -2;   // the rim of the patch lies on the flat board: it wins the depth tie
        mesh.material = m; mesh.receiveShadows = true; mesh.isPickable = false;
        this.shadows.addShadowCaster(mesh);
        this.mesh = mesh;

        this.plantFirs(reg, rgba, field, w, h);
        if (c) this.buildKaerMorhen(this.world(c.x, c.y, c.h), c.scale, c.rot);
    }

    /** Low-poly firs where the forest is painted (thin instances: one draw call per colour). */
    plantFirs(reg, rgba, field, w, h) {
        const S = this.scene;
        const [x0, y0] = reg.px;
        let seed = 11;
        const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
        const kinds = ['#1f3b2a', '#2b4a2c', '#36502f'].map((hex, k) => {
            const top = BABYLON.MeshBuilder.CreateCylinder('firT' + k, { diameterTop: 0, diameterBottom: 0.05, height: 0.07, tessellation: 6 }, S);
            top.position.y = 0.085;
            const low = BABYLON.MeshBuilder.CreateCylinder('firL' + k, { diameterTop: 0.015, diameterBottom: 0.075, height: 0.08, tessellation: 6 }, S);
            low.position.y = 0.045;
            const trunk = BABYLON.MeshBuilder.CreateCylinder('firS' + k, { diameter: 0.014, height: 0.03, tessellation: 4 }, S);
            trunk.position.y = 0.012;
            const fir = BABYLON.Mesh.MergeMeshes([top, low, trunk], true);
            fir.convertToFlatShadedMesh();
            fir.material = toonMaterial(S, 'firM' + k, hex);
            fir.material.specularColor = new BABYLON.Color3(0.05, 0.06, 0.04);
            fir.isPickable = false; fir.receiveShadows = true;
            return { fir, mats: [] };
        });
        const STEP = 9;
        for (let y = 4; y < h - 4; y += STEP) for (let x = 4; x < w - 4; x += STEP) {
            const jx = Math.round(x + (rnd() - 0.5) * STEP), jy = Math.round(y + (rnd() - 0.5) * STEP);
            const i = (jy * w + jx) * 4;
            if (!isForest(rgba[i], rgba[i + 1], rgba[i + 2])) continue;
            // a forest pixel alone (a shadow, a dark stroke) is not a forest: most of its neighbours must be
            let n = 0;
            for (const [dx, dy] of [[-4, 0], [4, 0], [0, -4], [0, 4]]) { const k = ((jy + dy) * w + jx + dx) * 4; if (isForest(rgba[k], rgba[k + 1], rgba[k + 2])) n++; }
            if (n < 3 || rnd() < 0.35) continue;
            const ht = field[jy * w + jx];
            if (ht > 0.3) continue;   // the tree line
            const p = this.world(x0 + jx, y0 + jy, ht - 0.004);
            const s = 0.55 + rnd() * 0.4;
            const mat = BABYLON.Matrix.Compose(new BABYLON.Vector3(s, s * (0.9 + rnd() * 0.3), s), BABYLON.Quaternion.RotationAxis(BABYLON.Axis.Y, rnd() * 6.28), p);
            kinds[Math.floor(rnd() * kinds.length)].mats.push(mat);
        }
        for (const k of kinds) {
            if (!k.mats.length) { k.fir.dispose(); continue; }
            const buf = new Float32Array(k.mats.length * 16);
            k.mats.forEach((mm, q) => mm.copyToArray(buf, q * 16));
            k.fir.thinInstanceSetBuffer('matrix', buf, 16, true);
            k.fir.thinInstanceRefreshBoundingInfo();
            this.shadows.addShadowCaster(k.fir);
        }
        this.firCount = kinds.reduce((s, k) => s + k.mats.length, 0);
    }

    /**
     * Kaer Morhen: the witchers' keep on a rock spur of the Blue Mountains, as on the board art —
     * a curtain wall with round towers, a gatehouse to the valley, a great hall, the keep and its
     * tall tower. Flat-shaded primitives, merged per material (nemesis: mergeStatic).
     */
    buildKaerMorhen(at, scale = 1, rot = 0) {
        const S = this.scene;
        const root = new BABYLON.TransformNode('kaerMorhen', S);
        root.position = at; root.rotation.y = rot; root.scaling.setAll(scale);
        const mats = {
            rock: toonMaterial(S, 'kmRock', '#7d8089'), wall: toonMaterial(S, 'kmWall', '#a2a3a7'),
            tower: toonMaterial(S, 'kmTower', '#8f9198'), keep: toonMaterial(S, 'kmKeep', '#b0aea8'),
            slate: toonMaterial(S, 'kmSlate', '#4b505c'), dark: toonMaterial(S, 'kmDark', '#1c1d22'),
            wood: toonMaterial(S, 'kmWood', '#5a3e28'), cloth: toonMaterial(S, 'kmCloth', '#8f2a22'),
        };
        for (const k of ['rock', 'wall', 'tower', 'keep', 'slate']) mats[k].specularColor = new BABYLON.Color3(0.08, 0.08, 0.08);
        mats.cloth.backFaceCulling = false;
        const parts = {};
        // parts are built in the castle's own coordinates, unparented: MergeMeshes bakes world matrices,
        // and only the merged mesh is hung on the root
        const add = (mesh, mat) => { (parts[mat] = parts[mat] || []).push(mesh); return mesh; };
        const box = (w, hh, d, x, y, z, mat, ry = 0) => { const b = BABYLON.MeshBuilder.CreateBox('km', { width: w, height: hh, depth: d }, S); b.position.set(x, y, z); b.rotation.y = ry; return add(b, mat); };
        const cyl = (dt, db, hh, x, y, z, mat, tess = 10) => { const c = BABYLON.MeshBuilder.CreateCylinder('km', { diameterTop: dt, diameterBottom: db, height: hh, tessellation: tess }, S); c.position.set(x, y, z); return add(c, mat); };
        let seed = 5;
        const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };

        // The rock spur: a jagged, flat-shaded plinth sunk into the terrace.
        const spur = BABYLON.MeshBuilder.CreateCylinder('kmSpur', { diameterTop: 0.84, diameterBottom: 1.12, height: 0.2, tessellation: 11, subdivisions: 2, updatable: true }, S);
        const sp = spur.getVerticesData(BABYLON.VertexBuffer.PositionKind);
        for (let i = 0; i < sp.length; i += 3) {
            if (sp[i + 1] > 0.09) continue;     // the top stays level: the castle stands on it
            const k = 1 + (rnd() - 0.5) * 0.22;
            sp[i] *= k; sp[i + 2] *= k; sp[i + 1] += (rnd() - 0.5) * 0.04;
        }
        spur.updateVerticesData(BABYLON.VertexBuffer.PositionKind, sp);
        spur.position.y = -0.065;   // a low ledge on the terrace, not a drum standing on it
        add(spur, 'rock');
        for (let i = 0; i < 7; i++) {   // boulders along the foot of the spur
            const a = i / 7 * Math.PI * 2 + rnd(), r = 0.5 + rnd() * 0.08;
            const b = BABYLON.MeshBuilder.CreatePolyhedron('kmBoulder', { type: 2, size: 0.05 + rnd() * 0.05 }, S);
            b.position.set(Math.cos(a) * r, -0.12 + rnd() * 0.04, Math.sin(a) * r); b.rotation.set(rnd() * 3, rnd() * 3, 0);
            add(b, 'rock');
        }
        const Y = 0.035;   // the top of the spur

        /** A ring of merlons around a circle (the crown of a round tower). */
        const crownRound = (x, z, d, y, mat) => {
            cyl(d + 0.024, d + 0.01, 0.03, x, y + 0.015, z, mat, 12);
            const n = Math.max(6, Math.round(d * 70));
            for (let i = 0; i < n; i += 1) {
                if (i % 2) continue;
                const a = i / n * Math.PI * 2, r = d / 2 + 0.006;
                box(0.022, 0.026, 0.016, x + Math.cos(a) * r, y + 0.043, z + Math.sin(a) * r, mat, -a + Math.PI / 2);
            }
        };
        /** Merlons along a straight wall top from (ax, az) to (bx, bz). */
        const crenels = (ax, az, bx, bz, y, t, mat) => {
            const len = Math.hypot(bx - ax, bz - az), n = Math.max(2, Math.floor(len / 0.045));
            const ry = Math.atan2(bx - ax, bz - az);
            for (let i = 0; i <= n; i++) {
                if (i % 2) continue;
                const k = i / n;
                box(t, 0.024, 0.02, ax + (bx - ax) * k, y + 0.012, az + (bz - az) * k, mat, ry);
            }
        };
        /** A round tower with a crenellated crown (and an optional slate cone). */
        const tower = (x, z, d, hh, cone = false) => {
            cyl(d, d * 1.08, hh, x, Y + hh / 2, z, 'tower', 12);
            if (cone) cyl(0, d + 0.03, d * 1.2, x, Y + hh + d * 0.6, z, 'slate', 12);
            else crownRound(x, z, d, Y + hh, 'tower');
            for (let i = 0; i < 2; i++) box(0.012, 0.03, 0.012, x, Y + hh * (0.45 + i * 0.3), z - d / 2 - 0.002, 'dark');   // arrow slits
        };

        // Curtain wall: an irregular ring on the spur, the gate facing the valley (south-west).
        const ring = [[-0.32, -0.12], [-0.12, -0.33], [0.2, -0.27], [0.34, 0.02], [0.24, 0.3], [-0.06, 0.34], [-0.33, 0.18]];
        const WH = 0.12, WT = 0.034;
        for (let i = 0; i < ring.length; i++) {
            const [ax, az] = ring[i], [bx, bz] = ring[(i + 1) % ring.length];
            const len = Math.hypot(bx - ax, bz - az), ry = Math.atan2(bx - ax, bz - az);
            box(WT, WH, len, (ax + bx) / 2, Y + WH / 2, (az + bz) / 2, 'wall', ry);
            box(WT + 0.012, 0.012, len, (ax + bx) / 2, Y + WH, (az + bz) / 2, 'wall', ry);   // wall-walk lip
            crenels(ax, az, bx, bz, Y + WH + 0.006, WT, 'wall');
        }
        ring.forEach(([x, z], i) => tower(x, z, i === 4 ? 0.1 : 0.085, i === 4 ? 0.24 : 0.17 + rnd() * 0.03, i === 3));

        // Gatehouse between the two south-west towers: two square towers, the arch, a wooden gate.
        const gx = (ring[0][0] + ring[1][0]) / 2, gz = (ring[0][1] + ring[1][1]) / 2;
        const gry = Math.atan2(ring[1][0] - ring[0][0], ring[1][1] - ring[0][1]);
        const ox = Math.sin(gry), oz = Math.cos(gry);       // along the wall
        for (const s of [-1, 1]) {
            const tx = gx + ox * s * 0.055, tz = gz + oz * s * 0.055;
            box(0.07, 0.19, 0.07, tx, Y + 0.095, tz, 'tower', gry);
            crenels(tx - ox * 0.03, tz - oz * 0.03, tx + ox * 0.03, tz + oz * 0.03, Y + 0.19, 0.07, 'tower');
        }
        box(0.05, 0.1, 0.046, gx, Y + 0.13, gz, 'wall', gry);                    // over the arch
        const nx = -oz, nz = ox;                            // outward normal (to the valley)
        box(0.006, 0.075, 0.042, gx + nx * 0.02, Y + 0.0375, gz + nz * 0.02, 'wood', gry);   // the gate leaves
        box(0.008, 0.012, 0.05, gx + nx * 0.022, Y + 0.08, gz + nz * 0.022, 'dark', gry);    // the arch shadow
        // the road down from the gate to the valley
        for (let i = 1; i <= 4; i++) box(0.06, 0.012, 0.07, gx + nx * (0.05 + i * 0.065), Y - i * 0.032, gz + nz * (0.05 + i * 0.065), 'rock', gry);

        // The great hall with its gabled slate roof.
        box(0.26, 0.12, 0.12, -0.08, Y + 0.06, -0.04, 'keep', 0.35);
        const roof = cyl(0.16, 0.16, 0.27, -0.08, Y + 0.155, -0.04, 'slate', 3);
        roof.rotation.set(0, 0.35, Math.PI / 2); roof.scaling.set(1, 1, 0.82);
        for (let i = 0; i < 4; i++) box(0.016, 0.03, 0.006, -0.08 + Math.cos(0.35) * (-0.09 + i * 0.06), Y + 0.07, -0.04 - Math.sin(0.35) * (-0.09 + i * 0.06) - 0.062, 'dark', 0.35);

        // The keep: a tall block at the back with crenels, windows and the high tower beside it.
        const kx = 0.05, kz = 0.12;
        box(0.22, 0.32, 0.17, kx, Y + 0.16, kz, 'keep');
        crenels(kx - 0.11, kz - 0.085, kx + 0.11, kz - 0.085, Y + 0.32, 0.02, 'keep');
        crenels(kx - 0.11, kz + 0.085, kx + 0.11, kz + 0.085, Y + 0.32, 0.02, 'keep');
        crenels(kx - 0.11, kz - 0.085, kx - 0.11, kz + 0.085, Y + 0.32, 0.02, 'keep');
        crenels(kx + 0.11, kz - 0.085, kx + 0.11, kz + 0.085, Y + 0.32, 0.02, 'keep');
        for (let r = 0; r < 3; r++) for (let q = 0; q < 3; q++) box(0.022, 0.034, 0.006, kx - 0.065 + q * 0.065, Y + 0.1 + r * 0.075, kz - 0.087, 'dark');
        const tx = kx + 0.13, tz = kz + 0.04;
        box(0.09, 0.48, 0.09, tx, Y + 0.24, tz, 'tower');
        box(0.105, 0.02, 0.105, tx, Y + 0.48, tz, 'tower');
        crenels(tx - 0.05, tz - 0.05, tx + 0.05, tz - 0.05, Y + 0.49, 0.02, 'tower');
        crenels(tx - 0.05, tz + 0.05, tx + 0.05, tz + 0.05, Y + 0.49, 0.02, 'tower');
        crenels(tx - 0.05, tz - 0.05, tx - 0.05, tz + 0.05, Y + 0.49, 0.02, 'tower');
        crenels(tx + 0.05, tz - 0.05, tx + 0.05, tz + 0.05, Y + 0.49, 0.02, 'tower');
        for (let r = 0; r < 4; r++) box(0.018, 0.03, 0.006, tx, Y + 0.12 + r * 0.09, tz - 0.046, 'dark');
        // the banner of the School of the Wolf on the high tower
        box(0.006, 0.16, 0.006, tx, Y + 0.57, tz, 'wood');
        const flag = BABYLON.MeshBuilder.CreatePlane('kmFlag', { width: 0.1, height: 0.06, sideOrientation: BABYLON.Mesh.DOUBLESIDE }, S);
        flag.position.set(tx + 0.052, Y + 0.615, tz); flag.parent = root; flag.material = mats.cloth;
        flag.setPivotPoint(new BABYLON.Vector3(-0.05, 0, 0));   // it turns on the pole, not on its middle
        this.flag = flag;
        // a few roofs of the outbuildings inside the wall
        for (const [x, z, ry] of [[0.2, -0.12, 0.9], [-0.22, 0.1, -0.5]]) {
            box(0.1, 0.06, 0.07, x, Y + 0.03, z, 'wall', ry);
            const r2 = cyl(0.08, 0.08, 0.11, x, Y + 0.08, z, 'slate', 3);
            r2.rotation.set(0, ry, Math.PI / 2); r2.scaling.set(1, 1, 0.75);
        }

        // Merge per material (nemesis mergeStatic): one draw call per stone colour.
        for (const [k, list] of Object.entries(parts)) {
            const merged = BABYLON.Mesh.MergeMeshes(list, true, true);
            merged.parent = root; merged.material = mats[k];
            merged.convertToFlatShadedMesh();
            merged.isPickable = false; merged.receiveShadows = true;
            if (k !== 'dark') inkMini(merged, 0.35);
            this.shadows.addShadowCaster(merged);
        }
        this.shadows.addShadowCaster(flag);
        // the banner waves a little
        let t = 0;
        S.onBeforeRenderObservable.add(() => { t += S.getEngine().getDeltaTime() / 1000; flag.rotation.y = Math.sin(t * 1.7) * 0.25; flag.scaling.x = 1 + Math.sin(t * 2.3) * 0.06; });
        this.castle = root;
        return root;
    }
}
