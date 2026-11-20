// One-off asset tool: cuts the printed card FRAMES (not the art) out of the scanned atlases in
// Witcher/, so the card faces in the game are the original layout 1:1 while the art stays
// swappable (client/art/<ID>.*).
//
// How: every card of one colour shares the same frame (stripe, ornament, map strip, name plate,
// cost box) but has its own illustration. The per-pixel median over cards with DIFFERENT art is
// the frame; the per-pixel deviation tells frame (identical on every card) from art (differs) and
// becomes the alpha channel. Icons, names and costs that differ per card are painted over from
// the surrounding frame texture; the client draws its own on top.
//
// Needs `sharp`, which is NOT a dependency of the game — run once on a developer machine:
//   SHARP=/path/to/node_modules/sharp node witcher/tools/frames.mjs
// Output (committed): witcher/client/assets/cards/*.webp
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { createRequire } from 'node:module';
import { STARTER, COMMON } from '../shared/data/gen-data.mjs';

const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP || 'sharp');
const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const SRC = path.join(HERE, '../../Witcher');
const OUT = path.join(HERE, '../client/assets/cards');
const W = 579, H = 899;
const ATLAS = {
    A: 'Ведьмаки/31CF952873EE4D08B5859BA3EDF6FE2D3BD34A9A_httpcloud3steamusercontentcomugc20339843692024610201309DCB81F4B7AA9B217E29D4656DD593C544458.jpg',
    B: 'Ведьмаки/1058E3132D875A0D4B5202AC5990B30F6AEDD39F_httpcloud3steamusercontentcomugc2033984369202461196236CD89275EB685C16C282EB1B610F952BCBB4B6.jpg',
    S: 'Ведьмаки/Стартовые колоды.jpg',
    M: 'Монстры/Боевая колода.jpg',
};
// Frame geometry measured on the scans (pixels of a 579 × 899 card).
export const GEO = {
    plate: { x0: 238, x1: 503, y0: 817, y1: 863 },   // name plate, border included
    cost: { x0: 507, x1: 559, y0: 801, y1: 881 },    // cost box, border included
    medal: { cx: 76, cy: 822, r: 66 },               // terrain medallion
    emblem: { x0: 486, x1: 572, y0: 4, y1: 88 },      // school emblem of starter cards
};

const atlasOf = (c) => c.starter ? 'S' : c.id.startsWith('W-A') ? 'A' : 'B';
const cellOf = (c) => { const m = /^r(\d+)c(\d+)$/.exec(c.cell); return [+m[1], +m[2]]; };
const cache = new Map();
async function cell(atlas, r, c) {
    const k = `${atlas}${r},${c}`;
    if (!cache.has(k)) {
        const buf = await sharp(path.join(SRC, ATLAS[atlas]), { limitInputPixels: false })
            .extract({ left: (c - 1) * W, top: (r - 1) * H, width: W, height: H }).removeAlpha().raw().toBuffer();
        cache.set(k, buf);
    }
    return cache.get(k);
}

/** Median image (RGB) and mean absolute deviation (sum over channels) of equally sized RGB buffers. */
function medianDev(bufs) {
    const n = bufs.length, med = Buffer.alloc(W * H * 3), dev = new Float32Array(W * H), v = new Array(n);
    for (let i = 0; i < W * H; i++) {
        let d = 0;
        for (let ch = 0; ch < 3; ch++) {
            for (let k = 0; k < n; k++) v[k] = bufs[k][i * 3 + ch];
            v.sort((a, b) => a - b);
            const m = n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2;
            med[i * 3 + ch] = m;
            let s = 0;
            for (let k = 0; k < n; k++) s += Math.abs(v[k] - m);
            d += s / n;
        }
        dev[i] = d;
    }
    return { med, dev };
}

