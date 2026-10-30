// Complete, interchangeable parts for the Survivor and Xenobiologist.  These builders replace
// the selected part; the classic meshes live in characters.js.  Coordinates are in miniature
// space and each limb/handheld prop is left to the common rig (or parented to its prop node).

/** The injured Survivor always retains her bandana, sling, radio and pistol. */
export function survivorVariant(slot, variant, C, P = C.root, side = 1) {
    const { root: R, Z, F, bx, cy, fixed: FIXED } = C;
    const s = side;
    if (slot === 'hair') {
        if (variant === 'wavy') {
            Z('hair', bx(0.4, 0.14, 0.38, R, 0, 2.65, -0.02));
            Z('hair', bx(0.38, 0.43, 0.11, R, 0, 2.44, -0.17));
            for (const k of [-1, 1]) {
                Z('hair', bx(0.11, 0.4, 0.31, R, k * 0.21, 2.43, -0.01, [0, 0, -k * 0.12]));
                Z('hair', bx(0.11, 0.19, 0.13, R, k * 0.2, 2.52, 0.12, [0, 0, k * 0.18]));
                Z('hair', bx(0.12, 0.15, 0.12, R, k * 0.24, 2.27, -0.07, [0, 0, -k * 0.26]));
            }
            Z('hair', bx(0.3, 0.08, 0.08, R, -0.03, 2.59, 0.17, [0, 0, 0.19]));
        } else { // longer, separated locks falling to the shoulders, not a larger bob
            Z('hair', bx(0.4, 0.14, 0.38, R, 0, 2.65, -0.02));
            Z('hair', bx(0.36, 0.49, 0.1, R, 0, 2.43, -0.17));
            for (const k of [-1, 1]) {
                Z('hair', bx(0.11, 0.57, 0.2, R, k * 0.21, 2.36, 0.02, [0, 0, -k * 0.08]));
                Z('hair', bx(0.09, 0.24, 0.12, R, k * 0.23, 2.2, 0.06, [0, 0, -k * 0.16]));
                Z('hair', bx(0.11, 0.21, 0.08, R, k * 0.19, 2.51, 0.13, [0, 0, k * 0.14]));
            }
            Z('hair', bx(0.25, 0.09, 0.08, R, 0.04, 2.6, 0.17, [0, 0, -0.12]));
        }
    } else if (slot === 'bandana') {
        if (variant === 'folded') {
            // Two overlapping cloth folds and a narrow wrap, with the entire mouth still covered.
            Z('mask', bx(0.34, 0.2, 0.34, R, 0, 2.35, 0.02)).metadata = { survivorMask: true };
            Z('mask', bx(0.36, 0.09, 0.05, R, 0, 2.4, 0.2, [0, 0, -0.06]));
            Z('mask', bx(0.29, 0.1, 0.06, R, 0.015, 2.29, 0.2, [0, 0, 0.08]));
            Z('mask', bx(0.13, 0.07, 0.14, R, 0, 2.35, -0.2));
            const ties = new window.BABYLON.TransformNode('survivor_bandana_ties', C.scene); ties.parent = R;
            for (const k of [-1, 1]) {
                Z('mask', bx(0.04, 0.09, 0.04, ties, k * 0.07, 2.32, -0.25, [0, 0, k * 0.14])).metadata = { survivorBandanaTie: true };
            }
        } else { // wide kerchief with a small knot and loose ends centred at the nape
            Z('mask', bx(0.35, 0.22, 0.34, R, 0, 2.35, 0.02)).metadata = { survivorMask: true };
            Z('mask', bx(0.37, 0.075, 0.07, R, 0, 2.41, 0.2, [0, 0, 0.1]));
            Z('mask', bx(0.18, 0.16, 0.07, R, 0.05, 2.28, 0.2, [0, 0, -0.14]));
            Z('mask', bx(0.14, 0.1, 0.14, R, 0, 2.35, -0.21)).metadata = { survivorBandanaKnot: true };
            // The short ends sit behind the hair and above the radio, on either side of the knot.
            const ties = new window.BABYLON.TransformNode('survivor_bandana_ties', C.scene); ties.parent = R;
            Z('mask', bx(0.045, 0.2, 0.04, ties, -0.045, 2.26, -0.285, [0, 0, -0.08])).metadata = { survivorBandanaTie: true };
            Z('mask', bx(0.04, 0.15, 0.04, ties, 0.045, 2.28, -0.285, [0, 0, 0.08])).metadata = { survivorBandanaTie: true };
        }
    } else if (slot === 'radio') {
        if (variant === 'dual') {
            // A pair of independent field-radio cells on a padded backplate.
            Z('armor', bx(0.46, 0.49, 0.14, R, 0, 1.84, -0.27));
            for (const k of [-1, 1]) {
                Z('armor', bx(0.2, 0.43, 0.22, R, k * 0.12, 1.86, -0.42));
                F(FIXED.darkSteel, bx(0.15, 0.07, 0.04, R, k * 0.12, 1.89, -0.55));
                F(FIXED.steel, bx(0.12, 0.03, 0.035, R, k * 0.12, 1.81, -0.56));
                Z('lights', bx(0.05, 0.035, 0.02, R, k * 0.12, 1.99, -0.55));
            }
            F(FIXED.rubber, cy(0.03, 0.04, 0.45, 6, R, -0.24, 2.21, -0.43));
            F(FIXED.steel, cy(0.025, 0.03, 0.26, 6, R, 0.24, 2.13, -0.43));
        } else { // a large, framed salvage radio with a central receiver
            Z('armor', bx(0.49, 0.54, 0.28, R, 0, 1.83, -0.35));
            F(FIXED.darkSteel, bx(0.38, 0.36, 0.06, R, 0, 1.86, -0.53));
            Z('shirt', bx(0.25, 0.16, 0.04, R, 0, 1.88, -0.57));
            Z('lights', bx(0.09, 0.035, 0.02, R, 0, 1.97, -0.57));
            for (const k of [-1, 1]) {
                F(FIXED.steel, bx(0.055, 0.62, 0.1, R, k * 0.26, 1.84, -0.43));
                F(FIXED.steel, bx(0.09, 0.07, 0.34, R, k * 0.25, 1.57, -0.36));
            }
            F(FIXED.steel, bx(0.5, 0.05, 0.08, R, 0, 2.1, -0.44));
            F(FIXED.rubber, cy(0.035, 0.04, 0.48, 6, R, 0.25, 2.3, -0.43));
        }
    } else if (slot === 'boots') {
        if (variant === 'field') {
            Z('armor', bx(0.23, 0.25, 0.38, R, s * 0.16, 0.125, 0.07));
            F(FIXED.rubber, bx(0.25, 0.055, 0.4, R, s * 0.16, 0.03, 0.07));
            Z('armor', bx(0.23, 0.14, 0.28, R, s * 0.16, 0.29, 0));
        } else {
            Z('armor', bx(0.28, 0.29, 0.39, R, s * 0.16, 0.145, 0.07));
            F(FIXED.rubber, bx(0.29, 0.06, 0.41, R, s * 0.16, 0.03, 0.07));
            F(FIXED.steel, bx(0.22, 0.12, 0.08, R, s * 0.16, 0.18, 0.24));
        }
    } else if (slot === 'leg') {
        Z('pants', bx(variant === 'field' ? 0.23 : 0.26, 0.95, 0.27, R, s * 0.16, 0.74, 0));
        if (variant === 'field') {
            Z('armor', bx(0.19, 0.18, 0.06, R, s * 0.16, 0.73, 0.15));
            Z('pants', bx(0.09, 0.24, 0.13, R, s * 0.28, 1.02, -0.02));
        } else {
            Z('armor', bx(0.24, 0.25, 0.08, R, s * 0.16, 0.7, 0.16));
            F(FIXED.strap, bx(0.26, 0.055, 0.29, R, s * 0.16, 0.92, 0));
        }
    } else if (slot === 'pelvis') {
        Z('pants', bx(0.5, 0.36, 0.32, R, 0, 1.34, 0));
        F(FIXED.strap, bx(0.54, 0.1, 0.36, R, 0, 1.46, 0));
        F(FIXED.steel, bx(0.13, 0.09, 0.04, R, 0, 1.46, 0.2));
        if (variant === 'salvage') for (const k of [-1, 1]) Z('armor', bx(0.18, 0.22, 0.13, R, k * 0.18, 1.28, -0.13));
    } else if (slot === 'torso') {
        Z('shirt', bx(variant === 'field' ? 0.54 : 0.58, 0.8, 0.34, R, 0, 1.74, 0)).metadata = { survivorTorso: true };
    } else if (slot === 'sleeve') {
        Z('shirt', bx(variant === 'field' ? 0.22 : 0.26, 0.44, 0.27, R, s * 0.34, 1.85, 0)).metadata = { survivorUpper: s < 0 ? 'L' : 'R' };
        if (variant === 'field') {
            Z('armor', bx(0.23, 0.12, 0.29, R, s * 0.34, 1.99, 0));
        } else {
            Z('armor', bx(0.28, 0.18, 0.3, R, s * 0.34, 2.01, 0));
            F(FIXED.strap, bx(0.27, 0.06, 0.29, R, s * 0.34, 1.69, 0));
        }
    } else if (slot === 'vest') {
        if (variant === 'field') {
            Z('armor', bx(0.46, 0.48, 0.1, R, 0, 1.82, 0.2));
            for (const k of [-1, 1]) {
                Z('armor', bx(0.18, 0.25, 0.08, R, k * 0.12, 1.69, 0.27));
                F(FIXED.strap, bx(0.08, 0.5, 0.04, R, k * 0.18, 1.83, 0.27));
            }
        } else {
            Z('armor', bx(0.55, 0.5, 0.13, R, 0, 1.83, 0.22));
            F(FIXED.steel, bx(0.5, 0.06, 0.05, R, 0, 1.91, 0.31));
            Z('armor', bx(0.3, 0.2, 0.1, R, -0.06, 1.66, 0.32));
            Z('shirt', bx(0.16, 0.17, 0.09, R, 0.2, 1.65, 0.31));
        }
    } else if (slot === 'sidearm') {
        // The grip overlaps the hand even at the end of the shared recoil animation.
        const grip = F(FIXED.darkSteel, bx(0.11, 0.2, 0.18, P, 0, 0, 0.025));
        grip.metadata = { survivorGunGrip: true };
        if (variant === 'compact') {
            F(FIXED.darkSteel, bx(0.11, 0.1, 0.27, P, 0, 0.1, 0.14));
            F(FIXED.gunLight, bx(0.1, 0.045, 0.2, P, 0, 0.17, 0.15));
            F(FIXED.rubber, bx(0.12, 0.045, 0.12, P, 0, -0.1, 0.025));
        } else {
            F(FIXED.darkSteel, bx(0.17, 0.16, 0.42, P, 0, 0.1, 0.2));
            F(FIXED.steel, bx(0.13, 0.08, 0.25, P, 0, 0.2, 0.2));
            F(FIXED.darkSteel, bx(0.1, 0.2, 0.12, P, 0, -0.01, 0.2, [-0.2, 0, 0]));
            F(FIXED.steel, cy(0.06, 0.06, 0.1, 6, P, 0, 0.1, 0.44, [Math.PI / 2, 0, 0]));
        }
    }
}

