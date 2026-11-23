// icons.mjs — the game's own icons, drawn in code.
//
// Every symbol on the table (bag tokens, room flags, card badges, HUD chips, journal lines) used to
// ride on an emoji: the operating system picked the font, so the same card looked different on
// Windows, macOS and Linux, and several glyphs came out in colour next to the flat HUD. This module
// replaces them with a small hand-drawn set: one 24×24 grid, one stroke weight, rounded joins, and
// `currentColor` so an icon always matches the text around it. Colour is used only where it carries
// meaning (green/purple spores, red/purple germinators, fire).
//
// Two ways in:
//   * `ic('fire')` — markup for new code and templates;
//   * `iconize(text)` / `iconizeDom(root)` — swap the legacy emoji already stored in shared data,
//     journals and card texts, so the rules layer does not have to know about presentation.
const svg = body => '<svg class="gi" viewBox="0 0 24 24" aria-hidden="true">' + body + '</svg>';
const C = (x, y, r, extra = '') => '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" ' + extra + '/>';
const P = d => '<path d="' + d + '"/>';
const L = (x1, y1, x2, y2) => '<path d="M' + x1 + ' ' + y1 + 'L' + x2 + ' ' + y2 + '"/>';

const GLYPHS = {
    // --- living things ---------------------------------------------------------
    dna: svg(P('M8 3c0 5 8 5 8 9s-8 4-8 9') + P('M16 3c0 5-8 5-8 9s8 4 8 9') + L(9, 7, 15, 7) + L(10, 12, 14, 12) + L(9, 17, 15, 17)),
    dog: svg(P('M5 10c0-3 2-5 5-5h4c3 0 5 2 5 5v4c0 3-2 5-5 5h-4c-3 0-5-2-5-5z') + P('M5 10L2 7v5') + P('M19 10l3-3v5') + C(10, 11, 1) + C(14, 11, 1) + P('M12 15v2') + P('M11 17h2')),
    alien: svg(P('M4 13c0-5 3.6-9 8-9s8 4 8 9c0 4-3 7-8 7s-8-3-8-7z') + C(9, 12, 1.6) + C(15, 12, 1.6) + P('M9 17c1 1 5 1 6 0')),
    bug: svg(C(12, 14, 4) + P('M12 10V5') + P('M8 12l-4-2') + P('M16 12l4-2') + P('M8 16l-4 2') + P('M16 16l4 2') + P('M10 5l2-2 2 2')),
    worm: svg(P('M3 15c3 0 3-5 6-5s3 5 6 5 3-4 6-4') + C(20, 10, 1.2)),
    scorpion: svg(P('M8 8l-3-4') + P('M16 8l3-4') + P('M12 8v6') + P('M8 10c-3 2-3 6 0 8') + P('M16 10c3 2 3 6 0 8') + P('M9 18l-2 3') + P('M15 18l2 3') + C(12, 7, 2)),
    mushroom: svg(P('M4 12a8 8 0 0 1 16 0z') + P('M10 12v6a2 2 0 0 0 4 0v-6')),
    brain: svg(P('M9 5a3 3 0 0 0-3 3 3 3 0 0 0-1 5 3 3 0 0 0 2 5h2V5z') + P('M15 5a3 3 0 0 1 3 3 3 3 0 0 1 1 5 3 3 0 0 1-2 5h-2V5z') + P('M12 5v14')),
    eye: svg(P('M2 12s4-6 10-6 10 6 10 6-4 6-10 6-10-6-10-6z') + C(12, 12, 2.6)),
    tooth: svg(P('M7 4c2 0 3 1 5 1s3-1 5-1c2 0 3 2 3 5 0 5-2 5-2 9 0 2-2 2-2 0 0-3-1-5-2-5s-2 2-2 5c0 2-2 2-2 0 0-4-2-4-2-9 0-3 1-5 1-5z')),
    meat: svg(P('M6 14a6 6 0 1 1 9-9 6 6 0 0 1-9 9z') + P('M9 11l-4 4-2-2 4-4') + C(13, 8, 1.4)),
    person: svg(C(12, 7, 3) + P('M6 21c0-4 3-6 6-6s6 2 6 6')),
    robot: svg('<rect x="5" y="7" width="14" height="11" rx="3"/>' + C(10, 12, 1) + C(14, 12, 1) + L(12, 7, 12, 4) + C(12, 3, 1) + P('M9 16h6')),

    // --- tokens and creatures' traces -----------------------------------------
    egg: svg(P('M12 3c4 0 6 6 6 10a6 6 0 0 1-12 0c0-4 2-10 6-10z')),
    skull: svg(P('M5 11a7 7 0 1 1 14 0v3l-2 2v3h-3v-2h-4v2H7v-3l-2-2z') + C(9, 11, 1.4) + C(15, 11, 1.4) + P('M12 14v2')),
    crown: svg(P('M4 8l3 3 5-6 5 6 3-3-2 11H6z')),
    shield: svg(P('M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z')),
    heart: svg(P('M12 20s-7-4-7-9a4 4 0 0 1 7-2 4 4 0 0 1 7 2c0 5-7 9-7 9z')),
    moon: svg(P('M15 3a9 9 0 1 0 6 14A7 7 0 0 1 15 3z')),
    blood: svg(P('M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z')),
    bandage: svg('<rect x="3" y="9" width="18" height="6" rx="3" transform="rotate(-30 12 12)"/>' + C(11, 12, 1) + C(13, 12, 1) + C(12, 11, 1) + C(12, 13, 1)),
    tissue: svg(P('M5 10a7 7 0 0 1 14 0v3a7 7 0 0 1-14 0z') + C(9, 10, 1) + C(14, 11, 1.3) + C(12, 15, 1)),

    // --- play pieces ----------------------------------------------------------
    die: svg('<rect x="4" y="4" width="16" height="16" rx="4"/>' + C(9, 9, 1.3) + C(15, 15, 1.3) + C(15, 9, 1.3) + C(9, 15, 1.3) + C(12, 12, 1.3)),
    cardBack: svg('<rect x="4" y="3" width="13" height="18" rx="2"/>' + P('M4 7h13') + P('M7 12h7') + P('M7 16h7')),
    cardJoker: svg('<rect x="5" y="3" width="14" height="18" rx="2"/>' + P('M12 7l2 3-2 3-2-3z') + P('M12 13v4')),
    scroll: svg(P('M6 4h11a2 2 0 0 1 0 4H6z') + P('M6 8v10a2 2 0 0 0 2 2h11a2 2 0 0 1 0-4H8') + L(9, 12, 15, 12)),
    backpack: svg(P('M7 8a5 5 0 0 1 10 0v11a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2z') + P('M9 8V6a3 3 0 0 1 6 0v2') + L(9, 14, 15, 14)),
    box: svg(P('M3 8l9-4 9 4-9 4z') + P('M3 8v8l9 4 9-4V8') + L(12, 12, 12, 20)),
    suitcase: svg('<rect x="3" y="7" width="18" height="13" rx="2"/>' + P('M9 7V5h6v2') + L(12, 7, 12, 20)),
    lock: svg('<rect x="5" y="10" width="14" height="10" rx="2"/>' + P('M8 10V7a4 4 0 0 1 8 0v3') + C(12, 15, 1.4)),
    unlock: svg('<rect x="5" y="10" width="14" height="10" rx="2"/>' + P('M8 10V7a4 4 0 0 1 7-2') + C(12, 15, 1.4)),
    door: svg('<rect x="6" y="3" width="12" height="18" rx="1"/>' + C(15, 12, 1)),
    pin: svg(P('M12 21s-6-6-6-11a6 6 0 0 1 12 0c0 5-6 11-6 11z') + C(12, 10, 2)),
    magnet: svg(P('M6 4v8a6 6 0 0 0 12 0V4') + L(6, 8, 10, 8) + L(14, 8, 18, 8)),
    bolt: svg(P('M13 3L5 14h6l-1 7 9-12h-6z')),
    flame: svg(P('M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-3 2-4 3-6 0 2 2 2 2 0 0-1 0-3 0-4z')),
    snow: svg(L(12, 3, 12, 21) + L(4, 7, 20, 17) + L(20, 7, 4, 17) + P('M10 4l2 2 2-2') + P('M10 20l2-2 2 2')),
    burst: svg(P('M12 3l2 5 5-3-3 5 5 2-5 2 3 5-5-3-2 5-2-5-5 3 3-5-5-2 5-2-3-5 5 3z')),
    radioactive: svg(C(12, 12, 2) + P('M12 3a9 9 0 0 1 4 1l-2 4a4 4 0 0 0-4 0L8 4a9 9 0 0 1 4-1z') + P('M4 19a9 9 0 0 1-2-8l5 1a4 4 0 0 0 2 4z') + P('M20 19a9 9 0 0 0 2-8l-5 1a4 4 0 0 1-2 4z')),
    biohazard: svg(C(12, 12, 3) + P('M12 9V3a6 6 0 0 1 0 12z') + P('M9.4 13.5L4 17a6 6 0 0 1 5.4-9.4z') + P('M14.6 13.5L20 17a6 6 0 0 0-5.4-9.4z')),
    gear: svg(C(12, 12, 3) + P('M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2 2M16.4 16.4l2 2M18.4 5.6l-2 2M7.6 16.4l-2 2')),
    warn: svg(P('M12 4l9 16H3z') + L(12, 10, 12, 14) + C(12, 17.5, 0.8)),
    noEntry: svg(C(12, 12, 9) + L(6, 6, 18, 18)),
    swirl: svg(P('M12 3a9 9 0 1 0 9 9 6 6 0 0 1-6 6 4 4 0 0 0 4-4 3 3 0 0 0-3-3')),
    clock: svg(C(12, 12, 9) + P('M12 7v5l4 2')),
    refresh: svg(P('M20 12a8 8 0 1 1-3-6') + P('M20 4v5h-5')),
    check: svg(P('M4 13l5 5L20 6')),
    close: svg(L(6, 6, 18, 18) + L(18, 6, 6, 18)),
    plus: svg(L(12, 5, 12, 19) + L(5, 12, 19, 12)),

    // --- ship and gear -------------------------------------------------------
    microscope: svg(P('M9 21h10') + P('M6 17h9') + P('M12 17a4 4 0 0 0 0-8') + P('M9 9l4-5 3 3-3 4') + P('M5 21h3')),
    pistol: svg(P('M3 8h13l3 4H9l-3 6H3l2-6H3z') + L(8, 12, 8, 14)),
    swords: svg(P('M4 4l10 10-2 2L2 6z') + P('M14 4l6 6-2 2-6-6z') + P('M4 14l2 2-2 4 4-2 2 2')),
    dagger: svg(P('M12 2l2 10-2 2-2-2z') + L(8, 16, 16, 16) + L(12, 14, 12, 22)),
    target: svg(C(12, 12, 9) + C(12, 12, 5) + C(12, 12, 1.3)),
    rocket: svg(P('M12 3c4 3 5 8 5 12H7c0-4 1-9 5-12z') + C(12, 9, 1.6) + P('M7 15l-3 5 5-2') + P('M17 15l3 5-5-2')),
    satellite: svg(P('M12 12l6-6') + P('M4 16l4-4 4 4-4 4z') + P('M12 8l4-4 4 4-4 4z') + P('M12 12a6 6 0 0 1 0 8')),
    computer: svg('<rect x="3" y="5" width="18" height="11" rx="2"/>' + L(8, 20, 16, 20) + L(12, 16, 12, 20)),
    antenna: svg(C(12, 12, 2) + P('M6 6a8 8 0 0 0 0 12') + P('M18 6a8 8 0 0 1 0 12') + P('M9 9a4 4 0 0 0 0 6') + P('M15 9a4 4 0 0 1 0 6')),
    hole: svg(P('M4 8c0-2.8 3.6-5 8-5s8 2.2 8 5-3.6 5-8 5-8-2.2-8-5z') + P('M4 8v6c0 2.8 3.6 5 8 5s8-2.2 8-5V8')),
    compass: svg(C(12, 12, 9) + P('M15 9l-2 6-4 1 2-6z')),
    trophy: svg(P('M8 4h8v4a4 4 0 0 1-8 0z') + P('M8 6H5v2a3 3 0 0 0 3 3') + P('M16 6h3v2a3 3 0 0 1-3 3') + L(12, 12, 12, 17) + L(8, 20, 16, 20)),
    testTube: svg(P('M9 3v12a3 3 0 0 0 6 0V3') + L(8, 7, 16, 7) + L(10, 15, 14, 15)),
    search: svg(C(11, 11, 6) + L(15.5, 15.5, 21, 21)),
    snowflakeDot: svg(C(12, 12, 2) + L(12, 4, 12, 20) + L(5, 8, 19, 16) + L(19, 8, 5, 16)),
    battery: svg('<rect x="3" y="8" width="16" height="9" rx="2"/>' + L(21, 11, 21, 14) + P('M7 11v3M11 11v3')),
    plug: svg(P('M9 3v6M15 3v6') + P('M6 9h12v3a6 6 0 0 1-12 0z') + L(12, 18, 12, 21)),
    shieldBolt: svg(P('M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z') + P('M13 8l-4 6h4l-2 5 6-7h-4z')),
    eyeOff: svg(P('M3 3l18 18') + P('M2 12s4-6 10-6c2 0 4 .6 5.4 1.4M22 12s-4 6-10 6c-2 0-4-.6-5.4-1.4')),
    hand: svg(P('M7 12V6a2 2 0 0 1 4 0v5V4a2 2 0 0 1 4 0v7V6a2 2 0 0 1 4 0v9a6 6 0 0 1-6 6H9a5 5 0 0 1-5-5v-3a2 2 0 0 1 3-1.7z')),
    mouse: svg('<rect x="7" y="3" width="10" height="18" rx="5"/>' + L(12, 3, 12, 9)),
    fullscreen: svg(P('M4 9V4h5') + P('M20 9V4h-5') + P('M4 15v5h5') + P('M20 15v5h-5')),
    overlap: svg('<rect x="4" y="4" width="12" height="12" rx="2"/>' + '<rect x="8" y="8" width="12" height="12" rx="2"/>'),
    disk: svg('<rect x="3" y="3" width="18" height="18" rx="2"/>' + '<rect x="7" y="3" width="10" height="6"/>' + '<rect x="7" y="13" width="10" height="8"/>'),
    folder: svg(P('M3 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z')),
    down: svg(L(12, 4, 12, 20) + P('M6 14l6 6 6-6')),
    chat: svg(P('M4 5h16v11H9l-5 4z')),
    speaker: svg(P('M4 9h4l5-4v14l-5-4H4z') + P('M16 8a5 5 0 0 1 0 8') + P('M19 5a9 9 0 0 1 0 14')),
    mute: svg(P('M4 9h4l5-4v14l-5-4H4z') + L(16, 9, 21, 15) + L(21, 9, 16, 15)),
    sound: svg(P('M4 10h3l4-3v10l-4-3H4z') + P('M14 9a4 4 0 0 1 0 6') + P('M17 6a8 8 0 0 1 0 12')),
    menu: svg(L(4, 7, 20, 7) + L(4, 12, 20, 12) + L(4, 17, 20, 17)),
    hex: svg(P('M12 3l7 4v10l-7 4-7-4V7z')),
    cross: svg(L(12, 4, 12, 20) + L(4, 12, 20, 12)),
    diary: svg('<rect x="5" y="3" width="14" height="18" rx="2"/>' + L(9, 7, 15, 7) + L(9, 11, 15, 11) + L(9, 15, 13, 15)),
    chip: svg('<rect x="7" y="7" width="10" height="10" rx="2"/>' + L(10, 3, 10, 7) + L(14, 3, 14, 7) + L(10, 17, 10, 21) + L(14, 17, 14, 21) + L(3, 10, 7, 10) + L(3, 14, 7, 14) + L(17, 10, 21, 10) + L(17, 14, 21, 14)),
    bomb: svg(C(11, 14, 6) + L(15, 9, 19, 5) + P('M19 5c1-1 3 0 2 2') + P('M11 8V5') + P('M9 5h4')),
    capsule: svg(P('M9 3a6 6 0 0 0 0 12h2V3z') + P('M13 21a6 6 0 0 0 0-12h-2v12z')),
};

