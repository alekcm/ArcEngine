// tuning.js — the numbers and colours of the board a designer may nudge without touching the
// renderer. Everything here has a default, a range and a label in both languages; the kit's editor
// (editor.bat -> the Nemesis tab) shows them as sliders and writes the result to
// client/tuning.json, which the game and the gallery load at boot.
//
// Why a separate layer: the geometry of the corridor door was fought over for three rounds, and
// every round needed a code change to move a number by ten centimetres — or by a hundred pixels of
// stencil. Now those numbers live in one table, the editor writes them, and the renderer only reads
// them (see doorSpec() — the derived sizes are computed once, in one place, and tested).

const HEX = /^#[0-9a-f]{6}$/i;

/** The schema: groups -> items. `key` is the short name inside the group. */
export const SCHEMA = [
    {
        id: 'door', title: { en: 'Corridor door', ru: 'Дверь коридора' },
        items: [
            { key: 'postX', v: 1.7, min: 1.2, max: 3.0, step: 0.05, label: { en: 'Post spacing (half opening + post)', ru: 'Разнос стоек (полпроёма + стойка)' } },
            { key: 'postW', v: 1.2, min: 0.4, max: 2.0, step: 0.05, label: { en: 'Post width', ru: 'Ширина стойки' } },
            { key: 'postH', v: 2.35, min: 1.6, max: 3.4, step: 0.05, label: { en: 'Opening height', ru: 'Высота проёма' } },
            { key: 'postD', v: 1.0, min: 0.3, max: 2.2, step: 0.05, label: { en: 'Post depth', ru: 'Глубина стойки' } },
            { key: 'beamW', v: 5.2, min: 2.6, max: 8.0, step: 0.1, label: { en: 'Beam length', ru: 'Длина балки' } },
            { key: 'beamH', v: 0.5, min: 0.2, max: 1.6, step: 0.05, label: { en: 'Beam height', ru: 'Высота балки' } },
            { key: 'beamD', v: 2.1, min: 0.9, max: 3.4, step: 0.05, label: { en: 'Beam depth (the number is painted here)', ru: 'Глубина балки (сюда ложится номер)' } },
            { key: 'numShare', v: 0.72, min: 0.3, max: 1.0, step: 0.01, label: { en: 'Number: share of the beam length', ru: 'Номер: доля длины балки' } },
            { key: 'numFont', v: 248, min: 80, max: 250, step: 2, label: { en: 'Number: font size, px (512×256 canvas)', ru: 'Номер: кегль, px (канва 512×256)' } },
            { key: 'steel', v: '#8c96a0', label: { en: 'Frame and beam colour', ru: 'Цвет рамы и балки' } },
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
    const postX = n('postX'), postW = n('postW'), postH = n('postH'), postD = n('postD');
    const beamW = Math.max(n('beamW'), postX * 2 + 0.1), beamH = n('beamH'), beamD = n('beamD');
    const openW = Math.max(0.8, 2 * (postX - postW / 2));          // between the posts
    const panelW = openW / 2;                                       // two leaves meet in the middle
    const panelH = Math.min(1.72, Math.max(0.8, postH - 0.4));
    // The stencil lies on the beam's top face: at most as wide as the beam (with a margin) and at
    // most as deep as the beam allows at its 2:1 canvas aspect.
    const numW = clamp(beamW * n('numShare'), 0.8, beamW - 0.4);
    const decalW = Math.min(numW, (beamD - 0.25) * 2);
    const decalH = decalW / 2;
    const slabW = Math.max(postX * 2 + 0.15, beamW + 0.2), slabD = beamD + 0.1;
    return {
        postX, postW, postH, postD, beamW, beamH, beamD,
        beamY: postH + beamH / 2, beamTop: postH + beamH,
        openW, panelW, panelH, panelClosed: panelW / 2,
        // open leaves sit inside the posts when they can, and always clear the doorway
        panelOpen: Math.max(postX, openW * 0.75),
        slabW, slabD, stepW: slabW + 0.4, stepD: slabD + 0.4,
        decalW, decalH, decalY: postH + beamH + 0.02,
        numFont: Math.round(n('numFont')),
        lampY: Math.max(1.2, postH - 0.27),
        steel: TUNE.color('door.steel'), paint: TUNE.color('door.paint'), outline: TUNE.color('door.outline'),
        neon: TUNE.color('door.neon'), neonGlow: TUNE.color('door.neonGlow'), lamp: TUNE.color('door.lamp'),
    };
}
