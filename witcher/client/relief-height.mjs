// Relief of the board: a height field computed from the painted Continent itself, so the 3D
// mountains stand exactly where the artist drew them. Pure functions (no Babylon, no DOM): the
// client feeds them the pixels of a region of continent.jpg, a node test can feed them anything.
//
// How a pixel becomes height:
//   * the land stands a little above the table (`base`), so that the painted rivers can be cut
//     into it; the plains swell into gentle hills (the painter's own shading of the grass plus a
//     soft noise);
//   * rivers — pale cool strokes that are thin and run through grass — become beds below the land;
//     under a painted bridge the bed is carved explicitly (the bridge itself is not water);
//   * "rock" — the cool grey-blue and white of the painted mountains (not green: grass, forest;
//     not warm: roads, parchment, wood; not saturated: badges; never a river) — rises: a small
//     blur shapes the slopes, a large one says how deep into a massif a point is, the painted
//     light (blurred: raw, every brushstroke became a needle) adds the ridges;
//   * the steepness is capped (limitSlope): a steeper face stretched the painting into streaks;
//   * level zones: location plates and badges (read there, miniatures stand there), terraces for
//     3D buildings, and the region edge that meets the flat board.

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };

/** Separable box blur (two passes ≈ a soft gaussian). */
export function blur(src, w, h, r) {
    if (r < 1) return src.slice();
    const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
    const n = 2 * r + 1;
    for (let y = 0; y < h; y++) {
        let s = 0;
        for (let x = -r; x <= r; x++) s += src[y * w + Math.min(w - 1, Math.max(0, x))];
        for (let x = 0; x < w; x++) {
            tmp[y * w + x] = s / n;
            s += src[y * w + Math.min(w - 1, x + r + 1)] - src[y * w + Math.max(0, x - r)];
        }
    }
    for (let x = 0; x < w; x++) {
        let s = 0;
        for (let y = -r; y <= r; y++) s += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
        for (let y = 0; y < h; y++) {
            out[y * w + x] = s / n;
            s += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
        }
    }
    return out;
}
const blur2 = (a, w, h, r) => blur(blur(a, w, h, r), w, h, r);

/** Per-pixel classes of the painting: rock (mountains), plate (parchment) and luminance. */
export function classify(rgba, w, h) {
    const rock = new Float32Array(w * h), plate = new Float32Array(w * h), lum = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) {
        const r = rgba[i * 4] / 255, g = rgba[i * 4 + 1] / 255, b = rgba[i * 4 + 2] / 255;
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
        const l = 0.3 * r + 0.59 * g + 0.11 * b, sat = mx > 0 ? (mx - mn) / mx : 0;
        lum[i] = l;
        const green = g - Math.max(r, b);            // grass, forest
        const cool = b - r;                           // the painted mountains are blue-grey
        rock[i] = smooth(0.035, -0.01, green) * smooth(-0.03, 0.05, cool) * smooth(0.16, 0.3, l) * (1 - smooth(0.32, 0.5, sat));
        // parchment plates and frames: light, warm, low saturation
        plate[i] = smooth(0.5, 0.62, l) * smooth(0.02, 0.07, r - b) * (1 - smooth(0.3, 0.45, sat));
    }
    return { rock, plate, lum };
}

