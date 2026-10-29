// characters.js — procedural low-poly characters and intruders (Babylon.js).
// Characters follow the original Nemesis art: Soldier — heavy power armour with a glass dome
// helmet and a two-handed rifle; Scout — slim plated vest, long hair, glowing tech bracer, rifle on
// the back; Mechanic — welding mask with a square window, hoses, orange/white plating, tools.
// Every part is bound to a paint zone (CHARACTERS[*].zones) so the player can recolour it.

import { characterParts } from '../shared/appearance.mjs';
import { addCrewDetails } from './crew-variants.js';
import { soldierVariant, mechanicVariant } from './role-variants.js';
import { scoutVariant, pilotVariant } from './explorer-variants.js';
import { hackerVariant, scientistVariant } from './research-variants.js';

const B = () => window.BABYLON;

const MAT_CACHE = new WeakMap();   // scene -> Map(key -> material)
/** Flat-shaded material for a colour (cached per scene+colour). */
export function flatMat(scene, hex, opts = {}) {
    let cache = MAT_CACHE.get(scene);
    if (!cache) { cache = new Map(); MAT_CACHE.set(scene, cache); }
    const key = hex + '|' + (opts.emissive || '') + '|' + (opts.alpha || '') + '|' + (opts.spec || '');
    if (cache.has(key)) return cache.get(key);
    const m = new (B().StandardMaterial)('m_' + hex, scene);
    const c = B().Color3.FromHexString(hex);
    m.diffuseColor = c;
    const sp = opts.spec === undefined ? 0.1 : opts.spec;
    m.specularColor = new (B().Color3)(sp, sp, sp); m.specularPower = 48;
    if (opts.emissive) m.emissiveColor = c.scale(opts.emissive);
    if (opts.alpha) { m.alpha = opts.alpha; m.backFaceCulling = false; }
    m.freeze();
    cache.set(key, m);
    return m;
}

// --- tiny mesh helpers (all flat shaded, parented, positioned) -----------------------------------
function box(scene, w, h, d, parent, x, y, z, rot) {
    const m = B().MeshBuilder.CreateBox('b', { width: w, height: h, depth: d }, scene);
    m.parent = parent; m.position.set(x, y, z); if (rot) m.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0);
    return m;
}
function cyl(scene, dTop, dBot, h, tess, parent, x, y, z, rot) {
    const m = B().MeshBuilder.CreateCylinder('c', { diameterTop: dTop, diameterBottom: dBot, height: h, tessellation: tess }, scene);
    m.parent = parent; m.position.set(x, y, z); if (rot) m.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0);
    m.convertToFlatShadedMesh();
    return m;
}
function sphere(scene, d, seg, parent, x, y, z, scl) {
    const m = B().MeshBuilder.CreateSphere('s', { diameter: d, segments: seg }, scene);
    m.parent = parent; m.position.set(x, y, z); if (scl) m.scaling.set(scl[0], scl[1], scl[2]);
    m.convertToFlatShadedMesh();
    return m;
}

export const DEFAULTS = {
    soldier: { skin: '#e8b89a', hair: '#2a1b12', armor: '#5a6b5c', accent: '#c0392b', pants: '#2d3436', visor: '#ff3b3b' },
    scout: { skin: '#d29b7c', hair: '#8a1f3a', suit: '#3b2f4a', jacket: '#8e44ad', boots: '#1c1c1c', visor: '#d13bff' },
    mechanic: { skin: '#b5805f', hair: '#5a3a22', overall: '#d68910', helmet: '#ecf0f1', gloves: '#2d3436', lights: '#ffd23b' },
    pilot: { skin: '#e8b89a', hair: '#e8e2d0', suit: '#8a7a4a', armor: '#9aa06a', gloves: '#2d3436', visor: '#3bff7a' },
    hacker: { skin: '#8d5a3c', hood: '#3f4a3e', jacket: '#2a3330', pants: '#1e2422', gear: '#c9b12a', lights: '#3bff7a' },
    scientist: { skin: '#e8b89a', hair: '#8a6a4a', coat: '#d7dde2', shirt: '#4a5560', pants: '#2d3436', lights: '#ff4a3b' },
    medic: { skin: '#f2d2bd', hair: '#d4683a', coat: '#e8edf2', cap: '#3a4046', pants: '#2d3436', lights: '#ff3b3b' },
    janitor: { skin: '#d29b7c', hair: '#c4c4c4', overall: '#e67e22', cap: '#c0392b', gloves: '#f1c40f', lights: '#ffd23b' },
    ceo: { skin: '#e8b89a', hair: '#e8e2d0', coat: '#3a3d44', shirt: '#dfe6ee', robot: '#232c3a', lights: '#bfe8ff' },
    labrat: { skin: '#d29b7c', hair: '#1c1c1c', gown: '#e3e7ea', pants: '#7f8c8d', bandage: '#dfe6ee', lights: '#ff3bd1' },
    sentry: { skin: '#b5805f', armor: '#2f3b48', accent: '#6b7a88', pants: '#23292f', helmet: '#262f3a', visor: '#bfe8ff' },
    android: { skin: '#d29b7c', hair: '#2a1b12', vest: '#4a6b5c', shirt: '#dfe6ee', pants: '#2d3436', lights: '#ff3b3b' },
    convict: { skin: '#d29b7c', pants: '#5a5a5a', mask: '#2d3436', tattoo: '#3a4a5a', chains: '#8c96a0', lights: '#ff3b3b' },
    psych: { skin: '#f2d2bd', hair: '#1c1c1c', coat: '#dfe6ee', shirt: '#2c3e50', drone: '#6b7682', lights: '#3bb8ff' },
    bounty: { skin: '#d29b7c', hair: '#2a2420', armor: '#4b4f55', shirt: '#2d3436', dog: '#5a5f66', lights: '#ff3b3b' },
    captain: { skin: '#d29b7c', hair: '#2a1b12', armor: '#2c3e50', shirt: '#4b3d2a', gloves: '#2d3436', lights: '#3bb8ff' },
    survivor: { skin: '#e8c4a8', hair: '#c9a86a', armor: '#3b3a36', shirt: '#6b5a44', pants: '#3a3530', lights: '#ff8c3b' },
    xeno: { skin: '#5a3a28', hair: '#cfd3d6', coat: '#2f3a52', shirt: '#e8e8e8', gear: '#7a8694', lights: '#ffb347' },
};

// Parametric humanoids for the expansion crew. Each spec names the paint zone used by a body part and
// lists the accessories that make the character recognisable (see CHARACTERS[*].zones in cards.mjs).
const SPECS = {
    pilot:     { legs: 'suit', boots: 'gloves', torso: 'suit', arms: 'suit', hands: 'gloves', hair: 'shortSwept', hairZone: 'hair', pads: 'armor', harness: 'gloves', furCoat: 'suit', fur: '#d9cdb0', vneck: true, monocle: 'visor', headset: 'armor', pistolR: true, rifleBack: true, lights: 'visor', female: true, bust: 1.1, build: 'athletic' },
    hacker:    { legs: 'jacket', boots: 'pants', torso: 'jacket', arms: 'jacket', hands: 'pants', hood: 'hood', cowl: true, faceMask: true, cyberArms: 'pants', chestArmor: 'pants', cables: 'gear', smartGun: true, lights: 'lights', female: true, bust: 0, build: 'slim' },
    scientist: { legs: 'pants', boots: 'pants', torso: 'shirt', coat: 'coat', arms: 'coat', hands: 'skin', hair: 'shortSwept', hairZone: 'hair', goggles: 'lights', glasses: true, harness: 'shirt', tablet: true, scanner: true, beard: 'hair', wheelchair: true, build: 'slim' },
    medic:     { legs: 'pants', boots: 'pants', torso: '#5f6873', underV: true, coat: 'coat', openCoat: true, arms: 'coat', hands: 'skin', hair: 'longLoose', hairZone: 'hair', cap: 'cap', gasMask: true, syringeGun: true, redCross: 'lights', female: true, bust: 1.3, build: 'slim' },
    janitor:   { legs: 'overall', boots: 'gloves', torso: 'overall', arms: 'overall', hands: 'gloves', hair: 'beardOnly', hairZone: 'hair', mustache: 'hair', cap: 'cap', toolBelt: true, vacuum: true, cigarette: true, patch: 'lights' },   // lean grey-bearded old man, backpack vacuum, cigarette
    ceo:       { legs: 'shirt', boots: 'coat', torso: 'shirt', robe: 'coat', arms: 'coat', hands: 'skin', hair: 'shortSwept', hairZone: 'hair', tie: 'coat', pistolR: true, robot: true, build: 'slim' },
    labrat:    { legs: 'pants', boots: 'skin', torso: 'gown', arms: 'skin', hands: 'skin', hair: 'longLoose', hairZone: 'hair', blindfold: 'bandage', implants: 'lights', gown: 'gown', qrPatch: true, barefoot: true, female: true, bust: 0, build: 'slim' },
    sentry:    { custom: 'sentry' },
    android:   { legs: 'pants', boots: 'pants', torso: 'shirt', vest: 'vest', bustZone: 'vest', arms: 'shirt', hands: 'skin', hair: 'bun', hairZone: 'hair', implants: 'lights', eyes: '#f4f8ff', female: true, pistolR: true, build: 'slim' },
    convict:   { legs: 'pants', boots: 'pants', torso: 'skin', arms: 'skin', hands: 'skin', bald: true, muzzle: 'mask', tattoos: 'tattoo', plates: 'mask', chains: 'chains', build: 'bulky', eyeLight: 'lights' },
    psych:     { legs: 'shirt', boots: 'shirt', torso: 'shirt', vest: 'coat', arms: 'shirt', hands: 'skin', hair: 'bobBangs', hairZone: 'hair', glasses: true, drone: 'drone', headsetTech: 'drone', female: true, build: 'slim' },   // two hovering sensor drones, no shoulder arm
    bounty:    { legs: 'shirt', boots: 'armor', torso: 'shirt', arms: 'shirt', hands: 'armor', hair: 'shortBeard', hairZone: 'hair', fullBeard: 'hair', pads: 'armor', harness: 'armor', chestPlate: 'armor', rifleHands: true, husky: 'dog', build: 'bulky' },
    captain:   { legs: 'shirt', boots: 'gloves', torso: 'shirt', arms: 'shirt', hands: 'gloves', hair: 'shortBeard', hairZone: 'hair', heavyVest: 'armor', cigarette: true, revolver: true, shoulderLamp: 'lights', build: 'athletic' },
    survivor:  { legs: 'pants', boots: 'armor', torso: 'shirt', arms: 'shirt', forearms: 'skin', hands: 'armor', hair: 'shaggyBob', hairZone: 'hair', bandana: true, chestPlate: 'armor', harness: 'armor', pistolR: true, slingL: true, radioPack: 'armor', female: true, bust: 0, build: 'athletic' },   // sleeves rolled up, right glove, left arm bandaged in a neck sling, radio backpack
    xeno:      { legs: 'coat', boots: 'coat', torso: 'shirt', denimVest: 'coat', piping: 'shirt', arms: 'coat', forearms: 'skin', hands: 'skin', hair: 'afroPony', hairZone: 'hair', glasses: true, scanArm: 'gear', armHarness: true, vial: true, female: true, build: 'slim' },   // lab shirt under a short-sleeved denim jacket, afro ponytail, scanner arm strapped to the belt
};
// Fixed (non-paintable) materials
const FIXED = { gun: '#23282e', gunLight: '#4a525c', steel: '#8c96a0', darkSteel: '#3a424b', rubber: '#1a1d21', glass: '#9fd8ff', strap: '#3b3127' };

/** Apply the Lab Rat's presets without changing her patient silhouette or the shared spec. */
function labratSpec(parts) {
    return { ...SPECS.labrat,
        hair: { loose: 'longLoose', messy: 'labMessy', ponytail: 'labPonytail' }[parts.hair],
        labBlindfold: parts.eyes, labGown: parts.outfit, labImplants: parts.implants,
    };
}

// Hair changes only the requested character's copy; the canonical specs are never mutated.
function crewSpec(charId, parts) {
    const spec = SPECS[charId] || SPECS.pilot;
    // These roles replace whole pieces in the humanoid builder; keep the original specs intact.
    if (charId === 'pilot') return { ...spec, pilotParts: parts };
    if (charId === 'hacker') return { ...spec, hackerParts: parts };
    if (charId === 'scientist') return { ...spec, scientistParts: parts };
    const hair = {
        medic: { tied: 'crewPony', wavy: 'labMessy' },
        ceo: { spiky: 'shortSpiky', side: 'shortSide' },
        android: { tied: 'crewPony', bob: 'bobBangs' },
        psych: { layered: 'bobLayered', long: 'crewLongBangs' },
        bounty: { swept: 'shortSwept', spiky: 'shortSpiky' },
        captain: { swept: 'shortSwept', spiky: 'shortSpiky' },
        survivor: { wavy: 'labMessy', long: 'longLoose' },
        xeno: { loosecurl: 'curly', longtail: 'afroLongPony' },
    }[charId]?.[parts.hair];
    return hair ? { ...spec, hair, crewChin: charId === 'captain' } : spec;
}

/**
 * Build a character. Returns { root, zones: {zoneId: [meshes]}, setColors(colors) }. Height ≈ 2.1.
 * `parts` chooses independent mesh presets for characters with a workshop.
 */
