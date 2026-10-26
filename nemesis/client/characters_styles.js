// characters_styles.js — alternative visual styles for the Soldier, Mechanic and Android models.
//   rounded — the same detailed low-poly look, but built from capsules/spheres/cylinders;
//   pbr     — smooth shading + PBR materials with procedural wear (metal scratches, fabric weave, skin pores);
//   mini    — modelled after the board-game miniatures: dynamic pose on a sculpted round base, satin "paint";
//   real    — realistic proportions (7.5 heads), jointed limbs, PBR skin/cloth/metal.
// Every model is rigged on TransformNode joints (hips, spine, chest, head, shoulders, elbows, knees) so the
// same parts can be posed, recoloured per zone and animated. buildStyledCharacter returns the same shape
// as buildCharacter: { root, zones, setColors, animate }.

import { flatMat, DEFAULTS } from './characters.js';

const B = () => window.BABYLON;

export const MODEL_STYLES = {
    lowpoly: { name: 'Low-poly (текущий)', desc: 'Гранёные формы, плоская заливка.' },
    rounded: { name: 'Low-poly со скруглениями', desc: 'Та же детализация, но капсулы, сферы и цилиндры.' },
    pbr:     { name: 'Детальные материалы', desc: 'Гладкие поверхности, металл/ткань/кожа с процедурным износом.' },
    mini:    { name: 'Как фигурка', desc: 'Динамичная поза на круглой подставке, покраска «миниатюры».' },
    real:    { name: 'Реализм', desc: 'Реальные пропорции, суставы, реалистичные материалы.' },
};
export const STYLED_CHARACTERS = ['soldier', 'mechanic', 'android'];

// ---------------------------------------------------------------------------------------------
// Procedural textures (shared per scene). Skipped when no 2D canvas is available (headless tests).
// ---------------------------------------------------------------------------------------------
const TEX_CACHE = new WeakMap();
function texturesFor(scene) {
    if (TEX_CACHE.has(scene)) return TEX_CACHE.get(scene);
    const out = {};
    const make = (name, draw) => {
        const dt = new (B().DynamicTexture)('ptex_' + name, 256, scene, true);
        const ctx = dt.getContext();
        if (!ctx || !ctx.fillRect) return null;
        draw(ctx);
        dt.update(false);
        dt.wrapU = dt.wrapV = 1;
        return dt;
    };
    let seed = 11; const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    // scratched metal: grey base with fine streaks and dents (used as bump + roughness)
    out.metal = make('metal', ctx => {
        ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, 256, 256);
        for (let i = 0; i < 900; i++) { const g = 100 + Math.floor(rnd() * 60); ctx.strokeStyle = 'rgb(' + g + ',' + g + ',' + g + ')'; ctx.lineWidth = 0.5 + rnd(); ctx.beginPath(); const x = rnd() * 256, y = rnd() * 256, a = rnd() * 6.3, l = 4 + rnd() * 30; ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke(); }
        for (let i = 0; i < 40; i++) { ctx.fillStyle = 'rgba(60,60,60,0.5)'; ctx.beginPath(); ctx.arc(rnd() * 256, rnd() * 256, 1 + rnd() * 3, 0, 7); ctx.fill(); }
        for (let i = 0; i < 6; i++) { ctx.strokeStyle = 'rgba(40,40,40,0.8)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.rect(rnd() * 200, rnd() * 200, 40 + rnd() * 80, 40 + rnd() * 80); ctx.stroke(); }
    });
    // woven fabric: fine cross-hatch
    out.cloth = make('cloth', ctx => {
        ctx.fillStyle = '#7f7f7f'; ctx.fillRect(0, 0, 256, 256);
        for (let y = 0; y < 256; y += 3) { ctx.fillStyle = y % 6 ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.18)'; ctx.fillRect(0, y, 256, 1); }
        for (let x = 0; x < 256; x += 3) { ctx.fillStyle = x % 6 ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)'; ctx.fillRect(x, 0, 1, 256); }
        for (let i = 0; i < 300; i++) { ctx.fillStyle = 'rgba(0,0,0,' + (0.05 + rnd() * 0.15) + ')'; ctx.fillRect(rnd() * 256, rnd() * 256, 2 + rnd() * 6, 2 + rnd() * 6); }
    });
    // skin pores: soft noise
    out.skin = make('skin', ctx => {
        ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, 256, 256);
        for (let i = 0; i < 4000; i++) { const g = 110 + Math.floor(rnd() * 40); ctx.fillStyle = 'rgba(' + g + ',' + g + ',' + g + ',0.6)'; ctx.beginPath(); ctx.arc(rnd() * 256, rnd() * 256, 0.6 + rnd() * 1.2, 0, 7); ctx.fill(); }
    });
    // sculpted base: plating with rivets
    out.base = make('base', ctx => {
        ctx.fillStyle = '#4a4f55'; ctx.fillRect(0, 0, 256, 256);
        ctx.strokeStyle = '#2a2e33'; ctx.lineWidth = 3;
        for (const [x, y, w, h] of [[10, 10, 110, 90], [130, 10, 116, 60], [130, 80, 116, 70], [10, 110, 60, 136], [80, 110, 166, 136]]) { ctx.strokeRect(x, y, w, h); ctx.fillStyle = '#5a6068'; ctx.fillRect(x + 3, y + 3, w - 6, h - 6); }
        ctx.fillStyle = '#8a9099'; for (let i = 0; i < 24; i++) { ctx.beginPath(); ctx.arc(14 + (i % 6) * 46, 14 + Math.floor(i / 6) * 76, 3, 0, 7); ctx.fill(); }
        ctx.fillStyle = 'rgba(0,0,0,0.35)'; for (let i = 0; i < 120; i++) ctx.fillRect(rnd() * 256, rnd() * 256, 2 + rnd() * 10, 1 + rnd() * 3);
    });
    TEX_CACHE.set(scene, out);
    return out;
}

