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

/**
 * Painted rock detail (size × size grey, tileable, mean ≈ 128): angular facets — Voronoi cells
 * with their own light, as the board painter draws a cliff — dark cracks between them, and a
 * grain of value noise. The terrain lays it over its steep faces in world space (triplanar), so
 * where the top-down painting is stretched over a slope there is still sharp rock to see.
 */
export function rockDetail(size = 256, seed = 9, cells = 6) {
    let s = seed;
    const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    // one jittered point per cell of a cells×cells grid; the grid wraps, so the texture tiles
    const pts = [];
    for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) pts.push([(i + 0.1 + rnd() * 0.8) / cells, (j + 0.1 + rnd() * 0.8) / cells, rnd(), (rnd() - 0.5) * 2.4]);
    const per = (x, y, f, sd = seed) => {   // periodic value noise: f lattice cells per tile
        const fx = x * f, fy = y * f, i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j;
        const H = (a, b) => valueNoise(((a % f) + f) % f, ((b % f) + f) % f, sd);
        const su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v);
        const a = H(i, j), b = H(i + 1, j), c = H(i, j + 1), d = H(i + 1, j + 1);
        return a + (b - a) * su + (c - a) * sv + (a - b - c + d) * su * sv;
    };
    const raw = new Float32Array(size * size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        // a warped plane: the facet edges wander instead of running straight
        let u = x / size, v = y / size;
        const wu = per(u, v, 4, seed + 1) * 0.045 + per(u, v, 11, seed + 2) * 0.015;
        const wv = per(u, v, 4, seed + 3) * 0.045 + per(u, v, 11, seed + 4) * 0.015;
        u += wu; v += wv;
        const ci = Math.floor(u * cells), cj = Math.floor(v * cells);
        let d1 = 9, d2 = 9, best = null;
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
            const ii = ci + di, jj = cj + dj, p = pts[(((jj % cells) + cells) % cells) * cells + (((ii % cells) + cells) % cells)];
            const px = p[0] + Math.floor(ii / cells), py = p[1] + Math.floor(jj / cells);
            // facets are taller than wide: on a cliff (v is vertical there) the rock splits downward
            const d = Math.hypot(u - px, (v - py) * 0.6);
            if (d < d1) { d2 = d1; d1 = d; best = [p, px, py]; } else if (d < d2) d2 = d;
        }
        const [p, px, py] = best;
        // a facet is lit along its own slant: light on one side, shade on the other
        const slant = ((u - px) * Math.cos(p[3]) + (v - py) * 0.6 * Math.sin(p[3])) * cells;
        // cracks: thin, and not along every edge
        const crack = (1 - smooth(0, 0.012, d2 - d1)) * smooth(-0.2, 0.4, per(u, v, 8, seed + 5));
        // brush grain: short vertical strokes and a fine noise
        const grain = per(u * 3, v, 24, seed + 6) * 0.5 + per(u, v, 64, seed + 7) * 0.5;
        raw[y * size + x] = (p[2] - 0.5) * 0.8 + slant * 0.55 + grain * 0.45 - crack * 0.8;
    }
    let m = 0, sd = 0;
    for (const v of raw) m += v;
    m /= raw.length;
    for (const v of raw) sd += (v - m) ** 2;
    sd = Math.sqrt(sd / raw.length) || 1;
    const out = new Uint8Array(size * size);
    for (let i = 0; i < out.length; i++) out[i] = Math.max(0, Math.min(255, Math.round(128 + (raw[i] - m) / sd * 40)));
    return out;
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
 *  painting into streaks. Cells marked in `keep` (building terraces) are never cut. */
export function limitSlope(f, w, h, s, keep = null) {
    const d = s * Math.SQRT2;
    for (let pass = 0; pass < 2; pass++) {
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
            const i = y * w + x; let v = f[i];
            if (x > 0) v = Math.min(v, f[i - 1] + s);
            if (y > 0) { v = Math.min(v, f[i - w] + s); if (x > 0) v = Math.min(v, f[i - w - 1] + d); if (x < w - 1) v = Math.min(v, f[i - w + 1] + d); }
            if (!keep || !keep[i]) f[i] = v;
        }
        for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
            const i = y * w + x; let v = f[i];
            if (x < w - 1) v = Math.min(v, f[i + 1] + s);
            if (y < h - 1) { v = Math.min(v, f[i + w] + s); if (x < w - 1) v = Math.min(v, f[i + w + 1] + d); if (x > 0) v = Math.min(v, f[i + w - 1] + d); }
            if (!keep || !keep[i]) f[i] = v;
        }
    }
    return f;
}

