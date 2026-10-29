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

    if (charId === 'soldier') {
        if (parts.helmet === 'braced') {
            paint('helmet', 'armor', bx(0.48, 0.06, 0.07, R, 0, 2.72, 0.29));
            for (const s of [-1, 1]) {
                paint('helmet', 'accent', bx(0.08, 0.12, 0.08, R, s * 0.24, 2.67, 0.26));
                fixed('helmet', C.steel, cy(0.045, 0.045, 0.025, 8, R, s * 0.24, 2.67, 0.31, front));
            }
        } else if (parts.helmet === 'caged') {
            paint('helmet', 'armor', bx(0.48, 0.07, 0.08, R, 0, 2.32, 0.27));
            for (const s of [-1, 1]) {
                paint('helmet', 'armor', bx(0.065, 0.39, 0.08, R, s * 0.28, 2.52, 0.23, [0, 0, s * 0.15]));
                paint('helmet', 'visor', bx(0.055, 0.07, 0.03, R, s * 0.28, 2.56, 0.29));
            }
        }
        if (parts.shoulders !== 'classic') for (const s of [-1, 1]) {
            const base = at('armor', s * 0.6, 2.12);
            if (parts.shoulders === 'layered') {
                for (const x of [-0.1, 0.1]) paint('shoulders', 'armor', bx(0.18, 0.1, 0.46, base, x, 0.23, 0));
                paint('shoulders', 'accent', bx(0.38, 0.045, 0.06, base, 0, 0.17, 0.27));
            } else {
                paint('shoulders', 'armor', bx(0.53, 0.15, 0.55, base, s * 0.035, 0.25, 0));
                paint('shoulders', 'accent', bx(0.06, 0.22, 0.45, base, s * 0.29, 0.06, 0));
            }
        }
        if (parts.pack === 'ribbed') for (const s of [-1, 1]) for (const y of [1.72, 2.08]) {
            paint('pack', 'accent', cy(0.19, 0.19, 0.06, 8, R, s * 0.18, y, -0.7));
        } else if (parts.pack === 'valves') for (const s of [-1, 1]) {
            fixed('pack', C.steel, cy(0.06, 0.06, 0.16, 8, R, s * 0.18, 2.43, -0.7));
            paint('pack', 'accent', bx(0.16, 0.04, 0.06, R, s * 0.18, 2.49, -0.7));
            fixed('pack', C.darkSteel, cy(0.13, 0.13, 0.04, 8, R, s * 0.18, 2.33, -0.77, front));
            paint('pack', 'visor', cy(0.07, 0.07, 0.02, 8, R, s * 0.18, 2.33, -0.8, front));
        }
    } else if (charId === 'scout') {
        const brace = at('jacket', -0.37, 1.44);
        if (parts.bracer === 'display') {
            paint('bracer', 'jacket', bx(0.23, 0.26, 0.06, brace, 0, 0, 0.15));
            paint('bracer', 'visor', bx(0.15, 0.16, 0.025, brace, 0, 0.025, 0.19));
            for (const x of [-0.06, 0, 0.06]) fixed('bracer', C.darkSteel, bx(0.035, 0.035, 0.02, brace, x, -0.09, 0.19));
        } else if (parts.bracer === 'cells') {
            for (let i = 0; i < 3; i++) {
                fixed('bracer', C.darkSteel, bx(0.19, 0.075, 0.09, brace, 0, -0.1 + i * 0.1, 0.16));
                paint('bracer', 'visor', bx(0.12, 0.035, 0.025, brace, 0, -0.1 + i * 0.1, 0.22));
            }
        }
        if (parts.vest === 'plated') for (const s of [-1, 1]) {
            paint('vest', 'jacket', bx(0.19, 0.17, 0.06, R, s * 0.115, 1.99, 0.3));
            fixed('vest', C.steel, bx(0.03, 0.03, 0.02, R, s * 0.16, 2.02, 0.34));
        } else if (parts.vest === 'pouches') {
            const g = group('vest');
            for (const s of [-1, 1]) {
                paint('vest', 'jacket', bx(0.16, 0.17, 0.11, g, s * 0.19, 1.54, 0.21));
                fixed('vest', C.strap, bx(0.17, 0.045, 0.12, g, s * 0.19, 1.59, 0.22));
            }
        }
    } else if (charId === 'mechanic') {
        if (parts.shield === 'framed') {
            for (const s of [-1, 1]) paint('shield', 'gloves', bx(0.06, 0.42, 0.05, R, s * 0.2, 2.44, 0.26));
            for (const y of [2.25, 2.64]) paint('shield', 'gloves', bx(0.43, 0.055, 0.06, R, 0, y, 0.26));
        } else if (parts.shield === 'twinlamp') {
            paint('shield', 'helmet', bx(0.38, 0.08, 0.08, R, 0, 2.7, 0.19));
            for (const s of [-1, 1]) {
                fixed('shield', C.darkSteel, cy(0.13, 0.13, 0.08, 8, R, s * 0.16, 2.7, 0.25, front));
                paint('shield', 'lights', cy(0.09, 0.09, 0.025, 8, R, s * 0.16, 2.7, 0.3, front));
            }
        }
        if (parts.belt === 'tools') {
            const g = group('belt');
            for (const [x, h] of [[-0.23, 0.32], [-0.1, 0.26], [0.21, 0.3]]) {
                fixed('belt', C.steel, bx(0.05, h, 0.07, g, x, 1.32, 0.25));
                fixed('belt', C.darkSteel, bx(0.09, 0.07, 0.08, g, x, 1.32 + h / 2, 0.25));
            }
        } else if (parts.belt === 'pouches') {
            const g = group('belt');
            for (const s of [-1, 1]) {
                paint('belt', 'gloves', bx(0.18, 0.22, 0.12, g, s * 0.24, 1.34, 0.24));
                paint('belt', 'helmet', bx(0.19, 0.05, 0.13, g, s * 0.24, 1.41, 0.24));
            }
        }
        if (parts.pack === 'ribbed') for (const x of [-0.14, 0.14]) for (const y of [1.74, 2.06]) {
            fixed('pack', C.darkSteel, cy(0.2, 0.2, 0.05, 8, R, x, y, -0.52));
        } else if (parts.pack === 'gauges') for (const x of [-0.14, 0.14]) {
            fixed('pack', C.steel, cy(0.055, 0.055, 0.13, 8, R, x, 2.17, -0.52));
            fixed('pack', C.darkSteel, cy(0.13, 0.13, 0.04, 8, R, x, 2.2, -0.59, front));
            paint('pack', 'lights', cy(0.075, 0.075, 0.02, 8, R, x, 2.2, -0.62, front));
        }
    } else if (charId === 'pilot') {
        if (parts.optics === 'round') {
            fixed('optics', C.darkSteel, cy(0.17, 0.17, 0.06, 10, R, 0.1, 2.48, 0.22, front));
            paint('optics', 'visor', cy(0.12, 0.12, 0.025, 10, R, 0.1, 2.48, 0.26, front));
        } else if (parts.optics === 'wide') {
            fixed('optics', C.darkSteel, bx(0.28, 0.11, 0.06, R, 0.025, 2.48, 0.22));
            paint('optics', 'visor', bx(0.23, 0.065, 0.025, R, 0.025, 2.48, 0.26));
        }
        if (parts.coat === 'lapels') for (const s of [-1, 1]) {
            fixed('coat', '#d9cdb0', bx(0.15, 0.35, 0.1, R, s * 0.19, 2.02, 0.25, [0, s * 0.15, -s * 0.25]));
        } else if (parts.coat === 'long') {
            const g = group('coat');
            for (const s of [-1, 1]) paint('coat', 'suit', bx(0.25, 0.38, 0.37, g, s * 0.17, 0.82, -0.04));
            fixed('coat', '#d9cdb0', bx(0.62, 0.1, 0.42, g, 0, 0.64, -0.04));
        }
    } else if (charId === 'hacker') {
        if (parts.hood === 'rimmed') {
            paint('hood', 'hood', bx(0.44, 0.08, 0.12, R, 0, 2.72, 0.16));
            for (const s of [-1, 1]) paint('hood', 'hood', bx(0.07, 0.35, 0.11, R, s * 0.21, 2.52, 0.16, [0, 0, -s * 0.08]));
        } else if (parts.hood === 'long') {
            const g = group('hood');
            paint('hood', 'hood', bx(0.44, 0.55, 0.1, g, 0, 2.13, -0.27));
            for (const s of [-1, 1]) paint('hood', 'hood', bx(0.1, 0.34, 0.12, g, s * 0.2, 1.94, -0.27, [0, 0, s * 0.12]));
        }
        if (parts.mask === 'seams') {
            for (const s of [-1, 1]) paint('mask', 'lights', bx(0.025, 0.15, 0.025, R, s * 0.095, 2.38, 0.225, [0, 0, s * 0.22]));
            paint('mask', 'lights', bx(0.16, 0.025, 0.025, R, 0, 2.31, 0.225));
        } else if (parts.mask === 'vented') {
            fixed('mask', C.darkSteel, bx(0.18, 0.11, 0.05, R, 0, 2.37, 0.235));
            for (const x of [-0.06, 0, 0.06]) paint('mask', 'gear', bx(0.025, 0.09, 0.025, R, x, 2.37, 0.27));
        }
        if (parts.arms === 'ribbed') for (const s of [-1, 1]) {
            const arm = at('pants', s * 0.351, 1.44);
            for (const y of [-0.12, 0, 0.12]) fixed('arms', C.steel, bx(0.21, 0.05, 0.24, arm, 0, y, 0));
        } else if (parts.arms === 'terminal') {
            const arm = at('pants', -0.351, 1.44);
            fixed('arms', C.darkSteel, bx(0.23, 0.26, 0.08, arm, 0, 0.02, 0.14));
            paint('arms', 'lights', bx(0.16, 0.15, 0.02, arm, 0, 0.045, 0.19));
            for (const x of [-0.06, 0, 0.06]) paint('arms', 'gear', bx(0.035, 0.035, 0.02, arm, x, -0.065, 0.19));
        }
    } else if (charId === 'scientist') {
        // The original humanoid has already been lowered 0.62 into the powered wheelchair.
        if (parts.goggles === 'round') for (const s of [-1, 1]) {
            fixed('goggles', C.darkSteel, cy(0.14, 0.14, 0.05, 8, R, s * 0.08, 2.0, 0.2, front));
            paint('goggles', 'lights', cy(0.095, 0.095, 0.02, 8, R, s * 0.08, 2.0, 0.235, front));
        } else if (parts.goggles === 'visor') {
            fixed('goggles', C.darkSteel, bx(0.34, 0.08, 0.06, R, 0, 2.02, 0.2));
            fixed('goggles', C.glass, bx(0.29, 0.12, 0.025, R, 0, 1.96, 0.24), { alpha: 0.65, spec: 0.8 });
        }
        if (parts.chair === 'spoked') for (const s of [-1, 1]) {
            const wheel = R.getChildren().find(m => m.name === 'wheel' && Math.abs(m.position.x - s * 0.47) < 0.01 && Math.abs(m.position.y - 0.5) < 0.01);
            const y = -s * 0.17; // wheel's local Y axis is rotated outwards
            fixed('chair', C.steel, bx(0.34, 0.035, 0.045, wheel, 0, y, 0));
            fixed('chair', C.steel, bx(0.045, 0.035, 0.34, wheel, 0, y, 0));
            paint('chair', 'lights', cy(0.09, 0.09, 0.04, 8, wheel, 0, y, 0));
        } else if (parts.chair === 'guards') for (const s of [-1, 1]) {
            const g = group('chair');
            fixed('chair', C.darkSteel, bx(0.08, 0.5, 0.52, g, s * 0.62, 0.52, -0.14));
            fixed('chair', C.steel, bx(0.12, 0.08, 0.6, g, s * 0.61, 0.8, -0.14));
            paint('chair', 'lights', bx(0.025, 0.06, 0.24, g, s * 0.67, 0.65, 0.02));
        }
        if (parts.tablet === 'panel') {
            const g = group('tablet');
            fixed('tablet', C.darkSteel, bx(0.42, 0.045, 0.28, g, -0.38, 0.68, 0.18, [0.5, 0, 0]));
            paint('tablet', 'lights', bx(0.32, 0.018, 0.2, g, -0.38, 0.71, 0.18, [0.5, 0, 0]));
        } else if (parts.tablet === 'scanner') {
            const g = group('tablet');
            fixed('tablet', C.darkSteel, bx(0.12, 0.1, 0.18, g, -0.49, 0.7, 0.26));
            paint('tablet', 'lights', cy(0.08, 0.08, 0.03, 8, g, -0.49, 0.72, 0.36, front));
            fixed('tablet', C.steel, bx(0.24, 0.035, 0.04, g, -0.37, 0.72, 0.12));
        }
    } else if (charId === 'medic') {
        if (parts.mask === 'filters') for (const s of [-1, 1]) {
            fixed('mask', C.darkSteel, cy(0.17, 0.17, 0.09, 8, R, s * 0.14, 2.32, 0.25, front));
            fixed('mask', C.steel, cy(0.12, 0.12, 0.025, 8, R, s * 0.14, 2.32, 0.31, front));
        } else if (parts.mask === 'valve') {
            fixed('mask', C.darkSteel, cy(0.16, 0.16, 0.09, 8, R, 0, 2.33, 0.25, front));
            paint('mask', 'cap', cy(0.11, 0.11, 0.03, 8, R, 0, 2.33, 0.31, front));
            for (const s of [-1, 1]) fixed('mask', C.steel, bx(0.08, 0.04, 0.03, R, s * 0.12, 2.36, 0.245));
        }
        if (parts.kit === 'pouch') {
            const g = group('kit');
            paint('kit', 'coat', bx(0.22, 0.2, 0.12, g, 0.17, 1.43, 0.24));
            paint('kit', 'lights', bx(0.13, 0.035, 0.025, g, 0.17, 1.44, 0.315));
            paint('kit', 'lights', bx(0.035, 0.13, 0.025, g, 0.17, 1.44, 0.315));
        } else if (parts.kit === 'canisters') {
            const g = group('kit');
            for (const x of [-0.19, 0.19]) {
                paint('kit', 'coat', cy(0.13, 0.13, 0.24, 8, g, x, 1.42, 0.24));
                fixed('kit', C.steel, cy(0.14, 0.14, 0.04, 8, g, x, 1.55, 0.24));
                paint('kit', 'lights', bx(0.035, 0.1, 0.025, g, x, 1.42, 0.32));
            }
        }
    } else if (charId === 'janitor') {
        if (parts.beard === 'long') {
            paint('beard', 'hair', bx(0.27, 0.27, 0.1, R, 0, 2.09, 0.14));
            for (const s of [-1, 1]) paint('beard', 'hair', bx(0.06, 0.18, 0.08, R, s * 0.1, 1.98, 0.14, [0, 0, s * 0.12]));
        } else if (parts.beard === 'forked') for (const s of [-1, 1]) {
            paint('beard', 'hair', bx(0.12, 0.28, 0.1, R, s * 0.07, 2.08, 0.14, [0, 0, s * 0.16]));
            fixed('beard', C.strap, bx(0.13, 0.035, 0.11, R, s * 0.09, 1.97, 0.14));
        }
        if (parts.cap === 'banded') {
            paint('cap', 'cap', bx(0.38, 0.06, 0.4, R, 0, 2.62, 0.0));
            fixed('cap', C.darkSteel, bx(0.34, 0.025, 0.2, R, 0, 2.62, 0.25));
        } else if (parts.cap === 'lamp') {
            fixed('cap', C.darkSteel, bx(0.16, 0.1, 0.12, R, 0, 2.7, 0.16));
            paint('cap', 'lights', cy(0.1, 0.1, 0.035, 8, R, 0, 2.7, 0.23, front));
        }
        if (parts.vacuum === 'ribbed') for (const y of [1.58, 1.8, 2.0]) {
            fixed('vacuum', C.steel, cy(0.25, 0.25, 0.05, 8, R, 0, y, -0.34));
        } else if (parts.vacuum === 'twin') {
            fixed('vacuum', C.darkSteel, cy(0.17, 0.17, 0.48, 8, R, 0.17, 1.78, -0.37));
            for (const y of [1.54, 2.02]) fixed('vacuum', C.steel, cy(0.19, 0.19, 0.05, 8, R, 0.17, y, -0.37));
            paint('vacuum', 'lights', bx(0.05, 0.07, 0.025, R, 0.17, 1.88, -0.47));
        }
    } else if (charId === 'ceo') {
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
