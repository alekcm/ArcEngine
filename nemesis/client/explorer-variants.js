// Complete, independently replaceable parts for the Scout and Pilot. Each builder is called instead
// of the corresponding original geometry; shared body, pose and paint zones remain untouched.
export function scoutVariant(slot, variant, { scene, root: R, Z, F, bx, cy, sp, fixed: C }, side, gun) {
    const front = [Math.PI / 2, 0, 0];
    if (slot === 'hair') {
        // Both styles keep the long red-haired silhouette and leave the scarred right eye visible.
        Z('hair', bx(0.35, 0.14, 0.34, R, 0, 2.65, -0.01));
        Z('hair', bx(0.28, 0.3, 0.1, R, 0, 2.48, -0.16));
        Z('hair', bx(0.1, 0.33, 0.16, R, -0.17, 2.48, 0.08, [0, 0, -0.16]));
        Z('hair', bx(0.24, 0.1, 0.13, R, -0.04, 2.6, 0.12, [0, 0, 0.25]));
        if (variant === 'braid') {
            // The gathered root bridges the nape and the plait in front of the back-mounted rifle.
            Z('hair', bx(0.18, 0.18, 0.22, R, -0.09, 2.49, -0.25));
            F(C.strap, bx(0.17, 0.055, 0.18, R, -0.09, 2.43, -0.31));
            // Alternating tapered plaits interlock instead of a straight slab or a loose ponytail.
            for (let i = 0; i < 6; i++) {
                const w = 0.17 - i * 0.012;
                Z('hair', bx(w, 0.15, 0.16, R, -0.09 + (i % 2 ? 0.035 : -0.035), 2.43 - i * 0.105, -0.38, [0, 0, i % 2 ? 0.35 : -0.35]));
            }
            F(C.strap, bx(0.13, 0.055, 0.16, R, -0.08, 1.85, -0.38));
            Z('hair', bx(0.08, 0.14, 0.1, R, -0.08, 1.77, -0.38));
        } else {
            // A gathered high tail with a broad, tapered end stands clear of the slung rifle.
            Z('hair', sp(0.19, 6, R, -0.08, 2.55, -0.24, [1, 0.8, 1]));
            F(C.strap, bx(0.16, 0.07, 0.17, R, -0.09, 2.47, -0.31));
            Z('hair', bx(0.19, 0.4, 0.16, R, -0.12, 2.24, -0.39, [0.14, 0, -0.12]));
            Z('hair', bx(0.14, 0.25, 0.12, R, -0.15, 1.95, -0.42, [0.12, 0, -0.08]));
            Z('hair', bx(0.07, 0.22, 0.06, R, -0.02, 2.23, -0.48, [0.14, 0, 0.1]));
        }
    } else if (slot === 'bracer') {
        // The forearm shell is the anchor, so the entire new device follows the animated arm.
        if (variant === 'display') {
            const anchor = Z('jacket', cy(0.21, 0.23, 0.32, 8, R, -0.37, 1.44, 0.02));
            F(C.darkSteel, bx(0.24, 0.25, 0.09, anchor, -0.015, 0.015, 0.14));
            Z('visor', bx(0.18, 0.15, 0.025, anchor, -0.015, 0.045, 0.20));
            for (const x of [-0.075, -0.015, 0.045]) F(C.steel, bx(0.035, 0.035, 0.025, anchor, x, -0.09, 0.2));
            Z('jacket', bx(0.1, 0.05, 0.08, anchor, -0.14, 0.08, 0.11));
        } else {
            const anchor = Z('jacket', bx(0.18, 0.31, 0.2, R, -0.37, 1.44, 0.02));
            for (const y of [-0.105, 0, 0.105]) {
                F(C.darkSteel, bx(0.23, 0.075, 0.23, anchor, 0, y, 0.015));
                Z('visor', bx(0.11, 0.035, 0.025, anchor, 0, y, 0.145));
            }
            F(C.steel, cy(0.1, 0.1, 0.045, 8, anchor, -0.12, 0.1, 0.02, [0, 0, Math.PI / 2]));
        }
    } else if (slot === 'vest') {
        if (variant === 'plated') {
            // Separate upper chest shells and a tapered abdomen, not the original two flat blocks.
            for (const s of [-1, 1]) {
                Z('jacket', bx(0.21, 0.32, 0.13, R, s * 0.115, 2.01, 0.21, [0, s * 0.12, -s * 0.13]));
                Z('jacket', bx(0.1, 0.35, 0.25, R, s * 0.24, 1.82, 0, [0, 0, -s * 0.08]));
                F(C.darkSteel, bx(0.04, 0.18, 0.035, R, s * 0.09, 1.98, 0.29));
            }
            Z('jacket', cy(0.38, 0.29, 0.25, 6, R, 0, 1.7, 0.14));
            Z('jacket', bx(0.4, 0.46, 0.09, R, 0, 1.85, -0.19));
            Z('visor', bx(0.055, 0.07, 0.035, R, 0.14, 2.08, 0.3));
        } else {
            // A lighter webbing harness with a central chest panel and usable field pouches.
            Z('jacket', bx(0.3, 0.35, 0.1, R, 0, 1.95, 0.19));
            for (const s of [-1, 1]) {
                F(C.strap, bx(0.08, 0.58, 0.045, R, s * 0.16, 1.91, 0.25, [0, 0, -s * 0.12]));
                Z('jacket', bx(0.17, 0.2, 0.13, R, s * 0.18, 1.62, 0.23));
                F(C.darkSteel, bx(0.17, 0.055, 0.15, R, s * 0.18, 1.7, 0.23));
                F(C.steel, bx(0.055, 0.035, 0.025, R, s * 0.18, 1.64, 0.31));
            }
            Z('jacket', bx(0.3, 0.38, 0.12, R, 0, 1.9, -0.19));
            Z('visor', bx(0.08, 0.045, 0.025, R, 0, 2.04, 0.26));
        }
    } else if (slot === 'shoulders') {
        const s = side;
        // Child geometry stays attached to an actual shoulder mesh as the auto-rig swings the arm.
        const anchor = Z('jacket', bx(0.17, 0.13, 0.2, R, s * 0.36, 2.1, 0));
        if (variant === 'compact') {
            Z('jacket', cy(0.13, 0.29, 0.16, 8, anchor, s * 0.025, 0.08, 0, [0, 0, -s * 0.18]));
            F(C.darkSteel, bx(0.18, 0.035, 0.21, anchor, s * 0.025, 0.16, 0));
        } else {
            for (let i = 0; i < 3; i++) Z('jacket', bx(0.24 - i * 0.025, 0.075, 0.29 - i * 0.02, anchor, s * (0.035 + i * 0.035), 0.1 - i * 0.06, 0, [0, 0, -s * 0.16]));
            F(C.steel, cy(0.06, 0.06, 0.025, 6, anchor, s * 0.12, 0.02, 0.16, front));
        }
    } else if (slot === 'rifle') {
        if (variant === 'carbine') {
            F(C.gunLight, bx(0.6, 0.16, 0.14, gun, 0, 0, 0));
            F(C.gun, bx(0.27, 0.11, 0.1, gun, -0.4, 0.01, 0));
            F(C.gun, bx(0.1, 0.21, 0.12, gun, -0.52, -0.045, 0));
            F(C.darkSteel, bx(0.18, 0.22, 0.11, gun, -0.12, -0.14, 0));
            F(C.gun, cy(0.055, 0.055, 0.38, 8, gun, 0.45, 0.025, 0, [0, 0, Math.PI / 2]));
            F(C.steel, bx(0.25, 0.055, 0.08, gun, 0.08, 0.12, 0));
        } else {
            F(C.gun, bx(0.72, 0.13, 0.12, gun, -0.05, 0, 0));
            F(C.gunLight, bx(0.25, 0.22, 0.16, gun, -0.14, -0.005, 0));
            F(C.gunLight, bx(0.28, 0.2, 0.1, gun, -0.53, -0.07, 0));
            F(C.gun, bx(0.12, 0.2, 0.09, gun, -0.2, -0.18, 0));
            F(C.steel, cy(0.05, 0.05, 0.72, 8, gun, 0.61, 0.02, 0, [0, 0, Math.PI / 2]));
            F(C.darkSteel, cy(0.105, 0.105, 0.28, 8, gun, 0.08, 0.15, 0, [0, 0, Math.PI / 2]));
            Z('visor', cy(0.065, 0.065, 0.025, 8, gun, 0.23, 0.15, 0, [0, 0, Math.PI / 2]));
            F(C.gun, bx(0.08, 0.12, 0.1, gun, 0.91, 0.02, 0));
        }
    }
}