/**
 * Height field of one region (heights in world units, row-major w×h). The land stands `base` above
 * the table so that rivers can be cut into it; the region border sinks to the table.
 * opt: { maxH, base, hills, riverDepth, slope (max rise per pixel),
 *        flat: [{x, y, rx, ry}] ellipses levelled to the base (plates, badges, miniature spots),
 *        plateau: {x, y, r, h, mound} — terraces for buildings (one object or an array): level at h
 *                 over the whole footprint r (cut into a slope, filled over a valley), standing on a
 *                 spur that falls by `mound` per pixel (default 0.0035) — no edge of a building hangs
 *                 in the air,
 *        carve: [{x, y, len, width, angle}] — river beds under painted bridges (angle — of the RIVER, radians),
 *        edge: falloff in px at the region border, open: {top, right, bottom, left} board-edge sides,
 *        none: sides with no falloff at all (another region continues there) }
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
    // terraces of 3D buildings, before the slope cap (a spur is gentler than the cap, so the cap
    // only grinds down rock that would tower over the terrace)
    for (const pl of [].concat(opt.plateau || [])) {
        const ms = pl.mound ?? 0.0035, R = pl.r + Math.max(0, pl.h) / ms + 1;
        for (let y = Math.max(0, Math.floor(pl.y - R)); y < Math.min(h, pl.y + R); y++) {
            for (let x = Math.max(0, Math.floor(pl.x - R)); x < Math.min(w, pl.x + R); x++) {
                const d = Math.hypot(x - pl.x, y - pl.y), i = y * w + x;
                out[i] = d <= pl.r + 2 ? pl.h : Math.max(out[i], pl.h - ms * (d - pl.r - 2));
            }
        }
    }
    // level zones (location plates, badges, the spots where miniatures stand) — after the
    // terraces, so a spur never lifts a plate; only a building's footprint itself is spared
    const plats = [].concat(opt.plateau || []);
    for (const f of opt.flat || []) {
        const x0 = Math.max(0, Math.floor(f.x - f.rx * 1.8)), x1 = Math.min(w - 1, Math.ceil(f.x + f.rx * 1.8));
        const y0 = Math.max(0, Math.floor(f.y - f.ry * 1.8)), y1 = Math.min(h - 1, Math.ceil(f.y + f.ry * 1.8));
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
            if (plats.some(pl => Math.hypot(x - pl.x, y - pl.y) <= pl.r + 2)) continue;
            const k = smooth(1, 1.8, Math.hypot((x - f.x) / f.rx, (y - f.y) / f.ry));
            out[y * w + x] = base + (out[y * w + x] - base) * k;
        }
    }
    let keep = null;
    if (plats.length) {
        keep = new Uint8Array(n);
        for (const pl of plats) for (let y = Math.max(0, Math.floor(pl.y - pl.r - 2)); y <= Math.min(h - 1, pl.y + pl.r + 2); y++) for (let x = Math.max(0, Math.floor(pl.x - pl.r - 2)); x <= Math.min(w - 1, pl.x + pl.r + 2); x++) if (Math.hypot(x - pl.x, y - pl.y) <= pl.r + 2) keep[y * w + x] = 1;
    }
    limitSlope(out, w, h, slopeMax, keep);
    // region border: the relief sinks into the flat board (and sooner at the printed frame)
    const open = opt.open || {}, none = opt.none || {};
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const d = (side, dist) => (none[side] ? 1 : open[side] ? smooth(14, 64, dist) : smooth(0, edge, dist));
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

/** Marks the inside of ellipses {x, y, rx, ry, angle?} (pixels) in a w×h map with `v`. */
export function markEllipses(map, w, h, list, v = 1) {
    for (const e of list) {
        const ca = Math.cos(e.angle || 0), sa = Math.sin(e.angle || 0), R = Math.max(e.rx, e.ry) + 1;
        for (let y = Math.max(0, Math.floor(e.y - R)); y < Math.min(h, e.y + R); y++) for (let x = Math.max(0, Math.floor(e.x - R)); x < Math.min(w, e.x + R); x++) {
            const dx = x - e.x, dy = y - e.y, a = dx * ca + dy * sa, b = -dx * sa + dy * ca;
            if ((a / e.rx) ** 2 + (b / e.ry) ** 2 < 1) map[y * w + x] = v;
        }
    }
    return map;
}

/**
 * Fill the masked holes of an image (the painted castle under the 3D one, bridges, huts) so that
 * the patch looks painted, not smeared:
 *   1. diffusion from the border gives the colour the patch must have (smooth: alone, it was
 *      "soap" — the user saw it between and around the walls);
 *   2. texture is transplanted: for every hole (connected component) the offset is chosen from
 *      which the most of it can be copied from unmasked, non-parchment painting; the copied pixels
 *      keep their own brushwork but their local average colour is replaced by the diffused one
 *      (out = src − blur(src) + base), so the patch matches its surroundings.
 * opt.avoid — a 0..1 map of pixels never to copy from (parchment plates); opt.texture = false
 * leaves only the diffusion.
 */
