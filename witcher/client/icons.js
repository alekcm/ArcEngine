// Vector icons (inline SVG, 24×24 viewBox). No emoji anywhere: they render as empty boxes on
// some systems. icon(name, cls) returns markup; colour follows currentColor unless fixed.
const P = {
    sword: '<path d="M19.5 2.5 21.5 4.5 10 16l-1.5-.5L8 15l-.5-1.5Z" fill="currentColor"/><path d="m5 13.5 5.5 5.5-1.5 1.5-1.8-1.8L4.6 21.3 2.7 19.4l2.6-2.6-1.8-1.8Z" fill="currentColor"/>',
    shield: '<path d="M12 2 20 5v6c0 5-3.4 9.3-8 11-4.6-1.7-8-6-8-11V5Z" fill="currentColor"/><path d="M12 5.2 17 7v4c0 3.3-2 6.3-5 7.7Z" fill="#fff" opacity=".22"/>',
    draw: '<rect x="4" y="4" width="11" height="15" rx="2" fill="currentColor" opacity=".55"/><rect x="9" y="6" width="11" height="15" rx="2" fill="currentColor"/><path d="M14.5 10v7M11 13.5h7" stroke="#111" stroke-width="2"/>',
    card: '<rect x="5" y="3" width="14" height="18" rx="2.2" fill="currentColor"/><rect x="7.5" y="5.5" width="9" height="7" rx="1" fill="#000" opacity=".25"/>',
    deck: '<rect x="6" y="5" width="13" height="16" rx="2" fill="currentColor" opacity=".45"/><rect x="4" y="3" width="13" height="16" rx="2" fill="currentColor"/>',
    hand: '<rect x="2.5" y="6" width="9" height="13" rx="1.6" transform="rotate(-14 7 12.5)" fill="currentColor" opacity=".6"/><rect x="7.5" y="4.5" width="9" height="13" rx="1.6" fill="currentColor" opacity=".8"/><rect x="12.5" y="6" width="9" height="13" rx="1.6" transform="rotate(14 17 12.5)" fill="currentColor"/>',
    coin: '<circle cx="12" cy="12" r="9" fill="#e2b33f"/><circle cx="12" cy="12" r="6.6" fill="none" stroke="#9a6d12" stroke-width="1.6"/><path d="M12 8v8M9.5 10.5 12 8l2.5 2.5" stroke="#9a6d12" stroke-width="1.6" fill="none"/>',
    trophy: '<path d="M7 3h10v4a5 5 0 0 1-10 0Z" fill="currentColor"/><path d="M7 5H4v2a3 3 0 0 0 3 3M17 5h3v2a3 3 0 0 1-3 3" stroke="currentColor" stroke-width="1.7" fill="none"/><path d="M10.5 12h3l.5 4h-4Z M8 17h8v3H8Z" fill="currentColor"/>',
    skull: '<path d="M12 3a7.5 7.5 0 0 0-7.5 7.5c0 2.5 1.2 4.4 3 5.6V19h9v-2.9c1.8-1.2 3-3.1 3-5.6A7.5 7.5 0 0 0 12 3Z" fill="currentColor"/><circle cx="9" cy="11" r="1.9" fill="#111"/><circle cx="15" cy="11" r="1.9" fill="#111"/><path d="M10 19v2M12 19v2M14 19v2" stroke="#111" stroke-width="1.2"/>',
    forest: '<path d="M12 2 6 10h3l-4 6h5v5h4v-5h5l-4-6h3Z" fill="currentColor"/>',
    mountain: '<path d="M2 20 9 7l3.5 6 2.5-4 7 11Z" fill="currentColor"/><path d="m9 7 2 3.5-2 .8-1.6-1.2Z" fill="#fff" opacity=".7"/>',
    water: '<path d="M2 9c2.5-2 5-2 7.5 0s5 2 7.5 0 3.5-1.5 5 0M2 14c2.5-2 5-2 7.5 0s5 2 7.5 0 3.5-1.5 5 0M2 19c2.5-2 5-2 7.5 0s5 2 7.5 0 3.5-1.5 5 0" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round"/>',
    joker: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 4v16M4 12h16M6.3 6.3l11.4 11.4M17.7 6.3 6.3 17.7" stroke="currentColor" stroke-width="1.4"/>',
    combat: '<path d="m4 4 9 9-1.6 1.6L2.5 5.6V4Zm16 0v1.6l-8.9 9L9.5 13l9-9Z" fill="currentColor"/><path d="m5 15 4 4-1.4 1.4-1.3-1.3-2 2-1.4-1.4 2-2-1.3-1.3Zm14 0 1.4 1.4-1.3 1.3 2 2-1.4 1.4-2-2-1.3 1.3L15 19Z" fill="currentColor"/>',
    defense: '<path d="M12 2 20 5v6c0 5-3.4 9.3-8 11-4.6-1.7-8-6-8-11V5Z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 6v12M7.5 10.5h9" stroke="currentColor" stroke-width="2"/>',
    alchemy: '<path d="M9.5 2.5h5M10.5 2.5v6L5 18.5A2 2 0 0 0 6.8 21.5h10.4a2 2 0 0 0 1.8-3L13.5 8.5v-6" stroke="currentColor" stroke-width="1.8" fill="none"/><path d="M7.3 15h9.4l2 3.6a1 1 0 0 1-.9 1.4H6.2a1 1 0 0 1-.9-1.4Z" fill="currentColor"/>',
    spec: '<path d="m12 2 2.6 6.4 6.9.5-5.3 4.4 1.7 6.7L12 16.3 6.1 20l1.7-6.7L2.5 8.9l6.9-.5Z" fill="currentColor"/>',
    bomb: '<circle cx="11" cy="14" r="7" fill="currentColor"/><path d="M15 8l2-2M17 6l1.5-1.5M18 3.5l1 1M20 5l-1 .5" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/><circle cx="8.5" cy="11.5" r="1.8" fill="#fff" opacity=".3"/>',
    elixir: '<path d="M10 2h4v3l3 4v11a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V9l3-4Z" fill="currentColor"/><path d="M8 13h8v6H8Z" fill="#fff" opacity=".28"/>',
    track: '<path d="M7 4c1.6 0 2.5 1.6 2.5 3.4S8.6 11 7 11 4.5 9.3 4.5 7.4 5.4 4 7 4Zm9 6c1.6 0 2.5 1.6 2.5 3.4S17.6 17 16 17s-2.5-1.7-2.5-3.6S14.4 10 16 10ZM5.2 13.2c.9 0 1.6.6 1.6 1.5s-.7 1.6-1.6 1.6-1.5-.7-1.5-1.6.6-1.5 1.5-1.5Zm4 .6c.9 0 1.6.7 1.6 1.6S10.1 17 9.2 17s-1.5-.7-1.5-1.6.6-1.6 1.5-1.6Zm5 6c.9 0 1.6.6 1.6 1.5S15.1 22.9 14.2 22.9s-1.5-.7-1.5-1.6.6-1.5 1.5-1.5Zm4-12.6c.9 0 1.6.6 1.6 1.5s-.7 1.6-1.6 1.6-1.5-.7-1.5-1.6.6-1.5 1.5-1.5Z" fill="currentColor"/>',
    top: '<rect x="5" y="9" width="14" height="12" rx="2" fill="currentColor" opacity=".5"/><path d="M12 2v10M8 6l4-4 4 4" stroke="currentColor" stroke-width="2.2" fill="none"/>',
    ret: '<path d="M9 7H15a5 5 0 0 1 0 10H8" stroke="currentColor" stroke-width="2.2" fill="none"/><path d="M10 3 6 7l4 4" stroke="currentColor" stroke-width="2.2" fill="none"/>',
    level: '<path d="M4 20 12 4l8 16Z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8.5 15h7" stroke="currentColor" stroke-width="2"/>',
    dice: '<rect x="3" y="3" width="18" height="18" rx="4" fill="currentColor"/><circle cx="8" cy="8" r="1.7" fill="#111"/><circle cx="16" cy="16" r="1.7" fill="#111"/><circle cx="12" cy="12" r="1.7" fill="#111"/><circle cx="16" cy="8" r="1.7" fill="#111"/><circle cx="8" cy="16" r="1.7" fill="#111"/>',
    move: '<path d="M4 18c3-8 9-2 12-10" stroke="currentColor" stroke-width="2" fill="none" stroke-dasharray="2.5 2.5"/><path d="m14 5 5 1-1 5" stroke="currentColor" stroke-width="2.2" fill="none"/>',
    meditate: '<circle cx="12" cy="5" r="2.6" fill="currentColor"/><path d="M12 9c-2.3 0-3.6 1.6-4 4l-3.5 2 1 1.6 4-1.6.4-2 .1 3-4 2.5h12L14 16l.1-3 .4 2 4 1.6 1-1.6-3.5-2c-.4-2.4-1.7-4-4-4Z" fill="currentColor"/>',
    explore: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="m15.5 8.5-2 5-5 2 2-5Z" fill="currentColor"/>',
    undo: '<path d="M9 7H15a5 5 0 0 1 0 10H9" stroke="currentColor" stroke-width="2.2" fill="none"/><path d="M10 3 6 7l4 4" stroke="currentColor" stroke-width="2.2" fill="none"/>',
    save: '<path d="M4 4h13l3 3v13H4Z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 4v5h7V4M8 20v-6h8v6" stroke="currentColor" stroke-width="2" fill="none"/>',
    sound: '<path d="M4 9h4l5-4v14l-5-4H4Z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" stroke-width="1.8" fill="none"/>',
    mute: '<path d="M4 9h4l5-4v14l-5-4H4Z" fill="currentColor"/><path d="m16 9 5 6M21 9l-5 6" stroke="currentColor" stroke-width="1.8"/>',
    help: '<circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9.3 9.3a2.8 2.8 0 1 1 3.6 2.7c-.6.2-.9.7-.9 1.3V14" stroke="currentColor" stroke-width="2" fill="none"/><circle cx="12" cy="17.3" r="1.2" fill="currentColor"/>',
    close: '<path d="m6 6 12 12M18 6 6 18" stroke="currentColor" stroke-width="2.4"/>',
    bot: '<rect x="5" y="8" width="14" height="11" rx="3" fill="currentColor"/><circle cx="9.5" cy="13" r="1.6" fill="#111"/><circle cx="14.5" cy="13" r="1.6" fill="#111"/><path d="M12 8V5M10 4h4" stroke="currentColor" stroke-width="2"/>',
    crown: '<path d="m3 8 4.5 4L12 5l4.5 7L21 8l-2 11H5Z" fill="currentColor"/>',
    bite: '<path d="M3 6c3 4 6 5 9 5s6-1 9-5l-2 9c-2 3-4.5 4-7 4s-5-1-7-4Z" fill="currentColor"/><path d="m7 9 1.4 3L10 10l1 3.2L12 10.5l1 2.7L14 10l1.6 2L17 9" stroke="#111" stroke-width="1.2" fill="none"/>',
    strike: '<path d="M4 20 15 9M14 4l6 6M17 7l-4 4" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="m3 13 2 2M7 17l2 2" stroke="currentColor" stroke-width="2"/>',
    poker: '<rect x="2.5" y="7" width="11" height="11" rx="2.5" fill="currentColor" transform="rotate(-12 8 12.5)"/><rect x="10.5" y="5" width="11" height="11" rx="2.5" fill="currentColor" opacity=".7" transform="rotate(10 16 10.5)"/>',
    eye: '<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3.2" fill="currentColor"/>',
    chat: '<path d="M4 5h16v11H9l-5 4Z" fill="none" stroke="currentColor" stroke-width="2"/>',
    log: '<path d="M6 3h12v18H6Z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9 8h6M9 12h6M9 16h4" stroke="currentColor" stroke-width="2"/>',
    port: '<path d="M12 3v15M7 7h10" stroke="currentColor" stroke-width="2"/><path d="M4 13c0 4 3.6 7 8 7s8-3 8-7" stroke="currentColor" stroke-width="2" fill="none"/><circle cx="12" cy="4" r="1.6" fill="currentColor"/>',
    school: '<path d="M3 21V9l3-2 3 2V5l3-2 3 2v4l3-2 3 2v12h-6v-5h-6v5Z" fill="currentColor"/>',
    potion: '<path d="M10 2h4v3l3 4v11a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V9l3-4Z" fill="currentColor"/>',
};

export function icon(name, cls = '', title = '') {
    const body = P[name] || P.card;
    return `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${title ? `<title>${title}</title>` : ''}${body}</svg>`;
}

export const TERRAIN_COLOR = { forest: '#3f8a3a', mountain: '#8a8f98', water: '#2f7fbf', joker: '#b08a3a' };
export const CARD_COLOR = { blue: '#3b7fc4', red: '#b8382f', green: '#3e9150', purple: '#7d4fb0', yellow: '#c9a12e' };
export const SKILL_ICON = { combat: 'combat', defense: 'defense', alchemy: 'alchemy', spec: 'spec' };
