// characters.js — procedural low-poly characters and intruders (Babylon.js).
// Characters follow the original Nemesis art: Soldier — heavy power armour with a glass dome
// helmet and a two-handed rifle; Scout — slim plated vest, long hair, glowing tech bracer, rifle on
// the back; Mechanic — welding mask with a square window, hoses, orange/white plating, tools.
// Every part is bound to a paint zone (CHARACTERS[*].zones) so the player can recolour it.

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
};
// Fixed (non-paintable) materials
const FIXED = { gun: '#23282e', gunLight: '#4a525c', steel: '#8c96a0', darkSteel: '#3a424b', rubber: '#1a1d21', glass: '#9fd8ff', strap: '#3b3127' };

/**
 * Build a character. Returns { root, zones: {zoneId: [meshes]}, setColors(colors) }. Height ≈ 2.1.
 */
export function buildCharacter(scene, charId, colors = {}) {
    const S = scene;
    const root = new (B().TransformNode)('char_' + charId, S);
    const zones = {};
    const fixed = [];
    const Z = (zone, mesh) => { (zones[zone] = zones[zone] || []).push(mesh); return mesh; };
    const F = (hex, mesh, opts) => { fixed.push([mesh, hex, opts]); return mesh; };
    const bx = (...a) => box(S, ...a), cy = (...a) => cyl(S, ...a), sp = (...a) => sphere(S, ...a);

    if (charId === 'soldier') buildSoldier();
    else if (charId === 'scout') buildScout();
    else buildMechanic();

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
    return { root, zones, setColors };
}

/** Low-poly intruder. type: larva | adult | drone | queen */
export function buildIntruder(scene, type) {
    const S = scene;
    const root = new (B().TransformNode)('intr_' + type, S);
    const dark = flatMat(S, '#1b1f24', { spec: 0.5 }), mid = flatMat(S, '#2f3a40', { spec: 0.5 }), glow = flatMat(S, '#9cff3b', { emissive: 0.9 });
    const tooth = flatMat(S, '#d9d4c4');
    const bx = (...a) => box(S, ...a), cy = (...a) => cyl(S, ...a), sp = (...a) => sphere(S, ...a);
    if (type === 'larva') {
        sp(0.45, 6, root, 0, 0.22, 0, [1, 0.6, 1.4]).material = mid;
        sp(0.3, 6, root, 0, 0.18, -0.4, [0.6, 0.5, 1.2]).material = dark;
        for (let i = 0; i < 4; i++) bx(0.05, 0.05, 0.3, root, (i % 2 ? 0.25 : -0.25), 0.1, 0.1 - Math.floor(i / 2) * 0.2).material = dark;
        sp(0.08, 4, root, 0, 0.3, 0.3).material = glow;
    } else {
        const s = type === 'queen' ? 1.9 : type === 'drone' ? 1.0 : 1.25;
        root.scaling.set(s, s, s);
        bx(0.5, 0.7, 0.45, root, 0, 1.0, 0, [0.4, 0, 0]).material = mid;
        bx(0.42, 0.4, 0.6, root, 0, 0.8, -0.4, [-0.3, 0, 0]).material = dark;
        // ribbed chest
        for (let i = 0; i < 3; i++) bx(0.46, 0.06, 0.1, root, 0, 0.85 + i * 0.15, 0.22 + i * 0.03).material = dark;
        bx(0.3, 0.26, 0.9, root, 0, 1.45, 0.1, [-0.15, 0, 0]).material = dark;  // elongated head
        bx(0.22, 0.1, 0.3, root, 0, 1.3, 0.45).material = mid;                  // jaw
        for (let i = 0; i < 4; i++) bx(0.04, 0.08, 0.04, root, -0.08 + i * 0.053, 1.36, 0.58).material = tooth;
        for (const sd of [-1, 1]) {
            bx(0.12, 0.5, 0.12, root, sd * 0.35, 0.95, 0.15, [-0.9, 0, sd * 0.3]).material = dark;
            bx(0.1, 0.5, 0.1, root, sd * 0.45, 0.6, 0.45, [0.4, 0, 0]).material = mid;
            bx(0.14, 0.06, 0.22, root, sd * 0.45, 0.37, 0.62).material = tooth;
            bx(0.14, 0.55, 0.16, root, sd * 0.25, 0.55, -0.1, [0.7, 0, 0]).material = mid;
            bx(0.1, 0.55, 0.12, root, sd * 0.28, 0.28, 0.12, [-0.9, 0, 0]).material = dark;
            bx(0.14, 0.06, 0.3, root, sd * 0.28, 0.03, 0.2).material = dark;
        }
        bx(0.14, 0.14, 0.7, root, 0, 0.75, -0.95, [0.2, 0, 0]).material = mid;
        bx(0.09, 0.09, 0.7, root, 0, 0.95, -1.5, [-0.5, 0, 0]).material = dark;
        bx(0.06, 0.2, 0.3, root, 0, 1.3, -1.85).material = tooth;
        for (let i = 0; i < (type === 'queen' ? 5 : 3); i++) bx(0.06, 0.2 + i * 0.05, 0.06, root, 0, 1.4 - i * 0.12, -0.1 - i * 0.18).material = tooth;
        if (type === 'queen') { bx(0.8, 0.1, 0.5, root, 0, 1.7, -0.2).material = dark; bx(0.2, 0.06, 0.2, root, 0, 1.62, 0.2).material = glow; }
        if (type === 'drone') for (const sd of [-1, 1]) bx(0.04, 0.5, 0.9, root, sd * 0.3, 1.3, -0.4, [0, 0, sd * 0.5]).material = flatMat(S, '#5a6a70', { alpha: 0.7 });
    }
    for (const m of root.getChildMeshes()) m.isPickable = false;
    return root;
}
