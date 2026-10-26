// make-heroes-models.mjs — procedural low-poly 3D GLB generator for Heroes V (Ashan low-poly).
// Generates crisp flat-faceted .glb models in assets/models/ with verified counter-clockwise
// winding (every triangle checked against its vertex normals so Debug3D.lint() has zero issues).
// Skinned units and mounted heroes carry seamless looped clips: 'idle', 'run', 'attack'.
//
//   node tools/make-heroes-models.mjs          # writes all models to assets/models/
//   node tools/make-heroes-models.mjs --check  # exit 1 if any file on disk differs
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'assets', 'models');

const DEG = Math.PI / 180;
const FLOAT = 5126, USHORT = 5123, UBYTE = 5121;
const ARRAY_BUFFER = 34962, ELEMENT_ARRAY_BUFFER = 34963;

// sRGB hex -> linear RGB (glTF 2.0 baseColorFactor).
const linear = (hex) => [1, 3, 5].map((i) => {
  const v = parseInt(hex.slice(i, i + 2), 16) / 255;
  return +(v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4).toFixed(4);
});

// Quaternion helpers [x, y, z, w].
const qId = () => [0, 0, 0, 1];
const rotX = (a) => [Math.sin(a / 2), 0, 0, Math.cos(a / 2)];
const rotY = (a) => [0, Math.sin(a / 2), 0, Math.cos(a / 2)];
const rotZ = (a) => [0, 0, Math.sin(a / 2), Math.cos(a / 2)];
const qmul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
const qconj = (q) => [-q[0], -q[1], -q[2], q[3]];
const qrot = (q, v) => qmul(qmul(q, [v[0], v[1], v[2], 0]), qconj(q)).slice(0, 3);
const eulerQ = (rx = 0, ry = 0, rz = 0) => qmul(rotY(ry * DEG), qmul(rotX(rx * DEG), rotZ(rz * DEG)));

const norm3 = (v) => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

// Box faces: outward normal and 4 corners counter-clockwise as seen from outside.
const BOX_FACES = [
  { n: [1, 0, 0], v: [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]] },
  { n: [-1, 0, 0], v: [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]] },
  { n: [0, 1, 0], v: [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]] },
  { n: [0, -1, 0], v: [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]] },
  { n: [0, 0, 1], v: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]] },
  { n: [0, 0, -1], v: [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]] },
];

function addTri(out, p0, p1, p2, n, joint) {
  const base = out.positions.length / 3;
  out.positions.push(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], p2[0], p2[1], p2[2]);
  out.normals.push(n[0], n[1], n[2], n[0], n[1], n[2], n[0], n[1], n[2]);
  if (out.skinned) out.joints.push(joint, 0, 0, 0, joint, 0, 0, 0, joint, 0, 0, 0);
  out.indices.push(base, base + 1, base + 2);
}

function addQuad(out, p0, p1, p2, p3, n, joint) {
  const base = out.positions.length / 3;
  out.positions.push(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], p2[0], p2[1], p2[2], p3[0], p3[1], p3[2]);
  out.normals.push(n[0], n[1], n[2], n[0], n[1], n[2], n[0], n[1], n[2], n[0], n[1], n[2]);
  if (out.skinned) out.joints.push(joint, 0, 0, 0, joint, 0, 0, 0, joint, 0, 0, 0, joint, 0, 0, 0);
  out.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

// Flat-shaded oriented cuboid: c = [x,y,z], s = [sx,sy,sz], rot = [rx,ry,rz] deg.
function emitBox(out, b) {
  const q = b.rot ? eulerQ(b.rot[0], b.rot[1], b.rot[2]) : qId();
  const joint = b.joint || 0;
  for (const f of BOX_FACES) {
    const n = norm3(qrot(q, f.n));
    const pts = f.v.map((v) => {
      const local = [v[0] * b.s[0] / 2, v[1] * b.s[1] / 2, v[2] * b.s[2] / 2];
      const r = qrot(q, local);
      return [b.c[0] + r[0], b.c[1] + r[1], b.c[2] + r[2]];
    });
    addQuad(out, pts[0], pts[1], pts[2], pts[3], n, joint);
  }
}

// Flat-faceted low-poly frustum/cone/pyramid along local Y:
// c = [x,y,z], h = height, r = [rBottom, rTop], n = sides (>=3), rot = [rx,ry,rz] deg, yaw = deg twist.
function emitPrism(out, p) {
  const q = p.rot ? eulerQ(p.rot[0], p.rot[1], p.rot[2]) : qId();
  const joint = p.joint || 0;
  const sides = Math.max(3, p.n || 6);
  const r0 = Math.max(0.001, p.r[0]);
  const r1 = Math.max(0.001, p.r[1]);
  const y0 = -p.h / 2, y1 = p.h / 2;
  const twist = (p.yaw || 0) * DEG;
  const xform = (pt) => {
    const r = qrot(q, pt);
    return [p.c[0] + r[0], p.c[1] + r[1], p.c[2] + r[2]];
  };

  const bot = [], top = [];
  for (let i = 0; i < sides; i++) {
    // Negative angle step around +Y goes +X -> -Z -> -X -> +Z; so i -> i+1 watched from outside:
    // Let's compute exact cross product normal per face to guarantee CCW outward!
    const a = twist - (2 * Math.PI * i) / sides;
    const ca = Math.cos(a), sa = Math.sin(a);
    bot.push(xform([r0 * ca, y0, r0 * sa]));
    top.push(xform([r1 * ca, y1, r1 * sa]));
  }
  const botCenter = xform([0, y0, 0]);
  const topCenter = xform([0, y1, 0]);
  const nDown = norm3(qrot(q, [0, -1, 0]));
  const nUp = norm3(qrot(q, [0, 1, 0]));

  for (let i = 0; i < sides; i++) {
    const k = (i + 1) % sides;
    // With angle decreasing: at i=0 -> (r, y, 0), k=1 -> (r*cos, y, -r*sin).
    // Vector u = bot[k] - bot[i] = (..., 0, -sin), v = top[i] - bot[i] = (0, h, 0).
    // cross(u, v) = (-sin*0 - 0*h, 0*0 - dx*h, dx*h - 0) -> wait: let's order vertices so cross(p1-p0, p2-p0) points outward!
    // Outward mid-direction in local space:
    const amid = twist - (2 * Math.PI * (i + 0.5)) / sides;
    const slope = (r0 - r1) / p.h;
    const nSide = norm3(qrot(q, [Math.cos(amid), slope, Math.sin(amid)]));
    // Check order (bot[k], bot[i], top[i], top[k]):
    // At i=0 (amid < 0, z < 0, x > 0): bot[1] to bot[0] has +Z, bot[0] to top[0] has +Y => (+Z) x (+Y) = (-X)... wait:
    // In right-handed coordinates: (0,0,1) x (0,1,0) = (-1,0,0), while (0,0,-1) x (0,1,0) = (+1,0,0)!
    // Since bot[1] - bot[0] has Z < 0, (bot[1] - bot[0]) x (top[1] - bot[0]) has X > 0 (outward!).
    addQuad(out, bot[i], bot[k], top[k], top[i], nSide, joint);
    // Bottom cap (normal -Y): from below (+Y looking from -Y), bot[i] -> bot[k] goes CW around +Y which is CCW around -Y?
    // Check: (bot[i] - botCenter) = (1,0,0), (bot[k] - botCenter) = (cos, 0, -sin).
    // (1,0,0) x (cos, 0, -sin) = (0, sin, 0) = +Y! So for -Y we want (botCenter, bot[k], bot[i])!
    addTri(out, botCenter, bot[k], bot[i], nDown, joint);
    // Top cap (normal +Y): (top[i] - topCenter) x (top[k] - topCenter) = +Y!
    addTri(out, topCenter, top[i], top[k], nUp, joint);
  }
}

