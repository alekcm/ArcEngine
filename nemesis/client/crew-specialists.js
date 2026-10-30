// Full replacements for the Convict and Psychologist. Their role-defining masks, bare skin,
// glasses and companion drones remain recognisable; each slot owns its complete geometry.

export function convictVariant(slot, variant, { scene, root: R, Z, F, bx, cy, sp, fixed: C, updates }, W, side) {
    const B = window.BABYLON, front = [Math.PI / 2, 0, 0];
    if (slot === 'muzzle') {
        if (variant === 'vents') { // Enclosed respirator with a broad chin and an integral filter.
            Z('mask', bx(0.34, 0.2, 0.13, R, 0, 2.36, 0.19));
            Z('mask', bx(0.26, 0.12, 0.16, R, 0, 2.27, 0.19));
            for (const s of [-1, 1]) {
                Z('mask', bx(0.08, 0.19, 0.28, R, s * 0.16, 2.37, 0.02));
                F(C.steel, cy(0.08, 0.08, 0.04, 8, R, s * 0.19, 2.4, 0.07, [0, 0, Math.PI / 2]));
            }
            F(C.darkSteel, cy(0.17, 0.17, 0.12, 10, R, 0, 2.35, 0.29, front));
            Z('mask', cy(0.12, 0.12, 0.025, 10, R, 0, 2.35, 0.36, front));
            F(C.steel, bx(0.07, 0.025, 0.02, R, 0, 2.35, 0.38));
        } else { // Deep cage: continuous backing, separate heavy horizontal and vertical bars.
            F(C.rubber, bx(0.3, 0.19, 0.11, R, 0, 2.35, 0.19));
            Z('mask', bx(0.36, 0.07, 0.13, R, 0, 2.44, 0.21));
            Z('mask', bx(0.36, 0.07, 0.14, R, 0, 2.26, 0.21));
            for (const s of [-1, 1]) {
                Z('mask', bx(0.07, 0.23, 0.27, R, s * 0.17, 2.35, 0.04));
                F(C.steel, bx(0.035, 0.2, 0.035, R, s * 0.12, 2.35, 0.29));
                F(C.steel, bx(0.04, 0.04, 0.035, R, s * 0.18, 2.39, 0.19));
            }
            F(C.steel, bx(0.035, 0.2, 0.035, R, 0, 2.35, 0.29));
            F(C.steel, bx(0.31, 0.035, 0.035, R, 0, 2.34, 0.3));
            F(C.strap, bx(0.35, 0.055, 0.32, R, 0, 2.42, -0.02));
        }
    } else if (slot === 'plates') {
        if (variant === 'shoulder') {
            // Paired articulated shoulder implants and a small central chest mount leave skin bare.
            for (const s of [-1, 1]) {
                Z('mask', bx(0.31 * W, 0.18, 0.4, R, s * 0.37 * W, 2.14, 0));
                Z('mask', bx(0.09, 0.25, 0.22, R, s * 0.46 * W, 1.96, 0.02));
                F(C.steel, bx(0.06, 0.08, 0.04, R, s * 0.41 * W, 2.14, 0.18));
                Z('mask', bx(0.2, 0.13, 0.07, R, s * 0.16 * W, 1.99, 0.18, [0, 0, -s * 0.2]));
                Z('lights', bx(0.04, 0.04, 0.025, R, s * 0.15 * W, 1.99, 0.23));
            }
            Z('mask', bx(0.21, 0.12, 0.08, R, 0, 1.76, 0.18));
        } else {
            // One prominent shoulder feeds a diagonal cybernetic chest harness; the other stays bare.
            Z('mask', bx(0.37 * W, 0.19, 0.4, R, -0.37 * W, 2.14, 0));
            Z('mask', bx(0.1, 0.3, 0.23, R, -0.46 * W, 1.96, 0.02));
            Z('mask', bx(0.15, 0.58, 0.09, R, -0.09 * W, 1.91, 0.19, [0, 0, -0.42]));
            Z('mask', bx(0.23, 0.17, 0.08, R, 0.1 * W, 1.72, 0.18));
            F(C.steel, bx(0.12, 0.055, 0.035, R, -0.24 * W, 2.06, 0.23));
            Z('lights', bx(0.055, 0.07, 0.025, R, 0.1 * W, 1.73, 0.235));
            Z('mask', bx(0.2, 0.25, 0.07, R, -0.2 * W, 1.9, -0.18));
        }
    } else if (slot === 'boot') {
        const s = side;
        if (variant === 'cargo') {
            Z('pants', bx(0.25 * W, 0.16, 0.4, R, s * 0.15 * W, 0.08, 0.05));
            Z('pants', bx(0.24 * W, 0.32, 0.26, R, s * 0.15 * W, 0.3, 0));
            Z('chains', bx(0.25 * W, 0.07, 0.28, R, s * 0.15 * W, 0.39, 0));
        } else {
            Z('pants', bx(0.26 * W, 0.16, 0.42, R, s * 0.15 * W, 0.08, 0.06));
            Z('mask', bx(0.24 * W, 0.33, 0.27, R, s * 0.15 * W, 0.3, 0));
            Z('chains', bx(0.25 * W, 0.08, 0.3, R, s * 0.15 * W, 0.4, 0));
        }
    } else if (slot === 'leg') {
        const s = side;
        if (variant === 'cargo') {
            Z('pants', bx(0.25 * W, 0.52, 0.27, R, s * 0.15 * W, 0.67, 0));
            Z('pants', bx(0.26 * W, 0.48, 0.29, R, s * 0.15 * W, 1.13, 0));
            Z('mask', bx(0.18, 0.2, 0.08, R, s * 0.17 * W, 1.06, 0.17));
            F(C.steel, bx(0.13, 0.03, 0.025, R, s * 0.17 * W, 1.12, 0.225));
        } else {
            Z('pants', bx(0.25 * W, 0.52, 0.27, R, s * 0.15 * W, 0.67, 0));
            Z('pants', bx(0.26 * W, 0.48, 0.28, R, s * 0.15 * W, 1.13, 0));
            Z('mask', bx(0.22, 0.38, 0.11, R, s * 0.15 * W, 0.68, 0.16));
            for (const y of [0.54, 0.8]) Z('chains', bx(0.23, 0.055, 0.3, R, s * 0.15 * W, y, 0));
        }
    } else if (slot === 'pelvis') {
        Z('pants', bx((variant === 'cargo' ? 0.56 : 0.55) * W, 0.22, 0.31, R, 0, 1.4, 0));
        Z('chains', bx(0.5 * W, 0.07, 0.035, R, 0, 1.39, 0.175));
    } else if (slot === 'tattoos') {
        // Thin ink strokes sit just beyond the skin surface, and follow the animated arm.
        // The two complete designs replace the original stripes; they never add prostheses.
        const ink = (w, h, x, y, z, tilt = 0) => {
            const m = Z('tattoo', bx(w, h, 0.02, R, x, y, z, [0, 0, tilt]));
            m.metadata = { convictInk: true }; return m;
        };
        if (variant === 'tribal') {
            for (const s of [-1, 1]) {
                for (let i = 0; i < 3; i++) {
                    ink(0.15, 0.026, s * (0.12 + i * 0.035) * W, 2.03 - i * 0.08, 0.177, -s * 0.42);
                    ink(0.12, 0.025, s * 0.38 * W, 1.94 - i * 0.10, 0.107, s * 0.38);
                }
                ink(0.035, 0.27, s * 0.39 * W, 1.44, 0.117, -s * 0.16);
                ink(0.1, 0.025, s * 0.39 * W, 1.48, 0.117, s * 0.25);
            }
            ink(0.035, 0.25, 0, 1.86, 0.178);
            ink(0.17, 0.025, 0, 1.75, 0.178);
        } else {
            // A large prisoner identification and tally marks, not the same diagonal motif.
            ink(0.23, 0.024, -0.13 * W, 2.03, 0.178);
            ink(0.23, 0.024, -0.13 * W, 1.84, 0.178);
            for (const x of [-0.22, -0.18, -0.14, -0.1, -0.06]) ink(0.016, 0.13, x * W, 1.94, 0.179);
            for (const s of [-1, 1]) {
                for (let i = 0; i < 4; i++) ink(0.024, 0.13, s * (0.36 + i * 0.022) * W, 1.85, 0.107, 0.13);
                ink(0.14, 0.026, s * 0.39 * W, 1.43, 0.117, s * 0.08);
                ink(0.14, 0.026, s * 0.39 * W, 1.51, 0.117, -s * 0.08);
            }
            ink(0.09, 0.09, 0.16 * W, 1.9, 0.178, Math.PI / 4);
        }
    } else if (slot === 'chains') {
        // The links are refitted between the two moving cuffs, including when the board root turns.
        const cuffs = [];
        const width = variant === 'classic' ? 0.18 : variant === 'heavy' ? 0.25 : 0.22;
        for (const s of [-1, 1]) {
            const cuff = Z('chains', bx(width, variant === 'classic' ? 0.08 : 0.16, 0.2, R, s * 0.39 * W, 1.12, 0.03));
            cuff.metadata = { convictCuff: s < 0 ? 'L' : 'R' }; cuffs.push(cuff);
            if (variant !== 'classic') {
                Z('mask', bx(width * 0.8, 0.07, 0.06, cuff, 0, 0.015, 0.12));
                F(C.steel, bx(0.055, 0.055, 0.035, cuff, 0, 0.015, 0.16));
                if (variant === 'heavy') Z('lights', bx(0.06, 0.04, 0.025, cuff, 0, -0.03, 0.16));
                else Z('chains', bx(width * 0.9, 0.07, 0.22, cuff, 0, 0.1, 0));
            }
        }
        const chain = new B.TransformNode('convict_chain', scene); chain.parent = R;
        const count = variant === 'heavy' ? 7 : variant === 'links' ? 9 : 8;
        const links = [];
        for (let i = 0; i < count; i++) {
            const diameter = variant === 'classic' ? 0.045 : variant === 'heavy' ? 0.09 : 0.07;
            const link = Z('chains', cy(diameter, diameter, 1, variant === 'classic' ? 6 : 8, chain, 0, 0, 0));
            link.metadata = { convictChainSegment: i }; links.push(link);
            if (variant === 'links') F(C.steel, bx(0.11, 0.04, 0.07, link, 0, 0, 0));
        }
        updates.push(() => {
            R.computeWorldMatrix(true); for (const c of cuffs) c.computeWorldMatrix(true);
            const inv = R.getWorldMatrix().clone().invert();
            const local = (cuff, x) => B.Vector3.TransformCoordinates(B.Vector3.TransformCoordinates(new B.Vector3(x, 0, 0.1), cuff.getWorldMatrix()), inv);
            const a = local(cuffs[0], width * 0.45), b = local(cuffs[1], -width * 0.45);
            const sag = variant === 'links' ? 0.24 : 0.13;
            // Bow forward around the legs, so the connecting chain is not hidden inside trousers.
            const point = t => B.Vector3.Lerp(a, b, t).add(new B.Vector3(0, -Math.sin(Math.PI * t) * sag, Math.sin(Math.PI * t) * 0.18));
            for (let i = 0; i < links.length; i++) {
                const p = point(i / count), q = point((i + 1) / count), d = q.subtract(p), len = d.length();
                const m = links[i]; m.position.copyFrom(p.add(q).scale(0.5)); m.scaling.y = len + 0.008;
                m.rotationQuaternion = B.Quaternion.FromUnitVectorsToRef(new B.Vector3(0, 1, 0), d.scale(1 / len), new B.Quaternion());
            }
        });
    }
}

