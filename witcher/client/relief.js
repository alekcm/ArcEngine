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
import { heightField, sample, isForest, inpaint, rockDetail, classify, markEllipses } from './relief-height.mjs';
import { toonMaterial } from './toon.js';

/** Lighting of everything painted on the board (soft bands, no hard glint, a faint rim). */
export const BOARD_TOON = { bands: 4, soft: 0.07, low: 0.5, spec: 0, specSize: 0.075, rim: 0.1, rimWidth: 0.2 };

/** Regions of continent.jpg (image pixels: 4096 × 3307) that are built in 3D. Angles are image
 *  angles in radians (0 = east, π/2 = south); a bridge's angle is the direction of its road. */
export const REGIONS = [{
    // ---- the north-east: Kaer Morhen (3), Ban Ard (4) and the valley between them -----------
    // Regions tile the board: their x0/y0 are aligned to the mesh step (3) so neighbours share their
    // edge vertices (Relief.stitch), and a side that another region continues has no falloff.
    id: 'kaer-morhen',
    px: [2901, 0, 1195, 901],              // x, y, width, height in image pixels
    step: 3,                               // pixels per grid cell of the terrain mesh
    maxH: 0.3,                             // the highest peak, world units (a miniature is 0.95)
    open: { top: true, right: true },      // sides that are the edge of the board
    noCopy: [{ x: 3762, y: 141, rx: 66, ry: 66 }],   // the Wolf school medallion: not a texture source
    buildings: [
        // foot — the radius of the building's plinth in its own units: the terrace is levelled under
        // all of it (r = foot · scale in pixels), on a spur falling by `mound` per pixel. Kaer
        // Morhen keeps clear of its name banner (y ≥ 296) and of the school medallion to the east.
        { kind: 'kaerMorhen', x: 3606, y: 196, foot: 0.45, h: 0.1, mound: 0.004, scale: 0.72, rot: 0.12, hole: { x: 3610, y: 203, rx: 100, ry: 90 } },
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
}, {
    // ---- the north: Hengfors (2), Vizima (7), Haern Caduch (10) ----------------------------
    id: 'north',
    px: [1950, 0, 952, 2200],
    step: 3, maxH: 0.3,
    open: { top: true },
    noCopy: [{ x: 2533, y: 1747, rx: 64, ry: 64 }],   // the Bear school medallion
    buildings: [
        { kind: 'hengfors', x: 2482, y: 350, foot: 0.42, h: 0.065, scale: 0.75, rot: 0.05, hole: { x: 2497, y: 355, rx: 128, ry: 92 } },
        { kind: 'vizima', x: 2345, y: 893, foot: 0.47, h: 0.06, scale: 0.8, rot: 0.08, hole: { x: 2350, y: 895, rx: 155, ry: 95 } },
        { kind: 'haernCaduch', x: 2392, y: 1795, foot: 0.42, h: 0.07, mound: 0.003, scale: 0.78, rot: -0.1, hole: { x: 2397, y: 1793, rx: 85, ry: 101 } },
    ],
    holes: [{ x: 2603, y: 392, rx: 42, ry: 58 }],   // Hengfors' gate towers by the badge: the miniatures stand there
    props: [
        { kind: 'bridge', x: 2075, y: 680, angle: 1.04, len: 24, width: 14 },
        { kind: 'bridge', x: 2400, y: 760, angle: -0.86, len: 26, width: 14 },
        { kind: 'bridge', stone: true, x: 2480, y: 810, angle: -0.37, len: 40, width: 14 },
        { kind: 'bridge', x: 2227, y: 1230, angle: 1.35, len: 22, width: 14 },
        { kind: 'bridge', stone: true, x: 2305, y: 1285, angle: 0.62, len: 36, width: 16 },
        { kind: 'bridge', stone: true, x: 2571, y: 1177, angle: 0.36, len: 50, width: 14 },
        { kind: 'rocks', x: 2185, y: 674, size: 1.3 }, { kind: 'rocks', x: 2560, y: 733, size: 1.3 }, { kind: 'rocks', x: 2085, y: 895, size: 1 },
        // the village under the mountains of Haern Caduch, lone huts
        { kind: 'hut', x: 2298, y: 1437, rot: -0.3, size: 1.1, roof: 'roofRed' }, { kind: 'hut', x: 2278, y: 1452, rot: -0.2, size: 1, roof: 'roofRed' },
        { kind: 'hut', x: 2258, y: 1474, rot: -0.35, size: 1.05, roof: 'roofRed' }, { kind: 'hut', x: 2347, y: 1449, rot: 0.1, size: 1.15, roof: 'roofRed' },
        { kind: 'hut', x: 2357, y: 1497, rot: -0.15, size: 1.25, roof: 'roofRed' }, { kind: 'hut', x: 2322, y: 1486, rot: -0.4, size: 1, roof: 'roofRed' },
        { kind: 'hut', x: 2750, y: 1890, rot: 0.1, size: 1 }, { kind: 'hut', x: 2730, y: 1380, rot: -0.1, size: 1.25 },
    ],
}, {
    // ---- the east: Vengerberg (8), Bechelt Nar (0), Beauclair (11) -------------------------
    id: 'east',
    px: [2901, 900, 1195, 1300],
    step: 3, maxH: 0.3,
    open: { right: true },
    noCopy: [{ x: 3716, y: 1576, rx: 64, ry: 64 }],   // the medallion by Bechelt Nar
    buildings: [
        { kind: 'vengerberg', x: 3497, y: 1022, foot: 0.44, h: 0.07, scale: 0.75, rot: 0, hole: { x: 3503, y: 1022, rx: 102, ry: 98 } },
        { kind: 'becheltNar', x: 3890, y: 1548, foot: 0.4, h: 0.09, scale: 0.8, rot: 0, hole: { x: 3888, y: 1548, rx: 95, ry: 100 } },
        { kind: 'beauclair', x: 3378, y: 1818, foot: 0.48, h: 0.12, scale: 0.8, rot: 0, hole: { x: 3385, y: 1815, rx: 100, ry: 118 } },
    ],
    props: [
        { kind: 'bridge', x: 3399, y: 1502, angle: 0.56, len: 30, width: 14 },
        { kind: 'hut', x: 3410, y: 1330, rot: -0.1, size: 1 }, { kind: 'hut', x: 3378, y: 1312, rot: 0.15, size: 0.9 },
        { kind: 'house', x: 3862, y: 1304, rot: 0.2 },
        { kind: 'hut', x: 3462, y: 1468, rot: 0, size: 1.1 },
        { kind: 'hall', x: 3789, y: 1649, rot: 0.1 }, { kind: 'hall', x: 3925, y: 1668, rot: -0.15, size: 0.85 },
        { kind: 'watchtower', x: 3000, y: 1592, roof: 'lilac', hole: { x: 3000, y: 1560, rx: 16, ry: 46 } },
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
        this.meshes = []; this.buildings = {};
        this.ready = this.load().catch((e) => { console.error('relief', e); });
    }

    async load() {
        const img = new Image();
        img.src = this.o.url;
        await img.decode();
        this.imgW = img.naturalWidth; this.imgH = img.naturalHeight;
        this.mats = this.makeMaterials();
        // courtyard floors lie just over the levelled terrace: drawn in front of it at any depth precision
        for (const f of ['yard', 'vengGrass', 'hengGrass']) this.mats[f].zOffset = -2;
        // heights and painting-over of all regions in parallel; then built one by one, each
        // stitched to the ones before it
        const lanes = Math.max(1, Math.min(REGIONS.length, (navigator.hardwareConcurrency || 2) - 1));
        const preps = REGIONS.map((reg, i) => this.prepareRegion(img, reg, i % lanes));
        for (const p of preps) this.buildRegion(await p);
        for (const wk of this.workers || []) if (wk) wk.terminate();
        this.workers = null;
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
            plank: mk('plank', '#8a6644'), yard: mk('yard', '#b3a68c'),
            // the other cities: Vengerberg's blue roofs, Beauclair's terracotta, Bechelt Nar's brown
            // stone, the red shingles of the villages, the mage's lilac, a grassy bastion
            roofBlue: mk('roofBlue', '#2b7aa3'), terracotta: mk('terracotta', '#d27e66'), roofRed: mk('roofRed', '#8c5246'),
            brownStone: mk('brownStone', '#80604c'), darkRoof: mk('darkRoof', '#56433b'), lilac: mk('lilac', '#8b6bb0'),
            grass: mk('grass', '#6f8a4a'), pale: mk('pale', '#d9d6cc'), leaf: mk('leaf', '#2f4f2c', false),
            // each city in its own colours, sampled from its painting (lit side, brightened the way
            // the approved Kaer Morhen stone is: painted #8e8fa1 -> #b9bccb)
            hengStone: mk('hengStone', '#b4c4cb'), hengWall: mk('hengWall', '#9eadb6'), hengGrass: mk('hengGrass', '#a3b26e'),
            vizTower: mk('vizTower', '#b3a9b2'), vizKeep: mk('vizKeep', '#d2cac8'), vizRoof: mk('vizRoof', '#4d6a7e'), vizPlaster: mk('vizPlaster', '#d8d0c8'),
            hcStone: mk('hcStone', '#dcdeee'),
            vengWall: mk('vengWall', '#d2cfcc'), vengGrass: mk('vengGrass', '#4f6e3c'),
            bnStone: mk('bnStone', '#ad866b'), bnDark: mk('bnDark', '#7a5641'),
            beauWhite: mk('beauWhite', '#e6e6e3'),
            rock: (() => { const m = mk('rock', '#a4adbf'); m.diffuseTexture = rt; rt.uScale = 3; rt.level = 1.65; return m; })(),
        };
    }

    // ---------------------------------------------------------------------------------------
    // A region: terrain, firs, buildings, props
    // ---------------------------------------------------------------------------------------
    /** Runs a pure relief job (relief-worker.mjs) off the main thread — on worker `lane` (one per
     *  region, so the regions are computed in parallel); inline if workers are unavailable. */
    job(op, a, transfer, lane = 0) {
        const inline = () => {
            if (op === 'field') return heightField(a.rgba, a.w, a.h, a.opt);
            inpaint(a.px, a.w, a.h, a.mask, a.iters, { avoid: a.avoid });
            return a.px;
        };
        this.workers = this.workers || [];
        if (this.workers[lane] === undefined) {
            try {
                const wk = new Worker(new URL('./relief-worker.mjs', import.meta.url), { type: 'module' });
                wk.jobs = new Map();
                wk.onmessage = (e) => { const j = wk.jobs.get(e.data.id); wk.jobs.delete(e.data.id); if (e.data.error) j.reject(new Error(e.data.error)); else j.resolve(e.data.out); };
                wk.onerror = (e) => { console.warn('relief worker', e.message); for (const j of wk.jobs.values()) j.retry(); wk.jobs.clear(); this.workers[lane] = null; };
                this.workers[lane] = wk;
            } catch (e) { this.workers[lane] = null; }
        }
        const wk = this.workers[lane];
        if (!wk) return Promise.resolve(inline());
        return new Promise((resolve, reject) => {
            const id = (this.jobId = (this.jobId || 0) + 1);
            wk.jobs.set(id, { resolve, reject, retry: () => { try { resolve(inline()); } catch (e) { reject(e); } } });
            wk.postMessage({ id, op, a }, transfer);
        });
    }

    /** How each side of a region meets the rest: 'board' (the edge of the board), 'shared'
     *  (other regions continue it over its whole length) or 'fall' (it sinks into the flat board). */
    sidesOf(reg) {
        const [x0, y0, w, h] = reg.px, x1 = x0 + w - 1, y1 = y0 + h - 1;
        const others = REGIONS.filter(r => r !== reg).map(r => [r.px[0], r.px[1], r.px[0] + r.px[2] - 1, r.px[1] + r.px[3] - 1]);
        // a side is shared when every point of it lies on (the first row/column of) another region
        const covered = (pts) => pts.every(([x, y]) => others.some(([a0, b0, a1, b1]) => x >= a0 && x <= a1 && y >= b0 && y <= b1));
        const line = (ax, ay, bx, by) => { const out = []; const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay)); for (let i = 0; i <= n; i += 7) out.push([Math.round(ax + (bx - ax) * i / n), Math.round(ay + (by - ay) * i / n)]); out.push([bx, by]); return out; };
        const open = reg.open || {}, side = (name, pts) => (open[name] ? 'board' : covered(pts) ? 'shared' : 'fall');
        return {
            left: side('left', line(x0, y0, x0, y1)), right: side('right', line(x1, y0, x1, y1)),
            top: side('top', line(x0, y0, x1, y0)), bottom: side('bottom', line(x0, y1, x1, y1)),
        };
    }

    /** Level zones of every location: the badge with the miniatures' spot above it and the name
     *  banner (to the left of the badge; to the right where the board has it there). */
    flatZones() {
        const out = [];
        for (const [bx, by, right] of this.o.pins) {
            out.push({ x: bx, y: by - 60, rx: 110, ry: 110 }, { x: right ? bx + 185 : bx - 185, y: by - 52, rx: 140, ry: 40 });
        }
        // and the tokens printed on the map (school medallions): level, like the badges
        for (const reg of REGIONS) out.push(...(reg.flat || []), ...(reg.noCopy || []));
        return out;
    }

    // ---------------------------------------------------------------------------------------
    // A region: terrain, firs, buildings, props
    // ---------------------------------------------------------------------------------------
    async prepareRegion(img, reg, lane) {
        const [x0, y0, w, h] = reg.px;
        const sides = this.sidesOf(reg);
        // Heights are computed over the region plus a margin on its shared sides, so the blurs see
        // the same painting as the neighbour does and both fields agree along the seam.
        const P = 96;
        const px0 = Math.max(0, x0 - (sides.left === 'shared' ? P : 0)), py0 = Math.max(0, y0 - (sides.top === 'shared' ? P : 0));
        const px1 = Math.min(this.imgW, x0 + w + (sides.right === 'shared' ? P : 0)), py1 = Math.min(this.imgH, y0 + h + (sides.bottom === 'shared' ? P : 0));
        const pw = px1 - px0, ph = py1 - py0;
        const cv = document.createElement('canvas');
        cv.width = pw; cv.height = ph;
        const g = cv.getContext('2d', { willReadFrequently: true });
        g.drawImage(img, px0, py0, pw, ph, 0, 0, pw, ph);
        const prgba = g.getImageData(0, 0, pw, ph).data;
        const at = (o) => ({ ...o, x: o.x - px0, y: o.y - py0 });
        const all = REGIONS.flatMap(r => r.buildings), bridges = REGIONS.flatMap(r => r.props.filter(p => p.kind === 'bridge'));
        const flat = this.flatZones();
        const opt = {
            maxH: reg.maxH, flat: flat.map(at),
            open: Object.fromEntries(Object.entries(sides).map(([k, v]) => [k, v === 'board'])),
            none: Object.fromEntries(Object.entries(sides).map(([k, v]) => [k, v === 'shared'])),
            // terraces and bridge beds of every region: a spur or a bed reaching over a seam is the same on both sides
            plateau: all.map(b => at({ x: b.x, y: b.y, r: footPx(b), h: b.h, mound: b.mound })),
            carve: bridges.map(p => at({ x: p.x, y: p.y, len: p.width + 10, width: p.len * 0.62, angle: p.angle + Math.PI / 2 })),
        };
        const fieldJob = this.job('field', { rgba: prgba.slice(), w: pw, h: ph, opt }, [], lane);
        const rgba = new Uint8ClampedArray(w * h * 4);
        for (let y = 0; y < h; y++) {
            const sy = y + y0 - py0;
            for (let x = 0; x < w; x++) { const i = sy * pw + x + x0 - px0; for (let c = 0; c < 4; c++) rgba[(y * w + x) * 4 + c] = prgba[i * 4 + c]; }
        }
        // Paint over what is now built in 3D (texture from the painting around, never from the
        // plates, badges and banners or from tokens painted on the map).
        const loc = (o) => ({ ...o, x: o.x - x0, y: o.y - y0 });
        const holes = [];
        for (const b of reg.buildings) holes.push(b.hole);
        for (const p of reg.props) holes.push(p.hole || this.holeOf(p));
        for (const hz of reg.holes || []) holes.push(hz);   // painted things removed without a 3D twin
        const mask = markEllipses(new Uint8Array(w * h), w, h, holes.map(loc));
        const avoid = classify(rgba, w, h).plate;
        markEllipses(avoid, w, h, flat.map(loc));
        markEllipses(avoid, w, h, (reg.noCopy || []).map(loc));
        const paintJob = this.job('inpaint', { px: rgba.slice(), w, h, mask, iters: 120, avoid }, [], lane);
        const pfield = await fieldJob;
        const field = new Float32Array(w * h);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) field[y * w + x] = pfield[(y + y0 - py0) * pw + x + x0 - px0];
        return { reg, field, rgba, px: await paintJob, holes };
    }

    /** Builds a prepared region (on the main thread, in order: the seams follow the ones before). */
    buildRegion({ reg, field, rgba, px, holes }) {
        const S = this.scene;
        const [x0, y0, w, h] = reg.px;
        this.stitch(reg, field, w, h);
        this.parts.push({ reg, field, w, h });
        const tcv = document.createElement('canvas');
        tcv.width = w; tcv.height = h;
        const tg = tcv.getContext('2d');
        tg.putImageData(new ImageData(new Uint8ClampedArray(px.buffer, px.byteOffset, w * h * 4), w, h), 0, 0);
        this.holes = holes;

        // --- the terrain mesh ---------------------------------------------------------------
        const st = reg.step, gw = Math.floor((w - 1) / st) + 1 + ((w - 1) % st ? 1 : 0), gh = Math.floor((h - 1) / st) + 1 + ((h - 1) % st ? 1 : 0);
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
        const tex = new BABYLON.DynamicTexture('reliefTex_' + reg.id, tcv, S, true, BABYLON.Texture.TRILINEAR_SAMPLINGMODE);
        tex.update();
        tex.anisotropicFilteringLevel = 8;
        tex.wrapU = tex.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
        const m = toonMaterial(S, 'reliefM_' + reg.id, '#ffffff', BOARD_TOON);
        m.diffuseTexture = tex; m.specularColor = new BABYLON.Color3(0, 0, 0);
        m.zOffset = -2;   // the rim of the patch lies on the flat board: it wins the depth tie
        if (BABYLON.MaterialPluginBase) m.reliefRock = new RockPlugin(m, this.rockTex);
        mesh.material = m; mesh.receiveShadows = true; mesh.isPickable = false;
        this.shadows.addShadowCaster(mesh);
        this.meshes.push(mesh);
        this.mesh = this.meshes[0];

        this.plantFirs(reg, rgba, field, w, h);
        for (const b of reg.buildings) {
            const p = this.world(b.x, b.y, b.h);
            const build = this['build' + b.kind[0].toUpperCase() + b.kind.slice(1)];
            const root = build.call(this, p, b.scale, b.rot);
            this.buildings[b.kind] = root;
        }
        for (const p of reg.props) this.buildProp(p);
    }

    /** The seam with regions already built: their border values are taken over exactly (so the
     *  meshes share their edge vertices) and the difference fades out over 32 pixels inside. */
    stitch(reg, field, w, h) {
        const [x0, y0] = reg.px, F = 32;
        const other = (ix, iy) => {
            for (const p of this.parts) {
                const lx = ix - p.reg.px[0], ly = iy - p.reg.px[1];
                if (lx >= 0 && ly >= 0 && lx <= p.w - 1 && ly <= p.h - 1) return p.field[ly * p.w + lx];
            }
            return null;
        };
        // the difference on each border pixel that another region owns, spread inward
        const sides = [
            { n: h, at: (k) => [0, k], dir: [1, 0] }, { n: h, at: (k) => [w - 1, k], dir: [-1, 0] },
            { n: w, at: (k) => [k, 0], dir: [0, 1] }, { n: w, at: (k) => [k, h - 1], dir: [0, -1] },
        ];
        for (const sd of sides) {
            for (let k = 0; k < sd.n; k++) {
                const [bx, by] = sd.at(k), v = other(x0 + bx, y0 + by);
                if (v === null) continue;
                const delta = v - field[by * w + bx];
                for (let d = 0; d < F; d++) {
                    const x = bx + sd.dir[0] * d, y = by + sd.dir[1] * d;
                    if (x < 0 || y < 0 || x >= w || y >= h) break;
                    const f = 1 - d / F;
                    field[y * w + x] += delta * f * f * (3 - 2 * f);
                }
            }
        }
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
        this.firCount = (this.firCount || 0) + kinds.reduce((s, k) => s + k.mats.length, 0);
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
            /** A flat floor over an outline [[x, z]…] star-shaped around its centroid (a courtyard). */
            floor: (pts, y, mat) => {
                const cx = pts.reduce((q, p) => q + p[0], 0) / pts.length, cz = pts.reduce((q, p) => q + p[1], 0) / pts.length;
                const pos = [cx, y, cz], uv = [0.5 + cx * 2, 0.5 + cz * 2], ind = [];
                for (const [x, z] of pts) { pos.push(x, y, z); uv.push(0.5 + x * 2, 0.5 + z * 2); }
                // facing up (Babylon: clockwise from the viewer) whichever way the outline runs
                // both faces: seen from above whichever way the outline runs (never culled away)
                for (let i = 0; i < pts.length; i++) { const a = 1 + i, b = 1 + ((i + 1) % pts.length); ind.push(0, a, b, 0, b, a); }
                const nrm = []; for (let i = 0; i <= pts.length; i++) nrm.push(0, 1, 0);
                const m = new BABYLON.Mesh('p', S), vd = new BABYLON.VertexData();
                vd.positions = pos; vd.indices = ind; vd.normals = nrm; vd.uvs = uv;
                vd.applyToMesh(m);
                return add(m, mat);
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
        // the courtyard: flagstones inside the walls (the ground under them is painted-over rock)
        k.floor(ring, Y + 0.012, 'yard');

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
        k.floor(ring, 0.012, 'yard');
        // the halls around the tower and the great tower itself
        box(0.16, 0.1, 0.09, -0.04, 0.05, 0.05, 'wall', 0.4);
        k.roof(0.17, 0.1, 0.06, -0.04, 0.1, 0.05, 'roofBrown', 0.4);
        spire(0.06, -0.02, 0.07, 0.24, 0.1);
        spire(0.02, 0.03, 0.1, 0.42, 0.15);
        crown(0.02, 0.03, 0.1, 0.2, 'white');   // a gallery halfway up the great tower
        return k.done();
    }

    // ---------------------------------------------------------------------------------------
    // Shared pieces of the cities (local units of a building; its plinth radius is `foot`)
    // ---------------------------------------------------------------------------------------
    /** The plinth of rock under a building (see Kaer Morhen): its top just under the terrace. */
    plinth(k, foot) { k.cyl(foot * 1.9, foot * 2.7, 0.34, 0, -0.175, 0, 'rock', 11); }

    /** A ring of walls through `pts` with merlons, optionally a round tower at every corner. */
    curtain(k, pts, hh, t, mat, towers = null, skip = []) {
        for (let i = 0; i < pts.length; i++) {
            if (skip.includes(i)) continue;
            const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % pts.length];
            const len = Math.hypot(bx - ax, bz - az), ry = Math.atan2(bx - ax, bz - az);
            k.box(t, hh, len, (ax + bx) / 2, hh / 2, (az + bz) / 2, mat, ry);
            k.box(t + 0.01, 0.01, len, (ax + bx) / 2, hh, (az + bz) / 2, mat, ry);
            k.crenels(ax, az, bx, bz, hh + 0.006, t, mat);
        }
        if (towers) pts.forEach(([x, z], i) => this.roundTower(k, x, z, towers.d, towers.h + (i % 3) * 0.015, towers.mat || mat, towers.roof, towers.coneH));
    }

    /** A round tower: crenellated, or with a cone roof of material `roof` (`coneH` tall). */
    roundTower(k, x, z, d, hh, mat, roof = null, coneH = null, tess = 12) {
        k.cyl(d, d * 1.08, hh, x, hh / 2, z, mat, tess);
        if (roof) {
            const ch = coneH || d * 1.6;
            k.cyl(d + 0.014, d + 0.014, 0.012, x, hh, z, mat, tess);
            k.cyl(0, d + 0.022, ch, x, hh + ch / 2 + 0.006, z, roof, tess);
        } else k.crown(x, z, d, hh, mat);
        for (let i = 0; i < Math.floor(hh / 0.09); i++) k.box(0.011, 0.024, 0.006, x, 0.05 + i * 0.08, z - d / 2 - 0.002, 'dark');
    }

    /** A round tower ribbed with buttresses (Haern Caduch, Bechelt Nar), crenellated on top. */
    ribbedTower(k, x, z, d, hh, mat, ribs = 8, flare = 1.08) {
        k.cyl(d, d * flare, hh, x, hh / 2, z, mat, 16);
        for (let i = 0; i < ribs; i++) {
            const a = (i + 0.5) / ribs * Math.PI * 2, r = d / 2 * (1 + (flare - 1) / 2);
            k.box(0.014, hh * 0.92, 0.014, x + Math.cos(a) * r, hh * 0.46, z + Math.sin(a) * r, mat, -a);
        }
        // a corbelled parapet over the ribs
        k.cyl(d + 0.03, d, 0.03, x, hh + 0.005, z, mat, 16);
        k.crown(x, z, d + 0.02, hh + 0.02, mat);
        for (let i = 0; i < Math.floor(hh / 0.1); i++) k.box(0.011, 0.03, 0.006, x, 0.06 + i * 0.09, z - d / 2 - 0.004, 'dark');
    }

    /** A square tower with merlons (or a pyramid roof). */
    squareTower(k, x, z, w, hh, mat, ry = 0, roof = null) {
        k.box(w, hh, w, x, hh / 2, z, mat, ry);
        k.box(w + 0.014, 0.016, w + 0.014, x, hh, z, mat, ry);
        if (roof) k.cyl(0, w * 1.45, w * 1.1, x, hh + w * 0.55 + 0.008, z, roof, 4).rotation.y = ry + Math.PI / 4;
        else {
            const c = Math.cos(ry), s = Math.sin(ry), q = (w + 0.01) / 2;
            const corner = (u, v) => [x + u * c + v * s, z - u * s + v * c];
            const cs = [corner(-q, -q), corner(q, -q), corner(q, q), corner(-q, q)];
            for (let i = 0; i < 4; i++) k.crenels(...cs[i], ...cs[(i + 1) % 4], hh + 0.008, 0.018, mat);
        }
        for (let i = 0; i < Math.floor(hh / 0.1); i++) k.box(0.014, 0.026, 0.006, x, 0.06 + i * 0.09, z - w / 2 - 0.003, 'dark', ry);
    }

    /** A house: walls, a gabled roof (`pitch` of the depth), windows; `timber` adds the dark
     *  beams of a half-timbered upper storey (Vizima). */
    townHouse(k, x, z, w, d, hh, wall, roof, ry = 0, timber = null, pitch = 0.62) {
        k.box(w, hh, d, x, hh / 2, z, wall, ry);
        k.roof(w * 1.06, d * 1.12, d * pitch, x, hh, z, roof, ry);
        const c = Math.cos(ry), s = Math.sin(ry);
        const at = (u, v) => [x + u * c + v * s, z - u * s + v * c];
        if (timber) {
            k.box(w + 0.004, 0.006, d + 0.004, x, hh * 0.5, z, timber, ry);
            k.box(w + 0.004, 0.006, d + 0.004, x, hh - 0.003, z, timber, ry);
            for (const u of [-w / 2, 0, w / 2]) { const [px, pz] = at(u, -d / 2 - 0.002); k.box(0.006, hh * 0.5, 0.004, px, hh * 0.75, pz, timber, ry); }
        }
        for (const u of [-w * 0.22, w * 0.22]) { const [px, pz] = at(u, -d / 2 - 0.003); k.box(0.01, 0.016, 0.004, px, hh * (timber ? 0.3 : 0.6), pz, 'dark', ry); }
    }

    /** A pennant on a pole. */
    flag(k, x, y, z, mat = 'pale') {
        k.cyl(0.004, 0.004, 0.07, x, y + 0.035, z, 'dark', 4);
        k.box(0.004, 0.018, 0.04, x, y + 0.058, z + 0.02, mat);
    }

    /** A tree of the gardens (a trunk and a round crown). */
    tree(k, x, z, s = 1) {
        k.cyl(0.008 * s, 0.01 * s, 0.026 * s, x, 0.013 * s, z, 'wood', 5);
        k.poly(0.028 * s, x, 0.048 * s, z, 'leaf');
    }

    /** A ring of dark arches round a drum (Beauclair's arcades). */
    arcade(k, x, z, d, y, n, aw = 0.026, ah = 0.045, from = 0, to = Math.PI * 2) {
        for (let i = 0; i < n; i++) {
            const a = from + (i + 0.5) / n * (to - from), r = d / 2 + 0.002;
            k.box(aw, ah, 0.006, x + Math.cos(a) * r, y, z + Math.sin(a) * r, 'dark', -a + Math.PI / 2);
        }
    }

    /**
     * Hengfors, as on the board: a tall square keep with a lesser tower at its side, before it a
     * low round bastion holding a yellow-green lawn, and a crenellated wall running east to the
     * square gatehouse — all in the cool blue-grey stone of the north.
     */
    buildHengfors(at, scale = 1, rot = 0) {
        const k = this.kit('hengfors', at, rot, scale), M = 'hengStone', W = 'hengWall';
        this.plinth(k, 0.42);
        this.squareTower(k, -0.16, 0.12, 0.16, 0.42, M);
        this.squareTower(k, -0.03, 0.17, 0.1, 0.3, M);
        k.box(0.2, 0.15, 0.12, -0.08, 0.075, 0.05, M);
        this.curtain(k, [[-0.2, 0.02], [0.02, 0.0], [0.04, 0.12]], 0.13, 0.03, W, null, [2]);
        // the round bastion: a ring of wall round a lawn
        const bx = -0.12, bz = -0.13, br = 0.15;
        k.cyl(br * 2, br * 2.06, 0.1, bx, 0.05, bz, W, 20);
        k.crown(bx, bz, br * 2, 0.1, W);
        k.cyl(br * 2 - 0.03, br * 2 - 0.03, 0.004, bx, 0.132, bz, 'hengGrass', 20);   // over the crown's floor
        for (let i = 0; i < 4; i++) { const a = -Math.PI / 2 + (i - 1.5) * 0.45; k.box(0.012, 0.022, 0.006, bx + Math.cos(a) * (br + 0.003), 0.05, bz + Math.sin(a) * (br + 0.003), 'dark', -a + Math.PI / 2); }
        // the wall east to the gatehouse, the gatehouse of two towers
        const ring = [[0.02, -0.06], [0.3, -0.1], [0.32, 0.12], [0.06, 0.16]];
        this.curtain(k, ring, 0.11, 0.03, W);
        k.floor(ring, 0.012, 'yard');
        this.squareTower(k, 0.3, -0.1, 0.12, 0.25, M);
        this.squareTower(k, 0.32, 0.1, 0.1, 0.21, M);
        this.squareTower(k, 0.15, -0.08, 0.08, 0.17, M, 0.15);
        k.box(0.04, 0.06, 0.006, 0.3, 0.03, -0.163, 'wood');
        return k.done();
    }

    /**
     * Vizima: a cluster of fat round towers of mauve stone in the middle, the tall square donjon
     * behind them, half-timbered houses under steep slate-teal roofs packed round, a low wall
     * with a few towers and the bridge gate to the west.
     */
    buildVizima(at, scale = 1, rot = 0) {
        const k = this.kit('vizima', at, rot, scale), T = 'vizTower';
        let seed = 17;
        const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
        this.plinth(k, 0.46);
        const ring = [];
        for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; ring.push([Math.cos(a) * 0.44, Math.sin(a) * 0.3]); }
        this.curtain(k, ring, 0.07, 0.024, T);
        ring.forEach(([x, z], i) => { if (i % 2 === 0) this.roundTower(k, x, z, 0.065, 0.11, T); });
        k.floor(ring, 0.012, 'yard');
        // the bridge gate to the west
        this.squareTower(k, -0.46, 0.0, 0.08, 0.14, T);
        k.box(0.12, 0.02, 0.05, -0.54, 0.01, 0, 'vizKeep');
        k.box(0.006, 0.06, 0.04, -0.502, 0.03, 0, 'wood', Math.PI / 2);
        // the castle: fat round towers round a little court, the donjon behind
        const C = [[-0.04, -0.06, 0.12, 0.2], [0.08, -0.08, 0.11, 0.18], [0.14, 0.03, 0.1, 0.22], [-0.1, 0.04, 0.1, 0.17], [0.02, 0.07, 0.11, 0.24], [-0.14, -0.1, 0.08, 0.14]];
        k.cyl(0.24, 0.25, 0.1, 0.02, 0.05, -0.01, T, 14);
        for (const [x, z, d, hh] of C) this.roundTower(k, x, z, d, hh, T);
        this.squareTower(k, 0.2, 0.14, 0.11, 0.42, 'vizKeep');
        // the town
        for (let i = 0; i < 30; i++) {
            const a = rnd() * Math.PI * 2, r = 0.55 + rnd() * 0.33;
            const x = Math.cos(a) * 0.41 * r, z = Math.sin(a) * 0.27 * r;
            if (Math.hypot((x - 0.02) / 0.2, (z + 0.01) / 0.15) < 1 || Math.hypot((x - 0.2) / 0.09, (z - 0.14) / 0.09) < 1) continue;
            const w = 0.05 + rnd() * 0.03;
            this.townHouse(k, x, z, w, w * 0.72, 0.055 + rnd() * 0.04, 'vizPlaster', 'vizRoof', -a + Math.PI / 2, 'timber', 0.95);
        }
        return k.done();
    }

    /** Haern Caduch, the School of the Bear: a fortress of pale lavender-white stone on a ledge —
     *  two ribbed round towers guard the gate in front, tall octagonal towers stand behind, joined
     *  by crenellated walls and a gallery. */
    buildHaernCaduch(at, scale = 1, rot = 0) {
        const k = this.kit('haernCaduch', at, rot, scale), M = 'hcStone';
        this.plinth(k, 0.42);
        const ring = [[-0.3, -0.2], [0.24, -0.2], [0.32, 0.1], [0.14, 0.3], [-0.2, 0.3], [-0.34, 0.06]];
        this.curtain(k, ring, 0.13, 0.034, M);
        k.floor(ring, 0.012, 'yard');
        // the gate: two ribbed round towers and the arch between
        this.ribbedTower(k, -0.14, -0.22, 0.16, 0.3, M, 9);
        this.ribbedTower(k, 0.16, -0.21, 0.14, 0.27, M, 8);
        k.box(0.18, 0.18, 0.06, 0.01, 0.09, -0.22, M);
        k.crenels(-0.08, -0.25, 0.1, -0.25, 0.186, 0.02, M);
        k.box(0.06, 0.09, 0.006, 0.01, 0.045, -0.252, 'dark');
        // the octagonal towers behind, the tallest last, and the gallery between them
        this.roundTower(k, -0.22, 0.16, 0.15, 0.42, M, null, null, 8);
        this.roundTower(k, 0.08, 0.2, 0.15, 0.56, M, null, null, 8);
        this.roundTower(k, 0.28, 0.06, 0.1, 0.3, M, null, null, 8);
        k.box(0.16, 0.26, 0.09, -0.07, 0.13, 0.18, M, 0.2);
        k.crenels(-0.14, 0.12, 0.01, 0.15, 0.266, 0.02, M);
        for (let i = 0; i < 4; i++) k.box(0.014, 0.05, 0.006, -0.12 + i * 0.035, 0.18, 0.13 - i * 0.007, 'dark', 0.2);
        return k.done();
    }

    /** Vengerberg: the white castle under teal-blue roofs — a wide round donjon, slender towers
     *  with tall cones and pennants, blue-roofed halls, a low crenellated wall round a green
     *  bailey with trees. */
    buildVengerberg(at, scale = 1, rot = 0) {
        const k = this.kit('vengerberg', at, rot, scale), M = 'vengWall', R = 'roofBlue';
        this.plinth(k, 0.44);
        const ring = [[-0.36, -0.22], [0.06, -0.34], [0.36, -0.16], [0.32, 0.22], [-0.04, 0.34], [-0.38, 0.12]];
        this.curtain(k, ring, 0.07, 0.026, M);
        ring.forEach(([x, z], i) => { if (i % 2 === 0) this.roundTower(k, x, z, 0.055, 0.1, M, R, 0.12); else this.roundTower(k, x, z, 0.05, 0.09, M); });
        k.floor(ring, 0.012, 'vengGrass');
        // the round donjon
        k.cyl(0.2, 0.21, 0.2, 0.06, 0.1, 0.06, M, 18);
        k.crown(0.06, 0.06, 0.2, 0.2, M);
        k.cyl(0.18, 0.18, 0.004, 0.06, 0.205, 0.06, 'dark', 18);
        // slender towers with tall cones and the halls
        const tw = [[-0.16, 0.14, 0.07, 0.36, 0.2], [0.22, 0.16, 0.07, 0.3, 0.17], [-0.25, -0.06, 0.06, 0.25, 0.15], [0.18, -0.06, 0.055, 0.22, 0.14]];
        for (const [x, z, d, hh, ch] of tw) { this.roundTower(k, x, z, d, hh, M, R, ch); this.flag(k, x, hh + ch, z); }
        this.townHouse(k, -0.1, -0.12, 0.17, 0.09, 0.09, M, R, 0.25, null, 0.75);
        this.townHouse(k, -0.24, -0.2, 0.12, 0.08, 0.07, M, R, 0.45, null, 0.75);
        this.townHouse(k, -0.04, 0.24, 0.14, 0.08, 0.08, M, R, 0.1, null, 0.75);
        for (const [x, z] of [[0.26, 0.02], [-0.3, 0.04], [0.1, -0.24], [0.04, -0.18], [-0.18, 0.02]]) this.tree(k, x, z);
        return k.done();
    }

    /** Bechelt Nar: a copper-brown gothic keep — a tall ribbed round tower flaring at its foot,
     *  a gallery and a crown of spires on top, beside it a hall under a steep dark roof with a
     *  round apse and a spire. No outer wall (as painted). */
    buildBecheltNar(at, scale = 1, rot = 0) {
        const k = this.kit('becheltNar', at, rot, scale), M = 'bnStone', R = 'darkRoof';
        this.plinth(k, 0.4);
        // the tower: a flared ribbed skirt, the shaft, a gallery, the crown of spires
        const tx = -0.12, tz = -0.02;
        this.ribbedTower(k, tx, tz, 0.2, 0.14, M, 12, 1.5);
        k.cyl(0.15, 0.17, 0.42, tx, 0.14 + 0.21, tz, M, 16);
        for (let i = 0; i < 10; i++) { const a = (i + 0.5) / 10 * Math.PI * 2; k.box(0.01, 0.4, 0.01, tx + Math.cos(a) * 0.08, 0.35, tz + Math.sin(a) * 0.08, 'bnDark', -a); }
        k.cyl(0.21, 0.15, 0.05, tx, 0.585, tz, M, 16);
        k.cyl(0.13, 0.13, 0.06, tx, 0.64, tz, M, 16);
        k.cyl(0, 0.12, 0.2, tx, 0.77, tz, R, 12);
        for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; k.cyl(0, 0.022, 0.1, tx + Math.cos(a) * 0.09, 0.66, tz + Math.sin(a) * 0.09, R, 6); }
        for (let i = 0; i < 4; i++) k.box(0.012, 0.035, 0.006, tx, 0.2 + i * 0.09, tz - 0.083, 'dark');
        // the hall with its steep roof, the round apse in front, the spire
        k.box(0.22, 0.17, 0.14, 0.13, 0.085, 0.04, M, -0.1);
        k.roof(0.23, 0.16, 0.17, 0.13, 0.17, 0.04, R, -0.1);
        this.ribbedTower(k, 0.06, -0.05, 0.12, 0.12, M, 7, 1.05);
        k.cyl(0, 0.13, 0.09, 0.06, 0.18, -0.05, R, 12);
        k.box(0.03, 0.06, 0.03, 0.22, 0.31, 0.04, M);
        k.cyl(0, 0.045, 0.2, 0.22, 0.44, 0.04, R, 8);
        for (const sx of [0.1, 0.15, 0.2]) k.box(0.012, 0.04, 0.006, sx, 0.09, -0.03 - (sx - 0.13) * 0.1, 'dark', -0.1);
        return k.done();
    }

    /** Beauclair: the white palace of the duchy — round tiers ringed with arcades, the main
     *  block under salmon roofs, slender turrets with needle cones, the tall tower with its
     *  lantern and spire; before it a little walled town with red roofs among trees. */
    buildBeauclair(at, scale = 1, rot = 0) {
        const k = this.kit('beauclair', at, rot, scale), M = 'beauWhite', R = 'terracotta';
        let seed = 29;
        const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
        this.plinth(k, 0.48);
        // the lower town in front with its wall and turrets
        const ring = [[-0.42, -0.08], [-0.24, -0.4], [0.22, -0.4], [0.42, -0.08], [0.36, 0.3], [-0.36, 0.3]];
        this.curtain(k, ring, 0.055, 0.022, M, { d: 0.045, h: 0.09, mat: M, roof: R, coneH: 0.1 });
        k.floor(ring, 0.012, 'yard');
        for (let i = 0; i < 12; i++) {
            const x = -0.3 + rnd() * 0.6, z = -0.34 + rnd() * 0.12;
            if (Math.abs(x) < 0.05) continue;   // the street up to the palace
            this.townHouse(k, x, z, 0.05 + rnd() * 0.025, 0.04, 0.04 + rnd() * 0.02, M, R, (rnd() - 0.5) * 0.6, null, 0.8);
        }
        for (const [x, z] of [[-0.34, 0.12], [0.33, 0.14], [-0.3, -0.12], [0.3, -0.14], [0.36, 0.0]]) this.tree(k, x, z, 1.2);
        // the palace: two round tiers with arcades
        k.cyl(0.52, 0.54, 0.1, 0, 0.05, 0.1, M, 24);
        this.arcade(k, 0, 0.1, 0.52, 0.05, 11, 0.022, 0.05, Math.PI * 1.08, Math.PI * 1.92);
        k.cyl(0.54, 0.54, 0.012, 0, 0.104, 0.1, M, 24);
        k.cyl(0.36, 0.37, 0.09, 0, 0.145, 0.12, M, 20);
        this.arcade(k, 0, 0.12, 0.36, 0.145, 8, 0.02, 0.042, Math.PI * 1.1, Math.PI * 1.9);
        // the main block, the tall tower with its lantern and spire, the turrets
        k.box(0.26, 0.12, 0.14, 0, 0.25, 0.14, M);
        k.roof(0.27, 0.15, 0.08, 0, 0.31, 0.14, R);
        for (let i = 0; i < 5; i++) k.box(0.018, 0.04, 0.006, -0.09 + i * 0.045, 0.25, 0.067, 'dark');
        const tz = 0.2;
        k.cyl(0.1, 0.11, 0.5, 0, 0.25, tz, M, 14);
        k.cyl(0.12, 0.12, 0.014, 0, 0.5, tz, M, 14);
        k.cyl(0.07, 0.07, 0.07, 0, 0.54, tz, M, 10);
        this.arcade(k, 0, tz, 0.07, 0.54, 5, 0.016, 0.03);
        k.cyl(0, 0.09, 0.2, 0, 0.675, tz, R, 12);
        for (let i = 0; i < 3; i++) k.box(0.014, 0.03, 0.006, 0, 0.32 + i * 0.05, tz - 0.053, 'dark');
        for (const [x, z, hh, ch] of [[-0.15, 0.08, 0.32, 0.16], [0.15, 0.08, 0.32, 0.16], [-0.17, 0.22, 0.28, 0.14], [0.17, 0.22, 0.28, 0.14], [-0.24, -0.02, 0.2, 0.12], [0.24, -0.02, 0.2, 0.12]])
            this.roundTower(k, x, z, 0.055, hh, M, R, ch);
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
                k.roof(s * 1.12, s * 0.86, s * 0.42, 0, s * 0.5 - 0.012, 0, p.roof || 'thatch');
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
            if (p.roof) { k.cyl(0.075, 0.075, 0.012, 0, 0.205, 0, 'white', 10); k.cyl(0, 0.08, 0.12, 0, 0.27, 0, p.roof, 10); }   // a mage's tower: a pointed roof
            else k.crown(0, 0, 0.06, 0.2, 'white');
            for (let i = 0; i < 3; i++) k.box(0.01, 0.024, 0.006, 0, 0.06 + i * 0.05, -0.032, 'dark');
            return k.done();
        }
        if (p.kind === 'rocks') {
            // boulders lying in the grass: a few rough stones, the biggest in the middle
            const k = this.kit('rocks', at, (p.x * 7 + p.y) % 6.28), z = p.size || 1;
            const st = [[0, 0, 0.034], [0.04, 0.012, 0.022], [-0.038, -0.01, 0.026], [0.012, -0.034, 0.016], [-0.012, 0.032, 0.014]];
            for (const [x, zz, r] of st) { const b = k.poly(r * z, x * z, r * z * 0.25 - 0.008, zz * z, 'rock'); b.scaling.y = 0.6; }
            return k.done();
        }
        if (p.kind === 'hall') {
            // a dark timbered hall of Bechelt Nar's estate: a steep roof, a gable porch
            const k = this.kit('hall', at, p.rot || 0), z = p.size || 1;
            k.box(0.12 * z, 0.07 * z, 0.08 * z, 0, 0.035 * z - 0.01, 0, 'brownStone');
            k.roof(0.13 * z, 0.09 * z, 0.08 * z, 0, 0.07 * z - 0.01, 0, 'darkRoof');
            k.box(0.04 * z, 0.05 * z, 0.04 * z, 0.03 * z, 0.025 * z - 0.01, -0.055 * z, 'timber');
            for (const sx of [-0.04, 0, 0.04]) k.box(0.012 * z, 0.022 * z, 0.004, sx * z, 0.04 * z - 0.01, -0.041 * z, 'dark');
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