// Coloured pieces: the colour is the rule (spore / germinator / item deck), not decoration.
const DOT = (color) => '<svg class="gi gi-dot" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="' + color + '"/></svg>';
const SQUARE = (color) => '<svg class="gi gi-dot" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="3" fill="' + color + '"/></svg>';
const DIAMOND = (color) => '<svg class="gi gi-dot" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l8 9-8 9-8-9z" fill="' + color + '"/></svg>';

export const ICONS = Object.freeze(Object.assign({}, GLYPHS, {
    greenDot: DOT('#3fae63'), redDot: DOT('#c9463b'), blueDot: DOT('#3f7fd0'), yellowDot: DOT('#d8b13c'),
    greenSquare: SQUARE('#3fae63'), purpleSquare: SQUARE('#8b5fbf'),
    blueDiamond: DIAMOND('#4a86c8'),
}));

/** Legacy emoji (and a few symbols that sat in the same places) → our icon. */
export const EM_ALIASES = Object.freeze({
    '🧬': 'dna', '🐕': 'dog', '👾': 'alien', '🐛': 'bug', '🪱': 'worm', '🦂': 'scorpion',
    '🍄': 'mushroom', '🧠': 'brain', '👁': 'eye', '🦷': 'tooth', '🍖': 'meat', '🧑': 'person',
    '🧍': 'person', '🤖': 'robot', '🥚': 'egg', '☠': 'skull', '☠️': 'skull', '👑': 'crown',
    '🛡': 'shield', '🛡️': 'shield', '❤': 'heart', '❤️': 'heart', '🌑': 'moon', '🩸': 'blood',
    '🩹': 'bandage', '🧫': 'tissue', '🎲': 'die', '🂠': 'cardBack', '🃏': 'cardJoker', '📜': 'scroll',
    '🎒': 'backpack', '📦': 'box', '🧳': 'suitcase', '🔒': 'lock', '🔓': 'unlock', '🚪': 'door',
    '📍': 'pin', '⚡': 'bolt', '🔥': 'flame', '❄': 'snow', '❄️': 'snow', '💥': 'burst',
    '☢': 'radioactive', '☣': 'biohazard', '⚙': 'gear', '⚙️': 'gear', '⚠': 'warn', '⚠️': 'warn',
    '⛔': 'noEntry', '🌀': 'swirl', '⏱': 'clock', '🔄': 'refresh', '✔': 'check', '✔️': 'check',
    '✓': 'check', '✕': 'close', '✖': 'close', '✚': 'plus', '🔬': 'microscope', '🔫': 'pistol',
    '⚔': 'swords', '⚔️': 'swords', '🗡': 'dagger', '🗡️': 'dagger', '🎯': 'target', '🚀': 'rocket',
    '📡': 'satellite', '💻': 'computer', '🕳': 'hole', '🕳️': 'hole', '🧭': 'compass', '🏆': 'trophy',
    '🧪': 'testTube', '🔎': 'search', '🔍': 'search', '📁': 'folder', '💣': 'bomb', '💾': 'disk', '📂': 'folder', '⬇': 'down', '⬇️': 'down',
    '💬': 'chat', '🔊': 'speaker', '🔇': 'mute', '☰': 'menu', '⛶': 'fullscreen', '🗗': 'overlap',
    '🖱': 'mouse', '🖱️': 'mouse', '🖐': 'hand', '✋': 'hand', '⬢': 'hex', '🔹': 'blueDiamond',
    '🟢': 'greenDot', '🔴': 'redDot', '🔵': 'blueDot', '🟡': 'yellowDot',
    '🟩': 'greenSquare', '🟪': 'purpleSquare',
});