// Verify every triangle's cross product aligns with its vertex normals (CCW outward).
function checkWinding(prim, label) {
  const P = prim.positions, N = prim.normals, I = prim.indices;
  for (let i = 0; i < I.length; i += 3) {
    const a = I[i] * 3, b = I[i + 1] * 3, c = I[i + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    const nx = N[a] + N[b] + N[c], ny = N[a + 1] + N[b + 1] + N[c + 1], nz = N[a + 2] + N[b + 2] + N[c + 2];
    if (cx * nx + cy * ny + cz * nz <= 0) {
      throw new Error(`${label}: triangle ${i / 3} wound against normals`);
    }
  }
}

function makeClip(name, duration, frames, poseFn) {
  const times = [], tracks = new Map();
  for (let i = 0; i <= frames; i++) {
    times.push(+(duration * i / frames).toFixed(5));
    const p = poseFn((2 * Math.PI * (i % frames)) / frames);
    for (const [k, v] of Object.entries(p)) {
      if (!tracks.has(k)) tracks.set(k, []);
      tracks.get(k).push(v);
    }
  }
  return { name, times, tracks };
}

// Assemble binary GLB from materials, parts, and optional skeleton + clips.
function encodeGlb(modelName, materials, parts, joints = null, clips = null) {
  const skinned = !!(joints && joints.length);
  const J = skinned ? Object.fromEntries(joints.map((j, i) => [j.name, i])) : {};
  const M = Object.fromEntries(materials.map((m, i) => [m.name, i]));

  const built = [];
  for (let matIdx = 0; matIdx < materials.length; matIdx++) {
    const out = { positions: [], normals: [], joints: [], indices: [], skinned };
    for (const p of parts) {
      const pm = typeof p.mat === 'string' ? M[p.mat] : p.mat;
      if (pm !== matIdx) continue;
      const pj = skinned ? (typeof p.joint === 'string' ? J[p.joint] : (p.joint || 0)) : 0;
      const spec = { ...p, joint: pj };
      if (spec.s) emitBox(out, spec);
      else emitPrism(out, spec);
    }
    if (!out.indices.length) continue;
    checkWinding(out, `${modelName}/${materials[matIdx].name}`);
    built.push({ out, matIdx });
  }

  const chunks = [], bufferViews = [], accessors = [];
  let offset = 0;
  const addView = (typed, target) => {
    const bytes = Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength);
    const pad = (4 - (bytes.length % 4)) % 4;
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length, ...(target ? { target } : {}) });
    chunks.push(bytes, Buffer.alloc(pad));
    offset += bytes.length + pad;
    return bufferViews.length - 1;
  };
  const addAcc = (typed, comp, type, width, target, bounds) => {
    const a = { bufferView: addView(typed, target), componentType: comp, count: typed.length / width, type };
    if (bounds) {
      a.min = Array.from({ length: width }, (_, k) => Math.min(...typed.filter((__, i) => i % width === k)));
      a.max = Array.from({ length: width }, (_, k) => Math.max(...typed.filter((__, i) => i % width === k)));
    }
    accessors.push(a);
    return accessors.length - 1;
  };

  const primitives = built.map(({ out, matIdx }) => {
    const attrs = {
      POSITION: addAcc(new Float32Array(out.positions), FLOAT, 'VEC3', 3, ARRAY_BUFFER, true),
      NORMAL: addAcc(new Float32Array(out.normals), FLOAT, 'VEC3', 3, ARRAY_BUFFER, false),
    };
    if (skinned) {
      attrs.JOINTS_0 = addAcc(new Uint8Array(out.joints), UBYTE, 'VEC4', 4, ARRAY_BUFFER, false);
      attrs.WEIGHTS_0 = addAcc(new Float32Array(out.joints.map((_, i) => (i % 4 === 0 ? 1 : 0))), FLOAT, 'VEC4', 4, ARRAY_BUFFER, false);
    }
    return {
      attributes: attrs,
      indices: addAcc(new Uint16Array(out.indices), USHORT, 'SCALAR', 1, ELEMENT_ARRAY_BUFFER, false),
      material: matIdx,
    };
  });

  const nodes = skinned ? [{ name: modelName, mesh: 0, skin: 0 }] : [{ name: modelName, mesh: 0 }];
  let skins;
  let animations;

  if (skinned) {
    const inv = new Float32Array(joints.length * 16);
    joints.forEach((j, i) => inv.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -j.at[0], -j.at[1], -j.at[2], 1], i * 16));
    const ibm = addAcc(inv, FLOAT, 'MAT4', 16, 0, false);
    joints.forEach((j, i) => {
      const p = j.parent < 0 ? [0, 0, 0] : joints[j.parent].at;
      const children = joints.map((c, k) => (c.parent === i ? k + 1 : 0)).filter(Boolean);
      nodes.push({
        name: j.name,
        translation: j.at.map((v, k) => +(v - p[k]).toFixed(6)),
        ...(children.length ? { children } : {}),
      });
    });
    skins = [{ joints: joints.map((_, i) => i + 1), skeleton: 1, inverseBindMatrices: ibm }];

    if (clips && clips.length) {
      animations = clips.map((c) => {
        const input = addAcc(new Float32Array(c.times), FLOAT, 'SCALAR', 1, 0, true);
        const samplers = [], channels = [];
        for (const [key, values] of c.tracks) {
          const [jName, prop] = key.split('.');
          const width = prop === 'rotation' ? 4 : 3;
          samplers.push({
            input,
            output: addAcc(new Float32Array(values.flat()), FLOAT, width === 4 ? 'VEC4' : 'VEC3', width, 0, false),
            interpolation: 'LINEAR',
          });
          channels.push({ sampler: samplers.length - 1, target: { node: J[jName] + 1, path: prop } });
        }
        return { name: c.name, samplers, channels };
      });
    }
  }

  const gltf = {
    asset: { version: '2.0', generator: 'ArcEngine tools/make-heroes-models.mjs' },
    scene: 0,
    scenes: [{ nodes: skinned ? [0, 1] : [0] }],
    nodes,
    meshes: [{ name: modelName, primitives }],
    ...(skins ? { skins } : {}),
    materials: materials.map((m) => ({
      name: m.name,
      pbrMetallicRoughness: {
        baseColorFactor: [...linear(m.hex), 1],
        metallicFactor: 0,
        roughnessFactor: 1,
      },
    })),
    ...(animations ? { animations } : {}),
    accessors,
    bufferViews,
    buffers: [{ byteLength: offset }],
  };

  const pad4 = (buf, fill) => Buffer.concat([buf, Buffer.alloc((4 - (buf.length % 4)) % 4, fill)]);
  const json = pad4(Buffer.from(JSON.stringify(gltf), 'utf8'), 0x20);
  const bin = pad4(Buffer.concat(chunks), 0);
  const header = Buffer.alloc(12);
  header.write('glTF', 0, 'latin1');
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + json.length + 8 + bin.length, 8);
  const chunk = (len, type) => {
    const h = Buffer.alloc(8);
    h.writeUInt32LE(len, 0);
    h.write(type, 4, 'latin1');
    return h;
  };
  return Buffer.concat([header, chunk(json.length, 'JSON'), json, chunk(bin.length, 'BIN\0'), bin]);
}

