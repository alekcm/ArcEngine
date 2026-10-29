// ============================================================================
//  ArcEngine — the editor writing game files: Constants.js patch, the whole
//  Objects.js, backups. No HTTP: server.mjs calls these functions, and so does tests/.
// ----------------------------------------------------------------------------
//  The Constants.js patch is deliberately dumb and safe:
//   - ONLY lines of the form `const NAME = <number>;` are changed (a formula is left
//     alone — rejection); a 0xRRGGBB color stays a hex literal;
//   - before every write — a backup in _utils/.backups/ (the last 20 are kept).
//  Objects.js is written WHOLE from a validated list (the backup goes there too).
//  nemesis/client/tuning.json — the board numbers of the Nemesis tab: every key goes through
//  the tuning schema (nemesis/client/tuning.js), so a junk request cannot reach the file.
//  nemesis/client/board-edits.json — the parts a designer moved, turned, recoloured, hid or
//  deleted on the board; the game applies them while building (see scene3d.js).
// ============================================================================
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { sanitizeAll } from '../../nemesis/client/tuning.js';

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const NUMBER = /^-?\d+(?:\.\d+)?$/;
const HEX = /^0[xX][0-9a-fA-F]+$/;
const BACKUP_KEEP = 20;

// Rejections: code is translated by the client (err.<code> in i18n.js), error — for the log and
// clients without a translation.
export const ERRORS = {
  not_found: 'constant not found in Constants.js',
  not_literal: 'the value in the file is not a number literal (a formula?) — unsafe to patch',
  bad_value: 'the new value is not a number',
  bad_name: 'invalid name',
  bad_objects: 'the object list is not an array',
  bad_model: 'model path must be assets/….fbx or .glb (ASCII, no spaces)',
  not_model: 'not an .fbx or .glb file',
  not_binary: 'ASCII FBX is not supported — export a binary FBX',
  not_glb: 'not a binary glTF — export .glb',
  bad_ui: 'the UI layout is not an array',
  bad_tuning: 'the tuning values are not an object',
  bad_board: 'the board edits are not an object',
  bad_board_file: 'the saved board edits could not be read safely',
  bad_element: 'invalid UI element',
  too_large: 'the file is too large',
  dialog_failed: 'the file dialog failed to open',
  unsupported: 'no system file dialog on this OS',
};
export const failure = (code, extra) => Object.assign({ ok: false, code, error: ERRORS[code] }, extra);
const rejected = (name, code) => ({ name, ok: false, code, error: ERRORS[code] });

