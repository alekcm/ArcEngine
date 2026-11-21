// Relief of the board (client/relief-height.mjs): the height field read from the painting.
import test from 'node:test';
import assert from 'node:assert/strict';
import { heightField, sample, inpaint, isForest, riverMask, limitSlope, rockDetail } from '../client/relief-height.mjs';

const W = 240, H = 160, BASE = 0.045;
/** A synthetic "painting": green grass, a blue-grey massif (left), a thin pale-blue river
 *  through the grass, a parchment plate inside the massif. */
function painting() {
    const px = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        let c = [70, 110, 50];                                            // grass
        if (x < 110) c = (x + y) % 9 < 3 ? [190, 200, 220] : [110, 125, 150];   // rock with snowy streaks
        if (x >= 150 && x < 157) c = [120, 140, 165];                    // a river through the grass
        if (x >= 30 && x < 80 && y >= 60 && y < 90) c = [200, 180, 150]; // parchment plate
        px.set([...c, 255], (y * W + x) * 4);
    }
    return px;
}

test('рельеф: горы поднимаются, равнина — чуть выше стола с холмами, река врезана, табличка ровная, край уходит в стол', () => {
    const f = heightField(painting(), W, H, { maxH: 0.3, edge: 30 });
    const at = (x, y) => sample(f, W, H, x, y);
    assert.ok(at(50, 30) > BASE + 0.08, `massif ${at(50, 30)}`);
    assert.ok(Math.abs(at(200, 80) - BASE) < 0.035, `the plain is near the base: ${at(200, 80)}`);
    assert.ok(at(153, 80) < at(200, 80) - 0.015, `the river is a bed, not a ridge: ${at(153, 80)} vs ${at(200, 80)}`);
    assert.ok(Math.abs(at(55, 75) - BASE) < 0.008, `the plate is level: ${at(55, 75)}`);
    assert.ok(at(0, 30) < 0.003 && at(50, 0) < 0.003, 'the region border meets the flat board');
    assert.ok(f.every(v => v >= 0 && v <= 0.36));
});

test('рельеф: река — тонкий мазок в траве, а не светлый край скалы', () => {
    const r = riverMask(painting(), W, H);
    assert.ok(r[80 * W + 153] > 0.5, 'river found');
    assert.ok(r[30 * W + 50] < 0.05, 'the rock is not a river');
    assert.ok(r[80 * W + 200] < 0.05, 'the grass is not a river');
});

test('рельеф: ровные зоны у локаций, терраса под замком, русло под мостом, ограничение крутизны', () => {
    const f = heightField(painting(), W, H, { edge: 30, flat: [{ x: 60, y: 30, rx: 12, ry: 12 }], plateau: [{ x: 90, y: 120, r: 10, h: 0.2 }], carve: [{ x: 200, y: 120, len: 20, width: 6, angle: Math.PI / 2 }] });
    assert.ok(Math.abs(sample(f, W, H, 60, 30) - BASE) < 0.005, 'flat zone at the base');
    assert.ok(Math.abs(sample(f, W, H, 90, 120) - 0.2) < 0.012, 'the terrace has its height');
    assert.ok(sample(f, W, H, 200, 120) < sample(f, W, H, 215, 120) - 0.015, 'a bed is carved under the bridge');
    const g = new Float32Array(100); g[55] = 1;
    limitSlope(g, 10, 10, 0.1);
    assert.ok(Math.abs(g[55] - 0.1) < 1e-6, 'a lone spike is cut down to a neighbour plus one step of slope');
});

test('рельеф: закраска нарисованного замка — дыра заполняется цветом краёв', () => {
    const w = 40, h = 40, px = new Uint8ClampedArray(w * h * 4), mask = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) px.set([100, 120, 140, 255], i * 4);
    for (let y = 12; y < 28; y++) for (let x = 12; x < 28; x++) { mask[y * w + x] = 1; px.set([250, 250, 250, 255], (y * w + x) * 4); }
    inpaint(px, w, h, mask);
    const i = (20 * w + 20) * 4;
    assert.ok(Math.abs(px[i] - 100) < 15 && Math.abs(px[i + 2] - 140) < 15, `filled ${px[i]},${px[i + 1]},${px[i + 2]}`);
    assert.ok(isForest(33, 49, 46) && !isForest(70, 110, 50) && !isForest(110, 125, 150));
});