export function buildCharacter(scene, charId, colors = {}, parts = {}) {
    const S = scene;
    const root = new (B().TransformNode)('char_' + charId, S);
    const zones = {};
    const fixed = [];
    const Z = (zone, mesh) => { (zones[zone] = zones[zone] || []).push(mesh); return mesh; };
    const F = (hex, mesh, opts) => { fixed.push([mesh, hex, opts]); return mesh; };
    const bx = (...a) => box(S, ...a), cy = (...a) => cyl(S, ...a), sp = (...a) => sphere(S, ...a), sp_ = sp;

    const selectedParts = characterParts(charId, parts);
    const roleContext = { scene: S, root, zones, Z, F, bx, cy, sp, fixed: FIXED };
    // Mark meshes belonging to a replaceable part. This also makes it possible to verify that a
    // non-original choice really replaces the original instead of merely covering or decorating it.
    const part = (slot, variant, build) => {
        const before = new Set(root.getChildMeshes());
        build();
        for (const mesh of root.getChildMeshes()) if (!before.has(mesh)) {
            mesh.metadata = { ...mesh.metadata, appearancePart: { character: charId, slot, variant } };
            // Wheel anchors have a reserved name used by the seated animation rig.
            if (variant !== 'classic' && mesh.name !== 'wheel') mesh.name = `crew_${charId}_${slot}`;
        }
    };
    if (charId === 'soldier') buildSoldier(selectedParts);
    else if (charId === 'scout') buildScout(selectedParts);
    else if (charId === 'mechanic') buildMechanic(selectedParts);
    else if (charId === 'sentry') buildSentry(selectedParts);
    else buildHumanoid(charId === 'labrat' ? labratSpec(selectedParts) : crewSpec(charId, selectedParts));
    if (!['soldier', 'scout', 'mechanic', 'pilot', 'hacker', 'scientist', 'labrat', 'sentry'].includes(charId)) {
        addCrewDetails(charId, selectedParts, roleContext);
    }

    // ---------------------------------------------------------------------------------------
    function buildHumanoid(sp) {
        const R = root; const LZ = sp.lights || 'lights';
        const W = (sp.build === 'bulky' ? 1.18 : sp.build === 'stocky' ? 1.1 : sp.build === 'athletic' ? 1.05 : 1.0) * (sp.female ? 0.9 : 1);   // width factor
        // legs & boots
        for (const s of [-1, 1]) {
            if (!sp.barefoot) { Z(sp.boots, bx(0.22 * W, 0.14, 0.36, R, s * 0.15 * W, 0.07, 0.04)); Z(sp.boots, bx(0.22 * W, 0.3, 0.24, R, s * 0.15 * W, 0.28, 0)); }
            else { Z('skin', bx(0.18, 0.1, 0.32, R, s * 0.14, 0.05, 0.04)); Z('skin', bx(0.18, 0.34, 0.2, R, s * 0.15 * W, 0.26, 0)); }   // bare feet + shins
            Z(sp.legs, bx(0.21 * W, 0.5, 0.22, R, s * 0.15 * W, 0.68, 0));
            Z(sp.legs, bx(0.23 * W, 0.46, 0.24, R, s * 0.15 * W, 1.14, 0));
        }
        Z(sp.legs, bx(0.52 * W, 0.2, 0.28, R, 0, 1.4, 0));
        F(FIXED.strap, bx(0.56 * W, 0.08, 0.32, R, 0, 1.5, 0));                 // belt
        F(FIXED.steel, bx(0.1, 0.08, 0.04, R, 0, 1.5, 0.17));
        // torso
        const T = (m) => sp.torso[0] === '#' ? F(sp.torso, m) : Z(sp.torso, m);   // torso zone, or a fixed colour
        const torso = T(bx(0.54 * W, 0.64, 0.32, R, 0, 1.86, 0));
        if (sp.scientistParts) torso.name = 'scientist_torso';
        if (sp.female) { const bf = sp.bust == null ? 1 : sp.bust; if (bf > 0) { const m = bx(0.46 * W, 0.24 * bf, 0.16 * bf, R, 0, 1.98, 0.14 + 0.08 * bf); if (sp.bustZone) Z(sp.bustZone, m); else T(m); } Z(sp.legs, bx(0.6 * W, 0.22, 0.34, R, 0, 1.36, 0)); }   // chest and hips
        if (sp.underV || sp.vneck) { Z('skin', bx(0.16 * W, 0.16, 0.04, R, 0, 2.1, 0.16)); Z('skin', bx(0.08 * W, 0.1, 0.04, R, 0, 2.0, 0.17)); }   // open neckline
        if (sp.furCoat) {   // thick fur coat: one solid collar ring, solid cuffs and a fur hem, coat body over the torso
            const buildOriginalCoat = () => {
                const FUR = sp.fur || '#d9cdb0';
                Z(sp.furCoat, bx(0.62 * W, 0.66, 0.4, R, 0, 1.82, -0.02));                    // coat body (slightly bulkier than the torso)
                for (const s of [-1, 1]) Z(sp.furCoat, bx(0.24 * W, 0.5, 0.36, R, s * 0.19 * W, 1.26, -0.04));   // coat skirt
                F(FUR, bx(0.7 * W, 0.16, 0.5, R, 0, 2.18, -0.04));                             // fur collar ring
                F(FUR, bx(0.26 * W, 0.2, 0.52, R, 0, 2.3, -0.1));                              // raised fur at the nape
                for (const s of [-1, 1]) F(FUR, bx(0.16 * W, 0.4, 0.08, R, s * 0.12 * W, 1.96, 0.21, [0, 0, -s * 0.12]));   // fur lapels
                for (const s of [-1, 1]) F(FUR, bx(0.22 * W, 0.14, 0.24, R, s * 0.39 * W, 1.28, 0.02));   // fur cuffs
                F(FUR, bx(0.64 * W, 0.1, 0.42, R, 0, 1.0, -0.04));                             // fur hem
            };
            if (sp.pilotParts) part('coat', sp.pilotParts.coat, () => {
                if (sp.pilotParts.coat === 'classic') buildOriginalCoat();
                else pilotVariant('coat', sp.pilotParts.coat, roleContext, W);
            });
            else buildOriginalCoat();
        }
        if (sp.robe) {   // long closed mantle with a high pointed collar
            Z(sp.robe, bx(0.6 * W, 0.72, 0.1, R, 0, 1.84, -0.2)); Z(sp.robe, bx(0.6 * W, 0.7, 0.08, R, 0, 1.84, 0.18));
            for (const s of [-1, 1]) { Z(sp.robe, bx(0.1, 0.72, 0.34, R, s * 0.3 * W, 1.84, 0)); Z(sp.robe, bx(0.3 * W, 0.9, 0.3, R, s * 0.15 * W, 1.02, -0.06)); }   // sides + skirts to the shins
            Z(sp.robe, bx(0.62 * W, 0.08, 0.38, R, 0, 2.2, -0.02));
            Z(sp.robe, bx(0.5 * W, 0.2, 0.08, R, 0, 2.26, -0.2));                                     // stand-up collar back (half height, below the chin)
            for (const s of [-1, 1]) { Z(sp.robe, bx(0.08, 0.22, 0.3, R, s * 0.23 * W, 2.27, -0.04, [0, 0, s * 0.08])); Z(sp.robe, bx(0.2, 0.18, 0.06, R, s * 0.16 * W, 2.23, 0.14, [0, s * 0.35, s * 0.18])); }   // lapels wrapping the neck
            for (const s of [-1, 1]) F('#c9c3a6', bx(0.03, 0.17, 0.03, R, s * 0.1 * W, 2.22, 0.19, [0, 0, s * 0.3]));   // light trim edge
        }
        if (sp.heavyVest) {   // massive plated vest with built-up shoulder blocks
            Z(sp.heavyVest, bx(0.6 * W, 0.6, 0.2, R, 0, 1.86, 0.2)); Z(sp.heavyVest, bx(0.6 * W, 0.6, 0.14, R, 0, 1.86, -0.2));
            Z(sp.heavyVest, bx(0.46 * W, 0.26, 0.1, R, 0, 1.98, 0.32)); F(FIXED.darkSteel, bx(0.3 * W, 0.16, 0.08, R, 0, 1.66, 0.32));
            for (const s of [-1, 1]) { Z(sp.heavyVest, bx(0.34 * W, 0.26, 0.4, R, s * 0.4 * W, 2.16, 0)); F(FIXED.darkSteel, bx(0.3 * W, 0.08, 0.36, R, s * 0.42 * W, 2.3, 0)); Z(sp.heavyVest, bx(0.22 * W, 0.3, 0.3, R, s * 0.42 * W, 1.94, 0.02)); }
            for (let i = 0; i < 3; i++) F(FIXED.darkSteel, bx(0.1, 0.12, 0.06, R, -0.16 * W + i * 0.16 * W, 1.56, 0.26));
        }
        if (sp.piping) { for (const s of [-1, 1]) Z(sp.piping, bx(0.03, 0.66, 0.02, R, s * 0.1 * W, 1.84, 0.245)); Z(sp.piping, bx(0.5 * W, 0.03, 0.02, R, 0, 1.52, 0.245)); for (const s of [-1, 1]) Z(sp.piping, bx(0.03, 0.4, 0.02, R, s * 0.39 * W, 1.84, 0.1)); }   // light seams on a dark coat
        if (sp.vest) { Z(sp.vest, bx(0.5 * W, 0.5, 0.1, R, 0, 1.84, 0.18)); Z(sp.vest, bx(0.5 * W, 0.5, 0.08, R, 0, 1.84, -0.18)); for (const s of [-1, 1]) Z(sp.vest, bx(0.08, 0.5, 0.36, R, s * 0.25 * W, 1.84, 0)); }
        if (sp.coat) {   // long open coat: back panel + two front flaps + tails
            const original = () => {
                Z(sp.coat, bx(0.58 * W, 0.7, 0.1, R, 0, 1.82, -0.2));
                for (const s of [-1, 1]) Z(sp.coat, bx(0.16 * W, 0.68, 0.1, R, s * 0.21 * W, 1.84, 0.19));
                for (const s of [-1, 1]) Z(sp.coat, bx(0.2 * W, 0.6, 0.08, R, s * 0.2 * W, 1.22, -0.17));
                for (const s of [-1, 1]) Z(sp.coat, bx(0.1, 0.68, 0.34, R, s * 0.27 * W, 1.84, 0));   // side panels (no gaps)
                if (sp.openCoat) { for (const s of [-1, 1]) Z(sp.coat, bx(0.1, 0.22, 0.1, R, s * 0.2 * W, 2.2, 0.1, [0, s * 0.5, 0])); }   // open lapels, neck free
                else Z(sp.coat, bx(0.6 * W, 0.08, 0.36, R, 0, 2.2, -0.02));             // collar
            };
            if (sp.scientistParts) part('coat', sp.scientistParts.coat, () => {
                if (sp.scientistParts.coat === 'classic') original();
                else scientistVariant('coat', sp.scientistParts.coat, roleContext, W);
            });
            else original();
        }
        if (sp.denimVest) {   // short-sleeved denim jacket thrown over the shirt: back, two open front flaps, side panels, short sleeves, collar
            Z(sp.denimVest, bx(0.58 * W, 0.6, 0.1, R, 0, 1.86, -0.2));
            for (const s of [-1, 1]) { Z(sp.denimVest, bx(0.11 * W, 0.58, 0.1, R, s * 0.24 * W, 1.86, 0.19)); Z(sp.denimVest, bx(0.1, 0.58, 0.34, R, s * 0.27 * W, 1.86, 0)); }   // narrow flaps leave the white shirt visible
            for (const s of [-1, 1]) Z(sp.denimVest, bx(0.21 * W, 0.26, 0.23, R, s * 0.38 * W, 1.92, 0));                 // short sleeves to mid-upper-arm
            for (const s of [-1, 1]) Z(sp.denimVest, bx(0.12, 0.2, 0.1, R, s * 0.2 * W, 2.2, 0.1, [0, s * 0.5, 0]));        // open collar
            F('#c9a24a', bx(0.08, 0.08, 0.02, R, 0.2 * W, 2.0, 0.245)); F('#c9a24a', bx(0.06, 0.06, 0.02, R, -0.2 * W, 1.78, 0.245));   // yellow badges
        }
        if (sp.chestPlate) { Z(sp.chestPlate, bx(0.42 * W, 0.3, 0.12, R, 0, 1.96, 0.2)); Z(sp.chestPlate, bx(0.36 * W, 0.18, 0.1, R, 0, 1.7, 0.2)); }
        if (sp.harness) { for (const s of [-1, 1]) Z(sp.harness, bx(0.08, 0.6, 0.04, R, s * 0.14 * W, 1.86, 0.18)); Z(sp.harness, bx(0.5 * W, 0.06, 0.04, R, 0, 1.64, 0.18)); for (let i = 0; i < 3; i++) F(FIXED.darkSteel, bx(0.08, 0.1, 0.06, R, -0.2 * W + i * 0.2 * W, 1.6, 0.2)); }
        if (sp.tie) { Z('shirt', bx(0.14, 0.3, 0.03, R, 0, 1.98, sp.robe ? 0.23 : 0.18)); F('#7a1f1f', bx(0.06, 0.28, 0.02, R, 0, 1.9, sp.robe ? 0.25 : 0.2)); }
        if (sp.redCross) { Z(sp.redCross, bx(0.12, 0.04, 0.02, R, 0.16 * W, 2.0, 0.2)); Z(sp.redCross, bx(0.04, 0.12, 0.02, R, 0.16 * W, 2.0, 0.2)); }
        if (sp.patch) { Z(sp.patch, cy(0.16, 0.16, 0.02, 8, R, 0.16 * W, 1.95, 0.17, [Math.PI / 2, 0, 0])); }
        if (sp.tattoos) { for (let i = 0; i < 4; i++) Z(sp.tattoos, bx(0.14, 0.03, 0.02, R, -0.12 * W + (i % 2) * 0.24 * W, 1.7 + i * 0.1, 0.17)); for (const s of [-1, 1]) Z(sp.tattoos, bx(0.03, 0.3, 0.02, R, s * 0.42 * W, 1.84, 0.1)); }
        if (sp.gown) {   // patient gown: the Lab Rat always keeps its short sleeves and ID tag
            let skirt;
            if (sp.labGown === 'long') skirt = Z(sp.gown, bx(0.58 * W, 0.82, 0.36, R, 0, 1.14, 0));
            else if (sp.labGown === 'torn') {
                skirt = Z(sp.gown, bx(0.58 * W, 0.38, 0.36, R, 0, 1.36, 0));
                // Four irregular cloth flaps really change the silhouette, rather than just painting damage.
                // Keep them under a stationary hem node so the automatic leg rig cannot tear the gown apart.
                const hem = new (B().TransformNode)('lab_gown_hem', S); hem.parent = R;
                for (const [x, width, height] of [[-0.2175, 0.145, 0.25], [-0.0725, 0.145, 0.14], [0.0725, 0.145, 0.32], [0.2175, 0.145, 0.19]]) {
                    Z(sp.gown, bx(width * W, height, 0.36, hem, x * W, 1.17 - height / 2, 0));
                }
            } else skirt = Z(sp.gown, bx(0.58 * W, 0.5, 0.36, R, 0, 1.3, 0));
            if (sp.labGown) skirt.name = 'lab_gown';
            for (const s of [-1, 1]) Z(sp.gown, bx(0.2 * W, 0.26, 0.26, R, s * 0.36 * W, 2.04, 0));
            F(FIXED.strap, bx(0.5 * W, 0.04, 0.02, R, 0, 1.62, 0.18));
        }
        if (sp.qrPatch) { F('#f4f6f8', bx(0.18, 0.18, 0.02, R, 0.1, 1.9, 0.17)); for (let i = 0; i < 9; i++) if (i % 4 !== 1) F('#1a1d21', bx(0.04, 0.04, 0.01, R, 0.05 + (i % 3) * 0.05, 1.95 - Math.floor(i / 3) * 0.05, 0.18)); }   // QR tag printed on the chest
        if (sp.plates) {   // riveted square plates bolted onto the skin
            const P = [[0.3, 2.14, 0.0, 0.22, 0.1, 0.3], [-0.3, 2.14, 0.0, 0.22, 0.1, 0.3], [0.14, 1.96, 0.18, 0.16, 0.16, 0.04], [-0.14, 1.96, 0.18, 0.16, 0.16, 0.04], [0, 1.74, 0.18, 0.2, 0.14, 0.04], [0.42, 1.86, 0.02, 0.06, 0.18, 0.18], [-0.42, 1.86, 0.02, 0.06, 0.18, 0.18], [0.42, 1.48, 0.04, 0.06, 0.16, 0.16], [-0.42, 1.48, 0.04, 0.06, 0.16, 0.16], [0, 2.22, -0.1, 0.24, 0.1, 0.14], [0.2, 1.86, -0.17, 0.18, 0.2, 0.04], [-0.2, 1.86, -0.17, 0.18, 0.2, 0.04], [-0.3, 1.7, 0.17, 0.14, 0.12, 0.04], [0.3, 1.7, 0.17, 0.14, 0.12, 0.04]];
            for (const [x, y, z, w, h, d] of P) { Z(sp.plates, bx(w * W, h, d, R, x * W, y, z)); F(FIXED.steel, bx(0.03, 0.03, 0.03, R, x * W + (w > 0.1 ? 0.04 : 0), y + (h > 0.12 ? 0.05 : 0), z + d / 2 * (z >= 0 ? 1 : -1))); }
        }
        if (sp.shaggy) {   // ragged fur mantle over the shoulders and hood rim
            for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2, rr = 0.36 * W; Z(sp.shaggy, bx(0.1, 0.22 + (i % 3) * 0.08, 0.1, R, Math.cos(a) * rr, 2.08 - (i % 2) * 0.06, Math.sin(a) * rr * 0.7, [0, -a, (i % 2 ? 0.3 : -0.2)])); }
            for (let i = 0; i < 6; i++) T(bx(0.09, 0.3 + (i % 2) * 0.12, 0.08, R, -0.25 * W + i * 0.1 * W, 1.3 - (i % 3) * 0.05, -0.17));   // torn cloak hem
        }
        if (sp.suitLines) { for (const s of [-1, 1]) { Z(sp.suitLines, bx(0.02, 0.5, 0.02, R, s * 0.12 * W, 1.84, 0.165)); Z(sp.suitLines, bx(0.02, 0.9, 0.02, R, s * 0.15 * W, 0.9, 0.12)); Z(sp.suitLines, bx(0.02, 0.36, 0.02, R, s * 0.39 * W, 1.84, 0.1)); } }   // glowing seams of the implanted bodysuit
        if (sp.backpack) { Z(sp.backpack, bx(0.4 * W, 0.5, 0.2, R, 0, 1.84, -0.28)); Z(LZ, bx(0.06, 0.06, 0.03, R, 0.1, 2.0, -0.4)); }
        // arms
        for (const s of [-1, 1]) {
            const pad = sp.pads;
            if (pad) Z(pad, bx(0.28 * W, 0.18, 0.3, R, s * 0.38 * W, 2.12, 0));
            if (sp.hackerParts) {
                part('arms', sp.hackerParts.arms, () => {
                    if (sp.hackerParts.arms === 'classic') {
                        Z(sp.arms, bx(0.17 * W, 0.42, 0.19, R, s * 0.38 * W, 1.84, 0));
                        Z(sp.forearms || sp.arms, bx(0.15 * W, 0.4, 0.17, R, s * 0.39 * W, 1.44, 0.02));
                        Z(sp.hands, bx(0.14, 0.14, 0.14, R, s * 0.39 * W, 1.2, 0.03));
                    } else hackerVariant('arm', sp.hackerParts.arms, roleContext, W, s);
                });
                continue;
            }
            const upper = Z(sp.arms, bx(0.17 * W, 0.42, 0.19, R, s * 0.38 * W, 1.84, 0));
            if (sp.slingL && s === -1) continue;                                                   // left forearm is in the sling (drawn below)
            const forearm = Z(sp.forearms || sp.arms, bx(0.15 * W, 0.4, 0.17, R, s * 0.39 * W, 1.44, 0.02));
            const hand = Z(sp.hands, bx(0.14, 0.14, 0.14, R, s * 0.39 * W, 1.2, 0.03));
            if (sp.scientistParts) {
                const side = s < 0 ? 'L' : 'R';
                upper.name = 'scientist_upper_' + side; forearm.name = 'scientist_forearm_' + side; hand.name = 'scientist_hand_' + side;
            }
        }
        if (sp.slingL) {   // bandaged left forearm bent across the chest, hung from a bandage looped around the neck
            const BND = '#d9d2c2';
            F(BND, bx(0.17 * W, 0.24, 0.19, R, -0.38 * W, 1.66, 0.02));                                   // bandage wrap on the elbow
            F(BND, bx(0.44 * W, 0.14, 0.14, R, -0.14 * W, 1.66, 0.22, [0, 0, 0.12]));                     // forearm across the belly
            F(BND, bx(0.14, 0.14, 0.14, R, 0.1 * W, 1.7, 0.22));                                          // bandaged hand
            for (const s of [-1, 1]) F(BND, bx(0.05, 0.56, 0.03, R, s * 0.1 * W, 1.96, 0.25, [0, 0, -s * 0.22]));   // sling straps from the neck down to the forearm
            F(BND, bx(0.2, 0.05, 0.2, R, 0, 2.22, 0));                                                    // loop around the neck
        }
        if (sp.radioPack) {   // field radio backpack: boxy unit, whip antenna, dials, handset on a coiled cable
            Z(sp.radioPack, bx(0.4 * W, 0.46, 0.22, R, 0, 1.86, -0.28)); F(FIXED.darkSteel, bx(0.3 * W, 0.12, 0.06, R, 0, 2.0, -0.41));
            for (let i = 0; i < 3; i++) Z(LZ, bx(0.04, 0.04, 0.02, R, -0.08 + i * 0.08, 1.98, -0.445)); F(FIXED.steel, cy(0.05, 0.05, 0.03, 8, R, 0.1, 1.8, -0.4, [Math.PI / 2, 0, 0]));
            F(FIXED.steel, cy(0.02, 0.02, 0.9, 4, R, -0.16 * W, 2.5, -0.34)); F(FIXED.steel, bx(0.06, 0.1, 0.06, R, -0.16 * W, 2.06, -0.34));   // antenna + base
            for (const s of [-1, 1]) F(FIXED.strap, bx(0.07, 0.6, 0.03, R, s * 0.16 * W, 1.86, 0.17));                                        // shoulder straps
            F(FIXED.darkSteel, bx(0.08, 0.14, 0.06, R, 0.22 * W, 2.06, 0.16)); for (let i = 0; i < 4; i++) F(FIXED.rubber, bx(0.03, 0.03, 0.03, R, 0.24 * W + (i % 2) * 0.03, 2.14 + i * 0.03, 0.1 - i * 0.05));   // handset + coiled cable
        }
        if (sp.cyberArms && (!sp.hackerParts || sp.hackerParts.arms === 'classic')) {   // original cybernetic arms
            const original = () => { for (const s of [-1, 1]) {
                Z(sp.cyberArms, bx(0.18 * W, 0.42, 0.2, R, s * 0.39 * W, 1.44, 0.02)); F(FIXED.steel, bx(0.2 * W, 0.06, 0.22, R, s * 0.39 * W, 1.56, 0.02)); F(FIXED.steel, bx(0.2 * W, 0.06, 0.22, R, s * 0.39 * W, 1.3, 0.02));
                F(FIXED.darkSteel, cy(0.1, 0.1, 0.2, 6, R, s * 0.39 * W, 1.66, 0.02, [0, 0, Math.PI / 2]));   // elbow joint
                Z(LZ, bx(0.02, 0.26, 0.02, R, s * 0.39 * W, 1.44, 0.125)); F(FIXED.steel, bx(0.16, 0.1, 0.16, R, s * 0.39 * W, 1.2, 0.03));
                F(FIXED.steel, bx(0.06, 0.24, 0.06, R, s * 0.47 * W, 1.84, 0.0)); Z(LZ, bx(0.02, 0.1, 0.02, R, s * 0.48 * W, 1.84, 0.0));   // upper-arm implant rail
            } };
            if (sp.hackerParts) part('arms', 'classic', original); else original();
        }
        if (sp.chestArmor) {   // sternum armour plate sewn into the bodysuit
            const original = () => {
                Z(sp.chestArmor, bx(0.36 * W, 0.34, 0.08, R, 0, 1.96, 0.18)); F(FIXED.darkSteel, bx(0.3 * W, 0.08, 0.04, R, 0, 2.06, 0.23)); F(FIXED.darkSteel, bx(0.3 * W, 0.08, 0.04, R, 0, 1.86, 0.23));
                Z(LZ, bx(0.1, 0.03, 0.02, R, 0, 1.96, 0.235)); for (const s of [-1, 1]) Z(sp.chestArmor, bx(0.1, 0.26, 0.06, R, s * 0.24 * W, 2.04, 0.17));
            };
            if (sp.hackerParts) part('vest', sp.hackerParts.vest, () => {
                if (sp.hackerParts.vest === 'classic') original();
                else hackerVariant('vest', sp.hackerParts.vest, roleContext, W);
            });
            else original();
        }
        if (sp.cables) { for (let i = 0; i < 3; i++) F(FIXED.rubber, cy(0.03, 0.03, 0.5, 5, R, -0.3 * W + i * 0.05, 1.98, -0.3 - i * 0.04, [0.4, 0, 0.3])); Z(sp.cables, bx(0.12, 0.08, 0.06, R, -0.2 * W, 2.18, -0.3)); }
        if (sp.toolBelt) { for (let i = 0; i < 3; i++) F(FIXED.steel, bx(0.06, 0.14, 0.06, R, -0.22 * W + i * 0.1, 1.42, 0.17)); F(FIXED.strap, bx(0.14, 0.16, 0.1, R, 0.26 * W, 1.4, 0.12)); }
        if (sp.shoulderLamp) Z(sp.shoulderLamp, bx(0.08, 0.06, 0.06, R, -0.38 * W, 2.2, 0.12));
        // The seated Scientist's neck bridges the small gap between the original head and torso.
        const neck = Z('skin', bx(0.14, sp.scientistParts ? 0.16 : 0.1, 0.14, R, 0, 2.2, 0));
        // The Hacker's original mask had skin-coloured gaps at the temples and cheeks. Keep the
        // original geometry but make the underlying balaclava opaque for every mask option.
        const headMesh = bx(0.3, 0.34, 0.3, R, 0, 2.44, 0.02);
        const head = sp.hackerParts ? F(FIXED.rubber, headMesh) : Z('skin', headMesh);
        if (sp.hackerParts) head.name = 'hacker_face_underlay';
        if (sp.scientistParts) { neck.name = 'scientist_neck_joint'; head.name = 'scientist_head'; }
        if (!sp.respirator && !sp.faceMask && !sp.bandana) Z('skin', bx(0.06, 0.06, 0.05, R, 0, 2.42, 0.18));    // nose (hidden under masks)
        const H = sp.hairZone || 'hair';
        const buildOriginalHair = () => {
            switch (sp.hair) {
                case 'shortSwept': Z(H, bx(0.32, 0.1, 0.32, R, 0, 2.64, 0.0)); Z(H, bx(0.3, 0.08, 0.12, R, 0, 2.67, 0.12)); Z(H, bx(0.32, 0.14, 0.1, R, 0, 2.52, -0.14)); break;
                case 'shortSpiky': Z(H, bx(0.32, 0.08, 0.32, R, 0, 2.63, 0.0)); for (let i = 0; i < 4; i++) Z(H, bx(0.06, 0.12, 0.06, R, -0.1 + i * 0.07, 2.72, -0.02 + (i % 2) * 0.06)); break;
                case 'shortSide':
                    Z(H, bx(0.32, 0.1, 0.32, R, 0, 2.64, 0)); Z(H, bx(0.32, 0.14, 0.1, R, 0, 2.52, -0.14));
                    Z(H, bx(0.28, 0.1, 0.11, R, -0.025, 2.66, 0.14, [0, 0, -0.16]));
                    Z(H, bx(0.08, 0.18, 0.12, R, -0.15, 2.56, 0.13, [0, 0, -0.16])); break;
                case 'crewPony':
                    Z(H, bx(0.34, 0.1, 0.34, R, 0, 2.64, 0)); Z(H, bx(0.32, 0.27, 0.08, R, 0, 2.49, -0.16));
                    Z(H, bx(0.16, 0.14, 0.14, R, 0, 2.51, -0.22)); Z(H, bx(0.14, 0.48, 0.14, R, 0.015, 2.23, -0.26, [0, 0, 0.07]));
                    for (const side of [-1, 1]) Z(H, bx(0.055, 0.3, 0.15, R, side * 0.17, 2.45, 0.06));
                    F(FIXED.strap, bx(0.16, 0.05, 0.15, R, 0, 2.46, -0.24)); break;
                case 'bobLayered':
                    Z(H, bx(0.34, 0.12, 0.34, R, 0, 2.64, 0)); Z(H, bx(0.34, 0.1, 0.08, R, 0, 2.56, 0.16));
                    Z(H, bx(0.34, 0.4, 0.1, R, 0, 2.37, -0.16));
                    for (const side of [-1, 1]) { Z(H, bx(0.07, 0.38, 0.29, R, side * 0.19, 2.38, -0.01, [0, 0, side * 0.12])); Z(H, bx(0.045, 0.22, 0.07, R, side * 0.14, 2.48, 0.16, [0, 0, side * 0.15])); } break;
                case 'crewLongBangs':
                    Z(H, bx(0.34, 0.1, 0.34, R, 0, 2.64, 0)); Z(H, bx(0.34, 0.56, 0.1, R, 0, 2.36, -0.16));
                    Z(H, bx(0.32, 0.1, 0.08, R, 0, 2.56, 0.16));
                    for (const side of [-1, 1]) Z(H, bx(0.08, 0.5, 0.3, R, side * 0.19, 2.38, -0.03)); break;
                case 'afroLongPony':
                    Z(H, bx(0.36, 0.14, 0.36, R, 0, 2.66, 0));
                    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; Z(H, bx(0.12, 0.12, 0.12, R, Math.sin(a) * 0.16, 2.64 + (i % 2) * 0.08, Math.cos(a) * 0.14 - 0.02)); }
                    for (let i = 0; i < 5; i++) Z(H, bx(0.17 - (i % 2) * 0.03, 0.14, 0.17, R, (i % 2) * 0.04 - 0.02, 2.5 - i * 0.1, -0.27));
                    F(FIXED.strap, bx(0.14, 0.05, 0.14, R, 0, 2.56, -0.22)); break;
                case 'longLoose': Z(H, bx(0.34, 0.1, 0.34, R, 0, 2.64, 0.0)); Z(H, bx(0.34, 0.56, 0.1, R, 0, 2.36, -0.16)); for (const s of [-1, 1]) Z(H, bx(0.08, 0.5, 0.3, R, s * 0.19, 2.38, -0.03)); break;   // back slab and side locks reach up into the cap, no bare strip
                case 'labMessy':   // long uneven locks, not a different haircut
                    Z(H, bx(0.35, 0.12, 0.34, R, 0, 2.65, 0.0));
                    Z(H, bx(0.3, 0.56, 0.1, R, 0, 2.36, -0.16));
                    Z(H, bx(0.09, 0.52, 0.26, R, -0.2, 2.36, -0.03, [0, 0, -0.1]));
                    Z(H, bx(0.09, 0.62, 0.26, R, 0.2, 2.31, -0.03, [0, 0, 0.1]));
                    for (const [x, y, height, tilt] of [[-0.11, 2.33, 0.5, -0.09], [0, 2.29, 0.58, 0.04], [0.11, 2.34, 0.48, 0.1]])
                        Z(H, bx(0.075, height, 0.045, R, x, y, -0.22, [0, 0, tilt]));
                    Z(H, bx(0.07, 0.17, 0.06, R, -0.1, 2.59, 0.16, [0, 0, -0.18]));
                    Z(H, bx(0.05, 0.13, 0.05, R, 0.08, 2.61, 0.16, [0, 0, 0.14])); break;
                case 'labPonytail':   // loosely gathered at the nape, with strands escaping around the face
                    Z(H, bx(0.34, 0.1, 0.34, R, 0, 2.64, 0.0));
                    Z(H, bx(0.32, 0.3, 0.09, R, 0, 2.49, -0.16));
                    Z(H, bx(0.14, 0.14, 0.13, R, 0, 2.52, -0.22));
                    Z('bandage', bx(0.15, 0.045, 0.14, R, 0, 2.48, -0.24));
                    Z(H, bx(0.14, 0.42, 0.13, R, 0.025, 2.25, -0.26, [0, 0, 0.12]));
                    Z(H, bx(0.065, 0.29, 0.1, R, -0.18, 2.45, 0.08, [0, 0, -0.08]));
                    Z(H, bx(0.055, 0.36, 0.1, R, 0.18, 2.42, 0.08, [0, 0, 0.08])); break;
                case 'bun': Z(H, bx(0.33, 0.1, 0.33, R, 0, 2.64, 0.0)); Z(H, bx(0.34, 0.08, 0.1, R, 0, 2.6, 0.14)); Z(H, bx(0.3, 0.3, 0.08, R, 0, 2.46, -0.16)); Z(H, bx(0.16, 0.16, 0.16, R, 0, 2.68, -0.14)); for (const s of [-1, 1]) Z(H, bx(0.05, 0.26, 0.2, R, s * 0.17, 2.46, -0.02)); break;
                case 'ponytail': Z(H, bx(0.32, 0.1, 0.32, R, 0, 2.64, 0.0)); Z(H, bx(0.1, 0.1, 0.1, R, 0, 2.6, -0.2)); Z(H, bx(0.08, 0.4, 0.08, R, 0, 2.38, -0.22)); break;
                case 'bobBangs': Z(H, bx(0.34, 0.12, 0.34, R, 0, 2.64, 0.0)); Z(H, bx(0.34, 0.1, 0.08, R, 0, 2.56, 0.16)); Z(H, bx(0.34, 0.3, 0.1, R, 0, 2.42, -0.16)); for (const s of [-1, 1]) Z(H, bx(0.06, 0.3, 0.3, R, s * 0.18, 2.42, 0.0)); break;
                case 'shaggyBob': Z(H, bx(0.44, 0.12, 0.44, R, 0, 2.64, -0.02));                                                           // wide cap the flared slabs hang from
                    Z(H, bx(0.44, 0.4, 0.1, R, 0, 2.46, -0.25, [-0.3, 0, 0]));                                                              // back slab, pivoting outwards from the cap
                    for (const s of [-1, 1]) { Z(H, bx(0.1, 0.4, 0.36, R, s * 0.26, 2.46, -0.04, [0, 0, -s * 0.3])); Z(H, bx(0.1, 0.3, 0.12, R, s * 0.24, 2.5, 0.14, [0.1, 0, -s * 0.35])); }   // side slabs flare out and down like a wedge
                    Z(H, bx(0.34, 0.1, 0.08, R, 0.02, 2.58, 0.17, [0, 0, 0.15])); break;   // fringe
                case 'afroPony': Z(H, bx(0.36, 0.14, 0.36, R, 0, 2.66, 0.0)); for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; Z(H, bx(0.12, 0.12, 0.12, R, Math.sin(a) * 0.16, 2.64 + (i % 2) * 0.08, Math.cos(a) * 0.14 - 0.02)); }
                    for (let i = 0; i < 3; i++) Z(H, bx(0.16 - (i % 2) * 0.03, 0.14, 0.16 - (i % 2) * 0.03, R, (i % 2) * 0.04 - 0.02, 2.5 - i * 0.1, -0.26));   // curls gathered into a short puffy ponytail at the nape
                    F(FIXED.strap, bx(0.14, 0.05, 0.14, R, 0, 2.56, -0.22)); break;
                case 'shortBeard': Z(H, bx(0.32, 0.1, 0.32, R, 0, 2.64, 0.0)); Z(H, bx(0.28, 0.12, 0.08, R, 0, 2.3, 0.14)); break;
                case 'curly': Z(H, bx(0.38, 0.16, 0.38, R, 0, 2.66, 0.0)); for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; Z(H, bx(0.12, 0.12, 0.12, R, Math.sin(a) * 0.17, 2.6 + (i % 2) * 0.1, Math.cos(a) * 0.17 - 0.02)); } break;
                case 'beardOnly': Z(H, bx(0.28, 0.16, 0.1, R, 0, 2.28, 0.14)); Z(H, bx(0.3, 0.06, 0.3, R, 0, 2.62, 0.0)); break;
            }
        };
        if (sp.pilotParts) part('hair', sp.pilotParts.hair, () => {
            if (sp.pilotParts.hair === 'classic') buildOriginalHair();
            else pilotVariant('hair', sp.pilotParts.hair, roleContext, W);
        });
        else buildOriginalHair();
        if (sp.crewChin) Z(H, bx(0.28, 0.12, 0.08, R, 0, 2.3, 0.14));   // the Captain keeps his beard with every haircut
        if (sp.beard) Z(sp.beard, bx(0.26, 0.08, 0.06, R, 0, 2.3, 0.16));
        if (sp.mustache) { Z(sp.mustache, bx(0.22, 0.05, 0.05, R, 0, 2.38, 0.18)); for (const s of [-1, 1]) Z(sp.mustache, bx(0.05, 0.24, 0.14, R, s * 0.16, 2.4, 0.04)); }   // moustache + sideburns
        // head gear
        if (sp.cap) { Z(sp.cap, bx(0.34, 0.1, 0.34, R, 0, 2.66, 0.0)); Z(sp.cap, bx(0.3, 0.03, 0.16, R, 0, 2.62, 0.24)); }
        if (sp.hood && sp.cowl) {   // soft hood: rounded top, draped sides widening down to the shoulders, merging into the suit
            const original = () => {
                Z(sp.hood, bx(0.36, 0.14, 0.36, R, 0, 2.66, -0.06)); Z(sp.hood, bx(0.4, 0.3, 0.1, R, 0, 2.46, -0.2));
                for (const s of [-1, 1]) { Z(sp.hood, bx(0.06, 0.34, 0.34, R, s * 0.19, 2.46, -0.04)); Z(sp.hood, bx(0.1, 0.22, 0.34, R, s * 0.24, 2.22, -0.08, [0, 0, s * 0.35])); }
                Z(sp.hood, bx(0.54, 0.14, 0.4, R, 0, 2.2, -0.1)); Z(sp.hood, bx(0.3, 0.16, 0.08, R, 0, 2.16, 0.15, [0.5, 0, 0]));
                Z(sp.hood, bx(0.4, 0.06, 0.14, R, 0, 2.7, 0.14, [-0.4, 0, 0]));
            };
            if (sp.hackerParts) part('hood', sp.hackerParts.hood, () => {
                if (sp.hackerParts.hood === 'classic') original();
                else hackerVariant('hood', sp.hackerParts.hood, roleContext, W);
            });
            else original();
        } else if (sp.hood) { Z(sp.hood, bx(0.4, 0.42, 0.4, R, 0, 2.5, -0.04)); Z(sp.hood, bx(0.46, 0.1, 0.46, R, 0, 2.28, -0.02)); Z(sp.hood, bx(0.44, 0.08, 0.2, R, 0, 2.7, 0.14)); if (!sp.faceMask) { F(FIXED.rubber, bx(0.3, 0.26, 0.04, R, 0, 2.46, 0.17)); Z('skin', bx(0.26, 0.2, 0.05, R, 0, 2.4, 0.19)); for (const s of [-1, 1]) Z(LZ, bx(0.04, 0.03, 0.02, R, s * 0.07, 2.46, 0.22)); } }
        if (sp.faceMask) {   // full dark face plate with glowing seams (no skin visible)
            const original = () => {
                F(FIXED.rubber, bx(0.28, 0.12, 0.06, R, 0, 2.53, 0.17)); F(FIXED.rubber, bx(0.22, 0.14, 0.07, R, 0, 2.4, 0.18)); F(FIXED.rubber, bx(0.14, 0.1, 0.06, R, 0, 2.29, 0.17));
                for (const s of [-1, 1]) F(FIXED.rubber, bx(0.06, 0.2, 0.1, R, s * 0.13, 2.42, 0.12, [0, s * 0.4, 0]));
                for (const s of [-1, 1]) Z(LZ, bx(0.07, 0.02, 0.02, R, s * 0.07, 2.49, 0.215)); Z(LZ, bx(0.02, 0.12, 0.02, R, 0, 2.38, 0.22));
            };
            if (sp.hackerParts) part('mask', sp.hackerParts.mask, () => {
                if (sp.hackerParts.mask === 'classic') original();
                else hackerVariant('mask', sp.hackerParts.mask, roleContext, W);
            });
            else original();
        }
        if (sp.respirator) {   // half-mask covering nose and mouth, two filter cans, strap around the head
            F(FIXED.darkSteel, bx(0.3, 0.24, 0.14, R, 0, 2.31, 0.15)); F(FIXED.rubber, bx(0.18, 0.08, 0.06, R, 0, 2.42, 0.2));
            for (const s of [-1, 1]) { F(FIXED.steel, cy(0.12, 0.12, 0.08, 6, R, s * 0.13, 2.27, 0.22, [Math.PI / 2, 0, 0])); F(FIXED.rubber, cy(0.09, 0.09, 0.02, 6, R, s * 0.13, 2.27, 0.27, [Math.PI / 2, 0, 0])); }
            F(FIXED.rubber, bx(0.34, 0.04, 0.34, R, 0, 2.42, 0.0));
        }
        if (sp.helmet) { Z(sp.helmet, bx(0.38, 0.3, 0.38, R, 0, 2.58, 0.0)); Z(sp.helmet, bx(0.38, 0.14, 0.1, R, 0, 2.42, -0.18)); }
        if (sp.nightVision) { F(FIXED.darkSteel, bx(0.2, 0.1, 0.12, R, 0, 2.5, 0.22)); for (const x of [-0.08, 0, 0.08]) { F(FIXED.darkSteel, cy(0.07, 0.07, 0.12, 6, R, x, 2.48, 0.3, [Math.PI / 2, 0, 0])); Z(sp.nightVision, cy(0.05, 0.05, 0.02, 6, R, x, 2.48, 0.37, [Math.PI / 2, 0, 0])); } }
        if (sp.monocle) {
            const original = () => { F(FIXED.darkSteel, bx(0.14, 0.1, 0.03, R, 0.1, 2.48, 0.18)); Z(sp.monocle, bx(0.1, 0.06, 0.02, R, 0.1, 2.48, 0.2)); F(FIXED.darkSteel, bx(0.04, 0.04, 0.2, R, 0.17, 2.5, 0.08)); };
            if (sp.pilotParts) part('optics', sp.pilotParts.optics, () => {
                if (sp.pilotParts.optics === 'classic') original();
                else pilotVariant('optics', sp.pilotParts.optics, roleContext, W);
            });
            else original();
        }
        if (sp.headset) {
            const original = () => { for (const s of [-1, 1]) Z(sp.headset, bx(0.06, 0.12, 0.1, R, s * 0.17, 2.44, 0.0)); Z(sp.headset, bx(0.36, 0.04, 0.06, R, 0, 2.66, -0.04)); };
            if (sp.pilotParts) part('headset', sp.pilotParts.headset, () => {
                if (sp.pilotParts.headset === 'classic') original();
                else pilotVariant('headset', sp.pilotParts.headset, roleContext, W);
            });
            else original();
        }
        if (sp.headsetTech) { Z(sp.headsetTech, bx(0.06, 0.16, 0.12, R, 0.18, 2.46, 0.0)); Z(LZ, bx(0.03, 0.04, 0.04, R, 0.22, 2.5, 0.04)); F(FIXED.steel, bx(0.03, 0.03, 0.2, R, 0.18, 2.54, 0.1)); }
        if (sp.goggles) {
            const original = () => { F(FIXED.darkSteel, bx(0.3, 0.08, 0.04, R, 0, 2.62, 0.16)); for (const s of [-1, 1]) Z(sp.goggles, cy(0.09, 0.09, 0.03, 8, R, s * 0.08, 2.62, 0.18, [Math.PI / 2, 0, 0])); };
            if (sp.scientistParts) part('goggles', sp.scientistParts.goggles, () => {
                if (sp.scientistParts.goggles === 'classic') original();
                else scientistVariant('goggles', sp.scientistParts.goggles, roleContext, W);
            });
            else original();
        }
        if (sp.glasses) { F(FIXED.rubber, bx(0.3, 0.02, 0.02, R, 0, 2.47, 0.17)); for (const s of [-1, 1]) F(FIXED.glass, bx(0.1, 0.08, 0.02, R, s * 0.08, 2.46, 0.18), { alpha: 0.6, spec: 0.8 }); }
        if (sp.gasMask) { F(FIXED.darkSteel, bx(0.26, 0.16, 0.1, R, 0, 2.34, 0.16)); for (const s of [-1, 1]) F(FIXED.steel, cy(0.1, 0.1, 0.06, 6, R, s * 0.1, 2.32, 0.23, [Math.PI / 2, 0, 0])); }
        if (sp.blindfold) {   // cloth, never a technological visor: the eyes stay covered in every variant
            const height = sp.labBlindfold === 'wide' ? 0.18 : 0.1;
            const band = Z(sp.blindfold, bx(0.33, height, 0.33, R, 0, 2.48, 0.02));
            if (sp.labBlindfold) band.name = 'lab_blindfold';
            Z(sp.blindfold, bx(0.08, 0.2, 0.03, R, -0.1, 2.28, -0.17));
            if (sp.labBlindfold === 'layered') {
                const upper = Z(sp.blindfold, bx(0.32, 0.055, 0.025, R, 0, 2.525, 0.195)); upper.rotation.z = -0.07;
                const lower = Z(sp.blindfold, bx(0.32, 0.055, 0.03, R, 0, 2.445, 0.2)); lower.rotation.z = 0.06;
            } else if (sp.labBlindfold === 'tails') {
                // Lay the ties over the gathered ponytail instead of burying them inside it.
                const back = sp.hair === 'labPonytail' ? -0.35 : -0.24;
                Z(sp.blindfold, bx(0.1, 0.09, 0.06, R, 0, 2.48, back + 0.02));
                const left = Z(sp.blindfold, bx(0.065, 0.5, 0.035, R, -0.075, 2.23, back)); left.name = 'lab_blindfold_tail'; left.rotation.z = -0.08;
                const right = Z(sp.blindfold, bx(0.065, 0.38, 0.035, R, 0.075, 2.29, back)); right.name = 'lab_blindfold_tail'; right.rotation.z = 0.1;
            }
        }
        if (sp.mask) { Z(sp.mask, bx(0.3, 0.16, 0.08, R, 0, 2.36, 0.16)); for (let i = 0; i < 3; i++) F(FIXED.rubber, bx(0.03, 0.08, 0.02, R, -0.06 + i * 0.06, 2.34, 0.21)); Z(sp.mask, bx(0.34, 0.08, 0.1, R, 0, 2.46, 0.13)); }
        if (sp.eyeLight) Z(sp.eyeLight, bx(0.05, 0.03, 0.02, R, 0.08, 2.48, 0.18));
        if (sp.bald) Z('skin', bx(0.3, 0.06, 0.3, R, 0, 2.62, 0.02));
        if (sp.implants && (!sp.labImplants || sp.labImplants === 'classic')) {
            Z(sp.implants, bx(0.04, 0.04, 0.02, R, 0, 2.54, 0.18)); Z(sp.implants, bx(0.03, 0.1, 0.03, R, 0.16, 2.44, 0.0)); F(FIXED.steel, bx(0.06, 0.12, 0.04, R, -0.17, 2.44, 0.0));
        }
        if (sp.labImplants === 'temples') {   // small sockets protrude just beyond the hair at both temples
            for (const s of [-1, 1]) {
                F(FIXED.steel, cy(0.09, 0.09, 0.045, 8, R, s * 0.235, 2.5, 0.06, [0, 0, Math.PI / 2]));
                Z(sp.implants, cy(0.045, 0.045, 0.01, 8, R, s * 0.26, 2.5, 0.06, [0, 0, Math.PI / 2]));
            }
        } else if (sp.labImplants === 'neck') {   // connectors at the neck, not armour or a collar
            for (const s of [-1, 1]) {
                F(FIXED.darkSteel, bx(0.07, 0.1, 0.06, R, s * 0.08, 2.21, 0.09));
                Z(sp.implants, bx(0.035, 0.055, 0.02, R, s * 0.08, 2.22, 0.13));
                F(FIXED.steel, bx(0.025, 0.13, 0.025, R, s * 0.08, 2.12, 0.16));
            }
        } else if (sp.labImplants === 'wrapped') {   // bandage strips partially cover the exposed connections
            for (const s of [-1, 1]) {
                F(FIXED.steel, bx(0.05, 0.12, 0.08, R, s * 0.23, 2.49, 0.06));
                Z(sp.implants, bx(0.02, 0.07, 0.04, R, s * 0.26, 2.49, 0.06));
                Z('bandage', bx(0.055, 0.035, 0.14, R, s * 0.26, 2.51, 0.06, [0, 0, s * 0.12]));
            }
        }
        if (sp.eyes) { for (const s of [-1, 1]) F(sp.eyes, bx(0.06, 0.035, 0.02, R, s * 0.07, 2.47, 0.175), { emissive: 1.0 }); F(FIXED.rubber, bx(0.2, 0.012, 0.015, R, 0, 2.5, 0.178)); }   // two glowing eyes under a thin brow line
        // hand-held props
        for (const side of [sp.pistolR || sp.revolver ? 1 : 0, sp.pistolL ? -1 : 0]) {
            if (!side) continue;
            // held at the side: grip in the fist, barrel pointing down along the arm (slightly forward)
            const g = new (B().TransformNode)('gun', S); g.parent = R; g.position.set(side * 0.39 * W, 1.16, 0.1); g.rotation.x = 1.25;
            const original = () => {
                F(FIXED.gun, bx(0.06, 0.1, 0.36, g, 0, 0.04, 0.16)); F(FIXED.gunLight, bx(0.08, 0.14, 0.12, g, 0, -0.02, 0));
                if (sp.revolver && side === 1) { F(FIXED.steel, cy(0.1, 0.1, 0.08, 6, g, 0, 0.06, 0.1, [0, 0, Math.PI / 2])); F(FIXED.gun, cy(0.03, 0.03, 0.3, 6, g, 0, 0.06, 0.3, [Math.PI / 2, 0, 0])); }
                Z(LZ, bx(0.03, 0.03, 0.03, g, 0, 0.1, 0.1));
            };
            if (sp.pilotParts && side === 1) part('sidearm', sp.pilotParts.sidearm, () => {
                if (sp.pilotParts.sidearm === 'classic') original();
                else pilotVariant('sidearm', sp.pilotParts.sidearm, roleContext, W, g);
            });
            else original();
        }
        if (sp.smartGun) {
            const g = new (B().TransformNode)('gun', S); g.parent = R; g.position.set(0.39 * W, 1.16, 0.1); g.rotation.x = 1.25;
            const original = () => { Z(sp.cables || 'gear', bx(0.08, 0.12, 0.4, g, 0, 0.04, 0.18)); F(FIXED.darkSteel, bx(0.1, 0.06, 0.2, g, 0, 0.12, 0.3)); Z(LZ, bx(0.09, 0.03, 0.2, g, 0, 0.11, 0.2)); F(FIXED.gunLight, bx(0.08, 0.14, 0.12, g, 0, -0.02, 0)); F(FIXED.rubber, cy(0.02, 0.02, 0.5, 4, R, 0.3 * W, 1.5, -0.1, [0.6, 0, 0.4])); };
            if (sp.hackerParts) part('smartgun', sp.hackerParts.smartgun, () => {
                if (sp.hackerParts.smartgun === 'classic') original();
                else hackerVariant('smartgun', sp.hackerParts.smartgun, roleContext, W, null, g);
            });
            else original();
        }
        if (sp.rifleBack) { F(FIXED.gun, bx(0.08, 1.1, 0.12, R, 0.2 * W, 1.9, -0.26, [0, 0, 0.3])); F(FIXED.gunLight, bx(0.1, 0.3, 0.14, R, 0.1 * W, 1.6, -0.26, [0, 0, 0.3])); }
        if (sp.rifleHands || sp.shotgun) {
            const g = new (B().TransformNode)('gun', S); g.parent = R; g.position.set(0, 1.3, 0.5); g.rotation.y = -0.25;
            F(FIXED.gun, bx(1.1, 0.12, 0.1, g, 0, 0, 0)); F(FIXED.gunLight, bx(0.36, 0.2, 0.14, g, -0.15, 0.02, 0)); F(FIXED.gun, bx(0.24, 0.26, 0.1, g, -0.55, -0.1, 0));
            if (sp.shotgun) { F(FIXED.gun, cy(0.06, 0.06, 0.6, 6, g, 0.55, 0.03, 0, [0, 0, Math.PI / 2])); F(FIXED.gun, cy(0.06, 0.06, 0.6, 6, g, 0.55, -0.04, 0, [0, 0, Math.PI / 2])); }
            else { F(FIXED.gun, cy(0.05, 0.05, 0.5, 6, g, 0.6, 0.02, 0, [0, 0, Math.PI / 2])); F(FIXED.darkSteel, bx(0.3, 0.08, 0.06, g, 0.05, 0.14, 0)); Z(LZ, bx(0.06, 0.04, 0.04, g, 0.2, 0.15, 0)); }
        }
        if (sp.pipe) { F(FIXED.steel, cy(0.05, 0.05, 1.0, 6, R, 0.42 * W, 1.5, 0.1, [0, 0, 0.15])); F(FIXED.darkSteel, bx(0.1, 0.1, 0.1, R, 0.42 * W, 1.98, 0.08)); }
        if (sp.vacuum) {   // backpack vacuum cleaner: canister on the back, straps, hose running to a wand in the left hand
            F(FIXED.darkSteel, cy(0.2, 0.2, 0.62, 8, R, 0, 1.78, -0.34)); F(FIXED.steel, cy(0.22, 0.22, 0.06, 8, R, 0, 2.1, -0.34)); F(FIXED.steel, cy(0.22, 0.22, 0.06, 8, R, 0, 1.46, -0.34));
            F(FIXED.steel, bx(0.1, 0.12, 0.1, R, 0.1, 2.2, -0.34)); Z(LZ, bx(0.04, 0.04, 0.02, R, 0.1, 2.2, -0.28));   // motor cap + status light
            for (const s of [-1, 1]) F(FIXED.strap, bx(0.06, 0.5, 0.04, R, s * 0.18 * W, 1.86, 0.17, [0.0, 0, 0]));       // shoulder straps
            for (const [a, b] of [[[-0.12, 2.1, -0.42], [-0.42 * W, 1.9, -0.3]], [[-0.42 * W, 1.9, -0.3], [-0.46 * W, 1.4, 0.0]], [[-0.46 * W, 1.4, 0.0], [-0.4 * W, 1.16, 0.16]]]) {
                const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], len = Math.hypot(dx, dy, dz);
                const m = cy(0.05, 0.05, len, 6, R, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
                m.rotationQuaternion = B().Quaternion.FromUnitVectorsToRef(new (B().Vector3)(0, 1, 0), new (B().Vector3)(dx / len, dy / len, dz / len), new (B().Quaternion)());
                F(FIXED.rubber, m);
            }
            F(FIXED.steel, cy(0.04, 0.04, 0.8, 6, R, -0.4 * W, 0.78, 0.26, [0.25, 0, 0]));                                     // wand
            F(FIXED.darkSteel, bx(0.3, 0.06, 0.12, R, -0.4 * W, 0.4, 0.36));                                                  // floor nozzle
        }
        if (sp.wrench) { F(FIXED.steel, bx(0.06, 0.5, 0.04, R, -0.4 * W, 1.0, 0.1)); F(FIXED.steel, bx(0.18, 0.08, 0.05, R, -0.4 * W, 0.74, 0.1)); for (const s of [-1, 1]) F(FIXED.steel, bx(0.05, 0.1, 0.05, R, -0.4 * W + s * 0.065, 0.66, 0.1)); F(FIXED.darkSteel, bx(0.08, 0.14, 0.06, R, -0.4 * W, 1.18, 0.1)); }   // handle, head with open jaws
        if (sp.scanner) {   // hand scanner (right hand)
            const original = () => { F(FIXED.darkSteel, bx(0.1, 0.1, 0.26, R, 0.39 * W, 1.22, 0.18)); Z(LZ, cy(0.06, 0.06, 0.02, 6, R, 0.39 * W, 1.24, 0.32, [Math.PI / 2, 0, 0])); };
            if (sp.scientistParts) part('scanner', sp.scientistParts.scanner, () => {
                if (sp.scientistParts.scanner === 'classic') original();
                else scientistVariant('scanner', sp.scientistParts.scanner, roleContext, W);
            });
            else original();
        }
        if (sp.fullBeard) { Z(sp.fullBeard, bx(0.3, 0.18, 0.1, R, 0, 2.26, 0.14)); Z(sp.fullBeard, bx(0.06, 0.26, 0.26, R, 0.15, 2.36, 0.04)); Z(sp.fullBeard, bx(0.06, 0.26, 0.26, R, -0.15, 2.36, 0.04)); }
        if (sp.tablet) {   // tablet held tilted in the left hand
            const original = () => { F(FIXED.darkSteel, bx(0.3, 0.03, 0.22, R, -0.38 * W, 1.26, 0.18, [0.5, 0, 0])); Z(LZ, bx(0.24, 0.012, 0.16, R, -0.38 * W, 1.28, 0.18, [0.5, 0, 0])); };
            if (sp.scientistParts) part('tablet', sp.scientistParts.tablet, () => {
                if (sp.scientistParts.tablet === 'classic') original();
                else scientistVariant('tablet', sp.scientistParts.tablet, roleContext, W);
            });
            else original();
        }
        if (sp.syringeGun) {   // injector pistol in the left hand: grip, body, glass vial on top, needle
            const g = new (B().TransformNode)('gun', S); g.parent = R; g.position.set(-0.39 * W, 1.2, 0.14); g.rotation.x = 1.1;
            F(FIXED.gunLight, bx(0.08, 0.14, 0.12, g, 0, -0.02, 0)); F(FIXED.darkSteel, bx(0.08, 0.1, 0.32, g, 0, 0.05, 0.14));
            F(FIXED.glass, cy(0.07, 0.07, 0.2, 6, g, 0, 0.13, 0.12, [Math.PI / 2, 0, 0]), { alpha: 0.7, spec: 0.8 }); Z(LZ, cy(0.05, 0.05, 0.12, 6, g, 0, 0.13, 0.12, [Math.PI / 2, 0, 0]));
            F(FIXED.steel, cy(0.012, 0.012, 0.2, 4, g, 0, 0.05, 0.4, [Math.PI / 2, 0, 0]));
        }
        if (sp.muzzle) {   // steel muzzle: mouth cage with vertical bars, cheek plates, head strap
            Z(sp.muzzle, bx(0.26, 0.14, 0.06, R, 0, 2.33, 0.17)); Z(sp.muzzle, bx(0.14, 0.1, 0.08, R, 0, 2.3, 0.21));
            for (let i = 0; i < 4; i++) F(FIXED.steel, bx(0.025, 0.16, 0.02, R, -0.09 + i * 0.06, 2.33, 0.25));
            for (const s of [-1, 1]) { Z(sp.muzzle, bx(0.06, 0.16, 0.14, R, s * 0.16, 2.34, 0.1)); F(FIXED.steel, bx(0.04, 0.04, 0.04, R, s * 0.18, 2.36, 0.16)); }
            F(FIXED.strap, bx(0.34, 0.04, 0.34, R, 0, 2.4, 0.0));
        }
        if (sp.cigarette) { F('#f4f1e6', bx(0.03, 0.03, 0.16, R, 0.06, 2.34, 0.24, [0, -0.3, 0])); Z(LZ, bx(0.03, 0.03, 0.02, R, 0.085, 2.34, 0.315)); }
        if (sp.bandana) { F('#2b2a28', bx(0.3, 0.22, 0.1, R, 0, 2.36, 0.15)); F('#2b2a28', bx(0.34, 0.1, 0.34, R, 0, 2.36, 0.0)); F('#2b2a28', bx(0.12, 0.2, 0.04, R, 0.05, 2.22, -0.17)); }   // cloth covers nose and mouth   // cloth over nose and mouth, knotted at the back
        if (sp.vial) { F(FIXED.glass, cy(0.05, 0.05, 0.18, 6, R, 0.39 * W, 1.3, 0.14), { alpha: 0.7, spec: 0.8 }); Z(LZ, cy(0.035, 0.035, 0.1, 6, R, 0.39 * W, 1.27, 0.14)); F(FIXED.darkSteel, cy(0.05, 0.05, 0.03, 6, R, 0.39 * W, 1.4, 0.14)); }
        if (sp.syringe) { F(FIXED.glass, cy(0.03, 0.03, 0.26, 6, R, -0.39 * W, 1.24, 0.14, [0.9, 0, 0]), { alpha: 0.7 }); F(FIXED.steel, cy(0.01, 0.01, 0.16, 4, R, -0.39 * W, 1.15, 0.32, [0.9, 0, 0])); }
        if (sp.chains) { for (let i = 0; i < 5; i++) Z(sp.chains, bx(0.06, 0.04, 0.03, R, -0.2 + i * 0.1, 1.08 - Math.abs(i - 2) * 0.03, 0.06)); for (const s of [-1, 1]) Z(sp.chains, bx(0.18, 0.08, 0.18, R, s * 0.39 * W, 1.12, 0.03)); }
        // companions
        if (sp.scanArm) {   // single industrial probe arm as on the original art: backpack unit, two long jointed segments rising behind the right shoulder and arching high over the head, boxy scanner head with a red laser
            const seg = (a, b, r) => {   // cylinder segment between two points
                const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], len = Math.hypot(dx, dy, dz);
                const m = cy(r, r, len, 6, R, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
                m.rotationQuaternion = B().Quaternion.FromUnitVectorsToRef(new (B().Vector3)(0, 1, 0), new (B().Vector3)(dx / len, dy / len, dz / len), new (B().Quaternion)());
                return m;
            };
            const P0 = [0.18 * W, 2.12, -0.3], P1 = [0.24 * W, 2.98, -0.36], P2 = [0.2 * W, 3.34, 0.12], P3 = [0.16 * W, 3.16, 0.4];
            Z(sp.scanArm, bx(0.34 * W, 0.44, 0.16, R, 0, 1.8, -0.26)); F(FIXED.darkSteel, bx(0.12, 0.12, 0.1, R, 0.18 * W, 2.04, -0.3));   // backpack unit + mount
            F(FIXED.darkSteel, sp_(0.11, 6, R, ...P0)); Z(sp.scanArm, seg(P0, P1, 0.05)); F(FIXED.steel, seg([P0[0] + 0.07, P0[1] + 0.1, P0[2] - 0.06], [P1[0] + 0.07, P1[1] - 0.1, P1[2] - 0.06], 0.02));   // lower segment + hydraulic rod
            F(FIXED.darkSteel, sp_(0.11, 6, R, ...P1)); Z(sp.scanArm, seg(P1, P2, 0.05)); F(FIXED.darkSteel, sp_(0.09, 6, R, ...P2)); Z(sp.scanArm, seg(P2, P3, 0.04));   // elbow, upper segment arching forward, wrist
            const h = new (B().TransformNode)('scanHead', S); h.parent = R; h.position.set(P3[0], P3[1], P3[2]); h.rotation.x = 0.9;   // scanner head tilted down toward what she looks at
            Z(sp.scanArm, bx(0.16, 0.14, 0.24, h, 0, 0, 0.06)); F(FIXED.darkSteel, bx(0.1, 0.08, 0.08, h, 0, -0.1, 0.1)); F(FIXED.steel, bx(0.03, 0.08, 0.1, h, 0.1, 0, 0.14));   // body, under-lamp, side antenna
            Z(LZ, cy(0.05, 0.05, 0.02, 8, h, 0, 0, 0.19, [Math.PI / 2, 0, 0])); F('#ff3030', cy(0.02, 0.02, 0.02, 6, h, 0, -0.1, 0.15, [Math.PI / 2, 0, 0]), { emissive: 1.0 });   // lens + red laser emitter
            if (sp.armHarness) {   // crossed chest straps tie the back unit down to the belt
                for (const s of [-1, 1]) F(FIXED.strap, bx(0.07, 0.76, 0.03, R, s * 0.08 * W, 1.84, 0.255, [0, 0, s * 0.3]));
                F(FIXED.steel, bx(0.1, 0.1, 0.02, R, 0, 1.84, 0.27)); for (const s of [-1, 1]) F(FIXED.strap, bx(0.08, 0.5, 0.03, R, s * 0.18 * W, 1.74, -0.19));   // buckle, back straps down to the belt
            }
        }
        if (sp.drone) {   // two hovering sensor drones, one at each side of the head, lens facing forward, little side fins
            for (const [x, y, z] of [[-0.6, 2.7, 0.1], [0.58, 2.56, 0.0]]) {
                const d = new (B().TransformNode)('drone', S); d.parent = R; d.position.set(x, y, z);
                Z(sp.drone, sp_(0.28, 6, d, 0, 0, 0)); Z(LZ, cy(0.1, 0.1, 0.04, 8, d, 0, 0, 0.14, [Math.PI / 2, 0, 0]));
                for (const s of [-1, 1]) Z(sp.drone, bx(0.3, 0.03, 0.1, d, s * 0.22, 0.08, 0));
            }
        }
        if (sp.husky) {   // Laika-type working dog: upright ears, thick chest, curled tail, harness vest
            const d = new (B().TransformNode)('dog', S); d.parent = R; d.position.set(0.78 * W, 0, 0.2); d.rotation.y = -0.2;
            Z(sp.husky, bx(0.34, 0.36, 0.8, d, 0, 0.58, 0)); Z(sp.husky, bx(0.38, 0.3, 0.36, d, 0, 0.66, 0.3));               // body, deep chest
            F('#e9ecef', bx(0.26, 0.2, 0.5, d, 0, 0.42, 0.1));                                                                // white belly
            Z(sp.husky, bx(0.28, 0.26, 0.3, d, 0, 0.96, 0.46)); F('#e9ecef', bx(0.2, 0.16, 0.26, d, 0, 0.86, 0.6));              // head + white muzzle
            F(FIXED.rubber, bx(0.07, 0.05, 0.05, d, 0, 0.9, 0.74));                                                            // nose
            for (const s of [-1, 1]) { Z(sp.husky, bx(0.08, 0.2, 0.06, d, s * 0.1, 1.14, 0.42, [-0.15, 0, s * 0.2])); F('#3bb8ff', bx(0.04, 0.03, 0.02, d, s * 0.07, 0.98, 0.615)); }   // ears, pale eyes
            for (const [x, z] of [[-0.11, 0.3], [0.11, 0.3], [-0.11, -0.28], [0.11, -0.28]]) { Z(sp.husky, bx(0.1, 0.42, 0.1, d, x, 0.21, z)); F('#e9ecef', bx(0.11, 0.1, 0.11, d, x, 0.05, z)); }
            Z(sp.husky, bx(0.1, 0.1, 0.3, d, 0, 0.78, -0.5, [-1.1, 0, 0])); Z(sp.husky, bx(0.1, 0.22, 0.1, d, 0, 0.98, -0.52, [0.4, 0, 0]));   // curled-up tail
            F(FIXED.strap, bx(0.4, 0.26, 0.3, d, 0, 0.66, 0.02)); Z(LZ, bx(0.05, 0.05, 0.02, d, 0.1, 0.72, 0.18)); F(FIXED.darkSteel, bx(0.3, 0.06, 0.08, d, 0, 0.82, 0.3));   // armoured harness + collar
        }
        if (sp.dog) { const d = new (B().TransformNode)('dog', S); d.parent = R; d.position.set(0.72 * W, 0, 0.2); Z(sp.dog, bx(0.26, 0.3, 0.7, d, 0, 0.45, 0)); Z(sp.dog, bx(0.22, 0.22, 0.28, d, 0, 0.72, 0.4)); Z(sp.dog, bx(0.1, 0.14, 0.2, d, 0, 0.66, 0.58)); for (const s of [-1, 1]) Z(sp.dog, bx(0.06, 0.12, 0.05, d, s * 0.07, 0.88, 0.36)); for (const [x, z] of [[-0.08, 0.25], [0.08, 0.25], [-0.08, -0.25], [0.08, -0.25]]) Z(sp.dog, bx(0.08, 0.3, 0.08, d, x, 0.15, z)); Z(sp.dog, bx(0.05, 0.05, 0.3, d, 0, 0.6, -0.45, [-0.6, 0, 0])); F(FIXED.strap, bx(0.3, 0.08, 0.12, d, 0, 0.6, 0.2)); Z(LZ, bx(0.04, 0.04, 0.02, d, 0.05, 0.6, 0.27)); F(FIXED.rubber, bx(0.06, 0.04, 0.04, d, 0, 0.66, 0.69)); }
        if (sp.robot) {   // the CEO's bodyguard robot: slender mechanical frame — cylinder limbs with ball joints, narrow waist, small sensor head
            const r = new (B().TransformNode)('robot', S); r.parent = R; r.position.set(-0.95, 0, -0.1);
            const joint = (x, y, z) => F(FIXED.steel, sp_(0.2, 6, r, x, y, z));
            for (const s of [-1, 1]) {
                Z('robot', bx(0.22, 0.12, 0.4, r, s * 0.2, 0.06, 0.06));                                              // foot
                F(FIXED.darkSteel, cy(0.1, 0.12, 0.6, 6, r, s * 0.2, 0.42, 0)); joint(s * 0.2, 0.76, 0);                // shin, knee
                Z('robot', cy(0.14, 0.12, 0.6, 6, r, s * 0.2, 1.08, 0)); joint(s * 0.2, 1.4, 0);                      // thigh, hip
                F(FIXED.darkSteel, bx(0.08, 0.5, 0.06, r, s * 0.28, 1.1, -0.08));                                       // hydraulic rod
            }
            F(FIXED.darkSteel, bx(0.44, 0.16, 0.24, r, 0, 1.46, 0)); F(FIXED.darkSteel, cy(0.16, 0.2, 0.3, 6, r, 0, 1.66, 0));   // pelvis + spine column
            Z('robot', bx(0.6, 0.5, 0.36, r, 0, 2.04, 0)); Z('robot', bx(0.44, 0.22, 0.1, r, 0, 2.1, 0.22));             // chest + plate
            Z(LZ, bx(0.1, 0.03, 0.02, r, 0, 2.16, 0.28)); F(FIXED.darkSteel, bx(0.36, 0.3, 0.14, r, 0, 2.0, -0.22));    // indicator, back unit
            for (const s of [-1, 1]) {
                joint(s * 0.4, 2.26, 0); Z('robot', bx(0.26, 0.16, 0.3, r, s * 0.42, 2.32, 0));                          // shoulder joint + guard
                F(FIXED.darkSteel, cy(0.09, 0.08, 0.5, 6, r, s * 0.44, 1.96, 0.02)); joint(s * 0.44, 1.7, 0.02);          // upper arm, elbow
                Z('robot', cy(0.08, 0.1, 0.5, 6, r, s * 0.44, 1.42, 0.06)); F(FIXED.steel, bx(0.12, 0.14, 0.12, r, s * 0.44, 1.12, 0.08));   // forearm, hand
            }
            F(FIXED.darkSteel, cy(0.1, 0.12, 0.14, 6, r, 0, 2.36, 0.02));                                               // neck
            Z('robot', bx(0.26, 0.26, 0.3, r, 0, 2.56, 0.02)); Z(LZ, bx(0.2, 0.06, 0.02, r, 0, 2.58, 0.18)); Z(LZ, cy(0.08, 0.08, 0.02, 8, r, 0, 2.7, 0.16, [Math.PI / 2, 0, 0]));   // head, visor band, lamp
            F(FIXED.rubber, cy(0.04, 0.04, 0.4, 5, r, 0.1, 2.3, -0.2, [0.5, 0, 0]));                                      // cable from head to back
        }
        if (sp.wheelchair) seatInWheelchair(sp);
    }

    /** Re-pose a freshly built humanoid into a powered wheelchair: legs rebuilt bent, upper body lowered, chair added. */
    function seatInWheelchair(sp) {
        const R = root, DROP = 0.62;
        for (const c of R.getChildren()) {
            if (c.getClassName && c.getClassName() !== 'Mesh') { c.position.y -= DROP; continue; }
            if (c.position.y < 1.33 && c.position.z < 0.3 && Math.abs(c.position.x) < 0.3) { for (const k of Object.keys(zones)) zones[k] = zones[k].filter(m => m !== c); const i = fixed.findIndex(f => f[0] === c); if (i >= 0) fixed.splice(i, 1); c.dispose(); }
            else c.position.y -= DROP;
        }
        const seatY = 1.4 - DROP;   // top of the cushion
        for (const s of [-1, 1]) {
            Z(sp.legs, bx(0.22, 0.22, 0.5, R, s * 0.15, seatY + 0.02, 0.26));          // thighs forward
            Z(sp.legs, bx(0.2, 0.44, 0.2, R, s * 0.15, seatY - 0.3, 0.5));            // shins down
            Z(sp.boots, bx(0.22, 0.12, 0.34, R, s * 0.15, seatY - 0.56, 0.58));        // boots on the footrest
        }
        if (sp.scientistParts.chair !== 'classic') {
            // On the new chairs the forearms rest on the armrests and the hands actually reach
            // their instruments. Move complete instrument groups, not only their visible screens.
            for (const side of ['L', 'R']) {
                const forearm = R.getChildren().find(n => n.name === 'scientist_forearm_' + side);
                const hand = R.getChildren().find(n => n.name === 'scientist_hand_' + side);
                forearm.position.y = hand.position.y = 1.02;
                forearm.position.z = 0.2; forearm.rotation.x = Math.PI / 2;
                hand.position.z = 0.4;
            }
            for (const node of R.getChildren()) {
                const slot = node.metadata?.appearancePart?.slot;
                if (slot === 'scanner' || slot === 'tablet' || node.name === 'scientist_tablet') {
                    node.position.y += 0.44; node.position.z += 0.35;
                }
            }
        }
        part('chair', sp.scientistParts.chair, () => {
            if (sp.scientistParts.chair !== 'classic') {
                scientistVariant('chair', sp.scientistParts.chair, roleContext, 1, seatY);
                return;
            }
            const steel = FIXED.darkSteel, trim = FIXED.steel, hull = '#2a3550', pad = '#e6e9ec', orange = '#d9772a';
            // padded seat: white cushion, tall backrest with headrest and orange trim
            F(pad, bx(0.6, 0.12, 0.56, R, 0, seatY - 0.06, 0.05));
            F(pad, bx(0.62, 0.62, 0.14, R, 0, seatY + 0.26, -0.3)); F(pad, bx(0.36, 0.22, 0.12, R, 0, seatY + 0.7, -0.3));   // backrest + headrest
            F(orange, bx(0.64, 0.05, 0.16, R, 0, seatY + 0.58, -0.3)); F(orange, bx(0.1, 0.5, 0.15, R, 0.26, seatY + 0.26, -0.3));
            // armoured chassis: thick hull around the seat, side panels with vents, rear battery block, status lights
            F(hull, bx(0.8, 0.3, 0.8, R, 0, seatY - 0.3, 0.02));                             // hull body
            F(hull, bx(0.84, 0.16, 0.5, R, 0, seatY - 0.12, -0.1));                          // upper hull around the cushion
            F(hull, bx(0.7, 0.46, 0.16, R, 0, seatY + 0.1, -0.46));                          // rear equipment block
            F(steel, bx(0.3, 0.3, 0.1, R, 0, seatY + 0.06, -0.56)); Z(sp.lights || 'lights', bx(0.04, 0.2, 0.02, R, 0.1, seatY + 0.06, -0.62));   // rear panel + light strip
            for (const s of [-1, 1]) {
                F(steel, bx(0.06, 0.22, 0.5, R, s * 0.43, seatY - 0.3, 0.02));                       // side skirt
                for (let k = 0; k < 3; k++) F(FIXED.rubber, bx(0.02, 0.12, 0.05, R, s * 0.47, seatY - 0.3, -0.1 + k * 0.12));   // vents
                Z(sp.lights || 'lights', bx(0.02, 0.04, 0.16, R, s * 0.47, seatY - 0.2, 0.22));      // side indicator
                F(hull, bx(0.1, 0.1, 0.5, R, s * 0.4, seatY + 0.1, 0.0)); F(trim, bx(0.12, 0.03, 0.52, R, s * 0.4, seatY + 0.16, 0.0));   // armrests
                F(steel, bx(0.08, 0.24, 0.08, R, s * 0.4, seatY - 0.02, -0.2));
            }
            F(steel, bx(0.5, 0.04, 0.22, R, 0, seatY - 0.62, 0.6)); F(steel, bx(0.08, 0.3, 0.08, R, 0, seatY - 0.48, 0.5));   // footrest on a strut
            // big wide drive wheels with glowing rims, small front casters
            for (const s of [-1, 1]) {
                const w = cy(0.5, 0.5, 0.24, 14, R, s * 0.47, 0.5, -0.14, [0, 0, Math.PI / 2]); w.name = 'wheel'; F(FIXED.rubber, w);   // wide tyre
                F(hull, cy(0.36, 0.36, 0.26, 14, R, s * 0.47, 0.5, -0.14, [0, 0, Math.PI / 2]));
                Z(sp.lights || 'lights', cy(0.24, 0.24, 0.28, 14, R, s * 0.47, 0.5, -0.14, [0, 0, Math.PI / 2]));   // glowing rim
                F(steel, cy(0.1, 0.1, 0.32, 8, R, s * 0.47, 0.5, -0.14, [0, 0, Math.PI / 2]));                     // hub
                F(steel, bx(0.3, 0.1, 0.5, R, s * 0.47, 1.02, -0.14)); F(steel, bx(0.3, 0.06, 0.14, R, s * 0.47, 0.98, 0.16, [0.6, 0, 0]));   // mudguard
                const c = cy(0.2, 0.2, 0.1, 8, R, s * 0.3, 0.12, 0.5, [0, 0, Math.PI / 2]); c.name = 'wheel'; F(FIXED.rubber, c);   // front casters
                F(steel, bx(0.06, 0.2, 0.06, R, s * 0.3, 0.3, 0.5));
            }
            // controls: joystick on the right armrest (opposite the tablet), holo-projector on the left
            F(trim, bx(0.14, 0.06, 0.18, R, 0.4, seatY + 0.2, 0.2)); F(FIXED.rubber, cy(0.02, 0.02, 0.14, 6, R, 0.4, seatY + 0.3, 0.2)); Z(sp.lights || 'lights', sp_(0.04, 6, R, 0.4, seatY + 0.38, 0.2));
            F(trim, cy(0.06, 0.08, 0.04, 8, R, -0.4, seatY + 0.2, 0.22)); Z(sp.lights || 'lights', sp_(0.1, 8, R, -0.4, seatY + 0.36, 0.22));   // holographic globe
        });
    }

    // ---------------------------------------------------------------------------------------
    function buildSoldier(parts) {
        const R = root;
        // Massive boots and the selected leg armour; each alternative replaces the original plates.
        for (const s of [-1, 1]) {
            Z('pants', bx(0.34, 0.22, 0.46, R, s * 0.22, 0.11, 0.04));
            Z('pants', bx(0.3, 0.55, 0.32, R, s * 0.22, 0.48, 0));
            part('suit', parts.suit, () => {
                if (parts.suit === 'classic') {
                    Z('armor', bx(0.36, 0.42, 0.2, R, s * 0.22, 0.5, 0.16));
                    Z('armor', bx(0.34, 0.5, 0.36, R, s * 0.22, 0.98, 0));
                    Z('accent', bx(0.38, 0.14, 0.4, R, s * 0.22, 0.74, 0));
                } else soldierVariant('leg', parts.suit, roleContext, s);
            });
        }
        Z('pants', bx(0.7, 0.3, 0.46, R, 0, 1.28, 0));
        Z('armor', bx(0.78, 0.12, 0.52, R, 0, 1.4, 0));
        part('suit', parts.suit, () => {
            if (parts.suit === 'classic') {
                Z('armor', bx(0.84, 0.7, 0.56, R, 0, 1.8, 0));
                Z('armor', bx(0.7, 0.3, 0.2, R, 0, 1.95, 0.34));
                Z('accent', bx(0.3, 0.1, 0.06, R, 0, 2.02, 0.45));
                Z('visor', bx(0.14, 0.05, 0.03, R, 0, 2.02, 0.49));
                Z('armor', bx(0.5, 0.24, 0.2, R, 0, 1.62, 0.3));
                F(FIXED.darkSteel, bx(0.4, 0.5, 0.1, R, 0, 1.75, -0.33));
            } else soldierVariant('torso', parts.suit, roleContext);
        });
        part('pack', parts.pack, () => {
            if (parts.pack === 'classic') {
                Z('armor', bx(0.6, 0.6, 0.3, R, 0, 1.85, -0.5));
                for (const s of [-1, 1]) F(FIXED.steel, cy(0.16, 0.16, 0.7, 8, R, s * 0.18, 1.95, -0.7));
                for (const s of [-1, 1]) Z('accent', cy(0.17, 0.17, 0.08, 8, R, s * 0.18, 2.32, -0.7));
            } else soldierVariant('pack', parts.pack, roleContext);
        });
        for (const s of [-1, 1]) {
            part('shoulders', parts.shoulders, () => {
                if (parts.shoulders === 'classic') {
                    Z('armor', bx(0.44, 0.34, 0.5, R, s * 0.6, 2.12, 0));
                    Z('accent', bx(0.46, 0.08, 0.52, R, s * 0.6, 2.3, 0));
                } else soldierVariant('shoulders', parts.shoulders, roleContext, s);
            });
            part('suit', parts.suit, () => {
                if (parts.suit === 'classic') {
                    Z('armor', bx(0.3, 0.42, 0.3, R, s * 0.62, 1.78, 0.05));
                    Z('accent', bx(0.32, 0.08, 0.32, R, s * 0.62, 1.56, 0.05));
                    Z('armor', bx(0.28, 0.36, 0.3, R, s * 0.6, 1.36, 0.3, [-0.9, 0, 0]));
                } else soldierVariant('arm', parts.suit, roleContext, s);
            });
            Z('pants', bx(0.2, 0.18, 0.2, R, s * 0.58, 1.26, 0.56));
        }
        // The neck seal is common to all three spaceworthy helmets.
        Z('armor', cy(0.5, 0.56, 0.14, 8, R, 0, 2.22, 0));
        Z('visor', cy(0.6, 0.6, 0.06, 8, R, 0, 2.2, 0.02));
        part('helmet', parts.helmet, () => {
            if (parts.helmet === 'classic') {
                Z('skin', bx(0.3, 0.34, 0.3, R, 0, 2.5, 0.02));
                Z('hair', bx(0.32, 0.1, 0.32, R, 0, 2.7, 0.0));
                Z('skin', bx(0.08, 0.06, 0.06, R, 0, 2.48, 0.18));
                F(FIXED.glass, sp(0.62, 8, R, 0, 2.52, 0.02, [1, 1.05, 1]), { alpha: 0.35, spec: 0.8 });
                Z('armor', bx(0.2, 0.16, 0.18, R, 0, 2.82, -0.1));
                for (const s of [-1, 1]) { Z('armor', bx(0.1, 0.34, 0.4, R, s * 0.32, 2.5, -0.04)); Z('accent', bx(0.06, 0.1, 0.16, R, s * 0.36, 2.52, 0.0)); }
                Z('armor', bx(0.5, 0.36, 0.12, R, 0, 2.5, -0.26));
                for (const s of [-1, 1]) Z('visor', bx(0.06, 0.06, 0.06, R, s * 0.3, 2.6, 0.1));
            } else soldierVariant('helmet', parts.helmet, roleContext);
        });
        part('rifle', parts.rifle, () => {
            // Keeping the gun node preserves the existing recoil animation for every weapon.
            const gun = new (B().TransformNode)('gun', S); gun.parent = R; gun.position.set(0, 1.3, 0.62); gun.rotation.y = -0.2;
            if (parts.rifle === 'classic') {
                F(FIXED.gun, bx(1.5, 0.18, 0.14, gun, 0, 0, 0));
                F(FIXED.gunLight, bx(0.6, 0.26, 0.2, gun, -0.1, 0.02, 0));
                F(FIXED.gun, bx(0.5, 0.1, 0.1, gun, 0.9, 0.0, 0));
                F(FIXED.gun, cy(0.08, 0.08, 0.6, 6, gun, 0.95, 0.05, 0, [0, 0, Math.PI / 2]));
                F(FIXED.gun, bx(0.26, 0.32, 0.12, gun, -0.6, -0.16, 0));
                F(FIXED.gun, bx(0.16, 0.26, 0.1, gun, 0.0, -0.2, 0));
                F(FIXED.gunLight, bx(0.3, 0.1, 0.12, gun, 0.2, 0.18, 0));
                Z('visor', bx(0.12, 0.04, 0.04, gun, -0.2, 0.17, 0.08));
                F(FIXED.gun, bx(0.3, 0.28, 0.1, gun, -0.1, -0.3, 0));
            } else soldierVariant('rifle', parts.rifle, roleContext, null, gun);
        });
    }

    // ---------------------------------------------------------------------------------------
    /** Sentry: hulking dark exo-armour, sealed helmet with a visor slit and a multi-lens lamp rig on top, hoses, pump shotgun. */
    function buildSentry(parts) {
        const R = root, K = 0.82;   // narrower than the first draft
        for (const s of [-1, 1]) {
            Z('pants', bx(0.32, 0.22, 0.46, R, s * 0.2, 0.11, 0.04));
            Z('armor', bx(0.28, 0.5, 0.3, R, s * 0.2, 0.5, 0));
            Z('accent', bx(0.3, 0.1, 0.32, R, s * 0.2, 0.78, 0));
            Z('armor', bx(0.3, 0.5, 0.32, R, s * 0.2, 1.02, 0));
            F(FIXED.darkSteel, bx(0.08, 0.36, 0.08, R, s * 0.34, 1.0, 0.1));
        }
        Z('pants', bx(0.62, 0.26, 0.4, R, 0, 1.3, 0));
        Z('armor', bx(0.7, 0.12, 0.46, R, 0, 1.44, 0));
        for (let i = 0; i < 3; i++) F(FIXED.darkSteel, bx(0.12, 0.16, 0.08, R, -0.22 + i * 0.22, 1.42, 0.24));
        Z('armor', bx(0.74 * K, 0.7, 0.5 * K, R, 0, 1.84, 0));
        Z('accent', bx(0.56, 0.3, 0.14, R, 0, 1.96, 0.28)); Z('armor', bx(0.44, 0.2, 0.14, R, 0, 1.62, 0.27));
        for (const s of [-1, 1]) Z('visor', bx(0.06, 0.04, 0.03, R, s * 0.16, 2.06, 0.36));
        Z('armor', bx(0.5, 0.56, 0.3, R, 0, 1.9, -0.4));                        // power pack
        for (const s of [-1, 1]) F(FIXED.steel, cy(0.12, 0.12, 0.5, 8, R, s * 0.15, 1.95, -0.58));
        for (const s of [-1, 1]) {
            const shoulder = Z('armor', bx(0.36, 0.3, 0.42, R, s * 0.5, 2.14, 0));
            Z('accent', bx(0.38, 0.05, 0.44, R, s * 0.5, 2.3, 0));
            // Extra armour is parented to the shoulder, so it follows the arm during movement.
            if (parts.shoulders === 'segmented') {
                for (const x of [-0.085, 0.085]) Z('armor', bx(0.15, 0.08, 0.4, shoulder, x, 0.225, 0)).name = 'sentry_shoulder_detail';
            } else if (parts.shoulders === 'heavy') {
                Z('armor', bx(0.43, 0.13, 0.47, shoulder, s * 0.025, 0.245, 0)).name = 'sentry_shoulder_detail';
                Z('accent', bx(0.39, 0.035, 0.4, shoulder, s * 0.025, 0.325, 0)).name = 'sentry_shoulder_detail';
            }
            Z('armor', bx(0.26, 0.42, 0.26, R, s * 0.52, 1.78, 0.05));
            Z('accent', bx(0.28, 0.08, 0.28, R, s * 0.52, 1.54, 0.05));
            Z('armor', bx(0.24, 0.34, 0.24, R, s * 0.5, 1.36, 0.3, [-0.9, 0, 0]));
            Z('pants', bx(0.2, 0.16, 0.2, R, s * 0.48, 1.26, 0.56));
        }
        // long concealing cloak: hangs from the shoulders down the back and sides to the shins, hood-like collar
        const cloak = '#2b3038';
        if (parts.cloak === 'classic') {
            F(cloak, bx(0.8, 1.3, 0.1, R, 0, 0.95, -0.3)).name = 'sentry_cloak_back';
            for (const s of [-1, 1]) F(cloak, bx(0.12, 1.5, 0.6, R, s * 0.42, 1.1, -0.1));
        } else {
            // Keep these separate panels attached to the torso, not to the leg/arm auto-rig.
            const drape = new (B().TransformNode)('sentry_cloak_drape', S); drape.parent = R;
            if (parts.cloak === 'split') {
                for (const s of [-1, 1]) F(cloak, bx(0.34, 1.3, 0.1, drape, s * 0.23, 0.95, -0.3)).name = 'sentry_cloak_back';
                for (const s of [-1, 1]) F(cloak, bx(0.12, 1.5, 0.6, drape, s * 0.42, 1.1, -0.1));
            } else {   // the full-length cape ends in uneven cloth strips
                F(cloak, bx(0.8, 0.95, 0.1, drape, 0, 1.125, -0.3)).name = 'sentry_cloak_back';
                for (const [x, height] of [[-0.3, 0.42], [-0.1, 0.2], [0.1, 0.5], [0.3, 0.27]])
                    F(cloak, bx(0.2, height, 0.1, drape, x, 0.65 - height / 2, -0.3));
                for (const s of [-1, 1]) F(cloak, bx(0.12, 1.5, 0.6, drape, s * 0.42, 1.1, -0.1));
            }
        }
        F(cloak, bx(0.84, 0.08, 0.5, R, 0, 2.3, 0.0)); for (const s of [-1, 1]) F(cloak, bx(0.22, 0.56, 0.08, R, s * 0.3, 2.0, 0.34, [0, 0, s * 0.12]));   // thin shoulder mantle + front lapels
        // sealed helmet with a built-in gas mask: snout, two cheek filters, hose into the back pack
        Z('helmet', cy(0.46, 0.52, 0.14, 8, R, 0, 2.24, 0));
        Z('helmet', bx(0.42, 0.48, 0.44, R, 0, 2.54, 0.0)).name = 'sentry_helmet'; Z('helmet', bx(0.46, 0.14, 0.46, R, 0, 2.78, -0.02));
        for (const s of [-1, 1]) Z('accent', bx(0.06, 0.28, 0.34, R, s * 0.24, 2.54, -0.04));
        Z('visor', bx(0.3, 0.06, 0.03, R, 0, 2.6, 0.23)).name = 'sentry_visor'; // visor slit
        Z('accent', bx(0.22, 0.18, 0.16, R, 0, 2.4, 0.26)).name = 'sentry_mask'; // mask snout
        for (const s of [-1, 1]) {
            if (parts.respirator === 'reinforced') {
                F(FIXED.darkSteel, cy(0.17, 0.17, 0.12, 8, R, s * 0.22, 2.4, 0.24, [0, 0, Math.PI / 2])).name = 'sentry_filter';
                Z('accent', cy(0.14, 0.14, 0.02, 8, R, s * 0.29, 2.4, 0.24, [0, 0, Math.PI / 2]));
                F(FIXED.darkSteel, cy(0.09, 0.09, 0.025, 8, R, s * 0.305, 2.4, 0.24, [0, 0, Math.PI / 2]));
            } else if (parts.respirator === 'ribbed') {
                F(FIXED.darkSteel, bx(0.12, 0.18, 0.17, R, s * 0.22, 2.4, 0.24)).name = 'sentry_filter';
                for (const y of [2.35, 2.4, 2.45]) Z('accent', bx(0.13, 0.018, 0.18, R, s * 0.23, y, 0.24));
            } else F(FIXED.darkSteel, cy(0.12, 0.12, 0.08, 6, R, s * 0.17, 2.4, 0.24, [0, 0, Math.PI / 2])).name = 'sentry_filter';
        }
        hose([0, 2.36, 0.34], [0.3, 2.1, 0.0], 0.06); hose([0.3, 2.1, 0.0], [0.2, 2.0, -0.42], 0.06);
        // Every option retains a group of real lenses in addition to the sealed helmet's visor slit.
        if (parts.optics === 'classic') {
            F(FIXED.darkSteel, bx(0.12, 0.1, 0.26, R, -0.16, 2.88, 0.08));
            for (const [x, y] of [[-0.26, 2.88], [-0.15, 2.95], [-0.05, 2.86]]) { F(FIXED.darkSteel, cy(0.11, 0.11, 0.12, 6, R, x, y, 0.26, [Math.PI / 2, 0, 0])); Z('visor', cy(0.08, 0.08, 0.02, 6, R, x, y, 0.33, [Math.PI / 2, 0, 0])).name = 'sentry_lens'; }
        } else {
            F(FIXED.darkSteel, bx(0.36, 0.11, 0.22, R, 0, 2.9, 0.07));
            const lenses = parts.optics === 'binocular'
                ? [[-0.11, 2.91, 0.15], [0.11, 2.91, 0.15], [0, 3.025, 0.07]]
                : [[-0.14, 2.91, 0.09], [-0.045, 2.96, 0.09], [0.05, 2.96, 0.09], [0.145, 2.91, 0.09]];
            for (const [x, y, diameter] of lenses) {
                F(FIXED.darkSteel, cy(diameter + 0.035, diameter + 0.035, 0.14, 8, R, x, y, 0.25, [Math.PI / 2, 0, 0]));
                Z('visor', cy(diameter, diameter, 0.025, 8, R, x, y, 0.33, [Math.PI / 2, 0, 0])).name = 'sentry_lens';
            }
        }
        // pump shotgun
        const gun = new (B().TransformNode)('gun', S); gun.parent = R; gun.position.set(0, 1.3, 0.62); gun.rotation.y = -0.2;
        F(FIXED.gun, bx(1.1, 0.14, 0.1, gun, 0, 0, 0)); F(FIXED.gunLight, bx(0.36, 0.2, 0.14, gun, -0.2, 0.0, 0));
        F(FIXED.gun, cy(0.06, 0.06, 0.66, 6, gun, 0.55, 0.05, 0, [0, 0, Math.PI / 2])); F(FIXED.gun, cy(0.06, 0.06, 0.56, 6, gun, 0.5, -0.04, 0, [0, 0, Math.PI / 2]));
        F(FIXED.strap, bx(0.24, 0.1, 0.12, gun, 0.3, -0.03, 0)); F(FIXED.gun, bx(0.28, 0.28, 0.1, gun, -0.56, -0.12, 0));
        Z('visor', bx(0.08, 0.04, 0.04, gun, -0.1, 0.12, 0.08));
        function hose(a, b, d) {
            const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], len = Math.hypot(dx, dy, dz);
            const m = cy(d, d, len, 6, R, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
            m.rotationQuaternion = B().Quaternion.FromUnitVectorsToRef(new (B().Vector3)(0, 1, 0), new (B().Vector3)(dx / len, dy / len, dz / len), new (B().Quaternion)());
            F(FIXED.rubber, m);
        }
    }

    // ---------------------------------------------------------------------------------------
    function buildScout(parts) {
        const R = root;
        for (const s of [-1, 1]) {
            Z('boots', bx(0.22, 0.14, 0.36, R, s * 0.14, 0.07, 0.04));
            Z('boots', bx(0.22, 0.36, 0.24, R, s * 0.14, 0.3, 0));
            Z('suit', bx(0.2, 0.5, 0.2, R, s * 0.14, 0.7, 0));
            Z('jacket', bx(0.22, 0.2, 0.14, R, s * 0.14, 0.72, 0.1));          // knee plate
            Z('suit', bx(0.22, 0.45, 0.22, R, s * 0.14, 1.15, 0));
        }
        Z('suit', bx(0.5, 0.2, 0.26, R, 0, 1.4, 0));
        Z('boots', bx(0.54, 0.08, 0.3, R, 0, 1.5, 0));                          // belt
        F(FIXED.steel, bx(0.1, 0.1, 0.04, R, 0, 1.5, 0.16));                    // buckle
        // torso + plated vest
        Z('suit', bx(0.5, 0.6, 0.3, R, 0, 1.85, 0)).name = 'scout_torso';
        part('vest', parts.vest, () => {
            if (parts.vest !== 'classic') return scoutVariant('vest', parts.vest, roleContext);
            Z('jacket', bx(0.44, 0.3, 0.14, R, 0, 1.98, 0.2));                  // chest plates
            Z('jacket', bx(0.4, 0.2, 0.12, R, 0, 1.72, 0.2));
            Z('jacket', bx(0.46, 0.5, 0.1, R, 0, 1.85, -0.18));                 // back plate
            Z('visor', bx(0.06, 0.06, 0.03, R, 0.14, 2.05, 0.28));             // vest indicator
        });
        // shoulders & arms (asymmetric: left arm with tech bracer)
        for (const s of [-1, 1]) {
            part('shoulders', parts.shoulders, () => {
                if (parts.shoulders === 'classic') Z('jacket', bx(0.24, 0.16, 0.28, R, s * 0.36, 2.1, 0));
                else scoutVariant('shoulders', parts.shoulders, roleContext, s);
            });
            Z('suit', bx(0.16, 0.42, 0.18, R, s * 0.36, 1.82, 0));
            Z('suit', bx(0.14, 0.4, 0.16, R, s * 0.37, 1.42, 0.02));
            Z('boots', bx(0.14, 0.14, 0.14, R, s * 0.37, 1.18, 0.02));          // gloves
        }
        // tech bracer on the left forearm with glowing cells
        part('bracer', parts.bracer, () => {
            if (parts.bracer !== 'classic') return scoutVariant('bracer', parts.bracer, roleContext);
            Z('jacket', bx(0.22, 0.3, 0.24, R, -0.37, 1.44, 0.02));
            for (let i = 0; i < 3; i++) Z('visor', bx(0.05, 0.05, 0.03, R, -0.37, 1.34 + i * 0.09, 0.15));
        });
        // The neck overlaps both head and torso, including with the lighter independent vests.
        Z('skin', bx(0.14, 0.16, 0.14, R, 0, 2.21, 0)).name = 'scout_neck_joint';
        Z('skin', bx(0.3, 0.34, 0.3, R, 0, 2.44, 0.02)).name = 'scout_head';
        Z('skin', bx(0.06, 0.06, 0.05, R, 0, 2.42, 0.18));
        // Long hair and the asymmetrical fringe frame the scar in every variation.
        part('hair', parts.hair, () => {
            if (parts.hair !== 'classic') return scoutVariant('hair', parts.hair, roleContext);
            Z('hair', bx(0.34, 0.12, 0.34, R, 0, 2.64, 0));
            Z('hair', bx(0.34, 0.6, 0.12, R, 0, 2.36, -0.18));
            Z('hair', bx(0.08, 0.52, 0.3, R, -0.19, 2.38, -0.06));
            Z('hair', bx(0.08, 0.4, 0.2, R, 0.19, 2.44, -0.1));
            Z('hair', bx(0.36, 0.12, 0.16, R, -0.02, 2.6, 0.1, [0, 0, 0.22]));
            Z('hair', bx(0.14, 0.2, 0.14, R, -0.15, 2.5, 0.11));
        });
        // scar across the right eye (the side the fringe leaves open)
        F('#9a5a4a', bx(0.02, 0.16, 0.02, R, 0.08, 2.46, 0.175, [0, 0, 0.2]));
        F(FIXED.steel, bx(0.04, 0.08, 0.06, R, 0.17, 2.44, 0.04));
        // rifle slung diagonally on the back
        const gun = new (B().TransformNode)('gun', S); gun.parent = R; gun.position.set(0, 1.9, -0.3); gun.rotation.z = 0.9;
        part('rifle', parts.rifle, () => {
            if (parts.rifle !== 'classic') return scoutVariant('rifle', parts.rifle, roleContext, null, gun);
            F(FIXED.gun, bx(1.4, 0.12, 0.1, gun, 0, 0, 0));
            F(FIXED.gunLight, bx(0.36, 0.18, 0.12, gun, -0.1, 0.02, 0));
            F(FIXED.gun, bx(0.2, 0.2, 0.08, gun, -0.5, -0.1, 0));
            F(FIXED.gunLight, bx(0.3, 0.08, 0.08, gun, 0.2, 0.12, 0));
        });
        F(FIXED.strap, bx(0.06, 0.7, 0.04, R, 0.1, 1.85, 0.17, [0, 0, 0.5]));  // strap across chest
        // hip flask (she is holding a bottle in the art)
        F(FIXED.glass, cy(0.08, 0.1, 0.22, 6, R, 0.3, 1.36, 0.12), { alpha: 0.6, spec: 0.8 });
    }

    // ---------------------------------------------------------------------------------------
    function buildMechanic(parts) {
        const R = root;
        // Work trousers and footwear, with genuinely different protective legwear.
        for (const s of [-1, 1]) {
            Z('gloves', bx(0.3, 0.18, 0.42, R, s * 0.2, 0.09, 0.04));
            part('outfit', parts.outfit, () => {
                if (parts.outfit === 'classic') {
                    Z('overall', bx(0.3, 0.46, 0.32, R, s * 0.2, 0.44, 0));
                    Z('helmet', bx(0.26, 0.26, 0.1, R, s * 0.2, 0.46, 0.18));
                    Z('overall', bx(0.36, 0.52, 0.38, R, s * 0.2, 0.96, 0));
                    Z('overall', bx(0.34, 0.12, 0.4, R, s * 0.2, 0.7, 0));
                } else mechanicVariant('leg', parts.outfit, roleContext, s);
            });
        }
        Z('overall', bx(0.7, 0.3, 0.42, R, 0, 1.28, 0)).name = 'mechanic_pelvis';
        // Bridge the pelvis and shirt behind every belt: otherwise a dark gap makes the torso float.
        Z('overall', bx(0.48, 0.18, 0.34, R, 0, 1.5, 0)).name = 'mechanic_waist_joint';
        part('belt', parts.belt, () => {
            if (parts.belt === 'classic') {
                F(FIXED.strap, bx(0.72, 0.1, 0.44, R, 0, 1.44, 0));
                // Keep the tools outside a long apron when that independent option is selected.
                const z = parts.outfit === 'apron' ? 0.34 : 0.22;
                F(FIXED.steel, bx(0.12, 0.2, 0.08, R, 0.3, 1.32, z));
                F(FIXED.steel, bx(0.08, 0.26, 0.08, R, -0.3, 1.3, z));
            } else mechanicVariant('belt', parts.belt, roleContext);
        });
        // Orange work shirt, rolled sleeves and the original torch-carrying pose.
        Z('overall', bx(0.6, 0.62, 0.34, R, 0, 1.84, 0)).name = 'mechanic_torso';
        for (const s of [-1, 1]) {
            Z('overall', bx(0.3, 0.2, 0.32, R, s * 0.38, 2.06, 0));
            Z('skin', bx(0.18, 0.44, 0.2, R, s * 0.4, 1.76, 0));
            Z('skin', bx(0.16, 0.26, 0.18, R, s * 0.41, 1.52, 0.02));
            Z('helmet', bx(0.22, 0.2, 0.24, R, s * 0.41, 1.34, 0.03));
            Z('lights', bx(0.05, 0.05, 0.03, R, s * 0.41, 1.36, 0.16));
            Z('gloves', bx(0.16, 0.14, 0.16, R, s * 0.41, 1.18, 0.04));
        }
        part('outfit', parts.outfit, () => {
            if (parts.outfit === 'classic') {
                Z('helmet', bx(0.54, 0.46, 0.14, R, 0, 1.9, 0.2)); Z('helmet', bx(0.54, 0.5, 0.1, R, 0, 1.88, -0.2));
                Z('gloves', bx(0.46, 0.1, 0.16, R, 0, 1.62, 0.2));
                Z('lights', bx(0.1, 0.1, 0.03, R, -0.16, 1.98, 0.28));
                Z('overall', bx(0.2, 0.08, 0.03, R, 0.12, 1.98, 0.28));
                for (const s of [-1, 1]) Z('gloves', bx(0.08, 0.5, 0.04, R, s * 0.2, 1.86, 0.28));
            } else mechanicVariant('outfit', parts.outfit, roleContext);
        });
        part('pack', parts.pack, () => {
            if (parts.pack === 'classic') {
                Z('gloves', bx(0.5, 0.56, 0.26, R, 0, 1.84, -0.36));
                Z('helmet', cy(0.16, 0.16, 0.42, 8, R, 0.14, 1.9, -0.52)); Z('overall', cy(0.16, 0.16, 0.42, 8, R, -0.14, 1.9, -0.52));
                F(FIXED.steel, cy(0.22, 0.22, 0.1, 8, R, 0, 1.6, -0.5, [Math.PI / 2, 0, 0]));
            } else mechanicVariant('pack', parts.pack, roleContext);
        });
        // These hoses connect every generator to the hip and to the welder in the right hand.
        for (const [a, b] of [[[0.14, 1.66, -0.5], [0.36, 1.4, -0.2]], [[0.36, 1.4, -0.2], [0.5, 1.2, 0.2]], [[0.5, 1.2, 0.2], [0.5, 1.2, 0.46]], [[-0.14, 1.66, -0.5], [-0.3, 1.46, -0.26]], [[-0.3, 1.46, -0.26], [-0.41, 1.34, 0.0]]]) hose(a, b, 0.06);
        part('welder', parts.welder, () => {
            if (parts.welder === 'classic') {
                F(FIXED.darkSteel, bx(0.12, 0.16, 0.36, R, 0.5, 1.2, 0.48)); Z('overall', bx(0.1, 0.08, 0.2, R, 0.5, 1.3, 0.5));
                F(FIXED.steel, cy(0.04, 0.04, 0.2, 6, R, 0.5, 1.2, 0.74, [Math.PI / 2, 0, 0])); Z('lights', cy(0.03, 0.06, 0.08, 6, R, 0.5, 1.2, 0.86, [Math.PI / 2, 0, 0]));
            } else mechanicVariant('welder', parts.welder, roleContext);
        });
        // The neck reaches both the shoulders and the head/helmet, including the bare-face goggles.
        Z('skin', bx(0.16, 0.18, 0.16, R, 0, 2.2, 0)).name = 'mechanic_neck_joint';
        part('shield', parts.shield, () => {
            if (parts.shield === 'classic') {
                Z('skin', bx(0.3, 0.34, 0.3, R, 0, 2.44, 0.02));
                Z('hair', bx(0.32, 0.1, 0.32, R, 0, 2.64, 0.0)); Z('hair', bx(0.32, 0.2, 0.08, R, 0, 2.5, -0.14));
                F(FIXED.darkSteel, bx(0.36, 0.06, 0.36, R, 0, 2.6, 0.0));
                Z('helmet', bx(0.38, 0.42, 0.08, R, 0, 2.44, 0.2));
                Z('helmet', bx(0.4, 0.08, 0.16, R, 0, 2.66, 0.16));
                for (const s of [-1, 1]) Z('helmet', bx(0.06, 0.3, 0.14, R, s * 0.19, 2.46, 0.14));
                Z('gloves', bx(0.26, 0.14, 0.03, R, 0, 2.5, 0.245));
                Z('lights', bx(0.2, 0.09, 0.02, R, 0, 2.5, 0.255));
                Z('lights', bx(0.07, 0.07, 0.05, R, -0.18, 2.68, 0.2));
                F(FIXED.steel, bx(0.1, 0.12, 0.1, R, 0.21, 2.5, 0.0));
            } else mechanicVariant('shield', parts.shield, roleContext);
        });
        function hose(a, b, d) {
            const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], len = Math.hypot(dx, dy, dz);
            const m = cy(d, d, len, 6, R, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
            m.rotationQuaternion = B().Quaternion.FromUnitVectorsToRef(new (B().Vector3)(0, 1, 0), new (B().Vector3)(dx / len, dy / len, dz / len), new (B().Quaternion)());
            F(FIXED.rubber, m);
        }
    }

    // ---------------------------------------------------------------------------------------
    const emissiveZones = new Set(['visor', 'lights']);
    for (const [mesh, hex, opts] of fixed) mesh.material = flatMat(S, hex, opts || { spec: 0.3 });
    function setColors(c) {
        for (const [zone, meshes] of Object.entries(zones)) {
            const hex = c[zone] || DEFAULTS[charId][zone] || '#888888';
            const mat = flatMat(S, hex, emissiveZones.has(zone) ? { emissive: 1.0 } : { spec: zone === 'skin' || zone === 'hair' ? 0.02 : 0.2 });
            for (const m of meshes) m.material = mat;
        }
    }
    setColors(colors);
    for (const m of root.getChildMeshes()) m.isPickable = false;
    const anim = autoRig(S, root, { seated: !!(SPECS[charId] && SPECS[charId].wheelchair) });
    // scale to ~1.8 units tall (built at ~2.8)
    root.scaling.setAll(0.66);
    return { root, zones, setColors, animate: anim.animate, shoot: anim.shoot };
}