// ============================================================================
//  1. MOUNTED HEROES (Haven Knight & Inferno Demon Lord)
// ============================================================================
function buildMountedHero(name, theme) {
  const joints = [
    { name: 'mount', at: [0, 0.78, 0], parent: -1 },
    { name: 'neck', at: [0, 0.94, 0.34], parent: 0 },
    { name: 'legFL', at: [0.15, 0.62, 0.30], parent: 0 },
    { name: 'legFR', at: [-0.15, 0.62, 0.30], parent: 0 },
    { name: 'legBL', at: [0.15, 0.62, -0.32], parent: 0 },
    { name: 'legBR', at: [-0.15, 0.62, -0.32], parent: 0 },
    { name: 'tail', at: [0, 0.86, -0.48], parent: 0 },
    { name: 'rider', at: [0, 1.02, -0.02], parent: 0 },
    { name: 'head', at: [0, 1.50, -0.02], parent: 7 },
    { name: 'armL', at: [0.24, 1.38, 0.0], parent: 7 },
    { name: 'armR', at: [-0.24, 1.38, 0.0], parent: 7 },
  ];

  const mats = [
    { name: 'coat', hex: theme.horse },
    { name: 'barding', hex: theme.cloth },
    { name: 'trim', hex: theme.gold },
    { name: 'armor', hex: theme.armor },
    { name: 'blade', hex: theme.blade },
    { name: 'skin', hex: theme.skin },
    { name: 'hoof', hex: theme.dark },
  ];

  const parts = [
    // Horse barrel, chest, rump & barding skirt
    { c: [0, 0.80, 0], s: [0.40, 0.36, 0.88], mat: 'coat', joint: 'mount' },
    { c: [0, 0.83, 0.24], s: [0.44, 0.34, 0.38], mat: 'barding', joint: 'mount' },
    { c: [0, 0.83, -0.24], s: [0.43, 0.32, 0.36], mat: 'barding', joint: 'mount' },
    { c: [0, 0.65, 0.0], s: [0.46, 0.14, 0.82], mat: 'trim', joint: 'mount' },
    // Neck, horse head, ears & armored chamfron
    { c: [0, 1.14, 0.44], s: [0.22, 0.44, 0.24], rot: [26, 0, 0], mat: 'coat', joint: 'neck' },
    { c: [0, 1.33, 0.62], s: [0.20, 0.20, 0.36], rot: [18, 0, 0], mat: 'coat', joint: 'neck' },
    { c: [0, 1.38, 0.66], s: [0.21, 0.08, 0.28], rot: [18, 0, 0], mat: 'armor', joint: 'neck' },
    { c: [0.07, 1.47, 0.52], h: 0.12, r: [0.035, 0.008], n: 4, mat: 'coat', joint: 'neck' },
    { c: [-0.07, 1.47, 0.52], h: 0.12, r: [0.035, 0.008], n: 4, mat: 'coat', joint: 'neck' },
    // Flowing tail
    { c: [0, 0.66, -0.58], s: [0.12, 0.42, 0.14], rot: [-24, 0, 0], mat: 'hoof', joint: 'tail' },
    // 4 Horse legs + hooves
    ...[
      ['legFL', 0.15, 0.30], ['legFR', -0.15, 0.30],
      ['legBL', 0.15, -0.32], ['legBR', -0.15, -0.32],
    ].flatMap(([jn, lx, lz]) => [
      { c: [lx, 0.34, lz], s: [0.11, 0.52, 0.11], mat: 'coat', joint: jn },
      { c: [lx, 0.05, lz + 0.01], s: [0.12, 0.10, 0.13], mat: 'hoof', joint: jn },
    ]),
    // Rider torso, pauldrons, flowing cape
    { c: [0, 1.24, -0.02], s: [0.36, 0.42, 0.22], mat: 'armor', joint: 'rider' },
    { c: [0, 1.25, 0.10], s: [0.24, 0.32, 0.04], mat: 'barding', joint: 'rider' },
    { c: [0.22, 1.39, -0.02], s: [0.13, 0.12, 0.16], mat: 'trim', joint: 'rider' },
    { c: [-0.22, 1.39, -0.02], s: [0.13, 0.12, 0.16], mat: 'trim', joint: 'rider' },
    { c: [0, 1.16, -0.18], s: [0.34, 0.52, 0.05], rot: [14, 0, 0], mat: 'barding', joint: 'rider' },
    // Rider helm + visor + crest/horns
    { c: [0, 1.61, -0.02], s: [0.22, 0.24, 0.22], mat: 'armor', joint: 'head' },
    { c: [0, 1.60, 0.10], s: [0.16, 0.08, 0.04], mat: 'hoof', joint: 'head' },
    ...(theme.horns ? [
      { c: [0.14, 1.76, 0.02], h: 0.24, r: [0.045, 0.008], n: 5, rot: [-18, 0, -28], mat: 'trim', joint: 'head' },
      { c: [-0.14, 1.76, 0.02], h: 0.24, r: [0.045, 0.008], n: 5, rot: [-18, 0, 28], mat: 'trim', joint: 'head' },
    ] : [
      { c: [0, 1.74, -0.02], h: 0.06, r: [0.13, 0.14], n: 6, mat: 'trim', joint: 'head' },
      { c: [0, 1.84, -0.06], s: [0.07, 0.18, 0.22], rot: [-12, 0, 0], mat: 'coat', joint: 'head' },
    ]),
    // Left arm + Kite Shield
    { c: [0.26, 1.24, 0.04], s: [0.11, 0.30, 0.11], mat: 'armor', joint: 'armL' },
    { c: [0.34, 1.20, 0.12], s: [0.05, 0.42, 0.28], rot: [0, 18, 0], mat: 'barding', joint: 'armL' },
    { c: [0.36, 1.22, 0.13], s: [0.05, 0.14, 0.14], rot: [45, 18, 0], mat: 'trim', joint: 'armL' },
    // Right arm + Heroic Broadsword / Runeblade
    { c: [-0.26, 1.24, 0.04], s: [0.11, 0.30, 0.11], mat: 'armor', joint: 'armR' },
    { c: [-0.27, 1.12, 0.16], s: [0.18, 0.04, 0.05], mat: 'trim', joint: 'armR' },
    { c: [-0.27, 1.48, 0.24], s: [0.035, 0.68, 0.09], rot: [15, 0, 0], mat: 'blade', joint: 'armR' },
  ];

  const clips = [
    makeClip('idle', 2.2, 12, (t) => ({
      'mount.translation': [0, 0.78 + 0.01 * Math.sin(t), 0],
      'neck.rotation': rotX(4 * DEG * Math.sin(t)),
      'tail.rotation': rotX((-6 + 5 * Math.sin(t + 1)) * DEG),
      'head.rotation': rotY(5 * DEG * Math.sin(t)),
      'armR.rotation': rotX((-8 + 3 * Math.sin(t)) * DEG),
    })),
    makeClip('run', 0.56, 16, (t) => ({
      'mount.translation': [0, 0.79 + 0.045 * Math.abs(Math.sin(t)), 0],
      'mount.rotation': rotX(5 * DEG * Math.sin(t)),
      'neck.rotation': rotX((-8 + 10 * Math.sin(t + 0.6)) * DEG),
      'legFL.rotation': rotX(-42 * DEG * Math.sin(t)),
      'legFR.rotation': rotX(-42 * DEG * Math.sin(t + 0.7)),
      'legBL.rotation': rotX(40 * DEG * Math.sin(t + 0.3)),
      'legBR.rotation': rotX(40 * DEG * Math.sin(t + 1.0)),
      'tail.rotation': rotX((-22 + 10 * Math.sin(2 * t)) * DEG),
      'rider.rotation': rotX(8 * DEG),
      'armR.rotation': rotX((-22 + 8 * Math.sin(t)) * DEG),
    })),
    makeClip('attack', 0.75, 16, (t) => {
      const strike = Math.sin(t);
      return {
        'mount.rotation': rotX(-12 * DEG * Math.max(0, strike)),
        'neck.rotation': rotX(-14 * DEG * Math.max(0, strike)),
        'legFL.rotation': rotX(-35 * DEG * Math.max(0, strike)),
        'legFR.rotation': rotX(-30 * DEG * Math.max(0, strike)),
        'rider.rotation': rotY(-14 * DEG * strike),
        'armR.rotation': rotX((-55 + 85 * Math.sin(t - 0.5)) * DEG),
      };
    }),
  ];

  return encodeGlb(name, mats, parts, joints, clips);
}

// ============================================================================
//  2. BIPEDAL & WINGED CREATURES (Archer, Footman, Angel, Skeleton, Imp, Demon)
// ============================================================================
function buildHumanoidUnit(name, cfg) {
  const hasWings = !!cfg.wings;
  const joints = [
    { name: 'hips', at: [0, cfg.hipY, 0], parent: -1 },
    { name: 'torso', at: [0, cfg.hipY + 0.06, 0], parent: 0 },
    { name: 'head', at: [0, cfg.headY, 0], parent: 1 },
    { name: 'armL', at: [cfg.shX, cfg.shY, 0], parent: 1 },
    { name: 'armR', at: [-cfg.shX, cfg.shY, 0], parent: 1 },
    { name: 'legL', at: [cfg.legX, cfg.hipY, 0], parent: 0 },
    { name: 'legR', at: [-cfg.legX, cfg.hipY, 0], parent: 0 },
    ...(hasWings ? [
      { name: 'wingL', at: [0.12, cfg.shY - 0.04, -0.11], parent: 1 },
      { name: 'wingR', at: [-0.12, cfg.shY - 0.04, -0.11], parent: 1 },
    ] : []),
  ];

  const clips = [
    makeClip('idle', 2.0, 12, (t) => ({
      'hips.translation': [0, cfg.hipY + (cfg.hover ? 0.05 * Math.sin(t) : 0.008 * Math.sin(t)), 0],
      'torso.rotation': rotX(2 * DEG * Math.sin(t)),
      'head.rotation': rotY(5 * DEG * Math.sin(t)),
      'armL.rotation': rotX((cfg.armLIdle || -8) * DEG + 3 * DEG * Math.sin(t)),
      'armR.rotation': rotX((cfg.armRIdle || -12) * DEG - 3 * DEG * Math.sin(t)),
      ...(hasWings ? {
        'wingL.rotation': rotY((-18 - 14 * Math.sin(t)) * DEG),
        'wingR.rotation': rotY((18 + 14 * Math.sin(t)) * DEG),
      } : {}),
    })),
    makeClip('run', 0.60, 16, (t) => ({
      'hips.translation': [0, cfg.hipY + (cfg.hover ? 0.08 : 0.03 * Math.abs(Math.sin(t))), 0],
      'torso.rotation': rotX((cfg.hover ? 16 : 10) * DEG),
      'legL.rotation': rotX((cfg.hover ? 14 : -42 * Math.sin(t)) * DEG),
      'legR.rotation': rotX((cfg.hover ? 20 : 42 * Math.sin(t)) * DEG),
      'armL.rotation': rotX(((cfg.armLIdle || 0) + 26 * Math.sin(t)) * DEG),
      'armR.rotation': rotX(((cfg.armRIdle || -18) - 24 * Math.sin(t)) * DEG),
      ...(hasWings ? {
        'wingL.rotation': rotY((-24 - 28 * Math.sin(t)) * DEG),
        'wingR.rotation': rotY((24 + 28 * Math.sin(t)) * DEG),
      } : {}),
    })),
    makeClip('attack', 0.68, 16, (t) => ({
      'torso.rotation': qmul(rotY(-14 * DEG * Math.sin(t)), rotX(12 * DEG * Math.max(0, Math.sin(t)))),
      'armR.rotation': rotX(cfg.ranged
        ? (-75 + 16 * Math.max(0, Math.sin(t * 2))) * DEG
        : (-95 + 115 * Math.sin(t - 0.35)) * DEG),
      'armL.rotation': rotX(cfg.ranged ? -68 * DEG : (-25 + 18 * Math.sin(t)) * DEG),
      ...(hasWings ? {
        'wingL.rotation': rotY((-35 - 22 * Math.max(0, Math.sin(t))) * DEG),
        'wingR.rotation': rotY((35 + 22 * Math.max(0, Math.sin(t))) * DEG),
      } : {}),
    })),
  ];

  return encodeGlb(name, cfg.mats, cfg.parts, joints, clips);
}

