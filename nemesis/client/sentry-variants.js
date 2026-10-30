// Full Sentry replacements. The night-vision assembly remains in characters.js unchanged;
// these parts rebuild the protective suit, respirator, shoulders and fabric cloak independently.
export function sentryVariant(slot, variant, { scene, root: R, Z, F, bx, cy, fixed: C }, side) {
    const s = side, front = [Math.PI / 2, 0, 0];
    if (slot === 'leg') {
        const heavy = variant === 'breacher';
        Z('pants', bx(heavy ? 0.36 : 0.3, 0.22, heavy ? 0.49 : 0.44, R, s * 0.2, 0.11, 0.04));
        F(C.rubber, bx(heavy ? 0.37 : 0.31, 0.045, heavy ? 0.5 : 0.45, R, s * 0.2, 0.025, 0.04));
        const shin = Z('armor', bx(heavy ? 0.32 : 0.26, 0.52, heavy ? 0.35 : 0.29, R, s * 0.2, 0.5, 0));
        const thigh = Z('armor', bx(heavy ? 0.33 : 0.28, 0.49, heavy ? 0.36 : 0.3, R, s * 0.2, 1.04, 0));
        if (heavy) {
            Z('accent', bx(0.31, 0.2, 0.09, R, s * 0.2, 0.78, 0.2));
            Z('armor', bx(0.12, 0.33, 0.22, shin, s * 0.16, 0.06, 0.03));
            F(C.steel, bx(0.19, 0.04, 0.035, R, s * 0.2, 0.77, 0.26));
        } else {
            F(C.darkSteel, cy(0.21, 0.21, 0.12, 8, R, s * 0.2, 0.78, 0.05, [0, 0, Math.PI / 2]));
            Z('accent', bx(0.22, 0.12, 0.08, R, s * 0.2, 0.8, 0.17));
            Z('armor', bx(0.1, 0.24, 0.18, thigh, s * 0.13, 0.02, 0.02));
        }
    } else if (slot === 'core') {
        const heavy = variant === 'breacher';
        Z('pants', bx(heavy ? 0.66 : 0.6, 0.27, 0.39, R, 0, 1.3, 0));
        Z('armor', bx(heavy ? 0.73 : 0.65, 0.14, 0.43, R, 0, 1.45, 0));
        for (const x of [-0.22, 0, 0.22]) F(C.darkSteel, bx(0.13, 0.14, 0.09, R, x, 1.42, 0.23));
        Z('armor', bx(heavy ? 0.7 : 0.59, 0.68, heavy ? 0.47 : 0.4, R, 0, 1.84, 0))
            .metadata = { sentryTorso: true };
        if (heavy) {
            Z('accent', bx(0.64, 0.39, 0.13, R, 0, 1.97, 0.28));
            Z('armor', bx(0.56, 0.17, 0.12, R, 0, 1.66, 0.28));
            for (const x of [-0.23, 0.23]) F(C.darkSteel, bx(0.09, 0.47, 0.055, R, x, 1.84, 0.36));
            Z('armor', bx(0.53, 0.62, 0.3, R, 0, 1.87, -0.38)).metadata = { sentryBackpack: true };
            for (const x of [-0.18, 0.18]) F(C.steel, cy(0.15, 0.15, 0.53, 8, R, x, 1.91, -0.56));
        } else {
            for (const y of [2.04, 1.87, 1.7]) {
                Z('accent', bx(0.48, 0.14, 0.13, R, 0, y, 0.23));
                F(C.darkSteel, bx(0.36, 0.025, 0.03, R, 0, y - 0.055, 0.31));
            }
            Z('armor', bx(0.42, 0.53, 0.28, R, 0, 1.9, -0.37)).metadata = { sentryBackpack: true };
            for (const x of [-0.16, 0.16]) F(C.steel, cy(0.1, 0.1, 0.49, 8, R, x, 1.92, -0.54));
        }
        for (const x of [-0.15, 0.15]) Z('visor', bx(0.06, 0.04, 0.03, R, x, 2.07, heavy ? 0.36 : 0.31));
    } else if (slot === 'arm') {
        const heavy = variant === 'breacher';
        Z('armor', bx(heavy ? 0.3 : 0.24, 0.42, heavy ? 0.3 : 0.25, R, s * 0.52, 1.78, 0.05));
        Z('accent', bx(heavy ? 0.33 : 0.26, 0.09, heavy ? 0.32 : 0.27, R, s * 0.52, 1.54, 0.05));
        Z('armor', bx(heavy ? 0.28 : 0.22, 0.37, heavy ? 0.28 : 0.23, R, s * 0.5, 1.36, 0.3, [-0.9, 0, 0]));
        Z('pants', bx(0.2, 0.17, 0.25, R, s * 0.48, 1.26, 0.58))
            .metadata = { sentryHand: s < 0 ? 'L' : 'R' };
        if (heavy) Z('accent', bx(0.13, 0.22, 0.1, R, s * 0.52, 1.8, 0.2));
        else F(C.darkSteel, bx(0.1, 0.27, 0.07, R, s * 0.52, 1.8, 0.19));
    } else if (slot === 'shoulder') {
        if (variant === 'segmented') {
            const pad = Z('armor', bx(0.34, 0.16, 0.39, R, s * 0.5, 2.14, 0));
            pad.metadata = { sentryShoulder: s < 0 ? 'L' : 'R' };
            for (const [x, y, w] of [[-0.1, 0.09, 0.12], [0, 0.12, 0.13], [0.1, 0.09, 0.12]])
                Z('armor', bx(w, 0.09, 0.42, pad, x, y, 0, [0, 0, s * x * 0.6]));
            Z('accent', bx(0.31, 0.035, 0.035, pad, 0, 0.12, 0.22));
            Z('armor', bx(0.3, 0.18, 0.34, pad, 0, -0.13, 0.01));
        } else {
            const pad = Z('armor', bx(0.43, 0.22, 0.48, R, s * 0.51, 2.14, 0));
            pad.metadata = { sentryShoulder: s < 0 ? 'L' : 'R' };
            Z('accent', bx(0.41, 0.06, 0.46, pad, 0, 0.14, 0));
            Z('armor', bx(0.11, 0.32, 0.42, pad, s * 0.19, -0.13, 0));
            F(C.darkSteel, bx(0.26, 0.18, 0.33, pad, 0, -0.18, 0));
            F(C.steel, bx(0.12, 0.04, 0.04, pad, s * 0.13, 0.03, 0.25));
        }
    } else if (slot === 'respirator') {
        if (variant === 'reinforced') {
            Z('helmet', bx(0.35, 0.26, 0.25, R, 0, 2.4, 0.27)).metadata = { sentryMask: true };
            Z('accent', bx(0.27, 0.2, 0.1, R, 0, 2.39, 0.43));
            F(C.darkSteel, bx(0.17, 0.09, 0.05, R, 0, 2.39, 0.5));
            for (const x of [-0.055, 0, 0.055]) F(C.steel, bx(0.025, 0.08, 0.02, R, x, 2.39, 0.535));
            for (const k of [-1, 1]) {
                F(C.darkSteel, cy(0.19, 0.19, 0.17, 8, R, k * 0.24, 2.4, 0.24, [0, 0, Math.PI / 2])).metadata = { sentryFilter: true };
                Z('accent', cy(0.15, 0.15, 0.03, 8, R, k * 0.34, 2.4, 0.24, [0, 0, Math.PI / 2]));
                F(C.steel, bx(0.035, 0.1, 0.1, R, k * 0.36, 2.4, 0.24));
            }
        } else {
            // Tapered, forward-projecting mask and paired rectangular vent housings.
            Z('accent', cy(0.24, 0.34, 0.25, 6, R, 0, 2.4, 0.32, front)).metadata = { sentryMask: true };
            Z('helmet', bx(0.31, 0.13, 0.13, R, 0, 2.31, 0.27));
            F(C.darkSteel, cy(0.14, 0.14, 0.08, 8, R, 0, 2.4, 0.47, front));
            Z('accent', cy(0.1, 0.1, 0.025, 8, R, 0, 2.4, 0.52, front));
            for (const k of [-1, 1]) {
                F(C.darkSteel, bx(0.13, 0.23, 0.2, R, k * 0.22, 2.4, 0.25)).metadata = { sentryFilter: true };
                for (const y of [2.33, 2.4, 2.47]) Z('accent', bx(0.14, 0.025, 0.21, R, k * 0.22, y, 0.25));
            }
        }
    } else if (slot === 'cloak') {
        const drape = new window.BABYLON.TransformNode('sentry_cloak_drape', scene); drape.parent = R;
        const cloth = (w, h, d, x, y, z, rot) => Z('cloak', bx(w, h, d, drape, x, y, z, rot));
        // The whole rear of the cloak sits against the back, between the armour and the pack.
        // The pack and its tanks therefore remain on top of the cloth in every suit variant.
        const backZ = -0.275;
        if (variant === 'classic') {
            cloth(0.8, 1.3, 0.1, 0, 0.95, backZ).metadata = { sentryCloakBack: true };
            cloth(0.8, 0.72, 0.1, 0, 1.92, backZ);
            for (const k of [-1, 1]) cloth(0.12, 1.5, 0.6, k * 0.42, 1.1, -0.1);
            cloth(0.84, 0.08, 0.5, 0, 2.3, 0);
            for (const k of [-1, 1]) cloth(0.22, 0.56, 0.08, k * 0.3, 2.0, 0.34, [0, 0, k * 0.12]);
        } else if (variant === 'split') {
            // Two long separated tails, with a fitted shoulder cape and narrower side panels.
            cloth(0.72, 0.55, 0.12, 0, 1.82, backZ).metadata = { sentryCloakBack: true };
            cloth(0.72, 0.23, 0.12, 0, 2.15, backZ);
            for (const k of [-1, 1]) {
                cloth(0.3, 1.18, 0.1, k * 0.2, 1.0, backZ, [0, 0, k * 0.04]);
                cloth(0.11, 1.25, 0.42, k * 0.39, 1.18, -0.27);
                cloth(0.17, 0.44, 0.08, k * 0.29, 2.03, 0.29, [0, 0, k * 0.2]);
            }
            cloth(0.73, 0.13, 0.42, 0, 2.27, -0.03);
            F(C.steel, bx(0.11, 0.075, 0.04, drape, 0, 2.2, 0.22));
        } else {
            // A shorter weathered mantle with an asymmetric, genuinely ragged lower edge.
            cloth(0.86, 0.76, 0.12, 0, 1.62, backZ).metadata = { sentryCloakBack: true };
            cloth(0.86, 0.32, 0.12, 0, 2.15, backZ);
            for (const [x, h] of [[-0.33, 0.36], [-0.12, 0.2], [0.1, 0.42], [0.32, 0.27]])
                cloth(0.21, h, 0.12, x, 1.24 - h / 2, backZ);
            cloth(0.18, 1.02, 0.49, -0.45, 1.5, -0.25, [0, 0, -0.06]);
            cloth(0.12, 0.75, 0.37, 0.43, 1.64, -0.25, [0, 0, 0.08]);
            cloth(0.91, 0.18, 0.53, 0, 2.23, -0.04);
            cloth(0.27, 0.58, 0.09, -0.28, 1.98, 0.31, [0, 0, -0.13]);
            cloth(0.17, 0.4, 0.08, 0.29, 2.05, 0.28, [0, 0, 0.18]);
            Z('accent', bx(0.08, 0.06, 0.04, drape, -0.18, 2.22, 0.25));
        }
        // Join the collar to the back panel beneath the pack, not over the tanks.
        cloth(0.7, 0.12, 0.16, 0, 2.24, -0.23).metadata = { sentryCloakJoin: true };
    }
}
