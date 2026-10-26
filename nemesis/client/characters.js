// characters.js — procedural low-poly characters and intruders (Babylon.js).
// Characters follow the original Nemesis art: Soldier — heavy power armour with a glass dome
// helmet and a two-handed rifle; Scout — slim plated vest, long hair, glowing tech bracer, rifle on
// the back; Mechanic — welding mask with a square window, hoses, orange/white plating, tools.
// Every part is bound to a paint zone (CHARACTERS[*].zones) so the player can recolour it.

import { buildStyledCharacter, STYLED_CHARACTERS } from './characters_styles.js';
import { buildStyledIntruder } from './intruder_styles.js';

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
    pilot: { skin: '#e8b89a', hair: '#e8e2d0', suit: '#6b7a3c', armor: '#c9c38a', gloves: '#2d3436', visor: '#3bff7a' },
    hacker: { skin: '#8d5a3c', hood: '#3a4a3a', jacket: '#4a5a3a', pants: '#2d3436', gear: '#8c96a0', lights: '#3bff7a' },
    scientist: { skin: '#e8b89a', hair: '#c4c4c4', coat: '#b9c6cf', shirt: '#2c3e50', pants: '#2d3436', lights: '#3bb8ff' },
    medic: { skin: '#f2d2bd', hair: '#c0552a', coat: '#dfe6ee', cap: '#7f8c8d', pants: '#2d3436', lights: '#ff3b3b' },
    janitor: { skin: '#d29b7c', hair: '#c4c4c4', overall: '#e67e22', cap: '#c0392b', gloves: '#f1c40f', lights: '#ffd23b' },
    ceo: { skin: '#e8b89a', hair: '#e8e2d0', coat: '#7f8c8d', shirt: '#dfe6ee', robot: '#2d3436', lights: '#ff3b3b' },
    labrat: { skin: '#d29b7c', hair: '#1c1c1c', gown: '#9fd0c6', pants: '#7f8c8d', bandage: '#dfe6ee', lights: '#ff3bd1' },
    sentry: { skin: '#b5805f', armor: '#3a4a5a', accent: '#8c96a0', pants: '#2d3436', helmet: '#2d3436', visor: '#3bff7a' },
    android: { skin: '#d29b7c', hair: '#2a1b12', vest: '#4a6b5c', shirt: '#dfe6ee', pants: '#2d3436', lights: '#ff3b3b' },
    convict: { skin: '#d29b7c', pants: '#5a5a5a', mask: '#2d3436', tattoo: '#3a4a5a', chains: '#8c96a0', lights: '#ff3b3b' },
    psych: { skin: '#f2d2bd', hair: '#1c1c1c', coat: '#dfe6ee', shirt: '#2c3e50', drone: '#3a3f44', lights: '#3bb8ff' },
    bounty: { skin: '#d29b7c', hair: '#5a3a22', armor: '#4b4f55', shirt: '#2d3436', dog: '#8a5a2a', lights: '#ff3b3b' },
    captain: { skin: '#d29b7c', hair: '#2a1b12', armor: '#2c3e50', shirt: '#4b3d2a', gloves: '#2d3436', lights: '#3bb8ff' },
};

// Parametric humanoids for the expansion crew. Each spec names the paint zone used by a body part and
// lists the accessories that make the character recognisable (see CHARACTERS[*].zones in cards.mjs).
const SPECS = {
    pilot:     { legs: 'suit', boots: 'gloves', torso: 'suit', arms: 'suit', hands: 'gloves', hair: 'shortSwept', hairZone: 'hair', pads: 'armor', harness: 'armor', monocle: 'visor', headset: 'armor', pistolR: true, rifleBack: true, lights: 'visor', build: 'athletic' },
    hacker:    { legs: 'pants', boots: 'pants', torso: 'jacket', arms: 'jacket', hands: 'skin', hood: 'hood', cables: 'gear', backpack: 'gear', smartGun: true, lights: 'lights', build: 'slim' },
    scientist: { legs: 'pants', boots: 'pants', torso: 'shirt', coat: 'coat', arms: 'coat', hands: 'skin', hair: 'shortSpiky', hairZone: 'hair', goggles: 'lights', tablet: true, beard: 'hair', build: 'slim' },
    medic:     { legs: 'pants', boots: 'pants', torso: 'coat', coat: 'coat', arms: 'coat', hands: 'skin', hair: 'longLoose', hairZone: 'hair', cap: 'cap', gasMask: true, syringe: true, redCross: 'lights', build: 'slim' },
    janitor:   { legs: 'overall', boots: 'gloves', torso: 'overall', arms: 'overall', hands: 'gloves', hair: 'beardOnly', hairZone: 'hair', cap: 'cap', toolBelt: true, wrench: true, patch: 'lights', build: 'stocky' },
    ceo:       { legs: 'shirt', boots: 'coat', torso: 'shirt', coat: 'coat', arms: 'coat', hands: 'skin', hair: 'shortSwept', hairZone: 'hair', tie: 'coat', pistolR: true, robot: true, build: 'slim' },
    labrat:    { legs: 'pants', boots: 'skin', torso: 'gown', arms: 'gown', hands: 'skin', hair: 'longLoose', hairZone: 'hair', blindfold: 'bandage', implants: 'lights', barefoot: true, build: 'slim' },
    sentry:    { legs: 'pants', boots: 'armor', torso: 'armor', arms: 'armor', hands: 'armor', helmet: 'helmet', nightVision: 'visor', pads: 'accent', harness: 'accent', shotgun: true, lights: 'visor', build: 'bulky' },
    android:   { legs: 'pants', boots: 'pants', torso: 'shirt', vest: 'vest', arms: 'shirt', hands: 'skin', hair: 'ponytail', hairZone: 'hair', implants: 'lights', pistolR: true, build: 'slim' },
    convict:   { legs: 'pants', boots: 'pants', torso: 'skin', arms: 'skin', hands: 'skin', bald: true, mask: 'mask', tattoos: 'tattoo', chains: 'chains', pipe: true, build: 'bulky', eyeLight: 'lights' },
    psych:     { legs: 'shirt', boots: 'shirt', torso: 'shirt', coat: 'coat', arms: 'coat', hands: 'skin', hair: 'bobBangs', hairZone: 'hair', glasses: true, drone: 'drone', headsetTech: 'drone', build: 'slim' },
    bounty:    { legs: 'shirt', boots: 'armor', torso: 'shirt', arms: 'shirt', hands: 'armor', hair: 'shortBeard', hairZone: 'hair', pads: 'armor', harness: 'armor', chestPlate: 'armor', rifleHands: true, dog: 'dog', build: 'bulky' },
    captain:   { legs: 'shirt', boots: 'gloves', torso: 'armor', arms: 'shirt', hands: 'gloves', hair: 'shortBeard', hairZone: 'hair', pads: 'armor', chestPlate: 'armor', revolver: true, shoulderLamp: 'lights', build: 'athletic' },
};
// Fixed (non-paintable) materials
const FIXED = { gun: '#23282e', gunLight: '#4a525c', steel: '#8c96a0', darkSteel: '#3a424b', rubber: '#1a1d21', glass: '#9fd8ff', strap: '#3b3127' };

