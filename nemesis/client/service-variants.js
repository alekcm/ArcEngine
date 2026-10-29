// Independent medical and maintenance equipment. Each builder replaces the original part while
// preserving the role's recognizable clothing, tools, paint zones and animated supports.

// Keep the original three-piece hose geometry at rest, but refit its joints to the moving hand.
export function connectClassicJanitorHose(root, pieces, points, updates) {
    const B = window.BABYLON;
    let arm, grip;
    updates.push(() => {
        arm ||= root.getDescendants().find(n => n.name === 'armL');
        grip ||= root.getDescendants().find(n => n.name === 'janitor_wand');
        if (!arm || !grip) return;
        root.computeWorldMatrix(true); arm.computeWorldMatrix(true); grip.computeWorldMatrix(true);
        const inv = root.getWorldMatrix().clone().invert();
        const local = (node, p) => B.Vector3.TransformCoordinates(B.Vector3.TransformCoordinates(p, node.getWorldMatrix()), inv);
        const path = [B.Vector3.FromArray(points[0]),
            local(arm, new B.Vector3(points[1][0], points[1][1] - 2.05, points[1][2])),
            local(arm, new B.Vector3(points[2][0], points[2][1] - 2.05, points[2][2])),
            local(grip, new B.Vector3(0, -0.04, 0.06))];
        for (let i = 0; i < pieces.length; i++) {
            const d = path[i + 1].subtract(path[i]), len = d.length(), mesh = pieces[i].mesh;
            mesh.position.copyFrom(path[i].add(path[i + 1]).scale(0.5));
            mesh.scaling.y = len / pieces[i].length;
            mesh.rotationQuaternion = B.Quaternion.FromUnitVectorsToRef(new B.Vector3(0, 1, 0), d.scale(1 / len), new B.Quaternion());
        }
    });
}

