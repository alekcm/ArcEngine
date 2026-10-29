// Role-specific additions to the existing miniatures. All coordinates are in the builder's local
// space, and the original meshes remain untouched for the classic option. Attaching details to the
// existing shoulder, arm, wheel or companion makes them move with it instead of floating in a run.
export function addCrewDetails(charId, parts, { scene, root: R, zones, Z, F, bx, cy, sp, fixed: C }) {
    const name = slot => `crew_${charId}_${slot}`;
    const paint = (slot, zone, mesh) => { mesh.name = name(slot); return Z(zone, mesh); };
    const fixed = (slot, hex, mesh, opts) => { mesh.name = name(slot); return F(hex, mesh, opts); };
    const group = slot => { const n = new (window.BABYLON.TransformNode)(name(slot) + '_group', scene); n.parent = R; return n; };
    const child = childName => R.getChildren().find(n => n.name === childName);
    // Find an original mesh before auto-rig, then parent the new geometry to it. Its material remains
    // independently paintable, and the rig carries both when it moves the original limb or wheel.
    const at = (zone, x, y) => (zones[zone] || []).find(m => m.parent === R && Math.abs(m.position.x - x) < 0.015 && Math.abs(m.position.y - y) < 0.015);
    const front = [Math.PI / 2, 0, 0];

    if (charId === 'bounty') {
        if (parts.armor !== 'classic') for (const s of [-1, 1]) {
            const base = at('armor', s * 0.4484, 2.12);
            if (parts.armor === 'layered') {
                for (const x of [-0.07, 0.07]) paint('armor', 'armor', bx(0.13, 0.1, 0.3, base, x, 0.15, 0));
                fixed('armor', C.steel, bx(0.18, 0.035, 0.04, base, 0, 0.09, 0.17));
            } else {
                paint('armor', 'armor', bx(0.36, 0.13, 0.37, base, s * 0.03, 0.16, 0));
                paint('armor', 'armor', bx(0.07, 0.22, 0.3, base, s * 0.2, 0.02, 0));
            }
        }
        const dog = child('dog');
        if (parts.dog === 'packs') for (const s of [-1, 1]) {
            fixed('dog', C.strap, bx(0.17, 0.23, 0.3, dog, s * 0.24, 0.63, 0.0));
            paint('dog', 'armor', bx(0.18, 0.06, 0.32, dog, s * 0.24, 0.75, 0.0));
            fixed('dog', C.steel, bx(0.03, 0.06, 0.08, dog, s * 0.34, 0.65, 0.0));
        } else if (parts.dog === 'guard') {
            paint('dog', 'armor', bx(0.43, 0.1, 0.5, dog, 0, 0.85, -0.02));
            for (const s of [-1, 1]) fixed('dog', C.strap, bx(0.05, 0.1, 0.48, dog, s * 0.14, 0.91, -0.02));
            paint('dog', 'lights', bx(0.08, 0.025, 0.08, dog, 0, 0.91, -0.12));
        }
    } else if (charId === 'captain') {
        if (parts.shoulders !== 'classic') for (const s of [-1, 1]) {
            const base = at('armor', s * 0.42, 2.16);
            if (parts.shoulders === 'layered') {
                for (const x of [-0.09, 0.09]) paint('shoulders', 'armor', bx(0.16, 0.1, 0.38, base, x, 0.19, 0));
                fixed('shoulders', C.steel, bx(0.22, 0.035, 0.04, base, 0, 0.14, 0.22));
            } else {
                paint('shoulders', 'armor', bx(0.42, 0.14, 0.46, base, s * 0.025, 0.2, 0));
                fixed('shoulders', C.darkSteel, bx(0.06, 0.25, 0.35, base, s * 0.23, 0.02, 0));
            }
        }
        if (parts.vest === 'ribbed') for (const y of [1.9, 1.99, 2.08]) {
            fixed('vest', C.darkSteel, bx(0.4, 0.045, 0.05, R, 0, y, 0.39));
        } else if (parts.vest === 'radio') {
            fixed('vest', C.darkSteel, bx(0.15, 0.23, 0.1, R, 0.17, 1.99, 0.39));
            paint('vest', 'lights', bx(0.09, 0.06, 0.025, R, 0.17, 2.03, 0.455));
            fixed('vest', C.steel, bx(0.025, 0.25, 0.025, R, 0.21, 2.18, 0.4, [0, 0, -0.12]));
        }
    } else if (charId === 'survivor') {
        if (parts.bandana === 'folded') for (const y of [2.3, 2.36, 2.42]) {
            fixed('bandana', '#45423c', bx(0.28, 0.025, 0.025, R, 0, y, 0.215, [0, 0, 0.06]));
        } else if (parts.bandana === 'tails') {
            // The ties must hang outside the radio pack and its optional cage, not inside either.
            fixed('bandana', '#2b2a28', bx(0.15, 0.09, 0.08, R, 0, 2.34, -0.32));
            fixed('bandana', '#2b2a28', bx(0.14, 0.1, 0.2, R, 0, 2.27, -0.4, [-0.35, 0, 0]));
            for (const [x, h, tilt] of [[-0.12, 0.35, -0.15], [0.12, 0.48, 0.18]])
                fixed('bandana', '#2b2a28', bx(0.07, h, 0.04, R, x, 2.23 - h / 2, -0.5, [0, 0, tilt]));
        }
        if (parts.radio === 'dual') {
            fixed('radio', C.steel, cy(0.025, 0.025, 0.72, 5, R, 0.14, 2.4, -0.34, [0, 0, -0.12]));
            paint('radio', 'armor', bx(0.1, 0.1, 0.09, R, 0.14, 2.06, -0.34));
            paint('radio', 'lights', bx(0.08, 0.04, 0.02, R, 0.14, 2.02, -0.445));
        } else if (parts.radio === 'caged') {
            for (const s of [-1, 1]) fixed('radio', C.steel, bx(0.045, 0.52, 0.05, R, s * 0.22, 1.86, -0.43));
            for (const y of [1.63, 2.09]) fixed('radio', C.steel, bx(0.48, 0.045, 0.05, R, 0, y, -0.43));
            paint('radio', 'armor', bx(0.32, 0.08, 0.05, R, 0, 1.76, -0.46));
        }
    } else if (charId === 'xeno') {
        const head = child('scanHead');
        if (parts.probe === 'twin') {
            paint('probe', 'gear', bx(0.24, 0.09, 0.1, head, 0, 0.05, 0.15));
            for (const s of [-1, 1]) {
                fixed('probe', C.darkSteel, cy(0.085, 0.085, 0.06, 8, head, s * 0.07, 0.05, 0.22, front));
                paint('probe', 'lights', cy(0.055, 0.055, 0.025, 8, head, s * 0.07, 0.05, 0.26, front));
            }
        } else if (parts.probe === 'shield') {
            for (const s of [-1, 1]) paint('probe', 'gear', bx(0.045, 0.2, 0.27, head, s * 0.11, 0, 0.08));
            fixed('probe', C.steel, bx(0.25, 0.04, 0.05, head, 0, 0.1, 0.2));
            fixed('probe', C.steel, bx(0.25, 0.04, 0.05, head, 0, -0.1, 0.2));
        }
        if (parts.jacket === 'collar') for (const s of [-1, 1]) {
            paint('jacket', 'coat', bx(0.14, 0.3, 0.14, R, s * 0.21, 2.25, 0.08, [0, s * 0.45, s * 0.18]));
            paint('jacket', 'shirt', bx(0.035, 0.23, 0.025, R, s * 0.19, 2.25, 0.18, [0, 0, s * 0.2]));
        } else if (parts.jacket === 'pockets') for (const s of [-1, 1]) {
            paint('jacket', 'coat', bx(0.15, 0.2, 0.1, R, s * 0.2, 1.75, 0.27));
            paint('jacket', 'shirt', bx(0.12, 0.03, 0.025, R, s * 0.2, 1.81, 0.335));
            fixed('jacket', '#c9a24a', bx(0.035, 0.035, 0.025, R, s * 0.2, 1.75, 0.335));
        }
    }
}
