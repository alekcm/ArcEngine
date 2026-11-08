#!/usr/bin/env node
// Offline combat-icon reference matcher. No npm packages; JPEG decoding uses ImageMagick.
// This is NOT an OCR engine and does not invent missing card text.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const LABELS = Object.freeze([
  'att. icon', 'def. icon', 'morale icon', 'att. token', 'def. token',
  'att. cube', 'def. cube', 'morale cube', 'any cube'
]);
const SIZE = 32;
const REF_DIR = 'docs/forbidden-stars/combat-icons';
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Decode the PNG formats used by the scans, without a browser or npm dependency. */
export function decodePNG(buffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!buffer.subarray(0, 8).equals(signature)) throw new Error('Not a PNG');
  let width = 0, height = 0, depth = 0, color = 0, interlace = 0, palette, alpha;
  const idat = [];
  for (let p = 8; p + 12 <= buffer.length;) {
    const n = buffer.readUInt32BE(p), type = buffer.toString('ascii', p + 4, p + 8);
    const data = buffer.subarray(p + 8, p + 8 + n);
    if (p + 12 + n > buffer.length) throw new Error('Truncated PNG');
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      depth = data[8]; color = data[9]; interlace = data[12];
    } else if (type === 'PLTE') palette = data;
    else if (type === 'tRNS') alpha = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    p += n + 12;
  }
  if (!width || !height || width * height > 100_000_000) throw new Error('Invalid or oversized PNG');
  if (depth !== 8 || interlace !== 0 || ![0, 2, 3, 4, 6].includes(color)) {
    throw new Error('PNG must be non-interlaced, 8-bit grayscale/palette/RGB; convert it first');
  }
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[color];
  const stride = width * channels;
  const raw = zlib.inflateSync(Buffer.concat(idat), { maxOutputLength: (stride + 1) * height });
  if (raw.length !== (stride + 1) * height) throw new Error('Invalid PNG pixel length');
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    if (filter > 4) throw new Error('Invalid PNG filter');
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? pixels[y * stride + x - channels] : 0;
      const b = y ? pixels[(y - 1) * stride + x] : 0;
      const c = y && x >= channels ? pixels[(y - 1) * stride + x - channels] : 0;
      let predictor = 0;
      if (filter === 1) predictor = a;
      if (filter === 2) predictor = b;
      if (filter === 3) predictor = Math.floor((a + b) / 2);
      if (filter === 4) {
        const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        predictor = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      pixels[y * stride + x] = (raw[y * (stride + 1) + 1 + x] + predictor) & 255;
    }
  }
  const rgba = Buffer.alloc(width * height * 4, 255);
  for (let i = 0; i < width * height; i++) {
    const s = i * channels, d = i * 4;
    if (color === 2 || color === 6) {
      pixels.copy(rgba, d, s, s + 3);
      if (color === 6) rgba[d + 3] = pixels[s + 3];
    } else if (color === 0 || color === 4) {
      rgba[d] = rgba[d + 1] = rgba[d + 2] = pixels[s];
      if (color === 4) rgba[d + 3] = pixels[s + 1];
      else if (alpha?.length >= 2 && pixels[s] === alpha.readUInt16BE(0)) rgba[d + 3] = 0;
    } else {
      const index = pixels[s];
      if (!palette || index * 3 + 2 >= palette.length) throw new Error('Invalid PNG palette index');
      palette.copy(rgba, d, index * 3, index * 3 + 3);
      if (alpha && index < alpha.length) rgba[d + 3] = alpha[index];
    }
  }
  return { width, height, data: rgba };
}

