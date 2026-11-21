// Relief of the board (the nemesis approach: the board is built, not printed). A region of the
// Continent becomes a landscape: the plains swell into hills and the painted rivers are cut into
// them, the painted mountains rise (relief-height.mjs reads all heights from the painting itself),
// low-poly firs grow where the forest is painted, and what the artist drew on the map — castles,
// bridges, huts, a watchtower, ruins — stands there in 3D. The painted originals under them are
// painted over (inpaint) so nothing shows twice.
//
// One look for everything: the terrain, the buildings and the firs share the same toon lighting
// (BOARD_TOON, the flat board too, so the region has no seam) and the buildings are covered with a
// brushed stone texture in the painting's own blue-grey, without the ink edges of the miniatures —
// the board is painted, the miniatures are the plastic on it.
//
// The first region is Kaer Morhen (location 3) with Ban Ard (4) and the valley between them;
// more regions are entries of REGIONS. Pure presentation: no rule reads anything from here.
/* global BABYLON */
import { heightField, sample, isForest, inpaint, rockDetail } from './relief-height.mjs';
import { toonMaterial } from './toon.js';

/** Lighting of everything painted on the board (soft bands, no hard glint, a faint rim). */
export const BOARD_TOON = { bands: 4, soft: 0.07, low: 0.5, spec: 0, specSize: 0.075, rim: 0.1, rimWidth: 0.2 };

/** Regions of continent.jpg (image pixels: 4096 × 3307) that are built in 3D. Angles are image
 *  angles in radians (0 = east, π/2 = south); a bridge's angle is the direction of its road. */
export const REGIONS = [{
    id: 'kaer-morhen',
    px: [2900, 0, 1196, 900],              // x, y, width, height in image pixels
    step: 3,                               // pixels per grid cell of the terrain mesh
    maxH: 0.3,                             // the highest peak, world units (a miniature is 0.95)
    open: { top: true, right: true },      // sides that are the edge of the board
    buildings: [
        // foot — the radius of the building's plinth in its own units: the terrace is levelled under
        // all of it (r = foot · scale in pixels), on a spur falling by `mound` per pixel. Kaer
        // Morhen keeps clear of its name banner (y ≥ 296) and of the school medallion to the east.
        { kind: 'kaerMorhen', x: 3606, y: 196, foot: 0.45, h: 0.13, mound: 0.005, scale: 0.72, rot: 0.12, hole: { x: 3610, y: 203, rx: 100, ry: 90 } },
        { kind: 'banArd', x: 3742, y: 590, foot: 0.24, h: 0.12, scale: 1, rot: 0, hole: { x: 3740, y: 560, rx: 70, ry: 84 } },
    ],
    props: [
        { kind: 'bridge', stone: true, x: 3257, y: 369, angle: 0, len: 52, width: 24 },
        { kind: 'bridge', x: 3320, y: 477, angle: 1.93, len: 30, width: 16 },
        { kind: 'bridge', stone: true, x: 3372, y: 716, angle: -0.46, len: 52, width: 22 },
        { kind: 'bridge', x: 3127, y: 748, angle: 1.04, len: 32, width: 16 },
        { kind: 'bridge', stone: true, x: 3607, y: 567, angle: 0.98, len: 30, width: 14 },
        // the village in the valley
        { kind: 'hut', x: 3122, y: 668, rot: -0.25, size: 1 }, { kind: 'hut', x: 3148, y: 655, rot: -0.3, size: 0.9 },
        { kind: 'hut', x: 3190, y: 649, rot: 0.1, size: 0.9, round: true }, { kind: 'hut', x: 3177, y: 697, rot: -0.2, size: 1.15 },
        { kind: 'hut', x: 3209, y: 694, rot: -0.35, size: 1 }, { kind: 'hut', x: 3257, y: 677, rot: -0.3, size: 1 },
        { kind: 'hut', x: 3239, y: 690, rot: -0.15, size: 0.85 },
        // a farmstead, the huts under Ban Ard, the hut by the ruins
        { kind: 'house', x: 3447, y: 575, rot: 0.05 },
        { kind: 'hut', x: 3665, y: 596, rot: 0.2, size: 0.9 }, { kind: 'hut', x: 3708, y: 641, rot: -0.2, size: 1 },
        { kind: 'hut', x: 3099, y: 392, rot: 0.3, size: 0.8 },
        { kind: 'ruin', x: 3121, y: 370 },
        { kind: 'watchtower', x: 3281, y: 872, hole: { x: 3281, y: 852, rx: 17, ry: 38 } },
    ],
}];