function buildArcher() {
  return buildHumanoidUnit('unit_archer', {
    hipY: 0.84, headY: 1.40, shX: 0.24, shY: 1.32, legX: 0.10,
    ranged: true, armLIdle: -48, armRIdle: -52,
    mats: [
      { name: 'cloth', hex: '#2255a4' },
      { name: 'steel', hex: '#9aa4b0' },
      { name: 'gold', hex: '#e6b83c' },
      { name: 'skin', hex: '#dba074' },
      { name: 'wood', hex: '#8b5a2b' },
      { name: 'leather', hex: '#54351e' },
    ],
    parts: [
      // Legs & boots
      { c: [0.10, 0.56, 0], s: [0.13, 0.52, 0.13], mat: 'cloth', joint: 'legL' },
      { c: [0.10, 0.15, 0.02], s: [0.14, 0.30, 0.17], mat: 'leather', joint: 'legL' },
      { c: [-0.10, 0.56, 0], s: [0.13, 0.52, 0.13], mat: 'cloth', joint: 'legR' },
      { c: [-0.10, 0.15, 0.02], s: [0.14, 0.30, 0.17], mat: 'leather', joint: 'legR' },
      // Hips, surcoat, belt & quiver
      { c: [0, 0.84, 0], s: [0.34, 0.16, 0.20], mat: 'leather', joint: 'hips' },
      { c: [0, 1.14, 0], s: [0.36, 0.46, 0.22], mat: 'cloth', joint: 'torso' },
      { c: [0, 1.15, 0.115], s: [0.16, 0.38, 0.02], mat: 'gold', joint: 'torso' },
      { c: [0.10, 1.18, -0.15], h: 0.38, r: [0.055, 0.065], n: 6, rot: [0, 0, -16], mat: 'leather', joint: 'torso' },
      // Head + Kettle Helm
      { c: [0, 1.52, 0], s: [0.21, 0.22, 0.21], mat: 'skin', joint: 'head' },
      { c: [0, 1.60, 0], h: 0.05, r: [0.23, 0.18], n: 8, mat: 'steel', joint: 'head' },
      { c: [0, 1.67, 0], h: 0.13, r: [0.15, 0.06], n: 8, mat: 'steel', joint: 'head' },
      // Arms + Crossbow
      { c: [0.24, 1.14, 0.05], s: [0.10, 0.36, 0.10], mat: 'cloth', joint: 'armL' },
      { c: [-0.24, 1.14, 0.05], s: [0.10, 0.36, 0.10], mat: 'cloth', joint: 'armR' },
      { c: [-0.14, 0.98, 0.24], s: [0.06, 0.08, 0.46], mat: 'wood', joint: 'armR' },
      { c: [-0.14, 0.99, 0.42], s: [0.46, 0.035, 0.06], mat: 'steel', joint: 'armR' },
      { c: [-0.14, 1.03, 0.34], s: [0.02, 0.02, 0.34], mat: 'gold', joint: 'armR' },
    ],
  });
}

function buildFootman() {
  return buildHumanoidUnit('unit_footman', {
    hipY: 0.86, headY: 1.44, shX: 0.26, shY: 1.36, legX: 0.11,
    armLIdle: -22, armRIdle: -18,
    mats: [
      { name: 'steel', hex: '#b0bac4' },
      { name: 'darksteel', hex: '#5f6872' },
      { name: 'cloth', hex: '#1e4ea1' },
      { name: 'gold', hex: '#ebb93b' },
    ],
    parts: [
      // Armored greaves & sabatons
      { c: [0.11, 0.46, 0], s: [0.15, 0.76, 0.15], mat: 'steel', joint: 'legL' },
      { c: [0.11, 0.06, 0.03], s: [0.15, 0.12, 0.21], mat: 'darksteel', joint: 'legL' },
      { c: [-0.11, 0.46, 0], s: [0.15, 0.76, 0.15], mat: 'steel', joint: 'legR' },
      { c: [-0.11, 0.06, 0.03], s: [0.15, 0.12, 0.21], mat: 'darksteel', joint: 'legR' },
      // Tassets, breastplate & tabard
      { c: [0, 0.86, 0], s: [0.38, 0.18, 0.23], mat: 'cloth', joint: 'hips' },
      { c: [0, 1.18, 0], s: [0.42, 0.48, 0.25], mat: 'steel', joint: 'torso' },
      { c: [0, 1.14, 0.13], s: [0.22, 0.44, 0.03], mat: 'cloth', joint: 'torso' },
      { c: [0.25, 1.36, 0], s: [0.14, 0.14, 0.18], mat: 'gold', joint: 'torso' },
      { c: [-0.25, 1.36, 0], s: [0.14, 0.14, 0.18], mat: 'gold', joint: 'torso' },
      // Visored Greathelm + Crest
      { c: [0, 1.58, 0], h: 0.26, r: [0.13, 0.12], n: 8, mat: 'steel', joint: 'head' },
      { c: [0, 1.58, 0.11], s: [0.18, 0.05, 0.04], mat: 'darksteel', joint: 'head' },
      { c: [0, 1.74, -0.02], s: [0.06, 0.12, 0.20], mat: 'cloth', joint: 'head' },
      // Left arm + Tower Shield
      { c: [0.26, 1.16, 0.02], s: [0.12, 0.38, 0.12], mat: 'steel', joint: 'armL' },
      { c: [0.34, 1.06, 0.14], s: [0.06, 0.66, 0.38], rot: [0, 22, 0], mat: 'cloth', joint: 'armL' },
      { c: [0.36, 1.06, 0.15], s: [0.06, 0.70, 0.06], rot: [0, 22, 0], mat: 'gold', joint: 'armL' },
      { c: [0.36, 1.10, 0.15], s: [0.06, 0.06, 0.36], rot: [0, 22, 0], mat: 'gold', joint: 'armL' },
      // Right arm + Broadsword
      { c: [-0.26, 1.16, 0.02], s: [0.12, 0.38, 0.12], mat: 'steel', joint: 'armR' },
      { c: [-0.26, 0.96, 0.18], s: [0.20, 0.04, 0.05], mat: 'gold', joint: 'armR' },
      { c: [-0.26, 1.24, 0.34], s: [0.035, 0.64, 0.085], rot: [32, 0, 0], mat: 'steel', joint: 'armR' },
    ],
  });
}

function buildAngel() {
  return buildHumanoidUnit('unit_angel', {
    hipY: 1.04, headY: 1.66, shX: 0.28, shY: 1.56, legX: 0.12,
    wings: true, hover: true, armLIdle: -18, armRIdle: -26,
    mats: [
      { name: 'ivory', hex: '#f4f2ec' },
      { name: 'gold', hex: '#f2c144' },
      { name: 'azure', hex: '#2864c4' },
      { name: 'flame', hex: '#ff922b' },
      { name: 'skin', hex: '#ecc09b' },
    ],
    parts: [
      // Celestial greaves & flowing sash
      { c: [0.12, 0.62, 0], s: [0.15, 0.80, 0.15], mat: 'ivory', joint: 'legL' },
      { c: [-0.12, 0.62, 0], s: [0.15, 0.80, 0.15], mat: 'ivory', joint: 'legR' },
      { c: [0, 0.98, 0], s: [0.40, 0.24, 0.24], mat: 'gold', joint: 'hips' },
      { c: [0, 0.72, 0.13], s: [0.18, 0.52, 0.03], mat: 'azure', joint: 'hips' },
      // Cuirass & pauldrons
      { c: [0, 1.36, 0], s: [0.44, 0.52, 0.24], mat: 'ivory', joint: 'torso' },
      { c: [0, 1.38, 0.13], s: [0.22, 0.36, 0.03], mat: 'gold', joint: 'torso' },
      { c: [0.28, 1.56, 0], s: [0.16, 0.15, 0.20], mat: 'gold', joint: 'torso' },
      { c: [-0.28, 1.56, 0], s: [0.16, 0.15, 0.20], mat: 'gold', joint: 'torso' },
      // Hooded helm + Radiant Halo
      { c: [0, 1.80, 0], s: [0.22, 0.25, 0.22], mat: 'ivory', joint: 'head' },
      { c: [0, 1.79, 0.10], s: [0.14, 0.14, 0.04], mat: 'skin', joint: 'head' },
      { c: [0, 2.02, -0.02], h: 0.03, r: [0.20, 0.20], n: 8, mat: 'gold', joint: 'head' },
      // Sweeping Feathered Wings
      { c: [0.48, 1.62, -0.16], s: [0.72, 0.22, 0.05], rot: [0, 0, 18], mat: 'gold', joint: 'wingL' },
      { c: [0.56, 1.38, -0.18], s: [0.82, 0.34, 0.04], rot: [0, 0, 8], mat: 'ivory', joint: 'wingL' },
      { c: [0.42, 1.12, -0.19], s: [0.56, 0.26, 0.04], rot: [0, 0, -8], mat: 'ivory', joint: 'wingL' },
      { c: [-0.48, 1.62, -0.16], s: [0.72, 0.22, 0.05], rot: [0, 0, -18], mat: 'gold', joint: 'wingR' },
      { c: [-0.56, 1.38, -0.18], s: [0.82, 0.34, 0.04], rot: [0, 0, -8], mat: 'ivory', joint: 'wingR' },
      { c: [-0.42, 1.12, -0.19], s: [0.56, 0.26, 0.04], rot: [0, 0, 8], mat: 'ivory', joint: 'wingR' },
      // Arms + Flaming Celestial Greatsword
      { c: [0.29, 1.34, 0.04], s: [0.12, 0.42, 0.12], mat: 'ivory', joint: 'armL' },
      { c: [-0.29, 1.34, 0.04], s: [0.12, 0.42, 0.12], mat: 'ivory', joint: 'armR' },
      { c: [-0.29, 1.14, 0.22], s: [0.28, 0.05, 0.06], mat: 'gold', joint: 'armR' },
      { c: [-0.29, 1.54, 0.42], s: [0.04, 0.92, 0.11], rot: [28, 0, 0], mat: 'flame', joint: 'armR' },
    ],
  });
}