export function encodePNG(image) {
  const { width, height, data } = image;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    data.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const chunk = (type, body) => {
    const name = Buffer.from(type), size = Buffer.alloc(4), crc = Buffer.alloc(4);
    size.writeUInt32BE(body.length);
    crc.writeUInt32BE(zlib.crc32(Buffer.concat([name, body])) >>> 0);
    return Buffer.concat([size, name, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/** Detect content, not the filename extension: several supplied .png files are JPEGs. */
export function readImage(filename) {
  const buffer = fs.readFileSync(filename);
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return decodePNG(buffer);
  if (buffer[0] !== 255 || buffer[1] !== 216) throw new Error(`Unsupported image format: ${filename}`);
  for (const exe of ['magick', 'convert']) {
    const info = exe === 'magick'
      ? spawnSync(exe, ['identify', '-format', '%w %h', filename], { encoding: 'utf8' })
      : spawnSync('identify', ['-format', '%w %h', filename], { encoding: 'utf8' });
    if (info.error || info.status !== 0) continue;
    const [width, height] = info.stdout.trim().split(/\s+/).map(Number);
    if (!Number.isInteger(width) || !Number.isInteger(height) || width * height > 100_000_000) {
      throw new Error('Invalid or oversized JPEG');
    }
    const result = spawnSync(exe, [filename, '-depth', '8', 'rgba:-'], { maxBuffer: width * height * 4 + 65536 });
    if (!result.error && result.status === 0 && result.stdout.length === width * height * 4) {
      return { width, height, data: result.stdout };
    }
  }
  throw new Error('JPEG requires ImageMagick (magick or convert). True PNG files need only Node.');
}

export function crop(image, box) {
  const [x, y, w, h] = box;
  if (![x, y, w, h].every(Number.isInteger) || x < 0 || y < 0 || w < 1 || h < 1 ||
      x + w > image.width || y + h > image.height) throw new Error(`Crop outside image: ${box}`);
  const data = Buffer.alloc(w * h * 4);
  for (let row = 0; row < h; row++) {
    image.data.copy(data, row * w * 4, ((y + row) * image.width + x) * 4,
      ((y + row) * image.width + x + w) * 4);
  }
  return { width: w, height: h, data };
}

function sample(image, x, y) {
  const xx = clamp(x, 0, image.width - 1), yy = clamp(y, 0, image.height - 1);
  const x0 = Math.floor(xx), y0 = Math.floor(yy), x1 = Math.min(x0 + 1, image.width - 1),
    y1 = Math.min(y0 + 1, image.height - 1), fx = xx - x0, fy = yy - y0;
  const at = (a, b) => { const p = (b * image.width + a) * 4; return image.data[p] * .299 + image.data[p + 1] * .587 + image.data[p + 2] * .114; };
  return (at(x0, y0) * (1 - fx) + at(x1, y0) * fx) * (1 - fy) +
    (at(x0, y1) * (1 - fx) + at(x1, y1) * fx) * fy;
}

/** Isolate the printed symbol from paper colour and uneven margins. */
function inkMask(image, location = 'text') {
  const n = 48, values = [];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    let v = sample(image, (x + .5) * image.width / n, (y + .5) * image.height / n);
    values.push(location === 'column' ? 255 - v : v);
  }
  const sorted = [...values].sort((a, b) => a - b);
  const lo = sorted[Math.floor(n * n * .05)], hi = sorted[Math.floor(n * n * .95)];
  if (hi - lo < 25) return null;
  const threshold = (lo + hi) / 2;
  const mask = Uint8Array.from(values, v => v < threshold ? 1 : 0);
  // The largest connected ink component is the glyph, disk or cube outline, not a comma.
  const seen = new Uint8Array(n * n);
  const components = [];
  let largest = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    const queue = [start]; seen[start] = 1;
    for (let q = 0; q < queue.length; q++) {
      const i = queue[q], x = i % n, y = Math.floor(i / n);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx, yy = y + dy, j = yy * n + xx;
        if (xx >= 0 && yy >= 0 && xx < n && yy < n && mask[j] && !seen[j]) {
          seen[j] = 1; queue.push(j);
        }
      }
    }
    components.push(queue);
    if (queue.length > largest.length) largest = queue;
  }
  if (largest.length < 20) return null;
  const bounds = component => {
    let x0 = n, y0 = n, x1 = 0, y1 = 0;
    for (const i of component) {
      const x = i % n, y = Math.floor(i / n);
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
    return [x0, y0, x1, y1];
  };
  const [lx0, ly0, lx1, ly1] = bounds(largest);
  // Cube frames can have detached corners. Keep nearby strokes, discard distant text/commas.
  const symbol = components.filter(component => {
    if (component.length < Math.max(4, largest.length * .03)) return false;
    const [x0, y0, x1, y1] = bounds(component);
    const dx = Math.max(0, x0 - lx1, lx0 - x1), dy = Math.max(0, y0 - ly1, ly0 - y1);
    return Math.hypot(dx, dy) <= 5;
  }).flat();
  let x0 = n, y0 = n, x1 = 0, y1 = 0;
  for (const i of symbol) {
    const x = i % n, y = Math.floor(i / n);
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  const filled = new Uint8Array(n * n);
  for (const i of symbol) filled[i] = 1;
  // Fill holes only inside the component bbox; do not let a dark paper edge flood the shape.
  const outside = new Uint8Array(n * n), queue = [];
  const push = (x, y) => {
    if (x < x0 || y < y0 || x > x1 || y > y1) return;
    const i = y * n + x;
    if (!filled[i] && !outside[i]) { outside[i] = 1; queue.push(i); }
  };
  for (let x = x0; x <= x1; x++) { push(x, y0); push(x, y1); }
  for (let y = y0; y <= y1; y++) { push(x0, y); push(x1, y); }
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q], x = i % n, y = Math.floor(i / n);
    push(x - 1, y); push(x + 1, y); push(x, y - 1); push(x, y + 1);
  }
  // Count enclosed paper regions: an empty cube outline has three faces, a token disk
  // normally has one glyph-shaped hole. This separates thick-line cubes from pale tokens.
  const holeSeen = new Uint8Array(n * n);
  let holes = 0;
  for (let start = y0 * n + x0; start <= y1 * n + x1; start++) {
    const sx = start % n, sy = Math.floor(start / n);
    if (sx < x0 || sx > x1 || sy < y0 || sy > y1 || filled[start] || outside[start] || holeSeen[start]) continue;
    const queue = [start]; holeSeen[start] = 1;
    for (let q = 0; q < queue.length; q++) {
      const i = queue[q], x = i % n, y = Math.floor(i / n);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx, yy = y + dy, j = yy * n + xx;
        if (xx < x0 || xx > x1 || yy < y0 || yy > y1 || filled[j] || outside[j] || holeSeen[j]) continue;
        holeSeen[j] = 1; queue.push(j);
      }
    }
    if (queue.length >= 6) holes++;
  }
  let corner = 0, cornerCount = 0, area = 0;
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1, r = Math.max(2, Math.round(Math.min(bw, bh) * .14));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const solid = filled[y * n + x] || !outside[y * n + x];
    if (solid) area++;
    if ((x < x0 + r || x > x1 - r) && (y < y0 + r || y > y1 - r)) {
      cornerCount++; if (solid) corner++;
    }
  }
  return { box: [x0 / n * image.width, y0 / n * image.height,
    bw / n * image.width, bh / n * image.height], cornerFill: corner / cornerCount,
    fill: area / (bw * bh), ink: symbol.length / (bw * bh), holes, contrast: hi - lo };
}

