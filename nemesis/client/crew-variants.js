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

    if (charId === 'ceo') {
        if (parts.collar === 'trim') for (const s of [-1, 1]) {
            fixed('collar', '#c9c3a6', bx(0.055, 0.28, 0.045, R, s * 0.2, 2.27, 0.18, [0, 0, s * 0.25]));
            fixed('collar', '#c9c3a6', bx(0.05, 0.14, 0.26, R, s * 0.24, 2.36, -0.04));
        } else if (parts.collar === 'high') for (const s of [-1, 1]) {
            paint('collar', 'coat', bx(0.08, 0.32, 0.3, R, s * 0.25, 2.33, -0.05, [0, 0, s * 0.13]));
            fixed('collar', '#c9c3a6', bx(0.09, 0.035, 0.3, R, s * 0.25, 2.49, -0.05));
        }
        const robot = child('robot');
        if (parts.robot === 'sensor') {
            paint('robot', 'robot', bx(0.34, 0.12, 0.1, robot, 0, 2.63, 0.2));
            for (const s of [-1, 1]) {
                fixed('robot', C.darkSteel, cy(0.1, 0.1, 0.06, 8, robot, s * 0.11, 2.63, 0.27, front));
                paint('robot', 'lights', cy(0.07, 0.07, 0.02, 8, robot, s * 0.11, 2.63, 0.31, front));
            }
        } else if (parts.robot === 'armored') {
            for (const s of [-1, 1]) {
                paint('robot', 'robot', bx(0.34, 0.12, 0.38, robot, s * 0.43, 2.43, 0));
                fixed('robot', C.steel, bx(0.08, 0.18, 0.32, robot, s * 0.6, 2.33, 0));
            }
            paint('robot', 'robot', bx(0.42, 0.19, 0.08, robot, 0, 2.0, 0.28));
        }
    } else if (charId === 'android') {
        if (parts.implants === 'temples') for (const s of [-1, 1]) {
            fixed('implants', C.steel, cy(0.12, 0.12, 0.07, 8, R, s * 0.22, 2.48, 0.06, [0, 0, Math.PI / 2]));
            paint('implants', 'lights', cy(0.065, 0.065, 0.025, 8, R, s * 0.265, 2.48, 0.06, [0, 0, Math.PI / 2]));
        } else if (parts.implants === 'jaw') for (const s of [-1, 1]) {
            fixed('implants', C.steel, bx(0.055, 0.17, 0.16, R, s * 0.17, 2.33, 0.12, [0, s * 0.2, 0]));
            paint('implants', 'lights', bx(0.025, 0.09, 0.025, R, s * 0.17, 2.34, 0.21));
        }
        if (parts.vest === 'lapels') for (const s of [-1, 1]) {
            paint('vest', 'vest', bx(0.12, 0.36, 0.06, R, s * 0.16, 1.97, 0.25, [0, 0, s * 0.23]));
            fixed('vest', C.steel, bx(0.035, 0.035, 0.025, R, s * 0.13, 1.85, 0.29));
        } else if (parts.vest === 'pockets') for (const s of [-1, 1]) {
            paint('vest', 'vest', bx(0.15, 0.15, 0.08, R, s * 0.14, 1.78, 0.25));
            paint('vest', 'shirt', bx(0.12, 0.03, 0.025, R, s * 0.14, 1.82, 0.3));
        }
    } else if (charId === 'convict') {
        if (parts.muzzle === 'vents') {
            fixed('muzzle', C.darkSteel, cy(0.15, 0.15, 0.09, 8, R, 0, 2.32, 0.27, front));
            paint('muzzle', 'mask', cy(0.1, 0.1, 0.025, 8, R, 0, 2.32, 0.33, front));
            fixed('muzzle', C.steel, bx(0.08, 0.025, 0.02, R, 0, 2.32, 0.35));
        } else if (parts.muzzle === 'guard') {
            for (const s of [-1, 1]) {
                paint('muzzle', 'mask', bx(0.06, 0.2, 0.1, R, s * 0.19, 2.34, 0.2));
                fixed('muzzle', C.steel, bx(0.035, 0.15, 0.04, R, s * 0.16, 2.34, 0.27));
            }
            fixed('muzzle', C.steel, bx(0.32, 0.04, 0.04, R, 0, 2.25, 0.25));
        }
        if (parts.plates === 'shoulder') for (const s of [-1, 1]) {
            const base = at('mask', s * 0.354, 2.14);
            paint('plates', 'mask', bx(0.29, 0.12, 0.34, base, 0, 0.1, 0));
            fixed('plates', C.steel, bx(0.05, 0.04, 0.05, base, s * 0.09, 0.17, 0.1));
        } else if (parts.plates === 'asymmetric') {
            paint('plates', 'mask', bx(0.18, 0.3, 0.06, R, 0.18, 1.83, 0.22, [0, 0, -0.22]));
            for (const y of [1.74, 1.89]) fixed('plates', C.steel, cy(0.04, 0.04, 0.025, 6, R, 0.2, y, 0.26, front));
            const base = at('mask', -0.354, 2.14);
            paint('plates', 'mask', bx(0.27, 0.12, 0.34, base, -0.03, 0.1, 0));
        }
        if (parts.chains === 'heavy') for (const s of [-1, 1]) {
            const cuff = at('chains', s * 0.46, 1.12);
            paint('chains', 'chains', bx(0.24, 0.14, 0.23, cuff, 0, 0, 0));
            fixed('chains', C.darkSteel, bx(0.1, 0.05, 0.025, cuff, 0, 0, 0.13));
        } else if (parts.chains === 'links') {
            const g = group('chains');
            for (let i = 0; i < 5; i++) {
                const x = (i - 2) * 0.1, y = 1.02 - (2 - Math.abs(i - 2)) * 0.035;
                paint('chains', 'chains', bx(0.1, 0.07, 0.05, g, x, y, 0.12, [0, 0, (i % 2 ? 0.35 : -0.35)]));
            }
        }
    } else if (charId === 'psych') {
        if (parts.headset === 'dual') for (const s of [-1, 1]) {
            paint('headset', 'drone', bx(0.09, 0.16, 0.16, R, s * 0.23, 2.47, 0.04));
            paint('headset', 'lights', cy(0.06, 0.06, 0.025, 8, R, s * 0.23, 2.5, 0.14, front));
        } else if (parts.headset === 'sensor') {
            paint('headset', 'drone', bx(0.08, 0.2, 0.13, R, 0.23, 2.49, 0.02));
            fixed('headset', C.steel, bx(0.035, 0.035, 0.25, R, 0.23, 2.56, 0.15));
            paint('headset', 'lights', cy(0.09, 0.09, 0.04, 8, R, 0.23, 2.56, 0.29, front));
        }
        if (parts.drones !== 'classic') for (const d of R.getChildren().filter(n => n.name === 'drone')) {
            if (parts.drones === 'rotors') for (const s of [-1, 1]) {
                paint('drones', 'drone', cy(0.19, 0.19, 0.035, 8, d, s * 0.3, 0.12, 0));
                fixed('drones', C.darkSteel, bx(0.15, 0.025, 0.035, d, s * 0.3, 0.15, 0));
            } else {
                for (const s of [-1, 1]) {
                    fixed('drones', C.steel, bx(0.025, 0.22, 0.025, d, s * 0.15, 0.18, -0.03, [0, 0, -s * 0.2]));
                    paint('drones', 'lights', sp(0.06, 6, d, s * 0.17, 0.3, -0.03));
                }
                paint('drones', 'drone', bx(0.2, 0.08, 0.12, d, 0, -0.08, 0.14));
                paint('drones', 'lights', bx(0.1, 0.03, 0.025, d, 0, -0.08, 0.215));
            }
        }
    } else if (charId === 'bounty') {
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