function blurAlpha(a, r) {
    const tmp = new Float32Array(W * H), out = new Uint8ClampedArray(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        let s = 0, n = 0;
        for (let k = -r; k <= r; k++) { const xx = x + k; if (xx >= 0 && xx < W) { s += a[y * W + xx]; n++; } }
        tmp[y * W + x] = s / n;
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        let s = 0, n = 0;
        for (let k = -r; k <= r; k++) { const yy = y + k; if (yy >= 0 && yy < H) { s += tmp[yy * W + x]; n++; } }
        out[y * W + x] = s / n;
    }
    return out;
}

const lum = (b, i) => 0.3 * b[i * 3] + 0.59 * b[i * 3 + 1] + 0.11 * b[i * 3 + 2];
const sat = (b, i) => Math.max(b[i * 3], b[i * 3 + 1], b[i * 3 + 2]) - Math.min(b[i * 3], b[i * 3 + 1], b[i * 3 + 2]);

/** Inside the rounded card outline (the scans have dark corners). */
function inCard(x, y, rad = 24) {
    const cx = x < rad ? rad : x > W - 1 - rad ? W - 1 - rad : x;
    const cy = y < rad ? rad : y > H - 1 - rad ? H - 1 - rad : y;
    return (x - cx) ** 2 + (y - cy) ** 2 <= rad * rad;
}

// Paint pixels flagged in `mask` with the nearest clean pixel further down the same column
// (the stripe texture runs vertically, so this keeps its grain).
function fillDown(rgb, mask, alpha, maxK = 160) {
    for (let y = H - 1; y >= 0; y--) for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (!mask[i]) continue;
        for (let k = 6; k < maxK; k++) {
            const yy = y + k; if (yy >= H) break;
            const j = yy * W + x;
            if (!mask[j] && alpha[j] > 200) { rgb[i * 3] = rgb[j * 3]; rgb[i * 3 + 1] = rgb[j * 3 + 1]; rgb[i * 3 + 2] = rgb[j * 3 + 2]; break; }
        }
    }
}
function runningMedian(arr, r) {
    return arr.map((_, i) => {
        const w = arr.slice(Math.max(0, i - r), i + r + 1).sort((a, b) => a - b);
        return w[w.length >> 1];
    });
}
function erode(mask, r) {
    const inv = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) inv[i] = mask[i] ? 0 : 1;
    const d = dilate(inv, r);
    for (let i = 0; i < W * H; i++) inv[i] = d[i] ? 0 : 1;
    return inv;
}
function connectedToEdge(mask) {
    const out = new Uint8Array(W * H), stack = [];
    for (let y = 0; y < H; y++) for (const x of [10, W - 11]) if (mask[y * W + x]) stack.push(y * W + x);
    for (let x = 0; x < W; x++) for (const y of [10, H - 11]) if (mask[y * W + x]) stack.push(y * W + x);
    while (stack.length) {
        const i = stack.pop();
        if (out[i] || !mask[i]) continue;
        out[i] = 1;
        const x = i % W, y = (i / W) | 0;
        if (x > 0) stack.push(i - 1); if (x < W - 1) stack.push(i + 1);
        if (y > 0) stack.push(i - W); if (y < H - 1) stack.push(i + W);
    }
    return out;
}
function repaintStripeTop(rgb, a) {
    const SHIFT = 270;
    for (let y = 12; y < 300; y++) for (let x = 10; x < 150; x++) {
        const i = y * W + x, j = (y + SHIFT) * W + x;
        if (a[i] < 200) continue;
        // Only inside the stripe body (keep the dark outline near its right edge).
        let inside = true;
        for (let k = 1; k <= 8; k++) if (a[i + k] < 200 || a[j + k] < 200 || a[j] < 200) { inside = false; break; }
        if (!inside) continue;
        rgb[i * 3] = rgb[j * 3]; rgb[i * 3 + 1] = rgb[j * 3 + 1]; rgb[i * 3 + 2] = rgb[j * 3 + 2];
    }
}
function dilate(mask, r) {
    const out = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (!mask[y * W + x]) continue;
        for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
            const xx = x + dx, yy = y + dy;
            if (xx >= 0 && yy >= 0 && xx < W && yy < H) out[yy * W + xx] = 1;
        }
    }
    return out;
}