/** Smooth deterministic value noise in [-1, 1] (gentle hills where nothing else is painted). */
export function valueNoise(x, y, seed = 1) {
    const hash = (i, j) => { let n = (i * 374761393 + j * 668265263 + seed * 2147483647) | 0; n = (n ^ (n >>> 13)) * 1274126177 | 0; return ((n ^ (n >>> 16)) >>> 0) / 4294967295 * 2 - 1; };
    const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const a = hash(i, j), b = hash(i + 1, j), c = hash(i, j + 1), d = hash(i + 1, j + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Rivers: pale, cool, light strokes that are THIN (their neighbourhood is mostly not water) and run
 *  through grass — the light edge of a rock in the mountains is cool and light too, but it has no
 *  grass beside it. Returns a 0..1 mask. */
export function riverMask(rgba, w, h) {
    const n = w * h, water = new Float32Array(n), grass = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        const r = rgba[i * 4] / 255, g = rgba[i * 4 + 1] / 255, b = rgba[i * 4 + 2] / 255;
        const l = 0.3 * r + 0.59 * g + 0.11 * b;
        water[i] = smooth(0.01, 0.06, b - r) * smooth(0.3, 0.4, l) * (1 - smooth(0.8, 0.9, l)) * smooth(-0.06, -0.01, b - g);
        // grass and forest (green over red, not bluer than green — the dark teal grass too) and roads
        grass[i] = smooth(-0.025, 0.01, g - b) * smooth(0.0, 0.03, g - r) + smooth(0.04, 0.1, r - b) * (1 - smooth(0.5, 0.62, l));
    }
    const wide = blur2(water, w, h, 8), nearGrass = blur2(grass, w, h, 6);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = water[i] * (1 - smooth(0.35, 0.6, wide[i])) * smooth(0.15, 0.35, nearGrass[i]);
    // a river is a stroke, not a speck: the light tips of painted firs pass the colour test one by one
    const body = blur2(out, w, h, 3);
    for (let i = 0; i < n; i++) out[i] *= smooth(0.1, 0.25, body[i]);
    return out;
}

/** Caps the steepness: no point may stand higher than a neighbour + `s` per pixel of distance (two
 *  chamfer sweeps). Peaks that were steeper are cut down — a slope steeper than ~50° stretched the
 *  painting into streaks. */
export function limitSlope(f, w, h, s) {
    const d = s * Math.SQRT2;
    for (let pass = 0; pass < 2; pass++) {
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const i = y * w + x; let v = f[i];
            if (x > 0) v = Math.min(v, f[i - 1] + s);
            if (y > 0) { v = Math.min(v, f[i - w] + s); if (x > 0) v = Math.min(v, f[i - w - 1] + d); if (x < w - 1) v = Math.min(v, f[i - w + 1] + d); }
            f[i] = v;
        }
        for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
            const i = y * w + x; let v = f[i];
            if (x < w - 1) v = Math.min(v, f[i + 1] + s);
            if (y < h - 1) { v = Math.min(v, f[i + w] + s); if (x < w - 1) v = Math.min(v, f[i + w + 1] + d); if (x > 0) v = Math.min(v, f[i + w - 1] + d); }
            f[i] = v;
        }
    }
    return f;
}

/**
 * Height field of one region (heights in world units, row-major w×h). The land stands `base` above
 * the table so that rivers can be cut into it; the region border sinks to the table.
 * opt: { maxH, base, hills, riverDepth, slope (max rise per pixel),
 *        flat: [{x, y, rx, ry}] ellipses levelled to the base (plates, badges, miniature spots),
 *        plateau: {x, y, r, h} — terraces for buildings (one object or an array),
 *        carve: [{x, y, len, width, angle}] — river beds under painted bridges (angle — of the RIVER, radians),
 *        edge: falloff in px at the region border, open: {top, right, bottom, left} board-edge sides }
 */