export function medicVariant(slot, variant, { scene, root: R, Z, F, bx, cy, sp, fixed: C }, W, side, gun) {
    const front = [Math.PI / 2, 0, 0];
    if (slot === 'hair') {
        // Both hairstyles fit under the cap and keep loose red strands around the respirator.
        Z('hair', bx(0.34, 0.1, 0.32, R, 0, 2.62, -0.02));
        Z('hair', bx(0.31, 0.32, 0.11, R, 0, 2.48, -0.16));
        for (const s of [-1, 1]) Z('hair', bx(0.07, 0.3, 0.15, R, s * 0.17, 2.43, 0.03, [0, 0, s * 0.07]));
        if (variant === 'tied') {
            Z('hair', bx(0.16, 0.16, 0.16, R, 0, 2.48, -0.23));
            F(C.strap, bx(0.17, 0.05, 0.17, R, 0, 2.43, -0.25));
            Z('hair', bx(0.16, 0.46, 0.16, R, 0, 2.2, -0.29, [0.1, 0, -0.08]));
            Z('hair', bx(0.1, 0.18, 0.12, R, -0.025, 1.9, -0.33, [0.12, 0, 0.12]));
            Z('hair', bx(0.06, 0.22, 0.08, R, -0.17, 2.29, 0.12, [0, 0, -0.1]));
        } else {
            // Offset overlapping locks create a loose silhouette instead of the original flat sheet.
            for (const [x, y, h, tilt] of [[-0.12, 2.28, 0.52, -0.1], [0, 2.25, 0.6, 0.06], [0.12, 2.29, 0.5, 0.1]])
                Z('hair', bx(0.11, h, 0.13, R, x, y, -0.21, [0.08, 0, tilt]));
            for (const s of [-1, 1]) {
                Z('hair', bx(0.075, 0.32, 0.1, R, s * 0.19, 2.27, 0.12, [0, 0, s * 0.1]));
                Z('hair', bx(0.08, 0.19, 0.1, R, s * 0.2, 2.04, 0.11, [0, 0, -s * 0.12]));
            }
        }
    } else if (slot === 'mask') {
        // Closed half-mask: eyes remain visible, while nose and mouth are covered by the shell.
        if (variant === 'filters') {
            F(C.rubber, bx(0.29, 0.2, 0.14, R, 0, 2.35, 0.18));
            F(C.darkSteel, bx(0.2, 0.16, 0.1, R, 0, 2.34, 0.27));
            for (const s of [-1, 1]) {
                F(C.strap, bx(0.05, 0.05, 0.28, R, s * 0.16, 2.4, 0.01));
                F(C.gunLight, cy(0.15, 0.15, 0.11, 10, R, s * 0.14, 2.34, 0.27, front));
                F(C.rubber, cy(0.11, 0.11, 0.025, 10, R, s * 0.14, 2.34, 0.34, front));
                F(C.steel, bx(0.075, 0.02, 0.025, R, s * 0.14, 2.34, 0.36));
            }
        } else {
            F(C.darkSteel, bx(0.3, 0.19, 0.14, R, 0, 2.35, 0.18));
            Z('cap', bx(0.2, 0.13, 0.12, R, 0, 2.34, 0.27));
            F(C.rubber, cy(0.15, 0.15, 0.1, 10, R, 0, 2.34, 0.34, front));
            F(C.steel, cy(0.1, 0.1, 0.025, 10, R, 0, 2.34, 0.4, front));
            for (const s of [-1, 1]) {
                F(C.strap, bx(0.05, 0.055, 0.28, R, s * 0.16, 2.41, 0.01));
                F(C.steel, bx(0.04, 0.1, 0.035, R, s * 0.115, 2.35, 0.27));
            }
        }
    } else if (slot === 'kit') {
        if (variant === 'pouch') {
            const g = new window.BABYLON.TransformNode('medic_kit', scene); g.parent = R;
            F(C.strap, bx(0.28, 0.07, 0.16, g, 0.17 * W, 1.55, 0.15));
            Z('coat', bx(0.23, 0.23, 0.14, g, 0.17 * W, 1.48, 0.25));
            F(C.darkSteel, bx(0.25, 0.055, 0.16, g, 0.17 * W, 1.57, 0.25));
            Z('lights', bx(0.13, 0.035, 0.025, g, 0.17 * W, 1.47, 0.33));
            Z('lights', bx(0.035, 0.13, 0.025, g, 0.17 * W, 1.47, 0.33));
        } else {
            const g = new window.BABYLON.TransformNode('medic_kit', scene); g.parent = R;
            F(C.strap, bx(0.45 * W, 0.09, 0.16, g, 0, 1.54, 0.17));
            Z('coat', bx(0.16, 0.18, 0.12, g, -0.01, 1.47, 0.23));
            Z('lights', bx(0.09, 0.025, 0.02, g, -0.01, 1.47, 0.3));
            Z('lights', bx(0.025, 0.09, 0.02, g, -0.01, 1.47, 0.3));
            for (const s of [-1, 1]) {
                F(C.glass, cy(0.1, 0.1, 0.22, 8, g, s * 0.17 * W, 1.45, 0.23), { alpha: 0.7 });
                Z('lights', cy(0.06, 0.06, 0.13, 8, g, s * 0.17 * W, 1.44, 0.23));
                F(C.steel, cy(0.11, 0.11, 0.04, 8, g, s * 0.17 * W, 1.57, 0.23));
            }
        }
    } else if (slot === 'coat') {
        if (variant === 'field') {
            // Short field jacket, connected back and side panels around the visible inner suit.
            Z('coat', bx(0.58 * W, 0.62, 0.13, R, 0, 1.85, -0.18));
            for (const s of [-1, 1]) {
                Z('coat', bx(0.16 * W, 0.6, 0.11, R, s * 0.21 * W, 1.86, 0.19));
                Z('coat', bx(0.1, 0.58, 0.34, R, s * 0.26 * W, 1.86, 0));
                Z('coat', bx(0.13, 0.16, 0.05, R, s * 0.2 * W, 1.69, 0.25));
                F(C.steel, bx(0.1, 0.025, 0.025, R, s * 0.2 * W, 1.75, 0.285));
            }
            Z('coat', bx(0.57 * W, 0.12, 0.38, R, 0, 1.58, -0.02));
            Z('coat', bx(0.38 * W, 0.12, 0.15, R, 0, 2.17, -0.14));
        } else {
            // A long medical coat remains open in front; its continuous back and side tails are
            // grouped with the torso so they cannot pull away from the waist as the legs move.
            const tails = new window.BABYLON.TransformNode('medic_coat_tails', scene); tails.parent = R;
            Z('coat', bx(0.58 * W, 0.68, 0.12, R, 0, 1.84, -0.18));
            Z('coat', bx(0.58 * W, 0.68, 0.12, tails, 0, 1.22, -0.18));
            for (const s of [-1, 1]) {
                Z('coat', bx(0.15 * W, 0.62, 0.1, R, s * 0.21 * W, 1.86, 0.19));
                Z('coat', bx(0.11, 0.61, 0.33, R, s * 0.26 * W, 1.86, 0));
                Z('coat', bx(0.14 * W, 0.6, 0.28, tails, s * 0.22 * W, 1.22, -0.03));
                Z('coat', bx(0.1, 0.27, 0.065, R, s * 0.14 * W, 2.05, 0.23, [0, 0, -s * 0.2]));
                F(C.darkSteel, bx(0.1, 0.11, 0.035, R, s * 0.21 * W, 1.71, 0.26));
            }
            Z('coat', bx(0.4 * W, 0.14, 0.15, R, 0, 2.17, -0.14));
        }
    } else if (slot === 'sleeve') {
        const s = side;
        if (variant === 'field') {
            const upper = Z('coat', bx(0.2 * W, 0.42, 0.22, R, s * 0.38 * W, 1.84, 0));
            F(C.darkSteel, bx(0.055, 0.23, 0.06, upper, s * 0.085, 0, 0.02));
            const lower = Z('coat', cy(0.18, 0.16, 0.4, 8, R, s * 0.39 * W, 1.44, 0.02));
            F(C.steel, cy(0.19, 0.19, 0.05, 8, lower, 0, -0.16, 0));
        } else {
            const upper = Z('coat', bx(0.19 * W, 0.42, 0.22, R, s * 0.38 * W, 1.84, 0));
            Z('coat', bx(0.12, 0.11, 0.04, upper, 0, -0.04, 0.13));
            const lower = Z('coat', bx(0.17 * W, 0.4, 0.19, R, s * 0.39 * W, 1.44, 0.02));
            Z('coat', bx(0.19, 0.07, 0.21, lower, 0, -0.16, 0));
        }
    } else if (slot === 'injector') {
        if (variant === 'compact') {
            F(C.gunLight, bx(0.12, 0.15, 0.2, gun, 0, 0.04, 0.06));
            F(C.rubber, bx(0.09, 0.15, 0.1, gun, 0, -0.08, -0.02));
            F(C.glass, cy(0.09, 0.09, 0.14, 8, gun, 0, 0.14, 0.11, front), { alpha: 0.7 });
            Z('lights', cy(0.05, 0.05, 0.1, 8, gun, 0, 0.14, 0.11, front));
            F(C.steel, cy(0.018, 0.018, 0.16, 6, gun, 0, 0.04, 0.25, front));
        } else {
            F(C.darkSteel, bx(0.12, 0.14, 0.32, gun, 0, 0.04, 0.11));
            F(C.rubber, bx(0.1, 0.17, 0.1, gun, 0, -0.09, -0.02));
            F(C.glass, cy(0.1, 0.1, 0.25, 8, gun, 0, 0.14, 0.16, front), { alpha: 0.7 });
            Z('lights', cy(0.06, 0.06, 0.2, 8, gun, 0, 0.14, 0.16, front));
            F(C.steel, cy(0.025, 0.025, 0.22, 6, gun, 0, 0.04, 0.35, front));
            F(C.steel, bx(0.14, 0.04, 0.08, gun, 0, 0.18, 0.02));
        }
    }
}