function buildSkeleton() {
  return buildHumanoidUnit('unit_skeleton', {
    hipY: 0.82, headY: 1.38, shX: 0.23, shY: 1.30, legX: 0.10,
    armLIdle: -16, armRIdle: -20,
    mats: [
      { name: 'bone', hex: '#dfd8c5' },
      { name: 'dark', hex: '#2a2233' },
      { name: 'cloth', hex: '#4c2c69' },
      { name: 'iron', hex: '#737b84' },
      { name: 'glow', hex: '#3ddc84' },
    ],
    parts: [
      // Thin bone legs
      { c: [0.10, 0.42, 0], s: [0.07, 0.78, 0.07], mat: 'bone', joint: 'legL' },
      { c: [0.10, 0.04, 0.03], s: [0.10, 0.08, 0.16], mat: 'bone', joint: 'legL' },
      { c: [-0.10, 0.42, 0], s: [0.07, 0.78, 0.07], mat: 'bone', joint: 'legR' },
      { c: [-0.10, 0.04, 0.03], s: [0.10, 0.08, 0.16], mat: 'bone', joint: 'legR' },
      // Pelvis, spine, ribcage & tattered cloth
      { c: [0, 0.82, 0], s: [0.28, 0.12, 0.16], mat: 'bone', joint: 'hips' },
      { c: [0, 0.66, 0.09], s: [0.22, 0.28, 0.03], mat: 'cloth', joint: 'hips' },
      { c: [0, 1.08, -0.02], s: [0.08, 0.44, 0.08], mat: 'bone', joint: 'torso' },
      { c: [0, 1.18, 0.01], s: [0.32, 0.26, 0.18], mat: 'bone', joint: 'torso' },
      { c: [0, 1.17, 0.105], s: [0.06, 0.22, 0.02], mat: 'dark', joint: 'torso' },
      // Skull & necro eyes
      { c: [0, 1.52, 0], s: [0.21, 0.22, 0.22], mat: 'bone', joint: 'head' },
      { c: [0.05, 1.54, 0.112], s: [0.045, 0.04, 0.02], mat: 'glow', joint: 'head' },
      { c: [-0.05, 1.54, 0.112], s: [0.045, 0.04, 0.02], mat: 'glow', joint: 'head' },
      // Bone arms + buckler + scimitar
      { c: [0.23, 1.10, 0], s: [0.065, 0.38, 0.065], mat: 'bone', joint: 'armL' },
      { c: [0.30, 1.02, 0.10], h: 0.05, r: [0.18, 0.16], n: 7, rot: [0, 0, 90], mat: 'iron', joint: 'armL' },
      { c: [-0.23, 1.10, 0], s: [0.065, 0.38, 0.065], mat: 'bone', joint: 'armR' },
      { c: [-0.23, 1.14, 0.28], s: [0.03, 0.56, 0.09], rot: [36, 0, 0], mat: 'iron', joint: 'armR' },
    ],
  });
}

function buildImp() {
  return buildHumanoidUnit('unit_imp', {
    hipY: 0.56, headY: 0.98, shX: 0.20, shY: 0.92, legX: 0.09,
    armLIdle: -30, armRIdle: -30,
    mats: [
      { name: 'red', hex: '#c92a2a' },
      { name: 'dark', hex: '#2c1d24' },
      { name: 'horn', hex: '#dfd3bc' },
      { name: 'fire', hex: '#ff922b' },
    ],
    parts: [
      { c: [0.09, 0.28, 0], s: [0.10, 0.54, 0.10], mat: 'red', joint: 'legL' },
      { c: [-0.09, 0.28, 0], s: [0.10, 0.54, 0.10], mat: 'red', joint: 'legR' },
      { c: [0, 0.56, 0], s: [0.26, 0.14, 0.18], mat: 'dark', joint: 'hips' },
      { c: [0, 0.48, -0.24], s: [0.05, 0.05, 0.38], rot: [22, 0, 0], mat: 'red', joint: 'hips' },
      { c: [0, 0.78, 0.02], s: [0.32, 0.34, 0.22], rot: [12, 0, 0], mat: 'red', joint: 'torso' },
      // Oversized imp head, ears, horns & glowing eyes
      { c: [0, 1.12, 0.05], s: [0.24, 0.23, 0.24], mat: 'red', joint: 'head' },
      { c: [0.06, 1.15, 0.172], s: [0.05, 0.04, 0.02], mat: 'fire', joint: 'head' },
      { c: [-0.06, 1.15, 0.172], s: [0.05, 0.04, 0.02], mat: 'fire', joint: 'head' },
      { c: [0.11, 1.28, 0.02], h: 0.20, r: [0.04, 0.008], n: 5, rot: [-16, 0, -24], mat: 'horn', joint: 'head' },
      { c: [-0.11, 1.28, 0.02], h: 0.20, r: [0.04, 0.008], n: 5, rot: [-16, 0, 24], mat: 'horn', joint: 'head' },
      // Clawed arms
      { c: [0.21, 0.76, 0.08], s: [0.09, 0.34, 0.09], mat: 'red', joint: 'armL' },
      { c: [0.21, 0.58, 0.16], h: 0.14, r: [0.045, 0.008], n: 4, rot: [55, 0, 0], mat: 'horn', joint: 'armL' },
      { c: [-0.21, 0.76, 0.08], s: [0.09, 0.34, 0.09], mat: 'red', joint: 'armR' },
      { c: [-0.21, 0.58, 0.16], h: 0.14, r: [0.045, 0.008], n: 4, rot: [55, 0, 0], mat: 'horn', joint: 'armR' },
    ],
  });
}

function buildDemon() {
  return buildHumanoidUnit('unit_demon', {
    hipY: 1.00, headY: 1.72, shX: 0.36, shY: 1.60, legX: 0.16,
    wings: true, armLIdle: -20, armRIdle: -28,
    mats: [
      { name: 'skin', hex: '#9e1c20' },
      { name: 'obsidian', hex: '#262129' },
      { name: 'lava', hex: '#ff6b1a' },
      { name: 'horn', hex: '#d8ccb8' },
    ],
    parts: [
      { c: [0.16, 0.52, 0], s: [0.20, 0.92, 0.20], mat: 'obsidian', joint: 'legL' },
      { c: [-0.16, 0.52, 0], s: [0.20, 0.92, 0.20], mat: 'obsidian', joint: 'legR' },
      { c: [0, 1.00, 0], s: [0.48, 0.24, 0.28], mat: 'obsidian', joint: 'hips' },
      { c: [0, 1.40, 0], s: [0.58, 0.60, 0.34], mat: 'skin', joint: 'torso' },
      { c: [0, 1.44, 0.175], s: [0.26, 0.30, 0.04], mat: 'lava', joint: 'torso' },
      { c: [0.36, 1.64, 0], s: [0.20, 0.18, 0.24], mat: 'obsidian', joint: 'torso' },
      { c: [-0.36, 1.64, 0], s: [0.20, 0.18, 0.24], mat: 'obsidian', joint: 'torso' },
      // Horned Pit Lord head
      { c: [0, 1.88, 0.02], s: [0.28, 0.28, 0.28], mat: 'skin', joint: 'head' },
      { c: [0.07, 1.90, 0.165], s: [0.06, 0.04, 0.02], mat: 'lava', joint: 'head' },
      { c: [-0.07, 1.90, 0.165], s: [0.06, 0.04, 0.02], mat: 'lava', joint: 'head' },
      { c: [0.20, 2.08, 0.02], h: 0.36, r: [0.065, 0.01], n: 5, rot: [-10, 0, -34], mat: 'horn', joint: 'head' },
      { c: [-0.20, 2.08, 0.02], h: 0.36, r: [0.065, 0.01], n: 5, rot: [-10, 0, 34], mat: 'horn', joint: 'head' },
      // Bat wings
      { c: [0.54, 1.66, -0.18], s: [0.76, 0.42, 0.05], rot: [0, 0, 14], mat: 'obsidian', joint: 'wingL' },
      { c: [-0.54, 1.66, -0.18], s: [0.76, 0.42, 0.05], rot: [0, 0, -14], mat: 'obsidian', joint: 'wingR' },
      // Muscular arms + Molten Executioner Cleaver
      { c: [0.38, 1.32, 0.04], s: [0.16, 0.48, 0.16], mat: 'skin', joint: 'armL' },
      { c: [-0.38, 1.32, 0.04], s: [0.16, 0.48, 0.16], mat: 'skin', joint: 'armR' },
      { c: [-0.38, 1.24, 0.32], s: [0.05, 0.86, 0.06], rot: [36, 0, 0], mat: 'obsidian', joint: 'armR' },
      { c: [-0.38, 1.52, 0.52], s: [0.045, 0.46, 0.24], rot: [36, 0, 0], mat: 'lava', joint: 'armR' },
    ],
  });
}

