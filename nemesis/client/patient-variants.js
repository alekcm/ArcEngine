// Patient-only choices: loose hair, cloth over the eyes, hospital gowns and evidence of
// experimentation. No lab coat, visor or armour; the miniature remains the Lab Rat.
export function patientVariant(slot, variant, { scene, root: R, Z, F, bx, fixed: C }, W, hair) {
    if (slot === 'hair') {
        Z('hair', bx(0.35, 0.12, 0.34, R, 0, 2.65, 0));
        if (variant === 'ponytail') {
            Z('hair', bx(0.32, 0.3, 0.09, R, 0, 2.49, -0.16));
            Z('hair', bx(0.16, 0.15, 0.15, R, 0, 2.51, -0.22));
            Z('bandage', bx(0.17, 0.055, 0.16, R, 0, 2.47, -0.25));
            Z('hair', bx(0.15, 0.42, 0.14, R, 0.025, 2.24, -0.28, [0.08, 0, 0.1]));
            Z('hair', bx(0.11, 0.22, 0.12, R, 0.06, 1.99, -0.31, [0.12, 0, -0.1]));
            for (const s of [-1, 1]) {
                Z('hair', bx(0.06, s < 0 ? 0.29 : 0.36, 0.1, R, s * 0.18, 2.43, 0.08, [0, 0, s * 0.09]));
                Z('hair', bx(0.045, 0.16, 0.08, R, s * 0.14, 2.54, 0.14, [0, 0, s * 0.12]));
            }
        } else {
            // Uneven individual locks instead of one featureless sheet; the loose cut
            // remains long and the messy cut is visibly more asymmetric and ragged.
            Z('hair', bx(0.3, 0.4, 0.09, R, 0, 2.43, -0.16));
            const messy = variant === 'messy';
            for (const [x, y, h, tilt] of messy
                ? [[-0.13, 2.28, 0.56, -0.16], [-0.035, 2.25, 0.63, 0.05], [0.07, 2.3, 0.53, 0.14], [0.16, 2.25, 0.6, -0.12]]
                : [[-0.12, 2.3, 0.52, -0.06], [0, 2.29, 0.55, 0.04], [0.12, 2.3, 0.52, 0.06]]) {
                Z('hair', bx(0.1, h, 0.1, R, x, y, -0.2, [0.06, 0, tilt]));
            }
            for (const s of [-1, 1]) {
                Z('hair', bx(0.09, messy && s > 0 ? 0.58 : 0.47, 0.24, R, s * 0.19, 2.37, -0.03, [0, 0, s * (messy ? 0.14 : 0.05)]));
                Z('hair', bx(0.06, messy ? 0.27 : 0.22, 0.09, R, s * 0.17, 2.45, 0.11, [0, 0, -s * 0.12]));
            }
            if (messy) {
                Z('hair', bx(0.09, 0.19, 0.07, R, -0.1, 2.58, 0.15, [0, 0, -0.25]));
                Z('hair', bx(0.06, 0.14, 0.06, R, 0.1, 2.6, 0.15, [0, 0, 0.22]));
            }
        }
    } else if (slot === 'eyes') {
        const height = variant === 'wide' ? 0.19 : variant === 'layered' ? 0.14 : 0.1;
        const band = Z('bandage', bx(0.34, height, 0.34, R, 0, 2.48, 0.02));
        band.name = 'lab_blindfold'; band.metadata = { labBlindfold: true };
        if (variant === 'bandage') {
            Z('bandage', bx(0.08, 0.2, 0.03, R, -0.1, 2.28, -0.17));
        } else if (variant === 'wide') {
            Z('bandage', bx(0.36, 0.045, 0.035, R, 0, 2.51, 0.205));
            for (const s of [-1, 1]) Z('bandage', bx(0.045, 0.16, 0.35, R, s * 0.18, 2.48, 0.02));
            Z('bandage', bx(0.1, 0.09, 0.08, R, 0, 2.48, -0.18));
        } else if (variant === 'layered') {
            for (const [y, tilt] of [[2.435, 0.08], [2.49, -0.09], [2.54, 0.06]])
                Z('bandage', bx(0.36, 0.055, 0.035, R, 0, y, 0.205, [0, 0, tilt]));
            for (const s of [-1, 1]) Z('bandage', bx(0.04, 0.14, 0.36, R, s * 0.18, 2.48, 0.02));
        } else {
            // The loose ends sit behind even the gathered ponytail and move with the head.
            const back = hair === 'ponytail' ? -0.43 : -0.31;
            Z('bandage', bx(0.09, 0.07, Math.abs(back + 0.13), R, 0, 2.48, (back - 0.13) / 2));
            Z('bandage', bx(0.1, 0.09, 0.06, R, 0, 2.48, back + 0.02));
            for (const [x, y, h, tilt] of [[-0.075, 2.23, 0.5, -0.08], [0.075, 2.29, 0.38, 0.1]]) {
                const tail = Z('bandage', bx(0.065, h, 0.035, R, x, y, back, [0, 0, tilt]));
                tail.name = 'lab_blindfold_tail'; tail.metadata = { labBlindfoldTail: true };
            }
        }
    } else if (slot === 'torso') {
        const torn = variant === 'torn';
        const body = Z('gown', bx(torn ? 0.50 * W : 0.56 * W, 0.64, torn ? 0.31 : 0.34, R, 0, 1.86, 0));
        body.metadata = { labTorso: true };
        // Cloth seams, not lapels or a professional coat; keep the ID on the chest visible.
        Z('bandage', bx(0.06, 0.4, 0.025, R, -0.19 * W, 1.84, 0.17, [0, 0, torn ? -0.16 : 0]));
        if (torn) {
            Z('gown', bx(0.16, 0.12, 0.035, R, -0.12 * W, 2.08, 0.18, [0, 0, -0.15]));
            Z('bandage', bx(0.075, 0.47, 0.03, R, -0.14 * W, 1.85, 0.185, [0, 0, -0.16]));
            Z('bandage', bx(0.11, 0.11, 0.035, R, -0.16 * W, 1.68, 0.2, [0, 0, 0.18]));
            Z('gown', bx(0.15, 0.08, 0.03, R, -0.15 * W, 1.72, 0.22, [0, 0, -0.12]));
        } else {
            for (const x of [-0.15, -0.08]) Z('gown', bx(0.025, 0.38, 0.025, R, x * W, 1.83, 0.18));
            Z('bandage', bx(0.2, 0.035, 0.025, R, -0.1 * W, 2.09, 0.185));
        }
    } else if (slot === 'gown') {
        const hem = new window.BABYLON.TransformNode('lab_gown_hem', scene); hem.parent = R;
        let skirt;
        if (variant === 'torn') {
            skirt = Z('gown', bx(0.58 * W, 0.38, 0.36, hem, 0, 1.36, 0));
            for (const [x, width, height] of [[-0.2175, 0.145, 0.25], [-0.0725, 0.145, 0.14], [0.0725, 0.145, 0.32], [0.2175, 0.145, 0.19]])
                Z('gown', bx(width * W, height, 0.36, hem, x * W, 1.17 - height / 2, 0)).metadata = { labHemFlap: true };
            Z('bandage', bx(0.13, 0.08, 0.025, hem, -0.16 * W, 1.27, 0.19, [0, 0, 0.14]));
        } else {
            skirt = Z('gown', bx(0.62 * W, 0.82, 0.37, hem, 0, 1.14, 0));
            for (const s of [-1, 1]) {
                Z('gown', bx(0.06, 0.7, 0.025, hem, s * 0.2 * W, 1.16, 0.19));
                Z('bandage', bx(0.1, 0.05, 0.03, hem, s * 0.18 * W, 1.02, 0.2));
            }
        }
        skirt.name = 'lab_gown'; skirt.metadata = { labGown: true };
        for (const s of [-1, 1]) {
            // The cloth overlaps the complete upper arm instead of leaving skin outside its edge.
            Z('gown', bx((variant === 'torn' ? 0.24 : 0.26) * W, variant === 'torn' ? 0.22 : 0.3, 0.27, R, s * 0.36 * W, 2.04, 0))
                .metadata = { labSleeve: s < 0 ? 'L' : 'R' };
            if (variant === 'long') Z('bandage', bx(0.26 * W, 0.04, 0.28, R, s * 0.36 * W, 1.91, 0));
        }
        Z('bandage', bx(0.5 * W, 0.055, 0.035, R, 0, 1.62, 0.19));
    } else if (slot === 'ankle') {
        // Both options wrap the bare ankle, below even the long gown, and follow that leg.
        const x = (variant === 'tracker' ? -1 : 1) * 0.15 * W;
        if (variant === 'tracker') {
            Z('bandage', bx(0.21, 0.13, 0.22, R, x, 0.3, 0)).metadata = { labAnkleBand: true };
            F(C.darkSteel, bx(0.15, 0.12, 0.09, R, x, 0.3, 0.14));
            Z('lights', bx(0.095, 0.045, 0.015, R, x, 0.315, 0.19)).metadata = { labTrackerDisplay: true };
            F(C.steel, bx(0.09, 0.012, 0.02, R, x, 0.275, 0.192));
        } else {
            Z('bandage', bx(0.21, 0.065, 0.22, R, x, 0.3, 0)).metadata = { labAnkleBand: true };
            F(C.steel, bx(0.035, 0.11, 0.04, R, x, 0.265, 0.115));
            Z('bandage', bx(0.14, 0.18, 0.03, R, x, 0.19, 0.14)).metadata = { labAnkleTag: true };
            for (const y of [0.23, 0.2, 0.17]) F(C.darkSteel, bx(0.095, 0.012, 0.012, R, x, y, 0.16));
        }
    } else if (slot === 'wrists') {
        for (const s of [-1, 1]) {
            const x = s * 0.39 * W;
            if (variant === 'bandaged') {
                for (const y of [1.29, 1.36, 1.43])
                    Z('bandage', bx(0.16, 0.075, 0.19, R, x, y, 0.02, [0, 0, s * 0.1]));
                Z('bandage', bx(0.07, 0.13, 0.035, R, x + s * 0.035, 1.24, 0.12, [0, 0, s * 0.2]));
            } else {
                Z('bandage', bx(0.18, 0.12, 0.2, R, x, 1.3, 0.02));
                F(C.strap, bx(0.19, 0.045, 0.21, R, x, 1.3, 0.02));
                F(C.steel, bx(0.065, 0.055, 0.035, R, x, 1.3, 0.14));
                Z('bandage', bx(0.12, 0.045, 0.03, R, x + s * 0.07, 1.22, 0.11, [0, 0, s * 0.2]));
            }
        }
    }
}
