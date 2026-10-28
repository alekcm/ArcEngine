// tuning.js — the numbers and colours of the board a designer may nudge without touching the
// renderer. Everything here has a default, a range and a label in both languages; the kit's editor
// (editor.bat -> the Nemesis tab) shows them as sliders and writes the result to
// client/tuning.json, which the game and the gallery load at boot.
//
// Why a separate layer: the geometry of the corridor door was fought over for three rounds, and
// every round needed a code change to move a number by ten centimetres — or by a hundred pixels of
// stencil. Now those numbers live in one table, the editor writes them, and the renderer only reads
// them (see doorSpec() — the derived sizes are computed once, in one place, and tested).
//
// The door itself is no longer a bulkhead frame with a roof-like beam: it is two ordinary corridor
// arches (the very same posts, brackets, lintels and lamps as the ribs of the tube) with a flat
// plate of the same steel bridging them, and the number stencilled on that plate. So the numbers in
// this table describe an arch, not a frame: postX/postW/postH/postD are one arch, archGap is the
// distance between the two, beamW/beamH is the lintel — and therefore also the plate.

const HEX = /^#[0-9a-f]{6}$/i;

/** The schema: groups -> items. `key` is the short name inside the group. */
export const SCHEMA = [
    {
        id: 'door', title: { en: 'Corridor door', ru: 'Дверь коридора' },
        items: [
            { key: 'postX', v: 1.2, min: 1.0, max: 2.0, step: 0.05, label: { en: 'Arch: post spacing', ru: 'Арка: разнос стоек' } },
            { key: 'postW', v: 0.24, min: 0.12, max: 0.6, step: 0.02, label: { en: 'Arch: post thickness', ru: 'Арка: толщина стойки' } },
            { key: 'postH', v: 1.6, min: 1.2, max: 2.6, step: 0.05, label: { en: 'Arch: post height', ru: 'Арка: высота стойки' } },
            { key: 'postD', v: 0.32, min: 0.16, max: 0.8, step: 0.02, label: { en: 'Arch: post depth', ru: 'Арка: глубина стойки' } },
            { key: 'archGap', v: 0.99, min: 0.6, max: 3.6, step: 0.05, label: { en: 'Distance between the two arches', ru: 'Расстояние между арками' } },
            { key: 'beamW', v: 2.6, min: 2.4, max: 4.0, step: 0.05, label: { en: 'Lintel and plate width', ru: 'Ширина перекладин и плиты' } },
            { key: 'beamH', v: 0.24, min: 0.12, max: 0.5, step: 0.02, label: { en: 'Lintel and plate height', ru: 'Высота перекладин и плиты' } },
            { key: 'numShare', v: 0.72, min: 0.3, max: 1.0, step: 0.01, label: { en: 'Number: share of the plate width', ru: 'Номер: доля ширины плиты' } },
            { key: 'numFont', v: 248, min: 80, max: 250, step: 2, label: { en: 'Number: font size, px (512×256 canvas)', ru: 'Номер: кегль, px (канва 512×256)' } },
            { key: 'steel', v: '#59697b', label: { en: 'Arch and plate steel', ru: 'Сталь арок и плиты' } },
            { key: 'paint', v: '#56687c', label: { en: 'Number paint (the "?" on the floor)', ru: 'Краска номера (как «?» на полу)' } },
            { key: 'outline', v: '#1b2632', label: { en: 'Number outline', ru: 'Обводка номера' } },
            { key: 'neon', v: '#ddfbff', label: { en: 'Alt neon: digits', ru: 'Неон по Alt: цифры' } },
            { key: 'neonGlow', v: '#3fd0ff', label: { en: 'Alt neon: glow', ru: 'Неон по Alt: свечение' } },
            { key: 'lamp', v: '#ff3a3a', label: { en: 'Doorway emergency lamps', ru: 'Аварийные лампы проёма' } },
        ],
    },
];

const index = new Map();
for (const g of SCHEMA) for (const it of g.items) index.set(g.id + '.' + it.key, Object.assign({ group: g.id }, it));

const isColor = (item) => typeof item.v === 'string';