// ---------------------------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------------------------
const ZONE_KIND = { skin: 'skin', hair: 'hair', visor: 'glow', lights: 'glow', armor: 'metal', accent: 'metal', helmet: 'metal', vest: 'cloth', pants: 'cloth', overall: 'cloth', gloves: 'rubber', shirt: 'cloth' };
const MAT_CACHE = new WeakMap();
/** Material for a paint zone in a given style (cached per scene). */
export function styleMat(scene, style, zone, hex, fixedKind) {
    const kind = fixedKind || ZONE_KIND[zone] || 'cloth';
    if (style === 'rounded' || style === 'lowpoly') return flatMat(scene, hex, kind === 'glow' ? { emissive: 1.0 } : { spec: kind === 'metal' ? 0.5 : kind === 'skin' || kind === 'hair' ? 0.02 : 0.15 });
    let cache = MAT_CACHE.get(scene); if (!cache) { cache = new Map(); MAT_CACHE.set(scene, cache); }
    const key = style + '|' + kind + '|' + hex;
    if (cache.has(key)) return cache.get(key);
    const tex = texturesFor(scene);
    const m = new (B().PBRMaterial)('pbr_' + key, scene);
    const c = B().Color3.FromHexString(hex);
    m.albedoColor = c;
    m.metallic = 0; m.roughness = 0.8;
    if (style === 'mini') {
        // painted plastic: no real metal, satin finish, slight brightening of edges via sheen
        m.roughness = kind === 'glow' ? 0.3 : kind === 'metal' ? 0.45 : 0.6; m.metallic = kind === 'metal' ? 0.15 : 0;
        m.sheen.isEnabled = true; m.sheen.intensity = 0.35; m.sheen.roughness = 0.6;
        if (kind === 'glow') { m.emissiveColor = c.scale(0.9); }
    } else {
        switch (kind) {
            case 'metal': m.metallic = style === 'real' ? 0.85 : 0.7; m.roughness = 0.38; if (tex.metal) { m.bumpTexture = tex.metal; m.bumpTexture.level = 0.6; m.metallicTexture = tex.metal; m.useRoughnessFromMetallicTextureGreen = true; m.useMetallnessFromMetallicTextureBlue = false; m.useRoughnessFromMetallicTextureAlpha = false; } break;
            case 'cloth': m.roughness = 0.95; if (tex.cloth) { m.bumpTexture = tex.cloth; m.bumpTexture.level = 0.5; m.bumpTexture.uScale = m.bumpTexture.vScale = 4; } m.sheen.isEnabled = true; m.sheen.intensity = 0.2; m.sheen.roughness = 0.8; break;
            case 'rubber': m.roughness = 0.6; break;
            case 'skin': m.roughness = style === 'real' ? 0.55 : 0.65; if (tex.skin) { m.bumpTexture = tex.skin; m.bumpTexture.level = 0.25; m.bumpTexture.uScale = m.bumpTexture.vScale = 2; } m.subSurface.isTranslucencyEnabled = style === 'real'; m.subSurface.translucencyIntensity = 0.4; m.subSurface.tintColor = new (B().Color3)(0.9, 0.4, 0.3); break;
            case 'hair': m.roughness = 0.5; m.anisotropy.isEnabled = style === 'real'; m.anisotropy.intensity = 0.6; break;
            case 'glass': m.alpha = 0.3; m.roughness = 0.05; m.metallic = 0.1; m.backFaceCulling = false; break;
            case 'glow': m.emissiveColor = c.scale(1.0); m.roughness = 0.3; break;
            case 'plastic': m.roughness = 0.4; break;
        }
    }
    m.environmentIntensity = 0.9;
    cache.set(key, m);
    return m;
}