// ============================================================================
//  3. QUADRUPED & AVIAN BEASTS (Imperial Griffin & Hellhound)
// ============================================================================
function buildGriffin() {
  const joints = [
    { name: 'body', at: [0, 0.78, 0], parent: -1 },
    { name: 'head', at: [0, 1.00, 0.38], parent: 0 },
    { name: 'wingL', at: [0.18, 0.96, 0.10], parent: 0 },
    { name: 'wingR', at: [-0.18, 0.96, 0.10], parent: 0 },
    { name: 'legFL', at: [0.15, 0.60, 0.28], parent: 0 },
    { name: 'legFR', at: [-0.15, 0.60, 0.28], parent: 0 },
    { name: 'legBL', at: [0.15, 0.60, -0.30], parent: 0 },
    { name: 'legBR', at: [-0.15, 0.60, -0.30], parent: 0 },
  ];
  const mats = [
    { name: 'lion', hex: '#d89b3c' },
    { name: 'feather', hex: '#f4f4f6' },
    { name: 'beak', hex: '#f0b828' },
    { name: 'royal', hex: '#2255a4' },
  ];
  const parts = [
    { c: [0, 0.78, -0.10], s: [0.38, 0.34, 0.66], mat: 'lion', joint: 'body' },
    { c: [0, 0.84, 0.22], s: [0.42, 0.38, 0.36], mat: 'feather', joint: 'body' },
    { c: [0, 0.92, 0.32], s: [0.44, 0.12, 0.18], mat: 'royal', joint: 'body' },
    { c: [0, 0.78, -0.56], s: [0.08, 0.08, 0.38], rot: [-18, 0, 0], mat: 'lion', joint: 'body' },
    // Eagle head + golden hooked beak
    { c: [0, 1.18, 0.48], s: [0.26, 0.28, 0.28], mat: 'feather', joint: 'head' },
    { c: [0, 1.15, 0.70], h: 0.22, r: [0.08, 0.01], n: 5, rot: [82, 0, 0], mat: 'beak', joint: 'head' },
    // Broad wings
    { c: [0.58, 1.06, 0.04], s: [0.86, 0.06, 0.44], rot: [0, 0, 14], mat: 'feather', joint: 'wingL' },
    { c: [0.44, 1.08, 0.20], s: [0.56, 0.07, 0.14], rot: [0, 0, 14], mat: 'royal', joint: 'wingL' },
    { c: [-0.58, 1.06, 0.04], s: [0.86, 0.06, 0.44], rot: [0, 0, -14], mat: 'feather', joint: 'wingR' },
    { c: [-0.44, 1.08, 0.20], s: [0.56, 0.07, 0.14], rot: [0, 0, -14], mat: 'royal', joint: 'wingR' },
    // Talons & hind legs
    { c: [0.15, 0.30, 0.28], s: [0.11, 0.58, 0.11], mat: 'beak', joint: 'legFL' },
    { c: [-0.15, 0.30, 0.28], s: [0.11, 0.58, 0.11], mat: 'beak', joint: 'legFR' },
    { c: [0.15, 0.30, -0.30], s: [0.12, 0.58, 0.12], mat: 'lion', joint: 'legBL' },
    { c: [-0.15, 0.30, -0.30], s: [0.12, 0.58, 0.12], mat: 'lion', joint: 'legBR' },
  ];
  const clips = [
    makeClip('idle', 1.8, 12, (t) => ({
      'body.translation': [0, 0.80 + 0.03 * Math.sin(t), 0],
      'head.rotation': rotX(6 * DEG * Math.sin(t)),
      'wingL.rotation': rotZ((14 + 18 * Math.sin(t)) * DEG),
      'wingR.rotation': rotZ((-14 - 18 * Math.sin(t)) * DEG),
    })),
    makeClip('run', 0.52, 16, (t) => ({
      'body.translation': [0, 0.94 + 0.08 * Math.sin(t), 0],
      'body.rotation': rotX(10 * DEG),
      'wingL.rotation': rotZ((10 + 38 * Math.sin(t)) * DEG),
      'wingR.rotation': rotZ((-10 - 38 * Math.sin(t)) * DEG),
      'legFL.rotation': rotX(28 * DEG),
      'legFR.rotation': rotX(28 * DEG),
      'legBL.rotation': rotX(34 * DEG),
      'legBR.rotation': rotX(34 * DEG),
    })),
    makeClip('attack', 0.65, 16, (t) => ({
      'body.translation': [0, 0.86 + 0.14 * Math.max(0, Math.sin(t)), 0],
      'body.rotation': rotX(-18 * DEG * Math.sin(t)),
      'wingL.rotation': rotZ((32 + 24 * Math.sin(t)) * DEG),
      'wingR.rotation': rotZ((-32 - 24 * Math.sin(t)) * DEG),
      'legFL.rotation': rotX((-55 * Math.max(0, Math.sin(t))) * DEG),
      'legFR.rotation': rotX((-55 * Math.max(0, Math.sin(t))) * DEG),
    })),
  ];
  return encodeGlb('unit_griffin', mats, parts, joints, clips);
}

function buildHellhound() {
  const joints = [
    { name: 'body', at: [0, 0.56, 0], parent: -1 },
    { name: 'head', at: [0, 0.68, 0.36], parent: 0 },
    { name: 'legFL', at: [0.14, 0.44, 0.26], parent: 0 },
    { name: 'legFR', at: [-0.14, 0.44, 0.26], parent: 0 },
    { name: 'legBL', at: [0.14, 0.44, -0.28], parent: 0 },
    { name: 'legBR', at: [-0.14, 0.44, -0.28], parent: 0 },
  ];
  const mats = [
    { name: 'hide', hex: '#6e171c' },
    { name: 'dark', hex: '#241a20' },
    { name: 'fire', hex: '#ff771c' },
    { name: 'fang', hex: '#e8dec8' },
  ];
  const parts = [
    { c: [0, 0.58, 0], s: [0.34, 0.30, 0.76], mat: 'hide', joint: 'body' },
    { c: [0, 0.78, 0.14], s: [0.14, 0.18, 0.42], mat: 'fire', joint: 'body' },
    { c: [0, 0.62, -0.48], s: [0.08, 0.08, 0.30], rot: [24, 0, 0], mat: 'fire', joint: 'body' },
    // Snout, collar & fangs
    { c: [0, 0.76, 0.48], s: [0.26, 0.24, 0.28], mat: 'hide', joint: 'head' },
    { c: [0, 0.71, 0.68], s: [0.18, 0.14, 0.22], mat: 'dark', joint: 'head' },
    { c: [0.07, 0.80, 0.61], s: [0.04, 0.04, 0.04], mat: 'fire', joint: 'head' },
    { c: [-0.07, 0.80, 0.61], s: [0.04, 0.04, 0.04], mat: 'fire', joint: 'head' },
    { c: [0.06, 0.62, 0.74], h: 0.08, r: [0.025, 0.005], n: 4, rot: [180, 0, 0], mat: 'fang', joint: 'head' },
    { c: [-0.06, 0.62, 0.74], h: 0.08, r: [0.025, 0.005], n: 4, rot: [180, 0, 0], mat: 'fang', joint: 'head' },
    // 4 Legs
    { c: [0.14, 0.23, 0.26], s: [0.10, 0.46, 0.10], mat: 'dark', joint: 'legFL' },
    { c: [-0.14, 0.23, 0.26], s: [0.10, 0.46, 0.10], mat: 'dark', joint: 'legFR' },
    { c: [0.14, 0.23, -0.28], s: [0.11, 0.46, 0.11], mat: 'hide', joint: 'legBL' },
    { c: [-0.14, 0.23, -0.28], s: [0.11, 0.46, 0.11], mat: 'hide', joint: 'legBR' },
  ];
  const clips = [
    makeClip('idle', 1.6, 12, (t) => ({
      'body.translation': [0, 0.56 + 0.012 * Math.sin(t), 0],
      'head.rotation': rotX(6 * DEG * Math.sin(t)),
    })),
    makeClip('run', 0.48, 16, (t) => ({
      'body.translation': [0, 0.58 + 0.04 * Math.abs(Math.sin(t)), 0],
      'legFL.rotation': rotX(-45 * DEG * Math.sin(t)),
      'legFR.rotation': rotX(-45 * DEG * Math.sin(t + 0.5)),
      'legBL.rotation': rotX(45 * DEG * Math.sin(t)),
      'legBR.rotation': rotX(45 * DEG * Math.sin(t + 0.5)),
    })),
    makeClip('attack', 0.58, 16, (t) => ({
      'body.translation': [0, 0.58 + 0.08 * Math.max(0, Math.sin(t)), 0.14 * Math.max(0, Math.sin(t))],
      'head.rotation': rotX((-22 + 36 * Math.sin(t)) * DEG),
    })),
  ];
  return encodeGlb('unit_hellhound', mats, parts, joints, clips);
}

