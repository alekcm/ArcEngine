// Complete replacements for the Director and the Android. Coordinates share the humanoid
// builder's local space and the existing paint zones; no original part is used as an underlay.
const marked = (mesh, component) => { mesh.metadata = { ...mesh.metadata, bodyguardComponent: component }; return mesh; };

/** Give the bodyguard its own supported arm and leg pivots, including the original robot. */
export function rigBodyguard(robot, scene, updates) {
    const B = window.BABYLON, limbs = {};
    for (const [kind, y] of [['leg', 1.4], ['arm', 2.26]]) for (const side of ['L', 'R']) {
        const node = new B.TransformNode('bodyguard_' + kind + side, scene);
        node.parent = robot; node.position.y = y; limbs[kind + side] = node;
    }
    // All robot pieces are first built in robot-local coordinates. Reparenting at zero rotation
    // leaves the classic miniature unchanged, but keeps each entire limb together in motion.
    for (const mesh of robot.getChildMeshes(true)) {
        const p = mesh.position, side = p.x < 0 ? 'L' : 'R';
        const leg = Math.abs(p.x) > 0.1 && Math.abs(p.x) < 0.32 && p.y <= 1.4;
        const arm = Math.abs(p.x) >= 0.32 && p.y > 1.0 && p.y < 2.42;
        if (leg || arm) {
            const node = limbs[(leg ? 'leg' : 'arm') + side];
            p.y -= node.position.y; mesh.parent = node;
        }
    }
    let now = 0, phase = 0, swing = 0;
    updates.push((t = 0, moving = false) => {
        const dt = Math.max(0, Math.min(0.1, t - now)); now = t;
        swing += ((moving ? 1 : 0) - swing) * Math.min(1, dt * 8);
        if (moving) phase += dt * 11;
        const stride = Math.sin(phase) * swing;
        limbs.legL.rotation.x = stride * 0.48; limbs.legR.rotation.x = -stride * 0.48;
        limbs.armL.rotation.x = -stride * 0.3; limbs.armR.rotation.x = stride * 0.3;
    });
}