// Name plate: interpolate between its text-free ends, row by row, with a little grain.
function fillPlate(rgb) {
    const { x0, x1, y0, y1 } = GEO.plate;
    const ix0 = x0 + 6, ix1 = x1 - 6, iy0 = y0 + 6, iy1 = y1 - 6;
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5);
    for (let y = iy0; y <= iy1; y++) {
        const avg = (xa, xb) => { const s = [0, 0, 0]; for (let x = xa; x < xb; x++) for (let c = 0; c < 3; c++) s[c] += rgb[(y * W + x) * 3 + c]; return s.map(v => v / (xb - xa)); };
        const L = avg(ix0, ix0 + 10), R = avg(ix1 - 10, ix1);
        for (let x = ix0 + 10; x < ix1 - 10; x++) {
            const t = (x - ix0) / (ix1 - ix0), g = rnd() * 10;
            for (let c = 0; c < 3; c++) rgb[(y * W + x) * 3 + c] = Math.max(0, Math.min(255, L[c] * (1 - t) + R[c] * t + g));
        }
    }
}
// Cost box: replace the (light) printed digit with the box's dark fill.
function fillCost(rgb) {
    const { x0, x1, y0, y1 } = GEO.cost;
    const dark = [0, 0, 0]; let n = 0;
    for (let y = y0 + 8; y < y1 - 8; y++) for (let x = x0 + 7; x < x1 - 7; x++) { const i = y * W + x; if (lum(rgb, i) < 70) { for (let c = 0; c < 3; c++) dark[c] += rgb[i * 3 + c]; n++; } }
    for (let c = 0; c < 3; c++) dark[c] = n ? dark[c] / n : 30;
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5);
    for (let y = y0 + 7; y < y1 - 7; y++) for (let x = x0 + 7; x < x1 - 7; x++) {
        const i = y * W + x, g = rnd() * 8;
        for (let c = 0; c < 3; c++) rgb[i * 3 + c] = dark[c] + g;
    }
}

async function save(rgb, alpha, file, w = W, h = H, x0 = 0, y0 = 0) {
    const out = Buffer.alloc(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = (y + y0) * W + (x + x0), o = (y * w + x) * 4;
        out[o] = rgb[i * 3]; out[o + 1] = rgb[i * 3 + 1]; out[o + 2] = rgb[i * 3 + 2]; out[o + 3] = alpha ? alpha[i] : 255;
    }
    await sharp(out, { raw: { width: w, height: h, channels: 4 } }).webp({ quality: 90, alphaQuality: 90 }).toFile(path.join(OUT, file));
    console.log('  ' + file);
}

// Representative face per colour (no links, so nothing sticks out of the stripe) and a
// generous outline around that colour's ornament at the foot of the stripe.
const REP = { blue: 'W-START-02', red: 'W-START-03', green: 'W-START-05', purple: 'W-START-27', yellow: 'W-START-09' };
const ORNAMENT = {
    blue: [[6, 466], [80, 466], [104, 560], [118, 700], [108, 766], [0, 766], [0, 600]],
    red: [[6, 466], [90, 466], [114, 560], [110, 700], [104, 768], [0, 768], [0, 600]],
    green: [[0, 516], [84, 516], [130, 556], [134, 640], [120, 766], [0, 766]],
    yellow: [[0, 496], [84, 496], [120, 556], [120, 700], [104, 766], [0, 766]],
    purple: [[0, 486], [94, 486], [134, 576], [134, 700], [114, 766], [0, 766]],
};