// ============================================================================
//  4. STATIC ADVENTURE MAP BUILDINGS & PROPS (with buried foundations)
// ============================================================================
function buildCastleHaven() {
  const mats = [
    { name: 'stone', hex: '#e5dfd2' },
    { name: 'darkstone', hex: '#9ca3ad' },
    { name: 'roof', hex: '#2054a8' },
    { name: 'gold', hex: '#eab83a' },
    { name: 'gate', hex: '#4b3320' },
  ];
  const corners = [[1.25, 1.25], [-1.25, 1.25], [1.25, -1.25], [-1.25, -1.25]];
  const parts = [
    // Foundation plinth extending below ground (-0.28 m) so slopes never expose gaps
    { c: [0, -0.04, 0], s: [3.20, 0.48, 3.20], mat: 'darkstone' },
    // Curtain walls
    { c: [0, 0.65, 1.22], s: [2.30, 0.92, 0.28], mat: 'stone' },
    { c: [0, 0.65, -1.22], s: [2.30, 0.92, 0.28], mat: 'stone' },
    { c: [1.22, 0.65, 0], s: [0.28, 0.92, 2.30], mat: 'stone' },
    { c: [-1.22, 0.65, 0], s: [0.28, 0.92, 2.30], mat: 'stone' },
    // Gatehouse (+Z front)
    { c: [0, 0.78, 1.32], s: [0.92, 1.22, 0.46], mat: 'stone' },
    { c: [0, 0.52, 1.54], s: [0.46, 0.72, 0.08], mat: 'gate' },
    { c: [0, 1.58, 1.32], h: 0.44, r: [0.64, 0.04], n: 4, yaw: 45, mat: 'roof' },
    // 4 Corner towers with blue conical roofs & gold finials
    ...corners.flatMap(([tx, tz]) => [
      { c: [tx, 0.88, tz], h: 1.44, r: [0.36, 0.33], n: 8, mat: 'stone' },
      { c: [tx, 1.88, tz], h: 0.64, r: [0.44, 0.02], n: 8, mat: 'roof' },
      { c: [tx, 2.26, tz], h: 0.18, r: [0.04, 0.008], n: 6, mat: 'gold' },
    ]),
    // Central Cathedral Keep & Sun Spire
    { c: [0, 1.15, -0.10], s: [1.28, 1.92, 1.28], mat: 'stone' },
    { c: [0, 2.48, -0.10], h: 0.84, r: [0.92, 0.05], n: 4, yaw: 45, mat: 'roof' },
    { c: [0, 2.35, -0.10], h: 1.10, r: [0.28, 0.22], n: 8, mat: 'stone' },
    { c: [0, 3.22, -0.10], h: 0.72, r: [0.32, 0.02], n: 8, mat: 'gold' },
  ];
  return encodeGlb('castle_haven', mats, parts);
}

function buildCastleInferno() {
  const mats = [
    { name: 'basalt', hex: '#2d2832' },
    { name: 'obsidian', hex: '#19161e' },
    { name: 'lava', hex: '#ff5c16' },
    { name: 'crimson', hex: '#b82025' },
    { name: 'horn', hex: '#cfc2ad' },
  ];
  const corners = [[1.22, 1.22], [-1.22, 1.22], [1.22, -1.22], [-1.22, -1.22]];
  const parts = [
    { c: [0, -0.04, 0], s: [3.16, 0.48, 3.16], mat: 'obsidian' },
    { c: [0, 0.62, 1.20], s: [2.26, 0.88, 0.30], mat: 'basalt' },
    { c: [0, 0.62, -1.20], s: [2.26, 0.88, 0.30], mat: 'basalt' },
    { c: [1.20, 0.62, 0], s: [0.30, 0.88, 2.26], mat: 'basalt' },
    { c: [-1.20, 0.62, 0], s: [0.30, 0.88, 2.26], mat: 'basalt' },
    // Horned Gate
    { c: [0, 0.78, 1.32], s: [0.94, 1.20, 0.44], mat: 'obsidian' },
    { c: [0, 0.52, 1.54], s: [0.46, 0.72, 0.08], mat: 'lava' },
    { c: [0.44, 1.62, 1.36], h: 0.56, r: [0.11, 0.01], n: 5, rot: [0, 0, -18], mat: 'horn' },
    { c: [-0.44, 1.62, 1.36], h: 0.56, r: [0.11, 0.01], n: 5, rot: [0, 0, 18], mat: 'horn' },
    // 4 Jagged Bastions
    ...corners.flatMap(([tx, tz]) => [
      { c: [tx, 0.92, tz], h: 1.52, r: [0.40, 0.30], n: 6, mat: 'basalt' },
      { c: [tx, 1.72, tz], h: 0.16, r: [0.32, 0.36], n: 6, mat: 'lava' },
      { c: [tx, 2.08, tz], h: 0.62, r: [0.28, 0.02], n: 6, mat: 'crimson' },
    ]),
    // Chaos Keep & Magma Monolith
    { c: [0, 1.18, -0.08], h: 2.00, r: [0.88, 0.64], n: 6, mat: 'obsidian' },
    { c: [0, 2.48, -0.08], h: 1.15, r: [0.52, 0.03], n: 5, mat: 'lava' },
    { c: [0.48, 2.15, -0.08], h: 0.85, r: [0.14, 0.01], n: 5, rot: [0, 0, -22], mat: 'crimson' },
    { c: [-0.48, 2.15, -0.08], h: 0.85, r: [0.14, 0.01], n: 5, rot: [0, 0, 22], mat: 'crimson' },
  ];
  return encodeGlb('castle_inferno', mats, parts);
}

function buildGoldMine() {
  const mats = [
    { name: 'rock', hex: '#7a8088' },
    { name: 'wood', hex: '#8b5c34' },
    { name: 'dark', hex: '#1d1f24' },
    { name: 'gold', hex: '#f4c430' },
  ];
  return encodeGlb('gold_mine', mats, [
    { c: [0, -0.04, 0], h: 0.36, r: [1.28, 1.18], n: 7, mat: 'rock' },
    { c: [0, 0.62, -0.18], h: 1.18, r: [1.05, 0.42], n: 7, mat: 'rock' },
    { c: [0.46, 0.48, -0.25], h: 0.82, r: [0.55, 0.14], n: 6, mat: 'rock' },
    // Timbered adit frame + dark portal
    { c: [0, 0.46, 0.56], s: [0.64, 0.68, 0.24], mat: 'dark' },
    { c: [0.34, 0.48, 0.62], s: [0.12, 0.72, 0.14], mat: 'wood' },
    { c: [-0.34, 0.48, 0.62], s: [0.12, 0.72, 0.14], mat: 'wood' },
    { c: [0, 0.86, 0.62], s: [0.86, 0.14, 0.18], mat: 'wood' },
    // Minecart with gold nuggets
    { c: [0, 0.26, 0.96], s: [0.38, 0.24, 0.46], mat: 'wood' },
    { c: [0, 0.42, 0.96], h: 0.22, r: [0.22, 0.08], n: 6, mat: 'gold' },
    { c: [-0.52, 0.32, 0.62], h: 0.28, r: [0.22, 0.05], n: 5, mat: 'gold' },
  ]);
}

function buildSawmill() {
  const mats = [
    { name: 'stone', hex: '#7c828a' },
    { name: 'wood', hex: '#946338' },
    { name: 'roof', hex: '#633c20' },
    { name: 'steel', hex: '#b5bec8' },
  ];
  return encodeGlb('sawmill', mats, [
    { c: [0, -0.04, 0], s: [2.10, 0.36, 1.80], mat: 'stone' },
    { c: [-0.28, 0.54, 0], s: [1.24, 0.84, 1.18], mat: 'wood' },
    { c: [-0.28, 1.18, 0], h: 0.56, r: [0.98, 0.08], n: 4, yaw: 45, mat: 'roof' },
    // Workbench + steel circular saw + log pile
    { c: [0.62, 0.34, 0.10], s: [0.54, 0.42, 0.88], mat: 'wood' },
    { c: [0.62, 0.62, 0.10], h: 0.05, r: [0.28, 0.28], n: 8, rot: [0, 0, 90], mat: 'steel' },
    { c: [0.62, 0.24, -0.58], h: 0.72, r: [0.14, 0.14], n: 6, rot: [0, 0, 90], mat: 'wood' },
    { c: [0.62, 0.44, -0.58], h: 0.68, r: [0.13, 0.13], n: 6, rot: [0, 0, 90], mat: 'roof' },
  ]);
}

function buildOrePit() {
  const mats = [
    { name: 'granite', hex: '#6d737d' },
    { name: 'iron', hex: '#434b56' },
    { name: 'copper', hex: '#c87533' },
    { name: 'wood', hex: '#8a5b32' },
  ];
  return encodeGlb('ore_pit', mats, [
    { c: [0, -0.04, 0], h: 0.40, r: [1.32, 1.22], n: 8, mat: 'granite' },
    { c: [-0.36, 0.42, -0.22], s: [0.76, 0.56, 0.68], mat: 'iron' },
    { c: [0.38, 0.34, -0.28], s: [0.62, 0.44, 0.58], mat: 'granite' },
    { c: [0.42, 0.32, 0.42], h: 0.38, r: [0.30, 0.12], n: 5, mat: 'copper' },
    { c: [-0.38, 0.28, 0.46], h: 0.32, r: [0.26, 0.10], n: 5, mat: 'iron' },
    // Crane beam
    { c: [0, 0.68, 0.05], s: [0.12, 1.12, 0.12], mat: 'wood' },
    { c: [0.28, 1.16, 0.18], s: [0.76, 0.10, 0.10], rot: [0, -20, 14], mat: 'wood' },
  ]);
}

