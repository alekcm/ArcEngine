// Alternative builds of the ADULT intruder in the four non-lowpoly model styles
// (rounded / pbr / mini / real). Same silhouette as the low-poly adult in characters.js
// (hunched torso, crested eyeless head with inner jaw, dorsal tubes, clawed arms, digitigrade
// legs, bladed tail) so it is recognizable, but each style uses its own primitives and materials.
//
// buildStyledIntruder(scene, style) -> { root, animate(t) }. Height ≈ 2.4 units before the
// caller's scaling; the root is placed with feet at y = 0.
import { styleMat } from './characters_styles.js';

const B = () => window.BABYLON;

/** Style-aware primitive helpers (same tessellation rules as the characters). */
function prims(scene, style) {
    const flat = style === 'rounded' || style === 'mini';
    const tess = style === 'rounded' ? 8 : style === 'mini' ? 12 : 20;
    const seg = style === 'rounded' ? 5 : style === 'mini' ? 8 : 14;
    const fin = m => { if (flat) m.convertToFlatShadedMesh(); m.isPickable = false; return m; };
    const place = (m, parent, x, y, z, rot) => { m.parent = parent; m.position.set(x, y, z); if (rot) m.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0); return fin(m); };
    return {
        box: (w, h, d, parent, x, y, z, rot) => place(B().MeshBuilder.CreateBox('ib', { width: w, height: h, depth: d }, scene), parent, x, y, z, rot),
        cyl: (dt, db, h, parent, x, y, z, rot) => place(B().MeshBuilder.CreateCylinder('ic', { diameterTop: dt, diameterBottom: db, height: h, tessellation: tess }, scene), parent, x, y, z, rot),
        sph: (d, parent, x, y, z, scl) => { const m = place(B().MeshBuilder.CreateSphere('is', { diameter: d, segments: seg }, scene), parent, x, y, z); if (scl) m.scaling.set(scl[0], scl[1], scl[2]); return m; },
        cap: (r, h, parent, x, y, z, rot) => place(B().MeshBuilder.CreateCapsule('ik', { radius: r, height: h, tessellation: tess, subdivisions: 1, capSubdivisions: style === 'rounded' ? 2 : 5 }, scene), parent, x, y, z, rot),
        node: (name, parent, x, y, z, rot) => { const n = new (B().TransformNode)(name, scene); n.parent = parent; n.position.set(x, y, z); if (rot) n.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0); return n; },
    };
}

/** Palette per style: chitin (plates), hide (soft parts), bone (claws/teeth), glow, slime. */
function palette(scene, style) {
    const M = (kind, hex) => styleMat(scene, style, null, hex, kind);
    switch (style) {
        case 'mini':    // painted miniature: strong contrast, dry-brushed look is faked by lighter plate colour
            return { chitin: M('plastic', '#3a4a52'), hide: M('plastic', '#1e252b'), bone: M('plastic', '#d8cfb4'), glow: M('glow', '#9cff3b'), slime: M('plastic', '#6a8a2a'), rim: M('plastic', '#56707a') };
        case 'real':    // wet black exoskeleton with warm translucent hide
            return { chitin: M('metal', '#1b2226'), hide: M('skin', '#2a2d2c'), bone: M('plastic', '#cfc3a8'), glow: M('glow', '#86e02e'), slime: M('glass', '#5a7a2a'), rim: M('metal', '#2e3a40') };
        case 'pbr':     // glossy armour plates, matte muscle
            return { chitin: M('metal', '#26323a'), hide: M('rubber', '#171c20'), bone: M('plastic', '#e3dccb'), glow: M('glow', '#9cff3b'), slime: M('plastic', '#5a7a2a'), rim: M('metal', '#3a4a50') };
        default:        // rounded: flat colours like the low-poly one
            return { chitin: M('metal', '#323c3a'), hide: M('cloth', '#14181d'), bone: M('plastic', '#e3dccb'), glow: M('glow', '#9cff3b'), slime: M('glow', '#5a7a2a'), rim: M('metal', '#262f36') };
    }
}