/** Preserve aspect ratio and polarity after removing crop margins. */
export function feature(image, location = 'text') {
  const mask = inkMask(image, location);
  if (!mask) return null;
  const [bx, by, bw, bh] = mask.box;
  const values = [], scale = (SIZE - 6) / Math.max(bw, bh);
  const w = bw * scale, h = bh * scale;
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    let value = sample(image, bx + (x + .5 - (SIZE - w) / 2) / scale,
      by + (y + .5 - (SIZE - h) / 2) / scale);
    if (location === 'column') value = 255 - value;
    values.push(value);
  }
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
  if (sd < 8) return null;
  const normalized = values.map(v => (v - mean) / sd);
  const edges = normalized.map((v, i) => {
    const x = i % SIZE, y = Math.floor(i / SIZE);
    return (x && x < SIZE - 1 ? normalized[i + 1] - normalized[i - 1] : 0) +
      (y && y < SIZE - 1 ? normalized[i + SIZE] - normalized[i - SIZE] : 0);
  });
  return { values: normalized, edges, contrast: sd };
}

function correlation(a, b, dx, dy, scale) {
  let sa = 0, sb = 0, saa = 0, sbb = 0, ab = 0, n = 0;
  for (let y = 3; y < SIZE - 3; y++) for (let x = 3; x < SIZE - 3; x++) {
    const xx = (x - 15.5) * scale + 15.5 + dx, yy = (y - 15.5) * scale + 15.5 + dy;
    if (xx < 0 || yy < 0 || xx >= SIZE - 1 || yy >= SIZE - 1) continue;
    const x0 = Math.floor(xx), y0 = Math.floor(yy), fx = xx - x0, fy = yy - y0;
    const i = y0 * SIZE + x0;
    const v = (b[i] * (1 - fx) + b[i + 1] * fx) * (1 - fy) +
      (b[i + SIZE] * (1 - fx) + b[i + SIZE + 1] * fx) * fy;
    const u = a[y * SIZE + x];
    sa += u; sb += v; saa += u * u; sbb += v * v; ab += u * v; n++;
  }
  return (ab - sa * sb / n) / Math.sqrt(Math.max(1e-9, (saa - sa * sa / n) * (sbb - sb * sb / n)));
}