export function inpaint(rgba, w, h, mask, iters = 120, opt = {}) {
    const n = w * h, idx = [];
    for (let i = 0; i < n; i++) if (mask[i]) idx.push(i);
    if (!idx.length) return;
    const buf = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) buf[i * 3 + c] = rgba[i * 4 + c];
    // Start from the interpolation between the nearest known pixels of the row and of the column,
    // so the diffusion only has to smooth the cross, not travel across the whole hole.
    for (const i of idx) {
        const x = i % w, y = (i - x) / w;
        const near = (dx, dy) => { let k = 1; for (;;) { const xx = x + dx * k, yy = y + dy * k; if (xx < 0 || yy < 0 || xx >= w || yy >= h) return null; if (!mask[yy * w + xx]) return { j: yy * w + xx, k }; k++; } };
        const pairs = [[near(-1, 0), near(1, 0)], [near(0, -1), near(0, 1)]];
        for (let c = 0; c < 3; c++) {
            let s = 0, m = 0;
            for (const [a, b] of pairs) {
                if (a && b) { s += (buf[a.j * 3 + c] * b.k + buf[b.j * 3 + c] * a.k) / (a.k + b.k); m++; }
                else if (a || b) { s += buf[(a || b).j * 3 + c]; m++; }
            }
            if (m) buf[i * 3 + c] = s / m;
        }
    }
    for (let it = 0; it < iters; it++) {
        for (const i of idx) {
            const x = i % w, y = (i - x) / w;
            for (let c = 0; c < 3; c++) {
                let s = 0, m = 0;
                if (x > 0) { s += buf[(i - 1) * 3 + c]; m++; }
                if (x < w - 1) { s += buf[(i + 1) * 3 + c]; m++; }
                if (y > 0) { s += buf[(i - w) * 3 + c]; m++; }
                if (y < h - 1) { s += buf[(i + w) * 3 + c]; m++; }
                buf[i * 3 + c] = s / m;
            }
        }
    }
    const done = new Uint8Array(n);
    if (opt.texture !== false) {
        // where texture may come from: unmasked (with a margin: the painted castle's own outline
        // stays out), not parchment
        const bad = blur(Float32Array.from(mask), w, h, 3);
        const ok = new Uint8Array(n);
        for (let i = 0; i < n; i++) ok[i] = bad[i] === 0 && !(opt.avoid && opt.avoid[i] > 0.3) ? 1 : 0;
        // the local average of the source (over valid pixels only) — what is replaced by the base
        const R = 6, wt = blur2(Float32Array.from(ok), w, h, R), low = [0, 1, 2].map(c => {
            const a = new Float32Array(n);
            for (let i = 0; i < n; i++) a[i] = ok[i] ? rgba[i * 4 + c] : 0;
            return blur2(a, w, h, R);
        });
        // connected holes
        const comp = new Int32Array(n).fill(-1), comps = [];
        for (const i0 of idx) {
            if (comp[i0] >= 0) continue;
            const list = [i0]; comp[i0] = comps.length;
            for (let q = 0; q < list.length; q++) {
                const i = list[q], x = i % w;
                for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) if (j >= 0 && j < n && mask[j] && comp[j] < 0) { comp[j] = comps.length; list.push(j); }
            }
            comps.push(list);
        }
        for (const list of comps) {
            let x0 = w, x1 = 0, y0 = h, y1 = 0;
            for (const i of list) { const x = i % w, y = (i - x) / w; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
            const rad = Math.max(x1 - x0, y1 - y0) / 2 + 1;
            const step = Math.max(1, Math.floor(list.length / 400));
            const cands = [];
            for (const k of [1.15, 1.6, 2.2]) for (let a = 0; a < 24; a++) {
                const dx = Math.round(Math.cos(a / 24 * Math.PI * 2) * (rad * k + 6)), dy = Math.round(Math.sin(a / 24 * Math.PI * 2) * (rad * k + 6));
                let good = 0, tot = 0, diff = 0;
                for (let q = 0; q < list.length; q += step) {
                    const i = list[q], x = i % w + dx, y = (i - (i % w)) / w + dy;
                    tot++;
                    if (x < 0 || y < 0 || x >= w || y >= h) continue;
                    const j = y * w + x;
                    if (!ok[j]) continue;
                    good++;
                    for (let c = 0; c < 3; c++) diff += Math.abs(low[c][j] / Math.max(1e-3, wt[j]) - buf[i * 3 + c]);
                }
                // mostly valid, and from ground of a similar colour (rock for rock), not too far
                cands.push({ dx, dy, score: good / tot - (good ? diff / good / 3 / 255 : 1) * 1.5 - k * 0.04 });
            }
            cands.sort((a, b) => b.score - a.score);
            for (const i of list) {
                const x = i % w, y = (i - x) / w;
                for (const cd of cands.slice(0, 6)) {
                    const sx = x + cd.dx, sy = y + cd.dy;
                    if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
                    const j = sy * w + sx;
                    if (!ok[j] || wt[j] < 0.2) continue;
                    for (let c = 0; c < 3; c++) rgba[i * 4 + c] = Math.max(0, Math.min(255, rgba[j * 4 + c] - low[c][j] / wt[j] + buf[i * 3 + c]));
                    done[i] = 1;
                    break;
                }
            }
        }
    }
    let seed = 7;
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    for (const i of idx) {
        if (done[i]) continue;
        const g = (rnd() - 0.5) * 18;   // a little grain, so a patch without a source is not a smear
        for (let c = 0; c < 3; c++) rgba[i * 4 + c] = Math.max(0, Math.min(255, buf[i * 3 + c] + g));
    }
}
