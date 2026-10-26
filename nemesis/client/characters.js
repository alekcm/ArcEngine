// characters.js — procedural low-poly characters and intruders (Babylon.js).
// Every character is assembled from boxes/cylinders; each part is bound to a paint zone so the
// player can recolour it. The set of zones differs per character (see data/cards.mjs CHARACTERS).

const B = () => window.BABYLON;

const MAT_CACHE = new WeakMap();   // scene -> Map(key -> material)
/** Flat-shaded material for a colour (cached per scene+colour). */
export function flatMat(scene, hex, opts = {}) {
    let cache = MAT_CACHE.get(scene);
    if (!cache) { cache = new Map(); MAT_CACHE.set(scene, cache); }
    const key = hex + '|' + (opts.emissive || '') + '|' + (opts.alpha || '');
    if (cache.has(key)) return cache.get(key);
    const m = new (B().StandardMaterial)('m_' + hex, scene);
    const c = B().Color3.FromHexString(hex);
    m.diffuseColor = c;
    m.specularColor = new (B().Color3)(0.08, 0.08, 0.08);
    if (opts.emissive) { m.emissiveColor = c.scale(opts.emissive); }
    if (opts.alpha) m.alpha = opts.alpha;
    m.freeze();
    cache.set(key, m);
    return m;
}

function box(scene, name, w, h, d, parent, x, y, z) {
    const m = B().MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene);
    m.parent = parent; m.position.set(x, y, z);
    m.convertToFlatShadedMesh();
    return m;
}
function cyl(scene, name, dTop, dBot, h, tess, parent, x, y, z) {
    const m = B().MeshBuilder.CreateCylinder(name, { diameterTop: dTop, diameterBottom: dBot, height: h, tessellation: tess }, scene);
    m.parent = parent; m.position.set(x, y, z);
    m.convertToFlatShadedMesh();
    return m;
}
function sphere(scene, name, d, seg, parent, x, y, z) {
    const m = B().MeshBuilder.CreateSphere(name, { diameter: d, segments: seg }, scene);
    m.parent = parent; m.position.set(x, y, z);
    m.convertToFlatShadedMesh();
    return m;
}

/**
 * Build a character. Returns { root, zones: {zoneId: [meshes]}, setColors(colors) }.
 * Height ≈ 1.8 units.
 */