export function ceoVariant(slot, variant, { scene, root: R, Z, F, bx, cy, sp, fixed: C }, W, target) {
    const front = [Math.PI / 2, 0, 0], trim = '#c9c3a6';
    if (slot === 'hair') {
        if (variant === 'spiky') {
            Z('hair', bx(0.33, 0.1, 0.33, R, 0, 2.64, -0.01));
            Z('hair', bx(0.32, 0.13, 0.1, R, 0, 2.53, -0.15));
            for (const [x, y, h, tilt] of [[-0.12, 2.71, 0.13, -0.2], [-0.04, 2.74, 0.17, -0.1], [0.04, 2.73, 0.16, 0.1], [0.12, 2.71, 0.13, 0.2]])
                Z('hair', bx(0.08, h, 0.17, R, x, y, 0.02, [0.12, 0, tilt]));
        } else {
            Z('hair', bx(0.34, 0.1, 0.32, R, 0, 2.64, 0));
            Z('hair', bx(0.32, 0.14, 0.1, R, 0, 2.52, -0.15));
            Z('hair', bx(0.3, 0.13, 0.14, R, -0.025, 2.67, 0.1, [0, 0, -0.18]));
            Z('hair', bx(0.1, 0.16, 0.1, R, -0.145, 2.57, 0.12, [0, 0, -0.15]));
            Z('hair', bx(0.07, 0.1, 0.2, R, 0.15, 2.56, -0.03));
        }
    } else if (slot === 'collar') {
        if (variant === 'trim') {
            Z('coat', bx(0.62 * W, 0.1, 0.38, R, 0, 2.19, -0.02));
            Z('coat', bx(0.49 * W, 0.2, 0.1, R, 0, 2.27, -0.2));
            for (const s of [-1, 1]) {
                Z('coat', bx(0.12, 0.22, 0.28, R, s * 0.23 * W, 2.25, -0.04, [0, 0, s * 0.12]));
                Z('coat', bx(0.17, 0.3, 0.075, R, s * 0.16 * W, 2.12, 0.2, [0, 0, s * 0.25]));
                F(trim, bx(0.03, 0.26, 0.03, R, s * 0.12 * W, 2.15, 0.25, [0, 0, s * 0.25]));
                F(trim, bx(0.06, 0.04, 0.23, R, s * 0.25 * W, 2.36, -0.05));
            }
        } else {
            Z('coat', bx(0.6 * W, 0.1, 0.37, R, 0, 2.19, -0.02));
            Z('coat', bx(0.47 * W, 0.3, 0.11, R, 0, 2.31, -0.19));
            for (const s of [-1, 1]) {
                Z('coat', bx(0.1, 0.34, 0.3, R, s * 0.23 * W, 2.3, -0.04, [0, 0, s * 0.12]));
                Z('coat', bx(0.12, 0.22, 0.07, R, s * 0.16 * W, 2.22, 0.16, [0, 0, s * 0.22]));
                F(trim, bx(0.105, 0.035, 0.29, R, s * 0.24 * W, 2.47, -0.04, [0, 0, s * 0.12]));
            }
        }
    } else if (slot === 'coat') {
        // The coat and the collar are independent. Both coats meet the collar ring and keep the
        // red tie visible; a torso-bound group carries their back skirts instead of a single leg.
        if (variant === 'tailcoat') {
            const tails = new window.BABYLON.TransformNode('ceo_coat_tails', scene); tails.parent = R;
            Z('coat', bx(0.59 * W, 0.7, 0.12, R, 0, 1.84, -0.2));
            Z('coat', bx(0.58 * W, 0.86, 0.13, tails, 0, 1.1, -0.2));
            for (const s of [-1, 1]) {
                Z('coat', bx(0.12, 0.7, 0.36, R, s * 0.26 * W, 1.84, 0));
                Z('coat', bx(0.19 * W, 0.65, 0.1, R, s * 0.2 * W, 1.84, 0.19));
                Z('coat', bx(0.12, 0.78, 0.24, tails, s * 0.23 * W, 1.14, -0.11));
                F(trim, bx(0.045, 0.045, 0.025, R, s * 0.18 * W, 1.75, 0.25));
            }
        } else {
            const skirts = new window.BABYLON.TransformNode('ceo_coat_tails', scene); skirts.parent = R;
            Z('coat', bx(0.61 * W, 0.72, 0.14, R, 0, 1.84, -0.19));
            Z('coat', bx(0.6 * W, 0.45, 0.14, skirts, 0, 1.28, -0.19));
            for (const s of [-1, 1]) {
                Z('coat', bx(0.12, 0.7, 0.36, R, s * 0.27 * W, 1.84, 0));
                Z('coat', bx(0.25 * W, 0.64, 0.12, R, s * 0.17 * W, 1.84, 0.2));
                Z('coat', bx(0.15, 0.42, 0.25, skirts, s * 0.23 * W, 1.29, -0.1));
                for (const y of [1.7, 1.83, 1.96]) F(trim, cy(0.04, 0.04, 0.025, 8, R, s * 0.12 * W, y, 0.27, front));
                F(C.darkSteel, bx(0.14, 0.1, 0.035, R, s * 0.22 * W, 1.64, 0.27));
            }
        }
    } else if (slot === 'sleeve') {
        const s = target;
        if (variant === 'tailcoat') {
            const upper = Z('coat', bx(0.19 * W, 0.43, 0.21, R, s * 0.38 * W, 1.84, 0));
            F(trim, bx(0.08, 0.035, 0.04, upper, 0, 0.14, 0.12));
            const lower = Z('coat', bx(0.17 * W, 0.4, 0.19, R, s * 0.39 * W, 1.44, 0.02));
            Z('shirt', bx(0.18, 0.055, 0.2, lower, 0, -0.17, 0));
        } else {
            const upper = Z('coat', bx(0.21 * W, 0.43, 0.23, R, s * 0.38 * W, 1.84, 0));
            Z('coat', bx(0.22, 0.09, 0.25, upper, 0, 0.17, 0));
            const lower = Z('coat', bx(0.18 * W, 0.4, 0.2, R, s * 0.39 * W, 1.44, 0.02));
            F(trim, bx(0.15, 0.035, 0.04, lower, 0, -0.13, 0.12));
        }
    } else if (slot === 'sidearm') {
        const gun = target;
        if (variant === 'compact') {
            F(C.gunLight, bx(0.1, 0.14, 0.22, gun, 0, 0.04, 0.08));
            F(C.gun, bx(0.09, 0.17, 0.1, gun, 0, -0.04, -0.02));
            F(C.darkSteel, bx(0.08, 0.07, 0.12, gun, 0, 0.05, 0.24));
            Z('lights', bx(0.04, 0.03, 0.035, gun, 0, 0.12, 0.09));
        } else {
            F(C.gun, bx(0.09, 0.12, 0.38, gun, 0, 0.04, 0.16));
            F(C.gunLight, bx(0.1, 0.16, 0.12, gun, 0, -0.04, -0.02));
            F(trim, bx(0.105, 0.035, 0.3, gun, 0, 0.11, 0.16));
            F(C.steel, cy(0.045, 0.045, 0.2, 8, gun, 0, 0.04, 0.43, front));
            Z('lights', bx(0.035, 0.035, 0.04, gun, 0, 0.12, 0.08));
        }
    } else if (slot === 'robot') {
        const r = target, armored = variant === 'armored';
        const joint = (x, y, z, name) => marked(F(C.steel, sp(armored ? 0.22 : 0.18, 6, r, x, y, z)), name);
        for (const s of [-1, 1]) {
            const side = s < 0 ? 'L' : 'R', x = s * (armored ? 0.21 : 0.18);
            marked(Z('robot', bx(armored ? 0.26 : 0.2, armored ? 0.15 : 0.12, armored ? 0.42 : 0.38, r, x, armored ? 0.075 : 0.06, 0.06)), 'foot' + side);
            if (armored) marked(Z('robot', bx(0.2, 0.57, 0.22, r, x, 0.43, 0)), 'shin' + side);
            else marked(F(C.darkSteel, cy(0.1, 0.13, 0.62, 8, r, x, 0.42, 0)), 'shin' + side);
            joint(x, 0.76, 0, 'knee' + side);
            if (armored) marked(Z('robot', bx(0.23, 0.55, 0.24, r, x, 1.08, 0)), 'thigh' + side);
            else marked(Z('robot', cy(0.14, 0.12, 0.6, 8, r, x, 1.08, 0)), 'thigh' + side);
            joint(x, 1.4, 0, 'hip' + side);
            F(C.darkSteel, bx(0.055, 0.48, 0.05, r, x + s * 0.09, 1.08, -0.08));
            if (armored) F(C.darkSteel, bx(0.19, 0.16, 0.05, r, x, 0.78, 0.14));
        }
        marked(F(C.darkSteel, bx(armored ? 0.5 : 0.4, armored ? 0.2 : 0.16, armored ? 0.28 : 0.24, r, 0, 1.46, 0)), 'pelvis');
        marked(F(C.steel, cy(armored ? 0.2 : 0.14, armored ? 0.22 : 0.18, 0.3, 8, r, 0, 1.68, 0)), 'spine');
        marked(Z('robot', bx(armored ? 0.68 : 0.5, armored ? 0.53 : 0.48, armored ? 0.4 : 0.32, r, 0, 2.04, 0)), 'torso');
        if (armored) {
            Z('robot', bx(0.54, 0.26, 0.13, r, 0, 2.09, 0.24));
            F(C.darkSteel, bx(0.4, 0.12, 0.06, r, 0, 1.89, 0.23));
            for (const x of [-0.18, 0, 0.18]) Z('lights', bx(0.07, 0.035, 0.025, r, x, 2.13, 0.32));
            F(C.darkSteel, bx(0.46, 0.34, 0.14, r, 0, 2.04, -0.26));
        } else {
            F(C.darkSteel, bx(0.36, 0.27, 0.1, r, 0, 2.06, 0.2));
            Z('lights', bx(0.22, 0.04, 0.025, r, 0, 2.14, 0.265));
            F(C.gunLight, bx(0.31, 0.32, 0.13, r, 0, 2.02, -0.21));
        }
        for (const s of [-1, 1]) {
            const side = s < 0 ? 'L' : 'R', x = s * (armored ? 0.44 : 0.37), shoulderX = s * (armored ? 0.41 : 0.33);
            joint(shoulderX, 2.26, 0, 'shoulder' + side);
            Z('robot', bx(armored ? 0.29 : 0.2, armored ? 0.19 : 0.13, armored ? 0.34 : 0.25, r, x, 2.3, 0));
            if (armored) marked(Z('robot', bx(0.17, 0.5, 0.19, r, x, 1.97, 0.02)), 'upper' + side);
            else marked(F(C.darkSteel, cy(0.1, 0.09, 0.5, 8, r, x, 1.97, 0.02)), 'upper' + side);
            joint(x, 1.7, 0.02, 'elbow' + side);
            if (armored) marked(Z('robot', bx(0.17, 0.5, 0.18, r, x, 1.42, 0.06)), 'forearm' + side);
            else marked(Z('robot', cy(0.1, 0.12, 0.5, 8, r, x, 1.42, 0.06)), 'forearm' + side);
            marked(F(C.steel, bx(0.14, 0.14, 0.14, r, x, 1.12, 0.08)), 'hand' + side);
            if (armored) F(C.darkSteel, bx(0.14, 0.24, 0.05, r, x, 1.47, 0.17));
            else Z('lights', bx(0.035, 0.16, 0.025, r, x, 1.43, 0.14));
        }
        marked(F(C.steel, cy(0.12, 0.14, 0.2, 8, r, 0, 2.35, 0.02)), 'neck');
        marked(Z('robot', bx(armored ? 0.32 : 0.28, armored ? 0.28 : 0.27, armored ? 0.32 : 0.28, r, 0, 2.54, 0.02)), 'head');
        if (armored) {
            F(C.darkSteel, bx(0.28, 0.12, 0.06, r, 0, 2.55, 0.21));
            Z('lights', bx(0.2, 0.045, 0.025, r, 0, 2.56, 0.255));
            F(C.darkSteel, bx(0.3, 0.055, 0.2, r, 0, 2.68, 0.04));
        } else {
            F(C.darkSteel, bx(0.3, 0.12, 0.08, r, 0, 2.56, 0.18));
            for (const s of [-1, 1]) {
                F(C.steel, cy(0.105, 0.105, 0.06, 8, r, s * 0.085, 2.56, 0.24, front));
                Z('lights', cy(0.065, 0.065, 0.025, 8, r, s * 0.085, 2.56, 0.285, front));
            }
            Z('lights', bx(0.05, 0.04, 0.025, r, 0, 2.68, 0.14));
        }
    }
}