// ---------------------------------------------------------------------------------------------
// Primitive helpers (style-aware shading)
// ---------------------------------------------------------------------------------------------
function prims(scene, style) {
    const flat = style === 'rounded' || style === 'mini';
    const tess = style === 'rounded' ? 10 : style === 'mini' ? 14 : 24;
    const seg = style === 'rounded' ? 6 : style === 'mini' ? 8 : 16;
    const fin = m => { if (flat) m.convertToFlatShadedMesh(); m.isPickable = false; return m; };
    const place = (m, parent, x, y, z, rot) => { m.parent = parent; m.position.set(x, y, z); if (rot) m.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0); return fin(m); };
    return {
        box: (w, h, d, parent, x, y, z, rot) => place(B().MeshBuilder.CreateBox('b', { width: w, height: h, depth: d }, scene), parent, x, y, z, rot),
        cyl: (dt, db, h, parent, x, y, z, rot) => place(B().MeshBuilder.CreateCylinder('c', { diameterTop: dt, diameterBottom: db, height: h, tessellation: tess }, scene), parent, x, y, z, rot),
        sph: (d, parent, x, y, z, scl) => { const m = place(B().MeshBuilder.CreateSphere('s', { diameter: d, segments: seg }, scene), parent, x, y, z); if (scl) m.scaling.set(scl[0], scl[1], scl[2]); return m; },
        cap: (r, h, parent, x, y, z, rot) => place(B().MeshBuilder.CreateCapsule('k', { radius: r, height: h, tessellation: tess, subdivisions: 1, capSubdivisions: style === 'rounded' ? 2 : 6 }, scene), parent, x, y, z, rot),
        tor: (d, t, parent, x, y, z, rot) => place(B().MeshBuilder.CreateTorus('t', { diameter: d, thickness: t, tessellation: tess }, scene), parent, x, y, z, rot),
        node: (name, parent, x, y, z, rot) => { const n = new (B().TransformNode)(name, scene); n.parent = parent; n.position.set(x, y, z); if (rot) n.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0); return n; },
    };
}

// ---------------------------------------------------------------------------------------------
// Rig: joints shared by every style. Proportions in "head units" scaled by `prop`.
// ---------------------------------------------------------------------------------------------
function makeRig(P, root, prop) {
    const { hip, knee, ankle, spine, chest, neck, shoulder, elbow, wrist, shoulderW, hipW } = prop;
    const r = {};
    r.hips = P.node('hips', root, 0, hip, 0);
    r.spine = P.node('spine', r.hips, 0, spine - hip, 0);
    r.chest = P.node('chest', r.spine, 0, chest - spine, 0);
    r.neck = P.node('neck', r.chest, 0, neck - chest, 0);
    r.head = P.node('head', r.neck, 0, 0.08, 0);
    for (const s of [-1, 1]) {
        const k = s < 0 ? 'L' : 'R';
        r['shoulder' + k] = P.node('shoulder' + k, r.chest, s * shoulderW, shoulder - chest, 0);
        r['elbow' + k] = P.node('elbow' + k, r['shoulder' + k], 0, -(shoulder - elbow), 0);
        r['hand' + k] = P.node('hand' + k, r['elbow' + k], 0, -(elbow - wrist), 0);
        r['hip' + k] = P.node('hip' + k, r.hips, s * hipW, 0, 0);
        r['knee' + k] = P.node('knee' + k, r['hip' + k], 0, -(hip - knee), 0);
        r['foot' + k] = P.node('foot' + k, r['knee' + k], 0, -(knee - ankle), 0);
    }
    return r;
}
const PROPS = {
    // chunky heroic (lowpoly-like) proportions, height ≈ 2.75
    hero: { hip: 1.4, knee: 0.74, ankle: 0.14, spine: 1.6, chest: 1.95, neck: 2.22, shoulder: 2.1, elbow: 1.62, wrist: 1.2, shoulderW: 0.42, hipW: 0.17, headR: 0.19, legR: 0.12, armR: 0.09 },
    // miniature: slightly larger head & hands, stockier
    mini: { hip: 1.35, knee: 0.72, ankle: 0.14, spine: 1.55, chest: 1.9, neck: 2.16, shoulder: 2.05, elbow: 1.6, wrist: 1.2, shoulderW: 0.4, hipW: 0.17, headR: 0.21, legR: 0.13, armR: 0.1 },
    // realistic 7.5 heads
    real: { hip: 1.42, knee: 0.78, ankle: 0.12, spine: 1.62, chest: 2.0, neck: 2.3, shoulder: 2.2, elbow: 1.78, wrist: 1.36, shoulderW: 0.33, hipW: 0.15, headR: 0.165, legR: 0.1, armR: 0.07 },
};