export function buildCharacter(scene, charId, colors = {}) {
    const root = new (B().TransformNode)('char_' + charId, scene);
    const zones = {};
    const bind = (zone, mesh) => { (zones[zone] = zones[zone] || []).push(mesh); return mesh; };
    const S = scene;

    // Common body proportions
    const legH = 0.8, torsoH = 0.62, headD = 0.3;
    const legZone = { soldier: 'pants', scout: 'suit', mechanic: 'overall' }[charId];
    const torsoZone = { soldier: 'armor', scout: 'jacket', mechanic: 'overall' }[charId];
    const armZone = { soldier: 'armor', scout: 'jacket', mechanic: 'overall' }[charId];
    const handZone = { soldier: 'skin', scout: 'skin', mechanic: 'gloves' }[charId];
    const footZone = { soldier: 'pants', scout: 'boots', mechanic: 'gloves' }[charId];
    const glowZone = { soldier: 'visor', scout: 'visor', mechanic: 'lights' }[charId];
    const hairZone = charId === 'mechanic' ? 'helmet' : 'hair';

    // legs
    for (const s of [-1, 1]) {
        bind(legZone, box(S, 'leg', 0.2, legH, 0.22, root, s * 0.13, legH / 2, 0));
        bind(footZone, box(S, 'foot', 0.22, 0.1, 0.3, root, s * 0.13, 0.05, 0.05));
    }
    // hips / belt
    bind(legZone, box(S, 'hips', 0.5, 0.16, 0.3, root, 0, legH + 0.06, 0));
    // torso
    const torso = bind(torsoZone, box(S, 'torso', 0.56, torsoH, 0.32, root, 0, legH + 0.14 + torsoH / 2, 0));
    // shoulders
    for (const s of [-1, 1]) {
        bind(armZone, box(S, 'shoulder', 0.2, 0.18, 0.3, root, s * 0.38, legH + 0.14 + torsoH - 0.08, 0));
        bind(armZone, box(S, 'arm', 0.16, 0.5, 0.18, root, s * 0.4, legH + 0.14 + torsoH - 0.42, 0));
        bind(handZone, box(S, 'hand', 0.15, 0.16, 0.16, root, s * 0.4, legH + 0.14 + torsoH - 0.75, 0.02));
    }
    // neck + head
    const headY = legH + 0.14 + torsoH + 0.08 + headD / 2;
    bind('skin', box(S, 'neck', 0.14, 0.12, 0.14, root, 0, legH + 0.14 + torsoH + 0.04, 0));
    bind('skin', box(S, 'head', headD, headD + 0.04, headD, root, 0, headY, 0));

    if (charId === 'soldier') {
        // chest plate + accent stripes
        bind('accent', box(S, 'chest', 0.4, 0.2, 0.06, root, 0, legH + 0.14 + torsoH * 0.65, 0.18));
        bind('accent', box(S, 'stripeL', 0.06, 0.4, 0.06, root, -0.22, legH + 0.14 + torsoH * 0.45, 0.17));
        bind('accent', box(S, 'stripeR', 0.06, 0.4, 0.06, root, 0.22, legH + 0.14 + torsoH * 0.45, 0.17));
        // helmet-ish hair cap and visor
        bind('hair', box(S, 'hair', headD + 0.04, 0.1, headD + 0.04, root, 0, headY + headD / 2 + 0.02, 0));
        bind('visor', box(S, 'visor', 0.26, 0.07, 0.04, root, 0, headY + 0.03, headD / 2 + 0.02));
        // backpack
        bind('armor', box(S, 'pack', 0.36, 0.4, 0.14, root, 0, legH + 0.14 + torsoH * 0.5, -0.22));
        // knee pads
        for (const s of [-1, 1]) bind('accent', box(S, 'knee', 0.22, 0.12, 0.08, root, s * 0.13, legH * 0.45, 0.13));
    } else if (charId === 'scout') {
        // slimmer jacket collar, long hair, visor goggles, boots
        bind('jacket', box(S, 'collar', 0.5, 0.1, 0.36, root, 0, legH + 0.14 + torsoH - 0.02, 0));
        bind('hair', box(S, 'hair', headD + 0.06, 0.12, headD + 0.06, root, 0, headY + headD / 2, -0.01));
        bind('hair', box(S, 'hairBack', headD + 0.02, 0.3, 0.1, root, 0, headY - 0.02, -headD / 2 - 0.03));
        bind('visor', box(S, 'goggles', 0.3, 0.08, 0.05, root, 0, headY + 0.04, headD / 2 + 0.02));
        for (const s of [-1, 1]) bind('boots', box(S, 'boot', 0.22, 0.26, 0.24, root, s * 0.13, 0.13, 0.01));
        bind('suit', box(S, 'belt', 0.52, 0.08, 0.32, root, 0, legH + 0.16, 0));
    } else {
        // mechanic: hard hat with lamp, tool belt, big gloves
        bind('helmet', cyl(S, 'helmet', 0.36, 0.42, 0.14, 8, root, 0, headY + headD / 2 + 0.05, 0));
        bind('helmet', box(S, 'brim', 0.4, 0.03, 0.14, root, 0, headY + headD / 2 + 0.0, headD / 2 + 0.02));
        bind('lights', box(S, 'lamp', 0.1, 0.08, 0.06, root, 0, headY + headD / 2 + 0.06, headD / 2 + 0.06));
        bind('hair', box(S, 'hair', headD + 0.02, 0.06, headD + 0.02, root, 0, headY + headD / 2 - 0.02, 0));
        bind('gloves', box(S, 'belt', 0.58, 0.1, 0.34, root, 0, legH + 0.2, 0));
        bind('lights', box(S, 'chestLight', 0.1, 0.1, 0.04, root, 0.15, legH + 0.14 + torsoH * 0.7, 0.17));
        bind('gloves', box(S, 'pouch', 0.14, 0.16, 0.1, root, 0.22, legH + 0.08, 0.14));
        for (const s of [-1, 1]) bind('gloves', box(S, 'cuff', 0.2, 0.1, 0.2, root, s * 0.4, legH + 0.14 + torsoH - 0.66, 0.02));
    }

    const emissiveZones = new Set(['visor', 'lights']);
    function setColors(c) {
        for (const [zone, meshes] of Object.entries(zones)) {
            const hex = c[zone] || DEFAULTS[charId][zone] || '#888888';
            const mat = flatMat(scene, hex, emissiveZones.has(zone) ? { emissive: 0.9 } : {});
            for (const m of meshes) m.material = mat;
        }
    }
    setColors(colors);
    for (const m of root.getChildMeshes()) m.isPickable = false;
    return { root, zones, setColors };
}

export const DEFAULTS = {
    soldier: { skin: '#e8b89a', hair: '#2a1b12', armor: '#5a6b5c', accent: '#c0392b', pants: '#2d3436', visor: '#ff3b3b' },
    scout: { skin: '#d29b7c', hair: '#8a1f3a', suit: '#3b2f4a', jacket: '#8e44ad', boots: '#1c1c1c', visor: '#d13bff' },
    mechanic: { skin: '#b5805f', hair: '#5a3a22', overall: '#d68910', helmet: '#ecf0f1', gloves: '#2d3436', lights: '#ffd23b' },
};

