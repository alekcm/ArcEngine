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
    { name: 'room-reception', model: 'assets/models/character.glb', kind: 'prop', x: 640, y: 520, h: 0, rot: [0, 0, 0], scale: [0.25, 0.25, 0.25], tag: 'room-reception', hidden: true },
    { name: 'room-kitchen', model: 'assets/models/character.glb', kind: 'prop', x: 500, y: 860, h: 0, rot: [0, 0, 0], scale: [0.25, 0.25, 0.25], tag: 'room-kitchen', hidden: true },
    { name: 'room-hall', model: 'assets/models/character.glb', kind: 'prop', x: 1100, y: 800, h: 0, rot: [0, 0, 0], scale: [0.25, 0.25, 0.25], tag: 'room-hall', hidden: true },
    { name: 'room-bar', model: 'assets/models/character.glb', kind: 'prop', x: 1420, y: 1120, h: 0, rot: [0, 0, 0], scale: [0.25, 0.25, 0.25], tag: 'room-bar', hidden: true },
    { name: 'room-cellar', model: 'assets/models/character.glb', kind: 'prop', x: 1490, y: 1260, h: 0, rot: [0, 0, 0], scale: [0.25, 0.25, 0.25], tag: 'room-cellar', hidden: true },
    { name: 'room-baths', model: 'assets/models/character.glb', kind: 'prop', x: 620, y: 1300, h: 0, rot: [0, 0, 0], scale: [0.25, 0.25, 0.25], tag: 'room-baths', hidden: true },
    { name: 'room-toilets', model: 'assets/models/character.glb', kind: 'prop', x: 800, y: 420, h: 0, rot: [0, 0, 0], scale: [0.25, 0.25, 0.25], tag: 'room-toilets', hidden: true },
    { name: 'room-staff', model: 'assets/models/character.glb', kind: 'prop', x: 540, y: 1040, h: 0, rot: [0, 0, 0], scale: [0.25, 0.25, 0.25], tag: 'room-staff', hidden: true },
    { name: 'room-stairs', model: 'assets/models/character.glb', kind: 'prop', x: 1080, y: 520, h: 0, rot: [0, 0, 0], scale: [0.25, 0.25, 0.25], tag: 'room-stairs', hidden: true },
    { name: 'room-pantry', model: 'assets/models/character.glb', kind: 'prop', x: 820, y: 700, h: 0, rot: [0, 0, 0], scale: [0.25, 0.25, 0.25], tag: 'room-pantry', hidden: true },
    { name: 'room-guest1', model: 'assets/models/character.glb', kind: 'prop', x: 1280, y: 600, h: 0, rot: [0, 0, 0], scale: [0.25, 0.25, 0.25], tag: 'room-guest1', hidden: true },
    { name: 'room-guest2', model: 'assets/models/character.glb', kind: 'prop', x: 660, y: 960, h: 0, rot: [0, 0, 0], scale: [0.25, 0.25, 0.25], tag: 'room-guest2', hidden: true },
    { name: 'room-fireplace', model: 'assets/models/character.glb', kind: 'prop', x: 1160, y: 940, h: 0, rot: [0, 0, 0], scale: [0.25, 0.25, 0.25], tag: 'room-fireplace', hidden: true },
    { name: 'room-crockery', model: 'assets/models/character.glb', kind: 'prop', x: 1320, y: 1080, h: 0, rot: [0, 0, 0], scale: [0.25, 0.25, 0.25], tag: 'room-crockery', hidden: true },
    { name: 'room-guard', model: 'assets/models/character.glb', kind: 'prop', x: 700, y: 1120, h: 0, rot: [0, 0, 0], scale: [0.25, 0.25, 0.25], tag: 'room-guard', hidden: true },
    { name: 'room-maid', model: 'assets/models/character.glb', kind: 'prop', x: 1120, y: 1200, h: 0, rot: [0, 0, 0], scale: [0.25, 0.25, 0.25], tag: 'room-maid', hidden: true },
    { name: 'room-inventory', model: 'assets/models/character.glb', kind: 'prop', x: 940, y: 1160, h: 0, rot: [0, 0, 0], scale: [0.25, 0.25, 0.25], tag: 'room-inventory', hidden: true },
];