/**
 * Sharp rock on the terrain's faces. The painting is laid on the terrain from above, so on a steep
 * face a pixel of it covers a long strip and blurs into streaks. Over those faces (and, fainter,
 * over all high ground) this plugin multiplies the painting by painted rock — rockDetail sampled in
 * world space on the three axis planes (triplanar: it is never stretched), in two scales. The
 * painting still gives the colour and the big shapes; the rock gives the surface something sharp.
 * A: (tile scale per world unit, strength, steepness from, steepness to); B: (high ground from,
 * high ground to, strength there, —).
 */
export const ROCK = { scale: 2.6, strength: 0.85, steepFrom: 0.22, steepTo: 0.55, highFrom: 0.1, highTo: 0.22, high: 0.45 };
class RockPlugin extends BABYLON.MaterialPluginBase {
    constructor(material, tex, cfg = ROCK) {
        super(material, 'ReliefRock', 210, { RELIEFROCK: false }, true, true);
        this.tex = tex; this.cfg = cfg;
    }
    getClassName() { return 'ReliefRockPlugin'; }
    prepareDefines(defines) { defines.RELIEFROCK = true; }
    isReadyForSubMesh() { return this.tex.isReady(); }
    getSamplers(samplers) { samplers.push('reliefRockSampler'); }
    getUniforms() {
        return {
            ubo: [{ name: 'reliefRockA', size: 4, type: 'vec4' }, { name: 'reliefRockB', size: 4, type: 'vec4' }],
            fragment: '#ifdef RELIEFROCK\nuniform vec4 reliefRockA;\nuniform vec4 reliefRockB;\n#endif',
        };
    }
    bindForSubMesh(ubo) {
        const c = this.cfg;
        ubo.updateFloat4('reliefRockA', c.scale, c.strength, c.steepFrom, c.steepTo);
        ubo.updateFloat4('reliefRockB', c.highFrom, c.highTo, c.high, 0);
        ubo.setTexture('reliefRockSampler', this.tex);
    }
    getCustomCode(shaderType) {
        if (shaderType !== 'fragment') return null;
        return {
            CUSTOM_FRAGMENT_DEFINITIONS: `
#ifdef RELIEFROCK
uniform sampler2D reliefRockSampler;
float reliefRockAt(vec3 p, vec3 bw) {
    return texture2D(reliefRockSampler, p.zy).r * bw.x + texture2D(reliefRockSampler, p.xz).r * bw.y + texture2D(reliefRockSampler, p.xy).r * bw.z;
}
#endif
`,
            CUSTOM_FRAGMENT_UPDATE_DIFFUSE: `
#ifdef RELIEFROCK
{
    vec3 rn = normalize(vNormalW);
    float steep = 1.0 - abs(rn.y);
    float rk = max(smoothstep(reliefRockA.z, reliefRockA.w, steep) * reliefRockA.y,
                   smoothstep(reliefRockB.x, reliefRockB.y, vPositionW.y) * reliefRockB.z);
    if (rk > 0.002) {
        vec3 bw = pow(abs(rn), vec3(4.0));
        bw /= (bw.x + bw.y + bw.z);
        vec3 p = vPositionW * reliefRockA.x;
        float d = reliefRockAt(p, bw) * 0.6 + reliefRockAt(p * 2.7 + 0.37, bw) * 0.4;
        baseColor.rgb *= mix(1.0, 0.45 + d * 1.1, rk);
    }
}
#endif
`,
        };
    }
}

