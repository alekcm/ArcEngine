// UILayout.js — the game's UI layout: every HUD element, placed and styled in the editor (UI tab).
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
const UI_LAYOUT = [
    { id: 'title', kind: 'text', anchor: 'top-right', x: 8, y: 2, text: "ARCENGINE", fontSize: 16, color: '#ffffff', shadow: '#0b1a24', alpha: 0.5, visible: 1 },
    { id: 'fps', kind: 'text', anchor: 'top-right', x: 9, y: 24, text: "60 fps", fontSize: 12, color: '#ffffff', shadow: '#0b1a24', alpha: 0.5, visible: 1 },
    { id: 'hintPanel', kind: 'panel', anchor: 'bottom-center', x: 2, y: 26, w: 420, h: 19, fill: '#10202c', border: '', radius: 18, alpha: 0.6, visible: 1 },
    { id: 'hint', kind: 'text', anchor: 'bottom-center', x: 6, y: 30, text: "WASD fly  ·  Q / E down / up  ·  RMB look  ·  wheel zoom  ·  R reset", fontSize: 10, color: '#ffffff', shadow: '', alpha: 0.5, visible: 1 },
    { id: 'fsHud', kind: 'panel', anchor: 'top-left', x: 10, y: 10, w: 300, h: 190, fill: '#0b1622', border: '#2a4a63', radius: 10, alpha: 0.85, visible: 1 },
    { id: 'fsPhase', kind: 'text', anchor: 'top-left', parent: 'fsHud', x: 10, y: 8, text: "Раунд 1", fontSize: 15, color: '#ffffff', shadow: '#000000', alpha: 1, visible: 1 },
    { id: 'fsPlayers', kind: 'text', anchor: 'top-left', parent: 'fsHud', x: 10, y: 32, text: "", fontSize: 12, color: '#bcd6e6', shadow: '#000000', alpha: 1, visible: 1 },
    { id: 'fsStatus', kind: 'text', anchor: 'top-left', parent: 'fsHud', x: 10, y: 152, text: "", fontSize: 12, color: '#ffd479', shadow: '#000000', alpha: 1, visible: 1 },
    { id: 'fsSide', kind: 'panel', anchor: 'top-right', x: 10, y: 10, w: 280, h: 250, fill: '#0b1622', border: '#2a4a63', radius: 10, alpha: 0.85, visible: 1 },
    { id: 'fsSideTitle', kind: 'text', anchor: 'top-left', parent: 'fsSide', x: 10, y: 8, text: "", fontSize: 14, color: '#ffd479', shadow: '#000000', alpha: 1, visible: 1 },
    { id: 'fsSideText', kind: 'text', anchor: 'top-left', parent: 'fsSide', x: 10, y: 32, text: "", fontSize: 11, color: '#d6e6f0', shadow: '#000000', alpha: 1, visible: 1 },
    { id: 'fsActions', kind: 'panel', anchor: 'bottom-right', x: 10, y: 10, w: 280, h: 300, fill: '#0b1622', border: '#2a4a63', radius: 10, alpha: 0.85, visible: 1 },
    { id: 'fsLogPanel', kind: 'panel', anchor: 'bottom-left', x: 10, y: 10, w: 430, h: 110, fill: '#0b1622', border: '#2a4a63', radius: 10, alpha: 0.8, visible: 1 },
    { id: 'fsLog', kind: 'text', anchor: 'top-left', parent: 'fsLogPanel', x: 8, y: 6, text: "", fontSize: 11, color: '#9fb6c4', shadow: '#000000', alpha: 1, visible: 1 },
    { id: 'fsLobby', kind: 'panel', anchor: 'middle-center', x: 0, y: 0, w: 470, h: 430, fill: '#0b1622', border: '#2a4a63', radius: 12, alpha: 0.96, visible: 0 },
    { id: 'fsLobbyTitle', kind: 'text', anchor: 'top-left', parent: 'fsLobby', x: 18, y: 14, text: "Forbidden Stars", fontSize: 22, color: '#ffd479', shadow: '#000000', alpha: 1, visible: 1 },
    { id: 'fsLobbyInfo', kind: 'text', anchor: 'top-left', parent: 'fsLobby', x: 18, y: 52, text: "", fontSize: 13, color: '#ffffff', shadow: '#000000', alpha: 1, visible: 1 },
    { id: 'fsLobbyPlayers', kind: 'text', anchor: 'top-left', parent: 'fsLobby', x: 18, y: 80, text: "", fontSize: 13, color: '#cfe3ef', shadow: '#000000', alpha: 1, visible: 1 },
    { id: 'fsBtn', kind: 'button', anchor: 'top-left', parent: 'fsActions', x: 8, y: 8, w: 264, h: 26, text: "Кнопка", fontSize: 12, color: '#ffffff', fill: '#24557f', border: '', radius: 6, alpha: 1, visible: 0 },
    { id: 'fsLobbyBtn', kind: 'button', anchor: 'top-left', parent: 'fsLobby', x: 18, y: 120, w: 200, h: 28, text: "Фракция", fontSize: 12, color: '#ffffff', fill: '#24557f', border: '', radius: 6, alpha: 1, visible: 0 },
];