/**
 * Auto-rig: every builder parents its meshes straight to the root, so limbs are found by position
 * (legs below the hips, arms outside the torso) and re-parented to pivot nodes. Returns
 * animate(t, moving) — run cycle / idle — and shoot() — recoil + muzzle flash.
 */
function autoRig(S, root, opts = {}) {
    const HIP = 1.3, SHOULDER = 2.05;
    const mk = (name, y) => { const n = new (B().TransformNode)(name, S); n.parent = root; n.position.set(0, y, 0); return n; };
    const legs = { '-1': mk('legL', HIP), '1': mk('legR', HIP) }, arms = { '-1': mk('armL', SHOULDER), '1': mk('armR', SHOULDER) };
    const guns = [], wheels = [];
    for (const c of root.getChildren()) {
        if (c === legs['-1'] || c === legs['1'] || c === arms['-1'] || c === arms['1']) continue;
        const p = c.position; const s = p.x < 0 ? '-1' : '1';
        if (c.name === 'gun') guns.push(c);
        if (c.getClassName && c.getClassName() !== 'Mesh') {   // props: a pistol in a hand follows the arm
            if (c.name === 'gun' && Math.abs(p.x) > 0.3 && !opts.seated) { p.y -= SHOULDER; c.parent = arms[s]; }
            continue;
        }
        if (c.name === 'wheel') { wheels.push(c); continue; }
        if (opts.seated) continue;   // a seated figure keeps its pose; only the wheels turn
        if (Math.abs(p.x) >= 0.3 && p.y > 0.7 && p.y < 2.25) { p.y -= SHOULDER; c.parent = arms[s]; }          // arms, hands and hand-held tools
        else if (p.y < 1.25 && Math.abs(p.x) > 0.08 && Math.abs(p.x) < 0.3) { p.y -= HIP; c.parent = legs[s]; }
    }
    // muzzle flash: a bright blob in front of the character, hidden until a shot
    const flash = B().MeshBuilder.CreateSphere('flash', { diameter: 0.5, segments: 4 }, S);
    flash.parent = root; flash.position.set(0.25, 1.4, 1.0); flash.material = flatMat(S, '#fff2a0', { emissive: 1.0 }); flash.isPickable = false; flash.setEnabled(false);
    let phase = 0, swing = 0, shotAt = -10, now = 0;
    const animate = (t, moving) => {
        const dt = Math.max(0, Math.min(0.1, t - now)); now = t;
        swing += ((moving ? 1 : 0) - swing) * Math.min(1, dt * 8);
        if (moving) phase += dt * 11;
        const a = Math.sin(phase) * 0.75 * swing;
        legs['-1'].rotation.x = a; legs['1'].rotation.x = -a;
        arms['-1'].rotation.x = -a * 0.6; arms['1'].rotation.x = a * 0.6;
        root.position.y = opts.seated ? 0 : Math.abs(Math.sin(phase)) * 0.08 * swing;
        for (const w of wheels) w.rotation.x = -phase * 0.6;
        // recoil: guns jump back and the torso leans for ~250 ms after a shot
        const k = Math.max(0, 1 - (t - shotAt) / 0.25);
        for (const g of guns) g.position.z = (g._z0 == null ? (g._z0 = g.position.z) : g._z0) - 0.18 * k;
        flash.setEnabled(t - shotAt < 0.09);
        if (k > 0) flash.scaling.setAll(0.6 + Math.random() * 0.8);
    };
    const shoot = () => { shotAt = now; };
    return { animate, shoot };
}

