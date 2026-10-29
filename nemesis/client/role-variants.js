// Complete replacement parts for the Soldier and Mechanic. These builders are called instead of
// the corresponding original geometry, never on top of it. Coordinates use the same local space
// and paint zones as the original miniatures so every combination still works with the rig.
export function soldierVariant(slot, variant, { root: R, Z, F, bx, cy, sp, fixed: C }, side, gun) {
    const front = [Math.PI / 2, 0, 0];
    if (slot === 'helmet') {
        if (variant === 'braced') { // A sealed assault helmet: solid shell, narrow visor and respirator.
            Z('armor', sp(0.66, 6, R, 0, 2.52, 0, [1.04, 1.03, 0.95]));
            Z('armor', bx(0.46, 0.13, 0.3, R, 0, 2.75, 0.01));
            Z('pants', bx(0.43, 0.14, 0.09, R, 0, 2.55, 0.29));
            Z('visor', bx(0.34, 0.065, 0.035, R, 0, 2.57, 0.35));
            Z('armor', bx(0.38, 0.22, 0.14, R, 0, 2.38, 0.28));
            Z('pants', bx(0.25, 0.09, 0.035, R, 0, 2.38, 0.36));
            for (const x of [-0.075, 0, 0.075]) Z('accent', bx(0.035, 0.065, 0.025, R, x, 2.38, 0.385));
            for (const s of [-1, 1]) {
                Z('armor', bx(0.12, 0.3, 0.36, R, s * 0.3, 2.49, 0.01, [0, 0, s * 0.08]));
                Z('accent', cy(0.11, 0.11, 0.05, 8, R, s * 0.36, 2.53, 0.03, [0, 0, Math.PI / 2]));
            }
        } else { // Rectangular panoramic EVA helmet, with the face visible behind a flat shield.
            Z('skin', bx(0.3, 0.34, 0.3, R, 0, 2.5, 0.02));
            Z('hair', bx(0.32, 0.1, 0.32, R, 0, 2.7, 0));
            Z('skin', bx(0.08, 0.06, 0.06, R, 0, 2.48, 0.18));
            Z('armor', bx(0.5, 0.48, 0.15, R, 0, 2.52, -0.23));
            Z('armor', bx(0.52, 0.11, 0.48, R, 0, 2.76, -0.015));
            Z('armor', bx(0.44, 0.11, 0.23, R, 0, 2.3, 0.17));
            for (const s of [-1, 1]) {
                Z('armor', bx(0.09, 0.42, 0.44, R, s * 0.26, 2.52, -0.01, [0, 0, s * 0.08]));
                Z('accent', bx(0.07, 0.12, 0.16, R, s * 0.3, 2.53, 0.03));
            }
            F(C.glass, bx(0.44, 0.34, 0.055, R, 0, 2.54, 0.235), { alpha: 0.42, spec: 0.8 });
            Z('visor', bx(0.28, 0.035, 0.035, R, 0, 2.34, 0.3));
        }
    } else if (slot === 'shoulders') {
        const s = side;
        // A real mesh is the anchor: autoRig moves it with the upper arm and carries its children.
        const anchor = Z('armor', bx(0.22, 0.17, 0.28, R, s * 0.6, 2.12, 0));
        if (variant === 'layered') {
            Z('armor', bx(0.45, 0.14, 0.52, anchor, s * 0.035, 0.15, 0, [0, 0, -s * 0.15]));
            Z('armor', bx(0.22, 0.2, 0.48, anchor, s * 0.2, 0.01, 0, [0, 0, -s * 0.16]));
            Z('armor', bx(0.19, 0.17, 0.43, anchor, s * 0.24, -0.16, 0, [0, 0, -s * 0.14]));
            Z('accent', bx(0.27, 0.045, 0.035, anchor, s * 0.05, 0.16, 0.28, [0, 0, -s * 0.15]));
            F(C.steel, cy(0.08, 0.08, 0.035, 8, anchor, s * 0.24, -0.01, 0.25, front));
        } else { // Tall rounded pauldron with a skirt, not the original rectangular block.
            Z('armor', cy(0.35, 0.58, 0.32, 8, anchor, s * 0.06, 0.1, 0, [0, 0, -s * 0.12]));
            Z('armor', bx(0.19, 0.29, 0.48, anchor, s * 0.29, -0.06, 0, [0, 0, -s * 0.18]));
            Z('accent', bx(0.34, 0.08, 0.1, anchor, s * 0.06, 0.13, 0.25));
            Z('visor', bx(0.09, 0.04, 0.03, anchor, s * 0.06, 0.14, 0.31));
        }
    } else if (slot === 'pack') {
        if (variant === 'ribbed') { // Compact reactor, no exposed twin cylinders.
            Z('pants', bx(0.52, 0.62, 0.3, R, 0, 1.87, -0.47));
            Z('armor', bx(0.56, 0.5, 0.27, R, 0, 1.87, -0.65));
            Z('armor', bx(0.4, 0.1, 0.3, R, 0, 2.18, -0.57));
            Z('accent', bx(0.36, 0.3, 0.055, R, 0, 1.88, -0.81));
            for (const y of [1.78, 1.87, 1.96]) Z('pants', bx(0.3, 0.035, 0.025, R, 0, y, -0.85));
            Z('visor', bx(0.1, 0.07, 0.035, R, 0, 2.08, -0.83));
        } else { // One large life-support bottle with side housings and a carry handle.
            Z('pants', bx(0.54, 0.58, 0.18, R, 0, 1.85, -0.44));
            Z('armor', cy(0.36, 0.36, 0.69, 10, R, 0, 1.9, -0.65));
            for (const y of [1.58, 2.22]) Z('accent', cy(0.38, 0.38, 0.09, 10, R, 0, y, -0.65));
            for (const s of [-1, 1]) {
                Z('armor', bx(0.17, 0.42, 0.24, R, s * 0.26, 1.86, -0.57));
                Z('visor', bx(0.08, 0.12, 0.025, R, s * 0.26, 1.96, -0.71));
            }
            F(C.steel, bx(0.3, 0.055, 0.09, R, 0, 2.32, -0.65));
        }
    } else if (slot === 'leg') {
        const s = side;
        if (variant === 'recon') {
            Z('armor', bx(0.26, 0.32, 0.12, R, s * 0.22, 0.5, 0.17));
            Z('pants', bx(0.31, 0.5, 0.34, R, s * 0.22, 0.98, 0));
            Z('armor', bx(0.25, 0.33, 0.08, R, s * 0.22, 1.01, 0.19));
            Z('accent', bx(0.26, 0.13, 0.1, R, s * 0.22, 0.74, 0.2));
        } else {
            Z('armor', bx(0.34, 0.43, 0.18, R, s * 0.22, 0.48, 0.18));
            Z('accent', bx(0.3, 0.075, 0.045, R, s * 0.22, 0.54, 0.29));
            Z('armor', bx(0.38, 0.44, 0.37, R, s * 0.22, 0.98, 0));
            Z('pants', bx(0.28, 0.11, 0.1, R, s * 0.22, 0.76, 0.2));
            Z('armor', bx(0.3, 0.18, 0.1, R, s * 0.22, 0.76, 0.24));
        }
    } else if (slot === 'torso') {
        if (variant === 'recon') {
            Z('pants', bx(0.7, 0.68, 0.45, R, 0, 1.8, 0));
            Z('armor', bx(0.58, 0.4, 0.15, R, 0, 1.96, 0.26));
            Z('armor', bx(0.36, 0.27, 0.12, R, 0, 1.62, 0.27));
            for (const s of [-1, 1]) {
                Z('accent', bx(0.09, 0.47, 0.055, R, s * 0.22, 1.85, 0.36, [0, 0, -s * 0.12]));
                Z('armor', bx(0.14, 0.28, 0.26, R, s * 0.37, 1.78, 0));
            }
            Z('visor', bx(0.12, 0.055, 0.035, R, 0, 2.02, 0.35));
            F(C.darkSteel, bx(0.38, 0.48, 0.1, R, 0, 1.75, -0.27));
        } else { // Split breastplate over a flexible dark under-suit, with a separate waist shell.
            Z('pants', bx(0.78, 0.66, 0.48, R, 0, 1.8, 0));
            for (const s of [-1, 1]) {
                Z('armor', bx(0.35, 0.42, 0.2, R, s * 0.2, 1.98, 0.3, [0, s * 0.08, -s * 0.12]));
                Z('armor', bx(0.16, 0.3, 0.14, R, s * 0.36, 1.73, 0.25, [0, 0, -s * 0.16]));
            }
            Z('armor', bx(0.5, 0.24, 0.19, R, 0, 1.63, 0.3));
            Z('accent', bx(0.23, 0.16, 0.11, R, 0, 1.79, 0.35));
            Z('pants', bx(0.15, 0.08, 0.03, R, 0, 1.79, 0.42));
            Z('visor', bx(0.11, 0.05, 0.035, R, 0, 2.05, 0.4));
            F(C.darkSteel, bx(0.4, 0.5, 0.1, R, 0, 1.75, -0.3));
        }
    } else if (slot === 'arm') {
        const s = side;
        if (variant === 'recon') {
            Z('pants', bx(0.26, 0.42, 0.28, R, s * 0.62, 1.78, 0.05));
            Z('armor', bx(0.18, 0.3, 0.1, R, s * 0.62, 1.8, 0.21));
            Z('accent', bx(0.26, 0.1, 0.3, R, s * 0.62, 1.56, 0.05));
            Z('armor', bx(0.25, 0.32, 0.27, R, s * 0.6, 1.36, 0.3, [-0.9, 0, 0]));
        } else {
            Z('armor', bx(0.34, 0.4, 0.34, R, s * 0.62, 1.78, 0.05));
            Z('pants', bx(0.32, 0.1, 0.32, R, s * 0.62, 1.56, 0.05));
            Z('armor', bx(0.34, 0.34, 0.32, R, s * 0.6, 1.36, 0.3, [-0.9, 0, 0]));
            Z('accent', bx(0.2, 0.09, 0.08, R, s * 0.6, 1.45, 0.48));
        }
    } else if (slot === 'rifle') {
        if (variant === 'compact') { // Short bullpup carbine, rear magazine and open carry handle.
            F(C.gun, bx(1.12, 0.22, 0.16, gun, 0, 0, 0));
            F(C.gunLight, bx(0.5, 0.29, 0.21, gun, -0.18, 0.015, 0));
            F(C.gun, bx(0.28, 0.25, 0.12, gun, -0.49, -0.1, 0));
            F(C.gun, bx(0.18, 0.3, 0.12, gun, -0.3, -0.25, 0, [0, 0, 0.12]));
            F(C.gun, bx(0.15, 0.24, 0.11, gun, 0.16, -0.19, 0, [0, 0, -0.18]));
            F(C.gun, bx(0.3, 0.1, 0.1, gun, 0.69, 0.01, 0));
            F(C.gunLight, bx(0.34, 0.055, 0.1, gun, 0.05, 0.23, 0));
            for (const x of [-0.08, 0.18]) F(C.gunLight, bx(0.05, 0.16, 0.09, gun, x, 0.16, 0));
            Z('visor', bx(0.1, 0.04, 0.03, gun, -0.18, 0.11, 0.12));
        } else { // Longer modular assault rifle with a drum and a substantial handguard.
            F(C.gun, bx(1.35, 0.16, 0.15, gun, 0, 0, 0));
            F(C.gunLight, bx(0.55, 0.3, 0.2, gun, -0.12, 0.04, 0));
            F(C.gun, bx(0.45, 0.22, 0.18, gun, 0.48, -0.01, 0));
            F(C.gun, cy(0.09, 0.09, 0.48, 8, gun, 0.89, 0, 0, [0, 0, Math.PI / 2]));
            F(C.gunLight, bx(0.12, 0.13, 0.15, gun, 1.1, 0, 0));
            F(C.gun, bx(0.24, 0.25, 0.12, gun, -0.65, -0.08, 0, [0, 0, -0.25]));
            F(C.gun, bx(0.15, 0.23, 0.12, gun, -0.03, -0.17, 0, [0, 0, -0.2]));
            F(C.gun, cy(0.3, 0.3, 0.13, 10, gun, 0.23, -0.2, 0, front));
            F(C.gunLight, bx(0.3, 0.1, 0.14, gun, -0.05, 0.23, 0));
            Z('visor', bx(0.1, 0.05, 0.03, gun, -0.14, 0.25, 0.09));
        }
    }
}