/** Per row, the right edge of the stripe on one face: its dark ink outline followed by art. */
function stripeEdges(rgb) {
    const ref = [0, 0, 0]; let n = 0;
    for (let y = 300; y < 400; y++) for (let x = 30; x < 60; x++) { const i = y * W + x; for (let c = 0; c < 3; c++) ref[c] += rgb[i * 3 + c]; n++; }
    for (let c = 0; c < 3; c++) ref[c] /= n;
    const far = (i) => Math.abs(rgb[i * 3] - ref[0]) + Math.abs(rgb[i * 3 + 1] - ref[1]) + Math.abs(rgb[i * 3 + 2] - ref[2]) > 95;
    const edges = new Array(H).fill(NaN);
    for (let y = 8; y < 770; y++) {
        for (let x = 40; x < 175; x++) {
            const i = y * W + x;
            if (lum(rgb, i) > 52) continue;
            let farN = 0;
            for (let k = 6; k < 22; k++) if (far(i + k)) farN++;
            if (farN < 12) continue;
            let e = x;
            while (e < x + 7 && lum(rgb, y * W + e + 1) < 62) e++;
            edges[y] = e + 1;
            break;
        }
    }
    // Rows without a clean edge (under the ornament): interpolate between neighbours.
    for (let y = 8; y < 770; y++) if (isNaN(edges[y])) {
        let a = y - 1; while (a >= 8 && isNaN(edges[a])) a--;
        let b = y + 1; while (b < 770 && isNaN(edges[b])) b++;
        const ea = a >= 8 ? edges[a] : edges[b], eb = b < 770 ? edges[b] : ea;
        edges[y] = a >= 8 && b < 770 ? ea + (eb - ea) * (y - a) / (b - a) : (ea ?? eb ?? 90);
    }
    // Remove one-row outliers but keep the jagged outline.
    return edges.map((e, y) => { const w = edges.slice(Math.max(8, y - 2), y + 3).filter(v => !isNaN(v)).sort((p, q) => p - q); return w.length ? w[w.length >> 1] : e; });
}