/** A scientist in a dark jacket over a light shirt, with curls, glasses and living sample. */
export function xenoVariant(slot, variant, C, P = C.root, side = 1) {
    const { root: R, Z, F, bx, cy, sp, fixed: FIXED } = C;
    const s = side;
    if (slot === 'hair') {
        Z('hair', bx(0.36, 0.14, 0.36, R, 0, 2.66, -0.02));
        const count = variant === 'loosecurl' ? 12 : 9;
        for (let i = 0; i < count; i++) {
            const a = i * Math.PI * 2 / count;
            Z('hair', sp(variant === 'loosecurl' ? 0.15 : 0.13, 5, R,
                Math.sin(a) * 0.16, 2.66 + (i % 2) * 0.055, Math.cos(a) * 0.15 - 0.03));
        }
        if (variant === 'loosecurl') {
            // Loose curls end above the jacket, behind the temples and clear of the probe.
            for (const k of [-1, 1]) for (let i = 0; i < 3; i++)
                Z('hair', sp(0.14, 5, R, k * (0.18 + (i % 2) * 0.025), 2.52 - i * 0.1, -0.12));
            for (const x of [-0.1, 0, 0.1]) Z('hair', sp(0.15, 5, R, x, 2.44, -0.18));
        } else {
            F(FIXED.strap, bx(0.15, 0.06, 0.13, R, -0.035, 2.54, -0.22));
            // Keep the gathered curls above the backpack mount and away from its original pivot.
            for (let i = 0; i < 5; i++)
                Z('hair', sp(i === 4 ? 0.14 : 0.17, 5, R, i % 2 ? -0.015 : -0.065, 2.48 - i * 0.075, -0.26));
        }
    } else if (slot === 'boots') {
        Z('pants', bx(variant === 'field' ? 0.27 : 0.23, 0.24, 0.38, R, s * 0.16, 0.12, 0.07));
        F(FIXED.rubber, bx(variant === 'field' ? 0.28 : 0.24, 0.05, 0.4, R, s * 0.16, 0.025, 0.07));
        if (variant === 'field') Z('pants', bx(0.26, 0.25, 0.27, R, s * 0.16, 0.32, 0));
    } else if (slot === 'leg') {
        Z('pants', bx(variant === 'field' ? 0.25 : 0.23, 0.96, 0.27, R, s * 0.16, 0.75, 0));
        if (variant === 'utility') {
            Z('pants', bx(0.1, 0.25, 0.16, R, s * 0.28, 0.99, -0.03));
            F(FIXED.strap, bx(0.23, 0.06, 0.29, R, s * 0.16, 0.69, 0));
        } else {
            Z('pants', bx(0.26, 0.23, 0.08, R, s * 0.16, 0.71, 0.15));
            F(FIXED.strap, bx(0.27, 0.06, 0.3, R, s * 0.16, 0.5, 0));
        }
    } else if (slot === 'pelvis') {
        Z('pants', bx(0.5, 0.35, 0.31, R, 0, 1.34, 0));
        F(FIXED.strap, bx(0.52, 0.09, 0.34, R, 0, 1.47, 0));
        F(FIXED.steel, bx(0.1, 0.07, 0.04, R, 0, 1.47, 0.19));
    } else if (slot === 'torso') {
        // The pale shirt is an actual central garment, not a stripe painted onto the jacket.
        Z('shirt', bx(0.39, 0.65, 0.30, R, 0, 1.855, 0)).metadata = { xenoShirt: true };
        // Leave a broad pale front visible between the lapels and under the harness.
        Z('shirt', bx(0.25, 0.55, 0.06, R, 0, 1.815, 0.18));
        F(FIXED.strap, bx(0.04, 0.44, 0.035, R, 0, 1.82, 0.225));
        for (const k of [-1, 1]) {
            Z('coat', bx(variant === 'collar' ? 0.19 : 0.23, 0.8, 0.38, R, k * 0.2, 1.7, 0));
            Z('coat', bx(0.16, 0.18, 0.07, R, k * 0.11, 2.01, 0.2, [0, 0, k * 0.28]));
            if (variant === 'pockets') {
                Z('coat', bx(0.18, 0.18, 0.09, R, k * 0.2, 1.62, 0.24));
                F(FIXED.steel, bx(0.15, 0.035, 0.04, R, k * 0.2, 1.7, 0.3));
            } else Z('coat', bx(0.11, 0.21, 0.28, R, k * 0.25, 2.1, -0.02));
        }
        Z('coat', bx(0.5, 0.74, 0.09, R, 0, 1.72, -0.17));
        if (variant === 'pockets') {
            // A longer, split field jacket: paired front and back tails move with the legs.
            // This is a different garment silhouette, not pockets on the original short jacket.
            for (const k of [-1, 1]) {
                Z('coat', bx(0.28, 0.5, 0.1, R, k * 0.22, 1.22, 0.18)).metadata = { xenoCoatTail: 'front' };
                Z('coat', bx(0.29, 0.46, 0.1, R, k * 0.17, 1.22, -0.18)).metadata = { xenoCoatTail: 'back' };
            }
        }
    } else if (slot === 'sleeve') {
        Z('coat', bx(variant === 'collar' ? 0.23 : 0.26, 0.46, 0.29, R, s * 0.34, 1.85, 0)).metadata = { xenoUpper: s < 0 ? 'L' : 'R' };
        Z('shirt', bx(variant === 'collar' ? 0.26 : 0.23, 0.08, variant === 'collar' ? 0.33 : 0.3, R, s * 0.34, 1.65, 0))
            .metadata = { xenoSleeveCuff: s < 0 ? 'L' : 'R' };
        if (variant === 'pockets') Z('coat', bx(0.27, 0.16, 0.32, R, s * 0.34, 2.01, 0));
    } else if (slot === 'tool') {
        const grip = F(FIXED.darkSteel, bx(0.12, 0.17, 0.18, P, 0, 0, 0.025));
        grip.metadata = { xenoToolGrip: true };
        if (variant === 'sampler') {
            const sample = F('#93d95c', cy(0.105, 0.105, 0.3, 7, P, 0, 0.035, 0.22, [Math.PI / 2, 0, 0]));
            sample.metadata = { xenoSample: true };
            F(FIXED.steel, cy(0.14, 0.14, 0.055, 7, P, 0, 0.035, 0.37, [Math.PI / 2, 0, 0]));
            F(FIXED.steel, cy(0.045, 0.045, 0.16, 6, P, 0, 0.035, 0.47, [Math.PI / 2, 0, 0]));
        } else {
            F(FIXED.darkSteel, bx(0.22, 0.18, 0.33, P, 0, 0.09, 0.2));
            F(FIXED.glass, bx(0.16, 0.07, 0.13, P, 0, 0.19, 0.18), { alpha: 0.8, spec: 0.8 });
            const sample = F('#93d95c', cy(0.09, 0.09, 0.23, 7, P, 0.12, 0.09, 0.21, [Math.PI / 2, 0, 0]));
            sample.metadata = { xenoSample: true };
            F(FIXED.steel, cy(0.1, 0.1, 0.05, 7, P, 0.12, 0.09, 0.34, [Math.PI / 2, 0, 0]));
        }
    }
}