export function psychVariant(slot, variant, { scene, root: R, Z, F, bx, cy, sp, fixed: C }, W, side, drone) {
    const B = window.BABYLON, front = [Math.PI / 2, 0, 0];
    if (slot === 'hair') {
        Z('hair', bx(0.35, 0.12, 0.35, R, 0, 2.64, 0));
        if (variant === 'layered') { // Asymmetrical fringe and overlapping shoulder-length locks.
            Z('hair', bx(0.33, 0.1, 0.08, R, -0.015, 2.56, 0.16, [0, 0, -0.12]));
            Z('hair', bx(0.32, 0.47, 0.1, R, 0, 2.34, -0.16));
            for (const [s, h] of [[-1, 0.52], [1, 0.36]]) {
                Z('hair', bx(0.075, h, 0.27, R, s * 0.19, 2.4 - (h - 0.36) / 2, -0.02, [0, 0, s * 0.1]));
                Z('hair', bx(0.055, h * 0.7, 0.08, R, s * 0.16, 2.4, 0.14, [0, 0, s * 0.12]));
            }
        } else { // Long straight hair with a parted fringe, reaching below the collar.
            Z('hair', bx(0.34, 0.66, 0.1, R, 0, 2.27, -0.16));
            for (const s of [-1, 1]) {
                Z('hair', bx(0.08, 0.62, 0.28, R, s * 0.19, 2.25, -0.03));
                Z('hair', bx(0.14, 0.12, 0.08, R, s * 0.08, 2.56, 0.16, [0, 0, -s * 0.2]));
            }
        }
    } else if (slot === 'headset') {
        if (variant === 'dual') {
            // Complete over-ear headset with a slim bow behind the hair and two glowing modules.
            Z('drone', bx(0.42, 0.06, 0.08, R, 0, 2.69, -0.05));
            for (const s of [-1, 1]) {
                Z('drone', bx(0.08, 0.22, 0.19, R, s * 0.23, 2.48, 0.0));
                F(C.darkSteel, cy(0.13, 0.13, 0.045, 8, R, s * 0.28, 2.49, 0, [0, 0, Math.PI / 2]));
                Z('lights', bx(0.025, 0.07, 0.07, R, s * 0.305, 2.5, 0.01));
                Z('drone', bx(0.045, 0.17, 0.06, R, s * 0.21, 2.61, -0.05));
            }
        } else {
            Z('drone', bx(0.09, 0.23, 0.18, R, 0.23, 2.48, -0.01));
            F(C.darkSteel, bx(0.06, 0.2, 0.07, R, 0.2, 2.6, -0.06));
            Z('drone', bx(0.045, 0.045, 0.25, R, 0.25, 2.53, 0.13));
            F(C.darkSteel, cy(0.14, 0.14, 0.08, 8, R, 0.25, 2.53, 0.28, front));
            Z('lights', cy(0.09, 0.09, 0.025, 8, R, 0.25, 2.53, 0.33, front));
        }
    } else if (slot === 'drone') {
        if (variant === 'rotors') { // Wide, flat flying chassis with two attached rotors.
            Z('drone', bx(0.36, 0.14, 0.22, drone, 0, 0, 0));
            F(C.darkSteel, bx(0.25, 0.07, 0.15, drone, 0, -0.1, 0));
            Z('lights', cy(0.13, 0.13, 0.045, 8, drone, 0, 0, 0.13, front));
            for (const s of [-1, 1]) {
                Z('drone', bx(0.18, 0.06, 0.09, drone, s * 0.24, 0.04, 0));
                F(C.darkSteel, cy(0.19, 0.19, 0.035, 10, drone, s * 0.33, 0.09, 0));
                F(C.steel, bx(0.13, 0.025, 0.035, drone, s * 0.33, 0.12, 0));
            }
        } else { // Tall analytical pod with a central lens and a pair of sensor booms.
            Z('drone', cy(0.22, 0.3, 0.3, 8, drone, 0, 0, 0));
            F(C.darkSteel, bx(0.2, 0.16, 0.09, drone, 0, 0, 0.15));
            Z('lights', cy(0.13, 0.13, 0.04, 8, drone, 0, 0, 0.21, front));
            for (const s of [-1, 1]) {
                Z('drone', bx(0.13, 0.07, 0.12, drone, s * 0.17, -0.06, 0));
                F(C.steel, bx(0.035, 0.2, 0.035, drone, s * 0.1, 0.2, -0.01, [0, 0, -s * 0.2]));
                Z('lights', sp(0.06, 6, drone, s * 0.12, 0.3, -0.01));
            }
        }
    } else if (slot === 'vest') {
        if (variant === 'clinical') { // Long open tunic, continuous back and separate front panels.
            const tails = new B.TransformNode('psych_tunic_tails', scene); tails.parent = R;
            Z('coat', bx(0.57 * W, 0.7, 0.12, R, 0, 1.84, -0.18));
            Z('coat', bx(0.57 * W, 0.53, 0.12, tails, 0, 1.24, -0.18));
            for (const s of [-1, 1]) {
                Z('coat', bx(0.17 * W, 0.61, 0.1, R, s * 0.2 * W, 1.85, 0.19));
                Z('coat', bx(0.1, 0.63, 0.32, R, s * 0.25 * W, 1.85, 0));
                Z('coat', bx(0.15 * W, 0.5, 0.28, tails, s * 0.22 * W, 1.24, -0.03));
                Z('coat', bx(0.12, 0.25, 0.065, R, s * 0.13 * W, 2.06, 0.23, [0, 0, -s * 0.25]));
                F(C.darkSteel, bx(0.12, 0.12, 0.04, R, s * 0.2 * W, 1.69, 0.26));
            }
            Z('coat', bx(0.4 * W, 0.11, 0.15, R, 0, 2.18, -0.14));
        } else { // Compact monitoring harness, shaped front and back around the dark shirt.
            Z('coat', bx(0.52 * W, 0.56, 0.1, R, 0, 1.84, -0.19));
            for (const s of [-1, 1]) {
                Z('coat', bx(0.2 * W, 0.48, 0.12, R, s * 0.15 * W, 1.9, 0.2));
                Z('coat', bx(0.12, 0.48, 0.32, R, s * 0.25 * W, 1.86, 0));
                F(C.darkSteel, bx(0.055, 0.48, 0.045, R, s * 0.17 * W, 1.89, 0.27));
                Z('drone', bx(0.14, 0.14, 0.08, R, s * 0.18 * W, 1.69, 0.25));
            }
            Z('drone', bx(0.18, 0.16, 0.09, R, 0, 1.94, 0.26));
            Z('lights', bx(0.12, 0.05, 0.025, R, 0, 1.96, 0.32));
            Z('coat', bx(0.53 * W, 0.1, 0.34, R, 0, 1.58, 0));
        }
    } else if (slot === 'sleeve') {
        const s = side, label = s < 0 ? 'L' : 'R';
        if (variant === 'rolled') {
            Z('shirt', bx(0.18 * W, 0.43, 0.2, R, s * 0.38 * W, 1.85, 0)).metadata = { psychArm: 'upper' + label };
            Z('coat', bx(0.2 * W, 0.09, 0.22, R, s * 0.38 * W, 1.67, 0));
            Z('skin', bx(0.15 * W, 0.4, 0.17, R, s * 0.39 * W, 1.44, 0.02)).metadata = { psychArm: 'forearm' + label };
            Z('skin', bx(0.14, 0.14, 0.14, R, s * 0.39 * W, 1.2, 0.03)).metadata = { psychArm: 'hand' + label };
        } else {
            Z('shirt', bx(0.2 * W, 0.42, 0.22, R, s * 0.38 * W, 1.84, 0)).metadata = { psychArm: 'upper' + label };
            Z('coat', bx(0.19 * W, 0.4, 0.2, R, s * 0.39 * W, 1.44, 0.02)).metadata = { psychArm: 'forearm' + label };
            Z('skin', bx(0.14, 0.14, 0.14, R, s * 0.39 * W, 1.2, 0.03)).metadata = { psychArm: 'hand' + label };
            Z('drone', bx(0.17, 0.1, 0.07, R, s * 0.39 * W, 1.5, 0.14));
            Z('lights', bx(0.1, 0.035, 0.025, R, s * 0.39 * W, 1.51, 0.19));
        }
    }
}

// Drones gently hover around their original positions; no detached or static add-on geometry.
export function floatPsychDrones(drones, updates) {
    const origins = drones.map(d => d.position.y);
    updates.push(t => { drones.forEach((d, i) => { d.position.y = origins[i] + Math.sin(t * 2.4) * (i === 0 ? 0.035 : -0.035); }); });
}