// ---------------------------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------------------------
export function buildStyledCharacter(scene, charId, colors, style) {
    const S = scene;
    const P = prims(S, style);
    const root = new (B().TransformNode)('char_' + charId + '_' + style, S);
    const zones = {}; const fixed = [];
    const Z = (zone, mesh) => { (zones[zone] = zones[zone] || []).push(mesh); return mesh; };
    const F = (hex, mesh, kind) => { fixed.push([mesh, hex, kind]); return mesh; };
    const prop = PROPS[style === 'real' ? 'real' : style === 'mini' ? 'mini' : 'hero'];
    const R = makeRig(P, root, prop);
    const FX = { gun: '#23282e', gunLight: '#4a525c', steel: '#8c96a0', dark: '#3a424b', rubber: '#1a1d21', glass: '#9fd8ff', strap: '#3b3127' };
    const smooth = style !== 'rounded' && style !== 'mini';

    // ---------------------------------------------------------------- common body -----------
    function body(z) {
        // z = { legs, boots, torso, arms, hands, neckZone }
        const { legR, armR, headR } = prop;
        for (const k of ['L', 'R']) {
            const s = k === 'L' ? -1 : 1;
            const thighLen = prop.hip - prop.knee, shinLen = prop.knee - prop.ankle;
            Z(z.legs, P.cap(legR * 1.15, thighLen, R['hip' + k], 0, -thighLen / 2, 0));
            Z(z.legs, P.sph(legR * 2.1, R['knee' + k], 0, 0, 0));
            Z(z.legs, P.cap(legR, shinLen, R['knee' + k], 0, -shinLen / 2, 0));
            Z(z.boots, P.cap(legR * 1.25, 0.2, R['foot' + k], 0, -0.02, 0.04, [Math.PI / 2, 0, 0]));
            Z(z.boots, P.box(legR * 2.3, 0.12, legR * 3.4, R['foot' + k], 0, -0.08, 0.06));
            const upLen = prop.shoulder - prop.elbow, loLen = prop.elbow - prop.wrist;
            Z(z.arms, P.sph(armR * 2.6, R['shoulder' + k], 0, 0, 0));
            Z(z.arms, P.cap(armR * 1.1, upLen, R['shoulder' + k], 0, -upLen / 2, 0));
            Z(z.arms, P.sph(armR * 2.0, R['elbow' + k], 0, 0, 0));
            Z(z.arms, P.cap(armR, loLen, R['elbow' + k], 0, -loLen / 2, 0));
            // hand: palm + thumb (+ fingers in realistic style)
            Z(z.hands, P.box(armR * 2.2, 0.16, armR * 1.4, R['hand' + k], 0, -0.08, 0.01));
            Z(z.hands, P.cap(armR * 0.45, 0.08, R['hand' + k], s * armR * 1.3, -0.06, 0.04, [0.6, 0, 0]));
            if (style === 'real') for (let f = 0; f < 4; f++) Z(z.hands, P.cap(armR * 0.32, 0.1, R['hand' + k], -armR * 0.9 + f * armR * 0.6, -0.2, 0.02));
            void s;
        }
        // pelvis / torso
        Z(z.legs, P.sph(prop.hipW * 2.6, R.hips, 0, 0.02, 0, [1, 0.75, 0.8]));
        Z(z.torso, P.cap(prop.shoulderW * 0.62, prop.chest - prop.spine + 0.1, R.spine, 0, (prop.chest - prop.spine) / 2, 0));
        Z(z.torso, P.sph(prop.shoulderW * 1.9, R.chest, 0, 0.02, 0, [1, 0.6, 0.65]));
        // neck + head
        Z(z.neckZone || 'skin', P.cyl(headR * 0.7, headR * 0.8, 0.16, R.neck, 0, 0.0, 0));
        const head = Z('skin', P.sph(headR * 2, R.head, 0, headR, 0.02, [0.92, 1.08, 1]));
        Z('skin', P.sph(headR * 0.4, R.head, 0, headR * 0.85, headR * 0.98));                          // nose
        Z('skin', P.box(headR * 0.9, headR * 0.5, headR * 0.8, R.head, 0, headR * 0.35, headR * 0.25)); // jaw
        if (smooth || style === 'mini') {
            for (const s of [-1, 1]) { F('#ffffff', P.sph(headR * 0.32, R.head, s * headR * 0.38, headR * 1.1, headR * 0.86), 'plastic'); F('#1a1a1a', P.sph(headR * 0.16, R.head, s * headR * 0.38, headR * 1.1, headR * 1.0), 'plastic'); }
            F('#6b3a2a', P.box(headR * 0.5, headR * 0.1, headR * 0.3, R.head, 0, headR * 0.45, headR * 0.98), 'skin');   // lips
            for (const s of [-1, 1]) Z('hair', P.box(headR * 0.5, headR * 0.1, headR * 0.2, R.head, s * headR * 0.38, headR * 1.35, headR * 0.9));   // brows
        }
        return head;
    }

    // ---------------------------------------------------------------- SOLDIER ---------------
    function soldier() {
        body({ legs: 'pants', boots: 'armor', torso: 'armor', arms: 'armor', hands: 'pants', neckZone: 'armor' });
        const { headR, shoulderW } = prop;
        // armour plates over the body
        Z('armor', P.cap(shoulderW * 0.78, 0.5, R.spine, 0, 0.3, 0.02));
        Z('armor', P.box(shoulderW * 1.5, 0.34, 0.22, R.chest, 0, 0.0, 0.26));                 // chest plate
        Z('accent', P.box(0.3, 0.08, 0.05, R.chest, 0, 0.1, 0.38));
        Z('visor', P.box(0.14, 0.04, 0.03, R.chest, 0, 0.1, 0.41));
        Z('armor', P.box(shoulderW * 1.1, 0.24, 0.18, R.spine, 0, -0.05, 0.22));              // abdomen
        Z('armor', P.box(shoulderW * 1.8, 0.14, 0.5, R.hips, 0, 0.08, 0));                   // belt armour
        F(FX.dark, P.box(0.42, 0.5, 0.1, R.chest, 0, -0.1, -0.3));
        Z('armor', P.box(0.6, 0.6, 0.28, R.chest, 0, -0.12, -0.46));                          // backpack
        for (const s of [-1, 1]) { F(FX.steel, P.cyl(0.16, 0.16, 0.7, R.chest, s * 0.18, 0.0, -0.66)); Z('accent', P.cyl(0.17, 0.17, 0.08, R.chest, s * 0.18, 0.38, -0.66)); }
        for (const k of ['L', 'R']) {
            const s = k === 'L' ? -1 : 1;
            Z('armor', P.sph(0.5, R['shoulder' + k], s * 0.08, 0.1, 0, [1, 0.7, 1]));           // pauldron
            Z('accent', P.tor(0.46, 0.06, R['shoulder' + k], s * 0.08, 0.12, 0, [0, 0, s * 0.3]));
            Z('armor', P.cyl(0.3, 0.26, 0.36, R['shoulder' + k], 0, -0.26, 0));
            Z('accent', P.tor(0.26, 0.05, R['elbow' + k], 0, 0, 0));
            Z('armor', P.cyl(0.24, 0.22, 0.36, R['elbow' + k], 0, -0.22, 0));
            Z('armor', P.cyl(0.36, 0.3, 0.34, R['hip' + k], 0, -0.3, 0));                     // thigh armour
            Z('accent', P.tor(0.3, 0.05, R['knee' + k], 0, 0, 0));
            Z('armor', P.box(0.24, 0.4, 0.12, R['knee' + k], 0, -0.3, 0.12));                 // shin plate
        }
        // dome helmet
        Z('armor', P.cyl(headR * 2.6, headR * 2.9, 0.12, R.neck, 0, 0.04, 0));
        Z('visor', P.tor(headR * 2.6, 0.04, R.neck, 0, 0.1, 0));
        F(FX.glass, P.sph(headR * 3.2, R.head, 0, headR * 0.95, 0.02, [1, 1.05, 1]), 'glass');
        Z('armor', P.box(0.22, 0.16, 0.2, R.head, 0, headR * 2.5, -0.1));
        for (const s of [-1, 1]) Z('visor', P.sph(0.07, R.head, s * headR * 1.5, headR * 1.4, headR * 0.6));
        Z('hair', P.sph(headR * 1.9, R.head, 0, headR * 1.3, -0.02, [1, 0.5, 1]));
        // rifle across the waist
        const gun = P.node('gun', R.handR, -0.1, -0.1, 0.1, [0, -Math.PI / 2 - 0.2, 0]);
        F(FX.gun, P.box(1.5, 0.18, 0.14, gun, 0.2, 0, 0)); F(FX.gunLight, P.cyl(0.26, 0.26, 0.5, gun, 0.1, 0.02, 0, [0, 0, Math.PI / 2]));
        F(FX.gun, P.cyl(0.08, 0.08, 0.7, gun, 1.1, 0.05, 0, [0, 0, Math.PI / 2])); F(FX.gun, P.box(0.26, 0.32, 0.12, gun, -0.4, -0.16, 0)); F(FX.gun, P.box(0.1, 0.24, 0.06, gun, 0.0, -0.22, 0));
        Z('visor', P.box(0.06, 0.04, 0.04, gun, 0.5, 0.12, 0));
        pose({ shoulderL: [-1.0, 0.5, 0.5], elbowL: [-1.2, 0, 0], shoulderR: [-0.7, -0.3, -0.3], elbowR: [-1.4, 0, 0], legs: 0.12 });
    }

    // ---------------------------------------------------------------- MECHANIC --------------
    function mechanic() {
        body({ legs: 'overall', boots: 'gloves', torso: 'overall', arms: 'overall', hands: 'gloves' });
        const { headR, shoulderW } = prop;
        Z('helmet', P.box(shoulderW * 1.5, 0.4, 0.14, R.chest, 0, 0, 0.26));                   // white chest plating
        Z('helmet', P.box(shoulderW * 1.3, 0.2, 0.1, R.spine, 0, -0.02, 0.22));
        Z('lights', P.box(0.1, 0.05, 0.03, R.chest, 0.14, 0.1, 0.34));
        F(FX.strap, P.box(0.08, 0.7, 0.04, R.chest, -0.14, -0.05, 0.3)); F(FX.strap, P.box(0.08, 0.7, 0.04, R.chest, 0.14, -0.05, 0.3));
        F(FX.dark, P.box(0.5, 0.5, 0.22, R.chest, 0, -0.1, -0.36));                          // gas unit on the back
        for (const s of [-1, 1]) F(FX.steel, P.cyl(0.12, 0.12, 0.5, R.chest, s * 0.14, -0.05, -0.5));
        // hoses: tanks → mask
        for (const s of [-1, 1]) { F(FX.rubber, P.cyl(0.05, 0.05, 0.5, R.chest, s * 0.2, 0.3, -0.3, [0.9, 0, s * 0.4])); F(FX.rubber, P.cyl(0.05, 0.05, 0.36, R.head, s * headR * 0.9, headR * 0.3, -0.1, [-0.9, 0, s * 0.4])); }
        // tool belt & pouches
        F(FX.strap, P.tor(prop.hipW * 2.9, 0.07, R.hips, 0, 0.06, 0));
        for (let i = 0; i < 3; i++) F(FX.steel, P.box(0.06, 0.16, 0.06, R.hips, -0.14 + i * 0.1, -0.04, 0.2));
        F(FX.strap, P.box(0.16, 0.18, 0.12, R.hips, 0.26, -0.06, 0.1)); F(FX.strap, P.box(0.16, 0.18, 0.12, R.hips, -0.26, -0.06, -0.1));
        for (const k of ['L', 'R']) { Z('helmet', P.cyl(0.3, 0.28, 0.2, R['shoulder' + k], 0, -0.16, 0)); Z('gloves', P.cyl(0.22, 0.26, 0.3, R['elbow' + k], 0, -0.36, 0)); Z('helmet', P.box(0.22, 0.3, 0.1, R['knee' + k], 0, -0.26, 0.1)); }
        // welding mask with a square window, flipped slightly up
        const mask = P.node('mask', R.head, 0, headR * 1.1, 0.08, [-0.35, 0, 0]);
        Z('helmet', P.box(headR * 2.4, headR * 2.5, headR * 1.2, mask, 0, 0, headR * 0.5));
        Z('helmet', P.box(headR * 2.6, headR * 0.5, headR * 2.2, mask, 0, headR * 1.3, -0.02));
        F(FX.dark, P.box(headR * 1.6, headR * 0.9, 0.05, mask, 0, headR * 0.3, headR * 1.12));
        Z('lights', P.box(headR * 1.3, headR * 0.6, 0.02, mask, 0, headR * 0.3, headR * 1.16));
        for (const s of [-1, 1]) Z('lights', P.sph(0.07, mask, s * headR * 1.1, headR * 1.0, headR * 0.6));
        Z('hair', P.sph(headR * 1.9, R.head, 0, headR * 1.3, -0.02, [1, 0.5, 1]));
        // sawed-off in the right hand, big wrench in the left
        const g = P.node('gun', R.handR, 0, -0.12, 0.1, [0, 0, 0]);
        F(FX.gun, P.cyl(0.07, 0.07, 0.6, g, -0.04, 0, 0.3, [Math.PI / 2, 0, 0])); F(FX.gun, P.cyl(0.07, 0.07, 0.6, g, 0.04, 0, 0.3, [Math.PI / 2, 0, 0])); F('#5a3a22', P.box(0.12, 0.14, 0.16, g, 0, -0.04, -0.02), 'cloth');
        F(FX.steel, P.cyl(0.05, 0.05, 0.7, R.handL, 0, -0.1, 0, [0, 0, 0.1])); F(FX.steel, P.box(0.16, 0.14, 0.06, R.handL, 0.04, -0.5, 0)); F(FX.steel, P.box(0.06, 0.08, 0.06, R.handL, 0.1, -0.56, 0));
        pose({ shoulderL: [-0.4, 0, 0.3], elbowL: [-0.6, 0, 0], shoulderR: [-1.1, 0, -0.2], elbowR: [-0.5, 0, 0], legs: 0.1 });
    }

    // ---------------------------------------------------------------- ANDROID ---------------
    function android() {
        body({ legs: 'pants', boots: 'pants', torso: 'shirt', arms: 'shirt', hands: 'skin' });
        const { headR, shoulderW } = prop;
        Z('vest', P.cap(shoulderW * 0.72, 0.42, R.spine, 0, 0.3, 0));                         // fitted vest
        Z('vest', P.box(shoulderW * 1.2, 0.5, 0.08, R.chest, 0, -0.06, 0.2)); Z('vest', P.box(shoulderW * 1.3, 0.5, 0.08, R.chest, 0, -0.06, -0.2));
        Z('shirt', P.box(0.14, 0.3, 0.03, R.chest, 0, 0.06, 0.26));                           // shirt front
        F(FX.steel, P.box(0.04, 0.04, 0.03, R.chest, 0, 0.14, 0.27)); F(FX.steel, P.box(0.04, 0.04, 0.03, R.chest, 0, 0.02, 0.27));
        Z('shirt', P.tor(shoulderW * 1.4, 0.05, R.chest, 0, 0.34, 0, [0.2, 0, 0]));           // shawl collar
        for (const k of ['L', 'R']) { const s = k === 'L' ? -1 : 1; Z('shirt', P.cyl(0.2, 0.17, 0.3, R['elbow' + k], 0, -0.26, 0)); void s; }
        // implants: temple module, cheek line, glowing dot on the forehead
        F(FX.steel, P.box(0.07, 0.14, 0.05, R.head, -headR * 1.0, headR * 1.0, 0.0));
        Z('lights', P.box(0.03, 0.1, 0.03, R.head, headR * 1.0, headR * 1.0, 0.02));
        Z('lights', P.sph(0.05, R.head, 0, headR * 1.5, headR * 0.98));
        Z('lights', P.box(0.03, 0.03, 0.03, R.head, -headR * 0.45, headR * 0.65, headR * 0.98));
        // hair: cap + ponytail
        Z('hair', P.sph(headR * 2.1, R.head, 0, headR * 1.2, -0.03, [1, 0.72, 1]));
        Z('hair', P.sph(0.2, R.head, 0, headR * 1.15, -headR * 1.1));
        Z('hair', P.cap(0.07, 0.4, R.head, 0, headR * 0.6, -headR * 1.3, [0.25, 0, 0]));
        // energy pistol held low in the right hand
        const g = P.node('gun', R.handR, 0, -0.12, 0.1);
        F(FX.gun, P.box(0.06, 0.1, 0.36, g, 0, 0.04, 0.14)); F(FX.gunLight, P.box(0.08, 0.14, 0.1, g, 0, -0.03, -0.02)); Z('lights', P.box(0.03, 0.03, 0.2, g, 0, 0.1, 0.14));
        pose({ shoulderL: [0.15, 0, 0.1], elbowL: [-0.2, 0, 0], shoulderR: [-0.35, 0, -0.1], elbowR: [-0.3, 0, 0], legs: 0.08 });
    }

    // ---------------------------------------------------------------- pose helpers ----------
    function pose(p) {
        const set = (n, r) => { if (R[n] && r) R[n].rotation.set(r[0], r[1], r[2]); };
        set('shoulderL', p.shoulderL); set('elbowL', p.elbowL); set('shoulderR', p.shoulderR); set('elbowR', p.elbowR);
        R.hipL.rotation.set(-0.02, 0, p.legs || 0.1); R.hipR.rotation.set(0.02, 0, -(p.legs || 0.1));
        R.kneeL.rotation.z = -(p.legs || 0.1) * 0.7; R.kneeR.rotation.z = (p.legs || 0.1) * 0.7;
    }
    function miniaturePose() {
        // dynamic "advancing" stance: weight on the back leg, torso twisted, head turned toward the threat
        R.hips.rotation.y = 0.35; R.spine.rotation.set(0.12, -0.25, 0); R.chest.rotation.set(0.08, -0.15, 0); R.head.rotation.set(0.05, 0.4, 0);
        R.hipL.rotation.set(-0.55, 0.1, 0.12); R.kneeL.rotation.x = 0.5; R.footL.rotation.x = 0.05;
        R.hipR.rotation.set(0.5, -0.1, -0.1); R.kneeR.rotation.x = 0.95; R.footR.rotation.x = -0.9;
        R.hips.position.y -= 0.14;
        // sculpted base: round plinth with deck plates and debris
        const base = P.node('base', root, 0, 0, 0);
        const bm = F(null, P.cyl(1.7, 1.9, 0.14, base, 0, -0.07, 0), 'base');
        F(FX.dark, P.tor(1.75, 0.06, base, 0, 0.0, 0));
        F(FX.steel, P.box(0.5, 0.06, 0.3, base, 0.5, 0.03, -0.4, [0, 0.5, 0]));
        F(FX.steel, P.box(0.3, 0.1, 0.3, base, -0.6, 0.05, 0.3, [0, -0.3, 0.2]));
        F(FX.rubber, P.cyl(0.06, 0.06, 0.6, base, -0.3, 0.04, -0.5, [0, 0, Math.PI / 2]));
        return bm;
    }

    // ---------------------------------------------------------------- build ---------------
    if (charId === 'soldier') soldier(); else if (charId === 'mechanic') mechanic(); else android();
    let baseMesh = null;
    if (style === 'mini') baseMesh = miniaturePose();

    // fixed materials
    for (const [mesh, hex, kind] of fixed) {
        if (kind === 'base') { const m = styleMat(S, style, 'base', '#5a6068', 'plastic'); const tex = texturesFor(S); if (tex.base) { m.albedoTexture = tex.base; m.bumpTexture = tex.base; m.bumpTexture.level = 0.8; } mesh.material = m; continue; }
        mesh.material = styleMat(S, style, 'fixed', hex, kind || (hex === FX.glass ? 'glass' : hex === FX.steel || hex === FX.gun || hex === FX.gunLight || hex === FX.dark ? 'metal' : hex === FX.rubber || hex === FX.strap ? 'rubber' : 'metal'));
        if (hex === FX.glass && (style === 'rounded')) mesh.material = flatMat(S, FX.glass, { alpha: 0.35, spec: 0.8 });
    }
    function setColors(c) {
        for (const [zone, meshes] of Object.entries(zones)) {
            const hex = c[zone] || (DEFAULTS[charId] || {})[zone] || '#888888';
            const mat = styleMat(S, style, zone, hex);
            for (const m of meshes) m.material = mat;
        }
    }
    setColors(colors || {});
    for (const m of root.getChildMeshes()) m.isPickable = false;
    root.scaling.setAll(0.66);
    // idle animation: breathing + slight sway (miniatures stay still like plastic)
    const t0 = Math.random() * 10;
    const animate = style === 'mini' ? () => {} : (t) => {
        const b = Math.sin((t + t0) * 1.6);
        R.chest.rotation.x = 0.02 * b; R.chest.position.y = prop.chest - prop.spine + 0.01 * b;
        R.head.rotation.y = 0.06 * Math.sin((t + t0) * 0.5); R.head.rotation.x = 0.02 * Math.sin((t + t0) * 0.9);
        R.spine.rotation.z = 0.015 * Math.sin((t + t0) * 0.7);
    };
    return { root, zones, setColors, animate, rig: R, base: baseMesh };
}
