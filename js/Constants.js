// Constants.js — ALL the kit's numbers: location, camera, render, and Heroes V gameplay. Loaded FIRST:
// the other modules read these globals. Edited by the editor (_utils/editor): the server
// patches only lines of the form `const NAME = <number>;` — keep values as numeric
// literals (colors — 0xRRGGBB); the editor won't touch a formula.
const GAME_VERSION = '0.2.0'; // build version: ?v= on scripts (tools/build.mjs) and the archive name

// localStorage shim: in a sandbox iframe and when site data is blocked, direct access throws SecurityError.
// All storage access goes through Store only.
/** @satisfies {Record<string, any>} */
const Store = {
    get(key) {
        try { return localStorage.getItem(key); } catch (e) { return null; }
    },
    set(key, value) {
        try { localStorage.setItem(key, value); return true; } catch (e) { return false; }
    },
    remove(key) {
        try { localStorage.removeItem(key); } catch (e) { /* nothing to remove */ }
    },
    // JSON parsing that never throws: a broken value = as if there were no save.
    getJSON(key, fallback = null) {
        const raw = Store.get(key);
        if (raw === null) return fallback;
        try {
            const parsed = JSON.parse(raw);
            return (parsed && typeof parsed === 'object') ? parsed : fallback;
        } catch (e) {
            console.warn('Store: повреждённое значение "' + key + '", сбрасываю.');
            Store.remove(key);
            return fallback;
        }
    }
};

// Phone or tablet: user agent, iPad posing as a Mac, touch on a small screen.
const IS_MOBILE = (() => {
    const userAgentMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const hasTouchScreen = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    const isSmallScreen = Math.max(window.innerWidth, window.innerHeight) <= 1366 &&
        Math.min(window.innerWidth, window.innerHeight) <= 1024;
    const isiPad = /iPad/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    return userAgentMobile || isiPad || (hasTouchScreen && isSmallScreen);
})();

// --- LOCATION (Location3D.js, Terrain3D.js). World units are px: x to the right, y down
// the map, height up (skill world3d, §Coordinates). ---
const LOCATION_WIDTH = 3072;            // px: location width (32x32 tiles of 96 px)
const LOCATION_HEIGHT = 3072;           // px: location height
const LOCATION_GROUND = 0;              // ground texture: 0 — grass, 1 — sand, 2 — snow (Location3D.GROUNDS)
const GROUND_TILE_SIZE = 384;           // world px per one repeat of the ground texture
const TERRAIN_NOISE_AMP = 28;           // px: gentle isometric valley hills (0 — flat ground)
const TERRAIN_NOISE_SCALE = 880;        // px: hill size
const TERRAIN_NOISE_SEED = 17;          // terrain noise seed
const TERRAIN_BASE = 0;                 // px: mean ground level
const TERRAIN_CELL = 8;                 // px: terrain grid step (mobile — no finer than 12)

// --- MODELS (Gltf3D.js) and UI (UI.js) ---
const MODEL_CLIP_BLEND_SEC = 0.2;       // s: cross-fade between animation clips of a .glb model (idle -> run); 0 — instant
const UI_REF_HEIGHT = 720;              // px: the screen height the UI layout (UILayout.js) is drawn for; the UI scales with the screen height, 0 — no scaling

// --- SOUND (Sound3D.js): channel volumes; a sound with a place on the map is heard from where
// the CAMERA is — its audible region is a sphere of AUDIO_FALLOFF_MAX around it ---
const AUDIO_MASTER_VOLUME = 0.8;        // 0..1: everything (0 — silence)
const AUDIO_MUSIC_VOLUME = 0.6;         // 0..1: the 'music' channel
const AUDIO_SFX_VOLUME = 0.9;           // 0..1: the 'sfx' channel — effects and object sounds
const AUDIO_FALLOFF_MIN = 220;          // px: full volume while the camera is this close to a sound (0 — it fades from the source itself)
const AUDIO_FALLOFF_MAX = 1800;         // px: from here on it is silent (fades linearly in between); an object may set its own pair
const AUDIO_PAN = 0.7;                  // 0..1: how far a sound at the side of the screen goes into one ear (0 — mono)