// Model path: an .fbx or .glb inside assets/, ASCII with no spaces and no . / .. in the segments.
const MODEL_PATH = /^assets\/(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+\.(?:fbx|glb)$/i;
export const isModelPath = p => MODEL_PATH.test(p) && !p.split('/').some(s => s === '.' || s === '..');
// Sound path: the same rules, a .wav, .mp3 or .ogg.
const SOUND_PATH = /^assets[/](?:[A-Za-z0-9_.-]+[/])*[A-Za-z0-9_.-]+[.](?:wav|mp3|ogg)$/i;
export const isSoundPath = p => SOUND_PATH.test(p) && !p.split('/').some(s => s === '.' || s === '..');

// --- Backups -----------------------------------------------------------------

// A copy of the file in <root>/_utils/.backups/<prefix>-<time>.js; the last 20 per prefix are kept.
async function backupFile(root, file, prefix, ext = '.js') {
  const dir = path.join(root, '_utils', '.backups');
  await fsp.mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
  let dest = path.join(dir, prefix + '-' + stamp + ext);
  // Two saves within the same second (the Nemesis tab counts milliseconds) must not eat each other.
  for (let n = 2; fs.existsSync(dest); n++) dest = path.join(dir, prefix + '-' + stamp + '-' + n + ext);
  await fsp.copyFile(file, dest);
  const files = (await fsp.readdir(dir)).filter(f => f.startsWith(prefix + '-')).sort();
  for (const f of files.slice(0, Math.max(0, files.length - BACKUP_KEEP))) {
    await fsp.unlink(path.join(dir, f)).catch(() => {});
  }
  return path.relative(root, dest).split(path.sep).join('/');
}

// --- Constants.js --------------------------------------------------------------

// Numbers are written without exponents and junk float tails (0.65000000000004 -> 0.65).
function fmtNumber(v) {
  const n = Number(v);
  if (!isFinite(n)) return null;
  return Number.isInteger(n) ? String(n) : String(parseFloat(n.toFixed(6)));
}

// `const NAME = <number>;` -> the new number: { src } or { code }. Formulas and non-numbers are left alone.
export function patchScalar(src, name, value) {
  const re = new RegExp('^(const\\s+' + name + '\\s*=\\s*)([^;\\n]+?)(\\s*;)', 'm');
  const m = re.exec(src);
  if (!m) return { code: 'not_found' };
  const was = m[2].trim();
  if (!NUMBER.test(was) && !HEX.test(was)) return { code: 'not_literal' };
  // The literal format is kept: a color went out as 0x1e6c80 — it comes back as 0x1e6c80.
  const num = HEX.test(was)
    ? ((Number(value) >= 0 && Number.isFinite(Number(value)))
        ? '0x' + (Number(value) >>> 0).toString(16).padStart(6, '0') : null)
    : fmtNumber(value);
  if (num === null) return { code: 'bad_value' };
  return { src: src.slice(0, m.index) + m[1] + num + m[3] + src.slice(m.index + m[0].length) };
}

// changes: [{ name: 'CAMERA_FOV_DEG', value: 52 }] -> a patch of <root>/js/Constants.js.
export async function saveConstants(root, changes) {
  if (!Array.isArray(changes) || changes.length === 0) {
    return { ok: false, error: 'empty change list' };
  }
  const file = path.join(root, 'js', 'Constants.js');
  // The BOM (if any) is stripped for the duration of the patch and put back on write.
  const raw = await fsp.readFile(file, 'utf8');
  const hadBom = raw.charCodeAt(0) === 0xFEFF;
  let src = hadBom ? raw.slice(1) : raw;

  const results = [];
  let patched = 0;
  for (const ch of changes) {
    const name = String(ch && ch.name || '');
    if (!IDENT.test(name)) {
      results.push(rejected(name, 'bad_name'));
      continue;
    }
    const r = patchScalar(src, name, ch.value);
    if (r.code) {
      results.push(rejected(name, r.code));
    } else {
      src = r.src;
      patched++;
      results.push({ name, ok: true });
    }
  }

  let backup = null;
  if (patched > 0) {
    backup = await backupFile(root, file, 'Constants');
    await fsp.writeFile(file, hadBom ? '﻿' + src : src, 'utf8');
  }
  return { ok: results.every(r => r.ok), patched, results, backup };
}

// --- Objects.js ------------------------------------------------------------------

// The model path in the header — without quotes: the builder's asset scanner treats any
// quoted literal as a reference, even in a comment.
export const OBJECTS_HEADER = `// Objects.js — location objects: models placed in the editor (Objects tab).
// The editor rewrites the whole file (POST /api/save-objects) — keep the format.
// Model path — a string literal starting from assets/: the builder archives only assets referenced this way.
//   model — .fbx (Model3D.js) or .glb (Gltf3D.js: skeleton, clips, textures);
//   kind — 'prop' (environment) | 'actor' (main object of the frame);
//   x, y — map px; h — px above the ground; rot — [x, y, z] degrees: y — heading (0 — along +x,
//   90 — down the map), x and z — tilt; scale — [x, y, z] relative to model size (1 cm in the file = 1 px);
//   anim — spin of a model part (optional): part — an object inside the FBX (spins around
//   its origin from Blender), axis — its axis 'x' | 'y' | 'z' (with a minus — the opposite end),
//   speed — rpm, dir — 'cw' | 'ccw': clockwise/counterclockwise as seen from the end of the axis;
//   clip — looped animation clip of a .glb model (optional): 'idle', 'run'…
//   tag — a group name for game code (optional): location.findByTag(tag);
//   hidden: true — placed but not in the scene until the game calls location.setHidden(rec, false);
//   sound — a sound standing at the object (optional, Sound3D.js): src — a file from assets/sounds,
//   volume 0..1, loop: false — once instead of looped, falloffMin — px of full volume around the
//   object, falloffMax — px, silent from there on (0 or absent — the common AUDIO_FALLOFF_*).
`;

// A number with fixed precision and no float tails; not a number — null.
function fmtFixed(v, digits) {
  const n = Number(v);
  return Number.isFinite(n) ? String(parseFloat(n.toFixed(digits))) : null;
}

// A triple [x, y, z] with digits precision; a number — an old record (rot — heading, scale —
// uniform) is expanded by asNumber. Non-numbers or non-positive (positive) — null.
function fmtTriple(v, digits, asNumber, positive) {
  const t = Array.isArray(v) ? v : (v == null ? null : asNumber(v));
  if (!t || t.length !== 3) return null;
  const out = t.map(n => fmtFixed(n, digits));
  if (out.includes(null) || (positive && out.some(n => !(Number(n) > 0)))) return null;
  return '[' + out.join(', ') + ']';
}

// The name of an object or a model part — inside the file's single quotes: no quotes, backslashes
// or control characters, up to 64 characters.
const cleanName = v => String(v == null ? '' : v).replace(/[\x00-\x1f\\'"`]/g, '').trim().slice(0, 64);
const ANIM_AXES = ['x', '-x', 'y', '-y', 'z', '-z'];

// anim: { part, axis, speed, dir } -> the record tail `, anim: { … }`; no animation — '', invalid — null.
function fmtAnim(a) {
  if (a == null) return '';
  const part = cleanName(a.part), speed = fmtFixed(a.speed, 1);
  if (!part || !ANIM_AXES.includes(a.axis) || speed === null || Number(speed) < 0) return null;
  return `, anim: { part: '${part}', axis: '${a.axis}', speed: ${speed}, dir: '${a.dir === 'ccw' ? 'ccw' : 'cw'}' }`;
}

// clip: a clip name -> the record tail `, clip: '…'`; none — ''.
function fmtClip(v) {
  const clip = cleanName(v);
  return clip ? `, clip: '${clip}'` : '';
}

// tag: a group name -> the record tail `, tag: '…'`; none — ''.
function fmtTag(v) {
  const tag = cleanName(v);
  return tag ? `, tag: '${tag}'` : '';
}

// sound: { src, volume?, loop?, falloffMin?, falloffMax? } -> the record tail `, sound: { … }`;
// no sound — '', invalid — null. Defaults (volume 1, looped, the common radii) are not written.
function fmtSound(s) {
  if (s == null) return '';
  if (typeof s !== 'object' || !isSoundPath(String(s.src || ''))) return null;
  const parts = [`src: '${s.src}'`];
  if (s.volume != null) {
    const volume = fmtFixed(s.volume, 2);
    if (volume === null || Number(volume) < 0 || Number(volume) > 1) return null;
    if (Number(volume) !== 1) parts.push(`volume: ${volume}`);
  }
  if (s.loop === false) parts.push('loop: false');
  for (const key of ['falloffMin', 'falloffMax']) {
    if (s[key] == null) continue;
    const px = fmtFixed(s[key], 0);
    if (px === null || Number(px) < 0) return null;
    if (Number(px) > 0) parts.push(`${key}: ${px}`);
  }
  return `, sound: { ${parts.join(', ')} }`;
}

// objects: [{ name, model, kind, x, y, h, rot: [x, y, z], scale: [x, y, z], anim?, clip?, tag?, hidden?, sound? }] ->
// { ok, src, count } or a rejection (index — the number of the invalid record).
export function formatObjects(objects) {
  if (!Array.isArray(objects)) return failure('bad_objects');
  const lines = [];
  for (let i = 0; i < objects.length; i++) {
    const o = objects[i] || {};
    const model = String(o.model || '');
    if (!isModelPath(model)) return failure('bad_model', { index: i });
    const n = {
      x: fmtFixed(o.x, 1), y: fmtFixed(o.y, 1), h: fmtFixed(o.h, 1),
      rot: fmtTriple(o.rot, 1, r => [0, r, 0], false),
      scale: fmtTriple(o.scale, 3, s => [s, s, s], true),
      anim: fmtAnim(o.anim),
      sound: fmtSound(o.sound),
    };
    if (Object.values(n).includes(null)) return failure('bad_value', { index: i });
    const kind = o.kind === 'actor' ? 'actor' : 'prop';
    lines.push(`    { name: '${cleanName(o.name)}', model: '${model}', kind: '${kind}', x: ${n.x}, y: ${n.y}, h: ${n.h}, rot: ${n.rot}, scale: ${n.scale}${n.anim}${fmtClip(o.clip)}${fmtTag(o.tag)}${o.hidden ? ', hidden: true' : ''}${n.sound} },\n`);
  }
  return { ok: true, src: OBJECTS_HEADER + 'const LOCATION_OBJECTS = [\n' + lines.join('') + '];\n', count: lines.length };
}

// Object list -> the whole <root>/js/Objects.js (an invalid list leaves the file untouched).
export async function saveObjects(root, objects) {
  const r = formatObjects(objects);
  if (!r.ok) return r;
  const file = path.join(root, 'js', 'Objects.js');
  const backup = fs.existsSync(file) ? await backupFile(root, file, 'Objects') : null;
  await fsp.writeFile(file, r.src, 'utf8');
  return { ok: true, count: r.count, backup };
}

// --- UILayout.js -----------------------------------------------------------------

export const UI_HEADER = `// UILayout.js — the game's UI layout: every HUD element, placed and styled in the editor (UI tab).
// The editor rewrites the whole file (POST /api/save-ui) — keep the format. Drawn by js/UI.js;
// game code takes an element by id: UI.get('score').setText('10') — and never positions HUD itself.
//   kind — 'text' | 'panel' | 'bar' | 'button'; anchor — one of 9 screen points ('top-left' …
//   'bottom-right'): x, y go from it to the same point of the element (inward from an edge,
//   signed from the center); w, h — px; numbers are px of a screen UI_REF_HEIGHT tall;
//   parent (optional) — id of the element this one sits in: anchor, x, y then count from the
//   parent's box, the parent clips it and hides it together with itself;
//   stretch (optional) — 'h' | 'v' | 'both': fills the container on that axis, x (y) — the inset
//   from both edges, w (h) is ignored;
//   colors — '#rrggbb', '' — none; visible: 0 — hidden until the game calls show().
//   Records go in drawing order: later — on top.
`;

const UI_ANCHORS = ['top-left', 'top-center', 'top-right', 'middle-left', 'middle-center', 'middle-right',
  'bottom-left', 'bottom-center', 'bottom-right'];
const UI_ID = /^[A-Za-z_][A-Za-z0-9_-]{0,47}$/;
const UI_COLOR = /^#[0-9a-fA-F]{6}$/;

// Fields of a record by kind, in file order — the same set as UI.DEFAULTS in js/UI.js
// (tests/ui.test.mjs compares them). type: px — a number, size — a number ≥ 0, unit — 0..1,
// color — '#rrggbb' or '', text — a string, flag — 0 | 1, id — an element id, stretch — an axis.
// An empty parent or stretch is not written: the screen and a fixed size are the defaults.
const UI_TYPES = {
  x: 'px', y: 'px', w: 'size', h: 'size', radius: 'size', fontSize: 'size', value: 'unit', alpha: 'unit',
  color: 'color', fill: 'color', border: 'color', shadow: 'color', text: 'text', visible: 'flag',
  parent: 'id', stretch: 'stretch',
};
const UI_OPTIONAL = ['parent', 'stretch'];
const UI_STRETCH = ['h', 'v', 'both'];
export const UI_FIELDS = {
  text: ['parent', 'x', 'y', 'text', 'fontSize', 'color', 'shadow', 'alpha', 'visible'],
  panel: ['parent', 'x', 'y', 'w', 'h', 'stretch', 'fill', 'border', 'radius', 'alpha', 'visible'],
  bar: ['parent', 'x', 'y', 'w', 'h', 'stretch', 'value', 'color', 'fill', 'border', 'radius', 'alpha', 'visible'],
  button: ['parent', 'x', 'y', 'w', 'h', 'stretch', 'text', 'fontSize', 'color', 'fill', 'border', 'radius', 'alpha', 'visible'],
};

// A field value -> its literal in the file; invalid — null.
function fmtUIField(type, v) {
  if (type === 'id') return UI_ID.test(String(v)) ? `'${v}'` : null;
  if (type === 'stretch') return UI_STRETCH.includes(v) ? `'${v}'` : null;
  if (type === 'text') return JSON.stringify(String(v == null ? '' : v).replace(/[\x00-\x09\x0b-\x1f]/g, '').slice(0, 200));
  if (type === 'color') return v === '' || v == null ? "''" : (UI_COLOR.test(v) ? `'${String(v).toLowerCase()}'` : null);
  if (type === 'flag') return v === 0 || v === false ? '0' : '1';
  const n = fmtFixed(v, type === 'unit' ? 2 : 1);
  if (n === null) return null;
  if (type === 'size' && Number(n) < 0) return null;
  if (type === 'unit' && (Number(n) < 0 || Number(n) > 1)) return null;
  return n;
}

// elements: [{ id, kind, anchor, … }] -> { ok, src, count } or a rejection (index — the number
// of the invalid record). Ids are unique: game code finds an element by its id.
export function formatUI(elements) {
  if (!Array.isArray(elements)) return failure('bad_ui');
  const lines = [], ids = new Set();
  for (let i = 0; i < elements.length; i++) {
    const e = elements[i] || {}, fields = UI_FIELDS[e.kind];
    if (!fields || !UI_ID.test(String(e.id)) || ids.has(e.id) || !UI_ANCHORS.includes(e.anchor)) return failure('bad_element', { index: i });
    ids.add(e.id);
    const parts = [`id: '${e.id}'`, `kind: '${e.kind}'`, `anchor: '${e.anchor}'`];
    for (const f of fields) {
      if (UI_OPTIONAL.includes(f) && (e[f] == null || e[f] === '')) continue;
      const lit = fmtUIField(UI_TYPES[f], e[f]);
      if (lit === null) return failure('bad_element', { index: i, field: f });
      parts.push(`${f}: ${lit}`);
    }
    lines.push(`    { ${parts.join(', ')} },\n`);
  }
  // A parent is another element of the list, and the chain up from it never comes back.
  const parentOf = new Map(elements.map(e => [e.id, e.parent || '']));
  for (let i = 0; i < elements.length; i++) {
    const seen = new Set([elements[i].id]);
    for (let id = elements[i].parent; id; id = parentOf.get(id)) {
      if (!parentOf.has(id) || seen.has(id)) return failure('bad_element', { index: i, field: 'parent' });
      seen.add(id);
    }
  }
  return { ok: true, src: UI_HEADER + 'const UI_LAYOUT = [\n' + lines.join('') + '];\n', count: lines.length };
}

// Element list -> the whole <root>/js/UILayout.js (an invalid list leaves the file untouched).
export async function saveUI(root, elements) {
  const r = formatUI(elements);
  if (!r.ok) return r;
  const file = path.join(root, 'js', 'UILayout.js');
  const backup = fs.existsSync(file) ? await backupFile(root, file, 'UILayout') : null;
  await fsp.writeFile(file, r.src, 'utf8');
  return { ok: true, count: r.count, backup };
}

// --- nemesis/client/tuning.json --------------------------------------------------

/** The file the editor's Nemesis tab writes and the game reads at boot. */
export const TUNING_REL = 'nemesis/client/tuning.json';

/**
 * Write the board tuning: `{ 'door.beamW': 5.8, ... }`. Values are filtered by the schema shared
 * with the client (unknown keys dropped, numbers clamped, colours normalised), only what differs
 * from the table in tuning.js is kept, and the previous file is backed up next to Objects/Constants.
 */
export async function saveTuning(root, values) {
  if (!values || typeof values !== 'object' || Array.isArray(values)) return failure('bad_tuning');
  const clean = sanitizeAll(values);
  const file = path.join(root, TUNING_REL);
  const backup = fs.existsSync(file) ? await backupFile(root, file, 'tuning', '.json').catch(() => null) : null;
  const sorted = {};
  for (const k of Object.keys(clean).sort()) sorted[k] = clean[k];
  const text = JSON.stringify({ values: sorted }, null, 2) + '\n';
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, text, 'utf8');
  return { ok: true, saved: Object.keys(sorted).length, backup };
}

// --- nemesis/client/board-edits.json ---------------------------------------------

/** The parts of the board a designer changed, keyed by their stable editor id. */
export const BOARD_REL = 'nemesis/client/board-edits.json';
// A Windows checkout may have checked the same client directory in as "Nemesis/". On Windows
// both spellings address one file; on Linux they are distinct, so try both without creating a
// second, empty copy that would hide the designer's existing edits.
export const BOARD_CASE_FALLBACK_REL = 'Nemesis/client/board-edits.json';
const BOARD_RELS = [BOARD_REL, BOARD_CASE_FALLBACK_REL];
const EDIT_ID = /^[A-Za-z0-9_:.#~-]{1,80}$/;
const COLOR = /^#[0-9a-f]{6}$/i;

const vec3 = (v) => (Array.isArray(v) && v.length === 3 && v.every(n => Number.isFinite(n) && Math.abs(n) <= 1000)
  ? v.map(n => Math.round(n * 1000) / 1000) : undefined);

/**
 * A per-part edit, filtered: only the known fields survive, numbers are finite and sane, a colour
 * is a hex. An edit that ends up empty is dropped — the part is simply as the code builds it.
 */
export function sanitizeEdit(src) {
  if (!src || typeof src !== 'object' || Array.isArray(src)) return undefined;
  const out = {};
  const pos = vec3(src.pos); if (pos) out.pos = pos;
  const rot = vec3(src.rot); if (rot) out.rot = rot;
  const scale = vec3(src.scale); if (scale) out.scale = scale;
  if (typeof src.color === 'string' && COLOR.test(src.color.trim())) out.color = src.color.trim().toLowerCase();
  if (Number.isFinite(src.glow) && src.glow > 0) out.glow = Math.min(3, src.glow);
  if (src.hidden === true) out.hidden = true;
  if (src.deleted === true) out.deleted = true;
  return Object.keys(out).length ? out : undefined;
}

/** The whole edit map: ids outside the shape and empty edits are dropped. */
export function sanitizeEdits(src) {
  const out = {};
  if (!src || typeof src !== 'object' || Array.isArray(src)) return out;
  for (const [id, value] of Object.entries(src)) {
    if (!EDIT_ID.test(id)) continue;
    const e = sanitizeEdit(value);
    if (e) out[id] = e;
  }
  return out;
}

/** Existing board-edits files in preferred-path order, deduplicated when the filesystem is case-insensitive. */
function existingBoardFiles(root) {
  const seen = new Set();
  const files = [];
  for (const rel of BOARD_RELS) {
    const file = path.join(root, rel);
    let st;
    try { st = fs.statSync(file); } catch { continue; }
    if (!st.isFile()) continue;
    let key = file;
    try { key = fs.realpathSync.native(file); } catch { /* keep the resolved spelling */ }
    if (process.platform === 'win32') key = key.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    files.push(file);
  }
  return files;
}

function readBoardEntries(file) {
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)
      || !parsed.edits || typeof parsed.edits !== 'object' || Array.isArray(parsed.edits)) {
    throw new Error(file + ' does not contain an edits object');
  }
  return parsed.edits;
}

/**
 * Read edits from either spelling of the client's path. If both independent files exist, merge
 * them; the lowercase project path wins for duplicate ids. A malformed existing file throws rather
 * than looking like an empty board, so the editor cannot silently overwrite it.
 */
export function loadBoard(root) {
  const out = {};
  for (const file of existingBoardFiles(root).reverse()) {
    Object.assign(out, sanitizeEdits(readBoardEntries(file)));
  }
  return out;
}

function savedBoardCount(root) {
  const ids = new Set();
  for (const file of existingBoardFiles(root)) {
    for (const id of Object.keys(readBoardEntries(file))) ids.add(id);
  }
  return ids.size;
}

/** How many edits a file on disk holds (0 when it is missing or unreadable). */
export function boardCount(file) {
  try {
    const json = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Object.keys((json && json.edits) || {}).length;
  } catch {
    return 0;
  }
}

/**
 * Write the board edits; the previous file goes to _utils/.backups/board-*.json.
 *
 * An empty set is a legitimate thing to save ("the board is as the code builds it"), but it is also
 * what a panel writes when it never managed to load the file — and that silently threw away a
 * session's work once. So an empty set over a non-empty file is refused unless the caller says it
 * means it (`force`, which the UI only sends after an explicit confirmation).
 */
export async function saveBoard(root, edits, opts) {
  if (!edits || typeof edits !== 'object' || Array.isArray(edits)) return failure('bad_board');
  const force = !!(opts && opts.force);
  const clean = sanitizeEdits(edits);
  let onDisk;
  try { onDisk = savedBoardCount(root); }
  catch (e) { return failure('bad_board_file', { detail: e.message }); }
  if (!force && !Object.keys(clean).length && onDisk > 0) {
    return { ok: false, code: 'would_wipe', onDisk, error: 'refusing to replace ' + onDisk + ' saved edit(s) with an empty set (force to mean it)' };
  }
  const existing = existingBoardFiles(root);
  // Keep using the existing case variant on a case-sensitive filesystem. If both independent copies
  // exist, update both so the game's first successful URL cannot read stale edits.
  const files = existing.length ? existing : [path.join(root, BOARD_REL)];
  let backup = null;
  for (const file of files) {
    if (fs.existsSync(file)) {
      const savedBackup = await backupFile(root, file, 'board', '.json').catch(() => null);
      if (!backup) backup = savedBackup;
    }
  }
  const sorted = {};
  for (const id of Object.keys(clean).sort()) sorted[id] = clean[id];
  const text = JSON.stringify({ edits: sorted }, null, 2) + '\n';
  for (const file of files) {
    await fsp.mkdir(path.dirname(file), { recursive: true });
    await fsp.writeFile(file, text, 'utf8');
  }
  return { ok: true, saved: Object.keys(sorted).length, backup,
    file: path.relative(root, files[0]).split(path.sep).join('/') };
}
