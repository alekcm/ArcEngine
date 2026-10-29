// Complete workshop replacements for the Bounty Hunter and Captain. Slots own their geometry;
// colours still come from the character's usual palette rather than a second material system.

export function commandHair(variant, { root: R, Z, bx }, captain) {
    Z('hair', bx(0.33, 0.1, 0.33, R, 0, 2.64, 0));
    if (variant === 'swept') {
        Z('hair', bx(0.32, 0.16, 0.1, R, 0, 2.52, -0.15));
        Z('hair', bx(0.3, 0.12, 0.14, R, -0.025, 2.67, 0.1, [0, 0, -0.16]));
        Z('hair', bx(0.09, 0.18, 0.12, R, -0.14, 2.58, 0.12, [0, 0, -0.2]));
    } else {
        Z('hair', bx(0.32, 0.15, 0.1, R, 0, 2.52, -0.15));
        for (const [x, y, z, h, tilt] of [[-0.13, 2.72, -0.07, 0.2, -0.2], [-0.045, 2.74, 0.07, 0.24, -0.1], [0.06, 2.73, -0.04, 0.21, 0.12], [0.14, 2.7, 0.09, 0.16, 0.2]])
            Z('hair', bx(0.1, h, 0.12, R, x, y, z, [0, 0, tilt]));
    }
    // The Hunter retains his full separate beard; the Captain retains his shorter beard.
    if (captain) Z('hair', bx(variant === 'swept' ? 0.29 : 0.27, 0.13, 0.09, R, 0, 2.3, 0.15));
}

export function commandOutfit(slot, variant, { scene, root: R, Z, F, bx, fixed: C }, W, side, captain) {
    const s = side, bootZone = captain ? 'gloves' : 'armor';
    if (slot === 'boot') {
        Z(bootZone, bx(0.24 * W, 0.16, 0.4, R, s * 0.15 * W, 0.08, 0.05)).metadata = { commandSole: s < 0 ? 'L' : 'R' };
        Z(bootZone, bx(0.23 * W, 0.32, 0.26, R, s * 0.15 * W, 0.3, 0)).metadata = { commandBoot: s < 0 ? 'L' : 'R' };
        if (variant === 'armored' || variant === 'field') Z('armor', bx(0.2 * W, 0.17, 0.07, R, s * 0.15 * W, 0.3, 0.15));
    } else if (slot === 'leg') {
        Z('shirt', bx(0.24 * W, 0.51, 0.25, R, s * 0.15 * W, 0.67, 0)).metadata = { commandShin: s < 0 ? 'L' : 'R' };
        Z('shirt', bx(0.25 * W, 0.48, 0.27, R, s * 0.15 * W, 1.13, 0));
        if (variant === 'armored' || variant === 'field') {
            Z('armor', bx(0.2 * W, 0.26, 0.09, R, s * 0.15 * W, 0.72, 0.16));
            F(C.darkSteel, bx(0.22 * W, 0.04, 0.28, R, s * 0.15 * W, 0.62, 0));
        } else {
            F(C.strap, bx(0.18 * W, 0.18, 0.08, R, s * 0.15 * W, 1.06, 0.16));
            Z('shirt', bx(0.15 * W, 0.08, 0.035, R, s * 0.15 * W, 1.11, 0.22));
        }
    } else if (slot === 'pelvis') {
        Z('shirt', bx(0.54 * W, 0.22, 0.3, R, 0, 1.4, 0));
        if (captain && variant === 'long') {
            // The connected back and closed front hem are fixed to the waist, not to one leg.
            const hem = new window.BABYLON.TransformNode('captain_jacket_hem', scene); hem.parent = R;
            Z('shirt', bx(0.6 * W, 0.54, 0.09, hem, 0, 1.28, -0.19));
            Z('shirt', bx(0.6 * W, 0.54, 0.09, hem, 0, 1.28, 0.19));
            for (const x of [-0.28 * W, 0.28 * W]) Z('shirt', bx(0.08, 0.54, 0.32, hem, x, 1.28, 0));
            F(C.strap, bx(0.56 * W, 0.06, 0.04, hem, 0, 1.43, 0.25));
        } else if (!captain && variant === 'scout') {
            const hem = new window.BABYLON.TransformNode('bounty_jacket_hem', scene); hem.parent = R;
            Z('shirt', bx(0.58 * W, 0.3, 0.09, hem, 0, 1.42, -0.18));
            for (const x of [-0.25 * W, 0.25 * W]) Z('shirt', bx(0.12, 0.3, 0.3, hem, x, 1.42, 0));
        }
    } else if (slot === 'torso') {
        const m = Z('shirt', bx((captain ? 0.6 : 0.61) * W, 0.64, 0.32, R, 0, 1.86, 0));
        m.metadata = { commandTorso: true };
        if (variant === 'long' || variant === 'scout') {
            Z('shirt', bx(0.58 * W, 0.64, 0.08, R, 0, 1.86, -0.19));
            for (const x of [-0.24 * W, 0.24 * W]) Z('shirt', bx(0.1, 0.58, 0.33, R, x, 1.85, 0));
        }
    } else if (slot === 'sleeve') {
        const label = s < 0 ? 'L' : 'R', tag = n => ({ commandArm: n + label });
        const isArmored = variant === 'armored' || variant === 'field';
        const upper = Z('shirt', bx((isArmored ? 0.22 : 0.19) * W, 0.42, 0.21, R, s * 0.38 * W, 1.84, 0)); upper.metadata = tag('upper');
        const bent = !captain;
        const forearm = Z(isArmored ? 'armor' : 'shirt', bx(0.18 * W, 0.42, 0.2, R, s * 0.39 * W, bent ? 1.49 : 1.44, bent ? 0.16 : 0.02, [bent ? -0.6 : 0, 0, 0])); forearm.metadata = tag('forearm');
        const hand = Z(bootZone, bx(0.16, 0.16, 0.16, R, s * 0.39 * W, bent ? 1.28 : 1.2, bent ? 0.3 : 0.03)); hand.metadata = tag('hand');
        if (isArmored) Z('armor', bx(0.21 * W, 0.08, 0.23, R, s * 0.39 * W, bent ? 1.52 : 1.47, bent ? 0.18 : 0.02, [bent ? -0.6 : 0, 0, 0]));
    }
}