// --- SAMPLE GAME LEGACY CONSTANTS (kept for editor schema compatibility) ---
const GAME_RUN_SEC = 8;                 // s: legacy run duration
const GAME_REST_SEC = 4;                // s: legacy rest duration
const GAME_STEP_SEC = 0.35;             // s: interval between footstep/gallop sounds

// --- HEROES V GAMEPLAY (HeroesData.js, HeroesMap.js, HeroesCombat.js, Game.js) ---
const HEROES_GRID_SIZE = 32;            // adventure map grid cells per side (32x32)
const HEROES_HERO_MOVE_PTS = 22;        // daily movement points of a hero
const HEROES_HERO_SPEED = 440;          // hero gallop speed on the map (world px/s)
const HEROES_START_GOLD = 4500;         // starting gold in treasury
const HEROES_START_WOOD = 12;           // starting wood
const HEROES_START_ORE = 12;            // starting ore
const HEROES_START_CRYSTAL = 5;         // starting crystals
const HEROES_ARENA_COLS = 10;           // tactical combat grid columns
const HEROES_ARENA_ROWS = 8;            // tactical combat grid rows
const HEROES_ARENA_CELL = 86;           // tactical combat tile size (world px)
const HEROES_COMBAT_SPEED = 1;          // tactical combat animation speed multiplier
const HEROES_CAM_ADV_ZOOM = 0.74;       // panoramic isometric zoom on the adventure map
const HEROES_CAM_COMBAT_ZOOM = 0.88;    // camera zoom in tactical combat
const HEROES_CAM_COMBAT_PITCH = 43;     // camera pitch (deg) in tactical combat

// --- CAMERA (CameraControl.js): telephoto 3D isometric angle (-54° azimuth, 42° pitch, narrow FOV) ---
const CAMERA_FOV_DEG = 34;              // narrow vertical FOV for authentic 3D low-poly isometric look
const CAMERA_AZIMUTH_DEG = -54;         // diagonal isometric heading across the valley
const CAMERA_PITCH_DEG = 42;            // isometric tilt toward the ground
const CAMERA_ZOOM = 1;                  // base camera zoom (1 px/px reference)
const CAMERA_ZOOM_MOBILE = 0.55;        // starting zoom: phones (longer screen side < 1024)
const CAMERA_ZOOM_MIN = 0.45;           // wheel and pinch won't zoom out further
const CAMERA_ZOOM_MAX = 2.4;            // won't zoom in closer
const CAMERA_ZOOM_WHEEL_STEP = 0.12;    // fraction of zoom per one wheel notch
const CAMERA_ZOOM_LERP = 0.18;          // zoom smoothing: fraction of the remainder per frame
const CAMERA_FOLLOW_LERP = 0.08;        // following an object (follow): fraction of the remainder per frame
const CAMERA_FLY_SPEED = 900;           // pan/flight on WASD, arrows and Q/E: screen px/s
const CAMERA_LIMITS = 1;                // keep game camera bounded inside the Valley of Ashan
const CAMERA_LIFT_MAX = 600;            // px, with limits: how high above the ground flight lifts the look-at point
const CAMERA_ORBIT = 1;                 // RMB rotates the 3D isometric camera just like HoMM5
const CAMERA_ORBIT_DEG_PER_PX = 0.3;    // degrees of rotation per screen px of drag
const CAMERA_ORBIT_PITCH_MIN_DEG = 32;  // with limits: won't go lower toward the ground
const CAMERA_ORBIT_PITCH_MAX_DEG = 78;  // with limits: higher — almost straight from above