export function heightField(rgba, w, h, opt = {}) {
    const maxH = opt.maxH ?? 0.3, edge = opt.edge ?? 70, base = opt.base ?? 0.045;
    const hillsH = opt.hills ?? 0.028, depth = opt.riverDepth ?? 0.04, slopeMax = opt.slope ?? 0.0065;
    const n = w * h;
    const { rock, plate, lum } = classify(rgba, w, h);
    const river = blur(riverMask(rgba, w, h), w, h, 2);
    for (let i = 0; i < n; i++) rock[i] *= 1 - smooth(0.1, 0.4, river[i]);   // a river is never a mountain
    const slope = blur2(rock, w, h, 7);
    const massif = blur2(rock, w, h, 22);
    // The painted light is detail, not shape: blurred enough that a brushstroke does not become a
    // spike (raw, it turned every highlight into a crystal needle).
    const light = blur2(lum, w, h, 5);
    // Hills of the plains: the painter shaded them (lighter toward the light, darker behind), so the
    // difference between a near and a far average of the grass is the swell; noise breaks the rest.
    const near = blur2(lum, w, h, 12), far = blur2(lum, w, h, 40);
    // plates: dilate the parchment so the slope stops before the text, not on it
    const plates = blur2(plate, w, h, 7);
    const out = new Float32Array(n);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x;
        // a thin cool stroke in the grass (a road edge) is not a mountain: cut off by the massif blur
        const m = smooth(0.12, 0.75, slope[i]) * smooth(0.18, 0.45, massif[i]);
        const deep = 0.3 + 0.7 * smooth(0.25, 0.9, massif[i]);
        const ridge = 0.5 + 0.5 * smooth(0.2, 0.75, light[i]);
        const swell = Math.max(-1, Math.min(1, (near[i] - far[i]) * 9)) * 0.5
            + valueNoise(x / 110, y / 110, 3) * 0.35 + valueNoise(x / 45, y / 45, 7) * 0.15;
        let v = base + hillsH * swell * (1 - m) + maxH * m * deep * ridge;
        v *= 1 - smooth(0.06, 0.22, plates[i]) * (1 - base / Math.max(base, v));   // plates: down to the base
        out[i] = v;
    }
    // terraces of 3D buildings: level, blending into the slope around them
    for (const pl of [].concat(opt.plateau || [])) {
        for (let y = Math.max(0, Math.floor(pl.y - pl.r * 2)); y < Math.min(h, pl.y + pl.r * 2); y++) {
            for (let x = Math.max(0, Math.floor(pl.x - pl.r * 2)); x < Math.min(w, pl.x + pl.r * 2); x++) {
                const k = 1 - smooth(1, 1.8, Math.hypot(x - pl.x, y - pl.y) / pl.r);
                out[y * w + x] = out[y * w + x] * (1 - k) + pl.h * k;
            }
        }
    }
    // river beds: the painted rivers, and the stretch hidden under a painted bridge
    const bed = river.slice();
    for (const c of opt.carve || []) {
        const ca = Math.cos(c.angle), sa = Math.sin(c.angle), R = c.len / 2 + c.width;
        for (let y = Math.max(0, Math.floor(c.y - R)); y < Math.min(h, c.y + R); y++) for (let x = Math.max(0, Math.floor(c.x - R)); x < Math.min(w, c.x + R); x++) {
            const dx = x - c.x, dy = y - c.y, along = dx * ca + dy * sa, across = -dx * sa + dy * ca;
            const k = (1 - smooth(c.len / 2 - 2, c.len / 2 + 2, Math.abs(along))) * (1 - smooth(c.width / 2 - 1.5, c.width / 2 + 1.5, Math.abs(across)));
            bed[y * w + x] = Math.max(bed[y * w + x], k);
        }
    }
    for (let i = 0; i < n; i++) out[i] -= depth * smooth(0.06, 0.3, bed[i]);
    // level zones (location plates, badges, the spots where miniatures stand) — after the
    // terraces: a name banner next to a castle stays level even if the terrace reaches it
    for (const f of opt.flat || []) {
        const x0 = Math.max(0, Math.floor(f.x - f.rx * 1.8)), x1 = Math.min(w - 1, Math.ceil(f.x + f.rx * 1.8));
        const y0 = Math.max(0, Math.floor(f.y - f.ry * 1.8)), y1 = Math.min(h - 1, Math.ceil(f.y + f.ry * 1.8));
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
            const k = smooth(1, 1.8, Math.hypot((x - f.x) / f.rx, (y - f.y) / f.ry));
            out[y * w + x] = base + (out[y * w + x] - base) * k;
        }
    }
    limitSlope(out, w, h, slopeMax);
    // region border: the relief sinks into the flat board (and sooner at the printed frame)
    const open = opt.open || {};
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const d = (side, dist) => (open[side] ? smooth(14, 64, dist) : smooth(0, edge, dist));
        out[y * w + x] = Math.max(0, out[y * w + x] * d('left', x) * d('right', w - 1 - x) * d('top', y) * d('bottom', h - 1 - y));
    }
    return out;
}