function buildCrystalCavern() {
  const mats = [
    { name: 'stone', hex: '#545868' },
    { name: 'cyan', hex: '#38bdf8' },
    { name: 'violet', hex: '#a855f7' },
  ];
  return encodeGlb('crystal_cavern', mats, [
    { c: [0, -0.04, 0], h: 0.38, r: [1.24, 1.12], n: 7, mat: 'stone' },
    { c: [0, 0.48, -0.32], h: 0.88, r: [0.92, 0.48], n: 6, mat: 'stone' },
    { c: [0, 0.82, 0.12], h: 1.38, r: [0.26, 0.02], n: 6, rot: [8, 0, 0], mat: 'cyan' },
    { c: [0.38, 0.62, 0.24], h: 0.96, r: [0.20, 0.02], n: 6, rot: [14, 0, -18], mat: 'violet' },
    { c: [-0.36, 0.58, 0.22], h: 0.90, r: [0.19, 0.02], n: 6, rot: [12, 0, 20], mat: 'cyan' },
    { c: [0.16, 0.44, 0.52], h: 0.58, r: [0.15, 0.02], n: 5, rot: [22, 0, -10], mat: 'cyan' },
  ]);
}

function buildShrine() {
  const mats = [
    { name: 'marble', hex: '#edeae2' },
    { name: 'gold', hex: '#eab83a' },
    { name: 'gem', hex: '#38bdf8' },
  ];
  const cols = [[0.48, 0.48], [-0.48, 0.48], [0.48, -0.48], [-0.48, -0.48]];
  return encodeGlb('shrine', mats, [
    { c: [0, -0.02, 0], h: 0.32, r: [1.06, 0.98], n: 8, mat: 'marble' },
    { c: [0, 0.22, 0], h: 0.18, r: [0.84, 0.80], n: 8, mat: 'gold' },
    ...cols.map(([cx, cz]) => ({ c: [cx, 0.82, cz], h: 1.06, r: [0.10, 0.09], n: 6, mat: 'marble' })),
    { c: [0, 1.44, 0], h: 0.22, r: [0.86, 0.72], n: 8, mat: 'marble' },
    { c: [0, 1.72, 0], h: 0.38, r: [0.58, 0.04], n: 8, mat: 'gold' },
    // Floating arcane crystal in center
    { c: [0, 0.86, 0], h: 0.52, r: [0.18, 0.02], n: 6, mat: 'gem' },
    { c: [0, 0.52, 0], h: 0.26, r: [0.02, 0.18], n: 6, mat: 'gem' },
  ]);
}

function buildObelisk() {
  const mats = [
    { name: 'stone', hex: '#88929e' },
    { name: 'rune', hex: '#38bdf8' },
    { name: 'gold', hex: '#f0be3c' },
  ];
  return encodeGlb('obelisk', mats, [
    { c: [0, -0.02, 0], s: [1.16, 0.36, 1.16], mat: 'stone' },
    { c: [0, 0.28, 0], s: [0.82, 0.26, 0.82], mat: 'gold' },
    { c: [0, 1.32, 0], h: 1.88, r: [0.34, 0.18], n: 4, yaw: 45, mat: 'stone' },
    { c: [0, 1.28, 0], s: [0.42, 0.18, 0.42], mat: 'rune' },
    { c: [0, 2.44, 0], h: 0.40, r: [0.20, 0.01], n: 4, yaw: 45, mat: 'gold' },
  ]);
}

function buildTreasureChest() {
  const mats = [
    { name: 'oak', hex: '#8d5524' },
    { name: 'gold', hex: '#f2c138' },
    { name: 'iron', hex: '#495057' },
  ];
  return encodeGlb('treasure_chest', mats, [
    { c: [0, -0.04, 0], s: [0.92, 0.16, 0.68], mat: 'iron' },
    { c: [0, 0.22, 0], s: [0.84, 0.38, 0.56], mat: 'oak' },
    { c: [0, 0.46, 0], s: [0.86, 0.20, 0.58], mat: 'oak' },
    { c: [0.26, 0.30, 0], s: [0.09, 0.54, 0.62], mat: 'gold' },
    { c: [-0.26, 0.30, 0], s: [0.09, 0.54, 0.62], mat: 'gold' },
    { c: [0, 0.36, 0.30], s: [0.14, 0.16, 0.06], mat: 'gold' },
  ]);
}

function buildManaCrystal() {
  const mats = [
    { name: 'base', hex: '#636a75' },
    { name: 'gem', hex: '#60a5fa' },
    { name: 'gold', hex: '#fbbf24' },
  ];
  return encodeGlb('mana_crystal', mats, [
    { c: [0, -0.03, 0], h: 0.24, r: [0.56, 0.48], n: 6, mat: 'base' },
    { c: [0, 0.50, 0], h: 0.86, r: [0.18, 0.02], n: 6, mat: 'gem' },
    { c: [0.22, 0.34, 0.10], h: 0.54, r: [0.13, 0.02], n: 5, rot: [10, 0, -20], mat: 'gold' },
    { c: [-0.20, 0.32, -0.08], h: 0.50, r: [0.12, 0.02], n: 5, rot: [-10, 0, 22], mat: 'gem' },
  ]);
}

function buildPineTree() {
  const mats = [
    { name: 'trunk', hex: '#6e4728' },
    { name: 'pineDark', hex: '#235932' },
    { name: 'pineMid', hex: '#2f7440' },
    { name: 'pineTop', hex: '#3e8c4f' },
  ];
  return encodeGlb('pine_tree', mats, [
    // Trunk buried to -0.25 m so hillside placement never shows air underneath
    { c: [0, 0.32, 0], h: 1.14, r: [0.20, 0.14], n: 6, mat: 'trunk' },
    { c: [0, 1.22, 0], h: 1.08, r: [0.88, 0.16], n: 7, mat: 'pineDark' },
    { c: [0, 1.92, 0], h: 0.98, r: [0.68, 0.12], n: 7, yaw: 25, mat: 'pineMid' },
    { c: [0, 2.58, 0], h: 0.88, r: [0.46, 0.02], n: 7, mat: 'pineTop' },
  ]);
}

function buildRockSpire() {
  const mats = [
    { name: 'rock', hex: '#6c737d' },
    { name: 'moss', hex: '#4f6b46' },
  ];
  return encodeGlb('rock_spire', mats, [
    { c: [0, 0.48, 0], h: 1.56, r: [0.76, 0.14], n: 6, rot: [5, 0, -4], mat: 'rock' },
    { c: [0.46, 0.24, 0.24], h: 0.96, r: [0.52, 0.12], n: 5, rot: [10, 0, -14], mat: 'rock' },
    { c: [-0.42, 0.18, -0.20], h: 0.82, r: [0.48, 0.16], n: 6, rot: [-8, 0, 12], mat: 'moss' },
  ]);
}

export function buildAllModels() {
  return {
    'hero_knight.glb': buildMountedHero('hero_knight', {
      horse: '#f1f0ec', cloth: '#1f52a6', gold: '#ebb93b', armor: '#b4bec8',
      blade: '#dce4ec', skin: '#dba074', dark: '#3d352e', horns: false,
    }),
    'hero_demon.glb': buildMountedHero('hero_demon', {
      horse: '#26212b', cloth: '#b52126', gold: '#e36414', armor: '#3a3342',
      blade: '#ff6b1a', skin: '#9e1c20', dark: '#141118', horns: true,
    }),
    'unit_archer.glb': buildArcher(),
    'unit_footman.glb': buildFootman(),
    'unit_griffin.glb': buildGriffin(),
    'unit_angel.glb': buildAngel(),
    'unit_skeleton.glb': buildSkeleton(),
    'unit_imp.glb': buildImp(),
    'unit_hellhound.glb': buildHellhound(),
    'unit_demon.glb': buildDemon(),
    'castle_haven.glb': buildCastleHaven(),
    'castle_inferno.glb': buildCastleInferno(),
    'gold_mine.glb': buildGoldMine(),
    'sawmill.glb': buildSawmill(),
    'ore_pit.glb': buildOrePit(),
    'crystal_cavern.glb': buildCrystalCavern(),
    'shrine.glb': buildShrine(),
    'obelisk.glb': buildObelisk(),
    'treasure_chest.glb': buildTreasureChest(),
    'mana_crystal.glb': buildManaCrystal(),
    'pine_tree.glb': buildPineTree(),
    'rock_spire.glb': buildRockSpire(),
  };
}

export { OUT_DIR };

if (process.argv[1] && path.resolve(process.argv[1]) === url.fileURLToPath(import.meta.url)) {
  const all = buildAllModels();
  const check = process.argv.includes('--check');
  let differs = false;
  fs.mkdirSync(OUT_DIR, { recursive: true });
  let totalBytes = 0;
  for (const [file, bytes] of Object.entries(all)) {
    const dest = path.join(OUT_DIR, file);
    totalBytes += bytes.length;
    if (check) {
      const same = fs.existsSync(dest) && fs.readFileSync(dest).equals(bytes);
      console.log(file + (same ? ' is up to date' : ' differs from generator'));
      differs = differs || !same;
    } else {
      fs.writeFileSync(dest, bytes);
      console.log(`assets/models/${file}: ${(bytes.length / 1024).toFixed(1)} KB`);
    }
  }
  if (!check) console.log(`Generated ${Object.keys(all).length} low-poly GLB models (${(totalBytes / 1024).toFixed(1)} KB total).`);
  if (check) process.exit(differs ? 1 : 0);
}