let SHARED_EDGE = null;
const stripLimit = (x) => x < 150 ? 744 + 48 * x / 150 : x < 236 ? 792 + 16 * (x - 150) / 86 : 808 + 42 * (x - 236) / 343;
async function frames() {
    const cards = [...STARTER, ...COMMON];
    for (const color of ['blue', 'red', 'green', 'purple', 'yellow']) {
        // Median over one face per distinct illustration (same name = same art) and deviation.
        const byName = new Map();
        for (const c of cards.filter(c => c.color === color)) {
            const prev = byName.get(c.name);
            if (!prev || c.links.length < prev.links.length) byName.set(c.name, c);
        }
        const bufs = [];
        for (const c of byName.values()) { const [r, k] = cellOf(c); bufs.push(await cell(atlasOf(c), r, k)); }
        const { med, dev } = medianDev(bufs);
        const rep = cards.find(c => c.id === REP[color]);
        const [rr, rk] = cellOf(rep);
        const one = Buffer.from(await cell(atlasOf(rep), rr, rk));
        // Every colour uses the same stripe outline; it is traced once on the purple face, whose
        // art contrasts best with the stripe.
        const edge = SHARED_EDGE || (SHARED_EDGE = stripeEdges(Buffer.from(await cell('S', 3, 7))));

        // Ornament: low deviation (frame) inside its outline; small gaps closed, art blobs opened away.
        let orn = new Uint8Array(W * H);
        const poly = ORNAMENT[color];
        for (let y = 440; y < 790; y++) for (let x = 0; x < 160; x++) if (inPoly(x + 0.5, y + 0.5, poly) && dev[y * W + x] < 36) orn[y * W + x] = 1;
        orn = erode(dilate(orn, 2), 2);
        orn = dilate(erode(orn, 2), 2);
        for (let y = 440; y < 790; y++) for (let x = 0; x < 160; x++) if (!inPoly(x + 0.5, y + 0.5, poly)) orn[y * W + x] = 0;

        // Bottom strip: per column, the run of low deviation up from the bottom edge.
        const low = (x, y) => dev[y * W + x] < 34;
        const colTop = new Array(W).fill(H);
        for (let x = 8; x < W - 8; x++) {
            let y = H - 9, last = H - 9;
            while (y > 726) { if (low(x, y)) last = y; else if (last - y > 9) break; y--; }
            colTop[x] = last;
        }
        const capCol = runningMedian(colTop, 30);

        const a = new Uint8ClampedArray(W * H);
        const rgb = Buffer.from(med);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const i = y * W + x;
            if (!inCard(x, y)) continue;
            const stripe = y < 790 && x <= edge[y];
            const bottom = y >= Math.max(colTop[x], capCol[x] - 4, stripLimit(x)) || Math.hypot(x - GEO.medal.cx, y - GEO.medal.cy) < GEO.medal.r + 10;
            if (stripe && !orn[i]) { rgb[i * 3] = one[i * 3]; rgb[i * 3 + 1] = one[i * 3 + 1]; rgb[i * 3 + 2] = one[i * 3 + 2]; }
            if (stripe || orn[i] || bottom) a[i] = 255;
        }
        // Solid parts that must not show holes: plate, cost box, border ring.
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const i = y * W + x;
            if (!inCard(x, y)) { a[i] = 0; continue; }
            const p = GEO.plate, c = GEO.cost;
            if ((x >= p.x0 && x <= p.x1 && y >= p.y0 && y <= p.y1) || (x >= c.x0 && x <= c.x1 && y >= c.y0 && y <= c.y1)) a[i] = 255;
            if (!inCard(x, y, 24) || x < 7 || y < 7 || x > W - 8 || y > H - 8) a[i] = 255;
        }
        // Icons printed on the top of the stripe differ per card: repaint that part of the stripe
        // with its own texture from further down.
        const icon = new Uint8Array(W * H);
        for (let y = 12; y < 260; y++) for (let x = 12; x < edge[y] - 5; x++) {
            const i = y * W + x;
            if (lum(rgb, i) > 188 && sat(rgb, i) < 70) icon[i] = 1;
        }
        fillDown(rgb, dilate(icon, 3), a, 220);
        fillPlate(rgb);
        fillCost(rgb);
        const alpha = blurAlpha(a, 1);
        for (let i = 0; i < W * H; i++) { const x = i % W, y = (i / W) | 0; if (!inCard(x, y)) alpha[i] = 0; }
        await save(rgb, alpha, `frame-${color}.webp`);
        // Link tab texture: a clean piece of this colour's stripe, widened to the tab's width.
        const tw = 48, th = 150, tx = 24, ty = 120, tab = Buffer.alloc(tw * th * 3);
        for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) for (let c = 0; c < 3; c++) tab[(y * tw + x) * 3 + c] = rgb[((ty + y) * W + tx + x) * 3 + c];
        await sharp(tab, { raw: { width: tw, height: th, channels: 3 } }).resize(84, 150, { fit: 'fill' }).webp({ quality: 88 }).toFile(path.join(OUT, `tab-${color}.webp`));
        console.log(`  tab-${color}.webp`);
    }
}

async function medallions() {
    const cards = [...STARTER, ...COMMON];
    const { cx, cy, r } = GEO.medal;
    for (const terrain of ['forest', 'mountain', 'water', 'joker']) {
        const list = cards.filter(c => c.terrain === terrain).slice(0, 9);
        const bufs = [];
        for (const c of list) { const [rr, k] = cellOf(c); bufs.push(await cell(atlasOf(c), rr, k)); }
        const { med } = medianDev(bufs);
        const a = new Uint8ClampedArray(W * H);
        for (let y = cy - r - 2; y <= cy + r + 2; y++) for (let x = Math.max(0, cx - r - 2); x <= cx + r + 2; x++) {
            const d = Math.hypot(x - cx, y - cy);
            a[y * W + x] = 255 * Math.max(0, Math.min(1, r + 0.5 - d));
        }
        await save(med, a, `terrain-${terrain}.webp`, 2 * r + 4, 2 * r + 4, cx - r - 2, cy - r - 2);
    }
}