/** Low-poly intruder. type: larva | adult | drone | queen */
export function buildIntruder(scene, type) {
    const S = scene;
    const root = new (B().TransformNode)('intr_' + type, S);
    const dark = flatMat(S, '#14181d', { spec: 0.6 }), mid = flatMat(S, '#262f36', { spec: 0.6 }), chitin = flatMat(S, '#323c3a', { spec: 0.7 });
    const glow = flatMat(S, '#9cff3b', { emissive: 0.9 }), tooth = flatMat(S, '#e3dccb');
    const bx = (...a) => box(S, ...a), cy = (...a) => cyl(S, ...a), sp = (...a) => sphere(S, ...a);
    if (type === 'larva') {
        // Facehugger: a flat crab-like body on eight long splayed fingers, a curled segmented tail
        // and a pale egg-sac under the belly. Low-slung, wider than it is long.
        const skin = flatMat(S, '#c9b391', { spec: 0.25 }), skinDark = flatMat(S, '#9a8465', { spec: 0.3 });
        const claw = flatMat(S, '#efe6d2'), sac = flatMat(S, '#b9a6d8', { emissive: 0.45 });
        const g2 = flatMat(S, '#d6f7a0', { emissive: 0.7 });
        const body = new (B().TransformNode)('lf', S); body.parent = root; body.rotation.y = 0.25;
        // carapace: wide flat dome + two side lobes (the "palm")
        sp(1.0, 7, body, 0, 0.30, 0, [1.5, 0.52, 1.05]).material = skin;
        for (const sd of [-1, 1]) sp(0.52, 6, body, sd * 0.46, 0.26, 0.06, [1.15, 0.5, 0.95]).material = skin;
        // dorsal ridge plates
        for (let i = 0; i < 5; i++) bx(0.16, 0.06, 0.2 - i * 0.015, body, 0, 0.5 - i * 0.012, 0.3 - i * 0.16, [0.15, 0, 0]).material = skinDark;
        // belly sac (the thing that plants the embryo) and the glowing maw
        sp(0.5, 6, body, 0, 0.12, -0.05, [1.1, 0.55, 1.1]).material = sac;
        sp(0.2, 5, body, 0, 0.14, 0.28).material = g2;
        bx(0.26, 0.05, 0.2, body, 0, 0.10, 0.34, [0.3, 0, 0]).material = dark;
        // eight long fingers splayed around the shell: two segments each, clawed tips
        for (let i = 0; i < 8; i++) {
            const sd = i < 4 ? -1 : 1, k = i % 4;
            const spread = 0.75 + k * 0.34;                       // fan out backwards
            const a = sd * (0.5 + k * 0.42);
            const len = 0.62 + (k % 2) * 0.14;
            const hip = new (B().TransformNode)('lh', S); hip.parent = body;
            hip.position.set(sd * 0.5, 0.26, -0.1 + k * 0.18);
            hip.rotation.set(0.2, a, -sd * (0.35 + k * 0.1));
            cy(0.1, 0.16, len, 4, hip, 0, -len / 2, 0).material = skin;
            const knuckle = new (B().TransformNode)('lk', S); knuckle.parent = hip; knuckle.position.set(0, -len, 0);
            knuckle.rotation.set(spread, 0, sd * 0.2);
            cy(0.05, 0.1, len * 1.15, 4, knuckle, 0, -len * 0.55, 0).material = skinDark;
            bx(0.05, 0.22, 0.05, knuckle, 0, -len * 1.15, 0, [0.35, 0, 0]).material = claw;
        }
        // long segmented tail curled up behind, ending in a stinger
        let tp = new (B().TransformNode)('lt', S); tp.parent = body; tp.position.set(0, 0.34, -0.45); tp.rotation.x = -0.9;
        for (let i = 0; i < 6; i++) {
            const seg = new (B().TransformNode)('ls', S); seg.parent = tp; seg.position.set(0, 0.24, 0); seg.rotation.x = 0.34 + i * 0.08;
            const d = 0.22 - i * 0.028;
            cy(d * 0.85, d, 0.3, 5, seg, 0, 0.13, 0).material = i % 2 ? skin : skinDark;
            if (i % 2 === 0) bx(0.05, 0.06, 0.05, seg, 0, 0.13, -d * 0.5, [-0.4, 0, 0]).material = claw;
            tp = seg;
        }
        bx(0.05, 0.3, 0.05, tp, 0, 0.32, 0, [0.4, 0, 0]).material = claw;
        sp(0.1, 4, tp, 0, 0.46, 0.04).material = g2;
    } else {
        const s = type === 'queen' ? 1.75 : type === 'drone' ? 1.0 : 1.2;
        root.scaling.set(s, s, s);
        // hunched torso (tilted forward), thin waist, armoured shoulders
        const torso = new (B().TransformNode)('t', S); torso.parent = root; torso.position.set(0, 1.05, 0); torso.rotation.x = 0.5;
        bx(0.56, 0.75, 0.45, torso, 0, 0.1, 0).material = chitin;
        bx(0.3, 0.45, 0.3, torso, 0, -0.45, -0.05).material = dark;                                  // waist
        for (let i = 0; i < 5; i++) { bx(0.6 + (i % 2) * 0.04, 0.05, 0.14, torso, 0, -0.2 + i * 0.13, 0.2 + i * 0.02).material = dark; }   // ribs
        bx(0.62, 0.1, 0.5, torso, 0, 0.5, -0.05).material = dark;                                     // collar plate
        for (const sd of [-1, 1]) bx(0.3, 0.14, 0.4, torso, sd * 0.42, 0.42, -0.05, [0, 0, -sd * 0.5]).material = chitin;   // shoulder pads
        // dorsal tubes (four, curving back)
        for (let i = 0; i < 4; i++) { const sd = i % 2 ? 1 : -1; const k = Math.floor(i / 2); cy(0.08, 0.12, 0.7, 6, torso, sd * (0.14 + k * 0.14), 0.45 + k * 0.1, -0.45 - k * 0.1, [-0.6 - k * 0.3, 0, sd * 0.25]).material = mid; cy(0.1, 0.08, 0.06, 6, torso, sd * (0.14 + k * 0.14), 0.75 + k * 0.1, -0.7 - k * 0.2, [-0.6 - k * 0.3, 0, sd * 0.25]).material = dark; }
        // spine ridge
        for (let i = 0; i < 6; i++) bx(0.06, 0.14 + (i % 2) * 0.06, 0.08, torso, 0, 0.35 - i * 0.16, -0.26 - (i > 3 ? 0.05 : 0), [-0.6, 0, 0]).material = tooth;
        // neck + elongated ridged head, no eyes, inner jaw
        const neck = new (B().TransformNode)('n', S); neck.parent = torso; neck.position.set(0, 0.55, 0.15); neck.rotation.x = -0.9;
        cy(0.16, 0.2, 0.4, 6, neck, 0, 0.15, 0).material = dark;
        const head = new (B().TransformNode)('h', S); head.parent = neck; head.position.set(0, 0.35, 0); head.rotation.x = 0.6;
        bx(0.26, 0.26, 1.05, head, 0, 0.1, -0.25).material = chitin;                                 // crest
        bx(0.3, 0.2, 0.5, head, 0, -0.04, 0.2).material = mid;                                        // skull front
        for (let i = 0; i < 6; i++) bx(0.28, 0.03, 0.05, head, 0, 0.24, -0.05 - i * 0.12).material = dark;   // crest ridges
        bx(0.26, 0.1, 0.42, head, 0, -0.2, 0.22, [0.3, 0, 0]).material = dark;                       // jaw
        for (let i = 0; i < 5; i++) { bx(0.03, 0.09, 0.03, head, -0.1 + i * 0.05, -0.11, 0.42).material = tooth; bx(0.03, 0.07, 0.03, head, -0.1 + i * 0.05, -0.21, 0.4).material = tooth; }
        // (no inner jaw: the old pale-green tongue hanging out of the mouth read as a coloured
        //  stick pasted on every intruder's face — the teeth and the dark maw say enough)
        bx(0.06, 0.04, 0.06, head, 0, -0.14, 0.66).material = tooth;
        // arms: upper, forearm, three long claws each
        for (const sd of [-1, 1]) {
            const sh = new (B().TransformNode)('sh', S); sh.parent = torso; sh.position.set(sd * 0.45, 0.3, 0.05); sh.rotation.set(-0.9, 0, sd * 0.35);
            bx(0.14, 0.6, 0.16, sh, 0, -0.3, 0).material = mid;
            bx(0.18, 0.08, 0.2, sh, 0, -0.6, 0).material = dark;                                     // elbow spike base
            bx(0.05, 0.18, 0.05, sh, 0, -0.62, -0.15, [0.6, 0, 0]).material = tooth;
            const fa = new (B().TransformNode)('fa', S); fa.parent = sh; fa.position.set(0, -0.6, 0); fa.rotation.x = -1.2;
            bx(0.12, 0.6, 0.13, fa, 0, -0.3, 0).material = chitin;
            for (let k = 0; k < 3; k++) bx(0.035, 0.32, 0.035, fa, (k - 1) * 0.05, -0.74, 0.02 - Math.abs(k - 1) * 0.02, [0.25, 0, (k - 1) * 0.3]).material = tooth;
        }
        // digitigrade legs
        for (const sd of [-1, 1]) {
            const hip = new (B().TransformNode)('hip', S); hip.parent = root; hip.position.set(sd * 0.2, 0.75, -0.1); hip.rotation.x = 0.9;
            bx(0.16, 0.55, 0.2, hip, 0, -0.27, 0).material = chitin;
            bx(0.06, 0.16, 0.06, hip, sd * 0.1, -0.25, -0.12, [-0.5, 0, 0]).material = tooth;
            const sn = new (B().TransformNode)('sn', S); sn.parent = hip; sn.position.set(0, -0.55, 0); sn.rotation.x = -1.7;
            bx(0.12, 0.5, 0.14, sn, 0, -0.25, 0).material = dark;
            const ft = new (B().TransformNode)('ft', S); ft.parent = sn; ft.position.set(0, -0.5, 0); ft.rotation.x = 0.9;
            bx(0.1, 0.32, 0.12, ft, 0, -0.16, 0).material = mid;
            for (let k = 0; k < 3; k++) bx(0.04, 0.05, 0.24, ft, (k - 1) * 0.06, -0.32, 0.14, [0, (k - 1) * 0.25, 0]).material = tooth;
        }
        // long segmented tail with a blade
        let tp = new (B().TransformNode)('tail', S); tp.parent = root; tp.position.set(0, 0.7, -0.3); tp.rotation.x = -1.1;
        for (let i = 0; i < 6; i++) { const seg = new (B().TransformNode)('ts', S); seg.parent = tp; seg.position.set(0, 0.32, 0); seg.rotation.x = 0.36 - i * 0.02; bx(0.13 - i * 0.015, 0.36, 0.13 - i * 0.015, seg, 0, 0.16, 0).material = i % 2 ? dark : mid; bx(0.04, 0.1, 0.05, seg, 0, 0.16, -0.08, [-0.5, 0, 0]).material = tooth; tp = seg; }
        bx(0.06, 0.45, 0.14, tp, 0, 0.5, 0).material = tooth;
        bx(0.03, 0.2, 0.08, tp, 0, 0.78, 0.02).material = tooth;
        if (type === 'queen') {
            bx(1.1, 0.08, 0.55, head, 0, 0.3, -0.35).material = dark;                                   // wide crown crest
            for (const sd of [-1, 1]) bx(0.08, 0.3, 0.3, head, sd * 0.55, 0.4, -0.4, [0, 0, -sd * 0.6]).material = chitin;
            sp(0.9, 6, root, 0, 0.55, -0.9, [1, 0.8, 1.3]).material = mid;                              // egg sac
            for (let i = 0; i < 5; i++) sp(0.18, 4, root, Math.sin(i * 1.3) * 0.35, 0.55 + Math.cos(i * 1.3) * 0.25, -0.9 - Math.cos(i) * 0.4).material = glow;
            for (const sd of [-1, 1]) { const a2 = new (B().TransformNode)('a2', S); a2.parent = torso; a2.position.set(sd * 0.3, 0.0, 0.18); a2.rotation.set(-1.4, 0, sd * 0.5); bx(0.08, 0.45, 0.08, a2, 0, -0.22, 0).material = mid; bx(0.03, 0.2, 0.03, a2, 0, -0.5, 0).material = tooth; }
        }
        if (type === 'drone') { for (const sd of [-1, 1]) { bx(0.04, 0.6, 0.9, torso, sd * 0.25, 0.1, -0.5, [0.4, 0, sd * 0.8]).material = flatMat(S, '#5a6a70', { alpha: 0.7 }); bx(0.04, 0.4, 0.6, torso, sd * 0.2, -0.1, -0.5, [0.9, 0, sd * 0.9]).material = flatMat(S, '#5a6a70', { alpha: 0.7 }); } }
        else sp(0.1, 4, torso, 0, 0.05, 0.25).material = glow;                                         // chest glow
    }
    for (const m of root.getChildMeshes()) m.isPickable = false;
    return root;
}