export function bountyArmor(slot, variant, { root: R, Z, F, bx, fixed: C }, W, side) {
    if (slot === 'shoulder') {
        const s = side;
        if (variant === 'layered') {
            Z('armor', bx(0.29 * W, 0.13, 0.31, R, s * 0.38 * W, 2.12, 0));
            for (const [dx, y] of [[-0.05, 2.2], [0.07, 2.16]]) Z('armor', bx(0.17 * W, 0.09, 0.36, R, (s * 0.38 + dx) * W, y, 0));
        } else {
            Z('armor', bx(0.38 * W, 0.22, 0.4, R, s * 0.42 * W, 2.13, 0));
            Z('armor', bx(0.1, 0.28, 0.36, R, s * 0.57 * W, 2.02, 0));
            F(C.steel, bx(0.18, 0.045, 0.04, R, s * 0.42 * W, 2.18, 0.22));
        }
    } else {
        if (variant === 'layered') {
            for (const [y, w] of [[2.05, 0.5], [1.9, 0.54], [1.75, 0.48]]) Z('armor', bx(w * W, 0.15, 0.1, R, 0, y, 0.2));
            Z('armor', bx(0.5 * W, 0.52, 0.1, R, 0, 1.86, -0.2));
            for (const x of [-0.2 * W, 0.2 * W]) F(C.strap, bx(0.07, 0.58, 0.04, R, x, 1.85, 0.26));
        } else {
            Z('armor', bx(0.61 * W, 0.58, 0.16, R, 0, 1.85, 0.23));
            Z('armor', bx(0.61 * W, 0.58, 0.14, R, 0, 1.85, -0.21));
            for (const x of [-0.19 * W, 0.19 * W]) Z('armor', bx(0.2 * W, 0.38, 0.08, R, x, 1.91, 0.34));
            F(C.darkSteel, bx(0.28, 0.11, 0.05, R, 0, 1.65, 0.34));
        }
        Z('lights', bx(0.05, 0.06, 0.025, R, 0.15 * W, 2.02, variant === 'heavy' ? 0.39 : 0.27));
    }
}

