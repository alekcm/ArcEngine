// OBJ -> compact mesh for the client: positions + indices, normalised to height 1 with the
// base at y = 0, decimated by vertex clustering to roughly `targetTris` triangles. The source
// OBJ files are never modified (Witcher/Модели.md); MTL files do not exist, colour comes from the game.
export function objToMesh(text, { targetTris = 7000 } = {}) {
    const vs = [];
    const tris = [];
    const lines = text.split('\n');
    for (let li = 0; li < lines.length; li++) {
        const l = lines[li];
        if (l.charCodeAt(0) === 118 && l.charCodeAt(1) === 32) { // 'v '
            const p = l.trim().split(/\s+/);
            vs.push(+p[1], +p[2], +p[3]);
        } else if (l.charCodeAt(0) === 102 && l.charCodeAt(1) === 32) { // 'f '
            const p = l.trim().split(/\s+/).slice(1).map(x => { const i = parseInt(x, 10); return i < 0 ? vs.length / 3 + i : i - 1; });
            for (let k = 1; k + 1 < p.length; k++) tris.push(p[0], p[k], p[k + 1]);
        }
    }
    const nv = vs.length / 3;
    let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < nv; i++) for (let a = 0; a < 3; a++) { const v = vs[i * 3 + a]; if (v < min[a]) min[a] = v; if (v > max[a]) max[a] = v; }
    const size = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
    const tri0 = tris.length / 3;
    let best = null;
    for (const G of tri0 <= targetTris ? [0] : [160, 128, 112, 96, 80, 64, 52, 44, 36, 30]) {
        const r = G ? cluster(vs, tris, min, size, G) : { pos: vs.slice(), idx: tris.slice() };
        best = r;
        if (r.idx.length / 3 <= targetTris) break;
    }
    // Normalise: centre x/z, base on y = 0, height 1.
    const h = size[1] || 1;
    const cx = (min[0] + max[0]) / 2, cz = (min[2] + max[2]) / 2;
    const pos = best.pos;
    const out = new Array(pos.length);
    for (let i = 0; i < pos.length; i += 3) {
        out[i] = Math.round(((pos[i] - cx) / h) * 10000) / 10000;
        out[i + 1] = Math.round(((pos[i + 1] - min[1]) / h) * 10000) / 10000;
        out[i + 2] = Math.round(((pos[i + 2] - cz) / h) * 10000) / 10000;
    }
    return { p: out, i: best.idx, w: Math.round(size[0] / h * 1000) / 1000, d: Math.round(size[2] / h * 1000) / 1000, srcTris: tri0 };
}

function cluster(vs, tris, min, size, G) {
    const nv = vs.length / 3;
    const cellOf = new Int32Array(nv);
    const map = new Map();
    const acc = [];
    const s = Math.max(size[0], size[1], size[2]) || 1;
    for (let i = 0; i < nv; i++) {
        const gx = Math.min(G - 1, Math.floor((vs[i * 3] - min[0]) / s * G));
        const gy = Math.min(G - 1, Math.floor((vs[i * 3 + 1] - min[1]) / s * G));
        const gz = Math.min(G - 1, Math.floor((vs[i * 3 + 2] - min[2]) / s * G));
        const key = (gx * G + gy) * G + gz;
        let c = map.get(key);
        if (c === undefined) { c = acc.length / 4; map.set(key, c); acc.push(0, 0, 0, 0); }
        acc[c * 4] += vs[i * 3]; acc[c * 4 + 1] += vs[i * 3 + 1]; acc[c * 4 + 2] += vs[i * 3 + 2]; acc[c * 4 + 3]++;
        cellOf[i] = c;
    }
    const pos = [];
    for (let c = 0; c < acc.length / 4; c++) pos.push(acc[c * 4] / acc[c * 4 + 3], acc[c * 4 + 1] / acc[c * 4 + 3], acc[c * 4 + 2] / acc[c * 4 + 3]);
    const idx = [];
    const seen = new Set();
    for (let t = 0; t < tris.length; t += 3) {
        const a = cellOf[tris[t]], b = cellOf[tris[t + 1]], c = cellOf[tris[t + 2]];
        if (a === b || b === c || a === c) continue;
        const k = [a, b, c].sort((x, y) => x - y).join(',');
        if (seen.has(k)) continue;
        seen.add(k);
        idx.push(a, b, c);
    }
    // Compact unused vertices.
    const used = new Int32Array(pos.length / 3).fill(-1);
    const p2 = [];
    for (let i = 0; i < idx.length; i++) {
        const v = idx[i];
        if (used[v] < 0) { used[v] = p2.length / 3; p2.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]); }
        idx[i] = used[v];
    }
    return { pos: p2, idx };
}