export function pilotVariant(slot, variant, { scene, root: R, Z, F, bx, cy, sp, fixed: C }, W, gun) {
    const front = [Math.PI / 2, 0, 0], FUR = '#d9cdb0';
    if (slot === 'hair') {
        if (variant === 'spiky') {
            Z('hair', bx(0.34, 0.1, 0.33, R, 0, 2.63, -0.01));
            Z('hair', bx(0.3, 0.13, 0.1, R, 0, 2.53, -0.15));
            for (const [x, y, h, tilt] of [[-0.12, 2.72, 0.16, -0.25], [-0.04, 2.75, 0.2, -0.12], [0.04, 2.74, 0.18, 0.12], [0.12, 2.7, 0.13, 0.25]])
                Z('hair', bx(0.085, h, 0.18, R, x, y, 0.01, [0.15, 0, tilt]));
        } else {
            Z('hair', bx(0.34, 0.11, 0.33, R, 0, 2.64, -0.01));
            Z('hair', bx(0.31, 0.16, 0.1, R, 0, 2.52, -0.15));
            Z('hair', bx(0.31, 0.13, 0.14, R, -0.035, 2.68, 0.08, [0, 0, -0.24]));
            Z('hair', bx(0.12, 0.19, 0.11, R, -0.15, 2.57, 0.12, [0, 0, -0.18]));
            Z('hair', bx(0.08, 0.11, 0.2, R, 0.15, 2.57, -0.03));
        }
    } else if (slot === 'optics') {
        if (variant === 'round') {
            F(C.darkSteel, cy(0.18, 0.18, 0.065, 10, R, 0.1, 2.48, 0.205, front));
            Z('visor', cy(0.12, 0.12, 0.025, 10, R, 0.1, 2.48, 0.25, front));
            F(C.steel, bx(0.045, 0.06, 0.19, R, 0.19, 2.5, 0.08));
            Z('armor', bx(0.055, 0.04, 0.07, R, 0.2, 2.52, 0.17));
        } else {
            // A single offset projection screen, not a full-face helmet.
            F(C.darkSteel, bx(0.24, 0.13, 0.07, R, 0.08, 2.48, 0.205));
            Z('visor', bx(0.2, 0.085, 0.025, R, 0.08, 2.48, 0.255));
            F(C.steel, bx(0.06, 0.045, 0.18, R, 0.2, 2.52, 0.09));
            Z('armor', bx(0.07, 0.08, 0.07, R, 0.2, 2.51, 0.17));
        }
    } else if (slot === 'headset') {
        if (variant === 'single') {
            Z('armor', cy(0.15, 0.15, 0.07, 8, R, -0.19, 2.45, -0.01, [0, 0, Math.PI / 2]));
            F(C.darkSteel, cy(0.1, 0.1, 0.025, 8, R, -0.235, 2.45, -0.01, [0, 0, Math.PI / 2]));
            F(C.strap, bx(0.38, 0.035, 0.07, R, 0, 2.68, -0.09));
            F(C.darkSteel, bx(0.04, 0.04, 0.22, R, -0.2, 2.4, 0.1, [0.15, 0, 0]));
            Z('visor', bx(0.045, 0.04, 0.055, R, -0.2, 2.39, 0.22));
        } else {
            for (const s of [-1, 1]) {
                F(C.rubber, cy(0.18, 0.18, 0.09, 8, R, s * 0.19, 2.45, -0.01, [0, 0, Math.PI / 2]));
                Z('armor', cy(0.14, 0.14, 0.04, 8, R, s * 0.25, 2.45, -0.01, [0, 0, Math.PI / 2]));
            }
            F(C.darkSteel, bx(0.42, 0.065, 0.1, R, 0, 2.7, -0.08));
            Z('armor', bx(0.22, 0.035, 0.08, R, 0, 2.745, -0.08));
        }
    } else if (slot === 'coat') {
        if (variant === 'lapels') {
            // Cropped padded bomber with a fitted waistband and a soft shearling collar.
            Z('suit', bx(0.6 * W, 0.52, 0.41, R, 0, 1.89, -0.015));
            Z('suit', bx(0.52 * W, 0.3, 0.16, R, 0, 1.99, 0.26)); // jacket front over the shared torso
            Z('suit', bx(0.57 * W, 0.13, 0.4, R, 0, 1.61, -0.015));
            for (const s of [-1, 1]) {
                Z('suit', bx(0.21 * W, 0.28, 0.24, R, s * 0.39 * W, 1.83, 0)); // padded sleeves follow the arms
                Z('suit', bx(0.18 * W, 0.18, 0.09, R, s * 0.18 * W, 1.76, 0.28));
                F(FUR, bx(0.14 * W, 0.29, 0.08, R, s * 0.12 * W, 2.03, 0.345, [0, 0, -s * 0.2]));
                F(FUR, bx(0.14 * W, 0.12, 0.22, R, s * 0.12 * W, 2.13, 0.26)); // join lapel to collar
                F(FUR, bx(0.22 * W, 0.12, 0.24, R, s * 0.39 * W, 1.28, 0.02));
            }
            F(FUR, bx(0.66 * W, 0.16, 0.46, R, 0, 2.17, -0.04));
            F(FUR, bx(0.28 * W, 0.2, 0.18, R, 0, 2.27, -0.16));
            F(C.steel, bx(0.035, 0.35, 0.035, R, 0, 1.9, 0.355));
        } else {
            // A tailored long flight coat with distinct overlapping tails and a high fur collar.
            // Group the tails with the torso so the auto-rig cannot pull them off on a stride.
            const tails = new (window.BABYLON.TransformNode)('pilot_coat_tails', scene); tails.parent = R;
            Z('suit', bx(0.62 * W, 0.72, 0.42, R, 0, 1.83, -0.02));
            Z('suit', bx(0.54 * W, 0.32, 0.16, R, 0, 1.98, 0.26));
            for (const s of [-1, 1]) {
                Z('suit', bx(0.24 * W, 0.73, 0.32, tails, s * 0.2 * W, 1.18, -0.04, [0, 0, s * 0.06]));
                Z('suit', bx(0.18 * W, 0.25, 0.08, R, s * 0.19 * W, 1.67, 0.25));
                F(FUR, bx(0.14 * W, 0.42, 0.085, R, s * 0.14 * W, 1.99, 0.345, [0, 0, -s * 0.16]));
                F(FUR, bx(0.14 * W, 0.13, 0.22, R, s * 0.14 * W, 2.13, 0.26));
                F(FUR, bx(0.22 * W, 0.14, 0.24, R, s * 0.39 * W, 1.28, 0.02));
            }
            F(FUR, bx(0.72 * W, 0.2, 0.48, R, 0, 2.19, -0.05));
            F(FUR, bx(0.34 * W, 0.25, 0.19, R, 0, 2.31, -0.17));
            F(FUR, bx(0.62 * W, 0.085, 0.34, tails, 0, 0.84, -0.05));
            F(C.strap, bx(0.62 * W, 0.075, 0.45, R, 0, 1.51, -0.01));
            F(C.steel, bx(0.1, 0.09, 0.035, R, 0, 1.51, 0.23));
        }
    } else if (slot === 'sidearm') {
        if (variant === 'compact') {
            F(C.gunLight, bx(0.11, 0.13, 0.22, gun, 0, 0.05, 0.09));
            F(C.gun, bx(0.09, 0.15, 0.1, gun, 0, -0.03, 0));
            F(C.darkSteel, bx(0.09, 0.05, 0.12, gun, 0, 0.13, 0.13));
            Z('visor', bx(0.035, 0.025, 0.035, gun, 0, 0.16, 0.1));
        } else {
            F(C.gun, bx(0.1, 0.14, 0.27, gun, 0, 0.05, 0.1));
            F(C.gunLight, bx(0.09, 0.16, 0.11, gun, 0, -0.03, 0));
            F(C.steel, cy(0.065, 0.065, 0.25, 8, gun, 0, 0.06, 0.33, front));
            Z('armor', bx(0.12, 0.08, 0.1, gun, 0, 0.09, 0.2));
            Z('visor', bx(0.04, 0.025, 0.04, gun, 0, 0.15, 0.16));
        }
    }
}