export function captainArmor(slot, variant, { root: R, Z, F, bx, fixed: C }, W, side) {
    if (slot === 'shoulder') {
        const s = side;
        if (variant === 'layered') {
            Z('armor', bx(0.31 * W, 0.17, 0.38, R, s * 0.4 * W, 2.15, 0));
            Z('armor', bx(0.33 * W, 0.08, 0.38, R, s * 0.42 * W, 2.25, 0));
            F(C.darkSteel, bx(0.25 * W, 0.2, 0.28, R, s * 0.42 * W, 1.98, 0.02));
        } else {
            Z('armor', bx(0.4 * W, 0.24, 0.45, R, s * 0.42 * W, 2.16, 0));
            Z('armor', bx(0.1, 0.29, 0.36, R, s * 0.59 * W, 2.04, 0));
            F(C.darkSteel, bx(0.28 * W, 0.26, 0.32, R, s * 0.42 * W, 1.94, 0.02));
        }
    } else if (variant === 'ribbed') {
        Z('armor', bx(0.56 * W, 0.55, 0.14, R, 0, 1.85, -0.2));
        for (const [y, w] of [[2.05, 0.53], [1.88, 0.57], [1.71, 0.5]]) {
            Z('armor', bx(w * W, 0.17, 0.16, R, 0, y, 0.23));
            F(C.darkSteel, bx(w * W * 0.8, 0.025, 0.025, R, 0, y - 0.07, 0.32));
        }
        Z('armor', bx(0.36 * W, 0.12, 0.12, R, 0, 1.57, 0.21));
    } else {
        Z('armor', bx(0.6 * W, 0.58, 0.15, R, 0, 1.86, -0.2));
        Z('armor', bx(0.57 * W, 0.55, 0.16, R, 0, 1.86, 0.22));
        for (const x of [-0.19 * W, 0.19 * W]) F(C.strap, bx(0.07, 0.53, 0.035, R, x, 1.86, 0.31));
        F(C.darkSteel, bx(0.24, 0.25, 0.08, R, 0.1, 1.98, 0.34));
        Z('lights', bx(0.16, 0.07, 0.025, R, 0.1, 2.03, 0.4));
        F(C.steel, bx(0.025, 0.25, 0.025, R, 0.19, 2.19, 0.36, [0, 0, -0.12]));
    }
}

export function commandGun(slot, variant, { Z, F, bx, cy, fixed: C }, g) {
    if (slot === 'rifle') {
        if (variant === 'marksman') {
            F(C.gun, bx(1.35, 0.12, 0.13, g, 0.05, 0, 0));
            F(C.gunLight, bx(0.48, 0.2, 0.17, g, -0.14, 0.02, 0));
            F(C.gun, bx(0.3, 0.22, 0.13, g, -0.58, -0.08, 0));
            F(C.gun, cy(0.05, 0.05, 0.62, 8, g, 0.8, 0.02, 0, [0, 0, Math.PI / 2]));
            F(C.darkSteel, bx(0.4, 0.08, 0.08, g, -0.02, 0.16, 0));
            Z('lights', bx(0.08, 0.05, 0.04, g, 0.16, 0.17, 0.01));
        } else {
            F(C.gun, bx(0.94, 0.15, 0.15, g, 0, 0, 0));
            F(C.gunLight, bx(0.46, 0.25, 0.2, g, -0.12, 0.03, 0));
            F(C.gun, bx(0.25, 0.24, 0.13, g, -0.43, -0.09, 0));
            F(C.gun, bx(0.19, 0.23, 0.12, g, 0, -0.16, 0));
            F(C.darkSteel, bx(0.25, 0.08, 0.07, g, 0.05, 0.16, 0));
            Z('lights', bx(0.08, 0.05, 0.04, g, 0.15, 0.16, 0.01));
        }
    } else {
        const heavy = variant === 'heavy';
        F(C.gun, bx(heavy ? 0.11 : 0.075, heavy ? 0.16 : 0.12, heavy ? 0.38 : 0.25, g, 0, 0.04, heavy ? 0.16 : 0.1));
        F(C.gunLight, bx(0.1, 0.15, 0.12, g, 0, -0.02, 0));
        F(C.steel, cy(heavy ? 0.15 : 0.11, heavy ? 0.15 : 0.11, 0.1, 8, g, 0, 0.06, 0.11, [0, 0, Math.PI / 2]));
        F(C.gun, cy(0.045, 0.045, heavy ? 0.32 : 0.18, 8, g, 0, 0.06, heavy ? 0.32 : 0.22, [Math.PI / 2, 0, 0]));
        Z('lights', bx(0.035, 0.035, 0.035, g, 0, 0.13, 0.1));
    }
}