const ALIAS_KEYS = Object.keys(EM_ALIASES).sort((a, b) => b.length - a.length);
const RE = new RegExp('(' + ALIAS_KEYS.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'gu');

/** Markup of one icon. Unknown names are returned as an empty string (never as a broken tag). */
export function ic(name) { return ICONS[name] || ''; }

/** Replace legacy emoji in a string of already-escaped text/markup. */
export function iconize(text) {
    const s = String(text == null ? '' : text);
    if (!RE.test(s)) return s;
    RE.lastIndex = 0;
    return s.replace(RE, m => ic(EM_ALIASES[m]) || m);
}

const SKIP = 'script,style,textarea,.chat,#chatLog,#log .chat,[data-noicons]';
/** Watch a live page and iconize whatever is rendered next.
 *  `drawIcons()` covers the render paths that know about the icon set; this observer is the safety
 *  net for the small panels built elsewhere (world pop-ups, sheets, galleries, the help window),
 *  so a leftover emoji in a template cannot slip onto the table. Chat, text areas and tooltips are
 *  still skipped (see `SKIP` and `iconizeDom`). */
export function watchIcons(doc) {
    const D = doc || (typeof document !== 'undefined' ? document : null);
    if (!D || !D.body || typeof MutationObserver === 'undefined') return null;
    const queue = new Set();
    let busy = false, scheduled = false;
    const flush = () => {
        scheduled = false;
        if (busy) return;
        busy = true;
        try {
            for (const node of queue) {
                const host = node.nodeType === 1 ? node : node.parentElement;
                if (host && host.isConnected) iconizeDom(host);
            }
        } finally { queue.clear(); busy = false; }
    };
    const observer = new MutationObserver(records => {
        if (busy) return;
        for (const r of records) {
            if (r.type === 'characterData') { if (r.target && r.target.parentElement) queue.add(r.target.parentElement); }
            else for (const n of r.addedNodes) if (n.nodeType === 1 || n.nodeType === 3) queue.add(n);
        }
        if (queue.size && !scheduled) { scheduled = true; Promise.resolve().then(flush); }
    });
    observer.observe(D.body, { childList: true, subtree: true, characterData: true });
    return observer;
}
/** Swap emoji inside the text nodes of a rendered subtree. Attributes (tooltips) are untouched,
 *  so an icon can never break a `title="…"` value; chat input keeps whatever the player typed. */
export function iconizeDom(root) {
    if (!root || !root.ownerDocument) return;
    const doc = root.ownerDocument;
    const walker = doc.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */);
    const found = [];
    while (walker.nextNode()) {
        const node = walker.currentNode;
        if (!RE.test(node.nodeValue)) { RE.lastIndex = 0; continue; }
        RE.lastIndex = 0;
        if (node.parentElement && node.parentElement.closest(SKIP)) continue;
        found.push(node);
    }
    for (const node of found) {
        const holder = doc.createElement('span');
        holder.innerHTML = iconize(node.nodeValue);
        node.replaceWith(...holder.childNodes);
    }
}
