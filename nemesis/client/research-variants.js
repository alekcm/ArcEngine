// Complete replacement equipment for the Hacker and Scientist. These builders are called instead
// of the original part, not on top of it. The shared body, paint zones and animation rig are kept.
export function hackerVariant(slot, variant, { root: R, Z, F, bx, cy, sp, fixed: C }, W, side, gun) {
    const face = [Math.PI / 2, 0, 0];
    if (slot === 'hood') {
        // A continuous fabric collar joins either hood to the torso even with the original mask.
        Z('hood', bx(0.32, 0.19, 0.28, R, 0, 2.19, 0));
        if (variant === 'rimmed') {
            // A fitted, angular cowl with a structural rim that frames (but never replaces) the mask.
            Z('hood', bx(0.39, 0.13, 0.36, R, 0, 2.67, -0.025));
            Z('hood', bx(0.36, 0.39, 0.12, R, 0, 2.47, -0.17));
            for (const s of [-1, 1]) {
                Z('hood', bx(0.11, 0.42, 0.33, R, s * 0.19, 2.47, -0.015, [0, 0, -s * 0.07]));
                Z('hood', bx(0.095, 0.43, 0.08, R, s * 0.19, 2.47, 0.16, [0, 0, -s * 0.07]));
                F(C.darkSteel, bx(0.045, 0.37, 0.045, R, s * 0.185, 2.47, 0.205, [0, 0, -s * 0.07]));
                Z('hood', bx(0.2, 0.21, 0.31, R, s * 0.19, 2.23, -0.035, [0, 0, -s * 0.25]));
            }
            Z('hood', bx(0.4, 0.075, 0.11, R, 0, 2.65, 0.17));
            Z('hood', bx(0.43, 0.17, 0.16, R, 0, 2.21, -0.16));
        } else {
            // A soft hood becomes a distinct draped mantle; the centre strip overlaps the cowl.
            Z('hood', bx(0.41, 0.13, 0.36, R, 0, 2.67, -0.02));
            Z('hood', bx(0.39, 0.42, 0.13, R, 0, 2.47, -0.18));
            for (const s of [-1, 1]) {
                Z('hood', bx(0.12, 0.41, 0.34, R, s * 0.185, 2.47, -0.01, [0, 0, -s * 0.05]));
                Z('hood', bx(0.22, 0.24, 0.32, R, s * 0.19, 2.23, -0.02, [0, 0, -s * 0.3]));
                Z('hood', bx(0.1, 0.42, 0.1, R, s * 0.22, 2.07, -0.17, [0.12, 0, -s * 0.18]));
            }
            Z('hood', bx(0.4, 0.08, 0.1, R, 0, 2.65, 0.17));
            Z('hood', bx(0.37, 0.56, 0.11, R, 0, 2.13, -0.24, [0.1, 0, 0]));
            Z('hood', bx(0.29, 0.24, 0.1, R, 0, 1.82, -0.3, [0.16, 0, 0]));
            F(C.strap, bx(0.22, 0.045, 0.035, R, 0, 2.22, -0.31));
        }
    } else if (slot === 'mask') {
        // A single, full-height shell seals the entire face. The flexible gasket also closes
        // the neck below the jaw, independent of the chosen hood and chest piece.
        F(C.rubber, bx(0.22, 0.18, 0.25, R, 0, 2.22, 0));
        if (variant === 'seams') {
            F(C.rubber, bx(0.37, 0.4, 0.15, R, 0, 2.47, 0.16));
            Z('pants', bx(0.33, 0.13, 0.09, R, 0, 2.59, 0.245));
            Z('pants', bx(0.28, 0.15, 0.1, R, 0, 2.34, 0.24));
            F(C.darkSteel, bx(0.31, 0.12, 0.045, R, 0, 2.49, 0.25));
            Z('lights', bx(0.24, 0.025, 0.022, R, 0, 2.52, 0.278));
            Z('lights', bx(0.025, 0.14, 0.022, R, 0, 2.42, 0.28));
            for (const s of [-1, 1]) {
                F(C.steel, bx(0.035, 0.24, 0.04, R, s * 0.15, 2.45, 0.245, [0, 0, -s * 0.12]));
                Z('lights', bx(0.035, 0.03, 0.02, R, s * 0.11, 2.34, 0.3));
            }
        } else {
            F(C.darkSteel, bx(0.38, 0.4, 0.15, R, 0, 2.47, 0.16));
            Z('pants', bx(0.37, 0.13, 0.1, R, 0, 2.59, 0.24));
            F(C.rubber, bx(0.31, 0.1, 0.06, R, 0, 2.49, 0.26));
            Z('lights', bx(0.25, 0.028, 0.025, R, 0, 2.51, 0.3));
            Z('pants', bx(0.24, 0.17, 0.14, R, 0, 2.36, 0.26));
            for (const s of [-1, 1]) {
                F(C.steel, cy(0.12, 0.12, 0.08, 8, R, s * 0.135, 2.36, 0.255, face));
                F(C.rubber, cy(0.08, 0.08, 0.025, 8, R, s * 0.135, 2.36, 0.305, face));
                Z('lights', bx(0.018, 0.09, 0.025, R, s * 0.035, 2.36, 0.345));
            }
        }
    } else if (slot === 'arm') {
        const s = side;
        // The upper arm anchors all the cybernetic pieces to the shoulder through the auto-rig.
        const upper = Z('jacket', bx(0.19 * W, 0.42, 0.2, R, s * 0.38 * W, 1.84, 0));
        F(C.darkSteel, bx(0.075, 0.3, 0.08, upper, s * 0.085, 0, 0.035));
        Z('lights', bx(0.025, 0.16, 0.025, upper, s * 0.12, 0.015, 0.07));
        const elbow = F(C.steel, cy(0.14, 0.14, 0.2 * W, 8, R, s * 0.39 * W, 1.64, 0.02, [0, 0, Math.PI / 2]));
        F(C.darkSteel, cy(0.075, 0.075, 0.025, 8, elbow, 0, -s * 0.11, 0));
        if (variant === 'ribbed') {
            // A complete flexible segmented limb rather than rings on the old forearm.
            const forearm = Z('pants', cy(0.19, 0.15, 0.38, 8, R, s * 0.39 * W, 1.43, 0.02));
            for (const y of [-0.13, -0.04, 0.05, 0.14]) {
                F(C.darkSteel, cy(0.205, 0.205, 0.045, 8, forearm, 0, y, 0));
                Z('lights', bx(0.08, 0.025, 0.02, forearm, 0, y, 0.11));
            }
            F(C.steel, bx(0.045, 0.29, 0.07, forearm, s * 0.09, 0, 0));
            Z('pants', bx(0.16, 0.13, 0.16, R, s * 0.39 * W, 1.18, 0.04));
        } else {
            // A faceted prosthesis; only the left arm carries the integrated terminal.
            const forearm = Z('pants', bx(0.19 * W, 0.36, 0.19, R, s * 0.39 * W, 1.43, 0.02));
            F(C.darkSteel, bx(0.2, 0.075, 0.22, forearm, 0, 0.13, 0));
            F(C.steel, bx(0.2, 0.06, 0.22, forearm, 0, -0.14, 0));
            if (s < 0) {
                F(C.gun, bx(0.22, 0.25, 0.09, forearm, 0, 0.01, 0.13));
                Z('lights', bx(0.17, 0.15, 0.025, forearm, 0, 0.035, 0.19));
                for (const x of [-0.065, 0, 0.065]) F(C.steel, bx(0.025, 0.025, 0.025, forearm, x, -0.08, 0.19));
            } else {
                F(C.steel, bx(0.1, 0.25, 0.055, forearm, 0, 0, 0.12));
                Z('lights', bx(0.025, 0.18, 0.025, forearm, 0, 0, 0.16));
            }
            Z('pants', bx(0.16, 0.13, 0.16, R, s * 0.39 * W, 1.18, 0.04));
        }
    } else if (slot === 'vest') {
        if (variant === 'harness') {
            // Open webbing around a small central interface, with real side/back connections.
            Z('pants', bx(0.21 * W, 0.27, 0.08, R, 0, 1.96, 0.19));
            for (const s of [-1, 1]) {
                F(C.strap, bx(0.07, 0.59, 0.045, R, s * 0.16 * W, 1.91, 0.205, [0, 0, -s * 0.16]));
                F(C.strap, bx(0.08, 0.52, 0.04, R, s * 0.14 * W, 1.91, -0.2, [0, 0, s * 0.18]));
                Z('gear', bx(0.13, 0.19, 0.1, R, s * 0.2 * W, 1.68, 0.21));
                F(C.darkSteel, bx(0.14, 0.045, 0.12, R, s * 0.2 * W, 1.75, 0.21));
            }
            F(C.steel, bx(0.14, 0.07, 0.04, R, 0, 1.97, 0.25));
            Z('lights', bx(0.08, 0.025, 0.025, R, 0, 1.97, 0.28));
        } else {
            // Faceted, articulated breastplate and back, with a separate abdominal panel.
            for (const s of [-1, 1]) {
                Z('pants', bx(0.21 * W, 0.29, 0.12, R, s * 0.105 * W, 2.02, 0.2, [0, s * 0.1, -s * 0.12]));
                Z('pants', bx(0.09, 0.38, 0.29, R, s * 0.25 * W, 1.86, 0));
                F(C.darkSteel, bx(0.05, 0.19, 0.035, R, s * 0.11 * W, 2.01, 0.28));
            }
            Z('pants', cy(0.38 * W, 0.3 * W, 0.24, 6, R, 0, 1.73, 0.13));
            Z('pants', bx(0.36 * W, 0.46, 0.08, R, 0, 1.89, -0.2));
            F(C.steel, bx(0.12, 0.1, 0.035, R, 0, 2.06, 0.29));
            Z('lights', bx(0.07, 0.035, 0.02, R, 0, 2.06, 0.32));
        }
    } else if (slot === 'smartgun') {
        if (variant === 'compact') {
            Z('gear', bx(0.14, 0.15, 0.29, gun, 0, 0, 0.035));
            F(C.gun, bx(0.12, 0.09, 0.17, gun, 0, 0.08, 0.055));
            F(C.rubber, bx(0.1, 0.19, 0.11, gun, 0, -0.13, -0.055, [-0.2, 0, 0]));
            F(C.steel, cy(0.075, 0.075, 0.09, 8, gun, 0, 0.01, 0.22, face));
            Z('lights', bx(0.065, 0.055, 0.025, gun, 0, 0.1, 0.07));
        } else {
            Z('gear', bx(0.13, 0.12, 0.38, gun, 0, 0.01, 0.08));
            F(C.gun, bx(0.15, 0.06, 0.25, gun, 0, 0.1, 0.06));
            F(C.rubber, bx(0.1, 0.19, 0.1, gun, 0, -0.12, -0.07, [-0.2, 0, 0]));
            F(C.steel, cy(0.055, 0.055, 0.24, 8, gun, 0, 0, 0.36, face));
            F(C.darkSteel, bx(0.1, 0.11, 0.07, gun, 0, 0, 0.48));
            Z('lights', bx(0.065, 0.035, 0.1, gun, 0, 0.14, 0.08));
            F(C.steel, bx(0.025, 0.04, 0.25, gun, 0.08, 0.075, 0.13));
        }
        // The pistol's cable socket follows the hand and its recoil; the suit's back cables remain.
        F(C.rubber, bx(0.055, 0.2, 0.055, gun, 0, -0.22, -0.055, [0.22, 0, 0]));
        Z('gear', bx(0.08, 0.07, 0.07, gun, 0, -0.32, -0.08));
    }
}