/**
 * Build a character. Returns { root, zones: {zoneId: [meshes]}, setColors(colors) }. Height ≈ 2.1.
 */
export function buildCharacter(scene, charId, colors = {}, style = 'lowpoly') {
    if (style && style !== 'lowpoly' && STYLED_CHARACTERS.includes(charId)) return buildStyledCharacter(scene, charId, colors, style);
    const S = scene;
    const root = new (B().TransformNode)('char_' + charId, S);
    const zones = {};
    const fixed = [];
    const Z = (zone, mesh) => { (zones[zone] = zones[zone] || []).push(mesh); return mesh; };
    const F = (hex, mesh, opts) => { fixed.push([mesh, hex, opts]); return mesh; };
    const bx = (...a) => box(S, ...a), cy = (...a) => cyl(S, ...a), sp = (...a) => sphere(S, ...a), sp_ = sp;

    if (charId === 'soldier') buildSoldier();
    else if (charId === 'scout') buildScout();
    else if (charId === 'mechanic') buildMechanic();
    else buildHumanoid(SPECS[charId] || SPECS.pilot);

    // ---------------------------------------------------------------------------------------
    function buildHumanoid(sp) {
        const R = root; const LZ = sp.lights || 'lights';
        const W = sp.build === 'bulky' ? 1.18 : sp.build === 'stocky' ? 1.1 : sp.build === 'athletic' ? 1.05 : 1.0;   // width factor
        // legs & boots
        for (const s of [-1, 1]) {
            if (!sp.barefoot) { Z(sp.boots, bx(0.22 * W, 0.14, 0.36, R, s * 0.15 * W, 0.07, 0.04)); Z(sp.boots, bx(0.22 * W, 0.3, 0.24, R, s * 0.15 * W, 0.28, 0)); }
            else { Z('skin', bx(0.18, 0.1, 0.32, R, s * 0.14, 0.05, 0.04)); }
            Z(sp.legs, bx(0.21 * W, 0.5, 0.22, R, s * 0.15 * W, 0.68, 0));
            Z(sp.legs, bx(0.23 * W, 0.46, 0.24, R, s * 0.15 * W, 1.14, 0));
        }
        Z(sp.legs, bx(0.52 * W, 0.2, 0.28, R, 0, 1.4, 0));
        F(FIXED.strap, bx(0.56 * W, 0.08, 0.32, R, 0, 1.5, 0));                 // belt
        F(FIXED.steel, bx(0.1, 0.08, 0.04, R, 0, 1.5, 0.17));
        // torso
        Z(sp.torso, bx(0.54 * W, 0.64, 0.32, R, 0, 1.86, 0));
        if (sp.vest) { Z(sp.vest, bx(0.5 * W, 0.5, 0.1, R, 0, 1.84, 0.18)); Z(sp.vest, bx(0.5 * W, 0.5, 0.08, R, 0, 1.84, -0.18)); }
        if (sp.coat) {   // long open coat: back panel + two front flaps + tails
            Z(sp.coat, bx(0.58 * W, 0.7, 0.1, R, 0, 1.82, -0.2));
            for (const s of [-1, 1]) Z(sp.coat, bx(0.16 * W, 0.68, 0.1, R, s * 0.21 * W, 1.84, 0.19));
            for (const s of [-1, 1]) Z(sp.coat, bx(0.2 * W, 0.6, 0.08, R, s * 0.2 * W, 1.22, -0.17));
            Z(sp.coat, bx(0.6 * W, 0.08, 0.36, R, 0, 2.2, -0.02));             // collar
        }
        if (sp.chestPlate) { Z(sp.chestPlate, bx(0.42 * W, 0.3, 0.12, R, 0, 1.96, 0.2)); Z(sp.chestPlate, bx(0.36 * W, 0.18, 0.1, R, 0, 1.7, 0.2)); }
        if (sp.harness) { for (const s of [-1, 1]) Z(sp.harness, bx(0.08, 0.6, 0.04, R, s * 0.14 * W, 1.86, 0.18)); Z(sp.harness, bx(0.5 * W, 0.06, 0.04, R, 0, 1.64, 0.18)); for (let i = 0; i < 3; i++) F(FIXED.darkSteel, bx(0.08, 0.1, 0.06, R, -0.2 * W + i * 0.2 * W, 1.6, 0.2)); }
        if (sp.tie) { Z('shirt', bx(0.14, 0.3, 0.03, R, 0, 1.98, 0.18)); F('#7a1f1f', bx(0.06, 0.28, 0.02, R, 0, 1.9, 0.2)); }
        if (sp.redCross) { Z(sp.redCross, bx(0.12, 0.04, 0.02, R, 0.16 * W, 2.0, 0.2)); Z(sp.redCross, bx(0.04, 0.12, 0.02, R, 0.16 * W, 2.0, 0.2)); }
        if (sp.patch) { Z(sp.patch, cy(0.16, 0.16, 0.02, 8, R, 0.16 * W, 1.95, 0.17, [Math.PI / 2, 0, 0])); }
        if (sp.tattoos) { for (let i = 0; i < 4; i++) Z(sp.tattoos, bx(0.14, 0.03, 0.02, R, -0.12 * W + (i % 2) * 0.24 * W, 1.7 + i * 0.1, 0.17)); Z(sp.tattoos, bx(0.03, 0.3, 0.02, R, 0.42 * W, 1.84, 0.1)); }
        if (sp.backpack) { Z(sp.backpack, bx(0.4 * W, 0.5, 0.2, R, 0, 1.84, -0.28)); Z(LZ, bx(0.06, 0.06, 0.03, R, 0.1, 2.0, -0.4)); }
        // arms
        for (const s of [-1, 1]) {
            const pad = sp.pads;
            if (pad) Z(pad, bx(0.28 * W, 0.18, 0.3, R, s * 0.38 * W, 2.12, 0));
            Z(sp.arms, bx(0.17 * W, 0.42, 0.19, R, s * 0.38 * W, 1.84, 0));
            Z(sp.arms, bx(0.15 * W, 0.4, 0.17, R, s * 0.39 * W, 1.44, 0.02));
            Z(sp.hands, bx(0.14, 0.14, 0.14, R, s * 0.39 * W, 1.2, 0.03));
        }
        if (sp.cables) { for (let i = 0; i < 3; i++) F(FIXED.rubber, cy(0.03, 0.03, 0.5, 5, R, -0.3 * W + i * 0.05, 1.98, -0.3 - i * 0.04, [0.4, 0, 0.3])); Z(sp.cables, bx(0.12, 0.08, 0.06, R, -0.2 * W, 2.18, -0.3)); }
        if (sp.toolBelt) { for (let i = 0; i < 3; i++) F(FIXED.steel, bx(0.06, 0.14, 0.06, R, -0.22 * W + i * 0.1, 1.42, 0.17)); F(FIXED.strap, bx(0.14, 0.16, 0.1, R, 0.26 * W, 1.4, 0.12)); }
        if (sp.shoulderLamp) Z(sp.shoulderLamp, bx(0.08, 0.06, 0.06, R, -0.38 * W, 2.2, 0.12));
        // neck + head
        Z('skin', bx(0.14, 0.1, 0.14, R, 0, 2.2, 0));
        Z('skin', bx(0.3, 0.34, 0.3, R, 0, 2.44, 0.02));
        Z('skin', bx(0.06, 0.06, 0.05, R, 0, 2.42, 0.18));                     // nose
        const H = sp.hairZone || 'hair';
        switch (sp.hair) {
            case 'shortSwept': Z(H, bx(0.32, 0.1, 0.32, R, 0, 2.64, 0.0)); Z(H, bx(0.3, 0.08, 0.12, R, 0, 2.67, 0.12)); Z(H, bx(0.32, 0.14, 0.1, R, 0, 2.52, -0.14)); break;
            case 'shortSpiky': Z(H, bx(0.32, 0.08, 0.32, R, 0, 2.63, 0.0)); for (let i = 0; i < 4; i++) Z(H, bx(0.06, 0.12, 0.06, R, -0.1 + i * 0.07, 2.72, -0.02 + (i % 2) * 0.06)); break;
            case 'longLoose': Z(H, bx(0.34, 0.1, 0.34, R, 0, 2.64, 0.0)); Z(H, bx(0.34, 0.5, 0.1, R, 0, 2.32, -0.16)); for (const s of [-1, 1]) Z(H, bx(0.08, 0.44, 0.24, R, s * 0.19, 2.34, 0.0)); break;
            case 'ponytail': Z(H, bx(0.32, 0.1, 0.32, R, 0, 2.64, 0.0)); Z(H, bx(0.1, 0.1, 0.1, R, 0, 2.6, -0.2)); Z(H, bx(0.08, 0.4, 0.08, R, 0, 2.38, -0.22)); break;
            case 'bobBangs': Z(H, bx(0.34, 0.12, 0.34, R, 0, 2.64, 0.0)); Z(H, bx(0.34, 0.1, 0.08, R, 0, 2.56, 0.16)); Z(H, bx(0.34, 0.3, 0.1, R, 0, 2.42, -0.16)); for (const s of [-1, 1]) Z(H, bx(0.06, 0.3, 0.3, R, s * 0.18, 2.42, 0.0)); break;
            case 'shortBeard': Z(H, bx(0.32, 0.1, 0.32, R, 0, 2.64, 0.0)); Z(H, bx(0.28, 0.12, 0.08, R, 0, 2.3, 0.14)); break;
            case 'beardOnly': Z(H, bx(0.28, 0.16, 0.1, R, 0, 2.28, 0.14)); Z(H, bx(0.3, 0.06, 0.3, R, 0, 2.62, 0.0)); break;
        }
        if (sp.beard) Z(sp.beard, bx(0.26, 0.08, 0.06, R, 0, 2.3, 0.16));
        // head gear
        if (sp.cap) { Z(sp.cap, bx(0.34, 0.1, 0.34, R, 0, 2.66, 0.0)); Z(sp.cap, bx(0.3, 0.03, 0.16, R, 0, 2.62, 0.24)); }
        if (sp.hood) { Z(sp.hood, bx(0.4, 0.42, 0.4, R, 0, 2.5, -0.04)); Z(sp.hood, bx(0.46, 0.1, 0.46, R, 0, 2.28, -0.02)); F(FIXED.rubber, bx(0.3, 0.26, 0.04, R, 0, 2.46, 0.17)); Z('skin', bx(0.26, 0.2, 0.05, R, 0, 2.4, 0.19)); for (const s of [-1, 1]) Z(LZ, bx(0.04, 0.03, 0.02, R, s * 0.07, 2.46, 0.22)); }
        if (sp.helmet) { Z(sp.helmet, bx(0.38, 0.3, 0.38, R, 0, 2.58, 0.0)); Z(sp.helmet, bx(0.38, 0.14, 0.1, R, 0, 2.42, -0.18)); }
        if (sp.nightVision) { F(FIXED.darkSteel, bx(0.2, 0.1, 0.12, R, 0, 2.5, 0.22)); for (const x of [-0.08, 0, 0.08]) { F(FIXED.darkSteel, cy(0.07, 0.07, 0.12, 6, R, x, 2.48, 0.3, [Math.PI / 2, 0, 0])); Z(sp.nightVision, cy(0.05, 0.05, 0.02, 6, R, x, 2.48, 0.37, [Math.PI / 2, 0, 0])); } }
        if (sp.monocle) { F(FIXED.darkSteel, bx(0.14, 0.1, 0.03, R, 0.1, 2.48, 0.18)); Z(sp.monocle, bx(0.1, 0.06, 0.02, R, 0.1, 2.48, 0.2)); F(FIXED.darkSteel, bx(0.04, 0.04, 0.2, R, 0.17, 2.5, 0.08)); }
        if (sp.headset) { for (const s of [-1, 1]) Z(sp.headset, bx(0.06, 0.12, 0.1, R, s * 0.17, 2.44, 0.0)); Z(sp.headset, bx(0.36, 0.04, 0.06, R, 0, 2.66, -0.04)); }
        if (sp.headsetTech) { Z(sp.headsetTech, bx(0.06, 0.16, 0.12, R, 0.18, 2.46, 0.0)); Z(LZ, bx(0.03, 0.04, 0.04, R, 0.22, 2.5, 0.04)); F(FIXED.steel, bx(0.03, 0.03, 0.2, R, 0.18, 2.54, 0.1)); }
        if (sp.goggles) { F(FIXED.darkSteel, bx(0.3, 0.08, 0.04, R, 0, 2.62, 0.16)); for (const s of [-1, 1]) Z(sp.goggles, cy(0.09, 0.09, 0.03, 8, R, s * 0.08, 2.62, 0.18, [Math.PI / 2, 0, 0])); }
        if (sp.glasses) { F(FIXED.rubber, bx(0.3, 0.02, 0.02, R, 0, 2.47, 0.17)); for (const s of [-1, 1]) F(FIXED.glass, bx(0.1, 0.08, 0.02, R, s * 0.08, 2.46, 0.18), { alpha: 0.6, spec: 0.8 }); }
        if (sp.gasMask) { F(FIXED.darkSteel, bx(0.26, 0.16, 0.1, R, 0, 2.34, 0.16)); for (const s of [-1, 1]) F(FIXED.steel, cy(0.1, 0.1, 0.06, 6, R, s * 0.1, 2.32, 0.23, [Math.PI / 2, 0, 0])); }
        if (sp.blindfold) { Z(sp.blindfold, bx(0.33, 0.1, 0.33, R, 0, 2.48, 0.02)); Z(sp.blindfold, bx(0.08, 0.2, 0.03, R, -0.1, 2.28, -0.17)); }
        if (sp.mask) { Z(sp.mask, bx(0.3, 0.16, 0.08, R, 0, 2.36, 0.16)); for (let i = 0; i < 3; i++) F(FIXED.rubber, bx(0.03, 0.08, 0.02, R, -0.06 + i * 0.06, 2.34, 0.21)); Z(sp.mask, bx(0.34, 0.08, 0.1, R, 0, 2.46, 0.13)); }
        if (sp.eyeLight) Z(sp.eyeLight, bx(0.05, 0.03, 0.02, R, 0.08, 2.48, 0.18));
        if (sp.bald) Z('skin', bx(0.3, 0.06, 0.3, R, 0, 2.62, 0.02));
        if (sp.implants) { Z(sp.implants, bx(0.04, 0.04, 0.02, R, 0, 2.54, 0.18)); Z(sp.implants, bx(0.03, 0.1, 0.03, R, 0.16, 2.44, 0.0)); F(FIXED.steel, bx(0.06, 0.12, 0.04, R, -0.17, 2.44, 0.0)); }
        // hand-held props
        if (sp.pistolR || sp.revolver) {
            const g = new (B().TransformNode)('gun', S); g.parent = R; g.position.set(0.39 * W, 1.2, 0.14);
            F(FIXED.gun, bx(0.06, 0.1, 0.36, g, 0, 0.04, 0.16)); F(FIXED.gunLight, bx(0.08, 0.14, 0.12, g, 0, -0.02, 0));
            if (sp.revolver) { F(FIXED.steel, cy(0.1, 0.1, 0.08, 6, g, 0, 0.06, 0.1, [0, 0, Math.PI / 2])); F(FIXED.gun, cy(0.03, 0.03, 0.3, 6, g, 0, 0.06, 0.3, [Math.PI / 2, 0, 0])); }
            Z(LZ, bx(0.03, 0.03, 0.03, g, 0, 0.1, 0.1));
        }
        if (sp.smartGun) { const g = new (B().TransformNode)('gun', S); g.parent = R; g.position.set(0.39 * W, 1.2, 0.14); F(FIXED.gun, bx(0.08, 0.12, 0.4, g, 0, 0.04, 0.18)); Z(LZ, bx(0.09, 0.03, 0.2, g, 0, 0.11, 0.2)); F(FIXED.gunLight, bx(0.08, 0.14, 0.12, g, 0, -0.02, 0)); F(FIXED.rubber, cy(0.02, 0.02, 0.5, 4, R, 0.3 * W, 1.5, -0.1, [0.6, 0, 0.4])); }
        if (sp.rifleBack) { F(FIXED.gun, bx(0.08, 1.1, 0.12, R, 0.2 * W, 1.9, -0.26, [0, 0, 0.3])); F(FIXED.gunLight, bx(0.1, 0.3, 0.14, R, 0.1 * W, 1.6, -0.26, [0, 0, 0.3])); }
        if (sp.rifleHands || sp.shotgun) {
            const g = new (B().TransformNode)('gun', S); g.parent = R; g.position.set(0, 1.3, 0.5); g.rotation.y = -0.25;
            F(FIXED.gun, bx(1.1, 0.12, 0.1, g, 0, 0, 0)); F(FIXED.gunLight, bx(0.36, 0.2, 0.14, g, -0.15, 0.02, 0)); F(FIXED.gun, bx(0.24, 0.26, 0.1, g, -0.55, -0.1, 0));
            if (sp.shotgun) { F(FIXED.gun, cy(0.06, 0.06, 0.6, 6, g, 0.55, 0.03, 0, [0, 0, Math.PI / 2])); F(FIXED.gun, cy(0.06, 0.06, 0.6, 6, g, 0.55, -0.04, 0, [0, 0, Math.PI / 2])); }
            else { F(FIXED.gun, cy(0.05, 0.05, 0.5, 6, g, 0.6, 0.02, 0, [0, 0, Math.PI / 2])); F(FIXED.darkSteel, bx(0.3, 0.08, 0.06, g, 0.05, 0.14, 0)); Z(LZ, bx(0.06, 0.04, 0.04, g, 0.2, 0.15, 0)); }
        }
        if (sp.pipe) { F(FIXED.steel, cy(0.05, 0.05, 1.0, 6, R, 0.42 * W, 1.5, 0.1, [0, 0, 0.15])); F(FIXED.darkSteel, bx(0.1, 0.1, 0.1, R, 0.42 * W, 1.98, 0.08)); }
        if (sp.wrench) { F(FIXED.steel, bx(0.05, 0.5, 0.05, R, -0.4 * W, 1.0, 0.06, [0.3, 0, 0])); F(FIXED.steel, bx(0.14, 0.12, 0.05, R, -0.4 * W, 0.76, 0.14)); }
        if (sp.tablet) { F(FIXED.darkSteel, bx(0.26, 0.02, 0.2, R, -0.38 * W, 1.26, 0.18)); Z(LZ, bx(0.2, 0.01, 0.14, R, -0.38 * W, 1.28, 0.18)); }
        if (sp.syringe) { F(FIXED.glass, cy(0.03, 0.03, 0.26, 6, R, -0.39 * W, 1.24, 0.14, [0.9, 0, 0]), { alpha: 0.7 }); F(FIXED.steel, cy(0.01, 0.01, 0.16, 4, R, -0.39 * W, 1.15, 0.32, [0.9, 0, 0])); }
        if (sp.chains) { for (let i = 0; i < 5; i++) Z(sp.chains, bx(0.06, 0.04, 0.03, R, -0.2 + i * 0.1, 1.08 - Math.abs(i - 2) * 0.03, 0.06)); for (const s of [-1, 1]) Z(sp.chains, bx(0.18, 0.08, 0.18, R, s * 0.39 * W, 1.12, 0.03)); }
        // companions
        if (sp.drone) { const d = new (B().TransformNode)('drone', S); d.parent = R; d.position.set(-0.6, 2.7, 0.1); Z(sp.drone, sp_(0.28, 6, d, 0, 0, 0)); Z(LZ, cy(0.1, 0.1, 0.04, 8, d, 0, 0, 0.14, [Math.PI / 2, 0, 0])); for (const s of [-1, 1]) Z(sp.drone, bx(0.3, 0.03, 0.1, d, s * 0.22, 0.08, 0)); }
        if (sp.dog) { const d = new (B().TransformNode)('dog', S); d.parent = R; d.position.set(0.72 * W, 0, 0.2); Z(sp.dog, bx(0.26, 0.3, 0.7, d, 0, 0.45, 0)); Z(sp.dog, bx(0.22, 0.22, 0.28, d, 0, 0.72, 0.4)); Z(sp.dog, bx(0.1, 0.14, 0.2, d, 0, 0.66, 0.58)); for (const s of [-1, 1]) Z(sp.dog, bx(0.06, 0.12, 0.05, d, s * 0.07, 0.88, 0.36)); for (const [x, z] of [[-0.08, 0.25], [0.08, 0.25], [-0.08, -0.25], [0.08, -0.25]]) Z(sp.dog, bx(0.08, 0.3, 0.08, d, x, 0.15, z)); Z(sp.dog, bx(0.05, 0.05, 0.3, d, 0, 0.6, -0.45, [-0.6, 0, 0])); F(FIXED.strap, bx(0.3, 0.08, 0.12, d, 0, 0.6, 0.2)); Z(LZ, bx(0.04, 0.04, 0.02, d, 0.05, 0.6, 0.27)); F(FIXED.rubber, bx(0.06, 0.04, 0.04, d, 0, 0.66, 0.69)); }
        if (sp.robot) {
            const r = new (B().TransformNode)('robot', S); r.parent = R; r.position.set(-0.85, 0, -0.1);
            for (const s of [-1, 1]) { Z('robot', bx(0.26, 0.16, 0.4, r, s * 0.2, 0.08, 0.02)); Z('robot', bx(0.22, 1.1, 0.26, r, s * 0.2, 0.7, 0)); F(FIXED.steel, bx(0.26, 0.1, 0.3, r, s * 0.2, 0.9, 0)); }
            Z('robot', bx(0.7, 0.9, 0.44, r, 0, 1.8, 0)); F(FIXED.steel, bx(0.6, 0.1, 0.46, r, 0, 2.28, 0)); Z('robot', bx(0.5, 0.2, 0.3, r, 0, 1.3, 0));
            for (const s of [-1, 1]) { Z('robot', bx(0.3, 0.3, 0.36, r, s * 0.5, 2.1, 0)); Z('robot', bx(0.2, 0.7, 0.22, r, s * 0.52, 1.6, 0)); F(FIXED.steel, bx(0.22, 0.22, 0.22, r, s * 0.52, 1.2, 0.04)); }
            Z('robot', bx(0.34, 0.34, 0.34, r, 0, 2.5, 0.02)); Z(LZ, bx(0.3, 0.06, 0.03, r, 0, 2.52, 0.19)); Z(LZ, bx(0.12, 0.12, 0.03, r, 0, 1.85, 0.23)); F(FIXED.steel, bx(0.1, 0.1, 0.1, r, 0, 2.7, 0));
        }
    }

    // ---------------------------------------------------------------------------------------
    function buildSoldier() {
        const R = root;
        // massive boots & greaves
        for (const s of [-1, 1]) {
            Z('pants', bx(0.34, 0.22, 0.46, R, s * 0.22, 0.11, 0.04));
            Z('pants', bx(0.3, 0.55, 0.32, R, s * 0.22, 0.48, 0));
            Z('armor', bx(0.36, 0.42, 0.2, R, s * 0.22, 0.5, 0.16));          // shin plate
            Z('armor', bx(0.34, 0.5, 0.36, R, s * 0.22, 0.98, 0));            // thigh armour
            Z('accent', bx(0.38, 0.14, 0.4, R, s * 0.22, 0.74, 0));           // knee ring
        }
        // pelvis / belt
        Z('pants', bx(0.7, 0.3, 0.46, R, 0, 1.28, 0));
        Z('armor', bx(0.78, 0.12, 0.52, R, 0, 1.4, 0));
        // torso: layered chest armour
        Z('armor', bx(0.84, 0.7, 0.56, R, 0, 1.8, 0));
        Z('armor', bx(0.7, 0.3, 0.2, R, 0, 1.95, 0.34));                       // chest plate
        Z('accent', bx(0.3, 0.1, 0.06, R, 0, 2.02, 0.45));                      // chest light bar
        Z('visor', bx(0.14, 0.05, 0.03, R, 0, 2.02, 0.49));
        Z('armor', bx(0.5, 0.24, 0.2, R, 0, 1.62, 0.3));                       // abdomen plate
        F(FIXED.darkSteel, bx(0.4, 0.5, 0.1, R, 0, 1.75, -0.33));               // back plate
        // backpack with tanks
        Z('armor', bx(0.6, 0.6, 0.3, R, 0, 1.85, -0.5));
        for (const s of [-1, 1]) F(FIXED.steel, cy(0.16, 0.16, 0.7, 8, R, s * 0.18, 1.95, -0.7));
        for (const s of [-1, 1]) Z('accent', cy(0.17, 0.17, 0.08, 8, R, s * 0.18, 2.32, -0.7));
        // huge pauldrons
        for (const s of [-1, 1]) {
            Z('armor', bx(0.44, 0.34, 0.5, R, s * 0.6, 2.12, 0));
            Z('accent', bx(0.46, 0.08, 0.52, R, s * 0.6, 2.3, 0));
            Z('armor', bx(0.3, 0.42, 0.3, R, s * 0.62, 1.78, 0.05));          // upper arm
            Z('accent', bx(0.32, 0.08, 0.32, R, s * 0.62, 1.56, 0.05));        // elbow ring
            Z('armor', bx(0.28, 0.36, 0.3, R, s * 0.6, 1.36, 0.3, [-0.9, 0, 0])); // forearm toward rifle
            Z('pants', bx(0.2, 0.18, 0.2, R, s * 0.58, 1.26, 0.56));          // gloves
        }
        // neck ring + head inside glass dome
        Z('armor', cy(0.5, 0.56, 0.14, 8, R, 0, 2.22, 0));
        Z('skin', bx(0.3, 0.34, 0.3, R, 0, 2.5, 0.02));
        Z('hair', bx(0.32, 0.1, 0.32, R, 0, 2.7, 0.0));
        Z('skin', bx(0.08, 0.06, 0.06, R, 0, 2.48, 0.18));                     // nose
        F(FIXED.glass, sp(0.62, 8, R, 0, 2.52, 0.02, [1, 1.05, 1]), { alpha: 0.35, spec: 0.8 });
        Z('visor', cy(0.6, 0.6, 0.06, 8, R, 0, 2.2, 0.02));                   // glowing helmet seal
        Z('armor', bx(0.2, 0.16, 0.18, R, 0, 2.82, -0.1));                     // dome top hinge
        for (const s of [-1, 1]) Z('visor', bx(0.06, 0.06, 0.06, R, s * 0.3, 2.6, 0.1));  // helmet lamps
        // two-handed heavy rifle held across the waist
        const gun = new (B().TransformNode)('gun', S); gun.parent = R; gun.position.set(0, 1.3, 0.62); gun.rotation.y = -0.2;
        F(FIXED.gun, bx(1.5, 0.18, 0.14, gun, 0, 0, 0));
        F(FIXED.gunLight, bx(0.6, 0.26, 0.2, gun, -0.1, 0.02, 0));
        F(FIXED.gun, bx(0.5, 0.1, 0.1, gun, 0.9, 0.0, 0));                     // barrel
        F(FIXED.gun, cy(0.08, 0.08, 0.6, 6, gun, 0.95, 0.05, 0, [0, 0, Math.PI / 2]));
        F(FIXED.gun, bx(0.26, 0.32, 0.12, gun, -0.6, -0.16, 0));               // stock
        F(FIXED.gun, bx(0.16, 0.26, 0.1, gun, 0.0, -0.2, 0));                  // grip
        F(FIXED.gunLight, bx(0.3, 0.1, 0.12, gun, 0.2, 0.18, 0));              // top rail/scope
        Z('visor', bx(0.12, 0.04, 0.04, gun, -0.2, 0.17, 0.08));               // ammo light
        F(FIXED.gun, bx(0.3, 0.28, 0.1, gun, -0.1, -0.3, 0));                  // magazine
    }

    // ---------------------------------------------------------------------------------------
    function buildScout() {
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
        Z('suit', bx(0.5, 0.6, 0.3, R, 0, 1.85, 0));
        Z('jacket', bx(0.44, 0.3, 0.14, R, 0, 1.98, 0.2));                      // chest plates
        Z('jacket', bx(0.4, 0.2, 0.12, R, 0, 1.72, 0.2));
        Z('jacket', bx(0.46, 0.5, 0.1, R, 0, 1.85, -0.18));                     // back plate
        Z('visor', bx(0.06, 0.06, 0.03, R, 0.14, 2.05, 0.28));                 // vest indicator
        // shoulders & arms (asymmetric: left arm with tech bracer)
        for (const s of [-1, 1]) {
            Z('jacket', bx(0.24, 0.16, 0.28, R, s * 0.36, 2.1, 0));
            Z('suit', bx(0.16, 0.42, 0.18, R, s * 0.36, 1.82, 0));
            Z('suit', bx(0.14, 0.4, 0.16, R, s * 0.37, 1.42, 0.02));
            Z('boots', bx(0.14, 0.14, 0.14, R, s * 0.37, 1.18, 0.02));          // gloves
        }
        // tech bracer on the left forearm with glowing cells
        Z('jacket', bx(0.22, 0.3, 0.24, R, -0.37, 1.44, 0.02));
        for (let i = 0; i < 3; i++) Z('visor', bx(0.05, 0.05, 0.03, R, -0.37, 1.34 + i * 0.09, 0.15));
        // neck + head
        Z('skin', bx(0.14, 0.1, 0.14, R, 0, 2.2, 0));
        Z('skin', bx(0.3, 0.34, 0.3, R, 0, 2.44, 0.02));
        Z('skin', bx(0.06, 0.06, 0.05, R, 0, 2.42, 0.18));
        // long hair: cap, long back, two side locks
        Z('hair', bx(0.34, 0.12, 0.34, R, 0, 2.64, 0));
        Z('hair', bx(0.34, 0.6, 0.12, R, 0, 2.36, -0.18));
        Z('hair', bx(0.08, 0.5, 0.14, R, -0.19, 2.34, 0.02));
        Z('hair', bx(0.08, 0.36, 0.14, R, 0.19, 2.4, 0.02));
        // face tattoo stripe (accent) & earpiece
        Z('visor', bx(0.03, 0.12, 0.02, R, -0.08, 2.4, 0.17));
        F(FIXED.steel, bx(0.04, 0.08, 0.06, R, 0.17, 2.44, 0.04));
        // rifle slung diagonally on the back
        const gun = new (B().TransformNode)('gun', S); gun.parent = R; gun.position.set(0, 1.9, -0.3); gun.rotation.z = 0.9;
        F(FIXED.gun, bx(1.4, 0.12, 0.1, gun, 0, 0, 0));
        F(FIXED.gunLight, bx(0.36, 0.18, 0.12, gun, -0.1, 0.02, 0));
        F(FIXED.gun, bx(0.2, 0.2, 0.08, gun, -0.5, -0.1, 0));
        F(FIXED.gunLight, bx(0.3, 0.08, 0.08, gun, 0.2, 0.12, 0));
        F(FIXED.strap, bx(0.06, 0.7, 0.04, R, 0.1, 1.85, 0.17, [0, 0, 0.5]));  // strap across chest
        // hip flask (she is holding a bottle in the art)
        F(FIXED.glass, cy(0.08, 0.1, 0.22, 6, R, 0.3, 1.36, 0.12), { alpha: 0.6, spec: 0.8 });
    }

    // ---------------------------------------------------------------------------------------
    function buildMechanic() {
        const R = root;
        for (const s of [-1, 1]) {
            Z('gloves', bx(0.3, 0.18, 0.42, R, s * 0.2, 0.09, 0.04));
            Z('overall', bx(0.26, 0.5, 0.28, R, s * 0.2, 0.46, 0));
            Z('helmet', bx(0.28, 0.3, 0.14, R, s * 0.2, 0.5, 0.16));           // white shin plate
            Z('overall', bx(0.3, 0.5, 0.32, R, s * 0.2, 0.96, 0));
            Z('helmet', bx(0.32, 0.16, 0.2, R, s * 0.2, 0.74, 0.12));          // knee pad
        }
        Z('overall', bx(0.64, 0.3, 0.4, R, 0, 1.28, 0));
        Z('gloves', bx(0.7, 0.12, 0.44, R, 0, 1.42, 0));                        // tool belt
        F(FIXED.steel, bx(0.12, 0.2, 0.08, R, 0.3, 1.32, 0.22));                // wrench on belt
        F(FIXED.steel, bx(0.08, 0.26, 0.08, R, -0.3, 1.3, 0.22));
        // torso with white chest armour and orange shoulders
        Z('overall', bx(0.72, 0.66, 0.46, R, 0, 1.8, 0));
        Z('helmet', bx(0.56, 0.4, 0.14, R, 0, 1.9, 0.28));                      // chest plate
        Z('lights', bx(0.1, 0.1, 0.04, R, -0.16, 1.98, 0.36));                  // smiley badge spot
        Z('overall', bx(0.2, 0.08, 0.04, R, 0.12, 1.98, 0.36));
        F(FIXED.darkSteel, bx(0.3, 0.3, 0.1, R, 0, 1.62, 0.28));                // belly gear box
        // backpack generator with hoses
        Z('gloves', bx(0.56, 0.6, 0.32, R, 0, 1.82, -0.42));
        Z('helmet', cy(0.2, 0.2, 0.5, 8, R, 0.16, 1.9, -0.6));
        Z('overall', cy(0.2, 0.2, 0.5, 8, R, -0.16, 1.9, -0.6));
        for (const s of [-1, 1]) {
            // hose from pack to forearm (3 segments)
            F(FIXED.rubber, cy(0.07, 0.07, 0.5, 6, R, s * 0.34, 2.2, -0.45, [0.6, 0, s * 0.5]));
            F(FIXED.rubber, cy(0.07, 0.07, 0.5, 6, R, s * 0.6, 1.95, -0.2, [1.0, 0, s * 0.4]));
            F(FIXED.rubber, cy(0.07, 0.07, 0.45, 6, R, s * 0.66, 1.6, 0.05, [1.5, 0, 0]));
            Z('overall', bx(0.36, 0.26, 0.4, R, s * 0.5, 2.1, 0));             // shoulder
            Z('overall', bx(0.26, 0.42, 0.28, R, s * 0.52, 1.78, 0.04));
            Z('helmet', bx(0.3, 0.34, 0.3, R, s * 0.54, 1.42, 0.14, [-0.5, 0, 0]));  // white gauntlet
            Z('gloves', bx(0.24, 0.2, 0.24, R, s * 0.54, 1.22, 0.3));
            Z('lights', bx(0.06, 0.06, 0.03, R, s * 0.54, 1.48, 0.31));         // gauntlet lamp
        }
        // right hand holds a plasma cutter
        F(FIXED.darkSteel, bx(0.14, 0.14, 0.4, R, 0.54, 1.2, 0.5));
        Z('lights', cy(0.05, 0.08, 0.14, 6, R, 0.54, 1.2, 0.76, [Math.PI / 2, 0, 0]));
        // head: welding mask with square window; hair tuft visible under raised brim
        Z('skin', bx(0.16, 0.1, 0.16, R, 0, 2.18, 0));
        Z('helmet', bx(0.42, 0.5, 0.42, R, 0, 2.48, 0));                       // mask shell
        Z('overall', bx(0.44, 0.1, 0.44, R, 0, 2.28, 0));                       // mask rim
        Z('gloves', bx(0.26, 0.18, 0.04, R, 0, 2.5, 0.22));                     // dark window frame
        Z('lights', bx(0.2, 0.12, 0.02, R, 0, 2.5, 0.24));                      // glowing visor window
        Z('hair', bx(0.3, 0.08, 0.1, R, 0, 2.76, 0.18));                        // hair tuft over brim
        Z('helmet', bx(0.46, 0.08, 0.5, R, 0, 2.74, 0.04));                     // mask top/brim
        Z('lights', bx(0.08, 0.08, 0.06, R, -0.2, 2.72, 0.2));                  // head lamp
        F(FIXED.steel, bx(0.12, 0.14, 0.1, R, 0.24, 2.5, 0.05));                // ear box
        Z('overall', bx(0.1, 0.06, 0.06, R, -0.24, 2.44, 0.1));
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
    // scale to ~1.8 units tall (built at ~2.8)
    root.scaling.setAll(0.66);
    return { root, zones, setColors, animate: () => {} };
}

/** Low-poly intruder. type: larva | adult | drone | queen */
export function buildIntruder(scene, type, style = 'lowpoly') {
    if (type === 'adult' && style && style !== 'lowpoly') return buildStyledIntruder(scene, style);
    const S = scene;
    const root = new (B().TransformNode)('intr_' + type, S);
    const dark = flatMat(S, '#14181d', { spec: 0.6 }), mid = flatMat(S, '#262f36', { spec: 0.6 }), chitin = flatMat(S, '#323c3a', { spec: 0.7 });
    const glow = flatMat(S, '#9cff3b', { emissive: 0.9 }), tooth = flatMat(S, '#e3dccb'), slime = flatMat(S, '#5a7a2a', { emissive: 0.3 });
    const bx = (...a) => box(S, ...a), cy = (...a) => cyl(S, ...a), sp = (...a) => sphere(S, ...a);
    if (type === 'larva') {
        // segmented grub with hooked legs, mandibles and a glowing core
        const body = new (B().TransformNode)('lb', S); body.parent = root; body.rotation.y = 0.4;
        for (let i = 0; i < 5; i++) { const d = 0.42 - i * 0.05; sp(d, 6, body, 0, 0.2 - i * 0.02, -0.05 - i * 0.26, [1, 0.75, 1.15]).material = i % 2 ? mid : chitin; }
        sp(0.4, 6, body, 0, 0.24, 0.2, [1, 0.8, 0.9]).material = dark;                       // head
        for (const sd of [-1, 1]) { bx(0.05, 0.05, 0.28, body, sd * 0.12, 0.2, 0.42, [-0.4, sd * 0.5, 0]).material = tooth; bx(0.04, 0.04, 0.16, body, sd * 0.06, 0.16, 0.5, [0, sd * 0.3, 0]).material = tooth; }
        for (let i = 0; i < 6; i++) { const sd = i % 2 ? 1 : -1; const z = 0.1 - Math.floor(i / 2) * 0.3; bx(0.3, 0.05, 0.06, body, sd * 0.22, 0.12, z, [0, 0, sd * 0.6]).material = dark; bx(0.05, 0.14, 0.05, body, sd * 0.36, 0.05, z, [0, 0, sd * 0.3]).material = tooth; }
        for (let i = 0; i < 4; i++) bx(0.04, 0.12, 0.05, body, 0, 0.42 - i * 0.03, -0.05 - i * 0.26, [0.5, 0, 0]).material = tooth;  // dorsal spikes
        sp(0.12, 5, body, 0, 0.26, -0.3).material = glow;
        sp(0.1, 4, body, 0, 0.3, 0.3).material = glow;
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
        bx(0.08, 0.08, 0.3, head, 0, -0.14, 0.5).material = slime;                                   // inner jaw
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
    return { root, animate: () => {} };
}