async function emblems() {
    const { x0, x1, y0, y1 } = GEO.emblem;
    for (const school of ['wolf', 'cat', 'bear', 'viper', 'griffin', 'manticore', 'ciri']) {
        const list = STARTER.filter(c => c.school === school);
        if (!list.length) continue;
        const byName = new Map();
        for (const c of list) if (!byName.has(c.name)) byName.set(c.name, c);
        const bufs = [];
        for (const c of byName.values()) { const [r, k] = cellOf(c); bufs.push(await cell('S', r, k)); }
        // The emblem is a light print over the art: the per-pixel minimum over different art keeps
        // it and drops the art; its brightness becomes the alpha.
        const med = Buffer.alloc(W * H * 3), a = new Uint8ClampedArray(W * H);
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
            const i = y * W + x;
            let best = 0;
            for (let ch = 0; ch < 3; ch++) { let mn = 255; for (const b of bufs) mn = Math.min(mn, b[i * 3 + ch]); med[i * 3 + ch] = mn; }
            best = lum(med, i);
            a[i] = 255 * Math.max(0, Math.min(1, (best - 62) / 60));
            const k = 255 / Math.max(60, best);
            for (let ch = 0; ch < 3; ch++) med[i * 3 + ch] = Math.min(255, med[i * 3 + ch] * Math.min(1.6, k));
        }
        await save(med, blurAlpha(a, 1), `emblem-${school}.webp`, x1 - x0, y1 - y0, x0, y0);
    }
}

// Monster attack cards: one background (frame, top pentagon with the ram skull) — the median
// over all 20 faces, where the varying text boxes and slashes average out — plus the two
// pentagon badges cut out as sprites.
async function attackCards() {
    const bufs = [];
    for (let r = 1; r <= 4; r++) for (let c = 1; c <= 5; c++) bufs.push(await cell('M', r, c));
    // Per card, mark what is printed on top of the background: parchment boxes (light beige)
    // and slashes/numbers (light) — with a margin for their dark outlines.
    const covered = bufs.map(b => {
        const m = new Uint8Array(W * H);
        for (let i = 0; i < W * H; i++) if (lum(b, i) > 120) m[i] = 1;
        return dilate(m, 7);
    });
    const med = Buffer.alloc(W * H * 3), v = [];
    for (let i = 0; i < W * H; i++) for (let ch = 0; ch < 3; ch++) {
        v.length = 0;
        for (let k = 0; k < bufs.length; k++) if (!covered[k][i]) v.push(bufs[k][i * 3 + ch]);
        if (!v.length) for (let k = 0; k < bufs.length; k++) v.push(bufs[k][i * 3 + ch]);
        v.sort((x, y) => x - y);
        med[i * 3 + ch] = v[v.length >> 1];
    }
    const a = new Uint8ClampedArray(W * H);
    for (let i = 0; i < W * H; i++) a[i] = inCard(i % W, (i / W) | 0, 26) ? 255 : 0;
    await save(med, a, 'attack-bg.webp');
    // Pentagon badges: ram skull (strike) and fangs (bite), cut from the first face.
    const first = bufs[0];
    for (const [name, top] of [['strike', 22], ['bite', 472]]) {
        const pa = new Uint8ClampedArray(W * H);
        const poly = PENT.map(([x, y]) => [x + PENT_X, y + top]);
        for (let y = top; y < top + PENT_H; y++) for (let x = PENT_X; x < PENT_X + PENT_W; x++) pa[y * W + x] = inPoly(x + 0.5, y + 0.5, poly) ? 255 : 0;
        await save(first, blurAlpha(pa, 1), `pent-${name}.webp`, PENT_W, PENT_H, PENT_X, top);
    }
}
// Pentagon outline relative to its box (measured on the scan).
const PENT_X = 220, PENT_W = 140, PENT_H = 136;
const PENT = [[22, 3], [118, 3], [137, 70], [70, 132], [3, 70]];
function inPoly(x, y, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, yi] = poly[i], [xj, yj] = poly[j];
        if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
}