/** Height at a fractional pixel of a field (bilinear). */
export function sample(field, w, h, x, y) {
    if (x < 0 || y < 0 || x > w - 1 || y > h - 1) return 0;
    const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1);
    const fx = x - x0, fy = y - y0;
    const a = field[y0 * w + x0] * (1 - fx) + field[y0 * w + x1] * fx;
    const b = field[y1 * w + x0] * (1 - fx) + field[y1 * w + x1] * fx;
    return a * (1 - fy) + b * fy;
}

/** Forest pixels: dark, green-leaning — where low-poly firs are planted. */
export function isForest(r, g, b) {
    const l = (0.3 * r + 0.59 * g + 0.11 * b) / 255;
    return l < 0.27 && l > 0.06 && g > r + 6 && g >= b - 4;
}

/** Fill a masked hole of an image by diffusion from its border (the painted castle under the 3D
 *  one): every masked pixel becomes the average of its neighbours, many times over. */
export function inpaint(rgba, w, h, mask, iters = 120) {
    const idx = [];
    for (let i = 0; i < w * h; i++) if (mask[i]) idx.push(i);
    const buf = new Float32Array(w * h * 3);
    for (let i = 0; i < w * h; i++) for (let c = 0; c < 3; c++) buf[i * 3 + c] = rgba[i * 4 + c];
    // Start from the interpolation between the nearest known pixels of the row and of the column,
    // so the diffusion only has to smooth the cross, not travel across the whole hole.
    for (const i of idx) {
        const x = i % w, y = (i - x) / w;
        const near = (dx, dy) => { let k = 1; for (;;) { const xx = x + dx * k, yy = y + dy * k; if (xx < 0 || yy < 0 || xx >= w || yy >= h) return null; if (!mask[yy * w + xx]) return { j: yy * w + xx, k }; k++; } };
        const pairs = [[near(-1, 0), near(1, 0)], [near(0, -1), near(0, 1)]];
        for (let c = 0; c < 3; c++) {
            let s = 0, n = 0;
            for (const [a, b] of pairs) {
                if (a && b) { s += (buf[a.j * 3 + c] * b.k + buf[b.j * 3 + c] * a.k) / (a.k + b.k); n++; }
                else if (a || b) { s += buf[(a || b).j * 3 + c]; n++; }
            }
            if (n) buf[i * 3 + c] = s / n;
        }
    }
    for (let it = 0; it < iters; it++) {
        for (const i of idx) {
            const x = i % w, y = (i - x) / w;
            for (let c = 0; c < 3; c++) {
                let s = 0, n = 0;
                if (x > 0) { s += buf[(i - 1) * 3 + c]; n++; }
                if (x < w - 1) { s += buf[(i + 1) * 3 + c]; n++; }
                if (y > 0) { s += buf[(i - w) * 3 + c]; n++; }
                if (y < h - 1) { s += buf[(i + w) * 3 + c]; n++; }
                buf[i * 3 + c] = s / n;
            }
        }
    }
    let seed = 7;
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    for (const i of idx) {
        const n = (rnd() - 0.5) * 18;   // a little grain, so the patch is not a smear
        for (let c = 0; c < 3; c++) rgba[i * 4 + c] = Math.max(0, Math.min(255, buf[i * 3 + c] + n));
    }
}