/** Low-poly intruder. type: larva | adult | drone | queen */
export function buildIntruder(scene, type) {
    const root = new (B().TransformNode)('intr_' + type, scene);
    const S = scene;
    const dark = flatMat(S, '#1b1f24'), mid = flatMat(S, '#2f3a40'), glow = flatMat(S, '#9cff3b', { emissive: 0.8 });
    const tooth = flatMat(S, '#d9d4c4');
    if (type === 'larva') {
        const b = sphere(S, 'body', 0.45, 6, root, 0, 0.22, 0); b.scaling.set(1, 0.6, 1.4); b.material = mid;
        const t = sphere(S, 'tail', 0.3, 6, root, 0, 0.18, -0.4); t.scaling.set(0.6, 0.5, 1.2); t.material = dark;
        for (let i = 0; i < 4; i++) { const l = box(S, 'leg', 0.05, 0.05, 0.3, root, (i % 2 ? 0.25 : -0.25), 0.1, 0.1 - Math.floor(i / 2) * 0.2); l.material = dark; }
        const e = sphere(S, 'eye', 0.08, 4, root, 0, 0.3, 0.3); e.material = glow;
    } else {
        const s = type === 'queen' ? 1.9 : type === 'drone' ? 1.0 : 1.25;
        root.scaling.set(s, s, s);
        // hunched body
        const body = box(S, 'body', 0.5, 0.7, 0.45, root, 0, 1.0, 0); body.rotation.x = 0.4; body.material = mid;
        const abd = box(S, 'abd', 0.42, 0.4, 0.6, root, 0, 0.8, -0.4); abd.rotation.x = -0.3; abd.material = dark;
        // elongated head
        const head = box(S, 'head', 0.3, 0.26, 0.9, root, 0, 1.45, 0.1); head.rotation.x = -0.15; head.material = dark;
        const jaw = box(S, 'jaw', 0.22, 0.1, 0.3, root, 0, 1.3, 0.45); jaw.material = mid;
        for (let i = 0; i < 4; i++) { const th = box(S, 'tooth', 0.04, 0.08, 0.04, root, -0.08 + i * 0.053, 1.36, 0.58); th.material = tooth; }
        // arms
        for (const sd of [-1, 1]) {
            const ua = box(S, 'ua', 0.12, 0.5, 0.12, root, sd * 0.35, 0.95, 0.15); ua.rotation.x = -0.9; ua.rotation.z = sd * 0.3; ua.material = dark;
            const fa = box(S, 'fa', 0.1, 0.5, 0.1, root, sd * 0.45, 0.6, 0.45); fa.rotation.x = 0.4; fa.material = mid;
            const cl = box(S, 'claw', 0.14, 0.06, 0.22, root, sd * 0.45, 0.37, 0.62); cl.material = tooth;
            // legs
            const th2 = box(S, 'thigh', 0.14, 0.55, 0.16, root, sd * 0.25, 0.55, -0.1); th2.rotation.x = 0.7; th2.material = mid;
            const sh = box(S, 'shin', 0.1, 0.55, 0.12, root, sd * 0.28, 0.28, 0.12); sh.rotation.x = -0.9; sh.material = dark;
            const ft = box(S, 'foot', 0.14, 0.06, 0.3, root, sd * 0.28, 0.03, 0.2); ft.material = dark;
        }
        // tail
        const t1 = box(S, 'tail1', 0.14, 0.14, 0.7, root, 0, 0.75, -0.95); t1.rotation.x = 0.2; t1.material = mid;
        const t2 = box(S, 'tail2', 0.09, 0.09, 0.7, root, 0, 0.95, -1.5); t2.rotation.x = -0.5; t2.material = dark;
        const t3 = box(S, 'sting', 0.06, 0.2, 0.3, root, 0, 1.3, -1.85); t3.material = tooth;
        // spines / crest
        for (let i = 0; i < (type === 'queen' ? 5 : 3); i++) { const sp = box(S, 'spine', 0.06, 0.2 + i * 0.05, 0.06, root, 0, 1.4 - i * 0.12, -0.1 - i * 0.18); sp.material = tooth; }
        if (type === 'queen') { const crown = box(S, 'crest', 0.8, 0.1, 0.5, root, 0, 1.7, -0.2); crown.material = dark; const g = box(S, 'glow', 0.2, 0.06, 0.2, root, 0, 1.62, 0.2); g.material = glow; }
        if (type === 'drone') { for (const sd of [-1, 1]) { const w = box(S, 'wing', 0.04, 0.5, 0.9, root, sd * 0.3, 1.3, -0.4); w.rotation.z = sd * 0.5; w.material = flatMat(S, '#5a6a70', { alpha: 0.7 }); } }
    }
    for (const m of root.getChildMeshes()) m.isPickable = false;
    return root;
}