fs.mkdirSync(OUT, { recursive: true });
// Light printed glyphs (slash, burning card, skill badges) as white sprites with alpha from
// luminance; the bounding box is found inside a search box so the sprite is tight.
const GLYPHS = [
    // name, atlas, row, col, search box x0 y0 x1 y1
    ['glyph-slash', 'M', 1, 1, 180, 290, 290, 385],
    ['glyph-burn', 'M', 2, 5, 255, 295, 360, 425],
    ['glyph-shield', 'S', 1, 5, 34, 18, 102, 96],
    ['glyph-defense', 'M', 1, 4, 318, 742, 462, 862],
    ['glyph-alchemy', 'M', 3, 2, 318, 742, 462, 862],
    ['glyph-spec', 'M', 3, 4, 318, 742, 462, 862],
    ['glyph-combat', 'M', 4, 1, 318, 742, 462, 862],
];
async function glyphs() {
    for (const [name, atlas, r, c, x0, y0, x1, y1] of GLYPHS) {
        const b = await cell(atlas, r, c);
        // Background level: median luminance of the box border.
        const border = [];
        for (let x = x0; x <= x1; x++) border.push(lum(b, y0 * W + x), lum(b, y1 * W + x));
        border.sort((p, q) => p - q);
        const bg = border[border.length >> 1];
        const lo = Math.min(Math.max(bg + 45, 110), 200), hi = Math.min(lo + 70, 250);
        const a = new Uint8ClampedArray(W * H), rgb = Buffer.alloc(W * H * 3, 0);
        let bx0 = W, by0 = H, bx1 = 0, by1 = 0;
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
            const i = y * W + x, l = lum(b, i);
            const al = Math.max(0, Math.min(1, (l - lo) / (hi - lo)));
            a[i] = 255 * al;
            rgb[i * 3] = 246; rgb[i * 3 + 1] = 240; rgb[i * 3 + 2] = 226;
            if (al > 0.3) { bx0 = Math.min(bx0, x); by0 = Math.min(by0, y); bx1 = Math.max(bx1, x); by1 = Math.max(by1, y); }
        }
        bx0 -= 3; by0 -= 3; bx1 += 3; by1 += 3;
        await save(rgb, a, name + '.webp', bx1 - bx0 + 1, by1 - by0 + 1, bx0, by0);
        console.log('    bbox', name, bx0, by0, bx1 - bx0 + 1, by1 - by0 + 1);
    }
}