export function buildStyledIntruder(scene, style) {
    const S = scene;
    const P = prims(S, style);
    const C = palette(S, style);
    const root = new (B().TransformNode)('intr_adult_' + style, S);
    root.scaling.setAll(1.2);   // same overall size as the low-poly adult
    const real = style === 'real', mini = style === 'mini', rounded = style === 'rounded';
    // Body-part sizing: miniature is stockier with bigger head/claws, real is leaner and taller.
    const k = mini ? 1.1 : real ? 0.9 : 1.0;          // thickness factor
    const H = real ? 1.08 : mini ? 0.95 : 1.0;         // height factor
    const limb = (r, len, parent, x, y, z, rot, mat) => {
        const m = rounded || mini ? P.cap(r, len, parent, x, y, z, rot) : P.cyl(r * 1.6, r * 2.2, len, parent, x, y, z, rot);
        m.material = mat; return m;
    };
    const claw = (len, parent, x, y, z, rot) => {
        const m = P.cyl(0.004, 0.07 * k, len, parent, x, y, z, rot); m.material = C.bone; return m;
    };

    // ---- torso (hunched forward) --------------------------------------------------------
    const torso = P.node('torso', root, 0, 1.05 * H, 0, [0.5, 0, 0]);
    if (rounded || mini) { P.cap(0.3 * k, 0.75, torso, 0, 0.1, 0).material = C.chitin; P.sph(0.5 * k, torso, 0, 0.12, 0.02, [1.1, 1.3, 0.85]).material = C.chitin; }
    else { P.sph(0.6 * k, torso, 0, 0.1, 0, [1, 1.35, 0.8]).material = C.chitin; }
    limb(0.14 * k, 0.5, torso, 0, -0.45, -0.05, null, C.hide);                                   // waist
    for (let i = 0; i < 5; i++) { const rib = P.cyl(0.62 * k + (i % 2) * 0.04, 0.62 * k + (i % 2) * 0.04, 0.045, torso, 0, -0.2 + i * 0.13, 0.2 + i * 0.02, [1.5708, 0, 0]); rib.material = C.hide; rib.scaling.z = 0.45; }
    P.sph(0.64 * k, torso, 0, 0.5, -0.05, [1, 0.25, 0.8]).material = C.hide;                     // collar
    for (const sd of [-1, 1]) P.sph(0.32 * k, torso, sd * 0.42, 0.42, -0.05, [1, 0.55, 1.2]).material = C.chitin;   // shoulder pads
    // dorsal tubes
    for (let i = 0; i < 4; i++) {
        const sd = i % 2 ? 1 : -1, q = Math.floor(i / 2);
        const tube = P.cyl(0.08 * k, 0.13 * k, 0.72, torso, sd * (0.14 + q * 0.14), 0.45 + q * 0.1, -0.45 - q * 0.1, [-0.6 - q * 0.3, 0, sd * 0.25]); tube.material = C.rim;
        const lip = P.cyl(0.11 * k, 0.08 * k, 0.07, torso, sd * (0.14 + q * 0.14), 0.75 + q * 0.1, -0.7 - q * 0.2, [-0.6 - q * 0.3, 0, sd * 0.25]); lip.material = C.hide;
    }
    for (let i = 0; i < 6; i++) claw(0.16 + (i % 2) * 0.06, torso, 0, 0.35 - i * 0.16, -0.28 - (i > 3 ? 0.05 : 0), [-0.6, 0, 0]);   // spine ridge
    const chestGlow = P.sph(0.12, torso, 0, 0.05, 0.27); chestGlow.material = C.glow;

    // ---- neck + head --------------------------------------------------------------------
    const neck = P.node('neck', torso, 0, 0.55, 0.15, [-0.9, 0, 0]);
    limb(0.1 * k, 0.4, neck, 0, 0.15, 0, null, C.hide);
    const head = P.node('head', neck, 0, 0.35, 0, [0.6, 0, 0]);
    const crestLen = real ? 1.2 : mini ? 0.9 : 1.05;
    const crest = P.cap(0.13 * k, crestLen, head, 0, 0.1, -0.25, [1.5708, 0, 0]); crest.material = C.chitin; crest.scaling.x = 1.0; crest.scaling.y = 1.15;
    P.sph(0.34 * k, head, 0, -0.04, 0.2, [0.9, 0.62, 1.4]).material = C.rim;                     // skull front
    for (let i = 0; i < 6; i++) { const r = P.cyl(0.3 * k, 0.3 * k, 0.03, head, 0, 0.22, -0.05 - i * 0.14, [0, 0, 0]); r.material = C.hide; r.scaling.z = 0.3; }
    const jaw = P.sph(0.3 * k, head, 0, -0.2, 0.24, [0.85, 0.35, 1.5]); jaw.material = C.hide; jaw.rotation.x = 0.3;
    for (let i = 0; i < 5; i++) { claw(0.1, head, -0.1 + i * 0.05, -0.1, 0.42, [3.1416, 0, 0]); claw(0.08, head, -0.1 + i * 0.05, -0.23, 0.4, [0, 0, 0]); }
    const tongue = P.node('tongue', head, 0, -0.14, 0.4);
    const innerJaw = P.cyl(0.06 * k, 0.08 * k, 0.32, tongue, 0, 0, 0.16, [1.5708, 0, 0]); innerJaw.material = C.slime;
    const innerTeeth = P.sph(0.07, tongue, 0, 0, 0.34); innerTeeth.material = C.bone;
    // drool drops (real/pbr only)
    if (real || style === 'pbr') for (let i = 0; i < 3; i++) P.sph(0.03, head, -0.06 + i * 0.06, -0.3 - (i % 2) * 0.05, 0.38).material = C.slime;

    // ---- arms -----------------------------------------------------------------------------
    const arms = [];
    for (const sd of [-1, 1]) {
        const sh = P.node('sh', torso, sd * 0.45, 0.3, 0.05, [-0.9, 0, sd * 0.35]);
        limb(0.08 * k, 0.6, sh, 0, -0.3, 0, null, C.rim);
        P.sph(0.2 * k, sh, 0, -0.6, 0).material = C.hide;                                       // elbow
        claw(0.2, sh, 0, -0.62, -0.15, [0.6, 0, 0]);
        const fa = P.node('fa', sh, 0, -0.6, 0, [-1.2, 0, 0]);
        limb(0.07 * k, 0.6, fa, 0, -0.3, 0, null, C.chitin);
        P.sph(0.14 * k, fa, 0, -0.6, 0).material = C.hide;                                      // wrist
        for (let c = 0; c < 3; c++) claw(0.34 + (c === 1 ? 0.06 : 0), fa, (c - 1) * 0.05, -0.76, 0.02 - Math.abs(c - 1) * 0.02, [0.25, 0, (c - 1) * 0.3]);
        arms.push({ sh, fa, base: sh.rotation.clone() });
    }

    // ---- legs (digitigrade) -------------------------------------------------------------
    for (const sd of [-1, 1]) {
        const hip = P.node('hip', root, sd * 0.2, 0.75 * H, -0.1, [0.9, 0, 0]);
        limb(0.1 * k, 0.55, hip, 0, -0.27, 0, null, C.chitin);
        claw(0.18, hip, sd * 0.1, -0.25, -0.12, [-0.5, 0, 0]);
        const sn = P.node('sn', hip, 0, -0.55, 0, [-1.7, 0, 0]);
        P.sph(0.18 * k, sn, 0, 0, 0).material = C.hide;
        limb(0.075 * k, 0.5, sn, 0, -0.25, 0, null, C.hide);
        const ft = P.node('ft', sn, 0, -0.5, 0, [0.9, 0, 0]);
        P.sph(0.14 * k, ft, 0, 0, 0).material = C.hide;
        limb(0.065 * k, 0.32, ft, 0, -0.16, 0, null, C.rim);
        for (let c = 0; c < 3; c++) claw(0.26, ft, (c - 1) * 0.06, -0.32, 0.14, [1.5708, (c - 1) * 0.25, 0]);
    }

    // ---- tail -------------------------------------------------------------------------------
    const tailSegs = [];
    let tp = P.node('tail', root, 0, 0.7 * H, -0.3, [-1.1, 0, 0]);
    for (let i = 0; i < 7; i++) {
        const seg = P.node('ts', tp, 0, 0.3, 0, [0.34 - i * 0.02, 0, 0]);
        const r = (0.075 - i * 0.008) * k;
        if (rounded || mini) P.cap(r, 0.34, seg, 0, 0.16, 0).material = i % 2 ? C.hide : C.rim;
        else { P.cyl(r * 1.7, r * 2.1, 0.34, seg, 0, 0.16, 0).material = i % 2 ? C.hide : C.rim; P.sph(r * 2.3, seg, 0, 0, 0).material = C.chitin; }
        claw(0.1, seg, 0, 0.16, -0.08, [-0.5, 0, 0]);
        tailSegs.push(seg); tp = seg;
    }
    const blade = P.box(0.05, 0.45, 0.14, tp, 0, 0.5, 0); blade.material = C.bone;
    P.box(0.025, 0.22, 0.08, tp, 0, 0.78, 0.02).material = C.bone;

    // ---- style extras ---------------------------------------------------------------------
    if (mini) {
        // moulded base like the character miniatures
        const tops = root.getChildTransformNodes(true).concat(root.getChildMeshes(true));
        for (const n of tops) n.position.y += 0.1;
        const base = P.cyl(1.3, 1.4, 0.1, root, 0, 0.05, 0); base.material = styleMat(S, style, null, '#2a2f36', 'plastic');
    }
    if (real) {
        // thin membrane between the dorsal tubes and sinew strands along the arms
        const mem = P.box(0.44, 0.02, 0.5, torso, 0, 0.58, -0.5, [-0.7, 0, 0]); mem.material = C.hide;
        for (const a of arms) for (let i = 0; i < 3; i++) limb(0.012, 0.5, a.fa, Math.sin(i * 2.1) * 0.06, -0.3, Math.cos(i * 2.1) * 0.06, null, C.hide);
    }

    for (const m of root.getChildMeshes()) m.isPickable = false;

    // ---- idle animation: breathing torso, swaying tail, twitching inner jaw ------------------
    const torsoBase = torso.rotation.x, tongueBase = tongue.position.z;
    const animate = (t) => {
        torso.rotation.x = torsoBase + Math.sin(t * 1.6) * 0.03;
        tailSegs.forEach((s, i) => { s.rotation.z = Math.sin(t * 1.4 + i * 0.5) * 0.08; });
        tongue.position.z = tongueBase + Math.max(0, Math.sin(t * 2.3)) * 0.12;
        arms.forEach((a, i) => { a.sh.rotation.z = a.base.z + Math.sin(t * 1.2 + i) * 0.04; });
        chestGlow.scaling.setAll(1 + Math.sin(t * 3) * 0.1);
    };
    return { root, animate };
}