// --- RENDER (World3D.js): crisp low-poly toon bands, ink creases, silhouette outline and sun shadows ---
const WORLD3D_SUN_AZIMUTH_DEG = 36;
const WORLD3D_SUN_ELEVATION_DEG = 44;   // sun elevation above the horizon
const WORLD3D_SUN_INTENSITY = 0.82;     // sun strength
const WORLD3D_SUN_COLOR = 0xffefd0;     // warm golden sun color
const WORLD3D_SKYLIGHT_INTENSITY = 0.44; // diffuse sky light (hemispheric light source)
const WORLD3D_SKYLIGHT_COLOR = 0xb5dbfa; // sky light color (faces looking up)
const WORLD3D_GROUNDLIGHT_COLOR = 0xbec7a8; // fill light from below
const WORLD3D_SKY_COLOR = 0x8bc0df;     // sky and horizon fog color
const WORLD3D_FOG_DENSITY = 0.00018;    // light atmospheric horizon fog
// Shadows: one color for all (painted by the toon plugin)
const WORLD3D_SHADOW_COLOR = 0x11384c;  // cool royal shadow tint
const WORLD3D_SHADOW_STRENGTH = 0.50;   // shadow strength 0..1
const WORLD3D_SHADOW_SOFT = 2;          // PCF medium soft edge
const WORLD3D_SHADOW_MAP = 2048;        // crisp 2048 shadow map for low-poly miniatures
const WORLD3D_SHADOW_RADIUS = 1040;     // px: shadow ortho frustum half-size limit
const WORLD3D_SHADOW_BIAS = 0.0008;     // depth bias against shadow acne
const WORLD3D_SHADOW_NORMAL_BIAS = 0.8; // normal bias in shadow map texels
// Materials by group
const WORLD3D_GROUND_SPECULAR = 0;      // matte grass ground
const WORLD3D_GROUND_SPEC_POWER = 1;
const WORLD3D_OUTER_TINT = 0.88;        // subtle tint outside the valley border
const WORLD3D_PROP_SPECULAR = 0.06;     // environment specular highlight (group 'prop')
const WORLD3D_PROP_SPEC_POWER = 12;
const WORLD3D_ACTOR_SPECULAR = 0.14;    // heroes & creatures specular glint (group 'actor')
const WORLD3D_ACTOR_SPEC_POWER = 24;
// Toon shader (ArcToonPlugin)
const WORLD3D_TOON = 1;                 // 1 — low-poly toon shading with ink creases and silhouette outline
const WORLD3D_TOON_BANDS = 3;           // 3 crisp light/mid/shadow bands
const WORLD3D_TOON_SOFT = 0.03;         // crisp facet band transitions
const WORLD3D_TOON_LOW = 0.46;          // brightness of the darkest band
const WORLD3D_TOON_GROUND = 1;          // bands on terrain slopes too
const WORLD3D_TOON_SPEC = 0.28;         // toon glint highlight strength
const WORLD3D_TOON_SPEC_SIZE = 0.08;    // highlight threshold
const WORLD3D_TOON_RIM = 0.26;          // rim light along silhouettes
const WORLD3D_TOON_RIM_WIDTH = 0.24;    // rim light width
// Ink edges (EdgesRenderer)
const WORLD3D_TOON_INK = 2;             // creases on both actors and low-poly props
const WORLD3D_TOON_INK_WIDTH = 22;      // ink crease thickness
const WORLD3D_TOON_INK_COLOR = 0x161922; // deep slate ink color
const WORLD3D_TOON_INK_ANGLE = 38;      // °: crease threshold for faceted low-poly models
// Outer silhouette outline
const WORLD3D_TOON_OUTLINE = 2;         // silhouette outline on actors and props
const WORLD3D_TOON_OUTLINE_ACTOR_WIDTH = 1.5; // screen px: heroes & creatures outline
const WORLD3D_TOON_OUTLINE_PROP_WIDTH = 1;    // screen px: castles, mines & nature outline