/** Clamp a number to the item's range; colours are normalised to #rrggbb, junk is rejected. */
export function sanitize(key, value) {
    const item = index.get(key);
    if (!item) return undefined;
    if (isColor(item)) {
        if (typeof value !== 'string') return undefined;
        const h = value.trim().toLowerCase();
        return HEX.test(h) ? h : undefined;
    }
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n)) return undefined;
    return Math.min(item.max, Math.max(item.min, n));
}

/** A plain { 'door.postX': 1.8, ... } of only the known keys — what gets written to tuning.json. */
export function sanitizeAll(src) {
    const out = {};
    if (!src || typeof src !== 'object') return out;
    for (const [k, v] of Object.entries(src)) {
        const s = sanitize(k, v);
        if (s !== undefined) out[k] = s;
    }
    return out;
}

export const DEFAULTS = (() => {
    const d = {};
    for (const [k, it] of index) d[k] = it.v;
    return d;
})();

export const TUNE = {
    values: Object.assign({}, DEFAULTS),
    /** Merge a {key: value} map (tuning.json). Unknown keys and out-of-range values are dropped. */
    load(src) { Object.assign(this.values, sanitizeAll(src)); return this; },
    set(key, value) { const s = sanitize(key, value); if (s !== undefined) this.values[key] = s; return this.values[key]; },
    get(key) { const v = this.values[key]; return v === undefined ? DEFAULTS[key] : v; },
    color(key) { const v = this.get(key); return typeof v === 'string' ? v : DEFAULTS[key]; },
    def(key) { return DEFAULTS[key]; },
    changed() { return Object.keys(DEFAULTS).some(k => this.values[k] !== DEFAULTS[k]); },
    reset() { this.values = Object.assign({}, DEFAULTS); return this; },
    /** Only what differs from the defaults — a short tuning.json. */
    diff() {
        const out = {};
        for (const k of Object.keys(DEFAULTS)) if (this.values[k] !== DEFAULTS[k]) out[k] = this.values[k];
        return out;
    },
    schema() { return SCHEMA; },
};

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/**
 * The door, derived once from the tuning table. Everything the renderer needs, so a slider can
 * never produce panels that do not reach the posts or a stencil wider than the beam it sits on.
 */
export function doorSpec() {
    const n = (k) => TUNE.get('door.' + k);
    // One arch, built exactly like a rib of the corridor.
    const postX = n('postX'), postW = n('postW'), postH = n('postH'), postD = n('postD');
    // ... two of them, `archGap` apart, bridged by a plate of the lintels' own steel. The doorway is
    // deliberately short: the whole object (arch, plate, arch) is one and a third metres deep along
    // the passage, half of the long table it used to be, so it reads as a gateway and not as a bridge.
    const archGap = Math.max(n('archGap'), postD + 0.6);
    const beamW = Math.max(n('beamW'), postX * 2 + postW), beamH = n('beamH');
    // A rib of the corridor puts its lintel 0.10 above the post top (the recipe overlaps the two by
    // 0.02): the door's arches use the very same height, so a doorway is not a different arch.
    const beamY = postH + 0.1;
    // The doorway has no leaves of its own: it is two arches and the plate between them. The
    // opening is simply the span between the posts' inner faces.
    const openW = Math.max(0.8, 2 * (postX - postW / 2));
    // The stencil lies flat on the plate. Its size comes from the plate's WIDTH and from nothing
    // else: shortening the doorway must not shrink the digits. They are painted across the plate,
    // and the paint's own transparent margins may hang over its front and back edge — the glyphs
    // themselves stay on the steel.
    const plateD = Math.max(0.2, archGap - postD);
    const decalW = Math.max(0.4, Math.min(beamW * n('numShare'), beamW - 0.4));
    const decalH = decalW / 2;
    return {
        postX, postW, postH, postD, archGap, beamW, beamH,
        beamY, beamTop: beamY + beamH / 2, plateD,
        openW,
        decalW, decalH, decalY: beamY + beamH / 2 + 0.02,
        numFont: Math.round(n('numFont')),
        // The lamps are fixed to the front of the arch posts, out of the plane the leaves swing in,
        // so their height only has to stay under the post top — not above the leaf.
        lampY: Math.max(0.7, postH - 0.12),
        steel: TUNE.color('door.steel'), paint: TUNE.color('door.paint'), outline: TUNE.color('door.outline'),
        neon: TUNE.color('door.neon'), neonGlow: TUNE.color('door.neonGlow'), lamp: TUNE.color('door.lamp'),
    };
}