// Parchment text panel of the attack cards: cut from a three-line panel, the text inpainted by
// pull-push diffusion (strokes are thin, the mottled paper closes over them), the strip hidden
// under the pentagon copied from further left. Used as a CSS border-image.
const PANEL = { x0: 36, y0: 128, x1: 543, y1: 336 };
async function panel() {
    const b = Buffer.from(await cell('M', 4, 2));
    const { x0, y0, x1, y1 } = PANEL;
    // Hidden top edge under the pentagon.
    const pent = PENT.map(([x, y]) => [x + PENT_X, y + 22]);
    for (let y = y0; y < 166; y++) for (let x = 212; x < 372; x++) {
        let near = false;
        for (let k = -5; k <= 5 && !near; k += 5) for (let j = -5; j <= 5 && !near; j += 5) near = inPoly(x + j, y + k, pent);
        if (!near) continue;
        const s = (y * W + x - 150) * 3, d = (y * W + x) * 3;
        b[d] = b[s]; b[d + 1] = b[s + 1]; b[d + 2] = b[s + 2];
    }
    // Text mask: clearly darker than the local paper, inside the panel interior.
    const m = new Uint8Array(W * H);
    for (let y = y0 + 20; y < y1 - 20; y++) for (let x = x0 + 22; x < x1 - 22; x++) {
        const i = y * W + x;
        let s = 0, n = 0;
        for (let k = -14; k <= 14; k += 7) for (let j = -14; j <= 14; j += 7) { s += lum(b, (y + k) * W + x + j); n++; }
        if (lum(b, i) < s / n - 22) m[i] = 1;
    }
    const mm = dilate(m, 2);
    // Iterative diffusion over the masked pixels.
    const f = new Float32Array(W * H * 3);
    for (let i = 0; i < W * H * 3; i++) f[i] = b[i];
    for (let it = 0; it < 220; it++) {
        for (let y = y0 + 18; y < y1 - 18; y++) for (let x = x0 + 18; x < x1 - 18; x++) {
            const i = y * W + x;
            if (!mm[i]) continue;
            for (let c = 0; c < 3; c++) f[i * 3 + c] = (f[(i - 1) * 3 + c] + f[(i + 1) * 3 + c] + f[(i - W) * 3 + c] + f[(i + W) * 3 + c]) / 4;
        }
    }
    // Re-grain the filled pixels so they do not look smooth.
    let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) - 0.5;
    for (let i = 0; i < W * H; i++) if (mm[i]) { const g = rnd() * 14; for (let c = 0; c < 3; c++) b[i * 3 + c] = Math.max(0, Math.min(255, f[i * 3 + c] + g)); }
    // Alpha: the paper and its dark torn rim against the card background (dark red/brown).
    const a = new Uint8ClampedArray(W * H);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) a[y * W + x] = 255;
    // Corners outside the torn rim: transparent where the pixel is the card background.
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const edge = Math.min(x - x0, x1 - x, y - y0, y1 - y);
        if (edge > 14) continue;
        const i = y * W + x;
        const r = b[i * 3], g = b[i * 3 + 1], bl = b[i * 3 + 2];
        if (r - g > 38 && r > 70) a[i] = 0;
    }
    await save(b, blurAlpha(a, 1), 'panel.webp', x1 - x0 + 1, y1 - y0 + 1, x0, y0);
}

// Event cards: the parchment (a per-pixel 92nd-percentile-by-brightness of all 36 city events,
// so the ink of every card drops out) and the «—∞✿∞—» divider of CITY1-01.
async function eventCards() {
    const file = path.join(SRC, 'События/Городские события 1.jpg');
    const bufs = [];
    for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) bufs.push(await sharp(file, { limitInputPixels: false }).extract({ left: c * W, top: r * H, width: W, height: H }).removeAlpha().raw().toBuffer());
    const o = Buffer.alloc(W * H * 3);
    const pick = Math.floor(bufs.length * 0.92);
    for (let i = 0; i < o.length; i += 3) {
        const k = bufs.map((b, n) => [b[i] + b[i + 1] + b[i + 2], n]).sort((a, b) => a[0] - b[0])[pick][1];
        o[i] = bufs[k][i]; o[i + 1] = bufs[k][i + 1]; o[i + 2] = bufs[k][i + 2];
    }
    await sharp(o, { raw: { width: W, height: H, channels: 3 } }).webp({ quality: 80 }).toFile(path.join(OUT, 'event-bg.webp'));
    const { data, info } = await sharp(file, { limitInputPixels: false }).extract({ left: 60, top: 441, width: 460, height: 26 }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const d = Buffer.alloc(info.width * info.height * 4);
    for (let i = 0, j = 0; i < data.length; i += 3, j += 4) {
        const l = data[i] * 0.3 + data[i + 1] * 0.59 + data[i + 2] * 0.11;
        d[j] = 38; d[j + 1] = 32; d[j + 2] = 28; d[j + 3] = Math.max(0, Math.min(255, (145 - l) * 3.5));
    }
    await sharp(d, { raw: { width: info.width, height: info.height, channels: 4 } }).webp({ quality: 90, alphaQuality: 100 }).toFile(path.join(OUT, 'event-div.webp'));
}

const only = process.argv[2];
if (!only || only === 'events') await eventCards();
if (!only || only === 'glyphs') await glyphs();
if (!only || only === 'panel') await panel();
if (!only || only === 'frames') await frames();
if (!only || only === 'medals') await medallions();
if (!only || only === 'emblems') await emblems();
if (!only || only === 'attack') await attackCards();