// ---------------------------------------------------------------------------------------------
// Bodies left on the deck: a dead human ("corpse"), a dead character ("charCorpse") and the
// carcass of an adult/drone intruder ("carcass"). These are room objects the table can pick up as
// heavy items, so they used to be a single flat box each — a blue slab for a human and a dark slab
// for a carcass. A body has to read as a body from the board camera: everything is built lying
// along +Z on the deck, low (under 0.5 units) so it never hides the figures behind it.
// ---------------------------------------------------------------------------------------------
export function buildBody(scene, kind, parent) {
    const S = scene;
    const bx = (...a) => box(S, ...a), cy = (...a) => cyl(S, ...a), sp = (...a) => sphere(S, ...a);
    const R = new (B().TransformNode)('body_' + kind, S); R.parent = parent || null;
    const xeno = kind === 'carcass';
    if (xeno) {
        const hide = flatMat(S, '#232a2f', { spec: 0.25 }), shell = flatMat(S, '#2f3a3d', { spec: 0.4 });
        const rib = flatMat(S, '#c9c1ad'), maw = flatMat(S, '#141a1e'), acid = flatMat(S, '#8fae4a', { emissive: 0.25 });
        // torso on its side, plating on top, ribs arching over it
        bx(0.52, 0.34, 1.15, R, 0, 0.17, -0.02).material = hide;
        bx(0.46, 0.1, 0.95, R, 0, 0.35, -0.02).material = shell;
        for (let i = 0; i < 5; i++) bx(0.58, 0.09, 0.09, R, 0, 0.36 - i * 0.005, 0.34 - i * 0.17, [0.1, 0, 0]).material = rib;
        // head on the deck, jaw open toward the front
        const head = new (B().TransformNode)('bcHead', S); head.parent = R; head.position.set(0.02, 0.16, 0.72); head.rotation.set(0.25, 0.18, 0);
        cy(0.2, 0.3, 0.52, 6, head, 0, 0.05, 0.14, [Math.PI / 2, 0, 0]).material = shell;
        bx(0.26, 0.09, 0.3, head, 0, -0.05, 0.3, [0.15, 0, 0.08]).material = maw;          // lower jaw
        for (const s of [-1, 1]) bx(0.03, 0.06, 0.22, head, s * 0.11, -0.02, 0.33, [0.1, 0, 0]).material = rib;   // teeth
        sp(0.09, 4, head, 0.04, 0.02, 0.26).material = acid;
        // limbs and the curled tail
        for (const s of [-1, 1]) {
            cy(0.09, 0.12, 0.62, 5, R, s * 0.26, 0.1, 0.5, [Math.PI / 2, s * 0.3, 0]).material = hide;
            cy(0.07, 0.1, 0.54, 5, R, s * 0.28, 0.09, -0.6, [Math.PI / 2, -s * 0.2, 0]).material = hide;
        }
        let tp = new (B().TransformNode)('bcTail', S); tp.parent = R; tp.position.set(0, 0.14, -0.62); tp.rotation.set(0.1, 0, 0);
        for (let i = 0; i < 5; i++) {
            const seg = new (B().TransformNode)('bcSeg', S); seg.parent = tp; seg.position.set(0, 0, -0.24); seg.rotation.set(0, 0.2 + i * 0.03, 0.12);
            cy(0.13 - i * 0.02, 0.16 - i * 0.02, 0.28, 5, seg, 0, 0, -0.1, [Math.PI / 2, 0, 0]).material = i % 2 ? hide : shell;
            tp = seg;
        }
        // acid that leaked out — two dull, angular splashes, not a bright disc
        for (const [dx, dz, d] of [[0.36, 0.34, 0.5], [-0.3, -0.2, 0.34]]) {
            const p = cy(d, d, 0.02, 7, R, dx, 0.01, dz); p.material = flatMat(S, '#5f7a33', { emissive: 0.12, alpha: 0.55 });
        }
    } else {
        const suit = flatMat(S, kind === 'charCorpse' ? '#5c2b2b' : '#49586b', { spec: 0.3 });
        const plate = flatMat(S, kind === 'charCorpse' ? '#39201f' : '#333f4e', { spec: 0.35 });
        const skin = flatMat(S, '#b99a80'), boot = flatMat(S, '#1c2025'), blood = flatMat(S, '#3d1114', { alpha: 0.75 });
        for (const s of [-1, 1]) {
            bx(0.18, 0.18, 0.8, R, s * 0.12, 0.1, -0.6).material = suit;                  // legs
            bx(0.19, 0.14, 0.24, R, s * 0.12, 0.09, -1.02).material = boot;                // boots
            bx(0.16, 0.15, 0.5, R, s * 0.3, 0.11, 0.14, [0, s * 0.5, 0]).material = suit;  // arms thrown out
            bx(0.11, 0.11, 0.18, R, s * 0.44, 0.09, 0.4).material = skin;                   // hands
        }
        bx(0.46, 0.28, 0.74, R, 0, 0.16, 0.04).material = suit;                            // torso
        bx(0.38, 0.06, 0.5, R, 0, 0.31, 0.04).material = plate;                            // chest rig
        sp(0.3, 6, R, 0.06, 0.16, 0.55, [1, 0.9, 1.05]).material = skin;                   // head, tipped aside
        sp(0.29, 5, R, 0.06, 0.22, 0.56, [1, 0.65, 1]).material = flatMat(S, '#2a1b12');   // hair
        for (const [dx, dz, d] of [[0.05, 0.05, 0.62], [-0.3, 0.4, 0.3]]) {
            const p = cy(d, d, 0.015, 7, R, dx, 0.012, dz); p.material = blood;            // blood under the body
        }
    }
    for (const m of R.getChildMeshes()) m.isPickable = false;
    return R;
}
