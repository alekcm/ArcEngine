// Objects.js — location objects: models placed in the editor (Objects tab).
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
const LOCATION_OBJECTS = [
    { name: 'castle_haven', model: 'assets/models/castle_haven.glb', kind: 'prop', x: 528, y: 2544, h: 0, rot: [0, 45, 0], scale: [0.85, 0.85, 0.85], tag: 'castle_haven' },
    { name: 'castle_inferno', model: 'assets/models/castle_inferno.glb', kind: 'prop', x: 2544, y: 528, h: 0, rot: [0, -135, 0], scale: [0.85, 0.85, 0.85], tag: 'castle_inferno' },
    { name: 'lord_godric', model: 'assets/models/hero_knight.glb', kind: 'actor', x: 720, y: 2352, h: 0, rot: [0, -45, 0], scale: [0.52, 0.52, 0.52], clip: 'idle', tag: 'player' },
    { name: 'lord_agrael', model: 'assets/models/hero_demon.glb', kind: 'actor', x: 2352, y: 720, h: 0, rot: [0, 135, 0], scale: [0.54, 0.54, 0.54], clip: 'idle', tag: 'enemy_hero' },
    { name: 'windmill', model: 'assets/models/mill.fbx', kind: 'prop', x: 912, y: 2064, h: 0, rot: [0, 35, 0], scale: [1.15, 1.15, 1.15], anim: { part: 'w1..003', axis: '-y', speed: 10, dir: 'ccw' }, tag: 'windmill', sound: { src: 'assets/sounds/mill.mp3', volume: 0.25 } },
    { name: 'sawmill', model: 'assets/models/sawmill.glb', kind: 'prop', x: 336, y: 1968, h: 0, rot: [0, 30, 0], scale: [0.72, 0.72, 0.72], tag: 'mine_wood' },
    { name: 'ore_pit', model: 'assets/models/ore_pit.glb', kind: 'prop', x: 1104, y: 2640, h: 0, rot: [0, -30, 0], scale: [0.76, 0.76, 0.76], tag: 'mine_ore' },
    { name: 'gold_mine_west', model: 'assets/models/gold_mine.glb', kind: 'prop', x: 912, y: 1392, h: 0, rot: [0, 60, 0], scale: [0.78, 0.78, 0.78], tag: 'mine_gold_1' },
    { name: 'crystal_cavern', model: 'assets/models/crystal_cavern.glb', kind: 'prop', x: 1584, y: 2256, h: 0, rot: [0, -45, 0], scale: [0.78, 0.78, 0.78], tag: 'mine_crystal' },
    { name: 'gold_mine_east', model: 'assets/models/gold_mine.glb', kind: 'prop', x: 2160, y: 1776, h: 0, rot: [0, -120, 0], scale: [0.78, 0.78, 0.78], tag: 'mine_gold_2' },
    { name: 'shrine_light', model: 'assets/models/shrine.glb', kind: 'prop', x: 1200, y: 2160, h: 0, rot: [0, 45, 0], scale: [0.68, 0.68, 0.68], tag: 'shrine_1' },
    { name: 'shrine_chaos', model: 'assets/models/shrine.glb', kind: 'prop', x: 1872, y: 912, h: 0, rot: [0, -45, 0], scale: [0.68, 0.68, 0.68], tag: 'shrine_2' },
    { name: 'obelisk_south', model: 'assets/models/obelisk.glb', kind: 'prop', x: 1392, y: 1776, h: 0, rot: [0, 45, 0], scale: [0.68, 0.68, 0.68], tag: 'obelisk_1' },
    { name: 'obelisk_north', model: 'assets/models/obelisk.glb', kind: 'prop', x: 1872, y: 1392, h: 0, rot: [0, 45, 0], scale: [0.68, 0.68, 0.68], tag: 'obelisk_2' },
    { name: 'chest_starter', model: 'assets/models/treasure_chest.glb', kind: 'prop', x: 432, y: 2352, h: 0, rot: [0, 35, 0], scale: [0.64, 0.64, 0.64], tag: 'chest_1' },
    { name: 'chest_pass', model: 'assets/models/treasure_chest.glb', kind: 'prop', x: 1488, y: 1488, h: 0, rot: [0, -40, 0], scale: [0.66, 0.66, 0.66], tag: 'chest_2' },
    { name: 'chest_king', model: 'assets/models/treasure_chest.glb', kind: 'prop', x: 2448, y: 1392, h: 0, rot: [0, 120, 0], scale: [0.66, 0.66, 0.66], tag: 'chest_3' },
    { name: 'pickup_south', model: 'assets/models/mana_crystal.glb', kind: 'prop', x: 816, y: 2736, h: 0, rot: [0, 20, 0], scale: [0.72, 0.72, 0.72], tag: 'pickup_1' },
    { name: 'pickup_mid', model: 'assets/models/mana_crystal.glb', kind: 'prop', x: 1296, y: 1200, h: 0, rot: [0, 75, 0], scale: [0.72, 0.72, 0.72], tag: 'pickup_2' },
    { name: 'pickup_north', model: 'assets/models/mana_crystal.glb', kind: 'prop', x: 2160, y: 624, h: 0, rot: [0, -30, 0], scale: [0.72, 0.72, 0.72], tag: 'pickup_3' },
    { name: 'guard_wood', model: 'assets/models/unit_imp.glb', kind: 'actor', x: 432, y: 2064, h: 0, rot: [0, 45, 0], scale: [0.48, 0.48, 0.48], clip: 'idle', tag: 'guard_wood' },
    { name: 'guard_ore', model: 'assets/models/character.glb', kind: 'actor', x: 1008, y: 2544, h: 0, rot: [0, -120, 0], scale: [0.36, 0.36, 0.36], clip: 'idle', tag: 'guard_ore', sound: { src: 'assets/sounds/farmer.mp3', volume: 0.35, falloffMax: 520 } },
    { name: 'guard_gold_1', model: 'assets/models/unit_skeleton.glb', kind: 'actor', x: 912, y: 1488, h: 0, rot: [0, 90, 0], scale: [0.44, 0.44, 0.44], clip: 'idle', tag: 'guard_gold_1' },
    { name: 'guard_crystal', model: 'assets/models/unit_hellhound.glb', kind: 'actor', x: 1488, y: 2256, h: 0, rot: [0, -150, 0], scale: [0.48, 0.48, 0.48], clip: 'idle', tag: 'guard_crystal' },
    { name: 'guard_pass', model: 'assets/models/unit_griffin.glb', kind: 'actor', x: 1488, y: 1584, h: 0, rot: [0, 135, 0], scale: [0.48, 0.48, 0.48], clip: 'idle', tag: 'guard_pass' },
    { name: 'guard_gold_2', model: 'assets/models/unit_skeleton.glb', kind: 'actor', x: 2064, y: 1776, h: 0, rot: [0, 180, 0], scale: [0.46, 0.46, 0.46], clip: 'idle', tag: 'guard_gold_2' },
    { name: 'guard_gate', model: 'assets/models/unit_demon.glb', kind: 'actor', x: 2064, y: 1104, h: 0, rot: [0, 135, 0], scale: [0.48, 0.48, 0.48], clip: 'idle', tag: 'guard_gate' },
    { name: 'bush_1', model: 'assets/models/Bush_3.fbx', kind: 'prop', x: 624, y: 2160, h: 0, rot: [0, 15, 0], scale: [0.45, 0.45, 0.45] },
    { name: 'bush_2', model: 'assets/models/Bush_3.fbx', kind: 'prop', x: 1008, y: 2160, h: 0, rot: [0, 95, 0], scale: [0.5, 0.5, 0.5] },
    { name: 'bush_3', model: 'assets/models/Bush_3.fbx', kind: 'prop', x: 1296, y: 1872, h: 0, rot: [0, -40, 0], scale: [0.42, 0.42, 0.42] },
    { name: 'bush_4', model: 'assets/models/Bush_3.fbx', kind: 'prop', x: 1776, y: 1488, h: 0, rot: [0, 60, 0], scale: [0.48, 0.48, 0.48] },
];
