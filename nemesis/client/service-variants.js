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
        // The work cap leaves a band of hair visible; both styles retain a moustache and sideburns.
        Z('hair', bx(0.3, 0.07, 0.31, R, 0, 2.61, -0.01));
        for (const s of [-1, 1]) {
            Z('hair', bx(0.06, 0.25, 0.18, R, s * 0.16, 2.4, 0.03));
            Z('hair', bx(0.11, 0.055, 0.07, R, s * 0.055, 2.38, 0.18, [0, 0, -s * 0.12]));
        }
        if (variant === 'long') {
            Z('hair', bx(0.27, 0.28, 0.12, R, 0, 2.19, 0.15));
            Z('hair', bx(0.21, 0.15, 0.1, R, 0, 1.99, 0.15));
            for (const s of [-1, 1]) Z('hair', bx(0.07, 0.18, 0.08, R, s * 0.085, 2.0, 0.17, [0, 0, s * 0.1]));
        } else {
            Z('hair', bx(0.27, 0.18, 0.12, R, 0, 2.23, 0.15));
            for (const s of [-1, 1]) {
                Z('hair', bx(0.12, 0.27, 0.1, R, s * 0.095, 2.04, 0.16, [0, 0, s * 0.12]));
                F(C.strap, bx(0.12, 0.04, 0.11, R, s * 0.105, 1.95, 0.16));
            }
        }
    } else if (slot === 'cap') {
        if (variant === 'banded') {
            Z('cap', bx(0.37, 0.13, 0.34, R, 0, 2.66, -0.02));
            F(C.darkSteel, bx(0.38, 0.05, 0.35, R, 0, 2.6, -0.02));
            Z('cap', bx(0.34, 0.04, 0.19, R, 0, 2.61, 0.23));
            F(C.steel, bx(0.09, 0.045, 0.025, R, 0, 2.67, 0.165));
        } else {
            Z('cap', bx(0.35, 0.12, 0.33, R, 0, 2.65, -0.02));
            Z('cap', bx(0.32, 0.04, 0.16, R, 0, 2.6, 0.22));
            F(C.strap, bx(0.38, 0.065, 0.36, R, 0, 2.64, -0.01));
            F(C.darkSteel, bx(0.15, 0.11, 0.11, R, 0, 2.68, 0.2));
            Z('lights', cy(0.09, 0.09, 0.035, 8, R, 0, 2.68, 0.27, front));
        }
    } else if (slot === 'leg') {
        const s = side;
        if (variant === 'utility') {
            Z('overall', bx(0.24 * W, 0.5, 0.25, R, s * 0.15 * W, 0.68, 0));
            Z('overall', bx(0.26 * W, 0.46, 0.27, R, s * 0.15 * W, 1.14, 0));
            F(C.darkSteel, bx(0.19, 0.14, 0.05, R, s * 0.15 * W, 0.76, 0.15));
            Z('overall', bx(0.14, 0.18, 0.07, R, s * 0.2 * W, 1.12, 0.16));
        } else {
            Z('overall', cy(0.27, 0.23, 0.52, 8, R, s * 0.15 * W, 0.67, 0));
            Z('overall', bx(0.26 * W, 0.48, 0.29, R, s * 0.15 * W, 1.13, 0));
            F(C.darkSteel, bx(0.22, 0.11, 0.28, R, s * 0.15 * W, 0.84, 0));
            F(C.steel, bx(0.17, 0.12, 0.04, R, s * 0.15 * W, 0.85, 0.16));
        }
    } else if (slot === 'pelvis') {
        if (variant === 'utility') {
            Z('overall', bx(0.56 * W, 0.23, 0.31, R, 0, 1.4, 0));
            F(C.strap, bx(0.5 * W, 0.07, 0.04, R, 0, 1.38, 0.18));
        } else {
            Z('overall', cy(0.57 * W, 0.52 * W, 0.24, 8, R, 0, 1.4, 0));
            F(C.darkSteel, bx(0.45 * W, 0.06, 0.04, R, 0, 1.37, 0.2));
        }
    } else if (slot === 'torso') {
        if (variant === 'utility') {
            Z('overall', bx(0.58 * W, 0.64, 0.35, R, 0, 1.86, 0)).metadata = { janitorTorso: true };
            Z('overall', bx(0.45 * W, 0.31, 0.1, R, 0, 1.97, 0.2));
            for (const s of [-1, 1]) {
                F(C.darkSteel, bx(0.06, 0.53, 0.04, R, s * 0.17 * W, 1.89, 0.25));
                Z('overall', bx(0.16, 0.16, 0.1, R, s * 0.19 * W, 1.67, 0.23));
            }
            F(C.steel, bx(0.08, 0.05, 0.025, R, 0, 2.06, 0.26));
        } else {
            Z('overall', bx(0.61 * W, 0.67, 0.38, R, 0, 1.85, 0)).metadata = { janitorTorso: true };
            Z('overall', bx(0.48 * W, 0.25, 0.13, R, 0, 1.98, 0.23));
            F(C.darkSteel, bx(0.04, 0.55, 0.04, R, 0, 1.86, 0.31));
            for (const s of [-1, 1]) {
                F(C.darkSteel, bx(0.12, 0.1, 0.04, R, s * 0.2 * W, 1.67, 0.25));
                F(C.steel, bx(0.09, 0.03, 0.025, R, s * 0.2 * W, 1.72, 0.28));
            }
            Z('overall', bx(0.45 * W, 0.11, 0.17, R, 0, 2.17, -0.1));
        }
    } else if (slot === 'sleeve') {
        const s = side;
        if (variant === 'utility') {
            const upper = Z('overall', bx(0.2 * W, 0.42, 0.22, R, s * 0.38 * W, 1.84, 0));
            F(C.darkSteel, bx(0.065, 0.24, 0.06, upper, s * 0.09, 0, 0));
            const lower = Z('overall', bx(0.18 * W, 0.4, 0.2, R, s * 0.39 * W, 1.44, 0.02));
            Z('gloves', bx(0.19, 0.06, 0.21, lower, 0, -0.16, 0));
        } else {
            const upper = Z('overall', cy(0.22, 0.19, 0.42, 8, R, s * 0.38 * W, 1.84, 0));
            F(C.darkSteel, bx(0.07, 0.2, 0.06, upper, s * 0.1, 0, 0));
            const lower = Z('overall', cy(0.2, 0.18, 0.4, 8, R, s * 0.39 * W, 1.44, 0.02));
            Z('gloves', cy(0.21, 0.21, 0.06, 8, lower, 0, -0.16, 0));
        }
    } else if (slot === 'vacuum') {
        const pack = new window.BABYLON.TransformNode('janitor_vacuum_pack', scene); pack.parent = R;
        if (variant === 'ribbed') {
            F(C.darkSteel, cy(0.28, 0.3, 0.67, 10, pack, 0, 1.8, -0.35));
            F(C.gun, cy(0.32, 0.3, 0.1, 10, pack, 0, 2.16, -0.35));
            F(C.gun, cy(0.3, 0.32, 0.1, 10, pack, 0, 1.44, -0.35));
            for (const y of [1.58, 1.78, 1.98]) F(C.steel, cy(0.32, 0.32, 0.045, 10, pack, 0, y, -0.35));
            F(C.darkSteel, bx(0.2, 0.22, 0.1, pack, 0, 1.85, -0.53));
            Z('lights', bx(0.08, 0.08, 0.025, pack, 0, 1.87, -0.59));
        } else {
            // Two complete connected tanks on a common manifold, not an extra cylinder on the old tank.
            F(C.darkSteel, bx(0.43, 0.55, 0.14, pack, 0, 1.8, -0.29));
            for (const s of [-1, 1]) {
                F(C.gunLight, cy(0.21, 0.21, 0.61, 10, pack, s * 0.13, 1.79, -0.4));
                F(C.darkSteel, cy(0.23, 0.23, 0.08, 10, pack, s * 0.13, 2.13, -0.4));
                F(C.darkSteel, cy(0.23, 0.23, 0.08, 10, pack, s * 0.13, 1.45, -0.4));
                Z('lights', bx(0.05, 0.13, 0.025, pack, s * 0.13, 1.83, -0.52));
            }
            F(C.steel, bx(0.42, 0.08, 0.16, pack, 0, 2.13, -0.4));
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
            F(C.darkSteel, bx(0.37, 0.09, 0.2, wand, 0, -0.83, 0.27)).metadata = { janitorWandComponent: 'head' };
            Z('gloves', bx(0.31, 0.055, 0.16, wand, 0, -0.9, 0.28));
            for (const x of [-0.12, -0.06, 0, 0.06, 0.12]) F(C.rubber, bx(0.025, 0.06, 0.15, wand, x, -0.94, 0.28));
        } else {
            F(C.rubber, bx(0.1, 0.16, 0.16, wand, 0, -0.02, 0)).metadata = { janitorWandComponent: 'grip' };
            F(C.gunLight, cy(0.07, 0.06, 0.72, 8, wand, 0, -0.38, 0.15, [-0.22, 0, 0])).metadata = { janitorWandComponent: 'shaft' };
            F(C.darkSteel, cy(0.1, 0.07, 0.2, 8, wand, 0, -0.79, 0.24, [-0.22, 0, 0])).metadata = { janitorWandComponent: 'head' };
            F(C.steel, cy(0.05, 0.08, 0.15, 8, wand, 0, -0.92, 0.27, [-0.22, 0, 0]));
            Z('lights', bx(0.055, 0.08, 0.025, wand, 0, -0.12, 0.14));
        }
    }
}