export function androidVariant(slot, variant, { scene, root: R, Z, F, bx, cy, sp, fixed: C }, W, target) {
    const front = [Math.PI / 2, 0, 0];
    if (slot === 'hair') {
        Z('hair', bx(0.34, 0.11, 0.33, R, 0, 2.64, -0.01));
        Z('hair', bx(0.32, 0.28, 0.1, R, 0, 2.49, -0.16));
        if (variant === 'tied') {
            Z('hair', bx(0.27, 0.08, 0.1, R, 0.035, 2.6, 0.14, [0, 0, 0.12]));
            for (const s of [-1, 1]) Z('hair', bx(0.055, 0.24, 0.15, R, s * 0.17, 2.46, -0.01));
            Z('hair', bx(0.16, 0.14, 0.15, R, 0, 2.49, -0.23));
            F(C.rubber, bx(0.16, 0.045, 0.16, R, 0, 2.44, -0.25));
            Z('hair', bx(0.15, 0.4, 0.14, R, 0.015, 2.22, -0.28, [0.08, 0, 0.06]));
        } else {
            Z('hair', bx(0.32, 0.11, 0.1, R, 0.01, 2.59, 0.15, [0, 0, 0.1]));
            Z('hair', bx(0.34, 0.39, 0.1, R, 0, 2.38, -0.16));
            for (const s of [-1, 1]) Z('hair', bx(0.07, s < 0 ? 0.35 : 0.43, 0.2, R, s * 0.18, 2.39, -0.04, [0, 0, s * 0.08]));
            Z('hair', bx(0.06, 0.21, 0.08, R, 0.15, 2.49, 0.12, [0, 0, 0.13]));
        }
    } else if (slot === 'boot') {
        const s = target, utility = variant === 'utility';
        // Each cut includes its own shoes, calves, thighs and waist, rather than overlays.
        F(C.rubber, bx(utility ? 0.25 : 0.23, 0.07, utility ? 0.4 : 0.38, R, s * 0.15 * W, 0.035, 0.055))
            .metadata = { androidTrouser: 'sole' };
        Z('pants', bx(utility ? 0.24 : 0.22, 0.17, utility ? 0.37 : 0.35, R, s * 0.15 * W, 0.13, 0.05))
            .metadata = { androidTrouser: 'shoe' };
        Z('pants', bx(utility ? 0.24 : 0.22, 0.32, utility ? 0.27 : 0.25, R, s * 0.15 * W, 0.3, 0))
            .metadata = { androidTrouser: 'boot' };
        if (utility) F(C.darkSteel, bx(0.25, 0.08, 0.28, R, s * 0.15 * W, 0.39, 0));
    } else if (slot === 'leg') {
        const s = target, utility = variant === 'utility';
        if (utility) {
            Z('pants', bx(0.26 * W, 0.53, 0.28, R, s * 0.15 * W, 0.67, 0))
                .metadata = { androidTrouser: 'shin' };
            Z('pants', bx(0.27 * W, 0.49, 0.29, R, s * 0.15 * W, 1.12, 0))
                .metadata = { androidTrouser: 'thigh' };
            Z('pants', bx(0.14, 0.26, 0.19, R, s * 0.27 * W, 1.06, 0.04));
            F(C.darkSteel, bx(0.15, 0.05, 0.2, R, s * 0.27 * W, 1.17, 0.04));
            F(C.darkSteel, bx(0.21, 0.17, 0.05, R, s * 0.15 * W, 0.8, 0.15));
            F(C.steel, bx(0.15, 0.025, 0.025, R, s * 0.15 * W, 0.8, 0.185));
        } else {
            // Long, gently flared formal legs end over the shoes instead of at boot tops.
            Z('pants', bx(0.27, 0.7, 0.29, R, s * 0.16, 0.56, 0, [0, 0, -s * 0.04]))
                .metadata = { androidTrouser: 'shin' };
            Z('pants', bx(0.25 * W, 0.49, 0.26, R, s * 0.15 * W, 1.12, 0))
                .metadata = { androidTrouser: 'thigh' };
            Z('pants', bx(0.29, 0.09, 0.3, R, s * 0.16, 0.25, 0));
            F(C.darkSteel, bx(0.025, 0.75, 0.015, R, s * 0.15 * W, 0.96, 0.15));
        }
    } else if (slot === 'pelvis') {
        const utility = variant === 'utility';
        Z('pants', bx((utility ? 0.6 : 0.58) * W, 0.27, utility ? 0.35 : 0.33, R, 0, 1.36, 0))
            .metadata = { androidTrouser: 'waist' };
        F(C.strap, bx(0.58 * W, 0.09, 0.36, R, 0, 1.5, 0));
        F(C.steel, bx(utility ? 0.12 : 0.08, 0.07, 0.035, R, 0, 1.5, 0.2));
    } else if (slot === 'vest') {
        // The breast piece, back and side panels are all rebuilt; the shirt stays an independent zone.
        if (variant === 'lapels') {
            Z('vest', bx(0.53 * W, 0.53, 0.1, R, 0, 1.85, -0.18));
            for (const s of [-1, 1]) {
                Z('vest', bx(0.1, 0.52, 0.34, R, s * 0.25 * W, 1.85, 0));
                Z('vest', bx(0.16 * W, 0.49, 0.11, R, s * 0.17 * W, 1.85, 0.19));
                Z('vest', bx(0.1, 0.27, 0.07, R, s * 0.11 * W, 1.99, 0.25, [0, 0, s * 0.2]));
                F(C.steel, bx(0.035, 0.035, 0.02, R, s * 0.1 * W, 1.77, 0.27));
            }
            Z('vest', bx(0.48 * W, 0.08, 0.33, R, 0, 1.61, 0));
        } else {
            Z('vest', bx(0.54 * W, 0.52, 0.13, R, 0, 1.85, 0.2));
            Z('vest', bx(0.52 * W, 0.53, 0.1, R, 0, 1.85, -0.18));
            for (const s of [-1, 1]) {
                Z('vest', bx(0.1, 0.52, 0.34, R, s * 0.25 * W, 1.85, 0));
                Z('vest', bx(0.14, 0.16, 0.08, R, s * 0.16 * W, 1.73, 0.3));
                Z('shirt', bx(0.12, 0.035, 0.025, R, s * 0.16 * W, 1.78, 0.35));
                F(C.steel, bx(0.035, 0.035, 0.02, R, s * 0.16 * W, 1.7, 0.35));
            }
            F(C.darkSteel, bx(0.035, 0.4, 0.03, R, 0, 1.86, 0.28));
            Z('shirt', bx(0.28 * W, 0.1, 0.08, R, 0, 2.08, 0.27));
        }
    } else if (slot === 'arm') {
        const s = target, side = s < 0 ? 'L' : 'R';
        const component = (m, part) => { m.metadata = { androidArmComponent: part + side }; return m; };
        if (variant === 'rolled') {
            component(Z('shirt', bx(0.19 * W, 0.32, 0.21, R, s * 0.38 * W, 1.9, 0)), 'upper');
            component(Z('shirt', bx(0.2 * W, 0.13, 0.22, R, s * 0.39 * W, 1.71, 0)), 'elbow');
            component(Z('skin', bx(0.15 * W, 0.42, 0.17, R, s * 0.39 * W, 1.44, 0.02)), 'forearm');
            component(Z('skin', bx(0.14, 0.14, 0.14, R, s * 0.39 * W, 1.2, 0.03)), 'hand');
        } else {
            component(Z('shirt', bx(0.19 * W, 0.42, 0.21, R, s * 0.38 * W, 1.84, 0)), 'upper');
            component(F(C.steel, cy(0.14, 0.14, 0.17, 8, R, s * 0.39 * W, 1.65, 0.02, [0, 0, Math.PI / 2])), 'elbow');
            component(F(C.darkSteel, bx(0.16 * W, 0.4, 0.18, R, s * 0.39 * W, 1.44, 0.02)), 'forearm');
            component(F(C.steel, bx(0.13, 0.14, 0.14, R, s * 0.39 * W, 1.2, 0.03)), 'hand');
            Z('lights', bx(0.035, 0.25, 0.025, R, s * 0.39 * W, 1.44, 0.125));
        }
    } else if (slot === 'sidearm') {
        const gun = target;
        if (variant === 'compact') {
            F(C.gunLight, bx(0.09, 0.13, 0.2, gun, 0, 0.04, 0.08));
            F(C.gun, bx(0.085, 0.15, 0.1, gun, 0, -0.04, -0.02));
            F(C.steel, bx(0.06, 0.06, 0.1, gun, 0, 0.04, 0.22));
            Z('lights', bx(0.035, 0.035, 0.035, gun, 0, 0.11, 0.08));
        } else {
            F(C.darkSteel, bx(0.1, 0.13, 0.3, gun, 0, 0.04, 0.13));
            F(C.gun, bx(0.09, 0.15, 0.11, gun, 0, -0.04, -0.02));
            F(C.steel, cy(0.09, 0.09, 0.16, 8, gun, 0, 0.13, 0.13, front));
            Z('lights', cy(0.055, 0.055, 0.12, 8, gun, 0, 0.13, 0.13, front));
            F(C.gunLight, cy(0.045, 0.045, 0.19, 8, gun, 0, 0.04, 0.36, front));
        }
    }
}