// A complete Laika with independent, diagonally paired legs and distinct field equipment.
export function bountyDog(variant, { scene, Z, F, bx, fixed: C, updates }, d) {
    const B = window.BABYLON, broad = variant === 'guard', trail = variant === 'packs';
    // Each is a complete Laika, not the same mesh with accessories glued over it: the trail
    // companion is longer and leaner; the guard has a wider chest, head and protective profile.
    const body = Z('dog', bx(broad ? 0.42 : trail ? 0.3 : 0.34, 0.36, broad ? 0.76 : trail ? 0.9 : 0.8, d, 0, 0.58, 0)); body.metadata = { dogBody: true };
    Z('dog', bx(broad ? 0.42 : trail ? 0.34 : 0.38, 0.3, 0.36, d, 0, 0.66, 0.3));
    F('#e9ecef', bx(trail ? 0.23 : 0.26, 0.2, 0.5, d, 0, 0.42, 0.1));
    Z('dog', bx(0.23, 0.22, 0.24, d, 0, 0.84, 0.37)).metadata = { dogNeck: true };
    Z('dog', bx(broad ? 0.32 : trail ? 0.26 : 0.28, broad ? 0.28 : 0.26, trail ? 0.34 : 0.3, d, 0, 0.96, 0.46)).metadata = { dogHead: true };
    F('#e9ecef', bx(trail ? 0.18 : 0.2, 0.16, 0.26, d, 0, 0.86, 0.6));
    F(C.rubber, bx(0.07, 0.05, 0.05, d, 0, 0.9, 0.74));
    for (const s of [-1, 1]) {
        Z('dog', bx(broad ? 0.1 : 0.08, trail ? 0.24 : 0.2, 0.06, d, s * 0.1, trail ? 1.16 : 1.14, 0.42, [-0.15, 0, s * 0.2]));
        F('#3bb8ff', bx(0.04, 0.03, 0.02, d, s * 0.07, 0.98, 0.615));
    }
    const legs = [];
    for (const [index, [x, z]] of [[-0.11, 0.3], [0.11, 0.3], [-0.11, -0.28], [0.11, -0.28]].entries()) {
        const pivot = new B.TransformNode('dog_leg' + index, scene); pivot.parent = d; pivot.position.set(x, 0.42, z); legs.push(pivot);
        Z('dog', bx(0.1, 0.44, 0.1, pivot, 0, -0.21, 0)).metadata = { dogLeg: index };
        F('#e9ecef', bx(0.11, 0.1, 0.12, pivot, 0, -0.37, 0.02)).metadata = { dogFoot: index };
    }
    Z('dog', bx(trail ? 0.15 : broad ? 0.12 : 0.1, trail ? 0.14 : 0.1, trail ? 0.36 : 0.3, d, 0, 0.78, -0.5, [-1.1, 0, 0]));
    Z('dog', bx(trail ? 0.16 : broad ? 0.12 : 0.1, trail ? 0.28 : 0.22, trail ? 0.14 : 0.1, d, 0, 0.98, -0.52, [0.4, 0, 0]));
    if (variant === 'classic') {
        F(C.strap, bx(0.4, 0.26, 0.3, d, 0, 0.66, 0.02));
        Z('lights', bx(0.05, 0.05, 0.02, d, 0.1, 0.72, 0.18));
        F(C.darkSteel, bx(0.3, 0.06, 0.08, d, 0, 0.82, 0.3));
    } else if (variant === 'packs') {
        F(C.strap, bx(0.38, 0.24, 0.5, d, 0, 0.67, 0.02));
        for (const s of [-1, 1]) {
            Z('armor', bx(0.18, 0.26, 0.38, d, s * 0.25, 0.63, -0.03));
            Z('shirt', bx(0.19, 0.07, 0.4, d, s * 0.25, 0.78, -0.03));
            F(C.steel, bx(0.03, 0.09, 0.1, d, s * 0.35, 0.65, 0));
        }
        Z('lights', bx(0.08, 0.035, 0.08, d, 0, 0.82, 0.14));
    } else {
        Z('armor', bx(0.43, 0.14, 0.64, d, 0, 0.81, -0.01));
        for (const s of [-1, 1]) {
            Z('armor', bx(0.08, 0.24, 0.54, d, s * 0.21, 0.69, -0.01));
            F(C.darkSteel, bx(0.055, 0.12, 0.22, d, s * 0.15, 0.94, 0.36));
        }
        Z('armor', bx(0.31, 0.08, 0.26, d, 0, 1.08, 0.43));
        Z('lights', bx(0.08, 0.035, 0.04, d, 0, 1.12, 0.56));
    }
    updates.push((t, moving) => {
        const a = moving ? Math.sin(t * 11) * 0.28 : 0;
        legs.forEach((leg, i) => { leg.rotation.x = (i === 0 || i === 3 ? a : -a); });
    });
}