export function janitorVariant(slot, variant, { scene, root: R, Z, F, bx, cy, sp, fixed: C, updates }, W, side, wand) {
    const front = [Math.PI / 2, 0, 0];
    if (slot === 'beard') {
        // Keep the smoker's hairline and moustache, but make each beard a genuinely different cut.
        Z('hair', bx(0.3, 0.07, 0.31, R, 0, 2.61, -0.01));
        for (const s of [-1, 1]) {
            Z('hair', bx(0.065, 0.25, 0.18, R, s * 0.16, 2.4, 0.03));
            Z('hair', bx(0.12, 0.06, 0.07, R, s * 0.055, 2.38, 0.18, [0, 0, -s * 0.12]));
        }
        if (variant === 'long') { // A broad, full beard tapering down over the work jacket.
            Z('hair', bx(0.34, 0.29, 0.14, R, 0, 2.2, 0.15));
            Z('hair', bx(0.30, 0.23, 0.13, R, 0, 1.96, 0.15));
            Z('hair', bx(0.21, 0.13, 0.12, R, 0, 1.8, 0.16));
            for (const s of [-1, 1]) Z('hair', bx(0.07, 0.22, 0.08, R, s * 0.14, 2.02, 0.16, [0, 0, s * 0.12]));
        } else { // Two short, separated tied locks rather than another solid beard slab.
            Z('hair', bx(0.3, 0.15, 0.13, R, 0, 2.24, 0.15));
            for (const s of [-1, 1]) {
                Z('hair', bx(0.105, 0.28, 0.11, R, s * 0.105, 2.03, 0.16, [0, 0, -s * 0.10]));
                F(C.strap, bx(0.11, 0.045, 0.12, R, s * 0.115, 1.93, 0.16));
            }
        }
    } else if (slot === 'cap') {
        if (variant === 'banded') { // Cuffed soft watch cap, without the original baseball bill.
            Z('cap', cy(0.31, 0.38, 0.20, 8, R, 0, 2.72, -0.01));
            Z('cap', bx(0.4, 0.09, 0.38, R, 0, 2.62, -0.01));
            F(C.strap, bx(0.4, 0.035, 0.035, R, 0, 2.62, 0.195));
            Z('gloves', bx(0.09, 0.035, 0.025, R, 0, 2.64, 0.215));
        } else { // Wide industrial hard hat, not the original cap with a lamp stuck on it.
            Z('cap', cy(0.29, 0.43, 0.18, 10, R, 0, 2.72, -0.01));
            Z('cap', bx(0.48, 0.055, 0.44, R, 0, 2.62, 0.0));
            F(C.darkSteel, bx(0.15, 0.12, 0.11, R, 0, 2.7, 0.2));
            Z('lights', cy(0.1, 0.1, 0.035, 8, R, 0, 2.7, 0.27, front));
            F(C.strap, bx(0.04, 0.11, 0.28, R, 0, 2.74, -0.04));
        }
    } else if (slot === 'boot') {
        const s = side;
        if (variant === 'utility') { // Taller work boot with a dark upper and a bright rubber sole.
            Z('gloves', bx(0.27 * W, 0.16, 0.41, R, s * 0.15 * W, 0.08, 0.06)).metadata = { janitorBoot: 'sole' };
            F(C.darkSteel, bx(0.24 * W, 0.34, 0.27, R, s * 0.15 * W, 0.30, 0)).metadata = { janitorBoot: 'shaft' };
            Z('gloves', bx(0.26 * W, 0.07, 0.29, R, s * 0.15 * W, 0.45, 0));
        } else { // Wider sealed boots with a separate protective ankle cuff.
            Z('gloves', bx(0.26 * W, 0.16, 0.42, R, s * 0.15 * W, 0.08, 0.06)).metadata = { janitorBoot: 'sole' };
            Z('overall', cy(0.25, 0.24, 0.35, 8, R, s * 0.15 * W, 0.30, 0)).metadata = { janitorBoot: 'shaft' };
            F(C.darkSteel, bx(0.25 * W, 0.1, 0.28, R, s * 0.15 * W, 0.39, 0));
        }
    } else if (slot === 'leg') {
        const s = side;
        if (variant === 'utility') { // Loose work trousers with reinforced outer knees.
            Z('overall', bx(0.27 * W, 0.52, 0.27, R, s * 0.15 * W, 0.67, 0)).metadata = { janitorShin: true };
            Z('overall', bx(0.29 * W, 0.48, 0.3, R, s * 0.15 * W, 1.13, 0));
            F(C.darkSteel, bx(0.21, 0.18, 0.07, R, s * 0.15 * W, 0.78, 0.15));
            Z('gloves', bx(0.17, 0.045, 0.035, R, s * 0.15 * W, 0.8, 0.195));
        } else { // Voluminous sealed trousers, with a broad flexible band at each knee.
            Z('overall', cy(0.26, 0.24, 0.52, 8, R, s * 0.15 * W, 0.67, 0)).metadata = { janitorShin: true };
            Z('overall', bx(0.25 * W, 0.49, 0.32, R, s * 0.15 * W, 1.13, 0));
            F(C.darkSteel, bx(0.25, 0.13, 0.31, R, s * 0.15 * W, 0.83, 0));
            Z('gloves', bx(0.21, 0.045, 0.035, R, s * 0.15 * W, 0.83, 0.17));
        }
    } else if (slot === 'pelvis') {
        if (variant === 'utility') {
            Z('overall', bx(0.59 * W, 0.24, 0.34, R, 0, 1.4, 0));
            F(C.strap, bx(0.59 * W, 0.09, 0.36, R, 0, 1.42, 0));
        } else {
            Z('overall', cy(0.64 * W, 0.58 * W, 0.25, 8, R, 0, 1.4, 0));
            F(C.darkSteel, bx(0.61 * W, 0.09, 0.39, R, 0, 1.43, 0));
            Z('gloves', bx(0.13, 0.065, 0.035, R, 0, 1.43, 0.21));
        }
    } else if (slot === 'torso') {
        if (variant === 'utility') {
            Z('overall', bx(0.59 * W, 0.70, 0.36, R, 0, 1.86, 0)).metadata = { janitorTorso: true };
            // A complete suspended rubber apron, rather than the same jumpsuit with extra pockets.
            const apron = new window.BABYLON.TransformNode('janitor_apron', scene); apron.parent = R;
            F(C.darkSteel, bx(0.43 * W, 0.48, 0.09, apron, 0, 1.84, 0.22)).metadata = { janitorApron: 'bib' };
            F(C.darkSteel, bx(0.56 * W, 0.65, 0.10, apron, 0, 1.29, 0.25)).metadata = { janitorApron: 'skirt' };
            Z('gloves', bx(0.53 * W, 0.07, 0.035, apron, 0, 1.03, 0.31));
            for (const s of [-1, 1]) {
                F(C.strap, bx(0.075, 0.35, 0.04, apron, s * 0.17 * W, 2.06, 0.21, [0, 0, -s * 0.12]));
                Z('overall', bx(0.19, 0.16, 0.08, apron, s * 0.17 * W, 1.5, 0.32));
                F(C.steel, bx(0.13, 0.025, 0.025, apron, s * 0.17 * W, 1.55, 0.37));
            }
        } else { // A sealed maintenance suit with raised collar, separate chest and padded sides.
            Z('overall', bx(0.65 * W, 0.70, 0.4, R, 0, 1.85, 0)).metadata = { janitorTorso: true };
            F(C.darkSteel, bx(0.5 * W, 0.49, 0.09, R, 0, 1.88, 0.23));
            for (const s of [-1, 1]) {
                Z('overall', bx(0.18 * W, 0.48, 0.09, R, s * 0.23 * W, 1.88, 0.24));
                Z('gloves', bx(0.13, 0.08, 0.045, R, s * 0.18 * W, 2.02, 0.31));
                F(C.steel, bx(0.14, 0.16, 0.04, R, s * 0.15 * W, 1.72, 0.31));
                Z('overall', bx(0.11, 0.18, 0.29, R, s * 0.25 * W, 2.19, -0.04));
            }
            Z('overall', bx(0.5 * W, 0.18, 0.14, R, 0, 2.19, -0.13));
            Z('gloves', bx(0.16, 0.15, 0.07, R, 0, 1.91, 0.31));
            F(C.darkSteel, bx(0.10, 0.09, 0.025, R, 0, 1.91, 0.36));
        }
    } else if (slot === 'sleeve') {
        const s = side;
        if (variant === 'utility') {
            const upper = Z('overall', bx(0.22 * W, 0.42, 0.24, R, s * 0.38 * W, 1.84, 0));
            Z('gloves', bx(0.22, 0.08, 0.25, upper, 0, -0.17, 0));
            const lower = F(C.darkSteel, bx(0.19 * W, 0.4, 0.21, R, s * 0.39 * W, 1.44, 0.02));
            Z('gloves', bx(0.2, 0.07, 0.22, lower, 0, -0.16, 0));
        } else {
            const upper = Z('overall', cy(0.26, 0.23, 0.42, 8, R, s * 0.38 * W, 1.84, 0));
            Z('gloves', bx(0.15, 0.08, 0.07, upper, 0, 0.08, 0.13));
            const lower = Z('overall', cy(0.24, 0.22, 0.4, 8, R, s * 0.39 * W, 1.44, 0.02));
            F(C.darkSteel, cy(0.25, 0.25, 0.09, 8, lower, 0, -0.14, 0));
        }
    } else if (slot === 'vacuum') {
        const pack = new window.BABYLON.TransformNode('janitor_vacuum_pack', scene); pack.parent = R;
        if (variant === 'ribbed') { // Boxy, wide turbine unit with a visible carry handle.
            Z('gear', bx(0.57, 0.58, 0.31, pack, 0, 1.8, -0.37));
            F(C.darkSteel, bx(0.5, 0.41, 0.09, pack, 0, 1.79, -0.57));
            Z('gear', bx(0.56, 0.11, 0.36, pack, 0, 2.12, -0.38));
            Z('gloves', bx(0.45, 0.08, 0.34, pack, 0, 1.49, -0.39));
            for (const x of [-0.16, -0.08, 0, 0.08, 0.16]) F(C.steel, bx(0.035, 0.25, 0.035, pack, x, 1.82, -0.63));
            Z('lights', bx(0.12, 0.06, 0.03, pack, 0, 1.62, -0.63));
            F(C.darkSteel, bx(0.35, 0.06, 0.08, pack, 0, 2.25, -0.39));
            for (const x of [-0.14, 0.14]) F(C.steel, bx(0.045, 0.13, 0.05, pack, x, 2.19, -0.39));
        } else { // Two separate tall tanks and an exposed manifold on a common frame.
            F(C.darkSteel, bx(0.5, 0.6, 0.16, pack, 0, 1.8, -0.29));
            for (const s of [-1, 1]) {
                Z('gear', cy(0.23, 0.23, 0.68, 10, pack, s * 0.16, 1.79, -0.43));
                Z('gloves', cy(0.25, 0.25, 0.09, 10, pack, s * 0.16, 2.15, -0.43));
                F(C.darkSteel, cy(0.25, 0.25, 0.09, 10, pack, s * 0.16, 1.43, -0.43));
                Z('lights', bx(0.06, 0.16, 0.025, pack, s * 0.16, 1.84, -0.56));
            }
            F(C.steel, bx(0.52, 0.08, 0.17, pack, 0, 2.15, -0.43));
        }
        for (const s of [-1, 1]) F(C.strap, bx(0.07, 0.55, 0.04, pack, s * 0.18 * W, 1.86, 0.19));
        F(C.steel, cy(0.11, 0.11, 0.1, 8, pack, -0.15, 2.08, -0.42, [0, 0, Math.PI / 2]));
        // A flexible hose connects the tank to the wand even while its hand swings. The cylinders
        // are kept in root space and refitted after the rig updates; no frame leaves a loose end.
        const hose = new window.BABYLON.TransformNode('janitor_hose', scene); hose.parent = R;
        const segments = [];
        for (let i = 0; i < 8; i++) {
            const mesh = F(C.rubber, cy(0.055, 0.055, 1, 8, hose, 0, 0, 0));
            mesh.metadata = { janitorHoseSegment: i }; segments.push(mesh);
        }
        const B = window.BABYLON, a = new B.Vector3(-0.18, 2.08, -0.42);
        let grip;
        updates.push(() => {
            grip ||= R.getDescendants().find(n => n.name === 'janitor_wand');
            if (!grip) return;
            R.computeWorldMatrix(true); grip.computeWorldMatrix(true);
            const inv = R.getWorldMatrix().clone().invert();
            const endWorld = B.Vector3.TransformCoordinates(new B.Vector3(0, -0.02, 0.06), grip.getWorldMatrix());
            const end = B.Vector3.TransformCoordinates(endWorld, inv);
            const c1 = a.add(new B.Vector3(-0.28, 0.0, -0.05));
            const c2 = end.add(new B.Vector3(-0.15, 0.38, -0.23));
            const point = t => a.scale((1 - t) ** 3).add(c1.scale(3 * (1 - t) ** 2 * t)).add(c2.scale(3 * (1 - t) * t * t)).add(end.scale(t ** 3));
            for (let i = 0; i < segments.length; i++) {
                const from = point(i / segments.length), to = point((i + 1) / segments.length), d = to.subtract(from), len = d.length();
                const mesh = segments[i]; mesh.position.copyFrom(from.add(to).scale(0.5)); mesh.scaling.y = len + 0.012;
                mesh.rotationQuaternion = B.Quaternion.FromUnitVectorsToRef(new B.Vector3(0, 1, 0), d.scale(1 / len), new B.Quaternion());
            }
        });
    } else if (slot === 'wand') {
        if (variant === 'brush') {
            F(C.rubber, bx(0.1, 0.16, 0.16, wand, 0, -0.02, 0)).metadata = { janitorWandComponent: 'grip' };
            F(C.steel, cy(0.055, 0.055, 0.82, 8, wand, 0, -0.42, 0.14, [-0.25, 0, 0])).metadata = { janitorWandComponent: 'shaft' };
            F(C.darkSteel, bx(0.50, 0.12, 0.24, wand, 0, -0.83, 0.27)).metadata = { janitorWandComponent: 'head' };
            Z('gloves', bx(0.45, 0.065, 0.2, wand, 0, -0.92, 0.28));
            for (const x of [-0.19, -0.095, 0, 0.095, 0.19]) F(C.rubber, bx(0.035, 0.07, 0.18, wand, x, -0.97, 0.28));
        } else {
            F(C.rubber, bx(0.1, 0.16, 0.16, wand, 0, -0.02, 0)).metadata = { janitorWandComponent: 'grip' };
            F(C.gunLight, cy(0.07, 0.06, 0.72, 8, wand, 0, -0.38, 0.15, [-0.22, 0, 0])).metadata = { janitorWandComponent: 'shaft' };
            F(C.darkSteel, cy(0.1, 0.07, 0.2, 8, wand, 0, -0.79, 0.24, [-0.22, 0, 0])).metadata = { janitorWandComponent: 'head' };
            F(C.steel, cy(0.05, 0.08, 0.15, 8, wand, 0, -0.92, 0.27, [-0.22, 0, 0]));
            Z('lights', bx(0.055, 0.08, 0.025, wand, 0, -0.12, 0.14));
        }
    }
}