export function similarity(a, b) {
  let best = -1;
  for (const scale of [.9, 1, 1.1]) for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) {
    const pixels = correlation(a.values, b.values, dx, dy, scale);
    const edges = correlation(a.edges, b.edges, dx, dy, scale);
    best = Math.max(best, pixels * .65 + edges * .35);
  }
  return best;
}

/** Carrier is measured independently of the glyph; a disk is not a square face. */
export function carrier(image, location = 'text') {
  const mask = inkMask(image, location);
  if (!mask) return { kind: 'unknown', cornerFill: 0 };
  const kind = location === 'column' ? 'icon' :
    mask.cornerFill > .72 ? 'cube' : mask.cornerFill < .35 && mask.fill > .65 ? (mask.holes >= 2 || mask.ink < .30 ? 'any-cube' : 'token') : 'uncertain';
  return { kind, cornerFill: Number(mask.cornerFill.toFixed(3)), fill: Number(mask.fill.toFixed(3)), ink: Number(mask.ink.toFixed(3)), holes: mask.holes };
}

export function loadReferences(root = ROOT) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, REF_DIR, 'references.json'), 'utf8'));
  const images = new Map();
  return manifest.references.map(ref => {
    const file = path.join(root, REF_DIR, ref.file);
    if (!images.has(file)) images.set(file, readImage(file));
    if (!LABELS.includes(ref.label)) throw new Error(`Unknown reference label: ${ref.label}`);
    return { ...ref, feature: feature(images.get(file), ref.location), carrier: carrier(images.get(file), ref.location) };
  });
}

export function classify(image, location = 'text', references = loadReferences(), options = {}) {
  const minScore = options.minScore ?? .58, minMargin = options.minMargin ?? .025;
  const f = feature(image, location), shape = carrier(image, location);
  if (!f) return { label: '?', reason: 'low-contrast', score: 0, margin: 0, carrier: shape, candidates: [] };
  const scores = LABELS.map(label => {
    const matches = references.filter(r => r.label === label && r.feature).map(r => ({
      id: r.id, faction: r.faction, score: similarity(f, r.feature),
      compatible: shape.kind === 'uncertain' || shape.kind === 'unknown' ||
        (label.endsWith('icon') ? shape.kind === 'icon' : label.endsWith('token') ? shape.kind === 'token' :
          label === 'any cube' ? shape.kind === 'any-cube' || shape.kind === 'uncertain' : shape.kind === 'cube')
    }));
    matches.sort((a, b) => b.score - a.score);
    return { label, score: matches[0]?.score ?? -1, reference: matches[0]?.id,
      compatible: matches[0]?.compatible ?? false, matches };
  }).sort((a, b) => b.score - a.score);
  // Geometry can reject a look-alike, but cannot supply a glyph on its own.
  const eligible = scores.filter(s => s.compatible);
  const best = eligible[0], next = eligible[1];
  const margin = best ? best.score - (next?.score ?? 0) : 0;
  const accepted = best && best.score >= minScore && margin >= minMargin;
  return { label: accepted ? best.label : '?', reason: accepted ? 'matched' : 'needs-review',
    score: Number((best?.score ?? 0).toFixed(4)), margin: Number(margin.toFixed(4)),
    carrier: shape, candidates: scores.slice(0, 3).map(({ matches, ...s }) => s) };
}