export function mechanicVariant(slot, variant, { scene, root: R, Z, F, bx, cy, sp, fixed: C }, side) {
    const front = [Math.PI / 2, 0, 0];
    const group = name => { const g = new (window.BABYLON.TransformNode)(name, scene); g.parent = R; return g; };
    if (slot === 'shield') {
        if (variant === 'framed') { // Enclosed welding helmet: rounded shell and inset panoramic filter.
            Z('helmet', sp(0.62, 6, R, 0, 2.5, 0, [1, 1.03, 0.98]));
            Z('gloves', bx(0.42, 0.16, 0.07, R, 0, 2.54, 0.285));
            Z('lights', bx(0.32, 0.085, 0.025, R, 0, 2.54, 0.33));
            Z('helmet', bx(0.36, 0.14, 0.13, R, 0, 2.34, 0.23));
            Z('gloves', bx(0.24, 0.04, 0.035, R, 0, 2.34, 0.31));
            for (const s of [-1, 1]) {
                Z('gloves', cy(0.1, 0.1, 0.045, 8, R, s * 0.32, 2.5, 0, [0, 0, Math.PI / 2]));
                Z('overall', bx(0.05, 0.16, 0.08, R, s * 0.24, 2.4, 0.21));
            }
        } else { // Goggles alone: bare face and hair, no hidden full-size welding mask.
            Z('skin', bx(0.3, 0.34, 0.3, R, 0, 2.44, 0.02));
            Z('hair', bx(0.32, 0.1, 0.32, R, 0, 2.64, 0));
            Z('hair', bx(0.32, 0.2, 0.08, R, 0, 2.5, -0.14));
            Z('skin', bx(0.07, 0.07, 0.07, R, 0, 2.41, 0.2));
            F(C.darkSteel, bx(0.38, 0.06, 0.35, R, 0, 2.51, 0));
            for (const s of [-1, 1]) {
                Z('gloves', cy(0.19, 0.19, 0.09, 10, R, s * 0.09, 2.51, 0.2, front));
                Z('lights', cy(0.13, 0.13, 0.025, 10, R, s * 0.09, 2.51, 0.255, front));
            }
            F(C.strap, bx(0.13, 0.025, 0.025, R, 0, 2.32, 0.19)); // mouth
        }
    } else if (slot === 'belt') {
        const g = group('mechanic_belt');
        if (variant === 'tools') {
            Z('gloves', bx(0.75, 0.12, 0.46, g, 0, 1.44, 0));
            F(C.steel, bx(0.13, 0.12, 0.05, g, 0, 1.44, 0.25));
            for (const [x, h, lean] of [[-0.29, 0.34, -0.14], [0.28, 0.3, 0.12]]) {
                F(C.steel, bx(0.055, h, 0.06, g, x, 1.24, 0.25, [0, 0, lean]));
                F(C.darkSteel, bx(0.12, 0.08, 0.08, g, x, 1.24 + h / 2, 0.25));
            }
            Z('overall', bx(0.18, 0.18, 0.12, g, 0, 1.27, 0.25));
        } else {
            F(C.strap, bx(0.75, 0.14, 0.46, g, 0, 1.44, 0));
            for (const s of [-1, 1]) {
                Z('gloves', bx(0.22, 0.28, 0.16, g, s * 0.25, 1.29, 0.25));
                Z('overall', bx(0.23, 0.075, 0.17, g, s * 0.25, 1.4, 0.25));
                F(C.steel, bx(0.045, 0.06, 0.03, g, s * 0.25, 1.34, 0.35));
            }
            F(C.steel, bx(0.12, 0.1, 0.04, g, 0, 1.44, 0.25));
        }
    } else if (slot === 'pack') {
        if (variant === 'ribbed') { // One broad gas cylinder instead of the original two small ones.
            Z('gloves', bx(0.43, 0.56, 0.22, R, 0, 1.84, -0.36));
            Z('helmet', cy(0.36, 0.36, 0.58, 10, R, 0, 1.9, -0.57));
            Z('overall', cy(0.37, 0.37, 0.08, 10, R, 0, 1.68, -0.57));
            Z('overall', cy(0.37, 0.37, 0.08, 10, R, 0, 2.12, -0.57));
            F(C.steel, cy(0.12, 0.12, 0.1, 8, R, 0, 2.24, -0.57));
            Z('lights', bx(0.09, 0.12, 0.03, R, 0, 1.9, -0.77));
        } else { // Box-shaped portable welding generator with a cable reel.
            Z('gloves', bx(0.55, 0.62, 0.29, R, 0, 1.84, -0.42));
            Z('overall', bx(0.5, 0.46, 0.18, R, 0, 1.86, -0.62));
            Z('helmet', bx(0.42, 0.1, 0.27, R, 0, 2.17, -0.5));
            for (const x of [-0.15, -0.05, 0.05]) Z('gloves', bx(0.045, 0.27, 0.025, R, x, 1.9, -0.73));
            F(C.steel, cy(0.24, 0.24, 0.07, 10, R, 0.15, 1.7, -0.74, front));
            Z('lights', bx(0.09, 0.09, 0.025, R, 0.13, 2.03, -0.73));
        }
    } else if (slot === 'leg') {
        const s = side;
        if (variant === 'apron') {
            Z('overall', bx(0.28, 0.47, 0.3, R, s * 0.2, 0.44, 0));
            Z('gloves', bx(0.24, 0.17, 0.11, R, s * 0.2, 0.45, 0.18));
            Z('overall', bx(0.31, 0.5, 0.34, R, s * 0.2, 0.96, 0));
            Z('gloves', bx(0.25, 0.12, 0.09, R, s * 0.2, 0.72, 0.19));
        } else {
            Z('overall', bx(0.3, 0.46, 0.32, R, s * 0.2, 0.44, 0));
            Z('helmet', bx(0.28, 0.33, 0.13, R, s * 0.2, 0.44, 0.18));
            Z('gloves', bx(0.22, 0.045, 0.03, R, s * 0.2, 0.46, 0.26));
            Z('overall', bx(0.34, 0.5, 0.36, R, s * 0.2, 0.96, 0));
            Z('helmet', bx(0.23, 0.15, 0.1, R, s * 0.2, 0.74, 0.2));
        }
    } else if (slot === 'outfit') {
        const g = group('mechanic_outfit');
        if (variant === 'apron') {
            F(C.strap, bx(0.44, 0.74, 0.12, g, 0, 1.65, 0.23));
            F(C.strap, bx(0.5, 0.4, 0.1, g, 0, 1.16, 0.24));
            Z('overall', bx(0.28, 0.18, 0.08, g, 0, 1.53, 0.31));
            for (const s of [-1, 1]) Z('gloves', bx(0.08, 0.46, 0.04, g, s * 0.18, 1.96, 0.25, [0, 0, -s * 0.15]));
            Z('lights', bx(0.08, 0.08, 0.025, g, -0.13, 1.9, 0.31));
        } else {
            Z('gloves', bx(0.6, 0.54, 0.15, g, 0, 1.87, 0.2));
            for (const s of [-1, 1]) {
                Z('helmet', bx(0.25, 0.22, 0.1, g, s * 0.14, 2.0, 0.31, [0, 0, -s * 0.08]));
                Z('helmet', bx(0.23, 0.22, 0.11, g, s * 0.13, 1.72, 0.31));
            }
            Z('overall', bx(0.54, 0.09, 0.1, g, 0, 1.6, 0.26));
            Z('lights', bx(0.08, 0.08, 0.025, g, -0.14, 2.0, 0.38));
        }
    } else if (slot === 'welder') {
        if (variant === 'torch') { // Compact pistol-shaped torch.
            F(C.darkSteel, bx(0.16, 0.18, 0.3, R, 0.5, 1.23, 0.48));
            Z('overall', bx(0.13, 0.12, 0.22, R, 0.5, 1.32, 0.49));
            F(C.darkSteel, bx(0.12, 0.2, 0.12, R, 0.5, 1.12, 0.42, [-0.2, 0, 0]));
            F(C.steel, cy(0.07, 0.1, 0.17, 8, R, 0.5, 1.23, 0.7, front));
            Z('lights', cy(0.035, 0.06, 0.09, 8, R, 0.5, 1.23, 0.82, front));
        } else { // Framed cutting torch with a forked heat guard and broad ceramic nozzle.
            F(C.darkSteel, bx(0.16, 0.17, 0.38, R, 0.5, 1.22, 0.47));
            Z('helmet', bx(0.19, 0.12, 0.2, R, 0.5, 1.31, 0.52));
            for (const s of [-1, 1]) F(C.steel, bx(0.035, 0.13, 0.32, R, 0.5 + s * 0.11, 1.22, 0.68));
            F(C.steel, cy(0.11, 0.08, 0.2, 8, R, 0.5, 1.22, 0.75, front));
            Z('lights', cy(0.04, 0.09, 0.1, 8, R, 0.5, 1.22, 0.89, front));
        }
    }
}