test('рельеф: терраса замка ровная по всему основанию и стоит на отроге (ничего не висит в воздухе), табличка рядом остаётся ровной', () => {
    // the castle over the grass east of the massif, a name banner just south of its footprint
    const pl = { x: 172, y: 62, r: 26, h: 0.13, mound: 0.005 };
    const f = heightField(painting(), W, H, { edge: 30, plateau: [pl], flat: [{ x: 172, y: 120, rx: 40, ry: 12 }] });
    for (let a = 0; a < 6.28; a += 0.3) for (const rr of [0, 10, 20, 26]) {
        const v = sample(f, W, H, pl.x + Math.cos(a) * rr, pl.y + Math.sin(a) * rr);
        assert.ok(Math.abs(v - 0.13) < 0.006, `footprint level at r ${rr}: ${v}`);
    }
    // just outside, the ground falls gently (the spur), not a cliff
    for (let a = 0; a < 6.28; a += 0.5) {
        const v = sample(f, W, H, pl.x + Math.cos(a) * (pl.r + 6), pl.y + Math.sin(a) * (pl.r + 6));
        assert.ok(v > 0.13 - 6 * 0.0066, `spur at angle ${a.toFixed(1)}: ${v}`);
    }
    assert.ok(Math.abs(sample(f, W, H, 172, 120) - 0.045) < 0.004, 'the banner stays level');
});

test('рельеф: текстура скалы бесшовная, средняя яркость 128, с контрастом', () => {
    const S = 64, r = rockDetail(S);
    const mean = r.reduce((a, b) => a + b, 0) / r.length;
    assert.ok(Math.abs(mean - 128) < 4, `mean ${mean}`);
    let sd = 0; for (const v of r) sd += (v - mean) ** 2;
    assert.ok(Math.sqrt(sd / r.length) > 25, 'contrast');
    // the seam: neighbours across the wrap differ no more than neighbours inside
    let edge = 0, inner = 0;
    for (let y = 0; y < S; y++) { edge += Math.abs(r[y * S] - r[y * S + S - 1]); inner += Math.abs(r[y * S + 31] - r[y * S + 32]); }
    assert.ok(edge < inner * 1.8 + S * 4, `seam ${edge} vs ${inner}`);
});

test('рельеф: закраска переносит нарисованную фактуру (не «мыло») и не берёт её из запретных мест', () => {
    const w = 120, h = 120, px = new Uint8ClampedArray(w * h * 4), mask = new Uint8Array(w * h), avoid = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const v = 110 + ((x * 7 + y * 3) % 23) * 3;   // a painted grain
        px.set([v - 20, v - 5, v + 15, 255], (y * w + x) * 4);
        if (x > 95) { px.set([220, 40, 40, 255], (y * w + x) * 4); avoid[y * w + x] = 1; }   // a red token
    }
    for (let y = 45; y < 75; y++) for (let x = 45; x < 75; x++) mask[y * w + x] = 1;
    inpaint(px, w, h, mask, 60, { avoid });
    let sd = 0, mean = 0, red = 0;
    const vals = [];
    for (let y = 48; y < 72; y++) for (let x = 48; x < 72; x++) { const i = (y * w + x) * 4; vals.push(px[i + 2]); if (px[i] > px[i + 2] + 40) red++; }
    mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    for (const v of vals) sd += (v - mean) ** 2;
    sd = Math.sqrt(sd / vals.length);
    assert.ok(sd > 8, `the patch keeps the grain: sd ${sd.toFixed(1)}`);
    assert.ok(Math.abs(mean - (110 + 33 + 15)) < 15, `and the colour of the surroundings: ${mean.toFixed(0)}`);
    assert.equal(red, 0, 'nothing copied from the token');
});