export function scientistVariant(slot, variant, { scene, root: R, Z, F, bx, cy, sp, fixed: C }, W, seatY) {
    const face = [Math.PI / 2, 0, 0];
    const axle = [0, 0, Math.PI / 2];
    if (slot === 'goggles') {
        if (variant === 'round') {
            // Optical instruments on the forehead; ordinary spectacles remain visible below them.
            F(C.strap, bx(0.39, 0.075, 0.31, R, 0, 2.62, -0.01));
            F(C.darkSteel, bx(0.34, 0.09, 0.07, R, 0, 2.62, 0.17));
            for (const s of [-1, 1]) {
                F(C.steel, cy(0.145, 0.145, 0.1, 10, R, s * 0.105, 2.62, 0.22, face));
                F(C.rubber, cy(0.11, 0.11, 0.025, 10, R, s * 0.105, 2.62, 0.28, face));
                Z('lights', cy(0.075, 0.075, 0.025, 10, R, s * 0.105, 2.62, 0.3, face));
            }
        } else {
            // Hinged forehead-mounted magnifier with a broad, translucent screen.
            F(C.strap, bx(0.4, 0.075, 0.32, R, 0, 2.64, -0.01));
            F(C.darkSteel, bx(0.4, 0.09, 0.09, R, 0, 2.63, 0.18));
            F(C.glass, bx(0.34, 0.16, 0.025, R, 0, 2.52, 0.25), { alpha: 0.5 });
            for (const s of [-1, 1]) {
                F(C.steel, cy(0.08, 0.08, 0.07, 8, R, s * 0.2, 2.6, 0.14, axle));
                F(C.darkSteel, bx(0.035, 0.18, 0.04, R, s * 0.18, 2.52, 0.25));
            }
            Z('lights', bx(0.1, 0.025, 0.025, R, 0, 2.66, 0.235));
        }
    } else if (slot === 'tablet') {
        // A transform group keeps the whole instrument together when the body is seated.
        const holder = new window.BABYLON.TransformNode('scientist_tablet', scene);
        holder.parent = R; holder.position.set(-0.38 * W, 1.27, 0.18); holder.rotation.x = 0.35;
        if (variant === 'panel') {
            F(C.gun, bx(0.37, 0.065, 0.28, holder, 0, 0, 0));
            F(C.steel, bx(0.32, 0.025, 0.23, holder, 0, 0.04, 0));
            Z('lights', bx(0.27, 0.018, 0.16, holder, 0, 0.06, 0.015));
            F(C.rubber, bx(0.08, 0.09, 0.1, holder, 0, -0.06, -0.12));
            for (const x of [-0.12, -0.06, 0, 0.06, 0.12]) F(C.darkSteel, bx(0.03, 0.02, 0.025, holder, x, 0.065, -0.105));
        } else {
            F(C.darkSteel, bx(0.29, 0.1, 0.22, holder, 0, 0, 0));
            F(C.gunLight, bx(0.15, 0.04, 0.15, holder, -0.055, 0.07, 0.01));
            Z('lights', bx(0.12, 0.02, 0.1, holder, -0.055, 0.1, 0.015));
            F(C.steel, cy(0.1, 0.1, 0.06, 8, holder, 0.095, 0.08, 0));
            F(C.rubber, cy(0.06, 0.06, 0.025, 8, holder, 0.095, 0.12, 0));
            F(C.rubber, bx(0.08, 0.09, 0.1, holder, 0, -0.07, -0.09));
            Z('lights', bx(0.025, 0.025, 0.04, holder, 0.1, 0.06, 0.1));
        }
    } else if (slot === 'coat') {
        if (variant === 'field') {
            // Short padded field jacket: connected back, two front panels and raised collar.
            Z('coat', bx(0.55 * W, 0.64, 0.14, R, 0, 1.85, -0.17));
            for (const s of [-1, 1]) {
                Z('coat', bx(0.19 * W, 0.61, 0.1, R, s * 0.2 * W, 1.85, 0.16));
                Z('coat', bx(0.1, 0.43, 0.29, R, s * 0.27 * W, 1.86, 0));
                Z('coat', bx(0.16 * W, 0.12, 0.12, R, s * 0.19 * W, 2.12, 0.16));
                F(C.darkSteel, bx(0.12, 0.12, 0.04, R, s * 0.2 * W, 1.7, 0.225));
                Z('coat', bx(0.12, 0.04, 0.055, R, s * 0.2 * W, 1.76, 0.225));
            }
            Z('coat', bx(0.38 * W, 0.13, 0.1, R, 0, 2.19, -0.12));
            F(C.steel, bx(0.025, 0.45, 0.035, R, 0, 1.88, 0.2));
        } else {
            // Open research coat, split around the seated figure rather than a hanging apron.
            Z('coat', bx(0.54 * W, 0.63, 0.12, R, 0, 1.85, -0.17));
            for (const s of [-1, 1]) {
                Z('coat', bx(0.16 * W, 0.62, 0.1, R, s * 0.21 * W, 1.85, 0.16));
                Z('coat', bx(0.1, 0.42, 0.28, R, s * 0.27 * W, 1.86, 0));
                Z('coat', bx(0.09, 0.31, 0.08, R, s * 0.12 * W, 2.04, 0.21, [0, 0, -s * 0.24]));
                Z('coat', bx(0.14, 0.16, 0.05, R, s * 0.21 * W, 1.69, 0.23));
                F(C.steel, bx(0.11, 0.025, 0.025, R, s * 0.21 * W, 1.76, 0.265));
            }
            Z('coat', bx(0.35 * W, 0.11, 0.12, R, 0, 2.18, -0.14));
            Z('lights', bx(0.055, 0.06, 0.025, R, -0.22 * W, 2.02, 0.23));
        }
    } else if (slot === 'scanner') {
        // The instruments have a grip reaching the right hand, their own bodies and active tips.
        if (variant === 'probe') {
            F(C.darkSteel, bx(0.085, 0.19, 0.1, R, 0.39 * W, 1.2, 0.16));
            F(C.steel, cy(0.07, 0.07, 0.3, 8, R, 0.39 * W, 1.19, 0.33, face));
            F(C.gun, cy(0.12, 0.08, 0.12, 8, R, 0.39 * W, 1.19, 0.52, face));
            Z('lights', cy(0.075, 0.075, 0.025, 8, R, 0.39 * W, 1.19, 0.59, face));
        } else {
            F(C.rubber, bx(0.085, 0.17, 0.1, R, 0.39 * W, 1.2, 0.16));
            F(C.darkSteel, bx(0.17, 0.17, 0.19, R, 0.39 * W, 1.25, 0.28));
            Z('lights', bx(0.11, 0.07, 0.025, R, 0.39 * W, 1.26, 0.39));
            F(C.steel, cy(0.11, 0.11, 0.07, 8, R, 0.39 * W, 1.34, 0.27));
            Z('lights', cy(0.07, 0.07, 0.025, 8, R, 0.39 * W, 1.39, 0.27));
        }
    } else if (slot === 'chair') {
        const hull = '#2a3550', pad = '#b8c4d0', orange = '#c85a38';
        const component = (name, mesh) => { mesh.metadata = { ...mesh.metadata, chairComponent: name }; return mesh; };
        // Wheels are true rig anchors. Their rims, hubs and spokes are children so they rotate
        // with the tire during movement, not stationary decorative discs over a hidden old wheel.
        const wheel = (s, z, y, diameter, width, large) => {
            const tire = F(C.rubber, cy(diameter, diameter, width, 12, R, s * (large ? 0.47 : 0.37), y, z, axle));
            tire.name = 'wheel';
            const outside = -s * (width / 2 + 0.012);
            F(hull, cy(diameter * 0.72, diameter * 0.72, 0.025, 12, tire, 0, outside, 0));
            F(C.steel, cy(diameter * 0.22, diameter * 0.22, 0.04, 8, tire, 0, outside - s * 0.025, 0));
            if (large && variant === 'spoked') {
                for (let i = 0; i < 5; i++) F(C.steel, bx(diameter * 0.055, 0.025, diameter * 0.62, tire, 0, outside - s * 0.018, 0, [0, i * Math.PI / 5, 0]));
            } else if (large) {
                for (let i = 0; i < 4; i++) Z('lights', bx(0.035, 0.025, diameter * 0.27, tire, 0, outside - s * 0.018, 0, [0, i * Math.PI / 4, 0]));
            }
            return tire;
        };
        if (variant === 'spoked') {
            // Open tubular power-chair with a narrow deck, high back and independently driven wheels.
            F(hull, bx(0.63, 0.14, 0.58, R, 0, seatY - 0.13, 0));
            component('seat', F(pad, bx(0.55, 0.085, 0.46, R, 0, seatY - 0.015, 0.01)));
            F(hull, bx(0.6, 0.62, 0.1, R, 0, seatY + 0.3, -0.29, [0.08, 0, 0]));
            component('backrest', F(pad, bx(0.52, 0.5, 0.14, R, 0, seatY + 0.31, -0.18, [0.08, 0, 0])));
            F(C.darkSteel, bx(0.38, 0.16, 0.16, R, 0, seatY - 0.25, -0.17));
            for (const s of [-1, 1]) {
                F(C.steel, cy(0.055, 0.055, 0.76, 8, R, s * 0.32, seatY - 0.17, 0.09, face));
                F(C.steel, cy(0.055, 0.055, 0.54, 8, R, s * 0.32, seatY + 0.05, -0.25));
                component(s < 0 ? 'armrestL' : 'armrestR', F(C.darkSteel, bx(0.12, 0.075, 0.6, R, s * 0.39, seatY + 0.16, 0.08)));
                F(C.steel, cy(0.045, 0.045, 0.32, 8, R, s * 0.39, seatY, -0.17));
                F(C.steel, bx(0.055, 0.15, 0.08, R, s * 0.37, 0.19, 0.48));
                wheel(s, -0.14, 0.35, 0.68, 0.14, true);
                wheel(s, 0.5, 0.12, 0.22, 0.1, false);
            }
            component('footrest', F(hull, bx(0.55, 0.075, 0.24, R, 0, 0.13, 0.5)));
            F(C.darkSteel, bx(0.16, 0.06, 0.18, R, 0.5, seatY + 0.22, 0.25));
            component('display', Z('lights', bx(0.085, 0.025, 0.09, R, 0.5, seatY + 0.26, 0.25)));
            F(C.darkSteel, bx(0.16, 0.06, 0.16, R, -0.5, seatY + 0.2, 0.24));
            F(C.steel, cy(0.035, 0.035, 0.12, 6, R, -0.5, seatY + 0.28, 0.24));
            component('joystick', F(C.rubber, sp(0.075, 6, R, -0.5, seatY + 0.34, 0.24)));
        } else {
            // An expedition power-chair built around a compact, faceted chassis, with guards
            // integrated into the new frame and separate, still freely rotating wheels.
            F(hull, cy(0.74, 0.94, 0.28, 8, R, 0, seatY - 0.22, -0.04));
            F(C.darkSteel, bx(0.61, 0.12, 0.55, R, 0, seatY - 0.045, 0));
            component('seat', F(pad, bx(0.53, 0.08, 0.45, R, 0, seatY + 0.02, 0.015)));
            F(hull, bx(0.64, 0.7, 0.15, R, 0, seatY + 0.34, -0.31, [0.08, 0, 0]));
            component('backrest', F(pad, bx(0.52, 0.51, 0.14, R, 0, seatY + 0.29, -0.18, [0.08, 0, 0])));
            F(C.darkSteel, bx(0.32, 0.16, 0.13, R, 0, seatY + 0.72, -0.3));
            F(hull, bx(0.46, 0.28, 0.21, R, 0, seatY - 0.18, -0.4));
            for (const s of [-1, 1]) {
                F(hull, bx(0.16, 0.28, 0.52, R, s * 0.39, seatY - 0.03, -0.12));
                F(orange, bx(0.18, 0.07, 0.42, R, s * 0.43, seatY + 0.13, -0.14));
                component(s < 0 ? 'armrestL' : 'armrestR', F(C.darkSteel, bx(0.13, 0.07, 0.58, R, s * 0.4, seatY + 0.16, 0.08)));
                F(C.steel, bx(0.06, 0.19, 0.1, R, s * 0.37, 0.21, 0.48));
                wheel(s, -0.14, 0.32, 0.61, 0.17, true);
                wheel(s, 0.5, 0.12, 0.22, 0.12, false);
            }
            component('footrest', F(hull, bx(0.57, 0.09, 0.28, R, 0, 0.14, 0.5)));
            F(orange, bx(0.44, 0.035, 0.12, R, 0, 0.2, 0.55));
            F(C.gun, bx(0.16, 0.08, 0.18, R, 0.5, seatY + 0.23, 0.25));
            component('display', Z('lights', bx(0.085, 0.025, 0.09, R, 0.5, seatY + 0.28, 0.25)));
            F(C.gun, bx(0.16, 0.06, 0.16, R, -0.5, seatY + 0.2, 0.24));
            F(C.steel, cy(0.035, 0.035, 0.12, 6, R, -0.5, seatY + 0.28, 0.24));
            component('joystick', F(C.rubber, sp(0.075, 6, R, -0.5, seatY + 0.34, 0.24)));
        }
    }
}