/** Image-pixel size → world size (the map plane is 16 wide over 4096 pixels). */
const PX = 16 / 4096;
/** The terrace radius of a building, image pixels. */
export const footPx = (b) => b.foot * b.scale / PX;

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
        this.mats = this.makeMaterials();
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
        const [ix, iy] = this.pixel(x, z);
        return this.heightPx(ix, iy);
    }
    /** Terrain height at an image pixel. */
    heightPx(ix, iy) {
        for (const p of this.parts) {
            const lx = ix - p.reg.px[0], ly = iy - p.reg.px[1];
            if (lx >= 0 && ly >= 0 && lx <= p.w - 1 && ly <= p.h - 1) return sample(p.field, p.w, p.h, lx, ly);
        }
        return 0;
    }

    // ---------------------------------------------------------------------------------------
    // Materials: one toon lighting, a brushed texture in the painting's colours
    // ---------------------------------------------------------------------------------------
    makeMaterials() {
        const S = this.scene;
        // Brushed stone: short strokes of lighter and darker grey over a light base, faint courses
        // of masonry — the way the board painter draws a castle wall. Multiplied by each colour.
        const tex = new BABYLON.DynamicTexture('reliefStone', { width: 256, height: 256 }, S, true);
        const g = tex.getContext();
        g.fillStyle = '#d8d8d8'; g.fillRect(0, 0, 256, 256);
        let seed = 3;
        const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
        for (let i = 0; i < 900; i++) {
            const v = 175 + Math.floor(rnd() * 80);
            g.strokeStyle = `rgba(${v},${v},${v + 6},0.55)`; g.lineWidth = 2 + rnd() * 5; g.lineCap = 'round';
            const x = rnd() * 256, y = rnd() * 256, l = 6 + rnd() * 18, a = (rnd() - 0.5) * 0.6;
            g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
        }
        g.strokeStyle = 'rgba(90,90,100,0.28)'; g.lineWidth = 2;
        for (let y = 16; y < 256; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); }
        tex.update();
        tex.wrapU = tex.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
        this.stoneTex = tex;
        // Painted rock (rockDetail: facets, cracks, grain) — the terrain's steep faces and the plinths
        const R = 256, rock = rockDetail(R), rt = new BABYLON.DynamicTexture('reliefRock', { width: R, height: R }, S, true, BABYLON.Texture.TRILINEAR_SAMPLINGMODE);
        const rg = rt.getContext(), rid = rg.createImageData(R, R);
        for (let i = 0; i < R * R; i++) { rid.data[i * 4] = rid.data[i * 4 + 1] = rid.data[i * 4 + 2] = rock[i]; rid.data[i * 4 + 3] = 255; }
        rg.putImageData(rid, 0, 0);
        rt.update();
        rt.wrapU = rt.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
        rt.anisotropicFilteringLevel = 8;
        this.rockTex = rt;
        const mk = (name, hex, textured = true) => {
            const m = toonMaterial(S, 'rl_' + name, hex, BOARD_TOON);
            m.specularColor = new BABYLON.Color3(0, 0, 0);
            if (textured) m.diffuseTexture = tex;
            return m;
        };
        // colours sampled from the painting: the light blue-grey of the painted castles, the dark
        // slate of Ban Ard's roofs, the straw and timber of the huts
        return {
            wall: mk('wall', '#b9bccb'), tower: mk('tower', '#a9adbd'), keep: mk('keep', '#c3c3c8'),
            slate: mk('slate', '#565b6b'), dark: mk('dark', '#24252d', false), wood: mk('wood', '#6b4a30'),
            cloth: mk('cloth', '#8f2a22', false), road: mk('road', '#a39274'),
            white: mk('white', '#d6d3cb'), ruin: mk('ruin', '#9a988f'), roofBrown: mk('roofBrown', '#5a4136'),
            plaster: mk('plaster', '#cdbb94'), timber: mk('timber', '#7a5a3c'), thatch: mk('thatch', '#9a7442'),
            plank: mk('plank', '#8a6644'),
            rock: (() => { const m = mk('rock', '#a4adbf'); m.diffuseTexture = rt; rt.uScale = 3; rt.level = 1.65; return m; })(),
        };
    }

    // ---------------------------------------------------------------------------------------
    // A region: terrain, firs, buildings, props
    // ---------------------------------------------------------------------------------------
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
        const loc = (o) => ({ ...o, x: o.x - x0, y: o.y - y0 });
        const field = heightField(rgba, w, h, {
            maxH: reg.maxH, flat, open: reg.open,
            plateau: reg.buildings.map(b => loc({ x: b.x, y: b.y, r: footPx(b), h: b.h, mound: b.mound })),
            // the river runs on under a painted bridge: across the road
            carve: reg.props.filter(p => p.kind === 'bridge').map(p => loc({ x: p.x, y: p.y, len: p.width + 10, width: p.len * 0.62, angle: p.angle + Math.PI / 2 })),
        });
        this.parts.push({ reg, field, w, h });

        // Paint over what is now built in 3D.
        const holes = [];
        for (const b of reg.buildings) holes.push(b.hole);
        for (const p of reg.props) holes.push(p.hole || this.holeOf(p));
        const mask = new Uint8Array(w * h);
        for (const ho of holes) {
            const ca = Math.cos(ho.angle || 0), sa = Math.sin(ho.angle || 0), R = Math.max(ho.rx, ho.ry) + 1;
            const hx = ho.x - x0, hy = ho.y - y0;
            for (let y = Math.max(0, Math.floor(hy - R)); y < Math.min(h, hy + R); y++) for (let x = Math.max(0, Math.floor(hx - R)); x < Math.min(w, hx + R); x++) {
                const dx = x - hx, dy = y - hy, a = dx * ca + dy * sa, b = -dx * sa + dy * ca;
                if ((a / ho.rx) ** 2 + (b / ho.ry) ** 2 < 1) mask[y * w + x] = 1;
            }
        }
        inpaint(px, w, h, mask);
        g.putImageData(id, 0, 0);
        this.holes = holes;

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
        const m = toonMaterial(S, 'reliefM_' + reg.id, '#ffffff', BOARD_TOON);
        m.diffuseTexture = tex; m.specularColor = new BABYLON.Color3(0, 0, 0);
        m.zOffset = -2;   // the rim of the patch lies on the flat board: it wins the depth tie
        if (BABYLON.MaterialPluginBase) m.reliefRock = new RockPlugin(m, this.rockTex);
        mesh.material = m; mesh.receiveShadows = true; mesh.isPickable = false;
        this.shadows.addShadowCaster(mesh);
        this.mesh = mesh;

        this.plantFirs(reg, rgba, field, w, h);
        for (const b of reg.buildings) {
            const at = this.world(b.x, b.y, b.h);
            if (b.kind === 'kaerMorhen') this.buildKaerMorhen(at, b.scale, b.rot);
            if (b.kind === 'banArd') this.buildBanArd(at, b.scale, b.rot);
        }
        for (const p of reg.props) this.buildProp(p);
    }

    /** The painted original of a prop: the ellipse painted over under it. */
    holeOf(p) {
        if (p.kind === 'bridge') return { x: p.x, y: p.y, rx: p.len / 2 + 5, ry: p.width / 2 + 4, angle: p.angle };
        if (p.kind === 'house') return { x: p.x, y: p.y, rx: 29, ry: 27 };
        if (p.kind === 'ruin') return { x: p.x, y: p.y, rx: 23, ry: 27 };
        return { x: p.x, y: p.y, rx: 15 * (p.size || 1), ry: 14 * (p.size || 1) };
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
            fir.material = toonMaterial(S, 'firM' + k, hex, BOARD_TOON);
            fir.material.specularColor = new BABYLON.Color3(0, 0, 0);
            fir.isPickable = false; fir.receiveShadows = true;
            return { fir, mats: [] };
        });
        const busy = [...reg.buildings.map(b => ({ x: b.x, y: b.y, r: footPx(b) + 6 })), ...this.holes.map(o => ({ x: o.x, y: o.y, r: Math.max(o.rx, o.ry) + 4 }))];
        const STEP = 9;
        for (let y = 4; y < h - 4; y += STEP) for (let x = 4; x < w - 4; x += STEP) {
            const jx = Math.round(x + (rnd() - 0.5) * STEP), jy = Math.round(y + (rnd() - 0.5) * STEP);
            const i = (jy * w + jx) * 4;
            if (!isForest(rgba[i], rgba[i + 1], rgba[i + 2])) continue;
            // a forest pixel alone (a shadow, a dark stroke) is not a forest: most of its neighbours must be
            let n = 0;
            for (const [dx, dy] of [[-4, 0], [4, 0], [0, -4], [0, 4]]) { const k = ((jy + dy) * w + jx + dx) * 4; if (isForest(rgba[k], rgba[k + 1], rgba[k + 2])) n++; }
            if (n < 3 || rnd() < 0.35) continue;
            if (busy.some(b => Math.hypot(x0 + jx - b.x, y0 + jy - b.y) < b.r)) continue;
            const ht = field[jy * w + jx];
            if (ht > 0.24) continue;   // the tree line
            const p = this.world(x0 + jx, y0 + jy, ht - 0.004);
            const s = 0.45 + rnd() * 0.35;   // a hut is 0.075: a fir a little taller than its roof
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

    // ---------------------------------------------------------------------------------------
    // Building kit (nemesis buildProps/mergeStatic): parts in local coordinates, merged per material
    // ---------------------------------------------------------------------------------------
    kit(name, at, rot = 0, scale = 1) {
        const S = this.scene;
        const root = new BABYLON.TransformNode(name, S);
        root.position = at; root.rotation.y = rot; root.scaling.setAll(scale);
        const parts = {};
        // parts are built unparented in the building's own coordinates: MergeMeshes bakes world
        // matrices, and only the merged mesh is hung on the root
        const add = (mesh, mat) => { (parts[mat] = parts[mat] || []).push(mesh); return mesh; };
        const k = {
            root,
            box: (w, hh, d, x, y, z, mat, ry = 0) => { const b = BABYLON.MeshBuilder.CreateBox('p', { width: w, height: hh, depth: d }, S); b.position.set(x, y, z); b.rotation.y = ry; return add(b, mat); },
            cyl: (dt, db, hh, x, y, z, mat, tess = 10) => { const c = BABYLON.MeshBuilder.CreateCylinder('p', { diameterTop: dt, diameterBottom: db, height: hh, tessellation: tess }, S); c.position.set(x, y, z); return add(c, mat); },
            /** A gabled roof along local x: a triangular prism. */
            roof: (len, span, hh, x, y, z, mat, ry = 0) => {
                const r = BABYLON.MeshBuilder.CreateCylinder('p', { diameter: 1, height: len, tessellation: 3 }, S);
                r.rotation.set(0, ry, Math.PI / 2); r.scaling.set(hh * 1.33, 1, span * 1.16);
                r.position.set(x, y + hh * 0.333, z); return add(r, mat);   // the eaves on y
            },
            poly: (size, x, y, z, mat) => { const p = BABYLON.MeshBuilder.CreatePolyhedron('p', { type: 2, size }, S); p.position.set(x, y, z); p.rotation.set(x * 40, z * 40, 0); return add(p, mat); },
            /** Merlons along a straight wall top. */
            crenels: (ax, az, bx, bz, y, t, mat) => {
                const len = Math.hypot(bx - ax, bz - az), n = Math.max(2, Math.floor(len / 0.045)), ry = Math.atan2(bx - ax, bz - az);
                for (let i = 0; i <= n; i += 2) k.box(t, 0.024, 0.02, ax + (bx - ax) * i / n, y + 0.012, az + (bz - az) * i / n, mat, ry);
            },
            /** A ring of merlons (the crown of a round tower). */
            crown: (x, z, d, y, mat) => {
                k.cyl(d + 0.024, d + 0.01, 0.03, x, y + 0.015, z, mat, 12);
                const n = Math.max(6, Math.round(d * 70));
                for (let i = 0; i < n; i += 2) { const a = i / n * Math.PI * 2, r = d / 2 + 0.006; k.box(0.022, 0.026, 0.016, x + Math.cos(a) * r, y + 0.043, z + Math.sin(a) * r, mat, -a + Math.PI / 2); }
            },
            done: () => {
                for (const [mk, list] of Object.entries(parts)) {
                    const merged = BABYLON.Mesh.MergeMeshes(list, true, true);
                    merged.parent = root; merged.material = this.mats[mk];
                    merged.convertToFlatShadedMesh();
                    merged.isPickable = false; merged.receiveShadows = true;
                    this.shadows.addShadowCaster(merged);
                }
                return root;
            },
        };
        return k;
    }

    /**
     * Kaer Morhen: the witchers' keep on a spur of the Blue Mountains, as on the board art — a
     * curtain wall with round towers, a gatehouse to the valley, a great hall, the keep and its
     * tall tower with the banner. It stands on a terrace of the terrain itself.
     */
    buildKaerMorhen(at, scale = 1, rot = 0) {
        const S = this.scene;
        const k = this.kit('kaerMorhen', at, rot, scale);
        const { box, cyl, roof, crenels, crown } = k;
        let seed = 5;
        const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
        const Y = 0;
        // the plinth: a rock the walls are built on, reaching well below the terrace — where the
        // spur falls away the castle still stands on stone, never in the air
        cyl(0.86, 1.04, 0.34, 0, -0.175, 0, 'rock', 11);   // its top just under the terrace

        const tower = (x, z, d, hh, cone = false) => {
            cyl(d, d * 1.08, hh, x, Y + hh / 2, z, 'tower', 12);
            if (cone) cyl(0, d + 0.03, d * 1.2, x, Y + hh + d * 0.6, z, 'slate', 12);
            else crown(x, z, d, Y + hh, 'tower');
            for (let i = 0; i < 2; i++) box(0.012, 0.03, 0.012, x, Y + hh * (0.45 + i * 0.3), z - d / 2 - 0.002, 'dark');
        };
        const ring = [[-0.32, -0.12], [-0.12, -0.33], [0.2, -0.27], [0.34, 0.02], [0.24, 0.3], [-0.06, 0.34], [-0.33, 0.18]];
        const WH = 0.12, WT = 0.034;
        for (let i = 0; i < ring.length; i++) {
            const [ax, az] = ring[i], [bx, bz] = ring[(i + 1) % ring.length];
            const len = Math.hypot(bx - ax, bz - az), ry = Math.atan2(bx - ax, bz - az);
            box(WT, WH, len, (ax + bx) / 2, Y + WH / 2, (az + bz) / 2, 'wall', ry);
            box(WT + 0.012, 0.012, len, (ax + bx) / 2, Y + WH, (az + bz) / 2, 'wall', ry);
            crenels(ax, az, bx, bz, Y + WH + 0.006, WT, 'wall');
        }
        ring.forEach(([x, z], i) => tower(x, z, i === 4 ? 0.1 : 0.085, i === 4 ? 0.24 : 0.17 + rnd() * 0.03, i === 3));

        // gatehouse between the two south-west towers, the gate, the road down to the valley
        const gx = (ring[0][0] + ring[1][0]) / 2, gz = (ring[0][1] + ring[1][1]) / 2;
        const gry = Math.atan2(ring[1][0] - ring[0][0], ring[1][1] - ring[0][1]);
        const ox = Math.sin(gry), oz = Math.cos(gry);
        for (const s of [-1, 1]) {
            const tx = gx + ox * s * 0.055, tz = gz + oz * s * 0.055;
            box(0.07, 0.19, 0.07, tx, Y + 0.095, tz, 'tower', gry);
            crenels(tx - ox * 0.03, tz - oz * 0.03, tx + ox * 0.03, tz + oz * 0.03, Y + 0.19, 0.07, 'tower');
        }
        box(0.05, 0.1, 0.046, gx, Y + 0.13, gz, 'wall', gry);
        const nx = -oz, nz = ox;
        box(0.006, 0.075, 0.042, gx + nx * 0.02, Y + 0.0375, gz + nz * 0.02, 'wood', gry);
        box(0.008, 0.012, 0.05, gx + nx * 0.022, Y + 0.08, gz + nz * 0.022, 'dark', gry);
        for (let i = 1; i <= 5; i++) box(0.06, 0.014, 0.07, gx + nx * (0.04 + i * 0.06), Y - i * 0.03, gz + nz * (0.04 + i * 0.06), 'road', gry);

        // the great hall
        box(0.26, 0.12, 0.12, -0.08, Y + 0.06, -0.04, 'keep', 0.35);
        roof(0.27, 0.13, 0.08, -0.08, Y + 0.12, -0.04, 'slate', 0.35);
        for (let i = 0; i < 4; i++) box(0.016, 0.03, 0.006, -0.08 + Math.cos(0.35) * (-0.09 + i * 0.06), Y + 0.07, -0.04 - Math.sin(0.35) * (-0.09 + i * 0.06) - 0.062, 'dark', 0.35);

        // the keep and its high tower
        const kx = 0.05, kz = 0.12;
        box(0.22, 0.32, 0.17, kx, Y + 0.16, kz, 'keep');
        for (const [ax, az, bx, bz] of [[-1, -1, 1, -1], [-1, 1, 1, 1], [-1, -1, -1, 1], [1, -1, 1, 1]]) crenels(kx + ax * 0.11, kz + az * 0.085, kx + bx * 0.11, kz + bz * 0.085, Y + 0.32, 0.02, 'keep');
        for (let r = 0; r < 3; r++) for (let q = 0; q < 3; q++) box(0.022, 0.034, 0.006, kx - 0.065 + q * 0.065, Y + 0.1 + r * 0.075, kz - 0.087, 'dark');
        const tx = kx + 0.13, tz = kz + 0.04;
        box(0.09, 0.48, 0.09, tx, Y + 0.24, tz, 'tower');
        box(0.105, 0.02, 0.105, tx, Y + 0.48, tz, 'tower');
        for (const [ax, az, bx, bz] of [[-1, -1, 1, -1], [-1, 1, 1, 1], [-1, -1, -1, 1], [1, -1, 1, 1]]) crenels(tx + ax * 0.05, tz + az * 0.05, tx + bx * 0.05, tz + bz * 0.05, Y + 0.49, 0.02, 'tower');
        for (let r = 0; r < 4; r++) box(0.018, 0.03, 0.006, tx, Y + 0.12 + r * 0.09, tz - 0.046, 'dark');
        box(0.006, 0.16, 0.006, tx, Y + 0.57, tz, 'wood');
        for (const [x, z, ry] of [[0.2, -0.12, 0.9], [-0.22, 0.1, -0.5]]) {
            box(0.1, 0.06, 0.07, x, Y + 0.03, z, 'wall', ry);
            roof(0.11, 0.075, 0.05, x, Y + 0.06, z, 'slate', ry);
        }
        const root = k.done();
        // the banner of the School of the Wolf waves on the high tower
        const flag = BABYLON.MeshBuilder.CreatePlane('kmFlag', { width: 0.1, height: 0.06, sideOrientation: BABYLON.Mesh.DOUBLESIDE }, S);
        flag.parent = root; flag.position.set(tx + 0.052, Y + 0.615, tz); flag.material = this.mats.cloth;
        flag.setPivotPoint(new BABYLON.Vector3(-0.05, 0, 0));
        this.shadows.addShadowCaster(flag);
        let t = 0;
        S.onBeforeRenderObservable.add(() => { t += S.getEngine().getDeltaTime() / 1000; flag.rotation.y = Math.sin(t * 1.7) * 0.25; flag.scaling.x = 1 + Math.sin(t * 2.3) * 0.06; });
        this.castle = root;
        return root;
    }

    /** Ban Ard, the school of mages on the board art: a tall white tower with a dark spire among
     *  smaller spired towers, ringed by a low wall on a hill under the mountains. */
    buildBanArd(at, scale = 1, rot = 0) {
        const k = this.kit('banArd', at, rot, scale);
        const { box, cyl, crown } = k;
        cyl(0.46, 0.56, 0.26, 0, -0.135, 0, 'rock', 10);   // the plinth (see Kaer Morhen)
        const spire = (x, z, d, hh, roofH) => {
            cyl(d, d * 1.06, hh, x, hh / 2, z, 'white', 12);
            cyl(d + 0.016, d + 0.016, 0.014, x, hh, z, 'white', 12);
            cyl(0, d + 0.022, roofH, x, hh + roofH / 2 + 0.007, z, 'roofBrown', 12);
            for (let i = 0; i < Math.floor(hh / 0.08); i++) box(0.011, 0.024, 0.006, x, 0.05 + i * 0.075, z - d / 2 - 0.002, 'dark');
        };
        // the wall ring with small towers
        const ring = [[-0.17, -0.1], [0.02, -0.19], [0.18, -0.08], [0.16, 0.12], [-0.03, 0.18], [-0.18, 0.08]];
        for (let i = 0; i < ring.length; i++) {
            const [ax, az] = ring[i], [bx, bz] = ring[(i + 1) % ring.length];
            box(0.026, 0.07, Math.hypot(bx - ax, bz - az), (ax + bx) / 2, 0.035, (az + bz) / 2, 'wall', Math.atan2(bx - ax, bz - az));
            k.crenels(ax, az, bx, bz, 0.07, 0.026, 'wall');
        }
        ring.forEach(([x, z], i) => spire(x, z, 0.05, 0.1 + (i % 3) * 0.025, 0.07));
        // the halls around the tower and the great tower itself
        box(0.16, 0.1, 0.09, -0.04, 0.05, 0.05, 'wall', 0.4);
        k.roof(0.17, 0.1, 0.06, -0.04, 0.1, 0.05, 'roofBrown', 0.4);
        spire(0.06, -0.02, 0.07, 0.24, 0.1);
        spire(0.02, 0.03, 0.1, 0.42, 0.15);
        crown(0.02, 0.03, 0.1, 0.2, 'white');   // a gallery halfway up the great tower
        return k.done();
    }

    /** Small things painted on the map: bridges, huts, a farmstead, a watchtower, ruins. */
    buildProp(p) {
        const at = this.world(p.x, p.y, this.heightPx(p.x, p.y));
        if (p.kind === 'bridge') {
            // The deck lies at the level of the banks it joins (the river bed is cut between them).
            const dx = Math.cos(p.angle) * p.len / 2, dy = Math.sin(p.angle) * p.len / 2;
            const bank = Math.max(this.heightPx(p.x - dx, p.y - dy), this.heightPx(p.x + dx, p.y + dy));
            at.y = bank + 0.004;
            const L = p.len * PX, W = p.width * PX;
            const k = this.kit('bridge', at, p.angle);
            if (p.stone) {
                // a humped stone bridge: two sloping spans and a level crown, parapets, piers in the bed
                const rise = 0.016, side = L * 0.36, slope = Math.atan2(rise, side);
                for (const s of [-1, 1]) {
                    const b = k.box(side, 0.014, W, s * (L / 2 - side / 2), rise / 2, 0, 'wall');
                    b.rotation.z = -s * slope;
                    const pa = k.box(side, 0.014, 0.008, s * (L / 2 - side / 2), rise / 2 + 0.012, W / 2 - 0.004, 'wall'); pa.rotation.z = -s * slope;
                    const pb = k.box(side, 0.014, 0.008, s * (L / 2 - side / 2), rise / 2 + 0.012, -W / 2 + 0.004, 'wall'); pb.rotation.z = -s * slope;
                    k.box(0.03, 0.06, W * 0.9, s * L * 0.2, -0.025, 0, 'ruin');
                }
                k.box(L - 2 * side + 0.004, 0.014, W, 0, rise, 0, 'wall');
                k.box(L - 2 * side + 0.004, 0.014, 0.008, 0, rise + 0.012, W / 2 - 0.004, 'wall');
                k.box(L - 2 * side + 0.004, 0.014, 0.008, 0, rise + 0.012, -W / 2 + 0.004, 'wall');
            } else {
                // a plank bridge on posts with a rail on each side
                const n = Math.max(4, Math.round(L / 0.014));
                for (let i = 0; i < n; i++) k.box(L / n * 0.82, 0.008, W, -L / 2 + (i + 0.5) * L / n, 0, 0, i % 2 ? 'plank' : 'wood');
                for (const sx of [-0.3, 0.3]) for (const sz of [-1, 1]) k.box(0.008, 0.06, 0.008, sx * L, -0.02, sz * W / 2, 'wood');
                for (const sz of [-1, 1]) k.box(L, 0.006, 0.006, 0, 0.02, sz * W / 2, 'wood');
                for (const sx of [-0.45, 0, 0.45]) for (const sz of [-1, 1]) k.box(0.006, 0.02, 0.006, sx * L, 0.01, sz * W / 2, 'wood');
            }
            return k.done();
        }
        if (p.kind === 'hut') {
            const s = 0.075 * (p.size || 1);
            const k = this.kit('hut', at, p.rot || 0);
            if (p.round) {   // a round granary with a conical thatch
                k.cyl(s * 0.75, s * 0.8, s * 0.5, 0, s * 0.25 - 0.01, 0, 'plaster', 9);
                k.cyl(0, s * 1.0, s * 0.55, 0, s * 0.5 + s * 0.27 - 0.01, 0, 'thatch', 9);
            } else {
                k.box(s, s * 0.5, s * 0.72, 0, s * 0.25 - 0.012, 0, (p.x + p.y) % 2 ? 'plaster' : 'timber');
                k.roof(s * 1.12, s * 0.86, s * 0.42, 0, s * 0.5 - 0.012, 0, 'thatch');
                k.box(s * 0.12, s * 0.3, s * 0.12, s * 0.28, s * 0.72, s * 0.12, 'ruin');      // chimney
                k.box(s * 0.16, s * 0.28, 0.004, -s * 0.2, s * 0.13 - 0.012, -s * 0.36 - 0.002, 'dark');   // door
            }
            return k.done();
        }
        if (p.kind === 'house') {
            // a two-storey timbered farmhouse with a barn wing, as painted by the river
            const k = this.kit('house', at, p.rot || 0);
            k.box(0.12, 0.1, 0.09, 0, 0.04, 0, 'plaster');
            for (const sx of [-0.058, -0.02, 0.02, 0.058]) k.box(0.008, 0.1, 0.004, sx, 0.04, -0.046, 'timber');
            k.box(0.12, 0.008, 0.004, 0, 0.05, -0.046, 'timber');
            k.roof(0.13, 0.1, 0.06, 0, 0.09, 0, 'roofBrown');
            k.box(0.08, 0.06, 0.07, -0.085, 0.02, 0.03, 'timber', 0);
            k.roof(0.085, 0.075, 0.04, -0.085, 0.05, 0.03, 'thatch', 0);
            for (const sx of [-0.035, 0.035]) k.box(0.018, 0.024, 0.004, sx, 0.065, -0.047, 'dark');
            k.box(0.022, 0.04, 0.004, 0, 0.0, -0.047, 'dark');
            return k.done();
        }
        if (p.kind === 'watchtower') {
            const k = this.kit('watchtower', at, 0);
            k.cyl(0.06, 0.07, 0.21, 0, 0.095, 0, 'white', 10);
            k.crown(0, 0, 0.06, 0.2, 'white');
            for (let i = 0; i < 3; i++) k.box(0.01, 0.024, 0.006, 0, 0.06 + i * 0.05, -0.032, 'dark');
            return k.done();
        }
        if (p.kind === 'ruin') {
            // broken walls of a small fort, a stump of its tower, rubble
            const k = this.kit('ruin', at, 0.3);
            k.box(0.1, 0.05, 0.016, 0, 0.015, -0.04, 'ruin'); k.box(0.05, 0.08, 0.016, -0.03, 0.03, -0.04, 'ruin');
            k.box(0.016, 0.04, 0.07, 0.05, 0.01, 0, 'ruin');
            k.cyl(0.045, 0.05, 0.1, -0.045, 0.04, 0.02, 'ruin', 9);
            for (let i = 0; i < 5; i++) k.poly(0.008 + (i % 3) * 0.004, -0.02 + i * 0.018, 0.0, 0.03 - (i % 2) * 0.05, 'ruin');
            return k.done();
        }
        return null;
    }
}