export function validateReferences(references) {
  const results = [];
  for (const ref of references) {
    // Hold out the entire source faction, not just an identical neighbouring crop.
    const training = references.filter(r => r.faction !== ref.faction);
    // Reuse the already extracted feature to avoid rereading images.
    const held = { ...ref, id: '__held__' };
    const scores = LABELS.map(label => {
      const matches = training.filter(r => r.label === label && r.feature);
      const score = Math.max(...matches.map(r => similarity(held.feature, r.feature)));
      const compatible = ref.carrier.kind === 'uncertain' || ref.carrier.kind === 'unknown' ||
        (label.endsWith('icon') ? ref.carrier.kind === 'icon' : label.endsWith('token') ? ref.carrier.kind === 'token' :
          label === 'any cube' ? ref.carrier.kind === 'any-cube' || ref.carrier.kind === 'uncertain' : ref.carrier.kind === 'cube');
      return { label, score, compatible };
    }).filter(s => s.compatible).sort((a, b) => b.score - a.score);
    const best = scores[0], margin = best.score - (scores[1]?.score ?? 0);
    results.push({ id: ref.id, faction: ref.faction, expected: ref.label,
      predicted: best.score >= .58 && margin >= .025 ? best.label : '?',
      score: Number(best.score.toFixed(4)), margin: Number(margin.toFixed(4)), carrier: ref.carrier.kind });
  }
  return results;
}

function cli() {
  const [command, ...args] = process.argv.slice(2);
  const option = (name, fallback) => { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; };
  if (command === 'validate') {
    const results = validateReferences(loadReferences());
    console.table(results);
    const wrong = results.filter(r => r.expected !== r.predicted);
    console.log(`${results.length - wrong.length}/${results.length} held-out-faction matches; ${wrong.length} errors/reviews.`);
    process.exitCode = wrong.length ? 1 : 0;
  } else if (command === 'classify') {
    const box = option('--box', '').split(',').map(Number);
    const result = classify(crop(readImage(option('--image', '')), box), option('--location', 'text'));
    console.log(JSON.stringify(result, null, 2));
    if (result.label === '?') process.exitCode = 2;
  } else if (command === 'audit') {
    const manifestPath = option('--manifest', ''), manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const references = loadReferences(), images = new Map(), results = [];
    const output = option('--out', 'build/combat-review/icon-audit');
    fs.mkdirSync(output, { recursive: true });
    for (const card of manifest.cards) {
      const filename = path.resolve(path.dirname(manifestPath), card.image);
      if (!images.has(filename)) images.set(filename, readImage(filename));
      for (const icon of card.icons) {
        const cut = crop(images.get(filename), icon.box);
        const result = classify(cut, icon.location, references);
        const matches = icon.expected === undefined || icon.expected === result.label;
        results.push({ card: card.id, slot: icon.id, expected: icon.expected ?? null, ...result, matches });
        fs.writeFileSync(path.join(output, `${card.id}-${icon.id}.png`), encodePNG(cut));
      }
    }
    const report = { generatedBy: 'tools/combat-icons.mjs', note: 'Expected labels are manual transcription, never classifier input.', results };
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    console.table(results.map(({ candidates, carrier, ...r }) => r));
    const failed = results.filter(r => !r.matches);
    console.log(`${results.length - failed.length}/${results.length} icons match; ${failed.length} need review. Report: ${output}/report.json`);
    process.exitCode = failed.length ? 1 : 0;
  } else {
    console.log(`Combat icon matcher (not OCR)
  node tools/combat-icons.mjs validate
  node tools/combat-icons.mjs classify --image scan.png --box x,y,w,h [--location column|text]
  node tools/combat-icons.mjs audit --manifest docs/forbidden-stars/combat-icons/orks.json --out build/combat-review/orks

Only the five trusted factions are reference sources. Unknown/ambiguous crops return ? and exit 2.
True PNG: Node only. JPEG (including JPEG data named .png): ImageMagick required.
The audit checks manually located symbols; it does not discover symbols or transcribe text.`);
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) cli();