/** Alternative over-shoulder manipulators; P is a root-level transform so the rig cannot split it. */
export function xenoProbeVariant(variant, C, P, head) {
    const { Z, F, bx, cy, fixed: FIXED } = C;
    // A rigid bridge joins either alternative arm to the shared backpack.
    Z('gear', bx(0.48, 0.11, 0.16, P, -0.23, 2.05, -0.25));
    if (variant === 'twin') {
        F(FIXED.darkSteel, bx(0.43, 0.12, 0.17, P, -0.4, 2.13, -0.22));
        F(FIXED.steel, cy(0.15, 0.15, 0.09, 7, P, -0.58, 2.16, -0.22, [Math.PI / 2, 0, 0]));
        Z('gear', bx(0.12, 0.54, 0.15, P, -0.58, 2.43, -0.22));
        F(FIXED.steel, bx(0.42, 0.09, 0.12, P, -0.58, 2.71, -0.22));
        for (const k of [-1, 1]) {
            F(FIXED.darkSteel, bx(0.13, 0.16, 0.18, P, -0.58 + k * 0.18, 2.79, -0.2));
            Z('lights', cy(0.09, 0.09, 0.04, 6, P, -0.58 + k * 0.18, 2.79, -0.09, [Math.PI / 2, 0, 0]));
        }
        head.position.set(-0.58, 2.73, -0.05);
        F(FIXED.steel, bx(0.12, 0.1, 0.18, head, 0, 0, 0));
    } else {
        F(FIXED.darkSteel, bx(0.46, 0.14, 0.2, P, -0.41, 2.12, -0.25));
        F(FIXED.steel, cy(0.19, 0.19, 0.12, 8, P, -0.62, 2.17, -0.25, [Math.PI / 2, 0, 0]));
        Z('gear', bx(0.16, 0.45, 0.19, P, -0.62, 2.39, -0.25));
        F(FIXED.steel, bx(0.14, 0.18, 0.26, P, -0.62, 2.63, -0.19));
        head.position.set(-0.61, 2.77, -0.05);
        Z('gear', bx(0.33, 0.19, 0.3, head, 0, 0.04, 0));
        F(FIXED.darkSteel, bx(0.25, 0.16, 0.19, head, 0, -0.06, 0.08));
        Z('lights', cy(0.14, 0.14, 0.06, 8, head, 0, -0.06, 0.2, [Math.PI / 2, 0, 0]));
        for (const k of [-1, 1]) F(FIXED.steel, bx(0.04, 0.18, 0.24, head, k * 0.15, -0.04, 0.03));
    }
}
